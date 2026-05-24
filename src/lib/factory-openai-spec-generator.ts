// ══════════════════════════════════════════════════════════════
// OpenAI-driven SpreadsheetSpec Generator
//
// This is the BRAIN of the new build engine. It takes a niche
// + competitor context + (optional) deep-scan manifest, and
// returns a complete `SpreadsheetSpec` ready to render to xlsx.
//
// Replaces the hardcoded tab-builder pattern in
// `factory-spreadsheet-builder.ts` for the Excel/Sheets path.
//
// Why OpenAI (gpt-5-mini): structured JSON output with Outputs
// guarantees parseable JSON, and the model is strong at producing
// large coherent design specs (32+ cells per tab, cross-tab
// formulas, conditional formatting, charts).
// ══════════════════════════════════════════════════════════════

import { callOpenAISpec, OpenAISpecError } from "./openai-spec";
import type { SpreadsheetSpec, TabSpec, CellSpec } from "./factory-spreadsheet-spec";
import type { CompetitorFeatures } from "./factory-competitor-scan";
import {
  extractCompetitorTabHints,
  resolveSpreadsheetFamily,
  type SpreadsheetFamilyProfile,
} from "./factory-spreadsheet-families";

export interface SpecGeneratorInput {
  /** Canonical niche (e.g. "paycheck-budget", "couples-budget", "wedding-planner"). */
  niche: string;
  /** Niche label shown to the buyer (e.g. "Paycheck Budget", "Couples Budget"). */
  nicheLabel: string;
  /** Project name used for workbook metadata. */
  projectName: string;

  // Competitor context — what we are cloning + beating
  competitorTitle?: string;
  competitorDescription?: string;
  competitorTags?: string[];
  competitorPrice?: number;
  /** Deep-scan manifest from Gemini Vision (when /research provided photos). */
  competitorFeatures?: CompetitorFeatures;

  /** Optional positioning angle from upstream Gemini concept generator. */
  positioning?: string;

  /** Brand palette hint (hex codes). If omitted, OpenAI picks one. */
  palette?: string[];

  /** Family blueprint selected by the build route. Inferred when omitted. */
  familyProfile?: SpreadsheetFamilyProfile;
}

export interface GenerateSpecResult {
  spec: SpreadsheetSpec;
  modelUsed: string;
  /** Tokens used (when API returns them). */
  usage?: { input?: number; output?: number };
  /** Generation time in ms. */
  elapsedMs: number;
}

// ─── Public API ──────────────────────────────────────────────

export async function generateSpreadsheetSpec(
  input: SpecGeneratorInput,
): Promise<GenerateSpecResult> {
  const start = Date.now();
  // gpt-4.1 = strongest available for large structured JSON output.
  // Override via OPENAI_SPEC_MODEL if you want to test gpt-4o (faster, slightly less rich).
  const model = process.env.OPENAI_SPEC_MODEL || "gpt-4.1";
  const familyProfile = input.familyProfile ?? resolveSpreadsheetFamily(input);

  const system = buildSystemPrompt();
  const user = buildUserPrompt(input, familyProfile);

  let raw: Record<string, unknown>;
  try {
    raw = await callOpenAISpec<Record<string, unknown>>(user, {
      model,
      system,
      temperature: 0.3,
      // 32K — large enough for a dense 14-tab workbook with 50+ cells per tab.
      // gpt-4.1 max_completion_tokens is 32768; this stays just under.
      maxTokens: 32000,
    });
  } catch (err) {
    if (err instanceof OpenAISpecError) {
      throw new Error(
        `[SpecGen] OpenAI failed (${err.status}): ${err.message}`,
      );
    }
    throw err;
  }

  const spec = validateAndNormalize(raw, input, familyProfile);
  return {
    spec,
    modelUsed: model,
    elapsedMs: Date.now() - start,
  };
}

// ─── Prompts ─────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are an elite spreadsheet template designer for premium Etsy digital products.

