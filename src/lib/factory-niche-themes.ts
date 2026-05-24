/**
 * factory-niche-themes.ts
 *
 * Niche-aware design system for the Product Factory.
 * Each niche gets a complete, distinct visual identity — not just color swaps
 * but different typography scales, layout personalities, decorative elements,
 * and spreadsheet token sets.
 */

// ─── Interface ───────────────────────────────────────────────────────────────

export interface NicheDesignProfile {
  id: string;
  label: string;

  // === PALETTE ===
  palette: {
    primary: string;
    primaryLight: string;
    accent: string;
    accentLight: string;
    background: string;
    surface: string;
    text: string;
    textMuted: string;
    success: string;
    warning: string;
    danger: string;
    info: string;
  };

  // === KPI CARD STYLES ===
  kpiStyle: {
    cards: Array<{
      bg: string;
      text: string;
      label: string;
    }>;
    borderRadius: number;
    shadow: "soft" | "medium" | "sharp";
  };

  // === TYPOGRAPHY HIERARCHY ===
  typography: {
    titleSize: number;
    subtitleSize: number;
    sectionHeaderSize: number;
    bodySize: number;
    captionSize: number;
    titleWeight: number;
    fontFamily: string;
  };

  // === LAYOUT PERSONALITY ===
  layout: {
    cardRadius: number;
    sectionSpacing: number;
    headerStyle:
      | "full-width"
      | "rounded-bar"
      | "underlined"
      | "pill"
      | "minimal";
    tableStyle: "striped" | "bordered" | "clean" | "card-rows";
    progressBarStyle: "rounded" | "sharp" | "pill" | "segmented";
    statusBadgeStyle: "pill" | "dot" | "tag" | "icon-only";
  };

  // === CHART STYLE ===
  chartStyle: {
    colors: string[];
    style: "soft" | "bold" | "muted" | "vibrant";
  };

  // === IMAGE RENDERING ===
  imageStyle: {
    heroGradient: [string, string];
    cardShadowColor: string;
    accentBarHeight: number;
    decorativeElements:
      | "circles"
      | "dots"
      | "lines"
      | "none"
      | "stars"
      | "hearts";
  };

  // === SPREADSHEET TOKENS ===
  spreadsheetTokens: {
    headerBg: string;
    headerText: string;
    rowAlt: string;
    totalsBg: string;
    totalsText: string;
    borderColor: string;
    kpiCards: Array<{ bg: string; text: string }>;
    sectionBg: string;
    sectionText: string;
  };
}

// ─── Profiles ────────────────────────────────────────────────────────────────

