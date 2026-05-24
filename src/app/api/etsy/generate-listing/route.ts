// ── Etsy Listing Generator ──────────────────────────────────
// AI-powered Etsy listing generator using Gemini.
// Produces title, price, description, 13 tags, FAQs, and mockup ideas.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

export interface EtsyListingOutput {
  title: string;
  price: { min: number; max: number; recommended: number };
  description: string;
  tags: string[];
  faqs: Array<{ question: string; answer: string }>;
  categories: string[];
  mockupIdeas: string[];
  /** SEO attributes for Etsy taxonomy filters — cross-stitch only.
   *  Maps to property values like color/theme/holiday/recipient that
   *  Etsy uses to filter search results.  Phase 1 SEO fix 2026-05-17. */
  attributes?: {
    primaryColor?: string;
    secondaryColor?: string;
    theme?: string;
    holiday?: string;
    occasion?: string;
    recipient?: string;
  };
}

async function callGeminiJSON(
  apiKey: string,
  prompt: string,
  opts: { maxOutputTokens?: number; temperature?: number } = {},
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
            maxOutputTokens: opts.maxOutputTokens ?? 8192,
            temperature: opts.temperature ?? 0.6,
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
  // Close any unclosed string (odd number of unescaped quotes)
  const quoteCount = (s.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    s += '"';
  }
  // Close unclosed arrays and objects
  const opens = { '{': 0, '[': 0 };
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && (i === 0 || s[i - 1] !== '\\')) {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') opens['{']++;
    else if (ch === '}') opens['{']--;
    else if (ch === '[') opens['[']++;
    else if (ch === ']') opens['[']--;
  }
  // Remove trailing comma before closing
  s = s.replace(/,\s*$/, '');
  // Close arrays first, then objects
  for (let i = 0; i < opens['[']; i++) s += ']';
  for (let i = 0; i < opens['{']; i++) s += '}';
  return s;
}

const CURRENT_YEAR = new Date().getFullYear();

// ─────────────────────────────────────────────────────────────────
// SEO support — mine real Etsy market signals from our scan tables
// and inject them into the cross-stitch listing prompt.  Per 2026-05-17
// SEO audit: Gemini was generating tags blind to actual buyer queries,
// wasting tag slots on phrases nobody searches.  By feeding in proven
// top tags + autocomplete suggestions, the model anchors on real
// long-tail keywords.
// ─────────────────────────────────────────────────────────────────
function buildCrossStitchMarketContext(): string {
  try {
    const db = getDb();

    // Top tags across recent cross-stitch category scans.  We aggregate
    // by tag frequency (how often each tag appears across listings),
    // limited to keywords containing cross/stitch/embroidery so we
    // don't pollute with off-niche signals.
    const topTagRows = db.prepare(`
      SELECT json_each.value AS tag, COUNT(*) AS freq
      FROM tracked_listings, json_each(tracked_listings.tags)
      WHERE tracked_listings.tags IS NOT NULL
        AND (LOWER(tracked_listings.title) LIKE '%cross stitch%'
             OR LOWER(tracked_listings.title) LIKE '%embroidery%'
             OR LOWER(tracked_listings.title) LIKE '%xstitch%')
      GROUP BY json_each.value
      ORDER BY freq DESC
      LIMIT 25
    `).all() as Array<{ tag: string; freq: number }>;

    // Autocomplete phrases from recent keyword scans.
    const autocompleteRows = db.prepare(`
      SELECT keyword
      FROM scan_keyword_results
      WHERE LOWER(keyword) LIKE '%cross%stitch%'
         OR LOWER(keyword) LIKE '%embroidery%'
      ORDER BY scanned_at DESC
      LIMIT 30
    `).all() as Array<{ keyword: string }>;

    const topTags = topTagRows.map((r) => r.tag).filter(Boolean).slice(0, 20);
    const autocomplete = Array.from(new Set(autocompleteRows.map((r) => r.keyword).filter(Boolean))).slice(0, 15);

    if (topTags.length === 0 && autocomplete.length === 0) return "";

    let out = "\n\nREAL-MARKET CONTEXT — proven keywords from current Etsy scans (use as inspiration, do NOT copy verbatim):";
    if (topTags.length) {
      out += `\nTop tags competitors use: ${topTags.map((t) => `"${t}"`).join(", ")}`;
    }
    if (autocomplete.length) {
      out += `\nEtsy autocomplete phrases buyers type: ${autocomplete.map((k) => `"${k}"`).join(", ")}`;
    }
    out += `\nUse these as a seed for your 13 tags.  Pick proven long-tail phrases your subject naturally fits — never invent tags that don't appear in real searches.`;
    return out;
  } catch (err) {
    console.warn("[generate-listing] market-context query failed:", (err as Error).message);
    return "";
  }
}

