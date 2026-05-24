// ══════════════════════════════════════════════════════════════
// Factory Preview Engine — Real Spreadsheet Screenshots
//
// Uses Playwright (headless Chromium) to render spreadsheet
// data as HTML that looks like Google Sheets, then screenshots it.
//
// This produces REAL browser-rendered output with:
//   - Natural font anti-aliasing and sub-pixel rendering
//   - Real CSS grid layout with imperfect spacing
//   - Authentic Google Sheets chrome
//   - Tab bar, formula bar, toolbar
//   - Actual cell data from the product blueprint
//
// REALISM > perfection. A real browser render beats SVG every time.
// ══════════════════════════════════════════════════════════════

import { chromium, type Browser, type Page } from "playwright";
import type { ProductBlueprint, BlueprintTab } from "@/types/factory";
import { resolveNicheProfile, type NicheDesignProfile } from "./factory-niche-themes";
import {
  deriveKpiFromTransactions,
  deriveBudgetFromTransactions,
  formatCurrency,
} from "./factory-display-helpers";
import { getNicheData, getNicheSavingsGoals, type NicheDataProfile } from "./factory-niche-data";
import sharp from "sharp";

// ── Premium Dark Theme Override ─────────────────────────────
// When the Google Sheets API builder is active, the actual product
// uses a premium dark theme. This function overrides the niche
// profile tokens to match the real product appearance.

function applyPremiumDarkTheme(
  profile: NicheDesignProfile,
  blueprint: ProductBlueprint,
): NicheDesignProfile {
  const cs = blueprint.colorScheme;
  const primary = cs?.primary || "#1B3A5C";

  return {
    ...profile,
    palette: {
      ...profile.palette,
      primary,
      background: "#0F172A",
      surface: "#162033",
      text: "#F8FAFC",
      textMuted: "#94A3B8",
    },
    kpiStyle: {
      ...profile.kpiStyle,
      cards: [
        { bg: "1E2D45", text: "22C55E", label: "TOTAL INCOME" },
        { bg: "1E2D45", text: "EF4444", label: "TOTAL SPENT" },
        { bg: "1E2D45", text: "D4AF37", label: "NET SAVINGS" },
        { bg: "1E2D45", text: "60A5FA", label: "SAVINGS RATE" },
      ],
    },
    spreadsheetTokens: {
      ...profile.spreadsheetTokens,
      headerBg: "1B3A5C",
      headerText: "F8FAFC",
      rowAlt: "1A2740",
      sectionBg: "1B3A5C",
      sectionText: "F8FAFC",
      totalsBg: "1E2A3E",
      totalsText: "D4AF37",
    },
  };
}

// ── Browser Pool ─────────────────────────────────────────────

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.isConnected()) return _browser;
  _browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });
  return _browser;
}

export async function closeBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

// ── Types ────────────────────────────────────────────────────

export interface PreviewOptions {
  /** Which tab to show */
  tabName?: string;
  /** Viewport width */
  width?: number;
  /** Viewport height */
  height?: number;
  /** Show Google Sheets chrome (toolbar, formula bar) */
  showChrome?: boolean;
  /** Show tab bar at bottom */
  showTabBar?: boolean;
  /** Maximum data rows to display */
  maxDataRows?: number;
  /** Crop to data area (hide empty rows below data) */
  cropToData?: boolean;
  /** Device scale factor for retina rendering */
  deviceScaleFactor?: number;
}

export interface ScreenshotResult {
  /** PNG buffer */
  buffer: Buffer;
  /** Width of the captured image */
  width: number;
  /** Height of the captured image */
  height: number;
}

// ── HTML Template Builder ────────────────────────────────────

