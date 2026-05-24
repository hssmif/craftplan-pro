// ══════════════════════════════════════════════════════════════
// Factory Engine 2: Blueprint Generator (v2)
//
// Hybrid approach:
//   1. Gemini analyzes competitor → chooses structure + differentiation
//   2. Deterministic enrichment → fills formulas, sample data, charts
//
// Output: a full ProductBlueprint ready for GWS generation
// ══════════════════════════════════════════════════════════════

import { callGeminiJSON, parseGeminiJSON } from "@/lib/gemini";
import type { CompetitorFeatures } from "@/lib/factory-competitor-scan";
import type { SheetsConfig } from "@/types/digital-product";
import { getTabSetConfig, getSpreadsheetDashboardConfig, type TabDef, type SpreadsheetDashboardConfig, type DashboardSectionDef } from "@/lib/factory-layout-families";
import { getNicheData, type CustomSectionData } from "@/lib/factory-niche-data";
import type {
  FactoryBlueprint,
  ProductBlueprint,
  BlueprintTab,
  BlueprintChart,
  BlueprintDifferentiation,
  BlueprintListingStrategy,
} from "@/types/factory";

// ── Competitor Data ─────────────────────────────────────────

export interface CompetitorData {
  title: string;
  tags: string[];
  price: number;
  description?: string;
  reviews?: number;
  rating?: number;
  revenueEstimate?: number;
  niche?: string;
  ideaContext?: {
    title?: string;
    whyNow?: string;
    targetBuyer?: string;
  };
  marketContext?: {
    competition?: number | null;
    avgFavorites?: number | null;
    evidenceCount?: number;
    topTags?: string[];
  };
}

// ══════════════════════════════════════════════════════════════
// PART 1: GEMINI ANALYSIS
// Asks Gemini for market reasoning + product direction.
// Does NOT ask for formulas or sample data (too unreliable).
// ══════════════════════════════════════════════════════════════

interface GeminiAnalysis {
  productCategory: string;
  niche: string;
  targetCustomer: string;
  tabNames: string[];
  tabPurposes: string[];
  chartTypes: string[];
  competitorStrengths: string[];
  competitorWeaknesses: string[];
  ourImprovements: string[];
  positioningAngle: string;
  colorChoice: "navy-gold" | "sage-green" | "dusty-rose" | "minimal-black" | "lavender" | "ocean";
  pricingTier: "low" | "mid" | "premium";
  recommendedPrice: number;
  titleKeywords: string[];
  uniqueSellingPoints: string[];
  projectName: string;
}

function buildAnalysisPrompt(
  competitor: CompetitorData,
  features?: CompetitorFeatures,
): string {
  // ── Deep-scan manifest block ─────────────────────────────────
  // If the orchestrator ran a Gemini-Vision deep scan on the
  // competitor's listing photos, we inject the extracted feature
  // manifest as a HARD floor: the blueprint must match or beat it.
  const featuresBlock =
    features && features.confidence > 0
      ? `

DEEP-SCAN MANIFEST (from competitor's listing photos):
- Tab count declared/detected: ${features.tabCount} (${features.detectedTabs.length} tab names spotted)
- Tabs spotted: ${features.detectedTabs.slice(0, 30).join(", ") || "—"}
- Charts: ${features.chartTypes.join(", ") || "—"}
- Calendar widget: ${features.hasCalendarWidget ? "yes" : "no"}
- Automations: ${features.automations.join(", ") || "—"}
- Unique widgets: ${features.uniqueWidgets.join(", ") || "—"}
- Declared selling points: ${features.declaredFeatures.slice(0, 12).join(" · ") || "—"}
- Visual style: ${features.visualStyle} / quality ${features.productionQuality}
- Dark mode offered: ${features.hasDarkMode ? "yes" : "no"}
- Scan confidence: ${(features.confidence * 100).toFixed(0)}%

HARD RULES — your blueprint MUST:
1. Include EVERY tab name from "Tabs spotted" above (or a clear superior equivalent).
2. Match or exceed the tabCount.
3. Include EVERY chart type the competitor offers.
4. Replicate any "unique widgets" we can build with formulas + ExcelJS.
5. ALWAYS ADD ON TOP of theirs our 4 signature tabs (we own these):
     • "Smart Calendar"      — day grid with transactions inside each cell
     • "Year in Review"      — Spotify-Wrapped-style annual recap with badges
     • "AI Money Coach"      — formula-driven personalized insights
     • "What-If Simulator"   — interactive levers + live projections
   These differentiate us from EVERY competitor. They go in addition to whatever the competitor has.

If the competitor already has one of our 4 (e.g., calls something "Smart Calendar"), still include ours — ours is the superior implementation.`
      : "";
  const ideaBlock = competitor.ideaContext?.title
    ? `

SELECTED IDEA TO BUILD (from Research):
- Idea title: "${competitor.ideaContext.title}"
- Why now: ${competitor.ideaContext.whyNow || "not provided"}
- Target buyer: ${competitor.ideaContext.targetBuyer || "not provided"}

IMPORTANT: The competitor listing is evidence to beat, not the final product name.
Design the spreadsheet for the SELECTED IDEA above while matching-or-beating the competitor's useful features.`
    : "";
  const marketBlock = competitor.marketContext
    ? `

MARKET CONTEXT:
- Etsy competition: ${competitor.marketContext.competition ?? "unknown"}
- Avg favorites: ${competitor.marketContext.avgFavorites ?? "unknown"}
- Evidence count: ${competitor.marketContext.evidenceCount ?? "unknown"}
- Top tags: ${competitor.marketContext.topTags?.slice(0, 13).join(", ") || "unknown"}`
    : "";

  return `You are an Etsy digital product strategist specializing in Google Sheets spreadsheet products.

Analyze this COMPETITOR listing and design a BETTER product.

COMPETITOR:
Title: "${competitor.title}"
Tags: ${competitor.tags.slice(0, 15).join(", ")}
Price: $${competitor.price}
Reviews: ${competitor.reviews ?? "unknown"}
Est. Monthly Revenue: $${competitor.revenueEstimate ?? "unknown"}
${competitor.description ? `Description: "${competitor.description.slice(0, 400)}"` : ""}
${competitor.niche ? `Niche: ${competitor.niche}` : ""}${ideaBlock}${marketBlock}${featuresBlock}

INSTRUCTIONS:
1. Identify what product category this is (budget_tracker, paycheck_budget, business_pl, wedding_planner, travel_planner, side_hustle, savings_tracker, debt_payoff, fitness_tracker, meal_planner, habit_tracker, expense_tracker, investment_tracker)
2. Choose 5-7 tab names for the spreadsheet. First tab MUST be "Dashboard". Last tab MUST be "Setup & Instructions". Include a data entry tab (e.g. "Transactions", "Log", "Entries").
3. For each tab, write a ONE-SENTENCE purpose.
4. Suggest 2-3 chart types: pick from "donut", "column", "line", "pie"
5. Identify 3 competitor strengths and 3 competitor weaknesses
6. List 3 specific improvements we make
7. Choose a color scheme that DIFFERENTIATES from the competitor
8. Set pricing tier based on feature count

VALID COLOR CHOICES: "navy-gold" | "sage-green" | "dusty-rose" | "minimal-black" | "lavender" | "ocean"

Respond ONLY with this exact JSON structure (no markdown, no explanation):
{
  "productCategory": "budget_tracker",
  "niche": "personal budgeting for freelancers",
  "targetCustomer": "freelancers who want to track irregular income",
  "tabNames": ["Dashboard", "Transactions", "Budget Setup", "Monthly Summary", "Savings Goals", "Setup & Instructions"],
  "tabPurposes": ["Visual budget overview with KPIs and charts", "Log income and expenses with categories", ...],
  "chartTypes": ["donut", "column"],
  "competitorStrengths": ["...", "...", "..."],
  "competitorWeaknesses": ["...", "...", "..."],
  "ourImprovements": ["...", "...", "..."],
  "positioningAngle": "one sentence",
  "colorChoice": "navy-gold",
  "pricingTier": "mid",
  "recommendedPrice": 11.97,
  "titleKeywords": ["budget tracker", "google sheets", "monthly budget"],
  "uniqueSellingPoints": ["...", "...", "..."],
  "projectName": "Freelancer Budget Tracker"
}`;
}

