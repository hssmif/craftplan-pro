/**
 * Multi-source trend data fetching for cross-stitch pattern research.
 * Pulls from: Google Trends, Pinterest, Reddit, Google Autocomplete, Seasonal Calendar
 */

import { getEtsyInsightsSummary } from "@/lib/db";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface TrendSource {
  source: string;
  icon: string; // emoji
  items: TrendItem[];
  fetched: boolean;
  error?: string;
}

export interface TrendItem {
  term: string;
  context?: string; // extra detail
  score?: number;   // relevance 0-100
  url?: string;
}

/* ═══════════════════════════════════════════════════════════
   6. ETSY MARKETPLACE INSIGHTS — captured buyer-search volumes
   ───────────────────────────────────────────────────────────
   Reads from the SQLite sink that the Chrome extension's
   marketplace-insights-scanner writes to. Each row carries a
   real monthly_searches integer parsed from Etsy's own UI
   ("170.9k" → 170900). This is the only direct buyer-side
   demand signal in the pipeline; all other sources are proxies.

   Returns `fetched: false` with a non-error empty-state when
   no captures exist yet — downstream corroboration just ignores
   us and continues, no breakage. Pulls the latest row per
   term_normalized (de-duped server-side) sorted by volume desc.

   sinceHours defaults to 30 days (Etsy refreshes the Insights
   panel monthly, so older data is still valid).
   ═══════════════════════════════════════════════════════════ */
export async function fetchEtsyInsights(opts?: {
  sinceHours?: number;
  limit?: number;
  /** When true (default), filters out terms classified as "physical".
   *  Set false to include all captures regardless of classification —
   *  useful for debugging or surfaces that want full coverage. */
  digitalOnly?: boolean;
}): Promise<TrendSource> {
  const digitalOnly = opts?.digitalOnly ?? true;
  try {
    const summary = getEtsyInsightsSummary({
      // Pull a bigger window than we ultimately surface so the digital
      // filter doesn't accidentally starve us — physical terms get
      // dropped here but we still want a healthy items[] count.
      sinceHours: opts?.sinceHours ?? 24 * 30,
      limit: opts ? (opts.limit ?? 150) * 2 : 300,
    });

    if (summary.latestPerTerm.length === 0) {
      return {
        source: "Etsy Marketplace Insights",
        icon: "🛒",
        items: [],
        fetched: false,
        error:
          "no captures yet — open Etsy → Marketplace Insights with the extension installed",
      };
    }

    // ── Phase-7b: filter out physical-only terms ──────────────────
    // Phase-7b adds an is_digital classification to each row. When
    // digitalOnly is true (default), we drop rows tagged "physical".
    // Rows tagged "digital" or "mixed" or NULL (unclassified yet)
    // pass through. The intent is: market-pulse should only surface
    // ideas the user's digital factories can act on.
    const filtered = digitalOnly
      ? summary.latestPerTerm.filter((row) => row.is_digital !== "physical")
      : summary.latestPerTerm;

    const finalLimit = opts?.limit ?? 150;
    const rows = filtered.slice(0, finalLimit);

    // Normalize search volumes onto a 0-100 score for downstream
    // weighting. We use a log scale because Etsy's volume distribution
    // is heavy-tailed (top terms hundreds of thousands, long tail in
    // hundreds). log10(1) = 0, log10(1M) = 6, so we multiply by ~16.7
    // to map 1M+ → 100 and lower volumes onto the bottom of the scale.
    const items: TrendItem[] = rows.map((row) => {
      const vol = row.monthly_searches ?? 0;
      const score = vol > 0 ? Math.min(100, Math.round(Math.log10(vol + 1) * 16.7)) : 0;
      const ctx = row.category
        ? `${row.raw_volume_text ?? vol.toLocaleString()} mo. searches · ${row.category}`
        : `${row.raw_volume_text ?? vol.toLocaleString()} mo. searches`;
      return {
        term: row.term,
        context: ctx,
        score,
      };
    });

    return {
      source: "Etsy Marketplace Insights",
      icon: "🛒",
      items,
      fetched: true,
    };
  } catch (err) {
    return {
      source: "Etsy Marketplace Insights",
      icon: "🛒",
      items: [],
      fetched: false,
      error: err instanceof Error ? err.message : "Insights fetch failed",
    };
  }
}

