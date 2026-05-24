// ══════════════════════════════════════════════════════════════
// Factory Google Sheets Builder — Premium Dark Theme
//
// Creates REAL premium Google Sheets products via googleapis.
// This is the builder that produces Etsy-sellable dark-themed
// spreadsheets with KPI cards, sparklines, hidden gridlines,
// elevated card backgrounds, and professional composition.
//
// NOT the old light/pastel design system. This is the premium
// builder ported from the working scripts (build-pyf-tracker.mjs
// + design-pass-premium.mjs) and generalized for ANY blueprint.
//
// Pipeline:
//   1. Create spreadsheet with all tabs
//   2. Populate all values + formulas
//   3. Apply premium dark-theme formatting
//   4. Add charts with dark backgrounds
//   5. Add conditional formatting + data validation
//   6. Add wow elements (sparklines, insight cards)
// ══════════════════════════════════════════════════════════════

import type { ProductBlueprint, BlueprintTab, BlueprintChart } from "@/types/factory";
import { getGoogleApis, isGoogleAuthConfigured } from "@/lib/google-auth";
import { getLayoutFamilyId, getSpreadsheetDashboardConfig, type LayoutFamilyId, type SpreadsheetDashboardConfig } from "@/lib/factory-layout-families";
import type { sheets_v4 } from "googleapis";

// ── Color Helpers ───────────────────────────────────────────

function hex(h: string) {
  const c = h.startsWith("#") ? h.slice(1) : h;
  return {
    red: parseInt(c.slice(0, 2), 16) / 255,
    green: parseInt(c.slice(2, 4), 16) / 255,
    blue: parseInt(c.slice(4, 6), 16) / 255,
  };
}

// ── Premium Color Palette ───────────────────────────────────
// Derived from blueprint.colorScheme with dark-theme defaults.

interface PremiumPalette {
  navy: sheets_v4.Schema$Color;
  darkBg: sheets_v4.Schema$Color;
  cardBg: sheets_v4.Schema$Color;
  cardBg2: sheets_v4.Schema$Color;
  altRow: sheets_v4.Schema$Color;
  elevCard: sheets_v4.Schema$Color;
  gold: sheets_v4.Schema$Color;
  accent: sheets_v4.Schema$Color;
  green: sheets_v4.Schema$Color;
  greenSoft: sheets_v4.Schema$Color;
  red: sheets_v4.Schema$Color;
  redSoft: sheets_v4.Schema$Color;
  warning: sheets_v4.Schema$Color;
  blue: sheets_v4.Schema$Color;
  purple: sheets_v4.Schema$Color;
  white: sheets_v4.Schema$Color;
  muted: sheets_v4.Schema$Color;
  mutedDim: sheets_v4.Schema$Color;
  headerBg: sheets_v4.Schema$Color;
  totalsBg: sheets_v4.Schema$Color;
  pure: sheets_v4.Schema$Color;
  lightGray: sheets_v4.Schema$Color;
  divider: sheets_v4.Schema$Color;
  kpiBorder: sheets_v4.Schema$Color;
  // Category accent colors — rotate per section like Etsy bestsellers
  catAccents: sheets_v4.Schema$Color[];
  catAccentsSoft: sheets_v4.Schema$Color[];  // Muted tint for data row left borders
  // Hex strings for sparklines / string-based references
  greenHex: string;
  blueHex: string;
  warningHex: string;
  purpleHex: string;
  altRowHex: string;
  catAccentHexes: string[];
}

// ── Niche Detection ─────────────────────────────────────────
// Scans blueprint title, tab names, keywords to identify the niche
// so colors/accents match the product's identity.

type NicheTheme =
  | "baby"
  | "wedding"
  | "fitness"
  | "travel"
  | "business"
  | "debt"
  | "savings"
  | "meal"
  | "student"
  | "budget"   // generic budget
  | "default";

function detectNiche(blueprint: ProductBlueprint): NicheTheme {
  const text = [
    blueprint.sourceListingTitle || "",
    ...(blueprint.tabs?.map(t => t.name) || []),
  ].join(" ").toLowerCase();

  if (text.includes("baby") || text.includes("newborn") || text.includes("nursery") || text.includes("maternity"))
    return "baby";
  if (text.includes("wedding") || text.includes("bridal") || text.includes("bride") || text.includes("groom"))
    return "wedding";
  if (text.includes("fitness") || text.includes("workout") || text.includes("gym") || text.includes("exercise"))
    return "fitness";
  if (text.includes("travel") || text.includes("vacation") || text.includes("trip") || text.includes("itinerary"))
    return "travel";
  if (text.includes("business") || text.includes("p&l") || text.includes("profit") || text.includes("revenue") || text.includes("invoice"))
    return "business";
  if (text.includes("debt") || text.includes("loan") || text.includes("payoff") || text.includes("mortgage"))
    return "debt";
  if (text.includes("saving") || text.includes("emergency fund") || text.includes("investment"))
    return "savings";
  if (text.includes("meal") || text.includes("recipe") || text.includes("grocery") || text.includes("food"))
    return "meal";
  if (text.includes("student") || text.includes("college") || text.includes("university") || text.includes("school"))
    return "student";
  if (text.includes("budget") || text.includes("paycheck") || text.includes("expense"))
    return "budget";
  return "default";
}

// Map NicheTheme → nicheProfileId for layout family lookups
function nicheToProfileId(niche: NicheTheme): string {
  const map: Record<NicheTheme, string> = {
    baby: "baby-budget",
    wedding: "wedding-planner",
    fitness: "savings-tracker",
    travel: "travel-planner",
    business: "business-pl",
    debt: "debt-payoff",
    savings: "savings-tracker",
    meal: "meal-planner",
    student: "student-budget",
    budget: "paycheck-budget",
    default: "paycheck-budget",
  };
  return map[niche];
}

// Niche-specific accent color sets — vivid + soft (dark-tint) pairs
// Each niche gets colors that FEEL like that niche
interface NicheColors {
  accents: string[];     // Vivid colors for headers/text
  accentsSoft: string[]; // Dark tints for backgrounds
  gold: string;          // Section header highlight
  sparkline: string;     // Sparkline bar color
}

function nicheColors(niche: NicheTheme): NicheColors {
  switch (niche) {
    case "baby":
      return {
        // Soft pastels: lavender, baby pink, mint, peach, sky blue
        accents:     ["#C4B5FD", "#F9A8D4", "#6EE7B7", "#FDBA74", "#93C5FD", "#A5F3FC"],
        accentsSoft: ["#2E1F5E", "#4C1D3A", "#1A3F2E", "#3D2512", "#1E3A5F", "#164E63"],
        gold: "#C4B5FD",     // Lavender as the "gold" accent
        sparkline: "#C4B5FD",
      };
    case "wedding":
      return {
        // Romantic: blush pink, champagne gold, rose, sage green, ivory warm
        accents:     ["#F9A8D4", "#D4AF37", "#FB7185", "#86EFAC", "#FDE68A", "#E9D5FF"],
        accentsSoft: ["#4C1D3A", "#3D3012", "#5C1A2A", "#1A3F2E", "#3D3512", "#2E1F5E"],
        gold: "#D4AF37",     // Real champagne gold
        sparkline: "#F9A8D4",
      };
    case "fitness":
      return {
        // Energetic: neon green, electric blue, hot orange, red, cyan
        accents:     ["#4ADE80", "#3B82F6", "#FB923C", "#EF4444", "#22D3EE", "#A78BFA"],
        accentsSoft: ["#14532D", "#1E3A5F", "#4A2612", "#7F1D1D", "#164E63", "#3B1F6E"],
        gold: "#4ADE80",     // Neon green
        sparkline: "#4ADE80",
      };
    case "travel":
      return {
        // Adventurous: sunset orange, ocean blue, sandy gold, sky, palm green
        accents:     ["#FB923C", "#38BDF8", "#FBBF24", "#60A5FA", "#34D399", "#F472B6"],
        accentsSoft: ["#4A2612", "#0C4A6E", "#3D3012", "#1E3A5F", "#134E4A", "#4C1D3A"],
        gold: "#FBBF24",     // Warm gold
        sparkline: "#38BDF8",
      };
    case "business":
      return {
        // Professional: steel blue, slate, emerald, amber, navy
        accents:     ["#3B82F6", "#64748B", "#10B981", "#F59E0B", "#6366F1", "#94A3B8"],
        accentsSoft: ["#1E3A5F", "#1E293B", "#134E4A", "#3D3012", "#312E81", "#1E293B"],
        gold: "#F59E0B",     // Amber
        sparkline: "#3B82F6",
      };
    case "debt":
      return {
        // Motivational: red→green gradient feel, coral, teal, gold
        accents:     ["#EF4444", "#F97316", "#FBBF24", "#22C55E", "#14B8A6", "#3B82F6"],
        accentsSoft: ["#7F1D1D", "#4A2612", "#3D3012", "#166534", "#134E4A", "#1E3A5F"],
        gold: "#22C55E",     // Green = debt freedom
        sparkline: "#22C55E",
      };
    case "savings":
      return {
        // Growth: emerald, sky blue, gold, purple, teal
        accents:     ["#22C55E", "#60A5FA", "#FBBF24", "#A78BFA", "#14B8A6", "#F472B6"],
        accentsSoft: ["#166534", "#1E3A5F", "#3D3012", "#3B1F6E", "#134E4A", "#4C1D3A"],
        gold: "#FBBF24",
        sparkline: "#22C55E",
      };
    case "meal":
      return {
        // Fresh/organic: warm green, tomato red, wheat gold, herb, citrus
        accents:     ["#4ADE80", "#EF4444", "#FBBF24", "#A3E635", "#FB923C", "#34D399"],
        accentsSoft: ["#14532D", "#7F1D1D", "#3D3012", "#1A3F0A", "#4A2612", "#134E4A"],
        gold: "#4ADE80",     // Fresh green
        sparkline: "#4ADE80",
      };
    case "student":
      return {
        // Academic: university blue, notebook yellow, highlighter, pencil gray
        accents:     ["#6366F1", "#FBBF24", "#A78BFA", "#38BDF8", "#F472B6", "#4ADE80"],
        accentsSoft: ["#312E81", "#3D3012", "#3B1F6E", "#0C4A6E", "#4C1D3A", "#14532D"],
        gold: "#FBBF24",     // Highlighter yellow
        sparkline: "#6366F1",
      };
    case "budget":
      return {
        // Clean finance: blue, teal, coral, green, amber
        accents:     ["#3B82F6", "#14B8A6", "#EC4899", "#22C55E", "#F59E0B", "#8B5CF6"],
        accentsSoft: ["#1E3A5F", "#134E4A", "#4C1D3A", "#166534", "#3D3012", "#3B1F6E"],
        gold: "#F59E0B",
        sparkline: "#22C55E",
      };
    default:
      return {
        accents:     ["#3B82F6", "#14B8A6", "#EC4899", "#F97316", "#8B5CF6", "#06B6D4"],
        accentsSoft: ["#1E3A5F", "#134E4A", "#4C1D3A", "#4A2612", "#3B1F6E", "#164E63"],
        gold: "#D4AF37",
        sparkline: "#22C55E",
      };
  }
}

function buildPalette(blueprint: ProductBlueprint): PremiumPalette {
  const cs = blueprint.colorScheme;
  const niche = detectNiche(blueprint);
  const nc = nicheColors(niche);

  console.log(`[GoogleSheetsBuilder] Detected niche: "${niche}" → applying themed colors`);

  return {
    navy:      hex("#1B3A5C"),
    darkBg:    hex("#0F172A"),
    cardBg:    hex("#162033"),
    cardBg2:   hex("#1A2740"),
    altRow:    hex("#1E293B"),
    elevCard:  hex("#1E2D45"),
    gold:      hex(nc.gold),
    accent:    hex(cs?.secondary || nc.accents[2]),
    green:     hex(cs?.success || "#22C55E"),
    greenSoft: hex("#166534"),
    red:       hex(cs?.danger || "#EF4444"),
    redSoft:   hex("#7F1D1D"),
    warning:   hex("#F59E0B"),
    blue:      hex("#60A5FA"),
    purple:    hex("#A78BFA"),
    white:     hex("#F8FAFC"),
    muted:     hex("#94A3B8"),
    mutedDim:  hex("#64748B"),
    headerBg:  hex("#16203D"),
    totalsBg:  hex("#1E2A3E"),
    pure:      hex("#FFFFFF"),
    lightGray: hex("#F1F5F9"),
    divider:   hex("#2D3A52"),
    kpiBorder: hex("#2A3F5F"),
    // Niche-themed category accent colors
    catAccents: nc.accents.map(h => hex(h)),
    catAccentsSoft: nc.accentsSoft.map(h => hex(h)),
    greenHex:  cs?.success || "#22C55E",
    blueHex:   "#60A5FA",
    warningHex: "#F59E0B",
    purpleHex: "#A78BFA",
    altRowHex: "#1E293B",
    catAccentHexes: nc.accents,
  };
}

// ── Request Builder Helpers (same patterns as premium scripts) ──

function rc(
  sheetId: number,
  r0: number, r1: number,
  c0: number, c1: number,
  fmt: sheets_v4.Schema$CellFormat
): sheets_v4.Schema$Request {
  const fields = "userEnteredFormat(" + Object.keys(fmt).join(",") + ")";
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 },
      cell: { userEnteredFormat: fmt },
      fields,
    },
  };
}

function mergeCells(sheetId: number, r0: number, r1: number, c0: number, c1: number): sheets_v4.Schema$Request {
  return {
    mergeCells: {
      range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 },
      mergeType: "MERGE_ALL",
    },
  };
}

