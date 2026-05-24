"use client";

import { STEP_ORDER, STEP_LABELS, type StudioStep, type StepStatus } from "@/types/product-studio";
import { useStudioStore } from "@/stores/studioStore";

// ── Step Icons (SVG path data) ──

const STEP_ICON_PATHS: Record<StudioStep, string> = {
  inspiration:
    "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  generation:
    "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
  selection:
    "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z",
  products:
    "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  listings:
    "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z",
  printful:
    "M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z",
  "etsy-sync":
    "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12",
  fulfillment:
    "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
};

// ── Status Colors ──

function getStepColors(status: StepStatus, isActive: boolean) {
  if (isActive) {
    return {
      dot: "bg-indigo-500 ring-2 ring-indigo-500/30",
      icon: "text-white",
      label: "text-white font-semibold",
      line: "bg-indigo-500/40",
    };
  }

  switch (status) {
    case "done":
      return {
        dot: "bg-emerald-500",
        icon: "text-white",
        label: "text-emerald-400",
        line: "bg-emerald-500",
      };
    case "running":
      return {
        dot: "bg-amber-500 animate-pulse",
        icon: "text-white",
        label: "text-amber-400",
        line: "bg-amber-500/40",
      };
    case "error":
      return {
        dot: "bg-red-500",
        icon: "text-white",
        label: "text-red-400",
        line: "bg-red-500/40",
      };
    case "skipped":
      return {
        dot: "bg-white/20",
        icon: "text-white/40",
        label: "text-white/40",
        line: "bg-white/10",
      };
    case "idle":
    default:
      return {
        dot: "bg-white/10 border border-white/20",
        icon: "text-white/30",
        label: "text-white/40",
        line: "bg-white/10",
      };
  }
}

// ── Check Icon ──

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
  );
}

// ── Spinner Icon ──

function SpinnerIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Component ──

export function StepProgressBar() {
  const project = useStudioStore((s) => s.project);
  const goToStep = useStudioStore((s) => s.goToStep);

  const currentIdx = STEP_ORDER.indexOf(project.currentStep);

  return (
    <div className="w-full px-2 py-4">
      <div className="flex items-center justify-between max-w-5xl mx-auto">
        {STEP_ORDER.map((step, idx) => {
          const status = project.stepStatuses[step];
          const isActive = step === project.currentStep;
          const isPast = idx < currentIdx;
          const colors = getStepColors(status, isActive);

          // Can click to navigate to completed or current steps
          const canClick = isPast || isActive || status === "done";

          return (
            <div key={step} className="flex items-center flex-1 last:flex-none">
              {/* Step dot + label */}
              <button
                onClick={() => canClick && goToStep(step)}
                disabled={!canClick}
                className={`
                  flex flex-col items-center gap-1.5 group relative
                  ${canClick ? "cursor-pointer" : "cursor-default"}
                `}
                title={STEP_LABELS[step]}
              >
                {/* Dot */}
                <div
                  className={`
                    w-9 h-9 rounded-full flex items-center justify-center
                    transition-all duration-200
                    ${colors.dot}
                    ${canClick && !isActive ? "group-hover:ring-2 group-hover:ring-white/20" : ""}
                  `}
                >
                  {status === "done" ? (
                    <CheckIcon />
                  ) : status === "running" ? (
                    <SpinnerIcon />
                  ) : (
                    <svg
                      className={`w-4 h-4 ${colors.icon}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d={STEP_ICON_PATHS[step]}
                      />
                    </svg>
                  )}
                </div>

                {/* Label */}
                <span
                  className={`
                    text-[10px] tracking-wide whitespace-nowrap
                    transition-colors duration-200
                    ${colors.label}
                  `}
                >
                  {STEP_LABELS[step]}
                </span>

                {/* Step number badge (small) */}
                <span
                  className={`
                    absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold
                    flex items-center justify-center
                    ${isActive ? "bg-indigo-600 text-white" : "hidden"}
                  `}
                >
                  {idx + 1}
                </span>
              </button>

              {/* Connector line */}
              {idx < STEP_ORDER.length - 1 && (
                <div className="flex-1 mx-1.5 h-[2px] rounded-full relative">
                  <div className="absolute inset-0 bg-white/[0.06] rounded-full" />
                  <div
                    className={`
                      absolute inset-y-0 left-0 rounded-full transition-all duration-500
                      ${isPast ? "w-full bg-emerald-500" : isActive ? "w-1/2 bg-indigo-500/60" : "w-0"}
                    `}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
