// ── Cross-Stitch Bulk Prompt Generator ──────────────────────
// Takes an array of trend objects and generates GPT-Image-2
// natural-language prompts + SEO-optimized Etsy listing data for
// each one using Gemini AI. (The field is still called `mj_prompt`
// throughout the codebase for historical reasons — renaming would
// touch ~15 call sites. Content is now GPT-Image-2 style, not MJ.)

import { NextRequest, NextResponse } from "next/server";
import { isTrademarked, checkIdeaForIP, IP_GUARDRAIL_PROMPT } from "@/lib/trademark-filter";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

// ── Types ───────────────────────────────────────────────────

interface TrendInput {
  title: string;
  description: string;
  etsy_tags: string[];
}

interface BulkPromptResult {
  trend_title: string;
  mj_prompt: string;
  title_options: [string, string, string];
  suggested_price: { min: number; max: number };
  tags: string[];
  /** Present if any field matched the trademark blocklist. UI should
   * flag the card and disable the "list on Etsy" button for this trend. */
  ip_warning?: string;
}

type CrossStitchStyle = "cute" | "vintage" | "modern" | "sampler" | "pixel";

// ── Gemini caller (non-streaming, JSON mode) ────────────────

async function callGeminiJSON(
  apiKey: string,
  prompt: string,
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

/** Try to repair truncated JSON by closing unclosed strings, arrays and objects */
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

function parseJSON<T>(text: string): T {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(repairJSON(text));
  }
}

// ── Style descriptors for image prompts ─────────────────────

// 2026-04-27 — flipped BACK to soft children's-book illustration after
// testing both photoreal and bold-sticker paths.  Reasoning:
//   • Cross-stitch at 22,500 cells throws away 99% of photo detail
//     anyway — paying $0.04+ per image for photoreal source delivers
//     no buyer value.
//   • Bold-outline sticker style produces chunky charts that don't
//     match the high-end aesthetic of top Etsy sellers.
//   • Soft refined illustration (Penny duckling / Sanrio editorial /
//     NalaAndStitch top-seller) converts cleanly with the free python
//     KMeans engine to 12-24 DMC threads — perfect for the medium AND
//     the mass-market kawaii / floral / sampler buyer segment.
//
// These descriptors are pasted into the bulk Gemini prompt that
// synthesizes per-trend GPT-Image-2 prompts.  Mirrors STYLE_MAP in
// generate-design/route.ts — keep both files in sync.
// 2026-05-11 — flipped to FLAT CARTOON KAWAII across all styles.
// Soft-illustration/watercolor prompts produce gradient-heavy images
// that libimagequant quantizes into confetti palettes (50+ near-dupe
// colors). Flat solid-color kawaii illustrations produce the large
// uniform color regions that map cleanly to 12-24 DMC threads.
const STYLE_DESCRIPTORS: Record<CrossStitchStyle, string> = {
  cute: "flat cartoon kawaii sticker illustration, solid color fills with NO gradients and NO shading, clean medium-weight outlines, soft pastel colors, rounded simple shapes",
  vintage: "flat cartoon folk-art illustration, solid muted heritage color fills with NO gradients, clean thin outlines, warm terracotta and sage tones, simple symmetrical shapes",
  modern: "flat cartoon minimal illustration, solid sophisticated muted color fills with NO gradients, clean hairline outlines, limited palette, geometric simplified shapes",
  sampler: "flat cartoon folk sampler illustration, solid flat color fills with NO gradients, clean decorative outlines, symmetrical motif, muted vintage palette",
  pixel: "flat pixel-art kawaii illustration, solid flat color fills with NO gradients, sharp pixel-perfect edges, muted pastel palette, clean grid-friendly shapes",
};

// ── Prompt builder ──────────────────────────────────────────

