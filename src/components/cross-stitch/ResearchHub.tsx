"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ────────────────────────────────────────────────────────────────

interface ScanStatus {
  isRunning: boolean;
  scanRunId: number | null;
  keywordsScanned: number;
  keywordsTotal: number;
  listingsFound: number;
  listingsNew: number;
  currentKeyword: string;
  errors: string[];
}

interface ScanRun {
  id: number;
  started_at: string;
  completed_at: string | null;
  keywords_total: number;
  keywords_scanned: number;
  listings_found: number;
  listings_new: number;
  status: string;
}

interface TrackedListing {
  id: number;
  listing_id: string;
  shop_name: string | null;
  title: string;
  price: number;
  quantity: number;
  views: number;
  favorites: number;
  sales_estimate: number;
  tags: string | null;
  category: string | null;
  listing_age_days: number;
  image_url: string | null;
  url: string | null;
  keyword?: string;
  revenue_estimate?: number;
}

interface CategoryAnalysis {
  keyword: string;
  totalResults: number;
  listingsFetched: number;
  avgPrice: number;
  avgFavorites: number;
  competitionLevel: string;
  demandScore: number;
  topTags: string[];
  avgRevenue: number;
  error: string | null;
}

interface TrendItem {
  category: string;
  currentFavorites: number;
  previousFavorites: number;
  changePercent: number;
  currentPrice: number;
  previousPrice: number;
  priceChangePercent: number;
  direction: "rising" | "declining" | "stable";
}

interface PriceInsight {
  category: string;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  medianPrice: number;
  sweetSpot: number;
}

interface OpportunityGap {
  category: string;
  demandScore: number;
  competitionLevel: string;
  avgFavorites: number;
  avgPrice: number;
  totalResults: number;
  opportunityScore: number;
  reason: string;
}

interface TagInsight {
  tag: string;
  frequency: number;
  avgFavorites: number;
  categories: string[];
}

interface AnalysisOverview {
  totalKeywordsScanned: number;
  uniqueListings: number;
  avgPrice: number;
  avgFavorites: number;
  topCategory: string;
  totalMarketListings: number;
}

interface FullAnalysis {
  scanRunId: number;
  overview: AnalysisOverview;
  categories: CategoryAnalysis[];
  topProducts: TrackedListing[];
  trends: TrendItem[];
  priceInsights: PriceInsight[];
  opportunities: OpportunityGap[];
  tagAnalysis: TagInsight[];
}

interface ManualSearchResult {
  keyword: string;
  total_results: number;
  listings: TrackedListing[];
  analysis: {
    avg_price: number;
    avg_favorites: number;
    competition_level: string;
    demand_score: number;
  };
  top_tags: string[];
}

interface ProductIdea {
  id: number;
  title: string;
  niche: string | null;
  product_type: string | null;
  why_now: string | null;
  target_buyer: string | null;
  suggested_price: number;
  demand_score: number;
  competition_score: number;
  urgency_score: number;
  confidence: number;
  suggested_tags: string | null;
  suggested_keywords: string | null;
  status: string;
  generated_at: string;
}

interface IdeasMeta {
  engine: "gemini" | "deterministic_fallback";
  style: string;
  ownWinnerCount: number;
  topOwnWinner: string | null;
  competitorSeedCount: number;
  topCompetitorSeed: string | null;
  marketLaneCount: number;
  topMarketLane: string | null;
  insightTermCount: number;
  topInsightTerm: string | null;
  droppedDuplicates: number;
}

// ── External trend types (mirrors /api/cross-stitch/external-trends) ──────

interface ExternalRedditPost {
  title: string;
  url: string;
  score: number;
  numComments: number;
  thumbnail: string | null;
  subjects: string[];
}

interface ExternalEtsyTerm {
  term: string;
  source: "etsy_autocomplete";
}

interface ExternalPinterestTerm {
  keyword: string;
  pctChange?: number;
}

interface ExternalTrends {
  redditTop: ExternalRedditPost[];
  redditNew: ExternalRedditPost[];
  etsyTrends: ExternalEtsyTerm[];
  pinterestTrends: ExternalPinterestTerm[];
  fetchedAt: string;
  errors: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────

function getDemandColor(score: number) {
  if (score >= 70) return "text-emerald-400 bg-emerald-500/15";
  if (score >= 40) return "text-amber-400 bg-amber-500/15";
  return "text-red-400 bg-red-500/15";
}

function getCompetitionColor(level: string) {
  if (level === "low") return "text-emerald-400 bg-emerald-500/15";
  if (level === "medium") return "text-amber-400 bg-amber-500/15";
  return "text-red-400 bg-red-500/15";
}

function getDirectionColor(dir: string) {
  if (dir === "rising") return "text-green-400";
  if (dir === "declining") return "text-red-400";
  return "text-[var(--text-muted)]";
}

function getDirectionIcon(dir: string) {
  if (dir === "rising") return "↑";
  if (dir === "declining") return "↓";
  return "→";
}

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p.map(String);
  } catch { /* noop */ }
  return raw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
}

const CS_QUICK_SEARCHES = [
  "cross stitch pattern pdf",
  "funny cross stitch goose",
  "kawaii cross stitch",
  "cross stitch beginner",
  "cross stitch animal pattern",
  "cottagecore cross stitch",
  "cross stitch floral pdf",
  "funny cross stitch quote",
];

// ── Tab definitions ───────────────────────────────────────────────────────

type Tab = "dashboard" | "products" | "categories" | "trends" | "strategy" | "search" | "ideas";

const TABS: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "📊 Dashboard" },
  { key: "products", label: "🏆 Top Products" },
  { key: "categories", label: "📁 Categories" },
  { key: "trends", label: "📈 Trends" },
  { key: "strategy", label: "🎯 Strategy" },
  { key: "search", label: "🔍 Search" },
  { key: "ideas", label: "✦ Ideas" },
];

// ── Main component ────────────────────────────────────────────────────────

