/**
 * Marketing listing video — hybrid Kling + canvas pipeline.
 *
 * Timeline (matches the AlbaSanStudio-style tutorial format):
 *   1. Opener      (2 s)   — Frame mockup [0] with pattern-name overlay
 *                            → lifestyle shot that opens like the reference
 *   2. Chart       (2 s)   — Pattern grid render, slow Ken-Burns zoom-in
 *                            → shows the actual chart the buyer will stitch
 *   3. Stitching   (5 s)   — Kling i2v on handsStitching mockup [2]
 *                            → real animated hands cross-stitching THIS design
 *                            (falls back to Ken-Burns on the mockup, then on
 *                            the flat design image, then omitted)
 *   4. Frame slide (2 s)   — Frame mockup [1] Ken-Burns (when available)
 *   5. CTA         (1.5 s) — "✨ Instant Download · Start Stitching Today →"
 *
 * Total: ~12.5 s square 1:1 MP4.
 *
 * Graceful degradation: every scene is optional — missing mockups, a
 * missing chart image, or a Kling failure each fall back to a cheaper/
 * free path so the video always ships.
 *
 * Cost: ~$0.25 (one Kling 1.6 Standard i2v call) when a handsStitching
 * mockup is available, $0 otherwise (Ken-Burns only).
 *
 * Input body:
 *   patternName?         string       — shown in opener overlay
 *   dominantColors?      string[]     — top DMC thread names for Kling prompt
 *   finishedImageDataUrl? string      — pattern chart render (data URL / b64)
 *   designImageDataUrl?  string       — flat GPT listing art (Kling fallback)
 *   mockups?             string[]     — [frame0, frame1, handsStitching, lapCozy]
 *
 * Output body:
 *   { video: dataUrl, model: "kling-1.6-standard" | "ken-burns", costUsd }
 *   { error: "..." } on failure
 */
import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile, readFile, rm } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import sharp from "sharp";
import { generateFalVideo, FAL_VIDEO_COST_USD } from "@/lib/fal-video";

export const maxDuration = 300;
export const runtime = "nodejs";

const exec = promisify(execFile);
const KLING_MODEL = "kling-1.6-standard" as const;

// ── SVG helpers ───────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Dark CTA end-card (three centered text lines on #111111). */
function buildCtaSvg(): string {
  return `<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1080" fill="#111111"/>
    <text x="540" y="460" font-family="system-ui,-apple-system,'Segoe UI','Apple Color Emoji',sans-serif" font-size="72" font-weight="bold" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">✨ Instant Download</text>
    <text x="540" y="560" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="48" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">Start Stitching Today →</text>
    <text x="540" y="640" font-family="system-ui,-apple-system,'Segoe UI','Apple Color Emoji',sans-serif" font-size="36" fill="#F59E0B" text-anchor="middle" dominant-baseline="middle">Beginner Friendly · PDF Download</text>
  </svg>`;
}

/**
 * Composite a two-line title overlay onto a lifestyle mockup PNG buffer.
 * A soft dark gradient bar sits at the bottom third so the white text
 * is always legible regardless of the mockup's background colours.
 */
