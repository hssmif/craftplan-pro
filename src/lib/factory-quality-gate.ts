// ══════════════════════════════════════════════════════════════
// Factory Quality Gate
// Evaluates a ProductBlueprint (+ optional listing/image plan)
// across 6 dimensions before allowing it to proceed.
// ══════════════════════════════════════════════════════════════

import type {
  ProductBlueprint,
  ListingCopyPackage,
  ListingImagePlan,
  BlueprintTab,
  BlueprintChart,
} from "@/types/factory";

// ── Types ───────────────────────────────────────────────────

export interface DimensionScore {
  score: number;
  details: string[];
}

export interface QualityScore {
  overall: number;
  dimensions: {
    contentDepth: DimensionScore;
    nicheSpecificity: DimensionScore;
    visualCompleteness: DimensionScore;
    listingReadiness: DimensionScore;
    commercialViability: DimensionScore;
    technicalQuality: DimensionScore;
  };
  passed: boolean; // overall >= 70
  blockers: string[]; // critical issues that must be fixed
  suggestions: string[]; // nice-to-have improvements
}

// ── Generic terms used to detect non-niche content ──────────

const GENERIC_DASHBOARD_TITLES = [
  "budget dashboard",
  "monthly tracker",
  "expense tracker",
  "budget tracker",
  "finance dashboard",
  "spending tracker",
  "monthly budget",
  "personal budget",
  "simple budget",
  "household budget",
];

const GENERIC_SAVINGS_GOALS = [
  "emergency fund",
  "vacation",
  "savings",
  "retirement",
  "rainy day",
  "general savings",
];

const GENERIC_BUCKET_NAMES = [
  "savings",
  "needs",
  "wants",
  "bills",
  "income",
  "expenses",
  "other",
  "miscellaneous",
];

const GENERIC_TRANSACTION_DESCRIPTIONS = [
  "rent",
  "groceries",
  "utilities",
  "gas",
  "insurance",
  "phone",
  "internet",
  "subscription",
  "dining out",
  "entertainment",
  "clothing",
  "gym",
  "coffee",
];

// ── Dimension scorers ───────────────────────────────────────

function scoreContentDepth(bp: ProductBlueprint): DimensionScore {
  let score = 0;
  const details: string[] = [];

  // Tabs count: >= 6 = 20pts, >= 4 = 10pts
  if (bp.tabs.length >= 6) {
    score += 20;
    details.push(`${bp.tabs.length} tabs (excellent)`);
  } else if (bp.tabs.length >= 4) {
    score += 10;
    details.push(`${bp.tabs.length} tabs (adequate, 6+ preferred)`);
  } else {
    details.push(`Only ${bp.tabs.length} tabs (need at least 4)`);
  }

  // Total sample rows: >= 20 = 20pts, >= 10 = 10pts
  const totalRows = bp.tabs.reduce((sum, t) => sum + t.sampleRows.length, 0);
  if (totalRows >= 20) {
    score += 20;
    details.push(`${totalRows} sample rows (rich data)`);
  } else if (totalRows >= 10) {
    score += 10;
    details.push(`${totalRows} sample rows (adequate, 20+ preferred)`);
  } else {
    details.push(`Only ${totalRows} sample rows (need at least 10)`);
  }

  // Dashboard with formulas = 20pts
  const dashboard = bp.tabs.find(
    (t) => t.name.toLowerCase().includes("dashboard") || t.purpose.toLowerCase().includes("dashboard")
  );
  if (dashboard) {
    const hasFormulas = dashboard.sampleRows.some((row) =>
      row.some((cell) => typeof cell === "string" && cell.startsWith("="))
    );
    if (hasFormulas) {
      score += 20;
      details.push("Dashboard tab with formulas present");
    } else {
      score += 10;
      details.push("Dashboard tab exists but lacks formulas");
    }
  } else {
    details.push("No Dashboard tab found");
  }

  // Charts >= 2 = 20pts
  if (bp.charts.length >= 2) {
    score += 20;
    details.push(`${bp.charts.length} charts defined`);
  } else if (bp.charts.length === 1) {
    score += 10;
    details.push("Only 1 chart (2+ recommended)");
  } else {
    details.push("No charts defined");
  }

  // Features (validation, conditional formatting) = 20pts
  const allFeatures = new Set(bp.tabs.flatMap((t) => t.features));
  const hasValidation = allFeatures.has("dropdown_validation");
  const hasConditionalFormatting = allFeatures.has("conditional_formatting");
  if (hasValidation && hasConditionalFormatting) {
    score += 20;
    details.push("Has dropdown validation and conditional formatting");
  } else if (hasValidation || hasConditionalFormatting) {
    score += 10;
    details.push(
      `Has ${hasValidation ? "dropdown validation" : "conditional formatting"} only`
    );
  } else {
    details.push("Missing validation and conditional formatting features");
  }

  return { score: Math.min(score, 100), details };
}

