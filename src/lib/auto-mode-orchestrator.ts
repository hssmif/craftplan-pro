// ══════════════════════════════════════════════════════════════
// Auto Mode Orchestrator
// Drives the full pipeline: infer → generate → mockups → listing
// Called from AutoModePanel, uses existing store actions and APIs.
// ══════════════════════════════════════════════════════════════

import type {
  DigitalProductType,
  DigitalProductConfig,
  SheetsConfig,
  DigitalGenerationResult,
  DigitalListingPackage,
  DigitalStudioStep,
  DigitalStepStatus,
  DigitalProduct,
  MockupAsset,
} from "@/types/digital-product";

export type AutoPhase = "inferring" | "generating" | "mockups" | "listing" | "done";
type AutoProductConfig = DigitalProductConfig | SheetsConfig;

export interface AutoModeStoreActions {
  // Identity
  setProjectName: (name: string) => void;
  setProductType: (type: DigitalProductType) => void;

  // Step 1: Discovery
  setInspiration: (source: DigitalProduct["inspiration"]) => void;
  setStepStatus: (step: DigitalStudioStep, status: DigitalStepStatus) => void;

  // Step 2: Configuration
  setConfig: (config: AutoProductConfig) => void;

  // Step 3: Generation
  setGenerationStatus: (status: DigitalProduct["generation"]["status"], error?: string) => void;
  setGenerationResult: (result: DigitalGenerationResult) => void;

  // Step 4: Preview
  setMockups: (mockups: MockupAsset[]) => void;
  setMockupStatus: (status: DigitalProduct["preview"]["mockupStatus"]) => void;
  setThumbnailUrl: (url: string) => void;

  // Step 5: Listing
  setListing: (listing: DigitalListingPackage) => void;

  // Navigation
  goToStep: (step: DigitalStudioStep) => void;
  saveProject: () => Promise<string>;

  // Auto state
  setAutoPhase: (phase: AutoPhase | null) => void;
  setAutoError: (error: string | null) => void;

  // Project ID getter
  getProjectId: () => string;
}

interface AutoModeSettings {
  notionToken?: string;
  defaultParentPageId?: string;
}

// ── Asset Upload (shared with GeneratePanel) ─────────────────

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

// ── Phase 1: Infer ──────────────────────────────────────────

async function phaseInfer(
  prompt: string,
  store: AutoModeStoreActions
): Promise<{ productType: DigitalProductType; config: AutoProductConfig }> {
  const resp = await fetch("/api/digital/auto-infer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Inference failed" }));
    throw new Error(err.error || "Failed to analyze your idea");
  }

  const data = await resp.json();

  // Apply to store
  store.setProjectName(data.projectName || "Auto Product");
  store.setProductType(data.productType);
  store.setInspiration({
    source: "auto",
    keyword: data.keyword,
    niche: data.niche,
    targetAudience: data.targetAudience,
  });
  store.setConfig(data.config);
  store.setStepStatus("discover", "done");
  store.setStepStatus("configure", "done");

  return { productType: data.productType, config: data.config };
}

// ── Phase 2: Generate ───────────────────────────────────────

async function phaseGenerate(
  config: AutoProductConfig,
  projectId: string,
  settings: AutoModeSettings,
  store: AutoModeStoreActions
): Promise<DigitalGenerationResult> {
  store.setGenerationStatus("generating");
  store.setStepStatus("generate", "running");

  let result: DigitalGenerationResult;

  switch (config.type) {
    case "pdf": {
      const resp = await fetch("/api/pdf/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plannerType: config.plannerType,
          colorScheme: config.colorTheme,
        }),
      });
      if (!resp.ok) throw new Error("PDF generation failed");
      const blob = await resp.blob();
      const asset = await uploadAsset(blob, projectId, `${config.plannerType}-planner.pdf`);
      result = { type: "file", assetId: asset.id, fileName: asset.fileName, fileSizeBytes: asset.fileSizeBytes, mimeType: asset.mimeType, downloadUrl: asset.downloadUrl };
      break;
    }

    case "excel": {
      const resp = await fetch("/api/excel/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackerType: config.trackerType,
          colorScheme: config.colorScheme,
        }),
      });
      if (!resp.ok) throw new Error("Excel generation failed");
      const blob = await resp.blob();
      const asset = await uploadAsset(blob, projectId, `${config.trackerType}-tracker.xlsx`);
      result = { type: "file", assetId: asset.id, fileName: asset.fileName, fileSizeBytes: asset.fileSizeBytes, mimeType: asset.mimeType, downloadUrl: asset.downloadUrl };
      break;
    }

    case "printable": {
      const resp = await fetch("/api/printable/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          printableType: config.printableType,
          colorScheme: config.colorScheme,
        }),
      });
      if (!resp.ok) throw new Error("Printable generation failed");
      const blob = await resp.blob();
      const asset = await uploadAsset(blob, projectId, `${config.printableType}_${config.colorScheme}.pdf`);
      result = { type: "file", assetId: asset.id, fileName: asset.fileName, fileSizeBytes: asset.fileSizeBytes, mimeType: asset.mimeType, downloadUrl: asset.downloadUrl };
      break;
    }

    case "sheets": {
      const resp = await fetch("/api/sheets/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetsType: config.sheetsType,
          colorScheme: config.colorScheme,
        }),
      });
      if (!resp.ok) throw new Error("Sheets generation failed");
      const blob = await resp.blob();
      const titles: Record<string, string> = { budget_tracker: "budget-tracker", paycheck_budget: "paycheck-budget", business_pl: "business-pl" };
      const asset = await uploadAsset(blob, projectId, `${titles[config.sheetsType] || config.sheetsType}-${config.colorScheme}.xlsx`);
      result = { type: "file", assetId: asset.id, fileName: asset.fileName, fileSizeBytes: asset.fileSizeBytes, mimeType: asset.mimeType, downloadUrl: asset.downloadUrl };
      break;
    }

    case "notion": {
      const token = config.notionToken || settings.notionToken || "";
      const pageId = config.parentPageId || settings.defaultParentPageId || "";
      if (!token || !pageId) {
        throw new Error("NOTION_NO_TOKEN");
      }

      // Preflight
      const preResp = await fetch("/api/notion/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!preResp.ok) throw new Error("Notion API token is invalid");

      // Build
      const resp = await fetch("/api/notion/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notionToken: token,
          parentPageId: pageId,
          templateId: config.templateType,
          aesthetic: config.aesthetic,
          premium: config.premium,
        }),
      });
      if (!resp.ok) throw new Error("Notion build failed");
      const data = await resp.json();
      result = { type: "notion", pageId: data.pageId, pageUrl: data.pageUrl, databases: data.databases || [], qualityTier: data.qualityScore?.tier || "STANDARD" };
      break;
    }

    default:
      throw new Error(`Unsupported type: ${(config as { type: string }).type}`);
  }

  store.setGenerationResult(result);
  store.setStepStatus("generate", "done");
  return result;
}

