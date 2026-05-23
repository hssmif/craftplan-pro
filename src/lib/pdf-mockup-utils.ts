"use client";

// ── PDF Page Rendering + Device Frame Compositor ──
// Renders actual PDF pages to images, then composites into device mockup frames

// ── Types ──

export type DeviceType = "ipad-landscape" | "macbook" | "ipad-portrait" | "iphone-portrait";

export interface MockupSceneConfig {
  id: string;
  label: string;
  badge: string;
  badgeColor: string;
  pageIndex: number; // index into PDF_PAGE_SELECTIONS[type].pages
  device: DeviceType;
}

export interface MockupImage {
  id: string;
  label: string;
  badge: string;
  badgeColor: string;
  imageData: string | null;
  status: "pending" | "generating" | "loaded" | "error";
  errorMsg?: string;
}

// ── Per-Planner-Type Page Selections ──

export const PDF_PAGE_SELECTIONS: Record<string, { pages: number[]; labels: string[] }> = {
  daily: {
    pages: [1, 2, 5, 15],
    labels: ["Cover Page", "Day 1 — Schedule", "Day 4 — Layout", "Day 14 — Mid-Month"],
  },
  weekly: {
    pages: [1, 2, 4, 8],
    labels: ["Cover Page", "Week 1 — Overview", "Week 3 — Spread", "Week 7 — Layout"],
  },
  monthly: {
    pages: [1, 2, 5, 10],
    labels: ["Cover Page", "January Overview", "April Calendar", "September View"],
  },
  budget: {
    pages: [1, 2, 4, 8],
    labels: ["Cover Page", "Income Tracker", "Expense Categories", "Savings Goals"],
  },
  fitness: {
    pages: [1, 2, 5, 10],
    labels: ["Cover Page", "Body Measurements", "Workout Log", "Progress Tracking"],
  },
  self_care: {
    pages: [1, 2, 4, 8],
    labels: ["Cover Page", "Mood Tracker", "Gratitude Journal", "Self-Care Log"],
  },
  business: {
    pages: [1, 2, 4, 8],
    labels: ["Cover Page", "Revenue Goals", "Client Tracker", "Monthly P&L"],
  },
  student: {
    pages: [1, 2, 4, 8],
    labels: ["Cover Page", "Class Schedule", "Assignment Tracker", "Exam Planner"],
  },
};

// ── AI Lifestyle Mockup Scenes (Pollinations Flux) ──

export interface AIMockupScene {
  id: string;
  label: string;
  badge: string;
  badgeColor: string;
  prompt: (plannerType: string, colorScheme: string, designStyle: string) => string;
}

