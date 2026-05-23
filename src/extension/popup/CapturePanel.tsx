// ══════════════════════════════════════════════════════════════════════
// CapturePanel — popup main view
//
// Shows the live state of Marketplace Insights capture pulled from
// the local Next.js app at the configured craftplanUrl. Three sections:
//
//   1. CAPTURE STATUS
//      - Last sync timestamp + freshness tier (fresh/ok/stale)
//      - Categories covered + total captures
//      - Mini progress bar
//
//   2. ANCHOR SWEEP PROGRESS
//      - "X / 42 covered" for the curated digital-anchor catalog
//      - Mini progress bar
//
//   3. QUICK ACTIONS
//      - Open Marketplace Insights (Etsy)
//      - Open /research (CraftPlan)
//      - Open /research (Anchor Sweep — auto-expands the sweep panel)
//
// Polls every 6s while the popup is open. Cheap fetch — just two GETs
// against local routes that read from SQLite. Returns gracefully when
// the Next.js app is offline (shows the offline banner instead).
// ══════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from "react";

interface InsightsSummary {
  total: number;
  mostRecentCapturedAt: string | null;
  byCategory: Array<{ category: string; count: number; max_captured_at: string }>;
}

interface CoverageSummary {
  total: number;
  covered: number;
}

const BRAND = {
  primary: "#f59e0b",
  primarySoft: "rgba(245,158,11,0.12)",
  primaryBorder: "rgba(245,158,11,0.32)",
  textMuted: "rgba(229,231,235,0.5)",
  border: "rgba(255,255,255,0.08)",
  fresh: "#86efac",
  ok: "#fbbf24",
  stale: "#fca5a5",
};

// ── Humanize ISO → "5m ago" / "2h ago" / "3d ago" / "never" ───────────
function humanizeAge(iso: string | null): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "never";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return "just now";
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function tierColor(iso: string | null): { color: string; label: string } {
  if (!iso) return { color: BRAND.textMuted, label: "empty" };
  const ageHr = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (ageHr < 24) return { color: BRAND.fresh, label: "fresh" };
  if (ageHr < 24 * 7) return { color: BRAND.ok, label: "ok" };
  return { color: BRAND.stale, label: "stale" };
}

const ETSY_INSIGHTS_URL = "https://www.etsy.com/your/shops/me/marketplace-insights";

