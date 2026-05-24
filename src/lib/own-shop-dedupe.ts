// ─────────────────────────────────────────────────────────────────
// Own-shop dedupe — stop the auto-pipeline from regenerating ideas
// the user has already published on Etsy.
//
// Why: each generated idea costs ~$0.36 (image + flatten + mockups +
// listing copy).  Publishing a near-duplicate is also bad SEO — Etsy
// punishes duplicate-content shops.
//
// How: fetch the user's own active + draft listings from Etsy v3,
// cache them in-process for 30 min (Etsy rate-limits + the catalog
// rarely changes), then check each new idea's "subject tokens"
// against existing titles.  Two titles count as duplicates if they
// share ≥ 2 non-generic subject tokens (e.g. {goose, wizard}).
//
// All-new file — does NOT touch the convert pipeline, the existing
// idea-generation prompts, or any other module.  Imported by the
// auto-pipeline orchestrator's fetchIdeas() only.
// ─────────────────────────────────────────────────────────────────

import { getValidToken, getApiKeyHeader } from "./etsy-auth";
import { getEtsyTokens } from "./db";

const ETSY_API_URL = "https://openapi.etsy.com/v3";

// Cache TTL — 30 min strikes a balance: long enough that successive
// auto-pipeline batches don't re-fetch, short enough that a freshly
// listed item gets picked up before the next batch runs.
const CACHE_TTL_MS = 30 * 60 * 1000;

/** Lightweight stats per own-shop listing.  Populated from the same
 *  Etsy v3 fetch we already do for dedupe — no extra API cost. */
export interface OwnListing {
  title: string;
  views: number;
  num_favorers: number;
  state: string;          // "active" | "draft"
  listing_id?: number;
}

interface CacheEntry {
  titles: string[];       // backward-compat — derived from listings[]
  listings: OwnListing[]; // rich version with stats for winner seeding
  fetchedAt: number;
}
let cache: CacheEntry | null = null;

/** Words that appear in nearly every cross-stitch listing and add
 *  no signal for dedupe.  Stripping these before token compare. */
const GENERIC_TOKENS = new Set([
  "cross", "stitch", "pattern", "patterns", "crossstitch", "crossstich",
  "pdf", "digital", "download", "downloadable", "printable", "instant",
  "design", "designs", "chart", "charts", "embroidery", "needlework",
  "the", "a", "an", "of", "and", "with", "for", "in", "on", "to",
  "by", "or", "from", "as", "is", "are", "be",
  // Aesthetic adjectives that are too common across the niche to dedupe on
  "cute", "kawaii", "cottagecore", "modern", "vintage", "small", "mini",
  "easy", "beginner", "friendly", "diy", "handmade", "custom", "personalized",
  "gift", "gifts", "lover", "lovers",
  // Format / number noise
  "2025", "2026", "set", "bundle", "pack", "files", "file", "single",
  "v1", "v2", "vol",
]);

/** Tokenize a title for dedupe: lowercase, strip punctuation, split,
 *  drop generic words + 1-letter tokens.  Returns the unique-tokens set. */
export function subjectTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ") // strip punctuation/symbols
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !GENERIC_TOKENS.has(t)),
  );
}

/** Fuzzy duplicate check: two titles count as the same product if
 *  they share at least MIN_OVERLAP subject tokens.  Empirical: with
 *  GENERIC_TOKENS filtered out, 2-token overlap (e.g. "goose"+"wizard")
 *  is a reliable signal that the SUBJECT is the same — false-positives
 *  on 2-token overlap are rare in cross-stitch where the subject
 *  pair is usually animal+role / object+modifier. */
const MIN_OVERLAP = 2;
export function isDuplicate(candidate: string, existing: string): boolean {
  const a = subjectTokens(candidate);
  const b = subjectTokens(existing);
  let overlap = 0;
  for (const t of a) if (b.has(t)) overlap++;
  return overlap >= MIN_OVERLAP;
}

