// ═══ Etsy Listing Optimizer ════════════════════════════════════════
// Fixes title, tags, price for the 0.74% CTR problem
// - Titles: pipe-formula with emotional hooks + urgency + long-tail
// - Tags: 13 LONG-TAIL tags instead of broad competitive ones
// - Price: cold-traffic test pricing ($1.99) or market-tuned

import { callGeminiJSON, parseGeminiJSON } from "./gemini";

// ─── Types ─────────────────────────────────────────────────────────
export type ProductType = "cross-stitch" | "wall-art" | "printable" | "digital";
export type PriceStrategy = "cold-traffic" | "market-match" | "premium";
export type CompetitionLevel = "low" | "medium" | "high" | "very high";

export interface CompetitorIntel {
  avgPrice?: number;
  topTags?: string[];
  competitionLevel?: CompetitionLevel;
  demandScore?: number; // 0-100
}

export interface OptimizedListing {
  titles: string[];        // 3 options with pipe formula
  description: string;
  tags: string[];          // 13 long-tail tags
  price: number;
  priceReason: string;
  socialProof?: string;    // suggested "10,000+ downloads" style hook
}

export interface OptimizerOptions {
  productType: ProductType;
  subject: string;                // e.g. "baby dragon", "sage green botanical"
  style?: string;                 // e.g. "cottagecore", "modern", "vintage"
  niche?: string;                 // e.g. "bedroom wall art"
  competitor?: CompetitorIntel;
  strategy?: PriceStrategy;       // default: cold-traffic for new shops

  // Optional real specs — if provided, inject into description so it matches
  // top-seller format (e.g. HappySlothPatterns' ••• blocks show real stitch counts)
  specs?: {
    // Cross-stitch specific
    stitchWidth?: number;
    stitchHeight?: number;
    dmcColorCount?: number;
    fabricCountsInches?: Array<{ count: number; wIn: number; hIn: number; wCm: number; hCm: number; hoop: number }>;
    // Wall art specific
    includedRatios?: Array<{ ratio: string; sizes: string[] }>;
    numFiles?: number;
    // Generic
    shopName?: string;
  };
}

// ─── Smart Pricing ─────────────────────────────────────────────────
/**
 * Cold-traffic test price: $1.99 — low friction entry to get first reviews
 * Market-match: slightly below competitor average
 * Premium: above average (only if strong brand/reviews)
 */
export function calculateSmartPrice(
  competitor: CompetitorIntel | undefined,
  strategy: PriceStrategy = "cold-traffic",
): { price: number; reason: string } {
  const avg = competitor?.avgPrice;
  const comp = competitor?.competitionLevel || "medium";
  const demand = competitor?.demandScore ?? 50;

  if (strategy === "cold-traffic") {
    // New shops / low review count: undercut aggressively
    return {
      price: 1.99,
      reason: "Cold traffic test price. Buyers won't hesitate at $1.99. Use this to collect reviews, then raise.",
    };
  }

  if (strategy === "premium") {
    const base = avg ? avg * 1.2 : 7.99;
    const price = Math.round(base * 100) / 100;
    return {
      price: Math.max(4.99, Math.min(14.99, price)),
      reason: `Premium positioning at 20% above market avg (${avg?.toFixed(2) || "est"}). Requires strong social proof.`,
    };
  }

  // Market match
  let price = avg ? avg * 0.88 : 4.49;

  if (comp === "very high") price *= 0.9;
  else if (comp === "low") price *= 1.1;

  if (demand > 70) price *= 1.08;
  else if (demand < 30) price *= 0.92;

  const finalPrice = Math.max(1.99, Math.min(12.99, Math.round(price * 100) / 100));
  return {
    price: finalPrice,
    reason: `Market-matched: 12% below avg (${avg?.toFixed(2) || "est"}) adjusted for ${comp} competition + demand ${demand}/100.`,
  };
}

// ─── Long-tail Tag Generator (non-AI fallback) ─────────────────────
const LONG_TAIL_MODIFIERS = [
  "printable",
  "digital download",
  "pdf",
  "instant download",
  "high resolution",
  "wall decor",
  "home decor",
  "gift idea",
  "set",
  "bundle",
  "modern",
  "boho",
];

/** Build fallback long-tail tags if Gemini unavailable */
export function buildFallbackTags(subject: string, productType: ProductType, style?: string): string[] {
  const base = subject.toLowerCase().trim();
  const style2 = style?.toLowerCase().trim() || "";

  const productWord = {
    "cross-stitch": "cross stitch",
    "wall-art": "wall art",
    "printable": "printable",
    "digital": "digital print",
  }[productType];

  const candidates: string[] = [];
  candidates.push(`${base} ${productWord}`);
  if (style2) candidates.push(`${style2} ${base}`);
  candidates.push(`${base} printable`);
  candidates.push(`${base} pdf pattern`);
  candidates.push(`${base} digital download`);
  if (style2) candidates.push(`${style2} ${productWord}`);
  candidates.push(`${base} gift`);
  candidates.push(`${base} decor`);
  candidates.push(`printable ${base}`);
  candidates.push(`instant ${base}`);
  candidates.push(`${base} set`);
  candidates.push(`${base} bundle`);
  candidates.push(`modern ${base}`);

  // Sanitize: max 20 chars, lowercase, unique
  const seen = new Set<string>();
  const result: string[] = [];
  for (const c of candidates) {
    const tag = c.toLowerCase().trim().substring(0, 20);
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      result.push(tag);
    }
    if (result.length === 13) break;
  }

  // Pad with generic long-tail if needed
  for (const m of LONG_TAIL_MODIFIERS) {
    if (result.length === 13) break;
    const tag = m.substring(0, 20);
    if (!seen.has(tag)) {
      seen.add(tag);
      result.push(tag);
    }
  }

  return result.slice(0, 13);
}

