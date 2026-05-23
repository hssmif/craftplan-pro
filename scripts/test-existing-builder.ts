#!/usr/bin/env npx tsx
/**
 * Smoke test: fabricate a 32-tab ProductBlueprint with niche=paycheck-budget,
 * call buildPremiumSpreadsheet, write to /tmp/factory-budget-v2.xlsx.
 *
 * The 32-tab layout mirrors data/factory-templates/ultimate_budget_reference.xlsx:
 *   README, Settings, Annual Dashboard, Monthly Dashboard,
 *   Smart Calendar (rich), Year in Review (rich),
 *   AI Money Coach (rich), What-If Simulator (rich),
 *   Transactions, January..December, Bills Calendar,
 *   Recurring, Debt Tracker, Savings Goals, Net Worth,
 *   Income Streams, Subscriptions, Sinking Funds,
 *   No-Spend Tracker, Year Goals, Annual Summary.
 *
 * NOT committed — /tmp helper for an ad-hoc audit.
 */
import { writeFileSync } from "node:fs";
import { buildPremiumSpreadsheet } from "@/lib/factory-spreadsheet-builder";
import { getNicheData } from "@/lib/factory-niche-data";
import { resolveNicheProfile } from "@/lib/factory-niche-themes";
import type { ProductBlueprint, BlueprintTab } from "@/types/factory";

const niche = "paycheck-budget";
const nicheData = getNicheData(niche);
const profile = resolveNicheProfile(niche);

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── Helpers ──────────────────────────────────────────────────

function rich(name: string, purpose: string, richLayout: NonNullable<BlueprintTab["richLayout"]>): BlueprintTab {
  return { name, purpose, columns: [], sampleRows: [], features: ["frozen_header"], richLayout };
}

function dataTab(
  name: string,
  purpose: string,
  columns: BlueprintTab["columns"],
  sampleRows: BlueprintTab["sampleRows"],
): BlueprintTab {
  return {
    name,
    purpose,
    columns,
    sampleRows,
    features: ["frozen_header", "alternating_rows", "conditional_formatting"],
  };
}

// ── Tabs ─────────────────────────────────────────────────────

// 1. README — onboarding text (Welcome tab is auto-built, but we provide a README data tab)
const readme: BlueprintTab = dataTab(
  "README",
  "How to use this 32-tab paycheck budget system",
  [
    { name: "Section", type: "text", width: 30 },
    { name: "Detail", type: "text", width: 60 },
  ],
  [
    ["Overview", "A 32-tab personal finance system — Excel + Google Sheets compatible"],
    ["How to use", "1. Open Settings to set your start year, currency, and income target"],
    ["", "2. Log every transaction in the Transactions tab"],
    ["", "3. Dashboards and monthly tabs update via SUMIFS"],
    ["", "4. Track bills, debt, savings, and goals in the dedicated tabs"],
    ["Design", "Cream + sage palette, freeze panes, conditional formatting"],
    ["Tips", "Use dropdown menus on Transactions for Category and Account"],
  ],
);

// 2. Settings
const settings: BlueprintTab = dataTab(
  "Settings",
  "Global workbook settings — drive every other tab",
  [
    { name: "Setting", type: "text", width: 30 },
    { name: "Value", type: "text", width: 20 },
    { name: "Notes", type: "text", width: 40 },
  ],
  [
    ["Start Year", 2026, "Used for date formulas"],
    ["Currency Symbol", "$", "Drives every $ display"],
    ["Currency Code", "USD", "ISO 4217 code"],
    ["Owner Name", "Your Name", "Personalize your dashboard"],
    ["Monthly Income Target", nicheData.monthlyIncome, "From paycheck budget niche profile"],
    ["Monthly Savings Target", Math.round(nicheData.monthlyIncome * 0.15), "Set your savings goal"],
  ],
);

