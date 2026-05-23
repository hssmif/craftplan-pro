"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useDigitalStudioStore } from "@/stores/digitalStudioStore";
import { computeDigitalProductScore } from "@/lib/digital-quality-score";

// ── Step 5: Listing Package ──
// Generate and edit Etsy listing via /api/digital/listing.
// Shows quality score summary and suggested pricing.

export function ListingPanel() {
  const project = useDigitalStudioStore((s) => s.project);
  const setListing = useDigitalStudioStore((s) => s.setListing);
  const updateListing = useDigitalStudioStore((s) => s.updateListing);
  const setStepStatus = useDigitalStudioStore((s) => s.setStepStatus);
  const saveProject = useDigitalStudioStore((s) => s.saveProject);
  const setQualityScore = useDigitalStudioStore((s) => s.setQualityScore);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [newTag, setNewTag] = useState("");

  const listing = project.listing;
  const config = project.config;
  const hasListing = listing.status === "done" || listing.status === "edited";

  // Compute quality score
  const qualityScore = useMemo(() => computeDigitalProductScore(project), [project]);

  // Sync to store
  useEffect(() => {
    if (qualityScore && (!project.qualityScore || project.qualityScore.overall !== qualityScore.overall)) {
      setQualityScore(qualityScore);
    }
  }, [qualityScore, project.qualityScore, setQualityScore]);

  const handleGenerate = useCallback(async () => {
    if (!config) return;

    setIsGenerating(true);
    setError("");
    setStepStatus("listing", "running");

    try {
      const resp = await fetch("/api/digital/listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productType: project.productType,
          config,
          projectName: project.projectName,
          niche: project.inspiration.niche,
          targetAudience: project.inspiration.targetAudience,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Generation failed" }));
        throw new Error(err.error || "Listing generation failed");
      }

      const data = await resp.json();
      setListing(data.listing);
      setStepStatus("listing", "done");

      try { await saveProject(); } catch { /* non-critical */ }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate listing";
      setError(message);
      setStepStatus("listing", "error");
    } finally {
      setIsGenerating(false);
    }
  }, [config, project.productType, project.projectName, project.inspiration, setListing, setStepStatus, saveProject]);

  const addTag = () => {
    const tag = newTag.trim().toLowerCase().substring(0, 20);
    if (tag && listing.tags.length < 13 && !listing.tags.includes(tag)) {
      updateListing({ tags: [...listing.tags, tag] });
      setNewTag("");
    }
  };

  const removeTag = (index: number) => {
    updateListing({ tags: listing.tags.filter((_, i) => i !== index) });
  };

  const handleExportZip = useCallback(async () => {
    setIsExporting(true);
    setError("");

    try {
      // Save project first so edited listing data is persisted to DB
      try { await saveProject(); } catch { /* non-critical but export may have stale data */ }

      const resp = await fetch("/api/digital/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Export failed" }));
        throw new Error(err.error || "Export failed");
      }

      // Trigger browser download
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = resp.headers.get("Content-Disposition");
      const fileNameMatch = disposition?.match(/filename="(.+?)"/);
      a.download = fileNameMatch?.[1] || `${project.projectName}-listing-package.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed";
      setError(message);
    } finally {
      setIsExporting(false);
    }
  }, [project.id, project.projectName, saveProject]);

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Listing Package</h2>
          <p className="text-sm text-white/50 mt-1">
            AI-generated Etsy listing with title, tags, description, and pricing.
          </p>
        </div>

        {/* Status badge */}
        {hasListing && (
          <span className={`
            px-3 py-1 text-xs font-medium rounded-full
            ${listing.status === "edited"
              ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
              : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
            }
          `}>
            {listing.status === "edited" ? "Edited" : "Generated"}
          </span>
        )}
      </div>

      {/* Quality Score Summary */}
      {qualityScore && (
        <div className="flex items-center gap-4 p-4 bg-white/[0.03] border border-white/[0.08] rounded-xl">
          {/* Score + Tier */}
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12">
              <svg className="w-12 h-12 -rotate-90" viewBox="0 0 60 60">
                <circle cx="30" cy="30" r="24" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
                <circle
                  cx="30" cy="30" r="24"
                  fill="none"
                  stroke={qualityScore.overall >= 85 ? "#a78bfa" : qualityScore.overall >= 65 ? "#fbbf24" : qualityScore.overall >= 40 ? "#60a5fa" : "#94a3b8"}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${(qualityScore.overall / 100) * 150.8} 150.8`}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">
                {qualityScore.overall}
              </span>
            </div>
            <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${
              qualityScore.tier === "ULTRA" ? "bg-violet-500/20 text-violet-300 border-violet-500/30" :
              qualityScore.tier === "PREMIUM" ? "bg-amber-500/20 text-amber-300 border-amber-500/30" :
              qualityScore.tier === "STANDARD" ? "bg-blue-500/20 text-blue-300 border-blue-500/30" :
              "bg-white/10 text-white/50 border-white/10"
            }`}>
              {qualityScore.tier}
            </span>
          </div>

          {/* Suggested Price */}
          <div className="flex-1 border-l border-white/[0.08] pl-4">
            <p className="text-xs text-white/40">Suggested Etsy Price</p>
            <p className="text-sm font-medium text-white">
              ${qualityScore.etsyPriceEstimate.min} &ndash; ${qualityScore.etsyPriceEstimate.max}
            </p>
          </div>
        </div>
      )}

      {/* Generate / Regenerate Button */}
      {!hasListing && (
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !config}
          className={`
            w-full py-4 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-3
            ${isGenerating
              ? "bg-indigo-500/20 text-indigo-300 cursor-wait"
              : !config
                ? "bg-white/10 text-white/30 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-500 text-white"
            }
          `}
        >
          {isGenerating ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Generating listing...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              Generate Etsy Listing
            </>
          )}
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Listing Editor */}
      {hasListing && (
        <div className="space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Title</label>
              <span className={`text-xs ${listing.title.length > 130 ? "text-red-400" : "text-white/30"}`}>
                {listing.title.length}/140
              </span>
            </div>
            <input
              type="text"
              value={listing.title}
              onChange={(e) => updateListing({ title: e.target.value.substring(0, 140) })}
              className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Description</label>
            <textarea
              value={listing.description}
              onChange={(e) => updateListing({ description: e.target.value })}
              rows={8}
              className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-colors resize-y"
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Tags</label>
              <span className="text-xs text-white/30">{listing.tags.length}/13</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {listing.tags.map((tag, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-3 py-1.5 bg-white/[0.06] border border-white/[0.1] rounded-lg text-xs text-white/70">
                  {tag}
                  <button
                    onClick={() => removeTag(i)}
                    className="text-white/30 hover:text-red-400 transition-colors ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
              {listing.tags.length < 13 && (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addTag()}
                    placeholder="Add tag..."
                    maxLength={20}
                    className="w-28 px-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 transition-colors"
                  />
                  <button
                    onClick={addTag}
                    className="px-2 py-1.5 text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 rounded-lg border border-indigo-500/20 transition-colors"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Price */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Price</label>
              {qualityScore && (
                <span className="text-[10px] text-white/30">
                  Suggested: ${qualityScore.etsyPriceEstimate.min} – ${qualityScore.etsyPriceEstimate.max}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <span className="text-[10px] text-white/40">Min</span>
                <input
                  type="number"
                  value={listing.price.min}
                  onChange={(e) => updateListing({ price: { ...listing.price, min: Number(e.target.value) || 0 } })}
                  className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-white/40">Recommended</span>
                <input
                  type="number"
                  value={listing.price.recommended}
                  onChange={(e) => updateListing({ price: { ...listing.price, recommended: Number(e.target.value) || 0 } })}
                  className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-white/40">Max</span>
                <input
                  type="number"
                  value={listing.price.max}
                  onChange={(e) => updateListing({ price: { ...listing.price, max: Number(e.target.value) || 0 } })}
                  className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* FAQs */}
          {listing.faqs.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">FAQs</label>
              <div className="space-y-3">
                {listing.faqs.map((faq, i) => (
                  <div key={i} className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-lg space-y-1">
                    <p className="text-xs font-medium text-white/70">{faq.question}</p>
                    <p className="text-xs text-white/40">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-4 py-2 text-xs text-white/50 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-lg border border-white/[0.08] transition-colors"
            >
              Regenerate Listing
            </button>

            <button
              onClick={handleExportZip}
              disabled={isExporting}
              className={`
                flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border transition-colors
                ${isExporting
                  ? "bg-emerald-500/10 text-emerald-400/60 border-emerald-500/20 cursor-wait"
                  : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20"
                }
              `}
            >
              {isExporting ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Exporting...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export Listing Package (ZIP)
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
