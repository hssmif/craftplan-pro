// ══════════════════════════════════════════════════════════════
// Digital Config Inference Engine
// Maps Etsy listing data (title, tags, description, price)
// to a best-guess DigitalProductConfig using keyword heuristics.
//
// Used by the import API to prefill Step 2 (Configure) so
// imported projects are immediately actionable.
// ══════════════════════════════════════════════════════════════

import type {
  DigitalProductType,
  DigitalProductConfig,
  NotionConfig,
  PdfConfig,
  ExcelConfig,
  PrintableConfig,
} from "@/types/digital-product";

// ── Shared Helpers ───────────────────────────────────────────

/** Combine all text signals into one lowercase corpus for matching */
function buildCorpus(title: string, tags: string[], description?: string): string {
  return [title, ...tags, description || ""].join(" ").toLowerCase();
}

interface MatchRule<T> {
  keywords: string[];
  value: T;
}

/** Returns the first matching value from keyword rules, or fallback */
function firstMatch<T>(corpus: string, rules: MatchRule<T>[], fallback: T): T {
  for (const rule of rules) {
    for (const kw of rule.keywords) {
      if (corpus.includes(kw.toLowerCase())) {
        return rule.value;
      }
    }
  }
  return fallback;
}

// ── Shared Color Rules (PDF, Excel, Printable) ──────────────

const COLOR_RULES: MatchRule<string>[] = [
  { keywords: ["sage", "green", "olive", "forest", "mint", "emerald"], value: "sage-green" },
  { keywords: ["dusty rose", "rose", "pink", "blush", "mauve"], value: "dusty-rose" },
  { keywords: ["navy", "gold", "dark blue", "royal", "elegant"], value: "navy-gold" },
  { keywords: ["minimal", "minimalist", "black", "monochrome", "b&w", "black and white"], value: "minimal-black" },
  { keywords: ["ocean", "blue", "aqua", "teal", "coastal", "sea"], value: "ocean" },
  { keywords: ["lavender", "purple", "lilac", "violet"], value: "lavender" },
  { keywords: ["terracotta", "rust", "clay", "burnt orange", "warm", "earth", "earthy"], value: "terracotta" },
];

// ── Notion Inference ─────────────────────────────────────────

const NOTION_TEMPLATE_RULES: MatchRule<string>[] = [
  { keywords: ["life os", "life operating system", "ultimate life", "everything planner", "complete life", "life ultra"], value: "life_os" },
  { keywords: ["finance", "budget", "money", "expense", "income", "debt", "savings", "investment"], value: "finance_tracker" },
  { keywords: ["adhd", "neurodivergent", "focus", "executive function", "brain dump"], value: "adhd_planner" },
  { keywords: ["life planner", "all-in-one", "all in one", "life dashboard", "personal hub", "second brain", "productivity system"], value: "life_planner" },
  { keywords: ["social media", "content calendar", "content planner", "instagram", "tiktok", "posting schedule"], value: "social_media_planner" },
  { keywords: ["habit", "routine", "daily habits", "streak", "self-improvement"], value: "habit_tracker" },
  { keywords: ["reading", "book", "reading log", "book tracker", "bookshelf", "tbr"], value: "reading_log" },
];

const NOTION_AESTHETIC_RULES: MatchRule<string>[] = [
  { keywords: ["minimal", "minimalist", "clean", "simple", "white"], value: "minimal" },
  { keywords: ["brown", "warm", "beige", "neutral", "earthy", "coffee", "latte"], value: "brown" },
  { keywords: ["pink", "soft", "pastel", "blush", "feminine", "girly", "cute"], value: "pink" },
  { keywords: ["dark", "dark mode", "night", "moody", "black"], value: "dark" },
  { keywords: ["colorful", "vibrant", "rainbow", "bright", "bold", "pop"], value: "colorful" },
];

function inferNotionConfig(corpus: string, price?: number): NotionConfig {
  const templateType = firstMatch(corpus, NOTION_TEMPLATE_RULES, "life_planner");
  const aesthetic = firstMatch(corpus, NOTION_AESTHETIC_RULES, "minimal");

  // Complexity: price + keyword signals
  const advancedKeywords = ["advanced", "comprehensive", "complete", "ultimate", "all-in-one", "all in one", "pro"];
  const mediumKeywords = ["detailed", "full", "premium"];

  let complexity: "simple" | "medium" | "advanced" = "simple";
  if ((price && price >= 15) || advancedKeywords.some((kw) => corpus.includes(kw))) {
    complexity = "advanced";
  } else if ((price && price >= 8) || mediumKeywords.some((kw) => corpus.includes(kw))) {
    complexity = "medium";
  }

  // Premium: price + keyword signals
  const premiumKeywords = ["premium", "pro", "ultra", "professional", "enterprise"];
  const premium = (price !== undefined && price >= 20) || premiumKeywords.some((kw) => corpus.includes(kw));

  return {
    type: "notion",
    templateType,
    aesthetic,
    complexity,
    premium,
    // notionToken and parentPageId intentionally omitted — user must provide
  };
}

// ── PDF Inference ────────────────────────────────────────────

