"use client";

import { useState } from "react";

const PRINTABLE_TYPES = [
  { id: "quote_prints", name: "Quote Prints", icon: "✨", desc: "5 motivational quote pages with decorative typography & borders", pages: "5 pages", badge: "Best Seller" },
  { id: "habit_tracker", name: "Habit Tracker", icon: "✅", desc: "30-day habit grid + monthly review page", pages: "2 pages", badge: null },
  { id: "gratitude_journal", name: "Gratitude Journal", icon: "🙏", desc: "30-day gratitude journal with daily prompts & mood tracking", pages: "32 pages", badge: "Popular" },
  { id: "goal_worksheet", name: "Goal Setting Worksheet", icon: "🎯", desc: "Annual vision, quarterly goals, action plan & weekly review", pages: "4 pages", badge: null },
  { id: "meal_planner", name: "Meal Planner", icon: "🍽️", desc: "Weekly meal grid with shopping list", pages: "2 pages", badge: null },
  { id: "budget_worksheet", name: "Budget Worksheet", icon: "💰", desc: "One-page monthly budget with income, expenses & savings", pages: "1 page", badge: null },
];

const COLOR_SCHEMES = [
  { id: "sage-green", name: "Sage Green", colors: ["#7C9A7E", "#B5C9B7", "#E8F0E8"], desc: "Nature-inspired calm" },
  { id: "dusty-rose", name: "Dusty Rose", colors: ["#C4847A", "#E8B4AE", "#F5E6E4"], desc: "Soft & feminine" },
  { id: "navy-gold", name: "Navy & Gold", colors: ["#1B3A5C", "#4A6FA5", "#C9A84C"], desc: "Professional & elegant" },
  { id: "minimal-black", name: "Minimal Black", colors: ["#1A1A1A", "#555555", "#F5F5F5"], desc: "Clean & modern" },
  { id: "lavender", name: "Lavender", colors: ["#7B68B0", "#B0A3D4", "#EDE9F6"], desc: "Calming purple tones" },
];

const QUOTE_THEMES = [
  { id: "motivation", label: "Motivation & Success" },
  { id: "self_love", label: "Self Love & Confidence" },
  { id: "mindfulness", label: "Mindfulness & Peace" },
  { id: "hustle", label: "Hustle & Entrepreneurship" },
  { id: "gratitude", label: "Gratitude & Positivity" },
];

