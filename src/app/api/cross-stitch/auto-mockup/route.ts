import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { editImage, OpenAIImageError } from "@/lib/openai-image";

// Auto-generate 4 photorealistic mockups per click as pure GPT scenes:
//
//   • 2 × random FRAME scenes — picked from a pool of 8 frame/hoop
//     styles (round hoop, oval gold, rope border, pastel, boho jute,
//     etc.).  GPT invents the entire scene from scratch: the frame
//     shape, material, wall/surface, props, and lighting.  Variety
//     comes from the random pick, so every button press gives a fresh
//     combination.  No template photo files are required on disk.
//
//   • 2 × fixed LIFESTYLE scenes — a hands-mid-stitch close-up and
//     a cosy lap shot.  Always run because they tested as the highest-
//     engagement Etsy gallery angles.
//
// All 4 calls are pure text-to-image: the padded pattern chart is the
// single source image, and GPT synthesises the rest from scratch.
//
// Input:  { pattern: base64 data URL of the finished-look render }
// Output: { images: [{ scene, dataUrl, model }] }
//
// Cost: ~$0.07 per call × 4 = ~$0.28 per click.
// Time: ~30-60 seconds (4 in parallel on gpt-image-2).

// 600 s = 10 min — worst case is pass-1 (~2.5 min) + 30 s + pass-2 (~2.5 min)
// + 60 s + pass-3 (~2.5 min) = ~8 min, leave a buffer.
export const maxDuration = 600;
export const runtime = "nodejs";

const AUTO_MOCKUP_MODEL = "gpt-image-2";

// ── Frame/hoop scene pool ────────────────────────────────────────────
// 8 distinct aesthetics.  2 are picked randomly per click so the
// listing photos look fresh every time.  Each prompt is a pure scene
// description — the makeSceneMockup preamble establishes that the
// source image is a cross-stitch chart to be re-rendered as embroidery,
// so these prompts only need to describe WHERE to place the stitched
// result.  The 55–65% scale rule and NO-CROP mandate are mandatory
// guards included in every prompt.
const FRAME_SCENES: Record<string, string> = {

  roundHoopNaturalLinen: `The stitched design sits inside a round natural unvarnished wooden embroidery hoop (approx 20 cm diameter). Centre the design at 55–65% of the hoop's inner diameter — bare ivory aida cloth must be visible around all sides before the wood ring. The hoop rests on a flat natural linen surface. Nearby props: two or three loose skeins of coloured embroidery thread and a small pair of craft scissors. Soft even daylight from slightly above. Photorealistic product photo.`,

  ovalGoldOrnateWall: `The stitched design sits inside an ornate oval frame with carved leaf-and-floral border details and a warm antique gold finish. Centre the design at 55–65% of the frame interior — bare ivory aida cloth visible on all sides. The frame hangs centred on a soft white plaster wall and casts a gentle shadow. Warm gallery lighting from slightly above. Photorealistic product photo.`,

  roundYellowRopeFrame: `The stitched design sits inside a round decorative frame with a thick mustard-yellow twisted rope border. Centre the design at 55–65% of the frame interior — bare ivory aida cloth visible around all sides. The frame hangs on a soft grey wood-panelled wall. Clean bright lifestyle lighting. Photorealistic product photo.`,

  vintageOvalDistressedShelf: `The stitched design sits inside a vintage oval frame with a distressed cream-painted wood finish and a subtle scalloped inner border. Centre the design at 55–65% of the frame interior — bare ivory aida cloth visible on all sides. The frame rests on a weathered rustic wooden shelf. Nearby: a small dried flower sprig and a ceramic tea-light holder. Warm soft afternoon window light. Photorealistic product photo.`,

  bambooHoopShelfStyling: `The stitched design sits inside a round bamboo embroidery hoop hanging on a neutral warm-beige wall. Centre the design at 55–65% of the hoop interior — bare cream aida cloth visible around all sides. Below: a minimal wooden floating shelf with a small trailing potted plant and two neutral-spine books. Soft natural diffused daylight. Photorealistic product photo.`,

  modernBlackFrameMinimal: `The stitched design sits inside a sleek round frame with a matte black minimalist border. Centre the design at 55–65% of the frame interior — bare ivory aida cloth visible on all sides. The frame is mounted on a bright white wall — clean gallery-style composition. The stitched design is the sole focal point. Even neutral studio lighting. Photorealistic product photo.`,

  pastelPinkHoopFlatlay: `The stitched design sits inside a round embroidery hoop with a soft pastel pink painted wooden ring. Centre the design at 55–65% of the hoop interior — bare ivory aida cloth visible around all sides. The hoop is laid flat on a pale pink linen cloth. Nearby: a small spool of pale pink thread and a few pearl buttons. Soft dreamy overhead lighting. Photorealistic product photo.`,

  rusticJuteBohoWall: `The stitched design sits inside a round embroidery hoop with a natural jute-wrapped ring border, hanging on a warm terracotta clay-toned wall. Centre the design at 55–65% of the hoop interior — bare cream aida cloth visible around all sides. Boho aesthetic, warm ambient light, slight organic texture in the clay wall. Photorealistic product photo.`,
};

