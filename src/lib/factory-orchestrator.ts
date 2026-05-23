// ══════════════════════════════════════════════════════════════
// Factory Orchestrator — One-Click Production Pipeline
//
// 8-step pipeline:
//   scan → pick opportunity → strategy → blueprint → generate
//   → render images → listing copy → package → ready_to_list
//
// Run modes:
//   full / single_best — scan keywords, auto-pick best, full pipeline
//   selected_opportunity — user picked a specific opportunity
//   from-blueprint — skip scan+blueprint, build from existing
//   top_n — build top N products from a niche (batch)
// ══════════════════════════════════════════════════════════════

import { createFactoryRun, updateFactoryRun, getFactoryRun } from "@/lib/db";
import { generateDeviceMockups } from "@/lib/factory-device-mockups";
import { generateSlideshowVideo } from "@/lib/factory-slideshow-video";
import { storeAsset } from "@/lib/digital-asset-storage";
import fs from "fs";
import path from "path";
import type {
  FactoryRunInput,
  FactoryRunOutput,
  FactoryEngineLog,
  FactoryRunStatus,
  FactoryEngine,
  OpportunityListing,
  ReadyToListPackage,
} from "@/types/factory";

// ── Helpers ──────────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function engineEntry(engine: FactoryEngine, name: string): FactoryEngineLog {
  return { engine, name, status: "pending" };
}

function elapsed(start: number): number {
  return Date.now() - start;
}

/** Safe JSON fetch helper */
async function apiFetch<T = Record<string, unknown>>(
  url: string,
  body: Record<string, unknown>,
  label: string,
  timeoutMs = 180_000,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(`${label}: ${errBody.error || `HTTP ${resp.status}`}`);
    }
    return resp.json() as Promise<T>;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Main entry point ─────────────────────────────────────────

