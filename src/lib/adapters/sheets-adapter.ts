// ══════════════════════════════════════════════════════════════
// Google Sheets Adapter
//
// Bridges the new Gemini spec system to the existing
// factory-spreadsheet-builder.ts. Translates
// ProductStructureSpec → ProductBlueprint → buildPremiumSpreadsheet()
//
// This is the MIGRATION BRIDGE — the existing builder keeps
// working unchanged, the adapter translates the new spec format.
// ══════════════════════════════════════════════════════════════

import type { ProductConceptSpec, ProductStructureSpec, SheetsTabSpec } from "@/types/gemini-specs";
import type { ProductBlueprint, BlueprintTab, BlueprintChart } from "@/types/factory";
import type { ProductAdapter, BuildResult, ImageSlotOverride } from "./product-adapter";
import { registerAdapter } from "./product-adapter";

class SheetsAdapter implements ProductAdapter {
  readonly productType = "google-sheets" as const;
  readonly displayName = "Google Sheets Template";
  readonly fileExtension = "xlsx";

  async build(
    structure: ProductStructureSpec,
    concept: ProductConceptSpec,
  ): Promise<BuildResult> {
    // Translate structure spec → legacy ProductBlueprint format
    const blueprint = this.translateToBlueprint(structure, concept);

    // Call the existing builder
    const { buildPremiumSpreadsheet } = await import("@/lib/factory-spreadsheet-builder");
    const arrayBuffer = await buildPremiumSpreadsheet(blueprint);
    const buffer = Buffer.from(arrayBuffer);

    const fileName = `${concept.suggestedTitle.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-").substring(0, 60)}.xlsx`;

    return {
      buffer,
      fileName,
      fileSizeBytes: buffer.length,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      metadata: {
        tabCount: structure.sheets?.tabs.length || 0,
        chartCount: structure.sheets?.charts.length || 0,
        niche: concept.niche,
      },
    };
  }

  async renderPreview(
    structure: ProductStructureSpec,
    _concept: ProductConceptSpec,
  ): Promise<string> {
    // The existing preview engine handles this via Playwright
    // This is a placeholder — the real preview goes through factory-preview-engine.ts
    const tabs = structure.sheets?.tabs || [];
    return `<html><body><h1>${structure.title}</h1><p>${tabs.length} tabs</p></body></html>`;
  }

  getImageSlotOverrides(
    structure: ProductStructureSpec,
  ): Partial<Record<number, ImageSlotOverride>> {
    // Sheets products use the standard 7-slot Etsy image plan
    // with niche-specific overrides for certain tabs
    const tabs = structure.sheets?.tabs || [];
    const overrides: Partial<Record<number, ImageSlotOverride>> = {};

    // If there's a vendor tracker, feature it in slot 4
    const vendorTab = tabs.find(t => t.name.toLowerCase().includes("vendor"));
    if (vendorTab) {
      overrides[4] = { kind: "vendor-zoom", title: `Track Every ${vendorTab.name.split(" ")[0]}` };
    }

    // If there's an itinerary, feature it
    const itineraryTab = tabs.find(t => t.name.toLowerCase().includes("itinerary"));
    if (itineraryTab) {
      overrides[4] = { kind: "itinerary-preview", title: "Plan Day by Day" };
    }

    return overrides;
  }

  getOutputFormat() {
    return { extension: "xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  }

  canHandle(structure: ProductStructureSpec): boolean {
    return structure.productType === "google-sheets" && !!structure.sheets;
  }

  // ── Translation: StructureSpec → Legacy Blueprint ──────────

  private translateToBlueprint(
    structure: ProductStructureSpec,
    concept: ProductConceptSpec,
  ): ProductBlueprint {
    const sheets = structure.sheets!;

    // Translate SheetsTabSpec[] → BlueprintTab[]
    const tabs: BlueprintTab[] = sheets.tabs.map(tab => this.translateTab(tab));

    // Translate SheetsChartSpec[] → BlueprintChart[]
    const charts: BlueprintChart[] = sheets.charts.map(chart => ({
      type: chart.type as BlueprintChart["type"],
      title: chart.title,
      sourceTab: chart.sourceTab,
      sourceRange: "B2:B6",  // Default — builder auto-resolves
      dataRange: "D2:D6",     // Default — builder auto-resolves
      placement: chart.placement,
      width: chart.width,
      height: chart.height,
    }));

    return {
      // FactoryBlueprint fields
      id: `bp_${Date.now()}`,
      factoryRunId: "",
      sourceListingTitle: concept.suggestedTitle,
      competitorStrengths: concept.competitorInsights.strengths,
      competitorWeaknesses: concept.competitorInsights.weaknesses,
      productType: "sheets" as const,
      config: {
        type: "sheets" as const,
        sheetsType: concept.niche === "business" ? "business_pl" : concept.niche === "paycheck" ? "paycheck_budget" : "budget_tracker",
        colorScheme: sheets.colorScheme?.primary || "sage-green",
        complexity: "advanced" as const,
        customTitle: structure.title,
      } satisfies import("@/types/digital-product").SheetsConfig,
      differentiation: {
        competitorStrengths: concept.competitorInsights.strengths,
        competitorWeaknesses: concept.competitorInsights.weaknesses,
        ourImprovements: concept.competitorInsights.ourImprovements,
        positioningAngle: concept.uniqueAngle,
        suggestedPrice: { min: concept.recommendedPrice * 0.7, max: concept.recommendedPrice * 1.3, recommended: concept.recommendedPrice },
      },
      listingStrategy: {
        titleKeywords: concept.suggestedTitle.split(/\s+/).filter(w => w.length > 3),
        positionAs: concept.pricePositioning === "premium" || concept.pricePositioning === "luxury" ? "premium" : concept.pricePositioning === "budget" ? "value" : "comprehensive",
        uniqueSellingPoints: [concept.productPromise, concept.uniqueAngle],
      },
      suggestedPrice: concept.recommendedPrice,
      positioning: concept.uniqueAngle,
      createdAt: new Date().toISOString(),

      // ProductBlueprint fields
      tabs,
      charts,
      colorScheme: sheets.colorScheme,
      sampleDataStrategy: sheets.sampleDataStrategy,
      deliveryMethod: sheets.deliveryMethod,
    };
  }

  private translateTab(tab: SheetsTabSpec): BlueprintTab {
    return {
      name: tab.name,
      purpose: tab.purpose,
      columns: tab.columns.map(col => ({
        name: col.name,
        type: (col.type === "dropdown" || col.type === "checkbox") ? "text" : col.type as BlueprintTab["columns"][0]["type"],
        width: col.width,
        formula: col.formula,
      })),
      sampleRows: [],  // Builder populates from niche-data
      features: tab.features as BlueprintTab["features"],
    };
  }
}

// Auto-register when this module is imported
registerAdapter(new SheetsAdapter());

export { SheetsAdapter };
