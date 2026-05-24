// ══════════════════════════════════════════════════════════════
// Factory Engine 1: Research Scan Engine
//
// Scans existing Etsy import data in the DB to find, score,
// and rank product opportunities. Detects winning patterns
// and recommends what the factory should build.
//
// Data sources:
//   - etsy_import_listings (primary — rich data from extension)
//   - tracked_listings (secondary — manual tracking)
//   - niche_research (aggregated keyword data)
//
// Does NOT call external APIs. Works entirely from local data.
// ══════════════════════════════════════════════════════════════

import { getDb } from "@/lib/db";
import type {
  ScanResult,
  OpportunityListing,
  OpportunityScore,
  NichePattern,
  OpportunityRecommendation,
} from "@/types/factory";

// ══════════════════════════════════════════════════════════════
// STEP 1: QUERY — Find matching listings from DB
// ══════════════════════════════════════════════════════════════

interface RawListing {
  id: number;
  listing_id: string;
  title: string;
  url: string;
  shop_name: string;
  price: number;
  favorites: number;
  reviews: number;
  is_bestseller: number;
  tags: string;
  source_keyword: string;
  listing_age_days: number;
  monthly_sales: number;
  revenue_estimate: number;
  demand_score: number;
  opportunity_score: number;
  velocity_score: number;
  classification: string;
}

function queryListings(keyword: string, limit: number = 50): RawListing[] {
  const db = getDb();
  const searchTerm = `%${keyword.toLowerCase()}%`;

  // Search across title, tags, source_keyword, and category
  const rows = db.prepare(`
    SELECT id, listing_id, title, url, shop_name, price, favorites, reviews,
           is_bestseller, tags, source_keyword, listing_age_days,
           monthly_sales, revenue_estimate, demand_score, opportunity_score,
           velocity_score, classification
    FROM etsy_import_listings
    WHERE LOWER(title) LIKE ? OR LOWER(tags) LIKE ? OR LOWER(source_keyword) LIKE ?
    ORDER BY COALESCE(revenue_estimate, 0) DESC, COALESCE(favorites, 0) DESC
    LIMIT ?
  `).all(searchTerm, searchTerm, searchTerm, limit) as RawListing[];

  return rows;
}

// Also query tracked_listings as a secondary source
function queryTrackedListings(keyword: string, limit: number = 20): RawListing[] {
  const db = getDb();
  const searchTerm = `%${keyword.toLowerCase()}%`;

  const rows = db.prepare(`
    SELECT id, listing_id, title, url, shop_name, price, favorites,
           0 as reviews, 0 as is_bestseller, tags, '' as source_keyword,
           listing_age_days, 0 as monthly_sales, 0 as revenue_estimate,
           0 as demand_score, 0 as opportunity_score, 0 as velocity_score,
           '' as classification
    FROM tracked_listings
    WHERE LOWER(title) LIKE ? OR LOWER(tags) LIKE ?
    ORDER BY COALESCE(sales_estimate, 0) DESC
    LIMIT ?
  `).all(searchTerm, searchTerm, limit) as RawListing[];

  return rows;
}

// ══════════════════════════════════════════════════════════════
// STEP 2: SCORE — Rate each listing on 5 dimensions
// ══════════════════════════════════════════════════════════════

