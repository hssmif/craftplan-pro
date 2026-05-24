"use client";

// ═══ SellerDeepScan Modal ═════════════════════════════════════════════
// A full-screen drawer that shows everything we've learned about a
// single Etsy seller:
//   • Shop header + velocity
//   • All listings grid (clickable → opens on Etsy)
//   • Pricing distribution chart
//   • Title & tag patterns
//   • Description pattern signals
//   • Image style gallery (20 primary images)
//   • AI-generated playbook (Gemini) with one-click apply actions
//
// The user can:
//   1. Scan the data raw to learn
//   2. Click "Generate AI Playbook" to get structured competitor copy
//   3. Apply pieces: copy tags, copy pricing, queue topics into research,
//      copy mockup style into the MJ prompt hint bank.

import { useCallback, useEffect, useState } from "react";
import type { SellerDeepScanResult, DeepListingInfo } from "@/lib/etsy-seller-deep";
import type { SellerPlaybook } from "@/lib/etsy-seller-study";

export interface SellerStudyApplyPayload {
  shopId: string;
  shopName: string;
  playbook: SellerPlaybook;
  scan: SellerDeepScanResult;
  /** Specific piece the user applied. */
  apply:
    | { kind: "copy_tags"; tags: string[] }
    | { kind: "copy_pricing"; min: number; max: number; launch: number }
    | { kind: "copy_style_hint"; hint: string; palette: string[]; frame: string; room: string }
    | { kind: "queue_topics"; topics: string[] }
    | { kind: "use_product_idea"; idea: SellerPlaybook["product_ideas"][number] };
}

interface SellerDeepScanProps {
  shopId: string;
  shopName: string;
  onClose: () => void;
  /** Parent can consume applied pieces (e.g. queue topics into bulk pipeline). */
  onApply?: (payload: SellerStudyApplyPayload) => void;
}

type Tab = "overview" | "listings" | "patterns" | "gallery" | "playbook";

