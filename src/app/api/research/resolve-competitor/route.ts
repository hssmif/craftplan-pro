// ══════════════════════════════════════════════════════════════════════
// Research — Resolve Competitor (for "Build This" → Factory deep-scan)
//
// Sits between /research and /factory. Given either:
//   • POST { listingId: "1234567890" }
//       → fetches the full Etsy v3 listing detail (description + up to 8
//         full-res image URLs + tags + price + shop + reviews)
//   • POST { keyword: "digital planner" }
//       → searches Etsy v3 for the top-scoring listing on this keyword
//         and resolves THAT listing's full detail
//
// Returns a CompetitorPayload ready to drop into the factory bridge
// sessionStorage payload. The factory's competitor-deep-scan engine
// reads `imageUrls` with Gemini Vision to extract feature manifests.
//
// Why this exists as a server route:
//   • Etsy v3 client ID lives in ETSY_CLIENT_ID env var (server-only)
//   • Bridge runs in the browser — can't reach Etsy directly
//   • Caches by listingId for 1h (subsequent clicks on the same idea
//     skip the round-trip)
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { fetchEtsyListingDetail, searchEtsyListings } from "@/lib/etsy-research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CompetitorPayload {
  listingId: string;
  title: string;
  description: string;
  tags: string[];
  price: number;
  imageUrls: string[];
  listingUrl: string;
  seller: string;
  reviewCount: number;
}

// In-process LRU-ish cache. Keyed by listingId. 1h TTL.
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE = new Map<string, { ts: number; data: CompetitorPayload }>();

export async function POST(req: NextRequest) {
  let body: { listingId?: string; keyword?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { listingId, keyword } = body;
  if (!listingId && !keyword) {
    return NextResponse.json(
      { error: "must provide listingId or keyword" },
      { status: 400 },
    );
  }

  try {
    // ── Path 1: direct listing-id resolution ────────────────────────
    if (listingId) {
      const cached = CACHE.get(listingId);
      if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return NextResponse.json(
          { competitor: cached.data, cached: true },
          { headers: { "X-Cache": "HIT" } },
        );
      }
      const detail = await fetchEtsyListingDetail(listingId);
      const competitor: CompetitorPayload = {
        listingId: detail.listingId,
        title: detail.title,
        description: detail.description,
        tags: detail.tags,
        price: detail.price,
        imageUrls: detail.imageUrls,
        listingUrl: detail.listingUrl,
        seller: detail.shopName,
        reviewCount: detail.reviewCount,
      };
      CACHE.set(listingId, { ts: Date.now(), data: competitor });
      return NextResponse.json(
        { competitor, cached: false },
        { headers: { "X-Cache": "MISS" } },
      );
    }

    // ── Path 2: keyword → top listing → full detail ─────────────────
    // Used by /research/ideas when an idea has no direct Etsy evidence
    // attached but we still want to clone-and-beat a real competitor.
    // Always grabs the highest-scoring listing on the keyword.
    const search = await searchEtsyListings(keyword!, "score", 1);
    const top = search.listings[0];
    if (!top) {
      return NextResponse.json(
        { error: `no Etsy listings found for keyword "${keyword}"` },
        { status: 404 },
      );
    }
    // Cache by listing_id to share across keyword-vs-id calls for the
    // same listing.
    const cached = CACHE.get(top.listing_id);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return NextResponse.json(
        { competitor: cached.data, cached: true, resolvedVia: "keyword" },
        { headers: { "X-Cache": "HIT" } },
      );
    }
    const detail = await fetchEtsyListingDetail(top.listing_id);
    const competitor: CompetitorPayload = {
      listingId: detail.listingId,
      title: detail.title,
      description: detail.description,
      tags: detail.tags,
      price: detail.price,
      imageUrls: detail.imageUrls,
      listingUrl: detail.listingUrl,
      seller: detail.shopName,
      reviewCount: detail.reviewCount,
    };
    CACHE.set(top.listing_id, { ts: Date.now(), data: competitor });
    return NextResponse.json(
      { competitor, cached: false, resolvedVia: "keyword" },
      { headers: { "X-Cache": "MISS" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "resolve failed" },
      { status: 500 },
    );
  }
}
