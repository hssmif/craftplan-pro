import {
  PDFDocument,
  rgb,
  StandardFonts,
  PDFPage,
  PDFFont,
  RGB,
} from "pdf-lib";

// ── Color Themes ──────────────────────────────────────────────
export interface ColorTheme {
  name: string;
  primary: RGB;
  secondary: RGB;
  accent: RGB;
  light: RGB;
  text: RGB;
  muted: RGB;
}

export const COLOR_THEMES: Record<string, ColorTheme> = {
  minimal: {
    name: "Minimal",
    primary: rgb(0.15, 0.15, 0.15),
    secondary: rgb(0.4, 0.4, 0.4),
    accent: rgb(0.2, 0.2, 0.2),
    light: rgb(0.95, 0.95, 0.95),
    text: rgb(0.1, 0.1, 0.1),
    muted: rgb(0.65, 0.65, 0.65),
  },
  blush: {
    name: "Blush Pink",
    primary: rgb(0.85, 0.55, 0.6),
    secondary: rgb(0.75, 0.45, 0.5),
    accent: rgb(0.95, 0.75, 0.78),
    light: rgb(0.98, 0.94, 0.95),
    text: rgb(0.2, 0.15, 0.15),
    muted: rgb(0.7, 0.55, 0.58),
  },
  sage: {
    name: "Sage Green",
    primary: rgb(0.45, 0.58, 0.47),
    secondary: rgb(0.35, 0.48, 0.37),
    accent: rgb(0.7, 0.8, 0.72),
    light: rgb(0.94, 0.97, 0.94),
    text: rgb(0.15, 0.2, 0.15),
    muted: rgb(0.55, 0.65, 0.57),
  },
  ocean: {
    name: "Ocean Blue",
    primary: rgb(0.2, 0.45, 0.65),
    secondary: rgb(0.15, 0.35, 0.55),
    accent: rgb(0.55, 0.75, 0.88),
    light: rgb(0.93, 0.96, 0.98),
    text: rgb(0.1, 0.15, 0.2),
    muted: rgb(0.5, 0.6, 0.7),
  },
  lavender: {
    name: "Lavender",
    primary: rgb(0.55, 0.45, 0.7),
    secondary: rgb(0.45, 0.35, 0.6),
    accent: rgb(0.78, 0.7, 0.9),
    light: rgb(0.96, 0.94, 0.98),
    text: rgb(0.18, 0.15, 0.22),
    muted: rgb(0.6, 0.55, 0.68),
  },
  terracotta: {
    name: "Terracotta",
    primary: rgb(0.76, 0.45, 0.32),
    secondary: rgb(0.65, 0.38, 0.25),
    accent: rgb(0.9, 0.72, 0.6),
    light: rgb(0.98, 0.95, 0.93),
    text: rgb(0.22, 0.15, 0.1),
    muted: rgb(0.68, 0.55, 0.48),
  },
};

// ── Planner Types ─────────────────────────────────────────────
export type PlannerType =
  | "weekly"
  | "monthly"
  | "daily"
  | "habit_tracker"
  | "budget"
  | "meal_planner"
  | "goals"
  | "gratitude";

export interface PlannerConfig {
  type: PlannerType;
  theme: string;
  title?: string;
  year?: number;
  month?: number; // 0-11
  weeks?: number; // for weekly/habit tracker
  includeNotes?: boolean;
  paperSize?: "letter" | "a4" | "a5";
}

// ── Page Dimensions ───────────────────────────────────────────
const PAPER_SIZES = {
  letter: { width: 612, height: 792 },
  a4: { width: 595.28, height: 841.89 },
  a5: { width: 419.53, height: 595.28 },
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAYS_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ── Helper Functions ──────────────────────────────────────────
function drawLine(
  page: PDFPage,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: RGB,
  thickness = 0.5
) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color, thickness });
}

function drawRect(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  color: RGB,
  borderColor?: RGB
) {
  page.drawRectangle({ x, y, width: w, height: h, color });
  if (borderColor) {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderColor,
      borderWidth: 0.5,
    });
  }
}

