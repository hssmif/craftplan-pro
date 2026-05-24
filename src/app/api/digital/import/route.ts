// ══════════════════════════════════════════════════════════════
// Digital Product Studio: Import Bridge
// Accepts Etsy listing data from the Chrome extension,
// infers digital product type via heuristics, creates a
// DigitalProduct with prefilled discovery, and returns projectId.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { saveDigitalProject } from "@/lib/db";
import type {
  DigitalProductType,
  ImportSource,
} from "@/types/digital-product";
import { inferDigitalConfig } from "@/lib/digital-config-inference";

// ── Product Type Suggestion Heuristics ──────────────────────

const DIGITAL_TYPE_PATTERNS: Array<{
  type: DigitalProductType;
  keywords: string[];
  weight: number;
}> = [
  // Notion templates — high specificity
  {
    type: "notion",
    keywords: [
      "notion", "dashboard", "workspace", "system", "database",
      "notion template", "notion planner", "notion tracker",
      "second brain", "life os", "productivity system",
    ],
    weight: 3,
  },
  // Excel trackers
  {
    type: "excel",
    keywords: [
      "excel", "spreadsheet", "google sheets", "xlsx", "xls",
      "budget tracker", "expense tracker", "financial tracker",
      "inventory tracker", "business tracker", "debt tracker",
      "savings tracker", "investment tracker",
    ],
    weight: 3,
  },
  // PDF planners
  {
    type: "pdf",
    keywords: [
      "pdf", "planner", "calendar", "schedule", "agenda",
      "weekly planner", "monthly planner", "daily planner",
      "yearly planner", "academic planner", "student planner",
      "undated planner", "dated planner", "digital planner",
      "goodnotes", "ipad planner", "hyperlinked",
    ],
    weight: 2,
  },
  // Printables
  {
    type: "printable",
    keywords: [
      "printable", "print", "wall art", "poster", "quote",
      "worksheet", "checklist", "coloring", "flash cards",
      "greeting card", "invitation", "stationery", "label",
      "sticker sheet", "planner inserts", "journal page",
      "gratitude journal", "goal worksheet", "habit tracker",
      "meal planner printable", "budget worksheet",
    ],
    weight: 2,
  },
];

// Additional context-based scoring
const CONTEXT_HINTS: Array<{
  type: DigitalProductType;
  patterns: RegExp[];
  bonus: number;
}> = [
  {
    type: "notion",
    patterns: [
      /\bnotion\b/i,
      /\btemplate\b.*\b(system|dashboard|workspace)\b/i,
      /\b(life|productivity|project)\s+(os|system|hub)\b/i,
    ],
    bonus: 5,
  },
  {
    type: "excel",
    patterns: [
      /\b(excel|spreadsheet|google\s*sheets?)\b/i,
      /\b(budget|expense|finance|debt|savings)\s+(tracker|spreadsheet)\b/i,
    ],
    bonus: 5,
  },
  {
    type: "pdf",
    patterns: [
      /\b(digital|pdf|goodnotes|ipad)\s+planner\b/i,
      /\bhyperlinked\b/i,
      /\b(weekly|daily|monthly|yearly)\s+planner\b/i,
    ],
    bonus: 5,
  },
  {
    type: "printable",
    patterns: [
      /\bprintable\b/i,
      /\bwall\s+art\b/i,
      /\b(quote|art)\s+print/i,
      /\binstant\s+download\b.*\b(print|poster|card)\b/i,
    ],
    bonus: 5,
  },
];

function suggestProductType(
  title: string,
  tags: string[],
  description?: string
): { type: DigitalProductType; confidence: number } {
  const scores: Record<DigitalProductType, number> = {
    notion: 0,
    pdf: 0,
    excel: 0,
    printable: 0,
  };

  const combinedText = [title, ...tags, description || ""]
    .join(" ")
    .toLowerCase();

  // Keyword matching
  for (const rule of DIGITAL_TYPE_PATTERNS) {
    for (const kw of rule.keywords) {
      if (combinedText.includes(kw.toLowerCase())) {
        scores[rule.type] += rule.weight;
      }
    }
  }

  // Regex context hints
  for (const hint of CONTEXT_HINTS) {
    for (const pattern of hint.patterns) {
      if (pattern.test(combinedText)) {
        scores[hint.type] += hint.bonus;
      }
    }
  }

  // Find best match
  const entries = Object.entries(scores) as [DigitalProductType, number][];
  entries.sort((a, b) => b[1] - a[1]);

  const [bestType, bestScore] = entries[0];
  const totalScore = entries.reduce((sum, [, s]) => sum + s, 0);

  // Confidence: how dominant is the top choice
  const confidence = totalScore > 0
    ? Math.round((bestScore / totalScore) * 100)
    : 0;

  // Default to PDF if no clear signal
  if (bestScore === 0) {
    return { type: "pdf", confidence: 0 };
  }

  return { type: bestType, confidence };
}

