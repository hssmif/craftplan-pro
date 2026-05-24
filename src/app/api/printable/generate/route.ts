import { NextRequest, NextResponse } from "next/server";
import jsPDF from "jspdf";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ColorScheme {
  primary: number[];
  secondary: number[];
  accent: number[];
  bg: number[];
  text: number[];
  light: number[];
}

/* ------------------------------------------------------------------ */
/*  Color Schemes                                                      */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;
const CONTENT_H = PAGE_H - MARGIN * 2;

function setColor(doc: jsPDF, color: number[]) {
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setFillColor(color[0], color[1], color[2]);
  doc.setTextColor(color[0], color[1], color[2]);
}

function setTextColor(doc: jsPDF, color: number[]) {
  doc.setTextColor(color[0], color[1], color[2]);
}

function setDrawColor(doc: jsPDF, color: number[]) {
  doc.setDrawColor(color[0], color[1], color[2]);
}

function setFillColor(doc: jsPDF, color: number[]) {
  doc.setFillColor(color[0], color[1], color[2]);
}

function fillPage(doc: jsPDF, color: number[]) {
  setFillColor(doc, color);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
}

function drawDoubleBorder(doc: jsPDF, color: number[]) {
  setDrawColor(doc, color);
  doc.setLineWidth(0.8);
  doc.rect(MARGIN - 5, MARGIN - 5, CONTENT_W + 10, CONTENT_H + 10);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN - 2, MARGIN - 2, CONTENT_W + 4, CONTENT_H + 4);
}

function drawCornerDecorations(doc: jsPDF, color: number[], size = 8) {
  setDrawColor(doc, color);
  doc.setLineWidth(0.5);
  const inset = MARGIN - 8;
  // top-left
  doc.circle(inset, inset, size / 4, "S");
  doc.line(inset - size / 2, inset, inset + size / 2, inset);
  doc.line(inset, inset - size / 2, inset, inset + size / 2);
  // top-right
  doc.circle(PAGE_W - inset, inset, size / 4, "S");
  doc.line(PAGE_W - inset - size / 2, inset, PAGE_W - inset + size / 2, inset);
  doc.line(PAGE_W - inset, inset - size / 2, PAGE_W - inset, inset + size / 2);
  // bottom-left
  doc.circle(inset, PAGE_H - inset, size / 4, "S");
  doc.line(inset - size / 2, PAGE_H - inset, inset + size / 2, PAGE_H - inset);
  doc.line(inset, PAGE_H - inset - size / 2, inset, PAGE_H - inset + size / 2);
  // bottom-right
  doc.circle(PAGE_W - inset, PAGE_H - inset, size / 4, "S");
  doc.line(
    PAGE_W - inset - size / 2,
    PAGE_H - inset,
    PAGE_W - inset + size / 2,
    PAGE_H - inset
  );
  doc.line(
    PAGE_W - inset,
    PAGE_H - inset - size / 2,
    PAGE_W - inset,
    PAGE_H - inset + size / 2
  );
}

function addFooter(doc: jsPDF, color: number[]) {
  setTextColor(doc, color);
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.text("Personal Use Only", PAGE_W / 2, PAGE_H - 6, { align: "center" });
}

function drawDottedLine(doc: jsPDF, x1: number, y: number, x2: number) {
  const gap = 1.5;
  const dotSize = 0.3;
  for (let x = x1; x < x2; x += gap) {
    doc.circle(x, y, dotSize, "F");
  }
}

function drawCheckbox(doc: jsPDF, x: number, y: number, size = 3.5) {
  doc.setLineWidth(0.25);
  doc.rect(x, y, size, size);
}

function drawTitle(
  doc: jsPDF,
  title: string,
  y: number,
  scheme: ColorScheme,
  fontSize = 18
) {
  setTextColor(doc, scheme.primary);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  doc.text(title, PAGE_W / 2, y, { align: "center" });

  // Decorative underline
  const textW = doc.getTextWidth(title);
  setDrawColor(doc, scheme.accent);
  doc.setLineWidth(0.5);
  doc.line(
    PAGE_W / 2 - textW / 2 - 5,
    y + 2,
    PAGE_W / 2 + textW / 2 + 5,
    y + 2
  );
  return y + 8;
}

function drawSectionHeader(
  doc: jsPDF,
  text: string,
  y: number,
  scheme: ColorScheme,
  fontSize = 11
) {
  setFillColor(doc, scheme.light);
  doc.roundedRect(MARGIN, y - 4.5, CONTENT_W, 7, 1.5, 1.5, "F");
  setTextColor(doc, scheme.accent);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  doc.text(text, MARGIN + 3, y);
  return y + 10;
}