function drawCheckbox(page: PDFPage, x: number, y: number, size: number, color: RGB) {
  page.drawRectangle({
    x,
    y,
    width: size,
    height: size,
    borderColor: color,
    borderWidth: 0.8,
  });
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  // Returns 0=Mon, 1=Tue, ..., 6=Sun
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

// ── COVER PAGE ────────────────────────────────────────────────
function drawCoverPage(
  page: PDFPage,
  config: PlannerConfig,
  theme: ColorTheme,
  fonts: { bold: PDFFont; regular: PDFFont }
) {
  const { width, height } = page.getSize();
  const title = config.title || getPlannerTitle(config);

  // Background
  page.drawRectangle({ x: 0, y: 0, width, height, color: theme.light });

  // Decorative top bar
  drawRect(page, 0, height - 80, width, 80, theme.primary);

  // Decorative accent line
  drawLine(page, 40, height - 90, width - 40, height - 90, theme.accent, 2);

  // Title
  const titleSize = width > 500 ? 32 : 24;
  const titleWidth = fonts.bold.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: (width - titleWidth) / 2,
    y: height / 2 + 40,
    size: titleSize,
    font: fonts.bold,
    color: theme.primary,
  });

  // Year
  const yearText = `${config.year || new Date().getFullYear()}`;
  const yearWidth = fonts.regular.widthOfTextAtSize(yearText, 20);
  page.drawText(yearText, {
    x: (width - yearWidth) / 2,
    y: height / 2 - 10,
    size: 20,
    font: fonts.regular,
    color: theme.secondary,
  });

  // Decorative bottom bar
  drawRect(page, 0, 0, width, 40, theme.primary);

  // Small branding
  const brand = "CraftPlan Digital";
  const brandWidth = fonts.regular.widthOfTextAtSize(brand, 8);
  page.drawText(brand, {
    x: (width - brandWidth) / 2,
    y: 15,
    size: 8,
    font: fonts.regular,
    color: rgb(1, 1, 1),
  });
}

function getPlannerTitle(config: PlannerConfig): string {
  const titles: Record<PlannerType, string> = {
    weekly: "Weekly Planner",
    monthly: "Monthly Planner",
    daily: "Daily Planner",
    habit_tracker: "Habit Tracker",
    budget: "Budget Planner",
    meal_planner: "Meal Planner",
    goals: "Goals Planner",
    gratitude: "Gratitude Journal",
  };
  return titles[config.type] || "Planner";
}

// ── WEEKLY PLANNER ────────────────────────────────────────────
function drawWeeklyPage(
  page: PDFPage,
  weekNum: number,
  theme: ColorTheme,
  fonts: { bold: PDFFont; regular: PDFFont }
) {
  const { width, height } = page.getSize();
  const margin = 40;
  const usableW = width - margin * 2;

  // Header
  drawRect(page, 0, height - 55, width, 55, theme.primary);
  page.drawText(`Week ${weekNum}`, {
    x: margin,
    y: height - 38,
    size: 18,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });

  // Top priorities box
  const topY = height - 70;
  page.drawText("Top Priorities", {
    x: margin,
    y: topY,
    size: 10,
    font: fonts.bold,
    color: theme.primary,
  });
  for (let i = 0; i < 3; i++) {
    const y = topY - 18 - i * 18;
    drawCheckbox(page, margin, y - 2, 10, theme.muted);
    drawLine(page, margin + 16, y - 2, margin + usableW / 2 - 10, y - 2, theme.light, 0.5);
  }

  // Notes box on right of priorities
  const notesX = margin + usableW / 2 + 10;
  page.drawText("Notes", {
    x: notesX,
    y: topY,
    size: 10,
    font: fonts.bold,
    color: theme.primary,
  });
  drawRect(page, notesX, topY - 58, usableW / 2 - 10, 55, theme.light, theme.accent);

  // Day sections
  const dayStartY = topY - 80;
  const dayHeight = (dayStartY - margin) / 7;
  const colWidth = usableW;

  for (let d = 0; d < 7; d++) {
    const y = dayStartY - d * dayHeight;

    // Day header
    drawRect(page, margin, y - 16, colWidth, 16, theme.accent);
    page.drawText(DAYS_FULL[d], {
      x: margin + 6,
      y: y - 13,
      size: 9,
      font: fonts.bold,
      color: theme.text,
    });

    // Task lines
    const lineCount = Math.floor((dayHeight - 20) / 14);
    for (let l = 0; l < lineCount; l++) {
      const ly = y - 20 - l * 14 - 10;
      drawCheckbox(page, margin + 6, ly, 8, theme.muted);
      drawLine(page, margin + 20, ly, margin + colWidth - 10, ly, theme.light, 0.3);
    }

    // Separator
    drawLine(page, margin, y - dayHeight, margin + colWidth, y - dayHeight, theme.accent, 0.3);
  }
}