export async function executeFactoryRun(
  input: FactoryRunInput,
  baseUrl: string,
  overrideRunId?: string
): Promise<FactoryRunOutput> {
  const runId = overrideRunId || genId("fr");
  const totalStart = Date.now();

  // Normalize mode aliases
  const mode = input.mode === "single_best" ? "full" :
               input.mode === "selected_opportunity" ? "from-opportunity" :
               input.mode;

  const engineLog: FactoryEngineLog[] = [
    engineEntry(1, "Discover"),
    engineEntry(2, "Strategize"),
    engineEntry(3, "Build"),
    engineEntry(4, "Capture"),
    engineEntry(5, "Package"),
  ];

  // Accumulated state across phases
  let blueprintId: string | undefined = input.blueprintId;
  let projectId: string | undefined;
  let packageReady = false;
  const readyToList: ReadyToListPackage = {};

  // ── Create run in DB ───────────────────────────────────────
  createFactoryRun({
    id: runId,
    keywords: input.keywords,
    opportunityId: input.opportunityId,
  });

  updateFactoryRun(runId, {
    status: "scanning" as FactoryRunStatus,
    startedAt: new Date().toISOString(),
    engineLog,
  });

  const persist = (status: FactoryRunStatus, extra?: Record<string, unknown>) => {
    updateFactoryRun(runId, { status, engineLog, ...extra });
  };

  try {
    // ═══════════════════════════════════════════════════════════
    // PHASE 1: DISCOVER (Engine 1)
    // ═══════════════════════════════════════════════════════════

    let scanTopListing: Record<string, unknown> | null = null;

    // If caller already provided opportunity data, use it directly
    if (input.opportunityData) {
      scanTopListing = { ...input.opportunityData };
      engineLog[0].status = "done";
      engineLog[0].output = {
        reason: "opportunity data provided directly",
        title: input.opportunityData.title,
      };
    } else if ((mode === "full") && input.keywords?.length) {
      engineLog[0].status = "running";
      persist("scanning");
      const t = Date.now();

      try {
        const scanData = await apiFetch<Record<string, unknown>>(
          `${baseUrl}/api/factory/scan`,
          { keywords: input.keywords },
          "Engine 1 (Discover)",
          90_000,
        );

        const topListings: OpportunityListing[] =
          (scanData.scan as Record<string, unknown>)?.topListings as OpportunityListing[] ??
          ((scanData.scans as Array<Record<string, unknown>>)?.[0]?.topListings as OpportunityListing[]) ??
          [];

        const topRecs =
          (scanData.scan as Record<string, unknown>)?.recommendations ??
          scanData.topRecommendations ??
          [];

        // Pick the BEST opportunity (highest overall score)
        const bestListing =
          topListings.length > 0
            ? topListings.reduce((best, cur) =>
                (cur.score?.overall ?? 0) > (best.score?.overall ?? 0) ? cur : best
              )
            : null;

        if (bestListing) {
          scanTopListing = {
            title: bestListing.title,
            tags: bestListing.tags || [],
            price: bestListing.price || 10,
            reviews: bestListing.reviewCount || 0,
            revenueEstimate: bestListing.revenueEstimate || 0,
            niche: input.keywords[0],
          };
        }

        engineLog[0].status = "done";
        engineLog[0].durationMs = elapsed(t);
        engineLog[0].output = {
          totalMatches:
            (scanData.scan as Record<string, unknown>)?.totalMatches ??
            (scanData.summary as Record<string, unknown>)?.totalMatches ?? 0,
          topScore: bestListing?.score?.overall ?? 0,
          pickedOpportunity: bestListing?.title ?? "",
          recommendationCount: Array.isArray(topRecs) ? topRecs.length : 0,
          timingMs: elapsed(t),
        };
      } catch (err) {
        // Scan failure is non-critical
        engineLog[0].status = "error";
        engineLog[0].error = err instanceof Error ? err.message : "Scan failed";
        engineLog[0].durationMs = elapsed(t);
      }

      persist("scanning");
    } else if (mode === "from-opportunity") {
      engineLog[0].status = "skipped";
      engineLog[0].output = {
        reason: "from-opportunity mode",
        opportunityId: input.opportunityId,
      };
    } else {
      engineLog[0].status = "skipped";
      engineLog[0].output = { reason: `mode=${mode}` };
    }

    persist("scanning");

    // ═══════════════════════════════════════════════════════════
    // PHASE 2: STRATEGIZE (Engine 2)
    // ═══════════════════════════════════════════════════════════

    if (mode !== "from-blueprint" || !blueprintId) {
      engineLog[1].status = "running";
      persist("blueprinting");
      const t = Date.now();

      const competitorData: Record<string, unknown> = scanTopListing || {
        title: input.keywords?.[0] || "budget tracker google sheets",
        tags: input.keywords || [],
        price: 12,
      };
      competitorData.factoryRunId = runId;

      if (input.opportunityId) {
        competitorData.opportunityId = input.opportunityId;
      }
      if (input.productTypeOverride) {
        competitorData.productTypeOverride = input.productTypeOverride;
      }

      const bpData = await apiFetch<{ blueprint: Record<string, unknown> }>(
        `${baseUrl}/api/factory/blueprint`,
        competitorData,
        "Engine 2 (Strategize)",
        600_000,
      );

      blueprintId = bpData.blueprint.id as string;

      engineLog[1].status = "done";
      engineLog[1].durationMs = elapsed(t);
      engineLog[1].output = {
        blueprintId,
        productType: bpData.blueprint.productType,
        positioning: bpData.blueprint.positioning,
        tabCount: Array.isArray(bpData.blueprint.tabs) ? bpData.blueprint.tabs.length : 0,
        chartCount: Array.isArray(bpData.blueprint.charts) ? bpData.blueprint.charts.length : 0,
        suggestedPrice: bpData.blueprint.suggestedPrice,
        timingMs: elapsed(t),
      };

      if (typeof bpData.blueprint.suggestedPrice === "number") {
        readyToList.suggestedPrice = bpData.blueprint.suggestedPrice as number;
      }

      persist("blueprinting", { blueprintId });
    } else {
      engineLog[1].status = "skipped";
      engineLog[1].output = { reason: "from-blueprint mode", blueprintId };
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 3: BUILD (Engine 3)
    // ═══════════════════════════════════════════════════════════

    engineLog[2].status = "running";
    persist("generating");
    const buildStart = Date.now();

    let buildSuccess = false;
    try {
      const buildData = await apiFetch<{
        success: boolean;
        projectId: string;
        assetId?: string;
        fileName?: string;
        fileSizeBytes?: number;
        gwsEnhanced?: boolean;
        downloadUrl?: string;
        spreadsheetId?: string;
        spreadsheetUrl?: string;
        builderPath?: string;
        codedEngine?: string;
        codedStrategy?: string;
        premiumNiche?: string;
        geminiProductName?: string;
        tabCount?: number;
        variants?: Array<{
          key: string;
          label: string;
          fileName: string;
          fileSizeBytes: number;
          downloadUrl?: string;
          assetId?: string;
        }>;
      }>(
        `${baseUrl}/api/factory/build-product`,
        { blueprintId, factoryRunId: runId },
        "Engine 3 (Build — universal)",
        300_000,
      );

      projectId = buildData.projectId;
      buildSuccess = true;

      // Google Sheets API path — store sheet URL for direct browser access
      if (buildData.spreadsheetId && buildData.spreadsheetUrl) {
        readyToList.googleSheetId = buildData.spreadsheetId;
        readyToList.googleSheetUrl = buildData.spreadsheetUrl;
      }

      // Store premium niche for the image pipeline
      if (buildData.premiumNiche) {
        (readyToList as Record<string, unknown>).premiumNiche = buildData.premiumNiche;
      }

      // Store builder provenance for UI badge
      if (buildData.builderPath) {
        readyToList.builderPath = buildData.builderPath;
      }
      if (buildData.geminiProductName) {
        readyToList.geminiProductName = buildData.geminiProductName;
      }
      if (buildData.tabCount) {
        readyToList.tabCount = buildData.tabCount;
      }
      // Multi-palette variants — surfaced in the Review step UI
      if (buildData.variants?.length) {
        readyToList.variants = buildData.variants;
      }

      if (buildData.assetId && buildData.downloadUrl) {
        readyToList.productAsset = {
          assetId: buildData.assetId,
          downloadUrl: buildData.downloadUrl,
          fileName: buildData.fileName || "product.xlsx",
        };
      }

      engineLog[2].output = {
        projectId: buildData.projectId,
        fileName: buildData.fileName,
        fileSizeBytes: buildData.fileSizeBytes,
        downloadUrl: buildData.downloadUrl,
        assetId: buildData.assetId,
        gwsEnhanced: buildData.gwsEnhanced ?? false,
        builderPath: buildData.builderPath ?? "universal-builder",
        codedEngine: (buildData as Record<string, unknown>).codedEngine,
        codedStrategy: (buildData as Record<string, unknown>).codedStrategy,
        geminiProductName: (buildData as Record<string, unknown>).geminiProductName,
        tabCount: (buildData as Record<string, unknown>).tabCount,
        path: "universal-builder",
        timingMs: elapsed(buildStart),
      };
    } catch {
      console.warn("[Orchestrator] build-product unavailable, falling back to legacy");

      const genData = await apiFetch<{
        success: boolean;
        projectId: string;
        fileName?: string;
        gwsEnhanced?: boolean;
        fileSizeBytes?: number;
        downloadUrl?: string;
        assetId?: string;
      }>(
        `${baseUrl}/api/factory/generate`,
        { blueprintId, factoryRunId: runId },
        "Engine 3 (Build — legacy)",
        180_000,
      );

      projectId = genData.projectId;
      buildSuccess = true;

      if (genData.assetId && genData.downloadUrl) {
        readyToList.productAsset = {
          assetId: genData.assetId,
          downloadUrl: genData.downloadUrl,
          fileName: genData.fileName || "product.xlsx",
        };
      }

      engineLog[2].output = {
        projectId: genData.projectId,
        fileName: genData.fileName,
        fileSizeBytes: genData.fileSizeBytes,
        downloadUrl: genData.downloadUrl,
        assetId: genData.assetId,
        gwsEnhanced: genData.gwsEnhanced ?? false,
        path: "legacy-generate",
        timingMs: elapsed(buildStart),
      };
    }

    if (!buildSuccess) {
      throw new Error("Engine 3: Both build paths failed");
    }

    engineLog[2].status = "done";
    engineLog[2].durationMs = elapsed(buildStart);
    persist("generating", { projectId });

    console.log("[Orchestrator] Phase 3 done. projectId:", projectId, "blueprintId:", blueprintId);

    // ═══════════════════════════════════════════════════════════
    // PHASE 4: CAPTURE (Engine 4) — Images then Copy (sequential
    // to avoid dev-server self-referencing fetch deadlock)
    // ═══════════════════════════════════════════════════════════

    engineLog[3].status = "running";
    persist("imaging");
    const captureStart = Date.now();

    const capturePayload = {
      blueprintId,
      factoryRunId: runId,
      render: true,
      // Pass the real Google Sheet info so Engine 4 can screenshot
      // the actual product instead of synthetic HTML
      googleSheetId: readyToList.googleSheetId,
      googleSheetUrl: readyToList.googleSheetUrl,
      premiumNiche: (readyToList as Record<string, unknown>).premiumNiche,
    };

    console.log("[Orchestrator] Starting Phase 4 — listing-images fetch to:", `${baseUrl}/api/factory/listing-images`);

    // Run sequentially — parallel self-fetch deadlocks Next.js dev server
    const imagesResult = await Promise.allSettled([
      apiFetch<{
        plan?: { images?: unknown[]; thumbnailIndex?: number };
        rendered?: boolean;
        images?: Array<{
          slot: number;
          kind: string;
          sizeKB: number;
          assetId: string;
          downloadUrl: string;
        }>;
        renderStats?: { totalImages: number; totalSizeKB: number; renderTimeMs: number };
      }>(
        `${baseUrl}/api/factory/listing-images`,
        capturePayload,
        "Engine 4a (Images)",
        300_000,
      ),
    ]).then(r => r[0]);

    const copyResult = await Promise.allSettled([
      apiFetch<{
        listing?: {
          recommendedTitle?: string;
          tags?: string[];
          fullDescription?: string;
          pricing?: { standardPrice?: number; launchPrice?: number };
        };
      }>(
        `${baseUrl}/api/factory/listing-copy`,
        capturePayload,
        "Engine 4b (Copy)",
        180_000,
      ),
    ]).then(r => r[0]);

    // Process images result
    const imageOutput: Record<string, unknown> = {};
    if (imagesResult.status === "fulfilled") {
      const imgData = imagesResult.value;
      imageOutput.imageCount = imgData.plan?.images ? (imgData.plan.images as unknown[]).length : 0;
      imageOutput.thumbnailIndex = imgData.plan?.thumbnailIndex || 1;
      imageOutput.imagesOk = true;
      imageOutput.rendered = imgData.rendered || false;
      if (imgData.renderStats) {
        imageOutput.renderTimeMs = imgData.renderStats.renderTimeMs;
        imageOutput.totalSizeKB = imgData.renderStats.totalSizeKB;
        imageOutput.renderedCount = imgData.renderStats.totalImages;
      }
      if (imgData.images) {
        imageOutput.assetIds = imgData.images.map((i) => i.assetId);
        imageOutput.downloadUrls = imgData.images.map((i) => i.downloadUrl);
        readyToList.listingImages = imgData.images.map((i) => ({
          slot: i.slot,
          kind: i.kind,
          assetId: i.assetId,
          downloadUrl: i.downloadUrl,
        }));
      }
    } else {
      imageOutput.imagesOk = false;
      imageOutput.imagesError =
        imagesResult.reason instanceof Error ? imagesResult.reason.message : "Image rendering failed";
    }

    // Process copy result
    const copyOutput: Record<string, unknown> = {};
    if (copyResult.status === "fulfilled") {
      const listData = copyResult.value;
      const title = listData.listing?.recommendedTitle || "";
      const tags = listData.listing?.tags || [];
      const price = listData.listing?.pricing?.standardPrice || listData.listing?.pricing?.launchPrice || 0;
      copyOutput.title = title;
      copyOutput.tagCount = tags.length;
      copyOutput.price = price;
      copyOutput.copyOk = true;

      readyToList.listingCopy = {
        title,
        tags,
        description: listData.listing?.fullDescription || "",
        price,
      };
    } else {
      copyOutput.copyOk = false;
      copyOutput.copyError =
        copyResult.reason instanceof Error ? copyResult.reason.message : "Listing copy failed";
    }

    const bothFailed = imagesResult.status === "rejected" && copyResult.status === "rejected";
    engineLog[3].status = bothFailed ? "error" : "done";
    engineLog[3].durationMs = elapsed(captureStart);
    engineLog[3].output = { ...imageOutput, ...copyOutput, timingMs: elapsed(captureStart) };
    if (bothFailed) {
      engineLog[3].error = "Both image rendering and listing copy failed";
    }

    persist("listing");

    // ═══════════════════════════════════════════════════════════
    // PHASE 4c: AI MOCKUPS + SLIDESHOW VIDEO (non-blocking)
    // Generates Mockups-page-style photorealistic images, then
    // creates a Ken Burns slideshow video with background music.
    // ═══════════════════════════════════════════════════════════

    if (projectId) {
      try {
        console.log("[Orchestrator] Starting AI mockups + video for run:", runId);
        const mvStart = Date.now();

        // ── Collect screenshot files for device mockups + video ──
        const assetDir = path.resolve(`./data/digital-products/${projectId}`);
        const allImagePaths: string[] = [];
        if (fs.existsSync(assetDir)) {
          const files = fs.readdirSync(assetDir)
            .filter(f => (f.endsWith(".png") || f.endsWith(".jpg")) && !f.includes("mockup_"))
            .sort()
            .map(f => path.join(assetDir, f));
          allImagePaths.push(...files);
        }

        // ── Generate device frame mockups (Sharp compositing, no AI) ──
        // Uses real device outlines + actual Google Sheet screenshots
        // Cap total listing images at 10 (Etsy max). Only generate mockups to fill remaining slots.
        const existingImageCount = readyToList.listingImages?.length || 0;
        const mockupsToGenerate = Math.max(0, Math.min(3, 10 - existingImageCount));
        const screenshotsForMockups = allImagePaths.slice(0, 4);
        const mockupResults = mockupsToGenerate > 0
          ? await generateDeviceMockups(screenshotsForMockups, mockupsToGenerate, projectId)
          : [];
        console.log(`[Orchestrator] ${mockupResults.length} device mockups generated`);

        // ── Add mockups to listing images so they show in the factory UI ──
        if (!readyToList.listingImages) readyToList.listingImages = [];
        const existingSlots = readyToList.listingImages.length;
        for (let mi = 0; mi < mockupResults.length; mi++) {
          const m = mockupResults[mi];
          if (m.assetId) {
            readyToList.listingImages.push({
              slot: existingSlots + mi + 1,
              kind: m.badge.toLowerCase(),
              assetId: m.assetId,
              downloadUrl: m.downloadUrl || `/api/digital/download/${m.assetId}`,
            });
          }
        }
        // Persist updated listing images to DB
        updateFactoryRun(runId, {
          listingImages: readyToList.listingImages.map((i: Record<string, unknown>) => String(i.assetId || i)),
        });

        // Add mockup files to the video image pool
        for (const m of mockupResults) {
          if (m.assetId) {
            const mockupFile = fs.readdirSync(assetDir).find(f => f.includes("mockup_"));
            if (mockupFile) allImagePaths.push(path.join(assetDir, mockupFile));
          }
        }

        // ── Generate Ken Burns slideshow video with music ──
        if (allImagePaths.length >= 2) {
          console.log(`[Orchestrator] Creating slideshow from ${allImagePaths.length} images...`);
          const videoDir = path.join("/tmp", `factory-video/${runId}`);
          const videoResult = await generateSlideshowVideo(allImagePaths, {
            outputDir: videoDir,
            music: "ambient-soft",
          });

          if (videoResult) {
            console.log(`[Orchestrator] Video: ${Math.round(videoResult.fileSizeBytes / 1024)}KB, ${videoResult.durationSec}s, music: ${videoResult.hasMusic}`);
            // Store video as asset
            try {
              const videoBuf = fs.readFileSync(videoResult.videoPath);
              await storeAsset(projectId, videoBuf, "listing-video.mp4", "preview");
            } catch { /* non-critical */ }
          }
        }

        console.log(`[Orchestrator] Mockups + video done in ${elapsed(mvStart)}ms`);
      } catch (err) {
        // Mockup + video failure is non-critical — don't block the pipeline
        console.warn("[Orchestrator] Mockups/video failed (non-critical):", err instanceof Error ? err.message : err);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 5: PACKAGE (Engine 5)
    // ═══════════════════════════════════════════════════════════

    engineLog[4].status = "running";
    persist("packaging");
    const pkgStart = Date.now();

    try {
      const pkgData = await apiFetch<{
        zipDownloadUrl?: string;
        zipAssetId?: string;
        summary?: Record<string, unknown>;
        includedFiles?: unknown[];
      }>(
        `${baseUrl}/api/factory/package`,
        { factoryRunId: runId, blueprintId, projectId },
        "Engine 5 (Package)",
        120_000,
      );

      packageReady = true;

      if (pkgData.zipAssetId && pkgData.zipDownloadUrl) {
        readyToList.packageAsset = {
          assetId: pkgData.zipAssetId,
          downloadUrl: pkgData.zipDownloadUrl,
        };
      }

      engineLog[4].status = "done";
      engineLog[4].durationMs = elapsed(pkgStart);
      engineLog[4].output = {
        packageUrl: pkgData.zipDownloadUrl || null,
        zipAssetId: pkgData.zipAssetId || null,
        totalFiles: pkgData.includedFiles ? (pkgData.includedFiles as unknown[]).length : 0,
        summary: pkgData.summary || null,
        timingMs: elapsed(pkgStart),
      };
    } catch (err) {
      // Package failure is non-critical
      engineLog[4].status = "error";
      engineLog[4].error = err instanceof Error ? err.message : "Packaging failed";
      engineLog[4].durationMs = elapsed(pkgStart);
    }

    // ═══════════════════════════════════════════════════════════
    // FINALIZE — Determine if ready_to_list
    // ═══════════════════════════════════════════════════════════

    readyToList.totalDurationMs = elapsed(totalStart);

    // ── Populate preview + video URLs (non-blocking) ──
    if (blueprintId) {
      readyToList.blueprintId = blueprintId;
      readyToList.previewUrl = `/api/factory/preview?blueprintId=${blueprintId}`;
    }
    readyToList.videoUrl = `/api/factory/serve-video/${runId}`;

    // A run is ready_to_list if we have: product + images + copy
    const hasProduct = !!projectId;
    const hasImages = (readyToList.listingImages?.length ?? 0) > 0;
    const hasCopy = !!readyToList.listingCopy?.title;
    const isReady = hasProduct && hasImages && hasCopy;

    const finalStatus: FactoryRunStatus = isReady ? "ready_to_list" : "completed";

    updateFactoryRun(runId, {
      status: finalStatus,
      completedAt: new Date().toISOString(),
      engineLog,
    });

    return {
      factoryRunId: runId,
      status: finalStatus,
      currentEngine: undefined,
      engineStatuses: engineLog,
      projectId,
      blueprintId,
      qualityScore: undefined,
      listingPackageReady: packageReady,
      readyToList: isReady ? readyToList : undefined,
    };
  } catch (err) {
    // ── Fatal error — mark run as failed ──
    const message = err instanceof Error ? err.message : "Factory run failed";
    const currentEngine = engineLog.find((e) => e.status === "running");
    if (currentEngine) {
      currentEngine.status = "error";
      currentEngine.error = message;
    }

    readyToList.totalDurationMs = elapsed(totalStart);

    updateFactoryRun(runId, {
      status: "failed" as FactoryRunStatus,
      errorMessage: message,
      completedAt: new Date().toISOString(),
      engineLog,
    });

    return {
      factoryRunId: runId,
      status: "failed",
      currentEngine: engineLog.find((e) => e.status === "error")?.engine,
      engineStatuses: engineLog,
      projectId,
      blueprintId,
      qualityScore: undefined,
      listingPackageReady: false,
      // Return partial readyToList so UI can show what succeeded
      readyToList: readyToList.productAsset ? readyToList : undefined,
    };
  }
}

// ── Status helper ────────────────────────────────────────────

export function getRunStatus(runId: string): FactoryRunOutput | null {
  const raw = getFactoryRun(runId);
  if (!raw) return null;

  const engineLog: FactoryEngineLog[] = (() => {
    try { return JSON.parse(raw.engine_log as string); }
    catch { return []; }
  })();

  const runningEngine = engineLog.find((e) => e.status === "running");

  return {
    factoryRunId: runId,
    status: raw.status as FactoryRunStatus,
    currentEngine: runningEngine?.engine,
    engineStatuses: engineLog,
    projectId: raw.project_id as string | undefined,
    blueprintId: raw.blueprint_id as string | undefined,
    qualityScore: undefined,
    listingPackageReady: raw.package_asset_id != null,
  };
}
