import { NextResponse } from "next/server";
import {
  fetchGoogleTrends,
  fetchPinterestTrends,
  fetchRedditTrends,
  getSeasonalTrends,
  fetchGoogleAutocomplete,
  TrendItem,
} from "@/lib/trend-sources";
import { callGeminiJSON, parseGeminiJSON } from "@/lib/gemini";
import { isTrademarked, checkIdeaForIP, IP_GUARDRAIL_PROMPT } from "@/lib/trademark-filter";
import { creativeBoost } from "@/lib/creative-boost";
import { searchEtsyListings } from "@/lib/etsy-research";

export const maxDuration = 45;
// Research-page initial load — this should be fresh-ish but cache-friendly,
// not dynamic per-request. Next.js route-segment cache handles that via
// the Cache-Control header below. force-dynamic would double our Google
// Trends fetch traffic with no UX benefit.
export const dynamic = "force-dynamic";

/* ── isSearchableKeyword ──
 * Reddit's `hot` feed returns full post titles ("My painting 'order
 * up' 🍔", "Look what I made!", "it took me almost two years to…"),
 * which are great as social signals but useless as Etsy search
 * queries. When the user clicks a Spiking Now card, scanEtsy() sends
 * the term verbatim to /api/cross-stitch/research, which appends
 * "cross stitch pattern digital download" and asks Etsy. A post
 * title gets zero hits and the panel renders empty.
 *
 * This filter rejects strings that look like a sentence rather than
 * a keyword phrase — too long, contains emoji, contains personal-
 * narrative words, or trails off with an ellipsis. Anything that
 * survives is short enough and clean enough to be worth scanning.
 *
 * Conservative on purpose: false negatives (dropping a real keyword)
 * are cheaper than false positives (showing an unsearchable card). */
