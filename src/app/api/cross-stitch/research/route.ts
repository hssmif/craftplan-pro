import { NextRequest, NextResponse } from "next/server";
import { searchEtsyListings, analyzeNiche, estimateSales } from "@/lib/etsy-research";
import { callGeminiJSON, parseGeminiJSON } from "@/lib/gemini";
import { fetchAllTrendSources, TrendSource } from "@/lib/trend-sources";
import { checkIdeaForIP, IP_GUARDRAIL_PROMPT } from "@/lib/trademark-filter";
import { creativeBoost } from "@/lib/creative-boost";

// Canonical flat-cartoon style tail appended to every emerging_trends
// mj_prompt after server-side sanitization.  Gemini frequently writes
// watercolor / painterly / "soft children's-book" language despite the
// prompt asking for flat cartoon, and those source images quantize into
// confetti-stitch noise downstream.  Rebuilding the prompt as
// `${subject}, ${FLAT_CARTOON_SUFFIX}` guarantees a consistent
// stitch-friendly style regardless of what Gemini actually wrote.
const FLAT_CARTOON_SUFFIX =
  "flat cartoon kawaii sticker illustration, solid color fills with NO gradients and NO shading, clean medium-weight outlines, soft pastel colors, rounded simple shapes, single centered subject, pure white background, no room scene, no frame, no mockup. NOT photorealistic, NOT watercolor, NOT painterly, NOT 3D render.";

export const maxDuration = 60;