export const NICHE_PROFILES: Record<string, NicheDesignProfile> = {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BABY BUDGET — Soft, warm, nurturing
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "baby-budget": {
    id: "baby-budget",
    label: "Baby Budget Planner",
    palette: {
      primary: "#E8B4C8",
      primaryLight: "#F5D6E5",
      accent: "#A8D8C8",
      accentLight: "#D0EDE4",
      background: "#FFF9FB",
      surface: "#FFFFFF",
      text: "#4A3B40",
      textMuted: "#8A7580",
      success: "#7BC4A8",
      warning: "#F0C87A",
      danger: "#E89B9B",
      info: "#A8C4E0",
    },
    kpiStyle: {
      cards: [
        { bg: "#F5D6E5", text: "#8A4060", label: "#B06080" },
        { bg: "#D6E8F5", text: "#3A5A80", label: "#5A7A9A" },
        { bg: "#D0EDE4", text: "#2A6A50", label: "#4A8A6A" },
        { bg: "#E8D6F5", text: "#6A3A8A", label: "#8A5AA0" },
      ],
      borderRadius: 16,
      shadow: "soft",
    },
    typography: {
      titleSize: 44,
      subtitleSize: 22,
      sectionHeaderSize: 18,
      bodySize: 13,
      captionSize: 10,
      titleWeight: 700,
      fontFamily: "'Nunito', 'Segoe UI', sans-serif",
    },
    layout: {
      cardRadius: 16,
      sectionSpacing: 28,
      headerStyle: "rounded-bar",
      tableStyle: "striped",
      progressBarStyle: "rounded",
      statusBadgeStyle: "pill",
    },
    chartStyle: {
      colors: ["#E8B4C8", "#A8D8C8", "#F0C87A", "#A8C4E0", "#E8D6F5", "#B4E0D0"],
      style: "soft",
    },
    imageStyle: {
      heroGradient: ["#FFF0F5", "#F0E8F5"],
      cardShadowColor: "rgba(200, 160, 180, 0.15)",
      accentBarHeight: 6,
      decorativeElements: "hearts",
    },
    spreadsheetTokens: {
      headerBg: "E8B4C8",
      headerText: "4A3B40",
      rowAlt: "FFF0F5",
      totalsBg: "F5D6E5",
      totalsText: "4A3B40",
      borderColor: "E8D0DC",
      kpiCards: [
        { bg: "F5D6E5", text: "8A4060" },
        { bg: "D6E8F5", text: "3A5A80" },
        { bg: "D0EDE4", text: "2A6A50" },
        { bg: "E8D6F5", text: "6A3A8A" },
      ],
      sectionBg: "F5D6E5",
      sectionText: "4A3B40",
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PREGNANCY PLANNER — Elegant, feminine, calm
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "pregnancy-planner": {
    id: "pregnancy-planner",
    label: "Pregnancy Planner",
    palette: {
      primary: "#C4A4A2",
      primaryLight: "#E0CCC8",
      accent: "#D4AF37",
      accentLight: "#F0DFA0",
      background: "#FFFDF8",
      surface: "#FFFFFF",
      text: "#3E2E2C",
      textMuted: "#887070",
      success: "#8BAF7A",
      warning: "#D4AF37",
      danger: "#C47070",
      info: "#8CA8C4",
    },
    kpiStyle: {
      cards: [
        { bg: "#E8D0CE", text: "#6A3A38", label: "#9A6060" },
        { bg: "#F5ECD0", text: "#6A5A20", label: "#8A7A40" },
        { bg: "#D0DCC8", text: "#3A5A30", label: "#5A7A50" },
        { bg: "#F0D8D4", text: "#7A3A3A", label: "#A06060" },
      ],
      borderRadius: 12,
      shadow: "medium",
    },
    typography: {
      titleSize: 42,
      subtitleSize: 20,
      sectionHeaderSize: 17,
      bodySize: 13,
      captionSize: 10,
      titleWeight: 600,
      fontFamily: "'Playfair Display', 'Georgia', serif",
    },
    layout: {
      cardRadius: 12,
      sectionSpacing: 26,
      headerStyle: "rounded-bar",
      tableStyle: "clean",
      progressBarStyle: "rounded",
      statusBadgeStyle: "pill",
    },
    chartStyle: {
      colors: ["#C4A4A2", "#D4AF37", "#8BAF7A", "#8CA8C4", "#DBA4B0", "#B4C4A4"],
      style: "soft",
    },
    imageStyle: {
      heroGradient: ["#FFF8F0", "#F5ECE0"],
      cardShadowColor: "rgba(180, 150, 140, 0.15)",
      accentBarHeight: 5,
      decorativeElements: "circles",
    },
    spreadsheetTokens: {
      headerBg: "C4A4A2",
      headerText: "FFFFFF",
      rowAlt: "FFF8F2",
      totalsBg: "E8D0CE",
      totalsText: "3E2E2C",
      borderColor: "DCC8C4",
      kpiCards: [
        { bg: "E8D0CE", text: "6A3A38" },
        { bg: "F5ECD0", text: "6A5A20" },
        { bg: "D0DCC8", text: "3A5A30" },
        { bg: "F0D8D4", text: "7A3A3A" },
      ],
      sectionBg: "E0CCC8",
      sectionText: "3E2E2C",
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // WEDDING PLANNER — Premium, editorial, romantic luxury
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "wedding-planner": {
    id: "wedding-planner",
    label: "Wedding Planner",
    palette: {
      primary: "#722F37",
      primaryLight: "#A86068",
      accent: "#C9A96E",
      accentLight: "#E8D8B0",
      background: "#FFFDF5",
      surface: "#FFFFFF",
      text: "#2A1A1C",
      textMuted: "#6A5058",
      success: "#5A8A5C",
      warning: "#C9A96E",
      danger: "#8A2030",
      info: "#6A7A9A",
    },
    kpiStyle: {
      cards: [
        { bg: "#FFF5F0", text: "#722F37", label: "#A86068" },
        { bg: "#F5ECD0", text: "#6A5020", label: "#8A7040" },
        { bg: "#E8C8CC", text: "#5A2030", label: "#8A4050" },
        { bg: "#E0E0E8", text: "#3A3A50", label: "#5A5A70" },
      ],
      borderRadius: 4,
      shadow: "sharp",
    },
    typography: {
      titleSize: 46,
      subtitleSize: 20,
      sectionHeaderSize: 17,
      bodySize: 13,
      captionSize: 10,
      titleWeight: 700,
      fontFamily: "'Playfair Display', 'Didot', serif",
    },
    layout: {
      cardRadius: 4,
      sectionSpacing: 30,
      headerStyle: "full-width",
      tableStyle: "bordered",
      progressBarStyle: "sharp",
      statusBadgeStyle: "tag",
    },
    chartStyle: {
      colors: ["#722F37", "#C9A96E", "#A86068", "#6A7A9A", "#5A8A5C", "#D4A4A8"],
      style: "bold",
    },
    imageStyle: {
      heroGradient: ["#3A1820", "#5A2830"],
      cardShadowColor: "rgba(60, 20, 30, 0.20)",
      accentBarHeight: 4,
      decorativeElements: "lines",
    },
    spreadsheetTokens: {
      headerBg: "722F37",
      headerText: "FFFFFF",
      rowAlt: "FFF8F5",
      totalsBg: "5A2028",
      totalsText: "FFFFFF",
      borderColor: "C4A0A4",
      kpiCards: [
        { bg: "FFF5F0", text: "722F37" },
        { bg: "F5ECD0", text: "6A5020" },
        { bg: "E8C8CC", text: "5A2030" },
        { bg: "E0E0E8", text: "3A3A50" },
      ],
      sectionBg: "722F37",
      sectionText: "FFFFFF",
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BUSINESS P&L — Sharp, executive, performance-focused
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "business-pl": {
    id: "business-pl",
    label: "Business P&L Dashboard",
    palette: {
      primary: "#1B2A4A",
      primaryLight: "#3A5070",
      accent: "#4A7C9B",
      accentLight: "#B0D4E8",
      background: "#F5F7FA",
      surface: "#FFFFFF",
      text: "#1A1A2E",
      textMuted: "#6A7080",
      success: "#2A8A5A",
      warning: "#C08A30",
      danger: "#B03030",
      info: "#4A7C9B",
    },
    kpiStyle: {
      cards: [
        { bg: "#E0E8F0", text: "#1B2A4A", label: "#4A6080" },
        { bg: "#E8ECF0", text: "#3A4050", label: "#6A7080" },
        { bg: "#D8EAD8", text: "#1A5A30", label: "#3A7A50" },
        { bg: "#F0D8D8", text: "#7A2020", label: "#9A4040" },
      ],
      borderRadius: 6,
      shadow: "sharp",
    },
    typography: {
      titleSize: 40,
      subtitleSize: 18,
      sectionHeaderSize: 16,
      bodySize: 12,
      captionSize: 10,
      titleWeight: 700,
      fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
    },
    layout: {
      cardRadius: 6,
      sectionSpacing: 22,
      headerStyle: "minimal",
      tableStyle: "bordered",
      progressBarStyle: "sharp",
      statusBadgeStyle: "dot",
    },
    chartStyle: {
      colors: ["#1B2A4A", "#4A7C9B", "#2A8A5A", "#C08A30", "#B03030", "#6A7A9A"],
      style: "bold",
    },
    imageStyle: {
      heroGradient: ["#1B2A4A", "#2A3E60"],
      cardShadowColor: "rgba(20, 30, 60, 0.12)",
      accentBarHeight: 3,
      decorativeElements: "none",
    },
    spreadsheetTokens: {
      headerBg: "1B2A4A",
      headerText: "FFFFFF",
      rowAlt: "F0F2F5",
      totalsBg: "1B2A4A",
      totalsText: "FFFFFF",
      borderColor: "C0C8D0",
      kpiCards: [
        { bg: "E0E8F0", text: "1B2A4A" },
        { bg: "E8ECF0", text: "3A4050" },
        { bg: "D8EAD8", text: "1A5A30" },
        { bg: "F0D8D8", text: "7A2020" },
      ],
      sectionBg: "1B2A4A",
      sectionText: "FFFFFF",
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PAYCHECK BUDGET — Practical, clear, modern
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "paycheck-budget": {
    id: "paycheck-budget",
    label: "Paycheck Budget Planner",
    palette: {
      primary: "#0D7377",
      primaryLight: "#4AACB0",
      accent: "#E87A41",
      accentLight: "#F5B890",
      background: "#F7FAFA",
      surface: "#FFFFFF",
      text: "#1A2A2A",
      textMuted: "#5A7070",
      success: "#28A060",
      warning: "#E87A41",
      danger: "#D04040",
      info: "#4A8AB0",
    },
    kpiStyle: {
      cards: [
        { bg: "#D0F0F0", text: "#0A5A5C", label: "#2A7A7C" },
        { bg: "#FCE8D8", text: "#8A4A1A", label: "#A06A3A" },
        { bg: "#D0F0D8", text: "#1A6A30", label: "#3A8A50" },
        { bg: "#E0D8F0", text: "#4A2A7A", label: "#6A4A9A" },
      ],
      borderRadius: 10,
      shadow: "medium",
    },
    typography: {
      titleSize: 42,
      subtitleSize: 20,
      sectionHeaderSize: 17,
      bodySize: 13,
      captionSize: 10,
      titleWeight: 700,
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    },
    layout: {
      cardRadius: 10,
      sectionSpacing: 24,
      headerStyle: "underlined",
      tableStyle: "clean",
      progressBarStyle: "rounded",
      statusBadgeStyle: "pill",
    },
    chartStyle: {
      colors: ["#0D7377", "#E87A41", "#28A060", "#4A8AB0", "#D04040", "#9A7AB0"],
      style: "vibrant",
    },
    imageStyle: {
      heroGradient: ["#0D7377", "#0A5A5C"],
      cardShadowColor: "rgba(10, 80, 80, 0.10)",
      accentBarHeight: 5,
      decorativeElements: "dots",
    },
    spreadsheetTokens: {
      headerBg: "0D7377",
      headerText: "FFFFFF",
      rowAlt: "F0FAFA",
      totalsBg: "0A5A5C",
      totalsText: "FFFFFF",
      borderColor: "B0D4D4",
      kpiCards: [
        { bg: "D0F0F0", text: "0A5A5C" },
        { bg: "FCE8D8", text: "8A4A1A" },
        { bg: "D0F0D8", text: "1A6A30" },
        { bg: "E0D8F0", text: "4A2A7A" },
      ],
      sectionBg: "0D7377",
      sectionText: "FFFFFF",
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ADHD PLANNER — High clarity, bold, lower overwhelm
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "adhd-planner": {
    id: "adhd-planner",
    label: "ADHD Planner",
    palette: {
      primary: "#5B3E8A",
      primaryLight: "#8A6AB8",
      accent: "#F0B429",
      accentLight: "#F8DC80",
      background: "#FAF8FF",
      surface: "#FFFFFF",
      text: "#2A1A40",
      textMuted: "#6A5A80",
      success: "#34A853",
      warning: "#F0B429",
      danger: "#D93025",
      info: "#4285F4",
    },
    kpiStyle: {
      cards: [
        { bg: "#E8D8F8", text: "#4A2A70", label: "#6A4A90" },
        { bg: "#FFF0C8", text: "#6A5010", label: "#8A7030" },
        { bg: "#D0F0D8", text: "#1A6A30", label: "#3A8A50" },
        { bg: "#D0E4F8", text: "#1A4A80", label: "#3A6AA0" },
      ],
      borderRadius: 20,
      shadow: "medium",
    },
    typography: {
      titleSize: 56,
      subtitleSize: 26,
      sectionHeaderSize: 22,
      bodySize: 15,
      captionSize: 12,
      titleWeight: 900,
      fontFamily: "'Nunito', 'Poppins', sans-serif",
    },
    layout: {
      cardRadius: 20,
      sectionSpacing: 36,
      headerStyle: "pill",
      tableStyle: "card-rows",
      progressBarStyle: "segmented",
      statusBadgeStyle: "tag",
    },
    chartStyle: {
      colors: ["#5B3E8A", "#F0B429", "#34A853", "#4285F4", "#D93025", "#FF6D01"],
      style: "vibrant",
    },
    imageStyle: {
      heroGradient: ["#5B3E8A", "#7A58B0"],
      cardShadowColor: "rgba(60, 30, 100, 0.15)",
      accentBarHeight: 8,
      decorativeElements: "circles",
    },
    spreadsheetTokens: {
      headerBg: "5B3E8A",
      headerText: "FFFFFF",
      rowAlt: "F8F5FF",
      totalsBg: "4A2A70",
      totalsText: "FFFFFF",
      borderColor: "C8B8E0",
      kpiCards: [
        { bg: "E8D8F8", text: "4A2A70" },
        { bg: "FFF0C8", text: "6A5010" },
        { bg: "D0F0D8", text: "1A6A30" },
        { bg: "D0E4F8", text: "1A4A80" },
      ],
      sectionBg: "5B3E8A",
      sectionText: "FFFFFF",
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STUDENT BUDGET — Youthful, practical, organized
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "student-budget": {
    id: "student-budget",
    label: "Student Budget Planner",
    palette: {
      primary: "#2D6A4F",
      primaryLight: "#52B788",
      accent: "#4DA8DA",
      accentLight: "#A0D4F0",
      background: "#F5FAF7",
      surface: "#FFFFFF",
      text: "#1A2A20",
      textMuted: "#5A7060",
      success: "#40B080",
      warning: "#E0A030",
      danger: "#D05050",
      info: "#4DA8DA",
    },
    kpiStyle: {
      cards: [
        { bg: "#D0EED8", text: "#1A5030", label: "#3A7050" },
        { bg: "#D0E8F8", text: "#1A5080", label: "#3A70A0" },
        { bg: "#FFF0C8", text: "#6A5010", label: "#8A7030" },
        { bg: "#E8D0F0", text: "#5A2A80", label: "#7A4AA0" },
      ],
      borderRadius: 12,
      shadow: "medium",
    },
    typography: {
      titleSize: 42,
      subtitleSize: 20,
      sectionHeaderSize: 17,
      bodySize: 13,
      captionSize: 10,
      titleWeight: 700,
      fontFamily: "'Poppins', 'Segoe UI', sans-serif",
    },
    layout: {
      cardRadius: 12,
      sectionSpacing: 24,
      headerStyle: "rounded-bar",
      tableStyle: "striped",
      progressBarStyle: "rounded",
      statusBadgeStyle: "dot",
    },
    chartStyle: {
      colors: ["#2D6A4F", "#4DA8DA", "#E0A030", "#D05050", "#7A5AB0", "#52B788"],
      style: "vibrant",
    },
    imageStyle: {
      heroGradient: ["#2D6A4F", "#1A5040"],
      cardShadowColor: "rgba(20, 60, 40, 0.10)",
      accentBarHeight: 5,
      decorativeElements: "dots",
    },
    spreadsheetTokens: {
      headerBg: "2D6A4F",
      headerText: "FFFFFF",
      rowAlt: "F0F8F4",
      totalsBg: "1A5030",
      totalsText: "FFFFFF",
      borderColor: "B0D0C0",
      kpiCards: [
        { bg: "D0EED8", text: "1A5030" },
        { bg: "D0E8F8", text: "1A5080" },
        { bg: "FFF0C8", text: "6A5010" },
        { bg: "E8D0F0", text: "5A2A80" },
      ],
      sectionBg: "2D6A4F",
      sectionText: "FFFFFF",
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // TRAVEL PLANNER — Airy, aspirational, itinerary-focused
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "travel-planner": {
    id: "travel-planner",
    label: "Travel Planner",
    palette: {
      primary: "#1A5276",
      primaryLight: "#3A80A8",
      accent: "#E76F51",
      accentLight: "#F5A890",
      background: "#F5FAFE",
      surface: "#FFFFFF",
      text: "#1A2830",
      textMuted: "#5A7080",
      success: "#2A9D6A",
      warning: "#E0A030",
      danger: "#D04040",
      info: "#3A80A8",
    },
    kpiStyle: {
      cards: [
        { bg: "#D0E4F0", text: "#0A3A5A", label: "#2A5A7A" },
        { bg: "#F5ECD0", text: "#6A5020", label: "#8A7040" },
        { bg: "#FCE0D8", text: "#8A3020", label: "#A05040" },
        { bg: "#D0F0E8", text: "#1A6A50", label: "#3A8A70" },
      ],
      borderRadius: 10,
      shadow: "medium",
    },
    typography: {
      titleSize: 44,
      subtitleSize: 20,
      sectionHeaderSize: 17,
      bodySize: 13,
      captionSize: 10,
      titleWeight: 700,
      fontFamily: "'Josefin Sans', 'Segoe UI', sans-serif",
    },
    layout: {
      cardRadius: 10,
      sectionSpacing: 26,
      headerStyle: "minimal",
      tableStyle: "clean",
      progressBarStyle: "pill",
      statusBadgeStyle: "pill",
    },
    chartStyle: {
      colors: ["#1A5276", "#E76F51", "#2A9D6A", "#E0A030", "#8A6AB0", "#3A80A8"],
      style: "vibrant",
    },
    imageStyle: {
      heroGradient: ["#1A5276", "#0A3A5A"],
      cardShadowColor: "rgba(20, 60, 90, 0.10)",
      accentBarHeight: 5,
      decorativeElements: "stars",
    },
    spreadsheetTokens: {
      headerBg: "1A5276",
      headerText: "FFFFFF",
      rowAlt: "F0F8FC",
      totalsBg: "0A3A5A",
      totalsText: "FFFFFF",
      borderColor: "B0C8D8",
      kpiCards: [
        { bg: "D0E4F0", text: "0A3A5A" },
        { bg: "F5ECD0", text: "6A5020" },
        { bg: "FCE0D8", text: "8A3020" },
        { bg: "D0F0E8", text: "1A6A50" },
      ],
      sectionBg: "1A5276",
      sectionText: "FFFFFF",
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // DEBT PAYOFF — Motivational, progress-focused, bold
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "debt-payoff": {
    id: "debt-payoff",
    label: "Debt Payoff Tracker",
    palette: {
      primary: "#2C3E50",
      primaryLight: "#4A6070",
      accent: "#27AE60",
      accentLight: "#80D8A0",
      background: "#F5F7F8",
      surface: "#FFFFFF",
      text: "#1A2030",
      textMuted: "#5A6A70",
      success: "#27AE60",
      warning: "#E8A830",
      danger: "#C0392B",
      info: "#3498DB",
    },
    kpiStyle: {
      cards: [
        { bg: "#F0D0D0", text: "#8A2020", label: "#A04040" },
        { bg: "#C8F0D0", text: "#1A6A30", label: "#3A8A50" },
        { bg: "#D8E0E8", text: "#2A3A50", label: "#4A5A70" },
        { bg: "#F8E8C0", text: "#6A5010", label: "#8A7030" },
      ],
      borderRadius: 8,
      shadow: "sharp",
    },
    typography: {
      titleSize: 44,
      subtitleSize: 20,
      sectionHeaderSize: 18,
      bodySize: 13,
      captionSize: 10,
      titleWeight: 800,
      fontFamily: "'Montserrat', 'Helvetica Neue', sans-serif",
    },
    layout: {
      cardRadius: 8,
      sectionSpacing: 24,
      headerStyle: "underlined",
      tableStyle: "bordered",
      progressBarStyle: "sharp",
      statusBadgeStyle: "tag",
    },
    chartStyle: {
      colors: ["#2C3E50", "#27AE60", "#C0392B", "#3498DB", "#E8A830", "#8E44AD"],
      style: "bold",
    },
    imageStyle: {
      heroGradient: ["#2C3E50", "#1A2A38"],
      cardShadowColor: "rgba(30, 40, 50, 0.15)",
      accentBarHeight: 4,
      decorativeElements: "lines",
    },
    spreadsheetTokens: {
      headerBg: "2C3E50",
      headerText: "FFFFFF",
      rowAlt: "F0F2F5",
      totalsBg: "1A2A38",
      totalsText: "FFFFFF",
      borderColor: "B0B8C0",
      kpiCards: [
        { bg: "F0D0D0", text: "8A2020" },
        { bg: "C8F0D0", text: "1A6A30" },
        { bg: "D8E0E8", text: "2A3A50" },
        { bg: "F8E8C0", text: "6A5010" },
      ],
      sectionBg: "2C3E50",
      sectionText: "FFFFFF",
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SAVINGS TRACKER — Calm, goal-oriented, encouraging
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "savings-tracker": {
    id: "savings-tracker",
    label: "Savings Goal Tracker",
    palette: {
      primary: "#4A7C59",
      primaryLight: "#7AAA88",
      accent: "#C4952A",
      accentLight: "#E8C870",
      background: "#F8FAF5",
      surface: "#FFFFFF",
      text: "#1A2A1A",
      textMuted: "#5A7058",
      success: "#4A7C59",
      warning: "#C4952A",
      danger: "#B04040",
      info: "#5A8AB0",
    },
    kpiStyle: {
      cards: [
        { bg: "#D0E8D4", text: "#2A5A30", label: "#4A7A50" },
        { bg: "#F8E8C8", text: "#6A5010", label: "#8A7030" },
        { bg: "#FFF8E8", text: "#5A4A20", label: "#7A6A40" },
        { bg: "#D0E0F0", text: "#2A4A70", label: "#4A6A90" },
      ],
      borderRadius: 12,
      shadow: "soft",
    },
    typography: {
      titleSize: 42,
      subtitleSize: 20,
      sectionHeaderSize: 17,
      bodySize: 13,
      captionSize: 10,
      titleWeight: 700,
      fontFamily: "'Nunito', 'Segoe UI', sans-serif",
    },
    layout: {
      cardRadius: 12,
      sectionSpacing: 26,
      headerStyle: "rounded-bar",
      tableStyle: "card-rows",
      progressBarStyle: "rounded",
      statusBadgeStyle: "pill",
    },
    chartStyle: {
      colors: ["#4A7C59", "#C4952A", "#5A8AB0", "#B04040", "#8A6AB0", "#7AAA88"],
      style: "soft",
    },
    imageStyle: {
      heroGradient: ["#4A7C59", "#3A6A48"],
      cardShadowColor: "rgba(40, 70, 50, 0.10)",
      accentBarHeight: 5,
      decorativeElements: "circles",
    },
    spreadsheetTokens: {
      headerBg: "4A7C59",
      headerText: "FFFFFF",
      rowAlt: "F0F8F2",
      totalsBg: "3A6A48",
      totalsText: "FFFFFF",
      borderColor: "B0C8B4",
      kpiCards: [
        { bg: "D0E8D4", text: "2A5A30" },
        { bg: "F8E8C8", text: "6A5010" },
        { bg: "FFF8E8", text: "5A4A20" },
        { bg: "D0E0F0", text: "2A4A70" },
      ],
      sectionBg: "4A7C59",
      sectionText: "FFFFFF",
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SIDE HUSTLE — Energetic, entrepreneurial, growth-focused
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "side-hustle": {
    id: "side-hustle",
    label: "Side Hustle Tracker",
    palette: {
      primary: "#2563EB",
      primaryLight: "#60A0FF",
      accent: "#EC4899",
      accentLight: "#F8A0C8",
      background: "#F5F8FF",
      surface: "#FFFFFF",
      text: "#0A1A30",
      textMuted: "#5060A0",
      success: "#10B981",
      warning: "#F59E0B",
      danger: "#EF4444",
      info: "#2563EB",
    },
    kpiStyle: {
      cards: [
        { bg: "#D0E0FF", text: "#1A3A80", label: "#3A5AA0" },
        { bg: "#FCD8EC", text: "#8A2060", label: "#A04080" },
        { bg: "#C8F8E0", text: "#0A5A30", label: "#2A7A50" },
        { bg: "#FFF0C8", text: "#6A5010", label: "#8A7030" },
      ],
      borderRadius: 14,
      shadow: "medium",
    },
    typography: {
      titleSize: 46,
      subtitleSize: 22,
      sectionHeaderSize: 18,
      bodySize: 13,
      captionSize: 10,
      titleWeight: 800,
      fontFamily: "'Space Grotesk', 'Inter', sans-serif",
    },
    layout: {
      cardRadius: 14,
      sectionSpacing: 26,
      headerStyle: "full-width",
      tableStyle: "clean",
      progressBarStyle: "pill",
      statusBadgeStyle: "pill",
    },
    chartStyle: {
      colors: ["#2563EB", "#EC4899", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444"],
      style: "vibrant",
    },
    imageStyle: {
      heroGradient: ["#2563EB", "#1A4AD0"],
      cardShadowColor: "rgba(30, 50, 200, 0.12)",
      accentBarHeight: 6,
      decorativeElements: "dots",
    },
    spreadsheetTokens: {
      headerBg: "2563EB",
      headerText: "FFFFFF",
      rowAlt: "F0F5FF",
      totalsBg: "1A4AD0",
      totalsText: "FFFFFF",
      borderColor: "B0C0E8",
      kpiCards: [
        { bg: "D0E0FF", text: "1A3A80" },
        { bg: "FCD8EC", text: "8A2060" },
        { bg: "C8F8E0", text: "0A5A30" },
        { bg: "FFF0C8", text: "6A5010" },
      ],
      sectionBg: "2563EB",
      sectionText: "FFFFFF",
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MEAL PLANNER — Fresh, kitchen-friendly, warm
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  "meal-planner": {
    id: "meal-planner",
    label: "Meal Planner",
    palette: {
      primary: "#C24826",
      primaryLight: "#E07050",
      accent: "#6B8F52",
      accentLight: "#A0C488",
      background: "#FFFAF5",
      surface: "#FFFFFF",
      text: "#2A1A10",
      textMuted: "#7A6050",
      success: "#6B8F52",
      warning: "#D4A030",
      danger: "#C24826",
      info: "#5A8AB0",
    },
    kpiStyle: {
      cards: [
        { bg: "#F8D8CC", text: "#7A2810", label: "#9A4830" },
        { bg: "#D8ECC8", text: "#2A5A18", label: "#4A7A38" },
        { bg: "#FFF0D8", text: "#5A4A10", label: "#7A6A30" },
        { bg: "#E0DCD8", text: "#3A3430", label: "#5A5450" },
      ],
      borderRadius: 12,
      shadow: "medium",
    },
    typography: {
      titleSize: 44,
      subtitleSize: 20,
      sectionHeaderSize: 17,
      bodySize: 13,
      captionSize: 10,
      titleWeight: 700,
      fontFamily: "'Nunito', 'Trebuchet MS', sans-serif",
    },
    layout: {
      cardRadius: 12,
      sectionSpacing: 24,
      headerStyle: "rounded-bar",
      tableStyle: "striped",
      progressBarStyle: "rounded",
      statusBadgeStyle: "pill",
    },
    chartStyle: {
      colors: ["#C24826", "#6B8F52", "#D4A030", "#5A8AB0", "#8A5A80", "#E07050"],
      style: "bold",
    },
    imageStyle: {
      heroGradient: ["#C24826", "#9A3818"],
      cardShadowColor: "rgba(120, 50, 20, 0.12)",
      accentBarHeight: 5,
      decorativeElements: "dots",
    },
    spreadsheetTokens: {
      headerBg: "C24826",
      headerText: "FFFFFF",
      rowAlt: "FFF5F0",
      totalsBg: "9A3818",
      totalsText: "FFFFFF",
      borderColor: "D8C0B0",
      kpiCards: [
        { bg: "F8D8CC", text: "7A2810" },
        { bg: "D8ECC8", text: "2A5A18" },
        { bg: "FFF0D8", text: "5A4A10" },
        { bg: "E0DCD8", text: "3A3430" },
      ],
      sectionBg: "C24826",
      sectionText: "FFFFFF",
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GENERIC — Professional, versatile neutral
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  generic: {
    id: "generic",
    label: "Professional Planner",
    palette: {
      primary: "#1B3A5C",
      primaryLight: "#3A6080",
      accent: "#D4AF37",
      accentLight: "#F0D870",
      background: "#F5F7FA",
      surface: "#FFFFFF",
      text: "#1A1A2E",
      textMuted: "#6A7080",
      success: "#2A8A5A",
      warning: "#D4AF37",
      danger: "#B03030",
      info: "#4A7C9B",
    },
    kpiStyle: {
      cards: [
        { bg: "#D8E4F0", text: "#1A3050", label: "#3A5070" },
        { bg: "#F0E8D0", text: "#5A4A18", label: "#7A6A38" },
        { bg: "#D0E8D0", text: "#1A5A20", label: "#3A7A40" },
        { bg: "#E8E0E8", text: "#4A3050", label: "#6A5070" },
      ],
      borderRadius: 10,
      shadow: "medium",
    },
    typography: {
      titleSize: 42,
      subtitleSize: 20,
      sectionHeaderSize: 17,
      bodySize: 13,
      captionSize: 10,
      titleWeight: 700,
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
    },
    layout: {
      cardRadius: 10,
      sectionSpacing: 24,
      headerStyle: "full-width",
      tableStyle: "striped",
      progressBarStyle: "rounded",
      statusBadgeStyle: "pill",
    },
    chartStyle: {
      colors: ["#1B3A5C", "#D4AF37", "#2A8A5A", "#B03030", "#4A7C9B", "#8A6AB0"],
      style: "muted",
    },
    imageStyle: {
      heroGradient: ["#1B3A5C", "#0A2A48"],
      cardShadowColor: "rgba(20, 40, 60, 0.12)",
      accentBarHeight: 5,
      decorativeElements: "none",
    },
    spreadsheetTokens: {
      headerBg: "1B3A5C",
      headerText: "FFFFFF",
      rowAlt: "F0F2F5",
      totalsBg: "0A2A48",
      totalsText: "FFFFFF",
      borderColor: "B0B8C8",
      kpiCards: [
        { bg: "D8E4F0", text: "1A3050" },
        { bg: "F0E8D0", text: "5A4A18" },
        { bg: "D0E8D0", text: "1A5A20" },
        { bg: "E8E0E8", text: "4A3050" },
      ],
      sectionBg: "1B3A5C",
      sectionText: "FFFFFF",
    },
  },
};

// ─── Niche keyword map ───────────────────────────────────────────────────────

const NICHE_KEYWORDS: Array<{ keywords: string[]; profileId: string }> = [
  { keywords: ["baby"], profileId: "baby-budget" },
  { keywords: ["pregnan"], profileId: "pregnancy-planner" },
  { keywords: ["wedding"], profileId: "wedding-planner" },
  { keywords: ["business", "p&l", "profit"], profileId: "business-pl" },
  { keywords: ["paycheck"], profileId: "paycheck-budget" },
  { keywords: ["adhd"], profileId: "adhd-planner" },
  { keywords: ["student"], profileId: "student-budget" },
  { keywords: ["travel"], profileId: "travel-planner" },
  { keywords: ["debt"], profileId: "debt-payoff" },
  { keywords: ["saving"], profileId: "savings-tracker" },
  { keywords: ["side hustle", "hustle"], profileId: "side-hustle" },
  { keywords: ["meal", "food", "recipe"], profileId: "meal-planner" },
  { keywords: ["budget_tracker", "budget tracker"], profileId: "paycheck-budget" },
];

// ─── Resolver ────────────────────────────────────────────────────────────────

/**
 * Resolves a niche string to its design profile using fuzzy keyword matching.
 *
 * @param niche - Freeform niche string (e.g. "Baby Monthly Budget", "ADHD Weekly Planner")
 * @param colorScheme - Optional color overrides to layer on top of the resolved profile
 * @returns A complete NicheDesignProfile
 */
export function resolveNicheProfile(
  niche: string,
  colorScheme?: { primary: string; accent: string; background?: string }
): NicheDesignProfile {
  const lower = niche.toLowerCase();

  // Find matching profile by keyword
  let matchedId = "generic";
  for (const entry of NICHE_KEYWORDS) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      matchedId = entry.profileId;
      break;
    }
  }

  // Deep-clone the profile so mutations don't affect the original
  const profile: NicheDesignProfile = JSON.parse(
    JSON.stringify(NICHE_PROFILES[matchedId])
  );

  // Overlay custom colors if provided
  if (colorScheme) {
    profile.palette.primary = colorScheme.primary;
    profile.palette.accent = colorScheme.accent;
    if (colorScheme.background) {
      profile.palette.background = colorScheme.background;
    }

    // Also update key downstream tokens that depend on primary/accent
    const primaryHex = colorScheme.primary.replace("#", "");
    const accentHex = colorScheme.accent.replace("#", "");

    profile.spreadsheetTokens.headerBg = primaryHex;
    profile.spreadsheetTokens.sectionBg = primaryHex;
    profile.spreadsheetTokens.totalsBg = primaryHex;

    profile.imageStyle.heroGradient = [
      colorScheme.primary,
      colorScheme.primary,
    ];

    // Update chart colors — keep structure but swap first two
    if (profile.chartStyle.colors.length >= 2) {
      profile.chartStyle.colors[0] = colorScheme.primary;
      profile.chartStyle.colors[1] = colorScheme.accent;
    }
  }

  return profile;
}