/* ═══════════════════════════════════════════════════════
   1. GOOGLE TRENDS — Today's trending searches (free RSS)
   ═══════════════════════════════════════════════════════ */
export async function fetchGoogleTrends(): Promise<TrendSource> {
  const items: TrendItem[] = [];

  try {
    const rssUrl = "https://trends.google.com/trending/rss?geo=US";
    const resp = await fetch(rssUrl, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });

    if (resp.ok) {
      const xml = await resp.text();
      const titleMatches = xml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g) || [];
      for (const match of titleMatches) {
        const text = match.replace(/<title><!\[CDATA\[/, "").replace(/\]\]><\/title>/, "").trim();
        if (text && text !== "Trending Searches Daily" && text !== "Daily Search Trends") {
          items.push({ term: text });
        }
      }
    }

    // Fallback daily endpoint
    if (items.length < 5) {
      const dailyUrl = "https://trends.google.com/trends/trendingsearches/daily/rss?geo=US";
      const resp2 = await fetch(dailyUrl, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(10000),
      });
      if (resp2.ok) {
        const xml2 = await resp2.text();
        const matches2 = xml2.match(/<title>(.*?)<\/title>/g) || [];
        for (const m of matches2) {
          const t = m.replace(/<\/?title>/g, "").trim();
          if (t && !t.includes("Trend") && !t.includes("Search") && !items.find((i) => i.term === t)) {
            items.push({ term: t });
          }
        }
      }
    }
  } catch {
    return { source: "Google Trends", icon: "📈", items: [], fetched: false, error: "Failed to fetch" };
  }

  return { source: "Google Trends", icon: "📈", items: items.slice(0, 20), fetched: true };
}

/* ═══════════════════════════════════════════════════════
   2. GOOGLE AUTOCOMPLETE — What people are searching for
   ═══════════════════════════════════════════════════════ */
