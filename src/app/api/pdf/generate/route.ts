import { NextRequest, NextResponse } from "next/server";
import jsPDF from "jspdf";
import { type DesignStyle, DESIGN_STYLES } from "@/lib/pdf-design-styles";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ColorScheme {
  primary: number[];
  secondary: number[];
  accent: number[];
  bg: number[];
  text: number[];
  light: number[];
}

// ---------------------------------------------------------------------------
// Color Schemes
// ---------------------------------------------------------------------------
const COLOR_SCHEMES: Record<string, ColorScheme> = {
  "sage-green": {
    primary: [124, 154, 126],
    secondary: [181, 201, 183],
    accent: [74, 124, 89],
    bg: [248, 250, 248],
    text: [44, 62, 45],
    light: [232, 240, 232],
  },
  "dusty-rose": {
    primary: [196, 132, 122],
    secondary: [232, 180, 174],
    accent: [155, 94, 86],
    bg: [253, 248, 247],
    text: [61, 36, 34],
    light: [245, 230, 228],
  },
  "navy-gold": {
    primary: [27, 58, 92],
    secondary: [74, 111, 165],
    accent: [201, 168, 76],
    bg: [248, 249, 252],
    text: [13, 27, 42],
    light: [232, 237, 245],
  },
  "minimal-black": {
    primary: [26, 26, 26],
    secondary: [85, 85, 85],
    accent: [26, 26, 26],
    bg: [255, 255, 255],
    text: [26, 26, 26],
    light: [245, 245, 245],
  },
  lavender: {
    primary: [123, 104, 176],
    secondary: [176, 163, 212],
    accent: [91, 74, 144],
    bg: [250, 249, 253],
    text: [45, 38, 64],
    light: [237, 233, 246],
  },
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PAGE_W = 210; // A4 width mm
const PAGE_H = 297; // A4 height mm
const M = 15; // margin mm
const CW = PAGE_W - 2 * M; // content width

// ---------------------------------------------------------------------------
// Helper: spread RGB tuple into jsPDF color setters
// ---------------------------------------------------------------------------
function rgb(c: number[]): [number, number, number] {
  return [c[0], c[1], c[2]];
}

// ---------------------------------------------------------------------------
// Helper: applyTransform — text casing based on style
// ---------------------------------------------------------------------------
function applyTransform(text: string, transform: "uppercase" | "capitalize" | "none"): string {
  if (transform === "uppercase") return text.toUpperCase();
  if (transform === "capitalize") return text.charAt(0).toUpperCase() + text.slice(1);
  return text;
}

// ---------------------------------------------------------------------------
// Helper: drawHeader
// ---------------------------------------------------------------------------
function drawHeader(
  doc: jsPDF,
  scheme: ColorScheme,
  style: DesignStyle,
  title: string,
  subtitle?: string
) {
  const hH = style.header.height;

  // Colored header bar
  doc.setFillColor(...rgb(scheme.primary));
  if (style.header.cornerRadius > 0) {
    doc.roundedRect(0, 0, PAGE_W, hH, style.header.cornerRadius, style.header.cornerRadius, "F");
  } else {
    doc.rect(0, 0, PAGE_W, hH, "F");
  }

  doc.setFont("helvetica", style.header.fontStyle);
  doc.setFontSize(style.header.titleFontSize);
  doc.setTextColor(255, 255, 255);
  doc.text(applyTransform(title, style.header.titleTransform), M, hH * 0.636);

  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(style.header.subtitleFontSize);
    doc.text(subtitle, PAGE_W - M, hH * 0.636, { align: "right" });
  }

  // Optional bottom accent line
  if (style.header.hasBottomLine) {
    doc.setFillColor(...rgb(scheme.accent));
    doc.rect(0, hH, PAGE_W, 0.8, "F");
  }

  // Reset text color
  doc.setTextColor(...rgb(scheme.text));
}

// ---------------------------------------------------------------------------
// Helper: drawFooter
// ---------------------------------------------------------------------------
function drawFooter(
  doc: jsPDF,
  scheme: ColorScheme,
  style: DesignStyle,
  pageLabel: string
) {
  if (style.decorative.footerStyle === "bar") {
    // Filled rect (original behavior)
    doc.setFillColor(...rgb(scheme.light));
    doc.rect(0, PAGE_H - 10, PAGE_W, 10, "F");
  } else if (style.decorative.footerStyle === "line") {
    // Thin line above text
    doc.setDrawColor(...rgb(scheme.secondary));
    doc.setLineWidth(0.3);
    doc.line(M, PAGE_H - 10, PAGE_W - M, PAGE_H - 10);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
  }
  // "minimal": just text, no bar/line

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...rgb(scheme.secondary));
  doc.text(pageLabel, PAGE_W / 2, PAGE_H - 4, { align: "center" });
  doc.setTextColor(...rgb(scheme.text));
}

