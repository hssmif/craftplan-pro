// ══════════════════════════════════════════════════════════════════════
// Research — Market Pulse (niche-agnostic digital-product demand signals)
//
// GET /api/research/market-pulse?refresh=1
//
// THE PROBLEM THIS SOLVES:
//   /research/ideas/generate is great at writing product ideas, but it
//   only knows what the seller has scanned. If the seller hasn't scanned
//   a hot niche, Gemini never sees it. Result: ideas feel guessed.
//
// WHAT THIS DOES:
//   Pulls LIVE demand signals from 5 sources in parallel, applies a
//   deterministic ≥2-source corroboration filter to kill single-source
//   noise (and Gemini's potential hallucinations downstream), then
//   enriches survivors with REAL Etsy v3 competition data.
//
// SOURCES:
//   1. Google Trends RSS — daily/realtime trending searches in US
//   2. Google Autocomplete — what people are typing into search for
//      digital-product seed queries ("etsy printable", "digital planner",
//      "svg files", etc.)
//   3. Pinterest v5 Trends API — fastest-growing keywords WoW (real
//      growth %, NOT autocomplete suggestions). Falls back to the public
//      typeahead if PINTEREST_ACCESS_TOKEN is missing/expired.
//   4. Reddit hot — across BUYER and SELLER subs (r/Etsy, r/EtsySellers,
//      r/PrintOnDemand, r/DigitalPlanner, r/SomebodyMakeThis,
//      r/PlannerAddicts). Reveals real demand requests like "where can I
//      buy a printable X" and what sellers are seeing convert.
//   5. Etsy v3 official API — top-relevance + top-by-favorites listings
//      for seed digital-product queries (real competition data).
//
// CORROBORATION (the "no guessing" guarantee):
//   - Each source contributes terms to a Map<normalizedTerm, Set<sourceId>>.
//   - A term is ONLY surfaced if it appears in ≥ minSources (default 2).
//   - Normalization: lowercase + trim + strip punctuation + singularize.
//   - This is fully deterministic — Gemini cannot inject hallucinated
//     terms or fake source citations. Gemini ONLY classifies category
//     and writes a 1-line "why now" — it never adds or removes terms.
//
// ENRICHMENT:
//   For each surviving term we hit `/listings/active` to get the REAL
//   listing count (competition) and average favorites of top results.
//   This is the same Etsy v3 API path already in use elsewhere — TOS-safe.
//
// CACHE:
//   Result is cached in-process for 30 minutes. ?refresh=1 bypasses.
//   APIs hit on every refresh: ~8 external HTTP calls + N Etsy calls
//   where N ≈ number of corroborated terms (≤30 by default).
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import {
  fetchGoogleTrends,
  fetchGoogleAutocomplete,
  fetchPinterestTrendsAPI,
  fetchPinterestTrends,
  fetchEtsyInsights,
  type TrendSource,
  type TrendItem,
} from "@/lib/trend-sources";
import { searchEtsyListings } from "@/lib/etsy-research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_CHAIN = ["gemini-2.5-flash", "gemini-2.0-flash-lite"];

// ── Tuning knobs ─────────────────────────────────────────────────────
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const MIN_SOURCES = 2;               // corroboration threshold
const MAX_ENRICHED_TERMS = 30;       // cap on Etsy enrichment calls
const ENRICHMENT_CONCURRENCY = 5;    // parallel Etsy lookups

// Seed queries for autocomplete — niche-agnostic across digital products.
const AUTOCOMPLETE_SEEDS = [
  "etsy digital download",
  "etsy printable",
  "digital planner",
  "svg cut file",
  "wedding printable",
  "wall art printable",
  "canva template",
  "notion template",
  "coloring page",
];

// Reddit subs that surface REAL buyer demand or seller market intel.
const REDDIT_SUBS = [
  "Etsy",            // buyers + sellers, "where can I buy" requests
  "EtsySellers",     // seller market intel
  "PrintOnDemand",   // POD shop owners
  "DigitalPlanner",  // buyer community
  "PlannerAddicts",  // buyer community
  "SomebodyMakeThis", // explicit "I would buy this" posts
];

