// ══════════════════════════════════════════════════════════════
// Google Sheets Template Generator
// Produces a Google Sheets-compatible .xlsx for 3 spreadsheet types:
//   budget_tracker · paycheck_budget · business_pl
//
// Output: binary .xlsx (ExcelJS, no VBA, Sheets-safe formulas)
// Delivery: buyer uploads to Google Drive → Open with Sheets
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import ExcelJS from "exceljs";

// ── Color Schemes ─────────────────────────────────────────────

interface ColorScheme {
  primary: string;   // Header background (hex, no #)
  secondary: string; // Subheader / border
  accent: string;    // Totals / highlights
  bg: string;        // Sheet background
  text: string;      // Body text
  light: string;     // Alternating row fill
  headerFont: string; // Header font color
}

const COLOR_SCHEMES: Record<string, ColorScheme> = {
  "sage-green": {
    primary: "7C9A7E", secondary: "B5C9B7", accent: "4A7C59",
    bg: "F8FAF8", text: "2C3E2D", light: "EDF4EE", headerFont: "FFFFFF",
  },
  "dusty-rose": {
    primary: "C4847A", secondary: "E8B4AE", accent: "9B5E56",
    bg: "FDF8F7", text: "3D2422", light: "F9EDEB", headerFont: "FFFFFF",
  },
  "navy-gold": {
    primary: "1B3A5C", secondary: "4A6FA5", accent: "C9A84C",
    bg: "F8F9FC", text: "0D1B2A", light: "EBF0F8", headerFont: "FFFFFF",
  },
  "minimal-black": {
    primary: "1A1A1A", secondary: "555555", accent: "333333",
    bg: "FFFFFF", text: "1A1A1A", light: "F5F5F5", headerFont: "FFFFFF",
  },
  "lavender": {
    primary: "7B68B0", secondary: "B0A3D4", accent: "5B4A90",
    bg: "FAF9FD", text: "2D2640", light: "EDE9F6", headerFont: "FFFFFF",
  },
  "sheets-green": {
    primary: "1E7E34", secondary: "34A853", accent: "0F4C1A",
    bg: "F8FDF9", text: "0D2414", light: "E8F5EB", headerFont: "FFFFFF",
  },
};

const DEFAULT_SCHEME = COLOR_SCHEMES["sage-green"];

// ── Premium Design Tokens ────────────────────────────────────
// Pastel, light-theme colors matching Etsy bestseller aesthetics.
// Each KPI card and section gets its own distinct pastel color.

interface DesignTokens {
  titleBg: string;
  titleText: string;
  subtitleBg: string;
  subtitleText: string;
  kpiGreen: { bg: string; text: string };
  kpiRed: { bg: string; text: string };
  kpiYellow: { bg: string; text: string };
  kpiBlue: { bg: string; text: string };
  sectionPink: { bg: string; text: string };
  sectionGreen: { bg: string; text: string };
  sectionBlue: { bg: string; text: string };
  sectionYellow: { bg: string; text: string };
  headerBg: string;
  headerText: string;
  rowAlt: string;
  totalsBg: string;
  totalsText: string;
  borderLight: string;
  mutedText: string;
  accentText: string;
}

function getDesignTokens(scheme: ColorScheme): DesignTokens {
  // Map the color scheme to premium pastel design tokens
  return {
    titleBg: scheme.primary,
    titleText: scheme.headerFont,
    subtitleBg: scheme.light,
    subtitleText: scheme.text,
    kpiGreen: { bg: "D5F0D5", text: "166534" },
    kpiRed: { bg: "FEE2E2", text: "991B1B" },
    kpiYellow: { bg: "FEF3C7", text: "92400E" },
    kpiBlue: { bg: "DBEAFE", text: "1E40AF" },
    sectionPink: { bg: "FECDD3", text: "9F1239" },
    sectionGreen: { bg: "D1FAE5", text: "065F46" },
    sectionBlue: { bg: "DBEAFE", text: "1E3A8A" },
    sectionYellow: { bg: "FEF3C7", text: "78350F" },
    headerBg: "F1F5F9",
    headerText: "334155",
    rowAlt: "F8FAFC",
    totalsBg: "E2E8F0",
    totalsText: "0F172A",
    borderLight: "E2E8F0",
    mutedText: "6B7280",
    accentText: scheme.accent,
  };
}

// ── Styling Helpers ───────────────────────────────────────────

type WS = ExcelJS.Worksheet;

function applyHeaderRow(ws: WS, rowNum: number, scheme: ColorScheme, numCols: number) {
  const t = getDesignTokens(scheme);
  const row = ws.getRow(rowNum);
  for (let c = 1; c <= numCols; c++) {
    const cell = row.getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + t.headerBg } };
    cell.font = { bold: true, color: { argb: "FF" + t.headerText }, size: 10, name: "Calibri" };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF" + t.borderLight } },
    };
  }
  row.height = 26;
}

function applyDataRow(ws: WS, rowNum: number, scheme: ColorScheme, numCols: number, isAlt: boolean) {
  const t = getDesignTokens(scheme);
  const row = ws.getRow(rowNum);
  for (let c = 1; c <= numCols; c++) {
    const cell = row.getCell(c);
    if (isAlt) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + t.rowAlt } };
    }
    cell.font = { color: { argb: "FF" + scheme.text }, size: 11, name: "Calibri" };
    cell.border = { bottom: { style: "thin", color: { argb: "FF" + t.borderLight } } };
    cell.alignment = { vertical: "middle" };
  }
  row.height = 26;
}

function applySubheaderRow(ws: WS, rowNum: number, scheme: ColorScheme, numCols: number) {
  const t = getDesignTokens(scheme);
  const row = ws.getRow(rowNum);
  for (let c = 1; c <= numCols; c++) {
    const cell = row.getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + scheme.secondary } };
    cell.font = { bold: true, color: { argb: "FF1A1A1A" }, size: 10, name: "Calibri" };
    cell.alignment = { horizontal: "left", vertical: "middle" };
  }
  row.height = 24;
}

function applyTotalsRow(ws: WS, rowNum: number, scheme: ColorScheme, numCols: number) {
  const t = getDesignTokens(scheme);
  const row = ws.getRow(rowNum);
  for (let c = 1; c <= numCols; c++) {
    const cell = row.getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + t.totalsBg } };
    cell.font = { bold: true, color: { argb: "FF" + t.totalsText }, size: 11, name: "Calibri" };
    cell.border = {
      top: { style: "medium", color: { argb: "FF" + t.borderLight } },
      bottom: { style: "medium", color: { argb: "FF" + t.borderLight } },
    };
  }
  row.height = 28;
}

function setTitle(ws: WS, rowNum: number, text: string, scheme: ColorScheme, mergeTo: number) {
  ws.mergeCells(rowNum, 1, rowNum, mergeTo);
  const cell = ws.getCell(rowNum, 1);
  cell.value = text;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + scheme.primary } };
  cell.font = { bold: true, color: { argb: "FF" + scheme.headerFont }, size: 18, name: "Calibri" };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(rowNum).height = 48;
}

/** Premium KPI card with distinct pastel color */
function setKpiCard(
  ws: WS,
  labelRow: number, labelCol: number,
  valueRow: number, valueCol: number,
  label: string,
  formula: string | number,
  kpiBg: string,
  kpiText: string,
  isCurrency = true
) {
  // Label cell
  const labelCell = ws.getCell(labelRow, labelCol);
  labelCell.value = label;
  labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + kpiBg } };
  labelCell.font = { bold: true, size: 9, name: "Calibri", color: { argb: "FF" + kpiText } };
  labelCell.alignment = { horizontal: "center", vertical: "middle" };
  labelCell.border = {
    top: { style: "thin", color: { argb: "FFE2E8F0" } },
    bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
    left: { style: "thin", color: { argb: "FFE2E8F0" } },
    right: { style: "thin", color: { argb: "FFE2E8F0" } },
  };
  ws.getRow(labelRow).height = 24;

  // Value cell
  const valueCell = ws.getCell(valueRow, valueCol);
  if (typeof formula === "string" && formula.startsWith("=")) {
    valueCell.value = { formula: formula.slice(1) };
  } else if (typeof formula === "string") {
    valueCell.value = { formula };
  } else {
    valueCell.value = formula;
  }
  valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + kpiBg } };
  valueCell.font = { bold: true, size: 22, name: "Calibri", color: { argb: "FF" + kpiText } };
  valueCell.alignment = { horizontal: "center", vertical: "middle" };
  valueCell.border = {
    top: { style: "thin", color: { argb: "FFE2E8F0" } },
    bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
    left: { style: "thin", color: { argb: "FFE2E8F0" } },
    right: { style: "thin", color: { argb: "FFE2E8F0" } },
  };
  if (isCurrency) {
    valueCell.numFmt = '"$"#,##0';
  } else {
    valueCell.numFmt = '0%';
  }
  ws.getRow(valueRow).height = 48;
}