// ── Lifestyle scene pool ─────────────────────────────────────────────
// Both always run — conversion-tested as the highest-engagement angles.
const LIFESTYLE_SCENES: Record<string, string> = {

  handsStitching: `A close-up photograph from a top-down, slightly angled perspective:
a woman's hands mid-stitch on the supplied cross-stitch PATTERN. Her
left hand gently holds a round wooden embroidery hoop containing the
pattern stretched on ivory aida cloth; her right hand has just pulled
a threaded embroidery needle up through the fabric, with the working
thread visible trailing from the needle. Soft natural skin tones,
unvarnished fingernails, no jewelry. Background: slightly blurry cozy
home — warm-knit blanket or soft wooden tabletop. Daylight window light
from the left, shallow depth of field, cozy authentic lifestyle.
The stitched PATTERN must be clearly the focal point — fully visible,
tack-sharp, faithful to the supplied image colors and design.`,

  lapCozy: `A photograph from a slightly-angled over-the-lap perspective:
a woman seated on a cozy couch wearing a chunky cream-knit sweater,
with the supplied cross-stitch PATTERN stretched in a round wooden
embroidery hoop resting on her lap. One hand rests near the hoop,
the other holds a threaded embroidery needle partway through a stitch.
The PATTERN is clearly the focal point — show the full design,
all colors faithful to the supplied image. Warm afternoon window light,
soft blurry background (sage cushion or trailing plant). Authentic
cozy "Sunday afternoon making something beautiful" mood.`,
};

// Bookmark products need a completely different gallery. A bookmark
// should never be shown in a hoop/frame; it should read as a finished,
// long stitched textile bookmark with a tassel, held near books or placed
// inside an open book.
const BOOKMARK_SCENES: Record<string, string> = {
  bookmarkBookshelfHand: `A photorealistic Etsy product photo of a finished hand-stitched cross-stitch BOOKMARK held gently in one hand in front of a softly blurred bookshelf with pastel book spines. The supplied design is adapted onto a tall narrow rectangular aida-cloth bookmark, not a hoop and not a framed picture. Include neat stitched edging, a small punched top hole, and a visible cotton tassel hanging from the top. The full bookmark is visible from top to bottom, with the stitched motif centered along the long bookmark shape. Soft natural daylight, shallow depth of field, premium handmade-bookish aesthetic.`,

  bookmarkOpenBook: `A photorealistic close-up of a finished hand-stitched cross-stitch BOOKMARK lying inside an open novel. The bookmark is a tall narrow strip of aida cloth with finished edges and a tassel draped across the page. The supplied design is embroidered onto the bookmark fabric, adapted vertically so the complete motif is visible. No hoop, no wall frame, no oval frame. Clean white book pages, soft daylight, cozy reading aesthetic, Etsy listing quality.`,

  bookmarkStackedBooks: `A photorealistic flat-lay product photo of a finished hand-stitched cross-stitch BOOKMARK placed across a small stack of hardcover books. The bookmark is a long narrow aida-cloth textile with a stitched border, visible fabric texture, and a tassel. Preserve the supplied design's colors and main subject, arranged as a bookmark layout. Nearby props: neutral linen, a small cup of tea, and one soft flower sprig. No hoop or frame. Bright premium handmade product photography.`,

  bookmarkDetailTassel: `A photorealistic macro-style product photo focused on a finished stitched BOOKMARK partly tucked between book pages. Show the top hole and tassel clearly, with the bookmark fabric lying flat on the open book. The supplied motif appears as real raised X-stitches on the long bookmark. No embroidery hoop, no picture frame, no wall art. Crisp textile detail, visible aida weave, cozy book-lover gift aesthetic.`,
};

