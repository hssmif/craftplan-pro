"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── Types ──

export interface NicheAnalysis {
  nicheScore: number;
  demandLevel: string;
  competitionLevel: string;
  bestProductTypes: string[];
  topSubNiches: string[];
  buyerPersona: string;
  seasonality: string;
  peakMonths: string[];
  avgPriceRange: { min: number; max: number };
  topSellerEstimate: string;
}

export interface KeywordResult {
  keyword: string;
  searchVolume: string;
  competition: string;
  type: string;
}

export interface DesignPrompt {
  style: string;
  prompt: string;
  colorPalette: string[];
}

export interface GeneratedImage {
  style: string;
  image: string; // base64
  mimeType: string;
  prompt: string;
  imageUrl?: string; // public URL (e.g. from Pollinations) for Printful upload
}

export interface ProductSelection {
  name: string;
  productId: number;
  icon: string;
  margin: string;
  category: string;
  enabled: boolean;
}

export interface ListingData {
  productType: string;
  title: string;
  description: string;
  tags: string[];
  price: number;
  profit: number;
}

export interface PublishQueueItem {
  productType: string;
  title: string;
  price: number;
  status: "queued" | "publishing" | "published" | "error";
  error?: string;
}

export type StepStatus = "idle" | "running" | "done" | "error";

export interface DesignSenseiProject {
  id: string;
  keyword: string;
  createdAt: string;
  completedAt?: string;
  totalDuration?: number;
  nicheAnalysis: NicheAnalysis | null;
  keywords: KeywordResult[];
  designPrompts: DesignPrompt[];
  generatedImages: GeneratedImage[];
  selectedImageIndex: number;
  selectedProducts: ProductSelection[];
  listings: ListingData[];
  publishQueue: PublishQueueItem[];
  status: "draft" | "running" | "completed" | "error";
}

export interface DesignSenseiState {
  // Current run state
  keyword: string;
  currentStep: number;
  stepStatuses: Record<number, StepStatus>;
  stepDurations: Record<number, number>;
  stepErrors: Record<number, string>;
  isRunning: boolean;

  // Step results
  nicheAnalysis: NicheAnalysis | null;
  keywords: KeywordResult[];
  designPrompts: DesignPrompt[];
  generatedImages: GeneratedImage[];
  selectedImageIndex: number;
  selectedProducts: ProductSelection[];
  listings: ListingData[];
  publishQueue: PublishQueueItem[];

  // Library
  projects: DesignSenseiProject[];

  // Actions
  setKeyword: (keyword: string) => void;
  setStep: (step: number) => void;
  setStepStatus: (step: number, status: StepStatus, error?: string) => void;
  setStepDuration: (step: number, ms: number) => void;
  setNicheAnalysis: (data: NicheAnalysis) => void;
  setKeywords: (data: KeywordResult[]) => void;
  setDesignPrompts: (data: DesignPrompt[]) => void;
  setGeneratedImages: (data: GeneratedImage[]) => void;
  setSelectedImageIndex: (index: number) => void;
  setSelectedProducts: (products: ProductSelection[]) => void;
  toggleProduct: (productId: number) => void;
  setListings: (data: ListingData[]) => void;
  setPublishQueue: (data: PublishQueueItem[]) => void;
  updatePublishItem: (index: number, updates: Partial<PublishQueueItem>) => void;
  setIsRunning: (running: boolean) => void;
  saveProject: () => string;
  loadProject: (id: string) => void;
  reset: () => void;
}

function generateId(): string {
  return `ds_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const initialState = {
  keyword: "",
  currentStep: 1,
  stepStatuses: {} as Record<number, StepStatus>,
  stepDurations: {} as Record<number, number>,
  stepErrors: {} as Record<number, string>,
  isRunning: false,
  nicheAnalysis: null as NicheAnalysis | null,
  keywords: [] as KeywordResult[],
  designPrompts: [] as DesignPrompt[],
  generatedImages: [] as GeneratedImage[],
  selectedImageIndex: 0,
  selectedProducts: [] as ProductSelection[],
  listings: [] as ListingData[],
  publishQueue: [] as PublishQueueItem[],
};

export const useDesignSenseiStore = create<DesignSenseiState>()(
  persist(
    (set, get) => ({
      ...initialState,
      projects: [],

      setKeyword: (keyword) => set({ keyword }),
      setStep: (step) => set({ currentStep: step }),

      setStepStatus: (step, status, error) =>
        set((s) => ({
          stepStatuses: { ...s.stepStatuses, [step]: status },
          stepErrors: error
            ? { ...s.stepErrors, [step]: error }
            : s.stepErrors,
        })),

      setStepDuration: (step, ms) =>
        set((s) => ({
          stepDurations: { ...s.stepDurations, [step]: ms },
        })),

      setNicheAnalysis: (data) => set({ nicheAnalysis: data }),
      setKeywords: (data) => set({ keywords: data }),
      setDesignPrompts: (data) => set({ designPrompts: data }),
      setGeneratedImages: (data) => set({ generatedImages: data }),
      setSelectedImageIndex: (index) => set({ selectedImageIndex: index }),

      setSelectedProducts: (products) => set({ selectedProducts: products }),
      toggleProduct: (productId) =>
        set((s) => ({
          selectedProducts: s.selectedProducts.map((p) =>
            p.productId === productId ? { ...p, enabled: !p.enabled } : p
          ),
        })),

      setListings: (data) => set({ listings: data }),
      setPublishQueue: (data) => set({ publishQueue: data }),
      updatePublishItem: (index, updates) =>
        set((s) => ({
          publishQueue: s.publishQueue.map((item, i) =>
            i === index ? { ...item, ...updates } : item
          ),
        })),

      setIsRunning: (running) => set({ isRunning: running }),

      saveProject: () => {
        const s = get();
        const id = generateId();
        const project: DesignSenseiProject = {
          id,
          keyword: s.keyword,
          createdAt: new Date().toISOString(),
          nicheAnalysis: s.nicheAnalysis,
          keywords: s.keywords,
          designPrompts: s.designPrompts,
          generatedImages: s.generatedImages,
          selectedImageIndex: s.selectedImageIndex,
          selectedProducts: s.selectedProducts,
          listings: s.listings,
          publishQueue: s.publishQueue,
          status: s.isRunning ? "running" : s.stepStatuses[8] === "done" ? "completed" : "draft",
        };
        set((prev) => ({ projects: [project, ...prev.projects].slice(0, 50) }));
        return id;
      },

      loadProject: (id) => {
        const project = get().projects.find((p) => p.id === id);
        if (!project) return;
        set({
          keyword: project.keyword,
          nicheAnalysis: project.nicheAnalysis,
          keywords: project.keywords,
          designPrompts: project.designPrompts,
          generatedImages: project.generatedImages,
          selectedImageIndex: project.selectedImageIndex,
          selectedProducts: project.selectedProducts,
          listings: project.listings,
          publishQueue: project.publishQueue,
          isRunning: false,
          currentStep: project.publishQueue.length > 0 ? 8 : 1,
          stepStatuses: {},
          stepDurations: {},
          stepErrors: {},
        });
      },

      reset: () => set({ ...initialState }),
    }),
    { name: "craftplan_design_sensei" }
  )
);
