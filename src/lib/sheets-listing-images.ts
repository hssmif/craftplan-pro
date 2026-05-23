"use client";

// ══════════════════════════════════════════════════════════════
// Sheets Listing Image Generator — v2 (Conversion Optimized)
// Creates 7 high-converting Etsy listing images via Canvas.
//
// Design principles:
//   1. ONE message per image
//   2. Text must be readable at 300x300px thumbnail
//   3. Minimum 48px for any text that matters
//   4. Maximum 3 text elements per image
//   5. Dark premium, high contrast, gold accent
//   6. 2000x2000 square (Etsy optimal)
// ══════════════════════════════════════════════════════════════

export interface ListingImageSet {
  images: Array<{
    id: string;
    label: string;
    dataUrl: string;
  }>;
}

// ── Theme ───────────────────────────────────────────────────

interface T {
  bg: string;
  card: string;
  accent: string;
  white: string;
  muted: string;
  dim: string;
  navy: string;
  green: string;
  red: string;
  warn: string;
  rose: string;
  purple: string;
  blue: string;
  tblBg: string;
  tblAlt: string;
}

const t: T = {
  bg: "#080e1a",
  card: "#111b2e",
  accent: "#D4AF37",
  white: "#f8fafc",
  muted: "#94a3b8",
  dim: "#475569",
  navy: "#1B3A5C",
  green: "#238948",
  red: "#A61A0B",
  warn: "#EDB430",
  rose: "#CC6666",
  purple: "#a78bfa",
  blue: "#60a5fa",
  tblBg: "#162033",
  tblAlt: "#0f172a",
};

// ── Helpers ─────────────────────────────────────────────────

function mk(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = 2000;
  c.height = 2000;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, 2000, 2000);
  return [c, ctx];
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function txt(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = "left") {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.fillText(s, x, y);
  ctx.textAlign = "left";
}

function line(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function laptop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  // Bezel
  rect(ctx, x, y, w, h, 18, "#1e293b");
  // Screen
  rect(ctx, x + 14, y + 14, w - 28, h - 28, 10, t.card);
  // Base
  rect(ctx, x - 50, y + h + 2, w + 100, 22, 6, "#334155");
  line(ctx, x - 30, y + h + 2, w + 60, 3, "#475569");
}

// ═══════════════════════════════════════════════════════════
// IMAGE 1: HERO — optimized for Etsy CTR
// Big bold title, laptop with simplified dashboard, clean
// ═══════════════════════════════════════════════════════════