function escHtml(text: unknown): string {
  const s = typeof text === "string" ? text : text == null ? "" : String(text);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colLetter(index: number): string {
  let s = "";
  let n = index;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

interface DashboardData {
  tagline: string;
  monthLabel: string;
  monthlyIncome: string;
  kpis: Array<{ label: string; value: string; bgColor: string; textColor: string }>;
  budgetRows: Array<{ category: string; budget: string; actual: string; remaining: string }>;
  savingsGoals: Array<{ name: string; target: string; saved: string; progress: string }>;
  totalBudget: string;
  totalActual: string;
}

function extractDashboardData(
  blueprint: ProductBlueprint,
  nicheProfile: NicheDesignProfile,
  nicheData: NicheDataProfile,
): DashboardData {
  // Get transaction data for KPI computation
  const txnTab = blueprint.tabs.find(t =>
    t.name.toLowerCase().includes("transaction") || t.name.toLowerCase().includes("log")
  );

  let income = nicheData.monthlyIncome;
  let spent = 0;

  if (txnTab?.sampleRows?.length) {
    const kpis = deriveKpiFromTransactions(txnTab.sampleRows);
    if (kpis.income > 0) income = kpis.income;
    if (kpis.spent > 0) spent = kpis.spent;
  }

  if (spent === 0) {
    // Derive from niche budget categories
    spent = nicheData.budgetCategories.reduce((sum, c) => sum + c.budgetAmount, 0);
    // Simulate actual spending slightly under budget
    spent = Math.round(spent * 0.87);
  }

  const savings = income - spent;
  const rate = income > 0 ? Math.round((savings / income) * 100) : 0;

  // KPI colors from niche profile
  const kpiCards = nicheProfile.kpiStyle.cards;
  const kpis = [
    { label: nicheData.kpiLabels[0], value: formatCurrency(income), bgColor: kpiCards[0]?.bg || "#D5F0D5", textColor: kpiCards[0]?.text || "#166534" },
    { label: nicheData.kpiLabels[1], value: formatCurrency(spent), bgColor: kpiCards[1]?.bg || "#FEE2E2", textColor: kpiCards[1]?.text || "#991B1B" },
    { label: nicheData.kpiLabels[2], value: formatCurrency(savings), bgColor: kpiCards[2]?.bg || "#FEF3C7", textColor: kpiCards[2]?.text || "#92400E" },
    { label: nicheData.kpiLabels[3], value: `${rate}%`, bgColor: kpiCards[3]?.bg || "#DBEAFE", textColor: kpiCards[3]?.text || "#1E40AF" },
  ];

  // Budget rows from niche data with realistic spending variance
  const multipliers = [1.15, 1.22, 1.08, 1.30, 1.18, 1.12, 1.25, 1.10];
  const spendVariance = [0.87, 0.92, 0.78, 0.95, 0.83, 0.88, 0.91, 0.85];

  let totalBudget = 0;
  let totalActual = 0;

  const budgetRows = nicheData.budgetCategories.slice(0, 8).map((cat, i) => {
    const budget = Math.round(cat.budgetAmount * multipliers[i % multipliers.length]);
    const actual = Math.round(cat.budgetAmount * spendVariance[i % spendVariance.length]);
    const remaining = budget - actual;
    totalBudget += budget;
    totalActual += actual;
    return {
      category: cat.name,
      budget: formatCurrency(budget),
      actual: formatCurrency(actual),
      remaining: formatCurrency(remaining),
    };
  });

  // Niche-specific savings goals
  const savingsGoals = getNicheSavingsGoals(nicheProfile.id);

  return {
    tagline: nicheData.tagline,
    monthLabel: "March",
    monthlyIncome: formatCurrency(income),
    kpis,
    budgetRows,
    savingsGoals,
    totalBudget: formatCurrency(totalBudget),
    totalActual: formatCurrency(totalActual),
  };
}

interface TransactionRow {
  date: string;
  description: string;
  amount: string;
  category: string;
  subcategory: string;
  bucket: string;
  month: string;
}

function extractTransactionData(
  blueprint: ProductBlueprint,
  maxRows: number = 20,
): TransactionRow[] {
  const txnTab = blueprint.tabs.find(t =>
    t.name.toLowerCase().includes("transaction") || t.name.toLowerCase().includes("log")
  );
  if (!txnTab?.sampleRows?.length) return [];

  return txnTab.sampleRows.slice(0, maxRows).map(row => {
    const vals = Object.values(row);
    return {
      date: String(vals[0] || ""),
      description: String(vals[1] || ""),
      amount: typeof vals[2] === "number" ? formatCurrency(vals[2]) : String(vals[2] || ""),
      category: String(vals[3] || ""),
      subcategory: String(vals[4] || ""),
      bucket: String(vals[5] || ""),
      month: String(vals[6] || ""),
    };
  });
}

// ── HTML Generators ──────────────────────────────────────────

function buildDashboardHTML(
  data: DashboardData,
  allTabs: BlueprintTab[],
  activeTabName: string,
  nicheProfile: NicheDesignProfile,
  opts: { showChrome: boolean; showTabBar: boolean; cropToData: boolean },
): string {
  const accentColor = nicheProfile.palette.primary;
  const sectionBg = nicheProfile.spreadsheetTokens.sectionBg || "D1FAE5";
  const sectionText = nicheProfile.spreadsheetTokens.sectionText || "065F46";
  const headerBg = nicheProfile.spreadsheetTokens.headerBg || "F1F5F9";

  // Detect dark theme from background color
  const bgColor = nicheProfile.palette.background || "#FFFFFF";
  const isDark = bgColor.toLowerCase() === "#0f172a" || bgColor.toLowerCase().startsWith("#0") || bgColor.toLowerCase().startsWith("#1");
  const bodyBg = isDark ? "#0F172A" : "white";
  const cellBorder = isDark ? "#2D3A52" : "#e2e5e9";
  const cellColor = isDark ? "#F8FAFC" : "#202124";
  const emptyBg = isDark ? "#0F172A" : "transparent";
  const controlsBg = isDark ? "#16203D" : "transparent";
  const controlsColor = isDark ? "#94A3B8" : "#3c4043";
  const rowNumBg = isDark ? "#0F172A" : "#f8f9fa";
  const rowNumColor = isDark ? "#64748B" : "#80868b";
  const colHeaderBg = isDark ? "#0F172A" : "#f8f9fa";
  const colHeaderColor = isDark ? "#64748B" : "#5f6368";
  const chromeBg = isDark ? "#0F172A" : "white";
  const toolbarBg = isDark ? "#16203D" : "#edf2fa";
  const tabBarBg = isDark ? "#0F172A" : "#f8f9fa";
  const tabActiveBg = isDark ? "#162033" : "white";
  const tabActiveColor = isDark ? "#F8FAFC" : "#202124";
  const tabInactiveColor = isDark ? "#64748B" : "#80868b";
  const incomeBg = isDark ? "#1E2D45" : "#e8f5e9";
  const incomeColor = isDark ? "#22C55E" : "#166534";
  const kpiBorder = isDark ? "1px solid #2A3F5F" : "1px solid rgba(0,0,0,0.06)";
  const dividerBorder = isDark ? `1px solid #2D3A52` : "1px solid #dadce0";
  const scrollBg = isDark ? "#162033" : "#f1f1f1";
  const scrollThumb = isDark ? "#2D3A52" : "#c1c1c1";

  // Unique tab names for tab bar
  const seen = new Set<string>();
  const uniqueTabs = allTabs.filter(t => {
    const lower = t.name.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });

  const numCols = 10; // A through J
  const totalDataRows = 1 + 1 + 1 + 1 + 2 + 1 + data.budgetRows.length + 1 + 2; // title + spacer + controls + spacer + KPI rows + section headers + data + totals + spacer
  // Show just enough empty rows to fill the viewport — NOT 74 rows of dead space.
  // Data ends around row 20. Show ~10 empty rows after data, then stop.
  const totalDisplayRows = opts.cropToData ? totalDataRows + 3 : totalDataRows + 12;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: ${isDark ? "Inter, " : ""}Arial, Helvetica, sans-serif; background: ${bodyBg};
    position: relative;
    color: ${cellColor};
  }

  /* Google Sheets scrollbar (right edge) */
  .gs-scrollbar {
    position: fixed; right: 0; top: 120px; bottom: 36px;
    width: 14px; background: ${scrollBg};
    border-left: ${dividerBorder};
    z-index: 10;
  }
  .gs-scrollbar .thumb {
    position: absolute; top: 8px; left: 2px; right: 2px;
    height: 120px; background: ${scrollThumb}; border-radius: 7px;
  }
  .gs-scrollbar .thumb:hover { background: #a8a8a8; }

  /* Horizontal scrollbar (bottom edge, above tab bar) */
  .gs-hscrollbar {
    position: fixed; bottom: 32px; left: 44px; right: 14px;
    height: 14px; background: ${scrollBg};
    border-top: ${dividerBorder};
    z-index: 10;
  }
  .gs-hscrollbar .thumb {
    position: absolute; top: 2px; left: 8px; bottom: 2px;
    width: 200px; background: ${scrollThumb}; border-radius: 7px;
  }

  /* Google Sheets Chrome */
  .gs-chrome {
    background: ${chromeBg};
    border-bottom: ${dividerBorder};
  }
  .gs-title-bar {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px; font-size: 18px; color: ${cellColor};
  }
  .gs-title-bar .icon {
    width: 24px; height: 24px;
    background: #0f9d58; border-radius: 3px;
    display: flex; align-items: center; justify-content: center;
    color: white; font-size: 14px; font-weight: bold;
  }
  .gs-menu-bar {
    display: flex; gap: 2px; padding: 0 12px 4px;
    font-size: 13px; color: ${controlsColor};
  }
  .gs-menu-bar span { padding: 4px 8px; border-radius: 4px; cursor: default; }
  .gs-menu-bar span:hover { background: ${isDark ? "#1E2D45" : "#e8eaed"}; }

  .gs-toolbar {
    display: flex; align-items: center; gap: 4px;
    padding: 4px 8px;
    background: ${toolbarBg}; border-bottom: ${dividerBorder};
    font-size: 13px; color: ${controlsColor};
  }
  .gs-toolbar .sep { width: 1px; height: 20px; background: ${isDark ? "#2D3A52" : "#dadce0"}; margin: 0 4px; }
  .gs-toolbar .btn {
    padding: 2px 6px; border-radius: 3px; cursor: default;
    font-size: 13px; color: ${controlsColor};
  }
  .gs-toolbar select {
    border: ${dividerBorder}; border-radius: 4px; padding: 2px 4px;
    font-size: 13px; background: ${isDark ? "#162033" : "white"}; color: ${controlsColor};
  }

  .gs-formula-bar {
    display: flex; align-items: center;
    border-bottom: ${dividerBorder};
    height: 30px; font-size: 13px;
    background: ${isDark ? "#0F172A" : "transparent"};
  }
  .gs-formula-bar .cell-ref {
    width: 80px; text-align: center; border-right: ${dividerBorder};
    padding: 0 8px; color: ${controlsColor}; font-size: 12px;
  }
  .gs-formula-bar .fx {
    padding: 0 8px; color: ${rowNumColor}; border-right: ${dividerBorder};
    font-style: italic; font-size: 13px;
  }
  .gs-formula-bar .content {
    padding: 0 8px; color: ${controlsColor}; flex: 1;
  }

  /* Grid */
  .gs-grid {
    display: grid;
    grid-template-columns: 44px repeat(${numCols}, 1fr);
    border-collapse: collapse;
    font-size: 13px;
    line-height: 1;
  }

  /* Column headers */
  .col-header {
    background: ${colHeaderBg};
    color: ${colHeaderColor};
    text-align: center;
    padding: 5px 0;
    border-bottom: 1px solid ${isDark ? "#2D3A52" : "#e8eaed"};
    border-right: 1px solid ${isDark ? "#2D3A52" : "#e8eaed"};
    font-size: 11px;
    font-weight: 400;
    user-select: none;
  }
  .col-header.corner {
    border-right: 1px solid ${isDark ? "#2D3A52" : "#e8eaed"};
  }

  /* Row numbers */
  .row-num {
    background: ${rowNumBg};
    color: ${rowNumColor};
    text-align: center;
    padding: 0;
    border-bottom: 1px solid ${isDark ? "#2D3A52" : "#e8eaed"};
    border-right: 1px solid ${isDark ? "#2D3A52" : "#e8eaed"};
    font-size: 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 25px;
  }

  /* Cells */
  .cell {
    border-bottom: 1px solid ${cellBorder};
    border-right: 1px solid ${cellBorder};
    padding: 4px 6px;
    color: ${cellColor};
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-height: 25px;
    display: flex;
    align-items: center;
  }
  .cell.right { justify-content: flex-end; text-align: right; }
  .cell.center { justify-content: center; text-align: center; }
  .cell.bold { font-weight: 700; }
  .cell.empty { }

  /* Selected cell */
  .cell.selected {
    outline: 2px solid ${isDark ? "#60A5FA" : "#1a73e8"};
    outline-offset: -1px;
    z-index: 1;
    position: relative;
  }

  /* Title row */
  .cell.title-cell {
    font-size: ${isDark ? "18px" : "15px"};
    font-weight: ${isDark ? "700" : "500"};
    color: #ffffff;
    padding: ${isDark ? "16px 8px" : "10px 8px"};
    min-height: ${isDark ? "56px" : "40px"};
  }

  /* KPI cells */
  .cell.kpi-label {
    font-size: ${isDark ? "8px" : "10px"};
    font-weight: ${isDark ? "400" : "500"};
    padding: 2px 8px;
    min-height: ${isDark ? "24px" : "18px"};
    border: ${kpiBorder};
    border-radius: 2px 2px 0 0;
    ${isDark ? "letter-spacing: 0.5px; text-transform: uppercase;" : ""}
  }
  .cell.kpi-value {
    font-size: ${isDark ? "28px" : "22px"};
    font-weight: 700;
    padding: ${isDark ? "8px 8px 12px" : "6px 8px 10px"};
    min-height: ${isDark ? "56px" : "40px"};
    border: ${kpiBorder};
    border-radius: 0 0 2px 2px;
  }

  /* Section header */
  .cell.section-header {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 6px 8px;
    min-height: 28px;
  }

  /* Data header */
  .cell.data-header {
    font-size: 12px;
    font-weight: 600;
    padding: 5px 8px;
    min-height: 26px;
  }

  /* Totals row */
  .cell.totals {
    font-weight: 700;
    font-size: 13px;
    padding: 5px 8px;
    min-height: 28px;
  }

  /* Tab bar */
  .gs-tab-bar {
    display: flex;
    align-items: center;
    background: ${tabBarBg};
    border-top: ${dividerBorder};
    padding: 0 8px;
    height: 32px;
    font-size: 12px;
    gap: 0;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
  }
  .gs-tab-bar .nav-btns {
    display: flex; gap: 2px; margin-right: 8px; color: ${tabInactiveColor};
  }
  .gs-tab-bar .nav-btns span {
    padding: 2px 4px; font-size: 10px; cursor: default;
  }
  .gs-tab-bar .tab {
    padding: 6px 16px;
    border: ${dividerBorder};
    border-bottom: none;
    border-radius: 4px 4px 0 0;
    cursor: default;
    color: ${tabInactiveColor};
    background: transparent;
    margin-left: -1px;
    font-size: 12px;
  }
  .gs-tab-bar .tab.active {
    background: ${tabActiveBg};
    color: ${tabActiveColor};
    font-weight: 500;
    border-bottom: 3px solid ${accentColor};
    padding-bottom: 3px;
  }
</style>
</head>
<body>
${opts.showChrome ? `
<div class="gs-chrome">
  <div class="gs-title-bar">
    <div class="icon">⊞</div>
    <span>${escHtml(activeTabName)}</span>
  </div>
  <div class="gs-menu-bar">
    <span>File</span><span>Edit</span><span>View</span><span>Insert</span>
    <span>Format</span><span>Data</span><span>Extensions</span><span>Help</span>
  </div>
</div>
<div class="gs-toolbar">
  <span class="btn">↶</span><span class="btn">↷</span>
  <div class="sep"></div>
  <select><option>Arial</option></select>
  <select style="width:50px"><option>10</option></select>
  <div class="sep"></div>
  <span class="btn"><b>B</b></span>
  <span class="btn"><i>I</i></span>
  <span class="btn" style="text-decoration:underline">U</span>
  <span class="btn">S</span>
  <div class="sep"></div>
  <span class="btn">A</span>
  <div class="sep"></div>
  <span class="btn">$</span>
  <span class="btn">%</span>
  <span class="btn">.0</span>
  <span class="btn">.00</span>
</div>
<div class="gs-formula-bar">
  <div class="cell-ref">B6</div>
  <div class="fx"><i>f</i>x</div>
  <div class="content">${escHtml(activeTabName)}</div>
</div>
` : ""}

<div class="gs-grid" style="padding-bottom: ${opts.showTabBar ? 50 : 0}px; padding-right: 14px;">
  <!-- Column headers -->
  <div class="col-header corner"></div>
  ${Array.from({ length: numCols }, (_, i) => `<div class="col-header">${colLetter(i)}</div>`).join("\n  ")}

  <!-- Row 1: Title banner -->
  <div class="row-num">1</div>
  <div class="cell title-cell center bold" style="grid-column: span ${numCols}; background: ${accentColor};">
    ${escHtml(data.tagline)}
  </div>

  <!-- Row 2: SELECT MONTH label -->
  <div class="row-num">2</div>
  <div class="cell center" style="grid-column: span ${numCols}; color: ${rowNumColor}; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; min-height: 22px; background: ${isDark ? "#0F172A" : "transparent"};">
    SELECT MONTH:
  </div>

  <!-- Row 3: Spacer -->
  <div class="row-num">3</div>
  <div class="cell empty" style="grid-column: span ${numCols}; min-height: 10px; background: ${emptyBg};"></div>

  <!-- Row 4: Month + Income controls -->
  <div class="row-num">4</div>
  <div class="cell empty" style="grid-column: span 1; background: ${controlsBg};"></div>
  <div class="cell bold right" style="grid-column: span 2; font-size: 12px; background: ${controlsBg}; color: ${controlsColor};">SELECT MONTH:</div>
  <div class="cell bold" style="grid-column: span 1; background: ${controlsBg}; color: ${cellColor};">${escHtml(data.monthLabel)}</div>
  <div class="cell empty" style="grid-column: span 1; background: ${controlsBg};"></div>
  <div class="cell bold right" style="grid-column: span 2; font-size: 12px; background: ${controlsBg}; color: ${controlsColor};">MONTHLY INCOME:</div>
  <div class="cell bold" style="grid-column: span 1; background: ${incomeBg}; border-radius: 3px; color: ${incomeColor};">${escHtml(data.monthlyIncome)}</div>
  <div class="cell empty" style="grid-column: span 2; background: ${controlsBg};"></div>

  <!-- Row 5: Spacer -->
  <div class="row-num">5</div>
  <div class="cell empty" style="grid-column: span ${numCols}; min-height: 8px; background: ${emptyBg};"></div>

  <!-- Row 6: KPI Labels — 4 cards evenly across 10 cols: 1 gap + 2 + 1 gap + 2 + 1 gap + 2 + 1 gap = too complex. Use: A empty, B-C kpi1, D empty, E kpi2, F empty, G kpi3, H empty, I-J kpi4 -->
  <div class="row-num">6</div>
  <div class="cell kpi-label center" style="grid-column: span 2; background: #${data.kpis[0].bgColor}; color: #${data.kpis[0].textColor};">${escHtml(data.kpis[0].label)}</div>
  <div class="cell empty" style="grid-column: span 1; min-height: 18px; background: ${emptyBg};"></div>
  <div class="cell kpi-label center" style="grid-column: span 2; background: #${data.kpis[1].bgColor}; color: #${data.kpis[1].textColor};">${escHtml(data.kpis[1].label)}</div>
  <div class="cell empty" style="grid-column: span 1; min-height: 18px; background: ${emptyBg};"></div>
  <div class="cell kpi-label center" style="grid-column: span 2; background: #${data.kpis[2].bgColor}; color: #${data.kpis[2].textColor};">${escHtml(data.kpis[2].label)}</div>
  <div class="cell empty" style="grid-column: span 1; min-height: 18px; background: ${emptyBg};"></div>
  <div class="cell kpi-label center" style="grid-column: span 1; background: #${data.kpis[3].bgColor}; color: #${data.kpis[3].textColor};">${escHtml(data.kpis[3].label)}</div>

  <!-- Row 7: KPI Values — same layout as labels -->
  <div class="row-num">7</div>
  <div class="cell kpi-value center selected" style="grid-column: span 2; background: #${data.kpis[0].bgColor}; color: #${data.kpis[0].textColor};">${escHtml(data.kpis[0].value)}</div>
  <div class="cell empty" style="grid-column: span 1; min-height: 40px; background: ${emptyBg};"></div>
  <div class="cell kpi-value center" style="grid-column: span 2; background: #${data.kpis[1].bgColor}; color: #${data.kpis[1].textColor};">${escHtml(data.kpis[1].value)}</div>
  <div class="cell empty" style="grid-column: span 1; min-height: 40px; background: ${emptyBg};"></div>
  <div class="cell kpi-value center" style="grid-column: span 2; background: #${data.kpis[2].bgColor}; color: #${data.kpis[2].textColor};">${escHtml(data.kpis[2].value)}</div>
  <div class="cell empty" style="grid-column: span 1; min-height: 40px; background: ${emptyBg};"></div>
  <div class="cell kpi-value center" style="grid-column: span 1; background: #${data.kpis[3].bgColor}; color: #${data.kpis[3].textColor};">${escHtml(data.kpis[3].value)}</div>

  <!-- Row 8: Spacer -->
  <div class="row-num">8</div>
  <div class="cell empty" style="grid-column: span ${numCols}; min-height: ${isDark ? "16px" : "8px"}; background: ${emptyBg};"></div>

  <!-- Row 9: Section headers -->
  <div class="row-num">9</div>
  <div class="cell section-header center" style="grid-column: span 5; background: #${sectionBg}; color: #${sectionText};">SPENDING BY CATEGORY</div>
  <div class="cell section-header center" style="grid-column: span 5; background: #${sectionBg}; color: #${sectionText};">SAVINGS GOALS</div>

  <!-- Row 10: Column headers for data -->
  <div class="row-num">10</div>
  <div class="cell data-header" style="grid-column: span 2; background: #${headerBg}; color: #${nicheProfile.spreadsheetTokens.headerText || "334155"};">Category</div>
  <div class="cell data-header right" style="background: #${headerBg}; color: #${nicheProfile.spreadsheetTokens.headerText || "334155"};">Budget</div>
  <div class="cell data-header right" style="background: #${headerBg}; color: #${nicheProfile.spreadsheetTokens.headerText || "334155"};">Actual</div>
  <div class="cell data-header right" style="background: #${headerBg}; color: #${nicheProfile.spreadsheetTokens.headerText || "334155"};">Remaining</div>
  <div class="cell data-header" style="grid-column: span 2; background: #${headerBg}; color: #${nicheProfile.spreadsheetTokens.headerText || "334155"};">Goal</div>
  <div class="cell data-header right" style="background: #${headerBg}; color: #${nicheProfile.spreadsheetTokens.headerText || "334155"};">Target</div>
  <div class="cell data-header right" style="background: #${headerBg}; color: #${nicheProfile.spreadsheetTokens.headerText || "334155"};">Saved</div>
  <div class="cell data-header right" style="background: #${headerBg}; color: #${nicheProfile.spreadsheetTokens.headerText || "334155"};">Progress</div>

  <!-- Data rows -->
  ${data.budgetRows.map((row, i) => {
    const rowNum = 11 + i;
    const altBg = isDark
      ? (i % 2 === 1 ? `background: #1A2740;` : `background: #162033;`)
      : (i % 2 === 1 ? `background: #${nicheProfile.spreadsheetTokens.rowAlt || "f8fafc"};` : "");
    const dataBorder = isDark ? `border-bottom: 1px solid #2D3A52; border-right: none;` : "";
    const goal = data.savingsGoals[i];
    return `
  <div class="row-num">${rowNum}</div>
  <div class="cell" style="grid-column: span 2; ${altBg} ${dataBorder}">${escHtml(row.category)}</div>
  <div class="cell right" style="${altBg} ${dataBorder}">${escHtml(row.budget)}</div>
  <div class="cell right" style="${altBg} ${dataBorder}">${escHtml(row.actual)}</div>
  <div class="cell right" style="${altBg} ${dataBorder}${parseInt(row.remaining.replace(/[^0-9-]/g, "")) < 0 ? ` color: ${isDark ? "#EF4444" : "#dc2626"};` : ""}">${escHtml(row.remaining)}</div>
  ${goal ? `
  <div class="cell" style="grid-column: span 2; ${altBg} ${dataBorder}">${escHtml(goal.name)}</div>
  <div class="cell right" style="${altBg} ${dataBorder}">${escHtml(goal.target)}</div>
  <div class="cell right" style="${altBg} ${dataBorder}">${escHtml(goal.saved)}</div>
  <div class="cell right" style="${altBg} ${dataBorder}">${escHtml(goal.progress)}</div>
  ` : `
  <div class="cell empty" style="grid-column: span 2; ${altBg} ${dataBorder}"></div>
  <div class="cell empty" style="${altBg} ${dataBorder}"></div>
  <div class="cell empty" style="${altBg} ${dataBorder}"></div>
  <div class="cell empty" style="${altBg} ${dataBorder}"></div>
  `}`;
  }).join("")}

  <!-- Totals row -->
  <div class="row-num">${11 + data.budgetRows.length}</div>
  <div class="cell totals" style="grid-column: span 2; background: #${nicheProfile.spreadsheetTokens.totalsBg || "e2e8f0"}; color: #${nicheProfile.spreadsheetTokens.totalsText || "0f172a"};">TOTAL</div>
  <div class="cell totals right" style="background: #${nicheProfile.spreadsheetTokens.totalsBg || "e2e8f0"}; color: #${nicheProfile.spreadsheetTokens.totalsText || "0f172a"};">${escHtml(data.totalBudget)}</div>
  <div class="cell totals right" style="background: #${nicheProfile.spreadsheetTokens.totalsBg || "e2e8f0"}; color: #${nicheProfile.spreadsheetTokens.totalsText || "0f172a"};">${escHtml(data.totalActual)}</div>
  <div class="cell totals right" style="background: #${nicheProfile.spreadsheetTokens.totalsBg || "e2e8f0"}; color: #${nicheProfile.spreadsheetTokens.totalsText || "0f172a"};">
    ${escHtml(formatCurrency(
      parseInt(data.totalBudget.replace(/[^0-9.-]/g, "")) - parseInt(data.totalActual.replace(/[^0-9.-]/g, ""))
    ))}
  </div>
  <div class="cell empty" style="grid-column: span 6;"></div>

  <!-- Empty rows to fill space -->
  ${Array.from({ length: Math.max(0, totalDisplayRows - 11 - data.budgetRows.length - 1) }, (_, i) => {
    const rowNum = 12 + data.budgetRows.length + i;
    return `
  <div class="row-num">${rowNum}</div>
  <div class="cell empty" style="grid-column: span ${numCols}; background: ${emptyBg};"></div>`;
  }).join("")}
</div>

${opts.showChrome ? `
<div class="gs-scrollbar"><div class="thumb"></div></div>
<div class="gs-hscrollbar"><div class="thumb"></div></div>
` : ""}

${opts.showTabBar ? `
<div class="gs-tab-bar">
  <div class="nav-btns">
    <span>◀</span><span>▶</span><span>+</span>
  </div>
  ${uniqueTabs.map((t, i) =>
    `<div class="tab${t.name === activeTabName || (i === 0 && !uniqueTabs.find(ut => ut.name === activeTabName)) ? " active" : ""}">${escHtml(t.name)}</div>`
  ).join("\n  ")}
</div>
` : ""}
</body></html>`;
}

function buildTransactionHTML(
  rows: TransactionRow[],
  allTabs: BlueprintTab[],
  activeTabName: string,
  nicheProfile: NicheDesignProfile,
  opts: { showChrome: boolean; showTabBar: boolean },
): string {
  const accentColor = nicheProfile.palette.primary;
  const headerBg = nicheProfile.spreadsheetTokens.headerBg || "F1F5F9";

  const seen = new Set<string>();
  const uniqueTabs = allTabs.filter(t => {
    const lower = t.name.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });

  const numCols = 7;
  const columns = ["Date", "Description", "Amount", "Sub-Category", "Category", "Bucket", "Month"];

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; background: white; }

  .gs-chrome { background: white; border-bottom: 1px solid #dadce0; }
  .gs-title-bar {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px; font-size: 18px; color: #202124;
  }
  .gs-title-bar .icon {
    width: 24px; height: 24px; background: #0f9d58; border-radius: 3px;
    display: flex; align-items: center; justify-content: center;
    color: white; font-size: 14px; font-weight: bold;
  }
  .gs-menu-bar {
    display: flex; gap: 2px; padding: 0 12px 4px; font-size: 13px; color: #3c4043;
  }
  .gs-menu-bar span { padding: 4px 8px; border-radius: 4px; }
  .gs-toolbar {
    display: flex; align-items: center; gap: 4px;
    padding: 4px 8px; background: #edf2fa; border-bottom: 1px solid #dadce0;
    font-size: 13px; color: #444746;
  }
  .gs-toolbar .sep { width: 1px; height: 20px; background: #dadce0; margin: 0 4px; }
  .gs-toolbar .btn { padding: 2px 6px; border-radius: 3px; font-size: 13px; color: #444746; }
  .gs-toolbar select {
    border: 1px solid #dadce0; border-radius: 4px; padding: 2px 4px;
    font-size: 13px; background: white; color: #444746;
  }
  .gs-formula-bar {
    display: flex; align-items: center; border-bottom: 1px solid #dadce0;
    height: 30px; font-size: 13px;
  }
  .gs-formula-bar .cell-ref {
    width: 80px; text-align: center; border-right: 1px solid #dadce0;
    padding: 0 8px; color: #3c4043; font-size: 12px;
  }
  .gs-formula-bar .fx {
    padding: 0 8px; color: #80868b; border-right: 1px solid #dadce0; font-style: italic;
  }
  .gs-formula-bar .content { padding: 0 8px; color: #3c4043; flex: 1; }

  .gs-grid {
    display: grid;
    grid-template-columns: 44px repeat(${numCols}, 1fr);
    font-size: 13px; line-height: 1;
  }
  .col-header {
    background: #f8f9fa; color: #5f6368; text-align: center;
    padding: 5px 0; border-bottom: 1px solid #e8eaed;
    border-right: 1px solid #e8eaed; font-size: 11px;
  }
  .col-header.corner { border-right: 1px solid #e8eaed; }
  .row-num {
    background: #f8f9fa; color: #80868b; text-align: center;
    border-bottom: 1px solid #e8eaed; border-right: 1px solid #e8eaed;
    font-size: 11px; display: flex; align-items: center; justify-content: center;
    min-height: 25px;
  }
  .cell {
    border-bottom: 1px solid #e2e5e9; border-right: 1px solid #e2e5e9;
    padding: 4px 6px; color: #202124; font-size: 12px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    min-height: 25px; display: flex; align-items: center;
  }
  .cell.right { justify-content: flex-end; }
  .cell.center { justify-content: center; }
  .cell.bold { font-weight: 700; }
  .cell.title-cell {
    font-size: 15px; font-weight: 500; color: white;
    padding: 10px 8px; min-height: 40px;
  }
  .cell.header {
    font-weight: 600; font-size: 12px;
  }
  .cell.selected { outline: 2px solid #1a73e8; outline-offset: -1px; z-index: 1; position: relative; }

  .gs-tab-bar {
    display: flex; align-items: center; background: #f8f9fa;
    border-top: 1px solid #dadce0; padding: 0 8px; height: 32px;
    font-size: 12px; position: fixed; bottom: 0; left: 0; right: 0;
  }
  .gs-tab-bar .nav-btns { display: flex; gap: 2px; margin-right: 8px; color: #80868b; }
  .gs-tab-bar .nav-btns span { padding: 2px 4px; font-size: 10px; }
  .gs-tab-bar .tab {
    padding: 6px 16px; border: 1px solid #dadce0; border-bottom: none;
    border-radius: 4px 4px 0 0; color: #80868b; background: transparent;
    margin-left: -1px; font-size: 12px;
  }
  .gs-tab-bar .tab.active {
    background: white; color: #202124; font-weight: 500;
    border-bottom: 3px solid ${accentColor}; padding-bottom: 3px;
  }
</style>
</head>
<body>
${opts.showChrome ? `
<div class="gs-chrome">
  <div class="gs-title-bar">
    <div class="icon">⊞</div>
    <span>${escHtml(activeTabName)}</span>
  </div>
  <div class="gs-menu-bar">
    <span>File</span><span>Edit</span><span>View</span><span>Insert</span>
    <span>Format</span><span>Data</span><span>Extensions</span><span>Help</span>
  </div>
</div>
<div class="gs-toolbar">
  <span class="btn">↶</span><span class="btn">↷</span>
  <div class="sep"></div>
  <select><option>Arial</option></select>
  <select style="width:50px"><option>10</option></select>
  <div class="sep"></div>
  <span class="btn"><b>B</b></span><span class="btn"><i>I</i></span>
  <span class="btn" style="text-decoration:underline">U</span>
  <div class="sep"></div>
  <span class="btn">$</span><span class="btn">%</span>
  <span class="btn">.0</span><span class="btn">.00</span>
</div>
<div class="gs-formula-bar">
  <div class="cell-ref">A1</div>
  <div class="fx"><i>f</i>x</div>
  <div class="content">${escHtml(activeTabName)}</div>
</div>
` : ""}

<div class="gs-grid" style="padding-bottom: 50px; padding-right: 14px;">
  <div class="col-header corner"></div>
  ${Array.from({ length: numCols }, (_, i) => `<div class="col-header">${colLetter(i)}</div>`).join("\n  ")}

  <!-- Row 1: Date header -->
  <div class="row-num">1</div>
  <div class="cell title-cell center bold" style="grid-column: span ${numCols}; background: ${accentColor};">
    ${rows.length > 0 ? escHtml(rows[0].date.slice(0, 7) || "2026-01-01") : "2026-01-01"}
  </div>

  <!-- Row 2: Spacer -->
  <div class="row-num">2</div>
  <div class="cell" style="grid-column: span ${numCols}; min-height: 8px;"></div>

  <!-- Row 3: Column headers -->
  <div class="row-num">3</div>
  ${columns.map(col =>
    `<div class="cell header" style="background: #${headerBg};">${escHtml(col)}</div>`
  ).join("\n  ")}

  <!-- Data rows -->
  ${rows.map((row, i) => {
    const rowNum = 4 + i;
    const vals = [row.date, row.description, row.amount, row.subcategory, row.category, row.bucket, row.month];
    const altBg = i % 2 === 0 ? "" : `background: #${nicheProfile.spreadsheetTokens.rowAlt || "f8fafc"};`;
    return `
  <div class="row-num">${rowNum}</div>
  ${vals.map((v, ci) =>
    `<div class="cell${ci === 2 ? " right" : ""}${rowNum === 4 && ci === 0 ? " selected" : ""}" style="${altBg}">${escHtml(v)}</div>`
  ).join("\n  ")}`;
  }).join("")}

  <!-- Empty rows — just enough to fill viewport, not 60 -->
  ${Array.from({ length: Math.max(0, 12) }, (_, i) => {
    const rowNum = 4 + rows.length + i;
    return `
  <div class="row-num">${rowNum}</div>
  <div class="cell" style="grid-column: span ${numCols};"></div>`;
  }).join("")}