function scoreListing(listing: RawListing, allListings: RawListing[]): OpportunityScore {
  const maxRevenue = Math.max(...allListings.map((l) => l.revenue_estimate || 0), 1);
  const maxFavorites = Math.max(...allListings.map((l) => l.favorites || 0), 1);
  const maxReviews = Math.max(...allListings.map((l) => l.reviews || 0), 1);

  // Demand: favorites + sales + revenue signal
  const demandRaw = (
    ((listing.favorites || 0) / maxFavorites) * 40 +
    ((listing.revenue_estimate || 0) / maxRevenue) * 40 +
    ((listing.monthly_sales || 0) > 0 ? 20 : 0)
  );
  const demand = Math.min(Math.round(demandRaw), 100);

  // Competition (inverted — high score = low competition = good)
  // If the listing has few reviews relative to max, competition is lower
  const reviewRatio = (listing.reviews || 0) / maxReviews;
  const competition = Math.round(Math.max(0, 100 - reviewRatio * 100));

  // Growth: velocity + bestseller signals
  const velocityBonus = (listing.velocity_score || 0) > 0 ? 30 : 0;
  const bestsellerBonus = listing.is_bestseller ? 30 : 0;
  const ageBonus = (listing.listing_age_days || 365) < 180 ? 20 : 0;
  const growth = Math.min(velocityBonus + bestsellerBonus + ageBonus + 20, 100);

  // Clarity: does the title clearly communicate what the product is?
  const titleLower = listing.title.toLowerCase();
  const claritySignals = [
    "google sheets", "spreadsheet", "tracker", "planner", "budget",
    "template", "dashboard", "digital download",
  ];
  const clarityHits = claritySignals.filter((s) => titleLower.includes(s)).length;
  const clarity = Math.min(Math.round((clarityHits / 4) * 100), 100);

  // Differentiation: room to improve (inverted quality — worse product = more room)
  // Low reviews + high price = opportunity to compete
  const diffSignals = (
    (listing.reviews < 50 ? 30 : listing.reviews < 200 ? 15 : 0) +
    (listing.price > 8 ? 25 : listing.price > 5 ? 15 : 0) +
    (!listing.is_bestseller ? 20 : 0) +
    25 // baseline — there's always room to differentiate
  );
  const differentiation = Math.min(diffSignals, 100);

  // Overall: weighted average
  const overall = Math.round(
    demand * 0.30 +
    competition * 0.15 +
    growth * 0.20 +
    clarity * 0.15 +
    differentiation * 0.20
  );

  return { demand, competition, growth, clarity, differentiation, overall };
}

// ══════════════════════════════════════════════════════════════
// STEP 3: ANALYZE — Why it wins + improvement angles
// ══════════════════════════════════════════════════════════════

function analyzeListing(listing: RawListing): { whyItWins: string[]; improvementAngles: string[] } {
  const whyItWins: string[] = [];
  const improvementAngles: string[] = [];

  // Why it wins
  if (listing.is_bestseller) whyItWins.push("Bestseller badge — strong social proof");
  if ((listing.favorites || 0) > 500) whyItWins.push(`${listing.favorites} favorites — high demand`);
  if ((listing.reviews || 0) > 100) whyItWins.push(`${listing.reviews} reviews — established trust`);
  if ((listing.revenue_estimate || 0) > 1000) whyItWins.push(`$${Math.round(listing.revenue_estimate)}/mo estimated revenue`);
  if (listing.price >= 10) whyItWins.push(`$${listing.price} price point — premium positioning`);
  if (listing.title.toLowerCase().includes("google sheets")) whyItWins.push("Clear Google Sheets keyword in title");

  if (whyItWins.length === 0) whyItWins.push("Active listing in this niche");

  // Improvement angles
  if ((listing.reviews || 0) < 50) improvementAngles.push("Low review count — new entrant can compete");
  if (listing.price < 8) improvementAngles.push("Underpriced — room to add more value and charge premium");
  if (listing.price > 15) improvementAngles.push("High price — can undercut with similar quality");
  if (!listing.is_bestseller) improvementAngles.push("No bestseller badge — not yet dominant");

  const tags = listing.tags ? listing.tags.toLowerCase() : "";
  if (!tags.includes("chart") && !tags.includes("dashboard")) {
    improvementAngles.push("Likely no charts/dashboard — add visual dashboard for differentiation");
  }
  if (!tags.includes("savings") && !tags.includes("goals")) {
    improvementAngles.push("No savings goal tracking — add as premium feature");
  }

  if (improvementAngles.length === 0) improvementAngles.push("Compete on visual quality and more features");

  return { whyItWins, improvementAngles };
}