// 3. Annual Dashboard
const annualDashboard: BlueprintTab = {
  name: "Annual Dashboard",
  purpose: "Year overview — KPIs, charts, top categories",
  columns: [
    { name: "Metric", type: "text", width: 24 },
    { name: "Value", type: "currency", width: 16 },
    { name: "Target", type: "currency", width: 16 },
    { name: "Variance", type: "currency", width: 16 },
  ],
  sampleRows: [
    ["Annual Income", nicheData.monthlyIncome * 12, nicheData.monthlyIncome * 12, 0],
    ["Annual Expenses", Math.round(nicheData.monthlyIncome * 10.8), Math.round(nicheData.monthlyIncome * 10.5), Math.round(nicheData.monthlyIncome * 0.3)],
    ["Net Saved", Math.round(nicheData.monthlyIncome * 1.2), Math.round(nicheData.monthlyIncome * 1.5), Math.round(nicheData.monthlyIncome * -0.3)],
    ["Left to Spend", Math.round(nicheData.monthlyIncome * 0.2), 0, Math.round(nicheData.monthlyIncome * 0.2)],
  ],
  features: ["frozen_header", "conditional_formatting", "alternating_rows"],
};

// 4. Monthly Dashboard
const monthlyDashboard: BlueprintTab = {
  name: "Monthly Dashboard",
  purpose: "Current month overview — KPIs, top categories, status",
  columns: [
    { name: "Metric", type: "text", width: 24 },
    { name: "Value", type: "currency", width: 16 },
  ],
  sampleRows: [
    ["Take-Home Pay", nicheData.monthlyIncome],
    ["Bills & Fixed", 2000],
    ["Discretionary", 700],
    ["Remaining", nicheData.monthlyIncome - 2700],
  ],
  features: ["frozen_header", "conditional_formatting", "alternating_rows"],
};

// 5-8. Rich-layout tabs
const smartCalendar = rich(
  "Smart Calendar",
  "Day-by-day transaction calendar with weekly summaries",
  "smart-calendar",
);
const yearInReview = rich(
  "Year in Review",
  "Spotify-Wrapped style year-end recap with badges and headlines",
  "year-in-review",
);
const moneyCoach = rich(
  "AI Money Coach",
  "Six personalized insight cards driven by long formulas",
  "money-coach",
);
const whatIf = rich(
  "What-If Simulator",
  "Adjust 5 levers and watch the projection recalculate",
  "what-if-simulator",
);

// 9. Transactions — main data entry
const transactions: BlueprintTab = dataTab(
  "Transactions",
  "Log every income, expense, savings transfer, and debt payment",
  [
    { name: "Date", type: "date", width: 14 },
    { name: "Type", type: "text", width: 12 },
    { name: "Category", type: "text", width: 18 },
    { name: "Account", type: "text", width: 16 },
    { name: "Description", type: "text", width: 28 },
    { name: "Amount", type: "currency", width: 14 },
    { name: "Month", type: "text", width: 12 },
  ],
  [
    ["2026-01-03", "Income", "Salary", "Checking", "Monthly salary", nicheData.monthlyIncome, "January"],
    ["2026-01-04", "Expense", "Housing", "Checking", "Rent", -1200, "January"],
    ["2026-01-05", "Expense", "Groceries", "Checking", "Whole Foods", -98, "January"],
    ["2026-01-07", "Expense", "Subscriptions", "Credit Card", "Netflix", -16, "January"],
    ["2026-01-08", "Expense", "Utilities", "Checking", "Electric", -95, "January"],
    ["2026-01-10", "Expense", "Dining Out", "Credit Card", "Cafe + lunch", -42, "January"],
    ["2026-01-12", "Saving", "Emergency Fund", "Savings", "Auto-transfer", -500, "January"],
    ["2026-01-14", "Expense", "Transportation", "Credit Card", "Gas", -55, "January"],
    ["2026-01-25", "Debt", "Credit Card", "Checking", "CC payment", -350, "January"],
  ],
);

// 10-21. Monthly tabs (January..December)
function monthTab(month: string): BlueprintTab {
  // Use niche budget categories for variety
  const rows = nicheData.budgetCategories.map((c, i) => {
    const variance = (i % 5) * 0.06 + 0.85;
    const spent = Math.round(c.budgetAmount * variance);
    return [c.name, c.budgetAmount, spent, c.budgetAmount - spent];
  });
  return dataTab(
    month,
    `${month} budget — category, budgeted, spent, remaining`,
    [
      { name: "Category", type: "text", width: 22 },
      { name: "Budget", type: "currency", width: 14 },
      { name: "Spent", type: "currency", width: 14 },
      { name: "Remaining", type: "currency", width: 14 },
    ],
    rows,
  );
}
const monthlyTabs: BlueprintTab[] = MONTHS.map(monthTab);

