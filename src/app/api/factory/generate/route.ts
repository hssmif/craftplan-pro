// ══════════════════════════════════════════════════════════════
// Factory Engine 3: Generate API
// POST /api/factory/generate
// Takes a blueprint ID → generates the product → stores asset
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getFactoryBlueprint, updateFactoryRun } from "@/lib/db";
import { getGeneratorEndpoint, buildProjectName } from "@/lib/factory-generation";
import { generateGwsPlan, executeGwsPlan } from "@/lib/factory-gws-generator";
import type { DigitalProductConfig, SheetsConfig } from "@/types/digital-product";
import type { FactoryBlueprint, ProductBlueprint } from "@/types/factory";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { blueprintId, factoryRunId } = body;

    if (!blueprintId) {
      return NextResponse.json({ error: "Missing blueprintId" }, { status: 400 });
    }

    // Load blueprint from DB
    const raw = getFactoryBlueprint(blueprintId);
    if (!raw) {
      return NextResponse.json({ error: "Blueprint not found" }, { status: 404 });
    }

    const config = JSON.parse(raw.config as string) as DigitalProductConfig | SheetsConfig;
    const blueprint: FactoryBlueprint = {
      id: raw.id as string,
      factoryRunId: (raw.factory_run_id as string) || factoryRunId || "",
      sourceListingTitle: raw.source_listing_title as string,
      productType: raw.product_type as FactoryBlueprint["productType"],
      config,
      competitorStrengths: JSON.parse((raw.competitor_strengths as string) || "[]"),
      competitorWeaknesses: JSON.parse((raw.competitor_weaknesses as string) || "[]"),
      differentiation: JSON.parse((raw.differentiation_strategy as string) || "{}"),
      listingStrategy: { titleKeywords: [], positionAs: "premium", uniqueSellingPoints: [] },
      suggestedPrice: raw.suggested_price as number,
      positioning: raw.positioning as string,
      createdAt: raw.created_at as string,
    };

    const projectName = buildProjectName(blueprint);
    const useGws = body.useGws === true && "tabs" in blueprint;
    const { url, body: genBody, fileName } = getGeneratorEndpoint(config);

    // Map factory product types to digital_projects CHECK-constraint vocabulary.
    // factory_blueprints uses 'sheets' / 'google-sheets'; digital_projects only
    // accepts 'notion' | 'pdf' | 'excel' | 'printable'.
    const PROJECT_TYPE_MAP: Record<string, "notion" | "pdf" | "excel" | "printable"> = {
      sheets: "excel",
      "google-sheets": "excel",
      excel: "excel",
      pdf: "pdf",
      notion: "notion",
      printable: "printable",
    };
    const mappedProductType =
      PROJECT_TYPE_MAP[String(blueprint.productType).toLowerCase()] ?? "excel";

    // Create project first
    const projectId = `dp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const project = {
      id: projectId,
      projectName: projectName,
      productType: mappedProductType,
      status: "draft",
      currentStep: "generate",
      stepStatuses: { discover: "done", configure: "done", generate: "idle", preview: "idle", listing: "idle", publish: "idle" },
      inspiration: { source: "auto", keyword: blueprint.listingStrategy.titleKeywords.join(" "), niche: blueprint.positioning },
      config,
      generation: { status: "idle", result: null },
      preview: { mockups: [], mockupStatus: "idle" },
      listing: { title: "", description: "", tags: [], price: { min: 0, max: 0, recommended: 0 }, faqs: [], mockupIdeas: [], status: "idle" },
      publish: { platform: "none", etsyStatus: "unpublished" },
      qualityScore: null,
      batchMeta: null,
      importSource: { type: "api", importedAt: now },
      createdAt: now,
      updatedAt: now,
    };

    // Save project to DB
    const saveResp = await fetch(new URL("/api/digital/projects", req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project }),
    });
    if (!saveResp.ok) {
      throw new Error("Failed to create project in DB");
    }

    // ── GWS NATIVE PATH ──
    // If the blueprint has full tab definitions and useGws is true,
    // create a native Google Sheet via GWS CLI instead of ExcelJS
    if (useGws && config.type === "sheets" && (blueprint as ProductBlueprint).tabs?.length > 0) {
      const gwsPlan = generateGwsPlan(blueprint as ProductBlueprint);
      const baseUrl = new URL(req.url).origin;
      const gwsResult = await executeGwsPlan(gwsPlan, baseUrl);

      if (gwsResult.success && gwsResult.spreadsheetId) {
        if (factoryRunId) {
          updateFactoryRun(factoryRunId, {
            projectId,
            googleSheetId: gwsResult.spreadsheetId,
            status: "generating",
          });
        }

        return NextResponse.json({
          success: true,
          projectId,
          spreadsheetId: gwsResult.spreadsheetId,
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${gwsResult.spreadsheetId}/edit`,
          gwsEnhanced: true,
          gwsPlan: { totalCommands: gwsPlan.totalCommands, phases: gwsPlan.phases.map(p => p.name) },
        });
      }

      // GWS failed — fall through to ExcelJS path
      console.warn("[Factory Generate] GWS path failed, falling back to ExcelJS:", gwsResult.error);
    }

    // ── EXCELJS FALLBACK PATH ──
    // Call the generator
    const genResp = await fetch(new URL(url, req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(genBody),
    });

    if (!genResp.ok) {
      const errData = await genResp.json().catch(() => ({ error: "Generation failed" }));
      throw new Error(errData.error || `${blueprint.productType} generation failed`);
    }

    // For file-based products: upload the blob as an asset
    if (config.type !== "notion") {
      const blob = await genResp.blob();
      const formData = new FormData();
      formData.append("file", blob, fileName);
      formData.append("projectId", projectId);
      formData.append("fileName", fileName);
      formData.append("assetType", "product");

      const uploadResp = await fetch(new URL("/api/digital/assets", req.url), {
        method: "POST",
        body: formData,
      });

      if (!uploadResp.ok) {
        throw new Error("Failed to upload generated file");
      }

      const assetData = await uploadResp.json();
      const asset = assetData.asset;

      // Update factory run
      if (factoryRunId) {
        updateFactoryRun(factoryRunId, {
          projectId,
          status: "generating",
        });
      }

      return NextResponse.json({
        success: true,
        projectId,
        assetId: asset.id,
        fileName: asset.fileName,
        downloadUrl: asset.downloadUrl,
        fileSizeBytes: asset.fileSizeBytes,
        mimeType: asset.mimeType,
        gwsEnhanced: false,
      });
    }

    // For Notion: return the build result directly
    const notionData = await genResp.json();
    return NextResponse.json({
      success: true,
      projectId,
      pageId: notionData.pageId,
      pageUrl: notionData.pageUrl,
      gwsEnhanced: false,
    });

  } catch (err) {
    console.error("[Factory Generate]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