function colW(sheetId: number, c0: number, c1: number, px: number): sheets_v4.Schema$Request {
  return {
    updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex: c0, endIndex: c1 },
      properties: { pixelSize: px },
      fields: "pixelSize",
    },
  };
}

function rowH(sheetId: number, r0: number, r1: number, px: number): sheets_v4.Schema$Request {
  return {
    updateDimensionProperties: {
      range: { sheetId, dimension: "ROWS", startIndex: r0, endIndex: r1 },
      properties: { pixelSize: px },
      fields: "pixelSize",
    },
  };
}

function borderStyle(color: sheets_v4.Schema$Color, style = "SOLID") {
  return { style, colorStyle: { rgbColor: color } };
}

const noBorder = { style: "NONE" as const };

// ══════════════════════════════════════════════════════════════
// TAB CLASSIFICATION — Determine how to format each tab
// ══════════════════════════════════════════════════════════════

type TabRole = "dashboard" | "data" | "setup" | "reference" | "summary";

function classifyTab(tab: BlueprintTab): TabRole {
  const n = tab.name.toLowerCase();
  if (n === "dashboard" || n.includes("dashboard")) return "dashboard";
  if (n === "reference" || n.includes("reference")) return "reference";
  if (n.includes("setup") || n.includes("instruction") || n.includes("guide") || n.includes("how to"))
    return "setup";
  if (n.includes("summary") || n.includes("overview") || n.includes("monthly"))
    return "summary";
  return "data";
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD FORMATTING — Premium dark-theme KPI dashboard
//
// Scans actual sampleRows to detect KPIs, section headers,
// column headers, data rows, totals, and spacers.
// Formats cells WHERE THE DATA ALREADY IS — doesn't reposition.
// ══════════════════════════════════════════════════════════════

function isSectionLike(val: string): boolean {
  const v = val.trim();
  // Match any emoji-prefixed section header OR ALL-CAPS text headers
  const SECTION_EMOJIS = [
    "📊", "🎯", "💳", "📂", "💡", "📋", "💰", "🏦",
    // Niche-specific section emojis
    "🍽️", "🛒", "💒", "👥", "💍", "📅", "📚", "🎓", "📱",
    "✈️", "🗺️", "💵", "🏆", "💬",
  ];
  return SECTION_EMOJIS.some(e => v.includes(e)) ||
    (v === v.toUpperCase() && v.length > 5 && /[A-Z]{3,}/.test(v) &&
     !v.startsWith("=") && !v.startsWith("$"));
}

function formatDashboard(
  sheetId: number,
  tab: BlueprintTab,
  C: PremiumPalette,
  familyId: LayoutFamilyId = "nurture"
): sheets_v4.Schema$Request[] {
  const reqs: sheets_v4.Schema$Request[] = [];
  const totalCols = Math.max(tab.columns.length, familyId === "executive" ? 14 : 12);
  const totalRows = Math.max(tab.sampleRows.length + 30, 60);
  const numRows = tab.sampleRows.length;

  // Family-specific sizing
  const sizing = {
    nurture:   { titleH: 64, titleSize: 18, kpiLabelH: 28, kpiValueH: 88, kpiValueSize: 32, sectionH: 38, sectionSize: 11, colHeaderH: 28, dataRowH: 30, colW: 150 },
    executive: { titleH: 48, titleSize: 14, kpiLabelH: 24, kpiValueH: 64, kpiValueSize: 24, sectionH: 32, sectionSize: 10, colHeaderH: 24, dataRowH: 26, colW: 130 },
    editorial: { titleH: 72, titleSize: 20, kpiLabelH: 32, kpiValueH: 96, kpiValueSize: 36, sectionH: 42, sectionSize: 12, colHeaderH: 30, dataRowH: 32, colW: 160 },
  }[familyId];

  // Hide gridlines
  reqs.push({
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { hideGridlines: true } },
      fields: "gridProperties.hideGridlines",
    },
  });

  // Dark background for entire sheet
  reqs.push(rc(sheetId, 0, totalRows, 0, totalCols, {
    backgroundColor: C.darkBg,
    textFormat: { foregroundColorStyle: { rgbColor: C.white }, fontSize: 10, fontFamily: "Inter" },
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
  }));

  // Column widths — family-specific
  for (let c = 0; c < Math.min(totalCols, familyId === "executive" ? 14 : 12); c++) {
    reqs.push(colW(sheetId, c, c + 1, sizing.colW));
  }

  // ── PHASE 1: Find the KPI rows (always in first 7 rows) ──
  let kpiLabelRowIdx = -1;
  let kpiValueRowIdx = -1;

  for (let r = 0; r < Math.min(numRows, 7); r++) {
    const rowData = tab.sampleRows[r];
    if (!rowData) continue;
    const cells = rowData.map(c => String(c ?? "").trim().toUpperCase());
    const kpiTerms = cells.filter(c =>
      c.includes("TOTAL INCOME") || c.includes("TOTAL SPENT") ||
      c.includes("NET SAVINGS") || c.includes("SAVINGS RATE") ||
      c.includes("TOTAL EXPENSE") || c.includes("NET INCOME") ||
      c.includes("MONTHLY INCOME") || c.includes("BALANCE") ||
      c.includes("TOTAL REVENUE") || c.includes("NET PROFIT") ||
      c.includes("PROFIT MARGIN") || c.includes("TOTAL BUDGET") ||
      c.includes("REMAINING") || c.includes("FOOD BUDGET") ||
      c.includes("DEBT PAYMENT") || c.includes("TOTAL DEBT") ||
      c.includes("TAKE-HOME PAY") || c.includes("TRIP BUDGET") ||
      c.includes("TOTAL COSTS") || c.includes("NET EARNINGS") ||
      c.includes("BABY COSTS") || c.includes("TOTAL SAVED")
    );
    if (kpiTerms.length >= 2) {
      kpiLabelRowIdx = r;
      kpiValueRowIdx = r + 1;
      break;
    }
  }

  // ── PHASE 2: Format each row based on its role + family ──
  let foundTitle = false;
  let pastKpiSection = false;
  let sectionIdx = 0;

  for (let r = 0; r < numRows; r++) {
    const rowData = tab.sampleRows[r];
    if (!rowData) continue;

    const firstCell = String(rowData[0] || "").trim();
    const allCells = rowData.map(c => String(c ?? "").trim());
    const nonEmpty = allCells.filter(c => c.length > 0);
    const isEmptyRow = nonEmpty.length === 0;
    const hasSectionMarker = allCells.some(c => isSectionLike(c));
    const isTotalRow = allCells.some(c => c.toUpperCase().includes("TOTAL"));
    const hasMultipleTextCells = allCells.filter(c =>
      c.length > 0 && !/^\d/.test(c) && !c.startsWith("=") && !c.startsWith("$")
    ).length >= 3;

    const secColor = C.catAccents[sectionIdx % C.catAccents.length];
    const secSoft = C.catAccentsSoft[sectionIdx % C.catAccentsSoft.length];

    if (r === kpiLabelRowIdx) {
      // ── KPI LABELS — family-specific layout ──
      reqs.push(rowH(sheetId, r, r + 1, sizing.kpiLabelH));
      reqs.push(rc(sheetId, r, r + 1, 0, totalCols, {
        backgroundColor: C.darkBg,
        textFormat: { foregroundColorStyle: { rgbColor: C.mutedDim }, bold: true, fontSize: familyId === "editorial" ? 9 : 8, fontFamily: "Inter" },
        horizontalAlignment: "CENTER",
        verticalAlignment: "BOTTOM",
      }));

      let ki = 0;
      for (let c = 0; c < rowData.length; c++) {
        const cellVal = String(rowData[c] ?? "").trim();
        if (cellVal.length > 3) {
          const kColor = C.catAccents[ki % C.catAccents.length];
          const kSoft = C.catAccentsSoft[ki % C.catAccentsSoft.length];

          if (familyId === "editorial") {
            // Editorial: elegant underlined labels, no box border — clean serif-inspired look
            reqs.push(rc(sheetId, r, r + 1, c, c + 1, {
              backgroundColor: C.darkBg,
              textFormat: { foregroundColorStyle: { rgbColor: kColor }, bold: true, italic: true, fontSize: 10, fontFamily: "Inter" },
              horizontalAlignment: "CENTER",
              verticalAlignment: "BOTTOM",
              borders: { bottom: borderStyle(kColor) },
            }));
          } else if (familyId === "executive") {
            // Executive: compact horizontal strip, thin top line accent
            reqs.push(rc(sheetId, r, r + 1, c, c + 1, {
              backgroundColor: kSoft,
              textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 8, fontFamily: "Inter" },
              horizontalAlignment: "CENTER",
              verticalAlignment: "BOTTOM",
              borders: {
                top: borderStyle(kColor, "SOLID"),
                left: borderStyle(kColor),
                right: borderStyle(kColor),
              },
            }));
          } else {
            // Nurture: warm boxed cards with thick top border
            reqs.push(rc(sheetId, r, r + 1, c, c + 1, {
              backgroundColor: kSoft,
              textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 9, fontFamily: "Inter" },
              horizontalAlignment: "CENTER",
              verticalAlignment: "BOTTOM",
              borders: {
                top: borderStyle(kColor, "SOLID_MEDIUM"),
                left: borderStyle(kColor),
                right: borderStyle(kColor),
              },
            }));
          }
          ki++;
        }
      }
    } else if (r === kpiValueRowIdx && kpiLabelRowIdx >= 0) {
      // ── KPI VALUES — family-specific size and style ──
      reqs.push(rowH(sheetId, r, r + 1, sizing.kpiValueH));
      reqs.push(rc(sheetId, r, r + 1, 0, totalCols, {
        backgroundColor: C.darkBg,
        textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: sizing.kpiValueSize, fontFamily: "Inter" },
        horizontalAlignment: "CENTER",
        verticalAlignment: "MIDDLE",
      }));
      const labelRow = tab.sampleRows[kpiLabelRowIdx];
      let ki = 0;
      for (let c = 0; c < rowData.length; c++) {
        const val = rowData[c];
        const label = String(labelRow?.[c] ?? "").trim().toUpperCase();
        if (val !== null && val !== "" && String(val).trim().length > 0) {
          const kColor = C.catAccents[ki % C.catAccents.length];
          const kSoft = C.catAccentsSoft[ki % C.catAccentsSoft.length];
          const isPercent = label.includes("RATE") || label.includes("PERCENT") ||
            label.includes("%") || String(val).includes("%");

          if (familyId === "editorial") {
            // Editorial: clean centered values, no box — just bottom accent line
            reqs.push(rc(sheetId, r, r + 1, c, c + 1, {
              backgroundColor: C.darkBg,
              textFormat: { foregroundColorStyle: { rgbColor: kColor }, bold: true, fontSize: sizing.kpiValueSize, fontFamily: "Inter" },
              horizontalAlignment: "CENTER",
              verticalAlignment: "MIDDLE",
              numberFormat: isPercent
                ? { type: "PERCENT", pattern: "0%" }
                : { type: "CURRENCY", pattern: '"$"#,##0' },
              borders: {
                bottom: borderStyle(kColor, "SOLID_MEDIUM"),
              },
            }));
          } else if (familyId === "executive") {
            // Executive: compact dense cards, thinner border, smaller font
            reqs.push(rc(sheetId, r, r + 1, c, c + 1, {
              backgroundColor: kSoft,
              textFormat: { foregroundColorStyle: { rgbColor: kColor }, bold: true, fontSize: sizing.kpiValueSize, fontFamily: "Inter" },
              horizontalAlignment: "CENTER",
              verticalAlignment: "MIDDLE",
              numberFormat: isPercent
                ? { type: "PERCENT", pattern: "0%" }
                : { type: "CURRENCY", pattern: '"$"#,##0' },
              borders: {
                bottom: borderStyle(kColor, "SOLID"),
                left: borderStyle(kColor),
                right: borderStyle(kColor),
              },
            }));
          } else {
            // Nurture: warm large cards with solid box borders
            reqs.push(rc(sheetId, r, r + 1, c, c + 1, {
              backgroundColor: kSoft,
              textFormat: { foregroundColorStyle: { rgbColor: kColor }, bold: true, fontSize: sizing.kpiValueSize, fontFamily: "Inter" },
              horizontalAlignment: "CENTER",
              verticalAlignment: "MIDDLE",
              numberFormat: isPercent
                ? { type: "PERCENT", pattern: "0%" }
                : { type: "CURRENCY", pattern: '"$"#,##0' },
              borders: {
                bottom: borderStyle(kColor, "SOLID_MEDIUM"),
                left: borderStyle(kColor),
                right: borderStyle(kColor),
              },
            }));
          }
          ki++;
        }
      }
      pastKpiSection = true;
    } else if (isEmptyRow) {
      // Spacer row — taller for editorial, shorter for executive
      reqs.push(rowH(sheetId, r, r + 1, familyId === "editorial" ? 16 : familyId === "executive" ? 8 : 12));
    } else if (!foundTitle && nonEmpty.length <= 2 && firstCell.length > 10 && !firstCell.startsWith("=")) {
      // Title row — family-specific banner style
      foundTitle = true;
      reqs.push(rowH(sheetId, r, r + 1, sizing.titleH));
      reqs.push(mergeCells(sheetId, r, r + 1, 0, totalCols));
      if (familyId === "editorial") {
        // Editorial: elegant centered title with accent underline, no box
        reqs.push(rc(sheetId, r, r + 1, 0, totalCols, {
          backgroundColor: C.darkBg,
          textFormat: { foregroundColorStyle: { rgbColor: C.gold }, bold: true, italic: true, fontSize: sizing.titleSize, fontFamily: "Inter" },
          horizontalAlignment: "CENTER",
          verticalAlignment: "MIDDLE",
          borders: { bottom: borderStyle(C.gold, "SOLID_MEDIUM") },
        }));
      } else if (familyId === "executive") {
        // Executive: compact dark navy strip
        reqs.push(rc(sheetId, r, r + 1, 0, totalCols, {
          backgroundColor: C.navy,
          textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: sizing.titleSize, fontFamily: "Inter" },
          horizontalAlignment: "LEFT",
          verticalAlignment: "MIDDLE",
          padding: { left: 12 },
        }));
      } else {
        // Nurture: full-width centered navy banner
        reqs.push(rc(sheetId, r, r + 1, 0, totalCols, {
          backgroundColor: C.navy,
          textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: sizing.titleSize, fontFamily: "Inter" },
          horizontalAlignment: "CENTER",
          verticalAlignment: "MIDDLE",
        }));
      }
    } else if (allCells.some(c => c.includes("SELECT") || c.includes("📅")) ||
               (firstCell.includes("SELECT") || firstCell.includes("MONTH"))) {
      // Controls row
      reqs.push(rowH(sheetId, r, r + 1, 36));
      reqs.push(rc(sheetId, r, r + 1, 0, totalCols, {
        backgroundColor: C.headerBg,
        textFormat: { foregroundColorStyle: { rgbColor: C.muted }, bold: true, fontSize: 9, fontFamily: "Inter" },
        horizontalAlignment: "CENTER",
        verticalAlignment: "MIDDLE",
        borders: { bottom: borderStyle(C.divider) },
      }));
    } else if (hasSectionMarker) {
      // ── SECTION HEADER — family-specific accent style ──
      reqs.push(rowH(sheetId, r, r + 1, sizing.sectionH));
      if (familyId === "editorial") {
        // Editorial: elegant thin underline, no thick left border
        reqs.push(rc(sheetId, r, r + 1, 0, totalCols, {
          backgroundColor: C.darkBg,
          textFormat: { foregroundColorStyle: { rgbColor: secColor }, bold: true, italic: true, fontSize: sizing.sectionSize, fontFamily: "Inter" },
          horizontalAlignment: "LEFT",
          verticalAlignment: "MIDDLE",
          borders: { bottom: borderStyle(secColor) },
        }));
      } else if (familyId === "executive") {
        // Executive: dense compact header, thick left accent, tinted bg
        reqs.push(rc(sheetId, r, r + 1, 0, totalCols, {
          backgroundColor: secSoft,
          textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: sizing.sectionSize, fontFamily: "Inter" },
          horizontalAlignment: "LEFT",
          verticalAlignment: "MIDDLE",
          borders: {
            left: borderStyle(secColor, "SOLID_THICK"),
            bottom: borderStyle(secColor),
          },
        }));
      } else {
        // Nurture: warm colored accent bar with soft tinted background
        reqs.push(rc(sheetId, r, r + 1, 0, totalCols, {
          backgroundColor: secSoft,
          textFormat: { foregroundColorStyle: { rgbColor: secColor }, bold: true, fontSize: sizing.sectionSize, fontFamily: "Inter" },
          horizontalAlignment: "LEFT",
          verticalAlignment: "MIDDLE",
          borders: {
            left: borderStyle(secColor, "SOLID_THICK"),
            bottom: borderStyle(secColor),
          },
        }));
      }
      sectionIdx++;
    } else if (isTotalRow) {
      // Totals row
      const prevSecColor = C.catAccents[(sectionIdx - 1 + C.catAccents.length) % C.catAccents.length];
      reqs.push(rowH(sheetId, r, r + 1, familyId === "executive" ? 26 : 30));
      reqs.push(rc(sheetId, r, r + 1, 0, totalCols, {
        backgroundColor: C.totalsBg,
        textFormat: { foregroundColorStyle: { rgbColor: prevSecColor }, bold: true, fontSize: 10, fontFamily: "Inter" },
        horizontalAlignment: "CENTER",
        verticalAlignment: "MIDDLE",
        borders: {
          top: borderStyle(prevSecColor, "SOLID_MEDIUM"),
          left: familyId !== "editorial" ? borderStyle(prevSecColor, "SOLID_THICK") : undefined,
        },
      }));
    } else if (hasMultipleTextCells && !pastKpiSection) {
      // Pre-data header row
      reqs.push(rowH(sheetId, r, r + 1, sizing.colHeaderH));
      reqs.push(rc(sheetId, r, r + 1, 0, totalCols, {
        backgroundColor: C.headerBg,
        textFormat: { foregroundColorStyle: { rgbColor: C.muted }, bold: true, fontSize: 9, fontFamily: "Inter" },
        horizontalAlignment: "CENTER",
        verticalAlignment: "MIDDLE",
        borders: { bottom: borderStyle(C.divider) },
      }));
    } else if (hasMultipleTextCells && pastKpiSection) {
      // Column header row
      const curSecColor = C.catAccents[(sectionIdx > 0 ? sectionIdx - 1 : 0) % C.catAccents.length];
      reqs.push(rowH(sheetId, r, r + 1, sizing.colHeaderH));
      if (familyId === "editorial") {
        reqs.push(rc(sheetId, r, r + 1, 0, totalCols, {
          backgroundColor: C.headerBg,
          textFormat: { foregroundColorStyle: { rgbColor: curSecColor }, bold: true, fontSize: 9, fontFamily: "Inter" },
          horizontalAlignment: "CENTER",
          verticalAlignment: "MIDDLE",
          borders: { bottom: borderStyle(curSecColor) },
        }));
      } else {
        reqs.push(rc(sheetId, r, r + 1, 0, totalCols, {
          backgroundColor: C.headerBg,
          textFormat: { foregroundColorStyle: { rgbColor: C.muted }, bold: true, fontSize: 9, fontFamily: "Inter" },
          horizontalAlignment: "CENTER",
          verticalAlignment: "MIDDLE",
          borders: {
            bottom: borderStyle(C.divider),
            left: borderStyle(curSecColor, "SOLID_THICK"),
          },
        }));
      }
    } else {
      // Regular data row — family-specific height and border style
      const isAlt = (r % 2) === 0;
      const bg = isAlt ? C.cardBg2 : C.cardBg;
      const curSecColor = C.catAccents[(sectionIdx > 0 ? sectionIdx - 1 : 0) % C.catAccents.length];
      reqs.push(rowH(sheetId, r, r + 1, sizing.dataRowH));
      if (familyId === "editorial") {
        // Editorial: clean rows, no thick left border — just subtle bottom divider
        reqs.push(rc(sheetId, r, r + 1, 0, totalCols, {
          backgroundColor: bg,
          textFormat: { foregroundColorStyle: { rgbColor: C.white }, fontSize: 10, fontFamily: "Inter" },
          verticalAlignment: "MIDDLE",
          borders: { bottom: borderStyle(C.divider) },
        }));
      } else {
        // Nurture + Executive: colored left accent border
        reqs.push(rc(sheetId, r, r + 1, 0, totalCols, {
          backgroundColor: bg,
          textFormat: { foregroundColorStyle: { rgbColor: C.white }, fontSize: 10, fontFamily: "Inter" },
          verticalAlignment: "MIDDLE",
          borders: {
            bottom: borderStyle(C.divider),
            left: borderStyle(curSecColor, "SOLID_THICK"),
          },
        }));
      }
    }
  }

  // ── PHASE 3: Smart number formatting on data columns ──
  let headerRowIdx = -1;
  for (let r = Math.max(kpiValueRowIdx + 1, 0); r < numRows; r++) {
    const rowData = tab.sampleRows[r];
    if (!rowData) continue;
    const texts = rowData.map(c => String(c ?? "").trim()).filter(c =>
      c.length > 0 && !/^\d/.test(c) && !c.startsWith("=") && !c.startsWith("$")
    );
    if (texts.length >= 3) { headerRowIdx = r; break; }
  }

  if (headerRowIdx >= 0) {
    const headers = tab.sampleRows[headerRowIdx]!;
    const dataStartRow = headerRowIdx + 1;
    const dataEndRow = numRows + 5;

    for (let c = 0; c < headers.length; c++) {
      const h = String(headers[c] ?? "").trim().toUpperCase();

      if (h.includes("TARGET") || h.includes("SAVED") || h.includes("REMAINING") ||
          h.includes("BUDGETED") || h.includes("SPENT") || h.includes("LEFT") ||
          h.includes("AMOUNT") || h.includes("INCOME") || h.includes("EXPENSE") ||
          h.includes("COST") || h.includes("PRICE") || h.includes("BUDGET") ||
          h.includes("$ GOAL") || h.includes("$ ACTUAL") || h.includes("BALANCE") ||
          h.includes("PAYMENT") || h.includes("TOTAL") || h.includes("NET")) {
        reqs.push(rc(sheetId, dataStartRow, dataEndRow, c, c + 1, {
          numberFormat: { type: "CURRENCY", pattern: '"$"#,##0' },
        }));
      }
      else if (h.includes("PROGRESS") || h.includes("%") || h.includes("RATE") ||
               h.includes("RATIO") || h.includes("PERCENT")) {
        reqs.push(rc(sheetId, dataStartRow, dataEndRow, c, c + 1, {
          numberFormat: { type: "PERCENT", pattern: "0%" },
          textFormat: { foregroundColorStyle: { rgbColor: C.green } },
        }));
      }
    }
  }

  return reqs;
}

