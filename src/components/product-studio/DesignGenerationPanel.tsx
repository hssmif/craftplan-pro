"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useStudioStore } from "@/stores/studioStore";
import type { StudioDesign, NicheAnalysis, DesignMode } from "@/types/product-studio";
import {
  FONT_LIBRARY,
  COLOR_PALETTES,
  loadAllFonts,
  generateBatchDesigns,
  overlayTextOnGraphic,
  type PhraseData,
  type StylePreset,
} from "@/lib/design-engine";

// ── Helpers ──

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    return resp;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

// Fallback phrase generator
function generateFallbackPhrases(keyword: string, count: number): PhraseData[] {
  const templates = [
    `I Love ${keyword}`,
    `${keyword} Is My Therapy`,
    `Powered By ${keyword}`,
    `${keyword} All Day`,
    `Living That ${keyword} Life`,
    `Professional ${keyword} Enthusiast`,
    `${keyword} Mode: On`,
    `Eat Sleep ${keyword} Repeat`,
    `Talk To Me About ${keyword}`,
    `${keyword} Makes Me Happy`,
    `Born To ${keyword}`,
    `Keep Calm And ${keyword}`,
    `${keyword} Is My Love Language`,
    `Fueled By ${keyword}`,
    `${keyword} Vibes Only`,
    `My Heart Belongs To ${keyword}`,
    `Happiness Is ${keyword}`,
    `${keyword} Expert Since Birth`,
    `Warning: May Talk About ${keyword}`,
    `${keyword} Addict`,
  ];
  const moods: PhraseData["mood"][] = ["funny", "motivational", "sarcastic", "wholesome", "bold", "pun"];
  const audiences: PhraseData["audience"][] = ["self-buyer", "gift", "humor", "proud-owner"];

  return templates.slice(0, count).map((text, i) => ({
    id: i + 1,
    text,
    mood: moods[i % moods.length],
    audience: audiences[i % audiences.length],
    subNiche: keyword,
  }));
}

// Build graphic prompts from reference analysis
function buildGraphicPrompts(
  analysis: {
    graphicDescription: string;
    extractedText: string;
    style: { visual: string; colors: string[]; typography: string; layout: string; mood: string };
  },
  count: number
): string[] {
  // IMPORTANT: Never include text/typography in graphic prompts.
  // Text will be overlaid separately via canvas to avoid garbled AI text.
  const base = `${analysis.graphicDescription}, ${analysis.style.visual} style, ${analysis.style.colors.join(" and ")} color palette, ${analysis.style.layout} composition, transparent background, t-shirt print ready, NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY, purely visual graphic design`;

  const variations = [
    base,
    `${base}, distressed worn texture`,
    `${base}, bolder composition, larger elements`,
    `${base}, alternative layout, recomposed`,
    `${base}, cleaner refined version`,
    `${base}, stronger ${analysis.style.mood} mood`,
    `${base}, badge emblem variant`,
    `${base}, simplified silhouette version`,
  ];

  return variations.slice(0, count);
}

// ── Pipeline Steps ──

type GenStep = "idle" | "analyzing" | "phrases" | "rendering" | "graphic-gen" | "done" | "error";

// ── Component ──

