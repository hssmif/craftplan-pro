"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useStudioStore } from "@/stores/studioStore";
import type { ListingMetadata } from "@/types/product-studio";

// ── Component ──

export function ListingPanel() {
  const project = useStudioStore((s) => s.project);
  const setListings = useStudioStore((s) => s.setListings);
  const updateListing = useStudioStore((s) => s.updateListing);
  const setStepStatus = useStudioStore((s) => s.setStepStatus);

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const abortRef = useRef(false);

  const selectedDesigns = project.designs.filter((d) => d.selected);
  const enabledProducts = project.productConfigs.filter((p) => p.enabled);
  const maxRetailPrice =
    enabledProducts.length > 0
      ? Math.max(...enabledProducts.map((p) => p.retailPrice))
      : 24.99;
  const primaryTaxonomy =
    enabledProducts.length > 0 ? enabledProducts[0].taxonomyId : 482;

  // Mark step done when listings exist
  useEffect(() => {
    if (project.listings.length > 0) {
      setStepStatus("listings", "done");
    } else {
      setStepStatus("listings", "idle");
    }
  }, [project.listings.length, setStepStatus]);

  // ── Generate metadata for all selected designs (with batch support) ──
  const generateMetadata = useCallback(async () => {
    if (selectedDesigns.length === 0) return;
    setGenerating(true);
    abortRef.current = false;
    setStepStatus("listings", "running");
    setProgress("Preparing design phrases...");

    const keyword = project.inspiration.keyword;

    try {
      // Build phrases array for the API
      const allPhrases = selectedDesigns.map((d) => ({
        text: d.phrase || d.graphicDescription || d.aiPrompt || "Custom Design",
      }));

      // Process in batches of 15 to avoid API limits
      const BATCH_SIZE = 15;
      const allListings: ListingMetadata[] = [];
      const totalBatches = Math.ceil(allPhrases.length / BATCH_SIZE);

      for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
        if (abortRef.current) return;

        const batchStart = batchIdx * BATCH_SIZE;
        const batchEnd = Math.min(batchStart + BATCH_SIZE, allPhrases.length);
        const batchPhrases = allPhrases.slice(batchStart, batchEnd);
        const batchDesigns = selectedDesigns.slice(batchStart, batchEnd);

        setProgress(
          totalBatches > 1
            ? `Generating SEO metadata batch ${batchIdx + 1}/${totalBatches} (${batchStart + 1}-${batchEnd} of ${allPhrases.length})...`
            : `Generating SEO metadata for ${allPhrases.length} designs...`
        );

        try {
          const resp = await fetch("/api/design-sensei/generate-metadata", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              keyword,
              phrases: batchPhrases,
            }),
          });

          if (abortRef.current) return;

          if (!resp.ok) throw new Error(`Metadata generation failed for batch ${batchIdx + 1}`);

          const data = await resp.json();
          const metadataList: Array<{ title: string; tags: string[]; description: string }> =
            data.metadata || [];

          // Map API response to ListingMetadata type
          for (let i = 0; i < batchDesigns.length; i++) {
            const design = batchDesigns[i];
            const meta = metadataList[i] || generateFallback(keyword, design.phrase || "");
            allListings.push({
              designId: design.id,
              title: (meta.title || "").slice(0, 140),
              description: meta.description || "",
              tags: (meta.tags || []).slice(0, 13).map((t: string) => t.slice(0, 20)),
              price: maxRetailPrice,
              taxonomyId: primaryTaxonomy,
              edited: false,
            });
          }
        } catch (batchErr) {
          // Fallback for this batch: generate metadata client-side
          for (const design of batchDesigns) {
            allListings.push({
              designId: design.id,
              ...generateFallback(keyword, design.phrase || design.graphicDescription || "Custom Design"),
              price: maxRetailPrice,
              taxonomyId: primaryTaxonomy,
              edited: false,
            });
          }
          console.warn(`[ListingPanel] Batch ${batchIdx + 1} failed, using fallback:`, batchErr);
        }

        // Brief pause between batches to avoid rate limiting
        if (batchIdx < totalBatches - 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      setListings(allListings);
      setStepStatus("listings", "done");
      setProgress(allListings.length > 15 ? `${allListings.length} listings generated in ${totalBatches} batches` : "");
    } catch (err) {
      // Full fallback: generate metadata client-side for all
      const fallbackListings: ListingMetadata[] = selectedDesigns.map((design) => ({
        designId: design.id,
        ...generateFallback(keyword, design.phrase || design.graphicDescription || "Custom Design"),
        price: maxRetailPrice,
        taxonomyId: primaryTaxonomy,
        edited: false,
      }));
      setListings(fallbackListings);
      setStepStatus("listings", "done");
      setProgress(`Used fallback metadata: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setGenerating(false);
    }
  }, [selectedDesigns, project.inspiration.keyword, maxRetailPrice, primaryTaxonomy, setListings, setStepStatus]);

  // ── Regenerate a single listing ──
  const regenerateSingle = useCallback(
    async (designId: string) => {
      const design = selectedDesigns.find((d) => d.id === designId);
      if (!design) return;

      try {
        const resp = await fetch("/api/design-sensei/generate-metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keyword: project.inspiration.keyword,
            phrases: [{ text: design.phrase || design.graphicDescription || "Custom Design" }],
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          const meta = data.metadata?.[0];
          if (meta) {
            updateListing(designId, {
              title: (meta.title || "").slice(0, 140),
              description: meta.description || "",
              tags: (meta.tags || []).slice(0, 13).map((t: string) => t.slice(0, 20)),
              edited: false,
            });
          }
        }
      } catch {
        // Silently fail — user can edit manually
      }
    },
    [selectedDesigns, project.inspiration.keyword, updateListing]
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Listing Metadata</h2>
          <p className="text-sm text-white/40 mt-1">
            SEO-optimized titles, tags &amp; descriptions for {selectedDesigns.length} designs
          </p>
        </div>
        <div className="flex items-center gap-3">
          {project.listings.length > 0 && (
            <span className="text-xs text-emerald-400/80 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
              {project.listings.length} listings ready
            </span>
          )}
          <button
            onClick={generateMetadata}
            disabled={generating || selectedDesigns.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/10 disabled:text-white/30 rounded-xl transition-colors"
          >
            {generating ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating...
              </>
            ) : project.listings.length > 0 ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Regenerate All
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Generate Metadata
              </>
            )}
          </button>
        </div>
      </div>

      {/* Progress */}
      {progress && (
        <div className="flex items-center gap-2 text-sm text-white/50 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
          {generating && (
            <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {progress}
        </div>
      )}

      {/* No listings yet */}
      {project.listings.length === 0 && !generating && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4 bg-white/[0.02] border border-dashed border-white/[0.08] rounded-2xl">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <svg className="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white/60">No listing metadata yet</p>
            <p className="text-xs text-white/30 mt-1 max-w-sm">
              Click &ldquo;Generate Metadata&rdquo; to create SEO-optimized titles, descriptions, and 13 tags for each design using AI.
            </p>
          </div>
        </div>
      )}

      {/* Listing Cards */}
      {project.listings.length > 0 && (
        <div className="space-y-3">
          {project.listings.map((listing, idx) => {
            const design = selectedDesigns.find((d) => d.id === listing.designId);
            const isExpanded = expandedId === listing.designId;
            return (
              <ListingCard
                key={listing.designId}
                listing={listing}
                index={idx}
                designPhrase={design?.phrase || design?.graphicDescription || "Design"}
                designMode={design?.mode || "text"}
                designThumbnail={design?.thumbnailUrl || design?.dataUrl}
                isExpanded={isExpanded}
                onToggleExpand={() =>
                  setExpandedId(isExpanded ? null : listing.designId)
                }
                onUpdate={(updates) => updateListing(listing.designId, updates)}
                onRegenerate={() => regenerateSingle(listing.designId)}
              />
            );
          })}
        </div>
      )}

      {/* Summary */}
      {project.listings.length > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">
                {project.listings.length} listings &times; {enabledProducts.length} products = {project.listings.length * enabledProducts.length} total items
              </p>
              <p className="text-xs text-white/40 mt-1">
                Ready for Printful creation and Etsy publishing
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div>
                <span className="text-white/40">Avg title:</span>{" "}
                <span className="text-white/60">
                  {Math.round(project.listings.reduce((s, l) => s + l.title.length, 0) / project.listings.length)} chars
                </span>
              </div>
              <div>
                <span className="text-white/40">Edited:</span>{" "}
                <span className="text-indigo-400">
                  {project.listings.filter((l) => l.edited).length}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Listing Card Component ──

function ListingCard({
  listing,
  index,
  designPhrase,
  designMode,
  designThumbnail,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onRegenerate,
}: {
  listing: ListingMetadata;
  index: number;
  designPhrase: string;
  designMode: string;
  designThumbnail?: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (updates: Partial<ListingMetadata>) => void;
  onRegenerate: () => void;
}) {
  const [editingField, setEditingField] = useState<"title" | "description" | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editingTagIdx, setEditingTagIdx] = useState<number | null>(null);
  const [tagValue, setTagValue] = useState("");

  // Start editing
  const startEdit = (field: "title" | "description") => {
    setEditingField(field);
    setEditValue(listing[field]);
  };

  // Save edit
  const saveEdit = () => {
    if (editingField) {
      onUpdate({ [editingField]: editValue, edited: true });
      setEditingField(null);
    }
  };

  // Tag editing
  const startEditTag = (idx: number) => {
    setEditingTagIdx(idx);
    setTagValue(listing.tags[idx] || "");
  };

  const saveTag = () => {
    if (editingTagIdx !== null) {
      const newTags = [...listing.tags];
      const trimmed = tagValue.trim().slice(0, 20);
      if (trimmed) {
        newTags[editingTagIdx] = trimmed;
      } else {
        newTags.splice(editingTagIdx, 1);
      }
      onUpdate({ tags: newTags, edited: true });
      setEditingTagIdx(null);
    }
  };

  const addTag = () => {
    if (listing.tags.length < 13) {
      const newTags = [...listing.tags, "new tag"];
      onUpdate({ tags: newTags, edited: true });
      setEditingTagIdx(newTags.length - 1);
      setTagValue("new tag");
    }
  };

  return (
    <div
      className={`
        rounded-xl border transition-all
        ${isExpanded
          ? "bg-white/[0.04] border-indigo-500/20"
          : "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.1]"
        }
      `}
    >
      {/* Collapsed row */}
      <div
        className="flex items-center gap-4 px-4 py-3 cursor-pointer"
        onClick={onToggleExpand}
      >
        {/* Thumbnail */}
        <div className="w-10 h-10 rounded-lg bg-white/[0.06] border border-white/[0.08] flex-shrink-0 overflow-hidden">
          {designThumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={designThumbnail}
              alt=""
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">
              {index + 1}
            </div>
          )}
        </div>

        {/* Title preview */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{listing.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              designMode === "text"
                ? "bg-blue-500/15 text-blue-400"
                : "bg-purple-500/15 text-purple-400"
            }`}>
              {designMode === "text" ? "TEXT" : "AI"}
            </span>
            <span className="text-[10px] text-white/30 truncate">
              {designPhrase}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[10px] text-white/30">
            {listing.tags.length} tags
          </span>
          <span className="text-[10px] text-white/30">
            {listing.title.length}/140
          </span>
          {listing.edited && (
            <span className="text-[10px] text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
              edited
            </span>
          )}
          <svg
            className={`w-4 h-4 text-white/30 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-white/[0.06]">
          {/* Title */}
          <div className="pt-4 space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-white/40 uppercase tracking-wider font-medium">
                Title ({listing.title.length}/140)
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={onRegenerate}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Regenerate
                </button>
              </div>
            </div>
            {editingField === "title" ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value.slice(0, 140))}
                  onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                  className="w-full bg-black/30 border border-indigo-500/30 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveEdit}
                    className="text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingField(null)}
                    className="text-xs text-white/40 hover:text-white/60"
                  >
                    Cancel
                  </button>
                  <span className="text-[10px] text-white/20 ml-auto">
                    {editValue.length}/140
                  </span>
                </div>
              </div>
            ) : (
              <p
                onClick={() => startEdit("title")}
                className="text-sm text-white/80 bg-white/[0.03] rounded-lg px-3 py-2 cursor-text hover:bg-white/[0.05] transition-colors border border-transparent hover:border-white/[0.08]"
              >
                {listing.title}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-[10px] text-white/40 uppercase tracking-wider font-medium">
              Description
            </label>
            {editingField === "description" ? (
              <div className="space-y-2">
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  rows={3}
                  className="w-full bg-black/30 border border-indigo-500/30 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50 resize-none"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveEdit}
                    className="text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingField(null)}
                    className="text-xs text-white/40 hover:text-white/60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p
                onClick={() => startEdit("description")}
                className="text-sm text-white/60 bg-white/[0.03] rounded-lg px-3 py-2 cursor-text hover:bg-white/[0.05] transition-colors border border-transparent hover:border-white/[0.08]"
              >
                {listing.description || "Click to add description..."}
              </p>
            )}
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <label className="text-[10px] text-white/40 uppercase tracking-wider font-medium">
              Tags ({listing.tags.length}/13)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {listing.tags.map((tag, i) => (
                <span key={i}>
                  {editingTagIdx === i ? (
                    <input
                      type="text"
                      value={tagValue}
                      onChange={(e) => setTagValue(e.target.value.slice(0, 20))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveTag();
                        if (e.key === "Escape") setEditingTagIdx(null);
                      }}
                      onBlur={saveTag}
                      className="bg-black/40 border border-indigo-500/40 rounded-md px-2 py-0.5 text-xs text-white w-28 focus:outline-none"
                      autoFocus
                    />
                  ) : (
                    <button
                      onClick={() => startEditTag(i)}
                      className="bg-white/[0.06] border border-white/[0.08] rounded-md px-2 py-0.5 text-xs text-white/60 hover:text-white hover:border-white/[0.15] transition-colors"
                    >
                      {tag}
                    </button>
                  )}
                </span>
              ))}
              {listing.tags.length < 13 && (
                <button
                  onClick={addTag}
                  className="border border-dashed border-white/[0.12] rounded-md px-2 py-0.5 text-xs text-white/30 hover:text-white/50 hover:border-white/[0.2] transition-colors"
                >
                  + Add
                </button>
              )}
            </div>
          </div>

          {/* Price + Taxonomy */}
          <div className="flex items-center gap-6 pt-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Price</span>
              <span className="text-sm font-semibold text-emerald-400">
                ${listing.price.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Taxonomy</span>
              <span className="text-xs text-white/50">{listing.taxonomyId}</span>
            </div>
          </div>

          {/* Etsy Preview Card */}
          <div className="mt-3 p-3 bg-white rounded-xl">
            <div className="flex gap-3">
              {/* Preview image */}
              <div className="w-16 h-16 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden">
                {designThumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={designThumbnail}
                    alt=""
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                    IMG
                  </div>
                )}
              </div>
              {/* Etsy-style listing */}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-800 font-medium line-clamp-2 leading-tight">
                  {listing.title}
                </p>
                <p className="text-sm font-bold text-gray-900 mt-1">
                  ${listing.price.toFixed(2)}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Free shipping
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Fallback metadata generator ──

function generateFallback(keyword: string, phrase: string): {
  title: string;
  description: string;
  tags: string[];
} {
  const kw = keyword.toLowerCase();
  const words = kw.split(/\s+/);
  return {
    title: `${phrase} - ${keyword} Shirt - Funny ${keyword} Gift Idea`.slice(0, 140),
    description: `${phrase} - perfect for ${kw} lovers. Great gift idea for any occasion.`,
    tags: [
      `${kw} shirt`,
      `${kw} gift`,
      `funny ${kw}`,
      `${kw} tee`,
      `${kw} lover`,
      `${kw} mom`,
      `${kw} dad`,
      `gift for ${kw}`,
      `${words[0]} tshirt`,
      `${kw} mug`,
      `${kw} design`,
      `pod design`,
      `trendy ${kw}`,
    ]
      .map((t) => t.slice(0, 20))
      .slice(0, 13),
  };
}
