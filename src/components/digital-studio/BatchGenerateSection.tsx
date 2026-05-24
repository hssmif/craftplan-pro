"use client";

import { useState, useCallback, useMemo } from "react";
import { useDigitalStudioStore } from "@/stores/digitalStudioStore";
import type {
  DigitalProductConfig,
  BatchMetadata,
} from "@/types/digital-product";

// ── Color / Aesthetic Variant Options ────────────────────────

const COLOR_SCHEMES = [
  { value: "sage-green", label: "Sage Green" },
  { value: "dusty-rose", label: "Dusty Rose" },
  { value: "navy-gold", label: "Navy & Gold" },
  { value: "minimal-black", label: "Minimal Black" },
  { value: "ocean", label: "Ocean Blue" },
  { value: "lavender", label: "Lavender" },
  { value: "terracotta", label: "Terracotta" },
];

const NOTION_AESTHETICS = [
  { value: "minimal", label: "Minimal" },
  { value: "brown", label: "Brown / Warm" },
  { value: "pink", label: "Pink / Soft" },
  { value: "dark", label: "Dark Mode" },
  { value: "colorful", label: "Colorful" },
];

// ── Variant Status ───────────────────────────────────────────

interface VariantStatus {
  label: string;
  value: string;
  status: "pending" | "generating" | "done" | "error";
  error?: string;
  projectId?: string;
}

// ── Upload helper (same as GeneratePanel) ────────────────────