Your job: produce a complete SpreadsheetSpec JSON that describes every meaningful tab, cell, formula, color, data validation, conditional format, and chart of a workbook that will be rendered to .xlsx and sold on Etsy.

DESIGN PRINCIPLES (non-negotiable):
1. ETSY BESTSELLER AESTHETIC - polished first-screen dashboards, cream/ivory/light neutral bases, black or charcoal divider bars, warm accent panels, status badges, serif hero titles, dense workbook previews, and clear "Excel + Google Sheets" credibility.
2. FAMILY FIT - a wedding planner, inventory tracker, teacher gradebook, real estate calculator, and budget planner need different tabs, formulas, KPIs, and signature features. Follow the family blueprint in the user prompt.
3. FEATURE DENSITY - never create vanity tabs that only contain a title and one header row. Every user-facing tracker tab needs a real table, sample rows or formula-ready rows, dropdowns where useful, status logic, and enough styled cells to look complete.
4. DESIGN HIERARCHY - every tab has a hero band, short subtitle, section bands, KPI/status cards where useful, then dense data tables with compact professional spacing.
5. FORMULAS, NOT HARDCODED - every dashboard/calc/summary total pulls from input tabs via SUMIFS / COUNTIFS / INDEX / MATCH / IFERROR / SUMPRODUCT / TEXT. Never write literal totals where a buyer expects live calculations.
6. CROSS-TAB CONSISTENCY - define named ranges on Settings/control tabs and reference them from validations and formulas.
7. GOOGLE SHEETS COMPAT - avoid LET, LAMBDA, XLOOKUP, FILTER, UNIQUE, dynamic arrays, and Excel-only functions. Use SUMIFS, COUNTIFS, SUMPRODUCT, IFERROR, INDEX, MATCH, TEXT, DATE, EOMONTH.
8. LIVE CHARTS - charts must bind to real ranges that exist in the spec. Include chart.data preview values that match the dataRange/categoryRange.
9. FAMILY-FRIENDLY ONLY - no occult, tarot, skull, eye, witchcraft, anatomical, or adult content.

SIGNATURE FEATURES:
- Include the family-specific signature tabs from the user prompt.
- Do not force finance-only tabs such as Debt Payoff or AI Money Coach into non-finance products unless the competitor manifest clearly proves buyers expect them.
- For personal finance only, Smart Calendar, Year in Review, AI Money Coach, and What-If Simulator are required.

WHEN A DEEP-SCAN MANIFEST IS PROVIDED:
- Your tabs MUST include every tab name in detectedTabs (or a clear superior equivalent).
- Your chart count MUST match or exceed the competitor's chart count.
- You MUST replicate any uniqueWidgets the competitor has, adapted to the selected product family.

OUTPUT FORMAT — return ONE JSON object matching this TypeScript shape (no prose, no markdown):