// ---------------------------------------------------------------------------
// Helper: drawSection — section box with colored title bar
// ---------------------------------------------------------------------------
function drawSection(
  doc: jsPDF,
  scheme: ColorScheme,
  style: DesignStyle,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string
): number {
  const tbH = style.section.titleBarHeight;
  const tbR = style.section.titleBarRadius;
  const bR = style.section.bodyRadius;

  // Title bar
  doc.setFillColor(...rgb(scheme.accent));
  doc.roundedRect(x, y, w, tbH, tbR, tbR, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(style.section.titleFontSize);
  doc.setTextColor(255, 255, 255);
  doc.text(applyTransform(title, style.section.titleTransform), x + 3, y + tbH * 0.714);
  doc.setTextColor(...rgb(scheme.text));

  // Optional shadow
  if (style.section.hasShadow) {
    doc.setFillColor(200, 200, 200);
    doc.roundedRect(x + 0.5, y + tbH + 0.5, w, h - tbH, bR, bR, "F");
  }

  // Body box
  doc.setFillColor(...rgb(scheme.light));
  doc.setDrawColor(...rgb(scheme.secondary));

  // Border style
  if (style.section.bodyBorderStyle === "dashed") {
    doc.setLineDashPattern([2, 1], 0);
  } else if (style.section.bodyBorderStyle === "dotted") {
    doc.setLineDashPattern([0.5, 1], 0);
  }

  doc.setLineWidth(style.section.bodyBorderWidth);

  if (style.section.bodyBorderStyle === "none") {
    doc.roundedRect(x, y + tbH, w, h - tbH, bR, bR, "F");
  } else {
    doc.roundedRect(x, y + tbH, w, h - tbH, bR, bR, "FD");
  }

  // Reset dash pattern
  doc.setLineDashPattern([], 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);

  return y + tbH; // returns top of body area
}

// ---------------------------------------------------------------------------
// Helper: drawCheckbox
// ---------------------------------------------------------------------------
function drawCheckbox(doc: jsPDF, style: DesignStyle, x: number, y: number) {
  const size = style.checkbox.size;
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(style.checkbox.lineWidth);

  switch (style.checkbox.style) {
    case "rounded":
      doc.roundedRect(x, y, size, size, 0.8, 0.8);
      break;
    case "circle":
      doc.circle(x + size / 2, y + size / 2, size / 2);
      break;
    case "bullet":
      doc.setFillColor(120, 120, 120);
      doc.circle(x + size / 2, y + size / 2, size / 4, "F");
      break;
    case "square":
    default:
      doc.rect(x, y, size, size);
      break;
  }

  doc.setLineWidth(0.2);
  doc.setDrawColor(0, 0, 0);
}

// ---------------------------------------------------------------------------
// Helper: drawCircleBullet
// ---------------------------------------------------------------------------
function drawCircleBullet(doc: jsPDF, scheme: ColorScheme, style: DesignStyle, x: number, y: number) {
  doc.setDrawColor(...rgb(scheme.accent));
  doc.setLineWidth(style.checkbox.lineWidth);
  doc.circle(x, y, 1.8);
  doc.setLineWidth(0.2);
  doc.setDrawColor(0, 0, 0);
}

// ---------------------------------------------------------------------------
// Helper: drawLines — ruled lines
// ---------------------------------------------------------------------------
function drawLines(
  doc: jsPDF,
  scheme: ColorScheme,
  style: DesignStyle,
  startY: number,
  count: number,
  width: number,
  startX: number,
  spacing?: number
) {
  const sp = spacing ?? style.spacing.lineSpacing;
  doc.setDrawColor(...rgb(scheme.secondary));
  doc.setLineWidth(style.borders.lineWidth);

  if (style.borders.lineStyle === "dashed") {
    doc.setLineDashPattern([2, 1], 0);
  } else if (style.borders.lineStyle === "dotted") {
    doc.setLineDashPattern([0.5, 1], 0);
  }

  for (let i = 0; i < count; i++) {
    const ly = startY + i * sp;
    doc.line(startX, ly, startX + width, ly);
  }

  doc.setLineDashPattern([], 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
}

// ---------------------------------------------------------------------------
// Helper: generateCoverPage
// ---------------------------------------------------------------------------
function generateCoverPage(
  doc: jsPDF,
  scheme: ColorScheme,
  style: DesignStyle,
  title: string,
  year: string,
  tagline: string
) {
  const sm = style.spacing.margin;

  // Full page background
  doc.setFillColor(...rgb(scheme.bg));
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");

  const coverStyle = style.decorative.coverStyle;

  if (coverStyle === "block") {
    // ---- BLOCK: Original design (colored top block) ----
    doc.setFillColor(...rgb(scheme.primary));
    doc.rect(0, 0, PAGE_W, 80, "F");

    doc.setFillColor(...rgb(scheme.accent));
    doc.rect(0, 80, PAGE_W, 3, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(year, PAGE_W / 2, 30, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(30);
    doc.text(title.toUpperCase(), PAGE_W / 2, 55, { align: "center" });

    doc.setFillColor(...rgb(scheme.secondary));
    const dotY = 100;
    for (let i = 0; i < 5; i++) {
      doc.circle(PAGE_W / 2 - 16 + i * 8, dotY, 1.2, "F");
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(...rgb(scheme.text));
    doc.text(tagline, PAGE_W / 2, 120, { align: "center" });

    doc.setFillColor(...rgb(scheme.light));
    doc.rect(sm + 20, 140, PAGE_W - 2 * sm - 40, 0.8, "F");

  } else if (coverStyle === "centered") {
    // ---- CENTERED: White page, title centered, thin border frame ----
    doc.setDrawColor(...rgb(scheme.secondary));
    doc.setLineWidth(0.4);
    doc.rect(sm, sm, PAGE_W - 2 * sm, PAGE_H - 2 * sm);
    doc.setLineWidth(0.2);
    doc.setDrawColor(0, 0, 0);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(14);
    doc.setTextColor(...rgb(scheme.secondary));
    doc.text(year, PAGE_W / 2, PAGE_H * 0.35, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(32);
    doc.setTextColor(...rgb(scheme.primary));
    doc.text(title.toUpperCase(), PAGE_W / 2, PAGE_H * 0.43, { align: "center" });

    doc.setFillColor(...rgb(scheme.accent));
    doc.rect(PAGE_W / 2 - 20, PAGE_H * 0.46, 40, 0.8, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(...rgb(scheme.text));
    doc.text(tagline, PAGE_W / 2, PAGE_H * 0.52, { align: "center" });

  } else if (coverStyle === "frame") {
    // ---- FRAME: Decorative double-line border, ornamental dividers ----
    doc.setDrawColor(...rgb(scheme.accent));
    doc.setLineWidth(0.6);
    doc.rect(sm - 2, sm - 2, PAGE_W - 2 * sm + 4, PAGE_H - 2 * sm + 4);
    doc.setLineWidth(0.2);
    doc.rect(sm + 2, sm + 2, PAGE_W - 2 * sm - 4, PAGE_H - 2 * sm - 4);
    doc.setDrawColor(0, 0, 0);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(14);
    doc.setTextColor(...rgb(scheme.secondary));
    doc.text(year, PAGE_W / 2, PAGE_H * 0.32, { align: "center" });

    // Ornamental divider above title
    doc.setDrawColor(...rgb(scheme.accent));
    doc.setLineWidth(0.3);
    doc.line(PAGE_W / 2 - 30, PAGE_H * 0.36, PAGE_W / 2 + 30, PAGE_H * 0.36);
    doc.setFillColor(...rgb(scheme.accent));
    doc.circle(PAGE_W / 2, PAGE_H * 0.36, 1.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.setTextColor(...rgb(scheme.primary));
    doc.text(title.toUpperCase(), PAGE_W / 2, PAGE_H * 0.43, { align: "center" });

    // Ornamental divider below title
    doc.setDrawColor(...rgb(scheme.accent));
    doc.line(PAGE_W / 2 - 30, PAGE_H * 0.46, PAGE_W / 2 + 30, PAGE_H * 0.46);
    doc.circle(PAGE_W / 2, PAGE_H * 0.46, 1.5, "F");
    doc.setDrawColor(0, 0, 0);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(...rgb(scheme.text));
    doc.text(tagline, PAGE_W / 2, PAGE_H * 0.52, { align: "center" });

  } else if (coverStyle === "minimal") {
    // ---- MINIMAL: Large title, small year, thin accent line, whitespace ----
    doc.setFont("helvetica", "bold");
    doc.setFontSize(36);
    doc.setTextColor(...rgb(scheme.primary));
    doc.text(title.toUpperCase(), PAGE_W / 2, PAGE_H * 0.4, { align: "center" });

    doc.setFillColor(...rgb(scheme.accent));
    doc.rect(PAGE_W / 2 - 15, PAGE_H * 0.43, 30, 0.6, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(...rgb(scheme.secondary));
    doc.text(year, PAGE_W / 2, PAGE_H * 0.48, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...rgb(scheme.text));
    doc.text(tagline, PAGE_W / 2, PAGE_H * 0.54, { align: "center" });

  } else if (coverStyle === "full-bleed") {
    // ---- FULL-BLEED: Entire page filled with primary color, white text ----
    doc.setFillColor(...rgb(scheme.primary));
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(year, PAGE_W / 2, PAGE_H * 0.33, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(34);
    doc.text(title.toUpperCase(), PAGE_W / 2, PAGE_H * 0.43, { align: "center" });

    doc.setFillColor(255, 255, 255);
    doc.rect(PAGE_W / 2 - 20, PAGE_H * 0.46, 40, 0.8, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(tagline, PAGE_W / 2, PAGE_H * 0.52, { align: "center" });
  }

  // "Belongs to" section (common to all styles)
  const belongsColor = coverStyle === "full-bleed" ? [255, 255, 255] as number[] : scheme.secondary;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...rgb(belongsColor));
  doc.text("This planner belongs to:", PAGE_W / 2, 170, { align: "center" });
  doc.setDrawColor(...rgb(belongsColor));
  doc.setLineWidth(0.3);
  doc.line(PAGE_W / 2 - 35, 180, PAGE_W / 2 + 35, 180);

  // Decorative corner accents (if style supports them)
  if (style.decorative.hasCornerAccents) {
    const cornerSize = 15;
    const cornerColor = coverStyle === "full-bleed" ? [255, 255, 255] as number[] : scheme.accent;
    doc.setDrawColor(...rgb(cornerColor));
    doc.setLineWidth(0.6);
    doc.line(sm, PAGE_H - 60, sm, PAGE_H - 60 + cornerSize);
    doc.line(sm, PAGE_H - 60, sm + cornerSize, PAGE_H - 60);
    doc.line(PAGE_W - sm, PAGE_H - 60 + cornerSize, PAGE_W - sm, PAGE_H - 60);
    doc.line(PAGE_W - sm, PAGE_H - 60, PAGE_W - sm - cornerSize, PAGE_H - 60);
  }

  doc.setLineWidth(0.2);
  doc.setDrawColor(0, 0, 0);

  // Brand watermark
  const wmColor = coverStyle === "full-bleed" ? [255, 255, 255] as number[] : scheme.secondary;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...rgb(wmColor));
  doc.text("CraftPlan Digital", PAGE_W / 2, PAGE_H - 15, {
    align: "center",
  });

  doc.setTextColor(...rgb(scheme.text));
}

// ---------------------------------------------------------------------------
// Helper: drawTableHeader
// ---------------------------------------------------------------------------
function drawTableHeader(
  doc: jsPDF,
  scheme: ColorScheme,
  style: DesignStyle,
  x: number,
  y: number,
  cols: { label: string; w: number }[],
  rowH: number = 7
) {
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  const ths = style.decorative.tableHeaderStyle;

  if (ths === "filled") {
    // Original behavior: solid background fill
    doc.setFillColor(...rgb(scheme.primary));
    doc.rect(x, y, totalW, rowH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    let cx = x;
    for (const col of cols) {
      doc.text(col.label, cx + col.w / 2, y + 5, { align: "center" });
      cx += col.w;
    }
    doc.setTextColor(...rgb(scheme.text));
  } else if (ths === "underline") {
    // No fill, underline below header text
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...rgb(scheme.primary));
    let cx = x;
    for (const col of cols) {
      doc.text(col.label, cx + col.w / 2, y + 5, { align: "center" });
      cx += col.w;
    }
    doc.setDrawColor(...rgb(scheme.primary));
    doc.setLineWidth(0.3);
    doc.line(x, y + rowH, x + totalW, y + rowH);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.setTextColor(...rgb(scheme.text));
  } else if (ths === "bordered") {
    // Border around each cell header, no fill
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...rgb(scheme.primary));
    doc.setDrawColor(...rgb(scheme.primary));
    doc.setLineWidth(style.borders.tableBorderWidth);
    let cx = x;
    for (const col of cols) {
      doc.rect(cx, y, col.w, rowH);
      doc.text(col.label, cx + col.w / 2, y + 5, { align: "center" });
      cx += col.w;
    }
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.setTextColor(...rgb(scheme.text));
  }

  return y + rowH;
}

// ---------------------------------------------------------------------------
// Helper: drawTableRows — empty rows with alternating bg
// ---------------------------------------------------------------------------
function drawTableRows(
  doc: jsPDF,
  scheme: ColorScheme,
  style: DesignStyle,
  x: number,
  y: number,
  cols: { label: string; w: number }[],
  numRows: number,
  rowH: number = 7,
  labels?: string[]
): number {
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");

  for (let r = 0; r < numRows; r++) {
    const ry = y + r * rowH;
    if (style.decorative.alternateRowShading) {
      if (r % 2 === 0) {
        doc.setFillColor(...rgb(scheme.light));
        doc.rect(x, ry, totalW, rowH, "F");
      }
    }
    // Draw cell borders
    doc.setDrawColor(...rgb(scheme.secondary));
    doc.setLineWidth(style.borders.tableBorderWidth);
    let cx = x;
    for (const col of cols) {
      doc.rect(cx, ry, col.w, rowH);
      cx += col.w;
    }
    // Optional row label in first cell
    if (labels && labels[r]) {
      doc.setTextColor(...rgb(scheme.text));
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(labels[r], x + 2, ry + 5);
    }
  }
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  return y + numRows * rowH;
}

// ===========================================================================
// 1. DAILY PLANNER (30 pages)
// ===========================================================================
function generateDailyPlanner(doc: jsPDF, scheme: ColorScheme, style: DesignStyle) {
  const year = new Date().getFullYear().toString();
  generateCoverPage(doc, scheme, style, "Daily Planner", year, "Plan your day, design your life");

  for (let day = 1; day <= 30; day++) {
    doc.addPage();

    // Background
    doc.setFillColor(...rgb(scheme.bg));
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");

    drawHeader(doc, scheme, style, "Daily Planner", `Date: ___/___/______`);
    let y = 28;

    // --- TOP 3 PRIORITIES ---
    const prioBodyY = drawSection(doc, scheme, style, M, y, CW, 30, "Top 3 Priorities");
    for (let i = 0; i < 3; i++) {
      const py = prioBodyY + 4 + i * 7;
      drawCircleBullet(doc, scheme, style, M + 5, py);
      doc.setDrawColor(...rgb(scheme.secondary));
      doc.setLineWidth(0.15);
      doc.line(M + 10, py + 1.5, M + CW - 4, py + 1.5);
    }
    y += 34;

    // --- HOURLY SCHEDULE ---
    const schedBodyY = drawSection(doc, scheme, style, M, y, CW, 128, "Hourly Schedule");
    const hours = [
      "7 AM","8 AM","9 AM","10 AM","11 AM","12 PM",
      "1 PM","2 PM","3 PM","4 PM","5 PM","6 PM",
      "7 PM","8 PM","9 PM",
    ];
    const rowH = 8;
    doc.setFontSize(7);
    for (let i = 0; i < hours.length; i++) {
      const ry = schedBodyY + 2 + i * rowH;
      if (i % 2 === 0) {
        doc.setFillColor(...rgb(scheme.bg));
        doc.rect(M + 1, ry, CW - 2, rowH, "F");
      }
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...rgb(scheme.accent));
      doc.setFontSize(7);
      doc.text(hours[i], M + 4, ry + 5.5);
      doc.setDrawColor(...rgb(scheme.secondary));
      doc.setLineWidth(0.1);
      doc.line(M + 18, ry + rowH, M + CW - 2, ry + rowH);
    }
    doc.setTextColor(...rgb(scheme.text));
    y += 132;

    // --- NOTES ---
    const notesBodyY = drawSection(doc, scheme, style, M, y, CW, 34, "Notes");
    drawLines(doc, scheme, style, notesBodyY + 6, 4, CW - 8, M + 4, 6);
    y += 38;

    // --- HABIT TRACKER ---
    const habitBodyY = drawSection(doc, scheme, style, M, y, CW, 18, "Habit Tracker");
    const habits = ["Water", "Exercise", "Read", "Meditate", "Sleep", "Gratitude"];
    const hSpacing = CW / habits.length;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...rgb(scheme.text));
    for (let i = 0; i < habits.length; i++) {
      const hx = M + i * hSpacing + hSpacing / 2;
      drawCheckbox(doc, style, hx - 1.75, habitBodyY + 3);
      doc.text(habits[i], hx, habitBodyY + 12, { align: "center" });
    }

    drawFooter(doc, scheme, style, `Day ${day} of 30`);
  }
}

// ===========================================================================
// 2. WEEKLY PLANNER (14 pages)
// ===========================================================================
function generateWeeklyPlanner(doc: jsPDF, scheme: ColorScheme, style: DesignStyle) {
  const year = new Date().getFullYear().toString();
  generateCoverPage(doc, scheme, style, "Weekly Planner", year, "Plan your week, own your time");

  // --- Goals Page ---
  doc.addPage();
  doc.setFillColor(...rgb(scheme.bg));
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  drawHeader(doc, scheme, style, "Yearly Goals", year);

  let y = 30;
  const goalCategories = [
    "Personal Growth",
    "Health & Wellness",
    "Career & Finance",
    "Relationships",
    "Creativity & Fun",
  ];
  for (const cat of goalCategories) {
    const bodyY = drawSection(doc, scheme, style, M, y, CW, 42, cat);
    for (let i = 0; i < 5; i++) {
      const ly = bodyY + 5 + i * 6.5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...rgb(scheme.secondary));
      doc.text(`${i + 1}.`, M + 4, ly);
      doc.setDrawColor(...rgb(scheme.secondary));
      doc.setLineWidth(0.12);
      doc.line(M + 10, ly + 1, M + CW - 4, ly + 1);
    }
    y += 46;
  }
  drawFooter(doc, scheme, style, "Goals");

  // --- 12 Weekly Spreads ---
  for (let week = 1; week <= 12; week++) {
    doc.addPage();
    doc.setFillColor(...rgb(scheme.bg));
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");
    drawHeader(doc, scheme, style, `Week ${week}`, "Mon — Sun");

    y = 28;

    // Weekly Goals + Focus (left sidebar)
    const sideW = 50;
    const goalBody = drawSection(doc, scheme, style, M, y, sideW, 50, "Weekly Goals");
    for (let i = 0; i < 5; i++) {
      const gy = goalBody + 4 + i * 7;
      drawCheckbox(doc, style, M + 4, gy);
      doc.setDrawColor(...rgb(scheme.secondary));
      doc.setLineWidth(0.12);
      doc.line(M + 10, gy + 2.5, M + sideW - 3, gy + 2.5);
    }

    // Focus area
    const focusBody = drawSection(doc, scheme, style, M, y + 54, sideW, 20, "Focus Area");
    drawLines(doc, scheme, style, focusBody + 5, 2, sideW - 8, M + 4, 6);

    // Day grid (right side: 3 cols, rows for 7 days)
    const dayGridX = M + sideW + 4;
    const dayGridW = CW - sideW - 4;
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const colW = dayGridW / 3;
    const dayBoxH = 28;

    let dIdx = 0;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3 && dIdx < 7; col++) {
        const dx = dayGridX + col * colW;
        const dy = y + row * (dayBoxH + 2);

        // Day box
        doc.setFillColor(...rgb(scheme.light));
        doc.setDrawColor(...rgb(scheme.secondary));
        doc.setLineWidth(0.2);
        doc.roundedRect(dx, dy, colW - 1.5, dayBoxH, 1, 1, "FD");

        // Day label
        doc.setFillColor(...rgb(scheme.accent));
        doc.roundedRect(dx, dy, colW - 1.5, 6, 1, 1, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(255, 255, 255);
        doc.text(days[dIdx], dx + 2, dy + 4.2);
        doc.setTextColor(...rgb(scheme.text));

        // Task lines
        for (let t = 0; t < 3; t++) {
          const ty = dy + 9 + t * 5.5;
          drawCheckbox(doc, style, dx + 2, ty);
          doc.setDrawColor(...rgb(scheme.secondary));
          doc.setLineWidth(0.1);
          doc.line(dx + 6, ty + 2, dx + colW - 3, ty + 2);
        }
        dIdx++;
      }
    }

    // Bottom area: Meal Plan + Budget
    const bottomY = y + 3 * (dayBoxH + 2) + 4;

    // Meal Plan
    const mealW = CW * 0.65;
    const mealBody = drawSection(doc, scheme, style, M, bottomY, mealW, 35, "Meal Plan");
    const mealDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const mealColW = (mealW - 4) / 7;
    for (let i = 0; i < 7; i++) {
      const mx = M + 2 + i * mealColW;
      const my = mealBody + 2;
      doc.setFillColor(...(i % 2 === 0 ? rgb(scheme.bg) : rgb(scheme.light)));
      doc.rect(mx, my, mealColW, 26, "F");
      doc.setDrawColor(...rgb(scheme.secondary));
      doc.setLineWidth(0.12);
      doc.rect(mx, my, mealColW, 26);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.5);
      doc.setTextColor(...rgb(scheme.accent));
      doc.text(mealDays[i], mx + mealColW / 2, my + 4, { align: "center" });
      doc.setTextColor(...rgb(scheme.text));
    }

    // Weekly Budget
    const budgetX = M + mealW + 4;
    const budgetW = CW - mealW - 4;
    const budgetBody = drawSection(doc, scheme, style, budgetX, bottomY, budgetW, 35, "Weekly Budget");
    const budgetItems = ["Budget:", "Spent:", "Remaining:"];
    for (let i = 0; i < budgetItems.length; i++) {
      const by = budgetBody + 5 + i * 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(budgetItems[i], budgetX + 3, by);
      doc.setDrawColor(...rgb(scheme.secondary));
      doc.setLineWidth(0.12);
      doc.line(budgetX + 22, by + 1, budgetX + budgetW - 3, by + 1);
    }

    drawFooter(doc, scheme, style, `Week ${week} of 12`);
  }
}

// ===========================================================================
// 3. MONTHLY PLANNER (14 pages)
// ===========================================================================
function generateMonthlyPlanner(doc: jsPDF, scheme: ColorScheme, style: DesignStyle) {
  const year = new Date().getFullYear();
  generateCoverPage(doc, scheme, style, "Monthly Planner", year.toString(), "Organize every month with purpose");

  // --- Year Overview ---
  doc.addPage();
  doc.setFillColor(...rgb(scheme.bg));
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  drawHeader(doc, scheme, style, `${year} Year at a Glance`, "");

  const miniMonths = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];
  const miniCols = 3;
  const miniRows = 4;
  const miniW = (CW - 8) / miniCols;
  const miniH = 58;

  for (let r = 0; r < miniRows; r++) {
    for (let c = 0; c < miniCols; c++) {
      const mIdx = r * miniCols + c;
      const mx = M + c * (miniW + 4);
      const my = 28 + r * (miniH + 4);

      doc.setFillColor(...rgb(scheme.light));
      doc.setDrawColor(...rgb(scheme.secondary));
      doc.roundedRect(mx, my, miniW, miniH, 1.5, 1.5, "FD");

      doc.setFillColor(...rgb(scheme.accent));
      doc.roundedRect(mx, my, miniW, 7, 1.5, 1.5, "F");
      // Fill bottom corners of title bar
      doc.rect(mx, my + 5, miniW, 2, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text(miniMonths[mIdx], mx + miniW / 2, my + 5, { align: "center" });
      doc.setTextColor(...rgb(scheme.text));

      // Mini day headers
      const dayLabels = ["M", "T", "W", "T", "F", "S", "S"];
      const dw = (miniW - 4) / 7;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5);
      doc.setTextColor(...rgb(scheme.accent));
      for (let d = 0; d < 7; d++) {
        doc.text(dayLabels[d], mx + 2 + d * dw + dw / 2, my + 13, { align: "center" });
      }

      // Mini calendar numbers
      const firstDay = new Date(year, mIdx, 1).getDay();
      const daysInMonth = new Date(year, mIdx + 1, 0).getDate();
      const startCol = firstDay === 0 ? 6 : firstDay - 1; // Monday start
      doc.setFont("helvetica", "normal");
      doc.setFontSize(4.5);
      doc.setTextColor(...rgb(scheme.text));
      let dayNum = 1;
      for (let wr = 0; wr < 6 && dayNum <= daysInMonth; wr++) {
        for (let dc = 0; dc < 7 && dayNum <= daysInMonth; dc++) {
          if (wr === 0 && dc < startCol) continue;
          const dx = mx + 2 + dc * dw + dw / 2;
          const dy = my + 18 + wr * 6;
          doc.text(dayNum.toString(), dx, dy, { align: "center" });
          dayNum++;
        }
      }
    }
  }
  drawFooter(doc, scheme, style, "Year Overview");

  // --- 12 Monthly Pages ---
  for (let month = 0; month < 12; month++) {
    doc.addPage();
    doc.setFillColor(...rgb(scheme.bg));
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");
    drawHeader(doc, scheme, style, miniMonths[month], year.toString());

    let y = 28;

    // Calendar grid
    const calW = CW * 0.72;
    const calX = M;
    const calColW = calW / 7;
    const calRowH = 22;

    // Day headers
    const dayHeaders = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
    doc.setFillColor(...rgb(scheme.accent));
    doc.rect(calX, y, calW, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(255, 255, 255);
    for (let d = 0; d < 7; d++) {
      doc.text(dayHeaders[d], calX + d * calColW + calColW / 2, y + 5, { align: "center" });
    }
    doc.setTextColor(...rgb(scheme.text));
    y += 7;

    // Calendar cells
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startCol = firstDay === 0 ? 6 : firstDay - 1;

    let dayNum = 1;
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 7; col++) {
        const cx = calX + col * calColW;
        const cy = y + row * calRowH;

        doc.setFillColor(...(row % 2 === 0 ? rgb(scheme.light) : rgb(scheme.bg)));
        doc.setDrawColor(...rgb(scheme.secondary));
        doc.setLineWidth(0.12);
        doc.rect(cx, cy, calColW, calRowH, "FD");

        if ((row === 0 && col >= startCol) || (row > 0 && dayNum <= daysInMonth)) {
          if (dayNum <= daysInMonth) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(7);
            doc.setTextColor(...rgb(scheme.accent));
            doc.text(dayNum.toString(), cx + 2, cy + 5);
            doc.setTextColor(...rgb(scheme.text));
            dayNum++;
          }
        }
      }
      if (dayNum > daysInMonth) break;
    }

    // Side panel
    const sideX = M + calW + 3;
    const sideW = CW - calW - 3;
    let sideY = 28;

    // Monthly Goals
    const goalsBody = drawSection(doc, scheme, style, sideX, sideY, sideW, 65, "Monthly Goals");
    for (let i = 0; i < 5; i++) {
      const gy = goalsBody + 5 + i * 10;
      drawCheckbox(doc, style, sideX + 3, gy);
      drawLines(doc, scheme, style, gy + 2.5, 1, sideW - 12, sideX + 9, 6);
    }
    sideY += 69;

    // Habit Tracker (simplified: 10 habits x visual grid)
    const habitBody = drawSection(doc, scheme, style, sideX, sideY, sideW, 80, "Habit Tracker");
    const habitNames = ["Water", "Exercise", "Read", "Meditate", "Sleep", "Veggies", "Journal", "Vitamins", "Walk", "No Sugar"];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5);
    for (let h = 0; h < habitNames.length; h++) {
      const hy = habitBody + 4 + h * 7;
      doc.setTextColor(...rgb(scheme.text));
      doc.text(habitNames[h], sideX + 2, hy + 2);
      // Mini checkbox row (simplified: show 7 boxes representing week markers)
      for (let d = 0; d < 5; d++) {
        drawCheckbox(doc, style, sideX + 23 + d * 5, hy);
      }
    }

    // Notes
    const notesY = Math.max(y + 6 * calRowH + 4, 220);
    if (notesY + 40 < PAGE_H - 15) {
      const notesBody = drawSection(doc, scheme, style, M, notesY, CW, 35, "Notes");
      drawLines(doc, scheme, style, notesBody + 6, 4, CW - 8, M + 4, 6);
    }

    drawFooter(doc, scheme, style, `${miniMonths[month]} ${year}`);
  }
}