async function uploadAsset(
  blob: Blob,
  projectId: string,
  fileName: string
): Promise<{ id: string; fileName: string; fileSizeBytes: number; mimeType: string; downloadUrl: string }> {
  const formData = new FormData();
  formData.append("file", blob, fileName);
  formData.append("projectId", projectId);
  formData.append("fileName", fileName);
  formData.append("assetType", "product");

  const resp = await fetch("/api/digital/assets", {
    method: "POST",
    body: formData,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(err.error || "Failed to store generated file");
  }

  const data = await resp.json();
  return data.asset;
}

// ── Component ────────────────────────────────────────────────

export function BatchGenerateSection() {
  const project = useDigitalStudioStore((s) => s.project);
  const duplicateProject = useDigitalStudioStore((s) => s.duplicateProject);

  const config = project.config;
  const productType = project.productType;

  // Determine current variant value
  const currentVariant = useMemo(() => {
    if (!config) return "";
    switch (config.type) {
      case "pdf": return config.colorTheme;
      case "excel": return config.colorScheme;
      case "printable": return config.colorScheme;
      case "notion": return config.aesthetic;
      default: return "";
    }
  }, [config]);

  // Available options based on product type
  const variantOptions = useMemo(() => {
    if (productType === "notion") return NOTION_AESTHETICS;
    return COLOR_SCHEMES;
  }, [productType]);

  const variantLabel = productType === "notion" ? "aesthetic" : "color scheme";

  // Selected variants (current always included)
  const [selectedVariants, setSelectedVariants] = useState<Set<string>>(
    () => new Set([currentVariant])
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [variants, setVariants] = useState<VariantStatus[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleVariant = useCallback((value: string) => {
    if (value === currentVariant) return; // Can't deselect current
    setSelectedVariants((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else if (next.size < 5) {
        next.add(value);
      }
      return next;
    });
  }, [currentVariant]);

  const variantsToGenerate = useMemo(
    () => Array.from(selectedVariants).filter((v) => v !== currentVariant),
    [selectedVariants, currentVariant]
  );

  const handleBatchGenerate = useCallback(async () => {
    if (!config || variantsToGenerate.length === 0) return;

    setIsGenerating(true);
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const totalVariants = variantsToGenerate.length + 1; // +1 for current

    // Initialize variant statuses
    const initialStatuses: VariantStatus[] = variantsToGenerate.map((v) => ({
      label: variantOptions.find((o) => o.value === v)?.label || v,
      value: v,
      status: "pending" as const,
    }));
    setVariants(initialStatuses);

    // Generate sequentially
    for (let i = 0; i < variantsToGenerate.length; i++) {
      const variant = variantsToGenerate[i];
      const variantName = variantOptions.find((o) => o.value === variant)?.label || variant;

      // Update status to generating
      setVariants((prev) =>
        prev.map((v) => v.value === variant ? { ...v, status: "generating" as const } : v)
      );

      try {
        // Build variant config
        let variantConfig: DigitalProductConfig;
        switch (config.type) {
          case "pdf":
            variantConfig = { ...config, colorTheme: variant };
            break;
          case "excel":
            variantConfig = { ...config, colorScheme: variant };
            break;
          case "printable":
            variantConfig = { ...config, colorScheme: variant };
            break;
          case "notion":
            variantConfig = { ...config, aesthetic: variant };
            break;
          default:
            throw new Error("Unsupported config type");
        }

        const batchMeta: BatchMetadata = {
          batchId,
          parentProjectId: project.id,
          variantLabel: variantName,
          variantIndex: i + 1,
          totalVariants,
        };

        // Duplicate project with variant config
        const clone = await duplicateProject({
          projectName: `${project.projectName} (${variantName})`,
          config: variantConfig,
          batchMeta,
        });

        // Generate the product for the cloned project
        let apiUrl: string;
        let apiBody: Record<string, unknown>;
        let fileName: string;

        switch (config.type) {
          case "pdf":
            apiUrl = "/api/pdf/generate";
            apiBody = { plannerType: config.plannerType, colorScheme: variant };
            fileName = `${config.plannerType}-planner.pdf`;
            break;
          case "excel":
            apiUrl = "/api/excel/generate";
            apiBody = { trackerType: config.trackerType, colorScheme: variant };
            fileName = `${config.trackerType}-tracker.xlsx`;
            break;
          case "printable":
            apiUrl = "/api/printable/generate";
            apiBody = { printableType: config.printableType, colorScheme: variant };
            fileName = `${config.printableType}_${variant}.pdf`;
            break;
          case "notion":
            apiUrl = "/api/notion/build";
            apiBody = {
              notionToken: config.notionToken || "",
              parentPageId: config.parentPageId || "",
              templateId: config.templateType,
              aesthetic: variant,
              premium: config.premium,
            };
            fileName = "";
            break;
          default:
            throw new Error("Unsupported type");
        }

        const genResp = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(apiBody),
        });

        if (!genResp.ok) {
          const err = await genResp.json().catch(() => ({ error: "Generation failed" }));
          throw new Error(err.error || "Variant generation failed");
        }

        // Save the generation result to the cloned project
        if (config.type === "notion") {
          const data = await genResp.json();
          clone.generation = {
            status: "done",
            result: {
              type: "notion",
              pageId: data.pageId,
              pageUrl: data.pageUrl,
              databases: data.databases || [],
              qualityTier: data.qualityScore?.tier || "STANDARD",
            },
            completedAt: new Date().toISOString(),
          };
          clone.status = "generated";
        } else {
          const blob = await genResp.blob();
          const asset = await uploadAsset(blob, clone.id, fileName);
          clone.generation = {
            status: "done",
            result: {
              type: "file",
              assetId: asset.id,
              fileName: asset.fileName,
              fileSizeBytes: asset.fileSizeBytes,
              mimeType: asset.mimeType,
              downloadUrl: asset.downloadUrl,
            },
            completedAt: new Date().toISOString(),
          };
          clone.status = "generated";
        }

        clone.stepStatuses.generate = "done";
        clone.currentStep = "preview";

        // Save updated clone
        await fetch("/api/digital/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project: clone }),
        });

        setVariants((prev) =>
          prev.map((v) =>
            v.value === variant ? { ...v, status: "done" as const, projectId: clone.id } : v
          )
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed";
        setVariants((prev) =>
          prev.map((v) =>
            v.value === variant ? { ...v, status: "error" as const, error: message } : v
          )
        );
      }
    }

    setIsGenerating(false);
  }, [config, variantsToGenerate, variantOptions, project.id, project.projectName, duplicateProject]);

  if (!config) return null;

  const doneCount = variants.filter((v) => v.status === "done").length;
  const totalCount = variants.length;

  return (
    <div className="mt-6 border border-white/[0.08] rounded-xl overflow-hidden">
      {/* Expandable Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 bg-white/[0.02] hover:bg-white/[0.04] transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <div>
            <span className="text-sm font-semibold text-white">Batch Generate Variants</span>
            <p className="text-xs text-white/40 mt-0.5">
              Generate 2–5 {variantLabel} variants from this product
            </p>
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-white/40 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="p-4 space-y-4 border-t border-white/[0.06]">
          {/* Variant Picker Grid */}
          <div>
            <p className="text-xs text-white/50 mb-2">
              Select {variantLabel}s to generate (current is pre-selected):
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {variantOptions.map((opt) => {
                const isCurrent = opt.value === currentVariant;
                const isSelected = selectedVariants.has(opt.value);
                const isAtLimit = selectedVariants.size >= 5 && !isSelected;
                return (
                  <button
                    key={opt.value}
                    onClick={() => toggleVariant(opt.value)}
                    disabled={isCurrent || isAtLimit || isGenerating}
                    className={`
                      px-3 py-2.5 text-xs font-medium rounded-lg border transition-all text-left
                      ${isCurrent
                        ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300 cursor-default"
                        : isSelected
                          ? "bg-violet-500/15 border-violet-500/30 text-violet-300"
                          : isAtLimit || isGenerating
                            ? "bg-white/[0.02] border-white/[0.06] text-white/25 cursor-not-allowed"
                            : "bg-white/[0.04] border-white/[0.08] text-white/60 hover:border-white/20 hover:text-white"
                      }
                    `}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center ${
                        isCurrent || isSelected
                          ? "border-violet-400 bg-violet-500/30"
                          : "border-white/20"
                      }`}>
                        {(isCurrent || isSelected) && (
                          <svg className="w-2 h-2 text-violet-300" fill="currentColor" viewBox="0 0 12 12">
                            <path d="M10 3L4.5 8.5 2 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      <span>{opt.label}</span>
                      {isCurrent && (
                        <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded ml-auto">
                          current
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-white/25 mt-1.5">
              {selectedVariants.size}/5 selected · {variantsToGenerate.length} variant{variantsToGenerate.length !== 1 ? "s" : ""} to generate
            </p>
          </div>

          {/* Generate Button */}
          {variantsToGenerate.length > 0 && !isGenerating && variants.length === 0 && (
            <button
              onClick={handleBatchGenerate}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Generate {variantsToGenerate.length} Variant{variantsToGenerate.length !== 1 ? "s" : ""}
            </button>
          )}

          {/* Progress */}
          {variants.length > 0 && (
            <div className="space-y-3">
              {/* Overall progress */}
              {isGenerating && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-white/50">
                    <span>Generating variants...</span>
                    <span>{doneCount}/{totalCount}</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full transition-all duration-300"
                      style={{ width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Per-variant status cards */}
              <div className="space-y-2">
                {variants.map((v) => (
                  <div
                    key={v.value}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                      v.status === "done"
                        ? "bg-emerald-500/10 border-emerald-500/20"
                        : v.status === "error"
                          ? "bg-red-500/10 border-red-500/20"
                          : v.status === "generating"
                            ? "bg-violet-500/10 border-violet-500/20"
                            : "bg-white/[0.02] border-white/[0.06]"
                    }`}
                  >
                    {/* Status icon */}
                    {v.status === "generating" && (
                      <svg className="w-4 h-4 text-violet-400 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                    {v.status === "done" && (
                      <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {v.status === "error" && (
                      <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                    {v.status === "pending" && (
                      <div className="w-4 h-4 rounded-full border border-white/20" />
                    )}

                    {/* Label */}
                    <span className={`text-xs font-medium flex-1 ${
                      v.status === "done" ? "text-emerald-300" :
                      v.status === "error" ? "text-red-300" :
                      v.status === "generating" ? "text-violet-300" :
                      "text-white/40"
                    }`}>
                      {v.label}
                    </span>

                    {/* Error message */}
                    {v.status === "error" && v.error && (
                      <span className="text-[10px] text-red-400/70 truncate max-w-[140px]">{v.error}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Completion message */}
              {!isGenerating && doneCount > 0 && (
                <p className="text-xs text-emerald-400/70">
                  {doneCount} variant{doneCount !== 1 ? "s" : ""} generated! Check your library to see all projects.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
