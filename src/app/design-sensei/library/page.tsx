"use client";

import { useDesignSenseiStore } from "@/stores/designSenseiStore";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface DbRun {
  id: number;
  keyword: string;
  niche_score: number;
  products_count: number;
  total_duration_ms: number;
  status: string;
  created_at: string;
}

export default function DesignSenseiLibrary() {
  const store = useDesignSenseiStore();
  const router = useRouter();
  const [dbRuns, setDbRuns] = useState<DbRun[]>([]);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/api/design-sensei/queue-publish")
      .then((r) => r.json())
      .then((d) => setDbRuns(d.runs || []))
      .catch(() => {});
  }, []);

  const localProjects = store.projects;
  const filteredProjects = filter === "all"
    ? localProjects
    : localProjects.filter((p) => p.status === filter);

  function handleOpen(id: string) {
    store.loadProject(id);
    router.push("/design-sensei");
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Design Library</h1>
            <p className="text-sm text-[var(--text-muted)]">Past Design Sensei runs and saved projects</p>
          </div>
          <button
            onClick={() => { store.reset(); router.push("/design-sensei"); }}
            className="px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-xl text-sm font-bold hover:from-violet-700 hover:to-fuchsia-700 transition-all"
          >
            + New Run
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {["all", "draft", "completed", "running", "error"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                filter === f
                  ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                  : "bg-white/[0.04] text-[var(--text-muted)] border border-white/[0.06] hover:bg-white/[0.08]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Local Projects Table */}
        {filteredProjects.length > 0 ? (
          <div className="bg-[var(--bg-elevated)] border border-white/[0.06] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium text-xs">Niche</th>
                  <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium text-xs">Products</th>
                  <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium text-xs">Date</th>
                  <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium text-xs">Status</th>
                  <th className="text-right px-4 py-3 text-[var(--text-muted)] font-medium text-xs">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project) => (
                  <tr key={project.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-white font-medium">{project.keyword}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{project.publishQueue.length}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)] text-xs">
                      {new Date(project.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        project.status === "completed" ? "bg-emerald-500/20 text-emerald-400" :
                        project.status === "error" ? "bg-red-500/20 text-red-400" :
                        project.status === "running" ? "bg-amber-500/20 text-amber-400" :
                        "bg-white/[0.06] text-[var(--text-muted)]"
                      }`}>
                        {project.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleOpen(project.id)}
                        className="text-xs text-violet-400 hover:text-violet-300 font-medium"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16 text-[var(--text-muted)]">
            <p className="text-lg">No projects found</p>
            <p className="text-sm mt-1">Run Design Sensei to create your first project</p>
          </div>
        )}

        {/* DB Runs (server-side) */}
        {dbRuns.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">Server Queue</h2>
            <div className="bg-[var(--bg-elevated)] border border-white/[0.06] rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium text-xs">Keyword</th>
                    <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium text-xs">Score</th>
                    <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium text-xs">Products</th>
                    <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium text-xs">Duration</th>
                    <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium text-xs">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dbRuns.map((run) => (
                    <tr key={run.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-white">{run.keyword}</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{run.niche_score}/100</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{run.products_count}</td>
                      <td className="px-4 py-3 text-[var(--text-muted)] text-xs">{(run.total_duration_ms / 1000).toFixed(1)}s</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          run.status === "published" ? "bg-emerald-500/20 text-emerald-400" :
                          run.status === "queued" ? "bg-amber-500/20 text-amber-400" :
                          "bg-white/[0.06] text-[var(--text-muted)]"
                        }`}>
                          {run.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
