"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useFactoryStore, type FactoryRunView } from "@/stores/factoryStore";
import { PublishReview } from "./PublishReview";
import type { FactoryEngineLog, ReadyToListPackage } from "@/types/factory";

// ── Engine Labels ────────────────────────────────────────────

const ENGINE_LABELS: Record<number, string> = {
  1: "Discover",
  2: "Strategize",
  3: "Build",
  4: "Capture",
  5: "Package",
};

const ENGINE_DESCRIPTIONS: Record<number, string> = {
  1: "Scanning Etsy market data",
  2: "Creating product blueprint",
  3: "Generating spreadsheet",
  4: "Rendering images + listing copy",
  5: "Bundling delivery package",
};

// ── Proven Quick Start Ideas ─────────────────────────────────

const QUICK_START_IDEAS = [
  { label: "Budget Tracker", keyword: "monthly budget tracker google sheets", icon: "chart" },
  { label: "Paycheck Budget", keyword: "paycheck budget planner spreadsheet", icon: "dollar" },
  { label: "Wedding Planner", keyword: "wedding planner spreadsheet google sheets", icon: "heart" },
  { label: "Travel Budget", keyword: "travel budget planner spreadsheet", icon: "plane" },
  { label: "Business P&L", keyword: "small business profit loss tracker google sheets", icon: "briefcase" },
  { label: "Fitness Tracker", keyword: "workout fitness tracker google sheets", icon: "activity" },
  { label: "Meal Planner", keyword: "weekly meal planner grocery list spreadsheet", icon: "grid" },
  { label: "Debt Payoff", keyword: "debt payoff tracker snowball avalanche spreadsheet", icon: "trending" },
  { label: "Savings Goals", keyword: "savings goal tracker google sheets", icon: "target" },
  { label: "Side Hustle P&L", keyword: "side hustle income expense tracker spreadsheet", icon: "zap" },
  { label: "Student Budget", keyword: "student budget planner google sheets", icon: "book" },
  { label: "Baby Budget", keyword: "baby budget planner new parents spreadsheet", icon: "star" },
];

const FACTORY_SEARCH_PRESETS = [
  { label: "Wedding Planner", keyword: "wedding planner spreadsheet guest list vendor tracker seating chart budget", family: "event" },
  { label: "Etsy Inventory", keyword: "etsy seller inventory tracker cogs materials stock reorder spreadsheet", family: "seller" },
  { label: "Teacher Gradebook", keyword: "teacher gradebook lesson planner attendance assignment tracker spreadsheet", family: "education" },
  { label: "Travel Itinerary", keyword: "travel itinerary planner budget packing list bookings spreadsheet", family: "travel" },
  { label: "Client CRM", keyword: "client crm project tracker pipeline task planner spreadsheet", family: "business" },
  { label: "Real Estate", keyword: "rental property tracker rent ledger roi cash flow spreadsheet", family: "property" },
  { label: "Content Calendar", keyword: "social media content calendar campaign tracker analytics spreadsheet", family: "creator" },
  { label: "Meal Planner", keyword: "meal planner grocery list recipe bank weekly budget spreadsheet", family: "home" },
];

const FACTORY_CAPABILITIES = [
  { label: "Market-backed research", detail: "Ideas, products, tags, and buyer intent flow into the same build queue." },
  { label: "Family-specific kits", detail: "Wedding, inventory, teacher, CRM, property, travel, creator, and home systems." },
  { label: "Review-ready assets", detail: "Workbook, preview, listing copy, mockups, video, and delivery package stay together." },
];

const FACTORY_PIPELINE = [
  { label: "Research", detail: "Validate demand" },
  { label: "Blueprint", detail: "Plan the product system" },
  { label: "Build", detail: "Generate files and assets" },
  { label: "Review", detail: "Approve before listing" },
];

// ── Niche Discovery Type ─────────────────────────────────────

interface NicheOpp {
  niche: string;
  listingCount: number;
  avgPrice: number;
  avgRevenue: number;
  avgScore: number;
  topListing: { title: string; price: number; revenue: number; reviews: number };
  recommendation: string;
  priority: "high" | "medium" | "low";
  buildKeyword: string;
}

// ── Research / Live Pulse Types ───────────────────────────────

interface PulseSpiking {
  term: string;
  sources: string[];
  context?: string;
  score: number;
}

interface PulseIdea {
  title: string;
  why_now: string;
  urgency: "hot" | "rising" | "seasonal" | "evergreen";
  atc_signal?: "hot" | "warm" | "cold";
  atc_reason?: string;
  tags: string[];
  search_query: string;
  reference_image_url?: string;
  reference_listing_url?: string;
}

interface PulseSeasonal {
  event: string;
  days_until: number | null;
  urgency: string;
  tags: string[];
  score: number;
}

interface LivePulseData {
  spiking: PulseSpiking[];
  ideas: PulseIdea[];
  seasonal: PulseSeasonal[];
  generated_at?: string;
}

interface AutocompleteItem {
  term: string;
  opportunity: "green" | "yellow" | "red";
  competition?: string;
  why?: string;
}

interface IdeaEngineItem {
  id: string;
  title: string;
  niche?: string;
  product_type?: string;
  why_now?: string;
  target_buyer?: string;
  suggested_price?: number;
  demand_score?: number;
  competition_score?: number;
  urgency_score?: number;
  confidence?: number;
  suggested_tags?: string[];
  suggested_keywords?: string[];
}

// ══════════════════════════════════════════════════════════════
// Research Panel Component
// ══════════════════════════════════════════════════════════════

const URGENCY_STYLES: Record<string, string> = {
  hot:       "bg-red-500/15 text-red-400 border border-red-500/20",
  rising:    "bg-amber-500/15 text-amber-400 border border-amber-500/20",
  seasonal:  "bg-violet-500/15 text-violet-400 border border-violet-500/20",
  evergreen: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
};

const OPP_DOT: Record<string, string> = {
  green:  "bg-emerald-400",
  yellow: "bg-amber-400",
  red:    "bg-red-400",
};

