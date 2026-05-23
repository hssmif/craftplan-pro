/*
 * Listing-video pipeline — generates an 11s square MP4 showcasing
 * a finished cross-stitch pattern for Etsy listings.
 *
 * 2026-04-25 — REWRITE: video is now MOCKUP-DRIVEN, not a text slideshow.
 *
 *   Etsy's listing-video guidance: show the product in use / real-life
 *   context, each listing's video should feel unique to that product,
 *   avoid text-heavy slideshows. The previous implementation shipped a
 *   7-frame deck with FIVE static text/SVG cards (title, chart, package
 *   icons, stats table, end card) and only one per-pattern frame
 *   (finished render). Every listing's video looked nearly identical —
 *   buyers saw an animated PDF, not the actual product. Etsy explicitly
 *   recommends videos that "show your product being made or used"
 *   for handmade / digital-craft listings.
 *
 *   The fix: when lifestyle mockups (the per-pattern photoreal GPT
 *   renders we already pay $0.28/listing for) are passed in, the video
 *   becomes mockup-driven with subtle ken-burns motion on each one:
 *     1. Title             (1.5s) — pattern name only, no clutter
 *     2. handsStitching    (2.5s) — HERO: hands mid-stitch on THIS pattern
 *     3. hoopGinghamPink   (2.5s) — finished flat-lay
 *     4. lapCozy           (2.5s) — cozy lifestyle context
 *     5. shelfStyled       (2.5s) — framed in a room
 *     6. End card          (1.5s) — Instant Digital Download
 *
 *   ~11s total. Every middle frame is unique per pattern. Buyers
 *   actually see the product they're buying.
 *
 *   Graceful degradation: if no mockups are provided (cold path,
 *   regen edge cases), the video falls back to the original static
 *   slideshow so it still ships rather than failing the listing.
 *
 * Pipeline:
 *   1. Parse pattern data (grid, colors, stats)
 *   2. Prepare 1080×1080 frames:
 *        — title + end SVG cards (always)
 *        — mockup PNGs upscaled to 2160×2160 (when provided, for ken-burns headroom)
 *        — fallback chart/finished/etc. SVG cards (only if no mockups)
 *   3. Optionally slot in lifestyle footage as frame 3 (legacy "free" mode)
 *   4. Stitch with ffmpeg xfade chain (+ zoompan ken-burns on mockup frames) → silent mp4
 *   5. Synthesize warm ambient music with 3 chimes on story beats
 *   6. Mux A/V → final mp4
 *
 * Output: a single MP4 at `options.outputPath`.
 *
 * Dependencies: sharp (already a project dep), system ffmpeg in PATH.
 */