/* ── POST /api/cross-stitch/research ── */
export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    const searchTerm = query || "cross stitch pattern";

    // Append "cross stitch" context for Etsy search
    const etsyQuery = searchTerm.toLowerCase().includes("cross stitch")
      ? `${searchTerm} digital download`
      : `${searchTerm} cross stitch pattern digital download`;

    // ── Fetch Etsy data AND all trend sources in parallel ──
    const [etsyData, trendSources] = await Promise.all([
      searchEtsyListings(etsyQuery, "score", 40),
      fetchAllTrendSources(searchTerm).catch(() => [] as TrendSource[]),
    ]);

    const { total, listings } = etsyData;

    const analysis = analyzeNiche(
      listings.map((l) => ({
        price: l.price,
        favorites: l.favorites,
        views: l.views,
        listing_age_days: l.listing_age_days,
      })),
      total
    );

    // Collect all Etsy tags for Etsy trending tags source
    const allEtsyTags: string[] = [];
    for (const l of listings.slice(0, 24)) {
      try {
        const tags: string[] = JSON.parse(l.tags);
        allEtsyTags.push(...tags);
      } catch { /* skip */ }
    }

    // Add Etsy trending tags to trend sources
    if (allEtsyTags.length > 0) {
      const tagCounts = new Map<string, number>();
      for (const t of allEtsyTags) {
        const clean = t.toLowerCase().trim();
        if (clean.length > 2) tagCounts.set(clean, (tagCounts.get(clean) || 0) + 1);
      }
      trendSources.push({
        source: "Etsy Trending Tags",
        icon: "🏷️",
        items: [...tagCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 25)
          .map(([term, count]) => ({ term, score: count, context: `Used in ${count} top listings` })),
        fetched: true,
      });
    }

    // Format results for the frontend.
    //
    // We still fetch 40 for analyzeNiche() accuracy, but display only
    // the top 10 by favorites (Etsy's best proxy for "this is selling
    // well right now"). Includes the richer competitor-intel fields
    // (favorites, views, listing_age_days, shop_name) so the UI can
    // render a niche-intelligence report instead of a plain image grid.
    const enrichedListings = [...listings]
      .sort((a, b) => (b.favorites || 0) - (a.favorites || 0))
      .slice(0, 10);
    const results = enrichedListings.map((l) => ({
      title: l.title,
      price: `$${l.price.toFixed(2)}`,
      sales: String(estimateSales(l.favorites, l.listing_age_days)),
      image_url: l.image_url,
      url: l.url,
      tags: (() => {
        try { return JSON.parse(l.tags); } catch { return []; }
      })(),
      favorites: l.favorites,
      views: l.views,
      listing_age_days: l.listing_age_days,
      shop_name: l.shop_name || "",
    }));

    // Build tag frequency across the displayed top 10. This is what
    // powers the "Tag Intelligence" panel — sellers can see at a glance
    // which tags top sellers actually use, and copy the top 13
    // (Etsy's tag cap) straight into their listing.
    const tagCounts = new Map<string, number>();
    for (const r of results) {
      for (const t of r.tags as string[]) {
        const clean = String(t).trim().toLowerCase();
        if (clean.length > 1) tagCounts.set(clean, (tagCounts.get(clean) || 0) + 1);
      }
    }
    const tag_frequency = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([tag, count]) => ({ tag, count }));

    // ── Generate MULTI-SOURCE AI trend insights using Gemini ──
    let insights = "";
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (apiKey && listings.length > 0) {
      try {
        const topListings = listings.slice(0, 10);
        const topTags = new Map<string, number>();
        for (const l of topListings) {
          const tags: string[] = (() => {
            try { return JSON.parse(l.tags); } catch { return []; }
          })();
          for (const t of tags) {
            topTags.set(t, (topTags.get(t) || 0) + 1);
          }
        }
        const popularTags = [...topTags.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15)
          .map(([t]) => t);

        // Build multi-source context for Gemini
        const trendBlocks: string[] = [];
        for (const source of trendSources) {
          if (source.items.length > 0) {
            const itemsList = source.items
              .slice(0, 12)
              .map((item) => {
                let line = `  - ${item.term}`;
                if (item.context) line += ` (${item.context})`;
                if (item.score) line += ` [score: ${item.score}]`;
                return line;
              })
              .join("\n");
            trendBlocks.push(`${source.icon} ${source.source} (${source.items.length} items):\n${itemsList}`);
          }
        }

        const trendContext = trendBlocks.length > 0
          ? `\n\n═══ MULTI-SOURCE TREND DATA ═══\n${trendBlocks.join("\n\n")}`
          : "";

        const today = new Date().toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });

        const prompt = `You are an expert Etsy cross-stitch pattern market analyst with access to REAL-TIME multi-source trend data. Today is ${today}.

Your job: Analyze ALL data sources below to find EARLY TREND OPPORTUNITIES — patterns sellers should create BEFORE the competition catches on.

${IP_GUARDRAIL_PROMPT}

${creativeBoost()}

═══ ETSY MARKET DATA ═══
SEARCH: "${searchTerm}"
TOTAL RESULTS: ${total}
AVG PRICE: $${analysis.avg_price}
COMPETITION: ${analysis.competition_level}
DEMAND SCORE: ${analysis.demand_score}/100
AVG FAVORITES: ${analysis.avg_favorites}

TOP LISTING TITLES:
${topListings.map((l, i) => `${i + 1}. "${l.title}" — $${l.price.toFixed(2)}, ${l.favorites} favs`).join("\n")}

POPULAR ETSY TAGS: ${popularTags.join(", ")}
${trendContext}

Return JSON:
{
  "insights": "3-4 paragraphs covering: 1) What's selling best RIGHT NOW on Etsy based on the top listings above — identify the 2-3 dominant subject categories and what makes the top listings stand out (price, visual style, title keywords), 2) Price sweet spot and competition analysis, 3) EARLY TREND ALERTS: Cross-reference Google Trends, Pinterest, Reddit, and social media to identify cross-stitch opportunities BEFORE they go mainstream. Be specific — name exact design concepts, themes, or aesthetics that are emerging, 4) Seasonal opportunities based on upcoming events/holidays. Be actionable, specific, data-driven. Reference which data sources informed each insight. Keep under 400 words.",
  "emerging_trends": [
    {
      "title": "Short name of the design concept",
      "description": "1-2 sentences explaining what to create and why it's trending up",
      "mj_prompt": "Short flat-cartoon description: '[subject + one accessory or prop], flat cartoon kawaii sticker illustration, solid color fills with NO gradients and NO shading, clean medium-weight outlines, soft pastel colors, rounded simple shapes, single centered subject, pure white background, no room scene, no frame, no mockup. NOT photorealistic, NOT watercolor, NOT painterly, NOT 3D render.' Keep the subject description under 20 words for cleanest output. Good example: 'Chubby duck wearing pink rain boots, flat cartoon kawaii sticker illustration, solid color fills with NO gradients and NO shading, clean medium-weight outlines, soft pastel colors, rounded simple shapes, single centered subject, pure white background. NOT photorealistic, NOT watercolor, NOT painterly, NOT 3D render.'",
      "etsy_tags": ["5 relevant Etsy tags"],
      "urgency": "hot | rising | seasonal | evergreen",
      "source": "Which data source(s) informed this idea"
    }
  ],
  "opportunity_score": 0-100,
  "best_time_to_list": "When to list for maximum visibility (based on seasonal data)"
}

IMPORTANT RULES for emerging_trends:
- Generate 6-8 concrete product concepts, not vague categories
- Each mj_prompt is consumed by GPT-Image-2 (natural-language, NOT Midjourney). Do NOT add --ar, --v, --style, --s, or any CLI flags.
- Each mj_prompt MUST be a FLAT CARTOON KAWAII illustration — solid color fills, NO watercolor gradients, NO painterly shading, NO soft children's-book texture. Watercolor/gradient images produce confetti-stitch noise when quantized. Flat solid colors map cleanly to 12-24 DMC threads.
- Format: "[subject + one accessory], flat cartoon kawaii sticker illustration, solid color fills with NO gradients and NO shading, clean medium-weight outlines, soft pastel colors, rounded simple shapes, single centered subject, pure white background, no room scene, no frame, no mockup. NOT photorealistic, NOT watercolor, NOT painterly, NOT 3D render."
- Keep the subject portion SHORT (under 20 words) — long descriptions produce muddier output.
- AVOID: photorealistic photos, 3D renders, watercolor gradients, painterly shading, soft illustration, airbrushed cheeks, dimensional shading, tonal blending
- Focus on designs trending on Pinterest/Reddit/TikTok but NOT yet saturated on Etsy`;

        // High-temp + rotating creative angle so consecutive scans of
        // the same query don't surface the identical list of ideas.
        const raw = await callGeminiJSON(apiKey, prompt, { temperature: 0.95 });
        const parsed = parseGeminiJSON<{
          insights: string;
          emerging_trends?: { title: string; description: string; mj_prompt: string; etsy_tags: string[]; urgency: string; source: string }[];
          opportunity_score?: number;
          best_time_to_list?: string;
        }>(raw);
        insights = parsed.insights || "";

        // IP gate on emerging_trends: even with the guardrail in the
        // prompt, Gemini sometimes returns pokemon/disney/etc.
        // because a trend source mentioned it. Belt-and-suspenders
        // filter catches those before they reach the UI.
        const safeEmergingTrends = (parsed.emerging_trends || []).filter((t) => {
          const hit = checkIdeaForIP({
            title: t.title,
            tags: t.etsy_tags,
            image_prompt: t.mj_prompt,
          });
          if (hit) {
            console.warn(`[research] dropping IP-tainted emerging trend "${t.title}" (matched: ${hit})`);
            return false;
          }
          return true;
        });

        // Sanitize mj_prompt: Gemini frequently ignores flat-cartoon instructions
        // and writes watercolor/gradient-style language. Strip the known bad phrases
        // and rebuild the prompt as: [subject portion] + FLAT_CARTOON_SUFFIX.
        // The subject portion is everything before the first style keyword cluster.
        const STYLE_KEYWORDS = /,?\s*(flat cartoon|kawaii|sticker illustration|watercolor|gradient|dimensional shading|painterly|warm-tone contour|subtle gradient|soft pastel wash|gentle shading|fine.*contour|illustrat)/i;
        const cleanedEmergingTrends = safeEmergingTrends.map((t) => {
          const raw = t.mj_prompt ?? "";
          // Extract subject: everything before the first style keyword
          const match = STYLE_KEYWORDS.exec(raw);
          const subject = (match ? raw.slice(0, match.index) : raw)
            .replace(/\.\s*$/, "")  // strip trailing period
            .trim();
          const cleanPrompt = subject
            ? `${subject}, ${FLAT_CARTOON_SUFFIX}`
            : `${t.title}, ${FLAT_CARTOON_SUFFIX}`;
          return { ...t, mj_prompt: cleanPrompt };
        });

        // Build enriched response
        return NextResponse.json({
          results,
          insights,
          analysis,
          tag_frequency,
          total_results: total,
          trend_sources: trendSources.map((s) => ({
            source: s.source,
            icon: s.icon,
            count: s.items.length,
            fetched: s.fetched,
            top_items: s.items.slice(0, 8).map((i) => ({
              term: i.term,
              context: i.context,
              score: i.score,
            })),
          })),
          emerging_trends: cleanedEmergingTrends,
          opportunity_score: parsed.opportunity_score || 0,
          best_time_to_list: parsed.best_time_to_list || "",
        });
      } catch (err) {
        console.log("[Cross-stitch research] Gemini insights failed:", err);
        insights = `Found ${total.toLocaleString()} results for "${searchTerm}". Average price: $${analysis.avg_price}. Competition level: ${analysis.competition_level}. Demand score: ${analysis.demand_score}/100. Top listings average ${analysis.avg_favorites} favorites.`;
      }
    } else if (listings.length > 0) {
      insights = `Found ${total.toLocaleString()} results for "${searchTerm}". Average price: $${analysis.avg_price}. Competition level: ${analysis.competition_level}. Demand score: ${analysis.demand_score}/100.`;
    }

    return NextResponse.json({
      results,
      insights,
      analysis,
      tag_frequency,
      total_results: total,
      trend_sources: trendSources.map((s) => ({
        source: s.source,
        icon: s.icon,
        count: s.items.length,
        fetched: s.fetched,
        top_items: s.items.slice(0, 8).map((i) => ({
          term: i.term,
          context: i.context,
          score: i.score,
        })),
      })),
      emerging_trends: [],
      opportunity_score: 0,
      best_time_to_list: "",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Research failed";

    if (msg.includes("ETSY_CLIENT_ID")) {
      return NextResponse.json(
        { error: "Etsy API not configured. Add ETSY_CLIENT_ID to .env.local", results: [], insights: "" },
        { status: 500 }
      );
    }

    console.error("Cross-stitch research error:", msg);
    return NextResponse.json({ error: msg, results: [], insights: "" }, { status: 500 });
  }
}
