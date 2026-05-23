import type {
  CellBorder,
  CellSpec,
  ChartSpec,
  ConditionalFormatSpec,
  SpreadsheetSpec,
  TabSpec,
} from "./factory-spreadsheet-spec";
import type {
  SpreadsheetFamilyInput,
  SpreadsheetFamilyProfile,
  SpreadsheetProductFamily,
} from "./factory-spreadsheet-families";

type Palette = {
  paper: string;
  surface: string;
  section: string;
  sectionSoft: string;
  accent: string;
  accentSoft: string;
  accent2: string;
  accent2Soft: string;
  accent3: string;
  ink: string;
  muted: string;
  line: string;
  warning: string;
  success: string;
};

export interface WorkbookDesignArchetype {
  id: string;
  productTitle: string;
  dashboardTitle: string;
  dashboardSubtitle: string;
  systemBadge: string;
  heroFont: string;
  bodyFont: string;
  titleSize: number;
  palette: Palette;
  dashboardSections: {
    primary: string;
    secondary: string;
    automation: string;
    reports: string;
    ideas: string;
  };
}

const LEGACY_COLOR_MAP: Record<string, keyof Palette | "white"> = {
  "F7F2E8": "paper",
  "FBF8F1": "surface",
  "D7CCBA": "line",
  "E8D8C5": "accent3",
  "5F755F": "accent",
  "DCE6D8": "accentSoft",
  "E8C9C5": "accent2",
  "F5E4E1": "accent2Soft",
  "B98D77": "section",
  "111111": "ink",
  "2B2926": "ink",
  "7A6F63": "muted",
  C8BDAE: "line",
  F4D7C8: "warning",
  DCEAD8: "success",
};

