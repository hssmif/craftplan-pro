// Wall Art Auto-Package Pipeline
// Orchestrates: upscale → crops → mockups → competitor scan → SEO listing → smart pricing

import sharp from "sharp";
import { writeFile, mkdir, access } from "fs/promises";
import { readFileSync } from "fs";
import path from "path";
import { searchEtsyListings, analyzeNiche } from "./etsy-research";
import { parseGeminiJSON } from "./gemini";
import { callBestJSON } from "./openai";
import { upscaleForPrint } from "./fal-upscale";
import { loadLibrary, matchFramesToArt, compositeArtInFrame, MockupFrame } from "./mockup-library";

// ── Types ──

export interface PackageResult {
  productId: string;
  crops: { ratio: string; path: string; width: number; height: number }[];
  mockups: { template: string; path: string }[];
  infoImages: { name: string; path: string }[];
  listing: { title: string; description: string; tags: string[]; price: number };
  etsyListingId?: string;
}

export interface PipelineStep {
  step: number;
  total: number;
  label: string;
  status: "running" | "done" | "error";
  detail?: string;
}

export type ProgressCallback = (step: PipelineStep, result?: PackageResult) => void;

// ── Constants ──

const CROP_RATIOS: { label: string; ratio: [number, number]; printSize: string }[] = [
  { label: "2:3", ratio: [2, 3], printSize: '16"x24"' },
  { label: "3:4", ratio: [3, 4], printSize: '12"x16"' },
  { label: "4:5", ratio: [4, 5], printSize: '16"x20"' },
  { label: "5:7", ratio: [5, 7], printSize: '10"x14"' },
  { label: "1:1", ratio: [1, 1], printSize: '12"x12"' },
  { label: "3:2", ratio: [3, 2], printSize: '24"x16"' },
  { label: "16:9", ratio: [16, 9], printSize: '32"x18"' },
];

// Print sizes at 300 DPI for each ratio
const CROP_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "2:3": { width: 4800, height: 7200 },
  "3:4": { width: 3600, height: 4800 },
  "4:5": { width: 4800, height: 6000 },
  "5:7": { width: 3000, height: 4200 },
  "1:1": { width: 3600, height: 3600 },
  "3:2": { width: 7200, height: 4800 },
  "16:9": { width: 7200, height: 4050 },
};

const MOCKUP_TEMPLATES = [
  { id: "white", name: "White Frame" },
  { id: "black", name: "Black Frame" },
  { id: "wood", name: "Ornate Wood Frame" },
  { id: "floating", name: "Floating Frame" },
  { id: "gallery", name: "Gallery Wall" },
  { id: "samsung-tv", name: "Samsung Frame TV" },
  { id: "gallery-set", name: "Gallery Wall Set" },
];

const TOTAL_STEPS = 8;

// ── Niche Intelligence (from OnDemand School 2026 Market Report) ──

export const NICHE_INTELLIGENCE: {
  niche: string; opportunity: string; competition: string;
  priceRange: string; whyNow: string;
}[] = [
  { niche: "Samsung Frame TV Art", opportunity: "HIGH", competition: "Medium", priceRange: "$5–$15", whyNow: "Growing hardware adoption; seasonal bundles sell year-round. 16:9 format = less competition." },
  { niche: "Personalized Star Maps", opportunity: "HIGH", competition: "Medium", priceRange: "$15–$40+", whyNow: "Strong gift-giving appeal (weddings, anniversaries). Premium pricing accepted." },
  { niche: "Curated Gallery Wall Sets (3–6 prints)", opportunity: "HIGH", competition: "Medium-High", priceRange: "$12–$25", whyNow: "Etsy 2026 trend report highlights this. Higher AOV than singles." },
  { niche: "Dark Academia / Gothic / Celestial", opportunity: "HIGH", competition: "Low-Medium", priceRange: "$5–$18", whyNow: "Gothmas flagged in Etsy trend report. Underserved niche with passionate buyers." },
  { niche: "Vintage Botanical / Scientific Illustration", opportunity: "HIGH", competition: "Medium", priceRange: "$4–$12", whyNow: "Biophilic design trend growing. Nature reconnection drives purchases." },
  { niche: "Nursery Art (Safari / Woodland)", opportunity: "STRONG", competition: "High", priceRange: "$8–$93", whyNow: "Evergreen demand from new parents. Premium pricing for sets of 6." },
  { niche: "Flower Market Posters", opportunity: "STRONG", competition: "High", priceRange: "$4–$20", whyNow: "~1,252 monthly sales on top listings. City-themed series create repeat buyers." },
  { niche: "Maximalist / Dopamine Decor", opportunity: "HIGH", competition: "Low", priceRange: "$5–$15", whyNow: "Gen Z rejection of minimalism. Bold colors, pattern-on-pattern. Early mover advantage." },
  { niche: "Vintage Travel Posters", opportunity: "STRONG", competition: "Medium", priceRange: "$4–$12", whyNow: "Art Deco revival + retro circus up 130% on Pinterest. Destination-specific = long-tail SEO wins." },
  { niche: "Japandi / Warm Minimalism", opportunity: "GROWING", competition: "Low-Medium", priceRange: "$4–$15", whyNow: "Japanese wabi-sabi meets Scandinavian simplicity. Interior designers recommending." },
  { niche: "Coastal Grandmother / Seascape", opportunity: "STRONG", competition: "Medium", priceRange: "$5–$14", whyNow: "Nancy Meyers aesthetic still trending. Soft blues + sand tones." },
  { niche: "AI / Futuristic / Sci-Fi Art", opportunity: "GROWING", competition: "Low", priceRange: "$4–$12", whyNow: "Gaming and tech niche. Office/studio decor. Keywords growing." },
  { niche: "Bookish / Dark Academia / Literary", opportunity: "GROWING", competition: "Low", priceRange: "$5–$15", whyNow: "BookTok-driven. Personalized bookshelf prints. Devoted year-round buyer base." },
  { niche: "Mid-Century Modern / Matisse", opportunity: "STRONG", competition: "Medium", priceRange: "$4–$20", whyNow: "Matisse cutout style, bold shapes. Consistent demand." },
  { niche: "Farmhouse / Rustic Botanical", opportunity: "STRONG", competition: "Medium", priceRange: "$4–$12", whyNow: "Wheat, wildflower, and botanical illustration. Neutral tones." },
];

// ── 2026 Trending Color Palettes ──

const TRENDING_PALETTES: { name: string; colors: string; bestFor: string }[] = [
  { name: "Earthy Warm Neutrals", colors: "terracotta, rust, clay, olive, ochre, warm beige, cream", bestFor: "Boho, farmhouse, vintage" },
  { name: "Soft Pastels", colors: "dusty rose, sage, lavender, mint, powder blue", bestFor: "Nursery, wedding, feminine spaces" },
  { name: "Rich Jewel Tones", colors: "burnt mahogany, plum berry, deep emerald, sapphire", bestFor: "Dramatic statement pieces, gothic, maximalist" },
  { name: "Coastal Blues", colors: "navy, seafoam, dusty blue, warm sand, pale gray", bestFor: "Coastal grandmother, seascape, bathroom art" },
  { name: "B&W + Cream", colors: "pure black, white, warm cream, charcoal", bestFor: "Minimalist, line art, photography, modern" },
];

// Seasonal SEO terms
function getSeasonalTag(): string {
  const month = new Date().getMonth(); // 0-11
  if (month >= 2 && month <= 4) return "spring decor 2026";
  if (month >= 5 && month <= 7) return "summer wall art 2026";
  if (month >= 8 && month <= 10) return "fall decor 2026";
  return "winter wall art 2026";
}

// ── Helpers ──

function emit(
  cb: ProgressCallback,
  step: number,
  status: PipelineStep["status"],
  label: string,
  detail?: string,
  result?: PackageResult
) {
  cb({ step, total: TOTAL_STEPS, label, status, detail }, result);
}

function calculateSmartPrice(
  avgPrice: number,
  competition: string,
  demandScore: number
): number {
  // Report insight: $3-$8 sweet spot for singles, but premium niches go higher
  // Undercut competitors slightly to gain traction as newer shop
  let price = avgPrice * 0.88;

  if (competition === "very high") price *= 0.85;
  else if (competition === "high") price *= 0.92;
  else if (competition === "low") price *= 1.2;  // low comp = charge more
  else if (competition === "medium") price *= 1.05;

  if (demandScore > 70) price *= 1.15;
  else if (demandScore > 50) price *= 1.05;
  else if (demandScore < 30) price *= 0.9;

  // Report sweet spot: $3-$8 for singles, cap at $14.99 for premium
  return Math.max(3.49, Math.min(14.99, Math.round(price * 100) / 100));
}

// ── Mockup Generator (Sharp SVG composite) ──