function drawLabeledLines(
  doc: jsPDF,
  label: string,
  lineCount: number,
  x: number,
  y: number,
  lineWidth: number,
  scheme: ColorScheme
): number {
  setTextColor(doc, scheme.text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(label, x, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  setFillColor(doc, scheme.secondary);
  for (let i = 0; i < lineCount; i++) {
    drawDottedLine(doc, x, y, x + lineWidth);
    y += 7;
  }
  return y;
}

/* ------------------------------------------------------------------ */
/*  1. QUOTE PRINTS                                                    */
/* ------------------------------------------------------------------ */

const DEFAULT_QUOTES = [
  {
    text: "Start where you are. Use what you have. Do what you can.",
    author: "Arthur Ashe",
  },
  {
    text: "The secret of getting ahead is getting started.",
    author: "Mark Twain",
  },
  { text: "Every day is a fresh start.", author: "Unknown" },
  {
    text: "Small steps every day lead to big changes.",
    author: "Unknown",
  },
  { text: "You are capable of amazing things.", author: "Unknown" },
];

function generateQuotePrints(
  doc: jsPDF,
  scheme: ColorScheme,
  quotes: { text: string; author: string }[]
) {
  quotes.forEach((quote, idx) => {
    if (idx > 0) doc.addPage();

    fillPage(doc, scheme.bg);
    drawDoubleBorder(doc, scheme.accent);
    drawCornerDecorations(doc, scheme.secondary, 10);

    // Decorative top element
    setDrawColor(doc, scheme.secondary);
    doc.setLineWidth(0.3);
    const centerX = PAGE_W / 2;
    doc.line(centerX - 30, 55, centerX + 30, 55);
    doc.circle(centerX, 55, 1.5, "S");
    doc.line(centerX - 20, 52, centerX + 20, 52);
    doc.line(centerX - 20, 58, centerX + 58, 58);

    // Quote text - wrap long quotes
    setTextColor(doc, scheme.text);
    doc.setFont("helvetica", "bold");

    const quoteText = `\u201C${quote.text}\u201D`;
    const maxLineWidth = CONTENT_W - 30;

    // Determine font size based on text length
    let fontSize = 28;
    if (quoteText.length > 80) fontSize = 22;
    if (quoteText.length > 120) fontSize = 18;
    doc.setFontSize(fontSize);

    const lines = doc.splitTextToSize(quoteText, maxLineWidth);
    const lineHeight = fontSize * 0.5;
    const totalTextHeight = lines.length * lineHeight;
    const startY = (PAGE_H / 2) - (totalTextHeight / 2);

    lines.forEach((line: string, lineIdx: number) => {
      doc.text(line, centerX, startY + lineIdx * lineHeight, {
        align: "center",
      });
    });

    // Author line
    setTextColor(doc, scheme.secondary);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(12);
    doc.text(
      `\u2014 ${quote.author}`,
      centerX,
      startY + totalTextHeight + 15,
      { align: "center" }
    );

    // Decorative bottom element
    setDrawColor(doc, scheme.secondary);
    doc.setLineWidth(0.3);
    const bottomY = startY + totalTextHeight + 30;
    doc.line(centerX - 30, bottomY, centerX + 30, bottomY);
    doc.circle(centerX, bottomY, 1.5, "S");

    // Small decorative diamonds at bottom corners
    setFillColor(doc, scheme.light);
    const diamondY = PAGE_H - 35;
    [MARGIN + 10, PAGE_W - MARGIN - 10].forEach((dx) => {
      doc.setLineWidth(0.3);
      setDrawColor(doc, scheme.secondary);
      doc.line(dx, diamondY - 3, dx + 3, diamondY);
      doc.line(dx + 3, diamondY, dx, diamondY + 3);
      doc.line(dx, diamondY + 3, dx - 3, diamondY);
      doc.line(dx - 3, diamondY, dx, diamondY - 3);
    });

    addFooter(doc, scheme.secondary);
  });
}

/* ------------------------------------------------------------------ */
/*  2. HABIT TRACKER                                                   */
/* ------------------------------------------------------------------ */

function generateHabitPrintable(doc: jsPDF, scheme: ColorScheme) {
  /* ---------- Page 1: 30-Day Habit Grid ---------- */
  fillPage(doc, scheme.bg);

  let y = drawTitle(doc, "30-DAY HABIT TRACKER", MARGIN + 10, scheme, 20);
  y += 4;

  // Subtitle
  setTextColor(doc, scheme.secondary);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.text(
    "Write your habits on the left and check off each day as you complete them.",
    PAGE_W / 2,
    y,
    { align: "center" }
  );
  y += 8;

  // Grid dimensions
  const habitColW = 35;
  const dayColW = (CONTENT_W - habitColW) / 30;
  const rowH = 7;
  const gridX = MARGIN;

  // Header row - day numbers
  setFillColor(doc, scheme.primary);
  doc.rect(gridX + habitColW, y, CONTENT_W - habitColW, rowH, "F");

  setTextColor(doc, [255, 255, 255]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  for (let d = 1; d <= 30; d++) {
    doc.text(
      String(d),
      gridX + habitColW + (d - 0.5) * dayColW,
      y + rowH / 2 + 1.5,
      { align: "center" }
    );
  }

  // "HABIT" label in header
  setFillColor(doc, scheme.accent);
  doc.rect(gridX, y, habitColW, rowH, "F");
  setTextColor(doc, [255, 255, 255]);
  doc.setFontSize(7);
  doc.text("HABIT", gridX + habitColW / 2, y + rowH / 2 + 2, {
    align: "center",
  });
  y += rowH;

  // 10 habit rows
  setDrawColor(doc, scheme.light);
  doc.setLineWidth(0.15);
  for (let row = 0; row < 10; row++) {
    const rowY = y + row * rowH * 2.2;
    const isEven = row % 2 === 0;

    if (isEven) {
      setFillColor(doc, scheme.light);
      doc.rect(gridX, rowY, CONTENT_W, rowH * 2.2, "F");
    }

    // Habit name area - dotted line
    setDrawColor(doc, scheme.secondary);
    doc.setLineWidth(0.15);
    doc.line(gridX + 2, rowY + rowH * 1.5, gridX + habitColW - 2, rowY + rowH * 1.5);

    // Row number
    setTextColor(doc, scheme.secondary);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.text(String(row + 1), gridX + 1, rowY + 4);

    // Checkbox cells for each day
    setDrawColor(doc, scheme.secondary);
    for (let d = 0; d < 30; d++) {
      const cellX = gridX + habitColW + d * dayColW;
      doc.setLineWidth(0.1);
      doc.rect(cellX, rowY, dayColW, rowH * 2.2);

      // Small checkbox in center
      const cbSize = Math.min(dayColW * 0.6, 3.5);
      const cbX = cellX + (dayColW - cbSize) / 2;
      const cbY = rowY + (rowH * 2.2 - cbSize) / 2;
      doc.setLineWidth(0.2);
      doc.roundedRect(cbX, cbY, cbSize, cbSize, 0.3, 0.3, "S");
    }
  }

  // Grid border
  const gridBottom = y + 10 * rowH * 2.2;
  setDrawColor(doc, scheme.primary);
  doc.setLineWidth(0.4);
  doc.rect(gridX, y - rowH, CONTENT_W, gridBottom - y + rowH);

  // Month/Year line at bottom
  const footerY = gridBottom + 8;
  setTextColor(doc, scheme.text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Month: _______________     Year: __________", PAGE_W / 2, footerY, {
    align: "center",
  });

  addFooter(doc, scheme.secondary);

  /* ---------- Page 2: Monthly Review ---------- */
  doc.addPage();
  fillPage(doc, scheme.bg);

  y = drawTitle(doc, "MONTHLY REVIEW", MARGIN + 10, scheme, 20);
  y += 6;

  // Month/Year
  setTextColor(doc, scheme.text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Month: _______________     Year: __________", PAGE_W / 2, y, {
    align: "center",
  });
  y += 12;

  // Best habit section
  y = drawSectionHeader(doc, "MY BEST HABIT THIS MONTH", y, scheme);
  setTextColor(doc, scheme.text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Habit: ", MARGIN + 3, y);
  setFillColor(doc, scheme.secondary);
  drawDottedLine(doc, MARGIN + 20, y, MARGIN + CONTENT_W - 5);
  y += 8;
  doc.text("Why it worked: ", MARGIN + 3, y);
  drawDottedLine(doc, MARGIN + 35, y, MARGIN + CONTENT_W - 5);
  y += 7;
  drawDottedLine(doc, MARGIN + 3, y, MARGIN + CONTENT_W - 5);
  y += 14;

  // Hardest habit
  y = drawSectionHeader(doc, "MY HARDEST HABIT THIS MONTH", y, scheme);
  doc.text("Habit: ", MARGIN + 3, y);
  drawDottedLine(doc, MARGIN + 20, y, MARGIN + CONTENT_W - 5);
  y += 8;
  doc.text("What made it hard: ", MARGIN + 3, y);
  drawDottedLine(doc, MARGIN + 42, y, MARGIN + CONTENT_W - 5);
  y += 7;
  drawDottedLine(doc, MARGIN + 3, y, MARGIN + CONTENT_W - 5);
  y += 14;

  // New habit to add
  y = drawSectionHeader(doc, "NEW HABIT TO ADD NEXT MONTH", y, scheme);
  doc.text("Habit: ", MARGIN + 3, y);
  drawDottedLine(doc, MARGIN + 20, y, MARGIN + CONTENT_W - 5);
  y += 8;
  doc.text("Cue/Trigger: ", MARGIN + 3, y);
  drawDottedLine(doc, MARGIN + 32, y, MARGIN + CONTENT_W - 5);
  y += 8;
  doc.text("Reward: ", MARGIN + 3, y);
  drawDottedLine(doc, MARGIN + 24, y, MARGIN + CONTENT_W - 5);
  y += 14;

  // Habit to drop
  y = drawSectionHeader(doc, "HABIT TO DROP OR ADJUST", y, scheme);
  doc.text("Habit: ", MARGIN + 3, y);
  drawDottedLine(doc, MARGIN + 20, y, MARGIN + CONTENT_W - 5);
  y += 8;
  doc.text("Reason: ", MARGIN + 3, y);
  drawDottedLine(doc, MARGIN + 24, y, MARGIN + CONTENT_W - 5);
  y += 14;

  // Reflection
  y = drawSectionHeader(doc, "MONTHLY REFLECTION", y, scheme);
  doc.text("What I learned about myself: ", MARGIN + 3, y);
  y += 6;
  for (let i = 0; i < 4; i++) {
    drawDottedLine(doc, MARGIN + 3, y, MARGIN + CONTENT_W - 5);
    y += 7;
  }

  addFooter(doc, scheme.secondary);
}

/* ------------------------------------------------------------------ */
/*  3. GRATITUDE JOURNAL                                               */
/* ------------------------------------------------------------------ */

function generateGratitudeJournal(doc: jsPDF, scheme: ColorScheme) {
  /* ---------- Cover Page ---------- */
  fillPage(doc, scheme.primary);

  // Decorative border on cover
  setDrawColor(doc, [255, 255, 255]);
  doc.setLineWidth(0.8);
  doc.rect(MARGIN, MARGIN, CONTENT_W, CONTENT_H);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN + 3, MARGIN + 3, CONTENT_W - 6, CONTENT_H - 6);

  // Cover title
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(32);
  doc.text("GRATITUDE", PAGE_W / 2, PAGE_H / 2 - 20, { align: "center" });
  doc.setFontSize(32);
  doc.text("JOURNAL", PAGE_W / 2, PAGE_H / 2 + 5, { align: "center" });

  // Decorative line
  doc.setLineWidth(0.5);
  doc.line(PAGE_W / 2 - 35, PAGE_H / 2 + 15, PAGE_W / 2 + 35, PAGE_H / 2 + 15);

  // Subtitle
  doc.setFont("helvetica", "italic");
  doc.setFontSize(11);
  doc.text("30 Days of Gratitude", PAGE_W / 2, PAGE_H / 2 + 28, {
    align: "center",
  });

  // Name line
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Name: ______________________________", PAGE_W / 2, PAGE_H - 50, {
    align: "center",
  });
  doc.text(
    "Start Date: ___________________________",
    PAGE_W / 2,
    PAGE_H - 40,
    { align: "center" }
  );

  // Corner decorative elements on cover
  const cs = 6;
  [
    [MARGIN + 8, MARGIN + 8],
    [PAGE_W - MARGIN - 8, MARGIN + 8],
    [MARGIN + 8, PAGE_H - MARGIN - 8],
    [PAGE_W - MARGIN - 8, PAGE_H - MARGIN - 8],
  ].forEach(([cx, cy]) => {
    doc.circle(cx, cy, cs / 3, "S");
  });

  /* ---------- 30 Daily Pages ---------- */
  for (let day = 1; day <= 30; day++) {
    doc.addPage();
    fillPage(doc, scheme.bg);

    // Top decorative accent
    setFillColor(doc, scheme.primary);
    doc.rect(0, 0, PAGE_W, 3, "F");

    let y = MARGIN + 8;

    // Day header
    setTextColor(doc, scheme.primary);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(`Day ${day}`, MARGIN, y);

    // Date line
    setTextColor(doc, scheme.secondary);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Date: _____ / _____ / _________", PAGE_W - MARGIN, y, {
      align: "right",
    });

    y += 6;
    setDrawColor(doc, scheme.primary);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 10;

    // Section 1: Grateful for
    y = drawSectionHeader(doc, "TODAY I AM GRATEFUL FOR:", y, scheme);

    setTextColor(doc, scheme.text);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setFillColor(doc, scheme.secondary);

    for (let i = 1; i <= 3; i++) {
      // Number circle
      setFillColor(doc, scheme.primary);
      doc.circle(MARGIN + 5, y - 1.2, 3, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.text(String(i), MARGIN + 5, y, { align: "center" });

      // Line
      setFillColor(doc, scheme.secondary);
      drawDottedLine(doc, MARGIN + 12, y, PAGE_W - MARGIN - 3);
      y += 9;
    }

    y += 5;

    // Section 2: Something good that happened
    y = drawSectionHeader(doc, "SOMETHING GOOD THAT HAPPENED:", y, scheme);
    setTextColor(doc, scheme.text);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setFillColor(doc, scheme.secondary);
    for (let i = 0; i < 3; i++) {
      drawDottedLine(doc, MARGIN + 3, y, PAGE_W - MARGIN - 3);
      y += 8;
    }

    y += 5;

    // Section 3: How I can make tomorrow better
    y = drawSectionHeader(doc, "HOW I CAN MAKE TOMORROW BETTER:", y, scheme);
    setTextColor(doc, scheme.text);
    doc.setFont("helvetica", "normal");
    setFillColor(doc, scheme.secondary);
    for (let i = 0; i < 2; i++) {
      drawDottedLine(doc, MARGIN + 3, y, PAGE_W - MARGIN - 3);
      y += 8;
    }

    y += 8;

    // Mood indicator section
    y = drawSectionHeader(doc, "TODAY'S MOOD:", y, scheme);
    const moods = [
      { label: "Amazing", emoji: "5" },
      { label: "Good", emoji: "4" },
      { label: "Okay", emoji: "3" },
      { label: "Tough", emoji: "2" },
      { label: "Bad", emoji: "1" },
    ];
    const moodSpacing = CONTENT_W / 5;
    setTextColor(doc, scheme.text);
    doc.setFontSize(8);

    moods.forEach((mood, i) => {
      const cx = MARGIN + moodSpacing * i + moodSpacing / 2;

      // Circle
      setDrawColor(doc, scheme.primary);
      doc.setLineWidth(0.5);
      doc.circle(cx, y + 2, 5, "S");

      // Label below
      setTextColor(doc, scheme.text);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(mood.label, cx, y + 12, { align: "center" });
    });

    y += 20;

    // Extra notes area
    setDrawColor(doc, scheme.light);
    doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN, y, CONTENT_W, 40, 2, 2, "S");

    setTextColor(doc, scheme.secondary);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.text("Additional thoughts...", MARGIN + 4, y + 6);

    // Page number
    setTextColor(doc, scheme.secondary);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`${day} / 30`, PAGE_W / 2, PAGE_H - 8, { align: "center" });

    addFooter(doc, scheme.secondary);
  }

  /* ---------- Page 32: 30-Day Reflection ---------- */
  doc.addPage();
  fillPage(doc, scheme.bg);

  setFillColor(doc, scheme.primary);
  doc.rect(0, 0, PAGE_W, 3, "F");

  let y = drawTitle(doc, "30-DAY REFLECTION", MARGIN + 10, scheme, 20);
  y += 6;

  setTextColor(doc, scheme.secondary);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text(
    "Look back on your 30 days of gratitude and reflect on your journey.",
    PAGE_W / 2,
    y,
    { align: "center" }
  );
  y += 12;

  const reflections = [
    { q: "What am I most grateful for after these 30 days?", lines: 3 },
    { q: "What pattern did I notice in my gratitude entries?", lines: 3 },
    { q: "How has practicing gratitude changed my perspective?", lines: 3 },
    { q: "What was the best day this month and why?", lines: 2 },
    { q: "What will I carry forward from this practice?", lines: 2 },
    { q: "My intention for the next 30 days:", lines: 2 },
  ];

  reflections.forEach((r) => {
    setTextColor(doc, scheme.accent);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(r.q, MARGIN + 3, y);
    y += 5;
    setFillColor(doc, scheme.secondary);
    for (let i = 0; i < r.lines; i++) {
      drawDottedLine(doc, MARGIN + 3, y, PAGE_W - MARGIN - 3);
      y += 7;
    }
    y += 4;
  });

  addFooter(doc, scheme.secondary);
}

