import { NextRequest } from "next/server";
import { writeFile, mkdir, unlink, readFile } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import sharp from "sharp";

const exec = promisify(execFile);

export async function POST(req: NextRequest) {
  try {
    const { images, duration = 3, transition = 0.8, resolution = "1080x1350" } = await req.json();

    if (!images || !Array.isArray(images) || images.length < 2) {
      return new Response(
        JSON.stringify({ error: "At least 2 images (base64) are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const [resW, resH] = resolution.split("x").map(Number);
    const tmpDir = path.join(process.cwd(), "data", "tmp-video-" + Date.now());
    await mkdir(tmpDir, { recursive: true });

    const framePaths: string[] = [];

    // Save and normalize all images to same resolution
    for (let i = 0; i < images.length; i++) {
      const base64 = images[i].replace(/^data:[^;]+;base64,/, "");
      const buf = Buffer.from(base64, "base64");

      let imgBuf: Buffer;
      try {
        imgBuf = await sharp(buf).png().toBuffer();
      } catch {
        console.error(`Skipping image ${i}: unsupported format`);
        continue;
      }

      const normalized = await sharp(imgBuf)
        .resize(resW, resH, { fit: "cover", position: "center" })
        .png()
        .toBuffer();

      const framePath = path.join(tmpDir, `frame_${String(i).padStart(3, "0")}.png`);
      await writeFile(framePath, normalized);
      framePaths.push(framePath);
    }

    if (framePaths.length < 2) {
      return new Response(
        JSON.stringify({ error: "Could not process enough valid images (need at least 2)" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const outputPath = path.join(tmpDir, "listing-video.mp4");
    const totalImages = framePaths.length;
    const fps = 30;

    // Simple crossfade slideshow — no zoompan (fast generation)
    // Each image is looped for duration+transition, then xfade between them
    const inputs: string[] = [];
    const filterParts: string[] = [];

    for (let i = 0; i < totalImages; i++) {
      inputs.push("-loop", "1", "-t", String(duration + transition), "-i", framePaths[i]);
      filterParts.push(`[${i}:v]scale=${resW}:${resH},setsar=1,fps=${fps}[v${i}]`);
    }

    // Chain xfade crossfade transitions
    let lastLabel = "v0";
    const xfadeParts: string[] = [];
    for (let i = 1; i < totalImages; i++) {
      const outLabel = i < totalImages - 1 ? `xf${i}` : "vout";
      const xfadeOffset = i * duration - transition;
      xfadeParts.push(
        `[${lastLabel}][v${i}]xfade=transition=fade:duration=${transition}:offset=${xfadeOffset}[${outLabel}]`
      );
      lastLabel = outLabel;
    }

    const filterComplex = [...filterParts, ...xfadeParts].join(";");

    const ffmpegArgs = [
      ...inputs,
      "-filter_complex", filterComplex,
      "-map", "[vout]",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-preset", "fast",
      "-crf", "23",
      "-movflags", "+faststart",
      "-y",
      outputPath,
    ];

    await exec("ffmpeg", ffmpegArgs, { timeout: 120000 });

    // Copy video to public dir for serving (avoids base64 size issues)
    const publicDir = path.join(process.cwd(), "public");
    const videoFilename = `listing-video-${Date.now()}.mp4`;
    const publicPath = path.join(publicDir, videoFilename);
    const videoBuffer = await readFile(outputPath);
    await writeFile(publicPath, videoBuffer);

    // Also provide base64 for small videos, URL for all
    const videoUrl = `/${videoFilename}`;
    let videoBase64: string | undefined;
    if (videoBuffer.length < 500_000) {
      videoBase64 = `data:video/mp4;base64,${videoBuffer.toString("base64")}`;
    }

    // Cleanup temp files
    for (const f of framePaths) {
      try { await unlink(f); } catch { /* ignore */ }
    }
    try { await unlink(outputPath); } catch { /* ignore */ }
    try { const { rmdir } = await import("fs/promises"); await rmdir(tmpDir); } catch { /* ignore */ }

    return new Response(
      JSON.stringify({ video: videoBase64 || videoUrl, videoUrl, frames: totalImages, duration: totalImages * duration }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Video generation failed";
    console.error("Generate video error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
