// ── Callout Design System ──────────────────────────────────
// Reusable callout block builders for premium Notion templates.
// Every builder returns a BlockSpec that renders as a styled callout in Notion.

import { BlockSpec } from "./notion-templates";

// ── Theme Types ──

export interface CalloutTheme {
  brandColor: string;   // Primary section headers
  accentColor: string;  // Highlights, badges
  warnColor: string;    // Warnings
  successColor: string; // Success states
  infoColor: string;    // Information boxes
  cardColor: string;    // Stat cards / neutral containers
}

export const DEFAULT_THEME: CalloutTheme = {
  brandColor: "blue",
  accentColor: "purple",
  warnColor: "yellow",
  successColor: "green",
  infoColor: "blue",
  cardColor: "gray",
};

// ── Theme from Aesthetic ──

const AESTHETIC_THEMES: Record<string, CalloutTheme> = {
  minimal: {
    brandColor: "blue",
    accentColor: "purple",
    warnColor: "yellow",
    successColor: "green",
    infoColor: "blue",
    cardColor: "gray",
  },
  brown: {
    brandColor: "brown",
    accentColor: "orange",
    warnColor: "yellow",
    successColor: "green",
    infoColor: "brown",
    cardColor: "orange",
  },
  pink: {
    brandColor: "pink",
    accentColor: "purple",
    warnColor: "orange",
    successColor: "green",
    infoColor: "pink",
    cardColor: "red",
  },
  dark: {
    brandColor: "blue",
    accentColor: "purple",
    warnColor: "yellow",
    successColor: "green",
    infoColor: "blue",
    cardColor: "gray",
  },
  sage: {
    brandColor: "green",
    accentColor: "brown",
    warnColor: "yellow",
    successColor: "green",
    infoColor: "green",
    cardColor: "default",
  },
  pastel: {
    brandColor: "purple",
    accentColor: "pink",
    warnColor: "orange",
    successColor: "green",
    infoColor: "purple",
    cardColor: "blue",
  },
  mono: {
    brandColor: "default",
    accentColor: "gray",
    warnColor: "yellow",
    successColor: "green",
    infoColor: "default",
    cardColor: "gray",
  },
  os_dark: {
    brandColor: "blue",
    accentColor: "purple",
    warnColor: "yellow",
    successColor: "green",
    infoColor: "blue",
    cardColor: "purple",
  },
};

export function themeFromAesthetic(aesthetic: string): CalloutTheme {
  return AESTHETIC_THEMES[aesthetic] || DEFAULT_THEME;
}

// ── Block Builders ──

/** Colored section header callout — replaces H2 + divider patterns */
export function createSectionHeader(
  title: string,
  icon: string,
  theme: CalloutTheme = DEFAULT_THEME,
): BlockSpec {
  return {
    type: "callout",
    text: title,
    icon,
    color: `${theme.brandColor}_background`,
    bold: true,
  };
}

/** Pro tip callout — 💡 accent-colored, for power user hints */
export function createProTip(
  text: string,
  theme: CalloutTheme = DEFAULT_THEME,
): BlockSpec {
  return {
    type: "callout",
    text: `Pro Tip: ${text}`,
    icon: "💡",
    color: `${theme.accentColor}_background`,
    bold: false,
  };
}

/** Warning callout — ⚠️ warn-colored, for important caveats */
export function createWarning(
  text: string,
  theme: CalloutTheme = DEFAULT_THEME,
): BlockSpec {
  return {
    type: "callout",
    text: `Heads up: ${text}`,
    icon: "⚠️",
    color: `${theme.warnColor}_background`,
  };
}

/** Info box callout — custom icon, info-colored, for explanations */
export function createInfoBox(
  text: string,
  icon: string = "ℹ️",
  theme: CalloutTheme = DEFAULT_THEME,
): BlockSpec {
  return {
    type: "callout",
    text,
    icon,
    color: `${theme.infoColor}_background`,
  };
}

/** Success callout — ✅ green, for completed/positive states */
export function createSuccessBox(
  text: string,
  theme: CalloutTheme = DEFAULT_THEME,
): BlockSpec {
  return {
    type: "callout",
    text,
    icon: "✅",
    color: `${theme.successColor}_background`,
  };
}