function buildBulkPrompt(trends: TrendInput[], style: CrossStitchStyle): string {
  const styleDesc = STYLE_DESCRIPTORS[style] || STYLE_DESCRIPTORS.cute;
  const trendsList = trends
    .map(
      (t, i) =>
        `  ${i + 1}. Title: "${t.title}"\n     Description: "${t.description}"\n     Existing tags: ${t.etsy_tags.join(", ")}`,
    )
    .join("\n");

  return `You are an expert Etsy cross-stitch pattern seller and GPT-Image-2 prompt engineer.

For EACH trend below, generate:
1. A natural-language image prompt (for GPT-Image-2) optimized for cross-stitch pattern conversion
2. 3 SEO-optimized Etsy title options
3. A suggested price range
4. 13 Etsy tags

${IP_GUARDRAIL_PROMPT}

TRENDS:
${trendsList}

CROSS-STITCH STYLE: ${style} — ${styleDesc}

Return VALID JSON as an array with one object per trend, matching this exact schema:
[
  {
    "trend_title": "string (the original trend title)",
    "mj_prompt": "string (full natural-language image prompt for GPT-Image-2)",
    "title_options": ["string", "string", "string"],
    "suggested_price": { "min": number, "max": number },
    "tags": ["string", "string", ... exactly 13 tags]
  }
]

IMAGE PROMPT RULES (for GPT-Image-2 — natural-language, NOT Midjourney):
- Each mj_prompt MUST be a FLAT CARTOON KAWAII illustration — solid color fills, NO watercolor gradients, NO painterly shading. Watercolor/gradient images collapse into confetti-stitch noise during quantization. Flat solid colors map cleanly to 12-24 DMC threads.
- Format: "[subject + one accessory/prop], flat cartoon kawaii sticker illustration, solid color fills with NO gradients and NO shading, clean medium-weight outlines, soft pastel colors, rounded simple shapes, single centered subject, pure white background, no room scene, no frame, no mockup. NOT photorealistic, NOT watercolor, NOT painterly, NOT 3D render."
- Keep the subject description UNDER 20 WORDS — short descriptions produce cleaner flat-color output.
- Include style keywords: ${styleDesc}
- Do NOT use --ar, --v, --style, --s or any CLI-style flags. Do NOT mention Midjourney.
- Keep prompts under 400 characters total
- NEVER include: photorealistic photos, 3D renders, watercolor gradients, painterly shading, soft illustration textures, dimensional shading, tonal blending, room settings, embroidery hoops

ETSY TITLE RULES:
- Each title MUST be max 140 characters
- Front-load the most important keywords (buyers search by first words)
- Every title MUST end with "Cross Stitch Pattern (Digital Download)"
- Include the trend subject/theme near the beginning
- Mix in style keywords: ${style}, modern, hand embroidery, counted cross stitch
- Do NOT use ALL CAPS or excessive punctuation
- Format: "[Subject/Theme] [Style Keyword] | [Modifier] Cross Stitch Pattern (Digital Download)"

PRICE RULES:
- Simple designs (single motif, minimal detail): min 3.50, max 5.50
- Medium complexity (scene with 3-5 elements, moderate detail): min 5.00, max 7.50
- Complex designs (detailed scene, many elements, large stitch count): min 7.00, max 10.50
- Price based on perceived complexity of converting the trend to a cross-stitch pattern

TAG RULES:
- Exactly 13 tags per trend
- Each tag max 20 characters
- All lowercase
- No duplicate tags within a trend
- Mix: 3 broad (e.g. "cross stitch pattern"), 3 niche/subject-specific, 3 style-related, 2 audience-related (e.g. "gift for crafter"), 2 seasonal/trending
- First tag should always be "cross stitch pattern"`;
}

// ── Batch processing with concurrency control ───────────────

const BATCH_SIZE = 5;

