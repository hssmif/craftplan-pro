"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useStudioStore } from "@/stores/studioStore";
import { useSettings } from "@/hooks/useSettings";
import type { EtsyListingPayload } from "@/extension/types";

// ── Taxonomy → friendly category name ──

const TAXONOMY_NAMES: Record<number, string> = {
  482: "Clothing > Shirts & Tees",
  1229: "Home & Living > Kitchen & Dining > Drinkware",
  485: "Art & Collectibles > Prints",
};

// ── Component ──

export function EtsySyncPanel() {
  const project = useStudioStore((s) => s.project);
  const setStepStatus = useStudioStore((s) => s.setStepStatus);
  const updateEtsyListing = useStudioStore((s) => s.updateEtsyListing);
  const setEtsyListings = useStudioStore((s) => s.setEtsyListings);
  const { settings } = useSettings();

  const [extensionConnected, setExtensionConnected] = useState<boolean | null>(null);
  const [etsyStatus, setEtsyStatus] = useState<{
    connected: boolean;
    shopId?: string;
    tokenHealth?: "healthy" | "expiring-soon" | "expired";
  } | null>(null);
  const [activeDesignId, setActiveDesignId] = useState<string | null>(null);
  const [queueRunning, setQueueRunning] = useState(false);
  const [currentProgress, setCurrentProgress] = useState<{
    step: number;
    total: number;
    label: string;
    status: string;
  } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const queueAbortRef = useRef(false);

  // Products pushed to Printful (source of truth for cards)
  const pushedProducts = project.printfulProducts.filter((p) => p.status === "done");
  const etsyListings = project.etsyListings;

  // Status counts
  const readyCount = etsyListings.filter((l) => l.status === "ready-to-finish").length;
  const finishingCount = etsyListings.filter((l) => l.status === "finishing").length;
  const draftCount = etsyListings.filter((l) => l.status === "draft").length;
  const activeCount = etsyListings.filter((l) => l.status === "active").length;
  const errorCount = etsyListings.filter((l) => l.status === "error").length;

  // ── Check extension on mount ──
  useEffect(() => {
    if (!settings.extensionId) {
      setExtensionConnected(false);
      return;
    }
    try {
      if (typeof chrome !== "undefined" && chrome?.runtime?.sendMessage) {
        chrome.runtime.sendMessage(
          settings.extensionId,
          { type: "PING" },
          (response: unknown) => {
            setExtensionConnected(!!response);
          }
        );
        setTimeout(() => {
          setExtensionConnected((prev) => (prev === null ? false : prev));
        }, 2000);
      } else {
        setExtensionConnected(false);
      }
    } catch {
      setExtensionConnected(false);
    }
  }, [settings.extensionId]);

  // ── Check Etsy OAuth status on mount ──
  useEffect(() => {
    fetch("/api/etsy/status")
      .then((r) => r.json())
      .then((data) => setEtsyStatus(data))
      .catch(() => setEtsyStatus({ connected: false }));
  }, []);

  // ── Listen for progress messages from extension ──
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome?.runtime?.onMessage) return;

    const listener = (msg: Record<string, unknown>) => {
      if (msg.type === "LISTING_PROGRESS") {
        setCurrentProgress({
          step: msg.step as number,
          total: msg.total as number,
          label: msg.label as string,
          status: msg.status as string,
        });
      }
      if (msg.type === "LISTING_READY") {
        const succeeded = msg.succeeded as number;
        const total = msg.total as number;
        setCurrentProgress(null);
        if (activeDesignId) {
          updateEtsyListing(activeDesignId, {
            status: succeeded === total ? "draft" : "error",
            imagesUploaded: succeeded,
            error: succeeded < total ? `${succeeded}/${total} steps completed` : undefined,
            finishedAt: new Date().toISOString(),
          });
        }
        setActiveDesignId(null);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [activeDesignId, updateEtsyListing]);

  // ── Update step status based on listing states ──
  useEffect(() => {
    if (etsyListings.some((l) => l.status === "active" || l.status === "draft")) {
      setStepStatus("etsy-sync", "done");
    } else if (etsyListings.some((l) => l.status === "ready-to-finish" || l.status === "finishing")) {
      setStepStatus("etsy-sync", "running");
    }
  }, [etsyListings, setStepStatus]);

  // ── Initialize Etsy listings from pushed products if not already done ──
  useEffect(() => {
    if (pushedProducts.length > 0 && etsyListings.length === 0) {
      const newListings = pushedProducts.map((p) => ({
        designId: p.designId,
        printfulSyncProductId: p.syncProductId,
        status: "ready-to-finish" as const,
        imagesUploaded: 0,
      }));
      setEtsyListings(newListings);
    }
  }, [pushedProducts, etsyListings.length, setEtsyListings]);

  // ── Build payload for a single design ──
  const buildPayload = useCallback(
    async (designId: string): Promise<EtsyListingPayload | null> => {
      const listing = project.listings.find((l) => l.designId === designId);
      const printfulProduct = project.printfulProducts.find((p) => p.designId === designId);
      if (!listing || !printfulProduct) return null;

      // Download mockup images via our backend to avoid browser CORS issues
      let imageBase64s: string[] = [];
      const mockupUrls = printfulProduct.mockupUrls.slice(0, 10);

      if (mockupUrls.length > 0) {
        try {
          const resp = await fetch("/api/etsy/prepare-images", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ urls: mockupUrls }),
          });
          if (resp.ok) {
            const data = await resp.json();
            imageBase64s = (data.images as string[]) || [];
          }
        } catch {
          // Backend image prep failed — fall through to design fallback
        }
      }

      // Fallback: use the design itself if no mockup images were prepared
      if (imageBase64s.length === 0) {
        const design = project.designs.find((d) => d.id === designId);
        if (design?.dataUrl) imageBase64s.push(design.dataUrl);
      }

      const categoryName = TAXONOMY_NAMES[listing.taxonomyId] || "Clothing > Shirts & Tees";
      const design = project.designs.find((d) => d.id === designId);

      // Generate SKU: keyword-designIndex-productId
      const keyword = project.inspiration.keyword.replace(/[^a-zA-Z0-9]/g, "").substring(0, 10).toUpperCase();
      const designIndex = project.designs.findIndex((d) => d.id === designId) + 1;
      const productId = printfulProduct.syncProductId || printfulProduct.fileId;
      const sku = `CP-${keyword}-${designIndex}-${productId}`;

      return {
        title: listing.title,
        description: listing.description,
        tags: listing.tags,
        price: listing.price,
        quantity: 999,
        sku,
        images: imageBase64s,
        category: categoryName,
        processingTime: "1-3 business days",
        shippingProfile: "Free shipping",
      };
    },
    [project]
  );

  // ── Send listing data to extension for Etsy form filling ──
  const handleFinishOnEtsy = useCallback(
    async (designId: string) => {
      setActiveDesignId(designId);
      updateEtsyListing(designId, { status: "finishing", error: undefined });

      try {
        const payload = await buildPayload(designId);
        if (!payload) {
          updateEtsyListing(designId, {
            status: "error",
            error: "Missing listing data or Printful product for this design",
          });
          setActiveDesignId(null);
          return;
        }

        if (extensionConnected && typeof chrome !== "undefined" && chrome?.runtime?.sendMessage) {
          // Store payload for the content script
          chrome.runtime.sendMessage(
            settings.extensionId,
            { type: "LIST_ON_ETSY", payload },
            (response: unknown) => {
              if (!response) {
                updateEtsyListing(designId, {
                  status: "ready-to-finish",
                  error: "Extension did not respond. Make sure it's installed and enabled.",
                });
                setActiveDesignId(null);
              }
              // Otherwise wait for LISTING_READY message
            }
          );
        } else {
          // Fallback: store payload in localStorage + copy to clipboard + open Etsy
          localStorage.setItem("pendingEtsyListing", JSON.stringify(payload));
          try {
            await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
            setCopyFeedback("Listing data copied to clipboard");
            setTimeout(() => setCopyFeedback(null), 3000);
          } catch {
            // Clipboard API may not be available
          }
          updateEtsyListing(designId, { status: "finishing", error: undefined });
          window.open("https://www.etsy.com/your/shops/me/tools/listings/create", "_blank");
          // Mark as draft after opening (user will finish manually)
          setTimeout(() => {
            updateEtsyListing(designId, { status: "draft", finishedAt: new Date().toISOString() });
            setActiveDesignId(null);
          }, 2000);
        }
      } catch (err) {
        updateEtsyListing(designId, {
          status: "error",
          error: err instanceof Error ? err.message : "Failed to send to extension",
        });
        setActiveDesignId(null);
      }
    },
    [buildPayload, extensionConnected, settings.extensionId, updateEtsyListing]
  );

  // ── Bulk: Finish all ready listings ──
  const handleFinishAll = useCallback(async () => {
    queueAbortRef.current = false;
    setQueueRunning(true);

    const readyListings = etsyListings.filter((l) => l.status === "ready-to-finish");

    for (const listing of readyListings) {
      if (queueAbortRef.current) break;
      await handleFinishOnEtsy(listing.designId);
      // Wait for completion or 30s timeout between items
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          const current = useStudioStore.getState().project.etsyListings.find(
            (l) => l.designId === listing.designId
          );
          if (
            current &&
            (current.status === "draft" || current.status === "active" || current.status === "error")
          ) {
            clearInterval(check);
            resolve();
          }
        }, 500);
        // Timeout after 60s
        setTimeout(() => {
          clearInterval(check);
          resolve();
        }, 60000);
      });
      // Brief pause between items
      await new Promise((r) => setTimeout(r, 1000));
    }

    setQueueRunning(false);
  }, [etsyListings, handleFinishOnEtsy]);

  // ── Copy payload to clipboard ──
  const handleCopyPayload = useCallback(
    async (designId: string) => {
      const payload = await buildPayload(designId);
      if (!payload) return;
      try {
        await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        setCopyFeedback(`Payload copied for design ${designId.substring(0, 8)}`);
        setTimeout(() => setCopyFeedback(null), 3000);
      } catch {
        setCopyFeedback("Failed to copy to clipboard");
        setTimeout(() => setCopyFeedback(null), 3000);
      }
    },
    [buildPayload]
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Etsy Draft Finisher</h2>
          <p className="text-sm text-white/40 mt-1">
            Complete your Etsy listings with the browser extension
          </p>
        </div>

        {/* Connection badges */}
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] px-2.5 py-1 rounded-full border font-medium flex items-center gap-1.5 ${
              extensionConnected === true
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : extensionConnected === false
                ? "bg-red-500/10 text-red-400 border-red-500/20"
                : "bg-white/5 text-white/30 border-white/10"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                extensionConnected === true
                  ? "bg-emerald-400"
                  : extensionConnected === false
                  ? "bg-red-400"
                  : "bg-white/30"
              }`}
            />
            {extensionConnected === true
              ? "Extension"
              : extensionConnected === false
              ? "No Extension"
              : "Checking..."}
          </span>

          {etsyStatus && (
            <span
              className={`text-[10px] px-2.5 py-1 rounded-full border font-medium flex items-center gap-1.5 ${
                etsyStatus.connected && etsyStatus.tokenHealth === "healthy"
                  ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                  : etsyStatus.connected && etsyStatus.tokenHealth === "expiring-soon"
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  : "bg-white/5 text-white/30 border-white/10"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  etsyStatus.connected && etsyStatus.tokenHealth === "healthy"
                    ? "bg-orange-400"
                    : etsyStatus.connected
                    ? "bg-amber-400"
                    : "bg-white/30"
                }`}
              />
              {etsyStatus.connected ? `Etsy: ${etsyStatus.shopId}` : "Etsy: Not connected"}
            </span>
          )}
        </div>
      </div>

      {/* Clipboard feedback toast */}
      {copyFeedback && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-2 text-xs text-emerald-400 animate-pulse">
          {copyFeedback}
        </div>
      )}

      {/* Bulk action bar */}
      {readyCount > 0 && (
        <div className="flex items-center justify-between bg-orange-500/5 border border-orange-500/20 rounded-xl p-4">
          <div>
            <p className="text-sm font-medium text-orange-400">
              {readyCount} listing{readyCount > 1 ? "s" : ""} ready to finish
            </p>
            <p className="text-xs text-white/40 mt-0.5">
              {extensionConnected
                ? "Extension will auto-fill each Etsy listing form"
                : "Payload will be copied to clipboard for manual entry"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {queueRunning ? (
              <button
                onClick={() => {
                  queueAbortRef.current = true;
                }}
                className="px-4 py-2 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors"
              >
                Stop Queue
              </button>
            ) : (
              <button
                onClick={handleFinishAll}
                disabled={activeDesignId !== null}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 rounded-lg transition-colors shadow-lg shadow-orange-500/20"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Finish All on Etsy
              </button>
            )}
          </div>
        </div>
      )}

      {/* Stats bar */}
      {etsyListings.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {readyCount > 0 && (
            <span className="text-xs text-orange-400 bg-orange-500/10 px-3 py-1 rounded-full border border-orange-500/20">
              {readyCount} ready
            </span>
          )}
          {finishingCount > 0 && (
            <span className="text-xs text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">
              {finishingCount} finishing
            </span>
          )}
          {draftCount > 0 && (
            <span className="text-xs text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
              {draftCount} drafts
            </span>
          )}
          {activeCount > 0 && (
            <span className="text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
              {activeCount} active
            </span>
          )}
          {errorCount > 0 && (
            <span className="text-xs text-red-400 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20">
              {errorCount} failed
            </span>
          )}
        </div>
      )}

      {/* Current progress indicator */}
      {currentProgress && activeDesignId && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Spinner />
              <span className="text-sm text-blue-400 font-medium">{currentProgress.label}</span>
            </div>
            <span className="text-xs text-white/40">
              Step {currentProgress.step}/{currentProgress.total}
            </span>
          </div>
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${(currentProgress.step / currentProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Empty state */}
      {pushedProducts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4 bg-white/[0.02] border border-dashed border-white/[0.08] rounded-2xl">
          <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <svg className="w-7 h-7 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white/60">No products ready for Etsy</p>
            <p className="text-xs text-white/30 mt-1 max-w-sm">
              Push your designs to Printful first. Once done,
              come back here to finish them on Etsy.
            </p>
          </div>
        </div>
      )}

      {/* Product cards */}
      {pushedProducts.length > 0 && (
        <div className="space-y-3">
          {pushedProducts.map((product) => {
            const design = project.designs.find((d) => d.id === product.designId);
            const meta = project.listings.find((l) => l.designId === product.designId);
            const etsyListing = etsyListings.find((l) => l.designId === product.designId);
            const status = etsyListing?.status || "ready-to-finish";
            const isActive = activeDesignId === product.designId;

            return (
              <div
                key={product.designId}
                className={`
                  rounded-xl border p-4 transition-all
                  ${
                    status === "active"
                      ? "bg-emerald-500/5 border-emerald-500/20"
                      : status === "draft"
                      ? "bg-amber-500/5 border-amber-500/20"
                      : status === "finishing"
                      ? "bg-blue-500/5 border-blue-500/20 animate-pulse"
                      : status === "error"
                      ? "bg-red-500/5 border-red-500/20"
                      : "bg-white/[0.02] border-white/[0.06]"
                  }
                `}
              >
                <div className="flex items-start gap-4">
                  {/* Thumbnail */}
                  <div className="w-16 h-16 rounded-lg bg-white/[0.06] border border-white/[0.08] flex-shrink-0 overflow-hidden">
                    {design?.thumbnailUrl || design?.dataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={design.thumbnailUrl || design.dataUrl}
                        alt=""
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">
                        IMG
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {meta?.title || design?.phrase || "Listing"}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-medium">
                        Printful #{product.syncProductId || "\u2014"}
                      </span>

                      {product.pushed && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
                          Pushed to Etsy
                        </span>
                      )}

                      <EtsyStatusBadge status={status} />

                      {meta?.price && (
                        <span className="text-[10px] text-emerald-400/80 tabular-nums">
                          ${meta.price.toFixed(2)}
                        </span>
                      )}

                      {product.mockupUrls.length > 0 && (
                        <span className="text-[10px] text-white/30">
                          {product.mockupUrls.length} mockups
                        </span>
                      )}
                    </div>

                    {/* Tags preview */}
                    {meta?.tags && meta.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {meta.tags.slice(0, 5).map((tag) => (
                          <span
                            key={tag}
                            className="text-[9px] text-white/25 bg-white/[0.04] px-1.5 py-0.5 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                        {meta.tags.length > 5 && (
                          <span className="text-[9px] text-white/20">+{meta.tags.length - 5}</span>
                        )}
                      </div>
                    )}

                    {/* Error */}
                    {etsyListing?.error && (
                      <p className="text-[10px] text-red-400 mt-1.5 truncate">{etsyListing.error}</p>
                    )}

                    {/* Per-item progress */}
                    {isActive && currentProgress && (
                      <div className="mt-2 flex items-center gap-2">
                        <Spinner size={10} />
                        <span className="text-[10px] text-blue-400">
                          {currentProgress.label} ({currentProgress.step}/{currentProgress.total})
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex-shrink-0 flex flex-col gap-1.5">
                    {(status === "ready-to-finish" || status === "error") && (
                      <button
                        onClick={() => handleFinishOnEtsy(product.designId)}
                        disabled={activeDesignId !== null}
                        className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 rounded-lg transition-colors shadow-lg shadow-orange-500/20"
                      >
                        {isActive ? (
                          <>
                            <Spinner />
                            Sending...
                          </>
                        ) : status === "error" ? (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Retry
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                            Finish on Etsy
                          </>
                        )}
                      </button>
                    )}

                    {/* Copy payload button (always available for ready/error) */}
                    {(status === "ready-to-finish" || status === "error") && (
                      <button
                        onClick={() => handleCopyPayload(product.designId)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-white/40 hover:text-white/60 bg-white/[0.04] hover:bg-white/[0.08] rounded-lg border border-white/[0.06] transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                        Copy Payload
                      </button>
                    )}

                    {status === "finishing" && !isActive && (
                      <span className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                        <Spinner />
                        Filling form...
                      </span>
                    )}

                    {(status === "draft" || status === "active") && etsyListing?.listingUrl && (
                      <a
                        href={etsyListing.listingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-colors"
                      >
                        View on Etsy
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}

                    {(status === "draft" || status === "active") && !etsyListing?.listingUrl && (
                      <span
                        className={`text-[10px] px-3 py-2 rounded-lg font-medium ${
                          status === "active"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        }`}
                      >
                        {status === "active" ? "Live" : "Draft Created"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* How it works */}
      {pushedProducts.length > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">How Etsy Draft Finishing Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <HowItWorksStep
              number={1}
              title="Printful Creates Draft"
              description="When you push to Printful, it creates a draft listing on your connected Etsy shop."
            />
            <HowItWorksStep
              number={2}
              title="Extension Fills Details"
              description="Click 'Finish on Etsy' to send listing data to the extension. It auto-fills title, description, tags, price, and images."
            />
            <HowItWorksStep
              number={3}
              title="You Review &amp; Publish"
              description="Review the pre-filled listing on Etsy, make any adjustments, and click Publish."
            />
          </div>
          {!extensionConnected && (
            <div className="mt-4 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
              <p className="text-xs text-amber-400">
                <strong>Without the extension:</strong> Click &ldquo;Copy Payload&rdquo; to copy all listing data to your clipboard, then paste it into the Etsy listing form manually. The &ldquo;Finish on Etsy&rdquo; button will also open the Etsy listing page for you.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Status Badge ──

function EtsyStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "ready-to-finish":
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 font-medium">
          Ready
        </span>
      );
    case "finishing":
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium flex items-center gap-1">
          <Spinner size={8} />
          Finishing
        </span>
      );
    case "draft":
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
          Draft
        </span>
      );
    case "active":
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
          Active
        </span>
      );
    case "error":
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">
          Error
        </span>
      );
    default:
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/40 font-medium">
          {status}
        </span>
      );
  }
}

// ── Spinner ──

function Spinner({ size = 12 }: { size?: number }) {
  return (
    <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// ── How It Works Step ──

function HowItWorksStep({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-[10px] font-bold text-orange-400">{number}</span>
      </div>
      <div>
        <p className="text-xs font-medium text-white">{title}</p>
        <p className="text-[10px] text-white/40 mt-0.5 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