// ── MONTHLY PLANNER ───────────────────────────────────────────
function drawMonthlyPage(
  page: PDFPage,
  year: number,
  month: number,
  theme: ColorTheme,
  fonts: { bold: PDFFont; regular: PDFFont }
) {
  const { width, height } = page.getSize();
  const margin = 40;
  const usableW = width - margin * 2;

  // Header
  drawRect(page, 0, height - 55, width, 55, theme.primary);
  page.drawText(`${MONTHS[month]} ${year}`, {
    x: margin,
    y: height - 38,
    size: 20,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });

  // Day headers
  const calTop = height - 75;
  const colW = usableW / 7;
  for (let d = 0; d < 7; d++) {
    const x = margin + d * colW;
    drawRect(page, x, calTop - 18, colW, 18, theme.accent);
    const tw = fonts.bold.widthOfTextAtSize(DAYS_SHORT[d], 9);
    page.drawText(DAYS_SHORT[d], {
      x: x + (colW - tw) / 2,
      y: calTop - 14,
      size: 9,
      font: fonts.bold,
      color: theme.text,
    });
  }

  // Calendar grid
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const rowCount = Math.ceil((daysInMonth + firstDay) / 7);
  const rowH = Math.min(85, (calTop - 20 - margin - 120) / rowCount);

  for (let row = 0; row < rowCount; row++) {
    for (let col = 0; col < 7; col++) {
      const dayNum = row * 7 + col - firstDay + 1;
      const x = margin + col * colW;
      const y = calTop - 20 - row * rowH;

      // Cell border
      page.drawRectangle({
        x,
        y: y - rowH,
        width: colW,
        height: rowH,
        borderColor: theme.light,
        borderWidth: 0.5,
      });

      if (dayNum >= 1 && dayNum <= daysInMonth) {
        // Day number
        page.drawText(`${dayNum}`, {
          x: x + 4,
          y: y - 12,
          size: 10,
          font: fonts.bold,
          color: col >= 5 ? theme.accent : theme.primary,
        });

        // Lines for notes
        for (let l = 0; l < 3; l++) {
          const ly = y - 22 - l * 12;
          if (ly > y - rowH + 4) {
            drawLine(page, x + 4, ly, x + colW - 4, ly, theme.light, 0.3);
          }
        }
      }
    }
  }

  // Goals/Notes section at bottom
  const bottomY = calTop - 20 - rowCount * rowH - 15;
  if (bottomY > margin + 80) {
    // Goals
    page.drawText("Monthly Goals", {
      x: margin,
      y: bottomY,
      size: 10,
      font: fonts.bold,
      color: theme.primary,
    });
    for (let i = 0; i < 4; i++) {
      const y = bottomY - 18 - i * 16;
      drawCheckbox(page, margin, y - 2, 9, theme.muted);
      drawLine(page, margin + 15, y - 2, margin + usableW / 2 - 20, y - 2, theme.light, 0.3);
    }

    // Notes
    page.drawText("Notes", {
      x: margin + usableW / 2 + 10,
      y: bottomY,
      size: 10,
      font: fonts.bold,
      color: theme.primary,
    });
    for (let i = 0; i < 4; i++) {
      const y = bottomY - 18 - i * 16;
      drawLine(page, margin + usableW / 2 + 10, y - 2, margin + usableW, y - 2, theme.light, 0.3);
    }
  }
}

