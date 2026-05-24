"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useSettings, type CraftPlanSettings } from "@/hooks/useSettings";

// ── Toggle component ──
function Toggle({ label, description, checked, onChange }: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative mt-0.5">
        <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <div className={`w-10 h-6 rounded-full transition-colors ${checked ? "bg-indigo-600" : "bg-white/[0.15]"}`} />
        <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)] group-hover:text-white">{label}</p>
        {description && <p className="text-xs text-[var(--text-muted)] mt-0.5">{description}</p>}
      </div>
    </label>
  );
}

// ── Radio card ──
function RadioCard({ label, description, selected, onClick, icon }: {
  label: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
  icon?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-3 rounded-xl border-2 transition-all min-w-0 ${
        selected
          ? "border-indigo-500/60 bg-indigo-950/30 ring-1 ring-indigo-500/30"
          : "border-white/[0.08] bg-[var(--bg-elevated)] hover:border-white/[0.15]"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-base flex-shrink-0">{icon}</span>}
        <span className={`text-xs font-semibold ${selected ? "text-indigo-400" : "text-[var(--text-primary)]"}`}>{label}</span>
      </div>
      {description && <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-tight">{description}</p>}
    </button>
  );
}

// ── Segmented control ──
function SegmentedControl({ options, value, onChange }: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex bg-white/[0.06] rounded-lg p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            value === opt.value
              ? "bg-white/[0.1] text-white"
              : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Section 1: Notion Connection ──
function NotionSection() {
  const { settings, updateSettings } = useSettings();
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pages, setPages] = useState<Array<{ id: string; title: string }>>([]);

  async function testConnection() {
    if (!settings.notionToken.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const resp = await fetch("/api/notion/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: settings.notionToken }),
      });
      const data = await resp.json();
      if (data.connected) {
        setTestResult({ ok: true, message: `Connected - Workspace: ${data.botName || "Notion"}` });
        if (Array.isArray(data.pages)) setPages(data.pages);
      } else {
        setTestResult({ ok: false, message: data.error || "Invalid token" });
      }
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : "Connection failed" });
    }
    setTesting(false);
  }

  // Auto-test on mount if token exists
  useEffect(() => {
    if (settings.notionToken) testConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">📝</span>
        <h3 className="font-semibold text-white">Notion Connection</h3>
        {testResult?.ok && (
          <span className="text-xs px-2 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-full font-medium">Connected</span>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Integration Token</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showToken ? "text" : "password"}
                value={settings.notionToken}
                onChange={(e) => updateSettings({ notionToken: e.target.value })}
                placeholder="ntn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2.5 border border-white/[0.1] bg-[var(--bg-surface)] rounded-lg text-sm font-mono pr-10 text-white placeholder-[var(--text-muted)]"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-xs"
              >
                {showToken ? "Hide" : "Show"}
              </button>
            </div>
            <button
              onClick={testConnection}
              disabled={testing || !settings.notionToken.trim()}
              className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap shadow-lg shadow-indigo-500/20"
            >
              {testing ? "Testing..." : "Test Connection"}
            </button>
          </div>
        </div>

        {testResult && (
          <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
            testResult.ok ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" : "bg-red-500/15 text-red-400 border border-red-500/25"
          }`}>
            <span>{testResult.ok ? "\u2705" : "\u274C"}</span>
            {testResult.message}
          </div>
        )}

        {pages.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Default Parent Page</label>
            <select
              value={settings.defaultParentPageId}
              onChange={(e) => updateSettings({ defaultParentPageId: e.target.value })}
              className="w-full px-3 py-2.5 border border-white/[0.1] bg-[var(--bg-surface)] rounded-lg text-sm text-white"
            >
              <option value="">Select a page...</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>{p.title || "Untitled"}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section 2: Generation Defaults ──
function GenerationSection() {
  const { settings, updateSettings } = useSettings();

  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">{"\u2699\uFE0F"}</span>
        <h3 className="font-semibold text-white">Generation Defaults</h3>
      </div>

      <div className="space-y-6">
        {/* Default Variant */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Default Aesthetic</label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { v: "minimal" as const, label: "Clean", icon: "\u26AA", desc: "B&W" },
              { v: "dark" as const, label: "Dark", icon: "\u26AB", desc: "Dark mode" },
              { v: "brown" as const, label: "Warm", icon: "\uD83D\uDFE4", desc: "Brown" },
              { v: "pink" as const, label: "Pink", icon: "\uD83D\uDFE3", desc: "It Girl" },
            ].map((opt) => (
              <RadioCard
                key={opt.v}
                label={opt.label}
                description={opt.desc}
                icon={opt.icon}
                selected={settings.defaultVariant === opt.v}
                onClick={() => updateSettings({ defaultVariant: opt.v })}
              />
            ))}
          </div>
        </div>

        {/* Default Complexity */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Default Complexity</label>
          <SegmentedControl
            options={[
              { value: "simple", label: "Simple" },
              { value: "medium", label: "Medium" },
              { value: "advanced", label: "Advanced" },
            ]}
            value={settings.defaultComplexity}
            onChange={(v) => updateSettings({ defaultComplexity: v as CraftPlanSettings["defaultComplexity"] })}
          />
        </div>

        {/* Default Build Method */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Default Build Method</label>
          <div className="grid grid-cols-3 gap-2">
            <RadioCard
              label="Notion API"
              description="Builds in Notion"
              icon={"\uD83D\uDE80"}
              selected={settings.defaultBuildMethod === "notion-api"}
              onClick={() => updateSettings({ defaultBuildMethod: "notion-api" })}
            />
            <RadioCard
              label="AI Build"
              description="Gemini spec"
              icon={"\u2728"}
              selected={settings.defaultBuildMethod === "ai-build"}
              onClick={() => updateSettings({ defaultBuildMethod: "ai-build" })}
            />
            <RadioCard
              label="Copy Prompts"
              description="Manual setup"
              icon={"\uD83D\uDCCB"}
              selected={settings.defaultBuildMethod === "copy-prompts"}
              onClick={() => updateSettings({ defaultBuildMethod: "copy-prompts" })}
            />
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-4 pt-2 border-t border-white/[0.06]">
          <Toggle
            label="Auto-patch after generate"
            description="Automatically apply premium upgrades (covers, linked views) after building"
            checked={settings.autoPatchAfterGenerate}
            onChange={(v) => updateSettings({ autoPatchAfterGenerate: v })}
          />
          <Toggle
            label="Auto-generate Etsy listing"
            description="Generate title, description, tags, and FAQs for Etsy after building"
            checked={settings.autoGenerateEtsyListing}
            onChange={(v) => updateSettings({ autoGenerateEtsyListing: v })}
          />
          <Toggle
            label="Auto-score quality"
            description="Compute quality score and tier estimate after building"
            checked={settings.autoScoreQuality}
            onChange={(v) => updateSettings({ autoScoreQuality: v })}
          />
        </div>
      </div>
    </div>
  );
}

// ── Section 3: Etsy Integration ──
function EtsySection() {
  const { settings, updateSettings } = useSettings();
  const [showKey, setShowKey] = useState(false);

  // Etsy OAuth connection state
  const searchParams = useSearchParams();
  const [oauthConnected, setOauthConnected] = useState(false);
  const [oauthShop, setOauthShop] = useState("");
  const [tokenHealth, setTokenHealth] = useState<"healthy" | "expiring-soon" | "expired" | null>(null);
  const [checking, setChecking] = useState(true);
  // OAuth-flow error surface — the /api/etsy/callback route redirects
  // to /settings?error=<message> when the token exchange fails (bad
  // code, mismatched redirect_uri, network blip, etc.).  Without this
  // surface those failures were silent: the user landed back on
  // /settings, saw "Not connected", and had no idea why.
  const [etsyError, setEtsyError] = useState<string | null>(null);

  // Restore connection state from DB on mount, THEN check URL params
  useEffect(() => {
    setChecking(true);
    fetch("/api/etsy/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.connected) {
          setOauthConnected(true);
          setOauthShop(data.shopId || "");
          setTokenHealth(data.tokenHealth || null);
          if (data.shopId && !settings.etsyShopName) {
            updateSettings({ etsyShopName: data.shopId });
          }
        }
      })
      .catch(() => { /* ignore */ })
      .finally(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Also check URL params (after OAuth redirect)
  useEffect(() => {
    const connectedParam = searchParams.get("connected");
    const shopParam = searchParams.get("shop");
    if (connectedParam === "true" && shopParam) {
      setOauthConnected(true);
      setOauthShop(shopParam);
      setTokenHealth("healthy");
      if (!settings.etsyShopName) updateSettings({ etsyShopName: shopParam });
      // Clean URL params after processing
      window.history.replaceState({}, "", "/settings");
    }
    // Surface OAuth callback failures.  /api/etsy/callback sends
    // ?error=<message> on a failed token exchange; without this read
    // the user sees no feedback and the cause stays hidden.
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setEtsyError(decodeURIComponent(errorParam));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function connectEtsy() {
    try {
      const resp = await fetch("/api/etsy/auth");
      const data = await resp.json();
      if (data.url) window.location.href = data.url;
    } catch {
      // ignore
    }
  }

  const healthColor =
    tokenHealth === "healthy"
      ? "emerald"
      : tokenHealth === "expiring-soon"
      ? "amber"
      : tokenHealth === "expired"
      ? "red"
      : null;

  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">{"\uD83C\uDFE0"}</span>
        <h3 className="font-semibold text-white">Etsy Integration</h3>
        {oauthConnected && (
          <span className="text-xs px-2 py-0.5 bg-orange-500/15 text-orange-400 border border-orange-500/25 rounded-full font-medium">
            {oauthShop}
          </span>
        )}
        {checking && (
          <span className="text-[10px] text-white/30">Checking...</span>
        )}
      </div>

      <div className="space-y-4">
        {/* Token health indicator */}
        {oauthConnected && healthColor && (
          <div
            className={`p-3 rounded-lg text-sm flex items-center gap-2 border ${
              healthColor === "emerald"
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                : healthColor === "amber"
                ? "bg-amber-500/15 text-amber-400 border-amber-500/25"
                : "bg-red-500/15 text-red-400 border-red-500/25"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                healthColor === "emerald"
                  ? "bg-emerald-400"
                  : healthColor === "amber"
                  ? "bg-amber-400 animate-pulse"
                  : "bg-red-400"
              }`}
            />
            {tokenHealth === "healthy" && "Etsy OAuth connected and healthy"}
            {tokenHealth === "expiring-soon" && "Etsy token expiring soon \u2014 consider reconnecting"}
            {tokenHealth === "expired" && "Etsy token expired \u2014 please reconnect"}
          </div>
        )}

        {/* OAuth Connect / Reconnect */}
        {!oauthConnected ? (
          <button
            onClick={connectEtsy}
            disabled={checking}
            className="px-5 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            Connect Etsy Account
          </button>
        ) : (
          <button
            onClick={connectEtsy}
            className="px-5 py-2.5 bg-white/[0.06] text-[var(--text-primary)] rounded-lg text-sm font-medium hover:bg-white/[0.1] border border-white/[0.08] transition-colors"
          >
            Reconnect Etsy Account
          </button>
        )}
        {etsyError && (
          <p className="text-sm text-red-400 mt-2">OAuth error: {etsyError}</p>
        )}

        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Shop Name</label>
          <input
            type="text"
            value={settings.etsyShopName}
            onChange={(e) => updateSettings({ etsyShopName: e.target.value })}
            placeholder="YourEtsyShop"
            className="w-full px-3 py-2.5 border border-white/[0.1] bg-[var(--bg-surface)] rounded-lg text-sm text-white placeholder-[var(--text-muted)]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">API Key</label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={settings.etsyApiKey}
              onChange={(e) => updateSettings({ etsyApiKey: e.target.value })}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-3 py-2.5 border border-white/[0.1] bg-[var(--bg-surface)] rounded-lg text-sm font-mono pr-16 text-white placeholder-[var(--text-muted)]"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-xs"
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Currency</label>
          <select
            value={settings.currency}
            onChange={(e) => updateSettings({ currency: e.target.value as CraftPlanSettings["currency"] })}
            className="w-40 px-3 py-2.5 border border-white/[0.1] bg-[var(--bg-surface)] rounded-lg text-sm text-white"
          >
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (\u20AC)</option>
            <option value="GBP">GBP (\u00A3)</option>
          </select>
        </div>

        <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 flex items-start gap-2">
          <span className="text-orange-400 mt-0.5">{"\u2139\uFE0F"}</span>
          <div className="text-xs text-orange-300">
            <p className="font-medium mb-1">Printful-first workflow</p>
            <p className="text-orange-300/80">
              Products are pushed to Printful, which creates Etsy drafts via its official integration.
              Use the Etsy Draft Finisher in Product Studio to complete listings with the browser extension.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Section 4: Print On Demand ──
function PrintOnDemandSection() {
  const { settings, updateSettings } = useSettings();
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; store?: { id: number; name: string }; storeType?: string } | null>(null);

  async function testPrintfulConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      // Use the server-side env var by default; override with client token if provided
      const headers: Record<string, string> = {};
      if (settings.printfulToken.trim()) {
        headers["x-printful-token"] = settings.printfulToken;
      }
      const resp = await fetch("/api/printful/status", { headers });
      const data = await resp.json();
      if (data.connected) {
        setTestResult({
          ok: true,
          message: `Connected! Store: ${data.store?.name || "Printful"} (${data.storeType || data.store?.type || "unknown"})`,
          store: data.store,
          storeType: data.storeType,
        });
        // Auto-set store ID
        if (!settings.printfulStoreId && data.store?.id) {
          updateSettings({ printfulStoreId: String(data.store.id) });
        }
      } else {
        setTestResult({ ok: false, message: data.error || "Invalid token" });
      }
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : "Connection failed" });
    }
    setTesting(false);
  }

  // Auto-test connection on mount (uses server-side PRINTFUL_API_KEY)
  useEffect(() => {
    testPrintfulConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">🎨</span>
        <h3 className="font-semibold text-white">Print On Demand</h3>
        {testResult?.ok && (
          <span className="text-xs px-2 py-0.5 bg-purple-500/15 text-purple-400 border border-purple-500/25 rounded-full font-medium">
            Connected
          </span>
        )}
      </div>

      <div className="space-y-4">
        {/* Printful Token */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
            Printful API Token
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showToken ? "text" : "password"}
                value={settings.printfulToken}
                onChange={(e) => updateSettings({ printfulToken: e.target.value })}
                placeholder="Private token from Printful Dashboard..."
                className="w-full px-3 py-2.5 border border-white/[0.1] bg-[var(--bg-surface)] rounded-lg text-sm font-mono pr-10 text-white placeholder-[var(--text-muted)]"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-xs"
              >
                {showToken ? "Hide" : "Show"}
              </button>
            </div>
            <button
              onClick={testPrintfulConnection}
              disabled={testing || !settings.printfulToken.trim()}
              className="px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors whitespace-nowrap shadow-lg shadow-purple-500/20"
            >
              {testing ? "Testing..." : "Test Connection"}
            </button>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-1">
            Get your token from{" "}
            <a
              href="https://www.printful.com/dashboard/developer/api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 underline"
            >
              Printful Dashboard → Settings → API
            </a>
          </p>
        </div>

        {/* Test result */}
        {testResult && (
          <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
            testResult.ok
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
              : "bg-red-500/15 text-red-400 border border-red-500/25"
          }`}>
            <span>{testResult.ok ? "✅" : "❌"}</span>
            {testResult.message}
          </div>
        )}

        {/* Store Info */}
        {testResult?.store && (
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              Store
            </label>
            <div className="px-3 py-2.5 border border-white/[0.1] bg-[var(--bg-surface)] rounded-lg text-sm text-white">
              {testResult.store.name} (ID: {testResult.store.id})
            </div>
          </div>
        )}

        {/* Default Markup */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
            Default Markup: {settings.defaultPodMarkupPercent}%
          </label>
          <input
            type="range"
            min={20}
            max={80}
            step={5}
            value={settings.defaultPodMarkupPercent}
            onChange={(e) => updateSettings({ defaultPodMarkupPercent: Number(e.target.value) })}
            className="w-full accent-purple-500"
          />
          <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-1">
            <span>20% (Competitive)</span>
            <span>40% (Recommended)</span>
            <span>80% (Premium)</span>
          </div>
        </div>

        {/* Info */}
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 flex items-start gap-2">
          <span className="text-purple-400 mt-0.5">ℹ️</span>
          <div className="text-xs text-purple-300">
            <p className="font-medium mb-1">How Print On Demand works:</p>
            <p className="text-purple-300/80">
              Upload designs → Apply to products (t-shirts, mugs, posters) → List on Etsy.
              When a customer orders, Printful handles printing &amp; shipping. Zero inventory needed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Section 5: Extension ──
function ExtensionSection() {
  const { settings, updateSettings } = useSettings();
  const [extStatus, setExtStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  async function testExtension() {
    setTesting(true);
    setExtStatus(null);
    try {
      const resp = await fetch(`${settings.craftplanUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        setExtStatus({ ok: true, message: "Extension connected" });
      } else {
        setExtStatus({ ok: false, message: `Server responded with ${resp.status}` });
      }
    } catch {
      setExtStatus({ ok: false, message: "Not reachable" });
    }
    setTesting(false);
  }

  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">{"\uD83D\uDD0C"}</span>
        <h3 className="font-semibold text-white">CraftPlan Extension</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Server URL</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={settings.craftplanUrl}
              onChange={(e) => updateSettings({ craftplanUrl: e.target.value })}
              className="flex-1 px-3 py-2.5 border border-white/[0.1] bg-[var(--bg-surface)] rounded-lg text-sm font-mono text-white"
            />
            <button
              onClick={testExtension}
              disabled={testing}
              className="px-4 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/[0.08] rounded-lg text-sm font-medium disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {testing ? "Testing..." : "Test Connection"}
            </button>
          </div>
        </div>

        {extStatus && (
          <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
            extStatus.ok ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" : "bg-red-500/15 text-red-400 border border-red-500/25"
          }`}>
            <span>{extStatus.ok ? "\u2705" : "\u274C"}</span>
            {extStatus.message}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Extension ID</label>
          <input
            type="text"
            value={settings.extensionId}
            onChange={(e) => updateSettings({ extensionId: e.target.value })}
            placeholder="abcdefghijklmnopqrstuvwxyz..."
            className="w-full px-3 py-2.5 border border-white/[0.1] bg-[var(--bg-surface)] rounded-lg text-sm font-mono text-white placeholder-[var(--text-muted)]"
          />
          <p className="text-[10px] text-[var(--text-muted)] mt-1">
            Find your Extension ID at <code className="bg-white/[0.08] px-1 py-0.5 rounded">chrome://extensions</code> after installing the CraftPlan POD Scanner extension.
          </p>
        </div>

        <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg p-4 space-y-2">
          <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Setup Guide</p>
          <div className="space-y-1.5">
            <p className="text-xs text-[var(--text-secondary)] flex gap-2"><span className="font-bold text-[var(--text-muted)]">1.</span> Install the CraftPlan POD Scanner Chrome extension</p>
            <p className="text-xs text-[var(--text-secondary)] flex gap-2"><span className="font-bold text-[var(--text-muted)]">2.</span> Copy the Extension ID from <code className="bg-white/[0.08] px-1 py-0.5 rounded text-[11px] font-mono">chrome://extensions</code></p>
            <p className="text-xs text-[var(--text-secondary)] flex gap-2"><span className="font-bold text-[var(--text-muted)]">3.</span> Paste it in the Extension ID field above</p>
            <p className="text-xs text-[var(--text-secondary)] flex gap-2"><span className="font-bold text-[var(--text-muted)]">4.</span> In the extension popup &rarr; Settings, set CraftPlan URL to: <code className="bg-white/[0.08] px-1.5 py-0.5 rounded text-[11px] font-mono text-[var(--text-primary)]">{settings.craftplanUrl}</code></p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Section 5: Data Management ──
function DataSection() {
  const { resetSettings } = useSettings();
  const [confirmText, setConfirmText] = useState("");
  const [storageStats, setStorageStats] = useState({ templates: 0, storageKb: 0 });

  useEffect(() => {
    // Calculate storage stats
    let totalBytes = 0;
    let templateCount = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const val = localStorage.getItem(key) || "";
        totalBytes += key.length + val.length;
        if (key.includes("template") || key.includes("catalog")) templateCount++;
      }
    }
    setStorageStats({ templates: templateCount, storageKb: Math.round(totalBytes / 1024) });
  }, []);

  function exportCatalog() {
    const data: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) data[key] = localStorage.getItem(key) || "";
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "craftplan-data-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importCatalog() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text) as Record<string, string>;
        for (const [key, val] of Object.entries(data)) {
          localStorage.setItem(key, val);
        }
        window.location.reload();
      } catch {
        alert("Invalid JSON file");
      }
    };
    input.click();
  }

  function clearAllData() {
    if (confirmText !== "DELETE") return;
    localStorage.clear();
    resetSettings();
    setConfirmText("");
    window.location.reload();
  }

  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">{"\uD83D\uDDC4\uFE0F"}</span>
        <h3 className="font-semibold text-white">Data Management</h3>
      </div>

      <div className="space-y-4">
        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-[var(--text-muted)] bg-white/[0.04] rounded-lg p-3">
          <span>{storageStats.templates} items in storage</span>
          <span className="w-px h-3 bg-white/[0.1]" />
          <span>{storageStats.storageKb} KB used</span>
        </div>

        {/* Export / Import */}
        <div className="flex gap-2">
          <button
            onClick={exportCatalog}
            className="px-4 py-2.5 bg-white/[0.06] text-[var(--text-primary)] rounded-lg text-sm font-medium hover:bg-white/[0.1] transition-colors border border-white/[0.08]"
          >
            {"\uD83D\uDCE5"} Export Data (JSON)
          </button>
          <button
            onClick={importCatalog}
            className="px-4 py-2.5 bg-white/[0.06] text-[var(--text-primary)] rounded-lg text-sm font-medium hover:bg-white/[0.1] transition-colors border border-white/[0.08]"
          >
            {"\uD83D\uDCE4"} Import Data
          </button>
        </div>

        {/* Clear All */}
        <div className="pt-4 border-t border-white/[0.06]">
          <p className="text-sm font-medium text-red-400 mb-2">Danger Zone</p>
          <p className="text-xs text-[var(--text-muted)] mb-3">Type <strong>DELETE</strong> to confirm clearing all local data. This cannot be undone.</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder='Type "DELETE" to confirm'
              className="w-48 px-3 py-2 border border-red-500/30 bg-[var(--bg-surface)] rounded-lg text-sm text-red-400 placeholder-red-500/40 focus:outline-none focus:ring-2 focus:ring-red-500/30"
            />
            <button
              onClick={clearAllData}
              disabled={confirmText !== "DELETE"}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Clear All Data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Settings Page ──
function SettingsContent() {
  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white tracking-tight">Settings</h2>
        <p className="text-[var(--text-secondary)] mt-1">Configure connections, generation defaults, and data management</p>
      </div>

      <div className="space-y-6">
        <NotionSection />
        <GenerationSection />
        <EtsySection />
        <PrintOnDemandSection />
        <ExtensionSection />
        <DataSection />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-8"><p className="text-[var(--text-muted)]">Loading settings...</p></div>}>
      <SettingsContent />
    </Suspense>
  );
}