export const AI_MOCKUP_SCENES: AIMockupScene[] = [
  {
    id: "hero-dual-ipad",
    label: "Hero — Dual iPad",
    badge: "Thumbnail",
    badgeColor: "bg-red-500/15 text-red-400 border-red-500/25",
    prompt: (plannerType, colorScheme, designStyle) =>
      `A photorealistic product photography image of two iPad Pro tablets side by side on a warm beige linen fabric background with soft natural shadows. The left iPad displays a beautiful ${colorScheme} themed ${designStyle} style ${plannerType} PDF planner cover page with elegant title typography and decorative elements. The right iPad shows the planner's interior page with organized sections, checkboxes, structured grids, and clean layouts. Warm cream and tan tones, soft diffused lighting from above, professional Etsy digital product listing photography, clean composition with plenty of breathing room, no hands, no text overlays. Ultra sharp focus on both screens, 4K quality, photorealistic rendering.`,
  },
  {
    id: "macbook-ipad-phone",
    label: "Multi-Device Trio",
    badge: "Popular",
    badgeColor: "bg-blue-500/15 text-blue-400 border-blue-500/25",
    prompt: (plannerType, colorScheme, designStyle) =>
      `A photorealistic product photography image of a MacBook Pro laptop, an iPad Pro tablet, and an iPhone arranged in a professional composition on a clean minimalist wooden desk with a warm beige background. All three devices display a beautiful ${colorScheme} themed ${designStyle} style ${plannerType} PDF planner with organized sections, trackers, clean typography, and printable layouts. The MacBook is centered and slightly behind, iPad to the right at a slight angle, iPhone to the left. Warm natural side lighting, a small ceramic coffee cup and a green succulent plant as props, professional Etsy digital product mockup style, editorial product photography. Ultra sharp, 4K quality, photorealistic.`,
  },
  {
    id: "ipad-hands-lifestyle",
    label: "iPad in Hands",
    badge: "Lifestyle",
    badgeColor: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    prompt: (plannerType, colorScheme, designStyle) =>
      `A photorealistic lifestyle photograph of feminine hands holding an iPad Pro tablet displaying a beautiful ${colorScheme} themed ${designStyle} style ${plannerType} PDF planner with organized sections, checkboxes, habit trackers, and clean printable layouts. Shot from above at a slight angle, sitting at a cozy desk with a latte in a ceramic mug, a small potted plant, and warm natural window light. Soft bokeh background, warm tones, cream and beige color palette, authentic lifestyle product photography for Etsy digital product listing. The screen content is the main focus, sharp and clearly visible. 4K quality, photorealistic.`,
  },
  {
    id: "flatlay-aesthetic",
    label: "Flat Lay Aesthetic",
    badge: "Trendy",
    badgeColor: "bg-pink-500/15 text-pink-400 border-pink-500/25",
    prompt: (plannerType, colorScheme, designStyle) =>
      `A photorealistic top-down flat lay photograph of an iPad Pro tablet on a warm beige linen background, surrounded by aesthetically arranged items: a ceramic coffee mug, dried flowers, a gold pen, a small notebook, and scattered decorative elements. The iPad displays a beautiful ${colorScheme} themed ${designStyle} style ${plannerType} PDF planner page with trackers, sections, and organized layouts. Professional Etsy-style product photography, warm soft lighting, dreamy aesthetic vibes. 4K quality, photorealistic, Instagram-worthy composition.`,
  },
  {
    id: "dark-premium",
    label: "Dark & Premium",
    badge: "Premium",
    badgeColor: "bg-slate-500/15 text-slate-400 border-slate-500/25",
    prompt: (plannerType, colorScheme, designStyle) =>
      `A photorealistic product photography image of a MacBook Pro laptop on a dark charcoal desk surface with dramatic moody lighting, showing a beautiful ${colorScheme} themed ${designStyle} style ${plannerType} PDF planner page with organized sections, clean grids, and structured layouts. Dark sophisticated background with subtle warm accent lighting from the side, creating depth and premium feel. A small designer desk lamp casting warm light, minimal props. High-end luxury digital product mockup style, dramatic shadows, editorial magazine quality photography. 4K quality, photorealistic, cinematic lighting.`,
  },
  {
    id: "cozy-workspace",
    label: "Cozy Workspace",
    badge: "Detail",
    badgeColor: "bg-green-500/15 text-green-400 border-green-500/25",
    prompt: (plannerType, colorScheme, designStyle) =>
      `A photorealistic image of an iPad Pro on a wooden desk next to a window with warm golden hour sunlight streaming in, displaying a beautiful ${colorScheme} themed ${designStyle} style ${plannerType} PDF planner with clearly visible sections, checkboxes, daily trackers, and structured layouts. A warm cup of coffee with latte art, a small candle, and an open paper notebook with a premium pen nearby. Warm cozy home office atmosphere, autumn vibes, hygge aesthetic. The iPad screen is the focal point with sharp detail on the planner content. Professional lifestyle product photography for Etsy listing, natural authentic feeling. 4K quality, photorealistic.`,
  },
  {
    id: "boho-creative",
    label: "Boho Creative Desk",
    badge: "Aesthetic",
    badgeColor: "bg-orange-500/15 text-orange-400 border-orange-500/25",
    prompt: (plannerType, colorScheme, designStyle) =>
      `A photorealistic bohemian creative workspace photograph featuring an iPad Pro displaying a beautiful ${colorScheme} themed ${designStyle} style ${plannerType} PDF planner, placed on a rattan woven mat on a light oak desk. Surrounding it: a small cluster of crystals, dried pampas grass in a terracotta vase, a macrame wall hanging in the background, warm fairy lights softly blurred behind, a small ceramic incense holder, and earthy woven textiles. Warm amber and sand color tones, soft natural diffused light from a large window, no harsh shadows. Artistic lifestyle product photography for Etsy, dreamy bohemian aesthetic, ultra-wide composition. 4K quality, photorealistic.`,
  },
  {
    id: "cafe-vibes",
    label: "Café Vibes",
    badge: "Social Proof",
    badgeColor: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
    prompt: (plannerType, colorScheme, designStyle) =>
      `A photorealistic photograph of a MacBook Pro laptop open on a clean marble café table, displaying a beautiful ${colorScheme} themed ${designStyle} style ${plannerType} PDF planner with organized sections, trackers, and clean layouts. A perfectly crafted flat white coffee in a ceramic cup with art sits beside it, along with a small vase of fresh flowers and a croissant on a plate. Soft warm café ambient lighting, blurred background of café interior with wooden accents. Authentic lifestyle product photography, content creator aesthetic, bright and airy. Etsy digital product mockup style. 4K quality, photorealistic.`,
  },
  {
    id: "phone-vertical-portrait",
    label: "Phone Portrait",
    badge: "Mobile",
    badgeColor: "bg-violet-500/15 text-violet-400 border-violet-500/25",
    prompt: (plannerType, colorScheme, designStyle) =>
      `A photorealistic close-up product photograph of an iPhone Pro held vertically in one hand, screen displaying a mobile-adapted view of a beautiful ${colorScheme} themed ${designStyle} style ${plannerType} PDF planner with readable text, organized sections, and clean printable layouts. Background is softly blurred warm cream and sage tones. The other hand holds a stylish gold pen. Soft natural light from the side, authentic real-life usage feel, portrait orientation shot. Modern lifestyle product photography for Etsy digital products, Pinterest and Instagram style. 4K quality, photorealistic.`,
  },
  {
    id: "studio-white-clean",
    label: "Studio White Clean",
    badge: "Professional",
    badgeColor: "bg-gray-500/15 text-gray-400 border-gray-500/25",
    prompt: (plannerType, colorScheme, designStyle) =>
      `A photorealistic high-end studio product photography image of an iPad Pro on a pure white seamless background, displaying a beautiful ${colorScheme} themed ${designStyle} style ${plannerType} PDF planner with sharp visible content, organized sections, checkboxes, and premium typography. Soft even studio lighting from multiple sources creating clean shadowless look with one subtle soft shadow underneath the device. The device is tilted at a slight angle for depth. Ultra minimal, clean, professional. Premium tech product photography style. White label mockup for Etsy listings. 4K quality, photorealistic.`,
  },
  {
    id: "magazine-editorial",
    label: "Magazine Editorial",
    badge: "Editorial",
    badgeColor: "bg-rose-500/15 text-rose-400 border-rose-500/25",
    prompt: (plannerType, colorScheme, designStyle) =>
      `A photorealistic editorial magazine-style spread photograph featuring a MacBook Pro open to a beautiful ${colorScheme} themed ${designStyle} style ${plannerType} PDF planner page with organized sections and structured layouts, surrounded by artfully placed design objects: an open Moleskine journal with a gold pen, a pair of glasses, a luxury watch, a small green plant, and a hot beverage in a designer mug. Shot from a 45-degree overhead angle on a richly textured warm linen surface. Dramatic but beautiful editorial lighting with golden tones and deep shadows. Luxury lifestyle product photography, premium Etsy digital product style, high fashion editorial quality. 4K quality, photorealistic.`,
  },
  {
    id: "neon-dark-setup",
    label: "Neon Dark Setup",
    badge: "Gaming/Tech",
    badgeColor: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
    prompt: (plannerType, colorScheme, designStyle) =>
      `A photorealistic dramatic product photography image of a high-end gaming and productivity desk setup in a dark room, featuring a large curved monitor and iPad Pro displaying a beautiful ${colorScheme} themed ${designStyle} style ${plannerType} PDF planner with organized sections, trackers, and structured layouts. Dramatic neon RGB accent lighting in purple, blue and teal colors illuminating the edges of the setup. Mechanical keyboard, high-end mouse, and premium desk accessories visible. Dark charcoal and black tones with vivid neon glow, cinematic shadows, modern tech aesthetic. Premium tech lifestyle product photography for Etsy. 4K quality, photorealistic.`,
  },
];

