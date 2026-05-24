// ══════════════════════════════════════════════════════════════
// GWS Sheets Formatter
// Generates GWS CLI batchUpdate commands to format a
// budget tracker spreadsheet into a premium Etsy product.
//
// Usage:
//   const cmds = buildFormattingCommands(spreadsheetId);
//   // Execute via POST /api/gws/execute { commands: cmds }
// ══════════════════════════════════════════════════════════════

function batchCmd(spreadsheetId: string, requests: object[]): string {
  const json = JSON.stringify({ requests });
  return `gws sheets spreadsheets batchUpdate --params '{"spreadsheetId":"${spreadsheetId}"}' --json '${json.replace(/'/g, "'\\''")}'`;
}

// ── Color helpers (hex → 0-1 RGB) ────────────────────────────

function hex(h: string): { red: number; green: number; blue: number } {
  const r = parseInt(h.slice(1, 3), 16) / 255;
  const g = parseInt(h.slice(3, 5), 16) / 255;
  const b = parseInt(h.slice(5, 7), 16) / 255;
  return { red: +r.toFixed(3), green: +g.toFixed(3), blue: +b.toFixed(3) };
}

const NAVY = hex("#1B3A5C");
const NAVY_DARK = hex("#142B45");
const GOLD = hex("#D4AF37");
const GREEN = hex("#22C55E");
const RED = hex("#EF4444");
const ROSE = hex("#CC6666");
const WHITE = { red: 1, green: 1, blue: 1 };
const MUTED = hex("#94A3B8");
const BG_DARK = hex("#0C1222");
const ROW_A = hex("#19263A");
const ROW_B = hex("#0F1726");

// ── Main: Build all formatting commands ──────────────────────