// ─── Etsy-recommended Title Builder (non-AI fallback) ──────────────
/**
 * Modern Etsy SEO format (mirrors Etsy's own title-recommendation engine):
 *   "[Subject] [Product Type]: [Attribute/Style] [Use Case] (PDF Download)"
 *   or
 *   "[Subject] [Product Type] | [Attribute] [Use Case]"
 *
 * Key rules:
 *   - Front-load the exact phrase buyers search ("Kokeshi Doll Cross Stitch Pattern")
 *   - 70–120 chars optimal (Etsy favors readable over stuffed)
 *   - At most one pipe or colon
 *   - Title Case, no ALL-CAPS, no emojis
 *   - Format goes in parens at the end, not as an all-caps banner
 */
function toTitleCase(str: string): string {
  return str
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Banner/filler adjectives that Etsy's own "Review new listing titles"
 * engine strips from the front of a subject. Real observed behavior:
 *   Input:  "Cute Duckling Cross Stitch Pattern: …"
 *   Output: "Duckling Cross Stitch Pattern: …"
 *
 * These words dilute search weight by pushing the real noun ("Duckling")
 * past the first-40-chars window. Keep the list focused on pure hype
 * adjectives — don't strip descriptive qualifiers like "Baby", "Mini",
 * "Floral" because those carry search intent.
 */
const BANNER_SUBJECT_PREFIXES = [
  "cute",
  "beautiful",
  "amazing",
  "gorgeous",
  "stunning",
  "lovely",
  "pretty",
  "unique",
  "awesome",
  "wonderful",
  "magical",
  "adorable",
  "charming",
];

/** Strip leading banner adjectives from a subject. Does NOT strip
 *  "adorable" when it's in a descriptor position — this runs only on
 *  the raw subject input where a user might have typed "Cute Duckling". */
function stripSubjectBannerWords(subject: string): string {
  const words = subject.trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && BANNER_SUBJECT_PREFIXES.includes(words[0].toLowerCase())) {
    words.shift();
  }
  return words.join(" ");
}

/** Industry term Etsy injects into the descriptor region for hand-craft
 *  pattern listings. Observed in Etsy's title recommendations for the
 *  cross-stitch/needlepoint category — Etsy treats "Needlecraft" as a
 *  high-weight category keyword and tacks it on if the title lacks one
 *  of {Needlecraft, Needlework, Embroidery}. We front-run that by
 *  baking it into the descriptor ourselves so our title matches what
 *  Etsy would have rewritten it to. */
function needlecraftDescriptor(base: string, productType: ProductType): string {
  if (productType !== "cross-stitch") return base;
  const lower = base.toLowerCase();
  // Don't double up if the user's own descriptor already contains a
  // needlecraft synonym — leave theirs alone.
  if (/(needlecraft|needlework|embroidery)/.test(lower)) return base;
  return `${base} Needlecraft`;
}

/** Normalize a finished title to match Etsy's title-recommendation
 *  engine output. Etsy will rewrite any title we submit that doesn't
 *  follow these rules, so apply them preemptively:
 *
 *    1. Strip banner adjectives from the very start (Cute, Adorable,
 *       Beautiful, …) — Etsy drops them. E.g. "Cute Duckling Cross
 *       Stitch Pattern: …" → "Duckling Cross Stitch Pattern: …"
 *    2. For cross-stitch only, if the title has no needlecraft synonym
 *       (Needlecraft/Needlework/Embroidery), swap standalone "Design"
 *       → "Needlecraft". Etsy does this globally; matching their output
 *       avoids the "Review new listing titles" modal that asks the
 *       seller to accept the rewrite.
 *
 *  Exported so the submission-time code path can apply the same pass
 *  as a belt-and-suspenders guard against manually-edited titles or
 *  titles that somehow bypass the optimizer's sanitizer. */
