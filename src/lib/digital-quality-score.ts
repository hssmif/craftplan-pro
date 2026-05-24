// ══════════════════════════════════════════════════════════════
// Digital Product Studio: Shared Quality Scoring Engine
// Scores all 4 digital product types across 4 categories:
//   Content (0-25) · Design (0-25) · Completeness (0-25) · Etsy Readiness (0-25)
// Maps to 4 tiers: BASIC / STANDARD / PREMIUM / ULTRA
// with type-specific Etsy price estimates.
// ══════════════════════════════════════════════════════════════

import type {
  DigitalProduct,
  DigitalProductType,
  DigitalQualityScore,
} from "@/types/digital-product";

// ── Tier Thresholds ──────────────────────────────────────────

type QualityTier = DigitalQualityScore["tier"];

const TIER_THRESHOLDS: Array<{ tier: QualityTier; minScore: number }> = [
  { tier: "ULTRA", minScore: 85 },
  { tier: "PREMIUM", minScore: 65 },
  { tier: "STANDARD", minScore: 40 },
  { tier: "BASIC", minScore: 0 },
];

// ── Price Estimates per Type + Tier ──────────────────────────

const PRICE_ESTIMATES: Record<DigitalProductType, Record<QualityTier, { min: number; max: number }>> = {
  pdf: {
    BASIC: { min: 2, max: 4 },
    STANDARD: { min: 4, max: 7 },
    PREMIUM: { min: 6, max: 10 },
    ULTRA: { min: 8, max: 15 },
  },
  excel: {
    BASIC: { min: 3, max: 5 },
    STANDARD: { min: 5, max: 8 },
    PREMIUM: { min: 7, max: 12 },
    ULTRA: { min: 10, max: 18 },
  },
  printable: {
    BASIC: { min: 1, max: 3 },
    STANDARD: { min: 3, max: 5 },
    PREMIUM: { min: 5, max: 8 },
    ULTRA: { min: 7, max: 12 },
  },
  notion: {
    BASIC: { min: 3, max: 5 },
    STANDARD: { min: 5, max: 10 },
    PREMIUM: { min: 10, max: 18 },
    ULTRA: { min: 15, max: 30 },
  },
};

// ── Main Scoring Function ────────────────────────────────────

export function computeDigitalProductScore(
  product: DigitalProduct
): DigitalQualityScore {
  const content = scoreContent(product);
  const design = scoreDesign(product);
  const completeness = scoreCompleteness(product);
  const etsyReadiness = scoreEtsyReadiness(product);

  const overall = content + design + completeness + etsyReadiness;
  const tier = scoreToTier(overall);
  const etsyPriceEstimate = PRICE_ESTIMATES[product.productType][tier];

  return {
    overall,
    tier,
    breakdown: {
      content,
      design,
      completeness,
      etsyReadiness,
    },
    etsyPriceEstimate,
  };
}

// ── Content Score (0-25) ─────────────────────────────────────
// Measures how rich and well-configured the product content is.

function scoreContent(product: DigitalProduct): number {
  const { config, generation, productType } = product;
  let score = 0;

  if (!config) return 0;

  switch (productType) {
    case "pdf": {
      if (config.type !== "pdf") break;
      score += 5; // Config exists
      if (config.plannerType && config.plannerType !== "generic") score += 5;
      if (config.year) score += 5;
      if (config.customTitle) score += 5;
      if (config.paperSize) score += 5;
      break;
    }

    case "excel": {
      if (config.type !== "excel") break;
      score += 8; // Config exists
      if (config.trackerType) score += 8;
      if (config.customCategories && config.customCategories.length > 0) score += 9;
      break;
    }

    case "printable": {
      if (config.type !== "printable") break;
      score += 8; // Config exists
      if (config.printableType) score += 8;
      if (config.quoteTheme || (config.customQuotes && config.customQuotes.length > 0)) score += 9;
      break;
    }

    case "notion": {
      if (config.type !== "notion") break;
      if (config.templateType) score += 5;
      if (config.premium) score += 5;
      if (config.complexity === "advanced") score += 5;
      // Bonus for databases created
      if (generation.result?.type === "notion") {
        const dbCount = Math.min(generation.result.databases.length, 3);
        score += dbCount * 3; // Up to 9 points
      }
      // Cap at 25 since notion can score slightly over
      score += config.features && config.features.length > 2 ? 1 : 0;
      break;
    }
  }

  return Math.min(score, 25);
}

// ── Design Score (0-25) ──────────────────────────────────────
// Measures visual quality and generation completeness.

function scoreDesign(product: DigitalProduct): number {
  const { config, generation, productType } = product;
  let score = 0;

  // Color scheme / aesthetic selected
  if (config) {
    switch (config.type) {
      case "pdf":
        if (config.colorTheme) score += 10;
        if (config.designStyle) score += 3;
        break;
      case "excel":
        if (config.colorScheme) score += 10;
        break;
      case "printable":
        if (config.colorScheme) score += 10;
        break;
      case "notion":
        if (config.aesthetic) score += 10;
        break;
    }
  }

  // Generation completed
  if (generation.status === "done" && generation.result) {
    score += 10;
  }

  // Type-specific quality
  if (productType === "notion" && generation.result?.type === "notion") {
    const tier = generation.result.qualityTier;
    if (tier === "PREMIUM") score += 3;
    else if (tier === "ULTRA") score += 5;
  } else if (generation.result?.type === "file") {
    // File size suggests decent content (> 10KB)
    if (generation.result.fileSizeBytes > 10240) score += 5;
  }

  return Math.min(score, 25);
}

// ── Completeness Score (0-25) ────────────────────────────────
// Measures how far through the pipeline the product has progressed.

function scoreCompleteness(product: DigitalProduct): number {
  let score = 0;

  // Generation done
  if (product.generation.status === "done") score += 5;

  // Preview / mockups exist
  if (
    product.preview.mockupStatus === "done" ||
    product.preview.mockups.length > 0 ||
    product.preview.thumbnailUrl
  ) {
    score += 5;
  }

  // Listing generated
  if (
    product.listing.status === "done" ||
    product.listing.status === "edited"
  ) {
    score += 5;
  }

  // Listing has 13 tags (Etsy max)
  if (product.listing.tags.length >= 13) score += 5;

  // Listing title is good length (80-140 chars)
  if (product.listing.title.length >= 80 && product.listing.title.length <= 140) {
    score += 5;
  } else if (product.listing.title.length >= 50) {
    score += 3;
  }

  return Math.min(score, 25);
}

// ── Etsy Readiness Score (0-25) ──────────────────────────────
// Measures how ready the product is for Etsy listing.

function scoreEtsyReadiness(product: DigitalProduct): number {
  let score = 0;

  // Title quality
  if (product.listing.title.length > 50) score += 5;

  // Description length
  if (product.listing.description.length > 200) score += 5;

  // Tag count (10+ is good, 13 is max)
  if (product.listing.tags.length >= 10) score += 5;

  // Price set
  if (product.listing.price.recommended > 0) score += 5;

  // Mockups ready for listing photos
  if (product.preview.mockups.filter((m) => m.status === "done").length >= 2) {
    score += 5;
  }

  return Math.min(score, 25);
}

// ── Helpers ──────────────────────────────────────────────────

function scoreToTier(score: number): QualityTier {
  for (const { tier, minScore } of TIER_THRESHOLDS) {
    if (score >= minScore) return tier;
  }
  return "BASIC";
}
