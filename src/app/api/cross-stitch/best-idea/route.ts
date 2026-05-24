import { NextResponse } from "next/server";
import {
  fetchGoogleTrends,
  fetchPinterestTrends,
  fetchRedditTrends,
  fetchGoogleAutocomplete,
  getSeasonalTrends,
  TrendItem,
} from "@/lib/trend-sources";
import { searchEtsyListings, analyzeNiche } from "@/lib/etsy-research";
import { callGeminiJSON, parseGeminiJSON } from "@/lib/gemini";
import { isTrademarked, checkIdeaForIP, IP_GUARDRAIL_PROMPT } from "@/lib/trademark-filter";
import { creativeBoost } from "@/lib/creative-boost";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/* ─────────────────────────────────────────────────────────────
 * POST /api/cross-stitch/best-idea
 *
 * The "Find THE best idea" button. Aggregates EVERY live signal
 * we have — spiking keywords, seasonal events, popular buyer
 * queries — then does a real Etsy competition check on the top
 * 3 candidates, and asks Gemini to pick ONE high-confidence
 * recommendation the seller should design TODAY.
 *
 * Why a separate endpoint: live-pulse returns 6 parallel ideas
 * (menu), this returns THE one (decision). Different mental
 * model, different prompt. This one gets full Etsy competition
 * context so the pick is grounded in real saturation data.
 *
 * Response shape:
 *   idea: {
 *     title, why_this, confidence, urgency, tags,
 *     search_query, image_prompt
 *   }
 *
 * image_prompt is a ready-to-paste GPT-Image-2 prompt so clicking
 * "Design this" in the UI can jump straight to step 2 with the
 * design input pre-filled.
 * ───────────────────────────────────────────────────────────── */