function ResearchPanel({
  onBuild,
  isRunning,
}: {
  onBuild: (keyword: string) => void;
  isRunning: boolean;
}) {
  const [pulse, setPulse] = useState<LivePulseData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [findingBestIdea, setFindingBestIdea] = useState(false);
  const [ideas, setIdeas] = useState<IdeaEngineItem[]>([]);
  const [generatingIdeas, setGeneratingIdeas] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());
  const [ideasError, setIdeasError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [autocomplete, setAutocomplete] = useState<AutocompleteItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    fetch("/api/factory/live-pulse")
      .then((r) => r.json())
      .then((data) => setPulse(data))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setAutocomplete([]);
      return;
    }

    const id = setTimeout(() => {
      setIsSearching(true);
      fetch(`/api/factory/autocomplete?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data) => setAutocomplete(data.items ?? []))
        .catch(() => setAutocomplete([]))
        .finally(() => setIsSearching(false));
    }, 300);

    return () => clearTimeout(id);
  }, [query]);

  const submitQuery = useCallback(async (keyword?: string) => {
    const next = (keyword || query).trim();
    if (!next || isRunning) return;
    setQuery(next);
    setAutocomplete([]);
    await onBuild(next);
  }, [query, isRunning, onBuild]);

  const findBestIdea = useCallback(async () => {
    if (isRunning || findingBestIdea) return;
    setFindingBestIdea(true);
    try {
      const topSpiking = pulse?.spiking?.[0];
      const topIdea = pulse?.ideas?.[0];
      const keyword = topSpiking
        ? topSpiking.term
        : topIdea?.search_query || topIdea?.title || "";
      if (keyword) await onBuild(keyword);
    } finally {
      setFindingBestIdea(false);
    }
  }, [pulse, isRunning, findingBestIdea, onBuild]);

  const generateIdeas = useCallback(async () => {
    if (generatingIdeas) return;
    setGeneratingIdeas(true);
    setIdeasError(null);
    try {
      const resp = await fetch("/api/research/ideas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focus: "spreadsheet", count: 6 }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setIdeasError(data.error || "Failed to generate ideas");
        return;
      }
      if (data.ideas?.length) {
        setIdeas((prev) => {
          // Prepend new ideas, normalizing suggested_tags from JSON string if needed
          const normalized = (data.ideas as Array<IdeaEngineItem & { suggested_tags?: unknown }>).map((idea) => {
            let tags = idea.suggested_tags;
            if (typeof tags === "string") {
              try { tags = JSON.parse(tags); } catch { tags = []; }
            }
            return { ...idea, suggested_tags: Array.isArray(tags) ? (tags as string[]) : [] } as IdeaEngineItem;
          });
          return [...normalized, ...prev];
        });
      }
    } catch {
      setIdeasError("Network error generating ideas");
    } finally {
      setGeneratingIdeas(false);
    }
  }, [generatingIdeas]);

  const visibleIdeas = ideas.filter((idea) => !dismissedIds.has(idea.id));

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[22px] border border-orange-300/25 bg-[#17110d] shadow-[0_24px_90px_rgba(0,0,0,0.28)]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)]">
          <div className="space-y-4">
            <div className="p-5 sm:p-6">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-200/80">
                Product family intake
              </div>
              <h2 className="mt-2 max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-white">
                Start with the buyer, then build a full product kit.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">
                Use a specific niche like wedding planning, inventory, teacher gradebooks, client CRM,
                real estate, travel, or content calendars. The factory should choose the right structure,
                assets, and listing package for that product family.
              </p>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submitQuery();
              }}
              className="relative px-5 pb-5 sm:px-6 sm:pb-6"
            >
              <div className="flex flex-col gap-2 rounded-2xl border border-white/[0.10] bg-black/24 p-2 focus-within:border-orange-300/45 focus-within:ring-2 focus-within:ring-orange-500/10 sm:flex-row">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Try: wedding planner spreadsheet guest list vendor tracker"
                  className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isRunning || !query.trim()}
                  className="rounded-xl bg-orange-500 px-6 py-3 text-xs font-bold text-white shadow-[0_14px_35px_rgba(241,100,30,0.25)] transition-colors hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Build kit
                </button>
              </div>

              {(isSearching || autocomplete.length > 0) && (
                <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-xl border border-white/[0.10] bg-[#15110f] shadow-2xl shadow-black/40">
                  {isSearching && (
                    <div className="px-3 py-2 text-xs text-white/40">Checking live suggestions...</div>
                  )}
                  {!isSearching && autocomplete.slice(0, 6).map((item) => (
                    <button
                      key={item.term}
                      type="button"
                      onClick={() => void submitQuery(item.term)}
                      className="flex w-full items-center justify-between gap-3 border-t border-white/[0.05] px-3 py-2.5 text-left text-sm text-white/75 transition-colors first:border-t-0 hover:bg-white/[0.06] hover:text-white"
                    >
                      <span className="truncate">{item.term}</span>
                      <span className="flex shrink-0 items-center gap-1 text-[10px] text-white/35">
                        <span className={`h-2 w-2 rounded-full ${OPP_DOT[item.opportunity]}`} />
                        {item.competition || item.opportunity}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </form>
          </div>

          <div className="border-t border-white/[0.08] bg-white/[0.035] p-4 lg:border-l lg:border-t-0">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">Product families</span>
              <span className="text-[10px] text-emerald-300/70">system-aware</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {FACTORY_SEARCH_PRESETS.map((preset) => (
                <button
                  key={preset.keyword}
                  onClick={() => void submitQuery(preset.keyword)}
                  disabled={isRunning}
                  className="rounded-xl border border-white/[0.08] bg-black/22 px-3 py-3 text-left transition-all hover:border-orange-300/45 hover:bg-orange-500/[0.08] disabled:opacity-35"
                >
                  <div className="text-xs font-semibold text-white">{preset.label}</div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wide text-white/30">{preset.family}</div>
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-white/[0.08] bg-[#f6eadb] p-4 text-[#1d1510]">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8a6d55]">Factory rule</p>
              <p className="mt-2 text-sm font-semibold leading-5">
                Different product families need different structure, page rhythm, dashboards, labels, and listing angles.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          LIVE PULSE CARD
      ════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-[var(--border-default)] bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-base)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <span className="inline-flex w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Pulse
              <span className="text-[10px] font-normal text-[var(--text-muted)] ml-1">real-time across Google · Pinterest · Reddit</span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Live keyword signals. Use these for inspiration, or search your own product above.</div>
          </div>
          <button
            onClick={findBestIdea}
            disabled={findingBestIdea || isLoading}
            className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-lg shadow-purple-500/20"
          >
            {findingBestIdea ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing…
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l3.5 3.5L5 10l3.5 3.5L5 17m7-14l3.5 3.5L12 10l3.5 3.5L12 17m7-14l3.5 3.5L19 10l3.5 3.5L19 17" />
                </svg>
                Find THE best idea
              </>
            )}
          </button>
        </div>

        {/* Skeleton loader */}
        {isLoading && (
          <div className="space-y-4 animate-pulse">
            <div className="flex gap-2 overflow-hidden">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex-shrink-0 w-52 h-[70px] rounded-lg bg-white/5" />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-[110px] rounded-lg bg-white/5" />
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-[80px] rounded-lg bg-white/5" />
              ))}
            </div>
          </div>
        )}

        {!isLoading && pulse && (
          <>
            {/* Row 1: 🔥 Spiking Now */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2 flex items-center gap-1.5">
                <span>🔥</span>
                <span>Spiking Now</span>
                {pulse.spiking.length > 0 && (
                  <span className="text-[9px] text-emerald-400">· {pulse.spiking.length} trending</span>
                )}
              </div>
              {pulse.spiking.length > 0 ? (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
                  {pulse.spiking.slice(0, 5).map((s, i) => (
                    <button
                      key={i}
                      onClick={() => !isRunning && onBuild(s.term)}
                      disabled={isRunning}
                      className="min-w-0 text-left p-3 rounded-lg border transition-all group bg-[var(--bg-base)] border-[var(--border-default)] hover:border-orange-500/40 hover:bg-orange-500/5 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="text-[12px] font-semibold leading-snug line-clamp-2 text-[var(--text-primary)] group-hover:text-orange-300 transition-colors">
                          {s.term}
                        </div>
                        <div className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          s.score > 70 ? "bg-red-500/20 text-red-300" : s.score > 45 ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"
                        }`}>
                          {s.score > 70 ? "HOT" : s.score > 45 ? "RISING" : "WARM"}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {[...new Set(s.sources)].slice(0, 3).map((src, j) => (
                          <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-[var(--text-muted)]">{src}</span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-[var(--text-muted)] italic">No live spiking data right now.</div>
              )}
            </div>

            {/* Row 2: 💡 AI Opportunities */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2 flex items-center gap-1.5">
                <span>💡</span>
                <span>AI Opportunities</span>
                <span className="text-[9px] text-purple-400">· live signal synthesis</span>
              </div>
              {pulse.ideas.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {pulse.ideas.map((idea, i) => {
                    const uColor = idea.urgency === "hot"
                      ? "bg-red-500/20 text-red-300 border-red-500/30"
                      : idea.urgency === "rising"
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                        : idea.urgency === "seasonal"
                          ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
                          : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
                    const q = idea.search_query || idea.title;
                    return (
                      <div
                        key={i}
                        className="rounded-lg border transition-all overflow-hidden bg-[var(--bg-base)] border-[var(--border-default)] hover:border-purple-500/40 hover:bg-purple-500/5"
                      >
                        {idea.reference_image_url && (
                          <a
                            href={idea.reference_listing_url || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block relative bg-white/5 border-b border-[var(--border-default)] group"
                            title="View this listing on Etsy (opens in new tab)"
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={idea.reference_image_url}
                              alt={`Etsy example of ${idea.title}`}
                              loading="lazy"
                              className="w-full h-[90px] object-cover group-hover:opacity-90 transition-opacity"
                            />
                            <div className="absolute bottom-0 right-0 text-[8px] font-bold uppercase tracking-wider bg-black/60 text-white/85 px-1.5 py-0.5 rounded-tl">
                              Live on Etsy
                            </div>
                          </a>
                        )}
                        <div className="p-3 space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-[12px] font-semibold leading-snug line-clamp-2 text-[var(--text-primary)]">{idea.title}</div>
                            <div className="flex-shrink-0 flex flex-col items-end gap-1">
                              <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${uColor}`}>
                                {idea.urgency}
                              </div>
                              {idea.atc_signal && (
                                <div
                                  title={idea.atc_reason || "Estimated Add-to-Cart velocity"}
                                  className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide flex items-center gap-0.5 ${
                                    idea.atc_signal === "hot"
                                      ? "bg-red-500/25 text-red-300 border border-red-500/40"
                                      : idea.atc_signal === "warm"
                                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                      : "bg-slate-500/15 text-slate-400 border border-slate-500/25"
                                  }`}
                                >
                                  🛒 {idea.atc_signal === "hot" ? "20+" : idea.atc_signal === "warm" ? "5-19" : "<5"} ATC
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] line-clamp-2">{idea.why_now}</div>
                          {idea.tags?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {idea.tags.slice(0, 3).map((t, j) => (
                                <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-[var(--text-muted)]">{t}</span>
                              ))}
                            </div>
                          )}
                          <button
                            onClick={(ev) => {
                              ev.preventDefault();
                              if (isRunning) return;
                              onBuild(q);
                            }}
                            disabled={isRunning}
                            className="w-full mt-1 text-[10px] font-semibold py-1.5 rounded transition-colors flex items-center justify-center gap-1 text-purple-300 hover:text-purple-200 bg-purple-500/10 hover:bg-purple-500/20 disabled:opacity-40"
                          >
                            Build this
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[11px] text-[var(--text-muted)] italic">Ideas will appear once live signals load.</div>
              )}
            </div>

            {/* Row 3: 📅 Seasonal Countdown */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2 flex items-center gap-1.5">
                <span>📅</span>
                <span>Seasonal Countdown</span>
                <span className="text-[9px] text-sky-400">· time-sensitive</span>
              </div>
              {pulse.seasonal.length > 0 ? (
                <div className="grid grid-cols-4 gap-2">
                  {pulse.seasonal.map((ev, i) => {
                    const urgent = ev.days_until != null && ev.days_until <= 14;
                    const seasonalQ = `${ev.event} spreadsheet google sheets`;
                    return (
                      <button
                        key={i}
                        onClick={(e) => {
                          e.preventDefault();
                          if (isRunning) return;
                          onBuild(seasonalQ);
                        }}
                        disabled={isRunning}
                        className={`text-left p-3 rounded-lg border transition-all ${
                          urgent
                            ? "bg-red-500/5 border-red-500/30 hover:bg-red-500/10 hover:border-red-500/50 disabled:opacity-40 disabled:cursor-not-allowed"
                            : "bg-[var(--bg-base)] border-[var(--border-default)] hover:border-sky-500/40 hover:bg-sky-500/5 disabled:opacity-40 disabled:cursor-not-allowed"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="text-[11px] font-semibold text-[var(--text-primary)] line-clamp-1 truncate">
                            {ev.event}
                          </div>
                          {urgent && <div className="text-[9px] text-red-300 flex-shrink-0">🔔</div>}
                        </div>
                        <div className={`text-[10px] font-bold ${urgent ? "text-red-300" : "text-sky-300"}`}>
                          {ev.days_until != null ? `${ev.days_until} days` : ev.urgency}
                        </div>
                        {ev.tags?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {ev.tags.slice(0, 2).map((t, j) => (
                              <span key={j} className="text-[9px] px-1 py-0.5 rounded bg-white/5 text-[var(--text-muted)] line-clamp-1">{t}</span>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[11px] text-[var(--text-muted)] italic">No upcoming events within the 45-day window.</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ════════════════════════════════════════════
          IDEA ENGINE CARD
      ════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-[var(--border-default)] bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-base)] p-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <span>📊</span>
              Spreadsheet Idea Engine
              <span className="text-[10px] font-normal text-[var(--text-muted)] ml-1">scored ideas grounded in your live signals</span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Each idea is a complete spreadsheet brief — demand / competition / urgency scores, suggested price, and SEO tags. Click an idea to build it immediately.
            </div>
          </div>
          <button
            onClick={generateIdeas}
            disabled={generatingIdeas}
            className="flex-shrink-0 px-4 py-2 rounded-lg text-[12px] font-semibold text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {generatingIdeas ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating…
              </>
            ) : (
              <>+ Generate 6 ideas</>
            )}
          </button>
        </div>

        {ideasError && (
          <div className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded px-3 py-2 mb-3">
            {ideasError}
          </div>
        )}

        {visibleIdeas.length === 0 ? (
          <div className="text-[11px] text-[var(--text-muted)] italic py-4 text-center">
            Click Generate to get 6 scored spreadsheet ideas based on what&apos;s actually selling now
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {visibleIdeas.map((idea) => {
              const isFavorited = favoritedIds.has(idea.id);
              const tags = Array.isArray(idea.suggested_tags) ? idea.suggested_tags : [];
              return (
                <div
                  key={idea.id}
                  className={`rounded-xl border p-4 transition-colors ${
                    isFavorited
                      ? "bg-amber-500/5 border-amber-500/30"
                      : "bg-[var(--bg-base)] border-[var(--border-default)] hover:border-indigo-500/30"
                  }`}
                >
                  {/* Title + price */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="text-[13px] font-semibold leading-snug text-[var(--text-primary)]">{idea.title}</h4>
                    {idea.suggested_price != null && idea.suggested_price > 0 && (
                      <span className="flex-shrink-0 text-[11px] font-semibold text-emerald-400">${idea.suggested_price.toFixed(2)}</span>
                    )}
                  </div>

                  {/* Category tags */}
                  {(idea.niche || idea.product_type) && (
                    <div className="flex gap-1.5 mb-2">
                      {idea.niche && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.06] text-white/50">{idea.niche}</span>
                      )}
                      {idea.product_type && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.06] text-white/50">{idea.product_type}</span>
                      )}
                    </div>
                  )}

                  {/* Score grid */}
                  <div className="grid grid-cols-4 gap-1.5 mb-2">
                    {[
                      { label: "DEM", v: idea.demand_score ?? 0, positive: true },
                      { label: "URG", v: idea.urgency_score ?? 0, positive: true },
                      { label: "COMP", v: idea.competition_score ?? 0, positive: false },
                      { label: "CONF", v: idea.confidence ?? 0, positive: true },
                    ].map((m) => {
                      const eff = m.positive ? m.v : 100 - m.v;
                      const cls = eff >= 70
                        ? "text-orange-400 bg-orange-500/10"
                        : eff >= 40
                          ? "text-amber-400 bg-amber-500/10"
                          : "text-red-400 bg-red-500/10";
                      const compCls = m.label === "COMP"
                        ? (m.v <= 30 ? "text-emerald-400 bg-emerald-500/10" : m.v <= 60 ? "text-amber-400 bg-amber-500/10" : "text-red-400 bg-red-500/10")
                        : cls;
                      return (
                        <div key={m.label} className={`rounded px-1.5 py-1 ${m.label === "COMP" ? compCls : cls}`}>
                          <div className="text-[8px] uppercase tracking-wide opacity-80">{m.label}</div>
                          <div className="text-[11px] font-bold">{m.v}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Why now */}
                  {idea.why_now && (
                    <p className="text-xs text-white/60 leading-snug line-clamp-3 mb-2">{idea.why_now}</p>
                  )}

                  {/* Tags */}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {tags.slice(0, 4).map((t, j) => (
                        <span key={j} className="text-[10px] px-2 py-0.5 rounded bg-white/[0.06] text-white/50">{t}</span>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-1.5 pt-2 border-t border-white/[0.06]">
                    <button
                      onClick={() => !isRunning && onBuild(idea.title)}
                      disabled={isRunning}
                      className="flex-1 px-2 py-1.5 text-[10px] font-medium rounded transition-colors bg-[var(--bg-elevated)] border border-white/[0.08] text-amber-300 hover:bg-white/[0.08] disabled:opacity-40"
                    >
                      Build with this idea
                    </button>
                    <button
                      onClick={() => setFavoritedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(idea.id)) next.delete(idea.id);
                        else next.add(idea.id);
                        return next;
                      })}
                      className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                        isFavorited
                          ? "bg-amber-500/25 text-amber-300"
                          : "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                      }`}
                      title={isFavorited ? "Unfavorite" : "Favorite"}
                    >
                      ★
                    </button>
                    <button
                      onClick={() => setDismissedIds((prev) => { const next = new Set(prev); next.add(idea.id); return next; })}
                      className="px-2 py-1 text-[10px] font-medium rounded bg-white/[0.04] text-[var(--text-muted)] hover:bg-white/[0.08] transition-colors"
                      title="Dismiss"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Engine Status (progress indicator for each pipeline phase)
// ══════════════════════════════════════════════════════════════

function EngineStatus({ log, isActive }: { log: FactoryEngineLog; isActive?: boolean }) {
  const statusColors: Record<string, string> = {
    pending: "text-white/20",
    running: "text-indigo-400",
    done: "text-emerald-400",
    error: "text-red-400",
    skipped: "text-white/15",
  };

  return (
    <div className={`flex items-center gap-3 py-2.5 px-3 rounded-lg transition-all ${
      log.status === "running" ? "bg-indigo-500/[0.06] border border-indigo-500/20" :
      log.status === "done" ? "bg-emerald-500/[0.04]" :
      log.status === "error" ? "bg-red-500/[0.04]" :
      ""
    }`}>
      {/* Status icon */}
      <div className={`flex-shrink-0 ${statusColors[log.status]}`}>
        {log.status === "running" ? (
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : log.status === "done" ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : log.status === "error" ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <div className="w-5 h-5 flex items-center justify-center">
            <div className={`w-2.5 h-2.5 rounded-full ${log.status === "skipped" ? "bg-white/10" : "bg-white/15 border border-white/20"}`} />
          </div>
        )}
      </div>

      {/* Engine info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${
            log.status === "running" ? "text-indigo-300" :
            log.status === "done" ? "text-emerald-300/90" :
            log.status === "error" ? "text-red-300/90" :
            "text-white/30"
          }`}>
            {log.name}
          </span>
          {log.status === "running" && (
            log.engine === 3 ? (
              <span className="text-[10px] font-semibold bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent animate-pulse">
                ⚡ Building premium spreadsheet kit…
              </span>
            ) : (
              <span className="text-[10px] text-indigo-400/60 animate-pulse">
                {ENGINE_DESCRIPTIONS[log.engine] || "Processing..."}
              </span>
            )
          )}
          {log.status === "done" && log.engine === 3 && (log.output as Record<string, unknown>)?.builderPath === "coded-spreadsheet-renderer" && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-emerald-500/20 border border-amber-500/25 text-amber-200">
              ⚙ Coded Kit
            </span>
          )}
          {log.status === "done" && log.engine === 3 && (log.output as Record<string, unknown>)?.builderPath === "openai-spec-renderer" && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-emerald-500/20 to-sky-500/20 border border-emerald-500/25 text-emerald-300">
              ⚡ OpenAI
            </span>
          )}
          {log.status === "done" && log.engine === 3 && (log.output as Record<string, unknown>)?.builderPath === "gemini-exceljs" && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-blue-500/20 to-violet-500/20 border border-blue-500/25 text-blue-300">
              ⚡ Gemini
            </span>
          )}
        </div>
        {log.error && (
          <p className="text-[10px] text-red-400/70 mt-0.5 truncate">{log.error}</p>
        )}
      </div>

      {/* Duration */}
      {log.durationMs != null && log.status === "done" && (
        <span className="text-[10px] text-white/20 flex-shrink-0 tabular-nums">
          {(log.durationMs / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Pipeline Progress Card (shows during active run)
// ══════════════════════════════════════════════════════════════

function PipelineProgress({ run }: { run: FactoryRunView }) {
  const engines = run.engineLog || [];
  const doneCount = engines.filter((e) => e.status === "done").length;
  const errorCount = engines.filter((e) => e.status === "error").length;
  const totalEngines = engines.length || 5;
  const progress = (doneCount / totalEngines) * 100;
  const isTerminal = ["completed", "ready_to_list", "failed", "cancelled"].includes(run.status);
  const isSuccess = run.status === "completed" || run.status === "ready_to_list";

  return (
    <div className="p-6 bg-white/[0.02] border border-white/[0.08] rounded-xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {!isTerminal ? (
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : isSuccess ? (
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold text-white">
              {!isTerminal ? "Factory Running..." :
               run.status === "ready_to_list" ? "Ready to List!" :
               run.status === "completed" ? "Completed" :
               "Run Failed"}
            </h3>
            <p className="text-[10px] text-white/30 font-mono">{run.id}</p>
          </div>
        </div>
        <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ${
          run.status === "ready_to_list" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" :
          run.status === "completed" ? "bg-emerald-500/10 text-emerald-400/80" :
          run.status === "failed" ? "bg-red-500/10 text-red-400" :
          "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
        }`}>
          {run.status.replace(/_/g, " ")}
        </span>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] text-white/30">
          <span>{doneCount}/{totalEngines} engines complete</span>
          {errorCount > 0 && <span className="text-red-400/60">{errorCount} error{errorCount > 1 ? "s" : ""}</span>}
        </div>
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              isSuccess ? "bg-emerald-500" :
              run.status === "failed" ? "bg-red-500" :
              "bg-gradient-to-r from-indigo-500 to-violet-500"
            }`}
            style={{ width: `${isTerminal ? (isSuccess ? 100 : progress) : progress}%` }}
          />
        </div>
      </div>

      {/* Engine list */}
      <div className="space-y-1">
        {engines.map((eng) => (
          <EngineStatus key={eng.engine} log={eng} />
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Ready-to-List Summary Card
// ══════════════════════════════════════════════════════════════

function ReadyToListCard({ run, onPublish }: { run: FactoryRunView; onPublish?: (runId: string) => void }) {
  const rtl = run.readyToList;
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "video" | "images" | "copy">("preview");

  // ── Push-to-Sheets (live Google Sheets edit URL) ──
  const [pushingVariant, setPushingVariant] = useState<string | null>(null);
  const [sheetUrls, setSheetUrls] = useState<Record<string, string>>({});
  const [pushError, setPushError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [pendingPush, setPendingPush] = useState<{ assetId: string; key: string } | null>(null);

  // Listen for the OAuth popup's success message and retry the pending push
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.data?.type === "gws-auth-success") {
        setNeedsAuth(false);
        setPushError(null);
        if (pendingPush) {
          const { assetId, key } = pendingPush;
          setPendingPush(null);
          // Slight delay so the new tokens settle on disk
          setTimeout(() => handlePushToSheets(assetId, key), 800);
        }
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPush]);

  const handleConnectGoogle = (retry?: { assetId: string; key: string }) => {
    if (retry) setPendingPush(retry);
    // Open in popup so we can postMessage when done
    const w = 540;
    const h = 700;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    window.open(
      "/api/factory/google-auth?action=start",
      "google-auth",
      `width=${w},height=${h},left=${left},top=${top},toolbar=0,menubar=0`
    );
  };

  const handlePushToSheets = async (assetId: string, key: string) => {
    if (!assetId || pushingVariant) return;
    setPushError(null);
    setPushingVariant(key);
    try {
      const resp = await fetch("/api/factory/push-to-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId }),
      });
      const data = await resp.json();
      if (resp.status === 401 || /token expired|revoked|invalid_grant/i.test(data.error || "")) {
        // Auto-trigger reconnect flow with retry
        setNeedsAuth(true);
        setPushError(null);
        handleConnectGoogle({ assetId, key });
        return;
      }
      if (!resp.ok || !data.editUrl) {
        setPushError(data.error || "Failed to open in Google Sheets");
        return;
      }
      setSheetUrls((prev) => ({ ...prev, [key]: data.editUrl }));
      // Open in new tab immediately
      window.open(data.editUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPushingVariant(null);
    }
  };

  if (!rtl) return null;

  const hasProduct = !!rtl.productAsset;
  const hasImages = (rtl.listingImages?.length ?? 0) > 0;
  const hasCopy = !!rtl.listingCopy;
  const hasPackage = !!rtl.packageAsset;
  const hasPreview = !!rtl.previewUrl;
  const hasVideo = !!rtl.videoUrl;

  return (
    <div className="bg-gradient-to-br from-emerald-500/[0.06] to-indigo-500/[0.04] border border-emerald-500/20 rounded-xl overflow-hidden">
      {/* ── Header ── */}
      <div className="p-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-white truncate">
                {hasCopy && rtl.listingCopy?.title
                  ? rtl.listingCopy.title.slice(0, 70) + (rtl.listingCopy.title.length > 70 ? "..." : "")
                  : "Product Ready"}
              </h3>
              {rtl.builderPath === "openai-spec-renderer" && (
                <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-emerald-500/20 to-sky-500/20 border border-emerald-500/30 text-emerald-300">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm4.24 16L12 15.45 7.77 18l1.12-4.81-3.73-3.23 4.92-.42L12 5l1.92 4.53 4.92.42-3.73 3.23L16.23 18z"/>
                  </svg>
                  Built with OpenAI
                  {rtl.tabCount ? ` \u00B7 ${rtl.tabCount} tabs` : ""}
                </span>
              )}
              {rtl.builderPath === "coded-spreadsheet-renderer" && (
                <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-amber-500/20 to-emerald-500/20 border border-amber-500/30 text-amber-200">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.37-.31-.6-.22l-2.49 1a7.28 7.28 0 0 0-1.69-.98L14.5 2.42A.49.49 0 0 0 14 2h-4c-.25 0-.46.18-.5.42L9.12 5.07c-.61.24-1.18.56-1.69.98l-2.49-1a.49.49 0 0 0-.6.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65c-.04.32-.08.65-.08.98s.03.66.08.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46c.12.22.37.31.6.22l2.49-1c.51.4 1.08.73 1.69.98l.38 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.38-2.65c.61-.25 1.18-.58 1.69-.98l2.49 1c.23.08.48 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z"/>
                  </svg>
                  Coded Premium Kit
                  {rtl.tabCount ? ` \u00B7 ${rtl.tabCount} tabs` : ""}
                </span>
              )}
              {rtl.builderPath === "gemini-exceljs" && (
                <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-blue-500/20 to-violet-500/20 border border-blue-500/30 text-blue-300">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm4.24 16L12 15.45 7.77 18l1.12-4.81-3.73-3.23 4.92-.42L12 5l1.92 4.53 4.92.42-3.73 3.23L16.23 18z"/>
                  </svg>
                  Built with Gemini
                  {rtl.tabCount ? ` \u00B7 ${rtl.tabCount} tabs` : ""}
                </span>
              )}
            </div>
            <p className="text-xs text-emerald-400/70">
              Review your product below, then send to Etsy
              {rtl.suggestedPrice ? ` \u00B7 $${rtl.suggestedPrice.toFixed(2)}` : ""}
            </p>
          </div>
          {/* Open in Google Sheets (primary) or Download Template (fallback) */}
          {rtl.googleSheetUrl ? (
            <a
              href={rtl.googleSheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/30 rounded-lg transition-all flex-shrink-0"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14.727 6.727H14V0H4.91c-.905 0-1.637.732-1.637 1.636v20.728c0 .904.732 1.636 1.636 1.636h14.182c.904 0 1.636-.732 1.636-1.636V6.727h-6.727zM7.091 3.273h5.454v1.09H7.091v-1.09zm9.818 18.545H7.091v-1.09h9.818v1.09zm0-3.273H7.091v-1.09h9.818v1.09zm0-3.272H7.091v-1.091h9.818v1.09zm0-3.273H7.091V11h9.818v1zm.545-5.454V1.09l5.455 5.455h-5.455z" />
              </svg>
              Open in Google Sheets
            </a>
          ) : hasProduct && rtl.productAsset?.downloadUrl ? (
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Open in Google Sheets — pushes the xlsx to Drive as a native Sheet */}
              {rtl.productAsset.assetId && (
                sheetUrls.primary ? (
                  <a
                    href={sheetUrls.primary}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded-lg transition-all shadow-lg shadow-emerald-500/20"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14.727 6.727H14V0H4.91c-.905 0-1.637.732-1.637 1.636v20.728c0 .904.732 1.636 1.636 1.636h14.182c.904 0 1.636-.732 1.636-1.636V6.727h-6.727zM7.091 3.273h5.454v1.09H7.091v-1.09zm9.818 18.545H7.091v-1.09h9.818v1.09zm0-3.273H7.091v-1.09h9.818v1.09zm0-3.272H7.091v-1.091h9.818v1.09zm0-3.273H7.091V11h9.818v1zm.545-5.454V1.09l5.455 5.455h-5.455z"/>
                    </svg>
                    Open in Google Sheets ↗
                  </a>
                ) : (
                  <button
                    onClick={() => handlePushToSheets(rtl.productAsset!.assetId, "primary")}
                    disabled={!!pushingVariant}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 rounded-lg transition-all shadow-lg shadow-emerald-500/20"
                  >
                    {pushingVariant === "primary" ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Uploading…
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M14.727 6.727H14V0H4.91c-.905 0-1.637.732-1.637 1.636v20.728c0 .904.732 1.636 1.636 1.636h14.182c.904 0 1.636-.732 1.636-1.636V6.727h-6.727zM7.091 3.273h5.454v1.09H7.091v-1.09zm9.818 18.545H7.091v-1.09h9.818v1.09zm0-3.273H7.091v-1.09h9.818v1.09zm0-3.272H7.091v-1.091h9.818v1.09zm0-3.273H7.091V11h9.818v1zm.545-5.454V1.09l5.455 5.455h-5.455z"/>
                        </svg>
                        Open in Google Sheets
                      </>
                    )}
                  </button>
                )
              )}

              {/* Download .xlsx fallback */}
              <a
                href={rtl.productAsset.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/30 rounded-lg transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                .xlsx
              </a>
            </div>
          ) : null}
        </div>

        {/* Push error / auth prompt banner */}
        {needsAuth && (
          <div className="mx-6 mb-3 px-4 py-3 bg-blue-500/[0.08] border border-blue-500/30 rounded-lg flex items-center gap-3">
            <svg className="w-5 h-5 text-blue-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-blue-200">Reconnect Google to use Open in Sheets</p>
              <p className="text-[11px] text-white/50">Your access token expired. One click will refresh it — no terminal needed.</p>
            </div>
            <button
              onClick={() => handleConnectGoogle(pendingPush ?? undefined)}
              className="flex-shrink-0 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 rounded-lg transition-colors"
            >
              Connect Google
            </button>
          </div>
        )}
        {pushError && !needsAuth && (
          <div className="mx-6 mb-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center justify-between">
            <p className="text-xs text-red-400">{pushError}</p>
            <button onClick={() => setPushError(null)} className="text-red-400/40 hover:text-red-400 text-xs">dismiss</button>
          </div>
        )}
      </div>

      {/* ── Multi-palette variants (Etsy SKU multiplier) ── */}
      {rtl.variants && rtl.variants.length > 1 && (
        <div className="px-6 pb-2">
          <div className="rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/[0.04] via-violet-500/[0.03] to-transparent p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-bold text-blue-300 uppercase tracking-wider">⚡ {rtl.variants.length} Aesthetic Variants</span>
              <span className="text-[10px] text-white/40">— each is a separate Etsy SKU</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {rtl.variants.map((v) => {
                const palettes: Record<string, { bg: string; ring: string; label: string; emoji: string }> = {
                  neutral: { bg: "bg-amber-100/10",  ring: "border-amber-200/20", label: "Neutral Cream",   emoji: "☕️" },
                  dark:    { bg: "bg-slate-800/40",  ring: "border-violet-500/30", label: "Dark Mode",       emoji: "🌙" },
                  cherry:  { bg: "bg-rose-500/10",   ring: "border-rose-400/30",  label: "Cherry Coquette", emoji: "🍒" },
                };
                const p = palettes[v.key] ?? { bg: "bg-white/[0.04]", ring: "border-white/[0.08]", label: v.label, emoji: "✨" };
                const sheetUrl = sheetUrls[v.key];
                return (
                  <div
                    key={v.key}
                    className={`px-3 py-3 rounded-lg border ${p.bg} ${p.ring} transition-all`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">{p.emoji}</span>
                        <span className="text-[11px] font-semibold text-white">{p.label}</span>
                      </div>
                    </div>
                    <p className="text-[9px] text-white/30 truncate mb-2">{v.fileName}</p>
                    <div className="flex items-center gap-1.5">
                      {sheetUrl ? (
                        <a
                          href={sheetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 text-[10px] font-semibold text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded transition-colors"
                        >
                          Open Sheet ↗
                        </a>
                      ) : (
                        <button
                          onClick={() => v.assetId && handlePushToSheets(v.assetId, v.key)}
                          disabled={!v.assetId || !!pushingVariant}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 text-[10px] font-semibold text-emerald-300 hover:text-white bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-30 rounded transition-colors"
                        >
                          {pushingVariant === v.key ? (
                            <>
                              <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              Pushing…
                            </>
                          ) : (
                            <>
                              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M14.727 6.727H14V0H4.91c-.905 0-1.637.732-1.637 1.636v20.728c0 .904.732 1.636 1.636 1.636h14.182c.904 0 1.636-.732 1.636-1.636V6.727h-6.727z"/>
                              </svg>
                              Open in Sheets
                            </>
                          )}
                        </button>
                      )}
                      {v.downloadUrl && (
                        <a
                          href={v.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Download .xlsx"
                          className="flex items-center justify-center w-7 h-7 text-white/40 hover:text-white bg-white/[0.04] hover:bg-white/[0.10] rounded transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Review Tabs ── */}
      <div className="px-6">
        <div className="flex gap-1 border-b border-white/[0.06]">
          {[
            { key: "preview" as const, label: "Template Preview", show: hasPreview },
            { key: "video" as const, label: "Listing Video", show: hasVideo },
            { key: "images" as const, label: `Images (${rtl.listingImages?.length || 0})`, show: hasImages },
            { key: "copy" as const, label: "Listing Copy", show: hasCopy },
          ].filter(t => t.show).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-xs font-medium transition-all border-b-2 -mb-px ${
                activeTab === tab.key
                  ? "text-white border-emerald-400"
                  : "text-white/40 border-transparent hover:text-white/60 hover:border-white/10"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="p-6 pt-4">
        {/* Template Preview Tab */}
        {activeTab === "preview" && hasPreview && (
          <div className="space-y-3">
            <div className="relative rounded-lg overflow-hidden border border-white/[0.08] bg-white">
              {!previewLoaded && !previewError && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/[0.02]">
                  <div className="flex items-center gap-2 text-white/30">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-xs">Rendering spreadsheet preview...</span>
                  </div>
                </div>
              )}
              {previewError ? (
                <div className="py-16 flex items-center justify-center text-white/30">
                  <span className="text-xs">Preview unavailable — download the template to review</span>
                </div>
              ) : (
                <img
                  src={rtl.previewUrl}
                  alt="Spreadsheet preview"
                  className={`w-full h-auto transition-opacity duration-300 ${previewLoaded ? "opacity-100" : "opacity-0"}`}
                  style={{ minHeight: previewLoaded ? "auto" : 300 }}
                  onLoad={() => setPreviewLoaded(true)}
                  onError={() => setPreviewError(true)}
                />
              )}
            </div>
            <p className="text-[10px] text-white/20 text-center">
              ⚡ Live preview of the {rtl.builderPath === "coded-spreadsheet-renderer" ? "coded premium" : rtl.builderPath === "openai-spec-renderer" ? "OpenAI-generated" : "AI-generated"} template — this is exactly what&apos;s in your downloaded file
            </p>
          </div>
        )}

        {/* Video Tab */}
        {activeTab === "video" && hasVideo && (
          <div className="space-y-3">
            {videoError ? (
              <div className="aspect-square max-w-md mx-auto rounded-lg border border-white/[0.08] bg-white/[0.02] flex items-center justify-center">
                <div className="text-center space-y-2">
                  <svg className="w-8 h-8 mx-auto text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  <p className="text-xs text-white/30">Video not generated yet</p>
                  <p className="text-[10px] text-white/15">Run the video engine to generate a listing video</p>
                </div>
              </div>
            ) : (
              <div className="aspect-square max-w-md mx-auto rounded-lg overflow-hidden border border-white/[0.08] bg-black">
                <video
                  src={rtl.videoUrl}
                  className="w-full h-full object-contain"
                  autoPlay
                  muted
                  loop
                  playsInline
                  onError={() => setVideoError(true)}
                />
              </div>
            )}
            <p className="text-[10px] text-white/20 text-center">
              Etsy listing video — HD with Ken Burns effect &amp; background music
            </p>
          </div>
        )}

        {/* Images Tab */}
        {activeTab === "images" && hasImages && (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-3">
              {rtl.listingImages!.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setExpandedImage(img.downloadUrl)}
                  className="group relative aspect-square rounded-lg bg-white/[0.04] border border-white/[0.08] hover:border-indigo-500/40 transition-all overflow-hidden"
                >
                  <img
                    src={img.downloadUrl}
                    alt={`Listing image ${i + 1}: ${img.kind}`}
                    className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                      (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                    }}
                  />
                  <div className="hidden flex-col items-center justify-center absolute inset-0 gap-1">
                    <span className="text-sm text-white/40 font-medium">{i + 1}</span>
                    <span className="text-[8px] text-white/20 capitalize">{img.kind}</span>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/60 to-transparent">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-white/70 font-medium capitalize">{img.kind}</span>
                      <span className="text-[9px] text-white/40">#{i + 1}</span>
                    </div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                    <svg className="w-6 h-6 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Copy Tab */}
        {activeTab === "copy" && hasCopy && (
          <div className="space-y-4">
            {/* Title */}
            <div className="space-y-1">
              <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Title</p>
              <p className="text-sm text-white/80 font-medium leading-relaxed">{rtl.listingCopy!.title}</p>
            </div>

            {/* Tags */}
            {rtl.listingCopy!.tags && rtl.listingCopy!.tags.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">
                  Tags ({rtl.listingCopy!.tags.length}/13)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {rtl.listingCopy!.tags.slice(0, 13).map((tag, i) => (
                    <span key={i} className="px-2.5 py-1 text-[11px] text-white/60 bg-white/[0.04] border border-white/[0.08] rounded-md">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Description preview */}
            {rtl.listingCopy!.description && (
              <div className="space-y-2">
                <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Description</p>
                <div className="max-h-48 overflow-y-auto rounded-lg bg-white/[0.02] border border-white/[0.06] p-4">
                  <pre className="text-[11px] text-white/50 whitespace-pre-wrap font-sans leading-relaxed">
                    {rtl.listingCopy!.description}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Price + Duration Bar ── */}
      <div className="px-6 py-3 border-t border-white/[0.06] flex items-center gap-4">
        {rtl.listingCopy?.price ? (
          <div>
            <p className="text-[10px] text-white/30 uppercase tracking-wider">Price</p>
            <p className="text-lg font-bold text-white">${rtl.listingCopy.price.toFixed(2)}</p>
          </div>
        ) : null}
        {rtl.suggestedPrice && rtl.suggestedPrice !== rtl.listingCopy?.price ? (
          <div>
            <p className="text-[10px] text-white/30 uppercase tracking-wider">Suggested</p>
            <p className="text-lg font-bold text-emerald-400">${rtl.suggestedPrice.toFixed(2)}</p>
          </div>
        ) : null}
        {/* Status badges */}
        <div className="flex items-center gap-2 ml-4">
          {hasProduct && <span className="px-2 py-0.5 text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 rounded">File</span>}
          {hasImages && <span className="px-2 py-0.5 text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 rounded">{rtl.listingImages!.length} Images</span>}
          {hasCopy && <span className="px-2 py-0.5 text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 rounded">Copy</span>}
          {hasPackage && <span className="px-2 py-0.5 text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 rounded">Package</span>}
        </div>
        {rtl.totalDurationMs ? (
          <div className="ml-auto text-right">
            <p className="text-[10px] text-white/30 uppercase tracking-wider">Build Time</p>
            <p className="text-sm font-medium text-white/60">{(rtl.totalDurationMs / 1000).toFixed(1)}s</p>
          </div>
        ) : null}
      </div>

      {/* ── Action Buttons ── */}
      <div className="px-6 pb-6 pt-2 flex items-center gap-3">
        {onPublish && (
          <button
            onClick={() => onPublish(run.id)}
            className="flex-1 py-3 text-center text-sm font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 rounded-xl transition-all shadow-lg shadow-orange-500/10 flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Send to Etsy
          </button>
        )}
        {hasPackage && rtl.packageAsset?.downloadUrl && (
          <a
            href={rtl.packageAsset.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-3 text-center text-sm font-semibold text-white/70 hover:text-white bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.10] rounded-xl transition-all flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Full Package
          </a>
        )}
      </div>

      {/* ── Expanded Image Lightbox ── */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer"
          onClick={() => setExpandedImage(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh] p-2">
            <img
              src={expandedImage}
              alt="Expanded listing image"
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
            <button
              onClick={() => setExpandedImage(null)}
              className="absolute top-4 right-4 w-8 h-8 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white/80 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <a
              href={expandedImage}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-4 right-4 px-3 py-1.5 text-xs font-medium text-white/70 bg-black/50 hover:bg-black/70 rounded-md transition-colors"
            >
              Open full size
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function ChecklistItem({
  label,
  sublabel,
  done,
  href,
}: {
  label: string;
  sublabel?: string;
  done: boolean;
  href?: string;
}) {
  const content = (
    <div className={`flex items-center gap-2.5 p-3 rounded-lg transition-colors ${
      done ? "bg-emerald-500/[0.04]" : "bg-white/[0.02]"
    } ${href ? "hover:bg-white/[0.06] cursor-pointer" : ""}`}>
      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
        done ? "bg-emerald-500/20" : "bg-white/[0.06]"
      }`}>
        {done ? (
          <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
        )}
      </div>
      <div>
        <p className={`text-xs font-medium ${done ? "text-white/70" : "text-white/30"}`}>{label}</p>
        {sublabel && <p className="text-[10px] text-white/20">{sublabel}</p>}
      </div>
    </div>
  );

  if (href) {
    return <a href={href} target="_blank" rel="noopener noreferrer">{content}</a>;
  }
  return content;
}

// ══════════════════════════════════════════════════════════════
// Run History Card (for completed runs)
// ══════════════════════════════════════════════════════════════

function RunCard({ run, onSelect }: { run: FactoryRunView; onSelect: () => void }) {
  const engines = run.engineLog || [];
  const doneCount = engines.filter((e) => e.status === "done").length;
  const isReady = run.status === "ready_to_list";
  const isCompleted = run.status === "completed";
  const isFailed = run.status === "failed";

  return (
    <div
      onClick={onSelect}
      className="p-4 bg-white/[0.02] border border-white/[0.08] rounded-xl space-y-3 hover:border-white/[0.15] transition-colors cursor-pointer"
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-white truncate block">
            {run.keywords?.length ? run.keywords.join(", ") : run.id.slice(0, 20) + "..."}
          </span>
          <span className="text-[10px] text-white/20 font-mono">{run.id.slice(0, 16)}</span>
        </div>
        <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase rounded flex-shrink-0 ml-2 ${
          isReady ? "bg-emerald-500/15 text-emerald-400" :
          isCompleted ? "bg-emerald-500/10 text-emerald-400/70" :
          isFailed ? "bg-red-500/15 text-red-400" :
          "bg-indigo-500/15 text-indigo-400"
        }`}>
          {run.status.replace(/_/g, " ")}
        </span>
      </div>

      {/* Mini engine bar */}
      <div className="flex items-center gap-1">
        {engines.map((eng) => (
          <div
            key={eng.engine}
            className={`h-1.5 flex-1 rounded-full ${
              eng.status === "done" ? "bg-emerald-500/50" :
              eng.status === "error" ? "bg-red-500/50" :
              eng.status === "skipped" ? "bg-white/[0.06]" :
              "bg-white/[0.08]"
            }`}
            title={`${eng.name}: ${eng.status}`}
          />
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-2">
        {run.projectId && (isCompleted || isReady) && (
          <a
            href={`/digital-studio?project=${run.projectId}`}
            onClick={(e) => e.stopPropagation()}
            className="px-3 py-1.5 text-[10px] font-semibold text-indigo-300 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/20 rounded-md transition-colors"
          >
            Open Studio
          </a>
        )}
        {run.packageAssetId && (
          <a
            href={`/api/digital/download/${run.packageAssetId}`}
            onClick={(e) => e.stopPropagation()}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-[10px] font-semibold text-white/40 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-md transition-colors"
          >
            Download
          </a>
        )}
        {run.etsyListingUrl && (
          <a
            href={run.etsyListingUrl}
            onClick={(e) => e.stopPropagation()}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-[10px] font-semibold text-orange-300 hover:text-white bg-orange-500/10 hover:bg-orange-500/20 rounded-md transition-colors"
          >
            {run.etsyStatus === "active" ? "Live on Etsy" : "Etsy Draft"}
          </a>
        )}
        <span className="ml-auto text-[10px] text-white/15 tabular-nums">
          {doneCount}/{engines.length || 5}
        </span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Main Dashboard
// ══════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────────────
// Bridge key: when /research → Ideas tab clicks "Build in Factory",
// the chosen idea is stashed in sessionStorage under this key and we
// navigate here. On mount we read it, auto-start the build, and clear.
// Keep this string in sync with FACTORY_PREFILL_KEY in IdeasTab.tsx.
// ──────────────────────────────────────────────────────────────────────
const FACTORY_PREFILL_KEY = "factory_prefill_from_research";

/**
 * Two shapes are accepted for backward compatibility:
 *
 * (A) NEW (post-2026-05-19 contract — /research/products + /research/ideas with resolved listings):
 *     {
 *       source: "research/products" | "research/ideas" | "research/scan",
 *       competitor: { listingId, title, description, tags, price, imageUrls, ... },
 *       niche: string,
 *       marketContext?: { competition, avgFavorites, evidenceCount, topTags },
 *       ideaContext?: { title, whyNow, targetBuyer }
 *     }
 *
 * (B) OLD (legacy — kept until /research finishes shipping their side):
 *     {
 *       title, tags, price, niche, description,
 *       _source, _etsy_competition, _etsy_avg_favorites, _evidence_count
 *     }
 *
 * normalizePrefill() reads either, returns the legacy shape used downstream.
 */
interface FactoryPrefill {
  title: string;
  tags?: string[];
  price?: number;
  niche?: string;
  description?: string;
  _source?: "research/products" | "research/ideas" | "research/scan";
  _etsy_competition?: number | null;
  _etsy_avg_favorites?: number | null;
  _evidence_count?: number;

  // ── Deep-scan inputs (new contract) ──
  /** Etsy listingId for caching / linking — not used for scraping. */
  listingId?: string;
  /** url_fullxfull listing photos (3–8) — fed to Gemini Vision deep scan. */
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
}

interface NewBridgePayload {
  source?: string;
  competitor?: {
    listingId?: string;
    title?: string;
    description?: string;
    tags?: string[];
    price?: number;
    imageUrls?: string[];
    reviewCount?: number;
    rating?: number;
    salesEstimate?: number;
  };
  niche?: string;
  marketContext?: {
    competition?: number | null;
    avgFavorites?: number | null;
    evidenceCount?: number;
    topTags?: string[];
  };
  ideaContext?: {
    title?: string;
    whyNow?: string;
    targetBuyer?: string;
  };
}

function normalizePrefill(raw: unknown): FactoryPrefill | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  // Shape A: new contract has nested `competitor` object
  if (obj.competitor && typeof obj.competitor === "object") {
    const payload = obj as NewBridgePayload;
    const c = payload.competitor!;
    const title = c.title;
    if (!title || typeof title !== "string") return null;
    return {
      title,
      tags: c.tags,
      price: c.price,
      niche: payload.niche || undefined,
      description: c.description,
      listingId: c.listingId,
      imageUrls: Array.isArray(c.imageUrls) ? c.imageUrls.slice(0, 8) : undefined,
      ideaContext: payload.ideaContext,
      marketContext: payload.marketContext,
      _source:
        payload.source === "research/products" ||
        payload.source === "research/ideas" ||
        payload.source === "research/scan"
          ? payload.source
          : undefined,
      _etsy_competition: payload.marketContext?.competition ?? null,
      _etsy_avg_favorites: payload.marketContext?.avgFavorites ?? null,
      _evidence_count: payload.marketContext?.evidenceCount,
    };
  }

  // Shape B: legacy flat shape
  const title = obj.title;
  if (!title || typeof title !== "string") return null;
  return obj as unknown as FactoryPrefill;
}

export function FactoryDashboard() {
  const runs = useFactoryStore((s) => s.runs);
  const isRunning = useFactoryStore((s) => s.isRunning);
  const activeRunStatus = useFactoryStore((s) => s.activeRunStatus);
  const error = useFactoryStore((s) => s.error);
  const startRun = useFactoryStore((s) => s.startRun);
  const startBuildBest = useFactoryStore((s) => s.startBuildBest);
  const startBuildOpportunity = useFactoryStore((s) => s.startBuildOpportunity);
  const refreshRuns = useFactoryStore((s) => s.refreshRuns);
  const setError = useFactoryStore((s) => s.setError);

  // Banner state — shown while/after a research-triggered build kicks off.
  const [researchPrefill, setResearchPrefill] = useState<FactoryPrefill | null>(null);

  const [keywords, setKeywords] = useState("");
  const [discoveries, setDiscoveries] = useState<NicheOpp[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [buildingNiche, setBuildingNiche] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [publishRunId, setPublishRunId] = useState<string | null>(null);

  // ── Step navigation ──
  // research → build → review → list
  type FactoryStep = "research" | "build" | "review" | "list";
  const [currentStep, setCurrentStep] = useState<FactoryStep>("research");
  const [activeKeyword, setActiveKeyword] = useState<string>("");

  // ── Autocomplete state ──
  const [autocompleteItems, setAutocompleteItems] = useState<AutocompleteItem[]>([]);
  const [isAutocompleting, setIsAutocompleting] = useState(false);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const autocompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-discover top opportunities on mount
  useEffect(() => {
    refreshRuns();
    setIsDiscovering(true);
    fetch("/api/factory/scan")
      .then((r) => r.json())
      .then((data) => {
        if (data.discovery?.niches) setDiscoveries(data.discovery.niches);
      })
      .catch(() => {})
      .finally(() => setIsDiscovering(false));
  }, [refreshRuns]);

  // ── Research → Factory bridge ──────────────────────────────────────
  // On mount, check if /research/ideas handed us a prefilled idea.
  // If so: stash it for the banner, clear sessionStorage (so refresh
  // doesn't re-trigger), jump to the "build" step, and auto-start the
  // build via the existing selected_opportunity flow.
  //
  // Why an empty dep array and a ref guard: this MUST run exactly once
  // even under React 18 StrictMode double-mount in dev. Otherwise we'd
  // kick off two factory runs from a single click in /research.
  const prefillTriggeredRef = useRef(false);
  useEffect(() => {
    if (prefillTriggeredRef.current) return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(FACTORY_PREFILL_KEY);
    } catch {
      // sessionStorage unavailable — try the window fallback IdeasTab uses
      const w = window as unknown as { __factoryPrefill?: FactoryPrefill };
      if (w.__factoryPrefill) {
        raw = JSON.stringify(w.__factoryPrefill);
        delete w.__factoryPrefill;
      }
    }
    if (!raw) return;
    try {
      sessionStorage.removeItem(FACTORY_PREFILL_KEY);
    } catch {
      /* ignore */
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const prefill = normalizePrefill(parsed);
    if (!prefill) return;

    prefillTriggeredRef.current = true;
    setResearchPrefill(prefill);
    setCurrentStep("build");
    setActiveKeyword(prefill.niche || prefill.title);
    setKeywords(prefill.niche || prefill.title);

    // Fire the build. Factory store knows how to map opportunityData →
    // selected_opportunity run mode (see factoryStore.startBuildOpportunity).
    // imageUrls feeds the Engine 1.5 competitor deep scan in /api/factory/blueprint.
    setBuildingNiche(prefill.niche || prefill.title);
    startBuildOpportunity({
      title: prefill.title,
      tags: prefill.tags,
      price: prefill.price,
      niche: prefill.niche,
      listingId: prefill.listingId,
      description: prefill.description,
      imageUrls: prefill.imageUrls,
      ideaContext: prefill.ideaContext,
      marketContext: prefill.marketContext,
    })
      .catch(() => {
        // Error already surfaced via store.error
      })
      .finally(() => setBuildingNiche(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Debounced autocomplete ──
  useEffect(() => {
    if (autocompleteTimerRef.current) clearTimeout(autocompleteTimerRef.current);
    const q = keywords.trim();
    if (q.length < 3) {
      setAutocompleteItems([]);
      setShowAutocomplete(false);
      return;
    }
    autocompleteTimerRef.current = setTimeout(() => {
      setIsAutocompleting(true);
      fetch(`/api/factory/autocomplete?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data) => {
          setAutocompleteItems(data.items ?? []);
          setShowAutocomplete((data.items ?? []).length > 0);
        })
        .catch(() => {})
        .finally(() => setIsAutocompleting(false));
    }, 350);
    return () => {
      if (autocompleteTimerRef.current) clearTimeout(autocompleteTimerRef.current);
    };
  }, [keywords]);

  // ── Build from Research panel (sets keyword + triggers build) ──
  const handleResearchBuild = useCallback(async (keyword: string) => {
    if (isRunning || buildingNiche) return;
    setError(null);
    setKeywords(keyword);
    setActiveKeyword(keyword);
    setShowAutocomplete(false);
    setBuildingNiche(keyword);
    setCurrentStep("build");
    try {
      await startBuildBest(keyword);
    } catch {
      // Error already set in store
    } finally {
      setBuildingNiche(null);
    }
  }, [startBuildBest, setError, isRunning, buildingNiche]);

  // ── Run from keywords input ──
  const handleRun = useCallback(async () => {
    const kws = keywords.split(",").map((k) => k.trim()).filter(Boolean);
    if (kws.length === 0) return;
    setError(null);
    setShowAutocomplete(false);
    try {
      await startRun({ mode: "single_best", keywords: kws, autoPickTop: true });
    } catch {
      // Error already set in store
    }
  }, [keywords, startRun, setError]);

  // ── Build from a discovery card ──
  const handleBuildThis = useCallback(async (keyword: string) => {
    if (isRunning || buildingNiche) return;
    setError(null);
    setKeywords(keyword);
    setActiveKeyword(keyword);
    setBuildingNiche(keyword);
    setCurrentStep("build");
    try {
      await startBuildBest(keyword);
    } catch {
      // Error already set in store
    } finally {
      setBuildingNiche(null);
    }
  }, [startBuildBest, setError, isRunning, buildingNiche]);

  // ── Selected run details ──
  // When a run is selected, fetch its full details (including readyToList)
  useEffect(() => {
    if (!selectedRunId) return;
    const run = runs.find((r) => r.id === selectedRunId);
    if (run && run.readyToList) return; // Already have RTL data
    if (!run || run.status !== "ready_to_list") return; // Only fetch for ready runs

    (async () => {
      try {
        const resp = await fetch(`/api/factory/run?id=${selectedRunId}`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (data.readyToList) {
          // Update the run in the store with readyToList data
          const updatedRuns = runs.map((r) =>
            r.id === selectedRunId ? { ...r, readyToList: data.readyToList } : r
          );
          useFactoryStore.setState({ runs: updatedRuns });
        }
      } catch {
        // Silently fail
      }
    })();
  }, [selectedRunId, runs]);

  const selectedRun = selectedRunId
    ? runs.find((r) => r.id === selectedRunId) || null
    : null;

  // Auto-advance steps based on run status
  useEffect(() => {
    if (!activeRunStatus) return;
    if (activeRunStatus.status === "ready_to_list") {
      setCurrentStep("review");
    } else if (["scanning", "blueprinting", "generating", "imaging", "listing", "packaging", "pending"].includes(activeRunStatus.status)) {
      setCurrentStep("build");
    }
  }, [activeRunStatus?.status]);

  // Determine if there's an active run to show progress for
  const showActiveProgress = activeRunStatus && !["completed", "ready_to_list", "failed", "cancelled"].includes(activeRunStatus.status);
  const showReadyToList = activeRunStatus?.status === "ready_to_list" && activeRunStatus.readyToList;

  // ── Step definitions ──
  const STEPS: { key: FactoryStep; label: string; num: number }[] = [
    { key: "research", label: "Research",  num: 1 },
    { key: "build",    label: "Build",     num: 2 },
    { key: "review",   label: "Review",    num: 3 },
    { key: "list",     label: "List",      num: 4 },
  ];
  const stepOrder: FactoryStep[] = ["research", "build", "review", "list"];
  const currentStepIndex = stepOrder.indexOf(currentStep);

  return (
    <div className="mx-auto max-w-7xl space-y-8">

      {/* ── Header ── */}
      <div className="overflow-hidden rounded-[28px] border border-white/[0.08] bg-gradient-to-br from-white/[0.055] via-white/[0.025] to-transparent">
        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_430px] lg:p-8">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.24em] uppercase text-orange-300/80 mb-3">
              Product Factory OS
            </p>
            <h1 className="max-w-4xl text-4xl font-semibold leading-[0.98] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Build product systems, not repeated templates.
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-white/52 sm:text-base">
              Start from market evidence, choose a product family, generate the actual files and listing assets,
              then review everything before it touches Etsy. Spreadsheet kits are live now; Notion, PDF,
              wall art, pattern, and mockup lanes should connect into the same factory.
            </p>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {FACTORY_CAPABILITIES.map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/[0.08] bg-black/18 p-4">
                  <h3 className="text-sm font-semibold text-white">{item.label}</h3>
                  <p className="mt-2 text-xs leading-5 text-white/42">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-orange-300/20 bg-[#f8eee2] p-5 text-[#1c130d]">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8a6a4b]">Factory pipeline</p>
            <div className="mt-4 space-y-3">
              {FACTORY_PIPELINE.map((item, index) => (
                <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-[#1c130d]/10 bg-white/55 p-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1c130d] text-sm font-semibold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className="text-xs text-[#735d4c]">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl bg-[#1c130d] p-4 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-200/80">Current focus</p>
              <p className="mt-2 text-sm leading-6 text-white/70">
                Upgrade every generated product so the structure, typography, palette, dashboard, and sales angle change by niche.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Research → Factory bridge banner ──
          Shown when this build was kicked off from /research → Ideas tab.
          Surfaces the corroboration metadata (sources + real Etsy stats)
          so the user sees WHY this idea is worth building, not just WHAT. */}
      {researchPrefill && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
          <div className="flex items-start gap-3">
            <div className="text-2xl leading-none">
              {researchPrefill.imageUrls && researchPrefill.imageUrls.length > 0 ? "🎯" : "💡"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-emerald-400/80 font-semibold mb-1">
                {researchPrefill._source === "research/products"
                  ? "Cloning Competitor → Beating It"
                  : researchPrefill._source === "research/ideas"
                  ? "Building from Research → Ideas"
                  : "Building from Research"}
              </div>
              <div className="text-sm font-semibold text-white truncate">
                {researchPrefill.title}
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-white/50 flex-wrap">
                {researchPrefill.niche && (
                  <span className="px-2 py-0.5 rounded bg-white/[0.05]">
                    niche: <span className="text-white/80">{researchPrefill.niche}</span>
                  </span>
                )}
                {researchPrefill.imageUrls && researchPrefill.imageUrls.length > 0 && (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/[0.12] text-emerald-300/90 font-medium">
                    <span className="text-emerald-200">{researchPrefill.imageUrls.length}</span> photo{researchPrefill.imageUrls.length !== 1 ? "s" : ""} → deep-scan
                  </span>
                )}
                {typeof researchPrefill._etsy_competition === "number" && (
                  <span className="px-2 py-0.5 rounded bg-white/[0.05]">
                    <span className="text-white/80">{researchPrefill._etsy_competition.toLocaleString()}</span> Etsy listings
                  </span>
                )}
                {typeof researchPrefill._etsy_avg_favorites === "number" && (
                  <span className="px-2 py-0.5 rounded bg-white/[0.05]">
                    <span className="text-white/80">{researchPrefill._etsy_avg_favorites.toLocaleString()}</span> avg favorites
                  </span>
                )}
                {typeof researchPrefill._evidence_count === "number" && (
                  <span className="px-2 py-0.5 rounded bg-white/[0.05]">
                    <span className="text-white/80">{researchPrefill._evidence_count}</span> source evidence
                  </span>
                )}
              </div>
              {/* Competitor photo strip — only when /research handed us real listing images. */}
              {researchPrefill.imageUrls && researchPrefill.imageUrls.length > 0 && (
                <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
                  {researchPrefill.imageUrls.slice(0, 8).map((url, i) => (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      key={url + i}
                      src={url}
                      alt={`competitor photo ${i + 1}`}
                      className="h-16 w-16 object-cover rounded border border-white/10 flex-shrink-0"
                      loading="lazy"
                    />
                  ))}
                </div>
              )}
              {researchPrefill.description && (
                <div className="text-[11px] text-white/50 mt-2 leading-relaxed line-clamp-3">
                  {researchPrefill.description}
                </div>
              )}
            </div>
            <button
              onClick={() => setResearchPrefill(null)}
              className="text-white/30 hover:text-white/60 text-lg leading-none"
              aria-label="Dismiss banner"
              title="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* ── Step Navigation (matches cross-stitch style) ── */}
      <div className="relative flex items-center">
        {/* connecting line */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-white/[0.08]" />
        {/* completed line */}
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-px bg-orange-500/60 transition-all duration-500"
          style={{ width: `${(currentStepIndex / (STEPS.length - 1)) * 100}%` }}
        />
        <div className="relative flex w-full justify-between">
          {STEPS.map((step, idx) => {
            const isDone = idx < currentStepIndex;
            const isActive = idx === currentStepIndex;
            const isFuture = idx > currentStepIndex;
            return (
              <button
                key={step.key}
                onClick={() => {
                  // Only allow going back, or to steps already reached
                  if (idx <= currentStepIndex) setCurrentStep(step.key);
                }}
                disabled={isFuture}
                className="flex flex-col items-center gap-2 group disabled:cursor-default"
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-all border-2 ${
                  isDone
                    ? "bg-orange-500 border-orange-500 text-white"
                    : isActive
                      ? "bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/30"
                      : "bg-[#1a1c24] border-white/[0.10] text-white/30"
                }`}>
                  {isDone ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : step.num}
                </div>
                <span className={`text-xs font-medium transition-colors ${
                  isActive ? "text-white" : isDone ? "text-white/50" : "text-white/25"
                }`}>
                  {step.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          STEP 1: RESEARCH
      ══════════════════════════════════════════════ */}
      {currentStep === "research" && (
        <ResearchPanel onBuild={handleResearchBuild} isRunning={isRunning || !!buildingNiche} />
      )}

      {/* ══════════════════════════════════════════════
          STEP 2: BUILD
      ══════════════════════════════════════════════ */}
      {currentStep === "build" && (
        <div className="space-y-4">
          {/* Active keyword banner with build-engine badge */}
          {activeKeyword && (
            <div className="rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/[0.06] via-violet-500/[0.04] to-transparent p-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-[10px] text-blue-300/70 uppercase tracking-wider font-semibold">Premium Spreadsheet Factory</p>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-gradient-to-r from-emerald-500/20 to-sky-500/20 border border-emerald-500/30 text-emerald-300">
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm4.24 16L12 15.45 7.77 18l1.12-4.81-3.73-3.23 4.92-.42L12 5l1.92 4.53 4.92.42-3.73 3.23L16.23 18z"/>
                        </svg>
                        ⚙ Coded + AI fallback
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-white truncate">{activeKeyword}</p>
                  </div>
                </div>
                <button
                  onClick={() => setCurrentStep("research")}
                  disabled={isRunning}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-white/40 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg transition-all disabled:opacity-30"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Change idea
                </button>
              </div>

              {/* Format indicator */}
              <div className="flex items-center gap-2 pt-3 border-t border-blue-500/10">
                <p className="text-[10px] text-white/40 uppercase tracking-wider mr-2">Format</p>
                {[
                  { key: "xlsx", label: "Excel / Sheets", icon: "📊", active: !/\b(doc|docx|word|guide)\b/i.test(activeKeyword) },
                  { key: "docx", label: "Word / Doc", icon: "📄", active: /\b(doc|docx|word|guide)\b/i.test(activeKeyword) },
                  { key: "csv",  label: "CSV", icon: "📋", active: false },
                ].map((f) => (
                  <span
                    key={f.key}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
                      f.active
                        ? "bg-blue-500/15 text-blue-300 border border-blue-500/30"
                        : "bg-white/[0.03] text-white/30 border border-white/[0.06]"
                    }`}
                  >
                    <span>{f.icon}</span>
                    <span>{f.label}</span>
                    {f.active && <span className="text-[8px] ml-0.5">✓</span>}
                  </span>
                ))}
                <span className="text-[10px] text-white/30 italic ml-auto">
                  Detected from keyword
                </span>
              </div>
            </div>
          )}

          {/* Or type your own if no keyword yet */}
          {!activeKeyword && (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-3">
              <p className="text-sm text-white/50">Or type your own idea:</p>
              <div className="relative">
                <input
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && keywords.trim() && handleBuildThis(keywords.trim())}
                  placeholder="e.g. baby budget planner google sheets"
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.10] rounded-xl text-white placeholder-white/25 focus:outline-none focus:border-orange-500/50 transition-all text-sm pr-28"
                />
                <button
                  onClick={() => keywords.trim() && handleBuildThis(keywords.trim())}
                  disabled={isRunning || !keywords.trim()}
                  className="absolute right-2 top-1.5 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-30 rounded-lg transition-colors"
                >
                  Build
                </button>
              </div>
              {/* Quick picks */}
              <div className="flex flex-wrap gap-2 pt-1">
                {QUICK_START_IDEAS.slice(0, 6).map((idea) => (
                  <button
                    key={idea.keyword}
                    onClick={() => handleBuildThis(idea.keyword)}
                    disabled={isRunning}
                    className="px-3 py-1.5 text-[11px] text-white/50 hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] rounded-lg transition-all disabled:opacity-30"
                  >
                    {idea.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Pipeline progress */}
          {showActiveProgress && activeRunStatus && (
            <PipelineProgress run={activeRunStatus} />
          )}

          {/* Failed */}
          {activeRunStatus?.status === "failed" && (
            <div className="space-y-3">
              <PipelineProgress run={activeRunStatus} />
              {activeRunStatus.errorMessage && (
                <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <p className="text-xs text-red-400">{activeRunStatus.errorMessage}</p>
                </div>
              )}
              <button
                onClick={() => setCurrentStep("research")}
                className="px-4 py-2 text-xs font-semibold text-white/50 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg transition-colors"
              >
                ← Back to Research
              </button>
            </div>
          )}

          {error && (
            <div className="px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center justify-between">
              <p className="text-xs text-red-400">{error}</p>
              <button onClick={() => setError(null)} className="text-red-400/40 hover:text-red-400 text-xs ml-2">dismiss</button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════
          STEP 3: REVIEW
      ══════════════════════════════════════════════ */}
      {currentStep === "review" && (
        <div className="space-y-4">
          {/* Back button */}
          <button
            onClick={() => setCurrentStep("build")}
            className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Build
          </button>

          {showReadyToList && activeRunStatus && (
            <ReadyToListCard
              run={activeRunStatus}
              onPublish={(runId) => {
                setPublishRunId(runId);
                setCurrentStep("list");
              }}
            />
          )}

          {activeRunStatus?.status === "completed" && !showReadyToList && (
            <div className="p-5 bg-emerald-500/[0.04] border border-emerald-500/15 rounded-xl">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-emerald-300">Template built successfully</p>
                  <p className="text-xs text-white/30">Some preview assets may still be generating.</p>
                </div>
                {activeRunStatus.projectId && (
                  <a
                    href={`/digital-studio?project=${activeRunStatus.projectId}`}
                    className="ml-auto px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
                  >
                    Open in Digital Studio
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════
          STEP 4: LIST
      ══════════════════════════════════════════════ */}
      {currentStep === "list" && (
        <div className="space-y-4">
          <button
            onClick={() => setCurrentStep("review")}
            className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Review
          </button>

          {/* Show the review card + publish flow */}
          {activeRunStatus?.readyToList && (
            <ReadyToListCard run={activeRunStatus} onPublish={setPublishRunId} />
          )}

          <div className="flex items-center gap-3 p-5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04]">
            <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Ready to list on Etsy</p>
              <p className="text-xs text-white/40 mt-0.5">Your template is built and images are ready. Hit Publish in the review card above.</p>
            </div>
            <button
              onClick={() => {
                setCurrentStep("research");
                setActiveKeyword("");
              }}
              className="flex-shrink-0 px-4 py-2 text-xs font-semibold text-orange-300 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 rounded-lg transition-colors"
            >
              Build another →
            </button>
          </div>
        </div>
      )}

      {/* ── Publish Modal ── */}
      {publishRunId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4 p-6 bg-[#0f1117] border border-white/[0.10] rounded-2xl shadow-2xl">
            <PublishReview
              runId={publishRunId}
              onClose={() => setPublishRunId(null)}
              onPublished={() => {
                refreshRuns();
                setCurrentStep("list");
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
