// ══════════════════════════════════════════════════════════════
// Auto-Infer API: Gemini-powered product type + config inference
// Takes a single user prompt and returns a complete, validated
// DigitalProductConfig ready for generation.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { callGeminiJSON, parseGeminiJSON } from "@/lib/gemini";
import {
  NOTION_TEMPLATE_TYPES,
  NOTION_AESTHETICS,
  PDF_PLANNER_TYPES,
  EXCEL_TRACKER_TYPES,
  PRINTABLE_TYPES,
  SHEETS_TYPES,
  COLOR_SCHEMES,
  SHEETS_COLOR_SCHEMES,
  getValidValues,
} from "@/lib/digital-config-constants";
import type { DigitalProductType, DigitalProductConfig, SheetsConfig } from "@/types/digital-product";

// ── Helpers ──────────────────────────────────────────────────

function vals(items: ReadonlyArray<{ value: string }>): string {
  return items.map((i) => `"${i.value}"`).join(" | ");
}

function snap(value: string | undefined, valid: string[], fallback: string): string {
  if (value && valid.includes(value)) return value;
  return fallback;
}

// ── Build Gemini Prompt ─────────────────────────────────────

function buildInferencePrompt(userPrompt: string): string {
  return `You are a digital product consultant for Etsy sellers.
Given a user's product idea, determine the SINGLE best product type and complete configuration.

DECISION RULES:
- "spreadsheet", "tracker", "budget", "expense", "p&l", "paycheck" → type "sheets"
- "excel", "habit tracker", "fitness tracker", "business tracker", "project timeline", "meal planner" → type "excel"
- "planner", "calendar", "schedule", "agenda", "daily/weekly/monthly" → type "pdf"
- "notion", "system", "dashboard", "productivity system", "life os", "second brain" → type "notion"
- "printable", "wall art", "poster", "quote", "worksheet", "coloring", "cards" → type "printable"
- When ambiguous, prefer "sheets" for finance, "pdf" for planners, "notion" for systems

VALID PRODUCT TYPES: "notion" | "pdf" | "excel" | "printable" | "sheets"

IF productType = "notion":
  templateType: ${vals(NOTION_TEMPLATE_TYPES)}
  aesthetic: ${vals(NOTION_AESTHETICS)}
  complexity: "simple" | "medium" | "advanced"
  premium: boolean (true if the idea sounds comprehensive/premium)

IF productType = "pdf":
  plannerType: ${vals(PDF_PLANNER_TYPES)}
  colorTheme: ${vals(COLOR_SCHEMES)}
  paperSize: "letter" | "a4" | "a5" (default "letter")

IF productType = "excel":
  trackerType: ${vals(EXCEL_TRACKER_TYPES)}
  colorScheme: ${vals(COLOR_SCHEMES)}

IF productType = "printable":
  printableType: ${vals(PRINTABLE_TYPES)}
  colorScheme: ${vals(COLOR_SCHEMES)}

IF productType = "sheets":
  sheetsType: ${vals(SHEETS_TYPES)}
  colorScheme: ${vals(SHEETS_COLOR_SCHEMES)}
  complexity: "simple" | "standard" | "advanced" (default "standard")

COLOR SCHEME MATCHING:
- Finance/business → "navy-gold" or "minimal-black"
- Wellness/self-care → "sage-green" or "lavender"
- Feminine/wedding → "dusty-rose" or "lavender"
- Bold/modern → "minimal-black" or "ocean"
- Earthy/warm → "terracotta" or "sage-green"
- Neutral/clean → "minimal-black" or "sage-green"

USER'S IDEA: "${userPrompt.replace(/"/g, '\\"')}"

Respond ONLY with JSON (no markdown, no explanation):
{
  "productType": "...",
  "projectName": "short product name, max 40 chars, title case",
  "keyword": "main search keyword (2-5 words)",
  "niche": "target niche category",
  "targetAudience": "who this is for",
  "config": { ... type-specific fields from above ... }
}`;
}

// ── Validate & Sanitize Response ─────────────────────────────

interface InferenceResult {
  productType: DigitalProductType;
  projectName: string;
  keyword: string;
  niche: string;
  targetAudience: string;
  config: DigitalProductConfig | SheetsConfig;
}

