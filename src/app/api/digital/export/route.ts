// ══════════════════════════════════════════════════════════════
// Digital Product Studio: Listing Package Export (ZIP)
// Bundles product file + mockup images + listing.txt +
// metadata.json into a single ZIP download.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getDigitalProject } from "@/lib/db";
import { readAssetBuffer, listAssets } from "@/lib/digital-asset-storage";
import { buildListingText, buildMetadataJson } from "@/lib/digital-export-utils";
import type { DigitalProduct } from "@/types/digital-product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── POST: Generate ZIP export ────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId } = body as { projectId?: string };

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    // Load project from DB
    const row = getDigitalProject(projectId);
    if (!row) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Parse into DigitalProduct
    const product: DigitalProduct = {
      id: row.id,
      projectName: row.project_name,
      productType: row.product_type as DigitalProduct["productType"],
      status: row.status as DigitalProduct["status"],
      currentStep: row.current_step as DigitalProduct["currentStep"],
      stepStatuses: row.step_statuses ? JSON.parse(row.step_statuses) : {},
      inspiration: row.inspiration ? JSON.parse(row.inspiration) : { source: "manual" },
      config: row.config ? JSON.parse(row.config) : null,
      generation: row.generation ? JSON.parse(row.generation) : { status: "idle", result: null },
      preview: row.preview ? JSON.parse(row.preview) : { mockups: [], mockupStatus: "idle" },
      listing: row.listing
        ? JSON.parse(row.listing)
        : { title: "", description: "", tags: [], price: { min: 0, max: 0, recommended: 0 }, faqs: [], mockupIdeas: [], status: "idle" },
      publish: row.publish
        ? JSON.parse(row.publish)
        : { platform: "none", etsyStatus: "unpublished" },
      qualityScore: row.quality_score ? JSON.parse(row.quality_score) : null,
      batchMeta: row.batch_meta ? JSON.parse(row.batch_meta) : null,
      importSource: row.import_source ? JSON.parse(row.import_source) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    // Dynamic import JSZip (same pattern as notion-builder)
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    // ── 1. Listing text ──
    const listingText = buildListingText(product);
    zip.file("listing.txt", listingText);

    // ── 2. Metadata JSON ──
    const metadata = buildMetadataJson(product);
    zip.file("metadata.json", JSON.stringify(metadata, null, 2));

    // ── 3. Product file(s) ──
    const productAssets = listAssets(projectId, "product");
    const productFolder = zip.folder("product");

    if (product.productType === "notion" && product.generation.result?.type === "notion") {
      // Notion products don't have a downloadable file — include info text
      const notionInfo = [
        "Notion Template Information",
        "═══════════════════════════",
        "",
        `Page URL: ${product.generation.result.pageUrl}`,
        "",
        "Databases:",
        ...product.generation.result.databases.map(
          (db) => `  - ${db.key}: ${db.id}`
        ),
        "",
        "Note: Notion templates are delivered via a shared Notion page link.",
        "Include the Page URL above in your Etsy listing for buyers to duplicate.",
      ].join("\n");
      productFolder?.file("notion-info.txt", notionInfo);
    } else {
      // File-based products: include the actual file
      for (const asset of productAssets) {
        const result = readAssetBuffer(asset.id);
        if (result) {
          productFolder?.file(result.asset.fileName, result.buffer);
        }
      }
    }

    // ── 4. Mockup images ──
    const mockupAssets = listAssets(projectId, "mockup");
    if (mockupAssets.length > 0) {
      const mockupFolder = zip.folder("mockups");
      for (const asset of mockupAssets) {
        const result = readAssetBuffer(asset.id);
        if (result) {
          mockupFolder?.file(result.asset.fileName, result.buffer);
        }
      }
    }

    // ── Generate ZIP ──
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    // Build filename
    const safeName = product.projectName
      .replace(/[^a-zA-Z0-9-_ ]/g, "")
      .replace(/\s+/g, "-")
      .toLowerCase()
      .substring(0, 50);
    const fileName = `${safeName}-listing-package.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(zipBuffer.length),
      },
    });
  } catch (err) {
    console.error("[Digital Export POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Export failed" },
      { status: 500 }
    );
  }
}
