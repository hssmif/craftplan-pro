"use client";

// ══════════════════════════════════════════════════════════════
// DevRestartButton — floating bottom-right widget, dev-only.
//
// Renders in NODE_ENV === "development" only. Provides:
//  • One-click restart of the Next.js dev server (touches
//    next.config.ts → Next detects config change → full restart).
//  • Polls /api/dev/restart (GET health-check) until the server
//    comes back, then auto-reloads the page so the user lands on
//    a fresh build.
//
// Useful when a webpack/turbopack module-resolution error keeps
// showing the "stale" badge even though the source is fixed.
// ══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";

type Phase = "idle" | "restarting" | "waiting" | "back";

export default function DevRestartButton() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [open, setOpen] = useState(false);

  // ── Guard: only render in development. We check the env var
  //    at module scope so the production build tree-shakes us out.
  const isDev = process.env.NODE_ENV === "development";

  useEffect(() => {
    if (phase !== "waiting") return;
    let cancelled = false;
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      try {
        const r = await fetch("/api/dev/restart", { cache: "no-store" });
        if (r.ok && !cancelled) {
          setPhase("back");
          clearInterval(interval);
          // Give Next a moment to finish HMR, then reload
          setTimeout(() => {
            if (!cancelled) window.location.reload();
          }, 800);
        }
      } catch {
        /* server still booting — keep polling */
      }
      // Safety: stop polling after ~60s
      if (attempts > 60 && !cancelled) {
        setPhase("idle");
        clearInterval(interval);
      }
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [phase]);

  async function handleRestart() {
    if (phase === "restarting" || phase === "waiting") return;
    setPhase("restarting");
    try {
      const r = await fetch("/api/dev/restart", { method: "POST" });
      if (r.ok) {
        setPhase("waiting");
      } else {
        setPhase("idle");
      }
    } catch {
      // Server probably already restarting — flip to waiting anyway
      setPhase("waiting");
    }
  }

  if (!isDev) return null;

  // ── Collapsed state — tiny dot bottom-right ──
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Restart dev server"
        aria-label="Restart dev server"
        style={{
          position: "fixed",
          bottom: 8,
          right: 8,
          zIndex: 99997,
          width: 18,
          height: 18,
          borderRadius: 999,
          background: "rgba(245, 158, 11, 0.7)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.15)",
          padding: 0,
          fontSize: 0,
          lineHeight: 0,
          cursor: "pointer",
          boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
          opacity: 0.5,
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.5"; }}
      />
    );
  }

  // ── Expanded state — compact popover ──
  return (
    <div
      style={{
        position: "fixed",
        bottom: 8,
        right: 8,
        zIndex: 99997,
        background: "rgba(15, 17, 23, 0.95)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 8,
        padding: 6,
        minWidth: 168,
        color: "#e5e7eb",
        fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
        fontSize: 11,
        boxShadow: "0 8px 20px rgba(0,0,0,0.5)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      <button
        onClick={handleRestart}
        disabled={phase === "restarting" || phase === "waiting"}
        style={{
          flex: 1,
          padding: "5px 8px",
          borderRadius: 5,
          border: "1px solid rgba(245, 158, 11, 0.3)",
          background:
            phase === "back"
              ? "rgba(16, 185, 129, 0.2)"
              : phase === "restarting" || phase === "waiting"
                ? "rgba(245, 158, 11, 0.15)"
                : "rgba(245, 158, 11, 0.2)",
          color: phase === "back" ? "#86efac" : "#fbbf24",
          fontWeight: 600,
          fontSize: 10,
          cursor: phase === "idle" ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
        }}
      >
        {phase === "idle" && <span>🔄 Restart server</span>}
        {phase === "restarting" && (<><Spinner /><span>Triggering…</span></>)}
        {phase === "waiting" && (<><Spinner /><span>Waiting…</span></>)}
        {phase === "back" && <span>✓ Back — reloading</span>}
      </button>
      <button
        onClick={() => setOpen(false)}
        aria-label="Close"
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.4)",
          cursor: "pointer",
          fontSize: 14,
          lineHeight: 1,
          padding: "0 4px",
        }}
      >
        ×
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" style={{ animation: "cp-spin 1s linear infinite" }}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.25" />
      <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="3" fill="none" />
      <style>{`@keyframes cp-spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}