{
  "workbook": {
    "title": string,
    "paletteHex": string[],          // 4-6 hex colors (no "#")
    "fontFamily"?: string,           // default "Arial"
    "creator"?: string
  },
  "definedNames"?: { [name: string]: string },   // e.g. "IncomeTarget": "Settings!$C$10"
  "tabs": [
    {
      "name": string,                            // <=31 chars, no : \\ / ? * [ ]
      "tabColor"?: string,                       // hex
      "freeze"?: string,                         // e.g. "B6"
      "columnWidths"?: number[],                 // [3, 22, 14, ...] starting from col A
      "rowHeights"?: { [rowNum: string]: number },
      "hideGridlines"?: boolean,                 // default true (premium look)
      "cells": [
        {
          "ref": "B2",                           // A1
          "value"?: string|number|boolean,
          "formula"?: "SUMIFS(...)",             // WITHOUT leading "="
          "numberFormat"?: "\\"$\\"#,##0",
          "font"?: { "name"?: string, "size"?: number, "bold"?: boolean, "italic"?: boolean, "color"?: string },
          "fill"?: { "color": string },
          "alignment"?: { "horizontal"?: "left"|"center"|"right", "vertical"?: "top"|"middle"|"bottom", "wrapText"?: boolean, "indent"?: number },
          "border"?: { "style"?: "thin"|"medium"|"thick"|"dashed", "color"?: string }
        }
      ],
      "merges"?: ["A1:F1"],                      // A1 ranges
      "charts"?: [
        {
          "type": "bar"|"column"|"line"|"pie"|"doughnut"|"area",
          "title"?: string,
          "dataRange": "Dashboard!C18:D29",
          "categoryRange"?: "Dashboard!B18:B29",
          "anchor": { "row": 33, "col": 2 },
          "size"?: { "width": 480, "height": 320 },
          "seriesColors"?: string[],
          "legend"?: "b"|"t"|"r"|"l"|"none",
          "data": {
            "categories": string[],
            "series": [{ "name": string, "values": number[] }]
          }
        }
      ],
      "conditionalFormats"?: [
        {
          "range": "F18:F35",
          "rule": { "kind": "cellIs", "operator": "greaterThan", "values": [1], "fill": "F5C8C8", "fontColor": "8B3232", "bold": true }
            // OR { "kind": "colorScale", "minColor": "DDF0DD", "midColor": "F5E5C8", "maxColor": "F5C8C8" }
            // OR { "kind": "dataBar", "color": "9AAE94" }
            // OR { "kind": "formula", "formula": "$E6=\\"Cancel\\"", "fill": "F5C8C8" }
        }
      ],
      "dataValidations"?: [
        { "range": "D6:D205", "type": "list", "options": ["Income","Expense","Saving"] }
        // OR { "range": "D6:D205", "type": "list", "options": { "ref": "=CategoryList" } }
      ]
    }
  ]
}

HARD MINIMUMS (you will be judged on these — under-delivering means a buyer refund):
- TAB COUNT: obey the family blueprint target. Add monthly/weekly tabs only when they make sense for that family.
- CELL DENSITY: every substantial tab must have AT LEAST 30 populated/styled cells. Dashboards, calendars, command centers, and simulators should usually have 80-180 cells. Sparse tabs feel like a refund.
- LARGE WORKBOOK TIERING: when matching a competitor with 24+ declared tabs, make the 8-12 core tabs dense (60-160 cells each) and secondary planner tabs compact but complete (20-45 cells each). Do not spend the whole JSON budget on one dashboard.
- COLUMN WIDTHS: every tab MUST set columnWidths (e.g. [3, 22, 14, 14, 14, 14] — col A is always 3 as margin). Without this, the file looks broken when opened.
- ROW HEIGHTS: hero band rows = 40-60pt. Section header rows = 26-32pt. KPI value rows = 24-30pt. Data rows = 16-18pt.
- CHARTS: meet the family chart minimum. The main Dashboard must have at least one live chart.
- CONDITIONAL FORMATTING: use data bars, color scales, and status alerts across operational columns.
- DATA VALIDATIONS: create dropdowns for the family entities (status, category, account, vendor, client, student, platform, property, etc.).
- DEFINED NAMES: create named ranges for settings lists and core assumptions.
- MERGES: hero band cells must be merged across the full content width.

EXAMPLE — here is ONE well-designed tab to anchor your style. Copy this pattern for every tab:

