"use client";

import { useState, useRef } from "react";

const PLANNER_TYPES = [
  { value: "weekly", label: "Weekly Planner", icon: "📅", desc: "7-day layout with priorities, tasks & notes" },
  { value: "monthly", label: "Monthly Planner", icon: "🗓️", desc: "Calendar grid with goals & notes" },
  { value: "daily", label: "Daily Planner", icon: "📝", desc: "Hourly schedule, to-do, gratitude" },
  { value: "habit_tracker", label: "Habit Tracker", icon: "✅", desc: "Track 20 habits across 30/31 days" },
  { value: "budget", label: "Budget Planner", icon: "💰", desc: "Income, expenses, savings tracker" },
  { value: "meal_planner", label: "Meal Planner", icon: "🍽️", desc: "Weekly meals + grocery list" },
  { value: "goals", label: "Goals Planner", icon: "🎯", desc: "Quarterly goals with action steps" },
  { value: "gratitude", label: "Gratitude Journal", icon: "🙏", desc: "Daily gratitude & reflection" },
];

const COLOR_THEMES = [
  { value: "minimal", label: "Minimal", colors: ["#262626", "#666666", "#F2F2F2"] },
  { value: "blush", label: "Blush Pink", colors: ["#D98C99", "#FAC8CE", "#FAF0F2"] },
  { value: "sage", label: "Sage Green", colors: ["#739478", "#B3CCB8", "#F0F8F0"] },
  { value: "ocean", label: "Ocean Blue", colors: ["#3373A6", "#8CBFE0", "#EDF5FA"] },
  { value: "lavender", label: "Lavender", colors: ["#8C73B3", "#C7B3E6", "#F5F0FA"] },
  { value: "terracotta", label: "Terracotta", colors: ["#C27352", "#E6B899", "#FAF2ED"] },
];

const PAPER_SIZES = [
  { value: "letter", label: 'US Letter (8.5"x11")' },
  { value: "a4", label: "A4 (210x297mm)" },
  { value: "a5", label: "A5 (148x210mm)" },
];

// ── Planner Mockup Scene Configurations ──
const PLANNER_MOCKUP_SCENES = [
  {
    id: "desk-hero",
    label: "Desk Hero Shot",
    badge: "Thumbnail",
    badgeColor: "bg-red-100 text-red-700",
    prompt: (plannerName: string, themeName: string) =>
      `A photorealistic image of a beautiful ${themeName} colored ${plannerName} printable planner open on a clean minimalist wooden desk, with a premium pen, a white ceramic coffee mug, and a small succulent plant, clean white background, soft natural lighting from the side, professional product photography. The planner pages show organized sections with headers, checkboxes, and clean typography. This is a product listing hero image, ultra sharp focus on the planner pages. High resolution, 4K quality, photorealistic rendering, editorial style.`,
  },
  {
    id: "lifestyle-cozy",
    label: "Cozy Lifestyle",
    badge: "Lifestyle",
    badgeColor: "bg-amber-100 text-amber-700",
    prompt: (plannerName: string, themeName: string) =>
      `A photorealistic image of a beautiful ${themeName} colored ${plannerName} printable planner open on a cozy home desk near a window with warm natural light, with a warm cup of coffee, fresh flowers in a small vase, and a cozy knitted throw nearby, warm golden natural lighting, autumn vibes, professional product photography. The planner pages show clean organized layouts with checkboxes and colored sections. Lifestyle product photography, natural and authentic feeling. High resolution, 4K quality, photorealistic rendering.`,
  },
  {
    id: "flatlay",
    label: "Flat Lay Aesthetic",
    badge: "Trendy",
    badgeColor: "bg-pink-100 text-pink-700",
    prompt: (plannerName: string, themeName: string) =>
      `A photorealistic flat lay top-down photograph of a beautiful ${themeName} colored ${plannerName} printable planner open on a clean white surface, surrounded by a premium pen, pastel sticky notes, a small potted plant, paper clips, and a cup of coffee, organized aesthetic arrangement, soft diffused natural lighting, professional product photography, Instagram-worthy styling. The planner pages show beautiful organized layouts. High resolution, 4K quality, photorealistic rendering.`,
  },
  {
    id: "ipad-digital",
    label: "iPad Digital Use",
    badge: "Digital",
    badgeColor: "bg-blue-100 text-blue-700",
    prompt: (plannerName: string, themeName: string) =>
      `A photorealistic image of an iPad tablet displaying a beautiful ${themeName} colored ${plannerName} digital planner PDF with organized sections, checkboxes, and clean typography, with an Apple Pencil stylus next to it, on a clean minimalist white desk, with a small succulent plant nearby, soft natural lighting, professional product photography. Close-up shot focused on the screen, showing the planner can be used digitally on a tablet. High resolution, 4K quality, photorealistic rendering.`,
  },
];

