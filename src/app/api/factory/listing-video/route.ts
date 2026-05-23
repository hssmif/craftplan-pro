// ══════════════════════════════════════════════════════════════
// Factory Engine: Listing Video API
//
// POST /api/factory/listing-video
//   { blueprintId, factoryRunId }
//   → Generates a product walkthrough video using Playwright
//   → Returns video path and metadata
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getFactoryBlueprint, getFactoryRun } from "@/lib/db";
import { generateProductVideo } from "@/lib/factory-video-engine";
import { generateGeminiVideo } from "@/lib/gemini-video-generator";
import { resolveNicheProfile } from "@/lib/factory-niche-themes";
import type { ProductBlueprint } from "@/types/factory";
import type { DigitalProductConfig } from "@/types/digital-product";

function reconstructBlueprint(
  raw: Record<string, unknown>,
  factoryRunId: string,
): ProductBlueprint {
  const config = JSON.parse(raw.config as string) as DigitalProductConfig;
  const differentiation = JSON.parse(
    (raw.differentiation_strategy as string) || "{}",
  );

  return {
    id: raw.id as string,
    factoryRunId: (raw.factory_run_id as string) || factoryRunId || "",
    sourceListingTitle: raw.source_listing_title as string,
    productType: raw.product_type as ProductBlueprint["productType"],
    config,
    competitorStrengths: JSON.parse((raw.competitor_strengths as string) || "[]"),
    competitorWeaknesses: JSON.parse((raw.competitor_weaknesses as string) || "[]"),
    differentiation,
    listingStrategy: differentiation.listingStrategy || {
      titleKeywords: [],
      positionAs: "premium",
      uniqueSellingPoints: [],
    },
    suggestedPrice: raw.suggested_price as number,
    positioning: raw.positioning as string,
    createdAt: raw.created_at as string,
    tabs: JSON.parse((raw.tabs as string) || "[]"),
    charts: JSON.parse((raw.charts as string) || "[]"),
    colorScheme: JSON.parse(
      (raw.color_scheme as string) ||
        '{"primary":"#1B3A5C","secondary":"#2C5282","accent":"#D4AF37","background":"#FFFFFF","text":"#2D3436","success":"#22C55E","danger":"#EF4444"}',
    ),
    sampleDataStrategy: (raw.sample_data as string) || "",
    deliveryMethod: ((raw.delivery_method as string) || "xlsx_download") as "xlsx_download" | "sheets_link" | "both",

    // Gemini-first spec chain fields
    ...(raw.concept_spec ? { conceptSpec: JSON.parse(raw.concept_spec as string) } : {}),
    ...(raw.structure_spec ? { structureSpec: JSON.parse(raw.structure_spec as string) } : {}),
    ...(raw.visual_direction ? { visualDirection: JSON.parse(raw.visual_direction as string) } : {}),
    ...(raw.video_direction ? { videoDirection: JSON.parse(raw.video_direction as string) } : {}),
    ...(raw.listing_positioning ? { listingPositioning: JSON.parse(raw.listing_positioning as string) } : {}),
    ...(raw.copy_direction ? { copyDirection: JSON.parse(raw.copy_direction as string) } : {}),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { blueprintId, factoryRunId, useGemini = true } = body;

    if (!blueprintId) {
      return NextResponse.json(
        { success: false, error: "Missing blueprintId" },
        { status: 400 },
      );
    }

    // Fetch blueprint
    const rawBlueprint = getFactoryBlueprint(blueprintId);
    if (!rawBlueprint) {
      return NextResponse.json(
        { success: false, error: `Blueprint ${blueprintId} not found` },
        { status: 404 },
      );
    }

    const blueprint = reconstructBlueprint(rawBlueprint, factoryRunId);

    // Resolve niche profile — use sourceListingTitle for keyword matching (contains
    // niche words like "baby", "wedding", "business") then fall back to sheetsType
    const config = blueprint.config as { sheetsType?: string; niche?: string; colorScheme?: unknown };
    const nicheStr =
      config.niche ||
      blueprint.sourceListingTitle ||
      (config.sheetsType as string) ||
      "budget_tracker";
    const nicheProfile = resolveNicheProfile(nicheStr, blueprint.colorScheme);

    // Generate video — try Gemini-enhanced first, fall back to Playwright
    const runId = factoryRunId || `fr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const outputDir = `/tmp/factory-video/${runId}`;

    if (useGemini) {
      try {
        console.log("[listing-video] Generating Gemini-enhanced video...");
        const geminiResult = await generateGeminiVideo(blueprint, nicheProfile, {
          width: 1080,
          height: 1080,
          outputDir,
        });

        return NextResponse.json({
          success: true,
          video: {
            path: geminiResult.videoPath,
            durationSec: geminiResult.durationSec,
            fileSizeKB: Math.round(geminiResult.fileSizeBytes / 1024),
            sceneCount: geminiResult.frameCount,
            source: geminiResult.source,
          },
        });
      } catch (err) {
        console.warn("[listing-video] Gemini video failed, falling back to Playwright:", err);
      }
    }

    // Fallback: Playwright recording video
    const result = await generateProductVideo(blueprint, nicheProfile, {
      width: 1080,
      height: 1080,
      overlays: true,
      outputDir,
    });

    return NextResponse.json({
      success: true,
      video: {
        path: result.videoPath,
        durationSec: result.durationSec,
        fileSizeKB: Math.round(result.fileSizeBytes / 1024),
        sceneCount: result.sceneCount,
        source: "playwright",
      },
    });
  } catch (error) {
    console.error("Video generation error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Video generation failed",
      },
      { status: 500 },
    );
  }
}
