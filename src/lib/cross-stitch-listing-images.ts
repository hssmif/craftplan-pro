// Generates professional Etsy listing images for cross-stitch pattern listings.
// All images are 2000x2000px (Etsy recommended).
//
// Design matches the Nala&Stitch visual system (top-selling Etsy shop):
//   - Green gingham background with rounded white card for hero images
//   - Clean white background for info-cards (Stitch Count + DMC legend)
//   - Bold Georgia serif headlines in sage green or dark brown
//   - Italic bullet rows, sage check-circles
//   - "Instant Download!" brush-script flourish

export interface LIStitchColor {
  dmc: string;
  name: string;
  hex: string;
  symbol: string;
  count: number;
}

export interface LIPatternData {
  grid: string[][];
  colors: LIStitchColor[];
  width: number;
  height: number;
  totalStitches: number;
  backgroundDmc?: string;
}

const S = 2000;

const COLOR = {
  ink: "#3B2418",        // deep brown — headlines
  body: "#2D2317",       // body text
  muted: "#6B5E4A",
  paper: "#FFFFFF",
  cream: "#FAF6EE",
  sage: "#6FA84A",       // bright sage (matches reference)
  sageDark: "#3E6B1E",
  sageLight: "#C9DDA9",
  sagePale: "#E6F0D6",
  ginghamA: "#A5CD7B",   // gingham dark green
  ginghamB: "#D6E9BD",   // gingham pale green
  ginghamC: "#FFFFFF",
  coral: "#D97B5C",
  red: "#E53935",
  redDark: "#B71C1C",
  line: "#E4DCC8",
  lineDark: "#C9BFA6",
} as const;

const AIDA_SENTINEL = "AIDA";

function normalizeGridValue(dmc: string | undefined | null): string {
  return typeof dmc === "string" ? dmc.trim() : "";
}

function isBackgroundCell(dmc: string | undefined | null, pattern: LIPatternData): boolean {
  const value = normalizeGridValue(dmc);
  const bg = typeof pattern.backgroundDmc === "string" ? pattern.backgroundDmc.trim() : "";
  return !value || value === AIDA_SENTINEL || (!!bg && value === bg);
}

/* ─────────────────────────── helpers ─────────────────────────── */

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Bright, slightly-wide green gingham like Nala&Stitch. */
function drawGingham(ctx: CanvasRenderingContext2D) {
  const sz = 120;
  for (let y = 0; y < S; y += sz) {
    for (let x = 0; x < S; x += sz) {
      const c = Math.floor(x / sz) % 2;
      const r = Math.floor(y / sz) % 2;
      if (c === 0 && r === 0) ctx.fillStyle = COLOR.ginghamA;
      else if (c === 1 && r === 1) ctx.fillStyle = COLOR.ginghamC;
      else ctx.fillStyle = COLOR.ginghamB;
      ctx.fillRect(x, y, sz, sz);
    }
  }
  // subtle fabric noise
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let i = 0; i < 1200; i++) {
    ctx.fillRect(Math.random() * S, Math.random() * S, 1, 1);
  }
}

/** Gingham bg + large rounded white card (matches Nala&Stitch). */
function ginghamWithCard(ctx: CanvasRenderingContext2D): { cx: number; cy: number; cw: number; ch: number } {
  drawGingham(ctx);
  const p = 120;
  const cw = S - p * 2;
  const ch = S - p * 2;

  // soft shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.12)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = COLOR.paper;
  roundRect(ctx, p, p, cw, ch, 40);
  ctx.fill();
  ctx.restore();

  return { cx: p, cy: p, cw, ch };
}

function makeCvs(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cvs = document.createElement("canvas");
  cvs.width = S;
  cvs.height = S;
  const ctx = cvs.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return [cvs, ctx];
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Draw "Instant Download!" in a brush-script style at bottom-right of gingham. */
function drawInstantDownloadFlourish(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.translate(S - 200, S - 70);
  ctx.rotate(-0.12);
  ctx.fillStyle = COLOR.sageDark;
  ctx.font = "italic bold 72px 'Brush Script MT', 'Lucida Handwriting', cursive";
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Instant Download!", 0, 0);
  // underline swoosh
  ctx.strokeStyle = COLOR.sageDark;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-340, 12);
  ctx.quadraticCurveTo(-150, 28, 10, 8);
  ctx.stroke();
  ctx.restore();
}

