// ══════════════════════════════════════════════════════════════════════
// SettingsPanel — popup config view
//
// Single setting today: the CraftPlan dev-server URL. Used by the
// capture panel to fetch live insights state, and by the background
// service worker as the base for SEND_TO_DIGITAL_STUDIO redirects.
//
// Test button hits /api/health on the configured host to verify
// connectivity (returns {ok:true} when the Next.js app is up).
// ══════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from "react";

const BRAND = {
  primary: "#f59e0b",
  primarySoft: "rgba(245,158,11,0.18)",
  primaryBorder: "rgba(245,158,11,0.4)",
  textMuted: "rgba(229,231,235,0.55)",
  border: "rgba(255,255,255,0.08)",
};

export function SettingsPanel() {
  const [url, setUrl] = useState("http://localhost:3461");
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.local.get("craftplanUrl", (data: Record<string, string>) => {
      if (data.craftplanUrl) setUrl(data.craftplanUrl);
    });
  }, []);

  const handleSave = () => {
    chrome.storage.local.set({ craftplanUrl: url.trim() }, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  const handleTest = async () => {
    setTesting(true);
    setStatus("idle");
    try {
      const resp = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(5000) });
      const data = await resp.json();
      setStatus(data.ok ? "ok" : "error");
    } catch {
      setStatus("error");
    }
    setTesting(false);
  };

  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ── URL setting ── */}
      <div
        style={{
          padding: "12px 12px 14px",
          background: "rgba(255,255,255,0.03)",
          border: `1px solid ${BRAND.border}`,
          borderRadius: 10,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: BRAND.textMuted,
            marginBottom: 6,
          }}
        >
          CraftPlan server URL
        </div>
        <div style={{ fontSize: 10.5, color: BRAND.textMuted, marginBottom: 8 }}>
          Where this extension POSTs captured data and where the
          popup&apos;s &ldquo;Open Research&rdquo; / &ldquo;Open Factory&rdquo; links go. Default is
          localhost:3461 for local dev.
        </div>

        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://localhost:3461"
          style={{
            width: "100%",
            padding: "7px 10px",
            borderRadius: 6,
            border: `1px solid ${BRAND.border}`,
            background: "rgba(255,255,255,0.04)",
            color: "#fff",
            fontSize: 12,
            outline: "none",
          }}
        />

        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button
            onClick={handleSave}
            style={{
              flex: 1,
              padding: "6px 10px",
              borderRadius: 6,
              border: `1px solid ${BRAND.primaryBorder}`,
              background: BRAND.primarySoft,
              color: "#fbbf24",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {saved ? "✓ Saved" : "Save"}
          </button>
          <button
            onClick={handleTest}
            disabled={testing}
            style={{
              flex: 1,
              padding: "6px 10px",
              borderRadius: 6,
              border: `1px solid ${BRAND.border}`,
              background: "rgba(255,255,255,0.04)",
              color: "#e5e7eb",
              fontSize: 11,
              fontWeight: 600,
              cursor: testing ? "wait" : "pointer",
              opacity: testing ? 0.6 : 1,
            }}
          >
            {testing ? "Testing…" : "Test"}
          </button>
        </div>

        {status !== "idle" && (
          <div
            style={{
              marginTop: 8,
              padding: "5px 8px",
              borderRadius: 5,
              fontSize: 10.5,
              background:
                status === "ok" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
              border: `1px solid ${
                status === "ok" ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"
              }`,
              color: status === "ok" ? "#86efac" : "#fca5a5",
            }}
          >
            {status === "ok" ? "✓ Connection healthy" : "✗ Couldn't reach server"}
          </div>
        )}
      </div>

      {/* ── About card ── */}
      <div
        style={{
          padding: "12px",
          background: "rgba(255,255,255,0.02)",
          border: `1px solid ${BRAND.border}`,
          borderRadius: 10,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: BRAND.textMuted,
            marginBottom: 6,
          }}
        >
          About
        </div>
        <div style={{ fontSize: 10.5, color: BRAND.textMuted, lineHeight: 1.5 }}>
          This extension reads only your authenticated Marketplace Insights
          dashboard and posts the visible data to your own CraftPlan
          instance. No background polling of Etsy. No spoofed sessions.
          Same TOS-safe model your other research tools use.
        </div>
      </div>
    </div>
  );
}