// ── Niche extraction from title/tags ────────────────────────

function extractNiche(title: string, tags: string[]): string {
  const nicheKeywords = [
    "productivity", "wellness", "fitness", "health", "finance",
    "budget", "self-care", "business", "student", "teacher",
    "mom", "wedding", "travel", "meal", "recipe", "reading",
    "adhd", "mental health", "mindfulness", "minimalist",
    "aesthetic", "boho", "modern", "vintage", "retro",
  ];

  const text = [title, ...tags].join(" ").toLowerCase();
  const found = nicheKeywords.filter((kw) => text.includes(kw));
  return found.slice(0, 3).join(", ") || "";
}

// ── POST: Import from extension ─────────────────────────────

interface ImportRequestBody {
  // Required
  title: string;
  url: string;
  // Optional enrichment
  tags?: string[];
  price?: number;
  shopName?: string;
  description?: string;
  imageUrl?: string;
  searchQuery?: string;
  reviews?: number;
  rating?: number;
  podScore?: number;
  isBestseller?: boolean;
  isEtsyPick?: boolean;
  // Extension may provide its own type hint
  productTypeHint?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ImportRequestBody;

    if (!body.title) {
      return NextResponse.json(
        { error: "Missing required field: title" },
        { status: 400 }
      );
    }

    const tags = body.tags || [];
    const now = new Date().toISOString();
    const projectId = `dp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // ── Infer product type ──
    const suggestion = suggestProductType(body.title, tags, body.description);

    // ── Infer config for the suggested product type ──
    const inferredConfig = inferDigitalConfig(
      suggestion.type,
      body.title,
      tags,
      body.description,
      body.price
    );

    // Derive keyword from title (first meaningful phrase)
    const keyword = body.title
      .replace(/[|,\-–—]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 5)
      .join(" ");

    // Extract niche
    const niche = extractNiche(body.title, tags);

    // ── Build import source metadata ──
    const importSource: ImportSource = {
      type: "extension",
      url: body.url,
      title: body.title,
      shopName: body.shopName,
      importedAt: now,
      suggestedProductType: suggestion.type,
      podScore: body.podScore,
      searchQuery: body.searchQuery,
      configSource: "inferred",
    };

    // ── Build project name ──
    const projectName = keyword.length > 40
      ? keyword.substring(0, 37) + "..."
      : keyword || "Imported Product";

    // ── Save project ──
    // Config is prefilled from inference; step advances to "configure"
    // so the user reviews the auto-detected settings.
    saveDigitalProject({
      id: projectId,
      project_name: projectName,
      product_type: suggestion.type,
      status: "draft",
      current_step: "configure",
      step_statuses: {
        discover: "done",
        configure: "done",
        generate: "idle",
        preview: "idle",
        listing: "idle",
        publish: "idle",
      },
      inspiration: {
        source: "keyword" as const,
        keyword,
        niche: niche || undefined,
        competitorUrls: body.url ? [body.url] : [],
      },
      config: inferredConfig,
      generation: { status: "idle", result: null },
      preview: { mockups: [], mockupStatus: "idle" },
      listing: {
        title: "",
        description: "",
        tags: [],
        price: { min: 0, max: 0, recommended: 0 },
        faqs: [],
        mockupIdeas: [],
        status: "idle",
      },
      publish: { platform: "none", etsyStatus: "unpublished" },
      quality_score: null,
      batch_meta: null,
      import_source: importSource,
    });

    return NextResponse.json({
      success: true,
      projectId,
      suggestedType: suggestion.type,
      confidence: suggestion.confidence,
      inferredConfig,
    });
  } catch (err) {
    console.error("[Digital Import POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 }
    );
  }
}
