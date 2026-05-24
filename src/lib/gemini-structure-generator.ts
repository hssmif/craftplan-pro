// ══════════════════════════════════════════════════════════════
// Gemini Product Structure Generator
//
// Step 2 of the Gemini-first spec chain.
// Takes ProductConceptSpec → ProductStructureSpec
//
// This answers: WHAT does the product contain — tabs, pages,
// sections, databases — specific to the product type.
// ══════════════════════════════════════════════════════════════

import { callGeminiJSON, parseGeminiJSON } from "@/lib/gemini";
import type { ProductConceptSpec, ProductStructureSpec, SheetsStructure, GeminiProductType } from "@/types/gemini-specs";
import { clampStructureSpec } from "@/types/gemini-specs";

export interface StructureGeneratorInput {
  concept: ProductConceptSpec;
  /** Override product type if different from concept */
  productType?: GeminiProductType;
  /** Existing tab names from competitor analysis (for Sheets) */
  existingTabNames?: string[];
  /** Color scheme from theme resolution */
  colorScheme?: { primary: string; secondary: string; accent: string; background: string; text: string; success: string; danger: string };
}

function buildSheetsStructurePrompt(input: StructureGeneratorInput): string {
  const c = input.concept;
  return `You are a product architect designing a premium Google Sheets template for Etsy.

PRODUCT CONCEPT:
- Niche: ${c.nicheLabel}
- Target Customer: ${c.targetCustomer}
- Product Promise: ${c.productPromise}
- Unique Angle: ${c.uniqueAngle}
- Pain Points: ${c.customerPainPoints.join("; ")}
- Brand Personality: ${c.brandPersonality.join(", ")}
- Price: $${c.recommendedPrice} (${c.pricePositioning})
${input.existingTabNames ? `\nCOMPETITOR TABS: ${input.existingTabNames.join(", ")}` : ""}

Your job: Design a product structure that feels premium, niche-specific, and genuinely useful. The structure must match the niche's personality — a wedding planner has DIFFERENT sections than a business P&L.

CRITICAL RULES:
- Do NOT create a generic "Budget Tracker" with renamed tabs
- Each niche needs UNIQUE tab types (wedding needs "Vendor Tracker", not just "Transactions")
- Dashboard layout should match the niche's KPI model (wedding = budget vs spent per category, business = P&L margins)
- Tab count: 5-9 tabs (fewer = more focused, more = more comprehensive)
- Include at least one tab that is UNIQUE to this niche (not found in generic budget templates)
- Columns must include at least 1-2 formula columns per data-entry tab
- Sample data strategy should match the niche (wedding = vendor names/dates, business = revenue/expense categories)

Return a JSON object:
{
  "version": 1,
  "productType": "google-sheets",
  "title": "<product title>",
  "subtitle": "<tagline>",
  "sections": [
    { "id": "s1", "name": "<section name>", "purpose": "<what it does>", "order": 1, "contentType": "<type>" }
  ],
  "sheets": {
    "tabs": [
      {
        "name": "<Tab Name>",
        "purpose": "<1-2 sentence purpose>",
        "tabType": "dashboard" | "data-entry" | "reference" | "settings" | "summary" | "tracker",
        "columns": [
          { "name": "<col name>", "type": "text" | "currency" | "percent" | "date" | "formula" | "number" | "dropdown" | "checkbox", "width": <optional>, "formula": "<optional formula hint>" }
        ],
        "sampleRowCount": <5-15>,
        "features": ["frozen_header", "conditional_formatting", ...]
      }
    ],
    "charts": [
      { "type": "<chart type>", "title": "<title>", "sourceTab": "<tab>", "purpose": "<why>", "placement": { "tab": "<where>", "row": 1, "col": 1 } }
    ],
    "colorScheme": ${JSON.stringify(input.colorScheme || { primary: "#1B3A5C", secondary: "#2D5A87", accent: "#E8A87C", background: "#F8F9FA", text: "#1F2937", success: "#059669", danger: "#DC2626" })},
    "sampleDataStrategy": "<describe what sample data should look like for this niche>",
    "deliveryMethod": "xlsx_download",
    "kpiModel": {
      "primaryMetric": "<the #1 number on the dashboard>",
      "secondaryMetrics": ["<metric 2>", "<metric 3>"],
      "comparisonType": "budget-vs-actual" | "month-over-month" | "goal-progress" | "category-breakdown",
      "goalType": "<niche-specific goal>"
    },
    "dashboardStyle": "data-heavy" | "visual-focused" | "balanced" | "minimal-clean"
  }
}

Be BOLD and niche-specific. Generic = failure.

Respond ONLY with the JSON. No markdown, no explanation.`;
}

