"use client";

// ══════════════════════════════════════════════════════════════
// TagAnalyticsTab — Etsy keyword/tag research
//
// For each tag the seller wants to evaluate, we hit the official
// Etsy v3 search endpoint with `limit=1` (we only need the `total`
// count). That gives us competition saturation — a real number,
// directly from Etsy, TOS-safe.
//
// Volume (estimated monthly searches) is not exposed by any
// official Etsy API. We label it as "unknown" and ship competition
// as the primary signal instead — a tag with 500k competing
// listings is hard to rank no matter the search volume.
// ══════════════════════════════════════════════════════════════

import { useState } from "react";

interface TagRow {
  tag: string;
  competition: number;     // Real — Etsy v3 search total
  opportunity: "high" | "medium" | "low" | "very-low" | "unknown";
  loading?: boolean;
  error?: string;
}

function scoreOpportunity(competition: number): TagRow["opportunity"] {
  if (competition === 0) return "unknown";
  if (competition < 2_000) return "high";
  if (competition < 20_000) return "medium";
  if (competition < 200_000) return "low";
  return "very-low";
}

function opportunityStyle(opp: TagRow["opportunity"]) {
  switch (opp) {
    case "high": return { dot: "bg-emerald-400", label: "Opportunity", text: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/30" };
    case "medium": return { dot: "bg-amber-400", label: "Moderate", text: "text-amber-300", bg: "bg-amber-500/10 border-amber-500/30" };
    case "low": return { dot: "bg-orange-400", label: "Crowded", text: "text-orange-300", bg: "bg-orange-500/10 border-orange-500/30" };
    case "very-low": return { dot: "bg-red-400", label: "Saturated", text: "text-red-300", bg: "bg-red-500/10 border-red-500/30" };
    default: return { dot: "bg-slate-400", label: "Unknown", text: "text-[var(--text-muted)]", bg: "bg-white/5 border-[var(--border-default)]" };
  }
}

function fmtCount(n: number): string {
  if (!isFinite(n) || n <= 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

export default function TagAnalyticsTab() {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<TagRow[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  async function lookupOne(tag: string): Promise<TagRow> {
    try {
      const r = await fetch(`/api/research/tag-score?tag=${encodeURIComponent(tag)}`);
      const j = await r.json();
      if (!r.ok) return { tag, competition: 0, opportunity: "unknown", error: j.error || `HTTP ${r.status}` };
      const competition = Number(j.count) || 0;
      return { tag, competition, opportunity: scoreOpportunity(competition) };
    } catch (err) {
      return { tag, competition: 0, opportunity: "unknown", error: err instanceof Error ? err.message : "lookup failed" };
    }
  }

  async function addTags() {
    const tags = input
      .split(/[,\n]/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length >= 2 && t.length <= 60)
      .filter((t, i, arr) => arr.indexOf(t) === i);
    if (tags.length === 0) return;

    setInput("");
    // Add placeholders so the user sees instant feedback
    const newRows: TagRow[] = tags
      .filter((t) => !rows.some((r) => r.tag === t))
      .map((t) => ({ tag: t, competition: 0, opportunity: "unknown", loading: true }));
    if (newRows.length === 0) return;
    setRows((prev) => [...newRows, ...prev]);
    setLoadingAll(true);

    // Fan out — serial with small gap to be polite to the cache-fronted
    // /api/research/tag-score endpoint (Etsy v3 backed, 1h cache).
    for (const row of newRows) {
      const result = await lookupOne(row.tag);
      setRows((prev) => prev.map((r) => (r.tag === row.tag ? result : r)));
    }
    setLoadingAll(false);
  }

  function removeRow(tag: string) {
    setRows((prev) => prev.filter((r) => r.tag !== tag));
  }

  function copyAll() {
    if (rows.length === 0) return;
    const text = rows.map((r) => r.tag).join(", ");
    navigator.clipboard.writeText(text).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    });
  }

  function exportCsv() {
    if (rows.length === 0) return;
    const lines = ['"Tag","Competition","Opportunity"'];
    for (const r of rows) {
      lines.push(`"${r.tag}",${r.competition},"${r.opportunity}"`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tag-analytics-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Counts by opportunity tier — drives the summary tiles
  const counts = rows.reduce(
    (acc, r) => {
      acc[r.opportunity] = (acc[r.opportunity] || 0) + 1;
      return acc;
    },
    {} as Record<TagRow["opportunity"], number>,
  );

  return (
    <div className="space-y-4">
      {/* ── Input panel ── */}
      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">
          Tag Research
        </div>
        <div className="text-[11px] text-[var(--text-muted)] mb-3">
          Paste up to 13 tags (Etsy&apos;s tag cap). Comma- or newline-separated. Each tag is hit against Etsy&apos;s real v3 search count — TOS-safe, no scraping.
        </div>
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addTags(); } }}
            placeholder="cute cat sticker, kawaii planner, watercolor wedding invitation, …"
            rows={3}
            className="flex-1 px-3 py-2 rounded-xl bg-[var(--bg-base)] border border-[var(--border-default)] text-[var(--text-primary)] text-[12px] focus:outline-none focus:border-amber-500/40 resize-none"
          />
          <button
            onClick={addTags}
            disabled={loadingAll || input.trim().length === 0}
            className="px-5 py-2 rounded-xl text-[13px] font-semibold bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50 transition-all flex items-center gap-2"
          >
            {loadingAll ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Looking up…
              </>
            ) : "Check competition"}
          </button>
        </div>
      </div>

      {/* ── Honesty banner ── */}
      {rows.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-[11px] text-amber-200 flex items-start gap-2">
          <span className="text-[14px] leading-none mt-0.5">ⓘ</span>
          <div>
            <span className="font-semibold">Competition counts are real.</span>
            <span className="text-amber-200/80"> Pulled from Etsy v3&apos;s search endpoint. Etsy doesn&apos;t expose per-tag monthly search volume through any official API — that&apos;s a paywalled estimate at tools like EverBee. We surface competition + opportunity tier instead.</span>
          </div>
        </div>
      )}

      {/* ── Summary tiles ── */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(["high", "medium", "low", "very-low", "unknown"] as const).map((opp) => {
            const style = opportunityStyle(opp);
            return (
              <div key={opp} className={`rounded-xl border p-3 ${style.bg}`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                  <span className={`text-[9px] uppercase tracking-widest font-semibold ${style.text}`}>{style.label}</span>
                </div>
                <div className="text-[18px] font-bold tabular-nums text-[var(--text-primary)]">{counts[opp] || 0}</div>
                <div className="text-[9px] text-[var(--text-muted)] mt-0.5">
                  {opp === "high" && "<2k competitors"}
                  {opp === "medium" && "2k–20k"}
                  {opp === "low" && "20k–200k"}
                  {opp === "very-low" && "200k+"}
                  {opp === "unknown" && "lookup failed"}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Toolbar ── */}
      {rows.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] text-[var(--text-muted)]">
            {rows.length} tag{rows.length === 1 ? "" : "s"} analyzed
          </div>
          <div className="flex gap-2">
            <button
              onClick={copyAll}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-white hover:border-amber-500/40 transition-all flex items-center gap-1.5"
            >
              {copiedAll ? "✓ Copied" : "Copy All"}
            </button>
            <button
              onClick={exportCsv}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-white hover:border-amber-500/40 transition-all flex items-center gap-1.5"
            >
              Export CSV
            </button>
            <button
              onClick={() => setRows([])}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-red-300 hover:border-red-500/40 transition-all"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* ── Results table ── */}
      {rows.length > 0 && (
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] overflow-hidden">
          <div className="grid items-center gap-3 px-4 py-2 border-b border-[var(--border-default)] bg-white/[0.02] text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold"
            style={{ gridTemplateColumns: "minmax(180px, 1fr) 140px 160px 100px 60px" }}>
            <div>Tag</div>
            <div>Competition</div>
            <div>Opportunity</div>
            <div>Quick links</div>
            <div></div>
          </div>
          {rows.map((r) => {
            const style = opportunityStyle(r.opportunity);
            return (
              <div
                key={r.tag}
                className="grid items-center gap-3 px-4 py-2.5 border-b border-[var(--border-default)] last:border-0 hover:bg-white/[0.03] transition-colors"
                style={{ gridTemplateColumns: "minmax(180px, 1fr) 140px 160px 100px 60px" }}
              >
                <div className="text-[12px] text-[var(--text-primary)] font-medium truncate" title={r.tag}>{r.tag}</div>
                <div className="text-[12px] tabular-nums text-[var(--text-secondary)]">
                  {r.loading ? (
                    <span className="inline-flex items-center gap-1.5">
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span className="text-[10px] text-[var(--text-muted)]">checking…</span>
                    </span>
                  ) : (
                    <>{fmtCount(r.competition)} listings</>
                  )}
                </div>
                <div>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${style.bg} ${style.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                    {style.label}
                  </span>
                </div>
                <div className="flex gap-1">
                  <a
                    href={`https://www.etsy.com/search?q=${encodeURIComponent(r.tag)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] px-2 py-1 rounded bg-white/5 border border-[var(--border-default)] text-[var(--text-muted)] hover:text-amber-300 hover:border-amber-500/40 transition-all"
                    title="Open on Etsy"
                  >
                    Etsy ↗
                  </a>
                  <a
                    href={`https://trends.google.com/trends/explore?q=${encodeURIComponent(r.tag)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] px-2 py-1 rounded bg-white/5 border border-[var(--border-default)] text-[var(--text-muted)] hover:text-amber-300 hover:border-amber-500/40 transition-all"
                    title="Open in Google Trends"
                  >
                    Trends ↗
                  </a>
                </div>
                <button
                  onClick={() => removeRow(r.tag)}
                  className="text-[var(--text-muted)] hover:text-red-300 text-lg leading-none px-2"
                  title="Remove"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Empty state ── */}
      {rows.length === 0 && (
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-12 text-center">
          <div className="text-[36px] mb-3">🏷️</div>
          <div className="text-[14px] text-[var(--text-primary)] font-semibold mb-2">Check tag competition</div>
          <div className="text-[11px] text-[var(--text-muted)] max-w-md mx-auto">
            Paste any tags above. Each one is hit against Etsy&apos;s real search count via the v3 API, then bucketed into an opportunity tier so you can see at a glance which tags are worth using.
          </div>
        </div>
      )}
    </div>
  );
}
