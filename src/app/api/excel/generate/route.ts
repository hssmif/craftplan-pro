import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import ExcelJS from "exceljs";

// ---------------------------------------------------------------------------
// Color Schemes
// ---------------------------------------------------------------------------

interface ColorScheme {
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  text: string;
  light: string;
  headerFont: string;
}

const COLOR_SCHEMES: Record<string, ColorScheme> = {
  "sage-green": {
    primary: "7C9A7E",
    secondary: "B5C9B7",
    accent: "4A7C59",
    bg: "F8FAF8",
    text: "2C3E2D",
    light: "E8F0E8",
    headerFont: "FFFFFF",
  },
  "dusty-rose": {
    primary: "C4847A",
    secondary: "E8B4AE",
    accent: "9B5E56",
    bg: "FDF8F7",
    text: "3D2422",
    light: "F5E6E4",
    headerFont: "FFFFFF",
  },
  "navy-gold": {
    primary: "1B3A5C",
    secondary: "4A6FA5",
    accent: "C9A84C",
    bg: "F8F9FC",
    text: "0D1B2A",
    light: "E8EDF5",
    headerFont: "FFFFFF",
  },
  "minimal-black": {
    primary: "1A1A1A",
    secondary: "555555",
    accent: "1A1A1A",
    bg: "FFFFFF",
    text: "1A1A1A",
    light: "F5F5F5",
    headerFont: "FFFFFF",
  },
  lavender: {
    primary: "7B68B0",
    secondary: "B0A3D4",
    accent: "5B4A90",
    bg: "FAF9FD",
    text: "2D2640",
    light: "EDE9F6",
    headerFont: "FFFFFF",
  },
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function styleHeaderRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  scheme: ColorScheme,
  cols: number
) {
  const headerRow = sheet.getRow(row);
  for (let col = 1; col <= cols; col++) {
    const cell = headerRow.getCell(col);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF" + scheme.primary },
    };
    cell.font = {
      bold: true,
      color: { argb: "FF" + scheme.headerFont },
      size: 11,
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF" + scheme.secondary } },
      bottom: { style: "thin", color: { argb: "FF" + scheme.secondary } },
      left: { style: "thin", color: { argb: "FF" + scheme.secondary } },
      right: { style: "thin", color: { argb: "FF" + scheme.secondary } },
    };
  }
  headerRow.height = 25;
}

function styleDataRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  scheme: ColorScheme,
  cols: number,
  isAlt: boolean
) {
  const dataRow = sheet.getRow(row);
  for (let col = 1; col <= cols; col++) {
    const cell = dataRow.getCell(col);
    if (isAlt) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF" + scheme.light },
      };
    }
    cell.font = { color: { argb: "FF" + scheme.text }, size: 10 };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
    };
  }
}

function addTitleRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  title: string,
  scheme: ColorScheme,
  mergeCols: number
) {
  sheet.mergeCells(row, 1, row, mergeCols);
  const cell = sheet.getCell(row, 1);
  cell.value = title;
  cell.font = {
    bold: true,
    size: 16,
    color: { argb: "FF" + scheme.primary },
  };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(row).height = 35;
}

function styleSectionHeader(
  sheet: ExcelJS.Worksheet,
  row: number,
  col: number,
  text: string,
  scheme: ColorScheme,
  mergeCols: number
) {
  if (mergeCols > 1) {
    sheet.mergeCells(row, col, row, col + mergeCols - 1);
  }
  const cell = sheet.getCell(row, col);
  cell.value = text;
  cell.font = {
    bold: true,
    size: 12,
    color: { argb: "FF" + scheme.accent },
  };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF" + scheme.light },
  };
  cell.alignment = { vertical: "middle" };
  sheet.getRow(row).height = 28;
}

function styleTotalRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  scheme: ColorScheme,
  cols: number
) {
  const dataRow = sheet.getRow(row);
  for (let col = 1; col <= cols; col++) {
    const cell = dataRow.getCell(col);
    cell.font = {
      bold: true,
      color: { argb: "FF" + scheme.primary },
      size: 11,
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF" + scheme.light },
    };
    cell.border = {
      top: { style: "medium", color: { argb: "FF" + scheme.primary } },
      bottom: { style: "medium", color: { argb: "FF" + scheme.primary } },
    };
  }
  dataRow.height = 24;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function applySheetDefaults(sheet: ExcelJS.Worksheet) {
  sheet.properties.defaultRowHeight = 20;
}

// ---------------------------------------------------------------------------
// 1. BUDGET TRACKER
// ---------------------------------------------------------------------------

function generateBudgetTracker(workbook: ExcelJS.Workbook, scheme: ColorScheme) {
  const incomeCategories = ["Salary", "Freelance", "Side Income", "Other"];
  const expenseCategories = [
    "Housing",
    "Utilities",
    "Groceries",
    "Transportation",
    "Insurance",
    "Phone/Internet",
    "Entertainment",
    "Clothing",
    "Health",
    "Subscriptions",
    "Dining Out",
    "Personal",
    "Education",
    "Other",
  ];

  // --- Monthly sheets (Jan-Dec) ---
  for (let m = 0; m < 12; m++) {
    const monthName = MONTHS[m];
    const sheet = workbook.addWorksheet(monthName);
    applySheetDefaults(sheet);

    sheet.columns = [
      { width: 22 }, // A - Category
      { width: 16 }, // B - Planned
      { width: 16 }, // C - Actual
      { width: 16 }, // D - Difference
    ];

    // Title
    addTitleRow(sheet, 1, `${monthName.toUpperCase()} 2025`, scheme, 4);

    // --- INCOME SECTION ---
    let r = 3;
    styleSectionHeader(sheet, r, 1, "INCOME", scheme, 4);
    r++;
    sheet.getRow(r).values = ["Category", "Planned ($)", "Actual ($)", "Difference ($)"];
    styleHeaderRow(sheet, r, scheme, 4);
    const incomeHeaderRow = r;
    r++;

    const incomeStartRow = r;
    for (let i = 0; i < incomeCategories.length; i++) {
      sheet.getCell(r, 1).value = incomeCategories[i];
      sheet.getCell(r, 2).numFmt = "$#,##0.00";
      sheet.getCell(r, 3).numFmt = "$#,##0.00";
      sheet.getCell(r, 4).value = { formula: `C${r}-B${r}` } as ExcelJS.CellFormulaValue;
      sheet.getCell(r, 4).numFmt = "$#,##0.00";
      styleDataRow(sheet, r, scheme, 4, i % 2 === 1);
      r++;
    }
    const incomeEndRow = r - 1;

    // Income Total
    sheet.getCell(r, 1).value = "TOTAL INCOME";
    sheet.getCell(r, 2).value = { formula: `SUM(B${incomeStartRow}:B${incomeEndRow})` } as ExcelJS.CellFormulaValue;
    sheet.getCell(r, 2).numFmt = "$#,##0.00";
    sheet.getCell(r, 3).value = { formula: `SUM(C${incomeStartRow}:C${incomeEndRow})` } as ExcelJS.CellFormulaValue;
    sheet.getCell(r, 3).numFmt = "$#,##0.00";
    sheet.getCell(r, 4).value = { formula: `C${r}-B${r}` } as ExcelJS.CellFormulaValue;
    sheet.getCell(r, 4).numFmt = "$#,##0.00";
    styleTotalRow(sheet, r, scheme, 4);
    const incomeTotalRow = r;
    r += 2;

    // --- EXPENSES SECTION ---
    styleSectionHeader(sheet, r, 1, "EXPENSES", scheme, 4);
    r++;
    sheet.getRow(r).values = ["Category", "Planned ($)", "Actual ($)", "Difference ($)"];
    styleHeaderRow(sheet, r, scheme, 4);
    r++;

    const expStartRow = r;
    for (let i = 0; i < expenseCategories.length; i++) {
      sheet.getCell(r, 1).value = expenseCategories[i];
      sheet.getCell(r, 2).numFmt = "$#,##0.00";
      sheet.getCell(r, 3).numFmt = "$#,##0.00";
      sheet.getCell(r, 4).value = { formula: `B${r}-C${r}` } as ExcelJS.CellFormulaValue;
      sheet.getCell(r, 4).numFmt = "$#,##0.00";
      styleDataRow(sheet, r, scheme, 4, i % 2 === 1);
      r++;
    }
    const expEndRow = r - 1;

    // Expenses Total
    sheet.getCell(r, 1).value = "TOTAL EXPENSES";
    sheet.getCell(r, 2).value = { formula: `SUM(B${expStartRow}:B${expEndRow})` } as ExcelJS.CellFormulaValue;
    sheet.getCell(r, 2).numFmt = "$#,##0.00";
    sheet.getCell(r, 3).value = { formula: `SUM(C${expStartRow}:C${expEndRow})` } as ExcelJS.CellFormulaValue;
    sheet.getCell(r, 3).numFmt = "$#,##0.00";
    sheet.getCell(r, 4).value = { formula: `B${r}-C${r}` } as ExcelJS.CellFormulaValue;
    sheet.getCell(r, 4).numFmt = "$#,##0.00";
    styleTotalRow(sheet, r, scheme, 4);
    const expTotalRow = r;
    r += 2;

    // NET SAVINGS
    styleSectionHeader(sheet, r, 1, "NET SAVINGS", scheme, 4);
    r++;
    sheet.getCell(r, 1).value = "Net Savings (Planned)";
    sheet.getCell(r, 2).value = { formula: `B${incomeTotalRow}-B${expTotalRow}` } as ExcelJS.CellFormulaValue;
    sheet.getCell(r, 2).numFmt = "$#,##0.00";
    styleDataRow(sheet, r, scheme, 2, false);
    r++;
    sheet.getCell(r, 1).value = "Net Savings (Actual)";
    sheet.getCell(r, 2).value = { formula: `C${incomeTotalRow}-C${expTotalRow}` } as ExcelJS.CellFormulaValue;
    sheet.getCell(r, 2).numFmt = "$#,##0.00";
    styleDataRow(sheet, r, scheme, 2, true);

    // Frozen panes & auto-filter
    sheet.views = [{ state: "frozen", xSplit: 0, ySplit: incomeHeaderRow }];
    sheet.autoFilter = {
      from: { row: incomeHeaderRow, column: 1 },
      to: { row: incomeHeaderRow, column: 4 },
    };
  }

  // --- Dashboard sheet (added after monthly sheets, reordered to first at end) ---
  const dashboard = workbook.addWorksheet("Dashboard", {
    properties: { defaultRowHeight: 20 },
  });
  applySheetDefaults(dashboard);

  dashboard.columns = [
    { width: 18 }, // A - Month
    { width: 16 }, // B - Income
    { width: 16 }, // C - Expenses
    { width: 16 }, // D - Net
    { width: 16 }, // E - Savings Rate %
  ];

  addTitleRow(dashboard, 1, "BUDGET TRACKER 2025", scheme, 5);

  // Summary section
  let dr = 3;
  styleSectionHeader(dashboard, dr, 1, "ANNUAL OVERVIEW", scheme, 5);
  dr++;

  dashboard.getCell(dr, 1).value = "Total Income";
  dashboard.getCell(dr, 1).font = { bold: true, color: { argb: "FF" + scheme.text }, size: 11 };
  dashboard.getCell(dr, 2).value = { formula: `SUM(B${dr + 4}:B${dr + 15})` } as ExcelJS.CellFormulaValue;
  dashboard.getCell(dr, 2).numFmt = "$#,##0.00";
  dashboard.getCell(dr, 2).font = { bold: true, color: { argb: "FF" + scheme.accent }, size: 12 };
  dr++;
  dashboard.getCell(dr, 1).value = "Total Expenses";
  dashboard.getCell(dr, 1).font = { bold: true, color: { argb: "FF" + scheme.text }, size: 11 };
  dashboard.getCell(dr, 2).value = { formula: `SUM(C${dr + 3}:C${dr + 14})` } as ExcelJS.CellFormulaValue;
  dashboard.getCell(dr, 2).numFmt = "$#,##0.00";
  dashboard.getCell(dr, 2).font = { bold: true, color: { argb: "FF" + scheme.accent }, size: 12 };
  dr++;
  dashboard.getCell(dr, 1).value = "Net Savings";
  dashboard.getCell(dr, 1).font = { bold: true, color: { argb: "FF" + scheme.text }, size: 11 };
  dashboard.getCell(dr, 2).value = { formula: `B${dr - 2}-B${dr - 1}` } as ExcelJS.CellFormulaValue;
  dashboard.getCell(dr, 2).numFmt = "$#,##0.00";
  dashboard.getCell(dr, 2).font = { bold: true, color: { argb: "FF" + scheme.accent }, size: 12 };
  dr += 2;

  // Monthly comparison table
  const dashHeaderRow = dr;
  dashboard.getRow(dr).values = ["Month", "Income", "Expenses", "Net", "Savings Rate %"];
  styleHeaderRow(dashboard, dr, scheme, 5);
  dr++;

  // We need to figure out the income/expense total rows in each monthly sheet.
  // Based on our layout: incomeTotalRow = 8 (row 5 header + 4 items + total = row 9? Let's compute)
  // Row 1 title, 2 blank, 3 section header, 4 header, 5-8 income items, 9 total
  // That means income total is always row 9, expense total is row 26
  // Let me recount: r starts at 3 for section header, 4 for header, 5 for first item
  // 4 items: rows 5,6,7,8 -> incomeEndRow=8, total at row 9
  // r=9 total, r=11 expense section header, r=12 expense header, 13-26 expense items (14 items), total at 27
  // So: incomeTotalRow = 9, expTotalRow = 27
  const mIncomeTotal = 9;
  const mExpTotal = 27;

  for (let m = 0; m < 12; m++) {
    const monthSheet = `'${MONTHS[m]}'`;
    dashboard.getCell(dr, 1).value = MONTHS[m];
    dashboard.getCell(dr, 2).value = { formula: `${monthSheet}!C${mIncomeTotal}` } as ExcelJS.CellFormulaValue;
    dashboard.getCell(dr, 2).numFmt = "$#,##0.00";
    dashboard.getCell(dr, 3).value = { formula: `${monthSheet}!C${mExpTotal}` } as ExcelJS.CellFormulaValue;
    dashboard.getCell(dr, 3).numFmt = "$#,##0.00";
    dashboard.getCell(dr, 4).value = { formula: `B${dr}-C${dr}` } as ExcelJS.CellFormulaValue;
    dashboard.getCell(dr, 4).numFmt = "$#,##0.00";
    dashboard.getCell(dr, 5).value = {
      formula: `IF(B${dr}=0,0,D${dr}/B${dr}*100)`,
    } as ExcelJS.CellFormulaValue;
    dashboard.getCell(dr, 5).numFmt = "0.0";
    styleDataRow(dashboard, dr, scheme, 5, m % 2 === 1);
    dr++;
  }

  // Annual totals
  dashboard.getCell(dr, 1).value = "ANNUAL TOTAL";
  dashboard.getCell(dr, 2).value = { formula: `SUM(B${dashHeaderRow + 1}:B${dr - 1})` } as ExcelJS.CellFormulaValue;
  dashboard.getCell(dr, 2).numFmt = "$#,##0.00";
  dashboard.getCell(dr, 3).value = { formula: `SUM(C${dashHeaderRow + 1}:C${dr - 1})` } as ExcelJS.CellFormulaValue;
  dashboard.getCell(dr, 3).numFmt = "$#,##0.00";
  dashboard.getCell(dr, 4).value = { formula: `B${dr}-C${dr}` } as ExcelJS.CellFormulaValue;
  dashboard.getCell(dr, 4).numFmt = "$#,##0.00";
  dashboard.getCell(dr, 5).value = {
    formula: `IF(B${dr}=0,0,D${dr}/B${dr}*100)`,
  } as ExcelJS.CellFormulaValue;
  dashboard.getCell(dr, 5).numFmt = "0.0";
  styleTotalRow(dashboard, dr, scheme, 5);
  dr++;

  dashboard.getCell(dr, 1).value = "Monthly Average";
  dashboard.getCell(dr, 2).value = { formula: `B${dr - 1}/12` } as ExcelJS.CellFormulaValue;
  dashboard.getCell(dr, 2).numFmt = "$#,##0.00";
  dashboard.getCell(dr, 3).value = { formula: `C${dr - 1}/12` } as ExcelJS.CellFormulaValue;
  dashboard.getCell(dr, 3).numFmt = "$#,##0.00";
  dashboard.getCell(dr, 4).value = { formula: `D${dr - 1}/12` } as ExcelJS.CellFormulaValue;
  dashboard.getCell(dr, 4).numFmt = "$#,##0.00";
  styleDataRow(dashboard, dr, scheme, 5, false);

  dashboard.views = [{ state: "frozen", xSplit: 0, ySplit: dashHeaderRow }];
  dashboard.autoFilter = {
    from: { row: dashHeaderRow, column: 1 },
    to: { row: dashHeaderRow, column: 5 },
  };

  // --- Annual Summary sheet ---
  const annual = workbook.addWorksheet("Annual Summary");
  applySheetDefaults(annual);
  annual.columns = [
    { width: 18 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ];

  addTitleRow(annual, 1, "ANNUAL SUMMARY 2025", scheme, 5);

  let ar = 3;
  annual.getRow(ar).values = ["Month", "Income", "Expenses", "Savings", "Savings Rate %"];
  styleHeaderRow(annual, ar, scheme, 5);
  const annualHeaderRow = ar;
  ar++;

  for (let m = 0; m < 12; m++) {
    const monthSheet = `'${MONTHS[m]}'`;
    annual.getCell(ar, 1).value = MONTHS[m];
    annual.getCell(ar, 2).value = { formula: `${monthSheet}!C${mIncomeTotal}` } as ExcelJS.CellFormulaValue;
    annual.getCell(ar, 2).numFmt = "$#,##0.00";
    annual.getCell(ar, 3).value = { formula: `${monthSheet}!C${mExpTotal}` } as ExcelJS.CellFormulaValue;
    annual.getCell(ar, 3).numFmt = "$#,##0.00";
    annual.getCell(ar, 4).value = { formula: `B${ar}-C${ar}` } as ExcelJS.CellFormulaValue;
    annual.getCell(ar, 4).numFmt = "$#,##0.00";
    annual.getCell(ar, 5).value = { formula: `IF(B${ar}=0,0,D${ar}/B${ar}*100)` } as ExcelJS.CellFormulaValue;
    annual.getCell(ar, 5).numFmt = "0.0";
    styleDataRow(annual, ar, scheme, 5, m % 2 === 1);
    ar++;
  }

  annual.getCell(ar, 1).value = "ANNUAL TOTAL";
  annual.getCell(ar, 2).value = { formula: `SUM(B${annualHeaderRow + 1}:B${ar - 1})` } as ExcelJS.CellFormulaValue;
  annual.getCell(ar, 2).numFmt = "$#,##0.00";
  annual.getCell(ar, 3).value = { formula: `SUM(C${annualHeaderRow + 1}:C${ar - 1})` } as ExcelJS.CellFormulaValue;
  annual.getCell(ar, 3).numFmt = "$#,##0.00";
  annual.getCell(ar, 4).value = { formula: `SUM(D${annualHeaderRow + 1}:D${ar - 1})` } as ExcelJS.CellFormulaValue;
  annual.getCell(ar, 4).numFmt = "$#,##0.00";
  annual.getCell(ar, 5).value = { formula: `IF(B${ar}=0,0,D${ar}/B${ar}*100)` } as ExcelJS.CellFormulaValue;
  annual.getCell(ar, 5).numFmt = "0.0";
  styleTotalRow(annual, ar, scheme, 5);
  ar++;

  annual.getCell(ar, 1).value = "Average Monthly Savings";
  annual.getCell(ar, 2).value = { formula: `D${ar - 1}/12` } as ExcelJS.CellFormulaValue;
  annual.getCell(ar, 2).numFmt = "$#,##0.00";
  styleDataRow(annual, ar, scheme, 2, false);

  annual.views = [{ state: "frozen", xSplit: 0, ySplit: annualHeaderRow }];
  annual.autoFilter = {
    from: { row: annualHeaderRow, column: 1 },
    to: { row: annualHeaderRow, column: 5 },
  };

  // --- Savings Goals sheet ---
  const goals = workbook.addWorksheet("Savings Goals");
  applySheetDefaults(goals);
  goals.columns = [
    { width: 24 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
  ];

  addTitleRow(goals, 1, "SAVINGS GOALS", scheme, 5);

  goals.getRow(3).values = [
    "Goal Name",
    "Target Amount",
    "Current Amount",
    "Remaining",
    "Progress %",
  ];
  styleHeaderRow(goals, 3, scheme, 5);

  for (let i = 0; i < 10; i++) {
    const r = 4 + i;
    goals.getCell(r, 2).numFmt = "$#,##0.00";
    goals.getCell(r, 3).numFmt = "$#,##0.00";
    goals.getCell(r, 4).value = { formula: `B${r}-C${r}` } as ExcelJS.CellFormulaValue;
    goals.getCell(r, 4).numFmt = "$#,##0.00";
    goals.getCell(r, 5).value = {
      formula: `IF(B${r}=0,0,C${r}/B${r}*100)`,
    } as ExcelJS.CellFormulaValue;
    goals.getCell(r, 5).numFmt = "0.0";
    styleDataRow(goals, r, scheme, 5, i % 2 === 1);
  }

  goals.views = [{ state: "frozen", xSplit: 0, ySplit: 3 }];
  goals.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: 5 },
  };

  // Reorder sheets: move Dashboard to first position
  // ExcelJS orderNo approach: set the orderNo properties
  const allSheets = workbook.worksheets;
  const dashSheet = allSheets.find((s) => s.name === "Dashboard");
  if (dashSheet) {
    // Remove and re-add at beginning by reordering
    // ExcelJS uses worksheet ordering by array index
    const idx = allSheets.indexOf(dashSheet);
    if (idx > 0) {
      allSheets.splice(idx, 1);
      allSheets.unshift(dashSheet);
      allSheets.forEach((s, i) => {
        (s as unknown as Record<string, number>).orderNo = i;
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 2. HABIT TRACKER
// ---------------------------------------------------------------------------

function generateHabitTracker(workbook: ExcelJS.Workbook, scheme: ColorScheme) {
  // --- Instructions sheet ---
  const instr = workbook.addWorksheet("Instructions");
  applySheetDefaults(instr);
  instr.columns = [{ width: 60 }];

  addTitleRow(instr, 1, "HABIT TRACKER - INSTRUCTIONS", scheme, 1);

  const instructions = [
    "Welcome to your Habit Tracker!",
    "",
    "HOW TO USE:",
    '1. Navigate to the monthly tab for the current month.',
    '2. Enter your habit names in column A (rows 3-22).',
    '3. Each day, mark completed habits with a checkmark symbol.',
    '4. The Streak and Completion % columns update automatically.',
    "",
    "TIPS:",
    "- Start with 3-5 habits and build up gradually.",
    "- Be specific: \"Run 2 miles\" instead of \"Exercise\".",
    "- Review your Annual Summary tab monthly for trends.",
    "",
    'Use the check mark character: type the letter v or paste the symbol.',
  ];
  instructions.forEach((text, i) => {
    const r = 3 + i;
    instr.getCell(r, 1).value = text;
    instr.getCell(r, 1).font = {
      size: text.startsWith("HOW") || text.startsWith("TIPS") ? 12 : 10,
      bold: text.startsWith("HOW") || text.startsWith("TIPS"),
      color: { argb: "FF" + scheme.text },
    };
  });

  // --- Monthly sheets ---
  for (let m = 0; m < 12; m++) {
    const monthName = MONTHS[m];
    const days = DAYS_IN_MONTH[m];
    const sheet = workbook.addWorksheet(monthName);
    applySheetDefaults(sheet);

    // Column widths
    const cols: Partial<ExcelJS.Column>[] = [{ width: 25, key: "habit" }];
    for (let d = 1; d <= 31; d++) {
      cols.push({ width: 4 });
    }
    cols.push({ width: 10 }); // Streak (col 33 = AG)
    cols.push({ width: 12 }); // Completion % (col 34 = AH)
    sheet.columns = cols;

    // Title row
    const totalCols = 34;
    addTitleRow(sheet, 1, `${monthName.toUpperCase()} 2025 - HABIT TRACKER`, scheme, totalCols);

    // Header row
    const headers: string[] = ["Habit"];
    for (let d = 1; d <= 31; d++) {
      headers.push(String(d));
    }
    headers.push("Streak");
    headers.push("Completion %");
    sheet.getRow(2).values = headers;
    styleHeaderRow(sheet, 2, scheme, totalCols);

    // Habit rows (3-22)
    for (let h = 0; h < 20; h++) {
      const r = 3 + h;
      if (h === 0) {
        sheet.getCell(r, 1).value = "Drink 8 glasses water";
      }

      // Day columns B through AF (cols 2-32)
      // Cells left blank for user input

      // Streak column (AG = col 33) - count consecutive checks from end
      // Using a simplified formula: count non-blank cells
      const lastDayCol = String.fromCharCode(65 + Math.min(days, 26));
      // For days > 26 we need AA, AB etc. Let's use column letter helper
      const startColLetter = "B";
      const endColLetter = getColLetter(1 + days); // col 2 is B, col 2+days-1

      sheet.getCell(r, 33).value = {
        formula: `COUNTIF(B${r}:${endColLetter}${r},"<>")`,
      } as ExcelJS.CellFormulaValue;
      sheet.getCell(r, 33).numFmt = "0";

      // Completion % column (AH = col 34)
      sheet.getCell(r, 34).value = {
        formula: `IF(${days}=0,0,COUNTIF(B${r}:${endColLetter}${r},"<>")*100/${days})`,
      } as ExcelJS.CellFormulaValue;
      sheet.getCell(r, 34).numFmt = "0.0";

      styleDataRow(sheet, r, scheme, totalCols, h % 2 === 1);
    }

    // Daily Total row (row 24)
    const totalRowNum = 24;
    sheet.getCell(totalRowNum, 1).value = "DAILY TOTAL";
    for (let d = 1; d <= 31; d++) {
      const col = 1 + d;
      const colLetter = getColLetter(col);
      sheet.getCell(totalRowNum, col).value = {
        formula: `COUNTIF(${colLetter}3:${colLetter}22,"<>")`,
      } as ExcelJS.CellFormulaValue;
      sheet.getCell(totalRowNum, col).numFmt = "0";
    }
    styleTotalRow(sheet, totalRowNum, scheme, totalCols);

    // Freeze header
    sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 2 }];
    sheet.autoFilter = {
      from: { row: 2, column: 1 },
      to: { row: 2, column: totalCols },
    };
  }

  // --- Annual Summary ---
  const summary = workbook.addWorksheet("Annual Summary");
  applySheetDefaults(summary);
  summary.columns = [{ width: 25 }];
  for (let m = 0; m < 12; m++) {
    summary.getColumn(m + 2).width = 10;
  }
  summary.getColumn(14).width = 10; // Avg column

  addTitleRow(summary, 1, "ANNUAL HABIT SUMMARY", scheme, 14);

  const sumHeaders = ["Habit"];
  MONTH_ABBR.forEach((m) => sumHeaders.push(m + " %"));
  sumHeaders.push("Avg %");
  summary.getRow(3).values = sumHeaders;
  styleHeaderRow(summary, 3, scheme, 14);

  for (let h = 0; h < 20; h++) {
    const r = 4 + h;
    // Reference each monthly sheet's completion % for this habit row
    for (let m = 0; m < 12; m++) {
      const monthSheet = `'${MONTHS[m]}'`;
      summary.getCell(r, m + 2).value = {
        formula: `${monthSheet}!AH${3 + h}`,
      } as ExcelJS.CellFormulaValue;
      summary.getCell(r, m + 2).numFmt = "0.0";
    }
    // Average
    const startCol = getColLetter(2); // B
    const endCol = getColLetter(13); // M
    summary.getCell(r, 14).value = {
      formula: `AVERAGE(B${r}:M${r})`,
    } as ExcelJS.CellFormulaValue;
    summary.getCell(r, 14).numFmt = "0.0";
    // Reference habit name from January
    summary.getCell(r, 1).value = {
      formula: `'January'!A${3 + h}`,
    } as ExcelJS.CellFormulaValue;

    styleDataRow(summary, r, scheme, 14, h % 2 === 1);
  }

  summary.views = [{ state: "frozen", xSplit: 1, ySplit: 3 }];
  summary.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: 14 },
  };
}

// ---------------------------------------------------------------------------
// 3. FITNESS TRACKER
// ---------------------------------------------------------------------------

function generateFitnessTracker(workbook: ExcelJS.Workbook, scheme: ColorScheme) {
  const daysOfWeek = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  // --- Dashboard ---
  const dash = workbook.addWorksheet("Dashboard");
  applySheetDefaults(dash);
  dash.columns = [
    { width: 20 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ];

  addTitleRow(dash, 1, "FITNESS TRACKER 2025", scheme, 4);

  let dr = 3;
  styleSectionHeader(dash, dr, 1, "WEEKLY OVERVIEW", scheme, 4);
  dr++;
  dash.getRow(dr).values = ["Week", "Total Workouts", "Total Volume (lbs)", "Notes"];
  styleHeaderRow(dash, dr, scheme, 4);
  const dashHeader = dr;
  dr++;

  for (let w = 1; w <= 12; w++) {
    dash.getCell(dr, 1).value = `Week ${w}`;
    // Reference weekly sheet total workouts & volume
    const weekSheet = `'Week ${w}'`;
    // Total workouts = count of non-empty exercise cells
    // We'll reference a summary cell we place in each weekly sheet
    dash.getCell(dr, 2).value = {
      formula: `${weekSheet}!B50`,
    } as ExcelJS.CellFormulaValue;
    dash.getCell(dr, 2).numFmt = "0";
    dash.getCell(dr, 3).value = {
      formula: `${weekSheet}!B51`,
    } as ExcelJS.CellFormulaValue;
    dash.getCell(dr, 3).numFmt = "#,##0";
    styleDataRow(dash, dr, scheme, 4, w % 2 === 0);
    dr++;
  }

  dash.views = [{ state: "frozen", xSplit: 0, ySplit: dashHeader }];
  dash.autoFilter = {
    from: { row: dashHeader, column: 1 },
    to: { row: dashHeader, column: 4 },
  };

  // --- Weekly Log sheets (1-12) ---
  for (let w = 1; w <= 12; w++) {
    const sheet = workbook.addWorksheet(`Week ${w}`);
    applySheetDefaults(sheet);
    sheet.columns = [
      { width: 14 }, // A - Date
      { width: 22 }, // B - Exercise
      { width: 8 },  // C - Sets
      { width: 8 },  // D - Reps
      { width: 14 }, // E - Weight (lbs)
      { width: 24 }, // F - Notes
    ];

    addTitleRow(sheet, 1, `WEEK ${w} WORKOUT LOG`, scheme, 6);

    let r = 3;
    sheet.getRow(r).values = [
      "Date",
      "Exercise",
      "Sets",
      "Reps",
      "Weight (lbs)",
      "Notes",
    ];
    styleHeaderRow(sheet, r, scheme, 6);
    const headerRow = r;
    r++;

    const exerciseStartRow = r;
    for (let d = 0; d < 7; d++) {
      // Day label
      const dayLabel = daysOfWeek[d];
      if (d === 6) {
        // Sunday = rest day
        sheet.getCell(r, 1).value = dayLabel;
        sheet.getCell(r, 1).font = {
          bold: true,
          italic: true,
          color: { argb: "FF" + scheme.accent },
          size: 10,
        };
        sheet.getCell(r, 2).value = "REST DAY";
        sheet.getCell(r, 2).font = {
          italic: true,
          color: { argb: "FF" + scheme.secondary },
          size: 10,
        };
        styleDataRow(sheet, r, scheme, 6, true);
        r++;
      } else {
        // 6 exercise rows per day
        for (let e = 0; e < 6; e++) {
          if (e === 0) {
            sheet.getCell(r, 1).value = dayLabel;
            sheet.getCell(r, 1).font = {
              bold: true,
              color: { argb: "FF" + scheme.accent },
              size: 10,
            };
          }
          sheet.getCell(r, 3).numFmt = "0";
          sheet.getCell(r, 4).numFmt = "0";
          sheet.getCell(r, 5).numFmt = "#,##0";
          styleDataRow(sheet, r, scheme, 6, d % 2 === 1);
          r++;
        }
      }
    }
    const exerciseEndRow = r - 1;

    // Weekly Summary
    r += 1;
    styleSectionHeader(sheet, r, 1, "WEEKLY SUMMARY", scheme, 6);
    r++;
    sheet.getCell(r, 1).value = "Total Workouts";
    sheet.getCell(r, 2).value = {
      formula: `COUNTA(B${exerciseStartRow}:B${exerciseEndRow})-1`,
    } as ExcelJS.CellFormulaValue;
    // -1 to exclude REST DAY text
    styleDataRow(sheet, r, scheme, 2, false);
    r++;
    sheet.getCell(r, 1).value = "Total Volume";
    sheet.getCell(r, 2).value = {
      formula: `SUMPRODUCT(C${exerciseStartRow}:C${exerciseEndRow},D${exerciseStartRow}:D${exerciseEndRow},E${exerciseStartRow}:E${exerciseEndRow})`,
    } as ExcelJS.CellFormulaValue;
    sheet.getCell(r, 2).numFmt = "#,##0";
    styleDataRow(sheet, r, scheme, 2, true);

    // Place summary values in row 50-51 for dashboard reference
    sheet.getCell(50, 2).value = {
      formula: `COUNTA(B${exerciseStartRow}:B${exerciseEndRow})-1`,
    } as ExcelJS.CellFormulaValue;
    sheet.getCell(51, 2).value = {
      formula: `SUMPRODUCT(C${exerciseStartRow}:C${exerciseEndRow},D${exerciseStartRow}:D${exerciseEndRow},E${exerciseStartRow}:E${exerciseEndRow})`,
    } as ExcelJS.CellFormulaValue;
    // Hide these reference cells with white font
    sheet.getCell(50, 1).value = "ref_workouts";
    sheet.getCell(51, 1).value = "ref_volume";
    sheet.getCell(50, 1).font = { color: { argb: "FFFFFFFF" }, size: 1 };
    sheet.getCell(50, 2).font = { color: { argb: "FFFFFFFF" }, size: 1 };
    sheet.getCell(51, 1).font = { color: { argb: "FFFFFFFF" }, size: 1 };
    sheet.getCell(51, 2).font = { color: { argb: "FFFFFFFF" }, size: 1 };

    sheet.views = [{ state: "frozen", xSplit: 0, ySplit: headerRow }];
    sheet.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: headerRow, column: 6 },
    };
  }

  // --- Body Measurements ---
  const body = workbook.addWorksheet("Body Measurements");
  applySheetDefaults(body);
  body.columns = [
    { width: 14 }, // Date
    { width: 12 }, // Weight
    { width: 12 }, // Body Fat%
    { width: 10 }, // Chest
    { width: 10 }, // Waist
    { width: 10 }, // Hips
    { width: 10 }, // Arms
    { width: 10 }, // Thighs
  ];

  addTitleRow(body, 1, "BODY MEASUREMENTS", scheme, 8);
  body.getRow(3).values = [
    "Date",
    "Weight (lbs)",
    "Body Fat %",
    "Chest (in)",
    "Waist (in)",
    "Hips (in)",
    "Arms (in)",
    "Thighs (in)",
  ];
  styleHeaderRow(body, 3, scheme, 8);

  for (let w = 0; w < 52; w++) {
    const r = 4 + w;
    body.getCell(r, 1).numFmt = "MM/DD/YYYY";
    body.getCell(r, 2).numFmt = "#,##0.0";
    body.getCell(r, 3).numFmt = "0.0";
    for (let c = 4; c <= 8; c++) {
      body.getCell(r, c).numFmt = "0.0";
    }
    styleDataRow(body, r, scheme, 8, w % 2 === 1);
  }

  body.views = [{ state: "frozen", xSplit: 0, ySplit: 3 }];
  body.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: 8 },
  };

  // --- Personal Records ---
  const pr = workbook.addWorksheet("Personal Records");
  applySheetDefaults(pr);
  pr.columns = [
    { width: 24 }, // Exercise
    { width: 14 }, // PR Weight
    { width: 10 }, // PR Reps
    { width: 14 }, // Date Achieved
    { width: 14 }, // Previous PR
  ];

  addTitleRow(pr, 1, "PERSONAL RECORDS", scheme, 5);
  pr.getRow(3).values = [
    "Exercise",
    "PR Weight (lbs)",
    "PR Reps",
    "Date Achieved",
    "Previous PR (lbs)",
  ];
  styleHeaderRow(pr, 3, scheme, 5);

  const prExercises = [
    "Bench Press",
    "Squat",
    "Deadlift",
    "Overhead Press",
    "Barbell Row",
    "Pull-ups",
    "Dips",
    "Leg Press",
    "Incline Bench",
    "Front Squat",
    "Romanian Deadlift",
    "Lat Pulldown",
    "Bicep Curl",
    "Tricep Extension",
    "Leg Curl",
    "Leg Extension",
    "Calf Raise",
    "Plank (seconds)",
    "Running Mile (min)",
    "Rowing 500m (min)",
  ];

  for (let i = 0; i < 20; i++) {
    const r = 4 + i;
    pr.getCell(r, 1).value = prExercises[i];
    pr.getCell(r, 2).numFmt = "#,##0";
    pr.getCell(r, 3).numFmt = "0";
    pr.getCell(r, 4).numFmt = "MM/DD/YYYY";
    pr.getCell(r, 5).numFmt = "#,##0";
    styleDataRow(pr, r, scheme, 5, i % 2 === 1);
  }

  pr.views = [{ state: "frozen", xSplit: 0, ySplit: 3 }];
  pr.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: 5 },
  };
}