function buildMockupSvg(
  artWidth: number,
  artHeight: number,
  template: string
): { svg: Buffer; width: number; height: number; artX: number; artY: number; artW: number; artH: number } {
  const canvasW = 1200;
  const canvasH = 900;

  // Frame + art placement per template
  const configs: Record<string, {
    bgColor: string; frameColor: string; matColor: string;
    frameX: number; frameY: number; frameW: number; frameH: number;
    artPad: number; shadow: string;
  }> = {
    white: {
      bgColor: "#f5f0eb", frameColor: "#ffffff", matColor: "#fafaf5",
      frameX: 380, frameY: 80, frameW: 440, frameH: 580, artPad: 35,
      shadow: '<filter id="s"><feDropShadow dx="0" dy="8" stdDeviation="20" flood-opacity="0.25"/></filter>',
    },
    black: {
      bgColor: "#1a1a1e", frameColor: "#111111", matColor: "#fafaf5",
      frameX: 380, frameY: 80, frameW: 440, frameH: 580, artPad: 30,
      shadow: '<filter id="s"><feDropShadow dx="0" dy="8" stdDeviation="24" flood-opacity="0.5"/></filter>',
    },
    floating: {
      bgColor: "#f0ece4", frameColor: "#d4a574", matColor: "none",
      frameX: 390, frameY: 90, frameW: 420, frameH: 560, artPad: 8,
      shadow: '<filter id="s"><feDropShadow dx="0" dy="4" stdDeviation="12" flood-opacity="0.2"/></filter>',
    },
    wood: {
      bgColor: "#2a1f16", frameColor: "#b8860b", matColor: "#c9a84c",
      frameX: 360, frameY: 70, frameW: 480, frameH: 620, artPad: 55,
      shadow: '<filter id="s"><feDropShadow dx="0" dy="10" stdDeviation="22" flood-opacity="0.5"/></filter>',
    },
    gallery: {
      bgColor: "#e8e4dc", frameColor: "#2c2c2c", matColor: "#ffffff",
      frameX: 380, frameY: 100, frameW: 440, frameH: 560, artPad: 40,
      shadow: '<filter id="s"><feDropShadow dx="0" dy="12" stdDeviation="28" flood-opacity="0.35"/></filter>',
    },
  };

  const c = configs[template] || configs.white;
  const artX = c.frameX + c.artPad;
  const artY = c.frameY + c.artPad;
  const artW = c.frameW - c.artPad * 2;
  const artH = c.frameH - c.artPad * 2;

  // Maintain aspect ratio within art area
  const srcRatio = artWidth / artHeight;
  const dstRatio = artW / artH;
  let finalW = artW, finalH = artH, finalX = artX, finalY = artY;
  if (srcRatio > dstRatio) {
    finalH = Math.round(artW / srcRatio);
    finalY = artY + Math.round((artH - finalH) / 2);
  } else {
    finalW = Math.round(artH * srcRatio);
    finalX = artX + Math.round((artW - finalW) / 2);
  }

  // Build ornate wood frame with multiple layers for rich look
  const isWood = template === "wood";
  const outerFrame = isWood
    ? `<rect x="${c.frameX}" y="${c.frameY}" width="${c.frameW}" height="${c.frameH}" rx="6" fill="#8B6914" filter="url(#s)"/>
  <rect x="${c.frameX + 4}" y="${c.frameY + 4}" width="${c.frameW - 8}" height="${c.frameH - 8}" rx="4" fill="url(#woodGrad)"/>
  <rect x="${c.frameX + 12}" y="${c.frameY + 12}" width="${c.frameW - 24}" height="${c.frameH - 24}" rx="2" fill="#c9a84c" opacity="0.6"/>
  <rect x="${c.frameX + 16}" y="${c.frameY + 16}" width="${c.frameW - 32}" height="${c.frameH - 32}" rx="2" fill="url(#woodGrad2)"/>
  <rect x="${c.frameX + 40}" y="${c.frameY + 40}" width="${c.frameW - 80}" height="${c.frameH - 80}" rx="1" fill="#d4af37" opacity="0.4"/>
  <rect x="${c.frameX + 44}" y="${c.frameY + 44}" width="${c.frameW - 88}" height="${c.frameH - 88}" fill="#f5f0e8"/>`
    : `<rect x="${c.frameX}" y="${c.frameY}" width="${c.frameW}" height="${c.frameH}" rx="4" fill="${c.frameColor}" filter="url(#s)"/>
  ${c.matColor !== "none" ? `<rect x="${c.frameX + 6}" y="${c.frameY + 6}" width="${c.frameW - 12}" height="${c.frameH - 12}" fill="${c.matColor}"/>` : ""}`;

  const woodDefs = isWood
    ? `<linearGradient id="woodGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#d4a535"/>
      <stop offset="30%" stop-color="#b8860b"/>
      <stop offset="60%" stop-color="#d4a535"/>
      <stop offset="100%" stop-color="#8B6914"/>
    </linearGradient>
    <linearGradient id="woodGrad2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#c9a84c"/>
      <stop offset="50%" stop-color="#a67c00"/>
      <stop offset="100%" stop-color="#c9a84c"/>
    </linearGradient>`
    : "";

  const svg = `<svg width="${canvasW}" height="${canvasH}" xmlns="http://www.w3.org/2000/svg">
  <defs>${c.shadow}${woodDefs}</defs>
  <rect width="${canvasW}" height="${canvasH}" fill="${c.bgColor}"/>
  ${outerFrame}
</svg>`;

  return {
    svg: Buffer.from(svg),
    width: canvasW,
    height: canvasH,
    artX: finalX,
    artY: finalY,
    artW: finalW,
    artH: finalH,
  };
}

// ── Info Image Generator (What's Included / Size Guide) ──

