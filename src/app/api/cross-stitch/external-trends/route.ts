// GET /api/cross-stitch/external-trends
//
// Aggregates real cross-stitch trend signals from three sources:
//
//   1. Reddit r/CrossStitch — top posts this week (no auth needed)
//      URL: https://www.reddit.com/r/crossstitch/top.json?t=week&limit=25
//      Extracts: post titles, upvotes, comment count
//      Benefit: shows what stitchers are ACTUALLY making and sharing right now
//
//   2. Reddit r/CrossStitch "new" feed — fresh posts for emerging topics
//      URL: https://www.reddit.com/r/crossstitch/new.json?limit=25
//
//   3. Etsy autocomplete — trending search completions for "cross stitch [X]"
//      URL: /api/cross-stitch/autocomplete?q=cross+stitch
//      Benefit: what buyers are typing into Etsy search right now
//
// Results are cached for 30 minutes (reddit rate limit ~60 req/min but
// we want to be polite) via a module-level cache.

import { NextResponse } from "next/server";
import { isTrademarked } from "@/lib/trademark-filter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── Types ────────────────────────────────────────────────────────────────

export interface RedditPost {
  title: string;
  url: string;
  score: number;
  numComments: number;
  thumbnail: string | null;
  // Extracted cross-stitch subjects from the title
  subjects: string[];
}

export interface EtsyTrendTerm {
  term: string;
  source: "etsy_autocomplete";
}

export interface PinterestTrendTerm {
  keyword: string;
  pctChange?: number;
}

export interface ExternalTrendsResponse {
  redditTop: RedditPost[];
  redditNew: RedditPost[];
  etsyTrends: EtsyTrendTerm[];
  pinterestTrends: PinterestTrendTerm[];
  fetchedAt: string;
  errors: string[];
}

// ── Module-level cache (30 min TTL) ──────────────────────────────────────

