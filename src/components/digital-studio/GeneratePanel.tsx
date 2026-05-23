"use client";

import { useState, useCallback } from "react";
import { useDigitalStudioStore } from "@/stores/digitalStudioStore";
import { useSettings } from "@/hooks/useSettings";
import { DIGITAL_PRODUCT_LABELS } from "@/types/digital-product";
import type { DigitalGenerationResult } from "@/types/digital-product";
import { BatchGenerateSection } from "./BatchGenerateSection";

// ── Step 3: Generate ──
// Trigger product generation using existing API engines.
// File products (PDF/Excel/Printable) → binary response → upload to asset storage.
// Notion → JSON response with pageId/pageUrl.

export function GeneratePanel() {
  const project = useDigitalStudioStore((s) => s.project);
  const setGenerationStatus = useDigitalStudioStore((s) => s.setGenerationStatus);
  const setGenerationResult = useDigitalStudioStore((s) => s.setGenerationResult);
  const setStepStatus = useDigitalStudioStore((s) => s.setStepStatus);
  const saveProject = useDigitalStudioStore((s) => s.saveProject);

  const { settings } = useSettings();
  const [progress, setProgress] = useState("");

  const isGenerating = project.generation.status === "generating";
  const isDone = project.generation.status === "done";
  const hasError = project.generation.status === "error";
  const config = project.config;

  // Resolve Notion credentials: project-level override → global Settings fallback
  const resolvedToken = (config?.type === "notion" ? config.notionToken : "") || settings.notionToken || "";
  const resolvedPageId = (config?.type === "notion" ? config.parentPageId : "") || settings.defaultParentPageId || "";
  const hasNotionCredentials = !!(resolvedToken && resolvedPageId);

  const handleGenerate = useCallback(async () => {
    if (!config) return;

    setGenerationStatus("generating");
    setStepStatus("generate", "running");
    setProgress("Preparing...");

    try {
      let result: DigitalGenerationResult;

      switch (config.type) {
        case "pdf": {
          setProgress("Generating PDF planner...");
          const resp = await fetch("/api/pdf/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              plannerType: config.plannerType,
              colorScheme: config.colorTheme,
            }),
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: "Generation failed" }));
            throw new Error(err.error || "PDF generation failed");
          }

          setProgress("Storing file...");
          const blob = await resp.blob();
          const fileName = `${config.plannerType}-planner.pdf`;

          // Upload to asset storage
          const asset = await uploadAsset(blob, project.id, fileName);

          result = {
            type: "file",
            assetId: asset.id,
            fileName: asset.fileName,
            fileSizeBytes: asset.fileSizeBytes,
            mimeType: asset.mimeType,
            downloadUrl: asset.downloadUrl,
          };
          break;
        }

        case "excel": {
          setProgress("Generating Excel tracker...");
          const resp = await fetch("/api/excel/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              trackerType: config.trackerType,
              colorScheme: config.colorScheme,
            }),
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: "Generation failed" }));
            throw new Error(err.error || "Excel generation failed");
          }

          setProgress("Storing file...");
          const blob = await resp.blob();
          const fileName = `${config.trackerType}-tracker.xlsx`;

          const asset = await uploadAsset(blob, project.id, fileName);

          result = {
            type: "file",
            assetId: asset.id,
            fileName: asset.fileName,
            fileSizeBytes: asset.fileSizeBytes,
            mimeType: asset.mimeType,
            downloadUrl: asset.downloadUrl,
          };
          break;
        }

        case "printable": {
          setProgress("Generating printable...");
          const resp = await fetch("/api/printable/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              printableType: config.printableType,
              colorScheme: config.colorScheme,
            }),
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: "Generation failed" }));
            throw new Error(err.error || "Printable generation failed");
          }

          setProgress("Storing file...");
          const blob = await resp.blob();
          const fileName = `${config.printableType}_${config.colorScheme}.pdf`;

          const asset = await uploadAsset(blob, project.id, fileName);

          result = {
            type: "file",
            assetId: asset.id,
            fileName: asset.fileName,
            fileSizeBytes: asset.fileSizeBytes,
            mimeType: asset.mimeType,
            downloadUrl: asset.downloadUrl,
          };
          break;
        }

        case "notion": {
          // Resolve credentials: project-level → Settings fallback
          const tokenForBuild = config.notionToken || settings.notionToken || "";
          const pageIdForBuild = config.parentPageId || settings.defaultParentPageId || "";

          if (!tokenForBuild) {
            throw new Error("No Notion API token found. Add one in Settings or Configure.");
          }
          if (!pageIdForBuild) {
            throw new Error("No parent page selected. Select one in Configure.");
          }

          // Preflight: verify token before attempting build
          setProgress("Verifying Notion connection...");
          const preResp = await fetch("/api/notion/pages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: tokenForBuild }),
          });
          if (!preResp.ok) {
            const preErr = await preResp.json().catch(() => ({}));
            throw new Error(
              preErr.error || "Notion API token is invalid or expired. Update it in Configure or Settings."
            );
          }
          const preData = await preResp.json();
          if (!preData.connected) {
            throw new Error(
              "Notion API token is invalid or expired. Update it in Configure or Settings."
            );
          }

          setProgress("Building Notion template...");
          const resp = await fetch("/api/notion/build", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              notionToken: tokenForBuild,
              parentPageId: pageIdForBuild,
              templateId: config.templateType,
              aesthetic: config.aesthetic,
              premium: config.premium,
            }),
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: "Build failed" }));
            throw new Error(err.error || "Notion build failed");
          }

          const data = await resp.json();

          result = {
            type: "notion",
            pageId: data.pageId,
            pageUrl: data.pageUrl,
            databases: data.databases || [],
            qualityTier: data.qualityScore?.tier || "STANDARD",
          };
          break;
        }

        default:
          throw new Error(`Unsupported product type: ${(config as { type: string }).type}`);
      }

      setGenerationResult(result);
      setStepStatus("generate", "done");
      setProgress("Done!");

      // Auto-save after successful generation
      try {
        await saveProject();
      } catch {
        // Save failure is non-critical
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Generation failed";

      // Categorize Notion errors for better user guidance
      let message = raw;
      if (config?.type === "notion") {
        const lower = raw.toLowerCase();
        if (lower.includes("page not found") || lower.includes("object_not_found") || lower.includes("could not find")) {
          message = "Parent page not accessible. Make sure the page is shared with your Notion integration.";
        } else if (lower.includes("invalid") && (lower.includes("token") || lower.includes("api")) || lower.includes("unauthorized") || lower.includes("401")) {
          message = "Notion API token is invalid or expired. Update it in Configure or Settings.";
        }
      }

      setGenerationStatus("error", message);
      setStepStatus("generate", "error");
      setProgress("");
    }
  }, [config, project.id, settings.notionToken, settings.defaultParentPageId, setGenerationStatus, setGenerationResult, setStepStatus, saveProject]);

  const genResult = project.generation.result;

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">Generate Product</h2>
        <p className="text-sm text-white/50 mt-1">
          Create your {config ? DIGITAL_PRODUCT_LABELS[config.type] : "digital product"} using the configured settings.
        </p>
      </div>

      {/* Config Summary */}
      {config && (
        <div className="p-4 bg-white/[0.03] border border-white/[0.08] rounded-xl space-y-2">
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider">Configuration</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-white/40">Type</div>
            <div className="text-white">{DIGITAL_PRODUCT_LABELS[config.type]}</div>
            {config.type === "pdf" && (
              <>
                <div className="text-white/40">Planner</div>
                <div className="text-white">{config.plannerType}</div>
                <div className="text-white/40">Color</div>
                <div className="text-white">{config.colorTheme}</div>
                <div className="text-white/40">Paper</div>
                <div className="text-white">{config.paperSize}</div>
              </>
            )}
            {config.type === "excel" && (
              <>
                <div className="text-white/40">Tracker</div>
                <div className="text-white">{config.trackerType}</div>
                <div className="text-white/40">Color</div>
                <div className="text-white">{config.colorScheme}</div>
              </>
            )}
            {config.type === "printable" && (
              <>
                <div className="text-white/40">Printable</div>
                <div className="text-white">{config.printableType}</div>
                <div className="text-white/40">Color</div>
                <div className="text-white">{config.colorScheme}</div>
              </>
            )}
            {config.type === "notion" && (
              <>
                <div className="text-white/40">Template</div>
                <div className="text-white">{config.templateType}</div>
                <div className="text-white/40">Aesthetic</div>
                <div className="text-white">{config.aesthetic}</div>
                <div className="text-white/40">Complexity</div>
                <div className="text-white">{config.complexity}</div>
              </>
            )}
          </div>
        </div>
      )}

      {/* No config warning */}
      {!config && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3">
          <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span className="text-sm text-amber-300">Go back to Configure to set up your product first.</span>
        </div>
      )}

      {/* Notion: show connection status from Settings when token not in project */}
      {config && config.type === "notion" && !config.notionToken && resolvedToken && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-xs text-emerald-300">Using Notion token from Settings</span>
        </div>
      )}

      {/* Notion auth requirement banner — only when no resolved token or page */}
      {config && config.type === "notion" && !hasNotionCredentials && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <span className="text-sm font-medium text-amber-300">Notion Credentials Needed</span>
          </div>
          <p className="text-xs text-amber-400/80">
            {!resolvedToken
              ? "No Notion API token found. Connect Notion in Settings or enter a token in Configure."
              : "No parent page selected. Go to Configure to pick a parent page."}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                useDigitalStudioStore.getState().goToStep("configure");
              }}
              className="px-4 py-2 text-xs text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg border border-amber-500/20 transition-colors"
            >
              Go to Configure
            </button>
            {!resolvedToken && (
              <a
                href="/settings"
                className="inline-flex items-center px-4 py-2 text-xs text-white/60 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-lg border border-white/[0.08] transition-colors"
              >
                Open Settings
              </a>
            )}
          </div>
        </div>
      )}

      {/* Generate Button */}
      {config && !isDone && !(config.type === "notion" && !hasNotionCredentials) && (
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className={`
            w-full py-4 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-3
            ${isGenerating
              ? "bg-indigo-500/20 text-indigo-300 cursor-wait"
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
              {progress || "Generating..."}
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Generate {DIGITAL_PRODUCT_LABELS[config.type]}
            </>
          )}
        </button>
      )}

      {/* Error */}
      {hasError && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl space-y-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="text-sm font-medium text-red-300">Generation Failed</span>
          </div>
          <p className="text-xs text-red-400/80">
            {project.generation.error && project.generation.error.length > 400
              ? project.generation.error.slice(0, 400) + "…"
              : project.generation.error}
          </p>

          {/* Contextual help for Notion page-related errors */}
          {config?.type === "notion" &&
            project.generation.error &&
            (project.generation.error.toLowerCase().includes("parent page") ||
              project.generation.error.toLowerCase().includes("not accessible") ||
              project.generation.error.toLowerCase().includes("page not found")) && (
              <div className="p-3 bg-white/[0.03] border border-white/[0.06] rounded-lg space-y-2">
                <p className="text-xs font-medium text-white/70">How to fix this:</p>
                <ol className="text-xs text-white/50 space-y-1 list-decimal list-inside">
                  <li>Open your parent page in Notion</li>
                  <li>Click the <strong className="text-white/70">⋯</strong> menu in the top-right</li>
                  <li>Select <strong className="text-white/70">Add connections</strong></li>
                  <li>Find and select your integration</li>
                  <li>Come back here and try again</li>
                </ol>
              </div>
            )}

          {/* Contextual help for Notion token errors */}
          {config?.type === "notion" &&
            project.generation.error &&
            (project.generation.error.toLowerCase().includes("invalid") ||
              project.generation.error.toLowerCase().includes("expired") ||
              project.generation.error.toLowerCase().includes("token")) && (
              <div className="p-3 bg-white/[0.03] border border-white/[0.06] rounded-lg space-y-2">
                <p className="text-xs font-medium text-white/70">How to fix this:</p>
                <ol className="text-xs text-white/50 space-y-1 list-decimal list-inside">
                  <li>Go to <strong className="text-white/70">notion.so/my-integrations</strong></li>
                  <li>Copy your integration&apos;s Internal Integration Token</li>
                  <li>Update it in Configure or Settings</li>
                </ol>
              </div>
            )}

          <div className="flex gap-2">
            {config?.type === "notion" && (
              <button
                onClick={() => {
                  useDigitalStudioStore.getState().goToStep("configure");
                }}
                className="px-4 py-2 text-xs text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg border border-amber-500/20 transition-colors"
              >
                Back to Configure
              </button>
            )}
            <button
              onClick={handleGenerate}
              className="px-4 py-2 text-xs text-white bg-red-500/20 hover:bg-red-500/30 rounded-lg border border-red-500/30 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Success Result */}
      {isDone && genResult && (
        <div className="p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-4">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-semibold text-emerald-300">Generation Complete</span>
          </div>

          {genResult.type === "file" && (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-white/60">File</span>
                <span className="text-white">{genResult.fileName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/60">Size</span>
                <span className="text-white">{formatBytes(genResult.fileSizeBytes)}</span>
              </div>
              <a
                href={genResult.downloadUrl}
                download={genResult.fileName}
                className="inline-flex items-center gap-2 px-4 py-2 mt-2 text-xs text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-lg border border-indigo-500/20 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </a>
            </div>
          )}

          {genResult.type === "notion" && (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-white/60">Page</span>
                <a href={genResult.pageUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">
                  Open in Notion ↗
                </a>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/60">Databases</span>
                <span className="text-white">{genResult.databases.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/60">Quality</span>
                <span className="text-white">{genResult.qualityTier}</span>
              </div>
            </div>
          )}

          <p className="text-xs text-emerald-400/70">
            Click <strong>Next Step</strong> to preview and continue.
          </p>
        </div>
      )}

      {/* Batch Generation */}
      {isDone && config && (
        <BatchGenerateSection />
      )}
    </div>
  );
}

// ── Helpers ──

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