function buildGenericStructurePrompt(input: StructureGeneratorInput): string {
  const c = input.concept;
  const pt = input.productType || c.productType;
  return `You are a product architect designing a premium ${pt} digital product for Etsy.

PRODUCT CONCEPT:
- Niche: ${c.nicheLabel}
- Target Customer: ${c.targetCustomer}
- Product Promise: ${c.productPromise}
- Unique Angle: ${c.uniqueAngle}
- Brand Personality: ${c.brandPersonality.join(", ")}

Design a product structure with sections appropriate for a ${pt} product.

Return a JSON object:
{
  "version": 1,
  "productType": "${pt}",
  "title": "<product title>",
  "subtitle": "<tagline>",
  "sections": [
    { "id": "s1", "name": "<section>", "purpose": "<purpose>", "order": 1, "contentType": "<type>" }
  ]
}

Respond ONLY with the JSON. No markdown.`;
}

/**
 * Call Gemini to generate a ProductStructureSpec.
 */
export async function generateProductStructure(
  input: StructureGeneratorInput,
): Promise<ProductStructureSpec> {
  const apiKey = process.env.GEMINI_API_KEY;
  const pt = input.productType || input.concept.productType;

  if (apiKey) {
    try {
      const prompt = pt === "google-sheets" || pt === "excel-tracker"
        ? buildSheetsStructurePrompt(input)
        : buildGenericStructurePrompt(input);
      const rawText = await callGeminiJSON(apiKey, prompt);
      const raw = parseGeminiJSON<Partial<ProductStructureSpec>>(rawText);
      const spec = clampStructureSpec(raw);
      const tabCount = spec.sheets?.tabs.length || spec.sections.length;
      console.log(
        `[StructureGen] ✨ Gemini structure for "${input.concept.nicheLabel}" — ${tabCount} tabs/sections, dashboard=${spec.sheets?.dashboardStyle || "N/A"}`,
      );
      return spec;
    } catch (err) {
      console.warn("[StructureGen] Gemini failed, using fallback:", (err as Error).message?.slice(0, 80));
    }
  }

  return buildFallbackStructure(input);
}

/**
 * Deterministic fallback — produces niche-specific structures without Gemini.
 */
