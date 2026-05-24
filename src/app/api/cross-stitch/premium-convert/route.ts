import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { upscaleWithRealEsrgan } from "@/lib/replicate";
import { geminiGenerateImage } from "@/lib/gemini-client";
import { editImage, IMAGE_MODEL } from "@/lib/openai-image";

// Premium source-cleanup pipeline for paid conversions.
//
// Two things make Premium "premium":
//   1. Real-ESRGAN 2× upscale BEFORE cleanup — the cleanup model gets
//      more pixels to work with, so small decorative elements (cherry
//      blossoms, scallops, filigree) survive quantization instead of
//      getting outvoted.  ~$0.0011/call via Replicate.
//   2. User's choice of cleanup model — different models have different
//      style biases. The free tier picks one default; Premium lets the
//      caller steer:
//        · "openai-high" → gpt-image-1 HIGH quality ($0.17). Crispest
//          flat-vector output; best for cartoons/stickers. Tends to
//          over-stylize pastel/watercolor sources (remaps palettes).
//        · "gemini" → gemini-2.5-flash-image ($0.003). Preserves source
//          palette most faithfully; best for delicate pastels, kimonos,
//          watercolor-style kokeshi dolls.
//        · "fal" → Flux Dev img2img ($0.025). Balanced — more faithful
//          than OpenAI HIGH, more flattening than Gemini.
//
// Ornate-safe quantizer defaults (Force OFF outline, maxColors ≥24)
// are applied client-side by the Premium Convert UI callback, not here.

export const maxDuration = 180;

type Provider = "openai-high" | "gemini" | "fal";

const FAL_IMG2IMG_URL = "https://fal.run/fal-ai/flux/dev/image-to-image";

// Canonical cleanup prompt. Same intent across all three providers: flatten
// painterly → flat vector while preserving EVERY decorative element.
//
// This prompt is a scar tissue of real failures. Each paragraph addresses
// a specific drift we caught in side-by-side review:
//   - Palette remap (cream→navy, peach→red) — seen with gpt-image-1 HIGH
//   - Radial rib simplification (24 umbrella ribs → 3) — seen with Gemini
//   - Flower relocation (scattered blossoms → center cluster) — Gemini
//   - Motif substitution (geometric dots → cherry blossoms) — Gemini
//   - Wave-color flattening (cream/teal/peach mix → single color) — Gemini
const CLEAN_PROMPT = `Redraw this illustration as a FLAT VECTOR POSTER. The ONLY goal is to replace soft/painterly rendering with crisp flat colors. You are NOT allowed to "improve" the illustration, "simplify" it, or "make it prettier". You are a FLATTENER, not an artist.

═══ RULE 1 — EXACT COLOR PALETTE ═══
Preserve the source's exact color palette: same hues, same saturation, same brightness.
- If source is pastel (cream, sage, peach, pale pink) → output must be pastel. Do NOT remap to bold/saturated colors.
- Do NOT turn cream into navy. Do NOT turn soft peach into bright red. Do NOT turn sage into teal.
- If a region has subtle color variation (e.g. scalloped waves alternating cream/teal/peach), preserve the variation wave-by-wave — do NOT flatten the whole region to a single color.

═══ RULE 2 — FLAT RENDERING ═══
Every region = SOLID FLAT color fill. No gradients. No soft edges. No airbrush. No painterly brushstrokes. No texture. No shading. No highlights. No dithering. No stippling. No faint color washes. Edges must be CRISP and HARD like Adobe Illustrator vector art or silkscreen poster.

═══ RULE 3 — FINE-LINE PATTERNS (critical — this is where you fail most) ═══
If the source has thin radial lines, pinstripes, or rib patterns (umbrella/parasol tops, fan ribs, hat ridges, kimono pleats):
- COUNT THE LINES first. If an umbrella has ~24 visible radial ribs, your output has ~24 ribs. Not 3. Not 8. Twenty-four.
- Match each line's position, length, and color (copper-on-black stays copper-on-black).
- "Simplified to a few lines" = FAILURE.

═══ RULE 4 — DO NOT RELOCATE ═══
Decorative elements stay where they are.
- If cherry blossoms are scattered across the kimono (one near the shoulder, one near the hem, one on the sleeve), keep them scattered in those positions. Do NOT gather them into a dense center cluster.
- If speckle dots are spread across the background, keep them spread. Do NOT concentrate them.
- A decorative element appearing in a new location it wasn't in the source = FAILURE.

═══ RULE 5 — DO NOT SUBSTITUTE ═══
Decorative elements are NOT interchangeable.
- If the source has small geometric motifs (dots, triangles, diamonds, rhombi), redraw them as dots/triangles/diamonds/rhombi. Do NOT replace with flowers.
- If the source has abstract shapes, do NOT "improve" them by converting to recognizable objects (flowers, hearts, birds).
- If the source has no cherry blossoms in a region, DO NOT add cherry blossoms there. Gemini: stop adding cherry blossoms.
- Replacing a motif type = FAILURE.

═══ RULE 6 — COUNT EVERYTHING ═══
Before redrawing, count the distinct decorative elements in each region (hat, kimono body, obi belt, hem, background). Your output must match that count per region. Off by even one = FAILURE.

═══ RULE 7 — OUTLINES ═══
If the source has dark outlines, keep them as uniform solid black lines at the SAME thickness. If the source has NO outlines, do not add any.

═══ RULE 8 — BACKGROUND ═══
Keep the source's background color exactly. If white, keep white. If cream, keep cream. If tinted, keep that tint.

═══ SELF-CHECK BEFORE OUTPUT ═══
1. Radial lines on hats/umbrellas: count matches source?
2. Every flower/dot/motif in same position as source?
3. Motif types unchanged (dots stay dots, not flowers)?
4. Palette still pastel (if source was pastel)?
5. Wave/stripe color variation preserved?

If any answer is "no", restart. Output a single hard-edged vector-style PNG.`;

