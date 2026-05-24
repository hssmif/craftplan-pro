// ══════════════════════════════════════════════════════════════
// Digital Product Studio: Unified Zustand Store
// Manages the 6-step pipeline state for all digital product
// types: Notion Templates, PDF Planners, Excel Trackers,
// Printables.
//
// Project summaries persisted in localStorage.
// Full project data persisted via /api/digital/projects API.
// ══════════════════════════════════════════════════════════════

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  DigitalProduct,
  DigitalProductType,
  DigitalStudioStep,
  DigitalStepStatus,
  DigitalProductConfig,
  DigitalGenerationResult,
  DigitalListingPackage,
  DigitalPublishState,
  DigitalQualityScore,
  MockupAsset,
  DigitalProjectSummary,
  BatchMetadata,
  ImportSource,
} from "@/types/digital-product";
import type { AutoPhase } from "@/lib/auto-mode-orchestrator";
import {
  createEmptyDigitalProduct,
  DIGITAL_STEP_ORDER,
} from "@/types/digital-product";

// ── Store Interface ──────────────────────────────────────────

export interface DigitalStudioStoreState {
  // Current project being edited
  project: DigitalProduct;

  // Project library (persisted locally as summaries)
  projects: DigitalProjectSummary[];

  // UI state
  isSaving: boolean;
  isLoading: boolean;
  lastError: string | null;
  autoMode: boolean;
  autoPhase: AutoPhase | null;
  autoPrompt: string;
  autoError: string | null;