// ===========================================================================
// 4. BUDGET PLANNER (16 pages)
// ===========================================================================
function generateBudgetPlanner(doc: jsPDF, scheme: ColorScheme, style: DesignStyle) {
  const year = new Date().getFullYear();
  generateCoverPage(doc, scheme, style, "Budget Planner", year.toString(), "Take control of your finances");

  const months = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];

  // --- 12 Monthly Budget Sheets ---
  for (let m = 0; m < 12; m++) {
    doc.addPage();
    doc.setFillColor(...rgb(scheme.bg));
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");
    drawHeader(doc, scheme, style, `${months[m]} Budget`, year.toString());

    let y = 28;

    // INCOME TABLE
    const incomeBody = drawSection(doc, scheme, style, M, y, CW, 46, "Income");
    const incomeCols = [
      { label: "Source", w: CW * 0.5 },
      { label: "Expected", w: CW * 0.25 },
      { label: "Actual", w: CW * 0.25 },
    ];
    let ty = drawTableHeader(doc, scheme, style, M, incomeBody + 2, incomeCols);
    const incomeLabels = ["Salary", "Freelance / Side Income", "Investments", "Other", "TOTAL"];
    ty = drawTableRows(doc, scheme, style, M, ty, incomeCols, 5, 7, incomeLabels);
    y += 50;

    // EXPENSES TABLE
    const expenseBody = drawSection(doc, scheme, style, M, y, CW, 126, "Expenses");
    const expenseCols = [
      { label: "Category", w: CW * 0.4 },
      { label: "Budgeted", w: CW * 0.2 },
      { label: "Actual", w: CW * 0.2 },
      { label: "Difference", w: CW * 0.2 },
    ];
    ty = drawTableHeader(doc, scheme, style, M, expenseBody + 2, expenseCols);
    const expenseLabels = [
      "Housing / Rent",
      "Utilities",
      "Groceries",
      "Transportation",
      "Insurance",
      "Phone / Internet",
      "Entertainment",
      "Clothing",
      "Health / Medical",
      "Subscriptions",
      "Dining Out",
      "Personal Care",
      "Savings",
      "Other",
      "TOTAL",
    ];
    ty = drawTableRows(doc, scheme, style, M, ty, expenseCols, 15, 7, expenseLabels);
    y += 130;

    // NET SAVINGS BOX
    const savBody = drawSection(doc, scheme, style, M, y, CW, 22, "Net Savings");
    const savItems = [
      { label: "Total Income:", x: M + 5 },
      { label: "Total Expenses:", x: M + 55 },
      { label: "NET SAVINGS:", x: M + 115 },
    ];
    doc.setFontSize(8);
    for (const item of savItems) {
      doc.setFont("helvetica", "bold");
      doc.text(item.label, item.x, savBody + 10);
      doc.setFont("helvetica", "normal");
      doc.setDrawColor(...rgb(scheme.secondary));
      doc.setLineWidth(0.15);
      const lineStart = item.x + doc.getTextWidth(item.label) + 2;
      doc.line(lineStart, savBody + 11, lineStart + 28, savBody + 11);
    }

    drawFooter(doc, scheme, style, `${months[m]} ${year}`);
  }

  // --- Annual Summary Page ---
  doc.addPage();
  doc.setFillColor(...rgb(scheme.bg));
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  drawHeader(doc, scheme, style, "Annual Summary", year.toString());

  let y = 28;
  const annualBody = drawSection(doc, scheme, style, M, y, CW, 120, "Monthly Overview");
  const annCols = [
    { label: "Month", w: CW * 0.25 },
    { label: "Income", w: CW * 0.25 },
    { label: "Expenses", w: CW * 0.25 },
    { label: "Savings", w: CW * 0.25 },
  ];
  let annY = drawTableHeader(doc, scheme, style, M, annualBody + 2, annCols);
  annY = drawTableRows(doc, scheme, style, M, annY, annCols, 12, 8.5, months);
  // Totals row
  doc.setFillColor(...rgb(scheme.primary));
  const annTotalW = annCols.reduce((s, c) => s + c.w, 0);
  doc.rect(M, annY, annTotalW, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("ANNUAL TOTAL", M + 4, annY + 5.5);
  doc.setTextColor(...rgb(scheme.text));
  y += 124;

  drawFooter(doc, scheme, style, "Annual Summary");

  // --- Savings Goals Page ---
  doc.addPage();
  doc.setFillColor(...rgb(scheme.bg));
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  drawHeader(doc, scheme, style, "Savings Goals", year.toString());

  y = 28;
  for (let g = 0; g < 4; g++) {
    const gBody = drawSection(doc, scheme, style, M, y, CW, 50, `Savings Goal ${g + 1}`);
    const fields = ["Goal Name:", "Target Amount:", "Deadline:", "Monthly Contribution:"];
    for (let f = 0; f < fields.length; f++) {
      const fy = gBody + 5 + f * 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(fields[f], M + 4, fy);
      doc.setDrawColor(...rgb(scheme.secondary));
      doc.setLineWidth(0.15);
      doc.line(M + 42, fy + 1, M + CW - 4, fy + 1);
    }

    // Progress bar placeholder
    const pby = gBody + 38;
    doc.setFontSize(7);
    doc.text("Progress:", M + 4, pby);
    doc.setFillColor(...rgb(scheme.light));
    doc.roundedRect(M + 22, pby - 3, CW - 26, 5, 2, 2, "FD");

    y += 54;
  }
  drawFooter(doc, scheme, style, "Savings Goals");

  // --- Debt Tracker Page ---
  doc.addPage();
  doc.setFillColor(...rgb(scheme.bg));
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  drawHeader(doc, scheme, style, "Debt Tracker", year.toString());

  y = 28;
  const debtBody = drawSection(doc, scheme, style, M, y, CW, 80, "Debts Overview");
  const debtCols = [
    { label: "Creditor", w: CW * 0.2 },
    { label: "Total Owed", w: CW * 0.15 },
    { label: "Interest %", w: CW * 0.13 },
    { label: "Min Payment", w: CW * 0.15 },
    { label: "Actual Payment", w: CW * 0.17 },
    { label: "Remaining", w: CW * 0.2 },
  ];
  let debtY = drawTableHeader(doc, scheme, style, M, debtBody + 2, debtCols);
  debtY = drawTableRows(doc, scheme, style, M, debtY, debtCols, 8, 8);

  y += 84;

  // Payoff strategy
  const stratBody = drawSection(doc, scheme, style, M, y, CW, 50, "Payoff Strategy");
  const strategies = [
    "Debt Snowball (smallest balance first)",
    "Debt Avalanche (highest interest first)",
    "Custom priority",
  ];
  for (let s = 0; s < strategies.length; s++) {
    const sy = stratBody + 6 + s * 10;
    drawCheckbox(doc, style, M + 4, sy);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(strategies[s], M + 11, sy + 3);
  }

  // Notes
  drawLines(doc, scheme, style, stratBody + 38, 2, CW - 8, M + 4, 6);

  drawFooter(doc, scheme, style, "Debt Tracker");
}

