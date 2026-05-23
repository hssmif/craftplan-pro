// ── Auto-List Pipeline (Full Server-Side) ─────────────────
// Direct Etsy API listing creation — like the eBay extension approach.
// All 6 steps happen server-side, no browser extension needed.
//
//   1. Upload design to Printful file library (for fulfillment)
//   2. Generate product mockups via Printful API
//   3. Create Etsy draft listing via Etsy API
//   4. Upload images to Etsy listing (mockups + design)
//   5. Activate listing on Etsy
//   6. Return listing URL + details

import {
  uploadFile,
  getDefaultVariants,
  createMockupTask,
  getMockupTaskResult,
} from "./printful-client";
import {
  createPODListing,
  uploadListingImage,
  activateListing,
  getShippingProfiles,
} from "./etsy-client";

// ── Types ──

export interface AutoListInput {
  designBase64: string;        // PNG base64 (with or without data: prefix)
  designText: string;          // The phrase/text on the design
  keyword: string;             // Niche keyword
  metadata: {
    title: string;
    tags: string[];
    description: string;
  };
  productId?: number;          // Printful catalog product ID (default: 71 = T-Shirt)
  markupPercent?: number;      // Markup percentage (default: 40)
  autoActivate?: boolean;      // Publish immediately (default: true)
}

export interface PipelineStep {
  step: number;
  totalSteps: number;
  status: "running" | "done" | "error" | "skipped";
  label: string;
  detail?: string;
  error?: string;
}

export interface PipelineResult {
  // Printful
  printfulFileId: number;
  printfulFileUrl: string;
  mockupUrls: string[];
  retailPrice: number;
  variantCount: number;
  variantIds: number[];
  // Etsy
  etsyListingId: number;
  etsyListingUrl: string;
  etsyStatus: "draft" | "active";
  // Product info
  productTitle: string;
  productId: number;
}

export type ProgressCallback = (step: PipelineStep, result?: PipelineResult) => void;

const TOTAL_STEPS = 5;

function emitStep(
  cb: ProgressCallback,
  step: number,
  status: PipelineStep["status"],
  label: string,
  detail?: string,
  error?: string,
  result?: PipelineResult
) {
  cb({ step, totalSteps: TOTAL_STEPS, status, label, detail, error }, result);
}

// ── Main Pipeline ──

