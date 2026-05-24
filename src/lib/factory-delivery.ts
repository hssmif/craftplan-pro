// ══════════════════════════════════════════════════════════════
// Factory Engine 6: Delivery / Package Engine
//
// Gathers all factory run outputs and bundles them into a
// ready-to-upload Etsy package:
//   - product file (.xlsx)
//   - delivery instructions (txt)
//   - listing copy (txt + json)
//   - image plan (json)
//   - metadata (json)
//
// Output: a ZIP file stored as a digital asset
// ══════════════════════════════════════════════════════════════

import JSZip from "jszip";
import { storeAsset } from "@/lib/digital-asset-storage";
import { getDigitalAssets, getFactoryRun, getFactoryBlueprint } from "@/lib/db";
import type {
  FactoryPackageResult,
  PackageFile,
  ListingCopyPackage,
  ListingImagePlan,
} from "@/types/factory";

// ── Build listing text file ─────────────────────────────────

function buildListingText(copy: ListingCopyPackage): string {
  const lines: string[] = [];

  lines.push("═══════════════════════════════════════════════");
  lines.push("ETSY LISTING PACKAGE");
  lines.push("═══════════════════════════════════════════════");
  lines.push("");

  lines.push("RECOMMENDED TITLE:");
  lines.push(copy.recommendedTitle);
  lines.push("");

  lines.push("TITLE OPTIONS:");
  copy.titleOptions.forEach((t, i) => lines.push(`  ${i + 1}. ${t}`));
  lines.push("");

  lines.push("TAGS (13):");
  copy.tags.forEach((t, i) => lines.push(`  ${i + 1}. ${t}`));
  lines.push("");

  lines.push("THUMBNAIL TEXT:");
  lines.push(copy.thumbnailText);
  lines.push("");

  lines.push("SHORT HOOK:");
  lines.push(copy.shortHook);
  lines.push("");

  lines.push("PRICING:");
  lines.push(`  Launch price:   $${copy.pricing.launchPrice}`);
  lines.push(`  Standard price: $${copy.pricing.standardPrice}`);
  if (copy.pricing.bundlePriceSuggestion) {
    lines.push(`  Bundle price:   $${copy.pricing.bundlePriceSuggestion}`);
  }
  lines.push(`  Rationale: ${copy.pricing.rationale}`);
  lines.push("");

  lines.push("DIFFERENTIATORS:");
  copy.differentiators.forEach((d) => lines.push(`  • ${d}`));
  lines.push("");

  lines.push("═══════════════════════════════════════════════");
  lines.push("FULL DESCRIPTION");
  lines.push("═══════════════════════════════════════════════");
  lines.push("");
  lines.push(copy.fullDescription);
  lines.push("");

  lines.push("═══════════════════════════════════════════════");
  lines.push("FAQ");
  lines.push("═══════════════════════════════════════════════");
  lines.push("");
  copy.faq.forEach((f) => {
    lines.push(`Q: ${f.question}`);
    lines.push(`A: ${f.answer}`);
    lines.push("");
  });

  if (copy.imageCaptions.length > 0) {
    lines.push("═══════════════════════════════════════════════");
    lines.push("IMAGE CAPTIONS");
    lines.push("═══════════════════════════════════════════════");
    lines.push("");
    copy.imageCaptions.forEach((c) => {
      lines.push(`  Image ${c.imageSlot}: ${c.caption}`);
    });
    lines.push("");
  }

  return lines.join("\n");
}

// ── Build delivery instructions text ────────────────────────

function buildDeliveryText(copy: ListingCopyPackage, productFileName: string): string {
  const lines: string[] = [];

  lines.push("═══════════════════════════════════════════════");
  lines.push("DELIVERY INSTRUCTIONS");
  lines.push("═══════════════════════════════════════════════");
  lines.push("");
  lines.push(`PRODUCT FILE: ${productFileName}`);
  lines.push("");
  lines.push(copy.deliveryInstructions);

  return lines.join("\n");
}

// ── Build metadata JSON ─────────────────────────────────────

function buildMetadata(
  runId: string,
  copy: ListingCopyPackage,
  productFileName: string
): Record<string, unknown> {
  return {
    factoryRunId: runId,
    generatedAt: new Date().toISOString(),
    productType: copy.productType,
    niche: copy.niche,
    title: copy.recommendedTitle,
    tags: copy.tags,
    pricing: copy.pricing,
    productFile: productFileName,
    generator: "CraftPlan Product Factory v1.0",
  };
}

// ══════════════════════════════════════════════════════════════
// MAIN EXPORT: Build the package
// ══════════════════════════════════════════════════════════════