// ===========================================================================
// 5. FITNESS PLANNER (18 pages)
// ===========================================================================
function generateFitnessPlanner(doc: jsPDF, scheme: ColorScheme, style: DesignStyle) {
  const year = new Date().getFullYear();
  generateCoverPage(doc, scheme, style, "Fitness Planner", year.toString(), "Stronger every day");

  // --- Body Measurements Page ---
  doc.addPage();
  doc.setFillColor(...rgb(scheme.bg));
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  drawHeader(doc, scheme, style, "Body Measurements", "Track your progress");

  let y = 28;
  const measBody = drawSection(doc, scheme, style, M, y, CW, 100, "Measurements Log");
  const measCols = [
    { label: "Date", w: CW * 0.15 },
    { label: "Weight", w: CW * 0.12 },
    { label: "Chest", w: CW * 0.1 },
    { label: "Waist", w: CW * 0.1 },
    { label: "Hips", w: CW * 0.1 },
    { label: "L Arm", w: CW * 0.1 },
    { label: "R Arm", w: CW * 0.1 },
    { label: "L Thigh", w: CW * 0.115 },
    { label: "R Thigh", w: CW * 0.105 },
  ];
  let measY = drawTableHeader(doc, scheme, style, M, measBody + 2, measCols);
  measY = drawTableRows(doc, scheme, style, M, measY, measCols, 10, 8);
  y += 104;

  // Goals section
  const fitGoalBody = drawSection(doc, scheme, style, M, y, CW, 55, "Fitness Goals");
  const goalFields = [
    "Target Weight:",
    "Target Body Fat %:",
    "Strength Goal:",
    "Cardio Goal:",
    "Flexibility Goal:",
  ];
  for (let i = 0; i < goalFields.length; i++) {
    const gy = fitGoalBody + 5 + i * 9;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(goalFields[i], M + 4, gy);
    doc.setDrawColor(...rgb(scheme.secondary));
    doc.setLineWidth(0.15);
    doc.line(M + 42, gy + 1, M + CW - 4, gy + 1);
  }

  drawFooter(doc, scheme, style, "Body Measurements");

  // --- 4 Weekly Workout Log Pages ---
  for (let week = 1; week <= 4; week++) {
    doc.addPage();
    doc.setFillColor(...rgb(scheme.bg));
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");
    drawHeader(doc, scheme, style, `Week ${week} Workout Log`, "");

    y = 28;

    const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const workoutCols = [
      { label: "Exercise", w: CW * 0.35 },
      { label: "Sets", w: CW * 0.15 },
      { label: "Reps", w: CW * 0.15 },
      { label: "Weight", w: CW * 0.15 },
      { label: "Notes", w: CW * 0.2 },
    ];

    for (let d = 0; d < 6; d++) {
      const dayBody = drawSection(doc, scheme, style, M, y, CW, 28, dayNames[d]);
      const headerY = drawTableHeader(doc, scheme, style, M, dayBody + 1, workoutCols, 5.5);
      drawTableRows(doc, scheme, style, M, headerY, workoutCols, 3, 5.5);
      y += 31;
    }

    // Rest day
    const restBody = drawSection(doc, scheme, style, M, y, CW * 0.45, 16, "Sunday — Rest Day");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("Recovery notes:", M + 4, restBody + 8);
    doc.setDrawColor(...rgb(scheme.secondary));
    doc.setLineWidth(0.12);
    doc.line(M + 30, restBody + 9, M + CW * 0.45 - 4, restBody + 9);

    // Weekly measurements
    const wmX = M + CW * 0.48;
    const wmW = CW * 0.52;
    const wmBody = drawSection(doc, scheme, style, wmX, y, wmW, 16, "Weekly Check-In");
    const wmItems = ["Weight:", "Waist:", "Hips:", "Arms:"];
    const wmSpacing = (wmW - 8) / 4;
    for (let i = 0; i < wmItems.length; i++) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.text(wmItems[i], wmX + 3 + i * wmSpacing, wmBody + 8);
    }

    drawFooter(doc, scheme, style, `Week ${week} of 4`);
  }

  // --- 12 Monthly Tracker Pages ---
  const months = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];
  for (let m = 0; m < 12; m++) {
    doc.addPage();
    doc.setFillColor(...rgb(scheme.bg));
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");
    drawHeader(doc, scheme, style, `${months[m]} Fitness Tracker`, year.toString());

    y = 28;

    // Workout log table
    const logBody = drawSection(doc, scheme, style, M, y, CW, 120, "Monthly Workout Log");
    const logCols = [
      { label: "Date", w: CW * 0.12 },
      { label: "Workout Type", w: CW * 0.22 },
      { label: "Duration", w: CW * 0.13 },
      { label: "Intensity", w: CW * 0.13 },
      { label: "Calories", w: CW * 0.13 },
      { label: "Notes", w: CW * 0.27 },
    ];
    let logY = drawTableHeader(doc, scheme, style, M, logBody + 2, logCols);
    logY = drawTableRows(doc, scheme, style, M, logY, logCols, 14, 7.5);
    y += 124;

    // Monthly stats
    const statBody = drawSection(doc, scheme, style, M, y, CW, 28, "Monthly Stats");
    const stats = [
      "Total Workouts:",
      "Total Duration:",
      "Avg Intensity:",
      "Weight Change:",
    ];
    const statSpacing = CW / 4;
    for (let s = 0; s < stats.length; s++) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(stats[s], M + 4 + s * statSpacing, statBody + 8);
      doc.setDrawColor(...rgb(scheme.secondary));
      doc.setLineWidth(0.12);
      doc.line(
        M + 4 + s * statSpacing,
        statBody + 16,
        M + 4 + s * statSpacing + statSpacing - 8,
        statBody + 16
      );
    }

    // Notes
    y += 32;
    if (y + 30 < PAGE_H - 15) {
      const notesBody = drawSection(doc, scheme, style, M, y, CW, 25, "Notes & Reflections");
      drawLines(doc, scheme, style, notesBody + 5, 3, CW - 8, M + 4, 5.5);
    }

    drawFooter(doc, scheme, style, `${months[m]} ${year}`);
  }
}