// ── DAILY PLANNER ─────────────────────────────────────────────
function drawDailyPage(
  page: PDFPage,
  dayLabel: string,
  theme: ColorTheme,
  fonts: { bold: PDFFont; regular: PDFFont }
) {
  const { width, height } = page.getSize();
  const margin = 40;
  const usableW = width - margin * 2;

  // Header
  drawRect(page, 0, height - 55, width, 55, theme.primary);
  page.drawText(dayLabel, {
    x: margin,
    y: height - 38,
    size: 18,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });
  // Date line
  page.drawText("Date: _______________", {
    x: width - margin - 150,
    y: height - 38,
    size: 10,
    font: fonts.regular,
    color: rgb(0.85, 0.85, 0.85),
  });

  const contentTop = height - 70;

  // Morning routine (left column)
  const halfW = usableW / 2 - 10;
  page.drawText("Morning Routine", {
    x: margin,
    y: contentTop,
    size: 10,
    font: fonts.bold,
    color: theme.primary,
  });
  for (let i = 0; i < 4; i++) {
    const y = contentTop - 18 - i * 16;
    drawCheckbox(page, margin, y - 2, 9, theme.muted);
    drawLine(page, margin + 15, y - 2, margin + halfW, y - 2, theme.light, 0.3);
  }

  // Top 3 priorities (right column)
  const rightX = margin + halfW + 20;
  page.drawText("Top 3 Priorities", {
    x: rightX,
    y: contentTop,
    size: 10,
    font: fonts.bold,
    color: theme.primary,
  });
  for (let i = 0; i < 3; i++) {
    const y = contentTop - 18 - i * 18;
    page.drawText(`${i + 1}.`, {
      x: rightX,
      y: y,
      size: 9,
      font: fonts.bold,
      color: theme.accent,
    });
    drawLine(page, rightX + 14, y, margin + usableW, y, theme.light, 0.3);
  }

  // Schedule (time blocks)
  const scheduleTop = contentTop - 95;
  page.drawText("Schedule", {
    x: margin,
    y: scheduleTop,
    size: 10,
    font: fonts.bold,
    color: theme.primary,
  });

  const hours = ["6 AM", "7 AM", "8 AM", "9 AM", "10 AM", "11 AM", "12 PM",
    "1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM", "7 PM", "8 PM", "9 PM"];
  const schedLineH = Math.min(28, (scheduleTop - 15 - margin - 120) / hours.length);

  for (let i = 0; i < hours.length; i++) {
    const y = scheduleTop - 18 - i * schedLineH;
    if (y < margin + 120) break;

    page.drawText(hours[i], {
      x: margin,
      y: y,
      size: 8,
      font: fonts.regular,
      color: theme.muted,
    });
    drawLine(page, margin + 40, y, margin + usableW * 0.6, y, theme.light, 0.3);
  }

  // To-Do list (right side of schedule)
  const todoX = margin + usableW * 0.65;
  page.drawText("To-Do List", {
    x: todoX,
    y: scheduleTop,
    size: 10,
    font: fonts.bold,
    color: theme.primary,
  });
  for (let i = 0; i < 10; i++) {
    const y = scheduleTop - 18 - i * 18;
    if (y < margin + 120) break;
    drawCheckbox(page, todoX, y - 2, 9, theme.muted);
    drawLine(page, todoX + 15, y - 2, margin + usableW, y - 2, theme.light, 0.3);
  }

  // Gratitude / reflection at bottom
  const bottomY = margin + 90;
  drawLine(page, margin, bottomY + 10, margin + usableW, bottomY + 10, theme.accent, 1);
  page.drawText("Today I'm Grateful For:", {
    x: margin,
    y: bottomY - 5,
    size: 10,
    font: fonts.bold,
    color: theme.primary,
  });
  for (let i = 0; i < 3; i++) {
    const y = bottomY - 22 - i * 16;
    page.drawText(`${i + 1}.`, { x: margin, y, size: 8, font: fonts.regular, color: theme.muted });
    drawLine(page, margin + 12, y, margin + usableW, y, theme.light, 0.3);
  }
}

// ── HABIT TRACKER ─────────────────────────────────────────────
function drawHabitTrackerPage(
  page: PDFPage,
  monthLabel: string,
  daysInMonth: number,
  theme: ColorTheme,
  fonts: { bold: PDFFont; regular: PDFFont }
) {
  const { width, height } = page.getSize();
  const margin = 40;
  const usableW = width - margin * 2;

  // Header
  drawRect(page, 0, height - 55, width, 55, theme.primary);
  page.drawText(`Habit Tracker - ${monthLabel}`, {
    x: margin,
    y: height - 38,
    size: 18,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });

  const gridTop = height - 75;
  const habitColW = 120;
  const dayColW = Math.min(16, (usableW - habitColW) / daysInMonth);
  const rowH = 22;
  const habitCount = Math.min(20, Math.floor((gridTop - margin - 30) / rowH));

  // Day numbers header
  for (let d = 0; d < daysInMonth; d++) {
    const x = margin + habitColW + d * dayColW;
    const numStr = `${d + 1}`;
    const tw = fonts.regular.widthOfTextAtSize(numStr, 7);
    page.drawText(numStr, {
      x: x + (dayColW - tw) / 2,
      y: gridTop - 12,
      size: 7,
      font: fonts.regular,
      color: theme.secondary,
    });
  }

  // Habit rows
  for (let h = 0; h < habitCount; h++) {
    const y = gridTop - 20 - h * rowH;
    const bgColor = h % 2 === 0 ? theme.light : rgb(1, 1, 1);

    // Row background
    drawRect(page, margin, y - rowH + 4, usableW, rowH, bgColor);

    // Habit name area
    page.drawText(`Habit ${h + 1}`, {
      x: margin + 5,
      y: y - 10,
      size: 8,
      font: fonts.regular,
      color: theme.muted,
    });

    // Checkboxes for each day
    for (let d = 0; d < daysInMonth; d++) {
      const x = margin + habitColW + d * dayColW;
      const boxSize = Math.min(10, dayColW - 3);
      drawCheckbox(page, x + (dayColW - boxSize) / 2, y - 10 - boxSize / 2, boxSize, theme.accent);
    }

    // Row divider
    drawLine(page, margin, y - rowH + 4, margin + usableW, y - rowH + 4, theme.accent, 0.2);
  }

  // Summary section
  const summaryY = gridTop - 20 - habitCount * rowH - 15;
  if (summaryY > margin + 20) {
    page.drawText("Monthly Reflection:", {
      x: margin,
      y: summaryY,
      size: 10,
      font: fonts.bold,
      color: theme.primary,
    });
    for (let i = 0; i < 3; i++) {
      drawLine(page, margin, summaryY - 18 - i * 16, margin + usableW, summaryY - 18 - i * 16, theme.light, 0.3);
    }
  }
}