const BASE_DESIGNS: Record<SpreadsheetProductFamily, WorkbookDesignArchetype[]> = {
  personal_finance: [
    {
      id: "finance-latte-ledger",
      productTitle: "The Luxe Budget Ledger",
      dashboardTitle: "Money Command Center",
      dashboardSubtitle: "Monthly cash flow, bills, savings, debt, and forecast signals in one calm finance view",
      systemBadge: "BUDGET SYSTEM - EXCEL + GOOGLE SHEETS - AUTO SYNC",
      heroFont: "Libre Baskerville",
      bodyFont: "Aptos",
      titleSize: 28,
      palette: makePalette("F6F0E7", "FCFAF6", "6F7D64", "E1E8D8", "354534", "DEE8D9", "D7B29D", "F1DFD6", "C7A572", "111111", "73685F", "C9BCA9", "F1D2C4", "DDEBD8"),
      dashboardSections: {
        primary: "SPENDING PERFORMANCE",
        secondary: "MONTHLY CASH FLOW",
        automation: "AUTOMATION MAP",
        reports: "MONEY SCORECARD",
        ideas: "SMART MONEY UPGRADES",
      },
    },
  ],
  business_finance: [
    {
      id: "business-profit-board",
      productTitle: "Profit Studio Workbook",
      dashboardTitle: "Founder Finance Board",
      dashboardSubtitle: "Revenue, expenses, profit, taxes, invoices, and pricing decisions for small business owners",
      systemBadge: "PROFIT WORKBOOK - CLEAN BOOKKEEPING - EXCEL + SHEETS",
      heroFont: "Aptos Display",
      bodyFont: "Aptos",
      titleSize: 27,
      palette: makePalette("F7F5EF", "FFFFFF", "29443A", "DDE9E1", "1F3A32", "DCE8E1", "D9AA66", "F3E2C6", "A7BBC7", "111111", "59635C", "C8D1C8", "F2D4BF", "DDEAD9"),
      dashboardSections: {
        primary: "PROFIT PERFORMANCE",
        secondary: "MONTHLY P&L SNAPSHOT",
        automation: "BOOKKEEPING CHECKS",
        reports: "BUSINESS SCORECARD",
        ideas: "MARGIN UPGRADES",
      },
    },
  ],
  etsy_inventory: [
    {
      id: "maker-stockroom",
      productTitle: "Maker Stockroom Command Center",
      dashboardTitle: "Inventory Ops Dashboard",
      dashboardSubtitle: "Materials, products, reorder risk, COGS, fees, and profit signals for Etsy sellers",
      systemBadge: "SELLER OPS - SKU TRACKING - COGS + INVENTORY",
      heroFont: "Aptos Display",
      bodyFont: "Aptos",
      titleSize: 26,
      palette: makePalette("F4F7F7", "FFFFFF", "314F5A", "DCE8EB", "2F5D68", "DCECE6", "DCA85D", "F4E2C8", "B86F52", "102027", "607179", "B7C8CC", "F5D1BE", "D8E9E0"),
      dashboardSections: {
        primary: "SKU PERFORMANCE",
        secondary: "STOCKROOM SNAPSHOT",
        automation: "REORDER + COGS CHECKS",
        reports: "SELLER OPS SCORECARD",
        ideas: "PROFIT LEVERS",
      },
    },
    {
      id: "craft-ledger",
      productTitle: "Craft Seller Inventory Studio",
      dashboardTitle: "Shop Stock Dashboard",
      dashboardSubtitle: "A practical operations view for stock value, handmade costs, orders, vendors, and low inventory",
      systemBadge: "HANDMADE SELLER KIT - INVENTORY - PROFIT - REORDER",
      heroFont: "Aptos Display",
      bodyFont: "Aptos",
      titleSize: 26,
      palette: makePalette("F8F4ED", "FFFDF8", "465A45", "E1E7DC", "566B4F", "DFE9DA", "C8895B", "F1D8C5", "7EA7AA", "171717", "6E665D", "CBBFAF", "F2D0BF", "DEEADB"),
      dashboardSections: {
        primary: "PRODUCT MARGIN BOARD",
        secondary: "MATERIAL FLOW",
        automation: "LOW-STOCK CHECKS",
        reports: "SHOP HEALTH SCORECARD",
        ideas: "SELLER GROWTH IDEAS",
      },
    },
  ],
  wedding_event: [
    {
      id: "bridal-editorial",
      productTitle: "The Bespoke Bridal Blueprint",
      dashboardTitle: "Wedding Planning Atelier",
      dashboardSubtitle: "A luxury command view for budget, vendors, guests, seating, timeline, and day-of readiness",
      systemBadge: "WEDDING PLANNER - 35 TABS - GUESTS + VENDORS + BUDGET",
      heroFont: "Cormorant Garamond",
      bodyFont: "Montserrat",
      titleSize: 32,
      palette: makePalette("FBF7F1", "FFFDF9", "816F5E", "EEE7DC", "5C705C", "E3EADF", "D9B8B4", "F5E6E3", "C8A56A", "0F0F0F", "7B7068", "D8CEC0", "F3D3C8", "DCEADB"),
      dashboardSections: {
        primary: "BUDGET BY CATEGORY",
        secondary: "GUEST + RSVP SALON",
        automation: "PLANNING READINESS",
        reports: "WEDDING SCORECARD",
        ideas: "BRIDAL SUITE UPGRADES",
      },
    },
    {
      id: "wedding-modern-romance",
      productTitle: "The Wedding Day Control Book",
      dashboardTitle: "I Do Dashboard",
      dashboardSubtitle: "An elegant overview of the money, people, tasks, vendors, and events behind the celebration",
      systemBadge: "WEDDING DAY BINDER - SMART CALENDAR - RSVP COMMAND",
      heroFont: "Playfair Display",
      bodyFont: "Nunito Sans",
      titleSize: 32,
      palette: makePalette("FFF8F6", "FFFFFF", "7A5957", "F2E2E0", "7B6B4D", "EAE5D6", "DDA7AA", "F6E3E5", "A8B9A5", "111111", "786866", "D7C7C3", "F4D2CD", "DDEADC"),
      dashboardSections: {
        primary: "SPEND + VENDOR MAP",
        secondary: "RSVP COMMAND",
        automation: "DAY-OF READINESS",
        reports: "PLANNING SCORECARD",
        ideas: "WEDDING SUITE IDEAS",
      },
    },
  ],
  real_estate: [
    {
      id: "property-roi-board",
      productTitle: "Property ROI Command Book",
      dashboardTitle: "Portfolio Control Panel",
      dashboardSubtitle: "Rent, expenses, cash flow, repairs, lease risk, and ROI in a compact investor dashboard",
      systemBadge: "REAL ESTATE TRACKER - RENT LEDGER - ROI CALCULATOR",
      heroFont: "Aptos Display",
      bodyFont: "Aptos",
      titleSize: 27,
      palette: makePalette("F6F7F4", "FFFFFF", "203D5A", "DEE8F1", "1F4E5F", "DBE9EE", "7C9F75", "E1EADA", "C6A15B", "101820", "5E6872", "C5CFD7", "F0CFC4", "DDEBDA"),
      dashboardSections: {
        primary: "PROPERTY PERFORMANCE",
        secondary: "MONTHLY CASH FLOW",
        automation: "LEASE + REPAIR CHECKS",
        reports: "INVESTOR SCORECARD",
        ideas: "ROI UPGRADES",
      },
    },
  ],
  meal_fitness: [
    {
      id: "fresh-routine",
      productTitle: "Fresh Week Planning System",
      dashboardTitle: "Weekly Wellness Dashboard",
      dashboardSubtitle: "Meals, groceries, workouts, habits, and weekly progress with bright routine planning",
      systemBadge: "MEAL + WELLNESS PLANNER - WEEKLY ROUTINE SYSTEM",
      heroFont: "Nunito",
      bodyFont: "Nunito Sans",
      titleSize: 28,
      palette: makePalette("FBFAEF", "FFFFFF", "4F7A5C", "DFECDC", "659A6B", "E6F1DE", "F0B35B", "F8E7C7", "E98775", "172016", "697265", "C8D7C4", "F5D4C3", "DCEED6"),
      dashboardSections: {
        primary: "WEEKLY ROUTINE",
        secondary: "SHOPPING SNAPSHOT",
        automation: "HABIT CHECKS",
        reports: "WELLNESS SCORECARD",
        ideas: "ROUTINE UPGRADES",
      },
    },
  ],
  habit_wellness: [
    {
      id: "calm-habit",
      productTitle: "Calm Progress Habit Studio",
      dashboardTitle: "Progress Ritual Dashboard",
      dashboardSubtitle: "Habits, goals, routines, reflections, and visible streak momentum in one gentle planner",
      systemBadge: "HABIT TRACKER - GOALS - ROUTINE DASHBOARD",
      heroFont: "Nunito",
      bodyFont: "Nunito Sans",
      titleSize: 28,
      palette: makePalette("F8F5F1", "FFFFFF", "59677A", "E2E8F1", "6E7890", "E6EAF2", "B8A1D9", "ECE3F5", "D5B79E", "171717", "69707A", "CBD1DA", "F1D3C8", "DCE8DC"),
      dashboardSections: {
        primary: "HABIT MOMENTUM",
        secondary: "WEEKLY REFLECTION",
        automation: "ROUTINE CHECKS",
        reports: "PROGRESS SCORECARD",
        ideas: "GROWTH UPGRADES",
      },
    },
  ],
  project_client: [
    {
      id: "client-command",
      productTitle: "Client Workroom Command Center",
      dashboardTitle: "Project Delivery Board",
      dashboardSubtitle: "Clients, milestones, tasks, invoices, handoffs, and delivery risk for service teams",
      systemBadge: "CLIENT PROJECT SYSTEM - CRM - TASKS - INVOICES",
      heroFont: "Aptos Display",
      bodyFont: "Aptos",
      titleSize: 27,
      palette: makePalette("F6F8FA", "FFFFFF", "26384A", "DFE9F3", "365E75", "DCEAF2", "74A8C2", "E4F0F5", "D7B36E", "111827", "5F6B75", "C8D4DE", "F1D1C0", "DCE9DD"),
      dashboardSections: {
        primary: "DELIVERY PERFORMANCE",
        secondary: "CLIENT SNAPSHOT",
        automation: "PROJECT RISK CHECKS",
        reports: "DELIVERY SCORECARD",
        ideas: "WORKFLOW UPGRADES",
      },
    },
  ],
  content_creator: [
    {
      id: "creator-pulse",
      productTitle: "Creator Content Pulse Planner",
      dashboardTitle: "Content Studio Dashboard",
      dashboardSubtitle: "Ideas, publishing schedule, campaigns, channels, performance, and creative backlog",
      systemBadge: "CONTENT PLANNER - CALENDAR - CAMPAIGN TRACKER",
      heroFont: "Fraunces",
      bodyFont: "Inter",
      titleSize: 30,
      palette: makePalette("FFF7FA", "FFFFFF", "52336B", "EEE2F5", "663399", "EFE2FA", "EF8FB0", "FBE0EA", "F4C95D", "171021", "6E6078", "D3C4DA", "F3CFD6", "DDEADB"),
      dashboardSections: {
        primary: "CONTENT PERFORMANCE",
        secondary: "PUBLISHING SNAPSHOT",
        automation: "CAMPAIGN CHECKS",
        reports: "CREATOR SCORECARD",
        ideas: "CONTENT UPGRADES",
      },
    },
  ],
  education: [
    {
      id: "classroom-clarity",
      productTitle: "Classroom Clarity Gradebook",
      dashboardTitle: "Class Progress Board",
      dashboardSubtitle: "Grades, attendance, assignments, lesson plans, missing work, and conference notes for teachers",
      systemBadge: "TEACHER GRADEBOOK - LESSONS - ATTENDANCE - REPORTS",
      heroFont: "Nunito",
      bodyFont: "Nunito Sans",
      titleSize: 29,
      palette: makePalette("F8FBFF", "FFFFFF", "2E5E83", "DFECF7", "2F72A0", "DDECF7", "F2A86D", "FBE6D3", "8CB369", "101820", "5D6B78", "C4D4E2", "F3D0BC", "DCEED9"),
      dashboardSections: {
        primary: "CLASS PERFORMANCE",
        secondary: "LESSON + ATTENDANCE SNAPSHOT",
        automation: "GRADEBOOK CHECKS",
        reports: "STUDENT PROGRESS SCORECARD",
        ideas: "CLASSROOM UPGRADES",
      },
    },
    {
      id: "bright-gradebook",
      productTitle: "Bright Gradebook Planner",
      dashboardTitle: "Teacher Command Board",
      dashboardSubtitle: "A cheerful class overview for grades, lessons, student support, assignments, and attendance",
      systemBadge: "CLASSROOM PLANNER - GRADEBOOK - LESSON CALENDAR",
      heroFont: "Nunito",
      bodyFont: "Nunito Sans",
      titleSize: 29,
      palette: makePalette("FFFDF4", "FFFFFF", "3F6784", "E0EDF5", "4D7EA8", "E2EFF7", "F3C969", "FAECC7", "E98672", "111111", "65727C", "CAD8E0", "F3D0C2", "DDEBDB"),
      dashboardSections: {
        primary: "GRADE SNAPSHOT",
        secondary: "WEEKLY CLASS VIEW",
        automation: "STUDENT SUPPORT CHECKS",
        reports: "TEACHER SCORECARD",
        ideas: "LESSON UPGRADES",
      },
    },
  ],
  travel_moving: [
    {
      id: "itinerary-atlas",
      productTitle: "The Travel Atlas Planner",
      dashboardTitle: "Trip Control Dashboard",
      dashboardSubtitle: "Itinerary, bookings, budget, packing, documents, reservations, and day-by-day travel flow",
      systemBadge: "TRAVEL PLANNER - ITINERARY - BUDGET - PACKING",
      heroFont: "Aptos Display",
      bodyFont: "Aptos",
      titleSize: 28,
      palette: makePalette("F7F4EC", "FFFFFF", "255E63", "DCEBEC", "2E7475", "E0EFF0", "E2A554", "F5E2C5", "C3A38A", "102021", "66706E", "C4D2D0", "F1D2C2", "DCEADB"),
      dashboardSections: {
        primary: "TRIP PERFORMANCE",
        secondary: "ITINERARY SNAPSHOT",
        automation: "BOOKING CHECKS",
        reports: "TRAVEL SCORECARD",
        ideas: "TRIP UPGRADES",
      },
    },
  ],
  custom_calculator: [
    {
      id: "calculator-lab",
      productTitle: "Decision Calculator Lab",
      dashboardTitle: "Scenario Control Panel",
      dashboardSubtitle: "Inputs, outputs, scenarios, assumptions, sensitivity checks, and decision-ready summaries",
      systemBadge: "CALCULATOR WORKBOOK - SCENARIOS - DECISION DASHBOARD",
      heroFont: "Aptos Display",
      bodyFont: "Aptos",
      titleSize: 27,
      palette: makePalette("F7F7F4", "FFFFFF", "2F4050", "E3E8EC", "415A6B", "E2EAEE", "D6A756", "F1E2C6", "A4B494", "111111", "65706F", "CBD0C8", "F1D0C0", "DDEADB"),
      dashboardSections: {
        primary: "SCENARIO PERFORMANCE",
        secondary: "ASSUMPTION SNAPSHOT",
        automation: "MODEL CHECKS",
        reports: "DECISION SCORECARD",
        ideas: "CALCULATOR UPGRADES",
      },
    },
  ],
};

