// ═══ Etsy Seller Study ════════════════════════════════════════════════
// Takes a deep-scan result and asks Gemini to produce an actionable
// playbook:
//   • "Why they win" — 3 bullets summarizing the seller's edge
//   • Title template (with fill-in slots) the user can reuse
//   • Description template (with the exact section markers they use)
//   • Tag strategy — which tags to copy verbatim, which are branded/skip
//   • Pricing recommendation for matching their sweet spot
//   • Mockup/image style notes — what the images have in common so we
//     can generate lookalikes (background color, room type, frame style,
//     single vs gallery arrangement)
//   • 5 concrete product ideas to build that fit this seller's niche
//
// The output is structured JSON so the UI can render it directly and
// the user can apply individual pieces with one click.

import { callGeminiJSON, parseGeminiJSON } from "./gemini";
import type { SellerDeepScanResult } from "./etsy-seller-deep";

export interface SellerPlaybook {
  summary: {
    why_they_win: string[];   // 3-5 bullets
    niche_label: string;      // "moody botanical printables" etc.
    audience: string;         // who buys from them
    product_type: "digital" | "physical" | "mixed";
  };
  title_template: {
    pattern: string;          // e.g. "[SUBJECT] [STYLE] | [ROOM] Printable Wall Art | Digital Download"
    length_target: string;    // "90–120 chars"
    rules: string[];
  };
  description_template: {
    markers: string[];        // ['•••', '♥', '✦'] whichever they use
    sections: Array<{ heading: string; purpose: string; sample_line: string }>;
    length_target: string;
    rules: string[];
  };
  tags: {
    copy: string[];           // tags to use verbatim
    variants: string[];       // close variants to try
    skip: string[];           // branded/shop-name tags — do not copy
    notes: string;
  };
  pricing: {
    recommended_min: number;
    recommended_max: number;
    recommended_launch: number;  // single "start here" price
    rationale: string;
  };
  mockup_style: {
    overall_style: string;       // "bright, minimalist, neutral background"
    frame_style: string;         // "thin black frame" / "oak wood" / "floating canvas" / "wooden embroidery hoop"
    room_context: string;        // "bedroom" / "office" / "kitchen nook" / "reading nook"
    color_palette: string[];     // ["cream", "sage", "terracotta"]
    single_vs_gallery: "single" | "gallery" | "both";
    mockup_types?: string;       // "embroidery hoop on bookshelf" / "framed on wall" / "flat lay on fabric"
    photography_style?: string;  // "warm cozy lighting" / "bright and airy" / "dark moody"
    mj_prompt_hints: string;     // one sentence describing DESIGN style (NOT mockup) — prepended to MJ prompts
  };
  product_ideas: Array<{
    idea: string;                // "moody botanical triptych"
    why_it_fits: string;
    target_keywords: string[];
    suggested_mj_prompt: string;
    suggested_price: number;
  }>;
  actions: {
    match_style_notes: string;   // prepended to our mockup generator
    research_topics: string[];   // topics to queue into our trend research
  };
}