// ---------------------------------------------------------------------------
// 4. BUSINESS INCOME TRACKER
// ---------------------------------------------------------------------------

function generateBusinessTracker(
  workbook: ExcelJS.Workbook,
  scheme: ColorScheme
) {
  const expCategories = [
    "Office Rent",
    "Utilities",
    "Software/Tools",
    "Marketing/Ads",
    "Supplies",
    "Travel",
    "Insurance",
    "Professional Services",
    "Bank/Processing Fees",
    "Taxes",
    "Payroll",
    "Equipment",
    "Internet/Phone",
    "Shipping",
    "Other",
  ];

  // Track row references for dashboard
  const mRevTotalRow = 16; // Will be computed in each monthly sheet
  const mExpTotalRow = 34; // Same

  // --- Monthly P&L sheets (Jan-Dec) ---
  for (let m = 0; m < 12; m++) {
    const monthName = MONTHS[m];
    const sheet = workbook.addWorksheet(monthName);
    applySheetDefaults(sheet);
    sheet.columns = [
      { width: 24 }, // A - Category/Product
      { width: 14 }, // B - Units Sold / Amount
      { width: 14 }, // C - Unit Price
      { width: 16 }, // D - Revenue / Total
    ];

    addTitleRow(sheet, 1, `${monthName.toUpperCase()} 2025 - P&L`, scheme, 4);

    // --- REVENUE SECTION ---
    let r = 3;
    styleSectionHeader(sheet, r, 1, "REVENUE", scheme, 4);
    r++;
    sheet.getRow(r).values = [
      "Product/Service",
      "Units Sold",
      "Unit Price",
      "Revenue",
    ];
    styleHeaderRow(sheet, r, scheme, 4);
    r++;

    const revStartRow = r;
    for (let p = 0; p < 10; p++) {
      sheet.getCell(r, 2).numFmt = "0";
      sheet.getCell(r, 3).numFmt = "$#,##0.00";
      sheet.getCell(r, 4).value = { formula: `B${r}*C${r}` } as ExcelJS.CellFormulaValue;
      sheet.getCell(r, 4).numFmt = "$#,##0.00";
      styleDataRow(sheet, r, scheme, 4, p % 2 === 1);
      r++;
    }
    const revEndRow = r - 1;

    // Total Revenue
    sheet.getCell(r, 1).value = "TOTAL REVENUE";
    sheet.getCell(r, 4).value = {
      formula: `SUM(D${revStartRow}:D${revEndRow})`,
    } as ExcelJS.CellFormulaValue;
    sheet.getCell(r, 4).numFmt = "$#,##0.00";
    styleTotalRow(sheet, r, scheme, 4);
    const revTotalRow = r;
    r += 2;

    // --- EXPENSES SECTION ---
    styleSectionHeader(sheet, r, 1, "EXPENSES", scheme, 4);
    r++;
    sheet.getRow(r).values = ["Category", "Amount", "", ""];
    styleHeaderRow(sheet, r, scheme, 4);
    r++;

    const expStartRow = r;
    for (let e = 0; e < expCategories.length; e++) {
      sheet.getCell(r, 1).value = expCategories[e];
      sheet.getCell(r, 2).numFmt = "$#,##0.00";
      styleDataRow(sheet, r, scheme, 4, e % 2 === 1);
      r++;
    }
    const expEndRow = r - 1;

    // Total Expenses
    sheet.getCell(r, 1).value = "TOTAL EXPENSES";
    sheet.getCell(r, 2).value = {
      formula: `SUM(B${expStartRow}:B${expEndRow})`,
    } as ExcelJS.CellFormulaValue;
    sheet.getCell(r, 2).numFmt = "$#,##0.00";
    styleTotalRow(sheet, r, scheme, 4);
    const expTotalRow = r;
    r += 2;

    // --- NET PROFIT ---
    styleSectionHeader(sheet, r, 1, "NET PROFIT", scheme, 4);
    r++;
    sheet.getCell(r, 1).value = "Net Profit";
    sheet.getCell(r, 2).value = {
      formula: `D${revTotalRow}-B${expTotalRow}`,
    } as ExcelJS.CellFormulaValue;
    sheet.getCell(r, 2).numFmt = "$#,##0.00";
    sheet.getCell(r, 2).font = {
      bold: true,
      size: 13,
      color: { argb: "FF" + scheme.accent },
    };
    r += 2;

    // --- KEY METRICS ---
    styleSectionHeader(sheet, r, 1, "KEY METRICS", scheme, 4);
    r++;
    sheet.getCell(r, 1).value = "Total Units Sold";
    sheet.getCell(r, 2).value = {
      formula: `SUM(B${revStartRow}:B${revEndRow})`,
    } as ExcelJS.CellFormulaValue;
    sheet.getCell(r, 2).numFmt = "0";
    styleDataRow(sheet, r, scheme, 2, false);
    r++;
    sheet.getCell(r, 1).value = "Avg Order Value";
    sheet.getCell(r, 2).value = {
      formula: `IF(B${r - 1}=0,0,D${revTotalRow}/B${r - 1})`,
    } as ExcelJS.CellFormulaValue;
    sheet.getCell(r, 2).numFmt = "$#,##0.00";
    styleDataRow(sheet, r, scheme, 2, true);
    r++;
    sheet.getCell(r, 1).value = "Profit Margin %";
    sheet.getCell(r, 2).value = {
      formula: `IF(D${revTotalRow}=0,0,(D${revTotalRow}-B${expTotalRow})/D${revTotalRow}*100)`,
    } as ExcelJS.CellFormulaValue;
    sheet.getCell(r, 2).numFmt = "0.0";
    styleDataRow(sheet, r, scheme, 2, false);

    // Hidden reference cells for dashboard at row 55-57
    sheet.getCell(55, 1).value = "ref_revenue";
    sheet.getCell(55, 2).value = { formula: `D${revTotalRow}` } as ExcelJS.CellFormulaValue;
    sheet.getCell(56, 1).value = "ref_expenses";
    sheet.getCell(56, 2).value = { formula: `B${expTotalRow}` } as ExcelJS.CellFormulaValue;
    sheet.getCell(57, 1).value = "ref_profit";
    sheet.getCell(57, 2).value = { formula: `D${revTotalRow}-B${expTotalRow}` } as ExcelJS.CellFormulaValue;
    for (let rr = 55; rr <= 57; rr++) {
      sheet.getCell(rr, 1).font = { color: { argb: "FFFFFFFF" }, size: 1 };
      sheet.getCell(rr, 2).font = { color: { argb: "FFFFFFFF" }, size: 1 };
    }

    sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 4 }];
    sheet.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4, column: 4 },
    };
  }

  // --- Dashboard ---
  const dash = workbook.addWorksheet("Dashboard", {
    properties: { defaultRowHeight: 20 },
  });
  applySheetDefaults(dash);
  dash.columns = [
    { width: 18 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
  ];

  addTitleRow(dash, 1, "BUSINESS INCOME TRACKER 2025", scheme, 5);

  let dr = 3;
  styleSectionHeader(dash, dr, 1, "MONTHLY P&L OVERVIEW", scheme, 5);
  dr++;
  dash.getRow(dr).values = [
    "Month",
    "Revenue",
    "Expenses",
    "Net Profit",
    "Margin %",
  ];
  styleHeaderRow(dash, dr, scheme, 5);
  const dashHeader = dr;
  dr++;

  for (let m = 0; m < 12; m++) {
    const ms = `'${MONTHS[m]}'`;
    dash.getCell(dr, 1).value = MONTHS[m];
    dash.getCell(dr, 2).value = { formula: `${ms}!B55` } as ExcelJS.CellFormulaValue;
    dash.getCell(dr, 2).numFmt = "$#,##0.00";
    dash.getCell(dr, 3).value = { formula: `${ms}!B56` } as ExcelJS.CellFormulaValue;
    dash.getCell(dr, 3).numFmt = "$#,##0.00";
    dash.getCell(dr, 4).value = { formula: `${ms}!B57` } as ExcelJS.CellFormulaValue;
    dash.getCell(dr, 4).numFmt = "$#,##0.00";
    dash.getCell(dr, 5).value = {
      formula: `IF(B${dr}=0,0,D${dr}/B${dr}*100)`,
    } as ExcelJS.CellFormulaValue;
    dash.getCell(dr, 5).numFmt = "0.0";
    styleDataRow(dash, dr, scheme, 5, m % 2 === 0);
    dr++;
  }

  dash.getCell(dr, 1).value = "ANNUAL TOTAL";
  dash.getCell(dr, 2).value = { formula: `SUM(B${dashHeader + 1}:B${dr - 1})` } as ExcelJS.CellFormulaValue;
  dash.getCell(dr, 2).numFmt = "$#,##0.00";
  dash.getCell(dr, 3).value = { formula: `SUM(C${dashHeader + 1}:C${dr - 1})` } as ExcelJS.CellFormulaValue;
  dash.getCell(dr, 3).numFmt = "$#,##0.00";
  dash.getCell(dr, 4).value = { formula: `SUM(D${dashHeader + 1}:D${dr - 1})` } as ExcelJS.CellFormulaValue;
  dash.getCell(dr, 4).numFmt = "$#,##0.00";
  dash.getCell(dr, 5).value = {
    formula: `IF(B${dr}=0,0,D${dr}/B${dr}*100)`,
  } as ExcelJS.CellFormulaValue;
  dash.getCell(dr, 5).numFmt = "0.0";
  styleTotalRow(dash, dr, scheme, 5);

  dash.views = [{ state: "frozen", xSplit: 0, ySplit: dashHeader }];
  dash.autoFilter = {
    from: { row: dashHeader, column: 1 },
    to: { row: dashHeader, column: 5 },
  };

  // Move Dashboard to first position
  const allSheets = workbook.worksheets;
  const dashSheet = allSheets.find((s) => s.name === "Dashboard");
  if (dashSheet) {
    const idx = allSheets.indexOf(dashSheet);
    if (idx > 0) {
      allSheets.splice(idx, 1);
      allSheets.unshift(dashSheet);
      allSheets.forEach((s, i) => {
        (s as unknown as Record<string, number>).orderNo = i;
      });
    }
  }

  // --- Client Tracker ---
  const clients = workbook.addWorksheet("Client Tracker");
  applySheetDefaults(clients);
  clients.columns = [
    { width: 22 }, // Client Name
    { width: 22 }, // Contact
    { width: 20 }, // Service
    { width: 16 }, // Monthly Value
    { width: 14 }, // Start Date
    { width: 12 }, // Status
    { width: 24 }, // Notes
  ];

  addTitleRow(clients, 1, "CLIENT TRACKER", scheme, 7);
  clients.getRow(3).values = [
    "Client Name",
    "Contact",
    "Service",
    "Monthly Value",
    "Start Date",
    "Status",
    "Notes",
  ];
  styleHeaderRow(clients, 3, scheme, 7);

  for (let i = 0; i < 30; i++) {
    const r = 4 + i;
    clients.getCell(r, 4).numFmt = "$#,##0.00";
    clients.getCell(r, 5).numFmt = "MM/DD/YYYY";
    styleDataRow(clients, r, scheme, 7, i % 2 === 1);
  }

  clients.views = [{ state: "frozen", xSplit: 0, ySplit: 3 }];
  clients.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: 7 },
  };

  // --- Invoice Log ---
  const invoices = workbook.addWorksheet("Invoice Log");
  applySheetDefaults(invoices);
  invoices.columns = [
    { width: 14 }, // Invoice #
    { width: 22 }, // Client
    { width: 14 }, // Amount
    { width: 14 }, // Date Sent
    { width: 14 }, // Date Due
    { width: 14 }, // Date Paid
    { width: 12 }, // Status
  ];

  addTitleRow(invoices, 1, "INVOICE LOG", scheme, 7);
  invoices.getRow(3).values = [
    "Invoice #",
    "Client",
    "Amount",
    "Date Sent",
    "Date Due",
    "Date Paid",
    "Status",
  ];
  styleHeaderRow(invoices, 3, scheme, 7);

  for (let i = 0; i < 50; i++) {
    const r = 4 + i;
    invoices.getCell(r, 3).numFmt = "$#,##0.00";
    invoices.getCell(r, 4).numFmt = "MM/DD/YYYY";
    invoices.getCell(r, 5).numFmt = "MM/DD/YYYY";
    invoices.getCell(r, 6).numFmt = "MM/DD/YYYY";
    styleDataRow(invoices, r, scheme, 7, i % 2 === 1);
  }

  // Add a note about statuses
  const noteRow = 55;
  invoices.getCell(noteRow, 1).value = "Status values: Paid, Pending, Overdue";
  invoices.getCell(noteRow, 1).font = {
    italic: true,
    color: { argb: "FF" + scheme.secondary },
    size: 9,
  };

  invoices.views = [{ state: "frozen", xSplit: 0, ySplit: 3 }];
  invoices.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: 7 },
  };
}