// Etsy seed searches to capture what's literally on Etsy right now.
const ETSY_SEEDS = [
  "digital download",
  "printable",
  "svg",
  "digital planner",
];

// Digital-product categories Gemini classifies terms into.
const CATEGORIES = [
  "wall-art",
  "planner",
  "svg",
  "printable",
  "journal",
  "invitation",
  "template",
  "coloring",
  "sticker",
  "ebook",
  "preset",
  "font",
  "other",
] as const;
type Category = (typeof CATEGORIES)[number];

// ── In-process cache ─────────────────────────────────────────────────
interface CachedResult {
  ts: number;
  payload: MarketPulseResponse;
}
let CACHE: CachedResult | null = null;

// ── Response shape ───────────────────────────────────────────────────
interface CorroboratedTerm {
  term: string;             // the original (best) display form
  normalized: string;       // lowercase normalized key
  sources: string[];        // source IDs that flagged it
  source_count: number;     // sources.length
  // Per-source raw items so the UI can show "saw this on Reddit as: ___".
  evidence: Array<{ source: string; text: string; score?: number; url?: string }>;
  // Filled in during enrichment phase (Etsy v3):
  etsy_competition: number | null; // total listings matching this term
  etsy_avg_favorites: number | null;
  etsy_top_image: string | null;
  // Filled by Gemini classification step (best-effort, never blocks):
  category: Category;
  why_now: string;          // ≤ 1 sentence, grounded in evidence
  demand_score: number;     // 0-100, computed (not Gemini-decided)
}

interface BuildableLane {
  id: "cross-stitch" | "wall-art" | "svg" | "spreadsheet" | "printable" | "notion" | "pod";
  label: string;
  studio: string;
  fit: string;
  path: string;
  query: string;
}

interface MarketAlert extends CorroboratedTerm {
  alert_kind: "etsy-insights";
  source_label: string;
  insight_context: string | null;
  buildable_lanes: BuildableLane[];
}

interface MarketPulseResponse {
  fetched_at: string;
  cache_age_ms: number;
  sources: Array<{ id: string; label: string; fetched: boolean; count: number; error?: string }>;
  total_raw_items: number;
  total_corroborated: number;
  by_category: Record<string, CorroboratedTerm[]>;
  top: CorroboratedTerm[]; // top 20 across all categories, ranked
  alerts: MarketAlert[];   // Etsy Marketplace Insights alert-style signals, including physical trends we can convert into digital lanes
}

