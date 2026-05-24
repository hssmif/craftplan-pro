import { NextRequest, NextResponse } from "next/server";
import { callGeminiJSON, parseGeminiJSON } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });

  const { keyword } = await req.json();
  if (!keyword) return NextResponse.json({ error: "keyword required" }, { status: 400 });

  const prompt = `Analyze the Etsy Print-On-Demand niche for: "${keyword}"

Return JSON only:
{
  "nicheScore": 0-100,
  "demandLevel": "low" | "medium" | "high" | "very-high",
  "competitionLevel": "low" | "medium" | "high" | "saturated",
  "bestProductTypes": ["tshirt", "mug", "poster", "hoodie", "tote"],
  "topSubNiches": ["sub-niche 1", "sub-niche 2", "sub-niche 3", "sub-niche 4", "sub-niche 5"],
  "buyerPersona": "Demographics and interests description",
  "seasonality": "evergreen" | "seasonal",
  "peakMonths": ["Month1", "Month2"],
  "avgPriceRange": { "min": 18, "max": 35 },
  "topSellerEstimate": "1k-5k sales/month"
}

Rules:
- bestProductTypes: pick 3-5 from [tshirt, hoodie, mug, poster, tote, phone-case, sticker, pillow]
- topSubNiches: 5 specific sub-niches with high demand and lower competition
- nicheScore: overall opportunity score considering demand vs competition
- Be realistic about competition levels and price ranges for Etsy POD`;

  try {
    const text = await callGeminiJSON(apiKey, prompt);
    const result = parseGeminiJSON(text);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
