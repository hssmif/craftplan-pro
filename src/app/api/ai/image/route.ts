import { NextRequest, NextResponse } from "next/server";

// Gemini API
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// Gemini image models (require billing)
const GEMINI_IMAGE_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-3-pro-image-preview",
];

// Gemini text models for SVG generation (FREE tier works)
const GEMINI_TEXT_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
];

// Pollinations API
const POLLINATIONS_AUTH_URL = "https://gen.pollinations.ai/image";
const POLLINATIONS_FREE_URL = "https://image.pollinations.ai/prompt";
const POLLINATIONS_CHAT_URL = "https://gen.pollinations.ai/v1/chat/completions";

const ARTWORK_ANALYSIS_PROMPT = `You are a design recreation engine for Print-On-Demand products.

Analyze the reference artwork in this product image. Ignore the product itself (t-shirt, mug, etc.) — focus ONLY on the printed design/artwork.

Identify and describe:
1. SUBJECT: The main illustrated subject (e.g., "woman holding a brain", "frog playing guitar", "birds sitting on a branch"). Be SPECIFIC — name the exact subject, character, animal, or object.
2. STYLE: The illustration style (e.g., "1950s retro advertising illustration", "vintage naturalist print", "comic book pop art", "distressed screen print").
3. COMPOSITION: How elements are arranged (e.g., "centered character with radiating lines behind", "character surrounded by text arc").
4. COLORS: The 3-4 dominant colors (e.g., "faded red, cream, black").
5. TEXTURE: Any print effects (e.g., "halftone dots, distressed worn texture, faded vintage print").
6. TEXT: If the artwork contains text, write it EXACTLY as it appears. If no text, say "no text".

Output ONLY a single image-generation prompt (1-2 sentences, under 100 words) that would recreate a similar design. Format it as comma-separated descriptors that an AI image model can use directly.

Example output format:
"retro illustration of a woman holding a brain with surprised expression, 1950s advertising style, faded red and cream color palette, halftone dot texture, distressed vintage print, with text USE YOUR BRAIN, centered composition, transparent background, t-shirt print ready"

RULES:
- Describe the EXACT subject (woman, frog, birds, skull, etc.) — do NOT say "graphic design" or "vintage artwork"
- Keep it SHORT — Flux model works best with concise prompts
- Include "transparent background, t-shirt print ready" at the end
- Do NOT mention the product (shirt, mug) in the prompt
- Do NOT invent subjects — describe only what you SEE`;

