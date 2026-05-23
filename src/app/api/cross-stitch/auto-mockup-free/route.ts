// ══════════════════════════════════════════════════════════════════════
// /api/cross-stitch/auto-mockup-free
//
// FREE local mockup generator — drop-in replacement for /auto-mockup.
// Same input/output shape, but uses Sharp to composite the user's
// pattern onto the existing room-photo backgrounds in
// public/mockup-templates/ instead of paying $0.28/listing for
// GPT-Image-2 lifestyle scenes.
//
// Use case: TEST MODE. The seller wants to rehearse the full flow
// (Convert → Export → List → Publish) repeatedly without burning $0.28
// on every iteration. The output is intentionally not photorealistic —
// it's "good enough to prove the pipeline works." For real listings,
// the seller flips Test Mode off and pays for /auto-mockup like before.
//
// Output shape matches /auto-mockup so the cross-stitch page can swap
// endpoints based on the testMode setting without any other changes:
//   { images: [{ scene, dataUrl, model }], model, requested, succeeded }
//
// Cost: $0. Time: ~1-2 seconds for 4 mockups (all done in-process via
// Sharp). No external API calls.
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import path from "node:path";
import { promises as fs } from "node:fs";

export const maxDuration = 60;
export const runtime = "nodejs";

// We reuse the room photos already shipped with the app. There are 10
// `mj_*.webp` reference photos in public/mockup-templates/ — we pick 4
// for the free mockups so the output count matches the paid endpoint's
// DEFAULT_SCENES (which also returns 4).
//
// The filenames have spaces and parens because they were originally
// downloaded as MJ outputs. We list them explicitly rather than
// readdir'ing so the test output is deterministic across runs.
const TEMPLATES_DIR = path.join(process.cwd(), "public/mockup-templates");
const SCENE_TEMPLATES: { scene: string; filename: string }[] = [
  { scene: "freeRoomScene1", filename: "mj_2 (12).webp" },
  { scene: "freeRoomScene2", filename: "mj_10 (7).webp" },
  { scene: "freeRoomScene3", filename: "mj_13 (7).webp" },
  { scene: "freeRoomScene4", filename: "mj_18 (3).webp" },
];

const OUTPUT_SIZE = 1024;       // square, matches paid endpoint
const FRAME_BORDER_PX = 28;     // white matte around the artwork
const FRAME_OUTER_RATIO = 0.42; // framed-print fills ~42% of canvas width
const FRAME_TOP_OFFSET = 0.20;  // place upper-third (mimics wall art)
const BOOKMARK_SCENES = [
  "freeBookmarkOpenBook",
  "freeBookmarkBookshelf",
  "freeBookmarkStackedBooks",
  "freeBookmarkTasselCloseup",
];

/**
 * Build one mockup: composite the supplied pattern PNG onto a room photo
 * with a thin white border so it reads as "framed art on the wall."
 *
 * We don't try to align it with the actual wall in the photo — that
 * would need per-template bounding boxes we don't have. Centered upper-
 * third placement is a reasonable visual default that doesn't look
 * obviously broken on any of our 4 picked templates.
 */
async function makeFreeMockup(
  patternBuffer: Buffer,
  templateFilename: string,
): Promise<string> {
  const templatePath = path.join(TEMPLATES_DIR, templateFilename);

  // 1. Background — the room photo, resized to a square canvas.
  //    `cover` crops to fill the square so we don't get letterbox bars.
  const background = await sharp(templatePath)
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "cover", position: "center" })
    .toBuffer();

  // 2. Framed art — pattern with a thin white matte. Sharp's `extend` is
  //    the cheapest way to add a uniform white border around the pattern.
  const frameInnerPx = Math.round(OUTPUT_SIZE * FRAME_OUTER_RATIO);
  const framedArt = await sharp(patternBuffer)
    .resize(frameInnerPx, frameInnerPx, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255 },
    })
    .extend({
      top: FRAME_BORDER_PX,
      bottom: FRAME_BORDER_PX,
      left: FRAME_BORDER_PX,
      right: FRAME_BORDER_PX,
      background: { r: 255, g: 255, b: 255 },
    })
    .png()
    .toBuffer();

  const framedSize = frameInnerPx + 2 * FRAME_BORDER_PX;
  const left = Math.round((OUTPUT_SIZE - framedSize) / 2);
  const top = Math.round(OUTPUT_SIZE * FRAME_TOP_OFFSET);

  // 3. Composite framed art onto the room photo. Output as JPEG to keep
  //    base64 size small (mockups are downstream re-encoded for Etsy
  //    upload anyway, so JPEG vs PNG doesn't matter for quality).
  const composited = await sharp(background)
    .composite([{ input: framedArt, top, left }])
    .jpeg({ quality: 85 })
    .toBuffer();

  return `data:image/jpeg;base64,${composited.toString("base64")}`;
}