export function normalizeEtsyTitle(
  title: string,
  productType: ProductType,
): string {
  let t = title.trim();

  // 1. Strip leading banner adjectives. Loop so "Cute Beautiful Duckling"
  //    reduces to "Duckling" in one pass.
  const words = t.split(/\s+/);
  while (
    words.length > 1 &&
    BANNER_SUBJECT_PREFIXES.includes(words[0].toLowerCase())
  ) {
    words.shift();
  }
  t = words.join(" ");

  // 2. Cross-stitch specific: inject Needlecraft by swapping "Design"
  //    (Etsy's most common replacement target). Skip if the title
  //    already contains a needlecraft synonym.
  if (
    productType === "cross-stitch" &&
    !/\b(needlecraft|needlework|embroidery)\b/i.test(t)
  ) {
    t = t.replace(/\bDesign\b/g, "Needlecraft");
  }

  // 3. Strip keyword-stuffed filler that Etsy's ranking algorithm
  //    penalizes. Even when the prompt forbids them, Gemini still
  //    occasionally appends these — belt and suspenders. Observed on
  //    LIVE listings that Etsy later suggested shorter rewrites for:
  //      "Kawaii Chicken Teacup Cross Stitch Pattern PDF Counted Chart Digital Download | Cute Farm Animal Funny..."
  //    → Etsy rewrote to:
  //      "Kawaii Chicken Teacup Cross Stitch Pattern | Farm Animal Motivational Quote (Digital Download)"
  //    We pre-emptively do that rewrite here so Etsy's engine doesn't
  //    have to (and so the title we send is already the shape Etsy
  //    ranks highest).
  t = t
    // Kill the exact spam-phrase sequence.
    .replace(/\bPDF\s+Counted\s+Chart\s+Digital\s+Download\b/gi, "")
    .replace(/\bCounted\s+Chart\s+Digital\s+Download\b/gi, "")
    .replace(/\bCounted\s+Cross\s+Stitch\s+Pattern\s+PDF\s+Chart\b/gi, "Cross Stitch Pattern")
    // Strip duplicate "download" mentions — keep at most one.
    .replace(/(\bdigital\s+download\b[\s\S]*?)\bdigital\s+download\b/gi, "$1")
    .replace(/(\binstant\s+download\b[\s\S]*?)\bdigital\s+download\b/gi, "$1")
    .replace(/(\bdigital\s+download\b[\s\S]*?)\binstant\s+download\b/gi, "$1")
    // Strip "Counted Chart" and "Instant Download" as standalone filler
    // when they appear OUTSIDE parens (parens format like "(Digital Download)"
    // is fine and matches Etsy's own recommended shape).
    .replace(/\bCounted\s+Chart\b/gi, "")
    .replace(/(^|[^(])\bInstant\s+Download\b(?!\))/gi, "$1")
    // Collapse leftover separator+whitespace salad.
    .replace(/\s*\|\s*\|\s*/g, " | ")
    .replace(/\s*\|\s*$/g, "")
    .replace(/^\s*\|\s*/g, "")
    .replace(/\s*:\s*:\s*/g, ": ")
    .replace(/\s+,\s*/g, ", ")
    .replace(/\(\s*\)/g, "");

  // 4. Clamp to 140 (Etsy's hard limit) on a word boundary so we don't
  //    cut a word mid-letter if Gemini went long.
  t = t.replace(/\s+/g, " ").trim();
  if (t.length > 140) {
    const cut = t.substring(0, 140);
    const lastSpace = cut.lastIndexOf(" ");
    t = lastSpace > 100 ? cut.substring(0, lastSpace) : cut;
  }

  return t.trim();
}

export function buildFallbackTitles(
  subject: string,
  productType: ProductType,
  style?: string,
  niche?: string,
): string[] {
  // Strip banner adjectives ("Cute Duckling" → "Duckling") BEFORE
  // Title Casing so the subject starts with the real search noun.
  const subj = toTitleCase(stripSubjectBannerWords(subject.trim()));
  const styleText = style ? toTitleCase(style.trim()) : "";
  const nicheText = niche ? toTitleCase(niche.trim()) : "";

  const productWord = {
    "cross-stitch": "Cross Stitch Pattern",
    "wall-art": "Wall Art Print",
    "printable": "Printable",
    "digital": "Digital Download",
  }[productType];

  const formatSuffix = productType === "cross-stitch" ? "PDF Pattern"
    : productType === "wall-art" ? "Printable Wall Art"
    : "Digital Download";

  const useCase = nicheText || (productType === "wall-art" ? "Modern Home Decor" : "Handmade Craft Gift");
  const styleOrSubject = styleText ? `${styleText} ${subj}` : subj;

  // Three natural-language title shapes — pick based on what info is available.
  // For cross-stitch, Shape A's descriptor gets "Needlecraft" tacked on so
  // the title matches exactly what Etsy's rewrite engine would produce.
  const rawDescriptor = styleText || nicheText || "Modern Design";
  const descriptor = needlecraftDescriptor(rawDescriptor, productType);
  const templates = [
    // Shape A: Etsy's recommended short form — "[Subject] [Product]: [Descriptor] Needlecraft (PDF Download)"
    // This is the exact shape Etsy's "Review new listing titles" engine rewrites to.
    `${subj} ${productWord}: ${descriptor} (PDF Download)`,
    // Shape B: "Style Subject Product Type | Use Case"
    `${styleOrSubject} ${productWord} | ${useCase}`,
    // Shape C: "Subject Product Type for Use Case, Style (Format)"
    styleText
      ? `${subj} ${productWord} for ${useCase}, ${styleText} Design (${formatSuffix})`
      : `${subj} ${productWord} for ${useCase} (${formatSuffix})`,
  ];

  // Clean up double-spacing, trim, clamp to Etsy's 140-char limit
  return templates.map((t) =>
    t.replace(/\s+/g, " ").trim().substring(0, 140),
  );
}

