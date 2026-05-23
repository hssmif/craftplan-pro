import { NextRequest, NextResponse } from "next/server";
import {
  editImage,
  IMAGE_MODEL,
  OpenAIImageError,
} from "@/lib/openai-image";

/**
 * Flatten a user-uploaded image into a Convert-friendly source.
 *
 * Why this exists:
 *   The Design tab → Convert path runs a gpt-image-2 edit step
 *   (CLEAN_CONVERT_EDIT_PROMPT in generate-design/route.ts) before
 *   quantization, which gently de-clutters but is intentionally SOFT
 *   — it preserves subtle 1-2 tone shading and pastel character.
 *   That works for the Design-tab pipeline because the source is
 *   already a vector-style render, not a real-world image.
 *
 *   Direct uploads are different: hand-uploaded illustrations
 *   typically have FULL airbrush gradients, drop shadows, glows, and
 *   anti-aliasing that the SOFT prompt would leave intact (it would
 *   just collapse them to "1-2 stepped soft tones" — still tonally
 *   varied within a region, still confetti-bait for KMeans).
 *
 *   This route runs a STRONGER local prompt, FLATTEN_FOR_CONVERT_PROMPT,
 *   that forces every region to a SINGLE solid color (dominant hue),
 *   strips ALL shading / shadow / highlight / glow / texture, and
 *   keeps outlines untouched.  The output looks like a vector
 *   coloring-book fill — exactly what KMeans wants.
 *
 *   Why a separate prompt instead of reusing the SOFT one?
 *     - SOFT is tuned for rendered cross-stitch listing previews;
 *       leaving in 1-2 stepped tones is a feature there because
 *       the chart-render at 142px wide preserves that subtlety.
 *     - This route's input is a real upload — gradients are the
 *       PRIMARY problem, and "1-2 stepped tones" is still tonal
 *       variation within a region, which is what we need to remove.
 *     - Keeping the prompts separate lets us tune each in isolation
 *       without worrying about regressions on the other path.
 *
 *   Cost: one /v1/images/edits call at medium quality (~$0.04).
 *
 * Request:  { image: <data URL> }
 * Response: 200 { flattenedImage: <data URL>, model }
 *           400 { error }                  invalid body / not a data URL
 *           4xx/5xx { error, model }       upstream OpenAI failure (status mirrored)
 */

/**
 * Hard-flatten edit prompt for direct uploads.
 *
 * Design intent: every continuous color region collapses to a SINGLE
 * solid flat color (the region's dominant hue), with all shading /
 * shadow / glow / texture / anti-aliasing removed and the original
 * outlines kept untouched.  Result reads as vector coloring-book
 * fill — tonally uniform within each region, hard edges between
 * regions, same palette as the input but flattened.
 *
 * Defined locally (not imported) because the Design-tab's SOFT
 * prompt explicitly preserves "subtle 1-2 stepped soft tones" as a
 * charm-preservation feature, which is exactly the residual variance
 * KMeans would shred into confetti on a hand-uploaded illustration.
 */
const FLATTEN_FOR_CONVERT_PROMPT = [
  "Convert this image into a clean flat cartoon sticker illustration.",
  "STRICT COLOR RULE: preserve EVERY existing color exactly as-is —",
  "same hue, same saturation, same lightness. Do NOT shift browns to orange,",
  "do NOT add warmth or saturation. Copy each color precisely.",
  "Remove the background completely (pure white).",
  "Simplify to flat solid color fills with zero gradients, zero shading,",
  "zero texture. Clean bold outlines. Result must look like a flat vector",
  "sticker with a white background, cross-stitch ready.",
].join(" ");

// Match generate-design's edit budget — gpt-image-2 medium edits typically
// finish in 30-60s but can spike past 120s under load.  240s gives plenty
// of headroom while still ahead of the upstream Vercel function limit.
export const maxDuration = 240;
export const dynamic = "force-dynamic";

type FlattenBody = {
  image?: string; // data URL, e.g. "data:image/png;base64,iVBOR..."
};

export async function POST(req: NextRequest) {
  let body: FlattenBody;
  try {
    body = (await req.json()) as FlattenBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.image || typeof body.image !== "string") {
    return NextResponse.json(
      { error: "image required (data URL)" },
      { status: 400 },
    );
  }

  // Decode data URL → raw bytes.  editImage() builds multipart/form-data
  // for /v1/images/edits which requires actual image bytes, not a base64
  // string.  Same shape as generate-design step 2 (route.ts:542-545).
  if (!body.image.startsWith("data:")) {
    return NextResponse.json(
      { error: "image must be a data: URL" },
      { status: 400 },
    );
  }
  const commaIdx = body.image.indexOf(",");
  if (commaIdx < 0) {
    return NextResponse.json(
      { error: "malformed data URL (missing comma)" },
      { status: 400 },
    );
  }
  const header = body.image.slice(5, commaIdx); // strip "data:" → "image/png;base64"
  const b64 = body.image.slice(commaIdx + 1);
  const mimeType = header.split(";", 1)[0] || "image/png";
  const ext = mimeType.includes("png")
    ? "png"
    : mimeType.includes("webp")
      ? "webp"
      : "jpg";

  let buffer: Buffer;
  try {
    buffer = Buffer.from(b64, "base64");
  } catch {
    return NextResponse.json(
      { error: "image base64 decode failed" },
      { status: 400 },
    );
  }
  if (buffer.length === 0) {
    return NextResponse.json(
      { error: "image payload empty" },
      { status: 400 },
    );
  }

  try {
    console.log(
      `[flatten-for-convert] editing ${buffer.length} bytes (${mimeType}) → flat-vector source...`,
    );
    const result = await editImage({
      images: [
        {
          buffer,
          mimeType,
          filename: `upload.${ext}`,
        },
      ],
      prompt: FLATTEN_FOR_CONVERT_PROMPT,
      quality: "medium",
      size: "1024x1024",
      caller: "cross-stitch/flatten-for-convert",
    });

    return NextResponse.json({
      flattenedImage: result.dataUrl,
      model: result.model,
    });
  } catch (err) {
    if (err instanceof OpenAIImageError) {
      // Mirror upstream HTTP status (429 rate-limit, 400 bad request,
      // 502 no-image, etc.) so the UI can distinguish failure modes.
      return NextResponse.json(
        { error: err.message, model: err.model },
        { status: err.status },
      );
    }
    const msg = err instanceof Error ? err.message : "flatten failed";
    console.error("[flatten-for-convert] failed:", msg);
    return NextResponse.json(
      { error: msg, model: IMAGE_MODEL },
      { status: 500 },
    );
  }
}
