// ══════════════════════════════════════════════════════════════════════
// Research — Anchor Coverage (sweep progress endpoint)
//
// GET /api/research/anchor-coverage
//   Returns, for the curated DIGITAL_ANCHORS catalog, which anchors
//   have at least one Marketplace Insights capture row in the DB and
//   the best (richest + freshest) capture data for each. The
//   AnchorSweepPanel in /research uses this to show:
//     • "X / 40 covered" progress
//     • per-anchor button state ("Search →" vs "✓ captured")
//     • inline metrics (volume, growth, competition) on covered anchors
//
// The endpoint is intentionally cheap — one indexed query against the
// existing etsy_insights_terms table, no external API calls.
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getAnchorCoverage } from "@/lib/db";
import { DIGITAL_ANCHORS, normalizeAnchorTerm } from "@/lib/digital-anchors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sinceHours = parseInt(req.nextUrl.searchParams.get("hours") || "2160", 10); // 90d default
  try {
    const anchors = DIGITAL_ANCHORS;
    const normalized = anchors.map((a) => normalizeAnchorTerm(a.term));
    const coverage = getAnchorCoverage(normalized, { sinceHours });

    // Merge anchor metadata back in (niche, factoryHint) for the UI.
    const merged = anchors.map((a, idx) => {
      const c = coverage[idx];
      return {
        term: a.term,
        normalized: c.normalized,
        niche: a.niche,
        factoryHint: a.factoryHint,
        covered: c.covered,
        capturedAt: c.capturedAt,
        monthlySearches: c.monthlySearches,
        growthPct: c.growthPct,
        searchResults: c.searchResults,
        captureType: c.captureType,
      };
    });

    const coveredCount = merged.filter((m) => m.covered).length;
    return NextResponse.json({
      success: true,
      total: anchors.length,
      covered: coveredCount,
      anchors: merged,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "coverage fetch failed" },
      { status: 500 },
    );
  }
}
