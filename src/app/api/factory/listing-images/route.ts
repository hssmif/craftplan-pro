// ══════════════════════════════════════════════════════════════
// Factory Engine 4: Listing Images API
//
// POST /api/factory/listing-images
//   { blueprintId, factoryRunId, render?: boolean }
//   → Plans 7 listing images
//   → If render=true (default), renders PNGs and stores as assets
//
// GET /api/factory/listing-images?runId=...
//   → Returns stored image plan + asset download URLs
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { getFactoryBlueprint, getFactoryRun, updateFactoryRun, saveDigitalProject, getDigitalProject } from "@/lib/db";
import { buildListingImagePlan, summarizeImagePlan } from "@/lib/factory-visual-assets";
import { renderListingImages } from "@/lib/factory-image-renderer";
import { storeAsset } from "@/lib/digital-asset-storage";
import type { ProductBlueprint } from "@/types/factory";
import type { DigitalProductConfig } from "@/types/digital-product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reconstruct a full ProductBlueprint from DB row */
function reconstructBlueprint(
  raw: Record<string, unknown>,
  factoryRunId: string
): ProductBlueprint {
  const config = JSON.parse(raw.config as string) as DigitalProductConfig;
  const differentiation = JSON.parse(
    (raw.differentiation_strategy as string) || "{}"
  );

  return {
    id: raw.id as string,
    factoryRunId: (raw.factory_run_id as string) || factoryRunId || "",
    sourceListingTitle: raw.source_listing_title as string,
    productType: raw.product_type as ProductBlueprint["productType"],
    config,
    competitorStrengths: JSON.parse(
      (raw.competitor_strengths as string) || "[]"
    ),
    competitorWeaknesses: JSON.parse(
      (raw.competitor_weaknesses as string) || "[]"
    ),
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
        '{"primary":"#1B3A5C","secondary":"#2C5282","accent":"#D4AF37","background":"#FFFFFF","text":"#2D3436","success":"#22C55E","danger":"#EF4444"}'
    ),
    sampleDataStrategy: (raw.sample_data as string) || "",
    deliveryMethod:
      (raw.delivery_method as string as ProductBlueprint["deliveryMethod"]) ||
      "both",

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
    const {
      blueprintId,
      factoryRunId,
      render = true,
      useGemini = true,
    } = body;
    let { googleSheetId, googleSheetUrl, premiumNiche } = body;

    if (!blueprintId) {
      return NextResponse.json(
        { error: "Missing blueprintId" },
        { status: 400 }
      );
    }

    // ── DB fallback: if caller didn't pass googleSheetId, look it up ──
    // This ensures the premium path is used even if the orchestrator
    // had a bug or the caller is hitting this endpoint directly.
    if (!googleSheetId && factoryRunId) {
      const existingRun = getFactoryRun(factoryRunId);
      if (existingRun?.google_sheet_id) {
        googleSheetId = existingRun.google_sheet_id as string;
        googleSheetUrl = googleSheetUrl || `https://docs.google.com/spreadsheets/d/${googleSheetId}/edit`;
        console.log(`[listing-images] Resolved googleSheetId from DB: ${googleSheetId}`);
      }
    }

    // ── Resolve premiumNiche from blueprint if not passed ──
    if (!premiumNiche && blueprintId) {
      try {
        const bp = getFactoryBlueprint(blueprintId);
        if (bp) {
          const bpConfig = JSON.parse((bp.config as string) || "{}");
          const title = ((bp.source_listing_title as string) || "").toLowerCase();
          const combined = `${bpConfig.sheetsType || ""} ${title}`;
          if (/wedding|bridal|bride|groom|vendor.?track|guest.?list/.test(combined)) premiumNiche = "wedding";
          else if (/baby|infant|newborn|nursery|toddler/.test(combined)) premiumNiche = "baby";
          else if (/travel|trip|vacation|itinerary/.test(combined)) premiumNiche = "travel";
          else premiumNiche = "budget";
          console.log(`[listing-images] Resolved premiumNiche from blueprint: ${premiumNiche}`);
        }
      } catch { /* ignore — will default to budget */ }
    }

    // ══════════════════════════════════════════════════════════
    // PREMIUM PATH: Use real Google Sheet image pipeline
    // When Engine 3 built a real Google Sheet, screenshot the
    // actual product instead of generating synthetic HTML.
    // ══════════════════════════════════════════════════════════

    if (googleSheetId && render) {
      console.log(`[listing-images] Premium path: using real Google Sheet ${googleSheetId}`);
      const niche = premiumNiche || "budget";
      const scriptPath = path.resolve(process.cwd(), "scripts/etsy-image-pipeline.mjs");

      const runId =
        factoryRunId ||
        `fr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      // Ensure digital_projects row exists
      const projectId = (() => {
        const run = factoryRunId ? getFactoryRun(factoryRunId) : null;
        return (run?.project_id as string) || `proj_${runId}`;
      })();

      if (!getDigitalProject(projectId)) {
        saveDigitalProject({
          id: projectId,
          project_name: "Factory Product",
          product_type: "sheets",
          status: "generating",
          current_step: "listing-images",
        });
      }

      try {
        const sheetUrl = googleSheetUrl || `https://docs.google.com/spreadsheets/d/${googleSheetId}/edit`;
        console.log(`[listing-images] Running: node "${scriptPath}" "${sheetUrl}" --niche ${niche}`);

        // Use async spawn instead of execSync so the Node.js event loop
        // stays free — this allows polling requests to be served while
        // the pipeline runs (avoids UI appearing "stuck")
        const stdout = await new Promise<string>((resolve, reject) => {
          const child = spawn(
            "/bin/sh",
            ["-c", '"$1" "$2" "$3" --niche "$4"', "factory-listing-images", process.execPath, scriptPath, sheetUrl, niche],
            {
            cwd: process.cwd(),
            env: { ...process.env },
            timeout: 300_000,
            }
          );
          let out = "";
          let err = "";
          child.stdout.on("data", (d: Buffer) => { out += d.toString(); });
          child.stderr.on("data", (d: Buffer) => { err += d.toString(); });
          child.on("close", (code) => {
            if (code === 0) resolve(out);
            else reject(new Error(`Pipeline exited ${code}: ${err.slice(-200)}`));
          });
          child.on("error", reject);
        });

        // Parse the output directory from the pipeline
        // The pipeline outputs: __OUTPUT_DIR__/full/path__OUTPUT_END__
        const dirMatch = stdout.match(/__OUTPUT_DIR__(.+?)__OUTPUT_END__/)
          || stdout.match(/📁\s*(.+)/)
          || stdout.match(/Listing assets ready → (.+)/);
        const outputDir = dirMatch
          ? dirMatch[1].trim()
          : path.join(process.cwd(), "output", "listing-images", `${niche}_${Date.now()}`);

        // Read all generated images from the output directory
        const imageFiles: Array<{
          slot: number;
          kind: string;
          title: string;
          buffer: Buffer;
          sizeBytes: number;
          width: number;
          height: number;
        }> = [];

        if (fs.existsSync(outputDir)) {
          const pngFiles = fs.readdirSync(outputDir)
            .filter(f => f.endsWith(".png"))
            .sort();

          for (let i = 0; i < pngFiles.length; i++) {
            const filePath = path.join(outputDir, pngFiles[i]);
            const buffer = fs.readFileSync(filePath);
            const kind = pngFiles[i].replace(/^\d+_/, "").replace(".png", "");
            imageFiles.push({
              slot: i + 1,
              kind,
              title: kind.replace(/_/g, " "),
              buffer,
              sizeBytes: buffer.length,
              width: 2000,
              height: 2000,
            });
          }
        }

        if (imageFiles.length > 0) {
          // Store each image as a digital asset
          const assetIds: string[] = [];
          const downloadUrls: string[] = [];

          for (const img of imageFiles) {
            const fileName = `listing_slot${img.slot}_${img.kind}.png`;
            const asset = storeAsset(
              projectId,
              img.buffer,
              fileName,
              img.slot === 1 ? "thumbnail" : "mockup"
            );
            assetIds.push(asset.id);
            downloadUrls.push(asset.downloadUrl);
            console.log(
              `[listing-images] Premium: stored ${img.kind} (${(img.sizeBytes / 1024).toFixed(0)} KB) → ${asset.id}`
            );
          }

          // Update factory run with image asset IDs
          if (factoryRunId) {
            updateFactoryRun(factoryRunId, {
              listingImages: assetIds,
            });
          }

          // Check for video
          const videoPath = path.join(outputDir, "promo_video.mp4");
          const hasVideo = fs.existsSync(videoPath);
          if (hasVideo && factoryRunId) {
            // Copy video to a serve-able location
            const videoDir = path.join(process.cwd(), "public", "factory-videos");
            if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });
            const videoDest = path.join(videoDir, `${factoryRunId}.mp4`);
            fs.copyFileSync(videoPath, videoDest);
            console.log(`[listing-images] Video copied to: ${videoDest}`);
          }

          return NextResponse.json({
            success: true,
            plan: {
              images: imageFiles.map((img) => ({
                slot: img.slot,
                kind: img.kind,
                title: img.title,
              })),
              thumbnailIndex: 1,
            },
            summary: `${imageFiles.length} images from real Google Sheet`,
            rendered: true,
            builderPath: "premium-image-pipeline",
            images: imageFiles.map((img, i) => ({
              slot: img.slot,
              kind: img.kind,
              title: img.title,
              width: img.width,
              height: img.height,
              sizeKB: Math.round(img.sizeBytes / 1024),
              assetId: assetIds[i],
              downloadUrl: downloadUrls[i],
            })),
            renderStats: {
              totalImages: imageFiles.length,
              totalSizeKB: Math.round(
                imageFiles.reduce((s, i) => s + i.sizeBytes, 0) / 1024
              ),
              renderTimeMs: 0,
            },
            hasVideo,
          });
        }

        console.warn("[listing-images] Premium pipeline produced no images, falling back to synthetic");
      } catch (pipeErr) {
        const msg = pipeErr instanceof Error ? pipeErr.message : "Unknown error";
        console.warn("[listing-images] Premium pipeline failed, falling back:", msg.slice(0, 200));
      }
    }

    // ══════════════════════════════════════════════════════════
    // FALLBACK: Synthetic HTML rendering (original path)
    // ══════════════════════════════════════════════════════════

    // Load blueprint from DB
    const raw = getFactoryBlueprint(blueprintId);
    if (!raw) {
      return NextResponse.json(
        { error: "Blueprint not found" },
        { status: 404 }
      );
    }

    const runId =
      factoryRunId ||
      `fr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const blueprint = reconstructBlueprint(
      raw as Record<string, unknown>,
      runId
    );

    // 1. Generate the image plan
    const plan = buildListingImagePlan(blueprint, runId);

    // 2. Store the plan on the factory run
    if (factoryRunId) {
      updateFactoryRun(factoryRunId, {
        imagePlan: JSON.stringify(plan),
      });
    }

    // 3. If render=true, render PNGs and store as assets
    if (render) {
      const projectId = (() => {
        const run = factoryRunId ? getFactoryRun(factoryRunId) : null;
        return (run?.project_id as string) || `proj_${runId}`;
      })();

      // Ensure digital_projects row exists (required by FK on digital_assets)
      if (!getDigitalProject(projectId)) {
        saveDigitalProject({
          id: projectId,
          project_name: blueprint.sourceListingTitle || "Factory Product",
          product_type: "sheets",
          status: "generating",
          current_step: "listing-images",
        });
      }

      console.log(`[listing-images] Rendering ${plan.images.length} images (Gemini: ${useGemini})...`);
      const renderResult = await renderListingImages(blueprint, plan, { useGemini });

      // Store each rendered image as a digital asset
      const assetIds: string[] = [];
      const downloadUrls: string[] = [];

      for (const img of renderResult.images) {
        const fileName = `listing_slot${img.slot}_${img.kind}.png`;
        const asset = storeAsset(
          projectId,
          img.buffer,
          fileName,
          img.slot === plan.thumbnailIndex ? "thumbnail" : "mockup"
        );
        assetIds.push(asset.id);
        downloadUrls.push(asset.downloadUrl);
        console.log(
          `[listing-images] Stored slot ${img.slot} (${img.kind}): ${asset.id} — ${(img.sizeBytes / 1024).toFixed(0)} KB`
        );
      }

      // Update factory run with image asset IDs
      if (factoryRunId) {
        updateFactoryRun(factoryRunId, {
          listingImages: assetIds,
        });
      }

      return NextResponse.json({
        success: true,
        plan,
        summary: summarizeImagePlan(plan),
        rendered: true,
        images: renderResult.images.map((img, i) => ({
          slot: img.slot,
          kind: img.kind,
          title: img.title,
          width: img.width,
          height: img.height,
          sizeKB: Math.round(img.sizeBytes / 1024),
          assetId: assetIds[i],
          downloadUrl: downloadUrls[i],
        })),
        renderStats: {
          totalImages: renderResult.images.length,
          totalSizeKB: Math.round(renderResult.totalSizeBytes / 1024),
          renderTimeMs: renderResult.renderTimeMs,
        },
      });
    }

    // Plan-only mode (no rendering)
    return NextResponse.json({
      success: true,
      plan,
      summary: summarizeImagePlan(plan),
      rendered: false,
    });
  } catch (err) {
    console.error("[Factory Listing Images]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Image generation failed",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const runId = searchParams.get("runId");

    if (!runId) {
      return NextResponse.json(
        { error: "Missing runId query parameter" },
        { status: 400 }
      );
    }

    const run = getFactoryRun(runId);
    if (!run) {
      return NextResponse.json(
        { error: "Factory run not found" },
        { status: 404 }
      );
    }

    const imagePlan = run.image_plan
      ? JSON.parse(run.image_plan as string)
      : null;
    const listingImages = run.listing_images
      ? JSON.parse(run.listing_images as string)
      : [];

    if (!imagePlan) {
      return NextResponse.json(
        { error: "No image plan stored for this run" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      plan: imagePlan,
      summary: summarizeImagePlan(imagePlan),
      assetIds: listingImages,
      downloadUrls: (listingImages as string[]).map(
        (id: string) => `/api/digital/download/${id}`
      ),
    });
  } catch (err) {
    console.error("[Factory Listing Images GET]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to fetch image plan",
      },
      { status: 500 }
    );
  }
}
