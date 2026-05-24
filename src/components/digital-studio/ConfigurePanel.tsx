"use client";

import { useState, useEffect, useCallback } from "react";
import { useDigitalStudioStore } from "@/stores/digitalStudioStore";
import { useSettings } from "@/hooks/useSettings";
import { useNotionPages } from "@/hooks/useNotionPages";
import {
  DIGITAL_PRODUCT_LABELS,
  type DigitalProductType,
  type DigitalProductConfig,
} from "@/types/digital-product";

// ── Step 2: Configure ──
// Choose product type and fill in type-specific configuration.
// Imported projects arrive with auto-detected config from heuristics.
// Notion type includes a page picker that fetches accessible pages.

// ── Option definitions ──

const PRODUCT_TYPE_ICONS: Record<DigitalProductType, string> = {
  notion: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
  pdf: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  excel: "M3 10h18M3 14h18M3 18h18M3 6h18M7 3v18M17 3v18",
  printable: "M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z",
};

const NOTION_TYPES = [
  { value: "finance_tracker", label: "Finance Tracker" },
  { value: "adhd_planner", label: "ADHD Planner" },
  { value: "life_planner", label: "Life Planner" },
  { value: "social_media_planner", label: "Social Media Planner" },
  { value: "habit_tracker", label: "Habit Tracker" },
  { value: "reading_log", label: "Reading Log" },
];

const PDF_TYPES = [
  { value: "daily", label: "Daily Planner" },
  { value: "weekly", label: "Weekly Planner" },
  { value: "monthly", label: "Monthly Planner" },
  { value: "budget", label: "Budget Planner" },
  { value: "fitness", label: "Fitness Planner" },
  { value: "self_care", label: "Self-Care Planner" },
  { value: "business", label: "Business Planner" },
  { value: "student", label: "Student Planner" },
];

const EXCEL_TYPES = [
  { value: "budget", label: "Budget Tracker" },
  { value: "habit", label: "Habit Tracker" },
  { value: "fitness", label: "Fitness Tracker" },
  { value: "business", label: "Business Tracker" },
  { value: "meal_planner", label: "Meal Planner" },
  { value: "project", label: "Project Timeline" },
];

const PRINTABLE_TYPES = [
  { value: "quote_prints", label: "Quote Prints" },
  { value: "habit_tracker", label: "Habit Tracker" },
  { value: "gratitude_journal", label: "Gratitude Journal" },
  { value: "goal_worksheet", label: "Goal Worksheet" },
  { value: "meal_planner", label: "Meal Planner" },
  { value: "budget_worksheet", label: "Budget Worksheet" },
];

const COLOR_SCHEMES = [
  { value: "sage-green", label: "Sage Green" },
  { value: "dusty-rose", label: "Dusty Rose" },
  { value: "navy-gold", label: "Navy & Gold" },
  { value: "minimal-black", label: "Minimal Black" },
  { value: "ocean", label: "Ocean Blue" },
  { value: "lavender", label: "Lavender" },
  { value: "terracotta", label: "Terracotta" },
];

const NOTION_AESTHETICS = [
  { value: "minimal", label: "Minimal" },
  { value: "brown", label: "Brown / Warm" },
  { value: "pink", label: "Pink / Soft" },
  { value: "dark", label: "Dark Mode" },
  { value: "colorful", label: "Colorful" },
];

