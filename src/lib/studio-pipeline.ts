// ── Studio Pipeline: Printful-First Publish Orchestrator ──
// Processes designs[] × products[] via Printful as the primary publishing engine.
// Each design goes through: Upload → Create Product → Mockups → Ready
// Printful pushes products to the connected store (Etsy) via its official integration.
// Auth: Bearer ${process.env.PRINTFUL_API_KEY}
// Progress streamed via callback for SSE.

import {
  uploadFile,
  getDefaultVariants,
  createAndPushProduct,
  createMockupTask,
  getMockupTaskResult,
  detectStoreType,
  type PrintfulStoreType,
} from "./printful-client";

// ── Types ──

export interface StudioPublishInput {
  designs: Array<{
    id: string;
    dataUrl: string;          // Base64 PNG
    phrase: string;           // Design text
    imageUrl?: string;        // For graphic mode (public URL)
  }>;
  products: Array<{
    catalogProductId: number;
    productName: string;
    markupPercent: number;
    taxonomyId: number;
  }>;
  listings: Array<{
    designId: string;
    title: string;
    description: string;
    tags: string[];
    price: number;
    taxonomyId: number;
  }>;
  keyword: string;
}

export interface StudioProgressEvent {
  type: "design-start" | "step" | "design-done" | "pipeline-done" | "error";
  designId: string;
  designIndex: number;
  totalDesigns: number;
  step?: number;
  totalSteps?: number;
  label: string;
  detail?: string;
  status: "running" | "done" | "error" | "skipped";
  // Result data (populated as steps complete)
  printfulFileId?: number;
  printfulFileUrl?: string;
  syncProductId?: number;
  pushed?: boolean;
  pushError?: string;
  mockupUrls?: string[];
  error?: string;
  // Store metadata (sent once at pipeline start)
  storeType?: PrintfulStoreType;
  storeName?: string;
}

export type StudioProgressCallback = (event: StudioProgressEvent) => void;

const STEPS_PER_DESIGN = 4;

// ── Main Pipeline ──