export function CapturePanel() {
  const [insights, setInsights] = useState<InsightsSummary | null>(null);
  const [coverage, setCoverage] = useState<CoverageSummary | null>(null);
  const [baseUrl, setBaseUrl] = useState<string>("http://localhost:3461");
  const [offline, setOffline] = useState(false);

  // Pull craftplanUrl from extension storage so we hit the right host.
  useEffect(() => {
    chrome.storage.local.get("craftplanUrl", (data: Record<string, string>) => {
      if (data.craftplanUrl) setBaseUrl(data.craftplanUrl);
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [iResp, cResp] = await Promise.all([
        fetch(`${baseUrl}/api/research/insights-capture?limit=1`),
        fetch(`${baseUrl}/api/research/anchor-coverage`),
      ]);
      if (!iResp.ok || !cResp.ok) {
        setOffline(true);
        return;
      }
      const iJson = await iResp.json();
      const cJson = await cResp.json();
      setInsights({
        total: iJson.total ?? 0,
        mostRecentCapturedAt: iJson.mostRecentCapturedAt ?? null,
        byCategory: iJson.byCategory ?? [],
      });
      setCoverage({ total: cJson.total ?? 0, covered: cJson.covered ?? 0 });
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [baseUrl]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 6000);
    return () => clearInterval(id);
  }, [refresh]);

  // ── Render ──────────────────────────────────────────────────────────
  const lastSync = insights?.mostRecentCapturedAt ?? null;
  const tier = tierColor(lastSync);
  const totalCaptures = insights?.total ?? 0;
  const catCount = insights?.byCategory.length ?? 0;
  const cov = coverage?.covered ?? 0;
  const covTotal = coverage?.total ?? 42;
  const covRatio = covTotal > 0 ? cov / covTotal : 0;

  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ── Offline banner ── */}
      {offline && (
        <div
          style={{
            padding: "8px 10px",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 8,
            color: "#fca5a5",
            fontSize: 11,
          }}
        >
          ⚠️ Can&rsquo;t reach <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: 3 }}>{baseUrl}</code>. Start the CraftPlan dev server, then this panel updates automatically.
        </div>
      )}

      {/* ── Capture Status card ── */}
      <Card title="Capture status" subtitle={offline ? "—" : `${humanizeAge(lastSync)} · ${tier.label}`}>
        <div style={{ display: "flex", gap: 18, marginTop: 6 }}>
          <Stat label="Captures" value={offline ? "—" : totalCaptures.toLocaleString()} accent={tier.color} />
          <Stat label="Categories" value={offline ? "—" : `${catCount}/15`} accent={BRAND.primary} />
          <Stat
            label="Last sync"
            value={offline ? "—" : humanizeAge(lastSync)}
            accent={tier.color}
          />
        </div>
      </Card>

      {/* ── Anchor Sweep card ── */}
      <Card
        title="Digital anchor sweep"
        subtitle={offline ? "—" : `${cov} / ${covTotal} covered`}
      >
        <ProgressBar ratio={covRatio} color={covRatio >= 0.7 ? BRAND.fresh : covRatio >= 0.3 ? BRAND.ok : BRAND.textMuted} />
        <div style={{ marginTop: 6, color: BRAND.textMuted, fontSize: 10.5 }}>
          Etsy hides digital products across all 15 of its top categories.
          The sweep covers them with curated anchor searches — each one
          you visit auto-captures via this extension.
        </div>
      </Card>

      {/* ── Actions ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <ActionButton
          href={ETSY_INSIGHTS_URL}
          icon="🛒"
          label="Open Marketplace Insights"
          sublabel="etsy.com · auto-capture on every category"
          primary
        />
        <ActionButton
          href={`${baseUrl}/research?tab=ideas`}
          icon="💡"
          label="Open Research → Ideas"
          sublabel={offline ? "(server offline)" : "see corroborated demand"}
        />
        <ActionButton
          href={`${baseUrl}/factory`}
          icon="🏭"
          label="Open Product Factory"
          sublabel={offline ? "(server offline)" : "build from a captured listing"}
        />
      </div>
    </div>
  );
}

// ─── Small composable bits ────────────────────────────────────────────

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${BRAND.border}`,
        borderRadius: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: BRAND.textMuted,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 10.5, color: BRAND.textMuted }}>{subtitle}</div>
        )}
      </div>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: accent || "#fff", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 9.5, color: BRAND.textMuted, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </div>
    </div>
  );
}

function ProgressBar({ ratio, color }: { ratio: number; color: string }) {
  return (
    <div
      style={{
        position: "relative",
        height: 5,
        background: "rgba(255,255,255,0.06)",
        borderRadius: 4,
        overflow: "hidden",
        marginTop: 4,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          width: `${Math.max(0, Math.min(100, Math.round(ratio * 100)))}%`,
          background: color,
          borderRadius: 4,
          transition: "width 0.3s",
        }}
      />
    </div>
  );
}

function ActionButton({
  href,
  icon,
  label,
  sublabel,
  primary,
}: {
  href: string;
  icon: string;
  label: string;
  sublabel?: string;
  primary?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 11px",
        borderRadius: 8,
        textDecoration: "none",
        background: primary ? BRAND.primarySoft : "rgba(255,255,255,0.025)",
        border: `1px solid ${primary ? BRAND.primaryBorder : BRAND.border}`,
        color: primary ? "#fbbf24" : "#e5e7eb",
        transition: "background 0.12s, border-color 0.12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = primary
          ? "rgba(245,158,11,0.2)"
          : "rgba(255,255,255,0.05)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = primary
          ? BRAND.primarySoft
          : "rgba(255,255,255,0.025)";
      }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
        {sublabel && (
          <div style={{ fontSize: 10, color: BRAND.textMuted, marginTop: 1 }}>
            {sublabel}
          </div>
        )}
      </div>
      <span style={{ color: BRAND.textMuted, fontSize: 13 }}>→</span>
    </a>
  );
}
