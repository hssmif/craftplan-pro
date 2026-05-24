import { NextRequest, NextResponse } from "next/server";
import { callGeminiJSON, parseGeminiJSON } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });

  const { keyword, productType, styles } = await req.json();
  if (!keyword) return NextResponse.json({ error: "keyword required" }, { status: 400 });

  const styleList = styles?.length
    ? styles.join(", ")
    : "bold-graphic, minimalist, vintage";

  const prompt = `Create 3 different Flux/DALL-E image generation prompts for a Print-On-Demand design.

Niche: ${keyword}
Product: ${productType || "t-shirt"}
Styles to use: ${styleList}

Each prompt must produce a PRINT-READY design suitable for printing on products. The design should have:
- Transparent or solid background (NO complex photo backgrounds)
- Clear, bold visual elements that work at small sizes
- NO text, NO typography, NO words, NO letters — text is added separately
- High contrast colors

Return JSON only:
{
  "prompts": [
    {
      "style": "bold-graphic",
      "prompt": "A bold graphic design for a t-shirt featuring [detailed description]. The design uses [color palette] on a transparent background. NO text, NO words, NO letters. Style: flat vector art, print-ready, high contrast, centered composition, purely visual graphic.",
      "colorPalette": ["#hex1", "#hex2", "#hex3"]
    },
    {
      "style": "minimalist",
      "prompt": "...",
      "colorPalette": ["#hex1", "#hex2", "#hex3"]
    },
    {
      "style": "vintage",
      "prompt": "...",
      "colorPalette": ["#hex1", "#hex2", "#hex3"]
    }
  ]
}

Rules:
- Each prompt should be 40-80 words, highly detailed
- Include specific art style direction (vector, watercolor, line art, etc.)
- Always include "transparent background" or "solid [color] background"
- CRITICAL: Do NOT include any text, words, letters, or typography in the design
- Generate ONLY visual/graphic elements — text will be added separately via canvas overlay
- Do NOT include phrases like "Typography reads..." or "Text says..." in prompts
- Make prompts different enough to give real variety`;

  try {
    const text = await callGeminiJSON(apiKey, prompt);
    const result = parseGeminiJSON<{ prompts: unknown[] }>(text);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