export async function fetchGoogleAutocomplete(query: string): Promise<TrendSource> {
  const items: TrendItem[] = [];

  const queries = [
    query,
    `${query} 2026`,
    `${query} trending`,
    `${query} popular`,
    `${query} idea`,
  ];

  try {
    const results = await Promise.allSettled(
      queries.map(async (q) => {
        const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}`;
        const resp = await fetch(url, {
          headers: { "User-Agent": UA },
          signal: AbortSignal.timeout(8000),
        });
        if (resp.ok) {
          const data = await resp.json();
          // Response format: [query, [suggestions]]
          const suggestions: string[] = data[1] || [];
          return suggestions;
        }
        return [];
      })
    );

    const seen = new Set<string>();
    for (const r of results) {
      if (r.status === "fulfilled") {
        for (const s of r.value) {
          const clean = s.toLowerCase().trim();
          if (!seen.has(clean)) {
            seen.add(clean);
            items.push({ term: s });
          }
        }
      }
    }
  } catch {
    return { source: "Google Search Suggestions", icon: "🔍", items: [], fetched: false, error: "Failed to fetch" };
  }

  return { source: "Google Search Suggestions", icon: "🔍", items: items.slice(0, 25), fetched: true };
}

/* ═══════════════════════════════════════════════════════
   3. PINTEREST — Trending craft ideas & pin suggestions
   ═══════════════════════════════════════════════════════ */
export async function fetchPinterestTrends(query: string): Promise<TrendSource> {
  const items: TrendItem[] = [];

  try {
    // Pinterest autocomplete/search suggestions (public endpoint)
    const searches = [
      `${query}`,
      `${query} pattern`,
      `cross stitch ideas`,
      `embroidery trend`,
    ];

    const results = await Promise.allSettled(
      searches.map(async (q) => {
        // Pinterest typeahead API (public)
        const url = `https://api.pinterest.com/v3/search/suggestions/?query=${encodeURIComponent(q)}&count=10`;
        const resp = await fetch(url, {
          headers: { "User-Agent": UA },
          signal: AbortSignal.timeout(8000),
        });
        if (resp.ok) {
          const data = await resp.json();
          const suggestions = data.data || data.suggestions || data.items || [];
          return suggestions.map((s: { label?: string; query?: string; text?: string }) =>
            s.label || s.query || s.text || ""
          ).filter(Boolean);
        }
        return [];
      })
    );

    const seen = new Set<string>();
    for (const r of results) {
      if (r.status === "fulfilled") {
        for (const s of r.value) {
          const clean = (s as string).toLowerCase().trim();
          if (!seen.has(clean) && clean.length > 2) {
            seen.add(clean);
            items.push({ term: s as string, context: "Pinterest search suggestion" });
          }
        }
      }
    }

    // Fallback: Use Google to find Pinterest trending cross stitch
    if (items.length < 3) {
      const googleUrl = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent("pinterest " + query)}`;
      const resp = await fetch(googleUrl, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(8000),
      });
      if (resp.ok) {
        const data = await resp.json();
        const suggestions: string[] = data[1] || [];
        for (const s of suggestions) {
          const clean = s.toLowerCase().replace("pinterest ", "").trim();
          if (!seen.has(clean) && clean.length > 2) {
            seen.add(clean);
            items.push({ term: clean, context: "Trending on Pinterest" });
          }
        }
      }
    }
  } catch {
    return { source: "Pinterest", icon: "📌", items: [], fetched: false, error: "Failed to fetch" };
  }

  return { source: "Pinterest", icon: "📌", items: items.slice(0, 20), fetched: true };
}

/* ═══════════════════════════════════════════════════════
   3b. PINTEREST TRENDS API v5 — Authenticated, REAL trend data
   ───────────────────────────────────────────────────────────
   Uses PINTEREST_ACCESS_TOKEN to hit the official v5 Trends
   endpoint. Returns actual trending keywords with growth %
   (WoW / MoM / YoY) — orders of magnitude better than the
   public typeahead. Falls back silently if the token is
   missing / expired so the rest of the pipeline keeps working.

   Endpoint: GET /v5/trends/keywords/{region}/top
   Docs: https://developers.pinterest.com/docs/api/v5/trends-keywords-list/

   trendType controls which list we pull:
     • "growing"  — fastest-growing terms WoW (best for "what's hot now")
     • "monthly"  — top terms last 30d
     • "yearly"   — top terms last 12mo
     • "seasonal" — terms peaking right now seasonally
   ═══════════════════════════════════════════════════════ */
export async function fetchPinterestTrendsAPI(
  region: string = "US",
  trendType: "growing" | "monthly" | "yearly" | "seasonal" = "growing",
  limit: number = 25,
  interests?: string[], // e.g. ["art", "diy-and-crafts", "home-decor"]
): Promise<TrendSource> {
  const token = process.env.PINTEREST_ACCESS_TOKEN;
  if (!token) {
    return {
      source: "Pinterest Trends API",
      icon: "📌",
      items: [],
      fetched: false,
      error: "PINTEREST_ACCESS_TOKEN not set",
    };
  }

  try {
    // Build URL with optional interest filter — Pinterest accepts
    // comma-separated interest slugs in the `interests` query param.
    const params = new URLSearchParams({
      trend_type: trendType,
      limit: String(Math.min(Math.max(limit, 1), 50)),
    });
    if (interests && interests.length > 0) {
      params.set("interests", interests.join(","));
    }
    const url = `https://api.pinterest.com/v5/trends/keywords/${encodeURIComponent(region)}/top?${params.toString()}`;

    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return {
        source: "Pinterest Trends API",
        icon: "📌",
        items: [],
        fetched: false,
        error: `HTTP ${resp.status}${body ? ` — ${body.slice(0, 120)}` : ""}`,
      };
    }

    const data = await resp.json();
    // Response shape (v5): { trends: [{ keyword, pct_growth_wow, pct_growth_mom, pct_growth_yoy, time_series? }] }
    // Be defensive — also accept { data: [...] } in case Pinterest tweaks the wrapper.
    const rawTrends: Array<Record<string, unknown>> = Array.isArray(data?.trends)
      ? data.trends
      : Array.isArray(data?.data)
        ? data.data
        : [];

    const items: TrendItem[] = [];
    for (const t of rawTrends) {
      const keyword = (t.keyword as string) || (t.term as string) || "";
      if (!keyword) continue;

      // Growth % — prefer WoW (fastest signal), fall back to MoM/YoY.
      const wow = typeof t.pct_growth_wow === "number" ? t.pct_growth_wow : null;
      const mom = typeof t.pct_growth_mom === "number" ? t.pct_growth_mom : null;
      const yoy = typeof t.pct_growth_yoy === "number" ? t.pct_growth_yoy : null;
      const primary = wow ?? mom ?? yoy;

      // Build a context string showing whichever growth metrics we got.
      const parts: string[] = [];
      if (wow !== null) parts.push(`${wow >= 0 ? "+" : ""}${Math.round(wow)}% WoW`);
      if (mom !== null) parts.push(`${mom >= 0 ? "+" : ""}${Math.round(mom)}% MoM`);
      if (yoy !== null) parts.push(`${yoy >= 0 ? "+" : ""}${Math.round(yoy)}% YoY`);
      const context = parts.length > 0 ? parts.join(" · ") : `Pinterest ${trendType} trend`;

      // Score is normalized growth, clamped 0-100 — used by the
      // corroboration filter downstream to weight Pinterest signals.
      const score =
        primary !== null
          ? Math.max(0, Math.min(100, Math.round(primary)))
          : undefined;

      items.push({ term: keyword, context, score });
    }

    return {
      source: "Pinterest Trends API",
      icon: "📌",
      items: items.slice(0, limit),
      fetched: true,
    };
  } catch (err) {
    return {
      source: "Pinterest Trends API",
      icon: "📌",
      items: [],
      fetched: false,
      error: err instanceof Error ? err.message : "Failed to fetch",
    };
  }
}

