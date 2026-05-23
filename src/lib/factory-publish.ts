// ══════════════════════════════════════════════════════════════
// Factory Publish Handoff
//
// Bridges a ready_to_list factory run → Etsy publish pipeline.
//
// Two modes:
//   1. buildPublishPayload() — Prepares a publish-ready object
//      for review before publishing. No side effects.
//
//   2. executePublish() — Actually creates the Etsy listing,
//      uploads files + images, and optionally activates.
//
// Uses the existing etsy-client.ts integration (OAuth, API).
// ══════════════════════════════════════════════════════════════

import { getFactoryRun, getFactoryBlueprint, updateFactoryRun } from "@/lib/db";
import { readAssetBuffer, listAssets, storeAsset } from "@/lib/digital-asset-storage";
import {
  createDigitalListing,
  uploadListingFile,
  uploadListingImage,
  uploadListingVideo,
  activateListing,
} from "@/lib/etsy-client";
import { PDFDocument, StandardFonts, rgb, PDFName } from "pdf-lib";
import type {
  EtsyPublishPayload,
  EtsyPublishResult,
  ReadyToListPackage,
} from "@/types/factory";

// ── Etsy taxonomy IDs for digital products ──────────────────

// ── Etsy taxonomy IDs (from /v3/application/seller-taxonomy/nodes) ──
// Default by product type
const TAXONOMY_MAP: Record<string, number> = {
  sheets: 12476,     // Paper > Stationery > Design & Templates > Templates > Planner Templates
  excel: 12476,
  pdf: 12476,        // Planner Templates
  printable: 1874,   // Templates (general)
  notion: 12476,     // Planner Templates
};

// Niche-specific overrides (more targeted = better Etsy SEO)
const NICHE_TAXONOMY_MAP: Record<string, number> = {
  "wedding": 1678,           // Weddings > Invitations & Paper > Templates
  "wedding-planner": 1678,
  "budget": 12487,           // Templates > Personal Finance Templates
  "budget-tracker": 12487,
  "baby-budget": 12487,
  "finance": 12487,
  "bookkeeping": 12478,      // Templates > Bookkeeping Templates
  "planner": 12476,          // Templates > Planner Templates
  "daily-planner": 12476,
  "meal-planner": 12476,
  "journal": 12475,          // Templates > Journal Templates
  "social-media": 12486,     // Templates > Social Media Templates
  "resume": 1876,            // Templates > Résumé Templates
  "menu": 12484,             // Templates > Menu Templates
  "chore-chart": 12479,      // Templates > Chore Chart Templates
};

// ── Build Publish Payload (read-only, no side effects) ──────

