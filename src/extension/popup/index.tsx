// ══════════════════════════════════════════════════════════════════════
// CraftPlan Research — Popup Entry
//
// Two-tab popup: Capture (default) shows live Marketplace Insights
// capture state + quick links; Settings is a slim config pane for the
// localhost URL. The old POD-scanner-focused popup was retired
// alongside its content scripts.
// ══════════════════════════════════════════════════════════════════════

import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CapturePanel } from "./CapturePanel";
import { SettingsPanel } from "./SettingsPanel";

type Tab = "capture" | "settings";

// ── Brand colors (amber on dark, matching /research) ──────────────────
const BRAND = {
  primary: "#f59e0b",
  primarySoft: "rgba(245,158,11,0.15)",
  primaryBorder: "rgba(245,158,11,0.35)",
  bg: "#0a0a0f",
  bgElevated: "rgba(255,255,255,0.03)",
  text: "#e5e7eb",
  textMuted: "rgba(229,231,235,0.55)",
  border: "rgba(255,255,255,0.08)",
};

function PopupApp() {
  const [activeTab, setActiveTab] = useState<Tab>("capture");

  return (
    <div style={{ minHeight: 460, display: "flex", flexDirection: "column" }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        style={{
          padding: "14px 14px 12px",
          background:
            "linear-gradient(135deg, rgba(245,158,11,0.10), rgba(99,102,241,0.06))",
          borderBottom: `1px solid ${BRAND.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Glyph: layered amber bars suggesting a chart / signal */}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: `linear-gradient(135deg, ${BRAND.primary}, #fbbf24)`,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              padding: "5px 7px",
              gap: 3,
              boxShadow: "0 2px 8px rgba(245,158,11,0.35)",
            }}
            aria-hidden
          >
            {[14, 22, 10, 18].map((h, i) => (
              <div
                key={i}
                style={{
                  width: 3,
                  height: h,
                  background: "rgba(10,10,15,0.85)",
                  borderRadius: 2,
                }}
              />
            ))}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>
              CraftPlan Research
            </div>
            <div style={{ fontSize: 10.5, color: BRAND.textMuted }}>
              Real-demand capture · Marketplace Insights
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab bar ────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          borderBottom: `1px solid ${BRAND.border}`,
          background: "rgba(255,255,255,0.015)",
        }}
      >
        {(
          [
            { key: "capture", label: "Capture", icon: "🛒" },
            { key: "settings", label: "Settings", icon: "⚙️" },
          ] as Array<{ key: Tab; label: string; icon: string }>
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              flex: 1,
              padding: "9px 0",
              border: "none",
              background: "transparent",
              color: activeTab === t.key ? BRAND.primary : BRAND.textMuted,
              borderBottom:
                activeTab === t.key
                  ? `2px solid ${BRAND.primary}`
                  : "2px solid transparent",
              cursor: "pointer",
              fontSize: 11.5,
              fontWeight: 600,
              transition: "color 0.15s, border-color 0.15s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 13 }}>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── Content ────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {activeTab === "capture" && <CapturePanel />}
        {activeTab === "settings" && <SettingsPanel />}
      </div>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <div
        style={{
          padding: "7px 14px",
          borderTop: `1px solid ${BRAND.border}`,
          fontSize: 10,
          color: BRAND.textMuted,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>v2.0.0 · Etsy Plus required</span>
        <span style={{ color: BRAND.primary }}>● connected</span>
      </div>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<PopupApp />);
}
