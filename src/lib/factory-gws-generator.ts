// ══════════════════════════════════════════════════════════════
// Factory GWS Generator v2
// Translates a ProductBlueprint into executable GWS CLI commands
// that create a complete, premium-formatted native Google Sheet.
//
// NOW powered by the Design System — every tab gets premium
// visual treatment: proper spacing, KPI cards, section headers,
// alternating rows, chart zones, and frozen panes.
//
// Pipeline:
//   1. Create spreadsheet
//   2. Add tabs + populate values/formulas
//   3. Apply Design System layout (premium formatting)
//   4. Add charts with proper placement
//   5. Add conditional formatting (status indicators)
//   6. Add data validation (niche-specific dropdowns)
//   7. Export .xlsx
//
// All commands are GWS CLI compatible and execute via
// POST /api/gws/execute
// ══════════════════════════════════════════════════════════════

import type { ProductBlueprint, GwsGenerationPlan, BlueprintTab } from "@/types/factory";
import {
  generateSpreadsheetLayout,
  layoutToGwsRequests,
  generateConditionalRules,
  generateValidationRules,
  resolveTheme,
  type SpreadsheetLayout,
  type ChartPlacement,
  type ConditionalFormatRule,
  type ValidationRule,
} from "@/lib/factory-design-system";

// ── Color Helpers ───────────────────────────────────────────

function hexToRgb(h: string): { red: number; green: number; blue: number } {
  const hex = h.startsWith("#") ? h.slice(1) : h;
  return {
    red: +(parseInt(hex.slice(0, 2), 16) / 255).toFixed(3),
    green: +(parseInt(hex.slice(2, 4), 16) / 255).toFixed(3),
    blue: +(parseInt(hex.slice(4, 6), 16) / 255).toFixed(3),
  };
}

const WHITE = { red: 1, green: 1, blue: 1 };

// ── Command Builder Helpers ─────────────────────────────────

