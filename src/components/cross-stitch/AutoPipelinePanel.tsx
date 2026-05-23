"use client";

/**
 * Auto-Pipeline dashboard panel.
 *
 * Fixed bottom-right overlay that shows progress of the "Auto-Pipeline"
 * feature — sequential idea→image→convert pipeline for N items at once.
 *
 * Phase 1 scope (the only phase wired up right now):
 *   ┌──────────────────────────────────────────────────┐
 *   │ 🚀 Auto-Pipeline · 3/5 · $0.24 · ⏱ 8m left      │
 *   ├──────────────────────────────────────────────────┤
 *   │ ✓ Wombat Judge          ✓gen  ✓chart  → READY  │
 *   │ ✓ Tardigrade Tuxedo     ✓gen  ✓chart  → READY  │
 *   │ ⏳ Secretary Detective   ✓gen  ⏳chart  → ...    │
 *   │ ⏸ Mantis Shrimp Lab     queued                  │
 *   │ ⏸ Platypus Painter      queued                  │
 *   ├──────────────────────────────────────────────────┤
 *   │ [Cancel queue]                  [Minimize ⌄]    │
 *   └──────────────────────────────────────────────────┘
 *
 * The panel is presentational only — it receives queue state and a few
 * action callbacks (cancel, minimize, view item, clear).  The
 * orchestrator that ACTUALLY runs the API calls lives in page.tsx so
 * it has access to all the existing single-design state helpers.
 */

import { useState } from "react";
// Types moved to /lib/auto-pipeline-types.ts so the server-side
// orchestrator can import them without pulling this "use client"
// component into the server bundle.  Re-exported below for backward
// compat with any caller that does `from "@/components/.../AutoPipelinePanel"`.
import type {
  AutoPipelineItem,
  AutoPipelineState,
  ListingCopy,
  MockupImage,
  PipelineItemStatus,
} from "@/lib/auto-pipeline-types";
export type { AutoPipelineItem, AutoPipelineState, ListingCopy, MockupImage, PipelineItemStatus };

interface AutoPipelinePanelProps {
  state: AutoPipelineState | null;
  onCancel: () => void;
  onViewItem: (item: AutoPipelineItem) => void;
  onClear: () => void;
  /** Continue to Export & Mockups → Video → List → Preview.  Shown when
   *  Convert stage is done but downstream assets are missing. */
  onContinueExport?: () => void;
}

