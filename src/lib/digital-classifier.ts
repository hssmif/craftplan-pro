// ══════════════════════════════════════════════════════════════════════
// Digital Product Classifier
//
// Given a search term, classify whether it represents a primarily
// DIGITAL product (PDF planner, SVG, Notion template, ...), PHYSICAL
// product (mug, t-shirt, jewelry, ...), or MIXED (term covers both,
// like "fathers day" or "wedding").
//
// Used to filter Marketplace Insights captures so /research surfaces
// only ideas the user's factories can actually produce (= digital).
//
// Two-tier strategy:
//   1. HEURISTIC — keyword regex match. Fast, free, deterministic,
//      handles ~80% of terms cleanly (definitive digital/physical
//      vocabulary).
//   2. GEMINI fallback — for terms the heuristic flags as ambiguous,
//      one Gemini call resolves it. Results are cached in the DB
//      via classified_by="gemini" so we never re-classify the same
//      term twice.
// ══════════════════════════════════════════════════════════════════════

export type DigitalClass = "digital" | "physical" | "mixed";
export type ClassifiedBy = "heuristic" | "gemini" | "manual";

export interface ClassificationResult {
  isDigital: DigitalClass;
  digitalNiche: string | null;     // e.g. "planners", "cut-files", "wall-art"
  classifiedBy: ClassifiedBy;
}

// ── Vocabulary ────────────────────────────────────────────────────────
// These three lists drive the heuristic. Term must match BY WORD —
// substring matches inside compound words are allowed (e.g. "printable"
// matches "printable art" via the regex compiled below).

// Strong digital markers — if present, the term is almost certainly digital
const DIGITAL_MARKERS = [
  // File formats
  "pdf", "svg", "png", "jpeg", "jpg", "eps", "ai", "psd",
  // Format adjectives
  "digital", "printable", "instant download", "instant-download",
  // Platform-specific
  "goodnotes", "notability", "notion", "canva", "procreate", "cricut",
  "lightroom", "photoshop", "figma",
  // Categories of digital products
  "preset", "template", "clipart", "clip art", "vector",
  "sublimation", "wallpaper",
];

// Strong physical markers — if present, the term is almost certainly physical
const PHYSICAL_MARKERS = [
  // Material/substance
  "wood", "wooden", "ceramic", "metal", "leather", "stainless",
  "glass", "crystal", "stone", "marble", "fabric", "cotton", "linen",
  "yarn", "thread", "fiber", "plastic",
  // Product nouns that are inherently physical
  "mug", "tumbler", "cup", "bottle", "candle", "soap",
  "necklace", "earring", "bracelet", "ring", "pendant",
  "hoodie", "jacket", "dress", "scarf", "hat", "cap",
  "blanket", "pillow", "rug", "throw", "curtain",
  "trinket", "figurine", "ornament", "statue",
  // Action verbs
  "ship to", "ships from", "handmade",
  // Service/experience
  "tarot reading", "psychic",
];

// Niche → terms that, if matched, label the term with that niche bucket.
// Order matters — first match wins. Niches are stable IDs used by the
// market-pulse + AnchorSweepPanel UIs (consistent with digital-anchors.ts).
const DIGITAL_NICHE_MARKERS: Array<{
  niche: string;
  markers: string[];
}> = [
  { niche: "patterns-needle", markers: ["cross stitch", "embroidery", "knitting", "crochet", "sewing", "needlepoint"] },
  { niche: "planners",        markers: ["planner", "budget tracker", "habit tracker", "meal planner", "paycheck"] },
  { niche: "cut-files",       markers: ["svg", "cricut", "cut file", "silhouette", "sublimation", "clipart", "clip art", "vector"] },
  { niche: "templates",       markers: ["notion template", "canva template", "resume template", "instagram template", "highlight cover"] },
  { niche: "invitations",     markers: ["invitation", "save the date", "save-the-date", "rsvp"] },
  { niche: "wall-art",        markers: ["wall art", "print art", "art print", "poster", "wall print", "nursery print"] },
  { niche: "activity",        markers: ["coloring page", "coloring book", "worksheet", "activity sheet", "kids printable"] },
  { niche: "apparel-designs", markers: ["t shirt png", "t-shirt png", "shirt design", "tumbler wrap", "mug design"] },
  { niche: "editorial-media", markers: ["lightroom", "preset", "font", "logo template", "mockup", "wallpaper"] },
  { niche: "other-digital",   markers: ["ebook", "pdf", "printable journal", "recipe card", "bookmark"] },
];

// Words that often appear in both physical and digital listings —
// ambiguous on their own. If the ONLY signal is one of these, defer
// to Gemini (or default to "mixed").
const AMBIGUOUS_MARKERS = [
  "wedding", "birthday", "fathers day", "mothers day", "graduation",
  "gift", "anniversary", "valentines day", "halloween", "christmas",
  "decor", "decoration", "personalized", "custom",
];

