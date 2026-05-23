// ══════════════════════════════════════════════════════════════
// Factory Engine 4: Visual Asset Engine
//
// Reads a ProductBlueprint and generates a structured 7-image
// Etsy listing plan with exact capture instructions.
//
// This is the PLANNING layer — it outputs what to capture,
// where, and what text to overlay. Actual image generation
// (screenshots + compositing) is a separate step.
//
// Principles from top-selling Etsy spreadsheet listings:
//   Image 1: Hero mockup — shows real product, drives click
//   Image 2: Problem hook — emotional text, no product
//   Image 3: Dashboard close-up — proves product value
//   Image 4: Key feature — charts, progress, tracking
//   Image 5: Method/system — explains the approach
//   Image 6: What's included — tab grid, feature count
//   Image 7: How it works — 3-step delivery flow
// ══════════════════════════════════════════════════════════════

import type {
  ProductBlueprint,
  ListingImagePlan,
  ListingImageSpec,
  ListingImageKind,
  CropIntent,
  MockupType,
  OverlayStyle,
} from "@/types/factory";
import type { ImageSequenceSlot } from "@/types/visual-direction";
import { getImagePlanConfig, type ImageSlotDef } from "@/lib/factory-layout-families";
import { resolveNicheProfile } from "./factory-niche-themes";
import { getNicheData } from "./factory-niche-data";

// ── ID Generator ────────────────────────────────────────────

let _imgCounter = 0;
function imgId(): string {
  _imgCounter++;
  return `img_${_imgCounter}`;
}

// ══════════════════════════════════════════════════════════════
// IMAGE PLAN BUILDER
// ══════════════════════════════════════════════════════════════