// ---------------------------------------------------------------------------
// 5. MEAL PLANNER + SHOPPING LIST
// ---------------------------------------------------------------------------

function generateMealPlanner(workbook: ExcelJS.Workbook, scheme: ColorScheme) {
  const daysOfWeek = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  const meals = ["Breakfast", "Snack 1", "Lunch", "Snack 2", "Dinner"];
  const categories = [
    "Produce",
    "Dairy",
    "Meat",
    "Grains",
    "Frozen",
    "Pantry",
    "Other",
  ];

  // --- Weekly Plan sheets (1-4) ---
  for (let w = 1; w <= 4; w++) {
    const sheet = workbook.addWorksheet(`Week ${w} Plan`);
    applySheetDefaults(sheet);
    sheet.columns = [
      { width: 14 }, // Meal
      { width: 18 }, // Monday
      { width: 18 }, // Tuesday
      { width: 18 }, // Wednesday
      { width: 18 }, // Thursday
      { width: 18 }, // Friday
      { width: 18 }, // Saturday
      { width: 18 }, // Sunday
    ];

    addTitleRow(sheet, 1, `WEEK ${w} MEAL PLAN`, scheme, 8);

    const headers = ["Meal", ...daysOfWeek];
    sheet.getRow(3).values = headers;
    styleHeaderRow(sheet, 3, scheme, 8);

    // Meal rows
    for (let m = 0; m < meals.length; m++) {
      const r = 4 + m;
      sheet.getCell(r, 1).value = meals[m];
      sheet.getCell(r, 1).font = {
        bold: true,
        color: { argb: "FF" + scheme.accent },
        size: 10,
      };
      styleDataRow(sheet, r, scheme, 8, m % 2 === 1);
      sheet.getRow(r).height = 28;
    }

    // Spacing
    let r = 4 + meals.length + 1;

    // Calorie Targets
    sheet.getCell(r, 1).value = "Calorie Target";
    sheet.getCell(r, 1).font = {
      bold: true,
      color: { argb: "FF" + scheme.primary },
      size: 10,
    };
    for (let d = 2; d <= 8; d++) {
      sheet.getCell(r, d).numFmt = "#,##0";
    }
    styleDataRow(sheet, r, scheme, 8, false);
    r++;

    // Calories Actual
    sheet.getCell(r, 1).value = "Calories Actual";
    sheet.getCell(r, 1).font = {
      bold: true,
      color: { argb: "FF" + scheme.primary },
      size: 10,
    };
    for (let d = 2; d <= 8; d++) {
      sheet.getCell(r, d).numFmt = "#,##0";
    }
    styleDataRow(sheet, r, scheme, 8, true);
    r++;

    // Water Intake
    sheet.getCell(r, 1).value = "Water (glasses)";
    sheet.getCell(r, 1).font = {
      bold: true,
      color: { argb: "FF" + scheme.primary },
      size: 10,
    };
    for (let d = 2; d <= 8; d++) {
      sheet.getCell(r, d).numFmt = "0";
    }
    styleDataRow(sheet, r, scheme, 8, false);

    sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 3 }];
    sheet.autoFilter = {
      from: { row: 3, column: 1 },
      to: { row: 3, column: 8 },
    };
  }

  // --- Shopping List sheets (1-4) ---
  for (let w = 1; w <= 4; w++) {
    const sheet = workbook.addWorksheet(`Shopping List ${w}`);
    applySheetDefaults(sheet);
    sheet.columns = [
      { width: 24 }, // Item
      { width: 14 }, // Category
      { width: 10 }, // Quantity
      { width: 10 }, // Unit
      { width: 16 }, // Estimated Cost
      { width: 10 }, // Bought
    ];

    addTitleRow(sheet, 1, `WEEK ${w} SHOPPING LIST`, scheme, 6);

    sheet.getRow(3).values = [
      "Item",
      "Category",
      "Quantity",
      "Unit",
      "Estimated Cost",
      "Bought",
    ];
    styleHeaderRow(sheet, 3, scheme, 6);

    for (let i = 0; i < 40; i++) {
      const r = 4 + i;
      sheet.getCell(r, 5).numFmt = "$#,##0.00";
      styleDataRow(sheet, r, scheme, 6, i % 2 === 1);
    }

    // Estimated Total
    const totalRow = 45;
    sheet.getCell(totalRow, 1).value = "ESTIMATED TOTAL";
    sheet.getCell(totalRow, 5).value = {
      formula: `SUM(E4:E43)`,
    } as ExcelJS.CellFormulaValue;
    sheet.getCell(totalRow, 5).numFmt = "$#,##0.00";
    styleTotalRow(sheet, totalRow, scheme, 6);

    // Note about categories
    const noteRow = 47;
    sheet.getCell(noteRow, 1).value =
      "Categories: Produce, Dairy, Meat, Grains, Frozen, Pantry, Other";
    sheet.getCell(noteRow, 1).font = {
      italic: true,
      color: { argb: "FF" + scheme.secondary },
      size: 9,
    };

    sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 3 }];
    sheet.autoFilter = {
      from: { row: 3, column: 1 },
      to: { row: 3, column: 6 },
    };
  }

  // --- Pantry Inventory ---
  const pantry = workbook.addWorksheet("Pantry Inventory");
  applySheetDefaults(pantry);
  pantry.columns = [
    { width: 24 }, // Item
    { width: 14 }, // Category
    { width: 12 }, // Quantity
    { width: 10 }, // Unit
    { width: 14 }, // Expiry Date
    { width: 12 }, // Reorder?
  ];

  addTitleRow(pantry, 1, "PANTRY INVENTORY", scheme, 6);
  pantry.getRow(3).values = [
    "Item",
    "Category",
    "Quantity",
    "Unit",
    "Expiry Date",
    "Reorder?",
  ];
  styleHeaderRow(pantry, 3, scheme, 6);

  for (let i = 0; i < 40; i++) {
    const r = 4 + i;
    pantry.getCell(r, 5).numFmt = "MM/DD/YYYY";
    styleDataRow(pantry, r, scheme, 6, i % 2 === 1);
  }

  pantry.views = [{ state: "frozen", xSplit: 0, ySplit: 3 }];
  pantry.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: 6 },
  };

  // --- Recipe Index ---
  const recipes = workbook.addWorksheet("Recipe Index");
  applySheetDefaults(recipes);
  recipes.columns = [
    { width: 24 }, // Recipe Name
    { width: 14 }, // Category
    { width: 10 }, // Servings
    { width: 12 }, // Prep Time
    { width: 12 }, // Cook Time
    { width: 12 }, // Calories
    { width: 30 }, // Ingredients
    { width: 14 }, // Source/Link
  ];

  addTitleRow(recipes, 1, "RECIPE INDEX", scheme, 8);
  recipes.getRow(3).values = [
    "Recipe Name",
    "Category",
    "Servings",
    "Prep Time",
    "Cook Time",
    "Calories",
    "Key Ingredients",
    "Source/Link",
  ];
  styleHeaderRow(recipes, 3, scheme, 8);

  for (let i = 0; i < 30; i++) {
    const r = 4 + i;
    recipes.getCell(r, 3).numFmt = "0";
    recipes.getCell(r, 6).numFmt = "#,##0";
    styleDataRow(recipes, r, scheme, 8, i % 2 === 1);
  }

  recipes.views = [{ state: "frozen", xSplit: 0, ySplit: 3 }];
  recipes.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: 8 },
  };
}