/* ------------------------------------------------------------------ */
/*  4. GOAL SETTING WORKSHEET                                          */
/* ------------------------------------------------------------------ */

function generateGoalWorksheet(doc: jsPDF, scheme: ColorScheme) {
  /* ---------- Page 1: Annual Vision ---------- */
  fillPage(doc, scheme.bg);

  let y = drawTitle(doc, "MY 2025 VISION", MARGIN + 10, scheme, 22);
  y += 6;

  // Word of the year
  setFillColor(doc, scheme.light);
  doc.roundedRect(MARGIN, y - 4, CONTENT_W, 16, 2, 2, "F");
  setTextColor(doc, scheme.accent);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("MY WORD OF THE YEAR:", MARGIN + 4, y + 1);
  setDrawColor(doc, scheme.accent);
  doc.setLineWidth(0.3);
  doc.line(MARGIN + 55, y + 1, PAGE_W - MARGIN - 5, y + 1);
  y += 20;

  // 3 Big Goals
  y = drawSectionHeader(doc, "MY 3 BIG GOALS FOR 2025", y, scheme);

  for (let g = 1; g <= 3; g++) {
    // Goal number badge
    setFillColor(doc, scheme.primary);
    doc.circle(MARGIN + 6, y + 1, 4, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(String(g), MARGIN + 6, y + 2.5, { align: "center" });

    // Goal line
    setTextColor(doc, scheme.text);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Goal:", MARGIN + 14, y + 2);
    setFillColor(doc, scheme.secondary);
    drawDottedLine(doc, MARGIN + 28, y + 2, PAGE_W - MARGIN - 5);
    y += 9;

    // Why line
    setTextColor(doc, scheme.text);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Why this matters:", MARGIN + 14, y);
    setFillColor(doc, scheme.secondary);
    drawDottedLine(doc, MARGIN + 45, y, PAGE_W - MARGIN - 5);
    y += 7;
    drawDottedLine(doc, MARGIN + 14, y, PAGE_W - MARGIN - 5);
    y += 12;
  }

  // Vision statement
  y += 2;
  y = drawSectionHeader(doc, "MY VISION STATEMENT", y, scheme);
  setTextColor(doc, scheme.secondary);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.text(
    "Describe the life you want to be living by December 2025.",
    MARGIN + 3,
    y
  );
  y += 6;
  setFillColor(doc, scheme.secondary);
  for (let i = 0; i < 5; i++) {
    drawDottedLine(doc, MARGIN + 3, y, PAGE_W - MARGIN - 5);
    y += 8;
  }

  addFooter(doc, scheme.secondary);

  /* ---------- Page 2: Quarterly Goals ---------- */
  doc.addPage();
  fillPage(doc, scheme.bg);

  y = drawTitle(doc, "QUARTERLY GOALS", MARGIN + 10, scheme, 20);
  y += 4;

  const quarters = ["Q1 (Jan - Mar)", "Q2 (Apr - Jun)", "Q3 (Jul - Sep)", "Q4 (Oct - Dec)"];

  quarters.forEach((q) => {
    y = drawSectionHeader(doc, q, y, scheme);

    for (let g = 1; g <= 3; g++) {
      setTextColor(doc, scheme.text);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`${g}.`, MARGIN + 3, y);
      setFillColor(doc, scheme.secondary);
      drawDottedLine(doc, MARGIN + 10, y, PAGE_W - MARGIN - 50);

      // Deadline
      setTextColor(doc, scheme.secondary);
      doc.setFontSize(7);
      doc.text("Deadline:", PAGE_W - MARGIN - 45, y);
      drawDottedLine(
        doc,
        PAGE_W - MARGIN - 30,
        y,
        PAGE_W - MARGIN - 3
      );
      y += 9;
    }
    y += 5;
  });

  addFooter(doc, scheme.secondary);

  /* ---------- Page 3: Monthly Action Plan ---------- */
  doc.addPage();
  fillPage(doc, scheme.bg);

  y = drawTitle(doc, "MONTHLY ACTION PLAN", MARGIN + 10, scheme, 20);
  y += 2;

  // Month line
  setTextColor(doc, scheme.text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Month: _______________", PAGE_W / 2, y, { align: "center" });
  y += 8;

  // Table header
  const cols = [
    { label: "GOAL", w: 40 },
    { label: "ACTION STEPS", w: 55 },
    { label: "DEADLINE", w: 30 },
    { label: "STATUS", w: CONTENT_W - 40 - 55 - 30 },
  ];
  let colX = MARGIN;

  setFillColor(doc, scheme.primary);
  doc.rect(MARGIN, y, CONTENT_W, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);

  cols.forEach((col) => {
    doc.text(col.label, colX + 2, y + 5.5);
    colX += col.w;
  });
  y += 8;

  // 10 rows
  setDrawColor(doc, scheme.light);
  const rowH = 18;
  for (let r = 0; r < 10; r++) {
    const rowY = y + r * rowH;
    if (r % 2 === 0) {
      setFillColor(doc, scheme.light);
      doc.rect(MARGIN, rowY, CONTENT_W, rowH, "F");
    }

    // Cell borders
    setDrawColor(doc, scheme.secondary);
    doc.setLineWidth(0.15);
    colX = MARGIN;
    cols.forEach((col) => {
      doc.rect(colX, rowY, col.w, rowH);
      colX += col.w;
    });
  }

  // Outer border
  setDrawColor(doc, scheme.primary);
  doc.setLineWidth(0.4);
  doc.rect(MARGIN, y, CONTENT_W, rowH * 10);

  addFooter(doc, scheme.secondary);

  /* ---------- Page 4: Weekly Review ---------- */
  doc.addPage();
  fillPage(doc, scheme.bg);

  y = drawTitle(doc, "WEEKLY REVIEW", MARGIN + 10, scheme, 20);
  y += 2;

  // Week line
  setTextColor(doc, scheme.text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    "Week of: _____ / _____ / _________",
    PAGE_W / 2,
    y,
    { align: "center" }
  );
  y += 12;

  // What went well
  y = drawSectionHeader(doc, "WHAT WENT WELL THIS WEEK", y, scheme);
  y = drawLabeledLines(doc, "", 3, MARGIN + 3, y, CONTENT_W - 8, scheme);
  y += 6;

  // What to improve
  y = drawSectionHeader(doc, "WHAT I WANT TO IMPROVE", y, scheme);
  y = drawLabeledLines(doc, "", 3, MARGIN + 3, y, CONTENT_W - 8, scheme);
  y += 6;

  // Next week priorities
  y = drawSectionHeader(doc, "NEXT WEEK'S TOP PRIORITIES", y, scheme);
  setTextColor(doc, scheme.text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setFillColor(doc, scheme.secondary);
  for (let i = 1; i <= 3; i++) {
    drawCheckbox(doc, MARGIN + 3, y - 3, 4);
    drawDottedLine(doc, MARGIN + 10, y, PAGE_W - MARGIN - 5);
    y += 9;
  }

  y += 8;

  // Weekly rating
  y = drawSectionHeader(doc, "RATE THIS WEEK (1-10)", y, scheme);
  setDrawColor(doc, scheme.primary);
  doc.setLineWidth(0.4);
  const ratingCircleR = 6;
  const ratingSpacing = CONTENT_W / 10;
  for (let i = 1; i <= 10; i++) {
    const cx = MARGIN + ratingSpacing * (i - 0.5);
    doc.circle(cx, y + 4, ratingCircleR, "S");
    setTextColor(doc, scheme.text);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(String(i), cx, y + 6.5, { align: "center" });
  }
  y += 20;

  // Key lesson
  y = drawSectionHeader(doc, "KEY LESSON THIS WEEK", y, scheme);
  setFillColor(doc, scheme.secondary);
  for (let i = 0; i < 3; i++) {
    drawDottedLine(doc, MARGIN + 3, y, PAGE_W - MARGIN - 5);
    y += 7;
  }

  addFooter(doc, scheme.secondary);
}

/* ------------------------------------------------------------------ */
/*  5. MEAL PLANNER                                                    */
/* ------------------------------------------------------------------ */

function generateMealPrintable(doc: jsPDF, scheme: ColorScheme) {
  /* ---------- Page 1: Weekly Meal Grid ---------- */
  fillPage(doc, scheme.bg);

  let y = drawTitle(doc, "WEEKLY MEAL PLANNER", MARGIN + 10, scheme, 20);
  y += 2;

  // Week of line
  setTextColor(doc, scheme.text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    "Week of: _____ / _____ / _________",
    PAGE_W / 2,
    y,
    { align: "center" }
  );
  y += 8;

  // Grid setup
  const dayColW2 = 24;
  const mealCols = ["BREAKFAST", "LUNCH", "DINNER", "SNACKS"];
  const mealColW = (CONTENT_W - dayColW2) / mealCols.length;
  const mealRowH = 24;
  const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

  // Header row
  setFillColor(doc, scheme.primary);
  doc.rect(MARGIN, y, CONTENT_W, 8, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("DAY", MARGIN + dayColW2 / 2, y + 5.5, { align: "center" });
  mealCols.forEach((col, i) => {
    doc.text(
      col,
      MARGIN + dayColW2 + mealColW * i + mealColW / 2,
      y + 5.5,
      { align: "center" }
    );
  });
  y += 8;

  // Day rows
  days.forEach((day, idx) => {
    const rowY = y + idx * mealRowH;
    const isEven = idx % 2 === 0;

    if (isEven) {
      setFillColor(doc, scheme.light);
      doc.rect(MARGIN, rowY, CONTENT_W, mealRowH, "F");
    }

    // Day label
    setFillColor(doc, scheme.accent);
    doc.roundedRect(MARGIN + 1, rowY + 1, dayColW2 - 2, mealRowH - 2, 1, 1, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(day, MARGIN + dayColW2 / 2, rowY + mealRowH / 2 + 2, {
      align: "center",
    });

    // Cell borders
    setDrawColor(doc, scheme.secondary);
    doc.setLineWidth(0.15);
    mealCols.forEach((_, ci) => {
      doc.rect(
        MARGIN + dayColW2 + ci * mealColW,
        rowY,
        mealColW,
        mealRowH
      );
    });
  });

  // Outer border
  setDrawColor(doc, scheme.primary);
  doc.setLineWidth(0.4);
  doc.rect(MARGIN, y - 8, CONTENT_W, 8 + days.length * mealRowH);

  const gridBottom2 = y + days.length * mealRowH;

  // Water tracker
  let wy = gridBottom2 + 8;
  setTextColor(doc, scheme.accent);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("DAILY WATER TRACKER", MARGIN, wy);
  wy += 5;

  setTextColor(doc, scheme.secondary);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.text("Color in a glass for each cup of water (8 glasses per day)", MARGIN, wy);
  wy += 6;

  const glassW = 6;
  const glassH = 9;
  const glassGap = 1.5;
  const dayLabelW = 24;

  days.forEach((day, di) => {
    // Day label
    setTextColor(doc, scheme.text);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(day, MARGIN + 2, wy + glassH / 2 + 1);

    // 8 glasses
    setDrawColor(doc, scheme.secondary);
    doc.setLineWidth(0.2);
    for (let g = 0; g < 8; g++) {
      const gx = MARGIN + dayLabelW + g * (glassW + glassGap);
      doc.roundedRect(gx, wy, glassW, glassH, 1, 1, "S");
    }
    wy += glassH + 2;
  });

  addFooter(doc, scheme.secondary);

  /* ---------- Page 2: Shopping List ---------- */
  doc.addPage();
  fillPage(doc, scheme.bg);

  y = drawTitle(doc, "SHOPPING LIST", MARGIN + 10, scheme, 20);
  y += 2;

  // Week line
  setTextColor(doc, scheme.text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    "Week of: _____ / _____ / _________",
    PAGE_W / 2,
    y,
    { align: "center" }
  );
  y += 10;

  // 4 columns
  const shopCols = [
    { title: "PRODUCE", icon: "Fruits & Veggies" },
    { title: "PROTEIN", icon: "Meat, Fish, Eggs" },
    { title: "DAIRY & GRAINS", icon: "Milk, Bread, Rice" },
    { title: "PANTRY & OTHER", icon: "Canned, Spices, etc." },
  ];
  const shopColW = CONTENT_W / 4;

  shopCols.forEach((col, ci) => {
    const colX = MARGIN + ci * shopColW;

    // Column header
    setFillColor(doc, scheme.primary);
    doc.roundedRect(colX + 1, y, shopColW - 2, 10, 1, 1, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(col.title, colX + shopColW / 2, y + 4.5, {
      align: "center",
    });

    // Subtitle
    setTextColor(doc, scheme.secondary);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(5.5);
    doc.text(col.icon, colX + shopColW / 2, y + 9, {
      align: "center",
    });
  });

  const checkY = y + 14;

  // 8 checkbox lines per column
  shopCols.forEach((_, ci) => {
    const colX = MARGIN + ci * shopColW;
    setDrawColor(doc, scheme.secondary);

    for (let r = 0; r < 12; r++) {
      const ry = checkY + r * 9;
      drawCheckbox(doc, colX + 2, ry - 2.5, 3.5);
      setFillColor(doc, scheme.secondary);
      drawDottedLine(doc, colX + 8, ry, colX + shopColW - 3);
    }
  });

  // Column dividers
  setDrawColor(doc, scheme.light);
  doc.setLineWidth(0.2);
  for (let ci = 1; ci < 4; ci++) {
    const lx = MARGIN + ci * shopColW;
    doc.line(lx, y, lx, checkY + 12 * 9);
  }

  // Budget section at bottom
  const budgetY = checkY + 12 * 9 + 10;
  setFillColor(doc, scheme.light);
  doc.roundedRect(MARGIN, budgetY, CONTENT_W, 18, 2, 2, "F");

  setTextColor(doc, scheme.accent);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("BUDGET", MARGIN + 5, budgetY + 7);

  setTextColor(doc, scheme.text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Estimated: $__________", MARGIN + 40, budgetY + 7);
  doc.text("Actual: $__________", MARGIN + 100, budgetY + 7);
  doc.text("Difference: $__________", MARGIN + 40, budgetY + 14);

  addFooter(doc, scheme.secondary);
}

/* ------------------------------------------------------------------ */
/*  6. BUDGET WORKSHEET                                                */
/* ------------------------------------------------------------------ */

function generateBudgetWorksheet(doc: jsPDF, scheme: ColorScheme) {
  fillPage(doc, scheme.bg);

  let y = drawTitle(doc, "MONTHLY BUDGET", MARGIN + 8, scheme, 22);

  // Month/Year
  setTextColor(doc, scheme.text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    "Month: _______________     Year: __________",
    PAGE_W / 2,
    y,
    { align: "center" }
  );
  y += 10;

  const halfW = CONTENT_W / 2 - 3;
  const leftX = MARGIN;
  const rightX = MARGIN + halfW + 6;

  /* ---------- LEFT: INCOME ---------- */
  // Section header
  setFillColor(doc, scheme.primary);
  doc.roundedRect(leftX, y, halfW, 8, 1.5, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("INCOME", leftX + halfW / 2, y + 5.5, { align: "center" });

  // Income table header
  let incY = y + 12;
  setFillColor(doc, scheme.light);
  doc.rect(leftX, incY, halfW, 6, "F");
  setTextColor(doc, scheme.accent);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("SOURCE", leftX + 3, incY + 4);
  doc.text("AMOUNT", leftX + halfW - 3, incY + 4, { align: "right" });
  incY += 6;

  // 5 income rows
  const incRows = [
    "Salary / Wages",
    "Side Income",
    "Investments",
    "Other Income 1",
    "Other Income 2",
  ];
  setDrawColor(doc, scheme.secondary);
  doc.setLineWidth(0.15);

  incRows.forEach((label) => {
    doc.rect(leftX, incY, halfW, 10);
    setTextColor(doc, scheme.text);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(label, leftX + 3, incY + 6.5);
    doc.text("$", leftX + halfW - 28, incY + 6.5);
    setFillColor(doc, scheme.secondary);
    drawDottedLine(doc, leftX + halfW - 25, incY + 6.5, leftX + halfW - 3);
    incY += 10;
  });

  // Total row
  setFillColor(doc, scheme.accent);
  doc.rect(leftX, incY, halfW, 10, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("TOTAL INCOME", leftX + 3, incY + 7);
  doc.text("$__________", leftX + halfW - 3, incY + 7, {
    align: "right",
  });

  /* ---------- RIGHT: EXPENSES ---------- */
  setFillColor(doc, scheme.primary);
  doc.roundedRect(rightX, y, halfW, 8, 1.5, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("EXPENSES", rightX + halfW / 2, y + 5.5, { align: "center" });

  let expY = y + 12;
  setFillColor(doc, scheme.light);
  doc.rect(rightX, expY, halfW, 6, "F");
  setTextColor(doc, scheme.accent);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("CATEGORY", rightX + 3, expY + 4);
  doc.text("BUDGETED", rightX + halfW / 2, expY + 4, { align: "center" });
  doc.text("ACTUAL", rightX + halfW - 3, expY + 4, { align: "right" });
  expY += 6;

  const expCategories = [
    "Housing / Rent",
    "Food & Groceries",
    "Transportation",
    "Utilities",
    "Entertainment",
    "Health & Fitness",
    "Savings",
    "Other",
  ];

  const budgetedColX = rightX + halfW * 0.45;
  const actualColX = rightX + halfW * 0.75;

  setDrawColor(doc, scheme.secondary);
  doc.setLineWidth(0.15);

  expCategories.forEach((cat, idx) => {
    const isEven = idx % 2 === 0;
    if (isEven) {
      setFillColor(doc, scheme.light);
      doc.rect(rightX, expY, halfW, 10, "F");
    }
    doc.rect(rightX, expY, halfW, 10);

    setTextColor(doc, scheme.text);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(cat, rightX + 3, expY + 6.5);

    // Budgeted amount
    doc.setFontSize(7);
    doc.text("$", budgetedColX, expY + 6.5);
    setFillColor(doc, scheme.secondary);
    drawDottedLine(doc, budgetedColX + 4, expY + 6.5, actualColX - 3);

    // Actual amount
    doc.text("$", actualColX, expY + 6.5);
    drawDottedLine(doc, actualColX + 4, expY + 6.5, rightX + halfW - 3);

    expY += 10;
  });

  // Total expenses row
  setFillColor(doc, scheme.accent);
  doc.rect(rightX, expY, halfW, 10, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("TOTAL EXPENSES", rightX + 3, expY + 7);
  doc.text("$________", budgetedColX, expY + 7);
  doc.text("$________", actualColX, expY + 7);

  /* ---------- BOTTOM: NET & SAVINGS ---------- */
  const bottomY = Math.max(incY + 10, expY + 10) + 8;

  // NET box
  setFillColor(doc, scheme.primary);
  doc.roundedRect(MARGIN, bottomY, CONTENT_W, 20, 2, 2, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("NET = INCOME - EXPENSES", PAGE_W / 2, bottomY + 9, {
    align: "center",
  });
  doc.setFontSize(16);
  doc.text("$______________", PAGE_W / 2, bottomY + 17, {
    align: "center",
  });

  // Savings goal tracker
  const savY = bottomY + 28;
  setTextColor(doc, scheme.accent);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("SAVINGS GOAL TRACKER", MARGIN, savY);

  const barY = savY + 6;
  setTextColor(doc, scheme.text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Goal: $__________", MARGIN, barY);
  doc.text("Saved: $__________", MARGIN + 50, barY);

  // Progress bar
  const barHeight = 8;
  const barStartX = MARGIN;
  const barEndY = barY + 6;

  setFillColor(doc, scheme.light);
  doc.roundedRect(barStartX, barEndY, CONTENT_W, barHeight, 2, 2, "F");

  // Percentage markers
  setTextColor(doc, scheme.secondary);
  doc.setFontSize(6);
  for (let p = 0; p <= 100; p += 10) {
    const px = barStartX + (CONTENT_W * p) / 100;
    doc.text(`${p}%`, px, barEndY + barHeight + 4, { align: "center" });

    // Tick mark
    setDrawColor(doc, scheme.secondary);
    doc.setLineWidth(0.15);
    doc.line(px, barEndY + barHeight, px, barEndY + barHeight + 1);
  }

  // Filled indicator (example at 0%)
  setDrawColor(doc, scheme.accent);
  doc.setLineWidth(0.4);
  doc.roundedRect(barStartX, barEndY, CONTENT_W, barHeight, 2, 2, "S");

  // Notes area
  const notesY = barEndY + barHeight + 12;
  setTextColor(doc, scheme.accent);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("NOTES", MARGIN, notesY);

  setDrawColor(doc, scheme.light);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, notesY + 3, CONTENT_W, 28, 2, 2, "S");

  setTextColor(doc, scheme.secondary);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.text("Financial notes, upcoming expenses, adjustments...", MARGIN + 3, notesY + 8);

  addFooter(doc, scheme.secondary);
}

/* ------------------------------------------------------------------ */
/*  Route Handler                                                      */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  try {
    const { printableType, colorScheme, quotes } = await req.json();

    if (!printableType || !colorScheme) {
      return NextResponse.json(
        { error: "Missing required fields: printableType and colorScheme" },
        { status: 400 }
      );
    }

    const scheme =
      COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES["minimal-black"];
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    // Set default font
    doc.setFont("helvetica", "normal");

    switch (printableType) {
      case "quote_prints":
        generateQuotePrints(doc, scheme, quotes || DEFAULT_QUOTES);
        break;
      case "habit_tracker":
        generateHabitPrintable(doc, scheme);
        break;
      case "gratitude_journal":
        generateGratitudeJournal(doc, scheme);
        break;
      case "goal_worksheet":
        generateGoalWorksheet(doc, scheme);
        break;
      case "meal_planner":
        generateMealPrintable(doc, scheme);
        break;
      case "budget_worksheet":
        generateBudgetWorksheet(doc, scheme);
        break;
      default:
        return NextResponse.json(
          {
            error: `Invalid printable type "${printableType}". Supported: quote_prints, habit_tracker, gratitude_journal, goal_worksheet, meal_planner, budget_worksheet`,
          },
          { status: 400 }
        );
    }

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${printableType}_${colorScheme}.pdf"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (err: unknown) {
    console.error("[Printable Generate] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