function img1_hero(): string {
  const [c, ctx] = mk();

  // Title — HUGE, readable at any size
  txt(ctx, "PAY YOURSELF FIRST", 1000, 200, "bold 108px sans-serif", t.white, "center");

  // Subtitle
  txt(ctx, "Budget Tracker", 1000, 320, "bold 72px sans-serif", t.accent, "center");

  // Badge
  rect(ctx, 750, 370, 500, 56, 28, t.navy);
  txt(ctx, "Google Sheets Template", 1000, 408, "bold 28px sans-serif", t.muted, "center");

  // Laptop — large, centered, showing simplified dashboard
  laptop(ctx, 250, 500, 1500, 950);

  const sx = 274, sy = 524;

  // Dashboard header
  rect(ctx, sx, sy, 1452, 70, 0, t.navy);
  txt(ctx, "💰 PAY YOURSELF FIRST — BUDGET DASHBOARD", sx + 40, sy + 48, "bold 32px sans-serif", t.accent);

  // Controls bar
  rect(ctx, sx, sy + 76, 1452, 50, 0, t.tblAlt);
  txt(ctx, "📅 January", sx + 40, sy + 110, "bold 22px sans-serif", t.muted);
  txt(ctx, "💰 $4,200.00", sx + 1200, sy + 110, "bold 28px sans-serif", t.accent);

  // KPI row — 4 big metric cards
  const kpis = [
    { label: "INCOME", val: "$4,200", color: t.green },
    { label: "SPENT", val: "$3,254", color: t.red },
    { label: "SAVED", val: "$946", color: t.accent },
    { label: "RATE", val: "23%", color: t.green },
  ];
  kpis.forEach((k, i) => {
    const kx = sx + 30 + i * 355;
    rect(ctx, kx, sy + 146, 330, 110, 12, t.tblBg);
    txt(ctx, k.label, kx + 165, sy + 182, "bold 18px sans-serif", t.dim, "center");
    txt(ctx, k.val, kx + 165, sy + 236, "bold 42px sans-serif", k.color, "center");
  });

  // Left panel header: Savings Goals
  rect(ctx, sx + 30, sy + 280, 690, 44, 0, t.rose);
  txt(ctx, "🎯 SAVINGS GOALS", sx + 56, sy + 310, "bold 22px sans-serif", "#fff");

  // Simplified goal rows (bigger text, fewer columns)
  const goals = [
    ["Emergency Fund", "$1,100", "22%"],
    ["Travel Fund", "$800", "23%"],
    ["Retirement", "$2,500", "38%"],
    ["High-Yield", "$900", "45%"],
  ];
  goals.forEach((g, i) => {
    const gy = sy + 330 + i * 44;
    rect(ctx, sx + 30, gy, 690, 40, 0, i % 2 === 0 ? t.tblBg : t.tblAlt);
    txt(ctx, g[0], sx + 56, gy + 28, "20px sans-serif", t.white);
    txt(ctx, g[1], sx + 460, gy + 28, "bold 20px sans-serif", t.green);
    // Mini progress bar
    const pct = parseInt(g[2]) / 100;
    rect(ctx, sx + 560, gy + 14, 140, 14, 7, t.tblAlt);
    rect(ctx, sx + 560, gy + 14, 140 * pct, 14, 7, t.green);
  });

  // Right panel header: Spending
  rect(ctx, sx + 750, sy + 280, 672, 44, 0, t.navy);
  txt(ctx, "💳 WHERE YOUR MONEY WENT", sx + 776, sy + 310, "bold 22px sans-serif", "#fff");

  const spend = [
    ["Savings", "$1,100", "✅ Funded"],
    ["Needs", "$1,492", "⚠️ 101%"],
    ["Wants", "$160", "✅ On Track"],
    ["Bills", "$502", "✅ On Track"],
  ];
  spend.forEach((s, i) => {
    const sy2 = sy + 330 + i * 44;
    rect(ctx, sx + 750, sy2, 672, 40, 0, i % 2 === 0 ? t.tblBg : t.tblAlt);
    txt(ctx, s[0], sx + 776, sy2 + 28, "20px sans-serif", t.white);
    txt(ctx, s[1], sx + 1060, sy2 + 28, "bold 20px sans-serif", t.muted);
    txt(ctx, s[2], sx + 1260, sy2 + 28, "bold 20px sans-serif", s[2].includes("✅") ? t.green : t.warn);
  });

  // Tab bar
  const tabs = ["Setup", "Dashboard", "Transactions", "Budget Setup", "Monthly", "Goals"];
  tabs.forEach((tab, i) => {
    const tx = sx + 20 + i * 238;
    rect(ctx, tx, sy + 870, 228, 36, 6, i === 1 ? t.navy : t.tblAlt);
    txt(ctx, tab, tx + 114, sy + 895, "bold 16px sans-serif", i === 1 ? t.accent : t.dim, "center");
  });

  // Bottom badges
  const badges = ["BEGINNER FRIENDLY", "AUTOMATED FORMULAS", "INSTANT DOWNLOAD"];
  badges.forEach((b, i) => {
    const bx = 340 + i * 480;
    rect(ctx, bx, 1560, 400, 56, 28, t.navy);
    txt(ctx, b, bx + 200, 1596, "bold 22px sans-serif", t.accent, "center");
  });

  return c.toDataURL("image/jpeg", 0.92);
}

