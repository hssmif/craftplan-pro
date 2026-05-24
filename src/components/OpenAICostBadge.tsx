"use client";

import { useState } from "react";
import { useCostTracker, resetCostSession } from "@/lib/openai-cost-tracker";

// Floating OpenAI session-cost badge — top-right overlay that shows
// the running per-session estimate of gpt-image-2 + gpt-4o-mini spend.
// Click to expand a call log; "Reset" clears the running total.
//
// Estimates are client-side (per-route constants from openai-cost-tracker.ts),
// so the OpenAI bill will be within ±10% of what's shown here.
export function OpenAICostBadge() {
  const cost = useCostTracker();
  const [expanded, setExpanded] = useState(false);

  if (cost.totalUsd === 0 && cost.calls.length === 0) {
    // Don't clutter the UI when nothing's been spent yet.
    return null;
  }

  const image2 = cost.byModel["gpt-image-2"] || 0;
  const mini = cost.byModel["gpt-4o-mini"] || 0;

  return (
    <div
      className="fixed top-4 right-4 z-50 select-none"
      style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/80 backdrop-blur border border-white/[0.08] text-white text-[11px] font-medium hover:border-purple-500/40 transition-colors shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5)]"
        title="Session OpenAI cost estimate — click to expand"
      >
        <span className="text-[10px] text-purple-400">⚡ OpenAI</span>
        <span className="text-emerald-400">${cost.totalUsd.toFixed(2)}</span>
        <span className="text-[9px] text-[var(--text-muted)]">·</span>
        <span className="text-[9px] text-[var(--text-muted)]">{cost.calls.length} calls</span>
        <span className="text-[9px] opacity-50">{expanded ? "▴" : "▾"}</span>
      </button>

      {expanded && (
        <div className="mt-1.5 w-80 rounded-lg bg-black/90 backdrop-blur border border-white/[0.08] p-3 shadow-[0_8px_32px_-4px_rgba(0,0,0,0.6)]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold text-white">
              Session estimate
            </p>
            <button
              onClick={() => {
                if (confirm("Reset session OpenAI cost counter?")) {
                  resetCostSession();
                }
              }}
              className="text-[9px] text-red-400 hover:text-red-300"
            >
              Reset
            </button>
          </div>

          <div className="space-y-1 mb-2 text-[10px]">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">gpt-image-2</span>
              <span className="text-emerald-300">${image2.toFixed(3)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">gpt-4o-mini</span>
              <span className={mini > 0 ? "text-amber-300" : "text-[var(--text-muted)]"}>${mini.toFixed(4)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-white/[0.06]">
              <span className="text-white font-medium">Total</span>
              <span className="text-emerald-400 font-semibold">${cost.totalUsd.toFixed(3)}</span>
            </div>
          </div>

          <p className="text-[9px] text-[var(--text-muted)] mb-1">Recent calls</p>
          <div className="max-h-48 overflow-y-auto space-y-0.5 text-[9px]">
            {cost.calls.length === 0 && (
              <p className="text-[var(--text-muted)] italic">(no calls yet)</p>
            )}
            {cost.calls.slice().reverse().map((c, i) => (
              <div key={i} className="flex justify-between gap-2 py-0.5">
                <span className="text-[var(--text-muted)] truncate flex-1">
                  <span className={c.model === "gpt-image-2" ? "text-emerald-400" : c.model === "gpt-4o-mini" ? "text-amber-400" : "text-blue-400"}>
                    {c.model.replace("gpt-", "")}
                  </span>
                  {" "}{c.label}
                </span>
                <span className="text-white flex-shrink-0">${c.usd.toFixed(3)}</span>
              </div>
            ))}
          </div>

          <p className="text-[8px] text-[var(--text-muted)] mt-2 italic leading-relaxed">
            Client-side estimate — actual OpenAI bill within ±10%. Resets on Reset.
          </p>
        </div>
      )}
    </div>
  );
}