function buildWhatsIncludedSvg(): Buffer {
  const w = 2400;
  const h = 1800;

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&amp;display=swap');
      text { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; }
    </style>
  </defs>

  <!-- Background: split layout -->
  <rect width="${w}" height="${h}" fill="#f5f0eb"/>
  <rect width="720" height="${h}" fill="#6b7c5e"/>

  <!-- Left column: Download → Print → Frame -->
  <g fill="#1a1a1a" text-anchor="middle">
    <!-- Cloud download icon -->
    <g transform="translate(360, 200)">
      <path d="M-50,-30 C-50,-65 -20,-85 15,-85 C45,-85 70,-70 75,-45 C105,-40 120,-15 105,15 C95,35 70,40 -55,40 C-80,40 -95,20 -95,-5 C-95,-20 -80,-30 -50,-30Z" fill="#1a1a1a"/>
      <rect x="-8" y="15" width="16" height="50" fill="#1a1a1a"/>
      <polygon points="-30,45 0,80 30,45" fill="#1a1a1a"/>
    </g>
    <text x="360" y="320" font-size="48" font-weight="800" letter-spacing="3">DOWNLOAD</text>

    <!-- Down arrow -->
    <rect x="352" y="350" width="16" height="60" fill="#1a1a1a"/>
    <polygon points="330,400 360,440 390,400" fill="#1a1a1a"/>

    <!-- Printer icon -->
    <g transform="translate(360, 550)">
      <rect x="-70" y="-40" width="140" height="80" rx="8" fill="#1a1a1a"/>
      <rect x="-50" y="-70" width="100" height="40" fill="#1a1a1a"/>
      <rect x="-45" y="10" width="90" height="50" fill="#f5f0eb"/>
      <rect x="-35" y="20" width="70" height="6" fill="#ccc"/>
      <rect x="-35" y="32" width="50" height="6" fill="#ccc"/>
    </g>
    <text x="360" y="680" font-size="48" font-weight="800" letter-spacing="3">PRINT</text>

    <!-- Down arrow -->
    <rect x="352" y="710" width="16" height="60" fill="#1a1a1a"/>
    <polygon points="330,760 360,800 390,760" fill="#1a1a1a"/>

    <!-- Frame icon -->
    <g transform="translate(360, 920)">
      <rect x="-70" y="-90" width="140" height="180" rx="4" stroke="#1a1a1a" stroke-width="8" fill="none"/>
      <rect x="-55" y="-75" width="110" height="150" fill="#ddd"/>
      <polygon points="-55,75 -10,20 20,50 55,-30 55,75" fill="#aaa"/>
      <circle cx="-25" cy="-45" r="18" fill="#bbb"/>
    </g>
    <text x="360" y="1080" font-size="48" font-weight="800" letter-spacing="3">FRAME</text>
  </g>

  <!-- Right column: sizes info -->
  <g fill="#1a1a1a">
    <text x="880" y="180" font-size="72" font-weight="800" letter-spacing="2">INSTANT DOWNLOAD</text>
    <line x1="880" y1="210" x2="2200" y2="210" stroke="#1a1a1a" stroke-width="3"/>

    <text x="880" y="300" font-size="36" fill="#444">Each digital print comes in the following printing</text>
    <text x="880" y="345" font-size="36" fill="#444">ratios for you to print out and fit into almost</text>
    <text x="880" y="390" font-size="36" fill="#444">any standard frame:</text>

    <!-- 2:3 -->
    <text x="940" y="500" font-size="28" fill="#b8860b" font-weight="700">&#9733;</text>
    <text x="980" y="500" font-size="44" font-weight="800">2:3 RATIO:</text>
    <text x="1060" y="550" font-size="34" fill="#444">8x12, 10x15, 12x18, 16x24, 20x30 inches</text>

    <!-- 3:4 -->
    <text x="940" y="640" font-size="28" fill="#b8860b" font-weight="700">&#9733;</text>
    <text x="980" y="640" font-size="44" font-weight="800">3:4 RATIO:</text>
    <text x="1060" y="690" font-size="34" fill="#444">6x8, 9x12, 12x16, 15x20, 18x24, 24x32 inches</text>

    <!-- 4:5 -->
    <text x="940" y="780" font-size="28" fill="#b8860b" font-weight="700">&#9733;</text>
    <text x="980" y="780" font-size="44" font-weight="800">4:5 RATIO:</text>
    <text x="1060" y="830" font-size="34" fill="#444">4x5, 8x10, 12x15, 16x20, 24x30 inches</text>

    <!-- 5:7 -->
    <text x="940" y="920" font-size="28" fill="#b8860b" font-weight="700">&#9733;</text>
    <text x="980" y="920" font-size="44" font-weight="800">5x7 RATIO:</text>
    <text x="1060" y="970" font-size="34" fill="#444">5x7, 10x14, 20x28 inches</text>

    <!-- 1:1 -->
    <text x="940" y="1060" font-size="28" fill="#b8860b" font-weight="700">&#9733;</text>
    <text x="980" y="1060" font-size="44" font-weight="800">1:1 SQUARE:</text>
    <text x="1060" y="1110" font-size="34" fill="#444">8x8, 10x10, 12x12, 16x16 inches</text>

    <!-- 3:2 -->
    <text x="940" y="1200" font-size="28" fill="#b8860b" font-weight="700">&#9733;</text>
    <text x="980" y="1200" font-size="44" font-weight="800">3:2 LANDSCAPE:</text>
    <text x="1060" y="1250" font-size="34" fill="#444">12x8, 18x12, 24x16, 30x20 inches</text>

    <!-- 16:9 -->
    <text x="940" y="1340" font-size="28" fill="#b8860b" font-weight="700">&#9733;</text>
    <text x="980" y="1340" font-size="44" font-weight="800">16:9 SAMSUNG FRAME TV:</text>
    <text x="1060" y="1390" font-size="34" fill="#444">Optimized for Samsung Frame TV display</text>

    <!-- ISO A-sizes note -->
    <rect x="880" y="1440" width="1300" height="70" rx="8" fill="#f0ebe0"/>
    <text x="940" y="1485" font-size="30" fill="#666" font-weight="600">&#127760; Also fits ISO A-sizes: A5, A4, A3, A2 for international printing</text>

    <!-- Footer -->
    <text x="880" y="1580" font-size="32" fill="#666" font-style="italic">300 DPI high resolution • Instant download • Print at home</text>
    <text x="880" y="1625" font-size="32" fill="#666" font-style="italic">or upload to your favorite print service!</text>
  </g>
</svg>`;

  return Buffer.from(svg);
}

function buildFrameOverlaySvg(artWidth: number, artHeight: number): Buffer {
  // Build a detailed ornate gold frame as an overlay PNG
  // The art will be composited underneath this frame
  const w = 1200;
  const h = 900;
  const pad = 85; // thick ornate border
  const innerPad = 12;
  const fx = 300, fy = 30; // frame position
  const fw = 600, fh = 840;

  // Art area coordinates (where the art will show through)
  const artX = fx + pad;
  const artY = fy + pad;
  const artW = fw - pad * 2;
  const artH = fh - pad * 2;

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Clip path to cut out art area from the frame overlay -->
    <clipPath id="frameClip">
      <path d="M0,0 H${w} V${h} H0 Z M${artX},${artY} V${artY + artH} H${artX + artW} V${artY} Z" clip-rule="evenodd"/>
    </clipPath>
    <!-- Gold gradients for realism -->
    <linearGradient id="gold1" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e6c547"/>
      <stop offset="25%" stop-color="#c9a020"/>
      <stop offset="50%" stop-color="#e6c547"/>
      <stop offset="75%" stop-color="#a67c00"/>
      <stop offset="100%" stop-color="#d4af37"/>
    </linearGradient>
    <linearGradient id="gold2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#d4a535"/>
      <stop offset="50%" stop-color="#8B6914"/>
      <stop offset="100%" stop-color="#d4a535"/>
    </linearGradient>
    <linearGradient id="gold3" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#c9a84c"/>
      <stop offset="50%" stop-color="#e6c547"/>
      <stop offset="100%" stop-color="#a67c00"/>
    </linearGradient>
    <radialGradient id="corner" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#e6c547"/>
      <stop offset="100%" stop-color="#8B6914"/>
    </radialGradient>
    <filter id="shadow">
      <feDropShadow dx="0" dy="10" stdDeviation="25" flood-opacity="0.5"/>
    </filter>
  </defs>

  <!-- Everything clipped so art area is transparent -->
  <g clip-path="url(#frameClip)">
    <!-- Dark wall background -->
    <rect width="${w}" height="${h}" fill="#2a1f16"/>

    <!-- Outer frame (main gold border) -->
    <rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" rx="6" fill="url(#gold1)" filter="url(#shadow)"/>

    <!-- Frame ridge 1 (outer molding) -->
    <rect x="${fx + 8}" y="${fy + 8}" width="${fw - 16}" height="${fh - 16}" rx="4" fill="url(#gold2)"/>

    <!-- Decorative inner channel -->
    <rect x="${fx + 20}" y="${fy + 20}" width="${fw - 40}" height="${fh - 40}" rx="3" fill="url(#gold3)"/>

    <!-- Inner flat band -->
    <rect x="${fx + 28}" y="${fy + 28}" width="${fw - 56}" height="${fh - 56}" rx="2" fill="url(#gold1)"/>

    <!-- Ornamental corner pieces -->
    <g transform="translate(${fx + 10}, ${fy + 10})">
      <ellipse cx="30" cy="30" rx="25" ry="25" fill="url(#corner)" opacity="0.8"/>
      <path d="M5,5 Q30,-5 55,5 Q65,30 55,55 Q30,65 5,55 Q-5,30 5,5Z" fill="url(#gold3)" opacity="0.6"/>
    </g>
    <g transform="translate(${fx + fw - 70}, ${fy + 10})">
      <ellipse cx="30" cy="30" rx="25" ry="25" fill="url(#corner)" opacity="0.8"/>
      <path d="M5,5 Q30,-5 55,5 Q65,30 55,55 Q30,65 5,55 Q-5,30 5,5Z" fill="url(#gold3)" opacity="0.6"/>
    </g>
    <g transform="translate(${fx + 10}, ${fy + fh - 70})">
      <ellipse cx="30" cy="30" rx="25" ry="25" fill="url(#corner)" opacity="0.8"/>
      <path d="M5,5 Q30,-5 55,5 Q65,30 55,55 Q30,65 5,55 Q-5,30 5,5Z" fill="url(#gold3)" opacity="0.6"/>
    </g>
    <g transform="translate(${fx + fw - 70}, ${fy + fh - 70})">
      <ellipse cx="30" cy="30" rx="25" ry="25" fill="url(#corner)" opacity="0.8"/>
      <path d="M5,5 Q30,-5 55,5 Q65,30 55,55 Q30,65 5,55 Q-5,30 5,5Z" fill="url(#gold3)" opacity="0.6"/>
    </g>

    <!-- Edge scrollwork -->
    ${[0, 1, 2].map(i => `
      <ellipse cx="${fx + 150 + i * 150}" cy="${fy + 15}" rx="20" ry="10" fill="url(#corner)" opacity="0.5"/>
      <ellipse cx="${fx + 150 + i * 150}" cy="${fy + fh - 15}" rx="20" ry="10" fill="url(#corner)" opacity="0.5"/>
    `).join("")}
    ${[0, 1, 2, 3, 4].map(i => `
      <ellipse cx="${fx + 15}" cy="${fy + 120 + i * 150}" rx="10" ry="20" fill="url(#corner)" opacity="0.5"/>
      <ellipse cx="${fx + fw - 15}" cy="${fy + 120 + i * 150}" rx="10" ry="20" fill="url(#corner)" opacity="0.5"/>
    `).join("")}

    <!-- Inner gold lip -->
    <rect x="${fx + 38}" y="${fy + 38}" width="${fw - 76}" height="${fh - 76}" rx="2" fill="#d4af37" opacity="0.7"/>

    <!-- Mat border (stops at art edge) -->
    <rect x="${fx + 42}" y="${fy + 42}" width="${fw - 84}" height="${fh - 84}" fill="#f5f0e5"/>
  </g>
</svg>`;

  return Buffer.from(svg);
}

