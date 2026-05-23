// ─────────────────────────────────────────────────────────────────
// Per-session OpenAI cost tracker — sums every gpt-image-2 + gpt-4o-mini
// call the frontend makes so the seller can watch real-time spend
// without flipping over to the OpenAI dashboard.
//
// State lives in a module-level singleton with a subscribe/notify
// pattern so any React component can subscribe via the useCostTracker
// hook.  Persisted to localStorage so refresh keeps the running total.
//
// Costs are CLIENT-SIDE ESTIMATES based on per-route constants — the
// actual OpenAI bill includes per-token text inputs that we don't see.
// Real bill is usually within ±10% of the estimate; this widget exists
// for "did I just burn money?" peace-of-mind, not invoicing.
// ─────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";

const STORAGE_KEY = "openai-cost-session-v1";

export type ModelTag = "gpt-image-2" | "gpt-4o-mini" | "gpt-5-mini" | "gemini";

export interface CostEntry {
  ts: number;
  model: ModelTag;
  usd: number;
  label: string;
}

export interface CostState {
  totalUsd: number;
  byModel: Partial<Record<ModelTag, number>>;
  calls: CostEntry[];
  sessionStartedAt: number;
}

const EMPTY: CostState = {
  totalUsd: 0,
  byModel: {},
  calls: [],
  sessionStartedAt: Date.now(),
};

let state: CostState = EMPTY;
let listeners: Array<(s: CostState) => void> = [];

function load(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CostState;
      if (parsed && typeof parsed.totalUsd === "number") {
        state = parsed;
      }
    }
  } catch { /* ignore corrupt */ }
}
function save(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota / disabled */ }
}
function notify(): void {
  listeners.forEach((fn) => fn(state));
}

// Initialise on import (browser only).
if (typeof window !== "undefined") {
  load();
}

/** Append one billable call to the running session.  Caller passes
 *  an estimate (in USD) — we don't have access to real OpenAI billing
 *  here, so per-route constants suffice. */
export function recordCost(model: ModelTag, usd: number, label: string): void {
  state = {
    ...state,
    totalUsd: state.totalUsd + usd,
    byModel: {
      ...state.byModel,
      [model]: (state.byModel[model] || 0) + usd,
    },
    // Cap the call log at 200 entries so localStorage stays small.
    calls: [...state.calls, { ts: Date.now(), model, usd, label }].slice(-200),
  };
  save();
  notify();
}

export function getCostState(): CostState {
  return state;
}

export function resetCostSession(): void {
  state = { ...EMPTY, sessionStartedAt: Date.now() };
  save();
  notify();
}

/** React hook — re-renders on every recordCost / reset call. */
export function useCostTracker(): CostState {
  const [s, setS] = useState<CostState>(state);
  useEffect(() => {
    // Push current state on first mount so SSR-empty clients catch up.
    setS(state);
    const fn = (next: CostState) => setS(next);
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((l) => l !== fn);
    };
  }, []);
  return s;
}

// ─── Per-route cost constants ─────────────────────────────────────
// Mirror these values whenever pricing changes upstream.  Values come
// from OpenAI's published per-image / per-token rates.
export const COST = {
  // gpt-image-2 medium 1024×1024
  IMAGE_GEN_MEDIUM: 0.042,
  // gpt-image-2 medium edit (1 input image + new prompt)
  IMAGE_EDIT_MEDIUM: 0.042,
  // 4 gpt-image-2 mockup scenes (parallel, ~$0.07 each at hands-stitch detail)
  AUTO_MOCKUP_4: 0.28,
  // gpt-4o-mini vision with detail:"high" (~1500 input tokens incl. image
  // tiles + ~90 output tokens)
  VISION_HIGH: 0.005,
  // gpt-4o-mini chat round (avg ~2000 input + ~400 output)
  MINI_CHAT: 0.001,
} as const;
