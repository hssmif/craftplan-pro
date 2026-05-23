// ══════════════════════════════════════════════════════════════
// Factory Master Run API
// POST /api/factory/run — starts a full factory pipeline
// GET  /api/factory/run?id=... — get run status (with readyToList)
// GET  /api/factory/run — list all runs
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { executeFactoryRun, getRunStatus } from "@/lib/factory-orchestrator";
import { getFactoryRun, getFactoryRuns, getDigitalAssets, updateFactoryRun } from "@/lib/db";
import type { FactoryRunInput } from "@/types/factory";
import type { FactoryEngineLog, FactoryRunStatus } from "@/types/factory";

const TERMINAL_STATUSES: FactoryRunStatus[] = [
  "completed",
  "ready_to_list",
  "failed",
  "cancelled",
];
const STALLED_RUN_TIMEOUT_MS = Number(
  process.env.FACTORY_STALLED_RUN_TIMEOUT_MS ?? 30 * 60 * 1000,
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const input: FactoryRunInput = {
      mode: body.mode || "full",
      keywords: body.keywords,
      opportunityId: body.opportunityId,
      listingId: body.listingId,
      blueprintId: body.blueprintId,
      productTypeOverride: body.productTypeOverride,
      autoPickTop: body.autoPickTop,
      topN: body.topN,
      opportunityData: body.opportunityData,
    };

    // Validate: full/single_best modes require keywords
    if (
      (input.mode === "full" || input.mode === "single_best") &&
      !input.keywords?.length &&
      !input.opportunityData
    ) {
      return NextResponse.json(
        { error: "Keywords or opportunityData required for full/single_best mode" },
        { status: 400 }
      );
    }

    // from-blueprint requires blueprintId
    if (input.mode === "from-blueprint" && !input.blueprintId) {
      return NextResponse.json(
        { error: "blueprintId required for from-blueprint mode" },
        { status: 400 }
      );
    }

    // Derive base URL from request
    const url = new URL(req.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    // Pre-generate the runId so we can return it immediately
    const runId = `fr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Fire the pipeline in the background — DO NOT await.
    // The orchestrator creates the DB row synchronously (before first await),
    // then updates the DB as each engine progresses.
    // The frontend polls GET /api/factory/run?id=... for live status.
    executeFactoryRun(input, baseUrl, runId).then(
      (result) => console.log(`[Factory Run] ${result.factoryRunId} → ${result.status}`),
      (err) => console.error(`[Factory Run] ${runId} pipeline error:`, err)
    );

    // Give the synchronous DB creation a tick to complete
    await new Promise((r) => setTimeout(r, 50));

    return NextResponse.json({
      success: true,
      factoryRunId: runId,
      status: "scanning",
      engineStatuses: [
        { engine: 1, name: "Discover", status: "running" },
        { engine: 2, name: "Strategize", status: "pending" },
        { engine: 3, name: "Build", status: "pending" },
        { engine: 4, name: "Capture", status: "pending" },
        { engine: 5, name: "Package", status: "pending" },
      ],
    });
  } catch (err) {
    console.error("[Factory Run POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Factory run failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const runId = searchParams.get("id");

    if (runId) {
      // First try the in-memory status helper (richer data)
      const liveStatus = getRunStatus(runId);

      // Also load from DB for raw fields
      let run = getFactoryRun(runId);
      if (!run && !liveStatus) {
        return NextResponse.json({ error: "Run not found" }, { status: 404 });
      }

      if (run) {
        run = markRunFailedIfStalled(run);
        // Parse JSON fields from DB
        const parsedRun = {
          id: run.id,
          status: run.status,
          projectId: run.project_id || null,
          blueprintId: run.blueprint_id || null,
          keywords: run.keywords ? JSON.parse(run.keywords as string) : null,
          engineLog: run.engine_log ? JSON.parse(run.engine_log as string) : [],
          listingImages: run.listing_images ? JSON.parse(run.listing_images as string) : null,
          listingCopy: run.listing_copy ? JSON.parse(run.listing_copy as string) : null,
          imagePlan: run.image_plan ? JSON.parse(run.image_plan as string) : null,
          packageAssetId: run.package_asset_id || null,
          etsyListingId: run.etsy_listing_id || null,
          etsyListingUrl: run.etsy_listing_url || null,
          etsyStatus: run.etsy_status || null,
          errorMessage: run.error_message || null,
          startedAt: run.started_at || null,
          completedAt: run.completed_at || null,
          createdAt: run.created_at,
        };

        // Build readyToList from DB fields if status is ready_to_list or completed
        let readyToList = null;
        if (
          parsedRun.status === "ready_to_list" ||
          parsedRun.status === "completed"
        ) {
          readyToList = buildReadyToListFromDb(run);
        }

        return NextResponse.json({
          run: parsedRun,
          readyToList,
          liveStatus: liveStatus || null,
        });
      }

      // Fallback to live status only
      return NextResponse.json({
        run: { id: runId, status: liveStatus?.status || "unknown" },
        liveStatus,
      });
    }

    // List all runs
    const runs = getFactoryRuns(50).map(markRunFailedIfStalled);
    return NextResponse.json({
      runs: runs.map((r) => ({
        id: r.id,
        status: r.status,
        projectId: r.project_id || null,
        blueprintId: r.blueprint_id || null,
        keywords: r.keywords ? JSON.parse(r.keywords as string) : null,
        engineLog: r.engine_log ? JSON.parse(r.engine_log as string) : [],
        errorMessage: r.error_message || null,
        packageAssetId: r.package_asset_id || null,
        etsyListingId: r.etsy_listing_id || null,
        etsyListingUrl: r.etsy_listing_url || null,
        etsyStatus: r.etsy_status || null,
        startedAt: r.started_at || null,
        completedAt: r.completed_at || null,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error("[Factory Run GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch runs" },
      { status: 500 }
    );
  }
}

// ── Helper: reconstruct ReadyToListPackage from DB fields ────

function markRunFailedIfStalled(run: Record<string, unknown>): Record<string, unknown> {
  const status = run.status as FactoryRunStatus;
  if (TERMINAL_STATUSES.includes(status)) return run;

  const startedAt = typeof run.started_at === "string"
    ? Date.parse(run.started_at)
    : typeof run.created_at === "string"
      ? Date.parse(run.created_at)
      : NaN;
  if (!Number.isFinite(startedAt)) return run;

  const ageMs = Date.now() - startedAt;
  if (ageMs < STALLED_RUN_TIMEOUT_MS) return run;

  let engineLog: FactoryEngineLog[] = [];
  try {
    engineLog = run.engine_log ? JSON.parse(run.engine_log as string) : [];
  } catch {
    engineLog = [];
  }

  const runningEngine = engineLog.find((entry) => entry.status === "running");
  const message = `Factory run stalled for ${Math.round(ageMs / 60_000)} minutes at ${
    runningEngine ? `Engine ${runningEngine.engine} (${runningEngine.name})` : status
  }. Marked failed so you can start a fresh build.`;

  if (runningEngine) {
    runningEngine.status = "error";
    runningEngine.error = message;
  }

  const updated = {
    ...run,
    status: "failed",
    error_message: message,
    completed_at: new Date().toISOString(),
    engine_log: JSON.stringify(engineLog),
  };

  updateFactoryRun(run.id as string, {
    status: "failed",
    errorMessage: message,
    completedAt: updated.completed_at,
    engineLog,
  });

  return updated;
}

function buildReadyToListFromDb(run: Record<string, unknown>) {
  const readyToList: Record<string, unknown> = {};

  // Product asset — look up the actual xlsx asset for this project.
  // (The previous code wrongly used project_id as the asset id, which
  // breaks every API that needs the real asset ID.)
  if (run.project_id) {
    const productAssets = getDigitalAssets(run.project_id as string, "product");
    const xlsxAsset = productAssets.find((a) =>
      a.mime_type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) || productAssets[0];

    if (xlsxAsset) {
      readyToList.productAsset = {
        assetId: xlsxAsset.id,
        downloadUrl: `/api/digital/download/${xlsxAsset.id}`,
        fileName: xlsxAsset.file_name,
      };

      // Also surface ALL xlsx variants (multi-palette SKUs) for the UI
      const allXlsx = productAssets.filter((a) =>
        a.mime_type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      if (allXlsx.length > 1) {
        // Detect variant key from filename suffix (e.g. "...-neutral.xlsx")
        const labelByKey: Record<string, string> = {
          neutral: "Neutral Cream",
          dark: "Dark Mode",
          cherry: "Cherry Coquette",
        };
        readyToList.variants = allXlsx.map((a) => {
          const m = a.file_name.match(/-(neutral|dark|cherry)\.xlsx$/i);
          const key = m ? m[1].toLowerCase() : "primary";
          return {
            key,
            label: labelByKey[key] || a.file_name,
            fileName: a.file_name,
            fileSizeBytes: a.file_size_bytes,
            downloadUrl: `/api/digital/download/${a.id}`,
            assetId: a.id,
          };
        });
      }
    } else {
      // Fall back to the legacy behavior so old downloads keep working
      readyToList.productAsset = {
        assetId: run.project_id,
        downloadUrl: `/api/digital/download/${run.project_id}`,
        fileName: "product.xlsx",
      };
    }
  }

  // Listing images
  if (run.listing_images) {
    try {
      const imageIds = JSON.parse(run.listing_images as string) as string[];
      readyToList.listingImages = imageIds.map((id, i) => {
        // id may already be a full download URL like "/api/digital/download/da_xxx"
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

  // Listing copy — normalize field names for the UI component
  if (run.listing_copy) {
    try {
      const raw = JSON.parse(run.listing_copy as string);
      readyToList.listingCopy = {
        ...raw,
        // Map alternative field names to what the UI expects
        title: raw.title || raw.recommendedTitle || "",
        description: raw.description || raw.fullDescription || "",
      };
    } catch { /* ignore */ }
  }

  // Package
  if (run.package_asset_id) {
    readyToList.packageAsset = {
      assetId: run.package_asset_id,
      downloadUrl: `/api/digital/download/${run.package_asset_id}`,
    };
  }

  // Preview + Video URLs
  if (run.blueprint_id) {
    readyToList.blueprintId = run.blueprint_id;
    readyToList.previewUrl = `/api/factory/preview?blueprintId=${run.blueprint_id}`;
  }
  readyToList.videoUrl = `/api/factory/serve-video/${run.id}`;

  // Google Sheet direct link (when built via Google Sheets API)
  if (run.google_sheet_id) {
    readyToList.googleSheetId = run.google_sheet_id as string;
    readyToList.googleSheetUrl = `https://docs.google.com/spreadsheets/d/${run.google_sheet_id}/edit`;
  }

  return readyToList;
}
