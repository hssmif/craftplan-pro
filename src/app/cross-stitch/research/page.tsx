"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// --- Types ---

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

// Manual search
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

// Ideas
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

// --- Tabs ---

type Tab = "dashboard" | "products" | "categories" | "trends" | "strategy" | "search" | "ideas";

const TABS: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "products", label: "Top Products" },
  { key: "categories", label: "Categories" },
  { key: "trends", label: "Trends" },
  { key: "strategy", label: "Strategy" },
  { key: "search", label: "Market Search" },
  { key: "ideas", label: "✦ Generate Ideas" },
];

const CS_SUGGESTED_NICHES = [
  "cross stitch pattern pdf",
  "cross stitch animal funny",
  "cross stitch beginner pattern",
  "kawaii cross stitch pattern",
  "cross stitch instant download",
  "funny cross stitch goose",
  "cross stitch floral botanical",
  "cross stitch bird pattern",
];

// --- Helper functions ---

function getDemandColor(score: number): string {
  if (score >= 70) return "text-emerald-400 bg-emerald-500/15";
  if (score >= 40) return "text-amber-400 bg-amber-500/15";
  return "text-red-400 bg-red-500/15";
}

function getCompetitionColor(level: string): string {
  if (level === "low") return "text-emerald-400 bg-emerald-500/15";
  if (level === "medium") return "text-amber-400 bg-amber-500/15";
  return "text-red-400 bg-red-500/15";
}

function getDirectionIcon(dir: string): string {
  if (dir === "rising") return "↑";
  if (dir === "declining") return "↓";
  return "→";
}

function getDirectionColor(dir: string): string {
  if (dir === "rising") return "text-green-600";
  if (dir === "declining") return "text-red-600";
  return "text-[var(--text-muted)]";
}

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p.map(String);
  } catch { /* noop */ }
  return raw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
}

// --- Main Component ---

