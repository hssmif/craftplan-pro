// ══════════════════════════════════════════════════════════════
// Factory Competitor Deep Scan
//
// Reads a competitor listing's photos with Gemini Vision,
// extracts a structured feature manifest, returns
// CompetitorFeatures.
//
// Caller: orchestrator Engine 1.5, fires only when
// competitor.imageUrls[] is non-empty (i.e., a real listing
// was selected via Research → "Build This").
//
// Output is the "must-match-or-beat" checklist that
// generateBlueprint consumes. Empty input → empty manifest
// (graceful degradation to today's behavior).
// ══════════════════════════════════════════════════════════════

import { parseGeminiJSON } from "./gemini";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
// Vision-capable model. 2.5-flash is the cheapest model that handles
// multi-image input reliably. Fallback to 2.0-flash if 2.5 errors.
const VISION_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

const MAX_IMAGES = 8; // Gemini Vision token budget cap

export interface CompetitorScanInput {
  listingId: string;
  title: string;
  description?: string;
  tags?: string[];
  price?: number;
  /** 1–8 full-size listing photo URLs (url_fullxfull). */
  imageUrls: string[];
}

export interface CompetitorFeatures {
  /** Tab names visible in screenshots OR mentioned in marketing graphics. */
  detectedTabs: string[];
  /** Declared total (e.g., "28 TABS") OR our count. */
  tabCount: number;

  /** Chart types spotted: "donut", "bar", "line", "area", "pie", "data-bar", "color-scale-heatmap". */
  chartTypes: string[];
  hasCalendarWidget: boolean;
  hasSparklines: boolean;

  /** Spotted automations: "recurring-transactions", "auto-import", "sumifs-formulas", "dropdowns", "conditional-formatting". */
  automations: string[];

  /** 3–8 primary hex colors. */
  colorPalette: string[];
  visualStyle: "minimalist" | "dense" | "playful" | "professional" | "luxury";
  hasMobileMockup: boolean;
  hasDarkMode: boolean;

  /** Exact text snippets pulled from marketing graphics. */
  declaredFeatures: string[];
  /** Distinct UI patterns rarely seen elsewhere. */
  uniqueWidgets: string[];

  productionQuality: "low" | "medium" | "high";
  imageCount: number;
  /** Self-assessed scan confidence 0–1. */
  confidence: number;
}

// ─── Public API ─────────────────────────────────────────────────

export async function scanCompetitor(
  input: CompetitorScanInput,
): Promise<CompetitorFeatures> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[CompetitorScan] No GEMINI_API_KEY — empty manifest");
    return emptyManifest(input.imageUrls.length);
  }

  const urls = input.imageUrls.slice(0, MAX_IMAGES);
  if (urls.length === 0) {
    return emptyManifest(0);
  }

  // Download + base64-encode each image
  const fetched = await Promise.all(urls.map(fetchImageAsBase64));
  const validImages = fetched.filter(
    (x): x is { inlineData: { mimeType: string; data: string } } => x !== null,
  );

  if (validImages.length === 0) {
    console.warn("[CompetitorScan] All image fetches failed");
    return emptyManifest(0);
  }

  const prompt = buildScanPrompt(input);

  // Try each vision model in order until one succeeds
  for (const model of VISION_MODELS) {
    const result = await callVision(apiKey, model, prompt, validImages);
    if (result.ok) {
      return normalizeFeatures(result.parsed, validImages.length);
    }
    console.warn(
      `[CompetitorScan] ${model} failed: ${"error" in result ? result.error : "unknown"}`,
    );
  }

  return emptyManifest(validImages.length);
}

// ─── Helpers ────────────────────────────────────────────────────

async function fetchImageAsBase64(
  url: string,
): Promise<{ inlineData: { mimeType: string; data: string } } | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`[CompetitorScan] Fetch ${url} → ${resp.status}`);
      return null;
    }
    const buf = await resp.arrayBuffer();
    const mimeType = resp.headers.get("content-type") || "image/jpeg";
    const data = Buffer.from(buf).toString("base64");
    return { inlineData: { mimeType, data } };
  } catch (err) {
    console.warn(`[CompetitorScan] Error fetching ${url}:`, err);
    return null;
  }
}

async function callVision(
  apiKey: string,
  model: string,
  prompt: string,
  images: Array<{ inlineData: { mimeType: string; data: string } }>,
): Promise<
  | { ok: true; parsed: Record<string, unknown> }
  | { ok: false; error: string }
