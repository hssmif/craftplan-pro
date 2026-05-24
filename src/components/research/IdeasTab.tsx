"use client";

// ══════════════════════════════════════════════════════════════════════
// IdeasTab — /research "Ideas" tab
//
// Surfaces REAL demand signals + AI-generated product ideas anchored to
// those signals. Built on top of /api/research/market-pulse which does
// the deterministic ≥2-source corroboration + Etsy v3 enrichment.
//
// UI layout:
//   ┌──────────────────────────────────────────────────────────────┐
//   │  Header: title + Refresh button + last-updated               │
//   │  Source-status pills row (Google/Reddit/Etsy/Pinterest)      │
//   │  Honesty banner                                               │
//   ├──────────────────────────────────────────────────────────────┤
//   │  Category sections (planner, wall-art, sticker, …)           │
//   │    Grid of term cards:                                        │
//   │      • Demand score chip (color-coded)                       │
//   │      • Term name                                              │
//   │      • Source badges                                          │
//   │      • Real Etsy stats (competition, avg favorites, velocity)│
//   │      • "Why now" (Gemini-grounded)                           │
//   │      • Evidence accordion                                     │
//   │      • Generate-ideas button                                  │
//   ├──────────────────────────────────────────────────────────────┤
//   │  Generated ideas (per term)                                  │
//   └──────────────────────────────────────────────────────────────┘
// ══════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AnchorSweepPanel from "@/components/research/AnchorSweepPanel";

// ── Types matching /api/research/market-pulse response ───────────────
interface Evidence {
  source: string;
  text: string;
  score?: number;
  url?: string;
}

interface CorroboratedTerm {
  term: string;
  normalized: string;
  sources: string[];
  source_count: number;
  evidence: Evidence[];
  etsy_competition: number | null;
  etsy_avg_favorites: number | null;
  etsy_top_image: string | null;
  category: string;
  why_now: string;
  demand_score: number;
}

interface BuildableLane {
  id: "cross-stitch" | "wall-art" | "svg" | "spreadsheet" | "printable" | "notion" | "pod";
  label: string;
  studio: string;
  fit: string;
  path: string;
  query: string;
}

interface MarketAlert extends CorroboratedTerm {
  alert_kind: "etsy-insights";
  source_label: string;
  insight_context: string | null;
  buildable_lanes: BuildableLane[];
}

interface SourceStatus {
  id: string;
  label: string;
  fetched: boolean;
  count: number;
  error?: string;
}

interface MarketPulseResponse {
  fetched_at: string;
  cache_age_ms: number;
  sources: SourceStatus[];
  total_raw_items: number;
  total_corroborated: number;
  by_category: Record<string, CorroboratedTerm[]>;
  top: CorroboratedTerm[];
  alerts?: MarketAlert[];
}

interface GeneratedIdea {
  id?: number;
  title: string;
  niche?: string;
  product_type?: string;
  why_now?: string;
  target_buyer?: string;
  suggested_price?: number | string;
  demand_score?: number;
  competition_score?: number;
  urgency_score?: number;
  confidence?: number;
  // Gemini sometimes returns this as an array, sometimes as a comma-string
  suggested_tags?: string[] | string;
}

// ── Source UI mapping ─────────────────────────────────────────────────
const SOURCE_ICONS: Record<string, string> = {
  "google-trends": "📈",
  "google-autocomplete": "🔍",
  pinterest: "📌",
  reddit: "🔥",
  etsy: "🛍️",
  // Etsy Marketplace Insights — buyer-side ground truth from the Plus
  // dashboard, captured by the Chrome extension while browsing.
  "etsy-insights": "🛒",
};

// Marketplace Insights dashboard URL — used by the freshness banner's
// "Open Etsy Insights →" CTA. Opens in a new tab so the user keeps
// /research open in their original tab.
const ETSY_INSIGHTS_URL =
  "https://www.etsy.com/your/shops/me/marketplace-insights";

// Shape returned by GET /api/research/insights-capture — used by the
// freshness banner. Mirrors EtsyInsightsSummary in db.ts (don't re-import
// the server-side type; we deliberately keep this tab client-only).
interface InsightsSummary {
  total: number;
  mostRecentCapturedAt: string | null;
  byCategory: Array<{ category: string; count: number; max_captured_at: string }>;
}

/** Humanize an ISO timestamp into "5m ago", "2h ago", "3d ago". */
function humanizeAge(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/** Color tier for the freshness pill based on capture age. */
function freshnessTier(iso: string | null): "fresh" | "ok" | "stale" | "empty" {
  if (!iso) return "empty";
  const ageHours = (Date.now() - new Date(iso).getTime()) / 3600_000;
  if (ageHours < 24) return "fresh";
  if (ageHours < 24 * 7) return "ok";
  return "stale";
}

const CATEGORY_LABELS: Record<string, { emoji: string; label: string }> = {
  "wall-art": { emoji: "🖼️", label: "Wall Art" },
  planner: { emoji: "📅", label: "Planners" },
  svg: { emoji: "✂️", label: "SVG Cut Files" },
  printable: { emoji: "🖨️", label: "Printables" },
  journal: { emoji: "📓", label: "Journals" },
  invitation: { emoji: "💌", label: "Invitations" },
  template: { emoji: "📋", label: "Templates" },
  coloring: { emoji: "🎨", label: "Coloring Pages" },
  sticker: { emoji: "🏷️", label: "Stickers" },
  ebook: { emoji: "📘", label: "eBooks" },
  preset: { emoji: "🎞️", label: "Presets" },
  font: { emoji: "🔠", label: "Fonts" },
  other: { emoji: "💡", label: "Other" },
};

// Extract Etsy listing_id from a listing URL. Etsy URLs look like:
//   https://www.etsy.com/listing/1234567890/some-slug
//   https://www.etsy.com/uk/listing/1234567890/some-slug?ref=...
//   /listing/1234567890                            ← also tolerated
// Returns the numeric ID as a string, or null if it doesn't match.
function extractEtsyListingId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/\/listing\/(\d+)/);
  return m ? m[1] : null;
}