</div>

${opts.showChrome ? `
<div class="gs-scrollbar" style="position:fixed;right:0;top:120px;bottom:36px;width:14px;background:#f1f1f1;border-left:1px solid #dadce0;z-index:10;">
  <div style="position:absolute;top:8px;left:2px;right:2px;height:100px;background:#c1c1c1;border-radius:7px;"></div>
</div>
<div style="position:fixed;bottom:32px;left:44px;right:14px;height:14px;background:#f1f1f1;border-top:1px solid #dadce0;z-index:10;">
  <div style="position:absolute;top:2px;left:8px;bottom:2px;width:180px;background:#c1c1c1;border-radius:7px;"></div>
</div>
` : ""}

<div class="gs-tab-bar">
  <div class="nav-btns"><span>◀</span><span>▶</span><span>+</span></div>
  ${uniqueTabs.map((t) => {
    const isActive = t.name.toLowerCase() === activeTabName.toLowerCase()
      || t.name.toLowerCase().includes("transaction");
    return `<div class="tab${isActive ? " active" : ""}">${escHtml(t.name)}</div>`;
  }).join("\n  ")}
</div>
</body></html>`;
}

// ── Screenshot Functions ─────────────────────────────────────

/**
 * Take a screenshot of HTML content using Playwright.
 */
async function screenshotHTML(
  html: string,
  width: number,
  height: number,
  deviceScaleFactor: number = 2,
): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor,
  });

  try {
    await page.setContent(html, { waitUntil: "networkidle" });
    // Small delay for font rendering
    await page.waitForTimeout(100);
    const buffer = await page.screenshot({
      type: "png",
      fullPage: false,
    });
    return Buffer.from(buffer);
  } finally {
    await page.close();
  }
}

/**
 * Generate a real dashboard preview screenshot.
 */
export async function screenshotDashboard(
  blueprint: ProductBlueprint,
  nicheProfile: NicheDesignProfile,
  options: PreviewOptions = {},
): Promise<ScreenshotResult> {
  const width = options.width || 1200;
  const height = options.height || 800;

  // Use the niche's natural light-themed profile as-is.
  // The real Google Sheet screenshot (taken by the preview route) shows
  // the actual product. This synthetic fallback should match the niche's
  // designed colors — NOT override with a dark theme.
  const effectiveProfile = nicheProfile;

  const nicheData = getNicheData(effectiveProfile.id);

  const dashTab = blueprint.tabs.find(t => t.name.toLowerCase().includes("dashboard"));
  const activeTabName = dashTab?.name || "Dashboard";

  const data = extractDashboardData(blueprint, effectiveProfile, nicheData);
  const html = buildDashboardHTML(
    data,
    blueprint.tabs,
    activeTabName,
    effectiveProfile,
    {
      showChrome: options.showChrome !== false,
      showTabBar: options.showTabBar !== false,
      cropToData: options.cropToData || false,
    },
  );

  const buffer = await screenshotHTML(html, width, height, options.deviceScaleFactor || 2);
  return { buffer, width: width * (options.deviceScaleFactor || 2), height: height * (options.deviceScaleFactor || 2) };
}

/**
 * Generate a real transaction/feature tab screenshot.
 */
export async function screenshotTransactions(
  blueprint: ProductBlueprint,
  nicheProfile: NicheDesignProfile,
  options: PreviewOptions = {},
): Promise<ScreenshotResult> {
  const width = options.width || 1200;
  const height = options.height || 800;

  const txnTab = blueprint.tabs.find(t =>
    t.name.toLowerCase().includes("transaction") || t.name.toLowerCase().includes("log")
  );
  const activeTabName = txnTab?.name || "Transactions";

  const rows = extractTransactionData(blueprint, options.maxDataRows || 20);
  const html = buildTransactionHTML(
    rows,
    blueprint.tabs,
    activeTabName,
    nicheProfile,
    {
      showChrome: options.showChrome !== false,
      showTabBar: options.showTabBar !== false,
    },
  );

  const buffer = await screenshotHTML(html, width, height, options.deviceScaleFactor || 2);
  return { buffer, width: width * (options.deviceScaleFactor || 2), height: height * (options.deviceScaleFactor || 2) };
}

/**
 * Screenshot a specific tab by name (for niche-specific image kinds).
 * Falls back to transaction screenshot if tab not found.
 */
export async function screenshotSpecificTab(
  blueprint: ProductBlueprint,
  nicheProfile: NicheDesignProfile,
  targetTabName: string,
  options: PreviewOptions = {},
): Promise<ScreenshotResult> {
  const width = options.width || 1200;
  const height = options.height || 800;

  // Find the target tab (case-insensitive partial match)
  const targetLower = targetTabName.toLowerCase();
  const matchedTab = blueprint.tabs.find(t =>
    t.name.toLowerCase().includes(targetLower)
  );
  const activeTabName = matchedTab?.name || targetTabName;

  // Extract data from the matched tab if possible
  const rows = matchedTab
    ? extractTabData(matchedTab, options.maxDataRows || 20)
    : extractTransactionData(blueprint, options.maxDataRows || 20);

  const html = buildTransactionHTML(
    rows,
    blueprint.tabs,
    activeTabName,
    nicheProfile,
    {
      showChrome: options.showChrome !== false,
      showTabBar: options.showTabBar !== false,
    },
  );

  const buffer = await screenshotHTML(html, width, height, options.deviceScaleFactor || 2);
  return { buffer, width: width * (options.deviceScaleFactor || 2), height: height * (options.deviceScaleFactor || 2) };
}

/**
 * Extract data rows from a specific tab's sample data, mapped to TransactionRow shape.
 */
function extractTabData(tab: BlueprintTab, maxRows: number): TransactionRow[] {
  const rows: TransactionRow[] = [];
  if (!tab.sampleRows || !tab.columns) return rows;

  const colNames = tab.columns.map(c => typeof c === "string" ? c : c.name);

  for (let i = 0; i < Math.min(tab.sampleRows.length, maxRows); i++) {
    const vals = tab.sampleRows[i] || [];
    // Map tab columns to TransactionRow fields by position or name
    const get = (idx: number) => String(vals[idx] ?? "");
    rows.push({
      date: get(colNames.findIndex(n => /date|day|month/i.test(n)) >= 0 ? colNames.findIndex(n => /date|day|month/i.test(n)) : 0),
      description: get(colNames.findIndex(n => /desc|name|item|activity/i.test(n)) >= 0 ? colNames.findIndex(n => /desc|name|item|activity/i.test(n)) : 1),
      amount: get(colNames.findIndex(n => /amount|cost|price|budget/i.test(n)) >= 0 ? colNames.findIndex(n => /amount|cost|price|budget/i.test(n)) : 2),
      category: get(colNames.findIndex(n => /categ|type|location/i.test(n)) >= 0 ? colNames.findIndex(n => /categ|type|location/i.test(n)) : 3),
      subcategory: get(Math.min(4, vals.length - 1)),
      bucket: get(Math.min(5, vals.length - 1)),
      month: get(colNames.findIndex(n => /month/i.test(n)) >= 0 ? colNames.findIndex(n => /month/i.test(n)) : 0),
    });
  }
  return rows;
}

/**
 * Generate a cropped dashboard view (zoomed into data area, no chrome).
 * Good for inside laptop mockups.
 */
export async function screenshotDashboardCrop(
  blueprint: ProductBlueprint,
  nicheProfile: NicheDesignProfile,
): Promise<ScreenshotResult> {
  return screenshotDashboard(blueprint, nicheProfile, {
    width: 1200,
    height: 700,
    showChrome: true,
    showTabBar: true,
    cropToData: true,
    deviceScaleFactor: 2,
  });
}

// ── Mockup Compositing ───────────────────────────────────────

/**
 * Place a screenshot inside a laptop mockup frame.
 * Returns a 2000x2000 Etsy-ready PNG.
 */
export async function composeLaptopMockup(
  screenshot: Buffer,
  title: string,
  subtitle: string,
  nicheProfile: NicheDesignProfile,
  featurePills?: string[],
): Promise<Buffer> {
  const W = 2000;
  const H = 2000;
  const pal = nicheProfile.palette;

  // Resize screenshot to fit laptop screen area
  const screenW = 1500;
  const screenH = 880;
  const resized = await sharp(screenshot)
    .resize(screenW, screenH, { fit: "cover", position: "top" })
    .png()
    .toBuffer();

  // Build the mockup as composited layers
  // 1. Background gradient
  const bgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stop-color="${pal.background}"/>
        <stop offset="100%" stop-color="${pal.primaryLight}"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
  </svg>`;

  // 2. Title text — refined premium typography, not blunt uppercase
  const titleLines = wrapText(title, 36);
  const font = nicheProfile.typography.fontFamily || "Arial";
  const titleSvg = `<svg width="${W}" height="250" xmlns="http://www.w3.org/2000/svg">
    ${titleLines.map((line, i) =>
      `<text x="${W / 2}" y="${65 + i * 55}" text-anchor="middle" font-family="${font}, Arial, sans-serif" font-size="46" font-weight="700" fill="${pal.text}" letter-spacing="0.5">${escHtml(line)}</text>`
    ).join("")}
    <text x="${W / 2}" y="${75 + titleLines.length * 55}" text-anchor="middle" font-family="${font}, Arial, sans-serif" font-size="20" font-weight="400" fill="${pal.textMuted}" letter-spacing="2">${escHtml(subtitle.toUpperCase())}</text>
  </svg>`;

  // 3. Laptop frame
  const laptopX = (W - screenW - 40) / 2;
  const laptopY = 200 + titleLines.length * 40;
  const laptopFrameSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <!-- Laptop body shadow -->
    <rect x="${laptopX - 5}" y="${laptopY - 5}" width="${screenW + 50}" height="${screenH + 50}" rx="12" fill="rgba(0,0,0,0.12)"/>
    <!-- Laptop body -->
    <rect x="${laptopX}" y="${laptopY}" width="${screenW + 40}" height="${screenH + 40}" rx="10" fill="#2d2d2d"/>
    <!-- Screen bezel -->
    <rect x="${laptopX + 20}" y="${laptopY + 20}" width="${screenW}" height="${screenH}" rx="2" fill="#111"/>
    <!-- Laptop base/hinge -->
    <path d="M${laptopX - 60} ${laptopY + screenH + 42} L${laptopX + screenW + 100} ${laptopY + screenH + 42} L${laptopX + screenW + 60} ${laptopY + screenH + 58} L${laptopX - 20} ${laptopY + screenH + 58} Z" fill="#3d3d3d" rx="3"/>
    <ellipse cx="${W / 2}" cy="${laptopY + screenH + 50}" rx="40" ry="3" fill="#555"/>
  </svg>`;

  // 4. Feature pills at bottom
  let pillsSvg = "";
  if (featurePills && featurePills.length > 0) {
    const pillY = laptopY + screenH + 100;
    const pillW = 320;
    const pillGap = 30;
    const totalW = featurePills.length * pillW + (featurePills.length - 1) * pillGap;
    const startX = (W - totalW) / 2;

    pillsSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      ${featurePills.map((pill, i) => {
        const x = startX + i * (pillW + pillGap);
        return `
        <rect x="${x}" y="${pillY}" width="${pillW}" height="${52}" rx="26" fill="white" stroke="${pal.primaryLight}" stroke-width="2"/>
        <circle cx="${x + 28}" cy="${pillY + 26}" r="10" fill="${pal.accent}"/>
        <text x="${x + 50}" y="${pillY + 31}" font-family="${font}, Arial, sans-serif" font-size="16" font-weight="600" fill="${pal.text}">${escHtml(pill)}</text>`;
      }).join("")}
    </svg>`;
  }

  // Composite all layers
  const bgBuf = await sharp(Buffer.from(bgSvg)).resize(W, H).png().toBuffer();
  const titleBuf = await sharp(Buffer.from(titleSvg)).resize(W, 250).png().toBuffer();
  const frameBuf = await sharp(Buffer.from(laptopFrameSvg)).resize(W, H).png().toBuffer();

  const composites: sharp.OverlayOptions[] = [
    { input: titleBuf, top: 0, left: 0 },
    { input: frameBuf, top: 0, left: 0 },
    { input: resized, top: Math.round(laptopY + 20), left: Math.round(laptopX + 20) },
  ];

  if (pillsSvg) {
    const pillsBuf = await sharp(Buffer.from(pillsSvg)).resize(W, H).png().toBuffer();
    composites.push({ input: pillsBuf, top: 0, left: 0 });
  }

  return sharp(bgBuf)
    .composite(composites)
    .resize(W, H)
    .png({ quality: 90 })
    .toBuffer();
}