// ══════════════════════════════════════════════════════════════
// DATA TAB FORMATTING — Professional dark headers + banded rows
// ══════════════════════════════════════════════════════════════

function formatDataTab(
  sheetId: number,
  tab: BlueprintTab,
  C: PremiumPalette
): sheets_v4.Schema$Request[] {
  const reqs: sheets_v4.Schema$Request[] = [];
  const numCols = Math.max(tab.columns.length, 1);
  const numRows = tab.sampleRows.length;
  const totalRows = numRows + 10;

  // Column widths — wider for readability
  reqs.push(colW(sheetId, 0, 1, 40));  // # column
  for (let c = 1; c < numCols; c++) {
    const colDef = tab.columns[c];
    const w = colDef?.width || (colDef?.type === "text" ? 200 : 140);
    reqs.push(colW(sheetId, c, c + 1, w));
  }

  // Row 1: Tab title header (data tabs have title at row 0)
  reqs.push(rc(sheetId, 0, 1, 0, numCols, {
    backgroundColor: C.navy,
    textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 10, fontFamily: "Inter" },
    horizontalAlignment: "CENTER",
    verticalAlignment: "MIDDLE",
  }));
  reqs.push(rowH(sheetId, 0, 1, 34));

  // Hide gridlines on data tabs too
  reqs.push({
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { hideGridlines: true } },
      fields: "gridProperties.hideGridlines",
    },
  });

  // Dark background for entire data tab
  reqs.push(rc(sheetId, 0, totalRows, 0, numCols, {
    backgroundColor: C.darkBg,
    textFormat: { foregroundColorStyle: { rgbColor: C.white }, fontSize: 10, fontFamily: "Inter" },
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
  }));

  // Row 2: Spacer (dark)
  reqs.push(rc(sheetId, 1, 2, 0, numCols, {
    backgroundColor: C.darkBg,
  }));

  // Row 3: Column headers — dark navy
  reqs.push(rc(sheetId, 2, 3, 0, numCols, {
    backgroundColor: C.navy,
    textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 9, fontFamily: "Inter" },
    horizontalAlignment: "CENTER",
    verticalAlignment: "MIDDLE",
    borders: { bottom: borderStyle(C.divider) },
  }));

  // Apply currency/percent formatting based on column types
  for (let c = 0; c < tab.columns.length; c++) {
    const col = tab.columns[c];
    if (col.type === "currency") {
      reqs.push(rc(sheetId, 3, totalRows, c, c + 1, {
        numberFormat: { type: "CURRENCY", pattern: '"$"#,##0.00' },
      }));
    } else if (col.type === "percent") {
      reqs.push(rc(sheetId, 3, totalRows, c, c + 1, {
        numberFormat: { type: "PERCENT", pattern: "0%" },
      }));
    } else if (col.type === "date") {
      reqs.push(rc(sheetId, 3, totalRows, c, c + 1, {
        numberFormat: { type: "DATE", pattern: "yyyy-mm-dd" },
      }));
    }
  }

  // Dark banded rows for data area — alternating dark backgrounds
  if (numRows > 3) {
    reqs.push({
      addBanding: {
        bandedRange: {
          range: { sheetId, startRowIndex: 3, endRowIndex: numRows + 3, startColumnIndex: 0, endColumnIndex: numCols },
          rowProperties: {
            firstBandColorStyle: { rgbColor: C.cardBg },
            secondBandColorStyle: { rgbColor: C.cardBg2 },
          },
        },
      },
    });
  }

  // Find totals row and style it
  for (let r = 0; r < numRows; r++) {
    const firstCell = String(tab.sampleRows[r]?.[0] || "").toUpperCase();
    if (firstCell.includes("TOTAL")) {
      const rowIdx = r + 3; // offset for title + spacer + headers
      reqs.push(rc(sheetId, rowIdx, rowIdx + 1, 0, numCols, {
        textFormat: { bold: true },
        borders: { top: borderStyle(C.navy, "SOLID_MEDIUM") },
      }));
    }
  }

  return reqs;
}