export default function SellerDeepScan({ shopId, shopName, onClose, onApply }: SellerDeepScanProps) {
  const [scan, setScan] = useState<SellerDeepScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  // Playbook state
  const [playbook, setPlaybook] = useState<SellerPlaybook | null>(null);
  const [playbookSource, setPlaybookSource] = useState<"gemini" | "fallback" | null>(null);
  const [generatingPlaybook, setGeneratingPlaybook] = useState(false);
  const [playbookError, setPlaybookError] = useState<string | null>(null);

  // Load deep scan on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch(`/api/etsy/seller-deep?shop_id=${encodeURIComponent(shopId)}`);
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body.error || `Deep scan failed (${resp.status})`);
        }
        const data: SellerDeepScanResult = await resp.json();
        if (!cancelled) setScan(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Deep scan failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [shopId]);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Generate playbook
  const generatePlaybook = useCallback(async () => {
    if (!scan) return;
    setGeneratingPlaybook(true);
    setPlaybookError(null);
    try {
      const resp = await fetch(`/api/etsy/seller-study`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop_id: shopId, scan }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `Study failed (${resp.status})`);
      }
      const data: { playbook: SellerPlaybook; source: "gemini" | "fallback" } = await resp.json();
      setPlaybook(data.playbook);
      setPlaybookSource(data.source);
      setTab("playbook");
    } catch (err) {
      setPlaybookError(err instanceof Error ? err.message : "Study failed");
    } finally {
      setGeneratingPlaybook(false);
    }
  }, [scan, shopId]);

  // Apply helpers
  const emitApply = useCallback(
    (apply: SellerStudyApplyPayload["apply"]) => {
      if (!scan || !playbook || !onApply) return;
      onApply({
        shopId,
        shopName,
        playbook,
        scan,
        apply,
      });
    },
    [onApply, scan, playbook, shopId, shopName],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-6xl bg-[var(--bg-page)] border-l border-[var(--border-default)] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-[var(--border-default)] bg-[var(--bg-elevated)]">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-wider text-[var(--accent-primary)] font-semibold">
                Deep Scan — Competitive Intel
              </span>
            </div>
            <h2 className="font-display text-[24px] text-[var(--text-page-title)] leading-tight truncate">
              {shopName}
            </h2>
            {scan && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-[var(--text-muted)]">
                <span><strong className="text-[var(--text-secondary)]">{scan.shop.transaction_sold_count?.toLocaleString() ?? "?"}</strong> lifetime sales</span>
                <span><strong className="text-[var(--text-secondary)]">{scan.derived.years_on_etsy}y</strong> on Etsy</span>
                <span><strong className="text-[var(--text-secondary)]">{scan.derived.avg_daily_sales}</strong>/day avg</span>
                <span><strong className="text-[var(--text-secondary)]">{scan.listings.length}</strong> active listings</span>
                <span><strong className="text-[var(--text-secondary)]">{scan.derived.digital_share_pct}%</strong> digital</span>
                <a
                  href={scan.shop.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[var(--accent-primary)] hover:underline"
                >
                  Visit shop
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </a>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-[var(--bg-hover)] border border-[var(--border-default)] hover:bg-[var(--bg-inset)] text-[var(--text-secondary)] flex items-center justify-center"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-5 pt-3 border-b border-[var(--border-default)] bg-[var(--bg-elevated)] overflow-x-auto">
          {([
            { id: "overview", label: "Overview", icon: "📊" },
            { id: "listings", label: "Listings", icon: "🛍" },
            { id: "patterns", label: "Patterns", icon: "🔍" },
            { id: "gallery", label: "Style Gallery", icon: "🖼" },
            { id: "playbook", label: "AI Playbook", icon: "✨" },
          ] as { id: Tab; label: string; icon: string }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-[12px] font-semibold rounded-t-lg transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "bg-[var(--bg-page)] text-[var(--text-primary)] border-x border-t border-[var(--border-default)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              <span className="mr-1">{t.icon}</span>
              {t.label}
              {t.id === "playbook" && playbookSource === "gemini" && (
                <span className="ml-1.5 inline-flex w-1.5 h-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <svg className="w-10 h-10 animate-spin text-[var(--accent-primary)] mb-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-[13px] text-[var(--text-secondary)] font-medium">Scanning {shopName}…</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                Pulling 100 listings, 100 reviews, and pattern stats — ~10-15 seconds.
              </p>
            </div>
          )}

          {error && !loading && (
            <div className="m-5 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-[13px] text-red-400">
              {error}
            </div>
          )}

          {scan && !loading && !error && (
            <div className="p-5">
              {tab === "overview" && <OverviewTab scan={scan} onGenerate={generatePlaybook} generating={generatingPlaybook} playbookReady={!!playbook} />}
              {tab === "listings" && <ListingsTab scan={scan} />}
              {tab === "patterns" && <PatternsTab scan={scan} />}
              {tab === "gallery" && <GalleryTab scan={scan} />}
              {tab === "playbook" && (
                <PlaybookTab
                  scan={scan}
                  playbook={playbook}
                  source={playbookSource}
                  onGenerate={generatePlaybook}
                  generating={generatingPlaybook}
                  error={playbookError}
                  onApply={emitApply}
                  canApply={!!onApply}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Overview Tab ─────────────────────────────────────────────────────

function OverviewTab({
  scan,
  onGenerate,
  generating,
  playbookReady,
}: {
  scan: SellerDeepScanResult;
  onGenerate: () => void;
  generating: boolean;
  playbookReady: boolean;
}) {
  const velocity = scan.velocity;
  return (
    <div className="space-y-6">
      {/* Velocity */}
      <section>
        <h3 className="text-[12px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Sales Velocity (est. from reviews)</h3>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Last 24h", est: velocity.est_sales_24h, rev: velocity.reviews_24h },
            { label: "Last 7d", est: velocity.est_sales_7d, rev: velocity.reviews_7d },
            { label: "Last 14d", est: velocity.est_sales_14d, rev: velocity.reviews_14d },
            { label: "Last 30d", est: velocity.est_sales_30d, rev: velocity.reviews_30d },
          ].map((b) => (
            <div key={b.label} className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{b.label}</div>
              <div className="text-[28px] font-bold text-[var(--text-primary)] leading-none mt-1.5">~{b.est}</div>
              <div className="text-[10.5px] text-[var(--text-muted)] mt-1">{b.rev} reviews</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing summary */}
      <section>
        <h3 className="text-[12px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Pricing</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Min", value: `$${scan.pricing.min}` },
            { label: "Median", value: `$${scan.pricing.median}` },
            { label: "Mean", value: `$${scan.pricing.mean}` },
            { label: "Mode", value: `$${scan.pricing.mode}` },
            { label: "Max", value: `$${scan.pricing.max}` },
          ].map((p) => (
            <div key={p.label} className="p-3 rounded-lg bg-[var(--bg-inset)] border border-[var(--border-subtle)] text-center">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{p.label}</div>
              <div className="text-[18px] font-bold text-[var(--text-primary)] mt-1">{p.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-[11px] text-[var(--text-muted)]">
          <span className="text-[var(--accent-primary)] font-semibold">Sweet spot:</span>{" "}
          ${scan.pricing.sweetSpot.lo} – ${scan.pricing.sweetSpot.hi} (where most listings cluster)
        </div>
      </section>

      {/* Top tags */}
      <section>
        <h3 className="text-[12px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Top Tags (top 15)</h3>
        <div className="flex flex-wrap gap-1.5">
          {scan.tags.topTags.slice(0, 15).map((t) => (
            <span
              key={t.tag}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--accent-soft)] border border-[var(--border-accent)] text-[11px] text-[var(--accent-primary)]"
            >
              {t.tag}
              <span className="text-[9px] text-[var(--text-muted)]">{t.pct}%</span>
            </span>
          ))}
        </div>
      </section>

      {/* AI Playbook CTA */}
      <section className="p-5 rounded-xl bg-gradient-to-br from-[var(--accent-soft)] to-transparent border border-[var(--border-accent)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-[15px] font-bold text-[var(--text-primary)] mb-1">
              AI Competitive Playbook
            </h3>
            <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
              Gemini analyzes this seller&apos;s patterns and generates a structured playbook: title template, description format,
              tag strategy, pricing target, mockup style notes, and 5 concrete product ideas — all copy-paste ready.
            </p>
          </div>
          <button
            onClick={onGenerate}
            disabled={generating}
            className="btn-amber h-10 px-5 rounded-lg text-[13px] font-semibold disabled:opacity-50 flex-shrink-0 inline-flex items-center gap-2"
          >
            {generating ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing…
              </>
            ) : playbookReady ? (
              "View Playbook →"
            ) : (
              "Generate AI Playbook"
            )}
          </button>
        </div>
      </section>
    </div>
  );
}

// ── Listings Tab ─────────────────────────────────────────────────────

function ListingsTab({ scan }: { scan: SellerDeepScanResult }) {
  const [sortMode, setSortMode] = useState<"favorites" | "price_asc" | "price_desc" | "newest">("favorites");
  const sorted = [...scan.listings].sort((a, b) => {
    if (sortMode === "favorites") return b.favorites - a.favorites;
    if (sortMode === "price_asc") return a.price - b.price;
    if (sortMode === "price_desc") return b.price - a.price;
    return a.age_days - b.age_days;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
          All Active Listings ({scan.listings.length})
        </h3>
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
          className="h-8 px-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[11px] text-[var(--text-primary)]"
        >
          <option value="favorites">Most favorites</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="newest">Newest first</option>
        </select>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {sorted.map((l, idx) => <ListingCard key={l.listing_id} listing={l} rank={sortMode === "favorites" ? idx + 1 : undefined} />)}
      </div>
    </div>
  );
}

function ListingCard({ listing, rank }: { listing: DeepListingInfo; rank?: number }) {
  return (
    <a
      href={listing.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-[var(--border-accent)] rounded-xl overflow-hidden transition-colors relative"
    >
      {rank && rank <= 3 && (
        <div className="absolute top-2 left-2 z-10 w-6 h-6 rounded-full bg-[var(--accent-primary)] text-white text-[10px] font-bold flex items-center justify-center shadow-md">
          #{rank}
        </div>
      )}
      <div className="aspect-square bg-[var(--bg-inset)] overflow-hidden">
        {listing.primary_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.primary_image}
            alt={listing.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>
      <div className="p-2.5">
        <p className="text-[11px] text-[var(--text-primary)] line-clamp-2 leading-tight">{listing.title}</p>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[13px] font-bold text-emerald-400">${listing.price.toFixed(2)}</span>
          <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
            <span className="text-pink-400 font-bold">♥ {listing.favorites.toLocaleString()}</span>
            <span>{listing.age_days}d</span>
          </div>
        </div>
      </div>
    </a>
  );
}

// ── Patterns Tab ─────────────────────────────────────────────────────

function PatternsTab({ scan }: { scan: SellerDeepScanResult }) {
  return (
    <div className="space-y-6">
      {/* Pricing distribution */}
      <section>
        <h3 className="text-[12px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Price Distribution</h3>
        <div className="space-y-1.5">
          {scan.pricing.buckets.map((b, i) => {
            const maxCount = Math.max(...scan.pricing.buckets.map((x) => x.count), 1);
            const pct = (b.count / maxCount) * 100;
            const isSweet = b.lo === scan.pricing.sweetSpot.lo;
            return (
              <div key={i} className="flex items-center gap-3">
                <div className="w-32 text-[11px] text-[var(--text-secondary)] tabular-nums">{b.rangeLabel}</div>
                <div className="flex-1 relative h-6 rounded-md bg-[var(--bg-inset)] overflow-hidden">
                  <div
                    className={`h-full ${isSweet ? "bg-[var(--accent-primary)]" : "bg-[var(--accent-primary)]/40"}`}
                    style={{ width: `${pct}%` }}
                  />
                  <span className="absolute inset-0 flex items-center px-2 text-[10px] font-semibold text-[var(--text-primary)]">
                    {b.count} listing{b.count === 1 ? "" : "s"}
                    {isSweet && <span className="ml-2 text-[9px] text-[var(--accent-primary)] font-bold">SWEET SPOT</span>}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Title patterns */}
      <section>
        <h3 className="text-[12px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Title Patterns</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Stat label="Avg length" value={`${scan.titles.avgLength} chars`} />
          <Stat label="Emojis" value={`${scan.titles.emojiUsagePct}%`} />
          <Stat label="ALL CAPS" value={`${scan.titles.allCapsPct}%`} />
          <Stat label="Title Case" value={`${scan.titles.titleCasePct}%`} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-4 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Top words in titles</div>
            <div className="flex flex-wrap gap-1.5">
              {scan.titles.topWords.slice(0, 12).map((w) => (
                <span key={w.word} className="text-[11px] px-2 py-0.5 rounded bg-[var(--bg-inset)] text-[var(--text-secondary)]">
                  {w.word} <span className="text-[var(--text-muted)]">·{w.count}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="p-4 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Separator usage</div>
            <div className="flex flex-wrap gap-2">
              {scan.titles.separatorUsage.filter((s) => s.count > 0).map((s) => (
                <span key={s.char} className="text-[11px] px-2 py-0.5 rounded bg-[var(--bg-inset)] text-[var(--text-secondary)]">
                  <code className="font-mono text-[var(--accent-primary)]">{s.char}</code>
                  <span className="text-[var(--text-muted)] ml-1">{s.pct}%</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Description patterns */}
      <section>
        <h3 className="text-[12px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Description Format</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <Stat label="Avg length" value={`${scan.descriptions.avgLength} chars`} />
          <Stat label="Use markers" value={`${scan.descriptions.usesMarkers}%`} />
          <Stat label="Use bullets" value={`${scan.descriptions.usesBullets}%`} />
          <Stat label="Avg paragraphs" value={`${scan.descriptions.avgParagraphs}`} />
        </div>
        {scan.descriptions.commonMarkers.length > 0 && (
          <div className="text-[11px] text-[var(--text-secondary)]">
            <span className="text-[var(--text-muted)]">Markers they use:</span>{" "}
            {scan.descriptions.commonMarkers.map((m) => (
              <code key={m} className="inline-block mx-1 px-1.5 py-0.5 rounded bg-[var(--bg-inset)] text-[var(--accent-primary)]">{m}</code>
            ))}
          </div>
        )}
      </section>

      {/* Review keywords */}
      {scan.review_sentiment.top_keywords.length > 0 && (
        <section>
          <h3 className="text-[12px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
            What buyers say (from {scan.review_sentiment.total_sampled} reviews, avg {scan.review_sentiment.avg_rating}★)
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {scan.review_sentiment.top_keywords.map((k) => (
              <span key={k.word} className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                {k.word} <span className="text-emerald-400/60">·{k.count}</span>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg bg-[var(--bg-inset)] border border-[var(--border-subtle)]">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <div className="text-[16px] font-bold text-[var(--text-primary)] mt-1">{value}</div>
    </div>
  );
}

// ── Gallery Tab ──────────────────────────────────────────────────────

function GalleryTab({ scan }: { scan: SellerDeepScanResult }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[12px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1">Style Gallery</h3>
        <p className="text-[11px] text-[var(--text-muted)]">
          Primary images from this seller&apos;s best listings. Use this to study their mockup style, color palette, framing,
          and composition — then match it in your own MJ prompts.
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {scan.image_gallery.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={url}
            alt={`Style reference ${i + 1}`}
            loading="lazy"
            className="w-full aspect-square object-cover rounded-lg border border-[var(--border-default)]"
          />
        ))}
      </div>
    </div>
  );
}

// ── Playbook Tab ─────────────────────────────────────────────────────

function PlaybookTab({
  scan,
  playbook,
  source,
  onGenerate,
  generating,
  error,
  onApply,
  canApply,
}: {
  scan: SellerDeepScanResult;
  playbook: SellerPlaybook | null;
  source: "gemini" | "fallback" | null;
  onGenerate: () => void;
  generating: boolean;
  error: string | null;
  onApply: (apply: SellerStudyApplyPayload["apply"]) => void;
  canApply: boolean;
}) {
  if (!playbook) {
    return (
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--accent-soft)] border border-[var(--border-accent)] mb-3">
          <svg className="w-7 h-7 text-[var(--accent-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <h3 className="text-[16px] font-bold text-[var(--text-primary)] mb-1">Generate AI Playbook</h3>
        <p className="text-[12px] text-[var(--text-muted)] max-w-md mx-auto mb-4">
          Gemini will analyze {scan.shop.shop_name}&apos;s patterns and produce a title template, description format,
          tag strategy, pricing targets, mockup style notes, and concrete product ideas.
        </p>
        {error && (
          <div className="max-w-md mx-auto p-3 mb-3 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-400">
            {error}
          </div>
        )}
        <button
          onClick={onGenerate}
          disabled={generating}
          className="btn-amber h-10 px-6 rounded-lg text-[13px] font-semibold disabled:opacity-50 inline-flex items-center gap-2"
        >
          {generating ? "Analyzing…" : "Generate Playbook"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {source === "fallback" && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-400">
          Gemini is unavailable — showing heuristic playbook from raw data. Mockup style notes will be limited.
        </div>
      )}

      {/* Why they win */}
      <section>
        <h3 className="text-[13px] font-bold text-[var(--text-primary)] mb-2">Why They Win</h3>
        <p className="text-[12px] text-[var(--text-muted)] mb-2">{playbook.summary.niche_label} &middot; {playbook.summary.audience}</p>
        <ul className="space-y-1.5">
          {playbook.summary.why_they_win.map((b, i) => (
            <li key={i} className="flex gap-2 text-[12px] text-[var(--text-primary)]">
              <span className="text-[var(--accent-primary)] flex-shrink-0">✦</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Title template */}
      <section className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
        <h3 className="text-[13px] font-bold text-[var(--text-primary)] mb-1">Title Template</h3>
        <div className="text-[11px] text-[var(--text-muted)] mb-2">{playbook.title_template.length_target}</div>
        <code className="block p-3 rounded-lg bg-[var(--bg-inset)] text-[12px] text-[var(--accent-primary)] font-mono whitespace-pre-wrap">
          {playbook.title_template.pattern}
        </code>
        {playbook.title_template.rules.length > 0 && (
          <ul className="mt-3 space-y-0.5 text-[11px] text-[var(--text-secondary)]">
            {playbook.title_template.rules.map((r, i) => <li key={i}>• {r}</li>)}
          </ul>
        )}
      </section>

      {/* Description template */}
      <section className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
        <h3 className="text-[13px] font-bold text-[var(--text-primary)] mb-1">Description Format</h3>
        <div className="text-[11px] text-[var(--text-muted)] mb-2">
          {playbook.description_template.length_target} · Markers:{" "}
          {playbook.description_template.markers.map((m) => (
            <code key={m} className="inline-block mx-0.5 px-1 py-0.5 rounded bg-[var(--bg-inset)] text-[var(--accent-primary)]">{m}</code>
          ))}
        </div>
        <div className="space-y-2">
          {playbook.description_template.sections.map((s, i) => (
            <div key={i} className="p-2.5 rounded-lg bg-[var(--bg-inset)]">
              <div className="text-[11px] font-semibold text-[var(--text-primary)]">{s.heading}</div>
              <div className="text-[10.5px] text-[var(--text-muted)] mt-0.5">{s.purpose}</div>
              <code className="block mt-1.5 text-[11px] text-[var(--accent-primary)] font-mono">{s.sample_line}</code>
            </div>
          ))}
        </div>
      </section>

      {/* Tags */}
      <section className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[13px] font-bold text-[var(--text-primary)]">Tag Strategy</h3>
          {canApply && playbook.tags.copy.length > 0 && (
            <button
              onClick={() => onApply({ kind: "copy_tags", tags: playbook.tags.copy })}
              className="text-[11px] px-3 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] border border-[var(--border-accent)] hover:bg-[var(--accent-primary)] hover:text-white font-semibold"
            >
              Copy all tags
            </button>
          )}
        </div>
        <p className="text-[11px] text-[var(--text-muted)] mb-2">{playbook.tags.notes}</p>
        {playbook.tags.copy.length > 0 && (
          <div className="mb-2">
            <div className="text-[10px] uppercase tracking-wider text-emerald-400 mb-1">Copy verbatim</div>
            <div className="flex flex-wrap gap-1">
              {playbook.tags.copy.map((t) => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">{t}</span>
              ))}
            </div>
          </div>
        )}
        {playbook.tags.variants.length > 0 && (
          <div className="mb-2">
            <div className="text-[10px] uppercase tracking-wider text-blue-400 mb-1">Variants to try</div>
            <div className="flex flex-wrap gap-1">
              {playbook.tags.variants.map((t) => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/25 text-blue-400">{t}</span>
              ))}
            </div>
          </div>
        )}
        {playbook.tags.skip.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-red-400 mb-1">Skip (brand-specific)</div>
            <div className="flex flex-wrap gap-1">
              {playbook.tags.skip.map((t) => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded bg-red-500/10 border border-red-500/25 text-red-400 line-through">{t}</span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Pricing */}
      <section className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[13px] font-bold text-[var(--text-primary)]">Pricing</h3>
          {canApply && (
            <button
              onClick={() =>
                onApply({
                  kind: "copy_pricing",
                  min: playbook.pricing.recommended_min,
                  max: playbook.pricing.recommended_max,
                  launch: playbook.pricing.recommended_launch,
                })
              }
              className="text-[11px] px-3 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] border border-[var(--border-accent)] hover:bg-[var(--accent-primary)] hover:text-white font-semibold"
            >
              Apply pricing
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Min" value={`$${playbook.pricing.recommended_min}`} />
          <Stat label="Launch at" value={`$${playbook.pricing.recommended_launch}`} />
          <Stat label="Max" value={`$${playbook.pricing.recommended_max}`} />
        </div>
        <p className="text-[11px] text-[var(--text-muted)] mt-2">{playbook.pricing.rationale}</p>
      </section>

      {/* Mockup style */}
      <section className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[13px] font-bold text-[var(--text-primary)]">Mockup Style DNA</h3>
          {canApply && playbook.mockup_style.mj_prompt_hints && (
            <button
              onClick={() =>
                onApply({
                  kind: "copy_style_hint",
                  hint: playbook.mockup_style.mj_prompt_hints,
                  palette: playbook.mockup_style.color_palette,
                  frame: playbook.mockup_style.frame_style,
                  room: playbook.mockup_style.room_context,
                })
              }
              className="text-[11px] px-3 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] border border-[var(--border-accent)] hover:bg-[var(--accent-primary)] hover:text-white font-semibold"
            >
              Match this style
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
          <Stat label="Overall" value={playbook.mockup_style.overall_style} />
          <Stat label="Frame / Display" value={playbook.mockup_style.frame_style} />
          <Stat label="Room Setting" value={playbook.mockup_style.room_context} />
          <Stat label="Arrangement" value={playbook.mockup_style.single_vs_gallery} />
          {playbook.mockup_style.mockup_types && playbook.mockup_style.mockup_types !== "unknown" && (
            <Stat label="Mockup Type" value={playbook.mockup_style.mockup_types} />
          )}
          {playbook.mockup_style.photography_style && playbook.mockup_style.photography_style !== "unknown" && (
            <Stat label="Photo Style" value={playbook.mockup_style.photography_style} />
          )}
        </div>
        {playbook.mockup_style.color_palette.length > 0 && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] text-[var(--text-muted)]">Palette:</span>
            {playbook.mockup_style.color_palette.map((c) => (
              <span key={c} className="text-[11px] px-2 py-0.5 rounded bg-[var(--bg-inset)] text-[var(--text-secondary)]">{c}</span>
            ))}
          </div>
        )}
        {playbook.mockup_style.mj_prompt_hints && (
          <code className="block p-3 rounded-lg bg-[var(--bg-inset)] text-[11.5px] text-[var(--accent-primary)] font-mono whitespace-pre-wrap">
            {playbook.mockup_style.mj_prompt_hints}
          </code>
        )}
      </section>

      {/* Product ideas */}
      {playbook.product_ideas.length > 0 && (
        <section>
          <h3 className="text-[13px] font-bold text-[var(--text-primary)] mb-2">Product Ideas (5)</h3>
          <div className="space-y-2">
            {playbook.product_ideas.map((p, i) => (
              <div key={i} className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h4 className="text-[13px] font-bold text-[var(--text-primary)]">
                    <span className="text-[var(--accent-primary)] mr-2">#{i + 1}</span>
                    {p.idea}
                  </h4>
                  {canApply && (
                    <button
                      onClick={() => onApply({ kind: "use_product_idea", idea: p })}
                      className="text-[11px] px-3 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] border border-[var(--border-accent)] hover:bg-[var(--accent-primary)] hover:text-white font-semibold flex-shrink-0"
                    >
                      Build this →
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-[var(--text-muted)] mb-2">{p.why_it_fits}</p>
                <div className="flex flex-wrap gap-1 mb-2">
                  {p.target_keywords.map((k) => (
                    <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-inset)] text-[var(--text-secondary)]">{k}</span>
                  ))}
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-emerald-400 font-bold">${p.suggested_price}</span>
                </div>
                {p.suggested_mj_prompt && (
                  <code className="block mt-2 p-2 rounded bg-[var(--bg-inset)] text-[10.5px] text-[var(--accent-primary)] font-mono whitespace-pre-wrap">
                    {p.suggested_mj_prompt}
                  </code>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Research topics */}
      {playbook.actions.research_topics.length > 0 && (
        <section className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[13px] font-bold text-[var(--text-primary)]">Research Topics</h3>
            {canApply && (
              <button
                onClick={() => onApply({ kind: "queue_topics", topics: playbook.actions.research_topics })}
                className="text-[11px] px-3 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] border border-[var(--border-accent)] hover:bg-[var(--accent-primary)] hover:text-white font-semibold"
              >
                Queue all
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {playbook.actions.research_topics.map((t) => (
              <span key={t} className="text-[11px] px-2 py-0.5 rounded bg-[var(--bg-inset)] text-[var(--text-secondary)]">{t}</span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
