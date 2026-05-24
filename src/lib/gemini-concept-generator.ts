// ══════════════════════════════════════════════════════════════
// Gemini Product Concept Generator
//
// Step 1 of the Gemini-first spec chain.
// Takes niche + competitor data → ProductConceptSpec
//
// This answers: WHO is this for, WHAT makes it unique, WHY buy it
// ══════════════════════════════════════════════════════════════

import { callGeminiJSON, parseGeminiJSON } from "@/lib/gemini";
import {
  type ProductConceptSpec,
  type GeminiProductType,
  clampConceptSpec,
} from "@/types/gemini-specs";

export interface ConceptGeneratorInput {
  /** Machine-readable niche (e.g., "wedding_planner") */
  niche: string;
  /** Human-readable label */
  nicheLabel: string;
  /** Product type to create */
  productType: GeminiProductType;
  /** Competitor title (top Etsy competitor) */
  competitorTitle?: string;
  /** Competitor price */
  competitorPrice?: number;
  /** Competitor strengths found during research */
  competitorStrengths?: string[];
  /** Competitor weaknesses found during research */
  competitorWeaknesses?: string[];
  /** Target keyword from Etsy research */
  targetKeyword?: string;
}

function buildConceptPrompt(input: ConceptGeneratorInput): string {
  const competitorBlock = input.competitorTitle
    ? `
COMPETITOR DATA:
- Title: ${input.competitorTitle}
- Price: $${input.competitorPrice || "unknown"}
- Strengths: ${(input.competitorStrengths || []).join(", ") || "N/A"}
- Weaknesses: ${(input.competitorWeaknesses || []).join(", ") || "N/A"}
`
    : "";

  return `You are a product strategist for premium digital products on Etsy.

NICHE: ${input.nicheLabel}
PRODUCT TYPE: ${input.productType}
TARGET KEYWORD: ${input.targetKeyword || input.nicheLabel}
${competitorBlock}

Your job: Generate a ProductConceptSpec that defines the creative and strategic foundation for this product. This spec drives ALL downstream decisions (structure, visuals, copy, video).

IMPORTANT RULES:
- Each niche must feel like it was created by a different specialized designer
- The concept should reflect DEEP understanding of the target customer's life
- The emotional hook must be visceral and specific — not generic
- Brand personality must be distinctive — not "professional and friendly" (that's everyone)
- Competitor improvements must be SPECIFIC and ACTIONABLE

NICHE PERSONALITY GUIDE:
- Wedding → emotional, aspirational, detail-oriented brides/grooms, "making the biggest day perfect"
- Baby → nurturing, overwhelmed new parents, "one less thing to stress about"
- Business → ambitious, data-driven entrepreneurs, "run your business like a CEO"
- Travel → adventurous, experience-seekers, "every dollar toward the next adventure"
- Paycheck → practical, paycheck-to-paycheck workers, "break free from the cycle"
- Fitness → motivated, goal-oriented, "track your transformation"
- Debt → determined, hope-seeking, "watch your debt disappear"

Return a JSON object with this EXACT structure:
{
  "version": 1,
  "productType": "${input.productType}",
  "niche": "${input.niche}",
  "nicheLabel": "<polished niche label>",
  "targetCustomer": "<2-sentence customer persona>",
  "customerPainPoints": ["<pain 1>", "<pain 2>", "<pain 3>", "<pain 4>"],
  "productPromise": "<one compelling sentence>",
  "uniqueAngle": "<what makes THIS product different from every other ${input.nicheLabel} template>",
  "emotionalHook": "<gut-punch emotional trigger — make them FEEL something>",
  "pricePositioning": "budget" | "mid" | "premium" | "luxury",
  "recommendedPrice": <number 1.99–49.99>,
  "competitorInsights": {
    "strengths": ["<strength 1>", ...],
    "weaknesses": ["<weakness 1>", ...],
    "ourImprovements": ["<improvement 1>", ...]
  },
  "brandPersonality": ["<adjective 1>", "<adjective 2>", "<adjective 3>"],
  "suggestedTitle": "<Etsy-optimized product title>"
}

Make bold, specific choices. Generic = failure.

Respond ONLY with the JSON object. No markdown, no explanation.`;
}