// ══════════════════════════════════════════════════════════════
// STEP 4: DETECT PATTERNS across the niche
// ══════════════════════════════════════════════════════════════

function detectPatterns(listings: OpportunityListing[]): NichePattern {
  if (listings.length === 0) {
    return {
      commonTabs: ["Dashboard", "Transactions", "Budget Setup", "Monthly Summary", "Savings Goals"],
      commonFeatures: ["formulas", "sample data", "color scheme"],
      commonPriceRange: { min: 5, max: 15, avg: 10 },
      commonVisualPatterns: ["device mockup", "dashboard screenshot"],
      commonTagPatterns: [],
      bundleSignals: [],
      avgReviews: 0,
      avgSalesEstimate: 0,
    };
  }

  const prices = listings.map((l) => l.price).filter(Boolean);
  const reviews = listings.map((l) => l.reviewCount);
  const sales = listings.map((l) => l.salesEstimate).filter(Boolean);

  // Aggregate tags
  const tagCounts: Record<string, number> = {};
  for (const l of listings) {
    for (const tag of l.tags) {
      const t = tag.toLowerCase().trim();
      if (t) tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
  }
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag]) => tag);

  // Detect common feature words in titles
  const featureWords = ["dashboard", "tracker", "planner", "chart", "formula", "template", "digital", "spreadsheet", "automated", "instant"];
  const detectedFeatures = featureWords.filter((w) =>
    listings.filter((l) => l.title.toLowerCase().includes(w)).length >= listings.length * 0.3
  );

  // Bundle signals
  const bundleSignals: string[] = [];
  if (listings.some((l) => l.title.toLowerCase().includes("bundle"))) bundleSignals.push("Bundle listings present in niche");
  if (listings.some((l) => l.title.toLowerCase().includes("pack"))) bundleSignals.push("Pack/collection listings detected");
  if (prices.length > 0 && Math.max(...prices) > 20) bundleSignals.push("High-price listings suggest bundle opportunity");

  return {
    commonTabs: ["Dashboard", "Transactions", "Budget Setup", "Monthly Summary", "Savings Goals", "Setup"],
    commonFeatures: detectedFeatures.length > 0 ? detectedFeatures : ["formulas", "sample data"],
    commonPriceRange: {
      min: prices.length > 0 ? Math.min(...prices) : 5,
      max: prices.length > 0 ? Math.max(...prices) : 15,
      avg: prices.length > 0 ? Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100 : 10,
    },
    commonVisualPatterns: ["device mockup with dashboard", "feature slides", "problem/solution hook"],
    commonTagPatterns: topTags,
    bundleSignals,
    avgReviews: reviews.length > 0 ? Math.round(reviews.reduce((a, b) => a + b, 0) / reviews.length) : 0,
    avgSalesEstimate: sales.length > 0 ? Math.round(sales.reduce((a, b) => a + b, 0) / sales.length) : 0,
  };
}

// ══════════════════════════════════════════════════════════════
// STEP 5: RECOMMEND — What should the factory build?
// ══════════════════════════════════════════════════════════════

