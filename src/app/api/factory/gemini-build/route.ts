// ══════════════════════════════════════════════════════════════
// Factory — Gemini Multi-Format File Builder
// POST /api/factory/gemini-build
//
// Uses Gemini 2.5 Flash to design a complete professional
// product spec then renders it into a polished file:
//   - format=xlsx → Excel spreadsheet via ExcelJS (default)
//   - format=docx → Word document via docx
//   - format=csv  → CSV file (data-only)
//
// NO Google OAuth required — works standalone.
// Output works in Excel, Numbers, Google Sheets (after upload), etc.
//
// Request body:
//   {
//     keyword: string,
//     niche?: string,
//     format?: "xlsx" | "docx" | "csv",
//     factoryRunId?: string
//   }
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ShadingType,
} from "docx";
import { callGeminiJSON, parseGeminiJSON } from "@/lib/gemini";
import { updateFactoryRun } from "@/lib/db";

// 18-22 tab bestseller-grade specs need Gemini Pro (~60-90s) plus render.
export const maxDuration = 180;

// ── Gemini spec types ────────────────────────────────────────

interface SheetColumn {
  header: string;
  key: string;
  width: number;
  type: "text" | "number" | "currency" | "percent" | "date" | "formula" | "checkbox";
  formula_template?: string; // e.g. "=B{r}+C{r}" — {r} replaced with row number
  note?: string;
}

interface SheetSection {
  title?: string;
  columns: SheetColumn[];
  row_count: number;
  sample_data: Record<string, string | number | null>[];
  totals_row: boolean;
}

interface SheetTab {
  name: string;
  type: "dashboard" | "tracker" | "reference" | "summary" | "planner";
  purpose: string;
  sections: SheetSection[];
  freeze_header: boolean;
}

interface GeminiSheetSpec {
  product_name: string;
  tagline: string;
  niche: string;
  color_scheme: {
    primary: string;        // hex — header bg
    primary_text: string;   // hex — header fg
    accent: string;         // hex — totals / highlights
    accent_text: string;    // hex — accent fg
    alt_row: string;        // hex — alternating row bg (light tint)
    section_header: string; // hex — section title bg
  };
  tabs: SheetTab[];
}

// ── Color scheme presets (Gemini may override) ────────────────
// Curated against Etsy bestseller patterns + underserved niche gaps:
//   cream-neutral / dark-mode / cherry-coquette / soft-sage / midnight-amber

const COLOR_PRESETS: Record<string, GeminiSheetSpec["color_scheme"]> = {
  // ── Aesthetic-driven (used for multi-palette variants) ──
  neutral_cream: {
    primary: "8C7B6A",    // warm taupe (matches "Ultimate Budget" cream listings)
    primary_text: "FFFFFF",
    accent: "C9A878",     // soft caramel
    accent_text: "4A3F33",
    alt_row: "FAF6F0",
    section_header: "F0E8DC",
  },
  dark_mode: {
    primary: "1F2937",    // charcoal slate
    primary_text: "F8FAFC",
    accent: "A78BFA",     // neon violet
    accent_text: "DDD6FE",
    alt_row: "111827",
    section_header: "1F2937",
  },
  cherry_coquette: {
    primary: "C8385A",    // cherry red
    primary_text: "FFFFFF",
    accent: "F4B6C2",     // soft pink
    accent_text: "7A1F35",
    alt_row: "FDF4F6",
    section_header: "FAE0E6",
  },
  soft_sage: {
    primary: "8FA388",    // dusty sage (NOT saturated forest)
    primary_text: "FFFFFF",
    accent: "D4C5B0",     // warm beige
    accent_text: "4F5C49",
    alt_row: "F7F9F4",
    section_header: "EAEFE5",
  },
  midnight_amber: {
    primary: "0F172A",    // deep navy
    primary_text: "FFFFFF",
    accent: "F59E0B",     // amber gold
    accent_text: "FCD34D",
    alt_row: "F8FAFC",
    section_header: "1E293B",
  },

  // ── Niche-keyed presets ──
  baby: {
    primary: "C8A4C8",    // soft lavender
    primary_text: "FFFFFF",
    accent: "F0B8C8",     // blush pink
    accent_text: "5C3054",
    alt_row: "FDF4F8",
    section_header: "F5E6F0",
  },
  wedding: {
    primary: "C9A87C",    // champagne gold
    primary_text: "FFFFFF",
    accent: "F2DDD4",     // rose gold
    accent_text: "7D4B3A",
    alt_row: "FDF9F6",
    section_header: "FAF0EA",
  },
  travel: {
    primary: "2E7DA6",    // sky blue
    primary_text: "FFFFFF",
    accent: "F0A500",     // golden amber
    accent_text: "1A3F5A",
    alt_row: "F0F8FF",
    section_header: "E4F0F8",
  },
  fitness: {
    primary: "E76F51",    // energetic orange
    primary_text: "FFFFFF",
    accent: "2A9D8F",     // teal
    accent_text: "1A3A35",
    alt_row: "FFF5F2",
    section_header: "FDEBD0",
  },
  freelancer: {
    primary: "0F172A",    // midnight navy (Etsy seller / freelancer aesthetic)
    primary_text: "FFFFFF",
    accent: "F59E0B",     // amber
    accent_text: "1E293B",
    alt_row: "F8FAFC",
    section_header: "E2E8F0",
  },
  default: {
    primary: "8C7B6A",    // default to neutral cream — the bestselling aesthetic
    primary_text: "FFFFFF",
    accent: "C9A878",
    accent_text: "4A3F33",
    alt_row: "FAF6F0",
    section_header: "F0E8DC",
  },
};

