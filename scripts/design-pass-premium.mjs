/**
 * ══════════════════════════════════════════════════════════════
 * DESIGN PASS — Premium Dashboard Transformation
 *
 * Transforms the existing Pay Yourself First spreadsheet from
 * "formatted spreadsheet" → "premium Etsy product dashboard"
 *
 * Changes: KPI card redesign, layout breathing room, grid removal,
 * section composition, chart repositioning, sparkline wow element
 * ══════════════════════════════════════════════════════════════
 */
import { google } from 'googleapis';
import { getAuthClient } from './gws-oauth-helper.mjs';

const SHEET_ID = '1JcMZbhcBReuH56UwjjqAYAVqKHW8832bqptlfCxcq8E';

const hex = (h) => ({
  red: parseInt(h.slice(1, 3), 16) / 255,
  green: parseInt(h.slice(3, 5), 16) / 255,
  blue: parseInt(h.slice(5, 7), 16) / 255,
});

const C = {
  navy:      hex('#1B3A5C'),
  darkBg:    hex('#0F172A'),
  cardBg:    hex('#162033'),
  cardBg2:   hex('#1A2740'),  // slightly lighter card for separation
  altRow:    hex('#1E293B'),
  elevCard:  hex('#1E2D45'),  // elevated card background
  gold:      hex('#D4AF37'),
  rose:      hex('#CC6666'),
  green:     hex('#22C55E'),
  greenSoft: hex('#166534'),
  red:       hex('#EF4444'),
  redSoft:   hex('#7F1D1D'),
  warning:   hex('#F59E0B'),
  blue:      hex('#60A5FA'),
  purple:    hex('#A78BFA'),
  white:     hex('#F8FAFC'),
  muted:     hex('#94A3B8'),
  mutedDim:  hex('#64748B'),
  headerBg:  hex('#16203D'),
  totalsBg:  hex('#1E2A3E'),
  pure:      hex('#FFFFFF'),
  divider:   hex('#2D3A52'),  // subtle divider color
  kpiBorder: hex('#2A3F5F'),  // KPI card border accent
  transparent: hex('#0F172A'),
};

