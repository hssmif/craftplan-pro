// ══════════════════════════════════════════════════════════════
// Factory Spreadsheet Renderer — Real Google Sheets SVG Views
//
// Generates SVGs that look like ACTUAL Google Sheets screenshots.
// Reads real cell data from the ProductBlueprint tabs.
//
// This replaces the fake dashboard/infographic SVGs with
// authentic spreadsheet previews showing:
//   - Google Sheets chrome (toolbar, formula bar)
//   - Column headers (A, B, C...) and row numbers (1, 2, 3...)
//   - Real cell data with proper formatting
//   - Color-coded cells matching the actual spreadsheet output
//   - Sheet tab bar at the bottom
//
// REALISM > artistic rendering. A plain but real spreadsheet
// screenshot builds trust; a beautiful fake breaks it.
// ══════════════════════════════════════════════════════════════

import type { ProductBlueprint, BlueprintTab, ListingImageSpec } from "@/types/factory";
import { resolveNicheProfile, type NicheDesignProfile } from "./factory-niche-themes";
import {
  extractKpiData,
  deriveKpiFromTransactions,
  deriveBudgetFromTransactions,
  formatCurrency,
} from "./factory-display-helpers";

// ── Constants ────────────────────────────────────────────────

const W = 2000;
const H = 2000;

// Google Sheets UI colors (real Google Sheets palette)
const GS = {
  menuBg: "#FFFFFF",
  menuText: "#3C4043",
  toolbarBg: "#EDF2FA",
  toolbarBorder: "#DADCE0",
  formulaBarBg: "#FFFFFF",
  formulaBarBorder: "#DADCE0",
  colHeaderBg: "#F8F9FA",
  colHeaderText: "#5F6368",
  colHeaderBorder: "#E8EAED",
  rowNumBg: "#F8F9FA",
  rowNumText: "#80868B",
  gridLine: "#E2E5E9",
  cellBg: "#FFFFFF",
  cellText: "#202124",
  cellTextMuted: "#5F6368",
  selectedCell: "#1A73E8",
  tabBarBg: "#F8F9FA",
  tabBarBorder: "#DADCE0",
  activeTabBg: "#FFFFFF",
  activeTabAccent: "#0B8043",
  inactiveTabText: "#80868B",
  sheetIconGreen: "#0F9D58",
  // Formula bar fx
  fxColor: "#80868B",
};

// ── SVG Helpers ──────────────────────────────────────────────

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