// ═══════════════════════════════════════════════════════════
// IMAGE 2: PROBLEM — emotional hook
// ═══════════════════════════════════════════════════════════

function img2_problem(): string {
  const [c, ctx] = mk();

  // Centered, massive text
  txt(ctx, "Where did", 1000, 650, "bold 120px sans-serif", t.white, "center");
  txt(ctx, "my money go?", 1000, 800, "bold 120px sans-serif", t.accent, "center");

  // Thin divider
  rect(ctx, 800, 870, 400, 4, 2, t.accent);

  // Subtext
  txt(ctx, "A budget system that saves first,", 1000, 970, "44px sans-serif", t.muted, "center");
  txt(ctx, "so there's always money left.", 1000, 1030, "bold 44px sans-serif", t.white, "center");

  // Three pain points — bigger, spaced
  const pains = [
    "No idea where money goes each month",
    "Savings is always an afterthought",
    "Tried budgeting — too complicated",
  ];
  pains.forEach((p, i) => {
    const py = 1200 + i * 90;
    rect(ctx, 400, py - 10, 1200, 70, 12, t.card);
    txt(ctx, "✗", 440, py + 36, "bold 32px sans-serif", t.red);
    txt(ctx, p, 500, py + 36, "32px sans-serif", t.muted);
  });

  return c.toDataURL("image/jpeg", 0.92);
}

// ═══════════════════════════════════════════════════════════
// IMAGE 3: DASHBOARD — simplified preview
// Show KPIs + one section, not everything
// ═══════════════════════════════════════════════════════════