export function resolveWorkbookDesign(
  familyProfile: SpreadsheetFamilyProfile,
  input: SpreadsheetFamilyInput,
): WorkbookDesignArchetype {
  const choices = BASE_DESIGNS[familyProfile.id] ?? BASE_DESIGNS.custom_calculator;
  const seed = [
    input.projectName,
    input.competitorTitle,
    input.niche,
    input.nicheLabel,
  ].filter(Boolean).join("|");
  const index = Math.abs(hash(seed)) % choices.length;
  return choices[index];
}

export function applyWorkbookDesign(
  spec: SpreadsheetSpec,
  familyProfile: SpreadsheetFamilyProfile,
  input: SpreadsheetFamilyInput,
): SpreadsheetSpec {
  const design = resolveWorkbookDesign(familyProfile, input);

  spec.workbook.title = design.productTitle;
  spec.workbook.fontFamily = design.bodyFont;
  spec.workbook.paletteHex = [
    design.palette.paper,
    design.palette.accent,
    design.palette.accent2,
    design.palette.accent3,
    design.palette.ink,
    design.palette.section,
  ];

  spec.tabs.forEach((tab, tabIndex) => applyTabDesign(tab, tabIndex, design));
  return spec;
}

function applyTabDesign(tab: TabSpec, tabIndex: number, design: WorkbookDesignArchetype): void {
  tab.tabColor = tintForTab(tab.name, tabIndex, design);

  tab.cells.forEach((cell) => {
    replaceRepeatedText(cell, tab, design);
    applyCellStyle(cell, design);
  });

  tab.conditionalFormats?.forEach((format) => applyConditionalFormatStyle(format, design));
  tab.charts?.forEach((chart) => applyChartStyle(chart, design));
}