/** Apply a colored section header bar */
function applySectionHeader(ws: WS, rowNum: number, colStart: number, colEnd: number, text: string, bgColor: string, textColor: string) {
  ws.mergeCells(rowNum, colStart, rowNum, colEnd);
  const cell = ws.getCell(rowNum, colStart);
  cell.value = text;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + bgColor } };
  cell.font = { bold: true, size: 11, name: "Calibri", color: { argb: "FF" + textColor } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  for (let c = colStart + 1; c <= colEnd; c++) {
    ws.getCell(rowNum, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + bgColor } };
  }
  ws.getRow(rowNum).height = 32;
}

// Legacy compat — maps to new setKpiCard
function setMetricCard(
  ws: WS,
  labelRow: number, labelCol: number,
  valueRow: number, valueCol: number,
  label: string,
  formula: string | number,
  scheme: ColorScheme,
  isCurrency = true
) {
  const t = getDesignTokens(scheme);
  // Pick KPI color based on label keywords
  let kpiBg = t.kpiBlue.bg, kpiText = t.kpiBlue.text;
  const lbl = label.toLowerCase();
  if (lbl.includes("income") || lbl.includes("revenue")) { kpiBg = t.kpiGreen.bg; kpiText = t.kpiGreen.text; }
  else if (lbl.includes("spent") || lbl.includes("expense")) { kpiBg = t.kpiRed.bg; kpiText = t.kpiRed.text; }
  else if (lbl.includes("saving") || lbl.includes("net")) { kpiBg = t.kpiYellow.bg; kpiText = t.kpiYellow.text; }
  setKpiCard(ws, labelRow, labelCol, valueRow, valueCol, label, formula, kpiBg, kpiText, isCurrency);
}

// ── Workbook Base Setup ───────────────────────────────────────

function initWorkbook(title: string): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CraftPlan Digital Studio";
  wb.created = new Date();
  wb.modified = new Date();
  wb.title = title;
  wb.subject = "Digital Product — Google Sheets Template";
  wb.keywords = "google sheets, spreadsheet, template, digital product";
  return wb;
}

// ── SETUP TAB (shared across types) ──────────────────────────

function buildSetupTab(
  wb: ExcelJS.Workbook,
  scheme: ColorScheme,
  productTitle: string,
  instructions: string[],
  tabs: string[]
) {
  const ws = wb.addWorksheet("⚙️ Setup", { properties: { tabColor: { argb: "FF" + scheme.primary } } });
  ws.columns = [
    { width: 4 }, { width: 40 }, { width: 30 }, { width: 20 }, { width: 20 },
  ];

  // Title
  setTitle(ws, 1, productTitle, scheme, 5);
  setTitle(ws, 2, "⚙️ SETUP & INSTRUCTIONS", { ...scheme, primary: scheme.secondary, headerFont: "1A1A1A" }, 5);

  // Instructions section
  ws.getRow(4).getCell(2).value = "📋 HOW TO USE THIS SPREADSHEET";
  ws.getRow(4).getCell(2).font = { bold: true, size: 11, color: { argb: "FF" + scheme.accent } };
  ws.getRow(4).height = 24;

  instructions.forEach((line, i) => {
    const row = ws.getRow(5 + i);
    row.getCell(2).value = `  ${i + 1}.  ${line}`;
    row.getCell(2).font = { size: 10, name: "Calibri", color: { argb: "FF" + scheme.text } };
    row.height = 20;
  });

  const tabStart = 5 + instructions.length + 2;

  ws.getRow(tabStart).getCell(2).value = "📊 TABS INCLUDED";
  ws.getRow(tabStart).getCell(2).font = { bold: true, size: 11, color: { argb: "FF" + scheme.accent } };
  ws.getRow(tabStart).height = 24;

  tabs.forEach((tab, i) => {
    const row = ws.getRow(tabStart + 1 + i);
    row.getCell(2).value = `  ${tab}`;
    row.getCell(2).font = { size: 10, name: "Calibri", color: { argb: "FF" + scheme.text } };
    row.height = 20;
  });

  const deliveryStart = tabStart + tabs.length + 2;
  ws.getRow(deliveryStart).getCell(2).value = "🔗 HOW TO USE IN GOOGLE SHEETS";
  ws.getRow(deliveryStart).getCell(2).font = { bold: true, size: 11, color: { argb: "FF" + scheme.accent } };
  ws.getRow(deliveryStart).height = 24;

  const deliverySteps = [
    "Download the .xlsx file from your Etsy purchase",
    "Go to drive.google.com and sign in to your Google account",
    'Click "+ New" → "File upload" → select this .xlsx file',
    'Once uploaded, right-click the file → "Open with" → "Google Sheets"',
    'Go to File → "Make a copy" to get your own fully editable version',
    "Start by filling in your details in the Setup tab, then use the other tabs",
  ];
  deliverySteps.forEach((step, i) => {
    const row = ws.getRow(deliveryStart + 1 + i);
    row.getCell(2).value = `  ${i + 1}.  ${step}`;
    row.getCell(2).font = { size: 10, name: "Calibri", color: { argb: "FF" + scheme.text } };
    row.height = 20;
  });

  // Footer note
  const footerRow = deliveryStart + deliverySteps.length + 2;
  ws.mergeCells(footerRow, 1, footerRow, 5);
  ws.getRow(footerRow).getCell(1).value =
    "✨  All formulas update automatically. Sample data is included — clear it and add your own to get started.";
  ws.getRow(footerRow).getCell(1).font = {
    italic: true, size: 10, color: { argb: "FF" + scheme.secondary }, name: "Calibri",
  };
  ws.getRow(footerRow).getCell(1).alignment = { horizontal: "center" };
  ws.getRow(footerRow).height = 24;
}

// ════════════════════════════════════════════════════════════════
// BUDGET TRACKER
// Tabs: Setup · Dashboard · Transactions · Monthly Summary · Savings Goals
// ════════════════════════════════════════════════════════════════