// ── BUDGET PLANNER ────────────────────────────────────────────
function drawBudgetPage(
  page: PDFPage,
  monthLabel: string,
  theme: ColorTheme,
  fonts: { bold: PDFFont; regular: PDFFont }
) {
  const { width, height } = page.getSize();
  const margin = 40;
  const usableW = width - margin * 2;

  // Header
  drawRect(page, 0, height - 55, width, 55, theme.primary);
  page.drawText(`Budget - ${monthLabel}`, {
    x: margin,
    y: height - 38,
    size: 18,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });

  const contentTop = height - 70;

  // Income section
  page.drawText("Income", {
    x: margin,
    y: contentTop,
    size: 12,
    font: fonts.bold,
    color: theme.primary,
  });

  const incomeHeaders = ["Source", "Expected", "Actual"];
  const incColW = [usableW * 0.5, usableW * 0.25, usableW * 0.25];
  let xOff = margin;
  for (let i = 0; i < incomeHeaders.length; i++) {
    drawRect(page, xOff, contentTop - 30, incColW[i], 16, theme.accent);
    page.drawText(incomeHeaders[i], {
      x: xOff + 5,
      y: contentTop - 26,
      size: 8,
      font: fonts.bold,
      color: theme.text,
    });
    xOff += incColW[i];
  }

  for (let r = 0; r < 4; r++) {
    const y = contentTop - 48 - r * 18;
    let x = margin;
    for (let c = 0; c < 3; c++) {
      drawLine(page, x, y, x + incColW[c], y, theme.light, 0.3);
      x += incColW[c];
    }
  }

  // Total income line
  const totalIncY = contentTop - 48 - 4 * 18;
  drawRect(page, margin, totalIncY - 2, usableW, 16, theme.light);
  page.drawText("Total Income:", {
    x: margin + 5,
    y: totalIncY + 2,
    size: 9,
    font: fonts.bold,
    color: theme.primary,
  });

  // Expenses section
  const expTop = totalIncY - 30;
  page.drawText("Expenses", {
    x: margin,
    y: expTop,
    size: 12,
    font: fonts.bold,
    color: theme.primary,
  });

  const categories = [
    "Housing/Rent", "Utilities", "Groceries", "Transport",
    "Insurance", "Subscriptions", "Dining Out", "Entertainment",
    "Savings", "Debt Payment", "Clothing", "Health/Medical",
    "Personal Care", "Other",
  ];

  const expHeaders = ["Category", "Budget", "Actual", "Diff"];
  const expColW = [usableW * 0.35, usableW * 0.2, usableW * 0.2, usableW * 0.25];

  xOff = margin;
  for (let i = 0; i < expHeaders.length; i++) {
    drawRect(page, xOff, expTop - 20, expColW[i], 16, theme.accent);
    page.drawText(expHeaders[i], {
      x: xOff + 5,
      y: expTop - 16,
      size: 8,
      font: fonts.bold,
      color: theme.text,
    });
    xOff += expColW[i];
  }

  for (let r = 0; r < categories.length; r++) {
    const y = expTop - 38 - r * 18;
    if (y < margin + 60) break;
    const bg = r % 2 === 0 ? theme.light : rgb(1, 1, 1);
    drawRect(page, margin, y - 4, usableW, 18, bg);
    page.drawText(categories[r], {
      x: margin + 5,
      y: y,
      size: 8,
      font: fonts.regular,
      color: theme.text,
    });
    let x = margin + expColW[0];
    for (let c = 1; c < 4; c++) {
      drawLine(page, x, y - 4, x, y + 14, theme.accent, 0.2);
      x += expColW[c];
    }
  }

  // Summary at bottom
  const sumY = margin + 30;
  drawRect(page, margin, sumY - 5, usableW, 22, theme.primary);
  page.drawText("Total Expenses: ________    Remaining: ________", {
    x: margin + 10,
    y: sumY,
    size: 10,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });
}

