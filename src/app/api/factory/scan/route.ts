// ══════════════════════════════════════════════════════════════
// Factory Engine 1: Research Scan API
// POST /api/factory/scan
// Takes keywords → scans DB for opportunities → returns ranked results
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { runResearchScan, runMultiKeywordScan, runAutoDiscovery } from "@/lib/factory-research";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { keywords, keyword } = body as { keywords?: string[]; keyword?: string };

    // Support both single keyword and array
    const keywordList = keywords || (keyword ? [keyword] : []);

    if (keywordList.length === 0) {
      return NextResponse.json({ error: "Missing keywords" }, { status: 400 });
    }

    if (keywordList.length === 1) {
      const result = runResearchScan(keywordList[0]);
      return NextResponse.json({
        success: true,
        scan: result,
        summary: {
          keyword: result.keyword,
          totalMatches: result.totalMatches,
          topListingsCount: result.topListings.length,
          recommendationCount: result.recommendations.length,
          topScore: result.topListings[0]?.score.overall || 0,
          avgPrice: result.patterns.commonPriceRange.avg,
        },
      });
    }

    // Multi-keyword scan
    const results = runMultiKeywordScan(keywordList);

    // Aggregate top recommendations across all scans
    const allRecs = results.flatMap((r) => r.recommendations);
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    allRecs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return NextResponse.json({
      success: true,
      scans: results,
      topRecommendations: allRecs.slice(0, 10),
      summary: {
        keywords: keywordList,
        totalScans: results.length,
        totalMatches: results.reduce((sum, r) => sum + r.totalMatches, 0),
        highPriorityCount: allRecs.filter((r) => r.priority === "high").length,
      },
    });
  } catch (err) {
    console.error("[Factory Scan]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 500 }
    );
  }
}

// GET /api/factory/scan — Auto-discover top opportunities (no input needed)
export async function GET() {
  try {
    const discovery = runAutoDiscovery();
    return NextResponse.json({
      success: true,
      discovery,
    });
  } catch (err) {
    console.error("[Factory Auto-Discover]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Discovery failed" },
      { status: 500 }
    );
  }
}
