// ── Design Sensei: Reference Design Analyzer ──
// Uses Gemini Vision (free tier) to analyze an Etsy product image.
// Falls back to Pollinations gemini-fast when Gemini direct API is rate-limited.
// Classifies as graphic vs text-only, extracts text, maps to style presets.

import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const POLLINATIONS_CHAT_URL = "https://gen.pollinations.ai/v1/chat/completions";

// Vision-capable models to try (in order)
const VISION_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

// Our 12 style presets — used for fuzzy matching
const STYLE_PRESET_MAP: Record<string, string[]> = {
  "retro-badge": ["vintage", "retro", "badge", "emblem", "seal", "americana", "70s badge", "camp"],
  "neon-glow": ["neon", "glow", "glowing", "cyberpunk", "synthwave", "vaporwave", "electric"],
  "farmhouse": ["farmhouse", "rustic", "country", "shiplap", "barn", "cottage chic"],
  "boho-wreath": ["boho", "bohemian", "wreath", "floral frame", "botanical", "whimsical"],
  "arch-minimal": ["minimal", "minimalist", "clean", "modern", "simple", "geometric"],
  "groovy-70s": ["groovy", "70s", "hippie", "psychedelic", "flower power", "retro fun", "bubble"],
  "distressed-vintage": ["distressed", "grunge", "worn", "aged", "weathered", "faded", "textured"],
  "watercolor-splash": ["watercolor", "watercolour", "splash", "soft", "pastel", "dreamy", "artistic"],
  "bold-stacked": ["bold", "block", "stacked", "impact", "heavy", "condensed", "strong"],
  "cottagecore": ["cottagecore", "pastoral", "garden", "floral", "dainty", "romantic", "sweet"],
  "street-graffiti": ["graffiti", "street", "urban", "spray", "edgy", "punk", "raw"],
  "luxury-gold": ["luxury", "gold", "elegant", "premium", "ornate", "royal", "classic serif"],
};

// Our palette names — used for color matching
const PALETTE_MAP: Record<string, string[]> = {
  "vintage-rust": ["rust", "brown", "warm", "earthy", "amber", "sienna", "#8B2500"],
  "navy-gold": ["navy", "gold", "dark blue", "royal", "#1B2B4B", "#C9A84C"],
  "forest-cream": ["forest", "green", "cream", "olive", "sage dark", "#2D4A2D"],
  "blush-sage": ["blush", "sage", "pink", "soft green", "muted", "#F9F0EB"],
  "charcoal-white": ["black", "white", "monochrome", "dark", "contrast", "#1A1A1A"],
  "cream-black": ["cream", "off-white", "beige", "light bg", "#FAF7F2"],
  "neon-dark": ["neon", "hot pink", "cyan", "magenta", "electric", "#0D0D0D"],
  "mustard-brown": ["mustard", "yellow", "ochre", "honey", "#E8B84B"],
  "lavender-gold": ["lavender", "purple", "lilac", "violet", "#E8E0F0"],
  "terracotta": ["terracotta", "clay", "orange", "burnt", "#C4714A"],
  "mint-dark": ["mint", "teal", "seafoam", "aqua", "#E8F5F0"],
  "burgundy-cream": ["burgundy", "maroon", "wine", "crimson", "#6B1020"],
  "electric-purple": ["purple", "violet", "deep purple", "indigo", "#1A0A2E"],
  "ocean-white": ["ocean", "blue", "marine", "sky", "teal dark", "#0A4A6E"],
  "warm-minimal": ["white", "minimal", "clean white", "simple", "#FFFFFF"],
};

function fuzzyMatchPreset(styleDescription: string): string {
  const lower = styleDescription.toLowerCase();
  let bestMatch = "retro-badge"; // default
  let bestScore = 0;

  for (const [preset, keywords] of Object.entries(STYLE_PRESET_MAP)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score += kw.length; // Longer keyword matches = higher confidence
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = preset;
    }
  }

  return bestMatch;
}

function fuzzyMatchPalette(colorsDescription: string): string {
  const lower = colorsDescription.toLowerCase();
  let bestMatch = "vintage-rust"; // default
  let bestScore = 0;

  for (const [palette, keywords] of Object.entries(PALETTE_MAP)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score += kw.length;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = palette;
    }
  }

  return bestMatch;
}

