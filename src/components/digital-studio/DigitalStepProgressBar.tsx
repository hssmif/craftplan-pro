"use client";

import {
  DIGITAL_STEP_ORDER,
  DIGITAL_STEP_LABELS,
  type DigitalStudioStep,
  type DigitalStepStatus,
} from "@/types/digital-product";
import { useDigitalStudioStore } from "@/stores/digitalStudioStore";

// ── Step Icons (SVG path data) ──

const STEP_ICON_PATHS: Record<DigitalStudioStep, string> = {
  discover:
    "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  configure:
    "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
  generate:
    "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
  preview:
    "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
  listing:
    "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z",
  publish:
    "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12",
};

// ── Status Colors ──

function getStepColors(status: DigitalStepStatus, isActive: boolean) {
  if (isActive) {
    return {
      dot: "bg-indigo-500 ring-2 ring-indigo-500/30",
      icon: "text-white",
      label: "text-white font-semibold",
    };
  }

  switch (status) {
    case "done":
      return {
        dot: "bg-emerald-500",
        icon: "text-white",
        label: "text-emerald-400",
      };
    case "running":
      return {
        dot: "bg-amber-500 animate-pulse",
        icon: "text-white",
        label: "text-amber-400",
      };
    case "error":
      return {
        dot: "bg-red-500",
        icon: "text-white",
        label: "text-red-400",
      };
    case "skipped":
      return {
        dot: "bg-white/20",
        icon: "text-white/40",
        label: "text-white/40",
      };
    case "idle":
    default:
      return {
        dot: "bg-white/10 border border-white/20",
        icon: "text-white/30",
        label: "text-white/40",
      };
  }
}

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Component ──

export function DigitalStepProgressBar() {
  const project = useDigitalStudioStore((s) => s.project);
  const goToStep = useDigitalStudioStore((s) => s.goToStep);

  const currentIdx = DIGITAL_STEP_ORDER.indexOf(project.currentStep);

  return (
    <div className="w-full px-2 py-4">
      <div className="flex items-center justify-between max-w-5xl mx-auto">
        {DIGITAL_STEP_ORDER.map((step, idx) => {
          const status = project.stepStatuses[step];
          const isActive = step === project.currentStep;
          const isPast = idx < currentIdx;
          const colors = getStepColors(status, isActive);
          const canClick = isPast || isActive || status === "done";

          return (
            <div key={step} className="flex items-center flex-1 last:flex-none">
              <button
                onClick={() => canClick && goToStep(step)}
                disabled={!canClick}
                className={`
                  flex flex-col items-center gap-1.5 group relative
                  ${canClick ? "cursor-pointer" : "cursor-default"}
                `}
                title={DIGITAL_STEP_LABELS[step]}
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
                  {DIGITAL_STEP_LABELS[step]}
                </span>

                {/* Active step badge */}
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
              {idx < DIGITAL_STEP_ORDER.length - 1 && (
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
