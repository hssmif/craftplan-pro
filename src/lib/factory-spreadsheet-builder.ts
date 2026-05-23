// ══════════════════════════════════════════════════════════════
// Universal Premium Spreadsheet Builder
//
// The CORE engine that transforms ANY ProductBlueprint into a
// premium, Etsy-sellable .xlsx file using ExcelJS.
//
// Unlike the hardcoded generators in /api/sheets/generate, this
// builder reads ALL niche-specific data from the blueprint:
//   - Tab names, purposes, columns, sample rows
//   - Formulas with dynamic cross-tab references
//   - Color schemes, chart specs, feature flags
//
// Every cell gets explicit styling. The output must look like a
// $15-20 Etsy digital product when opened in Google Sheets.
// ══════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-require-imports
import ExcelJS from "exceljs";
import type { ProductBlueprint, BlueprintTab } from "@/types/factory";
import type { DashboardBlock } from "@/types/visual-direction";
import { resolveNicheProfile, type NicheDesignProfile } from "./factory-niche-themes";
import { getNicheData, type NicheDataProfile } from "./factory-niche-data";
import { getSpreadsheetDashboardConfig, type SpreadsheetDashboardConfig, type DashboardSectionDef } from "./factory-layout-families";

// ── Design Tokens ───────────────────────────────────────────

const DEFAULT_TOKENS = {
  kpiGreen: { bg: "D5F0D5", text: "166534" },
  kpiRed: { bg: "FEE2E2", text: "991B1B" },
  kpiYellow: { bg: "FEF3C7", text: "92400E" },
  kpiBlue: { bg: "DBEAFE", text: "1E40AF" },
  sectionPink: { bg: "FECDD3", text: "9F1239" },
  sectionGreen: { bg: "D1FAE5", text: "065F46" },
  sectionBlue: { bg: "DBEAFE", text: "1E3A8A" },
  sectionYellow: { bg: "FEF3C7", text: "78350F" },
  headerBg: "F1F5F9",
  headerText: "334155",
  rowAlt: "F8FAFC",
  totalsBg: "E2E8F0",
  totalsText: "0F172A",
  borderLight: "E2E8F0",
  mutedText: "6B7280",
};

let ACTIVE_TOKENS = { ...DEFAULT_TOKENS };

function buildDesignTokens(profile: NicheDesignProfile) {
  const t = profile.spreadsheetTokens;
  return {
    kpiGreen: { bg: t.kpiCards[0]?.bg || "D5F0D5", text: t.kpiCards[0]?.text || "166534" },
    kpiRed: { bg: t.kpiCards[1]?.bg || "FEE2E2", text: t.kpiCards[1]?.text || "991B1B" },
    kpiYellow: { bg: t.kpiCards[2]?.bg || "FEF3C7", text: t.kpiCards[2]?.text || "92400E" },
    kpiBlue: { bg: t.kpiCards[3]?.bg || "DBEAFE", text: t.kpiCards[3]?.text || "1E40AF" },
    sectionPink: { bg: t.sectionBg || "FECDD3", text: t.sectionText || "9F1239" },
    sectionGreen: { bg: t.sectionBg || "D1FAE5", text: t.sectionText || "065F46" },
    sectionBlue: { bg: t.sectionBg || "DBEAFE", text: t.sectionText || "1E3A8A" },
    sectionYellow: { bg: t.sectionBg || "FEF3C7", text: t.sectionText || "78350F" },
    headerBg: t.headerBg || "F1F5F9",
    headerText: t.headerText || "334155",
    rowAlt: t.rowAlt || "F8FAFC",
    totalsBg: t.totalsBg || "E2E8F0",
    totalsText: t.totalsText || "0F172A",
    borderLight: t.borderColor || "E2E8F0",
    mutedText: "6B7280",
  };
}

// ── Color Helpers ───────────────────────────────────────────

/** Strip leading # from hex color for ExcelJS ARGB format */
function hex(color: string): string {
  return color.startsWith("#") ? color.slice(1) : color;
}

/** Prepend FF alpha to a hex color for ExcelJS */
function argb(color: string): string {
  return "FF" + hex(color);
}

function solidFill(color: string): ExcelJS.FillPattern {
  return { type: "pattern", pattern: "solid", fgColor: { argb: argb(color) } };
}

function fontColor(color: string): Partial<ExcelJS.Color> {
  return { argb: argb(color) };
}

function thinBorder(color: string = ACTIVE_TOKENS.borderLight): Partial<ExcelJS.Border> {
  return { style: "thin", color: { argb: argb(color) } };
}

function mediumBorder(color: string = ACTIVE_TOKENS.borderLight): Partial<ExcelJS.Border> {
  return { style: "medium", color: { argb: argb(color) } };
}

function allThinBorders() {
  return {
    top: thinBorder(),
    bottom: thinBorder(),
    left: thinBorder(),
    right: thinBorder(),
  };
}

const FONT_BASE = { name: "Calibri" as const };

// ── Number Format Map ───────────────────────────────────────

const NUMBER_FORMATS: Record<string, string> = {
  currency: '"$"#,##0.00',
  percent: '0"%"',       // Literal "%" — blueprint data stores whole numbers (50 = 50%), NOT decimals
  date: "yyyy-mm-dd",
  number: "#,##0",
};

// ── Column Width Defaults ───────────────────────────────────

const COLUMN_WIDTH_DEFAULTS: Record<string, number> = {
  text: 24,      // ~180px
  currency: 16,  // ~120px
  percent: 12,   // ~90px
  date: 16,      // ~120px
  number: 14,    // ~105px
  formula: 16,   // ~120px
};

// ── Alignment by Column Type ────────────────────────────────

function alignmentForType(
  type: string
): Partial<ExcelJS.Alignment> {
  switch (type) {
    case "currency":
    case "number":
    case "formula":
      return { horizontal: "right", vertical: "middle" };
    case "percent":
      return { horizontal: "center", vertical: "middle" };
    case "date":
      return { horizontal: "center", vertical: "middle" };
    default:
      return { horizontal: "left", vertical: "middle" };
  }
}

// ── Tab Classification ──────────────────────────────────────

type TabRole =
  | "dashboard"
  | "transactions"
  | "monthly-summary"
  | "savings-goals"
  | "budget-setup"
  | "setup-instructions"
  | "smart-calendar"
  | "year-in-review"
  | "money-coach"
  | "what-if-simulator"
  | "data"
  | "custom";

function classifyTab(tab: BlueprintTab): TabRole {
  // Rich, hand-crafted layouts win over keyword heuristics.
  if (tab.richLayout) {
    return tab.richLayout as TabRole;
  }
  const n = tab.name.toLowerCase();
  const p = tab.purpose.toLowerCase();
  if (n.includes("dashboard") || p.includes("dashboard")) return "dashboard";
  if (n.includes("transaction") || n.includes("log") || p.includes("transaction")) return "transactions";
  if (n.includes("monthly") || n.includes("summary") || p.includes("monthly summary")) return "monthly-summary";
  if (n.includes("saving") && n.includes("goal")) return "savings-goals";
  if (n.includes("budget") && n.includes("setup")) return "budget-setup";
  if (n.includes("setup") || n.includes("instruction") || n.includes("how to") || n.includes("welcome")) return "setup-instructions";
  if (n.includes("budget") || n.includes("config")) return "budget-setup";
  return "data";
}

// ── Dynamic Tab Name Resolver ───────────────────────────────

function findTabName(tabs: BlueprintTab[], keyword: string, fallback: string): string {
  const found = tabs.find((t) => t.name.toLowerCase().includes(keyword));
  return found?.name || fallback;
}

// ── Month List ──────────────────────────────────────────────

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ══════════════════════════════════════════════════════════════
// CELL VALUE HELPER
// Blueprint sampleRows contain formulas as "=SUMIFS(...)".
// We detect those and set them as ExcelJS formula objects.
// ══════════════════════════════════════════════════════════════

function setCellValue(
  cell: ExcelJS.Cell,
  value: string | number | null | undefined
): void {
  if (value === null || value === undefined) {
    cell.value = null;
    return;
  }
  if (typeof value === "string" && value.startsWith("=")) {
    cell.value = { formula: value.slice(1) } as ExcelJS.CellFormulaValue;
  } else {
    cell.value = value;
  }
}

/**
 * Normalize a percentage value for display with '0"%"' format.
 * '0"%"' format shows the raw number with "%" appended (no auto-multiply).
 *   - If string like "25%" → strips "%" and returns number 25
 *   - If decimal like 0.25 → converts to 25 (whole-number percent)
 *   - If already a whole number like 25 → returns as-is
 *   - If null/undefined → returns 0
 */
function normalizePercentValue(val: string | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "string") {
    const cleaned = val.replace(/%/g, "").trim();
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  // If it's a small decimal (between -1 and 1, exclusive, not 0), it's likely a ratio
  if (Math.abs(val) > 0 && Math.abs(val) < 1) {
    return Math.round(val * 100);
  }
  return val;
}

// ══════════════════════════════════════════════════════════════
// STYLING PRIMITIVES
// Reusable functions that apply premium visual treatment to
// individual rows/cells. Every call sets explicit font, fill,
// alignment, and border — no unstyled cells.
// ══════════════════════════════════════════════════════════════

type WS = ExcelJS.Worksheet;

function applyTitleBar(
  ws: WS,
  rowNum: number,
  text: string,
  bgColor: string,
  textColor: string,
  numCols: number,
  fontSize: number = 18,
  rowHeight: number = 60
): void {
  ws.mergeCells(rowNum, 1, rowNum, numCols);
  const cell = ws.getCell(rowNum, 1);
  cell.value = text;
  cell.fill = solidFill(bgColor);
  cell.font = { ...FONT_BASE, bold: true, size: fontSize, color: fontColor(textColor) };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = {
    bottom: { style: "medium", color: { argb: argb(bgColor) } },
    top: {},
    left: {},
    right: {},
  };
  ws.getRow(rowNum).height = rowHeight;
}

function applySubtitleBar(
  ws: WS,
  rowNum: number,
  text: string,
  bgColor: string,
  textColor: string,
  numCols: number
): void {
  ws.mergeCells(rowNum, 1, rowNum, numCols);
  const cell = ws.getCell(rowNum, 1);
  cell.value = text;
  cell.fill = solidFill(bgColor);
  cell.font = { ...FONT_BASE, size: 11, color: fontColor(textColor) };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = allThinBorders();
  ws.getRow(rowNum).height = 28;
}

function applySpacer(ws: WS, rowNum: number, numCols: number, height: number = 16): void {
  const row = ws.getRow(rowNum);
  row.height = height;
  for (let c = 1; c <= numCols; c++) {
    const cell = row.getCell(c);
    cell.fill = solidFill("FFFFFF");
    cell.font = { ...FONT_BASE, size: 1, color: fontColor("FFFFFF") };
    cell.border = {};
  }
}

function applyColumnHeaders(
  ws: WS,
  rowNum: number,
  headers: string[],
  colTypes: string[],
  startCol: number = 1
): void {
  const row = ws.getRow(rowNum);
  row.height = 28;
  headers.forEach((header, i) => {
    const col = startCol + i;
    const cell = row.getCell(col);
    cell.value = header.toUpperCase();
    cell.fill = solidFill(ACTIVE_TOKENS.headerBg);
    cell.font = { ...FONT_BASE, bold: true, size: 9, color: fontColor(ACTIVE_TOKENS.headerText) };
    cell.alignment = alignmentForType(colTypes[i] || "text");
    // Premium: strong bottom border, clean top
    cell.border = {
      bottom: mediumBorder(ACTIVE_TOKENS.headerText),
      top: {},
      left: {},
      right: {},
    };
  });
}

function applySectionHeader(
  ws: WS,
  rowNum: number,
  colStart: number,
  colEnd: number,
  text: string,
  bgColor: string,
  textColor: string
): void {
  // ── Card-style section header ──
  // Top accent stripe (3px colored bar above the section)
  ws.mergeCells(rowNum, colStart, rowNum, colEnd);
  const accentCell = ws.getCell(rowNum, colStart);
  accentCell.fill = solidFill(textColor);
  accentCell.font = { ...FONT_BASE, size: 1, color: fontColor(textColor) };
  accentCell.border = {};
  for (let c = colStart + 1; c <= colEnd; c++) {
    ws.getCell(rowNum, c).fill = solidFill(textColor);
  }
  ws.getRow(rowNum).height = 4;
  rowNum++;

  // Section title row — larger text, card-style bg
  ws.mergeCells(rowNum, colStart, rowNum, colEnd);
  const cell = ws.getCell(rowNum, colStart);
  cell.value = text;
  cell.fill = solidFill(bgColor);
  cell.font = { ...FONT_BASE, bold: true, size: 12, color: fontColor(textColor) };
  cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  cell.border = {
    left: { style: "medium", color: { argb: argb(textColor) } },
    right: thinBorder(bgColor),
    top: {},
    bottom: {},
  };
  for (let c = colStart + 1; c <= colEnd; c++) {
    const mc = ws.getCell(rowNum, c);
    mc.fill = solidFill(bgColor);
    mc.border = {
      right: c === colEnd ? thinBorder(bgColor) : {},
      top: {},
      left: {},
      bottom: {},
    };
  }
  ws.getRow(rowNum).height = 38;
}

/** Returns the number of rows consumed by applySectionHeader (accent + title) */
const SECTION_HEADER_ROWS = 2;

// ══════════════════════════════════════════════════════════════
// BLOCK LAYOUT — Canvas & Card Visual Primitives
//
// These create the "dashboard app" visual language:
//   Gray canvas → White card panels → Content inside cards
//
// Every dashboard cell is either:
//   1. Canvas gray (gutter, gap, spacer between blocks)
//   2. Card white (panel interior, data area)
//   3. Accent color (card top edge, KPI fills)
// ══════════════════════════════════════════════════════════════

const CANVAS_BG = "F0F2F5";     // Cool gray dashboard canvas
const CARD_BORDER = "D1D5DB";   // Subtle card top edge
const CARD_SHADOW = "C4C9CF";   // Bottom shadow (slightly darker)

/** Fill an entire row with canvas gray — used between blocks */
function applyCanvasRow(ws: WS, rowNum: number, numCols: number, height: number): void {
  const row = ws.getRow(rowNum);
  row.height = height;
  for (let c = 1; c <= numCols; c++) {
    const cell = row.getCell(c);
    cell.fill = solidFill(CANVAS_BG);
    cell.font = { ...FONT_BASE, size: 1, color: fontColor(CANVAS_BG) };
    cell.border = {};
  }
}

/** Card bottom shadow edge — subtle line under the card for depth */
function applyCardShadow(ws: WS, rowNum: number, startCol: number, endCol: number, numCols: number): void {
  const row = ws.getRow(rowNum);
  row.height = 2;
  for (let c = 1; c <= numCols; c++) {
    const cell = row.getCell(c);
    if (c >= startCol && c <= endCol) {
      cell.fill = solidFill("FFFFFF");
      cell.font = { ...FONT_BASE, size: 1, color: fontColor("FFFFFF") };
      cell.border = { bottom: { style: "thin", color: { argb: argb(CARD_SHADOW) } } };
    } else {
      cell.fill = solidFill(CANVAS_BG);
      cell.font = { ...FONT_BASE, size: 1, color: fontColor(CANVAS_BG) };
      cell.border = {};
    }
  }
}

/** Force specific columns to canvas gray — overrides any white fills from section renderers */
function forceCanvasColumns(ws: WS, startRow: number, endRow: number, cols: number[]): void {
  for (let r = startRow; r <= endRow; r++) {
    for (const c of cols) {
      const cell = ws.getCell(r, c);
      cell.fill = solidFill(CANVAS_BG);
      cell.font = { ...FONT_BASE, size: 1, color: fontColor(CANVAS_BG) };
      cell.border = {};
    }
  }
}

/** Final canvas pass — fill every unstyled cell with gray */
function paintDashboardCanvas(ws: WS, lastRow: number, numCols: number): void {
  for (let r = 1; r <= lastRow + 3; r++) {
    for (let c = 1; c <= numCols; c++) {
      const cell = ws.getCell(r, c);
      if (!cell.fill || !(cell.fill as ExcelJS.FillPattern).fgColor) {
        cell.fill = solidFill(CANVAS_BG);
        cell.font = { ...FONT_BASE, size: 1, color: fontColor(CANVAS_BG) };
        cell.border = {};
      }
    }
  }
}

function applyDataRow(
  ws: WS,
  rowNum: number,
  values: Array<string | number | null>,
  colTypes: string[],
  isAlt: boolean,
  startCol: number = 1,
  numFmtOverrides?: Record<number, string>
): void {
  const row = ws.getRow(rowNum);
  row.height = 28;
  const bgColor = isAlt ? ACTIVE_TOKENS.rowAlt : "FFFFFF";
  values.forEach((val, i) => {
    const col = startCol + i;
    const cell = row.getCell(col);
    const colType = colTypes[i] || "text";
    // Normalize percentage values before writing to cell
    const cellVal = colType === "percent" ? normalizePercentValue(val) : val;
    setCellValue(cell, cellVal as string | number | null);
    cell.fill = solidFill(bgColor);
    cell.font = { ...FONT_BASE, size: 11, color: fontColor("212529") };
    cell.alignment = alignmentForType(colType);
    cell.border = { bottom: thinBorder() };
    // Apply number format
    const fmt = numFmtOverrides?.[i] || NUMBER_FORMATS[colType];
    if (fmt) cell.numFmt = fmt;
  });
}

function applyTotalsRow(
  ws: WS,
  rowNum: number,
  values: Array<string | number | null>,
  colTypes: string[],
  startCol: number = 1
): void {
  const row = ws.getRow(rowNum);
  row.height = 32;
  values.forEach((val, i) => {
    const col = startCol + i;
    const cell = row.getCell(col);
    setCellValue(cell, val);
    cell.fill = solidFill(ACTIVE_TOKENS.totalsBg);
    cell.font = { ...FONT_BASE, bold: true, size: 12, color: fontColor(ACTIVE_TOKENS.totalsText) };
    cell.alignment = alignmentForType(colTypes[i] || "text");
    // Premium: double top border, strong bottom
    cell.border = {
      top: { style: "double", color: { argb: argb(ACTIVE_TOKENS.totalsText) } },
      bottom: mediumBorder(ACTIVE_TOKENS.totalsText),
      left: {},
      right: {},
    };
    const fmt = NUMBER_FORMATS[colTypes[i] || ""];
    if (fmt) cell.numFmt = fmt;
  });
}

function setKpiCard(
  ws: WS,
  labelRow: number,
  valueRow: number,
  col: number,
  label: string,
  value: string | number | null,
  kpiBg: string,
  kpiText: string,
  numFmt: string = '"$"#,##0'
): void {
  // Label cell — with colored top accent bar
  const labelCell = ws.getCell(labelRow, col);
  labelCell.value = label;
  labelCell.fill = solidFill(kpiBg);
  labelCell.font = { ...FONT_BASE, bold: true, size: 9, color: fontColor(kpiText) };
  labelCell.alignment = { horizontal: "center", vertical: "middle" };
  labelCell.border = {
    top: mediumBorder(kpiText),  // Colored accent bar on top
    left: thinBorder(kpiBg),
    right: thinBorder(kpiBg),
    bottom: {},
  };
  ws.getRow(labelRow).height = 26;

  // Value cell — large, bold, premium
  const valueCell = ws.getCell(valueRow, col);
  setCellValue(valueCell, value);
  valueCell.fill = solidFill(kpiBg);
  valueCell.font = { ...FONT_BASE, bold: true, size: 24, color: fontColor(kpiText) };
  valueCell.alignment = { horizontal: "center", vertical: "middle" };
  valueCell.border = {
    bottom: thinBorder(kpiBg),
    left: thinBorder(kpiBg),
    right: thinBorder(kpiBg),
    top: {},
  };
  valueCell.numFmt = numFmt;
  ws.getRow(valueRow).height = 52;
}

// ══════════════════════════════════════════════════════════════
// DATA VALIDATION HELPERS
// ══════════════════════════════════════════════════════════════

function addMonthDropdown(ws: WS, cellRef: string): void {
  ws.getCell(cellRef).dataValidation = {
    type: "list",
    allowBlank: false,
    formulae: [`"${MONTHS.join(",")}"`],
    showErrorMessage: true,
    errorTitle: "Invalid month",
    error: "Please select a month from the dropdown.",
  };
}

function addListDropdown(ws: WS, cellRef: string, items: string[]): void {
  if (items.length === 0) return;
  ws.getCell(cellRef).dataValidation = {
    type: "list",
    allowBlank: true,
    formulae: [`"${items.join(",")}"`],
    showErrorMessage: true,
    errorTitle: "Invalid selection",
    error: "Please choose from the dropdown list.",
  };
}

// ══════════════════════════════════════════════════════════════
// CONDITIONAL FORMATTING HELPERS
// ══════════════════════════════════════════════════════════════

function addStatusConditionalFormatting(
  ws: WS,
  colLetter: string,
  startRow: number,
  endRow: number
): void {
  const range = `${colLetter}${startRow}:${colLetter}${endRow}`;

  // Green for positive statuses
  ws.addConditionalFormatting({
    ref: range,
    rules: [
      {
        type: "containsText",
        operator: "containsText",
        text: "On Track",
        priority: 1,
        style: {
          fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFD5F0D5" } },
          font: { color: { argb: "FF166534" } },
        },
      },
      {
        type: "containsText",
        operator: "containsText",
        text: "Funded",
        priority: 2,
        style: {
          fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFD5F0D5" } },
          font: { color: { argb: "FF166534" } },
        },
      },
      {
        type: "containsText",
        operator: "containsText",
        text: "✅",
        priority: 3,
        style: {
          fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFD5F0D5" } },
          font: { color: { argb: "FF166534" } },
        },
      },
      {
        type: "containsText",
        operator: "containsText",
        text: "⚠️",
        priority: 4,
        style: {
          fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } },
          font: { color: { argb: "FF92400E" } },
        },
      },
      {
        type: "containsText",
        operator: "containsText",
        text: "Over",
        priority: 5,
        style: {
          fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } },
          font: { color: { argb: "FF991B1B" } },
        },
      },
      {
        type: "containsText",
        operator: "containsText",
        text: "🔴",
        priority: 6,
        style: {
          fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } },
          font: { color: { argb: "FF991B1B" } },
        },
      },
    ],
  });
}

function addNegativeCurrencyFormatting(
  ws: WS,
  colLetter: string,
  startRow: number,
  endRow: number
): void {
  const range = `${colLetter}${startRow}:${colLetter}${endRow}`;
  ws.addConditionalFormatting({
    ref: range,
    rules: [
      {
        type: "cellIs",
        operator: "lessThan",
        formulae: [0],
        priority: 10,
        style: {
          font: { color: { argb: "FF991B1B" } },
        },
      },
    ],
  });
}

// ── Column letter from 1-indexed number ─────────────────────

function colLetter(colNum: number): string {
  let letter = "";
  let n = colNum;
  while (n > 0) {
    n--;
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26);
  }
  return letter;
}

// ══════════════════════════════════════════════════════════════
// TAB BUILDERS
// Each function handles a specific tab role from the blueprint.
// ══════════════════════════════════════════════════════════════

// ── Dashboard Tab ───────────────────────────────────────────

function buildDashboardTab(
  wb: ExcelJS.Workbook,
  tab: BlueprintTab,
  blueprint: ProductBlueprint,
  titleBg: string,
  titleText: string,
  subtitleBg: string,
  subtitleText: string,
  tabColor: string
): void {
  const nicheProfile = resolveNicheProfile(
    (blueprint.config as { niche?: string })?.niche || blueprint.sourceListingTitle || "",
    blueprint.colorScheme
  );

  // ══════════════════════════════════════════════════════════════
  // PRIMARY PATH: Gemini-driven dynamic dashboard via blocks
  // If visualDirection.dashboard.blocks exists and has content,
  // we render EXACTLY what Gemini specified — no family templates.
  // ══════════════════════════════════════════════════════════════
  const vd = blueprint.visualDirection;
  const blocks = vd?.dashboard?.blocks;

  if (blocks && blocks.length >= 2) {
    console.log(`[spreadsheet] ✨ Dynamic dashboard: ${blocks.length} blocks [${blocks.map(b => b.type).join(" → ")}]`);
    buildDynamicDashboard(wb, tab, blueprint, nicheProfile, titleBg, titleText, subtitleBg, subtitleText, tabColor, blocks, vd.dashboard.layoutDensity || "balanced");
    return;
  }

  // ══════════════════════════════════════════════════════════════
  // BLOCK DASHBOARD — Unified card-on-canvas layout for ALL niches
  // Gray canvas + white card panels = dashboard app look
  // ══════════════════════════════════════════════════════════════
  console.log(`[spreadsheet] 🧱 Block dashboard for ${nicheProfile.id}`);
  buildBlockDashboard(wb, tab, blueprint, nicheProfile, titleBg, titleText, subtitleBg, subtitleText, tabColor);
}

// ══════════════════════════════════════════════════════════════
// DYNAMIC DASHBOARD — Gemini-Driven Block Composition
//
// Reads blocks[] from VisualDirectionSpec and composes a
// unique dashboard structure for each niche.
//
// No hardcoded layout. No fixed section order.
// Each block type maps to a rendering function that writes
// ExcelJS rows and advances the cursor.
// ══════════════════════════════════════════════════════════════

