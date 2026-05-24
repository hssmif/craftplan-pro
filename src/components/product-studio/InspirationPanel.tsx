"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useStudioStore } from "@/stores/studioStore";
import { useSettings } from "@/hooks/useSettings";
import type { InspirationSource, NicheAnalysis, ReferenceAnalysis } from "@/types/product-studio";

// Chrome extension types
declare const chrome: {
  runtime?: {
    sendMessage: (
      extensionId: string,
      message: unknown,
      callback: (response: { ok?: boolean; name?: string; version?: string }) => void
    ) => void;
    lastError?: { message: string };
  };
} | undefined;

type SourceTab = "keyword" | "upload" | "extension" | "opportunity";

// ── Fallback niche analysis (matches DesignGenerationPanel fallback) ──
const FALLBACK_NICHE: NicheAnalysis = {
  nicheScore: 75,
  demandLevel: "high",
  competitionLevel: "medium",
  bestProductTypes: ["T-Shirt", "Mug", "Tote Bag"],
  topSubNiches: [],
  buyerPersona: "General audience",
  seasonality: "evergreen",
  peakMonths: [],
  avgPriceRange: { min: 15, max: 30 },
  topSellerEstimate: "1k-5k sales/month",
};

export function InspirationPanel() {
  const project = useStudioStore((s) => s.project);
  const setInspiration = useStudioStore((s) => s.setInspiration);
  const setNicheAnalysis = useStudioStore((s) => s.setNicheAnalysis);
  const setDesignMode = useStudioStore((s) => s.setDesignMode);
  const setStepStatus = useStudioStore((s) => s.setStepStatus);
  const nextStep = useStudioStore((s) => s.nextStep);
  const { settings } = useSettings();

  const [activeTab, setActiveTab] = useState<SourceTab>(
    project.inspiration.type === "extension"
      ? "extension"
      : project.inspiration.type === "upload"
        ? "upload"
        : project.inspiration.type === "opportunity"
          ? "opportunity"
          : "keyword"
  );
  const [extensionReady, setExtensionReady] = useState(false);
  const [extensionSource, setExtensionSource] = useState<{
    title: string;
    url: string;
    podScore?: number;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Analysis State ──
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [analyzedKeyword, setAnalyzedKeyword] = useState(
    project.nicheAnalysis ? project.inspiration.keyword : ""
  );

  // Has the keyword changed since last analysis?
  const keywordChanged = project.inspiration.keyword.trim() !== analyzedKeyword.trim();
  const hasAnalysis = project.nicheAnalysis !== null && !keywordChanged;

  // ── Extension Detection ──
  useEffect(() => {
    const extId = settings.extensionId;
    if (!extId || typeof chrome === "undefined" || !chrome?.runtime?.sendMessage) return;
    try {
      chrome.runtime.sendMessage(extId, { type: "PING" }, (resp) => {
        if (chrome.runtime?.lastError) return;
        if (resp?.ok) {
          setExtensionReady(true);
        }
      });
    } catch {
      // Extension API not available
    }
  }, [settings.extensionId]);

  // ── Extension Payload Intake ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") !== "extension") return;

    const raw = localStorage.getItem("craftplan_sensei_payload");
    if (!raw) return;

    try {
      const payload = JSON.parse(raw);
      localStorage.removeItem("craftplan_sensei_payload");

      const kw =
        payload.keyword ||
        payload.designKeywords?.[0] ||
        payload.searchQuery ||
        "";

      const source: InspirationSource = {
        type: "extension",
        keyword: kw,
        referenceImageBase64: payload.referenceImageBase64 || undefined,
        referenceImageUrl: payload.imageUrl || undefined,
        sourceListingUrl: payload.sourceListing?.url || undefined,
        sourceListingTitle: payload.sourceListing?.title || undefined,
      };

      setInspiration(source);
      setActiveTab("extension");

      if (payload.sourceListing) {
        setExtensionSource({
          title: payload.sourceListing.title,
          url: payload.sourceListing.url,
          podScore: payload.sourceListing.podScore,
        });
      }
    } catch {
      // Ignore invalid JSON
    }
  }, [setInspiration]);

  // ── Analyze Niche ──
  const runAnalysis = useCallback(async () => {
    const kw = project.inspiration.keyword.trim();
    if (!kw) return;

    setIsAnalyzing(true);
    setAnalysisError("");

    try {
      // Run niche analysis + reference analysis in parallel
      const nichePromise = fetch("/api/design-sensei/analyze-niche", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: kw }),
      });

      const hasRef = !!project.inspiration.referenceImageBase64;
      const refPromise = hasRef
        ? fetch("/api/design-sensei/analyze-reference", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              referenceImageBase64: project.inspiration.referenceImageBase64,
            }),
          })
        : null;

      const [nicheResp, refResp] = await Promise.all([nichePromise, refPromise]);

      // Process niche analysis
      if (nicheResp.ok) {
        const nicheData: NicheAnalysis = await nicheResp.json();
        setNicheAnalysis(nicheData);
      } else {
        // Use fallback but don't block
        setNicheAnalysis(FALLBACK_NICHE);
      }

      // Process reference analysis
      if (refResp?.ok) {
        const refData: ReferenceAnalysis = await refResp.json();
        setInspiration({
          ...project.inspiration,
          referenceAnalysis: refData,
        });
        // Auto-set design mode based on reference
        if (refData.designType === "graphic") setDesignMode("graphic");
        else if (refData.designType === "text-only") setDesignMode("text");
      }

      setAnalyzedKeyword(kw);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Analysis failed");
      // Set fallback so user isn't blocked
      setNicheAnalysis(FALLBACK_NICHE);
      setAnalyzedKeyword(kw);
    } finally {
      setIsAnalyzing(false);
    }
  }, [project.inspiration, setNicheAnalysis, setInspiration, setDesignMode]);

  // ── Handlers ──

  const handleAnalyze = useCallback(() => {
    if (!project.inspiration.keyword.trim()) return;
    runAnalysis();
  }, [project.inspiration.keyword, runAnalysis]);

  const handleContinue = useCallback(() => {
    if (hasAnalysis) {
      setStepStatus("inspiration", "done");
      nextStep();
    } else {
      // Need to analyze first
      handleAnalyze();
    }
  }, [hasAnalysis, setStepStatus, nextStep, handleAnalyze]);

  const handleGenerateNow = useCallback(() => {
    if (!hasAnalysis) return;
    sessionStorage.setItem("studio_autostart", "true");
    setStepStatus("inspiration", "done");
    nextStep();
  }, [hasAnalysis, setStepStatus, nextStep]);

  const handleSkipAnalysis = useCallback(() => {
    setNicheAnalysis(FALLBACK_NICHE);
    setAnalyzedKeyword(project.inspiration.keyword.trim());
  }, [project.inspiration.keyword, setNicheAnalysis]);

  const handleSubNicheClick = useCallback(
    (subNiche: string) => {
      setInspiration({
        ...project.inspiration,
        keyword: subNiche,
      });
      // Clear analysis since keyword changed
      setAnalyzedKeyword("");
    },
    [project.inspiration, setInspiration]
  );

  const handleFileUpload = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        setInspiration({
          ...project.inspiration,
          type: "upload",
          referenceImageBase64: base64,
          referenceAnalysis: undefined, // Clear old analysis
        });
        setActiveTab("upload");
      };
      reader.readAsDataURL(file);
    },
    [project.inspiration, setInspiration]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  // ── Source Tabs ──
  const tabs: { id: SourceTab; label: string; icon: string; badge?: string }[] = [
    {
      id: "keyword",
      label: "Keyword",
      icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    },
    {
      id: "upload",
      label: "Upload",
      icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12",
    },
    {
      id: "extension",
      label: "Extension",
      icon: "M17 14v6m-3-3h6M6 10h2a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2zm10 0h2a2 2 0 002-2V6a2 2 0 00-2-2h-2a2 2 0 00-2 2v2a2 2 0 002 2zM6 20h2a2 2 0 002-2v-2a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2z",
      badge: extensionReady ? "Connected" : undefined,
    },
    {
      id: "opportunity",
      label: "Opportunities",
      icon: "M13 10V3L4 14h7v7l9-11h-7z",
    },
  ];

  const nicheAnalysis = project.nicheAnalysis;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-white">What do you want to create?</h2>
        <p className="text-sm text-white/50">
          Enter a niche keyword, upload a reference design, or import from your Etsy extension.
        </p>
      </div>

      {/* Extension Banner */}
      {extensionSource && (
        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-indigo-300">Imported from Extension</p>
            <p className="text-xs text-white/50 truncate mt-0.5">{extensionSource.title}</p>
            {extensionSource.podScore && (
              <span className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                POD Score: {extensionSource.podScore}%
              </span>
            )}
          </div>
        </div>
      )}

      {/* Source Tabs */}
      <div className="grid grid-cols-4 gap-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex flex-col items-center gap-2 p-4 rounded-xl border transition-all relative
              ${
                activeTab === tab.id
                  ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
                  : "bg-white/[0.03] border-white/[0.06] text-white/40 hover:bg-white/[0.06] hover:text-white/60"
              }
            `}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={tab.icon} />
            </svg>
            <span className="text-[11px] font-medium">{tab.label}</span>
            {tab.badge && (
              <span className="absolute top-1.5 right-1.5 text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-4">
        {/* Keyword Input — always shown */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-white/60 uppercase tracking-wider">
            Niche Keyword
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={project.inspiration.keyword}
              onChange={(e) =>
                setInspiration({
                  ...project.inspiration,
                  type: activeTab === "upload" ? "upload" : activeTab === "extension" ? "extension" : "keyword",
                  keyword: e.target.value,
                })
              }
              onKeyDown={(e) => e.key === "Enter" && handleContinue()}
              placeholder='e.g. "cat lover", "fishing", "nurse humor"'
              className="flex-1 px-4 py-3 bg-white/[0.06] border border-white/[0.1] rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 text-sm"
              autoFocus
              autoComplete="off"
            />
            <button
              onClick={handleContinue}
              disabled={!project.inspiration.keyword.trim() || isAnalyzing}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/10 disabled:text-white/30 text-white text-sm font-medium rounded-xl transition-colors flex items-center gap-2"
            >
              {isAnalyzing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing...
                </>
              ) : hasAnalysis ? (
                "Continue"
              ) : (
                "Analyze Niche"
              )}
            </button>
          </div>
          {keywordChanged && nicheAnalysis && (
            <p className="text-xs text-amber-400/70">
              Keyword changed — click Analyze to update niche intelligence.
            </p>
          )}
        </div>

        {/* Upload Area — shown when upload tab is active */}
        {activeTab === "upload" && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
              ${
                dragOver
                  ? "border-indigo-500 bg-indigo-500/10"
                  : "border-white/[0.1] hover:border-white/[0.2] bg-white/[0.02]"
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileInput}
              className="hidden"
            />

            {project.inspiration.referenceImageBase64 ? (
              <div className="space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={project.inspiration.referenceImageBase64}
                  alt="Reference design"
                  className="max-w-[200px] max-h-[200px] mx-auto rounded-lg"
                />
                <p className="text-xs text-white/40">Click or drag to replace</p>
              </div>
            ) : (
              <div className="space-y-3">
                <svg className="w-10 h-10 mx-auto text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-sm text-white/50">
                  Drop a reference design here or click to browse
                </p>
                <p className="text-xs text-white/30">PNG, JPG, or WebP</p>
              </div>
            )}
          </div>
        )}

        {/* Extension Status — shown when extension tab is active */}
        {activeTab === "extension" && !extensionSource && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6 text-center space-y-3">
            <div
              className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center ${
                extensionReady ? "bg-emerald-500/20" : "bg-white/[0.06]"
              }`}
            >
              <div
                className={`w-3 h-3 rounded-full ${
                  extensionReady ? "bg-emerald-400 animate-pulse" : "bg-white/20"
                }`}
              />
            </div>
            {extensionReady ? (
              <>
                <p className="text-sm text-emerald-400 font-medium">Extension Connected</p>
                <p className="text-xs text-white/40">
                  Browse Etsy and click &quot;Send to CraftPlan&quot; on any listing to import it here.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-white/50">Extension Not Detected</p>
                <p className="text-xs text-white/30">
                  Install the CraftPlan Etsy extension and configure the Extension ID in Settings.
                </p>
              </>
            )}
          </div>
        )}

        {/* Opportunities — shown when opportunity tab is active */}
        {activeTab === "opportunity" && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6 text-center space-y-3">
            <svg className="w-10 h-10 mx-auto text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            <p className="text-sm text-white/50">Opportunities</p>
            <p className="text-xs text-white/30">
              Browse trending niches from the Opportunities page, then click &quot;Create Design&quot; to start here.
            </p>
          </div>
        )}
      </div>

      {/* Analysis Error */}
      {analysisError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-center justify-between">
          <p className="text-xs text-red-400">{analysisError}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAnalyze}
              className="text-xs text-red-400 hover:text-red-300 underline"
            >
              Retry
            </button>
            <button
              onClick={handleSkipAnalysis}
              className="text-xs text-white/40 hover:text-white/60 underline"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Analyzing Skeleton */}
      {isAnalyzing && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6 space-y-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/[0.06]" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-white/[0.06] rounded w-1/3" />
              <div className="h-2 bg-white/[0.04] rounded w-2/3" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="h-8 bg-white/[0.04] rounded-lg" />
            <div className="h-8 bg-white/[0.04] rounded-lg" />
            <div className="h-8 bg-white/[0.04] rounded-lg" />
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-6 bg-white/[0.04] rounded-full w-20" />
            ))}
          </div>
          <p className="text-xs text-white/30 text-center">Analyzing niche trends with AI...</p>
        </div>
      )}

      {/* ── Niche Intelligence Card ── */}
      {hasAnalysis && nicheAnalysis && !isAnalyzing && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-5">
          {/* Top Row: Score + Demand + Competition */}
          <div className="flex items-center gap-4">
            {/* Niche Score */}
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${
                  nicheAnalysis.nicheScore >= 70
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : nicheAnalysis.nicheScore >= 40
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      : "bg-red-500/20 text-red-400 border border-red-500/30"
                }`}
              >
                {nicheAnalysis.nicheScore}
              </div>
              <div>
                <p className="text-xs text-white/40">Niche Score</p>
                <p className="text-sm font-medium text-white">
                  {nicheAnalysis.nicheScore >= 70 ? "Strong" : nicheAnalysis.nicheScore >= 40 ? "Moderate" : "Weak"}
                </p>
              </div>
            </div>

            <div className="h-8 w-px bg-white/[0.08]" />

            {/* Demand */}
            <div>
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Demand</p>
              <span
                className={`inline-block mt-0.5 text-xs px-2 py-0.5 rounded-full ${
                  nicheAnalysis.demandLevel === "very-high" || nicheAnalysis.demandLevel === "high"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : nicheAnalysis.demandLevel === "medium"
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-red-500/20 text-red-400"
                }`}
              >
                {nicheAnalysis.demandLevel}
              </span>
            </div>

            {/* Competition */}
            <div>
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Competition</p>
              <span
                className={`inline-block mt-0.5 text-xs px-2 py-0.5 rounded-full ${
                  nicheAnalysis.competitionLevel === "low"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : nicheAnalysis.competitionLevel === "medium"
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-red-500/20 text-red-400"
                }`}
              >
                {nicheAnalysis.competitionLevel}
              </span>
            </div>

            {/* Seasonality */}
            <div>
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Seasonality</p>
              <span className="inline-block mt-0.5 text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-white/60">
                {nicheAnalysis.seasonality}
              </span>
            </div>

            {/* Price Range */}
            <div className="ml-auto text-right">
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Price Range</p>
              <p className="text-sm font-medium text-white">
                ${nicheAnalysis.avgPriceRange.min}–${nicheAnalysis.avgPriceRange.max}
              </p>
            </div>
          </div>

          {/* Best Product Types */}
          {nicheAnalysis.bestProductTypes.length > 0 && (
            <div>
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Best Product Types</p>
              <div className="flex flex-wrap gap-2">
                {nicheAnalysis.bestProductTypes.map((pt) => (
                  <span
                    key={pt}
                    className="text-xs px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                  >
                    {pt}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Top Sub-Niches (clickable) */}
          {nicheAnalysis.topSubNiches.length > 0 && (
            <div>
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">
                Top Sub-Niches <span className="text-white/20">(click to drill down)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {nicheAnalysis.topSubNiches.map((sn) => (
                  <button
                    key={sn}
                    onClick={() => handleSubNicheClick(sn)}
                    className="text-xs px-2.5 py-1 rounded-full bg-white/[0.06] text-white/60 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/20 border border-white/[0.08] transition-colors"
                  >
                    {sn}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Buyer Persona */}
          {nicheAnalysis.buyerPersona && nicheAnalysis.buyerPersona !== "General audience" && (
            <div>
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Buyer Persona</p>
              <p className="text-xs text-white/60 leading-relaxed">{nicheAnalysis.buyerPersona}</p>
            </div>
          )}

          {/* Reference Analysis Preview */}
          {project.inspiration.referenceAnalysis && (
            <div className="border-t border-white/[0.06] pt-4 mt-4">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Reference Analysis</p>
              <div className="flex items-center gap-3">
                <span className="text-xs px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  {project.inspiration.referenceAnalysis.designType}
                </span>
                {project.inspiration.referenceAnalysis.extractedText && (
                  <span className="text-xs text-white/50 truncate">
                    &ldquo;{project.inspiration.referenceAnalysis.extractedText}&rdquo;
                  </span>
                )}
                <span className="text-xs text-white/30 ml-auto">
                  Style: {project.inspiration.referenceAnalysis.suggestedStylePreset} • {project.inspiration.referenceAnalysis.suggestedPalette}
                </span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleGenerateNow}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Generate Designs
            </button>
            <button
              onClick={() => {
                setStepStatus("inspiration", "done");
                nextStep();
              }}
              className="px-4 py-2.5 text-sm text-white/60 hover:text-white/80 bg-white/[0.04] hover:bg-white/[0.08] rounded-xl transition-colors"
            >
              Continue to Settings
            </button>
            <button
              onClick={() => {
                setAnalyzedKeyword("");
              }}
              className="text-xs text-white/30 hover:text-white/50 ml-auto"
            >
              Try Different Keyword
            </button>
          </div>
        </div>
      )}

      {/* Quick Tips — only shown before analysis */}
      {!hasAnalysis && !isAnalyzing && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { emoji: "🎯", tip: "Specific niches convert better", example: '"cat dad" > "pets"' },
            { emoji: "🔥", tip: "Trending phrases sell fast", example: '"quiet luxury", "book lover"' },
            { emoji: "💡", tip: "Upload a reference for AI analysis", example: "Upload any Etsy product image" },
          ].map((item) => (
            <div key={item.tip} className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3 space-y-1">
              <span className="text-lg">{item.emoji}</span>
              <p className="text-[11px] text-white/50 leading-tight">{item.tip}</p>
              <p className="text-[10px] text-white/30 italic">{item.example}</p>
            </div>
          ))}
        </div>
      )}

      {/* Skip Analysis link — only shown before analysis */}
      {!hasAnalysis && !isAnalyzing && project.inspiration.keyword.trim() && (
        <div className="text-center">
          <button
            onClick={handleSkipAnalysis}
            className="text-xs text-white/20 hover:text-white/40 transition-colors"
          >
            Skip analysis and continue →
          </button>
        </div>
      )}
    </div>
  );
}
