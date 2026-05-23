// ══════════════════════════════════════════════════════════════
// Digital Product Studio: Unified Listing Generation API
// POST — AI-powered Etsy listing generation for all digital
//        product types (Notion, PDF, Excel, Printable)
// Uses Gemini model chain with JSON repair fallback.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import type {
  DigitalProductType,
  DigitalProductConfig,
  DigitalListingPackage,
} from "@/types/digital-product";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

const CURRENT_YEAR = new Date().getFullYear();

// ── Gemini JSON caller with model chain fallback ────────────

async function callGeminiJSON(
  apiKey: string,
  prompt: string
): Promise<string> {
  for (const model of MODEL_CHAIN) {
    try {
      const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.6,
            responseMimeType: "application/json",
          },
        }),
      });
      if (resp.status === 429 || resp.status === 503) continue;
      if (!resp.ok) continue;
      const data = await resp.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
    } catch {
      continue;
    }
  }
  throw new Error("All Gemini models failed");
}

// ── JSON repair for truncated responses ─────────────────────

function repairJSON(text: string): string {
  let s = text.trim();
  const quoteCount = (s.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) s += '"';

  const opens = { "{": 0, "[": 0 };
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && (i === 0 || s[i - 1] !== "\\")) {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") opens["{"]++;
    else if (ch === "}") opens["{"]--;
    else if (ch === "[") opens["["]++;
    else if (ch === "]") opens["["]--;
  }
  s = s.replace(/,\s*$/, "");
  for (let i = 0; i < opens["["]; i++) s += "]";
  for (let i = 0; i < opens["{"]; i++) s += "}";
  return s;
}

// ── Prompt builders per product type ────────────────────────

function buildNotionPrompt(config: Extract<DigitalProductConfig, { type: "notion" }>, meta: ListingMeta): string {
  const typeNames: Record<string, string> = {
    finance_tracker: "Finance & Budget Tracker",
    adhd_planner: "ADHD-Friendly Planner",
    life_planner: "All-in-One Life Planner",
    social_media_planner: "Social Media Content Planner",
    habit_tracker: "Habit Tracker",
    project_manager: "Project Manager",
    reading_log: "Reading Log",
    meal_planner: "Meal Planner",
  };
  const typeName = typeNames[config.templateType] || config.templateType.replace(/_/g, " ");

  return `Generate a complete Etsy listing for a premium Notion template product.

TEMPLATE DETAILS:
- Name: "${meta.projectName}"
- Type: ${typeName}
- Aesthetic: ${config.aesthetic}
- Complexity: ${config.complexity}
${config.features?.length ? `- Features: ${config.features.join(", ")}` : ""}
- Premium: ${config.premium ? "Yes" : "No"}
${meta.niche ? `- Niche: ${meta.niche}` : ""}
${meta.targetAudience ? `- Target audience: ${meta.targetAudience}` : ""}

${LISTING_JSON_SCHEMA}

RULES:
- Title format: "${CURRENT_YEAR} [Type] Notion Template | [Feature 1] + [Feature 2] | [Audience] | [Aesthetic]"
- Title MUST include "Notion Template" and be max 140 chars
- Description should sell BENEFITS not just features. Open with a pain point hook.
- Description sections: ✨ What's Included, 🎯 Perfect For, ⚡ Key Features, 📦 What You Get, ❓ FAQ
- Tags: exactly 13, each max 20 chars, all lowercase, no duplicates
- Mix tag types: broad ("notion template"), niche ("${config.templateType.replace(/_/g, " ")} notion"), audience-specific, aesthetic, benefit-focused
- Price based on complexity: ${config.complexity} (simple $3-5, medium $5-10, advanced $10-20)
- FAQs: 5 items covering: compatibility, editing, refunds, updates, customization
- mockupIdeas: 5 specific scenes for product photography`;
}

