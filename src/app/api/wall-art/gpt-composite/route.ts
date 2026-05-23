import { NextRequest, NextResponse } from "next/server";
import { editImage, OpenAIImageError } from "@/lib/openai-image";

// Composite a finished cross-stitch pattern INTO the fabric opening of an
// uploaded mockup frame, using OpenAI's image-edits endpoint (multi-image
// input) via the shared helper. This gives us perfect positioning,
// perspective, and lighting matching — no hand-rolled canvas math needed.
//
// Model: centralized via @/lib/openai-image (IMAGE_MODEL constant).
//
// Inputs:  frame = base64 PNG/JPG of the mockup (frame on a scene)
//          pattern = base64 PNG of the rendered cross-stitch preview
// Output: base64 data URL of the composited mockup

export const maxDuration = 120;

const COMPOSITE_PROMPT = `You will receive TWO images:
  1. FRAME: a real-life photo that may show an embroidery hoop, picture
     frame, or similar display — possibly held by a hand, resting on a
     wood table next to a flower vase, as a flat-lay surrounded by
     pressed flowers/leaves, or mounted on a wall. It has an empty fabric
     surface inside (white/cream aida cloth).
  2. PATTERN: a finished cross-stitch design rendered on aida cloth.

Your task: produce a SINGLE photorealistic LIFESTYLE image — the kind
top Etsy shops use as their hero photo — that shows the FRAME holding
the PATTERN as if it were really stitched and displayed.

REALISM RULES (critical — buyers can tell when it looks fake):
- Keep the FRAME scene COMPLETELY UNCHANGED outside the fabric opening:
  same hand (skin tone, manicured nails, fingernails visible), same
  flowers (roses, daisies, lavender stems), same wood grain on the
  table, same background blur, same window light, same pillows/shelves.
  Pixel-identical outside the fabric opening.
- Replace ONLY the fabric area inside the hoop/frame opening with the
  PATTERN. Preserve the wooden hoop ring, the silver tightening screw
  at the top, any fabric overhang behind the hoop.
- Follow the frame's perspective, curvature, and depth precisely — if
  it's a circular wooden hoop, the pattern follows the exact circle
  with no rectangular edges poking out; the aida cloth behind the hoop
  drapes slightly with natural wrinkles.
- Match the scene's lighting EXACTLY: warm afternoon light, soft
  shadows from plants/vases, subtle bokeh on the background. The
  stitched fabric should catch the same highlights and shadows as the
  original hoop fabric did.
- The stitched cross-stitch texture must be visible: individual X
  stitches on aida cloth weave, slight 3D relief (shadows under each
  stitch), NOT flat printed artwork.
- Preserve the pattern's exact colors, symbols-as-stitches, and
  proportions. Do not redraw, crop, restyle, or add details not in
  the PATTERN.

SCENE TYPES this prompt supports — detect which one the FRAME shows
and preserve it faithfully:
  a) HAND-HELD HOOP: a woman's hand (visible fingers + one manicured
     fingernail) holding the hoop at its edge, blurry cozy bedroom /
     living-room background with plants and pastel pillows.
  b) TABLETOP with VASE: hoop standing on a light-wood table next to
     a fresh flower bouquet (pink roses, yellow daisies, lavender,
     eucalyptus) in a clear glass vase, blurry sofa + plants behind.
  c) FLAT-LAY: hoop laid flat on light wood, surrounded by scattered
     roses, daisies, ferns, lavender sprigs. Overhead shot.
  d) WALL-MOUNTED: hoop hanging on a painted wall with decor nearby.

NEVER ADD:
- text, watermarks, logos, borders, captions
- extra frames, duplicate hoops, price tags
- cartoon elements or digital filters
- a different pattern than the one supplied

Output a single finished photo at the same aspect ratio as the FRAME,
indistinguishable from a real Etsy product photo.`;

export async function POST(req: NextRequest) {
  try {
    const { frame, pattern } = await req.json();
    if (!frame || !pattern) {
      return NextResponse.json(
        { error: "frame and pattern (base64 data URLs) are required" },
        { status: 400 }
      );
    }

    const stripPrefix = (s: string) => s.replace(/^data:[^;]+;base64,/, "");
    const frameBuf = Buffer.from(stripPrefix(frame), "base64");
    const patternBuf = Buffer.from(stripPrefix(pattern), "base64");

    try {
      // Multi-image input: the helper auto-routes to "image[]" field name
      // when more than one image is supplied (OpenAI's multi-input shape).
      const { dataUrl } = await editImage({
        images: [
          { buffer: frameBuf, mimeType: "image/png", filename: "frame.png" },
          {
            buffer: patternBuf,
            mimeType: "image/png",
            filename: "pattern.png",
          },
        ],
        prompt: COMPOSITE_PROMPT,
        quality: "high",
        size: "1024x1024",
        timeoutMs: 110_000,
        caller: "gpt-composite",
      });
      return NextResponse.json({ image: dataUrl });
    } catch (err) {
      // Passthrough upstream status (429/403/etc) so the UI can
      // distinguish retryable vs fatal failures.
      if (err instanceof OpenAIImageError) {
        return NextResponse.json(
          { error: err.message },
          { status: err.status }
        );
      }
      throw err;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "GPT composite failed";
    console.error("[gpt-composite] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
