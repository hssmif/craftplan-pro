"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDigitalStudioStore } from "@/stores/digitalStudioStore";
import { DIGITAL_PRODUCT_LABELS, type DigitalProductType } from "@/types/digital-product";

// ── Inline Project Library Panel ──
// Compact sidebar/drawer showing recent projects with quick-load.

const PRODUCT_TYPE_ICONS: Record<DigitalProductType, string> = {
  notion: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
  pdf: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  excel: "M3 10h18M3 14h18M3 18h18M3 6h18M7 3v18M17 3v18",
  printable: "M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-white/10 text-white/50",
  generated: "bg-blue-500/15 text-blue-300",
  "mockups-ready": "bg-violet-500/15 text-violet-300",
  "listing-ready": "bg-amber-500/15 text-amber-300",
  published: "bg-emerald-500/15 text-emerald-300",
  archived: "bg-white/5 text-white/30",
};

interface ProjectLibraryPanelProps {
  onClose: () => void;
}

export function ProjectLibraryPanel({ onClose }: ProjectLibraryPanelProps) {
  const projects = useDigitalStudioStore((s) => s.projects);
  const loadProject = useDigitalStudioStore((s) => s.loadProject);
  const refreshProjectList = useDigitalStudioStore((s) => s.refreshProjectList);
  const router = useRouter();

  // Refresh on mount
  useEffect(() => {
    refreshProjectList();
  }, [refreshProjectList]);

  const handleLoad = async (id: string) => {
    try {
      await loadProject(id);
      onClose();
    } catch {
      // Error handled by store
    }
  };

  const recentProjects = projects.slice(0, 10);

  return (
    <div className="w-80 bg-[var(--bg-surface)] border-l border-white/[0.06] flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <h3 className="text-sm font-semibold text-white">Projects</h3>
        <button
          onClick={onClose}
          className="p-1 text-white/40 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Project List */}
      <div className="flex-1 overflow-y-auto py-2">
        {recentProjects.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-white/30">No projects yet</p>
            <p className="text-[10px] text-white/20 mt-1">Create your first digital product above.</p>
          </div>
        ) : (
          <div className="space-y-1 px-2">
            {recentProjects.map((p) => (
              <button
                key={p.id}
                onClick={() => handleLoad(p.id)}
                className="w-full text-left p-3 rounded-lg hover:bg-white/[0.04] transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <svg
                    className="w-4 h-4 text-white/30 mt-0.5 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d={PRODUCT_TYPE_ICONS[p.productType]}
                    />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white/70 group-hover:text-white truncate">
                      {p.projectName}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-white/30">
                        {DIGITAL_PRODUCT_LABELS[p.productType]}
                      </span>
                      <span className={`
                        text-[9px] px-1.5 py-0.5 rounded-full
                        ${STATUS_COLORS[p.status] || STATUS_COLORS.draft}
                      `}>
                        {p.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-white/20 mt-0.5">
                      {new Date(p.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-white/[0.06] p-3">
        <button
          onClick={() => {
            router.push("/digital-studio/library");
            onClose();
          }}
          className="w-full px-3 py-2 text-xs text-white/50 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-lg border border-white/[0.06] transition-colors text-center"
        >
          View All Projects →
        </button>
      </div>
    </div>
  );
}