// ══════════════════════════════════════════════════════════════
// SETUP/INSTRUCTIONS TAB — Section-based formatting
// ══════════════════════════════════════════════════════════════

function formatSetupTab(
  sheetId: number,
  tab: BlueprintTab,
  C: PremiumPalette
): sheets_v4.Schema$Request[] {
  const reqs: sheets_v4.Schema$Request[] = [];
  const numCols = Math.max(tab.columns.length, 8);
  const numRows = tab.sampleRows.length;
  const totalRows = numRows + 10;

  // Hide gridlines
  reqs.push({
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { hideGridlines: true } },
      fields: "gridProperties.hideGridlines",
    },
  });

  // Dark background for entire tab
  reqs.push(rc(sheetId, 0, totalRows, 0, numCols, {
    backgroundColor: C.darkBg,
    textFormat: { foregroundColorStyle: { rgbColor: C.white }, fontSize: 10, fontFamily: "Inter" },
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
  }));

  // Column widths
  reqs.push(colW(sheetId, 0, 1, 30));
  for (let c = 1; c < numCols; c++) {
    reqs.push(colW(sheetId, c, c + 1, 160));
  }

  // Title row
  reqs.push(mergeCells(sheetId, 0, 1, 0, numCols));
  reqs.push(rc(sheetId, 0, 1, 0, numCols, {
    backgroundColor: C.navy,
    textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 14, fontFamily: "Inter" },
    horizontalAlignment: "CENTER",
    verticalAlignment: "MIDDLE",
  }));
  reqs.push(rowH(sheetId, 0, 1, 44));

  // Scan through sampleRows for section-like patterns and format them
  for (let r = 0; r < numRows; r++) {
    const rowData = tab.sampleRows[r];
    if (!rowData) continue;
    const firstCell = String(rowData[0] || "").trim();

    // Section headers (emoji indicators or ALL CAPS)
    const isSection = firstCell.includes("🚀") || firstCell.includes("📂") ||
      firstCell.includes("📊") || firstCell.includes("🎯") ||
      firstCell.includes("💰") || firstCell.includes("📋") ||
      (firstCell === firstCell.toUpperCase() && firstCell.length > 3 && /[A-Z]/.test(firstCell));

    if (isSection) {
      const altColor = r % 2 === 0 ? C.gold : C.navy;
      reqs.push(rc(sheetId, r, r + 1, 0, numCols, {
        backgroundColor: altColor,
        textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 12, fontFamily: "Inter" },
      }));
    } else {
      // Regular content rows — dark alternating
      const bg = r % 2 === 0 ? C.cardBg : C.cardBg2;
      reqs.push(rc(sheetId, r, r + 1, 0, numCols, {
        backgroundColor: bg,
        textFormat: { foregroundColorStyle: { rgbColor: C.muted }, fontSize: 10, fontFamily: "Inter" },
        borders: { bottom: borderStyle(C.divider) },
      }));
    }
  }

  return reqs;
}

// ══════════════════════════════════════════════════════════════
// SUMMARY TAB — Same as data but with emphasis on headers
// ══════════════════════════════════════════════════════════════

function formatSummaryTab(
  sheetId: number,
  tab: BlueprintTab,
  C: PremiumPalette
): sheets_v4.Schema$Request[] {
  // Summaries use data tab formatting + banded rows
  return formatDataTab(sheetId, tab, C);
}

// ══════════════════════════════════════════════════════════════
// CHART BUILDER — Dark-themed chart requests from BlueprintCharts
// ══════════════════════════════════════════════════════════════

function parseRange(range: string): { col: number; row: number; endCol: number; endRow: number } {
  // Parse "B2:B6" → { col: 1, row: 1, endCol: 2, endRow: 6 }
  const match = range.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
  if (!match) return { col: 0, row: 0, endCol: 1, endRow: 1 };
  const colIdx = (s: string) => s.split("").reduce((acc, c) => acc * 26 + c.charCodeAt(0) - 64, 0) - 1;
  return {
    col: colIdx(match[1]),
    row: parseInt(match[2]) - 1,
    endCol: colIdx(match[3]) + 1,
    endRow: parseInt(match[4]),
  };
}

function buildChartRequests(
  charts: BlueprintChart[],
  tabs: BlueprintTab[],
  C: PremiumPalette
): sheets_v4.Schema$Request[] {
  const reqs: sheets_v4.Schema$Request[] = [];

  for (const chart of charts) {
    const sourceTabIdx = tabs.findIndex((t) => t.name === chart.sourceTab);
    if (sourceTabIdx < 0) continue;

    const placementTabIdx = tabs.findIndex((t) => t.name === chart.placement.tab);
    if (placementTabIdx < 0) continue;

    const labelRange = parseRange(chart.sourceRange);
    const dataRange = parseRange(chart.dataRange);

    const position = {
      overlayPosition: {
        anchorCell: {
          sheetId: placementTabIdx,
          rowIndex: chart.placement.row - 1,
          columnIndex: chart.placement.col,
        },
        widthPixels: chart.width || 520,
        heightPixels: chart.height || 340,
      },
    };

    const titleFmt = {
      fontSize: 11,
      bold: true,
      foregroundColorStyle: { rgbColor: C.muted },
    };

    const sourceRangeFn = (r: { col: number; row: number; endCol: number; endRow: number }) => ({
      sources: [{
        sheetId: sourceTabIdx,
        startRowIndex: r.row,
        endRowIndex: r.endRow,
        startColumnIndex: r.col,
        endColumnIndex: r.endCol,
      }],
    });

    if (chart.type === "donut" || chart.type === "pie") {
      reqs.push({
        addChart: {
          chart: {
            spec: {
              title: chart.title,
              titleTextFormat: titleFmt,
              pieChart: {
                legendPosition: "RIGHT_LEGEND",
                ...(chart.type === "donut" ? { pieHole: 0.55 } : {}),
                domain: { sourceRange: sourceRangeFn(labelRange) },
                series: { sourceRange: sourceRangeFn(dataRange) },
              },
              backgroundColorStyle: { rgbColor: C.cardBg },
              fontName: "Inter",
            },
            position,
          },
        },
      });
    } else if (chart.type === "column" || chart.type === "bar" || chart.type === "line") {
      const chartType = chart.type === "column" ? "COLUMN" : chart.type === "bar" ? "BAR" : "LINE";
      reqs.push({
        addChart: {
          chart: {
            spec: {
              title: chart.title,
              titleTextFormat: titleFmt,
              basicChart: {
                chartType,
                legendPosition: "TOP_LEGEND",
                axis: [
                  { position: "BOTTOM_AXIS" },
                  { position: "LEFT_AXIS" },
                ],
                domains: [{ domain: { sourceRange: sourceRangeFn(labelRange) } }],
                series: [{
                  series: { sourceRange: sourceRangeFn(dataRange) },
                  colorStyle: { rgbColor: C.green },
                }],
                headerCount: 1,
              },
              backgroundColorStyle: { rgbColor: C.cardBg },
              fontName: "Inter",
            },
            position,
          },
        },
      });
    }
  }

  return reqs;
}

// ══════════════════════════════════════════════════════════════
// AUTO-GENERATE CHARTS — When blueprint charts are missing/invalid
// Creates dark-themed charts from available data tabs
// ══════════════════════════════════════════════════════════════

