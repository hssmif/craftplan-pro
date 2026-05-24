// ══════════════════════════════════════════════════════════════
// Layout Family System
//
// Separates STRUCTURE from STYLE. NicheDesignProfile handles
// colors/typography/tokens. LayoutFamily handles composition,
// section ordering, content density, and spatial arrangement.
//
// Three families:
//   - nurture:   Baby, Pregnancy, Savings — warm, spacious, milestone-focused
//   - executive: Business, Side Hustle, Debt — dense, data-forward, analytical
//   - editorial: Wedding, Meal Planner — elegant, curated, magazine-style
//
// Each family defines different SVG compositions for key slots.
// ══════════════════════════════════════════════════════════════

export type LayoutFamilyId = "nurture" | "executive" | "editorial";

// ── Dashboard Layout Variants ────────────────────────────────

export type DashboardLayout =
  | "kpi-grid-bars"          // Nurture: 2×2 KPI grid + horizontal spending bars + milestone callout
  | "kpi-strip-table-chart"  // Executive: 4-across KPI strip + bordered table + P&L bar + vertical bar chart
  | "kpi-cards-elegant-table"; // Editorial: 3 centered serif cards + clean-line table + ornamental summary

// ── Feature Layout Variants ──────────────────────────────────

export type FeatureLayout =
  | "milestone-tracker"      // Nurture: vertical savings goals with milestone markers, thermometer style
  | "financial-comparison"   // Executive: revenue vs expenses dual-column + profit metric + comparison bars
  | "elegant-progress"       // Editorial: centered progress cards with ornamental dividers

// ── Method Layout Variants ───────────────────────────────────

export type MethodLayout =
  | "vertical-journey"       // Nurture: budget icons + vertical 3-step with dotted connector
  | "horizontal-pipeline"    // Executive: allocation table + horizontal timeline steps
  | "showcase-columns"       // Editorial: elegant column cards + centered serif steps

// ── Included Layout Variants ─────────────────────────────────

export type IncludedLayout =
  | "card-grid-2col"         // Nurture: 2-column with pastel left borders, description text
  | "compact-grid-3col"      // Executive: 3-column minimal rows
  | "elegant-grid-2col"      // Editorial: 2-column with decorative borders, serif text

// ── Hero Layout Variants ─────────────────────────────────────

export type HeroLayout =
  | "centered-laptop-soft"   // Nurture: large centered laptop, soft gradient, pill features below
  | "angled-laptop-dark"     // Executive: dark bg, angled laptop, data-dense screen, badge strip
  | "centered-laptop-cream"  // Editorial: cream bg, centered laptop, serif title, elegant features

// ── Layout Family Definition ─────────────────────────────────

export interface LayoutFamily {
  id: LayoutFamilyId;
  label: string;
  description: string;

  // Which compositions to use per slot
  dashboard: DashboardLayout;
  feature: FeatureLayout;
  method: MethodLayout;
  included: IncludedLayout;
  hero: HeroLayout;

  // Content density
  contentDensity: "spacious" | "balanced" | "dense";

  // Section ordering in dashboard
  dashboardSections: Array<"kpis" | "table" | "chart" | "summary" | "callout">;

  // Feature slot content emphasis
  featureEmphasis: "savings-goals" | "financial-metrics" | "budget-progress";

  // Method slot structure
  methodStepStyle: "vertical-cards" | "horizontal-timeline" | "centered-elegant";

  // Spacing multiplier (1.0 = default)
  spacingScale: number;

  // Whether to show comparison columns (budget vs actual)
  showBudgetComparison: boolean;

  // Chart style preference
  chartPreference: "horizontal-bars" | "vertical-bars" | "progress-rings" | "none";

  // How many KPI cards to show (2, 3, or 4)
  kpiCount: 2 | 3 | 4;

  // Card arrangement pattern
  cardPattern: "grid" | "list" | "masonry";
}

// ══════════════════════════════════════════════════════════════
// Family Definitions
// ══════════════════════════════════════════════════════════════

const NURTURE_FAMILY: LayoutFamily = {
  id: "nurture",
  label: "Nurture Family",
  description: "Warm, spacious, milestone-focused layouts for family & personal finance",

  dashboard: "kpi-grid-bars",
  feature: "milestone-tracker",
  method: "vertical-journey",
  included: "card-grid-2col",
  hero: "centered-laptop-soft",

  contentDensity: "spacious",
  dashboardSections: ["kpis", "table", "chart", "callout"],
  featureEmphasis: "savings-goals",
  methodStepStyle: "vertical-cards",
  spacingScale: 1.2,
  showBudgetComparison: true,
  chartPreference: "horizontal-bars",
  kpiCount: 4,
  cardPattern: "grid",
};

const EXECUTIVE_FAMILY: LayoutFamily = {
  id: "executive",
  label: "Executive Family",
  description: "Dense, data-forward, analytical layouts for business & financial tracking",

  dashboard: "kpi-strip-table-chart",
  feature: "financial-comparison",
  method: "horizontal-pipeline",
  included: "compact-grid-3col",
  hero: "angled-laptop-dark",

  contentDensity: "dense",
  dashboardSections: ["kpis", "table", "summary", "chart"],
  featureEmphasis: "financial-metrics",
  methodStepStyle: "horizontal-timeline",
  spacingScale: 0.85,
  showBudgetComparison: true,
  chartPreference: "vertical-bars",
  kpiCount: 4,
  cardPattern: "list",
};

const EDITORIAL_FAMILY: LayoutFamily = {
  id: "editorial",
  label: "Editorial Family",
  description: "Elegant, curated, magazine-style layouts for premium planning products",

  dashboard: "kpi-cards-elegant-table",
  feature: "elegant-progress",
  method: "showcase-columns",
  included: "elegant-grid-2col",
  hero: "centered-laptop-cream",

  contentDensity: "balanced",
  dashboardSections: ["kpis", "table", "chart"],
  featureEmphasis: "budget-progress",
  methodStepStyle: "centered-elegant",
  spacingScale: 1.0,
  showBudgetComparison: false,
  chartPreference: "progress-rings",
  kpiCount: 3,
  cardPattern: "grid",
};

// ══════════════════════════════════════════════════════════════
// Family Resolution
// ══════════════════════════════════════════════════════════════

const FAMILY_MAP: Record<string, LayoutFamilyId> = {
  "baby-budget": "nurture",
  "pregnancy-planner": "nurture",
  "savings-tracker": "nurture",
  "business-pl": "executive",
  "side-hustle": "executive",
  "debt-payoff": "executive",
  "wedding-planner": "editorial",
  "meal-planner": "editorial",
  // Energetic niches default to nurture (closest match)
  "paycheck-budget": "nurture",
  "adhd-planner": "nurture",
  "student-budget": "executive",
  "travel-planner": "editorial",
};

const FAMILIES: Record<LayoutFamilyId, LayoutFamily> = {
  nurture: NURTURE_FAMILY,
  executive: EXECUTIVE_FAMILY,
  editorial: EDITORIAL_FAMILY,
};

/**
 * Resolve the layout family for a given niche profile ID.
 */
export function resolveLayoutFamily(nicheProfileId: string): LayoutFamily {
  const familyId = FAMILY_MAP[nicheProfileId] || "nurture";
  return { ...FAMILIES[familyId] };
}

/**
 * Get just the family ID for quick checks.
 */
export function getLayoutFamilyId(nicheProfileId: string): LayoutFamilyId {
  return FAMILY_MAP[nicheProfileId] || "nurture";
}

// ══════════════════════════════════════════════════════════════
// CROSS-LAYER CONFIGS
//
// These configs drive structural decisions across ALL layers:
//   - Spreadsheet dashboard layout
//   - Blueprint tab sets
//   - Listing image plans
//   - Video scene pacing
//
// LayoutFamily remains the routing key. These configs extend it.
// ══════════════════════════════════════════════════════════════

// ── Spreadsheet Dashboard Config ────────────────────────────

export interface DashboardSectionDef {
  id: string;
  title: string;
  emoji: string;
  position: "left" | "right" | "full-width";
  columns: Array<{ name: string; type: "text" | "currency" | "percent" | "date" | "status" | "formula"; width: number }>;
  dataSource: "budgetCategories" | "savingsGoals" | "custom";
  customSourceKey?: string; // key into NicheDataProfile.customSections
}

export interface SpreadsheetDashboardConfig {
  kpiCount: 3 | 4;
  kpiLabels: string[];
  /** Formula templates — use {INCOME_REF}, {SPENT_RANGE}, {BUDGET_RANGE} as placeholders */
  kpiFormulas: string[];
  /** Number format per KPI card */
  kpiFormats: string[];
  gridColumns: number;
  sections: DashboardSectionDef[];
  showBudgetVsActualBars: boolean;
  showInsights: boolean;
  insightTemplates?: string[];
}

// ── Tab Set Config ──────────────────────────────────────────

export interface TabDef {
  name: string;
  role: string;
  purpose: string;
  columns: Array<{ name: string; type: string; width: number; formula?: string }>;
  features: string[];
  /**
   * Optional: route this tab to a rich, hand-crafted layout builder
   * instead of the standard column-driven data builders. When set, the
   * `columns`/`features` arrays are ignored downstream.
   * Mirrors the BlueprintTab.richLayout union — propagated through
   * buildTabFromDef → BlueprintTab → factory-spreadsheet-builder classifier.
   */
  richLayout?: "smart-calendar" | "year-in-review" | "money-coach" | "what-if-simulator";
}

export interface TabSetConfig {
  tabs: TabDef[];
}

// ── Image Plan Config ───────────────────────────────────────

export interface ImageSlotDef {
  slot: number;
  kind: string;
  titleTemplate: string;
  subtitleTemplate: string;
  sourceTabRole: string;
  cropIntent: string;
  mockupType: string;
  overlayStyle: string;
  notes: string;
}

export interface ImagePlanConfig {
  slots: ImageSlotDef[];
}

// ── Video Scene Config ──────────────────────────────────────

export interface VideoSceneConfig {
  pacing: "slow" | "moderate" | "fast";
  emotionalTone: string;
  introDurationMs: number;
  revealDurationMs: number;
  proofZoomScale: number;
  proofZoomOrigin: string;
  proofScrollPx: number;
  tabSwitchCount: number;
  transformationDurationMs: number;
  ctaDurationMs: number;
  focusSections: string[];
}

// ══════════════════════════════════════════════════════════════
// SPREADSHEET DASHBOARD CONFIGS
// ══════════════════════════════════════════════════════════════

const NURTURE_DASHBOARD: SpreadsheetDashboardConfig = {
  kpiCount: 4,
  kpiLabels: ["Total Income", "Total Spent", "Net Savings", "Savings Rate"],
  kpiFormulas: [
    "{INCOME_REF}",
    "SUM({SPENT_RANGE})",
    "{INCOME_REF}-SUM({SPENT_RANGE})",
    "IF({INCOME_REF}=0,0,({INCOME_REF}-SUM({SPENT_RANGE}))/{INCOME_REF})",
  ],
  kpiFormats: ['"$"#,##0', '"$"#,##0', '"$"#,##0', "0%"],
  gridColumns: 14,
  sections: [
    {
      id: "expense-breakdown",
      title: "EXPENSE BREAKDOWN",
      emoji: "💳",
      position: "left",
      columns: [
        { name: "Category", type: "text", width: 22 },
        { name: "Budget", type: "currency", width: 15 },
        { name: "Spent", type: "currency", width: 15 },
        { name: "Left", type: "formula", width: 15 },
        { name: "Status", type: "status", width: 14 },
      ],
      dataSource: "budgetCategories",
    },
    {
      id: "savings-goals",
      title: "SAVINGS GOALS",
      emoji: "🎯",
      position: "right",
      columns: [
        { name: "Goal", type: "text", width: 22 },
        { name: "Target", type: "currency", width: 15 },
        { name: "Saved", type: "currency", width: 15 },
        { name: "Progress", type: "percent", width: 10 },
        { name: "Bar", type: "formula", width: 14 },
        { name: "Status", type: "status", width: 12 },
      ],
      dataSource: "savingsGoals",
    },
  ],
  showBudgetVsActualBars: true,
  showInsights: true,
  insightTemplates: [
    '"✅  You saved "&TEXT({INCOME_REF}-SUM({SPENT_RANGE}),"$#,##0")&" this month ("&TEXT(IF({INCOME_REF}=0,0,({INCOME_REF}-SUM({SPENT_RANGE}))/{INCOME_REF}),"0%")&" savings rate)"',
    'IF(COUNTIF({STATUS_RANGE},"*Over*")>0,"⚠️  "&COUNTIF({STATUS_RANGE},"*Over*")&" category(ies) over budget","✅  All categories are within budget!")',
    '"🎯  Total savings goal progress: "&TEXT(IF({GOAL_TOTAL_TARGET}=0,0,{GOAL_TOTAL_SAVED}/{GOAL_TOTAL_TARGET}),"0%")&" complete"',
    '"📊  Total allocated: "&TEXT(SUM({BUDGET_RANGE}),"$#,##0")&" of "&TEXT({INCOME_REF},"$#,##0")&" income"',
  ],
};

