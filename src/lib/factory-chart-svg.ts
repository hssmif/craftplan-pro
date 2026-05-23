// ══════════════════════════════════════════════════════════════
// SVG Chart Renderer for the Spreadsheet Factory
//
// Generates beautiful, palette-matched chart SVGs from ChartSpec
// data, then converts to PNG via `sharp` so they can be embedded
// in the workbook via `ws.addImage()`.
//
// Why this exists: ExcelJS cannot write native chart objects to
// .xlsx files (long-standing library limitation). Image-based
// charts give us:
//   - Full control over palette / typography / style
//   - 100% Excel + Google Sheets render compatibility
//   - No external Chart.js / node-canvas / native compilation
//
// Trade-off: charts are preview images. They display perfectly
// in Excel and in Etsy listing screenshots but do not auto-update
// when the buyer edits underlying cells. That's an acceptable
// trade for shipping a beautiful template today.
// ══════════════════════════════════════════════════════════════

import sharp from "sharp";
import type { ChartSpec } from "./factory-spreadsheet-spec";

// Palette fallback used when ChartSpec doesn't supply seriesColors.
const DEFAULT_COLORS = [
  "#5C7558", // dark sage
  "#9AAE94", // sage
  "#E5BAA8", // dusty peach
  "#C9B8A0", // taupe
  "#8B6232", // amber
  "#C9D4C5", // light sage
];

