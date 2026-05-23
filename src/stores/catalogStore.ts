"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── Types ──

export interface QualityScoreData {
  overall: number;
  tier: string;
  tierEmoji: string;
  etsyPriceEstimate: { min: number; max: number };
  categories?: Array<{
    category: string;
    score: number;
    maxScore: number;
    items: Array<{ name: string; passed: boolean; weight: number }>;
  }>;
  strengths?: string[];
  improvements?: string[];
}

export interface EtsyListingData {
  title: string;
  description: string;
  tags: string[];
  price?: number;
  categories?: string[];
  faqs?: Array<{ question: string; answer: string }>;
}

export interface MockupBriefData {
  slots: Array<{
    slotNumber: number;
    sceneName: string;
    purpose: string;
    device: string;
    notionViewToCapture: string;
    screenshotInstructions: string;
    framingTip: string;
    overlayText?: string;
  }>;
  generalTips?: string[];
}

export interface CatalogItem {
  id: string;
  createdAt: string;
  productType: "notion" | "pdf" | "excel" | "printable";
  templateType: string;
  templateName: string;
  variantName: string;
  notionPageUrl?: string;
  notionPageId?: string;
  qualityScore: QualityScoreData | null;
  etsyListing: EtsyListingData | null;
  mockupBrief: MockupBriefData | null;
  status: "draft" | "mockups_needed" | "ready_to_list" | "listed" | "archived";
  etsyListingUrl?: string;
  revenue?: number;
  competitorSource?: string;
  tags: string[];
  notes: string;
  lastPatched?: string;
  fileName?: string;
  fileSize?: number;
  subType?: string; // e.g., "daily_planner", "budget_tracker", "quote_prints"
  colorScheme?: string;
}

// ── Store Interface ──

interface CatalogStore {
  items: CatalogItem[];
  addItem: (item: Omit<CatalogItem, "id" | "createdAt">) => string;
  updateItem: (id: string, updates: Partial<CatalogItem>) => void;
  removeItem: (id: string) => void;
  updateStatus: (id: string, status: CatalogItem["status"]) => void;
  updateRevenue: (id: string, revenue: number, url: string) => void;
  getByStatus: (status: CatalogItem["status"]) => CatalogItem[];
  getByProductType: (productType: CatalogItem["productType"]) => CatalogItem[];
  getTotalRevenue: () => number;
  getAvgQualityScore: () => number;
  clearAll: () => void;
}

// ── Unique ID Generator ──

function generateId(): string {
  return `cat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Store ──

export const useCatalogStore = create<CatalogStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        const id = generateId();
        const newItem: CatalogItem = {
          ...item,
          id,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ items: [newItem, ...state.items] }));
        return id;
      },

      updateItem: (id, updates) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          ),
        }));
      },

      removeItem: (id) => {
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        }));
      },

      updateStatus: (id, status) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, status } : item
          ),
        }));
      },

      updateRevenue: (id, revenue, url) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? { ...item, revenue, etsyListingUrl: url, status: "listed" as const }
              : item
          ),
        }));
      },

      getByStatus: (status) => {
        return get().items.filter((item) => item.status === status);
      },

      getByProductType: (productType) => {
        return get().items.filter((item) => item.productType === productType);
      },

      getTotalRevenue: () => {
        return get().items.reduce((sum, item) => sum + (item.revenue || 0), 0);
      },

      getAvgQualityScore: () => {
        const scored = get().items.filter((item) => item.qualityScore?.overall);
        if (scored.length === 0) return 0;
        const total = scored.reduce((sum, item) => sum + (item.qualityScore?.overall || 0), 0);
        return Math.round(total / scored.length);
      },

      clearAll: () => {
        set({ items: [] });
      },
    }),
    {
      name: "craftplan_catalog",
    }
  )
);
