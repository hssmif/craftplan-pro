// ── Product Studio: Unified Zustand Store ──
// Single store managing the 8-step pipeline state.
// Small metadata persisted in localStorage; large design base64 stored in SQLite.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  StudioProject,
  StudioStep,
  StepStatus,
  StudioDesign,
  ProductConfig,
  ListingMetadata,
  PrintfulProductRecord,
  EtsyListingRecord,
  InspirationSource,
  NicheAnalysis,
  DesignMode,
} from "@/types/product-studio";
import { STEP_ORDER, createEmptyProject } from "@/types/product-studio";

// ── Store Interface ──

export interface StudioStoreState {
  // Current project being edited
  project: StudioProject;

  // Project library (persisted)
  projects: Array<{
    id: string;
    keyword: string;
    designMode: DesignMode;
    designCount: number;
    selectedDesignCount: number;
    status: StudioProject["status"];
    currentStep: StudioStep;
    nicheScore: number | null;
    thumbnailUrl: string | null;
    etsyListingCount: number;
    createdAt: string;
    updatedAt: string;
  }>;

  // ── Navigation ──
  goToStep: (step: StudioStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  canAdvance: () => boolean;
  getCurrentStepIndex: () => number;

  // ── Step Status ──
  setStepStatus: (step: StudioStep, status: StepStatus, error?: string) => void;
  setStepDuration: (step: StudioStep, ms: number) => void;

  // ── Step 1: Inspiration ──
  setInspiration: (source: InspirationSource) => void;

  // ── Step 2: Generation ──
  setDesignMode: (mode: DesignMode) => void;
  setNicheAnalysis: (data: NicheAnalysis) => void;
  setBatchSize: (size: 10 | 15 | 30 | 50 | 100) => void;
  setDesigns: (designs: StudioDesign[]) => void;
  addDesigns: (designs: StudioDesign[]) => void;

  // ── Step 3: Selection ──
  toggleDesignSelected: (designId: string) => void;
  toggleDesignStarred: (designId: string) => void;
  selectAllDesigns: () => void;
  deselectAllDesigns: () => void;
  getSelectedDesigns: () => StudioDesign[];

  // ── Step 4: Products ──
  setProductConfigs: (configs: ProductConfig[]) => void;
  toggleProductEnabled: (catalogProductId: number) => void;
  updateProductMarkup: (catalogProductId: number, markup: number) => void;
  toggleVariantEnabled: (catalogProductId: number, variantId: number) => void;

  // ── Step 5: Listings ──
  setListings: (listings: ListingMetadata[]) => void;
  updateListing: (designId: string, updates: Partial<ListingMetadata>) => void;

  // ── Step 6: Printful ──
  setPrintfulProducts: (products: PrintfulProductRecord[]) => void;
  updatePrintfulProduct: (designId: string, updates: Partial<PrintfulProductRecord>) => void;

  // ── Step 7: Etsy ──
  setEtsyListings: (listings: EtsyListingRecord[]) => void;
  updateEtsyListing: (designId: string, updates: Partial<EtsyListingRecord>) => void;

  // ── Project Management ──
  saveProject: () => string;
  loadProject: (id: string) => void;
  newProject: () => void;
  duplicateProject: (id: string) => void;
  deleteProject: (id: string) => void;
  reset: () => void;
}

// ── Store Implementation ──

export const useStudioStore = create<StudioStoreState>()(
  persist(
    (set, get) => ({
      project: createEmptyProject(),
      projects: [],

      // ── Navigation ──

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
        const idx = STEP_ORDER.indexOf(current);
        if (idx < STEP_ORDER.length - 1) {
          set((s) => ({
            project: {
              ...s.project,
              currentStep: STEP_ORDER[idx + 1],
              updatedAt: new Date().toISOString(),
            },
          }));
        }
      },

      prevStep: () => {
        const current = get().project.currentStep;
        const idx = STEP_ORDER.indexOf(current);
        if (idx > 0) {
          set((s) => ({
            project: {
              ...s.project,
              currentStep: STEP_ORDER[idx - 1],
              updatedAt: new Date().toISOString(),
            },
          }));
        }
      },

      canAdvance: () => {
        const { project } = get();
        switch (project.currentStep) {
          case "inspiration":
            return !!project.inspiration.keyword.trim() && project.nicheAnalysis !== null;
          case "generation":
            return project.designs.length > 0;
          case "selection":
            return project.designs.some((d) => d.selected);
          case "products":
            return project.productConfigs.some((p) => p.enabled);
          case "listings":
            return project.listings.length > 0;
          case "printful":
            return project.printfulProducts.some((p) => p.status === "done");
          case "etsy-sync":
            return project.printfulProducts.some((p) => p.status === "done");
          case "fulfillment":
            return true;
          default:
            return false;
        }
      },

      getCurrentStepIndex: () => {
        return STEP_ORDER.indexOf(get().project.currentStep);
      },

      // ── Step Status ──

      setStepStatus: (step, status, error) =>
        set((s) => ({
          project: {
            ...s.project,
            stepStatuses: { ...s.project.stepStatuses, [step]: status },
            stepErrors: error
              ? { ...s.project.stepErrors, [step]: error }
              : (() => {
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { [step]: _removed, ...rest } = s.project.stepErrors;
                  return rest;
                })(),
            updatedAt: new Date().toISOString(),
          },
        })),

      setStepDuration: (step, ms) =>
        set((s) => ({
          project: {
            ...s.project,
            stepDurations: { ...s.project.stepDurations, [step]: ms },
          },
        })),

      // ── Step 1: Inspiration ──

      setInspiration: (source) =>
        set((s) => ({
          project: {
            ...s.project,
            inspiration: source,
            updatedAt: new Date().toISOString(),
          },
        })),

      // ── Step 2: Generation ──

      setDesignMode: (mode) =>
        set((s) => ({
          project: { ...s.project, designMode: mode },
        })),

      setNicheAnalysis: (data) =>
        set((s) => ({
          project: { ...s.project, nicheAnalysis: data },
        })),

      setBatchSize: (size) =>
        set((s) => ({
          project: { ...s.project, batchSize: size },
        })),

      setDesigns: (designs) =>
        set((s) => ({
          project: { ...s.project, designs },
        })),

      addDesigns: (newDesigns) =>
        set((s) => ({
          project: {
            ...s.project,
            designs: [...s.project.designs, ...newDesigns],
          },
        })),

      // ── Step 3: Selection ──

      toggleDesignSelected: (designId) =>
        set((s) => ({
          project: {
            ...s.project,
            designs: s.project.designs.map((d) =>
              d.id === designId ? { ...d, selected: !d.selected } : d
            ),
          },
        })),

      toggleDesignStarred: (designId) =>
        set((s) => ({
          project: {
            ...s.project,
            designs: s.project.designs.map((d) =>
              d.id === designId ? { ...d, starred: !d.starred } : d
            ),
          },
        })),

      selectAllDesigns: () =>
        set((s) => ({
          project: {
            ...s.project,
            designs: s.project.designs.map((d) => ({ ...d, selected: true })),
          },
        })),

      deselectAllDesigns: () =>
        set((s) => ({
          project: {
            ...s.project,
            designs: s.project.designs.map((d) => ({ ...d, selected: false })),
          },
        })),

      getSelectedDesigns: () => get().project.designs.filter((d) => d.selected),

      // ── Step 4: Products ──

      setProductConfigs: (configs) =>
        set((s) => ({
          project: { ...s.project, productConfigs: configs },
        })),

      toggleProductEnabled: (catalogProductId) =>
        set((s) => ({
          project: {
            ...s.project,
            productConfigs: s.project.productConfigs.map((p) =>
              p.catalogProductId === catalogProductId
                ? { ...p, enabled: !p.enabled }
                : p
            ),
          },
        })),

      updateProductMarkup: (catalogProductId, markup) =>
        set((s) => ({
          project: {
            ...s.project,
            productConfigs: s.project.productConfigs.map((p) =>
              p.catalogProductId === catalogProductId
                ? { ...p, markupPercent: markup }
                : p
            ),
          },
        })),

      toggleVariantEnabled: (catalogProductId, variantId) =>
        set((s) => ({
          project: {
            ...s.project,
            productConfigs: s.project.productConfigs.map((p) =>
              p.catalogProductId === catalogProductId
                ? {
                    ...p,
                    variants: p.variants.map((v) =>
                      v.variantId === variantId
                        ? { ...v, enabled: !v.enabled }
                        : v
                    ),
                  }
                : p
            ),
          },
        })),

      // ── Step 5: Listings ──

      setListings: (listings) =>
        set((s) => ({
          project: { ...s.project, listings },
        })),

      updateListing: (designId, updates) =>
        set((s) => ({
          project: {
            ...s.project,
            listings: s.project.listings.map((l) =>
              l.designId === designId ? { ...l, ...updates, edited: true } : l
            ),
          },
        })),

      // ── Step 6: Printful ──

      setPrintfulProducts: (products) =>
        set((s) => ({
          project: { ...s.project, printfulProducts: products },
        })),

      updatePrintfulProduct: (designId, updates) =>
        set((s) => ({
          project: {
            ...s.project,
            printfulProducts: s.project.printfulProducts.map((p) =>
              p.designId === designId ? { ...p, ...updates } : p
            ),
          },
        })),

      // ── Step 7: Etsy ──

      setEtsyListings: (listings) =>
        set((s) => ({
          project: { ...s.project, etsyListings: listings },
        })),

      updateEtsyListing: (designId, updates) =>
        set((s) => ({
          project: {
            ...s.project,
            etsyListings: s.project.etsyListings.map((l) =>
              l.designId === designId ? { ...l, ...updates } : l
            ),
          },
        })),

      // ── Project Management ──

      saveProject: () => {
        const s = get();
        const project = { ...s.project, updatedAt: new Date().toISOString() };

        // Save summary to library (without large design data)
        const selectedDesigns = project.designs.filter((d) => d.selected);
        const summary = {
          id: project.id,
          keyword: project.inspiration.keyword,
          designMode: project.designMode,
          designCount: project.designs.length,
          selectedDesignCount: selectedDesigns.length,
          status: project.status,
          currentStep: project.currentStep,
          nicheScore: project.nicheAnalysis?.nicheScore ?? null,
          thumbnailUrl: selectedDesigns[0]?.thumbnailUrl ?? selectedDesigns[0]?.dataUrl?.substring(0, 200) ?? null,
          etsyListingCount: project.etsyListings.filter(
            (l) => l.status === "active" || l.status === "draft" || l.status === "ready-to-finish"
          ).length,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        };

        set({
          project,
          projects: [
            summary,
            ...s.projects.filter((p) => p.id !== project.id),
          ].slice(0, 100),
        });

        return project.id;
      },

      loadProject: (id) => {
        // Note: This loads the summary. Full project data (with designs)
        // needs to be loaded from SQLite via /api/studio/projects/[id]
        const summary = get().projects.find((p) => p.id === id);
        if (summary) {
          const project = createEmptyProject();
          project.id = summary.id;
          project.createdAt = summary.createdAt;
          project.updatedAt = summary.updatedAt;
          project.currentStep = summary.currentStep;
          project.designMode = summary.designMode;
          project.status = summary.status;
          project.inspiration = { type: "keyword", keyword: summary.keyword };
          set({ project });
        }
      },

      newProject: () => set({ project: createEmptyProject() }),

      duplicateProject: (id) => {
        const source = get().projects.find((p) => p.id === id);
        if (!source) return;
        const project = createEmptyProject();
        project.inspiration = { type: "keyword", keyword: source.keyword };
        set({ project });
      },

      deleteProject: (id) =>
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== id),
        })),

      reset: () => set({ project: createEmptyProject() }),
    }),
    {
      name: "craftplan_studio",
      partialize: (state) => ({
        // Only persist the project library summaries (not the current project with large design data)
        projects: state.projects,
      }),
      // Backward-compat: fill defaults for new summary fields on old persisted data
      merge: (persisted, current) => {
        const data = persisted as Partial<StudioStoreState> | undefined;
        return {
          ...current,
          projects: (data?.projects ?? []).map((p) => ({
            ...p,
            selectedDesignCount: (p as Record<string, unknown>).selectedDesignCount as number ?? 0,
            nicheScore: (p as Record<string, unknown>).nicheScore as number | null ?? null,
            thumbnailUrl: (p as Record<string, unknown>).thumbnailUrl as string | null ?? null,
            etsyListingCount: (p as Record<string, unknown>).etsyListingCount as number ?? 0,
          })),
        };
      },
    }
  )
);
