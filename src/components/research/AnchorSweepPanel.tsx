"use client";

// ══════════════════════════════════════════════════════════════════════
// AnchorSweepPanel — curated digital-product sweep over Marketplace Insights
//
// Why this exists: Etsy has no "Digital Products" top-level category, so
// the auto-captured grid data is a mix of physical + digital terms. To
// build a clean buyer-demand signal across the full DIGITAL surface, we
// need to search Marketplace Insights for each major digital niche
// anchor (~42 terms curated in src/lib/digital-anchors.ts) and let the
// Phase-6 detail-page scanner capture the rich per-term data.
//
// UI: a collapsible panel above the Insights freshness banner showing:
//   • "X / 42 covered" progress
//   • Per-niche groups (planners, patterns, wall art, cut files, ...)
//   • Each anchor as a button. Uncovered: "Search →" (opens in new tab).
//     Covered: "✓ captured · 38.5k searches · +6.4% · 9.1M results"
//
// Auto-refreshes coverage every 8s while open so newly-captured anchors
// flip to ✓ without the user reloading.
// ══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import {
  DIGITAL_ANCHORS,
  NICHE_LABELS,
  groupAnchorsByNiche,
  anchorSearchUrl,
  type AnchorNiche,
} from "@/lib/digital-anchors";

interface AnchorRow {
  term: string;
  normalized: string;
  niche: AnchorNiche;
  factoryHint: string;
  covered: boolean;
  capturedAt: string | null;
  monthlySearches: number | null;
  growthPct: number | null;
  searchResults: number | null;
  captureType: string | null;
}

interface CoverageResponse {
  total: number;
  covered: number;
  anchors: AnchorRow[];
}

// ── Helpers ───────────────────────────────────────────────────────────

/** "38500" → "38.5k". Concise display format for the inline metric. */
function fmtCount(n: number | null): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtGrowth(pct: number | null): string {
  if (pct === null || pct === undefined) return "";
  const sign = pct >= 0 ? "+" : "";
  return ` ${sign}${pct.toFixed(1)}%`;
}

// ── Component ─────────────────────────────────────────────────────────