// ── Device Frame Mockup Scene Configurations ──

export const MOCKUP_SCENE_CONFIGS: MockupSceneConfig[] = [
  {
    id: "cover-ipad",
    label: "Cover Page — iPad",
    badge: "Thumbnail",
    badgeColor: "bg-red-500/15 text-red-400 border-red-500/25",
    pageIndex: 0,
    device: "ipad-landscape",
  },
  {
    id: "content-macbook",
    label: "Content Spread — MacBook",
    badge: "Popular",
    badgeColor: "bg-blue-500/15 text-blue-400 border-blue-500/25",
    pageIndex: 1,
    device: "macbook",
  },
  {
    id: "detail-ipad-portrait",
    label: "Detail View — iPad Portrait",
    badge: "Detail",
    badgeColor: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    pageIndex: 2,
    device: "ipad-portrait",
  },
  {
    id: "inner-page-ipad",
    label: "Inner Page — iPad",
    badge: "Showcase",
    badgeColor: "bg-violet-500/15 text-violet-400 border-violet-500/25",
    pageIndex: 3,
    device: "ipad-landscape",
  },
  {
    id: "mobile-view",
    label: "Mobile Preview — iPhone",
    badge: "Mobile",
    badgeColor: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    pageIndex: 0,
    device: "iphone-portrait",
  },
];

