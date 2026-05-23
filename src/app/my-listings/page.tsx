"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Listing = {
  id: string;
  kind: "wall_art" | "cross_stitch" | string;
  title: string;
  price: number;
  status: string;
  etsyListingId: string | null;
  etsyUrl: string | null;
  thumbnail: string | null;
  updatedAt: string | null;
  niche: string;
};

type Stats = {
  total: number;
  live: number;
  draft: number;
  wallArt: number;
  crossStitch: number;
};

export default function MyListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState<"all" | "wall_art" | "cross_stitch" | "live" | "draft">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await fetch("/api/my-listings");
        if (!resp.ok) throw new Error(`${resp.status}`);
        const data = await resp.json();
        if (!alive) return;
        setListings(data.listings || []);
        setStats(data.stats || null);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const visible = listings.filter((l) => {
    if (filter === "all") return true;
    if (filter === "live") return l.status === "active";
    if (filter === "draft") return l.status === "draft" || !l.status;
    return l.kind === filter;
  });

  const statusBadge = (status: string) => {
    if (status === "active") return <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">Live</span>;
    if (status === "draft") return <span className="text-xs px-2 py-0.5 rounded bg-slate-500/15 border border-slate-500/30 text-slate-400">Draft</span>;
    return <span className="text-xs px-2 py-0.5 rounded bg-gray-500/15 border border-gray-500/30 text-gray-400">{status || "Unknown"}</span>;
  };

  const kindBadge = (kind: string) => {
    if (kind === "wall_art") return <span className="text-xs px-2 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-400">Wall Art</span>;
    if (kind === "cross_stitch") return <span className="text-xs px-2 py-0.5 rounded bg-purple-500/15 border border-purple-500/30 text-purple-400">Cross-Stitch</span>;
    return <span className="text-xs px-2 py-0.5 rounded bg-gray-500/15 border border-gray-500/30 text-gray-400">{kind}</span>;
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-1">My Listings</h1>
          <p className="text-sm text-gray-400">All wall-art and cross-stitch listings — draft and live — in one place.</p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-5 gap-3 mb-6">
            <div className="bg-gray-900 border border-gray-800 rounded p-3">
              <div className="text-xs text-gray-400">Total</div>
              <div className="text-2xl font-bold">{stats.total}</div>
            </div>
            <div className="bg-gray-900 border border-emerald-500/20 rounded p-3">
              <div className="text-xs text-emerald-400">Live on Etsy</div>
              <div className="text-2xl font-bold">{stats.live}</div>
            </div>
            <div className="bg-gray-900 border border-slate-500/20 rounded p-3">
              <div className="text-xs text-slate-400">Drafts</div>
              <div className="text-2xl font-bold">{stats.draft}</div>
            </div>
            <div className="bg-gray-900 border border-blue-500/20 rounded p-3">
              <div className="text-xs text-blue-400">Wall Art</div>
              <div className="text-2xl font-bold">{stats.wallArt}</div>
            </div>
            <div className="bg-gray-900 border border-purple-500/20 rounded p-3">
              <div className="text-xs text-purple-400">Cross-Stitch</div>
              <div className="text-2xl font-bold">{stats.crossStitch}</div>
            </div>
          </div>
        )}

        {/* Filter pills */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {(["all", "live", "draft", "wall_art", "cross_stitch"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-sm rounded border ${
                filter === f
                  ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                  : "bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700"
              }`}
            >
              {f === "all" ? "All" : f === "wall_art" ? "Wall Art" : f === "cross_stitch" ? "Cross-Stitch" : f === "live" ? "Live" : "Draft"}
            </button>
          ))}
          <div className="flex-1" />
          <Link href="/wall-art" className="text-sm px-3 py-1 rounded bg-blue-500/20 border border-blue-500/40 text-blue-300 hover:bg-blue-500/30">+ New Wall Art</Link>
          <Link href="/cross-stitch" className="text-sm px-3 py-1 rounded bg-purple-500/20 border border-purple-500/40 text-purple-300 hover:bg-purple-500/30">+ New Cross-Stitch</Link>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : error ? (
          <div className="text-center py-16 text-red-400">Error: {error}</div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            No listings yet. Create your first one from Wall Art or Cross-Stitch.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map((l) => (
              <div key={`${l.kind}-${l.id}`} className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden hover:border-gray-700 transition-colors">
                <div className="aspect-[4/3] bg-gray-800 overflow-hidden flex items-center justify-center">
                  {l.thumbnail ? (
                    <img src={l.thumbnail} alt={l.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-gray-600 text-sm">No preview</div>
                  )}
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    {kindBadge(l.kind)}
                    {statusBadge(l.status)}
                  </div>
                  <div className="text-sm font-medium line-clamp-2 mb-2" title={l.title}>
                    {l.title}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">${l.price.toFixed(2)}</span>
                    {l.etsyUrl ? (
                      <a
                        href={l.etsyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:underline"
                      >
                        View on Etsy ↗
                      </a>
                    ) : (
                      <span className="text-gray-500">Not listed</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