export interface ChartPngResult {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Render a ChartSpec to a PNG buffer.
 * Generates SVG internally, converts via sharp.
 */
export async function renderChartPng(chart: ChartSpec): Promise<ChartPngResult> {
  const width = chart.size?.width ?? 600;
  const height = chart.size?.height ?? 380;
  const svg = renderChartSvg(chart, width, height);

  const buffer = await sharp(Buffer.from(svg), { density: 200 })
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();

  return { buffer, width, height };
}

// ─── SVG generation ─────────────────────────────────────────

function renderChartSvg(chart: ChartSpec, w: number, h: number): string {
  const colors = (chart.seriesColors && chart.seriesColors.length > 0)
    ? chart.seriesColors.map(normalizeHex)
    : DEFAULT_COLORS;
  const title = chart.title || "";
  const data = chart.data || { categories: [], series: [] };

  switch (chart.type) {
    case "column":
      return columnChart(data, colors, title, w, h, chart.legend);
    case "bar":
      return barChart(data, colors, title, w, h, chart.legend);
    case "line":
      return lineChart(data, colors, title, w, h, chart.legend);
    case "area":
      return areaChart(data, colors, title, w, h, chart.legend);
    case "pie":
      return pieChart(data, colors, title, w, h, false, chart.legend);
    case "doughnut":
      return pieChart(data, colors, title, w, h, true, chart.legend);
    default:
      return columnChart(data, colors, title, w, h, chart.legend);
  }
}

interface ChartData {
  categories: string[];
  series: Array<{ name: string; values: number[] }>;
}

// ─── Common helpers ─────────────────────────────────────────

function svgWrap(inner: string, w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="Arial, sans-serif" style="background:#FFFFFF">
${inner}
</svg>`;
}

function titleEl(title: string, w: number, y = 28): string {
  if (!title) return "";
  return `<text x="${w / 2}" y="${y}" font-family="Georgia, serif" font-size="16" font-weight="700" fill="#2D3A2A" text-anchor="middle">${escapeXml(title)}</text>`;
}

function legendEl(
  series: Array<{ name: string }>,
  colors: string[],
  position: "b" | "t" | "r" | "l" | "none" | undefined,
  plot: { x: number; y: number; w: number; h: number },
  chartW: number,
  chartH: number,
): string {
  if (position === "none" || series.length <= 1) return "";
  const itemW = 110;
  const total = series.length * itemW;
  let startX = (chartW - total) / 2;
  let startY = chartH - 18;
  if (position === "t") startY = 50;
  if (position === "r") {
    startX = plot.x + plot.w + 14;
    startY = plot.y + 8;
  }
  return series
    .map((s, i) => {
      const x = position === "r" ? startX : startX + i * itemW;
      const y = position === "r" ? startY + i * 18 : startY;
      const c = colors[i % colors.length];
      return `<g transform="translate(${x},${y})">
        <rect x="0" y="-9" width="10" height="10" rx="2" fill="${c}"/>
        <text x="16" y="0" font-size="11" fill="#444">${escapeXml(s.name)}</text>
      </g>`;
    })
    .join("");
}

function gridLines(
  yScale: (v: number) => number,
  yTicks: number[],
  plot: { x: number; y: number; w: number; h: number },
): string {
  return yTicks
    .map((t) => {
      const y = yScale(t);
      return `<line x1="${plot.x}" x2="${plot.x + plot.w}" y1="${y}" y2="${y}" stroke="#E8E2D3" stroke-width="1"/>
        <text x="${plot.x - 6}" y="${y + 3}" font-size="9" fill="#888" text-anchor="end">${formatTick(t)}</text>`;
    })
    .join("");
}

function makeYTicks(maxVal: number): number[] {
  if (maxVal <= 0) return [0];
  const magnitude = Math.pow(10, Math.floor(Math.log10(maxVal)));
  const step = magnitude * (maxVal / magnitude > 5 ? 2 : maxVal / magnitude > 2 ? 1 : 0.5);
  const ticks: number[] = [];
  for (let v = 0; v <= maxVal * 1.05; v += step) ticks.push(Math.round(v));
  return ticks;
}

function formatTick(v: number): string {
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + "k";
  return String(v);
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "\"": return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });
}

function normalizeHex(c: string): string {
  let s = c.trim();
  if (!s.startsWith("#")) s = "#" + s;
  // Strip ARGB alpha if present (8-char including #)
  if (s.length === 9) s = "#" + s.slice(3);
  return s;
}

// ─── Column chart (vertical bars) ───────────────────────────

function columnChart(
  data: ChartData,
  colors: string[],
  title: string,
  w: number,
  h: number,
  legendPos: ChartSpec["legend"],
): string {
  const padTop = title ? 56 : 28;
  const padBot = 48;
  const padL = 56;
  const padR = legendPos === "r" ? 130 : 24;
  const plot = { x: padL, y: padTop, w: w - padL - padR, h: h - padTop - padBot };

  const cats = data.categories;
  const series = data.series;
  const groupW = plot.w / Math.max(cats.length, 1);
  const barGap = 6;
  const barW = Math.max(4, (groupW - barGap * 2) / Math.max(series.length, 1));

  const allVals = series.flatMap((s) => s.values);
  const maxV = Math.max(1, ...allVals);
  const yTicks = makeYTicks(maxV);
  const yMax = yTicks[yTicks.length - 1] || maxV;
  const yScale = (v: number) => plot.y + plot.h - (v / yMax) * plot.h;

  const bars = cats
    .map((cat, ci) => {
      const groupX = plot.x + ci * groupW + barGap;
      return series
        .map((s, si) => {
          const v = s.values[ci] || 0;
          const x = groupX + si * barW;
          const y = yScale(v);
          const barH = plot.y + plot.h - y;
          return `<rect x="${x}" y="${y}" width="${barW - 2}" height="${barH}" fill="${colors[si % colors.length]}" rx="2"/>`;
        })
        .join("");
    })
    .join("");

  const catLabels = cats
    .map((c, i) => {
      const x = plot.x + i * groupW + groupW / 2;
      return `<text x="${x}" y="${plot.y + plot.h + 18}" font-size="10" fill="#666" text-anchor="middle">${escapeXml(c)}</text>`;
    })
    .join("");

  return svgWrap(
    `${titleEl(title, w)}
${gridLines(yScale, yTicks, plot)}
${bars}
${catLabels}
${legendEl(series, colors, legendPos, plot, w, h)}`,
    w,
    h,
  );
}

// ─── Bar chart (horizontal) ─────────────────────────────────

function barChart(
  data: ChartData,
  colors: string[],
  title: string,
  w: number,
  h: number,
  legendPos: ChartSpec["legend"],
): string {
  const padTop = title ? 56 : 28;
  const padBot = 28;
  const padL = 120;
  const padR = legendPos === "r" ? 130 : 24;
  const plot = { x: padL, y: padTop, w: w - padL - padR, h: h - padTop - padBot };

  const cats = data.categories;
  const series = data.series;
  const rowH = plot.h / Math.max(cats.length, 1);
  const seriesCount = Math.max(series.length, 1);
  const barH = Math.max(4, (rowH - 6) / seriesCount);

  const allVals = series.flatMap((s) => s.values);
  const maxV = Math.max(1, ...allVals);
  const xTicks = makeYTicks(maxV);
  const xMax = xTicks[xTicks.length - 1] || maxV;
  const xScale = (v: number) => plot.x + (v / xMax) * plot.w;

  const bars = cats
    .map((cat, ci) => {
      const rowY = plot.y + ci * rowH + 4;
      return series
        .map((s, si) => {
          const v = s.values[ci] || 0;
          const y = rowY + si * barH;
          return `<rect x="${plot.x}" y="${y}" width="${xScale(v) - plot.x}" height="${barH - 2}" fill="${colors[si % colors.length]}" rx="2"/>`;
        })
        .join("");
    })
    .join("");

  const catLabels = cats
    .map((c, i) => {
      const y = plot.y + i * rowH + rowH / 2 + 3;
      return `<text x="${plot.x - 8}" y="${y}" font-size="10" fill="#444" text-anchor="end">${escapeXml(c)}</text>`;
    })
    .join("");

  // X grid
  const xGrid = xTicks
    .map((t) => {
      const x = xScale(t);
      return `<line x1="${x}" x2="${x}" y1="${plot.y}" y2="${plot.y + plot.h}" stroke="#E8E2D3"/>
        <text x="${x}" y="${plot.y + plot.h + 16}" font-size="9" fill="#888" text-anchor="middle">${formatTick(t)}</text>`;
    })
    .join("");

  return svgWrap(
    `${titleEl(title, w)}
${xGrid}
${bars}
${catLabels}
${legendEl(series, colors, legendPos, plot, w, h)}`,
    w,
    h,
  );
}

// ─── Line chart ─────────────────────────────────────────────

function lineChart(
  data: ChartData,
  colors: string[],
  title: string,
  w: number,
  h: number,
  legendPos: ChartSpec["legend"],
): string {
  const padTop = title ? 56 : 28;
  const padBot = 48;
  const padL = 56;
  const padR = legendPos === "r" ? 130 : 24;
  const plot = { x: padL, y: padTop, w: w - padL - padR, h: h - padTop - padBot };

  const cats = data.categories;
  const series = data.series;
  const allVals = series.flatMap((s) => s.values);
  const maxV = Math.max(1, ...allVals);
  const yTicks = makeYTicks(maxV);
  const yMax = yTicks[yTicks.length - 1] || maxV;
  const yScale = (v: number) => plot.y + plot.h - (v / yMax) * plot.h;
  const xStep = plot.w / Math.max(cats.length - 1, 1);
  const xPos = (i: number) => plot.x + i * xStep;

  const lines = series
    .map((s, si) => {
      const c = colors[si % colors.length];
      const pts = s.values
        .map((v, i) => `${xPos(i)},${yScale(v)}`)
        .join(" ");
      const dots = s.values
        .map((v, i) => `<circle cx="${xPos(i)}" cy="${yScale(v)}" r="3" fill="${c}"/>`)
        .join("");
      return `<polyline fill="none" stroke="${c}" stroke-width="2.5" points="${pts}"/>${dots}`;
    })
    .join("");

  const catLabels = cats
    .map((c, i) => {
      return `<text x="${xPos(i)}" y="${plot.y + plot.h + 18}" font-size="10" fill="#666" text-anchor="middle">${escapeXml(c)}</text>`;
    })
    .join("");

  return svgWrap(
    `${titleEl(title, w)}
${gridLines(yScale, yTicks, plot)}
${lines}
${catLabels}
${legendEl(series, colors, legendPos, plot, w, h)}`,
    w,
    h,
  );
}

// ─── Area chart ─────────────────────────────────────────────

function areaChart(
  data: ChartData,
  colors: string[],
  title: string,
  w: number,
  h: number,
  legendPos: ChartSpec["legend"],
): string {
  const padTop = title ? 56 : 28;
  const padBot = 48;
  const padL = 56;
  const padR = legendPos === "r" ? 130 : 24;
  const plot = { x: padL, y: padTop, w: w - padL - padR, h: h - padTop - padBot };

  const cats = data.categories;
  const series = data.series;
  const allVals = series.flatMap((s) => s.values);
  const maxV = Math.max(1, ...allVals);
  const yTicks = makeYTicks(maxV);
  const yMax = yTicks[yTicks.length - 1] || maxV;
  const yScale = (v: number) => plot.y + plot.h - (v / yMax) * plot.h;
  const xStep = plot.w / Math.max(cats.length - 1, 1);
  const xPos = (i: number) => plot.x + i * xStep;

  const areas = series
    .map((s, si) => {
      const c = colors[si % colors.length];
      const pts = s.values.map((v, i) => `${xPos(i)},${yScale(v)}`).join(" ");
      const polygon = `${plot.x},${plot.y + plot.h} ${pts} ${plot.x + plot.w},${plot.y + plot.h}`;
      return `<polygon fill="${c}" fill-opacity="0.45" points="${polygon}"/>
        <polyline fill="none" stroke="${c}" stroke-width="2" points="${pts}"/>`;
    })
    .join("");

  const catLabels = cats
    .map((c, i) => {
      return `<text x="${xPos(i)}" y="${plot.y + plot.h + 18}" font-size="10" fill="#666" text-anchor="middle">${escapeXml(c)}</text>`;
    })
    .join("");

  return svgWrap(
    `${titleEl(title, w)}
${gridLines(yScale, yTicks, plot)}
${areas}
${catLabels}
${legendEl(series, colors, legendPos, plot, w, h)}`,
    w,
    h,
  );
}

// ─── Pie / Doughnut ─────────────────────────────────────────

function pieChart(
  data: ChartData,
  colors: string[],
  title: string,
  w: number,
  h: number,
  doughnut: boolean,
  legendPos: ChartSpec["legend"],
): string {
  const padTop = title ? 56 : 28;
  const padBot = 24;
  const cx = (w - (legendPos === "r" ? 140 : 0)) / 2;
  const cy = (h + padTop - padBot) / 2;
  const r = Math.min(cx, cy - padTop / 2) * 0.85;
  const innerR = doughnut ? r * 0.55 : 0;

  // Pie uses series[0]'s values, categories are the labels
  const values = data.series[0]?.values ?? [];
  const labels = data.categories;
  const total = values.reduce((a, b) => a + b, 0) || 1;

  let cumAngle = -Math.PI / 2;
  const slices = values
    .map((v, i) => {
      const angle = (v / total) * Math.PI * 2;
      const a0 = cumAngle;
      const a1 = cumAngle + angle;
      cumAngle = a1;
      const x0 = cx + Math.cos(a0) * r;
      const y0 = cy + Math.sin(a0) * r;
      const x1 = cx + Math.cos(a1) * r;
      const y1 = cy + Math.sin(a1) * r;
      const largeArc = angle > Math.PI ? 1 : 0;

      if (doughnut) {
        const x0i = cx + Math.cos(a0) * innerR;
        const y0i = cy + Math.sin(a0) * innerR;
        const x1i = cx + Math.cos(a1) * innerR;
        const y1i = cy + Math.sin(a1) * innerR;
        const d = `M ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1} L ${x1i} ${y1i} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x0i} ${y0i} Z`;
        return `<path d="${d}" fill="${colors[i % colors.length]}" stroke="#FFFFFF" stroke-width="2"/>`;
      } else {
        const d = `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1} Z`;
        return `<path d="${d}" fill="${colors[i % colors.length]}" stroke="#FFFFFF" stroke-width="2"/>`;
      }
    })
    .join("");

  // Doughnut center text (total)
  const centerText = doughnut
    ? `<text x="${cx}" y="${cy + 4}" font-family="Georgia, serif" font-size="14" font-weight="700" fill="#2D3A2A" text-anchor="middle">${formatTick(total)}</text>`
    : "";

  const fakeSeries = labels.map((name, i) => ({ name }));
  const plot = { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };

  return svgWrap(
    `${titleEl(title, w)}
${slices}
${centerText}
${legendEl(fakeSeries, colors, legendPos ?? "r", plot, w, h)}`,
    w,
    h,
  );
}
