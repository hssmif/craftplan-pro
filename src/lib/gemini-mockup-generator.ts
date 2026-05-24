// ══════════════════════════════════════════════════════════════
// Gemini Mockup Generator — Premium 3D Device Compositions
//
// Strategy: HYBRID approach for pixel-perfect results
//
//   1. Use Gemini to generate premium BACKGROUND SCENES
//      (clean desk, marble surface, soft lighting)
//
//   2. Use Sharp + SVG perspective transforms to composite
//      REAL device frames with depth, overlap, and shadow
//
// Composition rules (top 1% Etsy listings):
//   ✓ Laptop = main focus, slightly angled (NOT flat)
//   ✓ Tablet = behind/beside laptop, overlapping
//   ✓ Phone = foreground element, overlapping laptop
//   ✓ Soft drop shadows under each device
//   ✓ Slightly off-center gravity (asymmetric balance)
//   ✓ Real spreadsheet ALWAYS pixel-perfect
//
// Falls back to Sharp-only compositing if Gemini is unavailable.
// ══════════════════════════════════════════════════════════════

import sharp from "sharp";
import { geminiGenerateImage, geminiHealthCheck } from "./gemini-client";
import { callGeminiJSON } from "./gemini";
import type { NicheDesignProfile } from "./factory-niche-themes";

// ── Types ────────────────────────────────────────────────────

export interface MockupResult {
  buffer: Buffer;
  sizeBytes: number;
  source: "gemini" | "gradient-fallback";
  devices: ("laptop" | "tablet" | "phone")[];
  /** "hero" = multi-device, "dashboard-zoom" = fullbleed dashboard close-up */
  variant: "hero" | "laptop" | "tablet" | "phone" | "dashboard-zoom";
}

export interface MockupOptions {
  devices?: ("laptop" | "tablet" | "phone")[];
  title?: string;
  subtitle?: string;
  featurePills?: string[];
  skipGemini?: boolean;
  backgroundStyle?: "minimal-desk" | "marble" | "soft-gradient" | "workspace";
  /** Generate the zoomed dashboard variant (no device frame) */
  variant?: "hero" | "dashboard-zoom";
  /** Per-niche creative direction (controls angles, mood, headline style) */
  creativeDirection?: NicheCreativeDirection;
}

// ── Background prompts ───────────────────────────────────────

const BACKGROUND_PROMPTS: Record<string, string> = {
  "minimal-desk":
    "Professional product photography: a clean white desk surface seen from a slight " +
    "overhead angle (about 20 degrees). Soft diffused natural lighting from the top-left " +
    "creates gentle shadows. The desk has a matte white or very light wood finish. " +
    "A small succulent plant sits in the far upper-right corner. The center 70% of the " +
    "surface is completely clear. Studio lighting, shallow depth of field at edges. " +
    "No devices, no screens, no text, no logos. Square format, 2000x2000.",

  "marble":
    "Luxury product photography: a polished white Carrara marble surface with subtle " +
    "gray veining. Photographed from a slight angle (15 degrees overhead). Soft warm " +
    "studio lighting from the upper-left. A single dried eucalyptus branch in the far " +
    "corner. The center is pristine and clear. Premium editorial aesthetic with " +
    "shallow depth of field on the edges. No devices, no text. Square, 2000x2000.",

  "soft-gradient":
    "A premium abstract backdrop for digital product mockups. Ultra-smooth gradient " +
    "flowing from soft warm white in the upper-left to a very subtle lavender-blue " +
    "in the lower-right. Gentle light bloom at center. Professional studio feel " +
    "with very soft ambient shadows at the bottom third. Absolutely clean — no " +
    "objects, no texture, no text. Minimalist, modern, premium feel. Square, 2000x2000.",

  "workspace":
    "Professional lifestyle product photography: a modern home office scene from a " +
    "20-degree overhead angle. Clean white desk with a warm coffee cup (top-right corner) " +
    "and a small notebook with a pen (bottom-left corner). The large center area is " +
    "completely clear for product placement. Warm golden-hour side lighting with soft " +
    "shadows. Shallow depth of field blurs the background. Aspirational, clean aesthetic. " +
    "No devices on desk, no screens, no text. Square, 2000x2000.",

  "dark-office":
    "Executive product photography: a dark walnut or espresso wood desk surface shot from " +
    "a slight overhead angle (18 degrees). Dramatic moody studio lighting from the upper-left " +
    "with strong contrast. A sleek black pen and small leather notebook in the far corner. " +
    "The center 70% is clear and pristine. Dark, professional, premium feel. Shallow depth " +
    "of field softens the edges. No devices, no screens, no text, no logos. Square, 2000x2000.",
};

const BACKGROUND_STYLE_BY_FAMILY: Record<string, string> = {
  nurture: "soft-gradient",
  executive: "dark-office",
  editorial: "marble",
};

// ── Niche-specific prop fragments for background prompts ────

const NICHE_PROP_VARIANTS: Record<string, string> = {
  "wedding-planner":
    "with a small bouquet of dried flowers and a gold ring box in the far corner",
  "baby-budget":
    "with a small stuffed animal and baby rattle in the upper corner",
  "business-pl":
    "with a sleek calculator and leather portfolio in the corner",
  "travel-planner":
    "with a small world globe and vintage compass in the corner",
  "paycheck-budget":
    "with a small planner notebook and pen in the corner",
  "pregnancy-planner":
    "with a soft knitted baby blanket and wooden rattle in the far corner",
  "debt-payoff":
    "with a stack of neatly arranged coins and a small notepad in the corner",
  "side-hustle":
    "with a small potted succulent and a stylish business card holder in the corner",
  "savings-tracker":
    "with a small piggy bank and a few stacked coins in the far corner",
  "student-budget":
    "with a small stack of textbooks and a highlighter in the corner",
  "meal-planner":
    "with a small wooden cutting board and fresh herbs in the far corner",
  "adhd-planner":
    "with colorful sticky notes and a fidget cube in the corner",
};