const EXECUTIVE_DASHBOARD: SpreadsheetDashboardConfig = {
  kpiCount: 4,
  kpiLabels: ["Total Revenue", "Total Expenses", "Net Profit", "Profit Margin"],
  kpiFormulas: [
    "{INCOME_REF}",
    "SUM({SPENT_RANGE})",
    "{INCOME_REF}-SUM({SPENT_RANGE})",
    "IF({INCOME_REF}=0,0,({INCOME_REF}-SUM({SPENT_RANGE}))/{INCOME_REF})",
  ],
  kpiFormats: ['"$"#,##0', '"$"#,##0', '"$"#,##0', "0%"],
  gridColumns: 14,
  sections: [
    {
      id: "cost-breakdown",
      title: "COST BREAKDOWN",
      emoji: "📊",
      position: "full-width",
      columns: [
        { name: "Category", type: "text", width: 22 },
        { name: "Budget", type: "currency", width: 14 },
        { name: "Actual", type: "currency", width: 14 },
        { name: "Variance", type: "formula", width: 14 },
        { name: "% of Total", type: "percent", width: 12 },
        { name: "Status", type: "status", width: 14 },
      ],
      dataSource: "budgetCategories",
    },
    {
      id: "tax-reserve",
      title: "TAX & RESERVE PLANNING",
      emoji: "🏦",
      position: "full-width",
      columns: [
        { name: "Quarter", type: "text", width: 16 },
        { name: "Revenue", type: "currency", width: 16 },
        { name: "Tax Rate", type: "percent", width: 12 },
        { name: "Set Aside", type: "formula", width: 16 },
      ],
      dataSource: "custom",
      customSourceKey: "taxPlanning",
    },
  ],
  showBudgetVsActualBars: true,
  showInsights: true,
  insightTemplates: [
    '"💰  Net profit: "&TEXT({INCOME_REF}-SUM({SPENT_RANGE}),"$#,##0")&" ("&TEXT(IF({INCOME_REF}=0,0,({INCOME_REF}-SUM({SPENT_RANGE}))/{INCOME_REF}),"0%")&" margin)"',
    'IF(COUNTIF({STATUS_RANGE},"*Over*")>0,"⚠️  "&COUNTIF({STATUS_RANGE},"*Over*")&" expense(s) over budget","✅  All expenses within budget")',
    '"📈  Revenue: "&TEXT({INCOME_REF},"$#,##0")&" | Expenses: "&TEXT(SUM({SPENT_RANGE}),"$#,##0")',
  ],
};

const EDITORIAL_DASHBOARD_WEDDING: SpreadsheetDashboardConfig = {
  kpiCount: 3,
  kpiLabels: ["Total Budget", "Total Spent", "Remaining"],
  kpiFormulas: [
    "{INCOME_REF}",
    "SUM({SPENT_RANGE})",
    "{INCOME_REF}-SUM({SPENT_RANGE})",
  ],
  kpiFormats: ['"$"#,##0', '"$"#,##0', '"$"#,##0'],
  gridColumns: 13,
  sections: [
    {
      id: "vendor-summary",
      title: "VENDOR TRACKER",
      emoji: "💒",
      position: "left",
      columns: [
        { name: "Vendor", type: "text", width: 20 },
        { name: "Category", type: "text", width: 16 },
        { name: "Amount", type: "currency", width: 14 },
        { name: "Status", type: "status", width: 14 },
      ],
      dataSource: "custom",
      customSourceKey: "vendorTracker",
    },
    {
      id: "guest-count",
      title: "GUEST COUNT",
      emoji: "👥",
      position: "right",
      columns: [
        { name: "Category", type: "text", width: 18 },
        { name: "Count", type: "text", width: 10 },
        { name: "RSVP", type: "text", width: 10 },
      ],
      dataSource: "custom",
      customSourceKey: "guestList",
    },
    {
      id: "category-breakdown",
      title: "BUDGET CATEGORIES",
      emoji: "💍",
      position: "full-width",
      columns: [
        { name: "Category", type: "text", width: 22 },
        { name: "Budgeted", type: "currency", width: 15 },
        { name: "Spent", type: "currency", width: 15 },
        { name: "Remaining", type: "formula", width: 15 },
        { name: "Status", type: "status", width: 14 },
      ],
      dataSource: "budgetCategories",
    },
    {
      id: "payment-schedule",
      title: "UPCOMING PAYMENTS",
      emoji: "📅",
      position: "full-width",
      columns: [
        { name: "Vendor", type: "text", width: 20 },
        { name: "Amount", type: "currency", width: 14 },
        { name: "Due Date", type: "date", width: 14 },
        { name: "Paid", type: "currency", width: 14 },
      ],
      dataSource: "custom",
      customSourceKey: "paymentSchedule",
    },
  ],
  showBudgetVsActualBars: false,
  showInsights: true,
  insightTemplates: [
    '"💍  Remaining budget: "&TEXT({INCOME_REF}-SUM({SPENT_RANGE}),"$#,##0")&" of "&TEXT({INCOME_REF},"$#,##0")',
    'IF(COUNTIF({STATUS_RANGE},"*Over*")>0,"⚠️  "&COUNTIF({STATUS_RANGE},"*Over*")&" category(ies) over budget","✅  All categories are within budget!")',
    '"👥  Guest planning and vendor tracking on separate tabs"',
  ],
};

const EDITORIAL_DASHBOARD_TRAVEL: SpreadsheetDashboardConfig = {
  kpiCount: 3,
  kpiLabels: ["Trip Budget", "Total Spent", "Remaining"],
  kpiFormulas: [
    "{INCOME_REF}",
    "SUM({SPENT_RANGE})",
    "{INCOME_REF}-SUM({SPENT_RANGE})",
  ],
  kpiFormats: ['"$"#,##0', '"$"#,##0', '"$"#,##0'],
  gridColumns: 13,
  sections: [
    {
      id: "trip-expenses",
      title: "TRIP EXPENSES",
      emoji: "✈️",
      position: "left",
      columns: [
        { name: "Category", type: "text", width: 22 },
        { name: "Budgeted", type: "currency", width: 15 },
        { name: "Spent", type: "currency", width: 15 },
        { name: "Left", type: "formula", width: 15 },
        { name: "Status", type: "status", width: 14 },
      ],
      dataSource: "budgetCategories",
    },
    {
      id: "trip-savings",
      title: "TRIP SAVINGS",
      emoji: "🎯",
      position: "right",
      columns: [
        { name: "Goal", type: "text", width: 22 },
        { name: "Target", type: "currency", width: 15 },
        { name: "Saved", type: "currency", width: 15 },
        { name: "Progress", type: "percent", width: 10 },
        { name: "Bar", type: "formula", width: 14 },
        { name: "Status", type: "status", width: 12 },
      ],
      dataSource: "savingsGoals",
    },
    {
      id: "itinerary-mini",
      title: "ITINERARY PREVIEW",
      emoji: "🗺️",
      position: "full-width",
      columns: [
        { name: "Day", type: "text", width: 10 },
        { name: "Activity", type: "text", width: 30 },
        { name: "Location", type: "text", width: 20 },
        { name: "Est. Cost", type: "currency", width: 14 },
      ],
      dataSource: "custom",
      customSourceKey: "itinerary",
    },
  ],
  showBudgetVsActualBars: false,
  showInsights: true,
  insightTemplates: [
    '"✈️  Trip budget remaining: "&TEXT({INCOME_REF}-SUM({SPENT_RANGE}),"$#,##0")&" of "&TEXT({INCOME_REF},"$#,##0")',
    '"🎯  Savings progress on track — see Trip Savings tab for details"',
    '"🗺️  Full itinerary and packing checklist on separate tabs"',
  ],
};

const NURTURE_DASHBOARD_PAYCHECK: SpreadsheetDashboardConfig = {
  kpiCount: 4,
  kpiLabels: ["Take-Home Pay", "Bills & Fixed", "Discretionary", "Remaining"],
  kpiFormulas: [
    "{INCOME_REF}",
    "SUM({SPENT_RANGE})",
    "{INCOME_REF}-SUM({SPENT_RANGE})",
    "IF({INCOME_REF}=0,0,({INCOME_REF}-SUM({SPENT_RANGE}))/{INCOME_REF})",
  ],
  kpiFormats: ['"$"#,##0', '"$"#,##0', '"$"#,##0', "0%"],
  gridColumns: 14,
  sections: [
    {
      id: "paycheck-allocation",
      title: "PAYCHECK ALLOCATION",
      emoji: "💵",
      position: "left",
      columns: [
        { name: "Category", type: "text", width: 22 },
        { name: "Amount", type: "currency", width: 15 },
        { name: "Spent", type: "currency", width: 15 },
        { name: "Left", type: "formula", width: 15 },
        { name: "Status", type: "status", width: 14 },
      ],
      dataSource: "budgetCategories",
    },
    {
      id: "bills-due",
      title: "BILLS & DUE DATES",
      emoji: "📋",
      position: "right",
      columns: [
        { name: "Bill", type: "text", width: 20 },
        { name: "Amount", type: "currency", width: 14 },
        { name: "Due Date", type: "date", width: 14 },
        { name: "Status", type: "status", width: 14 },
      ],
      dataSource: "custom",
      customSourceKey: "billsDueDates",
    },
    {
      id: "sinking-funds",
      title: "SINKING FUNDS",
      emoji: "🏦",
      position: "full-width",
      columns: [
        { name: "Fund", type: "text", width: 22 },
        { name: "Target", type: "currency", width: 14 },
        { name: "Monthly", type: "currency", width: 14 },
        { name: "Current", type: "currency", width: 14 },
        { name: "Progress", type: "percent", width: 10 },
        { name: "Bar", type: "formula", width: 14 },
      ],
      dataSource: "custom",
      customSourceKey: "sinkingFunds",
    },
  ],
  showBudgetVsActualBars: true,
  showInsights: true,
};

const EDITORIAL_DASHBOARD_MEAL: SpreadsheetDashboardConfig = {
  kpiCount: 3,
  kpiLabels: ["Food Budget", "Total Spent", "Remaining"],
  kpiFormulas: [
    "{INCOME_REF}",
    "SUM({SPENT_RANGE})",
    "{INCOME_REF}-SUM({SPENT_RANGE})",
  ],
  kpiFormats: ['"$"#,##0', '"$"#,##0', '"$"#,##0'],
  gridColumns: 13,
  sections: [
    {
      id: "weekly-meal-plan",
      title: "THIS WEEK'S MEALS",
      emoji: "🍽️",
      position: "full-width",
      columns: [
        { name: "Day", type: "text", width: 14 },
        { name: "Breakfast", type: "text", width: 18 },
        { name: "Lunch", type: "text", width: 18 },
        { name: "Dinner", type: "text", width: 18 },
        { name: "Snack", type: "text", width: 14 },
      ],
      dataSource: "custom",
      customSourceKey: "weeklyMealPlan",
    },
    {
      id: "food-spending",
      title: "FOOD SPENDING",
      emoji: "🛒",
      position: "left",
      columns: [
        { name: "Category", type: "text", width: 22 },
        { name: "Budget", type: "currency", width: 15 },
        { name: "Spent", type: "currency", width: 15 },
        { name: "Left", type: "formula", width: 15 },
        { name: "Status", type: "status", width: 14 },
      ],
      dataSource: "budgetCategories",
    },
    {
      id: "cost-per-meal",
      title: "COST PER MEAL",
      emoji: "💡",
      position: "right",
      columns: [
        { name: "Meal Type", type: "text", width: 16 },
        { name: "Avg Cost", type: "currency", width: 12 },
        { name: "Homemade", type: "currency", width: 12 },
        { name: "Savings", type: "currency", width: 12 },
      ],
      dataSource: "custom",
      customSourceKey: "costPerMeal",
    },
  ],
  showBudgetVsActualBars: false,
  showInsights: true,
  insightTemplates: [
    '"🍽️  Food budget remaining: "&TEXT({INCOME_REF}-SUM({SPENT_RANGE}),"$#,##0")&" of "&TEXT({INCOME_REF},"$#,##0")',
    '"💡  Cooking at home saves ~$15/day vs eating out"',
    '"🛒  See Grocery List tab for this week\'s shopping list"',
  ],
};

