// ══════════════════════════════════════════════════════════════
// Factory Design System v3 — Premium Etsy Spreadsheet Layouts
//
// This is the visual intelligence layer between Blueprint → Generator.
// It transforms raw ProductBlueprint data into structured visual layouts
// with precise positioning, spacing, hierarchy, and component styles.
//
// Design principles (from analyzing Etsy bestsellers):
//   - WHITE backgrounds, pastel accent sections
//   - Card-based KPIs with large typography
//   - Clear visual hierarchy: title → KPIs → data → charts
//   - Generous spacing between sections (no cramped grids)
//   - Two-panel layouts for related data
//   - Alternating row colors for scanability
//   - Rounded-feel borders (thin, light gray)
//   - Professional but approachable (not corporate)
//
// These are PRODUCTS, not spreadsheets.
// ══════════════════════════════════════════════════════════════

import type { ProductBlueprint, BlueprintTab, BlueprintChart } from "@/types/factory";

// ── Core Types ───────────────────────────────────────────────

export type SectionType =
  | "title-bar"
  | "subtitle-bar"
  | "kpi-row"
  | "section-header"
  | "column-headers"
  | "data-row"
  | "totals-row"
  | "chart-zone"
  | "spacer"
  | "tip"
  | "progress-bar";

export interface CellStyle {
  background: string;    // hex color
  textColor: string;     // hex color
  fontSize: number;
  bold: boolean;
  italic?: boolean;
  alignment: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  numberFormat?: string; // e.g. "$#,##0.00", "0%"
  border?: "none" | "thin" | "medium" | "thick";
  borderColor?: string;
  fontFamily?: string;
  wrapText?: boolean;
}

export interface SheetSection {
  type: SectionType;
  label: string;
  row: number;           // 1-indexed
  col: number;           // 1-indexed
  rows: number;          // span
  cols: number;          // span
  style: CellStyle;
  height?: number;       // row height in pixels
  merge?: boolean;       // merge all cells in this range
  cells?: SectionCell[]; // specific cell overrides within this section
}

/** Override styling/value for a specific cell within a section */
export interface SectionCell {
  row: number;           // absolute 1-indexed
  col: number;           // absolute 1-indexed
  colSpan?: number;      // merge across columns
  style?: Partial<CellStyle>;
  value?: string | number | null;
  formula?: string;
}

export interface ChartPlacement {
  type: "donut" | "pie" | "column" | "bar" | "line";
  title: string;
  row: number;
  col: number;
  width: number;
  height: number;
  sourceSheetIndex: number;
  labelRange: { startRow: number; endRow: number; startCol: number; endCol: number };
  dataRange: { startRow: number; endRow: number; startCol: number; endCol: number };
}

export interface SheetLayout {
  sheetName: string;
  totalColumns: number;
  totalRows: number;
  sections: SheetSection[];
  columnWidths: number[];
  chartPlacements: ChartPlacement[];
  frozenRows?: number;
  frozenCols?: number;
  sheetBackground?: string;
}

export interface SpreadsheetLayout {
  sheets: SheetLayout[];
  theme: DesignTheme;
}

// ── Design Themes ────────────────────────────────────────────
// Light, pastel themes that match Etsy bestseller aesthetics.
// Each theme has 30+ tokens for complete visual control.

export interface DesignTheme {
  name: string;
  id: string;

  // Page
  pageBg: string;
  cardBg: string;

  // Title bar
  titleBg: string;
  titleText: string;
  titleFontSize: number;
  subtitleBg: string;
  subtitleText: string;

  // KPI cards (4 distinct colors for visual variety)
  kpi: [KpiStyle, KpiStyle, KpiStyle, KpiStyle];

  // Section headers (4 pastel variants for visual grouping)
  sections: [SectionColor, SectionColor, SectionColor, SectionColor];

  // Table
  headerBg: string;
  headerText: string;
  headerFontSize: number;
  rowBg: string;
  rowAlt: string;
  dataText: string;
  dataFontSize: number;
  totalsBg: string;
  totalsText: string;
  totalsFontSize: number;

  // Borders
  borderLight: string;
  borderMedium: string;

  // Accents
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;

  // Text
  mutedText: string;
  accentText: string;

  // Font
  fontFamily: string;
}

interface KpiStyle { bg: string; text: string; label: string; }
interface SectionColor { bg: string; text: string; }

// ── Theme Definitions ────────────────────────────────────────

const BASE_THEME: Omit<DesignTheme, "name" | "id" | "titleBg" | "titleText" | "subtitleBg" | "subtitleText" | "kpi" | "sections" | "headerBg" | "headerText" | "rowAlt" | "totalsBg" | "totalsText" | "borderLight" | "borderMedium" | "accentText"> = {
  pageBg: "#FFFFFF",
  cardBg: "#FAFAFA",
  titleFontSize: 18,
  headerFontSize: 10,
  dataText: "#212529",
  dataFontSize: 11,
  totalsFontSize: 11,
  rowBg: "#FFFFFF",
  success: "#16A34A",
  successBg: "#DCFCE7",
  warning: "#D97706",
  warningBg: "#FEF3C7",
  danger: "#DC2626",
  dangerBg: "#FEE2E2",
  mutedText: "#6B7280",
  fontFamily: "Inter, Calibri, Arial, sans-serif",
};

