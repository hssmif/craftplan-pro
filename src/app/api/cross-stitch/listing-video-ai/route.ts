/**
 * AI-animated listing video — uses Stable Video Diffusion (Replicate) to
 * turn the GPT-image-2 lifestyle mockups into real-motion video clips.
 *
 * Pipeline:
 *   1. Receive 4 mockups: [template1, template2, handsStitching, lapCozy]
 *   2. Run SVD on handsStitching + lapCozy in parallel (~60-90 s)
 *   3. Download both MP4 clips, re-encode to 1080×1080 square
 *   4. Build Ken Burns stills from template1 + template2 (3 s each, free)
 *   5. Build 1.5 s title card + 1.5 s end card
 *   6. Concat: title → still1 → hands(animated) → lap(animated) → still2 → end
 *   7. Return the final MP4 as a base64 data URL (response shape matches
 *      the existing /api/cross-stitch/listing-video route so page.tsx's
 *      surrounding logic — `videoData.video` etc. — works unchanged).
 *
 * Falls back: caller (page.tsx) retries /api/cross-stitch/listing-video on
 * any non-200 response from this route.
 *
 * Cost per run: ~$0.068 (2 × $0.034 SVD) + existing GPT mockup cost.
 * Total time:   ~90-120 s (SVD dominates).
 */
import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile, readFile, rm } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import sharp from "sharp";
import { animateWithSVD } from "@/lib/replicate";

export const maxDuration = 300;
export const runtime = "nodejs";

const exec = promisify(execFile);