function autoGenerateCharts(
  tabs: BlueprintTab[],
  C: PremiumPalette
): sheets_v4.Schema$Request[] {
  const reqs: sheets_v4.Schema$Request[] = [];
  const dashIdx = tabs.findIndex((t) => t.name.toLowerCase().includes("dashboard"));
  if (dashIdx < 0) return reqs;

  const dashTab = tabs[dashIdx];
  const numDataRows = dashTab.sampleRows.length;

  const savingsTab = tabs.findIndex((t) =>
    t.name.toLowerCase().includes("savings") || t.name.toLowerCase().includes("goal")
  );
  const summaryTab = tabs.findIndex((t) =>
    t.name.toLowerCase().includes("summary") || t.name.toLowerCase().includes("monthly")
  );

  // ── Detect ALL data sections in dashboard (not just one) ──
  // Each section = a header row followed by data rows, separated by section markers or empty rows
  interface DataSection {
    name: string;
    headerRow: number;
    labelCol: number;
    dataCol: number;  // Main numeric column (Budgeted or Spent)
    startRow: number;
    endRow: number;
  }
  const sections: DataSection[] = [];
  let currentSection: DataSection | null = null;

  for (let r = 0; r < numDataRows; r++) {
    const row = dashTab.sampleRows[r];
    if (!row) continue;
    const firstCellRaw = String(row[0] || "").trim();
    const firstUp = firstCellRaw.toUpperCase();
    const isEmpty = row.every(c => c === null || c === "" || String(c).trim() === "");
    const isSection = isSectionLike(firstCellRaw);
    const isTotal = firstUp.includes("TOTAL");
    const hasMultiText = row.map(c => String(c ?? "").trim()).filter(c =>
      c.length > 0 && !/^\d/.test(c) && !c.startsWith("=") && !c.startsWith("$")
    ).length >= 3;

    if (isSection) {
      // Close current section
      if (currentSection && currentSection.endRow > currentSection.startRow) {
        sections.push(currentSection);
      }
      currentSection = { name: firstCellRaw, headerRow: -1, labelCol: 0, dataCol: 1, startRow: -1, endRow: -1 };
    } else if (hasMultiText && currentSection && currentSection.headerRow < 0) {
      // Column header row within section
      currentSection.headerRow = r;
      // Find the best numeric column
      for (let c = 0; c < row.length; c++) {
        const h = String(row[c] ?? "").trim().toUpperCase();
        if (h === "SPENT" || h === "ACTUAL" || h === "AMOUNT") { currentSection.dataCol = c; break; }
        if (h === "BUDGETED" || h === "BUDGET") currentSection.dataCol = c;
      }
      currentSection.startRow = r + 1;
      currentSection.endRow = r + 1;
    } else if (currentSection && currentSection.startRow >= 0 && !isEmpty && !isTotal) {
      if (firstCellRaw && typeof row[currentSection.dataCol] === "number") {
        currentSection.endRow = r + 1;
      }
    } else if ((isEmpty || isTotal) && currentSection && currentSection.startRow >= 0) {
      if (currentSection.endRow > currentSection.startRow) {
        sections.push(currentSection);
      }
      currentSection = null;
    }
  }
  // Close last section
  if (currentSection && currentSection.endRow > currentSection.startRow) {
    sections.push(currentSection);
  }

  const titleFmt = {
    fontSize: 11,
    bold: true,
    foregroundColorStyle: { rgbColor: C.muted },
  };

  let chartCount = 0;

  // ── Chart 1: Budget vs Actual ALL CATEGORIES (like Etsy bestseller) ──
  // Combine all sections into one wide bar chart
  if (sections.length > 0) {
    // Use the first section's data for a donut showing spending breakdown
    const firstSec = sections[0];
    if (firstSec.endRow > firstSec.startRow) {
      reqs.push({
        addChart: {
          chart: {
            spec: {
              title: "💰 Where Your Money Goes",
              titleTextFormat: titleFmt,
              pieChart: {
                legendPosition: "LABELED_LEGEND",
                pieHole: 0.5,
                domain: {
                  sourceRange: {
                    sources: [{
                      sheetId: dashIdx,
                      startRowIndex: firstSec.startRow,
                      endRowIndex: firstSec.endRow,
                      startColumnIndex: firstSec.labelCol,
                      endColumnIndex: firstSec.labelCol + 1,
                    }],
                  },
                },
                series: {
                  sourceRange: {
                    sources: [{
                      sheetId: dashIdx,
                      startRowIndex: firstSec.startRow,
                      endRowIndex: firstSec.endRow,
                      startColumnIndex: firstSec.dataCol,
                      endColumnIndex: firstSec.dataCol + 1,
                    }],
                  },
                },
              },
              backgroundColorStyle: { rgbColor: C.cardBg },
              fontName: "Inter",
            },
            position: {
              overlayPosition: {
                anchorCell: { sheetId: dashIdx, rowIndex: numDataRows + 2, columnIndex: 0 },
                widthPixels: 480,
                heightPixels: 320,
              },
            },
          },
        },
      });
      chartCount++;
    }
  }

  // ── Chart 2: Per-section donuts (like Etsy bestseller's colored category rings) ──
  // Place side by side below the main data
  for (let si = 1; si < Math.min(sections.length, 4); si++) {
    const sec = sections[si];
    if (sec.endRow <= sec.startRow) continue;
    const colOffset = (si) * 4; // Space charts across columns

    reqs.push({
      addChart: {
        chart: {
          spec: {
            title: sec.name.replace(/[📊🎯💳📂💡📋💰🏦]/g, "").trim().slice(0, 25),
            titleTextFormat: { ...titleFmt, foregroundColorStyle: { rgbColor: C.catAccents[si % C.catAccents.length] } },
            pieChart: {
              legendPosition: "NO_LEGEND",
              pieHole: 0.6,
              domain: {
                sourceRange: {
                  sources: [{
                    sheetId: dashIdx,
                    startRowIndex: sec.startRow,
                    endRowIndex: sec.endRow,
                    startColumnIndex: sec.labelCol,
                    endColumnIndex: sec.labelCol + 1,
                  }],
                },
              },
              series: {
                sourceRange: {
                  sources: [{
                    sheetId: dashIdx,
                    startRowIndex: sec.startRow,
                    endRowIndex: sec.endRow,
                    startColumnIndex: sec.dataCol,
                    endColumnIndex: sec.dataCol + 1,
                  }],
                },
              },
            },
            backgroundColorStyle: { rgbColor: C.cardBg },
            fontName: "Inter",
          },
          position: {
            overlayPosition: {
              anchorCell: { sheetId: dashIdx, rowIndex: numDataRows + 2, columnIndex: colOffset },
              widthPixels: 320,
              heightPixels: 280,
            },
          },
        },
      },
    });
    chartCount++;
  }

  // ── Chart 3: Savings Goals donut ──
  if (savingsTab >= 0) {
    const sTab = tabs[savingsTab];
    const nameCol = sTab.columns.findIndex((c) => c.type === "text" && (c.name.toLowerCase().includes("goal") || c.name.toLowerCase().includes("name")));
    const valCol = sTab.columns.findIndex((c) => c.type === "currency" && (c.name.toLowerCase().includes("saved") || c.name.toLowerCase().includes("amount")));

    if (nameCol >= 0 && valCol >= 0 && sTab.sampleRows.length > 1) {
      reqs.push({
        addChart: {
          chart: {
            spec: {
              title: "🎯 Savings Progress",
              titleTextFormat: titleFmt,
              pieChart: {
                legendPosition: "LABELED_LEGEND",
                pieHole: 0.55,
                domain: {
                  sourceRange: {
                    sources: [{
                      sheetId: savingsTab,
                      startRowIndex: 0,
                      endRowIndex: Math.min(sTab.sampleRows.length, 8),
                      startColumnIndex: nameCol,
                      endColumnIndex: nameCol + 1,
                    }],
                  },
                },
                series: {
                  sourceRange: {
                    sources: [{
                      sheetId: savingsTab,
                      startRowIndex: 0,
                      endRowIndex: Math.min(sTab.sampleRows.length, 8),
                      startColumnIndex: valCol,
                      endColumnIndex: valCol + 1,
                    }],
                  },
                },
              },
              backgroundColorStyle: { rgbColor: C.cardBg },
              fontName: "Inter",
            },
            position: {
              overlayPosition: {
                anchorCell: { sheetId: dashIdx, rowIndex: numDataRows + 19, columnIndex: 0 },
                widthPixels: 480,
                heightPixels: 320,
              },
            },
          },
        },
      });
      chartCount++;
    }
  }

  // ── Chart 4: Budget vs Actual bar chart (Etsy-style comparison) ──
  // Find a section that has both Budgeted and Spent columns
  for (const sec of sections) {
    if (sec.headerRow < 0) continue;
    const headerRow = dashTab.sampleRows[sec.headerRow];
    if (!headerRow) continue;
    const cells = headerRow.map(c => String(c ?? "").trim().toUpperCase());
    const budgetedCol = cells.findIndex(c => c === "BUDGETED" || c === "BUDGET");
    const spentCol = cells.findIndex(c => c === "SPENT" || c === "ACTUAL");
    if (budgetedCol < 0 || spentCol < 0) continue;

    reqs.push({
      addChart: {
        chart: {
          spec: {
            title: "📊 Budget vs Actual",
            titleTextFormat: titleFmt,
            basicChart: {
              chartType: "COLUMN",
              legendPosition: "TOP_LEGEND",
              axis: [
                { position: "BOTTOM_AXIS", title: "" },
                { position: "LEFT_AXIS", title: "", format: { source: "CUSTOM", pattern: '"$"#,##0' } as sheets_v4.Schema$TextFormat },
              ],
              domains: [{
                domain: {
                  sourceRange: {
                    sources: [{
                      sheetId: dashIdx,
                      startRowIndex: sec.startRow,
                      endRowIndex: sec.endRow,
                      startColumnIndex: sec.labelCol,
                      endColumnIndex: sec.labelCol + 1,
                    }],
                  },
                },
              }],
              series: [
                {
                  series: {
                    sourceRange: {
                      sources: [{
                        sheetId: dashIdx,
                        startRowIndex: sec.startRow,
                        endRowIndex: sec.endRow,
                        startColumnIndex: budgetedCol,
                        endColumnIndex: budgetedCol + 1,
                      }],
                    },
                  },
                  colorStyle: { rgbColor: C.catAccents[0] },
                },
                {
                  series: {
                    sourceRange: {
                      sources: [{
                        sheetId: dashIdx,
                        startRowIndex: sec.startRow,
                        endRowIndex: sec.endRow,
                        startColumnIndex: spentCol,
                        endColumnIndex: spentCol + 1,
                      }],
                    },
                  },
                  colorStyle: { rgbColor: C.catAccents[2] },
                },
              ],
              headerCount: 0,
            },
            backgroundColorStyle: { rgbColor: C.cardBg },
            fontName: "Inter",
          },
          position: {
            overlayPosition: {
              anchorCell: { sheetId: dashIdx, rowIndex: numDataRows + 19, columnIndex: 5 },
              widthPixels: 600,
              heightPixels: 320,
            },
          },
        },
      },
    });
    chartCount++;
    break; // Only one budget vs actual chart
  }

  // ── Chart 5: Monthly Spending Trend from summary tab ──
  if (summaryTab >= 0) {
    const sTab = tabs[summaryTab];
    const monthCol = sTab.columns.findIndex((c) => c.type === "text");
    const numCol = sTab.columns.findIndex((c) => c.type === "currency");

    if (monthCol >= 0 && numCol >= 0 && sTab.sampleRows.length > 2) {
      reqs.push({
        addChart: {
          chart: {
            spec: {
              title: "📈 Monthly Spending Trend",
              titleTextFormat: titleFmt,
              basicChart: {
                chartType: "LINE",
                legendPosition: "TOP_LEGEND",
                axis: [{ position: "BOTTOM_AXIS" }, { position: "LEFT_AXIS" }],
                domains: [{
                  domain: {
                    sourceRange: {
                      sources: [{
                        sheetId: summaryTab,
                        startRowIndex: 2,
                        endRowIndex: Math.min(sTab.sampleRows.length + 3, 15),
                        startColumnIndex: monthCol,
                        endColumnIndex: monthCol + 1,
                      }],
                    },
                  },
                }],
                series: [{
                  series: {
                    sourceRange: {
                      sources: [{
                        sheetId: summaryTab,
                        startRowIndex: 2,
                        endRowIndex: Math.min(sTab.sampleRows.length + 3, 15),
                        startColumnIndex: numCol,
                        endColumnIndex: numCol + 1,
                      }],
                    },
                  },
                  colorStyle: { rgbColor: C.green },
                  lineStyle: { width: 3 },
                }],
                headerCount: 1,
              },
              backgroundColorStyle: { rgbColor: C.cardBg },
              fontName: "Inter",
            },
            position: {
              overlayPosition: {
                anchorCell: { sheetId: dashIdx, rowIndex: numDataRows + 36, columnIndex: 0 },
                widthPixels: 1000,
                heightPixels: 300,
              },
            },
          },
        },
      });
      chartCount++;
    }
  }

  console.log(`[GoogleSheetsBuilder] Auto-generated ${chartCount} charts`);
  return reqs;
}

// ══════════════════════════════════════════════════════════════
// DATA VALIDATION — Dropdowns from features
// ══════════════════════════════════════════════════════════════

function buildValidationRequests(
  tabs: BlueprintTab[]
): sheets_v4.Schema$Request[] {
  const reqs: sheets_v4.Schema$Request[] = [];

  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    if (!tab.features.includes("dropdown_validation")) continue;

    // Look for columns with limited distinct values in sampleRows
    for (let c = 0; c < tab.columns.length; c++) {
      const col = tab.columns[c];
      if (col.type !== "text") continue;

      // Collect unique values from this column
      const values = new Set<string>();
      for (const row of tab.sampleRows) {
        const val = String(row[c] || "").trim();
        if (val && !val.startsWith("=")) values.add(val);
      }

      // If 2-15 distinct values, create a dropdown
      if (values.size >= 2 && values.size <= 15) {
        reqs.push({
          setDataValidation: {
            range: {
              sheetId: i,
              startRowIndex: tab.name.toLowerCase() === "dashboard" ? 0 : 3,
              endRowIndex: 200,
              startColumnIndex: c,
              endColumnIndex: c + 1,
            },
            rule: {
              condition: {
                type: "ONE_OF_LIST",
                values: [...values].map((v) => ({ userEnteredValue: v })),
              },
              showCustomUi: true,
              strict: false,
            },
          },
        });
      }
    }
  }

  return reqs;
}

// ══════════════════════════════════════════════════════════════
// CONDITIONAL FORMATTING — Status columns, progress, categories
// ══════════════════════════════════════════════════════════════

function buildConditionalFormatRequests(
  tabs: BlueprintTab[],
  C: PremiumPalette
): sheets_v4.Schema$Request[] {
  const reqs: sheets_v4.Schema$Request[] = [];

  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    if (!tab.features.includes("conditional_formatting")) continue;

    // Look for percentage/progress columns → gradient
    for (let c = 0; c < tab.columns.length; c++) {
      const col = tab.columns[c];
      if (col.type === "percent") {
        reqs.push({
          addConditionalFormatRule: {
            rule: {
              ranges: [{
                sheetId: i,
                startRowIndex: 1,
                endRowIndex: tab.sampleRows.length + 3,
                startColumnIndex: c,
                endColumnIndex: c + 1,
              }],
              gradientRule: {
                minpoint: { color: C.red, type: "MIN" },
                midpoint: { color: C.warning, type: "PERCENTILE", value: "50" },
                maxpoint: { color: C.green, type: "MAX" },
              },
            },
            index: reqs.length,
          },
        });
      }

      // Status columns: ✅/⚠️/❌ text-based conditional formatting
      if (col.name.toUpperCase() === "STATUS") {
        const statusRange = {
          sheetId: i,
          startRowIndex: 3,
          endRowIndex: tab.sampleRows.length + 5,
          startColumnIndex: c,
          endColumnIndex: c + 1,
        };
        // ✅ On Track → green text on dark green bg
        reqs.push({
          addConditionalFormatRule: {
            rule: {
              ranges: [statusRange],
              booleanRule: {
                condition: { type: "TEXT_CONTAINS", values: [{ userEnteredValue: "✅" }] },
                format: {
                  textFormat: { foregroundColorStyle: { rgbColor: C.green } },
                  backgroundColor: C.greenSoft,
                },
              },
            },
            index: reqs.length,
          },
        });
        // ⚠️ Watch → yellow text on dark yellow bg
        reqs.push({
          addConditionalFormatRule: {
            rule: {
              ranges: [statusRange],
              booleanRule: {
                condition: { type: "TEXT_CONTAINS", values: [{ userEnteredValue: "⚠️" }] },
                format: {
                  textFormat: { foregroundColorStyle: { rgbColor: C.warning } },
                  backgroundColor: hex("#78350F"),
                },
              },
            },
            index: reqs.length,
          },
        });
        // ❌ Behind → red text on dark red bg
        reqs.push({
          addConditionalFormatRule: {
            rule: {
              ranges: [statusRange],
              booleanRule: {
                condition: { type: "TEXT_CONTAINS", values: [{ userEnteredValue: "❌" }] },
                format: {
                  textFormat: { foregroundColorStyle: { rgbColor: C.red } },
                  backgroundColor: C.redSoft,
                },
              },
            },
            index: reqs.length,
          },
        });
      }
    }
  }

  return reqs;
}

// ══════════════════════════════════════════════════════════════
// BUDGET STATUS BANNER — "LEFT TO SPEND, SAVE OR INVEST" bar
// Injects a prominent progress bar showing total spent/budget
// after the KPI section. Like the Etsy bestseller's budget status.
// ══════════════════════════════════════════════════════════════

function buildBudgetStatusValues(
  tabs: BlueprintTab[],
  C: PremiumPalette
): sheets_v4.Schema$ValueRange[] {
  const data: sheets_v4.Schema$ValueRange[] = [];

  for (const tab of tabs) {
    const role = classifyTab(tab);
    if (role !== "dashboard") continue;

    // Find KPI label row to locate TOTAL INCOME and TOTAL SPENT references
    let kpiLabelRowIdx = -1;
    let incomeCol = -1, spentCol = -1;
    for (let r = 0; r < Math.min(tab.sampleRows.length, 7); r++) {
      const rowData = tab.sampleRows[r];
      if (!rowData) continue;
      const cells = rowData.map(c => String(c ?? "").trim().toUpperCase());
      const kpiTerms = cells.filter(c =>
        c.includes("TOTAL INCOME") || c.includes("TOTAL SPENT") ||
        c.includes("NET SAVINGS") || c.includes("SAVINGS RATE") ||
        c.includes("TOTAL EXPENSE") || c.includes("NET INCOME") ||
        c.includes("MONTHLY INCOME") || c.includes("BALANCE")
      );
      if (kpiTerms.length >= 2) {
        kpiLabelRowIdx = r;
        // Find the income and spent columns
        for (let c = 0; c < cells.length; c++) {
          if (cells[c].includes("INCOME") || cells[c].includes("BUDGET")) incomeCol = c;
          if (cells[c].includes("SPENT") || cells[c].includes("EXPENSE")) spentCol = c;
        }
        break;
      }
    }

    if (kpiLabelRowIdx < 0 || incomeCol < 0 || spentCol < 0) continue;

    // The budget status row goes right after the KPI value row
    const kpiValueRowIdx = kpiLabelRowIdx + 1;
    // Find the first empty row or spacer after KPIs
    let insertRow = kpiValueRowIdx + 1;
    for (let r = kpiValueRowIdx + 1; r < Math.min(tab.sampleRows.length, kpiValueRowIdx + 4); r++) {
      const rowData = tab.sampleRows[r];
      if (!rowData) continue;
      const isEmpty = rowData.every(c => c === null || c === "" || String(c).trim() === "");
      if (isEmpty) { insertRow = r; break; }
    }

    // Build the budget status sparkline formula
    // Uses the KPI value row cells as source (e.g., B3 for income, D3 for spent)
    const incomeLetter = String.fromCharCode(65 + incomeCol);
    const spentLetter = String.fromCharCode(65 + spentCol);
    const valueRowNum = kpiValueRowIdx + 1; // 1-indexed
    const statusRowNum = insertRow + 1;

    // Row content: "BUDGET STATUS" label + sparkline bar + "LEFT TO SPEND" text
    const statusRow: (string | number | null)[] = [];
    // Col 0: Label
    statusRow[0] = "💰 BUDGET STATUS";
    // Col 1-2: Merge for sparkline (wide progress bar)
    statusRow[1] = `=IF(${incomeLetter}${valueRowNum}>0,SPARKLINE(${spentLetter}${valueRowNum}/${incomeLetter}${valueRowNum},{"charttype","bar";"max",1;"color1","${C.catAccentHexes[0]}";"color2","${C.altRowHex}"}),"")`;
    statusRow[2] = "";
    // Col 3: Percentage text
    statusRow[3] = `=IF(${incomeLetter}${valueRowNum}>0,TEXT(${spentLetter}${valueRowNum}/${incomeLetter}${valueRowNum},"0%")&" used","")`;
    // Col 4: Remaining text
    statusRow[4] = `=IF(${incomeLetter}${valueRowNum}>0,"$"&TEXT(${incomeLetter}${valueRowNum}-${spentLetter}${valueRowNum},"#,##0")&" left to save or invest","")`;

    const maxCols = Math.max(tab.sampleRows[0]?.length || 6, 6);
    while (statusRow.length < maxCols) statusRow.push("");

    data.push({
      range: `'${tab.name}'!A${statusRowNum}:${String.fromCharCode(64 + maxCols)}${statusRowNum}`,
      values: [statusRow],
    });
  }

  return data;
}