// ── Device Frame Specifications ──

const DEVICE_SPECS: Record<DeviceType, {
  w: number; h: number;
  screenX: number; screenY: number; screenW: number; screenH: number;
  bg: string; hasHomeButton: boolean; hasNotch?: boolean;
  bottomBarH?: number;
}> = {
  "ipad-landscape": {
    w: 1600, h: 1200,
    screenX: 60, screenY: 80, screenW: 1480, screenH: 1040,
    bg: "#f5f5f0", hasHomeButton: true,
  },
  "macbook": {
    w: 1800, h: 1200,
    screenX: 200, screenY: 60, screenW: 1400, screenH: 880,
    bg: "#e8e8e8", hasHomeButton: false, bottomBarH: 50,
  },
  "ipad-portrait": {
    w: 900, h: 1200,
    screenX: 40, screenY: 60, screenW: 820, screenH: 1080,
    bg: "#fafafa", hasHomeButton: true,
  },
  "iphone-portrait": {
    w: 500, h: 1000,
    screenX: 25, screenY: 70, screenW: 450, screenH: 860,
    bg: "#fafafa", hasHomeButton: false, hasNotch: true,
  },
};

// ── Render PDF Pages to Images ──

export async function renderPdfPages(
  pdfBlob: Blob,
  pageNumbers: number[],
  scale: number = 2
): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist");

  // Set worker source — cdnjs has v4 builds
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await pdfBlob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const results: string[] = [];
  for (const pageNum of pageNumbers) {
    if (pageNum < 1 || pageNum > pdf.numPages) {
      results.push("");
      continue;
    }
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;

    // White background (PDF pages may have transparent bg)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (page.render({ canvasContext: ctx, viewport } as any) as any).promise;
    results.push(canvas.toDataURL("image/png"));
  }

  return results;
}

