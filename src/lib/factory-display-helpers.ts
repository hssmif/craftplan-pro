// ══════════════════════════════════════════════════════════════
// Factory Display Helpers — Safe Display Formatting
//
// Prevents raw Excel formulas (e.g. =SUMIFS(Transactions!C:C,...))
// and formula-contaminated text (e.g. $0=B2-C2=B3-C3=B4-C4)
// from leaking into listing images and templates.
//
// Used by:
//   - factory-image-renderer.ts (SVG → PNG pipeline)
//   - factory-spreadsheet-builder.ts (Excel preview rendering)
// ══════════════════════════════════════════════════════════════

// ── Formula Detection ────────────────────────────────────────

/** Pattern that matches formula-contaminated strings like "$0=B2-C2=B3-C3" */
const FORMULA_CONTAMINATION_RE = /=[A-Z]\d+[-+*/][A-Z]\d+/;

/** Pattern that matches emoji characters (broad Unicode range) */
const EMOJI_RE =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

/**
 * Detect if a value is a formula string (starts with =).
 */
export function isFormula(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.trimStart().startsWith("=");
}

// ── Number Formatting ────────────────────────────────────────

/**
 * Format currency for display: 4500 → "$4,500", 11.97 → "$11.97"
 */
export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  const abs = Math.abs(value);
  const formatted =
    abs >= 1 && abs === Math.floor(abs)
      ? abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
      : abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value < 0 ? `-$${formatted}` : `$${formatted}`;
}

/**
 * Format percentage for display: 0.25 → "25%", 25 → "25%"
 */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  // If the value is between -1 and 1 (exclusive), treat it as a decimal ratio
  const pct = Math.abs(value) < 1 && value !== 0 ? value * 100 : value;
  return `${Math.round(pct)}%`;
}

// ── Formula Type Inference ───────────────────────────────────

/**
 * Given a formula string, try to infer what type of value it would produce.
 * "=SUMIFS(...)" → "currency" (sum of money)
 * "=IF(B6>0,(B6-D6)/B6,0)" → "percent" (ratio)
 * "=B6-D6" → "currency" (subtraction of money)
 * "=C/B" → "percent" (ratio)
 */
