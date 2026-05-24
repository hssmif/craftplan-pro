import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { computePatternStats } from "@/lib/pattern-stats";

export const maxDuration = 60;

/* ─────────────────────────────────────────────────────────────
 * 5-VARIANT PATTERN BUNDLE — Etsy-top-seller parity
 *
 * Given one pattern, produce the 5 PDFs top Etsy cross-stitch shops
 * ship. Each variant is a self-contained PDF designed to be clear
 * and easy to follow for a first-time stitcher AND fast to consult
 * for a pro.
 *
 *   1. ColorSymbols          — multi-page, pastel-tint + symbols
 *   2. BlackAndWhiteSymbols  — multi-page, white + symbols only
 *   3. PatternKeeper         — chart-only (for Pattern Keeper app)
 *   4. OnePageColor          — whole pattern on 1 page + inline DMC
 *   5. OnePageBlackAndWhite  — whole pattern on 1 page, BW inline DMC
 *
 * Default response = ZIP with all 5. Client can pass {variant:"..."}
 * to request a single PDF.
 *
 * The cover page embeds the AI-rendered "finished stitch look"
 * image (when available) so buyers see exactly what they're making
 * before they thread a single needle — the single biggest trust
 * signal for a digital-download sale.
 *
 * Note: we previously shipped an .oxs (Open XStitch) native file in
 * the bundle. Removed 2026-04-22 — most buyers open the PDF, and
 * the .oxs added support-ticket surface area ("which app opens
 * this?") without pulling its weight. The buildOxs helper was
 * deleted along with the zip entry and README line.
 * ───────────────────────────────────────────────────────────── */

interface StitchColor {
  dmc: string;
  name: string;
  hex: string;
  symbol: string;
  count: number;
}

interface PatternData {
  grid: string[][];
  colors: StitchColor[];
  width: number;
  height: number;
  totalStitches: number;
  backgroundDmc?: string;
  /** Fabric count (stitches per inch). 14 and 16 are standard Aida.
   *  Drives the "Finished size" cm calc and appears on the cover. */
  fabricCount?: number;
}

type Variant =
  | "colorSymbols"
  | "bwSymbols"
  | "patternKeeper"
  | "onePageColor"
  | "onePageBw";

type ChartMode = "color" | "bw" | "colorSymbol";

/* ── Helpers ── */
const AIDA_SENTINEL = "AIDA";

function isBackgroundCell(dmc: string | undefined | null, bg?: string): boolean {
  const value = typeof dmc === "string" ? dmc.trim() : "";
  const background = typeof bg === "string" ? bg.trim() : "";
  return !value || value === AIDA_SENTINEL || (!!background && value === background);
}

