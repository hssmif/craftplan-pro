// ══════════════════════════════════════════════════════════════
// Research — Extension Radar Feed
//
// POST /api/research/extension-feed
//   Receives { results: PodScanResult[], searchQuery, scannedAt, pageUrl }
//   from the Chrome extension while the user browses Etsy. Persists
//   each capture so the Research page can show real-time competitor
//   intelligence (ATC velocity, hot listings, shop concentration).
//
// GET /api/research/extension-feed
//   Returns recent captures + hot listings for the Research page.
//
// CORS: open to chrome-extension:// and localhost — these are the only
// origins that can reach this endpoint anyway thanks to the ext's
// host_permissions list.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { insertRadarCaptures, getRadarSummary, type RadarCapture } from "@/lib/db";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

interface IncomingResult {
  url?: string;
  title?: string;
  shopName?: string;
  price?: number;
  currency?: string;
  reviews?: number;
  rating?: number;
  isBestseller?: boolean;
  isEtsyPick?: boolean;
  imageUrl?: string;
  productType?: string;
  atcBadge?: string | null;
  atcCount?: number | null;
  atcTier?: "hot" | "warm" | "cold" | null;
  listingId?: string | null;
  isDigital?: boolean;
  podScore?: number;
  // ── Enrichment from SW listing-page fetch ──
  totalSales?: number | null;
  listingAgeDays?: number | null;
  viewsLast24h?: number | null;
  numFavorers?: number | null;
  cartCount?: number | null;
  shopTotalSales?: number | null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const results = (body.results ?? []) as IncomingResult[];
    const searchQuery: string | null = body.searchQuery ?? null;
    const pageUrl: string | null = body.pageUrl ?? null;
    const scannedAt: string = body.scannedAt ?? new Date().toISOString();

    const rows: Array<Omit<RadarCapture, "id" | "created_at">> = [];
    for (const r of results) {
      if (!r.listingId || !r.title) continue;
      rows.push({
        listing_id: r.listingId,
        title: r.title.slice(0, 500),
        shop_name: r.shopName?.slice(0, 200) ?? null,
        url: r.url ?? null,
        image_url: r.imageUrl ?? null,
        price: typeof r.price === "number" ? r.price : null,
        currency: r.currency ?? null,
        reviews: r.reviews ?? 0,
        rating: r.rating ?? 0,
        product_type: r.productType ?? null,
        is_bestseller: r.isBestseller ? 1 : 0,
        is_etsy_pick: r.isEtsyPick ? 1 : 0,
        is_digital: r.isDigital ? 1 : 0,
        atc_badge: r.atcBadge ?? null,
        atc_count: r.atcCount ?? null,
        atc_tier: r.atcTier ?? null,
        sales_estimate: null,
        search_query: searchQuery,
        page_url: pageUrl,
        scanned_at: scannedAt,
      });
    }

    const inserted = insertRadarCaptures(rows);
    return NextResponse.json(
      { success: true, captured: inserted },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "feed failed" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const sinceHours = parseInt(req.nextUrl.searchParams.get("hours") || "168", 10);
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "60", 10);
    const digitalOnly = req.nextUrl.searchParams.get("digital") === "1";
    const summary = getRadarSummary({ sinceHours, limit, digitalOnly });
    return NextResponse.json(
      { success: true, ...summary },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "feed failed" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
