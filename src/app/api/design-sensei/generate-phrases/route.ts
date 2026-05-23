// ── Design Sensei: Batch Text Phrase Generator ──
// Generates 30-100 unique text phrases/slogans for a niche keyword.
// These are rendered client-side as print-ready designs using canvas + fonts.
// Accepts niche intelligence signals (buyerPersona, demandLevel, etc.) to produce
// commercially-targeted phrases instead of generic ones.

import { NextRequest, NextResponse } from "next/server";
import { callGeminiJSON, parseGeminiJSON } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });

  const {
    keyword,
    count = 30,
    subNiches,
    referenceText,
    styleMood,
    // Niche intelligence signals (from NicheAnalysis)
    buyerPersona,
    demandLevel,
    competitionLevel,
    bestProductTypes,
    seasonality,
    avgPriceRange,
  } = await req.json();

  if (!keyword) return NextResponse.json({ error: "keyword required" }, { status: 400 });

  // ── Build contextual prompt hints from niche intelligence ──

  const subNicheHint = subNiches?.length
    ? `\nSub-niches to explore: ${subNiches.join(", ")}`
    : "";

  // If we have extracted text from a reference design, generate variations inspired by it
  const referenceHint = referenceText
    ? `\nIMPORTANT: The user found a successful POD design with this text: "${referenceText}"
Generate ${count} ORIGINAL phrases inspired by the same style, tone, and vibe.
DO NOT copy the exact text — create unique variations with similar structure, humor, and audience appeal.
The text "${referenceText}" is what sells — make variations that capture the same energy.`
    : "";

  const moodHint = styleMood
    ? `\nThe overall mood/tone should lean toward: ${styleMood}`
    : "";

  const personaHint = buyerPersona
    ? `\nTarget buyer persona: ${buyerPersona}. Tailor phrases to resonate with this specific demographic.`
    : "";

  const marketHint = demandLevel || competitionLevel
    ? `\nMarket context: Demand is ${demandLevel || "unknown"}, competition is ${competitionLevel || "unknown"}. ${
        competitionLevel === "saturated" || competitionLevel === "high"
          ? "Focus on UNIQUE angles, unexpected humor, and under-served sub-niches to stand out from the crowd."
          : "Broad appeal phrases work well in this lower-competition niche — lean into the most popular themes."
      }`
    : "";

  const productHint = bestProductTypes?.length
    ? `\nBest-selling product types for this niche: ${bestProductTypes.join(", ")}. Consider phrases that work especially well printed on these products.`
    : "";

  const seasonHint = seasonality
    ? `\nSeasonality: ${seasonality}. ${
        seasonality === "seasonal"
          ? "Include some seasonal/holiday-themed variations alongside evergreen phrases."
          : "Focus on timeless, evergreen phrases that sell year-round."
      }`
    : "";

  const priceHint = avgPriceRange
    ? `\nEtsy price range: $${avgPriceRange.min}-$${avgPriceRange.max}. ${
        avgPriceRange.max > 30
          ? "This is a premium niche — use elevated, aspirational, or sophisticated language."
          : avgPriceRange.max < 18
            ? "This is a value/impulse-buy niche — keep phrases fun, simple, and instantly relatable."
            : "Mid-range pricing — balance between witty and polished."
      }`
    : "";

  const prompt = `You are an expert POD (Print on Demand) design copywriter. Generate ${count} unique, catchy text phrases/slogans for the "${keyword}" niche.

These phrases will be printed on t-shirts, mugs, tote bags, and posters.${subNicheHint}${referenceHint}${moodHint}${personaHint}${marketHint}${productHint}${seasonHint}${priceHint}

Requirements:
- Mix of: funny quotes, motivational, sarcastic, wholesome, bold statements, puns
- 2-8 words each (short enough for a t-shirt)
- Highly specific to the "${keyword}" niche — not generic
- Cover different buyer personas (gift buyers, self-buyers, humor lovers, proud owners)
- Include trending POD text styles: "I'd rather be [doing X]", "This is my [X] shirt", "[noun] mom/dad", "Powered by [X]", etc.
- NO copyrighted phrases, song lyrics, or trademarked slogans
- Each phrase should work standalone as a design

Return JSON only:
{
  "phrases": [
    {
      "text": "The actual phrase text",
      "mood": "funny|motivational|sarcastic|wholesome|bold|pun",
      "audience": "self-buyer|gift|humor|proud-owner",
      "subNiche": "specific sub-niche this targets"
    }
  ]
}

Generate exactly ${count} phrases. Be creative and niche-specific.`;

  try {
    const text = await callGeminiJSON(apiKey, prompt);
    const result = parseGeminiJSON<{ phrases: Array<{ text: string; mood: string; audience: string; subNiche: string }> }>(text);

    // Validate and clean
    const phrases = (result.phrases || [])
      .filter((p) => p.text && p.text.length >= 3 && p.text.length <= 80)
      .map((p, i) => ({
        id: i,
        text: p.text.trim(),
        mood: p.mood || "bold",
        audience: p.audience || "self-buyer",
        subNiche: p.subNiche || keyword,
      }));

    return NextResponse.json({ phrases, count: phrases.length });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
