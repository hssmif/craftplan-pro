import { NextRequest, NextResponse } from "next/server";
import { fetchGoogleAutocomplete } from "@/lib/trend-sources";
import { searchEtsyListings } from "@/lib/etsy-research";
import { isTrademarked } from "@/lib/trademark-filter";

export const maxDuration = 15;
export const dynamic = "force-dynamic";
export const revalidate = 60;

/* ─────────────────────────────────────────────────────────────
 * GET /api/factory/autocomplete?q=<partial>
 *
 * Smart autocomplete for the Product Factory research input.
 * Mirrors the cross-stitch autocomplete but scoped to spreadsheet /
 * digital template keywords. Every suggestion is scored for
 * OPPORTUNITY (green/yellow/red) based on Etsy saturation.
 *
 * Flow:
 *   1. Google Autocomplete with "google sheets template" context
 *   2. Probe top 5 suggestions against Etsy (limit=1 count check)
 *   3. green < 500 listings, yellow < 5000, red ≥ 5000
 *   4. Return up to 8 items
 * ───────────────────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    if (q.length < 2) return NextResponse.json({ items: [] });

    // Add spreadsheet context so Google returns relevant suggestions
    const spreadsheetTerms = ["google sheets", "spreadsheet", "template", "planner", "tracker", "budget", "excel"];
    const hasContext = spreadsheetTerms.some((t) => q.toLowerCase().includes(t));
    const contextQuery = hasContext ? q : `${q} google sheets template`;

    const google = await fetchGoogleAutocomplete(contextQuery).catch(() => null);

    // Keep terms that are plausibly spreadsheet/planner related
    const relevantTerms = ["google sheets", "spreadsheet", "template", "planner", "tracker", "budget", "excel", "notion", "pdf", "printable", "digital", "download"];
    const rawTerms = (google?.items ?? [])
      .map((i) => i.term.trim())
      .filter((t) => {
        if (t.length < 3) return false;
        const lower = t.toLowerCase();
        // Keep if it has any spreadsheet-adjacent term OR if it's a direct extension of the user's query
        return relevantTerms.some((rt) => lower.includes(rt)) || lower.startsWith(q.toLowerCase().slice(0, 8));
      })
      .filter((t) => !isTrademarked(t))
      .slice(0, 8);

    if (rawTerms.length === 0) {
      return NextResponse.json({
        items: [
          {
            term: contextQuery,
            opportunity: "yellow",
            competition: "unknown",
            why: "live suggest unavailable",
          },
        ],
      });
    }

    // Probe Etsy in parallel for top 5
    const probeCount = Math.min(5, rawTerms.length);
    const probes = await Promise.all(
      rawTerms.slice(0, probeCount).map(async (term) => {
        try {
          const { total } = await searchEtsyListings(term, "score", 1);
          return { term, total };
        } catch {
          return { term, total: null };
        }
      }),
    );

    const items: {
      term: string;
      opportunity: "green" | "yellow" | "red";
      competition?: string;
      why?: string;
    }[] = [];

    for (const p of probes) {
      const words = p.term.split(/\s+/).filter(Boolean).length;
      // Short-tail penalty: 2–3 word terms understate saturation
      const shortTailBoost = words <= 3 ? 1.5 : 1;
      const adjusted = p.total != null ? p.total * shortTailBoost : null;

      let opp: "green" | "yellow" | "red";
      let why = "";
      if (adjusted == null) {
        opp = "yellow";
        why = "competition data unavailable";
      } else if (adjusted < 500) {
        opp = "green";
        why = "low competition — niche opportunity";
      } else if (adjusted < 5000) {
        opp = "yellow";
        why = "moderate competition";
      } else {
        opp = "red";
        why = "saturated market";
      }

      items.push({
        term: p.term,
        opportunity: opp,
        competition: p.total != null ? `${p.total.toLocaleString()} on Etsy` : "unknown",
        why,
      });
    }

    // Heuristic for un-probed suggestions
    for (const term of rawTerms.slice(probeCount)) {
      const words = term.split(/\s+/).filter(Boolean).length;
      items.push({
        term,
        opportunity: words >= 5 ? "green" : words >= 4 ? "yellow" : "red",
        competition: "est.",
        why: words >= 5 ? "long-tail — likely low competition" : "popular term",
      });
    }

    return NextResponse.json({ items });
  } catch (err) {
    console.error("[factory/autocomplete] failed:", err);
    return NextResponse.json(
      { items: [], error: err instanceof Error ? err.message : "autocomplete failed" },
      { status: 500 },
    );
  }
}
