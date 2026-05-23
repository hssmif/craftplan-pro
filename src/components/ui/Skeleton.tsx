"use client";

// ── Base shimmer skeleton ──
function SkeletonPulse({ className = "" }: { className?: string }) {
  return (
    <div className={`skeleton-pulse rounded bg-slate-200 ${className}`} />
  );
}

// ── Skeleton Card — for catalog template cards ──
export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <SkeletonPulse className="h-32 rounded-none" />
      <div className="p-4 space-y-3">
        <SkeletonPulse className="h-4 w-3/4" />
        <SkeletonPulse className="h-3 w-1/2" />
        <div className="flex gap-2">
          <SkeletonPulse className="h-5 w-16 rounded-full" />
          <SkeletonPulse className="h-5 w-20 rounded-full" />
        </div>
        <div className="flex gap-1.5 mt-2">
          <SkeletonPulse className="h-8 flex-1 rounded-lg" />
          <SkeletonPulse className="h-8 flex-1 rounded-lg" />
          <SkeletonPulse className="h-8 w-10 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

// ── Skeleton KPI — for dashboard KPI cards ──
export function SkeletonKPI() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-3 mb-3">
        <SkeletonPulse className="w-10 h-10 rounded-xl" />
        <div className="space-y-2 flex-1">
          <SkeletonPulse className="h-3 w-20" />
          <SkeletonPulse className="h-7 w-16" />
        </div>
      </div>
      <SkeletonPulse className="h-3 w-28" />
    </div>
  );
}

// ── Skeleton Table — for data tables ──
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 px-4 py-3 border-b border-slate-100">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonPulse key={`h${i}`} className="h-3 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-4 px-4 py-3 border-b border-slate-50 last:border-0">
          {Array.from({ length: cols }).map((_, col) => (
            <SkeletonPulse
              key={`${row}-${col}`}
              className={`h-4 flex-1 ${col === 0 ? "w-1/3" : ""}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Skeleton List — for list items ──
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
          <SkeletonPulse className="w-8 h-8 rounded-lg" />
          <div className="flex-1 space-y-2">
            <SkeletonPulse className="h-4 w-3/4" />
            <SkeletonPulse className="h-3 w-1/2" />
          </div>
          <SkeletonPulse className="h-5 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}