export default function PrintableBuilderPage() {
  const [selectedType, setSelectedType] = useState("");
  const [selectedScheme, setSelectedScheme] = useState("dusty-rose");
  const [selectedQuoteTheme, setSelectedQuoteTheme] = useState("motivation");
  const [customQuotes, setCustomQuotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [downloadReady, setDownloadReady] = useState(false);
  const [error, setError] = useState("");
  const [etsyListing, setEtsyListing] = useState<{ title: string; tags: string[]; description: string; price: { recommended: number } } | null>(null);
  const [etsyLoading, setEtsyLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"download" | "etsy">("download");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function handleGenerate() {
    if (!selectedType) return;
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setGenerating(true);
    setError("");
    setDownloadReady(false);
    setEtsyListing(null);

    try {
      // Build quotes array for quote prints
      let quotes: string[] | undefined;
      if (selectedType === "quote_prints") {
        if (customQuotes.trim()) {
          quotes = customQuotes.split("\n").filter((q) => q.trim()).slice(0, 5);
        } else {
          // Default quotes by theme
          const themeQuotes: Record<string, string[]> = {
            motivation: [
              "Start where you are. Use what you have. Do what you can.",
              "The secret of getting ahead is getting started.",
              "Every day is a fresh start.",
              "Small steps every day lead to big changes.",
              "You are capable of amazing things.",
            ],
            self_love: [
              "You are enough, just as you are.",
              "Be yourself. Everyone else is already taken.",
              "Fall in love with taking care of yourself.",
              "You deserve the love you keep giving others.",
              "Your only limit is the doubt in your mind.",
            ],
            mindfulness: [
              "Be present. Be grateful. Be kind.",
              "Breathe in peace. Breathe out stress.",
              "The present moment is all we ever have.",
              "Let go of what you cannot control.",
              "Silence is where wisdom grows.",
            ],
            hustle: [
              "Dream big. Start small. Act now.",
              "Your future is created by what you do today.",
              "Doubt kills more dreams than failure ever will.",
              "Stay focused. Stay humble. Stay hungry.",
              "Success is built one day at a time.",
            ],
            gratitude: [
              "Gratitude turns what we have into enough.",
              "Today is a beautiful day to be alive.",
              "Find joy in the ordinary moments.",
              "A grateful heart is a magnet for miracles.",
              "Happiness is found in appreciating what you have.",
            ],
          };
          quotes = themeQuotes[selectedQuoteTheme] || themeQuotes.motivation;
        }
      }

      const res = await fetch("/api/printable/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printableType: selectedType, colorScheme: selectedScheme, quotes }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate printable");
      }

      const blob = await res.blob();
      // Create preview URL
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedType}-${selectedScheme}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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
      const printableMeta = PRINTABLE_TYPES.find((p) => p.id === selectedType);
      const schemeMeta = COLOR_SCHEMES.find((s) => s.id === selectedScheme);
      const res = await fetch("/api/etsy/generate-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateType: selectedType + "_printable",
          features: [printableMeta?.desc || "", `${printableMeta?.pages} PDF`, "Print at home", "Instant download", "A4 & Letter size"],
          targetAudience: "Women 20-40 who love aesthetic printables and journaling",
          aesthetic: schemeMeta?.name || "Dusty Rose",
          complexity: "simple",
          niche: "printable, wall art, journal, planner, digital download, print at home",
          productFormat: "Printable PDF — instant download, print at home, multiple sizes available",
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
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-violet-500 flex items-center justify-center text-xl shadow-lg shadow-pink-500/20">
            🎨
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Printable & Wall Art Generator</h1>
            <p className="text-[var(--text-secondary)] text-sm">Generate beautiful printable PDFs — journals, quotes, planners & worksheets</p>
          </div>
        </div>
      </div>

      {/* Step 1: Choose Printable Type */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center text-xs font-bold border border-pink-500/30">1</span>
          <h2 className="text-lg font-semibold text-white">Choose Printable Type</h2>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {PRINTABLE_TYPES.map((type) => (
            <button
              key={type.id}
              onClick={() => setSelectedType(type.id)}
              className={`relative text-left p-4 rounded-xl border transition-all duration-200 group ${
                selectedType === type.id
                  ? "border-pink-500/60 bg-pink-950/30 shadow-lg shadow-pink-500/10"
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
              <p className="text-[10px] text-[var(--text-muted)] mt-2 font-medium">{type.pages}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Quote Options (only for quote_prints) */}
      {selectedType === "quote_prints" && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center text-xs font-bold border border-pink-500/30">✨</span>
            <h2 className="text-lg font-semibold text-white">Quote Theme</h2>
          </div>
          <div className="grid grid-cols-5 gap-2 mb-4">
            {QUOTE_THEMES.map((theme) => (
              <button
                key={theme.id}
                onClick={() => { setSelectedQuoteTheme(theme.id); setCustomQuotes(""); }}
                className={`py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                  selectedQuoteTheme === theme.id && !customQuotes
                    ? "bg-pink-500/20 text-pink-400 border border-pink-500/30"
                    : "bg-white/[0.04] text-[var(--text-muted)] border border-white/[0.06] hover:bg-white/[0.08]"
                }`}
              >
                {theme.label}
              </button>
            ))}
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] font-medium block mb-1">Or enter custom quotes (one per line, max 5):</label>
            <textarea
              value={customQuotes}
              onChange={(e) => setCustomQuotes(e.target.value)}
              placeholder={"Enter your own quotes here...\nOne quote per line\nMax 5 quotes"}
              rows={4}
              className="w-full text-sm rounded-lg p-3"
            />
          </div>
        </div>
      )}

      {/* Step 2: Choose Color Scheme */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center text-xs font-bold border border-pink-500/30">2</span>
          <h2 className="text-lg font-semibold text-white">Choose Color Scheme</h2>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {COLOR_SCHEMES.map((scheme) => (
            <button
              key={scheme.id}
              onClick={() => setSelectedScheme(scheme.id)}
              className={`text-left p-4 rounded-xl border transition-all duration-200 ${
                selectedScheme === scheme.id
                  ? "border-pink-500/60 bg-pink-950/30"
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
              : "bg-gradient-to-r from-pink-600 to-violet-600 hover:from-pink-500 hover:to-violet-500 shadow-lg shadow-pink-500/20"
          }`}
        >
          {generating ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Generating Printable...
            </span>
          ) : (
            <>🎨 Generate & Download Printable</>
          )}
          {!generating && selectedType && (
            <div className="absolute inset-0 rounded-xl overflow-hidden">
              <div className="shimmer-hover absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
          )}
        </button>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>

      {/* PDF Preview */}
      {previewUrl && (
        <div className="mb-8 bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <span className="text-sm">👁️</span>
              <span className="text-xs font-semibold text-white">PDF Preview</span>
            </div>
            <button
              onClick={() => setPreviewUrl(null)}
              className="text-[var(--text-muted)] hover:text-white text-xs transition-colors"
            >
              Close
            </button>
          </div>
          <iframe
            src={previewUrl}
            className="w-full h-[600px] bg-white"
            title="PDF Preview"
          />
        </div>
      )}

      {/* Result Section */}
      {downloadReady && (
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
          <div className="flex border-b border-white/[0.06]">
            <button
              onClick={() => setActiveTab("download")}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === "download" ? "text-white border-b-2 border-pink-500" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              ✅ Download Complete
            </button>
            <button
              onClick={() => setActiveTab("etsy")}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === "etsy" ? "text-white border-b-2 border-pink-500" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {etsyLoading ? "⏳ Generating..." : "🏷️ Etsy Listing"}
            </button>
          </div>

          <div className="p-6">
            {activeTab === "download" && (
              <div className="text-center py-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-pink-500/15 border border-pink-500/25 flex items-center justify-center text-3xl">✅</div>
                <h3 className="text-lg font-bold text-white mb-2">Printable Generated!</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  Your {PRINTABLE_TYPES.find((t) => t.id === selectedType)?.name} has been downloaded.
                </p>
                <p className="text-xs text-[var(--text-muted)]">Print on any home printer or send to a print shop</p>
              </div>
            )}
            {activeTab === "etsy" && (
              <div>
                {etsyLoading ? (
                  <div className="text-center py-8">
                    <svg className="animate-spin h-8 w-8 mx-auto text-pink-400 mb-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
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
                      <p className="text-2xl font-bold text-pink-400 mt-1">${etsyListing.price?.recommended || "4.99"}</p>
                    </div>
                    <button
                      onClick={() => {
                        const text = `Title: ${etsyListing.title}\n\nTags: ${etsyListing.tags?.join(", ")}\n\nDescription:\n${etsyListing.description}`;
                        navigator.clipboard.writeText(text);
                      }}
                      className="w-full py-2 bg-pink-500/15 border border-pink-500/25 rounded-lg text-sm text-pink-400 hover:bg-pink-500/25 transition-colors font-medium"
                    >
                      📋 Copy Full Listing
                    </button>
                  </div>
                ) : (
                  <p className="text-center py-6 text-[var(--text-muted)] text-sm">Generate a printable first to get an Etsy listing</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Info Cards */}
      {!downloadReady && (
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-pink-950/30 border border-pink-500/20">
            <p className="text-pink-400 font-semibold text-sm mb-1">💰 Avg Revenue</p>
            <p className="text-2xl font-bold text-pink-400">$200-500<span className="text-sm font-normal text-pink-400/50">/mo</span></p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">Printables have high margins & low effort</p>
          </div>
          <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-500/20">
            <p className="text-blue-400 font-semibold text-sm mb-1">🖨️ Output</p>
            <p className="text-white font-bold text-lg">Print-Ready PDF</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">A4 size, instant download, print at home</p>
          </div>
          <div className="p-4 rounded-xl bg-violet-950/30 border border-violet-500/20">
            <p className="text-violet-400 font-semibold text-sm mb-1">🎨 Styles</p>
            <p className="text-white font-bold text-lg">5 Color Schemes</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">From minimalist to trendy aesthetic</p>
          </div>
        </div>
      )}
    </div>
  );
}