function scoreNicheSpecificity(bp: ProductBlueprint): DimensionScore {
  let score = 0;
  const details: string[] = [];

  // 1. Dashboard title is NOT generic = 25pts
  const dashboard = bp.tabs.find(
    (t) => t.name.toLowerCase().includes("dashboard") || t.purpose.toLowerCase().includes("dashboard")
  );
  if (dashboard) {
    const isGenericTitle = GENERIC_DASHBOARD_TITLES.some(
      (g) => dashboard.name.toLowerCase().includes(g) || dashboard.purpose.toLowerCase().includes(g)
    );
    if (!isGenericTitle) {
      score += 25;
      details.push(`Dashboard title "${dashboard.name}" is niche-specific`);
    } else {
      details.push(`Dashboard title "${dashboard.name}" is too generic`);
    }
  } else {
    details.push("No dashboard tab to evaluate title specificity");
  }

  // 2. Savings goals are niche-specific = 25pts
  const savingsTab = bp.tabs.find(
    (t) =>
      t.name.toLowerCase().includes("goal") ||
      t.name.toLowerCase().includes("saving") ||
      t.purpose.toLowerCase().includes("goal") ||
      t.purpose.toLowerCase().includes("saving")
  );
  if (savingsTab) {
    const allValues = savingsTab.sampleRows
      .flat()
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.toLowerCase());
    const genericCount = allValues.filter((v) =>
      GENERIC_SAVINGS_GOALS.some((g) => v.includes(g))
    ).length;
    const genericRatio = allValues.length > 0 ? genericCount / allValues.length : 1;
    if (genericRatio < 0.3) {
      score += 25;
      details.push("Savings goals are niche-specific");
    } else if (genericRatio < 0.6) {
      score += 12;
      details.push("Some savings goals are generic — customize more");
    } else {
      details.push("Most savings goals are generic (e.g., Emergency Fund, Vacation)");
    }
  } else {
    // No savings tab — award partial credit (not applicable)
    score += 15;
    details.push("No savings/goals tab — dimension partially N/A");
  }

  // 3. Transaction descriptions are niche-specific = 25pts
  const transactionTab = bp.tabs.find(
    (t) =>
      t.name.toLowerCase().includes("transaction") ||
      t.name.toLowerCase().includes("expense") ||
      t.name.toLowerCase().includes("log") ||
      t.purpose.toLowerCase().includes("transaction")
  );
  if (transactionTab) {
    const allValues = transactionTab.sampleRows
      .flat()
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.toLowerCase());
    const genericCount = allValues.filter((v) =>
      GENERIC_TRANSACTION_DESCRIPTIONS.some((g) => v.includes(g))
    ).length;
    const genericRatio = allValues.length > 0 ? genericCount / allValues.length : 1;
    if (genericRatio < 0.3) {
      score += 25;
      details.push("Transaction descriptions are niche-specific");
    } else if (genericRatio < 0.6) {
      score += 12;
      details.push("Some transaction descriptions are generic");
    } else {
      details.push("Most transaction descriptions are generic (Rent, Groceries, etc.)");
    }
  } else {
    score += 15;
    details.push("No transaction/expense tab — dimension partially N/A");
  }

  // 4. Bucket names are customized = 25pts
  const allTabNames = bp.tabs.map((t) => t.name.toLowerCase());
  const allColumnNames = bp.tabs
    .flatMap((t) => t.columns.map((c) => c.name.toLowerCase()));
  const combinedNames = [...allTabNames, ...allColumnNames];
  const genericBucketCount = combinedNames.filter((n) =>
    GENERIC_BUCKET_NAMES.some((g) => n === g)
  ).length;
  if (genericBucketCount <= 1) {
    score += 25;
    details.push("Tab/column naming is customized for the niche");
  } else if (genericBucketCount <= 3) {
    score += 12;
    details.push("Some tab/column names are generic — consider customizing");
  } else {
    details.push("Many generic bucket names (Savings, Needs, Wants, Bills)");
  }

  return { score: Math.min(score, 100), details };
}

