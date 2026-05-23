"use client";

// ══════════════════════════════════════════════════════════════
// ProductsTab — Etsy product research grid
//
// Hits /api/research/product-analytics which fans out to the
// official Etsy v3 API. Every field is either:
//   • REAL: title, shop, price, favorites, views, age, tags
//   • Est.: derived from favorites via the industry heuristic
//
// All estimated columns carry an explicit "Est." pill so the seller
// never confuses heuristic data for the real thing. No scraping,
// one API call per search — TOS-safe by design.
// ══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// ──────────────────────────────────────────────────────────────────────
// Bridge contract v2 — must match IdeasTab + FactoryDashboard.
// /factory's competitor-deep-scan engine reads competitor.imageUrls
// with Gemini Vision to extract feature manifests.
// Key: sessionStorage["factory_prefill_from_research"].
// ──────────────────────────────────────────────────────────────────────
const FACTORY_PREFILL_KEY = "factory_prefill_from_research";

interface FactoryBuildPayload {
  source: "research/products" | "research/ideas" | "research/scan";
  competitor: {
    listingId: string;
    title: string;
    description: string;
    tags: string[];
    price: number;
    imageUrls: string[];
    listingUrl?: string;
    seller?: string;
    reviewCount?: number;
    rating?: number;
    salesEstimate?: number;
  };
  niche: string;
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

interface ProductListing {
  listing_id: string;
  title: string;
  shop_name: string;
  price: number;
  image_url: string;
  url: string;
  tags: string[];
  favorites: number;
  views: number;
  listing_age_days: number;
  listing_age_months: number;
  category: string;
  est_total_sales: number;
  est_total_revenue: number;
  est_monthly_sales: number;
  est_monthly_revenue: number;
  est_conversion_rate: number;
  estimated_fields: string[];
}

interface ProductAnalyticsResponse {
  keyword: string;
  total_listings: number;
  listings: ProductListing[];
  analysis: {
    avg_price: number;
    avg_favorites: number;
    competition_level: string;
    demand_score: number;
  };
  tag_frequency: { tag: string; count: number }[];
  meta: { estimated_fields_note: string };
}

type SortKey =
  | "favorites" | "views" | "price" | "listing_age_days"
  | "est_total_sales" | "est_total_revenue"
  | "est_monthly_sales" | "est_monthly_revenue"
  | "est_conversion_rate";

type SortDir = "asc" | "desc";

// Column definitions — `real: true` means the field is genuine Etsy
// v3 data; otherwise it's a heuristic estimate and gets the "Est." pill.
const COLUMNS: Array<{
  key: keyof ProductListing | "title" | "shop_name";
  label: string;
  sortKey?: SortKey;
  real: boolean;
  width?: string;
  default: boolean;
}> = [
  { key: "title", label: "Product", real: true, default: true },
  { key: "shop_name", label: "Shop", real: true, default: true },
  { key: "price", label: "Price", sortKey: "price", real: true, default: true },
  { key: "est_monthly_sales", label: "Mo. Sales", sortKey: "est_monthly_sales", real: false, default: true },
  { key: "est_monthly_revenue", label: "Mo. Revenue", sortKey: "est_monthly_revenue", real: false, default: true },
  { key: "est_total_sales", label: "Total Sales", sortKey: "est_total_sales", real: false, default: true },
  { key: "est_total_revenue", label: "Total Revenue", sortKey: "est_total_revenue", real: false, default: true },
  { key: "favorites", label: "Favorites", sortKey: "favorites", real: true, default: true },
  { key: "views", label: "Views", sortKey: "views", real: true, default: false },
  { key: "est_conversion_rate", label: "Conv. Rate", sortKey: "est_conversion_rate", real: false, default: false },
  { key: "listing_age_months", label: "Age", sortKey: "listing_age_days", real: true, default: true },
  { key: "tags", label: "Tags", real: true, default: false },
];

function fmtCurrency(n: number): string {
  if (!isFinite(n) || n <= 0) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  if (n >= 100) return `$${Math.round(n).toLocaleString()}`;
  return `$${n.toFixed(2)}`;
}

function fmtCount(n: number): string {
  if (!isFinite(n) || n <= 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString();
}

function fmtAge(months: number): string {
  if (!months || months < 1) return "—";
  if (months >= 12) return `${(months / 12).toFixed(1)}y`;
  return `${months}mo`;
}

function competitionColor(level: string): string {
  switch (level) {
    case "low": return "text-emerald-300 bg-emerald-500/15 border-emerald-500/30";
    case "medium": return "text-amber-300 bg-amber-500/15 border-amber-500/30";
    case "high": return "text-orange-300 bg-orange-500/15 border-orange-500/30";
    case "very high": return "text-red-300 bg-red-500/15 border-red-500/30";
    default: return "text-[var(--text-muted)] bg-white/5 border-[var(--border-default)]";
  }
}

export default function ProductsTab() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [data, setData] = useState<ProductAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProductListing | null>(null);
  const [buildingId, setBuildingId] = useState<string | null>(null);

  // ── "Build This" handler ───────────────────────────────────────────
  // Resolves the full Etsy listing detail server-side (adds description
  // + up to 8 full-res image URLs that the search response doesn't
  // include), then packages the v2 payload and navigates to /factory.
  // The factory's competitor-deep-scan engine reads competitor.imageUrls
  // with Gemini Vision to extract a feature manifest, then clones-and-
  // beats the competitor.
  async function handleBuildFromProduct(listing: ProductListing) {
    setBuildingId(listing.listing_id);
    try {
      const resp = await fetch("/api/research/resolve-competitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: listing.listing_id }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      const { competitor } = (await resp.json()) as {
        competitor: FactoryBuildPayload["competitor"];
      };

      const payload: FactoryBuildPayload = {
        source: "research/products",
        competitor: {
          ...competitor,
          // Salt with what we already have from the analytics call — the
          // resolve endpoint won't have salesEstimate (no Etsy API path
          // exposes it), but we computed it heuristically from favorites.
          salesEstimate: listing.est_monthly_sales,
        },
        niche: data?.keyword || keyword || competitor.title,
        marketContext: {
          competition: data?.total_listings ?? null,
          avgFavorites: data?.analysis.avg_favorites ?? null,
          topTags: data?.tag_frequency.slice(0, 13).map((t) => t.tag),
        },
        // No ideaContext — this is a direct listing build, not idea-driven.
      };

      try {
        sessionStorage.setItem(FACTORY_PREFILL_KEY, JSON.stringify(payload));
      } catch {
        (window as unknown as { __factoryPrefill?: unknown }).__factoryPrefill = payload;
      }
      router.push("/factory");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "resolve failed";
      alert(
        `Couldn't resolve this listing for Factory: ${msg}\n\n` +
          `Factory needs the full description + images to clone-and-beat. ` +
          `Try refreshing or selecting a different listing.`,
      );
    } finally {
      setBuildingId(null);
    }
  }

  // Client-side filter state — applied locally over the API result set.
  // (We fetch up to 40 from Etsy, then filter in-browser; cheap, instant.)
  const [filterMaxPrice, setFilterMaxPrice] = useState<number | null>(null);
  const [filterMinFavorites, setFilterMinFavorites] = useState<number | null>(null);
  const [filterMaxAgeMonths, setFilterMaxAgeMonths] = useState<number | null>(null);
  const [filterPreset, setFilterPreset] = useState<"all" | "new-listings" | "high-favorites" | "low-price" | "established">("all");

  const [sortKey, setSortKey] = useState<SortKey>("favorites");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Column visibility — persisted to localStorage so the user's choice
  // survives a page reload.
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set(COLUMNS.filter((c) => c.default).map((c) => c.key as string));
    try {
      const saved = localStorage.getItem("cp_research_visible_cols");
      if (saved) return new Set(JSON.parse(saved));
    } catch { /* ignore */ }
    return new Set(COLUMNS.filter((c) => c.default).map((c) => c.key as string));
  });
  useEffect(() => {
    try { localStorage.setItem("cp_research_visible_cols", JSON.stringify([...visibleCols])); } catch { /* ignore */ }
  }, [visibleCols]);
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  // Favorites — local SQLite-backed, but for first pass we use
  // localStorage so the user gets immediate value. Move to /api/research/favorites later.
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = localStorage.getItem("cp_research_favorites");
      if (saved) return new Set(JSON.parse(saved));
    } catch { /* ignore */ }
    return new Set();
  });
  function toggleFavorite(listingId: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(listingId)) next.delete(listingId);
      else next.add(listingId);
      try { localStorage.setItem("cp_research_favorites", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }

  // The actual API call — fires when the user submits a keyword.
  const abortRef = useRef<AbortController | null>(null);
  async function runSearch(kw?: string) {
    const q = (kw ?? keyword).trim();
    if (q.length < 2) {
      setError("Type at least 2 characters");
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      const r = await fetch("/api/research/product-analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: q, limit: 40 }),
        signal: abortRef.current.signal,
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error || `HTTP ${r.status}`);
        setData(null);
        return;
      }
      setData(j);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  // Apply preset to numeric filters
  useEffect(() => {
    switch (filterPreset) {
      case "new-listings":
        setFilterMaxAgeMonths(6);
        setFilterMaxPrice(null);
        setFilterMinFavorites(null);
        break;
      case "high-favorites":
        setFilterMinFavorites(500);
        setFilterMaxAgeMonths(null);
        setFilterMaxPrice(null);
        break;
      case "low-price":
        setFilterMaxPrice(15);
        setFilterMaxAgeMonths(null);
        setFilterMinFavorites(null);
        break;
      case "established":
        setFilterMaxAgeMonths(null);
        setFilterMinFavorites(100);
        setFilterMaxPrice(null);
        break;
      case "all":
      default:
        setFilterMaxPrice(null);
        setFilterMinFavorites(null);
        setFilterMaxAgeMonths(null);
        break;
    }
  }, [filterPreset]);

  // Apply filters + sort over the listings
  const rows = useMemo(() => {
    if (!data) return [];
    let out = data.listings.slice();
    if (filterMaxPrice != null) out = out.filter((l) => l.price <= filterMaxPrice);
    if (filterMinFavorites != null) out = out.filter((l) => l.favorites >= filterMinFavorites);
    if (filterMaxAgeMonths != null) out = out.filter((l) => l.listing_age_months <= filterMaxAgeMonths);
    out.sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return out;
  }, [data, sortKey, sortDir, filterMaxPrice, filterMinFavorites, filterMaxAgeMonths]);

  function exportCsv() {
    if (!data || rows.length === 0) return;
    const cols: Array<{ key: string; label: string }> = COLUMNS
      .filter((c) => visibleCols.has(c.key as string))
      .map((c) => ({ key: c.key as string, label: c.label }));
    const header = cols.map((c) => `"${c.label}"`).join(",");
    const lines = rows.map((r) => cols.map((c) => {
      const v = (r as unknown as Record<string, unknown>)[c.key];
      if (Array.isArray(v)) return `"${(v as string[]).join(" | ").replace(/"/g, '""')}"`;
      if (typeof v === "string") return `"${v.replace(/"/g, '""')}"`;
      return String(v ?? "");
    }).join(","));
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `research-${data.keyword.replace(/[^a-z0-9]/gi, "_")}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* ── Search bar ── */}
      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2 flex items-center gap-2">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          Search Etsy
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
            placeholder="Search any keyword (digital download, planner, sticker, mug, cross stitch…)"
            className="flex-1 h-11 px-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-default)] text-[var(--text-primary)] text-[13px] focus:outline-none focus:border-amber-500/40"
          />
          <button
            onClick={() => runSearch()}
            disabled={loading}
            className="px-5 py-2 rounded-xl text-[13px] font-semibold bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50 transition-all flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Searching…
              </>
            ) : "Search"}
          </button>
        </div>
        {/* Quick suggestion chips */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {["digital download", "wedding invitation", "wall art printable", "notion template", "planner pdf", "cross stitch pattern", "sticker", "mug design"].map((s) => (
            <button
              key={s}
              onClick={() => { setKeyword(s); runSearch(s); }}
              className="px-3 py-1 rounded-full text-[11px] bg-white/5 border border-[var(--border-default)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-amber-500/30 transition-all"
            >
              {s}
            </button>
          ))}
        </div>
        {error && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[12px] text-red-300">
            {error}
          </div>
        )}
      </div>

      {/* ── Data honesty banner ── */}
      {data && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-[11px] text-amber-200 flex items-start gap-2">
          <span className="text-[14px] leading-none mt-0.5">ⓘ</span>
          <div>
            <span className="font-semibold">Mo. Sales / Mo. Revenue / Total Sales / Total Revenue / Conv. Rate are estimates.</span>
            <span className="text-amber-200/80"> Derived from real public favorites via the industry-standard heuristic. Etsy&apos;s official API does not expose competitor sales — real per-listing sales data isn&apos;t available through any TOS-safe path.</span>
          </div>
        </div>
      )}

      {/* ── Niche summary tiles ── */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryTile label="Total Listings" value={data.total_listings.toLocaleString()} hint="on Etsy for this keyword" />
          <SummaryTile label="Avg. Price" value={`$${data.analysis.avg_price.toFixed(2)}`} hint="real (Etsy v3)" />
          <SummaryTile label="Avg. Favorites" value={data.analysis.avg_favorites.toLocaleString()} hint="real (Etsy v3)" />
          <SummaryTile
            label="Competition"
            value={data.analysis.competition_level}
            hint={`${data.total_listings.toLocaleString()} sellers`}
            valueClass={competitionColor(data.analysis.competition_level).split(" ")[0]}
          />
          <SummaryTile
            label="Demand Score"
            value={`${data.analysis.demand_score}/100`}
            hint={data.analysis.demand_score >= 70 ? "High opportunity" : data.analysis.demand_score >= 40 ? "Moderate" : "Saturated"}
            valueClass={data.analysis.demand_score >= 70 ? "text-emerald-300" : data.analysis.demand_score >= 40 ? "text-amber-300" : "text-red-300"}
          />
        </div>
      )}

      {/* ── Filter pills + toolbar ── */}
      {data && (
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: "all", label: "All" },
            { key: "new-listings", label: "🆕 New listings (<6 mo)" },
            { key: "high-favorites", label: "❤️ High favorites (500+)" },
            { key: "low-price", label: "💰 Low price ($15 or less)" },
            { key: "established", label: "🏆 Established (100+ favs)" },
          ].map((p) => (
            <button
              key={p.key}
              onClick={() => setFilterPreset(p.key as typeof filterPreset)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all ${
                filterPreset === p.key
                  ? "bg-amber-500/20 border-amber-500/40 text-amber-200"
                  : "bg-white/5 border-[var(--border-default)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-amber-500/30"
              }`}
            >
              {p.label}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setShowColumnPicker((v) => !v)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-white hover:border-amber-500/40 transition-all flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
              Columns
            </button>
            <button
              onClick={exportCsv}
              disabled={rows.length === 0}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-white hover:border-amber-500/40 disabled:opacity-40 transition-all flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
              Export CSV
            </button>
          </div>
        </div>
      )}

      {/* Column picker dropdown */}
      {showColumnPicker && (
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Visible columns</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {COLUMNS.map((c) => (
              <label key={c.key as string} className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)] cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={visibleCols.has(c.key as string)}
                  onChange={(e) => {
                    setVisibleCols((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(c.key as string); else next.delete(c.key as string);
                      return next;
                    });
                  }}
                  className="accent-amber-500"
                />
                <span>{c.label}</span>
                {!c.real && <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-300">Est.</span>}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ── Results count ── */}
      {data && (
        <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-3">
          <span>Showing <strong className="text-[var(--text-primary)]">{rows.length}</strong> of {data.listings.length} pulled · {data.total_listings.toLocaleString()} total listings on Etsy</span>
          {favorites.size > 0 && <span>· <strong className="text-amber-300">{favorites.size}</strong> favorited</span>}
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && !data && (
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] overflow-hidden">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-[64px] border-b border-[var(--border-default)] last:border-0 px-4 flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-white/5 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-white/5 rounded animate-pulse w-2/3" />
                <div className="h-2 bg-white/5 rounded animate-pulse w-1/3" />
              </div>
              <div className="w-20 h-3 bg-white/5 rounded animate-pulse" />
              <div className="w-20 h-3 bg-white/5 rounded animate-pulse" />
              <div className="w-20 h-3 bg-white/5 rounded animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* ── Results grid ── */}
      {data && rows.length > 0 && (
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] overflow-hidden">
          {/* Header row */}
          <div
            className="grid items-center gap-3 px-3 py-2 border-b border-[var(--border-default)] bg-white/[0.02] text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold"
            style={{ gridTemplateColumns: gridTemplateForCols([...visibleCols]) }}
          >
            <div className="w-6">#</div>
            {COLUMNS.filter((c) => visibleCols.has(c.key as string)).map((c) => (
              <button
                key={c.key as string}
                onClick={() => {
                  if (!c.sortKey) return;
                  if (sortKey === c.sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
                  else { setSortKey(c.sortKey); setSortDir("desc"); }
                }}
                className={`text-left flex items-center gap-1 ${c.sortKey ? "hover:text-amber-300 cursor-pointer" : ""}`}
              >
                <span>{c.label}</span>
                {!c.real && <span className="text-[8px] px-1 py-0 rounded bg-amber-500/15 text-amber-300 normal-case tracking-normal">Est.</span>}
                {c.sortKey === sortKey && <span>{sortDir === "desc" ? "↓" : "↑"}</span>}
              </button>
            ))}
            <div className="w-7"></div>
          </div>
          {/* Rows */}
          {rows.map((r, i) => (
            <div
              key={r.listing_id}
              onClick={() => setSelected(r)}
              className="grid items-center gap-3 px-3 py-2.5 border-b border-[var(--border-default)] last:border-0 hover:bg-white/[0.04] cursor-pointer transition-colors group"
              style={{ gridTemplateColumns: gridTemplateForCols([...visibleCols]) }}
            >
              <div className="w-6 text-[11px] text-[var(--text-muted)] tabular-nums">{i + 1}</div>
              {COLUMNS.filter((c) => visibleCols.has(c.key as string)).map((c) => renderCell(r, c))}
              <button
                onClick={(e) => { e.stopPropagation(); toggleFavorite(r.listing_id); }}
                className={`w-7 h-7 rounded-md flex items-center justify-center text-[14px] transition-all ${
                  favorites.has(r.listing_id)
                    ? "bg-amber-500/20 text-amber-300"
                    : "text-[var(--text-muted)]/40 group-hover:text-amber-400/70 hover:bg-white/5"
                }`}
                title={favorites.has(r.listing_id) ? "Remove from favorites" : "Save to favorites"}
              >
                {favorites.has(r.listing_id) ? "★" : "☆"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {data && rows.length === 0 && (
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-12 text-center">
          <div className="text-[14px] text-[var(--text-primary)] font-semibold mb-1">No matches for current filters</div>
          <div className="text-[11px] text-[var(--text-muted)]">Try the &ldquo;All&rdquo; preset or widen your filters.</div>
        </div>
      )}

      {/* ── Initial empty state ── */}
      {!data && !loading && !error && (
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-12 text-center">
          <div className="text-[36px] mb-3">🔍</div>
          <div className="text-[14px] text-[var(--text-primary)] font-semibold mb-2">Search any Etsy keyword</div>
          <div className="text-[11px] text-[var(--text-muted)] max-w-md mx-auto">
            Pulls the top 40 listings via the official Etsy v3 API. Real public data plus clearly-labeled estimates — no scraping, no risk to your seller account.
          </div>
        </div>
      )}

      {/* ── Detail drawer ── */}
      {selected && (
        <DetailDrawer
          listing={selected}
          favorited={favorites.has(selected.listing_id)}
          building={buildingId === selected.listing_id}
          onBuild={() => handleBuildFromProduct(selected)}
          onToggleFavorite={() => toggleFavorite(selected.listing_id)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ── Helpers ──

function gridTemplateForCols(visible: string[]): string {
  // 6px rank col + N data cols + 28px fav col
  const cols: string[] = ["24px"];
  for (const k of COLUMNS) {
    if (!visible.includes(k.key as string)) continue;
    if (k.key === "title") cols.push("minmax(180px, 1fr)");
    else if (k.key === "shop_name") cols.push("minmax(100px, 0.6fr)");
    else if (k.key === "tags") cols.push("minmax(140px, 0.8fr)");
    else cols.push("minmax(80px, 0.5fr)");
  }
  cols.push("28px");
  return cols.join(" ");
}

function renderCell(r: ProductListing, c: typeof COLUMNS[number]): React.ReactNode {
  const key = c.key as string;
  if (key === "title") {
    return (
      <div key={key} className="flex items-center gap-2 min-w-0">
        {r.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.image_url} alt="" className="w-9 h-9 rounded-md object-cover flex-shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-md bg-white/5 flex-shrink-0" />
        )}
        <span className="text-[12px] text-[var(--text-primary)] line-clamp-1" title={r.title}>{r.title}</span>
      </div>
    );
  }
  if (key === "shop_name") {
    return (
      <a
        key={key}
        href={r.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-[11px] text-[var(--text-secondary)] hover:text-amber-300 truncate"
        title={r.shop_name}
      >
        {r.shop_name || "—"}
      </a>
    );
  }
  if (key === "price") {
    return <div key={key} className="text-[12px] font-semibold text-emerald-400 tabular-nums">{fmtCurrency(r.price)}</div>;
  }
  if (key === "favorites") {
    return <div key={key} className="text-[12px] text-[var(--text-primary)] tabular-nums">{fmtCount(r.favorites)}</div>;
  }
  if (key === "views") {
    return <div key={key} className="text-[12px] text-[var(--text-primary)] tabular-nums">{fmtCount(r.views)}</div>;
  }
  if (key === "listing_age_months") {
    return <div key={key} className="text-[11px] text-[var(--text-muted)] tabular-nums">{fmtAge(r.listing_age_months)}</div>;
  }
  if (key === "est_total_sales") {
    return <div key={key} className="text-[12px] text-amber-200 tabular-nums">{fmtCount(r.est_total_sales)}</div>;
  }
  if (key === "est_total_revenue") {
    return <div key={key} className="text-[12px] text-amber-200 tabular-nums">{fmtCurrency(r.est_total_revenue)}</div>;
  }
  if (key === "est_monthly_sales") {
    return <div key={key} className="text-[12px] text-amber-200 tabular-nums">{fmtCount(r.est_monthly_sales)}</div>;
  }
  if (key === "est_monthly_revenue") {
    return <div key={key} className="text-[12px] text-amber-200 tabular-nums">{fmtCurrency(r.est_monthly_revenue)}</div>;
  }
  if (key === "est_conversion_rate") {
    return <div key={key} className="text-[11px] text-[var(--text-secondary)] tabular-nums">{r.est_conversion_rate > 0 ? `${r.est_conversion_rate.toFixed(1)}%` : "—"}</div>;
  }
  if (key === "tags") {
    return (
      <div key={key} className="flex flex-wrap gap-1 overflow-hidden">
        {r.tags.slice(0, 3).map((t, i) => (
          <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-[var(--text-muted)] truncate max-w-[80px]">{t}</span>
        ))}
        {r.tags.length > 3 && <span className="text-[9px] text-[var(--text-muted)]/50">+{r.tags.length - 3}</span>}
      </div>
    );
  }
  return <div key={key} />;
}

function SummaryTile({ label, value, hint, valueClass = "text-[var(--text-primary)]" }: { label: string; value: string; hint?: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-3">
      <div className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] font-semibold mb-0.5">{label}</div>
      <div className={`text-[16px] font-bold leading-tight ${valueClass}`}>{value}</div>
      {hint && <div className="text-[9px] text-[var(--text-muted)] mt-0.5">{hint}</div>}
    </div>
  );
}

function DetailDrawer({
  listing,
  favorited,
  building,
  onBuild,
  onToggleFavorite,
  onClose,
}: {
  listing: ProductListing;
  favorited: boolean;
  building: boolean;
  onBuild: () => void;
  onToggleFavorite: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-[480px] bg-[var(--bg-base)] border-l border-[var(--border-default)] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-[var(--bg-base)] border-b border-[var(--border-default)] p-4 flex items-center justify-between gap-3">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Listing Details</div>
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleFavorite}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1.5 ${
                favorited
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "bg-white/5 text-[var(--text-muted)] border border-[var(--border-default)] hover:text-amber-300 hover:border-amber-500/40"
              }`}
            >
              {favorited ? "★ Saved" : "☆ Save"}
            </button>
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-white text-xl leading-none px-2">×</button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {listing.image_url && (
            <a href={listing.url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={listing.image_url} alt={listing.title} className="w-full rounded-xl border border-[var(--border-default)]" />
            </a>
          )}

          <div>
            <a href={listing.url} target="_blank" rel="noopener noreferrer" className="text-[14px] font-semibold text-[var(--text-primary)] hover:text-amber-300 leading-snug block mb-1">
              {listing.title}
            </a>
            <div className="text-[11px] text-[var(--text-muted)]">by {listing.shop_name}</div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <DrawerStat label="Price" value={fmtCurrency(listing.price)} real />
            <DrawerStat label="Listing Age" value={fmtAge(listing.listing_age_months)} real />
            <DrawerStat label="Favorites" value={fmtCount(listing.favorites)} real />
            <DrawerStat label="Views" value={fmtCount(listing.views)} real />
            <DrawerStat label="Mo. Sales" value={fmtCount(listing.est_monthly_sales)} />
            <DrawerStat label="Mo. Revenue" value={fmtCurrency(listing.est_monthly_revenue)} />
            <DrawerStat label="Total Sales" value={fmtCount(listing.est_total_sales)} />
            <DrawerStat label="Total Revenue" value={fmtCurrency(listing.est_total_revenue)} />
            <DrawerStat label="Conv. Rate" value={listing.est_conversion_rate > 0 ? `${listing.est_conversion_rate.toFixed(1)}%` : "—"} />
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-200/80 leading-relaxed">
            <strong>Heads-up:</strong> Numbers without the green &ldquo;Real&rdquo; pill are heuristic estimates derived from real public favorites. Etsy doesn&apos;t expose competitor sales through any sanctioned API.
          </div>

          {listing.tags.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-2">Tags ({listing.tags.length})</div>
              <div className="flex flex-wrap gap-1.5">
                {listing.tags.map((t, i) => (
                  <span key={i} className="text-[10px] px-2 py-1 rounded bg-white/5 border border-[var(--border-default)] text-[var(--text-secondary)]">{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* ── Primary action: clone-and-beat this listing in Factory ──
              Resolves full Etsy listing detail (description + up to 8
              full-res images) then hands off to the factory pipeline.
              Loading state shown while the resolve API call runs. */}
          <button
            onClick={onBuild}
            disabled={building}
            className={`block w-full text-center px-4 py-2.5 rounded-xl text-[12px] font-semibold transition-all ${
              building
                ? "bg-emerald-700/40 text-emerald-200 cursor-default"
                : "bg-emerald-600 text-white hover:bg-emerald-500"
            }`}
            title="Resolves this listing's full description + photos, then hands off to Product Factory's clone-and-beat engine."
          >
            {building ? "🔍 Resolving listing detail…" : "🏭 Build This in Product Factory →"}
          </button>

          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center px-4 py-2.5 rounded-xl text-[12px] font-semibold bg-amber-600/20 text-amber-200 border border-amber-500/40 hover:bg-amber-600/30 transition-all"
          >
            Open on Etsy ↗
          </a>
        </div>
      </div>
    </div>
  );
}

function DrawerStat({ label, value, real = false }: { label: string; value: string; real?: boolean }) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-[var(--border-default)] p-3">
      <div className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] font-semibold mb-1 flex items-center gap-1">
        <span>{label}</span>
        {real
          ? <span className="text-[8px] px-1 py-0 rounded bg-emerald-500/15 text-emerald-300 normal-case tracking-normal">Real</span>
          : <span className="text-[8px] px-1 py-0 rounded bg-amber-500/15 text-amber-300 normal-case tracking-normal">Est.</span>}
      </div>
      <div className="text-[14px] font-bold text-[var(--text-primary)] tabular-nums">{value}</div>
    </div>
  );
}