// ── Samsung Frame TV Mockup ──

function buildSamsungTVSvg(): {
  svg: Buffer; width: number; height: number;
  artX: number; artY: number; artW: number; artH: number;
} {
  const w = 1200, h = 900;
  // TV dimensions: sleek thin-bezel Samsung Frame style
  const tvX = 160, tvY = 80, tvW = 880, tvH = 520;
  const bezel = 8;
  const artX = tvX + bezel, artY = tvY + bezel;
  const artW = tvW - bezel * 2, artH = tvH - bezel * 2;

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="tvShadow"><feDropShadow dx="0" dy="12" stdDeviation="20" flood-opacity="0.3"/></filter>
    <linearGradient id="wallGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f0ece4"/>
      <stop offset="100%" stop-color="#e5ddd0"/>
    </linearGradient>
    <linearGradient id="woodFloor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#c9a76c"/>
      <stop offset="100%" stop-color="#a8885c"/>
    </linearGradient>
  </defs>

  <!-- Living room wall -->
  <rect width="${w}" height="680" fill="url(#wallGrad)"/>

  <!-- Hardwood floor -->
  <rect y="680" width="${w}" height="220" fill="url(#woodFloor)"/>
  <line x1="0" y1="680" x2="${w}" y2="680" stroke="#b8976a" stroke-width="2"/>
  ${[0,1,2,3,4,5].map(i => `<line x1="${i * 200}" y1="680" x2="${i * 200 + 100}" y2="${h}" stroke="#b89060" stroke-width="0.5" opacity="0.3"/>`).join("")}

  <!-- Console/shelf below TV -->
  <rect x="340" y="650" width="520" height="25" rx="3" fill="#3a3530"/>
  <rect x="340" y="648" width="520" height="4" fill="#504540"/>

  <!-- Small plant on shelf -->
  <g transform="translate(750, 610)">
    <rect x="-12" y="15" width="24" height="28" rx="3" fill="#c9a76c"/>
    <ellipse cx="0" cy="10" rx="18" ry="12" fill="#6b8e5e"/>
    <ellipse cx="-8" cy="2" rx="10" ry="14" fill="#7a9e6e"/>
    <ellipse cx="8" cy="4" rx="9" ry="12" fill="#5d7e50"/>
  </g>

  <!-- Small decorative object -->
  <g transform="translate(450, 640)">
    <rect x="-8" y="0" width="16" height="12" rx="2" fill="#b8860b" opacity="0.6"/>
  </g>

  <!-- Samsung Frame TV -->
  <rect x="${tvX}" y="${tvY}" width="${tvW}" height="${tvH}" rx="2" fill="#111111" filter="url(#tvShadow)"/>

  <!-- Thin bezel highlight -->
  <rect x="${tvX + 1}" y="${tvY + 1}" width="${tvW - 2}" height="${tvH - 2}" rx="2" fill="none" stroke="#333" stroke-width="1"/>

  <!-- Art display area (where the art goes) -->
  <rect x="${artX}" y="${artY}" width="${artW}" height="${artH}" fill="#1a1a1a"/>

  <!-- Samsung Frame TV label (subtle) -->
  <text x="${tvX + tvW / 2}" y="${tvY + tvH + 18}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#999" letter-spacing="2">SAMSUNG FRAME TV ART</text>
</svg>`;

  return { svg: Buffer.from(svg), width: w, height: h, artX, artY, artW, artH };
}

// ── Gallery Wall Set Mockup (shows art in 3-piece arrangement) ──

function buildGalleryWallSetSvg(): {
  svg: Buffer; width: number; height: number;
  positions: { x: number; y: number; w: number; h: number }[];
} {
  const w = 1200, h = 900;

  // Three frames arranged on wall: large center + two smaller flanking
  const positions = [
    { x: 80, y: 160, w: 260, h: 390 },    // Left: portrait 2:3
    { x: 400, y: 100, w: 400, h: 530 },    // Center: large portrait 3:4
    { x: 860, y: 180, w: 240, h: 340 },    // Right: smaller portrait 5:7
  ];

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="gsShadow"><feDropShadow dx="0" dy="6" stdDeviation="14" flood-opacity="0.25"/></filter>
    <linearGradient id="gsWall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f5f0e8"/>
      <stop offset="100%" stop-color="#ebe4d6"/>
    </linearGradient>
  </defs>

  <!-- Warm wall -->
  <rect width="${w}" height="${h}" fill="url(#gsWall)"/>

  <!-- Subtle wainscoting line -->
  <line x1="0" y1="780" x2="${w}" y2="780" stroke="#d9cfbf" stroke-width="2"/>
  <rect y="780" width="${w}" height="120" fill="#ece5d8"/>

  <!-- Furniture hint: low credenza -->
  <rect x="200" y="740" width="800" height="30" rx="4" fill="#8b7355"/>
  <rect x="200" y="738" width="800" height="5" fill="#9e8567"/>

  <!-- Small plant on credenza -->
  <g transform="translate(880, 700)">
    <rect x="-10" y="12" width="20" height="30" rx="4" fill="#e8dcc8"/>
    <ellipse cx="0" cy="5" rx="16" ry="18" fill="#7a9e6e"/>
    <ellipse cx="-7" cy="-2" rx="10" ry="15" fill="#6b8e5e"/>
  </g>

  <!-- Three frames with white mats -->
  ${positions.map((p, i) => {
    const matPad = i === 1 ? 20 : 15; // bigger mat for center piece
    return `
    <!-- Frame ${i + 1} -->
    <rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="2" fill="#ffffff" filter="url(#gsShadow)"/>
    <rect x="${p.x + 3}" y="${p.y + 3}" width="${p.w - 6}" height="${p.h - 6}" fill="#fafaf5"/>
    <rect x="${p.x + matPad}" y="${p.y + matPad}" width="${p.w - matPad * 2}" height="${p.h - matPad * 2}" fill="#e0e0e0"/>`;
  }).join("")}

  <!-- Label -->
  <text x="${w / 2}" y="${h - 20}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#999" letter-spacing="3" font-weight="600">GALLERY WALL SET • 3 PRINTS INCLUDED</text>
</svg>`;

  return { svg: Buffer.from(svg), width: w, height: h, positions };
}

// ── Gallery Wall Bundle Pipeline ──
// Takes 3-6 related images and creates a curated gallery wall set listing
// Report insight: Gallery sets command $12-$25 vs $3-$5 for singles (3-4x revenue)

export interface BundleResult {
  productId: string;
  prints: { path: string; ratio: string; width: number; height: number }[];
  galleryMockup: string; // path to the gallery arrangement mockup
  mockups: { template: string; path: string }[];
  infoImages: { name: string; path: string }[];
  listing: { title: string; description: string; tags: string[]; price: number };
  printCount: number;
}

