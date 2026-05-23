// ══════════════════════════════════════════════════════════════
// Factory AI Mockups — Uses the SAME system as the Mockups page
//
// Calls /api/ai/image with the EXACT same parameters and prompt
// style as the Mockups page (src/app/mockups/page.tsx), adapted
// for Google Sheets templates instead of Notion templates.
//
// Same endpoint, same provider cascade, same quality.
// ══════════════════════════════════════════════════════════════

import { storeAsset } from "@/lib/digital-asset-storage";

// ── Scene definitions — SAME structure as Mockups page ───────
// These are adapted from MOCKUP_SCENES in src/app/mockups/page.tsx
// with prompts changed from "Notion template" to "Google Sheets
// spreadsheet" to match what the factory produces.

interface MockupScene {
  id: string;
  label: string;
  badge: string;
  prompt: (templateName: string) => string;
}

const MOCKUP_SCENES: MockupScene[] = [
  {
    id: "hero-dual-ipad",
    label: "Hero — Dual iPad",
    badge: "Thumbnail",
    prompt: (template: string) =>
      `A photorealistic product photography image of two iPad Pro tablets side by side on a warm beige linen fabric background with soft natural shadows. The left iPad displays a beautiful ${template} Google Sheets spreadsheet cover with elegant green headers, budget totals, and clean typography. The right iPad shows the spreadsheet's main dashboard view with organized data tables, colorful pie charts, progress bars, and clean layouts. Warm cream and tan tones, soft diffused lighting from above, professional Etsy digital product listing photography, clean composition with plenty of breathing room, no hands, no text overlays. Ultra sharp focus on both screens, 4K quality, photorealistic rendering.`,
  },
  {
    id: "macbook-ipad-phone",
    label: "Multi-Device Trio",
    badge: "Popular",
    prompt: (template: string) =>
      `A photorealistic product photography image of a MacBook Pro laptop, an iPad Pro tablet, and an iPhone arranged in a professional composition on a clean minimalist wooden desk with a warm beige background. All three devices display a beautiful ${template} Google Sheets spreadsheet with organized data tables, budget categories, colorful charts, progress tracking, and clean typography. The MacBook is centered and slightly behind, iPad to the right at a slight angle, iPhone to the left. Warm natural side lighting, a small ceramic coffee cup and a green succulent plant as props, professional Etsy digital product mockup style, editorial product photography. Ultra sharp, 4K quality, photorealistic.`,
  },
  {
    id: "ipad-hands-lifestyle",
    label: "iPad in Hands",
    badge: "Lifestyle",
    prompt: (template: string) =>
      `A photorealistic lifestyle photograph of feminine hands holding an iPad Pro tablet displaying a beautiful ${template} Google Sheets spreadsheet with organized budget sections, colorful data charts, and clean green-themed layouts. Shot from above at a slight angle, sitting at a cozy desk with a latte in a ceramic mug, a small potted plant, and warm natural window light. Soft bokeh background, warm tones, cream and beige color palette, authentic lifestyle product photography for Etsy digital product listing. The screen content is the main focus, sharp and clearly visible. 4K quality, photorealistic.`,
  },
  {
    id: "flatlay-aesthetic",
    label: "Flat Lay Aesthetic",
    badge: "Trendy",
    prompt: (template: string) =>
      `A photorealistic top-down flat lay photograph of an iPad Pro tablet on a warm beige linen background, surrounded by aesthetically arranged items: a ceramic coffee mug, dried flowers, a gold pen, a small notebook, and scattered decorative elements. The iPad displays a beautiful ${template} Google Sheets spreadsheet dashboard with data tables, colorful pie charts, progress bars, and organized budget sections. Earth tones, warm brown and cream palette. Professional Etsy-style product photography, warm soft lighting, dreamy aesthetic vibes. 4K quality, photorealistic, Instagram-worthy composition.`,
  },
  {
    id: "dark-premium",
    label: "Dark & Premium",
    badge: "Premium",
    prompt: (template: string) =>
      `A photorealistic product photography image of a MacBook Pro laptop on a dark charcoal desk surface with dramatic moody lighting, showing a beautiful ${template} Google Sheets spreadsheet dashboard with glowing colorful charts, KPI totals, progress bars, and organized financial data. Dark sophisticated background with subtle warm accent lighting from the side, creating depth and premium feel. A small designer desk lamp casting warm light, minimal props. High-end luxury digital product mockup style, dramatic shadows, editorial magazine quality photography. 4K quality, photorealistic, cinematic lighting.`,
  },
  {
    id: "cozy-workspace",
    label: "Cozy Workspace",
    badge: "Detail",
    prompt: (template: string) =>
      `A photorealistic image of an iPad Pro on a wooden desk next to a window with warm golden hour sunlight streaming in, displaying a beautiful ${template} Google Sheets spreadsheet with clearly visible data tables, budget categories, savings goals, and colorful status indicators. A warm cup of coffee with latte art, a small candle, and an open paper notebook with a premium pen nearby. Warm cozy home office atmosphere, autumn vibes, hygge aesthetic. The iPad screen is the focal point with sharp detail on the spreadsheet content. Professional lifestyle product photography for Etsy listing, natural authentic feeling. 4K quality, photorealistic.`,
  },
];