{
  "name": "Annual Dashboard",
  "tabColor": "5C7558",
  "freeze": "B6",
  "hideGridlines": true,
  "columnWidths": [3, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11],
  "rowHeights": { "2": 8, "3": 56, "4": 22, "5": 12, "6": 14, "7": 14, "13": 16 },
  "cells": [
    { "ref": "B3", "value": "Annual Dashboard", "font": { "name": "Georgia", "size": 32, "bold": true, "color": "FFFFFF" }, "fill": { "color": "5C7558" }, "alignment": { "horizontal": "left", "vertical": "middle", "indent": 1 } },
    { "ref": "B4", "value": "Year overview · auto-updates from Transactions", "font": { "name": "Georgia", "size": 11, "italic": true, "color": "C9D4C5" }, "fill": { "color": "5C7558" }, "alignment": { "horizontal": "left", "vertical": "middle", "indent": 1 } },

    { "ref": "B7", "value": "ANNUAL INCOME", "font": { "name": "Arial", "size": 8, "bold": true, "color": "FFFFFF" }, "fill": { "color": "9AAE94" }, "alignment": { "horizontal": "center", "vertical": "bottom" } },
    { "ref": "B8", "formula": "SUMIFS(Transactions!G6:G205,Transactions!I6:I205,Settings!C6,Transactions!C6:C205,\\"Income\\")", "numberFormat": "\\"$\\"#,##0", "font": { "name": "Georgia", "size": 26, "bold": true, "color": "FFFFFF" }, "fill": { "color": "9AAE94" }, "alignment": { "horizontal": "center", "vertical": "middle" } },
    { "ref": "B12", "value": "vs $72,000 target", "font": { "name": "Arial", "size": 8, "italic": true, "color": "DDDDDD" }, "fill": { "color": "9AAE94" }, "alignment": { "horizontal": "center", "vertical": "top" } },

    { "ref": "G7", "value": "ANNUAL EXPENSES", "font": { "name": "Arial", "size": 8, "bold": true, "color": "8B3232" }, "fill": { "color": "E5BAA8" }, "alignment": { "horizontal": "center", "vertical": "bottom" } },
    { "ref": "G8", "formula": "-SUMIFS(Transactions!G6:G205,Transactions!I6:I205,Settings!C6,Transactions!C6:C205,\\"Expense\\")", "numberFormat": "\\"$\\"#,##0", "font": { "name": "Georgia", "size": 26, "bold": true, "color": "8B3232" }, "fill": { "color": "E5BAA8" }, "alignment": { "horizontal": "center", "vertical": "middle" } },

    { "ref": "B16", "value": "MONTH OVER MONTH · Income vs Expenses", "font": { "name": "Georgia", "size": 14, "bold": true, "color": "5C7558" }, "fill": { "color": "D4DDC8" }, "alignment": { "horizontal": "left", "vertical": "middle", "indent": 1 } },
    { "ref": "B18", "value": "Month", "font": { "name": "Arial", "size": 10, "bold": true, "color": "FFFFFF" }, "fill": { "color": "9AAE94" }, "alignment": { "horizontal": "center" }, "border": { "style": "thin", "color": "C9C0AB" } },
    { "ref": "C18", "value": "Income", "font": { "name": "Arial", "size": 10, "bold": true, "color": "FFFFFF" }, "fill": { "color": "9AAE94" }, "alignment": { "horizontal": "center" }, "border": { "style": "thin", "color": "C9C0AB" } },
    { "ref": "D18", "value": "Expenses", "font": { "name": "Arial", "size": 10, "bold": true, "color": "FFFFFF" }, "fill": { "color": "9AAE94" }, "alignment": { "horizontal": "center" }, "border": { "style": "thin", "color": "C9C0AB" } },
    { "ref": "B19", "value": "January", "font": { "name": "Arial", "size": 10 }, "alignment": { "horizontal": "left", "indent": 1 }, "border": { "style": "thin", "color": "C9C0AB" } },
    { "ref": "C19", "formula": "SUMIFS(Transactions!G6:G205,Transactions!I6:I205,Settings!C6,Transactions!H6:H205,1,Transactions!C6:C205,\\"Income\\")", "numberFormat": "\\"$\\"#,##0", "border": { "style": "thin", "color": "C9C0AB" }, "alignment": { "horizontal": "right" } }
  ],
  "merges": ["B3:U3", "B4:U4", "B7:F7", "B8:F11", "B12:F12", "G7:K7", "G8:K11", "B16:U16"],
  "charts": [
    {
      "type": "column",
      "title": "Income vs Expenses",
      "dataRange": "Annual Dashboard!C18:D30",
      "categoryRange": "Annual Dashboard!B19:B30",
      "anchor": { "row": 33, "col": 2 },
      "size": { "width": 540, "height": 280 },
      "legend": "b",
      "seriesColors": ["9AAE94", "E5BAA8"],
      "data": {
        "categories": ["January", "February", "March"],
        "series": [
          { "name": "Income", "values": [5200, 5100, 5350] },
          { "name": "Expenses", "values": [4100, 3900, 4200] }
        ]
      }
    }
  ],
  "conditionalFormats": [
    { "range": "C19:D30", "rule": { "kind": "dataBar", "color": "9AAE94" } }
  ]
}