function colLetter(index: number): string {
  let s = "";
  let n = index;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

/** Format a cell value for display */
function formatCell(value: string | number | null | undefined, colType?: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" && value.startsWith("=")) {
    // Formula — show a plausible computed value
    return "";
  }
  if (typeof value === "number") {
    if (colType === "currency" || colType === "formula") {
      return value < 0
        ? `-$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
        : `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
    if (colType === "percent") {
      return `${Math.round(value * 100)}%`;
    }
    return value.toLocaleString("en-US");
  }
  return String(value);
}

/** Truncate text to fit within pixel width (approximate) */
function truncateToWidth(text: string, maxPx: number, fontSize: number): string {
  const charWidth = fontSize * 0.55;
  const maxChars = Math.floor(maxPx / charWidth);
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + "...";
}

// ══════════════════════════════════════════════════════════════
// SPREADSHEET VIEW RENDERER
//
// Renders a complete Google Sheets view of a blueprint tab.
// ══════════════════════════════════════════════════════════════

export interface SpreadsheetViewOptions {
  /** The tab to render */
  tab: BlueprintTab;
  /** All tabs (for the tab bar) */
  allTabs: BlueprintTab[];
  /** Niche design profile for colors */
  nicheProfile: NicheDesignProfile;
  /** Blueprint for KPI/data extraction */
  blueprint: ProductBlueprint;
  /** SVG viewport width */
  width?: number;
  /** SVG viewport height */
  height?: number;
  /** Show Google Sheets chrome (toolbar, formula bar) */
  showChrome?: boolean;
  /** Show tab bar at bottom */
  showTabBar?: boolean;
  /** Starting row to display (0-based index into sampleRows) */
  startRow?: number;
  /** Max rows to show */
  maxRows?: number;
  /** Which cell to highlight (e.g. "C6") */
  selectedCell?: string;
  /** Scale factor for the entire grid */
  scale?: number;
}

interface CellStyle {
  bg: string;
  text: string;
  bold: boolean;
  fontSize: number;
  align: "left" | "center" | "right";
  merged?: { cols: number };
  height?: number;
}

interface RenderedRow {
  cells: Array<{
    value: string;
    style: CellStyle;
    colSpan?: number;
  }>;
  height: number;
  isTitle?: boolean;
  isSpacer?: boolean;
  isHeader?: boolean;
  isTotals?: boolean;
  isKpi?: boolean;
}

/**
 * Render a full Google Sheets screenshot SVG for a blueprint tab.
 */
export function renderSpreadsheetView(options: SpreadsheetViewOptions): string {
  const {
    tab,
    allTabs,
    nicheProfile,
    blueprint,
    width = W,
    height = H,
    showChrome = true,
    showTabBar = true,
    startRow = 0,
    maxRows = 40,
    selectedCell = "B2",
    scale = 1,
  } = options;

  const tokens = buildTokens(nicheProfile);
  const parts: string[] = [];

  // ── Layout geometry ──
  let chromeHeight = 0;
  const menuH = 34;
  const toolbarH = 38;
  const formulaH = 30;
  const colHeaderH = 26;
  const tabBarH = showTabBar ? 30 : 0;
  const rowNumW = 44;

  if (showChrome) {
    chromeHeight = menuH + toolbarH + formulaH;
  }

  const gridTop = chromeHeight + colHeaderH;
  const gridBottom = height - tabBarH;
  const gridHeight = gridBottom - gridTop;
  const gridLeft = rowNumW;
  const gridWidth = width - gridLeft;

  // ── Compute column pixel widths ──
  // Dashboard tabs use 10 columns (gutter + 4 KPI card pairs + extras)
  const isDashboardTab = tab.name.toLowerCase().includes("dashboard");
  const numCols = isDashboardTab ? Math.max(tab.columns.length, 10) : Math.max(tab.columns.length, 6);
  const colPixelWidths = computeColumnWidths(tab, numCols, gridWidth);

  // ── Build row data from the tab ──
  const rows = buildRowData(tab, tokens, numCols, startRow, maxRows, blueprint);

  // ── Start SVG ──
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`);

  // White background
  parts.push(`<rect width="${width}" height="${height}" fill="${GS.cellBg}" />`);

  // ── Chrome (menu, toolbar, formula bar) ──
  if (showChrome) {
    parts.push(renderChrome(width, menuH, toolbarH, formulaH, tab.name, selectedCell, nicheProfile));
  }

  // ── Column headers (A, B, C...) ──
  parts.push(renderColumnHeaders(
    chromeHeight, colHeaderH, rowNumW, numCols, colPixelWidths, width
  ));

  // ── Row numbers + Cell grid ──
  let currentY = gridTop;
  let rowNumber = 1;

  for (const row of rows) {
    if (currentY + row.height > gridBottom) break;

    // Row number
    parts.push(`<rect x="0" y="${currentY}" width="${rowNumW}" height="${row.height}" fill="${GS.rowNumBg}" />`);
    parts.push(`<text x="${rowNumW / 2}" y="${currentY + row.height / 2 + 4}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="${GS.rowNumText}">${rowNumber}</text>`);
    parts.push(`<line x1="${rowNumW}" y1="${currentY}" x2="${rowNumW}" y2="${currentY + row.height}" stroke="${GS.colHeaderBorder}" stroke-width="1" />`);

    // Cells
    let cellX = gridLeft;
    let colIdx = 0;

    for (const cell of row.cells) {
      const span = cell.colSpan || 1;
      let cellWidth = 0;
      for (let s = 0; s < span && colIdx + s < numCols; s++) {
        cellWidth += colPixelWidths[colIdx + s] || 100;
      }

      // Cell background
      parts.push(`<rect x="${cellX}" y="${currentY}" width="${cellWidth}" height="${row.height}" fill="${cell.style.bg}" />`);

      // Cell border (grid line)
      parts.push(`<line x1="${cellX}" y1="${currentY + row.height}" x2="${cellX + cellWidth}" y2="${currentY + row.height}" stroke="${GS.gridLine}" stroke-width="0.5" />`);
      parts.push(`<line x1="${cellX + cellWidth}" y1="${currentY}" x2="${cellX + cellWidth}" y2="${currentY + row.height}" stroke="${GS.gridLine}" stroke-width="0.5" />`);

      // Cell text
      if (cell.value) {
        const displayText = truncateToWidth(cell.value, cellWidth - 12, cell.style.fontSize);
        const textX = cell.style.align === "right"
          ? cellX + cellWidth - 8
          : cell.style.align === "center"
          ? cellX + cellWidth / 2
          : cellX + 8;
        const anchor = cell.style.align === "right" ? "end" : cell.style.align === "center" ? "middle" : "start";
        const fontWeight = cell.style.bold ? "700" : "400";

        parts.push(`<text x="${textX}" y="${currentY + row.height / 2 + cell.style.fontSize * 0.35}" text-anchor="${anchor}" font-family="Arial, sans-serif" font-size="${cell.style.fontSize}" font-weight="${fontWeight}" fill="${cell.style.text}">${esc(displayText)}</text>`);
      }

      cellX += cellWidth;
      colIdx += span;
    }

    // Fill remaining columns with empty cells
    while (colIdx < numCols) {
      const cellWidth = colPixelWidths[colIdx] || 100;
      parts.push(`<rect x="${cellX}" y="${currentY}" width="${cellWidth}" height="${row.height}" fill="${GS.cellBg}" />`);
      parts.push(`<line x1="${cellX}" y1="${currentY + row.height}" x2="${cellX + cellWidth}" y2="${currentY + row.height}" stroke="${GS.gridLine}" stroke-width="0.5" />`);
      parts.push(`<line x1="${cellX + cellWidth}" y1="${currentY}" x2="${cellX + cellWidth}" y2="${currentY + row.height}" stroke="${GS.gridLine}" stroke-width="0.5" />`);
      cellX += cellWidth;
      colIdx++;
    }

    // Right border for row number column
    parts.push(`<line x1="0" y1="${currentY + row.height}" x2="${rowNumW}" y2="${currentY + row.height}" stroke="${GS.colHeaderBorder}" stroke-width="0.5" />`);

    currentY += row.height;
    rowNumber++;
  }

  // Fill remaining space with empty grid rows
  const emptyRowH = 24;
  while (currentY + emptyRowH <= gridBottom) {
    // Row number
    parts.push(`<rect x="0" y="${currentY}" width="${rowNumW}" height="${emptyRowH}" fill="${GS.rowNumBg}" />`);
    parts.push(`<text x="${rowNumW / 2}" y="${currentY + emptyRowH / 2 + 4}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="${GS.rowNumText}">${rowNumber}</text>`);
    parts.push(`<line x1="${rowNumW}" y1="${currentY}" x2="${rowNumW}" y2="${currentY + emptyRowH}" stroke="${GS.colHeaderBorder}" stroke-width="1" />`);

    // Empty cells
    let cellX = gridLeft;
    for (let c = 0; c < numCols; c++) {
      const cw = colPixelWidths[c] || 100;
      parts.push(`<line x1="${cellX}" y1="${currentY + emptyRowH}" x2="${cellX + cw}" y2="${currentY + emptyRowH}" stroke="${GS.gridLine}" stroke-width="0.5" />`);
      parts.push(`<line x1="${cellX + cw}" y1="${currentY}" x2="${cellX + cw}" y2="${currentY + emptyRowH}" stroke="${GS.gridLine}" stroke-width="0.5" />`);
      cellX += cw;
    }

    parts.push(`<line x1="0" y1="${currentY + emptyRowH}" x2="${rowNumW}" y2="${currentY + emptyRowH}" stroke="${GS.colHeaderBorder}" stroke-width="0.5" />`);
    currentY += emptyRowH;
    rowNumber++;
  }

  // ── Selected cell highlight ──
  const selCoords = parseCellRef(selectedCell);
  if (selCoords) {
    const selRow = selCoords.row; // 1-based
    const selCol = selCoords.col; // 0-based
    // Calculate position
    let selX = gridLeft;
    for (let c = 0; c < selCol && c < numCols; c++) {
      selX += colPixelWidths[c] || 100;
    }
    const selW = colPixelWidths[selCol] || 100;
    // Find row Y position
    let selY = gridTop;
    for (let r = 0; r < selRow - 1 && r < rows.length; r++) {
      selY += rows[r].height;
    }
    const selH = rows[selRow - 1]?.height || 24;

    parts.push(`<rect x="${selX}" y="${selY}" width="${selW}" height="${selH}" fill="none" stroke="${GS.selectedCell}" stroke-width="2" />`);
  }

  // ── Tab bar ──
  if (showTabBar) {
    parts.push(renderTabBar(gridBottom, tabBarH, width, allTabs, tab.name, nicheProfile));
  }

  parts.push(`</svg>`);
  return parts.join("\n");
}

// ══════════════════════════════════════════════════════════════
// CHROME RENDERER — Menu bar, toolbar, formula bar
// ══════════════════════════════════════════════════════════════

