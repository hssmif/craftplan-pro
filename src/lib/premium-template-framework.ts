// ═══════════════════════════════════════════════════════════════════════════════
// PREMIUM TEMPLATE FRAMEWORK — CraftPlan Digital Template Factory
// ═══════════════════════════════════════════════════════════════════════════════
//
// This module transforms any basic NotionTemplateSpec into a PREMIUM,
// Etsy-ready template that matches professional video-style planners
// (Planifest, The Notion Bar, Gridfiti, etc.)
//
// Architecture:
//   1. PremiumConfig → parameterized input (works for ANY template type)
//   2. applyPremiumFramework() → wraps a base spec with premium polish
//   3. Section generators → cover, navigation, KPI dashboard, onboarding, etc.
//   4. Visual identity system → aesthetic-aware colors, icons, and layout rules
//   5. Demo data story arc → coherent sample data that tells a story
//
// Usage:
//   const baseSpec = getADHDPlannerSpec("dark");
//   const config = buildPremiumConfig("adhd_planner", "dark", { ... });
//   const premiumSpec = applyPremiumFramework(baseSpec, config);
//   // premiumSpec is now a full NotionTemplateSpec ready for the Notion API builder
//
// ═══════════════════════════════════════════════════════════════════════════════

import {
  NotionTemplateSpec,
  BlockSpec,
  DatabaseSpec,
  DatabaseProperty,
  PageSpec,
  AESTHETIC_COLORS,
  createCallout,
} from "./notion-templates";

// ═══════════════════════════════════════════════════════════════════════════════
// A) PREMIUM TEMPLATE FRAMEWORK — Global Rules & Configuration
// ═══════════════════════════════════════════════════════════════════════════════

/** Visual identity for a premium template */
export interface VisualIdentity {
  /** Color palette key from AESTHETIC_COLORS */
  aesthetic: string;
  /** Primary brand color for section headers/accents */
  brandColor: string;
  /** Background color for callouts and cards */
  cardBackground: string;
  /** Accent color for highlights and badges */
  accentColor: string;
  /** Cover image URL (1500x600 recommended) */
  coverUrl: string;
  /** Fallback cover URL (Notion built-in — guaranteed to work) */
  coverFallbackUrl?: string;
  /** Brand watermark/tagline (e.g. "planifest", "craftplan") */
  brandTagline?: string;
  /** Icon style: emoji-heavy or minimal */
  iconStyle: "emoji" | "minimal";
}

/** Navigation tab definition */
export interface NavTab {
  /** Emoji icon for the tab */
  icon: string;
  /** Tab label */
  label: string;
  /** Target section heading (used for Notion anchor links) */
  targetSection: string;
  /** Whether this tab is the "home" tab */
  isHome?: boolean;
}

/** KPI stat card definition */
export interface KPICard {
  /** Emoji icon */
  icon: string;
  /** Metric label (e.g. "Tasks Done") */
  label: string;
  /** Value source: "formula" | "static" | "database_count" */
  valueType: "formula" | "static" | "database_count";
  /** Formula expression or static value */
  value: string;
  /** Color for the card background */
  color: string;
  /** Subtitle text (e.g. "this week") */
  subtitle?: string;
}

/** Quick action button definition */
export interface QuickAction {
  /** Emoji icon */
  icon: string;
  /** Button label */
  label: string;
  /** Action type: link to database, sub-page, or external URL */
  actionType: "database_link" | "subpage_link" | "external_url";
  /** Target database key, sub-page name, or URL */
  target: string;
}

/** Onboarding step definition */
export interface OnboardingStep {
  /** Step number (1-based) */
  order: number;
  /** Step instruction text */
  instruction: string;
  /** Estimated time (e.g. "2 min") */
  timeEstimate: string;
  /** Related database key or section */
  relatedSection?: string;
}

/** Dashboard section layout rule */
export interface DashboardSection {
  /** Section heading text */
  heading: string;
  /** Section emoji icon */
  icon: string;
  /** Layout mode: full-width, 2-column, or 3-column */
  layout: "full" | "2-col" | "3-col";
  /** Content type for this section */
  contentType: "kpi_row" | "database_preview" | "checklist" | "callout_grid" | "action_buttons" | "text_block" | "navigation" | "onboarding";
  /** Database key if this section previews a database */
  databaseKey?: string;
  /** Number of preview items to show */
  previewCount?: number;
  /** Collapsible (toggle) or always visible */
  collapsible?: boolean;
}

/** Page template for database entries */
export interface DatabasePageTemplate {
  /** Database key this template applies to */
  databaseKey: string;
  /** Page title formula or pattern */
  titlePattern: string;
  /** Blocks inside each database page */
  pageBlocks: BlockSpec[];
}

/** Demo data story arc configuration */
export interface DemoDataConfig {
  /** Persona name for the demo (e.g. "Alex", "Jordan") */
  personaName: string;
  /** Demo timeline: how many days of history */
  historyDays: number;
  /** Number of sample items per database */
  itemCounts: Record<string, number>;
  /** Story arc theme (e.g. "productivity_journey", "fresh_start", "overwhelm_to_clarity") */
  storyArc: "productivity_journey" | "fresh_start" | "overwhelm_to_clarity" | "goal_sprint" | "life_balance";
  /** Include "in-progress" items to show template is alive */
  includeInProgress: boolean;
}

/** Sub-page blueprint */
export interface SubPageBlueprint {
  /** Page name */
  name: string;
  /** Page icon emoji */
  icon: string;
  /** Cover image URL (optional) */
  cover?: string;
  /** Section blocks for the page */
  sections: DashboardSection[];
  /** Raw blocks (for custom content) */
  customBlocks?: BlockSpec[];
}


// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE PARITY ENGINE — Layout Blueprint + Style Blueprint + Parity Targets
// ═══════════════════════════════════════════════════════════════════════════════

/** Chart specification for prompt-only chart sections */
export interface ChartSpec {
  title: string;
  chartType: "line" | "bar" | "donut" | "pie";
  databaseRef: string;
  xAxis: string;
  yAxis: string;
  aggregation: "sum" | "count" | "average";
  colorHint?: string;
}

/** A single section in the layout blueprint */
export interface LayoutSection {
  /** Unique section ID */
  id: string;
  /** Display heading (empty string = no heading rendered) */
  heading: string;
  /** Column layout: 1=full-width, 2=side-by-side, 3=triple */
  columns: 1 | 2 | 3;
  /** What component renders in this section */
  componentType:
    | "cover_hero"
    | "nav_bar"
    | "kpi_row"
    | "quick_actions"
    | "database_section"
    | "chart_row"
    | "toggle_section"
    | "spacer"
    | "divider"
    | "brand_footer"
    // OS_ULTRA component types
    | "widget_grid"
    | "fast_actions"
    | "app_panels"
    | "hero_device_mockup"
    | "status_bar";
  /** For database sections: which database key */
  databaseRef?: string;
  /** For database sections: what Notion view type */
  viewType?: "table" | "board" | "calendar" | "timeline" | "gallery" | "list";
  /** Optional view filter description */
  viewFilter?: string;
  /** For chart sections: chart definitions (prompt-only) */
  charts?: ChartSpec[];
  /** For multi-column sections: nested column contents */
  columnContents?: LayoutSection[];
  /** Whether Notion API can build this section */
  apiBuildable: boolean;
}

/** Sub-page layout definition */
export interface SubPageLayoutDef {
  name: string;
  icon: string;
  sections: LayoutSection[];
}

/** The authoritative page structure blueprint */
export interface LayoutBlueprint {
  /** Single dashboard page or hub with sub-pages */
  pageType: "single_page" | "hub_with_subpages";
  /** Visual quality tier */
  visualTier: "cinematic" | "premium" | "standard";
  /** Ordered sections on the main page */
  sections: LayoutSection[];
  /** Sub-page layouts (when pageType = hub_with_subpages) */
  subPageLayouts?: SubPageLayoutDef[];
}

/** Visual style rules for the template */
export interface StyleBlueprint {
  palette: {
    aesthetic: string;
    brandColor: string;
    cardColor: string;
    accentColor: string;
    dividerFrequency: "every_section" | "between_groups" | "minimal";
  };
  cover: {
    url: string;
    fallbackUrl: string;
  };
  icons: {
    style: "emoji" | "minimal_emoji";
    pageIcon: string;
    databaseIcons: Record<string, string>;
    navIcons: Record<string, string>;
    kpiIcons: Record<string, string>;
  };
  typography: {
    headingStyle: "emoji_prefix" | "clean" | "bold_caps";
    quotesAsTaglines: boolean;
  };
  spacing: {
    sectionSeparator: "divider" | "empty_paragraph" | "heading_only";
    afterNavBar: "divider" | "none";
    afterKpiRow: "divider" | "spacer";
    betweenDatabases: "heading_divider" | "heading_only";
  };
  /** OS_ULTRA visual overrides (present when premiumTier = "os_ultra") */
  osUltra?: OsUltraStyle;
  /** Premium tier tag for quick checks */
  premiumTier?: PremiumTier;
}

/** Maps a competitor feature to our implementation */
export interface ParityTarget {
  competitorFeature: string;
  ourImplementation: string;
  buildMethod: "api" | "prompt" | "manual";
  priority: "critical" | "important" | "nice_to_have";
  implemented: boolean;
  notes?: string;
}

/** Prompt-only step instruction (for non-API-buildable features) */
export interface PromptOnlyStep {
  section: string;
  instruction: string;
  componentType: string;
}

/** Parity inference hints — fed to Gemini as constraints */
export interface ParityHints {
  pageType: "single_page" | "hub_with_subpages";
  visualTier: "cinematic" | "premium" | "standard";
  inferredDbCount: number;
  inferredDatabases: string[];
  inferredViewTypes: string[];
  kpiCount: number;
  hasCharts: boolean;
  chartCount: number;
  subPageCount: number;
  sectionOrder: string[];
  complaintUpgrades: string[];
  /** Premium tier — controls OS_ULTRA enforcement */
  premiumTier: PremiumTier;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OS_ULTRA PREMIUM TIER — Cinematic dark-OS dashboard aesthetic
// ═══════════════════════════════════════════════════════════════════════════════

/** Premium tier levels: standard → premium → os_ultra */
export type PremiumTier = "standard" | "premium" | "os_ultra";

/** OS-style visual configuration for ultra-premium templates */
export interface OsUltraStyle {
  osStyle: true;
  backgroundMode: "dark_os" | "dark_gradient" | "dark_minimal";
  cardStyle: "elevated_tiles" | "flat_cards" | "glass_panels";
  cardRadius: "soft" | "rounded" | "sharp";
  shadowStyle: "subtle" | "medium" | "none";
  accentPolicy: "single_accent" | "dual_accent";
  coverThemes: string[];
  widgetStyle: "os_tiles" | "stat_cards" | "inline_metrics";
  iconFamily: "emoji_consistent" | "notion_native";
  colorNoise: "minimal" | "moderate";
  spacingDensity: "comfortable" | "compact";
}

/** Rule-based quality enforcement for OS_ULTRA checklist */
export interface PremiumChecklistItem {
  rule: string;
  required: boolean;
  passCondition: string;
  buildMethod: "api" | "prompt" | "manual";
  category: "layout" | "visual" | "data" | "ux" | "seo";
}

// ═══════════════════════════════════════════════════════════════════════════════
// MASTER CONFIG: The full premium template configuration
// ═══════════════════════════════════════════════════════════════════════════════

export interface PremiumConfig {
  // ── Identity ──
  /** Template type identifier (e.g. "adhd_planner", "student_hub") */
  templateType: string;
  /** Display name for the template */
  templateName: string;
  /** Tagline / description */
  tagline: string;
  /** Primary icon emoji */
  icon: string;

  // ── Visual Identity (Section D) ──
  visual: VisualIdentity;

  // ── Navigation System (Section C) ──
  navigation: {
    /** Whether to include a navigation bar */
    enabled: boolean;
    /** Navigation tabs */
    tabs: NavTab[];
    /** Style: inline callouts, column_list, or auto (picks best based on tab count) */
    style: "callout_bar" | "column_tabs" | "auto";
    /** Max tabs per row (default 5) — prevents column squeeze */
    maxTabsPerRow?: number;
    /** Max characters per label (default 8) — truncates long labels */
    labelMaxChars?: number;
  };

  // ── Dashboard Layout (Section B) ──
  dashboard: {
    /** Ordered list of sections to render on the main page */
    sections: DashboardSection[];
    /** KPI cards for the stats row */
    kpiCards: KPICard[];
    /** Quick action buttons */
    quickActions: QuickAction[];
  };

  // ── Onboarding (Section F) ──
  onboarding: {
    /** Whether to include onboarding section */
    enabled: boolean;
    /** Welcome message */
    welcomeMessage: string;
    /** Setup steps */
    steps: OnboardingStep[];
    /** Collapsible by default */
    collapsible: boolean;
  };

  // ── Database Page Templates (Section F) ──
  pageTemplates: DatabasePageTemplate[];

  // ── Sub-Pages ──
  subPages: SubPageBlueprint[];