// ── MEAL PLANNER ──────────────────────────────────────────────
function drawMealPlannerPage(
  page: PDFPage,
  weekNum: number,
  theme: ColorTheme,
  fonts: { bold: PDFFont; regular: PDFFont }
) {
  const { width, height } = page.getSize();
  const margin = 40;
  const usableW = width - margin * 2;

  // Header
  drawRect(page, 0, height - 55, width, 55, theme.primary);
  page.drawText(`Meal Plan - Week ${weekNum}`, {
    x: margin,
    y: height - 38,
    size: 18,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });

  const contentTop = height - 70;
  const meals = ["Breakfast", "Lunch", "Dinner", "Snacks"];
  const dayColW = (usableW - 70) / 7;
  const mealH = 18;

  // Column headers (days)
  for (let d = 0; d < 7; d++) {
    const x = margin + 70 + d * dayColW;
    drawRect(page, x, contentTop - 16, dayColW, 16, theme.accent);
    const tw = fonts.bold.widthOfTextAtSize(DAYS_SHORT[d], 8);
    page.drawText(DAYS_SHORT[d], {
      x: x + (dayColW - tw) / 2,
      y: contentTop - 13,
      size: 8,
      font: fonts.bold,
      color: theme.text,
    });
  }

  // Meal rows
  for (let m = 0; m < meals.length; m++) {
    const sectionY = contentTop - 22 - m * (mealH * 3 + 15);

    // Meal type label
    drawRect(page, margin, sectionY - mealH * 3, 65, mealH * 3, theme.light);
    page.drawText(meals[m], {
      x: margin + 5,
      y: sectionY - mealH * 1.5 - 4,
      size: 9,
      font: fonts.bold,
      color: theme.primary,
    });

    // Day cells
    for (let d = 0; d < 7; d++) {
      const x = margin + 70 + d * dayColW;
      page.drawRectangle({
        x,
        y: sectionY - mealH * 3,
        width: dayColW,
        height: mealH * 3,
        borderColor: theme.accent,
        borderWidth: 0.3,
      });
    }
  }

  // Grocery list at bottom
  const groceryTop = contentTop - 22 - meals.length * (mealH * 3 + 15) - 15;
  if (groceryTop > margin + 80) {
    drawLine(page, margin, groceryTop + 10, margin + usableW, groceryTop + 10, theme.accent, 1);
    page.drawText("Grocery List", {
      x: margin,
      y: groceryTop - 5,
      size: 11,
      font: fonts.bold,
      color: theme.primary,
    });

    const cols = 3;
    const colW = usableW / cols;
    const items = Math.min(8, Math.floor((groceryTop - 10 - margin) / 16));
    for (let c = 0; c < cols; c++) {
      for (let i = 0; i < items; i++) {
        const y = groceryTop - 22 - i * 16;
        if (y < margin) break;
        const x = margin + c * colW;
        drawCheckbox(page, x, y - 2, 8, theme.muted);
        drawLine(page, x + 14, y - 2, x + colW - 15, y - 2, theme.light, 0.3);
      }
    }
  }
}