function buildPdfPrompt(config: Extract<DigitalProductConfig, { type: "pdf" }>, meta: ListingMeta): string {
  const typeNames: Record<string, string> = {
    daily_planner: "Daily Planner",
    weekly_planner: "Weekly Planner",
    monthly_planner: "Monthly Planner",
    budget_planner: "Budget Planner",
    fitness_planner: "Fitness Planner",
    self_care_planner: "Self-Care Planner",
    business_planner: "Business Planner",
    student_planner: "Student Planner",
  };
  const typeName = typeNames[config.plannerType] || config.plannerType.replace(/_/g, " ");

  return `Generate a complete Etsy listing for a premium digital PDF planner product.

PRODUCT DETAILS:
- Product: ${typeName}
- Name: "${meta.projectName}"
- Color Theme: ${config.colorTheme}
${config.designStyle ? `- Design Style: ${config.designStyle}` : ""}
- Paper Size: ${config.paperSize}
${config.year ? `- Year: ${config.year}` : ""}
${config.customTitle ? `- Custom Title: ${config.customTitle}` : ""}
${meta.niche ? `- Niche: ${meta.niche}` : ""}
${meta.targetAudience ? `- Target audience: ${meta.targetAudience}` : ""}

${LISTING_JSON_SCHEMA}

RULES:
- Title format: "${CURRENT_YEAR} ${typeName} PDF | [Feature 1] + [Feature 2] | Printable | [Aesthetic] | Digital Download"
- Title MUST include "PDF" and be max 140 chars
- Description should sell BENEFITS not just features. Open with a relatable pain point hook.
- Description sections: ✨ What's Inside, 🎯 Perfect For, ⚡ Key Features, 📦 What You Get, 📋 How to Use, ❓ FAQ
- Mention "instant download", "print at home", "${config.paperSize} size", "PDF format"
- Tags: exactly 13, each max 20 chars, all lowercase, no duplicates
- Price range $3-12 for PDF planners
- FAQs: 5 items covering: file format, printing, editing, refunds, sizing
- mockupIdeas: 5 specific scenes for product photography`;
}

function buildExcelPrompt(config: Extract<DigitalProductConfig, { type: "excel" }>, meta: ListingMeta): string {
  const typeNames: Record<string, string> = {
    budget: "Budget Tracker",
    habit: "Habit Tracker",
    fitness: "Fitness Tracker",
    inventory: "Inventory Manager",
    sales: "Sales Tracker",
    expense: "Expense Report",
    project: "Project Timeline",
  };
  const typeName = typeNames[config.trackerType] || config.trackerType.replace(/_/g, " ");

  return `Generate a complete Etsy listing for a premium Excel spreadsheet tracker product.

PRODUCT DETAILS:
- Product: ${typeName} Excel Spreadsheet
- Name: "${meta.projectName}"
- Color Scheme: ${config.colorScheme}
${config.customCategories?.length ? `- Custom Categories: ${config.customCategories.join(", ")}` : ""}
${meta.niche ? `- Niche: ${meta.niche}` : ""}
${meta.targetAudience ? `- Target audience: ${meta.targetAudience}` : ""}

${LISTING_JSON_SCHEMA}

RULES:
- Title format: "${CURRENT_YEAR} ${typeName} Excel Spreadsheet | [Feature 1] + [Feature 2] | Google Sheets | Digital Download"
- Title MUST include "Excel" or "Spreadsheet" and be max 140 chars
- Description should sell BENEFITS: automated formulas, visual dashboards, time-saving
- Description sections: ✨ What's Inside, 🎯 Perfect For, ⚡ Key Features, 📦 What You Get, 📋 How to Use, ❓ FAQ
- Mention "works in Excel & Google Sheets", "automatic calculations", "instant download"
- Tags: exactly 13, each max 20 chars, all lowercase, no duplicates
- Price range $4-15 for Excel trackers
- FAQs: 5 items covering: compatibility (Excel/Google Sheets), editing, refunds, customization, formulas
- mockupIdeas: 5 specific scenes for product photography`;
}

