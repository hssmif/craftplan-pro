"use client";

// ═══ SellerScanner ════════════════════════════════════════════════════
// Drop-in panel that scans Etsy's top shops in a niche and renders
// velocity metrics (24h / 7d / 14d / 30d) + each seller's best listing.
// Used by both /cross-stitch and /wall-art so users can study what's
// converting right now.

import { useCallback, useEffect, useState } from "react";
import type { SellerScanResult, SellerScanEntry } from "@/lib/etsy-seller-scanner";
import SellerDeepScan, { type SellerStudyApplyPayload } from "./SellerDeepScan";

interface SellerScannerProps {
  /** Default niche to pre-fill. Falls back to "" (user must type). */
  defaultNiche?: string;
  /** Controlled niche (if parent wants to sync with its own state). */
  niche?: string;
  /** Fired whenever the user picks a shop (e.g. to reverse-engineer). */
  onPickShop?: (entry: SellerScanEntry) => void;
  /** Fired when the deep-scan modal emits an apply action. */
  onApplyStudy?: (payload: SellerStudyApplyPayload) => void;
  /** Compact mode hides the big header (for inline embedding). */
  compact?: boolean;
}

/**
 * Product thumbnail with graceful fallback. Etsy CDN URLs are usually stable,
 * but occasionally a listing image is removed or CORS-blocked. We show a
 * lightweight placeholder icon instead of a broken-image indicator so the grid
 * layout stays clean.
 */
function ProductThumb({
  src,
  alt,
  size,
}: {
  src: string;
  alt: string;
  size: "hero" | "thumb";
}) {
  const [errored, setErrored] = useState(false);
  const wrapperClass =
    size === "hero"
      ? "w-16 h-16 rounded-md overflow-hidden bg-[var(--bg-surface)] flex-shrink-0"
      : "absolute inset-0";
  const showPlaceholder = !src || errored;

  if (showPlaceholder) {
    return (
      <div className={`${wrapperClass} flex items-center justify-center text-[var(--text-muted)]`}>
        <svg
          className={size === "hero" ? "w-6 h-6" : "w-4 h-4"}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-cover"
        loading="lazy"
        onError={() => setErrored(true)}
      />
    </div>
  );
}

/**
 * Age formatter: if Etsy didn't give us a creation date → "age unknown".
 * Under a year → "{n}mo". Otherwise → "{n}y" with one decimal.
 */
function formatShopAge(shop: SellerScanEntry["shop"]): string {
  if (!shop.days_on_etsy || shop.days_on_etsy <= 0) return "age unknown";
  if (shop.days_on_etsy < 30) return `${shop.days_on_etsy}d`;
  if (shop.days_on_etsy < 365) return `${shop.months_on_etsy}mo`;
  return `${shop.years_on_etsy}y`;
}

/**
 * Relative time formatter for live/scan timestamps. "just now" → "12s ago"
 * → "4m ago" → "2h ago". Tuned for the short timescales this UI shows.
 */
function formatRelativeMinutes(minutes: number): string {
  if (minutes < 0) return "never";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatRelativeSeconds(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function trendBadge(trend: SellerScanEntry["velocity"]["trend"]) {
  if (trend === "up") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">
        <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path d="M10 3l5 7h-3v7H8v-7H5l5-7z" /></svg>
        trending up
      </span>
    );
  }
  if (trend === "down") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[10px] font-bold">
        <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path d="M10 17l-5-7h3V3h4v7h3l-5 7z" /></svg>
        cooling
      </span>
    );
  }
  if (trend === "stable") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold">
        steady
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--bg-hover)] text-[var(--text-muted)] text-[10px] font-bold">
      — no recent data
    </span>
  );
}