> {
  try {
    const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;
    const body = {
      contents: [
        {
          parts: [{ text: prompt }, ...images],
        },
      ],
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.3,
        responseMimeType: "application/json",
      },
    };
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "unknown");
      return { ok: false, error: `${resp.status}: ${errText.slice(0, 200)}` };
    }
    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { ok: false, error: "No text in Vision response" };
    const parsed = parseGeminiJSON<Record<string, unknown>>(text);
    return { ok: true, parsed };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function buildScanPrompt(input: CompetitorScanInput): string {
  const desc = input.description
    ? `\n- Description excerpt: ${input.description.slice(0, 800)}`
    : "";
  return `You are a competitive product analyst for digital spreadsheet templates sold on Etsy.

The images attached are LISTING PHOTOS from a competitor product. Some may be marketing graphics (title cards, feature lists, mockups); some may show actual spreadsheet screenshots.

YOUR JOB: Extract a structured feature manifest of what this competitor sells.

CONTEXT:
- Listing title: ${input.title}
- Tags: ${input.tags?.join(", ") || "—"}
- Price: $${input.price ?? "—"}${desc}

OUTPUT JSON SCHEMA (return ONLY this JSON, no prose):
{
  "detectedTabs": string[],
  "tabCount": number,
  "chartTypes": string[],
  "hasCalendarWidget": boolean,
  "hasSparklines": boolean,
  "automations": string[],
  "colorPalette": string[],
  "visualStyle": "minimalist" | "dense" | "playful" | "professional" | "luxury",
  "hasMobileMockup": boolean,
  "hasDarkMode": boolean,
  "declaredFeatures": string[],
  "uniqueWidgets": string[],
  "productionQuality": "low" | "medium" | "high",
  "confidence": number
}

EXTRACTION RULES:
- BE LITERAL. If you see "28 TABS" in a graphic, that's the tabCount.
- If you can't see a tab list, infer from declaredFeatures and tags.
- chartTypes: list each distinct visualization style spotted (e.g., "donut", "bar", "line", "area"). Don't count instances.
- uniqueWidgets: only list things that are clearly distinctive (e.g., "smart-calendar-with-transactions-inside-day-cells", "debt-snowball-calculator", "no-spend-streak-tracker", "what-if-simulator"). Don't list common things like "totals row".
- declaredFeatures: pull EXACT text snippets from the photos (e.g., "28 TABS", "NO COPY PASTE REQUIRED", "AUTOMATED DASHBOARD", "FOR EXCEL & GOOGLE SHEETS").
- colorPalette: 3–6 hex codes you actually see. Be precise.
- If unsure of a boolean, default false.
- confidence: how confident you are in this manifest (0 = could not read photos; 1 = crystal clear).

Return JSON only.`;
}

function emptyManifest(imageCount: number): CompetitorFeatures {
  return {
    detectedTabs: [],
    tabCount: 0,
    chartTypes: [],
    hasCalendarWidget: false,
    hasSparklines: false,
    automations: [],
    colorPalette: [],
    visualStyle: "professional",
    hasMobileMockup: false,
    hasDarkMode: false,
    declaredFeatures: [],
    uniqueWidgets: [],
    productionQuality: "low",
    imageCount,
    confidence: 0,
  };
}

function normalizeFeatures(
  raw: Record<string, unknown>,
  imageCount: number,
): CompetitorFeatures {
  const asStringArr = (v: unknown, cap = 50): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string").slice(0, cap)
      : [];
  const asBool = (v: unknown): boolean =>
    typeof v === "boolean" ? v : false;
  const asNum = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? v : 0;
  const asEnum = <T extends string>(
    v: unknown,
    allowed: readonly T[],
    fallback: T,
  ): T => (allowed.includes(v as T) ? (v as T) : fallback);

  return {
    detectedTabs: asStringArr(raw.detectedTabs, 60),
    tabCount: asNum(raw.tabCount),
    chartTypes: asStringArr(raw.chartTypes, 20),
    hasCalendarWidget: asBool(raw.hasCalendarWidget),
    hasSparklines: asBool(raw.hasSparklines),
    automations: asStringArr(raw.automations, 20),
    colorPalette: asStringArr(raw.colorPalette, 8),
    visualStyle: asEnum(
      raw.visualStyle,
      ["minimalist", "dense", "playful", "professional", "luxury"] as const,
      "professional",
    ),
    hasMobileMockup: asBool(raw.hasMobileMockup),
    hasDarkMode: asBool(raw.hasDarkMode),
    declaredFeatures: asStringArr(raw.declaredFeatures, 30),
    uniqueWidgets: asStringArr(raw.uniqueWidgets, 20),
    productionQuality: asEnum(
      raw.productionQuality,
      ["low", "medium", "high"] as const,
      "medium",
    ),
    imageCount,
    confidence: Math.max(0, Math.min(1, asNum(raw.confidence) || 0.5)),
  };
}
