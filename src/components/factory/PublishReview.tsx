"use client";

import { useState, useEffect, useCallback } from "react";
import type { EtsyPublishPayload, ReviewScorecard } from "@/types/factory";

// ══════════════════════════════════════════════════════════════
// Publish Review Gate UI
//
// Full pre-publish review with:
//   - Quality scorecard (pass/warn/fail checks)
//   - Duplicate detection (similar titles in shop)
//   - Niche limit enforcement
//   - Editable title/tags/price/description
//   - Approve → Publish two-step flow
// ══════════════════════════════════════════════════════════════

interface PublishReviewProps {
  runId: string;
  onClose: () => void;
  onPublished?: (result: {
    etsyListingId: number;
    etsyListingUrl: string;
    etsyStatus: string;
  }) => void;
}

type ViewState = "loading" | "scorecard" | "approved" | "publishing" | "published" | "error";

export function PublishReview({ runId, onClose, onPublished }: PublishReviewProps) {
  // ── State ──
  const [view, setView] = useState<ViewState>("loading");
  const [scorecard, setScorecard] = useState<ReviewScorecard | null>(null);
  const [payload, setPayload] = useState<EtsyPublishPayload | null>(null);
  const [etsyConnected, setEtsyConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [price, setPrice] = useState(0);
  const [tagInput, setTagInput] = useState("");

  // Publish result
  const [publishResult, setPublishResult] = useState<{
    success: boolean;
    etsyListingId?: number;
    etsyListingUrl?: string;
    etsyStatus?: string;
    stepsCompleted: string[];
    errors: string[];
  } | null>(null);

  const [actionLoading, setActionLoading] = useState(false);

  // ── Load scorecard on mount ──
  const loadReview = useCallback(async () => {
    setView("loading");
    setError(null);
    try {
      // Fetch scorecard and payload in parallel
      const [reviewRes, payloadRes] = await Promise.all([
        fetch(`/api/factory/review?runId=${runId}`),
        fetch(`/api/factory/publish?runId=${runId}`),
      ]);

      const reviewData = await reviewRes.json();
      const payloadData = await payloadRes.json();

      if (reviewData.error) {
        setError(reviewData.error);
        setView("error");
        return;
      }

      const sc = reviewData.scorecard as ReviewScorecard;
      setScorecard(sc);
      setEtsyConnected(reviewData.etsyConnected || false);

      // Load editable fields from payload or scorecard
      if (payloadData.payload) {
        const p = payloadData.payload as EtsyPublishPayload;
        setPayload(p);
        setTitle(p.title);
        setDescription(p.description);
        setTags(p.tags);
        setPrice(p.price);
      } else {
        setTitle(sc.title);
        setTags(sc.tags);
        setPrice(sc.price);
      }

      // Set view based on review status
      if (sc.reviewStatus === "approved") {
        setView("approved");
      } else {
        setView("scorecard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load review");
      setView("error");
    }
  }, [runId]);

  useEffect(() => { loadReview(); }, [loadReview]);

  // ── Approve action ──
  const handleApprove = useCallback(async () => {
    setActionLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/factory/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, action: "approve" }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || "Approval failed");
        return;
      }
      setView("approved");
      if (scorecard) {
        setScorecard({ ...scorecard, reviewStatus: "approved" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setActionLoading(false);
    }
  }, [runId, scorecard]);

  // ── Reject action ──
  const handleReject = useCallback(async () => {
    setActionLoading(true);
    try {
      await fetch("/api/factory/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, action: "reject" }),
      });
      onClose();
    } catch {
      onClose();
    } finally {
      setActionLoading(false);
    }
  }, [runId, onClose]);

  // ── Publish action ──
  const handlePublish = useCallback(
    async (activate: boolean) => {
      setView("publishing");
      setError(null);
      try {
        const resp = await fetch("/api/factory/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId,
            overrides: {
              title: title !== payload?.title ? title : undefined,
              description: description !== payload?.description ? description : undefined,
              tags: JSON.stringify(tags) !== JSON.stringify(payload?.tags) ? tags : undefined,
              price: price !== payload?.price ? price : undefined,
            },
            autoActivate: activate,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) {
          setError(data.error || "Publish failed");
          setView("approved");
          return;
        }
        setPublishResult(data.result);
        setView("published");
        if (data.result?.success && onPublished && data.result.etsyListingId) {
          onPublished({
            etsyListingId: data.result.etsyListingId,
            etsyListingUrl: data.result.etsyListingUrl,
            etsyStatus: data.result.etsyStatus,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Publish failed");
        setView("approved");
      }
    },
    [runId, title, description, tags, price, payload, onPublished]
  );

  // ── Tag helpers ──
  const addTag = useCallback(() => {
    const t = tagInput.trim().substring(0, 20);
    if (t && tags.length < 13 && !tags.includes(t)) {
      setTags([...tags, t]);
      setTagInput("");
    }
  }, [tagInput, tags]);

  const removeTag = useCallback((i: number) => setTags(tags.filter((_, idx) => idx !== i)), [tags]);

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════

  // ── Loading ──
  if (view === "loading") {
    return (
      <div className="p-8 text-center">
        <svg className="w-8 h-8 mx-auto animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm text-white/30 mt-3">Running pre-publish review...</p>
      </div>
    );
  }

  // ── Error (no scorecard) ──
  if (view === "error" && !scorecard) {
    return (
      <div className="p-6 space-y-4">
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
        </div>
        <button onClick={onClose} className="text-xs text-white/40 hover:text-white/60">Close</button>
      </div>
    );
  }

  // ── Published ──
  if (view === "published" && publishResult?.success) {
    return (
      <div className="p-6 space-y-6">
        <div className="p-6 bg-emerald-500/[0.06] border border-emerald-500/20 rounded-xl text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
            <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Published to Etsy!</h3>
            <p className="text-sm text-white/40 mt-1">
              Listing #{publishResult.etsyListingId} &mdash;{" "}
              <span className={publishResult.etsyStatus === "active" ? "text-emerald-400" : "text-amber-400"}>
                {publishResult.etsyStatus}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {publishResult.stepsCompleted.map((step) => (
              <span key={step} className="px-2 py-0.5 text-[10px] bg-emerald-500/10 text-emerald-400/80 rounded">
                {step.replace(/_/g, " ")}
              </span>
            ))}
          </div>
          {publishResult.errors.length > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-left">
              <p className="text-[10px] text-amber-400/70 uppercase font-semibold mb-1">Warnings</p>
              {publishResult.errors.map((e, i) => (
                <p key={i} className="text-xs text-amber-300/60">{e}</p>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 justify-center pt-2">
            {publishResult.etsyListingUrl && (
              <a
                href={publishResult.etsyListingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
              >
                View on Etsy
              </a>
            )}
            <button onClick={onClose} className="px-5 py-2.5 text-sm text-white/50 hover:text-white bg-white/[0.06] hover:bg-white/[0.10] rounded-lg transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Publishing spinner ──
  if (view === "publishing") {
    return (
      <div className="p-8 text-center space-y-4">
        <svg className="w-10 h-10 mx-auto animate-spin text-orange-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm text-white/50">Publishing to Etsy...</p>
        <p className="text-xs text-white/20">Creating listing, uploading images & files</p>
      </div>
    );
  }

  if (!scorecard) return null;

  const isApproved = view === "approved";
  const isBlocked = scorecard.recommendation === "block";
  const isReview = scorecard.recommendation === "review";

  // ══════════════════════════════════════════════════════════════
  // Main Scorecard View
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="space-y-5 max-h-[80vh] overflow-y-auto pr-1">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Pre-Publish Review</h2>
          <p className="text-xs text-white/30 mt-0.5">Every listing must pass review before publishing</p>
        </div>
        <button onClick={onClose} className="p-2 text-white/30 hover:text-white/60 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ── Recommendation Badge ── */}
      <div className={`p-4 rounded-xl border flex items-center gap-3 ${
        isApproved
          ? "bg-emerald-500/[0.06] border-emerald-500/20"
          : isBlocked
            ? "bg-red-500/[0.06] border-red-500/20"
            : isReview
              ? "bg-amber-500/[0.06] border-amber-500/20"
              : "bg-emerald-500/[0.06] border-emerald-500/20"
      }`}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
          isApproved
            ? "bg-emerald-500/20"
            : isBlocked
              ? "bg-red-500/20"
              : isReview
                ? "bg-amber-500/20"
                : "bg-emerald-500/20"
        }`}>
          {isApproved ? (
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : isBlocked ? (
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : isReview ? (
            <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${
            isApproved ? "text-emerald-400" : isBlocked ? "text-red-400" : isReview ? "text-amber-400" : "text-emerald-400"
          }`}>
            {isApproved ? "Approved for Publish" : isBlocked ? "Publish Blocked" : isReview ? "Needs Review" : "Ready to Approve"}
          </p>
          <p className="text-xs text-white/30 mt-0.5 truncate">
            {isApproved
              ? "This listing has been approved. You can now publish to Etsy."
              : isBlocked
                ? `${scorecard.blockReasons.length} issue${scorecard.blockReasons.length !== 1 ? "s" : ""} must be fixed before publishing`
                : isReview
                  ? `${scorecard.warnings.length} warning${scorecard.warnings.length !== 1 ? "s" : ""} — review before approving`
                  : "All checks passed. Approve when ready."
            }
          </p>
        </div>
      </div>

      {/* ── Block Reasons ── */}
      {scorecard.blockReasons.length > 0 && (
        <div className="space-y-1.5">
          {scorecard.blockReasons.map((reason, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-2 bg-red-500/[0.06] border border-red-500/10 rounded-lg">
              <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              <span className="text-xs text-red-300/80">{reason}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Quality Checks ── */}
      <div className="space-y-2">
        <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold px-1">Quality Checks</p>
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl divide-y divide-white/[0.04]">
          {scorecard.checks.map((check) => (
            <div key={check.id} className="flex items-center gap-3 px-4 py-2.5">
              <CheckIcon status={check.status} />
              <span className="text-xs text-white/50 w-28 flex-shrink-0">{check.label}</span>
              <span className={`text-xs flex-1 ${
                check.status === "pass" ? "text-white/40" : check.status === "warn" ? "text-amber-400/80" : "text-red-400/80"
              }`}>
                {check.message}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Similar Listings ── */}
      {scorecard.similarListings.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold px-1">
            Similar Listings in Shop ({scorecard.similarListings.length})
          </p>
          <div className="space-y-2">
            {scorecard.similarListings.map((listing) => (
              <div
                key={listing.runId}
                className={`p-3 rounded-lg border ${
                  listing.titleSimilarity >= 0.65
                    ? "bg-red-500/[0.04] border-red-500/15"
                    : "bg-amber-500/[0.04] border-amber-500/15"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    listing.titleSimilarity >= 0.65 ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"
                  }`}>
                    {Math.round(listing.titleSimilarity * 100)}% match
                  </span>
                  {listing.etsyStatus && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      listing.etsyStatus === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/40"
                    }`}>
                      {listing.etsyStatus}
                    </span>
                  )}
                  <span className="text-[10px] text-white/20">{listing.niche}</span>
                </div>
                <p className="text-xs text-white/50 leading-relaxed line-clamp-2">{listing.title}</p>
                {listing.etsyListingUrl && (
                  <a
                    href={listing.etsyListingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-indigo-400/60 hover:text-indigo-400 mt-1 inline-block"
                  >
                    View on Etsy
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Product Preview ── */}
      <div className="space-y-2">
        <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold px-1">Listing Preview</p>

        {/* Images */}
        {scorecard.imageCount > 0 && (
          <div className="grid grid-cols-7 gap-1.5">
            {scorecard.imageUrls.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="aspect-square rounded-lg bg-white/[0.04] border border-white/[0.08] hover:border-indigo-500/30 transition-colors flex items-center justify-center group"
              >
                <span className="text-[10px] text-white/30 group-hover:text-white/60 font-medium">{i + 1}</span>
              </a>
            ))}
          </div>
        )}

        {/* Niche + Price row */}
        <div className="flex items-center gap-3 px-1">
          <span className="text-[10px] px-2 py-0.5 bg-indigo-500/10 text-indigo-400/80 border border-indigo-500/20 rounded-full">
            {scorecard.niche}
          </span>
          <span className="text-xs text-white/40">
            ${scorecard.price.toFixed(2)}
            {scorecard.originalPrice > 0 && (
              <span className="text-white/20 line-through ml-2">${scorecard.originalPrice.toFixed(2)}</span>
            )}
          </span>
          <span className="text-[10px] text-white/20">{scorecard.imageCount} images</span>
          <span className="text-[10px] text-white/20">{scorecard.tagCount}/13 tags</span>
        </div>
      </div>

      {/* ── Editable Fields (always shown) ── */}
      <div className="space-y-4 bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
        <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Edit Before Publishing</p>

        {/* Title */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Title</label>
            <span className="text-[10px] text-white/20">{title.length}/140</span>
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.substring(0, 140))}
            className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.10] rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
          />
        </div>

        {/* Price */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Price (USD)</label>
          <div className="relative w-32">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(Math.max(0.20, parseFloat(e.target.value) || 0))}
              step="0.01"
              min="0.20"
              className="w-full pl-7 pr-3 py-2.5 bg-white/[0.04] border border-white/[0.10] rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
            />
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Tags</label>
            <span className="text-[10px] text-white/20">{tags.length}/13</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-white/50 bg-white/[0.04] border border-white/[0.06] rounded-md"
              >
                {tag}
                <button onClick={() => removeTag(i)} className="text-white/20 hover:text-red-400 transition-colors ml-0.5">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
          {tags.length < 13 && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                placeholder="Add tag..."
                maxLength={20}
                className="flex-1 px-3 py-2 bg-white/[0.04] border border-white/[0.06] rounded-md text-white text-xs focus:outline-none focus:border-indigo-500/50 transition-all"
              />
              <button
                onClick={addTag}
                disabled={!tagInput.trim()}
                className="px-3 py-2 text-xs text-white/40 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-md transition-colors disabled:opacity-30"
              >
                Add
              </button>
            </div>
          )}
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.10] rounded-lg text-white text-[11px] leading-relaxed focus:outline-none focus:border-indigo-500/50 transition-all resize-y font-mono"
          />
        </div>

        {/* Re-run review after edits */}
        {!isApproved && (
          <button
            onClick={loadReview}
            className="text-xs text-indigo-400/70 hover:text-indigo-400 underline underline-offset-2"
          >
            Re-run review after edits
          </button>
        )}
      </div>

      {/* ── Etsy Connection Warning ── */}
      {!etsyConnected && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-3">
          <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="text-xs text-amber-300">Etsy not connected</p>
            <p className="text-[10px] text-white/30">
              Go to <a href="/settings" className="text-indigo-400 hover:text-indigo-300">Settings</a> to connect your shop.
            </p>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center justify-between">
          <p className="text-xs text-red-400">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400/40 hover:text-red-400 text-xs ml-2">dismiss</button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          ACTION BUTTONS
          ══════════════════════════════════════════════════════════ */}

      {isApproved ? (
        /* ── Approved: Show Publish Buttons ── */
        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-3">
            <button
              onClick={() => handlePublish(true)}
              disabled={!etsyConnected}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                !etsyConnected
                  ? "bg-white/10 text-white/30 cursor-not-allowed"
                  : "bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-500/10"
              }`}
            >
              Publish Live to Etsy
            </button>
            <button
              onClick={() => handlePublish(false)}
              disabled={!etsyConnected}
              className="px-5 py-3 text-sm text-white/40 hover:text-white/60 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl transition-colors disabled:opacity-30"
            >
              Draft
            </button>
            <button
              onClick={onClose}
              className="px-5 py-3 text-sm text-white/30 hover:text-white/50 transition-colors"
            >
              Cancel
            </button>
          </div>
          <p className="text-[10px] text-white/20 text-center">
            Approved — ready to publish to your Etsy shop.
          </p>
        </div>
      ) : (
        /* ── Not Approved: Show Review Actions ── */
        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-3">
            <button
              onClick={handleApprove}
              disabled={isBlocked || actionLoading}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                isBlocked
                  ? "bg-white/10 text-white/30 cursor-not-allowed"
                  : actionLoading
                    ? "bg-emerald-500/20 text-emerald-300 cursor-wait"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/10"
              }`}
            >
              {actionLoading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Approving...
                </>
              ) : isBlocked ? (
                "Blocked — Fix Issues First"
              ) : (
                "Approve for Publish"
              )}
            </button>
            <button
              onClick={handleReject}
              disabled={actionLoading}
              className="px-5 py-3 text-sm text-red-400/60 hover:text-red-400 bg-red-500/[0.04] hover:bg-red-500/[0.08] border border-red-500/10 rounded-xl transition-colors"
            >
              Reject
            </button>
            <button
              onClick={onClose}
              className="px-5 py-3 text-sm text-white/30 hover:text-white/50 transition-colors"
            >
              Cancel
            </button>
          </div>
          {isBlocked && (
            <p className="text-[10px] text-red-400/50 text-center">
              Fix {scorecard.blockReasons.length} blocking issue{scorecard.blockReasons.length !== 1 ? "s" : ""} above, then re-run review.
            </p>
          )}
          {isReview && (
            <p className="text-[10px] text-amber-400/50 text-center">
              {scorecard.warnings.length} warning{scorecard.warnings.length !== 1 ? "s" : ""} found. Review above, then approve if acceptable.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function CheckIcon({ status }: { status: "pass" | "warn" | "fail" }) {
  if (status === "pass") {
    return (
      <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
        <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  if (status === "warn") {
    return (
      <div className="w-5 h-5 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0">
        <svg className="w-3 h-3 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-5 h-5 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
      <svg className="w-3 h-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </div>
  );
}