// ---------------------------------------------------------------------------
// 6. PROJECT TRACKER
// ---------------------------------------------------------------------------

function generateProjectTracker(
  workbook: ExcelJS.Workbook,
  scheme: ColorScheme
) {
  // --- Dashboard ---
  const dash = workbook.addWorksheet("Dashboard");
  applySheetDefaults(dash);
  dash.columns = [
    { width: 22 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ];

  addTitleRow(dash, 1, "PROJECT TRACKER DASHBOARD", scheme, 4);

  let dr = 3;
  styleSectionHeader(dash, dr, 1, "PORTFOLIO SUMMARY", scheme, 4);
  dr++;

  dash.getCell(dr, 1).value = "Total Active Projects";
  dash.getCell(dr, 1).font = { bold: true, color: { argb: "FF" + scheme.text }, size: 11 };
  dash.getCell(dr, 2).value = {
    formula: `COUNTA('Active Projects'!A4:A23)`,
  } as ExcelJS.CellFormulaValue;
  dr++;

  dash.getCell(dr, 1).value = "Total Budget";
  dash.getCell(dr, 1).font = { bold: true, color: { argb: "FF" + scheme.text }, size: 11 };
  dash.getCell(dr, 2).value = {
    formula: `SUM('Active Projects'!G4:G23)`,
  } as ExcelJS.CellFormulaValue;
  dash.getCell(dr, 2).numFmt = "$#,##0.00";
  dr++;

  dash.getCell(dr, 1).value = "Total Spent";
  dash.getCell(dr, 1).font = { bold: true, color: { argb: "FF" + scheme.text }, size: 11 };
  dash.getCell(dr, 2).value = {
    formula: `SUM('Active Projects'!H4:H23)`,
  } as ExcelJS.CellFormulaValue;
  dash.getCell(dr, 2).numFmt = "$#,##0.00";
  dr++;

  dash.getCell(dr, 1).value = "Budget Remaining";
  dash.getCell(dr, 1).font = { bold: true, color: { argb: "FF" + scheme.text }, size: 11 };
  dash.getCell(dr, 2).value = { formula: `B${dr - 2}-B${dr - 1}` } as ExcelJS.CellFormulaValue;
  dash.getCell(dr, 2).numFmt = "$#,##0.00";
  dr++;

  dash.getCell(dr, 1).value = "Average Completion";
  dash.getCell(dr, 1).font = { bold: true, color: { argb: "FF" + scheme.text }, size: 11 };
  dash.getCell(dr, 2).value = {
    formula: `AVERAGE('Active Projects'!I4:I23)`,
  } as ExcelJS.CellFormulaValue;
  dash.getCell(dr, 2).numFmt = "0.0";
  dr += 2;

  styleSectionHeader(dash, dr, 1, "TASK STATUS BREAKDOWN", scheme, 4);
  dr++;
  dash.getCell(dr, 1).value = "To Do";
  dash.getCell(dr, 2).value = {
    formula: `COUNTIF('Task List'!E4:E103,"To Do")`,
  } as ExcelJS.CellFormulaValue;
  styleDataRow(dash, dr, scheme, 2, false);
  dr++;
  dash.getCell(dr, 1).value = "In Progress";
  dash.getCell(dr, 2).value = {
    formula: `COUNTIF('Task List'!E4:E103,"In Progress")`,
  } as ExcelJS.CellFormulaValue;
  styleDataRow(dash, dr, scheme, 2, true);
  dr++;
  dash.getCell(dr, 1).value = "Review";
  dash.getCell(dr, 2).value = {
    formula: `COUNTIF('Task List'!E4:E103,"Review")`,
  } as ExcelJS.CellFormulaValue;
  styleDataRow(dash, dr, scheme, 2, false);
  dr++;
  dash.getCell(dr, 1).value = "Done";
  dash.getCell(dr, 2).value = {
    formula: `COUNTIF('Task List'!E4:E103,"Done")`,
  } as ExcelJS.CellFormulaValue;
  styleDataRow(dash, dr, scheme, 2, true);

  dash.views = [{ state: "frozen", xSplit: 0, ySplit: 2 }];

  // --- Active Projects ---
  const projects = workbook.addWorksheet("Active Projects");
  applySheetDefaults(projects);
  projects.columns = [
    { width: 24 }, // Project Name
    { width: 16 }, // Owner
    { width: 14 }, // Start Date
    { width: 14 }, // End Date
    { width: 14 }, // Status
    { width: 12 }, // Priority
    { width: 14 }, // Budget
    { width: 14 }, // Spent
    { width: 14 }, // % Complete
  ];

  addTitleRow(projects, 1, "ACTIVE PROJECTS", scheme, 9);
  projects.getRow(3).values = [
    "Project Name",
    "Owner",
    "Start Date",
    "End Date",
    "Status",
    "Priority",
    "Budget",
    "Spent",
    "% Complete",
  ];
  styleHeaderRow(projects, 3, scheme, 9);

  const statuses = [
    "Not Started",
    "In Progress",
    "On Hold",
    "Completed",
    "Cancelled",
  ];
  const priorities = ["High", "Medium", "Low"];

  for (let i = 0; i < 20; i++) {
    const r = 4 + i;
    projects.getCell(r, 3).numFmt = "MM/DD/YYYY";
    projects.getCell(r, 4).numFmt = "MM/DD/YYYY";
    projects.getCell(r, 7).numFmt = "$#,##0.00";
    projects.getCell(r, 8).numFmt = "$#,##0.00";
    projects.getCell(r, 9).numFmt = "0.0";
    styleDataRow(projects, r, scheme, 9, i % 2 === 1);
  }

  // Totals row
  const ptotal = 24;
  projects.getCell(ptotal, 1).value = "TOTALS";
  projects.getCell(ptotal, 7).value = { formula: `SUM(G4:G23)` } as ExcelJS.CellFormulaValue;
  projects.getCell(ptotal, 7).numFmt = "$#,##0.00";
  projects.getCell(ptotal, 8).value = { formula: `SUM(H4:H23)` } as ExcelJS.CellFormulaValue;
  projects.getCell(ptotal, 8).numFmt = "$#,##0.00";
  projects.getCell(ptotal, 9).value = { formula: `AVERAGE(I4:I23)` } as ExcelJS.CellFormulaValue;
  projects.getCell(ptotal, 9).numFmt = "0.0";
  styleTotalRow(projects, ptotal, scheme, 9);

  projects.views = [{ state: "frozen", xSplit: 0, ySplit: 3 }];
  projects.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: 9 },
  };

  // --- Task List ---
  const tasks = workbook.addWorksheet("Task List");
  applySheetDefaults(tasks);
  tasks.columns = [
    { width: 28 }, // Task
    { width: 20 }, // Project
    { width: 16 }, // Assignee
    { width: 12 }, // Priority
    { width: 14 }, // Status
    { width: 14 }, // Due Date
    { width: 14 }, // Est Hours
    { width: 14 }, // Actual Hours
    { width: 24 }, // Notes
  ];

  addTitleRow(tasks, 1, "TASK LIST", scheme, 9);
  tasks.getRow(3).values = [
    "Task",
    "Project",
    "Assignee",
    "Priority",
    "Status",
    "Due Date",
    "Est. Hours",
    "Actual Hours",
    "Notes",
  ];
  styleHeaderRow(tasks, 3, scheme, 9);

  for (let i = 0; i < 100; i++) {
    const r = 4 + i;
    tasks.getCell(r, 6).numFmt = "MM/DD/YYYY";
    tasks.getCell(r, 7).numFmt = "0.0";
    tasks.getCell(r, 8).numFmt = "0.0";
    styleDataRow(tasks, r, scheme, 9, i % 2 === 1);
  }

  // Summary
  const tsr = 105;
  tasks.getCell(tsr, 1).value = "SUMMARY";
  tasks.getCell(tsr, 1).font = {
    bold: true,
    size: 12,
    color: { argb: "FF" + scheme.primary },
  };
  tasks.getCell(tsr + 1, 1).value = "Total Estimated Hours";
  tasks.getCell(tsr + 1, 2).value = { formula: `SUM(G4:G103)` } as ExcelJS.CellFormulaValue;
  tasks.getCell(tsr + 1, 2).numFmt = "0.0";
  styleDataRow(tasks, tsr + 1, scheme, 2, false);
  tasks.getCell(tsr + 2, 1).value = "Total Actual Hours";
  tasks.getCell(tsr + 2, 2).value = { formula: `SUM(H4:H103)` } as ExcelJS.CellFormulaValue;
  tasks.getCell(tsr + 2, 2).numFmt = "0.0";
  styleDataRow(tasks, tsr + 2, scheme, 2, true);
  tasks.getCell(tsr + 3, 1).value = "Priority: High / Medium / Low";
  tasks.getCell(tsr + 3, 1).font = {
    italic: true,
    color: { argb: "FF" + scheme.secondary },
    size: 9,
  };
  tasks.getCell(tsr + 4, 1).value = "Status: To Do / In Progress / Review / Done";
  tasks.getCell(tsr + 4, 1).font = {
    italic: true,
    color: { argb: "FF" + scheme.secondary },
    size: 9,
  };

  tasks.views = [{ state: "frozen", xSplit: 0, ySplit: 3 }];
  tasks.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: 9 },
  };

  // --- Timeline (Gantt-style) ---
  const timeline = workbook.addWorksheet("Timeline");
  applySheetDefaults(timeline);

  const tlCols: Partial<ExcelJS.Column>[] = [{ width: 24 }];
  for (let w = 1; w <= 12; w++) {
    tlCols.push({ width: 10 });
  }
  timeline.columns = tlCols;

  addTitleRow(timeline, 1, "PROJECT TIMELINE", scheme, 13);

  const tlHeaders = ["Project"];
  for (let w = 1; w <= 12; w++) {
    tlHeaders.push(`Week ${w}`);
  }
  timeline.getRow(3).values = tlHeaders;
  styleHeaderRow(timeline, 3, scheme, 13);

  for (let p = 0; p < 20; p++) {
    const r = 4 + p;
    // Reference project name from Active Projects
    timeline.getCell(r, 1).value = {
      formula: `'Active Projects'!A${4 + p}`,
    } as ExcelJS.CellFormulaValue;

    // Gantt-chart style: fill some weeks with accent color for visual
    // Leave cells empty for user to fill/mark active weeks
    for (let w = 1; w <= 12; w++) {
      timeline.getCell(r, w + 1).alignment = { horizontal: "center" };
    }
    styleDataRow(timeline, r, scheme, 13, p % 2 === 1);
  }

  // Instructions
  const tlNote = 25;
  timeline.getCell(tlNote, 1).value =
    'Mark active weeks with "X" or any character. Color cells manually for visual Gantt chart.';
  timeline.getCell(tlNote, 1).font = {
    italic: true,
    color: { argb: "FF" + scheme.secondary },
    size: 9,
  };

  timeline.views = [{ state: "frozen", xSplit: 1, ySplit: 3 }];
  timeline.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: 13 },
  };

  // --- Team ---
  const team = workbook.addWorksheet("Team");
  applySheetDefaults(team);
  team.columns = [
    { width: 20 }, // Name
    { width: 20 }, // Role
    { width: 24 }, // Email
    { width: 16 }, // Phone
    { width: 14 }, // Availability
    { width: 14 }, // Hourly Rate
    { width: 24 }, // Notes
  ];

  addTitleRow(team, 1, "TEAM MEMBERS", scheme, 7);
  team.getRow(3).values = [
    "Name",
    "Role",
    "Email",
    "Phone",
    "Availability",
    "Hourly Rate",
    "Notes",
  ];
  styleHeaderRow(team, 3, scheme, 7);

  for (let i = 0; i < 15; i++) {
    const r = 4 + i;
    team.getCell(r, 6).numFmt = "$#,##0.00";
    styleDataRow(team, r, scheme, 7, i % 2 === 1);
  }

  team.views = [{ state: "frozen", xSplit: 0, ySplit: 3 }];
  team.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: 7 },
  };
}