export function AutoPipelinePanel({
  state,
  onCancel,
  onViewItem,
  onClear,
  onContinueExport,
}: AutoPipelinePanelProps) {
  // Default to MINIMIZED if the pipeline isn't actively running.  Per
  // user 2026-05-16: opening the page shouldn't be ambushed by a giant
  // queue card from a stale prior session — start as a small chip, let
  // the user click to expand if they care.  Auto-expands while a run
  // is mid-flight so progress is visible.
  const [minimized, setMinimized] = useState(() => !state?.active);

  if (!state) return null;

  const done = state.items.filter((i) => i.status === "done").length;
  const failed = state.items.filter((i) => i.status === "failed").length;
  const total = state.items.length;
  const remaining = total - done - failed;

  // Rough ETA — ~150s per remaining item:
  //   ~40s gpt-image-2 + flatten
  //   ~3s Python convert
  //   ~5s PDF bundle
  //   ~5s mockups (Sharp templates)
  //   ~60s ffmpeg video render
  //   ~5s Gemini listing copy
  // Conservative upper bound — most runs finish faster.
  const etaSeconds = remaining * 150;
  const etaText = etaSeconds < 60
    ? `${etaSeconds}s`
    : `${Math.ceil(etaSeconds / 60)}m`;

  return (
    <div
      // Per user 2026-05-16: top-right overlay so the seller sees the
      // panel at a glance without scrolling.  Stacks below the OpenAI
      // cost badge (which sits at top: 16px / right: 16px) via the
      // top-16 offset.
      className={`fixed right-4 top-16 z-40 overflow-hidden rounded-2xl border border-white/10 bg-[#05070b]/95 text-white shadow-[0_28px_100px_rgba(0,0,0,0.55)] backdrop-blur-xl ${
        minimized ? "w-72" : "w-[440px]"
      } transition-all duration-200`}
      style={{ maxHeight: minimized ? 56 : "70vh" }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(59,130,246,0.20),transparent_34%),radial-gradient(circle_at_90%_22%,rgba(16,185,129,0.12),transparent_32%)]" />
      {/* Header */}
      <div className="relative flex items-center justify-between border-b border-white/10 bg-white/[0.035] px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl border border-blue-300/25 bg-blue-400/10 text-[13px]">AP</span>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-white whitespace-nowrap">
              Auto-Pipeline {done}/{total}
              {failed > 0 && <span className="text-red-400 ml-1">· {failed} failed</span>}
            </p>
            {!minimized && (
              <p className="text-[10px] text-[var(--text-muted)] whitespace-nowrap">
                ${state.totalCostUsd.toFixed(2)} spent
                {state.active && remaining > 0 && ` · ~${etaText} left`}
                {!state.active && remaining === 0 && " · complete"}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* "Continue → Mockups & Video" — shown after Convert is done
              when items still need mockups / video / listing copy.
              One click runs Stage 2 (mockups + video) then Stage 3
              (listing copy) then auto-navigates to Preview. */}
          {!state.active && onContinueExport && state.items.some((i) => i.patternFull) &&
           state.items.some((i) => i.patternFull && (!hasRenderableMockups(i) || !i.hasVideo || !i.listingCopy?.tags.length)) && (
            <button
              onClick={onContinueExport}
              className="text-[11px] px-3 py-1.5 rounded-lg bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold shadow-[0_0_12px_-2px_rgba(251,146,60,0.5)] transition-all"
              title="Run Export (mockups + video) + List (listing copy) → Preview"
            >
              Continue → Mockups, Video, List
            </button>
          )}
          {state.active && (
            <button
              onClick={onCancel}
              disabled={state.cancelled}
              className="rounded-lg px-2 py-1 text-[10px] text-white/45 transition-colors hover:bg-red-400/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
              title="Stop after the current item finishes"
            >
              {state.cancelled ? "Stopping…" : "Cancel"}
            </button>
          )}
          {!state.active && (
            <button
              onClick={onClear}
              className="rounded-lg px-2 py-1 text-[10px] text-white/45 transition-colors hover:bg-red-400/10 hover:text-red-300"
              title="Dismiss panel and clear queue"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setMinimized((m) => !m)}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/10 hover:text-white"
            title={minimized ? "Expand" : "Minimize"}
          >
            {minimized ? "▴" : "▾"}
          </button>
        </div>
      </div>

      {/* Item list */}
      {!minimized && (
        <div className="relative overflow-y-auto" style={{ maxHeight: "calc(70vh - 60px)" }}>
          <div className="divide-y divide-white/[0.04]">
            {state.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                isCurrent={state.currentItemId === item.id}
                onView={() => onViewItem(item)}
              />
            ))}
          </div>
          {state.items.length === 0 && (
            <div className="px-4 py-6 text-center text-[11px] text-[var(--text-muted)]">
              No items in queue.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item,
  isCurrent,
  onView,
}: {
  item: AutoPipelineItem;
  isCurrent: boolean;
  onView: () => void;
}) {
  const isDone = item.status === "done";
  const isFailed = item.status === "failed";
  const isWorking =
    item.status === "generating" ||
    item.status === "converting" ||
    item.status === "exporting" ||
    item.status === "mocking" ||
    item.status === "videoing" ||
    item.status === "writing";

  return (
    <div
      className={`px-4 py-2.5 flex items-center gap-3 ${
        isCurrent ? "bg-blue-500/[0.08]" : ""
      }`}
    >
      {/* Status badge */}
      <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center text-[12px]">
        {isDone && <span className="text-emerald-400">✓</span>}
        {isFailed && <span className="text-red-400">✗</span>}
        {isWorking && (
          <svg className="w-3.5 h-3.5 animate-spin text-blue-300" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="40 60" />
          </svg>
        )}
        {item.status === "queued" && <span className="text-[var(--text-muted)] opacity-40">⏸</span>}
      </div>

      {/* Title + tiny step pills */}
      <div className="flex-1 min-w-0">
        <p
          className="text-[11.5px] text-white truncate"
          title={item.title}
        >
          {item.title}
        </p>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          <StepPill label="gen" done={!!(item.imageUrl || item.hasImage)} active={item.status === "generating"} />
          <StepPill label="chart" done={!!item.patternStats} active={item.status === "converting"} />
          <StepPill label="pdf" done={!!item.hasPdf} active={item.status === "exporting"} />
          <StepPill label="mocks" done={hasRenderableMockups(item)} active={item.status === "mocking"} />
          <StepPill label="video" done={!!item.hasVideo} active={item.status === "videoing"} />
          <StepPill label="copy" done={!!item.listingCopy} active={item.status === "writing"} />
          {item.etsyListingId && (
            <span className="text-[9px] text-emerald-300/80 ml-1">✓ Etsy draft</span>
          )}
          {isFailed && (
            <span
              className="text-[9px] text-red-400 truncate max-w-[180px]"
              title={item.error || "unknown error"}
            >
              {item.error || "failed"}
            </span>
          )}
        </div>
      </div>

      {/* Action button */}
      {isDone && (
        <button
          onClick={onView}
          className="text-[10px] px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-100 rounded transition-colors flex-shrink-0"
          title="Open this item in the Convert tab"
        >
          View →
        </button>
      )}
    </div>
  );
}

function hasRenderableMockups(item: AutoPipelineItem): boolean {
  return !!item.mockups?.some((m) => !!m.dataUrl);
}

function StepPill({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <span
      className={`text-[9px] px-1 py-0.5 rounded ${
        done
          ? "bg-emerald-500/15 text-emerald-300"
          : active
          ? "bg-blue-500/20 text-blue-200"
          : "bg-white/[0.04] text-[var(--text-muted)] opacity-50"
      }`}
    >
      {done ? "✓" : active ? "·" : "·"} {label}
    </span>
  );
}