export async function runStudioPublishPipeline(
  printfulToken: string,
  input: StudioPublishInput,
  onProgress: StudioProgressCallback
): Promise<void> {
  const { designs, products, listings, keyword } = input;
  const totalDesigns = designs.length;

  // Get primary product (first enabled product)
  const primaryProduct = products[0];
  if (!primaryProduct) {
    onProgress({
      type: "error",
      designId: "",
      designIndex: 0,
      totalDesigns,
      label: "No products configured",
      status: "error",
      error: "At least one product must be enabled",
    });
    return;
  }

  // ── Pre-flight: Detect store type & validate auth ──
  let storeType: PrintfulStoreType = "UNKNOWN";
  let storeName = "Printful";

  try {
    const detection = await detectStoreType(printfulToken);
    storeType = detection.storeType;
    storeName = detection.storeName;

    console.log(`[Studio Pipeline] Store: ${storeName} (${storeType})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";

    // Provide actionable error messages
    let detail = msg;
    if (msg.includes("401") || msg.includes("Unauthorized")) {
      detail = "Authentication failed. Check your PRINTFUL_API_KEY in .env.local";
    } else if (msg.includes("403") || msg.includes("Forbidden")) {
      detail = "API token lacks required permissions. Generate a new token with full scope in Printful Dashboard";
    } else if (msg.includes("fetch") || msg.includes("network")) {
      detail = "Cannot reach Printful API. Check your internet connection";
    }

    onProgress({
      type: "error",
      designId: "",
      designIndex: 0,
      totalDesigns,
      label: "Printful authentication failed",
      status: "error",
      error: detail,
    });
    return;
  }

  for (let di = 0; di < designs.length; di++) {
    const design = designs[di];
    const listing = listings.find((l) => l.designId === design.id);
    if (!listing) continue;

    onProgress({
      type: "design-start",
      designId: design.id,
      designIndex: di,
      totalDesigns,
      label: `Starting design ${di + 1}/${totalDesigns}`,
      detail: design.phrase,
      status: "running",
      storeType,
      storeName,
    });

    let printfulFileId = 0;
    let printfulFileUrl = "";
    let syncProductId = 0;
    let pushed = false;
    let pushError: string | undefined;
    let mockupUrls: string[] = [];
    let variantIds: number[] = [];

    // ── Step 1: Upload design file to Printful ──
    onProgress({
      type: "step",
      designId: design.id,
      designIndex: di,
      totalDesigns,
      step: 1,
      totalSteps: STEPS_PER_DESIGN,
      label: "Uploading design to Printful",
      status: "running",
    });

    try {
      const safeKeyword = keyword.replace(/[^a-zA-Z0-9-]/g, "-").substring(0, 30);
      const fileName = `studio-${safeKeyword}-${di + 1}-${Date.now()}.png`;
      const uploadResult = await uploadFile(printfulToken, design.dataUrl, fileName);
      printfulFileId = uploadResult.id;
      printfulFileUrl = uploadResult.url;

      onProgress({
        type: "step",
        designId: design.id,
        designIndex: di,
        totalDesigns,
        step: 1,
        totalSteps: STEPS_PER_DESIGN,
        label: "Design uploaded to Printful",
        detail: `File ID: ${uploadResult.id}`,
        status: "done",
        printfulFileId,
        printfulFileUrl,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";

      let detail = msg;
      if (msg.includes("Temp host")) {
        detail = "Failed to upload design to temp hosting. The image may be too large or the hosting service is down. Try again.";
      } else if (msg.includes("401")) {
        detail = "Upload failed: authentication error. Check PRINTFUL_API_KEY";
      }

      onProgress({
        type: "step",
        designId: design.id,
        designIndex: di,
        totalDesigns,
        step: 1,
        totalSteps: STEPS_PER_DESIGN,
        label: "Failed to upload design",
        status: "error",
        error: detail,
      });
      continue; // Skip this design, move to next
    }

    // ── Step 2: Create product on Printful & push to store ──
    onProgress({
      type: "step",
      designId: design.id,
      designIndex: di,
      totalDesigns,
      step: 2,
      totalSteps: STEPS_PER_DESIGN,
      label: storeType === "CONNECTED_STORE"
        ? "Preparing product for Etsy"
        : "Creating product on Printful",
      status: "running",
    });

    try {
      // Get variant IDs and retail prices for this product type
      const defaults = await getDefaultVariants(
        printfulToken,
        primaryProduct.catalogProductId,
        primaryProduct.markupPercent
      );
      variantIds = defaults.variantIds;

      if (variantIds.length === 0) {
        throw new Error(
          `No in-stock variants found for product ${primaryProduct.productName} (ID: ${primaryProduct.catalogProductId}). Try a different product.`
        );
      }

      const pushResult = await createAndPushProduct(printfulToken, {
        title: listing.title.substring(0, 140),
        description: listing.description,
        catalogProductId: primaryProduct.catalogProductId,
        variantIds: defaults.variantIds,
        retailPrices: defaults.retailPrices,
        fileUrl: printfulFileUrl,
        fileId: printfulFileId,
        placement: "front",
        tags: listing.tags.slice(0, 13),
      }, storeType);

      syncProductId = pushResult.templateId;
      pushed = pushResult.pushed;
      pushError = pushResult.error;

      onProgress({
        type: "step",
        designId: design.id,
        designIndex: di,
        totalDesigns,
        step: 2,
        totalSteps: STEPS_PER_DESIGN,
        label: pushed
          ? "Product created & pushed to store"
          : storeType === "CONNECTED_STORE"
          ? "Design saved to Printful library"
          : "Product created on Printful",
        detail: pushed
          ? `Sync Product ID: ${syncProductId}`
          : storeType === "CONNECTED_STORE"
          ? `File ID: ${printfulFileId} \u2014 complete listing on Etsy to sync`
          : pushError
          ? `ID: ${syncProductId} \u2014 ${pushError}`
          : `Product ID: ${syncProductId}`,
        status: "done",
        syncProductId,
        pushed,
        pushError,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Product creation failed";

      let detail = msg;
      if (msg.includes("store type") || msg.includes("restricted")) {
        detail = `Store type mismatch: ${storeType} store cannot use this endpoint. ${msg}`;
      } else if (msg.includes("variant")) {
        detail = msg; // Already descriptive from our check above
      }

      onProgress({
        type: "step",
        designId: design.id,
        designIndex: di,
        totalDesigns,
        step: 2,
        totalSteps: STEPS_PER_DESIGN,
        label: "Failed to create product",
        status: "error",
        error: detail,
      });
      continue; // Skip this design
    }

    // ── Step 3: Generate mockups ──
    onProgress({
      type: "step",
      designId: design.id,
      designIndex: di,
      totalDesigns,
      step: 3,
      totalSteps: STEPS_PER_DESIGN,
      label: "Generating product mockups",
      status: "running",
    });

    try {
      const mockupVariants = variantIds.slice(0, 3);
      const task = await createMockupTask(
        printfulToken,
        primaryProduct.catalogProductId,
        mockupVariants,
        printfulFileUrl,
        "front"
      );

      // Poll for mockup completion (max 60s)
      let pollCount = 0;
      let mockupResult = await getMockupTaskResult(printfulToken, task.task_key);

      while (mockupResult.status === "pending" && pollCount < 20) {
        await new Promise((r) => setTimeout(r, 3000));
        mockupResult = await getMockupTaskResult(printfulToken, task.task_key);
        pollCount++;
      }

      if (mockupResult.status === "completed" && mockupResult.mockups?.length) {
        mockupUrls = mockupResult.mockups.map((m) => m.mockup_url);
        onProgress({
          type: "step",
          designId: design.id,
          designIndex: di,
          totalDesigns,
          step: 3,
          totalSteps: STEPS_PER_DESIGN,
          label: "Mockups generated",
          detail: `${mockupUrls.length} mockup images`,
          status: "done",
          mockupUrls,
        });
      } else if (mockupResult.error) {
        onProgress({
          type: "step",
          designId: design.id,
          designIndex: di,
          totalDesigns,
          step: 3,
          totalSteps: STEPS_PER_DESIGN,
          label: "Mockup generation failed",
          detail: mockupResult.error,
          status: "skipped",
        });
      } else {
        onProgress({
          type: "step",
          designId: design.id,
          designIndex: di,
          totalDesigns,
          step: 3,
          totalSteps: STEPS_PER_DESIGN,
          label: "Mockup generation timed out",
          detail: "Will use design image instead",
          status: "skipped",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Mockup failed";
      onProgress({
        type: "step",
        designId: design.id,
        designIndex: di,
        totalDesigns,
        step: 3,
        totalSteps: STEPS_PER_DESIGN,
        label: "Mockup generation failed",
        detail: "Will use design image instead",
        status: "skipped",
      });
      console.warn("[Studio Pipeline] Mockup failed (non-fatal):", msg);
    }

    // ── Step 4: Mark product as ready ──
    onProgress({
      type: "step",
      designId: design.id,
      designIndex: di,
      totalDesigns,
      step: 4,
      totalSteps: STEPS_PER_DESIGN,
      label: pushed
        ? "Product pushed to Etsy via Printful"
        : "Product ready \u2014 finish on Etsy manually",
      detail: `Product ID: ${syncProductId}`,
      status: "done",
      syncProductId,
      pushed,
    });

    // ── Design complete ──
    onProgress({
      type: "design-done",
      designId: design.id,
      designIndex: di,
      totalDesigns,
      label: `Design ${di + 1}/${totalDesigns} complete`,
      status: "done",
      printfulFileId,
      printfulFileUrl,
      syncProductId,
      pushed,
      pushError,
      mockupUrls,
    });

    // Brief pause between designs to avoid rate limiting
    if (di < designs.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // ── Pipeline complete ──
  onProgress({
    type: "pipeline-done",
    designId: "",
    designIndex: totalDesigns,
    totalDesigns,
    label: `All ${totalDesigns} designs pushed to Printful`,
    status: "done",
    storeType,
    storeName,
  });
}