/**
 * Compose a full-bleed spreadsheet screenshot (2000x2000).
 * This is the "dashboard preview" slot — just the spreadsheet, no mockup frame.
 */
export async function composeFullBleed(
  screenshot: Buffer,
  targetW: number = 2000,
  targetH: number = 2000,
): Promise<Buffer> {
  return sharp(screenshot)
    .resize(targetW, targetH, { fit: "cover", position: "top" })
    .png({ quality: 90 })
    .toBuffer();
}

/**
 * Place a screenshot inside a tablet (iPad-style) mockup frame.
 * Returns a 2000x2000 Etsy-ready PNG.
 */
export async function composeTabletMockup(
  screenshot: Buffer,
  title: string,
  nicheProfile: NicheDesignProfile,
): Promise<Buffer> {
  const W = 2000;
  const H = 2000;
  const pal = nicheProfile.palette;
  const font = nicheProfile.typography.fontFamily || "Arial";

  // Resize screenshot to fit tablet screen area
  const screenW = 1400;
  const screenH = 1050;
  const resized = await sharp(screenshot)
    .resize(screenW, screenH, { fit: "cover", position: "top" })
    .png()
    .toBuffer();

  // 1. Background gradient
  const bgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stop-color="${pal.background}"/>
        <stop offset="100%" stop-color="${pal.primaryLight}"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
  </svg>`;

  // 2. Title text
  const titleLines = wrapText(title, 40);
  const titleSvg = `<svg width="${W}" height="220" xmlns="http://www.w3.org/2000/svg">
    ${titleLines.map((line, i) =>
      `<text x="${W / 2}" y="${60 + i * 50}" text-anchor="middle" font-family="${font}, Arial, sans-serif" font-size="40" font-weight="700" fill="${pal.text}">${escHtml(line)}</text>`
    ).join("")}
    <text x="${W / 2}" y="${70 + titleLines.length * 50}" text-anchor="middle" font-family="${font}, Arial, sans-serif" font-size="16" font-weight="400" fill="${pal.textMuted}" letter-spacing="2">GOOGLE SHEETS TEMPLATE</text>
  </svg>`;

  // 3. Tablet frame
  const bezel = 20;
  const frameW = screenW + bezel * 2;
  const frameH = screenH + bezel * 2 + 50; // extra space for home button
  const frameX = (W - frameW) / 2;
  const frameY = 180 + titleLines.length * 40;
  const tabletFrameSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <!-- Tablet shadow -->
    <rect x="${frameX + 8}" y="${frameY + 8}" width="${frameW}" height="${frameH}" rx="16" fill="rgba(0,0,0,0.15)"/>
    <!-- Tablet body -->
    <rect x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}" rx="16" fill="#2d2d2d"/>
    <!-- Screen area -->
    <rect x="${frameX + bezel}" y="${frameY + bezel}" width="${screenW}" height="${screenH}" rx="2" fill="#111"/>
    <!-- Home button -->
    <circle cx="${W / 2}" cy="${frameY + screenH + bezel + 25}" r="16" fill="none" stroke="#555" stroke-width="2"/>
  </svg>`;

  // Composite all layers
  const bgBuf = await sharp(Buffer.from(bgSvg)).resize(W, H).png().toBuffer();
  const titleBuf = await sharp(Buffer.from(titleSvg)).resize(W, 220).png().toBuffer();
  const frameBuf = await sharp(Buffer.from(tabletFrameSvg)).resize(W, H).png().toBuffer();

  return sharp(bgBuf)
    .composite([
      { input: titleBuf, top: 0, left: 0 },
      { input: frameBuf, top: 0, left: 0 },
      { input: resized, top: Math.round(frameY + bezel), left: Math.round(frameX + bezel) },
    ])
    .resize(W, H)
    .png({ quality: 90 })
    .toBuffer();
}