const EXECUTIVE_DASHBOARD_STUDENT: SpreadsheetDashboardConfig = {
  kpiCount: 4,
  kpiLabels: ["Total Income", "Total Expenses", "Remaining", "Savings Rate"],
  kpiFormulas: [
    "{INCOME_REF}",
    "SUM({SPENT_RANGE})",
    "{INCOME_REF}-SUM({SPENT_RANGE})",
    "IF({INCOME_REF}=0,0,({INCOME_REF}-SUM({SPENT_RANGE}))/{INCOME_REF})",
  ],
  kpiFormats: ['"$"#,##0', '"$"#,##0', '"$"#,##0', "0%"],
  gridColumns: 14,
  sections: [
    {
      id: "monthly-budget",
      title: "MONTHLY BUDGET",
      emoji: "📚",
      position: "left",
      columns: [
        { name: "Category", type: "text", width: 22 },
        { name: "Budget", type: "currency", width: 15 },
        { name: "Spent", type: "currency", width: 15 },
        { name: "Left", type: "formula", width: 15 },
        { name: "Status", type: "status", width: 14 },
      ],
      dataSource: "budgetCategories",
    },
    {
      id: "semester-overview",
      title: "SEMESTER COSTS",
      emoji: "🎓",
      position: "right",
      columns: [
        { name: "Semester", type: "text", width: 14 },
        { name: "Tuition", type: "currency", width: 14 },
        { name: "Books", type: "currency", width: 12 },
        { name: "Housing", type: "currency", width: 14 },
        { name: "Total", type: "currency", width: 14 },
      ],
      dataSource: "custom",
      customSourceKey: "semesterCosts",
    },
    {
      id: "subscription-audit",
      title: "SUBSCRIPTION AUDIT",
      emoji: "📱",
      position: "full-width",
      columns: [
        { name: "Service", type: "text", width: 20 },
        { name: "Monthly Cost", type: "currency", width: 14 },
        { name: "Category", type: "text", width: 14 },
        { name: "Keep?", type: "status", width: 12 },
      ],
      dataSource: "custom",
      customSourceKey: "subscriptionAudit",
    },
  ],
  showBudgetVsActualBars: true,
  showInsights: true,
  insightTemplates: [
    '"📚  Monthly remaining: "&TEXT({INCOME_REF}-SUM({SPENT_RANGE}),"$#,##0")&" ("&TEXT(IF({INCOME_REF}=0,0,({INCOME_REF}-SUM({SPENT_RANGE}))/{INCOME_REF}),"0%")&" savings rate)"',
    'IF(COUNTIF({STATUS_RANGE},"*Over*")>0,"⚠️  "&COUNTIF({STATUS_RANGE},"*Over*")&" category(ies) over budget","✅  All spending within budget!")',
    '"🎓  See Semester Costs tab for full tuition breakdown"',
  ],
};

const EXECUTIVE_DASHBOARD_DEBT: SpreadsheetDashboardConfig = {
  kpiCount: 4,
  kpiLabels: ["Total Income", "Total Expenses", "Debt Payment", "Total Debt"],
  kpiFormulas: [
    "{INCOME_REF}",
    "SUM({SPENT_RANGE})",
    "{INCOME_REF}-SUM({SPENT_RANGE})",
    "SUM({BUDGET_RANGE})",
  ],
  kpiFormats: ['"$"#,##0', '"$"#,##0', '"$"#,##0', '"$"#,##0'],
  gridColumns: 14,
  sections: [
    {
      id: "debt-accounts",
      title: "DEBT ACCOUNTS",
      emoji: "💳",
      position: "full-width",
      columns: [
        { name: "Account", type: "text", width: 20 },
        { name: "Balance", type: "currency", width: 14 },
        { name: "APR", type: "percent", width: 10 },
        { name: "Minimum", type: "currency", width: 14 },
        { name: "Extra", type: "currency", width: 14 },
        { name: "Payoff Date", type: "date", width: 14 },
      ],
      dataSource: "custom",
      customSourceKey: "debtAccounts",
    },
    {
      id: "monthly-budget",
      title: "MONTHLY BUDGET",
      emoji: "📊",
      position: "left",
      columns: [
        { name: "Category", type: "text", width: 22 },
        { name: "Budget", type: "currency", width: 14 },
        { name: "Actual", type: "currency", width: 14 },
        { name: "Variance", type: "formula", width: 14 },
        { name: "Status", type: "status", width: 14 },
      ],
      dataSource: "budgetCategories",
    },
    {
      id: "payoff-milestones",
      title: "PAYOFF MILESTONES",
      emoji: "🏆",
      position: "right",
      columns: [
        { name: "Milestone", type: "text", width: 22 },
        { name: "Target Date", type: "date", width: 14 },
        { name: "Amount", type: "currency", width: 14 },
        { name: "Status", type: "status", width: 14 },
      ],
      dataSource: "custom",
      customSourceKey: "milestones",
    },
  ],
  showBudgetVsActualBars: true,
  showInsights: true,
  insightTemplates: [
    '"💳  Total debt remaining: "&TEXT(SUM({BUDGET_RANGE}),"$#,##0")',
    '"💰  Monthly debt payment: "&TEXT({INCOME_REF}-SUM({SPENT_RANGE}),"$#,##0")&" allocated to payoff"',
    'IF(COUNTIF({STATUS_RANGE},"*Over*")>0,"⚠️  "&COUNTIF({STATUS_RANGE},"*Over*")&" category(ies) over budget","✅  All spending within budget!")',
  ],
};

// ── Baby Budget Dashboard (nurture) ─────────────────────────
// Unique: Baby Milestones + Gear Checklist + Baby Expense Breakdown
// Structurally different from generic nurture (no savings goals on dashboard)

const NURTURE_DASHBOARD_BABY: SpreadsheetDashboardConfig = {
  kpiCount: 4,
  kpiLabels: ["Total Income", "Baby Costs", "Net Savings", "Savings Rate"],
  kpiFormulas: [
    "{INCOME_REF}",
    "SUM({SPENT_RANGE})",
    "{INCOME_REF}-SUM({SPENT_RANGE})",
    "IF({INCOME_REF}=0,0,({INCOME_REF}-SUM({SPENT_RANGE}))/{INCOME_REF})",
  ],
  kpiFormats: ['"$"#,##0', '"$"#,##0', '"$"#,##0', "0%"],
  gridColumns: 14,
  sections: [
    {
      id: "baby-milestones",
      title: "BABY MILESTONES",
      emoji: "👶",
      position: "full-width",
      columns: [
        { name: "Milestone", type: "text", width: 24 },
        { name: "Age", type: "text", width: 14 },
        { name: "Expected Cost", type: "currency", width: 16 },
        { name: "Status", type: "status", width: 16 },
      ],
      dataSource: "custom",
      customSourceKey: "milestones",
    },
    {
      id: "baby-expenses",
      title: "MONTHLY BABY EXPENSES",
      emoji: "🍼",
      position: "left",
      columns: [
        { name: "Category", type: "text", width: 22 },
        { name: "Budget", type: "currency", width: 15 },
        { name: "Spent", type: "currency", width: 15 },
        { name: "Left", type: "formula", width: 15 },
        { name: "Status", type: "status", width: 14 },
      ],
      dataSource: "budgetCategories",
    },
    {
      id: "gear-checklist",
      title: "GEAR CHECKLIST",
      emoji: "🧸",
      position: "right",
      columns: [
        { name: "Item", type: "text", width: 20 },
        { name: "Category", type: "text", width: 14 },
        { name: "Budgeted", type: "currency", width: 14 },
        { name: "Purchased", type: "currency", width: 14 },
      ],
      dataSource: "custom",
      customSourceKey: "gearChecklist",
    },
  ],
  showBudgetVsActualBars: true,
  showInsights: true,
  insightTemplates: [
    '"👶  Baby costs this month: "&TEXT(SUM({SPENT_RANGE}),"$#,##0")&" of "&TEXT(SUM({BUDGET_RANGE}),"$#,##0")&" budgeted"',
    'IF(COUNTIF({STATUS_RANGE},"*Over*")>0,"⚠️  "&COUNTIF({STATUS_RANGE},"*Over*")&" category(ies) over budget","✅  All baby expenses within budget!")',
    '"🍼  Net savings this month: "&TEXT({INCOME_REF}-SUM({SPENT_RANGE}),"$#,##0")&" — keep building that college fund!"',
    '"🧸  See Milestones tab for full gear and preparation checklist"',
  ],
};

// ── Savings Tracker Dashboard (nurture) ─────────────────────
// Unique: Savings Goals FIRST (prominent), then expense breakdown, then progress summary
// Savings-focused vs expense-focused layout

const NURTURE_DASHBOARD_SAVINGS: SpreadsheetDashboardConfig = {
  kpiCount: 4,
  kpiLabels: ["Total Income", "Total Saved", "Expenses", "Savings Rate"],
  kpiFormulas: [
    "{INCOME_REF}",
    "{INCOME_REF}-SUM({SPENT_RANGE})",
    "SUM({SPENT_RANGE})",
    "IF({INCOME_REF}=0,0,({INCOME_REF}-SUM({SPENT_RANGE}))/{INCOME_REF})",
  ],
  kpiFormats: ['"$"#,##0', '"$"#,##0', '"$"#,##0', "0%"],
  gridColumns: 14,
  sections: [
    {
      id: "savings-goals",
      title: "SAVINGS GOALS",
      emoji: "🎯",
      position: "full-width",
      columns: [
        { name: "Goal", type: "text", width: 22 },
        { name: "Target", type: "currency", width: 15 },
        { name: "Saved", type: "currency", width: 15 },
        { name: "Progress", type: "percent", width: 10 },
        { name: "Bar", type: "formula", width: 14 },
        { name: "Status", type: "status", width: 12 },
      ],
      dataSource: "savingsGoals",
    },
    {
      id: "monthly-expenses",
      title: "MONTHLY SPENDING",
      emoji: "💳",
      position: "full-width",
      columns: [
        { name: "Category", type: "text", width: 22 },
        { name: "Budget", type: "currency", width: 15 },
        { name: "Spent", type: "currency", width: 15 },
        { name: "Left", type: "formula", width: 15 },
        { name: "Status", type: "status", width: 14 },
      ],
      dataSource: "budgetCategories",
    },
  ],
  showBudgetVsActualBars: true,
  showInsights: true,
  insightTemplates: [
    '"💰  Total saved this month: "&TEXT({INCOME_REF}-SUM({SPENT_RANGE}),"$#,##0")&" ("&TEXT(IF({INCOME_REF}=0,0,({INCOME_REF}-SUM({SPENT_RANGE}))/{INCOME_REF}),"0%")&" savings rate)"',
    '"🎯  Goal progress: "&TEXT(IF({GOAL_TOTAL_TARGET}=0,0,{GOAL_TOTAL_SAVED}/{GOAL_TOTAL_TARGET}),"0%")&" of total savings goal reached"',
    'IF(COUNTIF({STATUS_RANGE},"*Over*")>0,"⚠️  "&COUNTIF({STATUS_RANGE},"*Over*")&" spending category(ies) over budget","✅  All spending within limits!")',
    '"📊  Keep saving — consistency is the key to financial freedom!"',
  ],
};

// ── Side Hustle Dashboard (executive) ───────────────────────
// Unique: Hustle income vs day job split, multi-stream revenue, tax set-aside
// Structurally different from generic executive (P&L focused)

const EXECUTIVE_DASHBOARD_SIDE_HUSTLE: SpreadsheetDashboardConfig = {
  kpiCount: 4,
  kpiLabels: ["Total Income", "Hustle Costs", "Net Earnings", "Profit Margin"],
  kpiFormulas: [
    "{INCOME_REF}",
    "SUM({SPENT_RANGE})",
    "{INCOME_REF}-SUM({SPENT_RANGE})",
    "IF({INCOME_REF}=0,0,({INCOME_REF}-SUM({SPENT_RANGE}))/{INCOME_REF})",
  ],
  kpiFormats: ['"$"#,##0', '"$"#,##0', '"$"#,##0', "0%"],
  gridColumns: 14,
  sections: [
    {
      id: "income-streams",
      title: "INCOME STREAMS",
      emoji: "💸",
      position: "left",
      columns: [
        { name: "Source", type: "text", width: 22 },
        { name: "Monthly", type: "currency", width: 15 },
        { name: "YTD", type: "currency", width: 15 },
        { name: "% of Total", type: "percent", width: 12 },
      ],
      dataSource: "custom",
      customSourceKey: "incomeStreams",
    },
    {
      id: "hustle-expenses",
      title: "HUSTLE EXPENSES",
      emoji: "📊",
      position: "right",
      columns: [
        { name: "Category", type: "text", width: 22 },
        { name: "Budget", type: "currency", width: 14 },
        { name: "Actual", type: "currency", width: 14 },
        { name: "Variance", type: "formula", width: 14 },
        { name: "Status", type: "status", width: 14 },
      ],
      dataSource: "budgetCategories",
    },
    {
      id: "tax-set-aside",
      title: "TAX SET-ASIDE TRACKER",
      emoji: "🏦",
      position: "full-width",
      columns: [
        { name: "Quarter", type: "text", width: 14 },
        { name: "Hustle Revenue", type: "currency", width: 16 },
        { name: "Tax Rate", type: "percent", width: 12 },
        { name: "Set Aside", type: "currency", width: 16 },
        { name: "Status", type: "status", width: 14 },
      ],
      dataSource: "custom",
      customSourceKey: "taxSetAside",
    },
  ],
  showBudgetVsActualBars: true,
  showInsights: true,
  insightTemplates: [
    '"💸  Net hustle earnings: "&TEXT({INCOME_REF}-SUM({SPENT_RANGE}),"$#,##0")&" ("&TEXT(IF({INCOME_REF}=0,0,({INCOME_REF}-SUM({SPENT_RANGE}))/{INCOME_REF}),"0%")&" margin)"',
    'IF(COUNTIF({STATUS_RANGE},"*Over*")>0,"⚠️  "&COUNTIF({STATUS_RANGE},"*Over*")&" expense(s) over budget","✅  All hustle costs within budget")',
    '"🏦  Don\'t forget to set aside 25-30% of hustle income for taxes!"',
  ],
};

// ── Dashboard Config Resolution ─────────────────────────────

