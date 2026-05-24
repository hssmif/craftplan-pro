import { NextRequest, NextResponse } from "next/server";
import { callGeminiJSON, parseGeminiJSON } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });

  const { keyword, subNiches, productTypes } = await req.json();
  if (!keyword) return NextResponse.json({ error: "keyword required" }, { status: 400 });

  const prompt = `Generate 20 Etsy SEO keywords for Print-On-Demand products in the "${keyword}" niche.
${subNiches?.length ? `Sub-niches to consider: ${subNiches.join(", ")}` : ""}
${productTypes?.length ? `Product types: ${productTypes.join(", ")}` : ""}

Include:
- Long-tail product keywords (e.g., "funny cat mom shirt for women")
- Gift occasion variants (e.g., "cat mom birthday gift", "cat lover christmas")
- Product-specific terms (e.g., "cat mom mug", "cat dad hoodie")
- Trending phrases and seasonal terms

Return JSON only:
{
  "keywords": [
    { "keyword": "funny cat mom shirt", "searchVolume": "high", "competition": "medium", "type": "product" },
    { "keyword": "cat lover gift for her", "searchVolume": "high", "competition": "low", "type": "gift" },
    ...20 total
  ]
}

Rules:
- searchVolume: "very-high" | "high" | "medium" | "low"
- competition: "low" | "medium" | "high"
- type: "product" | "gift" | "seasonal" | "long-tail" | "trending"
- Each keyword should be 3-8 words long
- Focus on keywords that convert to sales, not just traffic`;

  try {
    const text = await callGeminiJSON(apiKey, prompt);
    const result = parseGeminiJSON<{ keywords: unknown[] }>(text);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