// 22. Bills Calendar
const billsCalendar: BlueprintTab = dataTab(
  "Bills Calendar",
  "Track recurring bills with budgeted, actual, and variance",
  [
    { name: "Bill", type: "text", width: 22 },
    { name: "Category", type: "text", width: 16 },
    { name: "Account", type: "text", width: 14 },
    { name: "Budget", type: "currency", width: 12 },
    { name: "Real", type: "currency", width: 12 },
    { name: "Diff", type: "currency", width: 12 },
    { name: "Annual", type: "currency", width: 14 },
  ],
  [
    ["Rent / Mortgage", "Housing", "Checking", 1200, 1200, 0, 14400],
    ["Electric", "Utilities", "Checking", 95, 102, -7, 1224],
    ["Internet", "Utilities", "Checking", 70, 70, 0, 840],
    ["Car Insurance", "Insurance", "Checking", 150, 150, 0, 1800],
    ["Phone", "Utilities", "Credit Card", 65, 65, 0, 780],
    ["Streaming", "Subscriptions", "Credit Card", 25, 27, -2, 324],
  ],
);

// 23. Recurring
const recurring: BlueprintTab = dataTab(
  "Recurring",
  "Recurring transactions across the year",
  [
    { name: "Name", type: "text", width: 22 },
    { name: "Cadence", type: "text", width: 14 },
    { name: "Amount", type: "currency", width: 14 },
    { name: "Category", type: "text", width: 16 },
    { name: "Next Date", type: "date", width: 14 },
  ],
  [
    ["Salary", "Monthly", nicheData.monthlyIncome, "Income", "2026-06-01"],
    ["Rent", "Monthly", -1200, "Housing", "2026-06-01"],
    ["Auto-Save", "Monthly", -500, "Emergency Fund", "2026-06-12"],
    ["CC Payment", "Monthly", -350, "Credit Card", "2026-06-25"],
    ["Internet", "Monthly", -70, "Utilities", "2026-06-10"],
  ],
);

// 24. Debt Tracker
const debtTracker: BlueprintTab = dataTab(
  "Debt Tracker",
  "Track every debt — original balance, current balance, APR, minimum payment",
  [
    { name: "Debt", type: "text", width: 22 },
    { name: "Original", type: "currency", width: 14 },
    { name: "Current", type: "currency", width: 14 },
    { name: "APR", type: "percent", width: 10 },
    { name: "Min Payment", type: "currency", width: 14 },
  ],
  [
    ["Credit Card", 5000, 3200, 0.199, 95],
    ["Student Loan", 15000, 12500, 0.055, 180],
    ["Car Loan", 12000, 8400, 0.049, 275],
  ],
);

// 25. Savings Goals
const savingsGoals: BlueprintTab = dataTab(
  "Savings Goals",
  "Track progress toward savings targets",
  [
    { name: "Goal", type: "text", width: 22 },
    { name: "Target", type: "currency", width: 14 },
    { name: "Saved", type: "currency", width: 14 },
    { name: "Remaining", type: "currency", width: 14 },
    { name: "% Complete", type: "percent", width: 12 },
    { name: "Target Date", type: "date", width: 14 },
  ],
  nicheData.savingsGoals.map((g, i) => [
    g.name,
    g.target,
    g.saved,
    g.target - g.saved,
    g.saved / g.target,
    `2027-${String(((i % 12) + 1)).padStart(2, "0")}-01`,
  ]),
);

// 26. Net Worth
const netWorth: BlueprintTab = dataTab(
  "Net Worth",
  "Monthly snapshot of assets minus liabilities",
  [
    { name: "Month", type: "text", width: 14 },
    { name: "Assets", type: "currency", width: 14 },
    { name: "Liabilities", type: "currency", width: 14 },
    { name: "Net Worth", type: "currency", width: 14 },
    { name: "Change", type: "currency", width: 14 },
  ],
  [
    ["January", 18500, 24100, -5600, null],
    ["February", 19200, 23700, -4500, 1100],
    ["March", 20100, 23200, -3100, 1400],
    ["April", 21300, 22700, -1400, 1700],
    ["May", 22500, 22100, 400, 1800],
  ],
);