const DASHBOARD_CONFIGS: Record<string, SpreadsheetDashboardConfig> = {
  // Editorial family — niche-specific dashboards
  "wedding-planner": EDITORIAL_DASHBOARD_WEDDING,
  "travel-planner": EDITORIAL_DASHBOARD_TRAVEL,
  "travel-budget": EDITORIAL_DASHBOARD_TRAVEL,
  "meal-planner": EDITORIAL_DASHBOARD_MEAL,

  // Nurture family — niche-specific overrides
  "baby-budget": NURTURE_DASHBOARD_BABY,
  "pregnancy-planner": NURTURE_DASHBOARD_BABY,
  "paycheck-budget": NURTURE_DASHBOARD_PAYCHECK,
  "adhd-budget": NURTURE_DASHBOARD_PAYCHECK,
  "adhd-planner": NURTURE_DASHBOARD_PAYCHECK,
  "generic-budget": NURTURE_DASHBOARD_PAYCHECK,
  "generic": NURTURE_DASHBOARD_PAYCHECK,
  "savings-tracker": NURTURE_DASHBOARD_SAVINGS,

  // Executive family — niche-specific dashboards
  "business-pl": EXECUTIVE_DASHBOARD,
  "side-hustle": EXECUTIVE_DASHBOARD_SIDE_HUSTLE,
  "debt-payoff": EXECUTIVE_DASHBOARD_DEBT,
  "student-budget": EXECUTIVE_DASHBOARD_STUDENT,
};

export function getSpreadsheetDashboardConfig(nicheProfileId: string): SpreadsheetDashboardConfig {
  return DASHBOARD_CONFIGS[nicheProfileId] || NURTURE_DASHBOARD;
}

// ══════════════════════════════════════════════════════════════
// TAB SET CONFIGS — Prescribed tabs per niche
// ══════════════════════════════════════════════════════════════

const WEDDING_TABS: TabSetConfig = {
  tabs: [
    { name: "Dashboard", role: "dashboard", purpose: "Wedding budget overview with vendor and guest summaries", columns: [], features: ["frozen_header", "conditional_formatting"] },
    { name: "Vendor Tracker", role: "vendor-tracker", purpose: "Track all wedding vendors with quotes, deposits, and payment status",
      columns: [
        { name: "Vendor", type: "text", width: 200 },
        { name: "Category", type: "text", width: 140 },
        { name: "Quote", type: "currency", width: 110 },
        { name: "Deposit", type: "currency", width: 110 },
        { name: "Paid", type: "currency", width: 110 },
        { name: "Remaining", type: "currency", width: 110 },
        { name: "Due Date", type: "date", width: 110 },
        { name: "Status", type: "text", width: 120 },
        { name: "Notes", type: "text", width: 200 },
      ],
      features: ["frozen_header", "conditional_formatting", "alternating_rows"] },
    { name: "Guest List", role: "guest-list", purpose: "Manage wedding guests, RSVPs, table assignments, and meal preferences",
      columns: [
        { name: "Guest Name", type: "text", width: 200 },
        { name: "Party Size", type: "number", width: 90 },
        { name: "RSVP", type: "text", width: 100 },
        { name: "Table #", type: "number", width: 80 },
        { name: "Meal Preference", type: "text", width: 140 },
        { name: "Gift Received", type: "text", width: 120 },
        { name: "Thank You Sent", type: "text", width: 120 },
      ],
      features: ["frozen_header", "dropdown_validation", "alternating_rows"] },
    { name: "Wedding Timeline", role: "timeline", purpose: "Plan tasks and milestones leading up to the wedding day",
      columns: [
        { name: "Task", type: "text", width: 250 },
        { name: "Due Date", type: "date", width: 110 },
        { name: "Assigned To", type: "text", width: 140 },
        { name: "Priority", type: "text", width: 100 },
        { name: "Status", type: "text", width: 120 },
        { name: "Notes", type: "text", width: 200 },
      ],
      features: ["frozen_header", "conditional_formatting", "alternating_rows"] },
    { name: "Budget Categories", role: "budget-setup", purpose: "Set wedding budget allocations by category",
      columns: [
        { name: "Category", type: "text", width: 200 },
        { name: "Budgeted", type: "currency", width: 120 },
        { name: "Notes", type: "text", width: 200 },
      ],
      features: ["frozen_header"] },
    { name: "Payment Schedule", role: "payments", purpose: "Track payment due dates and amounts for all vendors",
      columns: [
        { name: "Vendor", type: "text", width: 200 },
        { name: "Amount", type: "currency", width: 120 },
        { name: "Due Date", type: "date", width: 110 },
        { name: "Paid", type: "currency", width: 120 },
        { name: "Remaining", type: "currency", width: 120 },
        { name: "Method", type: "text", width: 120 },
      ],
      features: ["frozen_header", "alternating_rows"] },
    { name: "Setup & Instructions", role: "setup", purpose: "How to use this wedding planner", columns: [], features: [] },
  ],
};

const BABY_TABS: TabSetConfig = {
  tabs: [
    { name: "Dashboard", role: "dashboard", purpose: "Baby expense overview with savings goals and milestones", columns: [], features: ["frozen_header", "conditional_formatting"] },
    { name: "Baby Expenses", role: "transactions", purpose: "Log all baby-related purchases and recurring costs",
      columns: [
        { name: "Date", type: "date", width: 110 },
        { name: "Description", type: "text", width: 200 },
        { name: "Amount", type: "currency", width: 110 },
        { name: "Category", type: "text", width: 140 },
        { name: "Recurring", type: "text", width: 100 },
        { name: "Month", type: "text", width: 100 },
      ],
      features: ["frozen_header", "dropdown_validation", "alternating_rows"] },
    { name: "Monthly Costs", role: "monthly-summary", purpose: "Automatic monthly cost breakdown by category",
      columns: [
        { name: "Month", type: "text", width: 110 },
        { name: "Diapers", type: "currency", width: 110 },
        { name: "Formula", type: "currency", width: 110 },
        { name: "Healthcare", type: "currency", width: 110 },
        { name: "Childcare", type: "currency", width: 110 },
        { name: "Gear", type: "currency", width: 110 },
        { name: "Total", type: "currency", width: 110 },
      ],
      features: ["frozen_header", "alternating_rows"] },
    { name: "Baby Milestones", role: "milestones", purpose: "Track baby milestones and expected costs",
      columns: [
        { name: "Milestone", type: "text", width: 220 },
        { name: "Age", type: "text", width: 100 },
        { name: "Expected Cost", type: "currency", width: 120 },
        { name: "Actual Cost", type: "currency", width: 120 },
        { name: "Status", type: "text", width: 120 },
        { name: "Notes", type: "text", width: 200 },
      ],
      features: ["frozen_header", "alternating_rows"] },
    { name: "Savings Goals", role: "savings-goals", purpose: "Track family savings goals for baby-related expenses",
      columns: [
        { name: "Goal", type: "text", width: 200 },
        { name: "Target", type: "currency", width: 110 },
        { name: "Saved", type: "currency", width: 110 },
        { name: "Remaining", type: "currency", width: 110 },
        { name: "Progress", type: "percent", width: 90 },
        { name: "Status", type: "text", width: 130 },
      ],
      features: ["frozen_header", "conditional_formatting", "alternating_rows"] },
    { name: "Budget Setup", role: "budget-setup", purpose: "Set monthly family income and budget allocations", columns: [
        { name: "Setting", type: "text", width: 200 },
        { name: "Value", type: "currency", width: 120 },
        { name: "Notes", type: "text", width: 200 },
      ], features: ["frozen_header"] },
    { name: "Setup & Instructions", role: "setup", purpose: "How to use this baby budget tracker", columns: [], features: [] },
  ],
};

const BUSINESS_TABS: TabSetConfig = {
  tabs: [
    { name: "Dashboard", role: "dashboard", purpose: "P&L overview with revenue, expenses, profit, and margin", columns: [], features: ["frozen_header", "conditional_formatting"] },
    { name: "Revenue Log", role: "revenue-log", purpose: "Track all income sources with clients and services",
      columns: [
        { name: "Date", type: "date", width: 110 },
        { name: "Client", type: "text", width: 180 },
        { name: "Service", type: "text", width: 160 },
        { name: "Amount", type: "currency", width: 120 },
        { name: "Status", type: "text", width: 110 },
        { name: "Month", type: "text", width: 100 },
      ],
      features: ["frozen_header", "dropdown_validation", "alternating_rows"] },
    { name: "Expense Log", role: "transactions", purpose: "Log all business expenses by category",
      columns: [
        { name: "Date", type: "date", width: 110 },
        { name: "Description", type: "text", width: 200 },
        { name: "Amount", type: "currency", width: 110 },
        { name: "Category", type: "text", width: 140 },
        { name: "Tax Deductible", type: "text", width: 110 },
        { name: "Month", type: "text", width: 100 },
      ],
      features: ["frozen_header", "dropdown_validation", "alternating_rows"] },
    { name: "Monthly P&L", role: "monthly-pl", purpose: "Automatic monthly profit & loss breakdown",
      columns: [
        { name: "Month", type: "text", width: 110 },
        { name: "Revenue", type: "currency", width: 120 },
        { name: "Expenses", type: "currency", width: 120 },
        { name: "Net Profit", type: "currency", width: 120 },
        { name: "Margin", type: "percent", width: 90 },
      ],
      features: ["frozen_header", "alternating_rows"] },
    { name: "Tax Planning", role: "tax-planning", purpose: "Estimate quarterly taxes and set aside reserves",
      columns: [
        { name: "Quarter", type: "text", width: 110 },
        { name: "Revenue", type: "currency", width: 120 },
        { name: "Tax Rate", type: "percent", width: 100 },
        { name: "Estimated Tax", type: "currency", width: 120 },
        { name: "Set Aside", type: "currency", width: 120 },
        { name: "Remaining", type: "currency", width: 120 },
      ],
      features: ["frozen_header", "alternating_rows"] },
    { name: "Budget Setup", role: "budget-setup", purpose: "Set revenue targets and expense budgets", columns: [
        { name: "Setting", type: "text", width: 200 },
        { name: "Value", type: "currency", width: 120 },
        { name: "Notes", type: "text", width: 200 },
      ], features: ["frozen_header"] },
    { name: "Setup & Instructions", role: "setup", purpose: "How to use this business P&L tracker", columns: [], features: [] },
  ],
};