export async function runGalleryBundle(
  imageBuffers: Buffer[],
  niche: string,
  setDescription: string,
  onProgress: ProgressCallback
): Promise<BundleResult> {
  const productId = `wb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const baseDir = path.join(process.cwd(), "data", "wall-art", productId);
  const printsDir = path.join(baseDir, "prints");
  const mockupsDir = path.join(baseDir, "mockups");
  await mkdir(printsDir, { recursive: true });
  await mkdir(mockupsDir, { recursive: true });

  const printCount = imageBuffers.length;
  const result: BundleResult = {
    productId,
    prints: [],
    galleryMockup: "",
    mockups: [],
    infoImages: [],
    listing: { title: "", description: "", tags: [], price: 12.99 },
    printCount,
  };

  // Step 1: Process each image — upscale + generate primary 2:3 crop
  emit(onProgress, 1, "running", `Processing ${printCount} prints for gallery set`);

  const processedArts: Buffer[] = [];
  for (let i = 0; i < imageBuffers.length; i++) {
    const meta = await sharp(imageBuffers[i]).metadata();
    const maxDim = 7200;
    const upscaled = (meta.width || 0) < maxDim
      ? await sharp(imageBuffers[i]).resize(maxDim, maxDim, { fit: "inside", kernel: sharp.kernel.lanczos3 }).png({ quality: 100 }).withMetadata({ density: 300 }).toBuffer()
      : await sharp(imageBuffers[i]).png({ quality: 100 }).withMetadata({ density: 300 }).toBuffer();

    // Generate 2:3 crop (most popular wall art ratio)
    const srcMeta = await sharp(upscaled).metadata();
    const srcW = srcMeta.width || 4800, srcH = srcMeta.height || 7200;
    const targetRatio = 2 / 3;
    const srcRatio = srcW / srcH;
    let extractW = srcW, extractH = srcH, extractX = 0, extractY = 0;
    if (srcRatio > targetRatio) { extractW = Math.round(srcH * targetRatio); extractX = Math.round((srcW - extractW) / 2); }
    else { extractH = Math.round(srcW / targetRatio); extractY = Math.round((srcH - extractH) / 2); }

    const cropped = await sharp(upscaled)
      .extract({ left: extractX, top: extractY, width: extractW, height: extractH })
      .resize(4800, 7200, { kernel: sharp.kernel.lanczos3 })
      .png({ quality: 100 }).withMetadata({ density: 300 }).toBuffer();

    const printPath = path.join(printsDir, `print-${i + 1}-2x3-4800x7200.png`);
    await writeFile(printPath, cropped);
    result.prints.push({ path: printPath, ratio: "2:3", width: 4800, height: 7200 });
    processedArts.push(cropped);
  }

  emit(onProgress, 1, "done", `${printCount} prints processed`, `${printCount} x 2:3 at 300 DPI`);

  // Step 2: Generate gallery wall arrangement mockup (THE key selling image)
  emit(onProgress, 2, "running", "Creating gallery wall arrangement mockup");

  try {
    const gs = buildGalleryWallSetSvg();
    const composites: { input: Buffer; left: number; top: number }[] = [];

    for (let i = 0; i < Math.min(gs.positions.length, processedArts.length); i++) {
      const pos = gs.positions[i];
      const matPad = i === 1 ? 20 : 15;
      const artBuf = await sharp(processedArts[i]).resize(pos.w - matPad * 2, pos.h - matPad * 2, { fit: "cover" }).toBuffer();
      composites.push({ input: artBuf, left: pos.x + matPad, top: pos.y + matPad });
    }

    const galleryMockup = await sharp(gs.svg).resize(gs.width, gs.height).composite(composites).png({ quality: 90 }).toBuffer();
    const galleryPath = path.join(mockupsDir, "gallery-arrangement.png");
    await writeFile(galleryPath, galleryMockup);
    result.galleryMockup = galleryPath;
    result.mockups.push({ template: "gallery-arrangement", path: galleryPath });
  } catch (err) {
    console.error("Gallery arrangement mockup failed:", err);
  }

  // Also create individual white-frame mockups for each print
  for (let i = 0; i < processedArts.length; i++) {
    const artSmall = await sharp(processedArts[i]).resize(800, 1200, { fit: "inside" }).png().toBuffer();
    const artMeta = await sharp(artSmall).metadata();
    const mockup = buildMockupSvg(artMeta.width || 800, artMeta.height || 1200, "white");
    const resizedArt = await sharp(artSmall).resize(mockup.artW, mockup.artH, { fit: "cover" }).toBuffer();
    const mockupImg = await sharp(mockup.svg).resize(mockup.width, mockup.height)
      .composite([{ input: resizedArt, left: mockup.artX, top: mockup.artY }])
      .png({ quality: 90 }).toBuffer();
    const mPath = path.join(mockupsDir, `print-${i + 1}-white.png`);
    await writeFile(mPath, mockupImg);
    result.mockups.push({ template: `print-${i + 1}-white`, path: mPath });
  }

  emit(onProgress, 2, "done", "Gallery mockups created", `1 arrangement + ${processedArts.length} individual`);

  // Step 3: Competitor scan
  emit(onProgress, 3, "running", "Scanning gallery set competitors");
  let avgPrice = 14.99, competitionLevel = "medium", demandScore = 60;
  let topTags: string[] = [];

  try {
    const query = `${niche} gallery wall art set digital download printable`;
    const { total, listings } = await searchEtsyListings(query, "score", 24);
    const analysis = analyzeNiche(
      listings.map(l => ({ price: l.price, favorites: l.favorites, views: l.views, listing_age_days: l.listing_age_days })),
      total
    );
    avgPrice = analysis.avg_price || 14.99;
    competitionLevel = analysis.competition_level;
    demandScore = analysis.demand_score;
    const tagCounts: Record<string, number> = {};
    for (const l of listings) { try { const tags: string[] = JSON.parse(l.tags); for (const t of tags) { const tag = t.toLowerCase().trim(); if (tag) tagCounts[tag] = (tagCounts[tag] || 0) + 1; } } catch { /* skip */ } }
    topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag]) => tag);
    emit(onProgress, 3, "done", "Competitor data collected", `Avg price: $${avgPrice}, Competition: ${competitionLevel}`);
  } catch {
    emit(onProgress, 3, "done", "Using default market data", "Etsy scan unavailable");
  }

  // Step 4: SEO listing for bundle
  emit(onProgress, 4, "running", "Generating bundle SEO listing");
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!openaiKey && !geminiKey) throw new Error("No LLM key configured");

    const seasonalTag = getSeasonalTag();
    const bundlePrompt = `You are an Etsy SEO specialist writing listings that match Etsy's 2026 semantic-search algorithm.
Generate a GALLERY WALL SET listing for a curated set of ${printCount} matching prints.

SET DESCRIPTION: ${setDescription}
NICHE: ${niche}
NUMBER OF PRINTS: ${printCount}

COMPETITOR DATA: Avg price: $${avgPrice}, Competition: ${competitionLevel}, Top tags: ${topTags.slice(0, 15).join(", ")}, Demand: ${demandScore}/100

═══ TITLE RULES — Etsy 2026 algorithm ═══
Etsy penalizes keyword-stuffed titles. Write ONE natural title.

1. **Length**: 70–120 chars optimal, max 140.
2. **Must include** "Set of ${printCount}" and "Gallery Wall" naturally.
3. **Front-load** the exact phrase buyers type in the first 40 chars.
4. **Punctuation**: at most ONE separator (colon, single pipe, OR parens) — never stack.
5. **Title Case** — NO ALL-CAPS, NO emojis, NO banner words like "INSTANT DOWNLOAD".
6. **Natural order**: subject/style → "Print Set of ${printCount}" → "Gallery Wall Art" → attribute → format in parens.

GOOD EXAMPLES:
"Vintage Botanical Print Set of ${printCount}: Cottagecore Gallery Wall Art for Living Room (Printable)"
"Abstract Ocean Print Set of ${printCount} | Coastal Gallery Wall Decor (Digital Download)"

BAD EXAMPLES (do NOT produce these):
"Vintage Botanical Print Set of ${printCount} | INSTANT DOWNLOAD | Gallery Wall Art | Digital Download Printable | Cottagecore Home Decor"

═══ DESCRIPTION — match top Etsy bestseller format ═══
Write using ♥ section headers and ✦ bullet markers (NOT emojis). Structure:

[One warm 3–4 sentence hook paragraph describing the cohesive theme, color palette, and mood of the set. Mention how it looks as a gallery wall.]

♥ YOU WILL RECEIVE:
${printCount} coordinated high-resolution prints in multiple size ratios, all at 300 DPI and ready for professional-quality printing.
✦ 2:3 Ratio for Printing - 4"x6", 8"x12", 12"x18", 16"x24", 20"x30"
✦ 3:4 Ratio for Printing - 6"x8", 9"x12", 12"x16", 18"x24"
✦ 4:5 Ratio for Printing - 8"x10", 12"x15", 16"x20", 20"x25"
✦ 5:7 / ISO Size for Printing - 5"x7", A5, A4, A3, A2, A1
✦ 16:9 Samsung Frame TV ratio included

♥ INSTANT DOWNLOAD:
[Short paragraph about Etsy instant delivery + mobile browser workaround.]

♥ HOW TO PRINT & ARRANGE:
[Print at home, local shop, or online service. Tips for arranging as a gallery wall — spacing, alignment, frame style.]

♥ PLEASE NOTE:
• Colors may vary slightly based on monitor and printer.
• Depending on ratio, small edge crop may occur.
• This is a digital file — no physical item will be shipped.
• Personal use only; please do not resell the file or prints.

Thanks for visiting!

═══ 13 TAGS ═══
Tags 1-3: "gallery wall art set", "print set of ${printCount}", primary niche keyword
Tags 4-6: Room-specific long-tail phrases
Tags 7-9: Style descriptors
Tags 10-11: Gift/occasion keywords
Tag 12: "printable art set"
Tag 13: "${seasonalTag}"

Tags must be max 20 chars, lowercase, and NOT repeat words from the title.

Return JSON: { "title": "...", "description": "...", "tags": ["tag1"..."tag13"] }`;

    const raw = await callBestJSON({
      openaiKey,
      geminiKey,
      prompt: bundlePrompt,
      systemHint: "You are an expert Etsy SEO copywriter for gallery wall art sets. Return ONLY valid JSON with keys: title, description, tags (array of 13 short phrases).",
    });
    const parsed = parseGeminiJSON<{ title: string; description: string; tags: string[] }>(raw);
    result.listing.title = (parsed.title || "").substring(0, 140);
    result.listing.description = parsed.description || "";
    result.listing.tags = (parsed.tags || []).slice(0, 13).map((t: string) => t.substring(0, 20));
    emit(onProgress, 4, "done", "Bundle listing generated", `${result.listing.tags.length} SEO tags`);
  } catch {
    const nicheClean = niche.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    result.listing.title = `${nicheClean} Print Set of ${printCount}: Gallery Wall Art for Modern Home Decor (Printable)`.substring(0, 140);
    result.listing.description = `A beautifully curated gallery wall set of ${printCount} coordinated ${niche} prints. The palette and style flow together to create a cohesive, warm focal wall — whether stacked in a grid or arranged as a salon-style cluster.

♥ YOU WILL RECEIVE:
${printCount} coordinated high-resolution prints at 300 DPI in multiple size ratios, ready for professional-quality printing.
✦ 2:3 Ratio for Printing - 4"x6", 8"x12", 12"x18", 16"x24", 20"x30"
✦ 3:4 Ratio for Printing - 6"x8", 9"x12", 12"x16", 18"x24"
✦ 4:5 Ratio for Printing - 8"x10", 12"x15", 16"x20", 20"x25"
✦ 5:7 / ISO Size for Printing - 5"x7", A5, A4, A3, A2, A1
✦ 16:9 Samsung Frame TV ratio included

♥ INSTANT DOWNLOAD:
Once payment is confirmed, Etsy will send your files. Access them from the Purchases section of your account. The Etsy mobile app can't download files — sign in via mobile browser (Safari, Chrome) to get them on your phone.

♥ HOW TO PRINT & ARRANGE:
Print at home, at a local print shop, or through an online print service. For a gallery wall, keep a consistent gap (2–3 inches) between prints and use matching frame colors for a polished look.

♥ PLEASE NOTE:
• Colors may vary slightly based on monitor and printer.
• Depending on the chosen ratio, a small edge crop may occur.
• This is a digital file — no physical item will be shipped.
• Personal use only; please do not resell the file or prints.

Thanks for visiting!`;
    result.listing.tags = ["gallery wall art set", `print set of ${printCount}`, niche.substring(0, 20), "living room decor", "bedroom wall art", "home decor prints", "art print set", "digital download set", "printable gallery", "housewarming gift", "new home gift", "curated art prints", getSeasonalTag().substring(0, 20)].slice(0, 13);
    emit(onProgress, 4, "done", "Using fallback listing", "Gemini unavailable");
  }

  // Step 5: Bundle pricing ($12-$25 range per report)
  emit(onProgress, 5, "running", "Calculating bundle price");
  const bundleMultiplier = printCount >= 6 ? 3.5 : printCount >= 4 ? 2.8 : 2.2;
  let bundlePrice = avgPrice > 5 ? avgPrice * 0.9 : 5.99 * bundleMultiplier;
  if (competitionLevel === "low") bundlePrice *= 1.2;
  if (demandScore > 70) bundlePrice *= 1.1;
  result.listing.price = Math.max(8.99, Math.min(24.99, Math.round(bundlePrice * 100) / 100));
  emit(onProgress, 5, "done", "Bundle price set", `$${result.listing.price} (${printCount}-print set)`);

  // Step 6: Info images
  emit(onProgress, 6, "running", "Creating bundle info images");
  try {
    const infoDir = path.join(baseDir, "info");
    await mkdir(infoDir, { recursive: true });
    const whatsIncludedSvg = buildWhatsIncludedSvg();
    const whatsIncludedPng = await sharp(whatsIncludedSvg).resize(2400, 1800).png({ quality: 95 }).toBuffer();
    const infoPath = path.join(infoDir, "whats-included.png");
    await writeFile(infoPath, whatsIncludedPng);
    result.infoImages.push({ name: "What's Included", path: infoPath });
    emit(onProgress, 6, "done", "Info images created", "1 info graphic");
  } catch { emit(onProgress, 6, "done", "Info images skipped", "Non-critical"); }

  emit(onProgress, 7, "done", "Gallery bundle ready", `${printCount} prints, ${result.mockups.length} mockups, $${result.listing.price}`);
  return result;
}

// ── Main Pipeline ──

export async function runAutoPackage(
  imageBuffer: Buffer,
  niche: string,
  artDescription: string,
  onProgress: ProgressCallback
): Promise<PackageResult> {
  const productId = `wa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const baseDir = path.join(process.cwd(), "data", "wall-art", productId);
  const cropsDir = path.join(baseDir, "crops");
  const mockupsDir = path.join(baseDir, "mockups");

  await mkdir(cropsDir, { recursive: true });
  await mkdir(mockupsDir, { recursive: true });

  const result: PackageResult = {
    productId,
    crops: [],
    mockups: [],
    infoImages: [],
    listing: { title: "", description: "", tags: [], price: 4.99 },
  };

  // ── Step 1: Upscale to 300 DPI base ──
  emit(onProgress, 1, "running", "Upscaling to 300 DPI");

  let baseImage: Buffer;
  try {
    // upscaleForPrint routes through fal.ai Clarity Upscaler if FAL_KEY is set
    // (AI-based, ~$0.035/img, much sharper for print), else sharp lanczos3.
    const up = await upscaleForPrint(imageBuffer, { targetDim: 7200 });
    baseImage = up.buffer;

    const basePath = path.join(baseDir, "base.png");
    await writeFile(basePath, baseImage);
    emit(onProgress, 1, "done", `Upscaled to 300 DPI (${up.method})`, `${up.width}×${up.height} · ${(baseImage.length / 1024 / 1024).toFixed(1)} MB`);
  } catch (err) {
    emit(onProgress, 1, "error", "Upscale failed", String(err));
    throw err;
  }

  // ── Step 2: Generate crops for 7 print sizes ──
  emit(onProgress, 2, "running", "Generating print-size crops");

  try {
    const baseMeta = await sharp(baseImage).metadata();
    const srcW = baseMeta.width || 4800;
    const srcH = baseMeta.height || 7200;

    for (const crop of CROP_RATIOS) {
      const dims = CROP_DIMENSIONS[crop.label];
      const targetRatio = crop.ratio[0] / crop.ratio[1];
      const srcRatio = srcW / srcH;

      // Center crop to target aspect ratio
      let extractW = srcW, extractH = srcH, extractX = 0, extractY = 0;
      if (srcRatio > targetRatio) {
        extractW = Math.round(srcH * targetRatio);
        extractX = Math.round((srcW - extractW) / 2);
      } else {
        extractH = Math.round(srcW / targetRatio);
        extractY = Math.round((srcH - extractH) / 2);
      }

      const cropped = await sharp(baseImage)
        .extract({ left: extractX, top: extractY, width: extractW, height: extractH })
        .resize(dims.width, dims.height, { kernel: sharp.kernel.lanczos3 })
        .png({ quality: 100 })
        .withMetadata({ density: 300 })
        .toBuffer();

      const cropPath = path.join(cropsDir, `${crop.label.replace(":", "x")}.png`);
      await writeFile(cropPath, cropped);

      result.crops.push({
        ratio: crop.label,
        path: cropPath,
        width: dims.width,
        height: dims.height,
      });
    }

    emit(onProgress, 2, "done", "Crops generated", `${result.crops.length} print sizes`);
  } catch (err) {
    emit(onProgress, 2, "error", "Crop generation failed", String(err));
    throw err;
  }

  // ── Step 3: Generate mockup images ──
  emit(onProgress, 3, "running", "Creating room mockups");

  try {
    // Use the 2:3 crop as the art source for mockups
    const artCropPath = result.crops[0]?.path;
    const artBuffer = artCropPath
      ? await sharp(artCropPath).resize(800, 1200, { fit: "inside" }).png().toBuffer()
      : await sharp(baseImage).resize(800, 1200, { fit: "inside" }).png().toBuffer();

    const artMeta = await sharp(artBuffer).metadata();

    // Also prepare a landscape crop for Samsung TV mockup (16:9)
    const artLandscapeBuffer = result.crops.find(c => c.ratio === "16:9")?.path
      ? await sharp(result.crops.find(c => c.ratio === "16:9")!.path).resize(864, 504, { fit: "cover" }).png().toBuffer()
      : await sharp(baseImage).resize(864, 504, { fit: "cover" }).png().toBuffer();

    for (const template of MOCKUP_TEMPLATES) {
      let mockupImage: Buffer;

      if (template.id === "samsung-tv") {
        // Samsung Frame TV: use 16:9 landscape crop
        const tv = buildSamsungTVSvg();
        const resizedArt = await sharp(artLandscapeBuffer)
          .resize(tv.artW, tv.artH, { fit: "cover" })
          .toBuffer();

        mockupImage = await sharp(tv.svg)
          .resize(tv.width, tv.height)
          .composite([
            { input: resizedArt, left: tv.artX, top: tv.artY },
          ])
          .png({ quality: 90 })
          .toBuffer();
      } else if (template.id === "gallery-set") {
        // Gallery Wall Set: show art in 3 frames with different crops
        const gs = buildGalleryWallSetSvg();
        const composites: { input: Buffer; left: number; top: number }[] = [];

        for (let i = 0; i < gs.positions.length; i++) {
          const pos = gs.positions[i];
          const matPad = i === 1 ? 20 : 15;
          const innerX = pos.x + matPad;
          const innerY = pos.y + matPad;
          const innerW = pos.w - matPad * 2;
          const innerH = pos.h - matPad * 2;

          const cropArt = await sharp(artBuffer)
            .resize(innerW, innerH, { fit: "cover" })
            .toBuffer();

          composites.push({ input: cropArt, left: innerX, top: innerY });
        }

        mockupImage = await sharp(gs.svg)
          .resize(gs.width, gs.height)
          .composite(composites)
          .png({ quality: 90 })
          .toBuffer();
      } else if (template.id === "wood") {
        // Ornate gold frame: composite art UNDER the frame overlay
        const frameOverlay = buildFrameOverlaySvg(artMeta.width || 800, artMeta.height || 1200);
        const frameBase = await sharp(frameOverlay).resize(1200, 900).png().toBuffer();

        // Place art inside the frame area (centered)
        const artX = 385, artY = 115, artW = 430, artH = 670;
        const resizedArt = await sharp(artBuffer)
          .resize(artW, artH, { fit: "cover" })
          .toBuffer();

        // Dark background + art + frame overlay
        const bgSvg = Buffer.from(`<svg width="1200" height="900"><rect width="1200" height="900" fill="#2a1f16"/></svg>`);
        mockupImage = await sharp(bgSvg)
          .resize(1200, 900)
          .composite([
            { input: resizedArt, left: artX, top: artY },
            { input: frameBase, left: 0, top: 0 },
          ])
          .png({ quality: 90 })
          .toBuffer();
      } else {
        // Check for real PNG template overlay in public/mockup-templates/
        const overlayPath = path.join(process.cwd(), "public", "mockup-templates", `${template.id}-frame.png`);
        let hasOverlay = false;
        try { await access(overlayPath); hasOverlay = true; } catch { /* no overlay */ }

        if (hasOverlay) {
          // Use real PNG overlay
          const overlay = readFileSync(overlayPath);
          const overlayMeta = await sharp(overlay).metadata();
          const ow = overlayMeta.width || 1200;
          const oh = overlayMeta.height || 900;

          // Art placement centered with padding
          const artPad = Math.round(ow * 0.08);
          const resizedArt = await sharp(artBuffer)
            .resize(ow - artPad * 2, oh - artPad * 2, { fit: "inside" })
            .toBuffer();
          const rMeta = await sharp(resizedArt).metadata();
          const artX = Math.round((ow - (rMeta.width || 0)) / 2);
          const artY = Math.round((oh - (rMeta.height || 0)) / 2);

          const bgSvg = Buffer.from(`<svg width="${ow}" height="${oh}"><rect width="${ow}" height="${oh}" fill="#1a1a1e"/></svg>`);
          mockupImage = await sharp(bgSvg)
            .resize(ow, oh)
            .composite([
              { input: resizedArt, left: artX, top: artY },
              { input: overlay, left: 0, top: 0 },
            ])
            .png({ quality: 90 })
            .toBuffer();
        } else {
          // SVG-generated mockup
          const mockup = buildMockupSvg(artMeta.width || 800, artMeta.height || 1200, template.id);
          const resizedArt = await sharp(artBuffer)
            .resize(mockup.artW, mockup.artH, { fit: "cover" })
            .toBuffer();

          mockupImage = await sharp(mockup.svg)
            .resize(mockup.width, mockup.height)
            .composite([
              { input: resizedArt, left: mockup.artX, top: mockup.artY },
            ])
            .png({ quality: 90 })
            .toBuffer();
        }
      }

      const mockupPath = path.join(mockupsDir, `${template.id}-frame.png`);
      await writeFile(mockupPath, mockupImage);
      result.mockups.push({ template: template.id, path: mockupPath });
    }

    // ── Library Frames: AI-matched custom mockups ──
    try {
      const lib = await loadLibrary();
      if (lib.frames.length > 0) {
        const matches = await matchFramesToArt(artDescription, niche, artBuffer, 3);
        for (const match of matches) {
          const frame = lib.frames.find(f => f.id === match.frameId);
          if (!frame) continue;
          try {
            const libraryMockup = await compositeArtInFrame(artBuffer, frame);
            const libMockupPath = path.join(mockupsDir, `library-${frame.id}.png`);
            await writeFile(libMockupPath, libraryMockup);
            result.mockups.push({ template: `library-${frame.name}`, path: libMockupPath });
          } catch (e) {
            console.warn(`Library frame composite failed (${frame.name}):`, e);
          }
        }
      }
    } catch (e) {
      // Non-fatal — library frames are a bonus
      console.warn("[AutoPackage] Library frame matching skipped:", e);
    }

    emit(onProgress, 3, "done", "Mockups created", `${result.mockups.length} room scenes`);
  } catch (err) {
    emit(onProgress, 3, "error", "Mockup generation failed", String(err));
    throw err;
  }

  // ── Step 4: Competitor scan ──
  emit(onProgress, 4, "running", "Scanning Etsy competitors");

  let avgPrice = 4.99;
  let competitionLevel = "medium";
  let demandScore = 50;
  let topTags: string[] = [];

  try {
    const query = `${niche} wall art digital download printable`;
    const { total, listings } = await searchEtsyListings(query, "score", 24);

    const analysis = analyzeNiche(
      listings.map((l) => ({
        price: l.price,
        favorites: l.favorites,
        views: l.views,
        listing_age_days: l.listing_age_days,
      })),
      total
    );

    avgPrice = analysis.avg_price || 4.99;
    competitionLevel = analysis.competition_level;
    demandScore = analysis.demand_score;

    // Extract top tags from competitors
    const tagCounts: Record<string, number> = {};
    for (const l of listings) {
      try {
        const tags: string[] = JSON.parse(l.tags);
        for (const t of tags) {
          const tag = t.toLowerCase().trim();
          if (tag) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      } catch { /* skip */ }
    }
    topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([tag]) => tag);

    emit(onProgress, 4, "done", "Competitor data collected", `Avg price: $${avgPrice}, Competition: ${competitionLevel}`);
  } catch (err) {
    // Non-fatal — use defaults
    console.warn("[AutoPackage] Competitor scan failed, using defaults:", err);
    emit(onProgress, 4, "done", "Using default market data", "Etsy scan unavailable");
  }

  // ── Step 5: SEO listing generation via Gemini ──
  emit(onProgress, 5, "running", "Generating SEO listing copy");

  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!openaiKey && !geminiKey) throw new Error("No LLM key configured (OPENAI_API_KEY or GEMINI_API_KEY)");

    // Match niche to intelligence data for better targeting
    const nicheMatch = NICHE_INTELLIGENCE.find(n => niche.toLowerCase().includes(n.niche.split("/")[0].trim().toLowerCase().split(" ")[0]));
    const seasonalTag = getSeasonalTag();

    const seoPrompt = `You are an Etsy SEO specialist writing listings that match Etsy's 2026 semantic-search algorithm.
Your title output should look like what Etsy's own "Review new listing titles" recommendation engine would suggest — natural, readable, front-loaded with the exact phrase buyers search.

ART DESCRIPTION: ${artDescription}
NICHE: ${niche}
${nicheMatch ? `NICHE INTELLIGENCE: Opportunity=${nicheMatch.opportunity}, Competition=${nicheMatch.competition}, Price Range=${nicheMatch.priceRange}. Note: ${nicheMatch.whyNow}` : ""}

COMPETITOR DATA:
- Average price in this niche: $${avgPrice}
- Competition level: ${competitionLevel}
- Top competitor tags: ${topTags.slice(0, 15).join(", ")}
- Demand score: ${demandScore}/100

═══ TITLE RULES — Etsy 2026 algorithm ═══
Etsy now penalizes keyword-stuffed, pipe-heavy, ALL-CAPS titles. Write ONE natural title.

1. **Length**: 70–120 characters is the sweet spot. Hard max 140.
2. **First 40 chars** carry the most search weight — front-load the exact phrase buyers type (e.g. "Abstract Ocean Wall Art Print").
3. **Natural language** — write like a product display, not a keyword list.
4. **Punctuation**: at most ONE separator per title. Use a colon (:) OR a single pipe (|) OR parentheses — never stack multiple.
5. **Title Case**: capitalize main words. NO ALL-CAPS. NO emojis. NO ★ ❤ symbols.
6. **Include** (in order): subject/style → "Wall Art Print" → 1-2 key attributes → format in parens (e.g. "(Printable)", "(Digital Download)").
7. **Don't repeat** the same word twice. "Digital Download Printable Print Art" is 4 ways to say the same thing — pick one.
8. **Avoid banner words** like "INSTANT DOWNLOAD", "BESTSELLER", "2026 HIT" — Etsy's recommendation engine strips them.
9. Include a room word (Living Room, Bedroom, Kitchen, Office, Nursery, Bathroom) if it fits naturally — not forced.

GOOD TITLES (Etsy-recommended format):
"Abstract Ocean Watercolor Wall Art Print: Coastal Bedroom Decor (Printable Digital Download)"
"Vintage Botanical Gallery Wall Set of 6 | Cottagecore Living Room Decor (Printable)"
"Dark Academia Skull Roses Wall Art Print for Moody Gothic Bedroom (Digital Download)"

BAD TITLES (old pipe-stuffed style — do NOT produce these):
"Vintage Botanical Print Set of 6 | INSTANT DOWNLOAD | Living Room Gallery Wall Art | Digital Download Printable | Cottagecore Home Decor 2026"
"Abstract Ocean Art | BESTSELLER | Wall Art | Print | Digital Download | Printable | Beach House"

═══ DESCRIPTION — match top Etsy bestseller format (ArchiveArtCo style) ═══
Write using ♥ section headers and ✦ bullet markers. This is the HARD requirement — it is the layout top Etsy wall-art shops use and what buyers expect.

STRUCTURE (do not deviate):

[One warm 3–4 sentence hook paragraph painting the mood/vibe. Describe the style, colors, and feeling. Mention how it enhances a home/room — gallery wall or focal point.]

♥ YOU WILL RECEIVE:
Your order includes high-resolution files in different size options, all ready for professional-quality printing at 300 DPI.
✦ 2:3 Ratio for Printing - 4"x6", 8"x12", 12"x18", 16"x24", 20"x30"
✦ 3:4 Ratio for Printing - 6"x8", 9"x12", 12"x16", 18"x24"
✦ 4:5 Ratio for Printing - 8"x10", 12"x15", 16"x20", 20"x25"
✦ 5:7 / ISO Size for Printing - 5"x7", A5, A4, A3, A2, A1
✦ 16:9 Samsung Frame TV ratio included

We're happy to help with free resizing for any sizes not listed.

♥ INSTANT DOWNLOAD:
Once payment is confirmed, Etsy will send your files. Access them from the Purchases section of your account. Etsy mobile app can't download files — sign in via mobile browser (Safari/Chrome) to grab on phone.

♥ HOW TO PRINT:
Print at home, at a local print shop, or through an online print service. For best results use matte or semi-gloss photo paper.

♥ PLEASE NOTE:
• Colors may vary slightly based on monitor calibration and printer settings.
• Depending on the chosen ratio there may be a small crop at the edges.
• This is a digital file — no physical item will be shipped.
• Personal use only; please do not resell the file or prints.

Thanks for visiting!

IMPORTANT: Do NOT use emojis like 📄 ✨ 🖼️ — only ♥ and ✦ markers. Never use "INSTANT DOWNLOAD" as a banner word.

═══ 13-TAG STRATEGY ═══
Tags 1-3: Primary keywords — highest search volume terms for this niche (e.g., "wall art prints", "digital download art")
Tags 4-6: Room-specific long-tail phrases (e.g., "bedroom wall decor", "living room prints", "office art print")
Tags 7-9: Style and aesthetic descriptors (e.g., "watercolor seascape", "abstract ocean art", "coastal grandmother")
Tags 10-11: Occasion/gift keywords (e.g., "housewarming gift", "new home gift art")
Tag 12: Format keyword (e.g., "printable wall art")
Tag 13: Trending seasonal term: "${seasonalTag}"

CRITICAL TAG RULES:
- Each tag max 20 characters, all lowercase
- NEVER repeat words already in your title (Etsy indexes titles separately — tags should ADD keywords)
- Use multi-word phrases, NEVER single words like "art" or "print" alone
- All 13 tags must be UNIQUE phrases

Return JSON: { "title": "...", "description": "...", "tags": ["tag1", "tag2", ...(exactly 13)] }`;

    // Try gpt-5-mini first (better Etsy copy), fall back to Gemini
    const raw = await callBestJSON({
      openaiKey,
      geminiKey,
      prompt: seoPrompt,
      systemHint: "You are an expert Etsy SEO copywriter. Return ONLY valid JSON with keys: title (string, max 140 chars), description (string), tags (array of exactly 13 strings, each max 20 chars).",
    });
    const parsed = parseGeminiJSON<{ title: string; description: string; tags: string[] }>(raw);

    result.listing.title = (parsed.title || "").substring(0, 140);
    result.listing.description = parsed.description || "";

    // Enforce tag deduplication: remove tags that are just title words repeated
    // Report rule: "Etsy already indexes your title. Repeating title words in tags wastes slots."
    const titleWords = new Set(
      result.listing.title.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 3)
    );
    const rawTags = (parsed.tags || []).slice(0, 13).map((t: string) => t.substring(0, 20));
    const dedupedTags = rawTags.filter((tag: string) => {
      const tagWords = tag.toLowerCase().split(/\s+/);
      // Keep tag if it has at least one word NOT in the title
      return tagWords.some(w => w.length > 3 && !titleWords.has(w));
    });
    // If we filtered too many, keep the originals to stay at 13
    result.listing.tags = dedupedTags.length >= 10 ? dedupedTags.slice(0, 13) : rawTags.slice(0, 13);

    emit(onProgress, 5, "done", "Listing copy generated", `${result.listing.tags.length} SEO tags`);
  } catch (err) {
    // Fallback listing — still uses optimized title formula
    console.warn("[AutoPackage] Gemini SEO failed, using fallback:", err);
    const nicheClean = niche.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    result.listing.title = `${nicheClean} Wall Art Print: Modern Home Decor (Printable Digital Download)`.substring(0, 140);
    result.listing.description = `Transform your space with this stunning ${niche} wall art print. Rich colors and professional quality bring warmth and style to any room — perfect as a focal point or as part of a curated gallery wall.

♥ YOU WILL RECEIVE:
Your order includes high-resolution files in multiple size ratios, all at 300 DPI and ready for professional-quality printing.
✦ 2:3 Ratio for Printing - 4"x6", 8"x12", 12"x18", 16"x24", 20"x30"
✦ 3:4 Ratio for Printing - 6"x8", 9"x12", 12"x16", 18"x24"
✦ 4:5 Ratio for Printing - 8"x10", 12"x15", 16"x20", 20"x25"
✦ 5:7 / ISO Size for Printing - 5"x7", A5, A4, A3, A2, A1
✦ 16:9 Samsung Frame TV ratio included

We're happy to help with free resizing for any sizes not listed.

♥ INSTANT DOWNLOAD:
Once payment is confirmed, Etsy will send your files. Access them from the Purchases section of your account. The Etsy mobile app can't download files — sign in via mobile browser (Safari, Chrome) to get them on your phone.

♥ HOW TO PRINT:
Print at home on quality photo paper, at a local print shop, or through an online print service. Matte or semi-gloss paper gives the best results.

♥ PLEASE NOTE:
• Colors may vary slightly based on monitor calibration and printer settings.
• Depending on the ratio there may be a small crop at the edges.
• This is a digital file — no physical item will be shipped.
• Personal use only; please do not resell the file or any prints made from it.

Thanks for visiting!`;
    result.listing.tags = [
      "wall art prints", "digital download art", "printable wall art",
      "bedroom wall decor", "living room prints", "office art print",
      niche.toLowerCase().substring(0, 20), "home decor gift", "modern art print",
      "housewarming gift", "new home gift art",
      "printable art poster", getSeasonalTag().substring(0, 20),
    ].slice(0, 13);
    emit(onProgress, 5, "done", "Using fallback listing copy", "Gemini unavailable");
  }

  // ── Step 6: Smart pricing ──
  emit(onProgress, 6, "running", "Calculating optimal price");

  result.listing.price = calculateSmartPrice(avgPrice, competitionLevel, demandScore);
  emit(onProgress, 6, "done", "Price set", `$${result.listing.price} (market avg: $${avgPrice})`);

  // ── Step 7: Generate info images ──
  emit(onProgress, 7, "running", "Creating listing info images");

  try {
    const infoDir = path.join(baseDir, "info");
    await mkdir(infoDir, { recursive: true });

    // What's Included image
    const whatsIncludedSvg = buildWhatsIncludedSvg();
    const whatsIncludedPng = await sharp(whatsIncludedSvg)
      .resize(2400, 1800)
      .png({ quality: 95 })
      .toBuffer();

    const whatsIncludedPath = path.join(infoDir, "whats-included.png");
    await writeFile(whatsIncludedPath, whatsIncludedPng);
    result.infoImages.push({ name: "What's Included", path: whatsIncludedPath });

    emit(onProgress, 7, "done", "Info images created", `${result.infoImages.length} info graphics`);
  } catch (err) {
    console.warn("[AutoPackage] Info image generation failed (non-fatal):", err);
    emit(onProgress, 7, "done", "Info images skipped", "Non-critical");
  }

  // ── Step 8: Package complete ──
  emit(onProgress, 8, "done", "Package ready for review", `${result.crops.length} sizes, ${result.mockups.length} mockups, ${result.infoImages.length} info images`);

  return result;
}