async function makeFreeBookmarkMockup(
  patternBuffer: Buffer,
  scene: string,
): Promise<string> {
  const bg =
    scene === "freeBookmarkBookshelf"
      ? `<svg width="${OUTPUT_SIZE}" height="${OUTPUT_SIZE}" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#f7f5ef"/>
          <rect x="0" y="110" width="1024" height="750" fill="#fbfaf6"/>
          ${Array.from({ length: 18 }).map((_, i) => {
            const x = 42 + i * 52;
            const colors = ["#f4c7c3", "#cde7e1", "#d8c9ed", "#f1e2b7", "#c2d7c0"];
            return `<rect x="${x}" y="170" width="38" height="610" rx="8" fill="${colors[i % colors.length]}"/><rect x="${x + 14}" y="220" width="10" height="450" fill="rgba(255,255,255,0.24)"/>`;
          }).join("")}
          <rect x="0" y="790" width="1024" height="42" fill="#e8e3d7"/>
        </svg>`
      : `<svg width="${OUTPUT_SIZE}" height="${OUTPUT_SIZE}" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#f8f6f1"/>
          <path d="M145 165 C310 110 475 115 520 180 L520 845 C445 795 275 790 145 835 Z" fill="#fffdf8" stroke="#ded8c8" stroke-width="4"/>
          <path d="M520 180 C610 105 820 115 910 170 L910 835 C785 790 610 795 520 845 Z" fill="#fffdf8" stroke="#ded8c8" stroke-width="4"/>
          ${Array.from({ length: 9 }).map((_, i) => `<path d="M175 ${250 + i * 55} C285 ${230 + i * 55} 390 ${235 + i * 55} 490 ${260 + i * 55}" stroke="#d8d0bf" stroke-width="3" fill="none" opacity=".6"/>`).join("")}
          ${Array.from({ length: 9 }).map((_, i) => `<path d="M555 ${255 + i * 55} C660 ${235 + i * 55} 785 ${235 + i * 55} 880 ${260 + i * 55}" stroke="#d8d0bf" stroke-width="3" fill="none" opacity=".6"/>`).join("")}
        </svg>`;

  const background = Buffer.from(bg);
  const bookmarkW = scene === "freeBookmarkTasselCloseup" ? 330 : 260;
  const bookmarkH = scene === "freeBookmarkTasselCloseup" ? 760 : 710;
  const bookmark = await sharp({
    create: {
      width: bookmarkW,
      height: bookmarkH,
      channels: 4,
      background: { r: 247, g: 226, b: 230, alpha: 1 },
    },
  })
    .composite([
      {
        input: await sharp(patternBuffer)
          .resize(bookmarkW - 56, bookmarkH - 150, {
            fit: "contain",
            background: { r: 247, g: 226, b: 230, alpha: 0 },
          })
          .png()
          .toBuffer(),
        left: 28,
        top: 90,
      },
      {
        input: Buffer.from(`<svg width="${bookmarkW}" height="${bookmarkH}" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="4" width="${bookmarkW - 8}" height="${bookmarkH - 8}" rx="10" fill="none" stroke="#eee7df" stroke-width="8"/>
          <circle cx="${bookmarkW / 2}" cy="42" r="13" fill="#f8f6f1" stroke="#6c8f66" stroke-width="5"/>
          <path d="M${bookmarkW / 2} 56 C${bookmarkW / 2 + 80} 125 ${bookmarkW / 2 + 120} 230 ${bookmarkW / 2 + 88} 330" fill="none" stroke="#2f6f43" stroke-width="12" stroke-linecap="round"/>
          <path d="M${bookmarkW / 2 + 88} 330 L${bookmarkW / 2 + 40} 455 M${bookmarkW / 2 + 88} 330 L${bookmarkW / 2 + 95} 470 M${bookmarkW / 2 + 88} 330 L${bookmarkW / 2 + 145} 455" stroke="#2f6f43" stroke-width="10" stroke-linecap="round"/>
        </svg>`),
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toBuffer();

  const rotate = scene === "freeBookmarkStackedBooks" ? -9 : scene === "freeBookmarkBookshelf" ? 7 : -3;
  const placed = await sharp(bookmark)
    .rotate(rotate, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const meta = await sharp(placed).metadata();
  const left = scene === "freeBookmarkBookshelf" ? 380 : 350;
  const top = scene === "freeBookmarkTasselCloseup" ? 110 : 165;

  const composited = await sharp(background)
    .resize(OUTPUT_SIZE, OUTPUT_SIZE)
    .composite([
      {
        input: placed,
        left: Math.max(0, Math.round(left - (meta.width ?? bookmarkW) / 2)),
        top,
      },
    ])
    .jpeg({ quality: 88 })
    .toBuffer();

  return `data:image/jpeg;base64,${composited.toString("base64")}`;
}

export async function POST(req: NextRequest) {
  try {
    const { pattern, scenes, title, productType } = (await req.json()) as {
      pattern?: string;
      scenes?: string[];
      title?: string;
      productType?: string;
    };

    if (!pattern || typeof pattern !== "string") {
      return NextResponse.json(
        { error: "pattern (base64 data URL) is required" },
        { status: 400 },
      );
    }

    // Strip the data URL prefix if present and decode the bytes.
    const stripPrefix = (s: string) => s.replace(/^data:[^;]+;base64,/, "");
    const patternBuffer = Buffer.from(stripPrefix(pattern), "base64");
    if (patternBuffer.length < 100) {
      return NextResponse.json(
        { error: "pattern data is empty or unreadable" },
        { status: 400 },
      );
    }

    const isBookmark = /\bbook\s*-?\s*mark\b|book lover|reading/i.test(`${title ?? ""} ${productType ?? ""}`);

    if (isBookmark) {
      const requestedBookmarkScenes =
        Array.isArray(scenes) && scenes.length > 0
          ? BOOKMARK_SCENES.filter((scene) => scenes.includes(scene))
          : BOOKMARK_SCENES;

      if (requestedBookmarkScenes.length === 0) {
        return NextResponse.json(
          { error: `scenes must be a non-empty subset of: ${BOOKMARK_SCENES.join(", ")}` },
          { status: 400 },
        );
      }

      console.log(
        `[auto-mockup-free] generating ${requestedBookmarkScenes.length} free bookmark Sharp mockup(s)`,
      );

      const results = await Promise.allSettled(
        requestedBookmarkScenes.map(async (scene) => {
          const dataUrl = await makeFreeBookmarkMockup(patternBuffer, scene);
          return { scene, dataUrl, model: "test-mode-sharp-bookmark" };
        }),
      );

      const images = results
        .filter(
          (r): r is PromiseFulfilledResult<{
            scene: string;
            dataUrl: string;
            model: string;
          }> => r.status === "fulfilled",
        )
        .map((r) => r.value);

      if (images.length === 0) {
        const firstErr = results.find(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        const reason = firstErr?.reason;
        const msg =
          reason instanceof Error ? reason.message : "All free bookmark mockups failed";
        return NextResponse.json({ error: msg }, { status: 500 });
      }

      return NextResponse.json({
        images,
        model: "test-mode-sharp-bookmark",
        requested: requestedBookmarkScenes.length,
        succeeded: images.length,
      });
    }

    // Allow callers to request a subset of the 4 free scenes for parity
    // with the paid endpoint's `scenes` filter.
    const requested =
      Array.isArray(scenes) && scenes.length > 0
        ? SCENE_TEMPLATES.filter((s) => scenes.includes(s.scene))
        : SCENE_TEMPLATES;

    if (requested.length === 0) {
      return NextResponse.json(
        {
          error: `scenes must be a non-empty subset of: ${SCENE_TEMPLATES.map(
            (s) => s.scene,
          ).join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Verify the templates directory exists. If the assets were ever
    // moved, fail loudly with a useful error instead of letting Sharp
    // throw a confusing ENOENT for each scene.
    try {
      await fs.access(TEMPLATES_DIR);
    } catch {
      return NextResponse.json(
        {
          error: `Mockup templates directory not found at ${TEMPLATES_DIR}. Test mode needs the mj_*.webp files in public/mockup-templates/.`,
        },
        { status: 500 },
      );
    }

    console.log(
      `[auto-mockup-free] generating ${requested.length} free Sharp mockup(s)`,
    );

    // Process scenes in parallel — Sharp releases the JS thread during
    // libvips work, so 4 in parallel is faster than serial without
    // saturating CPU.
    const results = await Promise.allSettled(
      requested.map(async ({ scene, filename }) => {
        const dataUrl = await makeFreeMockup(patternBuffer, filename);
        return { scene, dataUrl, model: "test-mode-sharp" };
      }),
    );

    const images = results
      .filter(
        (r): r is PromiseFulfilledResult<{
          scene: string;
          dataUrl: string;
          model: string;
        }> => r.status === "fulfilled",
      )
      .map((r) => r.value);

    if (images.length === 0) {
      const firstErr = results.find(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      const reason = firstErr?.reason;
      const msg =
        reason instanceof Error ? reason.message : "All free mockups failed";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    if (rejected.length > 0) {
      console.warn(
        `[auto-mockup-free] ${rejected.length}/${results.length} scenes failed:`,
        rejected.map((r) =>
          r.reason instanceof Error ? r.reason.message : r.reason,
        ),
      );
    }

    console.log(
      `[auto-mockup-free] ${images.length}/${requested.length} succeeded`,
    );

    return NextResponse.json({
      images,
      // Echo a "model" field that makes it obvious in the browser
      // console + UI badge that the seller is in test mode.
      model: "test-mode-sharp",
      requested: requested.length,
      succeeded: images.length,
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "auto-mockup-free failed";
    console.error("[auto-mockup-free] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