// ── Helpers ──────────────────────────────────────────────────────────

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// Pad the pattern with an ivory aida-coloured margin before sending to
// gpt-image-2.  The ivory border gives GPT breathing room so it can't
// crop edge details (feet, tail tips, accessories) and reads the margin
// as mounted aida cloth rather than empty space to zoom into.
// 40% on each side → the design occupies ~36% of the padded area.
async function padPatternBuffer(buf: Buffer, padFraction = 0.40): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 1024;
  const padX = Math.round(w * padFraction);
  const padY = Math.round(h * padFraction);
  return sharp(buf)
    .extend({
      top: padY, bottom: padY, left: padX, right: padX,
      background: { r: 245, g: 240, b: 228, alpha: 1 },
    })
    .png()
    .toBuffer();
}

// Generate one scene mockup: send the padded pattern as the sole source
// image plus the scene prompt.  GPT synthesises the full background,
// frame, lighting, and props from scratch.
async function makeSceneMockup(
  patternBuf: Buffer,
  sceneKey: string,
  scenePrompt: string,
  isBookmark: boolean,
) {
  const productInstruction = isBookmark
    ? `The provided PATTERN image is source art for a cross-stitch BOOKMARK. Re-render it as genuine hand-embroidered cross-stitch on a tall narrow rectangular aida-cloth bookmark. Preserve the subject, colors, and important details, but adapt the composition vertically for a bookmark if needed. The finished object must look like a real stitched fabric bookmark with finished edges and a tassel, NOT a hoop, NOT a framed picture, NOT a wall hanging.`
    : `The provided PATTERN image is a cross-stitch chart. Re-render it as genuine hand-embroidered cross-stitch on aida cloth — individual X-stitches visible, soft 3D thread relief, aida grid between stitches. Preserve exact colours, composition, and proportions. NOT flat, printed, or sticker-like.`;

  const { dataUrl, model } = await editImage({
    images: [
      { buffer: patternBuf, mimeType: "image/png", filename: "pattern.png" },
    ],
    prompt: `${productInstruction}

${scenePrompt}

CRITICAL: The ENTIRE stitched product must be fully visible — do NOT crop, zoom in, or show only part of the design. ${isBookmark ? "The bookmark must be visibly long and narrow, with a book/book-page/bookshelf context and a tassel." : "The complete subject (head, body, accessories) must appear in the image."}`,
    model: AUTO_MOCKUP_MODEL,
    quality: "medium",
    size: "1024x1024",
    timeoutMs: 280_000,
    caller: `auto-mockup/${sceneKey}`,
  });
  if (model !== AUTO_MOCKUP_MODEL) {
    throw new OpenAIImageError(
      `expected ${AUTO_MOCKUP_MODEL}, got ${model}`,
      500,
      model,
    );
  }
  return { scene: sceneKey, dataUrl, model };
}

