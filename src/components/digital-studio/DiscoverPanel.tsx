"use client";

import { useDigitalStudioStore } from "@/stores/digitalStudioStore";
import { useEffect } from "react";

// ── Step 1: Discover ──
// Capture keyword, niche, target audience, and inspiration source.

export function DiscoverPanel() {
  const project = useDigitalStudioStore((s) => s.project);
  const setInspiration = useDigitalStudioStore((s) => s.setInspiration);
  const setProjectName = useDigitalStudioStore((s) => s.setProjectName);
  const setStepStatus = useDigitalStudioStore((s) => s.setStepStatus);

  const { inspiration } = project;

  // Auto-mark step done when keyword has content
  useEffect(() => {
    const hasContent = !!(inspiration.keyword?.trim() || inspiration.niche?.trim());
    if (hasContent && project.stepStatuses.discover !== "done") {
      setStepStatus("discover", "done");
    } else if (!hasContent && project.stepStatuses.discover === "done") {
      setStepStatus("discover", "idle");
    }
  }, [inspiration.keyword, inspiration.niche, project.stepStatuses.discover, setStepStatus]);

  const updateInspiration = (updates: Partial<typeof inspiration>) => {
    setInspiration({ ...inspiration, ...updates });
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">Discover Your Product</h2>
        <p className="text-sm text-white/50 mt-1">
          Start with a keyword, niche, or idea. This shapes everything that follows.
        </p>
      </div>

      {/* Project Name */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider">
          Project Name
        </label>
        <input
          type="text"
          value={project.projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="My Awesome Planner"
          className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
        />
      </div>

      {/* Source Selection */}
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider">
          Inspiration Source
        </label>
        <div className="grid grid-cols-3 gap-3">
          {(["keyword", "opportunity", "manual"] as const).map((source) => (
            <button
              key={source}
              onClick={() => updateInspiration({ source })}
              className={`
                px-4 py-3 rounded-xl border text-sm font-medium transition-all
                ${inspiration.source === source
                  ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                  : "bg-white/[0.04] border-white/[0.08] text-white/50 hover:text-white hover:border-white/20"
                }
              `}
            >
              {source === "keyword" && "Keyword Search"}
              {source === "opportunity" && "Opportunity"}
              {source === "manual" && "Manual Entry"}
            </button>
          ))}
        </div>
      </div>

      {/* Keyword / Niche Input */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider">
          Keyword / Niche
        </label>
        <input
          type="text"
          value={inspiration.keyword || ""}
          onChange={(e) => updateInspiration({ keyword: e.target.value })}
          placeholder="e.g., minimalist weekly planner, budget tracker, self-care journal"
          className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
        />
        <p className="text-xs text-white/30">
          This keyword shapes your product name, SEO tags, and listing copy.
        </p>
      </div>

      {/* Niche */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider">
          Niche <span className="text-white/30 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={inspiration.niche || ""}
          onChange={(e) => updateInspiration({ niche: e.target.value })}
          placeholder="e.g., productivity, wellness, small business, students"
          className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
        />
      </div>

      {/* Target Audience */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider">
          Target Audience <span className="text-white/30 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={inspiration.targetAudience || ""}
          onChange={(e) => updateInspiration({ targetAudience: e.target.value })}
          placeholder="e.g., busy moms, college students, freelancers, small business owners"
          className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
        />
      </div>

      {/* Status indicator */}
      {(inspiration.keyword?.trim() || inspiration.niche?.trim()) && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm text-emerald-300">
            Ready to configure — click <strong>Next Step</strong> to continue
          </span>
        </div>
      )}
    </div>
  );
}