type InferredProductType = DigitalProductType | "sheets";
const VALID_TYPES: InferredProductType[] = ["notion", "pdf", "excel", "printable", "sheets"];

function validateAndBuildConfig(raw: Record<string, unknown>): InferenceResult {
  // Validate product type
  const inferredProductType = snap(
    raw.productType as string,
    VALID_TYPES,
    "pdf"
  ) as InferredProductType;
  const productType: DigitalProductType = inferredProductType === "sheets" ? "excel" : inferredProductType;

  const projectName = typeof raw.projectName === "string"
    ? raw.projectName.slice(0, 40)
    : "Untitled Product";

  const keyword = typeof raw.keyword === "string" ? raw.keyword : projectName;
  const niche = typeof raw.niche === "string" ? raw.niche : "";
  const targetAudience = typeof raw.targetAudience === "string" ? raw.targetAudience : "";

  const rawConfig = (raw.config || {}) as Record<string, unknown>;

  // Build type-safe config with validation
  let config: DigitalProductConfig | SheetsConfig;

  switch (inferredProductType) {
    case "notion":
      config = {
        type: "notion",
        templateType: snap(rawConfig.templateType as string, getValidValues(NOTION_TEMPLATE_TYPES), "life_planner"),
        aesthetic: snap(rawConfig.aesthetic as string, getValidValues(NOTION_AESTHETICS), "minimal"),
        complexity: snap(rawConfig.complexity as string, ["simple", "medium", "advanced"], "medium") as "simple" | "medium" | "advanced",
        premium: rawConfig.premium === true,
      };
      break;

    case "pdf":
      config = {
        type: "pdf",
        plannerType: snap(rawConfig.plannerType as string, getValidValues(PDF_PLANNER_TYPES), "weekly"),
        colorTheme: snap(rawConfig.colorTheme as string, getValidValues(COLOR_SCHEMES), "sage-green"),
        paperSize: snap(rawConfig.paperSize as string, ["letter", "a4", "a5"], "letter") as "letter" | "a4" | "a5",
        year: new Date().getFullYear(),
      };
      break;

    case "excel":
      config = {
        type: "excel",
        trackerType: snap(rawConfig.trackerType as string, getValidValues(EXCEL_TRACKER_TYPES), "budget"),
        colorScheme: snap(rawConfig.colorScheme as string, getValidValues(COLOR_SCHEMES), "sage-green"),
      };
      break;

    case "printable":
      config = {
        type: "printable",
        printableType: snap(rawConfig.printableType as string, getValidValues(PRINTABLE_TYPES), "quote_prints"),
        colorScheme: snap(rawConfig.colorScheme as string, getValidValues(COLOR_SCHEMES), "sage-green"),
      };
      break;

    case "sheets":
      config = {
        type: "sheets",
        sheetsType: snap(rawConfig.sheetsType as string, getValidValues(SHEETS_TYPES), "budget_tracker") as "budget_tracker" | "paycheck_budget" | "business_pl",
        colorScheme: snap(rawConfig.colorScheme as string, getValidValues(SHEETS_COLOR_SCHEMES), "sage-green"),
        complexity: snap(rawConfig.complexity as string, ["simple", "medium", "advanced"], "advanced") as "simple" | "medium" | "advanced",
      };
      break;

    default:
      config = {
        type: "pdf",
        plannerType: "weekly",
        colorTheme: "sage-green",
        paperSize: "letter" as const,
        year: new Date().getFullYear(),
      };
  }

  return { productType, projectName, keyword, niche, targetAudience, config };
}

// ── POST Handler ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

    if (!prompt) {
      return NextResponse.json(
        { error: "Missing required field: prompt" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Call Gemini with the inference prompt
    const rawText = await callGeminiJSON(apiKey, buildInferencePrompt(prompt));
    const parsed = parseGeminiJSON<Record<string, unknown>>(rawText);

    // Validate and build type-safe result
    const result = validateAndBuildConfig(parsed);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("[Auto-Infer POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Inference failed" },
      { status: 500 }
    );
  }
}
