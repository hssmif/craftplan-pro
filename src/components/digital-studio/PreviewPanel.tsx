"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useDigitalStudioStore } from "@/stores/digitalStudioStore";
import { DIGITAL_PRODUCT_LABELS } from "@/types/digital-product";
import { computeDigitalProductScore } from "@/lib/digital-quality-score";
import { generateDigitalMockups, type MockupProgress } from "@/lib/digital-mockup-service";
import { MockupGallery } from "./MockupGallery";

// ── Step 4: Preview & Mockups (Phase 3 Upgrade) ──
// Three sections:
//   A. Product Preview (type-specific rendering)
//   B. Mockup Gallery (device frames + AI lifestyle)
//   C. Quality Score (4-category breakdown + price estimate)

export function PreviewPanel() {
  const project = useDigitalStudioStore((s) => s.project);
  const setStepStatus = useDigitalStudioStore((s) => s.setStepStatus);
  const setMockups = useDigitalStudioStore((s) => s.setMockups);
  const setMockupStatus = useDigitalStudioStore((s) => s.setMockupStatus);
  const setThumbnailUrl = useDigitalStudioStore((s) => s.setThumbnailUrl);
  const setQualityScore = useDigitalStudioStore((s) => s.setQualityScore);
  const saveProject = useDigitalStudioStore((s) => s.saveProject);

  const [isGeneratingMockups, setIsGeneratingMockups] = useState(false);
  const [mockupProgressLabel, setMockupProgressLabel] = useState("");

  const genResult = project.generation.result;
  const productType = project.productType;
  const mockups = project.preview.mockups;

  // ── Compute quality score on render ────────────────────────

  const qualityScore = useMemo(() => {
    return computeDigitalProductScore(project);
  }, [project]);

  // Sync quality score to store
  useEffect(() => {
    if (qualityScore && (!project.qualityScore || project.qualityScore.overall !== qualityScore.overall)) {
      setQualityScore(qualityScore);
    }
  }, [qualityScore, project.qualityScore, setQualityScore]);

  // Auto-mark step done if generation result exists
  useEffect(() => {
    if (genResult && project.stepStatuses.preview !== "done") {
      setStepStatus("preview", "done");
    }
  }, [genResult, project.stepStatuses.preview, setStepStatus]);

  // ── Mockup Generation Handler ──────────────────────────────

  const handleGenerateMockups = useCallback(async () => {
    if (isGeneratingMockups) return;

    setIsGeneratingMockups(true);
    setMockupStatus("generating");
    setMockupProgressLabel("Starting mockup generation...");

    try {
      const result = await generateDigitalMockups(
        project,
        (progress: MockupProgress) => {
          setMockupProgressLabel(progress.label);
        },
      );

      setMockups(result);
      setMockupStatus("done");

      // Set first mockup as thumbnail
      const firstDone = result.find((m) => m.status === "done");
      if (firstDone) {
        setThumbnailUrl(firstDone.imageUrl);
      }

      // Auto-save
      try { await saveProject(); } catch { /* non-critical */ }
    } catch (err) {
      console.error("Mockup generation failed:", err);
      setMockupStatus("error");
    } finally {
      setIsGeneratingMockups(false);
      setMockupProgressLabel("");
    }
  }, [isGeneratingMockups, project, setMockups, setMockupStatus, setThumbnailUrl, saveProject]);

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">Preview & Mockups</h2>
        <p className="text-sm text-white/50 mt-1">
          Review your generated {DIGITAL_PRODUCT_LABELS[productType]}, create mockups, and check quality score.
        </p>
      </div>

      {/* No result yet */}
      {!genResult && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <svg className="w-12 h-12 text-white/20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-white/40 text-sm">No product generated yet</p>
          <p className="text-white/25 text-xs mt-1">Go back to Generate to create your product first.</p>
        </div>
      )}

      {genResult && (
        <>
          {/* ═══ Section A: Product Preview ═══ */}
          <ProductPreview
            genResult={genResult}
            productType={productType}
            projectName={project.projectName}
            config={project.config}
          />

          {/* ═══ Section B: Mockup Gallery ═══ */}
          <div className="p-5 bg-white/[0.03] border border-white/[0.08] rounded-xl">
            <MockupGallery
              mockups={mockups}
              isGenerating={isGeneratingMockups}
              progressLabel={mockupProgressLabel}
              onGenerate={handleGenerateMockups}
            />
          </div>

          {/* ═══ Section C: Quality Score ═══ */}
          <QualityScoreCard score={qualityScore} productType={productType} />
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Section A: Product Preview
// ═══════════════════════════════════════════════════════════════

import type {
  DigitalGenerationResult,
  DigitalProductConfig,
  DigitalProductType,
  NotionGenerationResult,
  DigitalQualityScore,
} from "@/types/digital-product";

function ProductPreview({
  genResult,
  productType,
  projectName,
  config,
}: {
  genResult: DigitalGenerationResult;
  productType: DigitalProductType;
  projectName: string;
  config: DigitalProductConfig | null;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider">Product Preview</h3>

      {/* ── File Product (PDF / Excel / Printable) ── */}
      {genResult.type === "file" && (
        <div className="space-y-4">
          {/* File Info Card */}
          <div className="p-4 bg-white/[0.03] border border-white/[0.08] rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{genResult.fileName}</p>
                  <p className="text-xs text-white/40">{formatBytes(genResult.fileSizeBytes)} · {genResult.mimeType.split("/").pop()?.toUpperCase()}</p>
                </div>
              </div>

              <a
                href={genResult.downloadUrl}
                download={genResult.fileName}
                className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-lg border border-indigo-500/20 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </a>
            </div>
          </div>

          {/* Inline PDF Preview */}
          {genResult.mimeType === "application/pdf" && (
            <div className="w-full h-[500px] rounded-xl overflow-hidden border border-white/[0.08]">
              <iframe
                src={genResult.downloadUrl}
                className="w-full h-full bg-white"
                title="PDF Preview"
              />
            </div>
          )}

          {/* Excel Info Card (non-PDF) */}
          {productType === "excel" && genResult.mimeType !== "application/pdf" && (
            <ExcelPreviewCard config={config} projectName={projectName} />
          )}

          {/* Generic non-PDF info */}
          {genResult.mimeType !== "application/pdf" && productType !== "excel" && (
            <div className="p-6 bg-white/[0.02] border border-white/[0.06] rounded-xl text-center">
              <p className="text-sm text-white/40">
                Inline preview not available for {genResult.mimeType.split("/")[1]?.toUpperCase()} files.
              </p>
              <p className="text-xs text-white/25 mt-1">Use the download button above to review the file.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Notion Product ── */}
      {genResult.type === "notion" && (
        <NotionPreviewCard genResult={genResult} />
      )}
    </div>
  );
}

// ── Excel Preview Card ───────────────────────────────────────

function ExcelPreviewCard({
  config,
  projectName,
}: {
  config: DigitalProductConfig | null;
  projectName: string;
}) {
  const trackerType = config?.type === "excel" ? config.trackerType || "Tracker" : "Tracker";
  const colorScheme = config?.type === "excel" ? config.colorScheme || "Default" : "Default";

  return (
    <div className="p-5 bg-white/[0.03] border border-white/[0.08] rounded-xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
          <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18M3 18h18M3 6h18M7 3v18M17 3v18" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-white">{projectName}</p>
          <p className="text-xs text-white/40">{trackerType} · {colorScheme} theme</p>
        </div>
      </div>

      {/* Mock spreadsheet grid preview */}
      <div className="rounded-lg overflow-hidden border border-white/[0.06]">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-emerald-500/10">
              <th className="text-left px-3 py-2 text-emerald-300 font-medium border-r border-white/[0.06]">Category</th>
              <th className="text-left px-3 py-2 text-emerald-300 font-medium border-r border-white/[0.06]">Amount</th>
              <th className="text-left px-3 py-2 text-emerald-300 font-medium border-r border-white/[0.06]">Budget</th>
              <th className="text-left px-3 py-2 text-emerald-300 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Housing", "$1,200", "$1,500", "on-track"],
              ["Food", "$450", "$500", "warning"],
              ["Transport", "$200", "$300", "on-track"],
              ["Entertainment", "$175", "$200", "over"],
            ].map(([cat, amt, budget, status], i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white/[0.02]" : "bg-white/[0.01]"}>
                <td className="px-3 py-2 text-white/50 border-r border-white/[0.04]">{cat}</td>
                <td className="px-3 py-2 text-white/50 border-r border-white/[0.04]">{amt}</td>
                <td className="px-3 py-2 text-white/50 border-r border-white/[0.04]">{budget}</td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    status === "on-track" ? "bg-emerald-500/15 text-emerald-300" :
                    status === "warning" ? "bg-amber-500/15 text-amber-300" :
                    "bg-red-500/15 text-red-300"
                  }`}>
                    {status === "on-track" ? "On Track" : status === "warning" ? "Warning" : "Over"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-white/20 mt-2 text-center">Illustrative preview — download the actual file for full content</p>
    </div>
  );
}

// ── Notion Preview Card ──────────────────────────────────────

function NotionPreviewCard({
  genResult,
}: {
  genResult: NotionGenerationResult;
}) {
  return (
    <div className="p-5 bg-white/[0.03] border border-white/[0.08] rounded-xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-white">Notion Template Created</p>
            <p className="text-xs text-white/40">
              {genResult.databases.length} database{genResult.databases.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Quality Tier Badge */}
        <span className={`
          px-2.5 py-1 text-xs font-medium rounded-full
          ${genResult.qualityTier === "ULTRA"
            ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
            : genResult.qualityTier === "PREMIUM"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              : "bg-white/10 text-white/50 border border-white/10"
          }
        `}>
          {genResult.qualityTier}
        </span>
      </div>

      {/* Open in Notion */}
      <a
        href={genResult.pageUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 text-sm text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-lg border border-indigo-500/20 transition-colors"
      >
        Open in Notion
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>

      {/* Database List */}
      {genResult.databases.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-white/50">Databases</h4>
          <div className="grid grid-cols-2 gap-2">
            {genResult.databases.map((db) => (
              <div key={db.id} className="flex items-center gap-2 px-3 py-2 bg-white/[0.02] rounded-lg border border-white/[0.05]">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                <span className="text-xs text-white/50 truncate">{db.key}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Section C: Quality Score
// ═══════════════════════════════════════════════════════════════

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  ULTRA: { bg: "bg-violet-500/20", text: "text-violet-300", border: "border-violet-500/30" },
  PREMIUM: { bg: "bg-amber-500/20", text: "text-amber-300", border: "border-amber-500/30" },
  STANDARD: { bg: "bg-blue-500/20", text: "text-blue-300", border: "border-blue-500/30" },
  BASIC: { bg: "bg-white/10", text: "text-white/50", border: "border-white/10" },
};

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  content: {
    label: "Content Richness",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  },
  design: {
    label: "Design Quality",
    icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01",
  },
  completeness: {
    label: "Completeness",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  },
  etsyReadiness: {
    label: "Etsy Readiness",
    icon: "M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z",
  },
};

function QualityScoreCard({
  score,
  productType,
}: {
  score: DigitalQualityScore;
  productType: DigitalProductType;
}) {
  const tier = TIER_COLORS[score.tier] || TIER_COLORS.BASIC;

  return (
    <div className="p-5 bg-white/[0.03] border border-white/[0.08] rounded-xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Quality Score
        </h3>

        {/* Tier Badge */}
        <span className={`px-3 py-1 text-xs font-bold rounded-full border ${tier.bg} ${tier.text} ${tier.border}`}>
          {score.tier}
        </span>
      </div>

      {/* Overall Score */}
      <div className="flex items-center gap-4">
        <div className="relative w-16 h-16">
          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 60 60">
            <circle
              cx="30" cy="30" r="26"
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="4"
            />
            <circle
              cx="30" cy="30" r="26"
              fill="none"
              stroke={score.overall >= 85 ? "#a78bfa" : score.overall >= 65 ? "#fbbf24" : score.overall >= 40 ? "#60a5fa" : "#94a3b8"}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${(score.overall / 100) * 163.36} 163.36`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-white">
            {score.overall}
          </span>
        </div>

        <div className="flex-1">
          <p className="text-xs text-white/40">
            {DIGITAL_PRODUCT_LABELS[productType]} quality score
          </p>
          <p className="text-sm text-white/70 mt-1">
            Estimated price: ${score.etsyPriceEstimate.min} &ndash; ${score.etsyPriceEstimate.max}
          </p>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="space-y-3">
        {(Object.entries(score.breakdown) as [string, number][]).map(([key, value]) => {
          const cat = CATEGORY_LABELS[key];
          if (!cat) return null;
          const pct = (value / 25) * 100;

          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={cat.icon} />
                  </svg>
                  <span className="text-xs text-white/50">{cat.label}</span>
                </div>
                <span className="text-xs text-white/40">{value}/25</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-white/[0.06]">
                <div
                  className={`h-full rounded-full transition-all ${
                    pct >= 80 ? "bg-emerald-400" : pct >= 60 ? "bg-blue-400" : pct >= 40 ? "bg-amber-400" : "bg-red-400"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Utility ──────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