function scoreVisualCompleteness(bp: ProductBlueprint): DimensionScore {
  let score = 0;
  const details: string[] = [];

  // Has Dashboard tab = 20pts
  const hasDashboard = bp.tabs.some(
    (t) => t.name.toLowerCase().includes("dashboard")
  );
  if (hasDashboard) {
    score += 20;
    details.push("Dashboard tab present");
  } else {
    details.push("No Dashboard tab — critical for visual appeal");
  }

  // Has colorScheme defined = 15pts
  if (bp.colorScheme && bp.colorScheme.primary && bp.colorScheme.accent) {
    score += 15;
    details.push(`Color scheme defined (primary: ${bp.colorScheme.primary})`);
  } else {
    details.push("Color scheme not fully defined");
  }

  // Has charts >= 2 = 20pts
  if (bp.charts.length >= 2) {
    score += 20;
    details.push(`${bp.charts.length} charts for visual richness`);
  } else if (bp.charts.length === 1) {
    score += 10;
    details.push("Only 1 chart — add more for visual appeal");
  } else {
    details.push("No charts — product will look plain");
  }

  // Has conditional_formatting = 15pts
  const allFeatures = new Set(bp.tabs.flatMap((t) => t.features));
  if (allFeatures.has("conditional_formatting")) {
    score += 15;
    details.push("Conditional formatting enabled");
  } else {
    details.push("No conditional formatting — add color-coded status indicators");
  }

  // Has dropdown_validation = 15pts
  if (allFeatures.has("dropdown_validation")) {
    score += 15;
    details.push("Dropdown validation enabled");
  } else {
    details.push("No dropdown validation — improves user experience");
  }

  // Has frozen_header = 15pts
  if (allFeatures.has("frozen_header")) {
    score += 15;
    details.push("Frozen headers enabled");
  } else {
    details.push("No frozen headers — usability issue for large data sets");
  }

  return { score: Math.min(score, 100), details };
}

