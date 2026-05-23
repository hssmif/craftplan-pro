"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useDigitalStudioStore } from "@/stores/digitalStudioStore";
import { DIGITAL_PRODUCT_LABELS, DIGITAL_STEP_ORDER } from "@/types/digital-product";
import { DigitalStepProgressBar } from "@/components/digital-studio/DigitalStepProgressBar";
import { DiscoverPanel } from "@/components/digital-studio/DiscoverPanel";
import { ConfigurePanel } from "@/components/digital-studio/ConfigurePanel";
import { GeneratePanel } from "@/components/digital-studio/GeneratePanel";
import { PreviewPanel } from "@/components/digital-studio/PreviewPanel";
import { ListingPanel } from "@/components/digital-studio/ListingPanel";
import { PublishPanel } from "@/components/digital-studio/PublishPanel";
import { ProjectLibraryPanel } from "@/components/digital-studio/ProjectLibraryPanel";

// ── Main Digital Studio Page ──
// 6-step unified pipeline for all digital product types.
// Supports:
// - ?project=PROJECT_ID — auto-loads an existing project
// - ?source=extension   — listens for extension payload via localStorage

export default function DigitalStudioPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex min-h-screen bg-[var(--bg-primary)] items-center justify-center">
        <div className="text-white/40 text-sm">Loading Digital Studio...</div>
      </div>
    }>
      <DigitalStudioInner />
    </Suspense>
  );
}

