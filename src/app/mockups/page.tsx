"use client";

import { useState, useCallback, useRef } from "react";

// ── Template Types ──────────────────────────────────────
const TEMPLATE_TYPES = [
  { id: "adhd-planner", name: "ADHD Planner", emoji: "🧠" },
  { id: "life-planner", name: "Life Planner", emoji: "🌟" },
  { id: "student-planner", name: "Student Planner", emoji: "📚" },
  { id: "budget-tracker", name: "Budget Tracker", emoji: "💰" },
  { id: "habit-tracker", name: "Habit Tracker", emoji: "💪" },
  { id: "social-media", name: "Social Media Planner", emoji: "📱" },
  { id: "business-hub", name: "Business Hub", emoji: "💼" },
  { id: "debt-calculator", name: "Debt Calculator", emoji: "📊" },
];

// ── Mockup Scene Configurations (Etsy Bestseller-quality) ─────────────────────────
const MOCKUP_SCENES = [
  {
    id: "hero-dual-ipad",
    label: "Hero — Dual iPad",
    badge: "Thumbnail",
    badgeColor: "bg-red-100 text-red-700",
    prompt: (template: string) =>
      `A photorealistic product photography image of two iPad Pro tablets side by side on a warm beige linen fabric background with soft natural shadows. The left iPad displays a beautiful ${template} Notion template cover page with elegant title typography. The right iPad shows the template's main dashboard view with organized databases, colorful status tags, progress bars, and clean layouts. Warm cream and tan tones, soft diffused lighting from above, professional Etsy digital product listing photography, clean composition with plenty of breathing room, no hands, no text overlays. Ultra sharp focus on both screens, 4K quality, photorealistic rendering.`,
  },
  {
    id: "macbook-ipad-phone",
    label: "Multi-Device Trio",
    badge: "Popular",
    badgeColor: "bg-blue-100 text-blue-700",
    prompt: (template: string) =>
      `A photorealistic product photography image of a MacBook Pro laptop, an iPad Pro tablet, and an iPhone arranged in a professional composition on a clean minimalist wooden desk with a warm beige background. All three devices display a beautiful ${template} Notion template with organized databases, task boards, progress tracking widgets, and clean typography. The MacBook is centered and slightly behind, iPad to the right at a slight angle, iPhone to the left. Warm natural side lighting, a small ceramic coffee cup and a green succulent plant as props, professional Etsy digital product mockup style, editorial product photography. Ultra sharp, 4K quality, photorealistic.`,
  },
  {
    id: "ipad-hands-lifestyle",
    label: "iPad in Hands",
    badge: "Lifestyle",
    badgeColor: "bg-amber-100 text-amber-700",
    prompt: (template: string) =>
      `A photorealistic lifestyle photograph of feminine hands holding an iPad Pro tablet displaying a beautiful ${template} Notion template planner with organized sections, colorful task cards, and clean layouts. Shot from above at a slight angle, sitting at a cozy desk with a latte in a ceramic mug, a small potted plant, and warm natural window light. Soft bokeh background, warm tones, cream and beige color palette, authentic lifestyle product photography for Etsy digital product listing. The screen content is the main focus, sharp and clearly visible. 4K quality, photorealistic.`,
  },
  {
    id: "flatlay-aesthetic",
    label: "Flat Lay Aesthetic",
    badge: "Trendy",
    badgeColor: "bg-pink-100 text-pink-700",
    prompt: (template: string) =>
      `A photorealistic top-down flat lay photograph of an iPad Pro tablet on a warm beige linen background, surrounded by aesthetically arranged items: a ceramic coffee mug, dried flowers, a gold pen, a small notebook, and scattered decorative elements. The iPad displays a beautiful ${template} Notion template dashboard with databases, progress bars, and organized sections. Earth tones, warm brown and cream palette. Professional Etsy-style product photography, warm soft lighting, dreamy aesthetic vibes. 4K quality, photorealistic, Instagram-worthy composition.`,
  },
  {
    id: "dark-premium",
    label: "Dark & Premium",
    badge: "Premium",
    badgeColor: "bg-gray-100 text-gray-700",
    prompt: (template: string) =>
      `A photorealistic product photography image of a MacBook Pro laptop on a dark charcoal desk surface with dramatic moody lighting, showing a beautiful ${template} Notion template dashboard with glowing colorful widgets, progress bars, and organized databases. Dark sophisticated background with subtle warm accent lighting from the side, creating depth and premium feel. A small designer desk lamp casting warm light, minimal props. High-end luxury digital product mockup style, dramatic shadows, editorial magazine quality photography. 4K quality, photorealistic, cinematic lighting.`,
  },
  {
    id: "cozy-workspace",
    label: "Cozy Workspace",
    badge: "Detail",
    badgeColor: "bg-green-100 text-green-700",
    prompt: (template: string) =>
      `A photorealistic image of an iPad Pro on a wooden desk next to a window with warm golden hour sunlight streaming in, displaying a beautiful ${template} Notion template with clearly visible databases, task lists, habit trackers, and colorful status indicators. A warm cup of coffee with latte art, a small candle, and an open paper notebook with a premium pen nearby. Warm cozy home office atmosphere, autumn vibes, hygge aesthetic. The iPad screen is the focal point with sharp detail on the template content. Professional lifestyle product photography for Etsy listing, natural authentic feeling. 4K quality, photorealistic.`,
  },
  {
    id: "pink-feminine",
    label: "Pink Feminine",
    badge: "Aesthetic",
    badgeColor: "bg-pink-100 text-pink-700",
    prompt: (template: string) =>
      `A photorealistic image of two iPad Pro tablets on a soft pink and white marble desk surface, with fresh pink peonies in a glass vase, rose gold accessories, and a pink velvet notebook. Both iPads display a beautiful ${template} Notion template with organized sections, soft color-coded tags, and progress bars. Soft pink, blush, and white color palette, feminine aesthetic, soft diffused lighting. Professional Etsy digital product listing photography, romantic and stylish. 4K quality, photorealistic.`,
  },
  {
    id: "cafe-vibes",
    label: "Coffee Shop Vibes",
    badge: "Lifestyle",
    badgeColor: "bg-amber-100 text-amber-700",
    prompt: (template: string) =>
      `A photorealistic image of a MacBook Pro laptop in a trendy modern coffee shop with warm ambient lighting and soft bokeh background, with a cappuccino in a beautiful ceramic cup and a small pastry on a plate. The screen displays a beautiful ${template} Notion template dashboard with colorful task cards, progress bars, and organized databases. Warm golden tones, authentic coffee shop atmosphere, lifestyle product photography. The screen is clearly visible and sharp. 4K quality, photorealistic, editorial style.`,
  },
  {
    id: "boho-creative",
    label: "Boho Creative",
    badge: "Unique",
    badgeColor: "bg-orange-100 text-orange-700",
    prompt: (template: string) =>
      `A photorealistic image of an iPad Pro on a natural wooden desk with a macrame wall hanging in the background, a handmade ceramic mug, dried pampas grass in a clay vase, and wooden beads. The iPad displays a beautiful ${template} Notion template dashboard with organized databases, progress bars, and colorful task cards. Warm bohemian atmosphere, natural earth tones, creative editorial photography. Professional Etsy product mockup, screen content clearly visible. 4K quality, photorealistic.`,
  },
  {
    id: "minimal-clean",
    label: "Minimal White",
    badge: "Clean",
    badgeColor: "bg-slate-100 text-slate-700",
    prompt: (template: string) =>
      `A photorealistic product photography image of a MacBook Pro laptop and an iPad Pro on a pure white desk surface with very clean minimalist styling. Only a small geometric succulent planter and a white ceramic mug as props. Both screens display a beautiful ${template} Notion template with clean layouts, organized databases, and subtle color accents. Bright even lighting, no shadows, clean white background, editorial product photography. Ultra minimal aesthetic, professional Etsy listing quality. 4K, photorealistic, ultra sharp.`,
  },
];

