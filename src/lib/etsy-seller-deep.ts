// ═══ Etsy Seller Deep-Scan ════════════════════════════════════════════
// Given a shop_id, pulls every signal we need to reverse-engineer the
// seller's winning formula:
//   • All active listings (up to 100) with images, tags, description, price
//   • Full review set (100) → sales velocity + sentiment keywords
//   • Pricing stats (min/max/median/mode + distribution buckets)
//   • Title patterns (length, separators, capitalization, emoji usage, top words)
//   • Tag strategy (top tags across listings, % usage, avg tags/listing)
//   • Description patterns (length, markers ••• / ♥ / ✦, bullets, sections)
//   • Image style snapshot (primary image URLs of top 20 listings)
//   • Best-sellers (top 10 by favorites)
//   • Newest listings (last 5 by creation date)
//   • Niche breakdown (taxonomy ids → counts)
//
// The output is consumed by:
//   - Deep-scan UI (raw display)
//   - seller-study Gemini synthesizer (AI playbook)

import {
  fetchEtsyShopRecord,
  getShopListings,
  getShopReviews,
  bucketReviewsByAge,
  estimateSalesFromReviews,
  type EtsyShopRecord,
  type EtsySearchResult,
  type EtsyReview,
  type ReviewVelocityBuckets,
} from "./etsy-research";

export interface DeepListingInfo {
  listing_id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  favorites: number;
  views: number;
  tags: string[];
  materials: string[];
  taxonomy_id: number;
  image_urls: string[];     // full size if available, else 570xN
  primary_image: string;
  url: string;
  age_days: number;
  last_modified_days: number;
  is_digital: boolean;
}

export interface PricingStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  mode: number;
  stdDev: number;
  buckets: Array<{ rangeLabel: string; lo: number; hi: number; count: number }>;
  sweetSpot: { lo: number; hi: number };  // range where the densest cluster lives
}

export interface TitlePatternStats {
  count: number;
  avgLength: number;
  minLength: number;
  maxLength: number;
  lengthBuckets: Array<{ bucket: string; count: number }>;
  topWords: Array<{ word: string; count: number }>;
  separatorUsage: Array<{ char: string; count: number; pct: number }>;
  emojiUsagePct: number;
  allCapsPct: number;
  titleCasePct: number;
}

export interface TagPatternStats {
  totalUnique: number;
  avgPerListing: number;
  topTags: Array<{ tag: string; count: number; pct: number }>;
  corePhrases: string[];  // top multi-word tags
}

export interface DescriptionPatternStats {
  count: number;
  avgLength: number;
  usesBullets: number;     // %
  usesMarkers: number;     // % (••• ♥ ✦ ⭐ etc)
  hasSections: number;     // % (double newlines, headers)
  avgParagraphs: number;
  topOpeners: Array<{ phrase: string; count: number }>;
  commonMarkers: string[];
}