function parseAnalysis(raw: Record<string, unknown>): GeminiAnalysis {
  const validColors = ["navy-gold", "sage-green", "dusty-rose", "minimal-black", "lavender", "ocean"];
  const validTiers = ["low", "mid", "premium"];

  return {
    productCategory: (raw.productCategory as string) || "budget_tracker",
    niche: (raw.niche as string) || "personal finance",
    targetCustomer: (raw.targetCustomer as string) || "people who want to budget",
    tabNames: Array.isArray(raw.tabNames) ? raw.tabNames as string[] : ["Dashboard", "Transactions", "Budget Setup", "Monthly Summary", "Savings Goals", "Setup & Instructions"],
    tabPurposes: Array.isArray(raw.tabPurposes) ? raw.tabPurposes as string[] : [],
    chartTypes: Array.isArray(raw.chartTypes) ? raw.chartTypes as string[] : ["donut", "column"],
    competitorStrengths: Array.isArray(raw.competitorStrengths) ? raw.competitorStrengths as string[] : [],
    competitorWeaknesses: Array.isArray(raw.competitorWeaknesses) ? raw.competitorWeaknesses as string[] : [],
    ourImprovements: Array.isArray(raw.ourImprovements) ? raw.ourImprovements as string[] : [],
    positioningAngle: (raw.positioningAngle as string) || "",
    colorChoice: validColors.includes(raw.colorChoice as string) ? raw.colorChoice as GeminiAnalysis["colorChoice"] : "navy-gold",
    pricingTier: validTiers.includes(raw.pricingTier as string) ? raw.pricingTier as GeminiAnalysis["pricingTier"] : "mid",
    recommendedPrice: typeof raw.recommendedPrice === "number" ? raw.recommendedPrice : 11.97,
    titleKeywords: Array.isArray(raw.titleKeywords) ? raw.titleKeywords as string[] : [],
    uniqueSellingPoints: Array.isArray(raw.uniqueSellingPoints) ? raw.uniqueSellingPoints as string[] : [],
    projectName: (raw.projectName as string) || "Digital Product",
  };
}

// ══════════════════════════════════════════════════════════════
// PART 2: NICHE-SPECIFIC CONTENT GENERATION
// Second Gemini call: generates content unique to the niche.
// This is what makes a "Baby Budget" different from a generic one.
// ══════════════════════════════════════════════════════════════

interface NicheContent {
  dashboardTitle: string;          // e.g. "👶 BABY BUDGET PLANNER"
  dashboardSubtitle: string;       // e.g. "Track every baby expense from diapers to daycare"
  incomeLabel: string;             // e.g. "Monthly Household Income" or "Monthly Take-Home Pay"
  expenseCategories: string[];     // e.g. ["Diapers & Wipes", "Formula & Food", "Clothing", "Healthcare", "Childcare"]
  buckets: string[];               // e.g. ["Savings", "Baby Essentials", "Baby Extras", "Bills"]
  bucketPercentages: number[];     // e.g. [20, 40, 20, 20]
  savingsGoals: Array<{name: string; target: number; saved: number}>;
  sampleTransactions: Array<{date: string; desc: string; amount: number; subCat: string; category: string; bucket: string; month: string}>;
  customTabs: Array<{name: string; purpose: string; columns: Array<{name: string; type: string}>; sampleRows: Array<Array<string | number | null>>}>;
  defaultMonthlyIncome: number;
}

function buildNicheContentPrompt(analysis: GeminiAnalysis): string {
  return `You are generating REALISTIC, NICHE-SPECIFIC content for a Google Sheets spreadsheet product.

PRODUCT: ${analysis.projectName}
NICHE: ${analysis.niche}
CATEGORY: ${analysis.productCategory}
TARGET CUSTOMER: ${analysis.targetCustomer}
TABS: ${analysis.tabNames.join(", ")}

Generate content that is SPECIFIC to this niche. Not generic.

For example:
- "Baby Budget" → categories: Diapers, Formula, Clothes, Pediatrician, Childcare — NOT Rent, Groceries, Utilities
- "Wedding Planner" → categories: Venue, Catering, Photography, Florals, DJ — NOT Savings, Needs, Wants
- "Side Hustle P&L" → categories: Client Revenue, Product Sales, Marketing, Software, Contractors — NOT Rent, Bills

INSTRUCTIONS:
1. dashboardTitle: A themed emoji + title (max 50 chars). Examples: "👶 BABY BUDGET PLANNER", "💍 WEDDING BUDGET DASHBOARD", "🚀 SIDE HUSTLE P&L"
2. dashboardSubtitle: One-line subtitle (max 60 chars)
3. incomeLabel: What to call their income (e.g. "Monthly Household Income", "Monthly Revenue", "Take-Home Pay")
4. expenseCategories: 5-8 niche-specific expense categories
5. buckets: 4 budget buckets relevant to this niche (e.g. for baby: "Savings", "Baby Essentials", "Baby Extras", "Household Bills")
6. bucketPercentages: allocation % for each bucket (must total 100)
7. savingsGoals: 5 niche-specific savings goals with target and saved amounts
8. sampleTransactions: 20 realistic transactions with date, description, amount, sub-category, category (=bucket name), bucket, month. Use January 2026.
9. customTabs: For any EXTRA niche-specific tabs beyond Dashboard/Transactions/Budget Setup/Monthly Summary/Savings Goals/Setup (e.g. "Baby Milestones", "Vendor Contacts", "Revenue Streams"). Include column definitions and 5-10 sample rows.
10. defaultMonthlyIncome: Realistic monthly income for this target customer

All amounts in USD. All dates in YYYY-MM-DD format.

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "dashboardTitle": "...",
  "dashboardSubtitle": "...",
  "incomeLabel": "...",
  "expenseCategories": ["...", "..."],
  "buckets": ["...", "...", "...", "..."],
  "bucketPercentages": [25, 35, 20, 20],
  "savingsGoals": [{"name": "...", "target": 5000, "saved": 1100}, ...],
  "sampleTransactions": [{"date": "2026-01-01", "desc": "...", "amount": 4200, "subCat": "...", "category": "Income", "bucket": "Income", "month": "January"}, ...],
  "customTabs": [{"name": "...", "purpose": "...", "columns": [{"name": "...", "type": "text"}], "sampleRows": [["...", "..."]]}],
  "defaultMonthlyIncome": 5000
}`;
}