function buildBudgetTracker(wb: ExcelJS.Workbook, scheme: ColorScheme, title: string) {
  // ══════════════════════════════════════════════════════════════
  // PREMIUM "PAY YOURSELF FIRST" BUDGET TRACKER
  // Inspired by top-selling Etsy budget templates ($5K-$19K/mo)
  // 6 tabs: Setup, Dashboard, Transactions, Budget Setup,
  //         Monthly Summary, Savings Goals
  // ══════════════════════════════════════════════════════════════

  const TRX = "💳 Transactions";
  const BSETUP = "📊 Budget Setup";
  const MSUM = "📅 Monthly Summary";
  const SGOALS = "🎯 Savings Goals";

  // ── Setup ──
  buildSetupTab(wb, scheme, title, [
    "Start with the Budget Setup tab — set your monthly income, allocations and categories",
    "Log all income and expenses in the Transactions tab (sample data included)",
    'Assign each transaction to a Bucket: Savings, Needs, Wants, or Bills',
    "The Dashboard updates automatically — select any month to see your breakdown",
    "Track savings progress in the Savings Goals tab",
    "Delete sample data and add your own to get started!",
  ], [
    "⚙️ Setup — instructions and delivery guide (this tab)",
    "📊 Dashboard — Pay Yourself First visual budget overview",
    `${TRX} — log every income and expense with bucket categories`,
    `${BSETUP} — set income, allocations, categories and goals`,
    `${MSUM} — automatic monthly breakdown by bucket (SUMIFS)`,
    `${SGOALS} — track progress toward each saving target`,
  ]);

  const months = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];

  const buckets = ["Savings (Paid First)", "Needs", "Wants", "Bills & Subscriptions"];
  const bucketPct = [0.25, 0.35, 0.20, 0.20]; // decimal format — 0% format multiplies by 100 for display

  // ── Budget Setup Tab ──
  const bs = wb.addWorksheet(BSETUP, {
    properties: { tabColor: { argb: "FF" + scheme.accent } },
  });
  bs.columns = [
    { width: 4 }, { width: 26 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 4 },
  ];
  setTitle(bs, 1, "📊 BUDGET SETUP", scheme, 6);

  // Monthly income
  applySubheaderRow(bs, 3, scheme, 6);
  bs.getRow(3).getCell(2).value = "💰 MONTHLY INCOME";
  bs.getCell(3, 3).value = 4200;
  bs.getCell(3, 3).numFmt = '"$"#,##0.00';
  bs.getCell(3, 3).font = { bold: true, size: 14, name: "Calibri", color: { argb: "FF" + scheme.accent } };

  // Bucket allocation
  applySubheaderRow(bs, 5, scheme, 6);
  bs.mergeCells(5, 2, 5, 5);
  bs.getRow(5).getCell(2).value = "📊 BUCKET ALLOCATION (must total 100%)";

  applyHeaderRow(bs, 6, scheme, 6);
  bs.getRow(6).values = ["", "Bucket", "% of Income", "$ Amount", "", ""];
  buckets.forEach((bucket, i) => {
    const r = bs.getRow(7 + i);
    r.getCell(2).value = bucket;
    r.getCell(3).value = bucketPct[i];
    r.getCell(3).numFmt = '0%';
    r.getCell(4).value = { formula: `C${7+i}*C3` };
    r.getCell(4).numFmt = '"$"#,##0.00';
    applyDataRow(bs, 7 + i, scheme, 6, i % 2 === 1);
    r.height = 24;
  });
  const totBs = bs.getRow(11);
  applyTotalsRow(bs, 11, scheme, 6);
  totBs.getCell(2).value = "TOTAL";
  totBs.getCell(3).value = { formula: "SUM(C7:C10)" };
  totBs.getCell(3).numFmt = '0%';
  totBs.getCell(4).value = { formula: "SUM(D7:D10)" };
  totBs.getCell(4).numFmt = '"$"#,##0.00';

  // Savings goals in budget setup
  applySubheaderRow(bs, 13, scheme, 6);
  bs.mergeCells(13, 2, 13, 5);
  bs.getRow(13).getCell(2).value = "🎯 SAVINGS GOALS";
  applyHeaderRow(bs, 14, scheme, 6);
  bs.getRow(14).values = ["", "Goal", "Target", "Monthly Contribution", "", ""];

  const goalData = [
    ["Emergency Fund", 5000, 400],
    ["Travel Fund", 3500, 200],
    ["Retirement (Roth IRA)", 6500, 250],
    ["High-Yield Savings", 2000, 150],
    ["Sinking Fund (Car/Tech)", 1500, 100],
  ];
  goalData.forEach(([name, target, monthly], i) => {
    const r = bs.getRow(15 + i);
    r.getCell(2).value = name as string;
    r.getCell(3).value = target as number;
    r.getCell(3).numFmt = '"$"#,##0.00';
    r.getCell(4).value = monthly as number;
    r.getCell(4).numFmt = '"$"#,##0.00';
    applyDataRow(bs, 15 + i, scheme, 6, i % 2 === 1);
    r.height = 22;
  });
  bs.views = [{ state: "frozen", ySplit: 2 }];

  // ── Transactions Tab (Enhanced) ──
  const trx = wb.addWorksheet(TRX, {
    properties: { tabColor: { argb: "FF" + scheme.secondary } },
  });
  trx.columns = [
    { width: 4 }, { width: 13 }, { width: 24 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 10 }, { width: 14 },
  ];
  setTitle(trx, 1, "💳 TRANSACTIONS", scheme, 8);
  applyHeaderRow(trx, 2, scheme, 8);
  trx.getRow(2).values = ["", "Date", "Description", "Amount", "Sub-Category", "Category", "Bucket", "Month"];
  trx.views = [{ state: "frozen", ySplit: 2 }];

  // Rich sample transactions (20 entries across all buckets)
  const sampleTrx: [string, string, number, string, string, string, string][] = [
    // January Income
    ["2026-01-01", "Monthly salary",           4200,  "Salary",      "Income",    "Income",     "January"],
    // January Savings
    ["2026-01-02", "Emergency Fund",            400,  "Emergency",   "Savings",   "Savings",    "January"],
    ["2026-01-02", "Roth IRA contribution",     250,  "Retirement",  "Savings",   "Savings",    "January"],
    ["2026-01-02", "High-yield savings",        150,  "HY Savings",  "Savings",   "Savings",    "January"],
    ["2026-01-02", "Travel fund",               200,  "Travel",      "Savings",   "Savings",    "January"],
    ["2026-01-02", "Sinking fund (car)",        100,  "Car/Tech",    "Savings",   "Savings",    "January"],
    // January Needs
    ["2026-01-03", "Rent payment",             1200,  "Rent",        "Needs",     "Needs",      "January"],
    ["2026-01-05", "Whole Foods groceries",      62,  "Groceries",   "Needs",     "Needs",      "January"],
    ["2026-01-10", "Gas fill up",                45,  "Gas",         "Needs",     "Needs",      "January"],
    ["2026-01-14", "Car insurance – mo",        145,  "Insurance",   "Needs",     "Needs",      "January"],
    ["2026-01-20", "Therapy session",            40,  "Health",      "Needs",     "Needs",      "January"],
    // January Wants
    ["2026-01-06", "Starbucks",                32.5,  "Coffee",      "Wants",     "Wants",      "January"],
    ["2026-01-08", "Amazon phone case",          22,  "Amazon",      "Wants",     "Wants",      "January"],
    ["2026-01-12", "Nail appointment",           50,  "Nails",       "Wants",     "Wants",      "January"],
    ["2026-01-18", "Target run",                 55,  "Shopping",    "Wants",     "Wants",      "January"],
    // January Bills
    ["2026-01-01", "Internet – mo",           59.99,  "Internet",    "Bills",     "Bills",      "January"],
    ["2026-01-01", "Netflix + Spotify",        32.48,  "Streaming",   "Bills",     "Bills",      "January"],
    ["2026-01-05", "Phone plan",                 85,  "Phone",       "Bills",     "Bills",      "January"],
    ["2026-01-15", "Student loans",             280,  "Loans",       "Bills",     "Bills",      "January"],
    ["2026-01-20", "Gym membership",             45,  "Gym",         "Bills",     "Bills",      "January"],
  ];

  sampleTrx.forEach((row, i) => {
    const r = trx.getRow(3 + i);
    r.values = ["", row[0], row[1], row[2], row[3], row[4], row[5], row[6]];
    r.getCell(4).numFmt = '"$"#,##0.00';
    applyDataRow(trx, 3 + i, scheme, 8, i % 2 === 1);
  });

  // Empty rows for user data
  for (let i = 0; i < 180; i++) {
    const rn = 3 + sampleTrx.length + i;
    trx.getRow(rn).getCell(4).numFmt = '"$"#,##0.00';
    applyDataRow(trx, rn, scheme, 8, (sampleTrx.length + i) % 2 === 1);
  }

  // ── Monthly Summary Tab (Enhanced with bucket breakdown) ──
  const ms = wb.addWorksheet(MSUM, {
    properties: { tabColor: { argb: "FF" + scheme.accent } },
  });
  ms.columns = [
    { width: 4 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 },
  ];
  setTitle(ms, 1, "📅 MONTHLY SUMMARY", scheme, 8);
  applyHeaderRow(ms, 2, scheme, 8);
  ms.getRow(2).values = ["", "Month", "Income", "Savings", "Needs", "Wants", "Bills", "Net"];
  ms.views = [{ state: "frozen", ySplit: 2 }];

  months.forEach((month, i) => {
    const r = ms.getRow(3 + i);
    r.getCell(2).value = month;
    r.getCell(3).value = { formula: `SUMIFS('${TRX}'!D:D,'${TRX}'!F:F,"Income",'${TRX}'!H:H,"${month}")` };
    r.getCell(4).value = { formula: `SUMIFS('${TRX}'!D:D,'${TRX}'!G:G,"Savings",'${TRX}'!H:H,"${month}")` };
    r.getCell(5).value = { formula: `SUMIFS('${TRX}'!D:D,'${TRX}'!G:G,"Needs",'${TRX}'!H:H,"${month}")` };
    r.getCell(6).value = { formula: `SUMIFS('${TRX}'!D:D,'${TRX}'!G:G,"Wants",'${TRX}'!H:H,"${month}")` };
    r.getCell(7).value = { formula: `SUMIFS('${TRX}'!D:D,'${TRX}'!G:G,"Bills",'${TRX}'!H:H,"${month}")` };
    r.getCell(8).value = { formula: `C${3+i}-D${3+i}-E${3+i}-F${3+i}-G${3+i}` };
    for (let c = 3; c <= 8; c++) r.getCell(c).numFmt = '"$"#,##0.00';
    applyDataRow(ms, 3 + i, scheme, 8, i % 2 === 1);
    r.height = 22;
  });

  const msTotRow = ms.getRow(15);
  applyTotalsRow(ms, 15, scheme, 8);
  msTotRow.getCell(2).value = "TOTAL";
  for (let c = 3; c <= 8; c++) {
    const col = String.fromCharCode(64 + c);
    msTotRow.getCell(c).value = { formula: `SUM(${col}3:${col}14)` };
    msTotRow.getCell(c).numFmt = '"$"#,##0.00';
  }

  // ── Savings Goals Tab (Enhanced) ──
  const sg = wb.addWorksheet(SGOALS, {
    properties: { tabColor: { argb: "FF" + scheme.primary } },
  });
  sg.columns = [
    { width: 4 }, { width: 26 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 16 },
  ];
  setTitle(sg, 1, "🎯 SAVINGS GOALS", scheme, 7);
  applyHeaderRow(sg, 2, scheme, 7);
  sg.getRow(2).values = ["", "Goal Name", "Target", "Saved", "Remaining", "Progress", "Status"];
  sg.views = [{ state: "frozen", ySplit: 2 }];

  const sampleGoals: [string, number, number][] = [
    ["Emergency Fund",           5000, 1100],
    ["Travel Fund",              3500,  800],
    ["Retirement (Roth IRA)",    6500, 2500],
    ["High-Yield Savings",       2000,  900],
    ["Sinking Fund (Car/Tech)",  1500,  600],
  ];
  sampleGoals.forEach(([name, target, saved], i) => {
    const r = sg.getRow(3 + i);
    r.getCell(2).value = name;
    r.getCell(3).value = target;
    r.getCell(4).value = saved;
    r.getCell(5).value = { formula: `C${3+i}-D${3+i}` };
    r.getCell(6).value = { formula: `IF(C${3+i}>0,D${3+i}/C${3+i},0)` };
    r.getCell(7).value = { formula: `IF(F${3+i}>=1,"✅ Funded",IF(F${3+i}>=0.5,"⏳ Halfway","🚀 In Progress"))` };
    r.getCell(3).numFmt = '"$"#,##0.00';
    r.getCell(4).numFmt = '"$"#,##0.00';
    r.getCell(5).numFmt = '"$"#,##0.00';
    r.getCell(6).numFmt = '0%';
    applyDataRow(sg, 3 + i, scheme, 7, i % 2 === 1);
    r.height = 24;
  });
  // Empty goal rows
  for (let i = 0; i < 10; i++) {
    const rn = 3 + sampleGoals.length + i;
    const r = sg.getRow(rn);
    r.getCell(5).value = { formula: `C${rn}-D${rn}` };
    r.getCell(6).value = { formula: `IF(C${rn}>0,D${rn}/C${rn},0)` };
    r.getCell(7).value = { formula: `IF(F${rn}>=1,"✅ Funded",IF(F${rn}>=0.5,"⏳ Halfway","🚀 In Progress"))` };
    for (let c = 3; c <= 5; c++) r.getCell(c).numFmt = '"$"#,##0.00';
    r.getCell(6).numFmt = '0%';
    applyDataRow(sg, rn, scheme, 7, (sampleGoals.length + i) % 2 === 1);
    r.height = 22;
  }

  // ── Dashboard Tab (Premium "Pay Yourself First") ──
  const dash = wb.addWorksheet("📊 Dashboard", {
    properties: { tabColor: { argb: "FF" + scheme.primary } },
  });
  const DC = 12; // dashboard column count (upgraded layout)
  const dt = getDesignTokens(scheme);
  dash.columns = [
    { width: 4 },   // A: left gutter
    { width: 24 },  // B: labels
    { width: 16 },  // C: values
    { width: 16 },  // D: values
    { width: 14 },  // E: values
    { width: 14 },  // F: status
    { width: 3 },   // G: center gutter
    { width: 24 },  // H: labels
    { width: 16 },  // I: values
    { width: 16 },  // J: values
    { width: 14 },  // K: values
    { width: 16 },  // L: status
  ];

  // ── Row 1: Premium Title Bar ──
  dash.mergeCells(1, 1, 1, 12);
  const titleCell = dash.getCell(1, 1);
  titleCell.value = "💰 PAY YOURSELF FIRST — BUDGET DASHBOARD";
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + scheme.primary } };
  titleCell.font = { bold: true, color: { argb: "FF" + scheme.headerFont }, size: 18, name: "Calibri" };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  dash.getRow(1).height = 48;

  // ── Row 2: Subtitle Bar ──
  dash.mergeCells(2, 1, 2, 12);
  const subCell = dash.getCell(2, 1);
  subCell.value = title;
  subCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + dt.subtitleBg } };
  subCell.font = { bold: false, size: 11, name: "Calibri", color: { argb: "FF" + dt.subtitleText } };
  subCell.alignment = { horizontal: "center", vertical: "middle" };
  dash.getRow(2).height = 28;

  // ── Row 3: Spacer ──
  dash.getRow(3).height = 16;

  // ── Row 4: Controls — SELECT MONTH + MONTHLY INCOME ──
  dash.getCell(4, 2).value = "📅 SELECT MONTH";
  dash.getCell(4, 2).font = { bold: true, size: 10, name: "Calibri", color: { argb: "FF" + dt.mutedText } };
  dash.getCell(4, 3).value = "January";
  dash.getCell(4, 3).font = { bold: true, size: 13, name: "Calibri", color: { argb: "FF" + dt.accentText } };
  dash.getCell(4, 3).dataValidation = {
    type: "list",
    formulae: ['"January,February,March,April,May,June,July,August,September,October,November,December"'],
  };
  dash.getCell(4, 8).value = "💰 MONTHLY INCOME";
  dash.getCell(4, 8).font = { bold: true, size: 10, name: "Calibri", color: { argb: "FF" + dt.mutedText } };
  dash.getCell(4, 9).value = { formula: `'${BSETUP}'!C3` };
  dash.getCell(4, 9).numFmt = '"$"#,##0';
  dash.getCell(4, 9).font = { bold: true, size: 15, name: "Calibri", color: { argb: "FF" + dt.accentText } };
  dash.getRow(4).height = 34;

  // ── Row 5: Spacer ──
  dash.getRow(5).height = 10;

  // ── Rows 6-7: KPI Cards (4 distinct pastel cards) ──
  // Labels row
  dash.mergeCells(6, 2, 6, 3);
  dash.mergeCells(6, 4, 6, 5);
  dash.mergeCells(6, 8, 6, 9);
  dash.mergeCells(6, 10, 6, 11);
  setKpiCard(dash, 6, 2, 7, 2, "💰 TOTAL INCOME",
    `SUMIFS('${TRX}'!D:D,'${TRX}'!G:G,"Income",'${TRX}'!H:H,C4)`,
    dt.kpiGreen.bg, dt.kpiGreen.text, true);
  setKpiCard(dash, 6, 4, 7, 4, "💸 TOTAL SPENT",
    `SUMIFS('${TRX}'!D:D,'${TRX}'!G:G,"<>Income",'${TRX}'!H:H,C4)`,
    dt.kpiRed.bg, dt.kpiRed.text, true);
  setKpiCard(dash, 6, 8, 7, 8, "💵 NET SAVINGS",
    `B7-D7`,
    dt.kpiYellow.bg, dt.kpiYellow.text, true);
  setKpiCard(dash, 6, 10, 7, 10, "📊 SAVINGS RATE",
    `IF(B7>0,(B7-D7)/B7,0)`,
    dt.kpiBlue.bg, dt.kpiBlue.text, false);
  // Fill the merged cells with matching KPI colors
  for (const c of [3]) { dash.getCell(6, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + dt.kpiGreen.bg } }; dash.getCell(7, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + dt.kpiGreen.bg } }; }
  for (const c of [5]) { dash.getCell(6, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + dt.kpiRed.bg } }; dash.getCell(7, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + dt.kpiRed.bg } }; }
  for (const c of [9]) { dash.getCell(6, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + dt.kpiYellow.bg } }; dash.getCell(7, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + dt.kpiYellow.bg } }; }
  for (const c of [11]) { dash.getCell(6, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + dt.kpiBlue.bg } }; dash.getCell(7, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + dt.kpiBlue.bg } }; }

  // ── Row 8: Spacer ──
  dash.getRow(8).height = 16;

  // ── Row 9: Two-panel section headers ──
  applySectionHeader(dash, 9, 2, 6, "🎯 SAVINGS GOALS", dt.sectionPink.bg, dt.sectionPink.text);
  applySectionHeader(dash, 9, 8, 12, "💳 WHERE YOUR MONEY WENT", dt.sectionBlue.bg, dt.sectionBlue.text);

  // ── Row 10: Column headers ──
  const leftHeaders = ["GOAL", "TARGET", "SAVED", "REMAINING", "PROGRESS"];
  leftHeaders.forEach((h, ci) => {
    const cell = dash.getRow(10).getCell(2 + ci);
    cell.value = h;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + dt.headerBg } };
    cell.font = { bold: true, size: 10, name: "Calibri", color: { argb: "FF" + dt.headerText } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FF" + dt.borderLight } } };
  });
  const spendHeaders = ["CATEGORY", "BUDGETED", "SPENT", "LEFT", "STATUS"];
  spendHeaders.forEach((h, ci) => {
    const cell = dash.getRow(10).getCell(8 + ci);
    cell.value = h;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + dt.headerBg } };
    cell.font = { bold: true, size: 10, name: "Calibri", color: { argb: "FF" + dt.headerText } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FF" + dt.borderLight } } };
  });

  dash.getRow(10).height = 26;

  // ── Rows 11-15: Goals data (left) + Spending data (right) ──
  goalData.forEach(([name, target, _monthly], i) => {
    const r = dash.getRow(11 + i);
    const bg = i % 2 === 0 ? "FFFFFFFF" : "FF" + dt.rowAlt;
    // Left panel: Savings Goals
    r.getCell(2).value = name as string;
    r.getCell(3).value = { formula: `'${SGOALS}'!C${3+i}` };
    r.getCell(3).numFmt = '"$"#,##0';
    r.getCell(4).value = { formula: `'${SGOALS}'!D${3+i}` };
    r.getCell(4).numFmt = '"$"#,##0';
    r.getCell(5).value = { formula: `'${SGOALS}'!E${3+i}` };
    r.getCell(5).numFmt = '"$"#,##0';
    r.getCell(6).value = { formula: `IF('${SGOALS}'!C${3+i}>0,'${SGOALS}'!D${3+i}/'${SGOALS}'!C${3+i},0)` };
    r.getCell(6).numFmt = '0%';
    for (let c = 2; c <= 6; c++) {
      r.getCell(c).font = { size: 11, name: "Calibri", color: { argb: "FF" + scheme.text } };
      r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      r.getCell(c).border = { bottom: { style: "thin", color: { argb: "FF" + dt.borderLight } } };
      r.getCell(c).alignment = { vertical: "middle", horizontal: c === 2 ? "left" : "center" };
    }
    // Right panel: Spending breakdown
    const bucketKey = ["Savings", "Needs", "Wants", "Bills"][i];
    if (i < 4) {
      r.getCell(8).value = buckets[i];
      r.getCell(9).value = { formula: `'${BSETUP}'!D${7+i}` };
      r.getCell(9).numFmt = '"$"#,##0';
      r.getCell(10).value = { formula: `SUMIFS('${TRX}'!D:D,'${TRX}'!G:G,"${bucketKey}",'${TRX}'!H:H,C4)` };
      r.getCell(10).numFmt = '"$"#,##0';
      r.getCell(11).value = { formula: `I${11+i}-J${11+i}` };
      r.getCell(11).numFmt = '"$"#,##0';
      r.getCell(12).value = { formula: `IF(J${11+i}=0,"—",IF(J${11+i}<=I${11+i},"✅ On Track",IF(J${11+i}<=I${11+i}*1.15,"⚠️ "&TEXT(J${11+i}/I${11+i}*100,"0")&"%","🔴 Over")))` };
      r.getCell(12).font = { bold: true, size: 10, name: "Calibri" };
      for (let c = 8; c <= 12; c++) {
        r.getCell(c).font = { ...r.getCell(c).font, size: 11, name: "Calibri" };
        r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        r.getCell(c).border = { bottom: { style: "thin", color: { argb: "FF" + dt.borderLight } } };
        r.getCell(c).alignment = { vertical: "middle", horizontal: c === 8 ? "left" : "center" };
      }
    }
    r.height = 26;
  });

  // ── Row 16: Totals row ──
  const dashTotRow = 16;
  const goalTot = dash.getRow(dashTotRow);
  goalTot.getCell(2).value = "TOTAL";
  goalTot.getCell(3).value = { formula: "SUM(C11:C15)" };
  goalTot.getCell(3).numFmt = '"$"#,##0';
  goalTot.getCell(4).value = { formula: "SUM(D11:D15)" };
  goalTot.getCell(4).numFmt = '"$"#,##0';
  goalTot.getCell(5).value = { formula: "SUM(E11:E15)" };
  goalTot.getCell(5).numFmt = '"$"#,##0';
  for (let c = 2; c <= 6; c++) {
    goalTot.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + dt.totalsBg } };
    goalTot.getCell(c).font = { bold: true, size: 11, name: "Calibri", color: { argb: "FF" + dt.totalsText } };
    goalTot.getCell(c).border = { top: { style: "medium", color: { argb: "FF" + dt.borderLight } }, bottom: { style: "medium", color: { argb: "FF" + dt.borderLight } } };
  }
  // Right panel totals
  goalTot.getCell(8).value = "TOTAL SPENT";
  goalTot.getCell(10).value = { formula: "SUM(J11:J14)" };
  goalTot.getCell(10).numFmt = '"$"#,##0';
  goalTot.getCell(11).value = { formula: "I9-J16" };
  goalTot.getCell(11).numFmt = '"$"#,##0';
  goalTot.getCell(12).value = { formula: `IF(K16>=0,"💚 $"&TEXT(K16,"#,##0")&" cushion","💔 $"&TEXT(ABS(K16),"#,##0")&" over")` };
  for (let c = 8; c <= 12; c++) {
    goalTot.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + dt.totalsBg } };
    goalTot.getCell(c).font = { bold: true, size: 11, name: "Calibri", color: { argb: "FF" + dt.totalsText } };
    goalTot.getCell(c).border = { top: { style: "medium", color: { argb: "FF" + dt.borderLight } }, bottom: { style: "medium", color: { argb: "FF" + dt.borderLight } } };
  }
  goalTot.height = 28;

  // ── Row 17: Spacer ──
  dash.getRow(17).height = 16;

  // ── Row 18: BUDGET ALLOCATION section header ──
  applySectionHeader(dash, 18, 2, 7, "📊 BUDGET ALLOCATION", dt.sectionYellow.bg, dt.sectionYellow.text);

  // ── Row 19: Allocation headers ──
  const allocHeaders = ["BUCKET", "% GOAL", "$ GOAL", "% ACTUAL", "$ ACTUAL"];
  allocHeaders.forEach((h, ci) => {
    const cell = dash.getRow(19).getCell(2 + ci);
    cell.value = h;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + dt.headerBg } };
    cell.font = { bold: true, size: 10, name: "Calibri", color: { argb: "FF" + dt.headerText } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FF" + dt.borderLight } } };
  });
  dash.getRow(19).height = 26;

  // ── Rows 20-23: Allocation data ──
  buckets.forEach((bucket, i) => {
    const r = dash.getRow(20 + i);
    const bucketKey = ["Savings", "Needs", "Wants", "Bills"][i];
    const bg = i % 2 === 0 ? "FFFFFFFF" : "FF" + dt.rowAlt;
    r.getCell(2).value = bucket;
    r.getCell(3).value = { formula: `'${BSETUP}'!C${7+i}` };
    r.getCell(3).numFmt = '0%';
    r.getCell(4).value = { formula: `'${BSETUP}'!D${7+i}` };
    r.getCell(4).numFmt = '"$"#,##0';
    r.getCell(5).value = { formula: `IF(I9>0,SUMIFS('${TRX}'!D:D,'${TRX}'!G:G,"${bucketKey}",'${TRX}'!H:H,C4)/I9,0)` };
    r.getCell(5).numFmt = '0%';
    r.getCell(6).value = { formula: `SUMIFS('${TRX}'!D:D,'${TRX}'!G:G,"${bucketKey}",'${TRX}'!H:H,C4)` };
    r.getCell(6).numFmt = '"$"#,##0';
    for (let c = 2; c <= 6; c++) {
      r.getCell(c).font = { size: 11, name: "Calibri", color: { argb: "FF" + scheme.text } };
      r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      r.getCell(c).border = { bottom: { style: "thin", color: { argb: "FF" + dt.borderLight } } };
      r.getCell(c).alignment = { vertical: "middle", horizontal: c === 2 ? "left" : "center" };
    }
    r.height = 26;
  });

  // ── Row 24: Allocation totals ──
  const allocTot = dash.getRow(24);
  allocTot.getCell(2).value = "TOTAL";
  allocTot.getCell(3).value = { formula: "SUM(C20:C23)" };
  allocTot.getCell(3).numFmt = '0%';
  allocTot.getCell(4).value = { formula: "SUM(D20:D23)" };
  allocTot.getCell(4).numFmt = '"$"#,##0';
  allocTot.getCell(5).value = { formula: "SUM(E20:E23)" };
  allocTot.getCell(5).numFmt = '0%';
  allocTot.getCell(6).value = { formula: "SUM(F20:F23)" };
  allocTot.getCell(6).numFmt = '"$"#,##0';
  for (let c = 2; c <= 6; c++) {
    allocTot.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + dt.totalsBg } };
    allocTot.getCell(c).font = { bold: true, size: 11, name: "Calibri", color: { argb: "FF" + dt.totalsText } };
    allocTot.getCell(c).border = { top: { style: "medium", color: { argb: "FF" + dt.borderLight } }, bottom: { style: "medium", color: { argb: "FF" + dt.borderLight } } };
  }
  allocTot.height = 28;

  // ── Row 25: Spacer ──
  dash.getRow(25).height = 16;

  // ── Row 26: Chart placeholder ──
  dash.mergeCells(26, 2, 26, 12);
  const chartNote = dash.getCell(26, 2);
  chartNote.value = "💡 TIP: In Google Sheets, select a data table → Insert → Chart to create stunning visualizations!";
  chartNote.font = { italic: true, size: 10, name: "Calibri", color: { argb: "FF" + dt.mutedText } };
  dash.getRow(26).height = 28;

  // Freeze top 2 rows (title + subtitle)
  dash.views = [{ state: "frozen", ySplit: 2 }];
}