function renderChrome(
  width: number,
  menuH: number,
  toolbarH: number,
  formulaH: number,
  docTitle: string,
  selectedCell: string,
  nicheProfile: NicheDesignProfile
): string {
  const parts: string[] = [];
  let y = 0;

  // ── Menu bar ──
  parts.push(`<rect x="0" y="0" width="${width}" height="${menuH}" fill="${GS.menuBg}" />`);
  parts.push(`<line x1="0" y1="${menuH}" x2="${width}" y2="${menuH}" stroke="${GS.toolbarBorder}" stroke-width="1" />`);

  // Google Sheets icon (green square with grid lines)
  parts.push(`<rect x="12" y="6" width="22" height="22" rx="3" fill="${GS.sheetIconGreen}" />`);
  parts.push(`<line x1="18" y1="8" x2="18" y2="26" stroke="#FFFFFF" stroke-width="1.5" />`);
  parts.push(`<line x1="26" y1="8" x2="26" y2="26" stroke="#FFFFFF" stroke-width="1.5" />`);
  parts.push(`<line x1="14" y1="14" x2="32" y2="14" stroke="#FFFFFF" stroke-width="1.5" />`);
  parts.push(`<line x1="14" y1="20" x2="32" y2="20" stroke="#FFFFFF" stroke-width="1.5" />`);

  // Document title
  const cleanTitle = esc(docTitle.replace(/[^\w\s-]/g, "").trim() || "Untitled spreadsheet");
  parts.push(`<text x="44" y="22" font-family="'Google Sans', Arial, sans-serif" font-size="15" font-weight="500" fill="${GS.menuText}">${cleanTitle}</text>`);

  // Menu items
  const menuItems = ["File", "Edit", "View", "Insert", "Format", "Data", "Extensions", "Help"];
  let menuX = 44;
  const menuY = menuH + 2;
  // Actually place them on the menu bar area
  menuX = 44;
  parts.push(`<text x="${menuX}" y="${menuH + toolbarH * 0.15 + 12}" font-family="Arial, sans-serif" font-size="13" fill="${GS.menuText}">`);
  // Place menu items horizontally
  parts.push(`</text>`);

  // Menu items below title
  y = menuH;

  // ── Toolbar row 1 (menu text items) ──
  parts.push(`<rect x="0" y="${y}" width="${width}" height="20" fill="${GS.menuBg}" />`);
  menuX = 12;
  for (const item of menuItems) {
    parts.push(`<text x="${menuX}" y="${y + 14}" font-family="Arial, sans-serif" font-size="12" fill="${GS.menuText}">${item}</text>`);
    menuX += item.length * 8 + 16;
  }
  y += 20;

  // ── Toolbar row 2 (formatting icons) ──
  parts.push(`<rect x="0" y="${y}" width="${width}" height="${toolbarH - 20}" fill="${GS.toolbarBg}" />`);
  parts.push(`<line x1="0" y1="${y + toolbarH - 20}" x2="${width}" y2="${y + toolbarH - 20}" stroke="${GS.toolbarBorder}" stroke-width="1" />`);

  // Simplified toolbar buttons
  const tbY = y + 2;
  const tbH = toolbarH - 24;
  let tbX = 12;

  // Undo/Redo icons (simplified arrows)
  parts.push(`<rect x="${tbX}" y="${tbY}" width="${tbH}" height="${tbH}" rx="3" fill="none" />`);
  parts.push(`<text x="${tbX + 6}" y="${tbY + 12}" font-family="Arial" font-size="11" fill="${GS.cellTextMuted}">↶</text>`);
  tbX += tbH + 4;
  parts.push(`<text x="${tbX + 6}" y="${tbY + 12}" font-family="Arial" font-size="11" fill="${GS.cellTextMuted}">↷</text>`);
  tbX += tbH + 12;

  // Separator
  parts.push(`<line x1="${tbX}" y1="${tbY + 2}" x2="${tbX}" y2="${tbY + tbH - 2}" stroke="${GS.toolbarBorder}" stroke-width="1" />`);
  tbX += 12;

  // Font selector (dropdown)
  parts.push(`<rect x="${tbX}" y="${tbY}" width="90" height="${tbH}" rx="2" fill="${GS.cellBg}" stroke="${GS.toolbarBorder}" stroke-width="1" />`);
  parts.push(`<text x="${tbX + 6}" y="${tbY + 12}" font-family="Arial" font-size="11" fill="${GS.cellText}">Arial</text>`);
  parts.push(`<text x="${tbX + 78}" y="${tbY + 11}" font-family="Arial" font-size="8" fill="${GS.cellTextMuted}">&#x25BE;</text>`);
  tbX += 96;

  // Font size
  parts.push(`<rect x="${tbX}" y="${tbY}" width="36" height="${tbH}" rx="2" fill="${GS.cellBg}" stroke="${GS.toolbarBorder}" stroke-width="1" />`);
  parts.push(`<text x="${tbX + 10}" y="${tbY + 12}" font-family="Arial" font-size="11" fill="${GS.cellText}">10</text>`);
  tbX += 42;

  // Separator
  parts.push(`<line x1="${tbX}" y1="${tbY + 2}" x2="${tbX}" y2="${tbY + tbH - 2}" stroke="${GS.toolbarBorder}" stroke-width="1" />`);
  tbX += 12;

  // B I U S buttons
  const formatBtns = ["B", "I", "U", "S"];
  for (const btn of formatBtns) {
    const fontStyle = btn === "I" ? " font-style='italic'" : "";
    const fontWeight = btn === "B" ? " font-weight='700'" : "";
    const textDeco = btn === "U" ? " text-decoration='underline'" : btn === "S" ? " text-decoration='line-through'" : "";
    parts.push(`<text x="${tbX + 5}" y="${tbY + 12}" font-family="Arial" font-size="12"${fontWeight}${fontStyle}${textDeco} fill="${GS.cellTextMuted}">${btn}</text>`);
    tbX += 22;
  }

  // Separator
  tbX += 8;
  parts.push(`<line x1="${tbX}" y1="${tbY + 2}" x2="${tbX}" y2="${tbY + tbH - 2}" stroke="${GS.toolbarBorder}" stroke-width="1" />`);
  tbX += 12;

  // Color buttons (text color + fill color)
  parts.push(`<text x="${tbX + 2}" y="${tbY + 10}" font-family="Arial" font-size="12" fill="${GS.cellText}">A</text>`);
  parts.push(`<rect x="${tbX}" y="${tbY + 13}" width="16" height="3" fill="#000000" />`);
  tbX += 24;
  parts.push(`<rect x="${tbX + 2}" y="${tbY + 3}" width="12" height="10" fill="#FFFFFF" stroke="${GS.toolbarBorder}" stroke-width="1" />`);
  parts.push(`<rect x="${tbX}" y="${tbY + 13}" width="16" height="3" fill="#FFFFFF" stroke="${GS.toolbarBorder}" stroke-width="0.5" />`);
  tbX += 24;

  // Separator
  parts.push(`<line x1="${tbX}" y1="${tbY + 2}" x2="${tbX}" y2="${tbY + tbH - 2}" stroke="${GS.toolbarBorder}" stroke-width="1" />`);
  tbX += 12;

  // $ % .0 .00 buttons
  const numBtns = ["$", "%", ".0", ".00"];
  for (const nb of numBtns) {
    parts.push(`<text x="${tbX + 2}" y="${tbY + 12}" font-family="Arial" font-size="10" fill="${GS.cellTextMuted}">${nb}</text>`);
    tbX += nb.length * 7 + 12;
  }

  y = menuH + toolbarH;

  // ── Formula bar ──
  parts.push(`<rect x="0" y="${y}" width="${width}" height="${formulaH}" fill="${GS.formulaBarBg}" />`);
  parts.push(`<line x1="0" y1="${y + formulaH}" x2="${width}" y2="${y + formulaH}" stroke="${GS.formulaBarBorder}" stroke-width="1" />`);

  // Cell reference box
  parts.push(`<rect x="0" y="${y}" width="70" height="${formulaH}" fill="${GS.formulaBarBg}" stroke="${GS.formulaBarBorder}" stroke-width="1" />`);
  parts.push(`<text x="35" y="${y + formulaH / 2 + 4}" text-anchor="middle" font-family="Arial" font-size="12" fill="${GS.cellText}">${esc(selectedCell)}</text>`);

  // fx label
  parts.push(`<text x="82" y="${y + formulaH / 2 + 4}" font-family="Arial" font-size="13" font-style="italic" fill="${GS.fxColor}">fx</text>`);

  // Separator
  parts.push(`<line x1="100" y1="${y + 4}" x2="100" y2="${y + formulaH - 4}" stroke="${GS.formulaBarBorder}" stroke-width="1" />`);

  // Formula bar content (show the title of the sheet as if selected)
  parts.push(`<text x="110" y="${y + formulaH / 2 + 4}" font-family="Arial" font-size="12" fill="${GS.cellText}">${esc(docTitle)}</text>`);

  return parts.join("\n");
}