export const THEMES: Record<string, DesignTheme> = {
  "pastel-classic": {
    ...BASE_THEME,
    name: "Pastel Classic",
    id: "pastel-classic",
    titleBg: "#5B8A5F",
    titleText: "#FFFFFF",
    subtitleBg: "#E8F5E8",
    subtitleText: "#2D5A2D",
    kpi: [
      { bg: "#D5F0D5", text: "#166534", label: "#4ADE80" },
      { bg: "#FEE2E2", text: "#991B1B", label: "#FCA5A5" },
      { bg: "#FEF3C7", text: "#92400E", label: "#FCD34D" },
      { bg: "#DBEAFE", text: "#1E40AF", label: "#93C5FD" },
    ],
    sections: [
      { bg: "#FECDD3", text: "#9F1239" },
      { bg: "#D1FAE5", text: "#065F46" },
      { bg: "#DBEAFE", text: "#1E3A8A" },
      { bg: "#FEF3C7", text: "#78350F" },
    ],
    headerBg: "#F1F5F9",
    headerText: "#334155",
    rowAlt: "#F8FAFC",
    totalsBg: "#E2E8F0",
    totalsText: "#0F172A",
    borderLight: "#E2E8F0",
    borderMedium: "#CBD5E1",
    accentText: "#059669",
  },
  "soft-sage": {
    ...BASE_THEME,
    name: "Soft Sage",
    id: "soft-sage",
    titleBg: "#6B8E6B",
    titleText: "#FFFFFF",
    subtitleBg: "#E0EED8",
    subtitleText: "#2D4A2D",
    kpi: [
      { bg: "#D1FAE5", text: "#065F46", label: "#34D399" },
      { bg: "#FFE4E6", text: "#881337", label: "#FDA4AF" },
      { bg: "#FEF9C3", text: "#713F12", label: "#FDE047" },
      { bg: "#E0E7FF", text: "#3730A3", label: "#A5B4FC" },
    ],
    sections: [
      { bg: "#FCE7F3", text: "#9D174D" },
      { bg: "#D1FAE5", text: "#065F46" },
      { bg: "#E0E7FF", text: "#3730A3" },
      { bg: "#FEF9C3", text: "#713F12" },
    ],
    headerBg: "#E4EAE0",
    headerText: "#2D4A2D",
    rowAlt: "#F4F8F2",
    totalsBg: "#C8DCC0",
    totalsText: "#1A2E1A",
    borderLight: "#D0DCC8",
    borderMedium: "#B0C4A8",
    accentText: "#2D5A3E",
  },
  "blush-pink": {
    ...BASE_THEME,
    name: "Blush Pink",
    id: "blush-pink",
    titleBg: "#D4818A",
    titleText: "#FFFFFF",
    subtitleBg: "#FDE8EA",
    subtitleText: "#881337",
    kpi: [
      { bg: "#D1FAE5", text: "#065F46", label: "#34D399" },
      { bg: "#FFE4E6", text: "#881337", label: "#FDA4AF" },
      { bg: "#FFF7ED", text: "#7C2D12", label: "#FDBA74" },
      { bg: "#EDE9FE", text: "#5B21B6", label: "#C4B5FD" },
    ],
    sections: [
      { bg: "#FCE7F3", text: "#9D174D" },
      { bg: "#CCFBF1", text: "#115E59" },
      { bg: "#EDE9FE", text: "#5B21B6" },
      { bg: "#FFF7ED", text: "#7C2D12" },
    ],
    headerBg: "#F5E6E8",
    headerText: "#4A2020",
    rowAlt: "#FFF5F5",
    totalsBg: "#E8C8CC",
    totalsText: "#1A1A1A",
    borderLight: "#F0D0D4",
    borderMedium: "#E0B0B8",
    accentText: "#BE185D",
  },
  "ocean-blue": {
    ...BASE_THEME,
    name: "Ocean Blue",
    id: "ocean-blue",
    titleBg: "#2563EB",
    titleText: "#FFFFFF",
    subtitleBg: "#DBEAFE",
    subtitleText: "#1E3A8A",
    kpi: [
      { bg: "#D1FAE5", text: "#065F46", label: "#34D399" },
      { bg: "#FEE2E2", text: "#991B1B", label: "#FCA5A5" },
      { bg: "#FEF3C7", text: "#92400E", label: "#FCD34D" },
      { bg: "#DBEAFE", text: "#1E40AF", label: "#93C5FD" },
    ],
    sections: [
      { bg: "#FCE7F3", text: "#9D174D" },
      { bg: "#CCFBF1", text: "#115E59" },
      { bg: "#DBEAFE", text: "#1E3A8A" },
      { bg: "#FEF3C7", text: "#78350F" },
    ],
    headerBg: "#E0EAFF",
    headerText: "#1E3A5F",
    rowAlt: "#F0F7FF",
    totalsBg: "#BFDBFE",
    totalsText: "#1E3A8A",
    borderLight: "#C8D8E8",
    borderMedium: "#93B4D4",
    accentText: "#2563EB",
  },
  "lavender": {
    ...BASE_THEME,
    name: "Lavender Dream",
    id: "lavender",
    titleBg: "#7C3AED",
    titleText: "#FFFFFF",
    subtitleBg: "#EDE9FE",
    subtitleText: "#5B21B6",
    kpi: [
      { bg: "#D1FAE5", text: "#065F46", label: "#34D399" },
      { bg: "#FEE2E2", text: "#991B1B", label: "#FCA5A5" },
      { bg: "#FEF3C7", text: "#92400E", label: "#FCD34D" },
      { bg: "#EDE9FE", text: "#5B21B6", label: "#C4B5FD" },
    ],
    sections: [
      { bg: "#FCE7F3", text: "#9D174D" },
      { bg: "#D1FAE5", text: "#065F46" },
      { bg: "#EDE9FE", text: "#5B21B6" },
      { bg: "#FEF9C3", text: "#713F12" },
    ],
    headerBg: "#EDE9FE",
    headerText: "#3B0764",
    rowAlt: "#F5F3FF",
    totalsBg: "#C4B5FD",
    totalsText: "#1E1B4B",
    borderLight: "#DDD6FE",
    borderMedium: "#C4B5FD",
    accentText: "#7C3AED",
  },
  "minimal": {
    ...BASE_THEME,
    name: "Minimal Monochrome",
    id: "minimal",
    titleBg: "#18181B",
    titleText: "#FFFFFF",
    subtitleBg: "#F4F4F5",
    subtitleText: "#3F3F46",
    kpi: [
      { bg: "#F0FDF4", text: "#166534", label: "#86EFAC" },
      { bg: "#FEF2F2", text: "#991B1B", label: "#FCA5A5" },
      { bg: "#FFFBEB", text: "#92400E", label: "#FDE68A" },
      { bg: "#EFF6FF", text: "#1E40AF", label: "#93C5FD" },
    ],
    sections: [
      { bg: "#FEF2F2", text: "#991B1B" },
      { bg: "#F0FDF4", text: "#166534" },
      { bg: "#EFF6FF", text: "#1E40AF" },
      { bg: "#FFFBEB", text: "#92400E" },
    ],
    headerBg: "#F4F4F5",
    headerText: "#18181B",
    rowAlt: "#FAFAFA",
    totalsBg: "#E4E4E7",
    totalsText: "#18181B",
    borderLight: "#E4E4E7",
    borderMedium: "#D4D4D8",
    accentText: "#18181B",
  },
};

// ── Layout Constants ─────────────────────────────────────────

/** Dashboard uses 12 columns for flexible 2-panel layouts */
const DASH_COLS = 12;

/** Column widths for the premium dashboard (pixels) */
const DASH_COL_WIDTHS = [
  30,   // A: left gutter
  170,  // B: primary labels
  110,  // C: values
  110,  // D: values
  100,  // E: values / status
  100,  // F: extra
  24,   // G: center gutter (panel separator)
  170,  // H: secondary labels
  110,  // I: values
  110,  // J: values
  100,  // K: values / status
  110,  // L: extra
];

/** Standard row heights */
const ROW_H = {
  titleBar: 48,
  subtitle: 28,
  spacerLg: 16,
  spacerMd: 10,
  spacerSm: 6,
  kpiLabel: 24,
  kpiValue: 48,
  sectionHeader: 32,
  columnHeader: 26,
  dataRow: 26,
  totalsRow: 28,
  chartRow: 24,
  tip: 28,
} as const;

// ── Theme Resolver ───────────────────────────────────────────