// ---------------------------------------------------------------------------
// Column letter helper (1=A, 2=B, ..., 27=AA, 28=AB, ...)
// ---------------------------------------------------------------------------

function getColLetter(colNum: number): string {
  let letter = "";
  let n = colNum;
  while (n > 0) {
    const mod = (n - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

// ---------------------------------------------------------------------------
// API Route Handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const { trackerType, colorScheme } = await req.json();
    if (!trackerType || !colorScheme) {
      return NextResponse.json(
        { error: "Missing trackerType or colorScheme" },
        { status: 400 }
      );
    }

    const scheme = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES["minimal-black"];
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CraftPlan Digital";
    workbook.created = new Date();

    switch (trackerType) {
      case "budget":
        generateBudgetTracker(workbook, scheme);
        break;
      case "habit":
        generateHabitTracker(workbook, scheme);
        break;
      case "fitness":
        generateFitnessTracker(workbook, scheme);
        break;
      case "business":
        generateBusinessTracker(workbook, scheme);
        break;
      case "meal_planner":
        generateMealPlanner(workbook, scheme);
        break;
      case "project":
        generateProjectTracker(workbook, scheme);
        break;
      default:
        return NextResponse.json(
          { error: "Invalid tracker type" },
          { status: 400 }
        );
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const uint8 = new Uint8Array(buffer as ArrayBuffer);

    return new Response(uint8, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${trackerType}-tracker.xlsx"`,
      },
    });
  } catch (err: unknown) {
    console.error("[Excel Generate] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