/* ═══════════════════════════════════════════════════════
   4. REDDIT — Trending posts from craft subreddits
   ═══════════════════════════════════════════════════════ */
export async function fetchRedditTrends(query: string): Promise<TrendSource> {
  const items: TrendItem[] = [];

  const subreddits = ["CrossStitch", "Embroidery", "crafts", "NeedlePoint"];

  try {
    // Fetch hot posts from craft subreddits
    const results = await Promise.allSettled(
      subreddits.map(async (sub) => {
        const url = `https://www.reddit.com/r/${sub}/hot.json?limit=15&raw_json=1`;
        const resp = await fetch(url, {
          headers: { "User-Agent": "CraftPlan/1.0 (Research Bot)" },
          signal: AbortSignal.timeout(10000),
        });
        if (resp.ok) {
          const data = await resp.json();
          const posts = data?.data?.children || [];
          return posts.map((p: { data: { title: string; score: number; permalink: string; subreddit: string; num_comments: number } }) => ({
            term: p.data.title,
            score: p.data.score,
            url: `https://reddit.com${p.data.permalink}`,
            context: `r/${p.data.subreddit} • ${p.data.score} upvotes • ${p.data.num_comments} comments`,
          }));
        }
        return [];
      })
    );

    const seen = new Set<string>();
    for (const r of results) {
      if (r.status === "fulfilled") {
        for (const item of r.value) {
          // Skip mod posts, rules, etc.
          const lower = item.term.toLowerCase();
          if (lower.includes("[mod]") || lower.includes("weekly") || lower.includes("rules")) continue;
          if (!seen.has(lower)) {
            seen.add(lower);
            items.push(item);
          }
        }
      }
    }

    // Sort by Reddit score
    items.sort((a, b) => (b.score || 0) - (a.score || 0));

    // Also search Reddit for the specific query
    try {
      const searchUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(query + " cross stitch")}&sort=hot&limit=10&raw_json=1`;
      const searchResp = await fetch(searchUrl, {
        headers: { "User-Agent": "CraftPlan/1.0 (Research Bot)" },
        signal: AbortSignal.timeout(10000),
      });
      if (searchResp.ok) {
        const searchData = await searchResp.json();
        const searchPosts = searchData?.data?.children || [];
        for (const p of searchPosts) {
          const lower = p.data.title.toLowerCase();
          if (!seen.has(lower)) {
            seen.add(lower);
            items.push({
              term: p.data.title,
              score: p.data.score,
              url: `https://reddit.com${p.data.permalink}`,
              context: `r/${p.data.subreddit} • ${p.data.score} upvotes`,
            });
          }
        }
      }
    } catch {
      /* search failed, hot posts still available */
    }
  } catch {
    return { source: "Reddit", icon: "🔥", items: [], fetched: false, error: "Failed to fetch" };
  }

  return { source: "Reddit", icon: "🔥", items: items.slice(0, 20), fetched: true };
}

