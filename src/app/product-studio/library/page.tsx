"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useStudioStore } from "@/stores/studioStore";
import { STEP_LABELS } from "@/types/product-studio";
import type { StudioStep, DesignMode } from "@/types/product-studio";

interface ProjectSummary {
  id: string;
  keyword: string;
  designMode: DesignMode;
  designCount: number;
  selectedDesignCount: number;
  status: "draft" | "in-progress" | "completed" | "error";
  currentStep: StudioStep;
  nicheScore: number | null;
  thumbnailUrl: string | null;
  etsyListingCount: number;
  createdAt: string;
  updatedAt: string;
}

type FilterStatus = "all" | "draft" | "in-progress" | "completed";
type SortField = "updatedAt" | "createdAt" | "nicheScore" | "designCount";

export default function ProjectLibraryPage() {
  const projects = useStudioStore((s) => s.projects);
  const loadProject = useStudioStore((s) => s.loadProject);
  const deleteProject = useStudioStore((s) => s.deleteProject);
  const duplicateProject = useStudioStore((s) => s.duplicateProject);
  const newProject = useStudioStore((s) => s.newProject);

  const [dbProjects, setDbProjects] = useState<ProjectSummary[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Merge store projects with any additional DB projects
  useEffect(() => {
    fetch("/api/studio/projects")
      .then((r) => r.json())
      .then((data) => {
        if (data.projects) {
          const mapped: ProjectSummary[] = data.projects.map((p: Record<string, unknown>) => ({
            id: p.id as string,
            keyword: p.keyword as string,
            designMode: (p.design_mode as DesignMode) || "text",
            designCount: 0,
            selectedDesignCount: 0,
            status: (p.status as ProjectSummary["status"]) || "draft",
            currentStep: (p.current_step as StudioStep) || "inspiration",
            nicheScore: null,
            thumbnailUrl: null,
            etsyListingCount: 0,
            createdAt: p.created_at as string,
            updatedAt: p.updated_at as string,
          }));
          setDbProjects(mapped);
        }
      })
      .catch(() => {
        // DB not available, use store only
      });
  }, []);

  // Combine, deduplicate, filter, sort
  const allProjects = useMemo(() => {
    const combined = [...projects];
    for (const dbP of dbProjects) {
      if (!combined.find((p) => p.id === dbP.id)) {
        combined.push(dbP);
      }
    }

    // Search filter
    let filtered = combined;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((p) => p.keyword.toLowerCase().includes(q));
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((p) => p.status === statusFilter);
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortField) {
        case "updatedAt":
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case "createdAt":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "nicheScore":
          return (b.nicheScore ?? 0) - (a.nicheScore ?? 0);
        case "designCount":
          return b.designCount - a.designCount;
        default:
          return 0;
      }
    });

    return filtered;
  }, [projects, dbProjects, search, statusFilter, sortField]);

  // Stats
  const stats = useMemo(() => {
    const all = [...projects];
    for (const dbP of dbProjects) {
      if (!all.find((p) => p.id === dbP.id)) all.push(dbP);
    }
    return {
      total: all.length,
      draft: all.filter((p) => p.status === "draft").length,
      inProgress: all.filter((p) => p.status === "in-progress").length,
      completed: all.filter((p) => p.status === "completed").length,
    };
  }, [projects, dbProjects]);

  const handleDelete = (id: string) => {
    deleteProject(id);
    fetch(`/api/studio/projects?id=${id}`, { method: "DELETE" }).catch(() => {});
    setConfirmDeleteId(null);
  };

  const filterPills: { id: FilterStatus; label: string; count: number }[] = [
    { id: "all", label: "All", count: stats.total },
    { id: "draft", label: "Draft", count: stats.draft },
    { id: "in-progress", label: "In Progress", count: stats.inProgress },
    { id: "completed", label: "Completed", count: stats.completed },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[var(--bg-primary)]">
      {/* Header */}
      <header className="border-b border-white/[0.06] bg-[var(--bg-surface)] px-6 py-5">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div>
            <h1 className="text-xl font-bold text-white">Project Library</h1>
            <p className="text-sm text-white/40 mt-0.5">
              {stats.draft > 0 && <span>{stats.draft} draft{stats.draft !== 1 ? "s" : ""}</span>}
              {stats.draft > 0 && stats.inProgress > 0 && <span> · </span>}
              {stats.inProgress > 0 && <span>{stats.inProgress} in progress</span>}
              {(stats.draft > 0 || stats.inProgress > 0) && stats.completed > 0 && <span> · </span>}
              {stats.completed > 0 && <span>{stats.completed} completed</span>}
              {stats.total === 0 && <span>No projects yet</span>}
            </p>
          </div>
          <Link
            href="/product-studio"
            onClick={() => newProject()}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Project
          </Link>
        </div>
      </header>

      {/* Toolbar: Search + Filters + Sort */}
      {stats.total > 0 && (
        <div className="border-b border-white/[0.04] bg-[var(--bg-surface)]/50 px-6 py-3">
          <div className="max-w-6xl mx-auto flex items-center gap-4">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects..."
                className="w-full pl-9 pr-4 py-2 bg-white/[0.04] border border-white/[0.06] rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 focus:border-indigo-500/40"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5">
              {filterPills.map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setStatusFilter(pill.id)}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                    statusFilter === pill.id
                      ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30"
                      : "text-white/40 hover:text-white/60 border border-transparent hover:bg-white/[0.04]"
                  }`}
                >
                  {pill.label}
                  {pill.count > 0 && (
                    <span className={`ml-1.5 ${statusFilter === pill.id ? "text-indigo-400/60" : "text-white/20"}`}>
                      {pill.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Sort */}
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              className="ml-auto text-xs bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-white/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 appearance-none cursor-pointer"
            >
              <option value="updatedAt">Last Updated</option>
              <option value="createdAt">Date Created</option>
              <option value="nicheScore">Niche Score</option>
              <option value="designCount">Design Count</option>
            </select>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Empty State */}
          {stats.total === 0 && (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center">
                <svg className="w-8 h-8 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <p className="text-sm text-white/40">No saved projects yet</p>
              <Link href="/product-studio" className="text-sm text-indigo-400 hover:text-indigo-300">
                Create your first project &rarr;
              </Link>
            </div>
          )}

          {/* No results for filter/search */}
          {stats.total > 0 && allProjects.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <svg className="w-10 h-10 text-white/15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-sm text-white/40">
                No projects match {search ? `"${search}"` : "this filter"}
              </p>
              <button
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                }}
                className="text-xs text-indigo-400 hover:text-indigo-300"
              >
                Clear filters
              </button>
            </div>
          )}

          {/* Card Grid */}
          {allProjects.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allProjects.map((proj) => (
                <div
                  key={proj.id}
                  className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden hover:border-white/[0.12] transition-all group"
                >
                  {/* Card Top: Thumbnail or Gradient */}
                  <div className="relative h-28 overflow-hidden">
                    {proj.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={proj.thumbnailUrl}
                        alt={proj.keyword}
                        className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                      />
                    ) : (
                      <div
                        className="w-full h-full"
                        style={{
                          background: `linear-gradient(135deg, ${keywordGradient(proj.keyword)})`,
                          opacity: 0.4,
                        }}
                      />
                    )}

                    {/* Niche Score Badge */}
                    {proj.nicheScore !== null && (
                      <div
                        className={`absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg backdrop-blur-md text-xs font-bold ${
                          proj.nicheScore >= 70
                            ? "bg-emerald-500/30 text-emerald-300 border border-emerald-500/30"
                            : proj.nicheScore >= 40
                              ? "bg-amber-500/30 text-amber-300 border border-amber-500/30"
                              : "bg-red-500/30 text-red-300 border border-red-500/30"
                        }`}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                        {proj.nicheScore}
                      </div>
                    )}

                    {/* Status Badge */}
                    <div className="absolute top-3 left-3">
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-md backdrop-blur-md ${
                          proj.status === "completed"
                            ? "bg-emerald-500/30 text-emerald-300"
                            : proj.status === "in-progress"
                              ? "bg-indigo-500/30 text-indigo-300"
                              : proj.status === "error"
                                ? "bg-red-500/30 text-red-300"
                                : "bg-white/20 text-white/60"
                        }`}
                      >
                        {proj.status}
                      </span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 space-y-3">
                    {/* Title + Mode */}
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-white truncate">
                        {proj.keyword || "Untitled Project"}
                      </h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40 flex-shrink-0">
                        {proj.designMode === "graphic" ? "Graphic" : "Text"}
                      </span>
                    </div>

                    {/* Step Progress */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-white/30">
                        Step: {STEP_LABELS[proj.currentStep]}
                      </span>
                    </div>

                    {/* Stats Row */}
                    <div className="flex items-center gap-3 text-[10px] text-white/30">
                      {proj.designCount > 0 && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          {proj.designCount} designs
                        </span>
                      )}
                      {proj.selectedDesignCount > 0 && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          {proj.selectedDesignCount} selected
                        </span>
                      )}
                      {proj.etsyListingCount > 0 && (
                        <span className="flex items-center gap-1 text-emerald-400/60">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                          </svg>
                          {proj.etsyListingCount} on Etsy
                        </span>
                      )}
                    </div>

                    {/* Footer: Date + Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
                      <span className="text-[10px] text-white/20">
                        {formatDate(proj.updatedAt)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Link
                          href="/product-studio"
                          onClick={() => loadProject(proj.id)}
                          className="px-3 py-1.5 text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-lg transition-colors"
                        >
                          Open
                        </Link>
                        <Link
                          href="/product-studio"
                          onClick={() => duplicateProject(proj.id)}
                          className="px-2.5 py-1.5 text-xs text-white/30 hover:text-white/60 bg-white/[0.03] hover:bg-white/[0.06] rounded-lg transition-colors"
                          title="Duplicate"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </Link>
                        {confirmDeleteId === proj.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(proj.id)}
                              className="px-2 py-1 text-[10px] text-red-400 bg-red-500/15 rounded transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 text-[10px] text-white/40 rounded transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(proj.id)}
                            className="px-2.5 py-1.5 text-xs text-red-400/40 hover:text-red-400 bg-red-500/5 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ── Helpers ──

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function keywordGradient(keyword: string): string {
  // Generate a stable gradient from the keyword string
  let hash = 0;
  for (let i = 0; i < keyword.length; i++) {
    hash = keyword.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 40) % 360;
  return `hsl(${h1}, 50%, 25%), hsl(${h2}, 60%, 15%)`;
}
