// ── Quality Score System ──────────────────────────────────
// Unified scoring that wraps existing validatePremiumOutput + evaluateOsChecklist
// into a comprehensive tier-based quality system with Etsy price estimation.

import { NotionTemplateSpec } from "./notion-templates";
import {
  validatePremiumOutput,
  evaluateOsChecklist,
  type LayoutBlueprint,
} from "./premium-template-framework";

// ── Types ──

export type QualityTier = "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond";

export interface CategoryScore {
  category: string;
  score: number;     // 0-100
  maxScore: number;  // Always 100
  items: Array<{ name: string; passed: boolean; weight: number }>;
}

export interface QualityScore {
  overall: number;               // 0-100
  tier: QualityTier;
  tierEmoji: string;
  categories: CategoryScore[];
  etsyPriceEstimate: { min: number; max: number };
  missingForNextTier: string[];
  strengths: string[];
  validationResult: {
    valid: boolean;
    score: number;
    failures: string[];
    warnings: string[];
  };
  osChecklistResult?: {
    results: Array<{ rule: string; passed: boolean; category: string }>;
    score: number;
    total: number;
  };
}

// ── Tier Constants ──

const TIER_THRESHOLDS: Array<{ tier: QualityTier; minScore: number }> = [
  { tier: "Diamond", minScore: 90 },
  { tier: "Platinum", minScore: 80 },
  { tier: "Gold", minScore: 70 },
  { tier: "Silver", minScore: 55 },
  { tier: "Bronze", minScore: 0 },
];

const TIER_EMOJIS: Record<QualityTier, string> = {
  Bronze: "🥉",
  Silver: "🥈",
  Gold: "🥇",
  Platinum: "💎",
  Diamond: "👑",
};

const TIER_PRICES: Record<QualityTier, { min: number; max: number }> = {
  Bronze: { min: 2, max: 5 },
  Silver: { min: 5, max: 9 },
  Gold: { min: 8, max: 14 },
  Platinum: { min: 12, max: 20 },
  Diamond: { min: 18, max: 30 },
};

// ── Main Scoring Function ──

export function computeQualityScore(
  spec: NotionTemplateSpec,
  blueprint?: LayoutBlueprint,
  planViews?: Array<{ type?: string }>,
  plan?: Record<string, unknown>,
): QualityScore {
  // 1. Run existing validators
  const validation = validatePremiumOutput(spec, blueprint, planViews);
  const isOsUltra =
    blueprint?.visualTier === "cinematic" ||
    (plan as Record<string, unknown> | undefined)?.styleBlueprint &&
      ((plan as Record<string, unknown>)?.styleBlueprint as Record<string, unknown>)?.premiumTier === "os_ultra";
  const osChecklist = isOsUltra
    ? evaluateOsChecklist(spec, blueprint, plan)
    : undefined;

  // 2. Build 5 category scores
  const categories: CategoryScore[] = [
    buildStructureScore(spec),
    buildDataScore(spec),
    buildVisualScore(spec),
    buildUxScore(spec),
    buildSeoScore(spec, plan),
  ];

  // 3. Compute overall (weighted average)
  const overall = Math.round(
    categories.reduce((sum, c) => sum + c.score, 0) / categories.length,
  );

  // 4. Determine tier
  const tier = scoreToTier(overall);
  const tierEmoji = TIER_EMOJIS[tier];

  // 5. Etsy price estimate
  const etsyPriceEstimate = TIER_PRICES[tier];

  // 6. Missing for next tier
  const nextTier = getNextTier(tier);
  const missingForNextTier = nextTier
    ? computeMissingForTier(categories, nextTier)
    : ["You've reached the highest tier!"];

  // 7. Strengths
  const strengths = categories
    .filter((c) => c.score >= 80)
    .map((c) => `Strong ${c.category} (${c.score}/100)`);

  return {
    overall,
    tier,
    tierEmoji,
    categories,
    etsyPriceEstimate,
    missingForNextTier,
    strengths,
    validationResult: validation,
    osChecklistResult: osChecklist,
  };
}

// ── Category Score Builders ──

