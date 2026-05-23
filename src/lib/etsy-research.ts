// Etsy product research - uses Etsy API v3 for search and analysis
// Falls back to public search when API key is pending

const ETSY_API_URL = 'https://openapi.etsy.com/v3';

// Etsy v3 now rejects `x-api-key: <client_id>` with the misleading
// "Shared secret is required in x-api-key header" 403. The accepted
// header is the colon-joined `<client_id>:<shared_secret>` pair —
// confirmed working against the live API. If the secret is absent
// (legacy setup), fall back to the bare client_id so we don't break
// older `.env.local` files.
function getApiKey(): string {
  const clientId = process.env.ETSY_CLIENT_ID || '';
  const sharedSecret = process.env.ETSY_SHARED_SECRET || '';
  return sharedSecret ? `${clientId}:${sharedSecret}` : clientId;
}

export interface EtsySearchResult {
  listing_id: number;
  title: string;
  description?: string;
  price: { amount: number; divisor: number; currency_code: string };
  quantity: number;
  views: number;
  num_favorers: number;
  tags: string[];
  materials?: string[];
  url: string;
  shop_id: number;
  shop_name?: string;
  taxonomy_id: number;
  original_creation_tsz: number;
  last_modified_tsz?: number;
  is_digital?: boolean;
  images?: { url_570xN: string; url_fullxfull?: string }[];
  Images?: { url_570xN: string; url_fullxfull?: string }[];
}

interface EtsySearchResponse {
  count: number;
  results: EtsySearchResult[];
}

