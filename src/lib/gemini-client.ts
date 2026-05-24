// ══════════════════════════════════════════════════════════════
// Gemini Client — Reusable Google Gemini API wrapper
//
// Supports:
//   - Text generation
//   - Image generation (Gemini 2.0 Flash native image output)
//   - Image input + editing (send screenshot → get mockup)
//   - Imagen 3 text-to-image (premium backgrounds)
//
// Uses raw fetch — no external SDK required.
// Reads API key from process.env.GEMINI_API_KEY
// ══════════════════════════════════════════════════════════════

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

// ── Types ────────────────────────────────────────────────────

export interface GeminiImageResult {
  /** Base64-encoded image data */
  base64: string;
  /** MIME type (image/png or image/jpeg) */
  mimeType: string;
  /** Converted to Buffer */
  buffer: Buffer;
  /** Any text returned alongside the image */
  text?: string;
}

export interface GeminiTextResult {
  text: string;
}

interface GeminiContentPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiCandidate {
  content: {
    parts: GeminiContentPart[];
  };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: { message: string; code: number };
}

// ── Client ───────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set in environment variables");
  return key;
}

/**
 * Generate an image using Gemini 2.0 Flash with native image output.
 * Optionally accepts an input image (for editing/mockup generation).
 */
export async function geminiGenerateImage(
  prompt: string,
  inputImage?: { buffer: Buffer; mimeType?: string },
  options: {
    model?: string;
    temperature?: number;
    maxRetries?: number;
  } = {},
): Promise<GeminiImageResult> {
  const apiKey = getApiKey();
  const model = options.model || "gemini-2.5-flash-image";
  const maxRetries = options.maxRetries || 2;
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`;

  // Build request parts
  const parts: GeminiContentPart[] = [];

  // Add text prompt
  parts.push({ text: prompt });

  // Add input image if provided
  if (inputImage) {
    const mime = inputImage.mimeType || "image/png";
    const b64 = inputImage.buffer.toString("base64");
    parts.push({
      inlineData: { mimeType: mime, data: b64 },
    });
  }

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
      temperature: options.temperature ?? 0.4,
    },
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[gemini] Image generation attempt ${attempt + 1}/${maxRetries + 1}...`);

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Gemini API ${resp.status}: ${errText.slice(0, 300)}`);
      }

      const json = (await resp.json()) as GeminiResponse;

      if (json.error) {
        throw new Error(`Gemini error ${json.error.code}: ${json.error.message}`);
      }

      if (!json.candidates || json.candidates.length === 0) {
        throw new Error("Gemini returned no candidates");
      }

      // Extract image and text from response
      let imageResult: { base64: string; mimeType: string } | null = null;
      let textResult = "";

      for (const part of json.candidates[0].content.parts) {
        if (part.inlineData) {
          imageResult = {
            base64: part.inlineData.data,
            mimeType: part.inlineData.mimeType,
          };
        }
        if (part.text) {
          textResult += part.text;
        }
      }

      if (!imageResult) {
        throw new Error("Gemini did not return an image in the response");
      }

      const buffer = Buffer.from(imageResult.base64, "base64");
      console.log(`[gemini] Image generated: ${(buffer.length / 1024).toFixed(0)} KB`);

      return {
        base64: imageResult.base64,
        mimeType: imageResult.mimeType,
        buffer,
        text: textResult || undefined,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[gemini] Attempt ${attempt + 1} failed:`, lastError.message);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error("Gemini image generation failed after retries");
}

/**
 * Generate an image using Imagen 3 (text-to-image only, no input image).
 * Best for generating premium backgrounds and environments.
 */