function escapeJson(json: string): string {
  return json.replace(/'/g, "'\\''");
}

function batchCmd(spreadsheetId: string, requests: object[]): string {
  const json = JSON.stringify({ requests });
  return `gws sheets spreadsheets batchUpdate --params '{"spreadsheetId":"${spreadsheetId}"}' --json '${escapeJson(json)}'`;
}

function valuesCmd(spreadsheetId: string, range: string, values: unknown[][]): string {
  const json = JSON.stringify({ values });
  return `gws sheets spreadsheets values update --params '{"spreadsheetId":"${spreadsheetId}","range":"${range}","valueInputOption":"USER_ENTERED"}' --json '${escapeJson(json)}'`;
}

// ── Phase 1: Create Spreadsheet ─────────────────────────────

function buildCreateCommand(title: string): string {
  const json = JSON.stringify({
    properties: { title },
  });
  return `gws sheets spreadsheets create --json '${escapeJson(json)}'`;
}

// ── Phase 2: Add Tabs ───────────────────────────────────────

function buildTabCommands(spreadsheetId: string, tabs: BlueprintTab[]): string[] {
  const commands: string[] = [];

  if (tabs.length > 0) {
    const requests: object[] = [
      {
        updateSheetProperties: {
          properties: { sheetId: 0, title: tabs[0].name },
          fields: "title",
        },
      },
    ];
    for (let i = 1; i < tabs.length; i++) {
      requests.push({
        addSheet: {
          properties: { title: tabs[i].name, index: i },
        },
      });
    }
    commands.push(batchCmd(spreadsheetId, requests));
  }

  return commands;
}

// ── Phase 3: Populate Values + Formulas ─────────────────────
// For non-Dashboard tabs, values go starting at row 3 (after title bar + spacer)
// For Dashboard, values follow the design system layout positions

function buildValueCommands(spreadsheetId: string, tabs: BlueprintTab[]): string[] {
  const commands: string[] = [];

  for (const tab of tabs) {
    if (!tab.columns.length && !tab.sampleRows.length) continue;

    const isDashboard = tab.name.toLowerCase() === "dashboard";
    const isSetup = tab.name.toLowerCase().includes("setup") &&
      (tab.name.toLowerCase().includes("instruction") || tab.name.toLowerCase().includes("&"));

    if (isDashboard) {
      // Dashboard values are placed at specific layout positions
      // The design system positions: row 1=title, row 2=subtitle, row 3=spacer,
      // row 4=controls, row 5=spacer, row 6-7=KPI, row 8=spacer, etc.
      // We populate what the blueprint provides as sampleRows
      const allRows: unknown[][] = [];
      for (const row of tab.sampleRows) {
        allRows.push(row.map(cell => cell ?? ""));
      }
      if (allRows.length > 0) {
        const maxCols = Math.max(...allRows.map(r => r.length), 1);
        const lastCol = String.fromCharCode(64 + Math.min(maxCols, 26));
        const range = `'${tab.name}'!A1:${lastCol}${allRows.length}`;
        commands.push(valuesCmd(spreadsheetId, range, allRows));
      }
    } else if (isSetup) {
      // Setup tab: title at row 1, content starting row 2
      const allRows: unknown[][] = [];
      for (const row of tab.sampleRows) {
        allRows.push(row.map(cell => cell ?? ""));
      }
      if (allRows.length > 0) {
        const range = `'${tab.name}'!A1:A${allRows.length}`;
        commands.push(valuesCmd(spreadsheetId, range, allRows));
      }
    } else {
      // Data tabs: row 1=tab title, row 2=spacer, row 3=headers, row 4+=data
      const headers = tab.columns.map(c => c.name);
      const titleRow = [tab.name.toUpperCase()];
      const spacerRow = [""];
      const allRows: unknown[][] = [titleRow, spacerRow, headers];

      for (const row of tab.sampleRows) {
        allRows.push(row.map(cell => cell ?? ""));
      }

      if (allRows.length > 0) {
        const maxCols = Math.max(tab.columns.length, 1);
        const lastCol = String.fromCharCode(64 + Math.min(maxCols, 26));
        const range = `'${tab.name}'!A1:${lastCol}${allRows.length}`;
        commands.push(valuesCmd(spreadsheetId, range, allRows));
      }
    }
  }

  return commands;
}

// ── Phase 4: Design System Layout ───────────────────────────
// Generates ALL formatting commands via the design system.
// This replaces the old per-tab formatting approach.

function buildDesignSystemCommands(
  spreadsheetId: string,
  blueprint: ProductBlueprint,
  spreadsheetLayout: SpreadsheetLayout
): string[] {
  const commands: string[] = [];

  for (let i = 0; i < spreadsheetLayout.sheets.length; i++) {
    const sheetLayout = spreadsheetLayout.sheets[i];
    const requests = layoutToGwsRequests(sheetLayout, i);

    if (requests.length > 0) {
      // Split into batches of 100 requests to avoid API limits
      const BATCH_SIZE = 100;
      for (let j = 0; j < requests.length; j += BATCH_SIZE) {
        const batch = requests.slice(j, j + BATCH_SIZE);
        commands.push(batchCmd(spreadsheetId, batch));
      }
    }
  }

  return commands;
}

// ── Phase 5: Charts ─────────────────────────────────────────
// Uses chart placements from the design system

function buildChartCommands(
  spreadsheetId: string,
  blueprint: ProductBlueprint,
  spreadsheetLayout: SpreadsheetLayout
): string[] {
  const requests: object[] = [];
  const theme = spreadsheetLayout.theme;
  const bgColor = hexToRgb(theme.pageBg);
  const titleColor = hexToRgb(theme.titleBg);

  // Collect all chart placements from all sheets
  for (let sheetIdx = 0; sheetIdx < spreadsheetLayout.sheets.length; sheetIdx++) {
    const sheet = spreadsheetLayout.sheets[sheetIdx];

    for (const chart of sheet.chartPlacements) {
      if (chart.sourceSheetIndex < 0) continue;

      if (chart.type === "donut" || chart.type === "pie") {
        requests.push({
          addChart: {
            chart: {
              spec: {
                title: chart.title,
                pieChart: {
                  legendPosition: "BOTTOM_LEGEND",
                  ...(chart.type === "donut" ? { pieHole: 0.45 } : {}),
                  domain: {
                    sourceRange: {
                      sources: [{
                        sheetId: chart.sourceSheetIndex,
                        startRowIndex: chart.labelRange.startRow,
                        endRowIndex: chart.labelRange.endRow,
                        startColumnIndex: chart.labelRange.startCol,
                        endColumnIndex: chart.labelRange.endCol,
                      }],
                    },
                  },
                  series: {
                    sourceRange: {
                      sources: [{
                        sheetId: chart.sourceSheetIndex,
                        startRowIndex: chart.dataRange.startRow,
                        endRowIndex: chart.dataRange.endRow,
                        startColumnIndex: chart.dataRange.startCol,
                        endColumnIndex: chart.dataRange.endCol,
                      }],
                    },
                  },
                },
                backgroundColorStyle: { rgbColor: bgColor },
                titleTextFormat: { foregroundColorStyle: { rgbColor: titleColor }, fontSize: 11, bold: true },
              },
              position: {
                overlayPosition: {
                  anchorCell: { sheetId: sheetIdx, rowIndex: chart.row - 1, columnIndex: chart.col },
                  widthPixels: chart.width,
                  heightPixels: chart.height,
                },
              },
            },
          },
        });
      } else if (chart.type === "column" || chart.type === "bar") {
        requests.push({
          addChart: {
            chart: {
              spec: {
                title: chart.title,
                basicChart: {
                  chartType: chart.type === "column" ? "COLUMN" : "BAR",
                  legendPosition: "TOP_LEGEND",
                  axis: [
                    { position: "BOTTOM_AXIS" },
                    { position: "LEFT_AXIS" },
                  ],
                  domains: [{
                    domain: {
                      sourceRange: {
                        sources: [{
                          sheetId: chart.sourceSheetIndex,
                          startRowIndex: chart.labelRange.startRow,
                          endRowIndex: chart.labelRange.endRow,
                          startColumnIndex: chart.labelRange.startCol,
                          endColumnIndex: chart.labelRange.endCol,
                        }],
                      },
                    },
                  }],
                  series: [{
                    series: {
                      sourceRange: {
                        sources: [{
                          sheetId: chart.sourceSheetIndex,
                          startRowIndex: chart.dataRange.startRow,
                          endRowIndex: chart.dataRange.endRow,
                          startColumnIndex: chart.dataRange.startCol,
                          endColumnIndex: chart.dataRange.endCol,
                        }],
                      },
                    },
                    colorStyle: { rgbColor: titleColor },
                  }],
                  headerCount: 1,
                },
                backgroundColorStyle: { rgbColor: bgColor },
                titleTextFormat: { foregroundColorStyle: { rgbColor: titleColor }, fontSize: 11, bold: true },
              },
              position: {
                overlayPosition: {
                  anchorCell: { sheetId: sheetIdx, rowIndex: chart.row - 1, columnIndex: chart.col },
                  widthPixels: chart.width,
                  heightPixels: chart.height,
                },
              },
            },
          },
        });
      } else if (chart.type === "line") {
        requests.push({
          addChart: {
            chart: {
              spec: {
                title: chart.title,
                basicChart: {
                  chartType: "LINE",
                  legendPosition: "BOTTOM_LEGEND",
                  axis: [
                    { position: "BOTTOM_AXIS" },
                    { position: "LEFT_AXIS" },
                  ],
                  domains: [{
                    domain: {
                      sourceRange: {
                        sources: [{
                          sheetId: chart.sourceSheetIndex,
                          startRowIndex: chart.labelRange.startRow,
                          endRowIndex: chart.labelRange.endRow,
                          startColumnIndex: chart.labelRange.startCol,
                          endColumnIndex: chart.labelRange.endCol,
                        }],
                      },
                    },
                  }],
                  series: [{
                    series: {
                      sourceRange: {
                        sources: [{
                          sheetId: chart.sourceSheetIndex,
                          startRowIndex: chart.dataRange.startRow,
                          endRowIndex: chart.dataRange.endRow,
                          startColumnIndex: chart.dataRange.startCol,
                          endColumnIndex: chart.dataRange.endCol,
                        }],
                      },
                    },
                    colorStyle: { rgbColor: hexToRgb(theme.accentText) },
                  }],
                  headerCount: 1,
                },
                backgroundColorStyle: { rgbColor: bgColor },
                titleTextFormat: { foregroundColorStyle: { rgbColor: titleColor }, fontSize: 11, bold: true },
              },
              position: {
                overlayPosition: {
                  anchorCell: { sheetId: sheetIdx, rowIndex: chart.row - 1, columnIndex: chart.col },
                  widthPixels: chart.width,
                  heightPixels: chart.height,
                },
              },
            },
          },
        });
      }
    }
  }

  return requests.length > 0 ? [batchCmd(spreadsheetId, requests)] : [];
}

// ── Phase 6: Conditional Formatting ─────────────────────────

function buildConditionalFormattingCommands(
  spreadsheetId: string,
  rules: ConditionalFormatRule[]
): string[] {
  if (rules.length === 0) return [];

  const requests: object[] = [];

  for (const rule of rules) {
    const range = {
      sheetId: rule.sheetId,
      startRowIndex: rule.range.startRow,
      endRowIndex: rule.range.endRow,
      startColumnIndex: rule.range.startCol,
      endColumnIndex: rule.range.endCol,
    };

    const format = {
      textFormat: { foregroundColor: hexToRgb(rule.format.textColor) },
      backgroundColor: hexToRgb(rule.format.background),
    };

    if (rule.type === "text_contains") {
      requests.push({
        addConditionalFormatRule: {
          rule: {
            ranges: [range],
            booleanRule: {
              condition: { type: "TEXT_CONTAINS", values: [{ userEnteredValue: rule.value }] },
              format,
            },
          },
          index: requests.length,
        },
      });
    } else if (rule.type === "number_less") {
      requests.push({
        addConditionalFormatRule: {
          rule: {
            ranges: [range],
            booleanRule: {
              condition: { type: "NUMBER_LESS", values: [{ userEnteredValue: rule.value }] },
              format,
            },
          },
          index: requests.length,
        },
      });
    } else if (rule.type === "number_greater") {
      requests.push({
        addConditionalFormatRule: {
          rule: {
            ranges: [range],
            booleanRule: {
              condition: { type: "NUMBER_GREATER", values: [{ userEnteredValue: rule.value }] },
              format,
            },
          },
          index: requests.length,
        },
      });
    }
  }

  // Batch in groups
  const BATCH_SIZE = 50;
  const commands: string[] = [];
  for (let i = 0; i < requests.length; i += BATCH_SIZE) {
    commands.push(batchCmd(spreadsheetId, requests.slice(i, i + BATCH_SIZE)));
  }
  return commands;
}

// ── Phase 7: Data Validation ────────────────────────────────

function buildValidationCommands(
  spreadsheetId: string,
  rules: ValidationRule[]
): string[] {
  if (rules.length === 0) return [];

  const requests: object[] = [];

  for (const rule of rules) {
    requests.push({
      setDataValidation: {
        range: {
          sheetId: rule.sheetId,
          startRowIndex: rule.range.startRow,
          endRowIndex: rule.range.endRow,
          startColumnIndex: rule.range.startCol,
          endColumnIndex: rule.range.endCol,
        },
        rule: {
          condition: {
            type: "ONE_OF_LIST",
            values: rule.values.map(v => ({ userEnteredValue: v })),
          },
          showCustomUi: true,
          strict: false,
        },
      },
    });
  }

  return [batchCmd(spreadsheetId, requests)];
}

// ══════════════════════════════════════════════════════════════
// MAIN EXPORT: Generate the full GWS generation plan
// Now powered by the Design System for premium output.
// ══════════════════════════════════════════════════════════════

export function generateGwsPlan(blueprint: ProductBlueprint): GwsGenerationPlan {
  const PLACEHOLDER_ID = "__SPREADSHEET_ID__";

  // Generate the complete spreadsheet layout via the design system
  const spreadsheetLayout = generateSpreadsheetLayout(blueprint);
  const theme = spreadsheetLayout.theme;

  // Generate conditional formatting and validation rules
  const conditionalRules = generateConditionalRules(blueprint, theme);
  const validationRules = generateValidationRules(blueprint);

  const phases: GwsGenerationPlan["phases"] = [];

  // Phase 1: Create spreadsheet
  const title = blueprint.listingStrategy?.titleKeywords?.join(" ") || blueprint.sourceListingTitle || "Untitled Product";
  phases.push({
    name: "create",
    commands: [buildCreateCommand(title)],
  });

  // Phase 2: Add tabs
  if (blueprint.tabs.length > 0) {
    phases.push({
      name: "tabs",
      commands: buildTabCommands(PLACEHOLDER_ID, blueprint.tabs),
    });
  }

  // Phase 3: Populate values + formulas
  phases.push({
    name: "values",
    commands: buildValueCommands(PLACEHOLDER_ID, blueprint.tabs),
  });

  // Phase 4: Design System layout (replaces old formatting + widths)
  // This is the core visual upgrade — every tab gets premium treatment
  phases.push({
    name: "designSystem",
    commands: buildDesignSystemCommands(PLACEHOLDER_ID, blueprint, spreadsheetLayout),
  });

  // Phase 5: Charts (positioned by design system)
  const chartCmds = buildChartCommands(PLACEHOLDER_ID, blueprint, spreadsheetLayout);
  if (chartCmds.length > 0) {
    phases.push({
      name: "charts",
      commands: chartCmds,
    });
  }

  // Phase 6: Conditional formatting
  const cfCmds = buildConditionalFormattingCommands(PLACEHOLDER_ID, conditionalRules);
  if (cfCmds.length > 0) {
    phases.push({
      name: "conditionalFormatting",
      commands: cfCmds,
    });
  }

  // Phase 7: Data validation
  const dvCmds = buildValidationCommands(PLACEHOLDER_ID, validationRules);
  if (dvCmds.length > 0) {
    phases.push({
      name: "validation",
      commands: dvCmds,
    });
  }

  // Remove empty phases
  const filteredPhases = phases.filter(p => p.commands.length > 0);
  const totalCommands = filteredPhases.reduce((sum, p) => sum + p.commands.length, 0);

  return {
    spreadsheetTitle: title,
    phases: filteredPhases,
    totalCommands,
  };
}

/**
 * Execute a GwsGenerationPlan by replacing placeholder IDs and running commands.
 * Returns the created spreadsheet ID.
 */
export async function executeGwsPlan(
  plan: GwsGenerationPlan,
  baseUrl: string
): Promise<{ spreadsheetId: string; success: boolean; error?: string }> {
  let spreadsheetId = "";

  for (const phase of plan.phases) {
    if (phase.name === "create") {
      try {
        const resp = await fetch(`${baseUrl}/api/gws/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commands: phase.commands }),
        });
        if (!resp.ok) throw new Error("Failed to create spreadsheet");
        const data = await resp.json();

        const output = data.results?.[0]?.output || "";
        const idMatch = output.match(/"spreadsheetId"\s*:\s*"([^"]+)"/);
        if (idMatch) {
          spreadsheetId = idMatch[1];
        }

        if (!spreadsheetId) {
          throw new Error("Could not parse spreadsheet ID from GWS create output");
        }
      } catch (err) {
        return { spreadsheetId: "", success: false, error: err instanceof Error ? err.message : "Create failed" };
      }
      continue;
    }

    // All other phases: replace placeholder and execute
    const commands = phase.commands.map(cmd =>
      cmd.replace(/__SPREADSHEET_ID__/g, spreadsheetId)
    );

    try {
      const resp = await fetch(`${baseUrl}/api/gws/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commands }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "unknown" }));
        console.error(`[GWS Generator] Phase "${phase.name}" failed:`, err);
        // Fatal for content phases, non-fatal for styling
        if (phase.name === "values" || phase.name === "tabs") {
          return { spreadsheetId, success: false, error: `Phase "${phase.name}" failed: ${err.error}` };
        }
      }
    } catch (err) {
      console.error(`[GWS Generator] Phase "${phase.name}" network error:`, err);
      if (phase.name === "values" || phase.name === "tabs") {
        return { spreadsheetId, success: false, error: `Phase "${phase.name}" failed` };
      }
    }
  }

  return { spreadsheetId, success: true };
}

// ── Exported for use by other modules ────────────────────────

export { generateSpreadsheetLayout, resolveTheme };
export type { SpreadsheetLayout };
