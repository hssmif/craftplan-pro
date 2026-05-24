// ══════════════════════════════════════════════════════════════
// Gemini Visual Direction Generator
//
// Calls Gemini to generate a VisualDirectionSpec that controls
// ALL visual composition decisions. No hardcoded layouts.
//
// Each product gets a unique creative direction from Gemini.
// The renderer follows the spec, not fixed templates.
// ══════════════════════════════════════════════════════════════

import { callGeminiJSON, parseGeminiJSON } from "@/lib/gemini";
import { type VisualDirectionSpec, clampSpec } from "@/types/visual-direction";

interface VisualDirectionInput {
  niche: string;           // e.g. "baby_budget"
  nicheLabel: string;      // e.g. "Baby Budget Planner"
  productTitle: string;
  targetCustomer: string;
  tabNames: string[];
  colorScheme: { primary: string; secondary: string; accent: string };
}

function buildVisualDirectionPrompt(input: VisualDirectionInput): string {
  return `You are a creative director designing Etsy product listing images for a Google Sheets spreadsheet template.

PRODUCT: ${input.productTitle}
NICHE: ${input.nicheLabel}
TARGET CUSTOMER: ${input.targetCustomer}
TABS: ${input.tabNames.join(", ")}
BRAND COLORS: primary=${input.colorScheme.primary}, secondary=${input.colorScheme.secondary}, accent=${input.colorScheme.accent}

Your job: create a UNIQUE visual direction that makes this product feel like it was designed by a professional designer, not a template engine.

IMPORTANT RULES:
- Each niche should feel COMPLETELY different visually
- A wedding product should feel NOTHING like a business product
- Vary layouts, compositions, spacing, and visual weight dramatically
- Think like a designer browsing Pinterest for mood boards

NICHE PERSONALITY GUIDE:
- Wedding/Bridal → editorial, magazine-like, elegant serif fonts, spacious, ornamental dividers, cream/blush tones
- Baby/Family → soft, rounded, playful, warm pastels, generous whitespace, nurturing feel
- Business/P&L → dense, data-driven, dark backgrounds, bold KPIs, corporate confidence, minimal decoration
- Travel → open, airy, adventurous, bright accent colors, cinematic compositions
- Paycheck/Debt → clean, structured, motivational, progress-focused, approachable
- Fitness/Health → energetic, bold, high-contrast, dynamic angles

For this SPECIFIC product, generate a VisualDirectionSpec with these sections:

{
  "version": 1,
  "global": {
    "backgroundMode": "gradient" | "solid" | "split" | "radial",
    "gradientAngle": <0-360 degrees>,
    "gradientStops": ["<hex start>", "<hex end>"],
    "decorStyle": "circles" | "dots" | "lines" | "diamonds" | "none",
    "decorOpacity": <0.02 to 0.12>,
    "fontFamily": "sans" | "serif" | "mono",
    "density": "spacious" | "balanced" | "dense"
  },
  "hero": {
    "deviceLayout": "single-laptop" | "multi-device" | "flatlay" | "phone-pair" | "tablet-solo",
    "deviceRotation": <-15 to 15 degrees>,
    "titlePosition": "top-center" | "top-left" | "bottom-center" | "overlay",
    "titleScale": <0.7 to 1.4>,
    "pillsPosition": "bottom-row" | "left-column" | "hidden",
    "backgroundHint": "<short scene description for AI background generation>"
  },
  "problem": {
    "layout": "centered-text" | "split-columns" | "stacked-cards" | "diagonal" | "full-dark",
    "hookScale": <0.8 to 1.5>,
    "darkness": <0.0 to 1.0>,
    "showBullets": true/false,
    "bulletCount": <2 to 5>,
    "separator": "line" | "ornament" | "gradient" | "none",
    "gravity": "top" | "center" | "bottom"
  },
  "dashboard": {
    "kpiCount": <2 to 5>,
    "kpiLayout": "horizontal-strip" | "grid-2x2" | "vertical-stack" | "large-hero-plus-small",
    "showTable": true/false,
    "tableRows": <3 to 8>,
    "showViz": true/false,
    "vizType": "bars" | "progress-rings" | "sparklines" | "donut",
    "sections": ["kpis", "table", "viz", "goals"] (order matters),
    "layoutDensity": "spacious" | "balanced" | "dense" | "minimal",
    "blocks": [
      {
        "type": "<one of: kpi-cards | category-table | bar-chart | progress-tracker | insights | checklist | summary-stats | top-categories | goals-grid | monthly-comparison>",
        "title": "<section title, e.g. 'Monthly Expenses'>",
        "emoji": "<single emoji for the section header>",
        "style": "large" | "compact" | "minimal" | "visual-bars" | "horizontal" | "cards" | "checklist-style",
        "rowCount": <optional, 1-12, how many data rows>,
        "dataSource": "budgetCategories" | "savingsGoals" | "custom",
        "width": "full" | "left" | "right"
      }
    ]
  },

DASHBOARD BLOCKS RULES (CRITICAL — this controls the actual spreadsheet layout):
- blocks[] defines the EXACT structure of the Google Sheets dashboard. Each block = one visual section.
- You MUST include 3 to 7 blocks. The renderer builds the spreadsheet by iterating blocks top-to-bottom.
- First block should USUALLY be "kpi-cards" (the summary numbers at the top).
- Each niche MUST have a STRUCTURALLY DIFFERENT block sequence. Examples:
  * Business: kpi-cards(large) → bar-chart → category-table(dense,8 rows) → top-categories → insights — data-dense, analytical, lots of rows
  * Baby: kpi-cards(compact) → progress-tracker(4 goals) → category-table(5 rows) — simple, visual, spacious, fewer sections
  * Wedding: kpi-cards(large) → category-table → checklist → goals-grid → insights — elegant, grouped, checklist-oriented
  * Travel: kpi-cards(cards) → bar-chart → goals-grid → summary-stats — airy, progress-focused
  * Paycheck: kpi-cards(compact) → category-table → bar-chart → insights — balanced, motivational
- Use "large" style for KPIs when the niche is premium/professional (business, wedding)
- Use "compact" style for KPIs when the niche is approachable/simple (baby, paycheck)
- DO NOT give every niche the same blocks. The whole point is structural differentiation.
- "bar-chart" renders REPT-based horizontal bars comparing budget vs actual
- "progress-tracker" and "goals-grid" render savings/debt goals with visual █░ progress bars
- "top-categories" shows top N spending categories as highlight cards
- "insights" renders auto-generated formula-based text insights
  "feature": {
    "vizType": "progress-bars" | "comparison-table" | "stat-cards" | "checklist" | "timeline",
    "itemCount": <3 to 6>,
    "showHeroStat": true/false,
    "arrangement": "vertical" | "horizontal" | "grid" | "staggered"
  },
  "method": {
    "stepCount": <3 to 5>,
    "layout": "horizontal-cards" | "vertical-timeline" | "numbered-list" | "zigzag" | "icon-grid",
    "connector": "arrow" | "dotted" | "numbered" | "none",
    "cardShape": "rounded" | "circle" | "pill" | "square",
    "showIcons": true/false
  },
  "included": {
    "columns": <2 to 4>,
    "cardStyle": "bordered" | "filled" | "minimal" | "icon-left",
    "showCountBadge": true/false
  },
  "delivery": {
    "stepCount": <2 to 4>,
    "layout": "horizontal-flow" | "vertical-steps" | "icon-row",
    "badges": ["<trust badge 1>", "<trust badge 2>", ...],
    "showDeviceRow": true/false
  },
  "video": {
    "introStyle": "text-fade" | "zoom-reveal" | "slide-in" | "dramatic-dark",
    "scenePaceMs": <1000 to 4000>,
    "tabHighlights": ["<tab name 1>", "<tab name 2>", ...],
    "ctaText": "<call to action text>"
  },
  "imageSequence": [
    {
      "slot": 1,
      "kind": "<one of: thumbnail | problem | dashboard | feature | method | included | delivery | social-proof | comparison | detail-zoom | lifestyle | guarantee>",
      "title": "<primary overlay text for this image>",
      "subtitle": "<secondary text>",
      "sourceTabRole": "<which tab to screenshot — use role like 'dashboard', 'transactions', 'vendor-tracker', etc. Empty string if text-only>",
      "cropIntent": "full | kpi | table | section | chart",
      "narrativePurpose": "<WHY this image exists — what does the buyer learn/feel?>"
    }
    // ... 6 to 7 images total (optimal for Etsy conversion)
  ]
}

IMAGE SEQUENCE RULES:
- Generate 6 or 7 images. This is the sweet spot for Etsy conversion. Do NOT generate more than 7.
- Image 1 MUST be "thumbnail" (hero shot).
- Last image SHOULD be "delivery" (download/setup flow).
- Between those, tell a STORY. Each image should have a clear narrative purpose.
- DO NOT always use the same sequence. A wedding planner needs different storytelling than a business P&L.
- Available kinds: thumbnail, problem, dashboard, feature, method, included, delivery, social-proof, comparison, detail-zoom, lifestyle, guarantee
- Use "detail-zoom" for close-ups of specific tabs (vendor tracker, guest list, debt tracker, etc.)
- Use "comparison" for before/after or "without this vs with this" images
- Use "social-proof" for trust/testimonial slides
- Use "lifestyle" for aspirational context
- Titles should be SHORT, emotional, conversion-focused (max 60 chars)

EXAMPLE SEQUENCES (do NOT copy these — create unique ones):
- Wedding: thumbnail → lifestyle → detail-zoom(vendors) → detail-zoom(guests) → dashboard → included → delivery (7 images)
- Business: thumbnail → problem → dashboard → comparison → detail-zoom(P&L) → method → delivery (7 images)
- Baby: thumbnail → problem → dashboard → feature → included → delivery (6 images)
- Paycheck: thumbnail → problem → detail-zoom(bills) → detail-zoom(debt) → dashboard → method → included → guarantee → delivery (9 images)

Make BOLD creative choices. Do NOT play it safe. Each niche deserves a distinct visual identity AND a distinct image storytelling sequence.

Respond ONLY with the JSON object. No markdown, no explanation.`;
}

