"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProductsTab from "@/components/research/ProductsTab";
import TagAnalyticsTab from "@/components/research/TagAnalyticsTab";
import RadarTab from "@/components/research/RadarTab";
import ProfitTab from "@/components/research/ProfitTab";
import IdeasTab from "@/components/research/IdeasTab";

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

// Manual search types
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

// --- Tabs ---

// Tab roster — the new tabs (Products, Tags) are EverBee-equivalent
// surfaces driven by Etsy v3 API (TOS-safe). The legacy tabs
// (Top Products, Categories, Trends, Strategy, Manual Search) are
// kept as inactive ?legacy=1 options for now — most of what they
// did is better-served by per-niche pages or the new tabs.
type Tab = "dashboard" | "ideas" | "research_products" | "research_tags" | "radar" | "profit" | "products" | "categories" | "trends" | "strategy" | "search";

const TABS: { key: Tab; label: string }[] = [
  { key: "ideas", label: "Ideas" },
  { key: "search", label: "Search Etsy" },
  { key: "research_products", label: "Products" },
  { key: "research_tags", label: "Tags" },
  { key: "radar", label: "Radar" },
  { key: "dashboard", label: "Scan Data" },
  { key: "profit", label: "Profit" },
];

const TAB_KEYS = new Set<Tab>([
  ...TABS.map((tab) => tab.key),
  "products",
  "categories",
  "trends",
  "strategy",
  "search",
]);

function parseTab(value: string | null): Tab {
  return value && TAB_KEYS.has(value as Tab) ? (value as Tab) : "ideas";
}

const SUGGESTED_NICHES = [
  "wedding planner spreadsheet guest list vendor tracker",
  "etsy inventory tracker cogs materials stock spreadsheet",
  "teacher gradebook lesson planner attendance spreadsheet",
  "travel itinerary planner budget packing list spreadsheet",
  "client crm project tracker spreadsheet",
  "rental property tracker rent ledger roi spreadsheet",
  "social media content calendar spreadsheet",
  "meal planner grocery list recipe bank spreadsheet",
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
  if (dir === "rising") return "\u2191";
  if (dir === "declining") return "\u2193";
  return "\u2192";
}

function getDirectionColor(dir: string): string {
  if (dir === "rising") return "text-green-600";
  if (dir === "declining") return "text-red-600";
  return "text-[var(--text-muted)]";
}

// --- Main Component ---

export default function ResearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] p-8">
          Loading research workspace...
        </div>
      }
    >
      <ResearchPageContent />
    </Suspense>
  );
}

function ResearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>("ideas");
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

  useEffect(() => {
    setActiveTab(parseTab(searchParams.get("tab")));
  }, [searchParams]);

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "ideas") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const query = params.toString();
    router.replace(query ? `/research?${query}` : "/research", { scroll: false });
  }, [router, searchParams]);

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
    } catch {
      // No analysis yet
    }
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
          // Scan finished — load analysis
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
      if (resp.ok) {
        await fetchStatus();
      }
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

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-[var(--text-muted)]">Loading research data...</div>
      </div>
    );
  }

  const isRunning = scanStatus?.isRunning || false;
  const progress = scanStatus && scanStatus.keywordsTotal > 0
    ? Math.round((scanStatus.keywordsScanned / scanStatus.keywordsTotal) * 100)
    : 0;
  const lastScan = scanHistory[0];

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] via-white/[0.025] to-transparent p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-orange-300/80">
              Research Command Center
            </p>
            <h2 className="text-3xl font-bold tracking-tight text-white">
              Find products worth building
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/45">
              Search Etsy-safe market data, inspect tags/products, then send the best evidence into Product Factory.
            </p>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!keyword.trim()) return;
              handleTabChange("search");
              void searchNiche();
            }}
            className="w-full lg:max-w-xl"
          >
            <div className="flex rounded-xl border border-white/[0.10] bg-black/20 p-1 focus-within:border-orange-400/50">
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="Search: wedding planner spreadsheet"
                className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none"
              />
              <button
                type="submit"
                disabled={searching || !keyword.trim()}
                className="rounded-lg bg-orange-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-orange-500 disabled:opacity-35"
              >
                {searching ? "Searching" : "Research"}
              </button>
            </div>
          </form>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTED_NICHES.slice(0, 6).map((niche) => (
            <button
              key={niche}
              onClick={() => {
                setKeyword(niche);
                handleTabChange("search");
                void searchNiche(niche);
              }}
              disabled={searching}
              className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-white/55 transition-colors hover:border-orange-400/35 hover:bg-orange-500/[0.08] hover:text-orange-200 disabled:opacity-40"
            >
              {niche.replace(" spreadsheet", "")}
            </button>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.04] p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-orange-500 text-white shadow-lg shadow-orange-500/15"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
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
                  <span className={lastScan.status === "completed" ? "text-green-600" : "text-amber-600"}>
                    {lastScan.status}
                  </span>
                  {lastScan.listings_found > 0 && ` (${lastScan.listings_found.toLocaleString()} listings)`}
                </span>
              )}
            </div>

            {isRunning && scanStatus && (
              <span className="text-xs text-[var(--text-muted)]">
                {scanStatus.keywordsScanned}/{scanStatus.keywordsTotal} keywords
                {" | "}{scanStatus.listingsFound.toLocaleString()} listings
              </span>
            )}
          </div>

          {/* Progress bar */}
          {isRunning && scanStatus && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-indigo-600 font-medium truncate max-w-sm">
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
      {activeTab === "dashboard" && <DashboardTab analysis={analysis} scanHistory={scanHistory} />}
      {activeTab === "ideas" && <IdeasTab />}
      {activeTab === "research_products" && <ProductsTab />}
      {activeTab === "research_tags" && <TagAnalyticsTab />}
      {activeTab === "radar" && <RadarTab />}
      {activeTab === "profit" && <ProfitTab />}
      {/* Legacy tabs — kept so old links don't 404 but removed from the nav. */}
      {activeTab === "products" && <TopProductsTab products={analysis?.topProducts || []} />}
      {activeTab === "categories" && <CategoriesTab categories={analysis?.categories || []} />}
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
    </div>
  );
}