async function downloadToFile(url: string, dest: string): Promise<void> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`SVD download failed ${resp.status}: ${url.slice(0, 80)}`);
  await writeFile(dest, Buffer.from(await resp.arrayBuffer()));
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  const workDir = path.join(process.cwd(), "data", `ai-video-${Date.now()}`);
  await mkdir(workDir, { recursive: true });

  try {
    const body = await req.json();
    const {
      patternName = "Cross Stitch Pattern",
      mockups = [] as string[],
    } = body;

    // Need at least 3 mockups: [template1, template2, handsStitching, lapCozy]
    // Index 2 = handsStitching (person stitching this specific pattern)
    // Index 3 = lapCozy (lifestyle cozy scene)
    if (mockups.length < 3) {
      return NextResponse.json(
        { error: "Need at least 3 mockups (templates + 1 lifestyle)" },
        { status: 400 }
      );
    }

    const handsImg = mockups[2] ?? mockups[0];
    const lapImg   = mockups[3] ?? mockups[1];

    console.log(`[listing-video-ai] running SVD on 2 lifestyle frames for "${patternName}"…`);

    // Animate both lifestyle frames in parallel — this is the slow step
    const [handsVideoUrl, lapVideoUrl] = await Promise.all([
      animateWithSVD(handsImg, { motionBucket: 70, fps: 6 }),
      animateWithSVD(lapImg,   { motionBucket: 60, fps: 6 }),
    ]);

    console.log(`[listing-video-ai] SVD done in ${((Date.now() - started) / 1000).toFixed(1)}s`);

    // Download SVD clips
    const handsRawPath = path.join(workDir, "hands_raw.mp4");
    const lapRawPath   = path.join(workDir, "lap_raw.mp4");
    await Promise.all([
      downloadToFile(handsVideoUrl, handsRawPath),
      downloadToFile(lapVideoUrl,   lapRawPath),
    ]);

    // Re-encode SVD clips (16:9) → 1080×1080 square, 30 fps
    const handsPath = path.join(workDir, "hands.mp4");
    const lapPath   = path.join(workDir, "lap.mp4");
    for (const [src, dst] of [[handsRawPath, handsPath], [lapRawPath, lapPath]] as [string,string][]) {
      await exec("ffmpeg", [
        "-i", src,
        "-vf", "scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080",
        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-r", "30", "-pix_fmt", "yuv420p", "-y", dst,
      ]);
    }

    // Ken Burns stills from template composites (3 s each, slow zoom-in)
    const stillVideoPaths: string[] = [];
    for (let i = 0; i < 2; i++) {
      const raw = (mockups[i] ?? mockups[0]).replace(/^data:[^;]+;base64,/, "");
      const upscaled = await sharp(Buffer.from(raw, "base64"))
        .resize(2160, 2160, { fit: "cover", position: "center" })
        .png()
        .toBuffer();
      const stillPng = path.join(workDir, `still_${i}.png`);
      const stillMp4 = path.join(workDir, `still_${i}.mp4`);
      await writeFile(stillPng, upscaled);
      await exec("ffmpeg", [
        "-loop", "1", "-i", stillPng,
        "-t", "3",
        "-vf", "zoompan=z='if(lte(zoom,1.0),1.04,zoom+0.001)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=90:s=1080x1080:fps=30",
        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-pix_fmt", "yuv420p", "-y", stillMp4,
      ]);
      stillVideoPaths.push(stillMp4);
    }

    // Title card (1.5 s)
    const safeName = patternName.replace(/[<>&"]/g, " ").substring(0, 45);
    const titleSvg = `<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
      <rect width="1080" height="1080" fill="#12080a"/>
      <rect x="0" y="440" width="1080" height="200" fill="#2a1500" opacity="0.8"/>
      <text x="540" y="524" font-family="Georgia,serif" font-size="50" font-weight="bold"
            fill="#f59e0b" text-anchor="middle" dominant-baseline="middle">${safeName}</text>
      <text x="540" y="592" font-family="Arial,sans-serif" font-size="22"
            fill="#d97706" text-anchor="middle" dominant-baseline="middle">Cross Stitch Pattern · Digital Download</text>
    </svg>`;

    // End card (1.5 s)
    const endSvg = `<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
      <rect width="1080" height="1080" fill="#12080a"/>
      <text x="540" y="500" font-family="Georgia,serif" font-size="48" font-weight="bold"
            fill="#f59e0b" text-anchor="middle" dominant-baseline="middle">Instant Digital Download</text>
      <text x="540" y="572" font-family="Arial,sans-serif" font-size="26"
            fill="#d97706" text-anchor="middle" dominant-baseline="middle">PDF · Colour &amp; symbol charts · Pattern Keeper</text>
    </svg>`;

    const titlePng = path.join(workDir, "title.png");
    const endPng   = path.join(workDir, "end.png");
    await Promise.all([
      writeFile(titlePng, await sharp(Buffer.from(titleSvg)).png().toBuffer()),
      writeFile(endPng,   await sharp(Buffer.from(endSvg)).png().toBuffer()),
    ]);

    const titleMp4 = path.join(workDir, "title.mp4");
    const endMp4   = path.join(workDir, "end.mp4");
    for (const [png, mp4] of [[titlePng, titleMp4], [endPng, endMp4]] as [string,string][]) {
      await exec("ffmpeg", [
        "-loop", "1", "-i", png, "-t", "1.5",
        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-pix_fmt", "yuv420p", "-vf", "scale=1080:1080", "-r", "30", "-y", mp4,
      ]);
    }

    // Concat: title → still1 → hands(SVD) → lap(SVD) → still2 → end
    const segments = [
      titleMp4,
      stillVideoPaths[0],
      handsPath,
      lapPath,
      stillVideoPaths[1] ?? stillVideoPaths[0],
      endMp4,
    ];
    const concatTxt = path.join(workDir, "concat.txt");
    await writeFile(concatTxt, segments.map((p) => `file '${p}'`).join("\n"));

    const outputPath = path.join(workDir, "final.mp4");
    await exec("ffmpeg", [
      "-f", "concat", "-safe", "0", "-i", concatTxt,
      "-c:v", "libx264", "-preset", "fast", "-crf", "20",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      "-y", outputPath,
    ]);

    const buf = await readFile(outputPath);
    console.log(`[listing-video-ai] finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);

    // Wrap as a base64 data URL so the response shape matches the
    // existing /api/cross-stitch/listing-video route — page.tsx's
    // listOnEtsy() flow reads `videoData.video` and then re-uploads
    // the same data URL straight to Etsy via /api/etsy/listing-upload.
    // DEVIATION from the original spec: spec said `return new
    // NextResponse(buf, { Content-Type: video/mp4 })` (raw binary).
    // That would require either a Content-Type sniff or a Blob→base64
    // branch in page.tsx; wrapping into JSON here keeps the caller
    // logic identical for both Ken-Burns and SVD paths.
    const dataUrl = `data:video/mp4;base64,${buf.toString("base64")}`;
    return NextResponse.json({ video: dataUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "listing-video-ai failed";
    console.error("[listing-video-ai] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