// Search Etsy listings by keyword (public endpoint - no auth needed)
export async function searchEtsyListings(keyword: string, sortOn?: string, limit?: number): Promise<{
  total: number;
  listings: {
    listing_id: string;
    shop_id: string;
    title: string;
    price: number;
    quantity: number;
    views: number;
    favorites: number;
    tags: string;
    url: string;
    shop_name: string;
    image_url: string;
    /** Up to 8 full-res image URLs (url_fullxfull) for downstream Gemini Vision.
     *  Sorted by Etsy's `rank` field (seller's primary photo first). Empty
     *  array if batch enrichment failed — caller should fall back to image_url. */
    image_urls: string[];
    listing_age_days: number;
    category: string;
  }[];
}> {
  const clientId = getApiKey();
  if (!clientId) throw new Error('ETSY_CLIENT_ID not configured');

  // The `/listings/active` search endpoint does NOT return shop/images
  // even when you pass `includes=Images,Shop` — verified by direct
  // probe 2026-05. To get those fields we must:
  //   1. Search → get listing_ids
  //   2. Call /listings/batch?listing_ids=...&includes=Images,Shop
  //
  // Two API calls per search instead of one, but worth it: without the
  // batch step shop_name, image_url, listing_age_days all return empty.
  const params = new URLSearchParams({
    keywords: keyword,
    limit: String(limit || 25),
    sort_on: sortOn || 'score',
    sort_order: 'desc',
  });

  const resp = await fetch(`${ETSY_API_URL}/application/listings/active?${params.toString()}`, {
    headers: { 'x-api-key': clientId },
  });

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Etsy search failed (${resp.status}): ${error}`);
  }

  const data: EtsySearchResponse = await resp.json();
  const now = Date.now() / 1000;

  // ── Batch enrichment ── Search-only response is missing shop & images.
  // One follow-up call to /listings/batch fills both in. Up to 100 IDs
  // per batch — well above our typical limit of 25-40.
  //
  // image_urls (NEW, 2026-05-19): the factory's competitor-deep-scan
  // engine reads up to 8 full-res photos per listing with Gemini Vision
  // to extract feature manifests. We surface ALL gallery images at
  // url_fullxfull (capped at 8 to control downstream Vision token cost)
  // alongside the legacy primary image_url at url_570xN.
  const MAX_IMAGES_PER_LISTING = 8;
  const ids = data.results.map((r) => r.listing_id);
  const enrichmentMap = new Map<number, {
    shop_name: string;
    image_url: string;
    image_urls: string[];
    created_ts: number;
  }>();
  if (ids.length > 0) {
    try {
      const batchResp = await fetch(
        `${ETSY_API_URL}/application/listings/batch?listing_ids=${ids.join(',')}&includes=Images,Shop`,
        { headers: { 'x-api-key': clientId } },
      );
      if (batchResp.ok) {
        const batchData = await batchResp.json();
        for (const b of (batchData.results || []) as Array<{
          listing_id: number;
          shop?: { shop_name?: string };
          images?: Array<{ url_570xN?: string; url_fullxfull?: string; rank?: number }>;
          original_creation_timestamp?: number;
          created_timestamp?: number;
        }>) {
          // Sort by rank (Etsy puts the seller's primary image first).
          // Fall back to declaration order if rank is absent.
          const sortedImages = (b.images || []).slice().sort((a, b) =>
            (typeof a.rank === "number" ? a.rank : 999) -
            (typeof b.rank === "number" ? b.rank : 999),
          );
          const fullResUrls = sortedImages
            .map((img) => img.url_fullxfull || img.url_570xN || "")
            .filter(Boolean)
            .slice(0, MAX_IMAGES_PER_LISTING);
          enrichmentMap.set(b.listing_id, {
            shop_name: b.shop?.shop_name || '',
            image_url: sortedImages[0]?.url_570xN || sortedImages[0]?.url_fullxfull || '',
            image_urls: fullResUrls,
            created_ts: b.original_creation_timestamp || b.created_timestamp || 0,
          });
        }
      } else {
        console.warn(`[etsy-research] batch enrichment failed (${batchResp.status})`);
      }
    } catch (err) {
      console.warn('[etsy-research] batch enrichment errored:', err);
    }
  }

  const listings = data.results.map((r) => {
    const enriched = enrichmentMap.get(r.listing_id);
    const createdTs = enriched?.created_ts || 0;
    return {
      listing_id: String(r.listing_id),
      shop_id: String(r.shop_id),
      title: r.title,
      price: r.price.amount / r.price.divisor,
      quantity: r.quantity,
      views: r.views,
      favorites: r.num_favorers,
      tags: JSON.stringify(r.tags || []),
      url: r.url,
      shop_name: enriched?.shop_name || '',
      image_url: enriched?.image_url || '',
      // Full gallery (up to 8) for downstream Gemini Vision deep-scan.
      // Empty array if batch enrichment failed — caller should fall back
      // to image_url alone in that case.
      image_urls: enriched?.image_urls || [],
      listing_age_days: createdTs > 0 ? Math.floor((now - createdTs) / 86400) : 0,
      category: String(r.taxonomy_id),
    };
  });

  return { total: data.count, listings };
}

// ══════════════════════════════════════════════════════════════════════
// fetchEtsyListingDetail — per-listing fetch for full description + tags
//
// /listings/active and /listings/batch (with includes=Images,Shop) do
// NOT return the listing's `description` field. The factory's
// competitor-deep-scan engine reads the description to detect mentioned
// features ("28 tabs", "automated dashboard", "smart calendar widget"),
// so we hit /listings/:id separately at "Build This" click time.
//
// Cost: one extra Etsy v3 call per Build click, ~150-300ms. Acceptable
// — the factory pipeline itself takes 60-90s, this is rounding error.
// ══════════════════════════════════════════════════════════════════════
export async function fetchEtsyListingDetail(listingId: string): Promise<{
  listingId: string;
  title: string;
  description: string;
  tags: string[];
  price: number;
  imageUrls: string[];
  listingUrl: string;
  shopName: string;
  reviewCount: number;
}> {
  const clientId = getApiKey();
  if (!clientId) throw new Error('ETSY_CLIENT_ID not configured');

  const MAX_IMAGES = 8;
  const resp = await fetch(
    `${ETSY_API_URL}/application/listings/${encodeURIComponent(listingId)}?includes=Images,Shop`,
    { headers: { 'x-api-key': clientId } },
  );
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Etsy listing fetch failed (${resp.status}): ${body.slice(0, 200)}`);
  }
  const l = (await resp.json()) as {
    listing_id: number;
    title?: string;
    description?: string;
    tags?: string[];
    price?: { amount: number; divisor: number };
    url?: string;
    shop?: { shop_name?: string };
    images?: Array<{ url_570xN?: string; url_fullxfull?: string; rank?: number }>;
    num_favorers?: number;
  };

  const sortedImages = (l.images || []).slice().sort((a, b) =>
    (typeof a.rank === 'number' ? a.rank : 999) -
    (typeof b.rank === 'number' ? b.rank : 999),
  );
  const imageUrls = sortedImages
    .map((img) => img.url_fullxfull || img.url_570xN || '')
    .filter(Boolean)
    .slice(0, MAX_IMAGES);

  return {
    listingId: String(l.listing_id),
    title: l.title || '',
    description: l.description || '',
    tags: l.tags || [],
    price: l.price ? l.price.amount / l.price.divisor : 0,
    imageUrls,
    listingUrl: l.url || '',
    shopName: l.shop?.shop_name || '',
    reviewCount: l.num_favorers || 0,
  };
}

// Get shop details
export async function getEtsyShopDetails(shopId: string): Promise<{
  shop_id: string;
  shop_name: string;
  total_sales: number;
  listing_count: number;
  review_average: number;
  url: string;
}> {
  const clientId = getApiKey();

  const resp = await fetch(`${ETSY_API_URL}/application/shops/${shopId}`, {
    headers: { 'x-api-key': clientId },
  });

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Shop fetch failed: ${error}`);
  }

  const shop = await resp.json();
  return {
    shop_id: String(shop.shop_id),
    shop_name: shop.shop_name,
    total_sales: shop.transaction_sold_count || 0,
    listing_count: shop.listing_active_count || 0,
    review_average: shop.review_average || 0,
    url: shop.url,
  };
}

// Get shop listings
export async function getShopListings(shopId: string, limit?: number): Promise<EtsySearchResult[]> {
  const clientId = getApiKey();

  const params = new URLSearchParams({
    limit: String(limit || 25),
    includes: 'Images(url_570xN)',
    sort_on: 'score',
  });

  const resp = await fetch(`${ETSY_API_URL}/application/shops/${shopId}/listings/active?${params.toString()}`, {
    headers: { 'x-api-key': clientId },
  });

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Shop listings fetch failed: ${error}`);
  }

  const data = await resp.json();
  return data.results || [];
}

