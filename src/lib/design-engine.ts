// ══════════════════════════════════════════════════════════════
// Design Sensei: Ultra-Premium Design Engine
// Canvas-based text design renderer for POD products.
// 12 style presets, 15 color palettes, 18 fonts, 6 layouts.
// ══════════════════════════════════════════════════════════════

"use client";

// ── Types ──

export type StylePreset =
  | "retro-badge"
  | "neon-glow"
  | "farmhouse"
  | "boho-wreath"
  | "arch-minimal"
  | "groovy-70s"
  | "distressed-vintage"
  | "watercolor-splash"
  | "bold-stacked"
  | "cottagecore"
  | "street-graffiti"
  | "luxury-gold";

export type LayoutType =
  | "centered-stack"
  | "arch-center"
  | "left-aligned"
  | "full-bleed"
  | "badge-circle"
  | "split-contrast";

// ── Font Library ──

export interface FontDef {
  name: string;
  weight: number;
  category: string;
  style: string;
}

export const FONT_LIBRARY: FontDef[] = [
  { name: "Bebas Neue", weight: 400, category: "sans-serif", style: "tall-condensed" },
  { name: "Anton", weight: 400, category: "sans-serif", style: "bold-condensed" },
  { name: "Playfair Display", weight: 700, category: "serif", style: "elegant-serif" },
  { name: "Dancing Script", weight: 700, category: "handwriting", style: "elegant-script" },
  { name: "Pacifico", weight: 400, category: "handwriting", style: "casual-script" },
  { name: "Montserrat", weight: 700, category: "sans-serif", style: "modern-sans" },
  { name: "Raleway", weight: 700, category: "sans-serif", style: "clean-geometric" },
  { name: "Oswald", weight: 700, category: "sans-serif", style: "modern-condensed" },
  { name: "Fredoka One", weight: 400, category: "display", style: "rounded-bold" },
  { name: "Righteous", weight: 400, category: "display", style: "retro" },
  { name: "Great Vibes", weight: 400, category: "handwriting", style: "formal-script" },
  { name: "Satisfy", weight: 400, category: "handwriting", style: "flowing-script" },
  { name: "Alfa Slab One", weight: 400, category: "display", style: "slab-serif" },
  { name: "Lobster", weight: 400, category: "display", style: "bold-script" },
  { name: "Abril Fatface", weight: 400, category: "display", style: "display-serif" },
  { name: "Permanent Marker", weight: 400, category: "handwriting", style: "handwritten" },
  { name: "Cinzel", weight: 700, category: "serif", style: "classic-serif" },
  { name: "Luckiest Guy", weight: 400, category: "display", style: "fun-bold" },
];

// ── Color Palettes ──

export interface PaletteDef {
  name: string;
  bg: string;
  primary: string;
  secondary: string;
  accent: string;
}

export const COLOR_PALETTES: PaletteDef[] = [
  { name: "vintage-rust", bg: "#F5E6D3", primary: "#8B2500", secondary: "#D4854A", accent: "#2C1810" },
  { name: "navy-gold", bg: "#1B2B4B", primary: "#C9A84C", secondary: "#FFD700", accent: "#FFFFFF" },
  { name: "forest-cream", bg: "#2D4A2D", primary: "#F5E6C8", secondary: "#C8A96E", accent: "#FFFFFF" },
  { name: "blush-sage", bg: "#F9F0EB", primary: "#7D9B76", secondary: "#C4866A", accent: "#3D2B1F" },
  { name: "charcoal-white", bg: "#1A1A1A", primary: "#FFFFFF", secondary: "#CCCCCC", accent: "#FF4444" },
  { name: "cream-black", bg: "#FAF7F2", primary: "#1A1A1A", secondary: "#555555", accent: "#C9A84C" },
  { name: "neon-dark", bg: "#0D0D0D", primary: "#FF2D8E", secondary: "#00FFFF", accent: "#FFFFFF" },
  { name: "mustard-brown", bg: "#E8B84B", primary: "#2C1810", secondary: "#8B4513", accent: "#FFFFFF" },
  { name: "lavender-gold", bg: "#E8E0F0", primary: "#4A3060", secondary: "#C9A84C", accent: "#2C1810" },
  { name: "terracotta", bg: "#C4714A", primary: "#FAF3E0", secondary: "#2C1810", accent: "#F5C842" },
  { name: "mint-dark", bg: "#E8F5F0", primary: "#1A3A2A", secondary: "#4A8A6A", accent: "#C9A84C" },
  { name: "burgundy-cream", bg: "#6B1020", primary: "#FAF3E0", secondary: "#C9A84C", accent: "#FFFFFF" },
  { name: "electric-purple", bg: "#1A0A2E", primary: "#BF00FF", secondary: "#7B2FBE", accent: "#FFFFFF" },
  { name: "ocean-white", bg: "#0A4A6E", primary: "#FFFFFF", secondary: "#7EC8E3", accent: "#FFD700" },
  { name: "warm-minimal", bg: "#FFFFFF", primary: "#2C2C2C", secondary: "#888888", accent: "#E8483B" },
];

// ── Style Configuration ──

interface StyleConfig {
  fonts: string[];
  palettes: string[];
  textTransform: "uppercase" | "none";
  secondaryFont?: string;
}

const STYLE_CONFIG: Record<StylePreset, StyleConfig> = {
  "retro-badge": {
    fonts: ["Bebas Neue", "Anton", "Oswald", "Permanent Marker"],
    palettes: ["vintage-rust", "navy-gold", "forest-cream", "mustard-brown", "terracotta", "burgundy-cream"],
    textTransform: "uppercase",
  },
  "neon-glow": {
    fonts: ["Bebas Neue", "Anton", "Righteous", "Fredoka One"],
    palettes: ["neon-dark", "charcoal-white", "electric-purple"],
    textTransform: "uppercase",
  },
  "farmhouse": {
    fonts: ["Playfair Display", "Cinzel", "Abril Fatface"],
    palettes: ["cream-black", "blush-sage", "warm-minimal", "vintage-rust"],
    textTransform: "none",
    secondaryFont: "Montserrat",
  },
  "boho-wreath": {
    fonts: ["Dancing Script", "Pacifico", "Great Vibes", "Satisfy"],
    palettes: ["blush-sage", "mint-dark", "lavender-gold", "cream-black"],
    textTransform: "none",
    secondaryFont: "Raleway",
  },
  "arch-minimal": {
    fonts: ["Raleway", "Oswald", "Montserrat", "Bebas Neue"],
    palettes: ["warm-minimal", "cream-black", "blush-sage", "mint-dark", "charcoal-white"],
    textTransform: "uppercase",
  },
  "groovy-70s": {
    fonts: ["Fredoka One", "Righteous", "Lobster", "Luckiest Guy"],
    palettes: ["mustard-brown", "terracotta", "vintage-rust", "lavender-gold"],
    textTransform: "none",
  },
  "distressed-vintage": {
    fonts: ["Alfa Slab One", "Playfair Display", "Bebas Neue", "Permanent Marker"],
    palettes: ["vintage-rust", "cream-black", "mustard-brown", "forest-cream"],
    textTransform: "uppercase",
  },
  "watercolor-splash": {
    fonts: ["Dancing Script", "Pacifico", "Satisfy", "Raleway"],
    palettes: ["blush-sage", "lavender-gold", "mint-dark", "warm-minimal"],
    textTransform: "none",
  },
  "bold-stacked": {
    fonts: ["Anton", "Bebas Neue", "Oswald", "Alfa Slab One"],
    palettes: ["charcoal-white", "cream-black", "navy-gold", "burgundy-cream", "ocean-white"],
    textTransform: "uppercase",
  },
  "cottagecore": {
    fonts: ["Great Vibes", "Satisfy", "Dancing Script", "Pacifico"],
    palettes: ["blush-sage", "lavender-gold", "mint-dark", "cream-black"],
    textTransform: "none",
    secondaryFont: "Montserrat",
  },
  "street-graffiti": {
    fonts: ["Anton", "Bebas Neue", "Permanent Marker", "Luckiest Guy"],
    palettes: ["charcoal-white", "neon-dark", "electric-purple", "ocean-white"],
    textTransform: "uppercase",
  },
  "luxury-gold": {
    fonts: ["Cinzel", "Playfair Display", "Abril Fatface"],
    palettes: ["navy-gold", "charcoal-white", "burgundy-cream", "forest-cream"],
    textTransform: "uppercase",
    secondaryFont: "Raleway",
  },
};