function isSearchableKeyword(term: string): boolean {
  const t = term.trim();
  if (!t || t.length < 3) return false;
  // Etsy search keywords are short. Anything past ~50 chars is a
  // sentence, not a query.
  if (t.length > 50) return false;
  // Reddit bracket-tag prefix: r/CrossStitch posts almost always lead
  // with "[FO]" (Finished Object), "[WIP]" (Work In Progress), "[OC]"
  // (Original Content), "[Help]", "[Question]", "[Pattern]", etc. The
  // bracket tag is the universal Reddit-share fingerprint — if a term
  // starts with one, it's a community post title, not a search query.
  // Catches "[FO] 2nd cross stitch complete" without needing every
  // tag enumerated, since the SHAPE is the signal.
  if (/^\s*\[\s*[A-Za-z][A-Za-z0-9 _/-]{0,20}\s*\]/.test(t)) return false;
  // Emoji or other non-Latin pictographs almost always come from
  // user-authored content (Reddit titles, social posts), never from
  // Google Trends or autocomplete suggestions.
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t)) return false;
  // Trailing ellipsis is the giveaway for a truncated post title
  // (Reddit truncates long titles in some feeds).
  if (/[…]|\.\.\.$/.test(t)) return false;
  // "Share my work" tail words: r/CrossStitch's most common post shape
  // is "<my project> complete/completed/finished/done". As an Etsy
  // search query these get zero hits. Catches "2nd cross stitch
  // complete", "first sampler finished", "kitten chart done", etc.
  if (/\b(?:complete|completed|finished|done)\b\s*[!.]?\s*$/i.test(t)) return false;
  // Leading ordinal ("1st", "2nd", "3rd", "100th") or any digit at the
  // very start. Real keyword phrases like "valentines 2026" can have
  // digits, but ALMOST NEVER as the first token. "2nd cross stitch
  // complete", "100 stitches in", "3rd attempt" are all share-my-work.
  if (/^\d+(?:st|nd|rd|th)?\b/i.test(t)) return false;
  // Word-count gate: keywords are 1-6 words. A 7+ word string is a
  // sentence. Belt-and-suspenders against share-my-work titles that
  // somehow dodge the prefix/suffix rules above.
  if (t.split(/\s+/).filter(Boolean).length > 6) return false;
  // First-person narrative words betray a Reddit post title:
  // "I made", "Look what I", "It took me", "My painting", "Help with",
  // "Question about", "Anyone else", "Just finished". None of these
  // are search queries.
  const narrativeMarkers = [
    /\bI\s+(?:made|finished|just|started|need|want|love|hate|tried|got|bought)\b/i,
    /\bI'?(?:ve|m|d)\b/i,
    /\bmy\s+(?:first|new|painting|design|piece|project|wife|husband|mom|dad|kid|cat|dog|son|daughter|sister|brother|baby|grandma|grandpa)\b/i,
    /\blook\s+(?:what|at)\b/i,
    /\btook\s+(?:me|us)\b/i,
    /\bjust\s+(?:finished|made|completed|started)\b/i,
    /\banyone\s+(?:else|know|have|got)\b/i,
    /\bhelp\s+(?:me|with)\b/i,
    /\bquestion\s+about\b/i,
    /\bwhat\s+(?:is|are|do|did)\b/i,
    /\bhow\s+(?:do|can|did)\b/i,
    /\bcan\s+(?:I|someone|anyone)\b/i,
    /\bfinally\b/i,
  ];
  if (narrativeMarkers.some((re) => re.test(t))) return false;
  // Sentence-ending punctuation (question marks, exclamations) is
  // another tell. A real keyword phrase doesn't end with `?` or `!`.
  if (/[?!]$/.test(t)) return false;
  // Quoted spans inside the term ("My painting 'order up' 🍔") are
  // almost always titles. Plain double-quote keywords are rare on
  // Etsy — safe to drop.
  if (/['"\u2018\u2019\u201C\u201D]/.test(t)) return false;
  return true;
}

/* ─────────────────────────────────────────────────────────────
 * GET /api/cross-stitch/live-pulse
 *
 * Loaded the moment the Research page mounts — no user query
 * required. Returns THREE rows of always-on intelligence:
 *
 *   spiking:    top keywords across Google Trends + Pinterest +
 *               Reddit, ranked by velocity. One-click search bait.
 *   ideas:      6 Gemini-synthesized product concepts cross-
 *               referenced against current trend data (not
 *               generic categories).
 *   seasonal:   next 4 events with days-until urgency + suggested
 *               angle per event.
 *
 * Why GET (not POST) — no body, idempotent, fronting a cache
 * layer later becomes trivial (just swap dynamic="force-dynamic"
 * for a revalidate). Also works with a plain <link rel="prefetch">
 * if we ever want to warm it from the app shell.
 * ───────────────────────────────────────────────────────────── */
export async function GET() {
  try {
    // Fetch three sources in parallel. Cross-stitch-specific queries —
    // we're not starting from a blank slate like the main research
    // endpoint, we want signals that are ALREADY cross-stitch-adjacent.
    //
    // 2026-05-10: added etsyBestsellers as a co-equal data source.  The
    // previous flow had Gemini synthesise ideas from generic internet
    // trends (Google "NBA playoffs", Reddit craft posts) without ever
    // seeing what's actually selling on Etsy — output was untethered
    // from real buyer demand.  Pulling the top-30 Etsy bestsellers in
    // the same Promise.all keeps latency flat and lets the prompt do
    // a real gap analysis (proven categories ↔ trending signals →
    // opportunity windows).
    const [googleTrends, pinterest, reddit, seasonalRaw, autocomplete, etsyBestsellers] =
      await Promise.all([
        fetchGoogleTrends().catch(() => null),
        fetchPinterestTrends("cross stitch").catch(() => null),
        fetchRedditTrends("cross stitch").catch(() => null),
        Promise.resolve(getSeasonalTrends()),
        fetchGoogleAutocomplete("cross stitch pattern").catch(() => null),
        searchEtsyListings("cross stitch pattern digital download", "score", 30).catch(
          () => ({ total: 0, listings: [] }),
        ),
      ]);

    /* ── Etsy bestsellers context block ──
     * Pulled from the top 30 by Etsy "score" rank.  Titles tell us
     * which subjects already convert; the tag-frequency histogram
     * tells us the keyword vocabulary buyers + sellers actually use.
     * Both go into the Gemini prompt as the "currently selling"
     * baseline that the trending-signals data is then diffed against. */
    const bsListings = etsyBestsellers.listings ?? [];
    const bsTitles = bsListings.slice(0, 20).map((l) => l.title);
    const bsAvgPrice = bsListings.length
      ? +(bsListings.reduce((sum, l) => sum + l.price, 0) / bsListings.length).toFixed(2)
      : 0;
    const bsAvgFavs = bsListings.length
      ? Math.round(bsListings.reduce((sum, l) => sum + l.favorites, 0) / bsListings.length)
      : 0;
    const bsTagCounts = new Map<string, number>();
    for (const l of bsListings) {
      try {
        const tags: string[] = JSON.parse(l.tags);
        for (const t of tags) {
          const key = t.toLowerCase().trim();
          if (key.length < 3) continue;
          bsTagCounts.set(key, (bsTagCounts.get(key) ?? 0) + 1);
        }
      } catch {
        /* malformed tags — skip */
      }
    }
    const bsTopTags = [...bsTagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([t, n]) => `${t} (${n})`);

    const bestsellersBlock =
      bsTitles.length === 0
        ? "(Etsy fetch unavailable — proceed with trending signals only)"
        : [
            `TOP ${bsTitles.length} ACTUAL ETSY BESTSELLERS (by Etsy ranking, "cross stitch pattern digital download"):`,
            `Titles:`,
            ...bsTitles.map((t, i) => `${i + 1}. "${t}"`),
            `Most-used tags (frequency in those listings): ${bsTopTags.join(", ")}`,
            `Market benchmarks: avg price $${bsAvgPrice}, avg favorites ${bsAvgFavs}`,
          ].join("\n");

    /* ── Row 1: Spiking Now ──
     * Merge top items from every live source into a single ranked
     * feed. Google Trends carries the most weight (it IS velocity
     * data), Pinterest + Reddit reinforce. Dedupe by lowercased term
     * so "cozy cats" from Reddit and "cozy cats" from Pinterest
     * collapse into one card showing both as sources. */
    const spikingBySource: {
      source: string;
      items: TrendItem[];
      weight: number;
    }[] = [
      { source: "Google Trends", items: googleTrends?.items ?? [], weight: 1.0 },
      { source: "Reddit", items: reddit?.items?.slice(0, 12) ?? [], weight: 0.85 },
      { source: "Pinterest", items: pinterest?.items?.slice(0, 12) ?? [], weight: 0.8 },
      { source: "Google Suggest", items: autocomplete?.items?.slice(0, 10) ?? [], weight: 0.7 },
    ];
    const spikingMap = new Map<
      string,
      { term: string; sources: string[]; context?: string; score: number }
    >();
    for (const { source, items, weight } of spikingBySource) {
      for (const item of items) {
        const key = item.term.toLowerCase().trim();
        if (!key || key.length < 3) continue;
        // IP gate: drop trademarked terms BEFORE they enter the feed.
        // Etsy bans shops that list IP-infringing patterns, so we don't
        // want Pokemon/Disney/Marvel even surfacing as a "trending" option.
        if (isTrademarked(item.term)) continue;
        // Searchability gate: Reddit returns RAW POST TITLES (e.g.
        // "My painting 'order up' 🍔" or "it took me almost two yea…")
        // which are useless as Etsy search queries — clicking them
        // sends "[reddit post title] cross stitch pattern digital
        // download" to Etsy, which returns zero hits and the user sees
        // a blank results panel. Filter out obvious post-title shapes
        // so every card in the feed is a clickable, searchable keyword.
        if (!isSearchableKeyword(item.term)) continue;
        const weightedScore = (item.score ?? 50) * weight;
        const existing = spikingMap.get(key);
        if (existing) {
          existing.sources.push(source);
          existing.score += weightedScore * 0.5; // cross-source reinforcement bonus
        } else {
          spikingMap.set(key, {
            term: item.term,
            sources: [source],
            context: item.context,
            score: weightedScore,
          });
        }
      }
    }
    const spiking = [...spikingMap.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    /* ── Row 3: Seasonal Countdown (computed first so we can feed it into Gemini) ──
     * Take events with score > 0 (non-evergreen), sort by urgency,
     * keep top 4. These drive "what's timely RIGHT NOW". */
    const seasonalEvents = seasonalRaw.items
      .filter((i) => (i.score ?? 0) >= 40 && !i.term.includes("Season"))
      .slice(0, 4)
      .map((i) => {
        // Extract days-until from the context string "2 weeks away — trending tags: x, y"
        const daysMatch = i.context?.match(/(\d+)\s*(?:days|day)/i);
        const daysUntil = daysMatch ? parseInt(daysMatch[1]) : null;
        const weeksMatch = i.context?.match(/(\d+)\s*weeks?/i);
        const days = daysUntil ?? (weeksMatch ? parseInt(weeksMatch[1]) * 7 : null);
        const tags =
          i.context?.match(/trending tags:\s*(.+?)$/)?.[1]?.split(",").map((t) => t.trim()) ?? [];
        return {
          event: i.term,
          days_until: days,
          urgency: days == null ? "this week" : days <= 7 ? "this week" : days <= 14 ? "2 weeks" : `${days} days`,
          tags,
          score: i.score ?? 0,
        };
      });

    /* ── Row 2: AI-Synthesized Ideas ──
     * Gemini reads the spiking feed + seasonal events + top
     * autocomplete queries and proposes SIX specific product
     * concepts, each with: title, why-now, specific tags, urgency.
     *
     * Critical: each idea must be SPECIFIC enough to start
     * designing from. "Autumn patterns" is useless. "Moody navy
     * mushroom sampler with thick gold outlines" is actionable.
     *
     * If Gemini fails (key missing, rate-limited, etc.) we fall
     * back to deriving ideas directly from the spiking feed so
     * the row never renders empty. */
    let ideas: {
      title: string;
      why_now: string;
      urgency: "hot" | "rising" | "seasonal" | "evergreen";
      tags: string[];
      search_query: string;
      // Free reference thumbnail from Etsy — shows the seller what this
      // niche ALREADY looks like in the wild before they pay $0.04+ to
      // generate their own design. Populated below via a parallel
      // searchEtsyListings() call per idea. Optional because the Etsy
      // API can fail or return no results, and we never block the UI
      // on it.
      reference_image_url?: string;
      reference_listing_url?: string;
    }[] = [];

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && (spiking.length > 0 || seasonalEvents.length > 0 || bsTitles.length > 0)) {
      try {
        const prompt = `You are an Etsy cross-stitch market strategist. Use the data below to propose SIX specific, actionable product ideas a seller should design TODAY.

${IP_GUARDRAIL_PROMPT}

${creativeBoost()}

═══ WHAT IS ACTUALLY SELLING ON ETSY RIGHT NOW ═══
${bestsellersBlock}

═══ TRENDING SIGNALS (what buyers are searching for OUTSIDE Etsy) ═══
${spiking.slice(0, 8).map((s, i) => `${i + 1}. "${s.term}" — seen on ${s.sources.join(", ")}${s.context ? ` — ${s.context}` : ""}`).join("\n")}
Autocomplete (what buyers type into Google):
${(autocomplete?.items ?? []).slice(0, 6).map((a) => `- "${a.term}"`).join("\n") || "(none)"}

═══ SEASONAL URGENCY (next 45 days) ═══
${seasonalEvents.map((e) => `- ${e.event} (${e.urgency}) — tags: ${e.tags.join(", ")}`).join("\n") || "(no imminent events)"}

YOUR TASK — THREE-STEP ANALYSIS:
Step 1 — CATEGORIZE: Look at the bestseller titles. What subject categories dominate the current top sellers? (e.g. farm animals, florals, quotes, etc.)
Step 2 — FIND THE GAPS: What themes appear in the trending signals that are NOT yet well-represented in the current bestsellers? These are the OPPORTUNITY WINDOWS — trending demand with low Etsy supply.
Step 3 — PROPOSE 6 IDEAS based on:
  (a) Proven-selling category + FRESH ANGLE not yet in the bestsellers, OR
  (b) Gap theme from trending signals + cross-stitch treatment buyers want

Return JSON:
{
  "ideas": [
    {
      "title": "SPECIFIC concept name — NOT generic. Bad: 'Autumn patterns'. Good: 'Highland Cow Peeking From Pumpkin-Spice Mug — Autumn Cottagecore'",
      "why_now": "1 short sentence citing which bestseller pattern or trending signal(s) support this idea",
      "urgency": "hot | rising | seasonal | evergreen",
      "tags": ["3-4 tags a seller would type into Etsy to research this niche"],
      "search_query": "The exact phrase to scan Etsy for — what BUYERS would type"
    }
  ]
}

Rules:
- Exactly 6 ideas
- Each idea must be specific enough to start designing from — subject + style + mood (add VOICE/caption when humor-forward)
- Mix urgency levels: at least 2 seasonal, 2 rising, 2 evergreen/hot
- Market calibration: at least 2 of 6 must be CUTE FARM ANIMAL designs (goose/duck/cow/frog/chicken — the #1 lane on Etsy), at least 1 COTTAGECORE (jam jars, teapots, wildflowers, mushrooms), and at least 1 with a humor/snark hook. Do NOT make all 6 humor — that misses most of the market.
- Prefer ideas that combine signals (e.g. a rising Pinterest aesthetic + a seasonal event) or remix a proven winning formula from the bestsellers above with a fresh angle
- search_query stays under 40 chars and uses words buyers actually search for
- EVERY field (title, tags, search_query) must be 100% original and free of trademarked character/franchise/brand names`;

        // temperature: 0.95 + creativeBoost nonce/angle breaks the
        // "same 6 ideas every reload" bug. Was 0.6 → deterministic.
        const raw = await callGeminiJSON(apiKey, prompt, { temperature: 0.95 });
        const parsed = parseGeminiJSON<{
          ideas: {
            title: string;
            why_now: string;
            urgency: string;
            tags: string[];
            search_query: string;
          }[];
        }>(raw);
        if (parsed?.ideas?.length) {
          ideas = parsed.ideas
            // Belt-and-suspenders: drop anything Gemini hallucinated
            // with IP in it, even though the prompt forbids it.
            .filter((i) => {
              const hit = checkIdeaForIP({
                title: i.title,
                tags: i.tags,
                search_query: i.search_query,
              });
              if (hit) {
                console.warn(`[live-pulse] dropping IP-tainted idea "${i.title}" (matched: ${hit})`);
                return false;
              }
              return true;
            })
            .slice(0, 6)
            .map((i) => ({
              title: i.title ?? "",
              why_now: i.why_now ?? "",
              urgency:
                i.urgency === "hot" || i.urgency === "rising" || i.urgency === "seasonal" || i.urgency === "evergreen"
                  ? i.urgency
                  : "rising",
              tags: Array.isArray(i.tags) ? i.tags.slice(0, 4) : [],
              search_query: (i.search_query ?? "").slice(0, 60),
            }));
        }
      } catch (err) {
        console.warn("[live-pulse] Gemini ideas failed, falling back:", err);
      }
    }

    // Fallback: derive ideas directly from the top spiking terms. Not as
    // specific as Gemini output but keeps the row populated on API-free
    // preview deployments and during rate-limit windows. The spiking
    // feed is already IP-filtered upstream, but we re-check here so any
    // future code path that populates `spiking` directly can't leak IP.
    if (ideas.length === 0) {
      ideas = spiking
        .filter((s) => !isTrademarked(s.term))
        .slice(0, 6)
        .map((s) => ({
          title: `${s.term} cross stitch`,
          why_now: `Trending on ${s.sources.slice(0, 2).join(" + ")}`,
          urgency: s.score > 70 ? "hot" : s.score > 45 ? "rising" : "evergreen",
          tags: [s.term.toLowerCase().split(" ").slice(0, 2).join(" "), "cross stitch pattern"],
          search_query: `${s.term} cross stitch`,
        }));
    }

    /* ── Attach free Etsy reference thumbnails to each idea ──
     * Key UX fix: before this, the seller saw only text titles and had to
     * pay ~$0.04 to gpt-image-2 JUST to find out whether an idea would
     * even LOOK like something they'd want to sell. Now they see a real
     * Etsy listing photo from the same niche first — "oh, THAT'S what
     * Highland-cow-in-teacup looks like, yes/no" — for free.
     *
     * Performance: 6 parallel Etsy calls, limit=1 each. ~300-800ms total
     * since they run concurrently. Worst-case single-call failure doesn't
     * break the pipeline — allSettled + per-idea try/catch keeps every
     * other idea intact. We never await a failed call or throw from here. */
    const searchQueries = ideas.map((idea) => {
      const q = (idea.search_query || idea.title || "").trim();
      // Etsy search works best when the category is present — if Gemini
      // returned just "Highland cow in teacup" without "cross stitch",
      // append it so we don't pull up photography listings.
      return q.toLowerCase().includes("cross stitch") ? q : `${q} cross stitch`;
    });

    const refResults = await Promise.allSettled(
      searchQueries.map((q) =>
        q ? searchEtsyListings(q, "score", 1) : Promise.resolve({ total: 0, listings: [] }),
      ),
    );

    ideas = ideas.map((idea, idx) => {
      const r = refResults[idx];
      if (r.status !== "fulfilled") return idea;
      const top = r.value.listings?.[0];
      if (!top?.image_url) return idea;
      return {
        ...idea,
        reference_image_url: top.image_url,
        reference_listing_url: top.url,
      };
    });

    // Cost calibration (2026-04-25): every Research-tab visit was firing
    // a fresh Gemini call because `dynamic = "force-dynamic"` skips the
    // Next.js route cache AND we forgot to send a Cache-Control header.
    // Trends data doesn't move minute-to-minute — 15 min fresh + 1 hr
    // stale-while-revalidate is plenty fresh for the seller's mental
    // model ("what's hot today") while collapsing N tab-toggles per
    // session into a single backend hit. Saves a Gemini synthesis call
    // and 10+ Etsy reference probes per cached visit.
    //
    // Dev override: in development the browser cache makes filter/prompt
    // tweaks invisible until the 15-min TTL expires (you fix a bad term
    // in code, hard-refresh the page, still see the old term). Disable
    // caching entirely in dev — cost doesn't matter, iteration speed does.
    const isProd = process.env.NODE_ENV === "production";
    return NextResponse.json(
      {
        spiking,
        ideas,
        seasonal: seasonalEvents,
        generated_at: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": isProd
            ? "public, max-age=900, stale-while-revalidate=3600"
            : "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (err) {
    console.error("[live-pulse] failed:", err);
    return NextResponse.json(
      { spiking: [], ideas: [], seasonal: [], error: err instanceof Error ? err.message : "live-pulse failed" },
      { status: 500 },
    );
  }
}
