import { NextRequest, NextResponse } from "next/server";
import { mkdir, readFile, rm } from "fs/promises";
import path from "path";
import {
  generateListingVideo,
  type VideoPatternData,
  type LifestyleMode,
} from "@/lib/listing-video";

// Generate the 12s square MP4 that gets uploaded to Etsy alongside the
// images + PDF during the one-click publish flow. The browser calls this
// from listOnEtsy() in src/app/cross-stitch/page.tsx right after image
// uploads and before PDF generation.
//
// Why this lives server-side: the video pipeline shells out to ffmpeg
// and renders with sharp. Both are heavy/native and can't run in the
// browser; the browser only orchestrates + streams the final mp4 up
// to Etsy.
//
// ffmpeg takes ~30-60 seconds for an 8-frame montage. Bumping Next's
// serverless timeout to the max so render doesn't get killed mid-flight
// on a first-time machine with a cold sharp/ffmpeg.
export const maxDuration = 300;
// Force node runtime — ffmpeg via execFile needs it (edge has no child_process).
export const runtime = "nodejs";

// Allow-list which lifestyle modes the client can request. Keeping it
// explicit so a stray "lifestyleMode: 'ai'" doesn't silently try to
// reach a clip that doesn't exist yet.
const ALLOWED_MODES: ReadonlySet<LifestyleMode> = new Set(["free", "none"]);

interface PostBody {
  patternName?: string;
  pattern?: VideoPatternData;
  /** Data URL or bare base64 of the gpt-image-2 finished-look render. */
  finishedImage?: string;
  /** Per-listing photoreal lifestyle mockups (the 4 GPT scenes from
   *  /api/cross-stitch/auto-mockup). Each entry is a data URL or bare
   *  base64 PNG. When supplied, the video becomes mockup-driven —
   *  cinematic ken-burns over the actual product mid-stitch instead of
   *  a generic text slideshow. Etsy's listing-video guidance says to
   *  show the product being made or in use, and these are the only
   *  frames in the pipeline that satisfy that bar. */
  mockups?: string[];
  lifestyleMode?: LifestyleMode;
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  let workDir: string | null = null;

  try {
    const body = (await req.json()) as PostBody;
    const {
      patternName,
      pattern,
      finishedImage,
      mockups,
      // Default "none" — every frame of the video must be derived from
      // the specific pattern being listed, not a generic stock clip.
      // The old default was "free" which spliced in a shared Pexels
      // hand-stitching montage; that made every listing video identical
      // in the middle section and showed someone else's stitches where
      // buyers expect the actual product. See the matching comment in
      // cross-stitch/page.tsx's listOnEtsy() call site.
      lifestyleMode = "none",
    } = body;

    // Shape validation. The video renderer dereferences grid[y][x] so an
    // empty grid would crash mid-render with a confusing "cannot read
    // property of undefined" — reject up front with a clear message.
    if (!patternName || typeof patternName !== "string") {
      return NextResponse.json(
        { error: "patternName (string) is required" },
        { status: 400 }
      );
    }
    if (!pattern || !Array.isArray(pattern.grid) || !pattern.grid.length) {
      return NextResponse.json(
        { error: "pattern with non-empty grid is required" },
        { status: 400 }
      );
    }
    if (!Array.isArray(pattern.colors) || !pattern.colors.length) {
      return NextResponse.json(
        { error: "pattern.colors (non-empty) is required" },
        { status: 400 }
      );
    }
    if (!ALLOWED_MODES.has(lifestyleMode)) {
      return NextResponse.json(
        {
          error: `lifestyleMode must be one of: ${[...ALLOWED_MODES].join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Turn the optional data-URL finished-look render into a raw Buffer
    // for the renderer. Missing/invalid → undefined → renderer falls
    // back to a "Preview pending" placeholder (video still builds).
    const decodeImage = (raw: string): Buffer | null => {
      const m = raw.match(/^data:[^;]+;base64,(.*)$/);
      const base64 = m ? m[1] : raw;
      try {
        const buf = Buffer.from(base64, "base64");
        if (buf.length < 100) return null; // obviously empty / corrupt
        return buf;
      } catch {
        return null;
      }
    };

    let finishedBuf: Buffer | undefined;
    if (finishedImage && typeof finishedImage === "string") {
      finishedBuf = decodeImage(finishedImage) ?? undefined;
    }

    // Decode the per-listing lifestyle mockups. We tolerate individual
    // bad entries (skip them) but if the result is fewer than 2 mockups
    // we drop the whole array so the renderer takes the static-fallback
    // path instead of producing a 1-frame ken-burns video that looks
    // worse than the legacy slideshow. 2 mockups is the practical floor
    // (one for the hero swap, one for the body) — anything below that
    // and the cinematic path falls flat.
    let mockupBufs: Buffer[] | undefined;
    if (Array.isArray(mockups) && mockups.length > 0) {
      const decoded: Buffer[] = [];
      for (const raw of mockups) {
        if (typeof raw !== "string") continue;
        const buf = decodeImage(raw);
        if (buf) decoded.push(buf);
      }
      if (decoded.length >= 2) mockupBufs = decoded;
    }

    // Scratch directory — unique per request so concurrent renders don't
    // collide on frame filenames. generateListingVideo cleans this up on
    // success; we nuke it again in the finally block just in case.
    workDir = path.join(
      process.cwd(),
      "data",
      "tmp-listing-video-" + Date.now() + "-" + Math.floor(Math.random() * 1e6)
    );
    await mkdir(workDir, { recursive: true });
    const outputPath = path.join(workDir, "listing-video.mp4");

    const progressLog: string[] = [];
    const result = await generateListingVideo({
      patternName,
      pattern,
      finishedImage: finishedBuf,
      lifestyleMockups: mockupBufs,
      lifestyleMode,
      outputPath,
      workDir: path.join(workDir, "scratch"),
      onProgress: (ev) => {
        // Keep a short breadcrumb of timing per step — shows up in
        // server logs so we can diagnose a slow render post-hoc. We
        // can't stream these back yet (this endpoint returns JSON, not
        // SSE) but the client's setEtsyStatus text will still scroll
        // through a plausible sequence because the whole render takes
        // long enough for status updates to feel live.
        progressLog.push(
          `[listing-video] ${ev.step}/${ev.total} · ${ev.label}`
        );
      },
    });

    const videoBuffer = await readFile(result.path);
    const base64 = videoBuffer.toString("base64");
    const dataUrl = `data:video/mp4;base64,${base64}`;

    console.log(
      `[listing-video] rendered ${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB ` +
        `in ${((Date.now() - started) / 1000).toFixed(1)}s · ` +
        `${result.durationSeconds.toFixed(1)}s duration · ` +
        `mode=${lifestyleMode} · mockups=${mockupBufs?.length ?? 0}`
    );
    progressLog.forEach((line) => console.log(line));

    return NextResponse.json({
      video: dataUrl,
      sizeBytes: videoBuffer.length,
      durationSeconds: result.durationSeconds,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[listing-video] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    // Best-effort cleanup — if the render threw halfway through, the
    // partial scratch dir would otherwise accumulate. Ignore any error
    // (dir may already be gone if the renderer's own cleanup ran).
    if (workDir) {
      try {
        await rm(workDir, { recursive: true, force: true });
      } catch {
        /* already cleaned or never created */
      }
    }
  }
}