// ── Creative Direction Types ────────────────────────────────

export interface NicheCreativeDirection {
  /** Description of how the hero thumbnail should be composed */
  heroComposition: string;
  /** Camera/device angle for the primary device */
  deviceAngle: "centered" | "angled-left" | "flatlay" | "overhead";
  /** What props to include in background */
  propSuggestion: string;
  /** Overall color mood */
  colorMood: "warm" | "cool" | "dark" | "bright";
  /** Headline typography style */
  headlineStyle: "bold-sans" | "elegant-serif" | "minimal" | "urgent";
}

// ── Family-based creative direction defaults ────────────────

const FAMILY_CREATIVE_DEFAULTS: Record<string, NicheCreativeDirection> = {
  executive: {
    heroComposition: "Angled laptop with dramatic lighting, dark premium workspace, executive feel",
    deviceAngle: "angled-left",
    propSuggestion: "sleek pen, leather notebook, dark wood desk",
    colorMood: "dark",
    headlineStyle: "bold-sans",
  },
  editorial: {
    heroComposition: "Centered laptop on cream or marble surface, elegant editorial styling with refined props",
    deviceAngle: "centered",
    propSuggestion: "dried eucalyptus branch, gold accents, marble surface",
    colorMood: "warm",
    headlineStyle: "elegant-serif",
  },
  nurture: {
    heroComposition: "Centered laptop on soft gradient, minimal props, gentle and calming composition",
    deviceAngle: "centered",
    propSuggestion: "small plant, soft fabric, minimal clutter",
    colorMood: "bright",
    headlineStyle: "minimal",
  },
  travel: {
    heroComposition: "Slightly angled laptop on a workspace with subtle travel cues, adventurous yet organized",
    deviceAngle: "angled-left",
    propSuggestion: "small globe, vintage compass, boarding pass",
    colorMood: "warm",
    headlineStyle: "bold-sans",
  },
};

/**
 * Generate per-niche creative direction using Gemini text API.
 * Returns a structured creative brief that controls image composition,
 * device angles, prop suggestions, color mood, and headline style.
 *
 * Falls back to family-based defaults if Gemini is unavailable.
 */
export async function generateNicheCreativeDirection(
  nicheId: string,
  nicheLabel: string,
  familyId?: string,
): Promise<NicheCreativeDirection> {
  const resolvedFamily = familyId || (() => {
    const { getLayoutFamilyId } = require("./factory-layout-families");
    return getLayoutFamilyId(nicheId) as string;
  })();

  const fallback = FAMILY_CREATIVE_DEFAULTS[resolvedFamily] || FAMILY_CREATIVE_DEFAULTS["nurture"];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[creative-direction] No GEMINI_API_KEY, using family defaults");
    return fallback;
  }

  const prompt = `You are a creative director for premium Etsy digital product listings (Google Sheets templates).

Given the niche "${nicheLabel}" (id: "${nicheId}", family: "${resolvedFamily}"), generate a creative direction brief for the listing thumbnail images.

Return ONLY valid JSON with exactly these fields:
{
  "heroComposition": "<1 sentence describing how the hero thumbnail should be composed — camera angle, lighting, mood>",
  "deviceAngle": "<one of: centered, angled-left, flatlay, overhead>",
  "propSuggestion": "<what 2-3 small props should appear in the background, niche-relevant>",
  "colorMood": "<one of: warm, cool, dark, bright>",
  "headlineStyle": "<one of: bold-sans, elegant-serif, minimal, urgent>"
}

Rules:
- deviceAngle must be exactly one of: "centered", "angled-left", "flatlay", "overhead"
- colorMood must be exactly one of: "warm", "cool", "dark", "bright"
- headlineStyle must be exactly one of: "bold-sans", "elegant-serif", "minimal", "urgent"
- Props should be small, tasteful, and relevant to the niche
- The composition should feel premium and aspirational like top Etsy sellers`;

  try {
    const rawText = await callGeminiJSON(apiKey, prompt);
    const parsed = JSON.parse(rawText);

    // Validate enum fields with fallbacks
    const validAngles = ["centered", "angled-left", "flatlay", "overhead"] as const;
    const validMoods = ["warm", "cool", "dark", "bright"] as const;
    const validStyles = ["bold-sans", "elegant-serif", "minimal", "urgent"] as const;

    const direction: NicheCreativeDirection = {
      heroComposition: typeof parsed.heroComposition === "string" ? parsed.heroComposition : fallback.heroComposition,
      deviceAngle: validAngles.includes(parsed.deviceAngle) ? parsed.deviceAngle : fallback.deviceAngle,
      propSuggestion: typeof parsed.propSuggestion === "string" ? parsed.propSuggestion : fallback.propSuggestion,
      colorMood: validMoods.includes(parsed.colorMood) ? parsed.colorMood : fallback.colorMood,
      headlineStyle: validStyles.includes(parsed.headlineStyle) ? parsed.headlineStyle : fallback.headlineStyle,
    };

    console.log(`[creative-direction] Generated for ${nicheId}:`, direction);
    return direction;
  } catch (err) {
    console.warn("[creative-direction] Gemini call failed, using family defaults:", err);
    return fallback;
  }
}