export interface SellerDeepScanResult {
  shop: EtsyShopRecord;
  derived: {
    years_on_etsy: number;
    avg_daily_sales: number;
    digital_share_pct: number;
  };
  velocity: ReviewVelocityBuckets & {
    est_sales_24h: number;
    est_sales_7d: number;
    est_sales_14d: number;
    est_sales_30d: number;
  };
  listings: DeepListingInfo[];        // all active listings (up to 100)
  top_listings: DeepListingInfo[];    // top 10 by favorites
  newest_listings: DeepListingInfo[]; // last 5 by creation date
  pricing: PricingStats;
  titles: TitlePatternStats;
  tags: TagPatternStats;
  descriptions: DescriptionPatternStats;
  niche_breakdown: Array<{ taxonomy_id: number; count: number; pct: number }>;
  image_gallery: string[];            // 20 primary images for style reference
  review_sentiment: {
    total_sampled: number;
    avg_rating: number;
    top_keywords: Array<{ word: string; count: number }>;
  };
  scanned_at: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

function toDeepListing(r: EtsySearchResult): DeepListingInfo {
  const nowSec = Date.now() / 1000;
  const priceAmount = r.price?.amount ?? 0;
  const priceDivisor = r.price?.divisor ?? 100;
  const imgs = (r.Images || r.images || []);
  const imageUrls = imgs.map((im) => im.url_fullxfull || im.url_570xN).filter(Boolean);
  return {
    listing_id: String(r.listing_id),
    title: r.title || "",
    description: r.description || "",
    price: priceAmount / priceDivisor,
    currency: r.price?.currency_code || "USD",
    favorites: r.num_favorers || 0,
    views: r.views || 0,
    tags: Array.isArray(r.tags) ? r.tags : [],
    materials: Array.isArray(r.materials) ? r.materials : [],
    taxonomy_id: r.taxonomy_id || 0,
    image_urls: imageUrls,
    primary_image: imageUrls[0] || "",
    url: r.url || "",
    age_days: r.original_creation_tsz ? Math.floor((nowSec - r.original_creation_tsz) / 86400) : 0,
    last_modified_days: r.last_modified_tsz ? Math.floor((nowSec - r.last_modified_tsz) / 86400) : 0,
    is_digital: !!r.is_digital,
  };
}

function computePricing(prices: number[]): PricingStats {
  if (prices.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0, mode: 0, stdDev: 0, buckets: [], sweetSpot: { lo: 0, hi: 0 } };
  }
  const sorted = [...prices].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  // Mode (rounded to nearest 0.5)
  const freq = new Map<number, number>();
  for (const p of prices) {
    const k = Math.round(p * 2) / 2;
    freq.set(k, (freq.get(k) || 0) + 1);
  }
  let mode = median;
  let maxFreq = 0;
  for (const [k, v] of freq.entries()) {
    if (v > maxFreq) { maxFreq = v; mode = k; }
  }
  const variance = prices.reduce((s, p) => s + (p - mean) ** 2, 0) / prices.length;
  const stdDev = Math.sqrt(variance);

  // Buckets (6 even slices across the range, but floored for readability)
  const buckets: PricingStats["buckets"] = [];
  const bucketCount = 6;
  const step = Math.max(0.5, (max - min) / bucketCount);
  for (let i = 0; i < bucketCount; i++) {
    const lo = min + step * i;
    const hi = i === bucketCount - 1 ? max : min + step * (i + 1);
    const count = prices.filter((p) => p >= lo && p <= hi).length;
    buckets.push({
      rangeLabel: `$${lo.toFixed(2)}–$${hi.toFixed(2)}`,
      lo,
      hi,
      count,
    });
  }
  // Sweet spot = densest single bucket
  let densest = buckets[0];
  for (const b of buckets) if (b.count > densest.count) densest = b;

  return {
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    mean: Math.round(mean * 100) / 100,
    median: Math.round(median * 100) / 100,
    mode: Math.round(mode * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
    buckets,
    sweetSpot: { lo: Math.round(densest.lo * 100) / 100, hi: Math.round(densest.hi * 100) / 100 },
  };
}

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "for", "with", "to", "in", "on", "at", "by", "is",
  "it", "this", "that", "your", "you", "my", "our", "new", "home", "set",
]);

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}]/u;

function computeTitlePatterns(titles: string[]): TitlePatternStats {
  if (titles.length === 0) {
    return {
      count: 0, avgLength: 0, minLength: 0, maxLength: 0, lengthBuckets: [],
      topWords: [], separatorUsage: [], emojiUsagePct: 0, allCapsPct: 0, titleCasePct: 0,
    };
  }
  const lengths = titles.map((t) => t.length);
  const avgLength = Math.round(lengths.reduce((s, n) => s + n, 0) / lengths.length);
  const minLength = Math.min(...lengths);
  const maxLength = Math.max(...lengths);

  const lengthBuckets = [
    { bucket: "< 70 (too short)", count: titles.filter((t) => t.length < 70).length },
    { bucket: "70–100 (sweet spot)", count: titles.filter((t) => t.length >= 70 && t.length <= 100).length },
    { bucket: "100–120 (sweet spot)", count: titles.filter((t) => t.length > 100 && t.length <= 120).length },
    { bucket: "120–140 (long)", count: titles.filter((t) => t.length > 120 && t.length <= 140).length },
    { bucket: "> 140 (over limit)", count: titles.filter((t) => t.length > 140).length },
  ];

  const wordFreq = new Map<string, number>();
  for (const t of titles) {
    const words = t.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/);
    for (const w of words) {
      if (!w || w.length < 3 || STOP_WORDS.has(w)) continue;
      wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
    }
  }
  const topWords = [...wordFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));

  const separators = ["|", "-", "•", "—", "/", ","];
  const separatorUsage = separators.map((char) => {
    const count = titles.filter((t) => t.includes(char)).length;
    return { char, count, pct: Math.round((count / titles.length) * 100) };
  }).sort((a, b) => b.count - a.count);

  const emojiCount = titles.filter((t) => EMOJI_RE.test(t)).length;
  const allCapsCount = titles.filter((t) => {
    const letters = t.replace(/[^a-zA-Z]/g, "");
    return letters.length >= 10 && letters === letters.toUpperCase();
  }).length;
  const titleCaseCount = titles.filter((t) => {
    const words = t.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
    if (words.length === 0) return false;
    const cap = words.filter((w) => /^[A-Z]/.test(w)).length;
    return cap / words.length >= 0.6;
  }).length;

  return {
    count: titles.length,
    avgLength,
    minLength,
    maxLength,
    lengthBuckets,
    topWords,
    separatorUsage,
    emojiUsagePct: Math.round((emojiCount / titles.length) * 100),
    allCapsPct: Math.round((allCapsCount / titles.length) * 100),
    titleCasePct: Math.round((titleCaseCount / titles.length) * 100),
  };
}