/** Error/blocker callout — 🚫 red */
export function createErrorBox(
  text: string,
): BlockSpec {
  return {
    type: "callout",
    text,
    icon: "🚫",
    color: "red_background",
  };
}

/** Stat badge callout — for single KPI-style value display */
export function createStatBadge(
  label: string,
  value: string,
  icon: string,
  theme: CalloutTheme = DEFAULT_THEME,
): BlockSpec {
  return {
    type: "callout",
    text: `${label}\n${value}`,
    icon,
    color: `${theme.cardColor}_background`,
  };
}

/** Row of stat card callouts in columns — for KPI dashboard rows */
export function createStatCardRow(
  cards: Array<{ label: string; value: string; icon: string }>,
  theme: CalloutTheme = DEFAULT_THEME,
): BlockSpec {
  const columns: BlockSpec[][] = cards.map((card) => [
    createStatBadge(card.label, card.value, card.icon, theme),
  ]);
  return { type: "column_list", columns };
}

/** Premium feature badge — ⭐ purple callout for highlighting power features */
export function createPremiumBadge(
  feature: string,
  theme: CalloutTheme = DEFAULT_THEME,
): BlockSpec {
  return {
    type: "callout",
    text: `Premium Feature: ${feature}`,
    icon: "⭐",
    color: `${theme.accentColor}_background`,
    bold: true,
  };
}

/** Quick navigation callout — gray container with page link list */
export function createQuickNav(
  links: Array<{ emoji: string; label: string }>,
): BlockSpec {
  const navText = links.map((l) => `${l.emoji} ${l.label}`).join("  ·  ");
  return {
    type: "callout",
    text: navText,
    icon: "🧭",
    color: "gray_background",
  };
}

/** Brand footer — italic tagline at page bottom */
export function createBrandFooter(
  tagline: string,
  color: string = "gray",
): BlockSpec {
  return {
    type: "paragraph",
    text: tagline,
    italic: true,
    color,
  };
}

// ── Template Variant System ──

export type VariantId = "minimal" | "dark_os" | "warm" | "bold";

export interface TemplateVariant {
  id: VariantId;
  name: string;
  description: string;
  aesthetic: string; // Maps to AESTHETIC_COLORS key
  calloutTheme: CalloutTheme;
  coverVariant: "light" | "dark" | "warm" | "colorful";
  sectionHeaderStyle: "clean" | "bold" | "emoji_rich";
}

export const TEMPLATE_VARIANTS: Record<VariantId, TemplateVariant> = {
  minimal: {
    id: "minimal",
    name: "Minimal Clean",
    description: "White background, subtle blue accents, maximum whitespace",
    aesthetic: "minimal",
    calloutTheme: AESTHETIC_THEMES.minimal,
    coverVariant: "light",
    sectionHeaderStyle: "clean",
  },
  dark_os: {
    id: "dark_os",
    name: "Dark OS",
    description: "Dark mode with neon blue/purple accents, app-like feel",
    aesthetic: "dark",
    calloutTheme: AESTHETIC_THEMES.os_dark,
    coverVariant: "dark",
    sectionHeaderStyle: "bold",
  },
  warm: {
    id: "warm",
    name: "Warm & Cozy",
    description: "Brown, beige, and cream tones — trendy and inviting",
    aesthetic: "brown",
    calloutTheme: AESTHETIC_THEMES.brown,
    coverVariant: "warm",
    sectionHeaderStyle: "emoji_rich",
  },
  bold: {
    id: "bold",
    name: "Bold & Colorful",
    description: "Bright colors, multiple accent tones, high visual energy",
    aesthetic: "pastel",
    calloutTheme: AESTHETIC_THEMES.pastel,
    coverVariant: "colorful",
    sectionHeaderStyle: "emoji_rich",
  },
};

export function getVariant(variantId: string): TemplateVariant {
  return TEMPLATE_VARIANTS[variantId as VariantId] || TEMPLATE_VARIANTS.minimal;
}
