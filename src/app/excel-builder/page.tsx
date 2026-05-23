"use client";

import { useState } from "react";

const TRACKER_TYPES = [
  { id: "budget", name: "Budget Tracker", icon: "💰", desc: "Monthly income/expenses with Dashboard, 12 monthly sheets, annual summary & savings goals", sheets: "16 sheets", badge: "Best Seller" },
  { id: "habit", name: "Habit Tracker", icon: "✅", desc: "31-day grid with streaks, completion %, monthly sheets & annual summary", sheets: "14 sheets", badge: "Popular" },
  { id: "fitness", name: "Fitness Tracker", icon: "💪", desc: "Weekly workout logs, body measurements & personal records", sheets: "16 sheets", badge: null },
  { id: "business", name: "Business Income Tracker", icon: "📊", desc: "Monthly P&L, client tracker & invoice log", sheets: "16 sheets", badge: null },
  { id: "meal_planner", name: "Meal Planner", icon: "🍽️", desc: "Weekly meal plans, shopping lists, pantry inventory & recipe index", sheets: "12 sheets", badge: null },
  { id: "project", name: "Project Tracker", icon: "📋", desc: "Dashboard, task list, timeline & team management", sheets: "5 sheets", badge: null },
];

const COLOR_SCHEMES = [
  { id: "sage-green", name: "Sage Green", colors: ["#7C9A7E", "#B5C9B7", "#E8F0E8"], desc: "Nature-inspired calm" },
  { id: "dusty-rose", name: "Dusty Rose", colors: ["#C4847A", "#E8B4AE", "#F5E6E4"], desc: "Soft & feminine" },
  { id: "navy-gold", name: "Navy & Gold", colors: ["#1B3A5C", "#4A6FA5", "#C9A84C"], desc: "Professional & elegant" },
  { id: "minimal-black", name: "Minimal Black", colors: ["#1A1A1A", "#555555", "#F5F5F5"], desc: "Clean & modern" },
  { id: "lavender", name: "Lavender", colors: ["#7B68B0", "#B0A3D4", "#EDE9F6"], desc: "Calming purple tones" },
];