const STYLE_NAMES: StylePreset[] = [
  "retro-badge", "neon-glow", "farmhouse", "boho-wreath", "arch-minimal", "groovy-70s",
  "distressed-vintage", "watercolor-splash", "bold-stacked", "cottagecore", "street-graffiti", "luxury-gold",
];

// ── Font Loading ──

const loadedFonts = new Set<string>();

export async function loadFont(fontName: string): Promise<void> {
  if (loadedFonts.has(fontName)) return;
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;700&display=swap`;
  const link = document.createElement("link");
  link.href = url;
  link.rel = "stylesheet";
  document.head.appendChild(link);
  try {
    await document.fonts.load(`400 48px "${fontName}"`);
    await document.fonts.load(`700 48px "${fontName}"`);
  } catch {
    // Continue — font may not have both weights
  }
  loadedFonts.add(fontName);
}

export async function loadAllFonts(): Promise<void> {
  await Promise.all(FONT_LIBRARY.map((f) => loadFont(f.name)));
  await document.fonts.ready;
}

// ── Seeded Random ──

function createRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return (s >>> 0) / 0x7fffffff;
  };
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ── Text Utilities ──

function setFont(ctx: CanvasRenderingContext2D, weight: number, size: number, family: string) {
  ctx.font = `${weight} ${size}px "${family}", sans-serif`;
}

function fitLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontFamily: string,
  weight: number,
  maxFS: number,
  minFS: number = 30
): number {
  for (let fs = maxFS; fs >= minFS; fs -= 4) {
    setFont(ctx, weight, fs, fontFamily);
    if (ctx.measureText(text).width <= maxWidth) return fs;
  }
  return minFS;
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontFamily: string,
  weight: number,
  maxFS: number
): { fontSize: number; lines: string[] } {
  const words = text.split(/\s+/);
  for (let fontSize = maxFS; fontSize >= 30; fontSize -= 4) {
    setFont(ctx, weight, fontSize, fontFamily);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    if (lines.length <= 4) return { fontSize, lines };
  }
  setFont(ctx, weight, 30, fontFamily);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return { fontSize: 30, lines };
}

const SMALL_WORDS = new Set(["a", "an", "the", "for", "of", "in", "on", "to", "and", "or", "but", "is", "it", "my", "at", "by", "i"]);

function splitPhrase(text: string): { main: string[]; sub: string | null } {
  const words = text.split(/\s+/);
  if (words.length <= 2) return { main: [text], sub: null };
  if (words.length <= 4) return { main: [text], sub: null };

  // Look for natural break points
  const breakWords = ["who", "that", "and", "but", "for", "with", "my", "the"];
  let breakIdx = -1;
  for (let i = Math.floor(words.length * 0.3); i < Math.ceil(words.length * 0.7); i++) {
    if (breakWords.includes(words[i].toLowerCase())) { breakIdx = i; break; }
  }
  if (breakIdx === -1) breakIdx = Math.ceil(words.length / 2);

  const top = words.slice(0, breakIdx).join(" ");
  const bottom = words.slice(breakIdx).join(" ");
  return { main: [bottom], sub: top };
}

// ── Canvas Texture Helpers ──

function addGrainTexture(ctx: CanvasRenderingContext2D, w: number, h: number, opacity: number = 0.05) {
  const tileSize = 200;
  const tile = document.createElement("canvas");
  tile.width = tileSize;
  tile.height = tileSize;
  const tCtx = tile.getContext("2d")!;
  const imgData = tCtx.createImageData(tileSize, tileSize);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.random() * 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = Math.random() * 255 * opacity * 2;
  }
  tCtx.putImageData(imgData, 0, 0);
  ctx.save();
  const pat = ctx.createPattern(tile, "repeat");
  if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, w, h); }
  ctx.restore();
}

function addLinenTexture(ctx: CanvasRenderingContext2D, w: number, h: number, opacity: number = 0.06) {
  const tileSize = 50;
  const tile = document.createElement("canvas");
  tile.width = tileSize;
  tile.height = tileSize;
  const tCtx = tile.getContext("2d")!;
  tCtx.strokeStyle = "#8B7355";
  tCtx.lineWidth = 0.5;
  for (let i = 0; i < tileSize; i += 4) {
    tCtx.beginPath(); tCtx.moveTo(0, i); tCtx.lineTo(tileSize, i); tCtx.stroke();
    tCtx.beginPath(); tCtx.moveTo(i, 0); tCtx.lineTo(i, tileSize); tCtx.stroke();
  }
  ctx.save();
  ctx.globalAlpha = opacity;
  const pat = ctx.createPattern(tile, "repeat");
  if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, w, h); }
  ctx.restore();
}

function drawWatercolorBlob(
  ctx: CanvasRenderingContext2D, x: number, y: number,
  radius: number, color: string, opacity: number, rng: () => number
) {
  ctx.save();
  ctx.globalAlpha = opacity;
  for (let i = 0; i < 6; i++) {
    const ox = (rng() - 0.5) * radius * 0.4;
    const oy = (rng() - 0.5) * radius * 0.4;
    const r = radius * (0.6 + rng() * 0.4);
    ctx.beginPath();
    ctx.ellipse(x + ox, y + oy, r, r * (0.7 + rng() * 0.3), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
}

function drawLeaf(
  ctx: CanvasRenderingContext2D, x: number, y: number,
  size: number, angle: number, color: string
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(size * 0.25, -size * 0.45, size * 0.75, -size * 0.45, size, 0);
  ctx.bezierCurveTo(size * 0.75, size * 0.45, size * 0.25, size * 0.45, 0, 0);
  ctx.fillStyle = color;
  ctx.fill();
  // Vein
  ctx.beginPath();
  ctx.moveTo(size * 0.1, 0);
  ctx.lineTo(size * 0.85, 0);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = Math.max(1, size * 0.04);
  ctx.stroke();
  ctx.restore();
}

function drawFlower(
  ctx: CanvasRenderingContext2D, x: number, y: number,
  size: number, petalColor: string, centerColor: string
) {
  ctx.save();
  const petalCount = 5;
  for (let i = 0; i < petalCount; i++) {
    const angle = (i / petalCount) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.ellipse(
      x + Math.cos(angle) * size * 0.35,
      y + Math.sin(angle) * size * 0.35,
      size * 0.35, size * 0.2,
      angle, 0, Math.PI * 2
    );
    ctx.fillStyle = petalColor;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, size * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = centerColor;
  ctx.fill();
  ctx.restore();
}

function applyDistressMask(ctx: CanvasRenderingContext2D, w: number, h: number, intensity: number, rng: () => number) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  const count = Math.floor(w * h * 0.00001 * intensity);
  for (let i = 0; i < count; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = rng() * 30 + 5;
    ctx.globalAlpha = rng() * 0.5 + 0.1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

function drawRibbon(
  ctx: CanvasRenderingContext2D, cx: number, cy: number,
  width: number, height: number, color: string
) {
  const hw = width / 2;
  const hh = height / 2;
  const fold = width * 0.08;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - hw - fold, cy);
  ctx.lineTo(cx - hw, cy - hh);
  ctx.lineTo(cx + hw, cy - hh);
  ctx.lineTo(cx + hw + fold, cy);
  ctx.lineTo(cx + hw, cy + hh);
  ctx.lineTo(cx - hw, cy + hh);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  // Folds
  ctx.beginPath();
  ctx.moveTo(cx - hw, cy - hh);
  ctx.lineTo(cx - hw + fold * 0.6, cy);
  ctx.lineTo(cx - hw, cy + hh);
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + hw, cy - hh);
  ctx.lineTo(cx + hw - fold * 0.6, cy);
  ctx.lineTo(cx + hw, cy + hh);
  ctx.fill();
  ctx.restore();
}

function drawOrnamentalDivider(ctx: CanvasRenderingContext2D, cx: number, y: number, width: number, color: string) {
  const hw = width / 2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  // Lines
  ctx.beginPath();
  ctx.moveTo(cx - hw, y);
  ctx.lineTo(cx - 20, y);
  ctx.moveTo(cx + 20, y);
  ctx.lineTo(cx + hw, y);
  ctx.stroke();
  // Center diamond
  ctx.beginPath();
  ctx.moveTo(cx, y - 10);
  ctx.lineTo(cx + 12, y);
  ctx.lineTo(cx, y + 10);
  ctx.lineTo(cx - 12, y);
  ctx.closePath();
  ctx.fill();
  // Curls at ends
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + dir * hw, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCornerFlourish(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  // Main curve
  ctx.beginPath();
  ctx.moveTo(0, size * 0.6);
  ctx.bezierCurveTo(0, size * 0.2, size * 0.2, 0, size * 0.6, 0);
  ctx.stroke();
  // Inner curl
  ctx.beginPath();
  ctx.moveTo(0, size * 0.35);
  ctx.bezierCurveTo(size * 0.05, size * 0.1, size * 0.15, size * 0.05, size * 0.35, 0);
  ctx.stroke();
  // Dot
  ctx.beginPath();
  ctx.arc(size * 0.12, size * 0.12, 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawStars(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
    const px = x + Math.cos(angle) * size;
    const py = y + Math.sin(angle) * size;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawDaisy(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, petalColor: string, centerColor: string) {
  ctx.save();
  const petals = 8;
  for (let i = 0; i < petals; i++) {
    const angle = (i / petals) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(
      x + Math.cos(angle) * size * 0.4,
      y + Math.sin(angle) * size * 0.4,
      size * 0.3, size * 0.12,
      angle, 0, Math.PI * 2
    );
    ctx.fillStyle = petalColor;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, size * 0.15, 0, Math.PI * 2);
  ctx.fillStyle = centerColor;
  ctx.fill();
  ctx.restore();
}

// ── Render Config ──

interface RenderConfig {
  text: string;
  style: StylePreset;
  font: FontDef;
  palette: PaletteDef;
  layout: LayoutType;
  width: number;
  height: number;
  rng: () => number;
}

// ══════════════════════════════════════════════════════════════
// STYLE RENDERERS
// ══════════════════════════════════════════════════════════════

// ── 1. Retro Badge ──

function renderRetroBadge(ctx: CanvasRenderingContext2D, c: RenderConfig) {
  const { width: W, height: H, palette: p, font: f, text, rng } = c;
  const cx = W / 2, cy = H / 2;
  const radius = Math.min(W, H) * 0.36;
  const displayText = text.toUpperCase();

  // Background
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, H);

  // Badge drop shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 15;

  // Outer circle
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = p.accent;
  ctx.fill();
  ctx.restore();

  // Dotted ring
  ctx.save();
  ctx.setLineDash([18, 12]);
  ctx.strokeStyle = p.secondary;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.93, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Inner circle
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.85, 0, Math.PI * 2);
  ctx.fillStyle = p.primary;
  ctx.fill();

  // Inner dotted ring
  ctx.save();
  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = p.secondary;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.78, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Main text inside badge
  const innerW = radius * 0.78 * 2 * 0.75;
  const { fontSize, lines } = fitText(ctx, displayText, innerW, f.name, f.weight, Math.min(radius * 0.5, 300));
  setFont(ctx, f.weight, fontSize, f.name);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = p.bg;

  const lh = fontSize * 1.1;
  const totalH = lines.length * lh;
  const startY = cy - totalH / 2 + lh / 2 - radius * 0.08;
  lines.forEach((line, i) => {
    ctx.fillText(line, cx, startY + i * lh);
  });

  // Stars decoration
  const starSize = radius * 0.04;
  ctx.fillStyle = p.secondary;
  drawStars(ctx, cx - innerW * 0.45, cy - radius * 0.08, starSize, p.secondary);
  drawStars(ctx, cx + innerW * 0.45, cy - radius * 0.08, starSize, p.secondary);

  // Banner ribbon at bottom
  const ribbonY = cy + radius * 0.55;
  const ribbonW = radius * 1.3;
  const ribbonH = radius * 0.22;
  drawRibbon(ctx, cx, ribbonY, ribbonW, ribbonH, p.secondary);

  // Ribbon text — use sub-niche or "EST. 2024"
  const { sub } = splitPhrase(text);
  const ribbonText = sub || "PREMIUM QUALITY";
  const rFS = fitLine(ctx, ribbonText.toUpperCase(), ribbonW * 0.7, f.name, f.weight, ribbonH * 0.5, 18);
  setFont(ctx, f.weight, rFS, f.name);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = p.bg;
  ctx.fillText(ribbonText.toUpperCase(), cx, ribbonY);

  // Grain overlay
  addGrainTexture(ctx, W, H, 0.04);
}

// ── 2. Neon Glow ──

function renderNeonGlow(ctx: CanvasRenderingContext2D, c: RenderConfig) {
  const { width: W, height: H, palette: p, font: f, text } = c;
  const displayText = text.toUpperCase();

  // Dark background
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, H);

  // Scanlines
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.fillStyle = "#000";
  for (let y = 0; y < H; y += 4) {
    ctx.fillRect(0, y, W, 2);
  }
  ctx.restore();

  // Fit text
  const maxW = W * 0.8;
  const { fontSize, lines } = fitText(ctx, displayText, maxW, f.name, f.weight, Math.min(400, H / 3));
  const lh = fontSize * 1.2;
  const totalH = lines.length * lh;
  const startY = (H - totalH) / 2 + lh / 2;

  // Neon glow layers — render text multiple times with increasing blur
  const glowLayers = [
    { blur: 60, alpha: 0.1 },
    { blur: 40, alpha: 0.15 },
    { blur: 25, alpha: 0.25 },
    { blur: 15, alpha: 0.4 },
    { blur: 8, alpha: 0.6 },
    { blur: 0, alpha: 1.0 },
  ];

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const layer of glowLayers) {
    ctx.save();
    ctx.shadowBlur = layer.blur;
    ctx.shadowColor = p.primary;
    ctx.globalAlpha = layer.alpha;
    ctx.fillStyle = p.primary;
    setFont(ctx, f.weight, fontSize, f.name);
    lines.forEach((line, i) => {
      ctx.fillText(line, W / 2, startY + i * lh);
    });
    ctx.restore();
  }

  // White outer stroke at low opacity
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2;
  setFont(ctx, f.weight, fontSize, f.name);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, i) => {
    ctx.strokeText(line, W / 2, startY + i * lh);
  });
  ctx.restore();

  // Secondary glow accent — thin line below text
  ctx.save();
  ctx.shadowBlur = 20;
  ctx.shadowColor = p.secondary;
  ctx.strokeStyle = p.secondary;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 3;
  ctx.beginPath();
  const lineY = startY + (lines.length - 1) * lh + fontSize * 0.7;
  ctx.moveTo(W * 0.25, lineY);
  ctx.lineTo(W * 0.75, lineY);
  ctx.stroke();
  ctx.restore();
}

// ── 3. Farmhouse ──

function renderFarmhouse(ctx: CanvasRenderingContext2D, c: RenderConfig) {
  const { width: W, height: H, palette: p, font: f, text } = c;
  const sConfig = STYLE_CONFIG["farmhouse"];
  const secFont = sConfig.secondaryFont || "Montserrat";
  const margin = W * 0.08;

  // Cream background
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, H);

  // Linen texture
  addLinenTexture(ctx, W, H, 0.05);

  // Outer border frame
  ctx.strokeStyle = p.primary;
  ctx.lineWidth = 4;
  ctx.strokeRect(margin, margin, W - margin * 2, H - margin * 2);

  // Inner thin border
  ctx.strokeStyle = p.primary;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(margin + 20, margin + 20, W - margin * 2 - 40, H - margin * 2 - 40);

  // Corner flourishes
  const flourishSize = W * 0.06;
  drawCornerFlourish(ctx, margin, margin, flourishSize, 0, p.primary);
  drawCornerFlourish(ctx, W - margin, margin, flourishSize, Math.PI / 2, p.primary);
  drawCornerFlourish(ctx, W - margin, H - margin, flourishSize, Math.PI, p.primary);
  drawCornerFlourish(ctx, margin, H - margin, flourishSize, -Math.PI / 2, p.primary);

  // Split text for mixed-font rendering
  const { main, sub } = splitPhrase(text);
  const contentW = W - margin * 2 - 100;

  if (sub) {
    // Sub text above — small caps, secondary font
    const subFS = fitLine(ctx, sub, contentW, secFont, 700, H * 0.04, 24);
    setFont(ctx, 700, subFS, secFont);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = p.secondary;
    ctx.letterSpacing = "4px";
    ctx.fillText(sub, W / 2, H * 0.35);
    ctx.letterSpacing = "0px";

    // Ornamental divider
    drawOrnamentalDivider(ctx, W / 2, H * 0.43, contentW * 0.6, p.primary);

    // Main text — serif font
    const mainText = main.join(" ");
    const { fontSize, lines } = fitText(ctx, mainText, contentW, f.name, f.weight, H * 0.12);
    setFont(ctx, f.weight, fontSize, f.name);
    ctx.fillStyle = p.primary;
    const lh = fontSize * 1.15;
    const startY = H * 0.55;
    lines.forEach((line, i) => {
      ctx.fillText(line, W / 2, startY + i * lh);
    });
  } else {
    // Single block of text
    const { fontSize, lines } = fitText(ctx, text, contentW, f.name, f.weight, H * 0.12);
    setFont(ctx, f.weight, fontSize, f.name);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = p.primary;
    const lh = fontSize * 1.15;
    const totalH = lines.length * lh;
    const startY = (H - totalH) / 2 + lh / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, W / 2, startY + i * lh);
    });

    // Divider below
    drawOrnamentalDivider(ctx, W / 2, startY + lines.length * lh + fontSize * 0.3, contentW * 0.4, p.primary);
  }
}

// ── 4. Boho Wreath ──

function renderBohoWreath(ctx: CanvasRenderingContext2D, c: RenderConfig) {
  const { width: W, height: H, palette: p, font: f, text, rng } = c;
  const sConfig = STYLE_CONFIG["boho-wreath"];
  const secFont = sConfig.secondaryFont || "Raleway";
  const cx = W / 2, cy = H / 2;
  const wreathRadius = Math.min(W, H) * 0.32;

  // Background
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, H);

  // Color derivations for wreath
  const leafColors = [p.primary, p.secondary];
  const berryColor = p.accent;

  // Draw wreath — leaves around a circle
  const leafCount = 28;
  for (let i = 0; i < leafCount; i++) {
    const angle = (i / leafCount) * Math.PI * 2;
    const lx = cx + wreathRadius * Math.cos(angle);
    const ly = cy + wreathRadius * Math.sin(angle);
    const leafSize = wreathRadius * (0.13 + rng() * 0.05);
    const leafAngle = angle + Math.PI / 2 + (rng() - 0.5) * 0.4;
    const col = leafColors[i % leafColors.length];
    drawLeaf(ctx, lx, ly, leafSize, leafAngle, col);

    // Opposite-direction leaf for fullness
    const leafAngle2 = angle - Math.PI / 2 + (rng() - 0.5) * 0.3;
    drawLeaf(ctx, lx, ly, leafSize * 0.8, leafAngle2, col);
  }

  // Berries
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2 + rng() * 0.3;
    const dist = wreathRadius * (0.9 + rng() * 0.2);
    const bx = cx + dist * Math.cos(angle);
    const by = cy + dist * Math.sin(angle);
    ctx.beginPath();
    ctx.arc(bx, by, wreathRadius * 0.025, 0, Math.PI * 2);
    ctx.fillStyle = berryColor;
    ctx.fill();
  }

  // Small flowers at cardinal points
  const flowerPositions = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
  flowerPositions.forEach((angle) => {
    const fx = cx + wreathRadius * 1.05 * Math.cos(angle);
    const fy = cy + wreathRadius * 1.05 * Math.sin(angle);
    drawFlower(ctx, fx, fy, wreathRadius * 0.08, p.secondary, p.accent);
  });

  // Main text inside wreath
  const { main, sub } = splitPhrase(text);
  const innerW = wreathRadius * 1.3;
  const mainText = main.join(" ");
  const { fontSize, lines } = fitText(ctx, mainText, innerW, f.name, f.weight, wreathRadius * 0.45);
  setFont(ctx, f.weight, fontSize, f.name);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = p.accent;

  const lh = fontSize * 1.15;
  const totalH = lines.length * lh;
  const startY = cy - totalH / 2 + lh / 2 - (sub ? wreathRadius * 0.08 : 0);
  lines.forEach((line, i) => {
    ctx.fillText(line, cx, startY + i * lh);
  });

  // Subtitle below in small caps
  if (sub) {
    const subFS = fitLine(ctx, sub, innerW * 0.8, secFont, 700, fontSize * 0.3, 18);
    setFont(ctx, 700, subFS, secFont);
    ctx.fillStyle = p.primary;
    ctx.fillText(sub, cx, startY + totalH + subFS * 0.6);
  }
}

// ── 5. Arch Minimal ──

function renderArchMinimal(ctx: CanvasRenderingContext2D, c: RenderConfig) {
  const { width: W, height: H, palette: p, font: f, text } = c;
  const displayText = text.toUpperCase();
  const cx = W / 2;

  // Solid background
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, H);

  const words = displayText.split(/\s+/);
  const maxW = W * 0.75;

  if (words.length >= 3) {
    // Top arch text
    const topWords = words.slice(0, Math.ceil(words.length * 0.4));
    const topText = topWords.join(" ");
    const topFS = fitLine(ctx, topText, maxW * 0.7, f.name, f.weight, H * 0.06, 24);

    // Draw top text in arch
    const topRadius = W * 0.32;
    const topCenterY = H * 0.42;
    setFont(ctx, f.weight, topFS, f.name);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = p.primary;

    const chars = topText.split("");
    const totalAngle = Math.PI * 0.55;
    const startAngle = -Math.PI / 2 - totalAngle / 2;
    chars.forEach((char, i) => {
      const angle = startAngle + (i / (chars.length - 1 || 1)) * totalAngle;
      const x = cx + topRadius * Math.cos(angle);
      const y = topCenterY + topRadius * Math.sin(angle);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillText(char, 0, 0);
      ctx.restore();
    });

    // Thin arc line above
    ctx.save();
    ctx.strokeStyle = p.secondary;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, topCenterY, topRadius + topFS * 0.7, -Math.PI / 2 - totalAngle / 2, -Math.PI / 2 + totalAngle / 2);
    ctx.stroke();
    ctx.restore();

    // Large center word(s)
    const midWords = words.slice(topWords.length, -1);
    const midText = midWords.length > 0 ? midWords.join(" ") : words[Math.floor(words.length / 2)];
    const midFS = fitLine(ctx, midText, maxW, f.name, f.weight, H * 0.18, 60);
    setFont(ctx, f.weight, midFS, f.name);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = p.primary;
    ctx.fillText(midText, cx, H * 0.5);

    // Bottom arch text (curve down)
    const bottomText = words[words.length - 1];
    const botFS = fitLine(ctx, bottomText, maxW * 0.6, f.name, f.weight, H * 0.06, 24);
    const botRadius = W * 0.28;
    const botCenterY = H * 0.52;
    setFont(ctx, f.weight, botFS, f.name);
    ctx.fillStyle = p.primary;

    const botChars = bottomText.split("");
    const botTotalAngle = Math.PI * 0.45;
    const botStartAngle = Math.PI / 2 - botTotalAngle / 2;
    botChars.forEach((char, i) => {
      const angle = botStartAngle + (i / (botChars.length - 1 || 1)) * botTotalAngle;
      const x = cx + botRadius * Math.cos(angle);
      const y = botCenterY + botRadius * Math.sin(angle);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillText(char, 0, 0);
      ctx.restore();
    });

    // Thin arc line below
    ctx.save();
    ctx.strokeStyle = p.secondary;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, botCenterY, botRadius + botFS * 0.7, Math.PI / 2 - botTotalAngle / 2, Math.PI / 2 + botTotalAngle / 2);
    ctx.stroke();
    ctx.restore();
  } else {
    // Short phrase — centered with arch accents
    const { fontSize, lines } = fitText(ctx, displayText, maxW, f.name, f.weight, H * 0.15);
    setFont(ctx, f.weight, fontSize, f.name);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = p.primary;
    const lh = fontSize * 1.1;
    const totalH = lines.length * lh;
    const startY = (H - totalH) / 2 + lh / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, cx, startY + i * lh);
    });

    // Thin arch lines
    ctx.save();
    ctx.strokeStyle = p.secondary;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, startY - fontSize * 0.3, maxW * 0.35, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, startY + totalH + fontSize * 0.1, maxW * 0.35, Math.PI * 0.1, Math.PI * 0.9);
    ctx.stroke();
    ctx.restore();
  }
}

// ── 6. Groovy 70s ──

function renderGroovy70s(ctx: CanvasRenderingContext2D, c: RenderConfig) {
  const { width: W, height: H, palette: p, font: f, text, rng } = c;

  // Warm retro background
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle radial gradient overlay
  const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.7);
  grad.addColorStop(0, "rgba(255,255,255,0.08)");
  grad.addColorStop(1, "rgba(0,0,0,0.1)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Wavy top border
  ctx.save();
  ctx.strokeStyle = p.primary;
  ctx.lineWidth = 8;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 5) {
    const y = H * 0.08 + Math.sin(x * 0.005) * 30;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  // Wavy bottom border
  ctx.save();
  ctx.strokeStyle = p.primary;
  ctx.lineWidth = 8;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 5) {
    const y = H * 0.92 + Math.sin(x * 0.005 + 2) * 30;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  // Main text — bubble letters
  const words = text.split(/\s+/);
  const maxW = W * 0.85;
  const lineData: { word: string; fontSize: number }[] = [];

  // Size each word to fill width
  words.slice(0, 5).forEach((word) => {
    const fs = fitLine(ctx, word, maxW, f.name, f.weight, H * 0.18, 40);
    lineData.push({ word, fontSize: fs });
  });

  const totalH = lineData.reduce((s, d) => s + d.fontSize * 1.0, 0);
  let y = (H - totalH) / 2;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  lineData.forEach((d, i) => {
    y += d.fontSize * 1.0;
    const ty = y - d.fontSize * 0.5;

    setFont(ctx, f.weight, d.fontSize, f.name);

    // 3D shadow
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fillText(d.word, W / 2 + 6, ty + 6);

    // Thick outline (bubble effect)
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineWidth = d.fontSize * 0.12;
    ctx.strokeStyle = p.accent;
    ctx.strokeText(d.word, W / 2, ty);
    ctx.restore();

    // Fill with alternating colors
    ctx.fillStyle = i % 2 === 0 ? p.primary : p.secondary;
    ctx.fillText(d.word, W / 2, ty);
  });

  // Decorative elements — daisies and stars
  const decorCount = 6;
  for (let i = 0; i < decorCount; i++) {
    const dx = W * (0.05 + rng() * 0.15) * (rng() > 0.5 ? 1 : 0) + W * (0.85 + rng() * 0.1) * (rng() > 0.5 ? 1 : 0);
    const dy = H * (0.15 + rng() * 0.7);
    if (rng() > 0.5) {
      drawDaisy(ctx, dx || W * 0.08, dy, W * 0.03, p.accent, p.primary);
    } else {
      drawStars(ctx, dx || W * 0.92, dy, W * 0.02, p.accent);
    }
  }
}

// ── 7. Distressed Vintage ──

function renderDistressedVintage(ctx: CanvasRenderingContext2D, c: RenderConfig) {
  const { width: W, height: H, palette: p, font: f, text, rng } = c;
  const displayText = text.toUpperCase();

  // Aged paper background
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle variation for aged look
  ctx.save();
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = rng() > 0.5 ? "#8B7355" : "#A0926B";
    const rx = rng() * W;
    const ry = rng() * H;
    const rw = rng() * W * 0.4 + W * 0.1;
    const rh = rng() * H * 0.3 + H * 0.1;
    ctx.fillRect(rx, ry, rw, rh);
  }
  ctx.restore();

  // Grain texture
  addGrainTexture(ctx, W, H, 0.06);

  // Rough border frame with broken edges
  const margin = W * 0.07;
  ctx.save();
  ctx.strokeStyle = p.primary;
  ctx.lineWidth = 5;
  // Top
  for (let x = margin; x < W - margin; x += 3) {
    if (rng() > 0.15) {
      ctx.beginPath();
      ctx.moveTo(x, margin + (rng() - 0.5) * 4);
      ctx.lineTo(x + 3, margin + (rng() - 0.5) * 4);
      ctx.stroke();
    }
  }
  // Bottom
  for (let x = margin; x < W - margin; x += 3) {
    if (rng() > 0.15) {
      ctx.beginPath();
      ctx.moveTo(x, H - margin + (rng() - 0.5) * 4);
      ctx.lineTo(x + 3, H - margin + (rng() - 0.5) * 4);
      ctx.stroke();
    }
  }
  // Left
  for (let y = margin; y < H - margin; y += 3) {
    if (rng() > 0.15) {
      ctx.beginPath();
      ctx.moveTo(margin + (rng() - 0.5) * 4, y);
      ctx.lineTo(margin + (rng() - 0.5) * 4, y + 3);
      ctx.stroke();
    }
  }
  // Right
  for (let y = margin; y < H - margin; y += 3) {
    if (rng() > 0.15) {
      ctx.beginPath();
      ctx.moveTo(W - margin + (rng() - 0.5) * 4, y);
      ctx.lineTo(W - margin + (rng() - 0.5) * 4, y + 3);
      ctx.stroke();
    }
  }
  ctx.restore();

  // Text with worn stamp effect — slightly uneven baseline
  const maxW = W * 0.75;
  const { fontSize, lines } = fitText(ctx, displayText, maxW, f.name, f.weight, H * 0.14);
  const lh = fontSize * 1.15;
  const totalH = lines.length * lh;
  const startY = (H - totalH) / 2 + lh / 2;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  lines.forEach((line, i) => {
    // Render each character with slight vertical offset
    setFont(ctx, f.weight, fontSize, f.name);
    const chars = line.split("");
    const lineWidth = ctx.measureText(line).width;
    let charX = W / 2 - lineWidth / 2;

    chars.forEach((char) => {
      const charW = ctx.measureText(char).width;
      const yOffset = (rng() - 0.5) * fontSize * 0.04;
      ctx.fillStyle = p.primary;
      ctx.fillText(char, charX + charW / 2, startY + i * lh + yOffset);
      charX += charW;
    });
  });

  // Apply distress mask over text
  applyDistressMask(ctx, W, H, 0.15, rng);
}

// ── 8. Watercolor Splash ──

function renderWatercolorSplash(ctx: CanvasRenderingContext2D, c: RenderConfig) {
  const { width: W, height: H, palette: p, font: f, text, rng } = c;

  // Light background
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, H);

  // Watercolor blobs
  const blobColors = [p.primary, p.secondary, p.accent];
  for (let i = 0; i < 10; i++) {
    const bx = W * (0.2 + rng() * 0.6);
    const by = H * (0.2 + rng() * 0.6);
    const br = Math.min(W, H) * (0.15 + rng() * 0.2);
    const col = blobColors[Math.floor(rng() * blobColors.length)];
    drawWatercolorBlob(ctx, bx, by, br, col, 0.08 + rng() * 0.1, rng);
  }

  // Additional edge blobs for framing
  const edgeBlobs = [
    { x: W * 0.1, y: H * 0.1 }, { x: W * 0.9, y: H * 0.15 },
    { x: W * 0.15, y: H * 0.85 }, { x: W * 0.85, y: H * 0.9 },
  ];
  edgeBlobs.forEach((pos) => {
    const col = blobColors[Math.floor(rng() * blobColors.length)];
    drawWatercolorBlob(ctx, pos.x, pos.y, Math.min(W, H) * 0.18, col, 0.12, rng);
  });

  // Main text — clean and crisp
  const displayText = text;
  const maxW = W * 0.7;
  const { fontSize, lines } = fitText(ctx, displayText, maxW, f.name, f.weight, H * 0.12);
  setFont(ctx, f.weight, fontSize, f.name);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lh = fontSize * 1.2;
  const totalH = lines.length * lh;
  const startY = (H - totalH) / 2 + lh / 2;

  // Text shadow for readability
  ctx.save();
  ctx.shadowColor = "rgba(255,255,255,0.8)";
  ctx.shadowBlur = 20;
  ctx.fillStyle = p.accent;
  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, startY + i * lh);
  });
  ctx.restore();

  // Brush stroke underline
  ctx.save();
  ctx.strokeStyle = p.primary;
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.5;
  const ulY = startY + (lines.length - 1) * lh + fontSize * 0.6;
  ctx.beginPath();
  for (let x = W * 0.3; x <= W * 0.7; x += 4) {
    const y = ulY + Math.sin(x * 0.02) * 4 + (rng() - 0.5) * 3;
    if (x === W * 0.3) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

// ── 9. Bold Stacked ──

function renderBoldStacked(ctx: CanvasRenderingContext2D, c: RenderConfig) {
  const { width: W, height: H, palette: p, font: f, text } = c;
  const displayText = text.toUpperCase();
  const words = displayText.split(/\s+/).slice(0, 6);
  const maxW = W * 0.92;

  // High contrast background
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, H);

  // Size each word to fill the same width
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lineData: { word: string; fontSize: number }[] = [];
  words.forEach((word) => {
    let fs = 500;
    setFont(ctx, f.weight, fs, f.name);
    while (ctx.measureText(word).width > maxW && fs > 30) {
      fs -= 5;
      setFont(ctx, f.weight, fs, f.name);
    }
    lineData.push({ word, fontSize: fs });
  });

  // Calculate total height with tight spacing
  const spacing = 0.9;
  const totalH = lineData.reduce((s, d) => s + d.fontSize * spacing, 0);
  let y = (H - totalH) / 2;

  lineData.forEach((d) => {
    y += d.fontSize * spacing;
    const ty = y - d.fontSize * spacing / 2;

    setFont(ctx, f.weight, d.fontSize, f.name);
    ctx.fillStyle = p.primary;
    ctx.fillText(d.word, W / 2, ty);
  });

  // Optional thin rules between words
  ctx.save();
  ctx.strokeStyle = p.secondary;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.2;
  y = (H - totalH) / 2;
  lineData.forEach((d, i) => {
    y += d.fontSize * spacing;
    if (i < lineData.length - 1) {
      const ruleY = y;
      ctx.beginPath();
      ctx.moveTo(W * 0.1, ruleY);
      ctx.lineTo(W * 0.9, ruleY);
      ctx.stroke();
    }
  });
  ctx.restore();
}

// ── 10. Cottagecore ──

function renderCottagecore(ctx: CanvasRenderingContext2D, c: RenderConfig) {
  const { width: W, height: H, palette: p, font: f, text, rng } = c;
  const sConfig = STYLE_CONFIG["cottagecore"];
  const secFont = sConfig.secondaryFont || "Montserrat";

  // Pale pastel background
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle radial gradient
  const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
  grad.addColorStop(0, "rgba(255,255,255,0.1)");
  grad.addColorStop(1, "rgba(0,0,0,0.03)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Botanical frame — leaves and small flowers around the edges
  const frameMargin = W * 0.1;
  const leafSize = W * 0.04;
  const leafColor = p.primary;

  // Top edge — vine with leaves
  for (let x = frameMargin; x < W - frameMargin; x += leafSize * 2.5) {
    const y = frameMargin + Math.sin(x * 0.008) * 20;
    const angle = -Math.PI / 4 + rng() * Math.PI / 6;
    drawLeaf(ctx, x, y, leafSize * (0.8 + rng() * 0.4), angle, leafColor);
    if (rng() > 0.7) {
      drawFlower(ctx, x + leafSize, y - leafSize * 0.3, leafSize * 0.5, p.secondary, p.accent);
    }
  }

  // Bottom edge
  for (let x = frameMargin; x < W - frameMargin; x += leafSize * 2.5) {
    const y = H - frameMargin + Math.sin(x * 0.008 + 1) * 20;
    const angle = Math.PI / 4 + rng() * Math.PI / 6;
    drawLeaf(ctx, x, y, leafSize * (0.8 + rng() * 0.4), angle + Math.PI, leafColor);
    if (rng() > 0.7) {
      drawFlower(ctx, x + leafSize, y + leafSize * 0.3, leafSize * 0.5, p.secondary, p.accent);
    }
  }

  // Left edge
  for (let y = frameMargin + leafSize * 2; y < H - frameMargin - leafSize * 2; y += leafSize * 3) {
    const x = frameMargin + Math.sin(y * 0.006) * 15;
    drawLeaf(ctx, x, y, leafSize * (0.7 + rng() * 0.4), -Math.PI / 2 + rng() * 0.4, leafColor);
  }

  // Right edge
  for (let y = frameMargin + leafSize * 2; y < H - frameMargin - leafSize * 2; y += leafSize * 3) {
    const x = W - frameMargin + Math.sin(y * 0.006 + 2) * 15;
    drawLeaf(ctx, x, y, leafSize * (0.7 + rng() * 0.4), Math.PI / 2 + rng() * 0.4, leafColor);
  }

  // Heart accent at top center
  const heartX = W / 2, heartY = H * 0.15;
  const hs = W * 0.025;
  ctx.save();
  ctx.fillStyle = p.secondary;
  ctx.beginPath();
  ctx.moveTo(heartX, heartY + hs * 0.4);
  ctx.bezierCurveTo(heartX - hs, heartY - hs * 0.5, heartX - hs * 1.5, heartY + hs * 0.3, heartX, heartY + hs * 1.2);
  ctx.bezierCurveTo(heartX + hs * 1.5, heartY + hs * 0.3, heartX + hs, heartY - hs * 0.5, heartX, heartY + hs * 0.4);
  ctx.fill();
  ctx.restore();

  // Main text — flowing script
  const { main, sub } = splitPhrase(text);
  const mainText = main.join(" ");
  const contentW = W - frameMargin * 2 - W * 0.1;
  const { fontSize, lines } = fitText(ctx, mainText, contentW, f.name, f.weight, H * 0.12);

  setFont(ctx, f.weight, fontSize, f.name);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Soft shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.08)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = p.accent;
  const lh = fontSize * 1.2;
  const totalH = lines.length * lh;
  const startY = H * 0.48 - totalH / 2 + lh / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, startY + i * lh);
  });
  ctx.restore();

  // Subtitle
  if (sub) {
    const subFS = fitLine(ctx, sub, contentW * 0.7, secFont, 700, fontSize * 0.28, 18);
    setFont(ctx, 700, subFS, secFont);
    ctx.fillStyle = p.primary;
    ctx.textAlign = "center";
    ctx.fillText(sub, W / 2, startY + totalH + subFS * 0.8);
  }
}

// ── 11. Street Graffiti ──

function renderStreetGraffiti(ctx: CanvasRenderingContext2D, c: RenderConfig) {
  const { width: W, height: H, palette: p, font: f, text, rng } = c;
  const displayText = text.toUpperCase();

  // Dark textured background
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle noise for texture
  addGrainTexture(ctx, W, H, 0.04);

  // Fit text
  const words = displayText.split(/\s+/).slice(0, 5);
  const maxW = W * 0.88;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lineData: { word: string; fontSize: number }[] = [];
  words.forEach((word) => {
    let fs = 450;
    setFont(ctx, f.weight, fs, f.name);
    while (ctx.measureText(word).width > maxW && fs > 40) {
      fs -= 5;
      setFont(ctx, f.weight, fs, f.name);
    }
    lineData.push({ word, fontSize: fs });
  });

  const totalH = lineData.reduce((s, d) => s + d.fontSize * 0.95, 0);
  let y = (H - totalH) / 2;

  lineData.forEach((d, i) => {
    y += d.fontSize * 0.95;
    const ty = y - d.fontSize * 0.95 / 2;
    setFont(ctx, f.weight, d.fontSize, f.name);

    // 3D depth — offset shadow
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillText(d.word, W / 2 + 8, ty + 8);

    // Gradient fill for letters
    const textGrad = ctx.createLinearGradient(0, ty - d.fontSize / 2, 0, ty + d.fontSize / 2);
    textGrad.addColorStop(0, p.primary);
    textGrad.addColorStop(1, p.secondary);

    // Thick outline
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineWidth = d.fontSize * 0.06;
    ctx.strokeStyle = p.accent;
    ctx.strokeText(d.word, W / 2, ty);
    ctx.restore();

    // Fill with gradient
    ctx.fillStyle = textGrad;
    ctx.fillText(d.word, W / 2, ty);

    // Drip effect on bottom of some letters
    if (i === lineData.length - 1 || rng() > 0.6) {
      const lineW = ctx.measureText(d.word).width;
      const dripCount = Math.floor(rng() * 3) + 1;
      for (let j = 0; j < dripCount; j++) {
        const dx = W / 2 - lineW / 2 + rng() * lineW;
        const dy = ty + d.fontSize * 0.4;
        const dripH = rng() * d.fontSize * 0.4 + d.fontSize * 0.1;
        ctx.beginPath();
        ctx.moveTo(dx - 4, dy);
        ctx.lineTo(dx + 4, dy);
        ctx.lineTo(dx + 2, dy + dripH);
        ctx.bezierCurveTo(dx + 2, dy + dripH + 8, dx - 2, dy + dripH + 8, dx - 2, dy + dripH);
        ctx.closePath();
        ctx.fillStyle = p.primary;
        ctx.fill();
      }
    }
  });

  // Spray paint splatter
  ctx.save();
  for (let i = 0; i < 80; i++) {
    const sx = rng() * W;
    const sy = rng() * H;
    const sr = rng() * 4 + 1;
    ctx.globalAlpha = rng() * 0.3 + 0.1;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fillStyle = rng() > 0.5 ? p.primary : p.secondary;
    ctx.fill();
  }
  ctx.restore();
}

// ── 12. Luxury Gold ──

function renderLuxuryGold(ctx: CanvasRenderingContext2D, c: RenderConfig) {
  const { width: W, height: H, palette: p, font: f, text } = c;
  const sConfig = STYLE_CONFIG["luxury-gold"];
  const secFont = sConfig.secondaryFont || "Raleway";
  const displayText = text.toUpperCase();
  const margin = W * 0.1;

  // Deep dark background
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle vignette
  const vig = ctx.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W * 0.8);
  vig.addColorStop(0, "transparent");
  vig.addColorStop(1, "rgba(0,0,0,0.3)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // Gold border frame
  ctx.save();
  ctx.strokeStyle = p.primary;
  ctx.lineWidth = 4;
  ctx.strokeRect(margin, margin, W - margin * 2, H - margin * 2);
  // Inner thin border
  ctx.lineWidth = 1.5;
  ctx.strokeRect(margin + 18, margin + 18, W - margin * 2 - 36, H - margin * 2 - 36);
  ctx.restore();

  // Corner ornament flourishes
  const fSize = W * 0.07;
  drawCornerFlourish(ctx, margin, margin, fSize, 0, p.primary);
  drawCornerFlourish(ctx, W - margin, margin, fSize, Math.PI / 2, p.primary);
  drawCornerFlourish(ctx, W - margin, H - margin, fSize, Math.PI, p.primary);
  drawCornerFlourish(ctx, margin, H - margin, fSize, -Math.PI / 2, p.primary);

  // Gold gradient for text
  const goldGrad = ctx.createLinearGradient(0, H * 0.3, 0, H * 0.7);
  goldGrad.addColorStop(0, p.secondary);
  goldGrad.addColorStop(0.3, p.primary);
  goldGrad.addColorStop(0.5, p.secondary);
  goldGrad.addColorStop(0.7, p.primary);
  goldGrad.addColorStop(1, p.secondary);

  // Split text
  const { main, sub } = splitPhrase(displayText);
  const mainText = main.join(" ");
  const contentW = W - margin * 2 - 80;

  // Subtitle above
  if (sub) {
    const subText = sub.toUpperCase();
    const subFS = fitLine(ctx, subText, contentW * 0.7, secFont, 700, H * 0.04, 20);
    setFont(ctx, 700, subFS, secFont);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = p.primary;
    ctx.letterSpacing = "6px";
    ctx.fillText(subText, W / 2, H * 0.33);
    ctx.letterSpacing = "0px";

    // Ornamental divider
    drawOrnamentalDivider(ctx, W / 2, H * 0.39, contentW * 0.5, p.primary);
  }

  // Main text with gold gradient
  const { fontSize, lines } = fitText(ctx, mainText, contentW, f.name, f.weight, H * 0.14);
  setFont(ctx, f.weight, fontSize, f.name);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lh = fontSize * 1.15;
  const totalH = lines.length * lh;
  const startY = (sub ? H * 0.52 : H / 2) - totalH / 2 + lh / 2;

  // Text shadow
  ctx.save();
  ctx.shadowColor = p.primary;
  ctx.shadowBlur = 15;
  ctx.fillStyle = goldGrad;
  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, startY + i * lh);
  });
  ctx.restore();

  // Shimmer highlight — thin white line across top of text
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W * 0.2, startY - fontSize * 0.3);
  ctx.lineTo(W * 0.8, startY - fontSize * 0.3);
  ctx.stroke();
  ctx.restore();

  // Bottom ornamental divider
  drawOrnamentalDivider(ctx, W / 2, startY + totalH + fontSize * 0.5, contentW * 0.4, p.primary);
}

// ══════════════════════════════════════════════════════════════
// STYLE RENDERER MAP
// ══════════════════════════════════════════════════════════════

const STYLE_RENDERERS: Record<StylePreset, (ctx: CanvasRenderingContext2D, c: RenderConfig) => void> = {
  "retro-badge": renderRetroBadge,
  "neon-glow": renderNeonGlow,
  "farmhouse": renderFarmhouse,
  "boho-wreath": renderBohoWreath,
  "arch-minimal": renderArchMinimal,
  "groovy-70s": renderGroovy70s,
  "distressed-vintage": renderDistressedVintage,
  "watercolor-splash": renderWatercolorSplash,
  "bold-stacked": renderBoldStacked,
  "cottagecore": renderCottagecore,
  "street-graffiti": renderStreetGraffiti,
  "luxury-gold": renderLuxuryGold,
};

// ══════════════════════════════════════════════════════════════
// MAIN API
// ══════════════════════════════════════════════════════════════

export interface MockupData {
  canvasMockups: Record<string, string>;
  printfulMockups: Record<string, string>;
}

export interface DesignResult {
  id: number;
  text: string;
  fontName: string;
  paletteName: string;
  style: StylePreset;
  layout: LayoutType;
  mood: string;
  subNiche: string;
  dataUrl: string;
  selected: boolean;
  mockups?: MockupData;
}

export interface PhraseData {
  id: number;
  text: string;
  mood: string;
  audience: string;
  subNiche: string;
}

export function renderDesign(config: {
  text: string;
  style: StylePreset;
  font: FontDef;
  palette: PaletteDef;
  layout: LayoutType;
  width: number;
  height: number;
}): string {
  const canvas = document.createElement("canvas");
  canvas.width = config.width;
  canvas.height = config.height;
  const ctx = canvas.getContext("2d")!;

  const rng = createRng(simpleHash(config.text));
  const fullConfig: RenderConfig = { ...config, rng };

  const renderer = STYLE_RENDERERS[config.style] || renderBoldStacked;
  renderer(ctx, fullConfig);

  return canvas.toDataURL("image/png");
}

// ── Batch Generator ──

export function generateBatchDesigns(
  phrases: PhraseData[],
  options: {
    width?: number;
    height?: number;
    designsPerPhrase?: number;
    preferredStyle?: StylePreset;
    preferredPalette?: string;
  } = {}
): DesignResult[] {
  const { width = 4500, height = 5400, preferredStyle, preferredPalette } = options;
  const results: DesignResult[] = [];

  // Build non-preferred styles list for variety slots
  const otherStyles = preferredStyle
    ? STYLE_NAMES.filter((s) => s !== preferredStyle)
    : STYLE_NAMES;
  let otherIdx = 0;

  for (let i = 0; i < phrases.length; i++) {
    const phrase = phrases[i];
    const hash = simpleHash(phrase.text + i);

    // When a preferred style is set, use it for ~60% of designs
    // Pattern: preferred, preferred, other, preferred, preferred, other, ...
    let style: StylePreset;
    if (preferredStyle) {
      const inGroup = i % 3; // 0,1 = preferred, 2 = other
      if (inGroup < 2) {
        style = preferredStyle;
      } else {
        style = otherStyles[otherIdx % otherStyles.length];
        otherIdx++;
      }
    } else {
      // Default: cycle through styles evenly
      style = STYLE_NAMES[i % STYLE_NAMES.length];
    }
    const sConfig = STYLE_CONFIG[style];

    // Pick compatible font and palette
    const fontName = sConfig.fonts[hash % sConfig.fonts.length];
    const font = FONT_LIBRARY.find((f) => f.name === fontName) || FONT_LIBRARY[0];

    // Prefer the suggested palette if it's compatible with this style
    let paletteName: string;
    if (preferredPalette && sConfig.palettes.includes(preferredPalette)) {
      // Use preferred palette for ~50% of designs, hash-pick for rest
      paletteName = (hash % 2 === 0) ? preferredPalette : sConfig.palettes[(hash >> 4) % sConfig.palettes.length];
    } else {
      paletteName = sConfig.palettes[(hash >> 4) % sConfig.palettes.length];
    }
    const palette = COLOR_PALETTES.find((p) => p.name === paletteName) || COLOR_PALETTES[0];

    const dataUrl = renderDesign({
      text: sConfig.textTransform === "uppercase" ? phrase.text.toUpperCase() : phrase.text,
      style,
      font,
      palette,
      layout: "centered-stack",
      width,
      height,
    });

    results.push({
      id: i,
      text: phrase.text,
      fontName: font.name,
      paletteName: palette.name,
      style,
      layout: "centered-stack",
      mood: phrase.mood,
      subNiche: phrase.subNiche,
      dataUrl,
      selected: true,
    });
  }

  return results;
}

// ── Mixed Mode: Overlay text on a graphic background ──

export async function overlayTextOnGraphic(
  backgroundDataUrl: string,
  phrase: PhraseData,
  options: {
    width?: number;
    height?: number;
    preferredStyle?: StylePreset;
    preferredPalette?: string;
  } = {}
): Promise<string> {
  const { width = 4500, height = 5400, preferredStyle, preferredPalette } = options;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Draw the AI-generated background image
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load background image"));
    img.src = backgroundDataUrl;
  });

  // Scale and center the background to fill canvas
  const scale = Math.max(width / img.width, height / img.height);
  const sw = img.width * scale;
  const sh = img.height * scale;
  const sx = (width - sw) / 2;
  const sy = (height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh);

  // Add a semi-transparent overlay for text readability
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillRect(0, 0, width, height);

  // Pick style/font/palette
  const hash = simpleHash(phrase.text);
  const style: StylePreset = preferredStyle || STYLE_NAMES[hash % STYLE_NAMES.length];
  const sConfig = STYLE_CONFIG[style];
  const fontName = sConfig.fonts[hash % sConfig.fonts.length];
  const font = FONT_LIBRARY.find((f) => f.name === fontName) || FONT_LIBRARY[0];
  const paletteName = preferredPalette && sConfig.palettes.includes(preferredPalette)
    ? preferredPalette
    : sConfig.palettes[(hash >> 4) % sConfig.palettes.length];
  const palette = COLOR_PALETTES.find((p) => p.name === paletteName) || COLOR_PALETTES[0];

  // Render text overlay using the existing style renderers but with transparent bg
  const textCanvas = document.createElement("canvas");
  textCanvas.width = width;
  textCanvas.height = height;
  const textCtx = textCanvas.getContext("2d")!;

  const textToRender = sConfig.textTransform === "uppercase" ? phrase.text.toUpperCase() : phrase.text;

  // Use bold-stacked for text overlay (most readable on graphic backgrounds)
  // Draw text with a strong shadow/outline for readability
  const fontSize = Math.min(width / 6, height / 8);
  textCtx.textAlign = "center";
  textCtx.textBaseline = "middle";

  const lines = wrapText(textToRender, 20);
  const lineHeight = fontSize * 1.2;
  const totalHeight = lines.length * lineHeight;
  const startY = height / 2 - totalHeight / 2 + lineHeight / 2;

  // Text shadow/outline for readability
  textCtx.shadowColor = "rgba(0, 0, 0, 0.8)";
  textCtx.shadowBlur = 20;
  textCtx.shadowOffsetX = 4;
  textCtx.shadowOffsetY = 4;

  textCtx.font = `${font.weight} ${fontSize}px "${font.name}", ${font.category}`;
  textCtx.fillStyle = palette.primary;

  for (let li = 0; li < lines.length; li++) {
    textCtx.fillText(lines[li], width / 2, startY + li * lineHeight);
  }

  // Second pass: no shadow, slightly smaller for crisp rendering
  textCtx.shadowColor = "transparent";
  textCtx.shadowBlur = 0;
  textCtx.shadowOffsetX = 0;
  textCtx.shadowOffsetY = 0;
  textCtx.fillText("", 0, 0); // clear shadow state

  // Composite text onto background
  ctx.drawImage(textCanvas, 0, 0);

  return canvas.toDataURL("image/png");
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxCharsPerLine && current.length > 0) {
      lines.push(current.trim());
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current.trim());
  return lines.length > 0 ? lines : [text];
}

// ── Export Helpers ──

export function designToBlob(dataUrl: string): Promise<Blob> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => resolve(blob!), "image/png");
    };
    img.src = dataUrl;
  });
}

/**
 * Removes the solid background from a design, returning a transparent-bg dataUrl.
 * Samples the top-left corner pixel as the bg color and replaces all matching
 * pixels (with tolerance) with fully transparent.
 */
export function removeDesignBackground(dataUrl: string, tolerance = 40): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Sample bg color from top-left corner
      const bgR = data[0], bgG = data[1], bgB = data[2];

      for (let i = 0; i < data.length; i += 4) {
        const dr = Math.abs(data[i] - bgR);
        const dg = Math.abs(data[i + 1] - bgG);
        const db = Math.abs(data[i + 2] - bgB);
        if (dr <= tolerance && dg <= tolerance && db <= tolerance) {
          data[i + 3] = 0; // Make transparent
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.src = dataUrl;
  });
}

export function generateCSV(
  designs: DesignResult[],
  metadata: Array<{ title: string; tags: string[]; description: string }>
): string {
  const headers = ["filename", "title", "tags", "description", "font", "style", "mood", "sub_niche"];
  const rows = designs.map((d, i) => {
    const meta = metadata[i] || { title: d.text, tags: [], description: "" };
    const filename = `design-${String(i + 1).padStart(3, "0")}.png`;
    return [
      filename,
      `"${meta.title.replace(/"/g, '""')}"`,
      `"${meta.tags.join(", ").replace(/"/g, '""')}"`,
      `"${meta.description.replace(/"/g, '""')}"`,
      d.fontName,
      d.style,
      d.mood,
      d.subNiche,
    ].join(",");
  });
  return [headers.join(","), ...rows].join("\n");
}