function replaceRepeatedText(cell: CellSpec, tab: TabSpec, design: WorkbookDesignArchetype): void {
  if (typeof cell.value !== "string") return;

  if (cell.value === "AUTOMATED SPREADSHEET SYSTEM · EXCEL + GOOGLE SHEETS") {
    cell.value = design.systemBadge;
    return;
  }

  if (tab.name === "Dashboard") {
    if (cell.ref === "B3" || cell.value === "All-In-One Dashboard") {
      cell.value = design.dashboardTitle;
    } else if (cell.ref === "B4" || /^Command center for /i.test(cell.value)) {
      cell.value = design.dashboardSubtitle;
    } else if (cell.value === "CATEGORY PERFORMANCE") {
      cell.value = design.dashboardSections.primary;
    } else if (cell.value === "MONTHLY SNAPSHOT") {
      cell.value = design.dashboardSections.secondary;
    } else if (cell.value === "AUTOMATION CHECKS") {
      cell.value = design.dashboardSections.automation;
    }
  }

  if (tab.name === "Start Here" && cell.ref === "B3") {
    cell.value = design.productTitle;
  }

  if (tab.name === "Setup" && cell.ref === "B3" && cell.value === "Quick Setup") {
    cell.value = `${design.productTitle} Setup`;
  }

  if (cell.value === "FAMILY SCORECARD") {
    cell.value = design.dashboardSections.reports;
  } else if (cell.value === "IMPROVEMENT IDEAS") {
    cell.value = design.dashboardSections.ideas;
  }
}