function computeTagPatterns(allTagArrays: string[][]): TagPatternStats {
  const freq = new Map<string, number>();
  let total = 0;
  for (const arr of allTagArrays) {
    for (const t of arr) {
      const k = t.trim().toLowerCase();
      if (!k) continue;
      freq.set(k, (freq.get(k) || 0) + 1);
      total++;
    }
  }
  const listingCount = allTagArrays.length || 1;
  const topTags = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([tag, count]) => ({
      tag,
      count,
      pct: Math.round((count / listingCount) * 100),
    }));
  const corePhrases = topTags
    .filter((t) => t.tag.includes(" ") && t.pct >= 20)
    .slice(0, 10)
    .map((t) => t.tag);

  return {
    totalUnique: freq.size,
    avgPerListing: Math.round((total / listingCount) * 10) / 10,
    topTags,
    corePhrases,
  };
}

function computeDescriptionPatterns(descriptions: string[]): DescriptionPatternStats {
  if (descriptions.length === 0) {
    return { count: 0, avgLength: 0, usesBullets: 0, usesMarkers: 0, hasSections: 0, avgParagraphs: 0, topOpeners: [], commonMarkers: [] };
  }
  const lengths = descriptions.map((d) => d.length);
  const avgLength = Math.round(lengths.reduce((s, n) => s + n, 0) / lengths.length);

  const usesBullets = descriptions.filter((d) => /^[\s]*[\-\*•▪►]/m.test(d)).length;
  // Markers: ••• ♥ ✦ ⭐ ━ ── ►
  const markerPatterns = ["•••", "♥", "✦", "⭐", "━", "──", "►", "❯", "✧", "★"];
  const usesMarkers = descriptions.filter((d) =>
    markerPatterns.some((m) => d.includes(m)),
  ).length;
  const markerHits = new Map<string, number>();
  for (const d of descriptions) {
    for (const m of markerPatterns) {
      if (d.includes(m)) markerHits.set(m, (markerHits.get(m) || 0) + 1);
    }
  }
  const commonMarkers = [...markerHits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([m]) => m);

  const hasSections = descriptions.filter((d) => /\n\s*\n/.test(d)).length;
  const avgParagraphs = Math.round(
    descriptions.reduce((s, d) => s + d.split(/\n\s*\n/).length, 0) / descriptions.length,
  );

  const openers = new Map<string, number>();
  for (const d of descriptions) {
    const first = d.trim().split(/\s+/).slice(0, 3).join(" ").toLowerCase();
    if (first.length >= 5) openers.set(first, (openers.get(first) || 0) + 1);
  }
  const topOpeners = [...openers.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([phrase, count]) => ({ phrase, count }));

  return {
    count: descriptions.length,
    avgLength,
    usesBullets: Math.round((usesBullets / descriptions.length) * 100),
    usesMarkers: Math.round((usesMarkers / descriptions.length) * 100),
    hasSections: Math.round((hasSections / descriptions.length) * 100),
    avgParagraphs,
    topOpeners,
    commonMarkers,
  };
}