const PAYCHECK_TABS: TabSetConfig = {
  tabs: [
    // 1. README — onboarding & how-to text (kept as a plain data tab so the
    // role-based `setup` builder doesn't rename it to "Setup & Instructions").
    { name: "README", role: "custom", purpose: "How to use this 32-tab paycheck budget system",
      columns: [
        { name: "Section", type: "text", width: 200 },
        { name: "Detail", type: "text", width: 400 },
      ],
      features: ["frozen_header", "alternating_rows"] },

    // 2. Settings — global workbook configuration
    { name: "Settings", role: "custom", purpose: "Global workbook settings — drive every other tab",
      columns: [
        { name: "Setting", type: "text", width: 200 },
        { name: "Value", type: "text", width: 150 },
        { name: "Notes", type: "text", width: 300 },
      ],
      features: ["frozen_header"] },

    // 3. Annual Dashboard — year overview KPIs
    { name: "Annual Dashboard", role: "custom", purpose: "Year overview with KPIs, charts, and top categories",
      columns: [
        { name: "Metric", type: "text", width: 200 },
        { name: "Value", type: "currency", width: 130 },
        { name: "Target", type: "currency", width: 130 },
        { name: "Variance", type: "currency", width: 130 },
      ],
      features: ["frozen_header", "conditional_formatting", "alternating_rows"] },

    // 4. Monthly Dashboard — current month overview
    { name: "Monthly Dashboard", role: "custom", purpose: "Current month overview with KPIs and category status",
      columns: [
        { name: "Metric", type: "text", width: 200 },
        { name: "Value", type: "currency", width: 130 },
      ],
      features: ["frozen_header", "conditional_formatting", "alternating_rows"] },

    // 5. Smart Calendar (rich layout)
    { name: "Smart Calendar", role: "custom", purpose: "Day-by-day transaction calendar with weekly summaries",
      columns: [], features: ["frozen_header"], richLayout: "smart-calendar" },

    // 6. Year in Review (rich layout)
    { name: "Year in Review", role: "custom", purpose: "Spotify-Wrapped style year-end recap with badges and headlines",
      columns: [], features: ["frozen_header"], richLayout: "year-in-review" },

    // 7. AI Money Coach (rich layout)
    { name: "AI Money Coach", role: "custom", purpose: "Six personalized insight cards driven by long formulas",
      columns: [], features: ["frozen_header"], richLayout: "money-coach" },

    // 8. What-If Simulator (rich layout)
    { name: "What-If Simulator", role: "custom", purpose: "Adjust 5 levers and watch the projection recalculate",
      columns: [], features: ["frozen_header"], richLayout: "what-if-simulator" },

    // 9. Transactions — main data entry
    { name: "Transactions", role: "transactions", purpose: "Log every income, expense, savings transfer, and debt payment",
      columns: [
        { name: "Date", type: "date", width: 110 },
        { name: "Type", type: "text", width: 110 },
        { name: "Category", type: "text", width: 140 },
        { name: "Account", type: "text", width: 130 },
        { name: "Description", type: "text", width: 220 },
        { name: "Amount", type: "currency", width: 120 },
        { name: "Month", type: "text", width: 100 },
      ],
      features: ["frozen_header", "dropdown_validation", "alternating_rows"] },

    // 10-21. Monthly tabs — January through December
    { name: "January", role: "custom", purpose: "January budget — category, budgeted, spent, remaining",
      columns: [
        { name: "Category", type: "text", width: 200 },
        { name: "Budget", type: "currency", width: 120 },
        { name: "Spent", type: "currency", width: 120 },
        { name: "Remaining", type: "currency", width: 120 },
      ],
      features: ["frozen_header", "alternating_rows", "conditional_formatting"] },
    { name: "February", role: "custom", purpose: "February budget — category, budgeted, spent, remaining",
      columns: [
        { name: "Category", type: "text", width: 200 },
        { name: "Budget", type: "currency", width: 120 },
        { name: "Spent", type: "currency", width: 120 },
        { name: "Remaining", type: "currency", width: 120 },
      ],
      features: ["frozen_header", "alternating_rows", "conditional_formatting"] },
    { name: "March", role: "custom", purpose: "March budget — category, budgeted, spent, remaining",
      columns: [
        { name: "Category", type: "text", width: 200 },
        { name: "Budget", type: "currency", width: 120 },
        { name: "Spent", type: "currency", width: 120 },
        { name: "Remaining", type: "currency", width: 120 },
      ],
      features: ["frozen_header", "alternating_rows", "conditional_formatting"] },
    { name: "April", role: "custom", purpose: "April budget — category, budgeted, spent, remaining",
      columns: [
        { name: "Category", type: "text", width: 200 },
        { name: "Budget", type: "currency", width: 120 },
        { name: "Spent", type: "currency", width: 120 },
        { name: "Remaining", type: "currency", width: 120 },
      ],
      features: ["frozen_header", "alternating_rows", "conditional_formatting"] },
    { name: "May", role: "custom", purpose: "May budget — category, budgeted, spent, remaining",
      columns: [
        { name: "Category", type: "text", width: 200 },
        { name: "Budget", type: "currency", width: 120 },
        { name: "Spent", type: "currency", width: 120 },
        { name: "Remaining", type: "currency", width: 120 },
      ],
      features: ["frozen_header", "alternating_rows", "conditional_formatting"] },
    { name: "June", role: "custom", purpose: "June budget — category, budgeted, spent, remaining",
      columns: [
        { name: "Category", type: "text", width: 200 },
        { name: "Budget", type: "currency", width: 120 },
        { name: "Spent", type: "currency", width: 120 },
        { name: "Remaining", type: "currency", width: 120 },
      ],
      features: ["frozen_header", "alternating_rows", "conditional_formatting"] },
    { name: "July", role: "custom", purpose: "July budget — category, budgeted, spent, remaining",
      columns: [
        { name: "Category", type: "text", width: 200 },
        { name: "Budget", type: "currency", width: 120 },
        { name: "Spent", type: "currency", width: 120 },
        { name: "Remaining", type: "currency", width: 120 },
      ],
      features: ["frozen_header", "alternating_rows", "conditional_formatting"] },
    { name: "August", role: "custom", purpose: "August budget — category, budgeted, spent, remaining",
      columns: [
        { name: "Category", type: "text", width: 200 },
        { name: "Budget", type: "currency", width: 120 },
        { name: "Spent", type: "currency", width: 120 },
        { name: "Remaining", type: "currency", width: 120 },
      ],
      features: ["frozen_header", "alternating_rows", "conditional_formatting"] },
    { name: "September", role: "custom", purpose: "September budget — category, budgeted, spent, remaining",
      columns: [
        { name: "Category", type: "text", width: 200 },
        { name: "Budget", type: "currency", width: 120 },
        { name: "Spent", type: "currency", width: 120 },
        { name: "Remaining", type: "currency", width: 120 },
      ],
      features: ["frozen_header", "alternating_rows", "conditional_formatting"] },
    { name: "October", role: "custom", purpose: "October budget — category, budgeted, spent, remaining",
      columns: [
        { name: "Category", type: "text", width: 200 },
        { name: "Budget", type: "currency", width: 120 },
        { name: "Spent", type: "currency", width: 120 },
        { name: "Remaining", type: "currency", width: 120 },
      ],
      features: ["frozen_header", "alternating_rows", "conditional_formatting"] },
    { name: "November", role: "custom", purpose: "November budget — category, budgeted, spent, remaining",
      columns: [
        { name: "Category", type: "text", width: 200 },
        { name: "Budget", type: "currency", width: 120 },
        { name: "Spent", type: "currency", width: 120 },
        { name: "Remaining", type: "currency", width: 120 },
      ],
      features: ["frozen_header", "alternating_rows", "conditional_formatting"] },
    { name: "December", role: "custom", purpose: "December budget — category, budgeted, spent, remaining",
      columns: [
        { name: "Category", type: "text", width: 200 },
        { name: "Budget", type: "currency", width: 120 },
        { name: "Spent", type: "currency", width: 120 },
        { name: "Remaining", type: "currency", width: 120 },
      ],
      features: ["frozen_header", "alternating_rows", "conditional_formatting"] },

    // 22. Bills Calendar — recurring bills with budgeted vs actual
    { name: "Bills Calendar", role: "custom", purpose: "Track recurring bills with budgeted, actual, and variance",
      columns: [
        { name: "Bill", type: "text", width: 200 },
        { name: "Category", type: "text", width: 140 },
        { name: "Account", type: "text", width: 130 },
        { name: "Budget", type: "currency", width: 110 },
        { name: "Real", type: "currency", width: 110 },
        { name: "Diff", type: "currency", width: 110 },
        { name: "Annual", type: "currency", width: 120 },
      ],
      features: ["frozen_header", "conditional_formatting", "alternating_rows"] },

    // 23. Recurring — recurring transactions across the year
    { name: "Recurring", role: "custom", purpose: "Recurring transactions across the year",
      columns: [
        { name: "Name", type: "text", width: 200 },
        { name: "Cadence", type: "text", width: 130 },
        { name: "Amount", type: "currency", width: 120 },
        { name: "Category", type: "text", width: 140 },
        { name: "Next Date", type: "date", width: 120 },
      ],
      features: ["frozen_header", "alternating_rows"] },

    // 24. Debt Tracker
    { name: "Debt Tracker", role: "custom", purpose: "Track every debt — original balance, current balance, APR, minimum payment",
      columns: [
        { name: "Debt", type: "text", width: 200 },
        { name: "Original", type: "currency", width: 120 },
        { name: "Current", type: "currency", width: 120 },
        { name: "APR", type: "percent", width: 100 },
        { name: "Min Payment", type: "currency", width: 120 },
      ],
      features: ["frozen_header", "alternating_rows"] },

    // 25. Savings Goals — dedicated builder
    { name: "Savings Goals", role: "savings-goals", purpose: "Track progress toward savings targets",
      columns: [
        { name: "Goal", type: "text", width: 200 },
        { name: "Target", type: "currency", width: 110 },
        { name: "Saved", type: "currency", width: 110 },
        { name: "Remaining", type: "currency", width: 110 },
        { name: "% Complete", type: "percent", width: 100 },
        { name: "Target Date", type: "date", width: 120 },
      ],
      features: ["frozen_header", "conditional_formatting", "alternating_rows"] },

    // 26. Net Worth
    { name: "Net Worth", role: "custom", purpose: "Monthly snapshot of assets minus liabilities",
      columns: [
        { name: "Month", type: "text", width: 120 },
        { name: "Assets", type: "currency", width: 120 },
        { name: "Liabilities", type: "currency", width: 120 },
        { name: "Net Worth", type: "currency", width: 130 },
        { name: "Change", type: "currency", width: 120 },
      ],
      features: ["frozen_header", "alternating_rows", "conditional_formatting"] },

    // 27. Income Streams
    { name: "Income Streams", role: "custom", purpose: "Track every source of monthly income",
      columns: [
        { name: "Source", type: "text", width: 200 },
        { name: "Monthly", type: "currency", width: 120 },
        { name: "YTD", type: "currency", width: 120 },
        { name: "% of Total", type: "percent", width: 110 },
      ],
      features: ["frozen_header", "alternating_rows"] },

    // 28. Subscriptions
    { name: "Subscriptions", role: "custom", purpose: "Audit recurring subscriptions and decide what to keep",
      columns: [
        { name: "Service", type: "text", width: 200 },
        { name: "Monthly", type: "currency", width: 110 },
        { name: "Annual", type: "currency", width: 110 },
        { name: "Category", type: "text", width: 140 },
        { name: "Keep?", type: "text", width: 100 },
      ],
      features: ["frozen_header", "alternating_rows", "conditional_formatting"] },

    // 29. Sinking Funds
    { name: "Sinking Funds", role: "custom", purpose: "Save for predictable future expenses month by month",
      columns: [
        { name: "Fund", type: "text", width: 200 },
        { name: "Target", type: "currency", width: 120 },
        { name: "Monthly", type: "currency", width: 120 },
        { name: "Current", type: "currency", width: 130 },
        { name: "Progress", type: "percent", width: 110 },
      ],
      features: ["frozen_header", "conditional_formatting", "alternating_rows"] },

    // 30. No-Spend Tracker
    { name: "No-Spend Tracker", role: "custom", purpose: "Mark every no-spend day and watch the streak grow",
      columns: [
        { name: "Date", type: "date", width: 120 },
        { name: "Status", type: "text", width: 120 },
        { name: "Notes", type: "text", width: 300 },
        { name: "Streak", type: "number", width: 90 },
      ],
      features: ["frozen_header", "alternating_rows"] },

    // 31. Year Goals
    { name: "Year Goals", role: "custom", purpose: "Top financial goals for the year — set, track, and review",
      columns: [
        { name: "Goal", type: "text", width: 280 },
        { name: "Category", type: "text", width: 130 },
        { name: "Target", type: "currency", width: 120 },
        { name: "Status", type: "text", width: 120 },
        { name: "Due", type: "date", width: 120 },
      ],
      features: ["frozen_header", "alternating_rows", "conditional_formatting"] },

    // 32. Annual Summary
    { name: "Annual Summary", role: "custom", purpose: "Year-end roll-up across income, expenses, savings, and debt",
      columns: [
        { name: "Month", type: "text", width: 120 },
        { name: "Income", type: "currency", width: 120 },
        { name: "Expenses", type: "currency", width: 120 },
        { name: "Saved", type: "currency", width: 120 },
        { name: "Debt Paid", type: "currency", width: 120 },
        { name: "Net", type: "currency", width: 120 },
      ],
      features: ["frozen_header", "alternating_rows", "conditional_formatting"] },
  ],
};

const TRAVEL_TABS: TabSetConfig = {
  tabs: [
    { name: "Dashboard", role: "dashboard", purpose: "Trip budget overview with expenses, savings, and itinerary", columns: [], features: ["frozen_header", "conditional_formatting"] },
    { name: "Trip Expenses", role: "transactions", purpose: "Log all trip expenses by category",
      columns: [
        { name: "Date", type: "date", width: 110 },
        { name: "Description", type: "text", width: 200 },
        { name: "Amount", type: "currency", width: 110 },
        { name: "Category", type: "text", width: 140 },
        { name: "Destination", type: "text", width: 130 },
        { name: "Paid By", type: "text", width: 100 },
      ],
      features: ["frozen_header", "dropdown_validation", "alternating_rows"] },
    { name: "Itinerary", role: "itinerary", purpose: "Plan your daily trip activities with times and costs",
      columns: [
        { name: "Day", type: "text", width: 90 },
        { name: "Date", type: "date", width: 110 },
        { name: "Activity", type: "text", width: 220 },
        { name: "Location", type: "text", width: 160 },
        { name: "Time", type: "text", width: 90 },
        { name: "Est. Cost", type: "currency", width: 110 },
        { name: "Booked", type: "text", width: 90 },
      ],
      features: ["frozen_header", "alternating_rows"] },
    { name: "Packing Checklist", role: "packing", purpose: "Keep track of what to pack for your trip",
      columns: [
        { name: "Item", type: "text", width: 220 },
        { name: "Category", type: "text", width: 140 },
        { name: "Packed", type: "text", width: 90 },
        { name: "Notes", type: "text", width: 200 },
      ],
      features: ["frozen_header", "alternating_rows"] },
    { name: "Trip Savings", role: "savings-goals", purpose: "Track savings progress toward your trip goals",
      columns: [
        { name: "Goal", type: "text", width: 200 },
        { name: "Target", type: "currency", width: 110 },
        { name: "Saved", type: "currency", width: 110 },
        { name: "Remaining", type: "currency", width: 110 },
        { name: "Progress", type: "percent", width: 90 },
        { name: "Status", type: "text", width: 130 },
      ],
      features: ["frozen_header", "conditional_formatting", "alternating_rows"] },
    { name: "Budget Setup", role: "budget-setup", purpose: "Set trip budget and category allocations", columns: [
        { name: "Setting", type: "text", width: 200 },
        { name: "Value", type: "currency", width: 120 },
        { name: "Notes", type: "text", width: 200 },
      ], features: ["frozen_header"] },
    { name: "Setup & Instructions", role: "setup", purpose: "How to use this travel budget planner", columns: [], features: [] },
  ],
};