// Server-side validator for cross-stitch tags.
// Returns: { valid: boolean, violations: string[] }
function validateCrossStitchTags(tags: unknown, title: string): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  if (!Array.isArray(tags)) {
    return { valid: false, violations: ["tags missing or not an array"] };
  }
  const titleTokens = title.toLowerCase().split(/\s+/);
  const titleNormalized = title.toLowerCase().replace(/[^a-z0-9 ]/g, "");
  tags.forEach((rawTag, idx) => {
    const tag = typeof rawTag === "string" ? rawTag : "";
    if (!tag) { violations.push(`tag[${idx}] empty`); return; }
    if (tag.length > 20) violations.push(`tag[${idx}] "${tag}" exceeds 20 chars`);
    const words = tag.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) violations.push(`tag[${idx}] "${tag}" is single-word — must be 2+ words`);
    if (words.length >= 2 && titleNormalized.includes(tag.toLowerCase())) {
      violations.push(`tag[${idx}] "${tag}" duplicates the title verbatim`);
    }
    // Reject pure generic single words even when paired with another
    // single word (e.g. "cute pdf" is two short generics — useless).
    const allGeneric = words.every((w) => ["cute","pretty","pdf","gift","cool","nice","new","print","art","design"].includes(w));
    if (allGeneric) violations.push(`tag[${idx}] "${tag}" is all generic single words`);
    void titleTokens;
  });
  return { valid: violations.length === 0, violations };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
      { status: 500 },
    );
  }

  try {
    const body = await req.json();

    // Detect product type: POD product vs PDF product vs Notion template
    const isPodProduct = body.templateType === "pod_product" || body.productFormat === "Print On Demand";
    const isPdfProduct = !isPodProduct && (!!body.productFormat || !!body.features);

    let prompt: string;
    if (isPodProduct) {
      prompt = buildPodEtsyPrompt({
        products: body.features || [],
        aesthetic: body.aesthetic || "minimalist",
        niche: body.niche || "",
        targetAudience: body.targetAudience || "",
      });
    } else if (isPdfProduct) {
      prompt = buildPdfEtsyPrompt({
        templateType: body.templateType,
        features: body.features || [],
        aesthetic: body.aesthetic || "Sage Green",
        niche: body.niche || "",
        productFormat: body.productFormat || "PDF Planner",
        targetAudience: body.targetAudience || "",
        complexity: body.complexity || "medium",
      });
    } else {
      prompt = buildEtsyPrompt({
        templateName: body.templateName,
        templateType: body.templateType,
        databases: body.databases || [],
        formulaNames: body.formulaNames,
        aesthetic: body.aesthetic,
        qualityTier: body.qualityTier,
        hasOnboarding: body.hasOnboarding,
        databaseCount: body.databaseCount,
      });
    }

    // Cross-stitch listings need ~12 K tokens for the full schema (title +
    // 1500-word description + 5 FAQs + 13 tags + 5 mockup ideas + attrs).
    // The default 8 K cap truncates Gemini mid-sentence; repairJSON closes
    // the braces but the result is a tagless listing that loops the retry
    // logic forever.  Bump to 16 K for headroom.  Other endpoints unaffected.
    //
    // Up to 2 attempts: if BOTH JSON.parse and repairJSON fail, retry the
    // entire Gemini call once.  This handles cases where Gemini returns
    // a malformed response (smart quotes mid-string, unescaped newlines)
    // that repairJSON can't fix.  Without this the route 500s and the
    // orchestrator's retry sees the error → infinite loop.
    let listing: EtsyListingOutput | null = null;
    let lastParseErr: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const text = await callGeminiJSON(apiKey, prompt, { maxOutputTokens: 16384 });
      try {
        listing = JSON.parse(text);
        break;
      } catch (e1) {
        try {
          listing = JSON.parse(repairJSON(text));
          break;
        } catch (e2) {
          lastParseErr = e2;
          console.warn(`[generate-listing] JSON parse attempt ${attempt}/2 failed:`, (e2 as Error).message);
          if (attempt === 2) {
            // Give up — let the outer catch return a 500 with detail.
            throw new Error(`Gemini returned unparseable JSON after 2 attempts: ${(e2 as Error).message}`);
          }
        }
      }
    }
    if (!listing) {
      throw new Error(`No valid listing produced: ${(lastParseErr as Error)?.message || "unknown"}`);
    }

    // Cross-stitch-specific tag handling: Gemini sometimes returns a
    // listing WITHOUT a tags array at all (only title/description/price
    // populated).  Other times tags are present but fail SEO validation
    // (single-word, duplicate-of-title, generic filler).  In BOTH cases
    // we retry once with a stricter prompt.  Without this, tagless
    // listings make it back to the orchestrator with tags=[], which
    // loops the retry logic forever.
    if (isPdfProduct && body.templateType === "cross_stitch_pattern") {
      const tagsMissing = !Array.isArray(listing.tags) || listing.tags.length === 0;
      const check = tagsMissing
        ? { valid: false, violations: ["no tags array in response"] }
        : validateCrossStitchTags(listing.tags, listing.title || "");
      if (!check.valid) {
        const reason = tagsMissing
          ? "Gemini omitted the tags array entirely — likely dropped fields under prompt pressure"
          : `tag validation failed (${check.violations.length}): ${check.violations.slice(0, 3).join(" | ")}`;
        console.warn(`[generate-listing] ${reason}`);
        const retryHint = tagsMissing
          ? `\n\n⚠️ RETRY — your previous response was missing the "tags" array entirely.  ` +
            `You MUST include ALL fields from the schema: title, description, tags (13 entries, 2+ words each), faqs (5), categories, mockupIdeas (5), attributes.  ` +
            `Same JSON schema as before — do NOT skip any field.`
          : `\n\n⚠️ RETRY — your previous tags failed SEO validation:\n${check.violations.slice(0, 10).map((v) => `  - ${v}`).join("\n")}\nRegenerate the ENTIRE listing.  Every tag must be 2+ words, must NOT duplicate the title, must NOT be pure generic filler.  Same JSON schema as before.`;
        try {
          const retryPrompt = `${prompt}${retryHint}`;
          const retryText = await callGeminiJSON(apiKey, retryPrompt, { maxOutputTokens: 16384 });
          const retryListing = (() => {
            try { return JSON.parse(retryText) as EtsyListingOutput; } catch {
              return JSON.parse(repairJSON(retryText)) as EtsyListingOutput;
            }
          })();
          // Accept the retry if it now has tags AND they're at least no
          // worse than the original.  Missing-tags case: any non-empty
          // tags array is an improvement.
          if (Array.isArray(retryListing.tags) && retryListing.tags.length > 0) {
            const recheck = validateCrossStitchTags(retryListing.tags, retryListing.title || "");
            if (tagsMissing || recheck.valid || recheck.violations.length < check.violations.length) {
              listing = retryListing;
            }
          }
        } catch (err) {
          console.warn("[generate-listing] tag retry failed (non-fatal):", (err as Error).message);
        }
      }
    }

    // Validate & sanitize
    if (listing.title && listing.title.length > 140) {
      listing.title = listing.title.substring(0, 140);
    }
    if (listing.tags) {
      listing.tags = listing.tags
        .slice(0, 13)
        .map((t: string) => t.substring(0, 20));
    }

    return NextResponse.json({ listing });
  } catch (err: unknown) {
    console.error("[Etsy Listing Generator] Error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to generate listing",
      },
      { status: 500 },
    );
  }
}

