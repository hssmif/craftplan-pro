// Post-scan analysis engine — computes insights from scan data

import {
  getScanKeywordResults,
  getTopListingsByScanRun,
  getCategoryBreakdown,
  getTrendSnapshots,
  getAllScanRuns,
  type ScanKeywordResult,
  type TrackedListing,
  type TrendSnapshot,
  type ScanRun,
} from './db';

// --- Interfaces ---

export interface AnalysisOverview {
  totalKeywordsScanned: number;
  uniqueListings: number;
  avgPrice: number;
  avgFavorites: number;
  topCategory: string;
  totalMarketListings: number;
}

export interface CategoryAnalysis {
  keyword: string;
  totalResults: number;
  listingsFetched: number;
  avgPrice: number;
  avgFavorites: number;
  competitionLevel: string;
  demandScore: number;
  topTags: string[];
  avgRevenue: number;
  error: string | null;
}

export interface TrendItem {
  category: string;
  currentFavorites: number;
  previousFavorites: number;
  changePercent: number;
  currentPrice: number;
  previousPrice: number;
  priceChangePercent: number;
  direction: 'rising' | 'declining' | 'stable';
}

export interface PriceInsight {
  category: string;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  medianPrice: number;
  sweetSpot: number; // price of top-performing listings
}

export interface OpportunityGap {
  category: string;
  demandScore: number;
  competitionLevel: string;
  avgFavorites: number;
  avgPrice: number;
  totalResults: number;
  opportunityScore: number; // higher = better opportunity
  reason: string;
}

export interface TagInsight {
  tag: string;
  frequency: number;
  avgFavorites: number;
  categories: string[];
}

export interface FullAnalysis {
  scanRunId: number;
  overview: AnalysisOverview;
  categories: CategoryAnalysis[];
  topProducts: TrackedListing[];
  trends: TrendItem[];
  priceInsights: PriceInsight[];
  opportunities: OpportunityGap[];
  tagAnalysis: TagInsight[];
}

// --- Main computation ---

export function computeFullAnalysis(scanRunId: number): FullAnalysis {
  const keywordResults = getScanKeywordResults(scanRunId);
  const topProducts = getTopListingsByScanRun(scanRunId, 50, 'favorites');
  const categoryBreakdown = getCategoryBreakdown(scanRunId);

  // Overview
  const overview = computeOverview(keywordResults, categoryBreakdown);

  // Categories
  const categories = computeCategories(keywordResults, categoryBreakdown);

  // Trends (compare with previous scan)
  const trends = computeTrends(scanRunId);

  // Price insights
  const priceInsights = computePriceInsights(keywordResults, topProducts);

  // Opportunity gaps
  const opportunities = computeOpportunities(keywordResults);

  // Tag analysis
  const tagAnalysis = computeTagAnalysis(keywordResults);

  return {
    scanRunId,
    overview,
    categories,
    topProducts,
    trends,
    priceInsights,
    opportunities,
    tagAnalysis,
  };
}

function computeOverview(
  results: ScanKeywordResult[],
  breakdown: { keyword: string; count: number; avg_price: number; avg_favorites: number; avg_revenue: number }[]
): AnalysisOverview {
  const successful = results.filter((r) => !r.error);
  const totalListings = breakdown.reduce((s, b) => s + b.count, 0);
  const totalMarket = successful.reduce((s, r) => s + r.total_results, 0);

  const avgPrice = successful.length > 0
    ? Math.round(successful.reduce((s, r) => s + r.avg_price, 0) / successful.length * 100) / 100
    : 0;
  const avgFavs = successful.length > 0
    ? Math.round(successful.reduce((s, r) => s + r.avg_favorites, 0) / successful.length)
    : 0;

  // Top category by avg favorites
  const topCat = breakdown.sort((a, b) => b.avg_favorites - a.avg_favorites)[0];

  return {
    totalKeywordsScanned: successful.length,
    uniqueListings: totalListings,
    avgPrice,
    avgFavorites: avgFavs,
    topCategory: topCat?.keyword || 'N/A',
    totalMarketListings: totalMarket,
  };
}

function computeCategories(
  results: ScanKeywordResult[],
  breakdown: { keyword: string; count: number; avg_price: number; avg_favorites: number; avg_revenue: number }[]
): CategoryAnalysis[] {
  const breakdownMap = new Map(breakdown.map((b) => [b.keyword, b]));

  return results.map((r) => {
    const bd = breakdownMap.get(r.keyword);
    let topTags: string[] = [];
    try { topTags = JSON.parse(r.top_tags || '[]'); } catch { /* skip */ }

    return {
      keyword: r.keyword,
      totalResults: r.total_results,
      listingsFetched: r.listings_fetched,
      avgPrice: r.avg_price,
      avgFavorites: r.avg_favorites,
      competitionLevel: r.competition_level || 'unknown',
      demandScore: r.demand_score,
      topTags,
      avgRevenue: bd ? Math.round(bd.avg_revenue * 100) / 100 : 0,
      error: r.error,
    };
  }).sort((a, b) => b.demandScore - a.demandScore);
}

