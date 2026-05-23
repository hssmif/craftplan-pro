// ══════════════════════════════════════════════════════════════════════
// Research — Marketplace Insights Capture (extension → SQLite sink)
//
// POST /api/research/insights-capture
//   Body: { results: InsightTerm[], category?, sourcePage?, capturedAt? }
//   Sent by the Chrome extension while the user is on Etsy's
//   /your/shops/me/marketplace-insights page. Each result is a {term,
//   volumeText, thumbnailUrl} triple scraped from the rendered category
//   grid. We normalize, parse volumes ("170.9k" → 170900), and store
//   in `etsy_insights_terms` for time-series analysis + downstream
//   corroboration in market-pulse.
//
// GET /api/research/insights-capture
//   Returns the latest captured term-per-key + per-category counts +
//   most-recent timestamp. Used by /research UI to show data freshness
//   ("Marketplace Insights data is N hours old · refresh by opening
//   Etsy Insights").
//
// TOS POSTURE:
//   This endpoint NEVER fetches from etsy.com. It's a passive sink for
//   data the extension extracts from the user's own authenticated
//   browser session. Same risk model as the existing radar-feed.
//   The HARD RULE (no scraping etsy.com server-side, no spoofed UAs,
//   no risk to the seller account) is honored — all DOM reads happen
//   in the user's own Chrome process.
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import {
  buildInsightsTermRow,
  insertEtsyInsightsTerms,
  getEtsyInsightsSummary,
  updateInsightsClassification,
  type EtsyInsightsTerm,
} from "@/lib/db";
import { classifyHeuristic } from "@/lib/digital-classifier";

export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

interface IncomingInsightTerm {
  term?: string;
  volumeText?: string;     // "170.9k", "1.2M", "850"
  thumbnailUrl?: string;
  // Per-row category override (in case the extension sends mixed-category batches)
  category?: string;
  // ── Phase-6 detail-page fields ──
  /** "+12.4%", "-6.4%" — parsed into growth_pct on insert. */
  growthText?: string;
  /** "9.1M", "901.6k" — parsed into search_results on insert. */
  searchResultsText?: string;
  /** Origin tag. Defaults to "grid" if absent (back-compat with grid-only
   *  extension builds). */
  captureType?: "grid" | "detail-main" | "detail-related";
  /** For detail-related rows: the parent search term. */
  parentTerm?: string;
  /** For detail-main rows: 30-day daily series as
   *    [{date: "2026-04-19", searches: 1009, ma7: 1145}, ...] */
  dailySeries?: Array<{ date: string; searches: number; ma7?: number }>;
}

interface IncomingBody {
  /** Capture rows from one or more category panels. */
  results?: IncomingInsightTerm[];
  /** Active category at capture time (applied to all results that don't
   *  carry their own category field). Examples: "Accessories",
   *  "Art & Collectibles", "Weddings". */
  category?: string;
  /** URL of the dashboard page the data came from (audit / debug). */
  sourcePage?: string;
  /** ISO timestamp set by the extension at scrape time. If absent, we
   *  use server time. */
  capturedAt?: string;
}

export async function POST(req: NextRequest) {
  let body: IncomingBody;
  try {
    body = (await req.json()) as IncomingBody;
  } catch {
    return NextResponse.json(
      { error: "invalid JSON body" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const results = body.results ?? [];
  if (!Array.isArray(results) || results.length === 0) {
    return NextResponse.json(
      { error: "results array required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const defaultCategory = body.category?.trim() || null;
  const sourcePage = body.sourcePage?.trim() || null;
  const capturedAt = body.capturedAt || new Date().toISOString();

  // Build normalized rows. Skip any row missing a term — without that we
  // can't normalize or match anything downstream.
  const rows: Array<Omit<EtsyInsightsTerm, "id" | "created_at">> = [];
  for (const r of results) {
    if (!r.term || typeof r.term !== "string") continue;
    rows.push(
      buildInsightsTermRow({
        term: r.term,
        category: r.category || defaultCategory,
        volumeText: r.volumeText,
        thumbnailUrl: r.thumbnailUrl,
        sourcePage,
        capturedAt,
        // Phase-6 detail-page fields (all optional; grid captures omit them)
        growthText: r.growthText,
        searchResultsText: r.searchResultsText,
        captureType: r.captureType,
        parentTerm: r.parentTerm,
        dailySeries: r.dailySeries,
      }),
    );
  }

  try {
    const inserted = insertEtsyInsightsTerms(rows);

    // ── Phase-7b: heuristic classify on insert ──────────────────────
    // For each row, run the keyword heuristic. If it returns a confident
    // class, persist it via UPDATE (matches all rows with same
    // term_normalized so historical rows also get tagged). Ambiguous
    // terms (heuristic returns null) are left for the Gemini fallback
    // background job; market-pulse treats null as "mixed".
    //
    // We deliberately don't BLOCK the insert response on this — it's
    // a quick local update, but failures shouldn't fail the capture.
    let classified = 0;
    try {
      const seen = new Set<string>();
      for (const r of rows) {
        if (seen.has(r.term_normalized)) continue;
        seen.add(r.term_normalized);
        const c = classifyHeuristic(r.term);
        if (c) {
          updateInsightsClassification(r.term_normalized, c);
          classified += 1;
        }
      }
    } catch {
      /* classification is best-effort */
    }

    return NextResponse.json(
      {
        success: true,
        captured: inserted,
        skipped: results.length - inserted,
        classified,
        category: defaultCategory,
      },
      { headers: CORS_HEADERS },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "insert failed" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

export async function GET(req: NextRequest) {
  const sinceHours = parseInt(req.nextUrl.searchParams.get("hours") || "720", 10);
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "200", 10);
  const category = req.nextUrl.searchParams.get("category") || undefined;
  try {
    const summary = getEtsyInsightsSummary({ sinceHours, limit, category });
    return NextResponse.json(
      { success: true, ...summary },
      { headers: CORS_HEADERS },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "summary failed" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