function buildEtsyPrompt(params: {
  templateName: string;
  templateType: string;
  databases: string[];
  formulaNames?: string[];
  aesthetic: string;
  qualityTier: string;
  hasOnboarding: boolean;
  databaseCount: number;
}): string {
  const {
    templateName,
    templateType,
    databases,
    formulaNames,
    aesthetic,
    qualityTier,
    hasOnboarding,
    databaseCount,
  } = params;

  const templateTypeNames: Record<string, string> = {
    finance_tracker: "Finance & Budget Tracker",
    adhd_planner: "ADHD-Friendly Planner",
    life_planner: "All-in-One Life Planner",
    social_media_planner: "Social Media Content Planner",
  };

  const typeName = templateTypeNames[templateType] || templateType;

  const lifeOsBoost = templateType === "life_os" ? `
BRAND POSITIONING (life_os — enforce strictly):
- Opening hook: "Run your entire life from one system."
- Positioning: "Built for people creating discipline"
- This is a PREMIUM all-in-one system, NOT just a planner. Position it above generic life planners.
- Mandatory tags (must include all): notion template, life planner, productivity system, habit tracker, goal tracker, focus timer, all in one planner
- Price anchor: $18-22 range — justify with 11 connected databases, 15+ formulas, and Pomodoro system
- Listing copy must reflect premium discipline-focused positioning, not casual planning
` : "";

  return `Generate a complete Etsy listing for a premium Notion template product.
${lifeOsBoost}

TEMPLATE DETAILS:
- Name: "${templateName}"
- Type: ${typeName}
- Databases: ${databases.join(", ")}
- Database count: ${databaseCount}
${formulaNames?.length ? `- Smart formulas: ${formulaNames.join(", ")}` : ""}
- Aesthetic: ${aesthetic}
- Quality tier: ${qualityTier}
- Has onboarding guide: ${hasOnboarding ? "Yes (Start Here page)" : "No"}

Return VALID JSON matching this exact schema:
{
  "title": "string (max 140 chars, SEO keyword-rich, include year ${CURRENT_YEAR}, include 'Notion Template')",
  "price": { "min": number, "max": number, "recommended": number },
  "description": "string (full listing description, 1000-1500 chars, use emoji section headers like ✨ 🎯 📦 💬, benefits-focused, mention specific databases and formulas)",
  "tags": ["exactly 13 unique tags, each max 20 chars, mix: 2 broad + 3 niche + 3 audience + 2 aesthetic + 2 benefit + 1 trending"],
  "faqs": [{"question": "string", "answer": "string"}],
  "categories": ["Etsy category path segments"],
  "mockupIdeas": ["5 brief mockup scene descriptions"]
}

RULES:
- Title format: "${CURRENT_YEAR} [Type] Notion Template | [Feature 1] + [Feature 2] | [Audience] | [Aesthetic]"
- Title MUST include "Notion Template" and be max 140 chars
- Description should sell BENEFITS not just features. Open with a pain point hook.
- Description sections: ✨ What's Included, 🎯 Perfect For, ⚡ Key Features, 📦 What You Get, ❓ FAQ
- Mention specific formula names as "smart automation" features
- Tags: exactly 13, each max 20 chars, all lowercase, no duplicates
- Mix tag types: broad ("notion template"), niche ("${templateType.replace("_", " ")} notion"), audience-specific, aesthetic, benefit-focused
- Price based on tier: ${qualityTier}
- FAQs: 5 items covering: compatibility, editing, refunds, updates, customization
- mockupIdeas: 5 specific scenes for product photography`;
}