// ============ DASHBOARD TAB ============

function DashboardTab({ analysis, scanHistory }: { analysis: FullAnalysis | null; scanHistory: ScanRun[] }) {
  if (!analysis) {
    return (
      <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-12 text-center">
        <p className="text-[var(--text-secondary)] text-lg mb-2">No scan data yet</p>
        <p className="text-[var(--text-muted)] text-sm">Click "Start Full Scan" to analyze 85+ digital product categories on Etsy</p>
      </div>
    );
  }

  const ov = analysis.overview;
  const topCats = analysis.categories.slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Overview cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Keywords Scanned" value={String(ov.totalKeywordsScanned)} />
        <StatCard label="Listings Analyzed" value={ov.uniqueListings.toLocaleString()} />
        <StatCard label="Avg Price" value={`$${ov.avgPrice}`} />
        <StatCard label="Avg Favorites" value={String(ov.avgFavorites)} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4">
          <p className="text-xs text-[var(--text-muted)] mb-1">Top Category (by engagement)</p>
          <p className="text-lg font-bold text-indigo-600">{ov.topCategory}</p>
        </div>
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4">
          <p className="text-xs text-[var(--text-muted)] mb-1">Total Market Listings</p>
          <p className="text-lg font-bold text-white">{ov.totalMarketListings.toLocaleString()}</p>
        </div>
      </div>

      {/* Top 10 categories quick view */}
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
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${getCompetitionColor(cat.competitionLevel)}`}>
                        {cat.competitionLevel}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getDemandColor(cat.demandScore)}`}>
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

      {/* Scan history */}
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
                  <td className="p-3 text-[var(--text-secondary)]">{new Date(run.started_at).toLocaleString()}</td>
                  <td className="p-3 text-right">{run.keywords_scanned}/{run.keywords_total}</td>
                  <td className="p-3 text-right">{run.listings_found.toLocaleString()}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      run.status === "completed" ? "bg-emerald-500/15 text-emerald-400" :
                      run.status === "failed" ? "bg-red-500/15 text-red-400" :
                      "bg-amber-500/15 text-amber-400"
                    }`}>
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
  const [productSort, setProductSort] = useState<"favorites" | "sales" | "price" | "revenue">("favorites");

  const sorted = [...products].sort((a, b) => {
    if (productSort === "favorites") return b.favorites - a.favorites;
    if (productSort === "sales") return b.sales_estimate - a.sales_estimate;
    if (productSort === "price") return b.price - a.price;
    return (b.revenue_estimate || 0) - (a.revenue_estimate || 0);
  });

  if (products.length === 0) {
    return <EmptyState message="Run a scan to see top-performing products across all categories" />;
  }

  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-white/[0.08]">
        <h3 className="font-semibold text-white">
          Top {sorted.length} Listings
        </h3>
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
              {s === "favorites" ? "Favorites" : s === "sales" ? "Est. Sales" : s === "price" ? "Price" : "Revenue"}
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
              <tr key={listing.listing_id} className="border-t border-white/[0.06] hover:bg-white/[0.04]">
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    {listing.image_url && (
                      <img src={listing.image_url} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                    )}
                    <a
                      href={listing.url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white hover:text-indigo-600 line-clamp-2 max-w-sm"
                    >
                      {listing.title}
                    </a>
                  </div>
                </td>
                <td className="p-3 text-right font-medium text-white">${listing.price.toFixed(2)}</td>
                <td className="p-3 text-right">
                  <span className="text-pink-600 font-medium">{listing.favorites.toLocaleString()}</span>
                </td>
                <td className="p-3 text-right">
                  <span className="text-green-600 font-medium">{listing.sales_estimate}</span>
                </td>
                <td className="p-3 text-right">
                  <span className="text-indigo-600 font-medium">${(listing.revenue_estimate || 0).toFixed(2)}</span>
                </td>
                <td className="p-3 text-right text-[var(--text-muted)]">{listing.listing_age_days}d</td>
                <td className="p-3 text-[var(--text-muted)] text-xs truncate max-w-[120px]">{listing.keyword || "—"}</td>
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
  const [catSort, setCatSort] = useState<"demand" | "favorites" | "price" | "competition">("demand");

  const sorted = [...categories].filter((c) => !c.error).sort((a, b) => {
    if (catSort === "demand") return b.demandScore - a.demandScore;
    if (catSort === "favorites") return b.avgFavorites - a.avgFavorites;
    if (catSort === "price") return b.avgPrice - a.avgPrice;
    // competition: low first
    const compOrder = { low: 0, medium: 1, high: 2, "very high": 3, unknown: 4 };
    return (compOrder[a.competitionLevel as keyof typeof compOrder] || 4) -
           (compOrder[b.competitionLevel as keyof typeof compOrder] || 4);
  });

  if (categories.length === 0) {
    return <EmptyState message="Run a scan to see category analysis" />;
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
              catSort === s ? "bg-indigo-600 text-white" : "bg-white/[0.06] text-[var(--text-secondary)] hover:bg-white/[0.1]"
            }`}
          >
            {s === "demand" ? "Demand Score" : s === "favorites" ? "Avg Favorites" : s === "price" ? "Avg Price" : "Competition"}
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
                    <span className="text-[var(--text-muted)]">{cat.totalResults.toLocaleString()} results</span>
                    <span className="text-[var(--text-secondary)] font-medium">${cat.avgPrice}</span>
                    <span className="text-pink-600 font-medium">{cat.avgFavorites} favs</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${getCompetitionColor(cat.competitionLevel)}`}>
                      {cat.competitionLevel}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getDemandColor(cat.demandScore)}`}>
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
                        backgroundColor: cat.demandScore >= 70 ? "#22c55e" : cat.demandScore >= 40 ? "#f59e0b" : "#ef4444",
                      }}
                    />
                  </div>
                </div>
                {cat.topTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {cat.topTags.slice(0, 6).map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 bg-white/[0.06] text-[var(--text-muted)] rounded text-[10px]">{tag}</span>
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
        <p className="text-[var(--text-muted)] text-sm">Run at least two scans to see trending categories</p>
      </div>
    );
  }

  const rising = trends.filter((t) => t.direction === "rising");
  const declining = trends.filter((t) => t.direction === "declining");
  const stable = trends.filter((t) => t.direction === "stable");

  return (
    <div className="space-y-6">
      {rising.length > 0 && (
        <TrendSection title="Rising" items={rising} color="green" />
      )}
      {declining.length > 0 && (
        <TrendSection title="Declining" items={declining} color="red" />
      )}
      {stable.length > 0 && (
        <TrendSection title="Stable" items={stable} color="slate" />
      )}
    </div>
  );
}