export function buildFormattingCommands(spreadsheetId: string): string[] {
  const commands: string[] = [];

  // ── BATCH 1: Header, subtitle, controls, column widths ──
  commands.push(batchCmd(spreadsheetId, [
    // Merge header
    { mergeCells: { range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 12 }, mergeType: "MERGE_ALL" } },
    { mergeCells: { range: { sheetId: 0, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 12 }, mergeType: "MERGE_ALL" } },
    // Header style
    { repeatCell: { range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 12 },
      cell: { userEnteredFormat: { backgroundColor: NAVY, textFormat: { foregroundColor: WHITE, bold: true, fontSize: 18, fontFamily: "Arial" }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } },
      fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)" } },
    // Subtitle style
    { repeatCell: { range: { sheetId: 0, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 12 },
      cell: { userEnteredFormat: { backgroundColor: NAVY_DARK, textFormat: { foregroundColor: GOLD, bold: true, fontSize: 13, fontFamily: "Arial" }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } },
      fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)" } },
    // Controls row
    { repeatCell: { range: { sheetId: 0, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 12 },
      cell: { userEnteredFormat: { backgroundColor: hex("#1F2937"), textFormat: { foregroundColor: MUTED, bold: true, fontSize: 11 }, verticalAlignment: "MIDDLE" } },
      fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)" } },
    { repeatCell: { range: { sheetId: 0, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 2, endColumnIndex: 3 },
      cell: { userEnteredFormat: { textFormat: { foregroundColor: GOLD, bold: true, fontSize: 13 } } },
      fields: "userEnteredFormat(textFormat)" } },
    { repeatCell: { range: { sheetId: 0, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 8, endColumnIndex: 9 },
      cell: { userEnteredFormat: { textFormat: { foregroundColor: GOLD, bold: true, fontSize: 14 }, numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" } } },
      fields: "userEnteredFormat(textFormat,numberFormat)" } },
    // Row heights
    { updateDimensionProperties: { range: { sheetId: 0, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 52 }, fields: "pixelSize" } },
    { updateDimensionProperties: { range: { sheetId: 0, dimension: "ROWS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 32 }, fields: "pixelSize" } },
    { updateDimensionProperties: { range: { sheetId: 0, dimension: "ROWS", startIndex: 2, endIndex: 3 }, properties: { pixelSize: 36 }, fields: "pixelSize" } },
    { updateDimensionProperties: { range: { sheetId: 0, dimension: "ROWS", startIndex: 3, endIndex: 4 }, properties: { pixelSize: 8 }, fields: "pixelSize" } },
    // Column widths
    ...[30, 170, 110, 110, 110, 100, 20, 160, 110, 110, 100, 120].map((px, i) => ({
      updateDimensionProperties: { range: { sheetId: 0, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: "pixelSize" }
    })),
  ]));

  // ── BATCH 2: KPI cards ──
  commands.push(batchCmd(spreadsheetId, [
    // Labels row
    { repeatCell: { range: { sheetId: 0, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 12 },
      cell: { userEnteredFormat: { backgroundColor: BG_DARK, textFormat: { foregroundColor: MUTED, bold: true, fontSize: 9 }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } },
      fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)" } },
    { updateDimensionProperties: { range: { sheetId: 0, dimension: "ROWS", startIndex: 4, endIndex: 5 }, properties: { pixelSize: 24 }, fields: "pixelSize" } },
    // Income KPI (green)
    { repeatCell: { range: { sheetId: 0, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 1, endColumnIndex: 2 },
      cell: { userEnteredFormat: { backgroundColor: hex("#142E14"), textFormat: { foregroundColor: GREEN, bold: true, fontSize: 20 }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE", numberFormat: { type: "CURRENCY", pattern: "$#,##0" } } },
      fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,numberFormat)" } },
    // Spent KPI (red)
    { repeatCell: { range: { sheetId: 0, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 3, endColumnIndex: 4 },
      cell: { userEnteredFormat: { backgroundColor: hex("#381010"), textFormat: { foregroundColor: RED, bold: true, fontSize: 20 }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE", numberFormat: { type: "CURRENCY", pattern: "$#,##0" } } },
      fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,numberFormat)" } },
    // Savings KPI (gold)
    { repeatCell: { range: { sheetId: 0, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 6, endColumnIndex: 7 },
      cell: { userEnteredFormat: { backgroundColor: hex("#2E2308"), textFormat: { foregroundColor: GOLD, bold: true, fontSize: 20 }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE", numberFormat: { type: "CURRENCY", pattern: "$#,##0" } } },
      fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,numberFormat)" } },
    // Rate KPI
    { repeatCell: { range: { sheetId: 0, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 8, endColumnIndex: 9 },
      cell: { userEnteredFormat: { backgroundColor: BG_DARK, textFormat: { foregroundColor: GREEN, bold: true, fontSize: 20 }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE", numberFormat: { type: "PERCENT", pattern: "0%" } } },
      fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,numberFormat)" } },
    { updateDimensionProperties: { range: { sheetId: 0, dimension: "ROWS", startIndex: 5, endIndex: 6 }, properties: { pixelSize: 48 }, fields: "pixelSize" } },
    { updateDimensionProperties: { range: { sheetId: 0, dimension: "ROWS", startIndex: 6, endIndex: 7 }, properties: { pixelSize: 8 }, fields: "pixelSize" } },
  ]));

  // ── BATCH 3: Section headers ──
  commands.push(batchCmd(spreadsheetId, [
    // Savings Goals header (rose)
    { mergeCells: { range: { sheetId: 0, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 1, endColumnIndex: 6 }, mergeType: "MERGE_ALL" } },
    { repeatCell: { range: { sheetId: 0, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 1, endColumnIndex: 6 },
      cell: { userEnteredFormat: { backgroundColor: ROSE, textFormat: { foregroundColor: WHITE, bold: true, fontSize: 11 }, horizontalAlignment: "LEFT", verticalAlignment: "MIDDLE" } },
      fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)" } },
    // Where Money Went header (navy)
    { mergeCells: { range: { sheetId: 0, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 7, endColumnIndex: 12 }, mergeType: "MERGE_ALL" } },
    { repeatCell: { range: { sheetId: 0, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 7, endColumnIndex: 12 },
      cell: { userEnteredFormat: { backgroundColor: NAVY, textFormat: { foregroundColor: WHITE, bold: true, fontSize: 11 }, horizontalAlignment: "LEFT", verticalAlignment: "MIDDLE" } },
      fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)" } },
    { updateDimensionProperties: { range: { sheetId: 0, dimension: "ROWS", startIndex: 7, endIndex: 8 }, properties: { pixelSize: 32 }, fields: "pixelSize" } },
    // Column header rows
    { repeatCell: { range: { sheetId: 0, startRowIndex: 8, endRowIndex: 9, startColumnIndex: 1, endColumnIndex: 12 },
      cell: { userEnteredFormat: { backgroundColor: NAVY, textFormat: { foregroundColor: hex("#BFC8D4"), bold: true, fontSize: 9 }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } },
      fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)" } },
    { updateDimensionProperties: { range: { sheetId: 0, dimension: "ROWS", startIndex: 8, endIndex: 9 }, properties: { pixelSize: 26 }, fields: "pixelSize" } },
    // Goal Allocation header
    { mergeCells: { range: { sheetId: 0, startRowIndex: 16, endRowIndex: 17, startColumnIndex: 1, endColumnIndex: 7 }, mergeType: "MERGE_ALL" } },
    { repeatCell: { range: { sheetId: 0, startRowIndex: 16, endRowIndex: 17, startColumnIndex: 1, endColumnIndex: 7 },
      cell: { userEnteredFormat: { backgroundColor: NAVY, textFormat: { foregroundColor: GOLD, bold: true, fontSize: 11 }, horizontalAlignment: "LEFT", verticalAlignment: "MIDDLE" } },
      fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)" } },
    { updateDimensionProperties: { range: { sheetId: 0, dimension: "ROWS", startIndex: 16, endIndex: 17 }, properties: { pixelSize: 32 }, fields: "pixelSize" } },
    { repeatCell: { range: { sheetId: 0, startRowIndex: 17, endRowIndex: 18, startColumnIndex: 1, endColumnIndex: 7 },
      cell: { userEnteredFormat: { backgroundColor: NAVY, textFormat: { foregroundColor: hex("#BFC8D4"), bold: true, fontSize: 9 }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } },
      fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)" } },
  ]));

  // ── BATCH 4: Data row styling + number formats ──
  commands.push(batchCmd(spreadsheetId, [
    // Savings goals data rows (10-13) left panel
    ...[9, 11].map(r => ({ repeatCell: { range: { sheetId: 0, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 1, endColumnIndex: 6 },
      cell: { userEnteredFormat: { backgroundColor: ROW_A, textFormat: { foregroundColor: hex("#DEE4EB"), fontSize: 10 }, verticalAlignment: "MIDDLE" } },
      fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)" } })),
    ...[10, 12].map(r => ({ repeatCell: { range: { sheetId: 0, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 1, endColumnIndex: 6 },
      cell: { userEnteredFormat: { backgroundColor: ROW_B, textFormat: { foregroundColor: hex("#DEE4EB"), fontSize: 10 }, verticalAlignment: "MIDDLE" } },
      fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)" } })),
    // Totals row
    { repeatCell: { range: { sheetId: 0, startRowIndex: 13, endRowIndex: 14, startColumnIndex: 1, endColumnIndex: 6 },
      cell: { userEnteredFormat: { backgroundColor: NAVY, textFormat: { foregroundColor: WHITE, bold: true, fontSize: 10 } } },
      fields: "userEnteredFormat(backgroundColor,textFormat)" } },
    // Currency format for goals C-E
    { repeatCell: { range: { sheetId: 0, startRowIndex: 9, endRowIndex: 14, startColumnIndex: 2, endColumnIndex: 5 },
      cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "$#,##0" }, horizontalAlignment: "RIGHT" } },
      fields: "userEnteredFormat(numberFormat,horizontalAlignment)" } },
    // Progress as percentage
    { repeatCell: { range: { sheetId: 0, startRowIndex: 9, endRowIndex: 14, startColumnIndex: 5, endColumnIndex: 6 },
      cell: { userEnteredFormat: { numberFormat: { type: "PERCENT", pattern: "0%" }, horizontalAlignment: "CENTER" } },
      fields: "userEnteredFormat(numberFormat,horizontalAlignment)" } },
    // Right panel data rows
    ...[9, 11].map(r => ({ repeatCell: { range: { sheetId: 0, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 7, endColumnIndex: 12 },
      cell: { userEnteredFormat: { backgroundColor: ROW_A, textFormat: { foregroundColor: hex("#DEE4EB"), fontSize: 10 }, verticalAlignment: "MIDDLE" } },
      fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)" } })),
    ...[10, 12].map(r => ({ repeatCell: { range: { sheetId: 0, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 7, endColumnIndex: 12 },
      cell: { userEnteredFormat: { backgroundColor: ROW_B, textFormat: { foregroundColor: hex("#DEE4EB"), fontSize: 10 }, verticalAlignment: "MIDDLE" } },
      fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)" } })),
    { repeatCell: { range: { sheetId: 0, startRowIndex: 13, endRowIndex: 14, startColumnIndex: 7, endColumnIndex: 12 },
      cell: { userEnteredFormat: { backgroundColor: NAVY, textFormat: { foregroundColor: WHITE, bold: true, fontSize: 10 } } },
      fields: "userEnteredFormat(backgroundColor,textFormat)" } },
    { repeatCell: { range: { sheetId: 0, startRowIndex: 9, endRowIndex: 14, startColumnIndex: 8, endColumnIndex: 11 },
      cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" }, horizontalAlignment: "RIGHT" } },
      fields: "userEnteredFormat(numberFormat,horizontalAlignment)" } },
    // Allocation data rows
    ...[18, 20].map(r => ({ repeatCell: { range: { sheetId: 0, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 1, endColumnIndex: 7 },
      cell: { userEnteredFormat: { backgroundColor: ROW_A, textFormat: { foregroundColor: hex("#DEE4EB"), fontSize: 10 }, verticalAlignment: "MIDDLE" } },
      fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)" } })),
    ...[19, 21].map(r => ({ repeatCell: { range: { sheetId: 0, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 1, endColumnIndex: 7 },
      cell: { userEnteredFormat: { backgroundColor: ROW_B, textFormat: { foregroundColor: hex("#DEE4EB"), fontSize: 10 }, verticalAlignment: "MIDDLE" } },
      fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)" } })),
    { repeatCell: { range: { sheetId: 0, startRowIndex: 22, endRowIndex: 23, startColumnIndex: 1, endColumnIndex: 7 },
      cell: { userEnteredFormat: { backgroundColor: NAVY, textFormat: { foregroundColor: WHITE, bold: true, fontSize: 10 } } },
      fields: "userEnteredFormat(backgroundColor,textFormat)" } },
    { repeatCell: { range: { sheetId: 0, startRowIndex: 18, endRowIndex: 23, startColumnIndex: 2, endColumnIndex: 3 },
      cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "0\"%\"" }, horizontalAlignment: "CENTER" } },
      fields: "userEnteredFormat(numberFormat,horizontalAlignment)" } },
    { repeatCell: { range: { sheetId: 0, startRowIndex: 18, endRowIndex: 23, startColumnIndex: 3, endColumnIndex: 4 },
      cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "$#,##0" }, horizontalAlignment: "RIGHT" } },
      fields: "userEnteredFormat(numberFormat,horizontalAlignment)" } },
    { repeatCell: { range: { sheetId: 0, startRowIndex: 18, endRowIndex: 23, startColumnIndex: 4, endColumnIndex: 5 },
      cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "0\"%\"" }, horizontalAlignment: "CENTER" } },
      fields: "userEnteredFormat(numberFormat,horizontalAlignment)" } },
    { repeatCell: { range: { sheetId: 0, startRowIndex: 18, endRowIndex: 23, startColumnIndex: 5, endColumnIndex: 6 },
      cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" }, horizontalAlignment: "RIGHT" } },
      fields: "userEnteredFormat(numberFormat,horizontalAlignment)" } },
    { updateDimensionProperties: { range: { sheetId: 0, dimension: "ROWS", startIndex: 14, endIndex: 16 }, properties: { pixelSize: 8 }, fields: "pixelSize" } },
  ]));

  // ── BATCH 5: Conditional formatting + validation + freeze + gridlines ──
  commands.push(batchCmd(spreadsheetId, [
    { addConditionalFormatRule: { rule: { ranges: [{ sheetId: 0, startRowIndex: 9, endRowIndex: 13, startColumnIndex: 11, endColumnIndex: 12 }], booleanRule: { condition: { type: "TEXT_CONTAINS", values: [{ userEnteredValue: "On Track" }] }, format: { textFormat: { foregroundColor: GREEN }, backgroundColor: hex("#142E14") } } }, index: 0 } },
    { addConditionalFormatRule: { rule: { ranges: [{ sheetId: 0, startRowIndex: 9, endRowIndex: 13, startColumnIndex: 11, endColumnIndex: 12 }], booleanRule: { condition: { type: "TEXT_CONTAINS", values: [{ userEnteredValue: "⚠️" }] }, format: { textFormat: { foregroundColor: hex("#F59E0B") }, backgroundColor: hex("#38290A") } } }, index: 1 } },
    { addConditionalFormatRule: { rule: { ranges: [{ sheetId: 0, startRowIndex: 9, endRowIndex: 13, startColumnIndex: 11, endColumnIndex: 12 }], booleanRule: { condition: { type: "TEXT_CONTAINS", values: [{ userEnteredValue: "Over" }] }, format: { textFormat: { foregroundColor: RED }, backgroundColor: hex("#381010") } } }, index: 2 } },
    { addConditionalFormatRule: { rule: { ranges: [{ sheetId: 0, startRowIndex: 9, endRowIndex: 13, startColumnIndex: 10, endColumnIndex: 11 }], booleanRule: { condition: { type: "NUMBER_LESS", values: [{ userEnteredValue: "0" }] }, format: { textFormat: { foregroundColor: RED } } } }, index: 3 } },
    { addConditionalFormatRule: { rule: { ranges: [{ sheetId: 0, startRowIndex: 9, endRowIndex: 13, startColumnIndex: 10, endColumnIndex: 11 }], booleanRule: { condition: { type: "NUMBER_GREATER", values: [{ userEnteredValue: "0" }] }, format: { textFormat: { foregroundColor: GREEN } } } }, index: 4 } },
    // Month dropdown
    { setDataValidation: { range: { sheetId: 0, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 2, endColumnIndex: 3 },
      rule: { condition: { type: "ONE_OF_LIST", values: ["January","February","March","April","May","June","July","August","September","October","November","December"].map(m => ({ userEnteredValue: m })) }, showCustomUi: true, strict: true } } },
    // Freeze rows
    { updateSheetProperties: { properties: { sheetId: 0, gridProperties: { frozenRowCount: 3 } }, fields: "gridProperties.frozenRowCount" } },
    { updateSheetProperties: { properties: { sheetId: 1, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
    { updateSheetProperties: { properties: { sheetId: 2, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
    { updateSheetProperties: { properties: { sheetId: 3, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
    { updateSheetProperties: { properties: { sheetId: 4, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
    // Hide gridlines
    { updateSheetProperties: { properties: { sheetId: 0, gridProperties: { hideGridlines: true } }, fields: "gridProperties.hideGridlines" } },
    // Dark bg for spacer areas
    { repeatCell: { range: { sheetId: 0, startRowIndex: 0, endRowIndex: 40, startColumnIndex: 0, endColumnIndex: 1 },
      cell: { userEnteredFormat: { backgroundColor: BG_DARK } }, fields: "userEnteredFormat(backgroundColor)" } },
    { repeatCell: { range: { sheetId: 0, startRowIndex: 0, endRowIndex: 40, startColumnIndex: 6, endColumnIndex: 7 },
      cell: { userEnteredFormat: { backgroundColor: BG_DARK } }, fields: "userEnteredFormat(backgroundColor)" } },
    { repeatCell: { range: { sheetId: 0, startRowIndex: 23, endRowIndex: 40, startColumnIndex: 0, endColumnIndex: 12 },
      cell: { userEnteredFormat: { backgroundColor: BG_DARK } }, fields: "userEnteredFormat(backgroundColor)" } },
    // Borders
    { updateBorders: { range: { sheetId: 0, startRowIndex: 9, endRowIndex: 14, startColumnIndex: 1, endColumnIndex: 6 },
      top: { style: "SOLID", color: hex("#334155") }, bottom: { style: "SOLID", color: hex("#334155") }, innerHorizontal: { style: "SOLID", color: hex("#263549") } } },
    { updateBorders: { range: { sheetId: 0, startRowIndex: 9, endRowIndex: 14, startColumnIndex: 7, endColumnIndex: 12 },
      top: { style: "SOLID", color: hex("#334155") }, bottom: { style: "SOLID", color: hex("#334155") }, innerHorizontal: { style: "SOLID", color: hex("#263549") } } },
    { updateBorders: { range: { sheetId: 0, startRowIndex: 18, endRowIndex: 23, startColumnIndex: 1, endColumnIndex: 7 },
      top: { style: "SOLID", color: hex("#334155") }, bottom: { style: "SOLID", color: hex("#334155") }, innerHorizontal: { style: "SOLID", color: hex("#263549") } } },
  ]));

  // ── BATCH 6: Charts ──
  commands.push(batchCmd(spreadsheetId, [
    // Donut Chart: Savings Goal Progress
    { addChart: { chart: { spec: {
      title: "Savings Goal Progress",
      pieChart: {
        legendPosition: "BOTTOM_LEGEND",
        pieHole: 0.5,
        domain: { sourceRange: { sources: [{ sheetId: 4, startRowIndex: 1, endRowIndex: 6, startColumnIndex: 1, endColumnIndex: 2 }] } },
        series: { sourceRange: { sources: [{ sheetId: 4, startRowIndex: 1, endRowIndex: 6, startColumnIndex: 3, endColumnIndex: 4 }] } },
      },
      backgroundColorStyle: { rgbColor: BG_DARK },
      titleTextFormat: { foregroundColorStyle: { rgbColor: WHITE }, fontSize: 12, bold: true },
    }, position: { overlayPosition: { anchorCell: { sheetId: 0, rowIndex: 24, columnIndex: 1 }, widthPixels: 480, heightPixels: 350 } } } } },
    // Donut Chart: Where Money Went
    { addChart: { chart: { spec: {
      title: "Where My Money Went",
      pieChart: {
        legendPosition: "BOTTOM_LEGEND",
        pieHole: 0.5,
        domain: { sourceRange: { sources: [{ sheetId: 0, startRowIndex: 9, endRowIndex: 13, startColumnIndex: 7, endColumnIndex: 8 }] } },
        series: { sourceRange: { sources: [{ sheetId: 0, startRowIndex: 9, endRowIndex: 13, startColumnIndex: 9, endColumnIndex: 10 }] } },
      },
      backgroundColorStyle: { rgbColor: BG_DARK },
      titleTextFormat: { foregroundColorStyle: { rgbColor: WHITE }, fontSize: 12, bold: true },
    }, position: { overlayPosition: { anchorCell: { sheetId: 0, rowIndex: 24, columnIndex: 6 }, widthPixels: 480, heightPixels: 350 } } } } },
    // Column Chart: Goal vs Actual
    { addChart: { chart: { spec: {
      title: "Goal vs Actual by Bucket",
      basicChart: {
        chartType: "COLUMN",
        legendPosition: "TOP_LEGEND",
        axis: [
          { position: "BOTTOM_AXIS", title: "" },
          { position: "LEFT_AXIS", title: "$" },
        ],
        domains: [{ domain: { sourceRange: { sources: [{ sheetId: 0, startRowIndex: 17, endRowIndex: 22, startColumnIndex: 1, endColumnIndex: 2 }] } } }],
        series: [
          { series: { sourceRange: { sources: [{ sheetId: 0, startRowIndex: 17, endRowIndex: 22, startColumnIndex: 3, endColumnIndex: 4 }] } }, colorStyle: { rgbColor: NAVY } },
          { series: { sourceRange: { sources: [{ sheetId: 0, startRowIndex: 17, endRowIndex: 22, startColumnIndex: 5, endColumnIndex: 6 }] } }, colorStyle: { rgbColor: GOLD } },
        ],
        headerCount: 1,
      },
      backgroundColorStyle: { rgbColor: BG_DARK },
      titleTextFormat: { foregroundColorStyle: { rgbColor: WHITE }, fontSize: 12, bold: true },
    }, position: { overlayPosition: { anchorCell: { sheetId: 0, rowIndex: 37, columnIndex: 1 }, widthPixels: 900, heightPixels: 350 } } } } },
  ]));

  return commands;
}

// ── Convenience: execute all formatting via API ──────────────

export async function applyFormattingViaAPI(spreadsheetId: string): Promise<{ success: boolean; error?: string }> {
  const commands = buildFormattingCommands(spreadsheetId);
  try {
    const resp = await fetch("/api/gws/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      return { success: false, error: err.error || "Formatting failed" };
    }
    const data = await resp.json();
    return { success: data.success, error: data.failed > 0 ? `${data.failed} commands failed` : undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error" };
  }
}