interface PlannerMockupImage {
  id: string;
  sceneIndex: number;
  label: string;
  badge: string;
  badgeColor: string;
  imageData: string | null;
  prompt: string;
  status: "pending" | "generating" | "loaded" | "error";
  model?: string;
  errorMsg?: string;
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
  onComplete?: (index: number, result: T) => void
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      const result = await tasks[idx]();
      results[idx] = result;
      onComplete?.(idx, result);
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ── Etsy Listing Generator for Planners ──
function generateEtsyListing(plannerType: string, themeName: string, year: number) {
  const typeInfo = PLANNER_TYPES.find((t) => t.value === plannerType);
  const typeName = typeInfo?.label || "Planner";

  const title = `${typeName} PDF | ${themeName} ${year} Printable Planner | Digital Download | Instant Download`.slice(0, 140);

  const baseTags = [
    plannerType.replace("_", " "),
    "digital planner",
    "printable planner",
    `${year} planner`,
    "pdf planner",
    "instant download",
    typeName.toLowerCase(),
    `${themeName.toLowerCase()} planner`,
    "digital download",
    "planner template",
    "printable pdf",
    "planner insert",
    "goodnotes planner",
  ].slice(0, 13);

  const description = `${typeInfo?.icon || "📋"} ${typeName} - ${themeName} Theme | ${year}

Get organized with this beautiful ${themeName.toLowerCase()} themed ${typeName.toLowerCase()}! Designed for both printing and digital use on tablets like iPad with GoodNotes or Notability.

${String.fromCodePoint(0x2728)} WHAT'S INCLUDED:
${String.fromCodePoint(0x2022)} High-quality PDF planner (print-ready)
${String.fromCodePoint(0x2022)} ${typeInfo?.desc || "Complete planner layout"}
${String.fromCodePoint(0x2022)} Beautiful ${themeName.toLowerCase()} color theme
${String.fromCodePoint(0x2022)} Works for ${year}

${String.fromCodePoint(0x1F3AF)} FEATURES:
${String.fromCodePoint(0x2022)} Clean, modern design
${String.fromCodePoint(0x2022)} Easy to print at home or at a print shop
${String.fromCodePoint(0x2022)} Compatible with GoodNotes, Notability, and other PDF apps
${String.fromCodePoint(0x2022)} US Letter, A4, and A5 sizes available

${String.fromCodePoint(0x1F4F1)} HOW TO USE:
1. Download the PDF file after purchase
2. Print at home or send to a print shop
3. OR import into GoodNotes/Notability on your iPad
4. Start planning and organizing your life!

${String.fromCodePoint(0x2764)} PERFECT FOR:
${String.fromCodePoint(0x2022)} Anyone who loves beautiful, organized planning
${String.fromCodePoint(0x2022)} Students, professionals, and busy parents
${String.fromCodePoint(0x2022)} People who prefer printable over digital planners

${String.fromCodePoint(0x26A0)} This is a DIGITAL product - no physical item will be shipped.
Instant download after purchase!

Tags: ${baseTags.join(", ")}`;

  return { title, tags: baseTags, description };
}

type Tab = "pdf" | "notion";

export default function PlannersPage() {
  const [activeTab, setActiveTab] = useState<Tab>("pdf");

  // PDF Generator state
  const [plannerType, setPlannerType] = useState("weekly");
  const [theme, setTheme] = useState("minimal");
  const [paperSize, setPaperSize] = useState("letter");
  const [year, setYear] = useState(new Date().getFullYear());
  const [title, setTitle] = useState("");
  const [includeNotes, setIncludeNotes] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{
    title: string;
    downloadUrl: string;
    size: number;
    id: number;
  } | null>(null);
  const [error, setError] = useState("");

  // Mockup generation state
  const [mockupImages, setMockupImages] = useState<PlannerMockupImage[]>([]);
  const [mockupGenerating, setMockupGenerating] = useState(false);
  const mockupAbortRef = useRef<AbortController | null>(null);
  const [copied, setCopied] = useState("");

  // Etsy listing state
  const [showEtsyListing, setShowEtsyListing] = useState(false);

  // Notion Template state
  const [notionUrl, setNotionUrl] = useState("");
  const [notionTitle, setNotionTitle] = useState("");
  const [notionCategory, setNotionCategory] = useState("planner");
  const [notionDesc, setNotionDesc] = useState("");
  const [notionSaved, setNotionSaved] = useState(false);

  async function generatePDF() {
    setGenerating(true);
    setError("");
    setResult(null);

    try {
      const resp = await fetch("/api/generate/planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: plannerType,
          theme,
          title: title || undefined,
          year,
          paperSize,
          includeNotes,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Generation failed");

      setResult({
        title: data.title,
        downloadUrl: data.downloadUrl,
        size: data.size,
        id: data.id,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function saveNotionTemplate() {
    if (!notionUrl || !notionTitle) return;

    try {
      const resp = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "notion_template",
          title: notionTitle,
          prompt: notionDesc,
          file_paths: notionUrl,
          preview_path: "",
          price: 4.99,
        }),
      });

      if (resp.ok) {
        setNotionSaved(true);
        setTimeout(() => setNotionSaved(false), 3000);
      }
    } catch {
      setError("Failed to save Notion template");
    }
  }

  // ── Mockup Generation Functions ──
  async function generatePlannerMockups() {
    mockupAbortRef.current?.abort();
    const controller = new AbortController();
    mockupAbortRef.current = controller;

    setMockupGenerating(true);
    const typeInfo = PLANNER_TYPES.find((t) => t.value === plannerType);
    const themeInfo = COLOR_THEMES.find((t) => t.value === theme);
    const plannerName = typeInfo?.label || "Planner";
    const themeName = themeInfo?.label || "Minimal";

    const initialImages: PlannerMockupImage[] = PLANNER_MOCKUP_SCENES.map((scene, i) => ({
      id: `${scene.id}-${Date.now()}-${i}`,
      sceneIndex: i,
      label: scene.label,
      badge: scene.badge,
      badgeColor: scene.badgeColor,
      imageData: null,
      prompt: scene.prompt(plannerName, themeName),
      status: "pending" as const,
    }));
    setMockupImages(initialImages);

    const tasks = PLANNER_MOCKUP_SCENES.map((scene, i) => async () => {
      setMockupImages((prev) =>
        prev.map((img, idx) => (idx === i ? { ...img, status: "generating" as const } : img))
      );

      const prompt = scene.prompt(plannerName, themeName);
      try {
        const resp = await fetch("/api/ai/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            provider: "pollinations",
            width: 1920,
            height: 1080,
            model: "flux",
            seed: Math.floor(Math.random() * 2147483647),
            enhance: true,
          }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({ error: "Unknown error" }));
          return { imageData: null as string | null, model: undefined as string | undefined, error: errData.error || `HTTP ${resp.status}` };
        }

        const data = await resp.json();
        if (data.image) {
          const mimeType = data.mimeType || "image/jpeg";
          const dataUrl = `data:${mimeType};base64,${data.image}`;
          return { imageData: dataUrl as string | null, model: data.model as string | undefined, error: undefined as string | undefined };
        }
        return { imageData: null as string | null, model: undefined as string | undefined, error: "No image in response" };
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return { imageData: null as string | null, model: undefined as string | undefined, error: "Cancelled" };
        }
        return { imageData: null as string | null, model: undefined as string | undefined, error: String(err) };
      }
    });