// ===========================================================================
// 6. SELF-CARE PLANNER (16 pages)
// ===========================================================================
function generateSelfCarePlanner(doc: jsPDF, scheme: ColorScheme, style: DesignStyle) {
  const year = new Date().getFullYear();
  generateCoverPage(doc, scheme, style, "Self-Care Planner", year.toString(), "Nurture your mind, body & soul");

  // --- Self-Care Menu Page ---
  doc.addPage();
  doc.setFillColor(...rgb(scheme.bg));
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  drawHeader(doc, scheme, style, "My Self-Care Menu", "Choose what nourishes you");

  let y = 30;
  const categories = [
    { title: "Physical", items: ["Go for a walk", "Stretch / Yoga", "Dance", "Take a bath", "Cook a healthy meal"] },
    { title: "Emotional", items: ["Journal feelings", "Talk to a friend", "Cry if needed", "Set a boundary", "Practice self-compassion"] },
    { title: "Mental", items: ["Read a book", "Puzzle / Brain game", "Learn something new", "Digital detox", "Organize a space"] },
    { title: "Social", items: ["Call a loved one", "Plan a date", "Join a group", "Write a letter", "Volunteer"] },
    { title: "Spiritual", items: ["Meditate", "Spend time in nature", "Practice gratitude", "Pray or reflect", "Create art"] },
  ];

  for (const cat of categories) {
    const catBody = drawSection(doc, scheme, style, M, y, CW, 38, cat.title);
    for (let i = 0; i < cat.items.length; i++) {
      const ix = M + 4 + (i % 3) * (CW / 3);
      const iy = catBody + 6 + Math.floor(i / 3) * 12;
      drawCheckbox(doc, style, ix, iy);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(cat.items[i], ix + 5, iy + 2.5);
    }
    y += 42;
  }
  drawFooter(doc, scheme, style, "Self-Care Menu");

  // --- 14 Daily Self-Care Pages ---
  for (let day = 1; day <= 14; day++) {
    doc.addPage();
    doc.setFillColor(...rgb(scheme.bg));
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");
    drawHeader(doc, scheme, style, "Self-Care Daily Check-In", `Date: ___/___/______`);

    y = 28;

    // Mood Tracker
    const moodBody = drawSection(doc, scheme, style, M, y, CW, 26, "How Am I Feeling?");
    const moods = [
      { label: "Great", symbol: ":)" },
      { label: "Good", symbol: ":>" },
      { label: "Okay", symbol: ":|" },
      { label: "Low", symbol: ":(" },
      { label: "Tired", symbol: "zZ" },
    ];
    const moodSpacing = CW / moods.length;
    for (let i = 0; i < moods.length; i++) {
      const mx = M + i * moodSpacing + moodSpacing / 2;
      const my = moodBody + 6;
      // Draw circle
      doc.setDrawColor(...rgb(scheme.accent));
      doc.setLineWidth(0.5);
      doc.circle(mx, my, 5);
      // Symbol inside
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...rgb(scheme.accent));
      doc.text(moods[i].symbol, mx, my + 2, { align: "center" });
      // Label below
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(...rgb(scheme.text));
      doc.text(moods[i].label, mx, my + 12, { align: "center" });
    }
    doc.setLineWidth(0.2);
    doc.setDrawColor(0, 0, 0);
    y += 30;

    // Gratitude
    const gratBody = drawSection(doc, scheme, style, M, y, CW, 32, "Gratitude");
    for (let i = 0; i < 3; i++) {
      const gy = gratBody + 5 + i * 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...rgb(scheme.secondary));
      doc.text(`${i + 1}. I am grateful for...`, M + 4, gy);
      doc.setDrawColor(...rgb(scheme.secondary));
      doc.setLineWidth(0.12);
      doc.line(M + 38, gy + 1, M + CW - 4, gy + 1);
    }
    doc.setTextColor(...rgb(scheme.text));
    y += 36;

    // Affirmation
    const affBody = drawSection(doc, scheme, style, M, y, CW, 22, "Today's Affirmation");
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...rgb(scheme.secondary));
    doc.text('"I am..."', M + 4, affBody + 6);
    drawLines(doc, scheme, style, affBody + 10, 2, CW - 8, M + 4, 5);
    doc.setTextColor(...rgb(scheme.text));
    y += 26;

    // Self-Care Activities Checklist
    const actBody = drawSection(doc, scheme, style, M, y, CW, 42, "Self-Care Activities");
    const activities = [
      "Slept 8+ hours",
      "Drank enough water",
      "Moved my body",
      "Went outside / Fresh air",
      "Connected with someone",
      "Did something creative",
      "Rested when needed",
    ];
    for (let i = 0; i < activities.length; i++) {
      const col = i < 4 ? 0 : 1;
      const row = i < 4 ? i : i - 4;
      const ax = M + 4 + col * (CW / 2);
      const ay = actBody + 5 + row * 8;
      drawCheckbox(doc, style, ax, ay);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(activities[i], ax + 6, ay + 3);
    }
    y += 46;

    // Energy Level
    const energyBody = drawSection(doc, scheme, style, M, y, CW, 18, "Energy Level");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("Morning:", M + 4, energyBody + 8);
    doc.text("Afternoon:", M + CW * 0.35, energyBody + 8);
    doc.text("Evening:", M + CW * 0.68, energyBody + 8);
    // Rating dots
    for (let seg = 0; seg < 3; seg++) {
      const baseX = M + 22 + seg * (CW * 0.33);
      for (let dot = 0; dot < 5; dot++) {
        doc.setDrawColor(...rgb(scheme.secondary));
        doc.circle(baseX + dot * 5, energyBody + 7, 1.5);
      }
    }
    y += 22;

    // Evening Reflection
    const reflBody = drawSection(doc, scheme, style, M, y, CW, 30, "Evening Reflection");
    const reflPrompts = [
      "What went well today?",
      "What could I improve?",
      "What am I looking forward to?",
    ];
    for (let i = 0; i < reflPrompts.length; i++) {
      const ry = reflBody + 5 + i * 8;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6.5);
      doc.setTextColor(...rgb(scheme.secondary));
      doc.text(reflPrompts[i], M + 4, ry);
      doc.setDrawColor(...rgb(scheme.secondary));
      doc.setLineWidth(0.12);
      doc.line(M + 4, ry + 4.5, M + CW - 4, ry + 4.5);
    }
    doc.setTextColor(...rgb(scheme.text));

    drawFooter(doc, scheme, style, `Day ${day} of 14`);
  }
}

