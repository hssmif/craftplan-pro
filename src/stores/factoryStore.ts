// ══════════════════════════════════════════════════════════════
// Product Factory Store
// Zustand store for the /factory page UI state.
// Tracks active runs, scan results, completed products,
// and polls for live status during active runs.
// ══════════════════════════════════════════════════════════════

import { create } from "zustand";
import type {
  FactoryRun,
  FactoryRunInput,
  FactoryEngineLog,
  FactoryRunStatus,
  ScanResult,
  ReadyToListPackage,
} from "@/types/factory";

// ── Types ────────────────────────────────────────────────────

export interface FactoryRunView {
  id: string;
  status: FactoryRunStatus;
  projectId?: string | null;
  blueprintId?: string | null;
  keywords?: string[] | null;
  engineLog: FactoryEngineLog[];
  errorMessage?: string | null;
  packageAssetId?: string | null;
  etsyListingId?: number | null;
  etsyListingUrl?: string | null;
  etsyStatus?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  readyToList?: ReadyToListPackage | null;
}

export interface FactoryStoreState {
  // Run data
  runs: FactoryRunView[];
  activeRunId: string | null;
  activeRunStatus: FactoryRunView | null;

  // Scan results
  lastScan: ScanResult | null;

  // UI state
  isScanning: boolean;
  isRunning: boolean;
  error: string | null;

  // Polling
  pollInterval: ReturnType<typeof setInterval> | null;

  // Actions
  startRun: (input: FactoryRunInput) => Promise<string>;
  startBuildBest: (keyword: string) => Promise<string>;
  startBuildOpportunity: (opportunity: {
    title: string;
    tags?: string[];
    price?: number;
    reviews?: number;
    revenueEstimate?: number;
    niche?: string;
    // ── Deep-scan inputs (from /research → "Build This") ──
    listingId?: string;
    description?: string;
    /** Up to 8 url_fullxfull listing photos for Gemini Vision. */
    imageUrls?: string[];
    ideaContext?: {
      title?: string;
      whyNow?: string;
      targetBuyer?: string;
    };
    marketContext?: {
      competition?: number | null;
      avgFavorites?: number | null;
      evidenceCount?: number;
      topTags?: string[];
    };
  }) => Promise<string>;
  refreshRuns: () => Promise<void>;
  pollRunStatus: (runId: string) => Promise<void>;
  startPolling: (runId: string) => void;
  stopPolling: () => void;
  setActiveRun: (runId: string | null) => void;
  setScanResult: (result: ScanResult | null) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

// ── Terminal statuses (no more polling needed) ───────────────

const TERMINAL_STATUSES: FactoryRunStatus[] = [
  "completed",
  "ready_to_list",
  "failed",
  "cancelled",
];

// ── Store ────────────────────────────────────────────────────

export const useFactoryStore = create<FactoryStoreState>()((set, get) => ({
  runs: [],
  activeRunId: null,
  activeRunStatus: null,
  lastScan: null,
  isScanning: false,
  isRunning: false,
  error: null,
  pollInterval: null,

  // ── Start a generic factory run ──
  startRun: async (input) => {
    const { stopPolling } = get();
    stopPolling();
    set({ isRunning: true, error: null, activeRunStatus: null });

    try {
      const resp = await fetch("/api/factory/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Failed to start run" }));
        throw new Error(err.error || "Factory run failed");
      }

      const data = await resp.json();
      const runId = data.factoryRunId as string;

      // Build initial status view from response
      const initialView: FactoryRunView = {
        id: runId,
        status: data.status,
        projectId: data.projectId,
        blueprintId: data.blueprintId,
        engineLog: data.engineStatuses || [],
        readyToList: data.readyToList || null,
      };

      set({
        activeRunId: runId,
        activeRunStatus: initialView,
        isRunning: true, // Pipeline is still running in background
      });

      // Start polling for live engine status updates
      get().startPolling(runId);

      // Refresh runs list
      await get().refreshRuns();
      return runId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start factory run";
      set({ isRunning: false, error: msg });
      throw err;
    }
  },

  // ── Quick action: Build best from keyword ──
  startBuildBest: async (keyword) => {
    return get().startRun({
      mode: "single_best",
      keywords: [keyword],
      autoPickTop: true,
    });
  },

  // ── Quick action: Build from a specific opportunity ──
  startBuildOpportunity: async (opportunity) => {
    return get().startRun({
      mode: "selected_opportunity",
      keywords: [opportunity.niche || opportunity.title],
      opportunityData: opportunity,
    });
  },

  // ── Refresh all runs from API ──
  refreshRuns: async () => {
    try {
      const resp = await fetch("/api/factory/run");
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.runs) {
        set({ runs: data.runs as FactoryRunView[] });
      }
    } catch {
      // Silently fail
    }
  },

  // ── Poll a specific run's status ──
  pollRunStatus: async (runId) => {
    try {
      const resp = await fetch(`/api/factory/run?id=${runId}`);
      if (!resp.ok) return;
      const data = await resp.json();

      if (data.run) {
        const view: FactoryRunView = {
          id: data.run.id || runId,
          status: data.run.status,
          projectId: data.run.projectId || data.run.project_id,
          blueprintId: data.run.blueprintId || data.run.blueprint_id,
          keywords: data.run.keywords,
          engineLog: data.run.engineLog || [],
          errorMessage: data.run.errorMessage || data.run.error_message,
          packageAssetId: data.run.packageAssetId || data.run.package_asset_id,
          etsyListingId: data.run.etsyListingId || data.run.etsy_listing_id,
          etsyListingUrl: data.run.etsyListingUrl || data.run.etsy_listing_url,
          etsyStatus: data.run.etsyStatus || data.run.etsy_status,
          startedAt: data.run.startedAt || data.run.started_at,
          completedAt: data.run.completedAt || data.run.completed_at,
          readyToList: data.readyToList || null,
        };

        set({ activeRunStatus: view });

        // Stop polling if terminal
        if (TERMINAL_STATUSES.includes(view.status)) {
          set({ isRunning: false });
          get().stopPolling();
          // Refresh the full runs list too
          await get().refreshRuns();
        }
      }
    } catch {
      // Silently fail — next poll will retry
    }
  },

  // ── Start polling every 2s ──
  startPolling: (runId) => {
    const { stopPolling, pollRunStatus } = get();
    stopPolling(); // Clear any existing

    // Immediate first poll
    pollRunStatus(runId);

    const interval = setInterval(() => {
      pollRunStatus(runId);
    }, 2000);

    set({ pollInterval: interval, activeRunId: runId });
  },

  // ── Stop polling ──
  stopPolling: () => {
    const { pollInterval } = get();
    if (pollInterval) {
      clearInterval(pollInterval);
      set({ pollInterval: null });
    }
  },

  setActiveRun: (runId) => set({ activeRunId: runId }),
  setScanResult: (result) => set({ lastScan: result }),
  setError: (error) => set({ error }),

  reset: () => {
    get().stopPolling();
    set({
      runs: [],
      activeRunId: null,
      activeRunStatus: null,
      lastScan: null,
      isScanning: false,
      isRunning: false,
      error: null,
    });
  },
}));
