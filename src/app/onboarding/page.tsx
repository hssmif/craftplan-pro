"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSettings } from "@/hooks/useSettings";
import confetti from "canvas-confetti";

const TEMPLATE_OPTIONS = [
  { id: "life_planner", icon: "\u{1F31F}", name: "All-in-One Life Planner", desc: "Dashboard, goals, habits, journal, budget", popular: true },
  { id: "finance_tracker", icon: "\u{1F4B0}", name: "Finance Tracker", desc: "Budgets, expenses, savings goals, debt payoff", popular: false },
  { id: "adhd_planner", icon: "\u{1F9E0}", name: "ADHD-Friendly Planner", desc: "Brain dump, time blocking, rewards, routines", popular: true },
  { id: "social_media", icon: "\u{1F4F1}", name: "Social Media Planner", desc: "Content calendar, analytics, hashtag library", popular: false },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { settings, updateSettings } = useSettings();
  const [step, setStep] = useState(1);
  const [token, setToken] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [testError, setTestError] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Redirect if already onboarded
  useEffect(() => {
    if (settings.onboardingComplete) {
      router.replace("/");
    }
  }, [settings.onboardingComplete, router]);

  // Scroll to top on step change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const testConnection = useCallback(async () => {
    if (!token.trim()) return;
    setTesting(true);
    setTestResult(null);
    setTestError("");
    try {
      const resp = await fetch("/api/notion/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      if (resp.ok) {
        setTestResult("success");
        updateSettings({ notionToken: token.trim() });
        // Auto-advance after a short delay
        setTimeout(() => setStep(2), 800);
      } else {
        const data = await resp.json();
        setTestResult("error");
        setTestError(data.error || "Connection failed");
      }
    } catch {
      setTestResult("error");
      setTestError("Network error — is the server running?");
    }
    setTesting(false);
  }, [token, updateSettings]);

  function handleTemplateSelect(id: string) {
    setSelectedTemplate(id);
    // Fire confetti and go to step 3
    setTimeout(() => {
      setStep(3);
      // Fire confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#6366f1", "#8b5cf6", "#f59e0b", "#22c55e", "#ec4899"],
      });
      setTimeout(() => {
        confetti({
          particleCount: 50,
          spread: 120,
          origin: { y: 0.5, x: 0.3 },
        });
      }, 200);
      setTimeout(() => {
        confetti({
          particleCount: 50,
          spread: 120,
          origin: { y: 0.5, x: 0.7 },
        });
      }, 400);
    }, 300);
  }

  function handleFinish() {
    updateSettings({ onboardingComplete: true });
    router.push(`/notion-builder${selectedTemplate ? `?preselect=${selectedTemplate}` : ""}`);
  }

  // Don't render if already onboarded (avoids flash)
  if (settings.onboardingComplete) return null;

  return (
    <div className="w-full flex items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                step > s ? "bg-green-500 text-white" :
                step === s ? "bg-indigo-600 text-white scale-110" :
                "bg-slate-200 text-slate-400"
              }`}>
                {step > s ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : s}
              </div>
              {s < 3 && (
                <div className={`w-16 h-0.5 rounded-full transition-colors duration-300 ${step > s ? "bg-green-400" : "bg-slate-200"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Connect Notion */}
        {step === 1 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8 page-enter">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L18.37 2.33c-.42-.326-.98-.7-2.055-.607L3.34 2.77c-.467.046-.56.28-.374.466l1.493 1.466v-.494zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.84-.046.933-.56.933-1.167V6.354c0-.606-.233-.933-.747-.886l-15.177.887c-.56.046-.746.326-.746.933zm14.337.745c.093.42 0 .84-.42.886l-.7.14v10.264c-.607.327-1.167.514-1.634.514-.746 0-.933-.234-1.493-.933l-4.574-7.186v6.953l1.447.327s0 .84-1.167.84l-3.22.187c-.093-.187 0-.653.327-.747l.84-.233V9.854L7.46 9.76c-.093-.42.14-1.026.793-1.073l3.454-.234 4.76 7.28V9.527l-1.213-.14c-.094-.514.28-.886.746-.933l3.453-.234z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Connect your Notion workspace</h2>
              <p className="text-slate-500 mt-2 max-w-md mx-auto">
                CraftPlan needs access to create templates in your Notion workspace
              </p>
            </div>

            {/* Instructions */}
            <div className="bg-slate-50 rounded-xl p-5 mb-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Setup in 3 steps:</h3>
              <ol className="space-y-3">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                  <div>
                    <p className="text-sm text-slate-700">Go to <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-medium">notion.so/my-integrations</a></p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                  <div>
                    <p className="text-sm text-slate-700">Create a new integration named <strong>&quot;CraftPlan Digital&quot;</strong></p>
                    <p className="text-xs text-slate-400 mt-0.5">Make sure to enable all content capabilities</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                  <div>
                    <p className="text-sm text-slate-700">Copy the <strong>Internal Integration Secret</strong> and paste it below</p>
                  </div>
                </li>
              </ol>
            </div>

            {/* Token input */}
            <div className="space-y-3">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={token}
                  onChange={(e) => { setToken(e.target.value); setTestResult(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") testConnection(); }}
                  placeholder="ntn_xxxxxxxxxxxxxxxxxxxxx"
                  className={`w-full px-4 py-3 border-2 rounded-xl text-sm font-mono transition-all ${
                    testResult === "success" ? "border-green-400 bg-green-50" :
                    testResult === "error" ? "border-red-300 bg-red-50" :
                    "border-slate-200 bg-white"
                  }`}
                />
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>

              {testResult === "error" && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{testError}</p>
              )}

              {testResult === "success" && (
                <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Connected successfully! Loading next step...
                </p>
              )}

              <button
                onClick={testConnection}
                disabled={testing || !token.trim() || testResult === "success"}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
              >
                {testing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Testing connection...
                  </span>
                ) : testResult === "success" ? (
                  "Connected!"
                ) : (
                  "Connect & Continue"
                )}
              </button>

              <button
                onClick={() => { updateSettings({ onboardingComplete: true }); router.push("/"); }}
                className="w-full py-2 text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                Skip for now — I&apos;ll connect later
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Choose first template */}
        {step === 2 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8 page-enter">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">{"\u{1F3AF}"}</span>
              </div>
              <h2 className="text-2xl font-bold text-slate-900">What do you want to build first?</h2>
              <p className="text-slate-500 mt-2">Pick the template that excites you most — you can always build more later</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {TEMPLATE_OPTIONS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleTemplateSelect(t.id)}
                  className={`relative p-5 rounded-xl border-2 text-left transition-all hover:shadow-md ${
                    selectedTemplate === t.id
                      ? "border-indigo-500 bg-indigo-50 shadow-md"
                      : "border-slate-200 hover:border-indigo-300 bg-white"
                  }`}
                >
                  {t.popular && (
                    <span className="absolute -top-2 right-3 px-2 py-0.5 bg-amber-400 text-white text-[10px] font-bold rounded-full">
                      POPULAR
                    </span>
                  )}
                  <span className="text-3xl">{t.icon}</span>
                  <p className="text-sm font-semibold text-slate-800 mt-2">{t.name}</p>
                  <p className="text-xs text-slate-500 mt-1">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Ready! */}
        {step === 3 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8 page-enter text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-slate-900 mb-2">You&apos;re all set!</h2>
            <p className="text-slate-500 mb-6">Your workspace is connected and your first template is queued</p>

            <div className="bg-slate-50 rounded-xl p-4 mb-6 inline-flex items-center gap-3">
              <span className="text-2xl">
                {TEMPLATE_OPTIONS.find((t) => t.id === selectedTemplate)?.icon || "\u{1F31F}"}
              </span>
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-800">
                  {TEMPLATE_OPTIONS.find((t) => t.id === selectedTemplate)?.name || "Template"}
                </p>
                <p className="text-xs text-slate-500">Ready to build</p>
              </div>
              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">QUEUED</span>
            </div>

            <div>
              <button
                onClick={handleFinish}
                className="px-8 py-3.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg hover:shadow-xl"
              >
                {"\u{1F680}"} Build My First Template
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
