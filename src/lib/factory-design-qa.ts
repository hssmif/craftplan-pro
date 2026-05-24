import type { SpreadsheetSpec } from "./factory-spreadsheet-spec";
import type { SpreadsheetFamilyProfile } from "./factory-spreadsheet-families";

export interface DesignDistinctivenessResult {
  ok: boolean;
  issues: string[];
  signals: {
    dashboardTitle?: string;
    systemBadge?: string;
    fontFamilies: string[];
    paletteSignature: string;
    repeatedLegacyText: number;
  };
}

const LEGACY_TEXT = [
  "All-In-One Dashboard",
  "AUTOMATED SPREADSHEET SYSTEM · EXCEL + GOOGLE SHEETS",
  "CATEGORY PERFORMANCE",
  "MONTHLY SNAPSHOT",
  "AUTOMATION CHECKS",
];

const GENERIC_DASHBOARD_TITLES = new Set([
  "All-In-One Dashboard",
  "Dashboard",
  "Annual Dashboard",
]);

const DEFAULT_PALETTE_SIGNATURES = new Set([
  "F7F2E8|5F755F|E8C9C5",
  "FBF8F1|5F755F|E8C9C5",
]);

export function assessDesignDistinctiveness(
  spec: SpreadsheetSpec,
  familyProfile: SpreadsheetFamilyProfile,
): DesignDistinctivenessResult {
  const issues: string[] = [];
  const fonts = new Set<string>();
  let repeatedLegacyText = 0;
  let dashboardTitle: string | undefined;
  let systemBadge: string | undefined;

  for (const tab of spec.tabs) {
    for (const cell of tab.cells) {
      if (cell.font?.name) fonts.add(cell.font.name);
      if (typeof cell.value === "string") {
        if (LEGACY_TEXT.includes(cell.value)) repeatedLegacyText++;
        if (tab.name === "Dashboard" && cell.ref === "B3") dashboardTitle = cell.value;
        if (cell.ref === "B5" && /EXCEL|SHEETS|TRACKER|PLANNER|SYSTEM|WORKBOOK|COMMAND|INVENTORY|WEDDING|GRADEBOOK|SELLER/i.test(cell.value)) {
          systemBadge = cell.value;
        }
      }
    }
  }

  const paletteSignature = spec.workbook.paletteHex.slice(0, 3).map(cleanHex).join("|");
  const fontFamilies = Array.from(fonts).sort();

  if (!dashboardTitle || GENERIC_DASHBOARD_TITLES.has(dashboardTitle)) {
    issues.push("Dashboard title is still generic; product family needs a branded dashboard title.");
  }
  if (!systemBadge || systemBadge === "AUTOMATED SPREADSHEET SYSTEM · EXCEL + GOOGLE SHEETS") {
    issues.push("System badge still uses the shared legacy banner.");
  }
  if (DEFAULT_PALETTE_SIGNATURES.has(paletteSignature)) {
    issues.push("Palette still matches the original shared sage/blush/cream template.");
  }
  if (repeatedLegacyText > 0) {
    issues.push(`${repeatedLegacyText} shared legacy label(s) still present.`);
  }
  if (fontFamilies.length === 0 || fontFamilies.every((font) => font === "Arial" || font === "Georgia")) {
    issues.push("Fonts still use only the shared Arial/Georgia pairing.");
  }

  if (familyProfile.id !== "wedding_event" && /wedding|bridal/i.test(spec.workbook.title)) {
    issues.push(`Workbook title "${spec.workbook.title}" does not match ${familyProfile.label}.`);
  }

  return {
    ok: issues.length === 0,
    issues,
    signals: {
      dashboardTitle,
      systemBadge,
      fontFamilies,
      paletteSignature,
      repeatedLegacyText,
    },
  };
}

function cleanHex(value: string): string {
  const cleaned = value.replace(/^#/, "").toUpperCase();
  return cleaned.length === 8 && cleaned.startsWith("FF") ? cleaned.slice(2) : cleaned;
}