// Provider-specific prices for UI telemetry. Rough; actual cost varies.
const COST: Record<Provider, number> = {
  "openai-high": 0.17,
  "gemini": 0.003,
  "fal": 0.025,
};

// Model label returned to client. Prefixed so the provider-mismatch
// detector + UI badge (startsWith("gpt"|"gemini"|"fal")) still works.
//
// The openai-high slot reads the live IMAGE_MODEL so when we flip
// gpt-image-1 → gpt-image-2 (post org-verification) the label reflects
// reality without us having to edit this file again.
const MODEL_LABEL: Record<Provider, string> = {
  "openai-high": `${IMAGE_MODEL}-premium`,
  "gemini": "gemini-nano-banana-premium",
  "fal": "fal-flux-dev-premium",
};

async function callOpenAIHigh(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  // Thin wrapper over the shared editImage helper: "high" quality is
  // what makes this the premium tier (vs the free tier's "medium").
  // 150s timeout because high-quality renders are slow.
  const { dataUrl } = await editImage({
    images: [
      {
        buffer,
        mimeType,
        filename: `source.${mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg"}`,
      },
    ],
    prompt: CLEAN_PROMPT,
    quality: "high",
    size: "1024x1024",
    timeoutMs: 150_000,
    caller: "premium-convert/openai-high",
  });
  return dataUrl;
}

async function callGemini(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const result = await geminiGenerateImage(
    CLEAN_PROMPT,
    { buffer, mimeType },
    {
      model: "gemini-2.5-flash-image",
      // Lowest practical temperature — Gemini will still drift at 0.0
      // (image models aren't as temperature-sensitive as text), but 0.05
      // tightens it meaningfully compared to 0.2. Went from "creative"
      // to "mostly faithful with minor motif drift".
      temperature: 0.05,
      maxRetries: 2,
    }
  );
  return `data:${result.mimeType};base64,${result.base64}`;
}