export function buildFallbackStructure(input: StructureGeneratorInput): ProductStructureSpec {
  const c = input.concept;
  const nicheKey = c.niche.toLowerCase().replace(/[-_\s]/g, "");
  const cs = input.colorScheme || { primary: "#1B3A5C", secondary: "#2D5A87", accent: "#E8A87C", background: "#F8F9FA", text: "#1F2937", success: "#059669", danger: "#DC2626" };

  // Wedding-specific structure
  if (nicheKey.includes("wedding") || nicheKey.includes("bridal")) {
    return clampStructureSpec({
      version: 1, productType: "google-sheets", title: c.suggestedTitle, subtitle: "Track every vendor, payment, and deadline",
      sections: [
        { id: "s1", name: "Dashboard", purpose: "Total budget overview with category breakdown", order: 1, contentType: "dashboard" },
        { id: "s2", name: "Vendor Tracker", purpose: "Track all vendors, contracts, deposits, and payment due dates", order: 2, contentType: "tracker" },
        { id: "s3", name: "Guest List", purpose: "RSVP tracking, meal preferences, table assignments", order: 3, contentType: "data-entry" },
        { id: "s4", name: "Budget Categories", purpose: "Venue, catering, photography, flowers, attire, music, decor", order: 4, contentType: "reference" },
        { id: "s5", name: "Payment Timeline", purpose: "Due dates, deposit schedules, payment status", order: 5, contentType: "tracker" },
        { id: "s6", name: "Instructions", purpose: "How to use the planner", order: 6, contentType: "instructions" },
      ],
      sheets: {
        tabs: [
          { name: "Dashboard", purpose: "Wedding budget at a glance", tabType: "dashboard", columns: [], sampleRowCount: 0, features: ["frozen_header", "conditional_formatting", "chart"] },
          { name: "Vendor Tracker", purpose: "All vendor details, payments, and status", tabType: "tracker", columns: [
            { name: "Vendor", type: "text" }, { name: "Category", type: "dropdown", dropdownOptions: ["Venue", "Catering", "Photography", "Flowers", "Music", "Attire", "Decor", "Other"] },
            { name: "Contract Amount", type: "currency" }, { name: "Deposit Paid", type: "currency" }, { name: "Balance Due", type: "formula", formula: "=C-D" },
            { name: "Due Date", type: "date" }, { name: "Status", type: "dropdown", dropdownOptions: ["Contacted", "Booked", "Deposit Paid", "Paid in Full"] },
          ], sampleRowCount: 10, features: ["frozen_header", "dropdown_validation", "conditional_formatting"] },
          { name: "Guest List", purpose: "Track RSVPs and meal preferences", tabType: "data-entry", columns: [
            { name: "Name", type: "text" }, { name: "Party", type: "text" }, { name: "RSVP", type: "dropdown", dropdownOptions: ["Pending", "Yes", "No", "Maybe"] },
            { name: "Meal", type: "dropdown", dropdownOptions: ["Chicken", "Fish", "Vegetarian", "Vegan"] }, { name: "Table #", type: "number" },
          ], sampleRowCount: 15, features: ["frozen_header", "dropdown_validation", "alternating_rows"] },
          { name: "Budget Setup", purpose: "Set budget per category", tabType: "settings", columns: [
            { name: "Category", type: "text" }, { name: "Budgeted", type: "currency" }, { name: "Actual", type: "formula" }, { name: "Remaining", type: "formula" },
          ], sampleRowCount: 8, features: ["frozen_header", "conditional_formatting"] },
          { name: "Payment Timeline", purpose: "Upcoming payments sorted by date", tabType: "summary", columns: [
            { name: "Date", type: "date" }, { name: "Vendor", type: "text" }, { name: "Amount", type: "currency" }, { name: "Type", type: "text" }, { name: "Paid", type: "checkbox" },
          ], sampleRowCount: 12, features: ["frozen_header", "conditional_formatting", "alternating_rows"] },
          { name: "Instructions", purpose: "Getting started guide", tabType: "reference", columns: [], sampleRowCount: 0, features: [] },
        ],
        charts: [
          { type: "donut", title: "Budget by Category", sourceTab: "Budget Setup", purpose: "Visual category breakdown", placement: { tab: "Dashboard", row: 4, col: 5 } },
          { type: "bar", title: "Budget vs Actual", sourceTab: "Budget Setup", purpose: "Spending tracking", placement: { tab: "Dashboard", row: 12, col: 1 } },
        ],
        colorScheme: cs,
        sampleDataStrategy: "Wedding vendor names (The Grand Ballroom, Rosemary Florals, etc.) with realistic pricing ($3,000-$15,000 venue, $2,000-$5,000 catering)",
        deliveryMethod: "xlsx_download",
        kpiModel: { primaryMetric: "Total Budget Remaining", secondaryMetrics: ["Deposits Paid", "Vendors Booked", "Guest Count"], comparisonType: "budget-vs-actual", goalType: "Stay under total wedding budget" },
        dashboardStyle: "visual-focused",
      },
    });
  }

  // Business P&L structure
  if (nicheKey.includes("business") || nicheKey.includes("revenue") || nicheKey.includes("pl") || nicheKey.includes("profit")) {
    return clampStructureSpec({
      version: 1, productType: "google-sheets", title: c.suggestedTitle, subtitle: "Your monthly P&L at a glance",
      sections: [
        { id: "s1", name: "P&L Dashboard", purpose: "Revenue, expenses, profit at a glance", order: 1, contentType: "dashboard" },
        { id: "s2", name: "Revenue Log", purpose: "Track all income sources", order: 2, contentType: "data-entry" },
        { id: "s3", name: "Expense Log", purpose: "Track all business expenses", order: 3, contentType: "data-entry" },
        { id: "s4", name: "Monthly P&L", purpose: "Automated monthly profit/loss calculation", order: 4, contentType: "summary" },
        { id: "s5", name: "Categories", purpose: "Revenue and expense categories", order: 5, contentType: "reference" },
      ],
      sheets: {
        tabs: [
          { name: "P&L Dashboard", purpose: "Revenue, costs, net profit at a glance", tabType: "dashboard", columns: [], sampleRowCount: 0, features: ["frozen_header", "chart", "conditional_formatting"] },
          { name: "Revenue Log", purpose: "All income entries", tabType: "data-entry", columns: [
            { name: "Date", type: "date" }, { name: "Client/Source", type: "text" }, { name: "Category", type: "dropdown" },
            { name: "Amount", type: "currency" }, { name: "Payment Method", type: "dropdown" }, { name: "Notes", type: "text" },
          ], sampleRowCount: 12, features: ["frozen_header", "dropdown_validation", "alternating_rows"] },
          { name: "Expense Log", purpose: "All expense entries", tabType: "data-entry", columns: [
            { name: "Date", type: "date" }, { name: "Vendor", type: "text" }, { name: "Category", type: "dropdown" },
            { name: "Amount", type: "currency" }, { name: "Tax Deductible", type: "checkbox" }, { name: "Receipt", type: "text" },
          ], sampleRowCount: 15, features: ["frozen_header", "dropdown_validation", "conditional_formatting", "alternating_rows"] },
          { name: "Monthly P&L", purpose: "Automated monthly summary", tabType: "summary", columns: [
            { name: "Month", type: "text" }, { name: "Revenue", type: "formula" }, { name: "Expenses", type: "formula" },
            { name: "Net Profit", type: "formula" }, { name: "Margin %", type: "formula" },
          ], sampleRowCount: 12, features: ["frozen_header", "conditional_formatting", "chart"] },
          { name: "Categories", purpose: "Revenue and expense categories", tabType: "reference", columns: [
            { name: "Category", type: "text" }, { name: "Type", type: "dropdown", dropdownOptions: ["Revenue", "Expense"] },
          ], sampleRowCount: 10, features: ["frozen_header"] },
          { name: "Instructions", purpose: "Setup guide", tabType: "reference", columns: [], sampleRowCount: 0, features: [] },
        ],
        charts: [
          { type: "line", title: "Monthly Revenue vs Expenses", sourceTab: "Monthly P&L", purpose: "Trend tracking", placement: { tab: "P&L Dashboard", row: 4, col: 1 } },
          { type: "donut", title: "Expense Breakdown", sourceTab: "Expense Log", purpose: "Category analysis", placement: { tab: "P&L Dashboard", row: 4, col: 6 } },
        ],
        colorScheme: cs,
        sampleDataStrategy: "Business-realistic entries (Stripe payments, AWS hosting, contractor invoices) with revenue $3k-$15k/mo and expenses $1k-$8k/mo",
        deliveryMethod: "xlsx_download",
        kpiModel: { primaryMetric: "Net Profit This Month", secondaryMetrics: ["Total Revenue", "Total Expenses", "Profit Margin %"], comparisonType: "month-over-month", goalType: "Grow monthly profit margin" },
        dashboardStyle: "data-heavy",
      },
    });
  }

  // Travel structure
  if (nicheKey.includes("travel")) {
    return clampStructureSpec({
      version: 1, productType: "google-sheets", title: c.suggestedTitle, subtitle: "Plan your perfect trip on budget",
      sections: [
        { id: "s1", name: "Trip Dashboard", purpose: "Trip budget overview", order: 1, contentType: "dashboard" },
        { id: "s2", name: "Itinerary", purpose: "Day-by-day plan with costs", order: 2, contentType: "tracker" },
        { id: "s3", name: "Expenses", purpose: "Track all trip spending", order: 3, contentType: "data-entry" },
        { id: "s4", name: "Packing List", purpose: "What to bring checklist", order: 4, contentType: "checklist" },
      ],
      sheets: {
        tabs: [
          { name: "Trip Dashboard", purpose: "Budget overview with daily spending", tabType: "dashboard", columns: [], sampleRowCount: 0, features: ["frozen_header", "chart"] },
          { name: "Itinerary", purpose: "Day-by-day plan with estimated costs", tabType: "tracker", columns: [
            { name: "Day", type: "number" }, { name: "Date", type: "date" }, { name: "Activity", type: "text" },
            { name: "Location", type: "text" }, { name: "Est. Cost", type: "currency" }, { name: "Actual Cost", type: "currency" },
            { name: "Booked", type: "checkbox" },
          ], sampleRowCount: 10, features: ["frozen_header", "conditional_formatting", "alternating_rows"] },
          { name: "Expenses", purpose: "All trip expenses", tabType: "data-entry", columns: [
            { name: "Date", type: "date" }, { name: "Category", type: "dropdown", dropdownOptions: ["Flights", "Hotels", "Food", "Transport", "Activities", "Shopping", "Other"] },
            { name: "Description", type: "text" }, { name: "Amount", type: "currency" }, { name: "Currency", type: "text" },
          ], sampleRowCount: 15, features: ["frozen_header", "dropdown_validation", "alternating_rows"] },
          { name: "Packing List", purpose: "Travel checklist", tabType: "reference", columns: [
            { name: "Item", type: "text" }, { name: "Category", type: "text" }, { name: "Packed", type: "checkbox" },
          ], sampleRowCount: 20, features: ["frozen_header", "alternating_rows"] },
          { name: "Budget Setup", purpose: "Set trip budget", tabType: "settings", columns: [
            { name: "Category", type: "text" }, { name: "Budget", type: "currency" }, { name: "Spent", type: "formula" }, { name: "Remaining", type: "formula" },
          ], sampleRowCount: 7, features: ["frozen_header", "conditional_formatting"] },
          { name: "Instructions", purpose: "How to use", tabType: "reference", columns: [], sampleRowCount: 0, features: [] },
        ],
        charts: [
          { type: "donut", title: "Spending by Category", sourceTab: "Expenses", purpose: "Category breakdown", placement: { tab: "Trip Dashboard", row: 4, col: 5 } },
          { type: "bar", title: "Daily Spending", sourceTab: "Itinerary", purpose: "Day-by-day tracking", placement: { tab: "Trip Dashboard", row: 12, col: 1 } },
        ],
        colorScheme: cs,
        sampleDataStrategy: "Realistic travel data (flights $300-$800, hotels $80-$200/night, food $30-$80/day) for a 7-10 day trip",
        deliveryMethod: "xlsx_download",
        kpiModel: { primaryMetric: "Trip Budget Remaining", secondaryMetrics: ["Daily Average Spend", "Total Booked", "Days Planned"], comparisonType: "budget-vs-actual", goalType: "Stay under trip budget" },
        dashboardStyle: "balanced",
      },
    });
  }

  // Default / Paycheck budget
  return clampStructureSpec({
    version: 1, productType: "google-sheets", title: c.suggestedTitle, subtitle: "Take control of every paycheck",
    sections: [
      { id: "s1", name: "Dashboard", purpose: "Monthly overview", order: 1, contentType: "dashboard" },
      { id: "s2", name: "Transactions", purpose: "Log all income and expenses", order: 2, contentType: "data-entry" },
      { id: "s3", name: "Budget Setup", purpose: "Set monthly budget categories", order: 3, contentType: "settings" },
      { id: "s4", name: "Savings Goals", purpose: "Track savings progress", order: 4, contentType: "tracker" },
    ],
    sheets: {
      tabs: [
        { name: "Dashboard", purpose: "Monthly budget at a glance", tabType: "dashboard", columns: [], sampleRowCount: 0, features: ["frozen_header", "chart", "conditional_formatting"] },
        { name: "Transactions", purpose: "Log every income and expense", tabType: "data-entry", columns: [
          { name: "Date", type: "date" }, { name: "Description", type: "text" }, { name: "Category", type: "dropdown" },
          { name: "Amount", type: "currency" }, { name: "Type", type: "dropdown", dropdownOptions: ["Income", "Expense"] },
        ], sampleRowCount: 15, features: ["frozen_header", "dropdown_validation", "conditional_formatting", "alternating_rows"] },
        { name: "Budget Setup", purpose: "Monthly budget per category", tabType: "settings", columns: [
          { name: "Category", type: "text" }, { name: "Budgeted", type: "currency" }, { name: "Spent", type: "formula" }, { name: "Remaining", type: "formula" },
        ], sampleRowCount: 8, features: ["frozen_header", "conditional_formatting"] },
        { name: "Savings Goals", purpose: "Track savings targets", tabType: "tracker", columns: [
          { name: "Goal", type: "text" }, { name: "Target", type: "currency" }, { name: "Saved", type: "currency" }, { name: "Progress", type: "formula" },
        ], sampleRowCount: 5, features: ["frozen_header", "conditional_formatting"] },
        { name: "Bills Calendar", purpose: "Recurring bills and due dates", tabType: "tracker", columns: [
          { name: "Bill", type: "text" }, { name: "Amount", type: "currency" }, { name: "Due Date", type: "date" }, { name: "Paid", type: "checkbox" },
        ], sampleRowCount: 10, features: ["frozen_header", "conditional_formatting", "alternating_rows"] },
        { name: "Instructions", purpose: "How to use this planner", tabType: "reference", columns: [], sampleRowCount: 0, features: [] },
      ],
      charts: [
        { type: "donut", title: "Spending by Category", sourceTab: "Budget Setup", purpose: "Category breakdown", placement: { tab: "Dashboard", row: 4, col: 5 } },
        { type: "bar", title: "Budget vs Actual", sourceTab: "Budget Setup", purpose: "Track overspending", placement: { tab: "Dashboard", row: 12, col: 1 } },
      ],
      colorScheme: cs,
      sampleDataStrategy: "Realistic paycheck budget (rent $1,200, groceries $400, utilities $150, subscriptions $80, gas $120)",
      deliveryMethod: "xlsx_download",
      kpiModel: { primaryMetric: "Money Left This Month", secondaryMetrics: ["Total Income", "Total Spending", "Savings Rate %"], comparisonType: "budget-vs-actual", goalType: "Save 20% of income" },
      dashboardStyle: "balanced",
    },
  });
}
