"use client";

import { useState, useCallback } from "react";
import { useDigitalStudioStore } from "@/stores/digitalStudioStore";
import { useSettings } from "@/hooks/useSettings";
import { runAutoMode, type AutoModeStoreActions } from "@/lib/auto-mode-orchestrator";
import { AutoModeProgress } from "./AutoModeProgress";

const EXAMPLE_PROMPTS = [
  "Budget planner for freelancers",
  "ADHD productivity system",
  "Wedding planning spreadsheet",
  "Gym tracker for beginners",
  "Weekly self-care planner",
  "Small business P&L tracker",
];

export function AutoModePanel() {
  const project = useDigitalStudioStore((s) => s.project);
  const autoPhase = useDigitalStudioStore((s) => s.autoPhase);
  const autoPrompt = useDigitalStudioStore((s) => s.autoPrompt);
  const autoError = useDigitalStudioStore((s) => s.autoError);
  const setAutoMode = useDigitalStudioStore((s) => s.setAutoMode);
  const setAutoPrompt = useDigitalStudioStore((s) => s.setAutoPrompt);
  const setAutoPhase = useDigitalStudioStore((s) => s.setAutoPhase);
  const setAutoError = useDigitalStudioStore((s) => s.setAutoError);

  // Store actions needed by orchestrator
  const setProjectName = useDigitalStudioStore((s) => s.setProjectName);
  const setProductType = useDigitalStudioStore((s) => s.setProductType);
  const setInspiration = useDigitalStudioStore((s) => s.setInspiration);
  const setStepStatus = useDigitalStudioStore((s) => s.setStepStatus);
  const setConfig = useDigitalStudioStore((s) => s.setConfig);
  const setGenerationStatus = useDigitalStudioStore((s) => s.setGenerationStatus);
  const setGenerationResult = useDigitalStudioStore((s) => s.setGenerationResult);
  const setMockups = useDigitalStudioStore((s) => s.setMockups);
  const setMockupStatus = useDigitalStudioStore((s) => s.setMockupStatus);
  const setThumbnailUrl = useDigitalStudioStore((s) => s.setThumbnailUrl);
  const setListing = useDigitalStudioStore((s) => s.setListing);
  const goToStep = useDigitalStudioStore((s) => s.goToStep);
  const saveProject = useDigitalStudioStore((s) => s.saveProject);

  const { settings } = useSettings();
  const [localPrompt, setLocalPrompt] = useState(autoPrompt || "");

  const isRunning = autoPhase !== null && autoPhase !== "done";

  const handleGenerate = useCallback(async () => {
    const prompt = localPrompt.trim();
    if (!prompt || isRunning) return;

    setAutoPrompt(prompt);
    setAutoError(null);

    const storeActions: AutoModeStoreActions = {
      setProjectName,
      setProductType,
      setInspiration,
      setStepStatus,
      setConfig,
      setGenerationStatus,
      setGenerationResult,
      setMockups,
      setMockupStatus,
      setThumbnailUrl,
      setListing,
      goToStep,
      saveProject,
      setAutoPhase,
      setAutoError,
      getProjectId: () => project.id,
    };

    await runAutoMode(prompt, storeActions, {
      notionToken: settings.notionToken,
      defaultParentPageId: settings.defaultParentPageId,
    });
  }, [
    localPrompt, isRunning, project.id, settings.notionToken, settings.defaultParentPageId,
    setAutoPrompt, setAutoError, setProjectName, setProductType, setInspiration,
    setStepStatus, setConfig, setGenerationStatus, setGenerationResult,
    setMockups, setMockupStatus, setThumbnailUrl, setListing, goToStep,
    saveProject, setAutoPhase, setAutoError,
  ]);

  const handleRetry = () => {
    setAutoPhase(null);
    setAutoError(null);
  };

  const handleExampleClick = (example: string) => {
    setLocalPrompt(example);
  };

  // ── Running state: show progress ──
  if (isRunning || (autoPhase === "done" && !autoError)) {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white">Creating your product</h2>
          <p className="text-sm text-white/40 mt-2">
            &ldquo;{autoPrompt}&rdquo;
          </p>
        </div>

        <div className="p-6 bg-white/[0.02] border border-white/[0.08] rounded-xl">
          <AutoModeProgress currentPhase={autoPhase} error={autoError} />
        </div>

        {autoError && (
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleRetry}
              className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => setAutoMode(false)}
              className="px-5 py-2.5 text-sm text-white/50 hover:text-white transition-colors"
            >
              Switch to Advanced Mode
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Input state: show prompt field ──
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
          <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-xs font-medium text-indigo-300">Auto Mode</span>
        </div>
        <h2 className="text-2xl font-bold text-white">
          What do you want to create?
        </h2>
        <p className="text-sm text-white/40">
          Describe your product idea and we&apos;ll build everything automatically.
        </p>
      </div>

      {/* Input */}
      <div className="space-y-4">
        <div className="relative">
          <textarea
            value={localPrompt}
            onChange={(e) => setLocalPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleGenerate();
              }
            }}
            placeholder="e.g. budget planner for freelancers who get paid irregularly..."
            rows={3}
            className="w-full px-5 py-4 bg-white/[0.04] border border-white/[0.12] rounded-2xl text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all resize-none text-base"
          />
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={!localPrompt.trim()}
          className="w-full py-3.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:from-white/10 disabled:to-white/10 disabled:text-white/30 rounded-xl transition-all shadow-lg shadow-indigo-500/20 disabled:shadow-none"
        >
          Generate Product
        </button>
      </div>

      {/* Example chips */}
      <div className="space-y-3">
        <p className="text-xs text-white/30 text-center">Try an example:</p>
        <div className="flex flex-wrap justify-center gap-2">
          {EXAMPLE_PROMPTS.map((example) => (
            <button
              key={example}
              onClick={() => handleExampleClick(example)}
              className="px-3 py-1.5 text-xs text-white/50 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20 rounded-lg transition-all"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced mode link */}
      <div className="text-center">
        <button
          onClick={() => setAutoMode(false)}
          className="text-xs text-white/30 hover:text-white/60 transition-colors underline underline-offset-4"
        >
          Switch to Advanced Mode
        </button>
      </div>
    </div>
  );
}
