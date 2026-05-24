// ══════════════════════════════════════════════════════════════
// SpreadsheetSpec → .xlsx Renderer
//
// Deterministic translation of a SpreadsheetSpec (LLM-generated)
// into a real Excel workbook via ExcelJS.
//
// This file has zero creative logic. It just takes the spec and
// mechanically applies it to ExcelJS APIs. All design decisions
// live in the spec, which comes from `factory-openai-spec-generator.ts`.
//
// Renderer guarantees:
//   - Invalid inputs degrade gracefully (skip bad cells, log warnings)
//   - Output is always a valid .xlsx Buffer
//   - No hardcoded tabs, charts, formulas, palettes — everything
//     in the output traces back to the spec.
// ══════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-require-imports
import ExcelJS from "exceljs";
import { spawnSync } from "child_process";
import { writeFileSync, unlinkSync, readFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import type {
  SpreadsheetSpec,
  TabSpec,
  CellSpec,
  ChartSpec,
  ConditionalFormatSpec,
  DataValidationSpec,
  CellBorder,
  BorderStyle,
} from "./factory-spreadsheet-spec";

// ─── Public API ──────────────────────────────────────────────

export interface RenderResult {
  buffer: Buffer;
  /** Counts of what was rendered, useful for telemetry/QA. */
  stats: {
    tabs: number;
    cells: number;
    formulas: number;
    charts: number;
    conditionalFormatRules: number;
    dataValidations: number;
    skipped: number;
  };
}

export async function renderSpreadsheet(
  spec: SpreadsheetSpec,
): Promise<RenderResult> {
  const wb = new ExcelJS.Workbook();
  wb.creator = spec.workbook.creator || "Craftplan Factory";
  wb.title = spec.workbook.title || "Untitled";
  wb.created = new Date();

  // Collected chart specs — applied after ExcelJS save via Python+openpyxl
  // because ExcelJS cannot write native chart objects.
  const pendingCharts: Array<{ tabName: string; spec: ChartSpec }> = [];

  const stats: RenderResult["stats"] = {
    tabs: 0,
    cells: 0,
    formulas: 0,
    charts: 0,
    conditionalFormatRules: 0,
    dataValidations: 0,
    skipped: 0,
  };

  // Defined names (workbook-level). ExcelJS calls these "names".
  if (spec.definedNames) {
    for (const [name, ref] of Object.entries(spec.definedNames)) {
      try {
        wb.definedNames.add(ref, name);
      } catch (err) {
        console.warn(`[Renderer] definedName ${name}=${ref} failed:`, err);
        stats.skipped++;
      }
    }
  }

  const defaultFont = spec.workbook.fontFamily || "Arial";

  for (const tabSpec of spec.tabs) {
    const ws = wb.addWorksheet(safeName(tabSpec.name), {
      properties: {
        tabColor: tabSpec.tabColor ? { argb: argb(tabSpec.tabColor) } : undefined,
        defaultRowHeight: 18,
      },
      views: [
        {
          state: "normal",
          showGridLines: tabSpec.hideGridlines === false ? true : false,
        },
      ],
    });
    stats.tabs++;

    // Column widths. If the spec omits them or doesn't cover all used
    // columns, fall back to a sensible default so the file doesn't look
    // broken when opened (default ExcelJS column = 8.43 chars = cramped).
    const explicitWidths = tabSpec.columnWidths || [];
    explicitWidths.forEach((w, i) => {
      if (w > 0) ws.getColumn(i + 1).width = w;
    });
    // Find the rightmost used column (from cells + merges + chart anchors)
    let maxCol = explicitWidths.length;
    for (const c of tabSpec.cells) {
      try {
        maxCol = Math.max(maxCol, parseA1(c.ref).col);
      } catch {
        /* ignore bad refs */
      }
    }
    for (const m of tabSpec.merges || []) {
      try {
        const [, brA1] = m.split(":");
        if (brA1) maxCol = Math.max(maxCol, parseA1(brA1).col);
      } catch {
        /* ignore */
      }
    }
    // Defaults: col A = 3 (margin), other cols = 12 if unset
    for (let i = 1; i <= maxCol; i++) {
      const col = ws.getColumn(i);
      if (!col.width || col.width <= 0) {
        col.width = i === 1 ? 3 : 12;
      }
    }

    // Row heights
    if (tabSpec.rowHeights) {
      for (const [rowStr, h] of Object.entries(tabSpec.rowHeights)) {
        const r = Number(rowStr);
        if (Number.isInteger(r) && r > 0 && typeof h === "number" && h > 0) {
          ws.getRow(r).height = h;
        }
      }
    }

    // Cells
    for (const cellSpec of tabSpec.cells) {
      try {
        applyCell(ws, cellSpec, defaultFont);
        stats.cells++;
        if (cellSpec.formula) stats.formulas++;
      } catch (err) {
        console.warn(`[Renderer] cell ${cellSpec.ref} on ${tabSpec.name} failed:`, err);
        stats.skipped++;
      }
    }

    // Merges (after cells, so the merge picks up the top-left value).
    // Skip degenerate (single-cell) and duplicate merges; ExcelJS throws
    // on those and we'd rather lose nothing than the whole tab.
    if (tabSpec.merges) {
      const seenMerges = new Set<string>();
      for (const range of tabSpec.merges) {
        const [tlA1, brA1] = range.split(":");
        if (!brA1 || tlA1 === brA1) continue; // degenerate
        if (seenMerges.has(range)) continue; // duplicate
        seenMerges.add(range);
        try {
          ws.mergeCells(range);
        } catch (err) {
          console.warn(`[Renderer] merge ${range} on ${tabSpec.name} skipped:`, (err as Error).message);
          stats.skipped++;
        }
      }
    }

    // Conditional formatting
    if (tabSpec.conditionalFormats) {
      for (const cf of tabSpec.conditionalFormats) {
        try {
          applyConditionalFormat(ws, cf);
          stats.conditionalFormatRules++;
        } catch (err) {
          console.warn(`[Renderer] CF on ${tabSpec.name} ${cf.range} failed:`, err);
          stats.skipped++;
        }
      }
    }

    // Data validations
    if (tabSpec.dataValidations) {
      for (const dv of tabSpec.dataValidations) {
        try {
          applyDataValidation(ws, dv);
          stats.dataValidations++;
        } catch (err) {
          console.warn(`[Renderer] DV on ${tabSpec.name} ${dv.range} failed:`, err);
          stats.skipped++;
        }
      }
    }

    // Charts — defer to Python+openpyxl injection AFTER ExcelJS save.
    // Native chart objects (live-updating when buyer edits cells)
    // can't be written by ExcelJS, so we record specs here and apply
    // them in a second pass below.
    if (tabSpec.charts) {
      for (const chart of tabSpec.charts) {
        pendingCharts.push({ tabName: tabSpec.name, spec: chart });
      }
    }

    // Freeze pane
    if (tabSpec.freeze) {
      try {
        const { col, row } = parseA1(tabSpec.freeze);
        ws.views = [
          {
            state: "frozen",
            xSplit: col - 1,
            ySplit: row - 1,
            showGridLines: tabSpec.hideGridlines === false,
          },
        ];
      } catch (err) {
        console.warn(`[Renderer] freeze on ${tabSpec.name} failed:`, err);
      }
    }
  }

  const arr = await wb.xlsx.writeBuffer();
  let finalBuffer: Buffer = Buffer.from(arr as ArrayBuffer);

  // ─── Phase 2: Inject native charts via Python+openpyxl ───
  if (pendingCharts.length > 0) {
    try {
      const injected = await injectNativeCharts(finalBuffer, pendingCharts);
      finalBuffer = injected.buffer;
      stats.charts = injected.added;
      stats.skipped += injected.skipped;
    } catch (err) {
      console.warn(
        `[Renderer] Native chart injection failed; workbook saved without charts: ${(err as Error).message}`,
      );
      stats.skipped += pendingCharts.length;
    }
  }

  return { buffer: finalBuffer, stats };
}

// ─── Native chart injection via Python + openpyxl ──────────────

async function injectNativeCharts(
  xlsxBuffer: Buffer,
  charts: Array<{ tabName: string; spec: ChartSpec }>,
): Promise<{ buffer: Buffer; added: number; skipped: number }> {
  const ts = Date.now();
  const rnd = Math.random().toString(36).slice(2, 8);
  const baseDir = path.join(tmpdir(), `craftplan-charts-${ts}-${rnd}`);
  const xlsxPath = path.join(baseDir, "workbook.xlsx");
  const jsonPath = path.join(baseDir, "charts.json");

  // Ensure scratch dir exists
  const fs = await import("fs");
  fs.mkdirSync(baseDir, { recursive: true });

  // Translate spec to the Python-side shape
  const pySpecs = charts.map(({ tabName, spec }) => ({
    tab: tabName,
    type: spec.type,
    title: spec.title,
    dataRange: spec.dataRange,
    categoryRange: spec.categoryRange,
    anchor: colRowToA1(spec.anchor.col, spec.anchor.row),
    size: spec.size,
    seriesColors: spec.seriesColors,
    legend: spec.legend,
  }));

  writeFileSync(xlsxPath, xlsxBuffer);
  writeFileSync(jsonPath, JSON.stringify(pySpecs));

  // Resolve Python at runtime. Turbopack tries to trace static fs checks
  // into the venv symlink, so avoid existsSync() here and simply try the
  // venv interpreter before falling back to system python3.
  const script = projectPath("scripts", "inject-native-charts.py");
  const pythonCandidates = [
    process.env.CRAFTPLAN_PYTHON,
    projectPath("pattern-engine", ".venv", "bin", "python"),
    "python3",
  ].filter((value): value is string => Boolean(value));

  let result: ReturnType<typeof spawnSync> | null = null;
  let py = "";
  for (const candidate of pythonCandidates) {
    py = candidate;
    result = spawnSync(candidate, [script, xlsxPath, jsonPath], {
      timeout: 60_000,
      encoding: "utf-8",
    });

    if (!result.error && result.status === 0) break;
    const stderr = outputText(result.stderr);
    if (
      result.error ||
      /No module named ['"]openpyxl['"]/i.test(stderr)
    ) {
      continue;
    }
    break;
  }

  if (!result) {
    throw new Error("chart injector could not start a Python interpreter");
  }

  if (result.status !== 0) {
    const stderr = outputText(result.stderr);
    throw new Error(
      `chart injector (${py}) exited ${result.status}: ${stderr.slice(0, 400)}`,
    );
  }

  let parsed: { ok: boolean; added: number; skipped: number };
  try {
    parsed = JSON.parse(outputText(result.stdout).trim().split("\n").pop() || "{}");
  } catch {
    parsed = { ok: false, added: 0, skipped: charts.length };
  }

  const augmented = readFileSync(xlsxPath);

  // Cleanup
  try {
    unlinkSync(xlsxPath);
    unlinkSync(jsonPath);
    fs.rmdirSync(baseDir);
  } catch {
    // best-effort
  }

  return {
    buffer: augmented,
    added: parsed.added ?? 0,
    skipped: parsed.skipped ?? 0,
  };
}

function colRowToA1(col: number, row: number): string {
  let n = col;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return `${s}${row}`;
}

// ─── Cell application ────────────────────────────────────────

function applyCell(
  ws: ExcelJS.Worksheet,
  spec: CellSpec,
  defaultFont: string,
): void {
  const cell = ws.getCell(spec.ref);

  // Value or formula
  if (spec.formula) {
    cell.value = { formula: spec.formula };
  } else if (spec.value !== undefined && spec.value !== null) {
    cell.value = spec.value as ExcelJS.CellValue;
  }

  if (spec.numberFormat) cell.numFmt = spec.numberFormat;

  // Font
  const f = spec.font || {};
  cell.font = {
    name: f.name || defaultFont,
    size: f.size ?? 10,
    bold: !!f.bold,
    italic: !!f.italic,
    color: f.color ? { argb: argb(f.color) } : undefined,
  };

  // Fill
  if (spec.fill?.color) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: argb(spec.fill.color) },
    };
  }

  // Alignment
  if (spec.alignment) {
    const a = spec.alignment;
    cell.alignment = {
      horizontal: a.horizontal,
      vertical: a.vertical === "middle" ? "middle" : a.vertical,
      wrapText: !!a.wrapText,
      indent: a.indent,
    };
  }

  // Border
  if (spec.border) {
    cell.border = makeBorder(spec.border);
  }
}