// ════════════════════════════════════════════════════════════════
// PAYCHECK BUDGET
// Tabs: Setup · Dashboard · Paycheck Log · Bills · Savings
// ════════════════════════════════════════════════════════════════

function buildPaycheckBudget(wb: ExcelJS.Workbook, scheme: ColorScheme, title: string) {
  // ── Setup ──
  buildSetupTab(wb, scheme, title, [
    "Log each paycheck in the Paycheck Log tab as soon as you get paid",
    "List all your regular bills in the Bills tab with amounts and due dates",
    "Set up your savings funds in the Savings tab with goal amounts",
    "The Dashboard gives you a clear picture of where your money goes",
    'Mark bills as "Yes" in the Paid? column when you pay them each month',
  ], [
    "⚙️ Setup — instructions and delivery guide (this tab)",
    "📊 Dashboard — paycheck overview and spending plan",
    "💵 Paycheck Log — record every paycheck received",
    "🏦 Bills — all recurring bills with due dates and paid status",
    "🐷 Savings — savings funds and progress toward each goal",
  ]);

  // ── Paycheck Log ──
  const pl = wb.addWorksheet("💵 Paycheck Log", {
    properties: { tabColor: { argb: "FF" + scheme.secondary } },
  });
  pl.columns = [
    { width: 4 }, { width: 14 }, { width: 14 }, { width: 14 },
    { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 },
  ];
  setTitle(pl, 1, "💵 PAYCHECK LOG", scheme, 8);
  applyHeaderRow(pl, 2, scheme, 8);
  pl.getRow(2).values = ["", "Pay Date", "Period Start", "Period End", "Gross Pay", "Taxes/Deductions", "Net Pay", "Notes"];
  pl.views = [{ state: "frozen", ySplit: 2 }];

  const samplePaychecks = [
    ["2026-01-15", "2026-01-01", "2026-01-15", 3000, 600, 2400, ""],
    ["2026-01-30", "2026-01-16", "2026-01-31", 3000, 600, 2400, ""],
    ["2026-02-14", "2026-02-01", "2026-02-15", 3000, 615, 2385, "Adjusted withholding"],
    ["2026-02-28", "2026-02-16", "2026-02-28", 3000, 615, 2385, ""],
  ];

  samplePaychecks.forEach((row, i) => {
    const r = pl.getRow(3 + i);
    r.values = ["", ...row];
    [5,6,7].forEach(c => { r.getCell(c).numFmt = '"$"#,##0.00'; });
    applyDataRow(pl, 3 + i, scheme, 8, i % 2 === 1);
    r.height = 22;
  });

  for (let i = 0; i < 48; i++) {
    const r = pl.getRow(3 + samplePaychecks.length + i);
    r.getCell(7).value = { formula: `E${3+samplePaychecks.length+i}-F${3+samplePaychecks.length+i}` };
    [5,6,7].forEach(c => { r.getCell(c).numFmt = '"$"#,##0.00'; });
    applyDataRow(pl, 3 + samplePaychecks.length + i, scheme, 8, (samplePaychecks.length + i) % 2 === 1);
    r.height = 22;
  }

  // ── Bills ──
  const bills = wb.addWorksheet("🏦 Bills", {
    properties: { tabColor: { argb: "FF" + scheme.accent } },
  });
  bills.columns = [
    { width: 4 }, { width: 22 }, { width: 16 }, { width: 10 }, { width: 14 }, { width: 8 }, { width: 14 }, { width: 24 },
  ];
  setTitle(bills, 1, "🏦 BILLS & FIXED EXPENSES", scheme, 8);
  applyHeaderRow(bills, 2, scheme, 8);
  bills.getRow(2).values = ["", "Bill Name", "Category", "Due Day", "Monthly Amount", "Paid?", "Auto-Pay?", "Notes"];
  bills.views = [{ state: "frozen", ySplit: 2 }];

  const sampleBills = [
    ["Rent / Mortgage",      "Housing",     1,  1400, "Yes", "No",  ""],
    ["Electric",             "Utilities",   15,   92, "Yes", "Yes", ""],
    ["Internet",             "Utilities",   20,   70, "Yes", "Yes", ""],
    ["Phone",                "Utilities",    5,   65, "Yes", "Yes", ""],
    ["Groceries (est.)",     "Food",         0,  400, "No",  "No",  "Weekly shop"],
    ["Car Insurance",        "Transport",    1,  145, "Yes", "Yes", ""],
    ["Health Insurance",     "Health",       1,  220, "Yes", "Yes", "Payroll deduction"],
    ["Netflix",              "Subscriptions",12,  18, "Yes", "Yes", ""],
    ["Gym Membership",       "Health",       1,   40, "Yes", "Yes", ""],
    ["Student Loan",         "Debt",        15,  200, "Yes", "No",  ""],
  ];
  sampleBills.forEach((row, i) => {
    const r = bills.getRow(3 + i);
    r.values = ["", ...row];
    r.getCell(5).numFmt = '"$"#,##0.00';
    applyDataRow(bills, 3 + i, scheme, 8, i % 2 === 1);
    r.height = 22;
  });

  // Totals row
  const billsTotRow = bills.getRow(3 + sampleBills.length);
  applyTotalsRow(bills, 3 + sampleBills.length, scheme, 8);
  billsTotRow.getCell(2).value = "MONTHLY TOTAL";
  billsTotRow.getCell(5).value = { formula: `SUM(E3:E${3+sampleBills.length-1})` };
  billsTotRow.getCell(5).numFmt = '"$"#,##0.00';

  // Empty bill rows
  for (let i = 0; i < 15; i++) {
    const r = bills.getRow(4 + sampleBills.length + i);
    r.getCell(5).numFmt = '"$"#,##0.00';
    applyDataRow(bills, 4 + sampleBills.length + i, scheme, 8, (sampleBills.length + i) % 2 === 1);
    r.height = 22;
  }

  // ── Savings ──
  const sav = wb.addWorksheet("🐷 Savings", {
    properties: { tabColor: { argb: "FF" + scheme.primary } },
  });
  sav.columns = [
    { width: 4 }, { width: 22 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 20 },
  ];
  setTitle(sav, 1, "🐷 SAVINGS FUNDS", scheme, 7);
  applyHeaderRow(sav, 2, scheme, 7);
  sav.getRow(2).values = ["", "Fund Name", "Goal Amount", "Current Balance", "Monthly Add", "Progress", "Notes"];
  sav.views = [{ state: "frozen", ySplit: 2 }];

  const sampleSavings = [
    ["Emergency Fund",   5000, 1200,  300, "3-6 months expenses"],
    ["Vacation",         3000,  600,  150, "Summer trip"],
    ["New Car",         10000, 2000,  400, ""],
    ["Holiday Gifts",    1000,  250,  100, ""],
    ["Investment Seed",  5000,  750,  200, "Brokerage account"],
  ];
  sampleSavings.forEach(([name, goal, balance, monthly, notes], i) => {
    const r = sav.getRow(3 + i);
    r.getCell(2).value = name as string;
    r.getCell(3).value = goal as number;
    r.getCell(4).value = balance as number;
    r.getCell(5).value = monthly as number;
    r.getCell(6).value = { formula: `IF(C${3+i}>0,D${3+i}/C${3+i},0)` };
    r.getCell(7).value = notes as string;
    [3,4,5].forEach(c => { r.getCell(c).numFmt = '"$"#,##0.00'; });
    r.getCell(6).numFmt = '0.0%';
    applyDataRow(sav, 3 + i, scheme, 7, i % 2 === 1);
    r.height = 22;
  });

  const savTot = sav.getRow(3 + sampleSavings.length);
  applyTotalsRow(sav, 3 + sampleSavings.length, scheme, 7);
  savTot.getCell(2).value = "TOTAL MONTHLY SAVINGS";
  savTot.getCell(5).value = { formula: `SUM(E3:E${3+sampleSavings.length-1})` };
  savTot.getCell(5).numFmt = '"$"#,##0.00';

  // ── Dashboard ──
  const dash = wb.addWorksheet("📊 Dashboard", {
    properties: { tabColor: { argb: "FF" + scheme.primary } },
  });
  dash.columns = [
    { width: 4 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 4 },
  ];
  setTitle(dash, 1, "📊 PAYCHECK BUDGET DASHBOARD", scheme, 7);
  setTitle(dash, 2, title, { ...scheme, primary: scheme.secondary, headerFont: "1A1A1A" }, 7);

  // Row 4: metric labels
  applySubheaderRow(dash, 4, scheme, 7);
  dash.mergeCells(4, 2, 4, 3); dash.getRow(4).getCell(2).value = "💵 Avg Net Paycheck";
  dash.mergeCells(4, 4, 4, 5); dash.getRow(4).getCell(4).value = "🏦 Monthly Bills";
  dash.getRow(4).getCell(2).alignment = { horizontal: "center" };
  dash.getRow(4).getCell(4).alignment = { horizontal: "center" };

  // Row 5: metric values
  dash.mergeCells(5, 2, 5, 3);
  const avgPay = dash.getCell(5, 2);
  avgPay.value = { formula: `IFERROR(AVERAGE('💵 Paycheck Log'!G3:G60),0)` };
  avgPay.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + scheme.light } };
  avgPay.font = { bold: true, size: 18, name: "Calibri", color: { argb: "FF" + scheme.accent } };
  avgPay.alignment = { horizontal: "center", vertical: "middle" };
  avgPay.numFmt = '"$"#,##0.00';
  dash.getRow(5).height = 40;

  dash.mergeCells(5, 4, 5, 5);
  const totalBills = dash.getCell(5, 4);
  totalBills.value = { formula: `SUM('🏦 Bills'!E3:E${3+sampleBills.length-1})` };
  totalBills.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + scheme.light } };
  totalBills.font = { bold: true, size: 18, name: "Calibri", color: { argb: "FFCC4444" } };
  totalBills.alignment = { horizontal: "center", vertical: "middle" };
  totalBills.numFmt = '"$"#,##0.00';

  // Row 7-8: Savings and Remaining
  applySubheaderRow(dash, 7, scheme, 7);
  dash.mergeCells(7, 2, 7, 3); dash.getRow(7).getCell(2).value = "🐷 Monthly Savings";
  dash.mergeCells(7, 4, 7, 5); dash.getRow(7).getCell(4).value = "💡 Left to Spend";
  dash.getRow(7).getCell(2).alignment = { horizontal: "center" };
  dash.getRow(7).getCell(4).alignment = { horizontal: "center" };

  dash.mergeCells(8, 2, 8, 3);
  const totalSav = dash.getCell(8, 2);
  totalSav.value = { formula: `SUM('🐷 Savings'!E3:E${3+sampleSavings.length-1})` };
  totalSav.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + scheme.light } };
  totalSav.font = { bold: true, size: 18, name: "Calibri", color: { argb: "FF" + scheme.primary } };
  totalSav.alignment = { horizontal: "center", vertical: "middle" };
  totalSav.numFmt = '"$"#,##0.00';
  dash.getRow(8).height = 40;

  dash.mergeCells(8, 4, 8, 5);
  const remaining = dash.getCell(8, 4);
  remaining.value = { formula: `B5-D5-B8` };
  remaining.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + scheme.light } };
  remaining.font = { bold: true, size: 18, name: "Calibri", color: { argb: "FF" + scheme.accent } };
  remaining.alignment = { horizontal: "center", vertical: "middle" };
  remaining.numFmt = '"$"#,##0.00';

  // Bills breakdown
  applySubheaderRow(dash, 10, scheme, 7);
  dash.mergeCells(10, 2, 10, 6);
  dash.getRow(10).getCell(2).value = "🏦  Bills Breakdown (from Bills tab)";

  applyHeaderRow(dash, 11, scheme, 7);
  dash.getRow(11).values = ["", "Bill Name", "Category", "Due Day", "Amount", "Paid?", ""];

  sampleBills.forEach(([name, cat, day, amt, paid], i) => {
    const r = dash.getRow(12 + i);
    r.getCell(2).value = { formula: `'🏦 Bills'!B${3+i}` };
    r.getCell(3).value = { formula: `'🏦 Bills'!C${3+i}` };
    r.getCell(4).value = { formula: `'🏦 Bills'!D${3+i}` };
    r.getCell(5).value = { formula: `'🏦 Bills'!E${3+i}` };
    r.getCell(6).value = { formula: `'🏦 Bills'!F${3+i}` };
    r.getCell(5).numFmt = '"$"#,##0.00';
    applyDataRow(dash, 12 + i, scheme, 7, i % 2 === 1);
    r.height = 20;
    // Suppress unused variable warning
    void name; void cat; void day; void amt; void paid;
  });

  // Dashboard tab is at index 1 (Setup=0, Dashboard=1, ...)
}