function parseNicheContent(raw: Record<string, unknown>): NicheContent {
  return {
    dashboardTitle: (raw.dashboardTitle as string) || "📊 BUDGET DASHBOARD",
    dashboardSubtitle: (raw.dashboardSubtitle as string) || "Track your spending and savings",
    incomeLabel: (raw.incomeLabel as string) || "Monthly Income",
    expenseCategories: Array.isArray(raw.expenseCategories) ? raw.expenseCategories as string[] : ["Housing", "Food", "Transport", "Health", "Personal"],
    buckets: Array.isArray(raw.buckets) && (raw.buckets as string[]).length === 4
      ? raw.buckets as string[] : ["Savings", "Needs", "Wants", "Bills"],
    bucketPercentages: Array.isArray(raw.bucketPercentages) && (raw.bucketPercentages as number[]).length === 4
      ? raw.bucketPercentages as number[] : [25, 35, 20, 20],
    savingsGoals: Array.isArray(raw.savingsGoals)
      ? (raw.savingsGoals as Array<{name: string; target: number; saved: number}>).slice(0, 5)
      : [{ name: "Emergency Fund", target: 5000, saved: 1100 }],
    sampleTransactions: Array.isArray(raw.sampleTransactions)
      ? (raw.sampleTransactions as NicheContent["sampleTransactions"]).slice(0, 25)
      : [],
    customTabs: Array.isArray(raw.customTabs) ? raw.customTabs as NicheContent["customTabs"] : [],
    defaultMonthlyIncome: typeof raw.defaultMonthlyIncome === "number" ? raw.defaultMonthlyIncome : 4200,
  };
}

// ── Color Schemes (Pastel Light themes for Etsy) ──

const COLOR_SCHEMES: Record<string, ProductBlueprint["colorScheme"]> = {
  "navy-gold":      { primary: "#1B3A5C", secondary: "#D4E8FA", accent: "#D4AF37", background: "#FFFFFF", text: "#1A1A1A", success: "#22C55E", danger: "#EF4444" },
  "sage-green":     { primary: "#4A7C59", secondary: "#D4EDDA", accent: "#2D5A3E", background: "#FFFFFF", text: "#1A1A1A", success: "#22C55E", danger: "#EF4444" },
  "dusty-rose":     { primary: "#9B5E56", secondary: "#F8D7DA", accent: "#E8B4B4", background: "#FFFFFF", text: "#1A1A1A", success: "#22C55E", danger: "#EF4444" },
  "minimal-black":  { primary: "#1A1A1A", secondary: "#E9ECEF", accent: "#666666", background: "#FFFFFF", text: "#1A1A1A", success: "#22C55E", danger: "#EF4444" },
  "lavender":       { primary: "#5B4A90", secondary: "#EDE9F6", accent: "#9B8FD0", background: "#FFFFFF", text: "#1A1A1A", success: "#22C55E", danger: "#EF4444" },
  "ocean":          { primary: "#1A5276", secondary: "#D1ECF1", accent: "#3498DB", background: "#FFFFFF", text: "#1A1A1A", success: "#22C55E", danger: "#EF4444" },
};

// ── Tab Builders (Niche-Aware) ──
// Each returns a BlueprintTab populated with niche-specific content.
// The NicheContent from Gemini drives categories, goals, and sample data.

function buildDashboardTab(niche: NicheContent, nicheProfileId: string): BlueprintTab {
  const dashConfig = getSpreadsheetDashboardConfig(nicheProfileId);
  const nicheData = getNicheData(nicheProfileId);
  const trxTab = "Transactions";
  const rows: Array<Array<string | number | null>> = [];

  // ── Title + Month Selector ──
  rows.push([niche.dashboardSubtitle]);
  rows.push(["📅 SELECT MONTH", "January", null, null, null, `💰 ${niche.incomeLabel.toUpperCase()}`, null, niche.defaultMonthlyIncome]);
  rows.push([null]);

  // ── KPI Row (labels) ──
  // Build from config — each niche has its own KPI set
  const kpiLabelRow: Array<string | null> = [];
  for (let k = 0; k < dashConfig.kpiCount; k++) {
    kpiLabelRow.push(dashConfig.kpiLabels[k] || `KPI ${k + 1}`);
    if (k < dashConfig.kpiCount - 1) kpiLabelRow.push(null); // spacer column
  }
  rows.push(kpiLabelRow);

  // ── KPI Row (formulas) ──
  // Substitute placeholders with real cell references
  const kpiValueRow: Array<string | number | null> = [];
  for (let k = 0; k < dashConfig.kpiCount; k++) {
    let formula = dashConfig.kpiFormulas[k] || "0";
    formula = formula
      .replace(/\{INCOME_REF\}/g, "H3")
      .replace(/\{SPENT_RANGE\}/g, `${trxTab}!C:C`)
      .replace(/\{BUDGET_RANGE\}/g, "'Budget Setup'!B:B");
    // Wrap in = if it looks like a formula (not a simple cell reference)
    if (!formula.startsWith("=") && (formula.includes("SUM") || formula.includes("IF") || formula.includes("-") || formula.includes("/"))) {
      formula = `=${formula}`;
    } else if (!formula.startsWith("=") && /^[A-Z]/.test(formula)) {
      formula = `=${formula}`;
    }
    kpiValueRow.push(formula);
    if (k < dashConfig.kpiCount - 1) kpiValueRow.push(null);
  }
  rows.push(kpiValueRow);
  rows.push([null]); // spacer

  // ── Dashboard Sections (from config) ──
  // Each section renders: section header → column headers → data rows → total row → spacer
  let currentRow = rows.length + 1; // 1-indexed for formulas
  for (const section of dashConfig.sections) {
    // Section header with emoji
    rows.push([`${section.emoji} ${section.title}`]);
    currentRow++;

    // Column headers
    const colHeaders = section.columns.map(c => c.name);
    rows.push(colHeaders);
    currentRow++;

    // Data rows — from niche data
    const sectionData = getSectionData(section, nicheData, niche);
    for (const dataRow of sectionData) {
      rows.push(dataRow);
      currentRow++;
    }

    // Total row for budget-based sections
    if (section.dataSource === "budgetCategories" && sectionData.length > 0) {
      const totalRow: Array<string | number | null> = ["TOTAL"];
      for (let c = 1; c < section.columns.length; c++) {
        const col = section.columns[c];
        if (col.type === "currency" || col.type === "formula") {
          const colLetter = String.fromCharCode(65 + c);
          const startRow = currentRow - sectionData.length;
          totalRow.push(`=SUM(${colLetter}${startRow}:${colLetter}${currentRow - 1})`);
        } else {
          totalRow.push(null);
        }
      }
      rows.push(totalRow);
      currentRow++;
    }

    rows.push([null]); // spacer after section
    currentRow++;
  }

  // ── Insight Formulas (if enabled) ──
  if (dashConfig.showInsights && dashConfig.insightTemplates?.length) {
    rows.push(["💡 INSIGHTS"]);
    for (const template of dashConfig.insightTemplates) {
      let formula = template
        .replace(/\{INCOME_REF\}/g, "H3")
        .replace(/\{SPENT_RANGE\}/g, `${trxTab}!C:C`)
        .replace(/\{BUDGET_RANGE\}/g, "'Budget Setup'!B:B")
        .replace(/\{STATUS_RANGE\}/g, "J:J")
        .replace(/\{GOAL_TOTAL_TARGET\}/g, "SUM(B10:B20)")
        .replace(/\{GOAL_TOTAL_SAVED\}/g, "SUM(C10:C20)");
      if (!formula.startsWith("=")) formula = `=${formula}`;
      rows.push([formula]);
    }
    rows.push([null]);
  }

  return {
    name: "Dashboard",
    purpose: `Visual overview — ${dashConfig.kpiLabels.join(", ")} KPIs + ${dashConfig.sections.map(s => s.title).join(", ")} sections`,
    columns: [
      { name: niche.dashboardTitle, type: "text" },
    ],
    sampleRows: rows,
    features: ["frozen_header", "conditional_formatting", "dropdown_validation"],
  };
}

/**
 * Pull realistic data rows for a dashboard section based on its dataSource.
 */