export default function CrossStitchResearchPage() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanRun[]>([]);
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Manual search state
  const [keyword, setKeyword] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<ManualSearchResult | null>(null);
  const [searchError, setSearchError] = useState("");
  const [sortBy, setSortBy] = useState<"favorites" | "sales" | "price">("favorites");

  // Ideas state
  const [ideas, setIdeas] = useState<ProductIdea[]>([]);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideasError, setIdeasError] = useState<string | null>(null);
  const [ideasStyle, setIdeasStyle] = useState<"all" | "funny">("all");
  const [ideasCount, setIdeasCount] = useState(10);

  // Fetch scan status
  const fetchStatus = useCallback(async () => {
    try {
      const resp = await fetch("/api/research/scan?action=status");
      const data = await resp.json();
      setScanStatus(data);
      return data as ScanStatus;
    } catch {
      return null;
    }
  }, []);

  // Fetch analysis data
  const fetchAnalysis = useCallback(async (scanRunId?: number) => {
    try {
      const url = scanRunId
        ? `/api/research/analysis?scanRunId=${scanRunId}`
        : "/api/research/analysis";
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        setAnalysis(data);
      }
    } catch { /* no analysis yet */ }
  }, []);

  // Fetch scan history
  const fetchHistory = useCallback(async () => {
    try {
      const resp = await fetch("/api/research/scan?action=history");
      const data = await resp.json();
      setScanHistory(data);
    } catch { /* skip */ }
  }, []);

  // Initial load
  useEffect(() => {
    Promise.all([fetchStatus(), fetchAnalysis(), fetchHistory()]).then(() => setLoading(false));
  }, [fetchStatus, fetchAnalysis, fetchHistory]);

  // Poll during scan
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
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [scanStatus?.isRunning, fetchStatus, fetchAnalysis, fetchHistory]);

  // Start scan
  async function startScan() {
    try {
      const resp = await fetch("/api/research/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (resp.ok) await fetchStatus();
    } catch { /* skip */ }
  }

  // Cancel scan
  async function handleCancelScan() {
    try {
      await fetch("/api/research/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      await fetchStatus();
    } catch { /* skip */ }
  }

  // Manual search
  async function searchNiche(searchKeyword?: string) {
    const kw = searchKeyword || keyword;
    if (!kw.trim()) return;
    setSearching(true);
    setSearchError("");
    setSearchResult(null);
    try {
      const resp = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: kw, limit: 25 }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Search failed");
      setSearchResult(data);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  // Generate ideas
  async function generateIdeas() {
    setIdeasLoading(true);
    setIdeasError(null);
    try {
      const body: Record<string, unknown> = {
        count: ideasCount,
        focus: "cross-stitch",
      };
      if (ideasStyle === "funny") body.style = "funny";

      const resp = await fetch("/api/research/ideas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Idea generation failed");
      setIdeas((prev) => [...(data.ideas || []), ...prev]);
    } catch (err) {
      setIdeasError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIdeasLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-[var(--text-muted)]">Loading research data...</div>
      </div>
    );
  }

  const isRunning = scanStatus?.isRunning || false;
  const progress =
    scanStatus && scanStatus.keywordsTotal > 0
      ? Math.round((scanStatus.keywordsScanned / scanStatus.keywordsTotal) * 100)
      : 0;
  const lastScan = scanHistory[0];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">🧵</span>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Cross-Stitch Market Intelligence
          </h2>
        </div>
        <p className="text-[var(--text-secondary)] mt-1 ml-10">
          Etsy cross-stitch pattern market analysis &amp; AI-powered idea generation
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 mb-6 bg-white/[0.06] rounded-lg p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-white/[0.1] text-white"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            } ${tab.key === "ideas" && activeTab !== "ideas" ? "text-amber-400 hover:text-amber-300" : ""}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Scan control bar — shown on Dashboard tab */}
      {activeTab === "dashboard" && (
        <div className="mb-6 bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {!isRunning ? (
                <button
                  onClick={startScan}
                  className="px-5 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors text-sm"
                >
                  Start Full Scan
                </button>
              ) : (
                <button
                  onClick={handleCancelScan}
                  className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors text-sm"
                >
                  Cancel Scan
                </button>
              )}
              {lastScan && !isRunning && (
                <span className="text-xs text-[var(--text-muted)]">
                  Last scan: {new Date(lastScan.started_at).toLocaleDateString()} —{" "}
                  <span
                    className={
                      lastScan.status === "completed"
                        ? "text-green-600"
                        : "text-amber-600"
                    }
                  >
                    {lastScan.status}
                  </span>
                  {lastScan.listings_found > 0 &&
                    ` (${lastScan.listings_found.toLocaleString()} listings)`}
                </span>
              )}
            </div>
            {isRunning && scanStatus && (
              <span className="text-xs text-[var(--text-muted)]">
                {scanStatus.keywordsScanned}/{scanStatus.keywordsTotal} keywords
                {" | "}
                {scanStatus.listingsFound.toLocaleString()} listings
              </span>
            )}
          </div>

          {/* Progress bar */}
          {isRunning && scanStatus && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-indigo-400 font-medium truncate max-w-sm">
                  Scanning: {scanStatus.currentKeyword}
                </span>
                <span className="text-xs text-[var(--text-muted)]">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab content */}
      {activeTab === "dashboard" && (
        <DashboardTab analysis={analysis} scanHistory={scanHistory} />
      )}
      {activeTab === "products" && (
        <TopProductsTab products={analysis?.topProducts || []} />
      )}
      {activeTab === "categories" && (
        <CategoriesTab categories={analysis?.categories || []} />
      )}
      {activeTab === "trends" && <TrendsTab trends={analysis?.trends || []} />}
      {activeTab === "strategy" && (
        <StrategyTab
          opportunities={analysis?.opportunities || []}
          priceInsights={analysis?.priceInsights || []}
          tagAnalysis={analysis?.tagAnalysis || []}
        />
      )}
      {activeTab === "search" && (
        <ManualSearchTab
          keyword={keyword}
          setKeyword={setKeyword}
          searching={searching}
          searchResult={searchResult}
          searchError={searchError}
          sortBy={sortBy}
          setSortBy={setSortBy}
          searchNiche={searchNiche}
        />
      )}
      {activeTab === "ideas" && (
        <IdeasTab
          ideas={ideas}
          loading={ideasLoading}
          error={ideasError}
          style={ideasStyle}
          setStyle={setIdeasStyle}
          count={ideasCount}
          setCount={setIdeasCount}
          onGenerate={generateIdeas}
        />
      )}
    </div>
  );
}

// ============ DASHBOARD TAB ============

function DashboardTab({
  analysis,
  scanHistory,
}: {
  analysis: FullAnalysis | null;
  scanHistory: ScanRun[];
}) {
  if (!analysis) {
    return (
      <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-12 text-center">
        <p className="text-[var(--text-secondary)] text-lg mb-2">No scan data yet</p>
        <p className="text-[var(--text-muted)] text-sm">
          Click "Start Full Scan" to analyze cross-stitch pattern categories on Etsy
        </p>
      </div>
    );
  }

  const ov = analysis.overview;
  const topCats = analysis.categories.slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Keywords Scanned" value={String(ov.totalKeywordsScanned)} />
        <StatCard label="Listings Analyzed" value={ov.uniqueListings.toLocaleString()} />
        <StatCard label="Avg Price" value={`$${ov.avgPrice}`} />
        <StatCard label="Avg Favorites" value={String(ov.avgFavorites)} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4">
          <p className="text-xs text-[var(--text-muted)] mb-1">Top Category (by engagement)</p>
          <p className="text-lg font-bold text-indigo-400">{ov.topCategory}</p>
        </div>
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4">
          <p className="text-xs text-[var(--text-muted)] mb-1">Total Market Listings</p>
          <p className="text-lg font-bold text-white">{ov.totalMarketListings.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
        <div className="p-4 border-b border-white/[0.08]">
          <h3 className="font-semibold text-white">Top 10 Categories by Demand</h3>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {topCats.map((cat, i) => {
            const maxFavs = topCats[0]?.avgFavorites || 1;
            const barWidth = Math.round((cat.avgFavorites / maxFavs) * 100);
            return (
              <div key={cat.keyword} className="flex items-center gap-4 px-4 py-3">
                <span className="text-xs text-[var(--text-muted)] w-5 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-white truncate">{cat.keyword}</span>
                    <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] flex-shrink-0 ml-3">
                      <span>${cat.avgPrice}</span>
                      <span>{cat.avgFavorites} favs</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${getCompetitionColor(cat.competitionLevel)}`}
                      >
                        {cat.competitionLevel}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getDemandColor(cat.demandScore)}`}
                      >
                        {cat.demandScore}
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${barWidth}%` }}
                    />
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
            <h3 className="font-semibold text-white">Scan History</h3>
          </div>
          <table className="w-full text-sm">
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
                  <td className="p-3 text-[var(--text-secondary)]">
                    {new Date(run.started_at).toLocaleString()}
                  </td>
                  <td className="p-3 text-right">
                    {run.keywords_scanned}/{run.keywords_total}
                  </td>
                  <td className="p-3 text-right">{run.listings_found.toLocaleString()}</td>
                  <td className="p-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        run.status === "completed"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : run.status === "failed"
                          ? "bg-red-500/15 text-red-400"
                          : "bg-amber-500/15 text-amber-400"
                      }`}
                    >
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
    </div>
  );
}

// ============ TOP PRODUCTS TAB ============

function TopProductsTab({ products }: { products: TrackedListing[] }) {
  const [productSort, setProductSort] = useState<"favorites" | "sales" | "price" | "revenue">(
    "favorites",
  );

  const sorted = [...products].sort((a, b) => {
    if (productSort === "favorites") return b.favorites - a.favorites;
    if (productSort === "sales") return b.sales_estimate - a.sales_estimate;
    if (productSort === "price") return b.price - a.price;
    return (b.revenue_estimate || 0) - (a.revenue_estimate || 0);
  });

  if (products.length === 0) {
    return <EmptyState message="Run a scan to see top-performing cross-stitch listings" />;
  }

  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-white/[0.08]">
        <h3 className="font-semibold text-white">Top {sorted.length} Listings</h3>
        <div className="flex gap-2">
          {(["favorites", "sales", "price", "revenue"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setProductSort(s)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                productSort === s
                  ? "bg-indigo-600 text-white"
                  : "bg-white/[0.06] text-[var(--text-secondary)] hover:bg-white/[0.1]"
              }`}
            >
              {s === "favorites"
                ? "Favorites"
                : s === "sales"
                ? "Est. Sales"
                : s === "price"
                ? "Price"
                : "Revenue"}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.04]">
            <tr>
              <th className="text-left p-3 text-[var(--text-secondary)] font-medium">Product</th>
              <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Price</th>
              <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Favorites</th>
              <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Est. Sales</th>
              <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Revenue</th>
              <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Age</th>
              <th className="text-left p-3 text-[var(--text-secondary)] font-medium">Category</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((listing) => (
              <tr
                key={listing.listing_id}
                className="border-t border-white/[0.06] hover:bg-white/[0.04]"
              >
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    {listing.image_url && (
                      <img
                        src={listing.image_url}
                        alt=""
                        className="w-10 h-10 rounded object-cover flex-shrink-0"
                      />
                    )}
                    <a
                      href={listing.url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white hover:text-indigo-400 line-clamp-2 max-w-sm"
                    >
                      {listing.title}
                    </a>
                  </div>
                </td>
                <td className="p-3 text-right font-medium text-white">
                  ${listing.price.toFixed(2)}
                </td>
                <td className="p-3 text-right">
                  <span className="text-pink-400 font-medium">
                    {listing.favorites.toLocaleString()}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <span className="text-green-400 font-medium">{listing.sales_estimate}</span>
                </td>
                <td className="p-3 text-right">
                  <span className="text-indigo-400 font-medium">
                    ${(listing.revenue_estimate || 0).toFixed(2)}
                  </span>
                </td>
                <td className="p-3 text-right text-[var(--text-muted)]">
                  {listing.listing_age_days}d
                </td>
                <td className="p-3 text-[var(--text-muted)] text-xs truncate max-w-[120px]">
                  {listing.keyword || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ CATEGORIES TAB ============

function CategoriesTab({ categories }: { categories: CategoryAnalysis[] }) {
  const [catSort, setCatSort] = useState<"demand" | "favorites" | "price" | "competition">(
    "demand",
  );

  const sorted = [...categories]
    .filter((c) => !c.error)
    .sort((a, b) => {
      if (catSort === "demand") return b.demandScore - a.demandScore;
      if (catSort === "favorites") return b.avgFavorites - a.avgFavorites;
      if (catSort === "price") return b.avgPrice - a.avgPrice;
      const compOrder = { low: 0, medium: 1, high: 2, "very high": 3, unknown: 4 };
      return (
        (compOrder[a.competitionLevel as keyof typeof compOrder] || 4) -
        (compOrder[b.competitionLevel as keyof typeof compOrder] || 4)
      );
    });

  if (categories.length === 0) {
    return <EmptyState message="Run a scan to see cross-stitch category analysis" />;
  }

  const maxFavs = Math.max(...sorted.map((c) => c.avgFavorites), 1);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["demand", "favorites", "price", "competition"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setCatSort(s)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              catSort === s
                ? "bg-indigo-600 text-white"
                : "bg-white/[0.06] text-[var(--text-secondary)] hover:bg-white/[0.1]"
            }`}
          >
            {s === "demand"
              ? "Demand Score"
              : s === "favorites"
              ? "Avg Favorites"
              : s === "price"
              ? "Avg Price"
              : "Competition"}
          </button>
        ))}
      </div>

      <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
        <div className="divide-y divide-white/[0.06]">
          {sorted.map((cat, i) => {
            const barWidth = Math.round((cat.avgFavorites / maxFavs) * 100);
            return (
              <div key={cat.keyword} className="px-4 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--text-muted)] w-5 text-right">{i + 1}</span>
                    <span className="text-sm font-medium text-white">{cat.keyword}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-[var(--text-muted)]">
                      {cat.totalResults.toLocaleString()} results
                    </span>
                    <span className="text-[var(--text-secondary)] font-medium">${cat.avgPrice}</span>
                    <span className="text-pink-400 font-medium">{cat.avgFavorites} favs</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${getCompetitionColor(cat.competitionLevel)}`}
                    >
                      {cat.competitionLevel}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getDemandColor(cat.demandScore)}`}
                    >
                      {cat.demandScore}/100
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${barWidth}%`,
                        backgroundColor:
                          cat.demandScore >= 70
                            ? "#22c55e"
                            : cat.demandScore >= 40
                            ? "#f59e0b"
                            : "#ef4444",
                      }}
                    />
                  </div>
                </div>
                {cat.topTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {cat.topTags.slice(0, 6).map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 bg-white/[0.06] text-[var(--text-muted)] rounded text-[10px]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============ TRENDS TAB ============

function TrendsTab({ trends }: { trends: TrendItem[] }) {
  if (trends.length === 0) {
    return (
      <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-12 text-center">
        <p className="text-[var(--text-secondary)] text-lg mb-2">No trend data yet</p>
        <p className="text-[var(--text-muted)] text-sm">
          Run at least two scans to see trending cross-stitch categories
        </p>
      </div>
    );
  }

  const rising = trends.filter((t) => t.direction === "rising");
  const declining = trends.filter((t) => t.direction === "declining");
  const stable = trends.filter((t) => t.direction === "stable");

  return (
    <div className="space-y-6">
      {rising.length > 0 && <TrendSection title="Rising" items={rising} color="green" />}
      {declining.length > 0 && <TrendSection title="Declining" items={declining} color="red" />}
      {stable.length > 0 && <TrendSection title="Stable" items={stable} color="slate" />}
    </div>
  );
}

function TrendSection({
  title,
  items,
  color,
}: {
  title: string;
  items: TrendItem[];
  color: string;
}) {
  const colorMap: Record<string, { bg: string; text: string; badge: string }> = {
    green: {
      bg: "bg-emerald-500/10",
      text: "text-emerald-400",
      badge: "bg-emerald-500/15 text-emerald-400",
    },
    red: {
      bg: "bg-red-500/10",
      text: "text-red-400",
      badge: "bg-red-500/15 text-red-400",
    },
    slate: {
      bg: "bg-white/[0.04]",
      text: "text-[var(--text-secondary)]",
      badge: "bg-white/[0.06] text-[var(--text-secondary)]",
    },
  };
  const c = colorMap[color] || colorMap.slate;

  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
      <div className={`p-4 border-b border-white/[0.08] ${c.bg}`}>
        <h3 className={`font-semibold ${c.text}`}>
          {title} ({items.length})
        </h3>
      </div>
      <div className="divide-y divide-white/[0.06]">
        {items.map((item) => (
          <div key={item.category} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <span className={`text-lg font-bold ${getDirectionColor(item.direction)}`}>
                {getDirectionIcon(item.direction)}
              </span>
              <span className="text-sm font-medium text-white">{item.category}</span>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="text-right">
                <span className="text-[var(--text-muted)]">Favorites: </span>
                <span className={c.text}>
                  {item.changePercent > 0 ? "+" : ""}
                  {item.changePercent}%
                </span>
                <span className="text-[var(--text-muted)] ml-1">
                  ({item.previousFavorites} → {item.currentFavorites})
                </span>
              </div>
              <div className="text-right">
                <span className="text-[var(--text-muted)]">Price: </span>
                <span
                  className={
                    item.priceChangePercent > 0
                      ? "text-green-400"
                      : item.priceChangePercent < 0
                      ? "text-red-400"
                      : "text-[var(--text-muted)]"
                  }
                >
                  {item.priceChangePercent > 0 ? "+" : ""}
                  {item.priceChangePercent}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ STRATEGY TAB ============

function StrategyTab({
  opportunities,
  priceInsights,
  tagAnalysis,
}: {
  opportunities: OpportunityGap[];
  priceInsights: PriceInsight[];
  tagAnalysis: TagInsight[];
}) {
  if (opportunities.length === 0) {
    return <EmptyState message="Run a scan to generate cross-stitch strategy recommendations" />;
  }

  return (
    <div className="space-y-6">
      {/* Opportunity gaps */}
      <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
        <div className="p-4 border-b border-white/[0.08]">
          <h3 className="font-semibold text-white">Top Opportunities</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            High demand + low competition = best opportunities to list
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
          {opportunities.slice(0, 15).map((opp, i) => (
            <div key={opp.category} className="border border-white/[0.08] rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[var(--text-muted)]">#{i + 1}</span>
                <span className="text-xs font-bold text-indigo-400">
                  Score: {opp.opportunityScore}
                </span>
              </div>
              <p className="text-sm font-medium text-white mb-1">{opp.category}</p>
              <p className="text-[11px] text-[var(--text-muted)] mb-2">{opp.reason}</p>
              <div className="flex items-center gap-2 text-[10px]">
                <span
                  className={`px-1.5 py-0.5 rounded font-medium ${getDemandColor(opp.demandScore)}`}
                >
                  Demand: {opp.demandScore}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded font-medium capitalize ${getCompetitionColor(opp.competitionLevel)}`}
                >
                  {opp.competitionLevel}
                </span>
                <span className="text-[var(--text-muted)]">${opp.avgPrice}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Price optimization */}
      <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
        <div className="p-4 border-b border-white/[0.08]">
          <h3 className="font-semibold text-white">Price Sweet Spots</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Optimal pricing based on top performers in each category
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.04]">
              <tr>
                <th className="text-left p-3 text-[var(--text-secondary)] font-medium">Category</th>
                <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Min</th>
                <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Avg</th>
                <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Median</th>
                <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Max</th>
                <th className="text-right p-3 text-[var(--text-secondary)] font-medium">
                  Sweet Spot
                </th>
              </tr>
            </thead>
            <tbody>
              {priceInsights.slice(0, 20).map((pi) => (
                <tr key={pi.category} className="border-t border-white/[0.06]">
                  <td className="p-3 text-white font-medium text-xs">{pi.category}</td>
                  <td className="p-3 text-right text-[var(--text-muted)]">${pi.minPrice}</td>
                  <td className="p-3 text-right text-[var(--text-muted)]">${pi.avgPrice}</td>
                  <td className="p-3 text-right text-[var(--text-muted)]">${pi.medianPrice}</td>
                  <td className="p-3 text-right text-[var(--text-muted)]">${pi.maxPrice}</td>
                  <td className="p-3 text-right font-bold text-green-400">${pi.sweetSpot}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top tags */}
      <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
        <div className="p-4 border-b border-white/[0.08]">
          <h3 className="font-semibold text-white">Top Tags</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Most used tags across cross-stitch categories
          </p>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap gap-2">
            {tagAnalysis.slice(0, 30).map((tag) => (
              <span
                key={tag.tag}
                className="px-2.5 py-1.5 bg-indigo-500/15 text-indigo-400 rounded-lg text-xs"
                title={`Used in ${tag.frequency} categories, avg ${tag.avgFavorites} favorites`}
              >
                {tag.tag}
                <span className="text-indigo-400/60 ml-1">({tag.frequency})</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ MANUAL SEARCH TAB ============

function ManualSearchTab({
  keyword,
  setKeyword,
  searching,
  searchResult,
  searchError,
  sortBy,
  setSortBy,
  searchNiche,
}: {
  keyword: string;
  setKeyword: (k: string) => void;
  searching: boolean;
  searchResult: ManualSearchResult | null;
  searchError: string;
  sortBy: "favorites" | "sales" | "price";
  setSortBy: (s: "favorites" | "sales" | "price") => void;
  searchNiche: (kw?: string) => void;
}) {
  const sortedListings = searchResult?.listings
    ? [...searchResult.listings].sort((a, b) => {
        if (sortBy === "favorites") return b.favorites - a.favorites;
        if (sortBy === "sales") return b.sales_estimate - a.sales_estimate;
        return b.price - a.price;
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && searchNiche()}
          placeholder="Search a cross-stitch niche... e.g. 'funny goose cross stitch'"
          className="flex-1 px-4 py-3 border border-white/[0.1] bg-[var(--bg-surface)] rounded-lg text-sm text-white placeholder-[var(--text-muted)] focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50"
        />
        <button
          onClick={() => searchNiche()}
          disabled={searching || !keyword.trim()}
          className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {searching ? "Searching..." : "Research"}
        </button>
      </div>

      <div>
        <p className="text-xs text-[var(--text-muted)] mb-2">Quick cross-stitch searches:</p>
        <div className="flex flex-wrap gap-2">
          {CS_SUGGESTED_NICHES.map((niche) => (
            <button
              key={niche}
              onClick={() => {
                setKeyword(niche);
                searchNiche(niche);
              }}
              disabled={searching}
              className="px-3 py-1 bg-white/[0.06] text-[var(--text-secondary)] rounded-full text-xs hover:bg-indigo-500/15 hover:text-indigo-400 transition-colors"
            >
              {niche}
            </button>
          ))}
        </div>
      </div>

      {searchError && (
        <div className="p-3 bg-red-500/15 text-red-400 rounded-lg text-sm">{searchError}</div>
      )}

      {searchResult && (
        <div className="space-y-6">
          <div className="grid grid-cols-5 gap-4">
            <StatCard
              label="Total Results"
              value={searchResult.total_results.toLocaleString()}
            />
            <StatCard label="Avg Price" value={`$${searchResult.analysis.avg_price}`} />
            <StatCard
              label="Avg Favorites"
              value={String(searchResult.analysis.avg_favorites)}
            />
            <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4">
              <p className="text-xs text-[var(--text-muted)]">Competition</p>
              <p
                className={`text-lg font-bold capitalize px-2 py-0.5 rounded inline-block mt-1 ${getCompetitionColor(searchResult.analysis.competition_level)}`}
              >
                {searchResult.analysis.competition_level}
              </p>
            </div>
            <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4">
              <p className="text-xs text-[var(--text-muted)]">Demand Score</p>
              <p
                className={`text-2xl font-bold px-2 py-0.5 rounded inline-block mt-1 ${getDemandColor(searchResult.analysis.demand_score)}`}
              >
                {searchResult.analysis.demand_score}/100
              </p>
            </div>
          </div>

          {searchResult.top_tags.length > 0 && (
            <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4">
              <h3 className="text-sm font-semibold text-white mb-2">Top Tags</h3>
              <div className="flex flex-wrap gap-2">
                {searchResult.top_tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 bg-indigo-500/15 text-indigo-400 rounded text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/[0.08]">
              <h3 className="font-semibold text-white">Top {sortedListings.length} Listings</h3>
              <div className="flex gap-2">
                {(["favorites", "sales", "price"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSortBy(s)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      sortBy === s
                        ? "bg-indigo-600 text-white"
                        : "bg-white/[0.06] text-[var(--text-secondary)] hover:bg-white/[0.1]"
                    }`}
                  >
                    {s === "favorites" ? "Favorites" : s === "sales" ? "Est. Sales" : "Price"}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/[0.04]">
                  <tr>
                    <th className="text-left p-3 text-[var(--text-secondary)] font-medium">
                      Product
                    </th>
                    <th className="text-right p-3 text-[var(--text-secondary)] font-medium">
                      Price
                    </th>
                    <th className="text-right p-3 text-[var(--text-secondary)] font-medium">
                      Favorites
                    </th>
                    <th className="text-right p-3 text-[var(--text-secondary)] font-medium">
                      Est. Sales
                    </th>
                    <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Age</th>
                    <th className="text-left p-3 text-[var(--text-secondary)] font-medium">Shop</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedListings.map((listing) => (
                    <tr
                      key={listing.listing_id}
                      className="border-t border-white/[0.06] hover:bg-white/[0.04]"
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          {listing.image_url && (
                            <img
                              src={listing.image_url}
                              alt=""
                              className="w-10 h-10 rounded object-cover flex-shrink-0"
                            />
                          )}
                          <a
                            href={listing.url || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white hover:text-indigo-400 line-clamp-2 max-w-md"
                          >
                            {listing.title}
                          </a>
                        </div>
                      </td>
                      <td className="p-3 text-right font-medium text-white">
                        ${listing.price.toFixed(2)}
                      </td>
                      <td className="p-3 text-right">
                        <span className="text-pink-400 font-medium">
                          {listing.favorites.toLocaleString()}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <span className="text-green-400 font-medium">
                          {listing.sales_estimate}
                        </span>
                      </td>
                      <td className="p-3 text-right text-[var(--text-muted)]">
                        {listing.listing_age_days}d
                      </td>
                      <td className="p-3 text-[var(--text-muted)]">{listing.shop_name}</td>
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

// ============ IDEAS TAB ============

const IDEA_STYLES: { key: "all" | "funny"; label: string; description: string; emoji: string }[] =
  [
    {
      key: "all",
      label: "All Formulas",
      description:
        "NalaAndStitch costume characters, animal props, kawaii food, floral, seasonal — the full proven bestseller range",
      emoji: "🎨",
    },
    {
      key: "funny",
      label: "Funny / Snarky",
      description:
        "Animal + snarky relatable caption (Formula 2 focus) — 'Frog Not My Problem', 'Duck I'm Fine Everything Is Fine'",
      emoji: "😂",
    },
  ];

function IdeasTab({
  ideas,
  loading,
  error,
  style,
  setStyle,
  count,
  setCount,
  onGenerate,
}: {
  ideas: ProductIdea[];
  loading: boolean;
  error: string | null;
  style: "all" | "funny";
  setStyle: (s: "all" | "funny") => void;
  count: number;
  setCount: (n: number) => void;
  onGenerate: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Generator panel */}
      <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-white mb-0.5">Cross-Stitch Idea Generator</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Gemini generates ideas grounded in your live Etsy market signals, filtered to
              cross-stitch patterns only
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--text-muted)]">Ideas:</label>
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="px-2 py-1 bg-[var(--bg-surface)] border border-white/[0.1] rounded text-xs text-white"
            >
              {[5, 10, 15, 20].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Style picker */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {IDEA_STYLES.map((s) => (
            <button
              key={s.key}
              onClick={() => setStyle(s.key)}
              className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                style === s.key
                  ? "border-indigo-500/60 bg-indigo-500/10"
                  : "border-white/[0.08] hover:border-white/[0.16] hover:bg-white/[0.04]"
              }`}
            >
              <span className="text-2xl flex-shrink-0 mt-0.5">{s.emoji}</span>
              <div>
                <p
                  className={`text-sm font-semibold ${
                    style === s.key ? "text-indigo-300" : "text-white"
                  }`}
                >
                  {s.label}
                </p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed">
                  {s.description}
                </p>
              </div>
              {style === s.key && (
                <span className="ml-auto flex-shrink-0 w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center mt-0.5">
                  <svg
                    className="w-2.5 h-2.5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={onGenerate}
          disabled={loading}
          className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Generating {count} cross-stitch ideas...
            </>
          ) : (
            <>✦ Generate {count} Ideas</>
          )}
        </button>

        {error && (
          <div className="mt-3 p-3 bg-red-500/15 text-red-400 rounded-lg text-sm">{error}</div>
        )}
      </div>

      {/* Ideas grid */}
      {ideas.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-white">
              {ideas.length} idea{ideas.length !== 1 ? "s" : ""} generated
            </h3>
            <span className="text-xs text-[var(--text-muted)]">Newest first · Click to design</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {ideas.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} />
            ))}
          </div>
        </div>
      )}

      {ideas.length === 0 && !loading && (
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-12 text-center">
          <p className="text-4xl mb-3">🧵</p>
          <p className="text-[var(--text-secondary)] text-lg mb-1">No ideas yet</p>
          <p className="text-[var(--text-muted)] text-sm">
            Choose a style above and click Generate Ideas
          </p>
        </div>
      )}
    </div>
  );
}

function IdeaCard({ idea }: { idea: ProductIdea }) {
  const tags = parseJsonArray(idea.suggested_tags).slice(0, 6);
  const keywords = parseJsonArray(idea.suggested_keywords).slice(0, 3);

  const designUrl = `/cross-stitch?idea=${encodeURIComponent(idea.title)}`;

  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4 flex flex-col gap-3 hover:border-indigo-500/30 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-white leading-snug flex-1">{idea.title}</p>
        <a
          href={designUrl}
          className="flex-shrink-0 px-2.5 py-1 bg-indigo-600 text-white text-[11px] font-semibold rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap"
          title="Open in Cross-Stitch Studio"
        >
          Design This →
        </a>
      </div>

      {/* Scores */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold ${getDemandColor(idea.demand_score)}`}
        >
          Demand {idea.demand_score}
        </span>
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-medium ${
            idea.competition_score <= 40
              ? "text-emerald-400 bg-emerald-500/15"
              : idea.competition_score <= 65
              ? "text-amber-400 bg-amber-500/15"
              : "text-red-400 bg-red-500/15"
          }`}
        >
          Competition {idea.competition_score}
        </span>
        {idea.suggested_price > 0 && (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium text-green-400 bg-green-500/15">
            ${idea.suggested_price.toFixed(2)}
          </span>
        )}
        <span className="px-2 py-0.5 rounded text-[10px] font-medium text-indigo-400 bg-indigo-500/15">
          Confidence {idea.confidence}%
        </span>
      </div>

      {/* Why now */}
      {idea.why_now && (
        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed line-clamp-3">
          {idea.why_now}
        </p>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 bg-white/[0.06] text-[var(--text-muted)] rounded text-[10px]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Keywords */}
      {keywords.length > 0 && (
        <div className="pt-1 border-t border-white/[0.06]">
          <p className="text-[10px] text-[var(--text-muted)] mb-1 font-medium uppercase tracking-wide">
            Search keywords
          </p>
          <div className="flex flex-wrap gap-1">
            {keywords.map((kw) => (
              <span
                key={kw}
                className="px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 rounded text-[10px]"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ SHARED ============

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-12 text-center">
      <p className="text-[var(--text-muted)]">{message}</p>
    </div>
  );
}
