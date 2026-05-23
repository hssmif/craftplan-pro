// ══════════════════════════════════════════════════════════════
// Gemini Copy Direction Generator
//
// Generates CopyDirectionSpec — tone, voice, and style guide
// for all generated copy (listing title, description, FAQ, etc.)
// ══════════════════════════════════════════════════════════════

import { callGeminiJSON, parseGeminiJSON } from "@/lib/gemini";
import type { ProductConceptSpec, ListingPositioningSpec, CopyDirectionSpec } from "@/types/gemini-specs";
import { clampCopyDirectionSpec } from "@/types/gemini-specs";

export interface CopyDirectionInput {
  concept: ProductConceptSpec;
  positioning: ListingPositioningSpec;
}

function buildCopyPrompt(input: CopyDirectionInput): string {
  const c = input.concept;
  const p = input.positioning;
  return `You are a copywriting director for Etsy digital product listings.

PRODUCT: ${c.suggestedTitle}
NICHE: ${c.nicheLabel}
TARGET CUSTOMER: ${c.targetCustomer}
BRAND PERSONALITY: ${c.brandPersonality.join(", ")}
HOOK ANGLE: ${p.hookAngle}
EMOTIONAL TRIGGERS: ${p.emotionalTriggers.join(", ")}
PRICE POSITIONING: ${c.pricePositioning}

Create a copy direction that defines the VOICE and STYLE for all listing text.

NICHE VOICE GUIDE:
- Wedding → warm, dreamy, reassuring ("Your dream wedding, perfectly planned")
- Baby → gentle, nurturing, empathetic ("One less thing to worry about, mama")
- Business → confident, direct, data-backed ("Know your numbers. Grow your margins.")
- Travel → adventurous, inspiring, vivid ("Every dollar toward the next sunrise")
- Paycheck → empowering, practical, motivational ("Make every paycheck work for you")
- Fitness → energetic, bold, action-oriented ("Track your transformation")

Return JSON:
{
  "version": 1,
  "tone": "warm" | "professional" | "energetic" | "luxurious" | "practical" | "playful",
  "vocabulary": ["<power word 1>", "<power word 2>", ...],
  "avoidWords": ["<word to avoid 1>", ...],
  "emojiStyle": "heavy" | "moderate" | "minimal" | "none",
  "sentenceStyle": "short-punchy" | "flowing" | "mixed",
  "ctaStyle": "soft" | "direct" | "urgent",
  "brandVoice": "<one-sentence brand voice description>",
  "titleFormat": "emoji-heavy" | "keyword-first" | "benefit-first" | "question-hook",
  "descriptionStructure": "story-first" | "benefits-first" | "features-first" | "problem-solution"
}

Each niche should produce a DISTINCTLY different copy voice.

Respond ONLY with JSON.`;
}

export async function generateCopyDirection(
  input: CopyDirectionInput,
): Promise<CopyDirectionSpec> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      const prompt = buildCopyPrompt(input);
      const rawText = await callGeminiJSON(apiKey, prompt);
      const raw = parseGeminiJSON<Partial<CopyDirectionSpec>>(rawText);
      const spec = clampCopyDirectionSpec(raw);
      console.log(`[CopyDir] ✨ Gemini copy direction for "${input.concept.nicheLabel}" — tone=${spec.tone}, voice="${spec.brandVoice?.slice(0, 50)}"`);
      return spec;
    } catch (err) {
      console.warn("[CopyDir] Gemini failed, using fallback:", (err as Error).message?.slice(0, 80));
    }
  }

  return buildFallbackCopyDirection(input.concept);
}

export function buildFallbackCopyDirection(concept: ProductConceptSpec): CopyDirectionSpec {
  const nicheKey = concept.niche.toLowerCase().replace(/[-_\s]/g, "");

  if (nicheKey.includes("wedding")) {
    return clampCopyDirectionSpec({
      version: 1, tone: "warm", vocabulary: ["dream", "elegant", "effortless", "beautiful", "timeless", "celebrate"],
      avoidWords: ["cheap", "basic", "simple", "boring"], emojiStyle: "minimal", sentenceStyle: "flowing",
      ctaStyle: "soft", brandVoice: "A reassuring wedding planning expert who makes budgeting feel beautiful, not stressful.",
      titleFormat: "benefit-first", descriptionStructure: "story-first",
    });
  }

  if (nicheKey.includes("baby")) {
    return clampCopyDirectionSpec({
      version: 1, tone: "warm", vocabulary: ["gentle", "nurturing", "peace of mind", "growing", "precious", "smart"],
      avoidWords: ["cheap", "complicated", "struggle"], emojiStyle: "moderate", sentenceStyle: "mixed",
      ctaStyle: "soft", brandVoice: "A supportive friend who happens to be great with numbers — makes new parents feel capable, not overwhelmed.",
      titleFormat: "emoji-heavy", descriptionStructure: "problem-solution",
    });
  }

  if (nicheKey.includes("business") || nicheKey.includes("pl")) {
    return clampCopyDirectionSpec({
      version: 1, tone: "professional", vocabulary: ["profit", "growth", "clarity", "automated", "scalable", "data-driven"],
      avoidWords: ["cute", "pretty", "fun", "play"], emojiStyle: "none", sentenceStyle: "short-punchy",
      ctaStyle: "direct", brandVoice: "A sharp CFO advisor who respects your time and delivers results — no fluff, all substance.",
      titleFormat: "keyword-first", descriptionStructure: "features-first",
    });
  }

  if (nicheKey.includes("travel")) {
    return clampCopyDirectionSpec({
      version: 1, tone: "energetic", vocabulary: ["adventure", "explore", "discover", "unforgettable", "wanderlust", "dream trip"],
      avoidWords: ["boring", "restrict", "limit", "basic"], emojiStyle: "moderate", sentenceStyle: "mixed",
      ctaStyle: "direct", brandVoice: "An experienced traveler who knows the best trips are planned with intention — adventure and budget in harmony.",
      titleFormat: "benefit-first", descriptionStructure: "story-first",
    });
  }

  // Default / paycheck
  return clampCopyDirectionSpec({
    version: 1, tone: "practical", vocabulary: ["control", "freedom", "smart", "effortless", "empowered", "clear"],
    avoidWords: ["cheap", "poor", "struggle", "sacrifice"], emojiStyle: "moderate", sentenceStyle: "short-punchy",
    ctaStyle: "direct", brandVoice: "A supportive money coach who makes budgeting feel empowering, not punishing.",
    titleFormat: "keyword-first", descriptionStructure: "problem-solution",
  });
}