function scoreListingReadiness(
  bp: ProductBlueprint,
  listingCopy?: ListingCopyPackage,
  imagePlan?: ListingImagePlan
): DimensionScore {
  let score = 0;
  const details: string[] = [];

  if (!listingCopy) {
    details.push("No listing copy provided — scoring blueprint-level listing fields only");

    // Fall back to blueprint-level fields
    if (bp.listingStrategy?.titleKeywords?.length > 0) {
      score += 15;
      details.push("Title keywords present in blueprint");
    }
    if (bp.differentiation?.suggestedPrice) {
      score += 15;
      details.push("Pricing present in blueprint");
    }
    if (bp.positioning) {
      score += 10;
      details.push("Positioning statement present");
    }

    return { score: Math.min(score, 100), details };
  }

  // Has recommendedTitle = 15pts
  if (listingCopy.recommendedTitle && listingCopy.recommendedTitle.length > 10) {
    score += 15;
    details.push(`Title: "${listingCopy.recommendedTitle.slice(0, 50)}..."`);
  } else {
    details.push("Missing or too short recommended title");
  }

  // Has 13 tags = 20pts
  if (listingCopy.tags.length === 13) {
    score += 20;
    details.push("All 13 Etsy tags present");
  } else if (listingCopy.tags.length >= 10) {
    score += 12;
    details.push(`Only ${listingCopy.tags.length}/13 tags`);
  } else {
    details.push(`Only ${listingCopy.tags.length}/13 tags — needs more`);
  }

  // Has fullDescription > 200 chars = 20pts
  if (listingCopy.fullDescription && listingCopy.fullDescription.length > 200) {
    score += 20;
    details.push(`Description is ${listingCopy.fullDescription.length} chars`);
  } else if (listingCopy.fullDescription && listingCopy.fullDescription.length > 50) {
    score += 10;
    details.push("Description is short — aim for 200+ chars");
  } else {
    details.push("Missing or very short description");
  }

  // Has pricing = 15pts
  if (listingCopy.pricing && listingCopy.pricing.launchPrice > 0) {
    score += 15;
    details.push(
      `Pricing set: $${listingCopy.pricing.launchPrice} launch / $${listingCopy.pricing.standardPrice} standard`
    );
  } else {
    details.push("No pricing set");
  }

  // Has image plan with 7 images = 15pts
  if (imagePlan && imagePlan.images.length >= 7) {
    score += 15;
    details.push("Image plan has 7 images");
  } else if (imagePlan && imagePlan.images.length >= 4) {
    score += 8;
    details.push(`Image plan has only ${imagePlan.images.length}/7 images`);
  } else {
    details.push("Image plan missing or incomplete");
  }

  // Has delivery instructions = 15pts
  if (listingCopy.deliveryInstructions && listingCopy.deliveryInstructions.length > 20) {
    score += 15;
    details.push("Delivery instructions present");
  } else {
    details.push("Missing delivery instructions");
  }

  return { score: Math.min(score, 100), details };
}

function scoreCommercialViability(bp: ProductBlueprint): DimensionScore {
  let score = 0;
  const details: string[] = [];

  // suggestedPrice >= 5 and <= 25 = 25pts
  const price = bp.suggestedPrice ?? bp.differentiation?.suggestedPrice?.recommended ?? 0;
  if (price >= 5 && price <= 25) {
    score += 25;
    details.push(`Price $${price} is within competitive Etsy range ($5-$25)`);
  } else if (price > 25 && price <= 40) {
    score += 15;
    details.push(`Price $${price} is above typical range — needs strong justification`);
  } else if (price > 0 && price < 5) {
    score += 10;
    details.push(`Price $${price} is too low — perceived as low quality`);
  } else {
    details.push("No price set or price is $0");
  }

  // Has >= 3 differentiators = 25pts
  const diffCount = bp.differentiation?.ourImprovements?.length ?? 0;
  if (diffCount >= 3) {
    score += 25;
    details.push(`${diffCount} differentiators identified`);
  } else if (diffCount >= 1) {
    score += 12;
    details.push(`Only ${diffCount} differentiator(s) — identify more`);
  } else {
    details.push("No differentiators identified — how does this stand out?");
  }

  // Has positioning statement = 25pts
  if (bp.positioning && bp.positioning.length > 10) {
    score += 25;
    details.push(`Positioning: "${bp.positioning.slice(0, 60)}..."`);
  } else if (bp.differentiation?.positioningAngle) {
    score += 15;
    details.push("Has positioning angle but no full positioning statement");
  } else {
    details.push("No positioning statement");
  }

  // Has listingStrategy with titleKeywords = 25pts
  if (bp.listingStrategy?.titleKeywords?.length > 0) {
    score += 25;
    details.push(
      `Listing strategy with ${bp.listingStrategy.titleKeywords.length} title keywords`
    );
  } else {
    details.push("No listing strategy title keywords");
  }

  return { score: Math.min(score, 100), details };
}