// ─── Gemini-powered optimizer ──────────────────────────────────────
function buildOptimizerPrompt(opts: OptimizerOptions): string {
  const { subject, style, niche, productType, competitor } = opts;
  const avgPrice = competitor?.avgPrice ?? null;
  const comp = competitor?.competitionLevel ?? "medium";
  const demand = competitor?.demandScore ?? 50;
  const topTags = competitor?.topTags?.slice(0, 10) || [];

  const productWord = {
    "cross-stitch": "cross stitch pattern",
    "wall-art": "wall art",
    "printable": "printable",
    "digital": "digital download",
  }[productType];

  return `You are an Etsy SEO specialist writing titles that match Etsy's 2026 semantic-search algorithm.
Your output should look like what Etsy's own "Review new listing titles" recommendation engine would suggest — natural, readable, front-loaded with the exact phrase buyers search.

PRODUCT:
- Subject: ${subject}
- Style: ${style || "n/a"}
- Niche/Use case: ${niche || "n/a"}
- Type: ${productWord}

COMPETITOR INTEL:
- Average price: ${avgPrice ? `$${avgPrice.toFixed(2)}` : "unknown"}
- Competition: ${comp}
- Demand score: ${demand}/100
- Top competitor tags: ${topTags.join(", ") || "n/a"}

Return EXACT JSON:
{
  "titles": ["title1", "title2", "title3"],
  "description": "string",
  "tags": ["tag1", ..., "tag13"],
  "socialProof": "string (short hook)"
}

=== TITLE RULES — Etsy 2026 algorithm ===
Etsy penalizes keyword-stuffed, pipe-heavy, ALL-CAPS titles. Write NATURAL titles.

1. **Length**: 60–90 characters is the sweet spot (Etsy's own recommendation engine favors short, clean titles). Hard max 140. SHORT and readable beats long and stuffed.
2. **First 40 chars carry the most search weight** — front-load the exact phrase buyers type:
   - ✓ "Kokeshi Doll Cross Stitch Pattern..."
   - ✗ "Japanese Traditional Elegant Cultural Decor..." (attributes buried in front)
3. **Natural language** — write like a product display, not a keyword list:
   - ✓ "Kokeshi Doll Cross Stitch Pattern: Elegant Traditional Japanese Art (PDF Download)"
   - ✗ "Japanese|Kokeshi|Doll|Elegant|Traditional|Cross|Stitch|PDF|Instant|Download"
4. **Punctuation**: at most ONE separator per title. Use a colon (:) OR a single pipe (|) OR parentheses — never stack multiple.
5. **Title Case**: capitalize main words. NO ALL-CAPS. NO emojis. NO ★ ❤ symbols.
6. **Include** (in order): subject → product type → 1-2 key attributes → format in parens (e.g. "(PDF Download)", "(Printable)").
7. **Don't repeat**: "Cross Stitch Pattern PDF Chart Counted Digital Download" is 5 ways to say the same thing. Pick one.
8. **Avoid banner words** like "INSTANT DOWNLOAD", "SET OF 3", "BESTSELLER" — modern Etsy recommendation engine removes them. Instead use "(PDF Download)" or "(Set of 3)" naturally.
9. **Mirror buyer queries**: if a buyer would type "kawaii cross stitch pattern nursery", your title should contain that phrase verbatim.

GOOD TITLES (real Etsy-recommended format — these are what Etsy's own "Review new listing titles" engine rewrites to):
${productType === "cross-stitch" ? `- "Duckling Cross Stitch Pattern: Adorable Baby Animal Needlecraft (PDF Download)"
- "Kokeshi Doll Cross Stitch Pattern: Elegant Traditional Japanese Needlecraft (PDF Download)"
- "Baby Dragon Cross Stitch Pattern: Kawaii Chibi Nursery Needlecraft (PDF Download)"` : `- "Sage Green Botanical Wall Art | Modern Minimalist Bedroom Decor (Printable)"
- "Abstract Line Art Print: Neutral Boho Living Room Decor (Printable)"
- "Vintage Floral Wall Art for Nursery, Cottagecore Design (Printable)"`}

BAD TITLES (Etsy strips or penalizes these — do NOT produce):
- "Cute Duckling Cross Stitch Pattern..." — Etsy strips leading banner adjectives like "Cute", "Beautiful", "Adorable", "Gorgeous", "Stunning", "Lovely", "Unique" when they prefix the subject. Start with the REAL subject noun.
- "Japanese Kokeshi Doll | INSTANT DOWNLOAD | Elegant Traditional Art Cultural Decor Modern Counted Cross Stitch Pattern PDF Chart Digital"
- "DRAGON PATTERN | SET OF 3 | PRINTABLE | INSTANT DOWNLOAD | 2026 HIT"

${productType === "cross-stitch" ? `CRITICAL CROSS-STITCH RULES (Etsy forces these):
- NEVER prefix the subject with "Cute", "Beautiful", "Adorable", "Gorgeous", "Stunning", "Lovely", "Pretty", "Unique", "Amazing" — Etsy removes them automatically in title suggestions. Start with "Duckling" not "Cute Duckling".
- ALWAYS include the industry term "Needlecraft" in the descriptor section of Title 1. This is how Etsy classifies cross-stitch listings in its 2026 algorithm and the rewrite engine tacks it on if missing.
- The colon-separator short form is the Etsy-preferred shape — "[Subject] Cross Stitch Pattern: [Descriptor] Needlecraft (PDF Download)".

` : ""}Generate 3 titles each using a different shape so the user has real choices:
${productType === "cross-stitch" ? `- Title 1: EXACTLY Etsy's "Review new listing titles" recommended form — "[Subject] Cross Stitch Pattern: [Descriptor] Needlecraft (PDF Download)" — aim for 60–90 chars. Example: "Duckling Cross Stitch Pattern: Adorable Baby Animal Needlecraft (PDF Download)"` : `- Title 1: EXACTLY Etsy's "Review new listing titles" recommended form — short colon form: "[Subject] [Product Type]: [Descriptor] (PDF Download)" — aim for 50–80 chars`}
- Title 2: "Attribute Subject Product Type | Use Case" — single pipe form, 70–100 chars
- Title 3: "Subject Product Type for Use Case, Style Design (Format)" — comma form, 80–120 chars

=== TAG RULES — long-tail only ===
- EXACTLY 13 tags, each MAX 20 chars, all lowercase
- AVOID single-word broad tags ("dragon", "flower") — they lose to 500+ review shops
- USE long-tail 2-3 word phrases:
  ✓ "baby dragon pattern" (not "dragon")
  ✓ "sage green botanical" (not "botanical")
  ✓ "cottagecore wall art" (not "wall art")
- Cover intent layers:
  - 3 subject-specific long-tail (e.g. "baby dragon chibi")
  - 3 style-specific (e.g. "kawaii cross stitch", "cottagecore decor")
  - 3 use-case (e.g. "nursery wall art", "gift for mom")
  - 2 format (e.g. "pdf pattern", "digital download")
  - 2 seasonal/trending if relevant
- Tags should ADD keywords the title doesn't already contain — don't duplicate.
- NO duplicate tags, NO word-level repeats (e.g. don't have both "dragon pattern" and "dragon pdf")

=== DESCRIPTION RULES — match top Etsy bestseller format ===
Write the description in the EXACT structure that top-selling Etsy shops use (HappySlothPatterns for cross-stitch, ArchiveArtCo for wall art). This is a HARD requirement — Etsy buyers expect this layout.

${productType === "cross-stitch" ? `
FOR CROSS-STITCH — use TEXT section markers (••• Section Title •••), NOT emoji section markers. Structure:

••• This is a downloadable cross-stitch pattern •••
[Subject] Cross-Stitch Pattern.

[One sentence about the fabric — this pattern is designed with 14 count Aida cloth, can be stitched on any count.]

Stitch Count: [W x H if known, else "see pattern chart"]
Finished Sizes:
14 count: X x Y inches (Xcm x Ycm) - suits N inch hoop
16 count: ...
18 count: ...
20 count: ...
22 count: ...

DMC Colours: [number]
Cloth Colour: Any

••• The Download •••
Your pattern includes:
- Thread chart with symbol key and thread lengths
- Full colour pattern chart
- Black and white pattern (for easier printing)
- Symbol-only version (great for Pattern Keeper)

The pattern file will be available immediately after checkout.

••• Our Guarantee •••
[Short, warm paragraph about satisfaction guarantee.]

••• Copyright •••
[Short paragraph about original design, personal use only, no commercial reuse.]

Do NOT use emojis like 📄 ✨ 🖼️. Use the ••• text markers only.
` : `
FOR WALL ART / PRINTABLE — use ♥ section headers with ✦ bullet markers for size rows. Structure:

[One warm 3–4 sentence hook paragraph painting the mood/vibe of the art and how it enhances a home.]

♥ YOU WILL RECEIVE:
Your order includes [N] individual files in different size options, all ready for professional-quality printing at 300 DPI.
✦ 2:3 Ratio for Printing - 4"x6", 8"x12", 12"x18", 16"x24", 20"x30"
✦ 3:4 Ratio for Printing - 6"x8", 9"x12", 12"x16", 18"x24"
✦ 4:5 Ratio for Printing - 8"x10", 12"x15", 16"x20", 20"x25"
✦ 5:7 / ISO Size for Printing - 5"x7", A5, A4, A3, A2, A1
✦ 11:14 Ratio for Printing - 11"x14", 22"x28"

We're happy to help with free resizing for any sizes not listed.

♥ INSTANT DOWNLOAD:
[Short paragraph about instant Etsy delivery + mobile app workaround note.]

♥ HOW TO PRINT:
[Short paragraph: home printer, local print shop, or online print service. Mention matte/semi-gloss paper.]

♥ PLEASE NOTE:
• Colors may vary slightly based on monitor and printer.
• Depending on ratio, small crop may occur at edges.
• This is a digital file — no physical item will be shipped.
• Personal use only. Please do not resell the file or prints.

Thanks for visiting!

Do NOT use emojis like 📄 ✨ 🖼️. Use the ♥ and ✦ markers only.
`}

=== SOCIAL PROOF ===
- Short 5-10 word hook for the listing top or thumbnail
- Examples: "Loved by thousands of stitchers", "A cozy pick for modern crafters"
- Keep realistic — don't fake specific numbers unless they're true

PRICING is handled separately. Focus on titles + tags + description + hook.`;
}

