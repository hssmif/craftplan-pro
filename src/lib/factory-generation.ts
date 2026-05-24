// ══════════════════════════════════════════════════════════════
// Factory Engine 3: Product Generation
// Takes a FactoryBlueprint → generates the actual product file
// For Sheets: ExcelJS → upload asset → optional GWS enhancement
// For others: direct generator API call → upload asset
// ══════════════════════════════════════════════════════════════

import type { DigitalProductConfig, SheetsConfig } from "@/types/digital-product";
import type { FactoryBlueprint } from "@/types/factory";

export interface GenerationResult {
  projectId: string;
  assetId: string;
  fileName: string;
  downloadUrl: string;
  fileSizeBytes: number;
  mimeType: string;
  spreadsheetId?: string;  // Google Sheets ID if GWS was used
  gwsEnhanced: boolean;
}

// ── Generator dispatch (server-side, called from API route) ──

export function getGeneratorEndpoint(config: DigitalProductConfig | SheetsConfig): {
  url: string;
  body: Record<string, unknown>;
  fileName: string;
} {
  switch (config.type) {
    case "sheets": {
      const titles: Record<string, string> = {
        budget_tracker: "budget-tracker",
        paycheck_budget: "paycheck-budget",
        business_pl: "business-pl",
      };
      return {
        url: "/api/sheets/generate",
        body: { sheetsType: config.sheetsType, colorScheme: config.colorScheme, customTitle: config.customTitle },
        fileName: `${titles[config.sheetsType] || config.sheetsType}-${config.colorScheme}.xlsx`,
      };
    }
    case "pdf":
      return {
        url: "/api/pdf/generate",
        body: { plannerType: config.plannerType, colorScheme: config.colorTheme },
        fileName: `${config.plannerType}-planner.pdf`,
      };
    case "excel":
      return {
        url: "/api/excel/generate",
        body: { trackerType: config.trackerType, colorScheme: config.colorScheme },
        fileName: `${config.trackerType}-tracker.xlsx`,
      };
    case "printable":
      return {
        url: "/api/printable/generate",
        body: { printableType: config.printableType, colorScheme: config.colorScheme },
        fileName: `${config.printableType}_${config.colorScheme}.pdf`,
      };
    case "notion":
      return {
        url: "/api/notion/build",
        body: {
          notionToken: config.notionToken,
          parentPageId: config.parentPageId,
          templateId: config.templateType,
          aesthetic: config.aesthetic,
          premium: config.premium,
        },
        fileName: `notion-${config.templateType}.json`,
      };
    default:
      throw new Error(`Unsupported product type: ${(config as { type: string }).type}`);
  }
}

/**
 * Build a project name from a blueprint
 */
export function buildProjectName(blueprint: FactoryBlueprint): string {
  const source = blueprint.sourceListingTitle || "";
  // Use the listing strategy keywords if available
  if (blueprint.listingStrategy.titleKeywords.length > 0) {
    return blueprint.listingStrategy.titleKeywords.slice(0, 4).join(" ");
  }
  // Fallback: clean up source title
  return source.slice(0, 40).replace(/[|•·—–]/g, " ").replace(/\s+/g, " ").trim() || "Factory Product";
}