function getSectionData(
  section: DashboardSectionDef,
  nicheData: import("@/lib/factory-niche-data").NicheDataProfile,
  niche: NicheContent,
): Array<Array<string | number | null>> {
  if (section.dataSource === "budgetCategories") {
    // Use niche budget categories with spent amounts (~70-110% of budget)
    return nicheData.budgetCategories.map((cat, i) => {
      const budget = cat.budgetAmount;
      const spent = Math.round(budget * (0.7 + Math.random() * 0.4));
      const left = budget - spent;
      const status = spent <= budget ? "✅ On Track" : spent <= budget * 1.15 ? "⚠️ Close" : "🔴 Over";
      const row: Array<string | number | null> = [cat.name];
      for (const col of section.columns.slice(1)) {
        if (col.name.toLowerCase().includes("budget") || col.name.toLowerCase().includes("amount")) row.push(budget);
        else if (col.name.toLowerCase().includes("spent") || col.name.toLowerCase().includes("actual")) row.push(spent);
        else if (col.name.toLowerCase().includes("left") || col.name.toLowerCase().includes("remaining") || col.name.toLowerCase().includes("variance")) row.push(left);
        else if (col.name.toLowerCase().includes("status")) row.push(status);
        else if (col.name.toLowerCase().includes("% of total") || col.name.toLowerCase().includes("percent")) row.push(spent / (nicheData.monthlyIncome || 5000));
        else row.push(null);
      }
      return row;
    });
  }

  if (section.dataSource === "savingsGoals") {
    return nicheData.savingsGoals.map(g => {
      const progress = g.saved / g.target;
      const status = progress >= 1 ? "✅ Funded" : progress >= 0.5 ? "⏳ Halfway" : "🚀 In Progress";
      const row: Array<string | number | null> = [g.name];
      for (const col of section.columns.slice(1)) {
        if (col.name.toLowerCase().includes("target")) row.push(g.target);
        else if (col.name.toLowerCase().includes("saved") || col.name.toLowerCase().includes("current")) row.push(g.saved);
        else if (col.name.toLowerCase().includes("progress")) row.push(progress);
        else if (col.name.toLowerCase().includes("bar")) row.push(`=SPARKLINE(${Math.round(progress * 100)}/100,{"charttype","bar";"max",1})`);
        else if (col.name.toLowerCase().includes("status")) row.push(status);
        else if (col.name.toLowerCase().includes("remaining")) row.push(g.target - g.saved);
        else row.push(null);
      }
      return row;
    });
  }

  if (section.dataSource === "custom" && section.customSourceKey) {
    const customData = nicheData.customSections?.[section.customSourceKey];
    if (customData) {
      return customData.rows;
    }
  }

  return [];
}

function buildTransactionsTab(niche: NicheContent): BlueprintTab {
  const sampleRows = niche.sampleTransactions.map((t) => [
    t.date, t.desc, t.amount, t.subCat, t.category, t.bucket, t.month,
  ]);

  // If Gemini didn't return enough, add padding rows
  if (sampleRows.length < 10) {
    const defaultRow = ["2026-01-15", "Sample expense", 50, "Misc", niche.buckets[1] || "Needs", niche.buckets[1] || "Needs", "January"];
    while (sampleRows.length < 10) sampleRows.push(defaultRow);
  }

  return {
    name: "Transactions",
    purpose: `Log every income and expense with niche categories: ${niche.expenseCategories.slice(0, 4).join(", ")}`,
    columns: [
      { name: "Date", type: "date", width: 110 },
      { name: "Description", type: "text", width: 200 },
      { name: "Amount", type: "currency", width: 110 },
      { name: "Sub-Category", type: "text", width: 140 },
      { name: "Category", type: "text", width: 120 },
      { name: "Bucket", type: "text", width: 100 },
      { name: "Month", type: "text", width: 100 },
    ],
    sampleRows,
    features: ["frozen_header", "dropdown_validation", "alternating_rows"],
  };
}

function buildBudgetSetupTab(niche: NicheContent): BlueprintTab {
  const allocRows = niche.buckets.map((b, i) => [b, niche.bucketPercentages[i], "% of income"]);
  const goalRows = niche.savingsGoals.map((g) => [g.name, g.target, "Target amount"]);

  return {
    name: "Budget Setup",
    purpose: `Set ${niche.incomeLabel.toLowerCase()}, allocation percentages, and savings goals`,
    columns: [
      { name: "Setting", type: "text", width: 200 },
      { name: "Value", type: "currency", width: 120 },
      { name: "Notes", type: "text", width: 200 },
    ],
    sampleRows: [
      [`💰 ${niche.incomeLabel.toUpperCase()}`, niche.defaultMonthlyIncome, `Enter your ${niche.incomeLabel.toLowerCase()}`],
      [null, null, null],
      ["📊 BUCKET ALLOCATION", null, null],
      ...allocRows,
      ["TOTAL", `=SUM(B4:B${3 + niche.buckets.length})`, "Must equal 100%"],
      [null, null, null],
      ["🎯 SAVINGS GOALS", null, null],
      ...goalRows,
    ],
    features: ["frozen_header"],
  };
}

function buildMonthlySummaryTab(niche: NicheContent): BlueprintTab {
  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  const b = niche.buckets;
  const trx = "Transactions";

  return {
    name: "Monthly Summary",
    purpose: `Automatic monthly breakdown by ${b.join(", ")} using SUMIFS formulas`,
    columns: [
      { name: "Month", type: "text", width: 110 },
      { name: "Income", type: "currency", width: 110 },
      ...b.map((bucket) => ({ name: bucket, type: "currency" as const, width: 110 })),
      { name: "Net", type: "currency", width: 110 },
    ],
    sampleRows: months.map((m, mi) => {
      const rowNum = mi + 2; // header is row 1
      const bucketCols = b.map((bucket, bi) =>
        `=SUMIFS(${trx}!C:C,${trx}!F:F,"${bucket}",${trx}!G:G,"${m}")`
      );
      const netFormula = `=B${rowNum}-${b.map((_, bi) => String.fromCharCode(67 + bi) + rowNum).join("-")}`;
      return [m, `=SUMIFS(${trx}!C:C,${trx}!E:E,"Income",${trx}!G:G,"${m}")`, ...bucketCols, netFormula];
    }),
    features: ["frozen_header", "alternating_rows"],
  };
}

function buildSavingsGoalsTab(niche: NicheContent): BlueprintTab {
  const goals = niche.savingsGoals.length > 0 ? niche.savingsGoals : [
    { name: "Emergency Fund", target: 5000, saved: 1100 },
    { name: "Savings Goal 2", target: 3000, saved: 500 },
  ];

  return {
    name: "Savings Goals",
    purpose: "Track savings goals with progress and status indicators",
    columns: [
      { name: "Goal", type: "text", width: 200 },
      { name: "Target", type: "currency", width: 110 },
      { name: "Saved", type: "currency", width: 110 },
      { name: "Remaining", type: "currency", width: 110, formula: "=B{ROW}-C{ROW}" },
      { name: "Progress", type: "percent", width: 90, formula: "=IF(B{ROW}>0,C{ROW}/B{ROW},0)" },
      { name: "Status", type: "text", width: 130, formula: '=IF(E{ROW}>=1,"✅ Funded",IF(E{ROW}>=0.5,"⏳ Halfway","🚀 In Progress"))' },
    ],
    sampleRows: goals.map((g, i) => {
      const r = i + 2;
      return [g.name, g.target, g.saved, `=B${r}-C${r}`, `=IF(B${r}>0,C${r}/B${r},0)`, `=IF(E${r}>=1,"✅ Funded",IF(E${r}>=0.5,"⏳ Halfway","🚀 In Progress"))`];
    }),
    features: ["frozen_header", "conditional_formatting", "alternating_rows"],
  };
}