// 27. Income Streams
const incomeStreams: BlueprintTab = dataTab(
  "Income Streams",
  "Track every source of monthly income",
  [
    { name: "Source", type: "text", width: 22 },
    { name: "Monthly", type: "currency", width: 14 },
    { name: "YTD", type: "currency", width: 14 },
    { name: "% of Total", type: "percent", width: 12 },
  ],
  [
    ["Day Job (Net)", 3800, 22800, 0.84],
    ["Freelance", 350, 2100, 0.08],
    ["Refunds & Reimb.", 100, 600, 0.02],
    ["Side Gig", 200, 1200, 0.04],
    ["Other", 50, 300, 0.01],
  ],
);

// 28. Subscriptions
const subscriptions: BlueprintTab = dataTab(
  "Subscriptions",
  "Audit recurring subscriptions",
  [
    { name: "Service", type: "text", width: 22 },
    { name: "Monthly", type: "currency", width: 12 },
    { name: "Annual", type: "currency", width: 12 },
    { name: "Category", type: "text", width: 16 },
    { name: "Keep?", type: "text", width: 12 },
  ],
  [
    ["Netflix", 15.49, 185.88, "Entertainment", "Yes"],
    ["Spotify", 10.99, 131.88, "Entertainment", "Yes"],
    ["Gym Membership", 35.00, 420.00, "Health", "Yes"],
    ["Cloud Storage", 2.99, 35.88, "Productivity", "Yes"],
    ["Magazine", 8.00, 96.00, "Reading", "Maybe"],
  ],
);

// 29. Sinking Funds
const sinkingFunds: BlueprintTab = dataTab(
  "Sinking Funds",
  "Save for predictable future expenses month by month",
  [
    { name: "Fund", type: "text", width: 22 },
    { name: "Target", type: "currency", width: 14 },
    { name: "Monthly", type: "currency", width: 14 },
    { name: "Current", type: "currency", width: 14 },
    { name: "Progress", type: "percent", width: 12 },
  ],
  [
    ["Car Repairs", 2000, 100, 1100, 0.55],
    ["Holiday Gifts", 800, 67, 400, 0.50],
    ["Annual Insurance", 1800, 150, 900, 0.50],
    ["Home Maintenance", 1500, 125, 625, 0.42],
  ],
);

// 30. No-Spend Tracker
const noSpendTracker: BlueprintTab = dataTab(
  "No-Spend Tracker",
  "Mark every no-spend day and watch the streak grow",
  [
    { name: "Date", type: "date", width: 14 },
    { name: "Status", type: "text", width: 12 },
    { name: "Notes", type: "text", width: 30 },
    { name: "Streak", type: "number", width: 10 },
  ],
  [
    ["2026-01-04", "No-Spend", "Stayed in, cooked at home", 1],
    ["2026-01-05", "No-Spend", "Worked from home all day", 2],
    ["2026-01-06", "Spent", "Coffee shop run — $4.50", 0],
    ["2026-01-07", "No-Spend", "Packed lunch", 1],
    ["2026-01-08", "No-Spend", "Library + free workout", 2],
  ],
);

// 31. Year Goals
const yearGoals: BlueprintTab = dataTab(
  "Year Goals",
  "Top financial goals for the year — set, track, and review",
  [
    { name: "Goal", type: "text", width: 28 },
    { name: "Category", type: "text", width: 14 },
    { name: "Target", type: "currency", width: 14 },
    { name: "Status", type: "text", width: 14 },
    { name: "Due", type: "date", width: 14 },
  ],
  [
    ["Build $10k emergency fund", "Savings", 10000, "On Track", "2026-12-31"],
    ["Pay off credit card", "Debt", 3200, "Behind", "2026-09-30"],
    ["Max out Roth IRA", "Retirement", 7000, "On Track", "2026-12-31"],
    ["No-spend Jan complete", "Habit", 0, "Done", "2026-01-31"],
  ],
);