export function buildPublishPayload(
  runId: string
): EtsyPublishPayload | { error: string } {
  const run = getFactoryRun(runId);
  if (!run) {
    return { error: "Factory run not found" };
  }

  if (run.status !== "ready_to_list" && run.status !== "completed") {
    return { error: `Run status is "${run.status}" — must be ready_to_list or completed` };
  }

  // Already published?
  if (run.etsy_listing_id) {
    return {
      error: `Already published as Etsy listing #${run.etsy_listing_id}`,
    };
  }

  // ── Reconstruct ReadyToListPackage from DB fields ────────

  const readyToList = reconstructReadyToList(run);

  if (!readyToList.listingCopy?.title) {
    return { error: "No listing copy found. Cannot publish without title/description." };
  }

  // ── Determine product type & niche from blueprint ────────

  let productTypeHint = "sheets";
  let nicheHint = "";
  let categoryHint = "Google Sheets Spreadsheet";
  if (run.blueprint_id) {
    const bp = getFactoryBlueprint(run.blueprint_id as string);
    if (bp) {
      productTypeHint = (bp.product_type as string) || "sheets";
      nicheHint = (bp.niche_id as string) || (bp.positioning as string) || "";
      categoryHint = (bp.positioning as string) || categoryHint;
    }
  }

  // Use niche-specific taxonomy if available, else fall back to product type
  const taxonomyId = NICHE_TAXONOMY_MAP[nicheHint] || TAXONOMY_MAP[productTypeHint] || 12476;

  // ── Build image assets array (sorted by slot) ────────────

  const imageAssets: EtsyPublishPayload["imageAssets"] = [];
  if (readyToList.listingImages) {
    for (const img of readyToList.listingImages) {
      imageAssets.push({
        assetId: img.assetId,
        downloadUrl: img.downloadUrl,
        slot: img.slot,
        kind: img.kind,
      });
    }
    imageAssets.sort((a, b) => a.slot - b.slot);
  }

  // ── Build sale pricing ────────────────────────────────────

  const rawPrice = readyToList.listingCopy.price || readyToList.suggestedPrice || 5.99;
  const salePrice = sanitizePrice(rawPrice);
  // Original price from the copy pricing data (standardPrice = anchor)
  const originalPrice = readyToList.listingCopy.originalPrice
    || sanitizePrice(salePrice * 3.5);
  const discountPct = Math.round((1 - salePrice / originalPrice) * 100);

  // Prepend sale banner to the description
  const saleBanner = [
    `LIMITED TIME SALE  ${discountPct}% OFF`,
    `Was $${originalPrice.toFixed(2)} - Now Only $${salePrice.toFixed(2)}`,
    ``,
  ].join("\n");

  const fullDescription = saleBanner + (readyToList.listingCopy.description || "");

  // ── Assemble payload ─────────────────────────────────────

  const payload: EtsyPublishPayload = {
    sourceRunId: runId,
    blueprintId: (run.blueprint_id as string) || undefined,
    projectId: (run.project_id as string) || undefined,

    // Listing content — price is the SALE price (what buyer pays)
    title: sanitizeTitle(readyToList.listingCopy.title),
    description: fullDescription,
    tags: sanitizeTags(readyToList.listingCopy.tags || []),
    price: salePrice,

    // Assets
    imageAssets,
    digitalFileAsset: readyToList.productAsset
      ? {
          assetId: readyToList.productAsset.assetId,
          downloadUrl: readyToList.productAsset.downloadUrl,
          fileName: readyToList.productAsset.fileName,
        }
      : undefined,
    packageAsset: readyToList.packageAsset
      ? {
          assetId: readyToList.packageAsset.assetId,
          downloadUrl: readyToList.packageAsset.downloadUrl,
        }
      : undefined,

    // Etsy metadata
    taxonomyId,
    productType: "digital",
    categoryHint,
    state: "draft_ready",

    // Google Sheets delivery (if applicable)
    _googleSheetId: readyToList._googleSheetId,
  };

  return payload;
}

// ── Execute Publish (creates Etsy listing) ──────────────────