function buildRecommendations(
  keyword: string,
  listings: OpportunityListing[],
  patterns: NichePattern
): OpportunityRecommendation[] {
  const recommendations: OpportunityRecommendation[] = [];

  if (listings.length === 0) {
    recommendations.push({
      keyword,
      suggestedProductCategory: "budget_tracker",
      reason: "No existing listings found — greenfield opportunity",
      blueprintAngle: "Create a premium entry in an underserved niche",
      priority: "medium",
      topCompetitor: { title: "None found", price: 0, reviews: 0 },
    });
    return recommendations;
  }

  // Sort by overall score descending
  const sorted = [...listings].sort((a, b) => b.score.overall - a.score.overall);
  const top = sorted[0];

  // Primary recommendation: improve on the top competitor
  const topAngle = top.improvementAngles[0] || "Better dashboard and charts";
  recommendations.push({
    keyword,
    suggestedProductCategory: detectCategory(keyword, top.title),
    reason: `Top listing "${top.title.slice(0, 50)}..." has ${top.reviewCount} reviews and ~$${Math.round(top.revenueEstimate)}/mo. Score: ${top.score.overall}/100.`,
    blueprintAngle: topAngle,
    priority: top.score.overall >= 60 ? "high" : top.score.overall >= 40 ? "medium" : "low",
    topCompetitor: { title: top.title, price: top.price, reviews: top.reviewCount },
  });

  // Secondary: if there's a low-competition high-demand gap
  const highDemandLowComp = sorted.find(
    (l) => l.score.demand >= 50 && l.score.competition >= 60 && l !== top
  );
  if (highDemandLowComp) {
    recommendations.push({
      keyword: keyword + " (gap)",
      suggestedProductCategory: detectCategory(keyword, highDemandLowComp.title),
      reason: `"${highDemandLowComp.title.slice(0, 40)}..." has high demand (${highDemandLowComp.score.demand}) but low competition (${highDemandLowComp.score.competition}).`,
      blueprintAngle: "Enter with premium product while competition is low",
      priority: "high",
      topCompetitor: { title: highDemandLowComp.title, price: highDemandLowComp.price, reviews: highDemandLowComp.reviewCount },
    });
  }

  // Bundle recommendation if signals exist
  if (patterns.bundleSignals.length > 0) {
    recommendations.push({
      keyword: keyword + " (bundle)",
      suggestedProductCategory: "bundle",
      reason: patterns.bundleSignals.join(". "),
      blueprintAngle: "Build 2-3 individual products, then create a bundle listing at 2.5x price",
      priority: "medium",
      topCompetitor: { title: top.title, price: top.price, reviews: top.reviewCount },
    });
  }

  return recommendations;
}

function detectCategory(keyword: string, title: string): string {
  const combined = `${keyword} ${title}`.toLowerCase();
  if (combined.includes("paycheck") || combined.includes("bi-weekly")) return "paycheck_budget";
  if (combined.includes("p&l") || combined.includes("profit") || combined.includes("business")) return "business_pl";
  if (combined.includes("wedding")) return "wedding_planner";
  if (combined.includes("travel")) return "travel_planner";
  if (combined.includes("savings") || combined.includes("debt")) return "savings_tracker";
  if (combined.includes("fitness") || combined.includes("gym") || combined.includes("workout")) return "fitness_tracker";
  if (combined.includes("meal") || combined.includes("food") || combined.includes("grocery")) return "meal_planner";
  if (combined.includes("habit")) return "habit_tracker";
  if (combined.includes("side hustle") || combined.includes("freelance")) return "side_hustle";
  return "budget_tracker";
}

// ══════════════════════════════════════════════════════════════
// MAIN EXPORT: Run a scan
// ══════════════════════════════════════════════════════════════