async function callFal(
  apiKey: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const b64 = buffer.toString("base64");
  const imageUrl = `data:${mimeType};base64,${b64}`;
  const body = {
    image_url: imageUrl,
    prompt: CLEAN_PROMPT,
    // Lower strength than the free fal route (0.5 → 0.4) because the
    // upscale pre-pass already gave the model clean pixels; we want it
    // to mostly flatten, not re-stylize.
    strength: 0.4,
    num_inference_steps: 28,
    guidance_scale: 7,
    num_images: 1,
    enable_safety_checker: true,
    output_format: "png",
  };

  const resp = await fetch(FAL_IMG2IMG_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`fal.ai ${resp.status}: ${errText.substring(0, 400)}`);
  }

  const data = await resp.json();
  const outUrl: string | undefined = data?.images?.[0]?.url;
  if (!outUrl) throw new Error("fal.ai returned no image url");

  const imgResp = await fetch(outUrl, { signal: AbortSignal.timeout(60000) });
  if (!imgResp.ok) throw new Error(`fal image download failed: ${imgResp.status}`);
  const contentType = imgResp.headers.get("content-type") || "image/png";
  const arrayBuffer = await imgResp.arrayBuffer();
  const outB64 = Buffer.from(arrayBuffer).toString("base64");
  return `data:${contentType};base64,${outB64}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      image?: string;
      provider?: Provider;
      // Client's effective maxColors (the slider). We size the server
      // quantizer at maxColors + 8 so there's headroom for the browser
      // mode-vote + DMC merge while still being MUCH tighter than the
      // old 4×96 = 384 quadrant palette.
      maxColors?: number;
    };
    const image = body.image;
    const provider: Provider = body.provider ?? "openai-high";

    if (!image) {
      return NextResponse.json({ error: "image required" }, { status: 400 });
    }
    if (!["openai-high", "gemini", "fal"].includes(provider)) {
      return NextResponse.json(
        { error: `provider must be openai-high|gemini|fal (got: ${provider})` },
        { status: 400 }
      );
    }

    // Provider-specific key preflight — fail fast with a clear error
    // rather than charging for the upscale then falling over.
    if (provider === "openai-high" && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 }
      );
    }
    if (provider === "gemini" && !process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      );
    }
    if (
      provider === "fal" &&
      !process.env.FAL_API_KEY &&
      !process.env.FAL_KEY
    ) {
      return NextResponse.json(
        { error: "FAL_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Decode incoming data URL (or raw base64).
    const dataUrlMatch = image.match(/^data:([^;]+);base64,(.*)$/);
    const srcMime = dataUrlMatch ? dataUrlMatch[1] : "image/png";
    const srcB64 = dataUrlMatch ? dataUrlMatch[2] : image;
    // Typed as the broader Buffer so sharp().toBuffer() reassignments
    // don't trip Buffer<ArrayBuffer> vs Buffer<ArrayBufferLike> strictness.
    let workingBuffer: Buffer = Buffer.from(srcB64, "base64");
    let workingMime = srcMime;

    // Step 1 — Real-ESRGAN 2× (optional but cheap — $0.001).
    let upscaledVia: "replicate" | "skipped" = "skipped";
    let upscaleCost = 0;
    if (process.env.REPLICATE_API_TOKEN) {
      try {
        const prepped = await sharp(workingBuffer)
          .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 95 })
          .toBuffer();
        const dataUri = `data:image/jpeg;base64,${prepped.toString("base64")}`;
        const upscaledUrl = await upscaleWithRealEsrgan(dataUri, 2);
        const resp = await fetch(upscaledUrl);
        if (!resp.ok) throw new Error(`fetch upscaled ${resp.status}`);
        workingBuffer = Buffer.from(await resp.arrayBuffer());
        workingMime = "image/png";
        upscaledVia = "replicate";
        upscaleCost = 0.0011;
        console.log(
          `[premium-convert] Real-ESRGAN 2× done (${(workingBuffer.length / 1024 / 1024).toFixed(1)}MB)`
        );
      } catch (err) {
        console.warn("[premium-convert] Real-ESRGAN failed, using original:", err);
      }
    }

    // Clamp before feeding cleanup models (Gemini inlineData gets slow
    // above 8MB; OpenAI edits caps at 50MB but prefers <5MB).
    const MAX_BYTES = 5 * 1024 * 1024;
    if (workingBuffer.length > MAX_BYTES) {
      workingBuffer = await sharp(workingBuffer)
        .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer();
      workingMime = "image/png";
    }

    // Step 2 — route to chosen provider.
    let cleanedDataUrl: string;
    if (provider === "openai-high") {
      cleanedDataUrl = await callOpenAIHigh(workingBuffer, workingMime);
    } else if (provider === "gemini") {
      cleanedDataUrl = await callGemini(workingBuffer, workingMime);
    } else {
      cleanedDataUrl = await callFal(
        process.env.FAL_API_KEY || process.env.FAL_KEY!,
        workingBuffer,
        workingMime
      );
    }

    // Step 3 — GLOBAL LIBIMAGEQUANT FLATTEN (no dither).
    //
    // History (why this is the third strategy):
    //   v1 — global sharp png({palette:true, colours:256}) with DEFAULT dither
    //        Result: speckled / stippled output. Sharp defaults `dither` to
    //        1.0 (Floyd-Steinberg) which literally bakes noise into every
    //        flat region. Looked painterly, not flat-vector.
    //   v2 — 2×2 quadrant scan at colours:96 per quadrant
    //        Result: 4×96=384 total colours (FAR too many), visible quadrant
    //        seams, AND still dithered because `dither` was left at default.
    //        The browser-side DMC quantizer couldn't flatten 384-colour input
    //        cleanly, leading to the "messy / speckled" feedback on kokeshi,
    //        duckling, boy/girl, teacup patterns.
    //   v3 — single global pass with libimagequant, dither: 0, effort: 10
    //        (this version).
    //
    // Why this works:
    //   - `palette: true` uses libimagequant (the production quantizer
    //     behind pngquant — same thing every serious sprite/icon pipeline
    //     uses).  It's dramatically better than sharp's built-in median-cut
    //     at preserving rare/chromatic features like hat ribs.
    //   - `dither: 0` FORCES flat fills. No Floyd-Steinberg. No stippling.
    //     This is the single most important change.
    //   - `effort: 10` = best-quality palette selection (slower, worth it —
    //     we've already burned a $0.003–$0.17 AI cleanup pass).
    //   - `colours: maxColors + 8` gives the browser quantizer tight,
    //     focused input. The +8 buffer absorbs minor DMC-merge drift.
    //
    // Seam removal + 10× tighter palette + no dither = flat, clean source
    // for the browser-side DMC mapper to consume.
    try {
      const flatMatch = cleanedDataUrl.match(/^data:([^;]+);base64,(.*)$/);
      if (flatMatch) {
        const flatBuf = Buffer.from(flatMatch[2], "base64");
        // Target palette size — FIXED at 128.
        //
        // Why not `maxColors + 8` (= 40) like the first attempt?
        //   At 40 palette entries, libimagequant merges rare
        //   features (copper hat ribs ~0.3% of pixels, gold filigree
        //   ~0.5%, single-stamen lotus ~0.1%) into their dominant
        //   neighbor to save slots. Once merged, the browser-side
        //   rescue overlay can't recover them — the pixels are
        //   already recolored.
        //
        // At 128 entries:
        //   - libimagequant has slots for every rare chromatic feature
        //   - dither: 0 still forces FLAT fills (no stippling)
        //   - The browser's DMC mapper + mergeDE will collapse 128→~25
        //     DMCs for the final pattern, but copper gets to survive
        //     all the way to cell-voting where the rescue overlay can
        //     protect it.
        //
        // 128 is chosen because it's the sweet spot: high enough to
        // preserve 0.1%-class rarities, low enough to keep the output
        // PNG small (libimagequant still de-duplicates perceptually).
        const targetColors = 128;
        const posterized = await sharp(flatBuf)
          .png({
            palette: true,
            colours: targetColors,
            dither: 0, // CRITICAL — no Floyd-Steinberg, flat fills only
            effort: 10, // best-quality libimagequant pass
            compressionLevel: 6,
          })
          .toBuffer();
        cleanedDataUrl = `data:image/png;base64,${posterized.toString("base64")}`;
        console.log(
          `[premium-convert] libimagequant posterize done (${targetColors} colours, no dither, ${(posterized.length / 1024).toFixed(0)}KB)`
        );
      }
    } catch (err) {
      console.warn("[premium-convert] posterize failed, using raw:", err);
    }

    const cleanupCost = COST[provider];
    const totalCost = Math.round((upscaleCost + cleanupCost) * 1000) / 1000;

    console.log(
      `[premium-convert] done · provider=${provider} · upscale=${upscaledVia} · cost≈$${totalCost.toFixed(3)}`
    );

    return NextResponse.json({
      image: cleanedDataUrl,
      model: MODEL_LABEL[provider],
      provider,
      upscaledVia,
      estimatedCost: totalCost,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[premium-convert] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