export async function imagenGenerate(
  prompt: string,
  options: {
    sampleCount?: number;
    aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
  } = {},
): Promise<GeminiImageResult[]> {
  const apiKey = getApiKey();
  const url = `${GEMINI_BASE}/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

  const body = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: options.sampleCount || 1,
      aspectRatio: options.aspectRatio || "1:1",
    },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Imagen API ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const json = await resp.json();
  const predictions = json.predictions || [];

  return predictions.map((pred: { bytesBase64Encoded: string; mimeType?: string }) => {
    const buffer = Buffer.from(pred.bytesBase64Encoded, "base64");
    return {
      base64: pred.bytesBase64Encoded,
      mimeType: pred.mimeType || "image/png",
      buffer,
    };
  });
}

/**
 * Generate text using Gemini (for prompt refinement, descriptions, etc.)
 */
export async function geminiGenerateText(
  prompt: string,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } = {},
): Promise<GeminiTextResult> {
  const apiKey = getApiKey();
  const model = options.model || "gemini-2.5-flash";
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens || 1024,
    },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini text API ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const json = (await resp.json()) as GeminiResponse;

  if (json.error) {
    throw new Error(`Gemini error: ${json.error.message}`);
  }

  const text = json.candidates?.[0]?.content?.parts
    ?.filter(p => p.text)
    .map(p => p.text)
    .join("") || "";

  return { text };
}

// ── Vision: frame-opening detection ──────────────────────────

export interface FrameOpeningBox {
  /** Normalized 0-1 bbox */
  left: number; top: number; right: number; bottom: number;
  shape: "circle" | "oval" | "rectangle";
  /** 0-1 confidence from the model (or a heuristic fallback) */
  confidence: number;
}

/**
 * Use Gemini 2.5 Flash's native vision to locate the fabric opening
 * inside a frame/hoop mockup. Far more reliable than geometric
 * ray-casting: Gemini actually "sees" the opening regardless of
 * lighting, frame color, or background.
 *
 * Gemini's native bbox format is `[ymin, xmin, ymax, xmax]` normalized
 * to 0-1000. We ask it to also classify the opening shape.
 *
 * Cost: ~$0.00015 per image with gemini-2.5-flash. Sub-second latency.
 */
export async function geminiDetectFrameOpening(
  imageBuffer: Buffer,
  mimeType: string = "image/jpeg",
): Promise<FrameOpeningBox | null> {
  const apiKey = getApiKey();
  const model = "gemini-2.5-flash";
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`;

  const prompt = `You are looking at a product mockup photo of a picture frame, embroidery hoop, or similar with a FABRIC INSIDE showing through the opening.

Find the FABRIC OPENING — the inside area where fabric is visible through the rim.

CRITICAL RULES for the bounding box:
1. The box must be STRICTLY INSIDE the inner rim edge.
2. It is better to be slightly TOO SMALL than to touch or cross the rim.
3. Leave a tiny visible gap of fabric (~1-2% of image width) between the box and the rim on all sides.
4. DO NOT include ANY part of the wood/metal/resin rim inside the box.
5. For ovals and circles, use the box that inscribes the shape's widest/tallest axis — then shrink it by ~2% so the rim curve stays outside.

Return ONLY a JSON object with this exact shape (no markdown, no explanation):
{
  "box": [ymin, xmin, ymax, xmax],
  "shape": "circle" | "oval" | "rectangle"
}

Where box coordinates are normalized integers from 0 to 1000 (Gemini native bbox format).

"shape" rules:
- "circle" if the opening is round with width ≈ height
- "oval" if the opening is elliptical with noticeably different width vs height
- "rectangle" if the opening has straight edges and corners`;

  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType, data: imageBuffer.toString("base64") } },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`Gemini bbox ${resp.status}: ${txt.slice(0, 200)}`);
    }

    const json = (await resp.json()) as GeminiResponse;
    const text =
      json.candidates?.[0]?.content?.parts
        ?.filter(p => p.text)
        .map(p => p.text)
        .join("") || "";

    if (!text) return null;

    // Gemini sometimes wraps JSON in markdown fences even with
    // responseMimeType set. Strip to be safe.
    const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      box: [number, number, number, number];
      shape: "circle" | "oval" | "rectangle";
    };

    const [ymin, xmin, ymax, xmax] = parsed.box;
    // Convert 0-1000 → 0-1
    let left = xmin / 1000;
    let top = ymin / 1000;
    let right = xmax / 1000;
    let bottom = ymax / 1000;

    // Safety inset: shrink the box by ~2.5% of its own size on every side.
    // Gemini tends to hug (or slightly cross) the inner rim. A small inward
    // inset guarantees the art lands strictly inside the opening, and for
    // oval/circle shapes it keeps the corners of the bbox off the curve.
    const INSET_FRAC = 0.025;
    const bw = right - left;
    const bh = bottom - top;
    const insetX = bw * INSET_FRAC;
    const insetY = bh * INSET_FRAC;
    left += insetX;
    right -= insetX;
    top += insetY;
    bottom -= insetY;

    // Sanity: box must be inside 0-1 and not degenerate
    if (
      left < 0 || top < 0 || right > 1 || bottom > 1 ||
      right - left < 0.05 || bottom - top < 0.05 ||
      right - left > 0.98 || bottom - top > 0.98
    ) {
      console.warn("[gemini/frame] implausible box:", parsed);
      return null;
    }

    return {
      left, top, right, bottom,
      shape: parsed.shape,
      confidence: 0.95,
    };
  } catch (err) {
    console.warn("[gemini/frame] failed:", err);
    return null;
  }
}

/**
 * Check if Gemini API is configured and reachable.
 */
export async function geminiHealthCheck(): Promise<{
  available: boolean;
  model: string;
  error?: string;
}> {
  try {
    const apiKey = getApiKey();
    const url = `${GEMINI_BASE}/models/gemini-2.5-flash?key=${apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      return { available: false, model: "gemini-2.5-flash", error: `HTTP ${resp.status}` };
    }
    return { available: true, model: "gemini-2.5-flash" };
  } catch (err) {
    return {
      available: false,
      model: "gemini-2.5-flash",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