function img3_dashboard(): string {
  const [c, ctx] = mk();

  txt(ctx, "One dashboard.", 1000, 140, "bold 96px sans-serif", t.white, "center");
  txt(ctx, "Total control.", 1000, 260, "bold 96px sans-serif", t.accent, "center");

  // Dashboard card
  rect(ctx, 120, 380, 1760, 1440, 24, t.card);

  // Header bar
  rect(ctx, 140, 400, 1720, 80, 0, t.navy);
  txt(ctx, "💰 PAY YOURSELF FIRST", 180, 454, "bold 40px sans-serif", t.accent);
  txt(ctx, "📅 January  ·  $4,200/mo", 1200, 454, "28px sans-serif", t.muted);

  // 4 KPI cards — BIG
  const kpis = [
    { label: "TOTAL INCOME", val: "$4,200", color: t.green },
    { label: "TOTAL SPENT", val: "$3,254", color: t.red },
    { label: "NET SAVINGS", val: "$946", color: t.accent },
    { label: "SAVINGS RATE", val: "23%", color: t.green },
  ];
  kpis.forEach((k, i) => {
    const kx = 180 + i * 420;
    rect(ctx, kx, 520, 380, 160, 16, t.tblBg);
    txt(ctx, k.label, kx + 190, 570, "bold 22px sans-serif", t.dim, "center");
    txt(ctx, k.val, kx + 190, 640, "bold 56px sans-serif", k.color, "center");
  });

  // Spending section — simplified, BIG rows
  rect(ctx, 160, 730, 1680, 60, 0, t.navy);
  txt(ctx, "💳 WHERE YOUR MONEY WENT", 200, 770, "bold 28px sans-serif", "#fff");
  txt(ctx, "BUDGETED", 1060, 770, "bold 18px sans-serif", t.dim);
  txt(ctx, "SPENT", 1310, 770, "bold 18px sans-serif", t.dim);
  txt(ctx, "STATUS", 1560, 770, "bold 18px sans-serif", t.dim);

  const spend = [
    ["Savings (Paid First)", "$1,050", "$1,100", "✅ Funded"],
    ["Needs", "$1,470", "$1,492", "⚠️ 101%"],
    ["Wants", "$840", "$160", "✅ On Track"],
    ["Bills & Subscriptions", "$840", "$502", "✅ On Track"],
  ];
  spend.forEach((s, i) => {
    const ry = 800 + i * 70;
    rect(ctx, 160, ry, 1680, 66, 0, i % 2 === 0 ? t.tblBg : t.tblAlt);
    txt(ctx, s[0], 200, ry + 44, "bold 28px sans-serif", t.white);
    txt(ctx, s[1], 1060, ry + 44, "28px sans-serif", t.muted);
    txt(ctx, s[2], 1310, ry + 44, "28px sans-serif", s[2] === "$1,492" ? t.warn : t.white);
    txt(ctx, s[3], 1560, ry + 44, "bold 28px sans-serif", s[3].includes("✅") ? t.green : t.warn);
  });

  // Savings goals — simplified
  rect(ctx, 160, 1100, 1680, 60, 0, t.rose);
  txt(ctx, "🎯 SAVINGS GOALS", 200, 1140, "bold 28px sans-serif", "#fff");

  const goals = [
    ["Emergency Fund", "$5,000", "$1,100", 22],
    ["Travel Fund", "$3,500", "$800", 23],
    ["Retirement (Roth)", "$6,500", "$2,500", 38],
    ["High-Yield Savings", "$2,000", "$900", 45],
    ["Sinking Fund", "$1,500", "$600", 40],
  ];
  goals.forEach((g, i) => {
    const gy = 1170 + i * 62;
    rect(ctx, 160, gy, 1680, 58, 0, i % 2 === 0 ? t.tblBg : t.tblAlt);
    txt(ctx, g[0] as string, 200, gy + 40, "26px sans-serif", t.white);
    txt(ctx, `${g[1]} target`, 800, gy + 40, "22px sans-serif", t.muted);
    txt(ctx, `${g[2]} saved`, 1100, gy + 40, "bold 22px sans-serif", t.green);
    // Progress bar
    const pct = (g[3] as number) / 100;
    rect(ctx, 1420, gy + 18, 380, 22, 11, t.tblAlt);
    rect(ctx, 1420, gy + 18, 380 * pct, 22, 11, t.green);
    txt(ctx, `${g[3]}%`, 1420 + 380 * pct + 14, gy + 38, "bold 18px sans-serif", t.green);
  });

  return c.toDataURL("image/jpeg", 0.92);
}

// ═══════════════════════════════════════════════════════════
// IMAGE 4: SAVINGS — focused feature highlight
// ═══════════════════════════════════════════════════════════

function img4_savings(): string {
  const [c, ctx] = mk();

  txt(ctx, "Track every goal.", 1000, 180, "bold 96px sans-serif", t.white, "center");
  txt(ctx, "See real progress.", 1000, 300, "bold 96px sans-serif", t.accent, "center");

  // 5 goal cards — visual, not tabular
  const goals = [
    { name: "Emergency Fund", target: "$5,000", saved: "$1,100", pct: 22 },
    { name: "Travel Fund", target: "$3,500", saved: "$800", pct: 23 },
    { name: "Retirement", target: "$6,500", saved: "$2,500", pct: 38 },
    { name: "High-Yield Savings", target: "$2,000", saved: "$900", pct: 45 },
    { name: "Sinking Fund", target: "$1,500", saved: "$600", pct: 40 },
  ];

  goals.forEach((g, i) => {
    const gy = 440 + i * 230;
    rect(ctx, 200, gy, 1600, 200, 20, t.card);

    // Goal name
    txt(ctx, g.name, 260, gy + 55, "bold 36px sans-serif", t.white);

    // Target + saved
    txt(ctx, `${g.saved} of ${g.target}`, 260, gy + 100, "28px sans-serif", t.muted);

    // Large progress bar
    rect(ctx, 260, gy + 130, 1200, 32, 16, t.tblAlt);
    rect(ctx, 260, gy + 130, 1200 * (g.pct / 100), 32, 16, t.green);

    // Percentage — big, right-aligned
    txt(ctx, `${g.pct}%`, 1700, gy + 90, "bold 64px sans-serif", t.green, "center");
  });

  // Bottom total
  rect(ctx, 200, 1620, 1600, 80, 16, t.navy);
  txt(ctx, "TOTAL SAVED: $5,900 of $18,500", 1000, 1674, "bold 36px sans-serif", t.accent, "center");

  return c.toDataURL("image/jpeg", 0.92);
}

