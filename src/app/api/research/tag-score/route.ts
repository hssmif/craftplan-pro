// ══════════════════════════════════════════════════════════════
// Tag Score — competition lookup for a single tag
//
// GET /api/research/tag-score?tag=<term>
//   → { tag, count }   where count = total Etsy listings using
//                       this tag/keyword. Lower = less saturated.
//
// Used by the in-page Tag Analyzer panel (Chrome extension)
// to color tags as low / medium / high competition.
//
// Path: Etsy v3 search API (sanctioned). Cached 1h per tag in
// process memory because tag counts barely move.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { searchEtsyListings } from "@/lib/etsy-research";

export const maxDuration = 15;

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = new Map<string, { count: number; t: number }>();

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const tag = (req.nextUrl.searchParams.get("tag") || "").trim().toLowerCase();
  if (!tag || tag.length < 2 || tag.length > 60) {
    return NextResponse.json({ error: "tag (2-60 chars) required" }, { status: 400, headers: CORS_HEADERS });
  }

  // Cache hit?
  const hit = cache.get(tag);
  if (hit && Date.now() - hit.t < CACHE_TTL_MS) {
    return NextResponse.json(
      { tag, count: hit.count, cached: true },
      { headers: CORS_HEADERS }
    );
  }

  try {
    // Use Etsy v3 search — only need the `count` field, request just 1 listing
    const result = await searchEtsyListings(tag, "score", 1);
    const count = result.total ?? 0;
    cache.set(tag, { count, t: Date.now() });
    return NextResponse.json(
      { tag, count, cached: false },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "score lookup failed", tag, count: null },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