function buildStructureScore(spec: NotionTemplateSpec): CategoryScore {
  const items: CategoryScore["items"] = [];

  items.push({
    name: "3+ databases",
    passed: spec.databases.length >= 3,
    weight: 15,
  });

  const relationCount = spec.databases.reduce(
    (s, d) => s + d.properties.filter((p) => p.type === "relation").length,
    0,
  );
  items.push({
    name: "2+ relation properties",
    passed: relationCount >= 2,
    weight: 15,
  });

  const formulaCount = spec.databases.reduce(
    (s, d) => s + d.properties.filter((p) => p.type === "formula").length,
    0,
  );
  items.push({
    name: "3+ formula properties",
    passed: formulaCount >= 3,
    weight: 15,
  });

  items.push({
    name: "Sub-pages present",
    passed: spec.subPages.length >= 1,
    weight: 10,
  });

  items.push({
    name: "Dashboard 10+ blocks",
    passed: spec.dashboardBlocks.length >= 10,
    weight: 10,
  });

  const hasNavBar = spec.dashboardBlocks.some(
    (b) =>
      (b.type === "callout" && b.text?.includes("·")) ||
      b.type === "column_list",
  );
  items.push({
    name: "Navigation bar",
    passed: hasNavBar,
    weight: 15,
  });

  const hasToggle = spec.dashboardBlocks.some((b) => b.type === "toggle");
  items.push({
    name: "Onboarding toggle",
    passed: hasToggle,
    weight: 10,
  });

  const avgPropsPerDb =
    spec.databases.reduce((s, d) => s + d.properties.length, 0) /
    Math.max(spec.databases.length, 1);
  items.push({
    name: "5+ properties per database (avg)",
    passed: avgPropsPerDb >= 5,
    weight: 10,
  });

  const score = Math.round(
    items.reduce((s, i) => s + (i.passed ? i.weight : 0), 0),
  );
  return { category: "Structure", score, maxScore: 100, items };
}

function buildDataScore(spec: NotionTemplateSpec): CategoryScore {
  const items: CategoryScore["items"] = [];

  const totalRows = spec.databases.reduce(
    (s, d) => s + d.sampleData.length,
    0,
  );
  items.push({
    name: "25+ sample data rows total",
    passed: totalRows >= 25,
    weight: 20,
  });

  const allDbsHaveData = spec.databases.every((d) => d.sampleData.length >= 3);
  items.push({
    name: "3+ rows in every database",
    passed: allDbsHaveData,
    weight: 20,
  });

  const hasDescriptions = spec.databases.some((d) =>
    d.properties.some((p) => !!p.description),
  );
  items.push({
    name: "Property descriptions present",
    passed: hasDescriptions,
    weight: 25,
  });

  const selectPropsWithOptions = spec.databases.reduce(
    (s, d) =>
      s +
      d.properties.filter(
        (p) =>
          (p.type === "select" || p.type === "multi_select") &&
          (p.options?.length || 0) >= 3,
      ).length,
    0,
  );
  items.push({
    name: "Select properties with 3+ options",
    passed: selectPropsWithOptions >= 5,
    weight: 15,
  });

  const hasFormulaData = spec.databases.some((d) =>
    d.properties.some((p) => p.type === "formula" && p.formula && p.formula.length > 20),
  );
  items.push({
    name: "Sophisticated formulas (not just simple)",
    passed: hasFormulaData,
    weight: 20,
  });

  const score = Math.round(
    items.reduce((s, i) => s + (i.passed ? i.weight : 0), 0),
  );
  return { category: "Data", score, maxScore: 100, items };
}

function buildVisualScore(spec: NotionTemplateSpec): CategoryScore {
  const items: CategoryScore["items"] = [];

  items.push({
    name: "Cover image set",
    passed: !!(spec.cover && spec.cover.startsWith("http")),
    weight: 20,
  });

  const allDbsHaveIcons = spec.databases.every(
    (d) => d.icon && d.icon.length > 0,
  );
  items.push({
    name: "Icons on all databases",
    passed: allDbsHaveIcons,
    weight: 15,
  });

  const calloutCount = spec.dashboardBlocks.filter(
    (b) => b.type === "callout",
  ).length;
  items.push({
    name: "3+ callout sections on dashboard",
    passed: calloutCount >= 3,
    weight: 20,
  });

  const hasColumnLayout = spec.dashboardBlocks.some(
    (b) => b.type === "column_list",
  );
  items.push({
    name: "Multi-column layout",
    passed: hasColumnLayout,
    weight: 15,
  });

  const hasDividers = spec.dashboardBlocks.filter(
    (b) => b.type === "divider",
  ).length;
  items.push({
    name: "Visual section dividers",
    passed: hasDividers >= 2,
    weight: 10,
  });

  const subPageCovers = spec.subPages.filter(
    (sp) => sp.cover && sp.cover.startsWith("http"),
  ).length;
  items.push({
    name: "Sub-page cover images",
    passed: subPageCovers > 0,
    weight: 20,
  });

  const score = Math.round(
    items.reduce((s, i) => s + (i.passed ? i.weight : 0), 0),
  );
  return { category: "Visual", score, maxScore: 100, items };
}