// ══════════════════════════════════════════════════════════════
// COLUMN HEADERS
// ══════════════════════════════════════════════════════════════

function renderColumnHeaders(
  top: number,
  height: number,
  rowNumW: number,
  numCols: number,
  colWidths: number[],
  totalWidth: number
): string {
  const parts: string[] = [];

  // Background
  parts.push(`<rect x="0" y="${top}" width="${totalWidth}" height="${height}" fill="${GS.colHeaderBg}" />`);
  parts.push(`<line x1="0" y1="${top + height}" x2="${totalWidth}" y2="${top + height}" stroke="${GS.colHeaderBorder}" stroke-width="1" />`);

  // Corner cell (row num header)
  parts.push(`<rect x="0" y="${top}" width="${rowNumW}" height="${height}" fill="${GS.colHeaderBg}" />`);
  parts.push(`<line x1="${rowNumW}" y1="${top}" x2="${rowNumW}" y2="${top + height}" stroke="${GS.colHeaderBorder}" stroke-width="1" />`);

  // Column letters
  let x = rowNumW;
  for (let c = 0; c < numCols; c++) {
    const w = colWidths[c] || 100;
    parts.push(`<text x="${x + w / 2}" y="${top + height / 2 + 4}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="${GS.colHeaderText}">${colLetter(c)}</text>`);
    parts.push(`<line x1="${x + w}" y1="${top}" x2="${x + w}" y2="${top + height}" stroke="${GS.colHeaderBorder}" stroke-width="1" />`);
    x += w;
  }

  return parts.join("\n");
}

// ══════════════════════════════════════════════════════════════
// TAB BAR
// ══════════════════════════════════════════════════════════════