function applyCellStyle(cell: CellSpec, design: WorkbookDesignArchetype): void {
  if (cell.fill?.color) {
    cell.fill.color = mapColor(cell.fill.color, design);
  }
  if (cell.font) {
    if (cell.font.color) cell.font.color = mapColor(cell.font.color, design);
    const isHero = (cell.font.size ?? 0) >= 20 || cell.font.name === "Georgia";
    cell.font.name = isHero ? design.heroFont : design.bodyFont;
    if (isHero) cell.font.size = Math.max(cell.font.size ?? design.titleSize, design.titleSize);
  }
  if (cell.border) applyBorderStyle(cell.border, design);
}

function applyBorderStyle(border: CellBorder, design: WorkbookDesignArchetype): void {
  if (border.color) border.color = mapColor(border.color, design);
  for (const side of [border.top, border.right, border.bottom, border.left]) {
    if (side?.color) side.color = mapColor(side.color, design);
  }
}

function applyConditionalFormatStyle(format: ConditionalFormatSpec, design: WorkbookDesignArchetype): void {
  const rule = format.rule;
  if ("fill" in rule && rule.fill) rule.fill = mapColor(rule.fill, design);
  if ("fontColor" in rule && rule.fontColor) rule.fontColor = mapColor(rule.fontColor, design);
  if (rule.kind === "colorScale") {
    rule.minColor = mapColor(rule.minColor, design);
    if (rule.midColor) rule.midColor = mapColor(rule.midColor, design);
    rule.maxColor = mapColor(rule.maxColor, design);
  }
  if (rule.kind === "dataBar") {
    rule.color = mapColor(rule.color, design);
  }
}