function truncateForPrompt(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function buildStudyPrompt(scan: SellerDeepScanResult): string {
  const top = scan.top_listings.slice(0, 10).map((l, i) => ({
    rank: i + 1,
    title: l.title,
    price: l.price,
    favorites: l.favorites,
    tags: l.tags,
    description_excerpt: truncateForPrompt(l.description, 600),
    age_days: l.age_days,
    is_digital: l.is_digital,
  }));

  const payload = {
    shop: {
      name: scan.shop.shop_name,
      url: scan.shop.url,
      total_sales: scan.shop.transaction_sold_count ?? 0,
      review_count: scan.shop.review_count ?? 0,
      review_average: scan.shop.review_average ?? 0,
      years_on_etsy: scan.derived.years_on_etsy,
      avg_daily_sales: scan.derived.avg_daily_sales,
      digital_share_pct: scan.derived.digital_share_pct,
    },
    velocity: {
      est_sales_24h: scan.velocity.est_sales_24h,
      est_sales_7d: scan.velocity.est_sales_7d,
      est_sales_30d: scan.velocity.est_sales_30d,
    },
    pricing: scan.pricing,
    title_patterns: scan.titles,
    tag_patterns: {
      top_tags: scan.tags.topTags.slice(0, 20),
      avg_per_listing: scan.tags.avgPerListing,
    },
    description_patterns: scan.descriptions,
    niche_breakdown: scan.niche_breakdown,
    top_listings: top,
    review_keywords: scan.review_sentiment.top_keywords,
  };

  return `You are a world-class Etsy competitive-intelligence analyst. You will study a single top seller and produce a precise, actionable playbook another digital-download seller can use to compete in the same niche.

INPUT DATA (JSON):
${JSON.stringify(payload, null, 2)}

TASK: Produce a JSON playbook with EXACTLY this shape — no extra keys, no missing keys:

{
  "summary": {
    "why_they_win": [<3 to 5 short bullets, each under 18 words>],
    "niche_label": "<4-6 word specific niche label>",
    "audience": "<who buys this — 1 sentence>",
    "product_type": "digital" | "physical" | "mixed"
  },
  "title_template": {
    "pattern": "<literal template with [SLOTS] in CAPS — match their actual separator and word order>",
    "length_target": "<e.g. 90-120 chars>",
    "rules": [<3-5 short rules extracted from their actual titles>]
  },
  "description_template": {
    "markers": [<the EXACT markers they use — e.g. '•••', '♥', '✦'>],
    "sections": [
      { "heading": "<section name>", "purpose": "<one sentence>", "sample_line": "<single line from their style>" }
    ],
    "length_target": "<e.g. 800-1200 chars>",
    "rules": [<3-5 rules>]
  },
  "tags": {
    "copy": [<10-13 tags worth copying verbatim — pick from their top tags, each ≤20 chars>],
    "variants": [<5-10 close variants>],
    "skip": [<tags to SKIP, e.g. the seller's brand/shop name>],
    "notes": "<one sentence explaining what to copy vs skip>"
  },
  "pricing": {
    "recommended_min": <number — match their sweet-spot low>,
    "recommended_max": <number — match their sweet-spot high>,
    "recommended_launch": <single best entry price>,
    "rationale": "<one sentence>"
  },
  "mockup_style": {
    "overall_style": "<2-4 word style label, e.g. 'bright minimalist' or 'moody dark academia'>",
    "frame_style": "<specific: 'thin black frame', 'oak wood', 'floating canvas', 'unframed print', 'wooden embroidery hoop'>",
    "room_context": "<one setting — 'modern bedroom', 'home office', 'kid's nursery', 'reading nook'>",
    "color_palette": [<3-5 color names>],
    "single_vs_gallery": "single" | "gallery" | "both",
    "mockup_types": "<what mockup presentation they use — e.g. 'embroidery hoop on bookshelf', 'framed on wall', 'flat lay on fabric', 'pattern chart preview'>",
    "photography_style": "<e.g. 'warm cozy lighting', 'bright and airy', 'dark moody', 'clean studio white'>",
    "mj_prompt_hints": "<ONE sentence under 40 words describing the DESIGN STYLE (color palette, illustration style, subject mood) — NOT the mockup/room. This gets prepended to MJ prompts that generate flat source illustrations>"
  },
  "product_ideas": [
    {
      "idea": "<concrete product concept>",
      "why_it_fits": "<one sentence>",
      "target_keywords": [<3-5 keywords>],
      "suggested_mj_prompt": "<a 30-60 word MJ prompt that generates a FLAT ILLUSTRATION of this subject on white background with limited colors, clean outlines, no gradients — ready for cross-stitch conversion. Must NOT describe a room scene or mockup. End with --ar 1:1 --v 6.1 --style raw>",
      "suggested_price": <number>
    }
    <... exactly 5 ideas, each DIFFERENT — no duplicates>
  ],
  "actions": {
    "match_style_notes": "<one paragraph of style notes we will inject into our mockup generator's prompt>",
    "research_topics": [<5-8 searchable topics to queue into trend research>]
  }
}

RULES:
1. Return ONLY the JSON object. No markdown fences, no prose.
2. Extract title/description/marker patterns from the REAL data — do not invent generic advice.
3. Keep every string short; this is structured data, not marketing copy.
4. For tags.skip, always include obvious brand/shop-name tokens.
5. If the data is insufficient for a field, use "unknown" or an empty array — do not hallucinate.
6. mj_prompt_hints must be a single sentence that a human could read aloud in under 10 seconds.`;
}

export async function studySeller(
  scan: SellerDeepScanResult,
  apiKey: string,
): Promise<SellerPlaybook> {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  const prompt = buildStudyPrompt(scan);
  const raw = await callGeminiJSON(apiKey, prompt);
  const playbook = parseGeminiJSON<SellerPlaybook>(raw);
  return playbook;
}

// Fallback heuristic playbook when Gemini is unavailable — still gives
// the user value from the raw patterns.
export function fallbackPlaybook(scan: SellerDeepScanResult): SellerPlaybook {
  const top = scan.titles.topWords.slice(0, 6).map((w) => w.word);
  const isDigital = scan.derived.digital_share_pct >= 60;
  const coreTags = scan.tags.topTags.slice(0, 13).map((t) => t.tag);
  const skipTags = scan.tags.topTags
    .filter((t) => t.tag.toLowerCase().includes(scan.shop.shop_name.toLowerCase()))
    .map((t) => t.tag);
  const sep = scan.titles.separatorUsage[0]?.char || "|";
  const commonMarkers = scan.descriptions.commonMarkers.length ? scan.descriptions.commonMarkers : ["•••"];
  const sweetSpotMid = Math.round(((scan.pricing.sweetSpot.lo + scan.pricing.sweetSpot.hi) / 2) * 100) / 100;

  return {
    summary: {
      why_they_win: [
        `${scan.shop.transaction_sold_count?.toLocaleString() ?? "?"} lifetime sales over ${scan.derived.years_on_etsy} years`,
        `Consistent ${scan.pricing.sweetSpot.lo}–${scan.pricing.sweetSpot.hi} pricing bracket`,
        `Titles front-load: ${top.slice(0, 3).join(", ")}`,
        `~${scan.velocity.est_sales_7d} sales/week recent velocity`,
      ],
      niche_label: top.slice(0, 3).join(" ") || scan.shop.shop_name,
      audience: "Based on tag patterns — unknown (Gemini study unavailable)",
      product_type: isDigital ? "digital" : (scan.derived.digital_share_pct < 30 ? "physical" : "mixed"),
    },
    title_template: {
      pattern: `[SUBJECT] ${sep} [STYLE] ${sep} [TYPE] ${sep} ${top[0] || "Digital"}`,
      length_target: `${Math.max(70, scan.titles.avgLength - 10)}-${Math.min(140, scan.titles.avgLength + 10)} chars`,
      rules: [
        `Average length ${scan.titles.avgLength} chars`,
        `Preferred separator: ${sep}`,
        `Emoji usage: ${scan.titles.emojiUsagePct}%`,
        `Title case in ${scan.titles.titleCasePct}% of listings`,
      ],
    },
    description_template: {
      markers: commonMarkers,
      sections: [
        { heading: "Hook", purpose: "What the buyer gets in one punchy line", sample_line: `${commonMarkers[0]} Welcome ${commonMarkers[0]}` },
        { heading: "What's included", purpose: "Deliverables list", sample_line: `${commonMarkers[0]} What's Included ${commonMarkers[0]}` },
        { heading: "Delivery", purpose: "Instant download + format", sample_line: `${commonMarkers[0]} Instant Download ${commonMarkers[0]}` },
        { heading: "Copyright", purpose: "Usage rights", sample_line: `${commonMarkers[0]} Terms ${commonMarkers[0]}` },
      ],
      length_target: `${Math.max(400, scan.descriptions.avgLength - 200)}-${scan.descriptions.avgLength + 200} chars`,
      rules: [
        `${scan.descriptions.usesMarkers}% of listings use marker sections`,
        `${scan.descriptions.usesBullets}% use bullets`,
        `Average ${scan.descriptions.avgParagraphs} paragraphs`,
      ],
    },
    tags: {
      copy: coreTags,
      variants: [],
      skip: skipTags,
      notes: "Gemini unavailable — copied top tags verbatim; review for brand-specific tokens to remove.",
    },
    pricing: {
      recommended_min: scan.pricing.sweetSpot.lo,
      recommended_max: scan.pricing.sweetSpot.hi,
      recommended_launch: sweetSpotMid,
      rationale: `Sweet-spot cluster holds ${
        scan.pricing.buckets.find((b) => b.lo === scan.pricing.sweetSpot.lo)?.count ?? 0
      } of ${scan.listings.length} listings`,
    },
    mockup_style: {
      overall_style: "unknown (AI study unavailable)",
      frame_style: "unknown",
      room_context: "unknown",
      color_palette: [],
      single_vs_gallery: "both",
      mockup_types: "unknown",
      photography_style: "unknown",
      mj_prompt_hints: "Study the image gallery manually — AI synthesizer unavailable.",
    },
    product_ideas: [],
    actions: {
      match_style_notes: "AI study unavailable. Inspect the image gallery on the deep-scan modal for visual cues.",
      research_topics: scan.tags.topTags.slice(0, 6).map((t) => t.tag),
    },
  };
}