/** Fetch own active + draft listings from Etsy v3 (single source of
 *  truth — populates the in-process cache used by both dedupe and the
 *  winner-seed helper).  Caches for 30 min. */
async function fetchAndCacheOwnListings(): Promise<OwnListing[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.listings;
  }
  const tokens = getEtsyTokens();
  if (!tokens?.shop_id) {
    console.warn("[own-shop-dedupe] no shop_id — skipping fetch");
    return [];
  }

  const listings: OwnListing[] = [];
  try {
    const accessToken = await getValidToken();
    const apiKey = getApiKeyHeader();
    for (const state of ["active", "draft"]) {
      let offset = 0;
      while (offset < 500) {
        const resp = await fetch(
          `${ETSY_API_URL}/application/shops/${tokens.shop_id}/listings/${state}?limit=100&offset=${offset}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "x-api-key": apiKey,
            },
          },
        );
        if (!resp.ok) {
          console.warn(`[own-shop-dedupe] ${state} HTTP ${resp.status}`);
          break;
        }
        const data = (await resp.json()) as {
          results?: Array<{
            title?: string;
            views?: number;
            num_favorers?: number;
            listing_id?: number;
          }>;
        };
        const page = data.results || [];
        page.forEach((l) => {
          if (l.title) {
            listings.push({
              title: l.title,
              views: Number(l.views ?? 0),
              num_favorers: Number(l.num_favorers ?? 0),
              state,
              listing_id: l.listing_id,
            });
          }
        });
        if (page.length < 100) break;
        offset += 100;
      }
    }
  } catch (err) {
    console.warn("[own-shop-dedupe] fetch failed:", (err as Error).message);
  }

  cache = {
    listings,
    titles: listings.map((l) => l.title),
    fetchedAt: Date.now(),
  };
  console.log(
    `[own-shop-dedupe] cached ${listings.length} own listings (` +
      `${listings.filter((l) => l.num_favorers > 0).length} with favorites)`,
  );
  return listings;
}

/** Returns just the titles — backward-compatible with existing callers. */
export async function getOwnListingTitles(): Promise<string[]> {
  const listings = await fetchAndCacheOwnListings();
  return listings.map((l) => l.title);
}

/** Returns the top-N own-shop performers, sorted by combined signal
 *  (favorites + views×0.1).  Used by bestseller-ideas to seed Gemini
 *  with "things THIS shop's audience has already proven they want." */
export async function getOwnTopPerformers(limit = 8): Promise<OwnListing[]> {
  const listings = await fetchAndCacheOwnListings();
  // Score: favorites are the strongest "I want this" signal; views are
  // weaker (a buyer can browse without favoriting), so weight them at
  // 1/10th the value.  Drop anything with zero engagement so we don't
  // seed Gemini with patterns the audience hasn't responded to yet.
  const scored = listings
    .map((l) => ({ ...l, score: l.num_favorers * 10 + l.views }))
    .filter((l) => l.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/** Filter a list of candidate ideas, removing any whose title overlaps
 *  with an existing own-shop title.  Returns the kept ideas + the
 *  count of dupes dropped (for logging). */
export async function filterOutOwnDuplicates<T extends { title: string }>(
  candidates: T[],
): Promise<{ kept: T[]; droppedTitles: string[] }> {
  const ownTitles = await getOwnListingTitles();
  if (ownTitles.length === 0) {
    // Dedupe is best-effort; if we have no own-titles loaded (e.g.
    // Etsy is down, or the user just connected), pass all through.
    return { kept: candidates, droppedTitles: [] };
  }
  const kept: T[] = [];
  const droppedTitles: string[] = [];
  for (const c of candidates) {
    const dup = ownTitles.find((own) => isDuplicate(c.title, own));
    if (dup) {
      droppedTitles.push(`"${c.title}" ↔ "${dup}"`);
    } else {
      kept.push(c);
    }
  }
  return { kept, droppedTitles };
}

/** Force-refresh the cache.  Called after a successful publish so the
 *  next batch sees the just-published item immediately. */
export function invalidateOwnShopCache(): void {
  cache = null;
}