function buildDynamicDashboard(
  wb: ExcelJS.Workbook,
  tab: BlueprintTab,
  blueprint: ProductBlueprint,
  nicheProfile: NicheDesignProfile,
  titleBg: string,
  titleText: string,
  subtitleBg: string,
  subtitleText: string,
  tabColor: string,
  blocks: DashboardBlock[],
  layoutDensity: "spacious" | "balanced" | "dense" | "minimal",
): void {
  const nicheData = getNicheData(nicheProfile.id);
  const dashConfig = getSpreadsheetDashboardConfig(nicheProfile.id);
  const NUM_COLS = dashConfig.gridColumns;

  const ws = wb.addWorksheet(tab.name, {
    properties: { tabColor: { argb: argb(tabColor) } },
  });

  // Column widths based on layout density
  const colW = layoutDensity === "dense" ? 12 : layoutDensity === "spacious" ? 16 : 14;
  const gutterW = layoutDensity === "dense" ? 2 : 3;
  const cols: { width: number }[] = [{ width: gutterW }];
  for (let i = 1; i < NUM_COLS - 1; i++) cols.push({ width: colW });
  cols.push({ width: gutterW });
  ws.columns = cols;

  const spacerH = layoutDensity === "spacious" ? 20 : layoutDensity === "dense" ? 8 : 12;

  // Budget data from niche
  const income = nicheData.monthlyIncome;
  const spentRatios = [0.88, 0.92, 1.05, 0.78, 0.95, 0.85, 0.91, 0.82];
  const categoryData = nicheData.budgetCategories.map((cat, i) => ({
    name: cat.name,
    budget: cat.budgetAmount,
    spent: Math.round(cat.budgetAmount * (spentRatios[i % spentRatios.length])),
  }));

  let currentRow = 1;

  // ── Title bar ──
  const dashboardTitle = tab.sampleRows[0]?.[0] != null ? String(tab.sampleRows[0][0]) : "📊 DASHBOARD";
  applyTitleBar(ws, currentRow, dashboardTitle, titleBg, titleText, NUM_COLS, 18, 56);
  currentRow++;

  const subtitle = tab.sampleRows[1]?.[0] != null ? String(tab.sampleRows[1][0]) : nicheData.tagline;
  applySubtitleBar(ws, currentRow, subtitle, subtitleBg, subtitleText, NUM_COLS);
  currentRow++;
  applySpacer(ws, currentRow, NUM_COLS, spacerH);
  currentRow++;

  // ── Controls row ──
  const CONTROLS_ROW = currentRow;
  const controlsRow = ws.getRow(currentRow);
  controlsRow.height = 32;
  ws.getCell(currentRow, 2).value = "📅 SELECT MONTH:";
  ws.getCell(currentRow, 2).font = { ...FONT_BASE, bold: true, size: 10, color: fontColor(ACTIVE_TOKENS.headerText) };
  ws.getCell(currentRow, 2).alignment = { horizontal: "right", vertical: "middle" };
  const monthCell = ws.getCell(currentRow, 3);
  monthCell.value = MONTHS[new Date().getMonth()];
  monthCell.font = { ...FONT_BASE, bold: true, size: 12, color: fontColor(titleBg) };
  monthCell.alignment = { horizontal: "center", vertical: "middle" };
  monthCell.border = allThinBorders();
  monthCell.fill = solidFill("FFFFFF");
  addMonthDropdown(ws, `C${currentRow}`);

  ws.getCell(currentRow, 5).value = `💰 ${dashConfig.kpiLabels[0].toUpperCase()}:`;
  ws.getCell(currentRow, 5).font = { ...FONT_BASE, bold: true, size: 10, color: fontColor(ACTIVE_TOKENS.headerText) };
  ws.getCell(currentRow, 5).alignment = { horizontal: "right", vertical: "middle" };
  const incomeCell = ws.getCell(currentRow, 6);
  incomeCell.value = income;
  incomeCell.font = { ...FONT_BASE, bold: true, size: 14, color: fontColor(ACTIVE_TOKENS.kpiGreen.text) };
  incomeCell.alignment = { horizontal: "center", vertical: "middle" };
  incomeCell.numFmt = '"$"#,##0';
  incomeCell.border = allThinBorders();
  incomeCell.fill = solidFill(ACTIVE_TOKENS.kpiGreen.bg);
  for (let c = 1; c <= NUM_COLS; c++) {
    const cell = ws.getCell(currentRow, c);
    if (!cell.fill || !(cell.fill as ExcelJS.FillPattern).fgColor) {
      cell.fill = solidFill("FFFFFF");
    }
  }
  currentRow++;
  applySpacer(ws, currentRow, NUM_COLS, spacerH);
  currentRow++;

  const INCOME_REF = `F${CONTROLS_ROW}`;

  // Pre-compute data range references (needed by KPI formulas and bar charts)
  // We need to know where category data will be placed. Scan blocks to find category-table position.
  let catTableStartRow = 0;
  let catTableEndRow = 0;
  const catCount = categoryData.length;

  // ── RENDER BLOCKS IN ORDER ──
  for (const block of blocks) {
    switch (block.type) {

      case "kpi-cards": {
        // KPI cards — use dashConfig formulas but layout depends on block.style
        const kpiColors = [
          { bg: ACTIVE_TOKENS.kpiGreen.bg, text: ACTIVE_TOKENS.kpiGreen.text },
          { bg: ACTIVE_TOKENS.kpiRed.bg, text: ACTIVE_TOKENS.kpiRed.text },
          { bg: ACTIVE_TOKENS.kpiYellow.bg, text: ACTIVE_TOKENS.kpiYellow.text },
          { bg: ACTIVE_TOKENS.kpiBlue.bg, text: ACTIVE_TOKENS.kpiBlue.text },
        ];
        const kpiCount = Math.min(dashConfig.kpiCount, 4);

        if (block.style === "large" || block.style === "cards") {
          // LARGE: each KPI gets full-width row, big number
          for (let ki = 0; ki < kpiCount; ki++) {
            const col = ki * 3 + 2;
            ws.mergeCells(currentRow, col, currentRow, col + 2);
            const labelCell = ws.getCell(currentRow, col);
            labelCell.value = dashConfig.kpiLabels[ki];
            labelCell.fill = solidFill(kpiColors[ki % 4].bg);
            labelCell.font = { ...FONT_BASE, bold: true, size: 10, color: fontColor(kpiColors[ki % 4].text) };
            labelCell.alignment = { horizontal: "center", vertical: "middle" };
            labelCell.border = { top: mediumBorder(kpiColors[ki % 4].text) };

            ws.mergeCells(currentRow + 1, col, currentRow + 1, col + 2);
            const valCell = ws.getCell(currentRow + 1, col);
            // Use placeholder formulas (will resolve after category table)
            const formula = dashConfig.kpiFormulas[ki]
              ?.replace(/\{INCOME_REF\}/g, INCOME_REF)
              .replace(/\{SPENT_RANGE\}/g, "F$CATSTART:F$CATEND")
              .replace(/\{BUDGET_RANGE\}/g, "D$CATSTART:D$CATEND");
            if (formula) {
              valCell.value = { formula: formula.replace(/\$CATSTART/g, "999").replace(/\$CATEND/g, "999") } as ExcelJS.CellFormulaValue;
            } else {
              valCell.value = 0;
            }
            valCell.fill = solidFill(kpiColors[ki % 4].bg);
            valCell.font = { ...FONT_BASE, bold: true, size: block.style === "large" ? 28 : 22, color: fontColor(kpiColors[ki % 4].text) };
            valCell.alignment = { horizontal: "center", vertical: "middle" };
            valCell.numFmt = dashConfig.kpiFormats[ki];
            valCell.border = { bottom: thinBorder(kpiColors[ki % 4].bg) };
          }
          // Fill whitespace in remaining cells
          for (let r = currentRow; r <= currentRow + 1; r++) {
            for (let c = 1; c <= NUM_COLS; c++) {
              const cell = ws.getCell(r, c);
              if (!cell.fill || !(cell.fill as ExcelJS.FillPattern).fgColor) {
                cell.fill = solidFill("FFFFFF");
              }
            }
          }
          ws.getRow(currentRow).height = 28;
          ws.getRow(currentRow + 1).height = 60;
          currentRow += 2;
        } else {
          // COMPACT: single row of small KPI badges (minimal style)
          for (let ki = 0; ki < kpiCount; ki++) {
            const col = 2 + ki * 3;
            const cell = ws.getCell(currentRow, col);
            cell.value = `${dashConfig.kpiLabels[ki]}`;
            cell.fill = solidFill(kpiColors[ki % 4].bg);
            cell.font = { ...FONT_BASE, bold: true, size: 10, color: fontColor(kpiColors[ki % 4].text) };
            cell.alignment = { horizontal: "center", vertical: "middle" };
            cell.border = { top: mediumBorder(kpiColors[ki % 4].text), bottom: thinBorder(kpiColors[ki % 4].bg) };
          }
          for (let c = 1; c <= NUM_COLS; c++) {
            const cell = ws.getCell(currentRow, c);
            if (!cell.fill || !(cell.fill as ExcelJS.FillPattern).fgColor) cell.fill = solidFill("FFFFFF");
          }
          ws.getRow(currentRow).height = 36;
          currentRow++;
        }
        applySpacer(ws, currentRow, NUM_COLS, spacerH);
        currentRow++;
        break;
      }

      case "category-table": {
        // Budget categories with columns
        const sectionColors = ACTIVE_TOKENS.sectionBlue;
        if (block.title) {
          applySectionHeader(ws, currentRow, 1, NUM_COLS,
            `${block.emoji || "💳"} ${block.title}`,
            sectionColors.bg, sectionColors.text);
          currentRow += SECTION_HEADER_ROWS;
        }

        // Headers
        const catHeaders = ["Category", "Budgeted", "Spent", "Remaining", "Status"];
        const catCols = [2, 4, 6, 8, 10];
        const headerRow = ws.getRow(currentRow);
        headerRow.height = 26;
        catHeaders.forEach((h, i) => {
          const cell = headerRow.getCell(catCols[i]);
          cell.value = h.toUpperCase();
          cell.fill = solidFill(ACTIVE_TOKENS.headerBg);
          cell.font = { ...FONT_BASE, bold: true, size: 9, color: fontColor(ACTIVE_TOKENS.headerText) };
          cell.alignment = { horizontal: i === 0 ? "left" : "center", vertical: "middle" };
          cell.border = { bottom: mediumBorder(ACTIVE_TOKENS.headerText) };
        });
        for (let c = 1; c <= NUM_COLS; c++) {
          const cell = headerRow.getCell(c);
          if (!cell.fill || !(cell.fill as ExcelJS.FillPattern).fgColor) {
            cell.fill = solidFill(ACTIVE_TOKENS.headerBg);
          }
        }
        currentRow++;

        catTableStartRow = currentRow;
        const rowLimit = block.rowCount || catCount;
        const displayCats = categoryData.slice(0, rowLimit);
        for (let i = 0; i < displayCats.length; i++) {
          const isAlt = i % 2 === 1;
          const bgColor = isAlt ? ACTIVE_TOKENS.rowAlt : "FFFFFF";
          const row = ws.getRow(currentRow);
          row.height = 28;
          const R = currentRow;
          const cat = displayCats[i];

          ws.mergeCells(R, 2, R, 3);
          const nameCell = row.getCell(2);
          nameCell.value = cat.name;
          nameCell.fill = solidFill(bgColor);
          nameCell.font = { ...FONT_BASE, size: 11, color: fontColor("212529") };
          nameCell.alignment = { horizontal: "left", vertical: "middle" };
          nameCell.border = { bottom: thinBorder() };

          ws.mergeCells(R, 4, R, 5);
          const budgetCell = row.getCell(4);
          budgetCell.value = cat.budget;
          budgetCell.fill = solidFill(bgColor);
          budgetCell.font = { ...FONT_BASE, size: 11, color: fontColor("212529") };
          budgetCell.numFmt = '"$"#,##0';
          budgetCell.alignment = { horizontal: "right", vertical: "middle" };
          budgetCell.border = { bottom: thinBorder() };

          ws.mergeCells(R, 6, R, 7);
          const spentCell = row.getCell(6);
          spentCell.value = cat.spent;
          spentCell.fill = solidFill(bgColor);
          spentCell.font = { ...FONT_BASE, size: 11, color: fontColor("212529") };
          spentCell.numFmt = '"$"#,##0';
          spentCell.alignment = { horizontal: "right", vertical: "middle" };
          spentCell.border = { bottom: thinBorder() };

          ws.mergeCells(R, 8, R, 9);
          const remCell = row.getCell(8);
          remCell.value = { formula: `D${R}-F${R}` } as ExcelJS.CellFormulaValue;
          remCell.fill = solidFill(bgColor);
          remCell.font = { ...FONT_BASE, size: 11, color: fontColor("212529") };
          remCell.numFmt = '"$"#,##0';
          remCell.alignment = { horizontal: "right", vertical: "middle" };
          remCell.border = { bottom: thinBorder() };

          ws.mergeCells(R, 10, R, 12);
          const statusCell = row.getCell(10);
          statusCell.value = { formula: `IF(D${R}=0,"",IF(F${R}/D${R}>1,"🔴 Over",IF(F${R}/D${R}>0.9,"⚠️ Warning","✅ On Track")))` } as ExcelJS.CellFormulaValue;
          statusCell.fill = solidFill(bgColor);
          statusCell.font = { ...FONT_BASE, size: 10, color: fontColor("374151") };
          statusCell.alignment = { horizontal: "center", vertical: "middle" };
          statusCell.border = { bottom: thinBorder() };

          row.getCell(1).fill = solidFill(bgColor);
          row.getCell(NUM_COLS).fill = solidFill(bgColor);
          currentRow++;
        }
        catTableEndRow = currentRow - 1;

        // Totals
        const totRow = ws.getRow(currentRow);
        totRow.height = 30;
        ws.mergeCells(currentRow, 2, currentRow, 3);
        totRow.getCell(2).value = "TOTAL";
        totRow.getCell(2).fill = solidFill(ACTIVE_TOKENS.headerBg);
        totRow.getCell(2).font = { ...FONT_BASE, bold: true, size: 11, color: fontColor(ACTIVE_TOKENS.headerText) };
        totRow.getCell(2).border = allThinBorders();

        ws.mergeCells(currentRow, 4, currentRow, 5);
        totRow.getCell(4).value = { formula: `SUM(D${catTableStartRow}:D${catTableEndRow})` } as ExcelJS.CellFormulaValue;
        totRow.getCell(4).fill = solidFill(ACTIVE_TOKENS.headerBg);
        totRow.getCell(4).font = { ...FONT_BASE, bold: true, size: 11, color: fontColor(ACTIVE_TOKENS.headerText) };
        totRow.getCell(4).numFmt = '"$"#,##0';
        totRow.getCell(4).border = allThinBorders();

        ws.mergeCells(currentRow, 6, currentRow, 7);
        totRow.getCell(6).value = { formula: `SUM(F${catTableStartRow}:F${catTableEndRow})` } as ExcelJS.CellFormulaValue;
        totRow.getCell(6).fill = solidFill(ACTIVE_TOKENS.headerBg);
        totRow.getCell(6).font = { ...FONT_BASE, bold: true, size: 11, color: fontColor(ACTIVE_TOKENS.headerText) };
        totRow.getCell(6).numFmt = '"$"#,##0';
        totRow.getCell(6).border = allThinBorders();

        ws.mergeCells(currentRow, 8, currentRow, 9);
        totRow.getCell(8).value = { formula: `SUM(H${catTableStartRow}:H${catTableEndRow})` } as ExcelJS.CellFormulaValue;
        totRow.getCell(8).fill = solidFill(ACTIVE_TOKENS.headerBg);
        totRow.getCell(8).font = { ...FONT_BASE, bold: true, size: 11, color: fontColor(ACTIVE_TOKENS.headerText) };
        totRow.getCell(8).numFmt = '"$"#,##0';
        totRow.getCell(8).border = allThinBorders();

        for (let c = 1; c <= NUM_COLS; c++) {
          const cell = totRow.getCell(c);
          if (!cell.fill || !(cell.fill as ExcelJS.FillPattern).fgColor) {
            cell.fill = solidFill(ACTIVE_TOKENS.headerBg);
          }
        }
        currentRow++;
        applySpacer(ws, currentRow, NUM_COLS, spacerH);
        currentRow++;
        break;
      }

      case "bar-chart": {
        // REPT-based horizontal bar chart (budget vs actual)
        if (block.title) {
          applySectionHeader(ws, currentRow, 1, NUM_COLS,
            `${block.emoji || "📊"} ${block.title}`,
            ACTIVE_TOKENS.sectionGreen.bg, ACTIVE_TOKENS.sectionGreen.text);
          currentRow += SECTION_HEADER_ROWS;
        }

        // Header row
        const chartHeaders = ["Category", "Budget", "Actual", "Budget ▓", "Actual ▓"];
        const chartCols = [2, 4, 5, 7, 10];
        const hRow = ws.getRow(currentRow);
        hRow.height = 22;
        chartHeaders.forEach((h, i) => {
          const cell = hRow.getCell(chartCols[i]);
          cell.value = h.toUpperCase();
          cell.fill = solidFill(ACTIVE_TOKENS.headerBg);
          cell.font = { ...FONT_BASE, bold: true, size: 8, color: fontColor(ACTIVE_TOKENS.headerText) };
          cell.border = { bottom: thinBorder() };
        });
        for (let c = 1; c <= NUM_COLS; c++) {
          if (!hRow.getCell(c).fill || !(hRow.getCell(c).fill as ExcelJS.FillPattern).fgColor) {
            hRow.getCell(c).fill = solidFill(ACTIVE_TOKENS.headerBg);
          }
        }
        currentRow++;

        const chartRows = Math.min(block.rowCount || catCount, catCount);
        const maxBudget = Math.max(...categoryData.map(c => c.budget));
        for (let i = 0; i < chartRows; i++) {
          const R = currentRow;
          const cat = categoryData[i];
          const isAlt = i % 2 === 1;
          const bg = isAlt ? ACTIVE_TOKENS.rowAlt : "FFFFFF";
          const row = ws.getRow(R);
          row.height = 24;

          ws.mergeCells(R, 2, R, 3);
          row.getCell(2).value = cat.name;
          row.getCell(2).fill = solidFill(bg);
          row.getCell(2).font = { ...FONT_BASE, size: 10, color: fontColor("374151") };
          row.getCell(2).border = { bottom: thinBorder() };

          row.getCell(4).value = cat.budget;
          row.getCell(4).fill = solidFill(bg);
          row.getCell(4).font = { ...FONT_BASE, size: 10, color: fontColor("374151") };
          row.getCell(4).numFmt = '"$"#,##0';
          row.getCell(4).border = { bottom: thinBorder() };

          row.getCell(5).value = cat.spent;
          row.getCell(5).fill = solidFill(bg);
          row.getCell(5).font = { ...FONT_BASE, size: 10, color: fontColor("374151") };
          row.getCell(5).numFmt = '"$"#,##0';
          row.getCell(5).border = { bottom: thinBorder() };

          // Budget bar — SPARKLINE horizontal bar (renders as native chart in Google Sheets)
          ws.mergeCells(R, 7, R, 9);
          row.getCell(7).value = { formula: `SPARKLINE(${cat.budget},{"charttype","bar";"max",${maxBudget};"color1","#3B82F6"})` } as ExcelJS.CellFormulaValue;
          row.getCell(7).fill = solidFill(bg);
          row.getCell(7).font = { ...FONT_BASE, size: 10, color: fontColor(ACTIVE_TOKENS.kpiBlue.text) };
          row.getCell(7).border = { bottom: thinBorder() };

          // Actual bar — SPARKLINE with conditional color (green under budget, red over)
          const spentBarColor = cat.spent > cat.budget ? "#EF4444" : "#22C55E";
          const barFontColor = cat.spent > cat.budget ? ACTIVE_TOKENS.kpiRed.text : ACTIVE_TOKENS.kpiGreen.text;
          ws.mergeCells(R, 10, R, 12);
          row.getCell(10).value = { formula: `SPARKLINE(${cat.spent},{"charttype","bar";"max",${maxBudget};"color1","${spentBarColor}"})` } as ExcelJS.CellFormulaValue;
          row.getCell(10).fill = solidFill(bg);
          row.getCell(10).font = { ...FONT_BASE, size: 10, color: fontColor(barFontColor) };
          row.getCell(10).border = { bottom: thinBorder() };

          row.getCell(1).fill = solidFill(bg);
          row.getCell(6).fill = solidFill(bg);
          row.getCell(NUM_COLS).fill = solidFill(bg);
          currentRow++;
        }
        applySpacer(ws, currentRow, NUM_COLS, spacerH);
        currentRow++;
        break;
      }

      case "progress-tracker":
      case "goals-grid": {
        // Savings goals / progress bars
        const sectionColors = block.type === "goals-grid" ? ACTIVE_TOKENS.sectionYellow : ACTIVE_TOKENS.sectionGreen;
        if (block.title) {
          applySectionHeader(ws, currentRow, 1, NUM_COLS,
            `${block.emoji || "🎯"} ${block.title}`,
            sectionColors.bg, sectionColors.text);
          currentRow += SECTION_HEADER_ROWS;
        }

        const goalHeaders = ["Goal", "Target", "Saved", "Progress", "Bar"];
        const goalCols = [2, 4, 6, 8, 10];
        const gHRow = ws.getRow(currentRow);
        gHRow.height = 24;
        goalHeaders.forEach((h, i) => {
          const cell = gHRow.getCell(goalCols[i]);
          cell.value = h.toUpperCase();
          cell.fill = solidFill(ACTIVE_TOKENS.headerBg);
          cell.font = { ...FONT_BASE, bold: true, size: 9, color: fontColor(ACTIVE_TOKENS.headerText) };
          cell.border = { bottom: mediumBorder(ACTIVE_TOKENS.headerText) };
        });
        for (let c = 1; c <= NUM_COLS; c++) {
          if (!gHRow.getCell(c).fill || !(gHRow.getCell(c).fill as ExcelJS.FillPattern).fgColor)
            gHRow.getCell(c).fill = solidFill(ACTIVE_TOKENS.headerBg);
        }
        currentRow++;

        const goals = nicheData.savingsGoals.slice(0, block.rowCount || 4);
        for (let i = 0; i < goals.length; i++) {
          const R = currentRow;
          const goal = goals[i];
          const isAlt = i % 2 === 1;
          const bg = isAlt ? ACTIVE_TOKENS.rowAlt : "FFFFFF";
          const row = ws.getRow(R);
          row.height = 28;

          ws.mergeCells(R, 2, R, 3);
          row.getCell(2).value = goal.name;
          row.getCell(2).fill = solidFill(bg);
          row.getCell(2).font = { ...FONT_BASE, size: 11, color: fontColor("212529") };
          row.getCell(2).border = { bottom: thinBorder() };

          ws.mergeCells(R, 4, R, 5);
          row.getCell(4).value = goal.target;
          row.getCell(4).fill = solidFill(bg);
          row.getCell(4).font = { ...FONT_BASE, size: 11, color: fontColor("212529") };
          row.getCell(4).numFmt = '"$"#,##0';
          row.getCell(4).border = { bottom: thinBorder() };

          ws.mergeCells(R, 6, R, 7);
          row.getCell(6).value = goal.saved;
          row.getCell(6).fill = solidFill(bg);
          row.getCell(6).font = { ...FONT_BASE, size: 11, color: fontColor("212529") };
          row.getCell(6).numFmt = '"$"#,##0';
          row.getCell(6).border = { bottom: thinBorder() };

          ws.mergeCells(R, 8, R, 9);
          const pct = goal.target > 0 ? Math.round((goal.saved / goal.target) * 100) : 0;
          row.getCell(8).value = pct / 100;
          row.getCell(8).fill = solidFill(bg);
          row.getCell(8).font = { ...FONT_BASE, bold: true, size: 11, color: fontColor(pct >= 80 ? ACTIVE_TOKENS.kpiGreen.text : pct >= 40 ? ACTIVE_TOKENS.kpiYellow.text : ACTIVE_TOKENS.kpiRed.text) };
          row.getCell(8).numFmt = "0%";
          row.getCell(8).border = { bottom: thinBorder() };

          // Visual progress bar — SPARKLINE with color-coded fill
          const sparkProgressColor = pct >= 80 ? "#22C55E" : pct >= 40 ? "#3B82F6" : "#F59E0B";
          ws.mergeCells(R, 10, R, 12);
          row.getCell(10).value = { formula: `SPARKLINE(${(pct / 100).toFixed(2)},{"charttype","bar";"max",1;"color1","${sparkProgressColor}";"color2","#E5E7EB"})` } as ExcelJS.CellFormulaValue;
          row.getCell(10).fill = solidFill(bg);
          row.getCell(10).font = { ...FONT_BASE, size: 10, color: fontColor(pct >= 80 ? ACTIVE_TOKENS.kpiGreen.text : pct >= 40 ? ACTIVE_TOKENS.kpiBlue.text : ACTIVE_TOKENS.kpiYellow.text) };
          row.getCell(10).border = { bottom: thinBorder() };

          row.getCell(1).fill = solidFill(bg);
          row.getCell(NUM_COLS).fill = solidFill(bg);
          currentRow++;
        }
        applySpacer(ws, currentRow, NUM_COLS, spacerH);
        currentRow++;
        break;
      }

      case "top-categories": {
        // Top N spending categories as highlight cards
        const topN = block.rowCount || 3;
        const sorted = [...categoryData].sort((a, b) => b.spent - a.spent).slice(0, topN);
        if (block.title) {
          applySectionHeader(ws, currentRow, 1, NUM_COLS,
            `${block.emoji || "🔥"} ${block.title}`,
            ACTIVE_TOKENS.sectionPink.bg, ACTIVE_TOKENS.sectionPink.text);
          currentRow += SECTION_HEADER_ROWS;
        }

        const cardWidth = Math.floor((NUM_COLS - 2) / topN);
        for (let i = 0; i < sorted.length; i++) {
          const col = 2 + i * cardWidth;
          const cat = sorted[i];
          ws.mergeCells(currentRow, col, currentRow, col + cardWidth - 1);
          const cell = ws.getCell(currentRow, col);
          cell.value = cat.name;
          cell.fill = solidFill(ACTIVE_TOKENS.kpiRed.bg);
          cell.font = { ...FONT_BASE, bold: true, size: 10, color: fontColor(ACTIVE_TOKENS.kpiRed.text) };
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.border = { top: mediumBorder(ACTIVE_TOKENS.kpiRed.text) };

          ws.mergeCells(currentRow + 1, col, currentRow + 1, col + cardWidth - 1);
          const valCell = ws.getCell(currentRow + 1, col);
          valCell.value = cat.spent;
          valCell.fill = solidFill(ACTIVE_TOKENS.kpiRed.bg);
          valCell.font = { ...FONT_BASE, bold: true, size: 18, color: fontColor(ACTIVE_TOKENS.kpiRed.text) };
          valCell.alignment = { horizontal: "center", vertical: "middle" };
          valCell.numFmt = '"$"#,##0';
          valCell.border = { bottom: thinBorder(ACTIVE_TOKENS.kpiRed.bg) };
        }
        for (let r = currentRow; r <= currentRow + 1; r++) {
          for (let c = 1; c <= NUM_COLS; c++) {
            const cell = ws.getCell(r, c);
            if (!cell.fill || !(cell.fill as ExcelJS.FillPattern).fgColor) cell.fill = solidFill("FFFFFF");
          }
        }
        ws.getRow(currentRow).height = 26;
        ws.getRow(currentRow + 1).height = 44;
        currentRow += 2;
        applySpacer(ws, currentRow, NUM_COLS, spacerH);
        currentRow++;
        break;
      }

      case "insights": {
        // Auto-generated insight formulas
        if (block.title) {
          applySectionHeader(ws, currentRow, 1, NUM_COLS,
            `${block.emoji || "💡"} ${block.title}`,
            ACTIVE_TOKENS.sectionYellow.bg, ACTIVE_TOKENS.sectionYellow.text);
          currentRow += SECTION_HEADER_ROWS;
        }

        const SPENT_RANGE = catTableStartRow > 0 ? `F${catTableStartRow}:F${catTableEndRow}` : "F10:F20";
        const insights = (dashConfig.insightTemplates || []).slice(0, block.rowCount || 3);
        for (const tpl of insights) {
          const row = ws.getRow(currentRow);
          row.height = 30;
          ws.mergeCells(currentRow, 2, currentRow, NUM_COLS - 1);
          const cell = row.getCell(2);
          const formula = tpl
            .replace(/\{INCOME_REF\}/g, INCOME_REF)
            .replace(/\{SPENT_RANGE\}/g, SPENT_RANGE)
            .replace(/\{STATUS_RANGE\}/g, `J${catTableStartRow}:J${catTableEndRow}`)
            .replace(/\{BUDGET_RANGE\}/g, `D${catTableStartRow}:D${catTableEndRow}`)
            .replace(/\{GOAL_TOTAL_TARGET\}/g, "0")
            .replace(/\{GOAL_TOTAL_SAVED\}/g, "0");
          try {
            cell.value = { formula } as ExcelJS.CellFormulaValue;
          } catch {
            cell.value = "Insight";
          }
          cell.fill = solidFill("FFFBEB");
          cell.font = { ...FONT_BASE, size: 11, color: fontColor("92400E") };
          cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
          cell.border = { left: mediumBorder("F59E0B"), bottom: thinBorder("FEF3C7") };
          row.getCell(1).fill = solidFill("FFFFFF");
          row.getCell(NUM_COLS).fill = solidFill("FFFFFF");
          currentRow++;
        }
        applySpacer(ws, currentRow, NUM_COLS, spacerH);
        currentRow++;
        break;
      }

      case "summary-stats": {
        // Simple summary row
        ws.getRow(currentRow).height = 36;
        ws.mergeCells(currentRow, 2, currentRow, NUM_COLS - 1);
        const cell = ws.getCell(currentRow, 2);
        cell.value = block.title || "Summary";
        cell.fill = solidFill(ACTIVE_TOKENS.totalsBg);
        cell.font = { ...FONT_BASE, bold: true, size: 12, color: fontColor(ACTIVE_TOKENS.totalsText) };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = { top: { style: "double", color: { argb: argb(ACTIVE_TOKENS.totalsText) } }, bottom: mediumBorder(ACTIVE_TOKENS.totalsText) };
        ws.getCell(currentRow, 1).fill = solidFill("FFFFFF");
        ws.getCell(currentRow, NUM_COLS).fill = solidFill("FFFFFF");
        currentRow++;
        applySpacer(ws, currentRow, NUM_COLS, spacerH);
        currentRow++;
        break;
      }

      case "niche-section": {
        // Config-driven niche sections — renders all sections from dashConfig
        const nicheResult = renderDashboardSections(ws, currentRow, dashConfig, categoryData, nicheData, ACTIVE_TOKENS, NUM_COLS);
        currentRow = nicheResult.endRow;
        break;
      }

      case "checklist":
      case "monthly-comparison":
      default: {
        // Generic section header + placeholder
        if (block.title) {
          applySectionHeader(ws, currentRow, 1, NUM_COLS,
            `${block.emoji || "📋"} ${block.title}`,
            ACTIVE_TOKENS.sectionBlue.bg, ACTIVE_TOKENS.sectionBlue.text);
          currentRow += SECTION_HEADER_ROWS;
        }
        applySpacer(ws, currentRow, NUM_COLS, spacerH);
        currentRow++;
        break;
      }
    }
  }

  // ── Now go back and fix KPI formulas that reference category data ──
  if (catTableStartRow > 0 && catTableEndRow > 0) {
    const SPENT_RANGE = `F${catTableStartRow}:F${catTableEndRow}`;
    const BUDGET_RANGE = `D${catTableStartRow}:D${catTableEndRow}`;

    // Find KPI cells and update formulas
    for (let r = 1; r < catTableStartRow; r++) {
      for (let c = 1; c <= NUM_COLS; c++) {
        const cell = ws.getCell(r, c);
        if (cell.value && typeof cell.value === "object" && "formula" in cell.value) {
          const f = (cell.value as ExcelJS.CellFormulaValue).formula;
          if (f.includes("F999:F999") || f.includes("D999:D999")) {
            (cell.value as ExcelJS.CellFormulaValue).formula = f
              .replace(/F999:F999/g, SPENT_RANGE)
              .replace(/D999:D999/g, BUDGET_RANGE);
          }
        }
      }
    }
  }

  // Freeze panes
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: CONTROLS_ROW + 1 }];
}

