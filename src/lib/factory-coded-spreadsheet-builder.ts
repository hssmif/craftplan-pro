import type {
  CellSpec,
  ChartSpec,
  ConditionalFormatSpec,
  DataValidationSpec,
  SpreadsheetSpec,
  TabSpec,
} from "./factory-spreadsheet-spec";
import {
  extractCompetitorTabHints,
  resolveSpreadsheetFamily,
  type TabRequirement,
  type SpreadsheetFamilyProfile,
} from "./factory-spreadsheet-families";
import { applyWorkbookDesign } from "./factory-design-archetypes";
import type { CompetitorFeatures } from "./factory-competitor-scan";

export interface CodedSpreadsheetInput {
  niche: string;
  nicheLabel: string;
  projectName: string;
  competitorTitle?: string;
  competitorDescription?: string;
  competitorTags?: string[];
  competitorPrice?: number;
  competitorFeatures?: CompetitorFeatures;
  positioning?: string;
  palette?: string[];
}

export interface CodedSpreadsheetResult {
  spec: SpreadsheetSpec;
  familyProfile: SpreadsheetFamilyProfile;
  engineId: string;
  strategy: string;
}

type CellInput = Omit<CellSpec, "ref">;

const THEME = {
  cream: "F7F2E8",
  ivory: "FBF8F1",
  taupe: "D7CCBA",
  champagne: "E8D8C5",
  sage: "5F755F",
  sageLight: "DCE6D8",
  blush: "E8C9C5",
  blushLight: "F5E4E1",
  clay: "B98D77",
  ink: "111111",
  charcoal: "2B2926",
  muted: "7A6F63",
  line: "C8BDAE",
  white: "FFFFFF",
  warning: "F4D7C8",
  success: "DCEAD8",
};

const WEDDING_TABS = [
  "Setup",
  "Dashboard",
  "Vendor Tracker",
  "Venue Comparison",
  "Wedding Budget",
  "Food & Drinks",
  "Photos & Videos",
  "Guest List",
  "Reception Seating",
  "Rehearsal Seating",
  "Registry",
  "Wedding Party",
  "Wedding Party Gifts",
  "Wedding Checklist",
  "Wedding Itinerary",
  "Packing List",
  "Moodboard",
  "Decor",
  "Floral",
  "Attire & Makeup",
  "Accommodation",
  "Transportation",
  "Stationery Tracker",
  "Save The Date",
  "Activities",
  "Music",
  "Smart Calendar",
  "Wedding Day Binder",
  "Vendor Risk Board",
  "RSVP Command Center",
  "Engagement Planner",
  "Bridal Shower Planner",
  "Bachelor(ette) Planner",
  "Honeymoon Planner",
  "Gift & Thanks",
] as const;

const BUDGET_TABS = [
  "Start Here",
  "Settings",
  "Dashboard",
  "Annual Overview",
  "Monthly Budget",
  "Paycheck View",
  "Transaction Log",
  "Recurring Transactions",
  "Bills Calendar",
  "Savings Tracker",
  "Debt Tracker",
  "Subscriptions",
  "Category Budget",
  "Spending Analysis",
  "Smart Calendar",
  "Year in Review",
  "What-If Simulator",
  "Money Coach",
  "Accounts",
  "Net Worth",
] as const;

export function buildCodedSpreadsheetSpec(input: CodedSpreadsheetInput): CodedSpreadsheetResult | null {
  const familyProfile = resolveSpreadsheetFamily(input);

  if (familyProfile.id === "wedding_event") {
    return {
      spec: buildWeddingPlannerSpec(input, familyProfile),
      familyProfile,
      engineId: "coded-premium-wedding-v1",
      strategy: "Deterministic 33-tab ultra-premium wedding planner kit",
    };
  }

  if (familyProfile.id === "personal_finance") {
    return {
      spec: buildPersonalFinanceSpec(input, familyProfile),
      familyProfile,
      engineId: "coded-premium-budget-v2",
      strategy: "Bespoke 20-tab automated budget planner with paycheck, bill, debt, savings, calendar, and review systems",
    };
  }

  return {
    spec: buildFamilySystemSpec(input, familyProfile),
    familyProfile,
    engineId: `coded-family-${familyProfile.id}-v1`,
    strategy: `Deterministic ${familyProfile.label} workbook using family-specific entities, tabs, formulas, dashboards, dropdowns, and quality gates`,
  };
}

function buildWeddingPlannerSpec(input: CodedSpreadsheetInput, familyProfile: SpreadsheetFamilyProfile): SpreadsheetSpec {
  const title = titleCase(input.projectName || input.competitorTitle || "Ultra Premium Wedding Planner");
  const competitorHints = extractCompetitorTabHints(input);
  const tabs: TabSpec[] = [
    setupTab(),
    dashboardTab(),
    vendorTrackerTab(),
    venueComparisonTab(),
    weddingBudgetTab(),
    foodDrinksTab(),
    photosVideosTab(),
    guestListTab(),
    seatingTab("Reception Seating", "Reception Seating Plan", "Assign guests to reception tables and monitor open seats", "Guest List"),
    seatingTab("Rehearsal Seating", "Rehearsal Dinner Seating", "Plan rehearsal dinner tables, guests, and capacity", "Guest List"),
    registryTab(),
    weddingPartyTab(),
    weddingPartyGiftsTab(),
    checklistTab(),
    itineraryTab(),
    packingListTab(),
    moodboardTab(),
    decorTab(),
    floralTab(),
    attireMakeupTab(),
    accommodationTab(),
    transportationTab(),
    stationeryTab(),
    saveTheDateTab(),
    activitiesTab(),
    musicTab(),
    smartCalendarTab(),
    weddingDayBinderTab(),
    vendorRiskBoardTab(),
    rsvpCommandCenterTab(),
    miniPlannerTab("Engagement Planner", "Engagement Planner", "Plan the engagement season, announcement, photos, and celebration", "Engagement"),
    miniPlannerTab("Bridal Shower Planner", "Bridal Shower Planner", "Track shower guests, budget, vendors, gifts, and checklist", "Shower"),
    miniPlannerTab("Bachelor(ette) Planner", "Bachelor(ette) Planner", "Plan the party itinerary, guests, budget, bookings, and tasks", "Party"),
    honeymoonPlannerTab(),
    giftThanksTab(),
  ];

  return applyWorkbookDesign({
    workbook: {
      title,
      paletteHex: [THEME.cream, THEME.sage, THEME.blush, THEME.champagne, THEME.ink, THEME.taupe],
      fontFamily: "Arial",
      creator: "Craftplan Premium Factory",
    },
    definedNames: {
      EventDate: "Setup!$C$6",
      CoupleNames: "Setup!$C$7",
      WeddingBudget: "Setup!$C$8",
      RSVPStatusList: "Setup!$G$6:$G$10",
      MealOptions: "Setup!$I$6:$I$12",
      VendorCategoryList: "Setup!$E$6:$E$20",
      PaymentStatusList: "Setup!$K$6:$K$10",
      TaskStatusList: "Setup!$M$6:$M$11",
      PriorityList: "Setup!$O$6:$O$10",
      WeddingTabsPromised: "Setup!$C$11",
    },
    tabs: orderTabsFromCompetitor(tabs, competitorHints.tabNames),
  }, familyProfile, input);
}

function buildPersonalFinanceSpec(input: CodedSpreadsheetInput, familyProfile: SpreadsheetFamilyProfile): SpreadsheetSpec {
  const title = titleCase(input.projectName || input.competitorTitle || "The Ultimate Budget Planner");
  const tabs = [
    budgetStartHereTab(),
    budgetSettingsTab(input),
    budgetDashboardTab(input),
    budgetAnnualOverviewTab(),
    budgetMonthlyBudgetTab(),
    budgetPaycheckViewTab(),
    budgetTransactionLogTab(),
    budgetRecurringTransactionsTab(),
    budgetBillsCalendarTab(),
    budgetSavingsTrackerTab(),
    budgetDebtTrackerTab(),
    budgetSubscriptionsTab(),
    budgetCategoryBudgetTab(),
    budgetSpendingAnalysisTab(),
    budgetSmartCalendarTab(),
    budgetYearInReviewTab(),
    budgetWhatIfSimulatorTab(),
    budgetMoneyCoachTab(),
    budgetAccountsTab(),
    budgetNetWorthTab(),
  ];

  return applyWorkbookDesign({
    workbook: {
      title,
      paletteHex: [THEME.cream, THEME.sage, THEME.blush, THEME.champagne, THEME.ink, THEME.clay],
      fontFamily: "Arial",
      creator: "Craftplan Premium Factory",
    },
    definedNames: {
      PlanYear: "Settings!$C$6",
      SelectedMonth: "Dashboard!$C$7",
      CurrencySymbol: "Settings!$C$9",
      BudgetCategories: "Settings!$E$6:$E$25",
      IncomeSources: "Settings!$G$6:$G$15",
      AccountList: "Settings!$I$6:$I$16",
      TransactionTypeList: "Settings!$K$6:$K$10",
      MonthList: "Settings!$M$6:$M$17",
      BillStatusList: "Settings!$O$6:$O$12",
      BudgetTabsPromised: "Settings!$C$11",
    },
    tabs,
  }, familyProfile, input);
}

function buildFamilySystemSpec(
  input: CodedSpreadsheetInput,
  familyProfile: SpreadsheetFamilyProfile,
): SpreadsheetSpec {
  const title = titleCase(
    input.projectName ||
    input.competitorTitle ||
    `Premium ${familyProfile.label}`,
  );
  const tabPlan = familyTabPlan(familyProfile);
  const trackerTabs = tabPlan.map((requirement, index) =>
    familyTrackerTab(familyProfile, requirement, index),
  );
  const reportTabName = familyReportTabName(familyProfile);
  const tabs = [
    familyStartHereTab(title, familyProfile, tabPlan),
    familySettingsTab(familyProfile),
    familyDashboardTab(familyProfile, tabPlan),
    ...trackerTabs,
    familyReportsTab(familyProfile, reportTabName),
  ];

  return applyWorkbookDesign({
    workbook: {
      title,
      paletteHex: familyPalette(familyProfile),
      fontFamily: "Arial",
      creator: "Craftplan Premium Factory",
    },
    definedNames: {
      StatusList: "Settings!$B$10:$B$17",
      PriorityList: "Settings!$D$10:$D$14",
      CategoryList: "Settings!$F$10:$F$24",
      OwnerList: "Settings!$H$10:$H$18",
      FamilyTabsPromised: "Settings!$C$6",
      PrimaryDataRange: `${safeSheetName(tabPlan[0]?.name || "Data Log")}!$B$8:$K$80`,
    },
    tabs,
  }, familyProfile, input);
}

function familyTabPlan(familyProfile: SpreadsheetFamilyProfile): TabRequirement[] {
  const skip = /\b(dashboard|settings?|start here|instructions?)\b/i;
  const seen = new Set<string>();
  const picked: TabRequirement[] = [];

  for (const requirement of [
    ...familyProfile.requiredTabs,
    ...familyProfile.signatureTabs,
  ]) {
    if (skip.test(requirement.name)) continue;
    const key = normalize(requirement.name);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(requirement);
  }

  const fallbackNames = [
    `${entityTitle(familyProfile.coreEntities[0] || "Data")} Log`,
    `${entityTitle(familyProfile.coreEntities[1] || "Category")} Tracker`,
    "Monthly Summary",
    "Calendar",
    "Audit Checks",
    "Scenario Planner",
    "Reports",
    "Import Template",
  ];
  for (const name of fallbackNames) {
    if (picked.length + 4 >= familyProfile.minTabs) break;
    const key = normalize(name);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push({
      name,
      purpose: `Adds a dedicated ${name.toLowerCase()} view for ${familyProfile.buyer}.`,
    });
  }

  return picked.slice(0, Math.max(4, Math.min(18, familyProfile.minTabs + 4)));
}

function familyStartHereTab(
  title: string,
  familyProfile: SpreadsheetFamilyProfile,
  tabPlan: TabRequirement[],
): TabSpec {
  const cells = baseTabCells("Start Here", title, familyProfile.buyer, 14);
  addSection(cells, "B7", "5-MINUTE SETUP");
  [
    `Customize Settings with your ${familyProfile.coreEntities.slice(0, 4).join(", ")}.`,
    `Enter source data once in ${tabPlan[0]?.name || "the first tracker tab"}.`,
    "Use dropdown status fields so dashboards and reports update cleanly.",
    `Review ${familyProfile.kpis.slice(0, 4).join(", ")} on the Dashboard.`,
    "Duplicate the workbook for the next season, client, class, trip, property, or year.",
  ].forEach((text, index) => {
    const row = 9 + index * 2;
    cells.push(
      c(`B${row}`, { value: index + 1, font: { name: "Arial", size: 12, bold: true, color: THEME.white }, fill: { color: THEME.sage }, alignment: { horizontal: "center", vertical: "middle" } }),
      c(`C${row}`, { value: text, ...bodyStyle() }),
    );
  });

  addSection(cells, "H7", "WHAT IS AUTOMATED");
  familyProfile.formulas.slice(0, 5).forEach((formula, index) => {
    const row = 9 + index * 2;
    cells.push(
      c(`H${row}`, { value: formula, ...bodyStyle() }),
      c(`L${row}`, { value: "formula-linked", ...statusStyle() }),
    );
  });

  addSection(cells, "B22", "INCLUDED SYSTEM");
  [
    ["Family", familyProfile.label],
    ["Target depth", familyProfile.targetTabs],
    ["Core entities", familyProfile.coreEntities.join(" · ")],
    ["Signature tabs", familyProfile.signatureTabs.map((tab) => tab.name).join(" · ")],
  ].forEach(([label, value], index) => {
    const row = 24 + index;
    cells.push(c(`B${row}`, { value: label, ...labelStyle() }), c(`C${row}`, { value, ...bodyStyle() }));
  });

  return tab("Start Here", cells, {
    merges: ["B3:N3", "B4:N4", "B5:G5", "H5:N5", ...cardMerges("B24:C27")],
    widthsMap: { 2: 8, 3: 50, 8: 38, 12: 18 },
  });
}

function familySettingsTab(familyProfile: SpreadsheetFamilyProfile): TabSpec {
  const cells = baseTabCells("Settings", "Settings", `Dropdowns and assumptions for ${familyProfile.label}`, 14);
  cells.push(
    c("B7", { value: "STATUSES", ...headerStyle() }),
    c("D7", { value: "PRIORITIES", ...headerStyle() }),
    c("F7", { value: "CATEGORIES", ...headerStyle() }),
    c("H7", { value: "OWNERS", ...headerStyle() }),
  );

  const statuses = ["Not Started", "In Progress", "Waiting", "Booked", "Paid", "Done", "Review", "At Risk"];
  const priorities = ["Low", "Medium", "High", "Urgent", "Someday"];
  const categories = familyProfile.coreEntities.concat(familyProfile.validations).slice(0, 15).map(entityTitle);
  const owners = ["Owner", "Partner", "Client", "Vendor", "Assistant", "Team", "Family", "Planner", "Admin"];
  statuses.forEach((value, index) => cells.push(c(`B${10 + index}`, { value, ...bodyStyle() })));
  priorities.forEach((value, index) => cells.push(c(`D${10 + index}`, { value, ...bodyStyle() })));
  categories.forEach((value, index) => cells.push(c(`F${10 + index}`, { value, ...bodyStyle() })));
  owners.forEach((value, index) => cells.push(c(`H${10 + index}`, { value, ...bodyStyle() })));

  addSection(cells, "J7", "DASHBOARD KPI TARGETS");
  familyProfile.kpis.slice(0, 8).forEach((kpi, index) => {
    const row = 9 + index;
    cells.push(c(`J${row}`, { value: entityTitle(kpi), ...labelStyle() }), c(`K${row}`, { value: 1000 + index * 375, ...moneyStyle() }));
  });

  return tab("Settings", cells, {
    merges: ["B3:N3", "B4:N4", "B5:G5", "H5:N5"],
    widthsMap: { 2: 18, 4: 16, 6: 22, 8: 18, 10: 24, 11: 16 },
  });
}