// ===========================================================================
// 7. BUSINESS PLANNER (16 pages)
// ===========================================================================
function generateBusinessPlanner(doc: jsPDF, scheme: ColorScheme, style: DesignStyle) {
  const year = new Date().getFullYear();
  generateCoverPage(doc, scheme, style, "Business Planner", year.toString(), "Grow your business with clarity");

  const months = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];

  // --- Revenue Goals Page ---
  doc.addPage();
  doc.setFillColor(...rgb(scheme.bg));
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  drawHeader(doc, scheme, style, "Annual Revenue Goals", year.toString());

  let y = 28;
  const revBody = drawSection(doc, scheme, style, M, y, CW, 120, "Revenue Goals by Quarter");
  const quarters = ["Q1 (Jan-Mar)", "Q2 (Apr-Jun)", "Q3 (Jul-Sep)", "Q4 (Oct-Dec)"];
  for (let q = 0; q < 4; q++) {
    const qy = revBody + 5 + q * 27;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...rgb(scheme.accent));
    doc.text(quarters[q], M + 4, qy);
    doc.setTextColor(...rgb(scheme.text));

    const qFields = ["Revenue Target:", "Key Products/Services:", "Marketing Strategy:"];
    for (let f = 0; f < qFields.length; f++) {
      const fy = qy + 5 + f * 6.5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(qFields[f], M + 8, fy);
      doc.setDrawColor(...rgb(scheme.secondary));
      doc.setLineWidth(0.12);
      doc.line(M + 45, fy + 1, M + CW - 4, fy + 1);
    }
  }
  y += 124;

  // Annual Target Summary
  const annBody = drawSection(doc, scheme, style, M, y, CW, 30, "Annual Target Summary");
  const summaryItems = ["Annual Revenue Goal:", "Annual Profit Goal:", "New Customers Goal:", "Key Metric:"];
  for (let i = 0; i < summaryItems.length; i++) {
    const sx = M + 4 + (i % 2) * (CW / 2);
    const sy = annBody + 6 + Math.floor(i / 2) * 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(summaryItems[i], sx, sy);
    doc.setDrawColor(...rgb(scheme.secondary));
    doc.setLineWidth(0.12);
    doc.line(sx + 38, sy + 1, sx + CW / 2 - 8, sy + 1);
  }
  drawFooter(doc, scheme, style, "Revenue Goals");

  // --- 12 Monthly Pages ---
  for (let m = 0; m < 12; m++) {
    doc.addPage();
    doc.setFillColor(...rgb(scheme.bg));
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");
    drawHeader(doc, scheme, style, `${months[m]} — Business`, year.toString());

    y = 28;

    // Revenue Table
    const revTBody = drawSection(doc, scheme, style, M, y, CW, 60, "Revenue");
    const revCols = [
      { label: "Product / Service", w: CW * 0.35 },
      { label: "Units Sold", w: CW * 0.15 },
      { label: "Price", w: CW * 0.15 },
      { label: "Revenue", w: CW * 0.15 },
      { label: "Notes", w: CW * 0.2 },
    ];
    let rtY = drawTableHeader(doc, scheme, style, M, revTBody + 2, revCols);
    rtY = drawTableRows(doc, scheme, style, M, rtY, revCols, 6, 7);
    // Total row
    doc.setFillColor(...rgb(scheme.primary));
    doc.rect(M, rtY, CW, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text("TOTAL REVENUE", M + 4, rtY + 5);
    doc.setTextColor(...rgb(scheme.text));
    y += 64;

    // Expenses Table
    const expTBody = drawSection(doc, scheme, style, M, y, CW, 68, "Expenses");
    const bExpCols = [
      { label: "Category", w: CW * 0.35 },
      { label: "Budgeted", w: CW * 0.2 },
      { label: "Actual", w: CW * 0.2 },
      { label: "Variance", w: CW * 0.25 },
    ];
    let etY = drawTableHeader(doc, scheme, style, M, expTBody + 2, bExpCols);
    const bExpLabels = [
      "Marketing / Ads",
      "Software / Tools",
      "Inventory / COGS",
      "Shipping",
      "Freelancers / Staff",
      "Office / Rent",
      "Other",
      "TOTAL",
    ];
    etY = drawTableRows(doc, scheme, style, M, etY, bExpCols, 8, 6.5, bExpLabels);
    y += 72;

    // Profit/Loss Summary
    const plBody = drawSection(doc, scheme, style, M, y, CW * 0.48, 28, "Profit / Loss");
    const plItems = ["Total Revenue:", "Total Expenses:", "NET PROFIT:"];
    for (let i = 0; i < plItems.length; i++) {
      const py = plBody + 5 + i * 6.5;
      doc.setFont("helvetica", i === 2 ? "bold" : "normal");
      doc.setFontSize(7.5);
      doc.text(plItems[i], M + 4, py);
      doc.setDrawColor(...rgb(scheme.secondary));
      doc.setLineWidth(0.12);
      doc.line(M + 32, py + 1, M + CW * 0.48 - 4, py + 1);
    }

    // Key Metrics
    const kmX = M + CW * 0.52;
    const kmW = CW * 0.48;
    const kmBody = drawSection(doc, scheme, style, kmX, y, kmW, 28, "Key Metrics");
    const metrics = ["Conversion Rate:", "Avg Order Value:", "New Customers:", "Return Rate:"];
    for (let i = 0; i < metrics.length; i++) {
      const my = kmBody + 5 + i * 5.5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(metrics[i], kmX + 3, my);
      doc.setDrawColor(...rgb(scheme.secondary));
      doc.setLineWidth(0.12);
      doc.line(kmX + 32, my + 1, kmX + kmW - 4, my + 1);
    }

    drawFooter(doc, scheme, style, `${months[m]} ${year}`);
  }

  // --- Client Tracker Page ---
  doc.addPage();
  doc.setFillColor(...rgb(scheme.bg));
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  drawHeader(doc, scheme, style, "Client Tracker", year.toString());

  y = 28;
  const clBody = drawSection(doc, scheme, style, M, y, CW, 150, "Client Directory");
  const clCols = [
    { label: "Client Name", w: CW * 0.2 },
    { label: "Contact", w: CW * 0.2 },
    { label: "Service", w: CW * 0.18 },
    { label: "Value", w: CW * 0.12 },
    { label: "Start Date", w: CW * 0.12 },
    { label: "Status", w: CW * 0.18 },
  ];
  let clY = drawTableHeader(doc, scheme, style, M, clBody + 2, clCols);
  clY = drawTableRows(doc, scheme, style, M, clY, clCols, 16, 8.5);
  y += 154;

  // Notes
  if (y + 30 < PAGE_H - 15) {
    const notesBody = drawSection(doc, scheme, style, M, y, CW, 25, "Notes");
    drawLines(doc, scheme, style, notesBody + 5, 3, CW - 8, M + 4, 5.5);
  }
  drawFooter(doc, scheme, style, "Client Tracker");

  // --- Project Planner Page ---
  doc.addPage();
  doc.setFillColor(...rgb(scheme.bg));
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  drawHeader(doc, scheme, style, "Project Planner", year.toString());

  y = 28;
  for (let p = 0; p < 3; p++) {
    const pBody = drawSection(doc, scheme, style, M, y, CW, 72, `Project ${p + 1}`);

    const projFields = ["Project Name:", "Client:", "Deadline:", "Budget:"];
    for (let f = 0; f < projFields.length; f++) {
      const fx = M + 4 + (f % 2) * (CW / 2);
      const fy = pBody + 5 + Math.floor(f / 2) * 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(projFields[f], fx, fy);
      doc.setDrawColor(...rgb(scheme.secondary));
      doc.setLineWidth(0.12);
      doc.line(fx + 22, fy + 1, fx + CW / 2 - 8, fy + 1);
    }

    // Milestones
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...rgb(scheme.accent));
    doc.text("Milestones:", M + 4, pBody + 22);
    doc.setTextColor(...rgb(scheme.text));

    for (let ml = 0; ml < 4; ml++) {
      const mly = pBody + 28 + ml * 7;
      drawCheckbox(doc, style, M + 6, mly);
      doc.setDrawColor(...rgb(scheme.secondary));
      doc.setLineWidth(0.12);
      doc.line(M + 12, mly + 2.5, M + CW * 0.5, mly + 2.5);

      // Due date field
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.text("Due:", M + CW * 0.55, mly + 2.5);
      doc.line(M + CW * 0.62, mly + 2.5, M + CW * 0.78, mly + 2.5);

      // Status
      doc.text("Status:", M + CW * 0.8, mly + 2.5);
      doc.line(M + CW * 0.88, mly + 2.5, M + CW - 4, mly + 2.5);
    }

    // Notes
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...rgb(scheme.accent));
    doc.text("Notes:", M + 4, pBody + 58);
    doc.setTextColor(...rgb(scheme.text));
    drawLines(doc, scheme, style, pBody + 63, 1, CW - 8, M + 4, 5);

    y += 76;
  }
  drawFooter(doc, scheme, style, "Project Planner");
}