// ── Image generation — SAME as Mockups page (/api/ai/image) ─

/**
 * Generate a single mockup image using /api/ai/image — the SAME
 * endpoint the Mockups page uses. This ensures the same provider
 * cascade (Pollinations Auth → Free → Gemini) and same quality.
 */
async function generateSingleMockup(
  prompt: string,
  baseUrl: string,
): Promise<Buffer | null> {
  try {
    const resp = await fetch(`${baseUrl}/api/ai/image`, {
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
      console.warn(`   ⚠ /api/ai/image returned ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    if (data.image) {
      // data.image is base64 — convert to Buffer
      return Buffer.from(data.image, "base64");
    }

    console.warn("   ⚠ No image in response");
    return null;
  } catch (err) {
    console.warn("   ⚠ Mockup generation failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Concurrency runner — SAME as Mockups page ────────────────

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
  onComplete?: (index: number, result: T) => void,
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

  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

// ── Main export ──────────────────────────────────────────────

export interface MockupResult {
  sceneId: string;
  label: string;
  badge: string;
  buffer: Buffer;
  assetId?: string;
  downloadUrl?: string;
}

/**
 * Generate photorealistic AI mockups — uses the SAME system as
 * the Mockups page (/api/ai/image with Pollinations provider).
 *
 * @param templateName - Human-readable name (e.g. "Wedding Budget Planner")
 * @param count - Number of mockups (default 4, max 6)
 * @param projectId - If provided, stores as digital assets
 * @param baseUrl - Server base URL for /api/ai/image calls
 */
export async function generateFactoryMockups(
  templateName: string,
  count = 4,
  projectId?: string,
  baseUrl = "http://localhost:3461",
): Promise<MockupResult[]> {
  console.log(`[factory-mockups] Generating ${count} mockups via /api/ai/image (same as Mockups page)...`);

  const scenes = MOCKUP_SCENES.slice(0, Math.min(count, MOCKUP_SCENES.length));
  const results: MockupResult[] = [];

  // Concurrency of 2 — same as Mockups page
  const tasks = scenes.map((scene) => async () => {
    console.log(`   🎨 ${scene.label}...`);
    const buf = await generateSingleMockup(scene.prompt(templateName), baseUrl);
    if (!buf || buf.length < 10000) {
      console.warn(`   ⚠ ${scene.label} failed or too small`);
      return null;
    }

    console.log(`   ✓ ${scene.label}: ${Math.round(buf.length / 1024)}KB`);

    const result: MockupResult = {
      sceneId: scene.id,
      label: scene.label,
      badge: scene.badge,
      buffer: buf,
    };

    if (projectId) {
      const filename = `mockup_${scene.id}.png`;
      const asset = await storeAsset(projectId, buf, filename, "mockup");
      result.assetId = asset.id;
      result.downloadUrl = asset.downloadUrl;
    }

    return result;
  });

  const taskResults = await runWithConcurrency(tasks, 2, (i, r) => {
    if (r) results.push(r);
  });

  // Collect any missed results
  for (const r of taskResults) {
    if (r && !results.find((x) => x.sceneId === r.sceneId)) {
      results.push(r);
    }
  }

  console.log(`[factory-mockups] Done: ${results.length}/${count} mockups generated`);
  return results;
}
