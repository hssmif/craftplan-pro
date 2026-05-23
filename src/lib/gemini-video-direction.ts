// ══════════════════════════════════════════════════════════════
// Gemini Video Direction Generator
//
// Generates VideoDirectionSpec — the creative brief for the
// product walkthrough video. Scene-by-scene direction.
// ══════════════════════════════════════════════════════════════

import { callGeminiJSON, parseGeminiJSON } from "@/lib/gemini";
import type { ProductConceptSpec, ProductStructureSpec, VideoDirectionSpec } from "@/types/gemini-specs";
import { clampVideoDirectionSpec } from "@/types/gemini-specs";

export interface VideoDirectionInput {
  concept: ProductConceptSpec;
  structure: ProductStructureSpec;
  /** Tab/section names for scene planning */
  sectionNames: string[];
}

function buildVideoPrompt(input: VideoDirectionInput): string {
  const c = input.concept;
  return `You are a video creative director for Etsy product listing videos (15-45 second walkthrough style).

PRODUCT: ${c.suggestedTitle}
NICHE: ${c.nicheLabel}
TARGET CUSTOMER: ${c.targetCustomer}
EMOTIONAL HOOK: ${c.emotionalHook}
SECTIONS/TABS: ${input.sectionNames.join(", ")}
BRAND PERSONALITY: ${c.brandPersonality.join(", ")}

Design a video that:
1. Hooks the viewer in the first 2 seconds
2. Shows the product is premium and worth the price
3. Highlights the unique features for this specific niche
4. Ends with a clear call to action

NICHE VIDEO PERSONALITY:
- Wedding → dreamy, soft transitions, elegant pacing, emotional music
- Baby → warm, gentle, nurturing pace, calming
- Business → fast, confident, data-forward, professional energy
- Travel → cinematic, adventurous, bright and exciting
- Paycheck → empowering, progressive reveals, motivational arc

Return JSON:
{
  "version": 1,
  "hookText": "<opening text that stops the scroll>",
  "hookStyle": "text-fade" | "zoom-reveal" | "slide-in" | "dramatic-dark" | "split-reveal",
  "scenes": [
    { "type": "<scene type>", "durationMs": <ms>, "focusArea": "<section/tab>", "caption": "<text>", "motion": "<camera>" }
  ],
  "defaultPaceMs": <1000-5000>,
  "ctaText": "<call to action>",
  "musicMood": "upbeat" | "calm" | "professional" | "emotional" | "energetic",
  "transitionStyle": "fade" | "slide" | "zoom" | "cut" | "morph",
  "targetDurationSec": <15-60>,
  "emotionalArc": ["<feeling at start>", "<feeling at middle>", "<feeling at end>"]
}

Scene types: intro, hook, reveal, zoom, scroll, tab-switch, callout, comparison, testimonial, end-card
Motion types: static, pan-left, pan-right, zoom-in, zoom-out, scroll-down

Be BOLD. Each niche should produce a DIFFERENT video feel.

Respond ONLY with JSON.`;
}

export async function generateVideoDirection(
  input: VideoDirectionInput,
): Promise<VideoDirectionSpec> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      const prompt = buildVideoPrompt(input);
      const rawText = await callGeminiJSON(apiKey, prompt);
      const raw = parseGeminiJSON<Partial<VideoDirectionSpec>>(rawText);
      const spec = clampVideoDirectionSpec(raw);
      console.log(`[VideoDir] ✨ Gemini video for "${input.concept.nicheLabel}" — ${spec.scenes.length} scenes, ${spec.targetDurationSec}s, hook="${spec.hookStyle}"`);
      return spec;
    } catch (err) {
      console.warn("[VideoDir] Gemini failed, using fallback:", (err as Error).message?.slice(0, 80));
    }
  }

  return buildFallbackVideoDirection(input);
}