/* ═══════════════════════════════════════════════════════
   5. ETSY TRENDING TAGS — Extract trending tags from Etsy
   ═══════════════════════════════════════════════════════ */
export async function fetchEtsyTrendingTags(tags: string[]): Promise<TrendSource> {
  // Aggregate tag frequency from Etsy listings (passed from search results)
  const tagCounts = new Map<string, number>();
  for (const t of tags) {
    const clean = t.toLowerCase().trim();
    if (clean.length > 2) {
      tagCounts.set(clean, (tagCounts.get(clean) || 0) + 1);
    }
  }

  const items: TrendItem[] = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([term, count]) => ({
      term,
      score: count,
      context: `Used in ${count} top listings`,
    }));

  return { source: "Etsy Trending Tags", icon: "🏷️", items, fetched: true };
}

/* ═══════════════════════════════════════════════════════
   6. SEASONAL & CULTURAL CALENDAR
   ═══════════════════════════════════════════════════════ */
export function getSeasonalTrends(): TrendSource {
  const now = new Date();
  const month = now.getMonth(); // 0-11
  const day = now.getDate();

  // Build a calendar of upcoming events (within ~6 weeks)
  const events: { month: number; day: number; name: string; tags: string[] }[] = [
    { month: 0, day: 1, name: "New Year", tags: ["new year", "resolution", "fresh start", "winter"] },
    { month: 1, day: 14, name: "Valentine's Day", tags: ["love", "hearts", "couples", "romantic", "galentine"] },
    { month: 2, day: 17, name: "St. Patrick's Day", tags: ["irish", "shamrock", "lucky", "green"] },
    { month: 2, day: 20, name: "Spring Equinox", tags: ["spring", "flowers", "garden", "bloom", "butterfly"] },
    { month: 3, day: 1, name: "Easter Season", tags: ["easter", "bunny", "eggs", "spring", "religious"] },
    { month: 4, day: 5, name: "Cinco de Mayo", tags: ["fiesta", "mexican", "colorful", "cactus"] },
    { month: 4, day: 11, name: "Mother's Day", tags: ["mom", "mother", "flowers", "family", "heart"] },
    { month: 5, day: 15, name: "Father's Day", tags: ["dad", "father", "fishing", "tools", "funny dad"] },
    { month: 5, day: 19, name: "Juneteenth", tags: ["freedom", "celebration", "heritage"] },
    { month: 5, day: 21, name: "Summer Solstice", tags: ["summer", "sun", "beach", "tropical"] },
    { month: 6, day: 4, name: "Fourth of July", tags: ["patriotic", "americana", "fireworks", "USA"] },
    { month: 7, day: 1, name: "Back to School", tags: ["school", "teacher", "apple", "learning"] },
    { month: 8, day: 22, name: "Fall Equinox", tags: ["autumn", "fall", "pumpkin", "leaves", "cozy"] },
    { month: 9, day: 31, name: "Halloween", tags: ["halloween", "spooky", "witch", "ghost", "skeleton", "horror"] },
    { month: 10, day: 28, name: "Thanksgiving", tags: ["thankful", "turkey", "harvest", "family dinner"] },
    { month: 11, day: 25, name: "Christmas", tags: ["christmas", "holiday", "santa", "reindeer", "ornament", "nativity"] },
    { month: 11, day: 31, name: "Hanukkah Season", tags: ["hanukkah", "menorah", "dreidel", "jewish", "holiday"] },
  ];

  // Also add evergreen seasonal themes
  const seasons: { months: number[]; name: string; tags: string[] }[] = [
    { months: [11, 0, 1], name: "Winter", tags: ["winter", "snow", "cozy", "hot cocoa", "snowflake", "hygge"] },
    { months: [2, 3, 4], name: "Spring", tags: ["spring", "flowers", "garden", "birds", "pastel", "bloom"] },
    { months: [5, 6, 7], name: "Summer", tags: ["summer", "beach", "tropical", "vacation", "sunshine", "ocean"] },
    { months: [8, 9, 10], name: "Autumn", tags: ["fall", "autumn", "pumpkin spice", "leaves", "harvest moon", "cozy cabin"] },
  ];

  const items: TrendItem[] = [];

  // Find upcoming events (within next 45 days)
  for (const event of events) {
    const eventDate = new Date(now.getFullYear(), event.month, event.day);
    // If event has passed this year, check next year
    if (eventDate < now) eventDate.setFullYear(eventDate.getFullYear() + 1);
    const daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil <= 45 && daysUntil >= 0) {
      const urgency = daysUntil <= 7 ? "THIS WEEK" : daysUntil <= 14 ? "2 weeks" : `${daysUntil} days`;
      items.push({
        term: event.name,
        context: `${urgency} away — trending tags: ${event.tags.join(", ")}`,
        score: Math.max(0, 100 - daysUntil * 2), // closer = higher score
      });
    }
  }

  // Add current season
  for (const season of seasons) {
    if (season.months.includes(month)) {
      items.push({
        term: `${season.name} Season`,
        context: `Current season — popular themes: ${season.tags.join(", ")}`,
        score: 50,
      });
    }
  }

  // Add evergreen year-round themes
  const evergreen = [
    { term: "Pet Portraits", context: "Always popular — dogs, cats, custom pet patterns" },
    { term: "Funny/Snarky Quotes", context: "Consistent bestsellers — subversive cross stitch" },
    { term: "TV/Movie References", context: "Pop culture patterns always trend" },
    { term: "Cottagecore / Botanical", context: "Ongoing aesthetic trend — mushrooms, wildflowers, herbs" },
    { term: "Beginner Kits", context: "High search volume — small, simple designs" },
  ];
  for (const e of evergreen) {
    items.push({ term: e.term, context: e.context, score: 40 });
  }

  return { source: "Seasonal & Cultural Calendar", icon: "📅", items, fetched: true };
}

