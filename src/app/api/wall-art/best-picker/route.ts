import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { callGeminiVision, parseGeminiJSON } from "@/lib/gemini";

// POST — AI picks the best mockup template (with or without art)
// Accepts: { artBase64?, templates: [{ id, name, base64 }], niche?, artDescription? }
// Returns: { rankings: [{ templateId, score, reason, badge }] }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { artBase64, templates, niche, artDescription } = body;

    if (!templates || templates.length === 0) {
      return NextResponse.json(
        { error: "At least one template required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Fallback: quality-based scoring without AI
      const fallback = artBase64
        ? await colorBasedRanking(artBase64, templates)
        : qualityRanking(templates);
      return NextResponse.json({ rankings: fallback, method: "fallback" });
    }

    // Resize all templates for fast Gemini processing
    const resizedTemplates = await Promise.all(
      templates.map(async (t: { id: string; name: string; base64: string }) => ({
        ...t,
        base64: await resizeForVision(t.base64),
      }))
    );

    // Build image array
    const images: { base64: string; mimeType: string }[] = [];
    let imageLayout = "";

    if (artBase64) {
      // With art: art first, then templates
      const resizedArt = await resizeForVision(artBase64);
      images.push({ base64: resizedArt, mimeType: "image/jpeg" });
      imageLayout = `  Image 1: The artwork to be displayed\n`;
      imageLayout += resizedTemplates
        .map((t: { id: string; name: string }, i: number) => `  Image ${i + 2}: Template "${t.name}" (id: "${t.id}")`)
        .join("\n");
    } else {
      // No art: just templates
      imageLayout = resizedTemplates
        .map((t: { id: string; name: string }, i: number) => `  Image ${i + 1}: Template "${t.name}" (id: "${t.id}")`)
        .join("\n");
    }

    // Add all template images
    for (const t of resizedTemplates) {
      images.push({ base64: t.base64, mimeType: "image/jpeg" });
    }

    const hasArt = !!artBase64;

    const prompt = hasArt
      ? `You are an expert interior designer and mockup specialist for Etsy digital wall art.

TASK: Analyze the artwork (Image 1) and rank which mockup template scene is the BEST match for displaying this art.

IMAGE LAYOUT:
${imageLayout}

ART CONTEXT:
- Niche: ${niche || "wall art"}
${artDescription ? `- Description: ${artDescription}` : ""}

EVALUATION CRITERIA (score 0-100):
1. STYLE HARMONY (30%): Does the room scene style complement the art? (e.g., rustic art → cozy room, modern art → minimalist room)
2. COLOR HARMONY (25%): Do the room colors complement the art palette? Avoid clashing tones.
3. FRAME FIT (20%): Does the frame style suit the art? (embroidery → hoop/rustic, abstract → thin modern, vintage → ornate)
4. MOOD MATCH (15%): Does the scene mood match the art mood? (warm → warm, moody → moody)
5. BUYER APPEAL (10%): Would this combo look good in an Etsy listing and drive sales?

For each template, give a score and a SHORT reason (under 15 words).
Also pick ONE "best badge" for the top pick from: "Perfect Match", "Best Seller Look", "Color Harmony", "Style Match", "Premium Feel"

Return JSON:
{
  "rankings": [
    { "templateId": "...", "score": 85, "reason": "...", "badge": "..." }
  ]
}

Sort by score descending. Include ALL templates.`
      : `You are an expert product photographer and Etsy mockup specialist.

TASK: Rank these mockup template images by QUALITY for selling digital wall art (${niche || "cross-stitch / embroidery"}) on Etsy. Which template would make the best product listing photo?

IMAGE LAYOUT:
${imageLayout}

NICHE: ${niche || "cross-stitch / embroidery hoop art"}

EVALUATION CRITERIA (score 0-100):
1. PHOTO QUALITY (25%): Lighting, sharpness, professional feel
2. FRAME CLARITY (25%): Is the frame/hoop area clearly visible with clean empty space for art?
3. SCENE STYLING (20%): Props, background, overall aesthetic appeal
4. BUYER APPEAL (20%): Would this mockup make a buyer click on the Etsy listing?
5. BRAND CONSISTENCY (10%): Does it look cohesive and premium?

For each template, give a score and a SHORT reason (under 15 words).
Also pick ONE "best badge" for the top pick from: "Best Quality", "Most Professional", "Best Seller Look", "Premium Feel", "Clean & Clear"

Return JSON:
{
  "rankings": [
    { "templateId": "...", "score": 85, "reason": "...", "badge": "..." }
  ]
}

Sort by score descending. Include ALL templates.`;

    const raw = await callGeminiVision(apiKey, prompt, images);
    const result = parseGeminiJSON<{ rankings: { templateId: string; score: number; reason: string; badge?: string }[] }>(raw);

    if (!result.rankings || !Array.isArray(result.rankings)) {
      const arr = parseGeminiJSON<{ templateId: string; score: number; reason: string; badge?: string }[]>(raw);
      if (Array.isArray(arr)) {
        return NextResponse.json({ rankings: arr, method: "ai-vision" });
      }
      throw new Error("Invalid response format");
    }

    return NextResponse.json({ rankings: result.rankings, method: "ai-vision" });
  } catch (err) {
    console.error("[best-picker] Error:", err);

    // If AI fails, try fallback
    try {
      const { artBase64, templates } = await req.clone().json();
      const fallback = artBase64
        ? await colorBasedRanking(artBase64, templates)
        : qualityRanking(templates);
      return NextResponse.json({ rankings: fallback, method: "fallback" });
    } catch {
      return NextResponse.json(
        { error: (err as Error).message || "Best picker failed" },
        { status: 500 }
      );
    }
  }
}