// ════════════════════════════════════════════════════════════════
// BUSINESS P&L TRACKER
// Tabs: Setup · Dashboard · Revenue · Expenses · Monthly P&L
// ════════════════════════════════════════════════════════════════

function buildBusinessPL(wb: ExcelJS.Workbook, scheme: ColorScheme, title: string) {
  // ── Setup ──
  buildSetupTab(wb, scheme, title, [
    "Log all revenue entries in the Revenue tab with client and category",
    "Log all business expenses in the Expenses tab — mark tax-deductible ones",
    "Monthly P&L updates automatically via SUMIFS formulas",
    "Use the Dashboard for a high-level view of business performance",
    "Keep receipts organized alongside entries for tax time",
  ], [
    "⚙️ Setup — instructions and delivery guide (this tab)",
    "📊 Dashboard — YTD revenue, expenses, profit and margin",
    "💰 Revenue — all income entries by client and category",
    "💸 Expenses — all business costs with tax deductibility flags",
    "📈 Monthly P&L — automatic month-by-month profit & loss report",
  ]);

  // ── Revenue ──
  const rev = wb.addWorksheet("💰 Revenue", {
    properties: { tabColor: { argb: "FF" + scheme.secondary } },
  });
  rev.columns = [
    { width: 4 }, { width: 14 }, { width: 22 }, { width: 28 },
    { width: 14 }, { width: 18 }, { width: 14 }, { width: 16 },
  ];
  setTitle(rev, 1, "💰 REVENUE LOG", scheme, 8);
  applyHeaderRow(rev, 2, scheme, 8);
  rev.getRow(2).values = ["", "Date", "Client / Source", "Description", "Amount", "Category", "Month", "Invoice #"];
  rev.views = [{ state: "frozen", ySplit: 2 }];

  const sampleRevenue = [
    ["2026-01-05", "Acme Corp",        "Website redesign — Phase 1",  4200, "Design Services", "January",  "INV-001"],
    ["2026-01-18", "Startup Inc",      "Logo & branding package",     1800, "Design Services", "January",  "INV-002"],
    ["2026-01-25", "Self",             "Digital product sales (Etsy)",  620, "Product Sales",  "January",  ""],
    ["2026-02-03", "Acme Corp",        "Website redesign — Phase 2",  3800, "Design Services", "February", "INV-003"],
    ["2026-02-12", "Freelance Hub",    "Monthly retainer",            1200, "Retainer",        "February", "INV-004"],
    ["2026-02-20", "Self",             "Digital product sales (Etsy)",  490, "Product Sales",  "February", ""],
    ["2026-03-08", "New Client Ltd",   "Brand strategy consultation", 2500, "Consulting",      "March",    "INV-005"],
    ["2026-03-15", "Freelance Hub",    "Monthly retainer",            1200, "Retainer",        "March",    "INV-006"],
  ];

  sampleRevenue.forEach((row, i) => {
    const r = rev.getRow(3 + i);
    r.values = ["", ...row];
    r.getCell(5).numFmt = '"$"#,##0.00';
    applyDataRow(rev, 3 + i, scheme, 8, i % 2 === 1);
    r.height = 22;
  });

  for (let i = 0; i < 92; i++) {
    const r = rev.getRow(3 + sampleRevenue.length + i);
    r.getCell(5).numFmt = '"$"#,##0.00';
    applyDataRow(rev, 3 + sampleRevenue.length + i, scheme, 8, (sampleRevenue.length + i) % 2 === 1);
    r.height = 20;
  }

  // ── Expenses ──
  const exp = wb.addWorksheet("💸 Expenses", {
    properties: { tabColor: { argb: "FF" + scheme.accent } },
  });
  exp.columns = [
    { width: 4 }, { width: 14 }, { width: 20 }, { width: 28 },
    { width: 14 }, { width: 18 }, { width: 10 }, { width: 14 }, { width: 16 },
  ];
  setTitle(exp, 1, "💸 EXPENSES LOG", scheme, 9);
  applyHeaderRow(exp, 2, scheme, 9);
  exp.getRow(2).values = [
    "", "Date", "Vendor / Payee", "Description",
    "Amount", "Category", "Tax Ded?", "Month", "Receipt #",
  ];
  exp.views = [{ state: "frozen", ySplit: 2 }];

  const sampleExpenses = [
    ["2026-01-02", "Adobe",           "Creative Cloud subscription",  55, "Software",    "Yes", "January",  "RCP-001"],
    ["2026-01-05", "Office Depot",    "Printer ink & paper",          38, "Supplies",    "Yes", "January",  "RCP-002"],
    ["2026-01-10", "WeWork",          "Co-working space — January",  299, "Office",      "Yes", "January",  "RCP-003"],
    ["2026-01-15", "LinkedIn",        "Premium subscription",         40, "Marketing",   "Yes", "January",  "RCP-004"],
    ["2026-01-20", "Zoom",            "Pro plan",                     15, "Software",    "Yes", "January",  "RCP-005"],
    ["2026-01-28", "Bank",            "Wire transfer fees",           12, "Bank Fees",   "Yes", "January",  "RCP-006"],
    ["2026-02-02", "Adobe",           "Creative Cloud subscription",  55, "Software",    "Yes", "February", "RCP-007"],
    ["2026-02-05", "WeWork",          "Co-working space — February", 299, "Office",      "Yes", "February", "RCP-008"],
    ["2026-02-14", "Client lunch",    "Business meal — Acme Corp",   68, "Meals",       "Yes", "February", "RCP-009"],
    ["2026-02-20", "Canva",           "Annual plan (prorated)",       13, "Software",    "Yes", "February", "RCP-010"],
  ];

  sampleExpenses.forEach((row, i) => {
    const r = exp.getRow(3 + i);
    r.values = ["", ...row];
    r.getCell(5).numFmt = '"$"#,##0.00';
    applyDataRow(exp, 3 + i, scheme, 9, i % 2 === 1);
    r.height = 22;
  });

  for (let i = 0; i < 90; i++) {
    const r = exp.getRow(3 + sampleExpenses.length + i);
    r.getCell(5).numFmt = '"$"#,##0.00';
    applyDataRow(exp, 3 + sampleExpenses.length + i, scheme, 9, (sampleExpenses.length + i) % 2 === 1);
    r.height = 20;
  }

  // ── Monthly P&L ──
  const pl = wb.addWorksheet("📈 Monthly P&L", {
    properties: { tabColor: { argb: "FF" + scheme.primary } },
  });
  pl.columns = [
    { width: 4 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 14 },
  ];
  setTitle(pl, 1, "📈 MONTHLY PROFIT & LOSS", scheme, 6);
  applyHeaderRow(pl, 2, scheme, 6);
  pl.getRow(2).values = ["", "Month", "Revenue", "Expenses", "Net Profit", "Margin %"];
  pl.views = [{ state: "frozen", ySplit: 2 }];

  const months = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];

  months.forEach((month, i) => {
    const r = pl.getRow(3 + i);
    r.getCell(2).value = month;
    r.getCell(3).value = { formula: `SUMIF('💰 Revenue'!G:G,"${month}",'💰 Revenue'!E:E)` };
    r.getCell(4).value = { formula: `SUMIF('💸 Expenses'!H:H,"${month}",'💸 Expenses'!E:E)` };
    r.getCell(5).value = { formula: `C${3+i}-D${3+i}` };
    r.getCell(6).value = { formula: `IF(C${3+i}>0,E${3+i}/C${3+i},0)` };
    [3,4,5].forEach(c => { r.getCell(c).numFmt = '"$"#,##0.00'; });
    r.getCell(6).numFmt = '0.0%';
    applyDataRow(pl, 3 + i, scheme, 6, i % 2 === 1);
    r.height = 22;
  });

  const plTot = pl.getRow(15);
  applyTotalsRow(pl, 15, scheme, 6);
  plTot.getCell(2).value = "ANNUAL TOTAL";
  plTot.getCell(3).value = { formula: "SUM(C3:C14)" };
  plTot.getCell(4).value = { formula: "SUM(D3:D14)" };
  plTot.getCell(5).value = { formula: "SUM(E3:E14)" };
  plTot.getCell(6).value = { formula: "IF(C15>0,E15/C15,0)" };
  [3,4,5].forEach(c => { plTot.getCell(c).numFmt = '"$"#,##0.00'; });
  plTot.getCell(6).numFmt = '0.0%';

  // ── Dashboard ──
  const dash = wb.addWorksheet("📊 Dashboard", {
    properties: { tabColor: { argb: "FF" + scheme.primary } },
  });
  dash.columns = [
    { width: 4 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 4 },
  ];
  setTitle(dash, 1, "📊 BUSINESS P&L DASHBOARD", scheme, 7);
  setTitle(dash, 2, title, { ...scheme, primary: scheme.secondary, headerFont: "1A1A1A" }, 7);

  applySubheaderRow(dash, 4, scheme, 7);
  dash.mergeCells(4, 2, 4, 3); dash.getRow(4).getCell(2).value = "💰 YTD Revenue";
  dash.mergeCells(4, 4, 4, 5); dash.getRow(4).getCell(4).value = "💸 YTD Expenses";
  dash.getRow(4).getCell(2).alignment = { horizontal: "center" };
  dash.getRow(4).getCell(4).alignment = { horizontal: "center" };

  dash.mergeCells(5, 2, 5, 3);
  const ytdRev = dash.getCell(5, 2);
  ytdRev.value = { formula: `SUM('💰 Revenue'!E:E)` };
  ytdRev.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + scheme.light } };
  ytdRev.font = { bold: true, size: 18, name: "Calibri", color: { argb: "FF" + scheme.accent } };
  ytdRev.alignment = { horizontal: "center", vertical: "middle" };
  ytdRev.numFmt = '"$"#,##0.00';
  dash.getRow(5).height = 40;

  dash.mergeCells(5, 4, 5, 5);
  const ytdExp = dash.getCell(5, 4);
  ytdExp.value = { formula: `SUM('💸 Expenses'!E:E)` };
  ytdExp.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + scheme.light } };
  ytdExp.font = { bold: true, size: 18, name: "Calibri", color: { argb: "FFCC4444" } };
  ytdExp.alignment = { horizontal: "center", vertical: "middle" };
  ytdExp.numFmt = '"$"#,##0.00';

  applySubheaderRow(dash, 7, scheme, 7);
  dash.mergeCells(7, 2, 7, 3); dash.getRow(7).getCell(2).value = "📈 Net Profit YTD";
  dash.mergeCells(7, 4, 7, 5); dash.getRow(7).getCell(4).value = "💡 Profit Margin";
  dash.getRow(7).getCell(2).alignment = { horizontal: "center" };
  dash.getRow(7).getCell(4).alignment = { horizontal: "center" };

  dash.mergeCells(8, 2, 8, 3);
  const netProfit = dash.getCell(8, 2);
  netProfit.value = { formula: `B5-D5` };
  netProfit.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + scheme.light } };
  netProfit.font = { bold: true, size: 18, name: "Calibri", color: { argb: "FF" + scheme.primary } };
  netProfit.alignment = { horizontal: "center", vertical: "middle" };
  netProfit.numFmt = '"$"#,##0.00';
  dash.getRow(8).height = 40;

  dash.mergeCells(8, 4, 8, 5);
  const margin = dash.getCell(8, 4);
  margin.value = { formula: `IF(B5>0,(B5-D5)/B5,0)` };
  margin.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + scheme.light } };
  margin.font = { bold: true, size: 18, name: "Calibri", color: { argb: "FF" + scheme.accent } };
  margin.alignment = { horizontal: "center", vertical: "middle" };
  margin.numFmt = '0.0%';

  // Monthly P&L table on dashboard
  applySubheaderRow(dash, 10, scheme, 7);
  dash.mergeCells(10, 2, 10, 6);
  dash.getRow(10).getCell(2).value = "📈  Monthly Breakdown (from Monthly P&L tab)";

  applyHeaderRow(dash, 11, scheme, 7);
  dash.getRow(11).values = ["", "Month", "Revenue", "Expenses", "Net Profit", "Margin %", ""];

  months.forEach((month, i) => {
    const r = dash.getRow(12 + i);
    r.getCell(2).value = month;
    r.getCell(3).value = { formula: `'📈 Monthly P&L'!C${3+i}` };
    r.getCell(4).value = { formula: `'📈 Monthly P&L'!D${3+i}` };
    r.getCell(5).value = { formula: `'📈 Monthly P&L'!E${3+i}` };
    r.getCell(6).value = { formula: `'📈 Monthly P&L'!F${3+i}` };
    [3,4,5].forEach(c => { r.getCell(c).numFmt = '"$"#,##0.00'; });
    r.getCell(6).numFmt = '0.0%';
    applyDataRow(dash, 12 + i, scheme, 7, i % 2 === 1);
    r.height = 22;
  });

  // Dashboard tab is at index 1 (Setup=0, Dashboard=1, ...)
}

