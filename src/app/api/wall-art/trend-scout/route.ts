import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/* ── Google Trends: fetch today's trending searches (free RSS → JSON) ── */
async function fetchGoogleTrends(): Promise<string[]> {
  const trends: string[] = [];

  try {
    // Google Trends daily trending searches RSS (free, no key needed)
    const rssUrl = "https://trends.google.com/trending/rss?geo=US";
    const resp = await fetch(rssUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CraftPlan/1.0)" },
      signal: AbortSignal.timeout(10000),
    });

    if (resp.ok) {
      const xml = await resp.text();
      // Parse <title> tags from RSS items (skip the first which is the channel title)
      const titleMatches = xml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g) || [];
      for (const match of titleMatches) {
        const text = match.replace(/<title><!\[CDATA\[/, "").replace(/\]\]><\/title>/, "").trim();
        if (text && text !== "Trending Searches Daily" && text !== "Daily Search Trends") {
          trends.push(text);
        }
      }
    }
  } catch {
    /* RSS fetch failed — will use fallback */
  }

  // Fallback: also try the daily trends endpoint
  if (trends.length < 5) {
    try {
      const dailyUrl = "https://trends.google.com/trends/trendingsearches/daily/rss?geo=US";
      const resp2 = await fetch(dailyUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; CraftPlan/1.0)" },
        signal: AbortSignal.timeout(10000),
      });
      if (resp2.ok) {
        const xml2 = await resp2.text();
        const matches2 = xml2.match(/<title>(.*?)<\/title>/g) || [];
        for (const m of matches2) {
          const t = m.replace(/<\/?title>/g, "").trim();
          if (t && !t.includes("Trend") && !t.includes("Search") && !trends.includes(t)) {
            trends.push(t);
          }
        }
      }
    } catch {
      /* fallback also failed */
    }
  }

  return trends.slice(0, 25);
}

/* ── Gemini: turn trends into wall art ideas with MJ prompts ── */
async function analyzeWithGemini(
  trends: string[],
  apiKey: string
): Promise<{
  ideas: {
    trend: string;
    art_concept: string;
    why_now: string;
    etsy_competition: string;
    mj_prompt: string;
    tags: string[];
    urgency: string;
  }[];
}> {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const trendsList = trends.length > 0
    ? `TODAY'S GOOGLE TRENDING SEARCHES (${today}):\n${trends.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
    : `No trends available. Use your knowledge of current date (${today}) to suggest timely ideas.`;

  const prompt = `You are an expert Etsy wall art seller and trend analyst. Your job is to find UNIQUE wall art opportunities that NO ONE else is selling yet.

${trendsList}

ALSO consider:
- Current season and upcoming holidays/events
- Interior design trends gaining momentum
- Social media aesthetic trends (TikTok, Pinterest, Instagram)
- Color of the year, seasonal palettes
- Cultural moments, movie/TV releases, viral moments
- Nature events (cherry blossoms, aurora season, etc.)

For EACH opportunity, create a wall art concept that:
1. Is inspired by the trend but is ORIGINAL ART (not fan art or copyrighted)
2. Would appeal to home decor buyers
3. Has LOW competition on Etsy (be specific — check if this exact style exists)
4. Comes with a ready-to-use Midjourney prompt

Return 6-8 of the BEST ideas as JSON:
{
  "ideas": [
    {
      "trend": "The trend or inspiration source",
      "art_concept": "2-3 sentence description of the wall art piece",
      "why_now": "Why this is timely and will sell NOW",
      "etsy_competition": "low" | "medium" | "none",
      "mj_prompt": "Full Midjourney v8 prompt ready to paste. Include style, mood, colors, technique. End with --ar 2:3 --v 8 --style raw --q 2",
      "tags": ["5 Etsy tags for this listing"],
      "urgency": "hot" | "rising" | "seasonal" | "evergreen"
    }
  ]
}

IMPORTANT RULES:
- Every mj_prompt MUST end with --ar 2:3 --v 8 --style raw --q 2
- Focus on concepts that are ORIGINAL — no copyrighted characters, logos, or direct fan art
- Prefer concepts that translate well to printable wall art (not just any trending topic)
- Be specific in prompts — include art style, color palette, composition details
- Sort by potential: best opportunities first`;

  const models = ["gemini-2.5-flash", "gemini-2.0-flash-lite"];
  let lastError = "";

  for (const model of models) {
    try {
      const resp = await fetch(`${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: AbortSignal.timeout(45000),
      });

      if (!resp.ok) {
        lastError = `${model}: ${resp.status}`;
        continue;
      }

      const data = await resp.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      let text = "";
      for (const part of parts) {
        if (part.text && !part.thought) { text = part.text; break; }
      }
      if (!text) for (const part of parts) { if (part.text) { text = part.text; break; } }
      if (!text) { lastError = `${model}: empty response`; continue; }

      return JSON.parse(text);
    } catch (err) {
      lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`;
      continue;
    }
  }

  throw new Error(`All models failed: ${lastError}`);
}

/* ── Main handler ── */
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "No Gemini API key configured" }, { status: 500 });
    }

    // Optional body for context
    let context: { category?: string } = {};
    try { context = await req.json(); } catch { /* no body is fine */ }

    // Step 1: Fetch Google Trends
    const trends = await fetchGoogleTrends();

    // Step 2: Analyze with Gemini
    const result = await analyzeWithGemini(trends, apiKey);

    return NextResponse.json({
      trends_found: trends.length,
      trending_searches: trends.slice(0, 10),
      ...result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Trend scout failed";
    console.error("Trend Scout error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