// ══════════════════════════════════════════════════════════════
// CONFIG-DRIVEN DASHBOARD SECTION RENDERER
//
// ── Budget category range metadata ──────────────────────────
// Returned by section renderers so KPI formulas can reference
// the actual column/row positions of budget and spent data.
interface BudgetCategoryRange {
  budgetCol: number;  // Excel column number for Budget values
  spentCol: number;   // Excel column number for Spent values
  dataStartRow: number;
  dataEndRow: number;
}

// Takes a single DashboardSectionDef from the config and renders
// it as an ExcelJS section. Supports budgetCategories, savingsGoals,
// and custom data sources. Used by all three dashboard builders
// (editorial, executive, nurture) to replace hard-coded layouts.
//
// Returns { endRow, budgetRange? } — budgetRange is set when
// the section was a budgetCategories section (needed for KPI formulas).
// ══════════════════════════════════════════════════════════════

function renderDashboardSection(
  ws: WS,
  currentRow: number,
  startCol: number,
  endCol: number,
  section: DashboardSectionDef,
  categoryData: Array<{ name: string; budget: number; spent: number }>,
  nicheData: NicheDataProfile,
  tokens: typeof ACTIVE_TOKENS,
  numCols: number,
  sectionIdx: number = 0,
): { endRow: number; budgetRange?: BudgetCategoryRange } {
  const colSpan = endCol - startCol + 1;

  // ── Cycle section accent colors for visual variety ──
  const sectionPalette = [
    { bg: tokens.sectionBlue.bg, text: tokens.sectionBlue.text },
    { bg: tokens.sectionGreen.bg, text: tokens.sectionGreen.text },
    { bg: tokens.sectionPink.bg, text: tokens.sectionPink.text },
    { bg: tokens.sectionYellow.bg, text: tokens.sectionYellow.text },
  ];
  const sectionColor = sectionPalette[sectionIdx % sectionPalette.length];

  // ── Card-style section header (accent stripe + title = 2 rows) ──
  applySectionHeader(ws, currentRow, startCol, endCol,
    `${section.emoji} ${section.title}`,
    sectionColor.bg, sectionColor.text);
  currentRow += SECTION_HEADER_ROWS;

  // ── Determine data source ──
  if (section.dataSource === "budgetCategories") {
    // Budget categories table with Budget/Spent/Remaining/Status columns
    const headers = ["Category", "Budget", "Spent", "Remaining", "Status"];
    const headerRow = ws.getRow(currentRow);
    headerRow.height = 26;
    // Distribute columns evenly across the available span
    const hColCount = headers.length;
    const colWidth = Math.max(1, Math.floor(colSpan / hColCount));
    const headerCols: number[] = [];
    for (let hi = 0; hi < hColCount; hi++) {
      headerCols.push(startCol + hi * colWidth);
    }
    headerCols.forEach((hc, i) => {
      const hEnd = i < hColCount - 1 ? headerCols[i + 1] - 1 : endCol;
      if (hEnd > hc) ws.mergeCells(currentRow, hc, currentRow, hEnd);
      const cell = headerRow.getCell(hc);
      cell.value = headers[i];
      cell.fill = solidFill(tokens.headerBg);
      cell.font = { ...FONT_BASE, bold: true, size: 10, color: fontColor(tokens.headerText) };
      cell.alignment = { horizontal: i === 0 ? "left" : "center", vertical: "middle" };
      cell.border = allThinBorders();
    });
    for (let c = startCol; c <= endCol; c++) {
      const cell = headerRow.getCell(c);
      if (!cell.fill || !(cell.fill as ExcelJS.FillPattern).fgColor) {
        cell.fill = solidFill(tokens.headerBg);
        cell.font = { ...FONT_BASE, size: 1, color: fontColor(tokens.headerBg) };
      }
    }
    currentRow++;

    // Data rows
    const dataStartRow = currentRow;
    for (let i = 0; i < categoryData.length; i++) {
      const isAlt = i % 2 === 1;
      const bgColor = isAlt ? tokens.rowAlt : "FFFFFF";
      const row = ws.getRow(currentRow);
      row.height = 28;
      const R = currentRow;
      const cat = categoryData[i];

      // Category name
      const nameEnd = headerCols[1] - 1;
      if (nameEnd > headerCols[0]) ws.mergeCells(R, headerCols[0], R, nameEnd);
      const nameCell = row.getCell(headerCols[0]);
      nameCell.value = cat.name;
      nameCell.fill = solidFill(bgColor);
      nameCell.font = { ...FONT_BASE, size: 11, color: fontColor("212529") };
      nameCell.alignment = { horizontal: "left", vertical: "middle" };
      nameCell.border = { bottom: thinBorder() };

      // Budget (editable)
      const budgetEnd = headerCols[2] - 1;
      if (budgetEnd > headerCols[1]) ws.mergeCells(R, headerCols[1], R, budgetEnd);
      const budgetCell = row.getCell(headerCols[1]);
      budgetCell.value = cat.budget;
      budgetCell.fill = solidFill(bgColor);
      budgetCell.font = { ...FONT_BASE, size: 11, color: fontColor("212529") };
      budgetCell.alignment = { horizontal: "right", vertical: "middle" };
      budgetCell.numFmt = '"$"#,##0';
      budgetCell.border = { bottom: thinBorder() };

      // Spent (editable)
      const spentEnd = headerCols[3] - 1;
      if (spentEnd > headerCols[2]) ws.mergeCells(R, headerCols[2], R, spentEnd);
      const spentCell = row.getCell(headerCols[2]);
      spentCell.value = cat.spent;
      spentCell.fill = solidFill(bgColor);
      spentCell.font = { ...FONT_BASE, size: 11, color: fontColor("212529") };
      spentCell.alignment = { horizontal: "right", vertical: "middle" };
      spentCell.numFmt = '"$"#,##0';
      spentCell.border = { bottom: thinBorder() };

      // Remaining — FORMULA
      const remEnd = headerCols[4] - 1;
      if (remEnd > headerCols[3]) ws.mergeCells(R, headerCols[3], R, remEnd);
      const remCell = row.getCell(headerCols[3]);
      remCell.value = { formula: `${colLetter(headerCols[1])}${R}-${colLetter(headerCols[2])}${R}` } as ExcelJS.CellFormulaValue;
      remCell.fill = solidFill(bgColor);
      remCell.font = { ...FONT_BASE, size: 11, color: fontColor("212529") };
      remCell.alignment = { horizontal: "right", vertical: "middle" };
      remCell.numFmt = '"$"#,##0';
      remCell.border = { bottom: thinBorder() };

      // Status — FORMULA
      const statusEnd = endCol;
      if (statusEnd > headerCols[4]) ws.mergeCells(R, headerCols[4], R, statusEnd);
      const statusCell = row.getCell(headerCols[4]);
      const bCol = colLetter(headerCols[1]);
      const sCol = colLetter(headerCols[2]);
      statusCell.value = { formula: `IF(${bCol}${R}=0,"",IF(${sCol}${R}/${bCol}${R}>1,"🔴 Over",IF(${sCol}${R}/${bCol}${R}>0.9,"⚠️ Warning","✅ On Track")))` } as ExcelJS.CellFormulaValue;
      statusCell.fill = solidFill(bgColor);
      statusCell.font = { ...FONT_BASE, size: 10, color: fontColor("374151") };
      statusCell.alignment = { horizontal: "center", vertical: "middle" };
      statusCell.border = { bottom: thinBorder() };

      // Fill gutter cells in range
      if (startCol > 1) { const gc = ws.getCell(R, startCol - 1); if (!gc.fill || !(gc.fill as ExcelJS.FillPattern).fgColor) { gc.fill = solidFill(bgColor); } }
      if (endCol < numCols) { const gc = ws.getCell(R, endCol + 1); if (!gc.fill || !(gc.fill as ExcelJS.FillPattern).fgColor) { gc.fill = solidFill(bgColor); } }

      currentRow++;
    }

    // Totals row
    const dataEndRow = currentRow - 1;
    const totRow = ws.getRow(currentRow);
    totRow.height = 30;
    const totNameEnd = headerCols[1] - 1;
    if (totNameEnd > headerCols[0]) ws.mergeCells(currentRow, headerCols[0], currentRow, totNameEnd);
    totRow.getCell(headerCols[0]).value = "TOTAL";
    totRow.getCell(headerCols[0]).fill = solidFill(tokens.headerBg);
    totRow.getCell(headerCols[0]).font = { ...FONT_BASE, bold: true, size: 11, color: fontColor(tokens.headerText) };
    totRow.getCell(headerCols[0]).alignment = { horizontal: "left", vertical: "middle" };
    totRow.getCell(headerCols[0]).border = allThinBorders();

    const totBudEnd = headerCols[2] - 1;
    if (totBudEnd > headerCols[1]) ws.mergeCells(currentRow, headerCols[1], currentRow, totBudEnd);
    totRow.getCell(headerCols[1]).value = { formula: `SUM(${colLetter(headerCols[1])}${dataStartRow}:${colLetter(headerCols[1])}${dataEndRow})` } as ExcelJS.CellFormulaValue;
    totRow.getCell(headerCols[1]).fill = solidFill(tokens.headerBg);
    totRow.getCell(headerCols[1]).font = { ...FONT_BASE, bold: true, size: 11, color: fontColor(tokens.headerText) };
    totRow.getCell(headerCols[1]).numFmt = '"$"#,##0';
    totRow.getCell(headerCols[1]).alignment = { horizontal: "right", vertical: "middle" };
    totRow.getCell(headerCols[1]).border = allThinBorders();

    const totSpentEnd = headerCols[3] - 1;
    if (totSpentEnd > headerCols[2]) ws.mergeCells(currentRow, headerCols[2], currentRow, totSpentEnd);
    totRow.getCell(headerCols[2]).value = { formula: `SUM(${colLetter(headerCols[2])}${dataStartRow}:${colLetter(headerCols[2])}${dataEndRow})` } as ExcelJS.CellFormulaValue;
    totRow.getCell(headerCols[2]).fill = solidFill(tokens.headerBg);
    totRow.getCell(headerCols[2]).font = { ...FONT_BASE, bold: true, size: 11, color: fontColor(tokens.headerText) };
    totRow.getCell(headerCols[2]).numFmt = '"$"#,##0';
    totRow.getCell(headerCols[2]).alignment = { horizontal: "right", vertical: "middle" };
    totRow.getCell(headerCols[2]).border = allThinBorders();

    const totRemEnd = headerCols[4] - 1;
    if (totRemEnd > headerCols[3]) ws.mergeCells(currentRow, headerCols[3], currentRow, totRemEnd);
    totRow.getCell(headerCols[3]).value = { formula: `SUM(${colLetter(headerCols[3])}${dataStartRow}:${colLetter(headerCols[3])}${dataEndRow})` } as ExcelJS.CellFormulaValue;
    totRow.getCell(headerCols[3]).fill = solidFill(tokens.headerBg);
    totRow.getCell(headerCols[3]).font = { ...FONT_BASE, bold: true, size: 11, color: fontColor(tokens.headerText) };
    totRow.getCell(headerCols[3]).numFmt = '"$"#,##0';
    totRow.getCell(headerCols[3]).alignment = { horizontal: "right", vertical: "middle" };
    totRow.getCell(headerCols[3]).border = allThinBorders();

    for (let c = startCol; c <= endCol; c++) {
      const cell = totRow.getCell(c);
      if (!cell.fill || !(cell.fill as ExcelJS.FillPattern).fgColor) {
        cell.fill = solidFill(tokens.headerBg);
        cell.font = { ...FONT_BASE, size: 1, color: fontColor(tokens.headerBg) };
      }
    }
    currentRow++;
    return {
      endRow: currentRow,
      budgetRange: {
        budgetCol: headerCols[1],
        spentCol: headerCols[2],
        dataStartRow,
        dataEndRow,
      },
    };

  } else if (section.dataSource === "savingsGoals") {
    // Savings goals with Goal/Target/Saved/Progress columns + bar + status
    const headers = ["Goal", "Target", "Saved", "Progress", "Bar", "Status"];
    const headerRow = ws.getRow(currentRow);
    headerRow.height = 26;
    const hColCount = headers.length;
    const colWidth = Math.max(1, Math.floor(colSpan / hColCount));
    const headerCols: number[] = [];
    for (let hi = 0; hi < hColCount; hi++) {
      headerCols.push(startCol + hi * colWidth);
    }
    headerCols.forEach((hc, i) => {
      const hEnd = i < hColCount - 1 ? headerCols[i + 1] - 1 : endCol;
      if (hEnd > hc) ws.mergeCells(currentRow, hc, currentRow, hEnd);
      const cell = headerRow.getCell(hc);
      cell.value = headers[i];
      cell.fill = solidFill(tokens.headerBg);
      cell.font = { ...FONT_BASE, bold: true, size: 10, color: fontColor(tokens.headerText) };
      cell.alignment = { horizontal: i === 0 ? "left" : "center", vertical: "middle" };
      cell.border = allThinBorders();
    });
    for (let c = startCol; c <= endCol; c++) {
      const cell = headerRow.getCell(c);
      if (!cell.fill || !(cell.fill as ExcelJS.FillPattern).fgColor) {
        cell.fill = solidFill(tokens.headerBg);
        cell.font = { ...FONT_BASE, size: 1, color: fontColor(tokens.headerBg) };
      }
    }
    currentRow++;

    const goals = nicheData.savingsGoals;
    for (let i = 0; i < goals.length; i++) {
      const isAlt = i % 2 === 1;
      const bgColor = isAlt ? tokens.rowAlt : "FFFFFF";
      const row = ws.getRow(currentRow);
      row.height = 28;
      const R = currentRow;
      const goal = goals[i];

      // Goal name
      const nameEnd = headerCols[1] - 1;
      if (nameEnd > headerCols[0]) ws.mergeCells(R, headerCols[0], R, nameEnd);
      const nameCell = row.getCell(headerCols[0]);
      nameCell.value = goal.name;
      nameCell.fill = solidFill(bgColor);
      nameCell.font = { ...FONT_BASE, size: 11, color: fontColor("212529") };
      nameCell.alignment = { horizontal: "left", vertical: "middle" };
      nameCell.border = { bottom: thinBorder() };

      // Target — EDITABLE
      const targetEnd = headerCols[2] - 1;
      if (targetEnd > headerCols[1]) ws.mergeCells(R, headerCols[1], R, targetEnd);
      const targetCell = row.getCell(headerCols[1]);
      targetCell.value = goal.target;
      targetCell.fill = solidFill(bgColor);
      targetCell.font = { ...FONT_BASE, size: 11, color: fontColor("212529") };
      targetCell.alignment = { horizontal: "right", vertical: "middle" };
      targetCell.numFmt = '"$"#,##0';
      targetCell.border = { bottom: thinBorder() };

      // Saved — EDITABLE
      const savedEnd = headerCols[3] - 1;
      if (savedEnd > headerCols[2]) ws.mergeCells(R, headerCols[2], R, savedEnd);
      const savedCell = row.getCell(headerCols[2]);
      savedCell.value = goal.saved;
      savedCell.fill = solidFill(bgColor);
      savedCell.font = { ...FONT_BASE, size: 11, color: fontColor("166534") };
      savedCell.alignment = { horizontal: "right", vertical: "middle" };
      savedCell.numFmt = '"$"#,##0';
      savedCell.border = { bottom: thinBorder() };

      // Progress % — FORMULA
      const progEnd = headerCols[4] - 1;
      if (progEnd > headerCols[3]) ws.mergeCells(R, headerCols[3], R, progEnd);
      const progCell = row.getCell(headerCols[3]);
      const tCol = colLetter(headerCols[1]);
      const svCol = colLetter(headerCols[2]);
      progCell.value = { formula: `IF(${tCol}${R}=0,0,${svCol}${R}/${tCol}${R})` } as ExcelJS.CellFormulaValue;
      progCell.fill = solidFill(bgColor);
      progCell.font = { ...FONT_BASE, bold: true, size: 11, color: fontColor(tokens.headerText) };
      progCell.alignment = { horizontal: "center", vertical: "middle" };
      progCell.numFmt = "0%";
      progCell.border = { bottom: thinBorder() };

      // Bar — SPARKLINE
      const barEnd = headerCols[5] - 1;
      if (barEnd > headerCols[4]) ws.mergeCells(R, headerCols[4], R, barEnd);
      const barCell = row.getCell(headerCols[4]);
      const pCol = colLetter(headerCols[3]);
      barCell.value = {
        formula: `SPARKLINE(${pCol}${R},{"charttype","bar";"max",1;"color1",IF(${pCol}${R}>=0.75,"#22C55E",IF(${pCol}${R}>=0.4,"#F59E0B","#3B82F6"));"color2","#E5E7EB"})`,
      } as ExcelJS.CellFormulaValue;
      const progressRatio = goal.target > 0 ? goal.saved / goal.target : 0;
      const barBg = progressRatio >= 0.75 ? "D5F0D5" : progressRatio >= 0.4 ? "FEF3C7" : "DBEAFE";
      const barFg = progressRatio >= 0.75 ? "166534" : progressRatio >= 0.4 ? "92400E" : "1E40AF";
      barCell.fill = solidFill(barBg);
      barCell.font = { ...FONT_BASE, size: 10, color: fontColor(barFg) };
      barCell.alignment = { horizontal: "center", vertical: "middle" };
      barCell.border = { bottom: thinBorder() };

      // Status — FORMULA
      const statusEnd = endCol;
      if (statusEnd > headerCols[5]) ws.mergeCells(R, headerCols[5], R, statusEnd);
      const statusCell = row.getCell(headerCols[5]);
      statusCell.value = {
        formula: `IF(${pCol}${R}>=1,"✅ Complete",IF(${pCol}${R}>=0.5,"🟡 On Track","🔵 Building"))`,
      } as ExcelJS.CellFormulaValue;
      statusCell.fill = solidFill(bgColor);
      statusCell.font = { ...FONT_BASE, bold: true, size: 10, color: fontColor(tokens.headerText) };
      statusCell.alignment = { horizontal: "center", vertical: "middle" };
      statusCell.border = { bottom: thinBorder() };

      // Fill gutter cells
      if (startCol > 1) { const gc = ws.getCell(R, startCol - 1); if (!gc.fill || !(gc.fill as ExcelJS.FillPattern).fgColor) { gc.fill = solidFill(bgColor); } }
      if (endCol < numCols) { const gc = ws.getCell(R, endCol + 1); if (!gc.fill || !(gc.fill as ExcelJS.FillPattern).fgColor) { gc.fill = solidFill(bgColor); } }

      currentRow++;
    }
    return { endRow: currentRow };

  } else if (section.dataSource === "custom") {
    // Custom section data from nicheData.customSections
    const customKey = section.customSourceKey || "";
    const customData = nicheData.customSections?.[customKey];
    if (!customData) return { endRow: currentRow };

    const sectionCols = section.columns;
    const hColCount = sectionCols.length;
    const colWidth = Math.max(1, Math.floor(colSpan / hColCount));

    // Column headers
    const headerRow = ws.getRow(currentRow);
    headerRow.height = 26;
    const headerCols: number[] = [];
    for (let hi = 0; hi < hColCount; hi++) {
      headerCols.push(startCol + hi * colWidth);
    }
    headerCols.forEach((hc, i) => {
      const hEnd = i < hColCount - 1 ? headerCols[i + 1] - 1 : endCol;
      if (hEnd > hc) ws.mergeCells(currentRow, hc, currentRow, hEnd);
      const cell = headerRow.getCell(hc);
      cell.value = sectionCols[i].name;
      cell.fill = solidFill(tokens.headerBg);
      cell.font = { ...FONT_BASE, bold: true, size: 10, color: fontColor(tokens.headerText) };
      cell.alignment = { horizontal: i === 0 ? "left" : "center", vertical: "middle" };
      cell.border = allThinBorders();
    });
    for (let c = startCol; c <= endCol; c++) {
      const cell = headerRow.getCell(c);
      if (!cell.fill || !(cell.fill as ExcelJS.FillPattern).fgColor) {
        cell.fill = solidFill(tokens.headerBg);
        cell.font = { ...FONT_BASE, size: 1, color: fontColor(tokens.headerBg) };
      }
    }
    currentRow++;

    // Data rows — custom sections with taller rows for breathing room
    for (let i = 0; i < customData.rows.length; i++) {
      const isAlt = i % 2 === 1;
      const bgColor = isAlt ? tokens.rowAlt : "FFFFFF";
      const row = ws.getRow(currentRow);
      row.height = 28;

      for (let hi = 0; hi < hColCount; hi++) {
        const colStart = headerCols[hi];
        const colEnd = hi < hColCount - 1 ? headerCols[hi + 1] - 1 : endCol;
        if (colEnd > colStart) ws.mergeCells(currentRow, colStart, currentRow, colEnd);
        const cell = row.getCell(colStart);
        const val = customData.rows[i][hi];
        cell.value = val;
        cell.fill = solidFill(bgColor);
        cell.font = { ...FONT_BASE, size: 10, color: fontColor("374151") };
        cell.alignment = { horizontal: hi === 0 ? "left" : "center", vertical: "middle" };
        cell.border = { bottom: thinBorder() };

        // Apply formatting based on column type
        const colType = sectionCols[hi]?.type;
        if (colType === "currency" && typeof val === "number") {
          cell.numFmt = '"$"#,##0';
          cell.alignment = { horizontal: "right", vertical: "middle" };
        } else if (colType === "percent" && typeof val === "number") {
          cell.numFmt = "0%";
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else if (colType === "status" && typeof val === "string") {
          // Status column — bold with contextual color
          cell.font = { ...FONT_BASE, bold: true, size: 10, color: fontColor("374151") };
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else if (colType === "date") {
          cell.font = { ...FONT_BASE, size: 10, color: fontColor(tokens.mutedText) };
          cell.alignment = { horizontal: "center", vertical: "middle" };
        }
      }

      // Fill gutter cells
      if (startCol > 1) { const gc = ws.getCell(currentRow, startCol - 1); if (!gc.fill || !(gc.fill as ExcelJS.FillPattern).fgColor) { gc.fill = solidFill(bgColor); } }
      if (endCol < numCols) { const gc = ws.getCell(currentRow, endCol + 1); if (!gc.fill || !(gc.fill as ExcelJS.FillPattern).fgColor) { gc.fill = solidFill(bgColor); } }

      currentRow++;
    }
    return { endRow: currentRow };
  }

  return { endRow: currentRow };
}

// ══════════════════════════════════════════════════════════════
// Config-driven section loop helper
//
// Iterates dashConfig.sections and renders each section using
// renderDashboardSection(). Handles side-by-side left/right
// positioning and full-width sections.
// ══════════════════════════════════════════════════════════════

function renderDashboardSections(
  ws: WS,
  currentRow: number,
  dashConfig: SpreadsheetDashboardConfig,
  categoryData: Array<{ name: string; budget: number; spent: number }>,
  nicheData: NicheDataProfile,
  tokens: typeof ACTIVE_TOKENS,
  numCols: number,
): { endRow: number; budgetRange: BudgetCategoryRange | null } {
  const sections = dashConfig.sections;
  let budgetRange: BudgetCategoryRange | null = null;

  // Dynamic left/right split based on grid width:
  //   14-col (nurture/executive): left = 2-6, gap = 7, right = 8-13
  //   13-col (editorial):         left = 2-5, gap = 6, right = 7-12
  const gapCol = Math.floor(numCols / 2);
  const leftStartCol = 2;
  const leftEndCol = gapCol - 1;
  const rightStartCol = gapCol + 1;
  const rightEndCol = numCols - 1;

  let i = 0;
  while (i < sections.length) {
    const section = sections[i];

    if (section.position === "full-width") {
      // Full-width: cols 2 to numCols-1
      const result = renderDashboardSection(ws, currentRow, 2, numCols - 1, section, categoryData, nicheData, tokens, numCols, i);
      if (result.budgetRange) budgetRange = result.budgetRange;
      currentRow = result.endRow;
      applySpacer(ws, currentRow, numCols, 20);
      currentRow++;
      i++;
    } else if (section.position === "left") {
      // Check if next section is "right"
      const nextSection = i + 1 < sections.length ? sections[i + 1] : null;
      if (nextSection && nextSection.position === "right") {
        // Render both side-by-side
        const leftResult = renderDashboardSection(ws, currentRow, leftStartCol, leftEndCol, section, categoryData, nicheData, tokens, numCols, i);
        const rightResult = renderDashboardSection(ws, currentRow, rightStartCol, rightEndCol, nextSection, categoryData, nicheData, tokens, numCols, i + 1);
        if (leftResult.budgetRange) budgetRange = leftResult.budgetRange;
        if (rightResult.budgetRange) budgetRange = rightResult.budgetRange;

        // Fill the gap column for all rendered rows
        const maxEndRow = Math.max(leftResult.endRow, rightResult.endRow);
        for (let r = currentRow; r < maxEndRow; r++) {
          const gCell = ws.getCell(r, gapCol);
          if (!gCell.fill || !(gCell.fill as ExcelJS.FillPattern).fgColor) {
            gCell.fill = solidFill("FFFFFF");
          }
        }
        // Fill col 1 and numCols gutters
        for (let r = currentRow; r < maxEndRow; r++) {
          const gutterLeft = ws.getCell(r, 1);
          if (!gutterLeft.fill || !(gutterLeft.fill as ExcelJS.FillPattern).fgColor) {
            gutterLeft.fill = solidFill("FFFFFF");
          }
          const gutterRight = ws.getCell(r, numCols);
          if (!gutterRight.fill || !(gutterRight.fill as ExcelJS.FillPattern).fgColor) {
            gutterRight.fill = solidFill("FFFFFF");
          }
        }

        currentRow = maxEndRow;
        applySpacer(ws, currentRow, numCols, 20);
        currentRow++;
        i += 2; // skip both left and right
      } else {
        // Left only (no paired right), render full width
        const result = renderDashboardSection(ws, currentRow, 2, numCols - 1, section, categoryData, nicheData, tokens, numCols, i);
        if (result.budgetRange) budgetRange = result.budgetRange;
        currentRow = result.endRow;
        applySpacer(ws, currentRow, numCols, 16);
        currentRow++;
        i++;
      }
    } else if (section.position === "right") {
      // Orphaned right section — render full width
      const result = renderDashboardSection(ws, currentRow, 2, numCols - 1, section, categoryData, nicheData, tokens, numCols, i);
      if (result.budgetRange) budgetRange = result.budgetRange;
      currentRow = result.endRow;
      applySpacer(ws, currentRow, numCols, 20);
      currentRow++;
      i++;
    } else {
      i++;
    }
  }
  return { endRow: currentRow, budgetRange };
}

// ══════════════════════════════════════════════════════════════
// BLOCK DASHBOARD — Unified Card-on-Canvas Layout
//
// Replaces ALL three legacy builders (editorial, executive, nurture)
// with a single function that produces visually isolated card panels
// on a gray canvas. The result looks like a DASHBOARD APP inside
// Google Sheets, not a formatted spreadsheet.
//
// Visual architecture:
//   Gray canvas (F0F2F5) → everything sits on this
//   Hero block  → full-width colored header (title + subtitle)
//   Controls    → white card bar (month selector + income input)
//   KPI blocks  → padded colored cards (accent → padding → label → BIG value → padding)
//   Content     → white card panels with accent top, shadow bottom
//   Insights    → formula-driven text in a white card
//
// Every section is wrapped in a card with gray gaps between them.
// Split panels float as TWO SEPARATE cards with gray gap between.
// ══════════════════════════════════════════════════════════════

function buildBlockDashboard(
  wb: ExcelJS.Workbook,
  tab: BlueprintTab,
  blueprint: ProductBlueprint,
  nicheProfile: NicheDesignProfile,
  titleBg: string,
  titleText: string,
  subtitleBg: string,
  subtitleText: string,
  tabColor: string
): void {
  const nicheData = getNicheData(nicheProfile.id);
  const dashConfig = getSpreadsheetDashboardConfig(nicheProfile.id);

  // ── Standard 14-column grid for ALL niches ────────────────
  // Col 1: gutter  |  Cols 2-6: left panel  |  Col 7: gap
  // Cols 8-13: right panel  |  Col 14: gutter
  // Full-width content: cols 2-13
  const NUM_COLS = 14;
  const GAP_COL = 7;
  const LEFT_START = 2;
  const LEFT_END = 6;
  const RIGHT_START = 8;
  const RIGHT_END = 13;
  const CONTENT_START = 2;
  const CONTENT_END = 13;

  const ws = wb.addWorksheet(tab.name, {
    properties: { tabColor: { argb: argb(tabColor) } },
  });

  ws.columns = [
    { width: 2 },   // A: gutter (gray)
    { width: 18 },  // B: content
    { width: 14 },  // C
    { width: 14 },  // D
    { width: 14 },  // E
    { width: 14 },  // F
    { width: 3 },   // G: gap (gray)
    { width: 18 },  // H
    { width: 14 },  // I
    { width: 14 },  // J
    { width: 14 },  // K
    { width: 14 },  // L
    { width: 12 },  // M
    { width: 2 },   // N: gutter (gray)
  ];

  // ── Prepare niche data ────────────────────────────────────
  const income = nicheData.monthlyIncome;
  const spentRatios = [0.88, 0.92, 1.05, 0.78, 0.95, 0.85, 0.91, 0.82];
  const categoryData = nicheData.budgetCategories.map((cat, i) => ({
    name: cat.name,
    budget: cat.budgetAmount,
    spent: Math.round(cat.budgetAmount * (spentRatios[i % spentRatios.length])),
  }));

  let currentRow = 1;

  // ═══════════════════════════════════════════════════════════
  // BLOCK A: HERO HEADER
  // Full-bleed colored bar — sits ABOVE the gray canvas.
  // ═══════════════════════════════════════════════════════════
  const dashboardTitle = tab.sampleRows[0]?.[0] != null
    ? String(tab.sampleRows[0][0])
    : "📊 DASHBOARD";
  ws.mergeCells(currentRow, 1, currentRow, NUM_COLS);
  const heroCell = ws.getCell(currentRow, 1);
  heroCell.value = dashboardTitle;
  heroCell.fill = solidFill(titleBg);
  heroCell.font = { ...FONT_BASE, bold: true, size: 20, color: fontColor(titleText) };
  heroCell.alignment = { horizontal: "center", vertical: "middle" };
  heroCell.border = {};
  ws.getRow(currentRow).height = 56;
  currentRow++;

  // Subtitle
  const subtitle = tab.sampleRows[1]?.[0] != null
    ? String(tab.sampleRows[1][0])
    : nicheData.tagline;
  ws.mergeCells(currentRow, 1, currentRow, NUM_COLS);
  const subCell = ws.getCell(currentRow, 1);
  subCell.value = subtitle;
  subCell.fill = solidFill(subtitleBg);
  subCell.font = { ...FONT_BASE, size: 11, color: fontColor(subtitleText) };
  subCell.alignment = { horizontal: "center", vertical: "middle" };
  subCell.border = {};
  ws.getRow(currentRow).height = 28;
  currentRow++;

  // Transition to gray canvas
  applyCanvasRow(ws, currentRow, NUM_COLS, 8);
  currentRow++;

  // ═══════════════════════════════════════════════════════════
  // BLOCK B: CONTROLS CARD
  // White card bar with month selector + editable income input
  // ═══════════════════════════════════════════════════════════
  const CONTROLS_ROW = currentRow;
  const controlsRow = ws.getRow(currentRow);
  controlsRow.height = 40;

  // Fill row: gutters gray, content area white with card edges
  for (let c = 1; c <= NUM_COLS; c++) {
    const cell = ws.getCell(currentRow, c);
    if (c >= CONTENT_START && c <= CONTENT_END) {
      cell.fill = solidFill("FFFFFF");
      cell.font = { ...FONT_BASE, size: 1, color: fontColor("FFFFFF") };
      cell.border = { top: thinBorder(CARD_BORDER), bottom: thinBorder(CARD_SHADOW) };
    } else {
      cell.fill = solidFill(CANVAS_BG);
      cell.font = { ...FONT_BASE, size: 1, color: fontColor(CANVAS_BG) };
      cell.border = {};
    }
  }

  // Month selector
  const monthLabel = ws.getCell(currentRow, 2);
  monthLabel.value = "📅 SELECT MONTH:";
  monthLabel.font = { ...FONT_BASE, bold: true, size: 10, color: fontColor(ACTIVE_TOKENS.headerText) };
  monthLabel.alignment = { horizontal: "right", vertical: "middle" };
  monthLabel.fill = solidFill("FFFFFF");

  const monthCell = ws.getCell(currentRow, 3);
  monthCell.value = MONTHS[new Date().getMonth()];
  monthCell.font = { ...FONT_BASE, bold: true, size: 12, color: fontColor(titleBg) };
  monthCell.alignment = { horizontal: "center", vertical: "middle" };
  monthCell.border = allThinBorders();
  monthCell.fill = solidFill("FFFFFF");
  addMonthDropdown(ws, `C${currentRow}`);

  // Income input
  const kpiLabel0 = dashConfig.kpiLabels[0] || "Income";
  const incLabel = ws.getCell(currentRow, 5);
  incLabel.value = `💰 ${kpiLabel0.toUpperCase()}:`;
  incLabel.font = { ...FONT_BASE, bold: true, size: 10, color: fontColor(ACTIVE_TOKENS.headerText) };
  incLabel.alignment = { horizontal: "right", vertical: "middle" };
  incLabel.fill = solidFill("FFFFFF");

  const incomeCell = ws.getCell(currentRow, 6);
  incomeCell.value = income;
  incomeCell.font = { ...FONT_BASE, bold: true, size: 14, color: fontColor(ACTIVE_TOKENS.kpiGreen.text) };
  incomeCell.alignment = { horizontal: "center", vertical: "middle" };
  incomeCell.numFmt = '"$"#,##0';
  incomeCell.border = allThinBorders();
  incomeCell.fill = solidFill(ACTIVE_TOKENS.kpiGreen.bg);

  currentRow++;
  const INCOME_REF = `F${CONTROLS_ROW}`;

  // Gray spacer after controls
  applyCanvasRow(ws, currentRow, NUM_COLS, 16);
  currentRow++;

  // ═══════════════════════════════════════════════════════════
  // BLOCK C: KPI CARD BLOCKS
  // Each KPI is a padded visual card with:
  //   accent bar (3px) → padding (12px) → label → BIG value (64px) → padding + shadow
  // ═══════════════════════════════════════════════════════════
  const kpiCount = Math.min(dashConfig.kpiCount, 4);
  const kpiColors = [
    { bg: ACTIVE_TOKENS.kpiGreen.bg, text: ACTIVE_TOKENS.kpiGreen.text },
    { bg: ACTIVE_TOKENS.kpiRed.bg, text: ACTIVE_TOKENS.kpiRed.text },
    { bg: ACTIVE_TOKENS.kpiYellow.bg, text: ACTIVE_TOKENS.kpiYellow.text },
    { bg: ACTIVE_TOKENS.kpiBlue.bg, text: ACTIVE_TOKENS.kpiBlue.text },
  ];

  // Position KPI cards evenly across content area (cols 2-13)
  // Cards merge across the gap column — gap only matters for split panels below
  const kpiPositions: Array<{ startCol: number; endCol: number }> = [];
  if (kpiCount === 3) {
    kpiPositions.push({ startCol: 2, endCol: 5 });
    kpiPositions.push({ startCol: 6, endCol: 9 });
    kpiPositions.push({ startCol: 10, endCol: 13 });
  } else {
    kpiPositions.push({ startCol: 2, endCol: 4 });
    kpiPositions.push({ startCol: 5, endCol: 7 });
    kpiPositions.push({ startCol: 8, endCol: 10 });
    kpiPositions.push({ startCol: 11, endCol: 13 });
  }

  // Placeholder formulas — resolved after content sections render
  const PLACEHOLDER_SPENT = "D999:D999";
  const PLACEHOLDER_BUDGET = "C999:C999";
  const kpiFormulas = dashConfig.kpiFormulas.map(f =>
    f.replace(/\{INCOME_REF\}/g, INCOME_REF)
     .replace(/\{SPENT_RANGE\}/g, PLACEHOLDER_SPENT)
     .replace(/\{BUDGET_RANGE\}/g, PLACEHOLDER_BUDGET)
  );

  const kpiBlockStartRow = currentRow;

  // KPI Row 1: Accent bars — colored top edge per card (3px)
  ws.getRow(currentRow).height = 3;
  for (let c = 1; c <= NUM_COLS; c++) {
    ws.getCell(currentRow, c).fill = solidFill(CANVAS_BG);
    ws.getCell(currentRow, c).font = { ...FONT_BASE, size: 1, color: fontColor(CANVAS_BG) };
    ws.getCell(currentRow, c).border = {};
  }
  for (let ki = 0; ki < kpiCount; ki++) {
    const pos = kpiPositions[ki];
    ws.mergeCells(currentRow, pos.startCol, currentRow, pos.endCol);
    const cell = ws.getCell(currentRow, pos.startCol);
    cell.fill = solidFill(kpiColors[ki].text); // Dark accent color
    cell.font = { ...FONT_BASE, size: 1, color: fontColor(kpiColors[ki].text) };
  }
  currentRow++;

  // KPI Row 2: Top padding (12px, card bg color)
  ws.getRow(currentRow).height = 12;
  for (let c = 1; c <= NUM_COLS; c++) {
    ws.getCell(currentRow, c).fill = solidFill(CANVAS_BG);
    ws.getCell(currentRow, c).font = { ...FONT_BASE, size: 1, color: fontColor(CANVAS_BG) };
    ws.getCell(currentRow, c).border = {};
  }
  for (let ki = 0; ki < kpiCount; ki++) {
    const pos = kpiPositions[ki];
    ws.mergeCells(currentRow, pos.startCol, currentRow, pos.endCol);
    ws.getCell(currentRow, pos.startCol).fill = solidFill(kpiColors[ki].bg);
    ws.getCell(currentRow, pos.startCol).font = { ...FONT_BASE, size: 1, color: fontColor(kpiColors[ki].bg) };
  }
  currentRow++;

  // KPI Row 3: Label (small uppercase text, 22px)
  const kpiLabelRow = currentRow;
  ws.getRow(currentRow).height = 22;
  for (let c = 1; c <= NUM_COLS; c++) {
    ws.getCell(currentRow, c).fill = solidFill(CANVAS_BG);
    ws.getCell(currentRow, c).font = { ...FONT_BASE, size: 1, color: fontColor(CANVAS_BG) };
    ws.getCell(currentRow, c).border = {};
  }
  for (let ki = 0; ki < kpiCount; ki++) {
    const pos = kpiPositions[ki];
    ws.mergeCells(currentRow, pos.startCol, currentRow, pos.endCol);
    const cell = ws.getCell(currentRow, pos.startCol);
    cell.value = (dashConfig.kpiLabels[ki] || `KPI ${ki + 1}`).toUpperCase();
    cell.fill = solidFill(kpiColors[ki].bg);
    cell.font = { ...FONT_BASE, bold: true, size: 9, color: fontColor(kpiColors[ki].text) };
    cell.alignment = { horizontal: "center", vertical: "bottom" };
  }
  currentRow++;

  // KPI Row 4: Value — BIG font, the visual centerpiece (64px)
  const kpiValueRow = currentRow;
  ws.getRow(currentRow).height = 64;
  for (let c = 1; c <= NUM_COLS; c++) {
    ws.getCell(currentRow, c).fill = solidFill(CANVAS_BG);
    ws.getCell(currentRow, c).font = { ...FONT_BASE, size: 1, color: fontColor(CANVAS_BG) };
    ws.getCell(currentRow, c).border = {};
  }
  for (let ki = 0; ki < kpiCount; ki++) {
    const pos = kpiPositions[ki];
    ws.mergeCells(currentRow, pos.startCol, currentRow, pos.endCol);
    const cell = ws.getCell(currentRow, pos.startCol);
    cell.value = { formula: kpiFormulas[ki] } as ExcelJS.CellFormulaValue;
    cell.fill = solidFill(kpiColors[ki].bg);
    cell.font = { ...FONT_BASE, bold: true, size: 28, color: fontColor(kpiColors[ki].text) };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.numFmt = dashConfig.kpiFormats[ki];
  }
  currentRow++;

  // KPI Row 5: Bottom padding + shadow (10px)
  ws.getRow(currentRow).height = 10;
  for (let c = 1; c <= NUM_COLS; c++) {
    ws.getCell(currentRow, c).fill = solidFill(CANVAS_BG);
    ws.getCell(currentRow, c).font = { ...FONT_BASE, size: 1, color: fontColor(CANVAS_BG) };
    ws.getCell(currentRow, c).border = {};
  }
  for (let ki = 0; ki < kpiCount; ki++) {
    const pos = kpiPositions[ki];
    ws.mergeCells(currentRow, pos.startCol, currentRow, pos.endCol);
    const cell = ws.getCell(currentRow, pos.startCol);
    cell.fill = solidFill(kpiColors[ki].bg);
    cell.font = { ...FONT_BASE, size: 1, color: fontColor(kpiColors[ki].bg) };
    cell.border = { bottom: { style: "thin", color: { argb: argb(CARD_SHADOW) } } };
  }
  currentRow++;

  const kpiBlockEndRow = currentRow - 1;

  // Gray spacer after KPIs
  applyCanvasRow(ws, currentRow, NUM_COLS, 20);
  currentRow++;

  // ═══════════════════════════════════════════════════════════
  // BLOCK D: CONTENT SECTION CARDS
  // Each section from dashConfig renders as a white card:
  //   section header (accent stripe + title) → data → card shadow
  // Split panels = two separate cards with gray gap between
  // ═══════════════════════════════════════════════════════════
  const sections = dashConfig.sections;
  let budgetRange: BudgetCategoryRange | null = null;
  let sIdx = 0;

  while (sIdx < sections.length) {
    const section = sections[sIdx];

    if (section.position === "full-width") {
      // ── Full-width card: cols 2-13 ──
      const sectionStartRow = currentRow;
      const result = renderDashboardSection(
        ws, currentRow, CONTENT_START, CONTENT_END,
        section, categoryData, nicheData, ACTIVE_TOKENS, NUM_COLS, sIdx
      );
      if (result.budgetRange) budgetRange = result.budgetRange;
      currentRow = result.endRow;

      // Force gutters to gray (col 1, col 14 — NOT col 7, it's inside the section)
      forceCanvasColumns(ws, sectionStartRow, currentRow - 1, [1, NUM_COLS]);

      // Card bottom shadow
      applyCardShadow(ws, currentRow, CONTENT_START, CONTENT_END, NUM_COLS);
      currentRow++;

      // Gray spacer between cards
      applyCanvasRow(ws, currentRow, NUM_COLS, 20);
      currentRow++;
      sIdx++;

    } else if (section.position === "left") {
      const nextSection = sIdx + 1 < sections.length ? sections[sIdx + 1] : null;

      if (nextSection && nextSection.position === "right") {
        // ── TWO SEPARATE CARDS: left + gray gap + right ──
        // This is the key visual: two panels that FEEL separate
        const panelStartRow = currentRow;

        // Render left card content
        const leftResult = renderDashboardSection(
          ws, currentRow, LEFT_START, LEFT_END,
          section, categoryData, nicheData, ACTIVE_TOKENS, NUM_COLS, sIdx
        );
        if (leftResult.budgetRange) budgetRange = leftResult.budgetRange;

        // Render right card content (same starting row)
        const rightResult = renderDashboardSection(
          ws, currentRow, RIGHT_START, RIGHT_END,
          nextSection, categoryData, nicheData, ACTIVE_TOKENS, NUM_COLS, sIdx + 1
        );
        if (rightResult.budgetRange) budgetRange = rightResult.budgetRange;

        const maxEndRow = Math.max(leftResult.endRow, rightResult.endRow);

        // Fill shorter panel's remaining rows with white card bg
        if (leftResult.endRow < maxEndRow) {
          for (let r = leftResult.endRow; r < maxEndRow; r++) {
            for (let c = LEFT_START; c <= LEFT_END; c++) {
              const cell = ws.getCell(r, c);
              if (!cell.fill || !(cell.fill as ExcelJS.FillPattern).fgColor) {
                cell.fill = solidFill("FFFFFF");
              }
            }
          }
        }
        if (rightResult.endRow < maxEndRow) {
          for (let r = rightResult.endRow; r < maxEndRow; r++) {
            for (let c = RIGHT_START; c <= RIGHT_END; c++) {
              const cell = ws.getCell(r, c);
              if (!cell.fill || !(cell.fill as ExcelJS.FillPattern).fgColor) {
                cell.fill = solidFill("FFFFFF");
              }
            }
          }
        }

        // Force gutters AND gap to gray (col 1, col 7, col 14)
        forceCanvasColumns(ws, panelStartRow, maxEndRow - 1, [1, GAP_COL, NUM_COLS]);

        currentRow = maxEndRow;

        // Card bottom shadows — one for each panel separately
        ws.getRow(currentRow).height = 2;
        for (let c = 1; c <= NUM_COLS; c++) {
          const cell = ws.getCell(currentRow, c);
          if ((c >= LEFT_START && c <= LEFT_END) || (c >= RIGHT_START && c <= RIGHT_END)) {
            cell.fill = solidFill("FFFFFF");
            cell.font = { ...FONT_BASE, size: 1, color: fontColor("FFFFFF") };
            cell.border = { bottom: { style: "thin", color: { argb: argb(CARD_SHADOW) } } };
          } else {
            cell.fill = solidFill(CANVAS_BG);
            cell.font = { ...FONT_BASE, size: 1, color: fontColor(CANVAS_BG) };
            cell.border = {};
          }
        }
        currentRow++;

        // Gray spacer
        applyCanvasRow(ws, currentRow, NUM_COLS, 20);
        currentRow++;
        sIdx += 2;

      } else {
        // Left-only section — render as full-width card
        const sectionStartRow = currentRow;
        const result = renderDashboardSection(
          ws, currentRow, CONTENT_START, CONTENT_END,
          section, categoryData, nicheData, ACTIVE_TOKENS, NUM_COLS, sIdx
        );
        if (result.budgetRange) budgetRange = result.budgetRange;
        currentRow = result.endRow;
        forceCanvasColumns(ws, sectionStartRow, currentRow - 1, [1, NUM_COLS]);
        applyCardShadow(ws, currentRow, CONTENT_START, CONTENT_END, NUM_COLS);
        currentRow++;
        applyCanvasRow(ws, currentRow, NUM_COLS, 20);
        currentRow++;
        sIdx++;
      }

    } else if (section.position === "right") {
      // Orphaned right — render as full-width card
      const sectionStartRow = currentRow;
      const result = renderDashboardSection(
        ws, currentRow, CONTENT_START, CONTENT_END,
        section, categoryData, nicheData, ACTIVE_TOKENS, NUM_COLS, sIdx
      );
      if (result.budgetRange) budgetRange = result.budgetRange;
      currentRow = result.endRow;
      forceCanvasColumns(ws, sectionStartRow, currentRow - 1, [1, NUM_COLS]);
      applyCardShadow(ws, currentRow, CONTENT_START, CONTENT_END, NUM_COLS);
      currentRow++;
      applyCanvasRow(ws, currentRow, NUM_COLS, 20);
      currentRow++;
      sIdx++;
    } else {
      sIdx++;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // FIX KPI PLACEHOLDER FORMULAS
  // Replace D999:D999 / C999:C999 with actual budget data positions
  // ═══════════════════════════════════════════════════════════
  if (budgetRange) {
    const budLetter = colLetter(budgetRange.budgetCol);
    const sptLetter = colLetter(budgetRange.spentCol);
    for (let r = kpiBlockStartRow; r <= kpiBlockEndRow; r++) {
      for (let c = 1; c <= NUM_COLS; c++) {
        const cell = ws.getCell(r, c);
        if (cell.value && typeof cell.value === "object" && "formula" in cell.value) {
          const f = (cell.value as ExcelJS.CellFormulaValue).formula;
          if (f.includes("D999:D999") || f.includes("C999:C999")) {
            (cell.value as ExcelJS.CellFormulaValue).formula = f
              .replace(/D999:D999/g, `${sptLetter}${budgetRange.dataStartRow}:${sptLetter}${budgetRange.dataEndRow}`)
              .replace(/C999:C999/g, `${budLetter}${budgetRange.dataStartRow}:${budLetter}${budgetRange.dataEndRow}`);
          }
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // BLOCK E: INSIGHTS CARD
  // Formula-driven text insights in a white card panel
  // ═══════════════════════════════════════════════════════════
  if (dashConfig.showInsights && dashConfig.insightTemplates) {
    // Section header acts as card top (accent stripe + title)
    applySectionHeader(ws, currentRow, CONTENT_START, CONTENT_END,
      "💡 QUICK INSIGHTS", ACTIVE_TOKENS.sectionYellow.bg, ACTIVE_TOKENS.sectionYellow.text);
    forceCanvasColumns(ws, currentRow, currentRow + SECTION_HEADER_ROWS - 1, [1, NUM_COLS]);
    currentRow += SECTION_HEADER_ROWS;

    // Compute formula references from budget range metadata
    const SPENT_RANGE = budgetRange
      ? `${colLetter(budgetRange.spentCol)}${budgetRange.dataStartRow}:${colLetter(budgetRange.spentCol)}${budgetRange.dataEndRow}`
      : "D2:D2";
    const BUDGET_RANGE = budgetRange
      ? `${colLetter(budgetRange.budgetCol)}${budgetRange.dataStartRow}:${colLetter(budgetRange.budgetCol)}${budgetRange.dataEndRow}`
      : "C2:C2";
    // Status column = 2 column-widths past the spent column
    const statusColNum = budgetRange
      ? budgetRange.spentCol + 2 * (budgetRange.spentCol - budgetRange.budgetCol)
      : 10;
    const STATUS_RANGE = budgetRange
      ? `${colLetter(statusColNum)}${budgetRange.dataStartRow}:${colLetter(statusColNum)}${budgetRange.dataEndRow}`
      : "J2:J2";

    for (const template of dashConfig.insightTemplates) {
      const formula = template
        .replace(/\{INCOME_REF\}/g, INCOME_REF)
        .replace(/\{SPENT_RANGE\}/g, SPENT_RANGE)
        .replace(/\{BUDGET_RANGE\}/g, BUDGET_RANGE)
        .replace(/\{STATUS_RANGE\}/g, STATUS_RANGE)
        .replace(/\{GOAL_TOTAL_TARGET\}/g, "0")
        .replace(/\{GOAL_TOTAL_SAVED\}/g, "0");

      const row = ws.getRow(currentRow);
      row.height = 26;
      ws.mergeCells(currentRow, CONTENT_START, currentRow, CONTENT_END);
      const cell = row.getCell(CONTENT_START);
      cell.value = { formula } as ExcelJS.CellFormulaValue;
      cell.fill = solidFill("FFFFFF");
      cell.font = { ...FONT_BASE, size: 10, color: fontColor("374151") };
      cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
      // Gutters stay gray
      row.getCell(1).fill = solidFill(CANVAS_BG);
      row.getCell(1).font = { ...FONT_BASE, size: 1, color: fontColor(CANVAS_BG) };
      row.getCell(NUM_COLS).fill = solidFill(CANVAS_BG);
      row.getCell(NUM_COLS).font = { ...FONT_BASE, size: 1, color: fontColor(CANVAS_BG) };
      currentRow++;
    }

    // Card bottom shadow
    applyCardShadow(ws, currentRow, CONTENT_START, CONTENT_END, NUM_COLS);
    currentRow++;
  }

  // ═══════════════════════════════════════════════════════════
  // FINAL PASS: PAINT CANVAS
  // Fill every remaining unstyled cell with gray canvas color
  // ═══════════════════════════════════════════════════════════
  paintDashboardCanvas(ws, currentRow, NUM_COLS);

  // Freeze title + subtitle rows
  ws.views = [{ state: "frozen", ySplit: 2, xSplit: 0 }];
}

// ── Data Tab (Transactions, Monthly Summary, etc.) ──────────

function buildDataTab(
  wb: ExcelJS.Workbook,
  tab: BlueprintTab,
  blueprint: ProductBlueprint,
  titleBg: string,
  titleText: string,
  tabColor: string
): void {
  const numCols = Math.max(tab.columns.length, 2);
  const ws = wb.addWorksheet(tab.name, {
    properties: { tabColor: { argb: argb(tabColor) } },
  });

  // Set column widths from blueprint or defaults
  ws.columns = tab.columns.map((col) => ({
    width: col.width
      ? Math.round(col.width / 7.5) // Convert px to approx Excel width
      : COLUMN_WIDTH_DEFAULTS[col.type] || 16,
  }));

  const colTypes = tab.columns.map((c) => c.type);
  const colNames = tab.columns.map((c) => c.name);

  let currentRow = 1;

  // ── Row 1: Tab title bar ──────────────────────────────
  applyTitleBar(ws, currentRow, tab.name.toUpperCase(), titleBg, titleText, numCols, 14, 36);
  currentRow++;

  // ── Row 2: Spacer ─────────────────────────────────────
  applySpacer(ws, currentRow, numCols, 6);
  currentRow++;

  // ── Row 3: Column headers ─────────────────────────────
  applyColumnHeaders(ws, currentRow, colNames, colTypes);
  currentRow++;

  // ── Rows 4+: Sample data rows ─────────────────────────
  const role = classifyTab(tab);
  const isEntryTab = role === "transactions" || tab.purpose.toLowerCase().includes("log");

  tab.sampleRows.forEach((rowData, i) => {
    const isAlt = i % 2 === 1;
    const values = tab.columns.map((_, ci) => {
      const val = rowData[ci];
      return val !== undefined ? (val as string | number | null) : null;
    });
    applyDataRow(ws, currentRow, values, colTypes, isAlt);
    currentRow++;
  });

  // Add empty styled rows for data entry tabs
  if (isEntryTab) {
    const emptyRowCount = Math.max(50, 60 - tab.sampleRows.length);
    for (let i = 0; i < emptyRowCount; i++) {
      const isAlt = (tab.sampleRows.length + i) % 2 === 1;
      const emptyValues = tab.columns.map(() => null);
      applyDataRow(ws, currentRow, emptyValues, colTypes, isAlt);
      currentRow++;
    }
  }

  // ── Freeze at row 3 ──────────────────────────────────
  ws.views = [{ state: "frozen", ySplit: 3, xSplit: 0 }];

  // ── Data validation for dropdown columns ──────────────
  // Find bucket/category columns and add dropdowns
  const budgetSetupTab = blueprint.tabs.find(
    (t) => classifyTab(t) === "budget-setup"
  );
  const bucketNames: string[] = [];
  if (budgetSetupTab) {
    for (const row of budgetSetupTab.sampleRows) {
      if (row[0] && typeof row[0] === "string" && row[0] !== "TOTAL" && row[0] !== "Bucket") {
        bucketNames.push(row[0]);
      }
    }
  }

  tab.columns.forEach((col, ci) => {
    const name = col.name.toLowerCase();
    const cl = colLetter(ci + 1);

    // Month column → month dropdown
    if (name.includes("month")) {
      const startRow = 4;
      const endRow = currentRow;
      for (let r = startRow; r <= endRow; r++) {
        addMonthDropdown(ws, `${cl}${r}`);
      }
    }

    // Bucket/Category column → bucket dropdown from blueprint
    if (
      (name.includes("bucket") || name.includes("category") || name.includes("type")) &&
      bucketNames.length > 0
    ) {
      const startRow = 4;
      const endRow = currentRow;
      for (let r = startRow; r <= endRow; r++) {
        addListDropdown(ws, `${cl}${r}`, bucketNames);
      }
    }
  });

  // ── Conditional formatting ────────────────────────────
  tab.columns.forEach((col, ci) => {
    const cl = colLetter(ci + 1);
    const name = col.name.toLowerCase();

    // Status columns
    if (name.includes("status") || name.includes("indicator")) {
      addStatusConditionalFormatting(ws, cl, 4, currentRow);
    }

    // Negative currency highlighting
    if (col.type === "currency") {
      addNegativeCurrencyFormatting(ws, cl, 4, currentRow);
    }
  });

  // ── Number formats for formula columns ────────────────
  tab.columns.forEach((col, ci) => {
    if (col.type === "formula" && col.formula) {
      // Infer format from column name
      const name = col.name.toLowerCase();
      let fmt = "#,##0";
      if (name.includes("$") || name.includes("amount") || name.includes("total") || name.includes("budget") || name.includes("spent") || name.includes("income")) {
        fmt = '"$"#,##0.00';
      } else if (name.includes("%") || name.includes("rate") || name.includes("percent")) {
        fmt = '0"%"';  // Literal — blueprint formulas already compute whole numbers
      }
      const cl = colLetter(ci + 1);
      for (let r = 4; r <= 4 + tab.sampleRows.length; r++) {
        ws.getCell(`${cl}${r}`).numFmt = fmt;
      }
    }
  });
}

// ── Budget Setup Tab ────────────────────────────────────────

function buildBudgetSetupTab(
  wb: ExcelJS.Workbook,
  tab: BlueprintTab,
  blueprint: ProductBlueprint,
  titleBg: string,
  titleText: string,
  subtitleBg: string,
  subtitleText: string,
  tabColor: string
): void {
  const numCols = Math.max(tab.columns.length, 6);
  const ws = wb.addWorksheet(tab.name, {
    properties: { tabColor: { argb: argb(tabColor) } },
  });

  // Wider columns for setup
  ws.columns = [
    { width: 4 },
    { width: 26 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 4 },
  ];

  let currentRow = 1;

  // ── Title bar ─────────────────────────────────────────
  applyTitleBar(ws, currentRow, tab.name.toUpperCase(), titleBg, titleText, numCols, 14, 36);
  currentRow++;

  // ── Spacer ────────────────────────────────────────────
  applySpacer(ws, currentRow, numCols, 10);
  currentRow++;

  // ── Income setting ────────────────────────────────────
  const incomeRow = ws.getRow(currentRow);
  incomeRow.height = 32;
  applySectionHeader(ws, currentRow, 1, numCols, "💰 MONTHLY INCOME", subtitleBg, subtitleText);
  currentRow += SECTION_HEADER_ROWS;

  // Income value row
  const iRow = ws.getRow(currentRow);
  iRow.height = 36;
  iRow.getCell(2).value = "Monthly Income:";
  iRow.getCell(2).font = { ...FONT_BASE, bold: true, size: 11, color: fontColor(ACTIVE_TOKENS.headerText) };
  iRow.getCell(2).alignment = { horizontal: "right", vertical: "middle" };

  // Look for income value in sampleRows
  let incomeValue: string | number | null = 4200; // fallback
  for (const row of tab.sampleRows) {
    if (row[0] && typeof row[0] === "string" && row[0].toLowerCase().includes("income")) {
      incomeValue = (row[1] ?? row[2] ?? 4200) as string | number | null;
      break;
    }
  }
  // If first row has a numeric value in column 2, use that
  if (tab.sampleRows[0]?.[1] && typeof tab.sampleRows[0][1] === "number") {
    incomeValue = tab.sampleRows[0][1];
  }

  const incCell = iRow.getCell(3);
  setCellValue(incCell, incomeValue);
  incCell.numFmt = '"$"#,##0.00';
  incCell.font = { ...FONT_BASE, bold: true, size: 14, color: fontColor(ACTIVE_TOKENS.kpiGreen.text) };
  incCell.alignment = { horizontal: "center", vertical: "middle" };
  incCell.border = allThinBorders();
  incCell.fill = solidFill(ACTIVE_TOKENS.kpiGreen.bg);

  // Fill remaining
  for (let c = 1; c <= numCols; c++) {
    const cell = iRow.getCell(c);
    if (!cell.fill || !(cell.fill as ExcelJS.FillPattern).fgColor) {
      cell.fill = solidFill("FFFFFF");
      cell.font = cell.font || { ...FONT_BASE, size: 10 };
    }
  }
  currentRow++;

  // ── Spacer ────────────────────────────────────────────
  applySpacer(ws, currentRow, numCols, 10);
  currentRow++;

  // ── Bucket allocation table ───────────────────────────
  applySectionHeader(ws, currentRow, 1, numCols, "📊 BUCKET ALLOCATION", ACTIVE_TOKENS.sectionYellow.bg, ACTIVE_TOKENS.sectionYellow.text);
  currentRow += SECTION_HEADER_ROWS;

  // Column headers
  const allocHeaders = ["", "Bucket", "% of Income", "$ Amount", "", ""];
  const allocTypes = ["text", "text", "percent", "currency", "text", "text"];
  applyColumnHeaders(ws, currentRow, allocHeaders, allocTypes);
  currentRow++;

  // Bucket rows from sampleRows
  const bucketRows: Array<Array<string | number | null>> = [];
  let foundBucketData = false;
  for (const row of tab.sampleRows) {
    const first = row[0];
    if (typeof first === "string") {
      const lower = first.toLowerCase();
      if (lower.includes("saving") || lower.includes("need") || lower.includes("want") || lower.includes("bill") || lower.includes("invest") || lower.includes("debt") || lower.includes("essential") || lower.includes("discretion")) {
        bucketRows.push(row);
        foundBucketData = true;
      }
    }
  }

  // If no bucket data found, use all non-header sampleRows
  if (!foundBucketData && tab.sampleRows.length > 1) {
    for (let i = 1; i < tab.sampleRows.length; i++) {
      const row = tab.sampleRows[i];
      if (row[0] && String(row[0]) !== "TOTAL") {
        bucketRows.push(row);
      }
    }
  }

  bucketRows.forEach((row, i) => {
    const isAlt = i % 2 === 1;
    const vals: Array<string | number | null> = [""];
    // Map sampleRow columns to our layout
    for (let c = 0; c < Math.min(row.length, 3); c++) {
      vals.push((row[c] ?? null) as string | number | null);
    }
    while (vals.length < 6) vals.push(null);

    applyDataRow(ws, currentRow, vals, allocTypes, isAlt);

    // Apply specific number formats
    const pctCell = ws.getCell(currentRow, 3);
    if (typeof pctCell.value === "number") pctCell.numFmt = '0"%"';
    const amtCell = ws.getCell(currentRow, 4);
    if (amtCell.value !== null) amtCell.numFmt = '"$"#,##0.00';

    currentRow++;
  });

  // Totals row
  const totals: Array<string | number | null> = ["", "TOTAL", null, null, null, null];
  applyTotalsRow(ws, currentRow, totals, allocTypes);
  currentRow++;

  // ── Spacer ────────────────────────────────────────────
  applySpacer(ws, currentRow, numCols, 16);
  currentRow++;

  // ── Savings goals table ───────────────────────────────
  const savingsTab = blueprint.tabs.find(
    (t) => classifyTab(t) === "savings-goals"
  );
  if (savingsTab && savingsTab.sampleRows.length > 0) {
    applySectionHeader(ws, currentRow, 1, numCols, "🎯 SAVINGS GOALS", ACTIVE_TOKENS.sectionPink.bg, ACTIVE_TOKENS.sectionPink.text);
    currentRow += SECTION_HEADER_ROWS;

    const goalHeaders = ["", "Goal", "Target Amount", "Priority", "", ""];
    const goalTypes = ["text", "text", "currency", "text", "text", "text"];
    applyColumnHeaders(ws, currentRow, goalHeaders, goalTypes);
    currentRow++;

    savingsTab.sampleRows.forEach((row, i) => {
      const isAlt = i % 2 === 1;
      const vals: Array<string | number | null> = [""];
      for (let c = 0; c < Math.min(row.length, 3); c++) {
        vals.push((row[c] ?? null) as string | number | null);
      }
      while (vals.length < 6) vals.push(null);
      applyDataRow(ws, currentRow, vals, goalTypes, isAlt);
      currentRow++;
    });
  }

  // ── Freeze ────────────────────────────────────────────
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];
}

// ── Setup / Instructions Tab ────────────────────────────────

function buildSetupTab(
  wb: ExcelJS.Workbook,
  tab: BlueprintTab,
  blueprint: ProductBlueprint,
  titleBg: string,
  titleText: string,
  subtitleBg: string,
  subtitleText: string,
  tabColor: string
): void {
  const numCols = 6;
  const ws = wb.addWorksheet(tab.name, {
    properties: { tabColor: { argb: argb(tabColor) } },
  });

  ws.columns = [
    { width: 4 },
    { width: 44 },
    { width: 30 },
    { width: 20 },
    { width: 20 },
    { width: 4 },
  ];

  let currentRow = 1;

  // ── Title bar ─────────────────────────────────────────
  const title = tab.sampleRows[0]?.[0]
    ? String(tab.sampleRows[0][0])
    : blueprint.listingStrategy?.titleKeywords?.join(" ") || "Setup & Instructions";
  applyTitleBar(ws, currentRow, title, titleBg, titleText, numCols, 18, 48);
  currentRow++;

  // ── Subtitle bar ──────────────────────────────────────
  const subtitle = tab.sampleRows[1]?.[0]
    ? String(tab.sampleRows[1][0])
    : "⚙️ SETUP & INSTRUCTIONS";
  applySubtitleBar(ws, currentRow, subtitle, subtitleBg, subtitleText, numCols);
  currentRow++;

  // ── Spacer ────────────────────────────────────────────
  applySpacer(ws, currentRow, numCols, 12);
  currentRow++;

  // ── Content from sampleRows ───────────────────────────
  // Each sampleRow is a line of content. Section headers get pastel bg.
  let sectionColorIdx = 0;
  const sectionColors = [
    ACTIVE_TOKENS.sectionGreen,
    ACTIVE_TOKENS.sectionBlue,
    ACTIVE_TOKENS.sectionPink,
    ACTIVE_TOKENS.sectionYellow,
  ];

  for (let i = 2; i < tab.sampleRows.length; i++) {
    const rowData = tab.sampleRows[i];
    const text = rowData[0] != null ? String(rowData[0]) : "";
    if (!text.trim()) {
      applySpacer(ws, currentRow, numCols, 8);
      currentRow++;
      continue;
    }

    const isHeader =
      text.startsWith("📋") ||
      text.startsWith("📊") ||
      text.startsWith("🔗") ||
      text.startsWith("✨") ||
      text.startsWith("💡") ||
      text.toUpperCase() === text ||
      text.startsWith("##") ||
      text.startsWith("HOW TO");

    if (isHeader) {
      const sc = sectionColors[sectionColorIdx % sectionColors.length];
      applySectionHeader(ws, currentRow, 1, numCols, text.replace(/^#+\s*/, ""), sc.bg, sc.text);
      sectionColorIdx++;
      currentRow += SECTION_HEADER_ROWS;
    } else {
      const row = ws.getRow(currentRow);
      row.height = 22;
      const cell = row.getCell(2);
      cell.value = text;
      cell.font = { ...FONT_BASE, size: 10, color: fontColor("374151") };
      cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
      for (let c = 1; c <= numCols; c++) {
        const rc = row.getCell(c);
        rc.fill = solidFill("FFFFFF");
        if (c !== 2) {
          rc.font = rc.font || { ...FONT_BASE, size: 10 };
        }
      }
      currentRow++;
    }
  }

  // ── Standard delivery instructions ────────────────────
  applySpacer(ws, currentRow, numCols, 12);
  currentRow++;

  const deliverySc = sectionColors[sectionColorIdx % sectionColors.length];
  applySectionHeader(ws, currentRow, 1, numCols, "🔗 HOW TO USE IN GOOGLE SHEETS", deliverySc.bg, deliverySc.text);
  currentRow += SECTION_HEADER_ROWS;

  const deliverySteps = [
    "1.  Download the .xlsx file from your Etsy purchase",
    "2.  Go to drive.google.com and sign in to your Google account",
    '3.  Click "+ New" → "File upload" → select this .xlsx file',
    '4.  Once uploaded, right-click the file → "Open with" → "Google Sheets"',
    '5.  Go to File → "Make a copy" to get your own fully editable version',
    "6.  Start by filling in your details, then use the other tabs!",
  ];

  deliverySteps.forEach((step) => {
    const row = ws.getRow(currentRow);
    row.height = 22;
    row.getCell(2).value = step;
    row.getCell(2).font = { ...FONT_BASE, size: 10, color: fontColor("374151") };
    row.getCell(2).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    for (let c = 1; c <= numCols; c++) {
      row.getCell(c).fill = solidFill("FFFFFF");
    }
    currentRow++;
  });

  // ── Footer note ───────────────────────────────────────
  applySpacer(ws, currentRow, numCols, 12);
  currentRow++;
  ws.mergeCells(currentRow, 1, currentRow, numCols);
  const footerCell = ws.getCell(currentRow, 1);
  footerCell.value = "✨  All formulas update automatically. Sample data is included — clear it and add your own to get started.";
  footerCell.fill = solidFill("FFFFFF");
  footerCell.font = { ...FONT_BASE, italic: true, size: 10, color: fontColor(ACTIVE_TOKENS.mutedText) };
  footerCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(currentRow).height = 28;

  // ── Freeze ────────────────────────────────────────────
  ws.views = [{ state: "frozen", ySplit: 2, xSplit: 0 }];
}

// ── Generic Custom Tab ──────────────────────────────────────

function buildCustomTab(
  wb: ExcelJS.Workbook,
  tab: BlueprintTab,
  titleBg: string,
  titleText: string,
  tabColor: string
): void {
  // Same as data tab but without the transaction-specific extras
  const numCols = Math.max(tab.columns.length, 2);
  const ws = wb.addWorksheet(tab.name, {
    properties: { tabColor: { argb: argb(tabColor) } },
  });

  ws.columns = tab.columns.map((col) => ({
    width: col.width
      ? Math.round(col.width / 7.5)
      : COLUMN_WIDTH_DEFAULTS[col.type] || 16,
  }));

  const colTypes = tab.columns.map((c) => c.type);
  const colNames = tab.columns.map((c) => c.name);

  let currentRow = 1;

  // ── Title bar ─────────────────────────────────────────
  applyTitleBar(ws, currentRow, tab.name.toUpperCase(), titleBg, titleText, numCols, 14, 36);
  currentRow++;

  // ── Spacer ────────────────────────────────────────────
  applySpacer(ws, currentRow, numCols, 6);
  currentRow++;

  // ── Column headers ────────────────────────────────────
  applyColumnHeaders(ws, currentRow, colNames, colTypes);
  currentRow++;

  // ── Data rows ─────────────────────────────────────────
  tab.sampleRows.forEach((rowData, i) => {
    const isAlt = i % 2 === 1;
    const values = tab.columns.map((_, ci) => {
      const val = rowData[ci];
      return val !== undefined ? (val as string | number | null) : null;
    });
    applyDataRow(ws, currentRow, values, colTypes, isAlt);
    currentRow++;
  });

  // ── Freeze at row 3 ──────────────────────────────────
  ws.views = [{ state: "frozen", ySplit: 3, xSplit: 0 }];

  // ── Number formats for formula columns ────────────────
  tab.columns.forEach((col, ci) => {
    if (col.type === "formula" && col.formula) {
      const name = col.name.toLowerCase();
      let fmt = "#,##0";
      if (name.includes("$") || name.includes("amount") || name.includes("total") || name.includes("budget") || name.includes("spent")) {
        fmt = '"$"#,##0.00';
      } else if (name.includes("%") || name.includes("rate") || name.includes("percent")) {
        fmt = '0"%"';  // Literal — blueprint formulas already compute whole numbers
      }
      const cl = colLetter(ci + 1);
      for (let r = 4; r <= 4 + tab.sampleRows.length; r++) {
        ws.getCell(`${cl}${r}`).numFmt = fmt;
      }
    }
  });

  // ── Conditional formatting on status columns ──────────
  tab.columns.forEach((col, ci) => {
    const cl = colLetter(ci + 1);
    const name = col.name.toLowerCase();
    if (name.includes("status") || name.includes("indicator")) {
      addStatusConditionalFormatting(ws, cl, 4, 4 + tab.sampleRows.length);
    }
    if (col.type === "currency") {
      addNegativeCurrencyFormatting(ws, cl, 4, 4 + tab.sampleRows.length);
    }
  });
}

// ══════════════════════════════════════════════════════════════
// PREMIUM WELCOME TAB — "Start Here" / Onboarding Experience
//
// Every Etsy template needs a guided onboarding. This tab:
//   1. Hero welcome with product name + niche-specific greeting
//   2. "What's Inside" — tab guide with descriptions
//   3. "How to Get Started" — 5-step visual guide
//   4. "Pro Tips" — niche-specific tips
//   5. Google Sheets delivery instructions
//
// Visually styled as a premium product page, not raw text.
// ══════════════════════════════════════════════════════════════

interface WelcomeContent {
  greeting: string;
  subtitle: string;
  tips: string[];
  quickWins: string[];
}

const WELCOME_CONTENT: Record<string, WelcomeContent> = {
  "wedding-planner": {
    greeting: "Congratulations on your engagement!",
    subtitle: "Your complete wedding budget and planning system",
    tips: [
      "Start by entering your total wedding budget on the Dashboard",
      "Add vendors as you book them — track deposits and balances",
      "Use the Guest List tab to manage RSVPs and meal choices",
      "Check the Timeline tab weekly to stay on track",
    ],
    quickWins: [
      "Fill in your top 3 vendors right now",
      "Set your wedding date on the Dashboard",
      "Enter your total budget to see real-time remaining funds",
    ],
  },
  "baby-budget": {
    greeting: "Welcome to parenthood planning!",
    subtitle: "Track baby expenses, milestones, and savings goals",
    tips: [
      "Start with the Gear Checklist — see what you still need",
      "Update baby expenses monthly as costs change",
      "Use Milestones to plan ahead for upcoming costs",
      "Your savings goals auto-calculate progress as you add funds",
    ],
    quickWins: [
      "Enter your monthly income on the Dashboard",
      "Check off gear items you already have",
      "Set your first savings goal target",
    ],
  },
  "meal-planner": {
    greeting: "Let's transform your food budget!",
    subtitle: "Plan meals, track grocery spending, and save money",
    tips: [
      "Plan your weekly meals first — grocery costs drop automatically",
      "Use the Grocery List tab before every shopping trip",
      "Compare Cost Per Meal to see where homemade saves the most",
      "Batch-cook on Sundays to maximize savings",
    ],
    quickWins: [
      "Fill in this week's meal plan right now",
      "Enter your monthly food budget on the Dashboard",
      "Check the Grocery List and estimate this week's spend",
    ],
  },
  "debt-payoff": {
    greeting: "Your debt-free journey starts here!",
    subtitle: "Track every account, plan payoff strategy, and celebrate milestones",
    tips: [
      "Enter all your debts with balances and APR rates",
      "Focus extra payments on the highest-APR debt first (avalanche method)",
      "Track your Payoff Milestones to stay motivated",
      "Review monthly to see your total debt shrinking",
    ],
    quickWins: [
      "Enter your top 3 debt accounts with current balances",
      "Set your monthly debt payment amount",
      "Calculate your first payoff milestone date",
    ],
  },
  "paycheck-budget": {
    greeting: "Take control of every paycheck!",
    subtitle: "Allocate your income, track bills, and build sinking funds",
    tips: [
      "Enter your take-home pay amount first",
      "Set up Bills & Due Dates so you never miss a payment",
      "Allocate money to Sinking Funds for upcoming large expenses",
      "Review after each paycheck to adjust spending categories",
    ],
    quickWins: [
      "Enter your next paycheck amount",
      "List your top 5 monthly bills with due dates",
      "Set one sinking fund goal to start building",
    ],
  },
  "side-hustle": {
    greeting: "Let's grow your hustle!",
    subtitle: "Track multiple income streams, manage expenses, and plan taxes",
    tips: [
      "Log all income sources — even small ones add up",
      "Track hustle-specific expenses separately from personal ones",
      "Set aside 25-30% of hustle income for taxes every month",
      "Review Income Streams monthly to spot growth trends",
    ],
    quickWins: [
      "Enter your income sources with this month's amounts",
      "List your top hustle expenses",
      "Calculate your quarterly tax set-aside amount",
    ],
  },
  "business-pl": {
    greeting: "Your business clarity dashboard!",
    subtitle: "Revenue tracking, expense management, and profit analysis",
    tips: [
      "Start by entering this month's total revenue",
      "Categorize all expenses for accurate profit margins",
      "Review Tax & Reserve Planning quarterly",
      "Use the P&L view to track month-over-month trends",
    ],
    quickWins: [
      "Enter this month's revenue figure",
      "Categorize your top 5 business expenses",
      "Set your quarterly tax reserve target",
    ],
  },
  "travel-planner": {
    greeting: "Adventure awaits — on budget!",
    subtitle: "Plan trips, track spending, and never overspend on travel",
    tips: [
      "Set your total trip budget before booking anything",
      "Use the Itinerary to plan daily activities and costs",
      "Track spending by category to spot where money goes",
      "Check the Packing Checklist before every trip",
    ],
    quickWins: [
      "Enter your total trip budget",
      "Add your first 3 itinerary activities with estimated costs",
      "Start the packing checklist for your next trip",
    ],
  },
  "student-budget": {
    greeting: "Budget smart, study hard!",
    subtitle: "Manage student finances, track semester costs, and audit subscriptions",
    tips: [
      "Enter all income sources (job, aid, family support)",
      "Track Semester Costs to plan ahead for tuition and books",
      "Run the Subscription Audit — you might be overpaying",
      "Set savings goals for summer and post-graduation",
    ],
    quickWins: [
      "Enter your monthly income from all sources",
      "List this semester's major expenses",
      "Audit your subscriptions — cancel what you don't use",
    ],
  },
  "savings-tracker": {
    greeting: "Your savings journey starts now!",
    subtitle: "Set goals, track progress, and build financial security",
    tips: [
      "Set specific savings goals with target amounts",
      "Track monthly spending to find money to redirect to savings",
      "Automate transfers to savings on payday",
      "Review progress weekly to stay motivated",
    ],
    quickWins: [
      "Enter your monthly income",
      "Set your first savings goal with a target amount",
      "Identify one expense to reduce this month",
    ],
  },
};

function buildWelcomeTab(
  wb: ExcelJS.Workbook,
  blueprint: ProductBlueprint,
  titleBg: string,
  titleText: string,
  subtitleBg: string,
  subtitleText: string,
  tabColor: string,
  nicheId: string,
): void {
  const numCols = 8;
  const ws = wb.addWorksheet("✨ Start Here", {
    properties: { tabColor: { argb: argb(tabColor) } },
  });

  ws.columns = [
    { width: 4 },   // A: gutter
    { width: 3 },   // B: icon column
    { width: 36 },  // C: main content
    { width: 24 },  // D: secondary
    { width: 20 },  // E: detail
    { width: 18 },  // F: extra
    { width: 14 },  // G: status
    { width: 4 },   // H: gutter
  ];

  const welcome = WELCOME_CONTENT[nicheId] || WELCOME_CONTENT["paycheck-budget"];
  const productName = (blueprint.config as { customTitle?: string })?.customTitle
    || blueprint.sourceListingTitle
    || "Premium Budget Template";

  let currentRow = 1;

  // ═══════════════════════════════════════════════════════════
  // HERO SECTION — Product name + warm greeting
  // ═══════════════════════════════════════════════════════════
  applyTitleBar(ws, currentRow, `✨ ${productName}`, titleBg, titleText, numCols, 20, 64);
  currentRow++;

  // Greeting row
  ws.mergeCells(currentRow, 1, currentRow, numCols);
  const greetCell = ws.getCell(currentRow, 1);
  greetCell.value = welcome.greeting;
  greetCell.fill = solidFill(subtitleBg);
  greetCell.font = { ...FONT_BASE, size: 14, color: fontColor(subtitleText) };
  greetCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(currentRow).height = 40;
  currentRow++;

  // Subtitle
  ws.mergeCells(currentRow, 1, currentRow, numCols);
  const subCell = ws.getCell(currentRow, 1);
  subCell.value = welcome.subtitle;
  subCell.fill = solidFill(subtitleBg);
  subCell.font = { ...FONT_BASE, italic: true, size: 11, color: fontColor(ACTIVE_TOKENS.mutedText) };
  subCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(currentRow).height = 28;
  currentRow++;

  applySpacer(ws, currentRow, numCols, 20);
  currentRow++;

  // ═══════════════════════════════════════════════════════════
  // QUICK WINS — Get started in 5 minutes
  // ═══════════════════════════════════════════════════════════
  applySectionHeader(ws, currentRow, 1, numCols,
    "🚀 GET STARTED IN 5 MINUTES",
    ACTIVE_TOKENS.sectionGreen.bg, ACTIVE_TOKENS.sectionGreen.text);
  currentRow += SECTION_HEADER_ROWS;

  welcome.quickWins.forEach((win, idx) => {
    const row = ws.getRow(currentRow);
    row.height = 32;
    const isAlt = idx % 2 === 1;
    const bg = isAlt ? ACTIVE_TOKENS.rowAlt : "FFFFFF";

    // Step number (card-style)
    const numCell = row.getCell(2);
    numCell.value = `${idx + 1}`;
    numCell.fill = solidFill(titleBg);
    numCell.font = { ...FONT_BASE, bold: true, size: 14, color: fontColor("FFFFFF") };
    numCell.alignment = { horizontal: "center", vertical: "middle" };

    // Step text
    ws.mergeCells(currentRow, 3, currentRow, numCols - 1);
    const textCell = row.getCell(3);
    textCell.value = win;
    textCell.fill = solidFill(bg);
    textCell.font = { ...FONT_BASE, size: 11, color: fontColor("212529") };
    textCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    textCell.border = { bottom: thinBorder() };

    // Gutter fills
    row.getCell(1).fill = solidFill("FFFFFF");
    row.getCell(numCols).fill = solidFill("FFFFFF");
    currentRow++;
  });

  applySpacer(ws, currentRow, numCols, 20);
  currentRow++;

  // ═══════════════════════════════════════════════════════════
  // WHAT'S INSIDE — Tab guide
  // ═══════════════════════════════════════════════════════════
  applySectionHeader(ws, currentRow, 1, numCols,
    "📋 WHAT'S INSIDE",
    ACTIVE_TOKENS.sectionBlue.bg, ACTIVE_TOKENS.sectionBlue.text);
  currentRow += SECTION_HEADER_ROWS;

  // Column headers for tab list
  const tabHeaderRow = ws.getRow(currentRow);
  tabHeaderRow.height = 26;
  const tabHeaders = ["", "Tab Name", "What It Does", "", "", ""];
  const tabHeaderCols = [2, 3, 4];
  ws.mergeCells(currentRow, 4, currentRow, numCols - 1);
  tabHeaders.forEach((h, hi) => {
    if (hi > 2) return;
    const cell = tabHeaderRow.getCell(tabHeaderCols[hi]);
    cell.value = h;
    cell.fill = solidFill(ACTIVE_TOKENS.headerBg);
    cell.font = { ...FONT_BASE, bold: true, size: 9, color: fontColor(ACTIVE_TOKENS.headerText) };
    cell.alignment = { horizontal: hi === 0 ? "center" : "left", vertical: "middle" };
    cell.border = { bottom: mediumBorder(ACTIVE_TOKENS.headerText) };
  });
  tabHeaderRow.getCell(1).fill = solidFill("FFFFFF");
  tabHeaderRow.getCell(numCols).fill = solidFill("FFFFFF");
  currentRow++;

  // Tab rows — from blueprint
  const tabIcons = ["📊", "💰", "📝", "📋", "🎯", "📅", "🏦", "⚙️", "📈", "🛒"];
  blueprint.tabs.forEach((tab, idx) => {
    const row = ws.getRow(currentRow);
    row.height = 28;
    const isAlt = idx % 2 === 1;
    const bg = isAlt ? ACTIVE_TOKENS.rowAlt : "FFFFFF";

    // Icon
    row.getCell(2).value = tabIcons[idx % tabIcons.length];
    row.getCell(2).fill = solidFill(bg);
    row.getCell(2).font = { ...FONT_BASE, size: 12 };
    row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };

    // Tab name
    row.getCell(3).value = tab.name;
    row.getCell(3).fill = solidFill(bg);
    row.getCell(3).font = { ...FONT_BASE, bold: true, size: 11, color: fontColor("212529") };
    row.getCell(3).alignment = { horizontal: "left", vertical: "middle" };
    row.getCell(3).border = { bottom: thinBorder() };

    // Purpose
    ws.mergeCells(currentRow, 4, currentRow, numCols - 1);
    row.getCell(4).value = tab.purpose;
    row.getCell(4).fill = solidFill(bg);
    row.getCell(4).font = { ...FONT_BASE, size: 10, color: fontColor("6B7280") };
    row.getCell(4).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    row.getCell(4).border = { bottom: thinBorder() };

    row.getCell(1).fill = solidFill("FFFFFF");
    row.getCell(numCols).fill = solidFill("FFFFFF");
    currentRow++;
  });

  applySpacer(ws, currentRow, numCols, 20);
  currentRow++;

  // ═══════════════════════════════════════════════════════════
  // PRO TIPS — Niche-specific advice
  // ═══════════════════════════════════════════════════════════
  applySectionHeader(ws, currentRow, 1, numCols,
    "💡 PRO TIPS",
    ACTIVE_TOKENS.sectionYellow.bg, ACTIVE_TOKENS.sectionYellow.text);
  currentRow += SECTION_HEADER_ROWS;

  welcome.tips.forEach((tip) => {
    const row = ws.getRow(currentRow);
    row.height = 28;

    row.getCell(2).value = "→";
    row.getCell(2).fill = solidFill("FFFFFF");
    row.getCell(2).font = { ...FONT_BASE, bold: true, size: 12, color: fontColor(titleBg) };
    row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };

    ws.mergeCells(currentRow, 3, currentRow, numCols - 1);
    row.getCell(3).value = tip;
    row.getCell(3).fill = solidFill("FFFFFF");
    row.getCell(3).font = { ...FONT_BASE, size: 11, color: fontColor("374151") };
    row.getCell(3).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    row.getCell(3).border = { bottom: thinBorder() };

    row.getCell(1).fill = solidFill("FFFFFF");
    row.getCell(numCols).fill = solidFill("FFFFFF");
    currentRow++;
  });

  applySpacer(ws, currentRow, numCols, 20);
  currentRow++;

  // ═══════════════════════════════════════════════════════════
  // GOOGLE SHEETS SETUP — Delivery instructions
  // ═══════════════════════════════════════════════════════════
  applySectionHeader(ws, currentRow, 1, numCols,
    "🔗 HOW TO USE IN GOOGLE SHEETS",
    ACTIVE_TOKENS.sectionPink.bg, ACTIVE_TOKENS.sectionPink.text);
  currentRow += SECTION_HEADER_ROWS;

  const steps = [
    ["1", "Download the .xlsx file from your Etsy purchase"],
    ["2", "Go to drive.google.com and sign in"],
    ["3", 'Click "+ New" → "File upload" → select this file'],
    ["4", 'Right-click → "Open with" → "Google Sheets"'],
    ["5", 'Go to File → "Make a copy" for your own editable version'],
    ["6", "Start filling in your data — all formulas update automatically!"],
  ];

  steps.forEach(([num, text]) => {
    const row = ws.getRow(currentRow);
    row.height = 30;

    row.getCell(2).value = num;
    row.getCell(2).fill = solidFill(subtitleBg);
    row.getCell(2).font = { ...FONT_BASE, bold: true, size: 13, color: fontColor(subtitleText) };
    row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };

    ws.mergeCells(currentRow, 3, currentRow, numCols - 1);
    row.getCell(3).value = text;
    row.getCell(3).fill = solidFill("FFFFFF");
    row.getCell(3).font = { ...FONT_BASE, size: 11, color: fontColor("374151") };
    row.getCell(3).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    row.getCell(3).border = { bottom: thinBorder() };

    row.getCell(1).fill = solidFill("FFFFFF");
    row.getCell(numCols).fill = solidFill("FFFFFF");
    currentRow++;
  });

  applySpacer(ws, currentRow, numCols, 16);
  currentRow++;

  // ── Footer ────────────────────────────────────────────
  ws.mergeCells(currentRow, 1, currentRow, numCols);
  const footerCell = ws.getCell(currentRow, 1);
  footerCell.value = "✨  All formulas update automatically. Sample data is included — clear it and enter your own!";
  footerCell.fill = solidFill(subtitleBg);
  footerCell.font = { ...FONT_BASE, italic: true, size: 10, color: fontColor(ACTIVE_TOKENS.mutedText) };
  footerCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(currentRow).height = 32;
  currentRow++;

  ws.mergeCells(currentRow, 1, currentRow, numCols);
  const brandCell = ws.getCell(currentRow, 1);
  brandCell.value = "Made with care by CraftPlan Digital Studio";
  brandCell.fill = solidFill(subtitleBg);
  brandCell.font = { ...FONT_BASE, italic: true, size: 9, color: fontColor(ACTIVE_TOKENS.mutedText) };
  brandCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(currentRow).height = 24;

  // No freeze for welcome tab — it's a reading experience
  ws.views = [{ state: "normal" }];
}

// ══════════════════════════════════════════════════════════════
// RICH LAYOUT TAB BUILDERS
//
// These mirror the Python ultimate_budget_build_reference.py
// recipes: hand-laid grids, hero banners, KPI cards driven by
// long cross-tab formulas, and the bestseller "Smart Calendar"
// signature feature.
//
// They DO NOT read from tab.columns / tab.sampleRows — the layout
// is intrinsic. The caller routes via tab.richLayout.
// ══════════════════════════════════════════════════════════════

const RICH_PALETTE = {
  CREAM:       "F5EFE0",
  LIGHT_CREAM: "FAF6EC",
  SAGE:        "9AAE94",
  DARK_SAGE:   "5C7558",
  LIGHT_SAGE:  "D4DDC8",
  ROSE:        "E5BAA8",
  ROSE_LIGHT:  "F4DED4",
  PEACH:       "EFD8C9",
  TAUPE:       "C9B8A0",
  WHITE:       "FFFFFF",
  DARK_TEXT:   "2D3A2A",
  LIGHT_GRAY:  "E8E2D3",
  SOFT_BG:     "FBF9F2",
  GOLD:        "D4AF37",
  GOLD_TINT:   "FFF4DA",
  AMBER:       "8B6232",
  ROSE_INK:    "8B3232",
  CAP_TEXT:    "C9D4C5",
};

/** Pull a hex without leading # from the niche profile, with sage fallback. */
function richPrimary(profile: NicheDesignProfile): string {
  return hex(profile.palette?.primary || RICH_PALETTE.DARK_SAGE);
}
function richAccent(profile: NicheDesignProfile): string {
  return hex(profile.palette?.accent || RICH_PALETTE.SAGE);
}

/** Tint every cell in a rectangle with the cream-paper background. */
function richFillBg(ws: WS, maxRow: number, maxCol: number, color: string = RICH_PALETTE.LIGHT_CREAM): void {
  for (let r = 1; r <= maxRow; r++) {
    for (let c = 1; c <= maxCol; c++) {
      const cell = ws.getCell(r, c);
      cell.fill = solidFill(color);
      cell.border = {};
    }
  }
}

/** Set column widths from an array starting at column 1. */
function richColWidths(ws: WS, widths: number[]): void {
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

/** Thin border using the cream-paper border color. */
function richBord(): Partial<ExcelJS.Borders> {
  const t = thinBorder("C9C0AB");
  return { top: t, bottom: t, left: t, right: t };
}

/** Hero banner band — fills a rectangle in the niche primary color. */
function richHeroBand(
  ws: WS,
  startRow: number,
  endRow: number,
  cols: number,
  color: string,
): void {
  for (let r = startRow; r <= endRow; r++) {
    for (let c = 2; c <= cols + 1; c++) {
      const cell = ws.getCell(r, c);
      cell.fill = solidFill(color);
      cell.border = {};
    }
  }
}

/** Section band: a single colored row used as a section divider. */
function richSectionBand(ws: WS, row: number, text: string, cols: number = 30): void {
  ws.mergeCells(row, 2, row, cols + 1);
  const c = ws.getCell(row, 2);
  c.value = text;
  c.fill = solidFill(RICH_PALETTE.DARK_SAGE);
  c.font = { name: "Arial", bold: true, size: 11, color: fontColor(RICH_PALETTE.WHITE) };
  c.alignment = { horizontal: "left", vertical: "middle", indent: 2 };
  ws.getRow(row).height = 26;
}

/** Big "premium" KPI card: label band + huge value cell + caption. */
function richPremiumCard(
  ws: WS,
  top: number,
  left: number,
  w: number,
  h: number,
  label: string,
  formula: string | number,
  fillColor: string,
  labelColor: string,
  valueColor: string,
  capColor: string,
  caption?: string,
  numFmt: string = '"$"#,##0',
): void {
  // Top label band (1 row)
  ws.mergeCells(top, left, top, left + w - 1);
  const lc = ws.getCell(top, left);
  lc.value = label;
  lc.fill = solidFill(fillColor);
  lc.font = { name: "Arial", bold: true, size: 9, color: fontColor(labelColor) };
  lc.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(top).height = 20;

  // Big value (rows top+1 .. top+h-2 merged)
  const valBottom = h >= 4 ? top + h - 2 : top + h - 1;
  ws.mergeCells(top + 1, left, valBottom, left + w - 1);
  const vc = ws.getCell(top + 1, left);
  setCellValue(vc, formula as string | number);
  vc.fill = solidFill(fillColor);
  vc.font = { name: "Georgia", bold: true, size: 22, color: fontColor(valueColor) };
  vc.alignment = { horizontal: "center", vertical: "middle" };
  vc.numFmt = numFmt;
  for (let r = top + 1; r <= valBottom; r++) {
    ws.getRow(r).height = 24;
  }

  // Caption (last row)
  if (caption && h >= 3) {
    const capRow = top + h - 1;
    ws.mergeCells(capRow, left, capRow, left + w - 1);
    const cc = ws.getCell(capRow, left);
    cc.value = caption;
    cc.fill = solidFill(fillColor);
    cc.font = { name: "Arial", italic: true, size: 8, color: fontColor(capColor) };
    cc.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(capRow).height = 16;
  }
}

// ─────────────────────────────────────────────────────────────
// 1. SMART CALENDAR — bestseller signature feature
// ─────────────────────────────────────────────────────────────

type TxnKind = "income" | "bill" | "expense" | "subscription" | "saving" | "debt";
const TXN_COLOR: Record<TxnKind, string> = {
  income:       "4A6048",
  bill:         "8B6232",
  expense:      "555555",
  subscription: "9D8B68",
  saving:       "6F8569",
  debt:         "8B3232",
};

/** Sample transactions verbatim from the Python reference TXN_BY_DAY. */
const SMART_CAL_TXNS: Record<number, Array<[string, number, TxnKind]>> = {
  1:  [["Side Hustle Income", 350, "income"], ["Coffee shop", -8, "expense"]],
  2:  [["Uber Eats", -28, "expense"]],
  3:  [["Salary - Steve", 5800, "income"], ["Rent", -1450, "bill"]],
  4:  [["Disney+", -10, "subscription"], ["Spotify", -10, "subscription"], ["Phone - Jess", -40, "bill"], ["Side Hustle - John", 1000, "income"]],
  5:  [["Whole Foods", -98, "expense"], ["Pharmacy", -22, "expense"]],
  6:  [["Sunday brunch", -42, "expense"]],
  7:  [["Netflix", -16, "subscription"], ["Electric bill", -84, "bill"]],
  8:  [["Gas", -55, "expense"]],
  9:  [["Cafe + lunch", -32, "expense"]],
  10: [["Trader Joe's", -68, "expense"]],
  11: [["Personal Loan John", -350, "debt"], ["Side Hustle - John", 1000, "income"]],
  12: [["Auto-savings transfer", -500, "saving"], ["Life insurance", -125, "bill"], ["Business Income", 1000, "income"], ["Paycheck Marie", 6000, "income"]],
  13: [["Mortgage", -1000, "bill"]],
  14: [["Paycheck Steve", 7000, "income"], ["Hulu", -12, "subscription"]],
  15: [["Apple Music", -10, "subscription"]],
  16: [["Date night", -85, "expense"]],
  17: [["Gym", -29, "subscription"]],
  18: [["Amazon Prime", -15, "subscription"], ["Business Income", 1000, "income"], ["Paycheck Marie", 6000, "income"]],
  19: [["Credit Card Jess", -550, "debt"], ["Home insurance", -120, "bill"], ["Business Income", 1000, "income"]],
  20: [["Hulu", -12, "subscription"]],
  21: [["Paycheck Steve", 7000, "income"]],
  22: [["Movies", -28, "expense"]],
  23: [["Groceries", -82, "expense"]],
  25: [["CC payment", -350, "debt"]],
  27: [["Pharmacy", -22, "expense"]],
  28: [["Internet", -65, "bill"]],
  30: [["Salary - John", 5800, "income"]],
  31: [["Quarterly tax savings", -800, "saving"]],
};

/** 5 weeks of January 2026 (Jan 1 = Thursday). */
const SMART_CAL_WEEKS: Array<Array<number | null>> = [
  [null, null, null, null, 1, 2, 3],
  [4, 5, 6, 7, 8, 9, 10],
  [11, 12, 13, 14, 15, 16, 17],
  [18, 19, 20, 21, 22, 23, 24],
  [25, 26, 27, 28, 29, 30, 31],
];

function buildSmartCalendarTab(
  wb: ExcelJS.Workbook,
  tab: BlueprintTab,
  profile: NicheDesignProfile,
  tabColor: string,
): void {
  const ws = wb.addWorksheet(tab.name, {
    properties: { tabColor: { argb: argb(tabColor) } },
    views: [{ showGridLines: false }],
  });

  const primary = richPrimary(profile);
  const lightSection = RICH_PALETTE.LIGHT_SAGE;
  const NUM_COLS = 32;
  richFillBg(ws, 60, NUM_COLS, RICH_PALETTE.LIGHT_CREAM);

  // Column widths: A = 2, then 30 columns of 4.5 each, last = 4.5
  const widths: number[] = [2];
  for (let i = 0; i < 30; i++) widths.push(4.5);
  richColWidths(ws, widths);

  // ── HERO BANNER ──
  richHeroBand(ws, 2, 5, 30, primary);
  ws.getRow(2).height = 8;
  ws.getRow(3).height = 56;
  ws.getRow(4).height = 22;
  ws.getRow(5).height = 12;

  ws.mergeCells(3, 2, 3, 18);
  const heroTitle = ws.getCell(3, 2);
  heroTitle.value = "Smart Calendar";
  heroTitle.fill = solidFill(primary);
  heroTitle.font = { name: "Georgia", bold: true, size: 32, color: fontColor(RICH_PALETTE.WHITE) };
  heroTitle.alignment = { horizontal: "left", vertical: "middle", indent: 1 };

  ws.mergeCells(4, 2, 4, 18);
  const heroSub = ws.getCell(4, 2);
  heroSub.value = "Every transaction · day by day · January 2026";
  heroSub.fill = solidFill(primary);
  heroSub.font = { name: "Georgia", italic: true, size: 12, color: fontColor(RICH_PALETTE.CAP_TEXT) };
  heroSub.alignment = { horizontal: "left", vertical: "middle", indent: 1 };

  // Starting balance badge top-right
  ws.mergeCells(3, 25, 3, 31);
  const sbv = ws.getCell(3, 25);
  sbv.value = 8500;
  sbv.fill = solidFill(primary);
  sbv.font = { name: "Georgia", bold: true, size: 22, color: fontColor(RICH_PALETTE.WHITE) };
  sbv.alignment = { horizontal: "right", vertical: "middle", indent: 2 };
  sbv.numFmt = '"$"#,##0';

  ws.mergeCells(4, 25, 4, 31);
  const sbl = ws.getCell(4, 25);
  sbl.value = "STARTING BALANCE  ·  edit me";
  sbl.fill = solidFill(primary);
  sbl.font = { name: "Arial", bold: true, size: 9, color: fontColor(RICH_PALETTE.CAP_TEXT) };
  sbl.alignment = { horizontal: "right", vertical: "top", indent: 2 };

  ws.getRow(6).height = 14;

  // ── DAY HEADERS ──
  const daysFull = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  daysFull.forEach((day, di) => {
    const colStart = 2 + di * 3;
    ws.mergeCells(7, colStart, 7, colStart + 2);
    const c = ws.getCell(7, colStart);
    c.value = day;
    c.font = { name: "Arial", size: 9, bold: true, color: fontColor(primary) };
    c.fill = solidFill(lightSection);
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = richBord();
  });

  // Sidebar header
  ws.mergeCells(7, 25, 7, 31);
  const shc = ws.getCell(7, 25);
  shc.value = "WEEKLY SUMMARY";
  shc.font = { name: "Arial", size: 9, bold: true, color: fontColor(RICH_PALETTE.WHITE) };
  shc.fill = solidFill(primary);
  shc.alignment = { horizontal: "center", vertical: "middle" };
  shc.border = richBord();
  ws.getRow(7).height = 22;

  // ── WEEKLY GRID + SIDEBAR ──
  const WEEK_HEIGHT = 7;
  const WEEK_START_ROW = 8;

  SMART_CAL_WEEKS.forEach((weekDays, wi) => {
    const wrow = WEEK_START_ROW + wi * WEEK_HEIGHT;
    ws.getRow(wrow).height = 16;
    for (let j = 1; j < WEEK_HEIGHT; j++) {
      ws.getRow(wrow + j).height = 13;
    }

    // Weekly totals
    const wt: Record<TxnKind, number> = {
      income: 0, bill: 0, subscription: 0, expense: 0, saving: 0, debt: 0,
    };
    for (const d of weekDays) {
      if (d === null) continue;
      const txns = SMART_CAL_TXNS[d] || [];
      for (const [, amt, kind] of txns) {
        wt[kind] += amt;
      }
    }

    // Calendar cells
    for (let di = 0; di < 7; di++) {
      const colStart = 2 + di * 3;
      const dayNum = weekDays[di];

      // Background — white if day present, cream if outside month
      for (let r = wrow; r < wrow + WEEK_HEIGHT; r++) {
        for (let c = colStart; c < colStart + 3; c++) {
          const cell = ws.getCell(r, c);
          cell.fill = solidFill(dayNum ? RICH_PALETTE.WHITE : RICH_PALETTE.LIGHT_CREAM);
          if (dayNum) cell.border = richBord();
        }
      }
      if (dayNum === null) continue;

      // Day number top-right
      ws.mergeCells(wrow, colStart, wrow, colStart + 2);
      const dn = ws.getCell(wrow, colStart);
      dn.value = dayNum;
      dn.font = { name: "Georgia", size: 11, bold: true, color: fontColor("888888") };
      dn.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
      dn.fill = solidFill(RICH_PALETTE.WHITE);

      // Transactions
      const txns = (SMART_CAL_TXNS[dayNum] || []).slice(0, 6);
      txns.forEach(([desc, amt, kind], ti) => {
        const tr = wrow + 1 + ti;
        const color = TXN_COLOR[kind] || "666666";
        ws.mergeCells(tr, colStart, tr, colStart + 1);
        const dc = ws.getCell(tr, colStart);
        dc.value = desc.slice(0, 18);
        dc.font = { name: "Arial", size: 7, color: fontColor(color) };
        dc.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
        dc.fill = solidFill(RICH_PALETTE.WHITE);

        const ac = ws.getCell(tr, colStart + 2);
        ac.value = amt;
        ac.font = { name: "Arial", size: 7, bold: true, color: fontColor(color) };
        ac.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
        ac.numFmt = '"$"#,##0;[Red]"$"#,##0;"-"';
        ac.fill = solidFill(RICH_PALETTE.WHITE);
      });
    }

    // Weekly sidebar summary (cols 25..31)
    const sbCol = 25;
    ws.mergeCells(wrow, sbCol, wrow, sbCol + 6);
    const wl = ws.getCell(wrow, sbCol);
    wl.value = `WEEK ${wi + 1}`;
    wl.font = { name: "Arial", size: 9, bold: true, color: fontColor(primary) };
    wl.fill = solidFill(lightSection);
    wl.alignment = { horizontal: "center", vertical: "middle" };
    wl.border = richBord();

    const summaryData: Array<[string, number]> = [
      ["Income", wt.income],
      ["Bills", wt.bill],
      ["Subscriptions", wt.subscription],
      ["Expenses", wt.expense],
      ["Savings", wt.saving],
      ["Debts", wt.debt],
    ];
    summaryData.forEach(([label, val], li) => {
      const r = wrow + 1 + li;
      ws.mergeCells(r, sbCol, r, sbCol + 3);
      const ll = ws.getCell(r, sbCol);
      ll.value = label;
      ll.font = { name: "Arial", size: 8, color: fontColor(RICH_PALETTE.DARK_TEXT) };
      ll.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
      ll.fill = solidFill(RICH_PALETTE.WHITE);
      ll.border = richBord();

      ws.mergeCells(r, sbCol + 4, r, sbCol + 6);
      const vl = ws.getCell(r, sbCol + 4);
      vl.value = val;
      vl.font = {
        name: "Arial", size: 8, bold: true,
        color: fontColor(val >= 0 ? "4A6048" : "8B3232"),
      };
      vl.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
      vl.numFmt = '"$"#,##0;[Red]"$"#,##0;"-"';
      vl.fill = solidFill(RICH_PALETTE.WHITE);
      vl.border = richBord();
    });
  });

  // ── LEGEND ──
  const LEGEND_START = WEEK_START_ROW + 5 * WEEK_HEIGHT + 2;
  ws.getRow(LEGEND_START - 1).height = 14;
  richSectionBand(ws, LEGEND_START, "LEGEND  ·  Color-coded by transaction type", 30);
  ws.getRow(LEGEND_START).height = 28;
  ws.getRow(LEGEND_START + 1).height = 8;

  const legendItems: Array<[string, string]> = [
    ["INCOME", "4A6048"],
    ["BILLS", "8B6232"],
    ["SUBSCRIPTIONS", "9D8B68"],
    ["EXPENSES", "555555"],
    ["SAVINGS", "6F8569"],
    ["DEBTS", "8B3232"],
  ];
  legendItems.forEach(([label, color], i) => {
    const colStart = 2 + i * 5;
    ws.mergeCells(LEGEND_START + 2, colStart, LEGEND_START + 2, colStart + 4);
    const cell = ws.getCell(LEGEND_START + 2, colStart);
    cell.value = `●  ${label}`;
    cell.font = { name: "Arial", size: 10, bold: true, color: fontColor(color) };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = solidFill(RICH_PALETTE.WHITE);
    cell.border = richBord();
  });
  ws.getRow(LEGEND_START + 2).height = 24;

  // Footer
  const footerRow = LEGEND_START + 4;
  ws.mergeCells(footerRow, 2, footerRow, 31);
  const ft = ws.getCell(footerRow, 2);
  ft.value = "The Ultimate Budget · Smart Calendar";
  ft.font = { name: "Georgia", size: 10, italic: true, color: fontColor(primary) };
  ft.alignment = { horizontal: "center", vertical: "middle" };
  ft.fill = solidFill(lightSection);
  ws.getRow(footerRow).height = 22;

  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 7, showGridLines: false }];
}

// ─────────────────────────────────────────────────────────────
// 2. YEAR IN REVIEW — Spotify-Wrapped for money
// ─────────────────────────────────────────────────────────────

function buildYearInReviewTab(
  wb: ExcelJS.Workbook,
  tab: BlueprintTab,
  profile: NicheDesignProfile,
  tabColor: string,
): void {
  const ws = wb.addWorksheet(tab.name, {
    properties: { tabColor: { argb: argb(tabColor) } },
    views: [{ showGridLines: false }],
  });

  const primary = richPrimary(profile);
  const accent = richAccent(profile);
  const NUM_COLS = 24;
  richFillBg(ws, 80, NUM_COLS, RICH_PALETTE.LIGHT_CREAM);

  const widths: number[] = [2];
  for (let i = 0; i < 22; i++) widths.push(6.5);
  richColWidths(ws, widths);

  // ── HERO BANNER ──
  richHeroBand(ws, 2, 7, 22, primary);
  ws.getRow(2).height = 8;
  ws.getRow(3).height = 24;
  ws.getRow(4).height = 64;
  ws.getRow(5).height = 28;
  ws.getRow(6).height = 14;
  ws.getRow(7).height = 14;

  ws.mergeCells(3, 2, 3, 23);
  const eb = ws.getCell(3, 2);
  eb.value = "YOUR MONEY STORY";
  eb.font = { name: "Arial", size: 9, bold: true, color: fontColor(RICH_PALETTE.CAP_TEXT) };
  eb.alignment = { horizontal: "center", vertical: "middle" };
  eb.fill = solidFill(primary);

  ws.mergeCells(4, 2, 4, 23);
  const mt = ws.getCell(4, 2);
  mt.value = "2026 in Review";
  mt.font = { name: "Georgia", size: 48, bold: true, color: fontColor(RICH_PALETTE.WHITE) };
  mt.alignment = { horizontal: "center", vertical: "middle" };
  mt.fill = solidFill(primary);

  ws.mergeCells(5, 2, 5, 23);
  const st = ws.getCell(5, 2);
  st.value = "Auto-generated from your Transactions  ·  refreshes every time you log a new one";
  st.font = { name: "Georgia", size: 12, italic: true, color: fontColor(RICH_PALETTE.CAP_TEXT) };
  st.alignment = { horizontal: "center", vertical: "middle" };
  st.fill = solidFill(primary);

  ws.getRow(8).height = 18;

  // ── SECTION 1: HEADLINES ──
  richSectionBand(ws, 9, "THE HEADLINES  ·  Your year by the numbers", 22);
  ws.getRow(10).height = 8;

  ws.getRow(11).height = 14;
  for (let r = 12; r <= 16; r++) ws.getRow(r).height = 24;
  ws.getRow(17).height = 16;

  richPremiumCard(ws, 11, 2, 5, 7, "TOTAL SAVED",
    "='Annual Dashboard'!B12",
    accent, RICH_PALETTE.WHITE, RICH_PALETTE.WHITE, RICH_PALETTE.CAP_TEXT,
    "all savings transfers");
  richPremiumCard(ws, 11, 7, 5, 7, "DEBT PAID",
    "='Annual Dashboard'!G12",
    primary, RICH_PALETTE.WHITE, RICH_PALETTE.WHITE, RICH_PALETTE.CAP_TEXT,
    "loans + credit cards");
  richPremiumCard(ws, 11, 12, 5, 7, "BEST MONTH",
    "=INDEX('Annual Dashboard'!B18:B29,MATCH(MAX('Annual Dashboard'!E18:E29),'Annual Dashboard'!E18:E29,0))",
    RICH_PALETTE.ROSE, RICH_PALETTE.DARK_TEXT, RICH_PALETTE.ROSE_INK, RICH_PALETTE.DARK_TEXT,
    "highest savings month",
    "General",
  );
  richPremiumCard(ws, 11, 17, 7, 7, "DAYS TRACKED",
    "=COUNTA(Transactions!B6:B205)",
    RICH_PALETTE.LIGHT_CREAM, RICH_PALETTE.DARK_TEXT, RICH_PALETTE.DARK_SAGE, RICH_PALETTE.DARK_TEXT,
    "of financial discipline",
    "0",
  );

  ws.getRow(18).height = 18;

  // ── SECTION 2: BIGGEST WINS ──
  richSectionBand(ws, 19, "BIGGEST WINS  ·  What you crushed this year", 22);
  ws.getRow(20).height = 8;

  ws.getRow(21).height = 14;
  for (let r = 22; r <= 24; r++) ws.getRow(r).height = 22;
  ws.getRow(25).height = 14;

  richPremiumCard(ws, 21, 2, 7, 5, "LONGEST NO-SPEND STREAK",
    "=MAX('No-Spend Tracker'!AH6:AH17)&\" days\"",
    RICH_PALETTE.LIGHT_SAGE, RICH_PALETTE.DARK_TEXT, RICH_PALETTE.DARK_SAGE, RICH_PALETTE.DARK_TEXT,
    "record streak across the year",
    "General",
  );
  richPremiumCard(ws, 21, 9, 7, 5, "HIGHEST EARNING MONTH",
    "=INDEX('Annual Dashboard'!B18:B29,MATCH(MAX('Annual Dashboard'!C18:C29),'Annual Dashboard'!C18:C29,0))",
    RICH_PALETTE.PEACH, RICH_PALETTE.DARK_TEXT, RICH_PALETTE.AMBER, RICH_PALETTE.DARK_TEXT,
    "biggest income haul",
    "General",
  );
  richPremiumCard(ws, 21, 16, 7, 5, "GOAL PROGRESS",
    "=TEXT(SUMPRODUCT('Savings Goals'!D6:D15)/SUMPRODUCT('Savings Goals'!C6:C15),\"0%\")",
    RICH_PALETTE.TAUPE, RICH_PALETTE.WHITE, RICH_PALETTE.WHITE, RICH_PALETTE.CAP_TEXT,
    "of all goals combined",
    "General",
  );

  ws.getRow(26).height = 18;

  // ── SECTION 3: BADGES ──
  richSectionBand(ws, 27, "BADGES EARNED  ·  Achievements unlocked", 22);
  ws.getRow(28).height = 8;

  const badges: Array<[string, string]> = [
    ["🌱  FIRST $1K SAVED",     "IF('Annual Dashboard'!B12>=1000,\"EARNED\",\"locked\")"],
    ["🔥  10-DAY STREAK",       "IF(MAX('No-Spend Tracker'!AH6:AH17)>=10,\"EARNED\",\"locked\")"],
    ["💎  20% SAVINGS RATE",    "IF('Annual Dashboard'!B12/MAX('Annual Dashboard'!B7,1)>=0.2,\"EARNED\",\"locked\")"],
    ["🎯  HIT A GOAL",          "IF(MAX('Savings Goals'!F6:F15)>=1,\"EARNED\",\"locked\")"],
    ["📉  DEBT CRUSHER",        "IF('Annual Dashboard'!G12>=1000,\"EARNED\",\"locked\")"],
    ["✨  CONSISTENT TRACKER",  "IF(COUNTA(Transactions!B6:B205)>=50,\"EARNED\",\"locked\")"],
  ];
  badges.forEach(([label, formula], i) => {
    const row = 29 + Math.floor(i / 3) * 4;
    const col = 2 + (i % 3) * 7;
    // Paint card cells
    for (let r = row; r < row + 3; r++) {
      for (let c = col; c < col + 7; c++) {
        const cell = ws.getCell(r, c);
        cell.fill = solidFill(RICH_PALETTE.WHITE);
        cell.border = richBord();
      }
    }
    // Label
    ws.mergeCells(row, col, row + 1, col + 6);
    const lc = ws.getCell(row, col);
    lc.value = label;
    lc.font = { name: "Georgia", size: 14, bold: true, color: fontColor(primary) };
    lc.alignment = { horizontal: "center", vertical: "middle" };
    lc.fill = solidFill(RICH_PALETTE.WHITE);
    // Status formula
    ws.mergeCells(row + 2, col, row + 2, col + 6);
    const sc = ws.getCell(row + 2, col);
    setCellValue(sc, `=${formula}`);
    sc.font = { name: "Arial", size: 10, bold: true, color: fontColor("6E7A6A") };
    sc.alignment = { horizontal: "center", vertical: "middle" };
    sc.fill = solidFill(RICH_PALETTE.WHITE);
    ws.getRow(row).height = 18;
    ws.getRow(row + 1).height = 18;
    ws.getRow(row + 2).height = 16;
  });

  // Conditional formatting: green for "EARNED", grey for "locked"
  ws.addConditionalFormatting({
    ref: "B31:V41",
    rules: [
      {
        type: "containsText",
        operator: "containsText",
        text: "EARNED",
        priority: 1,
        style: {
          fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDF0DD" } },
          font: { color: { argb: "FF2F5F2F" }, bold: true },
        },
      },
      {
        type: "containsText",
        operator: "containsText",
        text: "locked",
        priority: 2,
        style: {
          fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E2D3" } },
          font: { color: { argb: "FF999999" }, bold: false },
        },
      },
    ],
  });

  // ── SECTION 4: TOP 5 ──
  richSectionBand(ws, 38, "TOP 5 OF THE YEAR  ·  Your year's biggest moves", 22);
  ws.getRow(39).height = 8;

  // Table header
  const headers = ["Rank", "Top Spending Day", "Description", "Amount"];
  headers.forEach((h, i) => {
    const c = ws.getCell(40, 2 + i);
    c.value = h;
    c.font = { name: "Arial", size: 10, bold: true, color: fontColor(RICH_PALETTE.WHITE) };
    c.fill = solidFill(accent);
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = richBord();
  });
  ws.getRow(40).height = 22;

  for (let i = 0; i < 5; i++) {
    const r = 41 + i;
    // Rank
    const rk = ws.getCell(r, 2);
    rk.value = i + 1;
    rk.font = { name: "Georgia", size: 14, bold: true, color: fontColor(primary) };
    rk.alignment = { horizontal: "center", vertical: "middle" };
    rk.fill = solidFill(RICH_PALETTE.LIGHT_SAGE);
    rk.border = richBord();
    // Date (col 3)
    const dateCell = ws.getCell(r, 3);
    setCellValue(dateCell, `=IFERROR(INDEX(Transactions!$B$6:$B$205,MATCH(LARGE(IFERROR(-Transactions!$G$6:$G$205,0),${i + 1}),IFERROR(-Transactions!$G$6:$G$205,0),0)),"-")`);
    dateCell.numFmt = "mmm dd, yyyy";
    dateCell.font = { name: "Arial", size: 10, color: fontColor(RICH_PALETTE.DARK_TEXT) };
    dateCell.fill = solidFill(RICH_PALETTE.WHITE);
    dateCell.border = richBord();
    // Description (cols 4..10 merged)
    ws.mergeCells(r, 4, r, 10);
    const descCell = ws.getCell(r, 4);
    setCellValue(descCell, `=IFERROR(INDEX(Transactions!$F$6:$F$205,MATCH(LARGE(IFERROR(-Transactions!$G$6:$G$205,0),${i + 1}),IFERROR(-Transactions!$G$6:$G$205,0),0)),"-")`);
    descCell.font = { name: "Arial", size: 10, color: fontColor(RICH_PALETTE.DARK_TEXT) };
    descCell.fill = solidFill(RICH_PALETTE.WHITE);
    descCell.border = richBord();
    // Amount (col 11)
    const amtCell = ws.getCell(r, 11);
    setCellValue(amtCell, `=IFERROR(-LARGE(IFERROR(-Transactions!$G$6:$G$205,0),${i + 1}),"-")`);
    amtCell.numFmt = '"$"#,##0.00;[Red]("$"#,##0.00);"-"';
    amtCell.font = { name: "Arial", size: 10, color: fontColor(RICH_PALETTE.DARK_TEXT) };
    amtCell.alignment = { horizontal: "right", vertical: "middle" };
    amtCell.fill = solidFill(RICH_PALETTE.WHITE);
    amtCell.border = richBord();
    ws.getRow(r).height = 22;
  }

  // Footer
  ws.getRow(47).height = 14;
  ws.mergeCells(48, 2, 48, 23);
  const ft = ws.getCell(48, 2);
  ft.value = "Share-worthy. Screenshot. Tag your money story.  ·  The Ultimate Budget";
  ft.font = { name: "Georgia", size: 10, italic: true, color: fontColor(primary) };
  ft.alignment = { horizontal: "center", vertical: "middle" };
  ft.fill = solidFill(RICH_PALETTE.LIGHT_SAGE);
  ws.getRow(48).height = 22;

  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 7, showGridLines: false }];
}

// ─────────────────────────────────────────────────────────────
// 3. AI MONEY COACH — formulas that read like advice
// ─────────────────────────────────────────────────────────────

function richInsightCard(
  ws: WS,
  top: number,
  left: number,
  w: number,
  h: number,
  headline: string,
  formulaText: string,
  primary: string,
  lightSection: string,
): void {
  for (let r = top; r < top + h; r++) {
    for (let c = left; c < left + w; c++) {
      const cell = ws.getCell(r, c);
      cell.fill = solidFill(RICH_PALETTE.WHITE);
      cell.border = richBord();
    }
  }
  // Header band (rows top..top+1 merged)
  ws.mergeCells(top, left, top + 1, left + w - 1);
  const hc = ws.getCell(top, left);
  hc.value = headline;
  hc.font = { name: "Georgia", size: 14, bold: true, color: fontColor(primary) };
  hc.alignment = { horizontal: "left", vertical: "middle", indent: 2 };
  hc.fill = solidFill(lightSection);
  ws.getRow(top).height = 22;
  ws.getRow(top + 1).height = 22;

  // Body formula (rows top+2 .. top+h-1 merged)
  ws.mergeCells(top + 2, left, top + h - 1, left + w - 1);
  const bc = ws.getCell(top + 2, left);
  setCellValue(bc, formulaText);
  bc.font = { name: "Arial", size: 11, color: fontColor(RICH_PALETTE.DARK_TEXT) };
  bc.alignment = { horizontal: "left", vertical: "top", wrapText: true, indent: 2 };
  bc.fill = solidFill(RICH_PALETTE.WHITE);
  for (let r = top + 2; r <= top + h - 1; r++) {
    ws.getRow(r).height = 22;
  }
}

function buildMoneyCoachTab(
  wb: ExcelJS.Workbook,
  tab: BlueprintTab,
  profile: NicheDesignProfile,
  tabColor: string,
): void {
  const ws = wb.addWorksheet(tab.name, {
    properties: { tabColor: { argb: argb(tabColor) } },
    views: [{ showGridLines: false }],
  });
  const primary = richPrimary(profile);
  const lightSection = RICH_PALETTE.LIGHT_SAGE;
  const NUM_COLS = 22;
  richFillBg(ws, 80, NUM_COLS, RICH_PALETTE.LIGHT_CREAM);

  const widths: number[] = [2];
  for (let i = 0; i < 20; i++) widths.push(6.5);
  richColWidths(ws, widths);

  // ── HERO ──
  richHeroBand(ws, 2, 6, 20, primary);
  ws.getRow(2).height = 8;
  ws.getRow(3).height = 22;
  ws.getRow(4).height = 56;
  ws.getRow(5).height = 22;
  ws.getRow(6).height = 12;

  ws.mergeCells(3, 2, 3, 21);
  const eb = ws.getCell(3, 2);
  eb.value = "PERSONALIZED · AUTO-UPDATING · NO SUBSCRIPTION REQUIRED";
  eb.font = { name: "Arial", size: 9, bold: true, color: fontColor(RICH_PALETTE.CAP_TEXT) };
  eb.alignment = { horizontal: "center", vertical: "middle" };
  eb.fill = solidFill(primary);

  ws.mergeCells(4, 2, 4, 21);
  const mt = ws.getCell(4, 2);
  mt.value = "Your Money Coach";
  mt.font = { name: "Georgia", size: 40, bold: true, color: fontColor(RICH_PALETTE.WHITE) };
  mt.alignment = { horizontal: "center", vertical: "middle" };
  mt.fill = solidFill(primary);

  ws.mergeCells(5, 2, 5, 21);
  const st = ws.getCell(5, 2);
  st.value = "Six insights · refreshes every time you log a transaction";
  st.font = { name: "Georgia", size: 11, italic: true, color: fontColor(RICH_PALETTE.CAP_TEXT) };
  st.alignment = { horizontal: "center", vertical: "middle" };
  st.fill = solidFill(primary);

  ws.getRow(7).height = 18;

  // ── 6 INSIGHT CARDS ──
  const srFormula =
    '="Your savings rate is "&IFERROR(TEXT(\'Annual Dashboard\'!B12/MAX(\'Annual Dashboard\'!B7,1),"0%"),"0%")' +
    '&". "&IF(\'Annual Dashboard\'!B12/MAX(\'Annual Dashboard\'!B7,1)>=0.2,' +
    '"Excellent — you' + "'" + 're ahead of 80% of households. Keep stacking.",' +
    'IF(\'Annual Dashboard\'!B12/MAX(\'Annual Dashboard\'!B7,1)>=0.1,' +
    '"Solid. The standard rule of thumb is 20%. Bumping by even 3 points compounds significantly over a decade.",' +
    '"Tight territory. Aim for 10% as a first milestone. Even $50/week habit-saving lands you above the median."))';
  richInsightCard(ws, 8, 2, 9, 8, "💰  SAVINGS RATE", srFormula, primary, lightSection);

  const tcFormula =
    '="Your biggest expense category is "&IFERROR(' +
    'INDEX(\'Annual Dashboard\'!M18:M35,MATCH(MAX(\'Annual Dashboard\'!N18:N35),\'Annual Dashboard\'!N18:N35,0))' +
    ',"-")&" at "&TEXT(MAX(\'Annual Dashboard\'!N18:N35),"$#,##0")' +
    '&". "&IF(MAX(\'Annual Dashboard\'!N18:N35)>MAX(\'Annual Dashboard\'!O18:O35),' +
    '"You' + "'" + 're over budget here — review individual transactions in the Transactions log.",' +
    '"You' + "'" + 're inside budget. Maintain the trajectory.")';
  richInsightCard(ws, 8, 12, 10, 8, "📊  TOP CATEGORY", tcFormula, primary, lightSection);

  ws.getRow(16).height = 18;

  const subFormula =
    '="You' + "'" + 're paying "&TEXT(Subscriptions!D14,"$#,##0")&" per year on subscriptions across "' +
    '&COUNTA(Subscriptions!B6:B13)&" services. "' +
    '&IF(COUNTIF(Subscriptions!H6:H13,"Cancel")>0,' +
    '"You' + "'" + 've flagged "&COUNTIF(Subscriptions!H6:H13,"Cancel")&" for cancellation — annual savings if you act: "' +
    '&TEXT(SUMIFS(Subscriptions!D6:D13,Subscriptions!H6:H13,"Cancel"),"$#,##0")&".",' +
    '"Audit them in the Subscriptions tab — every $5/mo cancelled = $60/year recovered.")';
  richInsightCard(ws, 17, 2, 9, 8, "📺  SUBSCRIPTION AUDIT", subFormula, primary, lightSection);

  const debtFormula =
    '="Your total debt is "&TEXT(\'Debt Tracker\'!D19,"$#,##0")&". "' +
    '&IF(\'Debt Tracker\'!D19=0,"You' + "'" + 're debt-free. Capital."' +
    ',"At your current monthly payment of "&TEXT(\'Debt Tracker\'!H19,"$#,##0")' +
    '&", you' + "'" + 're chipping away at "&TEXT(\'Debt Tracker\'!H19*12,"$#,##0")&" per year. ' +
    'Adding $50/month extra cuts months off your payoff date.")';
  richInsightCard(ws, 17, 12, 10, 8, "💳  DEBT REALITY CHECK", debtFormula, primary, lightSection);

  ws.getRow(25).height = 18;

  const nsFormula =
    '="Your longest no-spend streak this year is "&MAX(\'No-Spend Tracker\'!AH6:AH17)&" days. "' +
    '&IF(MAX(\'No-Spend Tracker\'!AH6:AH17)>=10,' +
    '"That' + "'" + 's elite-level discipline. Keep going.",' +
    'IF(MAX(\'No-Spend Tracker\'!AH6:AH17)>=5,' +
    '"Decent — try stretching it. Every extra no-spend day = "&TEXT(\'Annual Dashboard\'!G7/365,"$#,##0")&" preserved on average.",' +
    '"Start small: pick a 3-day no-spend weekend and mark it on the No-Spend Tracker."))';
  richInsightCard(ws, 26, 2, 9, 8, "🚫  NO-SPEND DISCIPLINE", nsFormula, primary, lightSection);

  const goalFormula =
    '="You' + "'" + 're tracking "&COUNTA(\'Savings Goals\'!B6:B15)&" savings goals. "' +
    '&"On average, you' + "'" + 're "&IFERROR(TEXT(SUMPRODUCT(\'Savings Goals\'!D6:D15)/SUMPRODUCT(\'Savings Goals\'!C6:C15),"0%"),"0%")' +
    '&" of the way there. "' +
    '&IF(SUMPRODUCT(\'Savings Goals\'!D6:D15)/SUMPRODUCT(\'Savings Goals\'!C6:C15)>=0.5,' +
    '"Past the halfway mark — automate the rest with monthly transfers.",' +
    '"Front-load with a one-time deposit if possible — the early dollar compounds the most.")';
  richInsightCard(ws, 26, 12, 10, 8, "🎯  GOAL PACE", goalFormula, primary, lightSection);

  // Footer
  ws.getRow(35).height = 14;
  ws.mergeCells(36, 2, 36, 21);
  const ft = ws.getCell(36, 2);
  ft.value = "Coaching powered by your own data — no third-party API, no subscription, no privacy concerns.";
  ft.font = { name: "Georgia", size: 10, italic: true, color: fontColor(primary) };
  ft.alignment = { horizontal: "center", vertical: "middle" };
  ft.fill = solidFill(lightSection);
  ws.getRow(36).height = 22;

  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 7, showGridLines: false }];
}

// ─────────────────────────────────────────────────────────────
// 4. WHAT-IF SIMULATOR — move the numbers, watch the future
// ─────────────────────────────────────────────────────────────

function buildWhatIfTab(
  wb: ExcelJS.Workbook,
  tab: BlueprintTab,
  profile: NicheDesignProfile,
  tabColor: string,
): void {
  const ws = wb.addWorksheet(tab.name, {
    properties: { tabColor: { argb: argb(tabColor) } },
    views: [{ showGridLines: false }],
  });
  const primary = richPrimary(profile);
  const accent = richAccent(profile);
  const NUM_COLS = 22;
  richFillBg(ws, 80, NUM_COLS, RICH_PALETTE.LIGHT_CREAM);

  const widths: number[] = [2];
  for (let i = 0; i < 20; i++) widths.push(6.5);
  richColWidths(ws, widths);

  // ── HERO ──
  richHeroBand(ws, 2, 6, 20, primary);
  ws.getRow(2).height = 8;
  ws.getRow(3).height = 22;
  ws.getRow(4).height = 56;
  ws.getRow(5).height = 22;
  ws.getRow(6).height = 12;

  ws.mergeCells(3, 2, 3, 21);
  const eb = ws.getCell(3, 2);
  eb.value = "MOVE THE NUMBERS · WATCH YOUR FUTURE CHANGE";
  eb.font = { name: "Arial", size: 9, bold: true, color: fontColor(RICH_PALETTE.CAP_TEXT) };
  eb.alignment = { horizontal: "center", vertical: "middle" };
  eb.fill = solidFill(primary);

  ws.mergeCells(4, 2, 4, 21);
  const mt = ws.getCell(4, 2);
  mt.value = "What If…";
  mt.font = { name: "Georgia", size: 44, bold: true, color: fontColor(RICH_PALETTE.WHITE) };
  mt.alignment = { horizontal: "center", vertical: "middle" };
  mt.fill = solidFill(primary);

  ws.mergeCells(5, 2, 5, 21);
  const st = ws.getCell(5, 2);
  st.value = "Edit the inputs · projections recalculate live";
  st.font = { name: "Georgia", size: 11, italic: true, color: fontColor(RICH_PALETTE.CAP_TEXT) };
  st.alignment = { horizontal: "center", vertical: "middle" };
  st.fill = solidFill(primary);

  ws.getRow(7).height = 18;

  // ── YOUR LEVERS ──
  richSectionBand(ws, 8, "YOUR LEVERS  ·  Edit the cells in the right column", 20);
  ws.getRow(9).height = 8;

  const inputs: Array<[string, string, number | string]> = [
    ["Cut dining out by",        "%",       0.20],
    ["Cancel subscriptions ($)", "$/year",  180],
    ["Boost savings transfer",   "$/month", 200],
    ["Extra debt payment",       "$/month", 100],
    ["Side income added",        "$/month", 500],
  ];
  const goldBorder: Partial<ExcelJS.Borders> = {
    left:   { style: "medium", color: { argb: "FF" + RICH_PALETTE.GOLD } },
    right:  { style: "medium", color: { argb: "FF" + RICH_PALETTE.GOLD } },
    top:    { style: "medium", color: { argb: "FF" + RICH_PALETTE.GOLD } },
    bottom: { style: "medium", color: { argb: "FF" + RICH_PALETTE.GOLD } },
  };
  inputs.forEach(([label, unit, def], i) => {
    const r = 10 + i * 2;
    ws.getRow(r).height = 32;
    ws.getRow(r + 1).height = 8;

    // Label
    ws.mergeCells(r, 2, r, 12);
    const lc = ws.getCell(r, 2);
    lc.value = label;
    lc.font = { name: "Georgia", size: 14, color: fontColor(primary) };
    lc.alignment = { horizontal: "left", vertical: "middle", indent: 2 };
    lc.fill = solidFill(RICH_PALETTE.WHITE);
    lc.border = richBord();

    // Unit
    ws.mergeCells(r, 13, r, 15);
    const uc = ws.getCell(r, 13);
    uc.value = unit;
    uc.font = { name: "Arial", size: 10, italic: true, color: fontColor("888888") };
    uc.alignment = { horizontal: "center", vertical: "middle" };
    uc.fill = solidFill(RICH_PALETTE.WHITE);
    uc.border = richBord();

    // Input cell (gold-bordered, the big "edit me" lever)
    ws.mergeCells(r, 16, r, 21);
    const ic = ws.getCell(r, 16);
    ic.value = def;
    ic.font = { name: "Georgia", size: 20, bold: true, color: fontColor(RICH_PALETTE.AMBER) };
    ic.alignment = { horizontal: "center", vertical: "middle" };
    ic.fill = solidFill(RICH_PALETTE.GOLD_TINT);
    ic.border = goldBorder;
    ic.numFmt = unit === "%" ? "0%" : '"$"#,##0';
  });

  ws.getRow(20).height = 18;

  // ── YOUR PROJECTION ──
  richSectionBand(ws, 21, "YOUR PROJECTION  ·  Based on your levers", 20);
  ws.getRow(22).height = 8;

  ws.getRow(23).height = 14;
  for (let r = 24; r <= 27; r++) ws.getRow(r).height = 22;
  ws.getRow(28).height = 16;

  // Inputs live at P10, P12, P14, P16, P18 — but our merged inputs land at col 16 = P
  const baselineSaved = "='Annual Dashboard'!B12";
  const simulatedSaved =
    "='Annual Dashboard'!B12" +
    '+($P$10*-SUMIFS(Transactions!G6:G205,Transactions!D6:D205,"Dining Out"))' +
    "+$P$12" +
    "+$P$14*12" +
    "+$P$18*12";

  richPremiumCard(ws, 23, 2, 5, 6, "BASELINE SAVED",
    baselineSaved,
    RICH_PALETTE.LIGHT_SAGE, RICH_PALETTE.DARK_TEXT, RICH_PALETTE.DARK_SAGE, RICH_PALETTE.DARK_TEXT,
    "without any changes");
  richPremiumCard(ws, 23, 7, 5, 6, "SIMULATED SAVED",
    simulatedSaved,
    primary, RICH_PALETTE.WHITE, RICH_PALETTE.WHITE, RICH_PALETTE.CAP_TEXT,
    "if you make the changes");
  richPremiumCard(ws, 23, 12, 5, 6, "EXTRA SAVED",
    "=H24-C24",
    "6F8569", RICH_PALETTE.WHITE, RICH_PALETTE.WHITE, RICH_PALETTE.CAP_TEXT,
    "just from your levers");
  richPremiumCard(ws, 23, 17, 5, 6, "5-YEAR COMPOUND",
    "=(H24-C24)*((1.06^5-1)/0.06)",
    RICH_PALETTE.PEACH, RICH_PALETTE.DARK_TEXT, RICH_PALETTE.AMBER, RICH_PALETTE.DARK_TEXT,
    "at 6% annual return");

  ws.getRow(29).height = 18;

  // ── SCENARIO READOUT ──
  richSectionBand(ws, 30, "SCENARIO READOUT  ·  What this changes", 20);
  ws.getRow(31).height = 8;

  const scenarios: string[] = [
    '="With these levers, you' + "'" + 'll save an extra "&TEXT(L24,"$#,##0")&" this year."',
    '="Over 5 years at 6% return, that compounds to "&TEXT(Q24,"$#,##0")&"."',
    '="Your debt payoff accelerates by "&IFERROR(ROUND($P$16*12/MAX(\'Debt Tracker\'!H19*12,1)*\'Debt Tracker\'!I7,1),0)&" months."',
    '="Your monthly savings rate climbs from "&TEXT(\'Annual Dashboard\'!B12/MAX(\'Annual Dashboard\'!B7,1),"0%")&" to "&TEXT(H24/MAX(\'Annual Dashboard\'!B7,1),"0%")&"."',
  ];
  scenarios.forEach((formula, i) => {
    const r = 32 + i;
    ws.mergeCells(r, 2, r, 21);
    const cc = ws.getCell(r, 2);
    setCellValue(cc, formula);
    cc.font = { name: "Georgia", size: 12, italic: true, color: fontColor(primary) };
    cc.alignment = { horizontal: "left", vertical: "middle", indent: 2 };
    cc.fill = solidFill(RICH_PALETTE.WHITE);
    cc.border = richBord();
    ws.getRow(r).height = 26;
  });

  // Footer
  ws.getRow(37).height = 14;
  ws.mergeCells(38, 2, 38, 21);
  const ft = ws.getCell(38, 2);
  ft.value = "Forecasting without spreadsheet wizardry. Just edit the gold cells and watch.";
  ft.font = { name: "Georgia", size: 10, italic: true, color: fontColor(primary) };
  ft.alignment = { horizontal: "center", vertical: "middle" };
  ft.fill = solidFill(RICH_PALETTE.LIGHT_SAGE);
  ws.getRow(38).height = 22;

  // Quiet ref to `accent` to keep TS happy in case future styling wants it.
  void accent;

  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 7, showGridLines: false }];
}