function buildBudgetStatusFormatting(
  sheetId: number,
  tab: BlueprintTab,
  C: PremiumPalette
): sheets_v4.Schema$Request[] {
  const reqs: sheets_v4.Schema$Request[] = [];
  const totalCols = Math.max(tab.columns.length, 12);

  // Find KPI section
  let kpiLabelRowIdx = -1;
  for (let r = 0; r < Math.min(tab.sampleRows.length, 7); r++) {
    const rowData = tab.sampleRows[r];
    if (!rowData) continue;
    const cells = rowData.map(c => String(c ?? "").trim().toUpperCase());
    const hasIncome = cells.some(c => c.includes("INCOME") || c.includes("BUDGET"));
    const hasSpent = cells.some(c => c.includes("SPENT") || c.includes("EXPENSE"));
    if (hasIncome && hasSpent) { kpiLabelRowIdx = r; break; }
  }
  if (kpiLabelRowIdx < 0) return reqs;

  // Find insert row (first empty after KPI value row)
  const kpiValueRowIdx = kpiLabelRowIdx + 1;
  let insertRow = kpiValueRowIdx + 1;
  for (let r = kpiValueRowIdx + 1; r < Math.min(tab.sampleRows.length, kpiValueRowIdx + 4); r++) {
    const rowData = tab.sampleRows[r];
    if (!rowData) continue;
    const isEmpty = rowData.every(c => c === null || c === "" || String(c).trim() === "");
    if (isEmpty) { insertRow = r; break; }
  }

  // Format the budget status banner row
  const statusColor = C.catAccents[0]; // Blue accent for budget status
  reqs.push(rowH(sheetId, insertRow, insertRow + 1, 36));
  // Label cell (col 0) — bold accent
  reqs.push(rc(sheetId, insertRow, insertRow + 1, 0, 1, {
    backgroundColor: C.elevCard,
    textFormat: { foregroundColorStyle: { rgbColor: statusColor }, bold: true, fontSize: 10, fontFamily: "Inter" },
    horizontalAlignment: "LEFT",
    verticalAlignment: "MIDDLE",
    borders: {
      left: borderStyle(statusColor, "SOLID_THICK"),
      top: borderStyle(statusColor),
      bottom: borderStyle(statusColor),
    },
  }));
  // Sparkline cells (cols 1-2)
  reqs.push(rc(sheetId, insertRow, insertRow + 1, 1, 3, {
    backgroundColor: C.elevCard,
    verticalAlignment: "MIDDLE",
    borders: {
      top: borderStyle(statusColor),
      bottom: borderStyle(statusColor),
    },
  }));
  // Percentage text (col 3)
  reqs.push(rc(sheetId, insertRow, insertRow + 1, 3, 4, {
    backgroundColor: C.elevCard,
    textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 11, fontFamily: "Inter" },
    horizontalAlignment: "CENTER",
    verticalAlignment: "MIDDLE",
    borders: {
      top: borderStyle(statusColor),
      bottom: borderStyle(statusColor),
    },
  }));
  // "Left to save" text (col 4+)
  reqs.push(rc(sheetId, insertRow, insertRow + 1, 4, totalCols, {
    backgroundColor: C.elevCard,
    textFormat: { foregroundColorStyle: { rgbColor: C.green }, bold: false, fontSize: 9, fontFamily: "Inter" },
    horizontalAlignment: "LEFT",
    verticalAlignment: "MIDDLE",
    borders: {
      top: borderStyle(statusColor),
      bottom: borderStyle(statusColor),
      right: borderStyle(statusColor),
    },
  }));

  return reqs;
}

// ══════════════════════════════════════════════════════════════
// OVER/UNDER BUDGET FORMULAS — Per-category row indicators
// Injects "$X under budget" (green) or "$X over budget" (red)
// into an empty column next to Budgeted/Spent pairs
// ══════════════════════════════════════════════════════════════

function buildOverUnderBudgetValues(
  tabs: BlueprintTab[],
  C: PremiumPalette
): sheets_v4.Schema$ValueRange[] {
  const data: sheets_v4.Schema$ValueRange[] = [];

  for (const tab of tabs) {
    const role = classifyTab(tab);
    if (role !== "dashboard") continue;

    // Find header rows with Budgeted + Spent columns
    for (let r = 0; r < tab.sampleRows.length; r++) {
      const rowData = tab.sampleRows[r];
      if (!rowData) continue;
      const cells = rowData.map(c => String(c ?? "").trim().toUpperCase());

      // Look for column header rows that have both Budget and Spent/Actual
      const budgetedCol = cells.findIndex(c => c === "BUDGETED" || c === "BUDGET");
      const spentCol = cells.findIndex(c => c === "SPENT" || c === "ACTUAL");
      if (budgetedCol < 0 || spentCol < 0) continue;

      // Check if there's an available column after the last data column
      // or find Status/Left/Remaining column
      let leftCol = cells.findIndex(c => c === "LEFT" || c === "REMAINING");
      if (leftCol < 0) {
        // Use the column after the last non-empty header
        const lastHeader = cells.reduce((last, c, i) => c.length > 0 ? i : last, 0);
        leftCol = lastHeader + 1;
      }

      // Skip if the "Left" column already has formulas — only inject "vs budget" indicator
      // Find a free column for the indicator (after Status if exists, otherwise after Left)
      let indicatorCol = -1;
      const statusCol = cells.findIndex(c => c === "STATUS");
      const progressCol = cells.findIndex(c => c === "PROGRESS" || c === "BAR");
      // Use the column after all known columns
      const maxKnownCol = Math.max(budgetedCol, spentCol, leftCol, statusCol, progressCol);
      indicatorCol = maxKnownCol + 1;

      // Check this column is available (not already populated with data)
      if (indicatorCol >= (rowData.length)) {
        // Column beyond current range — skip, don't extend
        continue;
      }
      // If this column already has a header, skip
      if (cells[indicatorCol] && cells[indicatorCol].length > 0) continue;

      // Inject header
      const colLetter = String.fromCharCode(65 + indicatorCol);
      const headerRowNum = r + 1;
      data.push({
        range: `'${tab.name}'!${colLetter}${headerRowNum}`,
        values: [["VS BUDGET"]],
      });

      // Inject formulas for data rows
      const formulas: (string | number | null)[][] = [];
      const budgetLetter = String.fromCharCode(65 + budgetedCol);
      const spentLetter = String.fromCharCode(65 + spentCol);

      for (let dr = r + 1; dr < tab.sampleRows.length; dr++) {
        const dataRow = tab.sampleRows[dr];
        if (!dataRow) { formulas.push([""]); continue; }
        const firstCellRaw = String(dataRow[0] ?? "").trim();
        const firstUp = firstCellRaw.toUpperCase();
        const isEmpty = dataRow.every(cell => cell === null || cell === "" || String(cell).trim() === "");
        if (isEmpty || firstUp.includes("TOTAL") || isSectionLike(firstCellRaw)) {
          formulas.push([""]); continue;
        }

        const rowNum = dr + 1;
        formulas.push([
          `=IF(${budgetLetter}${rowNum}=0,"",IF(${budgetLetter}${rowNum}-${spentLetter}${rowNum}>=0,"✅ $"&TEXT(${budgetLetter}${rowNum}-${spentLetter}${rowNum},"#,##0")&" under","❌ $"&TEXT(${spentLetter}${rowNum}-${budgetLetter}${rowNum},"#,##0")&" over"))`
        ]);
      }

      if (formulas.length > 0) {
        data.push({
          range: `'${tab.name}'!${colLetter}${r + 2}:${colLetter}${r + 1 + formulas.length}`,
          values: formulas,
        });
      }

      break; // Only process one header row per dashboard
    }
  }

  return data;
}

// ══════════════════════════════════════════════════════════════
// NICHE ICON INJECTION — Adds themed emoji icons to sections
// Makes the spreadsheet FEEL like its niche (baby = 👶🍼,
// wedding = 💍🥂, fitness = 💪🏋️, etc.)
// ══════════════════════════════════════════════════════════════

interface NicheIcons {
  title: string;       // Icon for the main title
  kpi: string[];       // Icons for KPI labels (income, spent, net, rate)
  sections: string[];  // Rotating icons for section headers
  totals: string;      // Icon for totals rows
}

function nicheIcons(niche: NicheTheme): NicheIcons {
  switch (niche) {
    case "baby":
      return {
        title: "👶",
        kpi: ["💰", "🍼", "💝", "📊"],
        sections: ["🧸", "🍼", "👶", "🎀", "🏥", "📋"],
        totals: "✨",
      };
    case "wedding":
      return {
        title: "💍",
        kpi: ["💰", "💒", "💝", "📊"],
        sections: ["💐", "🥂", "💒", "🎂", "✨", "📋"],
        totals: "💎",
      };
    case "fitness":
      return {
        title: "💪",
        kpi: ["🔥", "⚡", "🏆", "📊"],
        sections: ["🏋️", "🏃", "💪", "🥗", "📈", "📋"],
        totals: "🏆",
      };
    case "travel":
      return {
        title: "✈️",
        kpi: ["💰", "✈️", "🏖️", "📊"],
        sections: ["🌍", "🏨", "✈️", "🗺️", "🎒", "📋"],
        totals: "🌟",
      };
    case "business":
      return {
        title: "📊",
        kpi: ["💰", "📈", "💵", "📊"],
        sections: ["💼", "📊", "📈", "💳", "🏢", "📋"],
        totals: "💎",
      };
    case "debt":
      return {
        title: "🎯",
        kpi: ["💰", "💳", "🎯", "📊"],
        sections: ["💳", "🏦", "📉", "🎯", "✅", "📋"],
        totals: "🏆",
      };
    case "savings":
      return {
        title: "🏦",
        kpi: ["💰", "🏦", "📈", "📊"],
        sections: ["🎯", "💎", "🏦", "📈", "✨", "📋"],
        totals: "💎",
      };
    case "meal":
      return {
        title: "🍽️",
        kpi: ["💰", "🛒", "🍽️", "📊"],
        sections: ["🥗", "🛒", "🍳", "📅", "🥘", "📋"],
        totals: "✨",
      };
    case "student":
      return {
        title: "🎓",
        kpi: ["💰", "📚", "🎓", "📊"],
        sections: ["📚", "🎓", "✏️", "🏠", "📱", "📋"],
        totals: "⭐",
      };
    default:
      return {
        title: "📊",
        kpi: ["💰", "💳", "📈", "📊"],
        sections: ["📊", "🎯", "💳", "📂", "💡", "📋"],
        totals: "✨",
      };
  }
}

/**
 * Injects niche-themed emoji icons into existing cell values.
 * Prepends icons to section headers, KPI labels, and the title row.
 * Runs AFTER initial value population to overlay icons onto existing text.
 */