function resolvePreset(keyword: string): GeminiSheetSpec["color_scheme"] {
  const kw = keyword.toLowerCase();
  // Aesthetic keywords win over niche keywords
  if (/dark\s?mode|midnight|moody|neon|gothic/.test(kw)) return COLOR_PRESETS.dark_mode;
  if (/coquette|cherry|girly|bow|ballet\s?core|pink\s?aesthetic|romantic/.test(kw)) return COLOR_PRESETS.cherry_coquette;
  if (/cottage|cottagecore|warm|cozy|rustic|farmhouse/.test(kw)) return COLOR_PRESETS.soft_sage;
  if (/minimalist|minimal|clean|simple\s?aesthetic/.test(kw)) return COLOR_PRESETS.neutral_cream;

  // Niche-driven
  if (/baby|infant|newborn|nursery|toddler|pregnancy/.test(kw)) return COLOR_PRESETS.baby;
  if (/wedding|bride|groom|bridal|engagement/.test(kw)) return COLOR_PRESETS.wedding;
  if (/travel|trip|vacation|itinerary|backpack/.test(kw)) return COLOR_PRESETS.travel;
  if (/fitness|workout|gym|exercise|health|habit/.test(kw)) return COLOR_PRESETS.fitness;
  if (/freelance|etsy\s?seller|small\s?business|invoice|hairstyl|nail\s?tech|lash|photographer/.test(kw)) return COLOR_PRESETS.freelancer;
  if (/family|household|multi.?earner|parent/.test(kw)) return COLOR_PRESETS.dark_mode; // underserved: family budget in dark mode

  // Default to neutral cream (bestseller aesthetic) instead of forest green
  return COLOR_PRESETS.default;
}

// The 3 palettes used for multi-aesthetic SKUs — proven Etsy bestseller looks.
const VARIANT_PALETTES: Array<{ key: string; label: string; palette: GeminiSheetSpec["color_scheme"] }> = [
  { key: "neutral", label: "Neutral Cream",   palette: COLOR_PRESETS.neutral_cream },
  { key: "dark",    label: "Dark Mode",       palette: COLOR_PRESETS.dark_mode },
  { key: "cherry",  label: "Cherry Coquette", palette: COLOR_PRESETS.cherry_coquette },
];

// ── ExcelJS renderer ─────────────────────────────────────────

function hexToArgb(hex: string): string {
  const clean = hex.replace("#", "");
  return `FF${clean.toUpperCase()}`;
}