/** Map blueprint colorScheme.primary to a theme key */
export function resolveTheme(blueprint: ProductBlueprint): DesignTheme {
  const p = blueprint.colorScheme?.primary?.toLowerCase() ?? "";
  if (p.includes("4a7c59") || p.includes("6b8e6b") || p.includes("5b8a5f")) return THEMES["soft-sage"];
  if (p.includes("9b5e56") || p.includes("d4818a") || p.includes("e8b4b4")) return THEMES["blush-pink"];
  if (p.includes("1a5276") || p.includes("2563eb") || p.includes("3498db")) return THEMES["ocean-blue"];
  if (p.includes("5b4a90") || p.includes("7c3aed") || p.includes("9b8fd0")) return THEMES["lavender"];
  if (p.includes("1a1a1a") || p.includes("18181b")) return THEMES["minimal"];
  return THEMES["pastel-classic"];
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD LAYOUT GENERATOR
// Transforms a ProductBlueprint's Dashboard tab into a premium
// visual layout with KPI cards, two-panel data, and chart zones.
// ══════════════════════════════════════════════════════════════

export function generateDashboardLayout(
  blueprint: ProductBlueprint,
  theme: DesignTheme
): SheetLayout {
  const sections: SheetSection[] = [];
  const dashTab = blueprint.tabs.find(t => t.name === "Dashboard");
  if (!dashTab) {
    return { sheetName: "Dashboard", totalColumns: DASH_COLS, totalRows: 1, sections: [], columnWidths: DASH_COL_WIDTHS, chartPlacements: [] };
  }

  // Extract data from blueprint
  const sampleRows = dashTab.sampleRows;
  const dashTitle = (sampleRows[0]?.[0] as string) || "📊 BUDGET DASHBOARD";
  const dashSubtitle = (sampleRows[1]?.[0] as string) || "";

  // Count data sections
  const savingsGoals = blueprint.tabs.find(t => t.name === "Savings Goals");
  const numGoals = savingsGoals ? Math.min(savingsGoals.sampleRows.length, 6) : 5;
  const numBuckets = 4; // standard bucket count

  let row = 1;

  // ── TITLE BAR ──────────────────────────────────────────────
  sections.push({
    type: "title-bar",
    label: dashTitle,
    row, col: 1, rows: 1, cols: DASH_COLS,
    style: { background: theme.titleBg, textColor: theme.titleText, fontSize: theme.titleFontSize, bold: true, alignment: "center", fontFamily: theme.fontFamily },
    height: ROW_H.titleBar,
    merge: true,
  });
  row++;

  // ── SUBTITLE BAR ───────────────────────────────────────────
  sections.push({
    type: "subtitle-bar",
    label: dashSubtitle,
    row, col: 1, rows: 1, cols: DASH_COLS,
    style: { background: theme.subtitleBg, textColor: theme.subtitleText, fontSize: 11, bold: false, alignment: "center", fontFamily: theme.fontFamily },
    height: ROW_H.subtitle,
    merge: true,
  });
  row++;

  // ── SPACER ─────────────────────────────────────────────────
  sections.push(spacer(row, DASH_COLS, theme, ROW_H.spacerLg));
  row++;

  // ── CONTROLS ROW (month selector + income) ─────────────────
  sections.push({
    type: "kpi-row",
    label: "CONTROLS",
    row, col: 1, rows: 1, cols: DASH_COLS,
    style: { background: theme.pageBg, textColor: theme.dataText, fontSize: 11, bold: true, alignment: "left", fontFamily: theme.fontFamily },
    height: 34,
    cells: [
      { row, col: 2, style: { bold: true, fontSize: 10, textColor: theme.mutedText } },
      { row, col: 3, style: { bold: true, fontSize: 13, textColor: theme.accentText } },
      { row, col: 8, style: { bold: true, fontSize: 10, textColor: theme.mutedText } },
      { row, col: 9, style: { bold: true, fontSize: 15, textColor: theme.accentText } },
    ],
  });
  row++;

  // ── SPACER ─────────────────────────────────────────────────
  sections.push(spacer(row, DASH_COLS, theme, ROW_H.spacerMd));
  row++;

  // ── KPI CARDS (4 metrics in a row) ─────────────────────────
  // Row 1: Labels (small text)
  const kpiLabels = ["💰 TOTAL INCOME", "💸 TOTAL SPENT", "💵 NET SAVINGS", "📊 SAVINGS RATE"];
  const kpiLabelCells: SectionCell[] = [];
  const kpiPositions = [
    { col: 2, span: 2 },  // B:C
    { col: 4, span: 2 },  // D:E
    { col: 8, span: 2 },  // H:I (skip gutter)
    { col: 10, span: 2 }, // J:K
  ];

  kpiPositions.forEach((pos, i) => {
    kpiLabelCells.push({
      row, col: pos.col, colSpan: pos.span,
      value: kpiLabels[i],
      style: { background: theme.kpi[i].bg, textColor: theme.kpi[i].text, fontSize: 9, bold: true, alignment: "center" },
    });
  });

  sections.push({
    type: "kpi-row",
    label: "KPI_LABELS",
    row, col: 1, rows: 1, cols: DASH_COLS,
    style: { background: theme.pageBg, textColor: theme.mutedText, fontSize: 9, bold: true, alignment: "center", fontFamily: theme.fontFamily },
    height: ROW_H.kpiLabel,
    cells: kpiLabelCells,
  });
  row++;

  // Row 2: Values (large numbers)
  const kpiValueCells: SectionCell[] = [];
  kpiPositions.forEach((pos, i) => {
    kpiValueCells.push({
      row, col: pos.col, colSpan: pos.span,
      style: { background: theme.kpi[i].bg, textColor: theme.kpi[i].text, fontSize: 22, bold: true, alignment: "center" },
    });
  });

  sections.push({
    type: "kpi-row",
    label: "KPI_VALUES",
    row, col: 1, rows: 1, cols: DASH_COLS,
    style: { background: theme.pageBg, textColor: theme.dataText, fontSize: 22, bold: true, alignment: "center", fontFamily: theme.fontFamily },
    height: ROW_H.kpiValue,
    cells: kpiValueCells,
  });
  row++;

  // ── SPACER ─────────────────────────────────────────────────
  sections.push(spacer(row, DASH_COLS, theme, ROW_H.spacerLg));
  row++;

  // ── TWO-PANEL SECTION HEADERS ──────────────────────────────
  // Left: Savings Goals (pink/section[0]) | Right: Spending (blue/section[2])
  sections.push({
    type: "section-header",
    label: "DUAL_HEADERS",
    row, col: 1, rows: 1, cols: DASH_COLS,
    style: { background: theme.pageBg, textColor: theme.dataText, fontSize: 11, bold: true, alignment: "center", fontFamily: theme.fontFamily },
    height: ROW_H.sectionHeader,
    cells: [
      { row, col: 2, colSpan: 5, value: "🎯 SAVINGS GOALS", style: { background: theme.sections[0].bg, textColor: theme.sections[0].text, fontSize: 11, bold: true, alignment: "center" } },
      { row, col: 8, colSpan: 5, value: "💳 WHERE YOUR MONEY WENT", style: { background: theme.sections[2].bg, textColor: theme.sections[2].text, fontSize: 11, bold: true, alignment: "center" } },
    ],
  });
  row++;

  // ── COLUMN HEADERS ─────────────────────────────────────────
  sections.push({
    type: "column-headers",
    label: "TABLE_HEADERS",
    row, col: 1, rows: 1, cols: DASH_COLS,
    style: { background: theme.headerBg, textColor: theme.headerText, fontSize: theme.headerFontSize, bold: true, alignment: "center", fontFamily: theme.fontFamily, border: "thin", borderColor: theme.borderLight },
    height: ROW_H.columnHeader,
    cells: [
      // Left panel headers
      { row, col: 2, value: "GOAL", style: { alignment: "left" } },
      { row, col: 3, value: "TARGET" },
      { row, col: 4, value: "SAVED" },
      { row, col: 5, value: "REMAINING" },
      { row, col: 6, value: "PROGRESS" },
      // Right panel headers
      { row, col: 8, value: "CATEGORY", style: { alignment: "left" } },
      { row, col: 9, value: "BUDGETED" },
      { row, col: 10, value: "SPENT" },
      { row, col: 11, value: "LEFT" },
      { row, col: 12, value: "STATUS" },
    ],
  });
  row++;

  // ── DATA ROWS (goals left, spending right) ─────────────────
  const dataRowCount = Math.max(numGoals, numBuckets);
  for (let i = 0; i < dataRowCount; i++) {
    const bg = i % 2 === 0 ? theme.rowBg : theme.rowAlt;
    sections.push({
      type: "data-row",
      label: `data_${i}`,
      row, col: 1, rows: 1, cols: DASH_COLS,
      style: { background: bg, textColor: theme.dataText, fontSize: theme.dataFontSize, bold: false, alignment: "left", fontFamily: theme.fontFamily, border: "thin", borderColor: theme.borderLight },
      height: ROW_H.dataRow,
      cells: [
        // Left panel: goals
        { row, col: 2, style: { alignment: "left" } },
        { row, col: 3, style: { alignment: "right", numberFormat: "$#,##0" } },
        { row, col: 4, style: { alignment: "right", numberFormat: "$#,##0" } },
        { row, col: 5, style: { alignment: "right", numberFormat: "$#,##0" } },
        { row, col: 6, style: { alignment: "center", numberFormat: "0%" } },
        // Right panel: spending
        { row, col: 8, style: { alignment: "left" } },
        { row, col: 9, style: { alignment: "right", numberFormat: "$#,##0" } },
        { row, col: 10, style: { alignment: "right", numberFormat: "$#,##0" } },
        { row, col: 11, style: { alignment: "right", numberFormat: "$#,##0" } },
        { row, col: 12, style: { alignment: "center", bold: true } },
      ],
    });
    row++;
  }

  // ── TOTALS ROW ─────────────────────────────────────────────
  sections.push({
    type: "totals-row",
    label: "TOTALS",
    row, col: 1, rows: 1, cols: DASH_COLS,
    style: { background: theme.totalsBg, textColor: theme.totalsText, fontSize: theme.totalsFontSize, bold: true, alignment: "left", fontFamily: theme.fontFamily, border: "medium", borderColor: theme.borderMedium },
    height: ROW_H.totalsRow,
  });
  row++;

  // ── SPACER ─────────────────────────────────────────────────
  sections.push(spacer(row, DASH_COLS, theme, ROW_H.spacerLg));
  row++;

  // ── GOAL ALLOCATION SECTION ────────────────────────────────
  sections.push({
    type: "section-header",
    label: "📊 BUDGET ALLOCATION",
    row, col: 2, rows: 1, cols: 5,
    style: { background: theme.sections[3].bg, textColor: theme.sections[3].text, fontSize: 11, bold: true, alignment: "center", fontFamily: theme.fontFamily },
    height: ROW_H.sectionHeader,
    merge: true,
  });
  row++;

  // Allocation headers
  sections.push({
    type: "column-headers",
    label: "ALLOC_HEADERS",
    row, col: 2, rows: 1, cols: 5,
    style: { background: theme.headerBg, textColor: theme.headerText, fontSize: theme.headerFontSize, bold: true, alignment: "center", fontFamily: theme.fontFamily, border: "thin", borderColor: theme.borderLight },
    height: ROW_H.columnHeader,
    cells: [
      { row, col: 2, value: "BUCKET", style: { alignment: "left" } },
      { row, col: 3, value: "% GOAL" },
      { row, col: 4, value: "$ GOAL" },
      { row, col: 5, value: "% ACTUAL" },
      { row, col: 6, value: "$ ACTUAL" },
    ],
  });
  row++;

  // Allocation data rows (4 buckets)
  for (let i = 0; i < numBuckets; i++) {
    const bg = i % 2 === 0 ? theme.rowBg : theme.rowAlt;
    sections.push({
      type: "data-row",
      label: `alloc_${i}`,
      row, col: 2, rows: 1, cols: 5,
      style: { background: bg, textColor: theme.dataText, fontSize: theme.dataFontSize, bold: false, alignment: "left", fontFamily: theme.fontFamily, border: "thin", borderColor: theme.borderLight },
      height: ROW_H.dataRow,
      cells: [
        { row, col: 2, style: { alignment: "left" } },
        { row, col: 3, style: { alignment: "center", numberFormat: "0%" } },
        { row, col: 4, style: { alignment: "right", numberFormat: "$#,##0" } },
        { row, col: 5, style: { alignment: "center", numberFormat: "0%" } },
        { row, col: 6, style: { alignment: "right", numberFormat: "$#,##0" } },
      ],
    });
    row++;
  }

  // Allocation totals
  sections.push({
    type: "totals-row",
    label: "ALLOC_TOTAL",
    row, col: 2, rows: 1, cols: 5,
    style: { background: theme.totalsBg, textColor: theme.totalsText, fontSize: theme.totalsFontSize, bold: true, alignment: "left", fontFamily: theme.fontFamily, border: "medium", borderColor: theme.borderMedium },
    height: ROW_H.totalsRow,
  });
  row++;

  // ── SPACER BEFORE CHARTS ───────────────────────────────────
  sections.push(spacer(row, DASH_COLS, theme, ROW_H.spacerLg));
  row++;

  // ── CHART ZONE ─────────────────────────────────────────────
  const chartStartRow = row;
  const chartRowCount = 14; // reserve 14 rows for charts
  for (let i = 0; i < chartRowCount; i++) {
    sections.push({
      type: "chart-zone",
      label: "",
      row: row + i, col: 1, rows: 1, cols: DASH_COLS,
      style: { background: theme.pageBg, textColor: theme.pageBg, fontSize: 8, bold: false, alignment: "left", fontFamily: theme.fontFamily },
      height: ROW_H.chartRow,
    });
  }
  row += chartRowCount;

  // ── TIP ────────────────────────────────────────────────────
  sections.push({
    type: "tip",
    label: "💡 TIP: Select a data table → Insert → Chart to create stunning visualizations!",
    row, col: 1, rows: 1, cols: DASH_COLS,
    style: { background: theme.pageBg, textColor: theme.mutedText, fontSize: 10, bold: false, italic: true, alignment: "left", fontFamily: theme.fontFamily },
    height: ROW_H.tip,
    merge: true,
  });
  row++;

  // ── Chart placements ───────────────────────────────────────
  const chartPlacements: ChartPlacement[] = [];

  // Savings Goal Progress donut (left)
  if (savingsGoals) {
    chartPlacements.push({
      type: "donut",
      title: "Savings Goal Progress",
      row: chartStartRow,
      col: 1,
      width: 460,
      height: 320,
      sourceSheetIndex: blueprint.tabs.findIndex(t => t.name === "Savings Goals"),
      labelRange: { startRow: 1, endRow: 1 + numGoals, startCol: 0, endCol: 1 },
      dataRange: { startRow: 1, endRow: 1 + numGoals, startCol: 2, endCol: 3 },
    });
  }

  // Spending breakdown donut (right)
  chartPlacements.push({
    type: "donut",
    title: "Where My Money Went",
    row: chartStartRow,
    col: 6,
    width: 460,
    height: 320,
    sourceSheetIndex: blueprint.tabs.findIndex(t => t.name === "Monthly Summary"),
    labelRange: { startRow: 1, endRow: 13, startCol: 0, endCol: 1 },
    dataRange: { startRow: 1, endRow: 13, startCol: 1, endCol: 2 },
  });

  // Monthly trend column chart (full width, below donuts)
  chartPlacements.push({
    type: "column",
    title: "Budget vs Actual by Month",
    row: chartStartRow + 11,
    col: 1,
    width: 920,
    height: 320,
    sourceSheetIndex: blueprint.tabs.findIndex(t => t.name === "Monthly Summary"),
    labelRange: { startRow: 1, endRow: 13, startCol: 0, endCol: 1 },
    dataRange: { startRow: 1, endRow: 13, startCol: 1, endCol: 2 },
  });

  return {
    sheetName: "Dashboard",
    totalColumns: DASH_COLS,
    totalRows: row - 1,
    sections,
    columnWidths: DASH_COL_WIDTHS,
    chartPlacements,
    frozenRows: 2,
  };
}

// ══════════════════════════════════════════════════════════════
// DATA TAB LAYOUT GENERATOR
// Creates premium layouts for Transactions, Budget Setup,
// Monthly Summary, Savings Goals, and custom tabs.
// ══════════════════════════════════════════════════════════════

export function generateDataTabLayout(
  tab: BlueprintTab,
  tabIndex: number,
  theme: DesignTheme
): SheetLayout {
  const sections: SheetSection[] = [];
  const numCols = Math.max(tab.columns.length, 1);
  const numDataRows = tab.sampleRows.length;

  // Calculate column widths
  const columnWidths: number[] = tab.columns.map(col => {
    if (col.width) return col.width;
    switch (col.type) {
      case "text": return 180;
      case "currency": return 120;
      case "percent": return 90;
      case "date": return 120;
      case "formula": return 130;
      case "number": return 100;
      default: return 140;
    }
  });

  let row = 1;

  // ── TAB TITLE BAR ──────────────────────────────────────────
  sections.push({
    type: "title-bar",
    label: tab.name.toUpperCase(),
    row, col: 1, rows: 1, cols: numCols,
    style: { background: theme.titleBg, textColor: theme.titleText, fontSize: 14, bold: true, alignment: "left", fontFamily: theme.fontFamily },
    height: 36,
    merge: true,
  });
  row++;

  // ── SPACER ─────────────────────────────────────────────────
  sections.push(spacer(row, numCols, theme, ROW_H.spacerSm));
  row++;

  // ── COLUMN HEADERS ─────────────────────────────────────────
  const headerCells: SectionCell[] = tab.columns.map((col, ci) => ({
    row, col: ci + 1,
    value: col.name,
    style: {
      alignment: (col.type === "currency" || col.type === "number") ? "right" as const
        : col.type === "percent" ? "center" as const
        : "left" as const,
    },
  }));

  sections.push({
    type: "column-headers",
    label: "HEADERS",
    row, col: 1, rows: 1, cols: numCols,
    style: { background: theme.headerBg, textColor: theme.headerText, fontSize: theme.headerFontSize, bold: true, alignment: "center", fontFamily: theme.fontFamily, border: "thin", borderColor: theme.borderLight },
    height: ROW_H.columnHeader,
    cells: headerCells,
  });
  row++;

  // ── DATA ROWS ──────────────────────────────────────────────
  for (let i = 0; i < numDataRows; i++) {
    const bg = i % 2 === 0 ? theme.rowBg : theme.rowAlt;

    const dataCells: SectionCell[] = tab.columns.map((col, ci) => ({
      row, col: ci + 1,
      style: {
        alignment: (col.type === "currency" || col.type === "number") ? "right" as const
          : col.type === "percent" ? "center" as const
          : col.type === "date" ? "center" as const
          : "left" as const,
        numberFormat: col.type === "currency" ? "$#,##0.00"
          : col.type === "percent" ? "0%"
          : col.type === "date" ? "yyyy-mm-dd"
          : col.type === "number" ? "#,##0"
          : undefined,
      },
    }));

    sections.push({
      type: "data-row",
      label: `row_${i}`,
      row, col: 1, rows: 1, cols: numCols,
      style: { background: bg, textColor: theme.dataText, fontSize: theme.dataFontSize, bold: false, alignment: "left", fontFamily: theme.fontFamily, border: "thin", borderColor: theme.borderLight },
      height: ROW_H.dataRow,
      cells: dataCells,
    });
    row++;
  }

  // ── EMPTY ROWS FOR USER DATA ENTRY ─────────────────────────
  // Add styled empty rows so the sheet doesn't look bare
  const isDataEntry = tab.name.toLowerCase().includes("transaction") ||
    tab.name.toLowerCase().includes("log") ||
    tab.name.toLowerCase().includes("entries");
  if (isDataEntry) {
    const emptyRowCount = Math.max(50 - numDataRows, 20);
    for (let i = 0; i < emptyRowCount; i++) {
      const bg = (numDataRows + i) % 2 === 0 ? theme.rowBg : theme.rowAlt;
      sections.push({
        type: "data-row",
        label: `empty_${i}`,
        row, col: 1, rows: 1, cols: numCols,
        style: { background: bg, textColor: theme.dataText, fontSize: theme.dataFontSize, bold: false, alignment: "left", fontFamily: theme.fontFamily, border: "thin", borderColor: theme.borderLight },
        height: ROW_H.dataRow,
      });
      row++;
    }
  }

  return {
    sheetName: tab.name,
    totalColumns: numCols,
    totalRows: row - 1,
    sections,
    columnWidths,
    chartPlacements: [],
    frozenRows: tab.features.includes("frozen_header") ? 3 : undefined, // row 1=title, row 2=spacer, row 3=headers
  };
}

// ══════════════════════════════════════════════════════════════
// SETUP/INSTRUCTIONS TAB LAYOUT
// Premium-looking instructions page with visual sections
// ══════════════════════════════════════════════════════════════

export function generateSetupTabLayout(
  tab: BlueprintTab,
  tabIndex: number,
  theme: DesignTheme
): SheetLayout {
  const sections: SheetSection[] = [];
  const numCols = 6;
  const columnWidths = [30, 80, 300, 200, 150, 30]; // gutter + content + gutter

  let row = 1;

  // Title
  sections.push({
    type: "title-bar",
    label: tab.sampleRows[0]?.[0] as string || tab.name,
    row, col: 1, rows: 1, cols: numCols,
    style: { background: theme.titleBg, textColor: theme.titleText, fontSize: 16, bold: true, alignment: "center", fontFamily: theme.fontFamily },
    height: ROW_H.titleBar,
    merge: true,
  });
  row++;

  // Subtitle
  sections.push({
    type: "subtitle-bar",
    label: tab.sampleRows[1]?.[0] as string || "Setup & Instructions",
    row, col: 1, rows: 1, cols: numCols,
    style: { background: theme.subtitleBg, textColor: theme.subtitleText, fontSize: 12, bold: true, alignment: "center", fontFamily: theme.fontFamily },
    height: ROW_H.subtitle,
    merge: true,
  });
  row++;

  sections.push(spacer(row, numCols, theme, ROW_H.spacerLg));
  row++;

  // Content rows
  for (let i = 2; i < tab.sampleRows.length; i++) {
    const content = tab.sampleRows[i]?.[0] as string | null;
    if (content === null || content === undefined) {
      sections.push(spacer(row, numCols, theme, ROW_H.spacerSm));
      row++;
      continue;
    }

    const isHeader = content.startsWith("📋") || content.startsWith("📊") || content.startsWith("🔗") || content.startsWith("✨");
    const isBullet = content.startsWith("•") || content.startsWith("1.") || content.startsWith("2.") || content.startsWith("3.") || content.startsWith("4.") || content.startsWith("5.") || content.startsWith("6.");

    if (isHeader) {
      sections.push({
        type: "section-header",
        label: content,
        row, col: 2, rows: 1, cols: 4,
        style: {
          background: theme.sections[i % 4].bg,
          textColor: theme.sections[i % 4].text,
          fontSize: 12, bold: true, alignment: "left", fontFamily: theme.fontFamily,
        },
        height: 30,
        merge: true,
      });
    } else {
      sections.push({
        type: "data-row",
        label: content,
        row, col: 2, rows: 1, cols: 4,
        style: {
          background: isBullet ? theme.rowAlt : theme.pageBg,
          textColor: isBullet ? theme.dataText : theme.mutedText,
          fontSize: 11, bold: false, alignment: "left", fontFamily: theme.fontFamily,
          wrapText: true,
        },
        height: 24,
        merge: true,
      });
    }
    row++;
  }

  return {
    sheetName: tab.name,
    totalColumns: numCols,
    totalRows: row - 1,
    sections,
    columnWidths,
    chartPlacements: [],
  };
}

// ══════════════════════════════════════════════════════════════
// FULL SPREADSHEET LAYOUT GENERATOR
// Creates layouts for ALL tabs in the blueprint.
// ══════════════════════════════════════════════════════════════

export function generateSpreadsheetLayout(blueprint: ProductBlueprint): SpreadsheetLayout {
  const theme = resolveTheme(blueprint);
  const sheets: SheetLayout[] = [];

  for (let i = 0; i < blueprint.tabs.length; i++) {
    const tab = blueprint.tabs[i];
    const nameLower = tab.name.toLowerCase();

    if (nameLower === "dashboard") {
      sheets.push(generateDashboardLayout(blueprint, theme));
    } else if (nameLower.includes("setup") && (nameLower.includes("instruction") || nameLower.includes("&"))) {
      sheets.push(generateSetupTabLayout(tab, i, theme));
    } else {
      sheets.push(generateDataTabLayout(tab, i, theme));
    }
  }

  return { sheets, theme };
}

// ══════════════════════════════════════════════════════════════
// GWS BATCH REQUEST CONVERTER
// Converts SheetLayout → Google Sheets API batchUpdate requests
// ══════════════════════════════════════════════════════════════

export function layoutToGwsRequests(layout: SheetLayout, sheetId: number = 0): object[] {
  const requests: object[] = [];

  // ── Column widths ──────────────────────────────────────────
  for (let i = 0; i < layout.columnWidths.length; i++) {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: layout.columnWidths[i] },
        fields: "pixelSize",
      },
    });
  }

  // ── Frozen rows/cols ───────────────────────────────────────
  if (layout.frozenRows || layout.frozenCols) {
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            ...(layout.frozenRows ? { frozenRowCount: layout.frozenRows } : {}),
            ...(layout.frozenCols ? { frozenColumnCount: layout.frozenCols } : {}),
          },
        },
        fields: [
          layout.frozenRows ? "gridProperties.frozenRowCount" : "",
          layout.frozenCols ? "gridProperties.frozenColumnCount" : "",
        ].filter(Boolean).join(","),
      },
    });
  }

  // ── Process sections ───────────────────────────────────────
  for (const section of layout.sections) {
    const rowIdx = section.row - 1;
    const colStart = section.col - 1;
    const colEnd = colStart + section.cols;

    // Row height
    if (section.height) {
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: "ROWS", startIndex: rowIdx, endIndex: rowIdx + 1 },
          properties: { pixelSize: section.height },
          fields: "pixelSize",
        },
      });
    }

    // Merge
    if (section.merge) {
      requests.push({
        mergeCells: {
          range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: colStart, endColumnIndex: colEnd },
          mergeType: "MERGE_ALL",
        },
      });
    }

    // Base styling for the section row
    if (section.type !== "chart-zone") {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: colStart, endColumnIndex: colEnd },
          cell: {
            userEnteredFormat: {
              backgroundColor: hexToRgb(section.style.background),
              textFormat: {
                foregroundColor: hexToRgb(section.style.textColor),
                bold: section.style.bold,
                italic: section.style.italic || false,
                fontSize: section.style.fontSize,
                fontFamily: section.style.fontFamily || "Inter, Arial, sans-serif",
              },
              horizontalAlignment: section.style.alignment.toUpperCase(),
              verticalAlignment: (section.style.verticalAlign || "middle").toUpperCase(),
              wrapStrategy: section.style.wrapText ? "WRAP" : "OVERFLOW_OR_ELLIPSIS",
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)",
        },
      });
    }

    // Section borders
    if (section.style.border && section.style.border !== "none") {
      const borderStyle = section.style.border === "thick" ? "SOLID_THICK" : section.style.border === "medium" ? "SOLID_MEDIUM" : "SOLID";
      const borderColor = hexToRgb(section.style.borderColor || "#E2E8F0");
      requests.push({
        updateBorders: {
          range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: colStart, endColumnIndex: colEnd },
          bottom: { style: borderStyle, color: borderColor },
        },
      });
    }

    // ── Cell-level overrides ─────────────────────────────────
    if (section.cells) {
      for (const cell of section.cells) {
        const cellRow = cell.row - 1;
        const cellCol = cell.col - 1;
        const cellColEnd = cellCol + (cell.colSpan || 1);

        // Merge multi-column cells
        if (cell.colSpan && cell.colSpan > 1) {
          requests.push({
            mergeCells: {
              range: { sheetId, startRowIndex: cellRow, endRowIndex: cellRow + 1, startColumnIndex: cellCol, endColumnIndex: cellColEnd },
              mergeType: "MERGE_ALL",
            },
          });
        }

        // Cell styling
        if (cell.style) {
          const fmt: Record<string, unknown> = {};
          const fields: string[] = [];

          if (cell.style.background) {
            fmt.backgroundColor = hexToRgb(cell.style.background);
            fields.push("backgroundColor");
          }

          const textFmt: Record<string, unknown> = {};
          if (cell.style.textColor) textFmt.foregroundColor = hexToRgb(cell.style.textColor);
          if (cell.style.fontSize !== undefined) textFmt.fontSize = cell.style.fontSize;
          if (cell.style.bold !== undefined) textFmt.bold = cell.style.bold;
          if (cell.style.italic !== undefined) textFmt.italic = cell.style.italic;
          if (cell.style.fontFamily) textFmt.fontFamily = cell.style.fontFamily;
          if (Object.keys(textFmt).length > 0) {
            fmt.textFormat = textFmt;
            fields.push("textFormat");
          }

          if (cell.style.alignment) {
            fmt.horizontalAlignment = cell.style.alignment.toUpperCase();
            fields.push("horizontalAlignment");
          }

          if (cell.style.numberFormat) {
            fmt.numberFormat = { type: "NUMBER", pattern: cell.style.numberFormat };
            fields.push("numberFormat");
          }

          if (fields.length > 0) {
            requests.push({
              repeatCell: {
                range: { sheetId, startRowIndex: cellRow, endRowIndex: cellRow + 1, startColumnIndex: cellCol, endColumnIndex: cellColEnd },
                cell: { userEnteredFormat: fmt },
                fields: `userEnteredFormat(${fields.join(",")})`,
              },
            });
          }
        }

        // Cell value
        if (cell.value !== undefined && cell.value !== null) {
          // Values are set via values update, not batchUpdate — skip here
        }

        // KPI card borders
        if (section.type === "kpi-row" && cell.colSpan && cell.style?.background) {
          requests.push({
            updateBorders: {
              range: { sheetId, startRowIndex: cellRow, endRowIndex: cellRow + 1, startColumnIndex: cellCol, endColumnIndex: cellColEnd },
              top: { style: "SOLID", color: hexToRgb(section.style.borderColor || "#E2E8F0") },
              bottom: { style: "SOLID", color: hexToRgb(section.style.borderColor || "#E2E8F0") },
              left: { style: "SOLID", color: hexToRgb(section.style.borderColor || "#E2E8F0") },
              right: { style: "SOLID", color: hexToRgb(section.style.borderColor || "#E2E8F0") },
            },
          });
        }
      }
    }
  }

  return requests;
}