export async function optimizeListing(opts: OptimizerOptions): Promise<OptimizedListing> {
  const apiKey = process.env.GEMINI_API_KEY;
  const pricing = calculateSmartPrice(opts.competitor, opts.strategy);

  // Fallback: no API key or API fails
  if (!apiKey) {
    return {
      titles: buildFallbackTitles(opts.subject, opts.productType, opts.style, opts.niche),
      description: buildFallbackDescription(opts.subject, opts.productType, opts.style, opts.niche, opts.specs),
      tags: buildFallbackTags(opts.subject, opts.productType, opts.style),
      price: pricing.price,
      priceReason: pricing.reason,
      socialProof: "New listing — be one of the first to download",
    };
  }

  try {
    const prompt = buildOptimizerPrompt(opts);
    const rawText = await callGeminiJSON(apiKey, prompt);
    const parsed = parseGeminiJSON<{
      titles?: string[];
      description?: string;
      tags?: string[];
      socialProof?: string;
    }>(rawText);

    return {
      titles: sanitizeTitles(parsed.titles || [], opts.subject, opts.productType, opts.style, opts.niche),
      description: parsed.description || buildFallbackDescription(opts.subject, opts.productType, opts.style, opts.niche, opts.specs),
      tags: sanitizeTags(parsed.tags || [], opts.subject, opts.productType, opts.style),
      price: pricing.price,
      priceReason: pricing.reason,
      socialProof: parsed.socialProof || "New release",
    };
  } catch (e) {
    console.error("[listing-optimizer] Gemini failed, using fallback:", e);
    return {
      titles: buildFallbackTitles(opts.subject, opts.productType, opts.style, opts.niche),
      description: buildFallbackDescription(opts.subject, opts.productType, opts.style, opts.niche, opts.specs),
      tags: buildFallbackTags(opts.subject, opts.productType, opts.style),
      price: pricing.price,
      priceReason: pricing.reason,
      socialProof: "New listing",
    };
  }
}