function renderSpreadsheet(spec: GeminiSheetSpec): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CraftPlan Digital";
  wb.created = new Date();

  const cs = spec.color_scheme;
  const PRIMARY = hexToArgb(cs.primary);
  const PRIMARY_TEXT = hexToArgb(cs.primary_text);
  const ACCENT = hexToArgb(cs.accent);
  const ACCENT_TEXT = hexToArgb(cs.accent_text);
  const ALT_ROW = hexToArgb(cs.alt_row);
  const SECTION_HEADER = hexToArgb(cs.section_header);

  const HEADER_FONT: Partial<ExcelJS.Font> = {
    bold: true,
    color: { argb: PRIMARY_TEXT },
    size: 11,
    name: "Calibri",
  };

  const BODY_FONT: Partial<ExcelJS.Font> = {
    size: 10,
    name: "Calibri",
    color: { argb: "FF2D2D2D" },
  };

  const TOTAL_FONT: Partial<ExcelJS.Font> = {
    bold: true,
    size: 10,
    name: "Calibri",
    color: { argb: ACCENT_TEXT },
  };

  const THIN_BORDER: Partial<ExcelJS.Borders> = {
    top:    { style: "thin", color: { argb: "FFD0D0D0" } },
    left:   { style: "thin", color: { argb: "FFD0D0D0" } },
    bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
    right:  { style: "thin", color: { argb: "FFD0D0D0" } },
  };

  for (const tab of spec.tabs) {
    const ws = wb.addWorksheet(tab.name.slice(0, 31), {
      views: tab.freeze_header ? [{ state: "frozen", xSplit: 0, ySplit: 1 }] : [],
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    let currentRow = 1;

    for (const section of tab.sections) {
      const cols = section.columns;
      if (!cols.length) continue;

      // ── Section title row (if named) ──
      if (section.title) {
        const titleRow = ws.getRow(currentRow);
        titleRow.height = 22;
        const titleCell = titleRow.getCell(1);
        titleCell.value = section.title.toUpperCase();
        titleCell.font = { bold: true, size: 11, color: { argb: "FF444444" }, name: "Calibri" };
        titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SECTION_HEADER } };
        titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
        if (cols.length > 1) {
          ws.mergeCells(currentRow, 1, currentRow, cols.length);
        }
        titleCell.border = { bottom: { style: "medium", color: { argb: hexToArgb(cs.primary) } } };
        currentRow++;
      }

      // ── Column header row ──
      const headerRow = ws.getRow(currentRow);
      headerRow.height = 24;
      cols.forEach((col, ci) => {
        const cell = headerRow.getCell(ci + 1);
        cell.value = col.header;
        cell.font = HEADER_FONT;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PRIMARY } };
        cell.alignment = { vertical: "middle", horizontal: ci === 0 ? "left" : "center", indent: ci === 0 ? 1 : 0, wrapText: false };
        cell.border = THIN_BORDER;
        // Set column width
        const wsCol = ws.getColumn(ci + 1);
        if (wsCol.width === undefined || wsCol.width < col.width) {
          wsCol.width = Math.max(col.width, 10);
        }
        if (col.note) {
          cell.note = col.note;
        }
      });
      const headerRowNum = currentRow;
      currentRow++;

      // ── Data rows ──
      const dataStartRow = currentRow;
      const dataEndRow = currentRow + section.row_count - 1;

      for (let r = 0; r < section.row_count; r++) {
        const absRow = currentRow + r;
        const dataRow = ws.getRow(absRow);
        dataRow.height = 18;

        const sampleRow: Record<string, string | number | null> = section.sample_data[r] ?? {};
        const isAlt = r % 2 === 1;

        cols.forEach((col, ci) => {
          const cell = dataRow.getCell(ci + 1);
          cell.font = BODY_FONT;
          cell.alignment = { vertical: "middle", horizontal: ci === 0 ? "left" : "center", indent: ci === 0 ? 1 : 0 };
          cell.border = THIN_BORDER;

          if (isAlt) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT_ROW } };
          } else {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
          }

          // Set value or formula
          if (col.formula_template) {
            const formula = col.formula_template.replace(/\{r\}/g, String(absRow));
            cell.value = { formula, date1904: false };
          } else {
            const rawVal = sampleRow[col.key];
            if (rawVal !== undefined && rawVal !== null && rawVal !== "") {
              if (col.type === "currency" && typeof rawVal === "number") {
                cell.value = rawVal;
                cell.numFmt = '"$"#,##0.00';
                cell.alignment = { ...cell.alignment, horizontal: "right" };
              } else if (col.type === "percent" && typeof rawVal === "number") {
                cell.value = rawVal / 100;
                cell.numFmt = "0.0%";
                cell.alignment = { ...cell.alignment, horizontal: "right" };
              } else if (col.type === "date" && typeof rawVal === "string") {
                const d = new Date(rawVal);
                if (!isNaN(d.getTime())) {
                  cell.value = d;
                  cell.numFmt = "mmm d, yyyy";
                } else {
                  cell.value = rawVal;
                }
              } else if (col.type === "number" && typeof rawVal === "number") {
                cell.value = rawVal;
                cell.numFmt = "#,##0.00";
                cell.alignment = { ...cell.alignment, horizontal: "right" };
              } else {
                cell.value = rawVal;
              }
            } else {
              // Leave cell empty for user input
              cell.value = null;
            }
          }
        });
      }
      currentRow = dataEndRow + 1;

      // ── Visual "charts" via conditional formatting ──
      // Excel/Sheets render these as colored bars or gradients in the
      // cell automatically — no chart image needed. This is what the
      // bestseller dashboards do for their "donut/bar" visualizations.
      if (section.row_count > 0) {
        cols.forEach((col, ci) => {
          const colLetter = String.fromCharCode(64 + ci + 1);
          const range = `${colLetter}${dataStartRow}:${colLetter}${dataEndRow}`;

          if (col.type === "currency" || col.type === "number") {
            // Data bar — visual bar inside each cell, scales to value
            try {
              ws.addConditionalFormatting({
                ref: range,
                rules: [{
                  type: "dataBar",
                  priority: 1,
                  cfvo: [
                    { type: "min" },
                    { type: "max" },
                  ],
                  gradient: true,
                  showValue: true,
                  // ExcelJS type omits `color` but the XML supports it via dataBar > color
                  ...({ color: { argb: hexToArgb(cs.accent) } } as Record<string, unknown>),
                }],
              });
            } catch { /* older Excel versions may not support — non-fatal */ }
          } else if (col.type === "percent") {
            // Color scale — green (high) to red (low) gradient
            try {
              ws.addConditionalFormatting({
                ref: range,
                rules: [{
                  type: "colorScale",
                  priority: 1,
                  cfvo: [
                    { type: "min" },
                    { type: "percentile", value: 50 },
                    { type: "max" },
                  ],
                  color: [
                    { argb: "FFEF4444" }, // red (low %)
                    { argb: "FFF59E0B" }, // amber (mid)
                    { argb: "FF22C55E" }, // green (high)
                  ],
                }],
              });
            } catch { /* non-fatal */ }
          }
        });
      }

      // ── Totals row ──
      if (section.totals_row && section.row_count > 0) {
        const totalsRow = ws.getRow(currentRow);
        totalsRow.height = 20;
        cols.forEach((col, ci) => {
          const cell = totalsRow.getCell(ci + 1);
          cell.font = TOTAL_FONT;
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } };
          cell.border = {
            top:    { style: "medium", color: { argb: hexToArgb(cs.primary) } },
            left:   { style: "thin",   color: { argb: "FFD0D0D0" } },
            bottom: { style: "medium", color: { argb: hexToArgb(cs.primary) } },
            right:  { style: "thin",   color: { argb: "FFD0D0D0" } },
          };
          cell.alignment = { vertical: "middle", horizontal: ci === 0 ? "left" : "right", indent: ci === 0 ? 1 : 0 };

          if (ci === 0) {
            cell.value = "TOTAL";
          } else if (col.type === "currency" || col.type === "number") {
            const colLetter = String.fromCharCode(64 + ci + 1);
            cell.value = { formula: `=SUM(${colLetter}${dataStartRow}:${colLetter}${dataEndRow})`, date1904: false };
            cell.numFmt = col.type === "currency" ? '"$"#,##0.00' : "#,##0.00";
          }
        });
        currentRow++;
      }

      // Gap between sections
      currentRow++;

      // Freeze below the FIRST header row across the whole sheet
      if (tab.freeze_header && tab.sections.indexOf(section) === 0) {
        ws.views = [{ state: "frozen", xSplit: 0, ySplit: headerRowNum }];
      }
    }

    // ── Tab color ──
    const tabColors: Record<SheetTab["type"], string> = {
      dashboard: cs.primary,
      tracker:   cs.accent,
      reference: "95B8D1",
      summary:   cs.primary,
      planner:   cs.accent,
    };
    ws.state = "visible";
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ws.properties as any).tabColor = { argb: hexToArgb(tabColors[tab.type] || cs.primary) };
    } catch { /* ignore */ }
  }

  // ── Cover tab (added BEFORE other tabs via orderNo) ──
  // We add it after content tabs, then re-order using the internal
  // worksheet order array (ExcelJS doesn't expose moveSheet publicly).
  const coverWs = wb.addWorksheet("✦ Cover", { views: [{ showGridLines: false }] });
  // Move cover to position 0 by shifting workbook worksheets array
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sheets = (wb as any)._worksheets as ExcelJS.Worksheet[];
    const coverIdx = sheets.findIndex((s) => s?.name === "✦ Cover");
    if (coverIdx > 1) {
      const [coverSheet] = sheets.splice(coverIdx, 1);
      sheets.splice(1, 0, coverSheet);
    }
  } catch { /* ignore — cover will appear last, not critical */ }

  // Title block
  const titleCell = coverWs.getCell("B3");
  titleCell.value = spec.product_name;
  titleCell.font = { bold: true, size: 22, color: { argb: hexToArgb(cs.primary) }, name: "Calibri" };
  titleCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  coverWs.getRow(3).height = 50;
  coverWs.getColumn("B").width = 55;

  const taglineCell = coverWs.getCell("B4");
  taglineCell.value = spec.tagline;
  taglineCell.font = { italic: true, size: 13, color: { argb: "FF666666" }, name: "Calibri" };

  const dividerCell = coverWs.getCell("B5");
  dividerCell.value = "─".repeat(60);
  dividerCell.font = { size: 9, color: { argb: hexToArgb(cs.accent) } };

  const creditCell = coverWs.getCell("B6");
  creditCell.value = "Created with CraftPlan Digital · Instant Download";
  creditCell.font = { size: 10, color: { argb: "FF999999" }, name: "Calibri" };

  // Sheet index
  let indexRow = 8;
  const indexHeader = coverWs.getCell(`B${indexRow}`);
  indexHeader.value = "WHAT'S INSIDE";
  indexHeader.font = { bold: true, size: 10, color: { argb: hexToArgb(cs.primary) }, name: "Calibri" };
  coverWs.getRow(indexRow).height = 18;
  indexRow++;

  for (const tab of spec.tabs) {
    const tabRow = coverWs.getCell(`B${indexRow}`);
    tabRow.value = `  › ${tab.name}  —  ${tab.purpose}`;
    tabRow.font = { size: 10, color: { argb: "FF444444" }, name: "Calibri" };
    coverWs.getRow(indexRow).height = 16;
    indexRow++;
  }

  coverWs.state = "visible";

  return wb.xlsx.writeBuffer().then((buf) => Buffer.from(buf));
}

