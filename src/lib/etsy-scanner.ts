// Automated Etsy marketplace scanner — scans all digital product categories
// Uses module-level singleton for scan state (single-process Next.js dev server)

import { searchEtsyListings, analyzeNiche, estimateSales } from './etsy-research';
import {
  createScanRun,
  updateScanRunProgress,
  completeScanRun,
  saveTrackedListingsWithScan,
  saveScanKeywordResult,
  saveTrendSnapshot,
  getLatestScanRun,
  type ScanRun,
} from './db';

// 85 keywords covering all major digital product categories
export const DIGITAL_PRODUCT_KEYWORDS = [
  // Wall art (11)
  'printable wall art', 'minimalist wall art printable', 'abstract art printable',
  'boho wall art printable', 'botanical print digital', 'watercolor art printable',
  'nursery wall art digital', 'motivational quote print', 'landscape printable art',
  'line art print digital', 'modern wall art printable',
  // Planners (9)
  'digital planner', 'budget planner printable', 'meal planner printable',
  'fitness planner digital', 'student planner printable', 'wedding planner template',
  'goal planner printable', 'adhd planner digital', 'printable planner 2026',
  // Journals (5)
  'digital journal goodnotes', 'gratitude journal printable', 'bullet journal template',
  'prayer journal digital', 'travel journal printable',
  // SVG / Cut files (7)
  'svg bundle cricut', 'cricut svg designs', 'cut file svg bundle',
  'floral svg bundle', 'monogram svg', 'holiday svg bundle', 'craft svg files',
  // Canva templates (6)
  'canva template', 'social media canva template', 'instagram template canva',
  'presentation template canva', 'logo template canva', 'ebook template canva',
  // Notion templates (6)
  'notion template', 'notion planner template', 'notion dashboard template',
  'notion budget tracker', 'notion student template', 'notion life planner',
  // Business templates (6)
  'invoice template printable', 'business card template', 'resume template modern',
  'media kit template', 'price list template', 'contract template editable',
  // Wedding (5)
  'wedding invitation template', 'wedding program template', 'save the date digital',
  'seating chart template', 'wedding menu template',
  // Stickers (5)
  'digital stickers goodnotes', 'planner stickers printable',
  'kawaii stickers digital', 'motivational stickers digital', 'sticker sheet printable',
  // Clipart (5)
  'digital clipart png', 'watercolor clipart set', 'floral clipart png',
  'boho clipart digital', 'christmas clipart png',
  // Social media (5)
  'social media template bundle', 'instagram story template', 'pinterest template',
  'tiktok template', 'youtube thumbnail template',
  // Education (5)
  'printable worksheets kids', 'homeschool printable', 'teacher printable resources',
  'flashcards printable', 'coloring pages digital',
  // Organization (5)
  'checklist printable', 'to do list printable', 'habit tracker printable',
  'cleaning schedule printable', 'inventory template printable',
  // Seasonal (5)
  'christmas printable decor', 'halloween printable', 'valentines printable',
  'baby shower printable', 'birthday invitation template',
];

// --- Module-level scan state singleton ---
interface ScanState {
  isRunning: boolean;
  scanRunId: number | null;
  keywordsScanned: number;
  keywordsTotal: number;
  listingsFound: number;
  listingsNew: number;
  currentKeyword: string;
  errors: string[];
  cancelled: boolean;
}

const scanState: ScanState = {
  isRunning: false,
  scanRunId: null,
  keywordsScanned: 0,
  keywordsTotal: 0,
  listingsFound: 0,
  listingsNew: 0,
  currentKeyword: '',
  errors: [],
  cancelled: false,
};

const RATE_LIMIT_MS = 150; // ~6.6 req/sec, safely under Etsy's 10/sec
const BACKOFF_MS = 5000;   // 5s backoff on 429
const LISTINGS_PER_KEYWORD = 100;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Public API ---

export function getScanStatus(): {
  isRunning: boolean;
  scanRunId: number | null;
  keywordsScanned: number;
  keywordsTotal: number;
  listingsFound: number;
  listingsNew: number;
  currentKeyword: string;
  errors: string[];
} {
  return { ...scanState };
}

export function isScanRunning(): boolean {
  return scanState.isRunning;
}

export function cancelScan(): void {
  scanState.cancelled = true;
}

// 40 cross-stitch-specific keywords covering all proven niches
export const CROSS_STITCH_KEYWORDS = [
  // Core animal costume / NalaAndStitch style (highest sellers)
  'funny cross stitch pattern', 'cross stitch animal pattern',
  'cross stitch goose pattern', 'cross stitch duck pattern',
  'cross stitch frog pattern', 'cross stitch bunny pattern',
  'cross stitch cat pattern', 'cross stitch dog pattern',
  // Kawaii / cute
  'kawaii cross stitch pattern', 'cute cross stitch pattern',
  'cross stitch strawberry pattern', 'cross stitch mushroom pattern',
  // Beginner / simple
  'beginner cross stitch pattern', 'easy cross stitch pattern pdf',
  'simple cross stitch pattern', 'small cross stitch pattern',
  // Instant download / PDF
  'cross stitch pattern pdf', 'cross stitch instant download',
  'cross stitch pdf pattern download', 'modern cross stitch pattern',
  // Floral / botanical
  'cross stitch floral pattern', 'botanical cross stitch pattern',
  'flower cross stitch pattern', 'wildflower cross stitch pdf',
  // Seasonal / holiday
  'christmas cross stitch pattern', 'halloween cross stitch pattern',
  'seasonal cross stitch pattern', 'valentines cross stitch pattern',
  // Funny / snarky captions
  'funny cross stitch quote', 'snarky cross stitch pattern',
  'humorous cross stitch design', 'cross stitch funny quote pdf',
  // Fantasy / cottagecore
  'cottagecore cross stitch pattern', 'fantasy cross stitch pattern',
  'wizard cross stitch pattern', 'fairy cross stitch design',
  // Birds / wildlife
  'cross stitch bird pattern', 'cross stitch wildlife pattern',
  // Gift / misc
  'cross stitch gift pattern', 'cross stitch sampler pattern',
];