function buildSetupTab(projectName: string, tabNames: string[]): BlueprintTab {
  return {
    name: "Setup & Instructions",
    purpose: "Delivery guide and step-by-step instructions for buyers",
    columns: [
      { name: "Section", type: "text", width: 400 },
    ],
    sampleRows: [
      [projectName],
      ["⚙️ SETUP & INSTRUCTIONS"],
      [null],
      ["📋 HOW TO USE THIS SPREADSHEET"],
      ["1. Start with the Budget Setup tab — set your monthly income and allocations"],
      ["2. Log all income and expenses in the Transactions tab"],
      ["3. Assign each transaction to a Bucket: Savings, Needs, Wants, or Bills"],
      ["4. The Dashboard updates automatically — select any month to see your breakdown"],
      ["5. Track savings progress in the Savings Goals tab"],
      ["6. Delete sample data and add your own to get started!"],
      [null],
      ["📊 TABS INCLUDED"],
      ...tabNames.map((t) => [`• ${t}`]),
      [null],
      ["🔗 HOW TO USE IN GOOGLE SHEETS"],
      ["1. Download the .xlsx file from your Etsy purchase"],
      ["2. Go to drive.google.com and sign in"],
      ['3. Click "+ New" → "File upload" → select this file'],
      ['4. Right-click the file → "Open with" → "Google Sheets"'],
      ['5. Go to File → "Make a copy" to get your fully editable version'],
      ["6. Start by filling in the Budget Setup tab"],
      [null],
      ["✨ All formulas update automatically. Sample data is included — clear it and add your own."],
    ],
    features: [],
  };
}

// ── Sample Data by Category ──

// Sample data is now generated dynamically by Gemini via NicheContent.
// No more hardcoded SAMPLE_DATA_BY_CATEGORY — each niche gets unique content.

// ── Chart Builder ──

function buildCharts(analysis: GeminiAnalysis, tabs: BlueprintTab[]): BlueprintChart[] {
  const charts: BlueprintChart[] = [];
  const dashboardTab = "Dashboard";

  // Savings Goal Progress donut (if Savings Goals tab exists)
  if (tabs.some((t) => t.name === "Savings Goals")) {
    charts.push({
      type: "donut",
      title: "Savings Goal Progress",
      sourceTab: "Savings Goals",
      sourceRange: "A2:A6",
      dataRange: "C2:C6",
      placement: { tab: dashboardTab, row: 20, col: 0 },
      width: 460,
      height: 320,
    });
  }

  // Spending breakdown donut (from Monthly Summary)
  if (tabs.some((t) => t.name === "Monthly Summary")) {
    charts.push({
      type: "donut",
      title: "Where My Money Went",
      sourceTab: "Monthly Summary",
      sourceRange: "A2:A13",
      dataRange: "B2:B13",
      placement: { tab: dashboardTab, row: 20, col: 5 },
      width: 460,
      height: 320,
    });
  }

  // Goal vs Actual column chart (if Budget Setup exists)
  if (analysis.chartTypes.includes("column") || analysis.chartTypes.includes("bar")) {
    charts.push({
      type: "column",
      title: "Budget vs Actual by Month",
      sourceTab: "Monthly Summary",
      sourceRange: "A2:A13",
      dataRange: "B2:B13",
      placement: { tab: dashboardTab, row: 33, col: 0 },
      width: 900,
      height: 320,
    });
  }

  return charts;
}

// ══════════════════════════════════════════════════════════════
// PART 3: VALIDATION
// Ensures the blueprint meets minimum quality standards
// ══════════════════════════════════════════════════════════════

function validateBlueprint(bp: ProductBlueprint): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (bp.tabs.length < 4) issues.push(`Only ${bp.tabs.length} tabs (minimum 4)`);
  if (!bp.tabs.some((t) => t.name === "Dashboard")) issues.push("Missing Dashboard tab");
  if (!bp.tabs.some((t) => t.columns.length > 2)) issues.push("No tab has enough columns");
  if (bp.charts.length < 1) issues.push("No charts defined");
  if (!bp.colorScheme.primary) issues.push("No color scheme");

  // Check for data entry tab (transactions, log, entries)
  const hasDataEntry = bp.tabs.some((t) =>
    ["transactions", "log", "entries", "data"].some((kw) => t.name.toLowerCase().includes(kw))
  );
  if (!hasDataEntry) issues.push("No data entry tab");

  return { valid: issues.length === 0, issues };
}

// ══════════════════════════════════════════════════════════════
// PART 4: ASSEMBLY
// Combines Gemini analysis + deterministic enrichment
// ══════════════════════════════════════════════════════════════

// Map Gemini's productCategory to a niche profile ID
function resolveNicheProfileId(analysis: GeminiAnalysis): string {
  const catMap: Record<string, string> = {
    budget_tracker: "paycheck-budget",
    paycheck_budget: "paycheck-budget",
    business_pl: "business-pl",
    wedding_planner: "wedding-planner",
    travel_planner: "travel-planner",
    side_hustle: "side-hustle",
    savings_tracker: "savings-tracker",
    debt_payoff: "debt-payoff",
    meal_planner: "meal-planner",
    expense_tracker: "paycheck-budget",
    investment_tracker: "business-pl",
    fitness_tracker: "savings-tracker",
    habit_tracker: "savings-tracker",
    student_budget: "student-budget",
  };
  // Also check niche text for keywords
  const nicheStr = (analysis.niche || "").toLowerCase();
  if (nicheStr.includes("baby") || nicheStr.includes("newborn") || nicheStr.includes("infant")) return "baby-budget";
  if (nicheStr.includes("wedding") || nicheStr.includes("bridal")) return "wedding-planner";
  if (nicheStr.includes("travel") || nicheStr.includes("trip") || nicheStr.includes("vacation")) return "travel-planner";
  if (nicheStr.includes("pregnancy") || nicheStr.includes("prenatal")) return "baby-budget";
  if (nicheStr.includes("student") || nicheStr.includes("college") || nicheStr.includes("university")) return "student-budget";
  if (nicheStr.includes("meal") || nicheStr.includes("food") || nicheStr.includes("grocery")) return "meal-planner";
  if (nicheStr.includes("debt") || nicheStr.includes("loan") || nicheStr.includes("payoff")) return "debt-payoff";
  return catMap[analysis.productCategory] || "paycheck-budget";
}

/**
 * Build a BlueprintTab from a TabDef + NicheContent.
 * For roles with dedicated builders, uses those. For others, builds
 * from the TabDef's column definitions and niche custom section data.
 */
function buildTabFromDef(
  tabDef: TabDef,
  niche: NicheContent,
  nicheProfileId: string,
  projectName: string,
  allTabNames: string[],
): BlueprintTab {
  const role = tabDef.role;

  // Rich layouts win over every other heuristic. If the TabDef has been
  // tagged with a richLayout, propagate it straight through — the
  // factory-spreadsheet-builder classifier keys on this field to route
  // the tab to its hand-crafted builder (Smart Calendar, Year in Review,
  // AI Money Coach, What-If Simulator).
  if (tabDef.richLayout) {
    return {
      name: tabDef.name,
      purpose: tabDef.purpose,
      columns: [],
      sampleRows: [],
      features: (tabDef.features?.length ? tabDef.features : ["frozen_header"]) as BlueprintTab["features"],
      richLayout: tabDef.richLayout,
    };
  }

  // Dedicated builders for well-known roles
  if (role === "dashboard") return buildDashboardTab(niche, nicheProfileId);
  if (role === "transactions") return buildTransactionsTab(niche);
  if (role === "budget-setup") return buildBudgetSetupTab(niche);
  if (role === "monthly-summary") return buildMonthlySummaryTab(niche);
  if (role === "savings-goals") return buildSavingsGoalsTab(niche);
  if (role === "setup") return buildSetupTab(projectName, allTabNames);

  // For niche-specific tabs, build from TabDef columns + customSections data
  const nicheData = getNicheData(nicheProfileId);
  const customSection = nicheData.customSections?.[tabDef.role.replace(/-/g, "")]
    || nicheData.customSections?.[toCamelCase(tabDef.role)];

  const columns = tabDef.columns.map(c => ({
    name: c.name,
    type: (c.type || "text") as BlueprintTab["columns"][0]["type"],
    width: c.width || 160,
    formula: c.formula,
  }));

  // Use custom section data if available, otherwise empty rows
  const sampleRows: Array<Array<string | number | null>> = customSection
    ? customSection.rows
    : [];

  return {
    name: tabDef.name,
    purpose: tabDef.purpose,
    columns,
    sampleRows,
    features: tabDef.features as BlueprintTab["features"],
  };
}