export default function SellerScanner({
  defaultNiche = "",
  niche: controlledNiche,
  onPickShop,
  onApplyStudy,
  compact = false,
}: SellerScannerProps) {
  const [internalNiche, setInternalNiche] = useState(defaultNiche);
  const [deepScanShop, setDeepScanShop] = useState<{ id: string; name: string } | null>(null);
  const niche = controlledNiche ?? internalNiche;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SellerScanResult | null>(null);
  const [maxSellers, setMaxSellers] = useState(10);

  // Ticking clock for the "scanned X ago" labels. We re-render once per second
  // so the user sees a live counter — no external state needed.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!result) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [result]);

  const runScan = useCallback(async () => {
    const q = niche.trim();
    if (!q) {
      setError("Enter a niche keyword first (e.g. 'boho wall art', 'cross stitch pattern')");
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      // `cache: "no-store"` forces the browser to bypass its own HTTP cache
      // so users see fresh velocity numbers on every scan/refresh.
      const resp = await fetch(
        `/api/etsy/scan-sellers?niche=${encodeURIComponent(q)}&max=${maxSellers}&listings=60`,
        { cache: "no-store" },
      );
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `Scan failed (${resp.status})`);
      }
      const data: SellerScanResult = await resp.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Seller scan failed");
    } finally {
      setLoading(false);
    }
  }, [niche, maxSellers]);

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-[20px] text-[var(--text-page-title)] leading-tight">
              Scan Top Sellers
            </h3>
            <p className="text-[12px] text-[var(--text-secondary)] mt-1">
              Find the shops dominating this niche right now. See their sales velocity over the last
              24h / 7d / 14d / 30d and their current best-seller.
            </p>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        {controlledNiche === undefined && (
          <input
            type="text"
            value={internalNiche}
            onChange={(e) => setInternalNiche(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runScan();
            }}
            placeholder="e.g. boho wall art, cross stitch pattern"
            className="flex-1 min-w-[220px] h-9 px-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
          />
        )}
        <select
          value={maxSellers}
          onChange={(e) => setMaxSellers(parseInt(e.target.value))}
          className="h-9 px-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[12px] text-[var(--text-primary)] focus:outline-none"
        >
          <option value={5}>5 sellers</option>
          <option value={10}>10 sellers</option>
          <option value={15}>15 sellers</option>
        </select>
        <button
          onClick={runScan}
          disabled={loading || !niche.trim()}
          className="btn-amber h-9 px-4 rounded-lg text-[13px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {loading ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Scanning...
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Scan Top Sellers
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-[12px] text-red-400">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="text-center py-10">
          <p className="text-[13px] text-[var(--text-secondary)] font-medium">
            Crawling Etsy shops &amp; reviews...
          </p>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            Computing 24h / 7d / 14d / 30d sales velocity — this takes ~5-10 seconds.
          </p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-3">
          {/* Summary strip — now includes live "scanned X ago" + refresh */}
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[var(--text-muted)]">Niche:</span>
              <span className="text-[12px] font-bold text-[var(--text-primary)]">&quot;{result.niche}&quot;</span>
            </div>
            <div className="w-px h-5 bg-[var(--border-subtle)]" />
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[var(--text-muted)]">Listings Searched:</span>
              <span className="text-[12px] font-bold text-[var(--text-primary)]">
                {result.total_listings_searched.toLocaleString()}
              </span>
            </div>
            <div className="w-px h-5 bg-[var(--border-subtle)]" />
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[var(--text-muted)]">Top Sellers:</span>
              <span className="text-[12px] font-bold text-[var(--accent-primary)]">{result.sellers.length}</span>
            </div>
            <div className="w-px h-5 bg-[var(--border-subtle)]" />
            <div className="flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] text-[var(--text-muted)]">Scanned</span>
              <span className="text-[12px] font-bold text-emerald-400">
                {formatRelativeSeconds(nowTick - result.scanned_at)}
              </span>
            </div>
            <button
              onClick={runScan}
              disabled={loading}
              className="ml-auto h-7 px-3 rounded-md bg-[var(--bg-inset)] border border-[var(--border-default)] hover:border-[var(--border-accent)] text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-primary)] inline-flex items-center gap-1.5 disabled:opacity-50"
              title="Re-scan to pull live sales data"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh live
            </button>
            <div className="basis-full text-[11px] text-[var(--text-muted)]">
              Sales est. via reviews × 28.6 (Etsy&apos;s ~3.5% review rate). Shops with activity in the last hour are marked LIVE.
            </div>
          </div>

          {result.sellers.length === 0 && (
            <div className="p-6 text-center rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)]">
              <p className="text-[13px] text-[var(--text-secondary)]">
                No sellers matched this niche. Try broader keywords.
              </p>
            </div>
          )}

          {/* Seller cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {result.sellers.map((entry, idx) => (
              <div
                key={entry.shop.shop_id}
                className="relative bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-[var(--border-accent)] rounded-xl p-4 transition-colors"
              >
                {/* Rank badge */}
                <div className="absolute -top-2 -left-2 w-7 h-7 rounded-full bg-[var(--accent-primary)] text-white text-[11px] font-bold flex items-center justify-center shadow-md">
                  #{idx + 1}
                </div>

                {/* Shop header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <a
                      href={entry.shop.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[14px] font-bold text-[var(--text-primary)] hover:text-[var(--accent-primary)] truncate block"
                    >
                      {entry.shop.shop_name}
                    </a>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[10.5px] text-[var(--text-muted)]">
                      <span>
                        <strong className="text-[var(--text-secondary)]">
                          {entry.shop.total_sales.toLocaleString()}
                        </strong>{" "}
                        lifetime sales
                      </span>
                      <span>
                        <strong className="text-[var(--text-secondary)]">{formatShopAge(entry.shop)}</strong> on Etsy
                      </span>
                      {entry.shop.avg_daily_sales > 0 && (
                        <span>
                          <strong className="text-[var(--text-secondary)]">{entry.shop.avg_daily_sales}</strong>/day avg
                        </span>
                      )}
                      <span>
                        <strong className="text-[var(--text-secondary)]">{entry.shop.review_count.toLocaleString()}</strong> reviews ({entry.shop.review_average.toFixed(1)}★)
                      </span>
                      {entry.velocity.minutes_since_last_review >= 0 && (
                        <span className={
                          entry.velocity.minutes_since_last_review < 360
                            ? "text-emerald-400"
                            : entry.velocity.minutes_since_last_review < 1440
                              ? "text-amber-400"
                              : "text-[var(--text-muted)]"
                        }>
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1 align-middle animate-pulse" />
                          last sale {formatRelativeMinutes(entry.velocity.minutes_since_last_review)}
                        </span>
                      )}
                    </div>
                  </div>
                  {trendBadge(entry.velocity.trend)}
                </div>

                {/* Live real-time strip (1h / 6h). Highlighted in emerald
                    with a pulse dot so the user can see at a glance whether a
                    shop is actively selling right now. Hidden when both are
                    zero — no point drawing a quiet-shop row. */}
                {(entry.velocity.reviews_1h > 0 || entry.velocity.reviews_6h > 0) && (
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {[
                      { label: "LIVE · 1h", rev: entry.velocity.reviews_1h, est: entry.velocity.est_sales_1h },
                      { label: "LIVE · 6h", rev: entry.velocity.reviews_6h, est: entry.velocity.est_sales_6h },
                    ].map((b) => (
                      <div
                        key={b.label}
                        className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2 text-center"
                      >
                        <div className="text-[9.5px] text-emerald-400 uppercase tracking-wide font-bold flex items-center justify-center gap-1">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          {b.label}
                        </div>
                        <div className="text-[16px] font-bold text-emerald-300 leading-none mt-1">
                          ~{b.est}
                        </div>
                        <div className="text-[9.5px] text-emerald-400/70 mt-0.5">
                          {b.rev} rev
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Velocity grid */}
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[
                    { label: "24h", rev: entry.velocity.reviews_24h, est: entry.velocity.est_sales_24h },
                    { label: "7d", rev: entry.velocity.reviews_7d, est: entry.velocity.est_sales_7d },
                    { label: "14d", rev: entry.velocity.reviews_14d, est: entry.velocity.est_sales_14d },
                    { label: "30d", rev: entry.velocity.reviews_30d, est: entry.velocity.est_sales_30d },
                  ].map((b) => (
                    <div
                      key={b.label}
                      className="rounded-lg bg-[var(--bg-inset)] border border-[var(--border-subtle)] p-2 text-center"
                    >
                      <div className="text-[9.5px] text-[var(--text-muted)] uppercase tracking-wide">{b.label}</div>
                      <div className="text-[16px] font-bold text-[var(--text-primary)] leading-none mt-1">
                        ~{b.est}
                      </div>
                      <div className="text-[9.5px] text-[var(--text-muted)] mt-0.5">
                        {b.rev} rev
                      </div>
                    </div>
                  ))}
                </div>

                {/* Top products gallery — hero + strip of additional best-sellers */}
                {entry.top_listings.length > 0 ? (
                  <div className="space-y-2">
                    {/* Hero best-seller (largest) */}
                    <a
                      href={entry.top_listings[0].url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex gap-3 p-2 rounded-lg bg-[var(--bg-inset)] border border-[var(--border-subtle)] hover:border-[var(--border-accent)] transition-colors"
                    >
                      <ProductThumb
                        src={entry.top_listings[0].image_url}
                        alt={entry.top_listings[0].title}
                        size="hero"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] font-semibold">
                          #1 Best-seller
                        </div>
                        <p className="text-[11.5px] text-[var(--text-primary)] leading-tight line-clamp-2 mt-0.5">
                          {entry.top_listings[0].title}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[12px] font-bold text-emerald-400">
                            ${entry.top_listings[0].price.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-pink-400 font-bold">
                            ♥ {entry.top_listings[0].favorites.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {entry.top_listings[0].age_days}d old
                          </span>
                        </div>
                      </div>
                    </a>

                    {/* Additional top products (thumbnails 2-6) */}
                    {entry.top_listings.length > 1 && (
                      <div className="flex gap-1.5">
                        {entry.top_listings.slice(1, 6).map((product) => (
                          <a
                            key={product.listing_id}
                            href={product.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group relative flex-1 aspect-square rounded-md overflow-hidden bg-[var(--bg-inset)] border border-[var(--border-subtle)] hover:border-[var(--border-accent)] transition-all"
                            title={`${product.title} — $${product.price.toFixed(2)} · ♥${product.favorites.toLocaleString()}`}
                          >
                            <ProductThumb
                              src={product.image_url}
                              alt={product.title}
                              size="thumb"
                            />
                            {/* Hover overlay with price + favs */}
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1 pt-3 pb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="text-[9.5px] font-bold text-emerald-300">
                                ${product.price.toFixed(2)}
                              </div>
                              <div className="text-[8.5px] text-pink-300">
                                ♥ {product.favorites.toLocaleString()}
                              </div>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-2 rounded-lg bg-[var(--bg-inset)] text-[11px] text-[var(--text-muted)] text-center">
                    No product images available
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 mt-3">
                  <a
                    href={entry.shop.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-8 px-3 rounded-lg border border-[var(--border-default)] text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] inline-flex items-center justify-center gap-1.5"
                  >
                    Visit shop
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </a>
                  <button
                    onClick={() => setDeepScanShop({ id: entry.shop.shop_id, name: entry.shop.shop_name })}
                    className="flex-1 h-8 rounded-lg btn-amber text-[11px] font-semibold inline-flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Deep Scan &amp; Study
                  </button>
                  {onPickShop && (
                    <button
                      onClick={() => onPickShop(entry)}
                      className="h-8 px-3 rounded-lg bg-[var(--accent-soft)] border border-[var(--border-accent)] text-[11px] font-semibold text-[var(--accent-primary)] hover:bg-[var(--accent-primary)] hover:text-white inline-flex items-center justify-center gap-1.5 transition-colors"
                      title="Pick this shop for your pipeline"
                    >
                      Pick
                    </button>
                  )}
                </div>

                {entry.niche_listing_count > 1 && (
                  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 text-[9.5px] font-bold">
                    {entry.niche_listing_count} in niche
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="text-[10.5px] text-[var(--text-muted)] text-center pt-1">
            Sales counts are estimates derived from public review timestamps (≈3.5% of Etsy orders receive reviews).
            Ranked by 7-day velocity, then lifetime sales.
          </p>
        </div>
      )}

      {deepScanShop && (
        <SellerDeepScan
          shopId={deepScanShop.id}
          shopName={deepScanShop.name}
          onClose={() => setDeepScanShop(null)}
          onApply={(payload) => {
            onApplyStudy?.(payload);
          }}
        />
      )}
    </div>
  );
}