// ── DOCX renderer (Word documents) ────────────────────────────
// Renders the SAME GeminiSheetSpec structure into a Word document.
// Tabs become headings, columns become tables, sample_data fills rows.

async function renderDocx(spec: GeminiSheetSpec): Promise<Buffer> {
  const cs = spec.color_scheme;
  const PRIMARY_HEX = cs.primary;
  const ACCENT_HEX = cs.accent;
  const SECTION_BG = cs.section_header;

  const children: Paragraph[] = [];

  // Title page
  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 200 },
      children: [
        new TextRun({
          text: spec.product_name,
          bold: true,
          size: 56,
          color: PRIMARY_HEX,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: spec.tagline,
          italics: true,
          size: 26,
          color: "666666",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [
        new TextRun({
          text: "─".repeat(40),
          color: ACCENT_HEX,
        }),
      ],
    }),
  );

  // Table of contents
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 200 },
      children: [
        new TextRun({ text: "What's Inside", bold: true, color: PRIMARY_HEX, size: 32 }),
      ],
    }),
  );
  for (const tab of spec.tabs) {
    children.push(
      new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({ text: `  • ${tab.name}`, bold: true, size: 24 }),
          new TextRun({ text: `  —  ${tab.purpose}`, color: "666666", size: 22 }),
        ],
      }),
    );
  }

  // Each tab → heading + tables
  const allParagraphsAndTables: (Paragraph | Table)[] = [...children];

  for (const tab of spec.tabs) {
    allParagraphsAndTables.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 600, after: 200 },
        pageBreakBefore: true,
        children: [
          new TextRun({ text: tab.name, bold: true, color: PRIMARY_HEX, size: 40 }),
        ],
      }),
      new Paragraph({
        spacing: { after: 300 },
        children: [
          new TextRun({ text: tab.purpose, italics: true, color: "555555", size: 22 }),
        ],
      }),
    );

    for (const section of tab.sections) {
      if (section.title) {
        allParagraphsAndTables.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 150 },
            shading: { type: ShadingType.SOLID, color: SECTION_BG, fill: SECTION_BG },
            children: [
              new TextRun({
                text: section.title,
                bold: true,
                color: PRIMARY_HEX,
                size: 26,
              }),
            ],
          }),
        );
      }

      // Build table
      const cols = section.columns;
      if (!cols.length) continue;

      const headerRow = new TableRow({
        tableHeader: true,
        children: cols.map((col) => new TableCell({
          shading: { type: ShadingType.SOLID, color: PRIMARY_HEX, fill: PRIMARY_HEX },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: col.header,
                  bold: true,
                  color: cs.primary_text,
                  size: 20,
                }),
              ],
            }),
          ],
        })),
      });

      const dataRows: TableRow[] = [];
      for (let r = 0; r < Math.min(section.row_count, section.sample_data.length); r++) {
        const row = section.sample_data[r] ?? {};
        const isAlt = r % 2 === 1;
        dataRows.push(new TableRow({
          children: cols.map((col) => {
            const v = row[col.key];
            let txt = "";
            if (v === undefined || v === null || v === "") {
              txt = "";
            } else if (col.type === "currency" && typeof v === "number") {
              txt = `$${v.toFixed(2)}`;
            } else if (col.type === "percent" && typeof v === "number") {
              txt = `${v.toFixed(1)}%`;
            } else {
              txt = String(v);
            }
            return new TableCell({
              shading: isAlt ? { type: ShadingType.SOLID, color: cs.alt_row, fill: cs.alt_row } : undefined,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: txt, size: 18 })],
                }),
              ],
            });
          }),
        }));
      }

      allParagraphsAndTables.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [headerRow, ...dataRows],
          borders: {
            top:    { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
            left:   { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
            right:  { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "EEEEEE" },
            insideVertical:   { style: BorderStyle.SINGLE, size: 2, color: "EEEEEE" },
          },
        }),
        new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 200 } }),
      );
    }
  }

  const doc = new Document({
    creator: "CraftPlan Digital",
    title: spec.product_name,
    description: spec.tagline,
    sections: [{
      properties: {},
      children: allParagraphsAndTables,
    }],
  });

  const buf = await Packer.toBuffer(doc);
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}