export function buildFallbackVideoDirection(input: VideoDirectionInput): VideoDirectionSpec {
  const nicheKey = input.concept.niche.toLowerCase().replace(/[-_\s]/g, "");
  const sections = input.sectionNames;

  if (nicheKey.includes("wedding")) {
    return clampVideoDirectionSpec({
      version: 1, hookText: "Your wedding budget — under control, beautifully.", hookStyle: "text-fade",
      scenes: [
        { type: "intro", durationMs: 2500, caption: "Plan your dream wedding", motion: "static" },
        { type: "reveal", durationMs: 3000, focusArea: sections[0], caption: "Full budget dashboard", motion: "zoom-in" },
        { type: "tab-switch", durationMs: 2500, focusArea: "Vendor Tracker", caption: "Track every vendor payment", motion: "slide" as "pan-left" },
        { type: "zoom", durationMs: 2000, focusArea: "Guest List", caption: "Manage your guest list", motion: "zoom-in" },
        { type: "end-card", durationMs: 2500, caption: "Start planning today" },
      ],
      defaultPaceMs: 2500, ctaText: "Get your wedding planner — instant download.", musicMood: "emotional", transitionStyle: "fade", targetDurationSec: 30,
      emotionalArc: ["anticipation", "relief", "confidence", "excitement"],
    });
  }

  if (nicheKey.includes("business") || nicheKey.includes("pl")) {
    return clampVideoDirectionSpec({
      version: 1, hookText: "Know your real profit. Every month.", hookStyle: "dramatic-dark",
      scenes: [
        { type: "hook", durationMs: 2000, caption: "Stop guessing your margins", motion: "static" },
        { type: "reveal", durationMs: 2500, focusArea: sections[0], caption: "P&L dashboard", motion: "zoom-in" },
        { type: "tab-switch", durationMs: 2000, focusArea: "Revenue Log", caption: "Track every revenue source", motion: "pan-right" },
        { type: "callout", durationMs: 2000, focusArea: "Monthly P&L", caption: "Automated monthly summaries", motion: "zoom-in" },
        { type: "end-card", durationMs: 2000, caption: "Run your business like a CEO" },
      ],
      defaultPaceMs: 2000, ctaText: "Get your P&L tracker — instant download.", musicMood: "professional", transitionStyle: "cut", targetDurationSec: 25,
      emotionalArc: ["urgency", "clarity", "confidence", "action"],
    });
  }

  if (nicheKey.includes("travel")) {
    return clampVideoDirectionSpec({
      version: 1, hookText: "Plan your dream trip. Know the cost before you go.", hookStyle: "zoom-reveal",
      scenes: [
        { type: "intro", durationMs: 2000, caption: "Adventure starts with a plan", motion: "zoom-out" },
        { type: "reveal", durationMs: 3000, focusArea: sections[0], caption: "Trip budget overview", motion: "zoom-in" },
        { type: "scroll", durationMs: 2500, focusArea: "Itinerary", caption: "Day-by-day itinerary", motion: "scroll-down" },
        { type: "tab-switch", durationMs: 2000, focusArea: "Packing List", caption: "Never forget essentials", motion: "pan-left" },
        { type: "end-card", durationMs: 2500, caption: "Your next trip awaits" },
      ],
      defaultPaceMs: 2500, ctaText: "Get your travel planner — instant download.", musicMood: "upbeat", transitionStyle: "slide", targetDurationSec: 30,
      emotionalArc: ["wanderlust", "organization", "excitement", "action"],
    });
  }

  // Default / paycheck
  return clampVideoDirectionSpec({
    version: 1, hookText: "Where does your paycheck actually go?", hookStyle: "slide-in",
    scenes: [
      { type: "hook", durationMs: 2000, caption: "Take control of every dollar", motion: "static" },
      { type: "reveal", durationMs: 3000, focusArea: sections[0] || "Dashboard", caption: "Your budget at a glance", motion: "zoom-in" },
      { type: "tab-switch", durationMs: 2500, focusArea: "Transactions", caption: "Track every transaction", motion: "pan-right" },
      { type: "callout", durationMs: 2000, focusArea: "Savings Goals", caption: "Watch your savings grow", motion: "zoom-in" },
      { type: "end-card", durationMs: 2000, caption: "Start budgeting smarter" },
    ],
    defaultPaceMs: 2500, ctaText: "Get yours today — instant download.", musicMood: "calm", transitionStyle: "fade", targetDurationSec: 28,
    emotionalArc: ["recognition", "empowerment", "progress", "action"],
  });
}