// Resize image to 400px max for Gemini vision
async function resizeForVision(base64: string): Promise<string> {
  const buffer = Buffer.from(base64, "base64");
  const resized = await sharp(buffer)
    .resize(400, 400, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer();
  return resized.toString("base64");
}

// Fallback when no art: rank by image quality heuristics
function qualityRanking(
  templates: { id: string; name: string; base64: string }[]
): { templateId: string; score: number; reason: string; badge?: string }[] {
  // Without AI, give equal scores with slight random variation
  const scored = templates.map((t, i) => ({
    templateId: t.id,
    score: Math.max(50, 85 - i * 3 + Math.round(Math.random() * 10)),
    reason: "Upload art for AI-powered matching",
    badge: undefined as string | undefined,
  }));
  scored.sort((a, b) => b.score - a.score);
  if (scored.length > 0) scored[0].badge = "Top Pick";
  return scored;
}

// Fallback with art: rank by color similarity
async function colorBasedRanking(
  artBase64: string,
  templates: { id: string; name: string; base64: string }[]
): Promise<{ templateId: string; score: number; reason: string; badge?: string }[]> {
  const artBuffer = Buffer.from(artBase64, "base64");
  const artStats = await sharp(artBuffer).resize(100, 100, { fit: "cover" }).stats();
  const artR = artStats.channels[0].mean;
  const artG = artStats.channels[1].mean;
  const artB = artStats.channels[2].mean;
  const artBrightness = (artR + artG + artB) / 3;

  const scored = await Promise.all(
    templates.map(async (t) => {
      const tBuffer = Buffer.from(t.base64, "base64");
      const tStats = await sharp(tBuffer).resize(100, 100, { fit: "cover" }).stats();
      const tR = tStats.channels[0].mean;
      const tG = tStats.channels[1].mean;
      const tB = tStats.channels[2].mean;
      const tBrightness = (tR + tG + tB) / 3;

      const colorDist = Math.sqrt((artR - tR) ** 2 + (artG - tG) ** 2 + (artB - tB) ** 2);
      const brightDiff = Math.abs(artBrightness - tBrightness);
      const contrastBonus = brightDiff > 20 && brightDiff < 80 ? 10 : 0;

      const maxDist = 441;
      const score = Math.round(Math.max(0, Math.min(100, (1 - colorDist / maxDist) * 80 + contrastBonus + 10)));

      return {
        templateId: t.id,
        score,
        reason: `Color palette ${colorDist < 80 ? "complements" : "contrasts with"} your art`,
        badge: undefined as string | undefined,
      };
    })
  );

  scored.sort((a, b) => b.score - a.score);
  if (scored.length > 0) scored[0].badge = "Best Color Match";
  return scored;
}