async function analyzeWithVision(apiKey: string, model: string, imageBase64: string): Promise<{
  text?: string;
  error?: string;
  retryAfterSec?: number;
}> {
  const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: imageBase64,
            },
          },
          {
            text: `You are analyzing a product design image from an Etsy listing (likely a t-shirt, mug, or poster).

IMPORTANT: Focus on the DESIGN/ARTWORK AREA only, ignore the product (shirt, mug) itself.

1. DESIGN TYPE — Classify the design into ONE of these three categories:
   - "text-only": The design is PURELY typography/text. No illustrations, no icons, no graphics. Just words with font styling.
   - "graphic": The design is primarily illustrations, artwork, vintage graphics, retro imagery, animals, objects, or complex visual elements. May include some text but the GRAPHIC is the main element.
   - "mixed": The design has BOTH significant graphic elements AND significant typography that work together. Neither is just decoration for the other.

2. TEXT EXTRACTION: Extract ALL text visible in the design artwork EXACTLY as written. Preserve capitalization. Use "\\n" for line breaks. If no text exists, return empty string. IMPORTANT: Extract text from the ARTWORK, not from product labels or watermarks.

3. GRAPHIC DESCRIPTION: If the design contains graphics/illustrations, describe the SPECIFIC visual subject in enough detail that an AI image generator could recreate a similar composition. Name the exact subject (woman, frog, skull, birds, cat, etc.), what they are doing, and the key visual elements. Example: "retro illustrated woman with surprised expression holding a human brain, 1950s vintage advertising parody style, radiating lines and halftone dots in background, cream and red color scheme". Be SPECIFIC about the subject — do NOT say generic things like "vintage graphic" or "illustrated design". If text-only, return empty string.

4. STYLE ANALYSIS:
   - Visual style (vintage, retro, minimalist, grunge, distressed, watercolor, neon, hand-drawn, comic book, pop art, etc.)
   - Color palette: The 3-4 dominant colors as hex codes
   - Typography: Font style used (bold condensed, script, serif, slab serif, handwritten, display, etc.)
   - Layout: How elements are arranged (centered-stack, arched, circular-badge, split-lines, etc.)
   - Mood: (funny, sarcastic, wholesome, motivational, edgy, nostalgic, bold, vintage, playful, etc.)

Return ONLY valid JSON:
{
  "designType": "graphic",
  "extractedText": "USE IT!",
  "graphicDescription": "retro illustrated woman with surprised expression holding a human brain, 1950s vintage advertising parody style, radiating lines and halftone dots in background, cream and red color scheme",
  "style": {
    "visual": "vintage-distressed",
    "colors": ["#8B2500", "#F5E6D3", "#2C1810"],
    "typography": "bold condensed uppercase",
    "layout": "centered-stack",
    "mood": "nostalgic"
  }
}`,
          },
        ],
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2000,
        responseMimeType: "application/json",
      },
    }),
  });

  if (resp.status === 429 || resp.status === 503) {
    return { retryAfterSec: 10 };
  }
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "unknown");
    return { error: `${resp.status}: ${errText.slice(0, 200)}` };
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ? { text } : { error: "No text in response" };
}

// ── Pollinations Vision Fallback ──
// Uses Pollinations OpenAI-compatible chat API with gemini-fast model for vision.
// This has a SEPARATE quota from the direct Gemini API, so it works when Gemini is rate-limited.
const VISION_PROMPT = `You are analyzing a product design image from an Etsy listing (likely a t-shirt, mug, or poster).

IMPORTANT: Focus on the DESIGN/ARTWORK AREA only, ignore the product (shirt, mug) itself.

1. DESIGN TYPE — Classify the design into ONE of these three categories:
   - "text-only": The design is PURELY typography/text. No illustrations, no icons, no graphics. Just words with font styling.
   - "graphic": The design is primarily illustrations, artwork, vintage graphics, retro imagery, animals, objects, or complex visual elements. May include some text but the GRAPHIC is the main element.
   - "mixed": The design has BOTH significant graphic elements AND significant typography that work together. Neither is just decoration for the other.

2. TEXT EXTRACTION: Extract ALL text visible in the design artwork EXACTLY as written. Preserve capitalization. Use "\\n" for line breaks. If no text exists, return empty string. IMPORTANT: Extract text from the ARTWORK, not from product labels or watermarks.

3. GRAPHIC DESCRIPTION: If the design contains graphics/illustrations, describe the SPECIFIC visual subject in enough detail that an AI image generator could recreate a similar composition. Name the exact subject (woman, frog, skull, birds, cat, etc.), what they are doing, and the key visual elements. Example: "retro illustrated woman with surprised expression holding a human brain, 1950s vintage advertising parody style, radiating lines and halftone dots in background, cream and red color scheme". Be SPECIFIC about the subject — do NOT say generic things like "vintage graphic" or "illustrated design". If text-only, return empty string.

4. STYLE ANALYSIS:
   - Visual style (vintage, retro, minimalist, grunge, distressed, watercolor, neon, hand-drawn, comic book, pop art, etc.)
   - Color palette: The 3-4 dominant colors as hex codes
   - Typography: Font style used (bold condensed, script, serif, slab serif, handwritten, display, etc.)
   - Layout: How elements are arranged (centered-stack, arched, circular-badge, split-lines, etc.)
   - Mood: (funny, sarcastic, wholesome, motivational, edgy, nostalgic, bold, vintage, playful, etc.)

Return ONLY valid JSON:
{
  "designType": "graphic",
  "extractedText": "USE IT!",
  "graphicDescription": "retro illustrated woman with surprised expression holding a human brain, 1950s vintage advertising parody style, radiating lines and halftone dots in background, cream and red color scheme",
  "style": {
    "visual": "vintage-distressed",
    "colors": ["#8B2500", "#F5E6D3", "#2C1810"],
    "typography": "bold condensed uppercase",
    "layout": "centered-stack",
    "mood": "nostalgic"
  }
}`;