/**
 * Place a screenshot inside a phone (iPhone-style) mockup frame.
 * Returns a 2000x2000 Etsy-ready PNG with feature bullets to the left.
 */
export async function composePhoneMockup(
  screenshot: Buffer,
  title: string,
  nicheProfile: NicheDesignProfile,
): Promise<Buffer> {
  const W = 2000;
  const H = 2000;
  const pal = nicheProfile.palette;
  const font = nicheProfile.typography.fontFamily || "Arial";

  // Resize screenshot to fit phone screen area
  const screenW = 500;
  const screenH = 900;
  const resized = await sharp(screenshot)
    .resize(screenW, screenH, { fit: "cover", position: "top" })
    .png()
    .toBuffer();

  // 1. Background gradient
  const bgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stop-color="${pal.background}"/>
        <stop offset="100%" stop-color="${pal.primaryLight}"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
  </svg>`;

  // 2. Title text
  const titleLines = wrapText(title, 32);
  const titleSvg = `<svg width="${W}" height="200" xmlns="http://www.w3.org/2000/svg">
    ${titleLines.map((line, i) =>
      `<text x="${W / 2}" y="${60 + i * 48}" text-anchor="middle" font-family="${font}, Arial, sans-serif" font-size="38" font-weight="700" fill="${pal.text}">${escHtml(line)}</text>`
    ).join("")}
  </svg>`;

  // 3. Phone frame + feature bullets as a single SVG
  const bezel = 12;
  const frameW = screenW + bezel * 2;
  const frameH = screenH + bezel * 2 + 20; // extra for notch area
  const phoneX = 1100; // right side of canvas
  const phoneY = 350;
  const notchW = 160;
  const notchH = 24;

  const features = [
    "\u2713 Auto-calculating formulas",
    "\u2713 Works in Google Sheets &amp; Excel",
    "\u2713 Instant digital download",
  ];
  const bulletX = 150;
  const bulletStartY = phoneY + 200;

  const phoneFrameSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <!-- Phone shadow -->
    <rect x="${phoneX + 6}" y="${phoneY + 6}" width="${frameW}" height="${frameH}" rx="28" fill="rgba(0,0,0,0.18)"/>
    <!-- Phone body -->
    <rect x="${phoneX}" y="${phoneY}" width="${frameW}" height="${frameH}" rx="28" fill="#1a1a1a"/>
    <!-- Notch -->
    <rect x="${phoneX + (frameW - notchW) / 2}" y="${phoneY}" width="${notchW}" height="${notchH}" rx="12" fill="#1a1a1a"/>
    <!-- Screen area -->
    <rect x="${phoneX + bezel}" y="${phoneY + bezel + 10}" width="${screenW}" height="${screenH}" rx="4" fill="#111"/>
    <!-- Feature bullets on the left -->
    ${features.map((feat, i) =>
      `<text x="${bulletX}" y="${bulletStartY + i * 60}" font-family="${font}, Arial, sans-serif" font-size="28" font-weight="500" fill="${pal.text}">${feat}</text>`
    ).join("")}
  </svg>`;

  // Composite all layers
  const bgBuf = await sharp(Buffer.from(bgSvg)).resize(W, H).png().toBuffer();
  const titleBuf = await sharp(Buffer.from(titleSvg)).resize(W, 200).png().toBuffer();
  const frameBuf = await sharp(Buffer.from(phoneFrameSvg)).resize(W, H).png().toBuffer();

  return sharp(bgBuf)
    .composite([
      { input: titleBuf, top: 0, left: 0 },
      { input: frameBuf, top: 0, left: 0 },
      { input: resized, top: Math.round(phoneY + bezel + 10), left: Math.round(phoneX + bezel) },
    ])
    .resize(W, H)
    .png({ quality: 90 })
    .toBuffer();
}