// ══════════════════════════════════════════════════════════════
// EXCELJS LAYOUT APPLICATOR
// Applies SheetLayout styling to an ExcelJS worksheet.
// This bridges the design system into the ExcelJS fallback path.
// ══════════════════════════════════════════════════════════════

export interface ExcelJSStyleCommand {
  type: "merge" | "style" | "height" | "width" | "freeze" | "numberFormat";
  sheet: string;
  row?: number;
  col?: number;
  endRow?: number;
  endCol?: number;
  height?: number;
  width?: number;
  freezeRow?: number;
  freezeCol?: number;
  style?: {
    fill?: { type: "pattern"; pattern: "solid"; fgColor: { argb: string } };
    font?: { bold?: boolean; italic?: boolean; size?: number; name?: string; color?: { argb: string } };
    alignment?: { horizontal?: string; vertical?: string; wrapText?: boolean };
    border?: { bottom?: { style: string; color: { argb: string } } };
    numFmt?: string;
  };
}

export function layoutToExcelCommands(layout: SheetLayout): ExcelJSStyleCommand[] {
  const commands: ExcelJSStyleCommand[] = [];
  const sheet = layout.sheetName;

  // Column widths (ExcelJS uses character units, ~7px per char)
  for (let i = 0; i < layout.columnWidths.length; i++) {
    commands.push({
      type: "width",
      sheet,
      col: i + 1,
      width: Math.round(layout.columnWidths[i] / 7),
    });
  }

  // Frozen panes
  if (layout.frozenRows) {
    commands.push({
      type: "freeze",
      sheet,
      freezeRow: layout.frozenRows,
      freezeCol: layout.frozenCols || 0,
    });
  }

  // Process sections
  for (const section of layout.sections) {
    // Row height
    if (section.height) {
      commands.push({
        type: "height",
        sheet,
        row: section.row,
        height: section.height * 0.75, // px to Excel row height points
      });
    }

    // Merge
    if (section.merge) {
      commands.push({
        type: "merge",
        sheet,
        row: section.row,
        col: section.col,
        endRow: section.row + section.rows - 1,
        endCol: section.col + section.cols - 1,
      });
    }

    // Base style for the section
    if (section.type !== "chart-zone") {
      for (let c = section.col; c < section.col + section.cols; c++) {
        commands.push({
          type: "style",
          sheet,
          row: section.row,
          col: c,
          style: {
            fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + section.style.background.replace("#", "") } },
            font: {
              bold: section.style.bold,
              italic: section.style.italic,
              size: section.style.fontSize,
              name: "Calibri",
              color: { argb: "FF" + section.style.textColor.replace("#", "") },
            },
            alignment: {
              horizontal: section.style.alignment,
              vertical: section.style.verticalAlign || "middle",
              wrapText: section.style.wrapText,
            },
            border: section.style.border && section.style.border !== "none" ? {
              bottom: {
                style: section.style.border === "medium" ? "medium" : "thin",
                color: { argb: "FF" + (section.style.borderColor || "#E2E8F0").replace("#", "") },
              },
            } : undefined,
          },
        });
      }
    }

    // Cell-level overrides
    if (section.cells) {
      for (const cell of section.cells) {
        if (cell.colSpan && cell.colSpan > 1) {
          commands.push({
            type: "merge",
            sheet,
            row: cell.row,
            col: cell.col,
            endRow: cell.row,
            endCol: cell.col + cell.colSpan - 1,
          });
        }

        if (cell.style) {
          const s = cell.style;
          commands.push({
            type: "style",
            sheet,
            row: cell.row,
            col: cell.col,
            style: {
              fill: s.background ? { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + s.background.replace("#", "") } } : undefined,
              font: {
                bold: s.bold,
                italic: s.italic,
                size: s.fontSize,
                name: "Calibri",
                color: s.textColor ? { argb: "FF" + s.textColor.replace("#", "") } : undefined,
              },
              alignment: s.alignment ? { horizontal: s.alignment, vertical: "middle" } : undefined,
              numFmt: s.numberFormat,
            },
          });
        }
      }
    }
  }

  return commands;
}