async function main() {
  console.log('🎨 DESIGN PASS — Premium Dashboard Transformation\n');
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  // Helper shorthand
  const rc = (sheetId, r0, r1, c0, c1, fmt) => ({
    repeatCell: {
      range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 },
      cell: { userEnteredFormat: fmt },
      fields: 'userEnteredFormat(' + Object.keys(fmt).join(',') + ')',
    },
  });
  const merge = (sheetId, r0, r1, c0, c1) => ({
    mergeCells: { range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 }, mergeType: 'MERGE_ALL' },
  });
  const unmerge = (sheetId, r0, r1, c0, c1) => ({
    unmergeCells: { range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 } },
  });
  const colW = (sheetId, c0, c1, px) => ({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'COLUMNS', startIndex: c0, endIndex: c1 },
      properties: { pixelSize: px }, fields: 'pixelSize',
    },
  });
  const rowH = (sheetId, r0, r1, px) => ({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'ROWS', startIndex: r0, endIndex: r1 },
      properties: { pixelSize: px }, fields: 'pixelSize',
    },
  });
  const border = (color, style = 'SOLID') => ({ style, colorStyle: { rgbColor: color } });
  const noBorder = { style: 'NONE' };

  // ══════════════════════════════════════════════════════════════
  // PHASE 1: RESTRUCTURE LAYOUT — Insert spacer rows, expand KPIs
  // We need to shift content down to create breathing room.
  // Strategy: Insert rows at key positions to create gaps.
  // ══════════════════════════════════════════════════════════════

  console.log('📐 Phase 1: Restructuring layout...');

  // First, insert rows to create breathing room
  // We'll insert rows at specific positions to space out sections
  const insertRequests = [
    // Insert 2 rows after KPI area (after row 6) for breathing room
    { insertDimension: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 6, endIndex: 8 }, inheritFromBefore: true } },
    // Insert 1 row after section headers area (will be at row 11 after insert) for spacer
    { insertDimension: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 10, endIndex: 11 }, inheritFromBefore: true } },
  ];

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: insertRequests },
  });
  console.log('  ✅ Rows inserted for breathing room');

  // ══════════════════════════════════════════════════════════════
  // Now the layout shifted:
  // Row 1: Title (0-idx: 0)
  // Row 2: Subtitle (0-idx: 1)
  // Row 3: Controls (0-idx: 2)
  // Row 4: Spacer (0-idx: 3)
  // Row 5: KPI Labels (0-idx: 4)
  // Row 6: KPI Values (0-idx: 5)
  // Row 7-8: NEW spacer rows (0-idx: 6,7)
  // Row 9: was row 7 spacer → now extra spacer (0-idx: 8)
  // Row 10: Section headers (0-idx: 9)
  // Row 11: NEW spacer (0-idx: 10)
  // Row 12: Column headers (0-idx: 11)
  // Row 13-17: Data rows (0-idx: 12-16)
  // Row 18: Totals (0-idx: 17)
  // etc.
  // ══════════════════════════════════════════════════════════════

  // Need to update data references since rows shifted.
  // Actually, Google Sheets auto-adjusts formulas when rows are inserted.
  // But we need to re-populate moved cells with correct values/formatting.

  // Let me take a different approach: instead of inserting rows (which shifts formulas),
  // I'll work with the existing 50-row grid and redesign IN PLACE by:
  // 1. Making spacer rows taller
  // 2. Making KPI rows much taller
  // 3. Removing all visible borders
  // 4. Creating card-like blocks with background contrast

  // First, undo the inserts (they may break formula references)
  const undoInserts = [
    { deleteDimension: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 10, endIndex: 11 } } },
    { deleteDimension: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 6, endIndex: 8 } } },
  ];
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: undoInserts },
  });
  console.log('  ↩️  Reverted row inserts (using in-place redesign instead)');

  // ══════════════════════════════════════════════════════════════
  // PHASE 2: PREMIUM FORMATTING — In-place transformation
  // ══════════════════════════════════════════════════════════════

  console.log('🎨 Phase 2: Applying premium design...');

  const requests = [];

  // ── GLOBAL: Remove all gridlines from Dashboard ──
  requests.push({
    updateSheetProperties: {
      properties: { sheetId: 0, gridProperties: { hideGridlines: true } },
      fields: 'gridProperties.hideGridlines',
    },
  });

  // ── COLUMN WIDTHS: More intentional spacing ──
  // A: left gutter (wider for breathing)
  requests.push(colW(0, 0, 1, 40));
  // B-F: content columns (slightly wider)
  requests.push(colW(0, 1, 2, 130));  // B: labels
  requests.push(colW(0, 2, 3, 120));  // C
  requests.push(colW(0, 3, 4, 120));  // D
  requests.push(colW(0, 4, 5, 120));  // E
  requests.push(colW(0, 5, 6, 120));  // F
  // G: center gutter (breathing room between sections)
  requests.push(colW(0, 6, 7, 44));
  // H-L: right section
  requests.push(colW(0, 7, 8, 130));  // H
  requests.push(colW(0, 8, 9, 120));  // I
  requests.push(colW(0, 9, 10, 120)); // J
  requests.push(colW(0, 10, 11, 100));// K
  requests.push(colW(0, 11, 12, 120));// L

  // ── ROW 1: Title — taller, more presence ──
  requests.push(rowH(0, 0, 1, 64));
  requests.push(rc(0, 0, 1, 0, 12, {
    backgroundColor: C.navy,
    textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 18, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    padding: { top: 16, bottom: 16, left: 20, right: 20 },
  }));

  // ── ROW 2: Subtitle — more subtle ──
  requests.push(rowH(0, 1, 2, 32));
  requests.push(rc(0, 1, 2, 0, 12, {
    backgroundColor: C.darkBg,
    textFormat: { foregroundColorStyle: { rgbColor: C.mutedDim }, fontSize: 10, fontFamily: 'Inter', italic: true },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  }));

  // ── ROW 3: Controls — cleaner, tighter ──
  requests.push(rowH(0, 2, 3, 40));
  requests.push(rc(0, 2, 3, 0, 12, {
    backgroundColor: C.headerBg,
    textFormat: { foregroundColorStyle: { rgbColor: C.muted }, bold: true, fontSize: 9, fontFamily: 'Inter' },
    verticalAlignment: 'MIDDLE',
    borders: { bottom: border(C.divider) },
  }));
  // Month selector cell highlight
  requests.push(rc(0, 2, 3, 2, 3, {
    backgroundColor: C.elevCard,
    textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 11, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    borders: { bottom: border(C.gold, 'SOLID_MEDIUM') },
  }));
  // Income value highlight
  requests.push(rc(0, 2, 3, 8, 9, {
    backgroundColor: C.elevCard,
    textFormat: { foregroundColorStyle: { rgbColor: C.green }, bold: true, fontSize: 12, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
    borders: { bottom: border(C.green, 'SOLID_MEDIUM') },
  }));

  // ── ROW 4: Spacer — breathing room before KPIs ──
  requests.push(rowH(0, 3, 4, 16));
  requests.push(rc(0, 3, 4, 0, 12, {
    backgroundColor: C.darkBg,
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
  }));

  // ── ROWS 5-6: KPI CARDS — The hero section ──
  // Unmerge existing KPI cells first, then re-merge with better layout
  requests.push(unmerge(0, 4, 6, 0, 12));

  // KPI Label row — taller, more space
  requests.push(rowH(0, 4, 5, 28));
  // KPI Value row — MUCH taller for premium feel
  requests.push(rowH(0, 5, 6, 72));

  // Card 1: TOTAL INCOME (cols B-C, idx 1-3)
  requests.push(merge(0, 4, 5, 1, 3));
  requests.push(merge(0, 5, 6, 1, 3));
  requests.push(rc(0, 4, 5, 1, 3, {
    backgroundColor: C.elevCard,
    textFormat: { foregroundColorStyle: { rgbColor: C.mutedDim }, bold: false, fontSize: 8, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'BOTTOM',
    padding: { bottom: 2 },
    borders: { top: border(C.greenSoft, 'SOLID_MEDIUM'), left: border(C.kpiBorder), right: border(C.kpiBorder) },
  }));
  requests.push(rc(0, 5, 6, 1, 3, {
    backgroundColor: C.elevCard,
    textFormat: { foregroundColorStyle: { rgbColor: C.green }, bold: true, fontSize: 28, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
    borders: { bottom: border(C.greenSoft, 'SOLID_MEDIUM'), left: border(C.kpiBorder), right: border(C.kpiBorder) },
  }));

  // Card 2: TOTAL SPENT (cols D-E, idx 3-5)
  requests.push(merge(0, 4, 5, 3, 5));
  requests.push(merge(0, 5, 6, 3, 5));
  requests.push(rc(0, 4, 5, 3, 5, {
    backgroundColor: C.elevCard,
    textFormat: { foregroundColorStyle: { rgbColor: C.mutedDim }, bold: false, fontSize: 8, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'BOTTOM',
    padding: { bottom: 2 },
    borders: { top: border(C.redSoft, 'SOLID_MEDIUM'), left: border(C.kpiBorder), right: border(C.kpiBorder) },
  }));
  requests.push(rc(0, 5, 6, 3, 5, {
    backgroundColor: C.elevCard,
    textFormat: { foregroundColorStyle: { rgbColor: C.red }, bold: true, fontSize: 28, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
    borders: { bottom: border(C.redSoft, 'SOLID_MEDIUM'), left: border(C.kpiBorder), right: border(C.kpiBorder) },
  }));

  // Card 3: NET SAVINGS (cols F-H, idx 5-8 spanning gutter)
  requests.push(merge(0, 4, 5, 5, 8));
  requests.push(merge(0, 5, 6, 5, 8));
  requests.push(rc(0, 4, 5, 5, 8, {
    backgroundColor: C.elevCard,
    textFormat: { foregroundColorStyle: { rgbColor: C.mutedDim }, bold: false, fontSize: 8, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'BOTTOM',
    padding: { bottom: 2 },
    borders: { top: border(C.gold, 'SOLID_MEDIUM'), left: border(C.kpiBorder), right: border(C.kpiBorder) },
  }));
  requests.push(rc(0, 5, 6, 5, 8, {
    backgroundColor: C.elevCard,
    textFormat: { foregroundColorStyle: { rgbColor: C.gold }, bold: true, fontSize: 28, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
    borders: { bottom: border(C.gold, 'SOLID_MEDIUM'), left: border(C.kpiBorder), right: border(C.kpiBorder) },
  }));

  // Card 4: SAVINGS RATE (cols I-K, idx 8-11)
  requests.push(merge(0, 4, 5, 8, 11));
  requests.push(merge(0, 5, 6, 8, 11));
  requests.push(rc(0, 4, 5, 8, 11, {
    backgroundColor: C.elevCard,
    textFormat: { foregroundColorStyle: { rgbColor: C.mutedDim }, bold: false, fontSize: 8, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'BOTTOM',
    padding: { bottom: 2 },
    borders: { top: border(C.blue, 'SOLID_MEDIUM'), left: border(C.kpiBorder), right: border(C.kpiBorder) },
  }));
  requests.push(rc(0, 5, 6, 8, 11, {
    backgroundColor: C.elevCard,
    textFormat: { foregroundColorStyle: { rgbColor: C.blue }, bold: true, fontSize: 28, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    numberFormat: { type: 'PERCENT', pattern: '0%' },
    borders: { bottom: border(C.blue, 'SOLID_MEDIUM'), left: border(C.kpiBorder), right: border(C.kpiBorder) },
  }));

  // KPI spacer cells (gutter columns, edges)
  requests.push(rc(0, 4, 6, 0, 1, { backgroundColor: C.darkBg, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder } }));
  requests.push(rc(0, 4, 6, 11, 12, { backgroundColor: C.darkBg, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder } }));

  // ── ROW 7: Spacer between KPIs and sections ──
  requests.push(rowH(0, 6, 7, 20));
  requests.push(rc(0, 6, 7, 0, 12, {
    backgroundColor: C.darkBg,
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
  }));

  // ── ROW 8: Section headers — more refined ──
  requests.push(rowH(0, 7, 8, 38));
  // Unmerge existing
  requests.push(unmerge(0, 7, 8, 0, 12));
  // Left: SAVINGS GOALS
  requests.push(merge(0, 7, 8, 1, 6));
  requests.push(rc(0, 7, 8, 1, 6, {
    backgroundColor: C.rose,
    textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 11, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
  }));
  // Right: WHERE YOUR MONEY WENT
  requests.push(merge(0, 7, 8, 7, 12));
  requests.push(rc(0, 7, 8, 7, 12, {
    backgroundColor: C.navy,
    textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 11, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
  }));
  requests.push(rc(0, 7, 8, 0, 1, { backgroundColor: C.darkBg, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder } }));
  requests.push(rc(0, 7, 8, 6, 7, { backgroundColor: C.darkBg, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder } }));

  // ── ROW 9: Column headers — minimal, uppercase, small ──
  requests.push(rowH(0, 8, 9, 26));
  requests.push(rc(0, 8, 9, 1, 6, {
    backgroundColor: C.cardBg,
    textFormat: { foregroundColorStyle: { rgbColor: C.mutedDim }, bold: true, fontSize: 8, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    borders: { top: noBorder, bottom: border(C.divider), left: noBorder, right: noBorder },
  }));
  requests.push(rc(0, 8, 9, 7, 12, {
    backgroundColor: C.cardBg,
    textFormat: { foregroundColorStyle: { rgbColor: C.mutedDim }, bold: true, fontSize: 8, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    borders: { top: noBorder, bottom: border(C.divider), left: noBorder, right: noBorder },
  }));
  requests.push(rc(0, 8, 9, 0, 1, { backgroundColor: C.darkBg, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder } }));
  requests.push(rc(0, 8, 9, 6, 7, { backgroundColor: C.darkBg, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder } }));

  // ── ROWS 10-14: Data rows — cleaner, softer, no hard borders ──
  requests.push(rowH(0, 9, 10, 30));
  requests.push(rowH(0, 10, 11, 30));
  requests.push(rowH(0, 11, 12, 30));
  requests.push(rowH(0, 12, 13, 30));
  requests.push(rowH(0, 13, 14, 30));

  // Left section data (savings goals)
  for (let r = 9; r < 14; r++) {
    const isAlt = (r - 9) % 2 === 1;
    const bg = isAlt ? C.cardBg2 : C.cardBg;
    requests.push(rc(0, r, r + 1, 1, 6, {
      backgroundColor: bg,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, fontSize: 10, fontFamily: 'Inter' },
      verticalAlignment: 'MIDDLE',
      numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
      borders: { top: noBorder, bottom: border(C.divider), left: noBorder, right: noBorder },
    }));
  }
  // Progress column — green text
  requests.push(rc(0, 9, 14, 5, 6, {
    backgroundColor: C.cardBg, // will be overridden by alternating
    textFormat: { foregroundColorStyle: { rgbColor: C.green }, bold: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    numberFormat: { type: 'PERCENT', pattern: '0%' },
    borders: { top: noBorder, bottom: border(C.divider), left: noBorder, right: noBorder },
  }));

  // Right section data (money went)
  for (let r = 9; r < 13; r++) {
    const isAlt = (r - 9) % 2 === 1;
    const bg = isAlt ? C.cardBg2 : C.cardBg;
    requests.push(rc(0, r, r + 1, 7, 12, {
      backgroundColor: bg,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, fontSize: 10, fontFamily: 'Inter' },
      verticalAlignment: 'MIDDLE',
      numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
      borders: { top: noBorder, bottom: border(C.divider), left: noBorder, right: noBorder },
    }));
  }

  // Spacer columns in data area
  for (let r = 9; r < 18; r++) {
    requests.push(rc(0, r, r + 1, 0, 1, { backgroundColor: C.darkBg, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder } }));
    requests.push(rc(0, r, r + 1, 6, 7, { backgroundColor: C.darkBg, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder } }));
  }

  // ── ROW 15: Left totals ──
  requests.push(rowH(0, 14, 15, 32));
  requests.push(rc(0, 14, 15, 1, 6, {
    backgroundColor: C.totalsBg,
    textFormat: { foregroundColorStyle: { rgbColor: C.gold }, bold: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
    borders: { top: border(C.gold, 'SOLID_MEDIUM'), bottom: noBorder, left: noBorder, right: noBorder },
  }));

  // ── ROW 14: Right totals ──
  requests.push(rc(0, 13, 14, 7, 12, {
    backgroundColor: C.totalsBg,
    textFormat: { foregroundColorStyle: { rgbColor: C.gold }, bold: true, fontSize: 10, fontFamily: 'Inter' },
    verticalAlignment: 'MIDDLE',
    numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
    borders: { top: border(C.gold, 'SOLID_MEDIUM'), bottom: noBorder, left: noBorder, right: noBorder },
  }));

  // ── ROW 16: Spacer ──
  requests.push(rowH(0, 15, 16, 20));
  requests.push(rc(0, 15, 16, 0, 12, {
    backgroundColor: C.darkBg,
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
  }));

  // ── ROW 17: Goal Allocation header — gold accent ──
  requests.push(rowH(0, 16, 17, 38));
  requests.push(unmerge(0, 16, 17, 0, 12));
  requests.push(merge(0, 16, 17, 1, 6));
  requests.push(rc(0, 16, 17, 1, 6, {
    backgroundColor: C.gold,
    textFormat: { foregroundColorStyle: { rgbColor: C.darkBg }, bold: true, fontSize: 11, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
  }));
  requests.push(rc(0, 16, 17, 0, 1, { backgroundColor: C.darkBg, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder } }));
  requests.push(rc(0, 16, 17, 6, 12, { backgroundColor: C.darkBg, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder } }));

  // ── ROW 18: Goal Allocation column headers ──
  requests.push(rowH(0, 17, 18, 26));
  requests.push(rc(0, 17, 18, 1, 6, {
    backgroundColor: C.cardBg,
    textFormat: { foregroundColorStyle: { rgbColor: C.mutedDim }, bold: true, fontSize: 8, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    borders: { top: noBorder, bottom: border(C.divider), left: noBorder, right: noBorder },
  }));
  requests.push(rc(0, 17, 18, 0, 1, { backgroundColor: C.darkBg, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder } }));
  requests.push(rc(0, 17, 18, 6, 12, { backgroundColor: C.darkBg, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder } }));

  // ── ROWS 19-22: Goal allocation data ──
  for (let r = 18; r < 22; r++) {
    const isAlt = (r - 18) % 2 === 1;
    const bg = isAlt ? C.cardBg2 : C.cardBg;
    requests.push(rc(0, r, r + 1, 1, 6, {
      backgroundColor: bg,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, fontSize: 10, fontFamily: 'Inter' },
      verticalAlignment: 'MIDDLE',
      borders: { top: noBorder, bottom: border(C.divider), left: noBorder, right: noBorder },
    }));
    requests.push(rc(0, r, r + 1, 0, 1, { backgroundColor: C.darkBg, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder } }));
    requests.push(rc(0, r, r + 1, 6, 12, { backgroundColor: C.darkBg, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder } }));
  }
  // Number formats for allocation
  requests.push(rc(0, 18, 22, 2, 3, { numberFormat: { type: 'PERCENT', pattern: '0%' } }));
  requests.push(rc(0, 18, 22, 3, 4, { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' } }));
  requests.push(rc(0, 18, 22, 4, 5, { numberFormat: { type: 'PERCENT', pattern: '0%' } }));
  requests.push(rc(0, 18, 22, 5, 6, { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' } }));

  // ── ROW 23: Allocation totals ──
  requests.push(rowH(0, 22, 23, 32));
  requests.push(rc(0, 22, 23, 1, 6, {
    backgroundColor: C.totalsBg,
    textFormat: { foregroundColorStyle: { rgbColor: C.gold }, bold: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    borders: { top: border(C.gold, 'SOLID_MEDIUM'), bottom: noBorder, left: noBorder, right: noBorder },
  }));
  requests.push(rc(0, 22, 23, 0, 1, { backgroundColor: C.darkBg, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder } }));
  requests.push(rc(0, 22, 23, 6, 12, { backgroundColor: C.darkBg, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder } }));

  // ── ROW 24: Spacer before charts ──
  requests.push(rowH(0, 23, 24, 20));
  requests.push(rc(0, 23, 24, 0, 12, {
    backgroundColor: C.darkBg,
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
  }));

  // ── REMAINING ROWS: Dark background, no borders ──
  requests.push(rc(0, 24, 50, 0, 12, {
    backgroundColor: C.darkBg,
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
  }));

  // ══════════════════════════════════════════════════════════════
  // PHASE 3: CHART REDESIGN — Reposition, resize, clean up
  // Delete existing charts and recreate with better positioning
  // ══════════════════════════════════════════════════════════════

  // First, get existing chart IDs
  const ssData = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.charts' });
  const existingCharts = ssData.data.sheets?.[0]?.charts || [];
  for (const chart of existingCharts) {
    requests.push({ deleteEmbeddedObject: { objectId: chart.chartId } });
  }

  // Recreate charts with better positioning and styling
  // Chart 1: Donut — Savings Goals (left side, row 25)
  requests.push({ addChart: { chart: {
    position: { overlayPosition: { anchorCell: { sheetId: 0, rowIndex: 24, columnIndex: 1 }, widthPixels: 520, heightPixels: 340, offsetXPixels: 0, offsetYPixels: 0 } },
    spec: {
      title: 'Savings Goal Progress',
      titleTextFormat: { fontSize: 11, bold: true, foregroundColorStyle: { rgbColor: C.muted } },
      pieChart: {
        legendPosition: 'RIGHT_LEGEND',
        domain: { sourceRange: { sources: [{ sheetId: 4, startRowIndex: 1, endRowIndex: 6, startColumnIndex: 1, endColumnIndex: 2 }] } },
        series: { sourceRange: { sources: [{ sheetId: 4, startRowIndex: 1, endRowIndex: 6, startColumnIndex: 3, endColumnIndex: 4 }] } },
        pieHole: 0.55,
      },
      backgroundColorStyle: { rgbColor: C.cardBg },
      fontName: 'Inter',
    },
  }}});

  // Chart 2: Donut — Where Money Went (right side, row 25)
  requests.push({ addChart: { chart: {
    position: { overlayPosition: { anchorCell: { sheetId: 0, rowIndex: 24, columnIndex: 6 }, widthPixels: 520, heightPixels: 340, offsetXPixels: 10, offsetYPixels: 0 } },
    spec: {
      title: 'Where My Money Went',
      titleTextFormat: { fontSize: 11, bold: true, foregroundColorStyle: { rgbColor: C.muted } },
      pieChart: {
        legendPosition: 'RIGHT_LEGEND',
        domain: { sourceRange: { sources: [{ sheetId: 0, startRowIndex: 9, endRowIndex: 13, startColumnIndex: 7, endColumnIndex: 8 }] } },
        series: { sourceRange: { sources: [{ sheetId: 0, startRowIndex: 9, endRowIndex: 13, startColumnIndex: 9, endColumnIndex: 10 }] } },
        pieHole: 0.55,
      },
      backgroundColorStyle: { rgbColor: C.cardBg },
      fontName: 'Inter',
    },
  }}});

  // Chart 3: Column — Goal vs Actual (full width, row 34)
  requests.push({ addChart: { chart: {
    position: { overlayPosition: { anchorCell: { sheetId: 0, rowIndex: 34, columnIndex: 1 }, widthPixels: 1000, heightPixels: 320, offsetXPixels: 0, offsetYPixels: 0 } },
    spec: {
      title: 'Goal vs Actual by Bucket',
      titleTextFormat: { fontSize: 11, bold: true, foregroundColorStyle: { rgbColor: C.muted } },
      basicChart: {
        chartType: 'COLUMN',
        legendPosition: 'TOP_LEGEND',
        axis: [
          { position: 'BOTTOM_AXIS', format: { fontFamily: 'Inter', fontSize: 9 } },
          { position: 'LEFT_AXIS', format: { fontFamily: 'Inter', fontSize: 9 } },
        ],
        domains: [{ domain: { sourceRange: { sources: [{ sheetId: 0, startRowIndex: 18, endRowIndex: 22, startColumnIndex: 1, endColumnIndex: 2 }] } } }],
        series: [
          { series: { sourceRange: { sources: [{ sheetId: 0, startRowIndex: 18, endRowIndex: 22, startColumnIndex: 3, endColumnIndex: 4 }] } }, targetAxis: 'LEFT_AXIS', colorStyle: { rgbColor: C.navy } },
          { series: { sourceRange: { sources: [{ sheetId: 0, startRowIndex: 18, endRowIndex: 22, startColumnIndex: 5, endColumnIndex: 6 }] } }, targetAxis: 'LEFT_AXIS', colorStyle: { rgbColor: C.gold } },
        ],
        headerCount: 0,
      },
      backgroundColorStyle: { rgbColor: C.cardBg },
      fontName: 'Inter',
    },
  }}});

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests },
  });
  console.log('  ✅ Premium formatting applied');

  // ══════════════════════════════════════════════════════════════
  // PHASE 4: WOW ELEMENT — Add SPARKLINE progress bars + insight card
  // ══════════════════════════════════════════════════════════════

  console.log('✨ Phase 3: Adding wow elements...');

  // Add SPARKLINE progress bars to Dashboard savings goals (column F, rows 10-14)
  // These replace the plain percentage with visual bar charts
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        // Sparkline progress bars for savings goals
        { range: 'Dashboard!F10', values: [['=SPARKLINE(\'Savings Goals\'!F2,{"charttype","bar";"max",1;"color1","#22C55E";"color2","#1E293B"})']] },
        { range: 'Dashboard!F11', values: [['=SPARKLINE(\'Savings Goals\'!F3,{"charttype","bar";"max",1;"color1","#22C55E";"color2","#1E293B"})']] },
        { range: 'Dashboard!F12', values: [['=SPARKLINE(\'Savings Goals\'!F4,{"charttype","bar";"max",1;"color1","#60A5FA";"color2","#1E293B"})']] },
        { range: 'Dashboard!F13', values: [['=SPARKLINE(\'Savings Goals\'!F5,{"charttype","bar";"max",1;"color1","#F59E0B";"color2","#1E293B"})']] },
        { range: 'Dashboard!F14', values: [['=SPARKLINE(\'Savings Goals\'!F6,{"charttype","bar";"max",1;"color1","#A78BFA";"color2","#1E293B"})']] },

        // Add an "INSIGHT" summary in the right section below totals
        // Row 15 right section: Key insight
        { range: 'Dashboard!H15', values: [['💡 INSIGHT']] },
        { range: 'Dashboard!I15:L15', values: [['=IF(B6-D6>0,"You saved "&TEXT(H6,"0%")&" of income this month — on track! 🎯","⚠️ You overspent by "&TEXT(ABS(B6-D6),"$#,##0")&" this month")']] },
      ],
    },
  });

  // Format the insight row
  const insightRequests = [
    // Insight label
    rc(0, 14, 15, 7, 8, {
      backgroundColor: C.cardBg2,
      textFormat: { foregroundColorStyle: { rgbColor: C.gold }, bold: true, fontSize: 9, fontFamily: 'Inter' },
      verticalAlignment: 'MIDDLE',
      borders: { top: noBorder, bottom: noBorder, left: border(C.gold, 'SOLID_MEDIUM'), right: noBorder },
    }),
    // Insight text
    merge(0, 14, 15, 8, 12),
    rc(0, 14, 15, 8, 12, {
      backgroundColor: C.cardBg2,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, fontSize: 10, fontFamily: 'Inter' },
      verticalAlignment: 'MIDDLE',
      horizontalAlignment: 'LEFT',
      borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
    }),

    // Make F column (progress) wider for sparklines
    colW(0, 5, 6, 140),
  ];

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: insightRequests },
  });
  console.log('  ✅ Sparkline progress bars + insight card added');

  // ══════════════════════════════════════════════════════════════
  // PHASE 5: REMOVE GRIDLINES FROM ALL TABS
  // ══════════════════════════════════════════════════════════════

  console.log('🧹 Phase 4: Final polish...');
  // Hide gridlines only on Dashboard (already done above)
  // Other tabs keep gridlines since they're data-entry tabs

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  🎉 DESIGN PASS COMPLETE');
  console.log(`  🔗 https://docs.google.com/spreadsheets/d/${SHEET_ID}`);
  console.log('');
  console.log('  Changes applied:');
  console.log('  ✅ Gridlines hidden on Dashboard');
  console.log('  ✅ KPI cards redesigned — 28pt numbers, colored top borders, elevated backgrounds');
  console.log('  ✅ Tables softened — alternating subtle rows, divider-only borders');
  console.log('  ✅ Section headers refined — cleaner typography');
  console.log('  ✅ Breathing room added — taller spacers between sections');
  console.log('  ✅ Charts repositioned with card backgrounds');
  console.log('  ✅ SPARKLINE progress bars in savings goals (wow element)');
  console.log('  ✅ Insight card added below spending section');
  console.log('  ✅ All hard borders removed — divider-only design');
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('❌ Design pass failed:', err.message);
  if (err.response?.data?.error) {
    console.error(JSON.stringify(err.response.data.error, null, 2));
  }
  process.exit(1);
});