function computeReviewKeywords(reviews: EtsyReview[]): Array<{ word: string; count: number }> {
  const freq = new Map<string, number>();
  for (const r of reviews) {
    const text = (r.review || "").toLowerCase().replace(/[^a-z\s]/g, " ");
    for (const w of text.split(/\s+/)) {
      if (!w || w.length < 4 || STOP_WORDS.has(w)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word, count]) => ({ word, count }));
}

// ── Main entry ───────────────────────────────────────────────────────

export async function deepScanSeller(shopId: string): Promise<SellerDeepScanResult> {
  const [shopRaw, listingsRaw, reviews] = await Promise.all([
    fetchEtsyShopRecord(shopId),
    getShopListings(shopId, 100).catch(() => [] as EtsySearchResult[]),
    getShopReviews(shopId, 100).catch(() => [] as EtsyReview[]),
  ]);

  if (!shopRaw) {
    throw new Error(`Shop ${shopId} not found or API unavailable`);
  }

  const listings = listingsRaw.map(toDeepListing);

  // Derived shop-level metrics
  const nowSec = Date.now() / 1000;
  const daysOnEtsy = shopRaw.shop_creation_tsz
    ? Math.max(1, Math.floor((nowSec - shopRaw.shop_creation_tsz) / 86400))
    : 0;
  const yearsOnEtsy = daysOnEtsy ? Math.round((daysOnEtsy / 365) * 10) / 10 : 0;
  const avgDailySales = daysOnEtsy > 0 && shopRaw.transaction_sold_count
    ? Math.round((shopRaw.transaction_sold_count / daysOnEtsy) * 10) / 10
    : 0;
  const digitalShare = listings.length > 0
    ? Math.round((listings.filter((l) => l.is_digital).length / listings.length) * 100)
    : 0;

  // Velocity
  const buckets = bucketReviewsByAge(reviews);
  const velocity = {
    ...buckets,
    est_sales_24h: estimateSalesFromReviews(buckets.reviews_24h),
    est_sales_7d: estimateSalesFromReviews(buckets.reviews_7d),
    est_sales_14d: estimateSalesFromReviews(buckets.reviews_14d),
    est_sales_30d: estimateSalesFromReviews(buckets.reviews_30d),
  };

  // Top / newest
  const topListings = [...listings].sort((a, b) => b.favorites - a.favorites).slice(0, 10);
  const newestListings = [...listings].sort((a, b) => a.age_days - b.age_days).slice(0, 5);

  // Pattern stats
  const pricing = computePricing(listings.map((l) => l.price).filter((p) => p > 0));
  const titles = computeTitlePatterns(listings.map((l) => l.title));
  const tags = computeTagPatterns(listings.map((l) => l.tags));
  const descriptions = computeDescriptionPatterns(listings.map((l) => l.description).filter(Boolean));

  // Niche breakdown
  const taxCounts = new Map<number, number>();
  for (const l of listings) {
    if (l.taxonomy_id) taxCounts.set(l.taxonomy_id, (taxCounts.get(l.taxonomy_id) || 0) + 1);
  }
  const nicheBreakdown = [...taxCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([taxonomy_id, count]) => ({
      taxonomy_id,
      count,
      pct: Math.round((count / (listings.length || 1)) * 100),
    }));

  // Image gallery (for style reference) — 20 primary images from top listings
  const gallerySource = [...topListings, ...listings].filter((l) => l.primary_image);
  const seen = new Set<string>();
  const imageGallery: string[] = [];
  for (const l of gallerySource) {
    if (imageGallery.length >= 20) break;
    if (seen.has(l.primary_image)) continue;
    seen.add(l.primary_image);
    imageGallery.push(l.primary_image);
  }

  // Review sentiment
  const ratings = reviews
    .map((r) => r.rating)
    .filter((rating): rating is number => typeof rating === "number" && rating > 0);
  const avgRating = ratings.length > 0
    ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10
    : 0;

  return {
    shop: shopRaw,
    derived: {
      years_on_etsy: yearsOnEtsy,
      avg_daily_sales: avgDailySales,
      digital_share_pct: digitalShare,
    },
    velocity,
    listings,
    top_listings: topListings,
    newest_listings: newestListings,
    pricing,
    titles,
    tags,
    descriptions,
    niche_breakdown: nicheBreakdown,
    image_gallery: imageGallery,
    review_sentiment: {
      total_sampled: reviews.length,
      avg_rating: avgRating,
      top_keywords: computeReviewKeywords(reviews),
    },
    scanned_at: Date.now(),
  };
}