const MEAL_PLANNER_TABS: TabSetConfig = {
  tabs: [
    { name: "Dashboard", role: "dashboard", purpose: "Food budget overview with weekly meal plan and cost breakdown", columns: [], features: ["frozen_header", "conditional_formatting"] },
    { name: "Weekly Meal Plan", role: "meal-plan", purpose: "Plan meals for every day of the week",
      columns: [
        { name: "Day", type: "text", width: 100 },
        { name: "Breakfast", type: "text", width: 160 },
        { name: "Lunch", type: "text", width: 160 },
        { name: "Dinner", type: "text", width: 160 },
        { name: "Snack", type: "text", width: 140 },
        { name: "Est. Cost", type: "currency", width: 100 },
        { name: "Prep Time", type: "text", width: 90 },
      ],
      features: ["frozen_header", "dropdown_validation", "alternating_rows"] },
    { name: "Grocery List", role: "grocery-list", purpose: "Auto-generated shopping list from your meal plan",
      columns: [
        { name: "Item", type: "text", width: 200 },
        { name: "Category", type: "text", width: 130 },
        { name: "Qty", type: "text", width: 70 },
        { name: "Est. Cost", type: "currency", width: 100 },
        { name: "Store", type: "text", width: 120 },
        { name: "Purchased", type: "text", width: 90 },
      ],
      features: ["frozen_header", "dropdown_validation", "alternating_rows"] },
    { name: "Food Expenses", role: "transactions", purpose: "Log all food-related purchases and dining",
      columns: [
        { name: "Date", type: "date", width: 110 },
        { name: "Description", type: "text", width: 200 },
        { name: "Amount", type: "currency", width: 110 },
        { name: "Category", type: "text", width: 140 },
        { name: "Homemade?", type: "text", width: 90 },
        { name: "Month", type: "text", width: 100 },
      ],
      features: ["frozen_header", "dropdown_validation", "alternating_rows"] },
    { name: "Recipe Bank", role: "recipe-bank", purpose: "Save favorite recipes with ingredients and costs",
      columns: [
        { name: "Recipe", type: "text", width: 200 },
        { name: "Servings", type: "text", width: 80 },
        { name: "Cost/Serving", type: "currency", width: 110 },
        { name: "Prep Time", type: "text", width: 90 },
        { name: "Category", type: "text", width: 120 },
        { name: "Rating", type: "text", width: 80 },
      ],
      features: ["frozen_header", "alternating_rows"] },
    { name: "Budget Setup", role: "budget-setup", purpose: "Set food budget and category allocations", columns: [
        { name: "Setting", type: "text", width: 200 },
        { name: "Value", type: "currency", width: 120 },
        { name: "Notes", type: "text", width: 200 },
      ], features: ["frozen_header"] },
    { name: "Setup & Instructions", role: "setup", purpose: "How to use this meal planning budget", columns: [], features: [] },
  ],
};

const STUDENT_TABS: TabSetConfig = {
  tabs: [
    { name: "Dashboard", role: "dashboard", purpose: "Student budget overview with semester costs and subscription audit", columns: [], features: ["frozen_header", "conditional_formatting"] },
    { name: "Transactions", role: "transactions", purpose: "Log all income and expenses throughout the semester",
      columns: [
        { name: "Date", type: "date", width: 110 },
        { name: "Description", type: "text", width: 200 },
        { name: "Amount", type: "currency", width: 110 },
        { name: "Category", type: "text", width: 140 },
        { name: "Source", type: "text", width: 120 },
        { name: "Month", type: "text", width: 100 },
      ],
      features: ["frozen_header", "dropdown_validation", "alternating_rows"] },
    { name: "Semester Costs", role: "semester-costs", purpose: "Track tuition, books, housing, and meal plan per semester",
      columns: [
        { name: "Semester", type: "text", width: 120 },
        { name: "Tuition & Fees", type: "currency", width: 130 },
        { name: "Textbooks", type: "currency", width: 110 },
        { name: "Housing", type: "currency", width: 110 },
        { name: "Meal Plan", type: "currency", width: 110 },
        { name: "Other", type: "currency", width: 100 },
        { name: "Total", type: "currency", width: 110 },
      ],
      features: ["frozen_header", "alternating_rows"] },
    { name: "Income Sources", role: "income-sources", purpose: "Track part-time work, financial aid, and other income",
      columns: [
        { name: "Source", type: "text", width: 180 },
        { name: "Monthly", type: "currency", width: 110 },
        { name: "Semester Total", type: "currency", width: 130 },
        { name: "Schedule", type: "text", width: 120 },
        { name: "Notes", type: "text", width: 180 },
      ],
      features: ["frozen_header", "alternating_rows"] },
    { name: "Subscriptions", role: "subscriptions", purpose: "Audit monthly subscriptions and decide what to keep",
      columns: [
        { name: "Service", type: "text", width: 180 },
        { name: "Monthly Cost", type: "currency", width: 120 },
        { name: "Annual Cost", type: "currency", width: 120 },
        { name: "Category", type: "text", width: 120 },
        { name: "Student Discount?", type: "text", width: 120 },
        { name: "Keep?", type: "text", width: 90 },
      ],
      features: ["frozen_header", "conditional_formatting", "alternating_rows"] },
    { name: "Savings Goals", role: "savings-goals", purpose: "Track savings for textbooks, travel, and post-grad goals",
      columns: [
        { name: "Goal", type: "text", width: 200 },
        { name: "Target", type: "currency", width: 110 },
        { name: "Saved", type: "currency", width: 110 },
        { name: "Remaining", type: "currency", width: 110 },
        { name: "Progress", type: "percent", width: 90 },
        { name: "Status", type: "text", width: 130 },
      ],
      features: ["frozen_header", "conditional_formatting", "alternating_rows"] },
    { name: "Budget Setup", role: "budget-setup", purpose: "Set monthly income and budget allocations", columns: [
        { name: "Setting", type: "text", width: 200 },
        { name: "Value", type: "currency", width: 120 },
        { name: "Notes", type: "text", width: 200 },
      ], features: ["frozen_header"] },
    { name: "Setup & Instructions", role: "setup", purpose: "How to use this student budget tracker", columns: [], features: [] },
  ],
};

const DEBT_PAYOFF_TABS: TabSetConfig = {
  tabs: [
    { name: "Dashboard", role: "dashboard", purpose: "Debt payoff overview with accounts, milestones, and progress", columns: [], features: ["frozen_header", "conditional_formatting"] },
    { name: "Debt Accounts", role: "debt-accounts", purpose: "Track all debts with balances, APR, and payoff dates",
      columns: [
        { name: "Account", type: "text", width: 180 },
        { name: "Type", type: "text", width: 120 },
        { name: "Balance", type: "currency", width: 120 },
        { name: "APR", type: "percent", width: 80 },
        { name: "Minimum Payment", type: "currency", width: 130 },
        { name: "Extra Payment", type: "currency", width: 120 },
        { name: "Est. Payoff Date", type: "date", width: 120 },
        { name: "Status", type: "text", width: 110 },
      ],
      features: ["frozen_header", "conditional_formatting", "alternating_rows"] },
    { name: "Monthly Payments", role: "transactions", purpose: "Log every debt payment and track interest vs principal",
      columns: [
        { name: "Date", type: "date", width: 110 },
        { name: "Account", type: "text", width: 160 },
        { name: "Amount", type: "currency", width: 110 },
        { name: "Principal", type: "currency", width: 110 },
        { name: "Interest", type: "currency", width: 110 },
        { name: "Remaining Balance", type: "currency", width: 130 },
      ],
      features: ["frozen_header", "dropdown_validation", "alternating_rows"] },
    { name: "Snowball Tracker", role: "snowball", purpose: "Visualize month-by-month debt reduction using snowball method",
      columns: [
        { name: "Month", type: "text", width: 110 },
        { name: "Starting Balance", type: "currency", width: 130 },
        { name: "Payment", type: "currency", width: 110 },
        { name: "Interest", type: "currency", width: 110 },
        { name: "Ending Balance", type: "currency", width: 130 },
        { name: "Progress", type: "percent", width: 90 },
      ],
      features: ["frozen_header", "alternating_rows"] },
    { name: "Monthly Budget", role: "budget-breakdown", purpose: "Allocate income between living expenses and debt payments",
      columns: [
        { name: "Category", type: "text", width: 200 },
        { name: "Budget", type: "currency", width: 120 },
        { name: "Actual", type: "currency", width: 120 },
        { name: "Variance", type: "currency", width: 120 },
        { name: "Status", type: "text", width: 120 },
      ],
      features: ["frozen_header", "conditional_formatting", "alternating_rows"] },
    { name: "Payoff Milestones", role: "milestones", purpose: "Celebrate wins and track debt-free milestones",
      columns: [
        { name: "Milestone", type: "text", width: 220 },
        { name: "Target Date", type: "date", width: 120 },
        { name: "Amount", type: "currency", width: 120 },
        { name: "Status", type: "text", width: 120 },
        { name: "Notes", type: "text", width: 180 },
      ],
      features: ["frozen_header", "alternating_rows"] },
    { name: "Budget Setup", role: "budget-setup", purpose: "Set monthly income and debt payoff strategy", columns: [
        { name: "Setting", type: "text", width: 200 },
        { name: "Value", type: "currency", width: 120 },
        { name: "Notes", type: "text", width: 200 },
      ], features: ["frozen_header"] },
    { name: "Setup & Instructions", role: "setup", purpose: "How to use this debt payoff tracker", columns: [], features: [] },
  ],
};

// Default nurture tab set (baby variant without milestones)
const DEFAULT_NURTURE_TABS: TabSetConfig = {
  tabs: [
    { name: "Dashboard", role: "dashboard", purpose: "Budget overview with spending and savings goals", columns: [], features: ["frozen_header", "conditional_formatting"] },
    { name: "Transactions", role: "transactions", purpose: "Log income and expenses",
      columns: [
        { name: "Date", type: "date", width: 110 },
        { name: "Description", type: "text", width: 200 },
        { name: "Amount", type: "currency", width: 110 },
        { name: "Sub-Category", type: "text", width: 140 },
        { name: "Category", type: "text", width: 120 },
        { name: "Bucket", type: "text", width: 100 },
        { name: "Month", type: "text", width: 100 },
      ],
      features: ["frozen_header", "dropdown_validation", "alternating_rows"] },
    { name: "Budget Setup", role: "budget-setup", purpose: "Set monthly income and allocations", columns: [
        { name: "Setting", type: "text", width: 200 },
        { name: "Value", type: "currency", width: 120 },
        { name: "Notes", type: "text", width: 200 },
      ], features: ["frozen_header"] },
    { name: "Monthly Summary", role: "monthly-summary", purpose: "Monthly breakdown by category", columns: [
        { name: "Month", type: "text", width: 110 },
        { name: "Income", type: "currency", width: 110 },
        { name: "Spent", type: "currency", width: 110 },
        { name: "Net", type: "currency", width: 110 },
      ], features: ["frozen_header", "alternating_rows"] },
    { name: "Savings Goals", role: "savings-goals", purpose: "Track savings goals with progress",
      columns: [
        { name: "Goal", type: "text", width: 200 },
        { name: "Target", type: "currency", width: 110 },
        { name: "Saved", type: "currency", width: 110 },
        { name: "Remaining", type: "currency", width: 110 },
        { name: "Progress", type: "percent", width: 90 },
        { name: "Status", type: "text", width: 130 },
      ],
      features: ["frozen_header", "conditional_formatting", "alternating_rows"] },
    { name: "Setup & Instructions", role: "setup", purpose: "How to use this budget tracker", columns: [], features: [] },
  ],
};

const TAB_SET_CONFIGS: Record<string, TabSetConfig> = {
  "wedding-planner": WEDDING_TABS,
  "baby-budget": BABY_TABS,
  "pregnancy-planner": BABY_TABS,
  "business-pl": BUSINESS_TABS,
  "side-hustle": BUSINESS_TABS,
  "paycheck-budget": PAYCHECK_TABS,
  "adhd-budget": PAYCHECK_TABS,
  "adhd-planner": PAYCHECK_TABS,
  "generic-budget": PAYCHECK_TABS,
  "generic": PAYCHECK_TABS,
  "travel-planner": TRAVEL_TABS,
  "travel-budget": TRAVEL_TABS,
  "debt-payoff": DEBT_PAYOFF_TABS,
  "meal-planner": MEAL_PLANNER_TABS,
  "student-budget": STUDENT_TABS,
};

export function getTabSetConfig(nicheProfileId: string): TabSetConfig {
  return TAB_SET_CONFIGS[nicheProfileId] || DEFAULT_NURTURE_TABS;
}

// ══════════════════════════════════════════════════════════════
// IMAGE PLAN CONFIGS — Family-specific 7-image strategies
// ══════════════════════════════════════════════════════════════

