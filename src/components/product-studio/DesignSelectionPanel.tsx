"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useStudioStore } from "@/stores/studioStore";
import type { StudioDesign } from "@/types/product-studio";

// ── Filter Types ──

type FilterMode = "all" | "starred" | "text" | "graphic";

// ── DesignCard Component ──

function DesignCard({
  design,
  onToggleSelect,
  onToggleStar,
  onZoom,
}: {
  design: StudioDesign;
  onToggleSelect: (id: string) => void;
  onToggleStar: (id: string) => void;
  onZoom: (design: StudioDesign) => void;
}) {
  return (
    <div
      className={`
        group relative rounded-xl border overflow-hidden transition-all cursor-pointer
        ${
          design.selected
            ? "border-indigo-500/50 ring-2 ring-indigo-500/20 bg-indigo-500/5"
            : "border-white/[0.06] hover:border-white/[0.15] bg-white/[0.02]"
        }
      `}
      onClick={() => onToggleSelect(design.id)}
    >
      {/* Image */}
      <div className="aspect-[3/4] relative overflow-hidden bg-black/20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={design.dataUrl}
          alt={design.phrase || "Design"}
          className="w-full h-full object-contain p-2"
          loading="lazy"
        />

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onZoom(design);
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-2 bg-black/50 rounded-lg backdrop-blur-sm"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </button>
        </div>

        {/* Selection checkbox */}
        <div className="absolute top-2 left-2">
          <div
            className={`
              w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all
              ${
                design.selected
                  ? "bg-indigo-500 border-indigo-500"
                  : "border-white/30 bg-black/20 group-hover:border-white/50"
              }
            `}
          >
            {design.selected && (
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>

        {/* Star button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar(design.id);
          }}
          className="absolute top-2 right-2 p-1 transition-colors"
        >
          <svg
            className={`w-4 h-4 ${design.starred ? "text-amber-400 fill-amber-400" : "text-white/30 group-hover:text-white/50"}`}
            fill={design.starred ? "currentColor" : "none"}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </button>

        {/* Mode badge */}
        <span
          className={`
            absolute bottom-2 left-2 text-[9px] px-1.5 py-0.5 rounded-full backdrop-blur-sm
            ${design.mode === "text" ? "bg-blue-500/20 text-blue-300" : "bg-purple-500/20 text-purple-300"}
          `}
        >
          {design.mode === "text" ? "TEXT" : "AI"}
        </span>
      </div>

      {/* Info */}
      <div className="p-2.5 space-y-1">
        {design.phrase && (
          <p className="text-xs text-white/70 font-medium truncate">{design.phrase}</p>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          {design.stylePreset && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40">
              {design.stylePreset}
            </span>
          )}
          {design.mood && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40">
              {design.mood}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Zoom Modal ──

function ZoomModal({
  design,
  onClose,
}: {
  design: StudioDesign;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div className="relative max-w-3xl max-h-[90vh] z-10" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={design.dataUrl}
          alt={design.phrase || "Design"}
          className="max-w-full max-h-[80vh] object-contain rounded-xl"
        />
        <div className="mt-3 text-center">
          {design.phrase && <p className="text-sm text-white font-medium">{design.phrase}</p>}
          <div className="flex items-center justify-center gap-2 mt-2">
            {design.stylePreset && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/50">
                {design.stylePreset}
              </span>
            )}
            {design.palette && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/50">
                {design.palette}
              </span>
            )}
            {design.fontName && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/50">
                {design.fontName}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="absolute -top-2 -right-2 p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Main Component ──

export function DesignSelectionPanel() {
  const project = useStudioStore((s) => s.project);
  const toggleDesignSelected = useStudioStore((s) => s.toggleDesignSelected);
  const toggleDesignStarred = useStudioStore((s) => s.toggleDesignStarred);
  const selectAllDesigns = useStudioStore((s) => s.selectAllDesigns);
  const deselectAllDesigns = useStudioStore((s) => s.deselectAllDesigns);
  const setStepStatus = useStudioStore((s) => s.setStepStatus);

  const [filter, setFilter] = useState<FilterMode>("all");
  const [zoomedDesign, setZoomedDesign] = useState<StudioDesign | null>(null);

  const designs = project.designs;
  const selectedCount = designs.filter((d) => d.selected).length;
  const starredCount = designs.filter((d) => d.starred).length;

  // Apply filter
  const filteredDesigns = useMemo(() => {
    switch (filter) {
      case "starred":
        return designs.filter((d) => d.starred);
      case "text":
        return designs.filter((d) => d.mode === "text");
      case "graphic":
        return designs.filter((d) => d.mode === "graphic");
      default:
        return designs;
    }
  }, [designs, filter]);

  // Update step status when selection changes
  useEffect(() => {
    if (selectedCount > 0) {
      setStepStatus("selection", "done");
    } else {
      setStepStatus("selection", "idle");
    }
  }, [selectedCount, setStepStatus]);

  const handleSelectStarred = useCallback(() => {
    // Deselect all first, then select only starred
    deselectAllDesigns();
    designs.filter((d) => d.starred).forEach((d) => {
      if (!d.selected) toggleDesignSelected(d.id);
    });
  }, [designs, deselectAllDesigns, toggleDesignSelected]);

  if (designs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <svg className="w-16 h-16 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <p className="text-white/40">No designs generated yet. Go back to the Generate step.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Select Designs</h2>
          <p className="text-sm text-white/40 mt-1">
            {selectedCount} of {designs.length} selected
            {starredCount > 0 && ` · ${starredCount} starred`}
          </p>
        </div>

        {/* Bulk Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={selectAllDesigns}
            className="px-3 py-1.5 text-xs text-white/50 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-lg border border-white/[0.08] transition-colors"
          >
            Select All
          </button>
          <button
            onClick={deselectAllDesigns}
            className="px-3 py-1.5 text-xs text-white/50 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-lg border border-white/[0.08] transition-colors"
          >
            Deselect All
          </button>
          {starredCount > 0 && (
            <button
              onClick={handleSelectStarred}
              className="px-3 py-1.5 text-xs text-amber-400/80 hover:text-amber-400 bg-amber-500/10 hover:bg-amber-500/15 rounded-lg border border-amber-500/20 transition-colors"
            >
              Select Starred ({starredCount})
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex gap-2">
        {(
          [
            { id: "all" as FilterMode, label: "All", count: designs.length },
            { id: "starred" as FilterMode, label: "Starred", count: starredCount },
            { id: "text" as FilterMode, label: "Text", count: designs.filter((d) => d.mode === "text").length },
            { id: "graphic" as FilterMode, label: "Graphic", count: designs.filter((d) => d.mode === "graphic").length },
          ] as const
        )
          .filter((f) => f.count > 0)
          .map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`
                px-3 py-1.5 text-xs rounded-lg border transition-colors
                ${
                  filter === f.id
                    ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-400"
                    : "bg-white/[0.03] border-white/[0.06] text-white/40 hover:text-white/60"
                }
              `}
            >
              {f.label} ({f.count})
            </button>
          ))}
      </div>

      {/* Design Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filteredDesigns.map((design) => (
          <DesignCard
            key={design.id}
            design={design}
            onToggleSelect={toggleDesignSelected}
            onToggleStar={toggleDesignStarred}
            onZoom={setZoomedDesign}
          />
        ))}
      </div>

      {filteredDesigns.length === 0 && (
        <div className="text-center py-12">
          <p className="text-white/40 text-sm">No designs match this filter.</p>
        </div>
      )}

      {/* Selection Summary */}
      {selectedCount > 0 && (
        <div className="sticky bottom-0 bg-[var(--bg-primary)]/80 backdrop-blur-xl border-t border-white/[0.06] -mx-6 px-6 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">
              <span className="text-white font-semibold">{selectedCount}</span> designs selected for product configuration
            </span>
            <div className="flex gap-1">
              {designs
                .filter((d) => d.selected)
                .slice(0, 8)
                .map((d) => (
                  <div key={d.id} className="w-8 h-8 rounded border border-white/10 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.dataUrl} alt="" className="w-full h-full object-contain" />
                  </div>
                ))}
              {selectedCount > 8 && (
                <div className="w-8 h-8 rounded border border-white/10 flex items-center justify-center bg-white/[0.04]">
                  <span className="text-[9px] text-white/40">+{selectedCount - 8}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Zoom Modal */}
      {zoomedDesign && <ZoomModal design={zoomedDesign} onClose={() => setZoomedDesign(null)} />}
    </div>
  );
}
