// ══════════════════════════════════════════════════════════════
// Factory Slideshow Video — Ken Burns + Music via ffmpeg
//
// Creates a professional Etsy listing video from listing images:
//   - Ken Burns effect (slow zoom on each slide)
//   - Crossfade transitions between slides
//   - Background music (5 tracks available)
//   - 1920x1080 HD output, MP4 format
//
// This replaces the silent Playwright-recording approach with
// a real slideshow that matches the PDF Builder's video quality.
// ══════════════════════════════════════════════════════════════

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// ── Music tracks (same as PDF Builder) ───────────────────────

export const MUSIC_TRACKS = [
  { id: "none", name: "No Music", file: null },
  { id: "ambient-soft", name: "Ambient Soft", file: "ambient-soft.mp3" },
  { id: "lofi-calm", name: "Lo-Fi Calm", file: "lofi-calm.mp3" },
  { id: "piano-gentle", name: "Piano Gentle", file: "piano-gentle.mp3" },
  { id: "nature-calm", name: "Nature Calm", file: "nature-calm.mp3" },
  { id: "corporate-light", name: "Corporate", file: "corporate-light.mp3" },
] as const;

export type MusicTrackId = (typeof MUSIC_TRACKS)[number]["id"];

// ── Types ────────────────────────────────────────────────────

export interface SlideshowOptions {
  width?: number; // default 1920
  height?: number; // default 1080
  slideDuration?: number; // seconds per slide (default 3.5)
  transitionDuration?: number; // seconds per transition (default 0.8)
  music?: MusicTrackId; // background music track (default "ambient-soft")
  outputDir?: string; // output directory
  outputFilename?: string; // output filename (default "listing-video.mp4")
}

export interface SlideshowResult {
  videoPath: string;
  durationSec: number;
  fileSizeBytes: number;
  slideCount: number;
  hasMusic: boolean;
}

// ── Check ffmpeg availability ────────────────────────────────