// ══════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  const now = Date.now();

  if (!refresh && CACHE && now - CACHE.ts < CACHE_TTL_MS) {
    return NextResponse.json(
      { ...CACHE.payload, cache_age_ms: now - CACHE.ts },
      { headers: { "X-Cache": "HIT" } },
    );
  }

  try {
    // ── Phase 1: parallel signal collection ─────────────────────────
    // 6 sources: the 5 originals + Etsy Marketplace Insights (the only
    // first-party buyer-search-volume signal). Insights is read from
    // local SQLite (populated by the Chrome extension), so it's fast
    // and never fails on network — fetchEtsyInsights returns fetched:
    // false with a no-captures error string when the user hasn't
    // browsed Insights yet, which corroboration tolerates gracefully.
    const [google, autocomplete, pinterestAPI, pinterestPublic, reddit, etsy, insights] =
      await Promise.all([
        fetchGoogleTrends(),
        fetchAutocompleteForSeeds(),
        fetchPinterestTrendsAPI("US", "growing", 30),
        // Public typeahead acts as fallback if v5 API is missing/expired
        fetchPinterestTrends("digital download etsy"),
        fetchRedditDigitalProducts(),
        fetchEtsySignals(),
        // Pull all Insights captures here, including physical terms. A
        // physical buyer trend like "patriotic wreaths" can still be a
        // strong digital opportunity once translated into cross-stitch,
        // SVG, printable decor, or wall-art lanes.
        fetchEtsyInsights({ sinceHours: 24 * 30, limit: 150, digitalOnly: false }),
      ]);

    // If Pinterest API succeeded, prefer it; otherwise public typeahead.
    const pinterest: TrendSource = pinterestAPI.fetched ? pinterestAPI : pinterestPublic;

    const allSources: Array<{ id: string; src: TrendSource }> = [
      { id: "google-trends", src: google },
      { id: "google-autocomplete", src: autocomplete },
      { id: "pinterest", src: pinterest },
      { id: "reddit", src: reddit },
      { id: "etsy", src: etsy },
      // etsy-insights = the buyer-side ground-truth signal. When the
      // extension has captured data, this corroborates with the other
      // sources to surface real-volume-validated demand. When empty,
      // corroborateAcrossSources just skips it (fetched: false).
      { id: "etsy-insights", src: insights },
    ];

    // ── Phase 2: corroboration (deterministic) ──────────────────────
    const corroborated = corroborateAcrossSources(allSources, MIN_SOURCES);

    // ── Phase 3: enrichment with REAL Etsy v3 competition data ──────
    const enriched = await enrichWithEtsy(corroborated.slice(0, MAX_ENRICHED_TERMS));

    // ── Phase 4: best-effort Gemini classification + why-now ────────
    const classified = await classifyWithGemini(enriched);

    // ── Phase 5: score + group ──────────────────────────────────────
    const scored = classified.map((t) => ({
      ...t,
      demand_score: computeDemandScore(t),
    }));

    const byCategory: Record<string, CorroboratedTerm[]> = {};
    for (const t of scored) {
      (byCategory[t.category] ??= []).push(t);
    }
    for (const k of Object.keys(byCategory)) {
      byCategory[k].sort((a, b) => b.demand_score - a.demand_score);
    }

    const top = [...scored].sort((a, b) => b.demand_score - a.demand_score).slice(0, 20);
    const alerts = await buildEtsyTrendAlerts(insights, top);

    const payload: MarketPulseResponse = {
      fetched_at: new Date().toISOString(),
      cache_age_ms: 0,
      sources: allSources.map(({ id, src }) => ({
        id,
        label: src.source,
        fetched: src.fetched,
        count: src.items.length,
        error: src.error,
      })),
      total_raw_items: allSources.reduce((s, { src }) => s + src.items.length, 0),
      total_corroborated: scored.length,
      by_category: byCategory,
      top,
      alerts,
    };

    CACHE = { ts: now, payload };
    return NextResponse.json(payload, { headers: { "X-Cache": "MISS" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "market-pulse failed" },
      { status: 500 },
    );
  }
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 1 HELPERS — niche-agnostic signal fetchers
// ══════════════════════════════════════════════════════════════════════

async function fetchAutocompleteForSeeds(): Promise<TrendSource> {
  const items: TrendItem[] = [];
  const seen = new Set<string>();
  const results = await Promise.allSettled(
    AUTOCOMPLETE_SEEDS.map((seed) => fetchGoogleAutocomplete(seed)),
  );
  for (const r of results) {
    if (r.status === "fulfilled") {
      for (const item of r.value.items) {
        const key = item.term.toLowerCase().trim();
        if (!seen.has(key)) {
          seen.add(key);
          items.push(item);
        }
      }
    }
  }
  return {
    source: "Google Autocomplete",
    icon: "🔍",
    items: items.slice(0, 80),
    fetched: items.length > 0,
  };
}

async function fetchRedditDigitalProducts(): Promise<TrendSource> {
  const items: TrendItem[] = [];
  try {
    const results = await Promise.allSettled(
      REDDIT_SUBS.map(async (sub) => {
        const url = `https://www.reddit.com/r/${sub}/hot.json?limit=20&raw_json=1`;
        const resp = await fetch(url, {
          headers: { "User-Agent": "CraftPlan/1.0 (Research)" },
          signal: AbortSignal.timeout(10000),
        });
        if (!resp.ok) return [];
        const data = await resp.json();
        const posts: Array<{ data: { title: string; score: number; permalink: string; subreddit: string; num_comments: number; selftext?: string } }> =
          data?.data?.children || [];
        return posts.map((p) => ({
          term: p.data.title,
          score: p.data.score,
          url: `https://reddit.com${p.data.permalink}`,
          context: `r/${p.data.subreddit} · ${p.data.score}↑ · ${p.data.num_comments}💬`,
        }));
      }),
    );
    const seen = new Set<string>();
    for (const r of results) {
      if (r.status === "fulfilled") {
        for (const item of r.value) {
          const lower = item.term.toLowerCase();
          if (
            lower.includes("[mod]") ||
            lower.startsWith("weekly ") ||
            lower.includes("rules") ||
            lower.includes("megathread")
          )
            continue;
          if (!seen.has(lower)) {
            seen.add(lower);
            items.push(item);
          }
        }
      }
    }
    items.sort((a, b) => (b.score || 0) - (a.score || 0));
  } catch {
    return { source: "Reddit", icon: "🔥", items: [], fetched: false, error: "Failed" };
  }
  return { source: "Reddit", icon: "🔥", items: items.slice(0, 80), fetched: items.length > 0 };
}

async function fetchEtsySignals(): Promise<TrendSource> {
  const items: TrendItem[] = [];
  const seen = new Set<string>();
  try {
    const results = await Promise.allSettled(
      ETSY_SEEDS.map((seed) => searchEtsyListings(seed, "score", 25)),
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        for (const l of r.value.listings) {
          const lower = l.title.toLowerCase();
          if (!seen.has(lower)) {
            seen.add(lower);
            items.push({
              term: l.title,
              score: l.favorites,
              url: l.url,
              context: `${l.favorites} favorites · $${l.price}`,
            });
          }
        }
      }
    }
    items.sort((a, b) => (b.score || 0) - (a.score || 0));
  } catch {
    return { source: "Etsy v3", icon: "🛍️", items: [], fetched: false, error: "Failed" };
  }
  return { source: "Etsy v3", icon: "🛍️", items: items.slice(0, 80), fetched: items.length > 0 };
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 2 — DETERMINISTIC CORROBORATION (the no-guessing core)
// ══════════════════════════════════════════════════════════════════════

// Normalize: lowercase + strip punctuation + collapse spaces + naive
// singularization (drop trailing 's' on words longer than 3 chars).
// Keep this simple — fuzzy matching can come later.
function normalizeTerm(raw: string): string {
  let t = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Singularize each word
  t = t
    .split(" ")
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ");
  return t;
}

// Extract candidate "product-y" 1-4-word phrases from a raw title.
// Reddit titles are full sentences; Pinterest/Trends are short. We grab
// running 1-4-grams and let corroboration filter out junk.
function extractPhrases(raw: string): string[] {
  const words = normalizeTerm(raw)
    .split(" ")
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  const out = new Set<string>();
  for (let n = 1; n <= 4; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      const phrase = words.slice(i, i + n).join(" ");
      if (phrase.length >= 4) out.add(phrase);
    }
  }
  return [...out];
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "are", "you", "your", "this", "that", "from",
  "have", "has", "but", "not", "all", "can", "just", "what", "when", "where",
  "how", "why", "who", "any", "some", "out", "get", "got", "new", "old",
  "best", "top", "now", "etsy", "shop", "store", "sell", "buy", "looking",
  "anyone", "anybody", "need", "want", "would", "could", "should", "please",
  "thanks", "help", "made", "make", "love", "like", "really", "very", "much",
  "good", "great", "amazing", "perfect", "cute", "wow",
]);

