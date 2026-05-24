// ═══ Etsy Top-Seller Scanner ══════════════════════════════════════════
// Given a niche keyword, finds the top-selling Etsy shops and returns
// ranked velocity metrics + their best listing so users can study them.
//
// Data flow:
//   1. Search top listings in the niche (sort by score).
//   2. Group by shop, pick unique top shops (capped).
//   3. For each shop, fetch shop details + reviews + listings in parallel.
//   4. Bucket reviews into 24h / 7d / 14d / 30d windows (sales proxy).
//   5. Compute lifetime avg sales/day and rank sellers.
//
// Notes:
// - Reviews ≈ 3.5% of digital-product orders. We scale with
//   estimateSalesFromReviews(), clearly labelling the estimate in the UI.
// - Rate limited at ~6 req/sec to stay under Etsy's 10/sec cap.

import {
  searchEtsyListings,
  getShopListings,
  getShopReviews,
  bucketReviewsByAge,
  estimateSalesFromReviews,
  fetchEtsyShopRecord,
  getPrimaryListingImage,
  type ReviewVelocityBuckets,
  type EtsyShopRecord,
} from "./etsy-research";

export interface SellerShopInfo {
  shop_id: string;
  shop_name: string;
  url: string;
  total_sales: number;         // lifetime transaction_sold_count
  review_count: number;
  review_average: number;
  listing_active_count: number;
  years_on_etsy: number;       // derived from shop_creation_tsz if available (decimal)
  months_on_etsy: number;      // for shops younger than a year, show months instead
  days_on_etsy: number;        // raw days since shop creation (0 if unknown)
  shop_creation_tsz: number;   // unix seconds (0 if Etsy didn't return it)
  avg_daily_sales: number;     // total_sales / max(1, days_on_etsy)
}

export interface SellerVelocity extends ReviewVelocityBuckets {
  est_sales_1h: number;
  est_sales_6h: number;
  est_sales_24h: number;
  est_sales_7d: number;
  est_sales_14d: number;
  est_sales_30d: number;
  trend: "up" | "stable" | "down" | "unknown";
  /** Minutes since newest review — lets the UI show "last sale 12m ago". */
  minutes_since_last_review: number;
}

export interface SellerBestListing {
  listing_id: string;
  title: string;
  price: number;
  currency: string;
  favorites: number;
  image_url: string;
  url: string;
  tags: string[];
  age_days: number;
}

export interface SellerScanEntry {
  shop: SellerShopInfo;
  velocity: SellerVelocity;
  best_listing: SellerBestListing | null;
  /** Up to 6 best-performing listings (ranked by favorites) with images for the gallery strip. */
  top_listings: SellerBestListing[];
  niche_listing_count: number;  // how many of this shop's listings appeared in the niche search
}

export interface SellerScanResult {
  niche: string;
  total_listings_searched: number;
  scanned_at: number;
  sellers: SellerScanEntry[];
}

// Shop details now come from the shared fetchEtsyShopRecord helper in
// etsy-research.ts — keeps one canonical fetch path across the codebase.

function computeTrend(vel: ReviewVelocityBuckets): "up" | "stable" | "down" | "unknown" {
  if (vel.reviews_30d === 0) return "unknown";
  // Compare last-7d rate vs weeks 2-4 rate.
  const last7 = vel.reviews_7d;
  const weeks2to4Per7 = (vel.reviews_30d - vel.reviews_7d) / 3;
  if (weeks2to4Per7 <= 0.5 && last7 >= 1) return "up";
  if (last7 > weeks2to4Per7 * 1.3) return "up";
  if (last7 < weeks2to4Per7 * 0.7) return "down";
  return "stable";
}

export interface ScanSellersOptions {
  niche: string;
  maxSellers?: number;         // default 10
  listingsToScan?: number;     // default 60
  reviewsPerShop?: number;     // default 100
}