// Build a word-boundary-friendly regex from a marker list.
// We don't use \b because some markers contain spaces; instead we
// pad the term and the haystack with spaces and look for "<marker>".
function compileMarkers(markers: string[]): RegExp {
  // Sort by length desc so longer markers match before shorter prefixes.
  const sorted = [...markers].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?:^|\\s|-)(?:${escaped.join("|")})(?:$|\\s|-)`, "i");
}

const DIGITAL_RE = compileMarkers(DIGITAL_MARKERS);
const PHYSICAL_RE = compileMarkers(PHYSICAL_MARKERS);
const AMBIGUOUS_RE = compileMarkers(AMBIGUOUS_MARKERS);

// ── Heuristic classifier ──────────────────────────────────────────────
export function classifyHeuristic(term: string): ClassificationResult | null {
  const padded = ` ${term.toLowerCase().trim()} `;

  const hasDigital = DIGITAL_RE.test(padded);
  const hasPhysical = PHYSICAL_RE.test(padded);
  const hasAmbiguous = AMBIGUOUS_RE.test(padded);

  // Find niche if any
  let niche: string | null = null;
  for (const { niche: n, markers } of DIGITAL_NICHE_MARKERS) {
    const re = compileMarkers(markers);
    if (re.test(padded)) {
      niche = n;
      break;
    }
  }

  // Clear digital + no physical = digital
  if (hasDigital && !hasPhysical) {
    return { isDigital: "digital", digitalNiche: niche, classifiedBy: "heuristic" };
  }
  // Clear physical + no digital = physical
  if (hasPhysical && !hasDigital) {
    return { isDigital: "physical", digitalNiche: null, classifiedBy: "heuristic" };
  }
  // Both digital and physical markers = mixed
  if (hasDigital && hasPhysical) {
    return { isDigital: "mixed", digitalNiche: niche, classifiedBy: "heuristic" };
  }
  // Only ambiguous markers (no clear signal) = signal Gemini fallback
  if (hasAmbiguous) {
    return null;
  }
  // No matches at all — terms like "boho", "minimalist" alone.
  // Default to mixed for safety; downstream can re-classify.
  return null;
}

// ── Gemini classifier (single-term batch helper) ──────────────────────
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_CHAIN = ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite"];

const NICHE_VOCAB = DIGITAL_NICHE_MARKERS.map((n) => n.niche).join(", ");

/** Classify multiple terms in a single Gemini call. Used to fill in
 *  the ambiguous tail the heuristic couldn't resolve. Caps batch at 30
 *  terms (output stays small enough to round-trip fast).
 *
 *  Returns same-length array as input; entries that Gemini couldn't
 *  classify confidently default to {isDigital: "mixed", ...}. */
export async function classifyWithGeminiBatch(
  terms: string[],
): Promise<ClassificationResult[]> {
  if (terms.length === 0) return [];
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // No API key — return safe defaults so the pipeline doesn't break
    return terms.map(() => ({
      isDigital: "mixed",
      digitalNiche: null,
      classifiedBy: "gemini",
    }));
  }

  const cappedTerms = terms.slice(0, 30);
  const prompt = `You are classifying Etsy search terms. For each term, decide:

1. is_digital: "digital" if the term is for a DIGITAL product (PDF, SVG, PNG, template, planner, printable, preset, etc. — a file you download), "physical" if it's for a PHYSICAL product (mug, shirt, jewelry, candle, etc. — something shipped), or "mixed" if the term is genuinely both (e.g. "wedding invitation" could be physical OR digital).

2. digital_niche: ONLY if is_digital is "digital" or "mixed". Pick the SINGLE best bucket from: ${NICHE_VOCAB}. If none fits, return null.

Return strict JSON: {"results": [{"is_digital": "...", "digital_niche": "..."}]}. EXACTLY ${cappedTerms.length} entries, in input order.

Terms:
${cappedTerms.map((t, i) => `${i}. ${t}`).join("\n")}`;

  for (const model of MODEL_CHAIN) {
    try {
      const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 4096,
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(25000),
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;
      let parsed: { results?: Array<{ is_digital: string; digital_niche?: string | null }> };
      try {
        parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, ""));
      } catch {
        continue;
      }
      const results = parsed.results ?? [];
      const validClasses = new Set<DigitalClass>(["digital", "physical", "mixed"]);
      const validNiches = new Set(DIGITAL_NICHE_MARKERS.map((n) => n.niche));

      const out: ClassificationResult[] = cappedTerms.map((_, i) => {
        const r = results[i];
        const cls = (r?.is_digital ?? "mixed") as DigitalClass;
        const niche = r?.digital_niche ?? null;
        return {
          isDigital: validClasses.has(cls) ? cls : "mixed",
          digitalNiche: niche && validNiches.has(niche) ? niche : null,
          classifiedBy: "gemini",
        };
      });
      // Pad to original length if we truncated
      while (out.length < terms.length) {
        out.push({ isDigital: "mixed", digitalNiche: null, classifiedBy: "gemini" });
      }
      return out;
    } catch {
      continue;
    }
  }
  // All models failed — safe defaults
  return terms.map(() => ({ isDigital: "mixed", digitalNiche: null, classifiedBy: "gemini" }));
}

/** One-stop classifier: tries heuristic first, falls back to Gemini
 *  for ambiguous terms. Returns null only on hard error. */
export async function classifyTerm(term: string): Promise<ClassificationResult> {
  const h = classifyHeuristic(term);
  if (h) return h;
  const [g] = await classifyWithGeminiBatch([term]);
  return g;
}
