import { NextRequest, NextResponse } from "next/server";
import { fetchGoogleAutocomplete } from "@/lib/trend-sources";
import { searchEtsyListings } from "@/lib/etsy-research";
import { isTrademarked } from "@/lib/trademark-filter";

export const maxDuration = 15;
export const dynamic = "force-dynamic";
// Cache is OK here — same query within 60 seconds can reuse. If stale
// the client will still get fresh data on the next debounce-tick.
export const revalidate = 60;

/* ─────────────────────────────────────────────────────────────
 * GET /api/cross-stitch/autocomplete?q=<partial>
 *
 * Smart autocomplete for the Research page search input. Not a
 * simple "what people are searching" list — every suggestion is
 * scored for OPPORTUNITY (low competition + demand) so the user
 * sees green/yellow/red dots next to each term.
 *
 * Flow:
 *   1. Google Autocomplete with cross-stitch context
 *   2. For top 5 suggestions, hit Etsy with limit=1 (cheap total-
 *      count probe, not full listing fetch)
 *   3. opportunity = green if total < 500, yellow if < 5000,
 *      red otherwise. Short-tail terms (< 3 words) get penalized
 *      because they're always more saturated than they look.
 *   4. Return up to 8 items; first 5 have real competition data,
 *      the rest get a term-length heuristic so dropdown stays
 *      fast (no 8-way Etsy fan-out per keystroke).
 * ───────────────────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    if (q.length < 2) return NextResponse.json({ items: [] });

    // Ensure "cross stitch" context so we get craft-specific suggestions
    // instead of generic top-of-mind Google completions.
    const contextQuery = q.toLowerCase().includes("cross stitch") ? q : `${q} cross stitch`;

    const google = await fetchGoogleAutocomplete(contextQuery).catch(() => null);
    const rawTerms = (google?.items ?? [])
      .map((i) => i.term.trim())
      .filter((t) => t.length >= 3 && t.toLowerCase().includes("cross stitch"))
      // IP gate: drop trademarked suggestions entirely. Surfacing
      // "pokemon cross stitch" as autocomplete nudges sellers toward
      // a shop-banning listing.
      .filter((t) => !isTrademarked(t))
      .slice(0, 8);

    if (rawTerms.length === 0) {
      // Fallback: synthesize a few variations from the user's input so the
      // dropdown never feels empty on slow Google Suggest responses.
      return NextResponse.json({
        items: [
          { term: contextQuery, opportunity: "yellow", competition: "unknown", why: "live suggest unavailable" },
        ],
      });
    }

    // Probe Etsy in parallel for the top 5 (balance speed vs data quality).
    // The remaining 3 get a heuristic based on term length only.
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

    const items: { term: string; opportunity: "green" | "yellow" | "red"; competition?: string; why?: string }[] = [];

    for (const p of probes) {
      const words = p.term.split(/\s+/).filter(Boolean).length;
      // Short-tail penalty: 2–3 word terms are always more saturated than
      // the raw count suggests, because they're generic landing terms.
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

    // Heuristic for the un-probed suggestions: long-tail terms (4+ words)
    // get optimistic green, shorter default to yellow.
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
    console.error("[autocomplete] failed:", err);
    return NextResponse.json({ items: [], error: err instanceof Error ? err.message : "autocomplete failed" }, { status: 500 });
  }
}