// ── CSV renderer (data-only, simple) ──────────────────────────

function renderCsv(spec: GeminiSheetSpec): Buffer {
  const lines: string[] = [];
  const escape = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  lines.push(`# ${spec.product_name}`);
  lines.push(`# ${spec.tagline}`);
  lines.push("");

  for (const tab of spec.tabs) {
    lines.push(`## ${tab.name}`);
    for (const section of tab.sections) {
      if (section.title) lines.push(`# ${section.title}`);
      const cols = section.columns;
      if (!cols.length) continue;
      lines.push(cols.map((c) => escape(c.header)).join(","));
      for (let r = 0; r < Math.min(section.row_count, section.sample_data.length); r++) {
        const row = section.sample_data[r] ?? {};
        lines.push(cols.map((c) => escape(row[c.key] ?? "")).join(","));
      }
      lines.push("");
    }
    lines.push("");
  }

  return Buffer.from(lines.join("\n"), "utf-8");
}

// ── Gemini prompt builder ─────────────────────────────────────

function buildGeminiPrompt(keyword: string, niche: string, colorPreset: GeminiSheetSpec["color_scheme"]): string {
  const isBudget = /budget|finance|money|expense|saving|paycheck|debt|bill|tracker/i.test(keyword);

  return `You are a top 1% Etsy spreadsheet designer competing directly with the bestsellers (Aspire Budgeting, Tiller, Annual Ultimate Budget templates that sell for $15-29). Build a SPEC that produces a template that BEATS them on completeness and aesthetic.

PRODUCT KEYWORD: "${keyword}"
NICHE: ${niche}

Your output is the EXACT structure of an .xlsx file the buyer opens. Every tab, every column, every formula, every sample row will appear in the file. Reach the 20-tab bar that "Ultimate Budget Spreadsheet" listings hit on Etsy.

═══ THE PROVEN BESTSELLER STRUCTURE ═══
${isBudget ? `Top 8 budget bestsellers ALL share this 4-section, 20-28 tab layout. You MUST follow it:

SECTION 1 — SETUP (3-4 tabs)
- "Start Here" — onboarding instructions, what to fill out first
- "Categories" — customizable income/expense category list (used by VLOOKUP elsewhere)
- "Recurring Setup" — bills, subscriptions, savings auto-rules (the "no copy paste" feature buyers demand)
- "Goals & Targets" — savings goals, sinking funds setup, debt list

SECTION 2 — TRANSACTIONS (12-13 tabs: dashboard + 12 monthly)
- "Annual Dashboard" — KPI cards (total income, total spent, total saved, net worth delta), spending by category, savings rate, donut-style category breakdown using DATA BARS in cells
- One tab per month: "January", "February", ... "December" — each with the same column structure (Date, Description, Category, Amount, Account, Notes)

SECTION 3 — DASHBOARDS (4-5 tabs)
- "Monthly Insights" — month picker + dynamic stats
- "Paycheck Planner" — biweekly/weekly paycheck breakdown
- "50/30/20 Split" — needs/wants/savings allocation
- "Bill Calendar" — month grid with bill due dates highlighted

SECTION 4 — BUILD WEALTH (4-5 tabs)
- "Debt Snowball/Avalanche" — up to 40 debts with min payment, APR, payoff date formula, snowball order
- "Sinking Funds" — multiple savings goals with target/progress/deadline
- "Net Worth Tracker" — assets vs liabilities by month
- "Subscriptions Audit" — monthly recurring services, annual cost calc, "Cancel?" checkbox
- "Annual Summary" — year-over-year comparison

TARGET: 18-22 tabs. Less than 15 is NOT competitive on Etsy.` :
`This product is NOT a budget. Build an analogous deep structure for "${keyword}":
- Section 1: SETUP (intro, categories, settings)
- Section 2: ENTRY/LOG (the daily-use tabs — monthly or per-item)
- Section 3: DASHBOARDS (analytics views with KPIs)
- Section 4: ANALYSIS (deep-dive trackers specific to this niche)
TARGET: 12-18 tabs.`}

═══ STYLE & AESTHETIC (CRITICAL) ═══
The Etsy bestseller aesthetics that sell are:
- NEUTRAL CREAM (cream + taupe + sage accent — like "Ultimate Budget Spreadsheet")
- DARK MODE (charcoal + neon accent — fastest growing aesthetic)
- COQUETTE / CHERRY (cream + pink + red cherries — UNDERSERVED, use this for women-targeted niches)
- MINIMALIST PASTEL (off-white + soft sage / blush)
- COTTAGE NEUTRAL (warm beige + dusty sage)

DO NOT use these saturated palettes:
- #2D6A4F forest green / #5B8A5F sage (every basic budget template uses these)
- #1B3A5C navy + gold (overused "premium" combo)
- Pure white + pure black (boring)

Suggested palette to riff on (override if a better aesthetic fits):
  primary "#${colorPreset.primary}" / accent "#${colorPreset.accent}" / alt_row "#${colorPreset.alt_row}"

═══ DASHBOARD TAB QUALITY BAR ═══
First tab MUST be the dashboard with:
1. **At least 6 KPI cards** as merged-cell tiles with single-cell formulas (e.g. "=SUM(January!D:D)+SUM(February!D:D)+...+SUM(December!D:D)" for total income)
2. **A "Spending by Category" section** with categories listed and amounts that will be visualized as DATA BARS (Excel's built-in conditional formatting renders these as colored bars in the cell — that's our "donut chart" replacement that works without an image)
3. **A "Savings Goals Progress" section** with goals, target, saved, %, where the % column will be visualized as a DATA BAR
4. **Cross-tab formulas** — every dashboard cell pulls from another tab (otherwise it's not a real dashboard)

═══ FORMULA QUALITY ═══
Every section that tracks money MUST include working formulas:
- formula_template uses {r} for row number, e.g. "=B{r}-C{r}", "=IF(D{r}>0,B{r}/D{r},0)"
- For dashboard KPIs, use cross-tab refs: e.g. "=SUMIFS(January!D:D,January!C:C,A{r})"
- totals_row must be true on every money-tracking section

═══ SAMPLE DATA ═══
Provide 10-15 rows of HYPER-SPECIFIC sample_data for each data tab:
- Real-sounding category names (Whole Foods, Verizon, Spotify, Trader Joe's, Costco, Target — not "Grocery 1", "Bill 1")
- Plausible amounts ($4.79 for coffee, $127.43 for groceries, $1,850 for rent)
- Real recent dates (use 2026 dates spread across the month)
- Mix of debit/credit/cash entries

═══ NICHE-SPECIFIC COLUMN NAMES (NOT GENERIC) ═══
- Freelance tracker → "Client", "Project", "Hourly Rate", "Hours", "Invoice #", "Status (Sent/Paid/Overdue)"
- Wedding → "Vendor", "Category", "Quoted", "Deposit", "Final", "Paid?", "Due Date"
- Pet care → "Pet Name", "Vet", "Reason", "Cost", "Insurance Reim.", "Next Visit"
- Travel → "Day", "Activity", "Pre-paid", "On-site Cost", "Confirmed?"

Return ONLY valid JSON matching this exact structure (no markdown fences):
{
  "product_name": "string — specific product title for Etsy",
  "tagline": "string — 1-sentence value proposition",
  "niche": "${niche}",
  "color_scheme": {
    "primary": "hex without #",
    "primary_text": "hex without #",
    "accent": "hex without #",
    "accent_text": "hex without #",
    "alt_row": "hex without #",
    "section_header": "hex without #"
  },
  "tabs": [
    {
      "name": "Tab name (max 31 chars)",
      "type": "dashboard|tracker|reference|summary|planner",
      "purpose": "One sentence describing what this tab does for the buyer",
      "freeze_header": true,
      "sections": [
        {
          "title": "Section title or null",
          "columns": [
            {
              "header": "Column Header",
              "key": "column_key",
              "width": 18,
              "type": "text|number|currency|percent|date|formula|checkbox",
              "formula_template": null,
              "note": null
            }
          ],
          "row_count": 12,
          "sample_data": [
            { "column_key": "sample value" }
          ],
          "totals_row": false
        }
      ]
    }
  ]
}

Niche context: ${niche}
Product keyword: ${keyword}

═══ HARD CHECKS BEFORE YOU RETURN ═══
- ${isBudget ? "Tab count is 18-22 (budget bestsellers MUST hit this)" : "Tab count is 12-18"}
- First tab is "Dashboard" (or named like Annual Dashboard / Overview Dashboard) and has >= 6 KPI cards
- ${isBudget ? "Includes 12 monthly transaction tabs (January through December) with identical column structure" : ""}
- Every money-tracking section has totals_row: true with formula_template on the totals
- 10-15 rows of sample_data per tab with hyper-specific real-sounding values
- Color palette is NOT forest green or navy/gold — pick something distinctive

Output a template buyers would happily pay $15-29 for. The bestseller tier on Etsy hits all the above.`;
}

