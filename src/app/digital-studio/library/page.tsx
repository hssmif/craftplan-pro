"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDigitalStudioStore } from "@/stores/digitalStudioStore";
import {
  DIGITAL_PRODUCT_LABELS,
  DIGITAL_STEP_LABELS,
  type DigitalProductType,
} from "@/types/digital-product";

// ── Digital Product Library Page ──
// Browse, filter, and manage all digital product projects.
// Supports bulk selection, duplication, ZIP export, and batch badges.

const PRODUCT_TYPE_ICONS: Record<DigitalProductType, string> = {
  notion: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
  pdf: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  excel: "M3 10h18M3 14h18M3 18h18M3 6h18M7 3v18M17 3v18",
  printable: "M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z",
};

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  draft: { bg: "bg-white/10", text: "text-white/50" },
  generated: { bg: "bg-blue-500/15", text: "text-blue-300" },
  "mockups-ready": { bg: "bg-violet-500/15", text: "text-violet-300" },
  "listing-ready": { bg: "bg-amber-500/15", text: "text-amber-300" },
  published: { bg: "bg-emerald-500/15", text: "text-emerald-300" },
  archived: { bg: "bg-white/5", text: "text-white/30" },
};

type FilterType = "all" | DigitalProductType;

export default function DigitalStudioLibraryPage() {
  const projects = useDigitalStudioStore((s) => s.projects);
  const loadProject = useDigitalStudioStore((s) => s.loadProject);
  const deleteProject = useDigitalStudioStore((s) => s.deleteProject);
  const refreshProjectList = useDigitalStudioStore((s) => s.refreshProjectList);
  const duplicateProject = useDigitalStudioStore((s) => s.duplicateProject);
  const newProject = useDigitalStudioStore((s) => s.newProject);

  const router = useRouter();
  const [filter, setFilter] = useState<FilterType>("all");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDuplicating, setIsDuplicating] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<string | null>(null);

  useEffect(() => {
    refreshProjectList();
  }, [refreshProjectList]);

  const filteredProjects = filter === "all"
    ? projects
    : projects.filter((p) => p.productType === filter);

  const hasSelection = selectedIds.size > 0;

  const handleOpen = async (id: string) => {
    try {
      await loadProject(id);
      router.push("/digital-studio");
    } catch {
      // Error handled by store
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProject(id);
      setConfirmDelete(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch {
      // Error handled by store
    }
  };

  const handleNew = () => {
    newProject();
    router.push("/digital-studio");
  };

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const allIds = filteredProjects.map((p) => p.id);
    setSelectedIds(new Set(allIds));
  }, [filteredProjects]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // ── Duplicate a single project ──
  const handleDuplicate = useCallback(async (projectId: string) => {
    setIsDuplicating(projectId);
    try {
      // Load the project first so the store has it as current
      await loadProject(projectId);
      await duplicateProject();
      await refreshProjectList();
    } catch {
      // Error handled by store
    } finally {
      setIsDuplicating(null);
    }
  }, [loadProject, duplicateProject, refreshProjectList]);

  // ── Export a single project as ZIP ──
  const handleExport = useCallback(async (projectId: string) => {
    setIsExporting(projectId);
    try {
      const resp = await fetch("/api/digital/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!resp.ok) throw new Error("Export failed");

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = resp.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="(.+?)"/);
      a.download = match?.[1] || "listing-package.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Silent fail for export
    } finally {
      setIsExporting(null);
    }
  }, []);

  // ── Bulk Export ──
  const handleBulkExport = useCallback(async () => {
    setBulkAction("exporting");
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await handleExport(id);
    }
    setBulkAction(null);
  }, [selectedIds, handleExport]);

  // ── Bulk Duplicate ──
  const handleBulkDuplicate = useCallback(async () => {
    setBulkAction("duplicating");
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try {
        await loadProject(id);
        await duplicateProject();
      } catch {
        // Continue with other projects
      }
    }
    await refreshProjectList();
    setSelectedIds(new Set());
    setBulkAction(null);
  }, [selectedIds, loadProject, duplicateProject, refreshProjectList]);

  return (
    <div className="flex-1 min-h-screen bg-[var(--bg-primary)] p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Digital Product Library</h1>
            <p className="text-sm text-white/50 mt-1">
              {projects.length} project{projects.length !== 1 ? "s" : ""}
            </p>
          </div>

          <button
            onClick={handleNew}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Project
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          {(["all", "notion", "pdf", "excel", "printable"] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`
                px-4 py-2 text-xs font-medium rounded-lg border transition-colors
                ${filter === f
                  ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300"
                  : "bg-white/[0.04] border-white/[0.08] text-white/50 hover:text-white hover:border-white/20"
                }
              `}
            >
              {f === "all" ? "All" : DIGITAL_PRODUCT_LABELS[f]}
            </button>
          ))}

          {/* Select All / Deselect All */}
          {filteredProjects.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              {hasSelection ? (
                <button
                  onClick={deselectAll}
                  className="px-3 py-2 text-[10px] text-white/40 hover:text-white transition-colors"
                >
                  Deselect All
                </button>
              ) : (
                <button
                  onClick={selectAll}
                  className="px-3 py-2 text-[10px] text-white/40 hover:text-white transition-colors"
                >
                  Select All
                </button>
              )}
            </div>
          )}
        </div>

        {/* Bulk Actions Bar */}
        {hasSelection && (
          <div className="flex items-center gap-3 p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl">
            <span className="text-xs text-violet-300 font-medium">
              {selectedIds.size} selected
            </span>
            <div className="flex-1" />
            <button
              onClick={handleBulkExport}
              disabled={bulkAction !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg border border-emerald-500/20 transition-colors disabled:opacity-50"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {bulkAction === "exporting" ? "Exporting..." : `Export ${selectedIds.size} as ZIP`}
            </button>
            <button
              onClick={handleBulkDuplicate}
              disabled={bulkAction !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 rounded-lg border border-violet-500/20 transition-colors disabled:opacity-50"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {bulkAction === "duplicating" ? "Duplicating..." : `Duplicate ${selectedIds.size}`}
            </button>
            <button
              onClick={deselectAll}
              className="px-2 py-1.5 text-xs text-white/40 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        )}

        {/* Projects Grid */}
        {filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg className="w-12 h-12 text-white/15 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p className="text-white/40 text-sm font-medium">No projects found</p>
            <p className="text-white/25 text-xs mt-1">
              {filter !== "all" ? `No ${DIGITAL_PRODUCT_LABELS[filter]} projects yet.` : "Create your first digital product to get started."}
            </p>
            <button
              onClick={handleNew}
              className="mt-4 px-4 py-2 text-xs text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-lg border border-indigo-500/20 transition-colors"
            >
              Create Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((p) => {
              const status = STATUS_STYLES[p.status] || STATUS_STYLES.draft;
              const isSelected = selectedIds.has(p.id);
              return (
                <div
                  key={p.id}
                  className={`group relative p-5 bg-white/[0.03] border rounded-xl hover:border-white/[0.15] transition-all ${
                    isSelected ? "border-violet-500/40 bg-violet-500/[0.03]" : "border-white/[0.08]"
                  }`}
                >
                  {/* Selection Checkbox */}
                  <button
                    onClick={() => toggleSelect(p.id)}
                    className={`absolute top-3 right-3 w-5 h-5 rounded border flex items-center justify-center transition-all ${
                      isSelected
                        ? "bg-violet-500 border-violet-400"
                        : "border-white/20 opacity-0 group-hover:opacity-100 hover:border-white/40"
                    }`}
                  >
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>

                  {/* Type Icon + Name */}
                  <div className="flex items-start gap-3 mb-3 pr-6">
                    <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={PRODUCT_TYPE_ICONS[p.productType]} />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{p.projectName}</p>
                      <p className="text-xs text-white/40">{DIGITAL_PRODUCT_LABELS[p.productType]}</p>
                    </div>
                  </div>

                  {/* Status + Step + Batch Badge */}
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${status.bg} ${status.text}`}>
                      {p.status}
                    </span>
                    <span className="text-[10px] text-white/25">
                      @ {DIGITAL_STEP_LABELS[p.currentStep]}
                    </span>
                    {p.batchId && (
                      <span className="text-[9px] text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded border border-violet-500/20">
                        Batch{p.variantLabel ? ` · ${p.variantLabel}` : ""}
                      </span>
                    )}
                    {p.importSourceType === "extension" && (
                      <span className="text-[9px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                        Imported
                      </span>
                    )}
                  </div>

                  {/* Date */}
                  <p className="text-[10px] text-white/20 mb-4">
                    Updated {new Date(p.updatedAt).toLocaleDateString()}
                  </p>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => handleOpen(p.id)}
                      className="flex-1 px-3 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors text-center"
                    >
                      Open
                    </button>

                    {/* Duplicate */}
                    <button
                      onClick={() => handleDuplicate(p.id)}
                      disabled={isDuplicating === p.id}
                      className="px-2.5 py-2 text-xs text-white/40 hover:text-violet-300 bg-white/[0.04] hover:bg-violet-500/10 rounded-lg border border-white/[0.08] hover:border-violet-500/30 transition-colors disabled:opacity-50"
                      title="Duplicate"
                    >
                      {isDuplicating === p.id ? (
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>

                    {/* Export */}
                    <button
                      onClick={() => handleExport(p.id)}
                      disabled={isExporting === p.id}
                      className="px-2.5 py-2 text-xs text-white/40 hover:text-emerald-300 bg-white/[0.04] hover:bg-emerald-500/10 rounded-lg border border-white/[0.08] hover:border-emerald-500/30 transition-colors disabled:opacity-50"
                      title="Export ZIP"
                    >
                      {isExporting === p.id ? (
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      )}
                    </button>

                    {/* Delete */}
                    {confirmDelete === p.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="px-3 py-2 text-xs text-red-300 bg-red-500/15 hover:bg-red-500/25 rounded-lg border border-red-500/30 transition-colors"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="px-2 py-2 text-xs text-white/40 hover:text-white transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(p.id)}
                        className="px-2.5 py-2 text-xs text-white/40 hover:text-red-400 bg-white/[0.04] hover:bg-red-500/10 rounded-lg border border-white/[0.08] hover:border-red-500/30 transition-colors"
                        title="Delete"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