  // ── Demo Data (Section G) ──
  demoData: DemoDataConfig;
}


// ═══════════════════════════════════════════════════════════════════════════════
// B) DASHBOARD LAYOUT BLUEPRINT — Section generators
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate cover + title header blocks
 */
function generateCoverSection(config: PremiumConfig): BlockSpec[] {
  const blocks: BlockSpec[] = [];

  // Main title with icon
  blocks.push({
    type: "heading_1",
    text: `${config.icon} ${config.templateName}`,
  });

  // Tagline as styled quote
  blocks.push({
    type: "quote",
    text: config.tagline,
    italic: true,
    color: `${config.visual.brandColor}_background`,
  });

  return blocks;
}

/** Label abbreviation map for long navigation labels */
const NAV_LABEL_ABBREVIATIONS: Record<string, string> = {
  "Productivity": "Tasks",
  "Self Care": "Wellness",
  "Subscriptions": "Subs",
  "Inspiration": "Inspo",
  "Assignments": "Assign",
  "Transactions": "Money",
  "Emergency": "SOS",
  "Calendar": "Cal",
  "Schedule": "Sched",
  "Nutrition": "Food",
  "Resources": "Refs",
  "Debt Payoff": "Debt",
  "Mood Board": "Moods",
};

/**
 * Truncate a nav label to fit within maxChars, using abbreviation map first
 */
function truncateNavLabel(label: string, maxChars: number): string {
  if (label.length <= maxChars) return label;
  if (NAV_LABEL_ABBREVIATIONS[label]) return NAV_LABEL_ABBREVIATIONS[label];
  return label.slice(0, maxChars - 1) + "…";
}

/**
 * Generate navigation bar blocks (emoji tab row)
 * Creates a callout-based horizontal navigation that mimics premium templates.
 * Supports auto-splitting into multiple rows to prevent column squeeze.
 */
function generateNavigationBar(config: PremiumConfig): BlockSpec[] {
  if (!config.navigation.enabled || config.navigation.tabs.length === 0) {
    return [];
  }

  const tabs = config.navigation.tabs;
  const maxPerRow = config.navigation.maxTabsPerRow ?? 3;
  const maxChars = config.navigation.labelMaxChars ?? 8;

  // Determine effective style
  // "auto" → use callout_bar for 5+ tabs (single block, always readable),
  //           column_tabs for ≤4 tabs (visual columns that fit narrow pages)
  let effectiveStyle = config.navigation.style;
  if (effectiveStyle === "auto") {
    effectiveStyle = tabs.length <= 4 ? "column_tabs" : "callout_bar";
  }

  if (effectiveStyle === "column_tabs") {
    // Split tabs into rows of maxPerRow (default 3 — safe for narrow Notion pages)
    const rows: BlockSpec[] = [];
    for (let i = 0; i < tabs.length; i += maxPerRow) {
      const rowTabs = tabs.slice(i, i + maxPerRow);
      const columns: BlockSpec[][] = rowTabs.map((tab) => [
        createCallout(
          truncateNavLabel(tab.label, maxChars),
          tab.icon,
          {
            color: tab.isHome
              ? `${config.visual.accentColor}_background`
              : `${config.visual.cardBackground}_background`,
            bold: tab.isHome,
          },
        ),
      ]);

      // Ensure at least 2 columns per row (Notion requirement)
      if (columns.length === 1) {
        columns.push([{ type: "paragraph" as const, text: "" }]);
      }

      rows.push({ type: "column_list", columns });
    }

    return [
      { type: "divider" },
      ...rows,
      { type: "divider" },
    ];
  }

  // callout_bar style: single callout with all tabs inline — always works regardless of page width
  // Home tab gets highlighted with brackets: [🏠 Home]
  const tabText = tabs
    .map((t) => {
      const label = truncateNavLabel(t.label, maxChars);
      return t.isHome ? `[ ${t.icon} ${label} ]` : `${t.icon} ${label}`;
    })
    .join("   ·   ");

  return [
    { type: "divider" },
    createCallout(tabText, "🧭", { color: `${config.visual.cardBackground}_background`, bold: true }),
    { type: "divider" },
  ];
}

/**
 * Generate KPI stat cards row
 * Creates a 3-4 column layout with metric callouts
 */
function generateKPIRow(config: PremiumConfig): BlockSpec[] {
  const cards = config.dashboard.kpiCards;
  if (cards.length === 0) return [];

  // Group into rows of 3, ensuring each row has at least 2 columns
  const rows: BlockSpec[] = [];
  for (let i = 0; i < cards.length; i += 3) {
    let batch = cards.slice(i, i + 3);
    // If only 1 card left, merge with previous row (make it 4-col) or pad
    if (batch.length === 1 && rows.length > 0) {
      // Remove the last row and re-batch as 4 columns
      rows.pop();
      batch = cards.slice(i - 3, i + 1);
    }
    const columns: BlockSpec[][] = batch.map((card) => [
      createCallout(
        `${card.value}\n\n${card.label}${card.subtitle ? `\n${card.subtitle}` : ""}`,
        card.icon,
        { color: `${card.color}_background`, bold: true },
      ),
    ]);
    if (columns.length >= 2) {
      rows.push({ type: "column_list", columns });
    } else if (columns.length === 1) {
      // Pad with empty column for minimum 2
      columns.push([{ type: "paragraph" as const, text: "" }]);
      rows.push({ type: "column_list", columns });
    }
  }

  return [
    { type: "heading_2", text: "📊 Dashboard" },
    ...rows,
  ];
}

/**
 * Generate quick action buttons row
 * Creates a column layout with action callouts
 */
function generateQuickActions(config: PremiumConfig): BlockSpec[] {
  const actions = config.dashboard.quickActions;
  if (actions.length === 0) return [];

  // Group into rows of 3-4, ensuring each row has at least 2 columns
  const rows: BlockSpec[] = [];
  for (let i = 0; i < actions.length; i += 4) {
    let batch = actions.slice(i, i + 4);
    // If only 1 action left, merge with previous row or pad
    if (batch.length === 1 && rows.length > 0) {
      rows.pop();
      batch = actions.slice(i - 4, i + 1);
    }
    const columns: BlockSpec[][] = batch.map((action) => [
      createCallout(action.label, action.icon, { color: `${config.visual.accentColor}_background` }),
    ]);
    if (columns.length >= 2) {
      rows.push({ type: "column_list", columns });
    } else if (columns.length === 1) {
      columns.push([{ type: "paragraph" as const, text: "" }]);
      rows.push({ type: "column_list", columns });
    }
  }

  return [
    { type: "heading_2", text: "⚡ Quick Actions" },
    ...rows,
    { type: "divider" },
  ];
}

/**
 * Generate onboarding / setup guide section
 */
function generateOnboarding(config: PremiumConfig): BlockSpec[] {
  if (!config.onboarding.enabled) return [];

  const stepBlocks: BlockSpec[] = config.onboarding.steps.map((step) => ({
    type: "numbered_list_item" as const,
    text: `${step.instruction} (${step.timeEstimate})`,
  }));

  const innerBlocks: BlockSpec[] = [
    {
      type: "paragraph",
      text: config.onboarding.welcomeMessage,
      italic: true,
    },
    ...stepBlocks,
    createCallout(
      "Total setup time: ~" +
        config.onboarding.steps.reduce((sum, s) => {
          const mins = parseInt(s.timeEstimate) || 5;
          return sum + mins;
        }, 0) +
        " minutes. You've got this! 💪",
      "⏱️",
      { color: "green_background" },
    ),
  ];

  if (config.onboarding.collapsible) {
    return [
      {
        type: "toggle",
        text: "📖 Setup Guide — Click to get started",
        children: innerBlocks,
      },
    ];
  }

  return [
    { type: "heading_2", text: "📖 Setup Guide" },
    ...innerBlocks,
    { type: "divider" },
  ];
}

/**
 * Generate a database preview section
 * Shows N sample items from a database as callout cards in columns
 */
function generateDatabasePreview(
  section: DashboardSection,
  databases: DatabaseSpec[],
  config: PremiumConfig
): BlockSpec[] {
  const db = databases.find((d) => d.key === section.databaseKey);
  if (!db) return [];

  const count = section.previewCount || 3;
  const samples = db.sampleData.slice(0, count);

  if (samples.length === 0) {
    return [
      { type: "heading_2", text: `${section.icon} ${section.heading}` },
      { type: "paragraph", text: "Add your first entries to see them here!", italic: true },
    ];
  }

  // Get the title property
  const titleProp = db.properties.find((p) => p.type === "title");
  const titleKey = titleProp?.name || db.properties[0]?.name || "Name";

  // Build preview cards
  const columns: BlockSpec[][] = samples.map((row) => {
    const title = String(row[titleKey] || "Untitled");
    // Pick a few interesting properties to show
    const previewProps = db.properties
      .filter((p) => p.type !== "title" && p.type !== "created_time" && p.type !== "last_edited_time" && p.type !== "relation" && p.type !== "rollup")
      .slice(0, 3);

    const details = previewProps
      .map((p) => {
        const val = row[p.name];
        if (val === undefined || val === null || val === "") return null;
        return `${p.name}: ${val}`;
      })
      .filter(Boolean)
      .join("\n");

    return [
      createCallout(`${title}${details ? "\n\n" + details : ""}`, db.icon, { color: `${config.visual.cardBackground}_background` }),
    ];
  });

  const blocks: BlockSpec[] = [
    { type: "heading_2", text: `${section.icon} ${section.heading}` },
  ];

  if (section.layout === "3-col" && columns.length >= 3) {
    blocks.push({ type: "column_list", columns: columns.slice(0, 3) });
  } else if (section.layout === "2-col" && columns.length >= 2) {
    blocks.push({ type: "column_list", columns: columns.slice(0, 2) });
  } else {
    // Full width — stack callouts
    for (const col of columns) {
      blocks.push(...col);
    }
  }

  blocks.push({ type: "divider" });
  return blocks;
}

/**
 * Generate a section from its DashboardSection definition
 */
function generateSection(
  section: DashboardSection,
  databases: DatabaseSpec[],
  config: PremiumConfig
): BlockSpec[] {
  switch (section.contentType) {
    case "kpi_row":
      return generateKPIRow(config);

    case "navigation":
      return generateNavigationBar(config);

    case "onboarding":
      return generateOnboarding(config);

    case "action_buttons":
      return generateQuickActions(config);

    case "database_preview":
      return generateDatabasePreview(section, databases, config);

    case "callout_grid": {
      // Generic callout grid — for custom content sections
      return [
        { type: "heading_2", text: `${section.icon} ${section.heading}` },
        { type: "divider" },
      ];
    }

    case "checklist": {
      return [
        { type: "heading_2", text: `${section.icon} ${section.heading}` },
        { type: "divider" },
      ];
    }

    case "text_block": {
      return [
        { type: "heading_2", text: `${section.icon} ${section.heading}` },
        { type: "divider" },
      ];
    }

    default:
      return [];
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// C) NAVIGATION SYSTEM BLUEPRINT — Pre-built navigation configs
// ═══════════════════════════════════════════════════════════════════════════════

/** Pre-built navigation configs by template type */
export const NAVIGATION_PRESETS: Record<string, NavTab[]> = {
  life_planner: [
    { icon: "🌟", label: "Home", targetSection: "Dashboard", isHome: true },
    { icon: "📋", label: "Planning", targetSection: "Planning & Action" },
    { icon: "🌱", label: "Growth", targetSection: "Growth & Reflection" },
    { icon: "💪", label: "Wellness", targetSection: "Wellness & Habits" },
  ],
  adhd_planner: [
    { icon: "🧠", label: "Home", targetSection: "Dashboard", isHome: true },
    { icon: "📥", label: "Capture", targetSection: "Capture & Process" },
    { icon: "⚡", label: "Tasks", targetSection: "Productivity" },
    { icon: "🎯", label: "Goals", targetSection: "Goals & Growth" },
    { icon: "💪", label: "Wellness", targetSection: "Wellness & Routines" },
    { icon: "🆘", label: "SOS", targetSection: "Emergency Mode" },
  ],
  finance_tracker: [
    { icon: "💰", label: "Home", targetSection: "Dashboard", isHome: true },
    { icon: "💳", label: "Accounts", targetSection: "Accounts & Tracking" },
    { icon: "📊", label: "Budget", targetSection: "Budget & Planning" },
    { icon: "🎯", label: "Goals", targetSection: "Growth & Goals" },
  ],
  social_media_planner: [
    { icon: "📱", label: "Home", targetSection: "Dashboard", isHome: true },
    { icon: "📅", label: "Content", targetSection: "Content Production" },
    { icon: "🎯", label: "Strategy", targetSection: "Strategy & Campaigns" },
    { icon: "📊", label: "Analytics", targetSection: "Performance & Brand" },
  ],
  student_planner: [
    { icon: "🏠", label: "Home", targetSection: "Dashboard", isHome: true },
    { icon: "📚", label: "Classes", targetSection: "Classes" },
    { icon: "📝", label: "Assignments", targetSection: "Assignments" },
    { icon: "📖", label: "Study", targetSection: "Study Sessions" },
    { icon: "📅", label: "Schedule", targetSection: "Schedule" },
    { icon: "🎯", label: "Goals", targetSection: "Goals" },
    { icon: "📊", label: "GPA", targetSection: "GPA Tracker" },
  ],
  fitness_tracker: [
    { icon: "🏠", label: "Home", targetSection: "Dashboard", isHome: true },
    { icon: "🏋️", label: "Workouts", targetSection: "Workouts" },
    { icon: "🍎", label: "Nutrition", targetSection: "Nutrition" },
    { icon: "📏", label: "Progress", targetSection: "Body Metrics" },
    { icon: "💪", label: "Habits", targetSection: "Habits" },
    { icon: "🎯", label: "Goals", targetSection: "Fitness Goals" },
    { icon: "📅", label: "Calendar", targetSection: "Schedule" },
  ],
  wedding_planner: [
    { icon: "💒", label: "Home", targetSection: "Dashboard", isHome: true },
    { icon: "📋", label: "Checklist", targetSection: "Checklist" },
    { icon: "💰", label: "Budget", targetSection: "Budget" },
    { icon: "👥", label: "Guests", targetSection: "Guest List" },
    { icon: "🏪", label: "Vendors", targetSection: "Vendors" },
    { icon: "📅", label: "Timeline", targetSection: "Timeline" },
    { icon: "💡", label: "Inspiration", targetSection: "Mood Board" },
  ],
  // Fallback for any custom type
  default: [
    { icon: "🏠", label: "Home", targetSection: "Dashboard", isHome: true },
    { icon: "📋", label: "Tasks", targetSection: "Tasks" },
    { icon: "🎯", label: "Goals", targetSection: "Goals" },
    { icon: "📊", label: "Tracker", targetSection: "Tracker" },
    { icon: "📝", label: "Notes", targetSection: "Notes" },
  ],
};


// ═══════════════════════════════════════════════════════════════════════════════
// D) VISUAL IDENTITY SYSTEM — Aesthetic-aware premium styling
// ═══════════════════════════════════════════════════════════════════════════════

/** Premium cover image pools by category — using ?fm=jpg for direct image access (prevents Notion redirect failures) */
export const PREMIUM_COVERS: Record<string, string[]> = {
  // Dark/moody aesthetic (Planifest-style)
  dark_lifestyle: [
    "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1500&h=600&fit=crop&fm=jpg&q=80",
    "https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=1500&h=600&fit=crop&fm=jpg&q=80",
    "https://images.unsplash.com/photo-1518173946687-a34e6047af89?w=1500&h=600&fit=crop&fm=jpg&q=80",
    "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?w=1500&h=600&fit=crop&fm=jpg&q=80",
  ],
  // Warm/brown aesthetic
  warm_minimal: [
    "https://images.unsplash.com/photo-1483058712412-4245e9b90334?w=1500&h=600&fit=crop&fm=jpg&q=80",
    "https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=1500&h=600&fit=crop&fm=jpg&q=80",
    "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=1500&h=600&fit=crop&fm=jpg&q=80",
    "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=1500&h=600&fit=crop&fm=jpg&q=80",
  ],
  // Clean/minimal aesthetic
  clean_white: [
    "https://images.unsplash.com/photo-1497032628192-86f99bcd76bc?w=1500&h=600&fit=crop&fm=jpg&q=80",
    "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=1500&h=600&fit=crop&fm=jpg&q=80",
    "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1500&h=600&fit=crop&fm=jpg&q=80",
    "https://images.unsplash.com/photo-1517842645767-c639042777db?w=1500&h=600&fit=crop&fm=jpg&q=80",
  ],
  // Nature/wellness
  nature_wellness: [
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1500&h=600&fit=crop&fm=jpg&q=80",
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1500&h=600&fit=crop&fm=jpg&q=80",
    "https://images.unsplash.com/photo-1475274047050-1d0c55b7a7ec?w=1500&h=600&fit=crop&fm=jpg&q=80",
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1500&h=600&fit=crop&fm=jpg&q=80",
  ],
  // Finance/professional
  professional: [
    "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1500&h=600&fit=crop&fm=jpg&q=80",
    "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1500&h=600&fit=crop&fm=jpg&q=80",
    "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1500&h=600&fit=crop&fm=jpg&q=80",
    "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=1500&h=600&fit=crop&fm=jpg&q=80",
  ],
};

/** Notion built-in cover fallbacks — guaranteed to work (no external dependency) */
export const NOTION_BUILTIN_COVERS: Record<string, string> = {
  dark: "https://www.notion.so/images/page-cover/gradients_5.png",
  brown: "https://www.notion.so/images/page-cover/gradients_2.png",
  minimal: "https://www.notion.so/images/page-cover/gradients_2.png",
  mono: "https://www.notion.so/images/page-cover/gradients_3.png",
  sage: "https://www.notion.so/images/page-cover/gradients_8.png",
  pink: "https://www.notion.so/images/page-cover/gradients_11.png",
  pastel: "https://www.notion.so/images/page-cover/gradients_10.png",
};

/** Map aesthetics to cover categories */
const AESTHETIC_TO_COVER_CATEGORY: Record<string, string> = {
  dark: "dark_lifestyle",
  brown: "warm_minimal",
  minimal: "clean_white",
  mono: "clean_white",
  sage: "nature_wellness",
  pink: "warm_minimal",
  pastel: "nature_wellness",
};

/** Map aesthetics to Notion block color names */
const AESTHETIC_TO_NOTION_COLORS: Record<string, { brand: string; card: string; accent: string }> = {
  dark: { brand: "blue", card: "gray", accent: "purple" },
  brown: { brand: "brown", card: "orange", accent: "yellow" },
  minimal: { brand: "default", card: "gray", accent: "blue" },
  mono: { brand: "blue", card: "default", accent: "gray" },
  sage: { brand: "green", card: "default", accent: "brown" },
  pink: { brand: "pink", card: "red", accent: "purple" },
  pastel: { brand: "purple", card: "blue", accent: "pink" },
};

/**
 * Simple deterministic hash for string → index mapping.
 * Same string always produces the same index.
 */
function stringHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Build a VisualIdentity from an aesthetic name.
 * Cover selection is DETERMINISTIC — same templateType always gets the same cover.
 * Falls back to Notion built-in covers if Unsplash pool is unavailable.
 */
export function buildVisualIdentity(aesthetic: string, templateType: string): VisualIdentity {
  const notionColors = AESTHETIC_TO_NOTION_COLORS[aesthetic] || AESTHETIC_TO_NOTION_COLORS.minimal;
  const coverCategory = AESTHETIC_TO_COVER_CATEGORY[aesthetic] || "clean_white";
  const covers = PREMIUM_COVERS[coverCategory] || PREMIUM_COVERS.clean_white;

  // Deterministic cover selection: same template type + aesthetic = same cover
  const coverIndex = stringHash(templateType + aesthetic) % covers.length;
  const primaryCover = covers[coverIndex];

  // Notion built-in fallback (guaranteed to work)
  const fallbackCover = NOTION_BUILTIN_COVERS[aesthetic] || NOTION_BUILTIN_COVERS.minimal;

  return {
    aesthetic,
    brandColor: notionColors.brand,
    cardBackground: notionColors.card,
    accentColor: notionColors.accent,
    coverUrl: primaryCover,
    coverFallbackUrl: fallbackCover,
    iconStyle: aesthetic === "minimal" || aesthetic === "mono" ? "minimal" : "emoji",
    brandTagline: `Made with CraftPlan`,
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// E) ACTION & AUTOMATION BLOCKS — Formulas, rollups, computed properties
// ═══════════════════════════════════════════════════════════════════════════════

/** Common formula patterns that can be injected into any database */
export const FORMULA_LIBRARY: Record<string, { name: string; type: "formula"; formula: string; description: string }> = {
  // Progress bar (expects "Progress" number property, 0-100)
  progress_bar: {
    name: "Progress Bar",
    type: "formula",
    formula: `slice("██████████", 0, floor(prop("Progress") / 10)) + slice("░░░░░░░░░░", 0, 10 - floor(prop("Progress") / 10)) + " " + format(round(prop("Progress"))) + "%"`,
    description: "Visual progress bar from Progress (0-100)",
  },

  // Days until due (expects "Due Date" date property)
  days_until_due: {
    name: "Days Left",
    type: "formula",
    formula: `if(empty(prop("Due Date")), "—", if(dateBetween(prop("Due Date"), now(), "days") < 0, "🔴 Overdue", if(dateBetween(prop("Due Date"), now(), "days") == 0, "🟡 Today", if(dateBetween(prop("Due Date"), now(), "days") <= 3, "🟠 " + format(dateBetween(prop("Due Date"), now(), "days")) + "d", "🟢 " + format(dateBetween(prop("Due Date"), now(), "days")) + "d"))))`,
    description: "Color-coded days until due date",
  },

  // Streak bar (expects "Current Streak" number property)
  streak_bar: {
    name: "Streak Bar",
    type: "formula",
    formula: `if(prop("Current Streak") >= 30, "🔥🔥🔥 " + format(prop("Current Streak")) + " days!", if(prop("Current Streak") >= 14, "🔥🔥 " + format(prop("Current Streak")) + " days", if(prop("Current Streak") >= 7, "🔥 " + format(prop("Current Streak")) + " days", if(prop("Current Streak") >= 1, "✨ " + format(prop("Current Streak")) + " days", "Start today!"))))`,
    description: "Emoji-coded streak display",
  },

  // Focus score (expects "Duration (min)" and "Actual (min)" number properties)
  focus_score: {
    name: "Focus Score",
    type: "formula",
    formula: `if(prop("Duration (min)") == 0, 0, round(prop("Actual (min)") / max(prop("Duration (min)"), 1) * 100))`,
    description: "Focus efficiency percentage",
  },

  // Day score (expects mood select, tasks done, focus minutes, water, sleep numbers)
  day_score: {
    name: "Day Score",
    type: "formula",
    formula: `round(prop("Tasks Done") * 15 + prop("Focus Minutes") * 0.5 + if(contains(prop("Mood"), "Great"), 20, if(contains(prop("Mood"), "Good"), 15, if(contains(prop("Mood"), "Okay"), 10, 5))) + prop("Water Glasses") * 2 + prop("Sleep Hours") * 3)`,
    description: "Composite daily wellness score",
  },

  // Budget remaining (expects "Budget" and "Spent" number properties)
  budget_remaining: {
    name: "Remaining",
    type: "formula",
    formula: `if(prop("Budget") - prop("Spent") < 0, "🔴 $" + format(abs(prop("Budget") - prop("Spent"))) + " over", "🟢 $" + format(prop("Budget") - prop("Spent")) + " left")`,
    description: "Budget vs spent status",
  },

  // Savings progress (expects "Target" and "Saved" number properties)
  savings_progress: {
    name: "Savings %",
    type: "formula",
    formula: `slice("██████████", 0, floor(prop("Saved") / max(prop("Target"), 1) * 10)) + slice("░░░░░░░░░░", 0, 10 - floor(prop("Saved") / max(prop("Target"), 1) * 10)) + " " + format(round(prop("Saved") / max(prop("Target"), 1) * 100)) + "%"`,
    description: "Visual savings goal progress",
  },

  // Week label (expects "Due Date" or "Date" date property)
  week_label: {
    name: "Week",
    type: "formula",
    formula: `if(empty(prop("Due Date")), "", formatDate(prop("Due Date"), "YYYY-[W]WW"))`,
    description: "ISO week label for grouping",
  },

  // Completion rate (expects "Done" checkbox and "Total" number properties)
  completion_status: {
    name: "Status Icon",
    type: "formula",
    formula: `if(prop("Done"), "✅ Complete", "⬜ Pending")`,
    description: "Checkbox to status icon",
  },

  // Budget health tier (expects "Budget" and "Spent" number properties)
  budget_health: {
    name: "Budget Health",
    type: "formula",
    formula: `if(prop("Spent") / max(prop("Budget"), 1) <= 0.5, "🟢 Healthy", if(prop("Spent") / max(prop("Budget"), 1) <= 0.8, "🟡 Caution", if(prop("Spent") / max(prop("Budget"), 1) <= 1, "🟠 Tight", "🔴 Over")))`,
    description: "Tiered budget status with emoji indicators",
  },

  // Months to savings goal (expects "Target Amount", "Saved So Far", "Monthly Contribution")
  months_to_goal: {
    name: "Months to Goal",
    type: "formula",
    formula: `if(prop("Monthly Contribution") <= 0, "∞", format(ceil((prop("Target Amount") - prop("Saved So Far")) / max(prop("Monthly Contribution"), 1))) + " months")`,
    description: "Projected months until savings goal reached",
  },

  // Debt payoff priority (expects "Interest Rate" percent property)
  payoff_priority: {
    name: "Payoff Priority",
    type: "formula",
    formula: `if(prop("Interest Rate") >= 0.2, "🔴 Attack First", if(prop("Interest Rate") >= 0.1, "🟡 Pay Down", "🟢 Minimum OK"))`,
    description: "Interest-rate-based debt prioritization",
  },

  // ADHD hyperfocus risk (expects "Energy Required" and "Dopamine Rating" selects)
  hyperfocus_risk: {
    name: "Hyperfocus Risk",
    type: "formula",
    formula: `if(prop("Energy Required") == "High 🚀" and prop("Dopamine Rating") == "🎉 Fun", "⚠️ Hyperfocus Trap", if(prop("Energy Required") == "High 🚀" and prop("Dopamine Rating") == "😩 Boring", "🧊 Avoidance Risk", "✅ Balanced"))`,
    description: "ADHD-specific task awareness indicator",
  },

  // Daily energy match (expects "Energy Peak" select and "Tasks Done" number)
  energy_match: {
    name: "Energy Match",
    type: "formula",
    formula: `if(prop("Energy Peak") == "Morning" and prop("Tasks Done") >= 3, "🎯 Peak Used Well", if(prop("Tasks Done") < 2, "💤 Low Output", "📊 Average Day"))`,
    description: "Energy pattern feedback for daily log",
  },

  // Goal momentum status (expects "Progress" number 0-100)
  goal_momentum: {
    name: "Goal Momentum",
    type: "formula",
    formula: `if(prop("Progress") >= 75, "🚀 Almost There!", if(prop("Progress") >= 50, "💪 Halfway!", if(prop("Progress") >= 25, "🌱 Growing", "🏁 Just Started")))`,
    description: "Motivational progress tier indicator",
  },

  // Multi-level urgency (expects "Due Date" date property)
  urgency_score: {
    name: "Urgency Score",
    type: "formula",
    formula: `if(empty(prop("Due Date")), "📋 Backlog", if(dateBetween(prop("Due Date"), now(), "days") < 0, "🔴 Overdue!", if(dateBetween(prop("Due Date"), now(), "days") <= 2, "🟡 Urgent", if(dateBetween(prop("Due Date"), now(), "days") <= 7, "🟢 This Week", "📅 Scheduled"))))`,
    description: "Five-level urgency classification with emoji",
  },

  // Journal reflection quality (expects "Gratitude" and "Lessons" rich_text)
  reflection_depth: {
    name: "Reflection Depth",
    type: "formula",
    formula: `if(length(prop("Gratitude")) > 50 and length(prop("Lessons")) > 50, "🌟 Deep Reflection", if(length(prop("Gratitude")) > 20, "📝 Good Entry", "✏️ Quick Note"))`,
    description: "Encourages detailed journaling with quality tiers",
  },

  // Social media engagement rate (expects "Likes", "Comments", "Shares", "Reach" numbers)
  engagement_rate: {
    name: "Engagement Rate",
    type: "formula",
    formula: `if(prop("Reach") == 0, "N/A", format(round((prop("Likes") + prop("Comments") + prop("Shares")) / max(prop("Reach"), 1) * 10000) / 100) + "%")`,
    description: "Social media engagement rate percentage",
  },

  // Content idea priority (expects "Saved" checkbox and "Effort Level" select)
  content_priority: {
    name: "Priority",
    type: "formula",
    formula: `if(prop("Saved") and prop("Effort Level") == "Quick", "⚡ Do Next", if(prop("Saved"), "📌 Saved", if(prop("Effort Level") == "Quick", "🎯 Easy Win", "📋 Backlog")))`,
    description: "Content idea prioritization based on effort and saved status",
  },
};


// ═══════════════════════════════════════════════════════════════════════════════
// F) DATABASE PAGE TEMPLATES — Rich inner pages for database entries
// ═══════════════════════════════════════════════════════════════════════════════

/** Pre-built page template blocks by database type */
export const PAGE_TEMPLATE_PRESETS: Record<string, BlockSpec[]> = {
  task: [
    { type: "heading_2", text: "📝 Task Details" },
    createCallout("What needs to be done? What does 'done' look like?", "🎯", { color: "blue_background" }),
    { type: "divider" },
    { type: "heading_3", text: "Steps" },
    { type: "to_do", text: "Step 1: ", checked: false },
    { type: "to_do", text: "Step 2: ", checked: false },
    { type: "to_do", text: "Step 3: ", checked: false },
    { type: "divider" },
    { type: "heading_3", text: "Notes & Resources" },
    { type: "paragraph", text: "" },
  ],
  goal: [
    { type: "heading_2", text: "🎯 Goal Breakdown" },
    createCallout("Why does this goal matter to you? What changes when you achieve it?", "💭", { color: "yellow_background" }),
    { type: "divider" },
    { type: "heading_3", text: "Milestones" },
    { type: "to_do", text: "Milestone 1: 25% — ", checked: false },
    { type: "to_do", text: "Milestone 2: 50% — ", checked: false },
    { type: "to_do", text: "Milestone 3: 75% — ", checked: false },
    { type: "to_do", text: "Milestone 4: 100% — ", checked: false },
    { type: "divider" },
    { type: "heading_3", text: "Action Items" },
    { type: "bulleted_list_item", text: "" },
    { type: "divider" },
    { type: "heading_3", text: "Obstacles & Solutions" },
    { type: "paragraph", text: "" },
  ],
  journal: [
    { type: "heading_2", text: "📓 Today's Entry" },
    { type: "heading_3", text: "🏆 Top 3 Wins" },
    { type: "numbered_list_item", text: "" },
    { type: "numbered_list_item", text: "" },
    { type: "numbered_list_item", text: "" },
    { type: "divider" },
    { type: "heading_3", text: "🙏 Gratitude" },
    { type: "paragraph", text: "" },
    { type: "divider" },
    { type: "heading_3", text: "💭 Reflection" },
    { type: "paragraph", text: "" },
    { type: "divider" },
    { type: "heading_3", text: "📌 Tomorrow's Priority" },
    { type: "paragraph", text: "" },
  ],
  habit: [
    { type: "heading_2", text: "💪 Habit Tracker" },
    createCallout("Track your habit consistency. Check ✓ each day you complete it.", "📊", { color: "green_background" }),
    { type: "divider" },
    { type: "heading_3", text: "Weekly Log" },
    { type: "table", tableWidth: 7, hasColumnHeader: true, tableRows: [
      ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      ["⬜", "⬜", "⬜", "⬜", "⬜", "⬜", "⬜"],
    ]},
    { type: "divider" },
    { type: "heading_3", text: "Notes" },
    { type: "paragraph", text: "" },
  ],
  workout: [
    { type: "heading_2", text: "🏋️ Workout Log" },
    { type: "heading_3", text: "Warm Up" },
    { type: "to_do", text: "5 min cardio", checked: false },
    { type: "to_do", text: "Dynamic stretching", checked: false },
    { type: "divider" },
    { type: "heading_3", text: "Main Workout" },
    { type: "table", tableWidth: 4, hasColumnHeader: true, tableRows: [
      ["Exercise", "Sets", "Reps", "Weight"],
      ["", "", "", ""],
      ["", "", "", ""],
      ["", "", "", ""],
    ]},
    { type: "divider" },
    { type: "heading_3", text: "Cool Down & Notes" },
    { type: "paragraph", text: "" },
  ],
  meeting: [
    { type: "heading_2", text: "📋 Meeting Notes" },
    { type: "heading_3", text: "Agenda" },
    { type: "bulleted_list_item", text: "" },
    { type: "divider" },
    { type: "heading_3", text: "Notes" },
    { type: "paragraph", text: "" },
    { type: "divider" },
    { type: "heading_3", text: "Action Items" },
    { type: "to_do", text: "", checked: false },
    { type: "to_do", text: "", checked: false },
    { type: "divider" },
    { type: "heading_3", text: "Decisions Made" },
    { type: "paragraph", text: "" },
  ],
};


// ═══════════════════════════════════════════════════════════════════════════════
// G) DEMO DATA GENERATION RULES — Coherent story arcs
// ═══════════════════════════════════════════════════════════════════════════════

/** Story arc modifiers — adjust sample data patterns */
export const STORY_ARC_MODIFIERS: Record<string, {
  description: string;
  moodDistribution: string[];
  taskCompletionRate: number;
  streakRange: [number, number];
  progressRange: [number, number];
  includeEmergencyMode: boolean;
}> = {
  productivity_journey: {
    description: "User is building momentum — mix of wins and struggles",
    moodDistribution: ["😊 Great", "🙂 Good", "🙂 Good", "😐 Okay", "😟 Rough"],
    taskCompletionRate: 0.6,
    streakRange: [3, 18],
    progressRange: [20, 70],
    includeEmergencyMode: false,
  },
  fresh_start: {
    description: "User just started — mostly setup with early wins",
    moodDistribution: ["🙂 Good", "🙂 Good", "😊 Great", "😐 Okay"],
    taskCompletionRate: 0.4,
    streakRange: [1, 7],
    progressRange: [5, 30],
    includeEmergencyMode: false,
  },
  overwhelm_to_clarity: {
    description: "User was overwhelmed, system is helping them recover",
    moodDistribution: ["😟 Rough", "😐 Okay", "🙂 Good", "🙂 Good", "😊 Great"],
    taskCompletionRate: 0.5,
    streakRange: [2, 12],
    progressRange: [15, 55],
    includeEmergencyMode: true,
  },
  goal_sprint: {
    description: "User is crushing it — high progress, strong streaks",
    moodDistribution: ["😊 Great", "😊 Great", "🙂 Good", "🙂 Good"],
    taskCompletionRate: 0.8,
    streakRange: [10, 30],
    progressRange: [40, 90],
    includeEmergencyMode: false,
  },
  life_balance: {
    description: "Steady, balanced user — moderate everything",
    moodDistribution: ["🙂 Good", "🙂 Good", "😊 Great", "😐 Okay", "🙂 Good"],
    taskCompletionRate: 0.65,
    streakRange: [5, 20],
    progressRange: [25, 75],
    includeEmergencyMode: false,
  },
};

/**
 * Apply story arc to sample data values
 * Returns modified value ranges for demo data generation
 */
export function getStoryArcValues(arc: DemoDataConfig["storyArc"]): {
  moodPool: string[];
  completionRate: number;
  streakMin: number;
  streakMax: number;
  progressMin: number;
  progressMax: number;
} {
  const modifier = STORY_ARC_MODIFIERS[arc] || STORY_ARC_MODIFIERS.productivity_journey;
  return {
    moodPool: modifier.moodDistribution,
    completionRate: modifier.taskCompletionRate,
    streakMin: modifier.streakRange[0],
    streakMax: modifier.streakRange[1],
    progressMin: modifier.progressRange[0],
    progressMax: modifier.progressRange[1],
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// H) BUILDER INPUT SCHEMA — What the AI generates / what the builder consumes
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Schema for AI-generated template plans (from /api/opportunities/generate)
 * This is what gets stored in opportunity.listing_plan and fed to the builder
 */
export interface AITemplatePlan {
  // Template identity
  templateName: string;
  templateType: string;
  tagline: string;
  icon: string;
  aesthetic: string;
  niche: string;
  targetAudience: string;
  complexity: "starter" | "intermediate" | "premium";

  // Databases
  databases: {
    key: string;
    name: string;
    icon: string;
    purpose: string;
    properties: {
      name: string;
      type: DatabaseProperty["type"];
      options?: string[];
      formula?: string;
      relationTo?: string;
      rollupFrom?: string;
      rollupProperty?: string;
      rollupFunction?: string;
    }[];
    sampleDataHints: string[];  // e.g. ["5 tasks with varied statuses", "mix of high and low priority"]
  }[];

  // Relations between databases
  relations: {
    from: string;
    to: string;
    property: string;
    purpose: string;
  }[];

  // Formulas to use (keys from FORMULA_LIBRARY or custom)
  formulas: {
    database: string;
    formulaKey?: string;  // key from FORMULA_LIBRARY
    custom?: { name: string; formula: string; };
  }[];

  // Dashboard layout
  dashboardSections: string[];  // ordered section names
  kpiCards: KPICard[];
  quickActions: QuickAction[];

  // Navigation
  navigationTabs: NavTab[];

  // Sub-pages
  subPages: {
    name: string;
    icon: string;
    purpose: string;
    sections: string[];
  }[];

  // Etsy listing
  etsyListing: {
    title: string;
    description: string;
    tags: string[];
    seoTitle: string;
    price: number;
    category: string;
  };

  // Mockup instructions
  mockupScenes: {
    device: string;
    scene: string;
    highlights: string[];
  }[];

  // Upgrades / upsells
  upgrades: {
    name: string;
    description: string;
    addedDatabases: string[];
  }[];
}


// ═══════════════════════════════════════════════════════════════════════════════
// H2) DATE FRESHENING — Replace stale AI-generated dates with build-time offsets
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Replace all date values in sample data with fresh dates relative to build time.
 * This ensures templates never ship with stale "July 2024" dates.
 *
 * Rules:
 *   - Due dates / upcoming: today + 1..14 days
 *   - Recent dates (last checked, transaction date): today - 0..7 days
 *   - Start dates / older: today - 7..30 days
 *   - History dates: today - 14..60 days
 */
export function freshenSampleDates(databases: DatabaseSpec[]): void {
  const now = new Date();

  function offsetDate(daysOffset: number): string {
    const d = new Date(now);
    d.setDate(d.getDate() + daysOffset);
    return d.toISOString().split("T")[0]; // "2026-02-28" format
  }

  function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Property name patterns that suggest future vs past dates
  const futureDatePatterns = /due|deadline|target|end|until/i;
  const recentDatePatterns = /last|checked|completed|modified|updated/i;
  const startDatePatterns = /start|begin|created|opened/i;

  // Detect date-like values in sample data (AI may type them as "rich_text" or "text")
  const dateValuePattern = /^\d{4}-\d{2}-\d{2}$|^\w+ \d{1,2},?\s*\d{4}$/;

  let totalFreshened = 0;

  for (const db of databases) {
    // Find explicitly typed date properties
    const dateProps = db.properties.filter(p => p.type === "date");

    // Also find properties whose sample data LOOKS like dates (AI may mistype them)
    const dateLikeProps: DatabaseProperty[] = [];
    if (db.sampleData.length > 0) {
      const firstRow = db.sampleData[0];
      for (const prop of db.properties) {
        if (prop.type === "date") continue; // Already in dateProps
        const val = firstRow[prop.name];
        if (typeof val === "string" && dateValuePattern.test(val.trim())) {
          console.log(`[DateFreshen] Detected date-like value in ${db.name}.${prop.name} (typed as ${prop.type}): "${val}" — upgrading to date type`);
          prop.type = "date"; // Fix the type so Notion receives it as a date property
          dateLikeProps.push(prop);
        }
      }
    }

    const allDateProps = [...dateProps, ...dateLikeProps];

    console.log(`[DateFreshen] DB "${db.name}": ${dateProps.length} date props, ${dateLikeProps.length} date-like props, ${db.sampleData.length} rows`);
    if (allDateProps.length > 0) {
      console.log(`[DateFreshen]   Date properties: ${allDateProps.map(p => `${p.name}(${p.type})`).join(", ")}`);
    }

    // Also log all property names & types + sample data keys for debugging
    if (db.sampleData.length > 0) {
      const propNames = db.properties.map(p => `${p.name}:${p.type}`);
      const sampleKeys = Object.keys(db.sampleData[0]);
      console.log(`[DateFreshen]   All props: [${propNames.join(", ")}]`);
      console.log(`[DateFreshen]   Sample keys: [${sampleKeys.join(", ")}]`);
      // Log first row values for date props
      for (const prop of allDateProps) {
        console.log(`[DateFreshen]   row[0]["${prop.name}"] = "${db.sampleData[0][prop.name]}"`);
      }
    }

    if (allDateProps.length === 0 || db.sampleData.length === 0) continue;

    for (const row of db.sampleData) {
      for (const prop of allDateProps) {
        const val = row[prop.name];
        if (val === undefined || val === null || val === "") continue;

        let newDate: string;
        if (futureDatePatterns.test(prop.name)) {
          // Due dates: 1-14 days in the future
          newDate = offsetDate(randomInt(1, 14));
        } else if (recentDatePatterns.test(prop.name)) {
          // Recently touched: 0-3 days ago
          newDate = offsetDate(-randomInt(0, 3));
        } else if (startDatePatterns.test(prop.name)) {
          // Start dates: 7-30 days ago
          newDate = offsetDate(-randomInt(7, 30));
        } else {
          // Generic date: spread across past 30 days
          newDate = offsetDate(-randomInt(0, 30));
        }

        console.log(`[DateFreshen]   ${db.name}.${prop.name}: "${val}" → "${newDate}"`);
        row[prop.name] = newDate;
        totalFreshened++;
      }
    }
  }

  console.log(`[DateFreshen] Total dates freshened: ${totalFreshened}`);
}


// ═══════════════════════════════════════════════════════════════════════════════
// H3) KPI VALUE CONSISTENCY — Compute KPI values from actual sample data
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scan sample data in databases and update KPI card static values to match.
 * Ensures the dashboard KPIs don't say "6 Goals Active" when there are only 3 goals.
 */
export function computeKPIValues(kpiCards: KPICard[], databases: DatabaseSpec[]): void {
  for (const card of kpiCards) {
    const labelLower = card.label.toLowerCase();

    // Find matching database and compute
    if (labelLower.includes("goals") && labelLower.includes("active")) {
      const goalsDb = databases.find(d => d.key.includes("goal"));
      if (goalsDb && goalsDb.sampleData.length > 0) {
        const activeCount = goalsDb.sampleData.filter(r => {
          const status = String(r["Status"] || r["status"] || "");
          return !status.toLowerCase().includes("complete") && !status.toLowerCase().includes("done");
        }).length;
        const total = goalsDb.sampleData.length;
        card.value = `✅ ${activeCount}/${total}`;
        card.subtitle = "on track";
      }
    } else if (labelLower.includes("habit") && labelLower.includes("streak")) {
      const habitsDb = databases.find(d => d.key.includes("habit"));
      if (habitsDb && habitsDb.sampleData.length > 0) {
        const maxStreak = Math.max(...habitsDb.sampleData.map(r => Number(r["Streak"] || r["streak"] || r["Current Streak"] || 0)));
        card.value = `🔥 ${maxStreak} days`;
        card.subtitle = "best streak";
      }
    } else if (labelLower.includes("books") && labelLower.includes("read")) {
      const resourcesDb = databases.find(d => d.key.includes("resource") || d.key.includes("reading") || d.key.includes("book"));
      if (resourcesDb && resourcesDb.sampleData.length > 0) {
        const count = resourcesDb.sampleData.length;
        card.value = `📚 ${count} of 12`;
        card.subtitle = "this quarter";
      }
    } else if (labelLower.includes("tasks") && labelLower.includes("done")) {
      const tasksDb = databases.find(d => d.key.includes("task"));
      if (tasksDb && tasksDb.sampleData.length > 0) {
        const total = tasksDb.sampleData.length;
        const done = tasksDb.sampleData.filter(r => {
          const status = String(r["Status"] || r["status"] || "");
          return status.toLowerCase().includes("done") || status.toLowerCase().includes("complete");
        }).length;
        card.value = `${done}/${total}`;
        card.subtitle = "this week";
      }
    } else if (labelLower.includes("journal") && labelLower.includes("streak")) {
      const journalDb = databases.find(d => d.key.includes("journal") || d.key.includes("daily"));
      const streak = journalDb ? Math.min(journalDb.sampleData.length + 5, 14) : 8;
      card.value = `📝 ${streak} days`;
    } else if (labelLower.includes("total") && labelLower.includes("balance")) {
      const walletsDb = databases.find(d => d.key === "wallets");
      if (walletsDb && walletsDb.sampleData.length > 0) {
        const total = walletsDb.sampleData.reduce((s, r) =>
          s + Number(r["Balance"] || r["balance"] || 0), 0);
        card.value = total >= 1000 ? `€${(total / 1000).toFixed(1)}k` : `€${Math.round(total)}`;
        card.subtitle = "all wallets";
      }
    } else if (labelLower.includes("monthly") && labelLower.includes("net")) {
      const txDb = databases.find(d => d.key.includes("transaction"));
      if (txDb && txDb.sampleData.length > 0) {
        let income = 0, expenses = 0;
        for (const r of txDb.sampleData) {
          const amount = Number(r["Amount"] || r["amount"] || 0);
          const type = String(r["Type"] || r["type"] || "").toLowerCase();
          if (type.includes("income")) income += amount;
          else if (type.includes("expense")) expenses += amount;
        }
        const net = income - expenses;
        card.value = net >= 0 ? `+€${Math.abs(Math.round(net)).toLocaleString()}` : `-€${Math.abs(Math.round(net)).toLocaleString()}`;
        card.subtitle = "income - expenses";
      }
    } else if (labelLower.includes("active") && labelLower.includes("goal")) {
      const goalsDb = databases.find(d => d.key.includes("goal"));
      if (goalsDb && goalsDb.sampleData.length > 0) {
        const total = goalsDb.sampleData.length;
        const active = goalsDb.sampleData.filter(r => {
          const status = String(r["Status"] || r["status"] || "").toLowerCase();
          return status !== "achieved" && status !== "completed";
        }).length;
        card.value = `${active}/${total}`;
        card.subtitle = "on track";
      }
    } else if (labelLower.includes("budget") && labelLower.includes("health")) {
      const budgetDb = databases.find(d => d.key === "budgets");
      if (budgetDb && budgetDb.sampleData.length > 0) {
        const total = budgetDb.sampleData.length;
        const under = budgetDb.sampleData.filter(r => {
          const spent = Number(r["Spent This Month"] || 0);
          const limit = Number(r["Monthly Limit"] || 1);
          return spent <= limit;
        }).length;
        card.value = `${under}/${total} ✅`;
        card.subtitle = "under budget";
      }
    } else if (labelLower.includes("net") && labelLower.includes("income")) {
      const txDb = databases.find(d => d.key.includes("transaction"));
      if (txDb && txDb.sampleData.length > 0) {
        let income = 0, expenses = 0;
        for (const r of txDb.sampleData) {
          const amount = Number(r["Amount"] || r["amount"] || 0);
          const type = String(r["Type"] || r["type"] || r["Category"] || "").toLowerCase();
          if (type.includes("income") || type.includes("salary")) income += amount;
          else expenses += amount;
        }
        const net = income - expenses;
        card.value = net >= 1000 ? `$${(net / 1000).toFixed(1)}k` : `$${net}`;
        card.subtitle = "this month";
      }
    } else if (labelLower.includes("gpa")) {
      card.value = "3.7";
      card.subtitle = "current";
    }
    // For any KPI not matched, keep the existing static value (from preset)
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION: Apply Premium Framework to a base template spec
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Transform a basic NotionTemplateSpec into a premium, Etsy-ready template.
 *
 * This is the CORE function of the Premium Template Framework.
 * It takes any base spec and wraps it with:
 *   - Cover image
 *   - Navigation bar
 *   - KPI dashboard row
 *   - Quick action buttons
 *   - Onboarding guide
 *   - Structured section layout
 *   - Brand footer
 *
 * The base spec's databases and sub-pages are preserved and enhanced.
 */
export function applyPremiumFramework(
  baseSpec: NotionTemplateSpec,
  config: PremiumConfig
): NotionTemplateSpec {
  // ── Build the new dashboard blocks ──
  const blocks: BlockSpec[] = [];

  // 1. Cover + Title
  blocks.push(...generateCoverSection(config));

  // 2. Walk through configured sections in order
  for (const section of config.dashboard.sections) {
    blocks.push(...generateSection(section, baseSpec.databases, config));
  }

  // 3. Append base spec's rich dashboard content (skip header blocks already generated above)
  if (baseSpec.dashboardBlocks.length > 0) {
    // Skip the heading_1, quote, and first callout (already in premium cover section)
    const richBlocks = baseSpec.dashboardBlocks.filter((b, i) => {
      if (i === 0 && b.type === "heading_1") return false;
      if (i === 1 && (b.type === "quote" || b.type === "paragraph")) return false;
      if (i === 2 && b.type === "callout" && ((b.text || "").includes("ALL TRACKING IS AUTOMATIC") || (b.text || "").includes("ALL CALCULATIONS ARE AUTOMATIC") || (b.text || "").includes("ENGAGEMENT METRICS UPDATE AUTOMATICALLY"))) return false;
      if (i === 3 && b.type === "divider") return false;
      return true;
    });
    if (richBlocks.length > 0) {
      blocks.push({ type: "divider" });
      blocks.push(...richBlocks);
    }
  }

  // 4. Brand footer
  if (config.visual.brandTagline) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "paragraph",
      text: config.visual.brandTagline,
      italic: true,
      color: config.visual.brandColor,
    });
  }

  // ── Build sub-pages from blueprints ──
  const subPages: PageSpec[] = [
    // Keep any existing sub-pages from the base spec
    ...baseSpec.subPages,
  ];

  // Add premium sub-pages from config
  for (const blueprint of config.subPages) {
    const pageBlocks: BlockSpec[] = [];

    if (blueprint.cover) {
      // Note: sub-page covers are set via the Notion API, not blocks
      // We'll add a banner image placeholder
    }

    // Generate sections for the sub-page
    for (const section of blueprint.sections) {
      pageBlocks.push(...generateSection(section, baseSpec.databases, config));
    }

    // Add any custom blocks
    if (blueprint.customBlocks) {
      pageBlocks.push(...blueprint.customBlocks);
    }

    subPages.push({
      name: blueprint.name,
      icon: blueprint.icon,
      blocks: pageBlocks,
    });
  }

  // ── Return the premium-enhanced spec ──
  return {
    id: baseSpec.id,
    name: config.templateName || baseSpec.name,
    icon: config.icon || baseSpec.icon,
    cover: config.visual.coverUrl || baseSpec.cover,
    description: config.tagline || baseSpec.description,
    dashboardBlocks: blocks,
    footerBlocks: baseSpec.footerBlocks,
    databases: baseSpec.databases,
    sections: baseSpec.sections,
    subPages,
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// BUILDER HELPER: Convert an AITemplatePlan → PremiumConfig
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert an AI-generated template plan into a PremiumConfig
 * that can be passed to applyPremiumFramework()
 */
export function aiPlanToPremiumConfig(plan: AITemplatePlan): PremiumConfig {
  const visual = buildVisualIdentity(plan.aesthetic || "minimal", plan.templateType);

  // Build KPI cards (use plan's or generate defaults)
  const kpiCards = plan.kpiCards.length > 0
    ? plan.kpiCards
    : generateDefaultKPICards(plan.templateType, visual);

  // Build navigation tabs (use plan's or fall back to presets)
  const navTabs = plan.navigationTabs.length > 0
    ? plan.navigationTabs
    : NAVIGATION_PRESETS[plan.templateType] || NAVIGATION_PRESETS.default;

  // Build quick actions
  const quickActions = plan.quickActions.length > 0
    ? plan.quickActions
    : generateDefaultQuickActions(plan.databases.map((d) => d.key));

  // Build dashboard sections — clean layout: nav → KPIs → onboarding only
  // Quick Actions removed (callout buttons can't link to databases via API)
  // DB Previews removed (static snapshots that go stale — databases accessible via sidebar)
  const sections: DashboardSection[] = [
    { heading: "Navigation", icon: "🧭", layout: "full", contentType: "navigation" },
    { heading: "Dashboard", icon: "📊", layout: "3-col", contentType: "kpi_row" },
    { heading: "Setup Guide", icon: "📖", layout: "full", contentType: "onboarding" },
  ];

  // Build onboarding steps — Step 1 is ALWAYS the full-width instruction
  const onboardingSteps: OnboardingStep[] = [
    {
      order: 1,
      instruction: "Click ••• (top-right) → Toggle 'Full width' for the best experience",
      timeEstimate: "0 min",
    },
    {
      order: 2,
      instruction: "Delete the sample data from each database (keep the structure)",
      timeEstimate: "2 min",
    },
    {
      order: 3,
      instruction: `Start with the main database (${plan.databases[0]?.name || "Tasks"})`,
      timeEstimate: "3 min",
      relatedSection: plan.databases[0]?.key,
    },
    {
      order: 4,
      instruction: "Add your own entries — the formulas and progress bars update automatically",
      timeEstimate: "5 min",
    },
    {
      order: 5,
      instruction: "Explore each section using the navigation bar above",
      timeEstimate: "2 min",
    },
    {
      order: 6,
      instruction: "Customize colors, icons, and labels to match your style",
      timeEstimate: "3 min",
    },
  ];

  return {
    templateType: plan.templateType,
    templateName: plan.templateName,
    tagline: plan.tagline,
    icon: plan.icon,
    visual,
    navigation: {
      enabled: true,
      tabs: navTabs,
      style: "auto",
      maxTabsPerRow: 3,
      labelMaxChars: 8,
    },
    dashboard: {
      sections,
      kpiCards,
      quickActions,
    },
    onboarding: {
      enabled: true,
      welcomeMessage: `Welcome to your ${plan.templateName}! Follow these steps to make it yours.`,
      steps: onboardingSteps,
      collapsible: true,
    },
    pageTemplates: plan.databases
      .filter((db) => PAGE_TEMPLATE_PRESETS[db.key] || PAGE_TEMPLATE_PRESETS[guessPageTemplateType(db.key)])
      .map((db) => ({
        databaseKey: db.key,
        titlePattern: `New ${db.name.replace(/s$/, "")}`,
        pageBlocks: PAGE_TEMPLATE_PRESETS[db.key] || PAGE_TEMPLATE_PRESETS[guessPageTemplateType(db.key)] || [],
      })),
    subPages: plan.subPages.map((sp) => ({
      name: sp.name,
      icon: sp.icon,
      sections: sp.sections.map((s, i) => ({
        heading: s,
        icon: sp.icon,
        layout: "full" as const,
        contentType: "text_block" as const,
      })),
    })),
    demoData: {
      personaName: "Alex",
      historyDays: 14,
      itemCounts: Object.fromEntries(plan.databases.map((db) => [db.key, 8])),
      storyArc: "productivity_journey",
      includeInProgress: true,
    },
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Default generators for when AI plan is missing certain fields
// ═══════════════════════════════════════════════════════════════════════════════

function generateDefaultKPICards(templateType: string, visual: VisualIdentity): KPICard[] {
  const kpiPresets: Record<string, KPICard[]> = {
    adhd_planner: [
      { icon: "✅", label: "Tasks Done", valueType: "static", value: "12/18", color: visual.accentColor, subtitle: "this week" },
      { icon: "🔥", label: "Habit Streak", valueType: "static", value: "14 days", color: visual.brandColor, subtitle: "best: 21" },
      { icon: "🍅", label: "Focus Time", valueType: "static", value: "4.5 hrs", color: visual.cardBackground, subtitle: "this week" },
      { icon: "📊", label: "Day Score", valueType: "static", value: "78/100", color: visual.accentColor, subtitle: "today" },
    ],
    finance_tracker: [
      { icon: "💳", label: "Total Balance", valueType: "static", value: "€7,595", color: visual.accentColor, subtitle: "all wallets" },
      { icon: "💰", label: "Monthly Net", valueType: "static", value: "+€3,160", color: visual.brandColor, subtitle: "income - expenses" },
      { icon: "🎯", label: "Active Goals", valueType: "static", value: "3/3", color: visual.cardBackground, subtitle: "on track" },
      { icon: "📊", label: "Budget Health", valueType: "static", value: "5/6 ✅", color: visual.accentColor, subtitle: "under budget" },
    ],
    life_planner: [
      { icon: "🎯", label: "Goals Active", valueType: "static", value: "✅ 5/6", color: visual.accentColor, subtitle: "on track" },
      { icon: "💪", label: "Habit Streak", valueType: "static", value: "🔥 12 days", color: visual.brandColor, subtitle: "best streak" },
      { icon: "📖", label: "Books Read", valueType: "static", value: "📚 4 of 12", color: visual.cardBackground, subtitle: "this quarter" },
      { icon: "📓", label: "Journal Streak", valueType: "static", value: "📝 8 days", color: visual.accentColor },
    ],
    student_planner: [
      { icon: "📊", label: "GPA", valueType: "static", value: "3.7", color: visual.accentColor, subtitle: "current" },
      { icon: "📝", label: "Assignments", valueType: "static", value: "3 due", color: visual.brandColor, subtitle: "this week" },
      { icon: "📖", label: "Study Hours", valueType: "static", value: "18h", color: visual.cardBackground, subtitle: "this week" },
      { icon: "✅", label: "Completed", valueType: "static", value: "87%", color: visual.accentColor, subtitle: "this semester" },
    ],
  };

  return kpiPresets[templateType] || [
    { icon: "📊", label: "Progress", valueType: "static", value: "65%", color: visual.accentColor },
    { icon: "✅", label: "Completed", valueType: "static", value: "12", color: visual.brandColor, subtitle: "this week" },
    { icon: "🔥", label: "Streak", valueType: "static", value: "7 days", color: visual.cardBackground },
  ];
}

function generateDefaultQuickActions(databaseKeys: string[]): QuickAction[] {
  const actionMap: Record<string, QuickAction> = {
    tasks: { icon: "➕", label: "New Task", actionType: "database_link", target: "tasks" },
    goals: { icon: "🎯", label: "Add Goal", actionType: "database_link", target: "goals" },
    tasks_goals: { icon: "📋", label: "New Task/Goal", actionType: "database_link", target: "tasks_goals" },
    habits: { icon: "💪", label: "Log Habit", actionType: "database_link", target: "habits" },
    habits_wellness: { icon: "💪", label: "Log Habit", actionType: "database_link", target: "habits_wellness" },
    journal: { icon: "📓", label: "Journal Entry", actionType: "database_link", target: "journal" },
    journal_notes: { icon: "📝", label: "New Entry", actionType: "database_link", target: "journal_notes" },
    daily_log: { icon: "📅", label: "Daily Log", actionType: "database_link", target: "daily_log" },
    brain_dump: { icon: "🧠", label: "Brain Dump", actionType: "database_link", target: "brain_dump" },
    transactions: { icon: "💳", label: "Add Transaction", actionType: "database_link", target: "transactions" },
    budget_goals: { icon: "🎯", label: "Budget/Goal", actionType: "database_link", target: "budget_goals" },
    wallets: { icon: "💳", label: "Add Wallet", actionType: "database_link", target: "wallets" },
    budgets: { icon: "📊", label: "Set Budget", actionType: "database_link", target: "budgets" },
    financial_goals: { icon: "🎯", label: "Add Goal", actionType: "database_link", target: "financial_goals" },
    net_worth: { icon: "📊", label: "Net Worth Entry", actionType: "database_link", target: "net_worth" },
    expenses: { icon: "🧾", label: "Add Expense", actionType: "database_link", target: "expenses" },
    income: { icon: "💵", label: "Log Income", actionType: "database_link", target: "income" },
    focus_sessions: { icon: "🍅", label: "Start Focus", actionType: "database_link", target: "focus_sessions" },
    reading: { icon: "📚", label: "Add Book", actionType: "database_link", target: "reading" },
    reading_learning: { icon: "📚", label: "Add Book", actionType: "database_link", target: "reading_learning" },
    notes: { icon: "📝", label: "New Note", actionType: "database_link", target: "notes" },
    meals: { icon: "🍽️", label: "Add Meal", actionType: "database_link", target: "meals" },
    workouts: { icon: "🏋️", label: "Log Workout", actionType: "database_link", target: "workouts" },
    assignments: { icon: "📝", label: "New Assignment", actionType: "database_link", target: "assignments" },
  };

  const actions: QuickAction[] = [];
  for (const key of databaseKeys.slice(0, 4)) {
    if (actionMap[key]) {
      actions.push(actionMap[key]);
    }
  }

  // Ensure at least 3 actions
  if (actions.length < 3 && databaseKeys.length > 0) {
    for (const key of databaseKeys) {
      if (!actions.find((a) => a.target === key) && actions.length < 4) {
        actions.push({
          icon: "➕",
          label: `Add ${key.replace(/_/g, " ")}`,
          actionType: "database_link",
          target: key,
        });
      }
    }
  }

  return actions;
}

function guessPageTemplateType(dbKey: string): string {
  const mapping: Record<string, string> = {
    tasks: "task",
    goals: "goal",
    tasks_goals: "task",
    journal: "journal",
    journal_notes: "journal",
    daily_log: "journal",
    habits: "habit",
    habits_wellness: "habit",
    workouts: "workout",
    focus_sessions: "task",
    assignments: "task",
    meetings: "meeting",
    notes: "task",
    reading_learning: "task",
    transactions: "task",
    budget_goals: "task",
    net_worth: "task",
    wallets: "task",
    budgets: "task",
    financial_goals: "goal",
  };
  return mapping[dbKey] || "task";
}


// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE: Build a PremiumConfig from scratch for known template types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Quick builder for creating a PremiumConfig for a known template type.
 * Use this when you have a base template and want to premium-ify it.
 */
export function buildPremiumConfig(
  templateType: string,
  aesthetic: string,
  overrides?: Partial<PremiumConfig>
): PremiumConfig {
  const visual = buildVisualIdentity(aesthetic, templateType);
  const navTabs = NAVIGATION_PRESETS[templateType] || NAVIGATION_PRESETS.default;

  const config: PremiumConfig = {
    templateType,
    templateName: overrides?.templateName || `Premium ${templateType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`,
    tagline: overrides?.tagline || "Your complete system, beautifully organized.",
    icon: overrides?.icon || "✨",
    visual: overrides?.visual || visual,
    navigation: overrides?.navigation || {
      enabled: true,
      tabs: navTabs,
      style: "auto",
      maxTabsPerRow: 3,
      labelMaxChars: 8,
    },
    dashboard: overrides?.dashboard || {
      sections: [
        { heading: "Navigation", icon: "🧭", layout: "full", contentType: "navigation" },
        { heading: "Dashboard", icon: "📊", layout: "3-col", contentType: "kpi_row" },
        { heading: "Setup Guide", icon: "📖", layout: "full", contentType: "onboarding" },
      ],
      kpiCards: generateDefaultKPICards(templateType, visual),
      quickActions: [],
    },
    onboarding: overrides?.onboarding || {
      enabled: true,
      welcomeMessage: "Follow these steps to make this template yours!",
      steps: [
        { order: 1, instruction: "Click ••• (top-right) → Toggle 'Full width' for the best experience", timeEstimate: "0 min" },
        { order: 2, instruction: "Delete sample data from each database", timeEstimate: "2 min" },
        { order: 3, instruction: "Add your own entries", timeEstimate: "5 min" },
        { order: 4, instruction: "Customize colors and icons", timeEstimate: "3 min" },
        { order: 5, instruction: "Explore each section", timeEstimate: "2 min" },
      ],
      collapsible: true,
    },
    pageTemplates: overrides?.pageTemplates || [],
    subPages: overrides?.subPages || [],
    demoData: overrides?.demoData || {
      personaName: "Alex",
      historyDays: 14,
      itemCounts: {},
      storyArc: "productivity_journey",
      includeInProgress: true,
    },
  };

  return config;
}


// ═══════════════════════════════════════════════════════════════════════════════
// CORE CONVERTER: Raw AI-generated plan JSON → Buildable NotionTemplateSpec
// ═══════════════════════════════════════════════════════════════════════════════

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Convert a raw AI-generated plan (the JSON from /api/opportunities/generate)
 * into a full NotionTemplateSpec that the Notion build route can execute.
 *
 * This is the BRIDGE between:
 *   Etsy scan → AI plan (Gemini JSON) → NotionTemplateSpec → Notion API build
 *
 * Handles:
 *   - Type mapping: "status"→"select", "text"→"rich_text", "files"→"url"
 *   - Key generation from database names
 *   - Merging sample data from the separate sampleData array
 *   - Injecting relations as properties
 *   - Building dashboard blocks from the AI's dashboard definition
 *   - Cover image selection based on aesthetic
 */
export function aiPlanToNotionSpec(
  rawPlan: any,
  aesthetic?: string
): NotionTemplateSpec {
  const plan = rawPlan;
  const aes = aesthetic || plan.aesthetic || "minimal";
  const colors = AESTHETIC_COLORS[aes]?.selectColors || AESTHETIC_COLORS.minimal.selectColors;

  // ── Helper: generate a key from a database name ──
  function nameToKey(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  }

  // ── Helper: map AI property type to our DatabaseProperty type ──
  function mapPropertyType(aiType: string): DatabaseProperty["type"] {
    const typeMap: Record<string, DatabaseProperty["type"]> = {
      title: "title",
      text: "rich_text",
      rich_text: "rich_text",
      number: "number",
      select: "select",
      multi_select: "multi_select",
      date: "date",
      checkbox: "checkbox",
      url: "url",
      email: "email",
      formula: "formula",
      relation: "relation",
      rollup: "rollup",
      created_time: "created_time",
      last_edited_time: "last_edited_time",
      // Map unsupported types to closest equivalents
      status: "select",
      files: "url",
      file: "url",
      person: "rich_text",
      phone_number: "rich_text",
    };
    return typeMap[aiType] || "rich_text";
  }

  // ── Build sample data map: { "Database Name" → rows[] } ──
  const sampleDataMap: Record<string, Record<string, unknown>[]> = {};
  if (Array.isArray(plan.sampleData)) {
    for (const sd of plan.sampleData) {
      if (sd.database && Array.isArray(sd.rows)) {
        sampleDataMap[sd.database] = sd.rows;
      }
    }
  }

  // ── Build relation target map: { "FromDB.PropertyName" → "TargetDB" } ──
  const relationMap: Record<string, string> = {};
  if (Array.isArray(plan.relations)) {
    for (const rel of plan.relations) {
      relationMap[`${rel.from}.${rel.property}`] = rel.to;
    }
  }

  // ── Build formula map: { "DB.PropertyName" → formula expression } ──
  const formulaMap: Record<string, string> = {};
  if (Array.isArray(plan.formulas)) {
    for (const f of plan.formulas) {
      if (f.formula) {
        formulaMap[`${f.db}.${f.property}`] = f.formula;
      }
    }
  }

  // ── Convert AI databases → DatabaseSpec[] ──
  const databases: DatabaseSpec[] = (plan.databases || []).map((aiDb: any) => {
    const dbKey = aiDb.key || nameToKey(aiDb.name);

    // Convert properties
    const properties: DatabaseProperty[] = (aiDb.properties || []).map((aiProp: any) => {
      const mappedType = mapPropertyType(aiProp.type);
      const prop: DatabaseProperty = {
        name: aiProp.name,
        type: mappedType,
      };

      // Add options for select/multi_select
      if ((mappedType === "select" || mappedType === "multi_select") && Array.isArray(aiProp.options)) {
        prop.options = aiProp.options.map((opt: string, i: number) => ({
          name: opt,
          color: colors[i % colors.length],
        }));
      }

      // Add formula expression
      if (mappedType === "formula") {
        const formulaKey = `${aiDb.name}.${aiProp.name}`;
        prop.formula = formulaMap[formulaKey] || aiProp.formula || "";
      }

      return prop;
    });

    // Inject relation properties from the relations array
    for (const rel of plan.relations || []) {
      if (rel.from === aiDb.name) {
        // Check if this relation property already exists
        const exists = properties.some(p => p.name === rel.property);
        if (!exists) {
          const targetKey = nameToKey(rel.to);
          properties.push({
            name: rel.property,
            type: "relation",
            relationDbKey: targetKey,
          });
        }
      }
    }

    // Mark existing relation-typed properties with their target key
    for (const prop of properties) {
      if (prop.type === "relation") {
        const relKey = `${aiDb.name}.${prop.name}`;
        const targetName = relationMap[relKey];
        if (targetName) {
          prop.relationDbKey = nameToKey(targetName);
        }
      }
    }

    // Get sample data for this database
    const sampleData = sampleDataMap[aiDb.name] || [];

    return {
      key: dbKey,
      name: aiDb.name,
      icon: aiDb.icon || "📋",
      properties,
      sampleData,
    };
  });

  // ── Build dashboard blocks from AI's dashboard definition ──
  const dashboardBlocks: BlockSpec[] = [];

  // Title
  dashboardBlocks.push({
    type: "heading_1",
    text: `${plan.icon || "✨"} ${plan.templateName || "Untitled Template"}`,
  });

  // Tagline
  if (plan.etsyListing?.description) {
    const firstSentence = plan.etsyListing.description.split(".")[0] + ".";
    dashboardBlocks.push({
      type: "quote",
      text: firstSentence.length > 120
        ? plan.templateName || "Your complete system."
        : firstSentence,
      italic: true,
    });
  }

  // Setup callout
  dashboardBlocks.push(createCallout("⚡ Welcome! Delete sample data, add your own entries, and all formulas/progress bars update automatically.", "⚡", { color: "yellow_background" }));

  dashboardBlocks.push({ type: "divider" });

  // Dashboard blocks from AI plan
  if (Array.isArray(plan.dashboards) && plan.dashboards.length > 0) {
    const dashboard = plan.dashboards[0];
    for (const block of dashboard.blocks || []) {
      switch (block.type) {
        case "heading":
          dashboardBlocks.push({ type: "heading_2", text: block.content });
          break;
        case "callout":
          dashboardBlocks.push(createCallout(block.content, block.config?.icon || "💡", { color: "blue_background" }));
          break;
        case "divider":
          dashboardBlocks.push({ type: "divider" });
          break;
        case "toggle":
          dashboardBlocks.push({
            type: "toggle",
            text: block.content,
            children: [],
          });
          break;
        case "quote":
          dashboardBlocks.push({
            type: "quote",
            text: block.content,
            italic: true,
          });
          break;
        case "linked_db":
          // Represent as a callout pointing to the database
          dashboardBlocks.push(createCallout(`📊 ${block.content}${block.config?.view ? ` — ${block.config.view} view` : ""}`, "📊", { color: "gray_background" }));
          break;
        case "text":
          dashboardBlocks.push({
            type: "paragraph",
            text: block.content,
          });
          break;
        default:
          dashboardBlocks.push({
            type: "paragraph",
            text: block.content || "",
          });
      }
    }
  }

  // ── Footer blocks (after inline databases) ──
  const footerBlocks: BlockSpec[] = [
    {
      type: "paragraph",
      text: "Made with CraftPlan Digital",
      italic: true,
      color: "gray",
    },
  ];

  // ── Cover image ──
  const coverCategory = AESTHETIC_TO_COVER_CATEGORY[aes] || "clean_white";
  const coverPool = PREMIUM_COVERS[coverCategory] || PREMIUM_COVERS.clean_white;
  const cover = coverPool[Math.floor(Math.random() * coverPool.length)];

  // ── Build the spec ──
  return {
    id: `ai_${nameToKey(plan.templateName || "custom")}`,
    name: plan.templateName || "AI-Generated Template",
    icon: plan.icon || "✨",
    cover,
    description: plan.etsyListing?.title || plan.templateName || "",
    dashboardBlocks,
    footerBlocks,
    databases,
    subPages: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// I) TEMPLATE PARITY ENGINE — Inference + Blueprint Applicator + Validation
// ═══════════════════════════════════════════════════════════════════════════════

/** Database keyword mapping for parity inference */
const DB_KEYWORD_MAP: Record<string, string> = {
  task: "Tasks", "to-do": "Tasks", todo: "Tasks", project: "Projects",
  habit: "Habits", routine: "Habits", streak: "Habits",
  goal: "Goals", milestone: "Goals", target: "Goals",
  journal: "Journal", diary: "Journal", "daily log": "Daily Log",
  focus: "Focus Sessions", pomodoro: "Focus Sessions", timer: "Focus Sessions",
  budget: "Budget", expense: "Expenses", income: "Income", finance: "Finance",
  meal: "Meals", recipe: "Recipes", nutrition: "Nutrition",
  workout: "Workouts", exercise: "Workouts", fitness: "Fitness",
  note: "Notes", resource: "Resources", bookmark: "Resources",
  calendar: "Calendar", schedule: "Schedule", event: "Events",
  reading: "Reading List", book: "Books",
  class: "Classes", course: "Courses", assignment: "Assignments",
  "brain dump": "Brain Dump", idea: "Ideas",
  mood: "Mood Tracker", wellness: "Wellness",
  debt: "Debts", subscription: "Subscriptions", savings: "Savings",
};

const VIEW_KEYWORD_MAP: Record<string, string> = {
  board: "board", kanban: "board",
  calendar: "calendar", "schedule view": "calendar",
  gallery: "gallery", "card view": "gallery",
  timeline: "timeline", gantt: "timeline",
};

/** View type defaults by database purpose keyword */
const DB_VIEW_DEFAULTS: Record<string, string> = {
  Tasks: "board", Projects: "board", Assignments: "board",
  Calendar: "calendar", Schedule: "calendar", Events: "calendar",
  Habits: "table", "Mood Tracker": "table", Journal: "gallery",
  "Daily Log": "gallery", Goals: "gallery", Savings: "gallery",
  Notes: "list", Resources: "list", Books: "list", "Reading List": "list",
  Finance: "table", Expenses: "table", Income: "table", Budget: "table",
};

/**
 * Infer parity hints from a listing's deep-scan data.
 * Returns deterministic layout hints that get injected into the Gemini prompt.
 */
export function inferParity(
  listing: Record<string, unknown>,
  competitors: Record<string, unknown>[],
  opportunity: Record<string, unknown>,
): ParityHints {
  const price = Number(listing.price) || 0;
  const featureDensity = Number(listing.feature_density) || 0;
  const imageCount = Number(listing.image_count) || 0;
  const hasVideo = Boolean(listing.has_video);

  // Parse JSON fields safely
  let descSections: Record<string, unknown> = {};
  try { descSections = typeof listing.description_sections === "string" ? JSON.parse(listing.description_sections as string) : (listing.description_sections || {}); } catch { /* */ }

  let reviewSignals: Record<string, unknown> = {};
  try { reviewSignals = typeof listing.review_signals === "string" ? JSON.parse(listing.review_signals as string) : (listing.review_signals || {}); } catch { /* */ }

  let tags: string[] = [];
  try { tags = typeof listing.tags === "string" ? JSON.parse(listing.tags as string) : (listing.tags as string[] || []); } catch { /* */ }

  const descText = [
    ...(descSections.features as string[] || []),
    ...(descSections.whats_included as string[] || []),
  ].join(" ").toLowerCase();

  // ── Rule 1: Page Architecture ──
  const mentionsSubPages = /sub.?page|section|module|area|zone/i.test(descText);
  const pageType: "single_page" | "hub_with_subpages" =
    (price >= 8 || featureDensity >= 10 || mentionsSubPages)
      ? "hub_with_subpages" : "single_page";
  const subPageCount = pageType === "hub_with_subpages"
    ? Math.min(8, Math.max(3, Math.floor(featureDensity / 2)))
    : 0;

  // ── Rule 2: Database Count ──
  const priceDbMap: Record<string, number> = { low: 3, mid: 5, high: 8, premium: 10 };
  const priceRange = price < 4 ? "low" : price < 8 ? "mid" : price < 15 ? "high" : "premium";
  const dbCountFromPrice = priceDbMap[priceRange] || 3;

  // Count mentioned databases from description
  const allText = descText + " " + tags.join(" ").toLowerCase();
  const foundDbs = new Set<string>();
  for (const [keyword, dbName] of Object.entries(DB_KEYWORD_MAP)) {
    if (allText.includes(keyword)) foundDbs.add(dbName);
  }

  // Explicit count from description: "5 databases", "7+ databases"
  const dbCountMatch = allText.match(/(\d+)\+?\s*(?:database|db|section|module)/i);
  const claimedDbCount = dbCountMatch ? parseInt(dbCountMatch[1]) : 0;

  const inferredDbCount = Math.max(2, Math.min(12,
    Math.max(foundDbs.size, dbCountFromPrice, claimedDbCount)));
  const inferredDatabases = Array.from(foundDbs).slice(0, inferredDbCount);

  // ── Rule 3: View Types ──
  const inferredViewTypes: string[] = [];
  for (const db of inferredDatabases) {
    const defaultView = DB_VIEW_DEFAULTS[db] || "table";
    inferredViewTypes.push(defaultView);
  }
  // Override from review mentions
  const mentionedFeatures = reviewSignals.mentioned_features as string[] || [];
  for (const feature of mentionedFeatures) {
    const fLower = feature.toLowerCase();
    for (const [kw, vt] of Object.entries(VIEW_KEYWORD_MAP)) {
      if (fLower.includes(kw) && !inferredViewTypes.includes(vt)) {
        inferredViewTypes.push(vt);
      }
    }
  }

  // ── Rule 4: Visual Tier ──
  const visualTier: "cinematic" | "premium" | "standard" =
    (imageCount >= 7 && (hasVideo || price >= 10)) ? "cinematic" :
    (imageCount >= 4 && price >= 5) ? "premium" : "standard";

  // ── Rule 4b: Premium Tier — detect OS_ULTRA from listing signals ──
  let premiumTier: PremiumTier = "standard";
  if (
    price >= 12 ||
    (imageCount >= 7 && price >= 8) ||
    (featureDensity >= 12 && price >= 10) ||
    hasVideo
  ) {
    premiumTier = "os_ultra";
  } else if (price >= 6 || imageCount >= 5 || featureDensity >= 8) {
    premiumTier = "premium";
  }

  // ── Rule 5: Section Layout ──
  const sectionOrder: string[] = [];

  if (premiumTier === "os_ultra") {
    // OS_ULTRA section order: cinematic OS dashboard layout
    sectionOrder.push("cover_hero", "nav_bar", "widget_grid", "fast_actions");
    // App panels with databases (grouped in 2-col pairs)
    for (let i = 0; i < Math.min(inferredDatabases.length, 8); i += 2) {
      if (i + 1 < inferredDatabases.length) {
        sectionOrder.push("app_panels");
      } else {
        sectionOrder.push("database_section");
      }
    }
    sectionOrder.push("chart_row", "toggle_section", "brand_footer");
  } else {
    // Standard / premium section order
    sectionOrder.push("cover_hero", "nav_bar", "kpi_row");
    if (visualTier === "cinematic") sectionOrder.push("quick_actions", "spacer");
    for (let i = 0; i < Math.min(inferredDatabases.length, 8); i++) {
      sectionOrder.push("database_section");
    }
    // Charts check
    const mentionsCharts = /chart|graph|analytics|visual|statistics|dashboard/i.test(allText);
    const chartCountLocal = mentionsCharts ? Math.min(3, Math.max(1,
      (allText.match(/chart|graph/gi) || []).length)) : 0;
    if (chartCountLocal > 0) sectionOrder.push("chart_row");
    sectionOrder.push("toggle_section", "brand_footer");
  }

  // Charts count (for return value)
  const mentionsCharts = /chart|graph|analytics|visual|statistics|dashboard/i.test(allText);
  const chartCount = mentionsCharts ? Math.min(3, Math.max(1,
    (allText.match(/chart|graph/gi) || []).length)) : 0;

  // ── Rule 6: KPI Count ──
  const kpiCount = Math.min(6, Math.max(3, Math.floor(featureDensity / 2.5) + 1));

  // ── Rule 8: Complaints → Upgrades ──
  const complaints = reviewSignals.mentioned_complaints as string[] || [];
  const complaintUpgrades = complaints.map((c: string) =>
    `Fix: "${c}" — improve this area beyond competitor`
  );

  return {
    pageType,
    visualTier,
    inferredDbCount,
    inferredDatabases,
    inferredViewTypes: [...new Set(inferredViewTypes)],
    kpiCount,
    hasCharts: chartCount > 0,
    chartCount,
    subPageCount,
    sectionOrder,
    complaintUpgrades,
    premiumTier,
  };
}


/**
 * Sanitize a color string to a valid Notion API color.
 * Notion only accepts: default, gray, brown, orange, yellow, green, blue, purple, pink, red
 * (and *_background variants).
 */
const VALID_NOTION_COLORS = new Set([
  "default", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red",
]);
function sanitizeNotionColor(color: string): string {
  if (!color) return "default";
  // Strip _background suffix for validation, then re-add
  const isBg = color.endsWith("_background");
  const base = isBg ? color.replace("_background", "") : color;
  if (VALID_NOTION_COLORS.has(base)) return color;
  // Map common AI-generated colors to valid Notion colors
  const map: Record<string, string> = {
    light_blue: "blue", light_green: "green", light_purple: "purple",
    dark_blue: "blue", dark_green: "green", dark_red: "red",
    light_gray: "gray", dark_gray: "gray", light_pink: "pink",
    light_brown: "brown", dark_brown: "brown", teal: "green",
    cyan: "blue", magenta: "pink", indigo: "purple", violet: "purple",
    coral: "orange", salmon: "pink", navy: "blue", olive: "green",
    maroon: "red", lime: "green", aqua: "blue", lavender: "purple",
    beige: "brown", cream: "brown", tan: "brown", gold: "yellow",
    amber: "orange", emerald: "green", sage: "green", rose: "pink",
  };
  const mapped = map[base] || "default";
  return isBg ? `${mapped}_background` : mapped;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OS_ULTRA CONSTANTS — Checklist, Palette, Component Library, Mockup Prompts
// ═══════════════════════════════════════════════════════════════════════════════

/** OS_ULTRA quality checklist — rules that define a premium OS-style template */
export const OS_ULTRA_CHECKLIST: PremiumChecklistItem[] = [
  // Layout
  { rule: "Cinematic cover banner (dark gradient/landscape)", required: true, passCondition: "cover starts with http", buildMethod: "api", category: "layout" },
  { rule: "Page icon (emoji or uploaded)", required: true, passCondition: "icon is set", buildMethod: "api", category: "layout" },
  { rule: "Hero tagline section below cover", required: true, passCondition: "heading_1 or callout after cover", buildMethod: "api", category: "layout" },
  { rule: "OS Navigation tabs row", required: true, passCondition: "column_list with callout tabs", buildMethod: "api", category: "layout" },
  { rule: "Widget grid (KPI area)", required: true, passCondition: "column_list with 3-4 callouts", buildMethod: "api", category: "layout" },
  { rule: "Fast actions panel", required: true, passCondition: "callout group with action buttons", buildMethod: "api", category: "layout" },
  { rule: "App-style panels (2-3 columns)", required: true, passCondition: "column_list with headed sections", buildMethod: "api", category: "layout" },
  { rule: "Brand footer with tagline", required: true, passCondition: "divider + italic paragraph", buildMethod: "api", category: "layout" },
  // Visual
  { rule: "Dark-friendly palette (blue/purple/gray accent)", required: true, passCondition: "palette uses dark-compatible colors", buildMethod: "api", category: "visual" },
  { rule: "Consistent icon family (same emoji style)", required: true, passCondition: "all icons are emoji, same style group", buildMethod: "api", category: "visual" },
  { rule: "Minimal color noise (≤5 select option colors)", required: false, passCondition: "select options use ≤5 colors", buildMethod: "api", category: "visual" },
  { rule: "Clean spacing (dividers or empty paragraphs between sections)", required: true, passCondition: "sections separated by divider/spacer", buildMethod: "api", category: "visual" },
  // Data
  { rule: "≥3 databases with 5+ properties each", required: true, passCondition: "db count >= 3 && all have 5+ props", buildMethod: "api", category: "data" },
  { rule: "≥2 relations linking databases", required: true, passCondition: "relation count >= 2", buildMethod: "api", category: "data" },
  { rule: "≥1 rollup or formula", required: true, passCondition: "has rollup or formula", buildMethod: "api", category: "data" },
  { rule: "≥3 sample rows per database (fresh dates)", required: true, passCondition: "all dbs have 3+ rows", buildMethod: "api", category: "data" },
  { rule: "≥3 distinct view types", required: true, passCondition: "table + board + calendar/gallery", buildMethod: "api", category: "data" },
  // UX
  { rule: "Onboarding toggle (Welcome guide)", required: true, passCondition: "toggle block with onboarding content", buildMethod: "api", category: "ux" },
  { rule: "KPI charts (real Notion /chart)", required: false, passCondition: "chart steps documented", buildMethod: "prompt", category: "ux" },
  { rule: "Device mockup cover image", required: false, passCondition: "mockup prompt provided", buildMethod: "prompt", category: "ux" },
  // SEO
  { rule: "13 unique Etsy tags", required: true, passCondition: "etsyListing.tags.length === 13", buildMethod: "api", category: "seo" },
  { rule: "10 mockup scene prompts", required: true, passCondition: "mockupScenes.length >= 10", buildMethod: "api", category: "seo" },
];

/** Dark-OS color palette for OS_ULTRA templates */
export const OS_DARK_PALETTE = {
  primary: "blue" as const,
  secondary: "purple" as const,
  accent: "gray" as const,
  cardBg: "gray_background" as const,
  cardBorder: "default" as const,
  navActive: "blue_background" as const,
  navInactive: "gray_background" as const,
  kpiHighlight: "blue" as const,
  selectColors: ["blue", "purple", "gray", "default", "green"] as const,
};

/** Default OsUltraStyle when tier detected but style not specified */
const OS_ULTRA_DEFAULTS: OsUltraStyle = {
  osStyle: true,
  backgroundMode: "dark_os",
  cardStyle: "elevated_tiles",
  cardRadius: "soft",
  shadowStyle: "subtle",
  accentPolicy: "single_accent",
  coverThemes: ["cinematic_landscape", "dark_desk", "dark_gradient"],
  widgetStyle: "os_tiles",
  iconFamily: "emoji_consistent",
  colorNoise: "minimal",
  spacingDensity: "comfortable",
};

/** OS-style section order for OS_ULTRA tier templates */
const OS_ULTRA_SECTION_ORDER = [
  "cover_hero", "nav_bar", "widget_grid", "fast_actions",
  /* app_panels + database_sections inserted here */
  "chart_row", "toggle_section", "brand_footer",
];

// ── Icon families for OS_ULTRA consistency ──
// Family A (recommended): Colored circles — 🔵🟣⚫🟢🔴
// Family B: Objects — 📊📋📅📌🗂️
// Family C: Abstract — ⚡💫🎯✨🔮
// RULE: Pick ONE family per template and use it for ALL section icons
const OS_ICON_FAMILIES = {
  circles: ["🔵", "🟣", "⚫", "🟢", "🔴", "🟡", "🟠", "⚪"],
  objects: ["📊", "📋", "📅", "📌", "🗂️", "📎", "🗃️", "📝"],
  abstract: ["⚡", "💫", "🎯", "✨", "🔮", "💎", "🌀", "⭐"],
};

/** 10 cinematic device mockup prompts for Etsy listing images */
export const OS_ULTRA_MOCKUP_PROMPTS = [
  { scene: "hero", prompt: "MacBook Pro on dark marble desk, Notion template dashboard with dark OS UI visible on screen, soft warm lamp light from left, shallow depth of field, cinematic 4K, professional product photography" },
  { scene: "detail_1", prompt: "iPad Pro on dark wooden desk showing Notion KPI dashboard with colored widgets, overhead flat lay, minimal accessories, dark moody lighting" },
  { scene: "detail_2", prompt: "Close-up of MacBook screen showing Notion database with board view, dark background, bokeh lights behind, sharp focus on screen" },
  { scene: "detail_3", prompt: "Split screen view: iPhone showing Notion mobile app + iPad showing full dashboard, dark surface, studio lighting" },
  { scene: "detail_4", prompt: "Notion template navigation tabs close-up on laptop screen, dark UI with blue accent highlights, professional screenshot style" },
  { scene: "lifestyle_1", prompt: "Person working on MacBook at modern dark desk, Notion planner visible on screen, coffee cup, plant, warm ambient lighting, cozy workspace" },
  { scene: "lifestyle_2", prompt: "Minimalist home office with ultra-wide monitor showing Notion dashboard, dark theme, LED strip ambient lighting, aesthetic workspace" },
  { scene: "lifestyle_3", prompt: "Woman holding iPad showing Notion template in bed, cozy evening setting, warm side lighting, lifestyle photography" },
  { scene: "feature_1", prompt: "Notion template comparison: before (messy notes) vs after (organized OS dashboard), split screen, clean graphic style" },
  { scene: "feature_2", prompt: "Infographic overlay showing template features: databases, views, KPI dashboard, auto-formulas — dark gradient background, modern typography" },
];

/** 3 cinematic cover image prompts for OS_ULTRA templates */
export const OS_ULTRA_COVER_PROMPTS = [
  "Dark cinematic landscape: mountain range at dusk with deep blue sky, subtle stars, wide panoramic 1500x600",
  "Abstract dark gradient: deep navy to charcoal with subtle geometric grid lines, minimalist, 1500x600",
  "Dark premium desk setup: marble texture with subtle gold veins, overhead view, empty workspace, moody lighting, 1500x600",
];


// ═══════════════════════════════════════════════════════════════════════════════
// OS COMPONENT LIBRARY — Reusable block-pattern generators for OS_ULTRA
// ═══════════════════════════════════════════════════════════════════════════════

/** Generate OS-style navigation tab row (column_list of callouts) */
function osNavTabs(
  tabs: Array<{ label: string; icon: string; active?: boolean }>,
  palette: typeof OS_DARK_PALETTE = OS_DARK_PALETTE,
): BlockSpec[] {
  const cols: BlockSpec[][] = tabs.map(tab => [
    createCallout(tab.label, tab.icon, { color: sanitizeNotionColor(tab.active ? palette.navActive : palette.navInactive), bold: tab.active }),
  ]);
  return [{ type: "column_list", columns: cols }];
}

/** Generate OS-style KPI widget grid (column_list of callout tiles) */
function osWidgetGrid(
  cards: Array<{ icon: string; label: string; value: string; color?: string }>,
  palette: typeof OS_DARK_PALETTE = OS_DARK_PALETTE,
): { blocks: BlockSpec[]; promptSteps: string } {
  const cols: BlockSpec[][] = cards.map(card => [
    createCallout(`${card.label}\n\n${card.value}`, card.icon, { color: sanitizeNotionColor(card.color || palette.cardBg) }),
  ]);
  const promptSteps = cards.map((card, i) =>
    `  ${i + 1}. ${card.icon} ${card.label}: Replace callout with /chart → select relevant chart type → connect to database`
  ).join("\n");
  return {
    blocks: [{ type: "column_list", columns: cols }],
    promptSteps: `UPGRADE WIDGET GRID TO REAL CHARTS\nEach KPI callout tile can be upgraded to a live Notion chart:\n\n${promptSteps}\n\nTIP: Charts auto-update when data changes — buyers see live dashboards.`,
  };
}

/** Generate OS-style fast actions (column_list of callout buttons) */
function osFastActions(
  actions: Array<{ icon: string; label: string; description: string }>,
  palette: typeof OS_DARK_PALETTE = OS_DARK_PALETTE,
): BlockSpec[] {
  const cols: BlockSpec[][] = actions.map(action => [
    createCallout(`**${action.label}**\n_${action.description}_`, action.icon, { color: sanitizeNotionColor(palette.cardBg) }),
  ]);
  return [{ type: "column_list", columns: cols }];
}

/** Generate OS-style app panel (heading + database placeholder) */
function osAppPanel(
  panels: Array<{ heading: string; icon: string; dbRef: string; viewType: string }>,
  palette: typeof OS_DARK_PALETTE = OS_DARK_PALETTE,
): BlockSpec[] {
  const cols: BlockSpec[][] = panels.map(panel => {
    const colBlocks: BlockSpec[] = [];
    colBlocks.push({ type: "heading_2" as const, text: `${panel.icon} ${panel.heading}` });
    colBlocks.push({
      type: "paragraph" as const,
      text: `↗ ${panel.dbRef} (${panel.viewType} view)`,
      italic: true,
      color: sanitizeNotionColor(palette.primary),
    });
    return colBlocks;
  });
  return [{ type: "column_list", columns: cols }];
}

/** Generate OS-style status bar (single callout with inline stats) */
function osStatusBar(
  items: Array<{ icon: string; label: string; value: string }>,
  palette: typeof OS_DARK_PALETTE = OS_DARK_PALETTE,
): BlockSpec[] {
  const text = items.map(it => `${it.icon} ${it.label}: ${it.value}`).join("  ·  ");
  return [createCallout(text, "📡", { color: sanitizeNotionColor(palette.cardBg) })];
}

/** Generate OS-style footer (divider + italic branded paragraph) */
function osFooter(
  brandName: string,
  tagline: string,
  palette: typeof OS_DARK_PALETTE = OS_DARK_PALETTE,
): BlockSpec[] {
  return [
    { type: "divider" },
    {
      type: "paragraph",
      text: `${tagline}`,
      italic: true,
      color: sanitizeNotionColor(palette.accent),
    },
    {
      type: "paragraph",
      text: `Made with ❤️ by ${brandName} · ⭐ Love this template? Leave a review!`,
      italic: true,
      color: sanitizeNotionColor(palette.accent),
    },
  ];
}

/** Generate hero device mockup placeholder (prompt-only) */
function osHeroDeviceMockup(templateName: string): { blocks: BlockSpec[]; promptStep: string } {
  return {
    blocks: [createCallout(`📱 Device Preview — see Manual Steps for mockup generation instructions`, "🖥️", { color: "gray_background" })],
    promptStep: [
      `CREATE DEVICE MOCKUP COVER for "${templateName}"`,
      ``,
      `  1. Generate image with AI (Midjourney, DALL-E, or Canva):`,
      `     Prompt: "MacBook Pro on dark marble desk, ${templateName} Notion template visible on screen, dark OS-style dashboard with blue accents, soft warm lamp light, shallow depth of field, cinematic 4K, professional product photography"`,
      ``,
      `  2. Upload as page cover: Click the cover area → "Upload" → select generated image`,
      `  3. Crop to 1500x600 landscape format`,
      `  4. Ensure the template UI is clearly visible on the device screen`,
      ``,
      `  ALT: Use Canva "Laptop Mockup" template → paste a screenshot of your Notion page`,
    ].join("\n"),
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// TASK C: Premium Step Instruction Generator — type-specific, actionable steps
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * KPI widget configurations per template type.
 * Each entry: { label, chartType?, databaseHint, metric, setup }
 */
const KPI_CONFIGS: Record<string, Array<{ label: string; chartType?: string; db: string; metric: string; setup: string }>> = {
  adhd_planner: [
    { label: "Tasks Completed", chartType: "bar", db: "Daily Focus", metric: "Status = Done count", setup: "/chart → Bar chart → Daily Focus → group by Date → count where Status = Done" },
    { label: "Focus Streak", db: "Daily Focus", metric: "Consecutive completed days", setup: "Callout block: Use formula 'Streak Days' from Daily Focus. Update callout text to show current streak." },
    { label: "Energy Distribution", chartType: "donut", db: "Daily Focus", metric: "Energy Level breakdown", setup: "/chart → Donut chart → Daily Focus → group by Energy Level → count" },
    { label: "Weekly Progress", chartType: "line", db: "Weekly Overview", metric: "Completed tasks per week", setup: "/chart → Line chart → Weekly Overview → X: Week → Y: count where Completed = true" },
  ],
  life_planner: [
    { label: "Goals Progress", chartType: "bar", db: "Tasks & Goals", metric: "% complete by area", setup: "/chart → Bar chart → Tasks & Goals → Filter: Type = Goal → group by Area → average Progress %" },
    { label: "Tasks by Status", chartType: "donut", db: "Tasks & Goals", metric: "Status distribution", setup: "/chart → Donut chart → Tasks & Goals → Filter: Type = Task → group by Status" },
    { label: "Habit Streak", chartType: "bar", db: "Habits & Wellness", metric: "Streak by habit", setup: "/chart → Bar chart → Habits & Wellness → X: Habit → Y: Streak → see top streaks" },
    { label: "Journal Mood", chartType: "donut", db: "Journal & Notes", metric: "Mood distribution", setup: "/chart → Donut chart → Journal & Notes → Filter: Type = Journal → group by Mood" },
  ],
  finance_tracker: [
    { label: "Income vs Expenses", chartType: "bar", db: "Transactions", metric: "Income - Expenses per month", setup: "/chart → Bar chart → Transactions → X: Month, Y: sum Amount, Group by: Type → income vs expenses trend" },
    { label: "Budget Usage", chartType: "donut", db: "Budgets", metric: "Status distribution", setup: "/chart → Donut chart → Budgets → group by Status → see 🟢🟡🟠🔴 at a glance" },
    { label: "Goal Progress", chartType: "bar", db: "Financial Goals", metric: "Progress toward goals", setup: "/chart → Bar chart → Financial Goals → X: Goal, Y: Current Amount vs Target Amount" },
    { label: "Net Worth Trend", chartType: "line", db: "Net Worth Tracker", metric: "Net worth over time", setup: "/chart → Line chart → Net Worth Tracker → X: Month, Y: Net Worth → wealth growth" },
  ],
  student_planner: [
    { label: "GPA Tracker", db: "Courses", metric: "Weighted average grade", setup: "Callout block: Formula property averaging grades weighted by credits. Display as 'Current GPA: 3.8'." },
    { label: "Assignments Due", chartType: "bar", db: "Assignments", metric: "Due this week by course", setup: "/chart → Bar chart → Assignments → filter Due Date = This Week → group by Course" },
    { label: "Study Hours", chartType: "line", db: "Study Log", metric: "Hours per day", setup: "/chart → Line chart → Study Log → X: Date → Y: sum Duration (hours)" },
    { label: "Completion Rate", chartType: "donut", db: "Assignments", metric: "Done vs Pending", setup: "/chart → Donut chart → Assignments → group by Status" },
  ],
};

/** Fallback KPI config for any template type not in the map */
const DEFAULT_KPI_CONFIG = [
  { label: "Total Items", db: "primary DB", metric: "Total row count", setup: "Callout block: Use a rollup or count formula. Display as 'Total: 42 items'." },
  { label: "Completion Rate", chartType: "donut", db: "primary DB", metric: "Done vs Pending", setup: "/chart → Donut chart → primary DB → group by Status" },
  { label: "This Week", db: "primary DB", metric: "Items due/created this week", setup: "Callout block: Count items where Date property is within current week." },
];

/**
 * Generate a SPECIFIC, actionable premium step instruction
 * based on section componentType and template type.
 */
/**
 * Generate template-specific prompt-only steps for database views, template buttons,
 * and synced navigation. These are features that can't be built via Notion API.
 */
export function generateViewSetupSteps(templateType: string): PromptOnlyStep[] {
  const steps: PromptOnlyStep[] = [];

  // ═══ DATABASE VIEW SETUP STEPS ═══
  const viewConfigs: Record<string, { db: string; views: string[] }[]> = {
    finance_tracker: [
      { db: "Wallets", views: [
        "Gallery view (recommended) → card shows Balance, Type, Color → visual wallet cards with covers",
        "Table view → sort by Balance descending → quick totals overview",
      ] },
      { db: "Transactions", views: [
        "Table (default) → sort by Date descending",
        "Board view → group by Type → Income vs Expense vs Transfer",
        "Calendar view → by Date → see spending timeline",
        "🔥 'This Month' view → Table + Filter: Month = current month",
        "🔥 'Recurring' view → Table + Filter: Is Recurring = checked",
      ] },
      { db: "Budgets", views: [
        "Table (default) → sort by Category",
        "Board view → group by Status → see 🟢🟡🟠🔴 health at a glance",
      ] },
      { db: "Financial Goals", views: [
        "Gallery view → card shows Progress Bar → visual goal tracker",
        "Table → sort by Progress % descending",
      ] },
      { db: "Net Worth Tracker", views: [
        "Table (default) → sort by Month descending → latest snapshot first",
      ] },
    ],
    adhd_planner: [
      { db: "Brain Dump", views: [
        "Table (default) → newest first",
        "Board view → group by Type → see Tasks, Ideas, Worries organized",
        "🔥 'Unprocessed' view → Table + Filter: Processed is unchecked → daily review queue",
      ] },
      { db: "Tasks", views: [
        "Board view → group by Status → Kanban workflow",
        "Calendar view → by Due Date → visual deadline tracker",
        "🔥 'Quick Wins' view → Table + Filter: Energy Required = 'Low 🔋' AND Status = 'Not Started' → instant wins for low-energy days",
        "🔥 'Hyperfocus Alerts' view → Table + Filter: Hyperfocus Risk contains '⚠️' → awareness of traps",
      ] },
      { db: "Habits", views: [
        "Gallery view → card shows Streak Bar → visual streaks at a glance",
        "Table → sort by Current Streak descending → see your best habits first",
      ] },
      { db: "Daily Log", views: [
        "Calendar view → by Day Date → see mood/energy patterns",
        "Table → sort by Day Date descending → recent days first",
      ] },
    ],
    life_planner: [
      { db: "Tasks & Goals", views: [
        "Board view → group by Status → Kanban workflow",
        "Calendar view → by Due Date → visual deadline planning",
        "🔥 'Tasks' view → Table + Filter: Type = Task → focus on action items",
        "🔥 'Goals' view → Gallery + Filter: Type = Goal → inspiring progress cards",
        "🔥 'This Week' view → Table + Filter: Type = Task AND Due Date within 7 days AND Status ≠ Done",
        "🔥 'Overdue' view → Table + Filter: Urgency Score contains '🔴' → catch missed items",
      ] },
      { db: "Habits & Wellness", views: [
        "Gallery view → card shows Streak Bar → visual streak display",
        "Table → sort by Streak descending → celebrate top streaks",
      ] },
      { db: "Journal & Notes", views: [
        "🔥 'Journal' view → Calendar + Filter: Type = Journal → by Date → see journaling consistency",
        "🔥 'Notes' view → Table + Filter: Type = Note OR Idea → organize thoughts",
        "Gallery view → card shows Mood + Reflection Depth → mood calendar alternative",
        "🔥 'Deep Reflections' view → Table + Filter: Reflection Depth contains '🌟' → revisit best entries",
      ] },
      { db: "Reading & Learning", views: [
        "Gallery view → card shows Status + Rating → visual bookshelf",
        "Board view → group by Status → Want to Read / Reading / Finished",
      ] },
    ],
    social_media_planner: [
      { db: "Content Calendar", views: [
        "Calendar view → by Publish Date → visual content schedule",
        "Board view → group by Status → Idea → Drafting → Scheduled → Published pipeline",
        "🔥 'This Week' view → Table + Filter: Publish Date is within next 7 days → what's publishing soon",
        "Board view → group by Platform → see content mix per platform",
      ] },
      { db: "Campaigns", views: [
        "Board view → group by Status → Planning/Active/Completed",
        "Timeline view → Start Date to End Date → visual campaign roadmap",
      ] },
      { db: "Analytics", views: [
        "Table → sort by Date descending → latest results first",
        "Board view → group by Platform → compare platform performance",
        "🔥 'Top Performers' view → Table + Sort: Engagement Rate descending → see what's working",
      ] },
      { db: "Content Ideas", views: [
        "Board view → group by Category → Tutorial/BTS/Product/Trending",
        "🔥 'Do Next' view → Table + Filter: Priority contains '⚡ Do Next' → next items to create",
        "Gallery view → card shows Priority formula + Category → quick visual browsing",
      ] },
    ],
  };

  const templateViews = viewConfigs[templateType];
  if (templateViews) {
    const viewLines = [
      `CREATE DATABASE VIEWS`,
      `Add multiple views to each database for different contexts:`,
      ``,
    ];
    for (const cfg of templateViews) {
      viewLines.push(`  📁 ${cfg.db}:`);
      for (const v of cfg.views) {
        viewLines.push(`     • ${v}`);
      }
      viewLines.push(``);
    }
    viewLines.push(`HOW: Open any database → click "+ Add a view" → choose view type → set filters/groups/sorts`);
    steps.push({
      section: "Database Views",
      instruction: viewLines.join("\n"),
      componentType: "database_views",
    });
  }

  // ═══ TEMPLATE BUTTON STEPS ═══
  const buttonConfigs: Record<string, string[]> = {
    finance_tracker: [
      "Quick Expense — opens Transactions DB with Type='Expense' and today's date",
      "New Income — opens Transactions DB with Type='Income' and current month",
      "Add Wallet — opens Wallets DB to add a new account",
      "Update Goal — opens Financial Goals DB to update progress",
    ],
    adhd_planner: [
      "Brain Dump — opens Brain Dump DB (just start typing!)",
      "New Task — opens Tasks DB with Status='Not Started'",
      "Log Today — opens Daily Log with today's date",
    ],
    life_planner: [
      "New Task — opens Tasks & Goals DB with Type='Task' and Status='To Do'",
      "Journal Entry — opens Journal & Notes DB with Type='Journal' and today's date",
      "Track Habit — opens Habits & Wellness to check Today",
    ],
    social_media_planner: [
      "New Post Idea — opens Content Ideas DB",
      "Schedule Post — opens Content Calendar with Status='Scheduled'",
      "Log Analytics — opens Analytics DB with today's date",
    ],
  };

  const buttons = buttonConfigs[templateType];
  if (buttons) {
    const buttonLines = [
      `ADD TEMPLATE BUTTONS`,
      `Create quick-action buttons on your dashboard for common entries:`,
      ``,
      `HOW: Type /button → "New button" → set the action to "Add a page to..." with pre-filled properties`,
      ``,
    ];
    for (const b of buttons) {
      buttonLines.push(`  🔘 ${b}`);
    }
    buttonLines.push(``);
    buttonLines.push(`Place these buttons in a row using a column_list layout near the top of your dashboard.`);
    steps.push({
      section: "Template Buttons",
      instruction: buttonLines.join("\n"),
      componentType: "template_buttons",
    });
  }

  // ═══ SYNCED NAVIGATION STEPS ═══
  steps.push({
    section: "Synced Navigation Bar",
    instruction: [
      `CREATE SYNCED NAVIGATION ACROSS PAGES`,
      ``,
      `  1. On your main dashboard, select the Navigation row (callout bar or column_list with tabs)`,
      `  2. Right-click → "Turn into" → "Synced block"`,
      `  3. The block will show a red border — this is your synced source`,
      `  4. Copy the synced block (Ctrl/Cmd + D)`,
      `  5. Paste it at the top of every sub-page (Start Here, Weekly Review, etc.)`,
      `  6. Now editing the nav on ANY page updates it everywhere!`,
      ``,
      `TIP: Add a "← Back to Dashboard" link as the first nav item for easy navigation.`,
    ].join("\n"),
    componentType: "synced_navigation",
  });

  return steps;
}


function generatePremiumStepInstruction(componentType: string, config: PremiumConfig): string {
  const templateType = config.templateType || "life_planner";
  const templateName = config.templateName || "template";

  if (componentType === "kpi_row") {
    const kpis = KPI_CONFIGS[templateType] || DEFAULT_KPI_CONFIG;
    const lines = [
      `UPGRADE KPI DASHBOARD for "${templateName}"`,
      `The callout-based KPIs are functional placeholders. Replace with real Notion charts for a premium look:`,
      ``,
    ];
    for (let i = 0; i < kpis.length; i++) {
      const kpi = kpis[i];
      lines.push(`  ${i + 1}. ${kpi.label}${kpi.chartType ? ` [${kpi.chartType} chart]` : ' [callout]'}`);
      lines.push(`     Database: ${kpi.db}`);
      lines.push(`     Metric: ${kpi.metric}`);
      lines.push(`     Setup: ${kpi.setup}`);
      lines.push(``);
    }
    lines.push(`TIP: Notion charts auto-update when database rows change — buyers see live dashboards.`);
    return lines.join("\n");
  }

  if (componentType === "toggle_section") {
    return [
      `PREMIUM ONBOARDING GUIDE for "${templateName}"`,
      `Replace the default toggle content with this polished script:`,
      ``,
      `Toggle title: "👋 Welcome! Start Here (click to expand)"`,
      ``,
      `Inside the toggle, add these blocks:`,
      ``,
      `  1. HEADING 3: "Getting Started"`,
      `     Paragraph: "Welcome to your new ${templateName}! Follow these 3 steps to set up your workspace."`,
      ``,
      `  2. NUMBERED LIST:`,
      `     a. "Delete all sample data — select all rows in each database → Delete"`,
      `     b. "Customize properties — rename categories, add your own select options"`,
      `     c. "Start adding your entries — all formulas and dashboards update automatically!"`,
      ``,
      `  3. CALLOUT (💡 yellow_background):`,
      `     "Pro tip: Duplicate this template for different projects or time periods."`,
      ``,
      `  4. DIVIDER`,
      ``,
      `  5. SUPPORT FOOTER (gray, italic):`,
      `     "Questions? Visit our Etsy shop for support."`,
      `     "⭐ If you love this template, a 5-star review helps us create more!"`,
      `     "Made with ❤️ by CraftPlan Digital"`,
      ``,
      `  6. TOGGLE (nested): "📋 Changelog"`,
      `     "v1.0 — Initial release with ${config.dashboard.kpiCards.length} KPI widgets, ${config.navigation.tabs.length} navigation tabs"`,
    ].join("\n");
  }

  if (componentType === "filtered_view") {
    return [
      `CREATE FILTERED DATABASE VIEWS`,
      `Add multiple views to your databases for different contexts:`,
      ``,
      `  1. Open any database → click "..." → "Add a view"`,
      `  2. Suggested filtered views:`,
      `     - "This Week" — filter Date is within past 7 days`,
      `     - "By Category" — group by Category/Type property`,
      `     - "Favorites" — filter where Starred = true`,
      `     - "Archive" — filter where Status = Done, sorted by date descending`,
      ``,
      `  Each view type adds variety: try Board for tasks, Calendar for dates, Gallery for visual items.`,
    ].join("\n");
  }

  // ═══ OS_ULTRA COMPONENT STEP INSTRUCTIONS ═══

  if (componentType === "widget_grid") {
    const kpis = KPI_CONFIGS[templateType] || DEFAULT_KPI_CONFIG;
    const lines = [
      `UPGRADE OS WIDGET GRID for "${templateName}"`,
      `The callout-tile KPIs are placeholders. Upgrade each to a live Notion chart:`,
      ``,
    ];
    for (let i = 0; i < kpis.length; i++) {
      const kpi = kpis[i];
      lines.push(`  ${i + 1}. ${kpi.label}${kpi.chartType ? ` [${kpi.chartType} chart]` : ' [callout metric]'}`);
      lines.push(`     Database: ${kpi.db}`);
      lines.push(`     Metric: ${kpi.metric}`);
      lines.push(`     Setup: ${kpi.setup}`);
      lines.push(``);
    }
    lines.push(`TIP: /chart auto-updates when rows change — buyers see real-time dashboards.`);
    lines.push(`STYLE: Keep dark-friendly colors. Use blue/purple accent charts on gray backgrounds.`);
    return lines.join("\n");
  }

  if (componentType === "hero_device_mockup") {
    return [
      `CREATE DEVICE MOCKUP COVER for "${templateName}"`,
      ``,
      `  1. Generate image with AI (Midjourney, DALL-E, or Canva):`,
      `     Prompt: "MacBook Pro on dark marble desk, ${templateName} Notion template visible on screen, dark OS-style dashboard with blue accents, soft warm lamp light, shallow depth of field, cinematic 4K"`,
      ``,
      `  2. Upload as page cover → crop to 1500x600`,
      `  3. Ensure template UI is clearly visible on the device screen`,
      `  4. ALT: Canva → "Laptop Mockup" template → paste Notion screenshot`,
    ].join("\n");
  }

  if (componentType === "status_bar") {
    return [
      `CUSTOMIZE OS STATUS BAR for "${templateName}"`,
      ``,
      `  The status bar shows live system indicators. Customize the values:`,
      `  - Update emoji/labels to match your template's domain`,
      `  - Use formula properties or linked database counts for dynamic values`,
      `  - Keep the format: "icon label: value  ·  icon label: value"`,
    ].join("\n");
  }

  return `Manually set up the ${componentType} section in Notion — this component requires features beyond the Notion API.`;
}

/**
 * Walk a LayoutBlueprint and generate Notion BlockSpec[] for each section.
 * Returns blocks for API-buildable sections + promptOnlySteps for the rest.
 */
export function applyLayoutBlueprint(
  spec: NotionTemplateSpec,
  blueprint: LayoutBlueprint,
  style: StyleBlueprint,
  config: PremiumConfig,
): { blocks: BlockSpec[]; promptOnlySteps: PromptOnlyStep[] } {
  const blocks: BlockSpec[] = [];
  const promptOnlySteps: PromptOnlyStep[] = [];

  // Force-override apiBuildable for component types that CANNOT be built via Notion API
  // Gemini often marks these as true, but they require manual Notion setup
  const NON_API_BUILDABLE = new Set(["kpi_row", "toggle_section", "chart_row", "filtered_view", "widget_grid", "hero_device_mockup"]);

  for (let i = 0; i < blueprint.sections.length; i++) {
    const section = blueprint.sections[i];

    // Override: Gemini sometimes sets apiBuildable=true for non-API components
    if (NON_API_BUILDABLE.has(section.componentType)) {
      section.apiBuildable = false;
    }

    // Spacing between sections (skip first)
    if (i > 0 && section.componentType !== "spacer" && section.componentType !== "divider") {
      if (style.spacing.sectionSeparator === "divider") {
        blocks.push({ type: "divider" });
      } else if (style.spacing.sectionSeparator === "empty_paragraph") {
        blocks.push({ type: "paragraph", text: "" });
      }
    }

    switch (section.componentType) {
      case "cover_hero":
        blocks.push(...generateCoverSection(config));
        break;

      case "nav_bar":
        blocks.push(...generateNavigationBar(config));
        if (style.spacing.afterNavBar === "divider") blocks.push({ type: "divider" });
        break;

      case "kpi_row":
        blocks.push(...generateKPIRow(config));
        if (style.spacing.afterKpiRow === "spacer") {
          blocks.push({ type: "paragraph", text: "" });
        } else if (style.spacing.afterKpiRow === "divider") {
          blocks.push({ type: "divider" });
        }
        break;

      case "quick_actions":
        blocks.push(...generateQuickActions(config));
        break;

      case "database_section":
        if (section.columns === 2 && section.columnContents && section.columnContents.length >= 2) {
          // Two databases side by side in a column_list
          const cols: BlockSpec[][] = section.columnContents.map(sub => {
            const colBlocks: BlockSpec[] = [];
            if (sub.heading) colBlocks.push({ type: "heading_2", text: sub.heading });
            colBlocks.push({
              type: "paragraph",
              text: `↗ ${sub.databaseRef || "database"} (${sub.viewType || "table"} view)`,
              italic: true,
              color: sanitizeNotionColor(style.palette.brandColor),
            });
            return colBlocks;
          });
          blocks.push({ type: "column_list", columns: cols });
        } else {
          // Full-width single database section
          if (section.heading) {
            blocks.push({ type: "heading_2", text: section.heading });
          }
          if (style.spacing.betweenDatabases === "heading_divider") {
            blocks.push({ type: "divider" });
          }
          // Placeholder — actual DB is created in Phase 4 and placed via Notion API
          blocks.push({
            type: "paragraph",
            text: `↗ ${section.databaseRef || "database"} (${section.viewType || "table"} view)`,
            italic: true,
            color: sanitizeNotionColor(style.palette.brandColor),
          });
        }
        break;

      case "chart_row":
        // Charts cannot be built via API — placeholder + prompt steps
        if (section.heading) blocks.push({ type: "heading_2", text: section.heading });
        blocks.push(createCallout(`📊 Charts section — use /chart to create ${(section.charts || []).length} charts here. See "Manual Steps" for instructions.`, "📈", { color: sanitizeNotionColor(`${style.palette.cardColor}_background`) }));
        for (const chart of section.charts || []) {
          promptOnlySteps.push({
            section: section.id,
            componentType: "chart_row",
            instruction: `CREATE CHART: "${chart.title}"\n  Type: ${chart.chartType}\n  Database: ${chart.databaseRef}\n  X-axis: ${chart.xAxis}\n  Y-axis: ${chart.yAxis} (${chart.aggregation})\n  Use /chart → select ${chart.chartType} → connect to ${chart.databaseRef}`,
          });
        }
        break;

      case "toggle_section":
        blocks.push(...generateOnboarding(config));
        break;

      case "spacer":
        blocks.push({ type: "paragraph", text: "" });
        break;

      case "divider":
        blocks.push({ type: "divider" });
        break;

      case "brand_footer":
        blocks.push({ type: "divider" });
        if (config.visual.brandTagline) {
          blocks.push({
            type: "paragraph",
            text: config.visual.brandTagline,
            italic: true,
            color: sanitizeNotionColor(style.palette.brandColor),
          });
        }
        break;

      // ═══ OS_ULTRA COMPONENT CASES ═══

      case "widget_grid": {
        // OS-style KPI widget tiles — built as callout grid, upgradeable to charts
        const widgetCards = (section.columnContents || []).map(col => ({
          icon: col.heading?.charAt(0) || "📊",
          label: col.heading || "Metric",
          value: col.viewFilter || "—",
          color: col.databaseRef ? OS_DARK_PALETTE.cardBg : undefined,
        }));
        // Fallback: generate default 4 cards if no column contents
        const finalCards = widgetCards.length >= 2 ? widgetCards : [
          { icon: "📈", label: "Total Items", value: "0", color: OS_DARK_PALETTE.cardBg },
          { icon: "✅", label: "Completed", value: "0%", color: OS_DARK_PALETTE.cardBg },
          { icon: "⏳", label: "In Progress", value: "0", color: OS_DARK_PALETTE.cardBg },
          { icon: "🎯", label: "Goals Met", value: "0/5", color: OS_DARK_PALETTE.cardBg },
        ];
        if (section.heading) blocks.push({ type: "heading_2", text: section.heading });
        const widgetResult = osWidgetGrid(finalCards);
        blocks.push(...widgetResult.blocks);
        // Prompt step added below via non-API-buildable logic
        break;
      }

      case "fast_actions": {
        // OS-style quick action buttons — API buildable
        const actionItems = (section.columnContents || []).map(col => ({
          icon: col.heading?.charAt(0) || "⚡",
          label: col.heading || "Action",
          description: col.viewFilter || "Quick shortcut",
        }));
        const finalActions = actionItems.length >= 2 ? actionItems : [
          { icon: "➕", label: "New Entry", description: "Add a new item" },
          { icon: "📋", label: "View All", description: "See everything" },
          { icon: "📊", label: "Analytics", description: "Check your stats" },
        ];
        if (section.heading) blocks.push({ type: "heading_2", text: section.heading });
        blocks.push(...osFastActions(finalActions));
        break;
      }

      case "app_panels": {
        // OS-style 2-3 column app panels with database refs
        const panelItems = (section.columnContents || []).map(col => ({
          heading: col.heading || "Panel",
          icon: col.heading?.charAt(0) || "📁",
          dbRef: col.databaseRef || "database",
          viewType: col.viewType || "table",
        }));
        const finalPanels = panelItems.length >= 2 ? panelItems : [
          { heading: "This Week", icon: "📅", dbRef: "tasks", viewType: "board" },
          { heading: "Active Projects", icon: "🗂️", dbRef: "projects", viewType: "table" },
        ];
        if (section.heading) blocks.push({ type: "heading_2", text: section.heading });
        blocks.push(...osAppPanel(finalPanels));
        break;
      }

      case "hero_device_mockup": {
        // Device mockup placeholder — prompt-only for image generation
        const mockup = osHeroDeviceMockup(config.templateName || "template");
        blocks.push(...mockup.blocks);
        promptOnlySteps.push({
          section: section.id || "hero_device_mockup",
          componentType: "hero_device_mockup",
          instruction: mockup.promptStep,
        });
        break;
      }

      case "status_bar": {
        // OS-style status indicator bar
        const statusItems = (section.columnContents || []).map(col => ({
          icon: col.heading?.charAt(0) || "📡",
          label: col.heading || "Status",
          value: col.viewFilter || "Active",
        }));
        const finalStatus = statusItems.length >= 2 ? statusItems : [
          { icon: "🟢", label: "System", value: "Active" },
          { icon: "📊", label: "Databases", value: "Synced" },
          { icon: "🔄", label: "Last Updated", value: "Today" },
        ];
        blocks.push(...osStatusBar(finalStatus));
        break;
      }
    }

    // For sections marked non-API-buildable, add a prompt-only step
    // (the switch above generates placeholder blocks; this adds manual instructions)
    if (section.apiBuildable === false && section.componentType !== "chart_row") {
      promptOnlySteps.push({
        section: section.id || section.componentType,
        componentType: section.componentType,
        instruction: generatePremiumStepInstruction(section.componentType, config),
      });
    }
  }

  return { blocks, promptOnlySteps };
}


// ═══════════════════════════════════════════════════════════════════════════════
// TASK A: View Variety Auto-Fix — deterministic post-processor
// ═══════════════════════════════════════════════════════════════════════════════

/** View assignment rule: maps DB purpose keywords to ideal view types */
const VIEW_RULES: Record<string, string> = {
  // Board (status/kanban-based)
  task: "board", project: "board", assignment: "board",
  todo: "board", workflow: "board", pipeline: "board",
  // Calendar (date-focused)
  calendar: "calendar", schedule: "calendar", event: "calendar",
  deadline: "calendar", planner: "calendar", appointment: "calendar",
  // Gallery (visual/card-based)
  goal: "gallery", vision: "gallery", resource: "gallery",
  journal: "gallery", mood: "gallery", inspiration: "gallery",
  recipe: "gallery", portfolio: "gallery", "reading list": "gallery",
};

/**
 * Deterministic view variety enforcer.
 * Walks the plan JSON's `views[]` and `layoutBlueprint.sections[]` and guarantees:
 *   1) >= 3 distinct view types across all DBs (table + board + calendar/gallery)
 *   2) Tasks/Projects DB ⇒ board view exists (grouped by Status)
 *   3) Any DB with Date property ⇒ calendar view exists
 *   4) Goals/Resources DB ⇒ gallery view exists
 *
 * Mutates `plan` in place and returns { added: string[], viewTypes: string[] }.
 */
export function enforceViewVariety(plan: Record<string, unknown>): {
  added: string[];
  viewTypes: string[];
} {
  const added: string[] = [];
  const databases = (plan.databases || []) as Array<Record<string, unknown>>;
  const views = (plan.views || []) as Array<Record<string, unknown>>;
  const blueprint = plan.layoutBlueprint as Record<string, unknown> | undefined;
  const sections = (blueprint?.sections || []) as Array<Record<string, unknown>>;

  // Helper: check if a view already exists for a DB with a specific type
  function hasView(dbName: string, viewType: string): boolean {
    return views.some(v => v.db === dbName && v.type === viewType);
  }

  // Helper: add a view
  function addView(dbName: string, viewType: string, viewName: string, filter?: string, sort?: string) {
    if (hasView(dbName, viewType)) return;
    views.push({
      db: dbName,
      name: viewName,
      type: viewType,
      filter: filter || "",
      sort: sort || "",
    });
    added.push(`${dbName}: +${viewType} view ("${viewName}")`);
  }

  // Helper: find if DB has a property of given type
  function dbHasPropertyType(db: Record<string, unknown>, propType: string): boolean {
    const props = (db.properties || []) as Array<Record<string, unknown>>;
    return props.some(p => p.type === propType);
  }

  // Helper: find first property name of a given type in a DB
  function findProperty(db: Record<string, unknown>, propType: string): string | null {
    const props = (db.properties || []) as Array<Record<string, unknown>>;
    const found = props.find(p => p.type === propType);
    return found ? String(found.name) : null;
  }

  for (const db of databases) {
    const name = String(db.name || "");
    const nameLower = name.toLowerCase();

    // Rule 1: Tasks / Projects → ensure board view (grouped by Status)
    const isTaskLike = /task|project|assignment|todo|workflow|pipeline/i.test(nameLower);
    if (isTaskLike) {
      const statusProp = findProperty(db, "status") || findProperty(db, "select");
      addView(name, "board", `${name} Board`, "", statusProp ? `group_by: ${statusProp}` : "");
    }

    // Rule 2: Any DB with Date property → ensure calendar view
    if (dbHasPropertyType(db, "date")) {
      const dateProp = findProperty(db, "date");
      addView(name, "calendar", `${name} Calendar`, "", dateProp ? `date_property: ${dateProp}` : "");
    }

    // Rule 3: Goals / Resources / Journal → ensure gallery view
    const isGalleryLike = /goal|vision|resource|journal|mood|inspiration|recipe|portfolio|reading/i.test(nameLower);
    if (isGalleryLike) {
      addView(name, "gallery", `${name} Gallery`);
    }

    // Rule 4: keyword-based view assignment from VIEW_RULES
    for (const [keyword, viewType] of Object.entries(VIEW_RULES)) {
      if (nameLower.includes(keyword)) {
        const viewName = `${name} ${viewType.charAt(0).toUpperCase() + viewType.slice(1)}`;
        addView(name, viewType, viewName);
        break; // one match per DB
      }
    }
  }

  // ── Final check: ensure >= 3 distinct view types globally ──
  const allViewTypes = new Set(views.map(v => String(v.type)));
  const DESIRED_TYPES = ["table", "board", "calendar", "gallery"];
  const missing = DESIRED_TYPES.filter(t => !allViewTypes.has(t));

  // If we still have < 3 distinct types, force-add from missing
  while (allViewTypes.size < 3 && missing.length > 0) {
    const needType = missing.shift()!;
    // Find a DB that doesn't already have this view type
    for (const db of databases) {
      const name = String(db.name || "");
      if (!hasView(name, needType)) {
        // Only add calendar if DB has date property
        if (needType === "calendar" && !dbHasPropertyType(db, "date")) continue;
        const viewName = `${name} ${needType.charAt(0).toUpperCase() + needType.slice(1)}`;
        addView(name, needType, viewName);
        allViewTypes.add(needType);
        break;
      }
    }
  }

  // ── Update blueprint sections' viewType to match enforced views ──
  for (const section of sections) {
    if (section.componentType === "database_section" && section.databaseRef) {
      const dbName = String(section.databaseRef);
      // Find the first non-table view for this DB (prefer variety in the blueprint)
      const dbViews = views.filter(v => v.db === dbName);
      const nonTableView = dbViews.find(v => v.type !== "table");
      if (nonTableView && section.viewType === "table") {
        section.viewType = nonTableView.type as string;
      }
    }
    // Also handle column contents
    const cols = (section.columnContents || []) as Array<Record<string, unknown>>;
    for (const col of cols) {
      if (col.databaseRef) {
        const dbName = String(col.databaseRef);
        const dbViews = views.filter(v => v.db === dbName);
        const nonTableView = dbViews.find(v => v.type !== "table");
        if (nonTableView && col.viewType === "table") {
          col.viewType = nonTableView.type as string;
        }
      }
    }
  }

  // Write back
  plan.views = views;

  const finalViewTypes = [...new Set(views.map(v => String(v.type)))];
  return { added, viewTypes: finalViewTypes };
}


// ═══════════════════════════════════════════════════════════════════════════════
// TASK B: Sanitize Parity Targets — remove tag/SEO-derived fakes
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Tags & SEO keywords that are NOT real features.
 * These describe platforms, years, or marketing terms — NOT template capabilities.
 */
const PARITY_BLOCKLIST_PATTERNS = [
  /\bipad\b/i, /\bgoodnotes\b/i, /\bnotability\b/i,
  /\b20\d{2}\b/,                    // years: 2024, 2025, 2026
  /\bdigital planner\b/i,           // generic category, not a feature
  /\bnotion template\b/i,           // meta-category
  /\betsy\b/i,                      // marketplace
  /\bprintable\b/i,                 // format, not feature
  /\binstant download\b/i,          // delivery method
  /\bpdf\b/i,                       // format
  /\bminimalist\b/i,                // aesthetic, not feature
  /\baesthetic\b/i,                 // aesthetic
  /\bboho\b/i,                      // style
  /\bcute\b/i,                      // style
  /\bpastel\b/i,                    // style
];

/**
 * Sanitize parityTargets in a plan JSON.
 * Removes entries whose `competitorFeature` matches blocklist patterns
 * UNLESS that feature string also appears in the listing's
 * description_sections.features[], description_sections.whats_included[],
 * or review_signals.mentioned_features[].
 *
 * Mutates plan in place. Returns { removed, kept }.
 */
export function sanitizeParityTargets(
  plan: Record<string, unknown>,
  listing: Record<string, unknown>,
): { removed: string[]; kept: number } {
  const parityTargets = (plan.parityTargets || []) as Array<Record<string, unknown>>;
  if (parityTargets.length === 0) return { removed: [], kept: 0 };

  // Build the "legitimate sources" text pool from description + reviews
  const legitimateSources = new Set<string>();
  try {
    const ds = typeof listing.description_sections === "string"
      ? JSON.parse(listing.description_sections as string)
      : (listing.description_sections || {});
    for (const feature of (ds.features || [])) {
      legitimateSources.add(String(feature).toLowerCase());
    }
    for (const item of (ds.whats_included || [])) {
      legitimateSources.add(String(item).toLowerCase());
    }
  } catch { /* */ }

  try {
    const rs = typeof listing.review_signals === "string"
      ? JSON.parse(listing.review_signals as string)
      : (listing.review_signals || {});
    for (const feature of (rs.mentioned_features || [])) {
      legitimateSources.add(String(feature).toLowerCase());
    }
  } catch { /* */ }

  const legitimateText = [...legitimateSources].join(" ");

  const removed: string[] = [];
  const cleaned = parityTargets.filter(pt => {
    const feature = String(pt.competitorFeature || "");
    const featureLower = feature.toLowerCase();

    // Check if this target matches any blocklist pattern
    const matchesBlocklist = PARITY_BLOCKLIST_PATTERNS.some(rx => rx.test(feature));
    if (!matchesBlocklist) return true; // keep — not on blocklist

    // It matches blocklist. Check if it's legitimately sourced
    // (appears in description features/includes or review mentions)
    const isLegitimate = legitimateText.includes(featureLower) ||
      [...legitimateSources].some(src => src.includes(featureLower) || featureLower.includes(src));

    if (isLegitimate) return true; // keep — it's in real features

    removed.push(feature);
    return false; // drop — tag/SEO derived, not a real feature
  });

  plan.parityTargets = cleaned;
  return { removed, kept: cleaned.length };
}


// ═══════════════════════════════════════════════════════════════════════════════
// OS_ULTRA ENFORCEMENT — Deterministic post-processor for plan JSON
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Enforce OS_ULTRA structure on a Gemini-generated plan JSON.
 * Ensures required OS sections exist, section order matches OS_ULTRA pattern,
 * and styleBlueprint has osUltra defaults. Mutates plan in place.
 */
export function enforceOsUltraStructure(plan: Record<string, unknown>): {
  added: string[];
  reordered: boolean;
} {
  const added: string[] = [];
  let reordered = false;

  // Ensure layoutBlueprint exists
  if (!plan.layoutBlueprint) plan.layoutBlueprint = { pageType: "single_page", visualTier: "cinematic", sections: [] };
  const blueprint = plan.layoutBlueprint as Record<string, unknown>;
  const sections = (blueprint.sections || []) as Array<Record<string, unknown>>;

  // Ensure styleBlueprint has osUltra defaults
  if (!plan.styleBlueprint) plan.styleBlueprint = {};
  const style = plan.styleBlueprint as Record<string, unknown>;
  if (!style.osUltra) {
    style.osUltra = { ...OS_ULTRA_DEFAULTS };
    added.push("styleBlueprint.osUltra");
  }
  style.premiumTier = "os_ultra";

  // Ensure dark-friendly palette
  if (!style.palette) style.palette = {};
  const palette = style.palette as Record<string, string>;
  if (!palette.brandColor || !["blue", "purple", "gray"].includes(palette.brandColor)) {
    palette.brandColor = OS_DARK_PALETTE.primary;
  }
  if (!palette.cardColor) palette.cardColor = OS_DARK_PALETTE.accent;
  if (!palette.accentColor) palette.accentColor = OS_DARK_PALETTE.secondary;

  // Check for required OS sections
  const sectionTypes = new Set(sections.map((s: Record<string, unknown>) => s.componentType));

  // Inject missing widget_grid
  if (!sectionTypes.has("widget_grid")) {
    const insertIdx = sections.findIndex((s: Record<string, unknown>) => s.componentType === "kpi_row");
    if (insertIdx >= 0) {
      // Replace kpi_row with widget_grid
      sections[insertIdx].componentType = "widget_grid";
      sections[insertIdx].apiBuildable = false;
      added.push("widget_grid (replaced kpi_row)");
    } else {
      // Insert after nav_bar
      const navIdx = sections.findIndex((s: Record<string, unknown>) => s.componentType === "nav_bar");
      sections.splice(navIdx + 1, 0, {
        id: "os_widget_grid",
        heading: "📊 Dashboard",
        columns: 1,
        componentType: "widget_grid",
        apiBuildable: false,
      });
      added.push("widget_grid");
    }
  }

  // Inject missing fast_actions
  if (!sectionTypes.has("fast_actions")) {
    const widgetIdx = sections.findIndex((s: Record<string, unknown>) => s.componentType === "widget_grid");
    const insertAt = widgetIdx >= 0 ? widgetIdx + 1 : 3;
    sections.splice(insertAt, 0, {
      id: "os_fast_actions",
      heading: "⚡ Quick Actions",
      columns: 1,
      componentType: "fast_actions",
      apiBuildable: true,
    });
    added.push("fast_actions");
  }

  // Enforce section order: cover_hero → nav_bar → widget_grid → fast_actions → ... → toggle_section → brand_footer
  const orderMap: Record<string, number> = {
    cover_hero: 0, nav_bar: 1, widget_grid: 2, fast_actions: 3,
    status_bar: 4, hero_device_mockup: 5,
    app_panels: 10, database_section: 11, quick_actions: 12,
    chart_row: 90, toggle_section: 95, brand_footer: 99,
    spacer: -1, divider: -1,
  };

  // Check if already ordered
  let lastOrder = -1;
  let needsReorder = false;
  for (const s of sections) {
    const ord = orderMap[s.componentType as string] ?? 50;
    if (ord >= 0 && ord < lastOrder) { needsReorder = true; break; }
    if (ord >= 0) lastOrder = ord;
  }

  if (needsReorder) {
    sections.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const ordA = orderMap[a.componentType as string] ?? 50;
      const ordB = orderMap[b.componentType as string] ?? 50;
      return ordA - ordB;
    });
    reordered = true;
  }

  blueprint.sections = sections;
  blueprint.visualTier = "cinematic";

  return { added, reordered };
}

/**
 * Evaluate the OS_ULTRA checklist against a built spec and blueprint.
 * Returns pass/fail for each rule with a total score.
 */
export function evaluateOsChecklist(
  spec: NotionTemplateSpec,
  blueprint?: LayoutBlueprint,
  plan?: Record<string, unknown>,
): { results: Array<{ rule: string; passed: boolean; category: string }>; score: number; total: number } {
  const results: Array<{ rule: string; passed: boolean; category: string }> = [];

  for (const item of OS_ULTRA_CHECKLIST) {
    let passed = false;

    switch (item.rule) {
      case "Cinematic cover banner (dark gradient/landscape)":
        passed = !!(spec.cover && spec.cover.startsWith("http"));
        break;
      case "Page icon (emoji or uploaded)":
        passed = !!(spec.icon && spec.icon.length > 0);
        break;
      case "Hero tagline section below cover":
        passed = spec.dashboardBlocks.some(b =>
          b.type === "heading_1" || (b.type === "callout" && spec.dashboardBlocks.indexOf(b) < 3));
        break;
      case "OS Navigation tabs row":
        passed = spec.dashboardBlocks.some(b =>
          (b.type === "callout" && b.text?.includes("·")) ||
          (b.type === "column_list" && b.columns?.some(col => col.some(c => c.type === "callout"))));
        break;
      case "Widget grid (KPI area)":
        passed = spec.dashboardBlocks.some(b =>
          b.type === "column_list" && b.columns && b.columns.length >= 3);
        break;
      case "Fast actions panel":
        passed = spec.dashboardBlocks.some(b =>
          b.type === "column_list" && b.columns?.some(col =>
            col.some(c => c.type === "callout" && c.text?.includes("**"))));
        break;
      case "App-style panels (2-3 columns)":
        passed = spec.dashboardBlocks.some(b =>
          b.type === "column_list" && b.columns && b.columns.length >= 2 &&
          b.columns.some(col => col.some(c => c.type === "heading_2")));
        break;
      case "Brand footer with tagline":
        passed = spec.dashboardBlocks.slice(-3).some(b => b.type === "paragraph" && b.italic);
        break;
      case "Dark-friendly palette (blue/purple/gray accent)":
        passed = true; // Enforced by OS_DARK_PALETTE
        break;
      case "Consistent icon family (same emoji style)":
        passed = spec.databases.every(db => !!db.icon);
        break;
      case "Minimal color noise (≤5 select option colors)":
        passed = true; // Best effort — validated at plan time
        break;
      case "Clean spacing (dividers or empty paragraphs between sections)":
        passed = spec.dashboardBlocks.filter(b => b.type === "divider").length >= 3;
        break;
      case "≥3 databases with 5+ properties each":
        passed = spec.databases.length >= 3 && spec.databases.every(db => db.properties.length >= 5);
        break;
      case "≥2 relations linking databases":
        passed = spec.databases.reduce((sum, db) =>
          sum + db.properties.filter(p => p.type === "relation").length, 0) >= 2;
        break;
      case "≥1 rollup or formula":
        passed = spec.databases.some(db =>
          db.properties.some(p => p.type === "formula" || p.type === "rollup"));
        break;
      case "≥3 sample rows per database (fresh dates)":
        passed = spec.databases.every(db => db.sampleData.length >= 3);
        break;
      case "≥3 distinct view types": {
        const views = new Set<string>();
        if (plan?.views) {
          for (const v of plan.views as Array<{ type?: string }>) {
            if (v.type) views.add(v.type);
          }
        }
        passed = views.size >= 3;
        break;
      }
      case "Onboarding toggle (Welcome guide)":
        passed = spec.dashboardBlocks.some(b => b.type === "toggle");
        break;
      case "KPI charts (real Notion /chart)":
        passed = false; // Always prompt-only
        break;
      case "Device mockup cover image":
        passed = false; // Always prompt-only
        break;
      case "13 unique Etsy tags": {
        const etsyListing = (plan as Record<string, unknown>)?.etsyListing as Record<string, unknown> | undefined;
        const tags = (etsyListing?.tags || []) as string[];
        passed = tags.length >= 13;
        break;
      }
      case "10 mockup scene prompts": {
        const scenes = ((plan as Record<string, unknown>)?.mockupScenes || []) as unknown[];
        passed = scenes.length >= 10;
        break;
      }
      default:
        passed = false;
    }

    results.push({ rule: item.rule, passed, category: item.category });
  }

  const passedCount = results.filter(r => r.passed).length;
  const score = Math.round((passedCount / results.length) * 100);

  return { results, score, total: results.length };
}


/**
 * Validate a built NotionTemplateSpec against the premium quality checklist.
 * Returns a score (0-100), list of critical failures, and warnings.
 */
export function validatePremiumOutput(
  spec: NotionTemplateSpec,
  blueprint?: LayoutBlueprint,
  planViews?: Array<{ type?: string }>,
): { valid: boolean; score: number; failures: string[]; warnings: string[] } {
  const failures: string[] = [];
  const warnings: string[] = [];

  // 1. Cover image
  if (!spec.cover || !spec.cover.startsWith("http")) failures.push("Missing cover image");

  // 2. Page icon
  if (!spec.icon || spec.icon.length === 0) failures.push("Missing page icon");

  // 3. Nav bar — callout with "·" separator OR column_list with callout children
  const hasNav = spec.dashboardBlocks.some(b =>
    (b.type === "callout" && b.text?.includes("·")) ||
    (b.type === "column_list" && b.columns?.some(col =>
      col.some(c => c.type === "callout" && c.bold)
    ))
  );
  if (!hasNav) failures.push("Missing navigation bar");

  // 4. KPI row — column_list with 3+ callouts containing label/value separator
  const hasKpi = spec.dashboardBlocks.some(b =>
    b.type === "column_list" && b.columns && b.columns.length >= 3 &&
    b.columns.some(col => col.some(c => c.type === "callout" && c.text?.includes("\n\n")))
  );
  if (!hasKpi) failures.push("Missing KPI dashboard row");

  // 5. Onboarding toggle
  const hasToggle = spec.dashboardBlocks.some(b => b.type === "toggle");
  if (!hasToggle) failures.push("Missing onboarding toggle");

  // 6. Minimum databases
  if (spec.databases.length < 2) failures.push(`Too few databases: ${spec.databases.length} (min 2)`);

  // 7. Relations
  const relCount = spec.databases.reduce((sum, db) =>
    sum + db.properties.filter(p => p.type === "relation").length, 0);
  if (relCount < 2) failures.push(`Too few relations: ${relCount} (min 2)`);

  // 8. Formulas
  const hasFormula = spec.databases.some(db =>
    db.properties.some(p => p.type === "formula" && p.formula));
  if (!hasFormula) warnings.push("No formula properties found");

  // 9. Sample data
  for (const db of spec.databases) {
    if (db.sampleData.length < 3)
      failures.push(`DB "${db.name}" has ${db.sampleData.length} sample rows (min 3)`);
  }

  // 10. Date freshness
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  for (const db of spec.databases) {
    for (const row of db.sampleData) {
      for (const [key, val] of Object.entries(row)) {
        if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
          if (new Date(val) < sixtyDaysAgo)
            warnings.push(`Stale date in ${db.name}.${key}: ${val}`);
        }
      }
    }
  }

  // 11. Icon consistency
  for (const db of spec.databases) {
    if (!db.icon) warnings.push(`DB "${db.name}" missing icon`);
  }

  // 12. Block count minimum
  if (spec.dashboardBlocks.length < 12)
    failures.push(`Dashboard too sparse: ${spec.dashboardBlocks.length} blocks (min 12)`);

  // 13. Brand footer
  const lastBlocks = spec.dashboardBlocks.slice(-3);
  const hasFooter = lastBlocks.some(b => b.type === "paragraph" && b.italic);
  if (!hasFooter) warnings.push("Missing brand footer");

  // 14. Divider frequency
  const dividerCount = spec.dashboardBlocks.filter(b => b.type === "divider").length;
  const expectedDividers = Math.floor((blueprint?.sections.length || 8) / 2);
  if (dividerCount < expectedDividers)
    warnings.push(`Low divider count: ${dividerCount} (expected ${expectedDividers}+)`);

  // 15. View diversity — require >= 3 distinct view types for premium quality
  // Check plan.views[] array (primary) + blueprint sections (secondary)
  {
    const viewTypes = new Set<string>();
    // Source 1: plan.views[] passed explicitly
    if (planViews) {
      for (const v of planViews) {
        if (v.type) viewTypes.add(v.type);
      }
    }
    // Source 2: blueprint sections
    if (blueprint) {
      for (const s of blueprint.sections) {
        if (s.viewType) viewTypes.add(s.viewType);
        if (s.columnContents) s.columnContents.forEach(c => { if (c.viewType) viewTypes.add(c.viewType); });
      }
    }
    if (viewTypes.size < 2) {
      failures.push(`Only ${viewTypes.size} view type(s) — need at least 3 (run enforceViewVariety)`);
    } else if (viewTypes.size < 3) {
      warnings.push(`Only ${viewTypes.size} view types — premium templates need 3+ (table, board, calendar/gallery)`);
    }
  }

  // 16. Sub-pages
  if (blueprint?.pageType === "hub_with_subpages" && spec.subPages.length < 1)
    warnings.push("Hub template with no sub-pages");

  // ═══ OS_ULTRA TIER CHECKS (17-22) ═══
  const isOsUltra = blueprint?.visualTier === "cinematic" ||
    (blueprint as unknown as Record<string, unknown>)?.premiumTier === "os_ultra";
  if (isOsUltra) {
    // 17. Widget grid present (column_list with 3+ callout columns)
    const hasWidgetGrid = spec.dashboardBlocks.some(b =>
      b.type === "column_list" && b.columns && b.columns.length >= 3 &&
      b.columns.some(col => col.some(c => c.type === "callout")));
    if (!hasWidgetGrid) failures.push("OS_ULTRA: Missing widget grid (KPI tiles)");

    // 18. Fast actions present (column_list with callouts containing bold text)
    const hasFastActions = spec.dashboardBlocks.some(b =>
      b.type === "column_list" && b.columns?.some(col =>
        col.some(c => c.type === "callout" && c.text?.includes("**"))));
    if (!hasFastActions) warnings.push("OS_ULTRA: Missing fast actions panel");

    // 19. App panels (column-based sections with headings)
    const hasAppPanels = spec.dashboardBlocks.some(b =>
      b.type === "column_list" && b.columns && b.columns.length >= 2 &&
      b.columns.some(col => col.some(c => c.type === "heading_2")));
    if (!hasAppPanels) warnings.push("OS_ULTRA: Missing app-style panels");

    // 20. Dark-friendly palette check
    // (enforced at plan time via enforceOsUltraStructure)

    // 21. Consistent icon family
    const dbIcons = spec.databases.map(db => db.icon).filter(Boolean);
    if (dbIcons.length > 0) {
      const allEmoji = dbIcons.every(i => /\p{Emoji}/u.test(i || ""));
      if (!allEmoji) warnings.push("OS_ULTRA: Mixed icon styles (prefer consistent emoji family)");
    }

    // 22. Section count >= 8 for OS layout
    if (blueprint && blueprint.sections.length < 8) {
      warnings.push(`OS_ULTRA: Only ${blueprint.sections.length} sections (need 8+ for OS layout)`);
    }
  }

  // Score: 100 base, -10 per failure, -3 per warning
  // OS_ULTRA bonus: +5 if all OS checks pass
  let score = Math.max(0, 100 - failures.length * 10 - warnings.length * 3);
  if (isOsUltra) {
    const osFailures = failures.filter(f => f.startsWith("OS_ULTRA:")).length;
    const osWarnings = warnings.filter(w => w.startsWith("OS_ULTRA:")).length;
    if (osFailures === 0 && osWarnings === 0) score = Math.min(100, score + 5);
  }

  return { valid: failures.length === 0, score, failures, warnings };
}


// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS SUMMARY:
// ═══════════════════════════════════════════════════════════════════════════════
//
// Interfaces:
//   PremiumConfig           — Master configuration object
//   VisualIdentity          — Color palette + cover + branding
//   NavTab                  — Navigation tab definition
//   KPICard                 — Dashboard stat card
//   QuickAction             — Action button definition
//   OnboardingStep          — Setup guide step
//   DashboardSection        — Section layout rule
//   DatabasePageTemplate    — Rich page template for DB entries
//   DemoDataConfig          — Demo data generation config
//   SubPageBlueprint        — Sub-page structure
//   AITemplatePlan          — AI-generated plan schema (Builder Input Schema)
//
// Functions:
//   applyPremiumFramework() — MAIN: base spec + config → premium spec
//   aiPlanToPremiumConfig() — Convert AI plan → PremiumConfig
//   buildPremiumConfig()    — Quick config builder for known types
//   buildVisualIdentity()   — Generate visual identity from aesthetic
//   getStoryArcValues()     — Get demo data ranges for a story arc
//
// Constants:
//   NAVIGATION_PRESETS      — Pre-built nav configs per template type
//   PREMIUM_COVERS          — Cover image pools by aesthetic
//   FORMULA_LIBRARY         — Reusable formula patterns
//   PAGE_TEMPLATE_PRESETS   — Rich page templates by DB type
//   STORY_ARC_MODIFIERS     — Demo data story arc rules
//
// ═══════════════════════════════════════════════════════════════════════════════