// 32. Annual Summary
const annualSummary: BlueprintTab = dataTab(
  "Annual Summary",
  "Year-end roll-up across income, expenses, savings, and debt",
  [
    { name: "Month", type: "text", width: 14 },
    { name: "Income", type: "currency", width: 14 },
    { name: "Expenses", type: "currency", width: 14 },
    { name: "Saved", type: "currency", width: 14 },
    { name: "Debt Paid", type: "currency", width: 14 },
    { name: "Net", type: "currency", width: 14 },
  ],
  MONTHS.map((m, i) => {
    const inc = nicheData.monthlyIncome;
    const exp = Math.round(nicheData.monthlyIncome * (0.78 + (i % 5) * 0.04));
    const saved = 500;
    const debtPaid = 350;
    return [m, inc, exp, saved, debtPaid, inc - exp - saved - debtPaid];
  }),
);

// ── Assemble the 32-tab blueprint ────────────────────────────

const tabs: BlueprintTab[] = [
  readme,                  // 1
  settings,                // 2
  annualDashboard,         // 3
  monthlyDashboard,        // 4
  smartCalendar,           // 5  (rich)
  yearInReview,            // 6  (rich)
  moneyCoach,              // 7  (rich)
  whatIf,                  // 8  (rich)
  transactions,            // 9
  ...monthlyTabs,          // 10..21
  billsCalendar,           // 22
  recurring,               // 23
  debtTracker,             // 24
  savingsGoals,            // 25
  netWorth,                // 26
  incomeStreams,           // 27
  subscriptions,           // 28
  sinkingFunds,            // 29
  noSpendTracker,          // 30
  yearGoals,               // 31
  annualSummary,           // 32
];

const blueprint: ProductBlueprint = {
  // FactoryBlueprint required fields
  id: "bp_test_paycheck",
  factoryRunId: "fr_test_paycheck",
  sourceListingTitle: "Paycheck Budget Planner — 32-Tab Test",
  competitorStrengths: ["clean dashboard", "category drilldown"],
  competitorWeaknesses: ["limited automation"],
  productType: "sheets",
  config: {
    type: "sheets",
    sheetsType: "paycheck_budget",
    colorScheme: "sage-green",
    customTitle: "Paycheck Budget Planner",
    complexity: "advanced",
  },
  differentiation: {
    competitorStrengths: [],
    competitorWeaknesses: [],
    ourImprovements: ["paycheck-cycle aware bills calendar", "32-tab personal finance system"],
    positioningAngle: "Take-home-pay focused, biweekly cycle aware",
    suggestedPrice: { min: 9, max: 19, recommended: 14.99 },
  },
  listingStrategy: {
    titleKeywords: ["paycheck", "budget", "planner"],
    positionAs: "comprehensive",
    uniqueSellingPoints: ["paycheck cycle aware", "32 tabs"],
  },
  suggestedPrice: 14.99,
  positioning: "Comprehensive paycheck-cycle planner",
  createdAt: new Date().toISOString(),

  // ProductBlueprint additions
  tabs,
  charts: [],
  colorScheme: {
    primary: profile.palette.primary,
    secondary: profile.palette.primaryLight,
    accent: profile.palette.accent,
    background: profile.palette.background,
    text: profile.palette.text,
    success: profile.palette.success,
    danger: profile.palette.danger,
  },
  sampleDataStrategy: "niche-realistic-32tab",
  deliveryMethod: "xlsx_download",
};

async function main() {
  const richCount = tabs.filter((t) => t.richLayout).length;
  console.log(`[test] Building niche=${niche}, ${tabs.length} blueprint tabs (${richCount} rich)...`);
  const buf = await buildPremiumSpreadsheet(blueprint);
  const out = "/tmp/factory-budget-v2.xlsx";
  writeFileSync(out, Buffer.from(buf));
  console.log(`[test] Wrote ${(buf.byteLength / 1024).toFixed(1)} KB to ${out}`);
}

main().catch((err) => {
  console.error("[test] FAILED:", err);
  process.exit(1);
});
