import { NextResponse } from "next/server";
import {
  fetchGoogleTrends,
  fetchPinterestTrends,
  fetchRedditTrends,
  getSeasonalTrends,
  fetchGoogleAutocomplete,
  type TrendItem,
} from "@/lib/trend-sources";
import { callGeminiJSON, parseGeminiJSON } from "@/lib/gemini";
import { isTrademarked, checkIdeaForIP, IP_GUARDRAIL_PROMPT } from "@/lib/trademark-filter";
import { creativeBoost } from "@/lib/creative-boost";
import { searchEtsyListings } from "@/lib/etsy-research";

export const maxDuration = 45;
export const dynamic = "force-dynamic";

/* ─────────────────────────────────────────────────────────────
 * isSearchableKeyword
 * Same filter logic as cross-stitch live-pulse — drops Reddit post
 * titles, emoji-heavy strings, and first-person narrative phrases so
 * only clean keyword phrases reach the spiking feed.
 * ───────────────────────────────────────────────────────────── */
function isSearchableKeyword(term: string): boolean {
  const t = term.trim();
  if (!t || t.length < 3 || t.length > 50) return false;
  if (/^\s*\[\s*[A-Za-z][A-Za-z0-9 _/-]{0,20}\s*\]/.test(t)) return false;
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t)) return false;
  if (/[…]|\.\.\.$/.test(t)) return false;
  if (/\b(?:complete|completed|finished|done)\b\s*[!.]?\s*$/i.test(t)) return false;
  if (/^\d+(?:st|nd|rd|th)?\b/i.test(t)) return false;
  if (t.split(/\s+/).filter(Boolean).length > 7) return false;
  const narrativeMarkers = [
    /\bI\s+(?:made|finished|just|started|need|want|love|hate|tried|got|bought)\b/i,
    /\bI'?(?:ve|m|d)\b/i,
    /\bmy\s+(?:first|new|budget|spreadsheet|planner|tracker|sheet)\b/i,
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
  if (/[?!]$/.test(t)) return false;
  if (/['"‘’“”]/.test(t)) return false;
  return true;
}

function hasSpreadsheetBuyerIntent(term: string): boolean {
  const t = term.toLowerCase();
  const positiveSignals = [
    "spreadsheet",
    "google sheets",
    "excel",
    "xlsx",
    "tracker",
    "planner",
    "dashboard",
    "template",
    "budget",
    "paycheck",
    "finance",
    "expense",
    "income",
    "savings",
    "debt",
    "bill",
    "invoice",
    "bookkeeping",
    "inventory",
    "calendar",
    "schedule",
    "checklist",
    "log",
    "habit",
    "task",
    "project",
    "wedding",
    "guest list",
    "vendor",
    "meal plan",
    "workout",
    "airbnb",
    "teacher",
    "nurse",
    "small business",
    "tax",
  ];
  const negativeSignals = [
    "cross stitch",
    "embroidery",
    "pattern",
    "wall art",
    "clipart",
    "svg",
    "shirt",
    "mug",
    "sticker",
    "poster",
    "horror",
  ];
  return positiveSignals.some((signal) => t.includes(signal)) &&
    !negativeSignals.some((signal) => t.includes(signal));
}

/* ─────────────────────────────────────────────────────────────
 * GET /api/factory/live-pulse
 *
 * Spreadsheet-focused version of the cross-stitch live-pulse.
 * Returns:
 *   spiking   — top trending spreadsheet/planner keywords
 *   ideas     — 6 Gemini-synthesized spreadsheet product ideas
 *   seasonal  — next 4 calendar events relevant to spreadsheets
 * ───────────────────────────────────────────────────────────── */
export async function GET() {
  try {
    // Fetch trend sources in parallel — all spreadsheet/finance focused
    const [googleTrends, pinterest, reddit, redditFinance, seasonalRaw, autocomplete] =
      await Promise.all([
        fetchGoogleTrends().catch(() => null),
        fetchPinterestTrends("budget planner spreadsheet template").catch(() => null),
        fetchRedditTrends("budget spreadsheet template google sheets").catch(() => null),
        fetchRedditTrends("personal finance planner").catch(() => null),
        Promise.resolve(getSeasonalTrends()),
        fetchGoogleAutocomplete("google sheets template budget").catch(() => null),
      ]);

    // Merge reddit sources
    const redditItems: TrendItem[] = [
      ...(reddit?.items ?? []),
      ...(redditFinance?.items ?? []),
    ];

    /* ── Row 1: Spiking Now ── */
    const spikingBySource: {
      source: string;
      items: TrendItem[];
      weight: number;
    }[] = [
      { source: "Google Trends", items: googleTrends?.items ?? [], weight: 1.0 },
      { source: "Pinterest", items: pinterest?.items?.slice(0, 12) ?? [], weight: 0.85 },
      { source: "Reddit", items: redditItems.slice(0, 12), weight: 0.8 },
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
        if (isTrademarked(item.term)) continue;
        if (!isSearchableKeyword(item.term)) continue;
        if (!hasSpreadsheetBuyerIntent(item.term)) continue;
        const weightedScore = (item.score ?? 50) * weight;
        const existing = spikingMap.get(key);
        if (existing) {
          existing.sources.push(source);
          existing.score += weightedScore * 0.5;
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

    /* ── Row 3: Seasonal Countdown ──
     * Spreadsheet sellers benefit from time-sensitive calendar events:
     * New Year (budgeting resolutions), Tax Season, Wedding Season,
     * Back to School, Mother's Day, Baby Shower season, etc. */
    const seasonalEvents = seasonalRaw.items
      .filter((i) => (i.score ?? 0) >= 40 && !i.term.includes("Season"))
      .slice(0, 4)
      .map((i) => {
        const daysMatch = i.context?.match(/(\d+)\s*(?:days|day)/i);
        const daysUntil = daysMatch ? parseInt(daysMatch[1]) : null;
        const weeksMatch = i.context?.match(/(\d+)\s*weeks?/i);
        const days = daysUntil ?? (weeksMatch ? parseInt(weeksMatch[1]) * 7 : null);
        const tags =
          i.context?.match(/trending tags:\s*(.+?)$/)?.[1]?.split(",").map((t) => t.trim()) ?? [];
        return {
          event: i.term,
          days_until: days,
          urgency:
            days == null
              ? "this week"
              : days <= 7
              ? "this week"
              : days <= 14
              ? "2 weeks"
              : `${days} days`,
          tags,
          score: i.score ?? 0,
        };
      });

    /* ── Row 2: AI-Synthesized Spreadsheet Ideas ── */
    let ideas: {
      title: string;
      why_now: string;
      urgency: "hot" | "rising" | "seasonal" | "evergreen";
      atc_signal?: "hot" | "warm" | "cold";
      atc_reason?: string;
      tags: string[];
      search_query: string;
      reference_image_url?: string;
      reference_listing_url?: string;
    }[] = [];

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && (spiking.length > 0 || seasonalEvents.length > 0)) {
      try {
        const prompt = `You are an Etsy digital spreadsheet market strategist. Sellers build Google Sheets and Excel templates — budget trackers, planners, trackers — and sell them as instant PDF/XLSX downloads. Use the live signals below to propose SIX specific, actionable product ideas a seller could build today.

${IP_GUARDRAIL_PROMPT}

${creativeBoost()}

═══ SPIKING NOW (trending spreadsheet signals) ═══
${spiking.slice(0, 8).map((s, i) => `${i + 1}. "${s.term}" — seen on ${s.sources.join(", ")}${s.context ? ` — ${s.context}` : ""}`).join("\n")}

═══ SEASONAL URGENCY (next 45 days) ═══
${seasonalEvents.map((e) => `- ${e.event} (${e.urgency}) — tags: ${e.tags.join(", ")}`).join("\n") || "(no imminent events)"}

═══ BUYER AUTOCOMPLETE (what people type) ═══
${(autocomplete?.items ?? []).slice(0, 6).map((a) => `- "${a.term}"`).join("\n")}

═══ ATC VELOCITY HEURISTIC ═══
On Etsy, "Add to Cart" badges appear under listings with strong recent demand:
  • HOT  = estimated 20+ ATC events in last 24h (proven viral, fast sales)
  • WARM = estimated 5-19 ATC events (steady demand)
  • COLD = estimated <5 ATC events (long-tail or unproven)
For each idea, estimate the ATC level a NEW well-built listing in this niche would realistically attract within its first 7-14 days, based on the live signals above and how saturated the niche is. HOT means signals are very strong AND niche is not flooded; COLD means either weak signals OR brutal saturation.

Return JSON:
{
  "ideas": [
    {
      "title": "SPECIFIC product name — NOT generic. Bad: 'Budget Tracker'. Good: 'New Parents Baby First-Year Budget Tracker — Monthly + Weekly Google Sheets'",
      "why_now": "1 short sentence citing which signal(s) support this idea",
      "urgency": "hot | rising | seasonal | evergreen",
      "atc_signal": "hot | warm | cold",
      "atc_reason": "1 short phrase explaining the ATC estimate (what makes this a HOT vs WARM vs COLD bet)",
      "tags": ["3-4 Etsy search tags a seller would use to research this niche"],
      "search_query": "The exact phrase to scan Etsy for — what BUYERS would type (under 40 chars)"
    }
  ]
}

Rules:
- Exactly 6 ideas
- Each idea must be specific: niche audience + problem solved + format (Google Sheets / Excel / PDF) — NOT just a generic category name
- Mix urgency: at least 2 seasonal, 2 rising, 2 evergreen
- Mix atc_signal: at least 2 HOT and 2 WARM (don't return all-HOT — that's not credible)
- At least 2 must target a SPECIFIC life event (wedding, new baby, starting college, new job, divorce, retirement)
- At least 1 must have a clear NICHE audience (freelancers, nurses, teachers, Airbnb hosts, Etsy sellers, etc.)
- At least 1 must be a HABIT or HEALTH tracker (not just finance)
- search_query stays under 40 chars and mirrors how buyers actually search on Etsy
- All titles, tags, and search_query must be 100% original — no trademarked brands`;

        const raw = await callGeminiJSON(apiKey, prompt, { temperature: 0.95 });
        const parsed = parseGeminiJSON<{
          ideas: {
            title: string;
            why_now: string;
            urgency: string;
            atc_signal?: string;
            atc_reason?: string;
            tags: string[];
            search_query: string;
          }[];
        }>(raw);

        if (parsed?.ideas?.length) {
          ideas = parsed.ideas
            .filter((i) => {
              const searchable = [i.title, i.search_query, ...(Array.isArray(i.tags) ? i.tags : [])].join(" ");
              if (!hasSpreadsheetBuyerIntent(searchable)) return false;
              const hit = checkIdeaForIP({
                title: i.title,
                tags: i.tags,
                search_query: i.search_query,
              });
              if (hit) {
                console.warn(`[factory/live-pulse] dropping IP idea "${i.title}" (${hit})`);
                return false;
              }
              return true;
            })
            .slice(0, 6)
            .map((i) => ({
              title: i.title ?? "",
              why_now: i.why_now ?? "",
              urgency:
                i.urgency === "hot" ||
                i.urgency === "rising" ||
                i.urgency === "seasonal" ||
                i.urgency === "evergreen"
                  ? i.urgency
                  : "rising",
              atc_signal:
                i.atc_signal === "hot" || i.atc_signal === "warm" || i.atc_signal === "cold"
                  ? i.atc_signal
                  : undefined,
              atc_reason: typeof i.atc_reason === "string" ? i.atc_reason.slice(0, 120) : undefined,
              tags: Array.isArray(i.tags) ? i.tags.slice(0, 4) : [],
              search_query: (i.search_query ?? "").slice(0, 60),
            }));
        }
      } catch (err) {
        console.warn("[factory/live-pulse] Gemini ideas failed:", err);
      }
    }

    // Fallback: derive from spiking terms
    if (ideas.length === 0) {
      ideas = spiking
        .filter((s) => !isTrademarked(s.term))
        .slice(0, 6)
        .map((s) => ({
          title: `${s.term} spreadsheet`,
          why_now: `Trending on ${s.sources.slice(0, 2).join(" + ")}`,
          urgency: s.score > 70 ? "hot" : s.score > 45 ? "rising" : "evergreen",
          tags: [s.term.toLowerCase().split(" ").slice(0, 3).join(" "), "google sheets template"],
          search_query: `${s.term} google sheets`,
        }));
    }

    /* ── Attach Etsy reference thumbnails ── */
    const searchQueries = ideas.map((idea) => {
      const q = (idea.search_query || idea.title || "").trim();
      return q;
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
    console.error("[factory/live-pulse] failed:", err);
    return NextResponse.json(
      {
        spiking: [],
        ideas: [],
        seasonal: [],
        error: err instanceof Error ? err.message : "live-pulse failed",
      },
      { status: 500 },
    );
  }
}