function scoreTechnicalQuality(bp: ProductBlueprint): DimensionScore {
  let score = 0;
  const details: string[] = [];

  // All tabs have columns.length > 0 = 20pts
  const emptyColumnTabs = bp.tabs.filter((t) => t.columns.length === 0);
  if (emptyColumnTabs.length === 0) {
    score += 20;
    details.push("All tabs have column definitions");
  } else {
    details.push(
      `${emptyColumnTabs.length} tab(s) have no columns: ${emptyColumnTabs.map((t) => t.name).join(", ")}`
    );
  }

  // No empty tabs (sampleRows.length > 0 for data tabs) = 20pts
  // Dashboard is exempt since it can rely on formulas
  const dataTabs = bp.tabs.filter(
    (t) => !t.name.toLowerCase().includes("dashboard") && !t.name.toLowerCase().includes("instructions")
  );
  const emptyDataTabs = dataTabs.filter((t) => t.sampleRows.length === 0);
  if (emptyDataTabs.length === 0) {
    score += 20;
    details.push("All data tabs have sample rows");
  } else {
    details.push(
      `${emptyDataTabs.length} data tab(s) have no sample rows: ${emptyDataTabs.map((t) => t.name).join(", ")}`
    );
  }

  // Dashboard has formulas (strings starting with "=") = 20pts
  const dashboard = bp.tabs.find((t) =>
    t.name.toLowerCase().includes("dashboard")
  );
  if (dashboard) {
    const formulaCount = dashboard.sampleRows
      .flat()
      .filter((cell) => typeof cell === "string" && cell.startsWith("=")).length;
    if (formulaCount > 0) {
      score += 20;
      details.push(`Dashboard has ${formulaCount} formula(s)`);
    } else {
      details.push("Dashboard has no formulas — should aggregate data from other tabs");
    }
  } else {
    details.push("No dashboard tab for formula check");
  }

  // Tab names are valid (no duplicates) = 20pts
  const tabNames = bp.tabs.map((t) => t.name);
  const uniqueNames = new Set(tabNames);
  if (uniqueNames.size === tabNames.length) {
    score += 20;
    details.push("All tab names are unique");
  } else {
    const dupes = tabNames.filter((n, i) => tabNames.indexOf(n) !== i);
    details.push(`Duplicate tab names: ${[...new Set(dupes)].join(", ")}`);
  }

  // Charts reference existing tabs = 20pts
  const tabNameSet = new Set(bp.tabs.map((t) => t.name));
  const badCharts = bp.charts.filter(
    (c) => !tabNameSet.has(c.sourceTab) || !tabNameSet.has(c.placement.tab)
  );
  if (bp.charts.length === 0) {
    details.push("No charts to validate tab references");
  } else if (badCharts.length === 0) {
    score += 20;
    details.push("All charts reference existing tabs");
  } else {
    details.push(
      `${badCharts.length} chart(s) reference non-existent tabs: ${badCharts.map((c) => `"${c.title}" → ${c.sourceTab}`).join(", ")}`
    );
  }

  return { score: Math.min(score, 100), details };
}

// ── Blocker / Suggestion extraction ─────────────────────────