function buildNicheIconValues(
  tabs: BlueprintTab[],
  niche: NicheTheme
): sheets_v4.Schema$ValueRange[] {
  const data: sheets_v4.Schema$ValueRange[] = [];
  const icons = nicheIcons(niche);

  for (const tab of tabs) {
    const role = classifyTab(tab);
    if (role !== "dashboard") continue;

    let sectionIdx = 0;

    for (let r = 0; r < tab.sampleRows.length; r++) {
      const rowData = tab.sampleRows[r];
      if (!rowData) continue;

      const allCells = rowData.map(c => String(c ?? "").trim());
      const nonEmpty = allCells.filter(c => c.length > 0);
      const isEmpty = nonEmpty.length === 0;
      if (isEmpty) continue;

      const firstCell = allCells[0];

      // Title row: single long text, early in the sheet
      if (r === 0 && firstCell.length > 10 && nonEmpty.length <= 2) {
        // Only add icon if not already there
        if (!firstCell.match(/^[\u{1F000}-\u{1FFFF}]/u)) {
          data.push({
            range: `'${tab.name}'!A${r + 1}`,
            values: [[`${icons.title} ${firstCell}`]],
          });
        }
        continue;
      }

      // KPI label row: only in first 7 rows, must have TOTAL/NET prefix labels
      if (r < 7) {
        const kpiTerms = allCells.filter(c =>
          c.toUpperCase().includes("TOTAL INCOME") || c.toUpperCase().includes("TOTAL SPENT") ||
          c.toUpperCase().includes("NET SAVINGS") || c.toUpperCase().includes("SAVINGS RATE") ||
          c.toUpperCase().includes("TOTAL EXPENSE") || c.toUpperCase().includes("NET INCOME") ||
          c.toUpperCase().includes("MONTHLY INCOME") || c.toUpperCase().includes("BALANCE")
        );
        if (kpiTerms.length >= 2) {
          // Add icons only to KPI label cells (not data cells)
          let ki = 0;
          const newRow: (string | number | null)[] = [...rowData];
          for (let c = 0; c < rowData.length; c++) {
            const val = String(rowData[c] ?? "").trim();
            if (val.length > 3 && !val.startsWith("=") && !val.startsWith("$") && !/^\d/.test(val)) {
              const icon = icons.kpi[ki % icons.kpi.length];
              if (!val.match(/^[\u{1F000}-\u{1FFFF}]/u)) {
                newRow[c] = `${icon} ${val}`;
              }
              ki++;
            }
          }
          const maxCols = Math.max(newRow.length, 1);
          const lastCol = String.fromCharCode(64 + Math.min(maxCols, 26));
          data.push({
            range: `'${tab.name}'!A${r + 1}:${lastCol}${r + 1}`,
            values: [newRow],
          });
          continue;
        }
      }

      // Section headers: isSectionLike
      if (allCells.some(c => isSectionLike(c))) {
        const icon = icons.sections[sectionIdx % icons.sections.length];
        const raw = firstCell;
        if (!raw.match(/^[\u{1F000}-\u{1FFFF}]/u) && raw.length > 0) {
          data.push({
            range: `'${tab.name}'!A${r + 1}`,
            values: [[`${icon} ${raw}`]],
          });
        }
        sectionIdx++;
      }
    }
  }

  return data;
}

// ══════════════════════════════════════════════════════════════
// VALUE POPULATION — Raw values + formulas
// ══════════════════════════════════════════════════════════════

function buildValueData(
  tabs: BlueprintTab[]
): sheets_v4.Schema$ValueRange[] {
  const data: sheets_v4.Schema$ValueRange[] = [];

  for (const tab of tabs) {
    if (!tab.columns.length && !tab.sampleRows.length) continue;

    const role = classifyTab(tab);

    if (role === "dashboard" || role === "reference") {
      // Raw placement at A1
      const allRows = tab.sampleRows.map((row) => row.map((cell) => cell ?? ""));
      if (allRows.length > 0) {
        const maxCols = Math.max(...allRows.map((r) => r.length), 1);
        const lastCol = String.fromCharCode(64 + Math.min(maxCols, 26));
        data.push({
          range: `'${tab.name}'!A1:${lastCol}${allRows.length}`,
          values: allRows,
        });
      }
    } else if (role === "setup") {
      const allRows = tab.sampleRows.map((row) => row.map((cell) => cell ?? ""));
      if (allRows.length > 0) {
        const maxCols = Math.max(...allRows.map((r) => r.length), 1);
        const lastCol = String.fromCharCode(64 + Math.min(maxCols, 26));
        data.push({
          range: `'${tab.name}'!A1:${lastCol}${allRows.length}`,
          values: allRows,
        });
      }
    } else {
      // Data/summary tabs: Row 1=title, Row 2=spacer, Row 3=headers, Row 4+=data
      const headers = tab.columns.map((c) => c.name);
      const titleRow = [tab.name.toUpperCase()];
      const spacerRow = [""];
      const allRows: (string | number | null)[][] = [titleRow, spacerRow, headers];
      for (const row of tab.sampleRows) {
        allRows.push(row.map((cell) => cell ?? ""));
      }
      const maxCols = Math.max(tab.columns.length, 1);
      const lastCol = String.fromCharCode(64 + Math.min(maxCols, 26));
      data.push({
        range: `'${tab.name}'!A1:${lastCol}${allRows.length}`,
        values: allRows,
      });
    }
  }

  return data;
}

// ══════════════════════════════════════════════════════════════
// SPARKLINE PROGRESS BARS — Visual bar charts inside cells
// Google Sheets SPARKLINE function renders inline bar charts.
// We inject formulas for any "Progress", "Bar", "%" columns.
// ══════════════════════════════════════════════════════════════

function buildSparklineValues(
  tabs: BlueprintTab[],
  C: PremiumPalette
): sheets_v4.Schema$ValueRange[] {
  const data: sheets_v4.Schema$ValueRange[] = [];

  for (const tab of tabs) {
    const role = classifyTab(tab);
    if (role === "reference" || role === "setup") continue;

    // For dashboard tabs: look for progress/bar columns in sampleRows
    if (role === "dashboard") {
      // Find the header row (first row after KPI section with 3+ text cells)
      let headerRowIdx = -1;
      for (let r = 0; r < Math.min(tab.sampleRows.length, 15); r++) {
        const rowData = tab.sampleRows[r];
        if (!rowData) continue;
        const texts = rowData.map(c => String(c ?? "").trim()).filter(c =>
          c.length > 0 && !/^\d/.test(c) && !c.startsWith("=") && !c.startsWith("$")
        );
        if (texts.length >= 3) {
          // Check if this row has progress/bar related headers
          const hasProgress = rowData.some(c => {
            const h = String(c ?? "").trim().toUpperCase();
            return h === "PROGRESS" || h === "BAR" || h === "STATUS BAR" || h === "% BAR";
          });
          if (hasProgress) { headerRowIdx = r; break; }
        }
      }

      if (headerRowIdx >= 0) {
        const headers = tab.sampleRows[headerRowIdx]!;
        // Find the progress bar column and its source column (the percent value)
        for (let c = 0; c < headers.length; c++) {
          const h = String(headers[c] ?? "").trim().toUpperCase();
          if (h === "PROGRESS" || h === "BAR" || h === "STATUS BAR" || h === "% BAR") {
            // Find the source: prefer NEAREST Saved/Target pair to Progress column
            let srcCol = -1;
            let savedCol = -1, targetCol = -1;
            // Search outward from the Progress column to find the closest matches
            const candidates: { saved: number; target: number; dist: number }[] = [];
            const savedCols: number[] = [];
            const targetCols: number[] = [];
            for (let sc = 0; sc < headers.length; sc++) {
              if (sc === c) continue;
              const sh = String(headers[sc] ?? "").trim().toUpperCase();
              if (sh.includes("SAVED") || sh.includes("ACTUAL")) savedCols.push(sc);
              if (sh === "TARGET" || sh.includes("TARGET") || sh === "GOAL" || sh.includes("$ GOAL")) targetCols.push(sc);
              if (sh.includes("%") || sh.includes("RATE")) srcCol = sc;
            }
            // Pick the Saved/Target pair closest to the Progress column
            for (const sv of savedCols) {
              for (const tg of targetCols) {
                const dist = Math.abs(sv - c) + Math.abs(tg - c);
                candidates.push({ saved: sv, target: tg, dist });
              }
            }
            if (candidates.length > 0) {
              candidates.sort((a, b) => a.dist - b.dist);
              savedCol = candidates[0].saved;
              targetCol = candidates[0].target;
            }

            // Generate sparkline formulas for data rows after header
            const sparklines: (string | number | null)[][] = [];
            for (let r = headerRowIdx + 1; r < tab.sampleRows.length; r++) {
              const rowData = tab.sampleRows[r];
              if (!rowData) { sparklines.push([""]); continue; }
              // Skip empty/section/total rows
              const firstCellRaw = String(rowData[0] ?? "").trim();
              const firstCellUp = firstCellRaw.toUpperCase();
              const isEmpty = rowData.every(cell => cell === null || cell === "" || String(cell).trim() === "");
              if (isEmpty || firstCellUp.includes("TOTAL") || isSectionLike(firstCellRaw)) {
                sparklines.push([""]); continue;
              }

              const rowNum = r + 1; // 1-indexed for A1 notation

              if (savedCol >= 0 && targetCol >= 0) {
                // Reactive: Saved/Target ratio sparkline
                const savLetter = String.fromCharCode(65 + savedCol);
                const tgtLetter = String.fromCharCode(65 + targetCol);
                sparklines.push([
                  `=IF(${tgtLetter}${rowNum}>0,SPARKLINE(${savLetter}${rowNum}/${tgtLetter}${rowNum},{"charttype","bar";"max",1;"color1","${C.catAccentHexes[0]}";"color2","${C.altRowHex}"}),"")`
                ]);
              } else if (srcCol >= 0) {
                const srcLetter = String.fromCharCode(65 + srcCol);
                sparklines.push([
                  `=SPARKLINE(${srcLetter}${rowNum},{"charttype","bar";"max",1;"color1","${C.catAccentHexes[0]}";"color2","${C.altRowHex}"})`
                ]);
              } else {
                // Use the value directly if it's numeric
                const val = rowData[c];
                const numVal = typeof val === "number" ? val : parseFloat(String(val));
                if (!isNaN(numVal)) {
                  sparklines.push([
                    `=SPARKLINE(${numVal},{"charttype","bar";"max",1;"color1","${C.catAccentHexes[0]}";"color2","${C.altRowHex}"})`
                  ]);
                } else {
                  sparklines.push([""]);
                }
              }
            }

            if (sparklines.length > 0) {
              const colLetter = String.fromCharCode(65 + c);
              const startRow = headerRowIdx + 2; // 1-indexed
              data.push({
                range: `'${tab.name}'!${colLetter}${startRow}:${colLetter}${startRow + sparklines.length - 1}`,
                values: sparklines,
              });
            }
          }
        }
      }
    }

    // For data tabs: check column definitions for percent type → sparkline bar
    if (role === "data" || role === "summary") {
      for (let c = 0; c < tab.columns.length; c++) {
        const col = tab.columns[c];
        const nameUp = col.name.toUpperCase();
        // Only inject sparklines on columns explicitly named "Progress Bar" or "Bar"
        if (nameUp !== "PROGRESS BAR" && nameUp !== "BAR" && nameUp !== "STATUS BAR") continue;

        // Find a source percent column
        let srcCol = -1;
        for (let sc = 0; sc < tab.columns.length; sc++) {
          if (sc === c) continue;
          const sn = tab.columns[sc].name.toUpperCase();
          if (tab.columns[sc].type === "percent" || sn.includes("PROGRESS") || sn.includes("%")) {
            srcCol = sc; break;
          }
        }

        const sparklines: (string | number | null)[][] = [];
        for (let r = 0; r < tab.sampleRows.length; r++) {
          if (srcCol >= 0) {
            const srcLetter = String.fromCharCode(65 + srcCol);
            const rowNum = r + 4; // data tabs: row 1=title, 2=spacer, 3=headers, 4+=data
            sparklines.push([
              `=SPARKLINE(${srcLetter}${rowNum},{"charttype","bar";"max",1;"color1","${C.catAccentHexes[0]}";"color2","${C.altRowHex}"})`
            ]);
          } else {
            sparklines.push([""]);
          }
        }

        if (sparklines.length > 0) {
          const colLetter = String.fromCharCode(65 + c);
          data.push({
            range: `'${tab.name}'!${colLetter}4:${colLetter}${3 + sparklines.length}`,
            values: sparklines,
          });
        }
      }
    }
  }

  return data;
}

// ══════════════════════════════════════════════════════════════
// STATUS INDICATOR FORMULAS — ✅ On Track / ⚠️ Watch / ❌ Behind
// Injects formulas into Status columns that reference a % column
// ══════════════════════════════════════════════════════════════