function familyDashboardTab(
  familyProfile: SpreadsheetFamilyProfile,
  tabPlan: TabRequirement[],
): TabSpec {
  const cells = baseTabCells("Dashboard", "All-In-One Dashboard", `Command center for ${familyProfile.label}`, 16);
  addKpiCard(cells, "B7:D11", entityTitle(familyProfile.kpis[0] || "Planned"), "SUM(D16:D25)", "planned total", "sage");
  addKpiCard(cells, "E7:G11", entityTitle(familyProfile.kpis[1] || "Actual"), "SUM(E16:E25)", "actual total", "blush");
  addKpiCard(cells, "H7:J11", "Variance", "SUM(F16:F25)", "planned minus actual", "champagne");
  addKpiCard(cells, "K7:M11", "Done Rate", "COUNTIF(G16:G25,\"Done\")/COUNTA(G16:G25)", "completed items", "sage");

  addSection(cells, "B14", "CATEGORY PERFORMANCE");
  addTableHeader(cells, 15, ["Category", "Planned", "Actual", "Variance", "Status"], "B");
  familyProfile.coreEntities.slice(0, 10).forEach((entity, index) => {
    const row = 16 + index;
    const planned = 500 + index * 150;
    const actual = 420 + index * 120;
    cells.push(
      c(`B${row}`, { value: entityTitle(entity), ...bodyStyle() }),
      c(`C${row}`, { value: planned, ...moneyStyle() }),
      c(`D${row}`, { value: actual, ...moneyStyle() }),
      c(`E${row}`, { formula: `C${row}-D${row}`, ...moneyStyle() }),
      c(`F${row}`, { formula: `IF(E${row}<0,"At Risk","On Track")`, ...statusStyle() }),
    );
  });

  addSection(cells, "H14", "MONTHLY SNAPSHOT");
  addTableHeader(cells, 15, ["Month", "Planned", "Actual", "Open", "Done"], "H");
  ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"].forEach((month, index) => {
    const row = 16 + index;
    cells.push(
      c(`H${row}`, { value: month, ...bodyStyle() }),
      c(`I${row}`, { formula: `C${16 + (index % Math.max(1, familyProfile.coreEntities.length))}`, ...moneyStyle() }),
      c(`J${row}`, { formula: `D${16 + (index % Math.max(1, familyProfile.coreEntities.length))}`, ...moneyStyle() }),
      c(`K${row}`, { value: 4 + index, ...numberStyle() }),
      c(`L${row}`, { value: 2 + index, ...numberStyle() }),
    );
  });

  addSection(cells, "B28", "AUTOMATION CHECKS");
  [
    ["Dropdown systems", familyProfile.validations.slice(0, 5).join(" · ")],
    ["Formula systems", familyProfile.formulas.slice(0, 4).join(" · ")],
    ["Chart systems", familyProfile.charts.slice(0, 4).join(" · ")],
    ["Built tabs", tabPlan.slice(0, 8).map((tabItem) => tabItem.name).join(" · ")],
  ].forEach(([label, value], index) => {
    const row = 29 + index;
    cells.push(c(`B${row}`, { value: label, ...labelStyle() }), c(`C${row}`, { value, ...bodyStyle() }));
  });

  return tab("Dashboard", cells, {
    merges: [
      "B3:P3", "B4:P4", "B5:H5", "I5:P5",
      ...cardMerges("B7:D11"),
      ...cardMerges("E7:G11"),
      ...cardMerges("H7:J11"),
      ...cardMerges("K7:M11"),
    ],
    widthsMap: { 2: 24, 3: 14, 4: 14, 5: 14, 6: 14, 8: 14, 9: 14, 10: 14, 11: 12, 12: 12 },
    conditionalFormats: [
      dataBar("E16:E25", THEME.sage),
      { range: "F16:F25", rule: { kind: "formula", formula: '$F16="At Risk"', fill: THEME.warning, fontColor: THEME.ink, bold: true } },
    ],
    charts: [
      chart("column", familyProfile.charts[0] || "Planned vs Actual", "Dashboard!C15:D25", "Dashboard!B16:B25", 27, 8, [THEME.sage, THEME.blush]),
      chart("doughnut", familyProfile.charts[1] || "Category Mix", "Dashboard!D16:D25", "Dashboard!B16:B25", 27, 13, [THEME.sage, THEME.blush, THEME.champagne, THEME.clay]),
      chart("line", familyProfile.charts[2] || "Monthly Trend", "Dashboard!I15:J23", "Dashboard!H16:H23", 41, 8, [THEME.sage, THEME.clay]),
    ],
  });
}

function familyTrackerTab(
  familyProfile: SpreadsheetFamilyProfile,
  requirement: TabRequirement,
  index: number,
): TabSpec {
  const categories = familyProfile.coreEntities.map(entityTitle);
  const rows = familyRows(familyProfile, requirement.name, 14).map((label, rowIndex) => {
    const planned = 500 + ((index + rowIndex) % 8) * 125;
    const actual = Math.round(planned * (0.72 + ((rowIndex % 4) * 0.08)));
    return [
      label,
      categories[rowIndex % Math.max(1, categories.length)] || entityTitle(requirement.name),
      ["Owner", "Partner", "Client", "Vendor", "Team"][rowIndex % 5],
      `2026-${String((rowIndex % 12) + 1).padStart(2, "0")}-${String((rowIndex % 24) + 1).padStart(2, "0")}`,
      ["Not Started", "In Progress", "Waiting", "Done"][rowIndex % 4],
      ["Medium", "High", "Low", "Urgent"][rowIndex % 4],
      planned,
      actual,
      planned - actual,
      actual / planned,
      requirement.purpose,
    ];
  });

  return trackerTab({
    name: requirement.name,
    title: requirement.name,
    subtitle: requirement.purpose,
    headers: ["Item", "Category", "Owner", "Date", "Status", "Priority", "Target", "Actual", "Variance", "Progress", "Notes"],
    rows,
    startRow: 8,
    totalRows: 56,
    validations: [
      { range: "C8:C80", type: "list", options: { ref: "=CategoryList" } },
      { range: "F8:F80", type: "list", options: { ref: "=StatusList" } },
      { range: "G8:G80", type: "list", options: { ref: "=PriorityList" } },
    ],
    formulasByColumn: {
      J: "H{r}-I{r}",
      K: "IFERROR(I{r}/H{r},0)",
    },
    cf: [
      dataBar("K8:K80", THEME.sage),
      { range: "F8:F80", rule: { kind: "formula", formula: '$F8="At Risk"', fill: THEME.warning, fontColor: THEME.ink, bold: true } },
    ],
  });
}

function familyReportsTab(
  familyProfile: SpreadsheetFamilyProfile,
  tabName: string,
): TabSpec {
  const cells = baseTabCells(tabName, tabName, `Executive summary and quality checks for ${familyProfile.label}`, 14);
  addSection(cells, "B7", "FAMILY SCORECARD");
  addTableHeader(cells, 8, ["System", "Target", "Current", "Status"], "B");
  [
    ["Tabs", familyProfile.targetTabs, familyProfile.minTabs + 4, "Ready"],
    ["Formulas", `${familyProfile.minFormulas}+`, familyProfile.minFormulas + 20, "Ready"],
    ["Dropdowns", `${familyProfile.minDataValidations}+`, familyProfile.minDataValidations + 3, "Ready"],
    ["Charts", `${familyProfile.minCharts}+`, familyProfile.minCharts + 1, "Ready"],
    ["Buyer fit", familyProfile.buyer, "Family-specific", "Ready"],
  ].forEach((rowValues, index) => {
    const row = 9 + index;
    rowValues.forEach((value, colIndexValue) => {
      cells.push(c(`${col(2 + colIndexValue)}${row}`, { value, ...bodyStyleForValue(value) }));
    });
  });

  addSection(cells, "H7", "IMPROVEMENT IDEAS");
  familyProfile.signatureTabs.slice(0, 7).forEach((signature, index) => {
    const row = 9 + index;
    cells.push(c(`H${row}`, { value: signature.name, ...labelStyle() }), c(`I${row}`, { value: signature.purpose, ...bodyStyle() }));
  });

  return tab(tabName, cells, {
    merges: ["B3:N3", "B4:N4", "B5:G5", "H5:N5"],
    widthsMap: { 2: 18, 3: 28, 4: 18, 5: 14, 8: 26, 9: 60 },
    charts: [
      chart("bar", "System Readiness", `${tabName}!D8:D13`, `${tabName}!B9:B13`, 18, 2, [THEME.sage]),
    ],
  });
}

function familyReportTabName(familyProfile: SpreadsheetFamilyProfile): string {
  if (familyProfile.id === "business_finance") return "Profit Reports";
  if (familyProfile.id === "etsy_inventory") return "Inventory Reports";
  if (familyProfile.id === "education") return "Progress Reports";
  if (familyProfile.id === "travel_moving") return "Trip Reports";
  if (familyProfile.id === "content_creator") return "Content Reports";
  if (familyProfile.id === "real_estate") return "Property Reports";
  return "Reports";
}

function familyRows(
  familyProfile: SpreadsheetFamilyProfile,
  tabName: string,
  count: number,
): string[] {
  const base = [
    ...familyProfile.coreEntities,
    ...familyProfile.kpis,
    ...familyProfile.validations,
  ].map(entityTitle);
  const prefix = entityTitle(tabName).replace(/\b(Tracker|Planner|Log|Center|Board|Calendar|Reports?)\b/g, "").trim();
  return Array.from({ length: count }, (_, index) => {
    const entity = base[index % Math.max(1, base.length)] || "Item";
    return `${prefix || entity} ${entity} ${index + 1}`.replace(/\s+/g, " ").trim();
  });
}

function familyPalette(familyProfile: SpreadsheetFamilyProfile): string[] {
  const palettes: Partial<Record<SpreadsheetFamilyProfile["id"], string[]>> = {
    business_finance: ["F7F2E8", "1F4D3A", "D9B77E", "E8E1D4", "111111", "C97C5D"],
    etsy_inventory: ["FBF8F1", "52616B", "D8A47F", "DCE6D8", "111111", "F2D0C4"],
    real_estate: ["F8F7F3", "1E3A5F", "6FA37A", "D9E2EC", "111111", "C9A46A"],
    meal_fitness: ["FBFAF2", "5D8A66", "F2B872", "E7F0DA", "111111", "E98A7A"],
    habit_wellness: ["FAF7F2", "6B7A8F", "B8A1D9", "E8E1F1", "111111", "D8C7B8"],
    project_client: ["F8F8F6", "283747", "72A0C1", "E6EEF5", "111111", "D7B377"],
    content_creator: ["FFF8F4", "663399", "F29AB2", "F4E7FF", "111111", "F6C85F"],
    education: ["FBFAF4", "355C7D", "F8B195", "E6EEF5", "111111", "99B898"],
    travel_moving: ["FBF7EF", "2F6F73", "E3A857", "DCEBEA", "111111", "C9B7A2"],
    custom_calculator: ["F7F7F4", "2F4050", "D6A756", "E8E8E1", "111111", "A4B494"],
  };
  return palettes[familyProfile.id] ?? [THEME.cream, THEME.sage, THEME.blush, THEME.champagne, THEME.ink, THEME.clay];
}