/* ═══════════════════════════════════════════════════════
   7. TIKTOK / SOCIAL MEDIA — Via Google search suggestions
   ═══════════════════════════════════════════════════════ */
export async function fetchSocialMediaTrends(query: string): Promise<TrendSource> {
  const items: TrendItem[] = [];

  try {
    const searches = [
      `tiktok ${query} trend`,
      `tiktok cross stitch viral`,
      `instagram embroidery trend 2026`,
      `${query} aesthetic`,
    ];

    const results = await Promise.allSettled(
      searches.map(async (q) => {
        const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}`;
        const resp = await fetch(url, {
          headers: { "User-Agent": UA },
          signal: AbortSignal.timeout(8000),
        });
        if (resp.ok) {
          const data = await resp.json();
          return (data[1] || []) as string[];
        }
        return [];
      })
    );

    const seen = new Set<string>();
    for (const r of results) {
      if (r.status === "fulfilled") {
        for (const s of r.value) {
          const clean = s.toLowerCase().trim();
          if (!seen.has(clean) && clean.length > 2) {
            seen.add(clean);
            items.push({ term: s, context: "Social media search trend" });
          }
        }
      }
    }
  } catch {
    return { source: "Social Media", icon: "📱", items: [], fetched: false, error: "Failed to fetch" };
  }

  return { source: "Social Media (TikTok/Instagram)", icon: "📱", items: items.slice(0, 15), fetched: true };
}

/* ═══════════════════════════════════════════════════════
   MASTER: Fetch all trend sources in parallel
   ═══════════════════════════════════════════════════════ */
export async function fetchAllTrendSources(query: string, etsyTags?: string[]): Promise<TrendSource[]> {
  const [google, autocomplete, pinterest, reddit, social] = await Promise.allSettled([
    fetchGoogleTrends(),
    fetchGoogleAutocomplete(query),
    fetchPinterestTrends(query),
    fetchRedditTrends(query),
    fetchSocialMediaTrends(query),
  ]);

  const sources: TrendSource[] = [];

  // Always add seasonal (synchronous)
  sources.push(getSeasonalTrends());

  // Add fetched sources
  if (google.status === "fulfilled") sources.push(google.value);
  if (autocomplete.status === "fulfilled") sources.push(autocomplete.value);
  if (pinterest.status === "fulfilled") sources.push(pinterest.value);
  if (reddit.status === "fulfilled") sources.push(reddit.value);
  if (social.status === "fulfilled") sources.push(social.value);

  // Add Etsy tags if provided
  if (etsyTags && etsyTags.length > 0) {
    sources.push(await fetchEtsyTrendingTags(etsyTags));
  }

  return sources;
}