export async function executePublish(
  runId: string,
  options: {
    /** Override any payload fields before publishing */
    overrides?: Partial<Pick<EtsyPublishPayload, "title" | "description" | "tags" | "price">>;
    /** If true, activate the listing (make it live). Default: false (draft). */
    autoActivate?: boolean;
  } = {}
): Promise<EtsyPublishResult> {
  const stepsCompleted: string[] = [];
  const errors: string[] = [];

  // ── Review Gate: must be approved before publishing ──
  const run = getFactoryRun(runId);
  if (run) {
    const reviewStatus = run.review_status as string | null;
    if (reviewStatus !== "approved") {
      const statusMsg = reviewStatus
        ? `Current review status: "${reviewStatus}"`
        : "Listing has not been reviewed yet";
      return {
        success: false,
        sourceRunId: runId,
        etsyStatus: "draft",
        stepsCompleted,
        errors: [
          `Publish blocked — listing must be approved before publishing. ${statusMsg}. ` +
          `Use the Review Gate (GET /api/factory/review?runId=${runId}) to review, ` +
          `then approve (POST /api/factory/review { runId, action: "approve" }).`,
        ],
      };
    }
  }

  // 1. Build the payload
  const payloadOrError = buildPublishPayload(runId);
  if ("error" in payloadOrError) {
    return {
      success: false,
      sourceRunId: runId,
      etsyStatus: "draft",
      stepsCompleted,
      errors: [payloadOrError.error],
    };
  }

  const payload = { ...payloadOrError };

  // Apply overrides
  if (options.overrides) {
    if (options.overrides.title) payload.title = sanitizeTitle(options.overrides.title);
    if (options.overrides.description) payload.description = options.overrides.description;
    if (options.overrides.tags) payload.tags = sanitizeTags(options.overrides.tags);
    if (options.overrides.price) payload.price = options.overrides.price;
  }

  // Update run status
  updateFactoryRun(runId, { etsyStatus: "publishing" });

  let listingId: number | undefined;
  let listingUrl: string | undefined;

  try {
    // 2. Create draft listing on Etsy
    console.log(`[factory-publish] Creating Etsy draft listing for run ${runId}...`);

    const listing = await createDigitalListing({
      title: payload.title,
      description: payload.description,
      price: payload.price,
      tags: payload.tags,
      taxonomy_id: payload.taxonomyId,
    });

    listingId = listing.listing_id;
    listingUrl = listing.url;
    stepsCompleted.push("create_listing");

    console.log(`[factory-publish] Created listing #${listingId}: ${listingUrl}`);

    // 3. Upload digital file (the product the customer downloads)
    if (payload.digitalFileAsset) {
      const fileData = readAssetBuffer(payload.digitalFileAsset.assetId);
      if (fileData) {
        await uploadListingFile(
          listingId,
          fileData.buffer,
          payload.digitalFileAsset.fileName
        );
        stepsCompleted.push("upload_product_file");
        console.log(`[factory-publish] Uploaded product file: ${payload.digitalFileAsset.fileName}`);
      } else {
        errors.push("Product file not readable from disk");
      }
    } else if (payload._googleSheetId) {
      // Google Sheets product — generate a delivery PDF with the template link
      console.log("[factory-publish] Generating delivery PDF for Google Sheets product...");
      const pdfBuffer = await generateDeliveryPdf(
        payload._googleSheetId,
        payload.title
      );
      await uploadListingFile(listingId, pdfBuffer, "Google-Sheets-Template.pdf");
      stepsCompleted.push("upload_delivery_pdf");
      console.log("[factory-publish] Uploaded Google Sheets delivery PDF");
    } else if (payload.packageAsset) {
      // Fallback: upload the ZIP package as the digital file
      const pkgData = readAssetBuffer(payload.packageAsset.assetId);
      if (pkgData) {
        await uploadListingFile(listingId, pkgData.buffer, "product-package.zip");
        stepsCompleted.push("upload_package_file");
        console.log("[factory-publish] Uploaded package ZIP as product file");
      } else {
        errors.push("Package file not readable from disk");
      }
    }

    // 4. Upload listing images (up to 10, Etsy max)
    for (const img of payload.imageAssets.slice(0, 10)) {
      try {
        const imgData = readAssetBuffer(img.assetId);
        if (imgData) {
          await uploadListingImage(
            listingId,
            imgData.buffer,
            `listing_image_slot${img.slot}.png`,
            img.slot
          );
          stepsCompleted.push(`upload_image_slot${img.slot}`);
        } else {
          errors.push(`Image slot ${img.slot} not readable`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : `Image slot ${img.slot} upload failed`;
        errors.push(msg);
        console.warn(`[factory-publish] Image slot ${img.slot} failed:`, msg);
        // Continue with remaining images
      }
    }

    // 5. Upload listing video (if available)
    const projectId = payload.projectId;
    if (projectId) {
      try {
        const videoAssets = listAssets(projectId, "preview")
          .filter(a => a.fileName.endsWith(".mp4") || a.fileName.endsWith(".webm"));
        if (videoAssets.length > 0) {
          const videoData = readAssetBuffer(videoAssets[0].id);
          if (videoData) {
            await uploadListingVideo(
              listingId,
              videoData.buffer,
              videoAssets[0].fileName
            );
            stepsCompleted.push("upload_video");
            console.log(`[factory-publish] Uploaded listing video: ${videoAssets[0].fileName}`);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Video upload failed";
        errors.push(`Video upload: ${msg}`);
        console.warn("[factory-publish] Video upload failed:", msg);
        // Non-critical — continue with activation
      }
    }

    // 6. Optionally activate (make listing live)
    let etsyStatus: "draft" | "active" = "draft";
    if (options.autoActivate) {
      try {
        await activateListing(listingId);
        etsyStatus = "active";
        stepsCompleted.push("activate_listing");
        console.log(`[factory-publish] Listing #${listingId} activated (live)`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Activation failed";
        errors.push(`Activation failed: ${msg}`);
        console.warn("[factory-publish] Activation failed:", msg);
      }
    }

    // 7. Persist publish state to factory run
    updateFactoryRun(runId, {
      etsyListingId: listingId,
      etsyListingUrl: listingUrl,
      etsyStatus,
      publishedAt: new Date().toISOString(),
    });

    return {
      success: true,
      sourceRunId: runId,
      etsyListingId: listingId,
      etsyListingUrl: listingUrl,
      etsyStatus,
      stepsCompleted,
      errors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed";
    errors.push(message);

    // Persist partial state
    updateFactoryRun(runId, {
      etsyListingId: listingId || null,
      etsyListingUrl: listingUrl || null,
      etsyStatus: "failed",
    });

    return {
      success: false,
      sourceRunId: runId,
      etsyListingId: listingId,
      etsyListingUrl: listingUrl,
      etsyStatus: "draft",
      stepsCompleted,
      errors,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────

/** Reconstruct ReadyToListPackage from raw DB row */
function reconstructReadyToList(
  run: Record<string, unknown>
): ReadyToListPackage {
  const result: ReadyToListPackage = {};

  // Product asset — find from project's stored assets
  // IMPORTANT: skip video files — those are preview assets, not product files
  const projectId = run.project_id as string | undefined;
  if (projectId) {
    const productAssets = listAssets(projectId, "product")
      .filter(a => !a.fileName.endsWith(".mp4") && !a.fileName.endsWith(".webm"));
    if (productAssets.length > 0) {
      result.productAsset = {
        assetId: productAssets[0].id,
        downloadUrl: `/api/digital/download/${productAssets[0].id}`,
        fileName: productAssets[0].fileName,
      };
    }
  }

  // Google Sheet delivery — if no product file but we have a Google Sheet,
  // generate a delivery PDF with the template link
  if (!result.productAsset && run.google_sheet_id) {
    result._googleSheetId = run.google_sheet_id as string;
    result._title = result.listingCopy?.title || "Google Sheets Template";
    result._projectId = projectId;
  }

  // Listing images
  if (run.listing_images) {
    try {
      const imageIds = JSON.parse(run.listing_images as string) as string[];
      result.listingImages = imageIds.map((id, i) => {
        // DB may store full URLs like "/api/digital/download/da_xxx" — extract just the asset ID
        const isFullUrl = id.startsWith("/api/");
        const assetId = isFullUrl ? id.replace("/api/digital/download/", "") : id;
        return {
          slot: i + 1,
          kind: i === 0 ? "thumbnail" : "feature",
          assetId,
          downloadUrl: isFullUrl ? id : `/api/digital/download/${id}`,
        };
      });
    } catch { /* ignore */ }
  }

  // Listing copy
  if (run.listing_copy) {
    try {
      const copy = JSON.parse(run.listing_copy as string);
      const rawDesc = copy.fullDescription || copy.description || "";
      result.listingCopy = {
        title: copy.recommendedTitle || copy.title || "",
        tags: copy.tags || [],
        description: stripMarkdownForEtsy(rawDesc),
        // Sale price = what buyer pays (launchPrice). Original = anchor (standardPrice).
        price: copy.pricing?.launchPrice || copy.pricing?.standardPrice || copy.price || 5.99,
        originalPrice: copy.pricing?.standardPrice || 0,
      };
    } catch { /* ignore */ }
  }

  // Package asset
  if (run.package_asset_id) {
    result.packageAsset = {
      assetId: run.package_asset_id as string,
      downloadUrl: `/api/digital/download/${run.package_asset_id}`,
    };
  }

  return result;
}

/** Strip markdown that Etsy can't render */
function stripMarkdownForEtsy(text: string): string {
  return text
    .replace(/^#{1,6}\s+(.+)$/gm, (_m, title) => title.toUpperCase())
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1")
    .replace(/^[\s]*[-*]\s+/gm, "• ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n");
}

/** Etsy title: max 140 chars */
function sanitizeTitle(title: string): string {
  return title.trim().substring(0, 140);
}

/** Round price to clean .99 or .49 price point — avoids awkward numbers like 16.97 */
function sanitizePrice(price: number): number {
  if (price <= 0) return 9.99;
  // Round to nearest .99 (e.g. 16.97 → 16.99, 14.50 → 14.99, 8.30 → 7.99)
  const base = Math.floor(price);
  const cents = price - base;
  if (cents >= 0.75) return base + 0.99;
  if (cents >= 0.25) return base - 1 + 0.99 > 0 ? base + 0.49 : base + 0.99;
  return base - 0.01 > 0 ? base - 0.01 : base + 0.99;
}

/** Etsy tags: max 13 tags, each max 20 chars, no commas */
function sanitizeTags(tags: string[]): string[] {
  return tags
    .map((t) => t.trim().replace(/,/g, "").substring(0, 20))
    .filter((t) => t.length > 0)
    .slice(0, 13);
}

/** Generate a professional delivery PDF with CLICKABLE Google Sheets link */
async function generateDeliveryPdf(
  sheetId: string,
  title: string,
): Promise<Buffer> {
  const copyUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/copy`;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // US Letter
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const darkColor = rgb(0.15, 0.15, 0.15);
  const accentColor = rgb(0.18, 0.55, 0.34);
  const lightGray = rgb(0.45, 0.45, 0.45);
  const linkColor = rgb(0.0, 0.33, 0.71);

  let y = 700;
  const leftMargin = 60;
  const lineHeight = 22;

  // ── Header ──
  page.drawText("Thank you for your purchase!", {
    x: leftMargin,
    y,
    size: 24,
    font: fontBold,
    color: darkColor,
  });
  y -= 36;

  const shortTitle = title.length > 70 ? title.substring(0, 67) + "..." : title;
  page.drawText(shortTitle, {
    x: leftMargin,
    y,
    size: 12,
    font,
    color: lightGray,
  });
  y -= 50;

  // ── Step 1: Get Your Template (BIG, clear) ──
  page.drawText("STEP 1: GET YOUR TEMPLATE", {
    x: leftMargin,
    y,
    size: 16,
    font: fontBold,
    color: accentColor,
  });
  y -= 30;

  page.drawText("Click the link below to get your own copy:", {
    x: leftMargin,
    y,
    size: 12,
    font,
    color: darkColor,
  });
  y -= 24;

  // ── CLICKABLE link with PDF annotation ──
  const linkTextWidth = font.widthOfTextAtSize(copyUrl, 12);
  page.drawText(copyUrl, {
    x: leftMargin,
    y,
    size: 12,
    font,
    color: linkColor,
  });
  // Draw underline
  page.drawLine({
    start: { x: leftMargin, y: y - 2 },
    end: { x: leftMargin + linkTextWidth, y: y - 2 },
    thickness: 0.8,
    color: linkColor,
  });
  // Add clickable PDF link annotation (makes URL actually clickable in PDF readers)
  const linkAnnotRef = pdfDoc.context.register(
    pdfDoc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [leftMargin - 2, y - 6, leftMargin + linkTextWidth + 4, y + 14],
      Border: [0, 0, 0],
      A: {
        Type: "Action",
        S: "URI",
        URI: copyUrl,
      },
    }),
  );
  page.node.set(PDFName.of("Annots"), pdfDoc.context.obj([linkAnnotRef]));
  y -= 40;

  // ── Step 2: Make Your Copy ──
  page.drawText("STEP 2: MAKE YOUR COPY", {
    x: leftMargin,
    y,
    size: 14,
    font: fontBold,
    color: accentColor,
  });
  y -= 26;

  const steps = [
    '1.  Click the link above — it opens in Google Sheets',
    '2.  Click "Make a copy" when Google asks you',
    '3.  Your copy saves to your Google Drive automatically',
    '4.  Start entering your own data — formulas do the math!',
  ];
  for (const step of steps) {
    page.drawText(step, {
      x: leftMargin + 8,
      y,
      size: 11,
      font,
      color: darkColor,
    });
    y -= lineHeight;
  }
  y -= 16;

  // ── On Mobile? ──
  page.drawText("ON YOUR PHONE OR TABLET?", {
    x: leftMargin,
    y,
    size: 13,
    font: fontBold,
    color: accentColor,
  });
  y -= 24;

  const mobileTips = [
    "1.  Open this PDF in your browser (not the Etsy app)",
    "2.  Tap the link above — it will open Google Sheets",
    '3.  Tap "Make a copy" — it saves to your Google Drive',
    "4.  Open the Google Sheets app to edit on mobile",
  ];
  for (const tip of mobileTips) {
    page.drawText(tip, {
      x: leftMargin + 8,
      y,
      size: 11,
      font,
      color: darkColor,
    });
    y -= lineHeight;
  }
  y -= 16;

  // ── Good to Know ──
  page.drawText("GOOD TO KNOW", {
    x: leftMargin,
    y,
    size: 13,
    font: fontBold,
    color: accentColor,
  });
  y -= 24;

  const tips = [
    "•  Sign into your Google account first",
    "•  All formulas update automatically — just enter your data",
    "•  Works on desktop, tablet, and phone",
    "•  The copy is 100% yours — edit it however you like",
  ];
  for (const tip of tips) {
    page.drawText(tip, {
      x: leftMargin + 8,
      y,
      size: 11,
      font,
      color: darkColor,
    });
    y -= lineHeight;
  }
  y -= 30;

  // ── Footer ──
  page.drawText("Need help? Message us on Etsy — we reply within 24 hours!", {
    x: leftMargin,
    y,
    size: 11,
    font,
    color: lightGray,
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