function getBackgroundStyle(nicheId: string): string {
  // Niche-level overrides first, then family-level defaults
  const nicheOverrides: Record<string, string> = {
    "baby-budget": "soft-gradient",
    "wedding-planner": "marble",
    "business-pl": "dark-office",
    "paycheck-budget": "workspace",
    "adhd-planner": "soft-gradient",
    "travel-planner": "workspace",
    "side-hustle": "minimal-desk",
    "student-budget": "workspace",
    "meal-planner": "workspace",
    "pregnancy-planner": "soft-gradient",
    "debt-payoff": "dark-office",
    "savings-tracker": "soft-gradient",
  };
  if (nicheOverrides[nicheId]) return nicheOverrides[nicheId];

  const { getLayoutFamilyId } = require("./factory-layout-families");
  const familyId = getLayoutFamilyId(nicheId);
  return BACKGROUND_STYLE_BY_FAMILY[familyId] || "soft-gradient";
}

// ── Niche emotional hooks — benefit-driven headlines ─────────

interface NicheMarketingCopy {
  /** Primary emotional headline (3-6 words, benefit-driven) */
  heroHeadline: string;
  /** Shorter hook for dashboard-zoom variant */
  zoomHeadline: string;
  /** Feature-focused subtitle */
  subtitle: string;
  /** Color grading: overlay tint for mood */
  moodTint: string;
  /** Color grading: overlay opacity (0-0.15) */
  moodOpacity: number;
}

function getNicheMarketingCopy(nicheId: string): NicheMarketingCopy {
  const copy: Record<string, NicheMarketingCopy> = {
    "baby-budget": {
      heroHeadline: "Plan for Baby with Confidence",
      zoomHeadline: "Every Dollar, Accounted For",
      subtitle: "The Baby Budget Planner",
      moodTint: "#E8D5F5",
      moodOpacity: 0.06,
    },
    "wedding-planner": {
      heroHeadline: "Plan Your Dream Wedding Stress-Free",
      zoomHeadline: "Your Wedding Budget, Simplified",
      subtitle: "The Wedding Budget Planner",
      moodTint: "#F5E6D5",
      moodOpacity: 0.07,
    },
    "business-pl": {
      heroHeadline: "Know Your Numbers, Grow Your Business",
      zoomHeadline: "Profit & Loss Made Simple",
      subtitle: "The Business Finance Dashboard",
      moodTint: "#D5E5F5",
      moodOpacity: 0.05,
    },
    "paycheck-budget": {
      heroHeadline: "Take Control of Your Money",
      zoomHeadline: "Stop Guessing, Start Tracking",
      subtitle: "The Paycheck Budget System",
      moodTint: "#D5F5E5",
      moodOpacity: 0.05,
    },
    "adhd-planner": {
      heroHeadline: "Finally, a Budget That Makes Sense",
      zoomHeadline: "Simple, Visual, Effective",
      subtitle: "The ADHD-Friendly Budget",
      moodTint: "#F5F0D5",
      moodOpacity: 0.06,
    },
    "travel-planner": {
      heroHeadline: "Travel More, Spend Smarter",
      zoomHeadline: "Plan Every Trip on Budget",
      subtitle: "The Travel Budget Planner",
      moodTint: "#D5F0F5",
      moodOpacity: 0.06,
    },
    "savings-tracker": {
      heroHeadline: "Watch Your Savings Grow",
      zoomHeadline: "Every Goal, Tracked",
      subtitle: "The Savings Goal Tracker",
      moodTint: "#D5E8F5",
      moodOpacity: 0.05,
    },
    "debt-payoff": {
      heroHeadline: "Crush Your Debt, Step by Step",
      zoomHeadline: "Balances Dropping Monthly",
      subtitle: "The Debt Payoff Tracker",
      moodTint: "#F5D5D5",
      moodOpacity: 0.05,
    },
    "side-hustle": {
      heroHeadline: "Track Every Dollar You Earn",
      zoomHeadline: "Revenue, Costs, Profit",
      subtitle: "The Side Hustle Dashboard",
      moodTint: "#D5F5E0",
      moodOpacity: 0.05,
    },
    "pregnancy-planner": {
      heroHeadline: "Prepare for Baby with Clarity",
      zoomHeadline: "Prenatal Costs, Organized",
      subtitle: "The Pregnancy Budget Planner",
      moodTint: "#F5E0F0",
      moodOpacity: 0.06,
    },
    "student-budget": {
      heroHeadline: "Student Budget Made Simple",
      zoomHeadline: "Track Spending Each Semester",
      subtitle: "The Student Budget Tracker",
      moodTint: "#E5E0F5",
      moodOpacity: 0.05,
    },
    "meal-planner": {
      heroHeadline: "Eat Better, Spend Less",
      zoomHeadline: "Meal Costs Under Control",
      subtitle: "The Meal Budget Planner",
      moodTint: "#F5ECD5",
      moodOpacity: 0.05,
    },
  };

  return copy[nicheId] || {
    heroHeadline: "Take Control of Your Money",
    zoomHeadline: "Your Complete Budget Dashboard",
    subtitle: "Google Sheets Template",
    moodTint: "#E0E5F0",
    moodOpacity: 0.04,
  };
}

// ══════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════

/**
 * Generate a premium Etsy-style device mockup.
 * Devices are layered with depth, overlap, and realistic shadows.
 */