async function processBatch(
  apiKey: string,
  trends: TrendInput[],
  style: CrossStitchStyle,
): Promise<BulkPromptResult[]> {
  const prompt = buildBulkPrompt(trends, style);
  const rawText = await callGeminiJSON(apiKey, prompt);
  const results = parseJSON<BulkPromptResult[]>(rawText);

  // Validate and sanitize each result. If Gemini managed to slip any
  // IP-infringing content into titles/tags/prompt (it sometimes does
  // when a trend's wording is adjacent to a franchise), flag the
  // whole result with an error field so the UI can show the user
  // rather than silently shipping a banworthy listing.
  return results.map((r, i) => {
    const mjPrompt = sanitizeMjPrompt(r.mj_prompt || "");
    const titleOptions = sanitizeTitleOptions(r.title_options);
    const tags = sanitizeTags(r.tags);

    const ipHit = checkIdeaForIP({
      title: r.trend_title,
      tags,
      image_prompt: mjPrompt,
    }) ?? titleOptions.map((t) => (isTrademarked(t) ? t : null)).find(Boolean);

    return {
      trend_title: r.trend_title || trends[i]?.title || `Trend ${i + 1}`,
      mj_prompt: mjPrompt,
      title_options: titleOptions,
      suggested_price: {
        min: typeof r.suggested_price?.min === "number" ? r.suggested_price.min : 4.5,
        max: typeof r.suggested_price?.max === "number" ? r.suggested_price.max : 7.5,
      },
      tags,
      ...(ipHit ? { ip_warning: `Contains "${ipHit}" — do NOT list on Etsy (trademark)` } : {}),
    };
  });
}