// ── GOALS PLANNER ─────────────────────────────────────────────
function drawGoalsPage(
  page: PDFPage,
  quarter: string,
  theme: ColorTheme,
  fonts: { bold: PDFFont; regular: PDFFont }
) {
  const { width, height } = page.getSize();
  const margin = 40;
  const usableW = width - margin * 2;

  // Header
  drawRect(page, 0, height - 55, width, 55, theme.primary);
  page.drawText(`Goals - ${quarter}`, {
    x: margin,
    y: height - 38,
    size: 18,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });

  const contentTop = height - 75;
  const categories = ["Career / Business", "Health & Fitness", "Financial", "Personal Growth", "Relationships"];
  const sectionH = (contentTop - margin - 10) / categories.length;

  for (let c = 0; c < categories.length; c++) {
    const sectionTop = contentTop - c * sectionH;

    // Category header
    drawRect(page, margin, sectionTop - 18, usableW, 18, theme.accent);
    page.drawText(categories[c], {
      x: margin + 8,
      y: sectionTop - 14,
      size: 10,
      font: fonts.bold,
      color: theme.text,
    });

    // Goal line
    page.drawText("Goal:", {
      x: margin + 5,
      y: sectionTop - 34,
      size: 8,
      font: fonts.bold,
      color: theme.primary,
    });
    drawLine(page, margin + 32, sectionTop - 34, margin + usableW - 10, sectionTop - 34, theme.light, 0.3);

    // Action steps
    page.drawText("Action Steps:", {
      x: margin + 5,
      y: sectionTop - 52,
      size: 8,
      font: fonts.bold,
      color: theme.secondary,
    });
    const stepsStart = sectionTop - 68;
    const stepCount = Math.min(3, Math.floor((sectionH - 75) / 14));
    for (let s = 0; s < stepCount; s++) {
      const y = stepsStart - s * 14;
      drawCheckbox(page, margin + 10, y - 2, 8, theme.muted);
      drawLine(page, margin + 24, y - 2, margin + usableW * 0.65, y - 2, theme.light, 0.3);
    }

    // Deadline
    page.drawText("Deadline: ___________", {
      x: margin + usableW * 0.7,
      y: sectionTop - 52,
      size: 8,
      font: fonts.regular,
      color: theme.muted,
    });

    // Progress bar outline
    page.drawText("Progress:", {
      x: margin + usableW * 0.7,
      y: sectionTop - 72,
      size: 8,
      font: fonts.regular,
      color: theme.muted,
    });
    page.drawRectangle({
      x: margin + usableW * 0.7 + 50,
      y: sectionTop - 75,
      width: usableW * 0.3 - 50,
      height: 10,
      borderColor: theme.accent,
      borderWidth: 0.5,
    });
  }
}

// ── GRATITUDE JOURNAL ─────────────────────────────────────────
function drawGratitudePage(
  page: PDFPage,
  dayLabel: string,
  theme: ColorTheme,
  fonts: { bold: PDFFont; regular: PDFFont }
) {
  const { width, height } = page.getSize();
  const margin = 40;
  const usableW = width - margin * 2;

  // Header
  drawRect(page, 0, height - 55, width, 55, theme.primary);
  page.drawText(dayLabel, {
    x: margin,
    y: height - 38,
    size: 18,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });
  page.drawText("Date: _______________", {
    x: width - margin - 150,
    y: height - 38,
    size: 10,
    font: fonts.regular,
    color: rgb(0.85, 0.85, 0.85),
  });

  const contentTop = height - 75;

  // Morning gratitude
  page.drawText("This Morning I Am Grateful For:", {
    x: margin,
    y: contentTop,
    size: 11,
    font: fonts.bold,
    color: theme.primary,
  });
  for (let i = 0; i < 3; i++) {
    const y = contentTop - 22 - i * 22;
    page.drawText(`${i + 1}.`, { x: margin, y, size: 9, font: fonts.regular, color: theme.accent });
    drawLine(page, margin + 14, y, margin + usableW, y, theme.light, 0.3);
  }

  // Positive affirmation
  const affY = contentTop - 100;
  drawRect(page, margin, affY - 50, usableW, 55, theme.light);
  page.drawText("Today's Affirmation:", {
    x: margin + 10,
    y: affY - 5,
    size: 10,
    font: fonts.bold,
    color: theme.primary,
  });
  for (let i = 0; i < 2; i++) {
    drawLine(page, margin + 10, affY - 24 - i * 18, margin + usableW - 10, affY - 24 - i * 18, theme.accent, 0.3);
  }

  // What would make today great
  const greatY = affY - 75;
  page.drawText("What Would Make Today Great:", {
    x: margin,
    y: greatY,
    size: 11,
    font: fonts.bold,
    color: theme.primary,
  });
  for (let i = 0; i < 3; i++) {
    const y = greatY - 22 - i * 22;
    drawCheckbox(page, margin, y - 2, 9, theme.muted);
    drawLine(page, margin + 16, y, margin + usableW, y, theme.light, 0.3);
  }

  // Evening reflection
  const eveY = greatY - 105;
  drawLine(page, margin, eveY + 15, margin + usableW, eveY + 15, theme.accent, 1);
  page.drawText("Evening Reflection", {
    x: margin,
    y: eveY,
    size: 11,
    font: fonts.bold,
    color: theme.primary,
  });

  page.drawText("Best moment of today:", {
    x: margin,
    y: eveY - 22,
    size: 9,
    font: fonts.regular,
    color: theme.secondary,
  });
  for (let i = 0; i < 2; i++) {
    drawLine(page, margin, eveY - 40 - i * 18, margin + usableW, eveY - 40 - i * 18, theme.light, 0.3);
  }

  page.drawText("What I learned today:", {
    x: margin,
    y: eveY - 85,
    size: 9,
    font: fonts.regular,
    color: theme.secondary,
  });
  for (let i = 0; i < 2; i++) {
    drawLine(page, margin, eveY - 103 - i * 18, margin + usableW, eveY - 103 - i * 18, theme.light, 0.3);
  }

  // Tomorrow's intention
  const tomY = eveY - 150;
  if (tomY > margin + 20) {
    page.drawText("Tomorrow's Intention:", {
      x: margin,
      y: tomY,
      size: 9,
      font: fonts.regular,
      color: theme.secondary,
    });
    drawLine(page, margin, tomY - 18, margin + usableW, tomY - 18, theme.light, 0.3);
  }
}