export async function generateGeminiMockup(
  screenshot: Buffer,
  nicheProfile: NicheDesignProfile,
  options: MockupOptions = {},
): Promise<MockupResult> {
  const W = 2000;
  const H = 2000;
  const devices = options.devices || ["laptop", "tablet", "phone"];
  const pal = nicheProfile.palette;
  const font = nicheProfile.typography.fontFamily || "Arial";
  const variant = options.variant || (devices.length === 3 ? "hero" : devices[0] || "hero");

  // ── Dashboard-zoom variant: no device, just spreadsheet ────
  if (variant === "dashboard-zoom") {
    return buildDashboardZoomVariant(screenshot, nicheProfile, W, H, options);
  }

  // ── Creative direction ──────────────────────────────────────
  const cd = options.creativeDirection;

  // ── Step 1: Background ─────────────────────────────────────
  let backgroundBuffer: Buffer;
  let source: "gemini" | "gradient-fallback" = "gradient-fallback";

  if (!options.skipGemini) {
    try {
      const health = await geminiHealthCheck();
      if (health.available) {
        const bgStyle = options.backgroundStyle || getBackgroundStyle(nicheProfile.id);
        let prompt = BACKGROUND_PROMPTS[bgStyle] || BACKGROUND_PROMPTS["soft-gradient"];

        // Enrich prompt with niche-specific props
        const nicheProps = NICHE_PROP_VARIANTS[nicheProfile.id];
        if (nicheProps) {
          prompt = prompt.replace(
            /No devices/,
            `${nicheProps}. No devices`,
          );
        }

        // Enrich prompt with creative direction mood
        if (cd) {
          const moodModifiers: Record<string, string> = {
            warm: "Warm golden-hour lighting with amber tones.",
            cool: "Cool blue-tinted studio lighting with crisp shadows.",
            dark: "Dark dramatic moody lighting with strong contrast and deep shadows.",
            bright: "Bright airy natural light flooding from the top-left, clean and uplifting.",
          };
          const moodMod = moodModifiers[cd.colorMood];
          if (moodMod) {
            prompt += " " + moodMod;
          }
          if (cd.propSuggestion) {
            prompt += ` Include subtle props: ${cd.propSuggestion}.`;
          }
        }

        console.log(`[gemini-mockup] Generating AI background (${bgStyle})...`);
        const result = await geminiGenerateImage(prompt, undefined, {
          temperature: 0.3,
          maxRetries: 1,
        });
        backgroundBuffer = await sharp(result.buffer).resize(W, H, { fit: "cover" }).png().toBuffer();
        source = "gemini";
        console.log(`[gemini-mockup] AI background: ${(backgroundBuffer.length / 1024).toFixed(0)} KB`);
      } else {
        backgroundBuffer = await buildPremiumGradientBg(W, H, pal);
      }
    } catch (err) {
      console.warn("[gemini-mockup] Gemini background failed:", err);
      backgroundBuffer = await buildPremiumGradientBg(W, H, pal);
    }
  } else {
    backgroundBuffer = await buildPremiumGradientBg(W, H, pal);
  }

  // ── Step 2: Build layered device composition ───────────────
  const composites: sharp.OverlayOptions[] = [];

  if (devices.length === 3) {
    const layers = await buildHeroComposition(screenshot, W, H);
    composites.push(...layers);
  } else if (devices.length === 1 && devices[0] === "laptop") {
    const layers = await buildLaptopFocusComposition(screenshot, W, H);
    composites.push(...layers);
  } else if (devices.length === 1 && devices[0] === "tablet") {
    const layers = await buildTabletFocusComposition(screenshot, W, H);
    composites.push(...layers);
  } else {
    const layers = await buildHeroComposition(screenshot, W, H);
    composites.push(...layers);
  }

  // ── Step 3: Emotional headline overlay (top) ───────────────
  const marketingCopy = getNicheMarketingCopy(nicheProfile.id);
  const headlineText = options.title || marketingCopy.heroHeadline;
  const subtitleText = options.subtitle || marketingCopy.subtitle;
  const headlineStyle = cd?.headlineStyle || "bold-sans";
  const headlineBuf = await buildHeadlineOverlay(headlineText, subtitleText, W, font, pal, headlineStyle);
  composites.push({ input: headlineBuf, top: 0, left: 0 });

  // ── Step 4: Feature pills (bottom) ─────────────────────────
  if (options.featurePills && options.featurePills.length > 0) {
    const pillsBuf = await buildPills(options.featurePills, W, H, font, pal);
    composites.push({ input: pillsBuf, top: 0, left: 0 });
  }

  // ── Step 5: Badge ──────────────────────────────────────────
  const badgeBuf = await buildBadge(W, H, pal);
  composites.push({ input: badgeBuf, top: 0, left: 0 });

  // ── Step 6: Niche mood color grading ───────────────────────
  if (marketingCopy.moodOpacity > 0) {
    const moodSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="mood" cx="0.5" cy="0.4" r="0.7">
          <stop offset="0%" stop-color="${marketingCopy.moodTint}" stop-opacity="${marketingCopy.moodOpacity}"/>
          <stop offset="100%" stop-color="${marketingCopy.moodTint}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#mood)"/>
    </svg>`;
    const moodBuf = await sharp(Buffer.from(moodSvg)).resize(W, H).png().toBuffer();
    composites.push({ input: moodBuf, top: 0, left: 0 });
  }

  // ── Step 7: Composite ──────────────────────────────────────
  const finalBuffer = await sharp(backgroundBuffer)
    .composite(composites)
    .resize(W, H)
    .png({ quality: 92 })
    .toBuffer();

  return {
    buffer: finalBuffer,
    sizeBytes: finalBuffer.length,
    source,
    devices: devices as ("laptop" | "tablet" | "phone")[],
    variant: variant as MockupResult["variant"],
  };
}

/** Hero: multi-device (3 devices) */
export async function generateHeroMockup(
  screenshot: Buffer,
  title: string,
  subtitle: string,
  nicheProfile: NicheDesignProfile,
  featurePills?: string[],
): Promise<MockupResult> {
  // Use emotional headline from niche copy if title is generic
  const copy = getNicheMarketingCopy(nicheProfile.id);
  const emotionalTitle = isGenericTitle(title) ? copy.heroHeadline : title;
  const emotionalSub = isGenericTitle(subtitle) ? copy.subtitle : subtitle;
  return generateGeminiMockup(screenshot, nicheProfile, {
    devices: ["laptop", "tablet", "phone"],
    title: emotionalTitle, subtitle: emotionalSub, featurePills, variant: "hero",
  });
}

function isGenericTitle(text: string): boolean {
  const generic = ["budget tracker", "google sheets template", "spreadsheet", "template"];
  const low = text.toLowerCase().trim();
  return generic.some(g => low === g || low.includes(g) && low.length < 30);
}

/** Dashboard zoom: no device, large spreadsheet with subtle frame */
export async function generateDashboardZoomMockup(
  screenshot: Buffer,
  title: string,
  nicheProfile: NicheDesignProfile,
): Promise<MockupResult> {
  return generateGeminiMockup(screenshot, nicheProfile, {
    title, variant: "dashboard-zoom",
  });
}

/** Single laptop */
export async function generateLaptopMockup(
  screenshot: Buffer,
  title: string,
  nicheProfile: NicheDesignProfile,
): Promise<MockupResult> {
  return generateGeminiMockup(screenshot, nicheProfile, {
    devices: ["laptop"], title,
  });
}

/** Single tablet */
export async function generateTabletMockup(
  screenshot: Buffer,
  title: string,
  nicheProfile: NicheDesignProfile,
): Promise<MockupResult> {
  return generateGeminiMockup(screenshot, nicheProfile, {
    devices: ["tablet"], title,
  });
}

// ══════════════════════════════════════════════════════════════
// HERO COMPOSITION — 3 devices with depth & overlap
//
// Layout (think: product photography):
//
//    ┌──────────────────────────────────────┐
//    │                                      │
//    │     ┌──────────────────┐             │
//    │     │  TABLET (behind) │             │
//    │     │  slightly right  │             │
//    │     └──────────────────┘             │
//    │   ┌──────────────────────┐           │
//    │   │     LAPTOP (main)    │   ┌──┐    │
//    │   │   center, prominent  │   │PH│    │
//    │   │   slight angle       │   │ON│    │
//    │   └──────────────────────┘   │E │    │
//    │                              └──┘    │
//    └──────────────────────────────────────┘
//
// Rendering order: tablet shadow → tablet → laptop shadow → laptop → phone shadow → phone
// ══════════════════════════════════════════════════════════════

async function buildHeroComposition(
  screenshot: Buffer,
  W: number,
  H: number,
): Promise<sharp.OverlayOptions[]> {
  // ── Device dimensions ──
  // Laptop: large, main focus (~80% of canvas width for bold, full-bleed look)
  const lSW = 1540, lSH = 920;
  // Tablet: medium, partially behind laptop
  const tSW = 620, tSH = 460;
  // Phone: small, foreground overlap
  const pSW = 270, pSH = 480;

  const [laptopImg, tabletImg, phoneImg] = await Promise.all([
    sharp(screenshot).resize(lSW, lSH, { fit: "cover", position: "top" }).png().toBuffer(),
    sharp(screenshot).resize(tSW, tSH, { fit: "cover", position: "top" }).png().toBuffer(),
    sharp(screenshot).resize(pSW, pSH, { fit: "cover", position: "top" }).png().toBuffer(),
  ]);

  // ── Positions (tighter, bolder — less whitespace) ──
  const lBzl = 12;
  const lX = 60;        // laptop near left edge — bold & prominent
  const lY = 460;       // laptop higher for less bottom gap

  const tBzl = 10;
  const tX = 1180;      // tablet right, partially behind laptop
  const tY = 300;       // tablet higher (behind effect)

  const pBzl = 6;
  const pX = 1620;      // phone far right, foreground
  const pY = 620;       // phone lower (in front of tablet)

  const layers: sharp.OverlayOptions[] = [];

  // ── LAYER 1: Tablet (BEHIND — rendered first) ──────────────
  const tabletShadow = await buildSoftShadow(
    tSW + tBzl * 2, tSH + tBzl * 2, 18, "rgba(0,0,0,0.12)", 8,
  );
  layers.push({ input: tabletShadow, top: tY + 10, left: tX + 10 });

  const tabletFrame = await buildDeviceFrame("tablet", tSW, tSH, tBzl);
  layers.push({ input: tabletFrame, top: tY, left: tX });
  layers.push({ input: tabletImg, top: tY + tBzl, left: tX + tBzl });

  // ── LAYER 2: Laptop (MAIN — rendered on top of tablet) ─────
  const laptopShadow = await buildSoftShadow(
    lSW + lBzl * 2 + 100, lSH + lBzl * 2 + 20, 24, "rgba(0,0,0,0.14)", 12,
  );
  layers.push({ input: laptopShadow, top: lY + 8, left: lX - 8 });

  const laptopFrame = await buildDeviceFrame("laptop", lSW, lSH, lBzl);
  layers.push({ input: laptopFrame, top: lY, left: lX });
  layers.push({ input: laptopImg, top: lY + lBzl, left: lX + lBzl });

  // Laptop base/hinge
  const baseW = lSW + lBzl * 2 + 100;
  const baseY = lY + lSH + lBzl * 2;
  const baseSvg = `<svg width="${baseW}" height="20" xmlns="http://www.w3.org/2000/svg">
    <path d="M0 0 L${baseW} 0 L${baseW - 30} 16 L30 16 Z" fill="#3a3a3a"/>
    <ellipse cx="${baseW / 2}" cy="8" rx="32" ry="2" fill="#555"/>
  </svg>`;
  const baseBuf = await sharp(Buffer.from(baseSvg)).resize(baseW, 20).png().toBuffer();
  layers.push({ input: baseBuf, top: baseY + 2, left: lX - 50 });

  // ── LAYER 3: Phone (FOREGROUND — on top of everything) ─────
  const phoneShadow = await buildSoftShadow(
    pSW + pBzl * 2, pSH + pBzl * 2 + 14, 20, "rgba(0,0,0,0.16)", 6,
  );
  layers.push({ input: phoneShadow, top: pY + 6, left: pX + 6 });

  const phoneFrame = await buildDeviceFrame("phone", pSW, pSH, pBzl);
  layers.push({ input: phoneFrame, top: pY, left: pX });
  layers.push({ input: phoneImg, top: pY + pBzl + 8, left: pX + pBzl });

  return layers;
}

// ══════════════════════════════════════════════════════════════
// LAPTOP FOCUS COMPOSITION — single large laptop, prominent
// ══════════════════════════════════════════════════════════════

async function buildLaptopFocusComposition(
  screenshot: Buffer,
  W: number,
  H: number,
): Promise<sharp.OverlayOptions[]> {
  const sW = 1720, sH = 1020;   // ~86% of canvas width for bold look
  const bzl = 14;
  const lX = (W - sW - bzl * 2) / 2 - 10; // centered
  const lY = 340;               // pushed up for less bottom gap

  const resized = await sharp(screenshot)
    .resize(sW, sH, { fit: "cover", position: "top" }).png().toBuffer();

  const layers: sharp.OverlayOptions[] = [];

  // Shadow
  const shadow = await buildSoftShadow(sW + bzl * 2 + 120, sH + bzl * 2 + 20, 28, "rgba(0,0,0,0.13)", 14);
  layers.push({ input: shadow, top: lY + 10, left: Math.round(lX - 10) });

  // Frame
  const frame = await buildDeviceFrame("laptop", sW, sH, bzl);
  layers.push({ input: frame, top: lY, left: Math.round(lX) });

  // Screenshot
  layers.push({ input: resized, top: lY + bzl, left: Math.round(lX + bzl) });

  // Base
  const baseW = sW + bzl * 2 + 120;
  const baseY = lY + sH + bzl * 2;
  const baseSvg = `<svg width="${baseW}" height="20" xmlns="http://www.w3.org/2000/svg">
    <path d="M0 0 L${baseW} 0 L${baseW - 35} 18 L35 18 Z" fill="#3a3a3a"/>
    <ellipse cx="${baseW / 2}" cy="9" rx="38" ry="2.5" fill="#555"/>
  </svg>`;
  const baseBuf = await sharp(Buffer.from(baseSvg)).resize(baseW, 20).png().toBuffer();
  layers.push({ input: baseBuf, top: baseY + 2, left: Math.round(lX - 60) });

  return layers;
}

// ══════════════════════════════════════════════════════════════
// TABLET FOCUS COMPOSITION
// ══════════════════════════════════════════════════════════════

async function buildTabletFocusComposition(
  screenshot: Buffer,
  W: number,
  H: number,
): Promise<sharp.OverlayOptions[]> {
  const sW = 1400, sH = 1050;  // bigger tablet for bolder look
  const bzl = 14;
  const tX = (W - sW - bzl * 2) / 2;
  const tY = 380;

  const resized = await sharp(screenshot)
    .resize(sW, sH, { fit: "cover", position: "top" }).png().toBuffer();

  const layers: sharp.OverlayOptions[] = [];

  const shadow = await buildSoftShadow(sW + bzl * 2, sH + bzl * 2, 22, "rgba(0,0,0,0.12)", 10);
  layers.push({ input: shadow, top: tY + 8, left: Math.round(tX + 8) });

  const frame = await buildDeviceFrame("tablet", sW, sH, bzl);
  layers.push({ input: frame, top: tY, left: Math.round(tX) });

  layers.push({ input: resized, top: tY + bzl, left: Math.round(tX + bzl) });

  return layers;
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD ZOOM VARIANT — no device, large spreadsheet
// ══════════════════════════════════════════════════════════════

async function buildDashboardZoomVariant(
  screenshot: Buffer,
  nicheProfile: NicheDesignProfile,
  W: number,
  H: number,
  options: MockupOptions,
): Promise<MockupResult> {
  const pal = nicheProfile.palette;
  const font = nicheProfile.typography.fontFamily || "Arial";

  // Background: subtle gradient
  const bg = await buildPremiumGradientBg(W, H, pal);

  // Large spreadsheet — nearly full-bleed for maximum content visibility
  const ssW = 1880, ssH = 1340;
  const ssX = (W - ssW) / 2;
  const ssY = 280;   // pushed up, less top gap

  const resized = await sharp(screenshot)
    .resize(ssW, ssH, { fit: "cover", position: "top" })
    .png()
    .toBuffer();

  // Subtle frame + shadow
  const frameSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="dshadow" x="-5%" y="-5%" width="110%" height="115%">
        <feDropShadow dx="0" dy="6" stdDeviation="16" flood-color="rgba(0,0,0,0.12)"/>
      </filter>
    </defs>
    <rect x="${ssX - 4}" y="${ssY - 4}" width="${ssW + 8}" height="${ssH + 8}" rx="12" fill="white" filter="url(#dshadow)"/>
  </svg>`;
  const frameBuf = await sharp(Buffer.from(frameSvg)).resize(W, H).png().toBuffer();

  // Title bar above spreadsheet
  const marketingCopy = getNicheMarketingCopy(nicheProfile.id);
  const titleText = options.title || marketingCopy.zoomHeadline;
  const titleSvg = `<svg width="${W}" height="280" xmlns="http://www.w3.org/2000/svg">
    <text x="${W / 2}" y="100" text-anchor="middle" font-family="${font}, Arial, sans-serif" font-size="52" font-weight="700" fill="${pal.text}">${escSvg(titleText)}</text>
    <text x="${W / 2}" y="155" text-anchor="middle" font-family="${font}, Arial, sans-serif" font-size="20" font-weight="400" fill="${pal.textMuted}" letter-spacing="3">GOOGLE SHEETS TEMPLATE</text>
    <rect x="${W / 2 - 40}" y="175" width="80" height="3" rx="1.5" fill="${pal.accent}"/>
  </svg>`;
  const titleBuf = await sharp(Buffer.from(titleSvg)).resize(W, 280).png().toBuffer();

  // Badge bottom-right
  const badgeBuf = await buildBadge(W, H, pal);

  const finalBuffer = await sharp(bg)
    .composite([
      { input: titleBuf, top: 30, left: 0 },
      { input: frameBuf, top: 0, left: 0 },
      { input: resized, top: ssY, left: ssX },
      { input: badgeBuf, top: 0, left: 0 },
    ])
    .resize(W, H)
    .png({ quality: 92 })
    .toBuffer();

  return {
    buffer: finalBuffer,
    sizeBytes: finalBuffer.length,
    source: "gradient-fallback",
    devices: [],
    variant: "dashboard-zoom",
  };
}

// ══════════════════════════════════════════════════════════════
// Device Frame Builder — realistic bezels
// ══════════════════════════════════════════════════════════════

async function buildDeviceFrame(
  type: "laptop" | "tablet" | "phone",
  screenW: number,
  screenH: number,
  bezel: number,
): Promise<Buffer> {
  const frameW = screenW + bezel * 2;
  const frameH = screenH + bezel * 2 + (type === "phone" ? 14 : 0);

  let svg: string;

  if (type === "laptop") {
    svg = `<svg width="${frameW}" height="${frameH}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${frameW}" height="${frameH}" rx="8" fill="#2a2a2a"/>
      <rect x="${bezel}" y="${bezel}" width="${screenW}" height="${screenH}" rx="2" fill="#0a0a0a"/>
      <circle cx="${frameW / 2}" cy="${bezel / 2}" r="3" fill="#444"/>
    </svg>`;
  } else if (type === "tablet") {
    svg = `<svg width="${frameW}" height="${frameH}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${frameW}" height="${frameH}" rx="14" fill="#2a2a2a"/>
      <rect x="${bezel}" y="${bezel}" width="${screenW}" height="${screenH}" rx="3" fill="#0a0a0a"/>
      <circle cx="${frameW / 2}" cy="${bezel / 2}" r="2.5" fill="#444"/>
    </svg>`;
  } else {
    // Phone with notch
    const notchW = Math.min(70, screenW * 0.35);
    svg = `<svg width="${frameW}" height="${frameH}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${frameW}" height="${frameH}" rx="22" fill="#1c1c1c"/>
      <rect x="${(frameW - notchW) / 2}" y="2" width="${notchW}" height="14" rx="7" fill="#1c1c1c"/>
      <rect x="${bezel}" y="${bezel + 8}" width="${screenW}" height="${screenH}" rx="4" fill="#0a0a0a"/>
    </svg>`;
  }

  return sharp(Buffer.from(svg)).resize(frameW, frameH).png().toBuffer();
}

// ══════════════════════════════════════════════════════════════
// Soft Shadow Builder — realistic diffused shadows
// ══════════════════════════════════════════════════════════════

async function buildSoftShadow(
  w: number,
  h: number,
  blur: number,
  color: string,
  spread: number,
): Promise<Buffer> {
  const padW = w + blur * 2 + spread * 2;
  const padH = h + blur * 2 + spread * 2;
  const svg = `<svg width="${padW}" height="${padH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="${blur}"/>
      </filter>
    </defs>
    <rect x="${blur + spread}" y="${blur + spread}" width="${w}" height="${h}" rx="10" fill="${color}" filter="url(#sh)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).resize(padW, padH).png().toBuffer();
}

// ══════════════════════════════════════════════════════════════
// Overlay Builders
// ══════════════════════════════════════════════════════════════

async function buildHeadlineOverlay(
  headline: string,
  subtitle: string,
  W: number,
  font: string,
  pal: NicheDesignProfile["palette"],
  headlineStyle: NicheCreativeDirection["headlineStyle"] = "bold-sans",
): Promise<Buffer> {
  const lines = wrapText(headline, 24);
  // Full-width frosted bar with large emotional headline
  const barH = 300;

  // Style variations based on creative direction
  const styleMap: Record<string, { fontFamily: string; fontSize: number; fontWeight: string; letterSpacing: string; subtitleSize: number; subtitleSpacing: string }> = {
    "bold-sans": {
      fontFamily: `${font}, Arial, Helvetica, sans-serif`,
      fontSize: 54,
      fontWeight: "800",
      letterSpacing: "-0.5",
      subtitleSize: 18,
      subtitleSpacing: "3",
    },
    "elegant-serif": {
      fontFamily: `"Georgia", "Times New Roman", ${font}, serif`,
      fontSize: 50,
      fontWeight: "400",
      letterSpacing: "1.5",
      subtitleSize: 16,
      subtitleSpacing: "4",
    },
    "minimal": {
      fontFamily: `${font}, Arial, Helvetica, sans-serif`,
      fontSize: 44,
      fontWeight: "300",
      letterSpacing: "2",
      subtitleSize: 15,
      subtitleSpacing: "5",
    },
    "urgent": {
      fontFamily: `${font}, Arial, Impact, sans-serif`,
      fontSize: 60,
      fontWeight: "900",
      letterSpacing: "-1",
      subtitleSize: 20,
      subtitleSpacing: "2",
    },
  };

  const s = styleMap[headlineStyle] || styleMap["bold-sans"];

  const svg = `<svg width="${W}" height="${barH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="hbar" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${pal.background}" stop-opacity="0.85"/>
        <stop offset="85%" stop-color="${pal.background}" stop-opacity="0.7"/>
        <stop offset="100%" stop-color="${pal.background}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${barH}" fill="url(#hbar)"/>
    ${lines.map((line, i) =>
      `<text x="${W / 2}" y="${80 + i * 62}" text-anchor="middle" font-family="${s.fontFamily}" font-size="${s.fontSize}" font-weight="${s.fontWeight}" fill="${pal.text}" letter-spacing="${s.letterSpacing}">${escSvg(line)}</text>`
    ).join("")}
    ${subtitle ? `<text x="${W / 2}" y="${92 + lines.length * 62}" text-anchor="middle" font-family="${s.fontFamily}" font-size="${s.subtitleSize}" font-weight="500" fill="${pal.textMuted}" letter-spacing="${s.subtitleSpacing}">${escSvg(subtitle.toUpperCase())}</text>` : ""}
    <rect x="${W / 2 - 30}" y="${108 + lines.length * 62}" width="60" height="3" rx="1.5" fill="${pal.accent}"/>
  </svg>`;
  return sharp(Buffer.from(svg)).resize(W, barH).png().toBuffer();
}

async function buildPills(
  pills: string[],
  W: number,
  H: number,
  font: string,
  pal: NicheDesignProfile["palette"],
): Promise<Buffer> {
  const pillY = H - 155;
  const pillW = 290;
  const pillGap = 20;
  const totalW = pills.length * pillW + (pills.length - 1) * pillGap;
  const startX = (W - totalW) / 2;

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${pills.map((pill, i) => {
      const x = startX + i * (pillW + pillGap);
      return `
      <rect x="${x}" y="${pillY}" width="${pillW}" height="${46}" rx="23" fill="white" fill-opacity="0.92"/>
      <circle cx="${x + 24}" cy="${pillY + 23}" r="7" fill="${pal.accent}"/>
      <text x="${x + 40}" y="${pillY + 28}" font-family="${font}, Arial, sans-serif" font-size="14" font-weight="600" fill="${pal.text}">${escSvg(pill)}</text>`;
    }).join("")}
  </svg>`;
  return sharp(Buffer.from(svg)).resize(W, H).png().toBuffer();
}

async function buildBadge(
  W: number,
  H: number,
  pal: NicheDesignProfile["palette"],
): Promise<Buffer> {
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${W - 280}" y="${H - 100}" width="220" height="42" rx="21" fill="${pal.accent}" fill-opacity="0.95"/>
    <text x="${W - 170}" y="${H - 73}" text-anchor="middle" font-family="Inter, 'Segoe UI', system-ui, Arial, sans-serif" font-size="14" font-weight="700" fill="white" letter-spacing="0.5">Instant Download</text>
  </svg>`;
  return sharp(Buffer.from(svg)).resize(W, H).png().toBuffer();
}

// ══════════════════════════════════════════════════════════════
// Premium Gradient Background (fallback)
// ══════════════════════════════════════════════════════════════

async function buildPremiumGradientBg(
  W: number,
  H: number,
  pal: NicheDesignProfile["palette"],
): Promise<Buffer> {
  // Rich gradient with radial spotlight for depth + vignette at edges
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="lbg" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0%" stop-color="${pal.background}"/>
        <stop offset="50%" stop-color="${pal.primaryLight}"/>
        <stop offset="100%" stop-color="${pal.background}"/>
      </linearGradient>
      <radialGradient id="spot" cx="0.45" cy="0.42" r="0.5">
        <stop offset="0%" stop-color="white" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="white" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="vig" cx="0.5" cy="0.5" r="0.75">
        <stop offset="70%" stop-color="black" stop-opacity="0"/>
        <stop offset="100%" stop-color="black" stop-opacity="0.06"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#lbg)"/>
    <rect width="${W}" height="${H}" fill="url(#spot)"/>
    <rect width="${W}" height="${H}" fill="url(#vig)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).resize(W, H).png().toBuffer();
}

// ── Helpers ──────────────────────────────────────────────────

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function escSvg(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