export async function POST() {
  try {
    // Fetch everything we can in parallel. Each source is tolerant —
    // if one fails (API down, rate-limited), the others still feed
    // Gemini enough context.
    //
    // 2026-05-10: added etsyBestSellers as a co-equal data source so
    // Gemini's pick is grounded in what's actually selling on Etsy
    // right now, not just generic internet trends.
    const [googleTrends, pinterest, reddit, autocomplete, seasonalRaw, etsyBestSellers] =
      await Promise.all([
        fetchGoogleTrends().catch(() => null),
        fetchPinterestTrends("cross stitch").catch(() => null),
        fetchRedditTrends("cross stitch").catch(() => null),
        fetchGoogleAutocomplete("cross stitch pattern").catch(() => null),
        Promise.resolve(getSeasonalTrends()),
        searchEtsyListings("cross stitch pattern digital download", "score", 20).catch(
          () => ({ total: 0, listings: [] }),
        ),
      ]);

    /* ── Etsy bestsellers context block ──
     * Top 15 titles + top 10 tag-frequencies from the same fetch.
     * Goes into the Gemini prompt before the per-term competition
     * data so the model sees both: which categories already sell
     * (titles), and which terms drive that selling (tags). */
    const bsListings = etsyBestSellers.listings ?? [];
    const bsTitles = bsListings.slice(0, 15).map((l) => l.title);
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
      .slice(0, 10)
      .map(([t, n]) => `${t} (${n})`);

    const bestsellersContext =
      bsTitles.length === 0
        ? "(Etsy bestseller fetch unavailable)"
        : [
            `Titles:`,
            ...bsTitles.map((t, i) => `${i + 1}. "${t}"`),
            `Most-used tags: ${bsTopTags.join(", ")}`,
          ].join("\n");

    // Build a unified candidate pool (term + source-count reinforcement).
    // We only need the top terms to ground Gemini — not the full feed.
    const pool = new Map<string, { term: string; sources: Set<string>; score: number; context?: string }>();
    const add = (source: string, items: TrendItem[], weight: number) => {
      for (const it of items.slice(0, 10)) {
        const key = it.term.toLowerCase().trim();
        if (!key || key.length < 3) continue;
        // IP gate: never let trademarked terms into the candidate pool
        // — Gemini should not even SEE them, because seeing them often
        // nudges it to propose "inspired by" workarounds that still infringe.
        if (isTrademarked(it.term)) continue;
        const existing = pool.get(key);
        const s = (it.score ?? 50) * weight;
        if (existing) {
          existing.sources.add(source);
          existing.score += s * 0.5; // cross-source bonus
        } else {
          pool.set(key, { term: it.term, sources: new Set([source]), score: s, context: it.context });
        }
      }
    };
    add("Google Trends", googleTrends?.items ?? [], 1.0);
    add("Reddit", reddit?.items ?? [], 0.85);
    add("Pinterest", pinterest?.items ?? [], 0.8);
    add("Google Suggest", autocomplete?.items ?? [], 0.7);

    const top = [...pool.values()].sort((a, b) => b.score - a.score).slice(0, 8);

    // Competition probe: for the top 3 candidate terms, actually hit
    // Etsy so Gemini can weigh real saturation. This is the single
    // most important signal — a term that's hot on Google but has
    // 50k Etsy listings is NOT an opportunity.
    const probeTerms = top.slice(0, 3).map((t) => t.term);
    const competitionData = await Promise.all(
      probeTerms.map(async (term) => {
        try {
          const etsyQuery = term.toLowerCase().includes("cross stitch") ? term : `${term} cross stitch pattern`;
          const { total, listings } = await searchEtsyListings(etsyQuery, "score", 20);
          const analysis = analyzeNiche(
            listings.map((l) => ({
              price: l.price,
              favorites: l.favorites,
              views: l.views,
              listing_age_days: l.listing_age_days,
            })),
            total,
          );
          return {
            term,
            total,
            avg_price: analysis.avg_price,
            competition_level: analysis.competition_level,
            demand_score: analysis.demand_score,
          };
        } catch {
          return { term, total: null, avg_price: null, competition_level: "unknown", demand_score: null };
        }
      }),
    );

    // Seasonal events — the ones near enough to matter (next 45 days).
    const seasonalEvents = seasonalRaw.items
      .filter((i) => (i.score ?? 0) >= 40 && !i.term.includes("Season"))
      .slice(0, 4);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Graceful fallback — return the strongest NON-IP signal as a
      // plain pick so the UI still renders something useful on
      // API-free deploys. Pool is already IP-filtered, but double-
      // check the selection is clean.
      const fallback = top.find((t) => !isTrademarked(t.term));
      if (!fallback) {
        return NextResponse.json({ idea: null, error: "No safe signals available" }, { status: 200 });
      }
      return NextResponse.json({
        idea: {
          title: `${fallback.term} cross stitch pattern`,
          why_this: `Strongest velocity across ${[...fallback.sources].join(", ")}.`,
          confidence: 60,
          urgency: "rising",
          tags: [fallback.term.toLowerCase(), "cross stitch pattern"],
          search_query: `${fallback.term} cross stitch`,
          image_prompt: `${fallback.term} kawaii character, flat cartoon sticker illustration, solid color fills with NO gradients and NO shading, clean medium-weight outlines, soft pastel colors, rounded simple shapes, single centered subject, pure white background, no room scene, no frame, no mockup. NOT photorealistic, NOT watercolor, NOT painterly, NOT 3D render.`,
        },
      });
    }

    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const prompt = `You are a senior Etsy cross-stitch market strategist. Today is ${today}. Pick ONE high-confidence product idea the seller should design TODAY.

${IP_GUARDRAIL_PROMPT}

${creativeBoost()}

═══ TOP CROSS-SOURCE SIGNALS ═══
${top.map((t, i) => `${i + 1}. "${t.term}" — seen on ${[...t.sources].join(", ")}${t.context ? ` — ${t.context}` : ""} [score ${t.score.toFixed(0)}]`).join("\n")}

═══ ACTUAL ETSY BESTSELLERS RIGHT NOW (top ${bsTitles.length} by score) ═══
${bestsellersContext}
Use these to calibrate your pick: a good idea either (a) enters a proven-selling category with a fresher angle, or (b) brings a trending-signal theme into cross-stitch BEFORE the market catches up.

═══ REAL ETSY COMPETITION (top 3 candidates) ═══
${competitionData.map((c) => `- "${c.term}": ${c.total != null ? `${c.total.toLocaleString()} listings, avg $${c.avg_price}, ${c.competition_level} competition, demand ${c.demand_score}/100` : "probe failed"}`).join("\n")}

═══ SEASONAL EVENTS (next 45 days) ═══
${seasonalEvents.map((e) => `- ${e.term}${e.context ? ` — ${e.context}` : ""}`).join("\n") || "(no imminent events)"}

Return JSON with ONE idea:
{
  "idea": {
    "title": "SPECIFIC pattern name — NOT generic. Must name the subject + style + mood. Bad: 'Autumn patterns'. Good: 'Moody navy mushroom sampler with thick gold outlines'",
    "why_this": "1-2 sentences that CITE specific signals above. Mention the competition numbers or source count that make this a smart pick.",
    "confidence": 0-100 integer,
    "urgency": "hot | rising | seasonal | evergreen",
    "tags": ["4-5 tags the seller would type into Etsy research tools"],
    "search_query": "The exact phrase to scan Etsy for this niche. Under 40 chars. What BUYERS type.",
    "image_prompt": "Short flat-cartoon description for GPT-Image-2. Format: '[subject + pose/accessory], flat cartoon kawaii sticker illustration, solid color fills with NO gradients and NO shading, clean medium-weight outlines, soft pastel colors, rounded simple shapes, single centered subject, pure white background, no room scene, no frame, no mockup. NOT photorealistic, NOT watercolor, NOT painterly, NOT soft illustration, NOT 3D render, NOT bold thick sticker outlines.' Keep the subject description under 20 words — short descriptions produce cleaner flat-color output. Good example: 'Chubby frog wearing a tiny chef hat and holding a spatula, flat cartoon kawaii sticker illustration, solid color fills with NO gradients and NO shading, clean medium-weight outlines, soft pastel colors, rounded simple shapes, single centered subject, pure white background. NOT photorealistic, NOT watercolor, NOT painterly, NOT 3D render.'"
  }
}

Decision rules (follow in order):
1. PREFER terms with low or moderate Etsy competition over saturated ones, even if velocity is lower.
2. If a seasonal event is within 14 days AND combines with a rising style signal, weight seasonal higher.
3. Confidence calibration: 85+ only when BOTH multi-source velocity AND favorable competition data support the pick. 70–84 when one is strong and one is fine. Below 70 when you're guessing.
4. The title must be specific enough to start designing from — subject + style + mood + VOICE. If the call angle above is humor-forward, the title should include the actual snarky/funny phrase (quoted) that would appear on the design.
5. Given the same signals, DIFFERENT calls must produce DIFFERENT picks — the call angle above is the tiebreaker. Lean into it.
6. The image_prompt MUST produce a FLAT CARTOON KAWAII illustration — solid color fills, clean medium outlines, NO watercolor gradients, NO painterly shading, NO soft children's-book texture. Reasoning: cross-stitch quantization needs large flat solid-color regions to map cleanly to DMC threads. Watercolor gradients and soft illustrations create hundreds of intermediate blended colors that collapse into confetti-stitch noise. Short subject descriptions (under 20 words) + the flat-cartoon style suffix produce the cleanest output.`;

    // temperature: 0.95 + creativeBoost angle/nonce = fresh pick each
    // click instead of the same "safe" choice from identical signals.
    const raw = await callGeminiJSON(apiKey, prompt, { temperature: 0.95 });
    const parsed = parseGeminiJSON<{
      idea?: {
        title?: string;
        why_this?: string;
        confidence?: number;
        urgency?: string;
        tags?: string[];
        search_query?: string;
        image_prompt?: string;
      };
    }>(raw);

    if (!parsed?.idea?.title) {
      return NextResponse.json({ idea: null, error: "Gemini returned no idea" }, { status: 200 });
    }

    const i = parsed.idea;

    // Last-line defense: if Gemini ignored the guardrail and produced
    // IP-tainted content anyway, refuse to surface it. Better to show
    // the user "no idea right now" than to risk their Etsy shop.
    const ipHit = checkIdeaForIP({
      title: i.title,
      tags: i.tags,
      search_query: i.search_query,
      image_prompt: i.image_prompt,
    });
    if (ipHit) {
      console.warn(`[best-idea] refusing IP-tainted idea "${i.title}" (matched: ${ipHit})`);
      return NextResponse.json({
        idea: null,
        error: `The AI proposed an idea involving "${ipHit}" which is trademarked and would get your Etsy shop banned. Try again in a moment — the signals will have shifted.`,
      }, { status: 200 });
    }

    const urgency: "hot" | "rising" | "seasonal" | "evergreen" =
      i.urgency === "hot" || i.urgency === "rising" || i.urgency === "seasonal" || i.urgency === "evergreen"
        ? i.urgency
        : "rising";

    return NextResponse.json({
      idea: {
        title: i.title ?? "",
        why_this: i.why_this ?? "",
        confidence: Math.max(0, Math.min(100, Math.round(Number(i.confidence ?? 70)))),
        urgency,
        tags: Array.isArray(i.tags) ? i.tags.slice(0, 5) : [],
        search_query: (i.search_query ?? "").slice(0, 60),
        image_prompt: i.image_prompt ?? "",
      },
    });
  } catch (err) {
    console.error("[best-idea] failed:", err);
    return NextResponse.json(
      { idea: null, error: err instanceof Error ? err.message : "best-idea failed" },
      { status: 500 },
    );
  }
}