function computeTrends(currentScanRunId: number): TrendItem[] {
  const allScans = getAllScanRuns();
  const completedScans = allScans.filter((s) => s.status === 'completed');

  if (completedScans.length < 2) return [];

  // Find the previous completed scan (not current)
  const prevScan = completedScans.find((s) => s.id !== currentScanRunId);
  if (!prevScan) return [];

  const currentSnapshots = getTrendSnapshots(currentScanRunId);
  const prevSnapshots = getTrendSnapshots(prevScan.id);

  const prevMap = new Map(prevSnapshots.map((s) => [s.category, s]));

  return currentSnapshots
    .filter((curr) => prevMap.has(curr.category))
    .map((curr) => {
      const prev = prevMap.get(curr.category)!;
      const favChange = prev.avg_favorites > 0
        ? Math.round(((curr.avg_favorites - prev.avg_favorites) / prev.avg_favorites) * 100)
        : 0;
      const priceChange = prev.avg_price > 0
        ? Math.round(((curr.avg_price - prev.avg_price) / prev.avg_price) * 100)
        : 0;

      let direction: 'rising' | 'declining' | 'stable' = 'stable';
      if (favChange > 10) direction = 'rising';
      else if (favChange < -10) direction = 'declining';

      return {
        category: curr.category,
        currentFavorites: Math.round(curr.avg_favorites),
        previousFavorites: Math.round(prev.avg_favorites),
        changePercent: favChange,
        currentPrice: curr.avg_price,
        previousPrice: prev.avg_price,
        priceChangePercent: priceChange,
        direction,
      };
    })
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
}

function computePriceInsights(
  results: ScanKeywordResult[],
  topProducts: TrackedListing[]
): PriceInsight[] {
  // Group top products by keyword
  const byKeyword = new Map<string, TrackedListing[]>();
  for (const p of topProducts) {
    const kw = (p as TrackedListing & { keyword?: string }).keyword || '';
    if (!kw) continue;
    if (!byKeyword.has(kw)) byKeyword.set(kw, []);
    byKeyword.get(kw)!.push(p);
  }

  return results
    .filter((r) => !r.error && r.avg_price > 0)
    .map((r) => {
      const products = byKeyword.get(r.keyword) || [];
      const prices = products.map((p) => p.price).sort((a, b) => a - b);

      const min = prices.length > 0 ? prices[0] : r.avg_price * 0.5;
      const max = prices.length > 0 ? prices[prices.length - 1] : r.avg_price * 2;
      const median = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : r.avg_price;

      // Sweet spot = average price of top 5 by favorites
      const top5 = products.sort((a, b) => b.favorites - a.favorites).slice(0, 5);
      const sweetSpot = top5.length > 0
        ? Math.round(top5.reduce((s, p) => s + p.price, 0) / top5.length * 100) / 100
        : r.avg_price;

      return {
        category: r.keyword,
        minPrice: Math.round(min * 100) / 100,
        maxPrice: Math.round(max * 100) / 100,
        avgPrice: r.avg_price,
        medianPrice: Math.round(median * 100) / 100,
        sweetSpot,
      };
    })
    .sort((a, b) => b.sweetSpot - a.sweetSpot);
}

function computeOpportunities(results: ScanKeywordResult[]): OpportunityGap[] {
  return results
    .filter((r) => !r.error)
    .map((r) => {
      // Opportunity = high demand + low competition
      const demandWeight = r.demand_score / 100;
      const competitionWeight =
        r.competition_level === 'low' ? 1.0 :
        r.competition_level === 'medium' ? 0.6 :
        r.competition_level === 'high' ? 0.3 : 0.1;
      const favBonus = Math.min(r.avg_favorites / 100, 1) * 0.3;

      const opportunityScore = Math.round((demandWeight * 0.4 + competitionWeight * 0.3 + favBonus) * 100);

      let reason = '';
      if (r.demand_score >= 70 && (r.competition_level === 'low' || r.competition_level === 'medium')) {
        reason = 'High demand with manageable competition';
      } else if (r.avg_favorites > 50 && r.competition_level === 'low') {
        reason = 'Strong engagement in underserved niche';
      } else if (r.demand_score >= 50 && r.avg_price > 10) {
        reason = 'Good demand with premium pricing potential';
      } else if (r.competition_level === 'low') {
        reason = 'Low competition — room to establish presence';
      } else {
        reason = 'Moderate opportunity';
      }

      return {
        category: r.keyword,
        demandScore: r.demand_score,
        competitionLevel: r.competition_level || 'unknown',
        avgFavorites: r.avg_favorites,
        avgPrice: r.avg_price,
        totalResults: r.total_results,
        opportunityScore,
        reason,
      };
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore);
}

function computeTagAnalysis(results: ScanKeywordResult[]): TagInsight[] {
  const tagData: Record<string, { frequency: number; totalFavs: number; categories: Set<string> }> = {};

  for (const r of results) {
    if (r.error) continue;
    let tags: string[] = [];
    try { tags = JSON.parse(r.top_tags || '[]'); } catch { continue; }

    for (const tag of tags) {
      if (!tagData[tag]) tagData[tag] = { frequency: 0, totalFavs: 0, categories: new Set() };
      tagData[tag].frequency++;
      tagData[tag].totalFavs += r.avg_favorites;
      tagData[tag].categories.add(r.keyword);
    }
  }

  return Object.entries(tagData)
    .map(([tag, data]) => ({
      tag,
      frequency: data.frequency,
      avgFavorites: Math.round(data.totalFavs / data.frequency),
      categories: Array.from(data.categories).slice(0, 5),
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 50);
}
