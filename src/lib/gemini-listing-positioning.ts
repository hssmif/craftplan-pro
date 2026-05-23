// ══════════════════════════════════════════════════════════════
// Gemini Listing Positioning Generator
//
// Generates ListingPositioningSpec — marketing strategy for
// the Etsy listing. Audience, benefits, hooks, objections.
// ══════════════════════════════════════════════════════════════

import { callGeminiJSON, parseGeminiJSON } from "@/lib/gemini";
import type { ProductConceptSpec, ListingPositioningSpec } from "@/types/gemini-specs";
import { clampListingPositioningSpec } from "@/types/gemini-specs";

export interface PositioningInput {
  concept: ProductConceptSpec;
  /** Competitor data for differentiation */
  competitorTitles?: string[];
  competitorPriceRange?: { min: number; max: number };
}

function buildPositioningPrompt(input: PositioningInput): string {
  const c = input.concept;
  return `You are an Etsy marketing strategist specializing in digital products.

PRODUCT: ${c.suggestedTitle}
NICHE: ${c.nicheLabel}
TARGET CUSTOMER: ${c.targetCustomer}
PRODUCT PROMISE: ${c.productPromise}
UNIQUE ANGLE: ${c.uniqueAngle}
EMOTIONAL HOOK: ${c.emotionalHook}
PRICE: $${c.recommendedPrice} (${c.pricePositioning})
${input.competitorTitles ? `TOP COMPETITORS: ${input.competitorTitles.join(" | ")}` : ""}
${input.competitorPriceRange ? `COMPETITOR PRICES: $${input.competitorPriceRange.min} - $${input.competitorPriceRange.max}` : ""}

Generate a ListingPositioningSpec that will maximize Etsy conversions for this specific niche.

RULES:
- The audience persona must be SPECIFIC (not "people who budget")
- Benefits must solve the EXACT pain points of this niche
- The hook angle must be unique — not "best budget tracker ever"
- Objection handlers must address REAL buyer hesitations on Etsy
- SEO keywords must be actual Etsy search terms

Return JSON:
{
  "version": 1,
  "audiencePersona": "<detailed 2-3 sentence persona>",
  "primaryBenefit": "<the #1 reason to buy>",
  "secondaryBenefits": ["<benefit 2>", "<benefit 3>", "<benefit 4>"],
  "hookAngle": "<unique marketing angle>",
  "emotionalTriggers": ["<trigger 1>", "<trigger 2>", "<trigger 3>"],
  "objectionHandlers": [
    { "objection": "<common concern>", "response": "<how we address it>" }
  ],
  "socialProofAngle": "<trust-building statement>",
  "urgencyElement": "<optional scarcity/urgency>",
  "bundleOpportunity": "<optional bundle idea>",
  "seoKeywords": ["<keyword 1>", "<keyword 2>", ...],
  "categoryPosition": "market-leader" | "premium-alternative" | "budget-friendly" | "niche-specialist"
}

Respond ONLY with JSON.`;
}

export async function generateListingPositioning(
  input: PositioningInput,
): Promise<ListingPositioningSpec> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      const prompt = buildPositioningPrompt(input);
      const rawText = await callGeminiJSON(apiKey, prompt);
      const raw = parseGeminiJSON<Partial<ListingPositioningSpec>>(rawText);
      const spec = clampListingPositioningSpec(raw);
      console.log(`[Positioning] ✨ Gemini positioning for "${input.concept.nicheLabel}" — hook="${spec.hookAngle?.slice(0, 60)}", position=${spec.categoryPosition}`);
      return spec;
    } catch (err) {
      console.warn("[Positioning] Gemini failed, using fallback:", (err as Error).message?.slice(0, 80));
    }
  }

  return buildFallbackPositioning(input.concept);
}

export function buildFallbackPositioning(concept: ProductConceptSpec): ListingPositioningSpec {
  return clampListingPositioningSpec({
    version: 1,
    audiencePersona: concept.targetCustomer,
    primaryBenefit: concept.productPromise,
    secondaryBenefits: ["Instant digital download", "Works in Google Sheets and Excel", "Beautiful professional design", "Easy to customize"],
    hookAngle: concept.uniqueAngle,
    emotionalTriggers: ["control", "relief", "confidence"],
    objectionHandlers: [
      { objection: "I can make my own spreadsheet", response: "This saves you 20+ hours of design and formula work — plus it looks professional." },
      { objection: "Will it work on my device?", response: "Works on any device with Google Sheets or Excel — laptop, tablet, or phone." },
      { objection: "Is it hard to customize?", response: "Just type over the sample data. Every formula updates automatically." },
    ],
    socialProofAngle: "Trusted by thousands of smart planners",
    seoKeywords: [concept.niche.replace(/_/g, " "), "google sheets template", concept.nicheLabel.toLowerCase()],
    categoryPosition: concept.pricePositioning === "premium" || concept.pricePositioning === "luxury" ? "premium-alternative" : "niche-specialist",
  });
}