// ═══════════════════════════════════════════════════════════
// IMAGE 5: METHOD — the 4 buckets
// ═══════════════════════════════════════════════════════════

function img5_method(): string {
  const [c, ctx] = mk();

  txt(ctx, "Save first.", 1000, 200, "bold 108px sans-serif", t.accent, "center");
  txt(ctx, "Spend smarter.", 1000, 340, "bold 108px sans-serif", t.white, "center");

  // 4 big bucket cards — 2x2 grid
  const buckets = [
    { icon: "💰", label: "SAVINGS", pct: "25%", color: t.green },
    { icon: "🏠", label: "NEEDS", pct: "35%", color: t.blue },
    { icon: "☕", label: "WANTS", pct: "20%", color: t.accent },
    { icon: "📱", label: "BILLS", pct: "20%", color: t.purple },
  ];

  buckets.forEach((b, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const bx = 200 + col * 840;
    const by = 500 + row * 480;
    rect(ctx, bx, by, 760, 420, 24, t.card);

    // Icon — large
    txt(ctx, b.icon, bx + 80, by + 130, "80px sans-serif", "#fff");

    // Label
    txt(ctx, b.label, bx + 200, by + 100, "bold 48px sans-serif", b.color);

    // Percentage — massive
    txt(ctx, b.pct, bx + 200, by + 200, "bold 120px sans-serif", b.color);

    // Simple desc
    const descs = ["Paid first", "Essential costs", "Lifestyle", "Fixed monthly"];
    txt(ctx, descs[i], bx + 200, by + 270, "32px sans-serif", t.muted);

    // Thin accent bar
    rect(ctx, bx + 200, by + 310, 400, 6, 3, b.color);
  });

  // Bottom
  txt(ctx, "Every dollar has a job before you spend it.", 1000, 1560, "bold 36px sans-serif", t.muted, "center");

  return c.toDataURL("image/jpeg", 0.92);
}

// ═══════════════════════════════════════════════════════════
// IMAGE 6: WHAT'S INCLUDED — clean grid
// ═══════════════════════════════════════════════════════════

function img6_included(): string {
  const [c, ctx] = mk();

  txt(ctx, "6 tabs.", 1000, 180, "bold 108px sans-serif", t.accent, "center");
  txt(ctx, "One complete system.", 1000, 320, "bold 80px sans-serif", t.white, "center");

  const tabs = [
    { icon: "⚙️", name: "Setup", desc: "Get started in 5 min" },
    { icon: "📊", name: "Dashboard", desc: "Your full budget view" },
    { icon: "💳", name: "Transactions", desc: "Log every expense" },
    { icon: "📋", name: "Budget Setup", desc: "Set income & goals" },
    { icon: "📅", name: "Monthly Summary", desc: "Auto monthly totals" },
    { icon: "🎯", name: "Savings Goals", desc: "Track real progress" },
  ];

  // 2x3 grid
  tabs.forEach((tab, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const tx = 180 + col * 860;
    const ty = 460 + row * 380;

    rect(ctx, tx, ty, 800, 330, 20, t.card);

    // Icon — big
    txt(ctx, tab.icon, tx + 60, ty + 110, "72px sans-serif", "#fff");

    // Name — bold
    txt(ctx, tab.name, tx + 180, ty + 90, "bold 42px sans-serif", t.white);

    // Description
    txt(ctx, tab.desc, tx + 180, ty + 150, "30px sans-serif", t.muted);

    // Accent underline
    rect(ctx, tx + 180, ty + 180, 300, 4, 2, t.accent);
  });

  // Bottom badge
  rect(ctx, 550, 1680, 900, 70, 35, t.navy);
  txt(ctx, "All formulas. Zero manual math.", 1000, 1726, "bold 30px sans-serif", t.accent, "center");

  return c.toDataURL("image/jpeg", 0.92);
}