/**
 * Clean up model output to match Etsy's 2026 title guidelines AND
 * Etsy's hard character-set rules (the ones that trigger "Your title
 * contains invalid characters" errors at submit time).
 *
 * Etsy's stated rules on titles:
 *   - 140 char max
 *   - Only letters, numbers, spaces, and these punctuation marks:
 *       - (hyphen)   , (comma)   . (period)   ' (apostrophe)
 *       " (quote)    : (colon)   ; (semicolon)   (                 )
 *       | (pipe)     & (amp)     / (slash)    (hyphen)
 *   - No emojis, no symbols (™ ® © ★ ♥), no currency signs ($ € £),
 *     no hash/at (# @), no asterisk/bullet (*, •), no accented
 *     characters in the US-English shop language — other locales
 *     have looser rules, but sanitizing to ASCII is the safe default.
 *   - No repeated punctuation (!!, ??, --)
 *   - No more than 3 consecutive spaces (algorithm flags)
 *
 * Plus Etsy 2026 algorithm preferences:
 *   - Strip banner phrases ("INSTANT DOWNLOAD", "SET OF N", "BESTSELLER")
 *   - Collapse runs of pipes into one
 *   - Convert ALL-CAPS words (3+ letters) to Title Case
 *   - At most one separator type per title — if we see both `:` and
 *     `|`, keep the first separator-group and drop the second.
 *   - Trim, clamp to 140 chars on a word boundary so we don't cut
 *     mid-word when we hit the limit.
 */