// ══════════════════════════════════════════════════════════════
// MAIN BUILDER
// ══════════════════════════════════════════════════════════════

/**
 * Builds a premium, Etsy-sellable .xlsx file from any ProductBlueprint.
 *
 * This is the universal builder that reads ALL niche-specific content
 * from the blueprint — tab names, columns, sample data, formulas,
 * color schemes — and renders them into a professionally styled
 * spreadsheet using ExcelJS.
 *
 * @param blueprint - The complete ProductBlueprint with tabs, charts, colors
 * @returns ArrayBuffer of the .xlsx file ready for download/storage
 */
export async function buildPremiumSpreadsheet(
  blueprint: ProductBlueprint
): Promise<ArrayBuffer> {
  // ── Resolve niche-specific design tokens ──────────────
  const nicheProfile = resolveNicheProfile(
    (blueprint.config as { niche?: string })?.niche || blueprint.sourceListingTitle || "",
    blueprint.colorScheme
  );
  ACTIVE_TOKENS = buildDesignTokens(nicheProfile);

  // ── Initialize workbook ───────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator = "CraftPlan Digital Studio";
  wb.created = new Date();
  wb.modified = new Date();
  wb.title = (blueprint.config as { customTitle?: string })?.customTitle || blueprint.sourceListingTitle || "Premium Spreadsheet";
  wb.subject = "Digital Product — Google Sheets Template";
  wb.keywords = "google sheets, spreadsheet, template, digital product, etsy";

  // ── Resolve theme colors ──────────────────────────────
  const titleBg = hex(blueprint.colorScheme?.primary || "5B8A5F");
  const titleText = "FFFFFF";
  const subtitleBg = hex(blueprint.colorScheme?.secondary || "E8F5E8");
  const subtitleText = hex(blueprint.colorScheme?.text || "2D5A2D");
  const accentColor = hex(blueprint.colorScheme?.accent || "4A7C59");

  // Tab color rotation for visual variety
  const tabColors = [titleBg, accentColor, subtitleBg, ACTIVE_TOKENS.sectionBlue.bg];
  let tabColorIdx = 0;
  function nextTabColor(): string {
    const color = tabColors[tabColorIdx % tabColors.length];
    tabColorIdx++;
    return color;
  }

  // ── Track which tab names we've created (avoid duplicates) ──
  const createdTabs = new Set<string>();

  function safeTabName(name: string): string {
    // Excel tab names max 31 chars, no special chars like : \ / ? * [ ]
    let safe = name.slice(0, 31);
    safe = safe.replace(/[:\\/?*[\]]/g, "");
    // Ensure uniqueness
    let uniqueName = safe;
    let counter = 2;
    while (createdTabs.has(uniqueName)) {
      uniqueName = safe.slice(0, 28) + ` (${counter})`;
      counter++;
    }
    createdTabs.add(uniqueName);
    return uniqueName;
  }

  // ── Build Welcome/Start Here tab FIRST ────────────────
  // This is the premium onboarding experience — always the first tab.
  // Includes niche-specific greeting, tab guide, pro tips, and setup instructions.
  try {
    createdTabs.add("✨ Start Here");
    buildWelcomeTab(wb, blueprint, titleBg, titleText, subtitleBg, subtitleText, nextTabColor(), nicheProfile.id);
  } catch (err) {
    console.error("[spreadsheet-builder] Error building Welcome tab:", err);
  }

  // ── Build each tab from the blueprint ─────────────────
  for (const tab of blueprint.tabs) {
    const role = classifyTab(tab);
    const originalName = tab.name;
    tab.name = safeTabName(tab.name);
    const tc = nextTabColor();

    try {
      switch (role) {
        case "dashboard":
          buildDashboardTab(
            wb, tab, blueprint,
            titleBg, titleText,
            subtitleBg, subtitleText,
            tc
          );
          break;

        case "setup-instructions":
          buildSetupTab(
            wb, tab, blueprint,
            titleBg, titleText,
            subtitleBg, subtitleText,
            tc
          );
          break;

        case "budget-setup":
          buildBudgetSetupTab(
            wb, tab, blueprint,
            titleBg, titleText,
            subtitleBg, subtitleText,
            tc
          );
          break;

        case "smart-calendar":
          buildSmartCalendarTab(wb, tab, nicheProfile, tc);
          break;

        case "year-in-review":
          buildYearInReviewTab(wb, tab, nicheProfile, tc);
          break;

        case "money-coach":
          buildMoneyCoachTab(wb, tab, nicheProfile, tc);
          break;

        case "what-if-simulator":
          buildWhatIfTab(wb, tab, nicheProfile, tc);
          break;

        case "transactions":
        case "monthly-summary":
        case "savings-goals":
          buildDataTab(wb, tab, blueprint, titleBg, titleText, tc);
          break;

        case "data":
        case "custom":
        default:
          // Check if it has enough structure for a data tab
          if (tab.columns.length > 0) {
            buildDataTab(wb, tab, blueprint, titleBg, titleText, tc);
          } else {
            buildCustomTab(wb, tab, titleBg, titleText, tc);
          }
          break;
      }
    } catch (err) {
      // If a tab fails, create a minimal fallback so the file is still valid
      console.error(`[spreadsheet-builder] Error building tab "${originalName}":`, err);
      try {
        if (!wb.getWorksheet(tab.name)) {
          buildCustomTab(wb, tab, titleBg, titleText, tc);
        }
      } catch {
        // Last resort: create empty styled tab
        const fallbackWs = wb.addWorksheet(tab.name, {
          properties: { tabColor: { argb: argb(tc) } },
        });
        applyTitleBar(fallbackWs, 1, tab.name, titleBg, titleText, 4, 14, 36);
      }
    }
  }

  // Welcome tab is built first (before the loop) — no separate setup tab needed

  // ── Reset tokens to defaults ──────────────────────────
  ACTIVE_TOKENS = { ...DEFAULT_TOKENS };

  // ── Generate the .xlsx buffer ─────────────────────────
  const buffer = await wb.xlsx.writeBuffer();

  // Convert Buffer to ArrayBuffer
  if (buffer instanceof ArrayBuffer) {
    return buffer;
  }
  // Node.js Buffer → ArrayBuffer
  const nodeBuffer = buffer as Buffer;
  const ab = nodeBuffer.buffer.slice(
    nodeBuffer.byteOffset,
    nodeBuffer.byteOffset + nodeBuffer.byteLength
  );
  return ab as ArrayBuffer;
}