function hasFFmpeg(): boolean {
  try {
    execSync("ffmpeg -version", { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// ── Main export ──────────────────────────────────────────────

/**
 * Generate a professional Ken Burns slideshow video from listing images.
 *
 * @param imagePaths - Array of image file paths (PNG/JPEG)
 * @param options - Slideshow configuration
 * @returns Video result with path and metadata
 */
export async function generateSlideshowVideo(
  imagePaths: string[],
  options: SlideshowOptions = {},
): Promise<SlideshowResult | null> {
  if (imagePaths.length < 2) {
    console.warn("[slideshow] Need at least 2 images");
    return null;
  }

  if (!hasFFmpeg()) {
    console.warn("[slideshow] ffmpeg not found, skipping video generation");
    return null;
  }

  const W = options.width || 1920;
  const H = options.height || 1080;
  const slideSec = options.slideDuration || 3.5;
  const transSec = options.transitionDuration || 0.8;
  const musicId = options.music || "ambient-soft";
  const outDir = options.outputDir || path.join("/tmp", `slideshow_${Date.now()}`);
  const outFilename = options.outputFilename || "listing-video.mp4";

  fs.mkdirSync(outDir, { recursive: true });

  // Limit to 10 images max
  const images = imagePaths.slice(0, 10).filter((p) => fs.existsSync(p));
  if (images.length < 2) {
    console.warn("[slideshow] Not enough valid image files");
    return null;
  }

  console.log(`[slideshow] Creating ${images.length}-slide Ken Burns video (${W}x${H})...`);

  // ── Step 1: Create Ken Burns segments for each image ──
  // zoompan: slow 5% zoom over the slide duration
  const fps = 30;
  const totalFrames = Math.round(slideSec * fps);
  const segmentPaths: string[] = [];

  for (let i = 0; i < images.length; i++) {
    const segPath = path.join(outDir, `segment_${String(i).padStart(2, "0")}.mp4`);
    segmentPaths.push(segPath);

    // Alternate zoom direction: odd slides zoom out, even zoom in
    const zoomExpr =
      i % 2 === 0
        ? `'min(zoom+0.0008,1.06)'` // slow zoom in to 106%
        : `'if(eq(on,1),1.06,max(zoom-0.0008,1.0))'`; // start at 106%, zoom out to 100%

    const cmd = [
      "ffmpeg -y",
      `-loop 1 -framerate ${fps} -t ${slideSec + 0.5} -i "${images[i]}"`,
      `-vf "scale=${W * 2}:${H * 2}:force_original_aspect_ratio=decrease,pad=${W * 2}:${H * 2}:(ow-iw)/2:(oh-ih)/2:black,zoompan=z=${zoomExpr}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${W}x${H}:fps=${fps}"`,
      `-t ${slideSec}`,
      `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p`,
      `"${segPath}"`,
    ].join(" ");

    try {
      execSync(cmd, { timeout: 30000, stdio: "pipe" });
    } catch (err) {
      console.warn(`[slideshow] Segment ${i} failed, using static fallback`);
      // Static fallback (no zoom)
      const fallbackCmd = [
        "ffmpeg -y",
        `-loop 1 -framerate ${fps} -t ${slideSec} -i "${images[i]}"`,
        `-vf "scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black"`,
        `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p`,
        `"${segPath}"`,
      ].join(" ");
      try {
        execSync(fallbackCmd, { timeout: 20000, stdio: "pipe" });
      } catch {
        console.error(`[slideshow] Segment ${i} completely failed`);
        continue;
      }
    }
  }

  const validSegments = segmentPaths.filter((p) => fs.existsSync(p));
  if (validSegments.length < 2) {
    console.warn("[slideshow] Not enough segments created");
    return null;
  }

  console.log(`   ✓ ${validSegments.length} Ken Burns segments created`);

  // ── Step 2: Concatenate with crossfade transitions ──
  const concatPath = path.join(outDir, "concat_raw.mp4");

  if (validSegments.length === 2) {
    // Simple 2-segment crossfade
    const offset = slideSec - transSec;
    const cmd = [
      "ffmpeg -y",
      `-i "${validSegments[0]}" -i "${validSegments[1]}"`,
      `-filter_complex "[0:v][1:v]xfade=transition=fade:duration=${transSec}:offset=${offset}[v]"`,
      `-map "[v]" -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p`,
      `"${concatPath}"`,
    ].join(" ");
    execSync(cmd, { timeout: 60000, stdio: "pipe" });
  } else {
    // Multi-segment: chain xfade transitions
    const transitions = ["fade", "slideleft", "circleopen", "fade", "slideright", "dissolve"];
    const inputs = validSegments.map((p) => `-i "${p}"`).join(" ");

    let filterComplex = "";
    let prevLabel = "0:v";

    for (let i = 1; i < validSegments.length; i++) {
      const trans = transitions[(i - 1) % transitions.length];
      const offset = slideSec - transSec;
      // Each subsequent offset accounts for accumulated transition compression
      const effectiveOffset = offset + (i - 1) * (slideSec - transSec);
      const outLabel = i < validSegments.length - 1 ? `x${i}` : "vout";

      if (i === 1) {
        filterComplex += `[0:v][1:v]xfade=transition=${trans}:duration=${transSec}:offset=${offset}[${outLabel}]`;
      } else {
        filterComplex += `;[${prevLabel}][${i}:v]xfade=transition=${trans}:duration=${transSec}:offset=${effectiveOffset}[${outLabel}]`;
      }
      prevLabel = outLabel;
    }

    const cmd = [
      "ffmpeg -y",
      inputs,
      `-filter_complex "${filterComplex}"`,
      `-map "[vout]" -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p`,
      `"${concatPath}"`,
    ].join(" ");

    try {
      execSync(cmd, { timeout: 120000, stdio: "pipe" });
    } catch {
      // Fallback: simple concat without transitions
      console.warn("[slideshow] xfade failed, using simple concat");
      const listFile = path.join(outDir, "concat_list.txt");
      fs.writeFileSync(listFile, validSegments.map((p) => `file '${p}'`).join("\n"));
      execSync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p "${concatPath}"`, {
        timeout: 60000,
        stdio: "pipe",
      });
    }
  }

  if (!fs.existsSync(concatPath)) {
    console.error("[slideshow] Concat failed — no output");
    return null;
  }

  console.log("   ✓ Transitions applied");

  // ── Step 3: Add fade in/out and optional background music ──
  const finalPath = path.join(outDir, outFilename);
  const musicTrack = MUSIC_TRACKS.find((t) => t.id === musicId);
  const audioDir = path.resolve(process.cwd(), "public/audio");
  const musicFile = musicTrack?.file ? path.join(audioDir, musicTrack.file) : null;
  const hasAudio = musicFile && fs.existsSync(musicFile);

  // Get video duration for fade-out timing
  let duration = validSegments.length * slideSec;
  try {
    const probe = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${concatPath}"`,
      { timeout: 10000, encoding: "utf-8" },
    ).trim();
    if (probe) duration = parseFloat(probe);
  } catch { /* use estimate */ }

  const fadeOutStart = Math.max(0, duration - 1);

  if (hasAudio) {
    console.log(`   ♪ Adding music: ${musicTrack?.name || musicId}`);
    const cmd = [
      "ffmpeg -y",
      `-i "${concatPath}" -i "${musicFile}"`,
      `-filter_complex "[1:a]afade=in:d=1,afade=out:st=${fadeOutStart}:d=1,volume=0.4[a]"`,
      `-vf "fade=in:0:30,fade=out:st=${fadeOutStart}:d=1"`,
      `-map 0:v -map "[a]"`,
      `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p`,
      `-c:a aac -b:a 128k`,
      `-shortest -movflags +faststart`,
      `"${finalPath}"`,
    ].join(" ");
    try {
      execSync(cmd, { timeout: 60000, stdio: "pipe" });
    } catch {
      // Fallback without music
      console.warn("[slideshow] Music overlay failed, producing silent video");
      const silentCmd = [
        "ffmpeg -y",
        `-i "${concatPath}"`,
        `-vf "fade=in:0:30,fade=out:st=${fadeOutStart}:d=1"`,
        `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -an -movflags +faststart`,
        `"${finalPath}"`,
      ].join(" ");
      execSync(silentCmd, { timeout: 30000, stdio: "pipe" });
    }
  } else {
    // No music — just add fades
    const cmd = [
      "ffmpeg -y",
      `-i "${concatPath}"`,
      `-vf "fade=in:0:30,fade=out:st=${fadeOutStart}:d=1"`,
      `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -an -movflags +faststart`,
      `"${finalPath}"`,
    ].join(" ");
    execSync(cmd, { timeout: 30000, stdio: "pipe" });
  }

  if (!fs.existsSync(finalPath)) {
    console.error("[slideshow] Final video not created");
    return null;
  }

  const stats = fs.statSync(finalPath);
  console.log(`   ✓ Video: ${Math.round(stats.size / 1024)}KB, ${duration.toFixed(1)}s`);

  // Clean up intermediate files
  for (const seg of validSegments) {
    try { fs.unlinkSync(seg); } catch { /* ignore */ }
  }
  try { fs.unlinkSync(concatPath); } catch { /* ignore */ }

  return {
    videoPath: finalPath,
    durationSec: Math.round(duration * 10) / 10,
    fileSizeBytes: stats.size,
    slideCount: validSegments.length,
    hasMusic: !!hasAudio,
  };
}