// ── MAIN GENERATOR ────────────────────────────────────────────
export async function generatePlanner(config: PlannerConfig): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fonts = { bold: boldFont, regular: regularFont };

  const theme = COLOR_THEMES[config.theme] || COLOR_THEMES.minimal;
  const paper = PAPER_SIZES[config.paperSize || "letter"];
  const year = config.year || new Date().getFullYear();

  // Cover page
  const cover = pdfDoc.addPage([paper.width, paper.height]);
  drawCoverPage(cover, config, theme, fonts);

  switch (config.type) {
    case "weekly": {
      const weeks = config.weeks || 52;
      for (let w = 1; w <= weeks; w++) {
        const page = pdfDoc.addPage([paper.width, paper.height]);
        drawWeeklyPage(page, w, theme, fonts);
      }
      break;
    }
    case "monthly": {
      const startMonth = config.month ?? 0;
      const endMonth = config.month !== undefined ? config.month + 1 : 12;
      for (let m = startMonth; m < endMonth; m++) {
        const page = pdfDoc.addPage([paper.width, paper.height]);
        drawMonthlyPage(page, year, m, theme, fonts);
      }
      break;
    }
    case "daily": {
      // Generate 7 day templates (Mon-Sun)
      for (let d = 0; d < 7; d++) {
        const page = pdfDoc.addPage([paper.width, paper.height]);
        drawDailyPage(page, DAYS_FULL[d], theme, fonts);
      }
      break;
    }
    case "habit_tracker": {
      const startMonth = config.month ?? 0;
      const endMonth = config.month !== undefined ? config.month + 1 : 12;
      for (let m = startMonth; m < endMonth; m++) {
        const page = pdfDoc.addPage([paper.width, paper.height]);
        const days = getDaysInMonth(year, m);
        drawHabitTrackerPage(page, `${MONTHS[m]} ${year}`, days, theme, fonts);
      }
      break;
    }
    case "budget": {
      const startMonth = config.month ?? 0;
      const endMonth = config.month !== undefined ? config.month + 1 : 12;
      for (let m = startMonth; m < endMonth; m++) {
        const page = pdfDoc.addPage([paper.width, paper.height]);
        drawBudgetPage(page, `${MONTHS[m]} ${year}`, theme, fonts);
      }
      break;
    }
    case "meal_planner": {
      const weeks = config.weeks || 4;
      for (let w = 1; w <= weeks; w++) {
        const page = pdfDoc.addPage([paper.width, paper.height]);
        drawMealPlannerPage(page, w, theme, fonts);
      }
      break;
    }
    case "goals": {
      const quarters = ["Q1 (Jan-Mar)", "Q2 (Apr-Jun)", "Q3 (Jul-Sep)", "Q4 (Oct-Dec)"];
      for (const q of quarters) {
        const page = pdfDoc.addPage([paper.width, paper.height]);
        drawGoalsPage(page, q, theme, fonts);
      }
      break;
    }
    case "gratitude": {
      for (let d = 0; d < 7; d++) {
        const page = pdfDoc.addPage([paper.width, paper.height]);
        drawGratitudePage(page, DAYS_FULL[d], theme, fonts);
      }
      break;
    }
  }

  // Notes page if requested
  if (config.includeNotes) {
    const page = pdfDoc.addPage([paper.width, paper.height]);
    const { width: pw, height: ph } = page.getSize();
    drawRect(page, 0, ph - 55, pw, 55, theme.primary);
    page.drawText("Notes", {
      x: 40,
      y: ph - 38,
      size: 18,
      font: boldFont,
      color: rgb(1, 1, 1),
    });
    for (let i = 0; i < 30; i++) {
      const y = ph - 80 - i * 22;
      if (y < 40) break;
      drawLine(page, 40, y, pw - 40, y, theme.light, 0.3);
    }
  }

  return pdfDoc.save();
}