async function buildOpenerPng(
  mockupBuf: Buffer,
  patternName: string,
): Promise<Buffer> {
  // Gradient bar SVG — transparent top, dark bottom, white text.
  // width/height must match the 1080×1080 target we're compositing onto.
  const overlay = `<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="black" stop-opacity="0"/>
        <stop offset="100%" stop-color="black" stop-opacity="0.65"/>
      </linearGradient>
    </defs>
    <rect x="0" y="680" width="1080" height="400" fill="url(#grad)"/>
    <text x="540" y="850" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="52" font-weight="bold" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">${escapeXml(patternName)}</text>
    <text x="540" y="930" font-family="system-ui,-apple-system,'Segoe UI','Apple Color Emoji',sans-serif" font-size="36" fill="#F59E0B" text-anchor="middle" dominant-baseline="middle">🧵 Cross Stitch Pattern · PDF Download</text>
  </svg>`;

  return sharp(mockupBuf)
    .resize(1080, 1080, { fit: "cover", position: "centre" })
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

// ── ffmpeg helpers ────────────────────────────────────────────────────

/** Encode a still PNG into a Ken-Burns MP4 with a slow zoom-in. */
async function kenBurnsMp4(
  pngPath: string,
  outPath: string,
  durationSec: number,
): Promise<void> {
  const fps = 30;
  const frames = durationSec * fps;
  // Zoom from 1.00 → 1.10 over the clip duration — subtle, not distracting.
  await exec("ffmpeg", [
    "-loop", "1", "-i", pngPath,
    "-vf",
    `scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2,` +
    `zoompan=z='min(zoom+${(0.10 / frames).toFixed(6)},1.10)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1080`,
    "-t", String(durationSec),
    "-c:v", "libx264", "-preset", "fast", "-crf", "20",
    "-pix_fmt", "yuv420p", "-r", "30", "-y", outPath,
  ]);
}

/** Encode a still PNG into a static (no-zoom) MP4. Used for text cards. */
async function staticMp4(
  pngPath: string,
  outPath: string,
  durationSec: number,
): Promise<void> {
  await exec("ffmpeg", [
    "-loop", "1", "-i", pngPath,
    "-t", String(durationSec),
    "-c:v", "libx264", "-preset", "fast", "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-vf", "scale=1080:1080",
    "-r", "30",
    "-y", outPath,
  ]);
}

// ── Route handler ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!process.env.FAL_KEY && !process.env.FAL_API_KEY) {
    return NextResponse.json({ error: "FAL_KEY not configured" }, { status: 400 });
  }

  const started = Date.now();
  const workDir = path.join(process.cwd(), "data", `kling-video-${Date.now()}`);
  await mkdir(workDir, { recursive: true });

  try {
    const body = await req.json();
    const {
      patternName = "Cross Stitch Pattern",
      dominantColors = [] as string[],
      finishedImageDataUrl,   // pattern chart render — used for chart close-up
      designImageDataUrl,     // flat GPT art — Kling stitching fallback
      mockups,
    } = body as {
      patternName?: string;
      dominantColors?: string[];
      finishedImageDataUrl?: string;
      designImageDataUrl?: string;
      mockups?: string[];
    };

    // handsStitching is conventionally mockups[2]; frame scenes are [0] and [1].
    const mockup0: string | undefined = Array.isArray(mockups) && mockups.length > 0 ? mockups[0] : undefined;
    const mockup1: string | undefined = Array.isArray(mockups) && mockups.length > 1 ? mockups[1] : undefined;
    const handsStitchingMockup: string | undefined =
      Array.isArray(mockups) && mockups.length >= 3 ? mockups[2] : undefined;

    // ── SCENE 1 — Opener ──────────────────────────────────────────────
    // Best: frame mockup [0] with text overlay (lifestyle opening)
    // Fallback: dark hook text card
    const openerPng = path.join(workDir, "opener.png");
    if (mockup0) {
      try {
        const b64 = mockup0.replace(/^data:[^;]+;base64,/, "");
        const mockupBuf = Buffer.from(b64, "base64");
        const overlaidBuf = await buildOpenerPng(mockupBuf, patternName);
        await writeFile(openerPng, overlaidBuf);
      } catch (err) {
        console.warn("[listing-video-kling] opener overlay failed — using text card:", err);
        await writeFile(
          openerPng,
          await sharp(Buffer.from(
            `<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
              <rect width="1080" height="1080" fill="#111111"/>
              <text x="540" y="490" font-family="system-ui,sans-serif" font-size="72" font-weight="bold" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">🧵 ${escapeXml(patternName)}</text>
              <text x="540" y="590" font-family="system-ui,sans-serif" font-size="40" fill="#F59E0B" text-anchor="middle" dominant-baseline="middle">Cross Stitch Pattern · PDF Download</text>
            </svg>`
          )).png().toBuffer(),
        );
      }
    } else {
      await writeFile(
        openerPng,
        await sharp(Buffer.from(
          `<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
            <rect width="1080" height="1080" fill="#111111"/>
            <text x="540" y="490" font-family="system-ui,sans-serif" font-size="72" font-weight="bold" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">🧵 ${escapeXml(patternName)}</text>
            <text x="540" y="590" font-family="system-ui,sans-serif" font-size="40" fill="#F59E0B" text-anchor="middle" dominant-baseline="middle">Cross Stitch Pattern · PDF Download</text>
          </svg>`
        )).png().toBuffer(),
      );
    }
    const openerMp4 = path.join(workDir, "opener.mp4");
    if (mockup0) {
      await kenBurnsMp4(openerPng, openerMp4, 2);
    } else {
      await staticMp4(openerPng, openerMp4, 2);
    }

    // ── SCENE 2 — Chart close-up ──────────────────────────────────────
    // Ken-Burns slow zoom into the actual pattern grid so buyers see
    // exactly what they're downloading before the hands-stitching clip.
    let chartMp4: string | null = null;
    if (finishedImageDataUrl) {
      try {
        const b64 = finishedImageDataUrl.replace(/^data:[^;]+;base64,/, "");
        const chartPng = path.join(workDir, "chart.png");
        await writeFile(chartPng, Buffer.from(b64, "base64"));
        chartMp4 = path.join(workDir, "chart.mp4");
        await kenBurnsMp4(chartPng, chartMp4, 2);
        console.log("[listing-video-kling] chart close-up ✓");
      } catch (err) {
        console.warn("[listing-video-kling] chart close-up failed — skipping:", err);
        chartMp4 = null;
      }
    }

    // ── SCENE 3 — Hands stitching (Kling i2v or fallback) ────────────
    const colorPhrase =
      dominantColors.length > 0 ? dominantColors.slice(0, 3).join(", ") : "colourful";

    let imageUrl: string | undefined;
    let stitchingMp4: string | null = null;

    if (handsStitchingMockup) {
      // Upload the handsStitching mockup to fal.ai storage for i2v.
      try {
        const apiKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
        if (!apiKey) throw new Error("FAL_KEY not configured");

        const mimeMatch = handsStitchingMockup.match(/^data:([a-zA-Z]+\/[a-zA-Z0-9.+-]+);base64,/);
        const detectedMime = mimeMatch?.[1] ?? "image/png";
        const ext = detectedMime.split("/")[1]?.split("+")[0] ?? "png";
        const b64 = handsStitchingMockup.replace(/^data:[^;]+;base64,/, "");
        const buf = Buffer.from(b64, "base64");

        const initiateResp = await fetch("https://rest.alpha.fal.ai/storage/upload/initiate", {
          method: "POST",
          headers: {
            Authorization: `Key ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content_type: detectedMime, file_name: `mockup.${ext}` }),
        });

        if (!initiateResp.ok) {
          console.warn(`[listing-video-kling] fal.ai initiate failed (${initiateResp.status}) — falling back`);
        } else {
          const { file_url, upload_url } = (await initiateResp.json()) as {
            file_url?: string;
            upload_url?: string;
          };
          if (!upload_url || !file_url) {
            console.warn("[listing-video-kling] fal.ai initiate missing urls — falling back");
          } else {
            const putResp = await fetch(upload_url, {
              method: "PUT",
              headers: { "Content-Type": detectedMime },
              body: buf,
            });
            if (putResp.ok) {
              imageUrl = file_url;
              console.log(`[listing-video-kling] fal.ai upload OK → ${file_url.slice(0, 80)}`);
            } else {
              console.warn(`[listing-video-kling] fal.ai PUT failed (${putResp.status}) — falling back`);
            }
          }
        }
      } catch (err) {
        console.warn("[listing-video-kling] storage upload error — falling back:", err);
      }

      if (imageUrl) {
        // Path 1 — Kling i2v: animate the handsStitching mockup.
        const klingPath = path.join(workDir, "kling.mp4");
        const fal = await generateFalVideo({
          prompt:
            "The woman's hands begin moving, slowly and carefully stitching the pattern, " +
            `needle threading ${colorPhrase} DMC floss through the aida fabric in neat X-shaped stitches, ` +
            "cozy authentic crafting movement, warm natural light, no sudden jerks",
          imageUrl,
          model: KLING_MODEL,
          durationSec: 5,
          aspectRatio: "1:1",
          outputPath: klingPath,
        });
        console.log(`[listing-video-kling] Kling i2v in ${(fal.elapsedMs / 1000).toFixed(1)}s`);
        const klingScaledMp4 = path.join(workDir, "kling_scaled.mp4");
        await exec("ffmpeg", [
          "-i", klingPath,
          "-vf", "scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,fps=30",
          "-c:v", "libx264", "-preset", "fast", "-crf", "20",
          "-pix_fmt", "yuv420p", "-an", "-y", klingScaledMp4,
        ]);
        stitchingMp4 = klingScaledMp4;
      } else {
        // Path 2 — Ken Burns on the handsStitching mockup photo.
        const b64 = handsStitchingMockup.replace(/^data:[^;]+;base64,/, "");
        const mockupPng = path.join(workDir, "mockup-stitch.png");
        const mockupMp4 = path.join(workDir, "mockup-stitch.mp4");
        await writeFile(mockupPng, Buffer.from(b64, "base64"));
        await kenBurnsMp4(mockupPng, mockupMp4, 4);
        stitchingMp4 = mockupMp4;
        console.log("[listing-video-kling] stitching segment: Ken Burns (handsStitching mockup)");
      }
    } else if (designImageDataUrl) {
      // Path 3 — Ken Burns on the flat design art.
      const b64 = designImageDataUrl.replace(/^data:[^;]+;base64,/, "");
      const designPng = path.join(workDir, "design-stitch.png");
      const designMp4 = path.join(workDir, "design-stitch.mp4");
      await writeFile(designPng, Buffer.from(b64, "base64"));
      await kenBurnsMp4(designPng, designMp4, 4);
      stitchingMp4 = designMp4;
      console.log("[listing-video-kling] stitching segment: Ken Burns (design image)");
    }

    // ── SCENE 4 — Second frame mockup ────────────────────────────────
    let slideMp4: string | null = null;
    if (mockup1) {
      try {
        const b64 = mockup1.replace(/^data:[^;]+;base64,/, "");
        const slidePng = path.join(workDir, "slide1.png");
        const slideOut = path.join(workDir, "slide1.mp4");
        await writeFile(slidePng, Buffer.from(b64, "base64"));
        await kenBurnsMp4(slidePng, slideOut, 2);
        slideMp4 = slideOut;
      } catch {
        console.warn("[listing-video-kling] frame slide 1 failed — skipping");
      }
    }

    // ── SCENE 5 — CTA end card ────────────────────────────────────────
    const ctaPng = path.join(workDir, "cta.png");
    await writeFile(
      ctaPng,
      await sharp(Buffer.from(buildCtaSvg())).png().toBuffer(),
    );
    const ctaMp4 = path.join(workDir, "cta.mp4");
    await staticMp4(ctaPng, ctaMp4, 1.5);

    // ── Concat ────────────────────────────────────────────────────────
    const segments: string[] = [openerMp4];
    if (chartMp4) segments.push(chartMp4);
    if (stitchingMp4) segments.push(stitchingMp4);
    if (slideMp4) segments.push(slideMp4);
    segments.push(ctaMp4);

    const concatTxt = path.join(workDir, "concat.txt");
    await writeFile(concatTxt, segments.map((p) => `file '${p}'`).join("\n"));

    const finalPath = path.join(workDir, "final.mp4");
    await exec("ffmpeg", [
      "-f", "concat", "-safe", "0", "-i", concatTxt,
      "-c:v", "libx264", "-preset", "fast", "-crf", "20",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-y", finalPath,
    ]);

    const buf = await readFile(finalPath);
    const dataUrl = `data:video/mp4;base64,${buf.toString("base64")}`;
    const usedKling = stitchingMp4?.includes("kling_scaled") ?? false;

    console.log(
      `[listing-video-kling] finished in ${((Date.now() - started) / 1000).toFixed(1)}s — ` +
      `${segments.length} segments, ${usedKling ? "Kling i2v" : "Ken-Burns only"}`,
    );

    return NextResponse.json({
      video: dataUrl,
      model: usedKling ? KLING_MODEL : "ken-burns",
      costUsd: usedKling ? FAL_VIDEO_COST_USD[KLING_MODEL] : 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "listing-video-kling failed";
    console.error("[listing-video-kling] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
