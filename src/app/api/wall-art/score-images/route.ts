import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export const maxDuration = 120; // Allow up to 2 min for 8 images

function extractJSON(text: string): string | null {
  // Try parsing raw text first
  try { JSON.parse(text); return text; } catch { /* continue */ }
  // Try extracting from markdown code blocks
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try { JSON.parse(codeBlock[1].trim()); return codeBlock[1].trim(); } catch { /* continue */ }
  }
  // Try finding JSON object in text
  const jsonMatch = text.match(/\{[\s\S]*"scores"[\s\S]*\}/);
  if (jsonMatch) {
    try { JSON.parse(jsonMatch[0]); return jsonMatch[0]; } catch { /* continue */ }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { images } = await req.json(); // Array of { base64: string, index: number }
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "No Gemini API key configured" }, { status: 500 });
    if (!images || images.length < 2) return NextResponse.json({ error: "Need at least 2 images" }, { status: 400 });

    console.log(`[Score Images] Scoring ${images.length} images...`);

    // Build image parts for Gemini
    const imageParts = images.flatMap((img: { base64: string; index: number }, i: number) => [
      { text: `\nIMAGE ${i + 1}:\n` },
      { inlineData: { mimeType: "image/jpeg", data: img.base64 } },
    ]);

    const prompt = `You are an expert Etsy wall art seller and art curator. I'm showing you ${images.length} variations of AI-generated wall art. Score each image for selling on Etsy as a printable wall art download.

For EACH image, rate these criteria from 1-10:
- composition: Balance, focal point, visual flow, rule of thirds
- detail: Fine details, texture quality, brushwork clarity, no artifacts
- color_harmony: Color palette appeal, mood consistency, warmth/richness
- print_quality: How well it will look printed and framed (sharpness, contrast)
- market_appeal: How likely Etsy buyers will purchase this (aesthetics, trending style, emotional impact)

Then give an overall score (weighted average: market_appeal 30%, composition 25%, detail 20%, color_harmony 15%, print_quality 10%).

Pick the BEST image and explain WHY in 1-2 sentences.

Return ONLY valid JSON with NO extra text:
{
  "scores": [
    { "index": 0, "composition": 8, "detail": 7, "color_harmony": 9, "print_quality": 8, "market_appeal": 9, "overall": 8.5, "note": "brief note" }
  ],
  "best_index": 0,
  "best_reason": "Why this image is the best choice for Etsy"
}`;

    // Try gemini-2.5-flash with thinking disabled, then gemini-2.0-flash-lite
    const models = ["gemini-2.5-flash", "gemini-2.0-flash-lite"];
    let lastError = "";

    for (const model of models) {
      const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;
      console.log(`[Score Images] Trying ${model}...`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);

      try {
        const generationConfig: Record<string, unknown> = {
          temperature: 0.3,
          maxOutputTokens: 4096,
        };

        // Disable thinking for 2.5-flash to get clean JSON
        if (model.includes("2.5")) {
          generationConfig.thinkingConfig = { thinkingBudget: 0 };
        }

        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                ...imageParts,
              ],
            }],
            generationConfig,
          }),
        });

        clearTimeout(timeout);

        if (!resp.ok) {
          const errText = await resp.text();
          console.error(`[Score Images] ${model} error ${resp.status}:`, errText.substring(0, 500));
          lastError = `${model}: ${resp.status} - ${errText.substring(0, 200)}`;
          continue; // try next model
        }

        const data = await resp.json();

        // Check all parts for text (thinking mode puts response in different parts)
        const parts = data?.candidates?.[0]?.content?.parts || [];
        let text = "";
        for (const part of parts) {
          if (part.text && !part.thought) {
            text = part.text;
            break;
          }
        }
        // Fallback to first part with text
        if (!text) {
          for (const part of parts) {
            if (part.text) { text = part.text; break; }
          }
        }

        if (!text) {
          console.error(`[Score Images] ${model} returned empty response`);
          lastError = `${model}: empty response`;
          continue;
        }

        const jsonStr = extractJSON(text);
        if (jsonStr) {
          const result = JSON.parse(jsonStr);
          console.log(`[Score Images] Success with ${model}, best_index: ${result.best_index}`);
          return NextResponse.json(result);
        } else {
          console.error(`[Score Images] ${model} JSON extract failed:`, text.substring(0, 300));
          lastError = `${model}: invalid JSON`;
          continue;
        }
      } catch (err) {
        clearTimeout(timeout);
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[Score Images] ${model} fetch error:`, errMsg);
        lastError = `${model}: ${errMsg}`;
        continue;
      }
    }

    return NextResponse.json({ error: `All models failed. Last: ${lastError}` }, { status: 500 });
  } catch (err) {
    console.error("[Score Images] Request error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