function toCamelCase(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function assembleBlueprint(
  analysis: GeminiAnalysis,
  nicheContent: NicheContent,
  competitor: CompetitorData,
  factoryRunId: string
): ProductBlueprint {
  const nicheProfileId = resolveNicheProfileId(analysis);
  const tabSetConfig = getTabSetConfig(nicheProfileId);
  const allTabNames = tabSetConfig.tabs.map(t => t.name);

  // Build tabs from the prescribed TabSetConfig (deterministic, niche-specific)
  const tabs: BlueprintTab[] = tabSetConfig.tabs.map(tabDef =>
    buildTabFromDef(tabDef, nicheContent, nicheProfileId, analysis.projectName, allTabNames)
  );

  // Supplement with any Gemini custom tabs that don't overlap prescribed ones
  const existingNames = new Set(tabs.map(t => t.name.toLowerCase()));
  for (const customTab of nicheContent.customTabs) {
    if (!existingNames.has(customTab.name.toLowerCase())) {
      tabs.splice(tabs.length - 1, 0, { // Insert before Setup & Instructions
        name: customTab.name,
        purpose: customTab.purpose,
        columns: customTab.columns.map(c => ({
          name: c.name,
          type: (c.type || "text") as BlueprintTab["columns"][0]["type"],
          width: c.type === "currency" ? 110 : c.type === "date" ? 110 : 160,
        })),
        sampleRows: customTab.sampleRows || [],
        features: ["frozen_header", "alternating_rows"],
      });
    }
  }

  // Build charts
  const charts = buildCharts(analysis, tabs);

  // Build color scheme
  const colorScheme = COLOR_SCHEMES[analysis.colorChoice] || COLOR_SCHEMES["navy-gold"];

  // Build config for the DigitalProduct system
  const config: SheetsConfig = {
    type: "sheets",
    sheetsType: (["budget_tracker", "paycheck_budget", "business_pl"].includes(analysis.productCategory)
      ? analysis.productCategory
      : "budget_tracker") as "budget_tracker" | "paycheck_budget" | "business_pl",
    colorScheme: analysis.colorChoice,
    complexity: "advanced",
  };

  const differentiation: BlueprintDifferentiation = {
    competitorStrengths: analysis.competitorStrengths,
    competitorWeaknesses: analysis.competitorWeaknesses,
    ourImprovements: analysis.ourImprovements,
    positioningAngle: analysis.positioningAngle,
    suggestedPrice: {
      min: Math.max(analysis.recommendedPrice - 3, 3),
      max: analysis.recommendedPrice + 5,
      recommended: analysis.recommendedPrice,
    },
  };

  const listingStrategy: BlueprintListingStrategy = {
    titleKeywords: analysis.titleKeywords,
    positionAs: analysis.pricingTier === "premium" ? "premium" : analysis.pricingTier === "low" ? "value" : "comprehensive",
    uniqueSellingPoints: analysis.uniqueSellingPoints,
  };

  const bpId = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  return {
    id: bpId,
    factoryRunId,
    opportunityId: undefined,
    sourceListingTitle: competitor.title,
    competitorStrengths: analysis.competitorStrengths,
    competitorWeaknesses: analysis.competitorWeaknesses,
    productType: "sheets",
    config,
    differentiation,
    listingStrategy,
    suggestedPrice: analysis.recommendedPrice,
    positioning: analysis.positioningAngle,
    createdAt: new Date().toISOString(),

    // ProductBlueprint fields
    tabs,
    charts,
    colorScheme,
    sampleDataStrategy: `${analysis.productCategory} with 20 realistic transactions across Savings, Needs, Wants, Bills buckets for January`,
    deliveryMethod: "both",
  };
}

// ══════════════════════════════════════════════════════════════
// LOCAL FALLBACK — When Gemini is unavailable (429/quota/key)
// ══════════════════════════════════════════════════════════════

interface NicheDetection {
  productCategory: string;
  niche: string;
  nicheProfileId: string;
  targetCustomer: string;
  colorChoice: GeminiAnalysis["colorChoice"];
  emoji: string;
}

const NICHE_KEYWORD_MAP: Array<{
  keywords: string[];
  detection: NicheDetection;
}> = [
  {
    keywords: ["baby", "newborn", "infant"],
    detection: {
      productCategory: "baby_budget",
      niche: "baby expense tracking",
      nicheProfileId: "baby-budget",
      targetCustomer: "new parents tracking baby-related expenses and milestones",
      colorChoice: "lavender",
      emoji: "👶",
    },
  },
  {
    keywords: ["wedding", "bride", "bridal"],
    detection: {
      productCategory: "wedding_planner",
      niche: "wedding budget planning",
      nicheProfileId: "wedding-planner",
      targetCustomer: "engaged couples planning their wedding budget and vendors",
      colorChoice: "dusty-rose",
      emoji: "💍",
    },
  },
  {
    keywords: ["business", "p&l", "freelance", "revenue", "profit"],
    detection: {
      productCategory: "business_pl",
      niche: "freelance business profit & loss",
      nicheProfileId: "business-pl",
      targetCustomer: "freelancers and small business owners tracking revenue and expenses",
      colorChoice: "navy-gold",
      emoji: "📈",
    },
  },
  {
    keywords: ["paycheck", "bi-weekly", "biweekly"],
    detection: {
      productCategory: "paycheck_budget",
      niche: "paycheck-based budgeting",
      nicheProfileId: "paycheck-budget",
      targetCustomer: "employees budgeting from paycheck to paycheck",
      colorChoice: "sage-green",
      emoji: "💵",
    },
  },
  {
    keywords: ["travel", "trip", "vacation"],
    detection: {
      productCategory: "travel_planner",
      niche: "travel budget planning",
      nicheProfileId: "travel-planner",
      targetCustomer: "travelers planning and tracking trip expenses",
      colorChoice: "ocean",
      emoji: "✈️",
    },
  },
  {
    keywords: ["debt", "payoff", "snowball"],
    detection: {
      productCategory: "debt_payoff",
      niche: "debt payoff tracking",
      nicheProfileId: "debt-payoff",
      targetCustomer: "people working to pay off credit cards, student loans, and other debt",
      colorChoice: "sage-green",
      emoji: "🎯",
    },
  },
  {
    keywords: ["side hustle", "side-hustle", "gig"],
    detection: {
      productCategory: "side_hustle",
      niche: "side hustle income tracking",
      nicheProfileId: "side-hustle",
      targetCustomer: "people managing income from side gigs alongside a day job",
      colorChoice: "navy-gold",
      emoji: "🚀",
    },
  },
  {
    keywords: ["savings", "sinking fund"],
    detection: {
      productCategory: "savings_tracker",
      niche: "savings goal tracking",
      nicheProfileId: "savings-tracker",
      targetCustomer: "savers tracking multiple financial goals and progress",
      colorChoice: "sage-green",
      emoji: "🏦",
    },
  },
  {
    keywords: ["meal", "food", "grocery"],
    detection: {
      productCategory: "meal_planner",
      niche: "meal planning and food budgeting",
      nicheProfileId: "meal-planner",
      targetCustomer: "families and individuals planning meals and tracking food spending",
      colorChoice: "sage-green",
      emoji: "🍽️",
    },
  },
  {
    keywords: ["fitness", "workout", "health"],
    detection: {
      productCategory: "budget_tracker",
      niche: "personal finance tracking",
      nicheProfileId: "paycheck-budget",
      targetCustomer: "health-conscious individuals budgeting for wellness and daily expenses",
      colorChoice: "ocean",
      emoji: "📊",
    },
  },
];

const DEFAULT_DETECTION: NicheDetection = {
  productCategory: "budget_tracker",
  niche: "personal finance tracking",
  nicheProfileId: "paycheck-budget",
  targetCustomer: "individuals who want a clear view of their income and spending",
  colorChoice: "navy-gold",
  emoji: "📊",
};

function detectNicheFromCompetitor(competitor: CompetitorData): NicheDetection {
  const haystack = [
    competitor.title,
    ...competitor.tags,
    competitor.niche ?? "",
  ]
    .join(" ")
    .toLowerCase();

  for (const entry of NICHE_KEYWORD_MAP) {
    if (entry.keywords.some((kw) => haystack.includes(kw))) {
      return entry.detection;
    }
  }
  return DEFAULT_DETECTION;
}

function buildLocalAnalysis(competitor: CompetitorData): GeminiAnalysis {
  const det = detectNicheFromCompetitor(competitor);
  const tabSet = getTabSetConfig(det.nicheProfileId);
  const tabNames = tabSet.tabs.map((t) => t.name);
  const tabPurposes = tabSet.tabs.map((t) => t.purpose);

  const basePrice = competitor.price > 0 ? competitor.price : 8.31;
  const recommendedPrice =
    Math.round(basePrice * 1.2 * 100) / 100 || 9.97;

  // Derive a project name from competitor title
  const projectName =
    competitor.title
      .replace(/\b(etsy|digital|download|instant|template|spreadsheet|google sheets)\b/gi, "")
      .replace(/[|,\-–—]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim() || "Budget Tracker";

  console.warn(
    `[Blueprint] ⚡ Using local fallback — Gemini unavailable (niche: ${det.nicheProfileId})`
  );

  return {
    productCategory: det.productCategory,
    niche: det.niche,
    targetCustomer: det.targetCustomer,
    tabNames,
    tabPurposes,
    chartTypes: ["donut", "column"],
    competitorStrengths: [
      "Established listing with existing reviews",
      "Proven market demand in this niche",
      "Competitive pricing strategy",
    ],
    competitorWeaknesses: [
      "Limited visual dashboard design",
      "No automated budget tracking formulas",
      "Missing savings goal progress tracking",
    ],
    ourImprovements: [
      "Professional dashboard with KPI cards and charts",
      "Automatic category totals and budget variance tracking",
      "Visual savings goal progress with thermometer bars",
    ],
    positioningAngle: `A more polished, data-rich alternative for ${det.targetCustomer}`,
    colorChoice: det.colorChoice,
    pricingTier: "mid",
    recommendedPrice,
    titleKeywords: competitor.tags.length > 0
      ? competitor.tags.slice(0, 8)
      : ["budget tracker", "google sheets", "spreadsheet template"],
    uniqueSellingPoints: [
      "Auto-calculating dashboard with live KPI tracking",
      "Niche-specific categories and sample data pre-filled",
      "Beautiful pastel design optimized for Etsy buyers",
    ],
    projectName,
  };
}

function buildLocalNicheContent(analysis: GeminiAnalysis): NicheContent {
  const nicheProfileId = resolveNicheProfileId(analysis);
  const nicheData = getNicheData(nicheProfileId);

  // Expense categories from niche budget categories
  const expenseCategories = nicheData.budgetCategories.map((c) => c.name);

  // Savings goals
  const savingsGoals = nicheData.savingsGoals.map((g) => ({
    name: g.name,
    target: g.target,
    saved: g.saved,
  }));

  // Buckets and percentages — niche-appropriate
  const bucketMap: Record<string, { buckets: string[]; pcts: number[] }> = {
    "baby-budget":       { buckets: ["Savings", "Baby Essentials", "Baby Extras", "Bills"], pcts: [20, 35, 15, 30] },
    "wedding-planner":   { buckets: ["Savings", "Wedding Must-Haves", "Wedding Extras", "Living Expenses"], pcts: [15, 40, 20, 25] },
    "business-pl":       { buckets: ["Tax Reserve", "Business Costs", "Owner Pay", "Reinvestment"], pcts: [25, 30, 30, 15] },
    "paycheck-budget":   { buckets: ["Savings", "Needs", "Wants", "Bills"], pcts: [20, 35, 20, 25] },
    "travel-planner":    { buckets: ["Savings", "Transport", "Accommodation", "Activities"], pcts: [20, 30, 30, 20] },
    "debt-payoff":       { buckets: ["Debt Payment", "Essentials", "Minimal Lifestyle", "Emergency"], pcts: [40, 35, 15, 10] },
    "side-hustle":       { buckets: ["Tax Savings", "Business Costs", "Living Expenses", "Profit"], pcts: [25, 20, 35, 20] },
    "savings-tracker":   { buckets: ["Savings", "Fixed Bills", "Discretionary", "Goals"], pcts: [30, 30, 20, 20] },
    "meal-planner":      { buckets: ["Groceries", "Dining Out", "Meal Prep", "Treats"], pcts: [50, 20, 20, 10] },
  };
  const bk = bucketMap[nicheProfileId] ?? bucketMap["paycheck-budget"]!;

  // Dashboard title with emoji
  const emojiMap: Record<string, string> = {
    "baby-budget": "👶", "wedding-planner": "💍", "business-pl": "📈",
    "paycheck-budget": "💵", "travel-planner": "✈️", "debt-payoff": "🎯",
    "side-hustle": "🚀", "savings-tracker": "🏦", "meal-planner": "🍽️",
  };
  const emoji = emojiMap[nicheProfileId] ?? "📊";
  const dashboardTitle = `${emoji} ${analysis.projectName.toUpperCase()}`;
  const dashboardSubtitle = nicheData.tagline;
  const incomeLabel = nicheData.kpiLabels[0];
  const defaultMonthlyIncome = nicheData.monthlyIncome;

  // Generate 20 sample transactions from budget categories with Jan 2026 dates
  const sampleTransactions: NicheContent["sampleTransactions"] = [];
  const cats = nicheData.budgetCategories;
  for (let i = 0; i < 20; i++) {
    const cat = cats[i % cats.length];
    const day = String(Math.min(1 + i, 28)).padStart(2, "0");
    const amount = Math.round(cat.budgetAmount * (0.3 + Math.random() * 0.9) * 100) / 100;
    const bucketIdx = i % bk.buckets.length;
    sampleTransactions.push({
      date: `2026-01-${day}`,
      desc: `${cat.name} payment`,
      amount,
      subCat: cat.name,
      category: cat.name,
      bucket: bk.buckets[bucketIdx],
      month: "January",
    });
  }

  // Custom tabs from niche data custom sections
  const customTabs: NicheContent["customTabs"] = [];
  if (nicheData.customSections) {
    for (const [key, section] of Object.entries(nicheData.customSections)) {
      customTabs.push({
        name: key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim(),
        purpose: `Niche-specific ${key} tracking`,
        columns: section.headers.map((h) => ({ name: h, type: "text" })),
        sampleRows: section.rows,
      });
    }
  }

  console.warn(
    `[Blueprint] ⚡ Using local niche content fallback (niche: ${nicheProfileId})`
  );

  return {
    dashboardTitle,
    dashboardSubtitle,
    incomeLabel,
    expenseCategories,
    buckets: bk.buckets,
    bucketPercentages: bk.pcts,
    savingsGoals,
    sampleTransactions,
    customTabs,
    defaultMonthlyIncome,
  };
}

// ══════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════

export async function generateBlueprint(
  competitor: CompetitorData,
  factoryRunId: string,
  competitorFeatures?: CompetitorFeatures,
): Promise<ProductBlueprint> {
  const apiKey = process.env.GEMINI_API_KEY;

  let analysis: GeminiAnalysis;
  let nicheContent: NicheContent;
  let usedFallback = false;

  // Step 1: Try Gemini strategic analysis, fall back to local templates
  try {
    if (!apiKey) throw new Error("No API key — GEMINI_API_KEY not configured");
    const prompt = buildAnalysisPrompt(competitor, competitorFeatures);
    const rawText = await callGeminiJSON(apiKey, prompt);
    const raw = parseGeminiJSON<Record<string, unknown>>(rawText);
    analysis = parseAnalysis(raw);
  } catch (err) {
    console.warn("[Blueprint] Gemini analysis failed, using local fallback:", (err as Error).message);
    analysis = buildLocalAnalysis(competitor);
    usedFallback = true;
  }

  // Step 2: Try Gemini niche content, fall back to local
  try {
    if (!apiKey || usedFallback) throw new Error("Using fallback");
    const nichePrompt = buildNicheContentPrompt(analysis);
    const nicheRawText = await callGeminiJSON(apiKey, nichePrompt);
    const nicheRaw = parseGeminiJSON<Record<string, unknown>>(nicheRawText);
    nicheContent = parseNicheContent(nicheRaw);
  } catch (err) {
    console.warn("[Blueprint] Gemini niche content failed, using local fallback:", (err as Error).message);
    nicheContent = buildLocalNicheContent(analysis);
  }

  // Step 3: Assemble blueprint with niche-specific content
  const blueprint = assembleBlueprint(analysis, nicheContent, competitor, factoryRunId);

  // Step 4: Validation
  const { valid, issues } = validateBlueprint(blueprint);
  if (!valid) {
    console.warn("[Blueprint] Validation issues (auto-fixed):", issues);
    // Auto-fix: these were already handled by the ensure-minimum-tabs logic
  }

  // Step 5: Generate AI visual direction (controls all image/video composition)
  try {
    const { generateVisualDirection } = await import("@/lib/gemini-visual-direction");
    blueprint.visualDirection = await generateVisualDirection({
      niche: analysis.productCategory,
      nicheLabel: analysis.projectName,
      productTitle: competitor.title,
      targetCustomer: analysis.targetCustomer,
      tabNames: blueprint.tabs.map(t => t.name),
      colorScheme: blueprint.colorScheme,
    });
    console.log("[Blueprint] ✨ Visual direction generated");
  } catch (err) {
    console.warn("[Blueprint] Visual direction generation failed:", (err as Error).message?.slice(0, 80));
  }

  // ── Gemini-First Spec Chain (Steps 6-9) ──────────────────
  // These generate the full creative brief alongside the legacy blueprint.
  // All downstream systems (images, video, copy) consume these specs.

  // Step 6: Generate ProductConceptSpec
  try {
    const { generateProductConcept } = await import("@/lib/gemini-concept-generator");
    blueprint.conceptSpec = await generateProductConcept({
      niche: analysis.productCategory,
      nicheLabel: analysis.projectName,
      productType: "google-sheets",
      competitorTitle: competitor.title,
      competitorPrice: competitor.price,
      competitorStrengths: analysis.competitorStrengths,
      competitorWeaknesses: analysis.competitorWeaknesses,
      targetKeyword: competitor.title,
    });
    console.log("[Blueprint] ✨ Product concept generated");
  } catch (err) {
    console.warn("[Blueprint] Concept generation failed:", (err as Error).message?.slice(0, 80));
  }

  // Step 7: Generate ProductStructureSpec
  try {
    const { generateProductStructure } = await import("@/lib/gemini-structure-generator");
    const concept = blueprint.conceptSpec || (await import("@/lib/gemini-concept-generator")).buildFallbackConcept({
      niche: analysis.productCategory, nicheLabel: analysis.projectName, productType: "google-sheets",
    });
    blueprint.structureSpec = await generateProductStructure({
      concept,
      existingTabNames: blueprint.tabs.map(t => t.name),
      colorScheme: blueprint.colorScheme,
    });
    console.log("[Blueprint] ✨ Product structure generated");

    // Step 7b: Override blueprint color with StructureSpec's AI-chosen color
    const structureColor = blueprint.structureSpec?.sheets?.colorScheme;
    if (structureColor?.primary && structureColor.primary !== blueprint.colorScheme.primary) {
      const oldColor = blueprint.colorScheme.primary;
      blueprint.colorScheme = {
        primary: structureColor.primary,
        secondary: structureColor.secondary || blueprint.colorScheme.secondary,
        accent: structureColor.accent || blueprint.colorScheme.accent,
        background: blueprint.colorScheme.background,
        text: blueprint.colorScheme.text,
        success: blueprint.colorScheme.success,
        danger: blueprint.colorScheme.danger,
      };
      console.log(`[Blueprint] 🎨 Color override: ${oldColor} → ${structureColor.primary} (from StructureSpec)`);
    }
  } catch (err) {
    console.warn("[Blueprint] Structure generation failed:", (err as Error).message?.slice(0, 80));
  }

  // Step 8: Generate direction specs in parallel (video, positioning, copy)
  try {
    const concept = blueprint.conceptSpec || (await import("@/lib/gemini-concept-generator")).buildFallbackConcept({
      niche: analysis.productCategory, nicheLabel: analysis.projectName, productType: "google-sheets",
    });
    const structure = blueprint.structureSpec || (await import("@/lib/gemini-structure-generator")).buildFallbackStructure({ concept });
    const sectionNames = blueprint.tabs.map(t => t.name);

    const [videoDir, positioning] = await Promise.allSettled([
      import("@/lib/gemini-video-direction").then(m => m.generateVideoDirection({ concept, structure, sectionNames })),
      import("@/lib/gemini-listing-positioning").then(m => m.generateListingPositioning({ concept })),
    ]);

    if (videoDir.status === "fulfilled") {
      blueprint.videoDirection = videoDir.value;
      console.log("[Blueprint] ✨ Video direction generated");
    } else {
      console.warn("[Blueprint] Video direction failed:", videoDir.reason?.message?.slice(0, 80));
    }

    if (positioning.status === "fulfilled") {
      blueprint.listingPositioning = positioning.value;
      console.log("[Blueprint] ✨ Listing positioning generated");
    } else {
      console.warn("[Blueprint] Listing positioning failed:", positioning.reason?.message?.slice(0, 80));
    }

    // Step 9: Copy direction (depends on positioning)
    try {
      const pos = blueprint.listingPositioning || (await import("@/lib/gemini-listing-positioning")).buildFallbackPositioning(concept);
      const { generateCopyDirection } = await import("@/lib/gemini-copy-direction");
      blueprint.copyDirection = await generateCopyDirection({ concept, positioning: pos });
      console.log("[Blueprint] ✨ Copy direction generated");
    } catch (copyErr) {
      console.warn("[Blueprint] Copy direction failed:", (copyErr as Error).message?.slice(0, 80));
    }
  } catch (err) {
    console.warn("[Blueprint] Direction spec chain failed:", (err as Error).message?.slice(0, 80));
  }

  const specCount = [blueprint.conceptSpec, blueprint.structureSpec, blueprint.visualDirection, blueprint.videoDirection, blueprint.listingPositioning, blueprint.copyDirection].filter(Boolean).length;
  console.log(`[Blueprint] Gemini spec chain: ${specCount}/6 specs generated`);

  return blueprint;
}