import { readFile, mkdir, rm } from "fs/promises";
import { existsSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import sharp from "sharp";

const exec = promisify(execFile);

// ── Types ────────────────────────────────────────────────────

export interface VideoStitchColor {
  dmc: string;
  name: string;
  hex: string;
  symbol: string;
  count: number;
}

export interface VideoPatternData {
  /** grid[row][col] = DMC code of the thread in that cell */
  grid: string[][];
  colors: VideoStitchColor[];
  width: number;
  height: number;
  totalStitches: number;
  /** Optional DMC code that represents background aida — cells matching
   *  this render as blank fabric in the chart (and aren't counted). */
  backgroundDmc?: string;
}

export type LifestyleMode = "free" | "none";

export interface GenerateVideoOptions {
  /** Human-readable pattern name used in the title card. */
  patternName: string;
  pattern: VideoPatternData;
  /** The gpt-image-2 photoreal render of the finished piece. When
   *  missing, frame 3 (finished look) falls back to an aida-tinted
   *  chart-render placeholder so the video still builds. */
  finishedImage?: Buffer;
  /** Per-pattern lifestyle mockup PNG buffers (the 4 photoreal scenes
   *  we already pay $0.28/listing for in /api/cross-stitch/auto-mockup).
   *  When supplied, the video becomes mockup-driven (cinematic, per-
   *  listing) instead of a static slideshow. Order matters — the first
   *  mockup gets the HERO slot, so callers should pass in the order
   *  the auto-mockup route returns: hoopGinghamPink, handsStitching,
   *  lapCozy, shelfStyled. The renderer reorders so handsStitching
   *  (real hands making it — Etsy's "show product in use") fires
   *  first regardless of input order.
   *
   *  Pass undefined or [] to fall back to the legacy text-heavy
   *  slideshow (keeps backward compatibility for cold-path renders). */
  lifestyleMockups?: Buffer[];
  /** Which lifestyle clip slot to use:
   *   - "free": bundled Pexels montage (public/video-assets/pexels-montage.mp4)
   *   - "none": skip the lifestyle slot (7-frame pipeline) */
  lifestyleMode: LifestyleMode;
  /** Absolute filesystem path where the final mp4 is written. */
  outputPath: string;
  /** Optional scratch dir for intermediate frames; defaults to a
   *  sibling of outputPath. Cleaned up after a successful run. */
  workDir?: string;
  /** Progress callback — fires for each pipeline step so the caller
   *  can stream status to the UI. */
  onProgress?: (event: ProgressEvent) => void;
}

export interface ProgressEvent {
  step: number;
  total: number;
  label: string;
}

// ── Layout constants ─────────────────────────────────────────

const W = 1080;
const H = 1080;

// Font-family fallback: macOS has SF Pro + Helvetica Neue; Linux has DejaVu.
const FONTS = "'SF Pro Display','Helvetica Neue','Helvetica','Arial',sans-serif";

/** The bundled Pexels lifestyle clip, relative to repo root. */
const PEXELS_MONTAGE_REL = "public/video-assets/pexels-montage.mp4";

// ── Small helpers ────────────────────────────────────────────

/** XML-escape a string before it goes into an SVG text element.
 *  Without this, a bare "&" in "B&W Chart" trips sharp's libxml. */
function xe(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Nudge a hex color toward white. Used to tint chart cells so the
 *  color structure reads at-a-glance without overwhelming the grid. */
function tintHex(hex: string, amountToWhite: number): string {
  const clean = hex.replace(/^#/, "");
  const r0 = parseInt(clean.slice(0, 2), 16);
  const g0 = parseInt(clean.slice(2, 4), 16);
  const b0 = parseInt(clean.slice(4, 6), 16);
  const r = Math.round(r0 + (255 - r0) * amountToWhite);
  const g = Math.round(g0 + (255 - g0) * amountToWhite);
  const b = Math.round(b0 + (255 - b0) * amountToWhite);
  return `rgb(${r},${g},${b})`;
}

/** Perceptual luminance — lets us pick black symbol text on light cells
 *  and white on dark cells so symbols are always readable. */
function luma(hex: string): number {
  const clean = hex.replace(/^#/, "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Rasterize an SVG string to a PNG file. */
async function rasterize(svg: string, outPath: string): Promise<void> {
  await sharp(Buffer.from(svg), { density: 300 })
    .resize(W, H, { fit: "contain" })
    .png()
    .toFile(outPath);
}

/** Shared cream aida background used by every still frame. */
const CREAM_BG = `
  <defs>
    <radialGradient id="bg" cx="50%" cy="45%" r="75%">
      <stop offset="0%" stop-color="#FBF6EC"/>
      <stop offset="100%" stop-color="#F0E8D4"/>
    </radialGradient>
    <pattern id="aida" patternUnits="userSpaceOnUse" width="6" height="6">
      <rect width="6" height="6" fill="url(#bg)"/>
      <circle cx="1.5" cy="1.5" r="0.6" fill="#E5DBC2" opacity="0.5"/>
      <circle cx="4.5" cy="4.5" r="0.6" fill="#E5DBC2" opacity="0.5"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#aida)"/>
`;

// ── Derived pattern stats (mirrors src/lib/pattern-stats.ts) ─

interface DerivedStats {
  skill: string;
  timeLabel: string;
  sizeLabel14: string;
}

function deriveStats(p: VideoPatternData): DerivedStats {
  const colorCount = p.colors.length;
  const gridLong = Math.max(p.width, p.height);
  const stitches = p.totalStitches;

  const colorScore =
    colorCount <= 5 ? 0 : colorCount <= 12 ? 1 : colorCount <= 20 ? 2 : colorCount <= 30 ? 3 : 4;
  const gridScore =
    gridLong <= 50 ? 0 : gridLong <= 80 ? 1 : gridLong <= 120 ? 2 : gridLong <= 160 ? 3 : 4;
  const stitchScore =
    stitches <= 2500 ? 0 : stitches <= 6000 ? 1 : stitches <= 12000 ? 2 : stitches <= 22000 ? 3 : 4;
  const score = colorScore + gridScore + stitchScore;
  const skill =
    score <= 2 ? "Beginner" :
    score <= 5 ? "Easy" :
    score <= 8 ? "Intermediate" :
    score <= 10 ? "Advanced" : "Expert";

  const minHours = Math.max(1, Math.round(stitches / 1000));
  const maxHours = Math.max(1, Math.round(stitches / 400));
  const timeLabel = `${minHours}–${maxHours} hours`;

  const inchesW14 = Math.round((p.width / 14) * 10) / 10;
  const inchesH14 = Math.round((p.height / 14) * 10) / 10;
  const cmW14 = Math.round(((p.width / 14) * 2.54) * 10) / 10;
  const cmH14 = Math.round(((p.height / 14) * 2.54) * 10) / 10;
  const sizeLabel14 = `${inchesW14}" × ${inchesH14}"  (${cmW14} × ${cmH14} cm)`;

  return { skill, timeLabel, sizeLabel14 };
}

/** Find a win×win window with the most stitches — ensures the zoom
 *  lands on a visually busy patch instead of empty fabric. */
function pickZoomRegion(
  pattern: VideoPatternData,
  win = 20
): { x: number; y: number; w: number; h: number } {
  const w = Math.min(win, pattern.width);
  const h = Math.min(win, pattern.height);
  let best = { x: 0, y: 0, count: -1 };
  for (let y = 0; y <= pattern.height - h; y += 2) {
    for (let x = 0; x <= pattern.width - w; x += 2) {
      let count = 0;
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const dmc = pattern.grid[y + dy][x + dx];
          // Non-empty, non-background cell counts as a stitch.
          if (dmc && dmc !== pattern.backgroundDmc) count++;
        }
      }
      if (count > best.count) best = { x, y, count };
    }
  }
  return { x: best.x, y: best.y, w, h };
}

// ── Frame renderers ──────────────────────────────────────────

/** Word-wrap a string into lines that each fit within `maxChars`.
 *  Greedy wrap — fills each line up to the limit, then breaks on the
 *  next whitespace. Single words longer than the limit get their own
 *  line rather than being split mid-word. */
function wrapWords(text: string, maxChars: number): string[] {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (candidate.length <= maxChars) {
      cur = candidate;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Frame 1: Title card — pattern name + "Instant Download" subtitle.
 *
 *  Titles from the SEO pipeline run up to 140 chars (Etsy's limit), so
 *  hard-rendering them at 96pt with text-anchor="middle" used to overflow
 *  the 1080px canvas — in the video thumb the user would see the middle
 *  of the title with both sides clipped ("in a Teacup with 'Cluck Y" ).
 *
 *  Fix: shorten the displayed name to a SHORT form (drop anything after
 *  a separator like "|", ":", "—", "("; drop generic filler like "Cross
 *  Stitch Pattern", "PDF", "Digital Download"), then word-wrap to 2 lines
 *  with an adaptive font size so even a still-long title fits. The full
 *  keyword-stuffed title stays on the Etsy listing; this card just needs
 *  the HOOK. */
async function renderTitle(patternName: string, framesDir: string): Promise<void> {
  // 1. Strip keyword-spam: cut at the first separator, then drop common
  //    SEO filler words so the card reads like a title, not a tag list.
  const short = String(patternName)
    .split(/[|:\u2013\u2014(\[]/)[0]
    .replace(/\b(cross[\s-]?stitch\s+pattern|cross[\s-]?stitch|pdf|digital\s+download|counted\s+chart|instant\s+download|printable)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim() || patternName;

  // 2. Pick font size from length: longer strings need smaller type so
  //    they fit on one or two lines at 1080px. Chars-per-line is derived
  //    so the WIDTH stays roughly constant across font sizes.
  const len = short.length;
  const fontSize = len <= 22 ? 96 : len <= 40 ? 76 : len <= 60 ? 60 : 48;
  const charsPerLine = Math.max(16, Math.floor(1800 / fontSize)); // empirical
  const lines = wrapWords(short, charsPerLine).slice(0, 2); // at most 2 lines

  // 3. Center the block vertically around y=460 (below the old single
  //    line's baseline). Line height = 1.08× font so descenders don't
  //    touch the next line's caps.
  const lineH = Math.round(fontSize * 1.08);
  const blockH = lines.length * lineH;
  const startY = 460 - blockH / 2 + Math.round(fontSize * 0.9);

  const titleLines = lines
    .map((ln, i) => `    <text x="${W / 2}" y="${startY + i * lineH}" font-size="${fontSize}" font-weight="700" fill="#3A2F22" letter-spacing="-1">${xe(ln)}</text>`)
    .join("\n");

  // Rule divider + subtitle sit below the wrapped title block.
  const ruleY = startY + (lines.length - 1) * lineH + 40;
  const subtitleY = ruleY + 60;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${CREAM_BG}
  <g font-family="${FONTS}" text-anchor="middle">
${titleLines}
    <line x1="${W / 2 - 160}" y1="${ruleY}" x2="${W / 2 + 160}" y2="${ruleY}" stroke="#B8935E" stroke-width="2"/>
    <text x="${W / 2}" y="${subtitleY}" font-size="32" font-weight="400" fill="#6B5A45" letter-spacing="2">CROSS-STITCH PATTERN · INSTANT DOWNLOAD</text>
    <text x="${W / 2}" y="${H - 60}" font-size="22" font-weight="500" fill="#8B7557" opacity="0.7" letter-spacing="3">CRAFTPLAN DIGITAL</text>
  </g>
</svg>`;
  await rasterize(svg, path.join(framesDir, "01-title.png"));
}

/** Frame 2: The chart — full overview (left) + zoomed symbol inset
 *  (right) with a red dashed connector showing which patch was zoomed. */
async function renderChart(pattern: VideoPatternData, framesDir: string): Promise<void> {
  // Index colors by DMC so the per-cell lookup is O(1).
  const byDmc = new Map<string, VideoStitchColor>();
  for (const c of pattern.colors) byDmc.set(c.dmc, c);

  // Overview panel (left)
  const ovX = 60;
  const ovY = 220;
  const ovSize = 560;
  const cell = ovSize / pattern.width;

  const cells: string[] = [];
  for (let y = 0; y < pattern.height; y++) {
    for (let x = 0; x < pattern.width; x++) {
      const dmc = pattern.grid[y][x];
      if (!dmc || dmc === pattern.backgroundDmc) continue;
      const c = byDmc.get(dmc);
      if (!c) continue;
      cells.push(
        `<rect x="${(ovX + x * cell).toFixed(2)}" y="${(ovY + y * cell).toFixed(2)}" ` +
          `width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" fill="${tintHex(c.hex, 0.15)}"/>`
      );
    }
  }

  // Thin grid — bold every 10 cells, matches standard cross-stitch charts.
  const gridLines: string[] = [];
  for (let i = 0; i <= pattern.width; i++) {
    const isBold = i % 10 === 0;
    const x = ovX + i * cell;
    gridLines.push(
      `<line x1="${x.toFixed(2)}" y1="${ovY}" x2="${x.toFixed(2)}" y2="${ovY + ovSize}" ` +
        `stroke="${isBold ? "#6B5A45" : "#C9BDA0"}" stroke-width="${isBold ? 0.8 : 0.25}"/>`
    );
  }
  for (let i = 0; i <= pattern.height; i++) {
    const isBold = i % 10 === 0;
    const y = ovY + i * cell;
    gridLines.push(
      `<line x1="${ovX}" y1="${y.toFixed(2)}" x2="${ovX + ovSize}" y2="${y.toFixed(2)}" ` +
        `stroke="${isBold ? "#6B5A45" : "#C9BDA0"}" stroke-width="${isBold ? 0.8 : 0.25}"/>`
    );
  }

  // Zoom inset (right) — find the densest 20×20 region and blow it up
  // so individual DMC symbols are readable.
  const region = pickZoomRegion(pattern, 20);
  const zoX = 660;
  const zoY = 240;
  const zoSize = 380;
  const zoCell = zoSize / region.w;

  const zoomCells: string[] = [];
  for (let dy = 0; dy < region.h; dy++) {
    for (let dx = 0; dx < region.w; dx++) {
      const dmc = pattern.grid[region.y + dy][region.x + dx];
      const cx = zoX + dx * zoCell;
      const cy = zoY + dy * zoCell;
      const c = dmc && dmc !== pattern.backgroundDmc ? byDmc.get(dmc) : null;
      if (c) {
        const bg = tintHex(c.hex, 0.1);
        const textColor = luma(c.hex) > 0.6 ? "#2C1F10" : "#FFFFFF";
        zoomCells.push(
          `<rect x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" width="${zoCell.toFixed(2)}" height="${zoCell.toFixed(2)}" fill="${bg}"/>` +
            `<text x="${(cx + zoCell / 2).toFixed(2)}" y="${(cy + zoCell / 2 + 4).toFixed(2)}" ` +
            `font-family="${FONTS}" font-size="14" font-weight="700" fill="${textColor}" text-anchor="middle">${xe(c.symbol || "")}</text>`
        );
      } else {
        // Empty / background cell — show cream fabric.
        zoomCells.push(
          `<rect x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" width="${zoCell.toFixed(2)}" height="${zoCell.toFixed(2)}" fill="#FBF6EC"/>`
        );
      }
    }
  }

  // Zoom inset grid
  const zoomGrid: string[] = [];
  for (let i = 0; i <= region.w; i++) {
    const x = zoX + i * zoCell;
    zoomGrid.push(
      `<line x1="${x.toFixed(2)}" y1="${zoY}" x2="${x.toFixed(2)}" y2="${zoY + zoSize}" stroke="#9B8867" stroke-width="0.7"/>`
    );
  }
  for (let i = 0; i <= region.h; i++) {
    const y = zoY + i * zoCell;
    zoomGrid.push(
      `<line x1="${zoX}" y1="${y.toFixed(2)}" x2="${zoX + zoSize}" y2="${y.toFixed(2)}" stroke="#9B8867" stroke-width="0.7"/>`
    );
  }

  // Source rectangle + connector lines between overview and inset.
  const srcX = ovX + region.x * cell;
  const srcY = ovY + region.y * cell;
  const srcW = region.w * cell;
  const srcH = region.h * cell;
  const linkSvg = `
    <rect x="${srcX.toFixed(2)}" y="${srcY.toFixed(2)}" width="${srcW.toFixed(2)}" height="${srcH.toFixed(2)}"
          fill="none" stroke="#C85A3B" stroke-width="2.5" stroke-dasharray="6 3"/>
    <line x1="${(srcX + srcW).toFixed(2)}" y1="${srcY.toFixed(2)}" x2="${zoX}" y2="${zoY}"
          stroke="#C85A3B" stroke-width="1.2" stroke-dasharray="4 3" opacity="0.6"/>
    <line x1="${(srcX + srcW).toFixed(2)}" y1="${(srcY + srcH).toFixed(2)}" x2="${zoX}" y2="${zoY + zoSize}"
          stroke="#C85A3B" stroke-width="1.2" stroke-dasharray="4 3" opacity="0.6"/>
  `;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${CREAM_BG}
  <g font-family="${FONTS}" text-anchor="middle">
    <text x="${W / 2}" y="120" font-size="56" font-weight="700" fill="#3A2F22">The Chart</text>
    <text x="${W / 2}" y="165" font-size="24" fill="#8B7557">High-resolution chart with DMC symbols</text>
  </g>

  <!-- Overview panel -->
  <g>
    <rect x="${ovX - 6}" y="${ovY - 6}" width="${ovSize + 12}" height="${ovSize + 12}" fill="#FFFDF7" stroke="#D6CAAB" stroke-width="1.5"/>
    ${cells.join("")}
    ${gridLines.join("")}
    <rect x="${ovX}" y="${ovY}" width="${ovSize}" height="${ovSize}" fill="none" stroke="#3A2F22" stroke-width="2"/>
  </g>
  <text x="${ovX + ovSize / 2}" y="${ovY + ovSize + 40}" font-family="${FONTS}" font-size="22" font-weight="600" fill="#6B5A45" text-anchor="middle">Full chart · ${pattern.width} × ${pattern.height} cells</text>

  <!-- Zoom inset -->
  <g>
    <rect x="${zoX - 6}" y="${zoY - 6}" width="${zoSize + 12}" height="${zoSize + 12}" fill="#FFFDF7" stroke="#D6CAAB" stroke-width="1.5"/>
    ${zoomCells.join("")}
    ${zoomGrid.join("")}
    <rect x="${zoX}" y="${zoY}" width="${zoSize}" height="${zoSize}" fill="none" stroke="#3A2F22" stroke-width="2"/>
  </g>
  <text x="${zoX + zoSize / 2}" y="${zoY + zoSize + 40}" font-family="${FONTS}" font-size="22" font-weight="600" fill="#6B5A45" text-anchor="middle">Zoomed · every cell marked with a DMC symbol</text>

  ${linkSvg}

  <text x="${W / 2}" y="${H - 60}" font-family="${FONTS}" font-size="30" font-weight="600" fill="#3A2F22" text-anchor="middle">${pattern.width} × ${pattern.height} stitches  ·  ${pattern.colors.length} DMC colors  ·  ${pattern.totalStitches.toLocaleString()} stitches total</text>
</svg>`;
  await rasterize(svg, path.join(framesDir, "02-chart.png"));
}

/** Frame 3: Finished look — the gpt-image-2 render composited onto
 *  a cream-aida framed background. When no finishedImage is supplied
 *  we fall back to a chart-tinted overview so the video still builds. */
async function renderFinished(
  pattern: VideoPatternData,
  finishedImage: Buffer | undefined,
  framesDir: string
): Promise<void> {
  const artSize = 760;
  const artX = (W - artSize) / 2;
  const artY = 220;

  const stats = deriveStats(pattern);

  const chromeSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${CREAM_BG}
  <g font-family="${FONTS}" text-anchor="middle">
    <text x="${W / 2}" y="120" font-size="56" font-weight="700" fill="#3A2F22">Finished Look</text>
    <text x="${W / 2}" y="165" font-size="24" fill="#8B7557">Photoreal render of the stitched piece</text>
  </g>
  <rect x="${artX - 10}" y="${artY - 10}" width="${artSize + 20}" height="${artSize + 20}"
        fill="#FFFDF7" stroke="#B8935E" stroke-width="2"/>
  <rect x="${artX - 2}" y="${artY - 2}" width="${artSize + 4}" height="${artSize + 4}"
        fill="none" stroke="#D6CAAB" stroke-width="1"/>
  <text x="${W / 2}" y="${H - 60}" font-family="${FONTS}" font-size="26" font-weight="600" fill="#3A2F22" text-anchor="middle">On 14-count aida · ${stats.sizeLabel14}</text>
</svg>`;

  const chromeBuffer = await sharp(Buffer.from(chromeSvg), { density: 300 })
    .resize(W, H, { fit: "contain" })
    .png()
    .toBuffer();

  if (finishedImage) {
    // fit: "contain" + cream background so edge-content (text, paws) is
    // never cropped. Previous "cover" chopped bottom of designs like
    // "PAWFECT" off the frame.
    const artBuffer = await sharp(finishedImage)
      .resize(artSize, artSize, { fit: "contain", background: { r: 251, g: 246, b: 236, alpha: 1 } })
      .png()
      .toBuffer();
    await sharp(chromeBuffer)
      .composite([{ input: artBuffer, left: Math.round(artX), top: Math.round(artY) }])
      .png()
      .toFile(path.join(framesDir, "03-finished.png"));
    return;
  }

  // Fallback: draw a solid cream card where the photo would go so the
  // frame still reads as "finished piece here" without a blank hole.
  const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${artSize}" height="${artSize}">
    <rect width="${artSize}" height="${artSize}" fill="#FBF6EC"/>
    <text x="${artSize / 2}" y="${artSize / 2 + 8}" font-family="${FONTS}" font-size="28" fill="#8B7557" text-anchor="middle">Preview pending</text>
  </svg>`;
  const fallbackBuf = await sharp(Buffer.from(fallbackSvg), { density: 300 })
    .resize(artSize, artSize)
    .png()
    .toBuffer();
  await sharp(chromeBuffer)
    .composite([{ input: fallbackBuf, left: Math.round(artX), top: Math.round(artY) }])
    .png()
    .toFile(path.join(framesDir, "03-finished.png"));
}

/** Frame 3b: Mockup — wooden embroidery hoop + wall frame side-by-side.
 *  Uses the same finished-look image shown in two display contexts. */
async function renderMockup(
  finishedImage: Buffer | undefined,
  framesDir: string
): Promise<void> {
  // Layout: hoop on left, frame on right.
  const hoopOuterX = 80;
  const hoopOuterY = 260;
  const hoopOuter = 440;
  const hoopRing = 26;
  const hoopArtSize = hoopOuter - hoopRing * 2;
  const hoopArtX = hoopOuterX + hoopRing;
  const hoopArtY = hoopOuterY + hoopRing;

  const frameOuterX = 560;
  const frameOuterY = 260;
  const frameOuter = 440;
  const frameBorder = 30;
  const matSize = frameOuter - frameBorder * 2;
  const matX = frameOuterX + frameBorder;
  const matY = frameOuterY + frameBorder;
  const matPad = 20;
  const frameArtSize = matSize - matPad * 2;
  const frameArtX = matX + matPad;
  const frameArtY = matY + matPad;

  const chromeSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${CREAM_BG}
  <defs>
    <linearGradient id="woodLight" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#D4A36F"/>
      <stop offset="50%" stop-color="#B27F4A"/>
      <stop offset="100%" stop-color="#8B5A2B"/>
    </linearGradient>
    <linearGradient id="woodDark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#6B4423"/>
      <stop offset="50%" stop-color="#4A2E16"/>
      <stop offset="100%" stop-color="#2F1C0A"/>
    </linearGradient>
    <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="6"/>
      <feOffset dx="0" dy="6" result="offsetblur"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <g font-family="${FONTS}" text-anchor="middle">
    <text x="${W / 2}" y="120" font-size="56" font-weight="700" fill="#3A2F22">Display it your way</text>
    <text x="${W / 2}" y="165" font-size="24" fill="#8B7557">Mount in a wooden hoop or frame for the wall</text>
  </g>

  <ellipse cx="${hoopOuterX + hoopOuter / 2}" cy="${hoopOuterY + hoopOuter + 30}" rx="${hoopOuter * 0.45}" ry="14" fill="#000" opacity="0.12"/>
  <ellipse cx="${frameOuterX + frameOuter / 2}" cy="${frameOuterY + frameOuter + 30}" rx="${frameOuter * 0.45}" ry="14" fill="#000" opacity="0.12"/>

  <circle cx="${hoopOuterX + hoopOuter / 2}" cy="${hoopOuterY + hoopOuter / 2}" r="${hoopOuter / 2}"
          fill="url(#woodLight)" filter="url(#dropShadow)"/>
  <circle cx="${hoopArtX + hoopArtSize / 2}" cy="${hoopArtY + hoopArtSize / 2}" r="${hoopArtSize / 2}"
          fill="#FBF6EC"/>

  <g transform="translate(${hoopOuterX + hoopOuter / 2}, ${hoopOuterY - 4})">
    <rect x="-16" y="-4" width="32" height="24" rx="3" fill="#C89650" stroke="#8B6A3A" stroke-width="1"/>
    <circle cx="0" cy="8" r="3" fill="#3A2F22"/>
  </g>

  <rect x="${frameOuterX}" y="${frameOuterY}" width="${frameOuter}" height="${frameOuter}" rx="4"
        fill="url(#woodDark)" filter="url(#dropShadow)"/>
  <rect x="${frameOuterX + 6}" y="${frameOuterY + 6}" width="${frameOuter - 12}" height="${frameOuter - 12}" rx="2"
        fill="none" stroke="#1A0F05" stroke-width="1" opacity="0.5"/>
  <rect x="${matX}" y="${matY}" width="${matSize}" height="${matSize}" fill="#FAF3E3" stroke="#D6CAAB" stroke-width="1"/>

  <g font-family="${FONTS}" text-anchor="middle" font-weight="600" fill="#6B5A45">
    <text x="${hoopOuterX + hoopOuter / 2}" y="${hoopOuterY + hoopOuter + 80}" font-size="24">In a wooden hoop</text>
    <text x="${frameOuterX + frameOuter / 2}" y="${frameOuterY + frameOuter + 80}" font-size="24">Framed for the wall</text>
  </g>

  <text x="${W / 2}" y="${H - 60}" font-family="${FONTS}" font-size="28" font-weight="600" fill="#3A2F22" text-anchor="middle">Print · stitch · display</text>
</svg>`;

  const chromeBuffer = await sharp(Buffer.from(chromeSvg), { density: 300 })
    .resize(W, H, { fit: "contain" })
    .png()
    .toBuffer();

  const composites: sharp.OverlayOptions[] = [];

  if (finishedImage) {
    // fit: "contain" on cream aida so no edge-content is cropped
    // (previous "cover" chopped off bottom text like "PAWFECT").
    const aidaBg = { r: 251, g: 246, b: 236, alpha: 1 };

    const hoopMaskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${hoopArtSize}" height="${hoopArtSize}"><circle cx="${hoopArtSize / 2}" cy="${hoopArtSize / 2}" r="${hoopArtSize / 2}" fill="#fff"/></svg>`;
    const hoopArtBuf = await sharp(finishedImage)
      .resize(hoopArtSize, hoopArtSize, { fit: "contain", background: aidaBg })
      .composite([{ input: Buffer.from(hoopMaskSvg), blend: "dest-in" }])
      .png()
      .toBuffer();
    composites.push({ input: hoopArtBuf, left: Math.round(hoopArtX), top: Math.round(hoopArtY) });

    const frameArtBuf = await sharp(finishedImage)
      .resize(frameArtSize, frameArtSize, { fit: "contain", background: aidaBg })
      .png()
      .toBuffer();
    composites.push({ input: frameArtBuf, left: Math.round(frameArtX), top: Math.round(frameArtY) });
  }

  await sharp(chromeBuffer)
    .composite(composites)
    .png()
    .toFile(path.join(framesDir, "03b-mockup.png"));
}

/** Frame 4: Package contents — five "PDF" document icons fanned out
 *  to convey "multiple formats in one bundle". */
async function renderPackage(framesDir: string): Promise<void> {
  const docs = [
    { label: "Color Chart", sub: "Main" },
    { label: "B&W Chart", sub: "Ink-saver" },
    { label: "1-Page Color", sub: "Overview" },
    { label: "1-Page B&W", sub: "Overview" },
    { label: "Pattern Keeper", sub: "Mobile app" },
  ];
  const docW = 160;
  const docH = 210;
  const gap = 40;
  const totalW = docs.length * docW + (docs.length - 1) * gap;
  const startX = (W - totalW) / 2;
  const docY = 360;

  const docSvgs = docs
    .map((d, i) => {
      const x = startX + i * (docW + gap);
      const rotate = (i - 2) * 2;
      return `
    <g transform="rotate(${rotate}, ${x + docW / 2}, ${docY + docH / 2})">
      <rect x="${x}" y="${docY}" width="${docW}" height="${docH}" rx="8" fill="#FFFFFF" stroke="#B8935E" stroke-width="2"/>
      <rect x="${x + 12}" y="${docY + 18}" width="${docW - 24}" height="6" rx="2" fill="#D8B77A"/>
      <rect x="${x + 12}" y="${docY + 34}" width="${docW - 50}" height="4" rx="2" fill="#D8B77A" opacity="0.6"/>
      <g opacity="0.15">
        ${Array.from({ length: 7 }, (_, r) =>
          Array.from({ length: 5 }, (_, c) => {
            const hue = ((r + c) * 40) % 360;
            return `<rect x="${x + 20 + c * 22}" y="${docY + 60 + r * 18}" width="18" height="14" fill="hsl(${hue},40%,65%)"/>`;
          }).join("")
        ).join("")}
      </g>
      <text x="${x + docW / 2}" y="${docY + docH - 36}" font-family="${FONTS}" font-size="16" font-weight="700" fill="#3A2F22" text-anchor="middle">${xe(d.label)}</text>
      <text x="${x + docW / 2}" y="${docY + docH - 16}" font-family="${FONTS}" font-size="12" fill="#8B7557" text-anchor="middle">${xe(d.sub)}</text>
    </g>`;
    })
    .join("");

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${CREAM_BG}
  <g font-family="${FONTS}" text-anchor="middle">
    <text x="${W / 2}" y="200" font-size="56" font-weight="700" fill="#3A2F22">What's Included</text>
    <text x="${W / 2}" y="250" font-size="26" fill="#8B7557">Five printable formats in one bundle</text>
  </g>
  ${docSvgs}
  <g font-family="${FONTS}" text-anchor="middle">
    <text x="${W / 2}" y="${H - 120}" font-size="30" font-weight="600" fill="#3A2F22">Print at home · Stitch on the go</text>
  </g>
</svg>`;
  await rasterize(svg, path.join(framesDir, "04-package.png"));
}

/** Frame 5: Pattern details stats card. */
async function renderStats(pattern: VideoPatternData, framesDir: string): Promise<void> {
  const stats = deriveStats(pattern);
  const rows: Array<[string, string]> = [
    ["Pattern size", `${pattern.width} × ${pattern.height} stitches`],
    ["DMC colors", `${pattern.colors.length} threads`],
    ["Stitching time", stats.timeLabel],
    ["Skill level", stats.skill],
    ["Finished size (14ct)", stats.sizeLabel14],
    ["Total stitches", pattern.totalStitches.toLocaleString()],
  ];

  const cardX = 120;
  const cardY = 230;
  const cardW = W - 240;
  const cardH = 640;
  const rowH = 88;

  const rowSvgs = rows
    .map((r, i) => {
      const y = cardY + 70 + i * rowH;
      return `
    ${i % 2 === 1 ? `<rect x="${cardX + 20}" y="${y - 48}" width="${cardW - 40}" height="${rowH - 4}" fill="#F5EEDD" opacity="0.5"/>` : ""}
    <text x="${cardX + 50}" y="${y}" font-family="${FONTS}" font-size="26" font-weight="600" fill="#8B7557">${xe(r[0])}</text>
    <text x="${cardX + cardW - 50}" y="${y}" font-family="${FONTS}" font-size="30" font-weight="700" fill="#3A2F22" text-anchor="end">${xe(r[1])}</text>`;
    })
    .join("");

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${CREAM_BG}
  <g font-family="${FONTS}" text-anchor="middle">
    <text x="${W / 2}" y="160" font-size="56" font-weight="700" fill="#3A2F22">Pattern Details</text>
  </g>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="12" fill="#FFFDF7" stroke="#D6CAAB" stroke-width="2"/>
  ${rowSvgs}
</svg>`;
  await rasterize(svg, path.join(framesDir, "05-stats.png"));
}

/** Frame 6: End card — "CP" badge + "Instant Digital Download" message. */
async function renderEnd(framesDir: string): Promise<void> {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${CREAM_BG}
  <g font-family="${FONTS}" text-anchor="middle">
    <circle cx="${W / 2}" cy="380" r="80" fill="#C89650"/>
    <text x="${W / 2}" y="410" font-size="72" font-weight="700" fill="#FFFFFF">CP</text>
    <text x="${W / 2}" y="560" font-size="72" font-weight="700" fill="#3A2F22">Instant Digital Download</text>
    <text x="${W / 2}" y="620" font-size="30" fill="#6B5A45">Files ready the moment you purchase</text>
    <line x1="${W / 2 - 120}" y1="680" x2="${W / 2 + 120}" y2="680" stroke="#B8935E" stroke-width="2"/>
    <text x="${W / 2}" y="730" font-size="28" font-weight="500" fill="#8B7557" letter-spacing="3">CRAFTPLAN DIGITAL</text>
  </g>
</svg>`;
  await rasterize(svg, path.join(framesDir, "06-end.png"));
}

/** Prepare mockup PNG frames at 2160×2160 (2× video canvas) for ken-burns
 *  headroom — zoompan crops a 2160/zoom × 2160/zoom region and downsamples
 *  to 1080×1080, so the upscale gives us crisp output even at 1.18× zoom.
 *  Lanczos kernel for the upsample so re-sampling artefacts don't show
 *  through the GPT mockup's photoreal aida texture.
 *
 *  Returns the disk paths in HERO-FIRST order: handsStitching (real hands
 *  making it — Etsy's "show product in use") sits on slot 1 regardless of
 *  what order the auto-mockup route returned. The remaining mockups
 *  preserve their original order so the seller's expected sequence
 *  (flat-lay → lifestyle → decor) still flows.
 *
 *  Heuristic for finding handsStitching: the auto-mockup route returns
 *  scenes in DEFAULT_SCENES order which puts handsStitching at index 1
 *  (after hoopGinghamPink). But callers might shuffle, so we just match
 *  on the second scene by default and treat that as the activity shot.
 *  This is good-enough for cinematic ordering; getting it perfect would
 *  require the route to also return scene labels, which we can plumb
 *  through later if needed. */
async function prepareMockupFrames(
  mockupBuffers: Buffer[],
  framesDir: string
): Promise<string[]> {
  const HD = 2160; // 2× video canvas — gives zoompan headroom

  // Hero-first reorder: if we have ≥2 mockups, swap so the activity
  // shot (handsStitching, typically index 1) opens the body of the
  // video. Single mockup: nothing to reorder.
  const reordered = [...mockupBuffers];
  if (reordered.length >= 2) {
    const hero = reordered[1];
    reordered[1] = reordered[0];
    reordered[0] = hero;
  }

  const paths: string[] = [];
  for (let i = 0; i < reordered.length; i++) {
    const out = path.join(framesDir, `mockup-${i + 1}.png`);
    await sharp(reordered[i])
      .resize(HD, HD, {
        fit: "cover",
        kernel: "lanczos3",
      })
      .png()
      .toFile(out);
    paths.push(out);
  }
  return paths;
}

// ── ffmpeg composition ──────────────────────────────────────

interface ComposeResult {
  totalDur: number;
  hasLife: boolean;
  /** Per-clip cumulative offsets (seconds) where each clip BEGINS in the
   *  final timeline. Used by the music generator to pin chimes to story
   *  beats instead of assuming uniform clip duration. */
  clipOffsets: number[];
}

/** Per-clip rendering kind:
 *   - still:    static image, no motion
 *   - kenburns: static image with subtle zoom-in (used for mockup frames
 *               to make photoreal lifestyle shots feel like video, not slides)
 *   - video:    pre-recorded clip (lifestyleMode="free" Pexels footage) */
type ClipKind = "still" | "kenburns" | "video";

interface ClipEntry {
  src: string;
  kind: ClipKind;
  /** Per-clip duration in seconds (this version supports varying durations
   *  per clip — title/end are 1.5s, mockups are 2.5s — instead of the old
   *  single FRAME_DUR for everything). */
  duration: number;
}

async function composeVideo(
  framesDir: string,
  mockupPaths: string[],
  lifestyleClip: string | null,
  silentOut: string
): Promise<ComposeResult> {
  const FADE = 0.4;
  const hasLife = !!lifestyleClip;
  const hasMockups = mockupPaths.length > 0;

  // ── Build the clip list ──
  // Mockup-driven (NEW, default when auto-mockup ran): title + mockups + end.
  // Static-fallback (LEGACY, when no mockups): the original chart-driven deck.
  // The cinematic-mockup path is the one Etsy's video guidelines push toward;
  // the static deck only fires for cold-path renders where we don't have
  // photoreal lifestyle shots yet.
  const clips: ClipEntry[] = [];

  // 1. Title — short hook, never long. Buyers know the listing title from
  //    the listing page; the video title card is just orientation.
  clips.push({
    src: path.join(framesDir, "01-title.png"),
    kind: "still",
    duration: 1.5,
  });

  if (hasMockups) {
    // Cinematic mockup body. Each mockup gets ken-burns motion (subtle
    // zoom-in) so the video feels alive instead of slideshow-y. 2.5s per
    // mockup is long enough for the zoom to read but short enough that
    // 4 mockups stack neatly under Etsy's 15s ceiling.
    for (const mp of mockupPaths) {
      clips.push({ src: mp, kind: "kenburns", duration: 2.5 });
    }
    // Optional Pexels lifestyle clip (legacy "free" mode). We push it
    // AFTER the per-pattern mockups so unique content leads. Most call
    // sites pass lifestyleMode="none" so this is rare.
    if (hasLife && lifestyleClip) {
      clips.push({ src: lifestyleClip, kind: "video", duration: 2.5 });
    }
  } else {
    // Static fallback — keep the chart + finished frames so cold-path
    // renders still ship a usable video. Drop the package/stats/mockup-svg
    // frames that buyers find redundant (the gallery already has info cards).
    clips.push({
      src: path.join(framesDir, "02-chart.png"),
      kind: "still",
      duration: 2.5,
    });
    clips.push({
      src: path.join(framesDir, "03-finished.png"),
      kind: "still",
      duration: 2.5,
    });
    clips.push({
      src: path.join(framesDir, "03b-mockup.png"),
      kind: "still",
      duration: 2.0,
    });
    if (hasLife && lifestyleClip) {
      clips.push({ src: lifestyleClip, kind: "video", duration: 2.5 });
    }
  }

  // Final card: download CTA. Short — buyers don't need it dwelling.
  clips.push({
    src: path.join(framesDir, "06-end.png"),
    kind: "still",
    duration: 1.5,
  });

  // ── ffmpeg input args ──
  // Stills get -loop + -t (duration + fade headroom) so the xfade chain
  // can pull frames past the clip's nominal end. Videos pass through
  // unchanged (source is longer than needed).
  const inputArgs: string[] = [];
  for (const c of clips) {
    if (c.kind === "video") {
      inputArgs.push("-i", c.src);
    } else {
      inputArgs.push("-loop", "1", "-t", String(c.duration + FADE), "-i", c.src);
    }
  }

  // ── Per-input normalization filter ──
  // Every stream must exit this stage at 1080×1080 / sar=1 / yuv420p / 30fps
  // so xfade can splice them. Mockup frames get an additional zoompan
  // pass for the ken-burns effect — the upstream prepareMockupFrames
  // already upscaled them to 2160×2160 so zoompan has room to crop.
  const normalize = clips
    .map((c, i) => {
      if (c.kind === "kenburns") {
        const totalFrames = Math.max(1, Math.round(c.duration * 30));
        // Zoom from 1.00 → 1.15 over the clip's lifetime. Per-frame increment
        // = 0.15 / totalFrames. The min() cap keeps the final frame stable
        // even if zoompan over-runs by one step. x/y center the crop so
        // the zoom is around the middle of the mockup (the hoop / hands).
        const perFrame = (0.15 / totalFrames).toFixed(6);
        return (
          `[${i}:v]scale=2160:2160:force_original_aspect_ratio=increase,` +
          `crop=2160:2160,` +
          `zoompan=z='min(zoom+${perFrame},1.15)':d=1:` +
          `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
          `s=1080x1080:fps=30,` +
          `setsar=1,format=yuv420p[n${i}]`
        );
      }
      return (
        `[${i}:v]scale=1080:1080:force_original_aspect_ratio=increase,` +
        `crop=1080:1080,setsar=1,format=yuv420p,fps=30[n${i}]`
      );
    })
    .join(";");

  // ── xfade chain ──
  // Walk the cumulative timeline so xfade offsets respect per-clip durations
  // (the previous implementation assumed uniform FRAME_DUR — broke as soon
  // as clips had different lengths). Each xfade fires at `cum - FADE` so
  // clip i's fade-out overlaps clip i+1's fade-in.
  let cumOffset = clips[0].duration;
  let lastLabel = "n0";
  const xfades: string[] = [];
  const clipOffsets: number[] = [0];
  for (let i = 1; i < clips.length; i++) {
    clipOffsets.push(cumOffset - FADE * i);
    const offset = cumOffset - FADE * i;
    // Dissolve on the first mockup reveal (slot index 1 in the new layout)
    // for impact; gentler fades elsewhere. With no mockups the dissolve
    // lands on the chart frame instead — same idea, "the reveal".
    const transition = i === 1 ? "dissolve" : "fade";
    const out = i === clips.length - 1 ? "outv" : `v${i}`;
    xfades.push(
      `[${lastLabel}][n${i}]xfade=transition=${transition}:` +
        `duration=${FADE}:offset=${offset.toFixed(2)}[${out}]`
    );
    lastLabel = out;
    cumOffset += clips[i].duration;
  }

  const filterChain = normalize + ";" + xfades.join(";");
  // Total duration = sum of clip durations - (n-1)*fade overlap.
  const totalDur =
    clips.reduce((sum, c) => sum + c.duration, 0) - (clips.length - 1) * FADE;

  const args = [
    "-y",
    ...inputArgs,
    "-filter_complex", filterChain,
    "-map", "[outv]",
    "-t", totalDur.toFixed(2),
    "-c:v", "libx264",
    "-preset", "medium",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-movflags", "+faststart",
    silentOut,
  ];

  await exec("ffmpeg", args, { maxBuffer: 50 * 1024 * 1024 });
  return { totalDur, hasLife, clipOffsets };
}

// ── Music bed (royalty-free sine synthesis) ─────────────────

async function generateMusic(
  audioOut: string,
  compose: ComposeResult
): Promise<void> {
  const dur = compose.totalDur;
  const offsets = compose.clipOffsets;

  // Pin chimes to the cumulative clip offsets returned by composeVideo
  // so the timing tracks the real cut points. The previous version
  // assumed a uniform FRAME_DUR for every clip — that broke the moment
  // we moved to mixed durations (1.5s title/end vs 2.5s mockups).
  //
  //   chime 1: first cut after the title — the reveal beat
  //   chime 2: midpoint, sustains interest through the lifestyle middle
  //   chime 3: last cut so the end card / CTA lands with a sting
  //
  // Math.max(1, ...) on midIdx guards the edge case of a 2-clip timeline
  // (would only happen if both prepareMockupFrames + the static fallback
  // somehow returned empty — defensive).
  const lastIdx = offsets.length - 1;
  const midIdx = Math.max(1, Math.floor(offsets.length / 2));
  const chimeTimes = [
    offsets[1] + 0.1,
    offsets[midIdx] + 0.1,
    offsets[lastIdx] + 0.1,
  ];

  const fadeOutStart = Math.max(0, dur - 2.0);

  // Pad: C4+E4+G4+C5 major chord, low volume, long reverb tail.
  // Chimes: C5, E5, G5 sines with tight attack/decay envelopes.
  const args = [
    "-y",
    // Chord pad (inputs 0-3)
    "-f", "lavfi", "-i", `sine=frequency=261.63:duration=${dur}`,
    "-f", "lavfi", "-i", `sine=frequency=329.63:duration=${dur}`,
    "-f", "lavfi", "-i", `sine=frequency=392.00:duration=${dur}`,
    "-f", "lavfi", "-i", `sine=frequency=523.25:duration=${dur}`,
    // Chimes (inputs 4-6)
    "-f", "lavfi", "-i", `sine=frequency=523.25:duration=1.8`,
    "-f", "lavfi", "-i", `sine=frequency=659.25:duration=1.8`,
    "-f", "lavfi", "-i", `sine=frequency=783.99:duration=1.8`,
    "-filter_complex",
    [
      `[0][1][2][3]amix=inputs=4:normalize=0,volume=0.12,` +
        `aecho=0.7:0.7:60|110:0.35|0.25,` +
        `afade=t=in:st=0:d=1.2,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=2.0[pad]`,
      `[4]afade=t=in:st=0:d=0.02,afade=t=out:st=0.3:d=1.3,` +
        `volume=0.28,aecho=0.8:0.6:150:0.4,` +
        `adelay=${Math.round(chimeTimes[0] * 1000)}|${Math.round(chimeTimes[0] * 1000)}[ch1]`,
      `[5]afade=t=in:st=0:d=0.02,afade=t=out:st=0.3:d=1.3,` +
        `volume=0.32,aecho=0.8:0.6:150:0.4,` +
        `adelay=${Math.round(chimeTimes[1] * 1000)}|${Math.round(chimeTimes[1] * 1000)}[ch2]`,
      `[6]afade=t=in:st=0:d=0.02,afade=t=out:st=0.3:d=1.3,` +
        `volume=0.28,aecho=0.8:0.6:150:0.4,` +
        `adelay=${Math.round(chimeTimes[2] * 1000)}|${Math.round(chimeTimes[2] * 1000)}[ch3]`,
      `[pad][ch1][ch2][ch3]amix=inputs=4:normalize=0:duration=first[aout]`,
    ].join(";"),
    "-map", "[aout]",
    "-t", String(dur),
    "-c:a", "aac",
    "-b:a", "160k",
    audioOut,
  ];

  await exec("ffmpeg", args, { maxBuffer: 50 * 1024 * 1024 });
}

async function muxAV(
  silent: string,
  audio: string,
  finalOut: string
): Promise<void> {
  const args = [
    "-y",
    "-i", silent,
    "-i", audio,
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "160k",
    "-shortest",
    "-movflags", "+faststart",
    finalOut,
  ];
  await exec("ffmpeg", args, { maxBuffer: 50 * 1024 * 1024 });
}

// ── Main entry point ────────────────────────────────────────

/**
 * Generate a listing video MP4.
 *
 * Emits 5 progress events. Cleans up scratch frames after success;
 * leaves them for debugging on error.
 *
 * The path branches on whether `opts.lifestyleMockups` is supplied:
 *   - With mockups (default for any listing post-auto-mockup): cinematic
 *     mockup-driven video with ken-burns motion. Title + 4 mockups + end.
 *   - Without mockups (cold path / regen): legacy static slideshow with
 *     chart + finished + hoop/frame mockup-svg fallback frames.
 */
export async function generateListingVideo(opts: GenerateVideoOptions): Promise<{
  path: string;
  durationSeconds: number;
  sizeBytes: number;
}> {
  const workDir =
    opts.workDir ??
    path.join(path.dirname(opts.outputPath), ".video-" + Date.now());
  const framesDir = path.join(workDir, "frames");
  await mkdir(framesDir, { recursive: true });

  const silentPath = path.join(workDir, "silent.mp4");
  const audioPath = path.join(workDir, "audio.m4a");

  const progress = (step: number, total: number, label: string) => {
    opts.onProgress?.({ step, total, label });
  };

  const hasMockups = !!(opts.lifestyleMockups && opts.lifestyleMockups.length > 0);
  const total = 5;

  // 1. Render still SVG frames.
  //    Always: title (01) + end (06).
  //    Static-fallback only: chart (02), finished (03), mockup-svg (03b).
  //    With mockups, we skip the chart / finished / mockup-svg renders
  //    entirely — the cinematic path doesn't use them and SVG rasterization
  //    isn't free. renderPackage / renderStats are dropped from BOTH paths;
  //    those frames duplicated info already shown in the listing's
  //    info-card gallery, and Etsy explicitly discourages text-heavy
  //    slideshow videos.
  progress(1, total, "Rendering frames");
  if (hasMockups) {
    await Promise.all([
      renderTitle(opts.patternName, framesDir),
      renderEnd(framesDir),
    ]);
  } else {
    await Promise.all([
      renderTitle(opts.patternName, framesDir),
      renderChart(opts.pattern, framesDir),
      renderFinished(opts.pattern, opts.finishedImage, framesDir),
      renderMockup(opts.finishedImage, framesDir),
      renderEnd(framesDir),
    ]);
  }

  // 2. Prepare lifestyle mockups for ken-burns (cinematic path only).
  //    Resizes each PNG to 2160×2160 with lanczos3 so zoompan has crisp
  //    upscale headroom + reorders so handsStitching opens the body
  //    of the video (Etsy's "show product being made").
  progress(2, total, hasMockups ? "Preparing lifestyle mockups" : "Skipping mockup prep");
  const mockupPaths = hasMockups
    ? await prepareMockupFrames(opts.lifestyleMockups!, framesDir)
    : [];

  // 3. Compose silent video — xfade chain with ken-burns on mockup frames.
  progress(3, total, "Composing video");
  const lifestyleClip = resolveLifestyleClip(opts.lifestyleMode);
  const composeResult = await composeVideo(framesDir, mockupPaths, lifestyleClip, silentPath);

  // 4. Generate music — chime timing now derived from compose.clipOffsets.
  progress(4, total, "Generating music");
  await generateMusic(audioPath, composeResult);

  // 5. Mux A/V
  progress(5, total, "Finalizing video");
  await muxAV(silentPath, audioPath, opts.outputPath);

  // Cleanup scratch dir on success (best-effort — ignore rm errors).
  try {
    await rm(workDir, { recursive: true, force: true });
  } catch {
    /* leave scratch for debugging */
  }

  const finalBuf = await readFile(opts.outputPath);
  return {
    path: opts.outputPath,
    durationSeconds: composeResult.totalDur,
    sizeBytes: finalBuf.length,
  };
}

/** Resolve the lifestyle-clip filesystem path for a given mode. */
function resolveLifestyleClip(mode: LifestyleMode): string | null {
  if (mode === "none") return null;
  if (mode === "free") {
    const p = path.join(process.cwd(), PEXELS_MONTAGE_REL);
    if (existsSync(p)) return p;
    return null;
  }
  return null;
}