    await runWithConcurrency(tasks, 2, (index, result) => {
      setMockupImages((prev) =>
        prev.map((img, idx) =>
          idx === index
            ? {
                ...img,
                imageData: result.imageData,
                model: result.model,
                status: result.imageData ? ("loaded" as const) : ("error" as const),
                errorMsg: result.error,
              }
            : img
        )
      );
    });

    setMockupGenerating(false);
  }

  async function retryPlannerMockup(index: number) {
    const scene = PLANNER_MOCKUP_SCENES[index];
    if (!scene) return;
    const typeInfo = PLANNER_TYPES.find((t) => t.value === plannerType);
    const themeInfo = COLOR_THEMES.find((t) => t.value === theme);

    setMockupImages((prev) =>
      prev.map((img, i) =>
        i === index ? { ...img, status: "generating" as const, imageData: null, errorMsg: undefined } : img
      )
    );

    const prompt = scene.prompt(typeInfo?.label || "Planner", themeInfo?.label || "Minimal");
    try {
      const resp = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          provider: "pollinations",
          width: 1920,
          height: 1080,
          model: "flux",
          seed: Math.floor(Math.random() * 2147483647),
          enhance: true,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: "Unknown error" }));
        setMockupImages((prev) =>
          prev.map((img, i) => (i === index ? { ...img, status: "error" as const, errorMsg: errData.error } : img))
        );
        return;
      }

      const data = await resp.json();
      if (data.image) {
        const mimeType = data.mimeType || "image/jpeg";
        const dataUrl = `data:${mimeType};base64,${data.image}`;
        setMockupImages((prev) =>
          prev.map((img, i) => (i === index ? { ...img, imageData: dataUrl, model: data.model, status: "loaded" as const } : img))
        );
      } else {
        setMockupImages((prev) =>
          prev.map((img, i) => (i === index ? { ...img, status: "error" as const, errorMsg: "No image" } : img))
        );
      }
    } catch (err) {
      setMockupImages((prev) =>
        prev.map((img, i) => (i === index ? { ...img, status: "error" as const, errorMsg: String(err) } : img))
      );
    }
  }

  function downloadMockup(img: PlannerMockupImage) {
    if (!img.imageData) return;
    try {
      const a = document.createElement("a");
      a.href = img.imageData;
      a.download = `planner-mockup-${plannerType}-${img.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      window.open(img.imageData, "_blank");
    }
  }

  async function copyText(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
  }

  const mockupLoadedCount = mockupImages.filter((img) => img.status === "loaded").length;
  const mockupGeneratingCount = mockupImages.filter((img) => img.status === "generating").length;
  const etsyListing = generateEtsyListing(plannerType, COLOR_THEMES.find((t) => t.value === theme)?.label || "Minimal", year);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Planners & Templates</h2>
        <p className="text-slate-500 mt-1">
          Generate printable PDF planners or list Notion templates on Etsy
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("pdf")}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "pdf"
              ? "bg-white text-indigo-700 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          PDF Planner Generator
        </button>
        <button
          onClick={() => setActiveTab("notion")}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "notion"
              ? "bg-white text-indigo-700 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Notion Templates
        </button>
      </div>

      {/* ── PDF PLANNER TAB ── */}
      {activeTab === "pdf" && (
        <div className="grid grid-cols-3 gap-8">
          {/* Left: Type Selection */}
          <div className="col-span-2 space-y-6">
            {/* Planner Type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">
                Choose Planner Type
              </label>
              <div className="grid grid-cols-4 gap-3">
                {PLANNER_TYPES.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setPlannerType(type.value)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      plannerType === type.value
                        ? "border-indigo-500 bg-indigo-50 shadow-sm"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <span className="text-2xl">{type.icon}</span>
                    <p className="text-sm font-medium text-slate-800 mt-1">{type.label}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{type.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Color Theme */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">
                Color Theme
              </label>
              <div className="flex gap-3 flex-wrap">
                {COLOR_THEMES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTheme(t.value)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all ${
                      theme === t.value
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex -space-x-1">
                      {t.colors.map((c, i) => (
                        <div
                          key={i}
                          className="w-4 h-4 rounded-full border border-white"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <span className="text-xs font-medium text-slate-700">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Settings row */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Paper Size</label>
                <select
                  value={paperSize}
                  onChange={(e) => setPaperSize(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  {PAPER_SIZES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Year</label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 pb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeNotes}
                    onChange={(e) => setIncludeNotes(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  <span className="text-sm text-slate-700">Include notes page</span>
                </label>
              </div>
            </div>

            {/* Custom title */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Custom Title (optional)
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Leave blank for auto-generated title"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>

            {/* Generate */}
            <button
              onClick={generatePDF}
              disabled={generating}
              className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {generating ? "Generating PDF..." : "Generate Planner PDF"}
            </button>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
            )}

            {/* Result */}
            {result && (
              <div className="space-y-6">
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-green-600 text-lg">&#10003;</span>
                    <span className="font-medium text-green-800">Planner Generated!</span>
                  </div>
                  <p className="text-sm text-green-700">{result.title}</p>
                  <p className="text-xs text-green-600">
                    Size: {(result.size / 1024).toFixed(1)} KB &middot; Saved to catalog
                  </p>
                  <div className="flex gap-3">
                    <a
                      href={result.downloadUrl}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                      target="_blank"
                    >
                      Download PDF
                    </a>
                    <button
                      onClick={() => setShowEtsyListing(!showEtsyListing)}
                      className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
                    >
                      {showEtsyListing ? "Hide Etsy Details" : "View Etsy Listing Details"}
                    </button>
                  </div>
                </div>

                {/* ── Generate Mockups Section ── */}
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-slate-800">Mockup Images for Etsy</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Generate 4 photorealistic mockup images for your listing</p>
                    </div>
                    <button
                      onClick={generatePlannerMockups}
                      disabled={mockupGenerating}
                      className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-md disabled:opacity-60 disabled:cursor-wait transition-all"
                    >
                      {mockupGenerating ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Generating {mockupLoadedCount}/4...
                        </span>
                      ) : mockupImages.length > 0 ? "Regenerate 4 Mockups" : "Generate 4 Mockups"}
                    </button>
                  </div>

                  {/* Progress bar */}
                  {mockupGenerating && mockupImages.length > 0 && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                        <span>{mockupGeneratingCount > 0 && <span className="text-indigo-600 font-medium">{mockupGeneratingCount} in progress</span>}</span>
                        <span className="font-semibold">{mockupLoadedCount}/4 ready</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-500" style={{ width: `${(mockupLoadedCount / 4) * 100}%` }} />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">Each mockup takes 15-60 seconds. Two generate in parallel.</p>
                    </div>
                  )}
                </div>

                {/* Generated mockup images */}
                {mockupImages.length > 0 && (
                  <div className="grid grid-cols-2 gap-4">
                    {mockupImages.map((img, index) => (
                      <div key={img.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                        <div className="relative aspect-video bg-slate-50">
                          {(img.status === "pending" || img.status === "generating") && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10">
                              {img.status === "generating" ? (
                                <div className="w-10 h-10 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center"><span className="text-slate-400">{index + 1}</span></div>
                              )}
                              <p className="text-xs text-slate-500">{img.status === "generating" ? "Generating..." : "In queue"}</p>
                            </div>
                          )}
                          {img.status === "error" && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10">
                              <span className="text-2xl">&#9888;&#65039;</span>
                              <p className="text-xs text-slate-500">Failed</p>
                              <button onClick={() => retryPlannerMockup(index)} className="px-3 py-1 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Retry</button>
                            </div>
                          )}
                          {img.status === "loaded" && img.imageData && (
                            <img src={img.imageData} alt={img.label} className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div className="p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <h5 className="text-xs font-semibold text-slate-800">{img.label}</h5>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${img.badgeColor}`}>{img.badge}</span>
                            </div>
                            {img.status === "loaded" && <span className="text-[10px] text-green-600 font-medium">Ready</span>}
                          </div>
                          <div className="flex gap-1.5">
                            <button onClick={() => downloadMockup(img)} disabled={img.status !== "loaded"} className="flex-1 py-1.5 px-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-all">Download</button>
                            <button onClick={() => retryPlannerMockup(index)} disabled={img.status === "generating"} className="py-1.5 px-2 bg-slate-100 text-slate-600 text-xs rounded-lg hover:bg-slate-200 disabled:opacity-40 transition-all">Retry</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Etsy Listing Details ── */}
                {showEtsyListing && (
                  <div className="space-y-4">
                    <h4 className="text-lg font-bold text-slate-800">Etsy Listing Details</h4>
                    <p className="text-xs text-slate-500">Copy these to create your Etsy listing manually</p>

                    {/* Title */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="font-semibold text-slate-800 text-sm">Listing Title</h5>
                        <button
                          onClick={() => copyText(etsyListing.title, "title")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            copied === "title" ? "bg-green-600 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700"
                          }`}
                        >
                          {copied === "title" ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">{etsyListing.title}</p>
                      <p className="text-xs text-slate-400 mt-1">{etsyListing.title.length}/140 characters</p>
                    </div>

                    {/* Tags */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="font-semibold text-slate-800 text-sm">Tags ({etsyListing.tags.length}/13)</h5>
                        <button
                          onClick={() => copyText(etsyListing.tags.join(", "), "tags")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            copied === "tags" ? "bg-green-600 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700"
                          }`}
                        >
                          {copied === "tags" ? "Copied!" : "Copy All"}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {etsyListing.tags.map((tag, i) => (
                          <span key={i} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">{tag}</span>
                        ))}
                      </div>
                    </div>

                    {/* Description */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="font-semibold text-slate-800 text-sm">Description</h5>
                        <button
                          onClick={() => copyText(etsyListing.description, "desc")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            copied === "desc" ? "bg-green-600 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700"
                          }`}
                        >
                          {copied === "desc" ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <pre className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto bg-slate-50 p-4 rounded-lg">
                        {etsyListing.description}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Preview / Info */}
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 mb-3">
                {PLANNER_TYPES.find((t) => t.value === plannerType)?.icon}{" "}
                {PLANNER_TYPES.find((t) => t.value === plannerType)?.label}
              </h3>
              <div className="space-y-2 text-sm text-slate-600">
                {plannerType === "weekly" && (
                  <>
                    <p>&#8226; Cover page + 52 weekly spreads</p>
                    <p>&#8226; Each week: priorities, notes, 7 day sections</p>
                    <p>&#8226; Task checkboxes for each day</p>
                    <p>&#8226; Print-ready PDF</p>
                  </>
                )}
                {plannerType === "monthly" && (
                  <>
                    <p>&#8226; Cover page + 12 monthly calendars</p>
                    <p>&#8226; Calendar grid with note lines</p>
                    <p>&#8226; Monthly goals + notes section</p>
                    <p>&#8226; Weekend days highlighted</p>
                  </>
                )}
                {plannerType === "daily" && (
                  <>
                    <p>&#8226; Cover page + 7 daily templates</p>
                    <p>&#8226; Hourly schedule (6AM-9PM)</p>
                    <p>&#8226; Morning routine + to-do list</p>
                    <p>&#8226; Gratitude section</p>
                  </>
                )}
                {plannerType === "habit_tracker" && (
                  <>
                    <p>&#8226; Cover page + 12 monthly trackers</p>
                    <p>&#8226; Track up to 20 habits</p>
                    <p>&#8226; Daily checkboxes for each habit</p>
                    <p>&#8226; Monthly reflection section</p>
                  </>
                )}
                {plannerType === "budget" && (
                  <>
                    <p>&#8226; Cover page + 12 monthly budgets</p>
                    <p>&#8226; Income tracking table</p>
                    <p>&#8226; 14 expense categories</p>
                    <p>&#8226; Budget vs actual comparison</p>
                  </>
                )}
                {plannerType === "meal_planner" && (
                  <>
                    <p>&#8226; Cover page + 4 weekly meal plans</p>
                    <p>&#8226; Breakfast, lunch, dinner, snacks</p>
                    <p>&#8226; 7 days per week</p>
                    <p>&#8226; Grocery checklist included</p>
                  </>
                )}
                {plannerType === "goals" && (
                  <>
                    <p>&#8226; Cover page + 4 quarterly plans</p>
                    <p>&#8226; 5 life categories per quarter</p>
                    <p>&#8226; Action steps with checkboxes</p>
                    <p>&#8226; Deadline & progress tracking</p>
                  </>
                )}
                {plannerType === "gratitude" && (
                  <>
                    <p>&#8226; Cover page + 7 daily templates</p>
                    <p>&#8226; Morning gratitude + affirmations</p>
                    <p>&#8226; Evening reflection</p>
                    <p>&#8226; Tomorrow&apos;s intentions</p>
                  </>
                )}
              </div>
            </div>

            <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
              <p className="text-xs font-semibold text-amber-800 mb-1">Etsy Pricing Tip</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                Digital planners sell best at $2.99-$6.99. Bundle multiple types
                together for a higher price point ($9.99-$14.99).
              </p>
            </div>

            <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-4">
              <p className="text-xs font-semibold text-indigo-800 mb-1">Best Sellers</p>
              <p className="text-xs text-indigo-700 leading-relaxed">
                Budget planners, habit trackers, and daily planners are the top 3
                best-selling digital planner types on Etsy.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── NOTION TEMPLATE TAB ── */}
      {activeTab === "notion" && (
        <div className="max-w-2xl space-y-6">
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-2">How Notion Templates Work on Etsy</h3>
            <ol className="text-sm text-slate-600 space-y-1.5 list-decimal list-inside">
              <li>Create your template in Notion</li>
              <li>Click Share &rarr; Publish to web &rarr; Copy link</li>
              <li>Add the link below to generate an optimized Etsy listing</li>
              <li>Buyers duplicate your template into their own Notion</li>
            </ol>
          </div>

          {/* Notion URL */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Notion Template URL
            </label>
            <input
              type="url"
              value={notionUrl}
              onChange={(e) => setNotionUrl(e.target.value)}
              placeholder="https://www.notion.so/your-template-page..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Etsy Listing Title
            </label>
            <input
              type="text"
              value={notionTitle}
              onChange={(e) => setNotionTitle(e.target.value)}
              placeholder="e.g. Notion Budget Tracker Template | Finance Planner | Digital Download"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
            <p className="text-xs text-slate-400 mt-1">
              {notionTitle.length}/140 characters &middot; Use keywords buyers search for
            </p>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Category</label>
            <select
              value={notionCategory}
              onChange={(e) => setNotionCategory(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="planner">Planner / Organizer</option>
              <option value="budget">Budget / Finance</option>
              <option value="business">Business / Productivity</option>
              <option value="student">Student / Academic</option>
              <option value="health">Health / Fitness</option>
              <option value="lifestyle">Lifestyle / Personal</option>
              <option value="project">Project Management</option>
              <option value="content">Content Creator</option>
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Description
            </label>
            <textarea
              value={notionDesc}
              onChange={(e) => setNotionDesc(e.target.value)}
              placeholder="Describe what your template includes, who it's for, and what problems it solves..."
              className="w-full h-32 px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none"
            />
          </div>

          {/* Save */}
          <button
            onClick={saveNotionTemplate}
            disabled={!notionUrl || !notionTitle}
            className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Save to Catalog
          </button>

          {notionSaved && (
            <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">
              Notion template saved to catalog! You can list it on Etsy from the Catalog page.
            </div>
          )}

          {/* SEO Tips */}
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-5">
            <h4 className="font-semibold text-amber-800 text-sm mb-2">Notion Template SEO Tips</h4>
            <ul className="text-xs text-amber-700 space-y-1.5">
              <li>&#8226; Include &quot;Notion Template&quot; in your title</li>
              <li>&#8226; Add &quot;Digital Download&quot; or &quot;Instant Download&quot;</li>
              <li>&#8226; Use specific keywords: &quot;budget tracker&quot;, &quot;habit tracker&quot;, &quot;student planner&quot;</li>
              <li>&#8226; Mention the aesthetic: &quot;aesthetic&quot;, &quot;minimalist&quot;, &quot;cute&quot;</li>
              <li>&#8226; Create mockup images showing the template in use</li>
              <li>&#8226; Price range: $3.99-$12.99 depending on complexity</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