// ══════════════════════════════════════════════════════════════
// CONDITIONAL FORMATTING RULES
// Premium status indicators that work with light themes
// ══════════════════════════════════════════════════════════════

export interface ConditionalFormatRule {
  sheetId: number;
  range: { startRow: number; endRow: number; startCol: number; endCol: number };
  type: "text_contains" | "number_less" | "number_greater" | "custom";
  value: string;
  format: { textColor: string; background: string };
}

export function generateConditionalRules(
  blueprint: ProductBlueprint,
  theme: DesignTheme
): ConditionalFormatRule[] {
  const rules: ConditionalFormatRule[] = [];

  blueprint.tabs.forEach((tab, tabIdx) => {
    if (!tab.features.includes("conditional_formatting")) return;

    tab.columns.forEach((col, colIdx) => {
      const name = col.name.toLowerCase();
      const numRows = Math.max(tab.sampleRows.length, 50);

      // Status columns: On Track / Over / Funded
      if (name.includes("status") || name.includes("progress")) {
        rules.push(
          { sheetId: tabIdx, range: { startRow: 1, endRow: numRows + 1, startCol: colIdx, endCol: colIdx + 1 }, type: "text_contains", value: "On Track", format: { textColor: theme.success, background: theme.successBg } },
          { sheetId: tabIdx, range: { startRow: 1, endRow: numRows + 1, startCol: colIdx, endCol: colIdx + 1 }, type: "text_contains", value: "Funded", format: { textColor: theme.success, background: theme.successBg } },
          { sheetId: tabIdx, range: { startRow: 1, endRow: numRows + 1, startCol: colIdx, endCol: colIdx + 1 }, type: "text_contains", value: "⚠️", format: { textColor: theme.warning, background: theme.warningBg } },
          { sheetId: tabIdx, range: { startRow: 1, endRow: numRows + 1, startCol: colIdx, endCol: colIdx + 1 }, type: "text_contains", value: "Over", format: { textColor: theme.danger, background: theme.dangerBg } },
          { sheetId: tabIdx, range: { startRow: 1, endRow: numRows + 1, startCol: colIdx, endCol: colIdx + 1 }, type: "text_contains", value: "🔴", format: { textColor: theme.danger, background: theme.dangerBg } },
        );
      }

      // Negative currency values
      if (col.type === "currency") {
        rules.push({
          sheetId: tabIdx,
          range: { startRow: 1, endRow: numRows + 1, startCol: colIdx, endCol: colIdx + 1 },
          type: "number_less",
          value: "0",
          format: { textColor: theme.danger, background: theme.dangerBg },
        });
      }

      // Progress percentages (green when >= 100%)
      if (col.type === "percent" && (name.includes("progress") || name.includes("complete"))) {
        rules.push({
          sheetId: tabIdx,
          range: { startRow: 1, endRow: numRows + 1, startCol: colIdx, endCol: colIdx + 1 },
          type: "number_greater",
          value: "0.99",
          format: { textColor: theme.success, background: theme.successBg },
        });
      }
    });
  });

  return rules;
}

