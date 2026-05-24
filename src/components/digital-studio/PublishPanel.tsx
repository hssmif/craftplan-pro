"use client";

import { useState, useCallback } from "react";
import { useDigitalStudioStore } from "@/stores/digitalStudioStore";
import { useSettings } from "@/hooks/useSettings";
import { DIGITAL_PRODUCT_LABELS } from "@/types/digital-product";

// ── Step 6: Publish ──
// Download/export product + publish to Etsy.

export function PublishPanel() {
  const project = useDigitalStudioStore((s) => s.project);
  const setPublishState = useDigitalStudioStore((s) => s.setPublishState);
  const setStepStatus = useDigitalStudioStore((s) => s.setStepStatus);
  const saveProject = useDigitalStudioStore((s) => s.saveProject);

  const { settings } = useSettings();
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState("");

  const genResult = project.generation.result;
  const listing = project.listing;
  const publish = project.publish;

  const hasListing = listing.status === "done" || listing.status === "edited";
  const isPublished = publish.etsyStatus === "active" || publish.etsyStatus === "draft";

  const handlePublish = useCallback(async () => {
    setIsPublishing(true);
    setError("");
    setStepStatus("publish", "running");

    try {
      const resp = await fetch("/api/digital/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          autoActivate: false,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Publish failed" }));
        if (err.code === "ETSY_NOT_CONNECTED") {
          throw new Error("Etsy not connected. Go to Settings to connect your Etsy account.");
        }
        throw new Error(err.error || "Failed to publish");
      }

      const data = await resp.json();
      setPublishState(data.publishState);
      setStepStatus("publish", "done");

      try { await saveProject(); } catch { /* non-critical */ }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Publish failed";
      setError(message);
      setStepStatus("publish", "error");
    } finally {
      setIsPublishing(false);
    }
  }, [project.id, setPublishState, setStepStatus, saveProject]);

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">Publish</h2>
        <p className="text-sm text-white/50 mt-1">
          Download your {DIGITAL_PRODUCT_LABELS[project.productType]} or publish it to Etsy.
        </p>
      </div>

      {/* ── Section 1: Export / Download ── */}
      <div className="p-5 bg-white/[0.03] border border-white/[0.08] rounded-xl space-y-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export / Download
        </h3>

        {genResult?.type === "file" && (
          <div className="flex items-center justify-between p-4 bg-white/[0.02] rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center">
                <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-white">{genResult.fileName}</p>
                <p className="text-xs text-white/40">{formatBytes(genResult.fileSizeBytes)}</p>
              </div>
            </div>

            <a
              href={genResult.downloadUrl}
              download={genResult.fileName}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </a>
          </div>
        )}

        {genResult?.type === "notion" && (
          <div className="flex items-center justify-between p-4 bg-white/[0.02] rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center">
                <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-white">Notion Template</p>
                <p className="text-xs text-white/40">{genResult.databases.length} databases · {genResult.qualityTier}</p>
              </div>
            </div>

            <a
              href={genResult.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
            >
              Open in Notion
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}

        {!genResult && (
          <p className="text-sm text-white/30 py-4 text-center">No product generated yet.</p>
        )}
      </div>

      {/* ── Section 2: Publish to Etsy ── */}
      <div className="p-5 bg-white/[0.03] border border-white/[0.08] rounded-xl space-y-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Publish to Etsy
        </h3>

        {/* Already published */}
        {isPublished && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <span className={`
                px-2.5 py-1 text-xs font-medium rounded-full
                ${publish.etsyStatus === "active"
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-amber-500/20 text-amber-300"
                }
              `}>
                {publish.etsyStatus === "active" ? "Active" : "Draft"}
              </span>
              {publish.publishedAt && (
                <span className="text-xs text-white/30">
                  Published {new Date(publish.publishedAt).toLocaleDateString()}
                </span>
              )}
            </div>
            {publish.etsyListingUrl && (
              <a
                href={publish.etsyListingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300"
              >
                View on Etsy
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </div>
        )}

        {/* Pre-checks */}
        {!isPublished && (
          <div className="space-y-2">
            <ChecklistItem label="Product generated" done={!!genResult} />
            <ChecklistItem label="Listing package ready" done={hasListing} />
            <ChecklistItem label="Etsy connected" done={!!settings.etsyApiKey} note="Connect in Settings" />
          </div>
        )}

        {/* Publish button */}
        {!isPublished && (
          <button
            onClick={handlePublish}
            disabled={isPublishing || !genResult || !hasListing}
            className={`
              w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-3
              ${isPublishing
                ? "bg-indigo-500/20 text-indigo-300 cursor-wait"
                : !genResult || !hasListing
                  ? "bg-white/10 text-white/30 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white"
              }
            `}
          >
            {isPublishing ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Publishing to Etsy...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Publish as Draft on Etsy
              </>
            )}
          </button>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-300">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

function ChecklistItem({ label, done, note }: { label: string; done: boolean; note?: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className={`
        w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0
        ${done ? "bg-emerald-500/20" : "bg-white/[0.06] border border-white/[0.1]"}
      `}>
        {done && (
          <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <span className={`text-sm ${done ? "text-white/70" : "text-white/40"}`}>{label}</span>
      {note && !done && <span className="text-xs text-white/25">({note})</span>}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
