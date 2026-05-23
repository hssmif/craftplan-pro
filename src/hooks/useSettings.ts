"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import React from "react";

// ── Settings interface ──
export interface CraftPlanSettings {
  // Notion
  notionToken: string;
  defaultParentPageId: string;
  autoPatchAfterGenerate: boolean;

  // Generation defaults
  defaultVariant: "minimal" | "dark" | "brown" | "pink" | "sage" | "pastel" | "mono";
  defaultComplexity: "simple" | "medium" | "advanced";
  defaultBuildMethod: "notion-api" | "ai-build" | "copy-prompts";
  autoGenerateEtsyListing: boolean;
  autoScoreQuality: boolean;
  testMode: boolean;

  // Etsy
  etsyShopName: string;
  etsyApiKey: string;
  currency: "USD" | "EUR" | "GBP";

  // Extension
  craftplanUrl: string;
  extensionId: string;

  // Printful (POD)
  printfulToken: string;
  printfulStoreId: string;
  defaultPodMarkupPercent: number;

  // Onboarding
  onboardingComplete: boolean;
}

export const DEFAULT_SETTINGS: CraftPlanSettings = {
  notionToken: "",
  defaultParentPageId: "",
  autoPatchAfterGenerate: true,
  defaultVariant: "minimal",
  defaultComplexity: "medium",
  defaultBuildMethod: "notion-api",
  autoGenerateEtsyListing: true,
  autoScoreQuality: true,
  testMode: false,
  etsyShopName: "",
  etsyApiKey: "",
  currency: "USD",
  craftplanUrl: "http://localhost:3461",
  extensionId: "",
  printfulToken: "",
  printfulStoreId: "",
  defaultPodMarkupPercent: 40,
  onboardingComplete: false,
};

const STORAGE_KEY = "craftplan_settings";

// ── Context ──
interface SettingsContextValue {
  settings: CraftPlanSettings;
  updateSettings: (partial: Partial<CraftPlanSettings>) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

// ── Provider ──
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<CraftPlanSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CraftPlanSettings> & { printifyToken?: string; printifyShopId?: string };
        // Migrate Printify → Printful settings
        if (parsed.printifyToken && !parsed.printfulToken) {
          parsed.printfulToken = parsed.printifyToken;
        }
        if (parsed.printifyShopId && !parsed.printfulStoreId) {
          parsed.printfulStoreId = parsed.printifyShopId;
        }
        delete parsed.printifyToken;
        delete parsed.printifyShopId;
        setSettings((prev) => ({ ...prev, ...parsed }));
      }
      // Also migrate existing notion_token if settings don't have it
      const legacyToken = localStorage.getItem("notion_token");
      if (legacyToken) {
        setSettings((prev) => {
          if (!prev.notionToken) {
            return { ...prev, notionToken: legacyToken };
          }
          return prev;
        });
      }
    } catch {
      // Ignore parse errors
    }
    setLoaded(true);
  }, []);

  // Save to localStorage on change (after initial load)
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      // Also keep legacy notion_token in sync for backward compatibility
      if (settings.notionToken) {
        localStorage.setItem("notion_token", settings.notionToken);
      }
    } catch {
      // Ignore storage errors
    }
  }, [settings, loaded]);

  const updateSettings = useCallback((partial: Partial<CraftPlanSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return React.createElement(
    SettingsContext.Provider,
    { value: { settings, updateSettings, resetSettings } },
    children
  );
}

// ── Hook ──
export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return ctx;
}
