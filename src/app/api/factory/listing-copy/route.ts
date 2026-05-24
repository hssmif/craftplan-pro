// ══════════════════════════════════════════════════════════════
// Factory Engine 5: Listing Copy API
// POST /api/factory/listing-copy
// Takes blueprint + optional image plan → returns ListingCopyPackage
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getFactoryBlueprint, getFactoryRun, updateFactoryRun } from "@/lib/db";
import { generateListingCopy } from "@/lib/factory-listing-copy";
import type { ProductBlueprint, ListingImagePlan } from "@/types/factory";
import type { DigitalProductConfig } from "@/types/digital-product";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { blueprintId, factoryRunId } = body;

    if (!blueprintId) {
      return NextResponse.json({ error: "Missing blueprintId" }, { status: 400 });
    }

    // Load blueprint
    const raw = getFactoryBlueprint(blueprintId);
    if (!raw) {
      return NextResponse.json({ error: "Blueprint not found" }, { status: 404 });
    }

    const config = JSON.parse(raw.config as string) as DigitalProductConfig;
    const blueprint: ProductBlueprint = {
      id: raw.id as string,
      factoryRunId: (raw.factory_run_id as string) || factoryRunId || "",
      sourceListingTitle: raw.source_listing_title as string,
      productType: raw.product_type as ProductBlueprint["productType"],
      config,
      competitorStrengths: JSON.parse((raw.competitor_strengths as string) || "[]"),
      competitorWeaknesses: JSON.parse((raw.competitor_weaknesses as string) || "[]"),
      differentiation: JSON.parse((raw.differentiation_strategy as string) || "{}"),
      listingStrategy: JSON.parse((raw.differentiation_strategy as string) || "{}").listingStrategy || { titleKeywords: [], positionAs: "premium", uniqueSellingPoints: [] },
      suggestedPrice: raw.suggested_price as number,
      positioning: raw.positioning as string,
      createdAt: raw.created_at as string,
      tabs: JSON.parse((raw.tabs as string) || "[]"),
      charts: JSON.parse((raw.charts as string) || "[]"),
      colorScheme: JSON.parse((raw.color_scheme as string) || '{"primary":"#1B3A5C","secondary":"#2C5282","accent":"#D4AF37","background":"#0C1222","text":"#DEE4EB","success":"#22C55E","danger":"#EF4444"}'),
      sampleDataStrategy: (raw.sample_data as string) || "",
      deliveryMethod: (raw.delivery_method as string as ProductBlueprint["deliveryMethod"]) || "both",

      // Gemini-first spec chain fields
      ...(raw.concept_spec ? { conceptSpec: JSON.parse(raw.concept_spec as string) } : {}),
      ...(raw.structure_spec ? { structureSpec: JSON.parse(raw.structure_spec as string) } : {}),
      ...(raw.visual_direction ? { visualDirection: JSON.parse(raw.visual_direction as string) } : {}),
      ...(raw.video_direction ? { videoDirection: JSON.parse(raw.video_direction as string) } : {}),
      ...(raw.listing_positioning ? { listingPositioning: JSON.parse(raw.listing_positioning as string) } : {}),
      ...(raw.copy_direction ? { copyDirection: JSON.parse(raw.copy_direction as string) } : {}),
    };

    // Load image plan if available
    let imagePlan: ListingImagePlan | undefined;
    if (factoryRunId) {
      const run = getFactoryRun(factoryRunId);
      if (run?.image_plan) {
        imagePlan = JSON.parse(run.image_plan as string);
      }
    }

    // Generate listing copy
    const runId = factoryRunId || `fr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const copyPackage = await generateListingCopy(blueprint, runId, imagePlan);

    // Store on factory run
    if (factoryRunId) {
      updateFactoryRun(factoryRunId, {
        listingCopy: JSON.stringify(copyPackage),
      });
    }

    return NextResponse.json({
      success: true,
      listing: copyPackage,
    });
  } catch (err) {
    console.error("[Factory Listing Copy]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Listing copy generation failed" },
      { status: 500 }
    );
  }
}