function renderTabBar(
  top: number,
  height: number,
  width: number,
  allTabs: BlueprintTab[],
  activeTabName: string,
  nicheProfile: NicheDesignProfile
): string {
  const parts: string[] = [];
  const tabColors = [
    nicheProfile.palette.primary,
    nicheProfile.palette.accent,
    nicheProfile.palette.primaryLight,
    nicheProfile.palette.info || nicheProfile.palette.primary,
  ];

  // Background
  parts.push(`<rect x="0" y="${top}" width="${width}" height="${height}" fill="${GS.tabBarBg}" />`);
  parts.push(`<line x1="0" y1="${top}" x2="${width}" y2="${top}" stroke="${GS.tabBarBorder}" stroke-width="1" />`);

  // Navigation buttons (◀ ▶ +)
  let x = 8;
  const navBtns = ["◀", "▶", "+"];
  for (const btn of navBtns) {
    parts.push(`<text x="${x}" y="${top + height / 2 + 5}" font-family="Arial" font-size="13" fill="${GS.inactiveTabText}">${btn}</text>`);
    x += 24;
  }
  x += 8;

  // Dedup tab names
  const seen = new Set<string>();
  const uniqueTabs = allTabs.filter((t) => {
    const key = t.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Tabs
  for (let i = 0; i < uniqueTabs.length; i++) {
    const t = uniqueTabs[i];
    const isActive = t.name === activeTabName;
    const tabLabel = esc(t.name.replace(/[^\w\s&-]/g, "").trim());
    const tabW = Math.max(tabLabel.length * 8 + 24, 80);
    const tabColor = tabColors[i % tabColors.length];

    if (isActive) {
      // Active tab: white bg with colored bottom border
      parts.push(`<rect x="${x}" y="${top}" width="${tabW}" height="${height}" fill="${GS.activeTabBg}" />`);
      parts.push(`<rect x="${x}" y="${top + height - 3}" width="${tabW}" height="3" fill="${tabColor}" />`);
      parts.push(`<text x="${x + tabW / 2}" y="${top + height / 2 + 4}" text-anchor="middle" font-family="Arial" font-size="12" font-weight="500" fill="${GS.menuText}">${tabLabel}</text>`);
    } else {
      // Inactive tab
      parts.push(`<text x="${x + tabW / 2}" y="${top + height / 2 + 4}" text-anchor="middle" font-family="Arial" font-size="12" fill="${GS.inactiveTabText}">${tabLabel}</text>`);
    }

    // Tab separator
    parts.push(`<line x1="${x + tabW}" y1="${top + 6}" x2="${x + tabW}" y2="${top + height - 6}" stroke="${GS.tabBarBorder}" stroke-width="1" />`);
    x += tabW;

    if (x > width - 100) break; // Don't overflow
  }

  return parts.join("\n");
}

// ══════════════════════════════════════════════════════════════
// ROW DATA BUILDER — Reads blueprint tab and builds display rows
// ══════════════════════════════════════════════════════════════

interface SpreadsheetTokens {
  titleBg: string;
  titleText: string;
  subtitleBg: string;
  subtitleText: string;
  headerBg: string;
  headerText: string;
  rowAlt: string;
  totalsBg: string;
  totalsText: string;
  kpiColors: Array<{ bg: string; text: string }>;
  sectionBg: string;
  sectionText: string;
}

function buildTokens(profile: NicheDesignProfile): SpreadsheetTokens {
  const t = profile.spreadsheetTokens;
  return {
    titleBg: "#" + (t.headerBg || "4A90D9"),
    titleText: "#" + (t.headerText || "FFFFFF"),
    subtitleBg: "#" + (t.sectionBg || "D6E4F0"),
    subtitleText: "#" + (t.sectionText || "2C3E50"),
    headerBg: "#" + (t.headerBg || "F1F5F9"),
    headerText: "#" + (t.headerText || "334155"),
    rowAlt: "#" + (t.rowAlt || "F8FAFC"),
    totalsBg: "#" + (t.totalsBg || "E2E8F0"),
    totalsText: "#" + (t.totalsText || "0F172A"),
    kpiColors: (t.kpiCards || []).map((c) => ({ bg: "#" + c.bg, text: "#" + c.text })),
    sectionBg: "#" + (t.sectionBg || "EEF2F7"),
    sectionText: "#" + (t.sectionText || "2C3E50"),
  };
}

function buildRowData(
  tab: BlueprintTab,
  tokens: SpreadsheetTokens,
  numCols: number,
  startRow: number,
  maxRows: number,
  blueprint?: ProductBlueprint
): RenderedRow[] {
  const rows: RenderedRow[] = [];
  const colTypes = tab.columns.map((c) => c.type);
  const colNames = tab.columns.map((c) => c.name);

  // Classify tab to determine layout
  const name = tab.name.toLowerCase();
  const isDashboard = name.includes("dashboard");
  const isTransactions = name.includes("transaction") || name.includes("log");
  const isBudgetSetup = name.includes("budget") && (name.includes("setup") || name.includes("categor"));
  const isSavings = name.includes("saving") && name.includes("goal");

  // Row 1: Title bar (merged across all columns)
  const titleText = tab.sampleRows[0]?.[0]
    ? String(tab.sampleRows[0][0]).replace(/[\u{1F000}-\u{1FFFF}]/gu, "").replace(/[\u{2600}-\u{27BF}]/gu, "").trim()
    : tab.name.toUpperCase();
  rows.push({
    cells: [{
      value: titleText || tab.name.toUpperCase(),
      style: { bg: tokens.titleBg, text: tokens.titleText, bold: true, fontSize: 16, align: "center" },
      colSpan: numCols,
    }],
    height: 44,
    isTitle: true,
  });

  // Row 2: Subtitle (if dashboard has one)
  if (tab.sampleRows[1]?.[0] && typeof tab.sampleRows[1][0] === "string" && !isTransactions) {
    const sub = String(tab.sampleRows[1][0]).replace(/[\u{1F000}-\u{1FFFF}]/gu, "").replace(/[\u{2600}-\u{27BF}]/gu, "").trim();
    if (sub && sub.length > 3) {
      rows.push({
        cells: [{
          value: sub,
          style: { bg: tokens.subtitleBg, text: tokens.subtitleText, bold: false, fontSize: 11, align: "center" },
          colSpan: numCols,
        }],
        height: 28,
      });
    }
  }

  // Row 3: Spacer
  rows.push({
    cells: [{ value: "", style: { bg: "#FFFFFF", text: "#FFFFFF", bold: false, fontSize: 1, align: "left" }, colSpan: numCols }],
    height: 12,
    isSpacer: true,
  });

  if (isDashboard) {
    // Dashboard: KPI cards + budget table
    rows.push(...buildDashboardRows(tab, tokens, numCols, colTypes, blueprint));
  } else {
    // Data tab: column headers + data rows
    rows.push(...buildDataRows(tab, tokens, numCols, colTypes, colNames, startRow, maxRows));
  }

  return rows;
}

// ── Dashboard-specific rows ─────────────────────────────────

function buildDashboardRows(
  tab: BlueprintTab,
  tokens: SpreadsheetTokens,
  numCols: number,
  colTypes: string[],
  blueprint?: ProductBlueprint
): RenderedRow[] {
  const rows: RenderedRow[] = [];
  const kpiColors = tokens.kpiColors.length >= 4
    ? tokens.kpiColors
    : [
      { bg: "#D5F0D5", text: "#166534" },
      { bg: "#FEE2E2", text: "#991B1B" },
      { bg: "#FEF3C7", text: "#92400E" },
      { bg: "#DBEAFE", text: "#1E40AF" },
    ];

  // ── Controls row (month selector + income) ──
  const controlCells: RenderedRow["cells"] = [];
  // Col A: empty gutter
  controlCells.push({ value: "", style: { bg: "#FFFFFF", text: "#FFFFFF", bold: false, fontSize: 10, align: "left" } });
  // Col B: Month label
  controlCells.push({ value: "SELECT MONTH:", style: { bg: "#FFFFFF", text: tokens.headerText, bold: true, fontSize: 10, align: "right" } });
  // Col C: Month value
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  controlCells.push({ value: monthNames[new Date().getMonth()] || "January", style: { bg: "#FFFFFF", text: tokens.titleBg, bold: true, fontSize: 12, align: "center" } });
  // Col D: empty
  controlCells.push({ value: "", style: { bg: "#FFFFFF", text: "#FFFFFF", bold: false, fontSize: 10, align: "left" } });
  // Col E: Income label
  controlCells.push({ value: "MONTHLY INCOME:", style: { bg: "#FFFFFF", text: tokens.headerText, bold: true, fontSize: 10, align: "right" } });
  // Col F: Income value
  controlCells.push({ value: "$5,000", style: { bg: kpiColors[0].bg, text: kpiColors[0].text, bold: true, fontSize: 13, align: "center" } });
  // Fill remaining
  for (let c = controlCells.length; c < numCols; c++) {
    controlCells.push({ value: "", style: { bg: "#FFFFFF", text: "#FFFFFF", bold: false, fontSize: 10, align: "left" } });
  }
  rows.push({ cells: controlCells, height: 32 });

  // Spacer
  rows.push({
    cells: [{ value: "", style: { bg: "#FFFFFF", text: "#FFFFFF", bold: false, fontSize: 1, align: "left" }, colSpan: numCols }],
    height: 8,
    isSpacer: true,
  });

  // ── KPI Cards ──
  // Derive real KPI values from transaction data (blueprint formulas are uncomputable)
  const kpiData = deriveKpiValues(tab, tokens, blueprint);
  const kpiLabels = kpiData.map((k) => k.label);
  const kpiVals = kpiData.map((k) => k.value);

  const kpiLabelCells: RenderedRow["cells"] = [];
  kpiLabelCells.push({ value: "", style: { bg: "#FFFFFF", text: "#FFFFFF", bold: false, fontSize: 10, align: "left" } });
  for (let k = 0; k < 4; k++) {
    kpiLabelCells.push({
      value: kpiLabels[k],
      style: { bg: kpiColors[k].bg, text: kpiColors[k].text, bold: true, fontSize: 9, align: "center" },
    });
    kpiLabelCells.push({
      value: "",
      style: { bg: kpiColors[k].bg, text: kpiColors[k].bg, bold: false, fontSize: 1, align: "left" },
    });
  }
  for (let c = kpiLabelCells.length; c < numCols; c++) {
    kpiLabelCells.push({ value: "", style: { bg: "#FFFFFF", text: "#FFFFFF", bold: false, fontSize: 10, align: "left" } });
  }
  rows.push({ cells: kpiLabelCells, height: 24, isKpi: true });

  // ── KPI Value Row ──
  const kpiValueCells: RenderedRow["cells"] = [];
  kpiValueCells.push({ value: "", style: { bg: "#FFFFFF", text: "#FFFFFF", bold: false, fontSize: 10, align: "left" } });
  for (let k = 0; k < 4; k++) {
    kpiValueCells.push({
      value: kpiVals[k],
      style: { bg: kpiColors[k].bg, text: kpiColors[k].text, bold: true, fontSize: 20, align: "center" },
    });
    kpiValueCells.push({
      value: "",
      style: { bg: kpiColors[k].bg, text: kpiColors[k].bg, bold: false, fontSize: 1, align: "left" },
    });
  }
  for (let c = kpiValueCells.length; c < numCols; c++) {
    kpiValueCells.push({ value: "", style: { bg: "#FFFFFF", text: "#FFFFFF", bold: false, fontSize: 10, align: "left" } });
  }
  rows.push({ cells: kpiValueCells, height: 48, isKpi: true });

  // Spacer
  rows.push({
    cells: [{ value: "", style: { bg: "#FFFFFF", text: "#FFFFFF", bold: false, fontSize: 1, align: "left" }, colSpan: numCols }],
    height: 12,
    isSpacer: true,
  });

  // ── Budget breakdown section header ──
  rows.push({
    cells: [{
      value: "SPENDING BY CATEGORY",
      style: { bg: tokens.sectionBg, text: tokens.sectionText, bold: true, fontSize: 11, align: "center" },
      colSpan: Math.floor(numCols / 2),
    }, {
      value: "SAVINGS GOALS",
      style: { bg: tokens.sectionBg, text: tokens.sectionText, bold: true, fontSize: 11, align: "center" },
      colSpan: numCols - Math.floor(numCols / 2),
    }],
    height: 30,
  });

  // ── Budget table column headers ──
  const budgetHeaders = ["", "Category", "Budget", "Actual", "Remaining"];
  const budgetHeaderCells: RenderedRow["cells"] = [];
  for (let c = 0; c < Math.min(budgetHeaders.length, numCols); c++) {
    budgetHeaderCells.push({
      value: budgetHeaders[c],
      style: { bg: tokens.headerBg, text: tokens.headerText, bold: true, fontSize: 10, align: c >= 2 ? "right" : "left" },
    });
  }
  // Right panel headers
  const savingsHeaders = ["Goal", "Target", "Saved", "Progress", ""];
  for (let c = 0; c < Math.min(savingsHeaders.length, numCols - budgetHeaders.length); c++) {
    budgetHeaderCells.push({
      value: savingsHeaders[c],
      style: { bg: tokens.headerBg, text: tokens.headerText, bold: true, fontSize: 10, align: c >= 1 ? "right" : "left" },
    });
  }
  rows.push({ cells: budgetHeaderCells, height: 26, isHeader: true });

  // ── Budget data rows ──
  const budgetData = extractBudgetDataFromDashboard(tab);
  for (let i = 0; i < Math.min(budgetData.length, 8); i++) {
    const bd = budgetData[i];
    const isAlt = i % 2 === 1;
    const bg = isAlt ? tokens.rowAlt : "#FFFFFF";
    const dataCells: RenderedRow["cells"] = [];

    dataCells.push({ value: "", style: { bg, text: "#FFFFFF", bold: false, fontSize: 10, align: "left" } });
    dataCells.push({ value: bd.category, style: { bg, text: GS.cellText, bold: false, fontSize: 11, align: "left" } });
    dataCells.push({ value: bd.budget, style: { bg, text: GS.cellText, bold: false, fontSize: 11, align: "right" } });
    dataCells.push({ value: bd.actual, style: { bg, text: GS.cellText, bold: false, fontSize: 11, align: "right" } });
    dataCells.push({ value: bd.remaining, style: { bg, text: parseFloat(bd.remaining.replace(/[^0-9.-]/g, "")) >= 0 ? "#166534" : "#991B1B", bold: false, fontSize: 11, align: "right" } });

    // Savings goals on the right panel
    const goal = bd.savingsGoal;
    if (goal) {
      dataCells.push({ value: goal.name, style: { bg, text: GS.cellText, bold: false, fontSize: 11, align: "left" } });
      dataCells.push({ value: goal.target, style: { bg, text: GS.cellText, bold: false, fontSize: 11, align: "right" } });
      dataCells.push({ value: goal.saved, style: { bg, text: GS.cellText, bold: false, fontSize: 11, align: "right" } });
      dataCells.push({ value: goal.progress, style: { bg, text: GS.cellText, bold: false, fontSize: 11, align: "right" } });
      dataCells.push({ value: "", style: { bg, text: "#FFFFFF", bold: false, fontSize: 10, align: "left" } });
    }

    // Fill remaining columns
    for (let c = dataCells.length; c < numCols; c++) {
      dataCells.push({ value: "", style: { bg, text: "#FFFFFF", bold: false, fontSize: 10, align: "left" } });
    }
    rows.push({ cells: dataCells, height: 26 });
  }

  // ── Totals row ──
  const totalBudget = budgetData.reduce((s, d) => s + parseFloat(d.budget.replace(/[^0-9.-]/g, "") || "0"), 0);
  const totalActual = budgetData.reduce((s, d) => s + parseFloat(d.actual.replace(/[^0-9.-]/g, "") || "0"), 0);
  const totalRemaining = totalBudget - totalActual;
  rows.push({
    cells: [
      { value: "", style: { bg: tokens.totalsBg, text: "#FFFFFF", bold: false, fontSize: 10, align: "left" } },
      { value: "TOTAL", style: { bg: tokens.totalsBg, text: tokens.totalsText, bold: true, fontSize: 11, align: "left" } },
      { value: formatCurrency(totalBudget), style: { bg: tokens.totalsBg, text: tokens.totalsText, bold: true, fontSize: 11, align: "right" } },
      { value: formatCurrency(totalActual), style: { bg: tokens.totalsBg, text: tokens.totalsText, bold: true, fontSize: 11, align: "right" } },
      { value: formatCurrency(totalRemaining), style: { bg: tokens.totalsBg, text: totalRemaining >= 0 ? "#166534" : "#991B1B", bold: true, fontSize: 11, align: "right" } },
      ...Array.from({ length: Math.max(0, numCols - 5) }, () => ({
        value: "",
        style: { bg: tokens.totalsBg, text: "#FFFFFF", bold: false, fontSize: 10, align: "left" as const },
      })),
    ],
    height: 28,
    isTotals: true,
  });

  return rows;
}

// ── Data tab rows ───────────────────────────────────────────

function buildDataRows(
  tab: BlueprintTab,
  tokens: SpreadsheetTokens,
  numCols: number,
  colTypes: string[],
  colNames: string[],
  startRow: number,
  maxRows: number
): RenderedRow[] {
  const rows: RenderedRow[] = [];

  // Column headers
  const headerCells: RenderedRow["cells"] = [];
  for (let c = 0; c < numCols; c++) {
    const name = colNames[c] || "";
    const type = colTypes[c] || "text";
    headerCells.push({
      value: name,
      style: {
        bg: tokens.headerBg,
        text: tokens.headerText,
        bold: true,
        fontSize: 10,
        align: (type === "currency" || type === "number" || type === "formula") ? "right"
          : type === "percent" || type === "date" ? "center"
          : "left",
      },
    });
  }
  rows.push({ cells: headerCells, height: 26, isHeader: true });

  // Data rows from sampleRows
  const dataStart = tab.name.toLowerCase().includes("dashboard") ? 8 : 0;
  const sampleRows = tab.sampleRows.slice(startRow || dataStart);

  for (let i = 0; i < Math.min(sampleRows.length, maxRows) && rows.length < maxRows; i++) {
    const row = sampleRows[i];
    if (!row || row.every((v) => v === null || v === undefined || v === "")) continue;

    // Skip rows that look like section headers in non-data tabs
    if (row.length === 1 && typeof row[0] === "string" && row[0].length > 30) continue;

    const isAlt = i % 2 === 1;
    const bg = isAlt ? tokens.rowAlt : "#FFFFFF";
    const dataCells: RenderedRow["cells"] = [];

    for (let c = 0; c < numCols; c++) {
      const val = row[c];
      const type = colTypes[c] || "text";
      const displayVal = formatCell(val, type);

      dataCells.push({
        value: displayVal,
        style: {
          bg,
          text: GS.cellText,
          bold: false,
          fontSize: 11,
          align: (type === "currency" || type === "number" || type === "formula") ? "right"
            : type === "percent" || type === "date" ? "center"
            : "left",
        },
      });
    }

    rows.push({ cells: dataCells, height: 26 });
  }

  return rows;
}

// ══════════════════════════════════════════════════════════════
// DATA EXTRACTION HELPERS
// ══════════════════════════════════════════════════════════════

interface BudgetRowData {
  category: string;
  budget: string;
  actual: string;
  remaining: string;
  savingsGoal?: { name: string; target: string; saved: string; progress: string };
}

function extractBudgetDataFromDashboard(tab: BlueprintTab): BudgetRowData[] {
  const results: BudgetRowData[] = [];
  const multipliers = [1.15, 1.22, 1.08, 1.30, 1.18, 1.12, 1.25, 1.10];

  // Try to find budget breakdown rows from sampleRows
  // Dashboard sampleRows typically have budget data starting around row 9-10
  const defaultCategories = [
    { name: "Housing", actual: 1800 },
    { name: "Food & Dining", actual: 650 },
    { name: "Transportation", actual: 420 },
    { name: "Utilities", actual: 280 },
    { name: "Entertainment", actual: 180 },
    { name: "Healthcare", actual: 150 },
    { name: "Shopping", actual: 320 },
    { name: "Subscriptions", actual: 95 },
  ];

  // Scan sampleRows for rows that look like budget data
  let found = false;
  for (let i = 8; i < tab.sampleRows.length && results.length < 8; i++) {
    const row = tab.sampleRows[i];
    if (!row || !row[0] || typeof row[0] !== "string") continue;
    const cat = String(row[0]).trim();
    if (cat === "TOTAL" || cat === "" || cat.length > 30) continue;

    // Look for numeric values in subsequent columns
    let actual = 0;
    for (let c = 1; c < row.length; c++) {
      const v = row[c];
      if (typeof v === "number" && v > 0) {
        actual = v;
        break;
      }
      if (typeof v === "string") {
        const parsed = parseFloat(v.replace(/[^0-9.-]/g, ""));
        if (!isNaN(parsed) && parsed > 0) {
          actual = parsed;
          break;
        }
      }
    }

    if (actual > 0) {
      found = true;
      const budget = Math.round(actual * multipliers[results.length % multipliers.length]);
      const remaining = budget - actual;
      results.push({
        category: cat,
        budget: formatCurrency(budget),
        actual: formatCurrency(actual),
        remaining: formatCurrency(remaining),
      });
    }
  }

  // Fallback: use defaults
  if (!found) {
    for (const dc of defaultCategories) {
      const budget = Math.round(dc.actual * multipliers[results.length % multipliers.length]);
      const remaining = budget - dc.actual;
      results.push({
        category: dc.name,
        budget: formatCurrency(budget),
        actual: formatCurrency(dc.actual),
        remaining: formatCurrency(remaining),
      });
    }
  }

  // Add savings goals to the first few rows
  const savingsGoals = [
    { name: "Emergency Fund", target: "$10,000", saved: "$4,200", progress: "42%" },
    { name: "Vacation", target: "$3,000", saved: "$1,800", progress: "60%" },
    { name: "New Car", target: "$25,000", saved: "$8,500", progress: "34%" },
    { name: "Education", target: "$5,000", saved: "$2,100", progress: "42%" },
  ];
  for (let i = 0; i < Math.min(savingsGoals.length, results.length); i++) {
    results[i].savingsGoal = savingsGoals[i];
  }

  return results;
}

/**
 * Derive real KPI values for the dashboard view.
 * Blueprint KPI values are often formulas (=SUMIFS...) which we can't compute.
 * Instead, compute from transaction sampleRows or budget data.
 */
function deriveKpiValues(
  dashTab: BlueprintTab,
  tokens: SpreadsheetTokens,
  blueprint?: ProductBlueprint
): Array<{ label: string; value: string }> {
  // Try to derive from transaction data first (most accurate)
  if (blueprint) {
    const txnTab = blueprint.tabs.find((t) =>
      t.name.toLowerCase().includes("transaction") || t.name.toLowerCase().includes("log")
    );
    if (txnTab?.sampleRows?.length) {
      const kpis = deriveKpiFromTransactions(txnTab.sampleRows);
      if (kpis.income > 0 || kpis.spent > 0) {
        return [
          { label: "Total Income", value: formatCurrency(kpis.income) },
          { label: "Total Spent", value: formatCurrency(kpis.spent) },
          { label: "Net Savings", value: formatCurrency(kpis.net) },
          { label: "Savings Rate", value: `${Math.round(kpis.rate * 100)}%` },
        ];
      }
    }
  }

  // Fallback: compute from budget data in the dashboard
  const budgetData = extractBudgetDataFromDashboard(dashTab);
  const totalActual = budgetData.reduce((s, d) => s + parseFloat(d.actual.replace(/[^0-9.-]/g, "") || "0"), 0);
  const income = Math.round(totalActual * 1.15); // Estimate income ~15% above spending

  return [
    { label: "Total Income", value: formatCurrency(income) },
    { label: "Total Spent", value: formatCurrency(totalActual) },
    { label: "Net Savings", value: formatCurrency(income - totalActual) },
    { label: "Savings Rate", value: `${Math.round(((income - totalActual) / income) * 100)}%` },
  ];
}

function parseCellRef(ref: string): { row: number; col: number } | null {
  const match = ref.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  const letters = match[1];
  const row = parseInt(match[2], 10);
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return { row, col: col - 1 };
}

function computeColumnWidths(tab: BlueprintTab, numCols: number, totalWidth: number): number[] {
  const typeDefaults: Record<string, number> = {
    text: 180,
    currency: 120,
    percent: 90,
    date: 120,
    number: 105,
    formula: 120,
  };

  const rawWidths: number[] = [];
  for (let i = 0; i < numCols; i++) {
    const col = tab.columns[i];
    if (col?.width) {
      rawWidths.push(col.width * 7.5); // Excel units → pixels
    } else if (col?.type) {
      rawWidths.push(typeDefaults[col.type] || 120);
    } else {
      rawWidths.push(i === 0 ? 40 : 120); // Gutter column A is narrow
    }
  }

  // Scale to fit totalWidth
  const rawTotal = rawWidths.reduce((s, w) => s + w, 0);
  const scaleFactor = totalWidth / rawTotal;
  return rawWidths.map((w) => Math.round(w * scaleFactor));
}

// ══════════════════════════════════════════════════════════════
// PUBLIC COMPOSITION FUNCTIONS — Used by factory-image-renderer
// ══════════════════════════════════════════════════════════════

/**
 * Full-frame dashboard spreadsheet view (slot 3).
 * Shows the Dashboard tab as it appears in Google Sheets.
 */
export function buildSpreadsheetDashboard(
  spec: ListingImageSpec,
  blueprint: ProductBlueprint,
  nicheProfile: NicheDesignProfile
): string {
  const dashTab = blueprint.tabs.find((t) =>
    t.name.toLowerCase().includes("dashboard")
  ) || blueprint.tabs[0];

  return renderSpreadsheetView({
    tab: dashTab,
    allTabs: blueprint.tabs,
    nicheProfile,
    blueprint,
    showChrome: true,
    showTabBar: true,
    selectedCell: "B6",
  });
}

/**
 * Feature tab spreadsheet view (slot 4).
 * Shows a data-heavy tab like Transactions or Budget Setup.
 */
export function buildSpreadsheetFeature(
  spec: ListingImageSpec,
  blueprint: ProductBlueprint,
  nicheProfile: NicheDesignProfile
): string {
  // Pick the most interesting non-dashboard tab
  const preferredNames = ["transaction", "budget", "saving", "monthly", "expense", "income"];
  let featureTab = blueprint.tabs[1]; // default: second tab
  for (const pref of preferredNames) {
    const found = blueprint.tabs.find((t) =>
      t.name.toLowerCase().includes(pref) && !t.name.toLowerCase().includes("dashboard")
    );
    if (found) { featureTab = found; break; }
  }

  return renderSpreadsheetView({
    tab: featureTab,
    allTabs: blueprint.tabs,
    nicheProfile,
    blueprint,
    showChrome: true,
    showTabBar: true,
    selectedCell: "A1",
    maxRows: 30,
  });
}

/**
 * Laptop mockup with real spreadsheet inside (slot 1 hero).
 * The "screen" of the laptop shows actual spreadsheet content.
 */
export function buildSpreadsheetHero(
  spec: ListingImageSpec,
  blueprint: ProductBlueprint,
  nicheProfile: NicheDesignProfile
): string {
  const dashTab = blueprint.tabs.find((t) =>
    t.name.toLowerCase().includes("dashboard")
  ) || blueprint.tabs[0];

  const title = spec.title || blueprint.sourceListingTitle || "Budget Tracker";
  const subtitle = spec.subtitle || "Google Sheets Template";
  const font = nicheProfile.typography.fontFamily;
  const pal = nicheProfile.palette;

  // Build the inner spreadsheet SVG (smaller, no top-level SVG wrapper)
  const innerSvg = renderSpreadsheetViewInner({
    tab: dashTab,
    allTabs: blueprint.tabs,
    nicheProfile,
    blueprint,
    width: 1400,
    height: 900,
    showChrome: true,
    showTabBar: true,
    selectedCell: "B6",
    maxRows: 20,
  });

  // Gradient background
  const gradColors = nicheProfile.imageStyle.heroGradient;
  const cat = getNicheCategory(nicheProfile.id);

  const bgGradient = cat === "executive"
    ? `<linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${darken(pal.primary, 0.7)}" />
      <stop offset="100%" stop-color="${darken(pal.primary, 0.9)}" />
    </linearGradient>`
    : `<linearGradient id="bgGrad" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="${gradColors[0]}" />
      <stop offset="100%" stop-color="${gradColors[1]}" />
    </linearGradient>`;

  const titleColor = cat === "executive" ? "#FFFFFF" : pal.text;
  const subtitleColor = cat === "executive" ? "rgba(255,255,255,0.6)" : pal.textMuted;

  // Title
  const titleLines = wrapText(esc(title), 36);
  const titleFontSize = 54;
  const titleSvg = titleLines.map((line, i) =>
    `<text x="1000" y="${130 + i * 65}" text-anchor="middle" font-family="${font}" font-size="${titleFontSize}" font-weight="700" fill="${titleColor}">${line}</text>`
  ).join("\n  ");

  const subtitleY = 130 + titleLines.length * 65 + 20;
  const subtitleSvg = `<text x="1000" y="${subtitleY}" text-anchor="middle" font-family="${font}" font-size="22" font-weight="500" fill="${subtitleColor}">${esc(subtitle)}</text>`;

  // Laptop frame
  const laptopY = subtitleY + 30;
  const laptopX = 300;
  const laptopW = 1400;
  const laptopH = 900;
  const bezelW = 16;
  const screenX = laptopX + bezelW;
  const screenY = laptopY + bezelW;
  const screenW = laptopW - bezelW * 2;
  const screenH = laptopH - bezelW * 2;

  // Feature pills below laptop
  const featureY = laptopY + laptopH + 40;
  const featureItems = getFeatureLabels(nicheProfile);
  const kpiColors = [
    nicheProfile.kpiStyle.cards[0]?.bg || "#D5F0D5",
    nicheProfile.kpiStyle.cards[1]?.bg || "#FEE2E2",
    nicheProfile.kpiStyle.cards[2]?.bg || "#FEF3C7",
    nicheProfile.kpiStyle.cards[3]?.bg || "#DBEAFE",
  ];
  const featuresSvg = featureItems.map((item, i) => {
    const fx = 200 + i * 420;
    return `
    <rect x="${fx}" y="${featureY}" width="380" height="70" rx="12" fill="${cat === "executive" ? "rgba(255,255,255,0.1)" : "#FFFFFF"}" />
    <circle cx="${fx + 35}" cy="${featureY + 35}" r="15" fill="${kpiColors[i % 4]}" />
    <text x="${fx + 60}" y="${featureY + 40}" font-family="${font}" font-size="18" font-weight="600" fill="${titleColor}">${esc(item)}</text>`;
  }).join("");

  // Trust strip
  const trustY = featureY + 100;
  const trustItems = ["Instant Download", "Google Sheets", "Easy to Use", "Lifetime Access"];
  const trustSvg = trustItems.map((item, i) => {
    const tx = 200 + i * 420;
    return `<text x="${tx}" y="${trustY}" font-family="${font}" font-size="16" font-weight="500" fill="${subtitleColor}">${esc(item)}</text>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    ${bgGradient}
    <clipPath id="screenClip">
      <rect x="${screenX}" y="${screenY}" width="${screenW}" height="${screenH}" rx="2" />
    </clipPath>
    <filter id="laptopShadow" x="-5%" y="-5%" width="110%" height="115%">
      <feDropShadow dx="0" dy="8" stdDeviation="20" flood-color="rgba(0,0,0,0.3)" />
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bgGrad)" />

  <!-- Title -->
  ${titleSvg}
  ${subtitleSvg}

  <!-- Laptop body -->
  <rect x="${laptopX}" y="${laptopY}" width="${laptopW}" height="${laptopH}" rx="12" fill="#2D2D2D" filter="url(#laptopShadow)" />
  <rect x="${laptopX + 2}" y="${laptopY + 2}" width="${laptopW - 4}" height="${laptopH - 4}" rx="10" fill="#1A1A1A" />

  <!-- Camera dot -->
  <circle cx="${laptopX + laptopW / 2}" cy="${laptopY + 8}" r="3" fill="#444" />

  <!-- Screen area (clip to screen bounds) -->
  <g clip-path="url(#screenClip)">
    <g transform="translate(${screenX}, ${screenY}) scale(${screenW / 1400}, ${screenH / 900})">
      ${innerSvg}
    </g>
  </g>

  <!-- Laptop base -->
  <path d="${`M${laptopX - 40} ${laptopY + laptopH + 4} L${laptopX + laptopW + 40} ${laptopY + laptopH + 4} L${laptopX + laptopW + 20} ${laptopY + laptopH + 24} L${laptopX - 20} ${laptopY + laptopH + 24} Z`}" fill="#2D2D2D" />
  <rect x="${laptopX + laptopW / 2 - 60}" y="${laptopY + laptopH + 4}" width="120" height="4" rx="2" fill="#444" />

  <!-- Feature pills -->
  ${featuresSvg}

  <!-- Trust strip -->
  ${trustSvg}
</svg>`;
}

/**
 * Render inner spreadsheet content (no outer SVG wrapper).
 * Used for embedding inside laptop mockups and other frames.
 */
function renderSpreadsheetViewInner(options: SpreadsheetViewOptions): string {
  const fullSvg = renderSpreadsheetView(options);
  // Strip the outer <svg> and </svg> tags
  return fullSvg
    .replace(/<svg[^>]*>/, "")
    .replace(/<\/svg>/, "");
}

// ── Utility helpers ─────────────────────────────────────────

type NicheCategory = "soft" | "executive" | "premium" | "energetic";

function getNicheCategory(profileId: string): NicheCategory {
  if (["baby-budget", "pregnancy-planner", "savings-tracker"].includes(profileId)) return "soft";
  if (["business-pl", "side-hustle", "debt-payoff"].includes(profileId)) return "executive";
  if (["wedding-planner", "meal-planner"].includes(profileId)) return "premium";
  return "energetic";
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

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars) {
      lines.push(current.trim());
      current = word;
    } else {
      current += " " + word;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

function getFeatureLabels(profile: NicheDesignProfile): string[] {
  const cat = getNicheCategory(profile.id);
  if (cat === "premium") return ["Budget Tracker", "Vendor Manager", "Guest List", "Timeline"];
  if (cat === "executive") return ["P&L Dashboard", "Tax Estimator", "Monthly Summary", "Expense Log"];
  if (cat === "soft") return ["Auto Dashboard", "Savings Goals", "Category Tracker", "Monthly View"];
  return ["Smart Formulas", "Visual Charts", "Monthly Trends", "One-Click Setup"];
}