// ===========================================================================
// 8. STUDENT PLANNER (16 pages)
// ===========================================================================
function generateStudentPlanner(doc: jsPDF, scheme: ColorScheme, style: DesignStyle) {
  const year = new Date().getFullYear();
  generateCoverPage(doc, scheme, style, "Student Planner", year.toString(), "Study smart, achieve more");

  // --- Class Schedule Page ---
  doc.addPage();
  doc.setFillColor(...rgb(scheme.bg));
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  drawHeader(doc, scheme, style, "Class Schedule", "Semester Overview");

  let y = 28;
  const schedBody = drawSection(doc, scheme, style, M, y, CW, 160, "Weekly Class Schedule");

  const timeSlots = [
    "8:00 AM","9:00 AM","10:00 AM","11:00 AM","12:00 PM",
    "1:00 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM","6:00 PM",
  ];
  const classDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const timeColW = 18;
  const dayColW = (CW - timeColW) / 5;
  const slotH = 13;

  // Header row
  let ty = schedBody + 2;
  doc.setFillColor(...rgb(scheme.primary));
  doc.rect(M, ty, CW, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text("Time", M + timeColW / 2, ty + 5, { align: "center" });
  for (let d = 0; d < 5; d++) {
    doc.text(classDays[d], M + timeColW + d * dayColW + dayColW / 2, ty + 5, { align: "center" });
  }
  doc.setTextColor(...rgb(scheme.text));
  ty += 7;

  // Time slots
  for (let t = 0; t < timeSlots.length; t++) {
    const sly = ty + t * slotH;
    // Alternating row background
    if (t % 2 === 0) {
      doc.setFillColor(...rgb(scheme.light));
      doc.rect(M, sly, CW, slotH, "F");
    }

    // Time label
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(...rgb(scheme.accent));
    doc.text(timeSlots[t], M + timeColW / 2, sly + slotH / 2 + 1, { align: "center" });
    doc.setTextColor(...rgb(scheme.text));

    // Cell borders
    doc.setDrawColor(...rgb(scheme.secondary));
    doc.setLineWidth(0.12);
    doc.rect(M, sly, timeColW, slotH);
    for (let d = 0; d < 5; d++) {
      doc.rect(M + timeColW + d * dayColW, sly, dayColW, slotH);
    }
  }
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);

  // Course list
  y += 164;
  if (y + 50 < PAGE_H - 15) {
    const courseBody = drawSection(doc, scheme, style, M, y, CW, 48, "Courses This Semester");
    const courseCols = [
      { label: "Course Code", w: CW * 0.15 },
      { label: "Course Name", w: CW * 0.3 },
      { label: "Instructor", w: CW * 0.2 },
      { label: "Room", w: CW * 0.1 },
      { label: "Credits", w: CW * 0.1 },
      { label: "Grade Goal", w: CW * 0.15 },
    ];
    let cY = drawTableHeader(doc, scheme, style, M, courseBody + 2, courseCols);
    cY = drawTableRows(doc, scheme, style, M, cY, courseCols, 5, 7);
  }

  drawFooter(doc, scheme, style, "Class Schedule");

  // --- 12 Weekly Pages ---
  for (let week = 1; week <= 12; week++) {
    doc.addPage();
    doc.setFillColor(...rgb(scheme.bg));
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");
    drawHeader(doc, scheme, style, `Week ${week}`, `___/___ — ___/___`);

    y = 28;

    // Compact Class Schedule (Mon-Fri, 8AM-6PM)
    const miniSchedBody = drawSection(doc, scheme, style, M, y, CW, 80, "This Week's Schedule");
    const miniDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const miniTimes = ["8AM","9AM","10AM","11AM","12PM","1PM","2PM","3PM","4PM","5PM","6PM"];
    const mTimeColW = 12;
    const mDayColW = (CW - mTimeColW) / 5;
    const mSlotH = 6.2;

    let msY = miniSchedBody + 2;
    // Day headers
    doc.setFillColor(...rgb(scheme.accent));
    doc.rect(M, msY, CW, 5.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.setTextColor(255, 255, 255);
    doc.text("Time", M + mTimeColW / 2, msY + 4, { align: "center" });
    for (let d = 0; d < 5; d++) {
      doc.text(miniDays[d], M + mTimeColW + d * mDayColW + mDayColW / 2, msY + 4, { align: "center" });
    }
    doc.setTextColor(...rgb(scheme.text));
    msY += 5.5;

    for (let t = 0; t < miniTimes.length; t++) {
      const tsy = msY + t * mSlotH;
      if (t % 2 === 0) {
        doc.setFillColor(...rgb(scheme.light));
        doc.rect(M, tsy, CW, mSlotH, "F");
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(4.5);
      doc.setTextColor(...rgb(scheme.accent));
      doc.text(miniTimes[t], M + mTimeColW / 2, tsy + 4, { align: "center" });
      doc.setTextColor(...rgb(scheme.text));

      doc.setDrawColor(...rgb(scheme.secondary));
      doc.setLineWidth(0.1);
      doc.rect(M, tsy, mTimeColW, mSlotH);
      for (let d = 0; d < 5; d++) {
        doc.rect(M + mTimeColW + d * mDayColW, tsy, mDayColW, mSlotH);
      }
    }
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    y += 84;

    // Assignments Due This Week
    const asgBody = drawSection(doc, scheme, style, M, y, CW, 48, "Assignments Due This Week");
    const asgCols = [
      { label: "Subject", w: CW * 0.22 },
      { label: "Assignment", w: CW * 0.33 },
      { label: "Due Date", w: CW * 0.18 },
      { label: "Status", w: CW * 0.15 },
      { label: "Priority", w: CW * 0.12 },
    ];
    let asgY = drawTableHeader(doc, scheme, style, M, asgBody + 2, asgCols);
    asgY = drawTableRows(doc, scheme, style, M, asgY, asgCols, 5, 6.5);
    y += 52;

    // Study Goals
    const sgBody = drawSection(doc, scheme, style, M, y, CW * 0.55, 30, "Study Goals");
    for (let i = 0; i < 3; i++) {
      const sgy = sgBody + 5 + i * 7.5;
      drawCheckbox(doc, style, M + 4, sgy);
      doc.setDrawColor(...rgb(scheme.secondary));
      doc.setLineWidth(0.12);
      doc.line(M + 10, sgy + 2.5, M + CW * 0.55 - 4, sgy + 2.5);
    }

    // Notes
    const notesX = M + CW * 0.58;
    const notesW = CW * 0.42;
    const notesBody = drawSection(doc, scheme, style, notesX, y, notesW, 30, "Notes");
    drawLines(doc, scheme, style, notesBody + 5, 4, notesW - 8, notesX + 4, 5.5);

    drawFooter(doc, scheme, style, `Week ${week} of 12`);
  }

  // --- Exam Prep Page ---
  doc.addPage();
  doc.setFillColor(...rgb(scheme.bg));
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  drawHeader(doc, scheme, style, "Exam Preparation", "Plan your study sessions");

  y = 28;
  for (let e = 0; e < 4; e++) {
    const examBody = drawSection(doc, scheme, style, M, y, CW, 55, `Exam ${e + 1}`);

    const examFields = [
      { label: "Subject:", lineW: CW * 0.4 - 24 },
      { label: "Date:", lineW: CW * 0.25 - 16 },
      { label: "Time:", lineW: CW * 0.15 },
    ];
    let fx = M + 4;
    for (const field of examFields) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(field.label, fx, examBody + 6);
      const labelW = doc.getTextWidth(field.label);
      doc.setDrawColor(...rgb(scheme.secondary));
      doc.setLineWidth(0.12);
      doc.line(fx + labelW + 1, examBody + 7, fx + labelW + 1 + field.lineW, examBody + 7);
      fx += labelW + field.lineW + 6;
    }

    // Key Topics
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...rgb(scheme.accent));
    doc.text("Key Topics to Review:", M + 4, examBody + 15);
    doc.setTextColor(...rgb(scheme.text));
    for (let t = 0; t < 3; t++) {
      const tpy = examBody + 20 + t * 6;
      drawCheckbox(doc, style, M + 6, tpy);
      doc.setDrawColor(...rgb(scheme.secondary));
      doc.setLineWidth(0.1);
      doc.line(M + 11, tpy + 2, M + CW * 0.45, tpy + 2);
    }

    // Study Plan
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...rgb(scheme.accent));
    doc.text("Study Sessions:", M + CW * 0.5, examBody + 15);
    doc.setTextColor(...rgb(scheme.text));
    for (let s = 0; s < 3; s++) {
      const spy = examBody + 20 + s * 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.text(`Session ${s + 1}:`, M + CW * 0.52, spy + 2);
      doc.setDrawColor(...rgb(scheme.secondary));
      doc.setLineWidth(0.1);
      doc.line(M + CW * 0.64, spy + 2, M + CW - 4, spy + 2);
    }

    // Confidence level
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text("Confidence Level:", M + 4, examBody + 42);
    for (let c = 0; c < 5; c++) {
      doc.setDrawColor(...rgb(scheme.secondary));
      doc.circle(M + 40 + c * 6, examBody + 41, 2);
    }
    doc.text("1", M + 38, examBody + 47);
    doc.text("5", M + 62, examBody + 47);

    y += 59;
  }
  drawFooter(doc, scheme, style, "Exam Preparation");

  // --- GPA Calculator Page ---
  doc.addPage();
  doc.setFillColor(...rgb(scheme.bg));
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  drawHeader(doc, scheme, style, "GPA Calculator", year.toString());

  y = 28;

  // Current Semester
  const semBody = drawSection(doc, scheme, style, M, y, CW, 90, "Current Semester");
  const gpaCols = [
    { label: "Course", w: CW * 0.3 },
    { label: "Credits", w: CW * 0.12 },
    { label: "Grade", w: CW * 0.12 },
    { label: "Grade Points", w: CW * 0.16 },
    { label: "Quality Points", w: CW * 0.15 },
    { label: "Notes", w: CW * 0.15 },
  ];
  let gpaY = drawTableHeader(doc, scheme, style, M, semBody + 2, gpaCols);
  gpaY = drawTableRows(doc, scheme, style, M, gpaY, gpaCols, 8, 8);

  // Totals
  doc.setFillColor(...rgb(scheme.primary));
  doc.rect(M, gpaY, CW, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("SEMESTER TOTALS", M + 4, gpaY + 5.5);
  doc.text("GPA:", M + CW * 0.65, gpaY + 5.5);
  doc.setTextColor(...rgb(scheme.text));
  y += 94;

  // GPA Scale Reference
  const scaleBody = drawSection(doc, scheme, style, M, y, CW * 0.5, 50, "GPA Scale Reference");
  const gradeScale = [
    { grade: "A+", points: "4.0" },
    { grade: "A", points: "4.0" },
    { grade: "A-", points: "3.7" },
    { grade: "B+", points: "3.3" },
    { grade: "B", points: "3.0" },
    { grade: "B-", points: "2.7" },
    { grade: "C+", points: "2.3" },
    { grade: "C", points: "2.0" },
    { grade: "C-", points: "1.7" },
    { grade: "D", points: "1.0" },
    { grade: "F", points: "0.0" },
  ];
  const gsColW = (CW * 0.5 - 8) / 4;
  for (let i = 0; i < gradeScale.length; i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const gsx = M + 4 + col * gsColW;
    const gsy = scaleBody + 6 + row * 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...rgb(scheme.accent));
    doc.text(gradeScale[i].grade, gsx, gsy);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...rgb(scheme.text));
    doc.text(`= ${gradeScale[i].points}`, gsx + 8, gsy);
  }

  // Cumulative GPA tracker
  const cumX = M + CW * 0.54;
  const cumW = CW * 0.46;
  const cumBody = drawSection(doc, scheme, style, cumX, y, cumW, 50, "Cumulative GPA");
  const semLabels = ["Semester 1:", "Semester 2:", "Semester 3:", "Semester 4:", "Semester 5:", "Semester 6:"];
  for (let s = 0; s < semLabels.length; s++) {
    const col = s % 2;
    const row = Math.floor(s / 2);
    const csx = cumX + 4 + col * (cumW / 2);
    const csy = cumBody + 6 + row * 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(semLabels[s], csx, csy);
    doc.setDrawColor(...rgb(scheme.secondary));
    doc.setLineWidth(0.12);
    doc.line(csx + 22, csy + 1, csx + cumW / 2 - 8, csy + 1);
  }
  y += 54;

  // Academic Goals
  const acadBody = drawSection(doc, scheme, style, M, y, CW, 40, "Academic Goals");
  for (let i = 0; i < 5; i++) {
    const agy = acadBody + 5 + i * 6.5;
    drawCheckbox(doc, style, M + 4, agy);
    doc.setDrawColor(...rgb(scheme.secondary));
    doc.setLineWidth(0.12);
    doc.line(M + 10, agy + 2.5, M + CW - 4, agy + 2.5);
  }

  drawFooter(doc, scheme, style, "GPA Calculator");
}