// ── NURTURE family (baby, pregnancy, savings, paycheck-savings) ──
// Narrative: warm hero → emotional pain → dashboard comfort → milestone progress → method → tabs → delivery
const NURTURE_IMAGE_PLAN: ImagePlanConfig = {
  slots: [
    { slot: 1, kind: "thumbnail", titleTemplate: "{PRODUCT_NAME}", subtitleTemplate: "Google Sheets Template", sourceTabRole: "dashboard", cropIntent: "full", mockupType: "laptop", overlayStyle: "bold-dark", notes: "Soft centered laptop mockup with pastel gradient background. Show full dashboard with KPI cards and savings goals." },
    { slot: 2, kind: "problem", titleTemplate: "{PROBLEM_HOOK}", subtitleTemplate: "{PROBLEM_SOLUTION}", sourceTabRole: "", cropIntent: "", mockupType: "text-slide", overlayStyle: "bold-dark", notes: "Emotional text slide with dark background. Large centered hook text." },
    { slot: 3, kind: "dashboard", titleTemplate: "Everything you need. One dashboard.", subtitleTemplate: "", sourceTabRole: "dashboard", cropIntent: "kpi", mockupType: "fullscreen", overlayStyle: "clean-light", notes: "Crop to KPI cards and spending breakdown. Show real data." },
    { slot: 4, kind: "milestone-tracker", titleTemplate: "Track every goal. See real progress.", subtitleTemplate: "", sourceTabRole: "savings-goals", cropIntent: "table", mockupType: "fullscreen", overlayStyle: "minimal-premium", notes: "Show savings goals with progress bars, milestone markers, and thermometer-style fill. Warm palette." },
    { slot: 5, kind: "method", titleTemplate: "{METHOD_TITLE}", subtitleTemplate: "{METHOD_SUBTITLE}", sourceTabRole: "budget-setup", cropIntent: "section", mockupType: "split-layout", overlayStyle: "clean-light", notes: "Left: screenshot of budget setup. Right: text explaining the method." },
    { slot: 6, kind: "included", titleTemplate: "{TAB_COUNT} tabs. One complete system.", subtitleTemplate: "{TAB_LIST}", sourceTabRole: "", cropIntent: "", mockupType: "text-slide", overlayStyle: "clean-light", notes: "Grid showing all tabs with icons and one-line purposes." },
    { slot: 7, kind: "delivery", titleTemplate: "Download. Open. Start budgeting.", subtitleTemplate: "Set up in 5 minutes. No app. No subscription.", sourceTabRole: "setup", cropIntent: "section", mockupType: "text-slide", overlayStyle: "minimal-premium", notes: "Three-step delivery visual." },
  ],
};

// ── EXECUTIVE family (business, side-hustle, debt) ──
// Narrative: data-dense hero → sharp challenge → KPI strip → P&L deep-dive → comparison → tabs → delivery
const EXECUTIVE_IMAGE_PLAN: ImagePlanConfig = {
  slots: [
    { slot: 1, kind: "thumbnail", titleTemplate: "{PRODUCT_NAME}", subtitleTemplate: "Google Sheets P&L Tracker", sourceTabRole: "dashboard", cropIntent: "full", mockupType: "laptop", overlayStyle: "bold-dark", notes: "Dark angled laptop mockup. Show KPI strip with revenue, expenses, profit. Executive feel." },
    { slot: 2, kind: "kpi-hero", titleTemplate: "Revenue. Costs. Profit. One view.", subtitleTemplate: "", sourceTabRole: "dashboard", cropIntent: "kpi", mockupType: "fullscreen", overlayStyle: "clean-light", notes: "Full-bleed KPI strip hero — no device frame, just the raw numbers. Crop tight to the 4-KPI strip and cost breakdown. Data-forward, analytical." },
    { slot: 3, kind: "pl-breakdown", titleTemplate: "See your real P&L every month.", subtitleTemplate: "", sourceTabRole: "monthly-pl", cropIntent: "table", mockupType: "fullscreen", overlayStyle: "minimal-premium", notes: "Monthly P&L table with revenue, expenses, net profit, and margin columns. Dense grid. Highlight Variance and % of Total columns." },
    { slot: 4, kind: "feature", titleTemplate: "Tax-ready. Audit-proof. Automatic.", subtitleTemplate: "Revenue tracking + expense categorization + tax planning", sourceTabRole: "tax-planning", cropIntent: "section", mockupType: "split-layout", overlayStyle: "clean-light", notes: "Left: tax planning tab with quarterly set-aside. Right: text with executive benefits." },
    { slot: 5, kind: "comparison", titleTemplate: "{PROBLEM_HOOK}", subtitleTemplate: "{PROBLEM_SOLUTION}", sourceTabRole: "", cropIntent: "", mockupType: "text-slide", overlayStyle: "bold-dark", notes: "Two-column comparison: left=generic spreadsheet pain, right=this system's benefits. Before/after framing. Dark, high-contrast." },
    { slot: 6, kind: "included", titleTemplate: "{TAB_COUNT} tabs. Complete business system.", subtitleTemplate: "{TAB_LIST}", sourceTabRole: "", cropIntent: "", mockupType: "text-slide", overlayStyle: "clean-light", notes: "Grid showing all tabs. Executive styling." },
    { slot: 7, kind: "delivery", titleTemplate: "Download. Open. Know your numbers.", subtitleTemplate: "Instant setup. No app. No subscription.", sourceTabRole: "setup", cropIntent: "section", mockupType: "text-slide", overlayStyle: "minimal-premium", notes: "Three-step delivery visual with executive tone." },
  ],
};

// ── EDITORIAL/WEDDING family ──
// Narrative: elegant hero → empathetic pain → vendor zoom → guest zoom → timeline method → tabs → delivery
const EDITORIAL_WEDDING_IMAGE_PLAN: ImagePlanConfig = {
  slots: [
    { slot: 1, kind: "thumbnail", titleTemplate: "{PRODUCT_NAME}", subtitleTemplate: "Google Sheets Wedding Planner", sourceTabRole: "dashboard", cropIntent: "full", mockupType: "laptop", overlayStyle: "bold-dark", notes: "Elegant cream-background laptop mockup. Show wedding dashboard with vendor and guest summaries. Refined serif typography." },
    { slot: 2, kind: "problem", titleTemplate: "{PROBLEM_HOOK}", subtitleTemplate: "{PROBLEM_SOLUTION}", sourceTabRole: "", cropIntent: "", mockupType: "text-slide", overlayStyle: "bold-dark", notes: "Elegant text slide. Empathetic wedding planning stress. Serif font, warm tones." },
    { slot: 3, kind: "vendor-zoom", titleTemplate: "Every vendor. Every dollar. Tracked.", subtitleTemplate: "", sourceTabRole: "vendor-tracker", cropIntent: "table", mockupType: "fullscreen", overlayStyle: "clean-light", notes: "Close-up on vendor tracker: quotes, deposits, payment status. Show 5 real vendors. Elegant table styling with editorial borders." },
    { slot: 4, kind: "vendor-zoom", titleTemplate: "Track every guest. Every RSVP.", subtitleTemplate: "", sourceTabRole: "guest-list", cropIntent: "table", mockupType: "fullscreen", overlayStyle: "minimal-premium", notes: "Guest list close-up: party size, RSVP status, table assignments, meal preferences. Wedding-specific data." },
    { slot: 5, kind: "method", titleTemplate: "Plan with confidence. Stay on budget.", subtitleTemplate: "Vendor management + guest tracking + timeline + payments", sourceTabRole: "timeline", cropIntent: "section", mockupType: "split-layout", overlayStyle: "clean-light", notes: "Left: wedding timeline tab. Right: text explaining the 4-system approach." },
    { slot: 6, kind: "included", titleTemplate: "{TAB_COUNT} tabs. Your complete wedding planner.", subtitleTemplate: "{TAB_LIST}", sourceTabRole: "", cropIntent: "", mockupType: "text-slide", overlayStyle: "clean-light", notes: "Elegant grid showing all wedding tabs with ornamental dividers." },
    { slot: 7, kind: "social-proof", titleTemplate: "Join thousands of happy couples.", subtitleTemplate: "Download. Open. Start planning.", sourceTabRole: "setup", cropIntent: "section", mockupType: "text-slide", overlayStyle: "minimal-premium", notes: "Trust slide: star rating, review quotes, instant download badge. Romantic elegant styling." },
  ],
};

// ── EDITORIAL/TRAVEL family ──
// Narrative: aspirational hero → overspending pain → dashboard → itinerary close-up → packing/savings → tabs → delivery
const EDITORIAL_TRAVEL_IMAGE_PLAN: ImagePlanConfig = {
  slots: [
    { slot: 1, kind: "thumbnail", titleTemplate: "{PRODUCT_NAME}", subtitleTemplate: "Google Sheets Travel Planner", sourceTabRole: "dashboard", cropIntent: "full", mockupType: "laptop", overlayStyle: "bold-dark", notes: "Airy travel-themed laptop mockup. Show trip budget dashboard with itinerary preview." },
    { slot: 2, kind: "problem", titleTemplate: "{PROBLEM_HOOK}", subtitleTemplate: "{PROBLEM_SOLUTION}", sourceTabRole: "", cropIntent: "", mockupType: "text-slide", overlayStyle: "bold-dark", notes: "Aspirational text slide about travel budget stress. Adventure imagery cues." },
    { slot: 3, kind: "dashboard", titleTemplate: "Every trip expense. Organized.", subtitleTemplate: "", sourceTabRole: "dashboard", cropIntent: "kpi", mockupType: "fullscreen", overlayStyle: "clean-light", notes: "Trip KPIs with expense breakdown by category. Light, airy composition." },
    { slot: 4, kind: "itinerary-preview", titleTemplate: "Plan your perfect itinerary.", subtitleTemplate: "", sourceTabRole: "itinerary", cropIntent: "table", mockupType: "fullscreen", overlayStyle: "minimal-premium", notes: "Itinerary tab close-up: day, activity, location, time, cost columns. Show 8 real entries across multiple days. Travel-specific data." },
    { slot: 5, kind: "method", titleTemplate: "Budget smart. Travel better.", subtitleTemplate: "Expense tracking + itinerary + packing + savings goals", sourceTabRole: "packing", cropIntent: "section", mockupType: "split-layout", overlayStyle: "clean-light", notes: "Left: packing checklist. Right: text explaining the 4-system travel approach." },
    { slot: 6, kind: "included", titleTemplate: "{TAB_COUNT} tabs. Your complete trip planner.", subtitleTemplate: "{TAB_LIST}", sourceTabRole: "", cropIntent: "", mockupType: "text-slide", overlayStyle: "clean-light", notes: "Grid of all travel tabs with destination-themed icons." },
    { slot: 7, kind: "delivery", titleTemplate: "Download. Open. Plan your trip.", subtitleTemplate: "Instant setup. No app. No subscription.", sourceTabRole: "setup", cropIntent: "section", mockupType: "text-slide", overlayStyle: "minimal-premium", notes: "Three-step delivery." },
  ],
};

// ── PAYCHECK-specific (nurture family but unique narrative) ──
// Narrative: urgent hero → paycheck pain → bills calendar → debt/sinking funds → method → tabs → delivery
const PAYCHECK_IMAGE_PLAN: ImagePlanConfig = {
  slots: [
    { slot: 1, kind: "thumbnail", titleTemplate: "{PRODUCT_NAME}", subtitleTemplate: "Paycheck Budget System", sourceTabRole: "dashboard", cropIntent: "full", mockupType: "laptop", overlayStyle: "bold-dark", notes: "Centered laptop with workspace background. Show paycheck allocation dashboard with bills and sinking funds." },
    { slot: 2, kind: "problem", titleTemplate: "{PROBLEM_HOOK}", subtitleTemplate: "{PROBLEM_SOLUTION}", sourceTabRole: "", cropIntent: "", mockupType: "text-slide", overlayStyle: "bold-dark", notes: "Urgent, empowering text slide. Where does your money go?" },
    { slot: 3, kind: "dashboard", titleTemplate: "Every dollar. Every paycheck. Tracked.", subtitleTemplate: "", sourceTabRole: "dashboard", cropIntent: "kpi", mockupType: "fullscreen", overlayStyle: "clean-light", notes: "Paycheck KPIs: Take-Home Pay, Bills & Fixed, Discretionary, Remaining. Show allocation bars." },
    { slot: 4, kind: "bills-calendar", titleTemplate: "Never miss a bill. Never pay late.", subtitleTemplate: "", sourceTabRole: "bills-due", cropIntent: "table", mockupType: "fullscreen", overlayStyle: "minimal-premium", notes: "Bills & Due Dates tab close-up: bill name, amount, due date, auto-pay status. Show 6 real bills. Calendar-style layout emphasis." },
    { slot: 5, kind: "debt-progress", titleTemplate: "Watch your debt shrink. Every month.", subtitleTemplate: "Debt tracker + sinking funds + bills calendar", sourceTabRole: "debt-tracker", cropIntent: "section", mockupType: "split-layout", overlayStyle: "clean-light", notes: "Left: debt tracker with balances and minimum payments. Right: sinking funds progress. Progress bar styling." },
    { slot: 6, kind: "included", titleTemplate: "{TAB_COUNT} tabs. Complete paycheck system.", subtitleTemplate: "{TAB_LIST}", sourceTabRole: "", cropIntent: "", mockupType: "text-slide", overlayStyle: "clean-light", notes: "Grid showing all paycheck tabs: dashboard, transactions, bills, sinking funds, debt tracker." },
    { slot: 7, kind: "delivery", titleTemplate: "Download. Open. Take control.", subtitleTemplate: "Set up in 5 minutes. Works with every paycheck.", sourceTabRole: "setup", cropIntent: "section", mockupType: "text-slide", overlayStyle: "minimal-premium", notes: "Three-step delivery with paycheck empowerment tone." },
  ],
};