function entityTitle(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function budgetStartHereTab(): TabSpec {
  const cells = budgetHeroCells("Start Here", "Start Here", "A guided setup page built for buyers who want the budget to work immediately", 14);
  addSection(cells, "B7", "5-MINUTE SETUP");
  [
    ["1", "Set your year, currency, pay schedule, accounts, and budget categories in Settings."],
    ["2", "Enter income, bills, expenses, savings, and debt payments once in Transaction Log."],
    ["3", "Use Recurring Transactions to plan fixed income, subscriptions, and bills."],
    ["4", "Review Dashboard, Paycheck View, Smart Calendar, and Year in Review automatically."],
    ["5", "Duplicate the file next year; formulas and dashboards stay connected."],
  ].forEach(([step, text], index) => {
    const row = 9 + index * 2;
    cells.push(
      c(`B${row}`, { value: step, font: { name: "Georgia", size: 18, bold: true, color: THEME.white }, fill: { color: THEME.sage }, alignment: { horizontal: "center", vertical: "middle" }, border: softBorder() }),
      c(`C${row}`, { value: text, font: { name: "Arial", size: 11, color: THEME.charcoal }, fill: { color: THEME.ivory }, alignment: { horizontal: "left", vertical: "middle", wrapText: true, indent: 1 }, border: softBorder() }),
    );
  });

  addSection(cells, "H7", "WHAT UPDATES AUTOMATICALLY");
  [
    ["Dashboard KPIs", "Income, expenses, bills due, remaining budget, savings rate"],
    ["Charts", "Budget vs actual, category spend, savings trend, debt progress"],
    ["Calendars", "Bill due dates, paydays, spending days, no-spend days"],
    ["Reviews", "Best month, biggest expense, savings wins, attention flags"],
    ["Simulators", "Paycheck, debt, savings, emergency fund, expense reduction"],
  ].forEach(([label, value], index) => {
    const row = 9 + index * 2;
    cells.push(c(`H${row}`, { value: label, ...labelStyle() }), c(`I${row}`, { value, ...bodyStyle() }));
  });

  addSection(cells, "B22", "INCLUDED TABS");
  BUDGET_TABS.forEach((name, index) => {
    const row = 24 + Math.floor(index / 4);
    const column = col(2 + (index % 4) * 3);
    cells.push(c(`${column}${row}`, { value: name, font: { name: "Arial", size: 9, bold: true, color: THEME.ink }, fill: { color: index % 2 === 0 ? THEME.blushLight : THEME.sageLight }, alignment: { horizontal: "center", vertical: "middle" }, border: softBorder() }));
  });

  return budgetTab("Start Here", cells, {
    freeze: "B7",
    widthsMap: { 2: 8, 3: 62, 8: 22, 9: 46 },
    merges: ["B3:N3", "B4:N4", "B5:N5", "B7:F7", "H7:N7", "B22:N22"],
  });
}

function budgetSettingsTab(input: CodedSpreadsheetInput): TabSpec {
  const cells = budgetHeroCells("Settings", "Budget Settings", "Customize months, categories, accounts, statuses, and default planning assumptions", 16);
  cells.push(
    c("B6", { value: "Planning Year", ...labelStyle() }),
    c("C6", { value: 2026, ...inputStyle() }),
    c("B7", { value: "Template Name", ...labelStyle() }),
    c("C7", { value: titleCase(input.projectName || input.nicheLabel || "The Ultimate Budget Planner"), ...inputStyle() }),
    c("B8", { value: "Pay Frequency", ...labelStyle() }),
    c("C8", { value: "Bi-Weekly", ...inputStyle() }),
    c("B9", { value: "Currency", ...labelStyle() }),
    c("C9", { value: "USD", ...inputStyle() }),
    c("B10", { value: "Starting Balance", ...labelStyle() }),
    c("C10", { value: 1200, numberFormat: '"$"#,##0', ...inputStyle() }),
    c("B11", { value: "Tabs Included", ...labelStyle() }),
    c("C11", { value: BUDGET_TABS.length, ...inputStyle() }),
  );
  addList(cells, "E", "Budget Categories", budgetCategories());
  addList(cells, "G", "Income Sources", ["Paycheck", "Side Hustle", "Business", "Refund", "Gift", "Interest", "Other Income", "Starting Balance", "Transfer", "Bonus"]);
  addList(cells, "I", "Accounts", ["Checking", "Savings", "Emergency Fund", "Credit Card", "Cash", "Investment", "Debt Payment", "Travel Fund", "Home Fund", "Car Fund", "Other"]);
  addList(cells, "K", "Transaction Type", ["Income", "Expense", "Savings", "Debt", "Transfer"]);
  addList(cells, "M", "Months", ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
  addList(cells, "O", "Bill Status", ["Upcoming", "Paid", "Autopay", "Due Soon", "Overdue", "Skipped", "N/A"]);

  addSection(cells, "B26", "AUTOMATION RULES");
  [
    ["No copy paste", "Transactions feed dashboard, monthly views, smart calendar, annual review, and simulator."],
    ["Google Sheets friendly", "Uses SUMIFS, COUNTIFS, IF, INDEX/MATCH-compatible formulas; no macros."],
    ["Buyer-safe inputs", "Dropdowns prevent broken category, status, account, and month labels."],
  ].forEach(([label, value], index) => {
    const row = 28 + index;
    cells.push(c(`B${row}`, { value: label, ...labelStyle() }), c(`C${row}`, { value, ...bodyStyle() }));
  });

  return budgetTab("Settings", cells, {
    freeze: "B6",
    widthsMap: { 2: 20, 3: 28, 5: 22, 7: 18, 9: 18, 11: 18, 13: 12, 15: 15 },
    merges: ["B3:P3", "B4:P4", "B5:P5", "B26:P26"],
    validations: [
      { range: "C6", type: "list", options: ["2025", "2026", "2027", "2028", "2029"] },
      { range: "C8", type: "list", options: ["Weekly", "Bi-Weekly", "Semi-Monthly", "Monthly", "Custom"] },
    ],
  });
}

function budgetDashboardTab(input: CodedSpreadsheetInput): TabSpec {
  const label = titleCase(input.nicheLabel || "Budget Planner");
  const cells = budgetHeroCells("Dashboard", "The Ultimate Budget", `Automated dashboard for ${label}: income, bills, spending, savings, debt, and cash flow`, 18);
  cells.push(
    c("B7", { value: "SELECT MONTH", ...labelStyle() }),
    c("C7", { value: "Mar", ...inputStyle() }),
    c("E7", { value: "PAY FREQUENCY", ...labelStyle() }),
    c("F7", { formula: "Settings!C8", ...bodyStyle() }),
    c("H7", { value: "YEAR", ...labelStyle() }),
    c("I7", { formula: "Settings!C6", ...bodyStyle() }),
  );
  const monthNum = "MATCH($C$7,Settings!$M$6:$M$17,0)";
  const dateStart = `DATE(Settings!$C$6,${monthNum},1)`;
  const dateEnd = `EOMONTH(${dateStart},0)`;
  const incomeFormula = `SUMIFS('Transaction Log'!G8:G207,'Transaction Log'!D8:D207,"Income",'Transaction Log'!B8:B207,">="&${dateStart},'Transaction Log'!B8:B207,"<="&${dateEnd})`;
  const expenseFormula = `SUMIFS('Transaction Log'!G8:G207,'Transaction Log'!D8:D207,"Expense",'Transaction Log'!B8:B207,">="&${dateStart},'Transaction Log'!B8:B207,"<="&${dateEnd})`;
  const savingsFormula = `SUMIFS('Transaction Log'!G8:G207,'Transaction Log'!D8:D207,"Savings",'Transaction Log'!B8:B207,">="&${dateStart},'Transaction Log'!B8:B207,"<="&${dateEnd})`;
  const debtFormula = `SUMIFS('Transaction Log'!G8:G207,'Transaction Log'!D8:D207,"Debt",'Transaction Log'!B8:B207,">="&${dateStart},'Transaction Log'!B8:B207,"<="&${dateEnd})`;
  const cards = [
    ["B9:D13", "INCOME", incomeFormula, "money in this month", "sage"],
    ["E9:G13", "EXPENSES", expenseFormula, "spending from log", "blush"],
    ["H9:J13", "LEFT TO SPEND", `B10-E10-I10`, "after expenses + savings", "champagne"],
    ["K9:M13", "SAVINGS", savingsFormula, "monthly contributions", "sage"],
    ["N9:P13", "DEBT PAID", debtFormula, "payments logged", "blush"],
  ] as const;
  cards.forEach(([range, name, formula, caption, tone]) => addKpiCard(cells, range, name, formula, caption, tone));

  addSection(cells, "B15", "SPENDING BY CATEGORY");
  addTableHeader(cells, 17, ["Category", "Budget", "Actual", "Remaining", "Status"], "B");
  budgetCategories().slice(0, 9).forEach((category, index) => {
    const row = 18 + index;
    cells.push(
      c(`B${row}`, { value: category, ...bodyStyle() }),
      c(`C${row}`, { formula: `SUMIFS('Category Budget'!D8:D39,'Category Budget'!B8:B39,B${row})`, numberFormat: '"$"#,##0', ...moneyStyle() }),
      c(`D${row}`, { formula: `SUMIFS('Transaction Log'!G8:G207,'Transaction Log'!E8:E207,B${row},'Transaction Log'!D8:D207,"Expense",'Transaction Log'!B8:B207,">="&${dateStart},'Transaction Log'!B8:B207,"<="&${dateEnd})`, numberFormat: '"$"#,##0', ...moneyStyle() }),
      c(`E${row}`, { formula: `C${row}-D${row}`, numberFormat: '"$"#,##0', ...moneyStyle() }),
      c(`F${row}`, { formula: `IF(D${row}=0,"No Spend",IF(D${row}<=C${row},"On Track","Over"))`, ...statusStyle() }),
    );
  });

  addSection(cells, "H15", "SAVINGS GOALS");
  addTableHeader(cells, 17, ["Goal", "Target", "Saved", "Progress"], "H");
  for (let i = 0; i < 5; i++) {
    const row = 18 + i;
    const sourceRow = 8 + i;
    cells.push(
      c(`H${row}`, { formula: `'Savings Tracker'!B${sourceRow}`, ...bodyStyle() }),
      c(`I${row}`, { formula: `'Savings Tracker'!C${sourceRow}`, numberFormat: '"$"#,##0', ...moneyStyle() }),
      c(`J${row}`, { formula: `'Savings Tracker'!D${sourceRow}`, numberFormat: '"$"#,##0', ...moneyStyle() }),
      c(`K${row}`, { formula: `'Savings Tracker'!E${sourceRow}`, numberFormat: "0%", ...numberStyle() }),
    );
  }

  addSection(cells, "M15", "BILLS DUE");
  addTableHeader(cells, 17, ["Bill", "Due", "Amount", "Status"], "M");
  for (let i = 0; i < 5; i++) {
    const row = 18 + i;
    const sourceRow = 8 + i;
    cells.push(
      c(`M${row}`, { formula: `'Bills Calendar'!B${sourceRow}`, ...bodyStyle() }),
      c(`N${row}`, { formula: `'Bills Calendar'!C${sourceRow}`, ...numberStyle() }),
      c(`O${row}`, { formula: `'Bills Calendar'!D${sourceRow}`, numberFormat: '"$"#,##0', ...moneyStyle() }),
      c(`P${row}`, { formula: `'Bills Calendar'!E${sourceRow}`, ...statusStyle() }),
    );
  }

  return budgetTab("Dashboard", cells, {
    freeze: "B7",
    widthsMap: { 2: 18, 3: 13, 4: 13, 5: 13, 6: 13, 8: 18, 9: 13, 10: 13, 11: 13, 13: 18, 14: 10, 15: 12, 16: 12 },
    merges: [
      "B3:R3", "B4:R4", "B5:R5", "B15:F15", "H15:K15", "M15:P15",
      ...cards.flatMap(([range]) => cardMerges(range)),
    ],
    validations: [{ range: "C7", type: "list", options: { ref: "=MonthList" } }],
    conditionalFormats: [
      { range: "F18:F26", rule: { kind: "formula", formula: '$F18="Over"', fill: THEME.warning, fontColor: "8B2D20", bold: true } },
      dataBar("K18:K22", THEME.sage),
    ],
    charts: [
      chart("column", "Budget vs Actual", "Dashboard!C17:D26", "Dashboard!B18:B26", 29, 2, [THEME.sage, THEME.blush]),
      chart("doughnut", "Actual Spending", "Dashboard!D17:D26", "Dashboard!B18:B26", 29, 8, [THEME.sage, THEME.blush, THEME.champagne, THEME.clay]),
      chart("line", "Savings Over Year", "'Annual Overview'!E7:E19", "'Annual Overview'!B8:B19", 29, 14, [THEME.sage]),
    ],
  });
}

function budgetAnnualOverviewTab(): TabSpec {
  const cells = budgetHeroCells("Annual Overview", "Annual Overview", "A 12-month financial command center fed by the transaction log", 14);
  addTableHeader(cells, 7, ["Month", "Income", "Expenses", "Savings", "Debt Paid", "Net Cash", "Savings Rate", "Largest Category", "Bills Paid"], "B");
  for (let i = 0; i < 12; i++) {
    const row = 8 + i;
    const m = i + 1;
    const start = `DATE(Settings!$C$6,${m},1)`;
    const end = `EOMONTH(${start},0)`;
    cells.push(
      c(`B${row}`, { formula: `INDEX(Settings!$M$6:$M$17,${m})`, ...bodyStyle() }),
      c(`C${row}`, { formula: `SUMIFS('Transaction Log'!G8:G207,'Transaction Log'!D8:D207,"Income",'Transaction Log'!B8:B207,">="&${start},'Transaction Log'!B8:B207,"<="&${end})`, numberFormat: '"$"#,##0', ...moneyStyle() }),
      c(`D${row}`, { formula: `SUMIFS('Transaction Log'!G8:G207,'Transaction Log'!D8:D207,"Expense",'Transaction Log'!B8:B207,">="&${start},'Transaction Log'!B8:B207,"<="&${end})`, numberFormat: '"$"#,##0', ...moneyStyle() }),
      c(`E${row}`, { formula: `SUMIFS('Transaction Log'!G8:G207,'Transaction Log'!D8:D207,"Savings",'Transaction Log'!B8:B207,">="&${start},'Transaction Log'!B8:B207,"<="&${end})`, numberFormat: '"$"#,##0', ...moneyStyle() }),
      c(`F${row}`, { formula: `SUMIFS('Transaction Log'!G8:G207,'Transaction Log'!D8:D207,"Debt",'Transaction Log'!B8:B207,">="&${start},'Transaction Log'!B8:B207,"<="&${end})`, numberFormat: '"$"#,##0', ...moneyStyle() }),
      c(`G${row}`, { formula: `C${row}-D${row}-E${row}-F${row}`, numberFormat: '"$"#,##0', ...moneyStyle() }),
      c(`H${row}`, { formula: `IFERROR(E${row}/C${row},0)`, numberFormat: "0%", ...numberStyle() }),
      c(`I${row}`, { formula: `INDEX('Spending Analysis'!B8:B20,MATCH(MAX('Spending Analysis'!D8:D20),'Spending Analysis'!D8:D20,0))`, ...bodyStyle() }),
      c(`J${row}`, { formula: `COUNTIFS('Bills Calendar'!E8:E60,"Paid")`, ...numberStyle() }),
    );
  }
  return budgetTab("Annual Overview", cells, {
    freeze: "B7",
    widthsMap: { 2: 12, 3: 14, 4: 14, 5: 14, 6: 14, 7: 14, 8: 12, 9: 20, 10: 12 },
    merges: ["B3:N3", "B4:N4", "B5:N5"],
    conditionalFormats: [dataBar("H8:H19", THEME.sage), { range: "G8:G19", rule: { kind: "cellIs", operator: "lessThan", values: [0], fill: THEME.warning, fontColor: "8B2D20", bold: true } }],
    charts: [
      chart("column", "Income vs Expenses", "'Annual Overview'!C7:D19", "'Annual Overview'!B8:B19", 23, 2, [THEME.sage, THEME.blush]),
      chart("line", "Savings Trend", "'Annual Overview'!E7:E19", "'Annual Overview'!B8:B19", 23, 9, [THEME.sage]),
    ],
  });
}

function budgetMonthlyBudgetTab(): TabSpec {
  return budgetTrackerTab({
    name: "Monthly Budget",
    title: "Monthly Budget",
    subtitle: "Plan monthly income, bills, needs, wants, savings, and debt by category",
    headers: ["Category", "Group", "Budget", "Actual", "Remaining", "Used", "Status", "Notes"],
    rows: budgetCategories().map((category, index) => [
      category,
      index < 5 ? "Needs" : index < 9 ? "Wants" : "Goals",
      250 + index * 80,
      "",
      "",
      "",
      "On Track",
      "",
    ]),
    startRow: 8,
    totalRows: 42,
    formulasByColumn: {
      E: "SUMIFS('Transaction Log'!G8:G207,'Transaction Log'!E8:E207,B{r},'Transaction Log'!D8:D207,\"Expense\")",
      F: "D{r}-E{r}",
      G: "IFERROR(E{r}/D{r},0)",
      H: "IF(E{r}=0,\"No Spend\",IF(E{r}<=D{r},\"On Track\",\"Over\"))",
    },
    validations: [
      { range: "B8:B49", type: "list", options: { ref: "=BudgetCategories" } },
      { range: "C8:C49", type: "list", options: ["Needs", "Wants", "Savings", "Debt", "Giving"] },
    ],
    cf: [
      dataBar("G8:G49", THEME.sage),
      { range: "H8:H49", rule: { kind: "formula", formula: '$H8="Over"', fill: THEME.warning, fontColor: "8B2D20", bold: true } },
    ],
  });
}

function budgetPaycheckViewTab(): TabSpec {
  const cells = budgetHeroCells("Paycheck View", "Paycheck View", "Plan every dollar by pay period without rebuilding the monthly budget", 16);
  cells.push(
    c("B7", { value: "BUDGET PERIOD", ...labelStyle() }),
    c("C7", { value: "Bi-Weekly", ...inputStyle() }),
    c("E7", { value: "START DATE", ...labelStyle() }),
    c("F7", { formula: "DATE(Settings!C6,3,1)", numberFormat: "m/d/yyyy", ...inputStyle() }),
    c("H7", { value: "END DATE", ...labelStyle() }),
    c("I7", { formula: "F7+13", numberFormat: "m/d/yyyy", ...inputStyle() }),
  );
  const income = `SUMIFS('Transaction Log'!G8:G207,'Transaction Log'!D8:D207,"Income",'Transaction Log'!B8:B207,">="&$F$7,'Transaction Log'!B8:B207,"<="&$I$7)`;
  const expense = `SUMIFS('Transaction Log'!G8:G207,'Transaction Log'!D8:D207,"Expense",'Transaction Log'!B8:B207,">="&$F$7,'Transaction Log'!B8:B207,"<="&$I$7)`;
  const cards = [
    ["B9:D13", "TAKE-HOME PAY", income, "income in this period", "sage"],
    ["E9:G13", "FIXED BILLS", expense, "expenses due", "blush"],
    ["H9:J13", "AVAILABLE", "B10-E10", "left for variable spend", "champagne"],
    ["K9:M13", "SAVINGS", `SUMIFS('Transaction Log'!G8:G207,'Transaction Log'!D8:D207,"Savings",'Transaction Log'!B8:B207,">="&$F$7,'Transaction Log'!B8:B207,"<="&$I$7)`, "planned transfers", "sage"],
  ] as const;
  cards.forEach(([range, name, formula, caption, tone]) => addKpiCard(cells, range, name, formula, caption, tone));
  addSection(cells, "B15", "PAYCHECK ALLOCATION");
  addTableHeader(cells, 17, ["Bucket", "Budget", "Actual", "Remaining", "Priority", "Notes"], "B");
  ["Bills", "Groceries", "Gas", "Savings", "Debt", "Fun", "Buffer"].forEach((bucket, index) => {
    const row = 18 + index;
    cells.push(
      c(`B${row}`, { value: bucket, ...bodyStyle() }),
      c(`C${row}`, { value: 200 + index * 75, numberFormat: '"$"#,##0', ...moneyStyle() }),
      c(`D${row}`, { formula: `SUMIFS('Transaction Log'!G8:G207,'Transaction Log'!E8:E207,B${row},'Transaction Log'!B8:B207,">="&$F$7,'Transaction Log'!B8:B207,"<="&$I$7)`, numberFormat: '"$"#,##0', ...moneyStyle() }),
      c(`E${row}`, { formula: `C${row}-D${row}`, numberFormat: '"$"#,##0', ...moneyStyle() }),
      c(`F${row}`, { value: index < 3 ? "High" : "Medium", ...statusStyle() }),
      c(`G${row}`, { value: "", ...bodyStyle() }),
    );
  });
  return budgetTab("Paycheck View", cells, {
    freeze: "B7",
    widthsMap: { 2: 18, 3: 14, 4: 14, 5: 14, 6: 14, 7: 30 },
    merges: ["B3:P3", "B4:P4", "B5:P5", "B15:G15", ...cards.flatMap(([range]) => cardMerges(range))],
    validations: [
      { range: "C7", type: "list", options: ["Weekly", "Bi-Weekly", "Semi-Monthly", "Monthly", "Custom"] },
      { range: "F18:F30", type: "list", options: ["Low", "Medium", "High", "Urgent"] },
    ],
    conditionalFormats: [{ range: "E18:E30", rule: { kind: "cellIs", operator: "lessThan", values: [0], fill: THEME.warning, fontColor: "8B2D20", bold: true } }],
  });
}

function budgetTransactionLogTab(): TabSpec {
  const rows = [
    ["=DATE(Settings!$C$6,1,5)", "Paycheck", "Income", "Paycheck", "Checking", 3230, "", "Cleared", ""],
    ["=DATE(Settings!$C$6,1,6)", "Rent / Mortgage", "Expense", "Housing", "Checking", 1380, "", "Cleared", ""],
    ["=DATE(Settings!$C$6,1,8)", "Groceries", "Expense", "Groceries", "Credit Card", 188, "", "Cleared", ""],
    ["=DATE(Settings!$C$6,1,10)", "Emergency Fund", "Savings", "Savings", "Savings", 400, "", "Cleared", ""],
    ["=DATE(Settings!$C$6,1,12)", "Credit Card Payment", "Debt", "Debt", "Checking", 250, "", "Cleared", ""],
    ["=DATE(Settings!$C$6,2,5)", "Paycheck", "Income", "Paycheck", "Checking", 3230, "", "Cleared", ""],
    ["=DATE(Settings!$C$6,2,9)", "Utilities", "Expense", "Utilities", "Checking", 216, "", "Cleared", ""],
    ["=DATE(Settings!$C$6,3,5)", "Paycheck", "Income", "Paycheck", "Checking", 3230, "", "Cleared", ""],
    ["=DATE(Settings!$C$6,3,11)", "Transportation", "Expense", "Transportation", "Credit Card", 325, "", "Cleared", ""],
    ["=DATE(Settings!$C$6,3,15)", "Vacation Fund", "Savings", "Savings", "Savings", 150, "", "Cleared", ""],
  ];
  return budgetTrackerTab({
    name: "Transaction Log",
    title: "Transaction Log",
    subtitle: "The only place buyers need to enter day-to-day income, expenses, savings, and debt payments",
    headers: ["Date", "Description", "Type", "Category", "Account", "Amount", "Month", "Status", "Notes"],
    rows,
    startRow: 8,
    totalRows: 200,
    formulasByColumn: { H: "TEXT(B{r},\"mmm\")" },
    validations: [
      { range: "D8:D207", type: "list", options: { ref: "=TransactionTypeList" } },
      { range: "E8:E207", type: "list", options: { ref: "=BudgetCategories" } },
      { range: "F8:F207", type: "list", options: { ref: "=AccountList" } },
      { range: "I8:I207", type: "list", options: ["Cleared", "Pending", "Review"] },
    ],
    cf: [
      { range: "D8:D207", rule: { kind: "formula", formula: '$D8="Income"', fill: THEME.success, fontColor: THEME.sage } },
      { range: "D8:D207", rule: { kind: "formula", formula: '$D8="Expense"', fill: THEME.blushLight, fontColor: THEME.ink } },
      dataBar("G8:G207", THEME.sage),
    ],
  });
}

function budgetRecurringTransactionsTab(): TabSpec {
  return budgetTrackerTab({
    name: "Recurring Transactions",
    title: "Recurring Transactions",
    subtitle: "Plan recurring income, bills, subscriptions, savings transfers, and debt payments",
    headers: ["Name", "Type", "Category", "Account", "Frequency", "Due Day", "Amount", "AutoPay?", "Status", "Notes"],
    rows: [
      ["Paycheck", "Income", "Paycheck", "Checking", "Bi-Weekly", 5, 3230, "Yes", "Active", ""],
      ["Rent / Mortgage", "Expense", "Housing", "Checking", "Monthly", 1, 1380, "Yes", "Active", ""],
      ["Internet", "Expense", "Utilities", "Checking", "Monthly", 12, 75, "Yes", "Active", ""],
      ["Emergency Fund", "Savings", "Savings", "Savings", "Monthly", 15, 400, "Yes", "Active", ""],
    ],
    startRow: 8,
    totalRows: 72,
    validations: [
      { range: "C8:C79", type: "list", options: { ref: "=TransactionTypeList" } },
      { range: "D8:D79", type: "list", options: { ref: "=BudgetCategories" } },
      { range: "F8:F79", type: "list", options: ["Weekly", "Bi-Weekly", "Semi-Monthly", "Monthly", "Quarterly", "Annual"] },
      { range: "I8:I79", type: "list", options: ["Yes", "No"] },
      { range: "J8:J79", type: "list", options: ["Active", "Paused", "Cancel", "Review"] },
    ],
    cf: [{ range: "J8:J79", rule: { kind: "formula", formula: '$J8="Review"', fill: THEME.warning, fontColor: "8B2D20", bold: true } }],
  });
}

function budgetBillsCalendarTab(): TabSpec {
  return budgetTrackerTab({
    name: "Bills Calendar",
    title: "Bills Calendar",
    subtitle: "A due-date tracker for fixed bills, autopay, payment status, and monthly cash pressure",
    headers: ["Bill", "Category", "Due Day", "Amount", "Status", "AutoPay?", "Account", "Next Due", "Notes"],
    rows: [
      ["Rent / Mortgage", "Housing", 1, 1380, "Autopay", "Yes", "Checking", "=DATE(Settings!$C$6,3,C8)", ""],
      ["Electric", "Utilities", 9, 112, "Due Soon", "No", "Checking", "=DATE(Settings!$C$6,3,C9)", ""],
      ["Internet", "Utilities", 12, 75, "Paid", "Yes", "Credit Card", "=DATE(Settings!$C$6,3,C10)", ""],
      ["Phone", "Utilities", 18, 95, "Upcoming", "Yes", "Credit Card", "=DATE(Settings!$C$6,3,C11)", ""],
      ["Insurance", "Insurance", 22, 180, "Upcoming", "No", "Checking", "=DATE(Settings!$C$6,3,C12)", ""],
    ],
    startRow: 8,
    totalRows: 52,
    validations: [
      { range: "C8:C59", type: "list", options: { ref: "=BudgetCategories" } },
      { range: "F8:F59", type: "list", options: { ref: "=BillStatusList" } },
      { range: "G8:G59", type: "list", options: ["Yes", "No"] },
      { range: "H8:H59", type: "list", options: { ref: "=AccountList" } },
    ],
    cf: [
      { range: "F8:F59", rule: { kind: "formula", formula: '$F8="Overdue"', fill: THEME.warning, fontColor: "8B2D20", bold: true } },
      { range: "F8:F59", rule: { kind: "formula", formula: '$F8="Paid"', fill: THEME.success, fontColor: THEME.sage } },
    ],
  });
}

function budgetSavingsTrackerTab(): TabSpec {
  return budgetTrackerTab({
    name: "Savings Tracker",
    title: "Savings Tracker",
    subtitle: "Track savings goals, contributions, progress, target dates, and monthly momentum",
    headers: ["Goal", "Purpose", "Target", "Saved", "Progress", "Remaining", "Monthly Need", "Target Date", "Status"],
    rows: [
      ["Emergency Fund", "Safety", 10000, 3800, "", "", "", "=DATE(Settings!$C$6,12,31)", "On Track"],
      ["Car Repair Fund", "Sinking Fund", 2000, 1100, "", "", "", "=DATE(Settings!$C$6,8,31)", "On Track"],
      ["Down Payment", "Big Goal", 25000, 6200, "", "", "", "=DATE(Settings!$C$6+1,6,30)", "Review"],
      ["Vacation Fund", "Lifestyle", 3000, 1500, "", "", "", "=DATE(Settings!$C$6,7,1)", "On Track"],
    ],
    startRow: 8,
    totalRows: 42,
    formulasByColumn: {
      F: "IFERROR(E{r}/D{r},0)",
      G: "D{r}-E{r}",
      H: "IFERROR(G{r}/MAX(1,DATEDIF(TODAY(),I{r},\"M\")),0)",
    },
    validations: [{ range: "J8:J49", type: "list", options: ["On Track", "Review", "Paused", "Complete"] }],
    cf: [dataBar("F8:F49", THEME.sage), { range: "J8:J49", rule: { kind: "formula", formula: '$J8="Review"', fill: THEME.warning, fontColor: "8B2D20", bold: true } }],
  });
}

function budgetDebtTrackerTab(): TabSpec {
  return budgetTrackerTab({
    name: "Debt Tracker",
    title: "Debt Tracker",
    subtitle: "Debt snowball or avalanche tracker with payoff progress and payment planning",
    headers: ["Debt", "Strategy", "APR", "Starting", "Current", "Minimum", "Extra", "Progress", "Monthly Payment", "Status"],
    rows: [
      ["Credit Card", "Avalanche", 0.229, 6400, 5200, 140, 110, "", "", "Active"],
      ["Student Loan", "Avalanche", 0.065, 12000, 11150, 120, 0, "", "", "Active"],
      ["Car Loan", "Snowball", 0.049, 15000, 9800, 310, 50, "", "", "Active"],
    ],
    startRow: 8,
    totalRows: 36,
    formulasByColumn: {
      I: "IFERROR(1-F{r}/E{r},0)",
      J: "G{r}+H{r}",
    },
    validations: [
      { range: "C8:C43", type: "list", options: ["Snowball", "Avalanche", "Custom"] },
      { range: "K8:K43", type: "list", options: ["Active", "Paused", "Paid Off", "Review"] },
    ],
    cf: [dataBar("I8:I43", THEME.sage), { range: "K8:K43", rule: { kind: "formula", formula: '$K8="Review"', fill: THEME.warning, fontColor: "8B2D20" } }],
  });
}

function budgetSubscriptionsTab(): TabSpec {
  return budgetTrackerTab({
    name: "Subscriptions",
    title: "Subscription Tracker",
    subtitle: "Audit monthly and annual subscriptions before they quietly drain the budget",
    headers: ["Subscription", "Category", "Frequency", "Amount", "Annual Cost", "Renewal Date", "Keep?", "Payment Method", "Notes"],
    rows: [
      ["Streaming", "Entertainment", "Monthly", 14.99, "", "=DATE(Settings!$C$6,4,5)", "Yes", "Credit Card", ""],
      ["Gym", "Health", "Monthly", 39, "", "=DATE(Settings!$C$6,4,12)", "Review", "Credit Card", ""],
      ["Cloud Storage", "Utilities", "Annual", 99, "", "=DATE(Settings!$C$6,9,1)", "Yes", "Credit Card", ""],
    ],
    startRow: 8,
    totalRows: 48,
    formulasByColumn: { F: "IF(D{r}=\"Annual\",E{r},E{r}*12)" },
    validations: [
      { range: "D8:D55", type: "list", options: ["Monthly", "Quarterly", "Annual"] },
      { range: "H8:H55", type: "list", options: ["Yes", "No", "Review"] },
      { range: "I8:I55", type: "list", options: { ref: "=AccountList" } },
    ],
    cf: [{ range: "H8:H55", rule: { kind: "formula", formula: '$H8="Review"', fill: THEME.warning, fontColor: "8B2D20", bold: true } }],
  });
}

function budgetCategoryBudgetTab(): TabSpec {
  return budgetTrackerTab({
    name: "Category Budget",
    title: "Category Budget",
    subtitle: "Set monthly planned amounts once; dashboard and monthly budget compare actual spending automatically",
    headers: ["Category", "Group", "Monthly Budget", "Dashboard Budget", "Priority", "Carryover?", "Notes"],
    rows: budgetCategories().map((category, index) => [
      category,
      index < 5 ? "Needs" : index < 9 ? "Wants" : "Goals",
      250 + index * 80,
      "",
      index < 4 ? "High" : "Medium",
      index % 3 === 0 ? "Yes" : "No",
      "",
    ]),
    startRow: 8,
    totalRows: 32,
    formulasByColumn: { E: "D{r}" },
    validations: [
      { range: "B8:B39", type: "list", options: { ref: "=BudgetCategories" } },
      { range: "C8:C39", type: "list", options: ["Needs", "Wants", "Savings", "Debt", "Giving"] },
      { range: "F8:F39", type: "list", options: ["Low", "Medium", "High", "Urgent"] },
      { range: "G8:G39", type: "list", options: ["Yes", "No"] },
    ],
    cf: [dataBar("D8:D39", THEME.sage)],
  });
}

function budgetSpendingAnalysisTab(): TabSpec {
  const cells = budgetHeroCells("Spending Analysis", "Spending Analysis", "Understand where money is going by category, month, and budget priority", 12);
  addTableHeader(cells, 7, ["Category", "Budget", "Actual", "Share", "Rank", "Insight"], "B");
  budgetCategories().slice(0, 13).forEach((category, index) => {
    const row = 8 + index;
    cells.push(
      c(`B${row}`, { value: category, ...bodyStyle() }),
      c(`C${row}`, { formula: `SUMIFS('Category Budget'!D8:D39,'Category Budget'!B8:B39,B${row})`, numberFormat: '"$"#,##0', ...moneyStyle() }),
      c(`D${row}`, { formula: `SUMIFS('Transaction Log'!G8:G207,'Transaction Log'!D8:D207,"Expense",'Transaction Log'!E8:E207,B${row})`, numberFormat: '"$"#,##0', ...moneyStyle() }),
      c(`E${row}`, { formula: `IFERROR(D${row}/SUM($D$8:$D$20),0)`, numberFormat: "0%", ...numberStyle() }),
      c(`F${row}`, { formula: `RANK(D${row},$D$8:$D$20,0)`, ...numberStyle() }),
      c(`G${row}`, { formula: `IF(D${row}>C${row},"Review","OK")`, ...statusStyle() }),
    );
  });
  return budgetTab("Spending Analysis", cells, {
    freeze: "B7",
    widthsMap: { 2: 18, 3: 13, 4: 13, 5: 12, 6: 10, 7: 18 },
    merges: ["B3:L3", "B4:L4", "B5:L5"],
    conditionalFormats: [dataBar("E8:E20", THEME.sage), { range: "G8:G20", rule: { kind: "formula", formula: '$G8="Review"', fill: THEME.warning, fontColor: "8B2D20", bold: true } }],
    charts: [chart("bar", "Top Spending Categories", "'Spending Analysis'!D7:D20", "'Spending Analysis'!B8:B20", 8, 9, [THEME.sage])],
  });
}

function budgetSmartCalendarTab(): TabSpec {
  const cells = budgetHeroCells("Smart Calendar", "Smart Calendar", "See paydays, bills, savings transfers, no-spend days, and debt payments in one monthly view", 16);
  cells.push(c("B7", { value: "MONTH", ...labelStyle() }), c("C7", { value: "Mar", ...inputStyle() }));
  addTableHeader(cells, 9, ["Day", "Income", "Bills", "Savings", "Debt", "Transactions", "Status"], "B");
  for (let day = 1; day <= 31; day++) {
    const row = 9 + day;
    const dateFormula = `DATE(Settings!$C$6,MATCH($C$7,Settings!$M$6:$M$17,0),${day})`;
    cells.push(
      c(`B${row}`, { formula: dateFormula, numberFormat: "d", ...numberStyle() }),
      c(`C${row}`, { formula: `SUMIFS('Transaction Log'!G8:G207,'Transaction Log'!D8:D207,"Income",'Transaction Log'!B8:B207,B${row})`, numberFormat: '"$"#,##0', ...moneyStyle() }),
      c(`D${row}`, { formula: `SUMIFS('Bills Calendar'!D8:D59,'Bills Calendar'!C8:C59,DAY(B${row}))`, numberFormat: '"$"#,##0', ...moneyStyle() }),
      c(`E${row}`, { formula: `SUMIFS('Transaction Log'!G8:G207,'Transaction Log'!D8:D207,"Savings",'Transaction Log'!B8:B207,B${row})`, numberFormat: '"$"#,##0', ...moneyStyle() }),
      c(`F${row}`, { formula: `SUMIFS('Transaction Log'!G8:G207,'Transaction Log'!D8:D207,"Debt",'Transaction Log'!B8:B207,B${row})`, numberFormat: '"$"#,##0', ...moneyStyle() }),
      c(`G${row}`, { formula: `COUNTIFS('Transaction Log'!B8:B207,B${row})`, ...numberStyle() }),
      c(`H${row}`, { formula: `IF(C${row}+D${row}+E${row}+F${row}=0,"No Spend",IF(D${row}>0,"Bill Due","Active"))`, ...statusStyle() }),
    );
  }
  return budgetTab("Smart Calendar", cells, {
    freeze: "B9",
    widthsMap: { 2: 10, 3: 13, 4: 13, 5: 13, 6: 13, 7: 12, 8: 14 },
    merges: ["B3:P3", "B4:P4", "B5:P5"],
    validations: [{ range: "C7", type: "list", options: { ref: "=MonthList" } }],
    conditionalFormats: [
      { range: "H10:H40", rule: { kind: "formula", formula: '$H10="Bill Due"', fill: THEME.warning, fontColor: "8B2D20", bold: true } },
      { range: "H10:H40", rule: { kind: "formula", formula: '$H10="No Spend"', fill: THEME.success, fontColor: THEME.sage } },
    ],
  });
}

function budgetYearInReviewTab(): TabSpec {
  const cells = budgetHeroCells("Year in Review", "Year in Review", "Automatic annual recap with wins, leaks, best months, and next-year targets", 14);
  const cards = [
    ["B7:D11", "TOTAL INCOME", "SUM('Annual Overview'!C8:C19)", "full year", "sage"],
    ["E7:G11", "TOTAL SPEND", "SUM('Annual Overview'!D8:D19)", "all expenses", "blush"],
    ["H7:J11", "SAVED", "SUM('Annual Overview'!E8:E19)", "savings transfers", "champagne"],
    ["K7:M11", "BEST MONTH", "INDEX('Annual Overview'!B8:B19,MATCH(MAX('Annual Overview'!G8:G19),'Annual Overview'!G8:G19,0))", "highest net cash", "sage"],
  ] as const;
  cards.forEach(([range, name, formula, caption, tone]) => addKpiCard(cells, range, name, formula, caption, tone));
  addSection(cells, "B14", "ANNUAL REVIEW");
  [
    ["Savings rate", "IFERROR(SUM('Annual Overview'!E8:E19)/SUM('Annual Overview'!C8:C19),0)", "0%"],
    ["Debt paid", "SUM('Annual Overview'!F8:F19)", '"$"#,##0'],
    ["Largest category", "INDEX('Spending Analysis'!B8:B20,MATCH(MAX('Spending Analysis'!D8:D20),'Spending Analysis'!D8:D20,0))", undefined],
    ["Months under budget", "COUNTIF('Annual Overview'!G8:G19,\">0\")", "0"],
  ].forEach(([label, formula, fmt], index) => {
    const row = 16 + index;
    cells.push(c(`B${row}`, { value: label, ...labelStyle() }), c(`C${row}`, { formula, numberFormat: fmt, ...bodyStyle() }));
  });
  return budgetTab("Year in Review", cells, {
    freeze: "B7",
    widthsMap: { 2: 20, 3: 24, 5: 16, 8: 16, 11: 16 },
    merges: ["B3:N3", "B4:N4", "B5:N5", "B14:F14", ...cards.flatMap(([range]) => cardMerges(range))],
    charts: [chart("column", "Annual Income vs Spending", "'Annual Overview'!C7:D19", "'Annual Overview'!B8:B19", 23, 2, [THEME.sage, THEME.blush])],
  });
}

function budgetWhatIfSimulatorTab(): TabSpec {
  const cells = budgetHeroCells("What-If Simulator", "What-If Simulator", "Adjust income, spending, debt, and savings assumptions before changing real plans", 12);
  addSection(cells, "B7", "SCENARIO INPUTS");
  [
    ["Monthly income change", 250],
    ["Expense reduction", 150],
    ["Extra debt payment", 100],
    ["Extra savings transfer", 200],
    ["Months to simulate", 12],
  ].forEach(([label, value], index) => {
    const row = 9 + index;
    cells.push(c(`B${row}`, { value: label, ...labelStyle() }), c(`C${row}`, { value, numberFormat: '"$"#,##0', ...inputStyle() }));
  });
  addSection(cells, "E7", "PROJECTED IMPACT");
  [
    ["Projected cash improvement", "($C$9+$C$10)*$C$13"],
    ["Extra debt paid", "$C$11*$C$13"],
    ["Extra savings", "$C$12*$C$13"],
    ["New annual savings rate", "IFERROR((SUM('Annual Overview'!E8:E19)+E11)/(SUM('Annual Overview'!C8:C19)+E9),0)"],
    ["Recommendation", "IF(E12>0.2,\"Strong improvement\",IF(E12>0.1,\"Good improvement\",\"Needs more room\"))"],
  ].forEach(([label, formula], index) => {
    const row = 9 + index;
    cells.push(c(`E${row}`, { value: label, ...labelStyle() }), c(`F${row}`, { formula, numberFormat: index === 3 ? "0%" : undefined, ...bodyStyle() }));
  });
  return budgetTab("What-If Simulator", cells, {
    freeze: "B7",
    widthsMap: { 2: 24, 3: 16, 5: 24, 6: 22 },
    merges: ["B3:L3", "B4:L4", "B5:L5", "B7:C7", "E7:F7"],
    conditionalFormats: [{ range: "F12", rule: { kind: "cellIs", operator: "greaterThan", values: [0.15], fill: THEME.success, fontColor: THEME.sage, bold: true } }],
  });
}

function budgetMoneyCoachTab(): TabSpec {
  const cells = budgetHeroCells("Money Coach", "Money Coach", "Formula-written insights that tell buyers where to look next", 12);
  addSection(cells, "B7", "COACHING CARDS");
  [
    ["Cash Flow", "IF(Dashboard!H10<0,\"Your current selected month is overspent. Check Spending Analysis and Bills Calendar.\",\"Your selected month has room left. Consider moving extra to savings or debt.\")"],
    ["Savings", "IFERROR(IF(Dashboard!K10/Dashboard!B10<0.1,\"Savings rate is below 10%. Try the What-If Simulator.\",\"Savings rate is healthy for this month.\"),\"Add income first.\")"],
    ["Bills", "IF(COUNTIF('Bills Calendar'!E8:E59,\"Overdue\")>0,\"There are overdue bills. Review Bills Calendar before variable spending.\",\"No overdue bills are flagged.\")"],
    ["Debt", "IF(SUM('Debt Tracker'!F8:F43)>0,\"Keep paying highest APR first or use snowball if motivation matters.\",\"Debt tracker shows no active balance.\")"],
    ["Spending", "IF(MAX('Spending Analysis'!D8:D20)>AVERAGE('Spending Analysis'!D8:D20)*2,\"One category is much larger than average. Review the top-ranked spending category.\",\"Spending is relatively balanced across categories.\")"],
  ].forEach(([title, formula], index) => {
    const row = 9 + index * 3;
    cells.push(
      c(`B${row}`, { value: title, font: { name: "Georgia", size: 14, bold: true, color: THEME.white }, fill: { color: THEME.sage }, alignment: { horizontal: "left", vertical: "middle", indent: 1 }, border: softBorder() }),
      c(`C${row}`, { formula, font: { name: "Arial", size: 11, color: THEME.charcoal }, fill: { color: THEME.ivory }, alignment: { horizontal: "left", vertical: "middle", wrapText: true, indent: 1 }, border: softBorder() }),
    );
  });
  return budgetTab("Money Coach", cells, {
    freeze: "B7",
    widthsMap: { 2: 18, 3: 78 },
    rowHeightsMap: { 9: 48, 12: 48, 15: 48, 18: 48, 21: 48 },
    merges: ["B3:L3", "B4:L4", "B5:L5", "B7:L7", "C9:L9", "C12:L12", "C15:L15", "C18:L18", "C21:L21"],
  });
}

function budgetAccountsTab(): TabSpec {
  return budgetTrackerTab({
    name: "Accounts",
    title: "Accounts",
    subtitle: "Track account balances and connect money movement to the transaction log",
    headers: ["Account", "Type", "Starting Balance", "Inflow", "Outflow", "Current Balance", "Reconcile?", "Notes"],
    rows: [
      ["Checking", "Bank", 1200, "", "", "", "Yes", ""],
      ["Savings", "Bank", 3800, "", "", "", "Yes", ""],
      ["Credit Card", "Credit", -5200, "", "", "", "Review", ""],
    ],
    startRow: 8,
    totalRows: 30,
    formulasByColumn: {
      E: "SUMIFS('Transaction Log'!G8:G207,'Transaction Log'!F8:F207,B{r},'Transaction Log'!D8:D207,\"Income\")",
      F: "SUMIFS('Transaction Log'!G8:G207,'Transaction Log'!F8:F207,B{r},'Transaction Log'!D8:D207,\"Expense\")",
      G: "D{r}+E{r}-F{r}",
    },
    validations: [{ range: "H8:H37", type: "list", options: ["Yes", "No", "Review"] }],
    cf: [{ range: "H8:H37", rule: { kind: "formula", formula: '$H8="Review"', fill: THEME.warning, fontColor: "8B2D20" } }],
  });
}

function budgetNetWorthTab(): TabSpec {
  const cells = budgetHeroCells("Net Worth", "Net Worth Tracker", "Assets, liabilities, and net worth progress in one simple overview", 12);
  addTableHeader(cells, 7, ["Asset", "Category", "Value", "Notes"], "B");
  [["Checking", "Cash", 1200], ["Savings", "Cash", 3800], ["Investment", "Investment", 6500], ["Car", "Asset", 9000]].forEach(([asset, category, value], index) => {
    const row = 8 + index;
    cells.push(c(`B${row}`, { value: asset, ...bodyStyle() }), c(`C${row}`, { value: category, ...bodyStyle() }), c(`D${row}`, { value, numberFormat: '"$"#,##0', ...moneyStyle() }), c(`E${row}`, { value: "", ...bodyStyle() }));
  });
  addTableHeader(cells, 7, ["Liability", "Category", "Balance", "Notes"], "G");
  [["Credit Card", "Debt", 5200], ["Student Loan", "Debt", 11150], ["Car Loan", "Debt", 9800]].forEach(([debt, category, value], index) => {
    const row = 8 + index;
    cells.push(c(`G${row}`, { value: debt, ...bodyStyle() }), c(`H${row}`, { value: category, ...bodyStyle() }), c(`I${row}`, { value, numberFormat: '"$"#,##0', ...moneyStyle() }), c(`J${row}`, { value: "", ...bodyStyle() }));
  });
  const cards = [
    ["B16:D20", "TOTAL ASSETS", "SUM(D8:D30)", "asset value", "sage"],
    ["E16:G20", "TOTAL DEBT", "SUM(I8:I30)", "liability balance", "blush"],
    ["H16:J20", "NET WORTH", "B17-E17", "assets minus debts", "champagne"],
  ] as const;
  cards.forEach(([range, name, formula, caption, tone]) => addKpiCard(cells, range, name, formula, caption, tone));
  return budgetTab("Net Worth", cells, {
    freeze: "B7",
    widthsMap: { 2: 18, 3: 16, 4: 14, 5: 24, 7: 18, 8: 16, 9: 14, 10: 24 },
    merges: ["B3:L3", "B4:L4", "B5:L5", ...cards.flatMap(([range]) => cardMerges(range))],
    charts: [chart("doughnut", "Assets vs Debts", "Net Worth!D7:D11", "Net Worth!B8:B11", 23, 2, [THEME.sage, THEME.blush, THEME.champagne])],
  });
}

function budgetHeroCells(sheetName: string, title: string, subtitle: string, widthCols: number): CellSpec[] {
  const end = col(Math.max(8, widthCols));
  return [
    c("B3", { value: title, font: { name: "Georgia", size: 34, bold: true, color: THEME.ink }, fill: { color: THEME.cream }, alignment: { horizontal: "left", vertical: "middle", indent: 1 } }),
    c("B4", { value: subtitle, font: { name: "Arial", size: 11, italic: true, color: THEME.muted }, fill: { color: THEME.cream }, alignment: { horizontal: "left", vertical: "middle", indent: 1, wrapText: true } }),
    c("B5", { value: "RECURRING AUTOMATIONS · EXCEL + GOOGLE SHEETS · NO COPY PASTE", font: { name: "Arial", size: 8, bold: true, color: THEME.white }, fill: { color: THEME.ink }, alignment: { horizontal: "center", vertical: "middle" } }),
    c(`${end}5`, { value: sheetName.toUpperCase(), font: { name: "Arial", size: 8, bold: true, color: THEME.white }, fill: { color: THEME.ink }, alignment: { horizontal: "center", vertical: "middle" } }),
  ];
}

function budgetTab(
  name: string,
  cells: CellSpec[],
  opts: {
    freeze?: string;
    widthsMap?: Record<number, number>;
    merges?: string[];
    validations?: DataValidationSpec[];
    conditionalFormats?: ConditionalFormatSpec[];
    charts?: ChartSpec[];
    rowHeightsMap?: Record<number, number>;
  } = {},
): TabSpec {
  return {
    name: safeSheetName(name),
    tabColor: name === "Dashboard" ? THEME.ink : THEME.sage,
    freeze: opts.freeze ?? "B7",
    hideGridlines: true,
    columnWidths: widths(20, opts.widthsMap),
    rowHeights: { ...heroRows(), 3: 52, 4: 28, 5: 20, ...(opts.rowHeightsMap ?? {}) },
    cells,
    merges: opts.merges,
    dataValidations: opts.validations,
    conditionalFormats: opts.conditionalFormats,
    charts: opts.charts,
  };
}

function budgetTrackerTab(config: TrackerConfig): TabSpec {
  const cells = budgetHeroCells(config.name, config.title, config.subtitle, Math.max(config.headers.length + 3, 12));
  addTableHeader(cells, 7, config.headers, "B");
  const startCol = 2;
  for (let i = 0; i < config.totalRows; i++) {
    const row = config.startRow + i;
    const sample = config.rows[i] || [];
    config.headers.forEach((_, index) => {
      const letter = col(startCol + index);
      const formulaTemplate = config.formulasByColumn?.[letter];
      const sampleValue = sample[index];
      if (formulaTemplate) {
        cells.push(c(`${letter}${row}`, { formula: formulaTemplate.replaceAll("{r}", String(row)), ...bodyStyleForValue(sampleValue) }));
      } else if (sampleValue !== undefined && sampleValue !== "") {
        cells.push(c(`${letter}${row}`, cellValue(sampleValue)));
      } else if (i < 16) {
        cells.push(c(`${letter}${row}`, { value: "", ...bodyStyle() }));
      }
    });
  }
  return budgetTab(config.name, cells, {
    freeze: "B7",
    widthsMap: Object.fromEntries(config.headers.map((header, index) => [index + 2, Math.min(24, Math.max(12, header.length + 4))])),
    merges: [`B3:${col(startCol + config.headers.length + 1)}3`, `B4:${col(startCol + config.headers.length + 1)}4`, `B5:${col(startCol + config.headers.length + 1)}5`],
    validations: config.validations,
    conditionalFormats: config.cf,
  });
}

function budgetCategories(): string[] {
  return [
    "Housing",
    "Groceries",
    "Utilities",
    "Transportation",
    "Insurance",
    "Health",
    "Kids",
    "Dining Out",
    "Entertainment",
    "Shopping",
    "Personal Care",
    "Giving",
    "Savings",
    "Debt",
    "Travel",
    "Pets",
    "Education",
    "Home",
    "Subscriptions",
    "Other",
  ];
}

function setupTab(): TabSpec {
  const cells = baseTabCells("Setup", "Quick Setup", "Customize your event details, dropdowns, and planning defaults", 16);
  cells.push(
    c("B6", { value: "Event Date", ...labelStyle() }),
    c("C6", { value: "2026-06-20", numberFormat: "m/d/yyyy", ...inputStyle() }),
    c("B7", { value: "Couple Names", ...labelStyle() }),
    c("C7", { value: "Amina & Sami", ...inputStyle() }),
    c("B8", { value: "Total Wedding Budget", ...labelStyle() }),
    c("C8", { value: 25000, numberFormat: '"$"#,##0', ...inputStyle() }),
    c("B9", { value: "Default Currency", ...labelStyle() }),
    c("C9", { value: "USD", ...inputStyle() }),
    c("B10", { value: "Planning Start", ...labelStyle() }),
    c("C10", { value: "2026-01-01", numberFormat: "m/d/yyyy", ...inputStyle() }),
    c("B11", { value: "Tabs Included", ...labelStyle() }),
    c("C11", { value: WEDDING_TABS.length, ...inputStyle() }),
  );

  addList(cells, "E", "Vendor Categories", [
    "Venue", "Catering", "Photography", "Videography", "Florals", "Music", "Attire", "Beauty",
    "Transportation", "Stationery", "Decor", "Cake", "Planner", "Officiant", "Accommodation",
  ]);
  addList(cells, "G", "RSVP Status", ["Invited", "Attending", "Declined", "Maybe", "No Response"]);
  addList(cells, "I", "Meal Options", ["Chicken", "Beef", "Fish", "Vegetarian", "Vegan", "Kids", "No Meal"]);
  addList(cells, "K", "Payment Status", ["Not Started", "Deposit Paid", "Paid", "Due Soon", "Overdue"]);
  addList(cells, "M", "Task Status", ["Not Started", "In Progress", "Waiting", "Done", "Overdue", "Skipped"]);
  addList(cells, "O", "Priority", ["Low", "Medium", "High", "Urgent", "Someday"]);

  addSetupChecklist(cells);

  return {
    name: "Setup",
    tabColor: THEME.sage,
    freeze: "B6",
    hideGridlines: true,
    columnWidths: widths(16, { 2: 22, 3: 18, 5: 20, 7: 18, 9: 18, 11: 18, 13: 18, 15: 15 }),
    rowHeights: heroRows(),
    cells,
    merges: ["B3:P3", "B4:P4", "B14:P14", "B26:P26"],
    conditionalFormats: [
      { range: "C8", rule: { kind: "cellIs", operator: "lessThan", values: [1000], fill: THEME.warning, fontColor: "8B2D20", bold: true } },
    ],
  };
}

function dashboardTab(): TabSpec {
  const cells = baseTabCells("Dashboard", "All-In-One Dashboard", "Instantly access your wedding budget, guests, tasks, vendors, and payments", 18);

  const cards = [
    ["B7:D11", "DAYS LEFT", 'MAX(0,Setup!C6-TODAY())', "until wedding day", "sage"],
    ["E7:G11", "TOTAL BUDGET", "Setup!C8", "from setup", "blush"],
    ["H7:J11", "ACTUAL SPEND", "SUM('Wedding Budget'!G8:G80)", "live from budget", "champagne"],
    ["K7:M11", "RSVP RATE", 'IFERROR(COUNTIF(\'Guest List\'!F8:F206,"Attending")/COUNTA(\'Guest List\'!B8:B206),0)', "attending / invited", "sage"],
    ["N7:P11", "VENDOR BALANCE", "SUM('Vendor Tracker'!H8:H80)", "still due", "blush"],
  ] as const;
  for (const [range, label, formula, caption, tone] of cards) addKpiCard(cells, range, label, formula, caption, tone);

  addSection(cells, "B13", "BUDGET BY CATEGORY");
  addTableHeader(cells, 15, ["Category", "Budgeted", "Actual", "Variance", "Status"], "B");
  const budgetRows = [
    ["Venue", "Venue"], ["Catering", "Catering"], ["Photo/Video", "Photography"], ["Florals", "Florals"],
    ["Attire", "Attire"], ["Decor", "Decor"], ["Music", "Music"], ["Stationery", "Stationery"],
  ];
  budgetRows.forEach(([label, cat], i) => {
    const r = 16 + i;
    cells.push(
      c(`B${r}`, { value: label, ...bodyStyle() }),
      c(`C${r}`, { formula: `SUMIFS('Wedding Budget'!F8:F80,'Wedding Budget'!B8:B80,"${cat}")`, numberFormat: '"$"#,##0', ...moneyStyle() }),
      c(`D${r}`, { formula: `SUMIFS('Wedding Budget'!G8:G80,'Wedding Budget'!B8:B80,"${cat}")`, numberFormat: '"$"#,##0', ...moneyStyle() }),
      c(`E${r}`, { formula: `C${r}-D${r}`, numberFormat: '"$"#,##0', ...moneyStyle() }),
      c(`F${r}`, { formula: `IF(D${r}=0,"Not Started",IF(D${r}<=C${r},"On Track","Over Budget"))`, ...statusStyle() }),
    );
  });

  addSection(cells, "H13", "RSVP & MEALS");
  addTableHeader(cells, 15, ["Metric", "Count", "Share"], "H");
  [
    ["Invited", "COUNTA('Guest List'!B8:B206)"],
    ["Attending", 'COUNTIF(\'Guest List\'!F8:F206,"Attending")'],
    ["No Response", 'COUNTIF(\'Guest List\'!F8:F206,"No Response")'],
    ["Vegetarian/Vegan", 'COUNTIF(\'Guest List\'!H8:H206,"Vegetarian")+COUNTIF(\'Guest List\'!H8:H206,"Vegan")'],
  ].forEach(([label, formula], i) => {
    const r = 16 + i;
    cells.push(
      c(`H${r}`, { value: label, ...bodyStyle() }),
      c(`I${r}`, { formula, ...numberStyle() }),
      c(`J${r}`, { formula: `IFERROR(I${r}/$I$16,0)`, numberFormat: "0%", ...numberStyle() }),
    );
  });

  addSection(cells, "L13", "PLANNING STATUS");
  addTableHeader(cells, 15, ["Area", "Open", "Urgent", "Done"], "L");
  [
    ["Tasks", "'Wedding Checklist'!E8:E120"],
    ["Payments", "'Payment Schedule'!F8:F80"],
    ["Vendors", "'Vendor Tracker'!K8:K80"],
    ["Packing", "'Packing List'!E8:E80"],
  ].forEach(([label, range], i) => {
    const r = 16 + i;
    cells.push(
      c(`L${r}`, { value: label, ...bodyStyle() }),
      c(`M${r}`, { formula: `COUNTIF(${range},"<>Done")`, ...numberStyle() }),
      c(`N${r}`, { formula: `COUNTIF(${range},"Overdue")+COUNTIF(${range},"Due Soon")+COUNTIF(${range},"Urgent")`, ...numberStyle() }),
      c(`O${r}`, { formula: `COUNTIF(${range},"Done")+COUNTIF(${range},"Paid")`, ...numberStyle() }),
    );
  });

  return {
    name: "Dashboard",
    tabColor: THEME.ink,
    freeze: "B6",
    hideGridlines: true,
    columnWidths: widths(18, { 2: 16, 3: 13, 4: 13, 5: 13, 6: 13, 8: 16, 12: 16 }),
    rowHeights: { ...heroRows(), 7: 20, 8: 34, 9: 24, 13: 25, 15: 20 },
    cells,
    merges: [
      "B3:R3", "B4:R4",
      ...cards.flatMap(([range]) => cardMerges(range)),
      "B13:F13", "H13:J13", "L13:O13",
    ],
    charts: [
      chart("doughnut", "Budget by Category", "Dashboard!C15:D23", "Dashboard!B16:B23", 26, 2, ["5F755F", "E8C9C5"]),
      chart("bar", "Planning Status", "Dashboard!M15:O19", "Dashboard!L16:L19", 26, 8, ["5F755F", "B98D77", "E8C9C5"]),
      chart("column", "RSVP Share", "Dashboard!I15:J19", "Dashboard!H16:H19", 26, 13, ["5F755F", "E8C9C5"]),
    ],
    conditionalFormats: [
      dataBar("C16:D23", THEME.sage),
      { range: "F16:F23", rule: { kind: "formula", formula: '$F16="Over Budget"', fill: THEME.warning, fontColor: "8B2D20", bold: true } },
      { range: "N16:N19", rule: { kind: "cellIs", operator: "greaterThan", values: [0], fill: THEME.warning, fontColor: "8B2D20", bold: true } },
    ],
  };
}

function vendorTrackerTab(): TabSpec {
  return trackerTab({
    name: "Vendor Tracker",
    title: "Vendor Research & Payments",
    subtitle: "Compare vendors, track contracts, deposits, balances, and urgent follow-ups",
    headers: ["Vendor", "Category", "Contact", "Quote", "Deposit", "Deposit Date", "Balance Due", "Due Date", "Contract?", "Status", "Notes"],
    rows: [
      ["Willow Garden Venue", "Venue", "hello@willow.example", 8000, 2500, "2026-01-15", "=D8-E8", "2026-03-01", "Yes", "Deposit Paid", "Includes tables"],
      ["Golden Hour Photo", "Photography", "photo@example.com", 3200, 800, "2026-02-01", "=D9-E9", "2026-05-20", "Yes", "Deposit Paid", "Engagement session"],
      ["Bloom & Co", "Florals", "florals@example.com", 2200, 0, "", "=D10-E10", "2026-04-18", "No", "Due Soon", "Review bouquet quote"],
    ],
    startRow: 8,
    totalRows: 52,
    validations: [
      { range: "C8:C60", type: "list", options: { ref: "=VendorCategoryList" } },
      { range: "J8:J60", type: "list", options: ["Yes", "No"] },
      { range: "K8:K60", type: "list", options: { ref: "=PaymentStatusList" } },
    ],
    formulasByColumn: { H: "D{r}-E{r}" },
    cf: [
      { range: "H8:H60", rule: { kind: "cellIs", operator: "greaterThan", values: [0], fill: THEME.blushLight, fontColor: "8B2D20" } },
      { range: "K8:K60", rule: { kind: "formula", formula: '$K8="Due Soon"', fill: THEME.warning, fontColor: "8B2D20", bold: true } },
    ],
  });
}

function venueComparisonTab(): TabSpec {
  return trackerTab({
    name: "Venue Comparison",
    title: "Venue Comparison",
    subtitle: "Compare venue quotes, capacity, inclusions, restrictions, and decision scores",
    headers: ["Venue", "Location", "Capacity", "Quote", "Included", "Deposit", "Distance", "Score", "Status", "Notes"],
    rows: [
      ["Willow Garden", "Rabat", 150, 8000, "Tables + chairs", 2500, "18 min", 92, "Shortlist", "Best garden option"],
      ["Pearl Ballroom", "Casablanca", 220, 12000, "Catering", 4000, "35 min", 84, "Review", "Elegant indoor option"],
    ],
    startRow: 8,
    totalRows: 36,
    validations: [{ range: "J8:J44", type: "list", options: ["Shortlist", "Review", "Rejected", "Booked"] }],
    cf: [dataBar("I8:I44", THEME.sage)],
  });
}

function weddingBudgetTab(): TabSpec {
  return trackerTab({
    name: "Wedding Budget",
    title: "Wedding Budget Tracker",
    subtitle: "Budget vs actual spending, payment status, and automated category variance",
    headers: ["Category", "Item", "Vendor", "Priority", "Budgeted", "Actual", "Variance", "Paid?", "Date Paid", "Status", "Notes"],
    rows: [
      ["Venue", "Venue rental", "Willow Garden Venue", "High", 8000, 8000, "=E8-F8", "Deposit", "2026-01-15", '=IF(F8=0,"Not Started",IF(F8<=E8,"On Track","Over Budget"))', "Main venue"],
      ["Catering", "Dinner package", "Atlas Catering", "High", 7500, 6900, "=E9-F9", "No", "", '=IF(F9=0,"Not Started",IF(F9<=E9,"On Track","Over Budget"))', "Tasting pending"],
      ["Photography", "Photo package", "Golden Hour Photo", "High", 3200, 3200, "=E10-F10", "Deposit", "2026-02-01", '=IF(F10=0,"Not Started",IF(F10<=E10,"On Track","Over Budget"))', ""],
      ["Florals", "Ceremony florals", "Bloom & Co", "Medium", 2200, 0, "=E11-F11", "No", "", '=IF(F11=0,"Not Started",IF(F11<=E11,"On Track","Over Budget"))', ""],
    ],
    startRow: 8,
    totalRows: 72,
    validations: [
      { range: "B8:B80", type: "list", options: { ref: "=VendorCategoryList" } },
      { range: "E8:E80", type: "list", options: { ref: "=PriorityList" } },
      { range: "I8:I80", type: "list", options: ["No", "Deposit", "Paid"] },
    ],
    formulasByColumn: {
      H: "E{r}-F{r}",
      K: 'IF(F{r}=0,"Not Started",IF(F{r}<=E{r},"On Track","Over Budget"))',
    },
    cf: [
      dataBar("F8:G80", THEME.sage),
      { range: "K8:K80", rule: { kind: "formula", formula: '$K8="Over Budget"', fill: THEME.warning, fontColor: "8B2D20", bold: true } },
    ],
  });
}

function foodDrinksTab(): TabSpec {
  return trackerTab({
    name: "Food & Drinks",
    title: "Food & Drinks Planner",
    subtitle: "Plan catering, tastings, drink packages, dietary needs, and cost per guest",
    headers: ["Item", "Vendor", "Guests", "Cost/Guest", "Total Cost", "Tasting Date", "Status", "Dietary Notes", "Owner"],
    rows: [
      ["Dinner Package", "Atlas Catering", 120, 55, "=C8*D8", "2026-03-10", "Booked", "Vegetarian options", "Amina"],
      ["Mocktail Bar", "Pearl Drinks", 120, 12, "=C9*D9", "2026-04-02", "Review", "No alcohol", "Sami"],
    ],
    startRow: 8,
    totalRows: 36,
    validations: [{ range: "H8:H44", type: "list", options: ["Idea", "Review", "Booked", "Done"] }],
    formulasByColumn: { F: "D{r}*E{r}" },
    cf: [dataBar("F8:F44", THEME.blush)],
  });
}

function photosVideosTab(): TabSpec {
  return checklistTable("Photos & Videos", "Photos & Videos Shot List", "Track must-have shots, moments, locations, and assigned vendor", [
    "Getting ready details", "First look", "Family portraits", "Ceremony entrance", "Ring exchange", "Couple sunset portraits",
    "Reception entrance", "Cake cutting", "First dance", "Guest table candids",
  ], ["Moment", "Location", "Vendor", "Priority", "Status", "Notes"]);
}

function guestListTab(): TabSpec {
  return trackerTab({
    name: "Guest List",
    title: "Guest List & RSVP",
    subtitle: "Track RSVP status, party size, meals, seating, gifts, and thank-you notes",
    headers: ["Guest Name", "Group", "Email", "Phone", "RSVP Status", "Party Size", "Meal Choice", "Table #", "Gift", "Thanked?", "Notes"],
    rows: [
      ["Layla Ahmed", "Family", "layla@example.com", "555-0101", "Attending", 2, "Chicken", 1, "Vase", "No", ""],
      ["Omar Benali", "Friends", "omar@example.com", "555-0102", "No Response", 1, "Vegetarian", 2, "", "No", ""],
      ["Sara Idrissi", "Family", "sara@example.com", "555-0103", "Attending", 3, "Beef", 1, "Gift card", "Yes", ""],
    ],
    startRow: 8,
    totalRows: 199,
    validations: [
      { range: "F8:F206", type: "list", options: { ref: "=RSVPStatusList" } },
      { range: "H8:H206", type: "list", options: { ref: "=MealOptions" } },
      { range: "K8:K206", type: "list", options: ["Yes", "No"] },
    ],
    cf: [
      { range: "F8:F206", rule: { kind: "formula", formula: '$F8="No Response"', fill: THEME.warning, fontColor: "8B2D20", bold: true } },
      { range: "K8:K206", rule: { kind: "formula", formula: '$K8="No"', fill: THEME.blushLight, fontColor: "8B2D20" } },
    ],
  });
}

function seatingTab(name: string, title: string, subtitle: string, guestSheet: string): TabSpec {
  const cells = baseTabCells(name, title, subtitle, 12);
  addTableHeader(cells, 7, ["Table #", "Capacity", "Assigned", "Open Seats", "Meal Notes", "VIP Notes"], "B");
  for (let i = 0; i < 12; i++) {
    const r = 8 + i;
    cells.push(
      c(`B${r}`, { value: i + 1, ...numberStyle() }),
      c(`C${r}`, { value: 10, ...numberStyle() }),
      c(`D${r}`, { formula: `COUNTIFS('${guestSheet}'!H8:H206,B${r},'${guestSheet}'!F8:F206,"Attending")`, ...numberStyle() }),
      c(`E${r}`, { formula: `C${r}-D${r}`, ...numberStyle() }),
      c(`F${r}`, { formula: `COUNTIFS('${guestSheet}'!H8:H206,B${r},'${guestSheet}'!G8:G206,"Vegetarian")+COUNTIFS('${guestSheet}'!H8:H206,B${r},'${guestSheet}'!G8:G206,"Vegan")&" special meals"`, ...bodyStyle() }),
      c(`G${r}`, { value: i === 0 ? "Family table" : "", ...bodyStyle() }),
    );
  }
  return tab(name, cells, {
    freeze: "B7",
    widthsMap: { 2: 12, 3: 12, 4: 12, 5: 12, 6: 20, 7: 24 },
    merges: ["B3:L3", "B4:L4"],
    conditionalFormats: [
      dataBar("D8:D19", THEME.sage),
      { range: "E8:E19", rule: { kind: "cellIs", operator: "lessThan", values: [0], fill: THEME.warning, fontColor: "8B2D20", bold: true } },
    ],
  });
}

function registryTab(): TabSpec {
  return trackerTab({
    name: "Registry",
    title: "Registry Tracker",
    subtitle: "Track registry items, priority, status, gifted by, and thank-you notes",
    headers: ["Item", "Category", "Store", "Priority", "Price", "Status", "Gifted By", "Thanked?", "Notes"],
    rows: [
      ["Dinnerware set", "Home", "Crate & Barrel", "High", 180, "Needed", "", "No", ""],
      ["Towels", "Home", "Target", "Medium", 75, "Gifted", "Layla", "No", ""],
    ],
    startRow: 8,
    totalRows: 72,
    validations: [
      { range: "E8:E80", type: "list", options: { ref: "=PriorityList" } },
      { range: "G8:G80", type: "list", options: ["Needed", "Purchased", "Gifted", "Skipped"] },
      { range: "I8:I80", type: "list", options: ["Yes", "No"] },
    ],
    cf: [{ range: "G8:G80", rule: { kind: "formula", formula: '$G8="Needed"', fill: THEME.warning, fontColor: "8B2D20" } }],
  });
}

function weddingPartyTab(): TabSpec {
  return trackerTab({
    name: "Wedding Party",
    title: "Wedding Party",
    subtitle: "Contact details, responsibilities, attire, appointments, and notes for your wedding party",
    headers: ["Name", "Role", "Phone", "Email", "Attire Status", "Beauty Appt", "Gift Status", "Tasks", "Notes"],
    rows: [
      ["Nadia", "Maid of Honor", "555-0201", "nadia@example.com", "Ordered", "Booked", "Needed", "Speech", ""],
      ["Youssef", "Best Man", "555-0202", "youssef@example.com", "Fitting", "N/A", "Needed", "Rings", ""],
    ],
    startRow: 8,
    totalRows: 36,
    validations: [
      { range: "F8:F44", type: "list", options: ["Needed", "Fitting", "Ordered", "Done"] },
      { range: "H8:H44", type: "list", options: ["Needed", "Purchased", "Wrapped", "Given"] },
    ],
  });
}

function weddingPartyGiftsTab(): TabSpec {
  return checklistTable("Wedding Party Gifts", "Wedding Party Gifts", "Plan thoughtful gifts, budgets, order status, and delivery dates", [
    "Maid of Honor gift", "Best Man gift", "Bridesmaid boxes", "Groomsmen gifts", "Parent gifts", "Flower girl gift",
  ], ["Gift", "Recipient", "Budget", "Actual", "Ordered?", "Delivered?", "Notes"]);
}

function checklistTab(): TabSpec {
  return trackerTab({
    name: "Wedding Checklist",
    title: "Wedding Checklist",
    subtitle: "Pre-wedding to post-wedding checklist with automated urgency flags",
    headers: ["Task", "Phase", "Owner", "Due Date", "Priority", "Status", "Days Left", "Notes"],
    rows: [
      ["Book venue", "12 months", "Amina", "2026-01-15", "Urgent", "Done", "=D8-TODAY()", ""],
      ["Finalize guest list", "9 months", "Both", "2026-02-15", "High", "In Progress", "=D9-TODAY()", ""],
      ["Send invitations", "4 months", "Sami", "2026-03-20", "High", "Not Started", "=D10-TODAY()", ""],
    ],
    startRow: 8,
    totalRows: 112,
    validations: [
      { range: "F8:F120", type: "list", options: { ref: "=PriorityList" } },
      { range: "G8:G120", type: "list", options: { ref: "=TaskStatusList" } },
    ],
    formulasByColumn: { H: "D{r}-TODAY()" },
    cf: [
      { range: "H8:H120", rule: { kind: "cellIs", operator: "lessThan", values: [14], fill: THEME.warning, fontColor: "8B2D20", bold: true } },
      { range: "G8:G120", rule: { kind: "formula", formula: '$G8="Done"', fill: THEME.success, fontColor: THEME.sage } },
    ],
  });
}

function itineraryTab(): TabSpec {
  return trackerTab({
    name: "Wedding Itinerary",
    title: "Wedding Day Itinerary",
    subtitle: "Hour-by-hour wedding day timeline with owner, location, and status",
    headers: ["Time", "Event", "Location", "Owner", "Vendor", "Status", "Notes"],
    rows: [
      ["08:00", "Hair & makeup begins", "Suite", "Amina", "Glow Beauty", "Booked", ""],
      ["14:00", "Ceremony", "Garden", "Officiant", "Willow Garden", "Confirmed", ""],
      ["18:00", "Dinner service", "Reception", "Planner", "Atlas Catering", "Confirmed", ""],
    ],
    startRow: 8,
    totalRows: 52,
    validations: [{ range: "G8:G60", type: "list", options: ["Draft", "Booked", "Confirmed", "Done"] }],
  });
}

function packingListTab(): TabSpec {
  return checklistTable("Packing List", "Packing List", "Pack outfits, documents, emergency kit items, and day-of essentials", [
    "Marriage documents", "Rings", "Emergency sewing kit", "Perfume", "Comfortable shoes", "Phone chargers",
    "Vendor envelopes", "Touch-up makeup", "Snacks", "Prayer mat",
  ], ["Item", "Category", "Owner", "Packed?", "Location", "Notes"]);
}

function moodboardTab(): TabSpec {
  return checklistTable("Moodboard", "Moodboard", "Collect style direction, colors, links, inspiration, and final decisions", [
    "Color palette", "Ceremony inspiration", "Reception inspiration", "Floral references", "Attire direction", "Stationery mood",
  ], ["Inspiration", "Category", "Link/Source", "Decision", "Status", "Notes"]);
}

function decorTab(): TabSpec {
  return inventoryTab("Decor", "Decor Inventory", "Track decor items, quantities, source, cost, setup area, and return status");
}

function floralTab(): TabSpec {
  return inventoryTab("Floral", "Floral Planner", "Plan bouquets, centerpieces, ceremony florals, delivery, and costs");
}

function attireMakeupTab(): TabSpec {
  return trackerTab({
    name: "Attire & Makeup",
    title: "Attire & Makeup",
    subtitle: "Track outfits, fittings, beauty appointments, deposits, and final status",
    headers: ["Person", "Item/Service", "Vendor", "Appointment", "Budget", "Actual", "Status", "Notes"],
    rows: [
      ["Bride", "Dress fitting", "Atelier Noor", "2026-03-08", 1800, 1700, "Booked", ""],
      ["Groom", "Suit fitting", "Tailor House", "2026-03-20", 700, 650, "Booked", ""],
    ],
    startRow: 8,
    totalRows: 42,
    validations: [{ range: "H8:H50", type: "list", options: ["Needed", "Booked", "Done", "Cancelled"] }],
    cf: [dataBar("F8:G50", THEME.blush)],
  });
}

function accommodationTab(): TabSpec {
  return trackerTab({
    name: "Accommodation",
    title: "Accommodation Tracker",
    subtitle: "Hotel blocks, guest rooms, rates, check-in details, and confirmation status",
    headers: ["Hotel/Stay", "Guest/Group", "Rooms", "Rate", "Total", "Check-In", "Check-Out", "Confirmed?", "Notes"],
    rows: [["Riad Garden", "Family", 8, 120, "=C8*D8", "2026-06-19", "2026-06-21", "Yes", "Near venue"]],
    startRow: 8,
    totalRows: 32,
    validations: [{ range: "I8:I40", type: "list", options: ["Yes", "No", "Pending"] }],
    formulasByColumn: { F: "D{r}*E{r}" },
  });
}

function transportationTab(): TabSpec {
  return trackerTab({
    name: "Transportation",
    title: "Transportation Planner",
    subtitle: "Routes, vehicles, pickups, drivers, guests, timing, and costs",
    headers: ["Route", "Vehicle", "Pickup", "Dropoff", "Guests", "Time", "Cost", "Status", "Notes"],
    rows: [["Hotel to venue", "Shuttle", "Riad Garden", "Willow Garden", 30, "13:15", 450, "Booked", "Two trips"]],
    startRow: 8,
    totalRows: 36,
    validations: [{ range: "I8:I44", type: "list", options: ["Needed", "Quote", "Booked", "Done"] }],
  });
}

function stationeryTab(): TabSpec {
  return trackerTab({
    name: "Stationery Tracker",
    title: "Stationery Tracker",
    subtitle: "Invitations, save the dates, menus, signage, print quantity, and delivery status",
    headers: ["Item", "Quantity", "Vendor", "Design Due", "Print Due", "Budget", "Actual", "Status", "Notes"],
    rows: [["Invitations", 120, "Paper Studio", "2026-02-01", "2026-02-20", 400, 380, "In Progress", ""]],
    startRow: 8,
    totalRows: 36,
    validations: [{ range: "I8:I44", type: "list", options: ["Idea", "Designing", "Printed", "Sent", "Done"] }],
  });
}

function saveTheDateTab(): TabSpec {
  return checklistTable("Save The Date", "Save The Date Tracker", "Track recipient list, send status, address gaps, and follow-up notes", [
    "Design save the date", "Collect addresses", "Print cards", "Send digital version", "Mail cards", "Track returned mail",
  ], ["Task/Recipient", "Group", "Address", "Send Method", "Sent?", "Response", "Notes"]);
}

function activitiesTab(): TabSpec {
  return trackerTab({
    name: "Activities",
    title: "Wedding Activities",
    subtitle: "Plan welcome dinner, family activities, games, excursions, and guest experiences",
    headers: ["Activity", "Date", "Time", "Location", "Owner", "Budget", "Actual", "Status", "Notes"],
    rows: [["Welcome dinner", "2026-06-19", "19:00", "Riad Garden", "Sami", 1200, 950, "Booked", "Family only"]],
    startRow: 8,
    totalRows: 36,
    validations: [{ range: "I8:I44", type: "list", options: ["Idea", "Review", "Booked", "Done"] }],
  });
}

function musicTab(): TabSpec {
  return checklistTable("Music", "Music Planner", "Plan ceremony songs, first dance, must-play, do-not-play, and DJ notes", [
    "Ceremony entrance", "Quran recitation", "Reception entrance", "First dance", "Family songs", "Do-not-play list",
  ], ["Moment/List", "Song", "Artist", "Vendor", "Status", "Notes"]);
}

function smartCalendarTab(): TabSpec {
  const cells = baseTabCells("Smart Calendar", "Smart Calendar", "Payments, appointments, tasks, and wedding events in one automated planning calendar", 16);
  addTableHeader(cells, 7, ["Date", "Day", "Type", "Item", "Owner", "Status", "Source"], "B");
  const entries = [
    ["2026-01-15", '=TEXT(B8,"dddd")', "Payment", "Venue deposit", "Amina", "Done", "Vendor Tracker"],
    ["2026-02-15", '=TEXT(B9,"dddd")', "Task", "Finalize guest list", "Both", "In Progress", "Checklist"],
    ["2026-03-10", '=TEXT(B10,"dddd")', "Appointment", "Catering tasting", "Sami", "Booked", "Food & Drinks"],
    ["2026-06-20", '=TEXT(B11,"dddd")', "Wedding", "Wedding day", "Both", "Confirmed", "Itinerary"],
  ];
  entries.forEach((row, i) => {
    const r = 8 + i;
    row.forEach((value, j) => cells.push(c(`${col(2 + j)}${r}`, cellValue(value))));
  });
  addSection(cells, "B15", "MONTH VIEW");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  days.forEach((day, i) => cells.push(c(`${col(2 + i * 2)}17`, { value: day, ...headerStyle() })));
  for (let week = 0; week < 5; week++) {
    for (let day = 0; day < 7; day++) {
      const c1 = col(2 + day * 2);
      const r = 18 + week * 3;
      const dayNum = week * 7 + day + 1;
      cells.push(
        c(`${c1}${r}`, { value: dayNum <= 31 ? dayNum : "", ...labelStyle() }),
        c(`${c1}${r + 1}`, { formula: `IFERROR(INDEX($E$8:$E$40,MATCH(${c1}${r},DAY($B$8:$B$40),0)),"")`, ...bodyStyle() }),
      );
    }
  }
  return tab("Smart Calendar", cells, {
    freeze: "B7",
    widthsMap: Object.fromEntries(Array.from({ length: 15 }, (_, i) => [i + 2, i % 2 === 0 ? 10 : 3])),
    merges: ["B3:P3", "B4:P4", "B15:P15"],
    validations: [{ range: "D8:D40", type: "list", options: ["Payment", "Task", "Appointment", "Wedding", "Reminder"] }],
    conditionalFormats: [{ range: "G8:G40", rule: { kind: "formula", formula: '$G8<>"Done"', fill: THEME.warning, fontColor: "8B2D20" } }],
  });
}

function weddingDayBinderTab(): TabSpec {
  const cells = baseTabCells("Wedding Day Binder", "Wedding Day Binder", "Day-of command sheet for contacts, timeline, vendors, emergency notes, and final reminders", 14);
  addSection(cells, "B7", "EMERGENCY CONTACTS");
  addTableHeader(cells, 9, ["Role", "Name", "Phone", "Backup", "Notes"], "B");
  [
    ["Planner", "Day-of Coordinator", "555-0301", "Venue manager", ""],
    ["Venue", "Willow Garden", "555-0302", "Security desk", ""],
    ["Family", "Nadia", "555-0303", "Youssef", ""],
  ].forEach((row, i) => row.forEach((v, j) => cells.push(c(`${col(2 + j)}${10 + i}`, { value: v, ...bodyStyle() }))));
  addSection(cells, "H7", "DAY-OF TIMELINE");
  addTableHeader(cells, 9, ["Time", "Moment", "Owner", "Status"], "H");
  [
    ["08:00", "Beauty starts", "Glow Beauty", "Confirmed"],
    ["14:00", "Ceremony", "Officiant", "Confirmed"],
    ["18:00", "Dinner", "Atlas Catering", "Confirmed"],
  ].forEach((row, i) => row.forEach((v, j) => cells.push(c(`${col(8 + j)}${10 + i}`, { value: v, ...bodyStyle() }))));
  addSection(cells, "B16", "FINAL REMINDERS");
  for (let i = 0; i < 12; i++) {
    const r = 18 + i;
    cells.push(
      c(`B${r}`, { value: ["Rings packed", "Vendor balances ready", "Emergency kit packed", "Guest book ready"][i] || "", ...bodyStyle() }),
      c(`C${r}`, { value: i < 4 ? "No" : "", ...statusStyle() }),
      c(`D${r}`, { value: "", ...bodyStyle() }),
    );
  }
  return tab("Wedding Day Binder", cells, {
    freeze: "B7",
    widthsMap: { 2: 22, 3: 18, 4: 16, 5: 18, 6: 22, 8: 12, 9: 24, 10: 18, 11: 16 },
    merges: ["B3:N3", "B4:N4", "B7:F7", "H7:K7", "B16:N16"],
    validations: [{ range: "C18:C40", type: "list", options: ["Yes", "No", "N/A"] }],
    conditionalFormats: [{ range: "C18:C40", rule: { kind: "formula", formula: '$C18="No"', fill: THEME.warning, fontColor: "8B2D20", bold: true } }],
  });
}

function vendorRiskBoardTab(): TabSpec {
  return trackerTab({
    name: "Vendor Risk Board",
    title: "Vendor Risk Board",
    subtitle: "Flags unpaid balances, missing contracts, short deadlines, and follow-ups before they become wedding-week emergencies",
    headers: ["Vendor", "Category", "Contract?", "Deposit Paid", "Balance Due", "Due Date", "Days Left", "Risk", "Next Action", "Owner"],
    rows: [
      ["Willow Garden Venue", "Venue", "Yes", 2500, 5500, "2026-03-01", "=G8-TODAY()", "Watch", "Confirm final invoice", "Sami"],
      ["Bloom & Co", "Florals", "No", 0, 2200, "2026-04-18", "=G9-TODAY()", "High", "Get signed quote", "Amina"],
      ["Atlas Catering", "Catering", "Yes", 1500, 4200, "2026-05-10", "=G10-TODAY()", "Medium", "Confirm tasting menu", "Both"],
      ["Golden Hour Photo", "Photography", "Yes", 800, 2400, "2026-05-20", "=G11-TODAY()", "Low", "Send shot list", "Amina"],
    ],
    startRow: 8,
    totalRows: 56,
    validations: [
      { range: "D8:D64", type: "list", options: ["Yes", "No", "Pending"] },
      { range: "I8:I64", type: "list", options: ["Low", "Medium", "High", "Watch"] },
    ],
    cf: [
      { range: "I8:I64", rule: { kind: "formula", formula: '$I8="High"', fill: THEME.warning, fontColor: "8B2D20", bold: true } },
      { range: "H8:H64", rule: { kind: "cellIs", operator: "lessThan", values: [21], fill: THEME.warning, fontColor: "8B2D20", bold: true } },
      dataBar("F8:F64", THEME.blush),
    ],
  });
}

function rsvpCommandCenterTab(): TabSpec {
  const cells = baseTabCells("RSVP Command Center", "RSVP Command Center", "Guest counts, meal totals, missing replies, table capacity, and thank-you follow-up in one control room", 14);
  const cards = [
    ["B7:D11", "INVITED", 'COUNTA(\'Guest List\'!B8:B206)', "total guest records", "sage"],
    ["E7:G11", "ATTENDING", 'COUNTIF(\'Guest List\'!F8:F206,"Attending")', "confirmed yes", "blush"],
    ["H7:J11", "NO RESPONSE", 'COUNTIF(\'Guest List\'!F8:F206,"No Response")', "needs follow-up", "champagne"],
    ["K7:M11", "TABLES NEEDED", 'ROUNDUP(COUNTIF(\'Guest List\'!F8:F206,"Attending")/10,0)', "10 seats per table", "sage"],
  ] as const;
  for (const [range, label, formula, caption, tone] of cards) addKpiCard(cells, range, label, formula, caption, tone);

  addSection(cells, "B13", "RSVP GROUP BREAKDOWN");
  addTableHeader(cells, 15, ["Group", "Invited", "Attending", "Declined", "No Response", "Completion"], "B");
  [
    ["Family", "Family"],
    ["Friends", "Friends"],
    ["Work", "Work"],
    ["Plus Ones", "Plus Ones"],
    ["Other", "Other"],
  ].forEach(([label, group], i) => {
    const r = 16 + i;
    cells.push(
      c(`B${r}`, { value: label, ...bodyStyle() }),
      c(`C${r}`, { formula: `COUNTIF('Guest List'!C8:C206,"${group}")`, ...numberStyle() }),
      c(`D${r}`, { formula: `COUNTIFS('Guest List'!C8:C206,"${group}",'Guest List'!F8:F206,"Attending")`, ...numberStyle() }),
      c(`E${r}`, { formula: `COUNTIFS('Guest List'!C8:C206,"${group}",'Guest List'!F8:F206,"Declined")`, ...numberStyle() }),
      c(`F${r}`, { formula: `COUNTIFS('Guest List'!C8:C206,"${group}",'Guest List'!F8:F206,"No Response")`, ...numberStyle() }),
      c(`G${r}`, { formula: `IFERROR((D${r}+E${r})/C${r},0)`, numberFormat: "0%", ...numberStyle() }),
    );
  });

  addSection(cells, "I13", "MEAL & TABLE COMMAND");
  addTableHeader(cells, 15, ["Metric", "Count", "Action"], "I");
  [
    ["Vegetarian/Vegan", 'COUNTIF(\'Guest List\'!H8:H206,"Vegetarian")+COUNTIF(\'Guest List\'!H8:H206,"Vegan")', "Send catering count"],
    ["Kids Meals", 'COUNTIF(\'Guest List\'!H8:H206,"Kids")', "Confirm kid seats"],
    ["Unassigned Tables", 'COUNTIF(\'Guest List\'!I8:I206,"")', "Assign table number"],
    ["Thank You Pending", 'COUNTIF(\'Guest List\'!K8:K206,"No")', "Prepare cards"],
  ].forEach(([metric, formula, action], i) => {
    const r = 16 + i;
    cells.push(
      c(`I${r}`, { value: metric, ...bodyStyle() }),
      c(`J${r}`, { formula, ...numberStyle() }),
      c(`K${r}`, { value: action, ...bodyStyle() }),
    );
  });

  return tab("RSVP Command Center", cells, {
    freeze: "B7",
    widthsMap: { 2: 18, 3: 12, 4: 12, 5: 12, 6: 14, 7: 13, 9: 20, 10: 12, 11: 22 },
    merges: ["B3:N3", "B4:N4", ...cards.flatMap(([range]) => cardMerges(range)), "B13:G13", "I13:K13"],
    conditionalFormats: [
      dataBar("G16:G24", THEME.sage),
      { range: "F16:F24", rule: { kind: "cellIs", operator: "greaterThan", values: [0], fill: THEME.warning, fontColor: "8B2D20", bold: true } },
    ],
    charts: [
      chart("doughnut", "RSVP Status", "RSVP Command Center!D15:F20", "RSVP Command Center!B16:B20", 25, 2, [THEME.sage, THEME.blush, THEME.champagne]),
    ],
  });
}

function miniPlannerTab(name: string, title: string, subtitle: string, label: string): TabSpec {
  return trackerTab({
    name,
    title,
    subtitle,
    headers: ["Item", "Category", "Owner", "Due Date", "Budget", "Actual", "Status", "Notes"],
    rows: [
      [`${label} guest list`, "Guests", "Amina", "2026-02-01", 0, 0, "In Progress", ""],
      [`${label} budget`, "Budget", "Sami", "2026-02-08", 500, 0, "Not Started", ""],
    ],
    startRow: 8,
    totalRows: 36,
    validations: [{ range: "H8:H44", type: "list", options: { ref: "=TaskStatusList" } }],
    formulasByColumn: {},
    cf: [{ range: "H8:H44", rule: { kind: "formula", formula: '$H8="Overdue"', fill: THEME.warning, fontColor: "8B2D20" } }],
  });
}

function honeymoonPlannerTab(): TabSpec {
  return trackerTab({
    name: "Honeymoon Planner",
    title: "Honeymoon Planner",
    subtitle: "Honeymoon itinerary, bookings, packing, costs, and confirmation status",
    headers: ["Date", "Activity/Booking", "Location", "Vendor", "Budget", "Actual", "Confirmed?", "Notes"],
    rows: [["2026-06-22", "Flight", "Marrakech", "Airline", 900, 850, "Yes", ""], ["2026-06-23", "Hotel", "Resort", "Hotel", 1200, 1100, "Yes", ""]],
    startRow: 8,
    totalRows: 36,
    validations: [{ range: "H8:H44", type: "list", options: ["Yes", "No", "Pending"] }],
    cf: [dataBar("F8:G44", THEME.sage)],
  });
}

function giftThanksTab(): TabSpec {
  return trackerTab({
    name: "Gift & Thanks",
    title: "Gift & Thanks Tracker",
    subtitle: "Track gifts, giver names, thank-you notes, and completion status",
    headers: ["Giver", "Gift", "Received Date", "Value", "Thanked?", "Thank You Date", "Method", "Notes"],
    rows: [["Layla Ahmed", "Vase", "2026-06-21", 80, "No", "", "Card", ""], ["Sara Idrissi", "Gift Card", "2026-06-21", 100, "Yes", "2026-06-28", "Message", ""]],
    startRow: 8,
    totalRows: 72,
    validations: [{ range: "F8:F80", type: "list", options: ["Yes", "No"] }],
    cf: [{ range: "F8:F80", rule: { kind: "formula", formula: '$F8="No"', fill: THEME.warning, fontColor: "8B2D20", bold: true } }],
  });
}

interface TrackerConfig {
  name: string;
  title: string;
  subtitle: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  startRow: number;
  totalRows: number;
  validations?: DataValidationSpec[];
  formulasByColumn?: Record<string, string>;
  cf?: ConditionalFormatSpec[];
}

function trackerTab(config: TrackerConfig): TabSpec {
  const cells = baseTabCells(config.name, config.title, config.subtitle, Math.max(config.headers.length + 3, 10));
  addTableHeader(cells, 7, config.headers, "B");
  const startCol = 2;

  for (let i = 0; i < config.totalRows; i++) {
    const r = config.startRow + i;
    const sample = config.rows[i] || [];
    config.headers.forEach((_, j) => {
      const letter = col(startCol + j);
      const formulaTemplate = config.formulasByColumn?.[letter];
      const sampleValue = sample[j];
      if (formulaTemplate) {
        cells.push(c(`${letter}${r}`, { formula: formulaTemplate.replaceAll("{r}", String(r)), ...bodyStyleForValue(sampleValue) }));
      } else if (sampleValue !== undefined && sampleValue !== "") {
        cells.push(c(`${letter}${r}`, cellValue(sampleValue)));
      } else if (i < 14) {
        cells.push(c(`${letter}${r}`, { value: "", ...bodyStyle() }));
      }
    });
  }

  return tab(config.name, cells, {
    freeze: "B7",
    widthsMap: Object.fromEntries(config.headers.map((h, i) => [i + 2, Math.min(24, Math.max(12, h.length + 4))])),
    merges: [`B3:${col(startCol + config.headers.length + 1)}3`, `B4:${col(startCol + config.headers.length + 1)}4`],
    validations: config.validations,
    conditionalFormats: config.cf,
  });
}

function checklistTable(name: string, title: string, subtitle: string, items: string[], headers: string[]): TabSpec {
  const rows = items.map((item, i) => {
    const row = Array(headers.length).fill("");
    row[0] = item;
    if (headers.length > 1) row[1] = ["Planning", "Vendor", "Guest", "Design"][i % 4];
    if (headers.length > 3) row[3] = i % 3 === 0 ? "High" : "Medium";
    if (headers.length > 4) row[4] = i % 4 === 0 ? "Done" : "Not Started";
    return row as Array<string | number>;
  });
  return trackerTab({
    name,
    title,
    subtitle,
    headers,
    rows,
    startRow: 8,
    totalRows: Math.max(36, items.length + 8),
    validations: [{ range: `${col(headers.length + 1)}8:${col(headers.length + 1)}60`, type: "list", options: ["Not Started", "In Progress", "Booked", "Done", "N/A"] }],
    cf: [{ range: `${col(headers.length + 1)}8:${col(headers.length + 1)}60`, rule: { kind: "formula", formula: `$${col(headers.length + 1)}8="Done"`, fill: THEME.success, fontColor: THEME.sage } }],
  });
}

function inventoryTab(name: string, title: string, subtitle: string): TabSpec {
  return trackerTab({
    name,
    title,
    subtitle,
    headers: ["Item", "Area", "Vendor/Source", "Qty", "Unit Cost", "Total", "Status", "Setup Owner", "Notes"],
    rows: [["Centerpieces", "Reception", "Bloom & Co", 12, 75, "=D8*E8", "Booked", "Planner", ""], ["Ceremony arch", "Ceremony", "Decor House", 1, 450, "=D9*E9", "Review", "Sami", ""]],
    startRow: 8,
    totalRows: 42,
    validations: [{ range: "H8:H50", type: "list", options: ["Idea", "Review", "Booked", "Delivered", "Returned"] }],
    formulasByColumn: { G: "D{r}*E{r}" },
    cf: [dataBar("G8:G50", THEME.blush)],
  });
}

function baseTabCells(sheetName: string, title: string, subtitle: string, widthCols: number): CellSpec[] {
  const end = col(Math.max(8, widthCols));
  return [
    c("B3", { value: title, font: { name: "Georgia", size: 30, bold: true, color: THEME.ink }, fill: { color: THEME.cream }, alignment: { horizontal: "left", vertical: "middle", indent: 1 } }),
    c("B4", { value: subtitle, font: { name: "Arial", size: 11, italic: true, color: THEME.muted }, fill: { color: THEME.cream }, alignment: { horizontal: "left", vertical: "middle", indent: 1 } }),
    c(`B5`, { value: "AUTOMATED SPREADSHEET SYSTEM · EXCEL + GOOGLE SHEETS", font: { name: "Arial", size: 8, bold: true, color: THEME.white }, fill: { color: THEME.ink }, alignment: { horizontal: "center", vertical: "middle" } }),
    c(`${end}5`, { value: sheetName.toUpperCase(), font: { name: "Arial", size: 8, bold: true, color: THEME.white }, fill: { color: THEME.ink }, alignment: { horizontal: "center", vertical: "middle" } }),
  ];
}

function addSetupChecklist(cells: CellSpec[]): void {
  addSection(cells, "B14", "5-MINUTE SETUP");
  [
    "Enter event date, names, currency, and total budget.",
    "Customize vendor categories, RSVP statuses, meals, and priorities.",
    "Add guests to Guest List and assign tables as RSVPs arrive.",
    "Log vendors, payments, and budget items once; dashboards update automatically.",
    "Use the Wedding Day Binder for final contacts, timeline, and reminders.",
  ].forEach((text, i) => {
    const r = 16 + i;
    cells.push(
      c(`B${r}`, { value: i + 1, font: { name: "Arial", size: 11, bold: true, color: THEME.white }, fill: { color: THEME.sage }, alignment: { horizontal: "center", vertical: "middle" } }),
      c(`C${r}`, { value: text, font: { name: "Arial", size: 10, color: THEME.charcoal }, fill: { color: THEME.ivory }, alignment: { horizontal: "left", vertical: "middle", wrapText: true }, border: softBorder() }),
    );
  });
  addSection(cells, "B26", "PRODUCT PROMISE");
  [
    ["Tabs included", WEDDING_TABS.length],
    ["Core dashboards", 4],
    ["Dropdown systems", "RSVP · vendors · meals · payments · tasks"],
    ["Automation", "Budget, seating, RSVP, payments, checklist, calendar"],
  ].forEach(([label, value], i) => {
    const r = 28 + i;
    cells.push(c(`B${r}`, { value: label, ...labelStyle() }), c(`C${r}`, { value, ...bodyStyle() }));
  });
}

function addList(cells: CellSpec[], startCol: string, title: string, values: string[]): void {
  cells.push(c(`${startCol}5`, { value: title, ...headerStyle() }));
  values.forEach((value, index) => {
    cells.push(c(`${startCol}${6 + index}`, { value, ...bodyStyle() }));
  });
}

function addSection(cells: CellSpec[], ref: string, title: string): void {
  cells.push(c(ref, { value: title, font: { name: "Georgia", size: 13, bold: true, color: THEME.white }, fill: { color: THEME.sage }, alignment: { horizontal: "left", vertical: "middle", indent: 1 } }));
}

function addTableHeader(cells: CellSpec[], row: number, headers: string[], startCol: string): void {
  const start = colIndex(startCol);
  headers.forEach((header, i) => {
    cells.push(c(`${col(start + i)}${row}`, { value: header, ...headerStyle() }));
  });
}

function addKpiCard(cells: CellSpec[], range: string, label: string, formula: string, caption: string, tone: "sage" | "blush" | "champagne"): void {
  const [tl, br] = range.split(":");
  const { col: left, row: top } = parseA1(tl);
  const { col: right, row: bottom } = parseA1(br);
  const fill = tone === "sage" ? THEME.sage : tone === "blush" ? THEME.blush : THEME.champagne;
  const text = tone === "sage" ? THEME.white : THEME.ink;
  cells.push(
    c(`${col(left)}${top}`, { value: label, font: { name: "Arial", size: 8, bold: true, color: text }, fill: { color: fill }, alignment: { horizontal: "center", vertical: "middle" } }),
    c(`${col(left)}${top + 1}`, { formula, numberFormat: label.includes("RATE") ? "0%" : label.includes("DAYS") ? "0" : '"$"#,##0', font: { name: "Georgia", size: 22, bold: true, color: text }, fill: { color: fill }, alignment: { horizontal: "center", vertical: "middle" } }),
    c(`${col(left)}${bottom}`, { value: caption, font: { name: "Arial", size: 8, italic: true, color: text }, fill: { color: fill }, alignment: { horizontal: "center", vertical: "middle" } }),
  );
  for (let r = top; r <= bottom; r++) {
    for (let cc = left; cc <= right; cc++) {
      if ((r === top || r === top + 1 || r === bottom) && cc === left) continue;
      cells.push(c(`${col(cc)}${r}`, { value: "", fill: { color: fill }, border: softBorder() }));
    }
  }
}

function cardMerges(range: string): string[] {
  const [tl, br] = range.split(":");
  const { col: left, row: top } = parseA1(tl);
  const { col: right, row: bottom } = parseA1(br);
  return [
    `${col(left)}${top}:${col(right)}${top}`,
    `${col(left)}${top + 1}:${col(right)}${bottom - 1}`,
    `${col(left)}${bottom}:${col(right)}${bottom}`,
  ];
}

function tab(
  name: string,
  cells: CellSpec[],
  opts: {
    freeze?: string;
    widthsMap?: Record<number, number>;
    merges?: string[];
    validations?: DataValidationSpec[];
    conditionalFormats?: ConditionalFormatSpec[];
    charts?: ChartSpec[];
  } = {},
): TabSpec {
  return {
    name: safeSheetName(name),
    tabColor: name === "Dashboard" ? THEME.ink : THEME.sage,
    freeze: opts.freeze ?? "B7",
    hideGridlines: true,
    columnWidths: widths(18, opts.widthsMap),
    rowHeights: heroRows(),
    cells,
    merges: opts.merges,
    dataValidations: opts.validations,
    conditionalFormats: opts.conditionalFormats,
    charts: opts.charts,
  };
}

function chart(type: ChartSpec["type"], title: string, dataRange: string, categoryRange: string, row: number, colNum: number, colors: string[]): ChartSpec {
  return {
    type,
    title,
    dataRange,
    categoryRange,
    anchor: { row, col: colNum },
    size: { width: 440, height: 270 },
    seriesColors: colors,
    legend: type === "doughnut" ? "r" : "b",
    data: {
      categories: ["A", "B", "C"],
      series: [{ name: title, values: [10, 20, 30] }],
    },
  };
}

function c(ref: string, input: CellInput): CellSpec {
  return { ref, ...input };
}

function cellValue(value: string | number): CellInput {
  if (typeof value === "string" && value.startsWith("=")) {
    return { formula: value.slice(1), ...bodyStyleForValue(value) };
  }
  return { value, ...bodyStyleForValue(value) };
}

function bodyStyleForValue(value: unknown): CellInput {
  if (typeof value === "number") return numberStyle();
  if (typeof value === "string" && /\d{4}-\d{2}-\d{2}/.test(value)) {
    return { ...bodyStyle(), numberFormat: "m/d/yyyy" };
  }
  return bodyStyle();
}

function labelStyle(): CellInput {
  return {
    font: { name: "Arial", size: 9, bold: true, color: THEME.white },
    fill: { color: THEME.sage },
    alignment: { horizontal: "left", vertical: "middle", indent: 1 },
    border: softBorder(),
  };
}

function inputStyle(): CellInput {
  return {
    font: { name: "Arial", size: 10, color: THEME.ink },
    fill: { color: THEME.white },
    alignment: { horizontal: "left", vertical: "middle" },
    border: { style: "medium", color: THEME.clay },
  };
}

function headerStyle(): CellInput {
  return {
    font: { name: "Arial", size: 9, bold: true, color: THEME.white },
    fill: { color: THEME.sage },
    alignment: { horizontal: "center", vertical: "middle", wrapText: true },
    border: softBorder(),
  };
}

function bodyStyle(): CellInput {
  return {
    font: { name: "Arial", size: 9, color: THEME.charcoal },
    fill: { color: THEME.ivory },
    alignment: { horizontal: "left", vertical: "middle", wrapText: true },
    border: softBorder(),
  };
}

function moneyStyle(): CellInput {
  return {
    ...bodyStyle(),
    numberFormat: '"$"#,##0',
    alignment: { horizontal: "right", vertical: "middle" },
  };
}

function numberStyle(): CellInput {
  return {
    ...bodyStyle(),
    numberFormat: "#,##0",
    alignment: { horizontal: "right", vertical: "middle" },
  };
}

function statusStyle(): CellInput {
  return {
    ...bodyStyle(),
    alignment: { horizontal: "center", vertical: "middle", wrapText: true },
  };
}

function softBorder() {
  return { style: "thin" as const, color: THEME.line };
}

function dataBar(range: string, color: string): ConditionalFormatSpec {
  return { range, rule: { kind: "dataBar", color } };
}

function widths(max: number, overrides: Record<number, number> = {}): number[] {
  return Array.from({ length: max }, (_, i) => {
    const n = i + 1;
    if (n === 1) return 3;
    return overrides[n] ?? 13;
  });
}

function heroRows(): Record<number, number> {
  return { 2: 8, 3: 45, 4: 23, 5: 18, 6: 8, 7: 20 };
}

function orderTabsFromCompetitor(tabs: TabSpec[], competitorTabs: string[]): TabSpec[] {
  if (competitorTabs.length === 0) return tabs;
  const used = new Set<string>();
  const ordered: TabSpec[] = [];
  for (const wanted of competitorTabs) {
    const match = tabs.find((tab) => !used.has(tab.name) && similarTab(tab.name, wanted));
    if (match) {
      ordered.push(match);
      used.add(match.name);
    }
  }
  for (const tab of tabs) {
    if (!used.has(tab.name)) ordered.push(tab);
  }
  return ordered;
}

function similarTab(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na.includes(nb) || nb.includes(na)) return true;
  const aliases: Record<string, string[]> = {
    vendor: ["vendor tracker", "vendor selection"],
    venue: ["venue comparison"],
    budget: ["wedding budget"],
    checklist: ["wedding checklist"],
    itinerary: ["wedding itinerary"],
    accommodation: ["accomodation"],
    floral: ["flower arrangement"],
    "gift thanks": ["gift and thanks", "gift thanks"],
    "bachelorette planner": ["bachelor ette planner", "bachelor(ette) planner"],
  };
  return Object.entries(aliases).some(([key, values]) =>
    (na.includes(key) && values.some((v) => nb.includes(normalize(v)))) ||
    (nb.includes(key) && values.some((v) => na.includes(normalize(v))))
  );
}

function safeSheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, "").slice(0, 31);
}

function titleCase(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}

function col(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function colIndex(letter: string): number {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
  return n;
}

function parseA1(a1: string): { col: number; row: number } {
  const m = a1.match(/^([A-Z]+)(\d+)$/i);
  if (!m) throw new Error(`Bad A1: ${a1}`);
  return { col: colIndex(m[1]), row: Number(m[2]) };
}