export function ConfigurePanel() {
  const project = useDigitalStudioStore((s) => s.project);
  const setProductType = useDigitalStudioStore((s) => s.setProductType);
  const setConfig = useDigitalStudioStore((s) => s.setConfig);
  const setStepStatus = useDigitalStudioStore((s) => s.setStepStatus);
  const { settings } = useSettings();

  // Notion page picker
  const { pages, isLoading: loadingPages, error: pagesError, fetchPages } = useNotionPages();
  const [showManualId, setShowManualId] = useState(false);

  // Local form state (committed to store via "Apply" or auto-save)
  const [localConfig, setLocalConfig] = useState<Partial<DigitalProductConfig>>({});

  // Sync from store on mount
  useEffect(() => {
    if (project.config) {
      setLocalConfig(project.config);
    }
  }, [project.config]);

  const selectedType = project.productType;
  const isAutoDetected = project.importSource?.configSource === "inferred";

  // Effective Notion token: local input takes priority, then global settings
  const effectiveToken = (localConfig as Record<string, string>).notionToken || settings.notionToken;

  // Auto-fetch Notion pages when token is available
  useEffect(() => {
    if (selectedType === "notion" && effectiveToken) {
      fetchPages(effectiveToken);
    }
  }, [selectedType, effectiveToken, fetchPages]);

  const handleTypeSelect = (type: DigitalProductType) => {
    setProductType(type);
    // Reset local config for new type
    setLocalConfig({});
  };

  const handleRefreshPages = useCallback(() => {
    if (effectiveToken) {
      fetchPages(effectiveToken);
    }
  }, [effectiveToken, fetchPages]);

  const applyConfig = () => {
    let config: DigitalProductConfig | null = null;

    switch (selectedType) {
      case "notion":
        config = {
          type: "notion",
          templateType: (localConfig as Record<string, string>).templateType || "life_planner",
          aesthetic: (localConfig as Record<string, string>).aesthetic || "minimal",
          complexity: ((localConfig as Record<string, string>).complexity as "simple" | "medium" | "advanced") || "medium",
          premium: !!(localConfig as Record<string, boolean>).premium,
          // Only store project-level overrides; GeneratePanel resolves fallback to Settings at runtime
          notionToken: (localConfig as Record<string, string>).notionToken || "",
          parentPageId: (localConfig as Record<string, string>).parentPageId || settings.defaultParentPageId || "",
        };
        break;
      case "pdf":
        config = {
          type: "pdf",
          plannerType: (localConfig as Record<string, string>).plannerType || "weekly",
          colorTheme: (localConfig as Record<string, string>).colorTheme || "sage-green",
          paperSize: ((localConfig as Record<string, string>).paperSize as "letter" | "a4" | "a5") || "letter",
          year: Number((localConfig as Record<string, string>).year) || new Date().getFullYear(),
        };
        break;
      case "excel":
        config = {
          type: "excel",
          trackerType: (localConfig as Record<string, string>).trackerType || "budget",
          colorScheme: (localConfig as Record<string, string>).colorScheme || "sage-green",
        };
        break;
      case "printable": {
        // Preserve quoteTheme if it was inferred from import or set previously
        const existingQuoteTheme = (localConfig as Record<string, string>).quoteTheme
          || (project.config?.type === "printable" ? project.config.quoteTheme : undefined);
        config = {
          type: "printable",
          printableType: (localConfig as Record<string, string>).printableType || "quote_prints",
          colorScheme: (localConfig as Record<string, string>).colorScheme || "sage-green",
          ...(existingQuoteTheme ? { quoteTheme: existingQuoteTheme } : {}),
        };
        break;
      }
    }

    if (config) {
      setConfig(config);
      setStepStatus("configure", "done");
    }
  };

  const updateLocal = (key: string, value: string | boolean) => {
    setLocalConfig((prev) => ({ ...prev, [key]: value }));
  };

  // ── Render ──

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">Configure Product</h2>
        <p className="text-sm text-white/50 mt-1">
          Choose your product type and customize the configuration.
        </p>
      </div>

      {/* Auto-detected badge for imported projects */}
      {isAutoDetected && (
        <div className="flex items-center gap-2 px-4 py-3 bg-violet-500/10 border border-violet-500/20 rounded-xl">
          <svg className="w-4 h-4 text-violet-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span className="text-sm text-violet-300">
            Auto-detected from import — review and adjust as needed
          </span>
        </div>
      )}

      {/* Product Type Selection */}
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider">
          Product Type
        </label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(Object.keys(DIGITAL_PRODUCT_LABELS) as DigitalProductType[]).map((type) => (
            <button
              key={type}
              onClick={() => handleTypeSelect(type)}
              className={`
                flex flex-col items-center gap-3 p-5 rounded-xl border transition-all
                ${selectedType === type
                  ? "bg-indigo-500/15 border-indigo-500/40 ring-1 ring-indigo-500/20"
                  : "bg-white/[0.04] border-white/[0.08] hover:border-white/20 hover:bg-white/[0.06]"
                }
              `}
            >
              <svg
                className={`w-7 h-7 ${selectedType === type ? "text-indigo-400" : "text-white/40"}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={PRODUCT_TYPE_ICONS[type]} />
              </svg>
              <span className={`text-sm font-medium ${selectedType === type ? "text-indigo-300" : "text-white/60"}`}>
                {DIGITAL_PRODUCT_LABELS[type]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Type-Specific Configuration */}
      {selectedType && (
        <div className="space-y-6 p-6 bg-white/[0.02] border border-white/[0.08] rounded-xl">
          <h3 className="text-sm font-semibold text-white">
            {DIGITAL_PRODUCT_LABELS[selectedType]} Settings
          </h3>

          {/* Notion Config */}
          {selectedType === "notion" && (
            <div className="space-y-4">
              <SelectField
                label="Template Type"
                value={(localConfig as Record<string, string>).templateType || ""}
                options={NOTION_TYPES}
                onChange={(v) => updateLocal("templateType", v)}
              />
              <SelectField
                label="Aesthetic"
                value={(localConfig as Record<string, string>).aesthetic || ""}
                options={NOTION_AESTHETICS}
                onChange={(v) => updateLocal("aesthetic", v)}
              />
              <SelectField
                label="Complexity"
                value={(localConfig as Record<string, string>).complexity || "medium"}
                options={[
                  { value: "simple", label: "Simple" },
                  { value: "medium", label: "Medium" },
                  { value: "advanced", label: "Advanced" },
                ]}
                onChange={(v) => updateLocal("complexity", v)}
              />
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={!!(localConfig as Record<string, boolean>).premium}
                  onChange={(e) => updateLocal("premium", e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-white/[0.04] text-indigo-500 focus:ring-indigo-500/30"
                />
                <label className="text-sm text-white/70">Premium template (advanced formulas & automation)</label>
              </div>

              {/* Notion API Credentials + Page Picker */}
              <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-4">
                {/* Token: Show connected status or input */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider">
                    Notion API Token
                  </label>

                  {/* Global token exists — show connected indicator */}
                  {settings.notionToken && !(localConfig as Record<string, string>).notionToken && (
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                      <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-xs text-emerald-300">Connected via Settings</span>
                      <a
                        href="/settings"
                        className="ml-auto text-[10px] text-white/30 hover:text-white/50 transition-colors"
                      >
                        Manage
                      </a>
                    </div>
                  )}

                  {/* No global token — show required input */}
                  {!settings.notionToken && (
                    <>
                      <input
                        type="password"
                        value={(localConfig as Record<string, string>).notionToken || ""}
                        onChange={(e) => updateLocal("notionToken", e.target.value)}
                        placeholder="ntn_..."
                        className="w-full px-4 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50 transition-colors font-mono text-xs"
                      />
                      {!effectiveToken && (
                        <p className="text-xs text-amber-400/80">
                          A Notion API token is required.{" "}
                          <a href="/settings" className="underline hover:text-amber-300 transition-colors">
                            Configure in Settings
                          </a>
                        </p>
                      )}
                    </>
                  )}

                  {/* Global token exists — optional override field (collapsed by default) */}
                  {settings.notionToken && (localConfig as Record<string, string>).notionToken && (
                    <div className="space-y-1">
                      <input
                        type="password"
                        value={(localConfig as Record<string, string>).notionToken || ""}
                        onChange={(e) => updateLocal("notionToken", e.target.value)}
                        placeholder="ntn_..."
                        className="w-full px-4 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50 transition-colors font-mono text-xs"
                      />
                      <button
                        onClick={() => updateLocal("notionToken", "")}
                        className="text-[10px] text-white/30 hover:text-white/50 transition-colors"
                      >
                        Clear override — use Settings token
                      </button>
                    </div>
                  )}
                </div>

                {/* Parent Page Picker */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider">
                      Parent Page
                    </label>
                    {pages.length > 0 && (
                      <button
                        onClick={handleRefreshPages}
                        disabled={loadingPages}
                        className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
                      >
                        {loadingPages ? "Refreshing..." : "Refresh"}
                      </button>
                    )}
                  </div>

                  {/* State: No token available */}
                  {!effectiveToken && (
                    <div className="px-4 py-3 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                      <p className="text-xs text-white/40">Enter your Notion API token above to browse available pages.</p>
                    </div>
                  )}

                  {/* State: Loading pages */}
                  {effectiveToken && loadingPages && pages.length === 0 && (
                    <div className="flex items-center gap-2 px-4 py-3 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                      <svg className="w-4 h-4 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span className="text-xs text-white/40">Loading pages...</span>
                    </div>
                  )}

                  {/* State: Error fetching pages */}
                  {effectiveToken && pagesError && !loadingPages && (
                    <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl space-y-2">
                      <p className="text-xs text-red-400">{pagesError}</p>
                      <button
                        onClick={handleRefreshPages}
                        className="text-xs text-red-300 hover:text-red-200 underline transition-colors"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {/* State: Pages loaded — show picker or manual input */}
                  {effectiveToken && !loadingPages && !pagesError && (
                    <>
                      {!showManualId ? (
                        <>
                          {pages.length > 0 ? (
                            <select
                              value={(localConfig as Record<string, string>).parentPageId || settings.defaultParentPageId || ""}
                              onChange={(e) => updateLocal("parentPageId", e.target.value)}
                              className="w-full px-4 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white focus:outline-none focus:border-indigo-500/50 transition-colors appearance-none"
                            >
                              <option value="" className="bg-[#161624]">Select a page...</option>
                              {pages.map((p) => (
                                <option key={p.id} value={p.id} className="bg-[#161624]">
                                  {p.icon ? `${p.icon} ` : ""}{p.title || "Untitled"}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="px-4 py-3 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                              <p className="text-xs text-white/40">
                                No pages found. Make sure you&apos;ve shared at least one page with your Notion integration.
                              </p>
                            </div>
                          )}
                        </>
                      ) : (
                        <input
                          type="text"
                          value={(localConfig as Record<string, string>).parentPageId || ""}
                          onChange={(e) => updateLocal("parentPageId", e.target.value)}
                          placeholder={settings.defaultParentPageId ? "Using page ID from Settings" : "paste-page-id-here"}
                          className="w-full px-4 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50 transition-colors font-mono text-xs"
                        />
                      )}

                      {/* Toggle between picker and manual entry */}
                      <button
                        onClick={() => setShowManualId(!showManualId)}
                        className="text-[10px] text-white/30 hover:text-white/50 transition-colors"
                      >
                        {showManualId ? "Use page picker" : "Enter page ID manually"}
                      </button>
                    </>
                  )}
                </div>

                {settings.notionToken && !settings.defaultParentPageId && !(localConfig as Record<string, string>).parentPageId && (
                  <p className="text-[10px] text-white/30">
                    Notion is connected. Select a parent page above to start generating.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* PDF Config */}
          {selectedType === "pdf" && (
            <div className="space-y-4">
              <SelectField
                label="Planner Type"
                value={(localConfig as Record<string, string>).plannerType || ""}
                options={PDF_TYPES}
                onChange={(v) => updateLocal("plannerType", v)}
              />
              <SelectField
                label="Color Theme"
                value={(localConfig as Record<string, string>).colorTheme || ""}
                options={COLOR_SCHEMES}
                onChange={(v) => updateLocal("colorTheme", v)}
              />
              <SelectField
                label="Paper Size"
                value={(localConfig as Record<string, string>).paperSize || "letter"}
                options={[
                  { value: "letter", label: "US Letter" },
                  { value: "a4", label: "A4" },
                  { value: "a5", label: "A5" },
                ]}
                onChange={(v) => updateLocal("paperSize", v)}
              />
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider">Year</label>
                <input
                  type="number"
                  value={(localConfig as Record<string, string>).year || new Date().getFullYear()}
                  onChange={(e) => updateLocal("year", e.target.value)}
                  className="w-32 px-4 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
              </div>
            </div>
          )}

          {/* Excel Config */}
          {selectedType === "excel" && (
            <div className="space-y-4">
              <SelectField
                label="Tracker Type"
                value={(localConfig as Record<string, string>).trackerType || ""}
                options={EXCEL_TYPES}
                onChange={(v) => updateLocal("trackerType", v)}
              />
              <SelectField
                label="Color Scheme"
                value={(localConfig as Record<string, string>).colorScheme || ""}
                options={COLOR_SCHEMES}
                onChange={(v) => updateLocal("colorScheme", v)}
              />
            </div>
          )}

          {/* Printable Config */}
          {selectedType === "printable" && (
            <div className="space-y-4">
              <SelectField
                label="Printable Type"
                value={(localConfig as Record<string, string>).printableType || ""}
                options={PRINTABLE_TYPES}
                onChange={(v) => updateLocal("printableType", v)}
              />
              <SelectField
                label="Color Scheme"
                value={(localConfig as Record<string, string>).colorScheme || ""}
                options={COLOR_SCHEMES}
                onChange={(v) => updateLocal("colorScheme", v)}
              />
            </div>
          )}

          {/* Apply button */}
          <button
            onClick={applyConfig}
            className="px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors"
          >
            Apply Configuration
          </button>

          {project.config && (
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Configuration saved
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shared Select Component ──

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white focus:outline-none focus:border-indigo-500/50 transition-colors appearance-none"
      >
        <option value="" className="bg-[#161624]">Select...</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-[#161624]">
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