// ── POST Handler ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      sheetsType: "budget_tracker" | "paycheck_budget" | "business_pl";
      colorScheme?: string;
      customTitle?: string;
    };

    const { sheetsType, colorScheme = "sage-green", customTitle } = body;

    const scheme = COLOR_SCHEMES[colorScheme] ?? DEFAULT_SCHEME;

    const TYPE_TITLES: Record<string, string> = {
      budget_tracker:  "Monthly Budget Tracker",
      paycheck_budget: "Biweekly Paycheck Budget",
      business_pl:     "Business P&L Tracker",
    };

    const title = customTitle?.trim() || TYPE_TITLES[sheetsType] || "Spreadsheet Template";
    const wb = initWorkbook(title);

    switch (sheetsType) {
      case "budget_tracker":
        buildBudgetTracker(wb, scheme, title);
        break;
      case "paycheck_budget":
        buildPaycheckBudget(wb, scheme, title);
        break;
      case "business_pl":
        buildBusinessPL(wb, scheme, title);
        break;
      default:
        return NextResponse.json({ error: `Unknown sheetsType: ${sheetsType}` }, { status: 400 });
    }

    const buffer = await wb.xlsx.writeBuffer();

    const safeFileName = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeFileName}.xlsx"`,
      },
    });
  } catch (err: unknown) {
    console.error("[Sheets Generator] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
