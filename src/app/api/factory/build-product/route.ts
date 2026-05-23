// ══════════════════════════════════════════════════════════════
// Factory Engine 3 (v2): Build Product — Premium Builder
// POST /api/factory/build-product
// Takes a blueprintId → builds premium product using the
// OpenAI SpreadsheetSpec builder and deterministic Excel renderer.
//
// Builder cascade:
//   1. OpenAI SpreadsheetSpec -> ExcelJS -> native openpyxl charts
//   2. Gemini legacy builder fallback if OpenAI is unavailable
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getFactoryBlueprint, saveDigitalProject, updateFactoryRun } from "@/lib/db";
import { storeAsset } from "@/lib/digital-asset-storage";
import { getGeneratorEndpoint, buildProjectName } from "@/lib/factory-generation";
import { generateSpreadsheetSpec } from "@/lib/factory-openai-spec-generator";
import { buildCodedSpreadsheetSpec } from "@/lib/factory-coded-spreadsheet-builder";
import { renderSpreadsheet } from "@/lib/factory-spec-renderer";
import type { DigitalProductConfig, SheetsConfig } from "@/types/digital-product";
import type { ProductBlueprint, BlueprintListingStrategy } from "@/types/factory";
import type { CompetitorFeatures } from "@/lib/factory-competitor-scan";
import type { SpreadsheetSpec } from "@/lib/factory-spreadsheet-spec";
import {
  extractCompetitorTabHints,
  resolveSpreadsheetFamily,
  tabMatchesRequirement,
  type SpreadsheetFamilyProfile,
} from "@/lib/factory-spreadsheet-families";
import { assessDesignDistinctiveness } from "@/lib/factory-design-qa";

// ── Niche mapping ────────────────────────────────────────────
// Maps factory sheetsType / keywords / title to the legacy fallback's
// niche key (budget | baby | wedding | travel).

function resolvePremiumNiche(blueprint: ProductBlueprint): string | null {
  const config = blueprint.config as SheetsConfig;
  const sheetsType = config?.sheetsType || "";
  const title = (blueprint.sourceListingTitle || "").toLowerCase();
  const keywords = (blueprint.listingStrategy?.titleKeywords || [])
    .join(" ")
    .toLowerCase();
  const positioning = (blueprint.positioning || "").toLowerCase();
  const combined = `${sheetsType} ${title} ${keywords} ${positioning}`;

  // ── 1. Keyword detection FIRST (takes priority over sheetsType) ──
  // This ensures a "budget_tracker" blueprint with "wedding" in the
  // title gets mapped to the wedding niche, not generic budget.
  if (/baby|infant|newborn|nursery|toddler|pregnancy|maternity/.test(combined)) return "baby";
  if (/wedding|bridal|bride|groom|engaged|engagement|vendor.?track|guest.?list/.test(combined)) return "wedding";
  if (/travel|trip|vacation|itinerary|destination|backpack|flight|hotel/.test(combined)) return "travel";

  // ── 2. Direct sheetsType mapping (only if no keyword match) ──
  const typeMap: Record<string, string> = {
    budget_tracker: "budget",
    paycheck_budget: "budget",
    business_pl: "budget",
  };
  if (typeMap[sheetsType]) return typeMap[sheetsType];

  // ── 3. Generic budget keywords as fallback ──
  if (/budget|finance|money|expense|saving|paycheck|debt|bill/.test(combined)) return "budget";

  // Default to budget — the most universal niche
  return "budget";
}

// ── Helpers ──────────────────────────────────────────────────

const DEFAULT_COLOR_SCHEME = {
  primary: "#5B8A5F",
  secondary: "#E8F5E8",
  accent: "#2D5A3E",
  background: "#FFFFFF",
  text: "#1A1A1A",
  success: "#22C55E",
  danger: "#EF4444",
};

const DEFAULT_LISTING_STRATEGY: BlueprintListingStrategy = {
  titleKeywords: [],
  positionAs: "premium",
  uniqueSellingPoints: [],
};