// Analyze a niche based on search results
export function analyzeNiche(listings: { price: number; favorites: number; views: number; listing_age_days: number }[], totalResults: number): {
  avg_price: number;
  avg_favorites: number;
  competition_level: string;
  demand_score: number;
} {
  if (listings.length === 0) {
    return { avg_price: 0, avg_favorites: 0, competition_level: 'unknown', demand_score: 0 };
  }

  const avgPrice = listings.reduce((s, l) => s + l.price, 0) / listings.length;
  const avgFavorites = listings.reduce((s, l) => s + l.favorites, 0) / listings.length;
  const avgViews = listings.reduce((s, l) => s + l.views, 0) / listings.length;

  // Competition: based on total results
  let competition_level = 'low';
  if (totalResults > 100000) competition_level = 'very high';
  else if (totalResults > 50000) competition_level = 'high';
  else if (totalResults > 10000) competition_level = 'medium';

  // Demand score (0-100): higher favorites + views relative to competition = more demand
  const favScore = Math.min(avgFavorites / 50, 1) * 40; // up to 40 points
  const viewScore = Math.min(avgViews / 500, 1) * 30; // up to 30 points
  const competitionBonus = competition_level === 'low' ? 30 : competition_level === 'medium' ? 20 : competition_level === 'high' ? 10 : 0;
  const demand_score = Math.round(Math.min(favScore + viewScore + competitionBonus, 100));

  return { avg_price: Math.round(avgPrice * 100) / 100, avg_favorites: Math.round(avgFavorites), competition_level, demand_score };
}

// Estimate sales from favorites (rough heuristic: ~10-20% of favoriters buy)
export function estimateSales(favorites: number, listingAgeDays: number): number {
  if (listingAgeDays === 0) return 0;
  const conversionRate = 0.15; // ~15% of favorites convert
  return Math.round(favorites * conversionRate);
}

// ═══ STUBS for the WIP top-seller scanner ════════════════════════════
// These satisfy the imports in `etsy-seller-scanner.ts` so the dev
// server can build while the real implementations are still being
// designed. They MUST be replaced before the scanner is shipped:
// - getShopReviews / fetchEtsyShopRecord / getPrimaryListingImage need
//   real Etsy v3 API calls (sanctioned path only — NEVER scrape).
// - bucketReviewsByAge / estimateSalesFromReviews are pure functions
//   that should ship once review-fetching is wired up.
// Every stub call emits a one-time console.warn so it's obvious in
// dev-server logs that the scanner is not actually fetching data.
let _scannerStubWarned = false;
function warnStubUsed(name: string) {
  if (_scannerStubWarned) return;
  _scannerStubWarned = true;
  console.warn(
    `[etsy-research] WIP stub hit (${name}). Top-seller scanner is not implemented — ` +
      `returning empty data. Real implementation pending.`,
  );
}

export interface ReviewVelocityBuckets {
  reviews_1h: number;
  reviews_6h: number;
  reviews_24h: number;
  reviews_7d: number;
  reviews_14d: number;
  reviews_30d: number;
  /** Unix seconds of newest review; 0 if none. */
  newest_review_ts: number;
}

export interface EtsyShopRecord {
  shop_id: string;
  shop_name: string;
  url: string;
  transaction_sold_count?: number;
  review_count?: number;
  review_average?: number;
  listing_active_count?: number;
  /** Unix seconds of shop creation; 0/undefined if unknown. */
  shop_creation_tsz?: number;
}

export interface EtsyReview {
  created_timestamp?: number;
  rating?: number;
  review?: string;
}

export async function getShopReviews(
  _shopId: string,
  _limit: number,
): Promise<EtsyReview[]> {
  warnStubUsed("getShopReviews");
  return [];
}

export function bucketReviewsByAge(_reviews: unknown[]): ReviewVelocityBuckets {
  warnStubUsed("bucketReviewsByAge");
  return {
    reviews_1h: 0,
    reviews_6h: 0,
    reviews_24h: 0,
    reviews_7d: 0,
    reviews_14d: 0,
    reviews_30d: 0,
    newest_review_ts: 0,
  };
}

export function estimateSalesFromReviews(_reviewCount: number): number {
  warnStubUsed("estimateSalesFromReviews");
  return 0;
}

export async function fetchEtsyShopRecord(
  _shopId: string,
): Promise<EtsyShopRecord | null> {
  warnStubUsed("fetchEtsyShopRecord");
  return null;
}

export async function getPrimaryListingImage(_listingId: string): Promise<string> {
  warnStubUsed("getPrimaryListingImage");
  return "";
}