export async function buildFactoryPackage(
  factoryRunId: string,
  baseUrl: string
): Promise<FactoryPackageResult> {
  // Load the factory run
  const run = getFactoryRun(factoryRunId);
  if (!run) throw new Error("Factory run not found");
  // Accept "packaging" (orchestrator sets this before calling us) and "completed"
  if (!["completed", "packaging", "ready_to_list"].includes(run.status as string)) {
    throw new Error(`Run status is "${run.status}", expected "completed" or "packaging"`);
  }

  const projectId = run.project_id as string;
  if (!projectId) throw new Error("No project ID on this run");

  // Load blueprint for product type info
  const blueprintId = run.blueprint_id as string;
  const blueprintRaw = blueprintId ? getFactoryBlueprint(blueprintId) : null;
  const productType = (blueprintRaw?.product_type as string) || "sheets";

  // Parse stored listing copy
  const listingCopyRaw = run.listing_copy as string;
  let listingCopy: ListingCopyPackage | null = null;
  if (listingCopyRaw) {
    try { listingCopy = JSON.parse(listingCopyRaw); } catch { /* ignore */ }
  }

  // Parse stored image plan
  const imagePlanRaw = run.image_plan as string;
  let imagePlan: ListingImagePlan | null = null;
  if (imagePlanRaw) {
    try { imagePlan = JSON.parse(imagePlanRaw); } catch { /* ignore */ }
  }

  // Load the product file from the project
  const projectResp = await fetch(`${baseUrl}/api/digital/projects?id=${projectId}`);
  if (!projectResp.ok) throw new Error("Failed to load project");
  const projectData = await projectResp.json();
  const project = projectData.project;
  const generationResult = project?.generation?.result;
  const productAssets = getDigitalAssets(projectId, "product");
  const generatedProductAsset = productAssets
    .filter((asset) => !asset.file_name.toLowerCase().endsWith(".zip"))
    .at(-1);

  // Determine product file name
  const productFileName =
    generationResult?.fileName ||
    generatedProductAsset?.file_name ||
    `${productType}-product.xlsx`;
  const productDownloadUrl =
    generationResult?.downloadUrl ||
    (generatedProductAsset ? `/api/digital/download/${generatedProductAsset.id}` : null);

  // Build the ZIP
  const zip = new JSZip();
  const includedFiles: PackageFile[] = [];

  // 1. Product file — fetch from download URL
  if (productDownloadUrl) {
    try {
      const fileResp = await fetch(`${baseUrl}${productDownloadUrl}`);
      if (fileResp.ok) {
        const fileBuffer = await fileResp.arrayBuffer();
        zip.file(productFileName, fileBuffer);
        includedFiles.push({
          fileName: productFileName,
          kind: "product",
          sizeBytes: fileBuffer.byteLength,
        });
      }
    } catch {
      // Product file fetch failed — non-fatal, package without it
    }
  }

  // 2. Delivery instructions
  if (listingCopy) {
    const deliveryText = buildDeliveryText(listingCopy, productFileName);
    const deliveryBuf = Buffer.from(deliveryText, "utf-8");
    zip.file("delivery-instructions.txt", deliveryBuf);
    includedFiles.push({
      fileName: "delivery-instructions.txt",
      kind: "instructions_txt",
      sizeBytes: deliveryBuf.length,
    });
  }

  // 3. Listing copy (txt)
  if (listingCopy) {
    const listingText = buildListingText(listingCopy);
    const listingBuf = Buffer.from(listingText, "utf-8");
    zip.file("etsy-listing.txt", listingBuf);
    includedFiles.push({
      fileName: "etsy-listing.txt",
      kind: "listing_txt",
      sizeBytes: listingBuf.length,
    });
  }

  // 4. Listing copy (json — machine-readable)
  if (listingCopy) {
    const listingJson = Buffer.from(JSON.stringify(listingCopy, null, 2), "utf-8");
    zip.file("etsy-listing.json", listingJson);
    includedFiles.push({
      fileName: "etsy-listing.json",
      kind: "listing_json",
      sizeBytes: listingJson.length,
    });
  }

  // 5. Image plan (json)
  if (imagePlan) {
    const planJson = Buffer.from(JSON.stringify(imagePlan, null, 2), "utf-8");
    zip.file("image-plan.json", planJson);
    includedFiles.push({
      fileName: "image-plan.json",
      kind: "image_plan_json",
      sizeBytes: planJson.length,
    });
  }

  // 6. Metadata
  if (listingCopy) {
    const meta = buildMetadata(factoryRunId, listingCopy, productFileName);
    const metaJson = Buffer.from(JSON.stringify(meta, null, 2), "utf-8");
    zip.file("metadata.json", metaJson);
    includedFiles.push({
      fileName: "metadata.json",
      kind: "meta_json",
      sizeBytes: metaJson.length,
    });
  }

  // Generate the ZIP buffer
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

  // Store the ZIP as a digital asset
  const title = listingCopy?.recommendedTitle || "Factory Product";
  const safeName = title.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-").slice(0, 50).toLowerCase();
  const zipFileName = `${safeName}-package.zip`;

  const asset = storeAsset(projectId, zipBuffer, zipFileName, "product");

  return {
    factoryRunId,
    productType: productType as FactoryPackageResult["productType"],
    zipAssetId: asset.id,
    zipDownloadUrl: asset.downloadUrl,
    includedFiles,
    summary: {
      title,
      productFileName,
      hasInstructions: includedFiles.some((f) => f.kind === "instructions_txt"),
      hasListingCopy: includedFiles.some((f) => f.kind === "listing_txt"),
      hasImagePlan: includedFiles.some((f) => f.kind === "image_plan_json"),
      totalFiles: includedFiles.length,
    },
  };
}