/**
 * Compose a HERO multi-device mockup: laptop (center) + tablet (right) + phone (far right).
 * All three devices display the SAME screenshot. Returns a 2000x2000 Etsy-ready PNG.
 */
export async function composeMultiDeviceMockup(
  screenshot: Buffer,
  title: string,
  subtitle: string,
  nicheProfile: NicheDesignProfile,
  featurePills?: string[],
): Promise<Buffer> {
  const W = 2000;
  const H = 2000;
  const pal = nicheProfile.palette;
  const font = nicheProfile.typography.fontFamily || "Arial";

  // Resize screenshot for each device
  const laptopScreenW = 1100;
  const laptopScreenH = 650;
  const tabletScreenW = 500;
  const tabletScreenH = 375;
  const phoneScreenW = 220;
  const phoneScreenH = 400;

  const [laptopImg, tabletImg, phoneImg] = await Promise.all([
    sharp(screenshot).resize(laptopScreenW, laptopScreenH, { fit: "cover", position: "top" }).png().toBuffer(),
    sharp(screenshot).resize(tabletScreenW, tabletScreenH, { fit: "cover", position: "top" }).png().toBuffer(),
    sharp(screenshot).resize(phoneScreenW, phoneScreenH, { fit: "cover", position: "top" }).png().toBuffer(),
  ]);

  // 1. Background gradient
  const bgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stop-color="${pal.background}"/>
        <stop offset="100%" stop-color="${pal.primaryLight}"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
  </svg>`;

  // 2. Title + subtitle
  const titleLines = wrapText(title, 36);
  const titleSvg = `<svg width="${W}" height="250" xmlns="http://www.w3.org/2000/svg">
    ${titleLines.map((line, i) =>
      `<text x="${W / 2}" y="${65 + i * 55}" text-anchor="middle" font-family="${font}, Arial, sans-serif" font-size="44" font-weight="700" fill="${pal.text}">${escHtml(line)}</text>`
    ).join("")}
    <text x="${W / 2}" y="${75 + titleLines.length * 55}" text-anchor="middle" font-family="${font}, Arial, sans-serif" font-size="18" font-weight="400" fill="${pal.textMuted}" letter-spacing="3">${escHtml(subtitle.toUpperCase())}</text>
  </svg>`;

  // 3. Device frames — laptop, tablet, phone
  const laptopX = 250;
  const laptopY = 320;
  const laptopBezel = 20;
  const laptopFrameW = laptopScreenW + laptopBezel * 2;
  const laptopFrameH = laptopScreenH + laptopBezel * 2;

  const tabletX = 1350;
  const tabletY = 480;
  const tabletBezel = 14;
  const tabletFrameW = tabletScreenW + tabletBezel * 2;
  const tabletFrameH = tabletScreenH + tabletBezel * 2;

  const phoneX = 1650;
  const phoneY = 400;
  const phoneBezel = 10;
  const phoneFrameW = phoneScreenW + phoneBezel * 2;
  const phoneFrameH = phoneScreenH + phoneBezel * 2 + 16;
  const phoneNotchW = 80;
  const phoneNotchH = 16;

  const devicesSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <!-- LAPTOP -->
    <!-- Shadow -->
    <rect x="${laptopX - 4}" y="${laptopY - 4}" width="${laptopFrameW + 8}" height="${laptopFrameH + 8}" rx="10" fill="rgba(0,0,0,0.12)"/>
    <!-- Body -->
    <rect x="${laptopX}" y="${laptopY}" width="${laptopFrameW}" height="${laptopFrameH}" rx="8" fill="#2d2d2d"/>
    <!-- Screen -->
    <rect x="${laptopX + laptopBezel}" y="${laptopY + laptopBezel}" width="${laptopScreenW}" height="${laptopScreenH}" rx="2" fill="#111"/>
    <!-- Base/hinge -->
    <path d="M${laptopX - 40} ${laptopY + laptopFrameH + 2} L${laptopX + laptopFrameW + 40} ${laptopY + laptopFrameH + 2} L${laptopX + laptopFrameW + 20} ${laptopY + laptopFrameH + 14} L${laptopX - 20} ${laptopY + laptopFrameH + 14} Z" fill="#3d3d3d"/>
    <ellipse cx="${laptopX + laptopFrameW / 2}" cy="${laptopY + laptopFrameH + 8}" rx="30" ry="2" fill="#555"/>

    <!-- TABLET -->
    <!-- Shadow -->
    <rect x="${tabletX + 6}" y="${tabletY + 6}" width="${tabletFrameW}" height="${tabletFrameH}" rx="12" fill="rgba(0,0,0,0.15)"/>
    <!-- Body -->
    <rect x="${tabletX}" y="${tabletY}" width="${tabletFrameW}" height="${tabletFrameH}" rx="12" fill="#2d2d2d"/>
    <!-- Screen -->
    <rect x="${tabletX + tabletBezel}" y="${tabletY + tabletBezel}" width="${tabletScreenW}" height="${tabletScreenH}" rx="2" fill="#111"/>

    <!-- PHONE -->
    <!-- Shadow -->
    <rect x="${phoneX + 4}" y="${phoneY + 4}" width="${phoneFrameW}" height="${phoneFrameH}" rx="22" fill="rgba(0,0,0,0.18)"/>
    <!-- Body -->
    <rect x="${phoneX}" y="${phoneY}" width="${phoneFrameW}" height="${phoneFrameH}" rx="22" fill="#1a1a1a"/>
    <!-- Notch -->
    <rect x="${phoneX + (phoneFrameW - phoneNotchW) / 2}" y="${phoneY}" width="${phoneNotchW}" height="${phoneNotchH}" rx="8" fill="#1a1a1a"/>
    <!-- Screen -->
    <rect x="${phoneX + phoneBezel}" y="${phoneY + phoneBezel + 8}" width="${phoneScreenW}" height="${phoneScreenH}" rx="3" fill="#111"/>

    <!-- Instant Download badge -->
    <rect x="${W - 300}" y="${H - 130}" width="240" height="44" rx="22" fill="${pal.accent}"/>
    <text x="${W - 180}" y="${H - 102}" text-anchor="middle" font-family="${font}, Arial, sans-serif" font-size="16" font-weight="700" fill="white">Instant Download</text>
  </svg>`;

  // 4. Feature pills at bottom
  let pillsSvg = "";
  if (featurePills && featurePills.length > 0) {
    const pillY = H - 200;
    const pillW = 320;
    const pillGap = 30;
    const totalW = featurePills.length * pillW + (featurePills.length - 1) * pillGap;
    const startX = (W - totalW) / 2;

    pillsSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      ${featurePills.map((pill, i) => {
        const x = startX + i * (pillW + pillGap);
        return `
        <rect x="${x}" y="${pillY}" width="${pillW}" height="${52}" rx="26" fill="white" stroke="${pal.primaryLight}" stroke-width="2"/>
        <circle cx="${x + 28}" cy="${pillY + 26}" r="10" fill="${pal.accent}"/>
        <text x="${x + 50}" y="${pillY + 31}" font-family="${font}, Arial, sans-serif" font-size="16" font-weight="600" fill="${pal.text}">${escHtml(pill)}</text>`;
      }).join("")}
    </svg>`;
  }

  // Composite all layers
  const bgBuf = await sharp(Buffer.from(bgSvg)).resize(W, H).png().toBuffer();
  const titleBuf = await sharp(Buffer.from(titleSvg)).resize(W, 250).png().toBuffer();
  const devicesBuf = await sharp(Buffer.from(devicesSvg)).resize(W, H).png().toBuffer();

  const composites: sharp.OverlayOptions[] = [
    { input: titleBuf, top: 0, left: 0 },
    { input: devicesBuf, top: 0, left: 0 },
    // Laptop screenshot
    { input: laptopImg, top: Math.round(laptopY + laptopBezel), left: Math.round(laptopX + laptopBezel) },
    // Tablet screenshot
    { input: tabletImg, top: Math.round(tabletY + tabletBezel), left: Math.round(tabletX + tabletBezel) },
    // Phone screenshot
    { input: phoneImg, top: Math.round(phoneY + phoneBezel + 8), left: Math.round(phoneX + phoneBezel) },
  ];

  if (pillsSvg) {
    const pillsBuf = await sharp(Buffer.from(pillsSvg)).resize(W, H).png().toBuffer();
    composites.push({ input: pillsBuf, top: 0, left: 0 });
  }

  return sharp(bgBuf)
    .composite(composites)
    .resize(W, H)
    .png({ quality: 90 })
    .toBuffer();
}

// ── Helper ───────────────────────────────────────────────────

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars && current) {
      lines.push(current.trim());
      current = word;
    } else {
      current += (current ? " " : "") + word;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}