function DigitalStudioInner() {
  const project = useDigitalStudioStore((s) => s.project);
  const prevStep = useDigitalStudioStore((s) => s.prevStep);
  const nextStep = useDigitalStudioStore((s) => s.nextStep);
  const canAdvance = useDigitalStudioStore((s) => s.canAdvance);
  const getCurrentStepIndex = useDigitalStudioStore((s) => s.getCurrentStepIndex);
  const saveProject = useDigitalStudioStore((s) => s.saveProject);
  const newProject = useDigitalStudioStore((s) => s.newProject);
  const loadProject = useDigitalStudioStore((s) => s.loadProject);
  const importFromExtension = useDigitalStudioStore((s) => s.importFromExtension);
  const isSaving = useDigitalStudioStore((s) => s.isSaving);
  const isLoading = useDigitalStudioStore((s) => s.isLoading);

  const [showLibrary, setShowLibrary] = useState(false);
  const [importBanner, setImportBanner] = useState<string | null>(null);
  const initializedRef = useRef(false);

  const searchParams = useSearchParams();

  // ── Handle ?project=ID and ?source=extension on mount ──
  const handleInitialLoad = useCallback(async () => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const projectId = searchParams.get("project");
    const source = searchParams.get("source");

    // Case 1: Load existing project by ID
    if (projectId) {
      try {
        await loadProject(projectId);
        setImportBanner(`Loaded project: ${projectId.slice(0, 15)}...`);
        setTimeout(() => setImportBanner(null), 3000);
      } catch {
        // Project load failed — stay on current/empty project
      }
      return;
    }

    // Case 2: Extension payload delivery
    if (source === "extension") {
      // Try reading from localStorage immediately (might already be set)
      const tryImport = () => {
        const raw = localStorage.getItem("craftplan_digital_studio_payload");
        if (!raw) return false;

        try {
          const payload = JSON.parse(raw);
          localStorage.removeItem("craftplan_digital_studio_payload");

          importFromExtension({
            title: payload.title || "",
            tags: payload.tags || payload.designKeywords || [],
            price: payload.price || 0,
            shopName: payload.shopName || "",
            url: payload.url || "",
            searchQuery: payload.searchQuery || "",
            podScore: payload.podScore || 0,
            reviews: payload.reviews || 0,
            rating: payload.rating || 0,
            isBestseller: payload.isBestseller || false,
            designKeywords: payload.designKeywords || [],
            description: payload.description,
          }).then(() => {
            setImportBanner("Imported from Etsy scan — config auto-detected, review before generating");
            setTimeout(() => setImportBanner(null), 5000);
          }).catch(() => {
            // Import failed — user stays on empty project
          });

          return true;
        } catch {
          return false;
        }
      };

      // Try immediately
      if (!tryImport()) {
        // If not ready yet, listen for the custom event from extension
        const handler = () => {
          tryImport();
          window.removeEventListener("craftplan-digital-studio-ready", handler);
        };
        window.addEventListener("craftplan-digital-studio-ready", handler);

        // Cleanup after 10s if nothing arrives
        setTimeout(() => {
          window.removeEventListener("craftplan-digital-studio-ready", handler);
        }, 10000);
      }
    }
  }, [searchParams, loadProject, importFromExtension]);

  useEffect(() => {
    handleInitialLoad();
  }, [handleInitialLoad]);

  const stepIndex = getCurrentStepIndex();

  // Render the active step panel
  const renderStepPanel = () => {
    switch (project.currentStep) {
      case "discover":
        return <DiscoverPanel />;
      case "configure":
        return <ConfigurePanel />;
      case "generate":
        return <GeneratePanel />;
      case "preview":
        return <PreviewPanel />;
      case "listing":
        return <ListingPanel />;
      case "publish":
        return <PublishPanel />;
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex min-h-screen bg-[var(--bg-primary)]">
      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col">
        {/* ── Import Banner ── */}
        {importBanner && (
          <div className="px-6 py-2 bg-indigo-500/15 border-b border-indigo-500/20 flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs text-indigo-300">{importBanner}</span>
            <button
              onClick={() => setImportBanner(null)}
              className="ml-auto text-indigo-400/60 hover:text-indigo-300 text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Loading Overlay ── */}
        {isLoading && (
          <div className="px-6 py-2 bg-violet-500/10 border-b border-violet-500/20 flex items-center gap-2">
            <svg className="w-4 h-4 text-violet-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-xs text-violet-300">Loading project...</span>
          </div>
        )}

        {/* ── Header ── */}
        <header className="border-b border-white/[0.06] bg-[var(--bg-surface)]">
          <div className="flex items-center justify-between px-6 py-3">
            <div className="flex items-center gap-3">
              {/* Logo */}
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-sm font-bold text-white">Digital Studio</h1>
                <p className="text-[11px] text-white/40">
                  {project.projectName !== "Untitled Product" ? project.projectName : "New Project"}
                  {project.config && (
                    <> · {DIGITAL_PRODUCT_LABELS[project.productType]}</>
                  )}
                  {project.importSource && (
                    <span className="text-indigo-400/60"> · imported</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => saveProject()}
                disabled={isSaving}
                className="px-3 py-1.5 text-xs text-white/60 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-lg border border-white/[0.08] transition-colors disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save Draft"}
              </button>
              <button
                onClick={() => newProject()}
                className="px-3 py-1.5 text-xs text-white/60 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-lg border border-white/[0.08] transition-colors"
              >
                New Project
              </button>
              <button
                onClick={() => setShowLibrary(!showLibrary)}
                className={`
                  px-3 py-1.5 text-xs rounded-lg border transition-colors
                  ${showLibrary
                    ? "text-indigo-300 bg-indigo-500/15 border-indigo-500/30"
                    : "text-white/60 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08]"
                  }
                `}
              >
                <svg className="w-3.5 h-3.5 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Library
              </button>
            </div>
          </div>

          {/* Step Progress Bar */}
          <DigitalStepProgressBar />
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

            <span className="text-xs text-white/30">
              Step {stepIndex + 1} of {DIGITAL_STEP_ORDER.length}
            </span>

            <button
              onClick={nextStep}
              disabled={!canAdvance()}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/10 disabled:text-white/30 rounded-xl transition-colors"
            >
              {stepIndex === DIGITAL_STEP_ORDER.length - 1 ? "Complete" : "Next Step"}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </footer>
      </div>

      {/* ── Library Sidebar ── */}
      {showLibrary && <ProjectLibraryPanel onClose={() => setShowLibrary(false)} />}
    </div>
  );
}