function sanitizeMjPrompt(prompt: string): string {
  // Clean up any stray Midjourney CLI flags that Gemini sometimes injects
  // from training data, strip room-scene language, ensure the photoreal
  // qualifiers are present, and guarantee the closing framing sentence
  // that pins GPT-Image-2 to a square white-backdrop product shot.
  // (Field name `mjPrompt` is legacy — content is gpt-image-2.)
  //
  // 2026-04-25 — flipped from flat-sticker force-injects (bold outlines,
  // saturated colors) to photoreal force-injects (natural lighting,
  // photorealistic detail) per user direction. Without this Gemini still
  // drifts back into illustration language even when the system prompt
  // pushes photoreal — the sanitizer is the last line of defense.
  let cleaned = prompt
    .replace(/--ar\s+\S+/gi, "")
    .replace(/--v\s+\S+/gi, "")
    .replace(/--style\s+\S+/gi, "")
    .replace(/--s\s+\S+/gi, "")
    .replace(/--chaos\s+\S+/gi, "")
    .replace(/--niji\s*\S*/gi, "")
    .replace(/\bmidjourney\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  // Strip room-scene / mockup language that Gemini sometimes injects despite instructions
  cleaned = cleaned.replace(/,?\s*(displayed|shown|hanging|placed|framed)\s+(in|on|above|over)\s+[^,]*/gi, "");
  // Force-inject photoreal qualifiers if the model omitted them
  if (!/photoreal|photograph|natural lighting/i.test(cleaned)) {
    cleaned += ", photorealistic high-detail photograph, natural lighting, sharp focus";
  }
  if (!/texture|material|dimensional|tonal/i.test(cleaned)) {
    cleaned += ", true-to-life textures and dimensional shading";
  }
  // Guarantee the closing framing sentence — pure white STUDIO backdrop
  // (kept the white-bg lock so Convert downstream still gets a clean
  // canvas) plus negative prompts to push back on cartoon drift.
  const closer = "Square 1:1 composition, pure white studio backdrop, no room scene, no frame, no mockup. NOT cartoon, NOT illustration, NOT vector art, NOT flat color, NOT sticker style.";
  if (!/square 1:1|pure white (studio )?backdrop|pure white background/i.test(cleaned)) {
    cleaned = `${cleaned.replace(/[.,;]\s*$/, "")}. ${closer}`;
  } else if (!/\.$/.test(cleaned)) {
    cleaned += ".";
  }
  return cleaned;
}

function sanitizeTitleOptions(
  titles: [string, string, string] | string[],
): [string, string, string] {
  const suffix = "Cross Stitch Pattern (Digital Download)";
  const sanitized = (titles || []).slice(0, 3).map((t) => {
    let title = (t || "").trim();
    if (title.length > 140) title = title.substring(0, 140);
    // Ensure it ends with the required suffix
    if (!title.endsWith(suffix)) {
      // Strip any partial suffix and re-add
      title = title.replace(/Cross Stitch Pattern.*$/i, "").trim();
      const available = 140 - suffix.length - 1;
      if (title.length > available) title = title.substring(0, available);
      title = `${title} ${suffix}`;
    }
    return title;
  });

  // Pad to exactly 3 if AI returned fewer
  while (sanitized.length < 3) {
    sanitized.push(`Handmade ${suffix}`);
  }
  return sanitized as [string, string, string];
}

function sanitizeTags(tags: string[]): string[] {
  const cleaned = (tags || [])
    .map((t) => (t || "").toLowerCase().trim().substring(0, 20))
    .filter((t) => t.length > 0);

  // Deduplicate
  const unique = [...new Set(cleaned)];

  // Ensure "cross stitch pattern" is the first tag
  const csIdx = unique.indexOf("cross stitch pattern");
  if (csIdx > 0) {
    unique.splice(csIdx, 1);
    unique.unshift("cross stitch pattern");
  } else if (csIdx === -1) {
    unique.unshift("cross stitch pattern");
  }

  // Pad or trim to exactly 13
  const fallbackTags = [
    "cross stitch pattern",
    "digital download",
    "counted cross stitch",
    "embroidery pattern",
    "xstitch pattern",
    "needlework pattern",
    "cross stitch pdf",
    "hand embroidery",
    "diy cross stitch",
    "modern cross stitch",
    "craft pattern",
    "gift for crafter",
    "stitch pattern",
  ];

  while (unique.length < 13) {
    const filler = fallbackTags.find((f) => !unique.includes(f));
    if (filler) unique.push(filler);
    else break;
  }

  return unique.slice(0, 13);
}

// ── Route handler ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured. Add it to .env.local" },
      { status: 500 },
    );
  }

  try {
    const body = await req.json();
    const { trends, style } = body as {
      trends: TrendInput[];
      style?: string;
    };

    // Validate input
    if (!trends || !Array.isArray(trends) || trends.length === 0) {
      return NextResponse.json(
        { error: "trends array is required and must not be empty" },
        { status: 400 },
      );
    }

    if (trends.length > 20) {
      return NextResponse.json(
        { error: "Maximum 20 trends per request" },
        { status: 400 },
      );
    }

    // Validate each trend has required fields
    for (let i = 0; i < trends.length; i++) {
      const t = trends[i];
      if (!t.title || typeof t.title !== "string") {
        return NextResponse.json(
          { error: `trends[${i}].title is required and must be a string` },
          { status: 400 },
        );
      }
      if (!t.description || typeof t.description !== "string") {
        return NextResponse.json(
          { error: `trends[${i}].description is required and must be a string` },
          { status: 400 },
        );
      }
      if (!Array.isArray(t.etsy_tags)) {
        return NextResponse.json(
          { error: `trends[${i}].etsy_tags is required and must be an array` },
          { status: 400 },
        );
      }
      // IP gate on input: refuse trends that would produce
      // Etsy-banworthy listings. We do this at the input BOUNDARY so
      // the caller gets a clear error, not silent dropping.
      const ipHit = checkIdeaForIP({ title: t.title, tags: t.etsy_tags });
      if (ipHit) {
        return NextResponse.json(
          {
            error: `trends[${i}] references "${ipHit}", which is a trademarked franchise/character. Listings using this would get your Etsy shop banned. Remove or rename this trend.`,
            ip_blocked_trend: t.title,
            ip_matched: ipHit,
          },
          { status: 400 },
        );
      }
    }

    // Validate style
    const validStyles: CrossStitchStyle[] = ["cute", "vintage", "modern", "sampler", "pixel"];
    const resolvedStyle: CrossStitchStyle = validStyles.includes(style as CrossStitchStyle)
      ? (style as CrossStitchStyle)
      : "cute";

    // Process in batches to avoid hitting token limits
    const allResults: BulkPromptResult[] = [];

    for (let i = 0; i < trends.length; i += BATCH_SIZE) {
      const batch = trends.slice(i, i + BATCH_SIZE);
      const batchResults = await processBatch(apiKey, batch, resolvedStyle);
      allResults.push(...batchResults);
    }

    return NextResponse.json({
      results: allResults,
      count: allResults.length,
      style: resolvedStyle,
    });
  } catch (err: unknown) {
    console.error("[Cross-Stitch Bulk Prompts] Error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to generate prompts",
      },
      { status: 500 },
    );
  }
}
