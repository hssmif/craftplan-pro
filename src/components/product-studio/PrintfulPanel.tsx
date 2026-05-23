"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStudioStore } from "@/stores/studioStore";
import { useSSEProgress } from "@/hooks/useSSEProgress";
import type { PrintfulProductRecord, EtsyListingRecord } from "@/types/product-studio";

// ── Component ──

export function PrintfulPanel() {
  const project = useStudioStore((s) => s.project);
  const setPrintfulProducts = useStudioStore((s) => s.setPrintfulProducts);
  const setEtsyListings = useStudioStore((s) => s.setEtsyListings);
  const setStepStatus = useStudioStore((s) => s.setStepStatus);

  const { events, latestEvent, isRunning, error, startPublish, abort, reset } =
    useSSEProgress();

  // Pre-flight connection check
  const [printfulStatus, setPrintfulStatus] = useState<{
    connected: boolean;
    storeName?: string;
    storeType?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/printful/status")
      .then((r) => r.json())
      .then((data) =>
        setPrintfulStatus({
          connected: data.connected,
          storeName: data.store?.name,
          storeType: data.storeType || data.store?.type,
          error: data.error,
        })
      )
      .catch(() =>
        setPrintfulStatus({ connected: false, error: "Cannot reach server" })
      );
  }, []);

  const selectedDesigns = useMemo(
    () => project.designs.filter((d) => d.selected),
    [project.designs]
  );
  const enabledProducts = useMemo(
    () => project.productConfigs.filter((p) => p.enabled),
    [project.productConfigs]
  );

  // Guard against re-processing pipeline completion
  const pipelineDoneProcessed = useRef(false);

  // Track per-design results from SSE events
  const designResults = useMemo(() => {
    const results: Record<string, {
      printfulFileId?: number;
      printfulFileUrl?: string;
      syncProductId?: number;
      pushed?: boolean;
      pushError?: string;
      mockupUrls?: string[];
      currentStep?: number;
      currentLabel?: string;
      status: "pending" | "running" | "done" | "error";
      error?: string;
    }> = {};

    // Initialize all designs
    for (const d of selectedDesigns) {
      results[d.id] = { status: "pending" };
    }

    // Process events
    for (const evt of events) {
      if (!evt.designId) continue;
      if (!results[evt.designId]) results[evt.designId] = { status: "pending" };

      const r = results[evt.designId];

      if (evt.type === "design-start") {
        r.status = "running";
      }
      if (evt.type === "step") {
        r.currentStep = evt.step;
        r.currentLabel = evt.label;
        if (evt.printfulFileId) r.printfulFileId = evt.printfulFileId;
        if (evt.printfulFileUrl) r.printfulFileUrl = evt.printfulFileUrl;
        if (evt.syncProductId) r.syncProductId = evt.syncProductId;
        if (evt.pushed !== undefined) r.pushed = evt.pushed;
        if (evt.pushError) r.pushError = evt.pushError;
        if (evt.mockupUrls) r.mockupUrls = evt.mockupUrls;
        if (evt.status === "error") {
          r.status = "error";
          r.error = evt.error;
        }
      }
      if (evt.type === "design-done") {
        r.status = "done";
        if (evt.printfulFileId) r.printfulFileId = evt.printfulFileId;
        if (evt.printfulFileUrl) r.printfulFileUrl = evt.printfulFileUrl;
        if (evt.syncProductId) r.syncProductId = evt.syncProductId;
        if (evt.pushed !== undefined) r.pushed = evt.pushed;
        if (evt.pushError) r.pushError = evt.pushError;
        if (evt.mockupUrls) r.mockupUrls = evt.mockupUrls;
      }
    }

    return results;
  }, [events, selectedDesigns]);

  // Reset the guard when a new publish starts
  useEffect(() => {
    if (isRunning) {
      pipelineDoneProcessed.current = false;
    }
  }, [isRunning]);

  // Update store when pipeline completes (once)
  useEffect(() => {
    if (latestEvent?.type !== "pipeline-done") return;
    if (pipelineDoneProcessed.current) return;
    pipelineDoneProcessed.current = true;

    // Build PrintfulProductRecord[] and EtsyListingRecord[] from results
    const printfulProducts: PrintfulProductRecord[] = [];
    const etsyListings: EtsyListingRecord[] = [];

    for (const [designId, result] of Object.entries(designResults)) {
      if (result.printfulFileId) {
        printfulProducts.push({
          designId,
          productConfigIndex: 0,
          fileId: result.printfulFileId,
          fileUrl: result.printfulFileUrl || "",
          syncProductId: result.syncProductId,
          pushed: result.pushed ?? false,
          pushError: result.pushError,
          mockupUrls: result.mockupUrls || [],
          variantIds: [],
          status: result.status === "error" ? "error" : "done",
          error: result.error,
        });

        // Create a corresponding EtsyListingRecord with "ready-to-finish" status
        etsyListings.push({
          designId,
          printfulSyncProductId: result.syncProductId,
          status: "ready-to-finish",
          imagesUploaded: 0,
        });
      }
    }

    setPrintfulProducts(printfulProducts);
    setEtsyListings(etsyListings);
    setStepStatus("printful", "done");
    // Note: etsy-sync step is NOT marked done — user must finish on Etsy
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestEvent, designResults]);

  // ── Start publish ──
  const handlePublish = async () => {
    reset();
    setStepStatus("printful", "running");

    await startPublish({
      designs: selectedDesigns.map((d) => ({
        id: d.id,
        dataUrl: d.dataUrl,
        phrase: d.phrase || d.graphicDescription || "Design",
        imageUrl: d.imageUrl,
      })),
      products: enabledProducts.map((p) => ({
        catalogProductId: p.catalogProductId,
        productName: p.productName,
        markupPercent: p.markupPercent,
        taxonomyId: p.taxonomyId,
      })),
      listings: project.listings.map((l) => ({
        designId: l.designId,
        title: l.title,
        description: l.description,
        tags: l.tags,
        price: l.price,
        taxonomyId: l.taxonomyId,
      })),
      keyword: project.inspiration.keyword,
    });
  };

  const completedCount = Object.values(designResults).filter(
    (r) => r.status === "done"
  ).length;
  const errorCount = Object.values(designResults).filter(
    (r) => r.status === "error"
  ).length;
  const pipelineDone = latestEvent?.type === "pipeline-done";

  // Extract store info from pipeline events
  const storeInfo = events.find((e) => e.storeType)?.storeName;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Push to Printful</h2>
          <p className="text-sm text-white/40 mt-1">
            {selectedDesigns.length} designs &times; {enabledProducts.length} products
            {(storeInfo || printfulStatus?.storeName) && (
              <span className="text-purple-400/60">
                {" "}&rarr; {storeInfo || printfulStatus?.storeName}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Store type badge */}
          {printfulStatus?.connected && (
            <span className="text-[10px] px-2.5 py-1 rounded-full border font-medium flex items-center gap-1.5 bg-purple-500/10 text-purple-400 border-purple-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              {printfulStatus.storeType === "CONNECTED_STORE"
                ? "Etsy Connected"
                : printfulStatus.storeType === "API_STORE"
                ? "API Store"
                : printfulStatus.storeName || "Connected"}
            </span>
          )}

          {isRunning && (
            <button
              onClick={abort}
              className="px-4 py-2 text-sm text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handlePublish}
            disabled={
              isRunning ||
              selectedDesigns.length === 0 ||
              project.listings.length === 0 ||
              printfulStatus?.connected === false
            }
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/10 disabled:text-white/30 rounded-xl transition-colors"
          >
            {isRunning ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Pushing...
              </>
            ) : pipelineDone ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Re-push
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Push to Printful
              </>
            )}
          </button>
        </div>
      </div>

      {/* Printful auth error */}
      {printfulStatus?.connected === false && !isRunning && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm font-medium text-red-400">Printful not connected</p>
          </div>
          <p className="text-xs text-red-400/70">
            {printfulStatus.error || "Check that PRINTFUL_API_KEY is set in .env.local and the server is restarted."}
          </p>
        </div>
      )}

      {/* Overall progress bar */}
      {(isRunning || pipelineDone) && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isRunning ? (
                <svg className="w-4 h-4 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              <span className="text-sm text-white font-medium">
                {latestEvent?.label || "Starting..."}
              </span>
            </div>
            <span className="text-xs text-white/40">
              {completedCount}/{selectedDesigns.length} done
              {errorCount > 0 && ` \u00B7 ${errorCount} errors`}
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                errorCount > 0 ? "bg-amber-500" : "bg-indigo-500"
              }`}
              style={{
                width: `${selectedDesigns.length > 0 ? (completedCount / selectedDesigns.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Error display */}
      {error && !isRunning && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Not started yet */}
      {events.length === 0 && !isRunning && !pipelineDone && printfulStatus?.connected !== false && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4 bg-white/[0.02] border border-dashed border-white/[0.08] rounded-2xl">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <svg className="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white/60">Ready to push</p>
            <p className="text-xs text-white/30 mt-1 max-w-md">
              This will upload each design to Printful, create products with your pricing and variants, generate mockups, and push to your connected Etsy store. You&apos;ll finish each listing on Etsy in the next step.
            </p>
          </div>

          {/* Pre-publish checklist */}
          <div className="grid grid-cols-2 gap-3 mt-4 w-full max-w-md">
            <ChecklistItem
              label={`${selectedDesigns.length} designs selected`}
              ok={selectedDesigns.length > 0}
            />
            <ChecklistItem
              label={`${enabledProducts.length} products enabled`}
              ok={enabledProducts.length > 0}
            />
            <ChecklistItem
              label={`${project.listings.length} listings ready`}
              ok={project.listings.length > 0}
            />
            <ChecklistItem
              label={printfulStatus?.connected ? `Printful: ${printfulStatus.storeName || "Connected"}` : "Printful: checking..."}
              ok={printfulStatus?.connected ?? false}
            />
          </div>
        </div>
      )}

      {/* Per-design progress cards */}
      {(isRunning || pipelineDone) && (
        <div className="space-y-2">
          {selectedDesigns.map((design, idx) => {
            const result = designResults[design.id] || { status: "pending" };
            return (
              <DesignProgressCard
                key={design.id}
                index={idx}
                phrase={design.phrase || design.graphicDescription || "Design"}
                thumbnail={design.thumbnailUrl || design.dataUrl}
                result={result}
              />
            );
          })}
        </div>
      )}

      {/* Success summary */}
      {pipelineDone && completedCount > 0 && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-emerald-400">
                {completedCount} designs pushed to Printful
              </p>
              <p className="text-xs text-emerald-400/60 mt-0.5">
                Go to the Etsy Finish step to complete your listings with the browser extension
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Checklist Item ──

function ChecklistItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 bg-white/[0.03] rounded-lg px-3 py-2">
      {ok ? (
        <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      <span className={`text-xs ${ok ? "text-white/60" : "text-red-400/80"}`}>{label}</span>
    </div>
  );
}

// ── Design Progress Card ──

function DesignProgressCard({
  index,
  phrase,
  thumbnail,
  result,
}: {
  index: number;
  phrase: string;
  thumbnail?: string;
  result: {
    status: "pending" | "running" | "done" | "error";
    currentStep?: number;
    currentLabel?: string;
    pushed?: boolean;
    pushError?: string;
    syncProductId?: number;
    mockupUrls?: string[];
    error?: string;
  };
}) {
  const stepLabels = ["Upload", "Product", "Mockups", "Ready"];

  return (
    <div
      className={`
        flex items-center gap-4 rounded-xl border px-4 py-3 transition-all
        ${result.status === "running"
          ? "bg-indigo-500/5 border-indigo-500/20"
          : result.status === "done"
          ? "bg-emerald-500/5 border-emerald-500/20"
          : result.status === "error"
          ? "bg-red-500/5 border-red-500/20"
          : "bg-white/[0.02] border-white/[0.06]"
        }
      `}
    >
      {/* Thumbnail */}
      <div className="w-10 h-10 rounded-lg bg-white/[0.06] border border-white/[0.08] flex-shrink-0 overflow-hidden">
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt="" className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">
            {index + 1}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{phrase}</p>
        <p className="text-[10px] text-white/30 mt-0.5">
          {result.status === "running" && result.currentLabel
            ? result.currentLabel
            : result.status === "done"
            ? result.pushed
              ? `Pushed to Printful & Etsy \u2014 ID: ${result.syncProductId || ""}`
              : `Created on Printful \u2014 ID: ${result.syncProductId || ""}`
            : result.status === "error"
            ? result.error || "Failed"
            : "Waiting..."}
        </p>
      </div>

      {/* Step dots */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {stepLabels.map((label, i) => {
          const stepNum = i + 1;
          const isCurrent = result.currentStep === stepNum && result.status === "running";
          const isPast = result.currentStep ? stepNum < result.currentStep : false;
          const isDone = result.status === "done";

          return (
            <div
              key={label}
              title={label}
              className={`w-2 h-2 rounded-full transition-all ${
                isDone || isPast
                  ? "bg-emerald-400"
                  : isCurrent
                  ? "bg-indigo-400 animate-pulse"
                  : "bg-white/10"
              }`}
            />
          );
        })}
      </div>

      {/* Status icon */}
      <div className="flex-shrink-0">
        {result.status === "running" ? (
          <svg className="w-4 h-4 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : result.status === "done" ? (
          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : result.status === "error" ? (
          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        ) : (
          <div className="w-4 h-4 rounded-full border border-white/10" />
        )}
      </div>

      {/* Pushed badge */}
      {result.pushed && result.status === "done" && (
        <span className="text-[10px] text-emerald-400/60 flex-shrink-0">
          Pushed
        </span>
      )}
    </div>
  );
}