function buildPdfEtsyPrompt(params: {
  templateType: string;
  features: string[];
  aesthetic: string;
  niche: string;
  productFormat: string;
  targetAudience: string;
  complexity: string;
}): string {
  const { templateType, features, aesthetic, niche, productFormat, targetAudience, complexity } = params;

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

  const typeName = typeNames[templateType] || templateType?.replace(/_/g, " ") || "PDF Planner";

  // Cross-stitch listings use a different title shape per Etsy's
  // recommendation engine — putting the SUBJECT first (e.g. "Frog
  // Knight Cross Stitch Pattern") instead of "2026 cross stitch
  // pattern PDF | …".  Etsy was auto-rewriting our titles in the
  // "Review new listing titles" modal otherwise, which (a) shows the
  // seller a yellow-flag prompt every publish and (b) downranks the
  // listing in search while the rewrite is pending.
  const isCrossStitch = templateType === "cross_stitch_pattern";
  if (isCrossStitch) {
    // Market-data context — top tags + autocomplete phrases mined from
    // recent Etsy scans of the cross-stitch niche.  Injected so Gemini
    // grounds its tag choices in REAL buyer queries instead of guessing.
    // Empty string when no scan data yet, prompt degrades gracefully.
    const marketCtx = buildCrossStitchMarketContext();

    return `Generate a complete Etsy listing for a digital cross-stitch pattern PDF.

PRODUCT DETAILS:
- Subject of the design: ${features.join(", ")}
- Color scheme / aesthetic: ${aesthetic}
- Target audience: ${targetAudience}
- Niche keywords: ${niche}
${marketCtx}

Return VALID JSON matching this exact schema:
{
  "title": "string (max 110 chars, Etsy-recommended shape — see RULES)",
  "price": { "min": number, "max": number, "recommended": number },
  "description": "string (full listing description, 1000-1500 chars, use emoji section headers, benefits-focused)",
  "tags": ["exactly 13 unique tags, each max 20 chars"],
  "faqs": [{"question": "string", "answer": "string"}],
  "categories": ["Etsy category path segments"],
  "mockupIdeas": ["5 brief mockup scene descriptions"],
  "attributes": {
    "primaryColor": "ONE color word matching Etsy's color taxonomy (e.g. 'pink', 'purple', 'green', 'blue', 'yellow', 'orange', 'red', 'black', 'white', 'beige', 'gray', 'brown', 'multicolor'). Pick the dominant color in the design.",
    "secondaryColor": "second most prominent color, same vocabulary, OR null if monochrome",
    "theme": "ONE word/phrase from: 'cottagecore', 'farmhouse', 'kawaii', 'nature', 'animals', 'food and drink', 'love and hearts', 'inspirational', 'rustic', 'whimsical', 'vintage'",
    "holiday": "Christmas/Halloween/Easter/Valentines/Thanksgiving/Mothers Day/Fathers Day — OR null if none applicable",
    "occasion": "wedding/birthday/anniversary/baby shower/graduation — OR null if none applicable",
    "recipient": "'for him' / 'for her' / 'children' / 'unisex_adults' — OR null"
  }
}

TITLE RULES (Etsy's preferred shape — MUST follow exactly):
- Format: "[Subject Name] Cross Stitch Pattern | [Theme1], [Theme2] (PDF Download)"
- Subject FIRST in Title Case (e.g. "Frog Knight", "Wizard Mouse", "Strawberry Duckling", "Bunny with Strawberry Basket")
- "Cross Stitch Pattern" appears EXACTLY ONCE, in Title Case
- ONE pipe "|" separator, then theme keywords with COMMAS (e.g. "Medieval Fantasy, Kawaii Cottagecore")
- End with parenthetical format suffix: "(PDF Download)" or "(Digital Download)"
- DO NOT prefix with the year (no "${CURRENT_YEAR}")
- DO NOT use words "Printable" or repeat "Digital Download" outside the parens
- DO NOT use multiple pipes "|" stacked together
- Max 110 chars total — Etsy's recommendation engine truncates anything longer
- Examples of GOOD titles:
    "Frog Knight Cross Stitch Pattern | Medieval Fantasy, Kawaii Cottagecore (PDF Download)"
    "Wizard Mouse Cross Stitch Pattern | Purple Robe, Gold Staff (Digital Download)"
    "Strawberry Duckling Cross Stitch Pattern | Kawaii Fruit Bird Cottagecore (PDF Download)"
    "Bunny Strawberry Basket Cross Stitch Pattern | Kawaii Cottagecore PDF Download"
- Examples of BAD titles (DO NOT GENERATE):
    "${CURRENT_YEAR} cross stitch pattern PDF | Frog Knight + Medieval Fantasy | Printable | Kawaii Cottagecore | Digital Download"  (year prefix, multiple pipes, "Printable" word)
    "Cute Frog Cross Stitch Design PDF Pattern"  (no "Cross Stitch Pattern" phrase, "Design" not allowed)

DESCRIPTION + TAG RULES:
- FIRST 160 CHARS OF DESCRIPTION are critical — they appear in Google + Etsy SERP previews.  Open with: the SUBJECT KEYWORD + a buyer-benefit sentence (e.g. "Whimsical Frog Knight cross stitch pattern — instant download PDF for a one-of-a-kind cottagecore stitching project. Beginner-friendly chart with full DMC color guide.").  Do NOT open with "Are you looking for…" / "Tired of…" — those waste the SERP preview.
- After the SEO hook, use emoji section headers: ✨ What's Inside, 🎯 Perfect For, ⚡ Key Features, 📦 What You Get, 📋 How to Use, ❓ FAQ
- Mention "instant download", "print at home", "A4 & Letter size", "PDF format"
- Total description 1000-1500 chars.

TAGS — strict SEO rules (Etsy ranks long-tail phrases higher than single words):
- Exactly 13 tags, each max 20 chars, all lowercase, no duplicates
- EVERY tag must be 2+ words (multi-word phrase).  Single-word tags ("pattern", "cute", "pdf") are FORBIDDEN — Etsy treats them as low-value.
- DO NOT repeat the title verbatim.  If your title contains "Frog Knight Cross Stitch Pattern", do NOT make a tag "frog knight cross stitch" — that's wasted space.  Instead create RELATED long-tail variants: "knight cross stitch", "fantasy stitch pattern", "medieval embroidery", "frog gift idea", "kawaii cross stitch", "frog wall art pattern", "fantasy needlework", etc.
- Mix tag categories (aim for 2-3 of each):
    • Broad subject: "cross stitch pattern", "embroidery pattern"
    • Specific subject: "frog cross stitch", "wizard pattern"
    • Aesthetic: "cottagecore stitch", "kawaii pattern"
    • Buyer intent: "instant download", "digital pdf"
    • Gift / occasion: "stitchers gift", "cozy gift"
    • Project type: "beginner pattern", "small hoop pattern"
- Price range $3-8 for cross-stitch patterns
- FAQs: 5 items — each Q must contain at least ONE long-tail keyword phrase the buyer would actually type into Etsy search.  Each A must repeat the subject + a buyer-benefit + an action verb.  These are SEO real-estate, not customer-service throwaways.  Required topics: file format ("What format is this cross stitch pattern PDF?"), printing ("Can I print this cross stitch chart at home on A4 / Letter?"), fabric count ("What Aida fabric count works best with this pattern?"), refunds ("Are digital cross stitch patterns refundable?"), sizing ("How big is the finished cross stitch design at 14ct / 16ct / 18ct Aida?").
- mockupIdeas: 5 specific hoop / framed / hands-stitching scenes

DESCRIPTION FAQ FORMATTING (critical — most sellers fluff this):
- The ❓ FAQ section in the description MUST repeat the same 5 Q/A pairs above (so they actually appear in the listing body, not just the JSON metadata).
- Format each Q in **bold** with a leading 🔹, followed by the answer on the next line.  Keep each answer ≤ 220 chars so buyers actually read them.
- The FAQ block goes LAST in the description (Etsy shows it in a collapsible drawer + Google indexes it for rich snippets / "People also ask" cards).

ATTRIBUTES — pick the BEST single value from each list.  These map to Etsy filter values; getting them right means your listing shows up in narrowed searches (e.g. "cross stitch + Color: Pink + Theme: Cottagecore").  Critical SEO step.`;
  }

  return `Generate a complete Etsy listing for a premium digital PDF planner product.

PRODUCT DETAILS:
- Product: ${typeName}
- Format: ${productFormat}
- Color scheme / aesthetic: ${aesthetic}
- Features: ${features.join(", ")}
- Target audience: ${targetAudience}
- Niche keywords: ${niche}
- Complexity: ${complexity}

Return VALID JSON matching this exact schema:
{
  "title": "string (max 140 chars, SEO keyword-rich, include year ${CURRENT_YEAR})",
  "price": { "min": number, "max": number, "recommended": number },
  "description": "string (full listing description, 1000-1500 chars, use emoji section headers, benefits-focused)",
  "tags": ["exactly 13 unique tags, each max 20 chars"],
  "faqs": [{"question": "string", "answer": "string"}],
  "categories": ["Etsy category path segments"],
  "mockupIdeas": ["5 brief mockup scene descriptions"]
}

RULES:
- Title format: "${CURRENT_YEAR} ${typeName} PDF | [Feature 1] + [Feature 2] | Printable | [Aesthetic] | Digital Download"
- Title MUST include "PDF" and be max 140 chars
- Description should sell BENEFITS not just features. Open with a relatable pain point hook.
- Description sections: ✨ What's Inside, 🎯 Perfect For, ⚡ Key Features, 📦 What You Get, 📋 How to Use, ❓ FAQ
- Mention "instant download", "print at home", "A4 & Letter size", "PDF format"
- Tags: exactly 13, each max 20 chars, all lowercase, no duplicates
- Mix tag types: broad ("pdf planner"), niche ("${typeName.toLowerCase()} pdf"), audience-specific, aesthetic, benefit-focused
- Price range $3-12 for PDF planners, based on complexity: ${complexity}
- FAQs: 5 items covering: file format, printing, editing, refunds, sizing
- mockupIdeas: 5 specific scenes for product photography`;
}