// ── Analyze reference artwork and build an image-generation prompt ──
// Tries Gemini direct API first, falls back to Pollinations gemini-fast.
// This REPLACES the original keyword-based prompt entirely.
// Output is a short, Flux-friendly prompt describing only the visual artwork.
async function buildArtworkPrompt(apiKey: string | undefined, imageBase64: string): Promise<string | null> {
  // ── 1. Try direct Gemini API ──
  if (apiKey) {
    try {
      const model = "gemini-2.5-flash";
      const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
              { text: ARTWORK_ANALYSIS_PROMPT },
            ],
          }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 300 },
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        let description = parts.map((p: { text?: string }) => p.text || "").join("").trim();
        description = description.replace(/^["']|["']$/g, "").replace(/\n/g, ", ").trim();
        if (description) {
          console.log(`[Image API] Gemini artwork prompt built: "${description.substring(0, 150)}"`);
          return description;
        }
      } else {
        console.warn(`[Image API] Gemini artwork analysis failed (${resp.status}) — trying Pollinations fallback`);
      }
    } catch (err) {
      console.warn("[Image API] Gemini artwork analysis error:", err);
    }
  }

  // ── 2. Fallback: Pollinations gemini-fast (separate quota) ──
  const pollinationsKey = process.env.POLLINATIONS_API_KEY;
  if (pollinationsKey) {
    try {
      console.log("[Image API] Trying Pollinations gemini-fast for artwork analysis...");
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
              { type: "text", text: ARTWORK_ANALYSIS_PROMPT },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
            ],
          }],
          max_tokens: 300,
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (resp.ok) {
        const data = await resp.json();
        let description = data?.choices?.[0]?.message?.content?.trim() || "";
        description = description.replace(/^["']|["']$/g, "").replace(/```[\s\S]*?```/g, "").replace(/\n/g, ", ").trim();
        if (description) {
          console.log(`[Image API] Pollinations artwork prompt built: "${description.substring(0, 150)}"`);
          return description;
        }
      } else {
        console.error(`[Image API] Pollinations artwork analysis failed: ${resp.status}`);
      }
    } catch (err) {
      console.error("[Image API] Pollinations artwork analysis error:", err);
    }
  }

  console.error("[Image API] All artwork analysis methods failed");
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const {
      prompt,
      provider = "auto",
      width = 1920,
      height = 1080,
      model = "flux",
      seed,
      enhance = true,
      referenceImage,
    } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    // ═══════════════════════════════════════════════════════════
    // REFERENCE IMAGE HANDLING
    // When a reference image is provided, the Gemini Vision analysis
    // REPLACES the original prompt. The original prompt (which often
    // contains Etsy title keywords) is discarded entirely.
    // This prevents keyword leakage into image generation.
    // ═══════════════════════════════════════════════════════════
    let enhancedPrompt = prompt;
    if (referenceImage) {
      const geminiKey = process.env.GEMINI_API_KEY;
      console.log("[Image API] Analyzing reference artwork to build visual prompt (replacing keyword-based prompt)...");
      // buildArtworkPrompt tries Gemini direct → Pollinations gemini-fast fallback
      const artworkPrompt = await buildArtworkPrompt(geminiKey, referenceImage);
      if (artworkPrompt) {
        // REPLACE the original prompt — do NOT append to it.
        // The original prompt contains Etsy title keywords that must not influence generation.
        enhancedPrompt = artworkPrompt;
        console.log(`[Image API] Prompt REPLACED with artwork analysis (${enhancedPrompt.length} chars): "${enhancedPrompt.slice(0, 150)}"`);
      } else {
        console.warn("[Image API] Artwork analysis failed — using original prompt as fallback");
      }
    }

    // Provider order for "auto":
    //   Pollinations Auth (gen.pollinations.ai) → Pollinations Free → SVG → Gemini Image
    // Provider "pollinations" skips SVG (for photorealistic mockups)

    // 1. Try Pollinations.ai with API key (gen.pollinations.ai)
    if (provider === "pollinations" || provider === "auto") {
      const pollinationsKey = process.env.POLLINATIONS_API_KEY;
      if (pollinationsKey) {
        console.log(`[Image API] Trying gen.pollinations.ai with auth (model: ${model})...`);
        const result = await tryPollinationsAuth(pollinationsKey, enhancedPrompt, { width, height, model, seed, enhance });
        if (result) return result;
      }
    }

    // 2. Try Pollinations.ai FREE endpoint (image.pollinations.ai)
    if (provider === "pollinations" || provider === "auto") {
      console.log("[Image API] Trying free image.pollinations.ai...");
      const result = await tryPollinationsFree(enhancedPrompt, { width, height, seed, enhance });
      if (result) return result;
    }

    // 3. Try SVG generation via Gemini text model (FREE, always works)
    if (provider === "svg" || provider === "auto") {
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        console.log("[Image API] Trying SVG generation via Gemini text model (free)...");
        const result = await trySvgGeneration(apiKey, enhancedPrompt);
        if (result) return result;
      }
    }

    // 4. Try Gemini image models (requires billing)
    if (provider === "gemini" || provider === "auto") {
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        for (const geminiModel of GEMINI_IMAGE_MODELS) {
          console.log(`[Image API] Trying Gemini image model: ${geminiModel}`);
          const result = await tryGeminiImage(apiKey, geminiModel, enhancedPrompt);
          if (result) return result;
        }
      }
    }

    return NextResponse.json(
      { error: "Image generation failed with all providers. Please try again later." },
      { status: 400 }
    );
  } catch (err) {
    console.error("AI image error:", err);
    return NextResponse.json(
      { error: "Image generation failed. Try again." },
      { status: 500 }
    );
  }
}

// ── Pollinations.ai with API Key (gen.pollinations.ai) ────────
interface PollinationsOptions {
  width?: number;
  height?: number;
  model?: string;
  seed?: number;
  enhance?: boolean;
}