/** Find the densest, most colorful N×M section of the pattern for the detail crop. */
function findDensestCrop(
  pattern: LIPatternData,
  cropW: number,
  cropH: number
): { col: number; row: number } {
  const W = Math.min(cropW, pattern.width);
  const H = Math.min(cropH, pattern.height);
  let bestCol = 0, bestRow = 0, bestScore = -1;
  const stepC = Math.max(1, Math.floor((pattern.width - W) / 8));
  const stepR = Math.max(1, Math.floor((pattern.height - H) / 8));
  for (let r = 0; r <= pattern.height - H; r += stepR) {
    for (let c = 0; c <= pattern.width - W; c += stepC) {
      const seen = new Set<string>();
      let filled = 0;
      for (let dr = 0; dr < H; dr++) {
        for (let dc = 0; dc < W; dc++) {
          const v = pattern.grid[r + dr]?.[c + dc];
          if (!isBackgroundCell(v, pattern)) { seen.add(v!); filled++; }
        }
      }
      const score = seen.size * 10 + filled / (W * H) * 5;
      if (score > bestScore) {
        bestScore = score;
        bestCol = c;
        bestRow = r;
      }
    }
  }
  return { col: bestCol, row: bestRow };
}

/* ── Image 1: Pattern Example (green gingham + 2 chart crops) ─── */
// Matches Nala&Stitch reference: gingham bg, white rounded card,
// big green "PATTERN EXAMPLE" title, TWO detail crops side-by-side
// (not the whole pattern — crops are more legible & buyers see quality).
export function generatePatternExample(pattern: LIPatternData): string {
  const [cvs, ctx] = makeCvs();
  const { cx, cy, cw } = ginghamWithCard(ctx);

  // Title — bright sage green, bold serif
  ctx.fillStyle = COLOR.sage;
  ctx.font = "bold 120px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("PATTERN EXAMPLE", S / 2, cy + 180);

  // Crop a detail area — aim for 30 cols × 40 rows visible
  const cropW = Math.min(30, pattern.width);
  const cropH = Math.min(40, pattern.height);
  const { col: startCol, row: startRow } = findDensestCrop(pattern, cropW, cropH);

  const colorMap = new Map(pattern.colors.map((c) => [c.dmc, c]));

  // Two charts side-by-side
  const chartsTop = cy + 240;
  const chartsBottom = cy + cw - 180; // leave room for labels
  const chartsH = chartsBottom - chartsTop;
  const gap = 80;
  const chartW = (cw - 160 - gap) / 2;
  const chartAvailH = chartsH;

  const cellSize = Math.min(
    Math.floor(chartW / cropW),
    Math.floor(chartAvailH / cropH)
  );
  const gridW = cropW * cellSize;
  const gridH = cropH * cellSize;

  const chartX1 = cx + 80 + (chartW - gridW) / 2;
  const chartX2 = cx + 80 + chartW + gap + (chartW - gridW) / 2;
  const chartY = chartsTop + (chartAvailH - gridH) / 2;

  function drawChart(ox: number, mode: "color" | "bw") {
    // cells
    for (let r = 0; r < cropH; r++) {
      for (let c = 0; c < cropW; c++) {
        const dmc = normalizeGridValue(pattern.grid[startRow + r]?.[startCol + c]);
        if (isBackgroundCell(dmc, pattern)) continue;
        const color = colorMap.get(dmc!);
        if (!color) continue;
        const x = ox + c * cellSize;
        const y = chartY + r * cellSize;
        ctx.fillStyle = mode === "color" ? color.hex : "#FFFFFF";
        ctx.fillRect(x, y, cellSize, cellSize);
        // symbol
        ctx.fillStyle = mode === "color"
          ? (luminance(color.hex) > 0.58 ? "#2A2214" : "#FFFFFF")
          : "#1F1F1F";
        ctx.font = `bold ${Math.max(10, Math.floor(cellSize * 0.62))}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(color.symbol, x + cellSize / 2, y + cellSize / 2 + 1);
      }
    }
    // hairline grid
    ctx.strokeStyle = "rgba(35,28,20,0.18)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= cropW; x++) {
      ctx.beginPath();
      ctx.moveTo(ox + x * cellSize, chartY);
      ctx.lineTo(ox + x * cellSize, chartY + gridH);
      ctx.stroke();
    }
    for (let y = 0; y <= cropH; y++) {
      ctx.beginPath();
      ctx.moveTo(ox, chartY + y * cellSize);
      ctx.lineTo(ox + gridW, chartY + y * cellSize);
      ctx.stroke();
    }
    // bold every 5
    ctx.strokeStyle = "rgba(35,28,20,0.55)";
    ctx.lineWidth = 2;
    for (let x = 0; x <= cropW; x++) {
      if ((startCol + x) % 5 === 0) {
        ctx.beginPath();
        ctx.moveTo(ox + x * cellSize, chartY);
        ctx.lineTo(ox + x * cellSize, chartY + gridH);
        ctx.stroke();
      }
    }
    for (let y = 0; y <= cropH; y++) {
      if ((startRow + y) % 5 === 0) {
        ctx.beginPath();
        ctx.moveTo(ox, chartY + y * cellSize);
        ctx.lineTo(ox + gridW, chartY + y * cellSize);
        ctx.stroke();
      }
    }
    // outer border
    ctx.strokeStyle = "#1F1A12";
    ctx.lineWidth = 3;
    ctx.strokeRect(ox, chartY, gridW, gridH);
    // axis numbers every 5
    ctx.fillStyle = "#3A3226";
    ctx.font = "bold 22px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    for (let x = 0; x <= cropW; x += 5) {
      ctx.fillText(String(startCol + x + 1), ox + x * cellSize, chartY - 14);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let y = 0; y <= cropH; y += 5) {
      ctx.fillText(String(startRow + y + 1), ox - 10, chartY + y * cellSize);
    }
    // tiny triangle pointer at col 5 (mirrors reference)
    ctx.fillStyle = "#1F1A12";
    ctx.beginPath();
    ctx.moveTo(ox - 4, chartY + 5 * cellSize - 6);
    ctx.lineTo(ox + 6, chartY + 5 * cellSize);
    ctx.lineTo(ox - 4, chartY + 5 * cellSize + 6);
    ctx.closePath();
    ctx.fill();
  }

  drawChart(chartX1, "color");
  drawChart(chartX2, "bw");

  // SAMPLE watermark (light, diagonal) on each chart
  ctx.save();
  ctx.fillStyle = "rgba(35,28,20,0.10)";
  ctx.font = "bold italic 140px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const cxPos of [chartX1 + gridW / 2, chartX2 + gridW / 2]) {
    ctx.save();
    ctx.translate(cxPos, chartY + gridH / 2);
    ctx.rotate(-Math.PI / 2.6);
    ctx.fillText("SAMPLE", 0, 0);
    ctx.restore();
  }
  ctx.restore();

  // Labels under each chart
  ctx.fillStyle = COLOR.body;
  ctx.font = "500 46px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const labelY = chartY + gridH + 40;
  ctx.fillText("color symbols", chartX1 + gridW / 2, labelY);
  ctx.fillText("black and white symbols", chartX2 + gridW / 2, labelY);

  return cvs.toDataURL("image/png");
}

/* ── Image 2: Pattern Info (clean white) ─────────────────────── */
// Matches Nala&Stitch reference: pure white bg, "Stitch count:" big bold,
// "Finished size:" with 3 Aida rows, rendered stitched preview top-right,
// "DMC Stranded (D)" header, grid of color tiles with DMC + name + stitches + skeins.
export async function generatePatternInfoAsync(
  pattern: LIPatternData,
  patternPreviewDataUrl?: string | null
): Promise<string> {
  let img: HTMLImageElement | null = null;
  if (patternPreviewDataUrl) {
    try {
      img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error("preview decode failed"));
        im.src = patternPreviewDataUrl;
      });
    } catch {
      img = null;
    }
  }
  return generatePatternInfoSync(pattern, img);
}

export function generatePatternInfo(
  pattern: LIPatternData,
  patternPreviewDataUrl?: string | null
): string {
  return generatePatternInfoSync(pattern, null, patternPreviewDataUrl);
}

function generatePatternInfoSync(
  pattern: LIPatternData,
  preloadedImg: HTMLImageElement | null,
  _fallbackDataUrl?: string | null
): string {
  const [cvs, ctx] = makeCvs();

  // Pure white background (matches reference)
  ctx.fillStyle = COLOR.paper;
  ctx.fillRect(0, 0, S, S);

  const pad = 140;
  const tx = pad;
  let y = pad + 40;

  // ── Stitch count ──
  ctx.fillStyle = COLOR.ink;
  ctx.font = "bold 78px 'Nunito', 'Helvetica', sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Stitch count:", tx, y);

  y += 100;
  ctx.font = "bold 72px 'Nunito', 'Helvetica', sans-serif";
  ctx.fillText(`${pattern.width} x ${pattern.height} stitches`, tx, y);

  // ── Preview (top-right) ──
  const prevSize = 560;
  const prevX = S - pad - prevSize;
  const prevY = pad;

  // Use the AI-rendered stitched preview directly — same image the user
  // sees in the Convert tab "Pattern Generated" card.
  if (preloadedImg && preloadedImg.naturalWidth > 0) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(preloadedImg, prevX, prevY, prevSize, prevSize);
    ctx.restore();
  } else {
    // Fallback: render from grid
    const colorMap = new Map(pattern.colors.map((c) => [c.dmc, c]));
    const px = Math.min(prevSize / pattern.width, prevSize / pattern.height);
    const totalW = pattern.width * px;
    const totalH = pattern.height * px;
    const ox = prevX + (prevSize - totalW) / 2;
    const oy = prevY + (prevSize - totalH) / 2;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let r = 0; r < pattern.height; r++) {
      for (let c = 0; c < pattern.width; c++) {
        const dmc = normalizeGridValue(pattern.grid[r]?.[c]);
        if (isBackgroundCell(dmc, pattern)) continue;
        const color = colorMap.get(dmc!);
        if (color) {
          ctx.fillStyle = color.hex;
          ctx.fillRect(ox + c * px, oy + r * px, px + 1, px + 1);
        }
      }
    }
    ctx.restore();
  }

  // ── Finished size ──
  y += 170;
  ctx.fillStyle = COLOR.ink;
  ctx.font = "bold 78px 'Nunito', 'Helvetica', sans-serif";
  ctx.fillText("Finished size:", tx, y);

  y += 80;
  ctx.font = "600 46px 'Nunito', 'Helvetica', sans-serif";
  const counts = [14, 16, 18];
  for (const ct of counts) {
    y += 70;
    const wIn = (pattern.width / ct).toFixed(1).replace(".", ",");
    const hIn = (pattern.height / ct).toFixed(1).replace(".", ",");
    const wCm = Math.round((pattern.width / ct) * 2.54);
    const hCm = Math.round((pattern.height / ct) * 2.54);
    ctx.fillStyle = COLOR.body;
    ctx.fillText(
      `${wIn} x ${hIn} in (${wCm} x ${hCm} cm) when stitched on ${ct}-count Aida`,
      tx,
      y
    );
  }

  // ── DMC header ──
  y += 140;
  ctx.fillStyle = COLOR.ink;
  ctx.font = "bold 54px 'Nunito', 'Helvetica', sans-serif";
  ctx.fillText("DMC Stranded (D)", tx, y);

  // ── DMC tile grid ──
  // Layout: 4 columns × up to 3 rows = 12 entries visible.
  y += 60;
  const sorted = pattern.colors
    .filter((c) => c.dmc !== AIDA_SENTINEL && c.dmc !== pattern.backgroundDmc)
    .sort((a, b) => b.count - a.count);
  const cols = 4;
  const gridW = S - pad * 2;
  const colW = gridW / cols;
  const rowH = 180;
  const maxRows = Math.floor((S - pad - y) / rowH);
  const maxItems = Math.min(sorted.length, cols * maxRows, 12);

  for (let i = 0; i < maxItems; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const ox = tx + col * colW;
    const oy = y + row * rowH;
    const color = sorted[i];

    // Rounded tile with symbol inside (mimics reference icon tile)
    const tileW = 90, tileH = 90;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.08)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = color.hex;
    roundRect(ctx, ox, oy, tileW, tileH, 14);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, ox, oy, tileW, tileH, 14);
    ctx.stroke();

    // symbol inside tile
    ctx.fillStyle = luminance(color.hex) > 0.58 ? "#1F1A12" : "#FFFFFF";
    ctx.font = "bold 46px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(color.symbol, ox + tileW / 2, oy + tileH / 2 + 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    // DMC code
    ctx.fillStyle = COLOR.ink;
    ctx.font = "bold 30px 'Nunito', 'Helvetica', sans-serif";
    ctx.fillText(`D${color.dmc}`, ox + tileW + 20, oy + 32);

    // Name
    ctx.fillStyle = COLOR.body;
    ctx.font = "500 26px 'Nunito', 'Helvetica', sans-serif";
    const nm = color.name.length > 22 ? color.name.slice(0, 20) + "…" : color.name;
    ctx.fillText(nm, ox + tileW + 20, oy + 66);

    // Stitches - Skeins
    const skeins = Math.max(1, Math.ceil((color.count * 1.8) / 900));
    ctx.fillStyle = COLOR.muted;
    ctx.font = "500 22px 'Nunito', 'Helvetica', sans-serif";
    ctx.fillText(`Stitches: ${color.count} - Skeins: ${skeins}`, ox + tileW + 20, oy + 100);
  }

  return cvs.toDataURL("image/png");
}

/* ── Image 3: PDF Files Contain ──────────────────────────────── */
// Matches reference: gingham bg, rounded white card, big GREEN "PDF FILES CONTAIN:"
// title, italic serif bullet list, "Instant Download!" script flourish.
export function generatePdfContents(): string {
  const [cvs, ctx] = makeCvs();
  const { cx, cy, cw, ch } = ginghamWithCard(ctx);

  // Title
  ctx.fillStyle = COLOR.sage;
  ctx.font = "bold 118px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("PDF FILES CONTAIN:", S / 2, cy + 200);

  const items = [
    "pattern in color symbols on several\nsheets (best for printing)",
    "pattern in black and white symbols\non several sheets (best for printing)",
    "pattern in color symbols on 1 sheet\n(best for tablet)",
    "pattern in black and white symbols\non 1 sheet (best for tablet)",
    "list of DMC thread colors and skeins",
  ];

  const listX = cx + 130;
  const listY = cy + 340;
  const rowH = 170;

  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  for (let i = 0; i < items.length; i++) {
    const iy = listY + i * rowH;

    // bullet dot
    ctx.fillStyle = COLOR.body;
    ctx.beginPath();
    ctx.arc(listX, iy + 30, 10, 0, Math.PI * 2);
    ctx.fill();

    // text (italic bold serif, can be multiline)
    ctx.fillStyle = COLOR.body;
    ctx.font = "italic bold 48px Georgia, serif";
    const lines = items[i].split("\n");
    for (let li = 0; li < lines.length; li++) {
      ctx.fillText(lines[li], listX + 40, iy + li * 60);
    }
  }

  // "Instant Download!" brush-script bottom-right on the gingham edge
  drawInstantDownloadFlourish(ctx);

  return cvs.toDataURL("image/png");
}

/* ── Image 4: Digital Pattern (white bg + PDF + crossed box) ─── */
// Matches reference: white bg, big dark "DIGITAL PATTERN" title,
// PDF file icon on left, red crossed-out cardboard box on right,
// green caption + red caption.
export function generateDigitalNotice(): string {
  const [cvs, ctx] = makeCvs();

  // Pure white background
  ctx.fillStyle = COLOR.paper;
  ctx.fillRect(0, 0, S, S);

  // Title
  ctx.fillStyle = COLOR.ink;
  ctx.font = "bold 120px 'Nunito', Georgia, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("DIGITAL PATTERN", S / 2, 300);

  /* ─── Left: PDF file icon ─── */
  const leftCx = S / 4;
  const fileW = 380, fileH = 500;
  const fx = leftCx - fileW / 2, fy = 520;

  // PDF doc shape (rounded, with folded corner) — outlined in sage
  ctx.strokeStyle = COLOR.sage;
  ctx.lineWidth = 12;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Main body (leave corner cut)
  const corner = 90;
  ctx.beginPath();
  ctx.moveTo(fx + 20, fy);
  ctx.lineTo(fx + fileW - corner, fy);
  ctx.lineTo(fx + fileW, fy + corner);
  ctx.lineTo(fx + fileW, fy + fileH - 20);
  ctx.quadraticCurveTo(fx + fileW, fy + fileH, fx + fileW - 20, fy + fileH);
  ctx.lineTo(fx + 20, fy + fileH);
  ctx.quadraticCurveTo(fx, fy + fileH, fx, fy + fileH - 20);
  ctx.lineTo(fx, fy + 20);
  ctx.quadraticCurveTo(fx, fy, fx + 20, fy);
  ctx.closePath();
  ctx.stroke();

  // folded corner triangle (small)
  ctx.beginPath();
  ctx.moveTo(fx + fileW - corner, fy);
  ctx.lineTo(fx + fileW - corner, fy + corner);
  ctx.lineTo(fx + fileW, fy + corner);
  ctx.stroke();

  // "PDF" text badge
  ctx.fillStyle = COLOR.paper;
  roundRect(ctx, fx + 50, fy + 110, 200, 110, 14);
  ctx.fill();
  ctx.strokeStyle = COLOR.sage;
  ctx.lineWidth = 8;
  roundRect(ctx, fx + 50, fy + 110, 200, 110, 14);
  ctx.stroke();
  ctx.fillStyle = COLOR.ink;
  ctx.font = "bold 78px 'Nunito', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("PDF", fx + 150, fy + 168);

  // Download arrow circle (bottom of file)
  const arrCx = fx + fileW / 2, arrCy = fy + fileH - 120;
  ctx.fillStyle = COLOR.sage;
  ctx.beginPath();
  ctx.arc(arrCx, arrCy, 70, 0, Math.PI * 2);
  ctx.fill();
  // arrow
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(arrCx, arrCy - 30);
  ctx.lineTo(arrCx, arrCy + 30);
  ctx.moveTo(arrCx - 26, arrCy + 4);
  ctx.lineTo(arrCx, arrCy + 32);
  ctx.lineTo(arrCx + 26, arrCy + 4);
  ctx.stroke();

  // Green caption under file
  ctx.fillStyle = COLOR.sage;
  ctx.font = "bold 46px 'Nunito', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Instant download", leftCx, fy + fileH + 60);
  ctx.fillText("once payment is", leftCx, fy + fileH + 115);
  ctx.fillText("confirmed", leftCx, fy + fileH + 170);

  /* ─── Right: Crossed-out cardboard box ─── */
  const rightCx = (S * 3) / 4;
  const boxW = 440, boxH = 360;
  const bx = rightCx - boxW / 2, by = 620;

  // Box body
  ctx.fillStyle = "#D9BE96";
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.strokeStyle = "#1F1A12";
  ctx.lineWidth = 10;
  ctx.lineJoin = "round";
  ctx.strokeRect(bx, by, boxW, boxH);

  // Top flap horizontal line
  ctx.beginPath();
  ctx.moveTo(bx, by + 90);
  ctx.lineTo(bx + boxW, by + 90);
  ctx.stroke();

  // Center seam
  ctx.beginPath();
  ctx.moveTo(bx + boxW / 2, by);
  ctx.lineTo(bx + boxW / 2, by + 90);
  ctx.stroke();

  // Red X over the box
  ctx.strokeStyle = COLOR.red;
  ctx.lineWidth = 28;
  ctx.lineCap = "round";
  const xPad = 40;
  ctx.beginPath();
  ctx.moveTo(bx - xPad, by - xPad);
  ctx.lineTo(bx + boxW + xPad, by + boxH + xPad);
  ctx.moveTo(bx + boxW + xPad, by - xPad);
  ctx.lineTo(bx - xPad, by + boxH + xPad);
  ctx.stroke();

  // Red caption
  ctx.fillStyle = COLOR.red;
  ctx.font = "bold 46px 'Nunito', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("No physical items", rightCx, by + boxH + 80);
  ctx.fillText("will be shipped", rightCx, by + boxH + 135);

  return cvs.toDataURL("image/png");
}

/* ── Image 5: Finished result preview (lifestyle mockup) ────── */
// Shows the stitched result on a soft fabric background — buyers
// see what the final product looks like. This renders the pattern
// as if stitched on linen/canvas so customers can visualize the
// end result even without a real photo.
export async function generateFinishedResult(
  pattern: LIPatternData,
  previewDataUrl?: string | null
): Promise<string> {
  const [cvs, ctx] = makeCvs();

  // Soft sage-linen background
  const grd = ctx.createLinearGradient(0, 0, S, S);
  grd.addColorStop(0, "#D4DFC4");
  grd.addColorStop(1, "#B8C9A4");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  for (let i = 0; i < 6000; i++) ctx.fillRect(Math.random() * S, Math.random() * S, 2, 1);
  ctx.fillStyle = "rgba(40,30,15,0.04)";
  for (let i = 0; i < 3000; i++) ctx.fillRect(Math.random() * S, Math.random() * S, 1, 2);
  const vg = ctx.createRadialGradient(S / 2, S / 2, S / 3, S / 2, S / 2, S);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, S, S);

  // Use the AI-rendered stitched preview from the Convert tab DIRECTLY —
  // that's the beautiful aida-cloth-textured image you see in "Pattern
  // Generated". Just copy it through with high-quality smoothing.
  const maxDim = 1500;
  const aspect = pattern.width / pattern.height;
  const artW = aspect >= 1 ? maxDim : maxDim * aspect;
  const artH = aspect >= 1 ? maxDim / aspect : maxDim;
  const artX = (S - artW) / 2;
  const artY = (S - artH) / 2;

  // Cream aida cloth mat around the art
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = "#F7F1E2";
  ctx.fillRect(artX - 80, artY - 80, artW + 160, artH + 160);
  ctx.restore();

  let img: HTMLImageElement | null = null;
  if (previewDataUrl) {
    try {
      img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error("decode failed"));
        im.src = previewDataUrl;
      });
    } catch {
      img = null;
    }
  }

  if (img && img.naturalWidth > 0) {
    // High-quality bilinear — the AI preview is already a photo-like image,
    // so smooth scaling looks better than nearest-neighbour pixelation.
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, artX, artY, artW, artH);
    ctx.restore();
  } else {
    // Fallback only if no preview available: render from grid
    const colorMap = new Map(pattern.colors.map((c) => [c.dmc, c]));
    const cellPx = Math.min(artW / pattern.width, artH / pattern.height);
    const gx = artX + (artW - cellPx * pattern.width) / 2;
    const gy = artY + (artH - cellPx * pattern.height) / 2;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let r = 0; r < pattern.height; r++) {
      for (let c = 0; c < pattern.width; c++) {
        const dmc = normalizeGridValue(pattern.grid[r]?.[c]);
        if (isBackgroundCell(dmc, pattern)) continue;
        const color = colorMap.get(dmc!);
        if (color) {
          ctx.fillStyle = color.hex;
          ctx.fillRect(gx + c * cellPx, gy + r * cellPx, cellPx + 1, cellPx + 1);
        }
      }
    }
    ctx.restore();
  }

  return cvs.toDataURL("image/png");
}

/* ── Generate all listing images ─────────────────────────────── */
// Returns exactly 4 info cards — the rest of the 10 Etsy gallery slots
// are filled with 4 GPT-image-2 lifestyle mockups
// (src/app/api/cross-stitch/auto-mockup/route.ts) plus 2 free
// canvas-rendered hoop / template composites. Split is 4 paid mockups
// + 6 free canvas fills (4 info cards + 2 hoop renders) = 10 slots.
// Cut from 6 paid mockups → 4 on 2026-04-25 to save $0.14/listing
// without losing visual coverage; the freed slots are absorbed by
// the existing canvas hoop renders, no extra OpenAI calls needed.
//
// Card order matches the Nala&Stitch-style reference layout:
//   1. PATTERN INFO   — stitch count, finished size, DMC color legend
//   2. PATTERN EXAMPLE — color + B&W chart crops (proof of quality)
//   3. PDF CONTENTS    — bullet list of what's in the download
//   4. DIGITAL NOTICE  — instant-download + no-physical-shipping warning
//
// The lifestyle-hero role previously held by generateFinishedResult is
// now owned by the GPT mockup batch, so that function has been dropped
// from the listing-images payload (still exported for ad-hoc use).
export async function generateAllListingImagesAsync(
  pattern: LIPatternData,
  previewUrl?: string | null,
  customHeroUrl?: string | null
): Promise<string[]> {
  const info = await generatePatternInfoAsync(pattern, customHeroUrl || previewUrl);
  return [
    info,
    generatePatternExample(pattern),
    generatePdfContents(),
    generateDigitalNotice(),
  ];
}

export function generateAllListingImages(
  pattern: LIPatternData,
  previewUrl?: string | null
): string[] {
  return [
    generatePatternInfo(pattern, previewUrl),
    generatePatternExample(pattern),
    generatePdfContents(),
    generateDigitalNotice(),
  ];
}
