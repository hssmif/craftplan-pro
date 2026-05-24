// ══════════════════════════════════════════════════════════════
// Factory Image Renderer — Server-Side SVG→PNG Pipeline
//
// Takes a ProductBlueprint + ListingImagePlan and renders 7
// Etsy-ready listing images as PNGs via sharp.
//
// No browser required. No Canvas API. No MCP tools.
// Pure SVG → sharp → PNG. Fast, deterministic, testable.
//
// Output: 2000×2000px PNGs (Etsy square format, optimal for
// both desktop and mobile listing views).
//
// Image strategy (proven Etsy conversion pattern):
//   1. Hero/Thumbnail — laptop mockup, biggest title
//   2. Problem Hook   — emotional text, no product
//   3. Dashboard       — KPI cards + data preview
//   4. Feature         — charts/progress/tracking
//   5. Method/System   — 3-step "how it works"
//   6. What's Included — tab grid
//   7. Delivery        — download flow
// ══════════════════════════════════════════════════════════════

import sharp from "sharp";
import type {
  ProductBlueprint,
  ListingImagePlan,
  ListingImageSpec,
  ListingImageKind,
} from "@/types/factory";
import { resolveNicheProfile, type NicheDesignProfile } from "./factory-niche-themes";
import { getLayoutFamilyId } from "./factory-layout-families";
import { resolveLayoutFamily, type LayoutFamily } from "./factory-layout-families";
import {
  buildNurtureDashboard,
  buildExecutiveDashboard,
  buildEditorialDashboard,
  buildNurtureFeature,
  buildExecutiveFeature,
  buildEditorialFeature,
} from "./factory-family-builders";
import {
  buildSpreadsheetHero,
  buildSpreadsheetDashboard,
  buildSpreadsheetFeature,
} from "./factory-spreadsheet-renderer";
import {
  screenshotDashboard,
  screenshotTransactions,
  screenshotSpecificTab,
  screenshotDashboardCrop,
  composeLaptopMockup,
  composeTabletMockup,
  composePhoneMockup,
  composeMultiDeviceMockup,
  composeFullBleed,
  closeBrowser,
} from "./factory-preview-engine";
import {
  extractKpiData,
  extractSavingsGoals,
  extractTableRows,
  extractBudgetCategories,
  extractBudgetFromDashboard,
  deriveBudgetFromTransactions,
  deriveKpiFromTransactions,
  cleanDisplayText,
  formatCurrency,
} from "./factory-display-helpers";
import {
  generateHeroMockup,
  generateLaptopMockup,
  generateTabletMockup,
  generateDashboardZoomMockup,
} from "./gemini-mockup-generator";

// ── Constants ────────────────────────────────────────────────

const IMG_W = 2000;
const IMG_H = 2000;

// ── Thumbnail Style System ──────────────────────────────────
// 3 distinct thumbnail styles for high CTR variation

type ThumbnailStyle = "bold-headline" | "extreme-zoom" | "clean-premium-mockup";

const THUMBNAIL_STYLE_MAP: Record<string, ThumbnailStyle> = {
  // Nurture niches → bold emotional headlines
  "baby-budget": "bold-headline",
  "paycheck-budget": "bold-headline",
  "savings-tracker": "bold-headline",
  "adhd-planner": "bold-headline",
  "pregnancy-planner": "bold-headline",
  // Executive niches → extreme zoom on KPIs
  "business-pl": "extreme-zoom",
  "side-hustle": "extreme-zoom",
  "debt-payoff": "extreme-zoom",
  "student-budget": "extreme-zoom",
  // Editorial niches → clean premium mockup
  "wedding-planner": "clean-premium-mockup",
  "travel-planner": "clean-premium-mockup",
  "meal-planner": "clean-premium-mockup",
};

function getThumbnailStyle(nicheId: string): ThumbnailStyle {
  return THUMBNAIL_STYLE_MAP[nicheId] || "clean-premium-mockup";
}

/**
 * Build a bold-headline SVG overlay for thumbnails.
 * Large emotional text dominates, small device mockup in corner.
 */
function buildBoldHeadlineSvg(
  title: string,
  subtitle: string,
  profile: NicheDesignProfile,
  _family: LayoutFamily,
): string {
  const primary = profile.palette.primary;
  const accent = profile.palette.accent || primary;
  // Split title into lines (max 3)
  const lines = title.split("\n").slice(0, 3);
  const line1 = lines[0] || "TAKE CONTROL";
  const line2 = lines[1] || "Of Your Money";
  const line3 = lines[2] || "Google Sheets Template";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMG_W}" height="${IMG_H}" viewBox="0 0 ${IMG_W} ${IMG_H}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#${primary}" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="#${primary}" stop-opacity="0.05"/>
      </linearGradient>
    </defs>
    <rect width="${IMG_W}" height="${IMG_H}" fill="url(#bg)"/>
    <rect width="${IMG_W}" height="${IMG_H}" fill="#FAFAFA" opacity="0.85"/>

    <!-- Accent bar top -->
    <rect x="0" y="0" width="${IMG_W}" height="8" fill="#${primary}"/>

    <!-- Large emotional headline -->
    <text x="${IMG_W / 2}" y="500" text-anchor="middle" font-family="Inter, 'Segoe UI', system-ui, Arial, sans-serif"
          font-size="120" font-weight="900" fill="#${primary}" letter-spacing="-2">
      ${esc(line1)}
    </text>
    <text x="${IMG_W / 2}" y="650" text-anchor="middle" font-family="Inter, 'Segoe UI', system-ui, Arial, sans-serif"
          font-size="80" font-weight="700" fill="#1F2937">
      ${esc(line2)}
    </text>

    <!-- Divider line -->
    <rect x="${IMG_W / 2 - 80}" y="710" width="160" height="4" rx="2" fill="#${accent}"/>

    <!-- Product descriptor -->
    <text x="${IMG_W / 2}" y="790" text-anchor="middle" font-family="Inter, 'Segoe UI', system-ui, Arial, sans-serif"
          font-size="36" font-weight="400" fill="#6B7280" letter-spacing="3">
      ${esc(line3.toUpperCase())}
    </text>

    <!-- Feature pills row -->
    <rect x="300" y="900" width="280" height="50" rx="25" fill="#${primary}" opacity="0.1"/>
    <text x="440" y="933" text-anchor="middle" font-family="Inter, 'Segoe UI', system-ui, Arial, sans-serif" font-size="22" font-weight="600" fill="#${primary}">Auto-Calculating</text>
    <rect x="620" y="900" width="280" height="50" rx="25" fill="#${primary}" opacity="0.1"/>
    <text x="760" y="933" text-anchor="middle" font-family="Inter, 'Segoe UI', system-ui, Arial, sans-serif" font-size="22" font-weight="600" fill="#${primary}">Visual Charts</text>
    <rect x="940" y="900" width="280" height="50" rx="25" fill="#${primary}" opacity="0.1"/>
    <text x="1080" y="933" text-anchor="middle" font-family="Inter, 'Segoe UI', system-ui, Arial, sans-serif" font-size="22" font-weight="600" fill="#${primary}">Instant Download</text>

    <!-- Trust strip at bottom -->
    <rect x="0" y="${IMG_H - 100}" width="${IMG_W}" height="100" fill="#${primary}" opacity="0.06"/>
    <text x="${IMG_W / 2}" y="${IMG_H - 45}" text-anchor="middle" font-family="Inter, 'Segoe UI', system-ui, Arial, sans-serif"
          font-size="24" font-weight="500" fill="#6B7280" letter-spacing="2">
      GOOGLE SHEETS  ·  INSTANT DOWNLOAD  ·  LIFETIME ACCESS
    </text>
  </svg>`;
}

/**
 * Build an extreme-zoom SVG overlay for thumbnails.
 * Dashboard screenshot fills entire canvas, dark title bar on top.
 */
function buildExtremeZoomOverlaySvg(
  title: string,
  profile: NicheDesignProfile,
): string {
  const primary = profile.palette.primary;
  const lines = title.split("\n");
  const line1 = lines[0] || "Your Financial Dashboard";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMG_W}" height="${IMG_H}" viewBox="0 0 ${IMG_W} ${IMG_H}">
    <!-- Clean bright frosted overlay bar at top -->
    <rect x="0" y="0" width="${IMG_W}" height="300" fill="#FFFFFF" opacity="0.92"/>
    <rect x="0" y="296" width="${IMG_W}" height="4" fill="#${primary}"/>

    <!-- Title text on bright bar -->
    <text x="${IMG_W / 2}" y="130" text-anchor="middle" font-family="Inter, 'Segoe UI', system-ui, Arial, sans-serif"
          font-size="76" font-weight="800" fill="#0F172A" letter-spacing="-1">
      ${esc(line1)}
    </text>
    <text x="${IMG_W / 2}" y="210" text-anchor="middle" font-family="Inter, 'Segoe UI', system-ui, Arial, sans-serif"
          font-size="28" font-weight="500" fill="#64748B" letter-spacing="4">
      GOOGLE SHEETS TEMPLATE
    </text>

    <!-- Accent pill at bottom -->
    <rect x="${IMG_W / 2 - 200}" y="${IMG_H - 120}" width="400" height="60" rx="30" fill="#${primary}"/>
    <text x="${IMG_W / 2}" y="${IMG_H - 82}" text-anchor="middle" font-family="Inter, 'Segoe UI', system-ui, Arial, sans-serif"
          font-size="26" font-weight="700" fill="#FFFFFF">
      Instant Download
    </text>
  </svg>`;
}

// ── Color Utilities ──────────────────────────────────────────