Note how the example:
- Sets EVERY column's width
- Hero band fills 22 columns (B:U) via merge
- KPI card spans 5 cols × 5 rows via two merges (label row + value+caption rows)
- Uses formulas, never literal totals
- Uses cross-tab refs (Transactions!, Settings!)
- Sets row heights to make hero band tall (56pt) and data rows compact (16pt)
- Always sets font + fill + alignment together
- Bordered table cells use a soft grey "C9C0AB"

Apply this density and discipline to every family, while changing domain labels, entities, formulas, and charts to fit the product.

ABSOLUTELY DO NOT:
- Add a "Sheet1" or default-named tab.
- Use Excel's default blue/green palette.
- Hardcode totals — use formulas.
- Leave any tab without a hero band.
- Pad the tab count with empty monthly tabs, header-only tabs, or placeholder pages.
- Reuse budget tabs for non-budget products.
- Skip required family signature tabs.
- Omit columnWidths (the file will look broken).`;
}

function buildUserPrompt(
  input: SpecGeneratorInput,
  familyProfile: SpreadsheetFamilyProfile,
): string {
  const f = input.competitorFeatures;
  const competitorTabHints = extractCompetitorTabHints(input);
  const manifest = f && f.confidence > 0
    ? `
DEEP-SCAN MANIFEST (from competitor's listing photos, ${(f.confidence * 100).toFixed(0)}% confidence):
- Tabs spotted: ${f.detectedTabs.slice(0, 30).join(", ") || "—"}
- Declared tab count: ${f.tabCount}
- Chart types: ${f.chartTypes.join(", ") || "—"}
- Has calendar widget: ${f.hasCalendarWidget}
- Unique widgets: ${f.uniqueWidgets.join(", ") || "—"}
- Automations: ${f.automations.join(", ") || "—"}
- Declared selling points: ${f.declaredFeatures.slice(0, 10).join(" · ") || "—"}
- Color palette spotted: ${f.colorPalette.join(", ") || "—"}
- Visual style: ${f.visualStyle} / ${f.productionQuality} quality
- Dark mode available: ${f.hasDarkMode}

→ YOUR SPEC MUST MATCH OR EXCEED this competitor on every detected feature.
→ Use their colorPalette as your paletteHex base (or improve it).
→ Replicate any uniqueWidgets we can build with formulas.
	`
    : "";

  const competitorTabBlock = competitorTabHints.declaredTabCount > 0 || competitorTabHints.tabNames.length > 0
    ? `
COMPETITOR TAB FLOOR:
- Declared tab/sheet count: ${competitorTabHints.declaredTabCount || "unknown"}
- Visible/declared tabs to match or beat: ${competitorTabHints.tabNames.join(", ") || "—"}

→ If a declared count is present, your workbook must feel comparable in scope. For a full wedding planner with 29-33 declared tabs, produce 24-34 meaningful tabs and include all listed tab themes as tabs or clearly superior equivalents.
`
    : "";

  const paletteBlock = input.palette && input.palette.length > 0
    ? `\nBRAND PALETTE (use as paletteHex): ${input.palette.join(", ")}\n`
    : "";

  const competitorBlock = input.competitorTitle
    ? `
COMPETITOR:
- Title: "${input.competitorTitle}"
- Tags: ${(input.competitorTags || []).slice(0, 15).join(", ") || "—"}
- Price: $${input.competitorPrice ?? "—"}
${input.competitorDescription ? `- Description: ${input.competitorDescription.slice(0, 3500)}` : ""}
${manifest}${competitorTabBlock}`
    : "";

  const familyBlock = formatFamilyPrompt(familyProfile);

  return `Build a SpreadsheetSpec for this product.

NICHE: ${input.nicheLabel} (canonical: ${input.niche})
PROJECT NAME: ${input.projectName}
${input.positioning ? `POSITIONING: ${input.positioning}\n` : ""}${paletteBlock}${competitorBlock}
${familyBlock}

REMINDER OF CONTRACT:
- Return ONE JSON object with workbook, definedNames, tabs.
- Build to the selected family, not a generic budget workbook.
- Required family tabs and signature tabs must be present as named tabs or clear superior equivalents.
- Meet the family minimums for tabs, formulas, charts, conditional formatting, validations, and named ranges.
- Create complete tabs, not placeholder tabs: each required tracker/log tab needs headers, 12-24 sample/formula-ready rows, dropdowns where useful, and status/progress logic.
- For 24+ tab wedding/event competitors, use tiering: core command tabs are dense; secondary tabs are concise but still real tables/checklists with at least 20 populated cells.
- Every dashboard cell uses formulas; never hardcode totals.
- Use Google-Sheets-compatible functions only (no LET / LAMBDA / dynamic arrays).
- Hero band + black divider bars + section bands + KPI cards + dense table per tab.
- Premium Etsy palette (cream/taupe/black/sage/blush or the competitor's), no Excel defaults.

Return JSON only.`;
}

function formatFamilyPrompt(profile: SpreadsheetFamilyProfile): string {
  const requiredTabs = profile.requiredTabs
    .map((tab) => `- ${tab.name}: ${tab.purpose}${tab.mustHave ? " (must-have)" : ""}`)
    .join("\n");
  const signatureTabs = profile.signatureTabs
    .map((tab) => `- ${tab.name}: ${tab.purpose}${tab.mustHave ? " (must-have)" : ""}`)
    .join("\n");
  const avoidTabs = profile.avoidTabs?.length
    ? `\nDO NOT ADD THESE UNLESS COMPETITOR REQUIRES THEM: ${profile.avoidTabs.join(", ")}`
    : "";

  return `
SELECTED PRODUCT FAMILY:
- Family: ${profile.label} (${profile.id})
- Buyer: ${profile.buyer}
- Target tab count: ${profile.targetTabs}
- Visual direction: ${profile.visualDirection}
- Minimums: ${profile.minTabs}+ tabs, ${profile.minCharts}+ live charts, ${profile.minFormulas}+ formulas, ${profile.minConditionalFormats}+ conditional formats, ${profile.minDataValidations}+ dropdown validations, ${profile.minDefinedNames}+ defined names.

REQUIRED FAMILY TABS:
${requiredTabs}

SIGNATURE DIFFERENTIATOR TABS:
${signatureTabs}

CORE ENTITIES:
- ${profile.coreEntities.join("\n- ")}

KPI IDEAS:
- ${profile.kpis.join("\n- ")}

FORMULA REQUIREMENTS:
- ${profile.formulas.join("\n- ")}

CHART REQUIREMENTS:
- ${profile.charts.join("\n- ")}

DROPDOWN / VALIDATION REQUIREMENTS:
- ${profile.validations.join("\n- ")}
${avoidTabs}

QUALITY WARNING:
A workbook with many tabs but mostly empty headers is not acceptable. Every tab you include must earn its place with real buyer value.`;
}

// ─── Validation ──────────────────────────────────────────────

function validateAndNormalize(
  raw: Record<string, unknown>,
  input: SpecGeneratorInput,
  familyProfile: SpreadsheetFamilyProfile,
): SpreadsheetSpec {
  // Defensive normalization — never trust the LLM. Fill in defaults
  // for missing required pieces rather than throwing.

  const wb = (raw.workbook ?? {}) as Record<string, unknown>;
  const workbook = {
    title: (typeof wb.title === "string" ? wb.title : input.projectName) || familyProfile.label,
    paletteHex: Array.isArray(wb.paletteHex)
      ? (wb.paletteHex as unknown[])
          .filter((c): c is string => typeof c === "string" && c.length >= 3)
          .slice(0, 8)
      : ["F5EFE0", "9AAE94", "5C7558", "E5BAA8"],
    fontFamily: typeof wb.fontFamily === "string" ? wb.fontFamily : "Arial",
    creator: typeof wb.creator === "string" ? wb.creator : "Craftplan Factory",
  };

  const definedNames: Record<string, string> = {};
  if (raw.definedNames && typeof raw.definedNames === "object") {
    for (const [k, v] of Object.entries(raw.definedNames as Record<string, unknown>)) {
      if (typeof k === "string" && typeof v === "string") {
        definedNames[k] = v;
      }
    }
  }

  const tabs: TabSpec[] = [];
  if (Array.isArray(raw.tabs)) {
    for (const t of raw.tabs as unknown[]) {
      const tab = normalizeTab(t);
      if (tab) tabs.push(tab);
    }
  }

  // If the spec produced ZERO tabs, fall back to a minimal stub so the
  // renderer still emits a file. The orchestrator's quality gate
  // should catch this and not ship to the buyer.
  if (tabs.length === 0) {
    console.warn("[SpecGen] LLM returned zero tabs — emitting placeholder");
    tabs.push({
      name: "README",
      cells: [
        {
          ref: "B2",
          value: `${input.projectName} (placeholder)`,
          font: { name: "Georgia", size: 18, bold: true, color: "5C7558" },
        },
        {
          ref: "B4",
          value: "Spec generation failed — please regenerate.",
          font: { name: "Arial", size: 11, italic: true, color: "999999" },
        },
      ],
    });
  }

  return { workbook, definedNames: Object.keys(definedNames).length ? definedNames : undefined, tabs };
}

function normalizeTab(raw: unknown): TabSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;

  const name = typeof t.name === "string" && t.name.trim() ? t.name.trim() : null;
  if (!name) return null;

  const cellsRaw = Array.isArray(t.cells) ? (t.cells as unknown[]) : [];
  const cells: CellSpec[] = [];
  for (const c of cellsRaw) {
    if (!c || typeof c !== "object") continue;
    const cell = c as Record<string, unknown>;
    if (typeof cell.ref !== "string") continue;
    cells.push(cell as unknown as CellSpec);
  }

  return {
    name,
    tabColor: typeof t.tabColor === "string" ? t.tabColor : undefined,
    freeze: typeof t.freeze === "string" ? t.freeze : undefined,
    columnWidths: Array.isArray(t.columnWidths)
      ? (t.columnWidths as unknown[]).filter((n): n is number => typeof n === "number")
      : undefined,
    rowHeights: (t.rowHeights && typeof t.rowHeights === "object")
      ? (t.rowHeights as Record<string, number>)
      : undefined,
    hideGridlines: typeof t.hideGridlines === "boolean" ? t.hideGridlines : true,
    cells,
    merges: Array.isArray(t.merges)
      ? (t.merges as unknown[]).filter((s): s is string => typeof s === "string")
      : undefined,
    charts: Array.isArray(t.charts) ? (t.charts as TabSpec["charts"]) : undefined,
    conditionalFormats: Array.isArray(t.conditionalFormats)
      ? (t.conditionalFormats as TabSpec["conditionalFormats"])
      : undefined,
    dataValidations: Array.isArray(t.dataValidations)
      ? (t.dataValidations as TabSpec["dataValidations"])
      : undefined,
  };
}