// ===========================================================================
// API Route Handler
// ===========================================================================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { plannerType, colorScheme, designStyle } = body;

    if (!plannerType || !colorScheme) {
      return NextResponse.json(
        { error: "Missing plannerType or colorScheme" },
        { status: 400 }
      );
    }

    const scheme = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES["minimal-black"];
    const style = DESIGN_STYLES[designStyle] || DESIGN_STYLES["modern-minimal"];
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    switch (plannerType) {
      case "daily":
        generateDailyPlanner(doc, scheme, style);
        break;
      case "weekly":
        generateWeeklyPlanner(doc, scheme, style);
        break;
      case "monthly":
        generateMonthlyPlanner(doc, scheme, style);
        break;
      case "budget":
        generateBudgetPlanner(doc, scheme, style);
        break;
      case "fitness":
        generateFitnessPlanner(doc, scheme, style);
        break;
      case "self_care":
        generateSelfCarePlanner(doc, scheme, style);
        break;
      case "business":
        generateBusinessPlanner(doc, scheme, style);
        break;
      case "student":
        generateStudentPlanner(doc, scheme, style);
        break;
      default:
        return NextResponse.json(
          { error: "Invalid planner type" },
          { status: 400 }
        );
    }

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${plannerType}-planner.pdf"`,
      },
    });
  } catch (err: unknown) {
    console.error("[PDF Generate] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
