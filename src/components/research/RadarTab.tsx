"use client";

import { useEffect, useState, useMemo } from "react";

interface RadarCapture {
  id?: number;
  listing_id: string;
  title: string;
  shop_name: string | null;
  url: string | null;
  image_url: string | null;
  price: number | null;
  currency: string | null;
  reviews: number;
  rating: number;
  product_type: string | null;
  is_bestseller: number;
  is_etsy_pick: number;
  is_digital: number;
  atc_badge: string | null;
  atc_count: number | null;
  atc_tier: "hot" | "warm" | "cold" | null;
  search_query: string | null;
  page_url: string | null;
  scanned_at: string;
}

interface RadarData {
  success: boolean;
  recent: RadarCapture[];
  hot: RadarCapture[];
  total: number;
  uniqueListings: number;
  uniqueShops: number;
}

const RANGES = [
  { hours: 24, label: "24h" },
  { hours: 168, label: "7d" },
  { hours: 720, label: "30d" },
];

function fmtAgo(iso: string): string {
  const t = Date.parse(iso);
  if (isNaN(t)) return "—";
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function tierStyle(tier: RadarCapture["atc_tier"]) {
  if (tier === "hot") return { bg: "bg-red-500/15", border: "border-red-500/30", text: "text-red-300", label: "🔥 HOT" };
  if (tier === "warm") return { bg: "bg-amber-500/15", border: "border-amber-500/30", text: "text-amber-300", label: "⚡ WARM" };
  return { bg: "bg-slate-500/10", border: "border-slate-500/20", text: "text-slate-400", label: "COLD" };
}

export default function RadarTab() {
  const [hours, setHours] = useState(168);
  const [data, setData] = useState<RadarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [digitalOnly, setDigitalOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<"hot" | "recent" | "shops">("hot");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/research/extension-feed?hours=${hours}&limit=80${digitalOnly ? "&digital=1" : ""}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = j.error || `Server returned HTTP ${r.status}`;
        // Detect the most common dev-env failure: better-sqlite3 native binding
        if (typeof msg === "string" && msg.includes("better-sqlite3")) {
          setError("Database binding mismatch — run `npm rebuild better-sqlite3` in the project, then refresh this page.");
        } else {
          setError(typeof msg === "string" ? msg : "Failed to load Radar data");
        }
        return;
      }
      setData(j);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error reaching the Radar feed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [hours, digitalOnly]);

  // Auto-refresh every 15s when on
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => load(), 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, hours, digitalOnly]);

  // ── Top shops aggregate ──
  const topShops = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { shop: string; captures: number; hotCount: number; lastSeen: string }>();
    for (const c of data.recent) {
      if (!c.shop_name) continue;
      const e = map.get(c.shop_name);
      if (e) {
        e.captures += 1;
        if (c.atc_tier === "hot") e.hotCount += 1;
        if (c.scanned_at > e.lastSeen) e.lastSeen = c.scanned_at;
      } else {
        map.set(c.shop_name, {
          shop: c.shop_name,
          captures: 1,
          hotCount: c.atc_tier === "hot" ? 1 : 0,
          lastSeen: c.scanned_at,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.hotCount - a.hotCount || b.captures - a.captures).slice(0, 24);
  }, [data]);

  return (
    <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-widest uppercase text-orange-400/80 mb-1">
              ETSY RADAR
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-white leading-none">
              Live competitor signals · <span className="text-orange-400 italic">while you browse</span>
            </h1>
            <p className="text-sm text-white/40 mt-2">
              Every Etsy listing you see in your browser flows here. ATC velocity, hot listings, shop concentration — all captured automatically by the CraftPlan extension.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-white/50 bg-white/[0.03] border border-white/[0.08] rounded-lg cursor-pointer hover:bg-white/[0.05]">
              <input
                type="checkbox"
                checked={digitalOnly}
                onChange={(e) => setDigitalOnly(e.target.checked)}
                className="w-3 h-3"
              />
              Digital only
            </label>
            <label className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-white/50 bg-white/[0.03] border border-white/[0.08] rounded-lg cursor-pointer hover:bg-white/[0.05]">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-3 h-3"
              />
              Auto-refresh
            </label>
            <div className="flex items-center gap-1 p-1 bg-white/[0.03] border border-white/[0.08] rounded-lg">
              {RANGES.map((r) => (
                <button
                  key={r.hours}
                  onClick={() => setHours(r.hours)}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${
                    hours === r.hours
                      ? "bg-orange-500/15 text-orange-300"
                      : "text-white/40 hover:text-white/70"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── API error banner ── */}
        {error && (
          <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/[0.06] flex items-start gap-3">
            <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-300 mb-1">Couldn't load Radar data</p>
              <p className="text-xs text-white/60 leading-relaxed">{error}</p>
            </div>
            <button
              onClick={load}
              className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold text-red-300 bg-red-500/15 hover:bg-red-500/25 rounded-md"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Loading skeleton (first load only) ── */}
        {loading && !data && !error && (
          <div className="grid grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-white/[0.03] rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {/* ── Empty state when no captures ── */}
        {data && data.total === 0 && !loading && (
          <div className="p-8 rounded-xl border border-orange-500/20 bg-orange-500/[0.03] text-center">
            <p className="text-base font-semibold text-orange-300 mb-2">No captures yet — start browsing Etsy</p>
            <p className="text-sm text-white/50 max-w-lg mx-auto">
              Install the CraftPlan Etsy Radar extension and visit any Etsy search/category page.
              Listings auto-stream here, with HOT/WARM badges painted on each card while you browse.
            </p>
            <p className="text-[11px] text-white/30 mt-3">
              Extension manifest at <code className="text-white/50">public/extension/manifest.json</code> — load unpacked in <code className="text-white/50">chrome://extensions</code>
            </p>
          </div>
        )}

        {/* ── KPI cards ── */}
        {data && data.total > 0 && (
          <div className="grid grid-cols-4 gap-3">
            <div className="p-4 bg-white/[0.02] border border-white/[0.08] rounded-xl">
              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1">Captures</p>
              <p className="text-2xl font-bold text-white tabular-nums">{data.total}</p>
              <p className="text-[10px] text-white/30 mt-1">in last {hours <= 24 ? `${hours}h` : `${Math.round(hours / 24)}d`}</p>
            </div>
            <div className="p-4 bg-white/[0.02] border border-white/[0.08] rounded-xl">
              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1">Unique Listings</p>
              <p className="text-2xl font-bold text-white tabular-nums">{data.uniqueListings}</p>
              <p className="text-[10px] text-white/30 mt-1">distinct products</p>
            </div>
            <div className="p-4 bg-white/[0.02] border border-white/[0.08] rounded-xl">
              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1">Shops</p>
              <p className="text-2xl font-bold text-white tabular-nums">{data.uniqueShops}</p>
              <p className="text-[10px] text-white/30 mt-1">competitor sellers</p>
            </div>
            <div className="p-4 bg-red-500/[0.04] border border-red-500/20 rounded-xl">
              <p className="text-[10px] font-semibold text-red-300/70 uppercase tracking-wider mb-1">🔥 Hot Listings</p>
              <p className="text-2xl font-bold text-red-300 tabular-nums">
                {data.hot.filter((h) => h.atc_tier === "hot").length}
              </p>
              <p className="text-[10px] text-red-300/40 mt-1">20+ ATC signals</p>
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        {data && data.total > 0 && (
          <>
            <div className="flex items-center gap-1 border-b border-white/[0.06]">
              {([
                { key: "hot" as const, label: `Hot (${data.hot.length})` },
                { key: "recent" as const, label: `Recent (${data.recent.length})` },
                { key: "shops" as const, label: `Top Shops (${topShops.length})` },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2.5 text-xs font-medium transition-all border-b-2 -mb-px ${
                    activeTab === tab.key
                      ? "text-white border-orange-400"
                      : "text-white/40 border-transparent hover:text-white/60"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── HOT tab ── */}
            {activeTab === "hot" && (
              data.hot.length === 0 ? (
                <div className="p-6 text-center text-white/30 text-sm bg-white/[0.02] border border-white/[0.06] rounded-xl">
                  No HOT or WARM listings captured yet. Browse Etsy search pages with strong demand to see them appear here.
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {data.hot.map((c) => <RadarCard key={c.id ?? c.listing_id + c.scanned_at} c={c} />)}
                </div>
              )
            )}

            {/* ── RECENT tab ── */}
            {activeTab === "recent" && (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {data.recent.map((c) => <RadarCard key={c.id ?? c.listing_id + c.scanned_at} c={c} />)}
              </div>
            )}

            {/* ── TOP SHOPS tab ── */}
            {activeTab === "shops" && (
              <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-white/[0.04] border-b border-white/[0.06]">
                    <tr className="text-[10px] uppercase tracking-wider text-white/40">
                      <th className="text-left px-4 py-3">Shop</th>
                      <th className="text-right px-2 py-3">Listings seen</th>
                      <th className="text-right px-2 py-3">Hot products</th>
                      <th className="text-right px-4 py-3">Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topShops.map((s) => (
                      <tr key={s.shop} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                        <td className="px-4 py-3">
                          <a
                            href={`https://www.etsy.com/shop/${encodeURIComponent(s.shop)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-white/80 hover:text-orange-300"
                          >
                            {s.shop} ↗
                          </a>
                        </td>
                        <td className="text-right px-2 py-3 text-white/70 tabular-nums">{s.captures}</td>
                        <td className="text-right px-2 py-3 tabular-nums">
                          {s.hotCount > 0 ? (
                            <span className="text-red-300 font-semibold">🔥 {s.hotCount}</span>
                          ) : (
                            <span className="text-white/30">—</span>
                          )}
                        </td>
                        <td className="text-right px-4 py-3 text-white/40 text-[11px]">{fmtAgo(s.lastSeen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
    </div>
  );
}

function RadarCard({ c }: { c: RadarCapture }) {
  const tier = tierStyle(c.atc_tier);
  return (
    <div className={`rounded-lg border ${tier.border} ${tier.bg} overflow-hidden hover:opacity-90 transition-opacity`}>
      <a href={c.url || "#"} target="_blank" rel="noopener noreferrer" className="block">
        {c.image_url && (
          <div className="relative aspect-square bg-white/5 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.image_url} alt={c.title} loading="lazy" className="w-full h-full object-cover" />
            {(c.atc_tier === "hot" || c.atc_tier === "warm" || c.is_bestseller > 0) && (
              <div className="absolute top-2 left-2 flex flex-col gap-1">
                {c.atc_tier && c.atc_tier !== "cold" && (
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${tier.text} ${tier.bg} border ${tier.border}`}>
                    {tier.label}
                  </span>
                )}
                {c.atc_count != null && c.atc_count > 0 && (
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-black/60 text-white">
                    🛒 {c.atc_count}+ ATC
                  </span>
                )}
                {c.is_bestseller > 0 && (
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-purple-500/80 text-white">
                    ★ BESTSELLER
                  </span>
                )}
              </div>
            )}
          </div>
        )}
        <div className="p-3 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold text-white/85 leading-snug line-clamp-2 flex-1">{c.title}</p>
            {c.price != null && (
              <span className="text-xs font-bold text-emerald-400 flex-shrink-0">
                {c.currency === "$" || !c.currency ? "$" : ""}{c.price.toFixed(2)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between text-[10px] text-white/40">
            <span className="truncate">{c.shop_name || "—"}</span>
            <span>{fmtAgo(c.scanned_at)}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            {c.is_digital > 0 && <span className="text-blue-300">📥 digital</span>}
            {c.reviews > 0 && <span className="text-white/40">★ {c.rating.toFixed(1)} ({c.reviews})</span>}
            {c.atc_badge && (
              <span className="text-amber-300 italic line-clamp-1" title={c.atc_badge}>
                "{c.atc_badge}"
              </span>
            )}
          </div>
        </div>
      </a>
    </div>
  );
}