function corroborateAcrossSources(
  sources: Array<{ id: string; src: TrendSource }>,
  minSources: number,
): CorroboratedTerm[] {
  // Map<normalizedTerm, { sources: Set, evidence: [...], bestDisplay: string }>
  const map = new Map<
    string,
    {
      sources: Set<string>;
      evidence: Array<{ source: string; text: string; score?: number; url?: string }>;
      bestDisplay: string;
      bestLen: number;
    }
  >();

  for (const { id, src } of sources) {
    if (!src.fetched) continue;
    // Track which normalized phrases we already credited to THIS source
    // (otherwise a single Reddit title with 10 phrases inflates source_count).
    const thisSourceSeen = new Set<string>();
    for (const item of src.items) {
      const phrases = extractPhrases(item.term);
      // Also add the full normalized term as a candidate, even if long
      const full = normalizeTerm(item.term);
      if (full.length >= 4) phrases.push(full);

      for (const p of phrases) {
        if (thisSourceSeen.has(p)) continue;
        thisSourceSeen.add(p);

        const existing = map.get(p);
        if (existing) {
          existing.sources.add(id);
          existing.evidence.push({ source: id, text: item.term, score: item.score, url: item.url });
        } else {
          map.set(p, {
            sources: new Set([id]),
            evidence: [{ source: id, text: item.term, score: item.score, url: item.url }],
            bestDisplay: p,
            bestLen: p.split(" ").length,
          });
        }
      }
    }
  }

  // Filter ≥minSources, then collapse near-duplicates by preferring longer
  // phrases (more specific = better idea seeds).
  const survivors: CorroboratedTerm[] = [];
  for (const [norm, v] of map.entries()) {
    if (v.sources.size < minSources) continue;
    survivors.push({
      term: v.bestDisplay,
      normalized: norm,
      sources: [...v.sources],
      source_count: v.sources.size,
      evidence: v.evidence.slice(0, 6),
      etsy_competition: null,
      etsy_avg_favorites: null,
      etsy_top_image: null,
      category: "other",
      why_now: "",
      demand_score: 0,
    });
  }

  // Rank initially by source_count desc, then by total evidence weight.
  survivors.sort((a, b) => {
    if (b.source_count !== a.source_count) return b.source_count - a.source_count;
    const aw = a.evidence.reduce((s, e) => s + (e.score || 0), 0);
    const bw = b.evidence.reduce((s, e) => s + (e.score || 0), 0);
    return bw - aw;
  });

  return survivors;
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 3 — REAL Etsy v3 enrichment for survivors
// ══════════════════════════════════════════════════════════════════════

async function enrichWithEtsy(terms: CorroboratedTerm[]): Promise<CorroboratedTerm[]> {
  // Concurrency-limited parallelism so we don't blow Etsy's rate limit.
  const out: CorroboratedTerm[] = [];
  for (let i = 0; i < terms.length; i += ENRICHMENT_CONCURRENCY) {
    const batch = terms.slice(i, i + ENRICHMENT_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (t) => {
        try {
          const r = await searchEtsyListings(t.term, undefined, 10);
          const favs = r.listings.map((l) => l.favorites).filter((f) => f > 0);
          const avg = favs.length > 0 ? Math.round(favs.reduce((s, f) => s + f, 0) / favs.length) : null;
          return {
            ...t,
            etsy_competition: r.total ?? null,
            etsy_avg_favorites: avg,
            etsy_top_image: r.listings[0]?.image_url ?? null,
          };
        } catch {
          return t; // leave nulls
        }
      }),
    );
    for (const r of results) {
      if (r.status === "fulfilled") out.push(r.value);
    }
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════
// ETSY INSIGHTS ALERTS — high-volume buyer terms, even when one-source
// ══════════════════════════════════════════════════════════════════════

const BLOCKED_RESEARCH_TERM_RE =
  /\b(tarot|witch|witchy|skull|occult|spell|ouija|gothic\s+skull|anatomy|anatomical|evil\s+eye|third\s+eye)\b/i;

const GENERIC_ALERT_TERMS = new Set([
  "art",
  "wall art",
  "wedding",
  "gift",
  "gifts",
  "planner",
  "template",
  "printable",
  "svg",
  "digital download",
  "home decor",
]);

async function buildEtsyTrendAlerts(
  insights: TrendSource,
  alreadyRanked: CorroboratedTerm[],
): Promise<MarketAlert[]> {
  if (!insights.fetched || insights.items.length === 0) return [];

  const rankedNorms = new Set(alreadyRanked.map((t) => t.normalized));
  const seen = new Set<string>();
  const candidates: CorroboratedTerm[] = [];

  for (const item of insights.items) {
    const term = item.term.trim();
    const normalized = normalizeTerm(term);
    if (!term || term.length < 3) continue;
    if (BLOCKED_RESEARCH_TERM_RE.test(term)) continue;
    if (GENERIC_ALERT_TERMS.has(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const baseScore = typeof item.score === "number" ? item.score : 0;
    const alreadyInPulse = rankedNorms.has(normalized);
    candidates.push({
      term,
      normalized,
      sources: ["etsy-insights"],
      source_count: alreadyInPulse ? 2 : 1,
      evidence: [
        {
          source: "etsy-insights",
          text: item.context ? `${term} · ${item.context}` : term,
          score: baseScore,
          url: item.url,
        },
      ],
      etsy_competition: null,
      etsy_avg_favorites: null,
      etsy_top_image: null,
      category: "other",
      why_now: item.context
        ? `Etsy Marketplace Insights shows buyer search activity for this term (${item.context}).`
        : "Etsy Marketplace Insights flagged this as current buyer-search demand.",
      demand_score: Math.max(35, Math.min(100, Math.round(baseScore))),
    });

    if (candidates.length >= 12) break;
  }

  const enriched = await enrichWithEtsy(candidates.slice(0, 10));
  return enriched
    .map((t) => ({
      ...t,
      alert_kind: "etsy-insights" as const,
      source_label: "Etsy Marketplace Insights",
      insight_context: t.evidence[0]?.text ?? null,
      buildable_lanes: suggestBuildableLanes(t.term),
      demand_score: computeDemandScore({
        ...t,
        // Insights-only terms deserve a floor because this is first-party
        // Etsy buyer search data; the UI labels them separately from
        // multi-source corroborated terms.
        source_count: Math.max(t.source_count, 2),
      }),
    }))
    .sort((a, b) => b.demand_score - a.demand_score)
    .slice(0, 8);
}

function suggestBuildableLanes(term: string): BuildableLane[] {
  const t = term.toLowerCase();
  const lanes: BuildableLane[] = [];
  const add = (lane: BuildableLane) => {
    if (!lanes.some((existing) => existing.id === lane.id)) lanes.push(lane);
  };

  const isPlanning =
    /\b(planner|budget|tracker|spreadsheet|calendar|itinerary|inventory|crm|gradebook|habit|meal|recipe|finance|client|project)\b/.test(t);
  const isNeedle =
    /\b(cross\s*stitch|embroidery|needlepoint|bookmark|pattern)\b/.test(t);
  const isDecor =
    /\b(wreath|door|decor|wall|poster|print|patriotic|americana|floral|flower|cottage|kitchen|nursery|home)\b/.test(t);
  const isCutFile =
    /\b(svg|decal|shirt|tumbler|cricut|silhouette|sticker|badge|keychain|charm|monogram|bow|banner)\b/.test(t);
  const isEvent =
    /\b(wedding|birthday|baby|shower|graduation|party|invitation|menu|sign|seating|guest)\b/.test(t);

  if (isPlanning) {
    add({
      id: "spreadsheet",
      label: "Spreadsheet system",
      studio: "Product Factory",
      fit: "Build dashboards, trackers, calendars, and automations from the trend.",
      path: "/factory",
      query: `${term} spreadsheet template`,
    });
    add({
      id: "notion",
      label: "Notion template",
      studio: "Notion Import",
      fit: "Turn the workflow into a database-driven workspace.",
      path: "/notion-import",
      query: `${term} notion template`,
    });
  }

  if (isNeedle || isDecor || /\b(book lover|reading|library)\b/.test(t)) {
    add({
      id: "cross-stitch",
      label: "Cross-stitch pattern",
      studio: "Cross Stitch Studio",
      fit: "Translate the visual demand into a downloadable pattern bundle.",
      path: "/cross-stitch",
      query: `${term} cross stitch pattern`,
    });
  }

  if (isCutFile || isDecor || isEvent) {
    add({
      id: "svg",
      label: "SVG / cut file",
      studio: "Design Studio",
      fit: "Make the trend useful for Cricut, stickers, shirts, signs, and bundles.",
      path: "/factory",
      query: `${term} svg cut file`,
    });
  }

  if (isDecor || isEvent) {
    add({
      id: "wall-art",
      label: "Printable decor",
      studio: "Wall Art Studio",
      fit: "Create matching wall art, signs, party decor, or seasonal print sets.",
      path: "/wall-art",
      query: `${term} printable wall art`,
    });
  }

  if (isEvent || isPlanning || /\b(card|label|tag|checklist|template)\b/.test(t)) {
    add({
      id: "printable",
      label: "Printable kit",
      studio: "Product Factory",
      fit: "Package checklists, labels, signs, pages, and buyer-ready PDFs.",
      path: "/factory",
      query: `${term} printable template`,
    });
  }

  if (lanes.length === 0) {
    add({
      id: "printable",
      label: "Printable angle",
      studio: "Product Factory",
      fit: "Validate the search term as a downloadable template or kit.",
      path: "/factory",
      query: `${term} printable`,
    });
    add({
      id: "wall-art",
      label: "Visual product",
      studio: "Wall Art Studio",
      fit: "Convert the demand into inspectable visual listing assets.",
      path: "/wall-art",
      query: `${term} wall art`,
    });
  }

  return lanes.slice(0, 4);
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 4 — Gemini classification (best-effort, NEVER blocks)
// ══════════════════════════════════════════════════════════════════════

async function classifyWithGemini(terms: CorroboratedTerm[]): Promise<CorroboratedTerm[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || terms.length === 0) return terms;

  // Compact prompt — we only need category + 1-line why_now per term.
  // Evidence is included so why_now is grounded, not invented.
  const compact = terms.map((t, idx) => ({
    idx,
    term: t.term,
    sources: t.sources,
    evidence: t.evidence.slice(0, 3).map((e) => `${e.source}: "${e.text.slice(0, 100)}"`),
    etsy_competition: t.etsy_competition,
    etsy_avg_favorites: t.etsy_avg_favorites,
  }));

  const prompt = `You are classifying corroborated demand signals for Etsy digital products.

For each signal below, return:
  - category: ONE of ${CATEGORIES.join(", ")} (use "other" if none fit)
  - why_now: ONE concise sentence (≤ 25 words) explaining why this is trending RIGHT NOW, grounded ONLY in the provided evidence (cite source names like "Reddit" or "Pinterest"). Do NOT invent facts.

You MAY NOT change the term, remove signals, or add new ones. Return EXACTLY ${terms.length} entries in the same order.

Signals:
${JSON.stringify(compact, null, 2)}

Output strict JSON: { "classifications": [{ "idx": 0, "category": "...", "why_now": "..." }, ...] }`;

  try {
    const raw = await callGemini(apiKey, prompt);
    const parsed = extractJson(raw) as { classifications?: Array<{ idx: number; category: string; why_now: string }> };
    const map = new Map<number, { category: string; why_now: string }>();
    for (const c of parsed.classifications ?? []) {
      map.set(c.idx, { category: c.category, why_now: c.why_now });
    }
    return terms.map((t, idx) => {
      const c = map.get(idx);
      if (!c) return t;
      const cat = (CATEGORIES as readonly string[]).includes(c.category)
        ? (c.category as Category)
        : "other";
      return { ...t, category: cat, why_now: c.why_now?.slice(0, 200) || "" };
    });
  } catch {
    // Gemini failed — keep terms as-is with category="other"
    return terms;
  }
}

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  let lastErr: unknown = null;
  for (const model of MODEL_CHAIN) {
    try {
      const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 16384,
            temperature: 0.3,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (resp.status === 429 || resp.status === 503) {
        lastErr = `${model}: ${resp.status}`;
        continue;
      }
      if (!resp.ok) {
        lastErr = `${model}: ${resp.status}`;
        continue;
      }
      const data = await resp.json();
      const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Gemini failed: ${String(lastErr)}`);
}

function extractJson(raw: string): unknown {
  let txt = raw.trim();
  if (txt.startsWith("```")) {
    txt = txt.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return JSON.parse(txt);
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 5 — Demand score (deterministic, NOT Gemini-decided)
// ══════════════════════════════════════════════════════════════════════
//
// Why this exists: the first version of this scoring put generic 1-word
// terms ("planner", "digital", "print") at the top because they appear
// in every source list — high corroboration but useless to a seller.
// A real product idea is SPECIFIC (3-4 words like "digital planner 2026"
// or "minimalist wall art" — Etsy keywords sellers actually rank for).
//
// This formula rewards specificity + buyer-engagement signals over raw
// corroboration count. Components:
//
//   1. Corroboration base  (0-48 pts)  source_count × 12
//   2. Specificity         (-10 to +15) 1-word noise penalty, 3-4w bonus
//   3. Pinterest growth    (0-25 pts)  WoW % from v5 API if present
//   4. Favorites velocity  (0-20 pts)  avg_favorites per 10K listings —
//                                       the KILLER signal: real sellers
//                                       crushing it in a niche
//   5. Low-competition     (0-10 pts)  blue-ocean bonus, < 50K listings
//   6. Saturation penalty  (-20 to 0)  > 5M listings = too crowded
//
// Caps 0-100. Pure math — no Gemini, no guessing.

function computeDemandScore(t: CorroboratedTerm): number {
  let score = 0;

  // 1. Corroboration base
  score += t.source_count * 12;

  // 2. Specificity — single words are noise that happens to be everywhere.
  //    Real product ideas are 3-4 word phrases sellers actually keyword for.
  const wordCount = t.term.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount === 1) score -= 10;
  else if (wordCount === 2) score += 5;
  else if (wordCount === 3) score += 12;
  else score += 15; // 4+ words

  // 3. Pinterest growth % (if v5 API supplied it)
  const pinEv = t.evidence.find((e) => e.source === "pinterest" && typeof e.score === "number");
  if (pinEv) score += Math.min(25, (pinEv.score || 0) / 4);

  // 4. Favorites velocity — favorites per 10K Etsy listings.
  //    High velocity = real sellers winning real buyers in this niche.
  //    Example: "monthly planner" at 2175 avg favs / 257K comp = velocity 85
  //    → log10(86)*8 ≈ 15 pts (very strong)
  if (
    t.etsy_avg_favorites !== null &&
    t.etsy_avg_favorites > 0 &&
    t.etsy_competition !== null &&
    t.etsy_competition > 0
  ) {
    const velocity = t.etsy_avg_favorites / (t.etsy_competition / 10000);
    score += Math.min(20, Math.log10(velocity + 1) * 8);
  }

  // 5. Low-competition opportunity bonus
  if (t.etsy_competition !== null && t.etsy_competition > 0) {
    if (t.etsy_competition < 2000) score += 10;
    else if (t.etsy_competition < 10000) score += 6;
    else if (t.etsy_competition < 50000) score += 3;
  }

  // 6. Saturation penalty — too crowded to break into
  if (t.etsy_competition !== null) {
    if (t.etsy_competition > 10_000_000) score -= 20;
    else if (t.etsy_competition > 5_000_000) score -= 10;
  }

  // 7. Etsy Marketplace Insights bump — buyer-side ground truth signal.
  //    When the captured Insights data confirms this term, that's the
  //    strongest demand signal in the pipeline (real Etsy buyers
  //    actually typing this into search). Weight it like a Pinterest
  //    growth signal — up to +20 — scaled by the Insights normalizedScore.
  const insightsEv = t.evidence.find(
    (e) => e.source === "etsy-insights" && typeof e.score === "number",
  );
  if (insightsEv) {
    score += Math.min(20, (insightsEv.score || 0) / 5);
  }

  return Math.round(Math.max(0, Math.min(100, score)));
}