export default function AnchorSweepPanel() {
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [openingAll, setOpeningAll] = useState(false);

  const fetchCoverage = useCallback(async () => {
    try {
      const r = await fetch("/api/research/anchor-coverage");
      if (!r.ok) return;
      const json = (await r.json()) as CoverageResponse;
      setCoverage(json);
    } catch {
      /* silent */
    }
  }, []);

  // Initial fetch + auto-refresh every 8s while panel is open
  useEffect(() => {
    fetchCoverage();
  }, [fetchCoverage]);

  useEffect(() => {
    if (!expanded) return;
    const id = setInterval(fetchCoverage, 8000);
    return () => clearInterval(id);
  }, [expanded, fetchCoverage]);

  // ── Render ──
  const total = coverage?.total ?? DIGITAL_ANCHORS.length;
  const covered = coverage?.covered ?? 0;
  const groupedAnchors = groupAnchorsByNiche();
  const coverageByNormalized = new Map<string, AnchorRow>();
  for (const a of coverage?.anchors ?? []) {
    coverageByNormalized.set(a.normalized, a);
  }

  // Compose the progress-bar fill ratio + tier color
  const ratio = total > 0 ? covered / total : 0;
  const fillColor =
    ratio >= 0.7 ? "#86efac" : ratio >= 0.3 ? "#fbbf24" : "#9ca3af";

  function openUncoveredBatch(maxTabs = 5) {
    // Open the next N uncovered anchors in new tabs. Capped at maxTabs
    // so we don't spam Chrome. Spaced 250ms apart so the user can see
    // each opening (and so Etsy doesn't get 5 simultaneous loads from
    // the same session — though they would still be from the user's
    // authenticated browser, so behaviorally normal).
    setOpeningAll(true);
    const uncovered = (coverage?.anchors ?? []).filter((a) => !a.covered).slice(0, maxTabs);
    uncovered.forEach((a, i) => {
      setTimeout(() => {
        window.open(anchorSearchUrl(a.term), "_blank", "noopener,noreferrer");
        if (i === uncovered.length - 1) setOpeningAll(false);
      }, i * 250);
    });
  }

  return (
    <div
      style={{
        marginBottom: 10,
        padding: "10px 12px",
        background: "rgba(99, 102, 241, 0.06)",
        border: "1px solid rgba(99, 102, 241, 0.25)",
        borderRadius: 10,
        fontSize: 12,
        color: "#d1d5db",
      }}
    >
      {/* ── Header row (always visible) ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 16 }}>🎯</span>
        <span style={{ fontWeight: 600, color: "#c7d2fe" }}>Digital Anchor Sweep</span>
        <span style={{ color: "#9ca3af" }}>·</span>
        <span>
          <strong style={{ color: fillColor }}>{covered}</strong>
          <span style={{ color: "#9ca3af" }}> / {total}</span> covered
        </span>

        {/* mini progress bar */}
        <div
          style={{
            position: "relative",
            flex: 1,
            height: 4,
            maxWidth: 180,
            background: "rgba(255,255,255,0.08)",
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: `${Math.round(ratio * 100)}%`,
              background: fillColor,
              borderRadius: 4,
              transition: "width 0.3s",
            }}
          />
        </div>

        <button
          onClick={() => openUncoveredBatch(5)}
          disabled={openingAll || covered >= total}
          style={{
            padding: "5px 10px",
            background: "rgba(99,102,241,0.2)",
            border: "1px solid rgba(99,102,241,0.4)",
            borderRadius: 6,
            color: "#c7d2fe",
            fontSize: 11,
            fontWeight: 600,
            cursor: openingAll || covered >= total ? "default" : "pointer",
            opacity: openingAll || covered >= total ? 0.5 : 1,
          }}
          title="Opens the next 5 uncovered anchors in new tabs. The Chrome extension auto-captures each."
        >
          {openingAll ? "Opening…" : covered >= total ? "All covered ✓" : "Sweep next 5 →"}
        </button>

        <button
          onClick={() => setExpanded((s) => !s)}
          style={{
            padding: "5px 8px",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 6,
            color: "#9ca3af",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>

      {/* ── Subtitle ── */}
      {!expanded && (
        <div style={{ marginTop: 6, color: "#9ca3af", fontSize: 11 }}>
          Etsy has no &ldquo;digital products&rdquo; category — digital wares are scattered across all 15 of its top-level categories. This sweeps ~{total} curated anchor terms to capture buyer-search volume across every major digital niche.
        </div>
      )}

      {/* ── Expanded body: groups of anchor buttons ── */}
      {expanded && (
        <div style={{ marginTop: 10 }}>
          {(Object.keys(groupedAnchors) as AnchorNiche[]).map((niche) => {
            const items = groupedAnchors[niche];
            const nicheCovered = items.filter(
              (a) => coverageByNormalized.get(coverageByNormalized.keys().next().value ?? "")?.covered,
            ).length; // recomputed below

            // recompute properly using a Set of normalized strings
            const coveredCount = items.filter((a) => {
              const norm = a.term
                .toLowerCase()
                .replace(/[^\p{L}\p{N}\s]/gu, " ")
                .replace(/\s+/g, " ")
                .trim()
                .split(" ")
                .map((w) =>
                  w.length > 3 && w.endsWith("s") && !w.endsWith("ss")
                    ? w.slice(0, -1)
                    : w,
                )
                .join(" ");
              return !!coverageByNormalized.get(norm)?.covered;
            }).length;

            return (
              <div key={niche} style={{ marginTop: 8 }}>
                <div
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    color: "#9ca3af",
                    marginBottom: 4,
                    fontWeight: 600,
                  }}
                >
                  {NICHE_LABELS[niche].emoji} {NICHE_LABELS[niche].label}
                  <span style={{ marginLeft: 6, color: "#6b7280", fontWeight: 400 }}>
                    ({coveredCount}/{items.length})
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {items.map((a) => {
                    const norm = a.term
                      .toLowerCase()
                      .replace(/[^\p{L}\p{N}\s]/gu, " ")
                      .replace(/\s+/g, " ")
                      .trim()
                      .split(" ")
                      .map((w) =>
                        w.length > 3 && w.endsWith("s") && !w.endsWith("ss")
                          ? w.slice(0, -1)
                          : w,
                      )
                      .join(" ");
                    const row = coverageByNormalized.get(norm);
                    const isCovered = !!row?.covered;
                    return (
                      <a
                        key={a.term}
                        href={anchorSearchUrl(a.term)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "4px 9px",
                          background: isCovered
                            ? "rgba(34,197,94,0.12)"
                            : "rgba(255,255,255,0.05)",
                          border: `1px solid ${
                            isCovered
                              ? "rgba(34,197,94,0.35)"
                              : "rgba(255,255,255,0.1)"
                          }`,
                          borderRadius: 6,
                          color: isCovered ? "#86efac" : "#d1d5db",
                          fontSize: 11,
                          textDecoration: "none",
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                        title={
                          isCovered
                            ? `Captured ${row?.monthlySearches?.toLocaleString() ?? "?"} mo. searches${row?.growthPct !== null && row?.growthPct !== undefined ? `, ${row.growthPct > 0 ? "+" : ""}${row.growthPct.toFixed(1)}% growth` : ""}. Click to re-capture (newer data).`
                            : `Opens Etsy Marketplace Insights for "${a.term}" in a new tab. The extension auto-captures.`
                        }
                      >
                        <span>{isCovered ? "✓" : "·"}</span>
                        <span>{a.term}</span>
                        {isCovered && row?.monthlySearches !== null && (
                          <span
                            style={{
                              color: "rgba(134, 239, 172, 0.7)",
                              fontWeight: 500,
                            }}
                          >
                            {fmtCount(row?.monthlySearches ?? null)}
                            {fmtGrowth(row?.growthPct ?? null)}
                          </span>
                        )}
                      </a>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