function buildUxScore(spec: NotionTemplateSpec): CategoryScore {
  const items: CategoryScore["items"] = [];

  const hasStartHere = spec.subPages.some(
    (sp) =>
      sp.name.toLowerCase().includes("start here") ||
      sp.name.includes("🚀"),
  );
  items.push({
    name: "Start Here onboarding page",
    passed: hasStartHere,
    weight: 25,
  });

  const hasKpiRow = spec.dashboardBlocks.some(
    (b) =>
      b.type === "column_list" &&
      b.columns?.some((col) =>
        col.some((block) => block.type === "callout"),
      ),
  );
  items.push({
    name: "KPI stat card row",
    passed: hasKpiRow,
    weight: 20,
  });

  const hasHeadings = spec.dashboardBlocks.filter(
    (b) => b.type === "heading_1" || b.type === "heading_2",
  ).length;
  items.push({
    name: "Clear section headings",
    passed: hasHeadings >= 3,
    weight: 15,
  });

  const hasToggleSections = spec.dashboardBlocks.some(
    (b) => b.type === "toggle" && (b.children?.length || 0) > 0,
  );
  items.push({
    name: "Collapsible toggle sections",
    passed: hasToggleSections,
    weight: 15,
  });

  items.push({
    name: "Page icon set",
    passed: !!(spec.icon && spec.icon.length > 0),
    weight: 10,
  });

  items.push({
    name: "Description/tagline present",
    passed: !!(spec.description && spec.description.length > 10),
    weight: 15,
  });

  const score = Math.round(
    items.reduce((s, i) => s + (i.passed ? i.weight : 0), 0),
  );
  return { category: "UX", score, maxScore: 100, items };
}

function buildSeoScore(
  spec: NotionTemplateSpec,
  plan?: Record<string, unknown>,
): CategoryScore {
  const items: CategoryScore["items"] = [];

  // Template name quality — not generic
  const nameWords = spec.name.split(/\s+/).length;
  items.push({
    name: "Descriptive template name (3+ words)",
    passed: nameWords >= 3,
    weight: 20,
  });

  items.push({
    name: "Template description present",
    passed: !!(spec.description && spec.description.length > 15),
    weight: 20,
  });

  // Check if plan has Etsy tags
  const etsyTags = (plan as Record<string, unknown> | undefined)?.etsyListing
    ? ((plan as Record<string, unknown>).etsyListing as Record<string, unknown>)?.tags
    : undefined;
  items.push({
    name: "13 Etsy tags available",
    passed: Array.isArray(etsyTags) && (etsyTags as unknown[]).length >= 13,
    weight: 20,
  });

  // Database names are descriptive (not just key names)
  const descriptiveDbNames = spec.databases.every(
    (d) => d.name.length > 3 && d.name !== d.key,
  );
  items.push({
    name: "Descriptive database names",
    passed: descriptiveDbNames,
    weight: 20,
  });

  // Multiple databases suggest comprehensive product
  items.push({
    name: "4+ databases (comprehensive)",
    passed: spec.databases.length >= 4,
    weight: 20,
  });

  const score = Math.round(
    items.reduce((s, i) => s + (i.passed ? i.weight : 0), 0),
  );
  return { category: "SEO", score, maxScore: 100, items };
}

// ── Helpers ──

function scoreToTier(score: number): QualityTier {
  for (const { tier, minScore } of TIER_THRESHOLDS) {
    if (score >= minScore) return tier;
  }
  return "Bronze";
}

function getNextTier(current: QualityTier): QualityTier | null {
  const order: QualityTier[] = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
  const idx = order.indexOf(current);
  return idx < order.length - 1 ? order[idx + 1] : null;
}

function computeMissingForTier(
  categories: CategoryScore[],
  _targetTier: QualityTier,
): string[] {
  // Collect all failed items across categories, sorted by weight (easiest wins first)
  const allFailed: Array<{ name: string; category: string; weight: number }> = [];

  for (const cat of categories) {
    for (const item of cat.items) {
      if (!item.passed) {
        allFailed.push({
          name: item.name,
          category: cat.category,
          weight: item.weight,
        });
      }
    }
  }

  // Sort by weight descending — highest impact first
  allFailed.sort((a, b) => b.weight - a.weight);

  // Return top 5 suggestions
  return allFailed.slice(0, 5).map(
    (f) => `${f.category}: ${f.name} (+${f.weight} points)`,
  );
}