// ── EDITORIAL/MEAL PLANNER family ──
// Narrative: fresh hero → food budget pain → weekly plan → grocery list → cost savings → tabs → delivery
const EDITORIAL_MEAL_IMAGE_PLAN: ImagePlanConfig = {
  slots: [
    { slot: 1, kind: "thumbnail", titleTemplate: "{PRODUCT_NAME}", subtitleTemplate: "Google Sheets Meal Planner", sourceTabRole: "dashboard", cropIntent: "full", mockupType: "laptop", overlayStyle: "bold-dark", notes: "Clean, fresh laptop mockup with warm background. Show meal plan dashboard with weekly plan and food spending." },
    { slot: 2, kind: "problem", titleTemplate: "{PROBLEM_HOOK}", subtitleTemplate: "{PROBLEM_SOLUTION}", sourceTabRole: "", cropIntent: "", mockupType: "text-slide", overlayStyle: "bold-dark", notes: "Text slide about food spending stress. Fresh, earthy tones." },
    { slot: 3, kind: "meal-plan-zoom", titleTemplate: "Plan every meal. Save every dollar.", subtitleTemplate: "", sourceTabRole: "meal-plan", cropIntent: "table", mockupType: "fullscreen", overlayStyle: "clean-light", notes: "Weekly meal plan close-up: day, breakfast, lunch, dinner, snack columns. Show full week. Fresh, colorful." },
    { slot: 4, kind: "grocery-zoom", titleTemplate: "Your grocery list. Auto-generated.", subtitleTemplate: "", sourceTabRole: "grocery-list", cropIntent: "table", mockupType: "fullscreen", overlayStyle: "minimal-premium", notes: "Grocery list tab close-up with categories, quantities, and estimated costs. Organized by store section." },
    { slot: 5, kind: "method", titleTemplate: "Plan. Shop. Cook. Save.", subtitleTemplate: "Meal planning + grocery list + cost tracking + recipe bank", sourceTabRole: "recipe-bank", cropIntent: "section", mockupType: "split-layout", overlayStyle: "clean-light", notes: "Left: recipe bank tab. Right: text explaining the 4-step system." },
    { slot: 6, kind: "included", titleTemplate: "{TAB_COUNT} tabs. Your complete meal system.", subtitleTemplate: "{TAB_LIST}", sourceTabRole: "", cropIntent: "", mockupType: "text-slide", overlayStyle: "clean-light", notes: "Grid showing all meal planner tabs with food-themed icons." },
    { slot: 7, kind: "delivery", titleTemplate: "Download. Open. Start planning.", subtitleTemplate: "Instant setup. No app. No subscription.", sourceTabRole: "setup", cropIntent: "section", mockupType: "text-slide", overlayStyle: "minimal-premium", notes: "Three-step delivery visual with fresh, healthy tone." },
  ],
};

// ── STUDENT BUDGET (executive family, student narrative) ──
// Narrative: campus hero → broke student pain → semester costs → subscription audit → income sources → tabs → delivery
const STUDENT_IMAGE_PLAN: ImagePlanConfig = {
  slots: [
    { slot: 1, kind: "thumbnail", titleTemplate: "{PRODUCT_NAME}", subtitleTemplate: "Google Sheets Student Budget", sourceTabRole: "dashboard", cropIntent: "full", mockupType: "laptop", overlayStyle: "bold-dark", notes: "Modern laptop mockup with youthful energy. Show student dashboard with semester costs and budget." },
    { slot: 2, kind: "problem", titleTemplate: "{PROBLEM_HOOK}", subtitleTemplate: "{PROBLEM_SOLUTION}", sourceTabRole: "", cropIntent: "", mockupType: "text-slide", overlayStyle: "bold-dark", notes: "Bold text slide about student money stress. Relatable, energetic tone." },
    { slot: 3, kind: "dashboard", titleTemplate: "Every dollar. Every semester. Tracked.", subtitleTemplate: "", sourceTabRole: "dashboard", cropIntent: "kpi", mockupType: "fullscreen", overlayStyle: "clean-light", notes: "Student KPIs with monthly budget and semester cost overview. Clean, organized." },
    { slot: 4, kind: "semester-zoom", titleTemplate: "Know your semester costs before day one.", subtitleTemplate: "", sourceTabRole: "semester-costs", cropIntent: "table", mockupType: "fullscreen", overlayStyle: "minimal-premium", notes: "Semester costs table: tuition, books, housing, meal plan. Multi-semester comparison. Clear and practical." },
    { slot: 5, kind: "subscription-audit", titleTemplate: "Audit your subscriptions. Keep what matters.", subtitleTemplate: "Income tracking + semester planning + subscription audit", sourceTabRole: "subscriptions", cropIntent: "section", mockupType: "split-layout", overlayStyle: "clean-light", notes: "Left: subscription audit tab. Right: text about smart student budgeting." },
    { slot: 6, kind: "included", titleTemplate: "{TAB_COUNT} tabs. Your complete student system.", subtitleTemplate: "{TAB_LIST}", sourceTabRole: "", cropIntent: "", mockupType: "text-slide", overlayStyle: "clean-light", notes: "Grid showing all student tabs with academic-themed icons." },
    { slot: 7, kind: "delivery", titleTemplate: "Download. Open. Budget like a pro.", subtitleTemplate: "Set up in 5 minutes. Free Google Sheets.", sourceTabRole: "setup", cropIntent: "section", mockupType: "text-slide", overlayStyle: "minimal-premium", notes: "Three-step delivery visual with student-friendly tone." },
  ],
};

// ── DEBT PAYOFF (executive family, debt-focused narrative) ──
// Narrative: freedom hero → debt pain → debt accounts → snowball tracker → milestones → tabs → delivery
const DEBT_PAYOFF_IMAGE_PLAN: ImagePlanConfig = {
  slots: [
    { slot: 1, kind: "thumbnail", titleTemplate: "{PRODUCT_NAME}", subtitleTemplate: "Google Sheets Debt Payoff Tracker", sourceTabRole: "dashboard", cropIntent: "full", mockupType: "laptop", overlayStyle: "bold-dark", notes: "Powerful laptop mockup with determined energy. Show debt dashboard with accounts and milestones." },
    { slot: 2, kind: "problem", titleTemplate: "{PROBLEM_HOOK}", subtitleTemplate: "{PROBLEM_SOLUTION}", sourceTabRole: "", cropIntent: "", mockupType: "text-slide", overlayStyle: "bold-dark", notes: "Urgent, empowering text slide about debt stress. Bold, motivational." },
    { slot: 3, kind: "debt-overview", titleTemplate: "See all your debts. One clear picture.", subtitleTemplate: "", sourceTabRole: "debt-accounts", cropIntent: "table", mockupType: "fullscreen", overlayStyle: "clean-light", notes: "Debt accounts table: account, balance, APR, minimum, extra payment, payoff date. Show 5 real debts. High-contrast." },
    { slot: 4, kind: "snowball-zoom", titleTemplate: "Watch your debt shrink. Every month.", subtitleTemplate: "", sourceTabRole: "snowball", cropIntent: "table", mockupType: "fullscreen", overlayStyle: "minimal-premium", notes: "Snowball tracker close-up: month-by-month balance reduction with progress bars. Motivational downward trend." },
    { slot: 5, kind: "milestones", titleTemplate: "Celebrate every win on the way to freedom.", subtitleTemplate: "Debt tracking + snowball method + milestone celebrations", sourceTabRole: "milestones", cropIntent: "section", mockupType: "split-layout", overlayStyle: "clean-light", notes: "Left: payoff milestones tab. Right: text about the debt-free journey." },
    { slot: 6, kind: "included", titleTemplate: "{TAB_COUNT} tabs. Your complete payoff system.", subtitleTemplate: "{TAB_LIST}", sourceTabRole: "", cropIntent: "", mockupType: "text-slide", overlayStyle: "clean-light", notes: "Grid showing all debt payoff tabs with progress-themed icons." },
    { slot: 7, kind: "delivery", titleTemplate: "Download. Open. Start your payoff.", subtitleTemplate: "Set up in 5 minutes. See freedom in months.", sourceTabRole: "setup", cropIntent: "section", mockupType: "text-slide", overlayStyle: "minimal-premium", notes: "Three-step delivery visual with empowerment tone." },
  ],
};

const IMAGE_PLAN_CONFIGS: Record<string, ImagePlanConfig> = {
  "wedding-planner": EDITORIAL_WEDDING_IMAGE_PLAN,
  "travel-planner": EDITORIAL_TRAVEL_IMAGE_PLAN,
  "meal-planner": EDITORIAL_MEAL_IMAGE_PLAN,
  "business-pl": EXECUTIVE_IMAGE_PLAN,
  "side-hustle": EXECUTIVE_IMAGE_PLAN,
  "debt-payoff": DEBT_PAYOFF_IMAGE_PLAN,
  "student-budget": STUDENT_IMAGE_PLAN,
  "paycheck-budget": PAYCHECK_IMAGE_PLAN,
};

export function getImagePlanConfig(nicheProfileId: string): ImagePlanConfig {
  return IMAGE_PLAN_CONFIGS[nicheProfileId] || NURTURE_IMAGE_PLAN;
}

// ══════════════════════════════════════════════════════════════
// VIDEO SCENE CONFIGS — Family-specific pacing & tone
// ══════════════════════════════════════════════════════════════

const NURTURE_VIDEO: VideoSceneConfig = {
  pacing: "moderate",
  emotionalTone: "calming",
  introDurationMs: 2500,
  revealDurationMs: 2500,
  proofZoomScale: 1.22,
  proofZoomOrigin: "center 22%",
  proofScrollPx: 300,
  tabSwitchCount: 2,
  transformationDurationMs: 2200,
  ctaDurationMs: 3500,
  focusSections: ["kpis", "savings-goals"],
};

const EXECUTIVE_VIDEO: VideoSceneConfig = {
  pacing: "fast",
  emotionalTone: "analytical",
  introDurationMs: 2000,
  revealDurationMs: 2000,
  proofZoomScale: 1.30,
  proofZoomOrigin: "center 18%",
  proofScrollPx: 400,
  tabSwitchCount: 2,
  transformationDurationMs: 1800,
  ctaDurationMs: 3000,
  focusSections: ["kpis", "cost-breakdown", "tax-reserve"],
};

const EDITORIAL_WEDDING_VIDEO: VideoSceneConfig = {
  pacing: "slow",
  emotionalTone: "romantic",
  introDurationMs: 3000,
  revealDurationMs: 3000,
  proofZoomScale: 1.15,
  proofZoomOrigin: "center 25%",
  proofScrollPx: 200,
  tabSwitchCount: 3,
  transformationDurationMs: 2500,
  ctaDurationMs: 3500,
  focusSections: ["vendor-summary", "guest-count", "category-breakdown"],
};

const EDITORIAL_TRAVEL_VIDEO: VideoSceneConfig = {
  pacing: "moderate",
  emotionalTone: "aspirational",
  introDurationMs: 2500,
  revealDurationMs: 2800,
  proofZoomScale: 1.18,
  proofZoomOrigin: "center 22%",
  proofScrollPx: 250,
  tabSwitchCount: 3,
  transformationDurationMs: 2000,
  ctaDurationMs: 3500,
  focusSections: ["trip-expenses", "itinerary-mini", "trip-savings"],
};

const EDITORIAL_MEAL_VIDEO: VideoSceneConfig = {
  pacing: "moderate",
  emotionalTone: "fresh",
  introDurationMs: 2500,
  revealDurationMs: 2500,
  proofZoomScale: 1.18,
  proofZoomOrigin: "center 22%",
  proofScrollPx: 250,
  tabSwitchCount: 3,
  transformationDurationMs: 2200,
  ctaDurationMs: 3500,
  focusSections: ["weekly-meal-plan", "food-spending", "cost-per-meal"],
};

const STUDENT_VIDEO: VideoSceneConfig = {
  pacing: "fast",
  emotionalTone: "energetic",
  introDurationMs: 2000,
  revealDurationMs: 2000,
  proofZoomScale: 1.25,
  proofZoomOrigin: "center 20%",
  proofScrollPx: 350,
  tabSwitchCount: 2,
  transformationDurationMs: 1800,
  ctaDurationMs: 3000,
  focusSections: ["monthly-budget", "semester-overview", "subscription-audit"],
};

const DEBT_PAYOFF_VIDEO: VideoSceneConfig = {
  pacing: "moderate",
  emotionalTone: "empowering",
  introDurationMs: 2500,
  revealDurationMs: 2500,
  proofZoomScale: 1.25,
  proofZoomOrigin: "center 20%",
  proofScrollPx: 350,
  tabSwitchCount: 2,
  transformationDurationMs: 2000,
  ctaDurationMs: 3500,
  focusSections: ["debt-accounts", "monthly-budget", "payoff-milestones"],
};

const VIDEO_SCENE_CONFIGS: Record<string, VideoSceneConfig> = {
  "wedding-planner": EDITORIAL_WEDDING_VIDEO,
  "travel-planner": EDITORIAL_TRAVEL_VIDEO,
  "meal-planner": EDITORIAL_MEAL_VIDEO,
  "business-pl": EXECUTIVE_VIDEO,
  "side-hustle": EXECUTIVE_VIDEO,
  "debt-payoff": DEBT_PAYOFF_VIDEO,
  "student-budget": STUDENT_VIDEO,
  "paycheck-budget": NURTURE_VIDEO,
};

export function getVideoSceneConfig(nicheProfileId: string): VideoSceneConfig {
  return VIDEO_SCENE_CONFIGS[nicheProfileId] || NURTURE_VIDEO;
}
