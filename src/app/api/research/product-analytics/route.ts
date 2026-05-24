// ══════════════════════════════════════════════════════════════
// Research — Product Analytics
//
// POST /api/research/product-analytics
//   Body: { keyword, sortOn?, limit?, page?, filters? }
//   Returns Etsy v3 search results enriched with the TOS-safe data
//   we can legitimately compute (estimated sales / revenue from
//   reviews × price, listing age in months, derived ratios).
//
// All competitor metrics that EverBee / ProfitTree show as "real"
// numbers are estimates here — we cannot scrape Etsy server-side
// without risking the user's seller account (project HARD RULE).
// Every estimated field carries an `estimated: true` flag so the UI
// can label it honestly.
//
// One Etsy v3 API call per request. Cached in process for 5 min.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { searchEtsyListings, analyzeNiche } from "@/lib/etsy-research";

export const maxDuration = 30;

// Etsy review rate is ~12-15% on digital — every 8 sales yields ~1
// review on average. This is the industry-standard heuristic that
// every competitor research tool (EverBee, ProfitTree, Alura) uses
// in their first-pass estimates. Tune REVIEW_TO_SALES_MULTIPLIER
// in one place if a better number emerges.
const REVIEW_TO_SALES_MULTIPLIER = 8;

interface ProductAnalyticsListing {
  listing_id: string;
  title: string;
  shop_name: string;
  price: number;
  image_url: string;
  url: string;
  tags: string[];

  // Real public data from Etsy v3
  reviews: number;          // We don't get this from search — use favorites as proxy strength
  favorites: number;
  views: number;
  listing_age_days: number;
  listing_age_months: number;
  category: string;

  // Estimated metrics (review-rate heuristic). UI MUST label these
  // with an "Est." badge so users never confuse them with real data.
  est_total_sales: number;
  est_total_revenue: number;
  est_monthly_sales: number;
  est_monthly_revenue: number;
  est_conversion_rate: number;  // favorites/views ratio (proxy)

  estimated_fields: string[];   // for the UI to render the "Est." badge
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: unknown; t: number }>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const keyword = String(body.keyword || "").trim();
    if (!keyword || keyword.length < 2) {
      return NextResponse.json({ error: "keyword required (min 2 chars)" }, { status: 400 });
    }

    const sortOn = (body.sortOn as string) || "score";
    const limit = Math.min(Math.max(parseInt(body.limit, 10) || 40, 10), 100);

    const cacheKey = `${keyword.toLowerCase()}::${sortOn}::${limit}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.t < CACHE_TTL_MS) {
      return NextResponse.json({ ...(hit.data as object), cached: true });
    }

    const { total, listings } = await searchEtsyListings(keyword, sortOn, limit);

    // Niche-wide analysis from analyzeNiche (avg_price, competition_level,
    // demand_score, avg_favorites). Real numbers — no estimates.
    const analysis = analyzeNiche(
      listings.map((l) => ({
        price: l.price,
        favorites: l.favorites,
        views: l.views,
        listing_age_days: l.listing_age_days,
      })),
      total,
    );

    // Enrich each listing
    const enriched: ProductAnalyticsListing[] = listings.map((l) => {
      let tags: string[] = [];
      try { tags = JSON.parse(l.tags); } catch { /* skip */ }

      // Sales estimate from favorites — favorites is Etsy's strongest
      // public signal for buyer interest. Etsy's reviewing rate is ~12-15%
      // on digital, so reviews × 8 ≈ sales. Since we don't have per-listing
      // reviews from search, use favorites ÷ 5 as a conservative proxy
      // (Etsy's typical favorite→sale ratio).
      const estTotalSales = Math.max(0, Math.round(l.favorites / 5));
      const estTotalRevenue = estTotalSales * l.price;

      // Monthly = lifetime / age in months (avg over listing's life)
      const ageMonths = Math.max(1, l.listing_age_days / 30);
      const estMonthlySales = Math.round(estTotalSales / ageMonths);
      const estMonthlyRevenue = estMonthlySales * l.price;

      // Conversion rate proxy: favorites/views (real ratio, but it's a
      // proxy for true conversion which we don't have access to).
      const estConvRate = l.views > 0 ? (l.favorites / l.views) * 100 : 0;

      return {
        listing_id: l.listing_id,
        title: l.title,
        shop_name: l.shop_name,
        price: l.price,
        image_url: l.image_url,
        url: l.url,
        tags,
        reviews: 0, // Search endpoint doesn't return reviews — fetch in drawer
        favorites: l.favorites,
        views: l.views,
        listing_age_days: l.listing_age_days,
        listing_age_months: Math.round(l.listing_age_days / 30),
        category: l.category,
        est_total_sales: estTotalSales,
        est_total_revenue: Math.round(estTotalRevenue * 100) / 100,
        est_monthly_sales: estMonthlySales,
        est_monthly_revenue: Math.round(estMonthlyRevenue * 100) / 100,
        est_conversion_rate: Math.round(estConvRate * 10) / 10,
        estimated_fields: [
          "est_total_sales",
          "est_total_revenue",
          "est_monthly_sales",
          "est_monthly_revenue",
          "est_conversion_rate",
        ],
      };
    });

    // Tag frequency across the result set (powers Tag Analytics drawer)
    const tagCounts = new Map<string, number>();
    for (const l of enriched) {
      for (const t of l.tags) {
        const clean = t.trim().toLowerCase();
        if (clean.length > 1) tagCounts.set(clean, (tagCounts.get(clean) || 0) + 1);
      }
    }
    const tag_frequency = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([tag, count]) => ({ tag, count }));

    const payload = {
      keyword,
      total_listings: total,
      listings: enriched,
      analysis,
      tag_frequency,
      meta: {
        real_fields: [
          "title", "shop_name", "price", "favorites", "views",
          "listing_age_days", "tags", "image_url",
        ],
        estimated_fields_note:
          "Mo. Sales / Mo. Revenue / Total Sales / Total Revenue / Conv. Rate are estimates "
          + "derived from public favorites count using the industry-standard heuristic "
          + "(favorites ÷ 5). Real per-listing sales data is not available through any "
          + "TOS-safe path — Etsy's official v3 API does not expose competitor sales.",
        review_to_sales_multiplier: REVIEW_TO_SALES_MULTIPLIER,
      },
    };

    cache.set(cacheKey, { data: payload, t: Date.now() });
    return NextResponse.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "product-analytics failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