export async function scanTopSellers(opts: ScanSellersOptions): Promise<SellerScanResult> {
  const niche = opts.niche.trim();
  const maxSellers = Math.max(1, Math.min(25, opts.maxSellers ?? 10));
  const listingsToScan = Math.max(20, Math.min(100, opts.listingsToScan ?? 60));
  const reviewsPerShop = Math.max(20, Math.min(100, opts.reviewsPerShop ?? 100));

  // Step 1: search top listings in niche
  const { total, listings } = await searchEtsyListings(niche, "score", listingsToScan);

  // Step 2: group by shop_id (numeric) — Etsy's /shops/{shop_id} endpoint
  // requires the numeric id, NOT the display name. The raw search response
  // includes shop_id on each listing; we use that as the grouping key and
  // remember the display shop_name for fallback.
  interface ShopBucket { shopId: string; shopName: string; listings: typeof listings }
  const shopBuckets = new Map<string, ShopBucket>();
  for (const l of listings) {
    const shopId = l.shop_id;
    if (!shopId) continue;
    const existing = shopBuckets.get(shopId);
    if (existing) {
      existing.listings.push(l);
    } else {
      shopBuckets.set(shopId, { shopId, shopName: l.shop_name || "", listings: [l] });
    }
  }

  // Rank shops by niche-appearance count first (proves niche-fit) then by
  // sum of favorites (proves traction in this niche).
  const rankedShops = [...shopBuckets.values()]
    .map((b) => ({
      shopId: b.shopId,
      shopName: b.shopName,
      count: b.listings.length,
      favs: b.listings.reduce((s, l) => s + l.favorites, 0),
    }))
    .sort((a, b) => b.count - a.count || b.favs - a.favs)
    .slice(0, maxSellers);

  // Step 3: fetch full shop details + reviews + top listings for each ranked
  // shop in parallel. We now pass the real numeric shop_id, so the endpoint
  // actually resolves (previous name-based lookup returned 404 → null → 0 sellers).
  const sellers: SellerScanEntry[] = [];

  const entries = await Promise.all(rankedShops.map(async ({ shopId, shopName, count }) => {
    try {
      // Kick off shop details + reviews + top listings in parallel. Details
      // may come back null for private/suspended shops — we fall back to a
      // minimal synthesized record so the seller still surfaces with velocity
      // data (previously we dropped them entirely → zero sellers).
      const [shopDetailsRaw, reviews, topShopListings] = await Promise.all([
        fetchEtsyShopRecord(shopId),
        getShopReviews(shopId, reviewsPerShop),
        getShopListings(shopId, 24).catch(() => []),
      ]);

      // Diagnostic: one-line summary of what the shop-listings endpoint actually
      // returned so we can see in server logs whether images are present. The
      // keys dump reveals whether Etsy is using `Images`, `images`, or
      // something else entirely on that particular endpoint.
      if (topShopListings.length > 0) {
        const first = topShopListings[0];
        const keys = Object.keys(first as unknown as Record<string, unknown>);
        const hasImages = !!(first?.Images?.[0]?.url_570xN || first?.images?.[0]?.url_570xN);
        console.info(
          `[seller-scan] shop=${shopId} name=${shopName} listings=${topShopListings.length} ` +
          `firstHasImages=${hasImages} keys=[${keys.join(",")}]`,
        );
      } else {
        console.info(`[seller-scan] shop=${shopId} name=${shopName} — getShopListings returned 0 rows`);
      }

      // Niche-search listings for this shop — we already fetched these, and
      // they always have image URLs. We use them as a fallback image source
      // when `getShopListings` returns no images (happens for some shops).
      const nicheListingsForShop = shopBuckets.get(shopId)?.listings ?? [];
      const nicheImagesByListingId = new Map(
        nicheListingsForShop
          .filter((l) => l.image_url)
          .map((l) => [l.listing_id, l.image_url] as const),
      );

      const details: EtsyShopRecord = shopDetailsRaw ?? {
        shop_id: shopId,
        shop_name: shopName,
        url: `https://www.etsy.com/shop/${encodeURIComponent(shopName)}`,
      };

      // Velocity buckets (now includes 1h/6h for real-time view)
      const buckets = bucketReviewsByAge(reviews);
      const nowSecForVel = Date.now() / 1000;
      const minutesSinceLast =
        buckets.newest_review_ts > 0
          ? Math.max(0, Math.round((nowSecForVel - buckets.newest_review_ts) / 60))
          : -1;
      const velocity: SellerVelocity = {
        ...buckets,
        est_sales_1h: estimateSalesFromReviews(buckets.reviews_1h),
        est_sales_6h: estimateSalesFromReviews(buckets.reviews_6h),
        est_sales_24h: estimateSalesFromReviews(buckets.reviews_24h),
        est_sales_7d: estimateSalesFromReviews(buckets.reviews_7d),
        est_sales_14d: estimateSalesFromReviews(buckets.reviews_14d),
        est_sales_30d: estimateSalesFromReviews(buckets.reviews_30d),
        trend: computeTrend(buckets),
        minutes_since_last_review: minutesSinceLast,
      };

      // Top listings: sort by favorites desc, pick the first 6 that have images
      // so the gallery never shows empty cells. `best_listing` stays as the #1 for
      // backward-compat with any consumer that still expects a single listing.
      const sortedListings = [...topShopListings].sort(
        (a, b) => (b.num_favorers || 0) - (a.num_favorers || 0),
      );
      const nowSec = Date.now() / 1000;
      const resolveImage = (l: typeof topShopListings[number]): string =>
        l.Images?.[0]?.url_570xN ||
        l.images?.[0]?.url_570xN ||
        nicheImagesByListingId.get(String(l.listing_id)) ||
        "";
      const toBestListing = (l: typeof topShopListings[number]): SellerBestListing => ({
        listing_id: String(l.listing_id),
        title: l.title,
        price: l.price ? l.price.amount / l.price.divisor : 0,
        currency: l.price?.currency_code || "USD",
        favorites: l.num_favorers || 0,
        image_url: resolveImage(l),
        url: l.url || "",
        tags: l.tags || [],
        age_days: l.original_creation_tsz ? Math.floor((nowSec - l.original_creation_tsz) / 86400) : 0,
      });
      const withImages = sortedListings.filter((l) => resolveImage(l).length > 0);
      let topListings: SellerBestListing[] = (withImages.length ? withImages : sortedListings)
        .slice(0, 6)
        .map(toBestListing);

      // Ultimate fallback: if the shop endpoint returned nothing usable, seed
      // the gallery from the niche-search listings we already have. Those
      // objects have a different shape (mapped by searchEtsyListings) so we
      // synthesize SellerBestListing entries directly from them.
      if (topListings.length === 0 && nicheListingsForShop.length > 0) {
        topListings = nicheListingsForShop
          .slice()
          .sort((a, b) => (b.favorites || 0) - (a.favorites || 0))
          .slice(0, 6)
          .map((l) => ({
            listing_id: String(l.listing_id),
            title: l.title,
            price: l.price || 0,
            currency: "USD",
            favorites: l.favorites || 0,
            image_url: l.image_url || "",
            url: l.url || "",
            tags: (() => {
              try {
                const parsed = JSON.parse(l.tags);
                return Array.isArray(parsed) ? parsed : [];
              } catch {
                return [];
              }
            })(),
            age_days: l.listing_age_days || 0,
          }));
      }
      // Reliable per-listing image fallback: for any entry still missing an
      // image, hit `/listings/{id}/images` directly. This endpoint is
      // deterministic and always returns image URLs when a listing has any
      // images attached — it sidesteps the inconsistent `includes=Images`
      // behaviour on the shop-listings endpoint. We only fire it for the top
      // 6 to keep the round-trip count bounded (≤6 per shop × 10 shops = 60
      // max, still well under Etsy's rate limit).
      const needsImage = topListings.filter((t) => !t.image_url);
      if (needsImage.length > 0) {
        const imageMap = new Map(
          (
            await Promise.all(
              needsImage.map(async (t) => [t.listing_id, await getPrimaryListingImage(t.listing_id)] as const),
            )
          ).filter(([, url]) => url.length > 0),
        );
        topListings = topListings.map((t) =>
          t.image_url ? t : { ...t, image_url: imageMap.get(t.listing_id) || "" },
        );
        console.info(
          `[seller-scan] shop=${shopId} backfilled ${imageMap.size}/${needsImage.length} images via /listings/{id}/images`,
        );
      }

      const best: SellerBestListing | null = topListings[0] ?? null;

      // Compute shop metrics. We now carry forward `shop_creation_tsz`,
      // `days_on_etsy`, and `months_on_etsy` so the UI can pick the right unit
      // (e.g. "8mo on Etsy" for young shops instead of "0.7y").
      const shopCreationSec = details.shop_creation_tsz || 0;
      const daysOnEtsy = shopCreationSec > 0
        ? Math.max(1, Math.floor((nowSec - shopCreationSec) / 86400))
        : 0;
      const yearsOnEtsy = daysOnEtsy ? Math.round((daysOnEtsy / 365) * 10) / 10 : 0;
      const monthsOnEtsy = daysOnEtsy ? Math.max(1, Math.round(daysOnEtsy / 30)) : 0;
      const totalSales = details.transaction_sold_count || 0;
      const avgDailySales = daysOnEtsy > 0 ? Math.round((totalSales / daysOnEtsy) * 10) / 10 : 0;

      const shopInfo: SellerShopInfo = {
        shop_id: details.shop_id,
        shop_name: details.shop_name,
        url: details.url,
        total_sales: totalSales,
        review_count: details.review_count || 0,
        review_average: details.review_average || 0,
        listing_active_count: details.listing_active_count || 0,
        years_on_etsy: yearsOnEtsy,
        months_on_etsy: monthsOnEtsy,
        days_on_etsy: daysOnEtsy,
        shop_creation_tsz: shopCreationSec,
        avg_daily_sales: avgDailySales,
      };

      const entry: SellerScanEntry = {
        shop: shopInfo,
        velocity,
        best_listing: best,
        top_listings: topListings,
        niche_listing_count: count,
      };
      return entry;
    } catch {
      return null;
    }
  }));

  for (const e of entries) if (e) sellers.push(e);

  // Sort by 7-day review count (most recent velocity) then by lifetime sales
  sellers.sort((a, b) =>
    b.velocity.reviews_7d - a.velocity.reviews_7d ||
    b.shop.total_sales - a.shop.total_sales,
  );

  return {
    niche,
    total_listings_searched: total,
    scanned_at: Date.now(),
    sellers,
  };
}