function buildPrintablePrompt(config: Extract<DigitalProductConfig, { type: "printable" }>, meta: ListingMeta): string {
  const typeNames: Record<string, string> = {
    quote_prints: "Quote Prints",
    habit_tracker: "Habit Tracker",
    wall_art: "Wall Art",
    checklist: "Checklist",
    calendar: "Calendar",
    journal_pages: "Journal Pages",
    flash_cards: "Flash Cards",
  };
  const typeName = typeNames[config.printableType] || config.printableType.replace(/_/g, " ");

  return `Generate a complete Etsy listing for a premium printable digital product.

PRODUCT DETAILS:
- Product: ${typeName} Printable
- Name: "${meta.projectName}"
- Color Scheme: ${config.colorScheme}
${config.quoteTheme ? `- Quote Theme: ${config.quoteTheme}` : ""}
${config.customQuotes?.length ? `- Custom Quotes: ${config.customQuotes.slice(0, 3).join("; ")}` : ""}
${meta.niche ? `- Niche: ${meta.niche}` : ""}
${meta.targetAudience ? `- Target audience: ${meta.targetAudience}` : ""}

${LISTING_JSON_SCHEMA}

RULES:
- Title format: "${CURRENT_YEAR} ${typeName} Printable | [Style] | [Audience] | Digital Download | Wall Art"
- Title MUST include "Printable" and be max 140 chars
- Description should sell BENEFITS: instant decor, print unlimited copies, aesthetic design
- Description sections: ✨ What's Inside, 🎯 Perfect For, ⚡ Key Features, 📦 What You Get, 🖨️ How to Print, ❓ FAQ
- Mention "instant download", "print at home", "high resolution", "multiple sizes included"
- Tags: exactly 13, each max 20 chars, all lowercase, no duplicates
- Price range $2-8 for printables
- FAQs: 5 items covering: file format, printing tips, sizes included, refunds, commercial use
- mockupIdeas: 5 specific scenes for product photography`;
}

// ── Shared JSON schema for all product types ────────────────

const LISTING_JSON_SCHEMA = `Return VALID JSON matching this exact schema:
{
  "title": "string (max 140 chars, SEO keyword-rich, include year ${CURRENT_YEAR})",
  "price": { "min": number, "max": number, "recommended": number },
  "description": "string (full listing description, 1000-1500 chars, use emoji section headers, benefits-focused)",
  "tags": ["exactly 13 unique tags, each max 20 chars"],
  "faqs": [{"question": "string", "answer": "string"}],
  "mockupIdeas": ["5 brief mockup scene descriptions"]
}`;

// ── Request metadata ────────────────────────────────────────

interface ListingMeta {
  projectName: string;
  niche?: string;
  targetAudience?: string;
}

// ── POST handler ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const {
      productType,
      config,
      projectName,
      niche,
      targetAudience,
    } = body as {
      productType: DigitalProductType;
      config: DigitalProductConfig;
      projectName?: string;
      niche?: string;
      targetAudience?: string;
    };

    if (!productType || !config) {
      return NextResponse.json(
        { error: "Missing required fields: productType, config" },
        { status: 400 }
      );
    }

    const meta: ListingMeta = {
      projectName: projectName || "Untitled Product",
      niche,
      targetAudience,
    };

    // Build type-specific prompt
    let prompt: string;
    switch (config.type) {
      case "notion":
        prompt = buildNotionPrompt(config, meta);
        break;
      case "pdf":
        prompt = buildPdfPrompt(config, meta);
        break;
      case "excel":
        prompt = buildExcelPrompt(config, meta);
        break;
      case "printable":
        prompt = buildPrintablePrompt(config, meta);
        break;
      default:
        return NextResponse.json(
          { error: `Unknown config type: ${(config as { type: string }).type}` },
          { status: 400 }
        );
    }

    const text = await callGeminiJSON(apiKey, prompt);

    // Parse with repair fallback
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(text);
    } catch {
      const repaired = repairJSON(text);
      raw = JSON.parse(repaired);
    }

    // Validate & sanitize into DigitalListingPackage
    const listing: DigitalListingPackage = {
      title: typeof raw.title === "string"
        ? raw.title.substring(0, 140)
        : "",
      description: typeof raw.description === "string"
        ? raw.description
        : "",
      tags: Array.isArray(raw.tags)
        ? raw.tags.slice(0, 13).map((t: unknown) => String(t).substring(0, 20))
        : [],
      price: {
        min: Number((raw.price as Record<string, unknown>)?.min) || 0,
        max: Number((raw.price as Record<string, unknown>)?.max) || 0,
        recommended: Number((raw.price as Record<string, unknown>)?.recommended) || 0,
      },
      faqs: Array.isArray(raw.faqs)
        ? raw.faqs.map((f: Record<string, unknown>) => ({
            question: String(f.question || ""),
            answer: String(f.answer || ""),
          }))
        : [],
      mockupIdeas: Array.isArray(raw.mockupIdeas)
        ? raw.mockupIdeas.map((m: unknown) => String(m))
        : [],
      status: "done",
    };

    return NextResponse.json({ listing });
  } catch (err: unknown) {
    console.error("[Digital Listing Generator] Error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to generate listing",
      },
      { status: 500 }
    );
  }
}
