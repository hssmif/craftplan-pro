import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { editImage, OpenAIImageError } from "@/lib/openai-image";

// Render the source image as a FINISHED cross-stitch piece on aida fabric.
// This is the "listing hero" preview that replaces/augments the
// quantizer-rendered chart in the UI.
//
// Model: centralized via @/lib/openai-image (IMAGE_MODEL constant). As of
// 2026-04-22 that's gpt-image-2 — this route was the canary for the
// gpt-image-1 → gpt-image-2 rollout; remaining routes migrate next.
//
// Cost: ~$0.04/image (quality: medium). Takes 20-40 seconds.

export const maxDuration = 120;

const RENDER_PROMPT = `Render this illustration as a REAL FINISHED CROSS-STITCH EMBROIDERY PIECE on cream-colored aida fabric.

WHAT IT MUST LOOK LIKE:
- Visible individual X-shaped stitches in DMC embroidery thread, arranged on a regular grid.
- The aida fabric showing through between and inside every stitch — tiny regular dots of cream fabric texture.
- Each subject area is built from clusters of X-stitches forming the shape, just like a real stitched piece.
- Thread has soft fiber texture and gentle sheen — not flat vector, not watercolor.
- Flowers are small clusters of 2-6 X-stitches.

GRID ALIGNMENT (CRITICAL — this is what makes the preview match the real chart):
- Every stitch sits in a SQUARE CELL on a mechanical, regular grid. Cells do not shift, drift, or wobble.
- A straight VERTICAL line in the source (e.g. a flower stem) must become a perfectly vertical COLUMN of stitches — every stitch in the line in the SAME column, stacked directly above/below each other. No zigzag between columns. No "handmade wobble". No diagonal drift.
- A straight HORIZONTAL line must stay in one ROW. No vertical drift.
- A diagonal line steps by exactly one cell per stitch in a consistent direction — no irregular steps.
- Artistic variation in thread COLOR, sheen, and fiber texture is welcomed.
- Artistic variation in stitch POSITION is forbidden — the grid is mechanical and must look exactly like the original chart.

LINE THICKNESS (CRITICAL — match the source exactly, do not thicken):
- A thin hairline stem in the source (roughly 1 pixel wide relative to the illustration) must be rendered as EXACTLY ONE COLUMN of stitches. One cell wide. Not two. Not three.
- A medium stem (2-3 px wide) → 2 cells wide max.
- A thick stem (5+ px wide) → 3+ cells wide.
- NEVER "double up" or "pad out" a thin line to give it visual presence. If the source stem is hairline-thin, the output stem must also be hairline-thin (a single column of X-stitches). Thin single-column stems are a valid, desirable, authentic cross-stitch look — many top Etsy patterns use exactly this for delicate botanical stems.
- Measure the source line width. Count the stitch columns in your output. They must match proportionally.

STYLE REFERENCE: Premium Etsy cross-stitch listing photograph. Think "finished cross-stitch embroidery on aida, high-detail, daylight photograph — but with the stitch grid as geometrically regular as a real counted-cross-stitch piece would be".

RULES:
- Preserve the original composition, subject, pose, and colors exactly.
- Background: clean cream aida fabric (NOT white paper). Subtle visible weave/fabric grid.
- No frame, no hoop, no hand, no text, no watermark. Just the stitched piece filling the canvas.
- Square 1:1 composition.

Output: a single high-quality photographic-style PNG of the finished cross-stitch piece.`;

// Allow-list of models the client may request. Anything else → 400.
// This stays explicit (not a string pass-through) so the browser can't
// aim the endpoint at arbitrary model IDs — keeps the cost surface tight.
const ALLOWED_MODELS = new Set(["gpt-image-1", "gpt-image-2"]);

export async function POST(req: NextRequest) {
  try {
    const { image, model: modelOverride } = (await req.json()) as {
      image?: string;
      model?: string;
    };
    if (!image) {
      return NextResponse.json({ error: "image required" }, { status: 400 });
    }
    if (modelOverride !== undefined && !ALLOWED_MODELS.has(modelOverride)) {
      return NextResponse.json(
        { error: `model must be one of: ${[...ALLOWED_MODELS].join(", ")}` },
        { status: 400 }
      );
    }

    const dataUrlMatch = image.match(/^data:([^;]+);base64,(.*)$/);
    const base64 = dataUrlMatch ? dataUrlMatch[2] : image;
    const rawBuffer = Buffer.from(base64, "base64");

    // Normalize to a clean RGBA PNG at 1024x1024 so OpenAI's edits endpoint
    // never chokes on weird color modes, palette PNGs, CMYK JPEGs, etc.
    // The image models require a standard RGBA PNG.
    const imageBuffer = await sharp(rawBuffer)
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: false })
      .ensureAlpha()
      .png()
      .toBuffer();

    try {
      const { dataUrl, model } = await editImage({
        images: [
          {
            buffer: imageBuffer,
            mimeType: "image/png",
            filename: "source.png",
          },
        ],
        prompt: RENDER_PROMPT,
        quality: "medium",
        size: "1024x1024",
        timeoutMs: 120_000,
        caller: "render-preview",
        model: modelOverride,
      });
      return NextResponse.json({ image: dataUrl, model });
    } catch (err) {
      // Pass through the upstream status when we have it (rate-limit 429,
      // bad-request 400, etc.) so the UI can distinguish retryable vs
      // fatal errors instead of seeing a generic 500 for everything.
      if (err instanceof OpenAIImageError) {
        return NextResponse.json(
          { error: err.message },
          { status: err.status }
        );
      }
      throw err;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[render-preview] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
