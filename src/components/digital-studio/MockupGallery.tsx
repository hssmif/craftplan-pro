"use client";

// ── MockupGallery ──────────────────────────────────────────
// Reusable mockup gallery grid with generation controls.
// Shows mockup cards with thumbnails, labels, and status badges.
// Includes loading skeleton, error states, and regenerate button.

import type { MockupAsset } from "@/types/digital-product";

// ── Scene Labels ─────────────────────────────────────────────

const SCENE_LABELS: Record<string, string> = {
  "cover-ipad": "Cover — iPad",
  "content-macbook": "Content — MacBook",
  "detail-portrait": "Detail — iPad Portrait",
  "inner-page-ipad": "Inner Page — iPad",
  "mobile-view": "Mobile — iPhone",
  "excel-preview-card": "Excel Preview Card",
  "notion-screenshot": "Notion Screenshot",
  "ai-hero": "AI Lifestyle Hero",
};

const SCENE_BADGES: Record<string, { bg: string; text: string }> = {
  "cover-ipad": { bg: "bg-red-500/15", text: "text-red-400" },
  "content-macbook": { bg: "bg-blue-500/15", text: "text-blue-400" },
  "detail-portrait": { bg: "bg-emerald-500/15", text: "text-emerald-400" },
  "excel-preview-card": { bg: "bg-green-500/15", text: "text-green-400" },
  "notion-screenshot": { bg: "bg-violet-500/15", text: "text-violet-400" },
  "ai-hero": { bg: "bg-amber-500/15", text: "text-amber-400" },
};

// ── Props ────────────────────────────────────────────────────

interface MockupGalleryProps {
  mockups: MockupAsset[];
  isGenerating: boolean;
  progressLabel?: string;
  onGenerate: () => void;
}

// ── Component ────────────────────────────────────────────────

export function MockupGallery({
  mockups,
  isGenerating,
  progressLabel,
  onGenerate,
}: MockupGalleryProps) {
  const hasMockups = mockups.length > 0;
  const doneMockups = mockups.filter((m) => m.status === "done");

  return (
    <div className="space-y-4">
      {/* Header + Action */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Mockups
          </h3>
          {hasMockups && (
            <p className="text-xs text-white/30 mt-0.5">
              {doneMockups.length} mockup{doneMockups.length !== 1 ? "s" : ""} ready
            </p>
          )}
        </div>

        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className={`
            flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-colors
            ${isGenerating
              ? "bg-indigo-500/20 text-indigo-300 cursor-wait"
              : hasMockups
                ? "text-white/50 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08]"
                : "text-white bg-indigo-600 hover:bg-indigo-500"
            }
          `}
        >
          {isGenerating ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Generating...
            </>
          ) : hasMockups ? (
            "Regenerate"
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Generate Mockups
            </>
          )}
        </button>
      </div>

      {/* Progress Label */}
      {isGenerating && progressLabel && (
        <div className="flex items-center gap-2 px-3 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
          <svg className="w-3.5 h-3.5 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-xs text-indigo-300">{progressLabel}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {isGenerating && !hasMockups && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="aspect-[4/3] rounded-xl bg-white/[0.03] border border-white/[0.06] animate-pulse">
              <div className="w-full h-full flex items-center justify-center">
                <svg className="w-8 h-8 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mockup Grid */}
      {hasMockups && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {mockups.map((m) => {
            const label = SCENE_LABELS[m.sceneType] || m.sceneType;
            const badge = SCENE_BADGES[m.sceneType] || { bg: "bg-white/10", text: "text-white/50" };

            return (
              <div
                key={m.id}
                className="group relative rounded-xl overflow-hidden bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.15] transition-all"
              >
                {/* Image */}
                {m.status === "done" && m.imageUrl ? (
                  <div className="aspect-[4/3] relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.imageUrl}
                      alt={label}
                      className="w-full h-full object-cover"
                    />
                    {/* Hover overlay with download */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <a
                        href={m.imageUrl}
                        download={`mockup-${m.sceneType}.jpg`}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-white/20 hover:bg-white/30 rounded-lg backdrop-blur-sm transition-colors"
                      >
                        Download
                      </a>
                    </div>
                  </div>
                ) : m.status === "generating" ? (
                  <div className="aspect-[4/3] flex items-center justify-center bg-white/[0.02] animate-pulse">
                    <svg className="w-6 h-6 text-white/15 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                ) : (
                  <div className="aspect-[4/3] flex items-center justify-center bg-red-500/5">
                    <svg className="w-6 h-6 text-red-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                )}

                {/* Label + Badge */}
                <div className="p-3 flex items-center justify-between">
                  <span className="text-xs text-white/60 truncate">{label}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${badge.bg} ${badge.text}`}>
                    {m.status === "done" ? "Ready" : m.status === "generating" ? "..." : "Error"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!hasMockups && !isGenerating && (
        <div className="p-8 bg-white/[0.02] border border-dashed border-white/[0.1] rounded-xl text-center">
          <svg className="w-10 h-10 text-white/15 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm text-white/30 font-medium">No mockups yet</p>
          <p className="text-xs text-white/20 mt-1">
            Click &quot;Generate Mockups&quot; to create device frames and AI lifestyle images.
          </p>
        </div>
      )}
    </div>
  );
}