export function DesignGenerationPanel() {
  const project = useStudioStore((s) => s.project);
  const setDesigns = useStudioStore((s) => s.setDesigns);
  const setNicheAnalysis = useStudioStore((s) => s.setNicheAnalysis);
  const setDesignMode = useStudioStore((s) => s.setDesignMode);
  const setBatchSize = useStudioStore((s) => s.setBatchSize);
  const setStepStatus = useStudioStore((s) => s.setStepStatus);
  const setStepDuration = useStudioStore((s) => s.setStepDuration);

  const [step, setStep] = useState<GenStep>(project.designs.length > 0 ? "done" : "idle");
  const [stepMessage, setStepMessage] = useState("");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [generatedCount, setGeneratedCount] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef(false);

  // Timer
  useEffect(() => {
    if (step === "analyzing" || step === "phrases" || step === "rendering" || step === "graphic-gen") {
      timerRef.current = setInterval(() => setElapsed((e) => e + 0.1), 100);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [step]);

  // ── Main Generation Pipeline ──
  const runTextGeneration = useCallback(async () => {
    abortRef.current = false;
    setStep("analyzing");
    setStepStatus("generation", "running");
    setError("");
    setElapsed(0);
    const startTime = Date.now();

    const kw = project.inspiration.keyword;
    const designCount = project.batchSize;

    try {
      // ── Step 1: Analyze Niche (skip if already done in Step 1) ──
      let nicheAnalysis: NicheAnalysis | null = project.nicheAnalysis;

      if (nicheAnalysis) {
        // Already analyzed in Step 1 — skip directly to phrase generation
        setStepMessage("Niche analysis ready, generating phrases...");
      } else {
        setStepMessage("Analyzing niche trends...");
        try {
          const nicheResp = await fetchWithTimeout(
            "/api/design-sensei/analyze-niche",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ keyword: kw }),
            },
            8000
          );
          if (nicheResp.ok) {
            nicheAnalysis = await nicheResp.json();
            setNicheAnalysis(nicheAnalysis!);
          }
        } catch {
          // Fallback niche data
          nicheAnalysis = {
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
          setNicheAnalysis(nicheAnalysis);
        }
      }

      if (abortRef.current) return;

      // ── Step 2: Generate Phrases ──
      setStep("phrases");
      setStepMessage(`Generating ${designCount} design phrases...`);

      let generatedPhrases: PhraseData[] = [];

      // Build phrase body with ALL niche intelligence signals
      const phraseBody: Record<string, unknown> = {
        keyword: kw,
        count: designCount,
        subNiches: nicheAnalysis?.topSubNiches || [],
        buyerPersona: nicheAnalysis?.buyerPersona,
        demandLevel: nicheAnalysis?.demandLevel,
        competitionLevel: nicheAnalysis?.competitionLevel,
        bestProductTypes: nicheAnalysis?.bestProductTypes,
        seasonality: nicheAnalysis?.seasonality,
        avgPriceRange: nicheAnalysis?.avgPriceRange,
      };

      // Use cached reference analysis if available (from Step 1), else fetch inline
      const cachedRef = project.inspiration.referenceAnalysis;
      if (cachedRef) {
        if (cachedRef.extractedText) phraseBody.referenceText = cachedRef.extractedText;
        if (cachedRef.style?.mood) phraseBody.styleMood = cachedRef.style.mood;
      } else if (project.inspiration.referenceImageBase64) {
        // Fallback: analyze inline (backward compat — no cached analysis from Step 1)
        try {
          const refResp = await fetchWithTimeout(
            "/api/design-sensei/analyze-reference",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                referenceImageBase64: project.inspiration.referenceImageBase64,
              }),
            },
            12000
          );
          if (refResp.ok) {
            const refAnalysis = await refResp.json();
            if (refAnalysis.extractedText) phraseBody.referenceText = refAnalysis.extractedText;
            if (refAnalysis.style?.mood) phraseBody.styleMood = refAnalysis.style.mood;
          }
        } catch {
          // Continue without reference hints
        }
      }

      if (abortRef.current) return;

      try {
        const phraseResp = await fetchWithTimeout(
          "/api/design-sensei/generate-phrases",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(phraseBody),
          },
          12000
        );
        if (phraseResp.ok) {
          const phraseData = await phraseResp.json();
          generatedPhrases = phraseData.phrases || [];
        }
      } catch {
        // Will use fallback below
      }

      if (generatedPhrases.length === 0) {
        generatedPhrases = generateFallbackPhrases(kw, designCount);
      }

      if (abortRef.current) return;

      // ── Step 3: Render Designs ──
      setStep("rendering");
      setStepMessage(`Rendering ${generatedPhrases.length} designs...`);

      if (!fontsLoaded) {
        await loadAllFonts();
        setFontsLoaded(true);
      }

      const refAnalysis = project.inspiration.referenceAnalysis;
      const rendered = generateBatchDesigns(generatedPhrases, {
        width: 4500,
        height: 5400,
        preferredStyle: refAnalysis?.suggestedStylePreset as StylePreset | undefined,
        preferredPalette: refAnalysis?.suggestedPalette,
      });

      // Convert to StudioDesign format
      const studioDesigns: StudioDesign[] = rendered.map((d, idx) => ({
        id: `d_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        mode: "text" as const,
        phrase: d.text,
        mood: d.mood,
        subNiche: d.subNiche,
        stylePreset: d.style,
        palette: d.paletteName,
        fontName: d.fontName,
        layout: d.layout,
        dataUrl: d.dataUrl,
        width: 4500,
        height: 5400,
        selected: false,
        starred: false,
      }));

      setDesigns(studioDesigns);
      setStep("done");
      setStepStatus("generation", "done");
      setStepDuration("generation", Date.now() - startTime);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setStep("error");
      setStepStatus("generation", "error", err instanceof Error ? err.message : "Generation failed");
    }
  }, [
    project.inspiration.keyword,
    project.inspiration.referenceImageBase64,
    project.inspiration.referenceAnalysis,
    project.nicheAnalysis,
    project.batchSize,
    fontsLoaded,
    setDesigns,
    setNicheAnalysis,
    setStepStatus,
    setStepDuration,
  ]);

  // ── Graphic Mode Generation ──
  const runGraphicGeneration = useCallback(async () => {
    abortRef.current = false;
    setStep("graphic-gen");
    setStepStatus("generation", "running");
    setError("");
    setElapsed(0);
    setGeneratedCount(0);
    const startTime = Date.now();

    const kw = project.inspiration.keyword;
    const designCount = Math.min(project.batchSize, 8); // Graphic mode max 8

    try {
      setStepMessage("Generating AI images...");

      // Generate phrases for this keyword (used for mixed mode overlays and listing metadata)
      let graphicPhrases: PhraseData[] = [];
      try {
        const phraseResp = await fetchWithTimeout(
          "/api/design-sensei/generate-phrases",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              keyword: kw,
              count: designCount,
              subNiches: project.nicheAnalysis?.topSubNiches || [],
              buyerPersona: project.nicheAnalysis?.buyerPersona,
            }),
          },
          12000
        );
        if (phraseResp.ok) {
          const phraseData = await phraseResp.json();
          graphicPhrases = phraseData.phrases || [];
        }
      } catch {
        // Fallback phrases
      }
      if (graphicPhrases.length === 0) {
        graphicPhrases = generateFallbackPhrases(kw, designCount);
      }

      // Use cached reference analysis if available, else fetch inline
      let prompts: string[] = [];
      const cachedRefGraphic = project.inspiration.referenceAnalysis;

      if (cachedRefGraphic?.graphicDescription) {
        // Use cached analysis from Step 1
        prompts = buildGraphicPrompts(cachedRefGraphic, designCount);
      } else if (project.inspiration.referenceImageBase64) {
        // Fallback: analyze inline (backward compat)
        try {
          const refResp = await fetchWithTimeout(
            "/api/design-sensei/analyze-reference",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                referenceImageBase64: project.inspiration.referenceImageBase64,
              }),
            },
            12000
          );
          if (refResp.ok) {
            const analysis = await refResp.json();
            if (analysis.graphicDescription) {
              prompts = buildGraphicPrompts(analysis, designCount);
            }
          }
        } catch {
          // Continue with keyword-based prompts
        }
      }

      if (prompts.length === 0) {
        // Keyword-based graphic prompts
        const styles = ["retro vintage", "modern minimalist", "watercolor", "pop art", "hand-drawn sketch", "neon", "cartoon", "distressed grunge"];
        prompts = styles.slice(0, designCount).map(
          (style) =>
            `${kw} themed design, ${style} style, centered composition, transparent background, t-shirt print ready, high detail, NO TEXT, NO WORDS, NO LETTERS, purely visual graphic only`
        );
      }

      if (abortRef.current) return;

      // Generate images in batches of 2
      const designs: StudioDesign[] = [];

      for (let batch = 0; batch < prompts.length; batch += 2) {
        if (abortRef.current) break;

        const batchPrompts = prompts.slice(batch, batch + 2);
        setStepMessage(`Generating image ${batch + 1}-${Math.min(batch + 2, prompts.length)} of ${prompts.length}...`);

        const results = await Promise.allSettled(
          batchPrompts.map(async (prompt) => {
            const resp = await fetch("/api/ai/image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt,
                width: 2048,
                height: 2048,
                provider: "pollinations",
              }),
            });
            if (!resp.ok) return null;
            const data = await resp.json();
            if (data.image) {
              const mimeType = data.mimeType || "image/png";
              return {
                dataUrl: `data:${mimeType};base64,${data.image}`,
                imageUrl: data.imageUrl || undefined,
                prompt,
              };
            }
            return null;
          })
        );

        for (const result of results) {
          if (result.status === "fulfilled" && result.value) {
            const phraseForDesign = graphicPhrases[designs.length % graphicPhrases.length];
            designs.push({
              id: `d_${Date.now()}_${designs.length}_${Math.random().toString(36).slice(2, 6)}`,
              mode: "graphic",
              phrase: phraseForDesign?.text || `${kw} Design`,
              mood: phraseForDesign?.mood,
              subNiche: phraseForDesign?.subNiche,
              aiPrompt: result.value.prompt,
              imageUrl: result.value.imageUrl,
              dataUrl: result.value.dataUrl,
              width: 2048,
              height: 2048,
              selected: false,
              starred: false,
            });
            setGeneratedCount(designs.length);
          }
        }

        // Small delay between batches
        if (batch + 2 < prompts.length) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      setDesigns(designs);
      setStep("done");
      setStepStatus("generation", "done");
      setStepDuration("generation", Date.now() - startTime);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image generation failed");
      setStep("error");
      setStepStatus("generation", "error", err instanceof Error ? err.message : "Generation failed");
    }
  }, [
    project.inspiration.keyword,
    project.inspiration.referenceImageBase64,
    project.inspiration.referenceAnalysis,
    project.nicheAnalysis,
    project.batchSize,
    setDesigns,
    setStepStatus,
    setStepDuration,
  ]);

  // ── Mixed Mode Generation: AI graphics + canvas text overlay ──
  const runMixedGeneration = useCallback(async () => {
    abortRef.current = false;
    setStep("analyzing");
    setStepStatus("generation", "running");
    setError("");
    setElapsed(0);
    setGeneratedCount(0);
    const startTime = Date.now();

    const kw = project.inspiration.keyword;
    const designCount = Math.min(project.batchSize, 8);

    try {
      // Step 1: Generate phrases
      setStepMessage("Generating text phrases...");
      let phrases: PhraseData[] = [];
      try {
        const phraseResp = await fetchWithTimeout(
          "/api/design-sensei/generate-phrases",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              keyword: kw,
              count: designCount,
              subNiches: project.nicheAnalysis?.topSubNiches || [],
              buyerPersona: project.nicheAnalysis?.buyerPersona,
              demandLevel: project.nicheAnalysis?.demandLevel,
              competitionLevel: project.nicheAnalysis?.competitionLevel,
            }),
          },
          12000
        );
        if (phraseResp.ok) {
          const data = await phraseResp.json();
          phrases = data.phrases || [];
        }
      } catch {
        // fallback
      }
      if (phrases.length === 0) {
        phrases = generateFallbackPhrases(kw, designCount);
      }

      if (abortRef.current) return;

      // Step 2: Generate AI graphic backgrounds (no text)
      setStep("graphic-gen");
      setStepMessage("Generating AI graphic backgrounds...");

      const cachedRefGraphic = project.inspiration.referenceAnalysis;
      let prompts: string[] = [];
      if (cachedRefGraphic?.graphicDescription) {
        prompts = buildGraphicPrompts(cachedRefGraphic, designCount);
      } else {
        const styles = ["retro vintage", "modern minimalist", "watercolor", "pop art", "hand-drawn sketch", "neon", "cartoon", "distressed grunge"];
        prompts = styles.slice(0, designCount).map(
          (style) =>
            `${kw} themed design, ${style} style, centered composition, transparent background, t-shirt print ready, high detail, NO TEXT, NO WORDS, NO LETTERS, purely visual graphic only`
        );
      }

      if (abortRef.current) return;

      // Generate graphic backgrounds in batches of 2
      const graphicResults: Array<{ dataUrl: string; imageUrl?: string; prompt: string }> = [];
      for (let batch = 0; batch < prompts.length; batch += 2) {
        if (abortRef.current) break;
        const batchPrompts = prompts.slice(batch, batch + 2);
        setStepMessage(`Generating background ${batch + 1}-${Math.min(batch + 2, prompts.length)} of ${prompts.length}...`);

        const results = await Promise.allSettled(
          batchPrompts.map(async (prompt) => {
            const resp = await fetch("/api/ai/image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt,
                width: 2048,
                height: 2048,
                provider: "pollinations",
              }),
            });
            if (!resp.ok) return null;
            const data = await resp.json();
            if (data.image) {
              const mimeType = data.mimeType || "image/png";
              return {
                dataUrl: `data:${mimeType};base64,${data.image}`,
                imageUrl: data.imageUrl || undefined,
                prompt,
              };
            }
            return null;
          })
        );

        for (const result of results) {
          if (result.status === "fulfilled" && result.value) {
            graphicResults.push(result.value);
          }
        }

        if (batch + 2 < prompts.length) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      if (abortRef.current) return;

      // Step 3: Overlay text on graphics
      setStep("rendering");
      setStepMessage("Overlaying text on graphics...");

      if (!fontsLoaded) {
        await loadAllFonts();
        setFontsLoaded(true);
      }

      const refAnalysis = project.inspiration.referenceAnalysis;
      const designs: StudioDesign[] = [];

      for (let i = 0; i < graphicResults.length; i++) {
        if (abortRef.current) break;
        const graphic = graphicResults[i];
        const phrase = phrases[i % phrases.length];

        setStepMessage(`Compositing design ${i + 1}/${graphicResults.length}...`);

        try {
          const compositeDataUrl = await overlayTextOnGraphic(
            graphic.dataUrl,
            phrase,
            {
              width: 4500,
              height: 5400,
              preferredStyle: refAnalysis?.suggestedStylePreset as StylePreset | undefined,
              preferredPalette: refAnalysis?.suggestedPalette,
            }
          );

          designs.push({
            id: `d_${Date.now()}_${designs.length}_${Math.random().toString(36).slice(2, 6)}`,
            mode: "mixed",
            phrase: phrase.text,
            mood: phrase.mood,
            subNiche: phrase.subNiche,
            aiPrompt: graphic.prompt,
            graphicDescription: graphic.prompt,
            imageUrl: graphic.imageUrl,
            dataUrl: compositeDataUrl,
            width: 4500,
            height: 5400,
            selected: false,
            starred: false,
          });
          setGeneratedCount(designs.length);
        } catch (err) {
          console.warn(`[Mixed mode] Failed to composite design ${i}:`, err);
          // Fallback: use the graphic without text overlay
          designs.push({
            id: `d_${Date.now()}_${designs.length}_${Math.random().toString(36).slice(2, 6)}`,
            mode: "graphic",
            phrase: phrase.text,
            mood: phrase.mood,
            subNiche: phrase.subNiche,
            aiPrompt: graphic.prompt,
            imageUrl: graphic.imageUrl,
            dataUrl: graphic.dataUrl,
            width: 2048,
            height: 2048,
            selected: false,
            starred: false,
          });
          setGeneratedCount(designs.length);
        }
      }

      setDesigns(designs);
      setStep("done");
      setStepStatus("generation", "done");
      setStepDuration("generation", Date.now() - startTime);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mixed generation failed");
      setStep("error");
      setStepStatus("generation", "error", err instanceof Error ? err.message : "Generation failed");
    }
  }, [
    project.inspiration.keyword,
    project.inspiration.referenceAnalysis,
    project.nicheAnalysis,
    project.batchSize,
    fontsLoaded,
    setDesigns,
    setStepStatus,
    setStepDuration,
  ]);

  const handleGenerate = useCallback(() => {
    if (project.designMode === "graphic") {
      runGraphicGeneration();
    } else if (project.designMode === "mixed") {
      runMixedGeneration();
    } else {
      runTextGeneration();
    }
  }, [project.designMode, runTextGeneration, runGraphicGeneration, runMixedGeneration]);

  // ── Auto-start generation (from "Generate Now" in Step 1) ──
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    if (step !== "idle") return;
    const flag = sessionStorage.getItem("studio_autostart");
    if (flag) {
      sessionStorage.removeItem("studio_autostart");
      autoStarted.current = true;
      // Small delay to let component mount fully
      const t = setTimeout(() => handleGenerate(), 100);
      return () => clearTimeout(t);
    }
  }, [step, handleGenerate]);

  const isRunning = step === "analyzing" || step === "phrases" || step === "rendering" || step === "graphic-gen";

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-white">Generate Designs</h2>
        <p className="text-sm text-white/50">
          AI generates unique designs based on your keyword: <span className="text-indigo-400 font-medium">{project.inspiration.keyword}</span>
        </p>
      </div>

      {/* Configuration Row */}
      <div className="grid grid-cols-2 gap-6">
        {/* Design Mode */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-white/60 uppercase tracking-wider">
            Design Mode
          </label>
          <div className="flex gap-2">
            {(["text", "graphic", "mixed"] as DesignMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setDesignMode(mode)}
                disabled={isRunning}
                className={`
                  flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all border
                  ${
                    project.designMode === mode
                      ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-400"
                      : "bg-white/[0.03] border-white/[0.06] text-white/40 hover:bg-white/[0.06]"
                  }
                `}
              >
                {mode === "text" ? "📝 Text" : mode === "graphic" ? "🎨 Graphic" : "🎨📝 Mixed"}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-white/30">
            {project.designMode === "text"
              ? "Canvas-rendered text designs with 12 styles × 15 palettes"
              : project.designMode === "graphic"
                ? "AI-generated graphic designs without text (max 8 per batch)"
                : "AI graphic backgrounds + canvas text overlay (max 8 per batch)"}
          </p>
        </div>

        {/* Batch Size */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-white/60 uppercase tracking-wider">
            Batch Size
          </label>
          <div className="flex gap-2">
            {([10, 15, 30, 50, 100] as const).map((size) => {
              const isDisabled = (project.designMode === "graphic" || project.designMode === "mixed") && size > 8;
              return (
                <button
                  key={size}
                  onClick={() => setBatchSize(size)}
                  disabled={isRunning || isDisabled}
                  className={`
                    flex-1 py-2.5 rounded-lg text-sm font-medium transition-all border
                    ${isDisabled ? "opacity-30 cursor-not-allowed" : ""}
                    ${
                      project.batchSize === size && !isDisabled
                        ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-400"
                        : "bg-white/[0.03] border-white/[0.06] text-white/40 hover:bg-white/[0.06]"
                    }
                  `}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Niche Analysis Card */}
      {project.nicheAnalysis && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-xs font-medium text-white/60">Niche Analysis</span>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] text-white/30">Score</p>
              <p className="text-lg font-bold text-white">{project.nicheAnalysis.nicheScore}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/30">Demand</p>
              <p className="text-sm font-medium text-emerald-400 capitalize">{project.nicheAnalysis.demandLevel}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/30">Competition</p>
              <p className="text-sm font-medium text-amber-400 capitalize">{project.nicheAnalysis.competitionLevel}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/30">Best Products</p>
              <p className="text-sm font-medium text-white/60">{project.nicheAnalysis.bestProductTypes.slice(0, 3).join(", ")}</p>
            </div>
          </div>
          {project.nicheAnalysis.topSubNiches.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {project.nicheAnalysis.topSubNiches.map((sub) => (
                <span key={sub} className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  {sub}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reference Style Badge */}
      {project.inspiration.referenceAnalysis && (
        <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2">
          <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
          <span className="text-xs text-purple-300">
            Style: <span className="font-medium">{project.inspiration.referenceAnalysis.suggestedStylePreset}</span>
            {" • "}
            Palette: <span className="font-medium">{project.inspiration.referenceAnalysis.suggestedPalette}</span>
          </span>
        </div>
      )}

      {/* Generate Button + Progress */}
      <div className="space-y-4">
        {step === "idle" || step === "error" ? (
          <button
            onClick={handleGenerate}
            className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold rounded-xl transition-all text-lg shadow-lg shadow-indigo-500/20"
          >
            {project.designMode === "text"
              ? `Generate ${project.batchSize} Text Designs`
              : `Generate ${Math.min(project.batchSize, 8)} ${project.designMode === "mixed" ? "Mixed" : "AI"} Designs`}
          </button>
        ) : isRunning ? (
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm text-white font-medium">{stepMessage}</span>
              </div>
              <span className="text-xs text-white/30">{elapsed.toFixed(1)}s</span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-300"
                style={{
                  width:
                    step === "analyzing"
                      ? project.nicheAnalysis ? "30%" : "20%"
                      : step === "phrases"
                        ? "55%"
                        : step === "rendering"
                          ? "85%"
                          : step === "graphic-gen"
                            ? `${(generatedCount / Math.min(project.batchSize, 8)) * 100}%`
                            : "100%",
                }}
              />
            </div>

            {generatedCount > 0 && (
              <p className="text-xs text-white/40">{generatedCount} images generated</p>
            )}

            <button
              onClick={() => {
                abortRef.current = true;
              }}
              className="text-xs text-white/40 hover:text-white/60"
            >
              Cancel
            </button>
          </div>
        ) : step === "done" ? (
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-3">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm text-emerald-300">
                {project.designs.length} designs generated in {elapsed.toFixed(1)}s
              </span>
            </div>
            <button
              onClick={handleGenerate}
              className="px-5 py-3 bg-white/[0.06] hover:bg-white/[0.1] text-white/60 hover:text-white text-sm rounded-xl border border-white/[0.08] transition-colors"
            >
              Regenerate
            </button>
          </div>
        ) : null}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <p className="text-sm text-red-300 font-medium">Generation Failed</p>
              <p className="text-xs text-red-400/60 mt-1">{error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Style/Font/Palette Info */}
      {project.designMode === "text" && step === "idle" && (
        <div className="grid grid-cols-3 gap-4 opacity-60">
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3">
            <p className="text-xs font-medium text-white/50 mb-1">12 Style Presets</p>
            <p className="text-[10px] text-white/30">retro-badge, neon-glow, farmhouse, boho, arch-minimal, groovy-70s, distressed, watercolor, bold-stacked, cottagecore, street-graffiti, luxury-gold</p>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3">
            <p className="text-xs font-medium text-white/50 mb-1">15 Color Palettes</p>
            <div className="flex gap-1 flex-wrap mt-1">
              {COLOR_PALETTES.slice(0, 8).map((p) => (
                <div key={p.name} className="flex gap-0.5">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: p.primary }} />
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: p.secondary }} />
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3">
            <p className="text-xs font-medium text-white/50 mb-1">{FONT_LIBRARY.length} Fonts</p>
            <p className="text-[10px] text-white/30">{FONT_LIBRARY.slice(0, 6).map((f) => f.name).join(", ")}...</p>
          </div>
        </div>
      )}
    </div>
  );
}