function extractBlockers(
  bp: ProductBlueprint,
  dims: QualityScore["dimensions"]
): string[] {
  const blockers: string[] = [];

  if (bp.tabs.length < 3) {
    blockers.push("Product has fewer than 3 tabs — too thin to sell");
  }

  const emptyColumnTabs = bp.tabs.filter((t) => t.columns.length === 0);
  if (emptyColumnTabs.length > 0) {
    blockers.push(
      `Tabs with no columns will produce blank sheets: ${emptyColumnTabs.map((t) => t.name).join(", ")}`
    );
  }

  const tabNames = bp.tabs.map((t) => t.name);
  if (new Set(tabNames).size !== tabNames.length) {
    blockers.push("Duplicate tab names will cause generation errors");
  }

  if (dims.contentDepth.score < 30) {
    blockers.push("Content depth is critically low — product appears empty");
  }

  if (dims.technicalQuality.score < 30) {
    blockers.push("Technical quality too low — likely broken spreadsheet");
  }

  if (!bp.suggestedPrice && !bp.differentiation?.suggestedPrice?.recommended) {
    blockers.push("No price set — cannot list without pricing");
  }

  return blockers;
}

function extractSuggestions(
  dims: QualityScore["dimensions"]
): string[] {
  const suggestions: string[] = [];

  if (dims.nicheSpecificity.score < 60) {
    suggestions.push(
      "Replace generic terms (Emergency Fund, Rent, Groceries) with niche-specific examples"
    );
  }

  if (dims.visualCompleteness.score < 60) {
    suggestions.push("Add more visual elements: charts, conditional formatting, color coding");
  }

  if (dims.contentDepth.score < 80) {
    suggestions.push("Add more sample data rows to make screenshots look fuller");
  }

  if (dims.commercialViability.score < 60) {
    suggestions.push("Strengthen positioning — add more differentiators and clearer USPs");
  }

  if (dims.listingReadiness.score < 50) {
    suggestions.push("Complete listing copy (title, tags, description) before publishing");
  }

  return suggestions;
}

// ── Public API ──────────────────────────────────────────────

/**
 * Evaluate a ProductBlueprint on its own (before listing copy is generated).
 * Listing Readiness is scored using blueprint-level fields only.
 */
export function evaluateBlueprint(blueprint: ProductBlueprint): QualityScore {
  const dimensions = {
    contentDepth: scoreContentDepth(blueprint),
    nicheSpecificity: scoreNicheSpecificity(blueprint),
    visualCompleteness: scoreVisualCompleteness(blueprint),
    listingReadiness: scoreListingReadiness(blueprint),
    commercialViability: scoreCommercialViability(blueprint),
    technicalQuality: scoreTechnicalQuality(blueprint),
  };

  const dimScores = Object.values(dimensions).map((d) => d.score);
  const overall = Math.round(dimScores.reduce((a, b) => a + b, 0) / dimScores.length);

  const blockers = extractBlockers(blueprint, dimensions);
  const suggestions = extractSuggestions(dimensions);

  return {
    overall,
    dimensions,
    passed: overall >= 70 && blockers.length === 0,
    blockers,
    suggestions,
  };
}

/**
 * Evaluate the full factory package: blueprint + listing copy + image plan.
 * All 6 dimensions are scored with full context.
 */
export function evaluateFullPackage(
  blueprint: ProductBlueprint,
  listingCopy?: ListingCopyPackage,
  imagePlan?: ListingImagePlan
): QualityScore {
  const dimensions = {
    contentDepth: scoreContentDepth(blueprint),
    nicheSpecificity: scoreNicheSpecificity(blueprint),
    visualCompleteness: scoreVisualCompleteness(blueprint),
    listingReadiness: scoreListingReadiness(blueprint, listingCopy, imagePlan),
    commercialViability: scoreCommercialViability(blueprint),
    technicalQuality: scoreTechnicalQuality(blueprint),
  };

  const dimScores = Object.values(dimensions).map((d) => d.score);
  const overall = Math.round(dimScores.reduce((a, b) => a + b, 0) / dimScores.length);

  const blockers = extractBlockers(blueprint, dimensions);
  const suggestions = extractSuggestions(dimensions);

  return {
    overall,
    dimensions,
    passed: overall >= 70 && blockers.length === 0,
    blockers,
    suggestions,
  };
}