async function tryPollinationsAuth(
  apiKey: string,
  prompt: string,
  opts: PollinationsOptions
): Promise<NextResponse | null> {
  try {
    const encodedPrompt = encodeURIComponent(prompt);
    const params = new URLSearchParams();
    if (opts.width) params.set("width", String(opts.width));
    if (opts.height) params.set("height", String(opts.height));
    if (opts.model) params.set("model", opts.model);
    if (opts.seed !== undefined) params.set("seed", String(opts.seed));
    if (opts.enhance) params.set("enhance", "true");

    const url = `${POLLINATIONS_AUTH_URL}/${encodedPrompt}?${params.toString()}`;

    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(120000), // 2 min timeout for image gen
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[Image API] gen.pollinations.ai failed: ${resp.status}`, errText.substring(0, 200));
      return null;
    }

    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await resp.arrayBuffer();

    if (arrayBuffer.byteLength < 1000) {
      console.error(`[Image API] gen.pollinations.ai: response too small (${arrayBuffer.byteLength} bytes)`);
      return null;
    }

    const base64 = Buffer.from(arrayBuffer).toString("base64");

    console.log(`[Image API] gen.pollinations.ai success! Model: ${opts.model}, Size: ${arrayBuffer.byteLength} bytes`);

    // Build a free-tier URL that Printful can access (no auth needed)
    const freeParams = new URLSearchParams();
    if (opts.width) freeParams.set("width", String(opts.width));
    if (opts.height) freeParams.set("height", String(opts.height));
    if (opts.enhance) freeParams.set("enhance", "true");
    freeParams.set("nologo", "true");
    const imageUrl = `${POLLINATIONS_FREE_URL}/${encodedPrompt}?${freeParams.toString()}`;

    return NextResponse.json({
      image: base64,
      mimeType: contentType,
      model: `pollinations-${opts.model || "flux"}`,
      imageUrl,
    });
  } catch (err) {
    console.error("[Image API] gen.pollinations.ai error:", err);
    return null;
  }
}

// ── Pollinations.ai FREE endpoint (image.pollinations.ai) ────
async function tryPollinationsFree(
  prompt: string,
  opts: PollinationsOptions
): Promise<NextResponse | null> {
  try {
    const encodedPrompt = encodeURIComponent(prompt);
    const params = new URLSearchParams();
    if (opts.width) params.set("width", String(opts.width));
    if (opts.height) params.set("height", String(opts.height));
    if (opts.seed !== undefined) params.set("seed", String(opts.seed));
    if (opts.enhance) params.set("enhance", "true");

    const url = `${POLLINATIONS_FREE_URL}/${encodedPrompt}?${params.toString()}`;

    const resp = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(90000), // 90 sec timeout
    });

    if (!resp.ok) {
      console.error(`[Image API] image.pollinations.ai failed: ${resp.status}`);
      return null;
    }

    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await resp.arrayBuffer();

    if (arrayBuffer.byteLength < 1000) {
      console.error(`[Image API] image.pollinations.ai: response too small (${arrayBuffer.byteLength} bytes)`);
      return null;
    }

    const base64 = Buffer.from(arrayBuffer).toString("base64");

    console.log(`[Image API] image.pollinations.ai success! Size: ${arrayBuffer.byteLength} bytes`);

    // Return the public URL for direct use by Printful
    params.set("nologo", "true");
    const imageUrl = `${POLLINATIONS_FREE_URL}/${encodedPrompt}?${params.toString()}`;

    return NextResponse.json({
      image: base64,
      mimeType: contentType,
      model: "pollinations-free",
      imageUrl,
    });
  } catch (err) {
    console.error("[Image API] image.pollinations.ai error:", err);
    return null;
  }
}

// ── SVG Generation via Gemini Text Model (FREE) ────────────
async function trySvgGeneration(apiKey: string, userPrompt: string): Promise<NextResponse | null> {
  try {
    const svgPrompt = `Create a COMPLETE SVG image based on this description:
"${userPrompt}"

Rules:
- Output ONLY raw SVG code. No markdown, no backticks, no explanation text.
- Start with <svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg"> and MUST end with </svg>
- Use gradients, shadows, and layered shapes for a professional look
- Draw realistic device frames with planner/dashboard UI on screen
- Include decorative elements (coffee cup, plant, pen)
- Use soft modern color palette with gradients
- Make it detailed and premium-looking`;

    // Try each text model
    for (const model of GEMINI_TEXT_MODELS) {
      const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: svgPrompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 30000,
          },
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`[Image API] SVG via ${model} failed:`, errText.substring(0, 200));
        continue;
      }

      const data = await resp.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      let svgText = parts.map((p: { text?: string }) => p.text || "").join("");

      // Clean up: extract SVG, handle markdown wrapping or truncation
      let svgMatch = svgText.match(/<svg[\s\S]*<\/svg>/i);
      if (!svgMatch) {
        // Check if SVG started but was truncated (no closing tag)
        const svgStart = svgText.match(/<svg[\s\S]*/i);
        if (svgStart) {
          console.log(`[Image API] SVG via ${model}: truncated SVG, appending closing tag`);
          svgText = svgStart[0] + "\n</svg>";
          svgMatch = [svgText];
        } else {
          console.log(`[Image API] SVG via ${model}: no SVG found in response (first 200 chars):`, svgText.substring(0, 200));
          continue;
        }
      }

      svgText = svgMatch[0];

      // Convert SVG to base64 PNG-compatible format
      const base64 = Buffer.from(svgText, "utf-8").toString("base64");

      console.log(`[Image API] SVG success via ${model}! SVG size: ${svgText.length} chars`);

      return NextResponse.json({
        image: base64,
        mimeType: "image/svg+xml",
        model: `${model}-svg`,
        isSvg: true,
      });
    }

    return null;
  } catch (err) {
    console.error("[Image API] SVG generation error:", err);
    return null;
  }
}

// ── Gemini Native Image Generation (requires billing) ──────
async function tryGeminiImage(
  apiKey: string,
  model: string,
  prompt: string
): Promise<NextResponse | null> {
  try {
    const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;

    const geminiResp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    });

    if (!geminiResp.ok) {
      const errText = await geminiResp.text();
      console.error(`[Image API] ${model} failed:`, errText.substring(0, 300));
      return null;
    }

    const data = await geminiResp.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];

    for (const part of parts) {
      if (part.inlineData) {
        console.log(`[Image API] Gemini image success with: ${model}`);
        return NextResponse.json({
          image: part.inlineData.data,
          mimeType: part.inlineData.mimeType || "image/png",
          model,
        });
      }
    }

    return null;
  } catch (err) {
    console.error(`[Image API] ${model} error:`, err);
    return null;
  }
}