// ══════════════════════════════════════════════════════════════
// DATA VALIDATION RULES
// Niche-aware dropdown lists derived from blueprint content
// ══════════════════════════════════════════════════════════════

export interface ValidationRule {
  sheetId: number;
  range: { startRow: number; endRow: number; startCol: number; endCol: number };
  type: "list";
  values: string[];
}

export function generateValidationRules(blueprint: ProductBlueprint): ValidationRule[] {
  const rules: ValidationRule[] = [];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // Extract bucket names from blueprint (niche-specific)
  const dashTab = blueprint.tabs.find(t => t.name === "Dashboard");
  const budgetTab = blueprint.tabs.find(t => t.name === "Budget Setup");
  let bucketNames: string[] = ["Savings", "Needs", "Wants", "Bills"];

  // Try to find bucket names from the Budget Setup tab data
  if (budgetTab?.sampleRows) {
    const foundBuckets: string[] = [];
    for (const row of budgetTab.sampleRows) {
      const label = row[0] as string;
      if (label && !label.startsWith("💰") && !label.startsWith("📊") && !label.startsWith("🎯") && !label.startsWith("TOTAL") && label !== null && typeof label === "string" && !label.includes("ALLOCATION") && !label.includes("GOALS") && !label.includes("INCOME")) {
        const val = row[1];
        if (typeof val === "number" && val > 0 && val <= 100) {
          foundBuckets.push(label);
        }
      }
    }
    if (foundBuckets.length >= 3) bucketNames = foundBuckets;
  }

  blueprint.tabs.forEach((tab, tabIdx) => {
    if (!tab.features.includes("dropdown_validation")) return;
    const maxRow = Math.max(tab.sampleRows.length + 3, 200); // extra rows for user data

    tab.columns.forEach((col, colIdx) => {
      const name = col.name.toLowerCase();

      // Month dropdown
      if (name === "month" || name.includes("select month")) {
        rules.push({ sheetId: tabIdx, range: { startRow: 1, endRow: maxRow, startCol: colIdx, endCol: colIdx + 1 }, type: "list", values: MONTHS });
      }

      // Bucket/Category dropdown (niche-specific!)
      if (name === "bucket" || name === "category" || name === "category type") {
        rules.push({ sheetId: tabIdx, range: { startRow: 1, endRow: maxRow, startCol: colIdx, endCol: colIdx + 1 }, type: "list", values: ["Income", ...bucketNames] });
      }
    });
  });

  // Dashboard month selector (if Dashboard exists)
  if (dashTab) {
    const dashIdx = blueprint.tabs.indexOf(dashTab);
    // The month dropdown is at row 4, col 3 (C4) in the dashboard layout
    rules.push({ sheetId: dashIdx, range: { startRow: 3, endRow: 4, startCol: 2, endCol: 3 }, type: "list", values: MONTHS });
  }

  return rules;
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function spacer(row: number, cols: number, theme: DesignTheme, height: number): SheetSection {
  return {
    type: "spacer",
    label: "",
    row, col: 1, rows: 1, cols,
    style: { background: theme.pageBg, textColor: theme.pageBg, fontSize: 1, bold: false, alignment: "left" },
    height,
  };
}

function hexToRgb(h: string): { red: number; green: number; blue: number } {
  const hex = h.startsWith("#") ? h.slice(1) : h;
  return {
    red: +(parseInt(hex.slice(0, 2), 16) / 255).toFixed(3),
    green: +(parseInt(hex.slice(2, 4), 16) / 255).toFixed(3),
    blue: +(parseInt(hex.slice(4, 6), 16) / 255).toFixed(3),
  };
}
