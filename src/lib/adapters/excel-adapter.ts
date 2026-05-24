// ══════════════════════════════════════════════════════════════
// Excel Tracker Adapter (Stub)
//
// Standalone Excel trackers — similar to Sheets but with
// Excel-specific features (macros, pivot tables, named ranges).
// ══════════════════════════════════════════════════════════════

import type { ProductConceptSpec, ProductStructureSpec } from "@/types/gemini-specs";
import type { ProductAdapter, BuildResult, ImageSlotOverride } from "./product-adapter";
import { registerAdapter } from "./product-adapter";

class ExcelAdapter implements ProductAdapter {
  readonly productType = "excel-tracker" as const;
  readonly displayName = "Excel Tracker";
  readonly fileExtension = "xlsx";

  async build(
    structure: ProductStructureSpec,
    concept: ProductConceptSpec,
  ): Promise<BuildResult> {
    // For now, delegate to the Sheets adapter logic since both output xlsx
    // Future: add Excel-specific features (macros, pivot tables)
    const { SheetsAdapter } = await import("./sheets-adapter");
    const sheetsAdapter = new SheetsAdapter();

    // Convert excel structure to sheets-compatible structure
    const sheetsStructure: ProductStructureSpec = {
      ...structure,
      productType: "google-sheets",
      sheets: structure.excel
        ? {
            tabs: structure.excel.tabs,
            charts: structure.excel.charts,
            colorScheme: structure.excel.colorScheme,
            sampleDataStrategy: "Excel-optimized sample data",
            deliveryMethod: "xlsx_download",
            kpiModel: { primaryMetric: "Total", secondaryMetrics: [], comparisonType: "month-over-month" },
            dashboardStyle: "balanced",
          }
        : structure.sheets,
    };

    const result = await sheetsAdapter.build(sheetsStructure, concept);
    return { ...result, fileName: result.fileName.replace(".xlsx", "-excel.xlsx") };
  }

  async renderPreview(
    structure: ProductStructureSpec,
    _concept: ProductConceptSpec,
  ): Promise<string> {
    const tabs = structure.excel?.tabs || structure.sheets?.tabs || [];
    return `<html><body><h1>${structure.title}</h1><p>${tabs.length} worksheets</p></body></html>`;
  }

  getImageSlotOverrides(_structure: ProductStructureSpec): Partial<Record<number, ImageSlotOverride>> {
    return {};
  }

  getOutputFormat() {
    return { extension: "xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  }

  canHandle(structure: ProductStructureSpec): boolean {
    return structure.productType === "excel-tracker";
  }
}

registerAdapter(new ExcelAdapter());
export { ExcelAdapter };