function TrendSection({ title, items, color }: { title: string; items: TrendItem[]; color: string }) {
  const colorMap: Record<string, { bg: string; text: string; badge: string }> = {
    green: { bg: "bg-emerald-500/10", text: "text-emerald-400", badge: "bg-emerald-500/15 text-emerald-400" },
    red: { bg: "bg-red-500/10", text: "text-red-400", badge: "bg-red-500/15 text-red-400" },
    slate: { bg: "bg-white/[0.04]", text: "text-[var(--text-secondary)]", badge: "bg-white/[0.06] text-[var(--text-secondary)]" },
  };
  const c = colorMap[color] || colorMap.slate;

  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
      <div className={`p-4 border-b border-white/[0.08] ${c.bg}`}>
        <h3 className={`font-semibold ${c.text}`}>{title} ({items.length})</h3>
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
                  {item.changePercent > 0 ? "+" : ""}{item.changePercent}%
                </span>
                <span className="text-[var(--text-muted)] ml-1">({item.previousFavorites} → {item.currentFavorites})</span>
              </div>
              <div className="text-right">
                <span className="text-[var(--text-muted)]">Price: </span>
                <span className={item.priceChangePercent > 0 ? "text-green-600" : item.priceChangePercent < 0 ? "text-red-600" : "text-[var(--text-muted)]"}>
                  {item.priceChangePercent > 0 ? "+" : ""}{item.priceChangePercent}%
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
    return <EmptyState message="Run a scan to generate strategy recommendations" />;
  }

  return (
    <div className="space-y-6">
      {/* Opportunity gaps */}
      <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
        <div className="p-4 border-b border-white/[0.08]">
          <h3 className="font-semibold text-white">Top Opportunities</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">High demand + low competition = best opportunities</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
          {opportunities.slice(0, 15).map((opp, i) => (
            <div key={opp.category} className="border border-white/[0.08] rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[var(--text-muted)]">#{i + 1}</span>
                <span className="text-xs font-bold text-indigo-600">Score: {opp.opportunityScore}</span>
              </div>
              <p className="text-sm font-medium text-white mb-1">{opp.category}</p>
              <p className="text-[11px] text-[var(--text-muted)] mb-2">{opp.reason}</p>
              <div className="flex items-center gap-2 text-[10px]">
                <span className={`px-1.5 py-0.5 rounded font-medium ${getDemandColor(opp.demandScore)}`}>
                  Demand: {opp.demandScore}
                </span>
                <span className={`px-1.5 py-0.5 rounded font-medium capitalize ${getCompetitionColor(opp.competitionLevel)}`}>
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
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Optimal pricing based on top performers in each category</p>
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
                <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Sweet Spot</th>
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
                  <td className="p-3 text-right font-bold text-green-600">${pi.sweetSpot}</td>
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
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Most used tags across all categories</p>
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
                <span className="text-indigo-400 ml-1">({tag.frequency})</span>
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
          placeholder="Search a niche... e.g. 'minimalist wall art printable'"
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
        <p className="text-xs text-[var(--text-muted)] mb-2">Quick searches:</p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_NICHES.map((niche) => (
            <button
              key={niche}
              onClick={() => { setKeyword(niche); searchNiche(niche); }}
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
            <StatCard label="Total Results" value={searchResult.total_results.toLocaleString()} />
            <StatCard label="Avg Price" value={`$${searchResult.analysis.avg_price}`} />
            <StatCard label="Avg Favorites" value={String(searchResult.analysis.avg_favorites)} />
            <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4">
              <p className="text-xs text-[var(--text-muted)]">Competition</p>
              <p className={`text-lg font-bold capitalize px-2 py-0.5 rounded inline-block mt-1 ${getCompetitionColor(searchResult.analysis.competition_level)}`}>
                {searchResult.analysis.competition_level}
              </p>
            </div>
            <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4">
              <p className="text-xs text-[var(--text-muted)]">Demand Score</p>
              <p className={`text-2xl font-bold px-2 py-0.5 rounded inline-block mt-1 ${getDemandColor(searchResult.analysis.demand_score)}`}>
                {searchResult.analysis.demand_score}/100
              </p>
            </div>
          </div>

          {searchResult.top_tags.length > 0 && (
            <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-4">
              <h3 className="text-sm font-semibold text-white mb-2">Top Tags</h3>
              <div className="flex flex-wrap gap-2">
                {searchResult.top_tags.map((tag) => (
                  <span key={tag} className="px-2 py-1 bg-indigo-500/15 text-indigo-400 rounded text-xs">{tag}</span>
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
                      sortBy === s ? "bg-indigo-600 text-white" : "bg-white/[0.06] text-[var(--text-secondary)] hover:bg-white/[0.1]"
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
                    <th className="text-left p-3 text-[var(--text-secondary)] font-medium">Product</th>
                    <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Price</th>
                    <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Favorites</th>
                    <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Est. Sales</th>
                    <th className="text-right p-3 text-[var(--text-secondary)] font-medium">Age</th>
                    <th className="text-left p-3 text-[var(--text-secondary)] font-medium">Shop</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedListings.map((listing) => (
                    <tr key={listing.listing_id} className="border-t border-white/[0.06] hover:bg-white/[0.04]">
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          {listing.image_url && (
                            <img src={listing.image_url} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                          )}
                          <a href={listing.url || "#"} target="_blank" rel="noopener noreferrer" className="text-white hover:text-indigo-600 line-clamp-2 max-w-md">
                            {listing.title}
                          </a>
                        </div>
                      </td>
                      <td className="p-3 text-right font-medium text-white">${listing.price.toFixed(2)}</td>
                      <td className="p-3 text-right"><span className="text-pink-600 font-medium">{listing.favorites.toLocaleString()}</span></td>
                      <td className="p-3 text-right"><span className="text-green-600 font-medium">{listing.sales_estimate}</span></td>
                      <td className="p-3 text-right text-[var(--text-muted)]">{listing.listing_age_days}d</td>
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

// ============ SHARED ============

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-12 text-center">
      <p className="text-[var(--text-muted)]">{message}</p>
    </div>
  );
}