export default function ExcelBuilderPage() {
  const [selectedType, setSelectedType] = useState("");
  const [selectedScheme, setSelectedScheme] = useState("navy-gold");
  const [generating, setGenerating] = useState(false);
  const [downloadReady, setDownloadReady] = useState(false);
  const [error, setError] = useState("");
  const [etsyListing, setEtsyListing] = useState<{ title: string; tags: string[]; description: string; price: { recommended: number } } | null>(null);
  const [etsyLoading, setEtsyLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"download" | "etsy">("download");

  async function handleGenerate() {
    if (!selectedType) return;
    setGenerating(true);
    setError("");
    setDownloadReady(false);
    setEtsyListing(null);

    try {
      const res = await fetch("/api/excel/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackerType: selectedType, colorScheme: selectedScheme }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate Excel file");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedType}-tracker-${selectedScheme}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloadReady(true);

      generateEtsyListing();
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function generateEtsyListing() {
    setEtsyLoading(true);
    try {
      const trackerMeta = TRACKER_TYPES.find((t) => t.id === selectedType);
      const schemeMeta = COLOR_SCHEMES.find((s) => s.id === selectedScheme);
      const res = await fetch("/api/etsy/generate-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateType: selectedType + "_excel",
          features: [trackerMeta?.desc || "", `${trackerMeta?.sheets} Excel`, "Works with Excel & Google Sheets", "Instant download"],
          targetAudience: "Professionals and individuals who want organized tracking",
          aesthetic: schemeMeta?.name || "Navy & Gold",
          complexity: "medium",
          niche: "Excel tracker, spreadsheet template, Google Sheets, digital download",
          productFormat: "Excel Tracker — instant download XLSX, works with Excel and Google Sheets",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setEtsyListing(data);
        setActiveTab("etsy");
      }
    } catch {
      // optional
    } finally {
      setEtsyLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-xl shadow-lg shadow-emerald-500/20">
            📊
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Excel Tracker Generator</h1>
            <p className="text-[var(--text-secondary)] text-sm">Generate professional Excel trackers — works in Excel & Google Sheets</p>
          </div>
        </div>
      </div>

      {/* Step 1: Choose Tracker Type */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold border border-emerald-500/30">1</span>
          <h2 className="text-lg font-semibold text-white">Choose Tracker Type</h2>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {TRACKER_TYPES.map((type) => (
            <button
              key={type.id}
              onClick={() => setSelectedType(type.id)}
              className={`relative text-left p-4 rounded-xl border transition-all duration-200 group ${
                selectedType === type.id
                  ? "border-emerald-500/60 bg-emerald-950/30 shadow-lg shadow-emerald-500/10"
                  : "border-white/[0.08] bg-gradient-to-br from-[#0f0f1a]/80 to-[#161624] hover:border-white/[0.15] hover:bg-[var(--bg-hover)]"
              }`}
            >
              {type.badge && (
                <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  {type.badge}
                </span>
              )}
              <span className="text-2xl block mb-2">{type.icon}</span>
              <p className="text-sm font-semibold text-white mb-1">{type.name}</p>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">{type.desc}</p>
              <p className="text-[10px] text-[var(--text-muted)] mt-2 font-medium">{type.sheets}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: Choose Color Scheme */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold border border-emerald-500/30">2</span>
          <h2 className="text-lg font-semibold text-white">Choose Color Scheme</h2>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {COLOR_SCHEMES.map((scheme) => (
            <button
              key={scheme.id}
              onClick={() => setSelectedScheme(scheme.id)}
              className={`text-left p-4 rounded-xl border transition-all duration-200 ${
                selectedScheme === scheme.id
                  ? "border-emerald-500/60 bg-emerald-950/30"
                  : "border-white/[0.08] bg-[var(--bg-elevated)] hover:border-white/[0.15]"
              }`}
            >
              <div className="flex gap-1 mb-2">
                {scheme.colors.map((c, i) => (
                  <div key={i} className="w-6 h-6 rounded-full border border-white/10" style={{ backgroundColor: c }} />
                ))}
              </div>
              <p className="text-xs font-semibold text-white">{scheme.name}</p>
              <p className="text-[10px] text-[var(--text-muted)]">{scheme.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Generate Button */}
      <div className="mb-8">
        <button
          onClick={handleGenerate}
          disabled={!selectedType || generating}
          className={`relative w-full py-4 rounded-xl text-white font-bold text-base transition-all duration-300 ${
            !selectedType || generating
              ? "bg-white/[0.06] text-[var(--text-muted)] cursor-not-allowed"
              : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-500/20"
          }`}
        >
          {generating ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Generating Excel...
            </span>
          ) : (
            <>📊 Generate & Download Excel Tracker</>
          )}
          {!generating && selectedType && (
            <div className="absolute inset-0 rounded-xl overflow-hidden">
              <div className="shimmer-hover absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
          )}
        </button>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>

      {/* Result Section */}
      {downloadReady && (
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
          <div className="flex border-b border-white/[0.06]">
            <button
              onClick={() => setActiveTab("download")}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === "download" ? "text-white border-b-2 border-emerald-500" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              ✅ Download Complete
            </button>
            <button
              onClick={() => setActiveTab("etsy")}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === "etsy" ? "text-white border-b-2 border-emerald-500" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {etsyLoading ? "⏳ Generating..." : "🏷️ Etsy Listing"}
            </button>
          </div>

          <div className="p-6">
            {activeTab === "download" && (
              <div className="text-center py-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-3xl">✅</div>
                <h3 className="text-lg font-bold text-white mb-2">Excel File Generated!</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  Your {TRACKER_TYPES.find((t) => t.id === selectedType)?.name} has been downloaded.
                </p>
                <p className="text-xs text-[var(--text-muted)]">Works with Microsoft Excel, Google Sheets, and Apple Numbers</p>
              </div>
            )}
            {activeTab === "etsy" && (
              <div>
                {etsyLoading ? (
                  <div className="text-center py-8">
                    <svg className="animate-spin h-8 w-8 mx-auto text-emerald-400 mb-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    <p className="text-sm text-[var(--text-muted)]">Generating Etsy listing...</p>
                  </div>
                ) : etsyListing ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Title</label>
                      <p className="text-white font-medium mt-1">{etsyListing.title}</p>
                    </div>
                    <div>
                      <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Tags</label>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {etsyListing.tags?.map((tag, i) => (
                          <span key={i} className="px-2 py-0.5 text-[11px] rounded-full bg-white/[0.06] text-[var(--text-secondary)] border border-white/[0.06]">{tag}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Description</label>
                      <pre className="mt-1 text-sm text-[var(--text-secondary)] whitespace-pre-wrap font-sans leading-relaxed bg-[var(--bg-surface)] rounded-lg p-4 border border-white/[0.06] max-h-60 overflow-y-auto">{etsyListing.description}</pre>
                    </div>
                    <div>
                      <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Recommended Price</label>
                      <p className="text-2xl font-bold text-emerald-400 mt-1">${etsyListing.price?.recommended || "6.99"}</p>
                    </div>
                    <button
                      onClick={() => {
                        const text = `Title: ${etsyListing.title}\n\nTags: ${etsyListing.tags?.join(", ")}\n\nDescription:\n${etsyListing.description}`;
                        navigator.clipboard.writeText(text);
                      }}
                      className="w-full py-2 bg-emerald-500/15 border border-emerald-500/25 rounded-lg text-sm text-emerald-400 hover:bg-emerald-500/25 transition-colors font-medium"
                    >
                      📋 Copy Full Listing
                    </button>
                  </div>
                ) : (
                  <p className="text-center py-6 text-[var(--text-muted)] text-sm">Generate a file first to get an Etsy listing</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Info Cards */}
      {!downloadReady && (
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/20">
            <p className="text-emerald-400 font-semibold text-sm mb-1">💰 Avg Revenue</p>
            <p className="text-2xl font-bold text-emerald-400">$400-800<span className="text-sm font-normal text-emerald-400/50">/mo</span></p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">Excel trackers are high-value products</p>
          </div>
          <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-500/20">
            <p className="text-blue-400 font-semibold text-sm mb-1">📊 Output</p>
            <p className="text-white font-bold text-lg">.XLSX File</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">Excel + Google Sheets compatible</p>
          </div>
          <div className="p-4 rounded-xl bg-violet-950/30 border border-violet-500/20">
            <p className="text-violet-400 font-semibold text-sm mb-1">✨ Features</p>
            <p className="text-white font-bold text-lg">Formulas Included</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">Auto-sum, conditional formatting, charts</p>
          </div>
        </div>
      )}
    </div>
  );
}