export function CrossStitchResearchHub({
  onConvert,
  onStartAutoPipeline,
  autoPipelineActive,
}: {
  onConvert?: (query: string, imageUrl?: string, title?: string) => void;
  /** Fire the Phase 1 Auto-Pipeline orchestrator for N items. */
  onStartAutoPipeline?: (count: number) => void;
  /** True while the orchestrator is mid-run; trigger button disables. */
  autoPipelineActive?: boolean;
} = {}) {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanRun[]>([]);
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Manual search
  const [keyword, setKeyword] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<ManualSearchResult | null>(null);
  const [searchError, setSearchError] = useState("");
  const [sortBy, setSortBy] = useState<"favorites" | "sales" | "price">("favorites");

  // Ideas — persisted to localStorage so generated ideas survive
  // tab switches (Convert → Ideas) and page refreshes.  Without
  // persistence, every navigation resets to "No ideas yet" forcing
  // the user to spend Gemini calls to regenerate.
  const IDEAS_LS_KEY = "cross-stitch-research-ideas-v1";
  const IDEAS_STYLE_LS_KEY = "cross-stitch-research-ideas-style-v1";
  const [ideas, setIdeas] = useState<ProductIdea[]>([]);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideasError, setIdeasError] = useState<string | null>(null);
  const [ideasMeta, setIdeasMeta] = useState<IdeasMeta | null>(null);
  const [ideasStyle, setIdeasStyle] = useState<"all" | "funny" | "bookmarks" | "folk" | "bestseller">("bestseller");
  const [ideasCount, setIdeasCount] = useState(10);

  // Hydrate ideas + style from localStorage on mount.  Wrapped in
  // useEffect (not useState initializer) so SSR doesn't crash —
  // localStorage is browser-only.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(IDEAS_LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ProductIdea[];
        if (Array.isArray(parsed) && parsed.length > 0) setIdeas(parsed);
      }
      const style = localStorage.getItem(IDEAS_STYLE_LS_KEY);
      if (style === "funny" || style === "all" || style === "bookmarks" || style === "folk" || style === "bestseller") setIdeasStyle(style);
      // Old "weird" preset (now removed) → migrate silently to "all".
      if (style === "weird") {
        setIdeasStyle("all");
        try { localStorage.setItem(IDEAS_STYLE_LS_KEY, "all"); } catch { /* ignore */ }
      }
    } catch { /* corrupt JSON or storage disabled — ignore */ }
  }, []);

  // Persist ideas whenever they change (after Generate appends new ones).
  useEffect(() => {
    try {
      if (ideas.length > 0) {
        localStorage.setItem(IDEAS_LS_KEY, JSON.stringify(ideas));
      } else {
        localStorage.removeItem(IDEAS_LS_KEY);
      }
    } catch { /* storage full / disabled — non-fatal */ }
  }, [ideas]);

  // Persist style preference (small string, cheap).
  useEffect(() => {
    try { localStorage.setItem(IDEAS_STYLE_LS_KEY, ideasStyle); } catch { /* skip */ }
  }, [ideasStyle]);

  const fetchStatus = useCallback(async () => {
    try {
      const resp = await fetch("/api/cross-stitch/scan?action=status");
      const data = await resp.json();
      setScanStatus(data);
      return data as ScanStatus;
    } catch { return null; }
  }, []);

  const fetchAnalysis = useCallback(async () => {
    try {
      const resp = await fetch("/api/research/analysis");
      if (resp.ok) setAnalysis(await resp.json());
    } catch { /* no data yet */ }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const resp = await fetch("/api/cross-stitch/scan?action=history");
      const data = await resp.json();
      setScanHistory(data);
    } catch { /* skip */ }
  }, []);

  useEffect(() => {
    Promise.all([fetchStatus(), fetchAnalysis(), fetchHistory()]).then(() => setLoading(false));
  }, [fetchStatus, fetchAnalysis, fetchHistory]);

  useEffect(() => {
    if (scanStatus?.isRunning) {
      pollingRef.current = setInterval(async () => {
        const status = await fetchStatus();
        if (status && !status.isRunning) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          await fetchAnalysis();
          await fetchHistory();
        }
      }, 1000);
    } else {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [scanStatus?.isRunning, fetchStatus, fetchAnalysis, fetchHistory]);

  async function startScan() {
    try {
      await fetch("/api/cross-stitch/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      await fetchStatus();
    } catch { /* skip */ }
  }

  async function cancelScan() {
    try {
      await fetch("/api/cross-stitch/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
      await fetchStatus();
    } catch { /* skip */ }
  }

  async function searchNiche(kw?: string) {
    const q = kw || keyword;
    if (!q.trim()) return;
    setSearching(true); setSearchError(""); setSearchResult(null);
    try {
      const resp = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyword: q, limit: 25 }) });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Search failed");
      setSearchResult(data);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally { setSearching(false); }
  }

  async function generateIdeas() {
    setIdeasLoading(true); setIdeasError(null);
    try {
      const style = ideasStyle === "bestseller" ? "all" : ideasStyle;
      const resp = await fetch("/api/cross-stitch/bestseller-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: ideasCount, style }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Generation failed");
      setIdeasMeta(data.meta ?? null);
      setIdeas((prev) => [...(data.ideas || []), ...prev]);
    } catch (err) {
      setIdeasError(err instanceof Error ? err.message : "Generation failed");
    } finally { setIdeasLoading(false); }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-[var(--text-muted)]">Loading market data…</div>;
  }

  const isRunning = scanStatus?.isRunning ?? false;
  const progress = scanStatus && scanStatus.keywordsTotal > 0 ? Math.round((scanStatus.keywordsScanned / scanStatus.keywordsTotal) * 100) : 0;
  const lastScan = scanHistory[0];

  return (
    <div className="flex flex-col gap-5">

      {/* ── Tab bar ── */}
      <div className="flex flex-wrap gap-1 bg-white/[0.04] rounded-xl p-1 border border-white/[0.06]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-[12px] font-semibold transition-all ${
              activeTab === tab.key
                ? "bg-white/[0.12] text-white shadow-sm"
                : tab.key === "ideas"
                ? "text-amber-400/70 hover:text-amber-300"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Scan control bar (Dashboard only) ── */}
      {activeTab === "dashboard" && (
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {!isRunning ? (
                <button onClick={startScan} className="px-5 py-2.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors text-[13px]">
                  🔍 Scan Cross-Stitch Market
                </button>
              ) : (
                <button onClick={cancelScan} className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors text-[13px]">
                  ✕ Cancel Scan
                </button>
              )}
              {lastScan && !isRunning && (
                <span className="text-[11px] text-[var(--text-muted)]">
                  Last scan: {new Date(lastScan.started_at).toLocaleDateString()} —{" "}
                  <span className={lastScan.status === "completed" ? "text-emerald-400" : "text-amber-400"}>{lastScan.status}</span>
                  {lastScan.listings_found > 0 && ` · ${lastScan.listings_found.toLocaleString()} listings`}
                </span>
              )}
            </div>
            {isRunning && scanStatus && (
              <span className="text-[11px] text-[var(--text-muted)]">
                {scanStatus.keywordsScanned}/{scanStatus.keywordsTotal} keywords · {scanStatus.listingsFound.toLocaleString()} listings
              </span>
            )}
          </div>
          {isRunning && scanStatus && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-amber-400 font-medium truncate max-w-xs">{scanStatus.currentKeyword}</span>
                <span className="text-[11px] text-[var(--text-muted)]">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab content ── */}
      {activeTab === "dashboard" && <DashboardContent analysis={analysis} scanHistory={scanHistory} onConvert={onConvert} />}
      {activeTab === "products" && <ProductsContent products={analysis?.topProducts || []} onConvert={onConvert} />}
      {activeTab === "categories" && <CategoriesContent categories={analysis?.categories || []} onConvert={onConvert} />}
      {activeTab === "trends" && <TrendsContent trends={analysis?.trends || []} onConvert={onConvert} />}
      {activeTab === "strategy" && <StrategyContent opportunities={analysis?.opportunities || []} priceInsights={analysis?.priceInsights || []} tagAnalysis={analysis?.tagAnalysis || []} onConvert={onConvert} />}
      {activeTab === "search" && (
        <SearchContent
          keyword={keyword} setKeyword={setKeyword}
          searching={searching} searchResult={searchResult} searchError={searchError}
          sortBy={sortBy} setSortBy={setSortBy} searchNiche={searchNiche}
          onConvert={onConvert}
        />
      )}
      {activeTab === "ideas" && (
        <IdeasContent
          ideas={ideas} loading={ideasLoading} error={ideasError}
          meta={ideasMeta}
          style={ideasStyle} setStyle={setIdeasStyle}
          count={ideasCount} setCount={setIdeasCount}
          onGenerate={generateIdeas}
          onClear={() => setIdeas([])}
          onConvert={onConvert}
          onStartAutoPipeline={onStartAutoPipeline}
          autoPipelineActive={!!autoPipelineActive}
        />
      )}
    </div>
  );
}

