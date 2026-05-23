// ══════════════════════════════════════════════════════════════
// Factory Engine 2: Blueprint API
// POST /api/factory/blueprint
// Takes competitor listing data → returns improved product spec
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { generateBlueprint, type CompetitorData } from "@/lib/factory-blueprint";
import {
  scanCompetitor,
  type CompetitorFeatures,
} from "@/lib/factory-competitor-scan";
import { createFactoryBlueprint } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const competitor: CompetitorData = {
      title: body.title || "",
      tags: body.tags || [],
      price: body.price || 10,
      description: body.description,
      reviews: body.reviews,
      rating: body.rating,
      revenueEstimate: body.revenueEstimate,
      niche: body.niche,
      ideaContext: body.ideaContext,
      marketContext: body.marketContext,
    };

    if (!competitor.title) {
      return NextResponse.json({ error: "Missing competitor title" }, { status: 400 });
    }

    const factoryRunId = body.factoryRunId || `fr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // ── Engine 1.5: Competitor Deep Scan ──────────────────────
    // If the caller (Research → Build This) provided real
    // listing photos, Gemini Vision extracts a feature manifest
    // that becomes a must-match-or-beat checklist for the
    // blueprint generator. No photos → graceful degradation
    // (today's behavior, Gemini guesses from title/tags).
    const imageUrls: string[] = Array.isArray(body.imageUrls)
      ? body.imageUrls.filter((s: unknown): s is string => typeof s === "string")
      : [];

    let competitorFeatures: CompetitorFeatures | undefined;
    if (imageUrls.length > 0) {
      console.log(
        `[Factory Blueprint] Engine 1.5: scanning ${imageUrls.length} competitor photo(s)…`,
      );
      const scanStart = Date.now();
      competitorFeatures = await scanCompetitor({
        listingId: body.listingId || `unknown-${factoryRunId}`,
        title: competitor.title,
        description: competitor.description,
        tags: competitor.tags,
        price: competitor.price,
        imageUrls,
      });
      console.log(
        `[Factory Blueprint] Engine 1.5: scan done in ${Date.now() - scanStart}ms — ` +
          `${competitorFeatures.detectedTabs.length} tabs, ` +
          `${competitorFeatures.chartTypes.length} chart types, ` +
          `${competitorFeatures.uniqueWidgets.length} unique widgets, ` +
          `confidence ${(competitorFeatures.confidence * 100).toFixed(0)}%`,
      );
    }

    const blueprint = await generateBlueprint(
      competitor,
      factoryRunId,
      competitorFeatures,
    );

    // Persist to DB (including ProductBlueprint fields)
    createFactoryBlueprint({
      id: blueprint.id,
      factoryRunId: blueprint.factoryRunId,
      opportunityId: blueprint.opportunityId,
      sourceListingTitle: blueprint.sourceListingTitle,
      sourceListingDescription: competitor.description,
      productType: blueprint.productType,
      config: JSON.stringify(blueprint.config),
      competitorStrengths: JSON.stringify(blueprint.competitorStrengths),
      competitorWeaknesses: JSON.stringify(blueprint.competitorWeaknesses),
      competitorFeatures: competitorFeatures ? JSON.stringify(competitorFeatures) : undefined,
      differentiationStrategy: JSON.stringify(blueprint.differentiation),
      listingStrategy: JSON.stringify(blueprint.listingStrategy),
      suggestedPrice: blueprint.suggestedPrice,
      positioning: blueprint.positioning,
      tabs: JSON.stringify(blueprint.tabs),
      charts: JSON.stringify(blueprint.charts),
      colorScheme: JSON.stringify(blueprint.colorScheme),
      sampleData: blueprint.sampleDataStrategy,
      deliveryMethod: blueprint.deliveryMethod,
      conceptSpec: blueprint.conceptSpec ? JSON.stringify(blueprint.conceptSpec) : undefined,
      structureSpec: blueprint.structureSpec ? JSON.stringify(blueprint.structureSpec) : undefined,
      visualDirection: blueprint.visualDirection ? JSON.stringify(blueprint.visualDirection) : undefined,
      videoDirection: blueprint.videoDirection ? JSON.stringify(blueprint.videoDirection) : undefined,
      listingPositioning: blueprint.listingPositioning ? JSON.stringify(blueprint.listingPositioning) : undefined,
      copyDirection: blueprint.copyDirection ? JSON.stringify(blueprint.copyDirection) : undefined,
    });

    return NextResponse.json({
      success: true,
      blueprint,
    });
  } catch (err) {
    console.error("[Factory Blueprint]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Blueprint generation failed" },
      { status: 500 }
    );
  }
}