export function runResearchScan(keyword: string): ScanResult {
  // Query both data sources
  const importListings = queryListings(keyword, 40);
  const trackedListings = queryTrackedListings(keyword, 20);

  // Merge and deduplicate by listing_id or URL
  const seen = new Set<string>();
  const allRaw: RawListing[] = [];
  for (const l of [...importListings, ...trackedListings]) {
    const key = l.listing_id || l.url || l.title;
    if (!seen.has(key)) {
      seen.add(key);
      allRaw.push(l);
    }
  }

  // Score each listing
  const scoredListings: OpportunityListing[] = allRaw.map((raw) => {
    const score = scoreListing(raw, allRaw);
    const { whyItWins, improvementAngles } = analyzeListing(raw);
    const tags = raw.tags ? raw.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [];

    return {
      id: raw.id,
      listingId: raw.listing_id || `${raw.id}`,
      title: raw.title,
      url: raw.url,
      shopName: raw.shop_name,
      price: raw.price || 0,
      favorites: raw.favorites || 0,
      salesEstimate: raw.monthly_sales || 0,
      reviewCount: raw.reviews || 0,
      ageDays: raw.listing_age_days || 0,
      isBestseller: !!raw.is_bestseller,
      tags,
      sourceKeyword: raw.source_keyword,
      revenueEstimate: raw.revenue_estimate || 0,
      score,
      whyItWins,
      improvementAngles,
    };
  });

  // Sort by overall score
  scoredListings.sort((a, b) => b.score.overall - a.score.overall);

  // Take top 20 for analysis
  const topListings = scoredListings.slice(0, 20);

  // Detect patterns
  const patterns = detectPatterns(topListings);

  // Build recommendations
  const recommendations = buildRecommendations(keyword, topListings, patterns);

  return {
    scanId: `scan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    keyword,
    productType: "sheets",
    totalMatches: allRaw.length,
    topListings,
    patterns,
    recommendations,
    scannedAt: new Date().toISOString(),
  };
}

/**
 * Run multiple keyword scans and merge results.
 * Returns the combined scan with the highest-priority recommendations first.
 */
export function runMultiKeywordScan(keywords: string[]): ScanResult[] {
  return keywords.map((kw) => runResearchScan(kw.trim())).filter((r) => r.totalMatches > 0 || r.recommendations.length > 0);
}

// ══════════════════════════════════════════════════════════════
// AUTO-DISCOVER: Scan ALL data, find top opportunities
// No keywords needed — the system figures out what to build.
// ══════════════════════════════════════════════════════════════

export interface AutoDiscoveryResult {
  totalListingsScanned: number;
  niches: NicheOpportunity[];
  topPicks: OpportunityRecommendation[];
  scannedAt: string;
}

export interface NicheOpportunity {
  niche: string;
  listingCount: number;
  avgPrice: number;
  avgRevenue: number;
  avgScore: number;
  topListing: { title: string; price: number; revenue: number; reviews: number };
  recommendation: string;
  priority: "high" | "medium" | "low";
  buildKeyword: string;
}

export function runAutoDiscovery(): AutoDiscoveryResult {
  const db = getDb();

  // Pull ALL import listings, ordered by revenue
  const allListings = db.prepare(`
    SELECT id, listing_id, title, url, shop_name, price, favorites, reviews,
           is_bestseller, tags, source_keyword, listing_age_days,
           monthly_sales, revenue_estimate, demand_score, opportunity_score,
           velocity_score, classification
    FROM etsy_import_listings
    ORDER BY COALESCE(revenue_estimate, 0) DESC
    LIMIT 500
  `).all() as RawListing[];

  if (allListings.length === 0) {
    // No data — return curated suggestions based on known Etsy winners
    return {
      totalListingsScanned: 0,
      niches: FALLBACK_NICHES,
      topPicks: FALLBACK_NICHES.slice(0, 5).map((n) => ({
        keyword: n.buildKeyword,
        suggestedProductCategory: detectCategory(n.buildKeyword, n.buildKeyword),
        reason: n.recommendation,
        blueprintAngle: `Build a premium ${n.niche} spreadsheet with dashboard, charts, and sample data`,
        priority: n.priority,
        topCompetitor: { title: n.topListing.title, price: n.topListing.price, reviews: n.topListing.reviews },
      })),
      scannedAt: new Date().toISOString(),
    };
  }

  // Group by source_keyword / detected niche
  const nicheMap = new Map<string, RawListing[]>();
  for (const listing of allListings) {
    const niche = detectNiche(listing);
    if (!nicheMap.has(niche)) nicheMap.set(niche, []);
    nicheMap.get(niche)!.push(listing);
  }

  // Score each niche
  const niches: NicheOpportunity[] = [];
  for (const [niche, listings] of nicheMap.entries()) {
    if (listings.length < 1) continue;

    const prices = listings.map((l) => l.price || 0).filter(Boolean);
    const revenues = listings.map((l) => l.revenue_estimate || 0).filter(Boolean);
    const avgPrice = prices.length ? +(prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2) : 0;
    const avgRevenue = revenues.length ? +(revenues.reduce((a, b) => a + b, 0) / revenues.length).toFixed(0) : 0;

    // Score the niche
    const scored = listings.map((l) => scoreListing(l, listings));
    const avgScore = Math.round(scored.reduce((a, b) => a + b.overall, 0) / scored.length);

    // Top listing
    const top = listings.reduce((best, l) =>
      (l.revenue_estimate || 0) > (best.revenue_estimate || 0) ? l : best
    , listings[0]);

    // Priority based on signal strength
    let priority: "high" | "medium" | "low" = "medium";
    if (avgRevenue > 500 && listings.length >= 3) priority = "high";
    if (listings.some((l) => l.is_bestseller)) priority = "high";
    if (avgRevenue < 100 && listings.length < 2) priority = "low";

    const buildKeyword = `${niche} google sheets spreadsheet`;

    niches.push({
      niche,
      listingCount: listings.length,
      avgPrice,
      avgRevenue: +avgRevenue,
      avgScore,
      topListing: {
        title: top.title,
        price: top.price || 0,
        revenue: top.revenue_estimate || 0,
        reviews: top.reviews || 0,
      },
      recommendation: buildNicheRecommendation(niche, listings.length, avgRevenue, avgPrice),
      priority,
      buildKeyword,
    });
  }

  // Sort: high priority first, then by avg revenue
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  niches.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return b.avgRevenue - a.avgRevenue;
  });

  // Top picks = top 5 niches converted to recommendations
  const topPicks: OpportunityRecommendation[] = niches.slice(0, 5).map((n) => ({
    keyword: n.buildKeyword,
    suggestedProductCategory: detectCategory(n.buildKeyword, n.topListing.title),
    reason: n.recommendation,
    blueprintAngle: `Improve on "${n.topListing.title.slice(0, 40)}..." — add dashboard, charts, premium formatting`,
    priority: n.priority,
    topCompetitor: n.topListing,
  }));

  return {
    totalListingsScanned: allListings.length,
    niches: niches.slice(0, 20),
    topPicks,
    scannedAt: new Date().toISOString(),
  };
}

// ── Niche detection from listing data ──

function detectNiche(listing: RawListing): string {
  const title = listing.title.toLowerCase();
  const keyword = (listing.source_keyword || "").toLowerCase();
  const combined = `${title} ${keyword}`;

  if (combined.includes("wedding")) return "wedding planner";
  if (combined.includes("travel")) return "travel planner";
  if (combined.includes("paycheck") || combined.includes("bi-weekly") || combined.includes("biweekly")) return "paycheck budget";
  if (combined.includes("p&l") || combined.includes("profit") || combined.includes("loss")) return "business P&L";
  if (combined.includes("side hustle") || combined.includes("freelance")) return "side hustle tracker";
  if (combined.includes("debt") || combined.includes("snowball") || combined.includes("avalanche")) return "debt payoff tracker";
  if (combined.includes("savings") || combined.includes("saving")) return "savings tracker";
  if (combined.includes("fitness") || combined.includes("workout") || combined.includes("gym")) return "fitness tracker";
  if (combined.includes("meal") || combined.includes("grocery") || combined.includes("food")) return "meal planner";
  if (combined.includes("habit")) return "habit tracker";
  if (combined.includes("student") || combined.includes("college")) return "student budget";
  if (combined.includes("baby") || combined.includes("newborn") || combined.includes("parent")) return "baby budget";
  if (combined.includes("investment") || combined.includes("stock") || combined.includes("portfolio")) return "investment tracker";
  if (combined.includes("budget") || combined.includes("expense")) return "budget tracker";
  if (combined.includes("planner")) return "planner";
  if (combined.includes("tracker")) return "tracker";
  return "spreadsheet";
}

function buildNicheRecommendation(niche: string, count: number, avgRevenue: number, avgPrice: number): string {
  if (count >= 5 && avgRevenue > 500) {
    return `Strong demand: ${count} listings, avg $${avgRevenue}/mo revenue. Proven niche — build a better version.`;
  }
  if (count >= 3 && avgRevenue > 200) {
    return `Growing niche: ${count} listings averaging $${avgRevenue}/mo. Room to enter with a premium product.`;
  }
  if (count < 3 && avgPrice > 8) {
    return `Low competition (${count} listings) but high price ($${avgPrice} avg). Underserved niche — early mover advantage.`;
  }
  return `${count} listing${count !== 1 ? "s" : ""} found, avg $${avgPrice}. Worth exploring with a differentiated product.`;
}

// ── Fallback niches when no DB data exists ──

const FALLBACK_NICHES: NicheOpportunity[] = [
  { niche: "budget tracker", listingCount: 0, avgPrice: 10, avgRevenue: 3000, avgScore: 75, topListing: { title: "Monthly Budget Tracker Google Sheets", price: 9.97, revenue: 5000, reviews: 500 }, recommendation: "Top-selling Etsy spreadsheet category. High demand, proven market.", priority: "high", buildKeyword: "monthly budget tracker google sheets" },
  { niche: "paycheck budget", listingCount: 0, avgPrice: 11, avgRevenue: 2500, avgScore: 70, topListing: { title: "Bi-Weekly Paycheck Budget Planner", price: 11, revenue: 4000, reviews: 300 }, recommendation: "Strong niche for paycheck-to-paycheck budgeting. Less competition than general budget.", priority: "high", buildKeyword: "paycheck budget planner google sheets" },
  { niche: "wedding planner", listingCount: 0, avgPrice: 14, avgRevenue: 3700, avgScore: 72, topListing: { title: "Ultimate Wedding Planner Spreadsheet", price: 14, revenue: 3700, reviews: 200 }, recommendation: "Premium pricing niche. Seasonal demand spikes. High perceived value.", priority: "high", buildKeyword: "wedding planner spreadsheet google sheets" },
  { niche: "business P&L", listingCount: 0, avgPrice: 12, avgRevenue: 2000, avgScore: 65, topListing: { title: "Small Business P&L Tracker", price: 12, revenue: 2000, reviews: 150 }, recommendation: "Small business owners need simple P&L tracking. Bundle opportunity.", priority: "medium", buildKeyword: "small business profit loss tracker google sheets" },
  { niche: "debt payoff", listingCount: 0, avgPrice: 9, avgRevenue: 1500, avgScore: 60, topListing: { title: "Debt Payoff Tracker Snowball Method", price: 9, revenue: 1500, reviews: 100 }, recommendation: "Emotionally-driven niche. Buyers want to see progress.", priority: "medium", buildKeyword: "debt payoff tracker spreadsheet google sheets" },
  { niche: "savings tracker", listingCount: 0, avgPrice: 8, avgRevenue: 1200, avgScore: 58, topListing: { title: "Savings Goal Tracker Google Sheets", price: 8, revenue: 1200, reviews: 80 }, recommendation: "Pairs well with budget tracker for bundle deals.", priority: "medium", buildKeyword: "savings goal tracker google sheets" },
  { niche: "side hustle tracker", listingCount: 0, avgPrice: 10, avgRevenue: 1800, avgScore: 62, topListing: { title: "Side Hustle Income & Expense Tracker", price: 10, revenue: 1800, reviews: 120 }, recommendation: "Growing niche as more people start side businesses.", priority: "medium", buildKeyword: "side hustle income expense tracker spreadsheet" },
  { niche: "fitness tracker", listingCount: 0, avgPrice: 8, avgRevenue: 1000, avgScore: 55, topListing: { title: "Workout Tracker Google Sheets", price: 8, revenue: 1000, reviews: 60 }, recommendation: "Evergreen health niche. New Year resolution spike.", priority: "low", buildKeyword: "workout fitness tracker google sheets" },
];
