// ══════════════════════════════════════════════════════════════
// Digital Product Studio: Unified Publish API
// POST — Publish a digital product to Etsy as a digital download
//
// Flow:
// 1. Create draft listing on Etsy (is_digital: true)
// 2. Upload product file as digital download
// 3. Upload mockup images as listing photos
// 4. Optionally activate the listing
//
// Requires Etsy OAuth tokens in the database.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import {
  createDigitalListing,
  uploadListingFile,
  uploadListingImage,
  activateListing,
} from "@/lib/etsy-client";
import {
  getDigitalProject,
  saveDigitalProject,
} from "@/lib/db";
import { readAssetBuffer, listAssets } from "@/lib/digital-asset-storage";
import type { DigitalProduct, DigitalPublishState } from "@/types/digital-product";

// ── Taxonomy mapping for digital product types ──────────────

const DIGITAL_TAXONOMY_MAP: Record<string, number> = {
  // Notion templates → Digital Planners & Organizers
  notion: 2532,
  // PDF planners → Printable Planners
  pdf: 2078,
  // Excel trackers → Spreadsheets
  excel: 2078,
  // Printables → Digital Prints
  printable: 2078,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      projectId,
      autoActivate = false,
    } = body as {
      projectId: string;
      autoActivate?: boolean;
    };

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing required field: projectId" },
        { status: 400 }
      );
    }

    // ── Load project from database ────────────────────────────

    const row = getDigitalProject(projectId);
    if (!row) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const listing = row.listing ? JSON.parse(row.listing) : null;
    if (!listing?.title || !listing?.description || listing.status !== "done") {
      return NextResponse.json(
        { error: "Listing package is not ready. Generate a listing first." },
        { status: 400 }
      );
    }

    // ── Get the main product asset ────────────────────────────

    const productAssets = listAssets(projectId, "product");
    if (productAssets.length === 0) {
      return NextResponse.json(
        { error: "No product file found. Generate the product first." },
        { status: 400 }
      );
    }

    const primaryAsset = productAssets[0];
    const productFile = readAssetBuffer(primaryAsset.id);
    if (!productFile) {
      return NextResponse.json(
        { error: "Product file not readable" },
        { status: 500 }
      );
    }

    // ── Step 1: Create draft listing on Etsy ──────────────────

    const taxonomyId = DIGITAL_TAXONOMY_MAP[row.product_type] || 2078;

    const { listing_id, url: listingUrl } = await createDigitalListing({
      title: listing.title,
      description: listing.description,
      price: listing.price.recommended || listing.price.min || 5,
      tags: listing.tags || [],
      taxonomy_id: taxonomyId,
    });

    // ── Step 2: Upload product file as digital download ───────

    await uploadListingFile(
      listing_id,
      productFile.buffer,
      primaryAsset.fileName
    );

    // ── Step 3: Upload mockup images ──────────────────────────

    const mockupAssets = listAssets(projectId, "mockup");
    for (let i = 0; i < Math.min(mockupAssets.length, 10); i++) {
      const mockupFile = readAssetBuffer(mockupAssets[i].id);
      if (mockupFile) {
        try {
          await uploadListingImage(
            listing_id,
            mockupFile.buffer,
            mockupAssets[i].fileName,
            i + 1
          );
        } catch (err) {
          console.warn(`[Digital Publish] Failed to upload mockup ${i + 1}:`, err);
          // Continue with remaining mockups
        }
      }
    }

    // ── Step 4: Optionally activate ───────────────────────────

    let etsyStatus: DigitalPublishState["etsyStatus"] = "draft";
    if (autoActivate) {
      try {
        await activateListing(listing_id);
        etsyStatus = "active";
      } catch (err) {
        console.warn("[Digital Publish] Failed to activate listing:", err);
        etsyStatus = "draft";
      }
    }

    // ── Update project with publish state ─────────────────────

    const publishState: DigitalPublishState = {
      platform: "etsy",
      etsyListingId: listing_id,
      etsyListingUrl: listingUrl,
      etsyStatus,
      publishedAt: new Date().toISOString(),
    };

    // Re-read current project data for safe merge
    const currentRow = getDigitalProject(projectId);
    if (currentRow) {
      saveDigitalProject({
        id: currentRow.id,
        project_name: currentRow.project_name,
        product_type: currentRow.product_type,
        status: etsyStatus === "active" ? "published" : "listing-ready",
        current_step: "publish",
        step_statuses: currentRow.step_statuses
          ? JSON.parse(currentRow.step_statuses)
          : undefined,
        inspiration: currentRow.inspiration
          ? JSON.parse(currentRow.inspiration)
          : undefined,
        config: currentRow.config
          ? JSON.parse(currentRow.config)
          : undefined,
        generation: currentRow.generation
          ? JSON.parse(currentRow.generation)
          : undefined,
        preview: currentRow.preview
          ? JSON.parse(currentRow.preview)
          : undefined,
        listing: currentRow.listing
          ? JSON.parse(currentRow.listing)
          : undefined,
        publish: publishState,
        quality_score: currentRow.quality_score
          ? JSON.parse(currentRow.quality_score)
          : undefined,
      });
    }

    return NextResponse.json({
      success: true,
      listingId: listing_id,
      listingUrl,
      etsyStatus,
      publishState,
    });
  } catch (err: unknown) {
    console.error("[Digital Publish] Error:", err);

    // Return specific error for missing Etsy connection
    const message = err instanceof Error ? err.message : "Failed to publish";
    const isAuthError =
      message.includes("No shop ID") ||
      message.includes("token") ||
      message.includes("reconnect");

    return NextResponse.json(
      {
        error: message,
        code: isAuthError ? "ETSY_NOT_CONNECTED" : "PUBLISH_FAILED",
      },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