let cache: { data: ExternalTrendsResponse; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const BLOCKED_TREND_RE =
  /tarot|occult|witch|witchy|skull|skelet|bone\b|\beye\b|evil eye|hand of|pentagram|ouija|demon|devil|ghost|satan|ritual|blood|gore|goth|gothic|mystic|mystical|horror|haunted|grave|vampire|zombie|anatom|crucifix|\bjesus\b|christian|church|hijab|gun\b|knife\b/i;

function isSafeTrendText(text: string): boolean {
  return Boolean(text.trim()) && !BLOCKED_TREND_RE.test(text) && !isTrademarked(text);
}

// ── Subject extraction ───────────────────────────────────────────────────
// Pull animal names, subject nouns, and themes from Reddit post titles.
// Cheap heuristic: split on common words + check against a known list.

const SUBJECT_HINTS = [
  // Animals
  "cat", "cats", "dog", "dogs", "duck", "ducks", "goose", "geese",
  "frog", "frogs", "bunny", "bunnies", "rabbit", "rabbits",
  "bird", "birds", "owl", "owls", "fox", "foxes", "bear", "bears",
  "mouse", "mice", "hamster", "hedgehog", "raccoon", "deer",
  "horse", "cow", "pig", "sheep", "chicken", "hen", "parrot",
  "penguin", "flamingo", "toucan", "peacock", "hummingbird",
  "bee", "butterfly", "dragonfly", "snail", "mushroom", "flower",
  "rose", "sunflower", "daisy", "tulip", "lavender", "botanical",
  "spring", "summer", "garden", "picnic", "tea", "book", "books",
  "christmas", "easter", "floral", "kawaii",
  "cottage", "cottagecore", "nature", "forest", "star", "stars",
  "pumpkin",
  "strawberry", "cherry", "lemon", "peach", "watermelon",
  "axolotl", "capybara", "platypus", "quokka", "wombat",
  "otter", "sloth", "koala", "kangaroo", "panda", "red panda",
  "corgi", "shiba", "dachshund", "golden", "labrador",
  "floral", "geometric", "sampler", "alphabet", "monogram",
  "portrait", "landscape", "map", "vintage", "art deco",
];

function extractSubjects(title: string): string[] {
  const lower = title.toLowerCase();
  const found = SUBJECT_HINTS.filter((s) => lower.includes(s));
  return [...new Set(found)].filter(isSafeTrendText).slice(0, 4);
}

// ── Reddit fetch ─────────────────────────────────────────────────────────

interface RedditApiPost {
  data: {
    title: string;
    url: string;
    score: number;
    num_comments: number;
    thumbnail: string | null;
    permalink: string;
  };
}

async function fetchRedditPosts(sort: "top" | "new", timeframe?: string): Promise<{ posts: RedditPost[]; error: string | null }> {
  try {
    const tf = timeframe ? `&t=${timeframe}` : "";
    const url = `https://www.reddit.com/r/crossstitch/${sort}.json?limit=25${tf}`;
    const resp = await fetch(url, {
      headers: {
        // Reddit requires a User-Agent or they 429 us
        "User-Agent": "CraftPlanDigital/1.0 (market research tool; contact hssmif@gmail.com)",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      return { posts: [], error: `Reddit ${sort}: HTTP ${resp.status}` };
    }
    const json = await resp.json() as { data?: { children?: RedditApiPost[] } };
    const children = json?.data?.children ?? [];
    const posts: RedditPost[] = children
      .map((c) => ({
        title: c.data.title,
        url: `https://reddit.com${c.data.permalink}`,
        score: c.data.score,
        numComments: c.data.num_comments,
        thumbnail: c.data.thumbnail && c.data.thumbnail !== "self" && c.data.thumbnail !== "default" ? c.data.thumbnail : null,
        subjects: extractSubjects(c.data.title),
      }))
      // Filter to posts that mention cross-stitch subjects or look like WIP/FO posts
      .filter((p) => {
        const l = p.title.toLowerCase();
        if (!isSafeTrendText(l)) return false;
        return (
          l.includes("cross stitch") ||
          l.includes("cross-stitch") ||
          l.includes("xstitch") ||
          l.includes("[fo]") || // Finished Object
          l.includes("[wip]") || // Work in Progress
          l.includes("pattern") ||
          l.includes("stitch") ||
          p.subjects.length > 0
        );
      });
    return { posts, error: null };
  } catch (err) {
    return {
      posts: [],
      error: `Reddit ${sort}: ${err instanceof Error ? err.message : "fetch failed"}`,
    };
  }
}

// ── Etsy autocomplete fetch ───────────────────────────────────────────────

async function fetchEtsyTrends(baseUrl: string): Promise<{ terms: EtsyTrendTerm[]; error: string | null }> {
  try {
    // Use our own autocomplete API which wraps the Etsy search
    const queries = ["cross stitch", "cross stitch pattern", "funny cross stitch"];
    const allTerms = new Set<string>();

    for (const q of queries) {
      const resp = await fetch(`${baseUrl}/api/cross-stitch/autocomplete?q=${encodeURIComponent(q)}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) continue;
      const data = await resp.json() as { suggestions?: string[] };
      (data.suggestions ?? []).forEach((t: string) => {
        if (t && t.toLowerCase().includes("cross stitch") && isSafeTrendText(t)) {
          allTerms.add(t.toLowerCase().trim());
        }
      });
    }

    const terms: EtsyTrendTerm[] = [...allTerms].slice(0, 20).map((term) => ({
      term,
      source: "etsy_autocomplete" as const,
    }));
    return { terms, error: null };
  } catch (err) {
    return {
      terms: [],
      error: `Etsy autocomplete: ${err instanceof Error ? err.message : "fetch failed"}`,
    };
  }
}

// ── Pinterest trends fetch ────────────────────────────────────────────────
//
// Uses the Pinterest v5 Trends API:
//   GET /v5/trends/keywords/{region}/top/{trend_type}
//   Authorization: Bearer <token>
//
// We fetch "growing" keywords in the US filtered to crafts interest,
// then filter client-side to those containing stitch/craft/embroidery signals.
// Falls back to a pin search if the trends endpoint isn't available in sandbox.

interface PinterestTrendResult {
  keyword: string;
  pct_change_week_over_week?: number;
}

interface PinterestTrendsApiResponse {
  trends?: PinterestTrendResult[];
  items?: PinterestTrendResult[];
}

async function fetchPinterestTrends(): Promise<{ terms: PinterestTrendTerm[]; error: string | null }> {
  const token = process.env.PINTEREST_ACCESS_TOKEN;
  if (!token) {
    return { terms: [], error: "Pinterest: no access token configured" };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // Try 1: growing keyword trends (crafts interest, US)
  try {
    const url = "https://api.pinterest.com/v5/trends/keywords/US/top/growing?interests[]=crafts&limit=50";
    const resp = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(8000),
    });

    if (resp.ok) {
      const json = await resp.json() as PinterestTrendsApiResponse;
      const raw = json.trends ?? json.items ?? [];
      const CRAFT_HINTS = ["stitch", "embroid", "needle", "craft", "sew", "knit", "crochet", "yarn", "fabric", "pattern", "hoop", "thread"];
      const terms: PinterestTrendTerm[] = raw
        .filter((t) => {
          const kw = t.keyword.toLowerCase();
          // Only keep cross-stitch adjacent terms
          return isSafeTrendText(kw) && (CRAFT_HINTS.some((h) => kw.includes(h)) || kw.includes("cross"));
        })
        .slice(0, 20)
        .map((t) => ({
          keyword: t.keyword,
          pctChange: t.pct_change_week_over_week,
        }));

      if (terms.length > 0) return { terms, error: null };

      // If we got a response but nothing matched our filter, return all craft terms
      const allTerms: PinterestTrendTerm[] = raw
        .filter((t) => isSafeTrendText(t.keyword))
        .slice(0, 15)
        .map((t) => ({
          keyword: t.keyword,
          pctChange: t.pct_change_week_over_week,
        }));
      return { terms: allTerms, error: null };
    }

    // 403/401 in sandbox = endpoint restricted; try pin search instead
    if (resp.status === 403 || resp.status === 401) {
      throw new Error(`trends_endpoint_restricted:${resp.status}`);
    }

    return { terms: [], error: `Pinterest trends: HTTP ${resp.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Try 2: fall back to pin search for "cross stitch" if trends endpoint blocked
    if (msg.includes("trends_endpoint_restricted")) {
      try {
        const searchUrl = "https://api.pinterest.com/v5/search/pins?query=cross+stitch&pin_type=PUBLIC&limit=25";
        const resp2 = await fetch(searchUrl, {
          headers,
          signal: AbortSignal.timeout(8000),
        });
        if (!resp2.ok) return { terms: [], error: `Pinterest search: HTTP ${resp2.status}` };

        interface PinterestPin { title?: string; description?: string; }
        interface PinterestSearchResponse { items?: PinterestPin[] }
        const json2 = await resp2.json() as PinterestSearchResponse;
        const pins = json2.items ?? [];

        // Extract unique keywords from pin titles
        const seen = new Set<string>();
        const terms: PinterestTrendTerm[] = [];
        for (const pin of pins) {
          const text = (pin.title || pin.description || "").trim();
          if (text && !seen.has(text) && text.length < 80 && isSafeTrendText(text)) {
            seen.add(text);
            terms.push({ keyword: text });
            if (terms.length >= 15) break;
          }
        }
        return { terms, error: null };
      } catch (err2) {
        return { terms: [], error: `Pinterest: ${err2 instanceof Error ? err2.message : "fetch failed"}` };
      }
    }

    return { terms: [], error: `Pinterest: ${msg}` };
  }
}

// ── Route handler ─────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<Response> {
  // Serve cached data if fresh
  if (cache && cache.expiresAt > Date.now()) {
    return NextResponse.json(cache.data);
  }

  const errors: string[] = [];

  // Run all fetches in parallel
  const baseUrl = new URL(req.url).origin;

  const [topResult, newResult, etsyResult, pinterestResult] = await Promise.all([
    fetchRedditPosts("top", "week"),
    fetchRedditPosts("new"),
    fetchEtsyTrends(baseUrl),
    fetchPinterestTrends(),
  ]);

  if (topResult.error) errors.push(topResult.error);
  if (newResult.error) errors.push(newResult.error);
  if (etsyResult.error) errors.push(etsyResult.error);
  if (pinterestResult.error) errors.push(pinterestResult.error);

  const response: ExternalTrendsResponse = {
    redditTop: topResult.posts,
    redditNew: newResult.posts,
    etsyTrends: etsyResult.terms,
    pinterestTrends: pinterestResult.terms,
    fetchedAt: new Date().toISOString(),
    errors,
  };

  // Cache the result
  cache = { data: response, expiresAt: Date.now() + CACHE_TTL_MS };

  return NextResponse.json(response);
}
