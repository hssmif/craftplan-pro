import { NextRequest, NextResponse } from "next/server";
import { editImage, OpenAIImageError } from "@/lib/openai-image";

// Generate photorealistic LIFESTYLE mockups from just a rendered cross-stitch
// pattern (no frame upload required). Uses OpenAI's image-edits endpoint
// via the shared helper (model centralized in @/lib/openai-image) to place
// the supplied pattern inside a generated lifestyle scene — hand-held hoop,
// tabletop with flowers, flat-lay with petals, etc.
//
// This gives the listing the same hero-photo look that top Etsy shops use
// (Nala&Stitch, HappySlothPatterns) without the seller ever leaving the tool.
//
// Input:  { pattern: base64 data URL of rendered preview, scenes?: string[] }
// Output: { images: [{ scene, dataUrl }] }

export const maxDuration = 300;

const SCENE_PROMPTS: Record<string, string> = {
  hand: `A woman's hand with a soft manicured fingernail holding a round wooden
embroidery hoop at eye level, showing the supplied cross-stitch PATTERN
stretched inside the hoop on clean white aida cloth. The silver tightening
screw sits at the top of the hoop. Background: blurry cozy bedroom with
pastel pink pillows, a green trailing plant, soft warm window light,
dreamy bokeh. Shot on an 85mm lens, shallow depth of field.`,
  tabletop: `A round wooden embroidery hoop standing on a light oak tabletop,
displaying the supplied cross-stitch PATTERN on clean white aida cloth. To
the right, a clear glass vase holds a fresh bouquet of pale pink roses,
yellow daisies, lavender stems, and fern leaves. Behind: a blurry sage-green
sofa with a pink pillow, plants, soft afternoon window light. Natural,
lifestyle product photography.`,
  flatlay: `An overhead flat-lay on smooth light-pine wood planks. In the
center, a round wooden embroidery hoop holds the supplied cross-stitch
PATTERN on white aida cloth. Scattered around the hoop: pink roses, cream
daisies, purple lavender sprigs, green fern fronds, small white chamomile
flowers. Soft natural daylight from above. Etsy lifestyle photo style.`,
  wall: `A round wooden embroidery hoop hanging on a neutral cream-painted
wall, displaying the supplied cross-stitch PATTERN on white aida cloth.
Below: a small wooden shelf with a tiny potted succulent and a candle.
Soft morning light from the left. Cozy home decor, shallow depth of field.`,
};

export async function POST(req: NextRequest) {
  try {
    const { pattern, scenes } = (await req.json()) as {
      pattern: string;
      scenes?: string[];
    };
    if (!pattern) {
      return NextResponse.json(
        { error: "pattern (base64 data URL) is required" },
        { status: 400 }
      );
    }

    const requestedScenes =
      Array.isArray(scenes) && scenes.length > 0
        ? scenes.filter((s) => s in SCENE_PROMPTS)
        : ["hand", "tabletop", "flatlay"];

    const stripPrefix = (s: string) => s.replace(/^data:[^;]+;base64,/, "");
    const patternBuf = Buffer.from(stripPrefix(pattern), "base64");

    // Run scenes in parallel — each image edit takes ~25-45s, so parallel
    // cuts total wait to ~45s instead of 2+ minutes.
    //
    // Rate-limit caveat: Tier-1 OpenAI accounts get 5 images/minute on
    // gpt-image-2. 3 parallel calls fit comfortably; 4+ may 429 on a
    // freshly-verified org until usage auto-ramps to Tier 2.
    const results = await Promise.allSettled(
      requestedScenes.map(async (sceneKey) => {
        const { dataUrl } = await editImage({
          images: [
            {
              buffer: patternBuf,
              mimeType: "image/png",
              filename: "pattern.png",
            },
          ],
          prompt: `Use the provided PATTERN image as the exact design that is stitched
inside the embroidery hoop. Preserve its colors, symbols, and proportions —
do NOT redraw, restyle, or crop it. Produce a single photorealistic
lifestyle product photo:\n\n${SCENE_PROMPTS[sceneKey]}\n\nThe stitched
cross-stitch texture must be visible (individual X stitches on aida cloth
weave, soft 3D relief under each stitch), not a flat print. Do not add
text, watermarks, logos, or extra objects beyond what's described.`,
          quality: "high",
          size: "1024x1024",
          timeoutMs: 280_000,
          caller: `gpt-lifestyle/${sceneKey}`,
        });
        return { scene: sceneKey, dataUrl };
      })
    );

    const images = results
      .filter(
        (r): r is PromiseFulfilledResult<{ scene: string; dataUrl: string }> =>
          r.status === "fulfilled"
      )
      .map((r) => r.value);

    if (images.length === 0) {
      const firstErr = results.find(
        (r): r is PromiseRejectedResult => r.status === "rejected"
      );
      const reason = firstErr?.reason;
      // Preserve upstream status when every scene failed with the same
      // OpenAIImageError (e.g. 403 for unverified-org gpt-image-2, or 429
      // for rate limit). Falls back to 502 for mixed/unknown failures.
      const status =
        reason instanceof OpenAIImageError ? reason.status : 502;
      const msg =
        reason instanceof Error ? reason.message : "All scenes failed";
      return NextResponse.json({ error: msg }, { status });
    }

    return NextResponse.json({ images });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "gpt-lifestyle failed";
    console.error("[gpt-lifestyle] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