// ── Route handler ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { keyword, niche, factoryRunId, format: rawFormat } = body as {
      keyword: string;
      niche?: string;
      factoryRunId?: string;
      format?: string;
    };

    if (!keyword?.trim()) {
      return NextResponse.json({ error: "keyword is required" }, { status: 400 });
    }

    const format: "xlsx" | "docx" | "csv" =
      rawFormat === "docx" ? "docx" : rawFormat === "csv" ? "csv" : "xlsx";

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    const resolvedNiche = niche || keyword;
    const colorPreset = resolvePreset(keyword);

    // ── 1. Generate spec with Gemini ──
    console.log(`[Gemini Build] Generating spec for: "${keyword}"`);
    const t0 = Date.now();

    const prompt = buildGeminiPrompt(keyword, resolvedNiche, colorPreset);
    let rawSpec: string;
    try {
      // Use Gemini 2.5 Pro with max token budget — bestseller-grade specs
      // need 18-22 tabs which Flash can't fit in its 8k output budget.
	      rawSpec = await callGeminiJSON(apiKey, prompt, {
	        temperature: 0.85,
	        maxOutputTokens: 32768,
	      });
    } catch (err) {
      console.error("[Gemini Build] Gemini call failed:", err);
      return NextResponse.json(
        { error: `Gemini API failed: ${err instanceof Error ? err.message : "unknown error"}` },
        { status: 500 }
      );
    }

    const geminiMs = Date.now() - t0;
    console.log(`[Gemini Build] Spec generated in ${geminiMs}ms`);

    let spec: GeminiSheetSpec;
    try {
      spec = parseGeminiJSON<GeminiSheetSpec>(rawSpec);
    } catch {
      console.error("[Gemini Build] Failed to parse spec JSON:", rawSpec?.slice(0, 500));
      return NextResponse.json(
        { error: "Failed to parse Gemini spec — malformed JSON" },
        { status: 500 }
      );
    }

    // Validate minimum structure
    if (!spec.tabs?.length) {
      return NextResponse.json({ error: "Gemini returned no tabs" }, { status: 500 });
    }

    // Fill in missing color scheme fields with preset defaults
    spec.color_scheme = { ...colorPreset, ...spec.color_scheme };

    // ── 2. Render in requested format(s) ──
    // For xlsx: render 3 palette variants (neutral / dark / cherry) so the
    // seller gets 3 distinct Etsy SKUs from one Gemini run. For docx/csv:
    // single render with the keyword-detected palette.
    console.log(`[Gemini Build] Rendering ${spec.tabs.length} tabs as ${format.toUpperCase()} for "${spec.product_name}"`);
    const t1 = Date.now();

    const safeName = (spec.product_name || keyword)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);

    const baseUrl = `${new URL(req.url).protocol}//${new URL(req.url).host}`;
    const projectId = `gemini_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    type Variant = {
      key: string;
      label: string;
      fileName: string;
      fileSizeBytes: number;
      downloadUrl?: string;
      assetId?: string;
    };

    async function uploadAsset(buffer: Buffer, mime: string, name: string): Promise<{ downloadUrl?: string; assetId?: string; fileSizeBytes?: number; fileName?: string }> {
      const fd = new FormData();
      const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
      fd.append("file", new Blob([ab], { type: mime }), name);
      fd.append("projectId", projectId);
      fd.append("fileName", name);
      fd.append("assetType", "product");
	      const r = await fetch(`${baseUrl}/api/digital/assets`, { method: "POST", body: fd });
	      if (!r.ok) return {};
	      const j = await r.json().catch(() => ({}));
	      return j.asset ? { ...j.asset, assetId: j.asset.id } : {};
	    }

    const variants: Variant[] = [];
    let primaryBuffer: Buffer | null = null;
    let primaryMime = "";
    let primaryFileName = "";
    let primaryAsset: { downloadUrl?: string; assetId?: string; fileSizeBytes?: number; fileName?: string } = {};

    try {
      if (format === "docx") {
        const buf = await renderDocx(spec);
        primaryBuffer = buf;
        primaryMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        primaryFileName = `${safeName}.docx`;
        primaryAsset = await uploadAsset(buf, primaryMime, primaryFileName);
        variants.push({
          key: "primary",
          label: "Word Document",
          fileName: primaryAsset.fileName ?? primaryFileName,
          fileSizeBytes: primaryAsset.fileSizeBytes ?? buf.length,
          downloadUrl: primaryAsset.downloadUrl,
          assetId: primaryAsset.assetId,
        });
      } else if (format === "csv") {
        const buf = renderCsv(spec);
        primaryBuffer = buf;
        primaryMime = "text/csv";
        primaryFileName = `${safeName}.csv`;
        primaryAsset = await uploadAsset(buf, primaryMime, primaryFileName);
        variants.push({
          key: "primary",
          label: "CSV",
          fileName: primaryAsset.fileName ?? primaryFileName,
          fileSizeBytes: primaryAsset.fileSizeBytes ?? buf.length,
          downloadUrl: primaryAsset.downloadUrl,
          assetId: primaryAsset.assetId,
        });
      } else {
        // ── XLSX: render 3 palette variants (Etsy SKU multiplier) ──
        primaryMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

        // Render in parallel — saves 30-60s per build
        const results = await Promise.all(
          VARIANT_PALETTES.map(async (v) => {
            const variantSpec: GeminiSheetSpec = {
              ...spec,
              color_scheme: v.palette,
            };
            const buf = await renderSpreadsheet(variantSpec);
            const name = `${safeName}-${v.key}.xlsx`;
            const asset = await uploadAsset(buf, primaryMime, name);
            return {
              key: v.key,
              label: v.label,
              buffer: buf,
              fileName: asset.fileName ?? name,
              fileSizeBytes: asset.fileSizeBytes ?? buf.length,
              downloadUrl: asset.downloadUrl,
              assetId: asset.assetId,
            };
          })
        );

        for (const r of results) {
          variants.push({
            key: r.key,
            label: r.label,
            fileName: r.fileName,
            fileSizeBytes: r.fileSizeBytes,
            downloadUrl: r.downloadUrl,
            assetId: r.assetId,
          });
        }

        // First variant (Neutral Cream — bestseller default) is the primary
        primaryBuffer = results[0].buffer;
        primaryFileName = results[0].fileName;
        primaryAsset = {
          downloadUrl: results[0].downloadUrl,
          assetId: results[0].assetId,
          fileSizeBytes: results[0].fileSizeBytes,
          fileName: results[0].fileName,
        };
      }
    } catch (err) {
      console.error(`[Gemini Build] ${format} render failed:`, err);
      return NextResponse.json(
        { error: `${format.toUpperCase()} render failed: ${err instanceof Error ? err.message : "unknown"}` },
        { status: 500 }
      );
    }

    if (!primaryBuffer || !primaryAsset.downloadUrl) {
      return NextResponse.json({ error: "Failed to upload generated files" }, { status: 500 });
    }

    const renderMs = Date.now() - t1;
    console.log(`[Gemini Build] Rendered ${variants.length} variant(s) in ${renderMs}ms`);

    // Save full Gemini spec to the run so the preview engine can render it
    // directly (niche-specific tabs, columns, sample data, color palette)
    // instead of the generic synthetic blueprint template.
    if (factoryRunId) {
      updateFactoryRun(factoryRunId, {
        status: "generating",
        geminiSheetSpec: JSON.stringify(spec),
      });
    }

    return NextResponse.json({
      success: true,
      builderPath: format === "docx" ? "gemini-docx" : format === "csv" ? "gemini-csv" : "gemini-exceljs",
      format,
      // Primary (used by the orchestrator pipeline)
      fileName: primaryAsset.fileName ?? primaryFileName,
      fileSizeBytes: primaryAsset.fileSizeBytes ?? primaryBuffer.length,
      downloadUrl: primaryAsset.downloadUrl,
      assetId: primaryAsset.assetId,
      // All palette variants (for multi-SKU listing)
      variants,
      productName: spec.product_name,
      tagline: spec.tagline,
      tabCount: spec.tabs.length,
      sheetSpec: {
        product_name: spec.product_name,
        tagline: spec.tagline,
        niche: spec.niche,
        tabs: spec.tabs.map((t) => ({ name: t.name, type: t.type, purpose: t.purpose })),
        color_scheme: spec.color_scheme,
      },
      timingMs: {
        gemini: geminiMs,
        render: renderMs,
        total: Date.now() - t0,
      },
    });
  } catch (err) {
    console.error("[Gemini Build] Unhandled error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gemini build failed" },
      { status: 500 }
    );
  }
}