export function inferFormulaType(formula: string): "currency" | "percent" | "number" | "text" {
  if (typeof formula !== "string") return "number";
  const upper = formula.toUpperCase();

  // Check for status-text patterns inside IF: =IF(...,"On Track",...)
  if (/IF\s*\(.*["'][A-Za-z ]+["']/.test(formula)) return "text";

  // Ratio patterns: division, "rate", percentage-like
  if (/\/[A-Z]\d/.test(upper) || /[A-Z]\d+\s*\/\s*[A-Z]\d+/.test(upper)) return "percent";
  if (/RATE|PERCENT/i.test(upper)) return "percent";
  // Pattern like (X-Y)/X → ratio
  if (/\([^)]*-[^)]*\)\s*\//.test(formula)) return "percent";

  // Sum / subtraction / addition patterns → currency
  if (/SUM|SUMIF|SUMIFS|SUMPRODUCT/.test(upper)) return "currency";
  if (/[A-Z]\d+\s*[-+]\s*[A-Z]\d+/.test(upper) && !/\//.test(upper)) return "currency";

  return "number";
}

// ── Core Sanitizer ───────────────────────────────────────────

/**
 * Core sanitizer: takes any cell value and returns a clean display string.
 * - Formulas (starting with "=") → replaced with appropriate fallback
 * - Numbers → formatted with currency/percent as appropriate
 * - null/undefined → ""
 * - Very long strings → truncated with "..."
 * - Strings containing formula-like patterns (e.g. "=B2-C2=B3") → cleaned up
 */
export function safeDisplayValue(
  value: unknown,
  options?: {
    type?: "currency" | "percent" | "number" | "text" | "auto";
    fallback?: string;
    maxLength?: number;
  },
): string {
  const { type = "auto", fallback = "—", maxLength = 50 } = options ?? {};

  // Null / undefined
  if (value == null) return "";

  // Boolean
  if (typeof value === "boolean") return value ? "Yes" : "No";

  // Number
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return fallback;
    if (type === "currency") return formatCurrency(value);
    if (type === "percent") return formatPercent(value);
    // Auto-detect: small decimals (0 < |x| < 2) are likely percents/ratios
    if (type === "auto" && Math.abs(value) > 0 && Math.abs(value) < 2 && !Number.isInteger(value)) {
      return formatPercent(value);
    }
    // Format with commas for large numbers
    return value.toLocaleString("en-US");
  }

  // String handling
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return "";

    // Pure formula
    if (trimmed.startsWith("=")) {
      if (type === "auto") {
        const inferred = inferFormulaType(trimmed);
        if (inferred === "currency") return fallback === "—" ? "$0" : fallback;
        if (inferred === "percent") return fallback === "—" ? "0%" : fallback;
        if (inferred === "text") return fallback === "—" ? "" : fallback;
      }
      return fallback;
    }

    // Formula contamination: strings like "$0=B2-C2=B3-C3=B4-C4"
    if (FORMULA_CONTAMINATION_RE.test(trimmed)) {
      // Try to extract a leading meaningful part before the contamination
      const leadPart = trimmed.split(/=[A-Z]\d/)[0].trim();
      if (leadPart && leadPart.length > 0 && leadPart !== "$0") {
        return truncate(leadPart, maxLength);
      }
      return fallback;
    }

    return truncate(trimmed, maxLength);
  }

  // Fallback for objects/arrays
  return fallback;
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

// ── KPI Value Formatting ─────────────────────────────────────

/**
 * Format a KPI value smartly based on label context.
 * If label contains "rate", "percent", "%" → format as percent
 * If label contains "income", "spent", "savings", "budget", "cost", "revenue", "profit" → format as currency
 * Otherwise → format as number or text
 */
export function formatKpiValue(value: unknown, label: string): string {
  const lbl = (label ?? "").toLowerCase();

  const isPercent =
    lbl.includes("rate") || lbl.includes("percent") || lbl.includes("%");
  const isCurrency =
    lbl.includes("income") ||
    lbl.includes("spent") ||
    lbl.includes("savings") ||
    lbl.includes("budget") ||
    lbl.includes("cost") ||
    lbl.includes("revenue") ||
    lbl.includes("profit") ||
    lbl.includes("expense") ||
    lbl.includes("remaining") ||
    lbl.includes("left") ||
    lbl.includes("balance") ||
    lbl.includes("total");

  const type = isPercent ? "percent" : isCurrency ? "currency" : "auto";

  return safeDisplayValue(value, { type, fallback: isPercent ? "0%" : isCurrency ? "$0" : "—" });
}

// ── Progress Value Formatting ────────────────────────────────

/**
 * Format a progress/savings value: handles formulas, numbers, and text.
 * Input: could be number (2500), formula ("=B2-C2"), or text ("$2,500")
 * Output: clean display string like "$2,500" or "50%"
 */
export function formatProgressValue(value: unknown, isPercent?: boolean): string {
  if (value == null) return isPercent ? "0%" : "$0";

  if (typeof value === "number") {
    return isPercent ? formatPercent(value) : formatCurrency(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    // Formula → fallback
    if (isFormula(trimmed)) {
      return isPercent ? "0%" : "$0";
    }

    // Formula contamination
    if (FORMULA_CONTAMINATION_RE.test(trimmed)) {
      return isPercent ? "0%" : "$0";
    }

    // Already a display string like "$2,500" or "50%"
    if (trimmed.startsWith("$") || trimmed.endsWith("%")) {
      return trimmed;
    }

    // Try to parse as number
    const num = Number(trimmed.replace(/[,$%]/g, ""));
    if (Number.isFinite(num)) {
      return isPercent ? formatPercent(num) : formatCurrency(num);
    }

    return trimmed || (isPercent ? "0%" : "$0");
  }

  return isPercent ? "0%" : "$0";
}

// ── SVG Text Cleaning ────────────────────────────────────────

/**
 * Clean and truncate text for SVG rendering.
 * - Strip emojis (sharp can't render them)
 * - Truncate to maxChars with "..."
 * - Remove formula-like patterns
 * - Collapse whitespace
 */
export function cleanDisplayText(text: string, maxChars = 40): string {
  if (typeof text !== "string" || text.trim() === "") return "";

  let cleaned = text;

  // Strip emojis
  cleaned = cleaned.replace(EMOJI_RE, "");

  // Remove formula-like patterns
  cleaned = cleaned.replace(/=[A-Z]+\d*[-+*/][A-Z]*\d*/g, "");
  cleaned = cleaned.replace(/^=.*$/, "");

  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // Truncate
  if (cleaned.length > maxChars) {
    cleaned = cleaned.slice(0, maxChars - 3) + "...";
  }

  return cleaned;
}

// ── KPI Extraction ───────────────────────────────────────────

/** Patterns that identify a row as containing KPI labels (financial metrics) */
const KPI_LABEL_PATTERNS = [
  /total\s*income/i,
  /total\s*spent/i,
  /net\s*savings/i,
  /savings?\s*rate/i,
  /total\s*revenue/i,
  /total\s*expense/i,
  /net\s*profit/i,
  /profit\s*margin/i,
  /gross\s*margin/i,
  /total\s*budget/i,
  /remaining/i,
  /revenue/i,
];

/** Check if a row contains KPI-like labels (financial metric terms) */
function isKpiLabelRow(row: Array<string | number | null>): boolean {
  if (!row) return false;
  const textCells = row.filter(
    (c) => c != null && typeof c === "string" && !isFormula(c) && c.trim() !== "",
  ) as string[];
  if (textCells.length < 2) return false;
  // At least 2 cells should match known KPI label patterns
  let matches = 0;
  for (const cell of textCells) {
    if (KPI_LABEL_PATTERNS.some((p) => p.test(cell))) matches++;
  }
  return matches >= 2;
}

const DEFAULT_KPI_LABELS = ["Total Income", "Total Spent", "Net Savings", "Savings Rate"];
const DEFAULT_KPI_VALUES = ["$4,500", "$3,360", "$1,140", "25%"];

/**
 * Extract the monthly income value from dashboard Row 1.
 * Looks for a pattern like: ["📅 SELECT MONTH", "January", ..., "💰 MONTHLY INCOME", null, 5500]
 */
function extractIncomeFromDashboard(sampleRows: Array<Array<string | number | null>>): number {
  for (let r = 0; r < Math.min(5, sampleRows.length); r++) {
    const row = sampleRows[r];
    if (!row) continue;
    // Find the last numeric value in the row — it's typically the income amount
    for (let c = row.length - 1; c >= 0; c--) {
      if (typeof row[c] === "number" && (row[c] as number) > 100) return row[c] as number;
    }
  }
  return 0;
}

/**
 * Derive realistic KPI values from transaction rows.
 * Transactions have: [date, description, amount, subCat, category, bucket, month]
 */
export function deriveKpiFromTransactions(
  transactionRows: Array<Array<string | number | null>>,
  incomeHint?: number,
): { income: number; spent: number; net: number; rate: number } {
  let income = 0;
  let spent = 0;
  for (const row of transactionRows) {
    if (!row || row.length < 5) continue;
    const amount = typeof row[2] === "number" ? row[2] : 0;
    const category = String(row[4] ?? "").toLowerCase();
    if (category === "income" || category.includes("income")) {
      income += amount;
    } else {
      spent += amount;
    }
  }
  // Use hint if transactions didn't have income
  if (income === 0 && incomeHint) income = incomeHint;
  const net = income - spent;
  const rate = income > 0 ? net / income : 0;
  return { income, spent, net, rate };
}

/** Build KPI fallback values from transaction-derived data */
function buildKpiFallbacksFromData(data: { income: number; spent: number; net: number; rate: number }): string[] {
  return [
    formatCurrency(data.income),
    formatCurrency(data.spent),
    formatCurrency(data.net),
    formatPercent(data.rate),
  ];
}

/**
 * Extract clean KPI data from a dashboard tab's sampleRows.
 * Returns 4 KPI items with clean labels and values, NEVER formulas.
 *
 * Strategy:
 * 1. Find the KPI label row by matching financial term patterns (INCOME, SPENT, etc.)
 *    — NOT just "first row with mostly text" which mismatches SELECT MONTH rows
 * 2. Value row is always labelRow + 1 (contains formulas in real blueprints)
 * 3. For formula values, derive realistic numbers from transaction data or income hint
 * 4. Return fallback KPIs if extraction fails
 */
export function extractKpiData(
  sampleRows: Array<Array<string | number | null>>,
  fallbackLabels?: string[],
  fallbackValues?: string[],
  /** Optional: transaction sampleRows to derive realistic values */
  transactionRows?: Array<Array<string | number | null>>,
): Array<{ label: string; value: string }> {
  const fbLabels = fallbackLabels ?? DEFAULT_KPI_LABELS;

  // Derive realistic values from transactions if available
  const incomeHint = sampleRows ? extractIncomeFromDashboard(sampleRows) : 0;
  const derived = transactionRows
    ? deriveKpiFromTransactions(transactionRows, incomeHint)
    : incomeHint > 0
      ? { income: incomeHint, spent: Math.round(incomeHint * 0.75), net: Math.round(incomeHint * 0.25), rate: 0.25 }
      : null;
  const fbValues = derived ? buildKpiFallbacksFromData(derived) : (fallbackValues ?? DEFAULT_KPI_VALUES);

  if (!sampleRows || sampleRows.length < 2) {
    return fbLabels.slice(0, 4).map((label, i) => ({
      label,
      value: fbValues[i] ?? "—",
    }));
  }

  // Find the KPI label row: row containing financial terms like "TOTAL INCOME", "TOTAL SPENT"
  let labelRowIdx = -1;
  for (let r = 0; r < sampleRows.length - 1; r++) {
    if (isKpiLabelRow(sampleRows[r])) {
      labelRowIdx = r;
      break;
    }
  }

  if (labelRowIdx < 0 || labelRowIdx + 1 >= sampleRows.length) {
    return fbLabels.slice(0, 4).map((label, i) => ({
      label,
      value: fbValues[i] ?? "—",
    }));
  }

  const labelRow = sampleRows[labelRowIdx];
  const valueRow = sampleRows[labelRowIdx + 1];
  const kpis: Array<{ label: string; value: string }> = [];

  // Map label text to derived value for smart fallback
  // Order matters: check compound terms (savings rate) before single terms (savings)
  const labelFallbacks: Array<{ pattern: RegExp; value: string }> = [];
  if (derived) {
    // Compound terms first (more specific)
    labelFallbacks.push({ pattern: /savings?\s*rate|percent|margin/i, value: formatPercent(derived.rate) });
    labelFallbacks.push({ pattern: /profit\s*margin/i, value: formatPercent(derived.rate) });
    labelFallbacks.push({ pattern: /net\s*(savings|profit|income)/i, value: formatCurrency(derived.net) });
    labelFallbacks.push({ pattern: /total\s*income|total\s*revenue/i, value: formatCurrency(derived.income) });
    labelFallbacks.push({ pattern: /total\s*spent|total\s*expense/i, value: formatCurrency(derived.spent) });
    // Single terms (less specific)
    labelFallbacks.push({ pattern: /\brate\b|\bpercent\b|\bmargin\b/i, value: formatPercent(derived.rate) });
    labelFallbacks.push({ pattern: /\bincome\b|\brevenue\b/i, value: formatCurrency(derived.income) });
    labelFallbacks.push({ pattern: /\bspent\b|\bexpense\b|\bcost\b/i, value: formatCurrency(derived.spent) });
    labelFallbacks.push({ pattern: /\bsavings?\b|\bnet\b|\bprofit\b|\bremaining\b|\bbalance\b/i, value: formatCurrency(derived.net) });
  }

  function smartFallbackForLabel(label: string): string {
    for (const { pattern, value } of labelFallbacks) {
      if (pattern.test(label)) return value;
    }
    // Generic fallback from fbValues by position
    return fbValues[kpis.length] ?? "$0";
  }

  for (let c = 0; c < labelRow.length && kpis.length < 4; c++) {
    const rawLabel = labelRow[c];
    if (rawLabel == null || typeof rawLabel !== "string" || rawLabel.trim() === "") continue;
    if (isFormula(rawLabel)) continue;

    const label = cleanDisplayText(rawLabel, 30);
    if (!label) continue;

    const rawValue = valueRow?.[c] ?? null;

    let value: string;
    if (rawValue == null) {
      value = smartFallbackForLabel(label);
    } else if (typeof rawValue === "number") {
      value = formatKpiValue(rawValue, label);
    } else if (typeof rawValue === "string" && isFormula(rawValue)) {
      value = smartFallbackForLabel(label);
    } else {
      value = safeDisplayValue(rawValue, { type: "auto" });
      if (value === "—" || value === "") value = smartFallbackForLabel(label);
    }

    // Never allow "—" or empty for KPI values
    if (!value || value === "—" || value === "") {
      value = smartFallbackForLabel(label);
    }

    kpis.push({ label, value });
  }

  // Pad to 4 items if we found fewer
  while (kpis.length < 4) {
    const idx = kpis.length;
    kpis.push({
      label: fbLabels[idx] ?? `Metric ${idx + 1}`,
      value: fbValues[idx] ?? "$0",
    });
  }

  return kpis.slice(0, 4);
}

// ── Savings Goals Extraction ─────────────────────────────────

const HEADER_PATTERNS = /^(goal|name|category|item|description)$/i;

/**
 * Extract clean savings goals from a savings/goals tab's sampleRows.
 * Returns goals with clean names, targets, saved amounts, and percentages.
 * NEVER returns formula strings in any field.
 */
export function extractSavingsGoals(
  sampleRows: Array<Array<string | number | null>>,
): Array<{ name: string; target: number; saved: number; pct: number }> {
  if (!sampleRows || sampleRows.length === 0) return [];

  const goals: Array<{ name: string; target: number; saved: number; pct: number }> = [];

  for (const row of sampleRows) {
    if (!row || row.length < 2) continue;

    // Skip header rows
    const firstCell = row[0];
    if (firstCell == null) continue;
    const firstStr = String(firstCell).trim();
    if (HEADER_PATTERNS.test(firstStr)) continue;
    if (isFormula(firstStr)) continue;
    if (firstStr === "") continue;

    const name = cleanDisplayText(firstStr, 30);
    if (!name) continue;

    const target = safeNumber(row[1]);
    const saved = safeNumber(row[2]);
    const pct = target > 0 ? Math.round((saved / target) * 100) : 0;

    goals.push({ name, target, saved, pct });
  }

  return goals;
}

function safeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    if (isFormula(value)) return 0;
    const cleaned = value.replace(/[$,%\s]/g, "");
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
}

// ── Table Row Extraction ─────────────────────────────────────

/**
 * Extract clean data rows from dashboard tab for table rendering.
 * Returns clean string arrays, with formulas replaced by display values.
 *
 * @param colOffset - Column offset to start reading from (default 0).
 *   Useful for dashboards with side-by-side layout where budget data
 *   is in cols 5-9 (right side) while savings goals are in cols 0-4 (left side).
 * @param numCols - Number of columns to read (default: all from offset).
 */
export function extractTableRows(
  sampleRows: Array<Array<string | number | null>>,
  startRow: number,
  maxRows: number,
  columnTypes?: Array<"text" | "currency" | "percent" | "number" | "auto">,
  colOffset = 0,
  numCols?: number,
): Array<{ cols: string[] }> {
  if (!sampleRows || sampleRows.length === 0) return [];

  const result: Array<{ cols: string[] }> = [];
  const end = Math.min(startRow + maxRows, sampleRows.length);

  for (let r = startRow; r < end; r++) {
    const row = sampleRows[r];
    if (!row) continue;

    // Skip TOTAL rows (check the first cell in our range)
    const firstCell = row[colOffset];
    if (typeof firstCell === "string" && /^TOTAL/i.test(firstCell.trim())) continue;

    const cols: string[] = [];
    const endCol = numCols ? colOffset + numCols : row.length;
    for (let c = colOffset; c < Math.min(endCol, row.length); c++) {
      const cell = row[c];
      const typeIdx = c - colOffset;
      const colType = columnTypes?.[typeIdx] ?? "auto";

      if (cell == null) {
        cols.push("");
        continue;
      }

      if (typeof cell === "string" && isFormula(cell)) {
        // Status formulas: =IF(...,"On Track","Over Budget")
        if (colType === "auto" || colType === "text") {
          const statusMatch = cell.match(/["'][^"']*?(On Track|Over|Under|Complete|Pending|Active|Done|Good|Warning|Alert|Behind|Ahead)[^"']*/i);
          if (statusMatch) {
            cols.push(statusMatch[1]);
            continue;
          }
        }
        // Reference formulas like "='Budget Setup'!B5" → use colType fallback
        // Type-based formula fallback
        if (colType === "currency") {
          cols.push("$0");
        } else if (colType === "percent") {
          cols.push("0%");
        } else {
          const inferred = inferFormulaType(cell);
          cols.push(inferred === "currency" ? "$0" : inferred === "percent" ? "0%" : "—");
        }
        continue;
      }

      // For auto-typed columns: if value is a small decimal, format as percentage
      if (colType === "auto" && typeof cell === "number" && cell > 0 && cell < 2 && !Number.isInteger(cell)) {
        cols.push(formatPercent(cell));
        continue;
      }

      cols.push(safeDisplayValue(cell, { type: colType }));
    }

    // Skip rows where all values after col[0] are "$0" or empty
    const valuesAfterFirst = cols.slice(1);
    const allZero = valuesAfterFirst.length > 0 && valuesAfterFirst.every(
      (v) => v === "$0" || v === "$0.00" || v === "0" || v === "0%" || v === "" || v === "—"
    );
    if (allZero) continue;

    // Skip rows where first col is empty
    if (!cols[0] || cols[0].trim() === "") continue;

    result.push({ cols });
  }

  return result;
}

// ── Budget Category Extraction ───────────────────────────────

/**
 * Extract clean budget categories from budget setup tab.
 * Returns category names and amounts as display strings.
 *
 * If budgetSetup tab has 0 rows (common), falls back to:
 * 1. Dashboard "WHERE YOUR MONEY WENT" section (cols 5-9, rows 8+)
 * 2. Transaction data grouped by bucket
 */
export function extractBudgetCategories(
  sampleRows: Array<Array<string | number | null>>,
  maxCategories = 10,
): Array<{ name: string; amount: string }> {
  if (!sampleRows || sampleRows.length === 0) return [];

  const categories: Array<{ name: string; amount: string }> = [];

  for (const row of sampleRows) {
    if (categories.length >= maxCategories) break;
    if (!row || row.length < 2) continue;

    const rawName = row[0];
    if (rawName == null) continue;
    const nameStr = String(rawName).trim();
    if (nameStr === "" || isFormula(nameStr)) continue;
    // Skip header-like and total rows
    if (/^(category|name|item|description|type|label|bucket|total)$/i.test(nameStr)) continue;

    const name = cleanDisplayText(nameStr, 30);
    if (!name) continue;

    const rawAmount = row[1];
    let amount: string;
    if (typeof rawAmount === "number") {
      // If < 100, it's likely a percentage allocation; if >= 100, it's a dollar amount
      if (rawAmount > 0 && rawAmount < 100) {
        amount = `${Math.round(rawAmount)}%`;
      } else {
        amount = formatCurrency(rawAmount);
      }
    } else if (typeof rawAmount === "string" && isFormula(rawAmount)) {
      amount = "$0";
    } else {
      amount = safeDisplayValue(rawAmount, { type: "currency" });
    }

    categories.push({ name, amount });
  }

  return categories;
}

/**
 * Extract budget categories from the dashboard's right-side panel (cols 5-9).
 * Dashboard layout: cols 0-4 = Savings Goals, cols 5-9 = "WHERE YOUR MONEY WENT"
 * Row 7 = headers: [Goal, Target, Saved, Remaining, Progress, Category, Budgeted, Spent, Left, Status]
 * Row 8+: data rows with category names in col 5 and formulas in cols 6-9
 */
export function extractBudgetFromDashboard(
  dashboardRows: Array<Array<string | number | null>>,
  maxCategories = 6,
): Array<{ name: string; amount: string }> {
  if (!dashboardRows || dashboardRows.length < 9) return [];

  const categories: Array<{ name: string; amount: string }> = [];

  // Start after header row (row 7 is header, row 8+ is data)
  for (let r = 8; r < dashboardRows.length && categories.length < maxCategories; r++) {
    const row = dashboardRows[r];
    if (!row || row.length < 7) continue;

    const rawName = row[5]; // Column 5 = Category name
    if (rawName == null) continue;
    const nameStr = String(rawName).trim();
    if (nameStr === "" || isFormula(nameStr)) continue;
    if (/^(category|total|bucket)$/i.test(nameStr)) continue;

    const name = cleanDisplayText(nameStr, 30);
    if (!name) continue;

    // Skip duplicates
    if (categories.some((c) => c.name === name)) continue;

    // Budgeted amount is in col 6 — usually a formula like "='Budget Setup'!B5"
    // We can't resolve it, so we'll mark it as "$0" (will be replaced by transaction-derived)
    categories.push({ name, amount: "$0" });
  }

  return categories;
}

/**
 * Derive budget categories with real amounts from transaction data.
 * Groups transactions by Bucket field and sums amounts.
 * Transaction rows: [date, description, amount, subCat, category, bucket, month]
 */
export function deriveBudgetFromTransactions(
  transactionRows: Array<Array<string | number | null>>,
  maxCategories = 6,
): Array<{ name: string; amount: string }> {
  if (!transactionRows || transactionRows.length === 0) return [];

  const bucketTotals = new Map<string, number>();

  for (const row of transactionRows) {
    if (!row || row.length < 6) continue;
    const amount = typeof row[2] === "number" ? row[2] : 0;
    const category = String(row[4] ?? "").trim();
    const bucket = String(row[5] ?? "").trim();

    // Skip income
    if (category.toLowerCase() === "income" || bucket.toLowerCase() === "income") continue;
    if (!bucket || amount <= 0) continue;

    bucketTotals.set(bucket, (bucketTotals.get(bucket) || 0) + amount);
  }

  // Sort by amount descending
  const sorted = Array.from(bucketTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCategories);

  return sorted.map(([name, total]) => ({
    name: cleanDisplayText(name, 30),
    amount: formatCurrency(Math.round(total)),
  }));
}