// ── Phase 3: Mockups ────────────────────────────────────────

async function phaseMockups(
  projectId: string,
  productType: DigitalProductType,
  config: DigitalProductConfig,
  projectName: string,
  store: AutoModeStoreActions
): Promise<void> {
  store.setMockupStatus("generating");
  store.setStepStatus("preview", "running");

  try {
    const scenes = ["hero", "lifestyle"];

    const resp = await fetch("/api/digital/mockups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        productType,
        scenes,
        config,
        projectName,
      }),
    });

    if (!resp.ok) {
      console.error("[AutoMode] Mockup generation failed, continuing...");
      store.setMockupStatus("error");
      store.setStepStatus("preview", "error");
      return;
    }

    const data = await resp.json();
    if (data.mockups?.length > 0) {
      store.setMockups(data.mockups);
      if (data.mockups[0]?.imageUrl) {
        store.setThumbnailUrl(data.mockups[0].imageUrl);
      }
    }
    store.setMockupStatus("done");
    store.setStepStatus("preview", "done");
  } catch (err) {
    // Network-level failure is non-fatal
    console.error("[AutoMode] Mockup fetch error:", err);
    store.setMockupStatus("error");
    store.setStepStatus("preview", "error");
  }
}

// ── Phase 4: Listing ────────────────────────────────────────

async function phaseListing(
  productType: DigitalProductType,
  config: DigitalProductConfig,
  projectName: string,
  niche: string,
  targetAudience: string,
  store: AutoModeStoreActions
): Promise<void> {
  try {
    const resp = await fetch("/api/digital/listing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productType,
        config,
        projectName,
        niche,
        targetAudience,
      }),
    });

    if (!resp.ok) {
      console.error("[AutoMode] Listing generation failed, continuing...");
      return;
    }

    const data = await resp.json();
    store.setListing({
      title: data.title || "",
      description: data.description || "",
      tags: data.tags || [],
      price: data.price || { min: 0, max: 0, recommended: 0 },
      faqs: data.faqs || [],
      mockupIdeas: data.mockupIdeas || [],
      status: "done",
    });
    store.setStepStatus("listing", "done");
  } catch (err) {
    // Network-level failure is non-fatal
    console.error("[AutoMode] Listing fetch error:", err);
  }
}

// ── Main Orchestrator ───────────────────────────────────────

export async function runAutoMode(
  prompt: string,
  store: AutoModeStoreActions,
  settings: AutoModeSettings
): Promise<void> {
  store.setAutoError(null);

  try {
    // Phase 1: Infer
    store.setAutoPhase("inferring");
    const { productType, config } = await phaseInfer(prompt, store);

    // Notion guard: if no token, stop early and let user configure
    if (productType === "notion") {
      const token = (config as { notionToken?: string }).notionToken || settings.notionToken;
      const pageId = (config as { parentPageId?: string }).parentPageId || settings.defaultParentPageId;
      if (!token || !pageId) {
        store.setAutoPhase("done");
        store.goToStep("configure");
        // Save so the user doesn't lose the inferred config
        try { await store.saveProject(); } catch { /* non-critical */ }
        return;
      }
    }

    const projectId = store.getProjectId();
    const projectName = prompt.slice(0, 40);

    // Save project to DB before generation — the digital_assets table
    // has a foreign key to digital_projects, so the project row must exist
    // before any asset uploads can succeed.
    await store.saveProject();

    // Phase 2: Generate
    store.setAutoPhase("generating");
    await phaseGenerate(config, projectId, settings, store);

    // Phase 3: Mockups (non-fatal)
    store.setAutoPhase("mockups");
    await phaseMockups(projectId, productType, config, projectName, store);

    // Phase 4: Listing (non-fatal)
    store.setAutoPhase("listing");
    await phaseListing(productType, config, projectName, "", "", store);

    // Done — save and navigate
    store.setAutoPhase("done");
    try { await store.saveProject(); } catch { /* non-critical */ }
    store.goToStep("preview");

  } catch (err) {
    let message = err instanceof Error ? err.message : "Something went wrong";
    // Improve message for network-level failures
    if (message === "Failed to fetch" || message.includes("NetworkError") || message.includes("ConnectionRefused")) {
      message = "Unable to connect to the server. Make sure the dev server is running.";
    }
    store.setAutoError(message);
    // Don't reset phase — keep it on the failed phase for UI indication
  }
}