export function startFullScan(customKeywords?: string[]): { scanRunId: number } {
  if (scanState.isRunning) {
    throw new Error('A scan is already running');
  }

  const keywords = customKeywords ?? DIGITAL_PRODUCT_KEYWORDS;
  const scanRunId = createScanRun(keywords.length, JSON.stringify({ keywords_count: keywords.length }));

  // Reset state
  scanState.isRunning = true;
  scanState.scanRunId = scanRunId;
  scanState.keywordsScanned = 0;
  scanState.keywordsTotal = keywords.length;
  scanState.listingsFound = 0;
  scanState.listingsNew = 0;
  scanState.currentKeyword = '';
  scanState.errors = [];
  scanState.cancelled = false;

  // Fire and forget — runs in background
  runScan(scanRunId, keywords).catch((err) => {
    console.error('Scan crashed:', err);
    scanState.isRunning = false;
    completeScanRun(scanRunId, 'failed', err instanceof Error ? err.message : 'Unknown error');
  });

  return { scanRunId };
}

// --- Internal scan loop ---

async function runScan(scanRunId: number, keywords: string[]): Promise<void> {
  try {
    for (let i = 0; i < keywords.length; i++) {
      if (scanState.cancelled) {
        completeScanRun(scanRunId, 'cancelled');
        scanState.isRunning = false;
        return;
      }

      const keyword = keywords[i];
      scanState.currentKeyword = keyword;

      try {
        // Fetch listings from Etsy
        const result = await searchEtsyListings(keyword, 'score', LISTINGS_PER_KEYWORD);

        // Enrich with sales + revenue estimates
        const enriched = result.listings.map((l) => {
          const salesEst = estimateSales(l.favorites, l.listing_age_days);
          return {
            ...l,
            sales_estimate: salesEst,
            revenue_estimate: Math.round(l.price * salesEst * 100) / 100,
            scan_run_id: scanRunId,
            keyword,
            shop_name: l.shop_name || null,
          };
        });

        // Save listings (upsert)
        const newCount = saveTrackedListingsWithScan(enriched);

        // Analyze niche
        const analysis = analyzeNiche(
          enriched.map((l) => ({ price: l.price, favorites: l.favorites, views: l.views, listing_age_days: l.listing_age_days })),
          result.total
        );

        // Collect top tags
        const tagCounts: Record<string, number> = {};
        for (const listing of enriched) {
          try {
            const tags = JSON.parse(listing.tags) as string[];
            for (const tag of tags) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          } catch { /* skip */ }
        }
        const topTags = Object.entries(tagCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([tag]) => tag);

        // Save keyword result
        saveScanKeywordResult({
          scan_run_id: scanRunId,
          keyword,
          total_results: result.total,
          listings_fetched: enriched.length,
          avg_price: analysis.avg_price,
          avg_favorites: analysis.avg_favorites,
          competition_level: analysis.competition_level,
          demand_score: analysis.demand_score,
          top_tags: JSON.stringify(topTags),
        });

        // Save trend snapshot
        const avgSales = enriched.length > 0
          ? enriched.reduce((s, l) => s + l.sales_estimate, 0) / enriched.length
          : 0;
        saveTrendSnapshot({
          scan_run_id: scanRunId,
          category: keyword,
          avg_price: analysis.avg_price,
          avg_favorites: analysis.avg_favorites,
          total_listings: result.total,
          avg_sales_estimate: Math.round(avgSales * 100) / 100,
          top_tags: JSON.stringify(topTags),
        });

        // Update progress
        scanState.keywordsScanned = i + 1;
        scanState.listingsFound += enriched.length;
        scanState.listingsNew += newCount;

        updateScanRunProgress(scanRunId, i + 1, scanState.listingsFound, scanState.listingsNew);

      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        scanState.errors.push(`${keyword}: ${msg}`);

        // Save error result
        saveScanKeywordResult({
          scan_run_id: scanRunId,
          keyword,
          total_results: 0,
          listings_fetched: 0,
          avg_price: 0,
          avg_favorites: 0,
          competition_level: 'unknown',
          demand_score: 0,
          top_tags: '[]',
          error: msg,
        });

        // If rate limited, backoff
        if (msg.includes('429')) {
          await delay(BACKOFF_MS);
        }
      }

      // Rate limit between requests
      await delay(RATE_LIMIT_MS);
    }

    completeScanRun(scanRunId, 'completed');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    completeScanRun(scanRunId, 'failed', msg);
  } finally {
    scanState.isRunning = false;
  }
}

// Get last completed scan for quick reference
export function getLastCompletedScan(): ScanRun | undefined {
  return getLatestScanRun();
}