// ══════════════════════════════════════════════════════════════════════

// Key used to hand the chosen idea off to /factory via sessionStorage.
// FactoryDashboard reads + clears this on mount and auto-starts a build.
// PAYLOAD CONTRACT (v2 — coordinated with factory chat 2026-05-19):
//   See FactoryBuildPayload below — the factory's competitor-deep-scan
//   engine reads `competitor.imageUrls` with Gemini Vision to extract
//   a feature manifest, then clones-and-beats the competitor.
export const FACTORY_PREFILL_KEY = "factory_prefill_from_research";

interface FactoryBuildPayload {
  source: "research/products" | "research/ideas" | "research/scan";
  competitor: {
    listingId: string;
    title: string;
    description: string;
    tags: string[];
    price: number;
    imageUrls: string[];     // up to 8 full-res, sorted by Etsy rank
    listingUrl?: string;
    seller?: string;
    reviewCount?: number;
    rating?: number;
    salesEstimate?: number;
  };
  niche: string;             // raw term — factory has fuzzy resolver
  marketContext?: {
    competition: number | null;
    avgFavorites: number | null;
    evidenceCount?: number;
    topTags?: string[];
  };
  ideaContext?: {
    title: string;
    whyNow: string;
    targetBuyer: string;
  };
}

export default function IdeasTab() {
  const router = useRouter();
  const [data, setData] = useState<MarketPulseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [ideasByTerm, setIdeasByTerm] = useState<Record<string, GeneratedIdea[]>>({});
  const [savedIdeas, setSavedIdeas] = useState<GeneratedIdea[]>([]);
  const [expandedEvidence, setExpandedEvidence] = useState<Record<string, boolean>>({});
  // Resolved-competitor cache keyed by term.normalized. Same term =
  // same top competitor; clicking Build twice on different ideas under
  // the same term skips the second Etsy round-trip.
  const [resolvedByTerm, setResolvedByTerm] = useState<
    Record<string, FactoryBuildPayload["competitor"]>
  >({});
  const [buildingKey, setBuildingKey] = useState<string | null>(null);
  // Marketplace Insights freshness state — drives the banner above the
  // source pills. Refetched on mount + after a refresh of market-pulse.
  const [insightsSummary, setInsightsSummary] = useState<InsightsSummary | null>(null);

  // ── Fetch market pulse ─────────────────────────────────────────────
  const fetchPulse = useCallback(async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/research/market-pulse${refresh ? "?refresh=1" : ""}`;
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const json: MarketPulseResponse = await resp.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load market pulse");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPulse(false);
  }, [fetchPulse]);

  const fetchSavedIdeas = useCallback(async () => {
    try {
      const resp = await fetch("/api/research/ideas?status=all&limit=8");
      if (!resp.ok) return;
      const json = await resp.json();
      setSavedIdeas(Array.isArray(json.ideas) ? json.ideas : []);
    } catch {
      // Saved ideas are a convenience surface; market pulse still works.
    }
  }, []);

  useEffect(() => {
    fetchSavedIdeas();
  }, [fetchSavedIdeas]);

  // ── Insights freshness fetcher ─────────────────────────────────────
  // Cheap GET — reads from local SQLite, returns in <10ms. We refresh
  // alongside market-pulse so the banner stays in sync with what's
  // actually being corroborated.
  const fetchInsightsSummary = useCallback(async () => {
    try {
      const resp = await fetch("/api/research/insights-capture?limit=1");
      if (!resp.ok) return;
      const json = await resp.json();
      setInsightsSummary({
        total: json.total ?? 0,
        mostRecentCapturedAt: json.mostRecentCapturedAt ?? null,
        byCategory: json.byCategory ?? [],
      });
    } catch {
      // Silent — the banner just won't render
    }
  }, []);

  useEffect(() => {
    fetchInsightsSummary();
  }, [fetchInsightsSummary]);

  // ── Build an idea in Product Factory ──────────────────────────────
  // Resolves a REAL Etsy competitor for the idea (so factory's deep-scan
  // engine has photos + description to extract features from), packages
  // the v2 payload, and navigates to /factory.
  //
  // Resolution strategy:
  //   1. If we've already resolved a competitor for this term, reuse it
  //      (cache hit, no Etsy round-trip).
  //   2. Otherwise: prefer the highest-scored Etsy item already in
  //      term.evidence (the term was corroborated using it), extract
  //      its listing_id from the URL, and call /api/research/resolve-
  //      competitor?listingId=...
  //   3. If no Etsy evidence exists OR id extraction fails, fall back to
  //      keyword search via the same endpoint — always guarantees a real
  //      competitor (factory needs imageUrls; empty defeats deep-scan).
  //
  // All async work happens with a per-card "Building…" loading state so
  // the user sees ~500ms-3s of activity (Etsy call) before navigation.
  async function handleBuildInFactory(idea: GeneratedIdea, term: CorroboratedTerm) {
    const buildKey = `${term.normalized}::${idea.title.slice(0, 60)}`;
    setBuildingKey(buildKey);
    try {
      // ── Step 1: resolve a real competitor (with cache) ────────────
      let competitor = resolvedByTerm[term.normalized];
      if (!competitor) {
        // Try evidence first — best signal, already corroborated.
        const etsyEv = term.evidence
          .filter((e) => e.source === "etsy" && e.url)
          .sort((a, b) => (b.score || 0) - (a.score || 0))[0];
        const listingIdFromEv = etsyEv ? extractEtsyListingId(etsyEv.url || "") : null;

        const body = listingIdFromEv
          ? { listingId: listingIdFromEv }
          : { keyword: term.term };

        const resp = await fetch("/api/research/resolve-competitor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
          throw new Error(err.error || `HTTP ${resp.status}`);
        }
        const json = await resp.json();
        competitor = json.competitor as FactoryBuildPayload["competitor"];
        // Cache for repeat clicks on different ideas under this term.
        setResolvedByTerm((s) => ({ ...s, [term.normalized]: competitor! }));
      }

      // ── Step 2: assemble the v2 payload ───────────────────────────
      const payload: FactoryBuildPayload = {
        source: "research/ideas",
        competitor,
        niche: term.term, // raw term — factory has its own fuzzy resolver
        marketContext: {
          competition: term.etsy_competition,
          avgFavorites: term.etsy_avg_favorites,
          evidenceCount: term.evidence.length,
          topTags: competitor.tags?.slice(0, 13),
        },
        ideaContext: {
          title: idea.title,
          whyNow: idea.why_now || "",
          targetBuyer: idea.target_buyer || "",
        },
      };

      try {
        sessionStorage.setItem(FACTORY_PREFILL_KEY, JSON.stringify(payload));
      } catch {
        // sessionStorage can fail in incognito + strict mode — fall back
        // to a window global so the factory page can still pick it up.
        (window as unknown as { __factoryPrefill?: unknown }).__factoryPrefill = payload;
      }

      router.push("/factory");
    } catch (e) {
      // Surface the failure via in-card alert (no toast system here).
      // Better to fail loudly than ship an empty-imageUrls payload that
      // would silently produce thin factory output.
      const msg = e instanceof Error ? e.message : "resolve failed";
      alert(
        `Couldn't resolve a competitor on Etsy for "${term.term}": ${msg}\n\n` +
          `The factory needs a real listing to clone-and-beat. Try a different idea or refresh signals.`,
      );
    } finally {
      setBuildingKey(null);
    }
  }

  // ── Generate ideas for a specific corroborated term ────────────────
  async function handleGenerate(term: CorroboratedTerm) {
    const key = term.normalized;
    setGenerating((s) => ({ ...s, [key]: true }));
    try {
      const resp = await fetch("/api/research/ideas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count: 3,
          niche: term.term,
          // Pass corroboration context so Gemini grounds the "why now"
          // in actual evidence instead of inventing it.
          context: {
            source_count: term.source_count,
            sources: term.sources,
            evidence: term.evidence,
            etsy_competition: term.etsy_competition,
            etsy_avg_favorites: term.etsy_avg_favorites,
          },
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const ideas: GeneratedIdea[] = json.ideas ?? json.created ?? [];
      setIdeasByTerm((s) => ({ ...s, [key]: ideas }));
      fetchSavedIdeas();
    } catch (e) {
      setIdeasByTerm((s) => ({
        ...s,
        [key]: [{ title: `Failed: ${e instanceof Error ? e.message : "error"}` }],
      }));
    } finally {
      setGenerating((s) => ({ ...s, [key]: false }));
    }
  }

  // ── Render guards ──────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div style={loadingStyle}>
        <div style={{ fontSize: 24, marginBottom: 12 }}>📡</div>
        <div style={{ fontSize: 14, color: "#9ca3af" }}>
          Scanning Google · Reddit · Etsy · Pinterest…
        </div>
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
          First fetch can take 30-45s · subsequent calls cached for 30 min
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={errorStyle}>
        <div style={{ fontSize: 13, color: "#fca5a5" }}>❌ {error}</div>
        <button onClick={() => fetchPulse(true)} style={btnPrimaryStyle}>
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  // Order categories by aggregate score (most promising niche first).
  const orderedCategories = Object.entries(data.by_category).sort((a, b) => {
    const sumA = a[1].reduce((s, t) => s + t.demand_score, 0);
    const sumB = b[1].reduce((s, t) => s + t.demand_score, 0);
    return sumB - sumA;
  });

  return (
    <div style={{ padding: "0 4px" }}>
      {/* ── Header ────────────────────────────────────────────── */}
      <div style={headerRowStyle}>
        <div>
          <div style={titleStyle}>Market Pulse — Real Demand Signals</div>
          <div style={subtitleStyle}>
            Cross-source corroborated terms · Last updated{" "}
            {data.cache_age_ms === 0
              ? "just now"
              : `${Math.round(data.cache_age_ms / 60000)} min ago`}
          </div>
        </div>
        <button onClick={() => fetchPulse(true)} disabled={loading} style={btnPrimaryStyle}>
          {loading ? "Refreshing…" : "🔄 Refresh signals"}
        </button>
      </div>

      {/* ── Digital Anchor Sweep panel ──────────────────────────
          Curated list of digital-product anchor searches the user can
          power-click through. Each opens a Marketplace Insights detail
          page in a new tab; the Chrome extension auto-captures via the
          Phase-6 scanner. Coverage updates every 8s while expanded. */}
      <AnchorSweepPanel />

      {/* ── Marketplace Insights freshness banner ────────────────
          Surfaces the state of buyer-side ground-truth data captured
          by the Chrome extension while browsing Etsy. Three goals:
            1. Tell the user how recent their captured data is
            2. Show coverage (how many categories + terms captured)
            3. Provide a one-click path to refresh by opening the
               Etsy Insights page (the extension auto-captures there)
          Hidden entirely until the summary loads to avoid flash. */}
      {insightsSummary && (() => {
        const tier = freshnessTier(insightsSummary.mostRecentCapturedAt);
        const age = humanizeAge(insightsSummary.mostRecentCapturedAt);
        const tierColors: Record<string, { bg: string; border: string; text: string }> = {
          fresh: { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.35)", text: "#86efac" },
          ok:    { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.35)", text: "#fbbf24" },
          stale: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.35)", text: "#fca5a5" },
          empty: { bg: "rgba(107,114,128,0.08)", border: "rgba(107,114,128,0.35)", text: "#9ca3af" },
        };
        const c = tierColors[tier];
        const tierMsg: Record<string, string> = {
          fresh: "fresh — last sync",
          ok:    "ok — last sync",
          stale: "stale — last sync",
          empty: "no captures yet",
        };
        const isEmpty = tier === "empty";
        return (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              marginBottom: 10,
              background: c.bg,
              border: `1px solid ${c.border}`,
              borderRadius: 10,
              fontSize: 12,
              color: "#d1d5db",
            }}
          >
            <span style={{ fontSize: 16 }}>🛒</span>
            <span style={{ fontWeight: 600, color: c.text }}>
              Etsy Marketplace Insights
            </span>
            <span style={{ color: "#9ca3af" }}>·</span>
            <span style={{ color: c.text }}>
              {tierMsg[tier]}
              {!isEmpty && <> <strong>{age}</strong></>}
            </span>
            {!isEmpty && (
              <>
                <span style={{ color: "#9ca3af" }}>·</span>
                <span>
                  <strong>{insightsSummary.byCategory.length}</strong> categories ·{" "}
                  <strong>{insightsSummary.total}</strong> captures
                </span>
              </>
            )}
            <a
              href={ETSY_INSIGHTS_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                marginLeft: "auto",
                padding: "5px 10px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 6,
                color: "#e5e7eb",
                fontSize: 11,
                fontWeight: 600,
                textDecoration: "none",
              }}
              title={
                isEmpty
                  ? "Open Etsy Marketplace Insights — the extension auto-captures buyer-search-volume data while you browse."
                  : "Open Etsy Marketplace Insights to refresh the captured signal. Click through additional categories to expand coverage."
              }
            >
              {isEmpty ? "Open Etsy Insights →" : "Refresh captures →"}
            </a>
          </div>
        );
      })()}

      {/* ── Source status pills ───────────────────────────────── */}
      <div style={sourcePillsRowStyle}>
        {data.sources.map((s) => (
          <div
            key={s.id}
            style={{
              ...sourcePillStyle,
              opacity: s.fetched && s.count > 0 ? 1 : 0.45,
              borderColor: s.fetched && s.count > 0 ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)",
            }}
            title={s.error || `${s.count} items`}
          >
            <span>{SOURCE_ICONS[s.id] || "•"}</span>
            <span style={{ fontWeight: 600 }}>{s.label}</span>
            <span style={{ color: "#9ca3af" }}>
              {s.fetched ? `${s.count}` : "✗"}
            </span>
          </div>
        ))}
      </div>

      {/* ── Honesty banner ────────────────────────────────────── */}
      <div style={honestyBannerStyle}>
        <strong style={{ color: "#fbbf24" }}>How this works:</strong>{" "}
        We pull live data from {data.sources.length} sources, surface only terms that appear in
        <strong> ≥2 sources</strong> (kills random noise), then fetch <strong>real Etsy listing counts + average favorites</strong> for each survivor. The demand score is pure math —
        Gemini only writes the &quot;why now&quot; rationale based on the evidence shown.{" "}
        <strong>{data.total_raw_items}</strong> raw signals →{" "}
        <strong>{data.total_corroborated}</strong> corroborated.
      </div>

      {data.alerts && data.alerts.length > 0 && (
        <section style={alertSectionStyle}>
          <div style={alertHeaderStyle}>
            <div>
              <div style={alertEyebrowStyle}>Etsy Trend Alerts</div>
              <div style={alertTitleStyle}>
                Buyer searches worth turning into digital products
              </div>
              <div style={alertSubtitleStyle}>
                These come from your Marketplace Insights captures. Physical trends are kept when they can become cross-stitch, SVG, printable, wall-art, or planner products.
              </div>
            </div>
            <a
              href={ETSY_INSIGHTS_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={btnSecondaryStyle}
            >
              Open Insights ↗
            </a>
          </div>

          <div style={alertGridStyle}>
            {data.alerts.slice(0, 6).map((alert) => (
              <TrendAlertCard
                key={alert.normalized}
                alert={alert}
                generating={!!generating[alert.normalized]}
                ideas={ideasByTerm[alert.normalized]}
                buildingKey={buildingKey}
                onGenerate={() => handleGenerate(alert)}
                onBuildInFactory={(idea) => handleBuildInFactory(idea, alert)}
              />
            ))}
          </div>
        </section>
      )}

      {savedIdeas.length > 0 && (
        <div style={savedIdeasPanelStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ color: "#e5e7eb", fontWeight: 800, fontSize: 13 }}>
                Saved Opportunity Briefs
              </div>
              <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 2 }}>
                Latest generated ideas from the database — these should become the Research source of truth.
              </div>
            </div>
            <button onClick={fetchSavedIdeas} style={btnSecondaryStyle}>Refresh</button>
          </div>
          <div style={savedIdeasGridStyle}>
            {savedIdeas.slice(0, 4).map((idea) => (
              <div key={idea.id || idea.title} style={savedIdeaCardStyle}>
                <div style={{ fontWeight: 700, color: "#fbbf24", fontSize: 12, lineHeight: 1.35 }}>
                  {idea.title}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {idea.niche && <span style={miniPillStyle}>{idea.niche}</span>}
                  {idea.product_type && <span style={miniPillStyle}>{idea.product_type}</span>}
                  {typeof idea.demand_score === "number" && <span style={miniPillStyle}>Demand {idea.demand_score}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Categories ────────────────────────────────────────── */}
      {orderedCategories.length === 0 && (
        <div style={emptyStyle}>
          No corroborated signals right now. Click Refresh to try again.
        </div>
      )}

      {orderedCategories.map(([cat, terms]) => {
        const meta = CATEGORY_LABELS[cat] || { emoji: "💡", label: cat };
        return (
          <section key={cat} style={categoryStyle}>
            <div style={categoryHeaderStyle}>
              <span style={{ fontSize: 20 }}>{meta.emoji}</span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{meta.label}</span>
              <span style={{ color: "#6b7280", fontSize: 12 }}>{terms.length} signal{terms.length !== 1 ? "s" : ""}</span>
            </div>

            <div style={termGridStyle}>
              {terms.map((t) => (
                <TermCard
                  key={t.normalized}
                  term={t}
                  generating={!!generating[t.normalized]}
                  ideas={ideasByTerm[t.normalized]}
                  evidenceOpen={!!expandedEvidence[t.normalized]}
                  buildingKey={buildingKey}
                  onToggleEvidence={() =>
                    setExpandedEvidence((s) => ({ ...s, [t.normalized]: !s[t.normalized] }))
                  }
                  onGenerate={() => handleGenerate(t)}
                  onBuildInFactory={(idea) => handleBuildInFactory(idea, t)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// TrendAlertCard — Etsy Marketplace Insights "big search this week" card
// ══════════════════════════════════════════════════════════════════════
function TrendAlertCard({
  alert,
  generating,
  ideas,
  buildingKey,
  onGenerate,
  onBuildInFactory,
}: {
  alert: MarketAlert;
  generating: boolean;
  ideas: GeneratedIdea[] | undefined;
  buildingKey: string | null;
  onGenerate: () => void;
  onBuildInFactory: (idea: GeneratedIdea) => void;
}) {
  const velocity =
    alert.etsy_avg_favorites && alert.etsy_competition && alert.etsy_competition > 0
      ? alert.etsy_avg_favorites / (alert.etsy_competition / 10000)
      : null;

  return (
    <div style={alertCardStyle}>
      {alert.etsy_top_image && (
        <div
          style={{
            ...alertImageStyle,
            backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.55)), url("${alert.etsy_top_image}")`,
          }}
        />
      )}
      <div style={alertCardBodyStyle}>
        <div style={alertSourceRowStyle}>
          <span style={liveDotStyle} />
          <span>{alert.source_label}</span>
          <span style={{ marginLeft: "auto", color: "#9ca3af" }}>
            score {alert.demand_score}
          </span>
        </div>

        <div style={bigSearchStyle}>
          A big search this week: <span>{alert.term}</span>
        </div>

        {alert.insight_context && (
          <div style={alertContextStyle}>{alert.insight_context}</div>
        )}

        <div style={alertStatsStyle}>
          <div style={alertStatBoxStyle}>
            <span style={alertStatLabelStyle}>Etsy listings</span>
            <strong style={alertStatValueStyle}>{alert.etsy_competition !== null ? alert.etsy_competition.toLocaleString() : "—"}</strong>
          </div>
          <div style={alertStatBoxStyle}>
            <span style={alertStatLabelStyle}>Avg favorites</span>
            <strong style={alertStatValueStyle}>{alert.etsy_avg_favorites !== null ? alert.etsy_avg_favorites.toLocaleString() : "—"}</strong>
          </div>
          <div style={alertStatBoxStyle}>
            <span style={alertStatLabelStyle}>Velocity</span>
            <strong style={alertStatValueStyle}>{velocity !== null ? velocity.toFixed(1) : "—"}</strong>
          </div>
        </div>

        <div style={laneGridStyle}>
          {alert.buildable_lanes.map((lane) => (
            <a
              key={lane.id}
              href={`${lane.path}?q=${encodeURIComponent(lane.query)}`}
              style={lanePillStyle}
              title={lane.fit}
            >
              <strong>{lane.label}</strong>
              <span>{lane.studio}</span>
            </a>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button
            onClick={onGenerate}
            disabled={generating}
            style={{ ...btnPrimaryStyle, opacity: generating ? 0.65 : 1 }}
          >
            {generating ? "Generating angles…" : "Generate product angles"}
          </button>
          <a
            href={`https://www.etsy.com/search?q=${encodeURIComponent(alert.term)}`}
            target="_blank"
            rel="noreferrer"
            style={btnSecondaryStyle}
          >
            Validate on Etsy ↗
          </a>
        </div>

        {ideas && ideas.length > 0 && (
          <div style={ideasContainerStyle}>
            {ideas.map((idea, i) => {
              const myBuildKey = `${alert.normalized}::${idea.title.slice(0, 60)}`;
              const isBuilding = buildingKey === myBuildKey;
              const someoneElseBuilding = buildingKey !== null && !isBuilding;
              return (
                <div key={i} style={ideaCardStyle}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "#fbbf24", marginBottom: 4 }}>
                    {idea.title}
                  </div>
                  {idea.why_now && (
                    <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.45 }}>
                      {idea.why_now}
                    </div>
                  )}
                  <button
                    onClick={() => onBuildInFactory(idea)}
                    disabled={isBuilding || someoneElseBuilding}
                    style={{
                      ...buildInFactoryBtnStyle,
                      opacity: someoneElseBuilding ? 0.4 : 1,
                      cursor: isBuilding || someoneElseBuilding ? "default" : "pointer",
                    }}
                  >
                    {isBuilding ? "Finding competitor…" : "Send to Product Factory →"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// TermCard — one corroborated term + its generated ideas
// ══════════════════════════════════════════════════════════════════════
function TermCard({
  term,
  generating,
  ideas,
  evidenceOpen,
  buildingKey,
  onToggleEvidence,
  onGenerate,
  onBuildInFactory,
}: {
  term: CorroboratedTerm;
  generating: boolean;
  ideas: GeneratedIdea[] | undefined;
  evidenceOpen: boolean;
  buildingKey: string | null;
  onToggleEvidence: () => void;
  onGenerate: () => void;
  onBuildInFactory: (idea: GeneratedIdea) => void;
}) {
  // Velocity = avg favorites per 10K listings. The killer signal.
  const velocity =
    term.etsy_avg_favorites && term.etsy_competition && term.etsy_competition > 0
      ? term.etsy_avg_favorites / (term.etsy_competition / 10000)
      : null;

  const scoreColor =
    term.demand_score >= 50
      ? { bg: "rgba(34,197,94,0.15)", fg: "#86efac", border: "rgba(34,197,94,0.4)" }
      : term.demand_score >= 30
        ? { bg: "rgba(245,158,11,0.15)", fg: "#fbbf24", border: "rgba(245,158,11,0.4)" }
        : { bg: "rgba(107,114,128,0.15)", fg: "#9ca3af", border: "rgba(107,114,128,0.4)" };

  return (
    <div style={cardStyle}>
      {/* ── Top row: score + term ─────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
        <div
          style={{
            ...scoreChipStyle,
            background: scoreColor.bg,
            color: scoreColor.fg,
            borderColor: scoreColor.border,
          }}
          title="Demand score (0-100). Math: source count + specificity + favorites velocity + low-competition bonus − saturation penalty."
        >
          {term.demand_score}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={termTitleStyle}>{term.term}</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
            {term.sources.map((s) => (
              <span key={s} style={srcBadgeStyle} title={s}>
                {SOURCE_ICONS[s] || "•"} {s.replace(/-/g, " ")}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Stats row ───────────────────────────────────────── */}
      <div style={statsRowStyle}>
        <div style={statStyle}>
          <div style={statLabelStyle}>Etsy listings</div>
          <div style={statValueStyle}>
            {term.etsy_competition !== null ? term.etsy_competition.toLocaleString() : "—"}
            <span style={statBadgeStyle}>Real</span>
          </div>
        </div>
        <div style={statStyle}>
          <div style={statLabelStyle}>Avg favorites</div>
          <div style={statValueStyle}>
            {term.etsy_avg_favorites !== null ? term.etsy_avg_favorites.toLocaleString() : "—"}
            <span style={statBadgeStyle}>Real</span>
          </div>
        </div>
        <div style={statStyle}>
          <div style={statLabelStyle}>Velocity</div>
          <div
            style={{
              ...statValueStyle,
              color: velocity && velocity >= 10 ? "#86efac" : "#e5e7eb",
            }}
            title="Avg favorites per 10K Etsy listings. 10+ is strong; 100+ is exceptional."
          >
            {velocity !== null ? velocity.toFixed(1) : "—"}
          </div>
        </div>
      </div>

      {/* ── Why now ─────────────────────────────────────────── */}
      {term.why_now && (
        <div style={whyNowStyle}>
          <span style={{ color: "#9ca3af" }}>Why now:</span> {term.why_now}
        </div>
      )}

      {/* ── Evidence accordion ──────────────────────────────── */}
      <button onClick={onToggleEvidence} style={evidenceToggleStyle}>
        {evidenceOpen ? "▼" : "▶"} Source evidence ({term.evidence.length})
      </button>
      {evidenceOpen && (
        <div style={evidenceListStyle}>
          {term.evidence.map((e, i) => (
            <div key={i} style={evidenceItemStyle}>
              <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>
                {SOURCE_ICONS[e.source] || "•"} {e.source.replace(/-/g, " ")}
                {e.score !== undefined ? ` · score ${e.score}` : ""}
              </div>
              <div style={{ fontSize: 11, color: "#e5e7eb" }}>
                {e.url ? (
                  <a href={e.url} target="_blank" rel="noreferrer" style={evidenceLinkStyle}>
                    {e.text.slice(0, 140)}
                  </a>
                ) : (
                  e.text.slice(0, 140)
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Generate button ─────────────────────────────────── */}
      <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
        <button
          onClick={onGenerate}
          disabled={generating}
          style={{
            ...btnPrimaryStyle,
            flex: 1,
            opacity: generating ? 0.6 : 1,
            cursor: generating ? "default" : "pointer",
          }}
        >
          {generating ? "Generating…" : "💡 Generate 3 product ideas"}
        </button>
        <a
          href={`https://www.etsy.com/search?q=${encodeURIComponent(term.term)}`}
          target="_blank"
          rel="noreferrer"
          style={btnSecondaryStyle}
        >
          View on Etsy ↗
        </a>
      </div>

      {/* ── Generated ideas ─────────────────────────────────── */}
      {ideas && ideas.length > 0 && (
        <div style={ideasContainerStyle}>
          {ideas.map((idea, i) => (
            <div key={i} style={ideaCardStyle}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#fbbf24", marginBottom: 4 }}>
                {idea.title}
              </div>
              {idea.why_now && (
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>
                  {idea.why_now}
                </div>
              )}
              {idea.target_buyer && (
                <div style={{ fontSize: 11, color: "#a78bfa" }}>
                  Target: {idea.target_buyer}
                </div>
              )}
              {idea.suggested_price && (
                <div style={{ fontSize: 11, color: "#86efac", marginTop: 2 }}>
                  Suggested price: ${idea.suggested_price}
                </div>
              )}
              {(() => {
                // suggested_tags arrives in 3 shapes:
                //   1. real array  ["a","b","c"]                 (preferred)
                //   2. JSON string '["a","b","c"]'               (what we're seeing in practice)
                //   3. comma string  "a, b, c"                   (Gemini fallback)
                // Normalize all three so the UI is bullet-proof.
                const rawTags = idea.suggested_tags;
                let tags: string[] = [];
                if (Array.isArray(rawTags)) {
                  tags = rawTags.map((t) => String(t).trim()).filter(Boolean);
                } else if (typeof rawTags === "string") {
                  const s = rawTags.trim();
                  if (s.startsWith("[") && s.endsWith("]")) {
                    // Try JSON parse first
                    try {
                      const parsed = JSON.parse(s);
                      if (Array.isArray(parsed)) {
                        tags = parsed.map((t) => String(t).trim()).filter(Boolean);
                      }
                    } catch {
                      // fall through to comma split below
                    }
                  }
                  if (tags.length === 0) {
                    tags = s
                      .replace(/^\[|\]$/g, "")
                      .split(/[,;]/)
                      .map((t) => t.replace(/^["']|["']$/g, "").trim())
                      .filter(Boolean);
                  }
                }
                if (tags.length === 0) return null;
                return (
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 4 }}>
                    {tags.slice(0, 8).map((tag, j) => (
                      <span key={j} style={tagPillStyle}>
                        {tag}
                      </span>
                    ))}
                  </div>
                );
              })()}

              {/* ── Build in Factory ── resolves a real Etsy competitor
                  for clone-and-beat, then hands off via sessionStorage. */}
              {(() => {
                const myBuildKey = `${term.normalized}::${idea.title.slice(0, 60)}`;
                const isBuilding = buildingKey === myBuildKey;
                const someoneElseBuilding = buildingKey !== null && !isBuilding;
                return (
                  <button
                    onClick={() => onBuildInFactory(idea)}
                    disabled={isBuilding || someoneElseBuilding}
                    style={{
                      ...buildInFactoryBtnStyle,
                      opacity: someoneElseBuilding ? 0.4 : 1,
                      cursor: isBuilding || someoneElseBuilding ? "default" : "pointer",
                    }}
                    title="Resolves a real Etsy competitor on this niche, then hands the listing data (photos + description + tags) to Product Factory's clone-and-beat engine."
                  >
                    {isBuilding
                      ? "🔍 Finding top competitor on Etsy…"
                      : "🏭 Build this in Product Factory →"}
                  </button>
                );
              })()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Styles — all inline, no Tailwind dependency (matches other tabs)
// ══════════════════════════════════════════════════════════════════════

const loadingStyle: React.CSSProperties = {
  padding: "60px 20px",
  textAlign: "center",
  background: "rgba(15,17,23,0.5)",
  borderRadius: 12,
  margin: "20px 0",
};

const errorStyle: React.CSSProperties = {
  padding: 20,
  textAlign: "center",
  background: "rgba(239,68,68,0.1)",
  border: "1px solid rgba(239,68,68,0.3)",
  borderRadius: 12,
  margin: "20px 0",
};

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 14,
  gap: 12,
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: "#fbbf24",
  letterSpacing: -0.2,
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#9ca3af",
  marginTop: 2,
};

const sourcePillsRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  marginBottom: 12,
};

const sourcePillStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  fontSize: 10,
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(15,17,23,0.6)",
  color: "#e5e7eb",
};

const honestyBannerStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#cbd5e1",
  background: "rgba(245,158,11,0.06)",
  border: "1px solid rgba(245,158,11,0.18)",
  borderRadius: 8,
  padding: "8px 12px",
  marginBottom: 16,
  lineHeight: 1.5,
};

const alertSectionStyle: React.CSSProperties = {
  marginBottom: 20,
  padding: 14,
  borderRadius: 14,
  border: "1px solid rgba(34,197,94,0.22)",
  background:
    "linear-gradient(135deg, rgba(8,47,73,0.28), rgba(15,23,42,0.76) 42%, rgba(20,83,45,0.18))",
  boxShadow: "0 18px 60px rgba(0,0,0,0.22)",
};

const alertHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 12,
  flexWrap: "wrap",
};

const alertEyebrowStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#86efac",
  textTransform: "uppercase",
  letterSpacing: 1.2,
  fontWeight: 800,
};

const alertTitleStyle: React.CSSProperties = {
  marginTop: 4,
  color: "#f8fafc",
  fontSize: 18,
  fontWeight: 900,
  letterSpacing: 0,
};

const alertSubtitleStyle: React.CSSProperties = {
  marginTop: 4,
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.45,
  maxWidth: 820,
};

const alertGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 12,
};

const alertCardStyle: React.CSSProperties = {
  minHeight: 360,
  overflow: "hidden",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(2,6,23,0.82)",
  boxShadow: "0 16px 38px rgba(0,0,0,0.28)",
};

const alertImageStyle: React.CSSProperties = {
  height: 128,
  backgroundSize: "cover",
  backgroundPosition: "center",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const alertCardBodyStyle: React.CSSProperties = {
  padding: 12,
};

const alertSourceRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  color: "#cbd5e1",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 1,
  fontWeight: 700,
};

const liveDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
  background: "#34d399",
  boxShadow: "0 0 14px rgba(52,211,153,0.8)",
};

const bigSearchStyle: React.CSSProperties = {
  marginTop: 10,
  color: "#e5e7eb",
  fontSize: 17,
  lineHeight: 1.25,
  fontWeight: 800,
};

const alertContextStyle: React.CSSProperties = {
  marginTop: 8,
  color: "#94a3b8",
  fontSize: 11,
  lineHeight: 1.45,
};

const alertStatsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 6,
  marginTop: 12,
};

const alertStatBoxStyle: React.CSSProperties = {
  minWidth: 0,
};

const alertStatLabelStyle: React.CSSProperties = {
  display: "block",
  color: "#94a3b8",
  fontSize: 10,
  lineHeight: 1.1,
};

const alertStatValueStyle: React.CSSProperties = {
  display: "block",
  color: "#f8fafc",
  fontSize: 14,
  lineHeight: 1.25,
  marginTop: 2,
  overflowWrap: "anywhere",
};

const laneGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 6,
  marginTop: 10,
};

const lanePillStyle: React.CSSProperties = {
  minHeight: 54,
  padding: "8px 9px",
  borderRadius: 8,
  border: "1px solid rgba(52,211,153,0.22)",
  background: "rgba(16,185,129,0.08)",
  color: "#d1fae5",
  textDecoration: "none",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 2,
  fontSize: 10,
};

const savedIdeasPanelStyle: React.CSSProperties = {
  marginBottom: 18,
  padding: 12,
  background: "rgba(15,17,23,0.72)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
};

const savedIdeasGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 8,
  marginTop: 10,
};

const savedIdeaCardStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 9,
  background: "rgba(255,255,255,0.035)",
  border: "1px solid rgba(255,255,255,0.07)",
};

const miniPillStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#cbd5e1",
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 999,
  padding: "3px 6px",
};

const emptyStyle: React.CSSProperties = {
  padding: 30,
  textAlign: "center",
  color: "#6b7280",
  fontSize: 12,
};

const categoryStyle: React.CSSProperties = {
  marginBottom: 22,
};

const categoryHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 10,
  paddingBottom: 6,
  borderBottom: "1px solid rgba(255,255,255,0.05)",
};

const termGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
  gap: 10,
};

const cardStyle: React.CSSProperties = {
  background: "rgba(15,17,23,0.6)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 10,
  padding: 12,
};

const scoreChipStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 8,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 800,
  fontSize: 16,
  border: "1px solid",
  flexShrink: 0,
};

const termTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#e5e7eb",
  lineHeight: 1.3,
  wordBreak: "break-word",
};

const srcBadgeStyle: React.CSSProperties = {
  fontSize: 9,
  color: "#9ca3af",
  background: "rgba(255,255,255,0.04)",
  padding: "2px 6px",
  borderRadius: 4,
  whiteSpace: "nowrap",
};

const statsRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 6,
  margin: "10px 0",
  padding: "8px 0",
  borderTop: "1px solid rgba(255,255,255,0.04)",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
};

const statStyle: React.CSSProperties = {
  textAlign: "center",
};

const statLabelStyle: React.CSSProperties = {
  fontSize: 9,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 2,
};

const statValueStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#e5e7eb",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 3,
};

const statBadgeStyle: React.CSSProperties = {
  fontSize: 8,
  color: "#86efac",
  background: "rgba(34,197,94,0.12)",
  padding: "1px 4px",
  borderRadius: 3,
  fontWeight: 600,
};

const whyNowStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#cbd5e1",
  lineHeight: 1.4,
  fontStyle: "italic",
  marginBottom: 8,
};

const evidenceToggleStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#9ca3af",
  fontSize: 10,
  cursor: "pointer",
  padding: "2px 0",
  textAlign: "left",
};

const evidenceListStyle: React.CSSProperties = {
  background: "rgba(0,0,0,0.25)",
  borderRadius: 6,
  padding: 8,
  marginTop: 4,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  maxHeight: 200,
  overflowY: "auto",
};

const evidenceItemStyle: React.CSSProperties = {
  borderLeft: "2px solid rgba(245,158,11,0.3)",
  paddingLeft: 8,
};

const evidenceLinkStyle: React.CSSProperties = {
  color: "#cbd5e1",
  textDecoration: "none",
};

const btnPrimaryStyle: React.CSSProperties = {
  background: "rgba(245,158,11,0.2)",
  border: "1px solid rgba(245,158,11,0.4)",
  color: "#fbbf24",
  padding: "6px 12px",
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const btnSecondaryStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#9ca3af",
  padding: "6px 10px",
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
  textDecoration: "none",
  whiteSpace: "nowrap",
  display: "flex",
  alignItems: "center",
};

const ideasContainerStyle: React.CSSProperties = {
  marginTop: 10,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const ideaCardStyle: React.CSSProperties = {
  background: "rgba(245,158,11,0.05)",
  border: "1px solid rgba(245,158,11,0.15)",
  borderRadius: 6,
  padding: 8,
};

const tagPillStyle: React.CSSProperties = {
  fontSize: 9,
  color: "#a78bfa",
  background: "rgba(167,139,250,0.12)",
  padding: "2px 5px",
  borderRadius: 3,
};

// Build-in-Factory button — visually distinct from "Generate ideas"
// (which is amber). Emerald = "ready to build" actionable next step.
const buildInFactoryBtnStyle: React.CSSProperties = {
  marginTop: 8,
  width: "100%",
  background: "rgba(16,185,129,0.15)",
  border: "1px solid rgba(16,185,129,0.4)",
  color: "#86efac",
  padding: "7px 10px",
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  letterSpacing: 0.2,
};