// ── Shared stat card ─────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4">
      <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
      <p className="text-xl font-bold text-white mt-1">{value}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-10 text-center">
      <p className="text-[var(--text-muted)] text-sm">{message}</p>
    </div>
  );
}

// ── DASHBOARD ────────────────────────────────────────────────────────────

function DashboardContent({ analysis, scanHistory, onConvert }: { analysis: FullAnalysis | null; scanHistory: ScanRun[]; onConvert?: (q: string) => void }) {
  if (!analysis) return (
    <EmptyState message='No scan data yet — click "Scan Cross-Stitch Market" to analyze 40 cross-stitch keyword categories on Etsy.' />
  );

  const ov = analysis.overview;
  const topCats = analysis.categories.slice(0, 10);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Keywords Scanned" value={String(ov.totalKeywordsScanned)} />
        <StatCard label="Listings Analyzed" value={ov.uniqueListings.toLocaleString()} />
        <StatCard label="Avg Price" value={`$${ov.avgPrice}`} />
        <StatCard label="Avg Favorites" value={String(ov.avgFavorites)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4">
          <p className="text-[11px] text-[var(--text-muted)] mb-1">Top Category</p>
          <p className="text-base font-bold text-amber-400">{ov.topCategory}</p>
        </div>
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4">
          <p className="text-[11px] text-[var(--text-muted)] mb-1">Total Market Listings</p>
          <p className="text-base font-bold text-white">{ov.totalMarketListings.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
        <div className="p-4 border-b border-white/[0.08]">
          <h3 className="text-[13px] font-semibold text-white">Top 10 Cross-Stitch Categories by Demand</h3>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {topCats.map((cat, i) => {
            const maxFavs = topCats[0]?.avgFavorites || 1;
            const barWidth = Math.round((cat.avgFavorites / maxFavs) * 100);
            return (
              <div key={cat.keyword} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] group">
                <span className="text-[11px] text-[var(--text-muted)] w-5 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-medium text-white truncate">{cat.keyword}</span>
                    <div className="flex items-center gap-2 text-[11px] flex-shrink-0 ml-2">
                      <span className="text-[var(--text-muted)]">${cat.avgPrice}</span>
                      <span className="text-pink-400">{cat.avgFavorites} favs</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${getCompetitionColor(cat.competitionLevel)}`}>{cat.competitionLevel}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getDemandColor(cat.demandScore)}`}>{cat.demandScore}</span>
                      {onConvert && (
                        <button onClick={() => onConvert(cat.keyword)} className="opacity-0 group-hover:opacity-100 px-2 py-0.5 bg-amber-500 text-black text-[10px] font-bold rounded transition-all">
                          Design →
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${barWidth}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {scanHistory.length > 1 && (
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
          <div className="p-4 border-b border-white/[0.08]">
            <h3 className="text-[13px] font-semibold text-white">Scan History</h3>
          </div>
          <table className="w-full text-[12px]">
            <thead className="bg-white/[0.04]">
              <tr>
                <th className="text-left p-3 text-[var(--text-secondary)] font-medium">Date</th>
                <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Keywords</th>
                <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Listings</th>
                <th className="text-center p-3 text-[var(--text-secondary)] font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {scanHistory.map((run) => (
                <tr key={run.id} className="border-t border-white/[0.06]">
                  <td className="p-3 text-[var(--text-secondary)]">{new Date(run.started_at).toLocaleString()}</td>
                  <td className="p-3 text-right">{run.keywords_scanned}/{run.keywords_total}</td>
                  <td className="p-3 text-right">{run.listings_found.toLocaleString()}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${run.status === "completed" ? "bg-emerald-500/15 text-emerald-400" : run.status === "failed" ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"}`}>
                      {run.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Lazy listing image ────────────────────────────────────────────────────
// Fetches the Etsy product image on demand for listings that were scanned
// before the includes[] fix. Results are persisted server-side so subsequent
// loads are instant.

function LazyListingImage({ listingId, alt, className }: { listingId: string; alt: string; className: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/cross-stitch/listing-image?id=${listingId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: { image_url: string | null } | null) => {
        if (!cancelled && data?.image_url) setSrc(data.image_url);
        if (!cancelled) setTried(true);
      })
      .catch(() => { if (!cancelled) setTried(true); });
    return () => { cancelled = true; };
  }, [listingId]);

  if (src) {
    return <img src={src} alt={alt} className={`${className} object-cover`} />;
  }
  return (
    <div className={`${className} bg-white/[0.06] flex items-center justify-center ${!tried ? "animate-pulse" : ""}`}>
      {tried && <span className="text-[20px]">🧵</span>}
    </div>
  );
}

// ── PRODUCTS ─────────────────────────────────────────────────────────────

function ProductsContent({ products, onConvert }: { products: TrackedListing[]; onConvert?: (q: string, imageUrl?: string, title?: string) => void }) {
  const [sort, setSort] = useState<"favorites" | "sales" | "price" | "revenue">("favorites");
  const sorted = [...products].sort((a, b) => {
    if (sort === "favorites") return b.favorites - a.favorites;
    if (sort === "sales") return b.sales_estimate - a.sales_estimate;
    if (sort === "price") return b.price - a.price;
    return (b.revenue_estimate || 0) - (a.revenue_estimate || 0);
  });

  if (!products.length) return <EmptyState message="Run a cross-stitch scan to see top-performing listings." />;

  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-white/[0.08]">
        <h3 className="text-[13px] font-semibold text-white">Top {sorted.length} Listings</h3>
        <div className="flex gap-1.5">
          {(["favorites", "sales", "price", "revenue"] as const).map((s) => (
            <button key={s} onClick={() => setSort(s)} className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${sort === s ? "bg-amber-500 text-black" : "bg-white/[0.06] text-[var(--text-secondary)] hover:bg-white/[0.1]"}`}>
              {s === "favorites" ? "Favs" : s === "sales" ? "Sales" : s === "price" ? "Price" : "Revenue"}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-white/[0.04]">
            <tr>
              <th className="text-left p-3 text-[var(--text-secondary)] font-medium">Product</th>
              <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Price</th>
              <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Favs</th>
              <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Sales</th>
              <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Age</th>
              {onConvert && <th className="p-3" />}
            </tr>
          </thead>
          <tbody>
            {sorted.map((l) => (
              <tr key={l.listing_id} className="border-t border-white/[0.06] hover:bg-white/[0.04] group">
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    {l.image_url ? (
                      <img src={l.image_url} alt={l.title} className="w-16 h-16 rounded-lg object-cover flex-shrink-0 border border-white/[0.08]" />
                    ) : (
                      <LazyListingImage
                        listingId={l.listing_id}
                        alt={l.title}
                        className="w-16 h-16 rounded-lg flex-shrink-0 border border-white/[0.08]"
                      />
                    )}
                    <a href={l.url || "#"} target="_blank" rel="noopener noreferrer" className="text-white hover:text-amber-400 line-clamp-3 max-w-xs text-[12px]">{l.title}</a>
                  </div>
                </td>
                <td className="p-3 text-right font-medium text-white">${l.price.toFixed(2)}</td>
                <td className="p-3 text-right text-pink-400 font-medium">{l.favorites.toLocaleString()}</td>
                <td className="p-3 text-right text-emerald-400 font-medium">{l.sales_estimate}</td>
                <td className="p-3 text-right text-[var(--text-muted)]">{l.listing_age_days}d</td>
                {/* Design Similar button — RE-ENABLED 2026-05-14.
                    Hover any product row to reveal it.  Clicking
                    threads the product image + title through to the
                    Convert tab as an "Inspiration" reference. */}
                {onConvert ? (
                  <td className="p-3 text-right">
                    <button
                      onClick={() => onConvert?.(l.keyword || l.title, l.image_url || undefined, l.title)}
                      className="opacity-0 group-hover:opacity-100 px-2 py-1 bg-amber-500 text-black text-[10px] font-bold rounded transition-all whitespace-nowrap"
                    >
                      Design Similar →
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── CATEGORIES ────────────────────────────────────────────────────────────

function CategoriesContent({ categories, onConvert }: { categories: CategoryAnalysis[]; onConvert?: (q: string) => void }) {
  const [sort, setSort] = useState<"demand" | "favorites" | "price">("demand");
  const sorted = [...categories].filter((c) => !c.error).sort((a, b) => {
    if (sort === "demand") return b.demandScore - a.demandScore;
    if (sort === "favorites") return b.avgFavorites - a.avgFavorites;
    return b.avgPrice - a.avgPrice;
  });

  if (!categories.length) return <EmptyState message="Run a cross-stitch scan to see category breakdown." />;

  const maxFavs = Math.max(...sorted.map((c) => c.avgFavorites), 1);
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {(["demand", "favorites", "price"] as const).map((s) => (
          <button key={s} onClick={() => setSort(s)} className={`px-3 py-1 rounded text-[11px] font-medium transition-colors ${sort === s ? "bg-amber-500 text-black" : "bg-white/[0.06] text-[var(--text-secondary)] hover:bg-white/[0.1]"}`}>
            {s === "demand" ? "Demand" : s === "favorites" ? "Favorites" : "Price"}
          </button>
        ))}
      </div>
      <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
        <div className="divide-y divide-white/[0.06]">
          {sorted.map((cat, i) => (
            <div key={cat.keyword} className="px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--text-muted)] w-4 text-right">{i + 1}</span>
                  <span className="text-[12px] font-medium text-white">{cat.keyword}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-[var(--text-muted)]">{cat.totalResults.toLocaleString()}</span>
                  <span className="text-white font-medium">${cat.avgPrice}</span>
                  <span className="text-pink-400">{cat.avgFavorites} favs</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] capitalize ${getCompetitionColor(cat.competitionLevel)}`}>{cat.competitionLevel}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getDemandColor(cat.demandScore)}`}>{cat.demandScore}/100</span>
                  {onConvert && (
                    <button onClick={() => onConvert(cat.keyword)} className="px-2 py-0.5 bg-amber-500 text-black text-[10px] font-bold rounded transition-colors hover:bg-amber-400">
                      Design →
                    </button>
                  )}
                </div>
              </div>
              <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.round((cat.avgFavorites / maxFavs) * 100)}%`, backgroundColor: cat.demandScore >= 70 ? "#22c55e" : cat.demandScore >= 40 ? "#f59e0b" : "#ef4444" }} />
              </div>
              {cat.topTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {cat.topTags.slice(0, 5).map((t) => <span key={t} className="px-1.5 py-0.5 bg-white/[0.06] text-[var(--text-muted)] rounded text-[10px]">{t}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── TRENDS ────────────────────────────────────────────────────────────────

const CS_ESSENTIALS = [
  { label: "Animal in Costume", emoji: "🐸", desc: "Frog, duck, goose in human situations — NalaAndStitch model" },
  { label: "Kawaii / Cute", emoji: "🍓", desc: "Strawberry, mushroom, pastel characters" },
  { label: "Funny Quote", emoji: "😂", desc: "Snarky text on animal — evergreen gifting niche" },
  { label: "Floral / Botanical", emoji: "🌸", desc: "Wildflowers, wreaths, cottagecore" },
  { label: "Seasonal / Gift", emoji: "🎁", desc: "Spring, summer, baby, wedding, teacher gifts — repeat buyers" },
  { label: "Kitchen / Home", emoji: "🏡", desc: "Pantry labels, jam jars, tea shelves, cozy cottage motifs" },
];

function TrendsContent({ trends, onConvert }: { trends: TrendItem[]; onConvert?: (q: string) => void }) {
  const [external, setExternal] = useState<ExternalTrends | null>(null);
  const [extLoading, setExtLoading] = useState(true);
  const [extError, setExtError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cross-stitch/external-trends")
      .then((r) => r.ok ? r.json() : Promise.reject("HTTP " + r.status))
      .then((data: ExternalTrends) => setExternal(data))
      .catch((e: unknown) => setExtError(e instanceof Error ? e.message : String(e)))
      .finally(() => setExtLoading(false));
  }, []);

  const rising = trends.filter((t) => t.direction === "rising");
  const declining = trends.filter((t) => t.direction === "declining");
  const stable = trends.filter((t) => t.direction === "stable");

  return (
    <div className="space-y-5">

      {/* ── Reddit live signals ── */}
      <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-white/[0.08]">
          <div>
            <h3 className="text-[13px] font-semibold text-white">Trending on Reddit r/CrossStitch</h3>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Top posts this week — what stitchers are actually making right now</p>
          </div>
          {external?.fetchedAt && (
            <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0 ml-3">
              updated {new Date(external.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        {extLoading ? (
          <div className="p-8 text-center text-[var(--text-muted)] text-[12px]">Loading live Reddit data…</div>
        ) : extError ? (
          <div className="p-4 text-[12px] text-red-400 bg-red-500/10">{extError}</div>
        ) : external && external.redditTop.length > 0 ? (
          <div className="divide-y divide-white/[0.06]">
            {external.redditTop.slice(0, 15).map((post, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] group">
                {post.thumbnail && (
                  <img src={post.thumbnail} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0 mt-0.5 opacity-70" />
                )}
                <div className="flex-1 min-w-0">
                  <a href={post.url} target="_blank" rel="noopener noreferrer"
                    className="text-[12px] text-white hover:text-amber-400 line-clamp-2 leading-snug block">
                    {post.title}
                  </a>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[10px] text-amber-400 font-medium">↑ {post.score.toLocaleString()}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">{post.numComments} comments</span>
                    {post.subjects.slice(0, 3).map((s) => (
                      <span key={s} className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded text-[10px]">{s}</span>
                    ))}
                  </div>
                </div>
                {onConvert && post.subjects.length > 0 && (
                  <button
                    onClick={() => onConvert(`cross stitch ${post.subjects[0]} pattern`)}
                    className="opacity-0 group-hover:opacity-100 flex-shrink-0 self-center px-2.5 py-1 bg-amber-500 text-black text-[10px] font-bold rounded transition-all whitespace-nowrap"
                  >
                    Design →
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-[var(--text-muted)] text-[12px]">No Reddit posts available right now</div>
        )}

        {/* Rising new posts teaser */}
        {!extLoading && external && external.redditNew.length > 0 && (
          <div className="border-t border-white/[0.08] px-4 py-3">
            <p className="text-[10px] text-[var(--text-muted)] mb-2 font-medium uppercase tracking-wide">Freshly posted</p>
            <div className="flex flex-wrap gap-1.5">
              {external.redditNew.slice(0, 6).map((post, i) => (
                <a key={i} href={post.url} target="_blank" rel="noopener noreferrer"
                  className="px-2 py-1 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded text-[10px] text-[var(--text-secondary)] hover:text-white transition-colors line-clamp-1 max-w-[220px]">
                  {post.title.length > 40 ? post.title.slice(0, 40) + "…" : post.title}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Etsy trending searches ── */}
      {!extLoading && external && external.etsyTrends.length > 0 && (
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4">
          <h3 className="text-[13px] font-semibold text-white mb-0.5">Rising Etsy Searches</h3>
          <p className="text-[11px] text-[var(--text-muted)] mb-3">What buyers are typing into Etsy search right now</p>
          <div className="flex flex-wrap gap-2">
            {external.etsyTrends.map((item) => (
              <button
                key={item.term}
                onClick={() => onConvert?.(item.term)}
                className="group flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.05] hover:bg-amber-500/15 border border-white/[0.08] hover:border-amber-500/40 rounded-full text-[11px] text-[var(--text-secondary)] hover:text-amber-300 transition-all"
              >
                <span className="text-amber-500/60 text-[10px]">↗</span>
                {item.term}
                {onConvert && (
                  <span className="opacity-0 group-hover:opacity-100 text-[9px] text-amber-400 font-bold ml-0.5 transition-opacity">→</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Pinterest trending keywords ── */}
      {!extLoading && external && external.pinterestTrends.length > 0 && (
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4">
          <div className="flex items-center gap-2 mb-0.5">
            <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>
            <h3 className="text-[13px] font-semibold text-white">Pinterest Growing Searches</h3>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mb-3 ml-5.5">Craft keywords trending up this week on Pinterest</p>
          <div className="flex flex-wrap gap-2">
            {external.pinterestTrends.map((item) => (
              <button
                key={item.keyword}
                onClick={() => onConvert?.(item.keyword)}
                className="group flex items-center gap-1.5 px-3 py-1.5 bg-red-500/[0.07] hover:bg-red-500/15 border border-red-500/[0.15] hover:border-red-500/40 rounded-full text-[11px] text-[var(--text-secondary)] hover:text-red-300 transition-all"
              >
                {item.pctChange != null && item.pctChange > 0 && (
                  <span className="text-red-400 text-[10px] font-medium">+{item.pctChange}%</span>
                )}
                {item.keyword}
                {onConvert && (
                  <span className="opacity-0 group-hover:opacity-100 text-[9px] text-red-400 font-bold ml-0.5 transition-opacity">→</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Cross-stitch essentials ── */}
      <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4">
        <h3 className="text-[13px] font-semibold text-white mb-0.5">Cross-Stitch Pattern Essentials</h3>
        <p className="text-[11px] text-[var(--text-muted)] mb-3">Perennial bestseller categories — always in demand on Etsy</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {CS_ESSENTIALS.map((item) => (
            <button
              key={item.label}
              onClick={() => onConvert?.(`cross stitch ${item.label.toLowerCase()} pattern`)}
              className="group flex items-start gap-2.5 p-3 bg-white/[0.03] hover:bg-amber-500/10 border border-white/[0.06] hover:border-amber-500/30 rounded-xl text-left transition-all"
            >
              <span className="text-xl flex-shrink-0">{item.emoji}</span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-white group-hover:text-amber-300 transition-colors">{item.label}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-relaxed line-clamp-2">{item.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Scan-over-scan DB comparison ── */}
      {trends.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-white">Scan-over-Scan Comparison</h3>
            <span className="text-[10px] px-2 py-0.5 bg-white/[0.06] text-[var(--text-muted)] rounded-full">from your scan history</span>
          </div>
          {rising.length > 0 && <TrendSection title="Rising" items={rising} color="emerald" />}
          {declining.length > 0 && <TrendSection title="Declining" items={declining} color="red" />}
          {stable.length > 0 && <TrendSection title="Stable" items={stable} color="slate" />}
        </div>
      ) : (
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4 text-center">
          <p className="text-[11px] text-[var(--text-muted)]">
            Run at least two cross-stitch scans to unlock scan-over-scan trend comparisons
          </p>
        </div>
      )}
    </div>
  );
}

function TrendSection({ title, items, color }: { title: string; items: TrendItem[]; color: string }) {
  const c = color === "emerald"
    ? { bg: "bg-emerald-500/10", text: "text-emerald-400" }
    : color === "red"
    ? { bg: "bg-red-500/10", text: "text-red-400" }
    : { bg: "bg-white/[0.04]", text: "text-[var(--text-secondary)]" };

  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
      <div className={`p-3 border-b border-white/[0.08] ${c.bg}`}>
        <h3 className={`text-[13px] font-semibold ${c.text}`}>{title} ({items.length})</h3>
      </div>
      <div className="divide-y divide-white/[0.06]">
        {items.map((item) => (
          <div key={item.category} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className={`font-bold ${getDirectionColor(item.direction)}`}>{getDirectionIcon(item.direction)}</span>
              <span className="text-[12px] font-medium text-white">{item.category}</span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className={c.text}>{item.changePercent > 0 ? "+" : ""}{item.changePercent}% favs</span>
              <span className="text-[var(--text-muted)]">{item.previousFavorites} → {item.currentFavorites}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── STRATEGY ─────────────────────────────────────────────────────────────

function StrategyContent({ opportunities, priceInsights, tagAnalysis, onConvert }: { opportunities: OpportunityGap[]; priceInsights: PriceInsight[]; tagAnalysis: TagInsight[]; onConvert?: (q: string) => void }) {
  if (!opportunities.length) return <EmptyState message="Run a cross-stitch scan to generate strategy recommendations." />;

  return (
    <div className="space-y-5">
      <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
        <div className="p-4 border-b border-white/[0.08]">
          <h3 className="text-[13px] font-semibold text-white">Top Opportunities</h3>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">High demand + low competition</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
          {opportunities.slice(0, 12).map((opp, i) => (
            <div key={opp.category} className="border border-white/[0.08] rounded-xl p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-[var(--text-muted)]">#{i + 1}</span>
                <span className="text-[10px] font-bold text-amber-400">Score: {opp.opportunityScore}</span>
              </div>
              <p className="text-[12px] font-semibold text-white mb-1">{opp.category}</p>
              <p className="text-[10px] text-[var(--text-muted)] mb-2 line-clamp-2">{opp.reason}</p>
              <div className="flex gap-1.5 text-[10px] flex-wrap items-center">
                <span className={`px-1.5 py-0.5 rounded ${getDemandColor(opp.demandScore)}`}>D:{opp.demandScore}</span>
                <span className={`px-1.5 py-0.5 rounded capitalize ${getCompetitionColor(opp.competitionLevel)}`}>{opp.competitionLevel}</span>
                <span className="text-[var(--text-muted)]">${opp.avgPrice}</span>
                {onConvert && (
                  <button onClick={() => onConvert(opp.category)} className="ml-auto px-2 py-0.5 bg-amber-500 text-black text-[10px] font-bold rounded hover:bg-amber-400 transition-colors">
                    Design →
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {priceInsights.length > 0 && (
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
          <div className="p-4 border-b border-white/[0.08]">
            <h3 className="text-[13px] font-semibold text-white">Price Sweet Spots</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-white/[0.04]">
                <tr>
                  <th className="text-left p-3 text-[var(--text-secondary)] font-medium">Category</th>
                  <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Avg</th>
                  <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Median</th>
                  <th className="text-right p-3 text-[var(--text-secondary)] font-medium text-emerald-400">Sweet Spot</th>
                </tr>
              </thead>
              <tbody>
                {priceInsights.slice(0, 15).map((pi) => (
                  <tr key={pi.category} className="border-t border-white/[0.06]">
                    <td className="p-3 text-white text-[11px]">{pi.category}</td>
                    <td className="p-3 text-right text-[var(--text-muted)]">${pi.avgPrice}</td>
                    <td className="p-3 text-right text-[var(--text-muted)]">${pi.medianPrice}</td>
                    <td className="p-3 text-right font-bold text-emerald-400">${pi.sweetSpot}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tagAnalysis.length > 0 && (
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4">
          <h3 className="text-[13px] font-semibold text-white mb-3">Top Tags</h3>
          <div className="flex flex-wrap gap-2">
            {tagAnalysis.slice(0, 30).map((t) => (
              <span key={t.tag} className="px-2.5 py-1.5 bg-amber-500/10 text-amber-400 rounded-lg text-[11px]" title={`${t.frequency} categories, avg ${t.avgFavorites} favs`}>
                {t.tag} <span className="opacity-60">({t.frequency})</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── SEARCH ────────────────────────────────────────────────────────────────

function SearchContent({ keyword, setKeyword, searching, searchResult, searchError, sortBy, setSortBy, searchNiche, onConvert }: {
  keyword: string; setKeyword: (k: string) => void;
  searching: boolean; searchResult: ManualSearchResult | null; searchError: string;
  sortBy: "favorites" | "sales" | "price"; setSortBy: (s: "favorites" | "sales" | "price") => void;
  searchNiche: (kw?: string) => void;
  onConvert?: (q: string) => void;
}) {
  const sortedListings = searchResult?.listings
    ? [...searchResult.listings].sort((a, b) => {
        if (sortBy === "favorites") return b.favorites - a.favorites;
        if (sortBy === "sales") return b.sales_estimate - a.sales_estimate;
        return b.price - a.price;
      })
    : [];

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <input
          type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && searchNiche()}
          placeholder="e.g. 'funny goose cross stitch pattern'"
          className="flex-1 px-4 py-2.5 border border-white/[0.1] bg-[var(--bg-surface)] rounded-lg text-[13px] text-white placeholder-[var(--text-muted)] focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/50"
        />
        <button onClick={() => searchNiche()} disabled={searching || !keyword.trim()} className="px-5 py-2.5 bg-amber-500 text-black rounded-lg font-semibold hover:bg-amber-400 disabled:opacity-50 transition-colors text-[13px]">
          {searching ? "…" : "Search"}
        </button>
      </div>

      <div>
        <p className="text-[11px] text-[var(--text-muted)] mb-2">Quick searches:</p>
        <div className="flex flex-wrap gap-1.5">
          {CS_QUICK_SEARCHES.map((q) => (
            <button key={q} onClick={() => { setKeyword(q); searchNiche(q); }} disabled={searching}
              className="px-2.5 py-1 bg-white/[0.06] text-[var(--text-secondary)] rounded-full text-[11px] hover:bg-amber-500/15 hover:text-amber-400 transition-colors">
              {q}
            </button>
          ))}
        </div>
      </div>

      {searchError && <div className="p-3 bg-red-500/15 text-red-400 rounded-lg text-[12px]">{searchError}</div>}

      {searchResult && (
        <div className="space-y-5">
          {onConvert && (
            <button onClick={() => onConvert(searchResult.keyword)} className="w-full py-2.5 bg-amber-500 text-black rounded-xl font-bold hover:bg-amber-400 transition-colors text-[13px]">
              ✦ Design a pattern for "{searchResult.keyword}" →
            </button>
          )}
          <div className="grid grid-cols-5 gap-3">
            <StatCard label="Total Results" value={searchResult.total_results.toLocaleString()} />
            <StatCard label="Avg Price" value={`$${searchResult.analysis.avg_price}`} />
            <StatCard label="Avg Favorites" value={String(searchResult.analysis.avg_favorites)} />
            <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4">
              <p className="text-[11px] text-[var(--text-muted)]">Competition</p>
              <p className={`text-base font-bold capitalize px-2 py-0.5 rounded inline-block mt-1 ${getCompetitionColor(searchResult.analysis.competition_level)}`}>{searchResult.analysis.competition_level}</p>
            </div>
            <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4">
              <p className="text-[11px] text-[var(--text-muted)]">Demand</p>
              <p className={`text-xl font-bold px-2 py-0.5 rounded inline-block mt-1 ${getDemandColor(searchResult.analysis.demand_score)}`}>{searchResult.analysis.demand_score}/100</p>
            </div>
          </div>

          {searchResult.top_tags.length > 0 && (
            <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4">
              <h3 className="text-[12px] font-semibold text-white mb-2">Top Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {searchResult.top_tags.map((t) => <span key={t} className="px-2 py-1 bg-amber-500/10 text-amber-400 rounded text-[11px]">{t}</span>)}
              </div>
            </div>
          )}

          <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/[0.08]">
              <h3 className="text-[13px] font-semibold text-white">Top {sortedListings.length} Listings</h3>
              <div className="flex gap-1.5">
                {(["favorites", "sales", "price"] as const).map((s) => (
                  <button key={s} onClick={() => setSortBy(s)} className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${sortBy === s ? "bg-amber-500 text-black" : "bg-white/[0.06] text-[var(--text-secondary)] hover:bg-white/[0.1]"}`}>
                    {s === "favorites" ? "Favs" : s === "sales" ? "Sales" : "Price"}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-white/[0.04]">
                  <tr>
                    <th className="text-left p-3 text-[var(--text-secondary)] font-medium">Product</th>
                    <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Price</th>
                    <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Favs</th>
                    <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Sales</th>
                    <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Age</th>
                    <th className="text-left p-3 text-[var(--text-secondary)] font-medium">Shop</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedListings.map((l) => (
                    <tr key={l.listing_id} className="border-t border-white/[0.06] hover:bg-white/[0.04]">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {l.image_url && <img src={l.image_url} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />}
                          <a href={l.url || "#"} target="_blank" rel="noopener noreferrer" className="text-white hover:text-amber-400 line-clamp-2 max-w-xs">{l.title}</a>
                        </div>
                      </td>
                      <td className="p-3 text-right font-medium text-white">${l.price.toFixed(2)}</td>
                      <td className="p-3 text-right text-pink-400 font-medium">{l.favorites.toLocaleString()}</td>
                      <td className="p-3 text-right text-emerald-400 font-medium">{l.sales_estimate}</td>
                      <td className="p-3 text-right text-[var(--text-muted)]">{l.listing_age_days}d</td>
                      <td className="p-3 text-[var(--text-muted)]">{l.shop_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── IDEAS ─────────────────────────────────────────────────────────────────

function IdeasContent({ ideas, loading, error, meta, style, setStyle, count, setCount, onGenerate, onClear, onConvert, onStartAutoPipeline, autoPipelineActive }: {
  ideas: ProductIdea[]; loading: boolean; error: string | null;
  meta: IdeasMeta | null;
  style: "all" | "funny" | "bookmarks" | "folk" | "bestseller"; setStyle: (s: "all" | "funny" | "bookmarks" | "folk" | "bestseller") => void;
  count: number; setCount: (n: number) => void;
  onGenerate: () => void;
  onClear: () => void;
  onConvert?: (query: string, imageUrl?: string, title?: string) => void;
  onStartAutoPipeline?: (count: number) => void;
  autoPipelineActive?: boolean;
}) {
  const [autoCount, setAutoCount] = useState(5);
  return (
    <div className="space-y-5">
      {/* ── Phase 1 Auto-Pipeline launcher ──
          Generate N fresh ideas + design + convert in sequence with
          one click.  Each item costs ~$0.08 (HQ gpt-image-2 + flatten),
          takes ~45s.  Progress shows in a fixed bottom-right panel. */}
      {onStartAutoPipeline && (
        <div className="bg-gradient-to-r from-purple-900/40 via-fuchsia-900/30 to-purple-900/40 rounded-xl border border-purple-500/30 p-5 shadow-[0_0_24px_-8px_rgba(168,85,247,0.4)]">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-white mb-0.5 flex items-center gap-2">
                <span>🚀 Auto-Pipeline</span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-purple-300 bg-purple-500/20 px-1.5 py-0.5 rounded">Phase 1</span>
              </h3>
              <p className="text-[11px] text-[var(--text-secondary)]">
                One click runs: <strong>ideas → image → chart → photoreal mockups</strong>.
                Stops on Export tab for review (video + listing copy + Etsy draft coming once mockups are solid).
              </p>
              <p className="text-[10px] text-purple-300/70 mt-1">
                ~$0.36 per item · ~2-3 min each · gpt-image-2 photoreal mockups (flat-lay, hands, cozy, shelf)
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <label className="text-[11px] text-[var(--text-muted)]">Items:</label>
              <input
                type="number"
                min={1}
                max={10}
                value={autoCount}
                onChange={(e) => setAutoCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                disabled={autoPipelineActive}
                className="w-14 px-2 py-1 rounded bg-[var(--bg-surface)] border border-white/[0.08] text-white text-[12px] text-center focus:outline-none focus:border-purple-500/40"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              console.log("[auto-pipeline-button] clicked, autoCount=", autoCount, "active=", autoPipelineActive);
              if (autoPipelineActive) {
                if (!confirm("Auto-Pipeline is already marked as running. This could be stuck state from a previous session.\n\nRestart anyway? (Will clear current queue and start fresh.)")) {
                  return;
                }
                // Defensive reset — clear queue then trigger.
                try { localStorage.removeItem("cross-stitch-auto-pipeline-state-v1"); } catch {}
              }
              onStartAutoPipeline(autoCount);
            }}
            className="w-full px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white shadow-[0_0_20px_-4px_rgba(168,85,247,0.5)] flex items-center justify-center gap-2 transition-all"
          >
            {autoPipelineActive ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="40 60" />
                </svg>
                <span>Auto-Pipeline running…</span>
              </>
            ) : (
              <>
                <span>🚀 Auto-Generate {autoCount} Ready-to-Approve {autoCount === 1 ? "Item" : "Items"}</span>
                <span className="text-[10px] opacity-70">~${(0.36 * autoCount).toFixed(2)}</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Generator panel */}
      <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-[13px] font-semibold text-white mb-0.5">Etsy-Backed Idea Lab</h3>
            <p className="text-[11px] text-[var(--text-muted)]">
              Uses tracked Etsy winners, keyword lanes, Marketplace Insights, IP filtering, and own-shop dedupe.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--text-muted)]">Count:</span>
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="px-2 py-1 bg-[var(--bg-surface)] border border-white/[0.1] rounded text-[12px] text-white">
              {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {/* Style picker — 2×2 grid of the bestselling FAMILY-FRIENDLY
            cross-stitch shelves on Etsy.  Per user 2026-05-16: no
            occult / tarot / eyes / hands / skulls / pentagrams — that
            shelf has been removed entirely. */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {[
            { key: "bestseller" as const, emoji: "🏆", label: "Best Seller + Trend Mix", desc: "Default. Riffs from top tracked Etsy sellers, hot keyword lanes, and safe trend signals." },
            { key: "all" as const, emoji: "🎨", label: "Broad Etsy Mix", desc: "Balanced batch across safe high-demand shelves: animals, cottagecore, samplers, bookmarks, kitchen." },
            { key: "funny" as const, emoji: "😄", label: "Funny / Giftable", desc: "Clean light-humor concepts with strong gifting intent and family-safe captions." },
            { key: "bookmarks" as const, emoji: "🔖", label: "Bookmarks", desc: "Narrow giftable bookmark layouts with proven small-pattern buyer intent." },
            { key: "folk" as const, emoji: "🌸", label: "Sampler / Collection", desc: "Folk flowers, pantry labels, alphabet sets, mini-motif grids, and cottage collections." },
          ].map((s) => (
            <button key={s.key} onClick={() => setStyle(s.key)}
              className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${style === s.key ? "border-amber-500/60 bg-amber-500/10" : "border-white/[0.08] hover:border-white/[0.16]"}`}>
              <span className="text-xl flex-shrink-0">{s.emoji}</span>
              <div>
                <p className={`text-[12px] font-semibold ${style === s.key ? "text-amber-300" : "text-white"}`}>{s.label}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-relaxed">{s.desc}</p>
              </div>
              {style === s.key && (
                <span className="ml-auto flex-shrink-0 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </span>
              )}
            </button>
          ))}
        </div>

        <button onClick={onGenerate} disabled={loading}
          className="w-full py-2.5 bg-amber-500 text-black rounded-xl font-bold hover:bg-amber-400 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 text-[13px]">
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Generating {count} ideas…
            </>
          ) : `✦ Generate ${count} Etsy-Backed Ideas`}
        </button>

        {error && <div className="mt-3 p-3 bg-red-500/15 text-red-400 rounded-lg text-[12px]">{error}</div>}
        {meta && !error && (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
            <SignalPill label="Engine" value={meta.engine === "deterministic_fallback" ? "coded fallback" : "Gemini + filters"} />
            <SignalPill label="Etsy seeds" value={String(meta.competitorSeedCount)} />
            <SignalPill label="Market lanes" value={String(meta.marketLaneCount)} />
            <SignalPill label="Insights" value={String(meta.insightTermCount)} />
            <SignalPill label="Own dupes cut" value={String(meta.droppedDuplicates)} />
          </div>
        )}
      </div>

      {/* Ideas grid */}
      {ideas.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-white">{ideas.length} idea{ideas.length !== 1 ? "s" : ""}</h3>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-[var(--text-muted)]">Saved · persists across tabs</span>
              <button
                onClick={() => {
                  if (confirm(`Clear all ${ideas.length} saved ideas? They'll be removed from this device.`)) {
                    onClear();
                  }
                }}
                className="text-[11px] text-[var(--text-muted)] hover:text-red-400 transition-colors"
                title="Wipe the saved ideas list (won't delete them from the server)"
              >
                Clear all
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} onConvert={onConvert} />)}
          </div>
        </div>
      ) : !loading && (
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-10 text-center">
          <p className="text-3xl mb-2">🧵</p>
          <p className="text-[var(--text-secondary)] text-[13px] mb-1">No ideas yet</p>
          <p className="text-[var(--text-muted)] text-[11px]">Choose a style and click Generate Ideas</p>
        </div>
      )}
    </div>
  );
}

function SignalPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.035] px-3 py-2">
      <p className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-0.5 truncate text-[11px] font-semibold text-white">{value}</p>
    </div>
  );
}

function IdeaCard({ idea, onConvert }: { idea: ProductIdea; onConvert?: (query: string, imageUrl?: string, title?: string) => void }) {
  const tags = parseJsonArray(idea.suggested_tags).slice(0, 5);
  const keywords = parseJsonArray(idea.suggested_keywords).slice(0, 3);
  // Use the DB id so the page's existing ?ideaId bridge fires correctly
  const designUrl = `/cross-stitch?ideaId=${idea.id}`;

  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4 flex flex-col gap-2.5 hover:border-amber-500/30 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-semibold text-white leading-snug flex-1">{idea.title}</p>
        {onConvert ? (
          <button
            onClick={() => onConvert(parseJsonArray(idea.suggested_keywords)[0] || idea.title)}
            className="flex-shrink-0 px-2.5 py-1 bg-amber-500 text-black text-[10px] font-bold rounded-lg hover:bg-amber-400 transition-colors whitespace-nowrap"
          >
            Design This →
          </button>
        ) : (
          <a href={designUrl} className="flex-shrink-0 px-2.5 py-1 bg-amber-500 text-black text-[10px] font-bold rounded-lg hover:bg-amber-400 transition-colors whitespace-nowrap">
            Design This →
          </a>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getDemandColor(idea.demand_score)}`}>Demand {idea.demand_score}</span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${idea.competition_score <= 40 ? "text-emerald-400 bg-emerald-500/15" : idea.competition_score <= 65 ? "text-amber-400 bg-amber-500/15" : "text-red-400 bg-red-500/15"}`}>Comp {idea.competition_score}</span>
        {idea.suggested_price > 0 && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium text-emerald-400 bg-emerald-500/15">${idea.suggested_price.toFixed(2)}</span>}
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium text-indigo-400 bg-indigo-500/15">{idea.confidence}% conf</span>
      </div>

      {idea.why_now && <p className="text-[10px] text-[var(--text-muted)] leading-relaxed line-clamp-2">{idea.why_now}</p>}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => <span key={t} className="px-1.5 py-0.5 bg-white/[0.05] text-[var(--text-muted)] rounded text-[10px]">{t}</span>)}
        </div>
      )}

      {keywords.length > 0 && (
        <div className="pt-1.5 border-t border-white/[0.06]">
          <div className="flex flex-wrap gap-1">
            {keywords.map((k) => <span key={k} className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded text-[10px]">{k}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}
