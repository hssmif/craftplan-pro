import { NextRequest, NextResponse } from "next/server";
import { callGeminiJSON, parseGeminiJSON } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });

  const { keyword, productType, keywords, designStyle } = await req.json();
  if (!keyword || !productType) return NextResponse.json({ error: "keyword and productType required" }, { status: 400 });

  const tagPool = keywords?.slice(0, 13).map((k: { keyword: string }) => k.keyword).join(", ") || keyword;

  const prompt = `Write an Etsy listing for a Print-On-Demand ${productType} in the "${keyword}" niche.
Design style: ${designStyle || "bold graphic"}
Available SEO keywords: ${tagPool}

Return JSON only:
{
  "title": "Etsy listing title, max 140 characters, keyword-rich, human-readable",
  "description": "Full Etsy listing description (300-500 words). Include: intro paragraph, product details, size/material info, care instructions, shipping note, gift suggestion. Use line breaks for readability.",
  "tags": ["tag1", "tag2", ... exactly 13 tags],
  "price": 24.99,
  "categories": ["Clothing", "Shirts & Tees"]
}

Rules:
- Title: Start with the primary keyword, include gift/occasion terms, under 140 chars
- Description: Professional, warm tone, mention print quality, Bella+Canvas 3001 (if t-shirt), gift-ready
- Tags: Exactly 13 tags, each max 20 characters, mix of broad and specific
- Price: Reasonable for Etsy POD (typically $22-35 for shirts, $16-25 for mugs)
- Optimize for Etsy search algorithm (relevancy + recency + quality score)`;

  try {
    const text = await callGeminiJSON(apiKey, prompt);
    const result = parseGeminiJSON(text);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