function buildPodEtsyPrompt(params: {
  products: string[];
  aesthetic: string;
  niche: string;
  targetAudience: string;
}): string {
  const { products, aesthetic, niche, targetAudience } = params;
  const productList = products.length > 0 ? products.join(", ") : "T-Shirt, Mug, Poster";

  return `Generate a complete Etsy listing for a Print On Demand product.

PRODUCT DETAILS:
- Products available: ${productList}
- Design style / aesthetic: ${aesthetic}
- Design keywords: ${niche}
- Target audience: ${targetAudience || "home decor lovers, gift shoppers, art enthusiasts"}

Return VALID JSON matching this exact schema:
{
  "title": "string (max 140 chars, SEO keyword-rich, include year ${CURRENT_YEAR})",
  "price": { "min": number, "max": number, "recommended": number },
  "description": "string (full listing description, 1000-1500 chars, use emoji section headers, benefits-focused)",
  "tags": ["exactly 13 unique tags, each max 20 chars"],
  "faqs": [{"question": "string", "answer": "string"}],
  "categories": ["Etsy category path segments"],
  "mockupIdeas": ["5 brief mockup scene descriptions"]
}

RULES:
- Title format: "${CURRENT_YEAR} [Design Name] [Product] | Custom [Style] Design | [Audience] | Unique Gift"
- Title MUST be max 140 chars and SEO-optimized
- Description should sell BENEFITS: unique design, quality materials, perfect gift, etc.
- Description sections: ✨ About This Design, 🎯 Perfect For, ⚡ Product Details, 📦 What You Get, 🎁 Gift-Worthy, ❓ FAQ
- Mention "printed to order", "high-quality materials", "unique design", "great gift idea"
- Tags: exactly 13, each max 20 chars, all lowercase, no duplicates
- Mix tag types: broad ("custom ${productList.split(",")[0]?.trim().toLowerCase() || "t-shirt"}"), niche ("${aesthetic} design"), audience-specific, gift-focused
- Price range $15-45 depending on product type
- FAQs: 5 items covering: sizing, shipping time, care instructions, returns, customization
- mockupIdeas: 5 specific product mockup scenes`;
}