function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function cleanFileName(title: string | undefined): string {
  const cleanName = (title || "product")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return `${cleanName}.xlsx`;
}

function isSpreadsheetConfig(config: ProductBlueprint["config"]): config is SheetsConfig | Extract<DigitalProductConfig, { type: "excel" }> {
  return config.type === "sheets" || config.type === "excel";
}

function mapProjectType(productType: ProductBlueprint["productType"]): DigitalProductConfig["type"] {
  if (productType === "sheets" || productType === "google-sheets") return "excel";
  return productType;
}

function getSpreadsheetNiche(config: ProductBlueprint["config"], blueprint: ProductBlueprint): string {
  if (config.type === "sheets") return config.sheetsType || "budget_tracker";
  if (config.type === "excel") return config.trackerType || "budget_tracker";
  return blueprint.positioning || "budget_tracker";
}

function spreadsheetLabel(niche: string, blueprint: ProductBlueprint): string {
  const fromTitle = blueprint.sourceListingTitle
    ?.replace(/\b(excel|google sheets?|spreadsheet|template|tracker|planner)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const fallback = niche
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
  return (fromTitle && fromTitle.length <= 80 ? fromTitle : fallback) || "Premium Budget Planner";
}

function parseCompetitorFeatures(raw: unknown): CompetitorFeatures | undefined {
  const parsed = safeJsonParse<CompetitorFeatures | undefined>(raw, undefined);
  return parsed && typeof parsed === "object" ? parsed : undefined;
}

function assessSpreadsheetSpec(
  spec: SpreadsheetSpec,
  familyProfile: SpreadsheetFamilyProfile,
  competitorFloorTabs = 0,
): {
  ok: boolean;
  issues: string[];
  stats: {
    tabs: number;
    cells: number;
    formulas: number;
    charts: number;
    conditionalFormats: number;
    dataValidations: number;
    definedNames: number;
    signatureTabs: number;
    requiredTabs: number;
    missingMustHaveTabs: number;
    sparseTabs: number;
  };
} {
  const tabNames = spec.tabs.map((t) => t.name);
  const countMatches = (requirements: Array<{ name: string }>) =>
    requirements.filter((requirement) =>
      tabNames.some((tabName) => tabMatchesRequirement(tabName, requirement.name))
    ).length;
  const missingMustHave = [
    ...familyProfile.requiredTabs,
    ...familyProfile.signatureTabs,
  ].filter((requirement) =>
    requirement.mustHave &&
    !tabNames.some((tabName) => tabMatchesRequirement(tabName, requirement.name))
  );
  const signatureTabs = countMatches(familyProfile.signatureTabs);
  const requiredTabs = countMatches(familyProfile.requiredTabs);
  const stats = spec.tabs.reduce(
    (acc, tab) => {
      acc.cells += tab.cells.length;
      acc.formulas += tab.cells.filter((cell) => !!cell.formula).length;
      acc.charts += tab.charts?.length ?? 0;
      acc.conditionalFormats += tab.conditionalFormats?.length ?? 0;
      acc.dataValidations += tab.dataValidations?.length ?? 0;
      if (tab.cells.length < 20) acc.sparseTabs += 1;
      return acc;
    },
    {
      tabs: spec.tabs.length,
      cells: 0,
      formulas: 0,
      charts: 0,
      conditionalFormats: 0,
      dataValidations: 0,
      definedNames: Object.keys(spec.definedNames ?? {}).length,
      signatureTabs,
      requiredTabs,
      missingMustHaveTabs: missingMustHave.length,
      sparseTabs: 0,
    },
  );

  const issues: string[] = [];
  const competitiveTabFloor = competitorFloorTabs > 0
    ? Math.min(24, Math.max(familyProfile.minTabs, Math.floor(competitorFloorTabs * 0.7)))
    : familyProfile.minTabs;
  if (stats.tabs < competitiveTabFloor) {
    issues.push(`Only ${stats.tabs} tabs; ${familyProfile.label} competitive floor is ${competitiveTabFloor}+ tabs. ${familyProfile.targetTabs}.`);
  }
  if (missingMustHave.length > 0) {
    issues.push(`Missing must-have tabs: ${missingMustHave.map((tab) => tab.name).join(", ")}.`);
  }
  if (stats.signatureTabs < familyProfile.signatureTabs.filter((tab) => tab.mustHave).length) {
    issues.push(`Only ${stats.signatureTabs}/${familyProfile.signatureTabs.length} family signature tabs present.`);
  }
  if (stats.charts < familyProfile.minCharts) {
    issues.push(`Only ${stats.charts} chart(s); ${familyProfile.label} target is ${familyProfile.minCharts}+ live charts.`);
  }
  if (stats.formulas < familyProfile.minFormulas) {
    issues.push(`Only ${stats.formulas} formulas; ${familyProfile.label} target is ${familyProfile.minFormulas}+.`);
  }
  if (stats.conditionalFormats < familyProfile.minConditionalFormats) {
    issues.push(`Only ${stats.conditionalFormats} conditional formatting rules; target is ${familyProfile.minConditionalFormats}+.`);
  }
  if (stats.dataValidations < familyProfile.minDataValidations) {
    issues.push(`Only ${stats.dataValidations} dropdown/data validations; target is ${familyProfile.minDataValidations}+.`);
  }
  if (stats.definedNames < familyProfile.minDefinedNames) {
    issues.push(`Only ${stats.definedNames} defined names; target is ${familyProfile.minDefinedNames}+.`);
  }
  if (stats.sparseTabs > Math.max(2, Math.floor(stats.tabs * 0.15))) {
    issues.push(`${stats.sparseTabs} tabs have fewer than 20 populated cells; avoid header-only placeholder tabs.`);
  }

  const designQa = assessDesignDistinctiveness(spec, familyProfile);
  if (!designQa.ok) {
    issues.push(...designQa.issues.map((issue) => `Design identity: ${issue}`));
  }

  return { ok: issues.length === 0, issues, stats };
}

// ── Route Handler ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { blueprintId, factoryRunId } = body;

    if (!blueprintId) {
      return NextResponse.json(
        { error: "Missing blueprintId" },
        { status: 400 }
      );
    }

    // ── 1. Load blueprint from DB ──

    const raw = getFactoryBlueprint(blueprintId);
    if (!raw) {
      return NextResponse.json(
        { error: "Blueprint not found" },
        { status: 404 }
      );
    }

    // ── 2. Reconstruct full ProductBlueprint ──

    const config = safeJsonParse<ProductBlueprint["config"]>(
      raw.config,
      { type: "sheets", sheetsType: "budget_tracker", colorScheme: "forest", complexity: "advanced" } as SheetsConfig
    );

    const blueprint: ProductBlueprint = {
      // FactoryBlueprint base fields
      id: raw.id as string,
      factoryRunId: (raw.factory_run_id as string) || factoryRunId || "",
      sourceListingTitle: raw.source_listing_title as string,
      productType: raw.product_type as ProductBlueprint["productType"],
      config,
      competitorStrengths: safeJsonParse<string[]>(raw.competitor_strengths, []),
      competitorWeaknesses: safeJsonParse<string[]>(raw.competitor_weaknesses, []),
      differentiation: safeJsonParse(raw.differentiation_strategy, {
        competitorStrengths: [],
        competitorWeaknesses: [],
        ourImprovements: [],
        positioningAngle: "",
        suggestedPrice: { min: 5, max: 15, recommended: 10 },
      }),
      listingStrategy: safeJsonParse<BlueprintListingStrategy>(
        raw.listing_strategy,
        DEFAULT_LISTING_STRATEGY
      ),
      suggestedPrice: (raw.suggested_price as number) || 10,
      positioning: (raw.positioning as string) || "premium",
      createdAt: raw.created_at as string,

      // ProductBlueprint-specific fields
      tabs: safeJsonParse(raw.tabs, []),
      charts: safeJsonParse(raw.charts, []),
      colorScheme: safeJsonParse(raw.color_scheme, DEFAULT_COLOR_SCHEME),
      sampleDataStrategy: (raw.sample_data as string) || "",
      deliveryMethod:
        (raw.delivery_method as ProductBlueprint["deliveryMethod"]) || "both",
    };

    const projectName = buildProjectName(blueprint);
    const fileName = cleanFileName(blueprint.sourceListingTitle || projectName);
    const projectId = `dp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const projectProductType = mapProjectType(blueprint.productType);

    // ── 3. Create project in DB ──

    const project = {
      id: projectId,
      projectName,
      productType: projectProductType,
      status: "draft",
      currentStep: "generate",
      stepStatuses: {
        discover: "done",
        configure: "done",
        generate: "idle",
        preview: "idle",
        listing: "idle",
        publish: "idle",
      },
      inspiration: {
        source: "auto",
        keyword: blueprint.listingStrategy.titleKeywords.join(" "),
        niche: blueprint.positioning,
      },
      config,
      generation: { status: "idle", result: null },
      preview: { mockups: [], mockupStatus: "idle" },
      listing: {
        title: "",
        description: "",
        tags: [],
        price: { min: 0, max: 0, recommended: 0 },
        faqs: [],
        mockupIdeas: [],
        status: "idle",
      },
      publish: { platform: "none", etsyStatus: "unpublished" },
      qualityScore: null,
      batchMeta: null,
      importSource: { type: "api", importedAt: now },
      createdAt: now,
      updatedAt: now,
    };

    // Save project directly. Avoid self-fetching /api/digital/projects from
    // inside this API route; in Next dev mode that can starve the same server
    // worker and leave Engine 3 "running" forever.
    try {
      saveDigitalProject({
        id: project.id,
        project_name: project.projectName,
        product_type: project.productType,
        status: project.status,
        current_step: project.currentStep,
        step_statuses: project.stepStatuses,
        inspiration: project.inspiration,
        config: project.config,
        generation: project.generation,
        preview: project.preview,
        listing: project.listing,
        publish: project.publish,
        quality_score: project.qualityScore,
        batch_meta: project.batchMeta,
        import_source: project.importSource,
      });
    } catch (saveErr) {
      console.warn("[Build Product] Project save failed, continuing:", saveErr instanceof Error ? saveErr.message : "unknown");
      // Non-fatal — continue with the build
    }

    // ── 4. SPREADSHEET PATH — OpenAI spec renderer first ────────
    // Gemini is still useful for competitor photo vision in Engine 1.5,
    // but the spreadsheet file itself should be OpenAI-designed and
    // deterministically rendered with live native charts.

    if (isSpreadsheetConfig(config)) {
      const keyword =
        (blueprint.listingStrategy?.titleKeywords ?? []).join(" ") ||
        blueprint.sourceListingTitle ||
        "budget tracker google sheets";
      const premiumNiche = resolvePremiumNiche(blueprint);
      const spreadsheetNiche = getSpreadsheetNiche(config, blueprint);
      const competitorFeatures = parseCompetitorFeatures(raw.competitor_features);
      const sourceListingDescription = typeof raw.source_listing_description === "string"
        ? raw.source_listing_description
        : undefined;
      const familyProfile = resolveSpreadsheetFamily({
        niche: spreadsheetNiche,
        nicheLabel: spreadsheetLabel(spreadsheetNiche, blueprint),
        projectName,
        competitorTitle: blueprint.sourceListingTitle,
        competitorDescription: sourceListingDescription,
        competitorTags: blueprint.listingStrategy?.titleKeywords ?? [],
        positioning: [
          blueprint.positioning,
          blueprint.differentiation?.positioningAngle,
          ...(blueprint.listingStrategy?.uniqueSellingPoints ?? []),
        ].filter(Boolean).join(" | "),
        competitorFeatures,
      });
      const competitorTabHints = extractCompetitorTabHints({
        niche: spreadsheetNiche,
        nicheLabel: spreadsheetLabel(spreadsheetNiche, blueprint),
        projectName,
        competitorTitle: blueprint.sourceListingTitle,
        competitorDescription: sourceListingDescription,
        competitorTags: blueprint.listingStrategy?.titleKeywords ?? [],
        positioning: blueprint.positioning,
        competitorFeatures,
      });

      if (process.env.CODED_SPREADSHEET_BUILDER !== "0") {
        const codedStart = Date.now();
        try {
          const coded = buildCodedSpreadsheetSpec({
            niche: spreadsheetNiche,
            nicheLabel: spreadsheetLabel(spreadsheetNiche, blueprint),
            projectName,
            competitorTitle: blueprint.sourceListingTitle,
            competitorDescription: sourceListingDescription,
            competitorTags: blueprint.listingStrategy?.titleKeywords ?? [],
            competitorPrice: blueprint.suggestedPrice,
            competitorFeatures,
            positioning: [
              blueprint.positioning,
              blueprint.differentiation?.positioningAngle,
              ...(blueprint.listingStrategy?.uniqueSellingPoints ?? []),
            ].filter(Boolean).join(" | "),
            palette: Object.values(blueprint.colorScheme ?? {}).filter((v): v is string => typeof v === "string"),
          });

          if (coded) {
            console.log(
              `[Build Product] Coded spreadsheet builder — engine "${coded.engineId}" family "${coded.familyProfile.id}"`,
            );
            const qa = assessSpreadsheetSpec(
              coded.spec,
              coded.familyProfile,
              competitorTabHints.declaredTabCount,
            );
            if (!qa.ok) {
              console.warn("[Build Product] Coded spec QA warnings:", qa.issues.join(" | "));
            }

            const hardTabFloor = competitorTabHints.declaredTabCount > 0
              ? Math.min(24, Math.max(coded.familyProfile.minTabs, Math.floor(competitorTabHints.declaredTabCount * 0.7)))
              : Math.max(6, Math.floor(coded.familyProfile.minTabs * 0.7));
            if (
              qa.stats.tabs >= hardTabFloor &&
              qa.stats.missingMustHaveTabs === 0 &&
              qa.stats.charts >= 1 &&
              qa.stats.formulas >= Math.max(12, Math.floor(coded.familyProfile.minFormulas * 0.35))
            ) {
              const rendered = await renderSpreadsheet(coded.spec);
              const outputFileName = cleanFileName(coded.spec.workbook.title || blueprint.sourceListingTitle || projectName);
              const asset = storeAsset(projectId, rendered.buffer, outputFileName, "product");

              if (factoryRunId) {
                updateFactoryRun(factoryRunId, { projectId, status: "generating" });
              }

              return NextResponse.json({
                success: true,
                projectId,
                assetId: asset.id,
                fileName: asset.fileName,
                fileSizeBytes: asset.fileSizeBytes,
                downloadUrl: asset.downloadUrl,
                gwsEnhanced: false,
                builderPath: "coded-spreadsheet-renderer",
                codedEngine: coded.engineId,
                codedStrategy: coded.strategy,
                premiumNiche,
                spreadsheetFamily: {
                  id: coded.familyProfile.id,
                  label: coded.familyProfile.label,
                  targetTabs: coded.familyProfile.targetTabs,
                  competitorDeclaredTabs: competitorTabHints.declaredTabCount || undefined,
                },
                codedElapsedMs: Date.now() - codedStart,
                renderStats: rendered.stats,
                quality: {
                  ok: qa.ok,
                  warnings: qa.issues,
                  ...qa.stats,
                },
                tabCount: coded.spec.tabs.length,
                matchedCompetitorFeatures: competitorFeatures
                  ? {
                      detectedTabs: competitorFeatures.detectedTabs.length,
                      chartTypes: competitorFeatures.chartTypes,
                      uniqueWidgets: competitorFeatures.uniqueWidgets.length,
                      confidence: competitorFeatures.confidence,
                    }
                  : undefined,
              });
            }

            console.warn("[Build Product] Coded builder below floor; falling back to OpenAI:", qa.issues.join(" | "));
          }
        } catch (codedErr) {
          console.error("[Build Product] Coded spreadsheet builder failed:", codedErr instanceof Error ? codedErr.message : "unknown error");
          console.warn("[Build Product] Falling back to OpenAI spec builder");
        }
      }

      if (process.env.OPENAI_API_KEY) {
        try {
          console.log(
            `[Build Product] OpenAI spec builder — keyword "${keyword}" niche "${spreadsheetNiche}" family "${familyProfile.id}"`,
          );

          const { spec, modelUsed, elapsedMs } = await generateSpreadsheetSpec({
            niche: spreadsheetNiche,
            nicheLabel: spreadsheetLabel(spreadsheetNiche, blueprint),
            projectName,
            competitorTitle: blueprint.sourceListingTitle,
            competitorDescription: sourceListingDescription,
            competitorTags: blueprint.listingStrategy?.titleKeywords ?? [],
            competitorPrice: blueprint.suggestedPrice,
            competitorFeatures,
            positioning: [
              blueprint.positioning,
              blueprint.differentiation?.positioningAngle,
              ...(blueprint.listingStrategy?.uniqueSellingPoints ?? []),
            ].filter(Boolean).join(" | "),
            palette: Object.values(blueprint.colorScheme ?? {}).filter((v): v is string => typeof v === "string"),
            familyProfile,
          });

          const qa = assessSpreadsheetSpec(spec, familyProfile, competitorTabHints.declaredTabCount);
          if (!qa.ok) {
            console.warn("[Build Product] OpenAI spec QA warnings:", qa.issues.join(" | "));
          }
          const hardTabFloor = competitorTabHints.declaredTabCount > 0
            ? Math.min(24, Math.max(familyProfile.minTabs, Math.floor(competitorTabHints.declaredTabCount * 0.7)))
            : Math.max(6, Math.floor(familyProfile.minTabs * 0.7));
          if (
            qa.stats.tabs < hardTabFloor ||
            qa.stats.missingMustHaveTabs > 0 ||
            qa.stats.charts < 1 ||
            qa.stats.formulas < Math.max(12, Math.floor(familyProfile.minFormulas * 0.35))
          ) {
            throw new Error(`OpenAI spec below factory floor: ${qa.issues.join(" | ")}`);
          }

          const rendered = await renderSpreadsheet(spec);
          const outputFileName = cleanFileName(spec.workbook.title || blueprint.sourceListingTitle || projectName);
          const asset = storeAsset(projectId, rendered.buffer, outputFileName, "product");

          if (factoryRunId) {
            updateFactoryRun(factoryRunId, { projectId, status: "generating" });
          }

          return NextResponse.json({
            success: true,
            projectId,
            assetId: asset.id,
            fileName: asset.fileName,
            fileSizeBytes: asset.fileSizeBytes,
            downloadUrl: asset.downloadUrl,
            gwsEnhanced: false,
            builderPath: "openai-spec-renderer",
            premiumNiche,
            spreadsheetFamily: {
              id: familyProfile.id,
              label: familyProfile.label,
              targetTabs: familyProfile.targetTabs,
              competitorDeclaredTabs: competitorTabHints.declaredTabCount || undefined,
            },
            openAiModel: modelUsed,
            specElapsedMs: elapsedMs,
            renderStats: rendered.stats,
            quality: {
              ok: qa.ok,
              warnings: qa.issues,
              ...qa.stats,
            },
            tabCount: spec.tabs.length,
            matchedCompetitorFeatures: competitorFeatures
              ? {
                  detectedTabs: competitorFeatures.detectedTabs.length,
                  chartTypes: competitorFeatures.chartTypes,
                  uniqueWidgets: competitorFeatures.uniqueWidgets.length,
                  confidence: competitorFeatures.confidence,
                }
              : undefined,
          });
        } catch (openAiErr) {
          const msg = openAiErr instanceof Error ? openAiErr.message : "unknown error";
          console.error("[Build Product] OpenAI spec builder failed:", msg);
          if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json(
              { error: `OpenAI spreadsheet builder failed: ${msg}` },
              { status: 500 },
            );
          }
          console.warn("[Build Product] Falling back to Gemini legacy builder");
        }
      } else if (!process.env.GEMINI_API_KEY) {
        return NextResponse.json(
          { error: "OPENAI_API_KEY is not configured. Add it to .env.local to use the premium spreadsheet builder." },
          { status: 500 },
        );
      }

      if (!process.env.GEMINI_API_KEY) {
        return NextResponse.json(
          { error: "GEMINI_API_KEY is not configured for the legacy fallback." },
          { status: 500 },
        );
      }

      // Detect format from keyword/title (default: xlsx)
      const lower = `${keyword} ${blueprint.sourceListingTitle || ""}`.toLowerCase();
      let format: "xlsx" | "docx" | "csv" = "xlsx";
      if (/\b(doc|docx|word|notion|template doc|guide|ebook|workbook)\b/.test(lower) && !/spreadsheet|tracker|budget|sheet/.test(lower)) {
        format = "docx";
      }

      console.log(`[Build Product] Gemini builder — keyword "${keyword}" niche "${premiumNiche}" format "${format}"`);

      try {
        const geminiResp = await fetch(new URL("/api/factory/gemini-build", req.url), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword, niche: premiumNiche, format, factoryRunId }),
        });

        if (!geminiResp.ok) {
          const errText = await geminiResp.text().catch(() => "");
          console.error("[Build Product] Gemini builder failed:", errText.slice(0, 300));
          return NextResponse.json(
            { error: `Gemini builder failed: ${errText.slice(0, 200) || "unknown error"}` },
            { status: 500 }
          );
        }

        const geminiData = await geminiResp.json() as {
          success: boolean;
          downloadUrl?: string;
          assetId?: string;
          fileName?: string;
          fileSizeBytes?: number;
          productName?: string;
          tabCount?: number;
          format?: string;
          error?: string;
          variants?: Array<{
            key: string;
            label: string;
            fileName: string;
            fileSizeBytes: number;
            downloadUrl?: string;
            assetId?: string;
          }>;
        };

        if (!geminiData.success || !geminiData.downloadUrl) {
          return NextResponse.json(
            { error: geminiData.error || "Gemini builder returned no file" },
            { status: 500 }
          );
        }

        if (factoryRunId) {
          updateFactoryRun(factoryRunId, { projectId, status: "generating" });
        }

        return NextResponse.json({
          success: true,
          projectId,
          assetId: geminiData.assetId,
          fileName: geminiData.fileName || fileName,
          fileSizeBytes: geminiData.fileSizeBytes,
          downloadUrl: geminiData.downloadUrl,
          gwsEnhanced: false,
          builderPath: "gemini-exceljs",
          premiumNiche,
          geminiProductName: geminiData.productName,
          tabCount: geminiData.tabCount,
          format: geminiData.format ?? format,
          variants: geminiData.variants ?? [],
        });
      } catch (geminiErr) {
        const msg = geminiErr instanceof Error ? geminiErr.message : "unknown error";
        console.error("[Build Product] Gemini builder threw:", msg);
        return NextResponse.json(
          { error: `Gemini builder error: ${msg}` },
          { status: 500 }
        );
      }
    }

    // ── 5. Notion path (only non-sheets products reach here) ──

    const {
      url: notionUrl,
      body: notionBody,
    } = getGeneratorEndpoint(config);

    const notionResp = await fetch(new URL(notionUrl, req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notionBody),
    });

    if (!notionResp.ok) {
      throw new Error("Notion template generation failed");
    }

    const notionData = await notionResp.json();

    if (factoryRunId) {
      updateFactoryRun(factoryRunId, {
        projectId,
        status: "generating",
      });
    }

    return NextResponse.json({
      success: true,
      projectId,
      pageId: notionData.pageId,
      pageUrl: notionData.pageUrl,
      gwsEnhanced: false,
      builderPath: "notion",
    });
  } catch (err) {
    console.error("[Build Product]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Build failed" },
      { status: 500 }
    );
  }
}