  // ── Navigation ──
  goToStep: (step: DigitalStudioStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  canAdvance: () => boolean;
  getCurrentStepIndex: () => number;

  // ── Step Status ──
  setStepStatus: (step: DigitalStudioStep, status: DigitalStepStatus) => void;

  // ── Step 1: Discovery ──
  setInspiration: (source: DigitalProduct["inspiration"]) => void;

  // ── Step 2: Configuration ──
  setConfig: (config: DigitalProductConfig) => void;

  // ── Step 3: Generation ──
  setGenerationStatus: (status: DigitalProduct["generation"]["status"], error?: string) => void;
  setGenerationResult: (result: DigitalGenerationResult) => void;

  // ── Step 4: Preview & Mockups ──
  setMockups: (mockups: MockupAsset[]) => void;
  updateMockup: (mockupId: string, updates: Partial<MockupAsset>) => void;
  setMockupStatus: (status: DigitalProduct["preview"]["mockupStatus"]) => void;
  setThumbnailUrl: (url: string) => void;
  setPreviewUrl: (url: string) => void;

  // ── Step 5: Listing ──
  setListing: (listing: DigitalListingPackage) => void;
  updateListing: (updates: Partial<DigitalListingPackage>) => void;

  // ── Step 6: Publish ──
  setPublishState: (state: DigitalPublishState) => void;

  // ── Quality ──
  setQualityScore: (score: DigitalQualityScore) => void;

  // ── Batch ──
  setBatchMeta: (meta: BatchMetadata | null) => void;
  duplicateProject: (overrides?: {
    projectName?: string;
    config?: DigitalProductConfig;
    batchMeta?: BatchMetadata;
  }) => Promise<DigitalProduct>;

  // ── Import ──
  setImportSource: (source: ImportSource | null) => void;
  importFromExtension: (payload: {
    title: string;
    tags: string[];
    price: number;
    shopName: string;
    url: string;
    searchQuery: string;
    podScore: number;
    reviews: number;
    rating: number;
    isBestseller: boolean;
    designKeywords: string[];
    description?: string;
  }) => Promise<string>;  // Returns projectId

  // ── Project Management ──
  setProjectName: (name: string) => void;
  setProductType: (type: DigitalProductType) => void;
  saveProject: () => Promise<string>;
  loadProject: (id: string) => Promise<void>;
  newProject: (productType?: DigitalProductType, projectName?: string) => void;
  deleteProject: (id: string) => Promise<void>;
  refreshProjectList: () => Promise<void>;
  setError: (error: string | null) => void;
  setAutoMode: (enabled: boolean) => void;
  setAutoPrompt: (prompt: string) => void;
  setAutoPhase: (phase: AutoPhase | null) => void;
  setAutoError: (error: string | null) => void;
  reset: () => void;
}

// ── Store Implementation ─────────────────────────────────────

export const useDigitalStudioStore = create<DigitalStudioStoreState>()(
  persist(
    (set, get) => ({
      project: createEmptyDigitalProduct(),
      projects: [],
      isSaving: false,
      isLoading: false,
      lastError: null,
      autoMode: false,
      autoPhase: null,
      autoPrompt: "",
      autoError: null,

      // ── Navigation ──────────────────────────────────────────

      goToStep: (step) =>
        set((s) => ({
          project: {
            ...s.project,
            currentStep: step,
            updatedAt: new Date().toISOString(),
          },
        })),

      nextStep: () => {
        const current = get().project.currentStep;
        const idx = DIGITAL_STEP_ORDER.indexOf(current);
        if (idx < DIGITAL_STEP_ORDER.length - 1) {
          set((s) => ({
            project: {
              ...s.project,
              currentStep: DIGITAL_STEP_ORDER[idx + 1],
              updatedAt: new Date().toISOString(),
            },
          }));
        }
      },

      prevStep: () => {
        const current = get().project.currentStep;
        const idx = DIGITAL_STEP_ORDER.indexOf(current);
        if (idx > 0) {
          set((s) => ({
            project: {
              ...s.project,
              currentStep: DIGITAL_STEP_ORDER[idx - 1],
              updatedAt: new Date().toISOString(),
            },
          }));
        }
      },

      canAdvance: () => {
        const { project } = get();
        switch (project.currentStep) {
          case "discover":
            // Need at least a product type and some inspiration
            return !!project.inspiration.source;
          case "configure":
            // Need a valid configuration
            return project.config !== null;
          case "generate":
            // Need generation to be complete
            return project.generation.status === "done" && project.generation.result !== null;
          case "preview":
            // Mockups generated or at least thumbnail exists
            return (
              project.preview.mockupStatus === "done" ||
              project.preview.mockups.length > 0 ||
              !!project.preview.thumbnailUrl
            );
          case "listing":
            // Listing package ready
            return (
              project.listing.status === "done" ||
              project.listing.status === "edited"
            );
          case "publish":
            // Final step, always allow (nothing to advance to)
            return true;
          default:
            return false;
        }
      },

      getCurrentStepIndex: () => {
        return DIGITAL_STEP_ORDER.indexOf(get().project.currentStep);
      },

      // ── Step Status ─────────────────────────────────────────

      setStepStatus: (step, status) =>
        set((s) => ({
          project: {
            ...s.project,
            stepStatuses: { ...s.project.stepStatuses, [step]: status },
            updatedAt: new Date().toISOString(),
          },
        })),

      // ── Step 1: Discovery ───────────────────────────────────

      setInspiration: (source) =>
        set((s) => ({
          project: {
            ...s.project,
            inspiration: source,
            updatedAt: new Date().toISOString(),
          },
        })),

      // ── Step 2: Configuration ───────────────────────────────

      setConfig: (config) =>
        set((s) => ({
          project: {
            ...s.project,
            config,
            updatedAt: new Date().toISOString(),
          },
        })),

      // ── Step 3: Generation ──────────────────────────────────

      setGenerationStatus: (status, error) =>
        set((s) => ({
          project: {
            ...s.project,
            generation: {
              ...s.project.generation,
              status,
              error: error || undefined,
              ...(status === "generating" ? { startedAt: new Date().toISOString() } : {}),
              ...(status === "done" ? { completedAt: new Date().toISOString() } : {}),
            },
            updatedAt: new Date().toISOString(),
          },
        })),

      setGenerationResult: (result) =>
        set((s) => ({
          project: {
            ...s.project,
            generation: {
              ...s.project.generation,
              status: "done",
              result,
              completedAt: new Date().toISOString(),
            },
            status: "generated",
            updatedAt: new Date().toISOString(),
          },
        })),

      // ── Step 4: Preview & Mockups ───────────────────────────

      setMockups: (mockups) =>
        set((s) => ({
          project: {
            ...s.project,
            preview: { ...s.project.preview, mockups },
            updatedAt: new Date().toISOString(),
          },
        })),

      updateMockup: (mockupId, updates) =>
        set((s) => ({
          project: {
            ...s.project,
            preview: {
              ...s.project.preview,
              mockups: s.project.preview.mockups.map((m) =>
                m.id === mockupId ? { ...m, ...updates } : m
              ),
            },
            updatedAt: new Date().toISOString(),
          },
        })),

      setMockupStatus: (status) =>
        set((s) => ({
          project: {
            ...s.project,
            preview: { ...s.project.preview, mockupStatus: status },
            status: status === "done" ? "mockups-ready" : s.project.status,
            updatedAt: new Date().toISOString(),
          },
        })),

      setThumbnailUrl: (url) =>
        set((s) => ({
          project: {
            ...s.project,
            preview: { ...s.project.preview, thumbnailUrl: url },
            updatedAt: new Date().toISOString(),
          },
        })),

      setPreviewUrl: (url) =>
        set((s) => ({
          project: {
            ...s.project,
            preview: { ...s.project.preview, previewUrl: url },
            updatedAt: new Date().toISOString(),
          },
        })),

      // ── Step 5: Listing ─────────────────────────────────────

      setListing: (listing) =>
        set((s) => ({
          project: {
            ...s.project,
            listing,
            status: listing.status === "done" ? "listing-ready" : s.project.status,
            updatedAt: new Date().toISOString(),
          },
        })),

      updateListing: (updates) =>
        set((s) => ({
          project: {
            ...s.project,
            listing: {
              ...s.project.listing,
              ...updates,
              status: "edited" as const,
            },
            updatedAt: new Date().toISOString(),
          },
        })),

      // ── Step 6: Publish ─────────────────────────────────────

      setPublishState: (state) =>
        set((s) => ({
          project: {
            ...s.project,
            publish: state,
            status: state.etsyStatus === "active" ? "published" : s.project.status,
            updatedAt: new Date().toISOString(),
          },
        })),

      // ── Quality ─────────────────────────────────────────────

      setQualityScore: (score) =>
        set((s) => ({
          project: {
            ...s.project,
            qualityScore: score,
            updatedAt: new Date().toISOString(),
          },
        })),

      // ── Batch ────────────────────────────────────────────────

      setBatchMeta: (meta) =>
        set((s) => ({
          project: {
            ...s.project,
            batchMeta: meta,
            updatedAt: new Date().toISOString(),
          },
        })),

      duplicateProject: async (overrides) => {
        const source = get().project;
        const now = new Date().toISOString();
        const newId = `dp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        // Deep-clone with reset generation/preview/listing/publish
        const clone: DigitalProduct = {
          id: newId,
          projectName: overrides?.projectName || `${source.projectName} (Copy)`,
          productType: source.productType,
          status: "draft",
          currentStep: "generate",
          stepStatuses: {
            discover: "done",
            configure: "done",
            generate: "idle",
            preview: "idle",
            listing: "idle",
            publish: "idle",
          },
          inspiration: { ...source.inspiration },
          config: overrides?.config
            ? JSON.parse(JSON.stringify(overrides.config))
            : source.config
              ? JSON.parse(JSON.stringify(source.config))
              : null,
          generation: { status: "idle", result: null },
          preview: { mockups: [], mockupStatus: "idle" },
          listing: {
            title: "",
            description: "",
            tags: [],
            price: { min: 0, max: 0, recommended: 0 },
            faqs: [],
            mockupIdeas: [],
            status: "idle",
          },
          publish: { platform: "none", etsyStatus: "unpublished" },
          qualityScore: null,
          batchMeta: overrides?.batchMeta || null,
          importSource: null,
          createdAt: now,
          updatedAt: now,
        };

        // Save the clone to the server
        const resp = await fetch("/api/digital/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project: clone }),
        });

        if (!resp.ok) {
          throw new Error("Failed to save duplicated project");
        }

        // Add to local project list
        const summary: DigitalProjectSummary = {
          id: clone.id,
          projectName: clone.projectName,
          productType: clone.productType,
          status: clone.status,
          currentStep: clone.currentStep,
          batchId: clone.batchMeta?.batchId,
          variantLabel: clone.batchMeta?.variantLabel,
          createdAt: clone.createdAt,
          updatedAt: clone.updatedAt,
        };

        set((prev) => ({
          projects: [summary, ...prev.projects].slice(0, 200),
        }));

        return clone;
      },

      // ── Import ────────────────────────────────────────────────

      setImportSource: (source) =>
        set((s) => ({
          project: {
            ...s.project,
            importSource: source,
            updatedAt: new Date().toISOString(),
          },
        })),

      importFromExtension: async (payload) => {
        set({ isLoading: true, lastError: null });

        try {
          // Call the import API — creates project on server + infers type
          const resp = await fetch("/api/digital/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: payload.title,
              tags: payload.tags,
              price: payload.price,
              shopName: payload.shopName,
              url: payload.url,
              searchQuery: payload.searchQuery,
              podScore: payload.podScore,
              reviews: payload.reviews,
              rating: payload.rating,
              isBestseller: payload.isBestseller,
              description: payload.description,
            }),
          });

          if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: "Import failed" }));
            throw new Error(err.error || "Import failed");
          }

          const data = await resp.json();
          const projectId = data.projectId as string;

          // Load the newly created project into the store
          const loadResp = await fetch(`/api/digital/projects?id=${projectId}`);
          if (!loadResp.ok) {
            throw new Error("Failed to load imported project");
          }

          const loadData = await loadResp.json();
          const project = loadData.project;

          // Update store with imported project
          const summary: DigitalProjectSummary = {
            id: project.id,
            projectName: project.projectName,
            productType: project.productType,
            status: project.status,
            currentStep: project.currentStep,
            importSourceType: project.importSource?.type,
            importSourceUrl: project.importSource?.url,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
          };

          set((prev) => ({
            project,
            projects: [summary, ...prev.projects.filter((p) => p.id !== project.id)].slice(0, 200),
            isLoading: false,
          }));

          return projectId;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Import failed";
          set({ isLoading: false, lastError: message });
          throw err;
        }
      },

      // ── Project Management ──────────────────────────────────

      setProjectName: (name) =>
        set((s) => ({
          project: {
            ...s.project,
            projectName: name,
            updatedAt: new Date().toISOString(),
          },
        })),

      setProductType: (type) =>
        set((s) => ({
          project: {
            ...s.project,
            productType: type,
            updatedAt: new Date().toISOString(),
          },
        })),

      saveProject: async () => {
        const s = get();
        const project = { ...s.project, updatedAt: new Date().toISOString() };

        set({ isSaving: true, lastError: null });

        try {
          const resp = await fetch("/api/digital/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ project }),
          });

          if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.error || "Failed to save project");
          }

          // Update local project library summary
          const summary: DigitalProjectSummary = {
            id: project.id,
            projectName: project.projectName,
            productType: project.productType,
            status: project.status,
            currentStep: project.currentStep,
            thumbnailUrl: project.preview.thumbnailUrl,
            etsyListingUrl: project.publish.etsyListingUrl,
            qualityTier: project.qualityScore?.tier,
            batchId: project.batchMeta?.batchId,
            variantLabel: project.batchMeta?.variantLabel,
            importSourceType: project.importSource?.type,
            importSourceUrl: project.importSource?.url,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
          };

          set((prev) => ({
            project,
            projects: [
              summary,
              ...prev.projects.filter((p) => p.id !== project.id),
            ].slice(0, 200),
            isSaving: false,
          }));

          return project.id;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Save failed";
          set({ isSaving: false, lastError: message });
          throw err;
        }
      },

      loadProject: async (id) => {
        set({ isLoading: true, lastError: null });

        try {
          const resp = await fetch(`/api/digital/projects?id=${id}`);
          if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.error || "Failed to load project");
          }

          const data = await resp.json();
          set({
            project: data.project,
            isLoading: false,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Load failed";
          set({ isLoading: false, lastError: message });
          throw err;
        }
      },

      newProject: (productType = "pdf", projectName = "Untitled Product") => {
        set({
          project: createEmptyDigitalProduct(productType, projectName),
          lastError: null,
        });
      },

      deleteProject: async (id) => {
        try {
          const resp = await fetch(`/api/digital/projects?id=${id}`, {
            method: "DELETE",
          });

          if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.error || "Failed to delete project");
          }

          set((s) => ({
            projects: s.projects.filter((p) => p.id !== id),
            // If deleting the current project, reset to empty
            ...(s.project.id === id
              ? { project: createEmptyDigitalProduct() }
              : {}),
          }));
        } catch (err) {
          const message = err instanceof Error ? err.message : "Delete failed";
          set({ lastError: message });
          throw err;
        }
      },

      refreshProjectList: async () => {
        try {
          const resp = await fetch("/api/digital/projects");
          if (!resp.ok) return;
          const data = await resp.json();
          if (data.projects) {
            set({ projects: data.projects });
          }
        } catch {
          // Silently fail — project list will remain stale
        }
      },

      setError: (error) => set({ lastError: error }),
      setAutoMode: (enabled) => set({ autoMode: enabled }),
      setAutoPrompt: (prompt) => set({ autoPrompt: prompt }),
      setAutoPhase: (phase) => set({ autoPhase: phase }),
      setAutoError: (error) => set({ autoError: error }),

      reset: () =>
        set({
          project: createEmptyDigitalProduct(),
          lastError: null,
          isSaving: false,
          isLoading: false,
          autoMode: false,
          autoPhase: null,
          autoPrompt: "",
          autoError: null,
        }),
    }),
    {
      name: "craftplan_digital_studio",
      partialize: (state) => ({
        // Only persist the project library summaries (not the current project)
        projects: state.projects,
      }),
      merge: (persisted, current) => {
        const data = persisted as Partial<DigitalStudioStoreState> | undefined;
        return {
          ...current,
          projects: data?.projects ?? [],
        };
      },
    }
  )
);