async function analyzeWithPollinationsVision(
  pollinationsKey: string,
  imageBase64: string
): Promise<{ text?: string; error?: string }> {
  try {
    const resp = await fetch(POLLINATIONS_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pollinationsKey}`,
      },
      body: JSON.stringify({
        model: "gemini-fast",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: VISION_PROMPT },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        }],
        max_tokens: 2000,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "unknown");
      return { error: `Pollinations ${resp.status}: ${errText.slice(0, 200)}` };
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return { error: "No content in Pollinations response" };

    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    return jsonMatch ? { text: jsonMatch[0] } : { error: "No JSON found in response" };
  } catch (err) {
    return { error: `Pollinations error: ${err}` };
  }
}

function parseAndRespond(rawText: string, source: string): NextResponse | null {
  try {
    const parsed = JSON.parse(rawText);
    const styleStr = [
      parsed.style?.visual || "",
      parsed.style?.typography || "",
      parsed.style?.mood || "",
    ].join(" ");
    const colorStr = (parsed.style?.colors || []).join(" ") + " " + (parsed.style?.visual || "");

    const suggestedStylePreset = fuzzyMatchPreset(styleStr);
    const suggestedPalette = fuzzyMatchPalette(colorStr);

    console.log(`[Analyze Reference] ${source} success: type=${parsed.designType}, style=${suggestedStylePreset}, palette=${suggestedPalette}, graphic="${(parsed.graphicDescription || "").slice(0, 80)}"`);

    return NextResponse.json({
      designType: parsed.designType || "text-only",
      extractedText: parsed.extractedText || "",
      graphicDescription: parsed.graphicDescription || "",
      style: parsed.style || { visual: "vintage", colors: [], typography: "bold", layout: "centered-stack", mood: "bold" },
      suggestedStylePreset,
      suggestedPalette,
    });
  } catch {
    console.error(`[Analyze Reference] ${source}: JSON parse failed, raw:`, rawText?.slice(0, 200));
    return null;
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  const pollinationsKey = process.env.POLLINATIONS_API_KEY;

  if (!apiKey && !pollinationsKey) {
    return NextResponse.json({ error: "No vision API keys configured" }, { status: 500 });
  }

  const { referenceImageBase64 } = await req.json();
  if (!referenceImageBase64) return NextResponse.json({ error: "referenceImageBase64 required" }, { status: 400 });

  let allModelsRateLimited = true;

  // ── 1. Try direct Gemini API (fastest, free tier) ──
  if (apiKey) {
    for (const model of VISION_MODELS) {
      console.log(`[Analyze Reference] Trying ${model}...`);

      const r1 = await analyzeWithVision(apiKey, model, referenceImageBase64);
      if (r1.text) {
        allModelsRateLimited = false;
        const result = parseAndRespond(r1.text, model);
        if (result) return result;
        continue;
      }

      // If rate limited, don't wait — try next model, then fallback to Pollinations
      if (r1.retryAfterSec) {
        console.log(`[Analyze Reference] ${model} rate-limited (will try Pollinations fallback)`);
        continue;
      }

      if (r1.error) {
        allModelsRateLimited = false;
        console.log(`[Analyze Reference] ${model}: ${r1.error}`);
      }
    }
  }

  // ── 2. Fallback: Pollinations gemini-fast (separate quota) ──
  if (pollinationsKey) {
    console.log(`[Analyze Reference] ${allModelsRateLimited ? "Gemini rate-limited" : "Gemini failed"} — trying Pollinations gemini-fast fallback...`);

    const pollResult = await analyzeWithPollinationsVision(pollinationsKey, referenceImageBase64);
    if (pollResult.text) {
      const result = parseAndRespond(pollResult.text, "pollinations-gemini-fast");
      if (result) return result;
    }

    if (pollResult.error) {
      console.error(`[Analyze Reference] Pollinations fallback failed:`, pollResult.error);
    }
  }

  return NextResponse.json({ error: "All vision models failed" }, { status: 500 });
}