function buildStatusFormulas(
  tabs: BlueprintTab[]
): sheets_v4.Schema$ValueRange[] {
  const data: sheets_v4.Schema$ValueRange[] = [];

  for (const tab of tabs) {
    const role = classifyTab(tab);

    if (role === "dashboard") {
      // Find header row in dashboard
      let headerRowIdx = -1;
      for (let r = 0; r < Math.min(tab.sampleRows.length, 15); r++) {
        const rowData = tab.sampleRows[r];
        if (!rowData) continue;
        const texts = rowData.map(c => String(c ?? "").trim()).filter(c =>
          c.length > 0 && !/^\d/.test(c) && !c.startsWith("=") && !c.startsWith("$")
        );
        if (texts.length >= 3) {
          const hasStatus = rowData.some(c => {
            const h = String(c ?? "").trim().toUpperCase();
            return h === "STATUS";
          });
          if (hasStatus) { headerRowIdx = r; break; }
        }
      }

      if (headerRowIdx >= 0) {
        const headers = tab.sampleRows[headerRowIdx]!;
        for (let c = 0; c < headers.length; c++) {
          const h = String(headers[c] ?? "").trim().toUpperCase();
          if (h !== "STATUS") continue;

          // PRIORITY 1: Look for NEAREST Saved/Target or Spent/Budgeted column pairs
          // This is preferred because "Progress" columns often contain SPARKLINE formulas
          let savedCol = -1, targetCol = -1;
          {
            const savedCandidates: number[] = [];
            const targetCandidates: number[] = [];
            for (let sc = 0; sc < headers.length; sc++) {
              if (sc === c) continue;
              const sh = String(headers[sc] ?? "").trim().toUpperCase();
              if (sh.includes("SAVED") || sh.includes("ACTUAL") || sh.includes("SPENT")) savedCandidates.push(sc);
              if (sh.includes("TARGET") || sh.includes("GOAL") || sh.includes("BUDGETED")) targetCandidates.push(sc);
            }
            // Pick the pair closest to the Status column
            let bestDist = Infinity;
            for (const sv of savedCandidates) {
              for (const tg of targetCandidates) {
                const dist = Math.abs(sv - c) + Math.abs(tg - c);
                if (dist < bestDist) {
                  bestDist = dist;
                  savedCol = sv;
                  targetCol = tg;
                }
              }
            }
          }

          // PRIORITY 2: Only use a percent source column if no Saved/Target pair found
          // Skip columns named exactly "PROGRESS" or "BAR" (sparkline columns)
          let srcCol = -1;
          if (savedCol < 0 || targetCol < 0) {
            for (let sc = 0; sc < headers.length; sc++) {
              if (sc === c) continue;
              const sh = String(headers[sc] ?? "").trim().toUpperCase();
              // Skip sparkline columns
              if (sh === "PROGRESS" || sh === "BAR" || sh === "STATUS BAR" || sh === "% BAR") continue;
              if (sh.includes("%") || sh.includes("RATE")) {
                srcCol = sc; break;
              }
            }
          }

          const formulas: (string | number | null)[][] = [];
          for (let r = headerRowIdx + 1; r < tab.sampleRows.length; r++) {
            const rowData = tab.sampleRows[r];
            if (!rowData) { formulas.push([""]); continue; }
            const isEmpty = rowData.every(cell => cell === null || cell === "" || String(cell).trim() === "");
            if (isEmpty) { formulas.push([""]); continue; }

            const rowNum = r + 1; // 1-indexed

            if (savedCol >= 0 && targetCol >= 0) {
              const savLetter = String.fromCharCode(65 + savedCol);
              const tgtLetter = String.fromCharCode(65 + targetCol);
              formulas.push([
                `=IF(${tgtLetter}${rowNum}=0,"",IF(${savLetter}${rowNum}/${tgtLetter}${rowNum}>=0.75,"✅ On Track",IF(${savLetter}${rowNum}/${tgtLetter}${rowNum}>=0.4,"⚠️ Watch","❌ Behind")))`
              ]);
            } else if (srcCol >= 0) {
              const srcLetter = String.fromCharCode(65 + srcCol);
              formulas.push([
                `=IF(${srcLetter}${rowNum}="","",IF(${srcLetter}${rowNum}>=0.75,"✅ On Track",IF(${srcLetter}${rowNum}>=0.4,"⚠️ Watch","❌ Behind")))`
              ]);
            } else {
              formulas.push([""]);
            }
          }

          if (formulas.length > 0) {
            const colLetter = String.fromCharCode(65 + c);
            const startRow = headerRowIdx + 2;
            data.push({
              range: `'${tab.name}'!${colLetter}${startRow}:${colLetter}${startRow + formulas.length - 1}`,
              values: formulas,
            });
          }
        }
      }
    }

    // For data/summary tabs, check column names
    if (role === "data" || role === "summary") {
      for (let c = 0; c < tab.columns.length; c++) {
        const col = tab.columns[c];
        if (col.name.toUpperCase() !== "STATUS") continue;

        // Find source percent column
        let srcCol = -1;
        for (let sc = 0; sc < tab.columns.length; sc++) {
          if (sc === c) continue;
          if (tab.columns[sc].type === "percent" || tab.columns[sc].name.toUpperCase().includes("PROGRESS")) {
            srcCol = sc; break;
          }
        }
        let savedCol = -1, targetCol = -1;
        if (srcCol < 0) {
          for (let sc = 0; sc < tab.columns.length; sc++) {
            const sn = tab.columns[sc].name.toUpperCase();
            if (sn.includes("SAVED") || sn.includes("ACTUAL") || sn.includes("SPENT")) savedCol = sc;
            if (sn.includes("TARGET") || sn.includes("GOAL") || sn.includes("BUDGET")) targetCol = sc;
          }
        }

        const formulas: (string | number | null)[][] = [];
        for (let r = 0; r < tab.sampleRows.length; r++) {
          const rowNum = r + 4; // data tabs: row 4 = first data row
          if (srcCol >= 0) {
            const srcLetter = String.fromCharCode(65 + srcCol);
            formulas.push([
              `=IF(${srcLetter}${rowNum}="","",IF(${srcLetter}${rowNum}>=0.75,"✅ On Track",IF(${srcLetter}${rowNum}>=0.4,"⚠️ Watch","❌ Behind")))`
            ]);
          } else if (savedCol >= 0 && targetCol >= 0) {
            const savLetter = String.fromCharCode(65 + savedCol);
            const tgtLetter = String.fromCharCode(65 + targetCol);
            formulas.push([
              `=IF(${tgtLetter}${rowNum}=0,"",IF(${savLetter}${rowNum}/${tgtLetter}${rowNum}>=0.75,"✅ On Track",IF(${savLetter}${rowNum}/${tgtLetter}${rowNum}>=0.4,"⚠️ Watch","❌ Behind")))`
            ]);
          } else {
            formulas.push([""]);
          }
        }

        if (formulas.length > 0) {
          const colLetter = String.fromCharCode(65 + c);
          data.push({
            range: `'${tab.name}'!${colLetter}4:${colLetter}${3 + formulas.length}`,
            values: formulas,
          });
        }
      }
    }
  }

  return data;
}

// ══════════════════════════════════════════════════════════════
// MAIN EXPORT: Build a Premium Google Sheet
// ══════════════════════════════════════════════════════════════

export interface GoogleSheetResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  tabCount: number;
  success: boolean;
  error?: string;
}

/**
 * Creates a premium dark-themed native Google Sheet from a ProductBlueprint.
 *
 * Uses the Google Sheets API v4 directly (not GWS CLI).
 * Produces the same premium quality as the build-pyf-tracker + design-pass scripts:
 * - Hidden gridlines, dark backgrounds
 * - Elevated KPI cards with 28pt colored numbers
 * - Section headers with accent colors
 * - Alternating card-style rows with divider-only borders
 * - Professional charts with dark card backgrounds
 * - Banded rows on data tabs
 *
 * Works with ANY ProductBlueprint — not hardcoded to a single niche.
 */
export async function buildGoogleSheet(
  blueprint: ProductBlueprint
): Promise<GoogleSheetResult> {
  if (!isGoogleAuthConfigured()) {
    return {
      spreadsheetId: "",
      spreadsheetUrl: "",
      title: "",
      tabCount: 0,
      success: false,
      error: "Google OAuth not configured. Run 'node scripts/gws-oauth-helper.mjs' first.",
    };
  }

  const { sheets } = await getGoogleApis();
  const C = buildPalette(blueprint);

  const title =
    blueprint.listingStrategy?.titleKeywords?.join(" ") ||
    blueprint.sourceListingTitle ||
    "Untitled Product";

  try {
    // ── Step 1: Create spreadsheet with all tabs ──────────────
    console.log("[GoogleSheetsBuilder] Creating spreadsheet...");

    const sheetDefs: sheets_v4.Schema$Sheet[] = blueprint.tabs.map((tab, i) => {
      const role = classifyTab(tab);
      const maxCols = Math.max(tab.columns.length, role === "dashboard" ? 12 : 8);
      const maxRows = Math.max(
        tab.sampleRows.length + 10,
        role === "dashboard" ? 50 : 30
      );

      return {
        properties: {
          sheetId: i,
          title: tab.name,
          hidden: role === "reference",
          tabColorStyle: { rgbColor: C.navy },
          gridProperties: {
            rowCount: maxRows,
            columnCount: maxCols,
            frozenRowCount: role === "dashboard" ? 3 : role === "data" || role === "summary" ? 1 : 0,
          },
        },
      };
    });

    const { data: ss } = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title,
          locale: "en_US",
          defaultFormat: {
            textFormat: { fontFamily: "Inter", fontSize: 10 },
          },
        },
        sheets: sheetDefs,
      },
    });

    const spreadsheetId = ss.spreadsheetId!;
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    console.log(`[GoogleSheetsBuilder] Created: ${spreadsheetUrl}`);

    // ── Step 2: Populate all values + formulas ────────────────
    console.log("[GoogleSheetsBuilder] Populating values...");
    const valueData = buildValueData(blueprint.tabs);
    if (valueData.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: valueData,
        },
      });
    }

    // ── Step 2a: Inject niche-themed emoji icons ──────────────
    const niche = detectNiche(blueprint);
    console.log(`[GoogleSheetsBuilder] Injecting niche icons for "${niche}"...`);
    const iconData = buildNicheIconValues(blueprint.tabs, niche);
    if (iconData.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: iconData,
        },
      });
      console.log(`[GoogleSheetsBuilder] Injected ${iconData.length} icon ranges`);
    }

    // ── Step 2b: Inject SPARKLINE progress bars ────────────────
    console.log("[GoogleSheetsBuilder] Injecting sparkline progress bars...");
    const sparklineData = buildSparklineValues(blueprint.tabs, C);
    if (sparklineData.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: sparklineData,
        },
      });
      console.log(`[GoogleSheetsBuilder] Injected ${sparklineData.length} sparkline ranges`);
    }

    // ── Step 2c: Inject status indicator formulas ────────────
    console.log("[GoogleSheetsBuilder] Injecting status indicators...");
    const statusData = buildStatusFormulas(blueprint.tabs);
    if (statusData.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: statusData,
        },
      });
      console.log(`[GoogleSheetsBuilder] Injected ${statusData.length} status formula ranges`);
    }

    // ── Step 2d: Inject Budget Status banner ─────────────────
    console.log("[GoogleSheetsBuilder] Injecting budget status banner...");
    const budgetStatusData = buildBudgetStatusValues(blueprint.tabs, C);
    if (budgetStatusData.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: budgetStatusData,
        },
      });
      console.log(`[GoogleSheetsBuilder] Injected budget status banner`);
    }

    // ── Step 2e: Inject Over/Under Budget indicators ─────────
    console.log("[GoogleSheetsBuilder] Injecting over/under budget indicators...");
    const overUnderData = buildOverUnderBudgetValues(blueprint.tabs, C);
    if (overUnderData.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: overUnderData,
        },
      });
      console.log(`[GoogleSheetsBuilder] Injected ${overUnderData.length} over/under budget ranges`);
    }

    // ── Step 3: Apply premium formatting per tab ──────────────
    console.log("[GoogleSheetsBuilder] Applying premium dark-theme formatting...");
    const allRequests: sheets_v4.Schema$Request[] = [];

    for (let i = 0; i < blueprint.tabs.length; i++) {
      const tab = blueprint.tabs[i];
      const role = classifyTab(tab);

      switch (role) {
        case "dashboard":
          allRequests.push(...formatDashboard(i, tab, C));
          allRequests.push(...buildBudgetStatusFormatting(i, tab, C));
          break;
        case "data":
          allRequests.push(...formatDataTab(i, tab, C));
          break;
        case "summary":
          allRequests.push(...formatSummaryTab(i, tab, C));
          break;
        case "setup":
          allRequests.push(...formatSetupTab(i, tab, C));
          break;
        case "reference":
          // Hidden tab — minimal formatting
          break;
      }
    }

    // ── Step 4: Charts ────────────────────────────────────────
    const chartReqs = buildChartRequests(blueprint.charts, blueprint.tabs, C);
    if (chartReqs.length > 0) {
      console.log(`[GoogleSheetsBuilder] Adding ${chartReqs.length} charts from blueprint...`);
      allRequests.push(...chartReqs);
    } else {
      // Auto-generate charts for dashboards when blueprint charts are missing/invalid
      console.log("[GoogleSheetsBuilder] No valid blueprint charts, auto-generating...");
      allRequests.push(...autoGenerateCharts(blueprint.tabs, C));
    }

    // ── Step 5: Conditional formatting ────────────────────────
    allRequests.push(...buildConditionalFormatRequests(blueprint.tabs, C));

    // ── Step 6: Data validation ──────────────────────────────
    allRequests.push(...buildValidationRequests(blueprint.tabs));

    // Execute all formatting in batches
    if (allRequests.length > 0) {
      const BATCH_SIZE = 500;
      for (let i = 0; i < allRequests.length; i += BATCH_SIZE) {
        const batch = allRequests.slice(i, i + BATCH_SIZE);
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: batch },
        });
      }
    }

    console.log(
      `[GoogleSheetsBuilder] Done! ${allRequests.length} requests across ${blueprint.tabs.length} tabs.`
    );

    return {
      spreadsheetId,
      spreadsheetUrl,
      title,
      tabCount: blueprint.tabs.length,
      success: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google Sheets build failed";
    console.error("[GoogleSheetsBuilder] Error:", message);
    if (err && typeof err === "object" && "response" in err) {
      const resp = (err as { response?: { data?: { error?: unknown } } }).response;
      if (resp?.data?.error) {
        console.error("[GoogleSheetsBuilder] API Error:", JSON.stringify(resp.data.error, null, 2));
      }
    }
    return {
      spreadsheetId: "",
      spreadsheetUrl: "",
      title,
      tabCount: blueprint.tabs.length,
      success: false,
      error: message,
    };
  }
}

/**
 * Check if the Google Sheets builder is available (auth configured).
 */
export function isGoogleSheetsBuilderAvailable(): boolean {
  return isGoogleAuthConfigured();
}