function makeBorder(b: CellBorder): Partial<ExcelJS.Borders> {
  const buildSide = (
    s: { style: BorderStyle; color?: string } | undefined,
    fallbackStyle?: BorderStyle,
    fallbackColor?: string,
  ): ExcelJS.Border | undefined => {
    const style = s?.style ?? fallbackStyle;
    if (!style) return undefined;
    const color = s?.color ?? fallbackColor;
    return {
      style: mapBorderStyle(style),
      color: { argb: argb(color || "C0C0C0") },
    };
  };
  return {
    top: buildSide(b.top, b.style, b.color),
    right: buildSide(b.right, b.style, b.color),
    bottom: buildSide(b.bottom, b.style, b.color),
    left: buildSide(b.left, b.style, b.color),
  };
}

function mapBorderStyle(s: BorderStyle): ExcelJS.BorderStyle {
  switch (s) {
    case "thin":
      return "thin";
    case "medium":
      return "medium";
    case "thick":
      return "thick";
    case "dashed":
      return "dashed";
  }
}

// ─── Conditional Formatting ──────────────────────────────────

function applyConditionalFormat(
  ws: ExcelJS.Worksheet,
  cf: ConditionalFormatSpec,
): void {
  const r = cf.rule;
  if (r.kind === "cellIs") {
    // ExcelJS CellIsOperators are a subset — fold notEqual etc into supported set.
    const opMap: Record<string, "greaterThan" | "lessThan" | "between" | "equal" | "greaterThanOrEqual" | "lessThanOrEqual" | "notEqual"> = {
      greaterThan: "greaterThan",
      lessThan: "lessThan",
      between: "between",
      equal: "equal",
      notEqual: "notEqual",
      greaterThanOrEqual: "greaterThanOrEqual",
      lessThanOrEqual: "lessThanOrEqual",
    };
    const op = opMap[r.operator] || "equal";
    ws.addConditionalFormatting({
      ref: cf.range,
      rules: [
        {
          type: "cellIs",
          operator: op as ExcelJS.ConditionalFormattingRule extends { operator: infer O } ? O : never,
          formulae: r.values.map(String),
          priority: 1,
          style: {
            fill: r.fill
              ? {
                  type: "pattern",
                  pattern: "solid",
                  bgColor: { argb: argb(r.fill) },
                }
              : undefined,
            font: r.fontColor || r.bold
              ? { color: r.fontColor ? { argb: argb(r.fontColor) } : undefined, bold: !!r.bold }
              : undefined,
          },
        },
      ],
    });
  } else if (r.kind === "colorScale") {
    ws.addConditionalFormatting({
      ref: cf.range,
      rules: [
        {
          type: "colorScale",
          priority: 1,
          cfvo: r.midColor
            ? [
                { type: "min" },
                { type: "percentile", value: 50 },
                { type: "max" },
              ]
            : [{ type: "min" }, { type: "max" }],
          color: r.midColor
            ? [
                { argb: argb(r.minColor) },
                { argb: argb(r.midColor) },
                { argb: argb(r.maxColor) },
              ]
            : [{ argb: argb(r.minColor) }, { argb: argb(r.maxColor) }],
        },
      ],
    });
  } else if (r.kind === "dataBar") {
    ws.addConditionalFormatting({
      ref: cf.range,
      rules: [
        // ExcelJS dataBar types omit `color` but the renderer accepts it at runtime.
        {
          type: "dataBar",
          priority: 1,
          cfvo: [{ type: "min" }, { type: "max" }],
          color: { argb: argb(r.color) },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      ],
    });
  } else if (r.kind === "formula") {
    ws.addConditionalFormatting({
      ref: cf.range,
      rules: [
        {
          type: "expression",
          formulae: [r.formula],
          priority: 1,
          style: {
            fill: r.fill
              ? {
                  type: "pattern",
                  pattern: "solid",
                  bgColor: { argb: argb(r.fill) },
                }
              : undefined,
            font: r.fontColor || r.bold
              ? { color: r.fontColor ? { argb: argb(r.fontColor) } : undefined, bold: !!r.bold }
              : undefined,
          },
        },
      ],
    });
  }
}

// ─── Data Validation ─────────────────────────────────────────

function applyDataValidation(
  ws: ExcelJS.Worksheet,
  dv: DataValidationSpec,
): void {
  const formulae: string[] = Array.isArray(dv.options)
    ? [`"${dv.options.join(",")}"`]
    : [dv.options.ref.startsWith("=") ? dv.options.ref.slice(1) : dv.options.ref];

  // ExcelJS data validation is per-cell
  const cells = expandRange(dv.range);
  for (const ref of cells) {
    ws.getCell(ref).dataValidation = {
      type: "list",
      allowBlank: dv.allowBlank !== false,
      formulae,
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Normalize a hex color to ARGB form ExcelJS expects:
 *   "5C7558" → "FF5C7558"
 *   "#5C7558" → "FF5C7558"
 *   "FF5C7558" → "FF5C7558"
 */
function argb(c: string): string {
  let s = c.trim().toUpperCase();
  if (s.startsWith("#")) s = s.slice(1);
  if (s.length === 6) return "FF" + s;
  if (s.length === 8) return s;
  // Fallback: black
  return "FF000000";
}

function projectPath(...parts: string[]): string {
  return [process.cwd(), ...parts].join(path.sep);
}

function outputText(value: string | Buffer | null | undefined): string {
  if (!value) return "";
  return Buffer.isBuffer(value) ? value.toString("utf-8") : value;
}

function safeName(name: string): string {
  // Excel sheet name rules: <=31 chars, no : \ / ? * [ ]
  return name.replace(/[:\\/?*[\]]/g, "").slice(0, 31) || "Sheet";
}

function parseA1(a1: string): { col: number; row: number } {
  const m = a1.match(/^([A-Z]+)(\d+)$/i);
  if (!m) throw new Error(`Invalid A1: ${a1}`);
  const colStr = m[1].toUpperCase();
  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64);
  }
  return { col, row: parseInt(m[2], 10) };
}

interface RangeRef {
  sheet: string;
  tl: { col: number; row: number };
  br: { col: number; row: number };
}

function parseRange(range: string, defaultSheet: string): RangeRef {
  // Accepts "Sheet1!A1:B5" or "A1:B5"
  const sheetSep = range.indexOf("!");
  const sheet = sheetSep >= 0 ? range.slice(0, sheetSep).replace(/^'(.*)'$/, "$1") : defaultSheet;
  const a1Part = sheetSep >= 0 ? range.slice(sheetSep + 1) : range;
  const [tlA1, brA1] = a1Part.split(":");
  const tl = parseA1(tlA1);
  const br = brA1 ? parseA1(brA1) : tl;
  return { sheet, tl, br };
}

function expandRange(range: string): string[] {
  // "C2:D5" → ["C2","C3","C4","C5","D2","D3","D4","D5"]
  const [tlA1, brA1] = range.split(":");
  if (!brA1) return [tlA1];
  const tl = parseA1(tlA1);
  const br = parseA1(brA1);
  const out: string[] = [];
  for (let c = tl.col; c <= br.col; c++) {
    for (let r = tl.row; r <= br.row; r++) {
      out.push(`${colLetter(c)}${r}`);
    }
  }
  return out;
}

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