function sanitizeTitles(
  titles: string[],
  subject: string,
  productType: ProductType,
  style?: string,
  niche?: string,
): string[] {
  const BANNER_PATTERNS = [
    /\|\s*INSTANT DOWNLOAD\s*(\||$)/gi,
    /\|\s*BESTSELLER[^|]*\s*(\||$)/gi,
    /\|\s*\d{4} HIT\s*(\||$)/gi,
    /\|\s*SET OF \d+\s*(\||$)/gi,
    /\|\s*PRINTABLE\s*(\||$)/gi,
  ];

  // Disallowed characters: anything outside Etsy's whitelist. We keep
  // A-Za-z0-9, whitespace, and the punctuation Etsy explicitly allows
  // (- , . ' " : ; ( ) | & /). Everything else — emojis, symbols,
  // trademark marks, currency, accented letters — gets stripped.
  const ALLOWED_CHAR_RX = /[^A-Za-z0-9\s\-,.'":;()|&/]/g;

  const cleaned = titles
    .filter((t) => typeof t === "string" && t.trim().length > 0)
    .map((raw) => {
      // Apply Etsy title-rewrite norms FIRST (banner-word strip +
      // Design→Needlecraft for cross-stitch). Gemini regularly ignores
      // the prompt's rules and produces titles that Etsy then rewrites
      // in the "Review new listing titles" modal. Doing this pass up
      // front means the seller never sees that modal.
      let t = normalizeEtsyTitle(raw, productType);

      // Strip ALL-CAPS banner segments between pipes FIRST (before
      // the caps-to-title-case pass accidentally preserves them).
      for (const pat of BANNER_PATTERNS) {
        t = t.replace(pat, "|");
      }

      // Hard-strip any disallowed character. This turns "Café ★ Pattern"
      // into "Caf  Pattern" which we then collapse to "Caf Pattern".
      // Not perfect (loses the accent) but the trade-off is always
      // letting the title submit vs. blocking the whole listing.
      t = t.replace(ALLOWED_CHAR_RX, " ");

      // Convert remaining ALL-CAPS words (3+ letters) to Title Case.
      // Leaves "PDF", "DMC", "ISO" alone — those are acceptable acronyms.
      t = t.replace(/\b[A-Z]{3,}\b/g, (w) => {
        const ACCEPTED_ACRONYMS = new Set(["PDF", "DMC", "ISO", "SVG", "JPG", "PNG", "DPI"]);
        if (ACCEPTED_ACRONYMS.has(w)) return w;
        return w.charAt(0) + w.slice(1).toLowerCase();
      });

      // Collapse multiple pipes to a single one
      t = t.replace(/\s*\|\s*\|+\s*/g, " | ");
      // Collapse repeated punctuation (!!, ??, --, ::, ,,, etc.)
      t = t.replace(/([!?.:;,\-])\1+/g, "$1");
      // Strip leading/trailing pipes
      t = t.replace(/^\s*\|\s*/, "").replace(/\s*\|\s*$/, "");
      // Collapse runs of whitespace to single space
      t = t.replace(/\s+/g, " ").trim();
      // Strip leading/trailing punctuation that was orphaned by the
      // stripping passes above (e.g. leading " : " or trailing " , ").
      t = t.replace(/^[,.:;|&\s]+|[,.:;|&\s]+$/g, "").trim();

      // Clamp to 140 chars on a word boundary so we don't leave a
      // truncated half-word like "Cross Sti" at the end.
      if (t.length > 140) {
        const cut = t.substring(0, 140);
        const lastSpace = cut.lastIndexOf(" ");
        t = lastSpace > 100 ? cut.substring(0, lastSpace) : cut;
      }

      return t;
    })
    .filter((t) => t.length > 0);

  const fallbacks = buildFallbackTitles(subject, productType, style, niche);
  while (cleaned.length < 3) cleaned.push(fallbacks[cleaned.length] || fallbacks[0]);
  return cleaned.slice(0, 3);
}

function sanitizeTags(tags: string[], subject: string, productType: ProductType, style?: string): string[] {
  const cleaned = (tags || [])
    .map((t) => (typeof t === "string" ? t.toLowerCase().trim().substring(0, 20) : ""))
    .filter((t) => t.length > 0);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const t of cleaned) {
    if (!seen.has(t)) {
      seen.add(t);
      unique.push(t);
    }
  }
  const fallback = buildFallbackTags(subject, productType, style);
  for (const f of fallback) {
    if (unique.length === 13) break;
    if (!seen.has(f)) {
      seen.add(f);
      unique.push(f);
    }
  }
  return unique.slice(0, 13);
}

// ─── Bestseller-format description builders ─────────────────────────
// Modeled on top Etsy shops (HappySlothPatterns for cross-stitch, ArchiveArtCo
// for wall art). Uses text-only section separators (••• or ♥) that render
// cleanly on Etsy — NO emojis like 📄 ✨ which look amateurish vs competitors.