function applyChartStyle(chart: ChartSpec, design: WorkbookDesignArchetype): void {
  chart.seriesColors = (chart.seriesColors?.length ? chart.seriesColors : [
    design.palette.accent,
    design.palette.accent2,
    design.palette.accent3,
  ]).map((color) => mapColor(color, design));
}

function mapColor(color: string, design: WorkbookDesignArchetype): string {
  const normalized = normalizeHex(color);
  if (normalized === "FFFFFF") return "FFFFFF";
  const mapped = LEGACY_COLOR_MAP[normalized];
  if (!mapped) return normalized;
  return mapped === "white" ? "FFFFFF" : design.palette[mapped];
}

function normalizeHex(color: string): string {
  const cleaned = color.replace(/^#/, "").toUpperCase();
  if (cleaned.length === 8 && cleaned.startsWith("FF")) return cleaned.slice(2);
  return cleaned;
}

function tintForTab(name: string, index: number, design: WorkbookDesignArchetype): string {
  if (/dashboard|command|center|board/i.test(name)) return design.palette.ink;
  if (/settings|setup|start/i.test(name)) return design.palette.section;
  if (/report|review|audit|score/i.test(name)) return design.palette.accent3;
  return [design.palette.accent, design.palette.accent2, design.palette.section, design.palette.muted][index % 4];
}

function makePalette(
  paper: string,
  surface: string,
  section: string,
  sectionSoft: string,
  accent: string,
  accentSoft: string,
  accent2: string,
  accent2Soft: string,
  accent3: string,
  ink: string,
  muted: string,
  line: string,
  warning: string,
  success: string,
): Palette {
  return {
    paper,
    surface,
    section,
    sectionSoft,
    accent,
    accentSoft,
    accent2,
    accent2Soft,
    accent3,
    ink,
    muted,
    line,
    warning,
    success,
  };
}

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = Math.imul(31, h) + value.charCodeAt(i) | 0;
  }
  return h;
}