// ── Composite Image into Device Frame ──

export async function compositeMockup(
  pageImageUrl: string,
  deviceType: DeviceType
): Promise<string> {
  const dev = DEVICE_SPECS[deviceType];

  // Load the page image
  const pageImg = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = pageImageUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = dev.w;
  canvas.height = dev.h;
  const ctx = canvas.getContext("2d")!;

  // Background fill (neutral, clean)
  ctx.fillStyle = dev.bg;
  ctx.fillRect(0, 0, dev.w, dev.h);

  // Outer device shadow
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 12;

  // Device body (rounded rect, dark aluminum)
  ctx.fillStyle = "#1c1c1e";
  const radius = deviceType === "iphone-portrait" ? 40 : 28;
  ctx.beginPath();
  ctx.roundRect(0, 0, dev.w, dev.h, radius);
  ctx.fill();
  ctx.shadowColor = "transparent";

  // Inner screen bezel (slightly inset, black)
  const bx = dev.screenX - 8, by = dev.screenY - 8;
  const bw = dev.screenW + 16, bh = dev.screenH + 16;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 6);
  ctx.fill();

  // Draw PDF page onto the screen area (fit-contain for portrait A4 pages)
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(dev.screenX, dev.screenY, dev.screenW, dev.screenH, 4);
  ctx.clip();

  // White background for screen area
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(dev.screenX, dev.screenY, dev.screenW, dev.screenH);

  // Scale to fit-contain (show full page, may have margins)
  const scaleX = dev.screenW / pageImg.naturalWidth;
  const scaleY = dev.screenH / pageImg.naturalHeight;
  const scale = Math.min(scaleX, scaleY); // fit-contain
  const drawW = pageImg.naturalWidth * scale;
  const drawH = pageImg.naturalHeight * scale;
  const offsetX = dev.screenX + (dev.screenW - drawW) / 2;
  const offsetY = dev.screenY + (dev.screenH - drawH) / 2;
  ctx.drawImage(pageImg, offsetX, offsetY, drawW, drawH);
  ctx.restore();

  // Screen glare (subtle white gradient overlay)
  const glare = ctx.createLinearGradient(
    dev.screenX, dev.screenY,
    dev.screenX + dev.screenW * 0.5, dev.screenY + dev.screenH * 0.4
  );
  glare.addColorStop(0, "rgba(255,255,255,0.06)");
  glare.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glare;
  ctx.beginPath();
  ctx.roundRect(dev.screenX, dev.screenY, dev.screenW, dev.screenH, 4);
  ctx.fill();

  // Home button (iPad)
  if (dev.hasHomeButton) {
    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.arc(dev.w / 2, dev.h - 22, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // Notch (iPhone)
  if (dev.hasNotch) {
    ctx.fillStyle = "#1c1c1e";
    ctx.beginPath();
    ctx.roundRect(dev.w / 2 - 60, 0, 120, 30, [0, 0, 16, 16]);
    ctx.fill();
  }

  // MacBook bottom bar (keyboard/trackpad hint)
  if (dev.bottomBarH) {
    ctx.fillStyle = "#2a2a2c";
    ctx.beginPath();
    ctx.roundRect(0, dev.h - dev.bottomBarH, dev.w, dev.bottomBarH, [0, 0, 28, 28]);
    ctx.fill();

    // Trackpad area
    ctx.fillStyle = "#222224";
    ctx.beginPath();
    ctx.roundRect(dev.w / 2 - 180, dev.h - dev.bottomBarH + 8, 360, dev.bottomBarH - 16, 6);
    ctx.fill();
  }

  return canvas.toDataURL("image/jpeg", 0.92);
}

// ── Concurrency Utility ──

export async function runWithConcurrency<T>(
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