function toTitleCaseSimple(s: string): string {
  return s.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function buildCrossStitchDescription(subject: string, specs?: OptimizerOptions["specs"]): string {
  const subjectTitle = toTitleCaseSimple(subject);

  // Build size table — use provided specs or sensible defaults for each fabric count
  const w = specs?.stitchWidth;
  const h = specs?.stitchHeight;
  const dmcCount = specs?.dmcColorCount;

  let sizeTable = "";
  if (w && h) {
    const rows = specs?.fabricCountsInches && specs.fabricCountsInches.length > 0
      ? specs.fabricCountsInches
      : [14, 16, 18, 20, 22].map((c) => ({
          count: c,
          wIn: Math.round((w / c) * 10) / 10,
          hIn: Math.round((h / c) * 10) / 10,
          wCm: Math.round((w / c) * 2.54 * 10) / 10,
          hCm: Math.round((h / c) * 2.54 * 10) / 10,
          hoop: Math.max(5, Math.ceil(Math.max(w, h) / c) + 2),
        }));
    sizeTable = `Stitch Count: ${w} x ${h}
Finished Sizes:
${rows.map(r => `${r.count} count: ${r.wIn} x ${r.hIn} inches (${r.wCm} x ${r.hCm} cm) - suits ${r.hoop} inch hoop`).join("\n")}

DMC Colours: ${dmcCount ?? "see pattern chart"}
Cloth Colour: Any`;
  } else {
    sizeTable = `Stitch Count: see pattern chart
Finished sizes vary with fabric count. 14-count Aida gives the most common size; the pattern also works on 16, 18, 20, and 22-count.

DMC Colours: see pattern chart
Cloth Colour: Any`;
  }

  const shopLine = specs?.shopName
    ? `This is an original cross stitch pattern by ${specs.shopName}. We own the license to this artwork.`
    : `This is an original cross stitch pattern. The designer owns the license to this artwork.`;

  return `••• This is a downloadable cross-stitch pattern •••
${subjectTitle} Cross-Stitch Pattern.

This pattern is designed with 14 count Aida cloth, can be stitched on any grade of canvas. The size will change based on the thread count of your fabric.

${sizeTable}

••• The Download •••
Your pattern includes:
- Thread chart with symbol key and thread lengths
- Full colour pattern chart
- Black and white pattern (for easier printing)
- Symbol-only version (great for Pattern Keeper)

The pattern file will be available immediately after checkout.

••• Our Guarantee •••
Your satisfaction matters. If you have any questions or aren't happy for any reason, please reach out — we respond quickly and are here to help.

••• License & Copyright •••
${shopLine}

This pattern is licensed to the purchaser for PERSONAL USE ONLY. You may stitch as many copies as you like for yourself or as gifts, and share photos of your finished work. You may also sell a small number of finished stitched pieces at local markets.

You may NOT resell, re-upload, or redistribute the PDF files. You may NOT list this pattern on Etsy, eBay, or any marketplace under your own name. You may NOT share the chart on Discord, Telegram, Facebook groups, or file-sharing sites.

Every pattern we sell carries a unique traceable Pattern ID printed on the license page and every chart page. We actively monitor marketplaces and file-sharing sites, and pursue DMCA takedowns against piracy. Please respect the work that went into this design — thank you.`;
}

function buildWallArtDescription(subject: string, style: string | undefined, niche: string | undefined, specs?: OptimizerOptions["specs"]): string {
  const subj = toTitleCaseSimple(subject);
  const styleText = style ? ` ${toTitleCaseSimple(style)}` : "";
  const roomText = niche ? ` for your ${niche.toLowerCase()}` : "";

  // Size grid — use provided specs or defaults based on 7 standard ratios
  const ratios = specs?.includedRatios && specs.includedRatios.length > 0
    ? specs.includedRatios
    : [
        { ratio: "2:3", sizes: ['4"x6"', '8"x12"', '12"x18"', '16"x24"', '20"x30"'] },
        { ratio: "3:4", sizes: ['6"x8"', '9"x12"', '12"x16"', '18"x24"'] },
        { ratio: "4:5", sizes: ['8"x10"', '12"x15"', '16"x20"', '20"x25"'] },
        { ratio: "5:7 / ISO", sizes: ['5"x7"', "A5, A4, A3, A2, A1"] },
        { ratio: "11:14", sizes: ['11"x14"', '22"x28"'] },
      ];
  const numFiles = specs?.numFiles ?? ratios.length;

  return `Add a touch of${styleText} elegance to your home with this${styleText} ${subj} printable art piece. This beautifully crafted digital download blends stylish aesthetics with timeless artistry, making it an ideal choice${roomText}. Whether displayed as part of a gallery wall or as a standalone focal point, this artwork will enhance any living space.

♥ YOU WILL RECEIVE:
Your order includes ${numFiles} individual high-resolution files in different size options, all ready for professional-quality printing at 300 DPI.
${ratios.map(r => `✦ ${r.ratio} Ratio for Printing - ${r.sizes.join(", ")}`).join("\n")}

We're happy to help with free resizing for any sizes not listed — just send a message.

♥ INSTANT DOWNLOAD:
Once your payment is processed, Etsy will automatically send your files. You can access them from the Purchases section of your Etsy account. Note: the Etsy mobile app currently doesn't support downloads — please sign in via mobile browser (Safari, Chrome) to grab your files on phone.

♥ HOW TO PRINT:
You can print your art immediately at home, at a local print shop, or through an online print service. For best results use matte or semi-gloss photo paper.

♥ PLEASE NOTE:
• Colors may vary slightly based on monitor calibration, printer settings, and paper type.
• Depending on the chosen ratio there may be a small crop at the edges.
• This is a digital file — no physical item will be shipped.
• For personal use only; please do not resell the file or any prints generated from it.

Thanks for visiting!`;
}

function buildFallbackDescription(subject: string, productType: ProductType, style?: string, niche?: string, specs?: OptimizerOptions["specs"]): string {
  if (productType === "cross-stitch") {
    return buildCrossStitchDescription(subject, specs);
  }
  if (productType === "wall-art") {
    return buildWallArtDescription(subject, style, niche, specs);
  }

  // Generic printable / digital
  const subjectTitle = toTitleCaseSimple(subject);
  const productWord = productType === "printable" ? "printable" : "digital download";
  return `Add a beautiful touch to your space with this ${subjectTitle} ${productWord}. Crafted for easy printing at home or through a local print shop — perfect for quick, personal decor.

♥ YOU WILL RECEIVE:
• High-resolution files ready for printing
• Multiple standard sizes included
• Instant download after purchase — no shipping wait

♥ HOW TO USE:
Download your files from Etsy after purchase, print at home on quality paper or upload to a print service, trim if needed, and enjoy.

♥ PLEASE NOTE:
• This is a digital file — no physical item will be shipped.
• Colors may vary slightly based on printer and paper.
• For personal use only. Please do not resell the file or prints.

Thanks for visiting!`;
}