/**
 * Call Gemini to generate a ProductConceptSpec.
 * Falls back to niche-appropriate defaults if unavailable.
 */
export async function generateProductConcept(
  input: ConceptGeneratorInput,
): Promise<ProductConceptSpec> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      const prompt = buildConceptPrompt(input);
      const rawText = await callGeminiJSON(apiKey, prompt);
      const raw = parseGeminiJSON<Partial<ProductConceptSpec>>(rawText);
      const spec = clampConceptSpec(raw);
      console.log(
        `[ConceptGen] ✨ Gemini concept for "${input.nicheLabel}" — angle="${spec.uniqueAngle?.slice(0, 60)}", price=$${spec.recommendedPrice}`,
      );
      return spec;
    } catch (err) {
      console.warn("[ConceptGen] Gemini failed, using fallback:", (err as Error).message?.slice(0, 80));
    }
  }

  return buildFallbackConcept(input);
}

/**
 * Deterministic fallback concept per niche.
 */
export function buildFallbackConcept(input: ConceptGeneratorInput): ProductConceptSpec {
  const nicheKey = input.niche.toLowerCase().replace(/[-_\s]/g, "");

  if (nicheKey.includes("wedding") || nicheKey.includes("bridal")) {
    return clampConceptSpec({
      version: 1, productType: input.productType, niche: input.niche,
      nicheLabel: "Wedding Budget Planner",
      targetCustomer: "Engaged couples planning their dream wedding who want to track every vendor, payment, and deadline without losing their minds.",
      customerPainPoints: ["Wedding costs spiral out of control without tracking", "Managing 15+ vendor payments is overwhelming", "No visibility into where the biggest budget gaps are", "Spreadsheets feel too complicated to build from scratch"],
      productPromise: "Plan your dream wedding without the budget nightmare.",
      uniqueAngle: "A wedding-specific financial command center with vendor tracker, payment timeline, and visual budget breakdown — designed to feel as beautiful as your wedding day.",
      emotionalHook: "Your wedding should be about love, not spreadsheet stress.",
      pricePositioning: "premium", recommendedPrice: 12.99,
      competitorInsights: { strengths: ["Established shops with reviews"], weaknesses: ["Generic budget templates repurposed for weddings"], ourImprovements: ["Wedding-specific vendor tracker", "Visual payment timeline", "Guest count cost calculator"] },
      brandPersonality: ["elegant", "reassuring", "detail-obsessed"],
      suggestedTitle: "Wedding Budget Planner Google Sheets | Vendor Tracker, Payment Timeline, Guest Calculator",
    });
  }

  if (nicheKey.includes("baby") || nicheKey.includes("newborn")) {
    return clampConceptSpec({
      version: 1, productType: input.productType, niche: input.niche,
      nicheLabel: "Baby Budget Tracker",
      targetCustomer: "New and expecting parents overwhelmed by the hidden costs of raising a baby who need a gentle, clear way to track spending.",
      customerPainPoints: ["Baby costs hit you out of nowhere", "Diapers, formula, gear — it adds up fast", "No clear picture of monthly baby spending vs income", "Feeling guilty about spending on non-essentials"],
      productPromise: "See exactly where your baby budget goes — so you can spend on what matters.",
      uniqueAngle: "A baby-specific budget tracker with milestone-based spending, diaper/formula calculators, and gentle visual design that doesn't feel clinical.",
      emotionalHook: "Being a great parent shouldn't mean being broke.",
      pricePositioning: "mid", recommendedPrice: 8.99,
      competitorInsights: { strengths: ["Cute designs that appeal to parents"], weaknesses: ["Generic budget sheets with baby clip art"], ourImprovements: ["Baby milestone spending tracker", "Age-based expense forecasting", "Visual savings goal for baby fund"] },
      brandPersonality: ["nurturing", "warm", "reassuring"],
      suggestedTitle: "Baby Budget Tracker Google Sheets | Newborn Expense Planner, Diaper & Formula Calculator",
    });
  }

  if (nicheKey.includes("business") || nicheKey.includes("revenue") || nicheKey.includes("pl") || nicheKey.includes("profit")) {
    return clampConceptSpec({
      version: 1, productType: input.productType, niche: input.niche,
      nicheLabel: "Small Business P&L Tracker",
      targetCustomer: "Freelancers and small business owners who need a clear view of revenue, expenses, and profit without expensive accounting software.",
      customerPainPoints: ["No real-time view of profitability", "Revenue feels good but expenses eat everything", "Accounting software is expensive and complex", "Tax season is a scramble to find receipts"],
      productPromise: "Know your real profit every single month — no accounting degree required.",
      uniqueAngle: "A P&L dashboard designed for non-accountants with automated profit calculations, revenue tracking, and expense categorization that makes tax prep simple.",
      emotionalHook: "Stop guessing if your business is actually making money.",
      pricePositioning: "premium", recommendedPrice: 14.99,
      competitorInsights: { strengths: ["Professional appearance"], weaknesses: ["Too complex for solopreneurs", "No visual dashboards"], ourImprovements: ["One-glance P&L dashboard", "Automatic profit margin calculation", "Monthly trend visualization"] },
      brandPersonality: ["authoritative", "efficient", "data-driven"],
      suggestedTitle: "Small Business P&L Tracker Google Sheets | Revenue Dashboard, Expense Log, Profit Calculator",
    });
  }

  if (nicheKey.includes("travel")) {
    return clampConceptSpec({
      version: 1, productType: input.productType, niche: input.niche,
      nicheLabel: "Travel Budget Planner",
      targetCustomer: "Travel enthusiasts who want to plan trips that maximize experiences while staying on budget.",
      customerPainPoints: ["Always overspending on trips", "No idea how much a trip really costs until it's over", "Booking flights, hotels, activities across multiple platforms", "Currency conversion confusion"],
      productPromise: "Plan your dream trip and know exactly what it'll cost — before you book anything.",
      uniqueAngle: "A trip-specific budget planner with itinerary builder, multi-currency support, and per-day spending tracker that turns budget anxiety into adventure planning.",
      emotionalHook: "Every dollar you save smart is another experience you get to have.",
      pricePositioning: "mid", recommendedPrice: 9.99,
      competitorInsights: { strengths: ["Beautiful travel imagery"], weaknesses: ["Just a basic budget sheet with airplane emojis"], ourImprovements: ["Per-day itinerary budget", "Multi-currency converter", "Packing list + budget in one system"] },
      brandPersonality: ["adventurous", "organized", "inspiring"],
      suggestedTitle: "Travel Budget Planner Google Sheets | Trip Itinerary, Multi-Currency Tracker, Daily Spending Log",
    });
  }

  // Paycheck / default
  return clampConceptSpec({
    version: 1, productType: input.productType, niche: input.niche,
    nicheLabel: input.nicheLabel || "Paycheck Budget Planner",
    targetCustomer: "Working professionals living paycheck to paycheck who want to break the cycle and start saving.",
    customerPainPoints: ["Money disappears before next paycheck", "No savings despite earning decent income", "Subscriptions and small purchases add up invisibly", "Feeling stressed about money every month"],
    productPromise: "Make every paycheck work harder — know where every dollar goes.",
    uniqueAngle: "A paycheck-aligned budget system with bill scheduling, sinking funds, and visual savings progress that makes budgeting feel empowering, not restrictive.",
    emotionalHook: "You work too hard to wonder where your money went.",
    pricePositioning: "mid", recommendedPrice: 7.99,
    competitorInsights: { strengths: ["Simple interfaces"], weaknesses: ["No paycheck-specific features", "Generic monthly budgets"], ourImprovements: ["Bi-weekly paycheck alignment", "Bill calendar with due dates", "Sinking fund tracker"] },
    brandPersonality: ["empowering", "practical", "motivational"],
    suggestedTitle: "Paycheck Budget Planner Google Sheets | Bill Tracker, Savings Goals, Spending Log",
  });
}