// ═══════════════════════════════════════════════════════════
// IMAGE 7: HOW IT WORKS — 3 simple steps
// ═══════════════════════════════════════════════════════════

function img7_howItWorks(): string {
  const [c, ctx] = mk();

  txt(ctx, "Set up in", 1000, 180, "bold 96px sans-serif", t.white, "center");
  txt(ctx, "5 minutes.", 1000, 300, "bold 96px sans-serif", t.accent, "center");

  // 3 steps (not 4 — simpler)
  const steps = [
    { num: "1", title: "Download", desc: "Get your .xlsx\nfrom Etsy" },
    { num: "2", title: "Open in Sheets", desc: "Upload to Drive\n→ Open with Sheets" },
    { num: "3", title: "Start budgeting", desc: "Enter income\n& track spending" },
  ];

  steps.forEach((step, i) => {
    const sx = 180 + i * 580;
    const sy = 480;

    rect(ctx, sx, sy, 520, 600, 24, t.card);

    // Number circle — large
    rect(ctx, sx + 190, sy + 50, 140, 140, 70, t.navy);
    txt(ctx, step.num, sx + 238, sy + 148, "bold 72px sans-serif", t.accent);

    // Title
    txt(ctx, step.title, sx + 260, sy + 280, "bold 40px sans-serif", t.white, "center");

    // Description
    const lines = step.desc.split("\n");
    lines.forEach((l, li) => {
      txt(ctx, l, sx + 260, sy + 370 + li * 50, "30px sans-serif", t.muted, "center");
    });

    // Arrow
    if (i < 2) {
      txt(ctx, "→", sx + 540, sy + 280, "bold 64px sans-serif", t.accent);
    }
  });

  // Bottom features — 2x2 grid of checkmarks
  const features = [
    "No app needed",
    "No subscription",
    "Works on any device",
    "Instant download",
  ];
  features.forEach((f, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const fx = 400 + col * 700;
    const fy = 1220 + row * 80;
    txt(ctx, "✓", fx, fy, "bold 36px sans-serif", t.green);
    txt(ctx, f, fx + 50, fy, "bold 32px sans-serif", t.white);
  });

  // Bottom badge
  rect(ctx, 500, 1480, 1000, 80, 40, t.navy);
  txt(ctx, "Google Sheets + Excel Compatible", 1000, 1532, "bold 32px sans-serif", t.accent, "center");

  // CTA feel
  rect(ctx, 600, 1620, 800, 80, 16, t.accent);
  txt(ctx, "DIGITAL DOWNLOAD · INSTANT ACCESS", 1000, 1672, "bold 28px sans-serif", t.bg, "center");

  return c.toDataURL("image/jpeg", 0.92);
}

// ── Main Generator ──────────────────────────────────────────

export function generateSheetsListingImages(
  _projectName: string,
): ListingImageSet {
  return {
    images: [
      { id: "hero", label: "Hero Mockup (Thumbnail)", dataUrl: img1_hero() },
      { id: "problem", label: "Problem Statement", dataUrl: img2_problem() },
      { id: "dashboard", label: "Dashboard Preview", dataUrl: img3_dashboard() },
      { id: "savings", label: "Savings Goals Feature", dataUrl: img4_savings() },
      { id: "method", label: "Budget Method", dataUrl: img5_method() },
      { id: "included", label: "What's Included", dataUrl: img6_included() },
      { id: "how-it-works", label: "How It Works", dataUrl: img7_howItWorks() },
    ],
  };
}