function hexToRgba(hex: string, alpha = 1): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function lighten(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  let r = parseInt(h.substring(0, 2), 16);
  let g = parseInt(h.substring(2, 4), 16);
  let b = parseInt(h.substring(4, 6), 16);
  r = Math.min(255, Math.round(r + (255 - r) * amount));
  g = Math.min(255, Math.round(g + (255 - g) * amount));
  b = Math.min(255, Math.round(b + (255 - b) * amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function darken(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  let r = parseInt(h.substring(0, 2), 16);
  let g = parseInt(h.substring(2, 4), 16);
  let b = parseInt(h.substring(4, 6), 16);
  r = Math.max(0, Math.round(r * (1 - amount)));
  g = Math.max(0, Math.round(g * (1 - amount)));
  b = Math.max(0, Math.round(b * (1 - amount)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ── SVG Helpers ──────────────────────────────────────────────

function esc(text: unknown): string {
  const s = typeof text === "string" ? text : text == null ? "" : String(text);
  return stripEmoji(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Strip emojis from text — sharp's SVG renderer can't handle them */
function stripEmoji(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/[\u{200D}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Wrap text to fit within maxWidth (approximate) */
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars) {
      lines.push(current.trim());
      current = word;
    } else {
      current += " " + word;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

function roundedRect(x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="2"` : ""} />`;
}

// ── Layout Family routing (canonical source: factory-layout-families) ──

function renderDecorativeElements(
  decorType: NicheDesignProfile["imageStyle"]["decorativeElements"] | "diamonds",
  color: string,
  opacity = 0.06
): string {
  const c = hexToRgba(color, opacity);
  const c2 = hexToRgba(color, opacity * 0.7);
  switch (decorType) {
    case "circles":
      return `
    <circle cx="1700" cy="300" r="200" fill="${c}" />
    <circle cx="300" cy="1700" r="150" fill="${c2}" />
    <circle cx="1800" cy="1500" r="120" fill="${c2}" />`;
    case "hearts":
      return `
    <g transform="translate(1700,250) scale(3)" opacity="${opacity}">
      <path d="M0-8C-4-14-14-14-14-6C-14 0-4 8 0 14C4 8 14 0 14-6C14-14 4-14 0-8Z" fill="${color}" />
    </g>
    <g transform="translate(300,1650) scale(2.2)" opacity="${opacity}">
      <path d="M0-8C-4-14-14-14-14-6C-14 0-4 8 0 14C4 8 14 0 14-6C14-14 4-14 0-8Z" fill="${color}" />
    </g>
    <g transform="translate(1800,1400) scale(1.5)" opacity="${opacity * 0.7}">
      <path d="M0-8C-4-14-14-14-14-6C-14 0-4 8 0 14C4 8 14 0 14-6C14-14 4-14 0-8Z" fill="${color}" />
    </g>`;
    case "dots":
      return Array.from({ length: 20 }, (_, i) => {
        const x = 100 + (i * 317) % 1800;
        const y = 100 + (i * 503) % 1800;
        const r = 4 + (i % 5) * 3;
        return `<circle cx="${x}" cy="${y}" r="${r}" fill="${hexToRgba(color, opacity * (0.5 + (i % 3) * 0.3))}" />`;
      }).join("\n    ");
    case "stars":
      return [
        { x: 1700, y: 280, s: 2.5 },
        { x: 280, y: 1680, s: 1.8 },
        { x: 1780, y: 1450, s: 1.3 },
      ].map(({ x, y, s }) =>
        `<g transform="translate(${x},${y}) scale(${s})" opacity="${opacity}">
        <polygon points="0,-12 3,-4 12,-4 5,2 7,12 0,6 -7,12 -5,2 -12,-4 -3,-4" fill="${color}" />
      </g>`
      ).join("\n    ");
    case "lines":
      return `
    <line x1="1600" y1="0" x2="2000" y2="400" stroke="${hexToRgba(color, opacity)}" stroke-width="3" />
    <line x1="1700" y1="0" x2="2000" y2="300" stroke="${hexToRgba(color, opacity * 0.6)}" stroke-width="2" />
    <line x1="0" y1="1600" x2="400" y2="2000" stroke="${hexToRgba(color, opacity)}" stroke-width="3" />
    <line x1="0" y1="1700" x2="300" y2="2000" stroke="${hexToRgba(color, opacity * 0.6)}" stroke-width="2" />`;
    case "diamonds":
      return [
        { x: 1680, y: 280, s: 2.5 },
        { x: 300, y: 1660, s: 1.8 },
        { x: 1760, y: 1440, s: 1.4 },
      ].map(({ x, y, s }) =>
        `<g transform="translate(${x},${y}) rotate(45) scale(${s})" opacity="${opacity}">
        <rect x="-10" y="-10" width="20" height="20" fill="${color}" />
      </g>`
      ).join("\n    ");
    case "none":
    default:
      return "";
  }
}

// ── Background Texture Patterns (premium feel) ──────────────

function renderBackgroundTexture(
  family: string,
  color: string,
  opacity = 0.03
): { defs: string; overlay: string } {
  // Very subtle textures on bright backgrounds — premium feel without clutter
  const c = hexToRgba(color, opacity);
  if (family === "executive") {
    // Subtle dot grid — clean, professional
    return {
      defs: `<pattern id="bgTexture" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
        <circle cx="20" cy="20" r="1" fill="${c}" />
      </pattern>`,
      overlay: `<rect width="${IMG_W}" height="${IMG_H}" fill="url(#bgTexture)" />`,
    };
  } else if (family === "editorial") {
    // Elegant fine diagonal lines — linen feel
    return {
      defs: `<pattern id="bgTexture" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="16" stroke="${c}" stroke-width="0.3" />
      </pattern>`,
      overlay: `<rect width="${IMG_W}" height="${IMG_H}" fill="url(#bgTexture)" />`,
    };
  } else {
    // Nurture / default: very soft scattered dots — warm, approachable
    const dots = [];
    for (let i = 0; i < 40; i++) {
      const x = (i * 251) % IMG_W;
      const y = (i * 397) % IMG_H;
      const r = 2 + (i % 3);
      const dotOpacity = opacity * (0.3 + (i % 3) * 0.25);
      dots.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${hexToRgba(color, dotOpacity)}" />`);
    }
    return {
      defs: "",
      overlay: dots.join("\n    "),
    };
  }
}

// ── Theme Resolution ─────────────────────────────────────────

interface ImageTheme {
  bg: string;
  bgDark: string;
  primary: string;
  primaryLight: string;
  accent: string;
  text: string;
  textMuted: string;
  textOnDark: string;
  cardBg: string;
  cardBorder: string;
  kpiGreen: string;
  kpiRed: string;
  kpiYellow: string;
  kpiBlue: string;
  tableBg: string;
  tableAlt: string;
  tableHeader: string;
}

function resolveTheme(plan: ListingImagePlan, nicheProfile: NicheDesignProfile): ImageTheme {
  const pal = nicheProfile.palette;
  return {
    bg: pal.background,
    bgDark: darken(pal.primary, 0.7),
    primary: pal.primary,
    primaryLight: pal.primaryLight,
    accent: pal.accent,
    text: pal.text,
    textMuted: pal.textMuted,
    textOnDark: "#FFFFFF",
    cardBg: lighten(pal.primary, 0.92),
    cardBorder: lighten(pal.primary, 0.7),
    kpiGreen: nicheProfile.kpiStyle.cards[0]?.bg || "#D5F0D5",
    kpiRed: nicheProfile.kpiStyle.cards[1]?.bg || "#FEE2E2",
    kpiYellow: nicheProfile.kpiStyle.cards[2]?.bg || "#FEF3C7",
    kpiBlue: nicheProfile.kpiStyle.cards[3]?.bg || "#DBEAFE",
    tableBg: lighten(pal.primary, 0.95),
    tableAlt: lighten(pal.primary, 0.9),
    tableHeader: lighten(pal.primary, 0.8),
  };
}

// ══════════════════════════════════════════════════════════════
// SVG TEMPLATES — One per image slot
// ══════════════════════════════════════════════════════════════

// ── IMAGE 1: HERO / THUMBNAIL ───────────────────────────────

function buildHeroSvg(
  spec: ListingImageSpec,
  blueprint: ProductBlueprint,
  theme: ImageTheme,
  nicheProfile: NicheDesignProfile
): string {
  const fam = getLayoutFamilyId(nicheProfile.id);
  const dashTab = blueprint.tabs.find((t) =>
    t.name.toLowerCase().includes("dashboard")
  );
  const txnTab = blueprint.tabs.find((t) =>
    t.name.toLowerCase().includes("transaction")
  );
  const kpiData = extractKpiData(
    dashTab?.sampleRows || [],
    undefined, undefined,
    txnTab?.sampleRows,
  );
  const kpiLabels = kpiData.map(k => k.label);
  const kpiValues = kpiData.map(k => k.value);
  const kpiColors = [theme.kpiGreen, theme.kpiRed, theme.kpiYellow, theme.kpiBlue];

  const budgetTab = blueprint.tabs.find((t) =>
    t.name.toLowerCase().includes("budget") && (t.name.toLowerCase().includes("setup") || t.name.toLowerCase().includes("categor") || t.name.toLowerCase().includes("overview"))
  );
  let categories = extractBudgetCategories(budgetTab?.sampleRows || [], 6);
  // Check if categories have meaningful amounts (not all "$0")
  const hasRealAmounts = (cats: Array<{amount: string}>) =>
    cats.some((c) => c.amount !== "$0" && c.amount !== "$0.00" && c.amount !== "0");
  if ((categories.length === 0 || !hasRealAmounts(categories)) && dashTab?.sampleRows) {
    const dashCats = extractBudgetFromDashboard(dashTab.sampleRows, 6);
    if (dashCats.length > 0 && hasRealAmounts(dashCats)) categories = dashCats;
  }
  if ((categories.length === 0 || !hasRealAmounts(categories)) && txnTab?.sampleRows) {
    // Fallback: derive from transaction bucket totals (always has real amounts)
    const txnCats = deriveBudgetFromTransactions(txnTab.sampleRows, 6);
    if (txnCats.length > 0) {
      // Merge names from dashboard extraction with amounts from transactions
      if (categories.length > 0 && !hasRealAmounts(categories)) {
        // Keep existing category names but replace amounts
        const txnMap = new Map(txnCats.map(c => [c.name, c.amount]));
        categories = categories.map(c => ({
          name: c.name,
          amount: txnMap.get(c.name) || c.amount,
        }));
      } else {
        categories = txnCats;
      }
    }
  }
  if (categories.length === 0) {
    categories = [
      { name: "Category 1", amount: "$500" },
      { name: "Category 2", amount: "$300" },
      { name: "Category 3", amount: "$200" },
      { name: "Category 4", amount: "$150" },
    ];
  }

  const title = spec.title || blueprint.sourceListingTitle || "Budget Tracker";
  const subtitle = spec.subtitle || "Google Sheets Template";
  const titleLines = wrapText(title, fam === "nurture" ? 32 : 28);
  const cardR = nicheProfile.layout.cardRadius;
  const font = nicheProfile.typography.fontFamily;
  const shadowBlur = nicheProfile.kpiStyle.shadow === "soft" ? 24 : nicheProfile.kpiStyle.shadow === "sharp" ? 12 : 18;

  // ── BRIGHT gradient backgrounds (Etsy top-seller style: clean, light, airy) ──
  const gradColors = nicheProfile.imageStyle.heroGradient;
  const bgGradient = fam === "nurture"
    ? `<linearGradient id="bgGrad" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="#F5F3FF" />
      <stop offset="50%" stop-color="#FAFAFE" />
      <stop offset="100%" stop-color="#FFFFFF" />
    </linearGradient>`
    : fam === "executive"
    ? `<linearGradient id="bgGrad" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="#F0F4F8" />
      <stop offset="40%" stop-color="#F7F9FC" />
      <stop offset="100%" stop-color="#FFFFFF" />
    </linearGradient>`
    : fam === "editorial"
    ? `<linearGradient id="bgGrad" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#FDF8F0" />
      <stop offset="60%" stop-color="#FDFAF5" />
      <stop offset="100%" stop-color="#FFFFFF" />
    </linearGradient>`
    : `<linearGradient id="bgGrad" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="${lighten(theme.bgDark, 0.85)}" />
      <stop offset="100%" stop-color="#FFFFFF" />
    </linearGradient>`;

  // ── Title section — LARGE text, dark-on-light, mobile readable ──
  let titleSvg = "";
  let subtitleSvg = "";
  // ALL families now use dark text on light backgrounds (top-seller standard)
  const titleTextColor = fam === "editorial" ? "#3D2B1F" : fam === "executive" ? "#0F172A" : theme.text;

  if (fam === "nurture") {
    // Centered, LARGE friendly font with accent pill subtitle
    const fontSize = 76;
    titleSvg = titleLines.map((line, i) =>
      `<text x="1000" y="${140 + i * 86}" text-anchor="middle" font-family="${font}" font-size="${fontSize}" font-weight="800" fill="${titleTextColor}" letter-spacing="-0.5">${esc(line)}</text>`
    ).join("\n  ");
    subtitleSvg = `
    ${roundedRect(600, 140 + titleLines.length * 86 + 8, 800, 52, 26, hexToRgba(nicheProfile.palette.accent, 0.15))}
    <text x="1000" y="${178 + titleLines.length * 86}" text-anchor="middle" font-family="${font}" font-size="24" font-weight="600" fill="${nicheProfile.palette.accent}" letter-spacing="1">${esc(subtitle.toUpperCase())}</text>`;
  } else if (fam === "executive") {
    // Professional centered on LIGHT background, accent underline
    const fontSize = 80;
    titleSvg = titleLines.map((line, i) =>
      `<text x="1000" y="${140 + i * 92}" text-anchor="middle" font-family="${font}" font-size="${fontSize}" font-weight="800" fill="#0F172A" letter-spacing="-1">${esc(line)}</text>`
    ).join("\n  ");
    subtitleSvg = `
    <rect x="900" y="${148 + titleLines.length * 92}" width="200" height="4" rx="2" fill="${theme.accent}" />
    <text x="1000" y="${184 + titleLines.length * 92}" text-anchor="middle" font-family="${font}" font-size="22" font-weight="500" fill="#64748B" letter-spacing="3">${esc(subtitle.toUpperCase())}</text>`;
  } else if (fam === "editorial") {
    // Elegant centered serif with gold divider — LARGER text
    const fontSize = 72;
    titleSvg = titleLines.map((line, i) =>
      `<text x="1000" y="${140 + i * 82}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" font-weight="700" fill="#3D2B1F" letter-spacing="1">${esc(line)}</text>`
    ).join("\n  ");
    const lineY = 145 + titleLines.length * 82;
    subtitleSvg = `
    <circle cx="750" cy="${lineY + 4}" r="3" fill="#C8A97E" />
    <rect x="760" y="${lineY + 2}" width="180" height="1.5" fill="#C8A97E" />
    <rect x="945" y="${lineY - 2}" width="10" height="10" rx="1" transform="rotate(45,950,${lineY + 3})" fill="#C8A97E" />
    <rect x="960" y="${lineY + 2}" width="180" height="1.5" fill="#C8A97E" />
    <circle cx="1150" cy="${lineY + 4}" r="3" fill="#C8A97E" />
    <text x="1000" y="${lineY + 38}" text-anchor="middle" font-family="Georgia, serif" font-size="24" font-weight="400" fill="#8B7355" letter-spacing="2">${esc(subtitle.toUpperCase())}</text>`;
  } else {
    // Energetic: bold centered with accent pill
    const fontSize = 82;
    titleSvg = titleLines.map((line, i) =>
      `<text x="1000" y="${140 + i * 94}" text-anchor="middle" font-family="${font}" font-size="${fontSize}" font-weight="800" fill="${titleTextColor}" letter-spacing="-0.5">${esc(line)}</text>`
    ).join("\n  ");
    subtitleSvg = `
    ${roundedRect(650, 140 + titleLines.length * 94 + 5, 700, 54, 27, theme.accent)}
    <text x="1000" y="${180 + titleLines.length * 94}" text-anchor="middle" font-family="${font}" font-size="24" font-weight="700" fill="#FFFFFF" letter-spacing="0.5">${esc(subtitle.toUpperCase())}</text>`;
  }

  // ── Laptop screen content per category ──
  const screenY = fam === "executive" ? 260 + titleLines.length * 30 : 240 + titleLines.length * 30;
  // Laptop height: sized to content, not the whole canvas
  const screenH = fam === "nurture" ? 1050 : fam === "executive" ? 1000 : fam === "editorial" ? 950 : 1050;
  let screenContent = "";

  if (fam === "nurture") {
    // 2x2 pastel KPI grid with rounded corners + savings goal progress bars
    const kpiW = 520;
    const kpiH = 140;
    const kpiGap = 24;
    const kpiStartX = 260;
    const kpiStartY = screenY + 60;
    const pastelBgs = ["#E8DEF8", "#D1FAE5", "#FCE7F3", "#DBEAFE"];
    screenContent = kpiLabels.map((label, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx = kpiStartX + col * (kpiW + kpiGap);
      const cy = kpiStartY + row * (kpiH + kpiGap);
      const pastelBg = pastelBgs[i % pastelBgs.length];
      return `
    ${roundedRect(cx, cy, kpiW, kpiH, 20, pastelBg)}
    <text x="${cx + 28}" y="${cy + 44}" font-family="${font}" font-size="18" font-weight="600" fill="${darken(pastelBg, 0.55)}">${esc(label)}</text>
    <text x="${cx + 28}" y="${cy + 105}" font-family="${font}" font-size="46" font-weight="800" fill="${darken(pastelBg, 0.65)}">${esc(kpiValues[i])}</text>`;
    }).join("");
    // Savings goal progress bars section
    const prgY = kpiStartY + 2 * (kpiH + kpiGap) + 40;
    const prgX = kpiStartX;
    const prgW = 2 * kpiW + kpiGap;
    const savingsGoals = [
      { name: "Emergency Fund", pct: 72, color: "#A78BFA" },
      { name: "Vacation Savings", pct: 45, color: "#6EE7B7" },
      { name: "Holiday Gifts", pct: 88, color: "#F9A8D4" },
      { name: "Home Repair Fund", pct: 31, color: "#93C5FD" },
    ];
    screenContent += `
    <text x="${prgX}" y="${prgY - 6}" font-family="${font}" font-size="17" font-weight="700" fill="#6B21A8" letter-spacing="1">SAVINGS GOALS</text>`;
    screenContent += savingsGoals.map((goal, i) => {
      const py = prgY + i * 76;
      return `
    <text x="${prgX}" y="${py + 22}" font-family="${font}" font-size="15" fill="${theme.text}">${esc(goal.name)}</text>
    <text x="${prgX + prgW}" y="${py + 22}" text-anchor="end" font-family="${font}" font-size="15" font-weight="700" fill="${goal.color}">${goal.pct}%</text>
    ${roundedRect(prgX, py + 30, prgW, 20, 10, lighten(goal.color, 0.6))}
    ${roundedRect(prgX, py + 30, Math.max(40, (goal.pct / 100) * prgW), 20, 10, goal.color)}`;
    }).join("");
  } else if (fam === "executive") {
    // Clean professional 4-across KPI cards on white screen
    const kpiW = 340;
    const kpiGap = 30;
    const kpiStartX = 260;
    const kpiStartY = screenY + 56;
    const kpiColors = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6"];
    screenContent = kpiLabels.map((label, i) => {
      const cx = kpiStartX + i * (kpiW + kpiGap);
      return `
    <rect x="${cx - 8}" y="${kpiStartY - 8}" width="${kpiW}" height="90" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1" />
    <rect x="${cx - 8}" y="${kpiStartY - 8}" width="${kpiW}" height="4" rx="2" fill="${kpiColors[i]}" />
    <text x="${cx + 4}" y="${kpiStartY + 18}" font-family="${font}" font-size="12" font-weight="600" fill="#64748B" letter-spacing="1.5">${esc(label.toUpperCase())}</text>
    <text x="${cx + 4}" y="${kpiStartY + 60}" font-family="${font}" font-size="38" font-weight="800" fill="#0F172A">${esc(kpiValues[i])}</text>`;
    }).join("");
    // Clean data table on white background
    const tblY = kpiStartY + 110;
    const tblX = 260;
    const tblW = 1260;
    const cols = ["Category", "Revenue", "Expenses", "Net Profit", "Margin"];
    const colX = [tblX, tblX + 380, tblX + 620, tblX + 870, tblX + 1120];
    // Header row — light gray
    screenContent += `
    <rect x="${tblX}" y="${tblY}" width="${tblW}" height="36" rx="4" fill="#F1F5F9" />`;
    screenContent += cols.map((col, i) =>
      `<text x="${colX[i] + 12}" y="${tblY + 25}" font-family="${font}" font-size="13" font-weight="700" fill="#475569" letter-spacing="0.5">${esc(col)}</text>`
    ).join("");
    // Data rows — white/light alternating
    screenContent += categories.slice(0, 6).map((c, i) => {
      const ry = tblY + 36 + i * 38;
      const bg = i % 2 === 0 ? "#FFFFFF" : "#F8FAFC";
      const amt = parseFloat(c.amount.replace(/[$,]/g, "")) || 500;
      const expense = Math.round(amt * 0.7);
      const net = Math.round(amt - expense);
      const margin = Math.round((net / amt) * 100);
      return `
    <rect x="${tblX}" y="${ry}" width="${tblW}" height="38" fill="${bg}" />
    <text x="${colX[0] + 12}" y="${ry + 26}" font-family="${font}" font-size="14" fill="#1E293B">${esc(c.name)}</text>
    <text x="${colX[1] + 12}" y="${ry + 26}" font-family="${font}" font-size="14" fill="#059669">${esc(c.amount)}</text>
    <text x="${colX[2] + 12}" y="${ry + 26}" font-family="${font}" font-size="14" fill="#DC2626">${formatCurrency(expense)}</text>
    <text x="${colX[3] + 12}" y="${ry + 26}" font-family="${font}" font-size="14" font-weight="700" fill="#0F172A">${formatCurrency(net)}</text>
    <text x="${colX[4] + 12}" y="${ry + 26}" font-family="${font}" font-size="14" fill="${margin > 20 ? "#059669" : "#D97706"}">${margin}%</text>`;
    }).join("");
    // Totals row — accent color
    const ttlY = tblY + 36 + Math.min(categories.length, 6) * 38 + 8;
    screenContent += `
    <rect x="${tblX}" y="${ttlY}" width="${tblW}" height="46" rx="6" fill="#059669" />
    <text x="${tblX + 12}" y="${ttlY + 32}" font-family="${font}" font-size="16" font-weight="800" fill="#FFFFFF" letter-spacing="1">NET PROFIT</text>
    <text x="${tblX + tblW - 12}" y="${ttlY + 32}" text-anchor="end" font-family="${font}" font-size="20" font-weight="900" fill="#FFFFFF">${esc(kpiValues[2] || "$0")}</text>`;
  } else if (fam === "editorial") {
    // 3 LARGE centered serif KPI cards with ornamental gold dividers
    const kpiW = 380;
    const kpiH = 160;
    const kpiGap = 50;
    const totalW = 3 * kpiW + 2 * kpiGap;
    const kpiStartX = (1560 - totalW) / 2 + 220;
    const kpiStartY = screenY + 60;
    screenContent = kpiLabels.slice(0, 3).map((label, i) => {
      const cx = kpiStartX + i * (kpiW + kpiGap);
      const cardBg = i === 0 ? "#FFF8F0" : i === 1 ? "#F0F7FF" : "#FFF0F5";
      return `
    ${roundedRect(cx, kpiStartY, kpiW, kpiH, 6, cardBg)}
    <rect x="${cx}" y="${kpiStartY}" width="${kpiW}" height="3" fill="#C8A97E" />
    <text x="${cx + kpiW / 2}" y="${kpiStartY + 50}" text-anchor="middle" font-family="Georgia, serif" font-size="16" font-weight="400" fill="#8B7355" letter-spacing="1">${esc(label.toUpperCase())}</text>
    <text x="${cx + kpiW / 2}" y="${kpiStartY + 110}" text-anchor="middle" font-family="Georgia, serif" font-size="48" font-weight="700" fill="#4A3728">${esc(kpiValues[i])}</text>
    <rect x="${cx + kpiW / 2 - 20}" y="${kpiStartY + 125}" width="40" height="1.5" fill="#C8A97E" />`;
    }).join("");
    // Ornamental gold divider between KPIs and table
    const divY = kpiStartY + kpiH + 30;
    screenContent += `
    <circle cx="880" cy="${divY}" r="2.5" fill="#C8A97E" />
    <rect x="890" y="${divY - 0.5}" width="100" height="1" fill="#C8A97E" />
    <rect x="995" y="${divY - 4}" width="8" height="8" rx="1" transform="rotate(45,999,${divY})" fill="#C8A97E" />
    <rect x="1008" y="${divY - 0.5}" width="100" height="1" fill="#C8A97E" />
    <circle cx="1118" cy="${divY}" r="2.5" fill="#C8A97E" />`;
    // Elegant serif table with thin gold separators
    const tblY = divY + 30;
    screenContent += `
    <text x="1000" y="${tblY}" text-anchor="middle" font-family="Georgia, serif" font-size="15" font-weight="600" fill="#8B7355" letter-spacing="2">EXPENSE BREAKDOWN</text>`;
    screenContent += categories.slice(0, 5).map((c, i) => {
      const ry = tblY + 20 + i * 52;
      return `
    <text x="340" y="${ry + 30}" font-family="Georgia, serif" font-size="18" fill="#4A3728">${esc(c.name)}</text>
    <text x="1460" y="${ry + 30}" font-family="Georgia, serif" font-size="18" font-weight="600" fill="#4A3728" text-anchor="end">${esc(c.amount)}</text>
    <line x1="340" y1="${ry + 44}" x2="1460" y2="${ry + 44}" stroke="#E8D5B8" stroke-width="1" stroke-dasharray="1,3" />`;
    }).join("");
  } else {
    // Energetic: vivid KPI cards with large numbers + colorful chart
    const kpiW = 350;
    const kpiStartY = screenY + 56;
    screenContent = kpiLabels.map((label, i) => {
      const cx = 250 + i * (kpiW + 18);
      return `
    ${roundedRect(cx, kpiStartY, kpiW, 100, 12, kpiColors[i])}
    <text x="${cx + 20}" y="${kpiStartY + 30}" font-family="${font}" font-size="13" font-weight="700" fill="${darken(kpiColors[i], 0.6)}">${esc(label)}</text>
    <text x="${cx + 20}" y="${kpiStartY + 74}" font-family="${font}" font-size="34" font-weight="800" fill="${darken(kpiColors[i], 0.7)}">${esc(kpiValues[i])}</text>`;
    }).join("");
    // Colorful chart area
    const chartY = kpiStartY + 120;
    screenContent += `
    ${roundedRect(250, chartY, 1280, 200, 12, theme.cardBg)}`;
    screenContent += [0.6, 0.85, 0.4, 0.7, 0.55, 0.9].map((h, i) => {
      const bx = 310 + i * 190;
      const bh = h * 160;
      return `
    ${roundedRect(bx, chartY + 180 - bh, 50, bh, 6, kpiColors[i % 4])}`;
    }).join("");
  }

  // Feature highlights below laptop — genuinely different per family
  const featureY = screenY + screenH + 70;
  let featuresSvg = "";

  if (fam === "executive") {
    // Clean professional cards with accent top border
    const featureItems = ["P&L Dashboard", "Tax Estimator", "Monthly Summary", "Expense Log"];
    const badgeColors = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6"];
    featuresSvg = featureItems.map((item, i) => {
      const fx = 200 + i * 430;
      return `
    <rect x="${fx}" y="${featureY}" width="380" height="72" rx="12" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1" />
    <rect x="${fx + 10}" y="${featureY}" width="360" height="4" rx="2" fill="${badgeColors[i]}" />
    <circle cx="${fx + 36}" cy="${featureY + 42}" r="14" fill="${badgeColors[i]}" opacity="0.12" />
    <text x="${fx + 62}" y="${featureY + 48}" font-family="${font}" font-size="20" font-weight="700" fill="#0F172A" letter-spacing="0.3">${esc(item)}</text>`;
    }).join("");
  } else if (fam === "editorial") {
    // Elegant text with small decorative gold dots between items
    const featureItems = ["Budget Tracker", "Vendor Management", "Guest List", "Timeline"];
    const totalItems = featureItems.length;
    const startX = 1000 - ((totalItems - 1) * 220) / 2;
    featuresSvg = featureItems.map((item, i) => {
      const fx = startX + i * 220;
      let dot = "";
      if (i < totalItems - 1) {
        dot = `<circle cx="${fx + 200}" cy="${featureY + 18}" r="3" fill="#C8A97E" />`;
      }
      return `
    <text x="${fx}" y="${featureY + 24}" text-anchor="middle" font-family="Georgia, serif" font-size="20" font-weight="400" fill="#6B5744" letter-spacing="0.5">${esc(item)}</text>
    ${dot}`;
    }).join("");
  } else if (fam === "nurture") {
    // Rounded pills with pastel accent backgrounds
    const featureItems = ["Auto Dashboard", "Savings Goals", "Category Tracker", "Monthly View"];
    const pastelAccents = ["#E8DEF8", "#D1FAE5", "#FCE7F3", "#DBEAFE"];
    featuresSvg = featureItems.map((item, i) => {
      const fx = 200 + i * 430;
      return `
    ${roundedRect(fx, featureY, 380, 72, 36, pastelAccents[i])}
    <circle cx="${fx + 36}" cy="${featureY + 36}" r="14" fill="${darken(pastelAccents[i], 0.3)}" />
    <text x="${fx + 62}" y="${featureY + 42}" font-family="${font}" font-size="19" font-weight="600" fill="${darken(pastelAccents[i], 0.6)}">${esc(item)}</text>`;
    }).join("");
  } else {
    // Bold feature pills with colored accents on white
    const featureItems = ["Smart Formulas", "Visual Charts", "Monthly Trends", "One-Click Setup"];
    featuresSvg = featureItems.map((item, i) => {
      const fx = 200 + i * 430;
      return `
    ${roundedRect(fx, featureY, 380, 80, 40, "#FFFFFF")}
    <circle cx="${fx + 40}" cy="${featureY + 40}" r="18" fill="${kpiColors[i % 4]}" />
    <text x="${fx + 70}" y="${featureY + 46}" font-family="${font}" font-size="20" font-weight="600" fill="#1F2937">${esc(item)}</text>`;
    }).join("");
  }

  // Trust strip at bottom — per-family content and styling
  const trustY = featureY + 130;
  let trustSvg = "";

  if (fam === "executive") {
    const trustItems = ["Tax-Ready", "Auto-Calculating", "Instant Download"];
    const totalW = trustItems.length * 300 + (trustItems.length - 1) * 80;
    const startX = (IMG_W - totalW) / 2;
    trustSvg = trustItems.map((item, i) => {
      const tx = startX + i * 380;
      return `
    <text x="${tx}" y="${trustY + 20}" font-family="${font}" font-size="18" font-weight="600" fill="#64748B" letter-spacing="2">${esc(item.toUpperCase())}</text>
    ${i < trustItems.length - 1 ? `<text x="${tx + 260}" y="${trustY + 20}" font-family="${font}" font-size="18" fill="#CBD5E1">|</text>` : ""}`;
    }).join("");
  } else if (fam === "editorial") {
    // Elegant centered with middle dots
    const trustText = "Instant Download  ·  Works in Google Sheets  ·  Lifetime Access";
    trustSvg = `
    <text x="1000" y="${trustY + 20}" text-anchor="middle" font-family="Georgia, serif" font-size="20" font-weight="400" fill="#8B7355" letter-spacing="1">${esc(trustText)}</text>`;
  } else if (fam === "nurture") {
    const trustItems = ["Instant Download", "Google Sheets", "Easy to Use", "Auto-Calculating"];
    trustSvg = trustItems.map((item, i) => {
      const tx = 220 + i * 420;
      return `
    <circle cx="${tx}" cy="${trustY + 14}" r="7" fill="#A78BFA" opacity="0.6" />
    <text x="${tx + 18}" y="${trustY + 20}" font-family="${font}" font-size="20" font-weight="600" fill="${theme.text}">${esc(item)}</text>`;
    }).join("");
  } else {
    const trustItems = ["Instant Download", "Google Sheets", "Easy to Use", "Auto-Calculating"];
    trustSvg = trustItems.map((item, i) => {
      const tx = 220 + i * 420;
      return `
    <circle cx="${tx}" cy="${trustY + 14}" r="6" fill="${theme.accent}" />
    <text x="${tx + 16}" y="${trustY + 20}" font-family="${font}" font-size="20" font-weight="600" fill="${theme.text}">${esc(item)}</text>`;
    }).join("");
  }

  // ── Per-family shadow filter and laptop frame ──
  let shadowFilter = "";
  let laptopOpen = "";
  let laptopClose = "";

  if (fam === "executive") {
    // Professional laptop with clean soft shadow (no angle — clean look)
    shadowFilter = `<filter id="shadow1" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="16" stdDeviation="32" flood-color="rgba(15,23,42,0.12)" />
    </filter>`;
    laptopOpen = `<g filter="url(#shadow1)">`;
    laptopClose = `</g>`;
  } else if (fam === "editorial") {
    // Centered, slightly larger laptop with elegant thin shadow
    shadowFilter = `<filter id="shadow1" x="-5%" y="-5%" width="115%" height="115%">
      <feDropShadow dx="0" dy="6" stdDeviation="20" flood-color="rgba(74,55,40,0.12)" />
    </filter>`;
    laptopOpen = `<g filter="url(#shadow1)">`;
    laptopClose = `</g>`;
  } else if (fam === "nurture") {
    // Soft rounded shadow
    shadowFilter = `<filter id="shadow1" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="14" stdDeviation="28" flood-color="rgba(107,33,168,0.1)" />
    </filter>`;
    laptopOpen = `<g filter="url(#shadow1)">`;
    laptopClose = `</g>`;
  } else {
    shadowFilter = `<filter id="shadow1" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="8" stdDeviation="${shadowBlur}" flood-color="rgba(0,0,0,0.25)" />
    </filter>`;
    laptopOpen = `<g filter="url(#shadow1)">`;
    laptopClose = `</g>`;
  }

  // Laptop frame colors — clean modern device look
  const laptopShell = "#2D2D2D";
  const laptopScreen = "#FFFFFF";
  const laptopBase = "#3D3D3D";
  const laptopR = fam === "nurture" ? 20 : fam === "editorial" ? 14 : 12;
  const tabBarBg = "#F1F5F9";
  const tabBarText = "#334155";

  // Background texture for premium feel
  const bgTexture = renderBackgroundTexture(fam, fam === "executive" ? "#4A90D9" : theme.accent, fam === "executive" ? 0.06 : 0.04);

  // Keyboard deck height and base Y
  const baseY = screenY + screenH;
  const deckH = 80;
  const hingeH = 5;

  // Generate keyboard key rows (simplified)
  const keyRows: string[] = [];
  const kbStartX = 260;
  const kbEndX = 1740;
  const keyW = 28;
  const keyH = 14;
  const keyGap = 4;
  const keyColor = fam === "executive" ? "#2A2A2A" : "#4A4A4A";
  for (let row = 0; row < 3; row++) {
    const ky = baseY + hingeH + 12 + row * (keyH + keyGap);
    const rowOffset = row * 8; // stagger each row
    for (let kx = kbStartX + rowOffset; kx < kbEndX - rowOffset; kx += keyW + keyGap) {
      keyRows.push(`<rect x="${kx}" y="${ky}" width="${keyW}" height="${keyH}" rx="3" fill="${keyColor}" />`);
    }
  }
  const keyboardSvg = keyRows.join("\n      ");

  // Trackpad dimensions
  const tpW = 260;
  const tpH = 24;
  const tpX = 1000 - tpW / 2;
  const tpY = baseY + hingeH + 12 + 3 * (keyH + keyGap) + 4;
  const tpColor = fam === "executive" ? "#2A2A2A" : "#4A4A4A";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMG_W}" height="${IMG_H}" viewBox="0 0 ${IMG_W} ${IMG_H}">
  <defs>
    ${shadowFilter}
    ${bgGradient}
    ${bgTexture.defs}
    <linearGradient id="screenGlare" x1="0" y1="0" x2="0.7" y2="1">
      <stop offset="0%" stop-color="white" stop-opacity="0.07" />
      <stop offset="45%" stop-color="white" stop-opacity="0" />
      <stop offset="100%" stop-color="white" stop-opacity="0.04" />
    </linearGradient>
    <linearGradient id="hingeGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${fam === 'executive' ? '#0D0D0D' : '#2A2A2A'}" />
      <stop offset="100%" stop-color="${fam === 'executive' ? '#1A1A1A' : '#3D3D3D'}" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${IMG_W}" height="${IMG_H}" fill="url(#bgGrad)" />

  <!-- Background texture -->
  ${bgTexture.overlay}

  <!-- Decorative elements -->
  ${renderDecorativeElements(nicheProfile.imageStyle.decorativeElements, fam === "executive" ? "#1E40AF" : theme.accent, fam === "executive" ? 0.04 : 0.08)}

  <!-- Title -->
  ${titleSvg}
  ${subtitleSvg}

  <!-- Laptop frame -->
  ${laptopOpen}
    <!-- Screen shell -->
    ${roundedRect(200, screenY, 1600, screenH, laptopR, laptopShell)}

    <!-- Webcam dot -->
    <circle cx="1000" cy="${screenY + 10}" r="3.5" fill="${fam === 'executive' ? '#252525' : '#444'}" />
    <circle cx="1000" cy="${screenY + 10}" r="1.5" fill="${fam === 'executive' ? '#181818' : '#2A2A2A'}" />

    <!-- Screen area -->
    ${roundedRect(220, screenY + 20, 1560, screenH - 40, Math.max(4, laptopR - 6), laptopScreen)}

    <!-- Tab bar -->
    ${roundedRect(220, screenY + 20, 1560, 36, 0, tabBarBg)}
    <text x="260" y="${screenY + 44}" font-family="${font}" font-size="14" font-weight="600" fill="${tabBarText}">${esc(dashTab?.name || "Dashboard")}</text>

    ${screenContent}

    <!-- Screen glare overlay -->
    <rect x="220" y="${screenY + 20}" width="1560" height="${screenH - 40}" rx="${Math.max(4, laptopR - 6)}" fill="url(#screenGlare)" />

    <!-- Hinge -->
    <rect x="200" y="${baseY}" width="1600" height="${hingeH}" rx="1" fill="url(#hingeGrad)" />

    <!-- Keyboard deck (slightly wider, with subtle taper) -->
    <path d="M170,${baseY + hingeH} L190,${baseY + hingeH + deckH} L1810,${baseY + hingeH + deckH} L1830,${baseY + hingeH} Z" fill="${laptopBase}" />
    <rect x="190" y="${baseY + hingeH + deckH - 3}" width="1620" height="3" rx="1.5" fill="${fam === 'executive' ? '#0D0D0D' : '#2D2D2D'}" />

    <!-- Keyboard keys -->
    <g opacity="0.18">
      ${keyboardSvg}
    </g>

    <!-- Trackpad -->
    <rect x="${tpX}" y="${tpY}" width="${tpW}" height="${tpH}" rx="4" fill="${tpColor}" opacity="0.25" />
  ${laptopClose}

  <!-- Feature highlights -->
  ${featuresSvg}

  <!-- Trust strip -->
  ${trustSvg}
</svg>`;
}

// ── IMAGE 2: PROBLEM HOOK ───────────────────────────────────

function buildProblemSvg(
  spec: ListingImageSpec,
  theme: ImageTheme,
  nicheProfile: NicheDesignProfile,
  vd?: import("@/types/visual-direction").VisualDirectionSpec,
): string {
  const font = vd?.global.fontFamily === "serif" ? "Georgia, 'Times New Roman', serif"
    : vd?.global.fontFamily === "mono" ? "'Courier New', Courier, monospace"
    : nicheProfile.typography.fontFamily;
  const hook = spec.title || "Where did my money go?";
  const solution = spec.subtitle || "A budget system that saves first and tracks every dollar.";

  // Use VisualDirectionSpec if available, else fall back to family-based defaults
  const p = vd?.problem || { layout: "centered-text" as const, hookScale: 1.0, darkness: 0, showBullets: true, bulletCount: 3, separator: "line" as const, gravity: "center" as const };
  const g = vd?.global || { backgroundMode: "gradient" as const, gradientAngle: 180, gradientStops: ["#F8F9FA", "#FFFFFF"] as [string, string], decorStyle: "none" as const, decorOpacity: 0.05, fontFamily: "sans" as const, density: "balanced" as const };

  // Force BRIGHT backgrounds — Etsy top sellers never use dark problem slides
  const isDark = false;
  const hookFontSize = Math.round(72 * p.hookScale); // Bigger for mobile readability
  const hookSpacing = Math.round(hookFontSize * 1.35);
  const hookColor = "#1F2937";
  const subColor = "#6B7280";
  const accentColor = vd?.global.gradientStops?.[0] || theme.accent;
  const hookLines = wrapText(hook, Math.round(26 / p.hookScale));
  const solutionLines = wrapText(solution, 40);

  // Background gradient
  const bgStart = isDark ? darken(g.gradientStops[0], 0.8) : g.gradientStops[0];
  const bgEnd = isDark ? darken(g.gradientStops[1], 0.85) : g.gradientStops[1];
  const angle = g.gradientAngle;
  const gradX1 = Math.cos((angle - 90) * Math.PI / 180) * 0.5 + 0.5;
  const gradY1 = Math.sin((angle - 90) * Math.PI / 180) * 0.5 + 0.5;
  const gradX2 = 1 - gradX1;
  const gradY2 = 1 - gradY1;

  // Build background SVG
  const bgSvg = `<defs>
    <linearGradient id="bgGrad2" x1="${gradX1}" y1="${gradY1}" x2="${gradX2}" y2="${gradY2}">
      <stop offset="0%" stop-color="${bgStart}" />
      <stop offset="100%" stop-color="${bgEnd}" />
    </linearGradient>
  </defs>
  <rect width="${IMG_W}" height="${IMG_H}" fill="url(#bgGrad2)" />`;

  // Decorative elements based on spec
  const decorSvg = g.decorStyle !== "none" ? renderDecorativeElements(g.decorStyle, isDark ? "rgba(255,255,255,0.1)" : theme.accent, g.decorOpacity) : "";

  // ── LAYOUT: split-columns ──
  if (p.layout === "split-columns") {
    const solutionBullets = solutionLines.length > 1 ? solutionLines : [solution];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMG_W}" height="${IMG_H}" viewBox="0 0 ${IMG_W} ${IMG_H}">
  ${bgSvg}
  ${decorSvg}
  <rect x="998" y="300" width="2" height="1400" fill="${isDark ? '#1F2937' : '#E5E7EB'}" />

  <text x="500" y="440" text-anchor="middle" font-family="${font}" font-size="16" font-weight="700" fill="#EF4444" letter-spacing="4">THE PROBLEM</text>
  <rect x="400" y="460" width="200" height="3" fill="#EF4444" />
  ${hookLines.map((line, i) =>
    `<text x="500" y="${560 + i * 90}" text-anchor="middle" font-family="${font}" font-size="64" font-weight="900" fill="${hookColor}">${esc(line)}</text>`
  ).join("\n  ")}

  <text x="1500" y="440" text-anchor="middle" font-family="${font}" font-size="16" font-weight="700" fill="#34D399" letter-spacing="4">THE SOLUTION</text>
  <rect x="1400" y="460" width="200" height="3" fill="#34D399" />
  ${solutionBullets.map((line, i) =>
    `<text x="1500" y="${560 + i * 60}" text-anchor="middle" font-family="${font}" font-size="32" font-weight="600" fill="${isDark ? '#E5E7EB' : '#374151'}">${esc(line)}</text>`
  ).join("\n  ")}
</svg>`;
  }

  // ── LAYOUT: stacked-cards ──
  if (p.layout === "stacked-cards") {
    const cardBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)";
    const cardStroke = isDark ? "rgba(255,255,255,0.1)" : "#E8DEF8";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMG_W}" height="${IMG_H}" viewBox="0 0 ${IMG_W} ${IMG_H}">
  ${bgSvg}
  ${decorSvg}

  ${roundedRect(200, 300, 1600, 600, 30, cardBg, cardStroke)}
  <text x="1000" y="500" text-anchor="middle" font-family="${font}" font-size="20" font-weight="600" fill="${theme.accent}" letter-spacing="3">THE CHALLENGE</text>
  ${hookLines.map((line, i) =>
    `<text x="1000" y="${620 + i * hookSpacing}" text-anchor="middle" font-family="${font}" font-size="${hookFontSize}" font-weight="700" fill="${hookColor}">${esc(line)}</text>`
  ).join("\n  ")}

  ${roundedRect(200, 1020, 1600, 600, 30, cardBg, cardStroke)}
  <text x="1000" y="1200" text-anchor="middle" font-family="${font}" font-size="20" font-weight="600" fill="${theme.accent}" letter-spacing="3">THE SOLUTION</text>
  ${solutionLines.map((line, i) =>
    `<text x="1000" y="${1320 + i * 55}" text-anchor="middle" font-family="${font}" font-size="32" font-weight="500" fill="${subColor}">${esc(line)}</text>`
  ).join("\n  ")}
</svg>`;
  }

  // ── LAYOUT: diagonal ──
  if (p.layout === "diagonal") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMG_W}" height="${IMG_H}" viewBox="0 0 ${IMG_W} ${IMG_H}">
  ${bgSvg}
  <polygon points="0,0 ${IMG_W},0 ${IMG_W},${IMG_H * 0.45}" fill="${isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)'}" />
  ${decorSvg}

  ${hookLines.map((line, i) =>
    `<text x="260" y="${500 + i * hookSpacing}" text-anchor="start" font-family="${font}" font-size="${hookFontSize}" font-weight="800" fill="${hookColor}">${esc(line)}</text>`
  ).join("\n  ")}

  ${p.separator === "gradient" ? `<rect x="260" y="${520 + hookLines.length * hookSpacing}" width="400" height="4" fill="${theme.accent}" rx="2" />` : ""}

  ${solutionLines.map((line, i) =>
    `<text x="260" y="${580 + hookLines.length * hookSpacing + i * 55}" text-anchor="start" font-family="${font}" font-size="30" fill="${subColor}">${esc(line)}</text>`
  ).join("\n  ")}
</svg>`;
  }

  // ── LAYOUT: full-dark ──
  if (p.layout === "full-dark") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMG_W}" height="${IMG_H}" viewBox="0 0 ${IMG_W} ${IMG_H}">
  <rect width="${IMG_W}" height="${IMG_H}" fill="#0A0A0A" />
  ${decorSvg}

  ${hookLines.map((line, i) =>
    `<text x="1000" y="${700 + i * hookSpacing}" text-anchor="middle" font-family="${font}" font-size="${Math.round(hookFontSize * 1.15)}" font-weight="900" fill="#FFFFFF">${esc(line)}</text>`
  ).join("\n  ")}

  <rect x="850" y="${720 + hookLines.length * hookSpacing}" width="300" height="4" fill="${theme.accent}" rx="2" />

  ${solutionLines.map((line, i) =>
    `<text x="1000" y="${790 + hookLines.length * hookSpacing + i * 50}" text-anchor="middle" font-family="${font}" font-size="30" fill="rgba(255,255,255,0.5)">${esc(line)}</text>`
  ).join("\n  ")}
</svg>`;
  }

  // ── LAYOUT: centered-text (default) ──
  const sepY = 710 + hookLines.length * hookSpacing;
  const separatorSvg = p.separator === "ornament"
    ? `<circle cx="940" r="3" cy="${sepY}" fill="${theme.accent}" /><rect x="950" y="${sepY - 1}" width="100" height="1.5" fill="${theme.accent}" /><circle cx="1060" cy="${sepY}" r="3" fill="${theme.accent}" />`
    : p.separator === "gradient"
    ? `<rect x="700" y="${sepY}" width="600" height="3" fill="${theme.accent}" rx="1.5" />`
    : p.separator === "line"
    ? `<rect x="850" y="${sepY}" width="300" height="2" fill="${isDark ? 'rgba(255,255,255,0.2)' : '#D1D5DB'}" />`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMG_W}" height="${IMG_H}" viewBox="0 0 ${IMG_W} ${IMG_H}">
  ${bgSvg}
  ${decorSvg}

  ${hookLines.map((line, i) =>
    `<text x="1000" y="${660 + i * hookSpacing}" text-anchor="middle" font-family="${font}" font-size="${hookFontSize}" font-weight="700" fill="${hookColor}">${esc(line)}</text>`
  ).join("\n  ")}

  ${separatorSvg}

  ${solutionLines.map((line, i) =>
    `<text x="1000" y="${sepY + 70 + i * 50}" text-anchor="middle" font-family="${font}" font-size="28" font-weight="400" fill="${subColor}">${esc(line)}</text>`
  ).join("\n  ")}
</svg>`;
}

// ── IMAGE 3: DASHBOARD CLOSE-UP ─────────────────────────────

function buildDashboardSvg(
  spec: ListingImageSpec,
  blueprint: ProductBlueprint,
  theme: ImageTheme,
  nicheProfile: NicheDesignProfile
): string {
  const fam = getLayoutFamilyId(nicheProfile.id);
  const font = nicheProfile.typography.fontFamily;
  const cardR = nicheProfile.layout.cardRadius;
  const dashTab = blueprint.tabs.find((t) =>
    t.name.toLowerCase().includes("dashboard")
  );

  const kpiCardStyles = nicheProfile.kpiStyle.cards;
  const kpiColors = [
    { bg: kpiCardStyles[0]?.bg || theme.kpiGreen, text: kpiCardStyles[0]?.text || "#166534" },
    { bg: kpiCardStyles[1]?.bg || theme.kpiRed, text: kpiCardStyles[1]?.text || "#991B1B" },
    { bg: kpiCardStyles[2]?.bg || theme.kpiYellow, text: kpiCardStyles[2]?.text || "#92400E" },
    { bg: kpiCardStyles[3]?.bg || theme.kpiBlue, text: kpiCardStyles[3]?.text || "#1E40AF" },
  ];

  const txnTab = blueprint.tabs.find((t) =>
    t.name.toLowerCase().includes("transaction")
  );
  const kpiData = extractKpiData(
    dashTab?.sampleRows || [],
    undefined, undefined,
    txnTab?.sampleRows,
  );
  const kpis = kpiData.map((kpi, i) => ({
    label: kpi.label,
    value: kpi.value,
    color: kpiColors[i]?.bg || "#DBEAFE",
    textColor: kpiColors[i]?.text || "#1E40AF",
  }));

  // Build budget table: prefer transaction-derived data (always has real amounts)
  // Dashboard formulas can't be evaluated → all show "$0", so transactions are the primary source
  // Generate synthetic budget limits slightly above actual spending for realism
  let dataRows: Array<{ cols: string[] }> = [];
  if (txnTab?.sampleRows) {
    const budgetCats = deriveBudgetFromTransactions(txnTab.sampleRows, 6);
    dataRows = budgetCats.map((c, idx) => {
      const actual = parseFloat(c.amount.replace(/[$,]/g, "")) || 0;
      // Deterministic multiplier based on category index: 1.08 to 1.30
      const multipliers = [1.15, 1.22, 1.08, 1.30, 1.18, 1.12];
      const budgetAmount = Math.round(actual * (multipliers[idx % multipliers.length] || 1.15));
      const remaining = budgetAmount - Math.round(actual);
      const status = remaining > 0 ? "On Track" : remaining === 0 ? "On Track" : "Over Budget";
      return {
        cols: [c.name, formatCurrency(budgetAmount), c.amount, formatCurrency(remaining), status],
      };
    });
  }
  if (dataRows.length === 0) {
    // Fallback: try dashboard extraction (may have $0 amounts but still shows structure)
    dataRows = extractTableRows(
      dashTab?.sampleRows || [],
      8, 6,
      ["text", "currency", "currency", "currency", "text"],
      5, 5,
    );
  }
  if (dataRows.length === 0) {
    dataRows = [
      { cols: ["Category A", "$500", "$450", "$50", "On Track"] },
      { cols: ["Category B", "$150", "$120", "$30", "Under"] },
      { cols: ["Category C", "$200", "$180", "$20", "On Track"] },
      { cols: ["Category D", "$100", "$250", "-$150", "Over"] },
      { cols: ["Category E", "$100", "$75", "$25", "Under"] },
    ];
  }
  // Deduplicate category names (dashboard extraction may have duplicates)
  const seenNames = new Set<string>();
  dataRows = dataRows.filter((r) => {
    const name = r.cols[0]?.toLowerCase();
    if (!name || seenNames.has(name)) return false;
    seenNames.add(name);
    return true;
  });

  const title = spec.title || "Everything you need. One dashboard.";
  const highlights = spec.highlights || [];

  // ── Title — clean text on light background (no colored header bars) ──
  let titleBarSvg = "";
  if (fam === "nurture") {
    titleBarSvg = `
    <text x="1000" y="72" text-anchor="middle" font-family="${font}" font-size="48" font-weight="800" fill="${theme.text}">${esc(title)}</text>
    <rect x="860" y="86" width="280" height="4" rx="2" fill="${theme.accent}" />`;
  } else if (fam === "executive") {
    titleBarSvg = `
    <text x="1000" y="68" text-anchor="middle" font-family="${font}" font-size="46" font-weight="800" fill="#0F172A">${esc(title)}</text>
    <rect x="880" y="82" width="240" height="3" rx="1" fill="${theme.accent}" />`;
  } else if (fam === "editorial") {
    titleBarSvg = `
    <text x="1000" y="70" text-anchor="middle" font-family="Georgia, serif" font-size="48" font-weight="700" fill="#3D2B1F">${esc(title)}</text>
    <rect x="900" y="86" width="200" height="3" rx="1" fill="${theme.accent}" />`;
  } else {
    titleBarSvg = `
    <text x="1000" y="72" text-anchor="middle" font-family="${font}" font-size="50" font-weight="800" fill="${theme.text}">${esc(title)}</text>
    <rect x="860" y="88" width="280" height="4" rx="2" fill="${theme.accent}" />`;
  }

  // ── KPI cards per category ──
  let kpiSvg = "";
  const kpiTopY = fam === "nurture" ? 130 : fam === "executive" ? 120 : fam === "editorial" ? 130 : 130;

  if (fam === "nurture") {
    // 2x2 grid
    kpiSvg = kpis.map((kpi, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx = 100 + col * 920;
      const cy = kpiTopY + row * 160;
      return `
    <g>
      ${roundedRect(cx, cy, 880, 140, cardR, kpi.color)}
      <text x="${cx + 40}" y="${cy + 50}" font-family="${font}" font-size="22" font-weight="600" fill="${kpi.textColor}">${esc(kpi.label)}</text>
      <text x="${cx + 40}" y="${cy + 105}" font-family="${font}" font-size="52" font-weight="800" fill="${kpi.textColor}">${esc(kpi.value)}</text>
    </g>`;
    }).join("");
  } else if (fam === "executive") {
    // Tight 1x4 row
    kpiSvg = kpis.map((kpi, i) => {
      const cx = 60 + i * 475;
      return `
    <g>
      ${roundedRect(cx, kpiTopY, 450, 110, 4, kpi.color)}
      <text x="${cx + 24}" y="${kpiTopY + 36}" font-family="${font}" font-size="17" font-weight="600" fill="${kpi.textColor}">${esc(kpi.label)}</text>
      <text x="${cx + 24}" y="${kpiTopY + 86}" font-family="${font}" font-size="42" font-weight="800" fill="${kpi.textColor}">${esc(kpi.value)}</text>
    </g>`;
    }).join("");
  } else if (fam === "editorial") {
    // 3 centered large cards with generous spacing
    kpiSvg = kpis.slice(0, 3).map((kpi, i) => {
      const cx = 120 + i * 600;
      return `
    <g>
      ${roundedRect(cx, kpiTopY, 560, 140, cardR, kpi.color)}
      <rect x="${cx}" y="${kpiTopY}" width="560" height="4" fill="${theme.accent}" />
      <text x="${cx + 36}" y="${kpiTopY + 48}" font-family="Georgia, serif" font-size="20" font-weight="600" fill="${kpi.textColor}">${esc(kpi.label)}</text>
      <text x="${cx + 36}" y="${kpiTopY + 108}" font-family="Georgia, serif" font-size="50" font-weight="700" fill="${kpi.textColor}">${esc(kpi.value)}</text>
    </g>`;
    }).join("");
  } else {
    // 4 vivid cards with large text
    kpiSvg = kpis.map((kpi, i) => {
      const cx = 60 + i * 480;
      return `
    <g>
      ${roundedRect(cx, kpiTopY, 450, 140, 14, kpi.color)}
      <text x="${cx + 30}" y="${kpiTopY + 44}" font-family="${font}" font-size="22" font-weight="700" fill="${kpi.textColor}">${esc(kpi.label)}</text>
      <text x="${cx + 30}" y="${kpiTopY + 110}" font-family="${font}" font-size="54" font-weight="800" fill="${kpi.textColor}">${esc(kpi.value)}</text>
    </g>`;
    }).join("");
  }

  // ── Table per category ──
  const tableTopY = fam === "nurture" ? kpiTopY + 340 : fam === "executive" ? kpiTopY + 150 : fam === "editorial" ? kpiTopY + 180 : kpiTopY + 180;
  let tableSvg = "";

  // Section header
  if (fam === "nurture") {
    tableSvg += `
    ${roundedRect(100, tableTopY - 60, 600, 46, 12, lighten(theme.kpiGreen, 0.3))}
    <text x="130" y="${tableTopY - 30}" font-family="${font}" font-size="20" font-weight="700" fill="#065F46">BUDGET OVERVIEW</text>`;
  } else if (fam === "executive") {
    tableSvg += `
    <text x="80" y="${tableTopY - 16}" font-family="${font}" font-size="18" font-weight="700" fill="${theme.text}">BUDGET OVERVIEW</text>
    <rect x="80" y="${tableTopY - 8}" width="240" height="2" fill="${theme.accent}" />`;
  } else if (fam === "editorial") {
    tableSvg += `
    <text x="1000" y="${tableTopY - 20}" text-anchor="middle" font-family="Georgia, serif" font-size="22" font-weight="600" fill="${theme.text}">Budget Overview</text>`;
  } else {
    tableSvg += `
    ${roundedRect(80, tableTopY - 60, 900, 50, 14, lighten(theme.primary, 0.85))}
    <text x="110" y="${tableTopY - 28}" font-family="${font}" font-size="22" font-weight="700" fill="${theme.text}">BUDGET OVERVIEW</text>`;
  }

  if (fam === "nurture") {
    // Card-row style: each row is a card
    tableSvg += dataRows.map((row, i) => {
      const ry = tableTopY + i * 80;
      const statusColor = row.cols[4]?.includes("Over") ? theme.kpiRed :
                          row.cols[4]?.includes("Under") ? theme.kpiGreen : theme.kpiYellow;
      const pct = row.cols[4]?.includes("Over") ? 100 : row.cols[4]?.includes("Under") ? 60 : 80;
      return `
    ${roundedRect(100, ry, 1800, 68, cardR, "#FFFFFF")}
    <text x="140" y="${ry + 42}" font-family="${font}" font-size="20" font-weight="600" fill="${theme.text}">${esc(row.cols[0])}</text>
    <text x="600" y="${ry + 42}" font-family="${font}" font-size="20" fill="${theme.text}">${esc(row.cols[1])}</text>
    <text x="850" y="${ry + 42}" font-family="${font}" font-size="20" fill="${theme.text}">${esc(row.cols[2])}</text>
    <text x="1100" y="${ry + 42}" font-family="${font}" font-size="20" fill="${theme.text}">${esc(row.cols[3])}</text>
    ${roundedRect(1400, ry + 18, 300, 14, 7, lighten(statusColor, 0.4))}
    ${roundedRect(1400, ry + 18, (pct / 100) * 300, 14, 7, statusColor)}
    <text x="1720" y="${ry + 44}" font-family="${font}" font-size="13" fill="${darken(statusColor, 0.5)}">${esc(row.cols[4] || "")}</text>`;
    }).join("");
  } else if (fam === "executive") {
    // Clean bordered table with sharp corners, dot status
    const tblW = 1300;
    tableSvg += `
    ${roundedRect(80, tableTopY, tblW, 36, 4, "#F1F5F9")}
    <text x="110" y="${tableTopY + 25}" font-family="${font}" font-size="14" font-weight="700" fill="#475569">Category</text>
    <text x="530" y="${tableTopY + 25}" font-family="${font}" font-size="14" font-weight="700" fill="#475569">Budgeted</text>
    <text x="730" y="${tableTopY + 25}" font-family="${font}" font-size="14" font-weight="700" fill="#475569">Actual</text>
    <text x="930" y="${tableTopY + 25}" font-family="${font}" font-size="14" font-weight="700" fill="#475569">Remaining</text>
    <text x="1200" y="${tableTopY + 25}" font-family="${font}" font-size="14" font-weight="700" fill="#475569">Status</text>`;
    tableSvg += dataRows.map((row, i) => {
      const ry = tableTopY + 36 + i * 42;
      const statusColor = row.cols[4]?.includes("Over") ? theme.kpiRed :
                          row.cols[4]?.includes("Under") ? theme.kpiGreen : theme.kpiYellow;
      return `
    <rect x="80" y="${ry}" width="${tblW}" height="42" fill="${theme.bg}" stroke="${theme.cardBorder}" stroke-width="1" />
    <text x="110" y="${ry + 28}" font-family="${font}" font-size="16" fill="${theme.text}">${esc(row.cols[0])}</text>
    <text x="530" y="${ry + 28}" font-family="${font}" font-size="16" fill="${theme.text}">${esc(row.cols[1])}</text>
    <text x="730" y="${ry + 28}" font-family="${font}" font-size="16" fill="${theme.text}">${esc(row.cols[2])}</text>
    <text x="930" y="${ry + 28}" font-family="${font}" font-size="16" fill="${theme.text}">${esc(row.cols[3])}</text>
    <circle cx="1210" cy="${ry + 21}" r="6" fill="${statusColor}" />`;
    }).join("");
    // Mini P&L summary at bottom
    const plY = tableTopY + 36 + dataRows.length * 42 + 30;
    tableSvg += `
    ${roundedRect(80, plY, tblW, 60, 4, "#F8FAFC")}
    <rect x="80" y="${plY}" width="${tblW}" height="3" rx="1" fill="${theme.accent}" />
    <text x="110" y="${plY + 38}" font-family="${font}" font-size="18" font-weight="700" fill="#0F172A">Revenue - Expenses = Net Profit</text>
    <text x="${80 + tblW - 30}" y="${plY + 38}" text-anchor="end" font-family="${font}" font-size="20" font-weight="800" fill="${theme.accent}">$2,450</text>`;
  } else if (fam === "editorial") {
    // Clean lines, no alternating rows — bottom borders only
    tableSvg += dataRows.map((row, i) => {
      const ry = tableTopY + 20 + i * 56;
      return `
    <text x="120" y="${ry + 34}" font-family="Georgia, serif" font-size="20" fill="${theme.text}">${esc(row.cols[0])}</text>
    <text x="600" y="${ry + 34}" font-family="Georgia, serif" font-size="20" fill="${theme.text}">${esc(row.cols[1])}</text>
    <text x="900" y="${ry + 34}" font-family="Georgia, serif" font-size="20" fill="${theme.text}">${esc(row.cols[2])}</text>
    <text x="1200" y="${ry + 34}" font-family="Georgia, serif" font-size="20" fill="${theme.text}">${esc(row.cols[3])}</text>
    <line x1="120" y1="${ry + 52}" x2="1350" y2="${ry + 52}" stroke="${lighten(theme.primary, 0.7)}" stroke-width="1" />
    ${row.cols[4] ? `<text x="1350" y="${ry + 34}" font-family="Georgia, serif" font-size="15" fill="${theme.accent}">${esc(row.cols[4])}</text>` : ""}`;
    }).join("");
  } else {
    // Striped table with strong contrast and pill badges
    tableSvg += `
    ${roundedRect(80, tableTopY, 1840, 40, 8, lighten(theme.primary, 0.88))}
    <text x="110" y="${tableTopY + 28}" font-family="${font}" font-size="17" font-weight="700" fill="${theme.text}">Category</text>
    <text x="600" y="${tableTopY + 28}" font-family="${font}" font-size="17" font-weight="700" fill="${theme.text}">Budgeted</text>
    <text x="900" y="${tableTopY + 28}" font-family="${font}" font-size="17" font-weight="700" fill="${theme.text}">Actual</text>
    <text x="1200" y="${tableTopY + 28}" font-family="${font}" font-size="17" font-weight="700" fill="${theme.text}">Remaining</text>
    <text x="1550" y="${tableTopY + 28}" font-family="${font}" font-size="17" font-weight="700" fill="${theme.text}">Status</text>`;
    tableSvg += dataRows.map((row, i) => {
      const ry = tableTopY + 40 + i * 50;
      const bg = i % 2 === 0 ? theme.tableBg : theme.tableAlt;
      const statusColor = row.cols[4]?.includes("Over") ? theme.kpiRed :
                          row.cols[4]?.includes("Under") ? theme.kpiGreen : theme.kpiYellow;
      return `
    <rect x="80" y="${ry}" width="1840" height="50" fill="${bg}" />
    <text x="110" y="${ry + 34}" font-family="${font}" font-size="20" font-weight="600" fill="${theme.text}">${esc(row.cols[0])}</text>
    <text x="600" y="${ry + 34}" font-family="${font}" font-size="20" fill="${theme.text}">${esc(row.cols[1])}</text>
    <text x="900" y="${ry + 34}" font-family="${font}" font-size="20" fill="${theme.text}">${esc(row.cols[2])}</text>
    <text x="1200" y="${ry + 34}" font-family="${font}" font-size="20" fill="${theme.text}">${esc(row.cols[3])}</text>
    ${row.cols[4] ? `${roundedRect(1500, ry + 10, 140, 30, 15, statusColor)}<text x="1570" y="${ry + 32}" text-anchor="middle" font-family="${font}" font-size="14" font-weight="700" fill="${darken(statusColor, 0.6)}">${esc(row.cols[4])}</text>` : ""}`;
    }).join("");
  }

  // ── Spending bar chart (fills bottom half instead of orphaned callouts) ──
  const chartStartY = fam === "nurture" ? tableTopY + dataRows.length * 80 + 80
    : fam === "executive" ? tableTopY + 36 + dataRows.length * 42 + 120
    : fam === "editorial" ? tableTopY + 20 + dataRows.length * 56 + 80
    : tableTopY + 40 + dataRows.length * 50 + 80;

  // Horizontal bar chart showing spending by category
  const maxAmount = Math.max(...dataRows.map(r => {
    const val = parseFloat((r.cols[2] || "0").replace(/[$,]/g, "")) || 0;
    return val;
  }), 1);

  const barChartTitle = fam === "executive" ? "SPENDING BREAKDOWN" : fam === "editorial" ? "Spending Breakdown" : "SPENDING BREAKDOWN";
  let barChartSvg = "";

  if (fam === "editorial") {
    barChartSvg += `<text x="1000" y="${chartStartY}" text-anchor="middle" font-family="Georgia, serif" font-size="24" font-weight="600" fill="${theme.text}">${barChartTitle}</text>
    <rect x="600" y="${chartStartY + 10}" width="800" height="2" fill="${theme.accent}" />`;
  } else if (fam === "executive") {
    barChartSvg += `<text x="120" y="${chartStartY}" font-family="${font}" font-size="20" font-weight="700" fill="${theme.text}">${barChartTitle}</text>
    <rect x="120" y="${chartStartY + 8}" width="280" height="2" fill="${theme.accent}" />`;
  } else {
    barChartSvg += `${roundedRect(120, chartStartY - 20, 700, 46, cardR, lighten(theme.kpiGreen, 0.3))}
    <text x="150" y="${chartStartY + 10}" font-family="${font}" font-size="20" font-weight="700" fill="#065F46">${barChartTitle}</text>`;
  }

  const barMaxW = 1200;
  const barBaseX = 500;
  const hBarH = 56;
  const hBarSpacing = 90;
  const barColors = [theme.kpiGreen, theme.kpiBlue || theme.accent, theme.kpiYellow, theme.kpiRed, lighten(theme.primary, 0.3), lighten(theme.accent, 0.3)];

  barChartSvg += dataRows.slice(0, 6).map((row, i) => {
    const barY = chartStartY + 50 + i * hBarSpacing;
    const amount = parseFloat((row.cols[2] || "0").replace(/[$,]/g, "")) || 0;
    const barW = Math.max(40, (amount / maxAmount) * barMaxW);
    const color = barColors[i % barColors.length];

    return `
    <text x="${barBaseX - 20}" y="${barY + hBarH / 2 + 6}" text-anchor="end" font-family="${fam === "editorial" ? "Georgia, serif" : font}" font-size="18" font-weight="600" fill="${theme.text}">${esc(row.cols[0])}</text>
    ${roundedRect(barBaseX, barY, barW, hBarH, fam === "nurture" ? 10 : fam === "editorial" ? 4 : 6, color)}
    <text x="${barBaseX + barW + 16}" y="${barY + hBarH / 2 + 6}" font-family="${fam === "editorial" ? "Georgia, serif" : font}" font-size="18" font-weight="700" fill="${theme.text}">${esc(row.cols[2])}</text>`;
  }).join("");

  // Add feature highlights below bar chart to fill remaining space
  const featureStartY = chartStartY + 50 + dataRows.slice(0, 6).length * hBarSpacing + 60;
  const featureItems = [
    "Auto-calculating formulas",
    "Visual spending breakdown",
    "Monthly budget tracking",
    "Status indicators per category",
  ];
  if (featureStartY < 1700) {
    const featureCols = 2;
    const featureColW = 800;
    barChartSvg += featureItems.map((item, i) => {
      const col = i % featureCols;
      const frow = Math.floor(i / featureCols);
      const fx = 200 + col * featureColW;
      const fy = featureStartY + frow * 60;
      if (fam === "editorial") {
        return `
    <circle cx="${fx}" cy="${fy}" r="6" fill="${theme.accent}" />
    <text x="${fx + 18}" y="${fy + 5}" font-family="Georgia, serif" font-size="20" fill="${theme.text}">${item}</text>`;
      }
      return `
    <circle cx="${fx}" cy="${fy}" r="8" fill="${theme.accent}" />
    <text x="${fx + 20}" y="${fy + 5}" font-family="${font}" font-size="20" fill="${theme.textMuted}">${item}</text>`;
    }).join("");
  }

  const calloutSvg = barChartSvg;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMG_W}" height="${IMG_H}" viewBox="0 0 ${IMG_W} ${IMG_H}">
  <defs>
    <filter id="cardShadow" x="-5%" y="-5%" width="115%" height="115%">
      <feDropShadow dx="0" dy="${fam === "nurture" ? 6 : 4}" stdDeviation="${fam === "nurture" ? 16 : 12}" flood-color="${nicheProfile.imageStyle.cardShadowColor}" />
    </filter>
  </defs>

  <rect width="${IMG_W}" height="${IMG_H}" fill="${theme.bg}" />

  ${titleBarSvg}
  ${kpiSvg}
  ${tableSvg}
  ${calloutSvg}

  <!-- Bottom accent -->
  <rect x="0" y="1990" width="${IMG_W}" height="10" fill="${theme.accent}" opacity="0.2" />
</svg>`;
}

// ── IMAGE 4: FEATURE SHOWCASE ───────────────────────────────

function buildFeatureSvg(
  spec: ListingImageSpec,
  blueprint: ProductBlueprint,
  theme: ImageTheme,
  nicheProfile: NicheDesignProfile
): string {
  const fam = getLayoutFamilyId(nicheProfile.id);
  const font = nicheProfile.typography.fontFamily;
  const cardR = nicheProfile.layout.cardRadius;
  const barStyle = nicheProfile.layout.progressBarStyle;
  const title = spec.title || "Track every goal. See real progress.";
  const subtitle = spec.subtitle || "";

  const savingsTab = blueprint.tabs.find((t) =>
    t.name.toLowerCase().includes("saving") || t.name.toLowerCase().includes("goal")
  );
  const goals = extractSavingsGoals(savingsTab?.sampleRows || []);
  if (goals.length === 0) {
    goals.push(
      { name: "Emergency Fund", target: 5000, saved: 2200, pct: 44 },
      { name: "Goal 2", target: 3000, saved: 1850, pct: 62 },
      { name: "Goal 3", target: 1000, saved: 200, pct: 20 },
      { name: "Goal 4", target: 500, saved: 50, pct: 10 },
    );
  }

  // ── Progress bar rendering per niche ──
  const barRadius = barStyle === "pill" ? 20 : barStyle === "rounded" ? 8 : barStyle === "sharp" ? 2 : 4;
  const barHeight = fam === "nurture" ? 32 : fam === "executive" ? 36 : fam === "editorial" ? 28 : 40;
  const barSpacing = fam === "nurture" ? 120 : fam === "executive" ? 130 : fam === "editorial" ? 110 : 140;

  const chartBars = goals.slice(0, 6).map((g, i) => {
    const barY = 320 + i * barSpacing;
    const barColor = g.pct >= 60 ? theme.kpiGreen : g.pct >= 30 ? theme.kpiYellow : theme.kpiRed;
    const barW = 1400;
    const filledW = Math.max(40, (g.pct / 100) * barW);

    let barSvg = "";
    if (barStyle === "segmented") {
      // Segmented: multiple blocks
      const segCount = 10;
      const segW = (barW - (segCount - 1) * 6) / segCount;
      const filledSegs = Math.round((g.pct / 100) * segCount);
      barSvg = Array.from({ length: segCount }, (_, si) => {
        const sx = 200 + si * (segW + 6);
        const fill = si < filledSegs ? barColor : lighten(barColor, 0.5);
        return `${roundedRect(sx, barY + 16, segW, barHeight, 4, fill)}`;
      }).join("\n    ");
    } else {
      barSvg = `
    ${roundedRect(200, barY + 16, barW, barHeight, barRadius, lighten(barColor, 0.5))}
    ${roundedRect(200, barY + 16, filledW, barHeight, barRadius, barColor)}`;
    }

    // Label and amount text styling per category
    const labelSize = fam === "nurture" ? 22 : fam === "executive" ? 24 : fam === "editorial" ? 22 : 26;
    const amountSize = fam === "nurture" ? 18 : fam === "executive" ? 20 : fam === "editorial" ? 18 : 22;
    const pctText = fam === "executive"
      ? `<text x="1750" y="${barY + barHeight + 16}" text-anchor="end" font-family="${font}" font-size="20" font-weight="800" fill="${darken(barColor, 0.5)}">${g.pct.toFixed(1)}%</text>`
      : `<text x="${210 + (g.pct / 100) * barW}" y="${barY + barHeight / 2 + 22}" font-family="${font}" font-size="16" font-weight="700" fill="${darken(barColor, 0.5)}">${g.pct}%</text>`;

    return `
    <text x="200" y="${barY}" font-family="${font}" font-size="${labelSize}" font-weight="600" fill="${theme.text}">${esc(g.name)}</text>
    <text x="1700" y="${barY}" text-anchor="end" font-family="${font}" font-size="${amountSize}" fill="${theme.textMuted}">$${g.saved.toLocaleString()} / $${g.target.toLocaleString()}</text>
    ${barSvg}
    ${pctText}`;
  }).join("");

  // ── Title — clean text on light background ──
  let titleBarSvg = "";
  if (fam === "nurture") {
    titleBarSvg = `
    <text x="1000" y="80" text-anchor="middle" font-family="${font}" font-size="48" font-weight="800" fill="${theme.text}">${esc(title)}</text>
    <rect x="860" y="96" width="280" height="4" rx="2" fill="${theme.accent}" />`;
  } else if (fam === "executive") {
    titleBarSvg = `
    <text x="1000" y="76" text-anchor="middle" font-family="${font}" font-size="46" font-weight="800" fill="#0F172A">${esc(title)}</text>
    <rect x="880" y="92" width="240" height="3" rx="1" fill="${theme.accent}" />`;
  } else if (fam === "editorial") {
    titleBarSvg = `
    <text x="1000" y="78" text-anchor="middle" font-family="Georgia, serif" font-size="48" font-weight="700" fill="#3D2B1F">${esc(title)}</text>
    <rect x="900" y="96" width="200" height="3" rx="1" fill="${theme.accent}" />`;
  } else {
    titleBarSvg = `
    <text x="1000" y="80" text-anchor="middle" font-family="${font}" font-size="50" font-weight="800" fill="${theme.text}">${esc(title)}</text>
    <rect x="860" y="98" width="280" height="4" rx="2" fill="${theme.accent}" />`;
  }

  // ── Section header per category ──
  let sectionSvg = "";
  if (fam === "nurture") {
    sectionSvg = `
    ${roundedRect(140, 190, 500, 50, cardR, lighten(theme.kpiGreen, 0.3))}
    <text x="180" y="224" font-family="${font}" font-size="22" font-weight="700" fill="#065F46">Savings Goals</text>`;
  } else if (fam === "executive") {
    sectionSvg = `
    <text x="200" y="210" font-family="${font}" font-size="22" font-weight="700" fill="${theme.text}">SAVINGS GOALS PROGRESS</text>
    <rect x="200" y="220" width="300" height="2" fill="${theme.accent}" />`;
  } else if (fam === "editorial") {
    sectionSvg = `
    <text x="1000" y="220" text-anchor="middle" font-family="Georgia, serif" font-size="24" font-weight="600" fill="${theme.text}">Savings Goals</text>
    <rect x="900" y="234" width="200" height="2" fill="${theme.accent}" />`;
  } else {
    sectionSvg = `
    ${roundedRect(140, 200, 1720, 60, 14, theme.cardBg)}
    <text x="200" y="240" font-family="${font}" font-size="26" font-weight="700" fill="${theme.text}">SAVINGS GOALS PROGRESS</text>`;
  }

  // ── Bottom card per category — positioned dynamically after bars ──
  const totalSaved = goals.reduce((s, g) => s + g.saved, 0);
  const totalTarget = goals.reduce((s, g) => s + g.target, 0);
  const lastBarY = 320 + (goals.slice(0, 6).length - 1) * barSpacing + barHeight + 60;
  const bottomCardY = Math.max(lastBarY + 80, 1100); // Ensure minimum spacing

  let bottomCard = "";
  if (fam === "nurture") {
    bottomCard = `
    ${roundedRect(140, bottomCardY, 1720, 120, cardR, theme.kpiGreen)}
    <g transform="translate(200, ${bottomCardY + 50}) scale(1.5)">
      <path d="M0-8C-4-14-14-14-14-6C-14 0-4 8 0 14C4 8 14 0 14-6C14-14 4-14 0-8Z" fill="#065F46" />
    </g>
    <text x="260" y="${bottomCardY + 50}" font-family="${font}" font-size="22" font-weight="600" fill="#065F46">Total Savings</text>
    <text x="260" y="${bottomCardY + 90}" font-family="${font}" font-size="36" font-weight="800" fill="#065F46">$${totalSaved.toLocaleString()} saved of $${totalTarget.toLocaleString()}</text>`;
  } else if (fam === "executive") {
    bottomCard = `
    ${roundedRect(140, bottomCardY, 1720, 100, 8, "#F8FAFC")}
    <rect x="140" y="${bottomCardY}" width="1720" height="4" rx="2" fill="${theme.accent}" />
    <circle cx="210" cy="${bottomCardY + 52}" r="24" fill="${theme.accent}" />
    <text x="210" y="${bottomCardY + 60}" text-anchor="middle" font-family="${font}" font-size="22" font-weight="800" fill="#FFF">$</text>
    <text x="260" y="${bottomCardY + 45}" font-family="${font}" font-size="20" font-weight="600" fill="#0F172A">Total Progress</text>
    <text x="260" y="${bottomCardY + 80}" font-family="${font}" font-size="34" font-weight="800" fill="${theme.accent}">$${totalSaved.toLocaleString()} / $${totalTarget.toLocaleString()}</text>`;
  } else if (fam === "editorial") {
    bottomCard = `
    ${roundedRect(140, bottomCardY, 1720, 110, 4, "#FFFFFF")}
    <rect x="140" y="${bottomCardY}" width="1720" height="4" fill="${theme.accent}" />
    <rect x="140" y="${bottomCardY + 106}" width="1720" height="4" fill="${theme.accent}" />
    <text x="1000" y="${bottomCardY + 45}" text-anchor="middle" font-family="Georgia, serif" font-size="22" font-weight="600" fill="${theme.text}">Total Savings Progress</text>
    <text x="1000" y="${bottomCardY + 85}" text-anchor="middle" font-family="Georgia, serif" font-size="36" font-weight="700" fill="${theme.text}">$${totalSaved.toLocaleString()} saved of $${totalTarget.toLocaleString()}</text>`;
  } else {
    bottomCard = `
    ${roundedRect(140, bottomCardY, 1720, 120, 16, theme.kpiGreen)}
    <text x="200" y="${bottomCardY + 50}" font-family="${font}" font-size="24" font-weight="600" fill="#065F46">Total Savings Progress</text>
    <text x="200" y="${bottomCardY + 90}" font-family="${font}" font-size="40" font-weight="800" fill="#065F46">$${totalSaved.toLocaleString()} saved of $${totalTarget.toLocaleString()} goal</text>`;
  }

  // ── Add a tip/feature section below the bottom card to fill remaining space ──
  const tipY = bottomCardY + 180;
  let tipSvg = "";
  const tipItems = [
    { icon: "✓", text: "Automatic calculations — no manual math" },
    { icon: "✓", text: "Works in Google Sheets, Excel, and Numbers" },
    { icon: "✓", text: "Customize categories to fit your needs" },
  ];
  if (tipY < 1700) {
    if (fam === "editorial") {
      tipSvg = tipItems.map((t, i) => {
        const ty = tipY + i * 60;
        return `
    <circle cx="700" cy="${ty}" r="8" fill="${theme.accent}" />
    <text x="720" y="${ty + 6}" font-family="Georgia, serif" font-size="20" fill="${theme.text}">${t.text}</text>`;
      }).join("");
    } else if (fam === "executive") {
      tipSvg = tipItems.map((t, i) => {
        const ty = tipY + i * 55;
        return `
    <circle cx="220" cy="${ty}" r="6" fill="${theme.accent}" />
    <text x="240" y="${ty + 6}" font-family="${font}" font-size="18" fill="${theme.textMuted}">${t.text}</text>`;
      }).join("");
    } else {
      tipSvg = tipItems.map((t, i) => {
        const ty = tipY + i * 60;
        return `
    <circle cx="220" cy="${ty}" r="10" fill="${lighten(theme.primary, 0.5)}" />
    <text x="244" y="${ty + 6}" font-family="${font}" font-size="20" fill="${theme.text}">${t.text}</text>`;
      }).join("");
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMG_W}" height="${IMG_H}" viewBox="0 0 ${IMG_W} ${IMG_H}">
  <rect width="${IMG_W}" height="${IMG_H}" fill="${theme.bg}" />

  ${titleBarSvg}
  ${subtitle ? `<text x="1000" y="${fam === "nurture" ? 130 : 115}" text-anchor="middle" font-family="${font}" font-size="24" fill="${theme.textMuted}">${esc(subtitle)}</text>` : ""}

  ${sectionSvg}

  <!-- Status legend -->
  <circle cx="1200" cy="${fam === "editorial" ? 220 : 230}" r="8" fill="${theme.kpiGreen}" />
  <text x="1218" y="${fam === "editorial" ? 226 : 236}" font-family="${font}" font-size="16" fill="${theme.textMuted}">On Track</text>
  <circle cx="1380" cy="${fam === "editorial" ? 220 : 230}" r="8" fill="${theme.kpiYellow}" />
  <text x="1398" y="${fam === "editorial" ? 226 : 236}" font-family="${font}" font-size="16" fill="${theme.textMuted}">In Progress</text>
  <circle cx="1560" cy="${fam === "editorial" ? 220 : 230}" r="8" fill="${theme.kpiRed}" />
  <text x="1578" y="${fam === "editorial" ? 226 : 236}" font-family="${font}" font-size="16" fill="${theme.textMuted}">Needs Attention</text>

  ${chartBars}
  ${bottomCard}
  ${tipSvg}

  <rect x="0" y="1990" width="${IMG_W}" height="10" fill="${theme.accent}" opacity="0.2" />
</svg>`;
}

// ── COMPARISON IMAGE ────────────────────────────────────────
// "Before vs After" or "Without vs With" — split layout

function buildComparisonSvg(
  spec: ListingImageSpec,
  theme: ImageTheme,
  nicheProfile: NicheDesignProfile,
  vd?: import("@/types/visual-direction").VisualDirectionSpec,
): string {
  const font = vd?.global.fontFamily === "serif" ? "Georgia, 'Times New Roman', serif"
    : vd?.global.fontFamily === "mono" ? "'Courier New', Courier, monospace"
    : nicheProfile.typography.fontFamily;
  const title = spec.title || "See the difference.";
  const subtitle = spec.subtitle || "";

  const g = vd?.global || { backgroundMode: "gradient" as const, gradientAngle: 180, gradientStops: ["#F8F9FA", "#FFFFFF"] as [string, string], decorStyle: "none" as const, decorOpacity: 0.05, fontFamily: "sans" as const, density: "balanced" as const };

  const bgStart = g.gradientStops[0];
  const bgEnd = g.gradientStops[1];

  // Left = "Without" (muted, gray), Right = "With" (vibrant, product)
  const leftItems = ["Scattered receipts", "No visibility into spending", "Surprise bills", "Stress at month-end"];
  const rightItems = ["Every dollar tracked", "Visual budget breakdown", "Bills auto-scheduled", "Confidence and clarity"];

  const leftSvg = leftItems.map((item, i) => {
    const y = 500 + i * 120;
    return `<circle cx="160" cy="${y}" r="18" fill="#EF4444" />
    <text x="160" y="${y + 7}" text-anchor="middle" font-family="${font}" font-size="18" font-weight="700" fill="#FFF">✕</text>
    <text x="200" y="${y + 8}" font-family="${font}" font-size="26" fill="#6B7280">${esc(item)}</text>`;
  }).join("\n  ");

  const rightSvg = rightItems.map((item, i) => {
    const y = 500 + i * 120;
    return `<circle cx="1080" cy="${y}" r="18" fill="${theme.kpiGreen}" />
    <text x="1080" y="${y + 7}" text-anchor="middle" font-family="${font}" font-size="18" font-weight="700" fill="#FFF">✓</text>
    <text x="1120" y="${y + 8}" font-family="${font}" font-size="26" font-weight="600" fill="${theme.text}">${esc(item)}</text>`;
  }).join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMG_W}" height="${IMG_H}" viewBox="0 0 ${IMG_W} ${IMG_H}">
  <defs>
    <linearGradient id="bgGradComp" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${bgStart}" />
      <stop offset="100%" stop-color="${bgEnd}" />
    </linearGradient>
  </defs>
  <rect width="${IMG_W}" height="${IMG_H}" fill="url(#bgGradComp)" />

  <!-- Title -->
  <text x="1000" y="110" text-anchor="middle" font-family="${font}" font-size="56" font-weight="800" fill="${theme.text}">${esc(title)}</text>
  <rect x="880" y="128" width="240" height="4" rx="2" fill="${theme.accent}" />
  ${subtitle ? `<text x="1000" y="180" text-anchor="middle" font-family="${font}" font-size="24" fill="${theme.textMuted}">${esc(subtitle)}</text>` : ""}

  <!-- Divider -->
  <line x1="1000" y1="260" x2="1000" y2="1700" stroke="#E2E8F0" stroke-width="3" stroke-dasharray="10 8" />

  <!-- Left: Without -->
  ${roundedRect(80, 260, 860, 160, 20, "#FEE2E2")}
  <text x="510" y="360" text-anchor="middle" font-family="${font}" font-size="36" font-weight="800" fill="#991B1B">WITHOUT</text>

  <!-- Right: With -->
  ${roundedRect(1060, 260, 860, 160, 20, lighten(theme.kpiGreen, 0.85))}
  <text x="1490" y="360" text-anchor="middle" font-family="${font}" font-size="36" font-weight="800" fill="#065F46">WITH THIS SYSTEM</text>

  ${leftSvg}
  ${rightSvg}

  <!-- Bottom CTA -->
  ${roundedRect(600, 1760, 800, 90, 16, theme.accent)}
  <text x="1000" y="1815" text-anchor="middle" font-family="${font}" font-size="28" font-weight="700" fill="#FFFFFF">Make the switch today →</text>

  <rect x="0" y="1990" width="${IMG_W}" height="10" fill="${theme.accent}" opacity="0.2" />
</svg>`;
}

// ── IMAGE 5: METHOD / HOW IT WORKS ──────────────────────────
// Layout driven by vd.method: horizontal-cards | vertical-timeline | numbered-list | zigzag | icon-grid

function buildMethodSvg(
  spec: ListingImageSpec,
  blueprint: ProductBlueprint,
  theme: ImageTheme,
  nicheProfile: NicheDesignProfile,
  vd?: import("@/types/visual-direction").VisualDirectionSpec,
): string {
  const m = vd?.method || { stepCount: 3, layout: "horizontal-cards" as const, connector: "arrow" as const, cardShape: "rounded" as const, showIcons: true };
  const g = vd?.global || { backgroundMode: "gradient" as const, gradientAngle: 180, gradientStops: ["#F8F9FA", "#FFFFFF"] as [string, string], decorStyle: "none" as const, decorOpacity: 0.05, fontFamily: "sans" as const, density: "balanced" as const };

  const font = g.fontFamily === "serif" ? "Georgia, 'Times New Roman', serif"
    : g.fontFamily === "mono" ? "'Courier New', Courier, monospace"
    : nicheProfile.typography.fontFamily;
  const title = spec.title || "Save first. Spend smarter.";
  const subtitle = spec.subtitle || "";
  const tabCount = new Set(blueprint.tabs.map(t => t.name.toLowerCase())).size;

  // Extract budget categories for display
  const budgetTab = blueprint.tabs.find((t) => t.name.toLowerCase().includes("budget") && (t.name.toLowerCase().includes("setup") || t.name.toLowerCase().includes("categor") || t.name.toLowerCase().includes("overview")));
  const dashTab = blueprint.tabs.find((t) => t.name.toLowerCase().includes("dashboard"));
  const txnTab = blueprint.tabs.find((t) => t.name.toLowerCase().includes("transaction"));
  const bucketIcons = [
    `<circle cx="0" cy="0" r="16" fill="${theme.accent}" /><text x="0" y="6" text-anchor="middle" font-family="Arial" font-size="18" font-weight="800" fill="#FFF">$</text>`,
    `<rect x="-14" y="-12" width="28" height="24" rx="4" fill="${theme.primary}" /><rect x="-8" y="-16" width="16" height="8" rx="2" fill="${theme.primary}" />`,
    `<circle cx="0" cy="0" r="16" fill="none" stroke="${theme.accent}" stroke-width="3" /><circle cx="0" cy="0" r="4" fill="${theme.accent}" />`,
    `<rect x="-16" y="6" width="8" height="14" fill="${theme.primary}" /><rect x="-4" y="-4" width="8" height="24" fill="${theme.primary}" /><rect x="8" y="-14" width="8" height="34" fill="${theme.primary}" />`,
  ];
  const hasReal = (cats: Array<{amount: string}>) => cats.some((c) => c.amount !== "$0" && c.amount !== "$0.00" && c.amount !== "0");
  let rawCategories = extractBudgetCategories(budgetTab?.sampleRows || [], m.stepCount + 1);
  if ((rawCategories.length === 0 || !hasReal(rawCategories)) && dashTab?.sampleRows) {
    const dc = extractBudgetFromDashboard(dashTab.sampleRows, m.stepCount + 1);
    if (dc.length > 0 && hasReal(dc)) rawCategories = dc;
  }
  if ((rawCategories.length === 0 || !hasReal(rawCategories)) && txnTab?.sampleRows) rawCategories = deriveBudgetFromTransactions(txnTab.sampleRows, m.stepCount + 1);
  const buckets = rawCategories.map((c, i) => ({ name: c.name, amount: c.amount, iconSvg: bucketIcons[i % bucketIcons.length] }));
  if (buckets.length < 3) {
    buckets.length = 0;
    buckets.push({ name: "Savings", iconSvg: bucketIcons[0], amount: "25%" }, { name: "Needs", iconSvg: bucketIcons[1], amount: "35%" }, { name: "Wants", iconSvg: bucketIcons[2], amount: "20%" }, { name: "Bills", iconSvg: bucketIcons[3], amount: "20%" });
  }

  const steps = Array.from({ length: m.stepCount }, (_, i) => {
    const defaults = [
      { num: "1", label: "Download", desc: "Instant delivery to your inbox" },
      { num: "2", label: "Customize", desc: "Add your own categories and goals" },
      { num: "3", label: "Track", desc: "Watch your progress in real-time" },
      { num: "4", label: "Review", desc: "Check your monthly trends" },
      { num: "5", label: "Optimize", desc: "Refine and improve over time" },
    ];
    return defaults[i] || defaults[2];
  });

  const cardR = m.cardShape === "rounded" ? 20 : m.cardShape === "pill" ? 40 : m.cardShape === "circle" ? 999 : 4;

  // Background
  const bgStart = g.gradientStops[0];
  const bgEnd = g.gradientStops[1];
  const angle = g.gradientAngle;
  const gradX1 = Math.cos((angle - 90) * Math.PI / 180) * 0.5 + 0.5;
  const gradY1 = Math.sin((angle - 90) * Math.PI / 180) * 0.5 + 0.5;
  const gradX2 = 1 - gradX1;
  const gradY2 = 1 - gradY1;

  const decorSvg = g.decorStyle !== "none" ? renderDecorativeElements(g.decorStyle, theme.accent, g.decorOpacity) : "";

  // Connector builder
  const buildConnector = (x1: number, y1: number, x2: number, y2: number): string => {
    switch (m.connector) {
      case "arrow": return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${theme.accent}" stroke-width="3" marker-end="url(#arrowM)" />`;
      case "dotted": return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${theme.accent}" stroke-width="3" stroke-dasharray="8 6" />`;
      case "numbered": return ""; // Numbers are already on cards
      case "none": return "";
      default: return "";
    }
  };

  let contentSvg = "";

  // ── LAYOUT: horizontal-cards ──
  if (m.layout === "horizontal-cards") {
    const cardW = Math.floor(1600 / m.stepCount);
    const gap = Math.floor((1800 - cardW * m.stepCount) / (m.stepCount + 1));
    contentSvg += `<text x="1000" y="90" text-anchor="middle" font-family="${font}" font-size="56" font-weight="800" fill="${theme.text}">${esc(title)}</text>`;
    contentSvg += `<rect x="880" y="108" width="240" height="4" rx="2" fill="${theme.accent}" />`;
    if (subtitle) contentSvg += `<text x="1000" y="155" text-anchor="middle" font-family="${font}" font-size="26" fill="${theme.textMuted}">${esc(subtitle)}</text>`;

    // Budget buckets row — clean cards with accent top border
    const bucketsY = 190;
    contentSvg += buckets.slice(0, 4).map((b, i) => {
      const bx = 120 + i * 450;
      const kpiColors = [theme.accent, theme.kpiGreen, theme.kpiBlue, theme.kpiYellow];
      return `${roundedRect(bx, bucketsY, 420, 100, 12, "#FFFFFF")}
    <rect x="${bx}" y="${bucketsY}" width="420" height="4" rx="2" fill="${kpiColors[i % kpiColors.length]}" />
    <g transform="translate(${bx + 40}, ${bucketsY + 50})">${b.iconSvg}</g>
    <text x="${bx + 80}" y="${bucketsY + 42}" font-family="${font}" font-size="22" font-weight="700" fill="${theme.text}">${esc(b.name)}</text>
    <text x="${bx + 80}" y="${bucketsY + 78}" font-family="${font}" font-size="32" font-weight="800" fill="${theme.accent}">${esc(b.amount)}</text>`;
    }).join("\n  ");

    // Step cards — large numbers, clean white cards with shadow
    const stepsY = 340;
    const stepCardH = 520;
    contentSvg += steps.map((s, i) => {
      const cx = 100 + gap + i * (cardW + gap);
      return `
    <g filter="url(#cardShadow5)">
    ${roundedRect(cx, stepsY, cardW - 20, stepCardH, 20, "#FFFFFF")}
    <rect x="${cx}" y="${stepsY}" width="${cardW - 20}" height="5" rx="3" fill="${theme.accent}" />
    <circle cx="${cx + (cardW - 20) / 2}" cy="${stepsY + 90}" r="50" fill="${theme.accent}" />
    <text x="${cx + (cardW - 20) / 2}" y="${stepsY + 106}" text-anchor="middle" font-family="${font}" font-size="40" font-weight="800" fill="#FFFFFF">${s.num}</text>
    ${m.showIcons ? `<g transform="translate(${cx + (cardW - 20) / 2}, ${stepsY + 190}) scale(1.3)">${bucketIcons[i % bucketIcons.length]}</g>` : ""}
    <text x="${cx + (cardW - 20) / 2}" y="${stepsY + 280}" text-anchor="middle" font-family="${font}" font-size="32" font-weight="700" fill="${theme.text}">${esc(s.label)}</text>
    <text x="${cx + (cardW - 20) / 2}" y="${stepsY + 330}" text-anchor="middle" font-family="${font}" font-size="20" fill="${theme.textMuted}">${esc(s.desc)}</text>
    </g>
    ${i < m.stepCount - 1 ? buildConnector(cx + cardW - 10, stepsY + stepCardH / 2, cx + cardW + gap - 10, stepsY + stepCardH / 2) : ""}`;
    }).join("");

    const badgeY = stepsY + stepCardH + 50;
    contentSvg += `${roundedRect(550, badgeY, 900, 80, 20, lighten(theme.accent, 0.88))}
    <rect x="550" y="${badgeY}" width="900" height="4" rx="2" fill="${theme.accent}" />
    <text x="1000" y="${badgeY + 52}" text-anchor="middle" font-family="${font}" font-size="30" font-weight="700" fill="${theme.text}">${tabCount} Professional Tabs Included</text>`;
  }

  // ── LAYOUT: vertical-timeline ──
  else if (m.layout === "vertical-timeline") {
    contentSvg += `<text x="1000" y="80" text-anchor="middle" font-family="${font}" font-size="54" font-weight="800" fill="${theme.text}">${esc(title)}</text>`;
    contentSvg += `<rect x="880" y="96" width="240" height="3" rx="1" fill="${theme.accent}" />`;
    if (subtitle) contentSvg += `<text x="1000" y="140" text-anchor="middle" font-family="${font}" font-size="24" fill="${theme.textMuted}">${esc(subtitle)}</text>`;

    // Vertical timeline line
    const timelineX = 300;
    const startY = 180;
    const stepH = Math.floor(1400 / m.stepCount);
    contentSvg += `<line x1="${timelineX}" y1="${startY}" x2="${timelineX}" y2="${startY + stepH * m.stepCount}" stroke="${theme.accent}" stroke-width="4" ${m.connector === "dotted" ? 'stroke-dasharray="10 8"' : ""} />`;

    contentSvg += steps.map((s, i) => {
      const cy = startY + i * stepH;
      return `
    <circle cx="${timelineX}" cy="${cy + 30}" r="32" fill="${theme.accent}" />
    <text x="${timelineX}" y="${cy + 42}" text-anchor="middle" font-family="${font}" font-size="26" font-weight="800" fill="#FFFFFF">${s.num}</text>
    ${roundedRect(timelineX + 60, cy, 1500, stepH - 30, cardR, "#FFFFFF")}
    <text x="${timelineX + 100}" y="${cy + 50}" font-family="${font}" font-size="32" font-weight="700" fill="${theme.text}">${esc(s.label)}</text>
    <text x="${timelineX + 100}" y="${cy + 90}" font-family="${font}" font-size="20" fill="${theme.textMuted}">${esc(s.desc)}</text>`;
    }).join("");

    // Budget summary at bottom
    const bucketsY = startY + stepH * m.stepCount + 40;
    contentSvg += buckets.slice(0, 4).map((b, i) => {
      const bx = 120 + i * 460;
      return `${roundedRect(bx, bucketsY, 420, 90, cardR, "#FFFFFF")}
    <text x="${bx + 210}" y="${bucketsY + 38}" text-anchor="middle" font-family="${font}" font-size="20" font-weight="700" fill="${theme.text}">${esc(b.name)}</text>
    <text x="${bx + 210}" y="${bucketsY + 72}" text-anchor="middle" font-family="${font}" font-size="28" font-weight="800" fill="${theme.primary}">${esc(b.amount)}</text>`;
    }).join("\n  ");
  }

  // ── LAYOUT: numbered-list ──
  else if (m.layout === "numbered-list") {
    // Dense, compact layout — executive style (clean light)
    contentSvg += `<text x="1000" y="80" text-anchor="middle" font-family="${font}" font-size="52" font-weight="800" fill="#0F172A">${esc(title)}</text>
    ${subtitle ? `<text x="1000" y="130" text-anchor="middle" font-family="${font}" font-size="24" fill="${theme.textMuted}">${esc(subtitle)}</text>` : ""}
    <rect x="860" y="95" width="280" height="3" rx="1" fill="${theme.accent}" />`;

    // Numbered rows
    const startY = 230;
    const rowH = Math.floor(600 / m.stepCount);
    contentSvg += steps.map((s, i) => {
      const ry = startY + i * rowH;
      const bg = i % 2 === 0 ? "#FFFFFF" : theme.tableAlt;
      return `
    <rect x="120" y="${ry}" width="1760" height="${rowH - 10}" rx="4" fill="${bg}" />
    <text x="180" y="${ry + rowH / 2 + 8}" font-family="${font}" font-size="56" font-weight="800" fill="${lighten(theme.primary, 0.7)}">${s.num}</text>
    <text x="280" y="${ry + rowH / 2 - 4}" font-family="${font}" font-size="30" font-weight="700" fill="${theme.text}">${esc(s.label)}</text>
    <text x="280" y="${ry + rowH / 2 + 32}" font-family="${font}" font-size="18" fill="${theme.textMuted}">${esc(s.desc)}</text>`;
    }).join("");

    // Budget allocation table below
    const tableY = startY + rowH * m.stepCount + 40;
    contentSvg += `<text x="120" y="${tableY}" font-family="${font}" font-size="18" font-weight="700" fill="${theme.text}">BUDGET ALLOCATION</text>
    <rect x="120" y="${tableY + 8}" width="220" height="2" fill="${theme.accent}" />`;
    contentSvg += `${roundedRect(120, tableY + 24, 1760, 30, 4, "#F1F5F9")}
    <text x="140" y="${tableY + 44}" font-family="${font}" font-size="13" font-weight="700" fill="#475569">Category</text>
    <text x="1700" y="${tableY + 44}" font-family="${font}" font-size="13" font-weight="700" fill="#475569" text-anchor="end">Amount</text>`;
    contentSvg += buckets.map((b, i) => {
      const ry = tableY + 54 + i * 36;
      return `<rect x="120" y="${ry}" width="1760" height="36" fill="${i % 2 === 0 ? theme.tableBg : theme.tableAlt}" />
    <text x="140" y="${ry + 24}" font-family="${font}" font-size="16" fill="${theme.text}">${esc(b.name)}</text>
    <text x="1700" y="${ry + 24}" font-family="${font}" font-size="16" font-weight="600" fill="${theme.primary}" text-anchor="end">${esc(b.amount)}</text>`;
    }).join("\n  ");

    const badgeY = tableY + 54 + buckets.length * 36 + 30;
    contentSvg += `${roundedRect(600, badgeY, 800, 60, 4, theme.primaryLight)}
    <text x="1000" y="${badgeY + 38}" text-anchor="middle" font-family="${font}" font-size="24" font-weight="700" fill="${theme.primary}">${tabCount} Tabs Included</text>`;
  }

  // ── LAYOUT: zigzag ──
  else if (m.layout === "zigzag") {
    contentSvg += `<text x="1000" y="80" text-anchor="middle" font-family="${font}" font-size="54" font-weight="800" fill="${theme.text}">${esc(title)}</text>`;
    contentSvg += `<rect x="880" y="96" width="240" height="4" rx="2" fill="${theme.accent}" />`;
    if (subtitle) contentSvg += `<text x="1000" y="140" text-anchor="middle" font-family="${font}" font-size="24" fill="${theme.textMuted}">${esc(subtitle)}</text>`;

    const startY = 220;
    const stepH = Math.floor(1200 / m.stepCount);
    contentSvg += steps.map((s, i) => {
      const isLeft = i % 2 === 0;
      const cardX = isLeft ? 120 : 900;
      const numX = isLeft ? 820 : 830;
      const cy = startY + i * stepH;
      return `
    ${roundedRect(cardX, cy, 980, stepH - 30, cardR, "#FFFFFF")}
    <circle cx="${numX}" cy="${cy + (stepH - 30) / 2}" r="40" fill="${theme.accent}" />
    <text x="${numX}" y="${cy + (stepH - 30) / 2 + 12}" text-anchor="middle" font-family="${font}" font-size="32" font-weight="800" fill="#FFFFFF">${s.num}</text>
    <text x="${cardX + 50}" y="${cy + 55}" font-family="${font}" font-size="30" font-weight="700" fill="${theme.text}">${esc(s.label)}</text>
    <text x="${cardX + 50}" y="${cy + 95}" font-family="${font}" font-size="20" fill="${theme.textMuted}">${esc(s.desc)}</text>
    ${m.showIcons ? `<g transform="translate(${cardX + 50}, ${cy + 140})">${bucketIcons[i % bucketIcons.length]}</g>` : ""}
    ${i < m.stepCount - 1 ? buildConnector(numX, cy + stepH - 30, numX, cy + stepH) : ""}`;
    }).join("");

    // Budget strip at bottom
    const bucketsY = startY + stepH * m.stepCount + 10;
    contentSvg += buckets.slice(0, 4).map((b, i) => {
      const bx = 120 + i * 460;
      return `${roundedRect(bx, bucketsY, 420, 90, cardR, "#FFFFFF")}
    <text x="${bx + 210}" y="${bucketsY + 38}" text-anchor="middle" font-family="${font}" font-size="18" font-weight="700" fill="${theme.text}">${esc(b.name)}: ${esc(b.amount)}</text>`;
    }).join("\n  ");
  }

  // ── LAYOUT: icon-grid ──
  else if (m.layout === "icon-grid") {
    contentSvg += `<text x="1000" y="80" text-anchor="middle" font-family="${font}" font-size="54" font-weight="800" fill="${theme.text}">${esc(title)}</text>
    <rect x="860" y="96" width="280" height="4" rx="2" fill="${theme.accent}" />
    ${subtitle ? `<text x="1000" y="140" text-anchor="middle" font-family="${font}" font-size="26" fill="${theme.textMuted}">${esc(subtitle)}</text>` : ""}`;

    // Grid of large icon cards
    const cols = m.stepCount <= 3 ? m.stepCount : Math.ceil(m.stepCount / 2);
    const rows = Math.ceil(m.stepCount / cols);
    const cardW = Math.floor(1600 / cols);
    const cardH = Math.floor(800 / rows);
    const gridY = 260;

    contentSvg += steps.map((s, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = 200 + col * cardW;
      const cy = gridY + row * (cardH + 30);
      return `
    ${roundedRect(cx, cy, cardW - 40, cardH, cardR, "#FFFFFF")}
    ${m.showIcons ? `<g transform="translate(${cx + (cardW - 40) / 2}, ${cy + 60}) scale(2)">${bucketIcons[i % bucketIcons.length]}</g>` : ""}
    <circle cx="${cx + (cardW - 40) / 2}" cy="${cy + 120}" r="24" fill="${theme.accent}" />
    <text x="${cx + (cardW - 40) / 2}" y="${cy + 130}" text-anchor="middle" font-family="${font}" font-size="20" font-weight="800" fill="#FFFFFF">${s.num}</text>
    <text x="${cx + (cardW - 40) / 2}" y="${cy + 180}" text-anchor="middle" font-family="${font}" font-size="26" font-weight="700" fill="${theme.text}">${esc(s.label)}</text>
    <text x="${cx + (cardW - 40) / 2}" y="${cy + 220}" text-anchor="middle" font-family="${font}" font-size="16" fill="${theme.textMuted}">${esc(s.desc)}</text>`;
    }).join("");

    // Buckets row below grid
    const bucketsY = gridY + rows * (cardH + 30) + 30;
    contentSvg += buckets.slice(0, 4).map((b, i) => {
      const bx = 120 + i * 450;
      return `${roundedRect(bx, bucketsY, 420, 110, cardR, "#FFFFFF")}
    <g transform="translate(${bx + 40}, ${bucketsY + 55})">${b.iconSvg}</g>
    <text x="${bx + 80}" y="${bucketsY + 48}" font-family="${font}" font-size="20" font-weight="700" fill="${theme.text}">${esc(b.name)}</text>
    <text x="${bx + 80}" y="${bucketsY + 82}" font-family="${font}" font-size="28" font-weight="800" fill="${theme.primary}">${esc(b.amount)}</text>`;
    }).join("\n  ");

    const badgeY = bucketsY + 140;
    contentSvg += `${roundedRect(550, badgeY, 900, 80, 20, lighten(theme.accent, 0.88))}
    <rect x="550" y="${badgeY}" width="900" height="4" rx="2" fill="${theme.accent}" />
    <text x="1000" y="${badgeY + 52}" text-anchor="middle" font-family="${font}" font-size="30" font-weight="800" fill="${theme.text}">${tabCount} Professional Tabs — Ready to Use</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMG_W}" height="${IMG_H}" viewBox="0 0 ${IMG_W} ${IMG_H}">
  <defs>
    <linearGradient id="bgGrad5" x1="${gradX1}" y1="${gradY1}" x2="${gradX2}" y2="${gradY2}">
      <stop offset="0%" stop-color="${bgStart}" />
      <stop offset="100%" stop-color="${bgEnd}" />
    </linearGradient>
    <marker id="arrowM" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="${theme.accent}" /></marker>
    <filter id="cardShadow5" x="-5%" y="-5%" width="115%" height="115%">
      <feDropShadow dx="0" dy="4" stdDeviation="10" flood-color="${nicheProfile.imageStyle.cardShadowColor}" />
    </filter>
  </defs>

  <rect width="${IMG_W}" height="${IMG_H}" fill="url(#bgGrad5)" />
  ${decorSvg}

  ${contentSvg}

  <rect x="0" y="1990" width="${IMG_W}" height="10" fill="${theme.accent}" opacity="0.2" />
</svg>`;
}

// ── IMAGE 6: WHAT'S INCLUDED ────────────────────────────────
// Layout driven by vd.included: columns (2-4), cardStyle (bordered/filled/minimal/icon-left), showCountBadge

function buildIncludedSvg(
  spec: ListingImageSpec,
  blueprint: ProductBlueprint,
  theme: ImageTheme,
  nicheProfile: NicheDesignProfile,
  vd?: import("@/types/visual-direction").VisualDirectionSpec,
): string {
  const inc = vd?.included || { columns: 2, cardStyle: "bordered" as const, showCountBadge: true };
  const gSpec = vd?.global || { backgroundMode: "gradient" as const, gradientAngle: 180, gradientStops: ["#F8F9FA", "#FFFFFF"] as [string, string], decorStyle: "none" as const, decorOpacity: 0.05, fontFamily: "sans" as const, density: "balanced" as const };

  const font = gSpec.fontFamily === "serif" ? "Georgia, 'Times New Roman', serif"
    : gSpec.fontFamily === "mono" ? "'Courier New', Courier, monospace"
    : nicheProfile.typography.fontFamily;

  let title = spec.title || "";

  // Polished icon library (Heroicons-style SVG paths at 24x24 scale, centered at 0,0)
  const tabIconSvgs: Record<string, string> = {
    dashboard: `<g transform="translate(-12,-12)" fill="none" stroke="${theme.primary}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" fill="${theme.accent}" opacity="0.2" /><rect x="14" y="3" width="7" height="4" rx="1.5" /><rect x="14" y="10" width="7" height="11" rx="1.5" fill="${theme.primary}" opacity="0.12" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></g>`,
    transaction: `<g transform="translate(-12,-12)" fill="none" stroke="${theme.primary}" stroke-width="1.8" stroke-linecap="round"><path d="M3 10h18M3 14h18M3 6h18M3 18h18" /><rect x="3" y="3" width="18" height="18" rx="2" stroke-width="1.8" /><circle cx="7" cy="10" r="1" fill="${theme.accent}" /><circle cx="7" cy="14" r="1" fill="${theme.accent}" /></g>`,
    budget: `<g transform="translate(-12,-12)" fill="none" stroke="${theme.primary}" stroke-width="1.8"><circle cx="12" cy="12" r="9" fill="${theme.accent}" opacity="0.15" /><path d="M12 6v12M9 8.5c0-1.1 1.3-2 3-2s3 .9 3 2c0 1.7-3 1.3-3 3M9 17.5c0 1.1 1.3 2 3 2s3-.9 3-2c0-1.7-3-1.3-3-3" stroke="${theme.primary}" stroke-linecap="round" /></g>`,
    saving: `<g transform="translate(-12,-12)" fill="none" stroke="${theme.primary}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16" /><path d="M3 21h18" /><path d="M9 7h2m-2 4h6m-6 4h4" /><rect x="13" y="7" width="3" height="3" rx="0.5" fill="${theme.accent}" opacity="0.2" /></g>`,
    setup: `<g transform="translate(-12,-12)" fill="none" stroke="${theme.primary}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3" fill="${theme.accent}" opacity="0.2" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></g>`,
    instruction: `<g transform="translate(-12,-12)" fill="none" stroke="${theme.primary}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" fill="${theme.accent}" opacity="0.08" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="14" y2="17" /><line x1="8" y1="9" x2="10" y2="9" /></g>`,
    summary: `<g transform="translate(-12,-12)" fill="none" stroke="${theme.primary}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></g>`,
    checklist: `<g transform="translate(-12,-12)" fill="none" stroke="${theme.primary}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" fill="${theme.accent}" opacity="0.08" /></g>`,
    calendar: `<g transform="translate(-12,-12)" fill="none" stroke="${theme.primary}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><rect x="7" y="13" width="3" height="3" rx="0.5" fill="${theme.accent}" opacity="0.25" /></g>`,
    chart: `<g transform="translate(-12,-12)" fill="none" stroke="${theme.primary}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /><rect x="4" y="14" width="4" height="6" rx="1" fill="${theme.accent}" opacity="0.15" /><rect x="10" y="4" width="4" height="16" rx="1" fill="${theme.primary}" opacity="0.1" /><rect x="16" y="10" width="4" height="10" rx="1" fill="${theme.accent}" opacity="0.15" /></g>`,
    goal: `<g transform="translate(-12,-12)" fill="none" stroke="${theme.primary}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" fill="${theme.accent}" opacity="0.1" /><circle cx="12" cy="12" r="2" fill="${theme.accent}" /></g>`,
  };

  function getIconSvg(tabName: string): string {
    const lower = tabName.toLowerCase();
    // Extended keyword matching for better icon selection
    const keywordMap: Record<string, string[]> = {
      dashboard: ["dashboard", "overview", "summary", "home"],
      transaction: ["transaction", "log", "entry", "record", "expense"],
      budget: ["budget", "money", "income", "spend", "cost", "payment", "bill"],
      saving: ["saving", "goal", "target", "fund", "reserve"],
      setup: ["setup", "setting", "config", "preference"],
      instruction: ["instruction", "guide", "help", "how", "readme", "info"],
      checklist: ["checklist", "list", "pack", "todo", "task", "gear"],
      calendar: ["calendar", "schedule", "timeline", "date", "plan", "itinerary"],
      chart: ["chart", "graph", "analytics", "report", "comparison", "trend"],
      goal: ["milestone", "progress", "tracker", "habit", "streak"],
    };
    for (const [iconKey, keywords] of Object.entries(keywordMap)) {
      if (keywords.some(kw => lower.includes(kw))) {
        return tabIconSvgs[iconKey] || tabIconSvgs.dashboard;
      }
    }
    return tabIconSvgs.dashboard;
  }

  // Deduplicate tabs by name
  const seenTabNames = new Set<string>();
  const tabs = blueprint.tabs
    .filter((t) => {
      const lower = t.name.toLowerCase();
      if (seenTabNames.has(lower)) return false;
      seenTabNames.add(lower);
      return true;
    })
    .map((t) => ({
      name: t.name,
      iconSvg: getIconSvg(t.name),
      purpose: t.purpose.length > 50 ? t.purpose.substring(0, 47) + "..." : t.purpose,
    }));

  if (!title || /^\d+ tabs\./.test(title)) {
    title = `${tabs.length} tabs. One complete system.`;
  }

  // Background gradient
  const bgStart = gSpec.gradientStops[0];
  const bgEnd = gSpec.gradientStops[1];
  const angle = gSpec.gradientAngle;
  const gradX1 = Math.cos((angle - 90) * Math.PI / 180) * 0.5 + 0.5;
  const gradY1 = Math.sin((angle - 90) * Math.PI / 180) * 0.5 + 0.5;
  const gradX2 = 1 - gradX1;
  const gradY2 = 1 - gradY1;

  const decorSvg = gSpec.decorStyle !== "none" ? renderDecorativeElements(gSpec.decorStyle, theme.accent, gSpec.decorOpacity) : "";

  // Use spec columns
  const cols = inc.columns;
  const colWidth = Math.floor(1700 / cols);
  const startX = Math.floor((IMG_W - cols * colWidth - (cols - 1) * 30) / 2);

  // ── Title — large clean text ──
  const titleSvg = `
    <text x="1000" y="90" text-anchor="middle" font-family="${font}" font-size="58" font-weight="800" fill="${theme.text}">${esc(title)}</text>
    <text x="1000" y="140" text-anchor="middle" font-family="${font}" font-size="24" fill="${theme.textMuted}">Everything you need to get organized — all in one file</text>
    <rect x="880" y="160" width="240" height="4" rx="2" fill="${theme.accent}" />`;

  // ── Card layout — 2-column grid, large cards with centered icon + name + description ──
  // This is the clean infographic style used by top Etsy sellers
  const gridCols = Math.min(cols, 2); // Force 2 columns for readability
  const gridGapX = 40;
  const gridGapY = 30;
  const cardW = Math.floor((1760 - gridGapX * (gridCols - 1)) / gridCols);
  const gridStartX = Math.floor((IMG_W - gridCols * cardW - (gridCols - 1) * gridGapX) / 2);
  const gridStartY = 200;
  const numCardRows = Math.ceil(tabs.length / gridCols);
  // Dynamic card height to fill available space
  const maxCardH = Math.floor((IMG_H - gridStartY - 200) / numCardRows - gridGapY);
  const cardH = Math.max(150, Math.min(280, maxCardH));

  const tabCardsSvg = tabs.map((tab, i) => {
    const col = i % gridCols;
    const row = Math.floor(i / gridCols);
    const cx = gridStartX + col * (cardW + gridGapX);
    const cy = gridStartY + row * (cardH + gridGapY);

    // Accent color per card (cycles through KPI colors for variety)
    const kpiColorOptions = [theme.accent, theme.kpiGreen, theme.kpiBlue, theme.kpiYellow];
    const cardAccent = kpiColorOptions[i % kpiColorOptions.length];

    return `<g filter="url(#cardShadow6)">
      ${roundedRect(cx, cy, cardW, cardH, 16, "#FFFFFF")}
      <rect x="${cx}" y="${cy}" width="${cardW}" height="5" rx="3" fill="${cardAccent}" />
      <g transform="translate(${cx + 36}, ${cy + cardH / 2 - 4}) scale(1.6)">${tab.iconSvg}</g>
      <text x="${cx + 90}" y="${cy + cardH / 2 - 12}" font-family="${font}" font-size="26" font-weight="700" fill="${theme.text}">${esc(tab.name)}</text>
      <text x="${cx + 90}" y="${cy + cardH / 2 + 18}" font-family="${font}" font-size="17" fill="${theme.textMuted}">${esc(tab.purpose)}</text>
      <circle cx="${cx + cardW - 40}" cy="${cy + cardH / 2}" r="16" fill="${lighten(cardAccent, 0.85)}" />
      <text x="${cx + cardW - 40}" y="${cy + cardH / 2 + 6}" text-anchor="middle" font-family="${font}" font-size="16" font-weight="700" fill="${cardAccent}">✓</text>
    </g>`;
  }).join("\n");

  // ── Count badge at bottom ──
  const badgeY = gridStartY + numCardRows * (cardH + gridGapY) + 20;
  const badgeSvg = inc.showCountBadge
    ? `${roundedRect(500, badgeY, 1000, 90, 20, lighten(theme.accent, 0.88))}
    <rect x="500" y="${badgeY}" width="1000" height="4" rx="2" fill="${theme.accent}" />
    <text x="1000" y="${badgeY + 56}" text-anchor="middle" font-family="${font}" font-size="32" font-weight="800" fill="${theme.text}">${tabs.length} Professional Tabs — Ready to Use</text>`
    : "";

  // ── Trust strip at very bottom ──
  const trustY = Math.min(badgeY + 130, 1870);
  const trustItems = ["Auto-Calculating", "Google Sheets + Excel", "Instant Download", "Easy to Customize"];
  const trustSvg = trustItems.map((item, i) => {
    const tx = 200 + i * 420;
    return `<circle cx="${tx}" cy="${trustY + 10}" r="6" fill="${theme.accent}" />
    <text x="${tx + 16}" y="${trustY + 16}" font-family="${font}" font-size="18" font-weight="600" fill="${theme.textMuted}">${item}</text>`;
  }).join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMG_W}" height="${IMG_H}" viewBox="0 0 ${IMG_W} ${IMG_H}">
  <defs>
    <linearGradient id="bgGrad6" x1="${gradX1}" y1="${gradY1}" x2="${gradX2}" y2="${gradY2}">
      <stop offset="0%" stop-color="${bgStart}" />
      <stop offset="100%" stop-color="${bgEnd}" />
    </linearGradient>
    <filter id="cardShadow6" x="-5%" y="-5%" width="115%" height="115%">
      <feDropShadow dx="0" dy="4" stdDeviation="12" flood-color="rgba(0,0,0,0.08)" />
    </filter>
  </defs>

  <rect width="${IMG_W}" height="${IMG_H}" fill="url(#bgGrad6)" />
  ${decorSvg}

  ${titleSvg}
  ${tabCardsSvg}
  ${badgeSvg}
  ${trustSvg}

  <rect x="0" y="1960" width="${IMG_W}" height="40" fill="${theme.accent}" opacity="0.15" />
</svg>`;
}

// ── IMAGE 7: DELIVERY ───────────────────────────────────────
// Layout driven by vd.delivery: layout (horizontal-flow/vertical-steps/icon-row), badges, showDeviceRow

function buildDeliverySvg(
  spec: ListingImageSpec,
  theme: ImageTheme,
  nicheProfile: NicheDesignProfile,
  vd?: import("@/types/visual-direction").VisualDirectionSpec,
): string {
  const del = vd?.delivery || { stepCount: 3, layout: "horizontal-flow" as const, badges: ["Instant Download", "No Subscription", "Lifetime Access"], showDeviceRow: true };
  const gSpec = vd?.global || { backgroundMode: "gradient" as const, gradientAngle: 180, gradientStops: ["#F8F9FA", "#FFFFFF"] as [string, string], decorStyle: "none" as const, decorOpacity: 0.05, fontFamily: "sans" as const, density: "balanced" as const };

  const font = gSpec.fontFamily === "serif" ? "Georgia, 'Times New Roman', serif"
    : gSpec.fontFamily === "mono" ? "'Courier New', Courier, monospace"
    : nicheProfile.typography.fontFamily;
  const title = spec.title || "Download. Open. Start.";
  const subtitle = spec.subtitle || "Set up in 5 minutes. No app. No subscription.";

  const stepDefs = [
    { label: "Download", desc: "Instant digital delivery.\nCheck your email or Etsy\npurchases page.", color: theme.kpiBlue,
      iconSvg: `<polygon points="0,-18 12,6 -12,6" fill="${darken(theme.kpiBlue, 0.5)}" /><rect x="-4" y="-24" width="8" height="12" fill="${darken(theme.kpiBlue, 0.5)}" />` },
    { label: "Open in Sheets", desc: "Upload to Google Drive.\nOpen with Google Sheets\nor use in Excel.", color: theme.kpiGreen,
      iconSvg: `<rect x="-16" y="-14" width="32" height="28" rx="3" fill="none" stroke="${darken(theme.kpiGreen, 0.5)}" stroke-width="3" /><line x1="-8" y1="-4" x2="8" y2="-4" stroke="${darken(theme.kpiGreen, 0.5)}" stroke-width="2" /><line x1="-8" y1="4" x2="4" y2="4" stroke="${darken(theme.kpiGreen, 0.5)}" stroke-width="2" />` },
    { label: "Start Tracking", desc: "Plug in your numbers\nand watch your budget\ncome to life.", color: theme.kpiYellow,
      iconSvg: `<polygon points="0,-18 18,10 -18,10" fill="${darken(theme.kpiYellow, 0.5)}" /><rect x="-3" y="10" width="6" height="8" fill="${darken(theme.kpiYellow, 0.5)}" />` },
    { label: "Review", desc: "Check trends monthly.\nStay on top of\nyour finances.", color: theme.accent,
      iconSvg: `<circle cx="0" cy="0" r="16" fill="none" stroke="${darken(theme.accent, 0.5)}" stroke-width="3" /><circle cx="0" cy="0" r="4" fill="${darken(theme.accent, 0.5)}" />` },
  ];
  const steps = stepDefs.slice(0, del.stepCount);
  const badges = del.badges.slice(0, 5).map(text => ({ text }));
  if (badges.length === 0) badges.push({ text: "Instant Download" }, { text: "No Subscription" }, { text: "Lifetime Access" });

  // Background
  const bgStart = gSpec.gradientStops[0];
  const bgEnd = gSpec.gradientStops[1];
  const angle = gSpec.gradientAngle;
  const gradX1 = Math.cos((angle - 90) * Math.PI / 180) * 0.5 + 0.5;
  const gradY1 = Math.sin((angle - 90) * Math.PI / 180) * 0.5 + 0.5;
  const gradX2 = 1 - gradX1;
  const gradY2 = 1 - gradY1;
  const decorSvg = gSpec.decorStyle !== "none" ? renderDecorativeElements(gSpec.decorStyle, theme.accent, gSpec.decorOpacity) : "";

  let contentSvg = "";

  // ── LAYOUT: horizontal-flow ──
  if (del.layout === "horizontal-flow") {
    contentSvg += `<text x="1000" y="80" text-anchor="middle" font-family="${font}" font-size="56" font-weight="800" fill="${theme.text}">${esc(title)}</text>
    <rect x="860" y="98" width="280" height="4" rx="2" fill="${theme.accent}" />
    <text x="1000" y="150" text-anchor="middle" font-family="${font}" font-size="26" fill="${theme.textMuted}">${esc(subtitle)}</text>`;

    const stepsTopY = 300;
    const stepCardW = Math.floor(1600 / del.stepCount);
    const stepGap = Math.floor((1800 - stepCardW * del.stepCount) / (del.stepCount + 1));
    const stepCardH = 480;

    contentSvg += steps.map((s, i) => {
      const cx = 100 + stepGap + i * (stepCardW + stepGap);
      return `
    <g filter="url(#cardShadow7)">
      ${roundedRect(cx, stepsTopY, stepCardW - 20, stepCardH, 20, "#FFFFFF")}
      ${roundedRect(cx, stepsTopY, stepCardW - 20, 8, 4, s.color)}
      <circle cx="${cx + (stepCardW - 20) / 2}" cy="${stepsTopY + 80}" r="45" fill="${s.color}" />
      <text x="${cx + (stepCardW - 20) / 2}" y="${stepsTopY + 94}" text-anchor="middle" font-family="${font}" font-size="32" font-weight="800" fill="${darken(s.color, 0.6)}">${i + 1}</text>
      <g transform="translate(${cx + (stepCardW - 20) / 2}, ${stepsTopY + 170})">${s.iconSvg}</g>
      <text x="${cx + (stepCardW - 20) / 2}" y="${stepsTopY + 260}" text-anchor="middle" font-family="${font}" font-size="28" font-weight="700" fill="${theme.text}">${esc(s.label)}</text>
      ${s.desc.split("\n").map((line, li) => `<text x="${cx + (stepCardW - 20) / 2}" y="${stepsTopY + 310 + li * 30}" text-anchor="middle" font-family="${font}" font-size="18" fill="${theme.textMuted}">${esc(line)}</text>`).join("\n      ")}
    </g>
    ${i < del.stepCount - 1 ? `<text x="${cx + stepCardW + stepGap / 2 - 20}" y="${stepsTopY + stepCardH / 2}" font-family="${font}" font-size="48" fill="${theme.accent}">${esc("→")}</text>` : ""}`;
    }).join("");

    const badgeY = stepsTopY + stepCardH + 50;
    const badgeW = Math.floor(1700 / badges.length);
    contentSvg += badges.map((b, i) => {
      const bx = 150 + i * badgeW;
      return `${roundedRect(bx, badgeY, badgeW - 30, 70, 16, theme.kpiGreen)}
    <text x="${bx + (badgeW - 30) / 2}" y="${badgeY + 44}" text-anchor="middle" font-family="${font}" font-size="20" font-weight="600" fill="#065F46">${esc(b.text)}</text>`;
    }).join("\n  ");
  }

  // ── LAYOUT: vertical-steps ──
  else if (del.layout === "vertical-steps") {
    contentSvg += `<text x="1000" y="80" text-anchor="middle" font-family="${font}" font-size="54" font-weight="800" fill="${theme.text}">${esc(title)}</text>
    <rect x="880" y="96" width="240" height="3" rx="1" fill="${theme.accent}" />
    <text x="1000" y="140" text-anchor="middle" font-family="${font}" font-size="24" fill="${theme.textMuted}">${esc(subtitle)}</text>`;

    const startY = 190;
    const stepH = Math.floor(1100 / del.stepCount);
    const lineX = 250;

    // Vertical line
    contentSvg += `<line x1="${lineX}" y1="${startY}" x2="${lineX}" y2="${startY + stepH * del.stepCount}" stroke="${theme.accent}" stroke-width="4" stroke-dasharray="10 8" />`;

    contentSvg += steps.map((s, i) => {
      const cy = startY + i * stepH;
      return `
    <circle cx="${lineX}" cy="${cy + 40}" r="36" fill="${s.color}" />
    <text x="${lineX}" y="${cy + 52}" text-anchor="middle" font-family="${font}" font-size="28" font-weight="800" fill="${darken(s.color, 0.6)}">${i + 1}</text>
    ${roundedRect(lineX + 60, cy, 1600, stepH - 30, 16, "#FFFFFF")}
    <g transform="translate(${lineX + 100}, ${cy + (stepH - 30) / 2})">${s.iconSvg}</g>
    <text x="${lineX + 160}" y="${cy + 45}" font-family="${font}" font-size="30" font-weight="700" fill="${theme.text}">${esc(s.label)}</text>
    <text x="${lineX + 160}" y="${cy + 85}" font-family="${font}" font-size="18" fill="${theme.textMuted}">${s.desc.split("\n")[0]}</text>`;
    }).join("");

    // Badges at bottom
    const badgeY = startY + stepH * del.stepCount + 40;
    const badgeW = Math.floor(1700 / badges.length);
    contentSvg += badges.map((b, i) => {
      const bx = 150 + i * badgeW;
      return `${roundedRect(bx, badgeY, badgeW - 30, 60, 12, theme.primaryLight)}
    <text x="${bx + (badgeW - 30) / 2}" y="${badgeY + 38}" text-anchor="middle" font-family="${font}" font-size="20" font-weight="600" fill="${theme.primary}">${esc(b.text)}</text>`;
    }).join("\n  ");

    // Device row
    if (del.showDeviceRow) {
      const devY = badgeY + 90;
      contentSvg += `<text x="1000" y="${devY + 20}" text-anchor="middle" font-family="${font}" font-size="20" fill="${theme.textMuted}">Works on: Laptop • Tablet • Phone • Desktop</text>`;
    }
  }

  // ── LAYOUT: icon-row ──
  else if (del.layout === "icon-row") {
    // Dense, compact — icons top, labels below, badges bottom
    contentSvg += `<text x="1000" y="80" text-anchor="middle" font-family="${font}" font-size="52" font-weight="800" fill="${theme.text}">${esc(title)}</text>
    <rect x="860" y="96" width="280" height="4" rx="2" fill="${theme.accent}" />
    <text x="1000" y="140" text-anchor="middle" font-family="${font}" font-size="22" fill="${theme.textMuted}">${esc(subtitle)}</text>`;

    const iconRowY = 300;
    const iconSpacing = Math.floor(1600 / del.stepCount);
    contentSvg += steps.map((s, i) => {
      const cx = 200 + i * iconSpacing;
      return `
    <circle cx="${cx + iconSpacing / 2}" cy="${iconRowY}" r="60" fill="${s.color}" />
    <text x="${cx + iconSpacing / 2}" y="${iconRowY + 14}" text-anchor="middle" font-family="${font}" font-size="40" font-weight="800" fill="${darken(s.color, 0.6)}">${i + 1}</text>
    <g transform="translate(${cx + iconSpacing / 2}, ${iconRowY + 100})">${s.iconSvg}</g>
    <text x="${cx + iconSpacing / 2}" y="${iconRowY + 160}" text-anchor="middle" font-family="${font}" font-size="28" font-weight="700" fill="${theme.text}">${esc(s.label)}</text>
    <text x="${cx + iconSpacing / 2}" y="${iconRowY + 200}" text-anchor="middle" font-family="${font}" font-size="16" fill="${theme.textMuted}">${s.desc.split("\n")[0]}</text>
    ${i < del.stepCount - 1 ? `<line x1="${cx + iconSpacing - 20}" y1="${iconRowY}" x2="${cx + iconSpacing + 20}" y2="${iconRowY}" stroke="${theme.accent}" stroke-width="3" />` : ""}`;
    }).join("");

    // Badges row
    const badgeY = iconRowY + 280;
    const badgeW = Math.floor(1700 / badges.length);
    contentSvg += badges.map((b, i) => {
      const bx = 150 + i * badgeW;
      return `${roundedRect(bx, badgeY, badgeW - 30, 70, 4, "#FFFFFF")}
    <rect x="${bx}" y="${badgeY}" width="${badgeW - 30}" height="3" fill="${theme.accent}" />
    <text x="${bx + (badgeW - 30) / 2}" y="${badgeY + 44}" text-anchor="middle" font-family="${font}" font-size="20" font-weight="600" fill="${theme.text}">${esc(b.text)}</text>`;
    }).join("\n  ");

    // Device row
    if (del.showDeviceRow) {
      const devY = badgeY + 110;
      contentSvg += `<text x="1000" y="${devY}" text-anchor="middle" font-family="${font}" font-size="20" fill="${theme.textMuted}">Works on: Laptop • Tablet • Phone • Desktop</text>`;
    }
  }

  // Trust line at bottom
  const trustY = 1920;
  contentSvg += `<text x="1000" y="${trustY}" text-anchor="middle" font-family="${font}" font-size="22" fill="${theme.textMuted}">Works in Google Sheets, Excel, and Numbers - Digital download</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMG_W}" height="${IMG_H}" viewBox="0 0 ${IMG_W} ${IMG_H}">
  <defs>
    <linearGradient id="bgGrad7" x1="${gradX1}" y1="${gradY1}" x2="${gradX2}" y2="${gradY2}">
      <stop offset="0%" stop-color="${bgStart}" />
      <stop offset="100%" stop-color="${bgEnd}" />
    </linearGradient>
    <filter id="cardShadow7" x="-5%" y="-5%" width="115%" height="115%">
      <feDropShadow dx="0" dy="4" stdDeviation="10" flood-color="${nicheProfile.imageStyle.cardShadowColor}" />
    </filter>
  </defs>

  <rect width="${IMG_W}" height="${IMG_H}" fill="url(#bgGrad7)" />
  ${decorSvg}

  ${contentSvg}

  <rect x="0" y="1990" width="${IMG_W}" height="10" fill="${theme.accent}" opacity="0.2" />
</svg>`;
}

// ══════════════════════════════════════════════════════════════
// MAIN RENDERER
// ══════════════════════════════════════════════════════════════

export interface RenderedImage {
  slot: number;
  kind: ListingImageKind;
  title: string;
  buffer: Buffer;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface RenderResult {
  images: RenderedImage[];
  totalSizeBytes: number;
  renderTimeMs: number;
}

/**
 * Render all 7 Etsy listing images from a blueprint + image plan.
 * Returns PNG buffers ready for storage.
 */
export async function renderListingImages(
  blueprint: ProductBlueprint,
  plan: ListingImagePlan,
  options: { useGemini?: boolean } = {},
): Promise<RenderResult> {
  const startTime = Date.now();
  const nicheStr = (blueprint.config && "niche" in blueprint.config ? (blueprint.config as { niche?: string }).niche : undefined) || blueprint.sourceListingTitle || "";
  const nicheProfile = resolveNicheProfile(nicheStr, blueprint.colorScheme);
  const theme = resolveTheme(plan, nicheProfile);
  const family = resolveLayoutFamily(nicheProfile.id);
  const vd = blueprint.visualDirection; // AI-generated visual direction spec
  const images: RenderedImage[] = [];
  const useGemini = options.useGemini ?? true; // Gemini ON by default

  // ── Pre-generate Playwright screenshots for real spreadsheet slots ──
  // These are actual browser-rendered HTML screenshots, not SVG imitations.
  let dashboardScreenshot: Buffer | null = null;
  let transactionScreenshot: Buffer | null = null;
  let dashboardCropScreenshot: Buffer | null = null;
  const nicheTabScreenshots: Map<string, Buffer> = new Map();

  const DASHBOARD_KINDS = new Set(["dashboard", "thumbnail", "kpi-hero"]);
  const TRANSACTION_KINDS = new Set(["feature"]);

  // Map niche-specific image kinds to their target tab names
  const NICHE_TAB_MAP: Record<string, string> = {
    "vendor-zoom": "vendor",
    "itinerary-preview": "itinerary",
    "milestone-tracker": "transaction",
    "bills-calendar": "bills",
    "debt-progress": "transaction",
    "pl-breakdown": "revenue",
    // Meal planner image kinds
    "meal-plan-zoom": "meal",
    "grocery-zoom": "grocery",
    // Student budget image kinds
    "semester-zoom": "semester",
    "subscription-audit": "subscription",
    // Debt payoff image kinds
    "debt-overview": "debt",
    "snowball-zoom": "snowball",
    "milestones": "milestone",
  };

  const needsDashboard = plan.images.some(s => DASHBOARD_KINDS.has(s.kind));
  const needsTransactions = plan.images.some(s => TRANSACTION_KINDS.has(s.kind));

  // Collect niche-specific tabs that need screenshots
  const nicheTabsNeeded = new Set<string>();
  for (const spec of plan.images) {
    // Legacy kind → tab mapping
    const tabHint = NICHE_TAB_MAP[spec.kind];
    if (tabHint) nicheTabsNeeded.add(tabHint);
    // Dynamic "detail-zoom" kind — uses sourceTab directly
    if (spec.kind === "detail-zoom" && spec.sourceTab) {
      nicheTabsNeeded.add(spec.sourceTab);
    }
  }

  try {
    if (needsDashboard) {
      console.log("[image-renderer] Launching Playwright for REAL dashboard screenshot...");
      const [dashResult, cropResult] = await Promise.all([
        screenshotDashboard(blueprint, nicheProfile, {
          width: 1200,
          height: 1200,
          showChrome: true,
          showTabBar: true,
          cropToData: false,
          deviceScaleFactor: 2,
        }),
        screenshotDashboardCrop(blueprint, nicheProfile),
      ]);
      dashboardScreenshot = dashResult.buffer;
      dashboardCropScreenshot = cropResult.buffer;
      console.log(`[image-renderer] Dashboard screenshot: ${(dashResult.buffer.length / 1024).toFixed(0)} KB`);
    }

    if (needsTransactions) {
      console.log("[image-renderer] Launching Playwright for REAL transaction screenshot...");
      const txnResult = await screenshotTransactions(blueprint, nicheProfile, {
        width: 1200,
        height: 1200,
        showChrome: true,
        showTabBar: true,
        maxDataRows: 20,
        deviceScaleFactor: 2,
      });
      transactionScreenshot = txnResult.buffer;
      console.log(`[image-renderer] Transaction screenshot: ${(txnResult.buffer.length / 1024).toFixed(0)} KB`);
    }

    // Screenshot niche-specific tabs
    for (const tabHint of nicheTabsNeeded) {
      console.log(`[image-renderer] Screenshotting niche tab: "${tabHint}"...`);
      try {
        const result = await screenshotSpecificTab(blueprint, nicheProfile, tabHint, {
          width: 1200,
          height: 1200,
          showChrome: true,
          showTabBar: true,
          maxDataRows: 20,
          deviceScaleFactor: 2,
        });
        nicheTabScreenshots.set(tabHint, result.buffer);
        console.log(`[image-renderer] Niche tab "${tabHint}" screenshot: ${(result.buffer.length / 1024).toFixed(0)} KB`);
      } catch (tabErr) {
        console.warn(`[image-renderer] Failed to screenshot tab "${tabHint}", will use fallback`);
      }
    }
  } catch (playwrightErr) {
    console.error("[image-renderer] Playwright screenshot failed, falling back to SVG:", playwrightErr);
    // Will fall back to SVG rendering below
  }

  // ── Derive feature pills for thumbnail ──
  const uniqueTabNames = [...new Set(blueprint.tabs.map(t => t.name))];
  const featurePills = uniqueTabNames
    .filter(n => !n.toLowerCase().includes("setup") && !n.toLowerCase().includes("instruction"))
    .slice(0, 4);

  for (const spec of plan.images) {
    let pngBuffer: Buffer | null = null;

    try {
      switch (spec.kind as ListingImageKind) {
        case "thumbnail": {
          // 3 THUMBNAIL STYLES — routed by niche for maximum CTR variation
          const thumbTitle = spec.title || blueprint.sourceListingTitle || "Budget Tracker";
          const thumbSubtitle = spec.subtitle || "Google Sheets Template";
          const thumbStyle = getThumbnailStyle(nicheProfile.id);
          console.log(`[image-renderer] Thumbnail style: ${thumbStyle} for niche ${nicheProfile.id}`);

          if (thumbStyle === "bold-headline") {
            // STYLE 1: Bold emotional headline — large text dominates, screenshot small
            if (dashboardCropScreenshot && useGemini) {
              try {
                // Generate a small laptop mockup, then composite with bold headline SVG
                const result = await generateLaptopMockup(dashboardCropScreenshot, thumbTitle, nicheProfile);
                // Resize mockup small (bottom-right corner)
                const mockupSmall = await sharp(result.buffer)
                  .resize(900, 600, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
                  .toBuffer();
                // Create bold headline background
                const headlineSvg = buildBoldHeadlineSvg(thumbTitle, thumbSubtitle, nicheProfile, family);
                const headlineBg = await sharp(Buffer.from(headlineSvg)).resize(IMG_W, IMG_H).png().toBuffer();
                // Composite: headline bg + small mockup in bottom center
                pngBuffer = await sharp(headlineBg)
                  .composite([{ input: mockupSmall, left: 550, top: 1050, blend: "over" }])
                  .png({ quality: 92 }).toBuffer();
                console.log(`[image-renderer] Bold-headline hero: ${(pngBuffer.length / 1024).toFixed(0)} KB`);
              } catch (err) {
                console.warn("[image-renderer] Bold-headline Gemini mockup failed, using SVG-only:", err);
              }
            }
            if (!pngBuffer) {
              // Pure SVG fallback
              const svg = buildBoldHeadlineSvg(thumbTitle, thumbSubtitle, nicheProfile, family);
              pngBuffer = await sharp(Buffer.from(svg)).resize(IMG_W, IMG_H).png({ quality: 90 }).toBuffer();
            }

          } else if (thumbStyle === "extreme-zoom") {
            // STYLE 2: Extreme zoom — dashboard fills canvas, dark title bar overlay
            if (dashboardCropScreenshot) {
              try {
                // Scale screenshot to fill entire canvas
                const screenshotFull = await sharp(dashboardCropScreenshot)
                  .resize(IMG_W, IMG_H, { fit: "cover" })
                  .png().toBuffer();
                // Generate SVG overlay (title bar + accent pill)
                const overlaySvg = buildExtremeZoomOverlaySvg(thumbTitle, nicheProfile);
                const overlayPng = await sharp(Buffer.from(overlaySvg)).resize(IMG_W, IMG_H).png().toBuffer();
                // Composite
                pngBuffer = await sharp(screenshotFull)
                  .composite([{ input: overlayPng, blend: "over" }])
                  .png({ quality: 92 }).toBuffer();
                console.log(`[image-renderer] Extreme-zoom hero: ${(pngBuffer.length / 1024).toFixed(0)} KB`);
              } catch (err) {
                console.warn("[image-renderer] Extreme-zoom failed, falling back to laptop:", err);
              }
            }
            if (!pngBuffer && dashboardCropScreenshot) {
              pngBuffer = await composeLaptopMockup(dashboardCropScreenshot, thumbTitle, thumbSubtitle, nicheProfile, featurePills);
            }
            if (!pngBuffer) {
              const svg = buildSpreadsheetHero(spec, blueprint, nicheProfile);
              pngBuffer = await sharp(Buffer.from(svg)).resize(IMG_W, IMG_H).png({ quality: 90 }).toBuffer();
            }

          } else {
            // STYLE 3: Clean premium mockup (editorial niches) — centered device, elegant layout
            if (dashboardCropScreenshot) {
              // Use VisualDirectionSpec hero layout for device type
              const heroLayout = vd?.hero?.deviceLayout || "single-laptop";
              console.log(`[image-renderer] Clean-premium hero, device: ${heroLayout}`);

              if (useGemini) {
                try {
                  if (heroLayout === "single-laptop") {
                    const result = await generateLaptopMockup(dashboardCropScreenshot, thumbTitle, nicheProfile);
                    pngBuffer = await sharp(result.buffer).resize(IMG_W, IMG_H).png({ quality: 92 }).toBuffer();
                  } else if (heroLayout === "tablet-solo") {
                    const result = await generateTabletMockup(dashboardCropScreenshot, thumbTitle, nicheProfile);
                    pngBuffer = await sharp(result.buffer).resize(IMG_W, IMG_H).png({ quality: 92 }).toBuffer();
                  } else if (heroLayout === "multi-device") {
                    const result = await generateHeroMockup(dashboardCropScreenshot, thumbTitle, thumbSubtitle, nicheProfile, featurePills);
                    pngBuffer = await sharp(result.buffer).resize(IMG_W, IMG_H).png({ quality: 92 }).toBuffer();
                  } else {
                    // flatlay, phone-pair → dashboard zoom
                    const result = await generateDashboardZoomMockup(dashboardCropScreenshot, thumbTitle, nicheProfile);
                    pngBuffer = await sharp(result.buffer).resize(IMG_W, IMG_H).png({ quality: 92 }).toBuffer();
                  }
                  console.log(`[image-renderer] Clean-premium hero: ${(pngBuffer.length / 1024).toFixed(0)} KB`);
                } catch (err) {
                  console.warn("[image-renderer] Clean-premium Gemini mockup failed:", err);
                }
              }

              if (!pngBuffer) {
                pngBuffer = await composeLaptopMockup(dashboardCropScreenshot, thumbTitle, thumbSubtitle, nicheProfile, featurePills);
              }
            } else {
              const svg = buildSpreadsheetHero(spec, blueprint, nicheProfile);
              pngBuffer = await sharp(Buffer.from(svg)).resize(IMG_W, IMG_H).png({ quality: 90 }).toBuffer();
            }
          }
          break;
        }

        case "dashboard": {
          // Dashboard zoom variant — large spreadsheet, no device frame, max readability
          if (dashboardScreenshot) {
            const dashTitle = spec.title || ""; // Will use niche emotional copy from generator

            try {
              console.log("[image-renderer] Generating dashboard-zoom variant...");
              const zoomResult = await generateDashboardZoomMockup(
                dashboardScreenshot,
                dashTitle,
                nicheProfile,
              );
              pngBuffer = await sharp(zoomResult.buffer).resize(IMG_W, IMG_H).png({ quality: 92 }).toBuffer();
              console.log(`[image-renderer] Dashboard zoom: ${(pngBuffer.length / 1024).toFixed(0)} KB`);
            } catch (err) {
              console.warn("[image-renderer] Dashboard zoom failed, falling back to laptop mockup:", err);
            }

            // Fallback: laptop mockup
            if (!pngBuffer) {
              pngBuffer = await composeLaptopMockup(
                dashboardScreenshot,
                dashTitle,
                "Google Sheets Template",
                nicheProfile,
              );
            }
          } else {
            const svg = buildSpreadsheetDashboard(spec, blueprint, nicheProfile);
            pngBuffer = await sharp(Buffer.from(svg)).resize(IMG_W, IMG_H).png({ quality: 90 }).toBuffer();
          }
          break;
        }

        case "feature": {
          // REAL browser-rendered transaction tab in tablet mockup
          if (transactionScreenshot) {
            const featureTitle = spec.title || "Track every transaction";

            if (useGemini) {
              try {
                console.log("[image-renderer] Generating Gemini tablet mockup...");
                const geminiResult = await generateTabletMockup(
                  transactionScreenshot,
                  featureTitle,
                  nicheProfile,
                );
                pngBuffer = await sharp(geminiResult.buffer).resize(IMG_W, IMG_H).png({ quality: 92 }).toBuffer();
                console.log(`[image-renderer] Gemini tablet: ${(pngBuffer.length / 1024).toFixed(0)} KB (${geminiResult.source})`);
              } catch (err) {
                console.warn("[image-renderer] Gemini tablet failed, falling back to Sharp:", err);
              }
            }

            if (!pngBuffer) {
              pngBuffer = await composeTabletMockup(
                transactionScreenshot,
                featureTitle,
                nicheProfile,
              );
            }
          } else {
            const svg = buildSpreadsheetFeature(spec, blueprint, nicheProfile);
            pngBuffer = await sharp(Buffer.from(svg)).resize(IMG_W, IMG_H).png({ quality: 90 }).toBuffer();
          }
          break;
        }

        case "problem": {
          const svg = buildProblemSvg(spec, theme, nicheProfile, vd);
          pngBuffer = await sharp(Buffer.from(svg)).resize(IMG_W, IMG_H).png({ quality: 90 }).toBuffer();
          break;
        }

        case "method": {
          const svg = buildMethodSvg(spec, blueprint, theme, nicheProfile, vd);
          pngBuffer = await sharp(Buffer.from(svg)).resize(IMG_W, IMG_H).png({ quality: 90 }).toBuffer();
          break;
        }

        case "included": {
          const svg = buildIncludedSvg(spec, blueprint, theme, nicheProfile, vd);
          pngBuffer = await sharp(Buffer.from(svg)).resize(IMG_W, IMG_H).png({ quality: 90 }).toBuffer();
          break;
        }

        case "delivery":
        case "social-proof": {
          // social-proof uses the same delivery/trust layout with trust-focused copy
          const svg = buildDeliverySvg(spec, theme, nicheProfile, vd);
          pngBuffer = await sharp(Buffer.from(svg)).resize(IMG_W, IMG_H).png({ quality: 90 }).toBuffer();
          break;
        }

        case "kpi-hero": {
          // Executive KPI hero — dashboard zoom with no device frame, data-forward
          if (dashboardScreenshot) {
            try {
              const zoomResult = await generateDashboardZoomMockup(
                dashboardScreenshot,
                spec.title || "",
                nicheProfile,
              );
              pngBuffer = await sharp(zoomResult.buffer).resize(IMG_W, IMG_H).png({ quality: 92 }).toBuffer();
            } catch {
              // Fallback to SVG dashboard
            }
          }
          if (!pngBuffer) {
            const svg = buildSpreadsheetDashboard(spec, blueprint, nicheProfile);
            pngBuffer = await sharp(Buffer.from(svg)).resize(IMG_W, IMG_H).png({ quality: 90 }).toBuffer();
          }
          break;
        }

        case "pl-breakdown": {
          // Executive P&L — uses transaction/feature screenshot if available, otherwise SVG
          if (transactionScreenshot) {
            const featureTitle = spec.title || "See your real P&L every month.";
            if (useGemini) {
              try {
                const geminiResult = await generateTabletMockup(transactionScreenshot, featureTitle, nicheProfile);
                pngBuffer = await sharp(geminiResult.buffer).resize(IMG_W, IMG_H).png({ quality: 92 }).toBuffer();
              } catch { /* fallback below */ }
            }
            if (!pngBuffer) {
              pngBuffer = await composeTabletMockup(transactionScreenshot, featureTitle, nicheProfile);
            }
          } else {
            const svg = buildSpreadsheetFeature(spec, blueprint, nicheProfile);
            pngBuffer = await sharp(Buffer.from(svg)).resize(IMG_W, IMG_H).png({ quality: 90 }).toBuffer();
          }
          break;
        }

        case "vendor-zoom":
        case "itinerary-preview":
        case "milestone-tracker":
        case "bills-calendar":
        case "debt-progress":
        case "meal-plan-zoom":
        case "grocery-zoom":
        case "semester-zoom":
        case "subscription-audit":
        case "debt-overview":
        case "snowball-zoom":
        case "milestones": {
          // Niche-specific feature zoom — uses targeted tab screenshot
          const tabHint = NICHE_TAB_MAP[spec.kind as string];
          const tabScreenshot = tabHint ? nicheTabScreenshots.get(tabHint) : null;
          const screenshot = tabScreenshot || transactionScreenshot;
          if (screenshot) {
            const title = spec.title || "Track every detail.";
            if (useGemini) {
              try {
                const geminiResult = await generateTabletMockup(screenshot, title, nicheProfile);
                pngBuffer = await sharp(geminiResult.buffer).resize(IMG_W, IMG_H).png({ quality: 92 }).toBuffer();
              } catch { /* fallback below */ }
            }
            if (!pngBuffer) {
              pngBuffer = await composeTabletMockup(screenshot, title, nicheProfile);
            }
          } else {
            const svg = buildSpreadsheetFeature(spec, blueprint, nicheProfile);
            pngBuffer = await sharp(Buffer.from(svg)).resize(IMG_W, IMG_H).png({ quality: 90 }).toBuffer();
          }
          break;
        }

        case "comparison": {
          // Before/after or us-vs-competitor — dedicated split comparison layout
          const svg = buildComparisonSvg(spec, theme, nicheProfile, vd);
          pngBuffer = await sharp(Buffer.from(svg)).resize(IMG_W, IMG_H).png({ quality: 90 }).toBuffer();
          break;
        }

        case "detail-zoom": {
          // Close-up of a specific tab — like vendor-zoom but driven by sourceTab
          const tabName = spec.sourceTab;
          const tabScreenshot = tabName ? nicheTabScreenshots.get(tabName) : null;
          const screenshot = tabScreenshot || transactionScreenshot || dashboardScreenshot;
          if (screenshot) {
            const title = spec.title || "See every detail.";
            if (useGemini) {
              try {
                const geminiResult = await generateTabletMockup(screenshot, title, nicheProfile);
                pngBuffer = await sharp(geminiResult.buffer).resize(IMG_W, IMG_H).png({ quality: 92 }).toBuffer();
              } catch { /* fallback below */ }
            }
            if (!pngBuffer) {
              pngBuffer = await composeTabletMockup(screenshot, title, nicheProfile);
            }
          } else {
            const svg = buildSpreadsheetFeature(spec, blueprint, nicheProfile);
            pngBuffer = await sharp(Buffer.from(svg)).resize(IMG_W, IMG_H).png({ quality: 90 }).toBuffer();
          }
          break;
        }

        case "lifestyle": {
          // Aspirational text slide — uses problem layout with low darkness (light, dreamy)
          const lifestyleSpec = { ...spec };
          const svg = buildProblemSvg(lifestyleSpec, theme, nicheProfile, vd);
          pngBuffer = await sharp(Buffer.from(svg)).resize(IMG_W, IMG_H).png({ quality: 90 }).toBuffer();
          break;
        }

        case "guarantee": {
          // Trust/guarantee slide — uses delivery layout with guarantee-focused copy
          const svg = buildDeliverySvg(spec, theme, nicheProfile, vd);
          pngBuffer = await sharp(Buffer.from(svg)).resize(IMG_W, IMG_H).png({ quality: 90 }).toBuffer();
          break;
        }

        default: {
          if (dashboardScreenshot) {
            pngBuffer = await composeFullBleed(dashboardScreenshot, IMG_W, IMG_H);
          } else {
            const svg = buildSpreadsheetDashboard(spec, blueprint, nicheProfile);
            pngBuffer = await sharp(Buffer.from(svg)).resize(IMG_W, IMG_H).png({ quality: 90 }).toBuffer();
          }
          break;
        }
      }

      if (pngBuffer) {
        images.push({
          slot: spec.slot,
          kind: spec.kind,
          title: spec.title,
          buffer: pngBuffer,
          width: IMG_W,
          height: IMG_H,
          sizeBytes: pngBuffer.length,
        });

        const source = (DASHBOARD_KINDS.has(spec.kind) || TRANSACTION_KINDS.has(spec.kind))
          && (dashboardScreenshot || transactionScreenshot) ? "PLAYWRIGHT" : "SVG";
        console.log(
          `[image-renderer] Slot ${spec.slot} (${spec.kind}) [${source}]: ${(pngBuffer.length / 1024).toFixed(0)} KB`
        );
      }
    } catch (err) {
      console.error(`[image-renderer] Failed to render slot ${spec.slot} (${spec.kind}):`, err);
    }
  }

  // Close browser after rendering all images
  try {
    await closeBrowser();
  } catch {
    // Ignore browser close errors
  }

  const totalSizeBytes = images.reduce((sum, img) => sum + img.sizeBytes, 0);

  return {
    images,
    totalSizeBytes,
    renderTimeMs: Date.now() - startTime,
  };
}

/**
 * Render a single image by slot number (useful for regeneration).
 */
export async function renderSingleImage(
  blueprint: ProductBlueprint,
  plan: ListingImagePlan,
  slot: number
): Promise<RenderedImage | null> {
  const spec = plan.images.find((img) => img.slot === slot);
  if (!spec) return null;

  const singlePlan = { ...plan, images: [spec] };
  const result = await renderListingImages(blueprint, singlePlan);
  return result.images[0] || null;
}