/**
 * Call Gemini to generate a VisualDirectionSpec for this product.
 * Falls back to niche-appropriate defaults if Gemini is unavailable.
 */
export async function generateVisualDirection(
  input: VisualDirectionInput,
): Promise<VisualDirectionSpec> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      const prompt = buildVisualDirectionPrompt(input);
      const rawText = await callGeminiJSON(apiKey, prompt);
      const raw = parseGeminiJSON<Partial<VisualDirectionSpec>>(rawText);
      const spec = clampSpec(raw);
      console.log(`[VisualDirection] ✨ Gemini generated spec for "${input.nicheLabel}" — layout=${spec.problem.layout}, density=${spec.global.density}, hero=${spec.hero.deviceLayout}`);
      return spec;
    } catch (err) {
      console.warn("[VisualDirection] Gemini failed, using fallback:", (err as Error).message?.slice(0, 80));
    }
  }

  return buildFallbackSpec(input.niche);
}

/**
 * Deterministic fallback that produces niche-appropriate defaults.
 * Each niche gets a distinct visual personality without Gemini.
 */
export function buildFallbackSpec(niche: string): VisualDirectionSpec {
  const nicheKey = niche.toLowerCase().replace(/[-_\s]/g, "");

  // Wedding / Bridal
  if (nicheKey.includes("wedding") || nicheKey.includes("bridal")) {
    return clampSpec({
      version: 1,
      global: {
        backgroundMode: "gradient", gradientAngle: 180,
        gradientStops: ["#FDF8F0", "#F5EDE0"],
        decorStyle: "diamonds", decorOpacity: 0.04,
        fontFamily: "serif", density: "spacious",
      },
      hero: {
        deviceLayout: "single-laptop", deviceRotation: -3,
        titlePosition: "top-center", titleScale: 1.1,
        pillsPosition: "bottom-row", backgroundHint: "elegant marble desk with dried flowers and gold rings",
      },
      problem: {
        layout: "centered-text", hookScale: 1.3, darkness: 0,
        showBullets: false, bulletCount: 3, separator: "ornament", gravity: "center",
      },
      dashboard: {
        kpiCount: 3, kpiLayout: "large-hero-plus-small",
        showTable: true, tableRows: 5, showViz: false,
        vizType: "donut", sections: ["kpis", "table"],
        layoutDensity: "spacious",
        blocks: [
          { type: "kpi-cards", title: "Wedding Budget Overview", emoji: "💒", style: "large", width: "full", dataSource: "budgetCategories" },
          { type: "category-table", title: "Budget by Category", emoji: "💐", style: "compact", rowCount: 6, width: "full", dataSource: "budgetCategories" },
          { type: "checklist", title: "Planning Checklist", emoji: "✅", style: "checklist-style", rowCount: 5, width: "full", dataSource: "custom" },
          { type: "goals-grid", title: "Savings Goals", emoji: "💍", style: "cards", rowCount: 3, width: "full", dataSource: "savingsGoals" },
          { type: "insights", title: "Budget Insights", emoji: "💡", style: "minimal", rowCount: 3, width: "full" },
        ],
      },
      feature: {
        vizType: "checklist", itemCount: 5, showHeroStat: false, arrangement: "vertical",
      },
      method: {
        stepCount: 3, layout: "horizontal-cards", connector: "dotted",
        cardShape: "rounded", showIcons: true,
      },
      included: { columns: 3, cardStyle: "minimal", showCountBadge: true },
      delivery: {
        stepCount: 3, layout: "horizontal-flow",
        badges: ["Instant Download", "Google Sheets & Excel", "Lifetime Access"],
        showDeviceRow: true,
      },
      video: {
        introStyle: "text-fade", scenePaceMs: 2500,
        tabHighlights: ["Vendor Tracker", "Guest List", "Wedding Timeline"],
        ctaText: "Plan your dream wedding.",
      },
      imageSequence: [
        { slot: 1, kind: "thumbnail", title: "Wedding Budget Planner", subtitle: "Google Sheets Template", sourceTabRole: "dashboard", cropIntent: "full", narrativePurpose: "Hero shot — elegant editorial feel, drives click" },
        { slot: 2, kind: "lifestyle", title: "Plan your dream wedding", subtitle: "Without the budget stress", sourceTabRole: "", cropIntent: "", narrativePurpose: "Aspirational — bride feels understood" },
        { slot: 3, kind: "detail-zoom", title: "Track every vendor", subtitle: "Quotes, deposits, payments — all in one place", sourceTabRole: "vendor-tracker", cropIntent: "table", narrativePurpose: "Vendor tracker close-up proves product depth" },
        { slot: 4, kind: "detail-zoom", title: "Guest list. Sorted.", subtitle: "RSVP, table assignments, dietary needs", sourceTabRole: "guest-list", cropIntent: "table", narrativePurpose: "Guest list tab shows breadth of planning" },
        { slot: 5, kind: "dashboard", title: "See your full budget at a glance", subtitle: "", sourceTabRole: "dashboard", cropIntent: "kpi", narrativePurpose: "Dashboard KPIs prove financial clarity" },
        { slot: 6, kind: "included", title: "Everything you need. One planner.", subtitle: "", sourceTabRole: "", cropIntent: "", narrativePurpose: "Tab grid shows completeness" },
        { slot: 7, kind: "delivery", title: "Download. Open. Start planning.", subtitle: "Instant digital delivery", sourceTabRole: "", cropIntent: "", narrativePurpose: "Remove purchase friction" },
      ],
    });
  }

  // Baby / Family / Pregnancy
  if (nicheKey.includes("baby") || nicheKey.includes("newborn") || nicheKey.includes("pregnancy")) {
    return clampSpec({
      version: 1,
      global: {
        backgroundMode: "radial", gradientAngle: 0,
        gradientStops: ["#EDE9FE", "#FFF1F2"],
        decorStyle: "circles", decorOpacity: 0.06,
        fontFamily: "sans", density: "spacious",
      },
      hero: {
        deviceLayout: "multi-device", deviceRotation: 0,
        titlePosition: "top-center", titleScale: 1.0,
        pillsPosition: "bottom-row", backgroundHint: "soft pastel nursery desk with stuffed animal and baby rattle",
      },
      problem: {
        layout: "stacked-cards", hookScale: 1.1, darkness: 0,
        showBullets: true, bulletCount: 3, separator: "gradient", gravity: "center",
      },
      dashboard: {
        kpiCount: 4, kpiLayout: "grid-2x2",
        showTable: true, tableRows: 5, showViz: true,
        vizType: "progress-rings", sections: ["kpis", "viz", "table"],
        layoutDensity: "spacious",
        blocks: [
          { type: "kpi-cards", title: "Monthly Overview", emoji: "👶", style: "compact", width: "full", dataSource: "budgetCategories" },
          { type: "progress-tracker", title: "Baby Savings Goals", emoji: "🎯", style: "visual-bars", rowCount: 4, width: "full", dataSource: "savingsGoals" },
          { type: "category-table", title: "Monthly Expenses", emoji: "🍼", style: "minimal", rowCount: 5, width: "full", dataSource: "budgetCategories" },
        ],
      },
      feature: {
        vizType: "progress-bars", itemCount: 4, showHeroStat: true, arrangement: "vertical",
      },
      method: {
        stepCount: 3, layout: "vertical-timeline", connector: "dotted",
        cardShape: "pill", showIcons: true,
      },
      included: { columns: 2, cardStyle: "filled", showCountBadge: true },
      delivery: {
        stepCount: 3, layout: "vertical-steps",
        badges: ["Instant Download", "No App Needed", "Works on Any Device"],
        showDeviceRow: true,
      },
      video: {
        introStyle: "slide-in", scenePaceMs: 2500,
        tabHighlights: ["Dashboard", "Transactions", "Baby Milestones"],
        ctaText: "Start planning for your little one.",
      },
      imageSequence: [
        { slot: 1, kind: "thumbnail", title: "Baby Budget Planner", subtitle: "Track every cost from day one", sourceTabRole: "dashboard", cropIntent: "full", narrativePurpose: "Hero shot — warm, nurturing, drives click" },
        { slot: 2, kind: "problem", title: "Overwhelmed by baby costs?", subtitle: "Diapers, formula, checkups — it adds up fast", sourceTabRole: "", cropIntent: "", narrativePurpose: "Pain point — parent feels understood" },
        { slot: 3, kind: "dashboard", title: "See exactly where it goes", subtitle: "Income, baby costs, savings — all tracked", sourceTabRole: "dashboard", cropIntent: "kpi", narrativePurpose: "Dashboard KPIs show financial clarity" },
        { slot: 4, kind: "feature", title: "Watch your savings grow", subtitle: "Visual progress bars for every goal", sourceTabRole: "dashboard", cropIntent: "section", narrativePurpose: "Savings goals with progress — emotional payoff" },
        { slot: 5, kind: "included", title: "Everything in one place", subtitle: "", sourceTabRole: "", cropIntent: "", narrativePurpose: "Tab grid shows simplicity and completeness" },
        { slot: 6, kind: "delivery", title: "Download. Open. Start tracking.", subtitle: "Set up in under 5 minutes", sourceTabRole: "", cropIntent: "", narrativePurpose: "Remove purchase friction" },
      ],
    });
  }

  // Business / P&L / Freelance
  if (nicheKey.includes("business") || nicheKey.includes("pl") || nicheKey.includes("freelance") || nicheKey.includes("revenue")) {
    return clampSpec({
      version: 1,
      global: {
        backgroundMode: "gradient", gradientAngle: 160,
        gradientStops: ["#0B1120", "#1E293B"],
        decorStyle: "lines", decorOpacity: 0.03,
        fontFamily: "sans", density: "dense",
      },
      hero: {
        deviceLayout: "single-laptop", deviceRotation: -6,
        titlePosition: "top-left", titleScale: 1.2,
        pillsPosition: "left-column", backgroundHint: "dark professional office desk with leather portfolio",
      },
      problem: {
        layout: "split-columns", hookScale: 1.2, darkness: 0.95,
        showBullets: true, bulletCount: 3, separator: "line", gravity: "top",
      },
      dashboard: {
        kpiCount: 4, kpiLayout: "horizontal-strip",
        showTable: true, tableRows: 6, showViz: true,
        vizType: "bars", sections: ["kpis", "table", "viz"],
        layoutDensity: "dense",
        blocks: [
          { type: "kpi-cards", title: "Business Performance", emoji: "📈", style: "large", width: "full", dataSource: "budgetCategories" },
          { type: "bar-chart", title: "Revenue vs Expenses", emoji: "📊", style: "visual-bars", rowCount: 8, width: "full", dataSource: "budgetCategories" },
          { type: "category-table", title: "Cost Breakdown", emoji: "💼", style: "compact", rowCount: 8, width: "full", dataSource: "budgetCategories" },
          { type: "top-categories", title: "Highest Costs", emoji: "🔥", style: "cards", rowCount: 3, width: "full", dataSource: "budgetCategories" },
          { type: "insights", title: "Profit Insights", emoji: "💡", style: "minimal", rowCount: 3, width: "full" },
          { type: "summary-stats", title: "Monthly P&L Summary", emoji: "📋", style: "horizontal", width: "full" },
        ],
      },
      feature: {
        vizType: "comparison-table", itemCount: 5, showHeroStat: true, arrangement: "horizontal",
      },
      method: {
        stepCount: 3, layout: "numbered-list", connector: "numbered",
        cardShape: "square", showIcons: false,
      },
      included: { columns: 4, cardStyle: "bordered", showCountBadge: false },
      delivery: {
        stepCount: 3, layout: "icon-row",
        badges: ["Instant Download", "Tax-Ready Categories", "Profit Tracking"],
        showDeviceRow: false,
      },
      video: {
        introStyle: "dramatic-dark", scenePaceMs: 1500,
        tabHighlights: ["Revenue Log", "Monthly P&L", "Tax Planning"],
        ctaText: "Know your numbers. Grow your business.",
      },
      imageSequence: [
        { slot: 1, kind: "thumbnail", title: "Business P&L Dashboard", subtitle: "Revenue. Costs. Profit. Clarity.", sourceTabRole: "dashboard", cropIntent: "full", narrativePurpose: "Hero shot — dark, professional, data-dense" },
        { slot: 2, kind: "problem", title: "No idea if you're actually profitable?", subtitle: "Stop guessing. Start tracking.", sourceTabRole: "", cropIntent: "", narrativePurpose: "Pain point — business owner's #1 fear" },
        { slot: 3, kind: "dashboard", title: "Revenue. Expenses. Profit. One view.", subtitle: "", sourceTabRole: "dashboard", cropIntent: "kpi", narrativePurpose: "KPI strip shows analytical power" },
        { slot: 4, kind: "comparison", title: "Revenue vs Expenses", subtitle: "See your margin at a glance", sourceTabRole: "dashboard", cropIntent: "chart", narrativePurpose: "Visual comparison — most valuable data view" },
        { slot: 5, kind: "detail-zoom", title: "Monthly P&L breakdown", subtitle: "Track every dollar in and out", sourceTabRole: "monthly-pl", cropIntent: "table", narrativePurpose: "P&L tab close-up proves depth" },
        { slot: 6, kind: "detail-zoom", title: "Tax season? Already handled.", subtitle: "Quarterly tax planning built in", sourceTabRole: "tax-planning", cropIntent: "section", narrativePurpose: "Tax planning differentiator" },
        { slot: 7, kind: "method", title: "Revenue. Costs. Profit. Clarity.", subtitle: "", sourceTabRole: "", cropIntent: "", narrativePurpose: "System explanation builds trust" },
        { slot: 8, kind: "included", title: "Complete business toolkit", subtitle: "", sourceTabRole: "", cropIntent: "", narrativePurpose: "Tab grid shows completeness" },
        { slot: 9, kind: "delivery", title: "Download. Open. Know your numbers.", subtitle: "Set up in 5 minutes", sourceTabRole: "", cropIntent: "", narrativePurpose: "Remove purchase friction" },
      ],
    });
  }

  // Travel / Trip / Vacation
  if (nicheKey.includes("travel") || nicheKey.includes("trip") || nicheKey.includes("vacation")) {
    return clampSpec({
      version: 1,
      global: {
        backgroundMode: "gradient", gradientAngle: 135,
        gradientStops: ["#ECFDF5", "#DBEAFE"],
        decorStyle: "dots", decorOpacity: 0.04,
        fontFamily: "sans", density: "spacious",
      },
      hero: {
        deviceLayout: "tablet-solo", deviceRotation: 5,
        titlePosition: "top-center", titleScale: 1.1,
        pillsPosition: "bottom-row", backgroundHint: "bright travel desk with world map, compass, and sunglasses",
      },
      problem: {
        layout: "diagonal", hookScale: 1.3, darkness: 0.1,
        showBullets: true, bulletCount: 3, separator: "gradient", gravity: "center",
      },
      dashboard: {
        kpiCount: 4, kpiLayout: "large-hero-plus-small",
        showTable: true, tableRows: 5, showViz: true,
        vizType: "donut", sections: ["kpis", "viz", "table"],
        layoutDensity: "spacious",
        blocks: [
          { type: "kpi-cards", title: "Trip Budget", emoji: "✈️", style: "cards", width: "full", dataSource: "budgetCategories" },
          { type: "bar-chart", title: "Spending by Category", emoji: "📊", style: "visual-bars", rowCount: 5, width: "full", dataSource: "budgetCategories" },
          { type: "goals-grid", title: "Trip Savings Progress", emoji: "🏖️", style: "visual-bars", rowCount: 4, width: "full", dataSource: "savingsGoals" },
          { type: "summary-stats", title: "Trip Total", emoji: "🌍", style: "horizontal", width: "full" },
        ],
      },
      feature: {
        vizType: "timeline", itemCount: 5, showHeroStat: false, arrangement: "vertical",
      },
      method: {
        stepCount: 4, layout: "zigzag", connector: "arrow",
        cardShape: "rounded", showIcons: true,
      },
      included: { columns: 3, cardStyle: "icon-left", showCountBadge: true },
      delivery: {
        stepCount: 3, layout: "horizontal-flow",
        badges: ["Instant Download", "Plan Any Trip", "Lifetime Access"],
        showDeviceRow: true,
      },
      video: {
        introStyle: "zoom-reveal", scenePaceMs: 2000,
        tabHighlights: ["Itinerary", "Trip Expenses", "Packing Checklist"],
        ctaText: "Plan smarter. Travel better.",
      },
      imageSequence: [
        { slot: 1, kind: "thumbnail", title: "Travel Budget Planner", subtitle: "Plan every trip. Track every dollar.", sourceTabRole: "dashboard", cropIntent: "full", narrativePurpose: "Hero shot — adventurous, airy feel" },
        { slot: 2, kind: "lifestyle", title: "Budget smart. Travel better.", subtitle: "Plan every expense before you go", sourceTabRole: "", cropIntent: "", narrativePurpose: "Aspirational — traveler dreams of their next trip" },
        { slot: 3, kind: "dashboard", title: "Your trip budget at a glance", subtitle: "", sourceTabRole: "dashboard", cropIntent: "kpi", narrativePurpose: "KPI overview shows total trip control" },
        { slot: 4, kind: "detail-zoom", title: "Day-by-day itinerary", subtitle: "Activities, locations, costs — all planned", sourceTabRole: "itinerary", cropIntent: "table", narrativePurpose: "Itinerary tab close-up shows planning depth" },
        { slot: 5, kind: "detail-zoom", title: "Packing? Sorted.", subtitle: "Never forget essentials again", sourceTabRole: "packing", cropIntent: "table", narrativePurpose: "Packing checklist — practical value" },
        { slot: 6, kind: "feature", title: "Track savings toward your trip", subtitle: "Visual progress for every goal", sourceTabRole: "dashboard", cropIntent: "section", narrativePurpose: "Savings goals with progress bars" },
        { slot: 7, kind: "included", title: "Everything for your trip", subtitle: "", sourceTabRole: "", cropIntent: "", narrativePurpose: "Tab grid shows full trip planning system" },
        { slot: 8, kind: "delivery", title: "Download. Plan. Travel.", subtitle: "Instant setup", sourceTabRole: "", cropIntent: "", narrativePurpose: "Remove purchase friction" },
      ],
    });
  }

  // Paycheck / Debt / Savings (default)
  return clampSpec({
    version: 1,
    global: {
      backgroundMode: "gradient", gradientAngle: 180,
      gradientStops: ["#F0FDFA", "#F8FAFC"],
      decorStyle: "none", decorOpacity: 0.03,
      fontFamily: "sans", density: "balanced",
    },
    hero: {
      deviceLayout: "multi-device", deviceRotation: 0,
      titlePosition: "top-center", titleScale: 1.0,
      pillsPosition: "bottom-row", backgroundHint: "clean minimal desk with notebook and coffee",
    },
    problem: {
      layout: "stacked-cards", hookScale: 1.1, darkness: 0.05,
      showBullets: true, bulletCount: 3, separator: "line", gravity: "center",
    },
    dashboard: {
      kpiCount: 4, kpiLayout: "horizontal-strip",
      showTable: true, tableRows: 5, showViz: false,
      vizType: "bars", sections: ["kpis", "table"],
      layoutDensity: "balanced",
      blocks: [
        { type: "kpi-cards", title: "Monthly Overview", emoji: "💰", style: "compact", width: "full", dataSource: "budgetCategories" },
        { type: "category-table", title: "Budget Categories", emoji: "💳", style: "compact", rowCount: 6, width: "full", dataSource: "budgetCategories" },
        { type: "bar-chart", title: "Budget vs Actual", emoji: "📊", style: "visual-bars", rowCount: 6, width: "full", dataSource: "budgetCategories" },
        { type: "insights", title: "Smart Insights", emoji: "💡", style: "minimal", rowCount: 3, width: "full" },
      ],
    },
    feature: {
      vizType: "progress-bars", itemCount: 4, showHeroStat: true, arrangement: "vertical",
    },
    method: {
      stepCount: 3, layout: "horizontal-cards", connector: "arrow",
      cardShape: "rounded", showIcons: true,
    },
    included: { columns: 3, cardStyle: "bordered", showCountBadge: true },
    delivery: {
      stepCount: 3, layout: "horizontal-flow",
      badges: ["Instant Download", "No Subscription", "Lifetime Access"],
      showDeviceRow: true,
    },
    video: {
      introStyle: "text-fade", scenePaceMs: 2000,
      tabHighlights: ["Dashboard", "Transactions", "Budget Setup"],
      ctaText: "Take control of your money.",
    },
    imageSequence: [
      { slot: 1, kind: "thumbnail", title: "Budget Tracker", subtitle: "Google Sheets Template", sourceTabRole: "dashboard", cropIntent: "full", narrativePurpose: "Hero shot — clean, approachable" },
      { slot: 2, kind: "problem", title: "Where did my money go?", subtitle: "A budget system that saves first and tracks every dollar", sourceTabRole: "", cropIntent: "", narrativePurpose: "Pain point — universal money anxiety" },
      { slot: 3, kind: "dashboard", title: "Every dollar. Tracked.", subtitle: "", sourceTabRole: "dashboard", cropIntent: "kpi", narrativePurpose: "Dashboard KPIs show financial clarity" },
      { slot: 4, kind: "feature", title: "Budget vs actual — see the truth", subtitle: "", sourceTabRole: "dashboard", cropIntent: "chart", narrativePurpose: "Visual bars show budget health at a glance" },
      { slot: 5, kind: "method", title: "Save first. Spend smarter.", subtitle: "Savings 25% · Needs 35% · Wants 20% · Bills 20%", sourceTabRole: "", cropIntent: "", narrativePurpose: "System explanation builds trust in the method" },
      { slot: 6, kind: "included", title: "Complete budget system", subtitle: "", sourceTabRole: "", cropIntent: "", narrativePurpose: "Tab grid shows everything included" },
      { slot: 7, kind: "delivery", title: "Download. Open. Start.", subtitle: "Set up in 5 minutes. No subscription.", sourceTabRole: "", cropIntent: "", narrativePurpose: "Remove purchase friction" },
    ],
  });
}