export async function runAutoListPipeline(
  printfulToken: string,
  input: AutoListInput,
  onProgress: ProgressCallback
): Promise<PipelineResult> {
  const productId = input.productId || 71;
  const markupPercent = input.markupPercent || 40;
  const autoActivate = input.autoActivate !== false; // default true

  const result: PipelineResult = {
    printfulFileId: 0,
    printfulFileUrl: "",
    mockupUrls: [],
    retailPrice: 0,
    variantCount: 0,
    variantIds: [],
    etsyListingId: 0,
    etsyListingUrl: "",
    etsyStatus: "draft",
    productTitle: input.metadata.title,
    productId,
  };

  // ── Step 1: Upload design to Printful file library ──
  emitStep(onProgress, 1, "running", "Uploading design to Printful");

  let fileUrl: string;
  let designBase64Clean = input.designBase64;

  try {
    const fileName = `design-${input.keyword.replace(/\s+/g, "-")}-${Date.now()}.png`;
    const uploadResult = await uploadFile(printfulToken, input.designBase64, fileName);
    result.printfulFileId = uploadResult.id;
    result.printfulFileUrl = uploadResult.url;
    fileUrl = uploadResult.url;
    emitStep(onProgress, 1, "done", "Design uploaded to Printful", `File ID: ${uploadResult.id}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    emitStep(onProgress, 1, "error", "Failed to upload design", undefined, msg);
    throw new Error(`Step 1 failed: ${msg}`);
  }

  // ── Step 2: Generate mockups ──
  emitStep(onProgress, 2, "running", "Generating product mockups");

  try {
    const { variantIds, retailPrices } = await getDefaultVariants(
      printfulToken,
      productId,
      markupPercent
    );

    result.variantCount = variantIds.length;
    result.variantIds = variantIds;
    const firstPrice = Object.values(retailPrices)[0];
    if (firstPrice) result.retailPrice = firstPrice;

    // Use first 3 variants for mockup preview
    const mockupVariants = variantIds.slice(0, 3);

    const task = await createMockupTask(
      printfulToken,
      productId,
      mockupVariants,
      fileUrl,
      "front"
    );

    // Poll for mockup completion (max 60s)
    const maxPolls = 20;
    let pollCount = 0;
    let mockupResult = await getMockupTaskResult(printfulToken, task.task_key);

    while (mockupResult.status === "pending" && pollCount < maxPolls) {
      await new Promise((r) => setTimeout(r, 3000));
      mockupResult = await getMockupTaskResult(printfulToken, task.task_key);
      pollCount++;
    }

    if (mockupResult.status === "completed" && mockupResult.mockups?.length) {
      result.mockupUrls = mockupResult.mockups.map((m) => m.mockup_url);
      emitStep(onProgress, 2, "done", "Mockups generated", `${result.mockupUrls.length} mockup images`);
    } else {
      emitStep(onProgress, 2, "skipped", "Mockup generation timed out", "Will use design image instead");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Mockup generation failed";
    console.warn("[Auto-List] Mockup generation failed (non-fatal):", msg);
    emitStep(onProgress, 2, "skipped", "Mockup generation failed", "Will use design image instead");
  }

  // ── Step 3: Create Etsy draft listing via API ──
  emitStep(onProgress, 3, "running", "Creating Etsy listing");

  try {
    // Get shipping profile for POD listings
    let shippingProfileId: number | undefined;
    try {
      const profiles = await getShippingProfiles();
      if (profiles.length > 0) {
        shippingProfileId = profiles[0].shipping_profile_id;
      }
    } catch {
      console.warn("[Auto-List] Could not get shipping profiles, will try without");
    }

    const etsyResult = await createPODListing({
      title: input.metadata.title.substring(0, 140),
      description: input.metadata.description,
      price: result.retailPrice || 24.99,
      tags: input.metadata.tags.slice(0, 13),
      quantity: 999,
      taxonomy_id: 482, // Clothing > Shirts & Tees
      shippingProfileId,
    });

    result.etsyListingId = etsyResult.listing_id;
    result.etsyListingUrl = etsyResult.url || `https://www.etsy.com/listing/${etsyResult.listing_id}`;
    result.etsyStatus = "draft";

    emitStep(onProgress, 3, "done", "Etsy listing created", `Listing ID: ${etsyResult.listing_id}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create Etsy listing";
    emitStep(onProgress, 3, "error", "Failed to create Etsy listing", undefined, msg);
    throw new Error(`Step 3 failed: ${msg}`);
  }

  // ── Step 4: Upload images to Etsy listing ──
  emitStep(onProgress, 4, "running", "Uploading images to listing");

  try {
    let imagesUploaded = 0;

    // Upload mockup images first (best-looking product photos)
    for (let i = 0; i < result.mockupUrls.length && i < 9; i++) {
      try {
        const mockupResp = await fetch(result.mockupUrls[i]);
        if (mockupResp.ok) {
          const mockupArrayBuffer = await mockupResp.arrayBuffer();
          const mockupBuffer = Buffer.from(mockupArrayBuffer);
          await uploadListingImage(
            result.etsyListingId,
            mockupBuffer,
            `mockup-${i + 1}.jpg`,
            i + 1
          );
          imagesUploaded++;
          emitStep(onProgress, 4, "running", "Uploading images to listing", `${imagesUploaded} images uploaded`);
        }
      } catch (imgErr) {
        console.warn(`[Auto-List] Mockup image ${i + 1} upload failed:`, imgErr);
      }
      // Small delay between uploads to avoid rate limits
      await new Promise((r) => setTimeout(r, 300));
    }

    // Upload original design image as last image
    try {
      // Strip data URL prefix if present
      designBase64Clean = input.designBase64.replace(/^data:image\/\w+;base64,/, "");
      const designBuffer = Buffer.from(designBase64Clean, "base64");
      await uploadListingImage(
        result.etsyListingId,
        designBuffer,
        `design-${input.keyword.replace(/\s+/g, "-")}.png`,
        imagesUploaded + 1
      );
      imagesUploaded++;
    } catch (designImgErr) {
      console.warn("[Auto-List] Design image upload failed:", designImgErr);
    }

    if (imagesUploaded > 0) {
      emitStep(onProgress, 4, "done", "Images uploaded to listing", `${imagesUploaded} images`);
    } else {
      emitStep(onProgress, 4, "skipped", "No images could be uploaded", "Listing created without images");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Image upload failed";
    console.warn("[Auto-List] Image upload step failed (non-fatal):", msg);
    emitStep(onProgress, 4, "skipped", "Image upload failed", "Listing created without images");
  }

  // ── Step 5: Activate listing on Etsy ──
  if (autoActivate) {
    emitStep(onProgress, 5, "running", "Publishing listing on Etsy");

    try {
      await activateListing(result.etsyListingId);
      result.etsyStatus = "active";
      emitStep(onProgress, 5, "done", "Listing published on Etsy!", `View at: ${result.etsyListingUrl}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to activate listing";
      console.warn("[Auto-List] Activation failed (listing remains as draft):", msg);
      emitStep(onProgress, 5, "skipped", "Could not activate listing", `Saved as draft — ${msg}`);
    }
  } else {
    emitStep(onProgress, 5, "skipped", "Listing saved as draft", "Auto-activate is off");
  }

  return result;
}