// ── Types ───────────────────────────────────────────────
interface MockupImage {
  id: string;
  sceneIndex: number;
  label: string;
  badge: string;
  badgeColor: string;
  imageData: string | null; // base64 data URL
  prompt: string;
  status: "pending" | "generating" | "loaded" | "error";
  model?: string;
  errorMsg?: string;
}

// ── Concurrency helper ──────────────────────────────────
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

// ── Page Component ──────────────────────────────────────
export default function MockupsPage() {
  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATE_TYPES[0]);
  const [images, setImages] = useState<MockupImage[]>([]);
  const [generating, setGenerating] = useState(false);
  const [selectedCount, setSelectedCount] = useState<4 | 6 | 10>(4);
  const abortRef = useRef<AbortController | null>(null);

  const generateSingleImage = useCallback(
    async (
      scene: (typeof MOCKUP_SCENES)[0],
      sceneIndex: number,
      template: string,
      signal: AbortSignal
    ): Promise<{ imageData: string | null; model?: string; error?: string }> => {
      const prompt = scene.prompt(template);
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
          signal,
        });

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({ error: "Unknown error" }));
          return { imageData: null, error: errData.error || `HTTP ${resp.status}` };
        }

        const data = await resp.json();
        if (data.image) {
          const mimeType = data.mimeType || "image/jpeg";
          const dataUrl = `data:${mimeType};base64,${data.image}`;
          return { imageData: dataUrl, model: data.model };
        }
        return { imageData: null, error: "No image in response" };
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return { imageData: null, error: "Cancelled" };
        }
        return { imageData: null, error: String(err) };
      }
    },
    []
  );

  const generateMockups = useCallback(async () => {
    // Cancel any previous generation
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setGenerating(true);
    const scenes = MOCKUP_SCENES.slice(0, selectedCount);
    const templateName = selectedTemplate.name;

    // Initialize all slots as "pending"
    const initialImages: MockupImage[] = scenes.map((scene, i) => ({
      id: `${scene.id}-${Date.now()}-${i}`,
      sceneIndex: i,
      label: scene.label,
      badge: scene.badge,
      badgeColor: scene.badgeColor,
      imageData: null,
      prompt: scene.prompt(templateName),
      status: "pending" as const,
    }));
    setImages(initialImages);

    // Create tasks with concurrency limit of 2
    const tasks = scenes.map((scene, i) => () => {
      // Mark as generating
      setImages((prev) =>
        prev.map((img, idx) => (idx === i ? { ...img, status: "generating" as const } : img))
      );
      return generateSingleImage(scene, i, templateName, controller.signal);
    });

    await runWithConcurrency(tasks, 2, (index, result) => {
      setImages((prev) =>
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

    setGenerating(false);
  }, [selectedTemplate, selectedCount, generateSingleImage]);

  const regenerateSingle = useCallback(
    async (index: number) => {
      const scene = MOCKUP_SCENES[index];
      if (!scene) return;

      setImages((prev) =>
        prev.map((img, i) =>
          i === index
            ? { ...img, status: "generating" as const, imageData: null, errorMsg: undefined }
            : img
        )
      );

      const controller = new AbortController();
      const result = await generateSingleImage(scene, index, selectedTemplate.name, controller.signal);

      setImages((prev) =>
        prev.map((img, i) =>
          i === index
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
    },
    [selectedTemplate, generateSingleImage]
  );

  const downloadImage = useCallback(
    async (img: MockupImage) => {
      if (!img.imageData) return;
      try {
        const resp = await fetch(img.imageData);
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `mockup-${selectedTemplate.id}-${img.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } catch {
        // Fallback: open in new tab
        window.open(img.imageData, "_blank");
      }
    },
    [selectedTemplate]
  );

  const downloadAll = useCallback(async () => {
    const loaded = images.filter((img) => img.status === "loaded");
    for (let i = 0; i < loaded.length; i++) {
      await downloadImage(loaded[i]);
      await new Promise((r) => setTimeout(r, 500));
    }
  }, [images, downloadImage]);

  const copyPrompt = useCallback(async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = prompt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }, []);

  const loadedCount = images.filter((img) => img.status === "loaded").length;
  const generatingCount = images.filter((img) => img.status === "generating").length;
  const totalCount = images.length;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-2">
        <h1 className="text-3xl font-bold text-slate-800">Mockup Generator</h1>
        <p className="text-slate-500 mt-1">
          Auto-generate professional Etsy listing mockups — powered by AI
        </p>
      </div>
      <div className="flex gap-2 mb-6 flex-wrap">
        <span className="text-xs px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
          Fully automatic
        </span>
        <span className="text-xs px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          Photorealistic AI images
        </span>
        <span className="text-xs px-3 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
          Pollinations.ai powered
        </span>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-8 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-end">
          {/* Template Selection */}
          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold">
                1
              </span>
              Select Template
            </h2>
            <div className="flex flex-wrap gap-2">
              {TEMPLATE_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplate(t)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 ${
                    selectedTemplate.id === t.id
                      ? "bg-purple-600 text-white shadow-lg scale-[1.03]"
                      : "bg-slate-50 text-slate-600 border border-slate-200 hover:border-purple-300 hover:bg-purple-50"
                  }`}
                >
                  <span>{t.emoji}</span>
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* Generate Controls */}
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold">
                  2
                </span>
                How many?
              </h2>
              <div className="flex gap-2">
                {([4, 6, 10] as const).map((n) => (
                  <button
                    key={n}
                    onClick={() => setSelectedCount(n)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      selectedCount === n
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={generateMockups}
              disabled={generating}
              className="py-4 px-8 rounded-xl text-white font-bold text-base bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-lg hover:shadow-xl transition-all disabled:opacity-60 disabled:cursor-wait whitespace-nowrap"
            >
              {generating ? (
                <span className="flex items-center gap-2 justify-center">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Generating {loadedCount}/{totalCount}...
                </span>
              ) : (
                `Generate ${selectedCount} Mockups`
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {generating && totalCount > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
            <span>
              Generating mockups...{" "}
              {generatingCount > 0 && (
                <span className="text-purple-600 font-medium">
                  ({generatingCount} in progress)
                </span>
              )}
            </span>
            <span className="font-semibold">
              {loadedCount}/{totalCount} ready
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full rounded-full transition-all duration-500"
              style={{
                width: `${totalCount > 0 ? (loadedCount / totalCount) * 100 : 0}%`,
              }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            Each mockup takes 15-60 seconds. Two generate in parallel — sit back!
          </p>
        </div>
      )}

      {/* Generated Images Grid */}
      {images.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-800">
              {selectedTemplate.emoji} {selectedTemplate.name} Mockups
              {loadedCount > 0 && (
                <span className="ml-2 text-sm font-normal text-slate-500">
                  ({loadedCount} ready)
                </span>
              )}
            </h2>
            {loadedCount > 1 && (
              <button
                onClick={downloadAll}
                className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-all shadow-sm"
              >
                Download All ({loadedCount})
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {images.map((img, index) => (
              <div
                key={img.id}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-lg transition-all"
              >
                {/* Image */}
                <div className="relative aspect-video bg-slate-50">
                  {(img.status === "pending" || img.status === "generating") && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
                      <div className="relative">
                        {img.status === "generating" ? (
                          <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center">
                            <span className="text-slate-400 text-lg">
                              {index + 1}
                            </span>
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 font-medium">
                        {img.status === "generating" ? "Generating..." : "Waiting..."}
                      </p>
                      <p className="text-xs text-slate-400">
                        {img.status === "generating"
                          ? "AI is creating your mockup"
                          : "In queue"}
                      </p>
                    </div>
                  )}

                  {img.status === "error" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10">
                      <span className="text-3xl">&#9888;&#65039;</span>
                      <p className="text-sm text-slate-500">Failed to generate</p>
                      {img.errorMsg && (
                        <p className="text-xs text-red-400 max-w-[250px] text-center truncate">
                          {img.errorMsg}
                        </p>
                      )}
                      <button
                        onClick={() => regenerateSingle(index)}
                        className="px-4 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {img.status === "loaded" && img.imageData && (
                    <img
                      src={img.imageData}
                      alt={img.label}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>

                {/* Controls */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-slate-800 text-sm">
                        {img.label}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${img.badgeColor}`}
                        >
                          {img.badge}
                        </span>
                        {img.model && (
                          <span className="text-[10px] text-slate-400">
                            via {img.model}
                          </span>
                        )}
                      </div>
                    </div>
                    {img.status === "loaded" && (
                      <span className="text-xs text-green-600 font-medium">
                        Ready
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => downloadImage(img)}
                      disabled={img.status !== "loaded"}
                      className="flex-1 py-2 px-3 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      Download PNG
                    </button>
                    <button
                      onClick={() => regenerateSingle(index)}
                      disabled={img.status === "generating"}
                      className="py-2 px-3 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 disabled:opacity-40 transition-all"
                      title="Generate a new variation"
                    >
                      Retry
                    </button>
                    <button
                      onClick={() => copyPrompt(img.prompt)}
                      className="py-2 px-3 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 transition-all"
                      title="Copy prompt for Canva AI"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {images.length === 0 && (
        <div className="text-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
          <div className="text-6xl mb-4">&#127912;</div>
          <h3 className="text-xl font-bold text-slate-700 mb-2">
            Ready to create professional mockups
          </h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto mb-6">
            Select your Notion template type above and click Generate. AI will
            create photorealistic device mockups perfect for Etsy listings.
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400"></span>
              MacBook, iPad, iPhone mockups
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400"></span>
              Multiple desk styles
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-400"></span>
              Instant download as PNG
            </div>
          </div>
        </div>
      )}

      {/* Tips Section */}
      {images.length > 0 && (
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
            <h3 className="text-xs font-bold text-amber-800 mb-2">Etsy Tips</h3>
            <ul className="text-[10px] text-amber-700 space-y-1">
              <li>First image = thumbnail, use the Hero mockup!</li>
              <li>Upload 7-10 listing images for best conversion</li>
              <li>Mix device types for variety</li>
              <li>Add text overlays in Canva for finishing</li>
            </ul>
          </div>
          <div className="bg-green-50 rounded-xl p-4 border border-green-200">
            <h3 className="text-xs font-bold text-green-800 mb-2">
              Not Happy?
            </h3>
            <ul className="text-[10px] text-green-700 space-y-1">
              <li>Click Retry to regenerate any single mockup</li>
              <li>Click Copy to get prompt for Canva AI</li>
              <li>Canva AI gives more control over results</li>
              <li>Try different template types for variety</li>
            </ul>
          </div>
          <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
            <h3 className="text-xs font-bold text-purple-800 mb-2">
              Canva AI Fallback
            </h3>
            <ul className="text-[10px] text-purple-700 space-y-1">
              <li>Click Copy on any mockup to get its prompt</li>
              <li>Go to canva.com/ai and paste it</li>
              <li>Canva Pro generates higher quality images</li>
              <li>You can edit Canva results in their editor</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