function normalizeGridValue(dmc: string | undefined | null): string {
  return typeof dmc === "string" ? dmc.trim() : "";
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/**
 * CIE L* (perceptual lightness, 0-100) for a hex color.  sRGB → linear
 * RGB → relative luminance Y → L* via the CIE76 piecewise nonlinearity.
 * Used by `pastel()` to band each DMC's tint strength so dark text /
 * outline DMCs stay near their true colour and only mid/light DMCs get
 * pulled toward white.
 */
function labLightness(hex: string): number {
  const [r8, g8, b8] = hexToRgb(hex);
  const toLinear = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const Y = 0.2126 * toLinear(r8) + 0.7152 * toLinear(g8) + 0.0722 * toLinear(b8);
  const delta = 6 / 29;
  const f = Y > Math.pow(delta, 3)
    ? Math.pow(Y, 1 / 3)
    : Y / (3 * delta * delta) + 4 / 29;
  return 116 * f - 16;
}

/**
 * Soft tint toward white so the cell color stays readable BEHIND the
 * symbol overlay.
 *
 * Adaptive by perceptual lightness (L*).  A uniform 35% lerp made
 * dark text DMCs (e.g. DMC 938 / 898 / 3371 / 310) wash out to tan
 * or grey and chart text — "I Don't Need Therapy", "HONK IF
 * YOU'RE HORNY" — became unreadable in the OnePage / ColorSymbols
 * PDFs.  Banding by L* lets dark DMCs keep their colour while pale
 * DMCs (3866 Mocha Lt, 945 Tawny, ECRU) still lift enough for black
 * symbol overlays.
 *
 *   L* < 30      →   0% lerp   (full DMC colour — symbolColorOn flips
 *                               to white symbols on dark cells, so no
 *                               lift is needed for legibility)
 *   30 ≤ L* < 60 →   8% lerp   (mid colours stay nearly true, just a
 *                               printer-ink-spread defence)
 *   L* ≥ 60      →  18% lerp   (light DMCs need *some* lift because
 *                               the overlay is black; 18% gives a
 *                               creamier base without going pastel)
 *
 * 2026-05-06 retune: dropped from 10/25/40 → 0/8/18 to match the
 * richer cell colour Nala-style competitor PDFs ship.  The previous
 * mid-band 25% was visibly graying navy / forest / aubergine DMCs
 * (regions read as "muted dusty version of the colour" instead of
 * the actual hue).  Combined with raising the symbolColorOn flip
 * threshold from 140 → 150 in the same change so mid-tone cells
 * keep symbol contrast on the now-darker base colour.
 *
 * Reference: NalaAndStitch ColorSymbols PDFs.  Calibrated visually
 * against the deer-wreath, duck-text and mouse-flower test fixtures.
 */
function pastel(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  const L = labLightness(hex);
  const lerp = L < 30 ? 0.0 : L < 60 ? 0.08 : 0.18;
  return [
    Math.round(r + (255 - r) * lerp),
    Math.round(g + (255 - g) * lerp),
    Math.round(b + (255 - b) * lerp),
  ];
}

/**
 * Pick a symbol color that contrasts with the cell's tinted fill.
 * Uses Rec.709 luminance: dark cells get white symbols, light cells
 * get black symbols.  Critical for legibility — without this, a black
 * symbol on a dark green DMC cell becomes unreadable.
 *
 * 2026-05-06 retune: threshold raised 140 → 150 in lockstep with the
 * pastel() lerp drop (10/25/40 → 0/8/18).  The lower lerps mean cells
 * land at lower post-tint luminance, so the white/black flip needs to
 * trigger sooner.  Without this bump, mid-tone cells around L*=55
 * would land just above 140 (dark base + 8% lift = ~135–145) and
 * receive a black symbol that's hard to read against the now-richer
 * background.
 */
function symbolColorOn(tint: [number, number, number]): [number, number, number] {
  const lum = 0.2126 * tint[0] + 0.7152 * tint[1] + 0.0722 * tint[2];
  return lum < 150 ? [255, 255, 255] : [25, 25, 25];
}

function prettifyName(name: string): string {
  const p = name
    .replace(/\.(pdf|png|jpe?g|webp)$/i, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/^(SAMEX|MJ|DALLE?|SD|IMG|IMAGE|PHOTO|SCREENSHOT)[\s_-]+/i, "")
    .replace(/\b[a-f0-9]{4,}\b/gi, "")
    .replace(/(?:\s+\d{1,3})+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 60)
    .trim();
  return p || "Cross Stitch Pattern";
}

/* Filename-safe stem for the ZIP entries ("goose-with-a-blue-bow"). */
function fileStem(name: string): string {
  return prettifyName(name)
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "pattern";
}

/* ─── Shop identity (customizable via env) ───
 * Seller can set SHOP_NAME to override the default. Used in PDF
 * metadata, cover/footer copyright lines, license page, and README.
 * Kept server-side (no NEXT_PUBLIC_) so it doesn't leak to the bundle
 * unless intentionally shared. */
function getShopName(): string {
  const fromEnv = process.env.SHOP_NAME?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : "CraftPlan Digital";
}
function getCopyrightLine(): string {
  const year = new Date().getFullYear();
  return `© ${year} ${getShopName()}`;
}

/* ─── Pattern fingerprint (stable ID per pattern content) ───
 *
 * Deterministic base36 ID derived from the pattern grid + colors.
 * Appears in PDF metadata, license page, and on every chart-page
 * footer. Purpose:
 *
 *   (1) Traceability — if the same ID surfaces on another seller's
 *       listing we have evidence it was copied from our buyer. Each
 *       sold PDF carries this serial number in 5+ visible places.
 *   (2) Product-feel — a "serial number" makes the file feel like a
 *       licensed product rather than a throwaway download, which
 *       meaningfully reduces casual resharing. (Same psychology as
 *       serial-numbered prints.)
 *
 * Using FNV-1a (+ a second salted pass) because it's zero-dep, fast
 * enough for 150×150 grids, and collision-resistance isn't the
 * concern here — we only need "same pattern → same ID" and a low
 * chance of collision across a single shop's catalog. 16 hex chars
 * (~64 bits of state, encoded as ~8 base36 chars) is plenty. */
function fnv1a(s: string, seed = 2166136261): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
function patternFingerprint(pattern: PatternData): string {
  // Normalize: sort colors so reordering doesn't change the ID, and
  // include stitch counts so a recolor produces a different ID.
  const colorSig = pattern.colors
    .map((c) => `${c.dmc}:${c.count}`)
    .sort()
    .join(",");
  const gridSig = pattern.grid.map((row) => row.join("·")).join("|");
  const payload =
    `${pattern.width}x${pattern.height}:${pattern.totalStitches}|` +
    colorSig +
    "|" +
    gridSig;
  const h1 = fnv1a(payload);
  const h2 = fnv1a(payload + "~v2", 4211959413);
  // Encode each 32-bit hash independently to base36 and concatenate.
  // Avoids BigInt (tsconfig target < ES2020) while still carrying
  // ~60 bits of state across the two halves. Format: XS-XXXXXXXXXX
  // (10 base36 chars, upper-case, slash-free and screenshot-friendly).
  const a = h1.toString(36).toUpperCase().padStart(7, "0").slice(-5);
  const b = h2.toString(36).toUpperCase().padStart(7, "0").slice(-5);
  return `XS-${a}${b}`;
}

/* Build the list of column/row label indices:
 * 1, 5, 10, 15, ..., center-1, center, ..., final — NalaAndStitch. */
function labelIndices(startIdx: number, endIdx: number, total: number): number[] {
  const center = Math.floor(total / 2);
  const labels = new Set<number>();
  labels.add(0);
  labels.add(total - 1);
  for (let n = 5; n <= total; n += 5) {
    const idx = n - 1;
    if (idx < total) labels.add(idx);
  }
  labels.add(center);
  if (center - 1 >= 0) labels.add(center - 1);
  // Section-edge coordinates: always label the first and last cell of
  // the visible section so multi-page charts read like the Nala-style
  // reference PDFs (e.g., a section spanning columns 1..30 shows
  // "1 5 10 15 20 25 26 30" along the top, with explicit 1 and 30
  // markers at the section edges even when those aren't multiples of
  // 5).  Set membership de-duplicates when the edge already lines up
  // with an every-5 tick or the centre marker.
  labels.add(startIdx);
  if (endIdx - 1 >= 0) labels.add(endIdx - 1);
  return [...labels]
    .filter((i) => i >= startIdx && i < endIdx)
    .sort((a, b) => a - b);
}

/* Compute tight design bounding box (so empty aida doesn't inflate pages). */
function computeBounds(pattern: PatternData) {
  const bg = pattern.backgroundDmc;
  let minX = pattern.width, maxX = -1, minY = pattern.height, maxY = -1;
  for (let y = 0; y < pattern.height; y++) {
    for (let x = 0; x < pattern.width; x++) {
      const dmc = normalizeGridValue(pattern.grid[y]?.[x]);
      if (isBackgroundCell(dmc, bg)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) {
    return { minX: 0, maxX: pattern.width - 1, minY: 0, maxY: pattern.height - 1 };
  }
  return {
    minX: Math.max(0, minX - 2),
    minY: Math.max(0, minY - 2),
    maxX: Math.min(pattern.width - 1, maxX + 2),
    maxY: Math.min(pattern.height - 1, maxY + 2),
  };
}

/* ─── Chart rendering (multi-page) ─── */
function renderChartPages(
  doc: jsPDF,
  pattern: PatternData,
  colorMap: Map<string, StitchColor>,
  mode: ChartMode,
  opts: {
    pageW: number;
    pageH: number;
    margin: number;
    usableW: number;
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
    shopName: string;
    firstPageExists: boolean; // true = skip initial addPage (reuse blank first)
  }
) {
  const { pageW, pageH, margin, usableW, bounds, shopName } = opts;
  // Cells sized so each section lands at ~40 cells wide for color and
  // ~38 wide for BW (usableW ≈ 190 mm with 8 mm chartX inset = 182 mm).
  // Bigger than the previous 4.4 / 4.6 mm so symbols breathe and the
  // chart "reads bigger" without changing total page count.  BW gets a
  // small extra bump because there's no DMC fill anchoring the cells.
  const chartCellSize = mode === "bw" ? 5.0 : 4.75;
  const chartCols = Math.floor(usableW / chartCellSize);
  const chartRows = Math.floor((pageH - 38) / chartCellSize);
  const designW = bounds.maxX - bounds.minX + 1;
  const designH = bounds.maxY - bounds.minY + 1;
  const totalColPages = Math.ceil(designW / chartCols);
  const totalRowPages = Math.ceil(designH / chartRows);
  const totalSections = totalRowPages * totalColPages;

  let firstChartPage = true;

  for (let pageRow = 0; pageRow < totalRowPages; pageRow++) {
    for (let pageCol = 0; pageCol < totalColPages; pageCol++) {
      if (!(firstChartPage && opts.firstPageExists)) doc.addPage();
      firstChartPage = false;

      const startRow = bounds.minY + pageRow * chartRows;
      const startCol = bounds.minX + pageCol * chartCols;
      const endRow = Math.min(startRow + chartRows, bounds.maxY + 1);
      const endCol = Math.min(startCol + chartCols, bounds.maxX + 1);
      const sectionW = (endCol - startCol) * chartCellSize;
      const sectionH = (endRow - startRow) * chartCellSize;
      const sectionNum = pageRow * totalColPages + pageCol + 1;

      const chartX = margin + 8;
      const chartY = 20;

      // Row striping: subtle gray tint on every other 5-row band so
      // the eye can track horizontally without losing its place across
      // long sections.  Drawn FIRST so the bg sits behind cell fills
      // and gridlines.  Only applied in colorSymbol + bw modes (the
      // ones the stitcher actually reads from).
      if (mode !== "color") {
        for (let y = startRow; y < endRow; y++) {
          // Band stripe: every other group of 5 rows gets a tint
          const bandIdx = Math.floor(y / 5);
          if (bandIdx % 2 === 1) {
            doc.setFillColor(248, 246, 242); // very faint warm gray
            const ry = chartY + (y - startRow) * chartCellSize;
            doc.rect(chartX, ry, sectionW, chartCellSize, "F");
          }
        }
      }

      const bg = pattern.backgroundDmc;
      for (let y = startRow; y < endRow; y++) {
        for (let x = startCol; x < endCol; x++) {
          const dmc = normalizeGridValue(pattern.grid[y]?.[x]);
          if (isBackgroundCell(dmc, bg)) continue;
          const color = colorMap.get(dmc);
          if (!color) continue;
          const cx = chartX + (x - startCol) * chartCellSize;
          const cy = chartY + (y - startRow) * chartCellSize;

          if (mode === "color") {
            const [r, g, b] = hexToRgb(color.hex);
            doc.setFillColor(r, g, b);
            doc.rect(cx, cy, chartCellSize, chartCellSize, "F");
          } else if (mode === "colorSymbol") {
            // Tinted DMC color (35% blend toward white, see pastel()).
            // Strong enough to read the design as colored regions at a
            // glance, soft enough for a contrasting symbol to overlay.
            const tint = pastel(color.hex);
            doc.setFillColor(tint[0], tint[1], tint[2]);
            doc.rect(cx, cy, chartCellSize, chartCellSize, "F");
            // Luminance-aware symbol color so the glyph contrasts with
            // the cell instead of disappearing into a dark green or
            // navy blue.
            const [sr, sg, sb] = symbolColorOn(tint);
            doc.setTextColor(sr, sg, sb);
            doc.setFontSize(7.5);
            doc.setFont("helvetica", "bold");
            doc.text(color.symbol, cx + chartCellSize / 2, cy + chartCellSize * 0.72, {
              align: "center",
            });
          } else {
            doc.setFontSize(7.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(0, 0, 0);
            doc.text(color.symbol, cx + chartCellSize / 2, cy + chartCellSize * 0.72, {
              align: "center",
            });
          }
        }
      }

      // 3-tier grid hierarchy (matches the Nala-style reference PDFs):
      //   • 1-cell minor lines  — light grey, thin (counting at a glance)
      //   • 5-cell medium lines — black, medium thickness (every-5 anchor)
      //   • 10-cell major lines — black, bold thickness (every-10 anchor)
      //   • Outer border        — black, bold thickness
      //
      // Order matters: minor → medium → major, so the heavier strokes
      // overpaint the lighter ones when they coincide (every multiple of
      // 10 is also a multiple of 5).  Edges are drawn once by the outer
      // border `rect`, not by the per-axis loops.

      // 1-cell minor grid
      const gridGray = mode === "color" ? 160 : 130;
      doc.setDrawColor(gridGray, gridGray, gridGray);
      doc.setLineWidth(0.18);
      for (let x = startCol; x <= endCol; x++) {
        const lx = chartX + (x - startCol) * chartCellSize;
        doc.line(lx, chartY, lx, chartY + sectionH);
      }
      for (let y = startRow; y <= endRow; y++) {
        const ly = chartY + (y - startRow) * chartCellSize;
        doc.line(chartX, ly, chartX + sectionW, ly);
      }

      // 5-cell medium grid (skip every-10s — they get the major weight below)
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.45);
      for (let x = startCol + 1; x < endCol; x++) {
        if (x % 5 === 0 && x % 10 !== 0) {
          const lx = chartX + (x - startCol) * chartCellSize;
          doc.line(lx, chartY, lx, chartY + sectionH);
        }
      }
      for (let y = startRow + 1; y < endRow; y++) {
        if (y % 5 === 0 && y % 10 !== 0) {
          const ly = chartY + (y - startRow) * chartCellSize;
          doc.line(chartX, ly, chartX + sectionW, ly);
        }
      }

      // 10-cell major grid
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.95);
      for (let x = startCol + 1; x < endCol; x++) {
        if (x % 10 === 0) {
          const lx = chartX + (x - startCol) * chartCellSize;
          doc.line(lx, chartY, lx, chartY + sectionH);
        }
      }
      for (let y = startRow + 1; y < endRow; y++) {
        if (y % 10 === 0) {
          const ly = chartY + (y - startRow) * chartCellSize;
          doc.line(chartX, ly, chartX + sectionW, ly);
        }
      }

      // Outer border (matches major weight for a consistent frame)
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.95);
      doc.rect(chartX, chartY, sectionW, sectionH);

      // Column / row labels
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      const colLabels = labelIndices(startCol, endCol, pattern.width);
      for (const x of colLabels) {
        const lx = chartX + (x - startCol) * chartCellSize + chartCellSize / 2;
        doc.text(String(x + 1), lx, chartY - 2, { align: "center" });
        doc.text(String(x + 1), lx, chartY + sectionH + 4, { align: "center" });
      }
      const rowLabels = labelIndices(startRow, endRow, pattern.height);
      for (const y of rowLabels) {
        const ly = chartY + (y - startRow) * chartCellSize + chartCellSize * 0.7;
        doc.text(String(y + 1), chartX - 2, ly, { align: "right" });
        doc.text(String(y + 1), chartX + sectionW + 2, ly, { align: "left" });
      }

      // Center triangles
      const midX = Math.floor(pattern.width / 2);
      const midY = Math.floor(pattern.height / 2);
      doc.setFillColor(0, 0, 0);
      if (midX >= startCol && midX < endCol) {
        const lx = chartX + (midX - startCol) * chartCellSize;
        doc.triangle(lx - 1.4, chartY - 5, lx + 1.4, chartY - 5, lx, chartY - 2.6, "F");
        doc.triangle(
          lx - 1.4, chartY + sectionH + 5.5,
          lx + 1.4, chartY + sectionH + 5.5,
          lx, chartY + sectionH + 3.1,
          "F"
        );
      }
      if (midY >= startRow && midY < endRow) {
        const ly = chartY + (midY - startRow) * chartCellSize;
        doc.triangle(chartX - 5.5, ly - 1.4, chartX - 5.5, ly + 1.4, chartX - 3.1, ly, "F");
        doc.triangle(
          chartX + sectionW + 5.5, ly - 1.4,
          chartX + sectionW + 5.5, ly + 1.4,
          chartX + sectionW + 3.1, ly, "F"
        );
      }

      // ─── Mini page-overview map (top-right corner) ───
      // Small thumbnail of the WHOLE design with the current section
      // highlighted. Biggest usability win for multi-page charts — the
      // stitcher instantly knows where they are in the overall piece.
      if (totalSections > 1) {
        const miniMax = 24; // mm
        const miniScale = Math.min(miniMax / designW, miniMax / designH);
        const miniW = designW * miniScale;
        const miniH = designH * miniScale;
        const miniX = pageW - margin - miniW;
        const miniY = 6;
        // Light grey fill of all stitched cells so the design silhouette reads
        for (let y = bounds.minY; y <= bounds.maxY; y++) {
          for (let x = bounds.minX; x <= bounds.maxX; x++) {
            const dmc = normalizeGridValue(pattern.grid[y]?.[x]);
            if (isBackgroundCell(dmc, bg)) continue;
            const color = colorMap.get(dmc);
            if (!color) continue;
            const [r, g, b] = hexToRgb(color.hex);
            doc.setFillColor(r, g, b);
            doc.rect(
              miniX + (x - bounds.minX) * miniScale,
              miniY + (y - bounds.minY) * miniScale,
              miniScale,
              miniScale,
              "F"
            );
          }
        }
        // Outer border
        doc.setDrawColor(80, 80, 80);
        doc.setLineWidth(0.3);
        doc.rect(miniX, miniY, miniW, miniH);
        // Current section highlight — red stroke box
        const hx = miniX + (startCol - bounds.minX) * miniScale;
        const hy = miniY + (startRow - bounds.minY) * miniScale;
        const hw = (endCol - startCol) * miniScale;
        const hh = (endRow - startRow) * miniScale;
        doc.setDrawColor(220, 60, 40);
        doc.setLineWidth(0.9);
        doc.rect(hx, hy, hw, hh);
      }

      // ─── Section header (top-left): range-based navigation ───
      // "Section 3 of 12 · Rows 41–80 · Cols 25–48" is far easier to
      // follow than just "Section 3 of 12" when the stitcher is flipping
      // between pages mid-project.
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text(`Section ${sectionNum} of ${totalSections}`, margin, 10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(90, 90, 90);
      doc.text(
        `Rows ${startRow + 1}–${endRow}   ·   Cols ${startCol + 1}–${endCol}`,
        margin,
        15
      );

      // ─── Page-edge continuation markers ───
      // When a section stops mid-design, draw ▶N◀ on the edge side so the
      // stitcher knows the chart continues on another page and on exactly
      // which row/col the next section picks up. Rendered in black so the
      // only red element on the chart page is the key-map "you are here"
      // box; everything else stays neutral and printer-friendly.
      doc.setFillColor(0, 0, 0);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      if (pageCol < totalColPages - 1) {
        // Right edge — "continues →"
        const midY = chartY + sectionH / 2;
        doc.triangle(
          chartX + sectionW + 2, midY - 1.6,
          chartX + sectionW + 2, midY + 1.6,
          chartX + sectionW + 4.4, midY,
          "F"
        );
        doc.text("cont.", chartX + sectionW + 6, midY + 1, { align: "left" });
      }
      if (pageRow < totalRowPages - 1) {
        // Bottom edge — "continues ↓"
        const midX = chartX + sectionW / 2;
        doc.triangle(
          midX - 1.6, chartY + sectionH + 2,
          midX + 1.6, chartY + sectionH + 2,
          midX, chartY + sectionH + 4.4,
          "F"
        );
      }

      // Footer
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      doc.text(`Page ${doc.getNumberOfPages()}`, pageW / 2, pageH - 10, { align: "center" });
      doc.text(shopName, pageW - margin, pageH - 10, { align: "right" });
    }
  }
}

/* ─── Cover page (ColorSymbols + BwSymbols) ─── */
function renderCover(
  doc: jsPDF,
  pattern: PatternData,
  colorMap: Map<string, StitchColor>,
  title: string,
  opts: {
    pageW: number;
    pageH: number;
    margin: number;
    usableW: number;
    /** Optional "finished look" PNG data URL (AI render). Drawn as the
     *  single centered preview when present. When absent, falls back to
     *  a rendered chart thumbnail at the same size. */
    finishedLook?: string | null;
    /** Optional pattern fingerprint — appears in small text in the
     *  footer for traceability. */
    patternId?: string;
  }
) {
  const { pageW, pageH, margin, usableW, finishedLook, patternId } = opts;
  const stats = computePatternStats(pattern);
  const bg = pattern.backgroundDmc;

  /* ── Title ── */
  const titleFontSize = title.length <= 24 ? 28 : title.length <= 38 ? 22 : 18;
  doc.setFontSize(titleFontSize);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  const titleLines = doc.splitTextToSize(title, usableW);
  const titleY = 28;
  doc.text(titleLines, pageW / 2, titleY, { align: "center" });

  /* ── Decorative divider under the title ── */
  const dividerY = titleY + titleLines.length * (titleFontSize * 0.35) + 6;
  doc.setDrawColor(180, 150, 110);
  doc.setLineWidth(0.6);
  doc.line(pageW / 2 - 28, dividerY, pageW / 2 + 28, dividerY);

  /* ── Single centered preview image ──
   *
   * Use the AI "finished look" render (gpt-image-2 stitch-art image)
   * when supplied — that's the buyer's "this is what I'm making"
   * trust signal and the same image used on the Etsy listing photos.
   * Falls back to a rendered chart thumbnail when no AI preview is
   * available (early state of a new product or seller hasn't run
   * Design yet). */
  const previewMax = 150; // mm — large hero so the AI render reads as the cover (Etsy-listing trust signal)
  const previewTop = dividerY + 14;

  const drawChartThumb = (tx: number, ty: number, tw: number, th: number) => {
    const cell = Math.min(tw / pattern.width, th / pattern.height);
    const w = pattern.width * cell;
    const h = pattern.height * cell;
    const cx = tx + (tw - w) / 2;
    const cy = ty + (th - h) / 2;
    doc.setFillColor(252, 250, 246);
    doc.rect(tx, ty, tw, th, "F");
    for (let y = 0; y < pattern.height; y++) {
      for (let x = 0; x < pattern.width; x++) {
        const dmc = normalizeGridValue(pattern.grid[y][x]);
        if (isBackgroundCell(dmc, bg)) continue;
        const color = colorMap.get(dmc);
        if (!color) continue;
        const [r, g, b] = hexToRgb(color.hex);
        doc.setFillColor(r, g, b);
        doc.rect(cx + x * cell, cy + y * cell, cell, cell, "F");
      }
    }
  };

  const previewX = (pageW - previewMax) / 2;
  if (finishedLook) {
    try {
      doc.addImage(
        finishedLook, "PNG", previewX, previewTop, previewMax, previewMax,
        undefined, "FAST",
      );
    } catch {
      drawChartThumb(previewX, previewTop, previewMax, previewMax);
    }
  } else {
    drawChartThumb(previewX, previewTop, previewMax, previewMax);
  }
  // Thin border around the preview — matches the Nala reference frame
  doc.setDrawColor(200, 195, 185);
  doc.setLineWidth(0.4);
  doc.rect(previewX, previewTop, previewMax, previewMax);

  /* ── Centered metadata stack ──
   *
   * Five Nala-style centered lines: pattern size · fabric count ·
   * finished size · total stitches · total skeins. Plus one small
   * "Also: 14ct / 18ct" alt-fabric line so buyers who don't stitch
   * on 16ct can still pick the matching size from the cover. */
  const fabricCount =
    pattern.fabricCount && pattern.fabricCount > 0 ? pattern.fabricCount : 16;
  // stats.sizes is [11ct, 14ct, 16ct, 18ct]
  const idxFor = (n: number) => (n === 11 ? 0 : n === 14 ? 1 : n === 18 ? 3 : 2);
  const main = stats.sizes[idxFor(fabricCount)];
  const alt14 = stats.sizes[1];
  const alt18 = stats.sizes[3];

  // Skein estimate — same heuristic as elsewhere in the file: skein-m
  // ≈ stitches × 1.6 × 2 / 100, then ceil(/ 8) per colour, summed.
  const sortedColors = [...pattern.colors]
    .filter((c) => !bg || c.dmc !== bg)
    .sort((a, b) => b.count - a.count);
  const totalSkeinsEstimate = sortedColors.reduce((sum, c) => {
    const lengthM = (c.count * 1.6 * 2) / 100;
    return sum + Math.max(1, Math.ceil(lengthM / 8));
  }, 0);

  const metaTop = previewTop + previewMax + 18;
  const metaLineH = 6.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(45, 40, 35);

  const metaRows = [
    `Pattern size: ${pattern.width} × ${pattern.height} stitches`,
    `Fabric count: ${fabricCount}-count Aida`,
    `Finished size: ${main.cmW} × ${main.cmH} cm  (${main.inchesW}" × ${main.inchesH}")`,
    `Total stitches: ${pattern.totalStitches.toLocaleString()}`,
    `Total skeins: ${totalSkeinsEstimate}`,
  ];
  metaRows.forEach((row, i) => {
    doc.text(row, pageW / 2, metaTop + i * metaLineH, { align: "center" });
  });

  // Alternative fabric counts on a single muted line below
  doc.setFontSize(9);
  doc.setTextColor(125, 115, 100);
  doc.text(
    `Also: 14-ct ${alt14.cmW} × ${alt14.cmH} cm  ·  18-ct ${alt18.cmW} × ${alt18.cmH} cm`,
    pageW / 2,
    metaTop + metaRows.length * metaLineH + 5,
    { align: "center" },
  );

  /* ── Footer card — clean text branding ──
   *
   * Three centered lines:
   *   1. Shop name (bold)
   *   2. © {year} ShopName · Personal use only
   *   3. Pattern ID: {pid}   (small, only if supplied)
   *
   * No logo glyph or "thank you" copy — that read as marketing fluff
   * on the previous cover. The card border matches the preview-frame
   * tone for visual cohesion. */
  const cardFH = patternId ? 22 : 18;
  const cardFY = pageH - cardFH - 16;
  const cardFX = margin + 24;
  const cardFW = usableW - 48;
  doc.setFillColor(245, 240, 232);
  doc.setDrawColor(220, 210, 190);
  doc.setLineWidth(0.4);
  doc.roundedRect(cardFX, cardFY, cardFW, cardFH, 3, 3, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(60, 45, 30);
  doc.text(getShopName(), pageW / 2, cardFY + 7.5, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(110, 95, 75);
  doc.text(
    `${getCopyrightLine()}  ·  Personal use only`,
    pageW / 2,
    cardFY + 13,
    { align: "center" },
  );

  if (patternId) {
    doc.setFontSize(7.5);
    doc.setTextColor(150, 135, 115);
    doc.text(`Pattern ID: ${patternId}`, pageW / 2, cardFY + 18, {
      align: "center",
    });
  }
}

/* ─── DMC legend page(s) ─── */
function renderLegend(
  doc: jsPDF,
  pattern: PatternData,
  opts: { pageW: number; pageH: number; margin: number; usableW: number; blackAndWhite: boolean }
) {
  const { pageW, pageH, margin, usableW, blackAndWhite } = opts;
  const bg = pattern.backgroundDmc;
  const stitchedColors = bg ? pattern.colors.filter((c) => c.dmc !== bg) : pattern.colors;
  const sortedColors = [...stitchedColors].sort((a, b) => b.count - a.count);

  doc.addPage();
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("DMC Thread List", margin, 18);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  doc.text(
    `${stitchedColors.length} colors · ${pattern.totalStitches.toLocaleString()} total stitches`,
    margin,
    24
  );

  const colX = {
    n: margin + 2,
    symbol: margin + 10,
    color: margin + 22,
    dmc: margin + 38,
    name: margin + 56,
    stitches: margin + 108,
    length: margin + 134,
    skeins: margin + 160,
  };

  function header(y: number) {
    doc.setFillColor(240, 235, 225);
    doc.rect(margin, y - 4, usableW, 7, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 40, 100);
    doc.text("N", colX.n, y);
    doc.text("SYM", colX.symbol, y);
    doc.text("COLOR", colX.color, y);
    doc.text("DMC #", colX.dmc, y);
    doc.text("NAME", colX.name, y);
    doc.text("STITCHES", colX.stitches, y);
    doc.text("LENGTH", colX.length, y);
    doc.text("SKEINS", colX.skeins, y);
    doc.setDrawColor(160, 140, 100);
    doc.setLineWidth(0.3);
    doc.line(margin, y + 2, pageW - margin, y + 2);
  }

  let y = 32;
  header(y);
  y += 8;
  let shade = false;
  let idx = 0;
  for (const color of sortedColors) {
    idx += 1;
    if (y > pageH - 20) {
      doc.addPage();
      y = 18;
      header(y);
      y += 8;
      shade = false;
    }
    if (shade) {
      doc.setFillColor(250, 247, 240);
      doc.rect(margin, y - 4, usableW, 6.5, "F");
    }
    shade = !shade;

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text(String(idx), colX.n, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);

    if (blackAndWhite) {
      doc.setDrawColor(130, 130, 130);
      doc.setLineWidth(0.2);
      doc.rect(colX.color, y - 3, 12, 4.5);
    } else {
      const [r, g, b] = hexToRgb(color.hex);
      doc.setFillColor(r, g, b);
      doc.rect(colX.color, y - 3, 12, 4.5, "F");
      doc.setDrawColor(130, 130, 130);
      doc.setLineWidth(0.15);
      doc.rect(colX.color, y - 3, 12, 4.5);
    }

    if (blackAndWhite) {
      doc.setDrawColor(120, 120, 120);
      doc.setLineWidth(0.2);
      doc.rect(colX.symbol - 1.5, y - 3, 6, 4.5);
      doc.setTextColor(0, 0, 0);
    } else {
      // Symbol swatch on the legend mirrors the chart-cell rendering:
      // tinted DMC color as fill, luminance-aware symbol overlay.
      // Same buyer scans both the chart cell and the legend swatch
      // and they should look identical.
      const tint = pastel(color.hex);
      doc.setFillColor(tint[0], tint[1], tint[2]);
      doc.rect(colX.symbol - 1.5, y - 3, 6, 4.5, "F");
      const [sr, sg, sb] = symbolColorOn(tint);
      doc.setTextColor(sr, sg, sb);
    }
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(color.symbol, colX.symbol + 1.5, y, { align: "center" });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(color.dmc, colX.dmc, y);
    const displayName = color.name.length > 26 ? color.name.slice(0, 24) + ".." : color.name;
    doc.text(displayName, colX.name, y);
    doc.text(color.count.toLocaleString(), colX.stitches, y);
    const lengthM = (color.count * 1.6 * 2) / 100;
    doc.text(`${lengthM.toFixed(1)}m`, colX.length, y);
    const skeins = Math.max(1, Math.ceil(lengthM / 8));
    doc.text(String(skeins), colX.skeins, y);
    y += 6.5;
  }

  y += 4;
  if (y < pageH - 15) {
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.text(
      "Thread estimates: 14-count Aida, 2 strands per cross. Add 15–20% for safety. 1 DMC skein ~ 8m of 6-strand floss.",
      margin + 2,
      y
    );
  }
}

/* ─── One-page layout (OnePageColor + OnePageBw) ───
 * Chart fills most of the page (cell size computed to fit). Inline DMC
 * legend strip below: a boxed symbol + "D{code}" for each color, wrapped
 * to however many rows fit. Stats + shop footer at the bottom. */
function renderOnePage(
  doc: jsPDF,
  pattern: PatternData,
  colorMap: Map<string, StitchColor>,
  title: string,
  blackAndWhite: boolean,
  opts: {
    pageW: number;
    pageH: number;
    margin: number;
    usableW: number;
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
    /** Optional — when provided, rendered in the footer next to the
     *  copyright line as a traceable serial number. */
    patternId?: string;
  }
) {
  const { pageW, pageH, margin, usableW, bounds } = opts;
  const bg = pattern.backgroundDmc;
  const stitchedColors = bg ? pattern.colors.filter((c) => c.dmc !== bg) : pattern.colors;
  const sortedColors = [...stitchedColors].sort((a, b) => b.count - a.count);

  const designW = bounds.maxX - bounds.minX + 1;
  const designH = bounds.maxY - bounds.minY + 1;

  // Reserve space: top 10mm header, bottom 60mm for legend + stats + footer
  const chartTopY = 10;
  const chartAvailH = pageH - chartTopY - 60;
  const cellW = usableW / designW;
  const cellH = chartAvailH / designH;
  const cell = Math.min(cellW, cellH);
  const chartW = cell * designW;
  const chartH = cell * designH;
  const chartX = (pageW - chartW) / 2;
  const chartY = chartTopY;

  // Cells
  //
  // Color mode: tinted DMC fill + luminance-aware symbol. The same
  // symbolColorOn() call the multi-page chart uses, so a black DMC
  // (310, 939, etc.) doesn't swallow its glyph against a mid-grey
  // pastel cell.
  //
  // Symbol-size formula bumped to cell × 1.8 (was 1.5) with min 4.5pt /
  // max 8pt and threshold lowered to 1.5mm (was 1.8mm). At common
  // OnePage cell sizes (≈1.6–2.2mm for 100×100ish patterns on A4), the
  // old combination hit the 4pt floor or skipped symbols entirely;
  // 4.5–6pt at the same cell sizes is the smallest that still reads at
  // home-printer DPI.
  // OnePage = SCREEN / TABLET OVERVIEW only.
  //
  // No per-cell symbols: at 142×142 on A4 the cell is ≈ 1.3 mm, so any
  // glyph becomes a 4.5-pt speck the eye reads as confetti.  The
  // multi-page ColorSymbols / BlackAndWhiteSymbols PDFs are the actual
  // printable charts — they have 4.75–5.0 mm cells where symbols are
  // unambiguous.  This page just shows what the design looks like.
  //
  // Color mode renders pastel-tinted DMC fills (the design as a flat
  // colour map).  BW mode renders every stitched cell as a soft dark
  // silhouette so the OnePageBlackAndWhite isn't a blank white square
  // — without symbols and without colour fills there'd be nothing to
  // render.  The silhouette gives the buyer a quick "shape of the
  // design" reference at a glance.
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const dmc = normalizeGridValue(pattern.grid[y]?.[x]);
      if (isBackgroundCell(dmc, bg)) continue;
      const color = colorMap.get(dmc);
      if (!color) continue;
      const cx = chartX + (x - bounds.minX) * cell;
      const cy = chartY + (y - bounds.minY) * cell;
      if (blackAndWhite) {
        // Soft dark silhouette — readable on screen, prints cleanly.
        doc.setFillColor(60, 60, 60);
      } else {
        const tint = pastel(color.hex);
        doc.setFillColor(tint[0], tint[1], tint[2]);
      }
      doc.rect(cx, cy, cell, cell, "F");
    }
  }

  // Grids — contrast tuned to match the multi-page chart pages, which
  // already render at the right strength. BW gets a darker minor grid
  // (130 vs 160) because there's no fill colour anchoring each cell, so
  // the grid itself has to do all the cell-boundary work.
  const minorGray = blackAndWhite ? 130 : 160;
  doc.setDrawColor(minorGray, minorGray, minorGray);
  doc.setLineWidth(0.14);
  for (let i = 0; i <= designW; i++) {
    const lx = chartX + i * cell;
    doc.line(lx, chartY, lx, chartY + chartH);
  }
  for (let i = 0; i <= designH; i++) {
    const ly = chartY + i * cell;
    doc.line(chartX, ly, chartX + chartW, ly);
  }
  // Major every 5
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  for (let i = 0; i <= designW; i++) {
    const absX = bounds.minX + i;
    if (absX % 5 === 0 || i === 0 || i === designW) {
      const lx = chartX + i * cell;
      doc.line(lx, chartY, lx, chartY + chartH);
    }
  }
  for (let i = 0; i <= designH; i++) {
    const absY = bounds.minY + i;
    if (absY % 5 === 0 || i === 0 || i === designH) {
      const ly = chartY + i * cell;
      doc.line(chartX, ly, chartX + chartW, ly);
    }
  }
  doc.setLineWidth(0.8);
  doc.rect(chartX, chartY, chartW, chartH);

  // Column/row labels (sparse — every 5 + endpoints)
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  for (let i = 0; i <= designW; i++) {
    const absX = bounds.minX + i;
    if (absX % 5 === 0 || i === 0 || i === designW - 1) {
      const lx = chartX + i * cell + cell / 2;
      doc.text(String(absX + 1), lx, chartY - 1.2, { align: "center" });
      doc.text(String(absX + 1), lx, chartY + chartH + 3, { align: "center" });
    }
  }
  for (let i = 0; i < designH; i++) {
    const absY = bounds.minY + i;
    if (absY % 5 === 0 || i === 0 || i === designH - 1) {
      const ly = chartY + i * cell + cell * 0.7;
      doc.text(String(absY + 1), chartX - 1, ly, { align: "right" });
      doc.text(String(absY + 1), chartX + chartW + 1, ly, { align: "left" });
    }
  }

  // Stats + inline DMC strip below chart
  const statsY = chartY + chartH + 10;
  const fabricCount = pattern.fabricCount && pattern.fabricCount > 0 ? pattern.fabricCount : 14;
  const finishedCmW = ((pattern.width / fabricCount) * 2.54).toFixed(0);
  const finishedCmH = ((pattern.height / fabricCount) * 2.54).toFixed(0);
  const totalSkeins = sortedColors.reduce((sum, c) => {
    const lengthM = (c.count * 1.6 * 2) / 100;
    return sum + Math.max(1, Math.ceil(lengthM / 8));
  }, 0);
  const onePageStats = computePatternStats(pattern);

  // Two-row stats band: first row = size/count/finished, second row =
  // stitches + skeins + time + skill. Breaking it to two rows keeps
  // the text at size 9 and readable even on a small screen; cramming
  // everything into one line forces a tiny size 7 that defeats the
  // purpose of a printable quick-reference.
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(20, 20, 20);
  const statsLine1 = `Pattern size: ${pattern.width} × ${pattern.height}    Fabric: ${fabricCount}-count    Finished: ${finishedCmW} × ${finishedCmH} cm`;
  const statsLine2 = `Stitches: ${pattern.totalStitches.toLocaleString()}    Skeins: ${totalSkeins}    Stitching time: ${onePageStats.time.label}    Skill: ${onePageStats.difficulty.label}`;
  doc.text(statsLine1, margin, statsY);
  doc.setTextColor(60, 60, 60);
  doc.text(statsLine2, margin, statsY + 4.5);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 20, 20);
  doc.text("DMC Stranded (D)", margin, statsY + 11);

  // Legend chips: [ sym ] D###  count , 4-column grid with overflow.
  //
  // 4 columns is wide enough to fit "D{code}  {count}" comfortably at
  // fontSize 8 (the widest realistic case is "DECRU  9,999" which needs
  // ~22mm of text, and each chip's text area is ~33mm). It's also the
  // density Nala-style references use — denser grids feel cramped on
  // screen and bleed below the footer when colour counts are high.
  //
  // Overflow: chips that won't fit above the footer are replaced with a
  // single "+N more — see DMC list" message in the last visible slot.
  // The DMC Thread List page in the bundled multi-page variants has the
  // full legend, so nothing is lost — the OnePage just stops claiming
  // to be exhaustive.
  doc.setFont("helvetica", "normal");
  const chipsPerRow = 4;
  const chipGap = 4;
  const chipW = (usableW - chipGap * (chipsPerRow - 1)) / chipsPerRow;
  const chipH = 7;
  const rowGap = 3;
  const rowHeight = chipH + rowGap;
  const legendStartY = statsY + 17;
  // Stop 4mm above the footer band so chips never collide with the
  // shop card / copyright line.
  const legendMaxY = pageH - 22;
  const maxRows = Math.max(1, Math.floor((legendMaxY - legendStartY) / rowHeight));
  const totalSlots = chipsPerRow * maxRows;
  const overflow = sortedColors.length > totalSlots;
  const visibleCount = Math.max(
    0,
    overflow ? totalSlots - 1 : sortedColors.length,
  );
  const overflowN = sortedColors.length - visibleCount;

  let cx = margin;
  let cy = legendStartY;
  for (let i = 0; i < visibleCount; i++) {
    const c = sortedColors[i];
    // symbol box
    let chipTint: [number, number, number] | null = null;
    if (blackAndWhite) {
      doc.setDrawColor(100, 100, 100);
      doc.setLineWidth(0.3);
      doc.rect(cx, cy, chipH, chipH);
    } else {
      chipTint = pastel(c.hex);
      doc.setFillColor(chipTint[0], chipTint[1], chipTint[2]);
      doc.rect(cx, cy, chipH, chipH, "F");
      doc.setDrawColor(100, 100, 100);
      doc.setLineWidth(0.2);
      doc.rect(cx, cy, chipH, chipH);
    }
    // Symbol colour: auto-contrast on the tinted chip so dark DMCs
    // after the new adaptive pastel (e.g. DMC 310 at 10% lerp) don't
    // swallow a black symbol.  BW chips keep black on white outline.
    if (chipTint) {
      const [sr, sg, sb] = symbolColorOn(chipTint);
      doc.setTextColor(sr, sg, sb);
    } else {
      doc.setTextColor(0, 0, 0);
    }
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(c.symbol, cx + chipH / 2, cy + chipH * 0.72, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(40, 40, 40);
    doc.text(
      `D${c.dmc}  ${c.count.toLocaleString()}`,
      cx + chipH + 1.5,
      cy + chipH * 0.72,
    );

    if ((i + 1) % chipsPerRow === 0) {
      cx = margin;
      cy += rowHeight;
    } else {
      cx += chipW + chipGap;
    }
  }

  if (overflow) {
    // (cx, cy) already points at the next free slot from the loop's
    // wrap logic — render the overflow note there, italic + grey, so
    // it reads as a soft callout rather than another chip.
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text(
      `+${overflowN} more — see DMC list`,
      cx,
      cy + chipH * 0.72,
    );
  }

  // Footer — shop card + traceable ID
  const footerY = pageH - 18;
  doc.setFillColor(200, 150, 80);
  doc.circle(margin + 4, footerY + 1, 3.5, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("CP", margin + 4, footerY + 2, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.text(getCopyrightLine(), margin + 10, footerY);
  // Personal-use + ID sub-line — small, grey, but present on every
  // copy so the page is self-identifying even if cropped or photographed.
  if (opts.patternId) {
    doc.setFontSize(7);
    doc.setTextColor(130, 120, 100);
    doc.text(
      `Personal use only  ·  No resale or redistribution  ·  Pattern ID: ${opts.patternId}`,
      margin + 10,
      footerY + 4
    );
  }
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text(title, pageW - margin, footerY, { align: "right" });
}

/* ─── License / Terms page ───
 *
 * One-page "how you're allowed to use this pattern" card, inserted as
 * the 2nd page of the multi-page variants (after the cover, before
 * the DMC legend). Not added to patternKeeper (the PK app imports raw
 * chart pages and an extra page would confuse the import) nor to the
 * one-page variants (which get a diagonal watermark instead).
 *
 * Three sections, colour-coded so buyers scan the ✓ / ✗ at a glance:
 *   - What you CAN do (green)  — personal stitching, gifts, photos
 *   - What you CANNOT do (red) — resale, redistribution, file sharing
 *   - About your Pattern ID    — explains the serial number and that
 *                                piracy is traceable
 *
 * The goal is deterrent, not legalese — most casual file-sharers stop
 * when they realize the file is traceable. The same page doubles as a
 * visible "© Shop Name" watermark between cover and chart, so even if
 * only the chart pages leak, ownership is still clear.
 */
function renderLicensePage(
  doc: jsPDF,
  title: string,
  patternId: string,
  shopName: string,
  opts: { pageW: number; pageH: number; margin: number; usableW: number }
): void {
  const { pageW, pageH, margin, usableW } = opts;
  doc.addPage();

  // Header band
  doc.setFillColor(245, 240, 232);
  doc.rect(0, 0, pageW, 32, "F");
  doc.setDrawColor(220, 210, 190);
  doc.setLineWidth(0.3);
  doc.line(0, 32, pageW, 32);

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(40, 30, 20);
  doc.text("License & Usage Terms", margin, 16);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110, 95, 75);
  doc.text(title, margin, 23);

  // Pattern ID badge (top-right)
  const badgeW = 56;
  const badgeH = 11;
  const badgeX = pageW - margin - badgeW;
  const badgeY = 11;
  doc.setFillColor(60, 45, 30);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 2.5, 2.5, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 180, 150);
  doc.text("PATTERN ID", badgeX + badgeW / 2, badgeY + 4, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(patternId, badgeX + badgeW / 2, badgeY + 9, { align: "center" });

  let y = 48;
  const section = (
    heading: string,
    body: string[],
    rgb: [number, number, number]
  ) => {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    doc.text(heading, margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(45, 40, 35);
    for (const bullet of body) {
      const lines = doc.splitTextToSize("•  " + bullet, usableW - 4);
      doc.text(lines, margin + 2, y);
      y += lines.length * 4.6 + 1.2;
    }
    y += 4;
  };

  section(
    "What you CAN do",
    [
      "Stitch this pattern as many times as you like, for yourself and your own household.",
      "Give finished stitched pieces to family and friends as gifts.",
      "Share photos of your finished work on social media — we'd love to be tagged.",
      "Sell a small number of stitched finished pieces (up to 10) at local markets, with credit to the designer.",
    ],
    [50, 110, 60]
  );
  section(
    "What you CANNOT do",
    [
      "Resell, re-upload, or redistribute the PDF (or any image of the chart pages) in any form.",
      "Share the file with friends, post it to Discord / Telegram / Facebook groups, or upload to file-sharing sites.",
      "List the pattern on Etsy, eBay, Ravelry, or any marketplace under your own name.",
      "Use the chart or artwork in a paid class, tutorial, or commercial product without written permission.",
      "Mass-produce finished pieces from this pattern for commercial sale.",
    ],
    [170, 55, 45]
  );
  section(
    "About your Pattern ID",
    [
      `Every pattern we sell carries a unique ID (shown top-right and on every chart page of this file).`,
      `If this ID ever surfaces in a pattern being sold or shared by anyone other than ${shopName}, it was copied from an original buyer — and we trace it back.`,
      `We actively monitor marketplaces and file-sharing sites. Reports lead to DMCA takedowns and Etsy buyer bans.`,
    ],
    [80, 60, 130]
  );

  // Footer
  doc.setDrawColor(220, 210, 190);
  doc.setLineWidth(0.2);
  doc.line(margin, pageH - 18, pageW - margin, pageH - 18);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(140, 130, 110);
  doc.text(
    `${getCopyrightLine()}  ·  All rights reserved  ·  Personal use only`,
    pageW / 2,
    pageH - 12,
    { align: "center" }
  );
}

/* ─── Variant builders ─── */
function buildVariant(
  variant: Variant,
  pattern: PatternData,
  colorMap: Map<string, StitchColor>,
  title: string,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  /** AI-rendered "finished look" PNG data URL, shown on covers of
   *  multi-page variants. Optional — covers degrade gracefully when
   *  omitted (a larger chart thumbnail replaces the two-tile layout). */
  finishedLook?: string | null,
  /** Precomputed pattern fingerprint — passed in so every variant in
   *  a bundle shares the same ID and so we don't rehash the grid per
   *  variant (expensive for 150×150+ patterns). */
  patternId?: string
): ArrayBuffer {
  // `compress: true` is the single biggest size win for this document —
  // a 150×150 ColorSymbols bundle is ~95% vector ops (rects + text) and
  // without zlib streams jsPDF 4 emits them as raw ASCII, which blew
  // through Etsy's 20 MB per-file digital-download limit ("Lavender
  // Sprigs-ColorSymbols.pdf exceeds the maximum file size"). Turning
  // compression on cuts the output ~3–5x for pure-vector PDFs and costs
  // a few hundred ms of CPU at generate time — fair trade for the
  // listing actually reaching Etsy.
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  const pageW = 210;
  const pageH = 297;
  const margin = 12;
  const usableW = pageW - margin * 2;
  const shopNameOwner = getShopName();
  const copyrightLine = getCopyrightLine();
  // Footer text shown on every chart page: copyright + personal-use
  // notice + traceable ID. Three signals in one line that this is a
  // licensed copy, not a freely-shareable chart.
  const pid = patternId || patternFingerprint(pattern);
  const shopName = `${copyrightLine}  ·  Personal use only  ·  ID: ${pid}`;
  const pageOpts = { pageW, pageH, margin, usableW };
  const coverOpts = { ...pageOpts, finishedLook, patternId: pid };

  /* PDF metadata — makes the file self-describe as a licensed product
   * in every PDF reader's properties dialog, and embeds the pattern ID
   * so it's recoverable even if all visible watermarks are cropped. */
  doc.setProperties({
    title: `${title} — Cross-Stitch Pattern`,
    subject: `Licensed cross-stitch pattern. Personal use only. No resale or redistribution. Pattern ID: ${pid}`,
    author: shopNameOwner,
    creator: shopNameOwner,
    keywords: `cross-stitch, pattern, ${shopNameOwner}, ${pid}, licensed, personal-use-only`,
  });

  if (variant === "colorSymbols") {
    renderCover(doc, pattern, colorMap, title, coverOpts);
    renderLicensePage(doc, title, pid, shopNameOwner, pageOpts);
    renderLegend(doc, pattern, { ...pageOpts, blackAndWhite: false });
    renderChartPages(doc, pattern, colorMap, "colorSymbol", {
      ...pageOpts, bounds, shopName, firstPageExists: false,
    });
  } else if (variant === "bwSymbols") {
    renderCover(doc, pattern, colorMap, title, coverOpts);
    renderLicensePage(doc, title, pid, shopNameOwner, pageOpts);
    renderLegend(doc, pattern, { ...pageOpts, blackAndWhite: true });
    renderChartPages(doc, pattern, colorMap, "bw", {
      ...pageOpts, bounds, shopName, firstPageExists: false,
    });
  } else if (variant === "patternKeeper") {
    // No cover, no legend, no license page — the PK app imports raw
    // chart pages and extra pages break import flow. Protection here
    // comes from PDF metadata + footer on every chart page.
    renderChartPages(doc, pattern, colorMap, "colorSymbol", {
      ...pageOpts, bounds, shopName, firstPageExists: true,
    });
  } else if (variant === "onePageColor") {
    // No diagonal watermark — Pattern ID stays in the footer (line +
    // PDF metadata + chart-page footers).  The watermark made the
    // OnePage variants feel like watermarked previews, not paid
    // products.  Removed 2026-04-30 as part of the customer-PDF
    // polish pass.
    renderOnePage(doc, pattern, colorMap, title, false, { ...pageOpts, bounds, patternId: pid });
  } else {
    // onePageBw — same rationale, no watermark.
    renderOnePage(doc, pattern, colorMap, title, true, { ...pageOpts, bounds, patternId: pid });
  }

  return doc.output("arraybuffer");
}

/* ─── POST /api/cross-stitch/export-pdf ─── */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const pattern: PatternData = body.pattern;
    const name: string = body.name || "cross-stitch-pattern";
    const variant: Variant | "bundle" = body.variant || "bundle";
    // AI-rendered "finished stitch look" data URL (PNG). Optional —
    // when the seller hasn't generated an AI preview yet, covers
    // gracefully fall back to a larger chart-thumbnail-only layout.
    const finishedLook: string | null =
      typeof body.finishedLook === "string" && body.finishedLook.startsWith("data:")
        ? body.finishedLook
        : null;

    if (!pattern || !pattern.grid || !pattern.colors) {
      return NextResponse.json({ error: "Invalid pattern data" }, { status: 400 });
    }

    const colorMap = new Map<string, StitchColor>();
    for (const c of pattern.colors) colorMap.set(c.dmc, c);

    const title = prettifyName(name);
    const stem = fileStem(name);
    const bounds = computeBounds(pattern);
    // Compute the pattern ID once — all five variants in a bundle
    // share the same ID so the buyer sees one consistent serial
    // across every file in the download.
    const patternId = patternFingerprint(pattern);

    if (variant !== "bundle") {
      const pdfBuf = buildVariant(
        variant,
        pattern,
        colorMap,
        title,
        bounds,
        finishedLook,
        patternId
      );
      const suffix = {
        colorSymbols: "ColorSymbols",
        bwSymbols: "BlackAndWhiteSymbols",
        patternKeeper: "PatternKeeper",
        onePageColor: "OnePageColor",
        onePageBw: "OnePageBlackAndWhite",
      }[variant];
      return new NextResponse(Buffer.from(pdfBuf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${stem}-${suffix}.pdf"`,
          "Content-Length": String(pdfBuf.byteLength),
          // Expose the pattern ID so the client can show it in the UI
          // ("Your pattern's ID: XS-XXXXXXXX") and store it alongside
          // the Etsy listing for piracy-report tracking.
          "X-Pattern-Id": patternId,
        },
      });
    }

    // Bundle: all 5 variants zipped — matches what top Etsy shops ship.
    const zip = new JSZip();
    const variants: [Variant, string][] = [
      ["colorSymbols", `${stem}-ColorSymbols.pdf`],
      ["bwSymbols", `${stem}-BlackAndWhiteSymbols.pdf`],
      ["patternKeeper", `PatternKeeper-${stem}.pdf`],
      ["onePageColor", `${stem}-OnePageColor.pdf`],
      ["onePageBw", `${stem}-OnePageBlackAndWhite.pdf`],
    ];
    for (const [v, fname] of variants) {
      const buf = buildVariant(v, pattern, colorMap, title, bounds, finishedLook, patternId);
      zip.file(fname, buf);
    }

    // README so buyers know what each file is for — avoids confused
    // support tickets like "which file do I open?" Rewritten to be
    // less Etsy-generic, more "here's how to use your bundle":
    // top-down reading order (main chart first), clear one-line
    // purpose per file, explicit "which one should I print?"
    // guidance at the bottom. Also includes the Pattern ID + a short
    // license notice so the terms travel with the bundle, not just
    // inside the PDFs.
    const shopForReadme = getShopName();
    const readme =
      `${title}\n` +
      `Cross-Stitch Pattern Bundle\n` +
      `================================================\n` +
      `Pattern ID: ${patternId}\n` +
      `================================================\n\n` +
      `Thank you for your purchase! This ZIP contains everything\n` +
      `you need to stitch the design. Five PDFs — pick the one\n` +
      `that fits how you like to work:\n\n` +
      `MAIN CHART (start here)\n` +
      `-----------------------\n` +
      `  ${stem}-ColorSymbols.pdf\n` +
      `    Multi-page colour-tinted chart with DMC symbols.\n` +
      `    The easiest format for most stitchers. Start here.\n\n` +
      `INK-SAVER VERSION\n` +
      `-----------------\n` +
      `  ${stem}-BlackAndWhiteSymbols.pdf\n` +
      `    Identical chart, symbols only. Print this if your\n` +
      `    printer is low on colour ink or you prefer a\n` +
      `    monochrome reference.\n\n` +
      `QUICK REFERENCE (single page)\n` +
      `-----------------------------\n` +
      `  ${stem}-OnePageColor.pdf\n` +
      `  ${stem}-OnePageBlackAndWhite.pdf\n` +
      `    The entire design on one page plus an inline DMC\n` +
      `    legend. Great for planning, for a wall reference,\n` +
      `    or for stitching small designs straight from it.\n\n` +
      `MOBILE STITCHERS\n` +
      `----------------\n` +
      `  PatternKeeper-${stem}.pdf\n` +
      `    Chart-only version (no cover, no legend). Import\n` +
      `    this into the free Pattern Keeper app on iOS or\n` +
      `    Android for progress-tracking on your phone.\n\n` +
      `--------------------------------------------------\n` +
      `WHICH ONE SHOULD I PRINT?\n` +
      `  - Stitching at home  →  ${stem}-ColorSymbols.pdf\n` +
      `  - Saving on ink      →  ${stem}-BlackAndWhiteSymbols.pdf\n` +
      `  - Stitching on phone →  PatternKeeper-${stem}.pdf\n\n` +
      `--------------------------------------------------\n` +
      `LICENSE — PLEASE READ\n` +
      `--------------------------------------------------\n` +
      `This pattern is licensed to you for personal use only.\n` +
      `\n` +
      `YOU CAN:\n` +
      `  • Stitch as many copies as you like, for yourself.\n` +
      `  • Give stitched pieces to friends and family.\n` +
      `  • Share finished-work photos (please tag us).\n` +
      `  • Sell a small number (up to 10) of finished\n` +
      `    stitched pieces at local markets.\n` +
      `\n` +
      `YOU CANNOT:\n` +
      `  • Resell, re-upload, or share the PDF files.\n` +
      `  • List this pattern on Etsy, eBay, or other\n` +
      `    marketplaces under your own name.\n` +
      `  • Post the chart images on forums, Discord,\n` +
      `    Telegram, or file-sharing sites.\n` +
      `  • Use the chart in a paid class or commercial\n` +
      `    product without written permission.\n` +
      `\n` +
      `Every pattern we sell carries the unique ID above.\n` +
      `If this ID surfaces anywhere other than ${shopForReadme},\n` +
      `it's a copy — and we trace and report piracy.\n\n` +
      `Happy stitching — we can't wait to see what you make.\n\n` +
      `${getCopyrightLine()}  ·  All rights reserved\n`;
    zip.file(`README.txt`, readme);

    const zipBuf = await zip.generateAsync({ type: "nodebuffer" });

    return new NextResponse(new Uint8Array(zipBuf), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${stem}-pattern-bundle.zip"`,
        "Content-Length": String(zipBuf.length),
        // Same as the single-variant branch — makes the ID available
        // to the UI without having to parse the ZIP or a PDF.
        "X-Pattern-Id": patternId,
      },
    });
  } catch (err) {
    console.error("PDF export error:", err);
    const msg = err instanceof Error ? err.message : "PDF export failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
