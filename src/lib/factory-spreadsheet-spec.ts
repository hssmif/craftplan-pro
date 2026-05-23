// ══════════════════════════════════════════════════════════════
// SpreadsheetSpec — declarative workbook recipe
//
// This is the CONTRACT between two parts of the new builder:
//
//   1. `factory-openai-spec-generator.ts` PRODUCES a SpreadsheetSpec
//      by calling OpenAI with Structured Outputs (JSON Schema enforced).
//
//   2. `factory-spec-renderer.ts` CONSUMES a SpreadsheetSpec and
//      writes the actual .xlsx via ExcelJS.
//
// Keep the shape simple and 1:1 with ExcelJS primitives so the
// renderer is a thin translation layer. Anything fancier must be
// expressible by composing these primitives — no surprise behavior
// in the renderer.
// ══════════════════════════════════════════════════════════════

// ─── Workbook ────────────────────────────────────────────────

export interface SpreadsheetSpec {
  workbook: WorkbookMeta;
  /** Workbook-level defined names: name -> A1 ref (e.g., "Settings!$C$1"). */
  definedNames?: Record<string, string>;
  tabs: TabSpec[];
}

export interface WorkbookMeta {
  /** Document title shown in file metadata (NOT a sheet). */
  title: string;
  /** Up to 6 primary hex colors that anchor the visual theme. */
  paletteHex: string[];
  /** Font family used unless a cell overrides. Default "Arial". */
  fontFamily?: string;
  /** Short creator string for file metadata. */
  creator?: string;
}

// ─── Tabs ────────────────────────────────────────────────────

export interface TabSpec {
  name: string;
  /** Hex color shown on the sheet tab. */
  tabColor?: string;
  /** A1 of the freeze split (e.g. "B6" freezes row 5 + col A). */
  freeze?: string;
  /** Column widths starting from A. 0 = default. Length not enforced. */
  columnWidths?: number[];
  /** 1-indexed row -> height (points). */
  rowHeights?: Record<number, number>;
  /** Hide gridlines on this tab. Default true (premium look). */
  hideGridlines?: boolean;
  cells: CellSpec[];
  /** A1 ranges to merge (e.g., "A1:F1"). */
  merges?: string[];
  charts?: ChartSpec[];
  conditionalFormats?: ConditionalFormatSpec[];
  dataValidations?: DataValidationSpec[];
}

// ─── Cell ────────────────────────────────────────────────────

export interface CellSpec {
  /** A1 ref of the cell (e.g. "B5"). */
  ref: string;
  /** Literal value. Ignored if `formula` is set. */
  value?: string | number | boolean | null;
  /** Excel formula WITHOUT leading "=" (renderer prepends it). */
  formula?: string;
  /** Excel number format (e.g. '"$"#,##0.00'). */
  numberFormat?: string;
  font?: CellFont;
  fill?: CellFill;
  alignment?: CellAlignment;
  border?: CellBorder;
}

export interface CellFont {
  name?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  /** ARGB hex (e.g. "FF000000" or "5C7558"). Renderer normalizes. */
  color?: string;
}

export interface CellFill {
  /** ARGB or 6-char hex. */
  color: string;
}

export interface CellAlignment {
  horizontal?: "left" | "center" | "right";
  vertical?: "top" | "middle" | "bottom";
  wrapText?: boolean;
  indent?: number;
}

export interface CellBorder {
  /** Applied to all 4 sides unless one is set explicitly. */
  style?: BorderStyle;
  color?: string;
  top?: { style: BorderStyle; color?: string };
  right?: { style: BorderStyle; color?: string };
  bottom?: { style: BorderStyle; color?: string };
  left?: { style: BorderStyle; color?: string };
}

export type BorderStyle = "thin" | "medium" | "thick" | "dashed";

// ─── Charts ──────────────────────────────────────────────────

export interface ChartSpec {
  type: ChartType;
  title?: string;
  /** A1 range of values (e.g. "Dashboard!C18:D29"). Kept for metadata. */
  dataRange: string;
  /** Optional A1 range of category labels. */
  categoryRange?: string;
  /**
   * Sample data for rendering the chart PREVIEW image. Required.
   * Each `series` is one bar/line/slice group; categories label them.
   * The LLM must provide REPRESENTATIVE values matching what the
   * formulas in dataRange will produce (e.g. monthly income totals).
   */
  data: {
    /** Category labels (x-axis or pie slices). */
    categories: string[];
    /** One series per data column. */
    series: Array<{ name: string; values: number[] }>;
  };
  /** Position of top-left corner (1-indexed). */
  anchor: { row: number; col: number };
  /** Pixel size of the chart image. */
  size?: { width: number; height: number };
  /** Hex per series, in order. */
  seriesColors?: string[];
  /** "b" bottom, "t" top, "r" right, "l" left, or "none". */
  legend?: "b" | "t" | "r" | "l" | "none";
}

export type ChartType =
  | "bar"        // horizontal bars
  | "column"     // vertical bars
  | "line"
  | "pie"
  | "doughnut"
  | "area";

// ─── Conditional Formatting ──────────────────────────────────

export interface ConditionalFormatSpec {
  /** A1 range to apply to (e.g. "C2:C100"). */
  range: string;
  rule: CFRule;
}

export type CFRule =
  | CFCellIs
  | CFColorScale
  | CFDataBar
  | CFFormula;

export interface CFCellIs {
  kind: "cellIs";
  operator: "greaterThan" | "lessThan" | "between" | "equal" | "notEqual" | "greaterThanOrEqual" | "lessThanOrEqual";
  /** 1 value for most; 2 for "between". Numbers or formula strings. */
  values: Array<string | number>;
  fill?: string;
  fontColor?: string;
  bold?: boolean;
}

export interface CFColorScale {
  kind: "colorScale";
  minColor: string;
  midColor?: string;
  maxColor: string;
  /** Optional explicit values; defaults to range min/mid/max. */
  minValue?: number;
  midValue?: number;
  maxValue?: number;
}

export interface CFDataBar {
  kind: "dataBar";
  color: string;
  minValue?: number;
  maxValue?: number;
}

export interface CFFormula {
  kind: "formula";
  /** Formula WITHOUT leading "=" (e.g. 'B2="OVER"'). */
  formula: string;
  fill?: string;
  fontColor?: string;
  bold?: boolean;
}

// ─── Data Validation ─────────────────────────────────────────

export interface DataValidationSpec {
  /** A1 range to apply (e.g. "D6:D205"). */
  range: string;
  type: "list";
  /**
   * Either a literal list (sent inline as "a,b,c") or a reference
   * (e.g. "=CategoryList" or "=Settings!$E$2:$E$30").
   */
  options: string[] | { ref: string };
  /** Allow empty cell. Default true. */
  allowBlank?: boolean;
}