const PDF_PLANNER_RULES: MatchRule<string>[] = [
  { keywords: ["daily planner", "daily schedule", "day planner", "today"], value: "daily" },
  { keywords: ["weekly planner", "week planner", "weekly schedule", "weekly layout"], value: "weekly" },
  { keywords: ["monthly planner", "month planner", "monthly calendar", "monthly overview"], value: "monthly" },
  { keywords: ["budget planner", "budget", "finance planner", "money planner"], value: "budget" },
  { keywords: ["fitness planner", "fitness", "workout planner", "gym planner", "exercise"], value: "fitness" },
  { keywords: ["self care", "self-care", "wellness planner", "mindfulness", "gratitude planner", "mental health"], value: "self_care" },
  { keywords: ["business planner", "business", "entrepreneur", "startup planner", "project planner"], value: "business" },
  { keywords: ["student planner", "student", "academic planner", "school planner", "college", "university", "study"], value: "student" },
];

function inferPdfConfig(corpus: string): PdfConfig {
  const plannerType = firstMatch(corpus, PDF_PLANNER_RULES, "weekly");
  const colorTheme = firstMatch(corpus, COLOR_RULES, "sage-green");

  // Paper size
  let paperSize: "letter" | "a4" | "a5" = "letter";
  if (corpus.includes("a4") || corpus.includes("international")) {
    paperSize = "a4";
  } else if (corpus.includes("a5") || corpus.includes("half size") || corpus.includes("compact")) {
    paperSize = "a5";
  }

  return {
    type: "pdf",
    plannerType,
    colorTheme,
    paperSize,
    year: new Date().getFullYear(),
  };
}

// ── Excel Inference ──────────────────────────────────────────

const EXCEL_TRACKER_RULES: MatchRule<string>[] = [
  { keywords: ["budget", "expense", "finance", "money", "income", "debt", "savings"], value: "budget" },
  { keywords: ["habit", "routine", "daily tracker", "streak"], value: "habit" },
  { keywords: ["fitness", "workout", "gym", "exercise", "weight", "health"], value: "fitness" },
  { keywords: ["business", "revenue", "inventory", "sales", "profit", "freelance", "invoice"], value: "business" },
  { keywords: ["meal", "food", "recipe", "grocery", "nutrition", "diet", "calorie"], value: "meal_planner" },
  { keywords: ["project", "timeline", "gantt", "task", "roadmap", "sprint"], value: "project" },
];

function inferExcelConfig(corpus: string): ExcelConfig {
  return {
    type: "excel",
    trackerType: firstMatch(corpus, EXCEL_TRACKER_RULES, "budget"),
    colorScheme: firstMatch(corpus, COLOR_RULES, "sage-green"),
  };
}

// ── Printable Inference ──────────────────────────────────────

const PRINTABLE_TYPE_RULES: MatchRule<string>[] = [
  { keywords: ["quote", "affirmation", "inspirational", "motivational", "wall art", "poster"], value: "quote_prints" },
  { keywords: ["habit tracker", "habit"], value: "habit_tracker" },
  { keywords: ["gratitude", "gratitude journal", "thankful", "grateful"], value: "gratitude_journal" },
  { keywords: ["goal", "goal worksheet", "goal setting", "goal planner", "vision board"], value: "goal_worksheet" },
  { keywords: ["meal", "meal planner", "food", "grocery", "menu"], value: "meal_planner" },
  { keywords: ["budget", "budget worksheet", "finance", "expense"], value: "budget_worksheet" },
];

function inferPrintableConfig(corpus: string): PrintableConfig {
  const printableType = firstMatch(corpus, PRINTABLE_TYPE_RULES, "quote_prints");

  // Quote theme (only for quote_prints)
  let quoteTheme: string | undefined;
  if (printableType === "quote_prints") {
    const themeRules: MatchRule<string>[] = [
      { keywords: ["motivational", "hustle", "boss", "success", "grind"], value: "motivation" },
      { keywords: ["love", "relationship", "family", "heart"], value: "love" },
      { keywords: ["nature", "outdoor", "peaceful", "calm", "zen"], value: "nature" },
      { keywords: ["funny", "humor", "sarcastic", "witty"], value: "humor" },
    ];
    quoteTheme = firstMatch(corpus, themeRules, undefined as unknown as string) || undefined;
  }

  return {
    type: "printable",
    printableType,
    colorScheme: firstMatch(corpus, COLOR_RULES, "sage-green"),
    quoteTheme,
  };
}

// ── Main Export ───────────────────────────────────────────────

/**
 * Infer a best-guess product config from Etsy listing data.
 * Uses keyword heuristics against title + tags + description.
 * Every field has a sensible fallback (most popular on Etsy).
 */
export function inferDigitalConfig(
  productType: DigitalProductType,
  title: string,
  tags: string[],
  description?: string,
  price?: number
): DigitalProductConfig {
  const corpus = buildCorpus(title, tags, description);

  switch (productType) {
    case "notion":
      return inferNotionConfig(corpus, price);
    case "pdf":
      return inferPdfConfig(corpus);
    case "excel":
      return inferExcelConfig(corpus);
    case "printable":
      return inferPrintableConfig(corpus);
    default:
      // Fallback to PDF config
      return inferPdfConfig(corpus);
  }
}
