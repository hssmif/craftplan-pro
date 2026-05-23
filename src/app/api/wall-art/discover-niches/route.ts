import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export async function POST(req: NextRequest) {
  try {
    const { existing, scannedNiche } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "No Gemini API key" }, { status: 500 });

    const contextLine = scannedNiche
      ? `The user just scanned "${scannedNiche}" on Etsy. Suggest niches RELATED to this plus completely new opportunities.`
      : `Suggest the most profitable and trending wall art niches on Etsy right now.`;

    const prompt = `You are an Etsy wall art market research expert. ${contextLine}

ALREADY KNOWN niches (do NOT repeat these): ${(existing || []).join(", ")}

Find 8 NEW profitable wall art niches for digital download printables on Etsy. Focus on:
- Niches with high demand but medium/low competition
- Trending aesthetics and styles gaining momentum
- Seasonal or evergreen opportunities
- Specific sub-niches that are underserved

For each niche return:
- name: Short catchy name (2-4 words)
- keywords: Array of 3-5 Etsy search keywords for this niche
- estimated_revenue: Rough monthly revenue estimate like "~$3K/mo"
- competition: "low" | "medium" | "high"
- why: One sentence explaining why this niche is profitable right now

Return ONLY valid JSON:
{
  "niches": [
    { "name": "Example Niche", "keywords": ["keyword1", "keyword2", "keyword3"], "estimated_revenue": "~$5K/mo", "competition": "medium", "why": "Reason it's profitable" }
  ]
}`;

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
              temperature: 0.7,
              maxOutputTokens: 4096,
              responseMimeType: "application/json",
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
        });

        if (!resp.ok) {
          lastError = `${model}: ${resp.status}`;
          continue;
        }

        const data = await resp.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        let text = "";
        for (const part of parts) { if (part.text && !part.thought) { text = part.text; break; } }
        if (!text) for (const part of parts) { if (part.text) { text = part.text; break; } }
        if (!text) { lastError = `${model}: empty`; continue; }

        const result = JSON.parse(text);
        return NextResponse.json(result);
      } catch (err) {
        lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`;
        continue;
      }
    }

    return NextResponse.json({ error: `All models failed: ${lastError}` }, { status: 500 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
