// ══════════════════════════════════════════════════════════════
// Family-Specific Slot Builders
//
// Each layout family gets its own SVG composition for key slots.
// These are NOT recolored copies — they have different:
//   - Content sections and ordering
//   - Spatial composition and grid structures
//   - Data visualization types
//   - Information hierarchy
//   - Visual metaphors
//
// Families:
//   nurture   — milestone-focused, warm, spacious
//   executive — data-dense, analytical, professional
//   editorial — magazine-style, curated, elegant
// ══════════════════════════════════════════════════════════════

import type { ProductBlueprint, ListingImageSpec } from "@/types/factory";
import type { NicheDesignProfile } from "./factory-niche-themes";
import type { LayoutFamily } from "./factory-layout-families";
import {
  extractKpiData,
  extractSavingsGoals,
  extractBudgetCategories,
  extractBudgetFromDashboard,
  deriveBudgetFromTransactions,
  deriveKpiFromTransactions,
  cleanDisplayText,
  formatCurrency,
} from "./factory-display-helpers";

// ── Shared Constants & Helpers ───────────────────────────────

const W = 2000;
const H = 2000;

function esc(text: unknown): string {
  const s = typeof text === "string" ? text : text == null ? "" : String(text);
  return s
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/[\u{200D}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rect(x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="2"` : ""} />`;
}

function lighten(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  let r = parseInt(h.substring(0, 2), 16);
  let g = parseInt(h.substring(2, 4), 16);
  let b = parseInt(h.substring(4, 6), 16);
  r = Math.min(255, Math.round(r + (255 - r) * amount));
  g = Math.min(255, Math.round(g + (255 - g) * amount));
  b = Math.min(255, Math.round(b + (255 - b) * amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function darken(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  let r = parseInt(h.substring(0, 2), 16);
  let g = parseInt(h.substring(2, 4), 16);
  let b = parseInt(h.substring(4, 6), 16);
  r = Math.max(0, Math.round(r * (1 - amount)));
  g = Math.max(0, Math.round(g * (1 - amount)));
  b = Math.max(0, Math.round(b * (1 - amount)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function hexRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  return `rgba(${parseInt(h.substring(0, 2), 16)},${parseInt(h.substring(2, 4), 16)},${parseInt(h.substring(4, 6), 16)},${alpha})`;
}

// ── Data Extraction Helpers ──────────────────────────────────

interface ResolvedTheme {
  bg: string; primary: string; primaryLight: string; accent: string;
  text: string; textMuted: string; textOnDark: string;
  kpiColors: Array<{ bg: string; text: string }>;
}

function buildTheme(pal: NicheDesignProfile["palette"], kpi: NicheDesignProfile["kpiStyle"]): ResolvedTheme {
  return {
    bg: pal.background,
    primary: pal.primary,
    primaryLight: pal.primaryLight,
    accent: pal.accent,
    text: pal.text,
    textMuted: pal.textMuted,
    textOnDark: "#FFFFFF",
    kpiColors: kpi.cards.map(c => ({ bg: c.bg, text: c.text })),
  };
}

function getKpis(blueprint: ProductBlueprint) {
  const dashTab = blueprint.tabs.find(t => t.name.toLowerCase().includes("dashboard"));
  const txnTab = blueprint.tabs.find(t => t.name.toLowerCase().includes("transaction"));
  return extractKpiData(dashTab?.sampleRows || [], undefined, undefined, txnTab?.sampleRows);
}

function getBudgetRows(blueprint: ProductBlueprint, maxCats = 6) {
  const txnTab = blueprint.tabs.find(t => t.name.toLowerCase().includes("transaction"));
  const dashTab = blueprint.tabs.find(t => t.name.toLowerCase().includes("dashboard"));
  const budgetTab = blueprint.tabs.find(t =>
    t.name.toLowerCase().includes("budget") &&
    (t.name.toLowerCase().includes("setup") || t.name.toLowerCase().includes("categor") || t.name.toLowerCase().includes("overview"))
  );

  const hasReal = (cats: Array<{amount: string}>) =>
    cats.some(c => c.amount !== "$0" && c.amount !== "$0.00");

  // Try transaction-derived first (most reliable)
  if (txnTab?.sampleRows) {
    const cats = deriveBudgetFromTransactions(txnTab.sampleRows, maxCats);
    if (cats.length > 0 && hasReal(cats)) return cats;
  }
  // Dashboard extraction
  if (dashTab?.sampleRows) {
    const cats = extractBudgetFromDashboard(dashTab.sampleRows, maxCats);
    if (cats.length > 0 && hasReal(cats)) return cats;
  }
  // Budget tab
  if (budgetTab?.sampleRows) {
    const cats = extractBudgetCategories(budgetTab.sampleRows, maxCats);
    if (cats.length > 0 && hasReal(cats)) return cats;
  }
  return [];
}

function getSavingsGoals(blueprint: ProductBlueprint) {
  const savingsTab = blueprint.tabs.find(t =>
    t.name.toLowerCase().includes("saving") || t.name.toLowerCase().includes("goal")
  );
  const goals = extractSavingsGoals(savingsTab?.sampleRows || []);
  if (goals.length === 0) {
    goals.push(
      { name: "Emergency Fund", target: 10000, saved: 2500, pct: 25 },
      { name: "Vacation Fund", target: 3000, saved: 200, pct: 7 },
      { name: "New Car Fund", target: 15000, saved: 1000, pct: 7 },
      { name: "College Fund", target: 25000, saved: 500, pct: 2 },
    );
  }
  return goals;
}

function syntheticBudget(actual: number, idx: number): number {
  const m = [1.15, 1.22, 1.08, 1.30, 1.18, 1.12];
  return Math.round(actual * (m[idx % m.length] || 1.15));
}

// ══════════════════════════════════════════════════════════════
// NURTURE FAMILY — Slot 3: Dashboard
// Layout: 2×2 large KPI grid → horizontal spending bars → milestone callout
// ══════════════════════════════════════════════════════════════

export function buildNurtureDashboard(
  spec: ListingImageSpec,
  blueprint: ProductBlueprint,
  np: NicheDesignProfile,
  _family: LayoutFamily,
): string {
  const t = buildTheme(np.palette, np.kpiStyle);
  const font = np.typography.fontFamily;
  const cardR = np.layout.cardRadius;
  const kpis = getKpis(blueprint);
  const cats = getBudgetRows(blueprint);
  const title = spec.title || "Your complete financial picture.";

  // ── Title bar — rounded, centered ──
  const titleSvg = `
    ${rect(100, 30, 1800, 90, 20, t.primary)}
    <text x="1000" y="88" text-anchor="middle" font-family="${font}" font-size="38" font-weight="700" fill="${t.textOnDark}">${esc(title)}</text>`;

  // ── 2×2 KPI grid — large cards with pastel backgrounds ──
  const kpiSvg = kpis.slice(0, 4).map((kpi, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = 100 + col * 920;
    const cy = 160 + row * 180;
    const color = t.kpiColors[i] || { bg: "#DBEAFE", text: "#1E40AF" };
    return `
    <g>
      ${rect(cx, cy, 880, 160, cardR, color.bg)}
      <text x="${cx + 40}" y="${cy + 55}" font-family="${font}" font-size="22" font-weight="600" fill="${color.text}">${esc(kpi.label)}</text>
      <text x="${cx + 40}" y="${cy + 120}" font-family="${font}" font-size="58" font-weight="800" fill="${color.text}">${esc(kpi.value)}</text>
    </g>`;
  }).join("");

  // ── Spending breakdown — horizontal bar chart ──
  const barStartY = 570;
  const maxAmt = Math.max(...cats.map(c => parseFloat(c.amount.replace(/[$,]/g, "")) || 0), 1);
  const barMaxW = 1100;

  const barSvg = `
    ${rect(100, barStartY - 10, 600, 46, cardR, lighten(t.kpiColors[0]?.bg || "#D5F0D5", 0.3))}
    <text x="130" y="${barStartY + 22}" font-family="${font}" font-size="20" font-weight="700" fill="${darken(t.primary, 0.2)}">MONTHLY SPENDING</text>
  ` + cats.slice(0, 5).map((c, i) => {
    const by = barStartY + 60 + i * 80;
    const amt = parseFloat(c.amount.replace(/[$,]/g, "")) || 0;
    const barW = Math.max(40, (amt / maxAmt) * barMaxW);
    const colors = [t.kpiColors[0]?.bg || "#D5F0D5", t.kpiColors[3]?.bg || "#DBEAFE", t.kpiColors[2]?.bg || "#FEF3C7", t.kpiColors[1]?.bg || "#FEE2E2", lighten(t.primary, 0.5)];
    return `
    <text x="130" y="${by}" font-family="${font}" font-size="20" font-weight="600" fill="${t.text}">${esc(c.name)}</text>
    ${rect(130, by + 8, barW, 40, 10, colors[i % colors.length])}
    <text x="${140 + barW}" y="${by + 36}" font-family="${font}" font-size="20" font-weight="700" fill="${t.primary}">${esc(c.amount)}</text>`;
  }).join("");

  // ── Callout card — monthly summary ──
  const calloutY = barStartY + 60 + Math.min(cats.length, 5) * 80 + 40;
  const totalSpent = cats.reduce((s, c) => s + (parseFloat(c.amount.replace(/[$,]/g, "")) || 0), 0);
  const calloutSvg = `
    ${rect(100, calloutY, 1800, 100, cardR, lighten(t.kpiColors[0]?.bg || "#D5F0D5", 0.2))}
    <text x="160" y="${calloutY + 40}" font-family="${font}" font-size="20" font-weight="600" fill="${darken(t.primary, 0.3)}">Total Monthly Spending</text>
    <text x="160" y="${calloutY + 78}" font-family="${font}" font-size="36" font-weight="800" fill="${t.primary}">${formatCurrency(Math.round(totalSpent))}</text>
    <text x="1800" y="${calloutY + 60}" text-anchor="end" font-family="${font}" font-size="18" fill="${t.textMuted}">Auto-calculated from your transactions</text>`;

  // ── Feature highlights at bottom ──
  const featY = calloutY + 140;
  const features = ["Auto Dashboard", "Savings Goals", "Spending Tracker", "Monthly Summary"];
  const featSvg = features.map((f, i) => {
    const fx = 100 + i * 460;
    return `
    ${rect(fx, featY, 440, 56, cardR, "#FFFFFF")}
    <circle cx="${fx + 30}" cy="${featY + 28}" r="10" fill="${t.kpiColors[i % 4]?.bg || t.accent}" />
    <text x="${fx + 52}" y="${featY + 35}" font-family="${font}" font-size="18" font-weight="600" fill="${t.text}">${f}</text>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${t.bg}" />
  ${titleSvg}${kpiSvg}${barSvg}${calloutSvg}${featSvg}
  <rect x="0" y="${H - 40}" width="${W}" height="40" fill="${t.primary}" />
</svg>`;
}

// ══════════════════════════════════════════════════════════════
// EXECUTIVE FAMILY — Slot 3: Dashboard
// Layout: 4-across KPI strip → bordered table with headers → P&L summary → vertical bar chart
// ══════════════════════════════════════════════════════════════

export function buildExecutiveDashboard(
  spec: ListingImageSpec,
  blueprint: ProductBlueprint,
  np: NicheDesignProfile,
  _family: LayoutFamily,
): string {
  const t = buildTheme(np.palette, np.kpiStyle);
  const font = np.typography.fontFamily;
  const kpis = getKpis(blueprint);
  const cats = getBudgetRows(blueprint);
  const title = spec.title || "Everything you need. One dashboard.";

  // ── Dark header strip ──
  const headerSvg = `
    ${rect(0, 0, W, 60, 0, darken(t.primary, 0.3))}
    <text x="60" y="40" font-family="${font}" font-size="28" font-weight="700" fill="${t.textOnDark}">${esc(title)}</text>`;

  // ── 4-across KPI strip — compact, data-dense ──
  const kpiSvg = kpis.slice(0, 4).map((kpi, i) => {
    const cx = 40 + i * 480;
    const color = t.kpiColors[i] || { bg: "#DBEAFE", text: "#1E40AF" };
    return `
    <g>
      ${rect(cx, 80, 460, 120, 4, color.bg)}
      <text x="${cx + 20}" y="${80 + 36}" font-family="${font}" font-size="16" font-weight="600" fill="${color.text}" letter-spacing="1">${esc(kpi.label)}</text>
      <text x="${cx + 20}" y="${80 + 94}" font-family="${font}" font-size="48" font-weight="800" fill="${color.text}">${esc(kpi.value)}</text>
    </g>`;
  }).join("");

  // ── Professional bordered table — Category | Budgeted | Actual | Variance | Status ──
  const tblY = 230;
  const tblW = 1880;
  const colX = [60, 600, 850, 1100, 1350, 1650];

  let tableSvg = `
    <text x="60" y="${tblY}" font-family="${font}" font-size="16" font-weight="700" fill="${t.text}" letter-spacing="1.5">BUDGET PERFORMANCE</text>
    <rect x="60" y="${tblY + 8}" width="260" height="2" fill="${t.accent}" />
    ${rect(60, tblY + 20, tblW, 34, 0, darken(t.primary, 0.1))}
    <text x="${colX[0] + 20}" y="${tblY + 44}" font-family="${font}" font-size="13" font-weight="700" fill="#FFF">Category</text>
    <text x="${colX[1]}" y="${tblY + 44}" font-family="${font}" font-size="13" font-weight="700" fill="#FFF">Budget</text>
    <text x="${colX[2]}" y="${tblY + 44}" font-family="${font}" font-size="13" font-weight="700" fill="#FFF">Actual</text>
    <text x="${colX[3]}" y="${tblY + 44}" font-family="${font}" font-size="13" font-weight="700" fill="#FFF">Variance</text>
    <text x="${colX[4]}" y="${tblY + 44}" font-family="${font}" font-size="13" font-weight="700" fill="#FFF">Status</text>`;

  tableSvg += cats.slice(0, 6).map((c, i) => {
    const ry = tblY + 54 + i * 40;
    const actual = parseFloat(c.amount.replace(/[$,]/g, "")) || 0;
    const budget = syntheticBudget(actual, i);
    const variance = budget - Math.round(actual);
    const pctVar = budget > 0 ? Math.round((variance / budget) * 100) : 0;
    const varColor = variance >= 0 ? "#16A34A" : "#DC2626";
    const bg = i % 2 === 0 ? lighten(t.primary, 0.95) : lighten(t.primary, 0.9);
    return `
    <rect x="60" y="${ry}" width="${tblW}" height="40" fill="${bg}" />
    <text x="${colX[0] + 20}" y="${ry + 27}" font-family="${font}" font-size="16" font-weight="600" fill="${t.text}">${esc(c.name)}</text>
    <text x="${colX[1]}" y="${ry + 27}" font-family="${font}" font-size="16" fill="${t.text}">${formatCurrency(budget)}</text>
    <text x="${colX[2]}" y="${ry + 27}" font-family="${font}" font-size="16" fill="${t.text}">${esc(c.amount)}</text>
    <text x="${colX[3]}" y="${ry + 27}" font-family="${font}" font-size="16" font-weight="600" fill="${varColor}">${variance >= 0 ? "+" : ""}${formatCurrency(variance)}</text>
    <text x="${colX[4]}" y="${ry + 27}" font-family="${font}" font-size="14" fill="${varColor}">${variance >= 0 ? "Under" : "Over"} (${Math.abs(pctVar)}%)</text>`;
  }).join("");

  // ── P&L Summary bar ──
  const plY = tblY + 54 + Math.min(cats.length, 6) * 40 + 20;
  const totalActual = cats.reduce((s, c) => s + (parseFloat(c.amount.replace(/[$,]/g, "")) || 0), 0);
  const totalBudget = cats.reduce((s, c, i) => s + syntheticBudget(parseFloat(c.amount.replace(/[$,]/g, "")) || 0, i), 0);
  const netVariance = totalBudget - Math.round(totalActual);

  const plSvg = `
    ${rect(60, plY, tblW, 60, 4, darken(t.primary, 0.1))}
    <text x="80" y="${plY + 38}" font-family="${font}" font-size="18" font-weight="700" fill="#FFF">Total: Budget ${formatCurrency(totalBudget)} | Actual ${formatCurrency(Math.round(totalActual))} | Net ${netVariance >= 0 ? "Under" : "Over"} ${formatCurrency(Math.abs(netVariance))}</text>`;

  // ── Vertical bar chart — Actual vs Budget per category ──
  const chartY = plY + 100;
  const chartH = 400;
  const maxVal = Math.max(totalBudget, Math.round(totalActual), ...cats.map((c, i) => syntheticBudget(parseFloat(c.amount.replace(/[$,]/g, "")) || 0, i)));
  const barCount = Math.min(cats.length, 6);
  const barGroupW = Math.min(200, (1700 / barCount));
  const barW = Math.floor(barGroupW * 0.35);

  let chartSvg = `
    <text x="60" y="${chartY}" font-family="${font}" font-size="16" font-weight="700" fill="${t.text}" letter-spacing="1.5">BUDGET vs ACTUAL</text>
    <rect x="60" y="${chartY + 8}" width="200" height="2" fill="${t.accent}" />
    <line x1="100" y1="${chartY + 30}" x2="100" y2="${chartY + 30 + chartH}" stroke="${lighten(t.primary, 0.7)}" stroke-width="1" />
    <line x1="100" y1="${chartY + 30 + chartH}" x2="${100 + barCount * barGroupW + 40}" y2="${chartY + 30 + chartH}" stroke="${lighten(t.primary, 0.7)}" stroke-width="1" />`;

  chartSvg += cats.slice(0, barCount).map((c, i) => {
    const actual = parseFloat(c.amount.replace(/[$,]/g, "")) || 0;
    const budget = syntheticBudget(actual, i);
    const bH = Math.max(10, (budget / maxVal) * chartH);
    const aH = Math.max(10, (actual / maxVal) * chartH);
    const gx = 140 + i * barGroupW;
    return `
    ${rect(gx, chartY + 30 + chartH - bH, barW, bH, 2, lighten(t.primary, 0.6))}
    ${rect(gx + barW + 4, chartY + 30 + chartH - aH, barW, aH, 2, t.accent)}
    <text x="${gx + barW}" y="${chartY + 30 + chartH + 20}" text-anchor="middle" font-family="${font}" font-size="12" fill="${t.textMuted}">${esc(c.name.length > 12 ? c.name.substring(0, 11) + "..." : c.name)}</text>`;
  }).join("");

  // Chart legend
  chartSvg += `
    <rect x="${100 + barCount * barGroupW + 60}" y="${chartY + 50}" width="20" height="14" fill="${lighten(t.primary, 0.6)}" rx="2" />
    <text x="${100 + barCount * barGroupW + 90}" y="${chartY + 62}" font-family="${font}" font-size="14" fill="${t.textMuted}">Budget</text>
    <rect x="${100 + barCount * barGroupW + 60}" y="${chartY + 76}" width="20" height="14" fill="${t.accent}" rx="2" />
    <text x="${100 + barCount * barGroupW + 90}" y="${chartY + 88}" font-family="${font}" font-size="14" fill="${t.textMuted}">Actual</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${t.bg}" />
  ${headerSvg}${kpiSvg}${tableSvg}${plSvg}${chartSvg}
  <rect x="0" y="${H - 30}" width="${W}" height="30" fill="${darken(t.primary, 0.3)}" />
</svg>`;
}

// ══════════════════════════════════════════════════════════════
// EDITORIAL FAMILY — Slot 3: Dashboard
// Layout: 3 centered serif KPI cards → elegant table → ornamental summary → ring progress
// ══════════════════════════════════════════════════════════════

export function buildEditorialDashboard(
  spec: ListingImageSpec,
  blueprint: ProductBlueprint,
  np: NicheDesignProfile,
  _family: LayoutFamily,
): string {
  const t = buildTheme(np.palette, np.kpiStyle);
  const font = "Georgia, serif";
  const cats = getBudgetRows(blueprint);
  const kpis = getKpis(blueprint);
  const title = spec.title || "Your complete financial overview.";

  // ── Elegant header with accent rule ──
  const headerSvg = `
    ${rect(0, 0, W, 120, 0, t.primary)}
    <rect x="0" y="120" width="${W}" height="4" fill="${t.accent}" />
    <text x="1000" y="75" text-anchor="middle" font-family="${font}" font-size="40" font-weight="600" fill="${t.textOnDark}">${esc(title)}</text>`;

  // ── 3 KPI cards — centered, generous, with top accent borders ──
  const kpiSvg = kpis.slice(0, 3).map((kpi, i) => {
    const cx = 100 + i * 620;
    const color = t.kpiColors[i] || { bg: "#DBEAFE", text: "#1E40AF" };
    return `
    <g>
      ${rect(cx, 160, 580, 170, 6, color.bg)}
      <rect x="${cx}" y="160" width="580" height="5" fill="${t.accent}" />
      <text x="${cx + 290}" y="225" text-anchor="middle" font-family="${font}" font-size="20" font-weight="500" fill="${color.text}" letter-spacing="1">${esc(kpi.label)}</text>
      <text x="${cx + 290}" y="300" text-anchor="middle" font-family="${font}" font-size="56" font-weight="700" fill="${color.text}">${esc(kpi.value)}</text>
    </g>`;
  }).join("");

  // ── Elegant divider ──
  const divY = 370;
  const divSvg = `
    <line x1="400" y1="${divY}" x2="1600" y2="${divY}" stroke="${t.accent}" stroke-width="1" />
    <circle cx="1000" cy="${divY}" r="6" fill="${t.accent}" />`;

  // ── Clean table — category rows with bottom borders, serif font ──
  const tblY = 400;
  const tblSvg = `
    <text x="1000" y="${tblY}" text-anchor="middle" font-family="${font}" font-size="24" font-weight="600" fill="${t.text}">Budget Overview</text>
    <rect x="200" y="${tblY + 10}" width="1600" height="1" fill="${lighten(t.primary, 0.6)}" />
  ` + cats.slice(0, 5).map((c, i) => {
    const ry = tblY + 40 + i * 70;
    const actual = parseFloat(c.amount.replace(/[$,]/g, "")) || 0;
    const budget = syntheticBudget(actual, i);
    const remaining = budget - Math.round(actual);
    return `
    <text x="200" y="${ry + 30}" font-family="${font}" font-size="22" font-weight="500" fill="${t.text}">${esc(c.name)}</text>
    <text x="900" y="${ry + 30}" text-anchor="end" font-family="${font}" font-size="22" fill="${t.textMuted}">${formatCurrency(budget)}</text>
    <text x="1200" y="${ry + 30}" text-anchor="end" font-family="${font}" font-size="22" font-weight="600" fill="${t.text}">${esc(c.amount)}</text>
    <text x="1500" y="${ry + 30}" text-anchor="end" font-family="${font}" font-size="20" fill="${remaining >= 0 ? "#16A34A" : "#DC2626"}">${formatCurrency(remaining)}</text>
    <text x="1700" y="${ry + 30}" font-family="${font}" font-size="16" fill="${t.accent}">${remaining >= 0 ? "On Track" : "Over"}</text>
    <line x1="200" y1="${ry + 48}" x2="1800" y2="${ry + 48}" stroke="${lighten(t.primary, 0.8)}" stroke-width="1" />`;
  }).join("");

  // ── Progress rings — visual spending percentage per category ──
  const ringY = tblY + 40 + Math.min(cats.length, 5) * 70 + 60;
  const ringR = 60;
  const circumference = 2 * Math.PI * ringR;
  const totalActual = cats.reduce((s, c) => s + (parseFloat(c.amount.replace(/[$,]/g, "")) || 0), 0);

  const ringSvg = `
    <text x="1000" y="${ringY}" text-anchor="middle" font-family="${font}" font-size="22" font-weight="600" fill="${t.text}">Spending Distribution</text>
  ` + cats.slice(0, 4).map((c, i) => {
    const cx = 250 + i * 400;
    const cy = ringY + 100;
    const amt = parseFloat(c.amount.replace(/[$,]/g, "")) || 0;
    const pct = totalActual > 0 ? Math.round((amt / totalActual) * 100) : 0;
    const dashLen = (pct / 100) * circumference;
    const color = t.kpiColors[i]?.bg || t.accent;
    return `
    <circle cx="${cx}" cy="${cy}" r="${ringR}" fill="none" stroke="${lighten(color, 0.5)}" stroke-width="12" />
    <circle cx="${cx}" cy="${cy}" r="${ringR}" fill="none" stroke="${darken(color, 0.2)}" stroke-width="12"
      stroke-dasharray="${dashLen} ${circumference - dashLen}" stroke-dashoffset="${circumference * 0.25}" stroke-linecap="round" />
    <text x="${cx}" y="${cy + 6}" text-anchor="middle" font-family="${font}" font-size="28" font-weight="700" fill="${t.text}">${pct}%</text>
    <text x="${cx}" y="${cy + ringR + 30}" text-anchor="middle" font-family="${font}" font-size="16" fill="${t.textMuted}">${esc(c.name)}</text>`;
  }).join("");

  // ── Ornamental bottom summary ──
  const sumY = ringY + 240;
  const sumSvg = `
    <line x1="300" y1="${sumY}" x2="1700" y2="${sumY}" stroke="${t.accent}" stroke-width="1" />
    <text x="1000" y="${sumY + 40}" text-anchor="middle" font-family="${font}" font-size="22" font-weight="500" fill="${t.textMuted}">Total Spending</text>
    <text x="1000" y="${sumY + 80}" text-anchor="middle" font-family="${font}" font-size="40" font-weight="700" fill="${t.text}">${formatCurrency(Math.round(totalActual))}</text>
    <line x1="300" y1="${sumY + 100}" x2="1700" y2="${sumY + 100}" stroke="${t.accent}" stroke-width="1" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${t.bg}" />
  ${headerSvg}${kpiSvg}${divSvg}${tblSvg}${ringSvg}${sumSvg}
  <rect x="0" y="${H - 40}" width="${W}" height="40" fill="${t.primary}" />
</svg>`;
}


// ══════════════════════════════════════════════════════════════
// NURTURE FAMILY — Slot 4: Feature (Milestone Tracker)
// Layout: vertical savings goals with milestone markers, thermometer bars, heart icons
// ══════════════════════════════════════════════════════════════

export function buildNurtureFeature(
  spec: ListingImageSpec,
  blueprint: ProductBlueprint,
  np: NicheDesignProfile,
  _family: LayoutFamily,
): string {
  const t = buildTheme(np.palette, np.kpiStyle);
  const font = np.typography.fontFamily;
  const cardR = np.layout.cardRadius;
  const goals = getSavingsGoals(blueprint);
  const title = spec.title || "Watch your savings grow.";

  // ── Rounded title bar ──
  const titleSvg = `
    ${rect(100, 30, 1800, 100, 20, t.primary)}
    <text x="1000" y="90" text-anchor="middle" font-family="${font}" font-size="40" font-weight="700" fill="${t.textOnDark}">${esc(title)}</text>`;

  // ── Milestone-style savings tracker ──
  // Each goal is a card with a thermometer-style progress bar
  const goalsSvg = goals.slice(0, 5).map((g, i) => {
    const cy = 200 + i * 230;
    const barW = 1200;
    const filledW = Math.max(20, (g.pct / 100) * barW);
    const color = g.pct >= 50 ? t.kpiColors[0]?.bg || "#D5F0D5" : g.pct >= 20 ? t.kpiColors[2]?.bg || "#FEF3C7" : t.kpiColors[1]?.bg || "#FEE2E2";
    const textColor = g.pct >= 50 ? darken(t.kpiColors[0]?.bg || "#D5F0D5", 0.6) : g.pct >= 20 ? darken(t.kpiColors[2]?.bg || "#FEF3C7", 0.6) : darken(t.kpiColors[1]?.bg || "#FEE2E2", 0.6);

    // Card container
    return `
    <g>
      ${rect(140, cy, 1720, 200, cardR, "#FFFFFF")}
      ${rect(140, cy, 10, 200, cardR, color)}

      <!-- Goal name and amounts -->
      <text x="200" y="${cy + 44}" font-family="${font}" font-size="26" font-weight="700" fill="${t.text}">${esc(g.name)}</text>
      <text x="1780" y="${cy + 44}" text-anchor="end" font-family="${font}" font-size="20" fill="${t.textMuted}">$${g.saved.toLocaleString()} of $${g.target.toLocaleString()}</text>

      <!-- Thermometer bar -->
      ${rect(200, cy + 70, barW, 50, 25, lighten(color, 0.5))}
      ${rect(200, cy + 70, filledW, 50, 25, color)}

      <!-- Percentage badge -->
      ${rect(200 + filledW - 35, cy + 60, 70, 30, 15, darken(color, 0.3))}
      <text x="${200 + filledW}" y="${cy + 80}" text-anchor="middle" font-family="${font}" font-size="14" font-weight="700" fill="#FFF">${g.pct}%</text>

      <!-- Milestone markers at 25%, 50%, 75% -->
      <line x1="${200 + barW * 0.25}" y1="${cy + 125}" x2="${200 + barW * 0.25}" y2="${cy + 140}" stroke="${t.textMuted}" stroke-width="1" />
      <text x="${200 + barW * 0.25}" y="${cy + 155}" text-anchor="middle" font-family="${font}" font-size="12" fill="${t.textMuted}">25%</text>
      <line x1="${200 + barW * 0.5}" y1="${cy + 125}" x2="${200 + barW * 0.5}" y2="${cy + 140}" stroke="${t.textMuted}" stroke-width="1" />
      <text x="${200 + barW * 0.5}" y="${cy + 155}" text-anchor="middle" font-family="${font}" font-size="12" fill="${t.textMuted}">50%</text>
      <line x1="${200 + barW * 0.75}" y1="${cy + 125}" x2="${200 + barW * 0.75}" y2="${cy + 140}" stroke="${t.textMuted}" stroke-width="1" />
      <text x="${200 + barW * 0.75}" y="${cy + 155}" text-anchor="middle" font-family="${font}" font-size="12" fill="${t.textMuted}">75%</text>

      <!-- Status text -->
      <text x="200" y="${cy + 180}" font-family="${font}" font-size="16" fill="${textColor}" font-weight="600">${g.pct >= 75 ? "Almost there!" : g.pct >= 50 ? "Great progress!" : g.pct >= 25 ? "Building momentum" : "Just getting started"}</text>
    </g>`;
  }).join("");

  // ── Total savings summary ──
  const totalSaved = goals.reduce((s, g) => s + g.saved, 0);
  const totalTarget = goals.reduce((s, g) => s + g.target, 0);
  const sumY = 200 + Math.min(goals.length, 5) * 230 + 30;

  const sumSvg = `
    ${rect(140, sumY, 1720, 100, cardR, t.kpiColors[0]?.bg || "#D5F0D5")}
    <text x="200" y="${sumY + 40}" font-family="${font}" font-size="20" font-weight="600" fill="${darken(t.primary, 0.3)}">Total Savings Progress</text>
    <text x="200" y="${sumY + 78}" font-family="${font}" font-size="34" font-weight="800" fill="${t.primary}">$${totalSaved.toLocaleString()} saved toward $${totalTarget.toLocaleString()}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${t.bg}" />
  ${titleSvg}${goalsSvg}${sumSvg}
  <rect x="0" y="${H - 40}" width="${W}" height="40" fill="${t.primary}" />
</svg>`;
}


// ══════════════════════════════════════════════════════════════
// EXECUTIVE FAMILY — Slot 4: Feature (Financial Comparison)
// Layout: Revenue vs Expenses dual-column + profit waterfall + comparison bars
// ══════════════════════════════════════════════════════════════

export function buildExecutiveFeature(
  spec: ListingImageSpec,
  blueprint: ProductBlueprint,
  np: NicheDesignProfile,
  _family: LayoutFamily,
): string {
  const t = buildTheme(np.palette, np.kpiStyle);
  const font = np.typography.fontFamily;
  const kpis = getKpis(blueprint);
  const cats = getBudgetRows(blueprint);
  const title = spec.title || "Revenue. Expenses. Profit. Tracked.";

  // Parse income and expense from KPIs
  const income = parseFloat((kpis[0]?.value || "0").replace(/[$,]/g, "")) || 5500;
  const expenses = parseFloat((kpis[1]?.value || "0").replace(/[$,]/g, "")) || 4000;
  const profit = income - expenses;
  const profitPct = income > 0 ? Math.round((profit / income) * 100) : 0;

  // ── Dark header ──
  const headerSvg = `
    ${rect(0, 0, W, 80, 0, darken(t.primary, 0.3))}
    <text x="60" y="52" font-family="${font}" font-size="34" font-weight="700" fill="${t.textOnDark}">${esc(title)}</text>`;

  // ── Two-column financial summary ──
  // Left: Revenue card | Right: Expenses card
  const colSvg = `
    ${rect(60, 110, 920, 180, 6, t.kpiColors[0]?.bg || "#D5F0D5")}
    <text x="100" y="165" font-family="${font}" font-size="18" font-weight="600" fill="${t.kpiColors[0]?.text || "#065F46"}" letter-spacing="1">TOTAL REVENUE</text>
    <text x="100" y="250" font-family="${font}" font-size="64" font-weight="800" fill="${t.kpiColors[0]?.text || "#065F46"}">${formatCurrency(income)}</text>

    ${rect(1020, 110, 920, 180, 6, t.kpiColors[1]?.bg || "#FEE2E2")}
    <text x="1060" y="165" font-family="${font}" font-size="18" font-weight="600" fill="${t.kpiColors[1]?.text || "#991B1B"}" letter-spacing="1">TOTAL EXPENSES</text>
    <text x="1060" y="250" font-family="${font}" font-size="64" font-weight="800" fill="${t.kpiColors[1]?.text || "#991B1B"}">${formatCurrency(expenses)}</text>`;

  // ── Profit indicator ──
  const profitColor = profit >= 0 ? (t.kpiColors[0]?.text || "#065F46") : (t.kpiColors[1]?.text || "#991B1B");
  const profitBg = profit >= 0 ? (t.kpiColors[0]?.bg || "#D5F0D5") : (t.kpiColors[1]?.bg || "#FEE2E2");
  const profitSvg = `
    ${rect(60, 320, 1880, 100, 6, darken(t.primary, 0.05))}
    <text x="100" y="380" font-family="${font}" font-size="20" font-weight="700" fill="#FFF" letter-spacing="1">NET PROFIT</text>
    <text x="600" y="385" font-family="${font}" font-size="48" font-weight="800" fill="${t.accent}">${formatCurrency(profit)}</text>
    ${rect(1400, 340, 160, 60, 4, profitBg)}
    <text x="1480" y="380" text-anchor="middle" font-family="${font}" font-size="24" font-weight="800" fill="${profitColor}">${profitPct}%</text>
    <text x="1600" y="380" font-family="${font}" font-size="16" fill="${hexRgba("#FFFFFF", 0.7)}">margin</text>`;

  // ── Expense breakdown waterfall ──
  const wfY = 460;
  const wfH = 350;
  const maxCatAmt = Math.max(...cats.map(c => parseFloat(c.amount.replace(/[$,]/g, "")) || 0), 1);
  const barColors = [t.accent, lighten(t.primary, 0.4), t.kpiColors[2]?.bg || "#FEF3C7", t.kpiColors[1]?.bg || "#FEE2E2", lighten(t.accent, 0.4), lighten(t.primary, 0.6)];

  let wfSvg = `
    <text x="60" y="${wfY}" font-family="${font}" font-size="16" font-weight="700" fill="${t.text}" letter-spacing="1.5">EXPENSE BREAKDOWN</text>
    <rect x="60" y="${wfY + 8}" width="240" height="2" fill="${t.accent}" />`;

  wfSvg += cats.slice(0, 6).map((c, i) => {
    const amt = parseFloat(c.amount.replace(/[$,]/g, "")) || 0;
    const barH = Math.max(20, (amt / maxCatAmt) * wfH);
    const bx = 120 + i * 300;
    return `
    <text x="${bx + 75}" y="${wfY + 40 + wfH - barH - 10}" text-anchor="middle" font-family="${font}" font-size="18" font-weight="700" fill="${t.text}">${esc(c.amount)}</text>
    ${rect(bx, wfY + 40 + wfH - barH, 150, barH, 4, barColors[i % barColors.length])}
    <text x="${bx + 75}" y="${wfY + 40 + wfH + 24}" text-anchor="middle" font-family="${font}" font-size="14" fill="${t.textMuted}">${esc(c.name.length > 16 ? c.name.substring(0, 14) + "..." : c.name)}</text>`;
  }).join("");

  // ── Key metrics grid ──
  const metricsY = wfY + wfH + 100;
  const metrics = [
    { label: "Avg. Monthly Revenue", value: formatCurrency(income) },
    { label: "Avg. Monthly Expenses", value: formatCurrency(expenses) },
    { label: "Profit Margin", value: `${profitPct}%` },
    { label: "Expense Categories", value: `${cats.length}` },
  ];
  const metricsSvg = metrics.map((m, i) => {
    const mx = 60 + i * 470;
    return `
    ${rect(mx, metricsY, 440, 80, 4, lighten(t.primary, 0.92))}
    <text x="${mx + 20}" y="${metricsY + 30}" font-family="${font}" font-size="14" font-weight="600" fill="${t.textMuted}" letter-spacing="0.5">${m.label}</text>
    <text x="${mx + 20}" y="${metricsY + 62}" font-family="${font}" font-size="28" font-weight="800" fill="${t.text}">${m.value}</text>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${t.bg}" />
  ${headerSvg}${colSvg}${profitSvg}${wfSvg}${metricsSvg}
  <rect x="0" y="${H - 30}" width="${W}" height="30" fill="${darken(t.primary, 0.3)}" />
</svg>`;
}


// ══════════════════════════════════════════════════════════════
// EDITORIAL FAMILY — Slot 4: Feature (Elegant Progress)
// Layout: centered progress cards with ornamental dividers, serif typography
// ══════════════════════════════════════════════════════════════

export function buildEditorialFeature(
  spec: ListingImageSpec,
  blueprint: ProductBlueprint,
  np: NicheDesignProfile,
  _family: LayoutFamily,
): string {
  const t = buildTheme(np.palette, np.kpiStyle);
  const font = "Georgia, serif";
  const goals = getSavingsGoals(blueprint);
  const title = spec.title || "Every goal, beautifully tracked.";

  // ── Elegant header ──
  const headerSvg = `
    ${rect(0, 0, W, 130, 0, t.primary)}
    <rect x="0" y="130" width="${W}" height="4" fill="${t.accent}" />
    <text x="1000" y="80" text-anchor="middle" font-family="${font}" font-size="42" font-weight="600" fill="${t.textOnDark}">${esc(title)}</text>`;

  // ── Progress cards — centered, each with a ring + details ──
  const cardsSvg = goals.slice(0, 4).map((g, i) => {
    const cy = 200 + i * 340;
    const ringR = 50;
    const circumference = 2 * Math.PI * ringR;
    const dashLen = (g.pct / 100) * circumference;
    const color = t.kpiColors[i]?.bg || t.accent;

    return `
    <g>
      ${rect(200, cy, 1600, 300, 8, "#FFFFFF")}
      <rect x="200" y="${cy}" width="1600" height="4" fill="${t.accent}" />
      <rect x="200" y="${cy + 296}" width="1600" height="4" fill="${lighten(t.accent, 0.5)}" />

      <!-- Progress ring -->
      <circle cx="400" cy="${cy + 150}" r="${ringR}" fill="none" stroke="${lighten(color, 0.5)}" stroke-width="10" />
      <circle cx="400" cy="${cy + 150}" r="${ringR}" fill="none" stroke="${darken(color, 0.2)}" stroke-width="10"
        stroke-dasharray="${dashLen} ${circumference - dashLen}" stroke-dashoffset="${circumference * 0.25}" stroke-linecap="round" />
      <text x="400" y="${cy + 158}" text-anchor="middle" font-family="${font}" font-size="32" font-weight="700" fill="${t.text}">${g.pct}%</text>

      <!-- Goal details -->
      <text x="540" y="${cy + 70}" font-family="${font}" font-size="28" font-weight="600" fill="${t.text}">${esc(g.name)}</text>
      <line x1="540" y1="${cy + 85}" x2="1700" y2="${cy + 85}" stroke="${lighten(t.primary, 0.8)}" stroke-width="1" />

      <text x="540" y="${cy + 130}" font-family="${font}" font-size="18" fill="${t.textMuted}">Saved</text>
      <text x="540" y="${cy + 165}" font-family="${font}" font-size="36" font-weight="700" fill="${t.primary}">$${g.saved.toLocaleString()}</text>

      <text x="1000" y="${cy + 130}" font-family="${font}" font-size="18" fill="${t.textMuted}">Goal</text>
      <text x="1000" y="${cy + 165}" font-family="${font}" font-size="36" font-weight="600" fill="${t.text}">$${g.target.toLocaleString()}</text>

      <text x="1400" y="${cy + 130}" font-family="${font}" font-size="18" fill="${t.textMuted}">Remaining</text>
      <text x="1400" y="${cy + 165}" font-family="${font}" font-size="36" font-weight="600" fill="${t.accent}">$${(g.target - g.saved).toLocaleString()}</text>

      <!-- Elegant progress bar -->
      ${rect(540, cy + 210, 1140, 20, 10, lighten(color, 0.5))}
      ${rect(540, cy + 210, Math.max(10, (g.pct / 100) * 1140), 20, 10, darken(color, 0.2))}

      <text x="540" y="${cy + 265}" font-family="${font}" font-size="16" font-style="italic" fill="${t.textMuted}">${g.pct >= 75 ? "Almost there!" : g.pct >= 50 ? "Wonderful progress" : g.pct >= 25 ? "Building beautifully" : "Just the beginning"}</text>
    </g>`;
  }).join("");

  // ── Ornamental bottom summary ──
  const sumY = 200 + Math.min(goals.length, 4) * 340 + 20;
  const totalSaved = goals.reduce((s, g) => s + g.saved, 0);
  const totalTarget = goals.reduce((s, g) => s + g.target, 0);
  const sumSvg = sumY < H - 180 ? `
    <line x1="400" y1="${sumY}" x2="1600" y2="${sumY}" stroke="${t.accent}" stroke-width="1" />
    <text x="1000" y="${sumY + 40}" text-anchor="middle" font-family="${font}" font-size="20" font-weight="500" fill="${t.textMuted}">Total Progress</text>
    <text x="1000" y="${sumY + 80}" text-anchor="middle" font-family="${font}" font-size="36" font-weight="700" fill="${t.text}">$${totalSaved.toLocaleString()} of $${totalTarget.toLocaleString()}</text>` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${t.bg}" />
  ${headerSvg}${cardsSvg}${sumSvg}
  <rect x="0" y="${H - 40}" width="${W}" height="40" fill="${t.primary}" />
</svg>`;
}


// ══════════════════════════════════════════════════════════════
// NURTURE FAMILY — Slot 5: Method (Vertical Journey)
// Layout: budget category icons + vertical 3-step with dotted connector
// ══════════════════════════════════════════════════════════════

export function buildNurtureMethod(
  spec: ListingImageSpec,
  blueprint: ProductBlueprint,
  np: NicheDesignProfile,
  _family: LayoutFamily,
): string {
  const t = buildTheme(np.palette, np.kpiStyle);
  const font = np.typography.fontFamily;
  const cardR = np.layout.cardRadius;
  const cats = getBudgetRows(blueprint, 4);
  const title = spec.title || "Simple. Organized. Stress-free.";
  const subtitle = spec.subtitle || "";

  const headerSvg = `
    ${rect(100, 30, 1800, 140, 20, t.primary)}
    <text x="1000" y="90" text-anchor="middle" font-family="${font}" font-size="44" font-weight="700" fill="${t.textOnDark}">${esc(title)}</text>
    ${subtitle ? `<text x="1000" y="140" text-anchor="middle" font-family="${font}" font-size="22" fill="${hexRgba("#FFF", 0.7)}">${esc(subtitle)}</text>` : ""}`;

  // ── Budget category cards — 2×2 grid with icons ──
  const catsSvg = cats.slice(0, 4).map((c, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = 100 + col * 950;
    const cy = 220 + row * 160;
    const color = t.kpiColors[i % 4]?.bg || t.accent;
    return `
    ${rect(cx, cy, 900, 140, cardR, "#FFF")}
    <circle cx="${cx + 60}" cy="${cy + 70}" r="30" fill="${color}" />
    <text x="${cx + 60}" y="${cy + 78}" text-anchor="middle" font-family="Arial" font-size="22" font-weight="800" fill="${darken(color, 0.5)}">$</text>
    <text x="${cx + 120}" y="${cy + 55}" font-family="${font}" font-size="22" font-weight="700" fill="${t.text}">${esc(c.name)}</text>
    <text x="${cx + 120}" y="${cy + 100}" font-family="${font}" font-size="36" font-weight="800" fill="${t.primary}">${esc(c.amount)}</text>`;
  }).join("");

  // ── Vertical journey steps with dotted connector ──
  const steps = [
    { num: "1", label: "Download", desc: "Get your spreadsheet instantly via email", icon: "arrow-down" },
    { num: "2", label: "Set Up", desc: "Add your income, categories, and goals", icon: "pencil" },
    { num: "3", label: "Track", desc: "Log expenses and watch your budget come to life", icon: "chart" },
  ];

  const stepsStartY = 580;
  // Dotted vertical connector line
  let stepsSvg = `
    <line x1="300" y1="${stepsStartY + 50}" x2="300" y2="${stepsStartY + 50 + (steps.length - 1) * 220}"
      stroke="${lighten(t.primary, 0.5)}" stroke-width="3" stroke-dasharray="12 8" />`;

  stepsSvg += steps.map((s, i) => {
    const sy = stepsStartY + i * 220;
    const color = t.kpiColors[i % 4]?.bg || t.accent;
    return `
    <circle cx="300" cy="${sy + 50}" r="36" fill="${color}" />
    <text x="300" y="${sy + 60}" text-anchor="middle" font-family="${font}" font-size="28" font-weight="800" fill="${darken(color, 0.5)}">${s.num}</text>
    <text x="380" y="${sy + 44}" font-family="${font}" font-size="30" font-weight="700" fill="${t.text}">${s.label}</text>
    <text x="380" y="${sy + 82}" font-family="${font}" font-size="20" fill="${t.textMuted}">${s.desc}</text>`;
  }).join("");

  // ── Tab count badge ──
  const uniqueTabs = new Set(blueprint.tabs.map(tab => tab.name.toLowerCase())).size;
  const badgeY = stepsStartY + steps.length * 220 + 40;
  const badgeSvg = `
    ${rect(500, badgeY, 1000, 70, 20, t.kpiColors[0]?.bg || "#D5F0D5")}
    <text x="1000" y="${badgeY + 46}" text-anchor="middle" font-family="${font}" font-size="28" font-weight="700" fill="${t.primary}">${uniqueTabs} Professional Tabs Included</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${t.bg}" />
  ${headerSvg}${catsSvg}${stepsSvg}${badgeSvg}
  <rect x="0" y="${H - 40}" width="${W}" height="40" fill="${t.primary}" />
</svg>`;
}


// ══════════════════════════════════════════════════════════════
// EXECUTIVE FAMILY — Slot 5: Method (Horizontal Pipeline)
// Layout: allocation table + horizontal timeline 3-step
// ══════════════════════════════════════════════════════════════

export function buildExecutiveMethod(
  spec: ListingImageSpec,
  blueprint: ProductBlueprint,
  np: NicheDesignProfile,
  _family: LayoutFamily,
): string {
  const t = buildTheme(np.palette, np.kpiStyle);
  const font = np.typography.fontFamily;
  const cats = getBudgetRows(blueprint, 5);
  const title = spec.title || "Revenue. Costs. Profit. Clarity.";
  const subtitle = spec.subtitle || "Track revenue streams, fixed costs, variable costs, and net profit by month";

  const headerSvg = `
    ${rect(0, 0, W, 130, 0, darken(t.primary, 0.3))}
    <text x="60" y="55" font-family="${font}" font-size="40" font-weight="700" fill="${t.textOnDark}">${esc(title)}</text>
    <text x="60" y="100" font-family="${font}" font-size="20" fill="${hexRgba("#FFF", 0.6)}">${esc(subtitle)}</text>`;

  // ── Budget allocation table ──
  const tblY = 170;
  let tblSvg = `
    <text x="60" y="${tblY}" font-family="${font}" font-size="16" font-weight="700" fill="${t.text}" letter-spacing="1.5">EXPENSE ALLOCATION</text>
    <rect x="60" y="${tblY + 8}" width="240" height="2" fill="${t.accent}" />
    ${rect(60, tblY + 20, 1880, 34, 0, darken(t.primary, 0.1))}
    <text x="80" y="${tblY + 44}" font-family="${font}" font-size="14" font-weight="700" fill="#FFF">Category</text>
    <text x="900" y="${tblY + 44}" font-family="${font}" font-size="14" font-weight="700" fill="#FFF">Amount</text>
    <text x="1200" y="${tblY + 44}" font-family="${font}" font-size="14" font-weight="700" fill="#FFF">% of Total</text>
    <text x="1600" y="${tblY + 44}" font-family="${font}" font-size="14" font-weight="700" fill="#FFF">Allocation Bar</text>`;

  const totalAmt = cats.reduce((s, c) => s + (parseFloat(c.amount.replace(/[$,]/g, "")) || 0), 0);
  tblSvg += cats.slice(0, 5).map((c, i) => {
    const ry = tblY + 54 + i * 50;
    const amt = parseFloat(c.amount.replace(/[$,]/g, "")) || 0;
    const pct = totalAmt > 0 ? Math.round((amt / totalAmt) * 100) : 0;
    const barW = Math.max(10, (pct / 100) * 300);
    const bg = i % 2 === 0 ? lighten(t.primary, 0.95) : lighten(t.primary, 0.9);
    return `
    <rect x="60" y="${ry}" width="1880" height="50" fill="${bg}" />
    <text x="80" y="${ry + 33}" font-family="${font}" font-size="18" font-weight="600" fill="${t.text}">${esc(c.name)}</text>
    <text x="900" y="${ry + 33}" font-family="${font}" font-size="18" fill="${t.text}">${esc(c.amount)}</text>
    <text x="1200" y="${ry + 33}" font-family="${font}" font-size="18" font-weight="600" fill="${t.primary}">${pct}%</text>
    ${rect(1500, ry + 14, barW, 22, 4, t.accent)}`;
  }).join("");

  // ── Horizontal timeline steps ──
  const stepsY = tblY + 54 + Math.min(cats.length, 5) * 50 + 80;
  const steps = [
    { num: "1", label: "Download", desc: "Instant delivery to your inbox" },
    { num: "2", label: "Customize", desc: "Add your own categories and goals" },
    { num: "3", label: "Track", desc: "Watch your progress in real-time" },
  ];

  let stepsSvg = `
    <text x="60" y="${stepsY}" font-family="${font}" font-size="16" font-weight="700" fill="${t.text}" letter-spacing="1.5">HOW IT WORKS</text>
    <rect x="60" y="${stepsY + 8}" width="200" height="2" fill="${t.accent}" />`;

  // Horizontal connector line
  stepsSvg += `<line x1="200" y1="${stepsY + 80}" x2="1800" y2="${stepsY + 80}" stroke="${lighten(t.primary, 0.6)}" stroke-width="3" />`;

  stepsSvg += steps.map((s, i) => {
    const sx = 200 + i * 600;
    return `
    <circle cx="${sx}" cy="${stepsY + 80}" r="30" fill="${darken(t.primary, 0.1)}" />
    <text x="${sx}" y="${stepsY + 89}" text-anchor="middle" font-family="${font}" font-size="24" font-weight="800" fill="${t.textOnDark}">${s.num}</text>
    <text x="${sx}" y="${stepsY + 140}" text-anchor="middle" font-family="${font}" font-size="24" font-weight="700" fill="${t.text}">${s.label}</text>
    <text x="${sx}" y="${stepsY + 170}" text-anchor="middle" font-family="${font}" font-size="16" fill="${t.textMuted}">${s.desc}</text>`;
  }).join("");

  // ── Tab count badge ──
  const uniqueTabs = new Set(blueprint.tabs.map(tab => tab.name.toLowerCase())).size;
  const badgeY = stepsY + 220;
  const badgeSvg = `
    ${rect(600, badgeY, 800, 70, 4, darken(t.primary, 0.05))}
    <text x="1000" y="${badgeY + 45}" text-anchor="middle" font-family="${font}" font-size="26" font-weight="700" fill="${t.textOnDark}">${uniqueTabs} Professional Tabs Included</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${t.bg}" />
  ${headerSvg}${tblSvg}${stepsSvg}${badgeSvg}
  <rect x="0" y="${H - 30}" width="${W}" height="30" fill="${darken(t.primary, 0.3)}" />
</svg>`;
}


// ══════════════════════════════════════════════════════════════
// EDITORIAL FAMILY — Slot 5: Method (Showcase Columns)
// Layout: elegant budget showcase cards + centered serif steps
// ══════════════════════════════════════════════════════════════

export function buildEditorialMethod(
  spec: ListingImageSpec,
  blueprint: ProductBlueprint,
  np: NicheDesignProfile,
  _family: LayoutFamily,
): string {
  const t = buildTheme(np.palette, np.kpiStyle);
  const font = "Georgia, serif";
  const cats = getBudgetRows(blueprint, 4);
  const title = spec.title || "Plan beautifully. Spend wisely.";
  const subtitle = spec.subtitle || "";

  const headerSvg = `
    ${rect(0, 0, W, 160, 0, t.primary)}
    <rect x="0" y="160" width="${W}" height="4" fill="${t.accent}" />
    <text x="1000" y="80" text-anchor="middle" font-family="${font}" font-size="46" font-weight="600" fill="${t.textOnDark}">${esc(title)}</text>
    ${subtitle ? `<text x="1000" y="130" text-anchor="middle" font-family="${font}" font-size="22" fill="${hexRgba("#FFF", 0.6)}">${esc(subtitle)}</text>` : ""}`;

  // ── Budget showcase — elegant column cards ──
  const catsSvg = `
    <text x="1000" y="230" text-anchor="middle" font-family="${font}" font-size="24" font-weight="600" fill="${t.text}">Your Budget at a Glance</text>
    <rect x="800" y="242" width="400" height="2" fill="${t.accent}" />
  ` + cats.slice(0, 4).map((c, i) => {
    const cx = 120 + i * 460;
    const color = t.kpiColors[i % 4]?.bg || t.accent;
    return `
    ${rect(cx, 280, 420, 260, 6, "#FFF")}
    <rect x="${cx}" y="280" width="420" height="5" fill="${t.accent}" />
    <rect x="${cx}" y="535" width="420" height="5" fill="${lighten(t.accent, 0.5)}" />
    <circle cx="${cx + 210}" cy="360" r="30" fill="${lighten(color, 0.3)}" />
    <text x="${cx + 210}" y="368" text-anchor="middle" font-family="Arial" font-size="22" font-weight="800" fill="${darken(color, 0.4)}">$</text>
    <text x="${cx + 210}" y="430" text-anchor="middle" font-family="${font}" font-size="22" font-weight="600" fill="${t.text}">${esc(c.name)}</text>
    <text x="${cx + 210}" y="490" text-anchor="middle" font-family="${font}" font-size="40" font-weight="700" fill="${t.primary}">${esc(c.amount)}</text>`;
  }).join("");

  // ── Centered serif steps ──
  const stepsY = 600;
  const steps = [
    { num: "1", label: "Download", desc: "Instant delivery to your inbox" },
    { num: "2", label: "Personalize", desc: "Add your unique categories and goals" },
    { num: "3", label: "Track", desc: "Watch your budget come to life" },
  ];

  let stepsSvg = `
    <text x="1000" y="${stepsY}" text-anchor="middle" font-family="${font}" font-size="24" font-weight="600" fill="${t.text}">How It Works</text>
    <rect x="900" y="${stepsY + 12}" width="200" height="2" fill="${t.accent}" />`;

  stepsSvg += steps.map((s, i) => {
    const sy = stepsY + 60 + i * 200;
    return `
    ${rect(300, sy, 1400, 160, 8, "#FFF")}
    <rect x="300" y="${sy}" width="4" height="160" fill="${t.accent}" />
    <circle cx="400" cy="${sy + 80}" r="30" fill="${lighten(t.accent, 0.3)}" />
    <text x="400" y="${sy + 88}" text-anchor="middle" font-family="${font}" font-size="24" font-weight="700" fill="${darken(t.accent, 0.3)}">${s.num}</text>
    <text x="470" y="${sy + 60}" font-family="${font}" font-size="26" font-weight="600" fill="${t.text}">${s.label}</text>
    <text x="470" y="${sy + 100}" font-family="${font}" font-size="18" fill="${t.textMuted}">${s.desc}</text>`;
  }).join("");

  // ── Tab count ──
  const uniqueTabs = new Set(blueprint.tabs.map(tab => tab.name.toLowerCase())).size;
  const badgeY = stepsY + 60 + steps.length * 200 + 30;
  const badgeSvg = badgeY < H - 100 ? `
    <line x1="600" y1="${badgeY}" x2="1400" y2="${badgeY}" stroke="${t.accent}" stroke-width="1" />
    <text x="1000" y="${badgeY + 40}" text-anchor="middle" font-family="${font}" font-size="24" font-weight="600" fill="${t.text}">${uniqueTabs} Professional Tabs Included</text>
    <line x1="600" y1="${badgeY + 56}" x2="1400" y2="${badgeY + 56}" stroke="${t.accent}" stroke-width="1" />` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${t.bg}" />
  ${headerSvg}${catsSvg}${stepsSvg}${badgeSvg}
  <rect x="0" y="${H - 40}" width="${W}" height="40" fill="${t.primary}" />
</svg>`;
}
