"use client";

import type { AutoPhase } from "@/lib/auto-mode-orchestrator";

const PHASES: { key: AutoPhase; label: string; activeLabel: string }[] = [
  { key: "inferring", label: "Analyze idea", activeLabel: "Analyzing your idea..." },
  { key: "generating", label: "Generate product", activeLabel: "Generating product..." },
  { key: "mockups", label: "Create mockups", activeLabel: "Creating mockups..." },
  { key: "listing", label: "Write listing", activeLabel: "Writing Etsy listing..." },
];

const PHASE_ORDER: AutoPhase[] = ["inferring", "generating", "mockups", "listing", "done"];

function getPhaseIndex(phase: AutoPhase | null): number {
  if (!phase) return -1;
  return PHASE_ORDER.indexOf(phase);
}

interface AutoModeProgressProps {
  currentPhase: AutoPhase | null;
  error: string | null;
}

export function AutoModeProgress({ currentPhase, error }: AutoModeProgressProps) {
  const currentIdx = getPhaseIndex(currentPhase);
  const isDone = currentPhase === "done";

  return (
    <div className="space-y-3">
      {PHASES.map((phase, i) => {
        const phaseIdx = getPhaseIndex(phase.key);
        const isActive = phaseIdx === currentIdx && !isDone;
        const isCompleted = phaseIdx < currentIdx || isDone;
        const isFailed = isActive && !!error;
        const isPending = phaseIdx > currentIdx;

        return (
          <div key={phase.key} className="flex items-center gap-3">
            {/* Icon */}
            <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center">
              {isCompleted && (
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              {isActive && !isFailed && (
                <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              )}
              {isFailed && (
                <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              )}
              {isPending && (
                <div className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-white/20" />
                </div>
              )}
            </div>

            {/* Label */}
            <span
              className={`text-sm ${
                isActive && !isFailed
                  ? "text-indigo-300 font-medium"
                  : isCompleted
                    ? "text-emerald-300/80"
                    : isFailed
                      ? "text-red-400 font-medium"
                      : "text-white/30"
              }`}
            >
              {isActive ? phase.activeLabel : phase.label}
            </span>
          </div>
        );
      })}

      {/* Error message */}
      {error && (
        <div className="mt-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Done message */}
      {isDone && !error && (
        <div className="mt-4 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <p className="text-xs text-emerald-400 font-medium">
            Product ready! Redirecting to preview...
          </p>
        </div>
      )}
    </div>
  );
}