export function buildListingImagePlan(
  blueprint: ProductBlueprint,
  factoryRunId: string
): ListingImagePlan {
  _imgCounter = 0; // reset per plan

  const productName = blueprint.listingStrategy?.titleKeywords?.slice(0, 3).join(" ")
    || blueprint.sourceListingTitle
    || "Budget Tracker";

  // ── Resolve niche profile ──
  const nicheHint = (blueprint.config as { niche?: string })?.niche || blueprint.sourceListingTitle || "budget";
  const nicheProfile = resolveNicheProfile(nicheHint);

  // ── Role-keyword mapping for sourceTabRole → actual tab ──
  const ROLE_KEYWORDS: Record<string, string[]> = {
    "dashboard": ["dashboard"],
    "vendor-tracker": ["vendor"],
    "guest-list": ["guest"],
    "itinerary": ["itinerary"],
    "timeline": ["timeline"],
    "savings-goals": ["savings", "goals"],
    "budget-setup": ["budget setup", "config", "setup"],
    "monthly-pl": ["monthly", "p&l", "profit"],
    "tax-planning": ["tax"],
    "packing": ["packing"],
    "setup": ["setup", "instructions"],
    "transactions": ["transaction"],
    "debt-tracker": ["debt"],
    "bills-due": ["bills", "due"],
    "sinking-funds": ["sinking", "fund"],
    "revenue-log": ["revenue"],
    "expenses": ["expense"],
  };

  function resolveSourceTab(role: string): string | undefined {
    if (!role) return undefined;
    const keywords = ROLE_KEYWORDS[role] || [role];
    const match = blueprint.tabs.find((t) =>
      keywords.some((kw) => t.name.toLowerCase().includes(kw))
    );
    return match?.name;
  }

  // ══════════════════════════════════════════════════════════════
  // PRIMARY PATH: Use VisualDirectionSpec.imageSequence (Gemini-driven)
  // This path produces structurally unique image plans per niche.
  // ══════════════════════════════════════════════════════════════
  const vdSequence = blueprint.visualDirection?.imageSequence;

  if (vdSequence && vdSequence.length >= 3) {
    const images: ListingImageSpec[] = vdSequence.map((seqSlot) => {
      const sourceTab = resolveSourceTab(seqSlot.sourceTabRole);
      // Map kinds to appropriate mockup types and overlay styles
      const { mockupType, overlayStyle } = resolveSlotPresentation(seqSlot);

      return {
        id: imgId(),
        slot: seqSlot.slot,
        kind: seqSlot.kind as ListingImageKind,
        title: seqSlot.title,
        subtitle: seqSlot.subtitle || undefined,
        sourceTab,
        cropIntent: (seqSlot.cropIntent || undefined) as CropIntent | undefined,
        mockupType,
        overlayStyle,
        notes: seqSlot.narrativePurpose,
      };
    });

    const captureInstructions = buildCaptureInstructions(images, blueprint);
    console.log(`[ImagePlan] ✨ Dynamic sequence: ${images.length} images from VisualDirectionSpec [${images.map(i => i.kind).join(" → ")}]`);

    return {
      factoryRunId,
      blueprintId: blueprint.id,
      productType: "sheets",
      productName,
      thumbnailIndex: 1,
      colorScheme: {
        primary: blueprint.colorScheme.primary,
        accent: blueprint.colorScheme.accent,
        background: blueprint.colorScheme.background,
      },
      images,
      captureInstructions,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // FALLBACK PATH: Use hardcoded IMAGE_PLAN_CONFIGS (legacy)
  // Only used when visualDirection.imageSequence is empty/missing.
  // ══════════════════════════════════════════════════════════════
  console.log(`[ImagePlan] ⚠️ No imageSequence in visualDirection — using legacy config for ${nicheProfile.id}`);
  const config = getImagePlanConfig(nicheProfile.id);

  const problemText = buildProblemText(blueprint);
  const placeholders: Record<string, string> = {
    "{PRODUCT_NAME}": productName.toUpperCase(),
    "{PROBLEM_HOOK}": problemText.hook,
    "{PROBLEM_SOLUTION}": problemText.solution,
    "{METHOD_TITLE}": buildMethodTitle(blueprint),
    "{METHOD_SUBTITLE}": buildMethodSubtitle(blueprint),
    "{TAB_COUNT}": String(blueprint.tabs.length),
    "{TAB_LIST}": buildIncludedList(blueprint),
  };

  function resolvePlaceholders(template: string): string {
    let result = template;
    for (const [key, value] of Object.entries(placeholders)) {
      result = result.replace(key, value);
    }
    return result;
  }

  const images: ListingImageSpec[] = [];
  for (const slot of config.slots) {
    const title = resolvePlaceholders(slot.titleTemplate);
    const subtitle = resolvePlaceholders(slot.subtitleTemplate) || undefined;
    const sourceTab = resolveSourceTab(slot.sourceTabRole);

    images.push({
      id: imgId(),
      slot: slot.slot,
      kind: slot.kind as ListingImageKind,
      title,
      subtitle,
      sourceTab,
      cropIntent: (slot.cropIntent || undefined) as CropIntent | undefined,
      mockupType: slot.mockupType as MockupType,
      overlayStyle: slot.overlayStyle as OverlayStyle,
      notes: slot.notes,
    });
  }

  const captureInstructions = buildCaptureInstructions(images, blueprint);

  return {
    factoryRunId,
    blueprintId: blueprint.id,
    productType: "sheets",
    productName,
    thumbnailIndex: 1,
    colorScheme: {
      primary: blueprint.colorScheme.primary,
      accent: blueprint.colorScheme.accent,
      background: blueprint.colorScheme.background,
    },
    images,
    captureInstructions,
  };
}

// ══════════════════════════════════════════════════════════════
// SLOT PRESENTATION RESOLVER
// Maps image kinds → mockupType + overlayStyle
// Different kinds get different visual treatments.
// ══════════════════════════════════════════════════════════════

function resolveSlotPresentation(slot: ImageSequenceSlot): {
  mockupType: MockupType;
  overlayStyle: OverlayStyle;
} {
  switch (slot.kind) {
    case "thumbnail":
      return { mockupType: "laptop", overlayStyle: "bold-dark" };
    case "problem":
      return { mockupType: "text-slide", overlayStyle: "bold-dark" };
    case "dashboard":
      return { mockupType: "fullscreen", overlayStyle: "clean-light" };
    case "feature":
      return { mockupType: "fullscreen", overlayStyle: "clean-light" };
    case "method":
      return { mockupType: "text-slide", overlayStyle: "clean-light" };
    case "included":
      return { mockupType: "text-slide", overlayStyle: "clean-light" };
    case "delivery":
      return { mockupType: "text-slide", overlayStyle: "minimal-premium" };
    case "detail-zoom":
      return { mockupType: "fullscreen", overlayStyle: "minimal-premium" };
    case "comparison":
      return { mockupType: "text-slide", overlayStyle: "bold-dark" };
    case "social-proof":
      return { mockupType: "text-slide", overlayStyle: "minimal-premium" };
    case "lifestyle":
      return { mockupType: "text-slide", overlayStyle: "clean-light" };
    case "guarantee":
      return { mockupType: "text-slide", overlayStyle: "minimal-premium" };
    default:
      return { mockupType: "text-slide", overlayStyle: "clean-light" };
  }
}

// ══════════════════════════════════════════════════════════════
// TEXT GENERATORS
// Produce conversion-focused copy for each image
// ══════════════════════════════════════════════════════════════

function buildProblemText(bp: ProductBlueprint): { hook: string; solution: string } {
  // ── Use ConceptSpec when available (Gemini-driven, unique per niche) ──
  const concept = bp.conceptSpec;
  if (concept) {
    const hook = concept.customerPainPoints?.[0] || concept.emotionalHook;
    const solution = concept.productPromise;
    if (hook && solution) {
      // Truncate to fit image text area — hooks should be short & punchy
      const shortHook = hook.length > 60 ? hook.slice(0, 57) + "..." : hook;
      return { hook: shortHook, solution };
    }
  }

  // ── Fallback: hardcoded per sheetsType ──
  const category = (bp.config as { sheetsType?: string }).sheetsType || "budget_tracker";

  const hooks: Record<string, { hook: string; solution: string }> = {
    budget_tracker: {
      hook: "Where did my money go?",
      solution: "A budget system that saves first and tracks every dollar.",
    },
    paycheck_budget: {
      hook: "Paycheck gone before the month ends?",
      solution: "A paycheck-first budget that plans every dollar before you spend it.",
    },
    business_pl: {
      hook: "No idea if your business is actually profitable?",
      solution: "A P&L dashboard that shows your real numbers — revenue, costs, and margin.",
    },
    wedding_planner: {
      hook: "Wedding costs spiraling out of control?",
      solution: "One planner that tracks vendors, guests, timeline, and every dollar.",
    },
    travel_planner: {
      hook: "Trip always over budget?",
      solution: "Plan every expense before you go — flights, hotels, activities, food.",
    },
    baby_budget: {
      hook: "Overwhelmed by baby costs?",
      solution: "Track every diaper, formula, and checkup — see exactly where it goes.",
    },
    side_hustle: {
      hook: "Juggling income from multiple sources?",
      solution: "Track your side hustle and day job in one clear dashboard.",
    },
    debt_payoff: {
      hook: "Drowning in debt payments?",
      solution: "See your payoff plan, track every payment, crush your debt faster.",
    },
    savings_tracker: {
      hook: "Saving feels impossible?",
      solution: "See exactly where your money goes and watch your savings grow.",
    },
    meal_planner: {
      hook: "Spending too much on food?",
      solution: "Plan meals, track spending, and stay on your food budget.",
    },
  };

  return hooks[category] || hooks.budget_tracker;
}

function buildMethodTitle(bp: ProductBlueprint): string {
  const category = (bp.config as { sheetsType?: string }).sheetsType || "budget_tracker";
  const titles: Record<string, string> = {
    budget_tracker: "Save first. Spend smarter.",
    paycheck_budget: "Every paycheck. Every dollar. Planned.",
    business_pl: "Revenue. Costs. Profit. Clarity.",
    wedding_planner: "Plan with confidence. Stay on budget.",
    travel_planner: "Budget smart. Travel better.",
    baby_budget: "Every cost tracked. Every milestone planned.",
    side_hustle: "Day job + side income. One dashboard.",
    debt_payoff: "See the finish line. Crush your debt.",
    savings_tracker: "Save smarter. See your progress.",
    meal_planner: "Plan meals. Save money. Eat better.",
  };
  return titles[category] || "The system behind the numbers.";
}

function buildMethodSubtitle(bp: ProductBlueprint): string {
  const category = (bp.config as { sheetsType?: string }).sheetsType || "budget_tracker";
  const subs: Record<string, string> = {
    budget_tracker: "Savings 25% · Needs 35% · Wants 20% · Bills 20%",
    paycheck_budget: "Map every paycheck to bills, savings, and spending — automatically",
    business_pl: "Track revenue streams, fixed costs, variable costs, and net profit by month",
    wedding_planner: "Vendor management + guest tracking + timeline + payments",
    travel_planner: "Expense tracking + itinerary + packing + savings goals",
    baby_budget: "Diapers, formula, checkups, milestones — all in one place",
    side_hustle: "Track income streams, expenses, taxes, and net profit side by side",
    debt_payoff: "Snowball or avalanche — pick your method and watch balances drop",
    savings_tracker: "Set goals, automate transfers, and track every dollar saved",
    meal_planner: "Weekly meal plans + grocery lists + spending tracker in one sheet",
  };
  return subs[category] || "";
}

function buildIncludedList(bp: ProductBlueprint): string {
  return bp.tabs.map((t) => `• ${t.name}`).join("\n");
}

// ══════════════════════════════════════════════════════════════
// CAPTURE INSTRUCTIONS
// Human-readable instructions for screenshotting
// ══════════════════════════════════════════════════════════════

function buildCaptureInstructions(images: ListingImageSpec[], bp: ProductBlueprint): string {
  const spreadsheetUrl = "https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit";
  const lines: string[] = [
    `SCREENSHOT CAPTURE PLAN: ${bp.tabs.length}-tab spreadsheet`,
    `Spreadsheet: ${spreadsheetUrl}`,
    `Color scheme: ${bp.colorScheme.primary} (primary)`,
    "",
    "CAPTURE ORDER:",
    "",
  ];

  for (const img of images) {
    lines.push(`IMAGE ${img.slot}: ${img.kind.toUpperCase()}`);
    lines.push(`  Title overlay: "${img.title}"`);
    if (img.subtitle) lines.push(`  Subtitle: "${img.subtitle}"`);
    if (img.sourceTab) lines.push(`  Tab: ${img.sourceTab}`);
    if (img.sourceRange) lines.push(`  Range: ${img.sourceRange}`);
    if (img.cropIntent) lines.push(`  Crop: ${img.cropIntent}`);
    lines.push(`  Frame: ${img.mockupType}`);
    lines.push(`  Style: ${img.overlayStyle}`);
    if (img.notes) lines.push(`  Notes: ${img.notes}`);
    lines.push("");
  }

  lines.push(`OUTPUT: ${images.length} images at 2000x2000px, JPEG or PNG`);
  lines.push("Image 1 = recommended Etsy thumbnail");

  return lines.join("\n");
}

// ══════════════════════════════════════════════════════════════
// EXPORT: Plan summary for quick display
// ══════════════════════════════════════════════════════════════

export function summarizeImagePlan(plan: ListingImagePlan): string {
  const lines = [
    `📸 ${plan.images.length} Listing Images for "${plan.productName}"`,
    `   Thumbnail: Image ${plan.thumbnailIndex}`,
    "",
  ];
  for (const img of plan.images) {
    lines.push(`   ${img.slot}. [${img.kind}] "${img.title}" — ${img.mockupType}`);
  }
  return lines.join("\n");
}