// ── Route handler ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { pattern, title, productType } = (await req.json()) as {
      pattern?: string;
      title?: string;
      productType?: string;
    };

    if (!pattern || typeof pattern !== "string") {
      return NextResponse.json(
        { error: "pattern (base64 data URL) is required" },
        { status: 400 },
      );
    }

    const stripPrefix = (s: string) => s.replace(/^data:[^;]+;base64,/, "");
    const rawPatternBuf = Buffer.from(stripPrefix(pattern), "base64");
    if (rawPatternBuf.length < 100) {
      return NextResponse.json(
        { error: "pattern data is empty or unreadable" },
        { status: 400 },
      );
    }

    // All scene types use the padded buffer — ivory margin prevents
    // GPT from zooming in and cropping edge details.
    const paddedPatternBuf = await padPatternBuffer(rawPatternBuf);
    const isBookmark = /\bbook\s*-?\s*mark\b|book lover|reading/i.test(`${title ?? ""} ${productType ?? ""}`);

    const allScenes: Array<{ key: string; prompt: string }> = isBookmark
      ? Object.entries(BOOKMARK_SCENES).map(([key, prompt]) => ({ key, prompt }))
      : [
          ...pickRandom(Object.keys(FRAME_SCENES), 2).map((key) => ({ key, prompt: FRAME_SCENES[key] })),
          ...Object.keys(LIFESTYLE_SCENES).map((key) => ({ key, prompt: LIFESTYLE_SCENES[key] })),
        ];

    console.log(
      `[auto-mockup] starting ${allScenes.length} ${isBookmark ? "bookmark" : "hoop/frame"} mockups on ${AUTO_MOCKUP_MODEL}: ` +
        allScenes.map((s) => s.key).join(", "),
    );

    const TARGET_COUNT = allScenes.length; // 4

    // Run a batch of scenes in parallel; return successes + the
    // scenes that need to be retried.  Per-call retry (5s+15s on 5xx)
    // is already inside makeSceneMockup → editImage → withTransientRetry.
    // This BATCH retry handles the case where OpenAI is degraded longer
    // than the per-call backoff (e.g. 520s for a full minute).
    const runBatch = async (
      scenes: Array<{ key: string; prompt: string }>,
    ): Promise<{
      images: Array<{ scene: string; dataUrl: string; model: string }>;
      failed: Array<{ key: string; prompt: string; reason: unknown }>;
    }> => {
      const tasks = scenes.map((s) =>
        makeSceneMockup(paddedPatternBuf, s.key, s.prompt, isBookmark),
      );
      const settled = await Promise.allSettled(tasks);
      const images = settled
        .filter((r): r is PromiseFulfilledResult<{ scene: string; dataUrl: string; model: string }> => r.status === "fulfilled")
        .map((r) => r.value);
      const failed = settled
        .map((r, i) => ({ r, scene: scenes[i] }))
        .filter((x) => x.r.status === "rejected")
        .map((x) => ({
          key: x.scene.key,
          prompt: x.scene.prompt,
          reason: (x.r as PromiseRejectedResult).reason,
        }));
      return { images, failed };
    };

    const images: Array<{ scene: string; dataUrl: string; model: string }> = [];

    // Pass 1 — all 4 in parallel.
    const first = await runBatch(allScenes);
    images.push(...first.images);
    let lastFailed = first.failed;

    // Pass 2 — if any failed (typically OpenAI 520/524 for ~1 min), wait
    // 30 s and retry just the failed scenes.
    if (lastFailed.length > 0) {
      console.warn(
        `[auto-mockup] pass-1: ${lastFailed.length}/${TARGET_COUNT} failed — retrying in 30s`,
      );
      await new Promise((r) => setTimeout(r, 30_000));
      const second = await runBatch(lastFailed.map((f) => ({ key: f.key, prompt: f.prompt })));
      images.push(...second.images);
      lastFailed = second.failed;
    }

    // Pass 3 — one more retry after a longer cooldown for longer outages.
    if (lastFailed.length > 0) {
      console.warn(
        `[auto-mockup] pass-2: ${lastFailed.length}/${TARGET_COUNT} still failing — final retry in 60s`,
      );
      await new Promise((r) => setTimeout(r, 60_000));
      const third = await runBatch(lastFailed.map((f) => ({ key: f.key, prompt: f.prompt })));
      images.push(...third.images);
      lastFailed = third.failed;
    }

    if (lastFailed.length > 0) {
      console.error(
        `[auto-mockup] still missing ${lastFailed.length}/${TARGET_COUNT} after 3 passes:`,
        lastFailed.map((f) => (f.reason instanceof Error ? f.reason.message : String(f.reason)).slice(0, 120)),
      );
    }

    if (images.length === 0) {
      const reason = first.failed[0]?.reason;
      const status = reason instanceof OpenAIImageError ? reason.status : 502;
      const msg = reason instanceof Error ? reason.message : "All mockup tasks failed";
      return NextResponse.json({ error: msg }, { status });
    }

    console.log(
      `[auto-mockup] ${images.length}/${TARGET_COUNT} succeeded on ${AUTO_MOCKUP_MODEL}`,
    );

    return NextResponse.json({
      images,
      model: AUTO_MOCKUP_MODEL,
      requested: TARGET_COUNT,
      succeeded: images.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "auto-mockup failed";
    console.error("[auto-mockup] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
