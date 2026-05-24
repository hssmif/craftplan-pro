"use client";

import { useStudioStore } from "@/stores/studioStore";
import { StepProgressBar } from "@/components/product-studio/StepProgressBar";
import { InspirationPanel } from "@/components/product-studio/InspirationPanel";
import { DesignGenerationPanel } from "@/components/product-studio/DesignGenerationPanel";
import { DesignSelectionPanel } from "@/components/product-studio/DesignSelectionPanel";
import { ProductConfigPanel } from "@/components/product-studio/ProductConfigPanel";
import { ListingPanel } from "@/components/product-studio/ListingPanel";
import { PrintfulPanel } from "@/components/product-studio/PrintfulPanel";
import { EtsySyncPanel } from "@/components/product-studio/EtsySyncPanel";
import { FulfillmentPanel } from "@/components/product-studio/FulfillmentPanel";

// ── Main Page ──

export default function ProductStudioPage() {
  const project = useStudioStore((s) => s.project);
  const prevStep = useStudioStore((s) => s.prevStep);
  const nextStep = useStudioStore((s) => s.nextStep);
  const canAdvance = useStudioStore((s) => s.canAdvance);
  const getCurrentStepIndex = useStudioStore((s) => s.getCurrentStepIndex);
  const saveProject = useStudioStore((s) => s.saveProject);
  const newProject = useStudioStore((s) => s.newProject);

  const stepIndex = getCurrentStepIndex();

  // Render the active step panel
  const renderStepPanel = () => {
    switch (project.currentStep) {
      case "inspiration":
        return <InspirationPanel />;
      case "generation":
        return <DesignGenerationPanel />;
      case "selection":
        return <DesignSelectionPanel />;
      case "products":
        return <ProductConfigPanel />;
      case "listings":
        return <ListingPanel />;
      case "printful":
        return <PrintfulPanel />;
      case "etsy-sync":
        return <EtsySyncPanel />;
      case "fulfillment":
        return <FulfillmentPanel />;
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[var(--bg-primary)]">
      {/* ── Header ── */}
      <header className="border-b border-white/[0.06] bg-[var(--bg-surface)]">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-white">Product Studio</h1>
              {project.inspiration.keyword && (
                <p className="text-[11px] text-white/40">
                  {project.inspiration.keyword} &middot;{" "}
                  {project.designs.length > 0
                    ? `${project.designs.length} designs`
                    : project.designMode}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => saveProject()}
              className="px-3 py-1.5 text-xs text-white/60 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-lg border border-white/[0.08] transition-colors"
            >
              Save Draft
            </button>
            <button
              onClick={newProject}
              className="px-3 py-1.5 text-xs text-white/60 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-lg border border-white/[0.08] transition-colors"
            >
              New Project
            </button>
          </div>
        </div>

        {/* Step Progress Bar */}
        <StepProgressBar />
      </header>

      {/* ── Step Content ── */}
      <main className="flex-1 overflow-y-auto p-6">{renderStepPanel()}</main>

      {/* ── Bottom Navigation ── */}
      <footer className="border-t border-white/[0.06] bg-[var(--bg-surface)] px-6 py-3">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <button
            onClick={prevStep}
            disabled={stepIndex === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white/60 hover:text-white disabled:text-white/20 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Previous
          </button>

          {/* Step indicator */}
          <span className="text-xs text-white/30">
            Step {stepIndex + 1} of 8
          </span>

          <button
            onClick={nextStep}
            disabled={!canAdvance()}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/10 disabled:text-white/30 rounded-xl transition-colors"
          >
            {stepIndex === 7 ? "Complete" : "Next Step"}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </footer>
    </div>
  );
}
