// ══════════════════════════════════════════════════════════════
// Factory Engine 5: Listing Copy Generator
//
// Hybrid approach:
//   1. Gemini writes creative copy (title, description, hook)
//   2. Deterministic layer fills FAQ, delivery, pricing, captions
//
// Output: a ListingCopyPackage ready for Etsy upload
// ══════════════════════════════════════════════════════════════

import { callGeminiJSON, parseGeminiJSON } from "@/lib/gemini";
import type { ProductBlueprint, ListingImagePlan, ListingCopyPackage } from "@/types/factory";
import type { ListingPositioningSpec, CopyDirectionSpec } from "@/types/gemini-specs";
import { resolveLayoutFamily } from "@/lib/factory-layout-families";

// ══════════════════════════════════════════════════════════════
// PART 1: GEMINI CREATIVE COPY
// Produces: titles, tags, hook, full description
// ══════════════════════════════════════════════════════════════

interface GeminiCopy {
  titleOptions: string[];
  recommendedTitle: string;
  tags: string[];
  shortHook: string;
  fullDescription: string;
  differentiators: string[];
}

/** Niche-specific prompt context — problem hooks, audience, tone, and transformation arc */
function getNichePromptContext(nicheId: string): string {
  const contexts: Record<string, string> = {
    "baby-budget": `NICHE CONTEXT: New and expecting parents tracking baby-related expenses.
EMOTIONAL HOOK: Parents feel overwhelmed by unexpected baby costs. This gives them control.
TONE: Warm, reassuring, supportive — not clinical. Use words like "confidence", "peace of mind", "prepared".
AUDIENCE: First-time parents, baby shower gift buyers, pregnancy planners.
KEY PAIN: Diapers, formula, gear, childcare — costs pile up fast with no visibility.
TRANSFORMATION ARC:
  BEFORE: "Spreadsheets everywhere. No idea if you can afford the stroller. Every purchase feels like a gamble."
  TURNING POINT: "One template. All baby costs. Real-time totals. Visual progress on every savings goal."
  AFTER: "You open the tracker, see green across the board, and exhale. You're ready for this."`,

    "wedding-planner": `NICHE CONTEXT: Brides/grooms planning their wedding budget.
EMOTIONAL HOOK: Wedding budgets spiral fast. Couples need one elegant place to see everything.
TONE: Romantic, aspirational, premium — not stressful. Use words like "dream", "stress-free", "stunning".
AUDIENCE: Engaged couples, wedding planners, parents of the bride/groom.
KEY PAIN: Vendor quotes, deposits, guest counts, payment schedules — scattered across apps and notes.
TRANSFORMATION ARC:
  BEFORE: "Vendor quotes in your inbox, guest counts on sticky notes, and a growing knot in your stomach."
  TURNING POINT: "One beautiful planner. Every vendor, every guest, every dollar — in one view."
  AFTER: "You check the dashboard, smile, and go back to enjoying your engagement. The numbers are handled."`,

    "business-pl": `NICHE CONTEXT: Small business owners and freelancers tracking profit & loss.
EMOTIONAL HOOK: Most small businesses guess their numbers. This shows real profitability.
TONE: Professional, analytical, confident — not salesy. Use words like "clarity", "profit", "data-driven".
AUDIENCE: Solopreneurs, freelancers, small business owners, Etsy sellers.
KEY PAIN: Revenue vs expenses unclear, tax season chaos, no real P&L visibility.
TRANSFORMATION ARC:
  BEFORE: "You check your bank balance and hope for the best. Tax season is a scramble. 'Am I even profitable?'"
  TURNING POINT: "One dashboard. Revenue, expenses, profit margin — updated automatically."
  AFTER: "You open the P&L, see your real margin, and make decisions with data — not gut feelings."`,

    "paycheck-budget": `NICHE CONTEXT: Paycheck-to-paycheck budgeters allocating every dollar.
EMOTIONAL HOOK: Most people don't know where their money goes between paychecks.
TONE: Empowering, practical, no-nonsense — not preachy. Use words like "control", "every dollar", "freedom".
AUDIENCE: Young professionals, couples, anyone living paycheck-to-paycheck.
KEY PAIN: Bills, subscriptions, and impulse spending eat up paychecks with nothing left to save.
TRANSFORMATION ARC:
  BEFORE: "Paycheck hits. Bills go out. You check your balance mid-month and wonder what happened."
  TURNING POINT: "Every dollar gets a job before you spend it. Bills, savings, spending — all planned."
  AFTER: "You get paid, open the tracker, and already know exactly where every dollar goes. No surprises."`,

    "travel-planner": `NICHE CONTEXT: Travelers planning and budgeting trips.
EMOTIONAL HOOK: Trips always end up costing more than expected. This keeps it on track.
TONE: Adventurous, organized, exciting — not restrictive. Use words like "explore", "plan smarter", "dream trip".
AUDIENCE: Frequent travelers, vacation planners, couples planning honeymoons.
KEY PAIN: Flights, hotels, activities, food — costs are scattered and hard to compare.
TRANSFORMATION ARC:
  BEFORE: "You get home from vacation, check your credit card statement, and feel the regret."
  TURNING POINT: "Plan every expense before you go. See the real cost. Save smarter."
  AFTER: "You land, enjoy every moment, and come home knowing you stayed on budget. No post-trip anxiety."`,

    "savings-tracker": `NICHE CONTEXT: People building savings goals and emergency funds.
EMOTIONAL HOOK: Saving feels impossible when you can't see your progress.
TONE: Motivating, visual, encouraging. Use words like "grow", "milestone", "progress".
AUDIENCE: Anyone starting to save, people with multiple savings goals.
KEY PAIN: No visibility into progress, competing goals, and motivation fades fast.
TRANSFORMATION ARC:
  BEFORE: "You transfer money to savings and hope for the best. No idea if you're on track."
  TURNING POINT: "Visual progress bars. Color-coded goals. Automatic tracking."
  AFTER: "You see the bars fill up week by week. Each milestone hit feels like a win."`,

    "debt-payoff": `NICHE CONTEXT: People paying down debt using snowball or avalanche methods.
EMOTIONAL HOOK: Debt feels crushing when you can't see the finish line.
TONE: Empowering, strategic, hopeful. Use words like "freedom", "payoff date", "progress".
AUDIENCE: People with credit card debt, student loans, or multiple debts.
KEY PAIN: Multiple balances, minimum payments, interest eating into progress.
TRANSFORMATION ARC:
  BEFORE: "Multiple balances, minimum payments, and the nagging feeling you'll never be free."
  TURNING POINT: "One tracker. Snowball or avalanche — your choice. See the payoff date."
  AFTER: "You watch the balances drop. You see the finish line. Freedom has a date."`,

    "side-hustle": `NICHE CONTEXT: People tracking income from side hustles alongside their day job.
EMOTIONAL HOOK: Most side hustlers don't know if they're actually profitable.
TONE: Entrepreneurial, energetic, practical. Use words like "profitable", "grow", "track".
AUDIENCE: Etsy sellers, freelancers, gig workers, content creators.
KEY PAIN: Multiple income streams, mixed expenses, no clear picture of what's working.
TRANSFORMATION ARC:
  BEFORE: "Money comes in from 3 sources, expenses are mixed together, and you have no idea what's working."
  TURNING POINT: "Track every stream. See real profit per hustle. Know your numbers."
  AFTER: "You open the dashboard and instantly see which hustle is worth your time — and which isn't."`,

    "pregnancy-planner": `NICHE CONTEXT: Expecting parents preparing financially for a baby.
EMOTIONAL HOOK: Pregnancy is exciting — but the financial unknowns add stress.
TONE: Gentle, reassuring, forward-looking. Use words like "prepared", "plan ahead", "peace of mind".
AUDIENCE: Expecting parents, couples trying to conceive, baby shower gift buyers.
KEY PAIN: Prenatal costs, nursery setup, maternity leave planning, insurance changes.
TRANSFORMATION ARC:
  BEFORE: "The excitement of a positive test meets the anxiety of 'can we afford this?'"
  TURNING POINT: "Every cost mapped out. Nursery, checkups, leave — all planned before baby arrives."
  AFTER: "You walk into the nursery knowing every dollar is accounted for. Just joy. No financial stress."`,

    "student-budget": `NICHE CONTEXT: College students managing limited funds.
EMOTIONAL HOOK: Students rarely learn to budget — this makes it simple.
TONE: Casual, simple, relatable. Use words like "simple", "smart", "semester".
AUDIENCE: College students, parents of students, recent graduates.
KEY PAIN: Irregular income, textbooks, food, rent — every dollar matters.
TRANSFORMATION ARC:
  BEFORE: "Check your balance, wince, and eat ramen for the third time this week."
  TURNING POINT: "One simple tracker. See what's left. Plan the semester."
  AFTER: "You actually have money left at the end of the month. First time ever."`,

    "meal-planner": `NICHE CONTEXT: Families and individuals budgeting their food expenses.
EMOTIONAL HOOK: Food is the #1 budget-buster. Most people have no idea what they actually spend.
TONE: Practical, family-friendly, helpful. Use words like "save", "plan", "healthy".
AUDIENCE: Families, meal preppers, health-conscious budgeters.
KEY PAIN: Grocery overspending, food waste, eating out too much, no meal plan.
TRANSFORMATION ARC:
  BEFORE: "Another $200 grocery trip. Half of it goes bad. DoorDash again Tuesday."
  TURNING POINT: "Plan meals. Track spending. See exactly where your food budget goes."
  AFTER: "Sunday meal prep done. Groceries on budget. Zero food waste. You actually saved money this week."`,

    "adhd-planner": `NICHE CONTEXT: People with ADHD who need a simple, visual budget system.
EMOTIONAL HOOK: Traditional budgets are overwhelming. This one is built for how your brain works.
TONE: Understanding, simple, zero-overwhelm. Use words like "simple", "visual", "no clutter".
AUDIENCE: Adults with ADHD, neurodivergent individuals, people who've tried and failed other systems.
KEY PAIN: Too many categories, too many tabs, decision fatigue, forgetting to check in.
TRANSFORMATION ARC:
  BEFORE: "You downloaded 5 budget apps. Used each one for 3 days. Now they're all abandoned."
  TURNING POINT: "Minimal categories. Visual bars. One dashboard. Built for brains that work differently."
  AFTER: "You actually check it. It takes 30 seconds. And for the first time, budgeting doesn't feel like punishment."`,
  };
  return contexts[nicheId] || "";
}

function buildCopyPrompt(
  bp: ProductBlueprint,
  imagePlan?: ListingImagePlan,
  positioning?: ListingPositioningSpec,
  copyDir?: CopyDirectionSpec,
): string {
  const tabList = bp.tabs.map((t) => `• ${t.name}: ${t.purpose}`).join("\n");
  const chartList = bp.charts.map((c) => `• ${c.title} (${c.type})`).join("\n") || "None";
  const improvements = bp.differentiation?.ourImprovements?.join(", ") || "better dashboard, more features";
  const weaknesses = bp.competitorWeaknesses?.join(", ") || "basic layout, no charts";
  const price = bp.suggestedPrice || 11.97;
  const niche = (bp.config as { sheetsType?: string }).sheetsType || "budget_tracker";

  // Family-aware context for richer copy
  const family = resolveLayoutFamily(niche.replace(/_/g, "-"));
  const familyHint = `PRODUCT FAMILY: ${family.label} (${family.contentDensity} density, ${family.kpiCount} KPIs, ${family.chartPreference} charts)`;

  // Use CopyDirectionSpec if available, fall back to generic niche context
  const nicheContext = copyDir
    ? `COPY DIRECTION (from creative AI):
TONE: ${copyDir.tone}
SENTENCE STYLE: ${copyDir.sentenceStyle}
DESCRIPTION STRUCTURE: ${copyDir.descriptionStructure}
BRAND VOICE: "${copyDir.brandVoice}"
POWER WORDS: ${copyDir.vocabulary.join(", ")}
AVOID WORDS: ${copyDir.avoidWords.join(", ")}
CTA STYLE: ${copyDir.ctaStyle}
TITLE FORMAT: ${copyDir.titleFormat}
EMOJI STYLE: ${copyDir.emojiStyle}`
    : getNichePromptContext(niche.replace(/_/g, "-"));

  // Use ListingPositioningSpec if available
  const posContext = positioning
    ? `POSITIONING (from creative AI):
PRIMARY BENEFIT: "${positioning.primaryBenefit}"
AUDIENCE: "${positioning.audiencePersona}"
HOOK ANGLE: "${positioning.hookAngle}"
SECONDARY BENEFITS: ${positioning.secondaryBenefits.join(" | ")}
EMOTIONAL TRIGGERS: ${positioning.emotionalTriggers.join(" | ")}
OBJECTIONS: ${positioning.objectionHandlers.map(o => `${o.objection} → ${o.response}`).join(" | ")}
SOCIAL PROOF ANGLE: "${positioning.socialProofAngle}"
${positioning.urgencyElement ? `URGENCY: "${positioning.urgencyElement}"` : ""}
CATEGORY: ${positioning.categoryPosition}
SEO KEYWORDS: ${positioning.seoKeywords.join(", ")}`
    : `Our positioning: ${bp.positioning || "premium save-first budget system"}`;

  const imageContext = imagePlan
    ? `\nIMAGE SEQUENCE (for description flow):\n${imagePlan.images.map((i) => `  ${i.slot}. ${i.kind}: "${i.title}"`).join("\n")}`
    : "";

  return `You are an expert Etsy copywriter specializing in digital product listings. Write listing copy for a Google Sheets spreadsheet product.

PRODUCT DETAILS:
Type: Google Sheets ${niche.replace(/_/g, " ")}
Tabs: ${bp.tabs.length}
${tabList}
Charts: ${chartList}
Color: ${bp.colorScheme.primary} scheme
Price: $${price}

COMPETITOR CONTEXT:
Competitor title: "${bp.sourceListingTitle || "Generic budget tracker"}"
Their weaknesses: ${weaknesses}
Our improvements: ${improvements}
${posContext}
${familyHint}
${nicheContext}
${imageContext}

ETSY LISTING RULES:
1. Title: max 140 characters, front-load keywords, include "Google Sheets" and product type
2. Tags: exactly 13 tags, each UNDER 20 characters, no duplicates, no spaces at start/end
3. Description: 500-900 words, structured with headers, bullet points, clear sections
4. Hook: 1-2 sentences that make the buyer stop scrolling — NEVER start with "Introducing" or "This is"
5. FIRST SENTENCE must be a question or visceral emotional statement
6. Every bullet point starts with a BENEFIT verb: "See", "Track", "Save", "Automate", "Simplify"
7. Use "you/your" at least 3x more than "we/our" — speak directly to the buyer
8. Include ONE specific number-based claim: "${bp.tabs.length} auto-calculating tabs", "tracks ${bp.tabs.length > 5 ? "12+" : "8+"} categories"
9. Focus on the TRANSFORMATION: buyer goes from confused/stressed → organized/confident
10. End description with a SOFT CTA: "Ready to take control?" — NOT "BUY NOW!"
11. Sound premium, simple, and trustworthy — no fake urgency or scammy language
12. Mention specific features: dashboard, ${bp.charts.length} visual charts, ${bp.tabs.length} tabs, automatic formulas
${copyDir ? `13. MATCH THIS TONE: ${copyDir.tone} — use ${copyDir.sentenceStyle} sentences` : ""}
${positioning ? `14. USE THESE SEO KEYWORDS naturally: ${positioning.seoKeywords.slice(0, 5).join(", ")}` : ""}

TITLE FORMAT:
"[Product Name] Google Sheets, [Benefit/Feature], [Audience], Digital Download"

DESCRIPTION STRUCTURE (emotional-first — this order matters):
1. TRANSFORMATION HOOK (3-4 sentences)${copyDir ? ` — voice: "${copyDir.brandVoice}"` : ""}
   Paint the before→after picture. Start with the pain, end with the relief.
   Make the reader SEE themselves using this product.

2. THE PROMISE (2-3 bullet points)
   State core benefits as OUTCOMES, not features.
   Wrong: "Includes 6 tabs". Right: "Finally see where every dollar goes".

3. WHAT'S INSIDE (tab list)
   Frame EACH tab as a benefit, not just a name.
   Wrong: "Dashboard tab". Right: "Dashboard — your financial command center, updated automatically".

4. WHY YOU'LL LOVE IT (5-7 bullet points)
   Lead each bullet with an action verb. Focus on feelings and outcomes.

5. PERFECT FOR (3-5 personas as situations, not demographics)
   Wrong: "Women ages 25-35". Right: "For the parent who opens their bank app and winces."

6. HOW IT WORKS (3 steps, each under 10 words)

7. WHAT MAKES THIS DIFFERENT (3-4 points — lead with transformation, not specs)

8. DEVICE COMPATIBILITY + IMPORTANT NOTES (digital download, no physical product)

CRITICAL FORMATTING RULE — Etsy does NOT render markdown. NEVER use:
- ### or ## or # headers (use ALL CAPS instead, e.g. "WHAT'S INSIDE")
- **bold** or *italic* markers (just write plain text)
- Bullet lists with * or - (use • unicode bullet instead)
- Any markdown syntax whatsoever
Instead use: ALL CAPS for section headers, • for bullets, plain text for everything else.
Line breaks (\\n) are fine and encouraged for readability.

Respond ONLY with valid JSON:
{
  "titleOptions": ["title1 (max 140 chars)", "title2", "title3"],
  "recommendedTitle": "the best title from the 3",
  "tags": ["tag1", "tag2", ... exactly 13 tags, each under 20 chars],
  "shortHook": "1-2 sentence hook for the listing",
  "fullDescription": "the full listing description — PLAIN TEXT ONLY, no markdown, use \\n for line breaks",
  "differentiators": ["point1", "point2", "point3"]
}`;
}

/** Strip markdown that Etsy can't render — safety net for AI output */
function stripMarkdownForEtsy(text: string): string {
  return text
    // Remove markdown headers: ### Header → HEADER
    .replace(/^#{1,6}\s+(.+)$/gm, (_m, title) => title.toUpperCase())
    // Remove bold markers: **text** → text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    // Remove italic markers: *text* → text
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1")
    // Convert markdown bullets: - item or * item → • item
    .replace(/^[\s]*[-*]\s+/gm, "• ")
    // Remove backticks
    .replace(/`([^`]+)`/g, "$1")
    // Clean up multiple blank lines
    .replace(/\n{3,}/g, "\n\n");
}

function parseGeminiCopy(raw: Record<string, unknown>): GeminiCopy {
  const titles = Array.isArray(raw.titleOptions) ? (raw.titleOptions as string[]).slice(0, 3) : [];
  const tags = Array.isArray(raw.tags)
    ? (raw.tags as string[]).map((t) => t.trim().slice(0, 20)).filter(Boolean).slice(0, 13)
    : [];

  const rawDesc = typeof raw.fullDescription === "string" ? raw.fullDescription : "";

  return {
    titleOptions: titles,
    recommendedTitle: typeof raw.recommendedTitle === "string" ? raw.recommendedTitle.slice(0, 140) : titles[0] || "Budget Tracker Google Sheets",
    tags,
    shortHook: typeof raw.shortHook === "string" ? stripMarkdownForEtsy(raw.shortHook) : "",
    fullDescription: stripMarkdownForEtsy(rawDesc),
    differentiators: Array.isArray(raw.differentiators) ? raw.differentiators as string[] : [],
  };
}

// ══════════════════════════════════════════════════════════════
// PART 2: DETERMINISTIC LAYERS
// FAQ, delivery, pricing, and image captions
// ══════════════════════════════════════════════════════════════

function buildFaq(bp: ProductBlueprint): ListingCopyPackage["faq"] {
  return [
    {
      question: "Is this for Google Sheets or Excel?",
      answer: "Works in both! The file is delivered as .xlsx — upload it to Google Drive and open with Google Sheets for the best experience. All formulas, charts, and formatting transfer perfectly.",
    },
    {
      question: "Can I edit and customize it?",
      answer: "Absolutely — it's yours to make your own. After opening in Google Sheets, go to File → Make a copy. From there, change categories, colors, goals, amounts — everything. All ${bp.tabs.length} tabs and every formula stay intact no matter what you customize.",
    },
    {
      question: "Do I need spreadsheet experience?",
      answer: `Not at all. If you can type a number, you can use this. Everything is pre-built with ${bp.tabs.length} tabs, automatic formulas, and sample data so you can see exactly how it works. The Setup tab walks you through it step by step — most people are up and running in under 5 minutes.`,
    },
    {
      question: "Is this a one-time purchase?",
      answer: "Yes — buy once, use forever. No subscriptions, no monthly fees, no apps to install. Download it, make a copy, and it's yours for life.",
    },
    {
      question: "Will the formulas work automatically?",
      answer: `Yes! Just enter your numbers and watch everything update in real time. The dashboard${bp.charts.length > 0 ? ", visual charts," : ""} and summaries calculate automatically — no manual math, no errors. You'll see your totals, progress, and status update the moment you type.`,
    },
    {
      question: "What do I receive after purchase?",
      answer: "You receive 1 downloadable .xlsx file. Upload to Google Drive, open in Google Sheets, hit File → Make a copy, and you're ready to go. The whole setup takes about 2 minutes.",
    },
  ];
}

function buildDeliveryInstructions(bp: ProductBlueprint): string {
  const productName = bp.listingStrategy?.titleKeywords?.slice(0, 3).join(" ") || "Budget Tracker";

  return [
    `WHAT YOU RECEIVE`,
    `${productName}.xlsx`,
    ``,
    `HOW TO ACCESS YOUR TEMPLATE`,
    ``,
    `1. Download the .xlsx file from your Etsy purchases`,
    `2. Go to drive.google.com`,
    `3. Click "+ New" → "File upload" → select the downloaded file`,
    `4. Right-click the file → "Open with" → "Google Sheets"`,
    `5. Go to File → "Make a copy" to get your own editable version`,
    `6. Start with the ${bp.tabs.find((t) => t.name.toLowerCase().includes("setup") && !t.name.toLowerCase().includes("instruction"))?.name || "Budget Setup"} tab`,
    ``,
    `IMPORTANT`,
    `You must "Make a copy" to edit. The uploaded version is read-only until copied.`,
    `All formulas update automatically. Sample data is included — clear it and add your own.`,
    ``,
    `NEED HELP?`,
    `Message us on Etsy and we'll respond within 24 hours.`,
  ].join("\n");
}

function buildPricing(bp: ProductBlueprint): ListingCopyPackage["pricing"] {
  const hasCharts = bp.charts.length > 0;
  const tabCount = bp.tabs.length;

  // Tier determines the sale price bracket
  let tier: "low" | "mid" | "premium" = "mid";
  if (hasCharts && tabCount >= 6) tier = "premium";
  if (tabCount <= 3 && !hasCharts) tier = "low";

  // Sale price: what the buyer actually pays ($4.99–$7.99)
  const salePrice = tier === "premium" ? 7.99
    : tier === "mid" ? 5.99
    : 4.99;

  // Original/anchor price: 3–4× the sale price, rounded to .99
  // Creates a 60–75% perceived discount
  const anchorMultiplier = tier === "premium" ? 3 : tier === "mid" ? 3.5 : 4;
  const rawAnchor = salePrice * anchorMultiplier;
  const originalPrice = Math.floor(rawAnchor) + 0.99;

  const discountPct = Math.round((1 - salePrice / originalPrice) * 100);

  return {
    launchPrice: salePrice,
    standardPrice: originalPrice,
    bundlePriceSuggestion: +(originalPrice * 2.5).toFixed(2),
    rationale: `${discountPct}% OFF SALE — Was $${originalPrice.toFixed(2)}, now $${salePrice.toFixed(2)}. ${tabCount} tabs, ${bp.charts.length} charts. Price to build reviews fast, raise later.`,
  };
}

function buildThumbnailText(bp: ProductBlueprint): string {
  const niche = (bp.config as { sheetsType?: string }).sheetsType || "budget_tracker";
  // Line 1: Emotional hook (CAPS, short, punchy)
  // Line 2: Transformation promise
  // Line 3: Product descriptor
  const labels: Record<string, string> = {
    budget_tracker: "STOP GUESSING\nWhere Your Money Goes\nGoogle Sheets Budget Tracker",
    paycheck_budget: "EVERY DOLLAR\nPlanned Before You Spend\nGoogle Sheets Budget Planner",
    business_pl: "KNOW YOUR\nReal Profit\nGoogle Sheets P&L Tracker",
    wedding_planner: "YOUR DREAM WEDDING\nOn Budget\nGoogle Sheets Wedding Planner",
    baby_budget: "BABY COSTS\nUnder Control\nGoogle Sheets Baby Budget",
    travel_planner: "TRAVEL SMARTER\nStay On Budget\nGoogle Sheets Trip Planner",
    savings_tracker: "WATCH YOUR\nSavings Grow\nGoogle Sheets Savings Tracker",
    debt_payoff: "SEE THE\nFinish Line\nGoogle Sheets Debt Payoff Tracker",
    side_hustle: "IS YOUR HUSTLE\nActually Profitable?\nGoogle Sheets Profit Tracker",
    pregnancy_planner: "FINANCIALLY READY\nFor Baby\nGoogle Sheets Pregnancy Planner",
    student_budget: "STRETCH EVERY\nDollar Further\nGoogle Sheets Student Budget",
    meal_planner: "CUT FOOD COSTS\nEat Better\nGoogle Sheets Meal Planner",
    adhd_planner: "FINALLY A BUDGET\nThat Clicks\nGoogle Sheets Simple Tracker",
  };
  return labels[niche] || "TAKE CONTROL\nOf Your Money\nGoogle Sheets Budget Tracker";
}

function buildImageCaptions(imagePlan?: ListingImagePlan): ListingCopyPackage["imageCaptions"] {
  if (!imagePlan) return [];

  return imagePlan.images.map((img) => {
    let caption = img.title;
    if (img.subtitle) caption += ` — ${img.subtitle}`;
    return { imageSlot: img.slot, caption };
  });
}

// ══════════════════════════════════════════════════════════════
// LOCAL FALLBACK (when Gemini is unavailable)
// ══════════════════════════════════════════════════════════════

function buildLocalCopy(bp: ProductBlueprint): GeminiCopy {
  const name = bp.sourceListingTitle || "Budget Planner";
  const niche = (((bp.config as unknown) as Record<string, unknown>)?.sheetsType as string || "budget_tracker").replace(/_/g, " ");
  const tabCount = bp.tabs?.length || 6;
  const tabNames = bp.tabs?.map(t => t.name).join(", ") || "Dashboard, Transactions, Summary";

  const title = `${name} | Google Sheets Template | Instant Download | ${tabCount} Tabs`;
  return {
    titleOptions: [
      title,
      `${name} Spreadsheet — Auto-Calculating ${niche} Template for Google Sheets`,
      `Professional ${name} | ${tabCount}-Tab Google Sheets ${niche} Template`,
    ],
    recommendedTitle: title.slice(0, 140),
    tags: [
      niche, "google sheets", "spreadsheet template", "budget planner",
      "instant download", "finance tracker", "expense tracker",
      "monthly budget", "savings tracker", "digital download",
      "budget spreadsheet", "financial planner", "money tracker",
    ].slice(0, 13),
    shortHook: `Take control of your ${niche} with this professional, auto-calculating Google Sheets template.`,
    fullDescription: [
      `📊 ${name.toUpperCase()}`,
      ``,
      `A complete, professionally designed Google Sheets template with ${tabCount} organized tabs — everything you need to manage your ${niche} in one place.`,
      ``,
      `✅ WHAT'S INCLUDED:`,
      `• ${tabCount} organized tabs: ${tabNames}`,
      `• Auto-calculating formulas — just enter your numbers`,
      `• Visual charts and dashboard with key metrics`,
      `• Clean, modern design that's easy to customize`,
      `• Works on desktop, tablet, and phone`,
      ``,
      `📋 HOW IT WORKS:`,
      `1. Purchase and download instantly`,
      `2. Open in Google Sheets (File → Make a Copy)`,
      `3. Start entering your data — all formulas are pre-built`,
      ``,
      `💡 No spreadsheet experience needed. If you can type a number, you can use this.`,
      ``,
      `⚡ Instant digital delivery — no shipping, no waiting.`,
    ].join("\n"),
    differentiators: [
      `${tabCount} professionally designed tabs with auto-calculating formulas`,
      "Works on any device — desktop, tablet, or phone via Google Sheets",
      "Clean, modern design with visual charts and dashboard",
    ],
  };
}

// ══════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════

export async function generateListingCopy(
  blueprint: ProductBlueprint,
  factoryRunId: string,
  imagePlan?: ListingImagePlan
): Promise<ListingCopyPackage> {
  const apiKey = process.env.GEMINI_API_KEY;

  // Pull Gemini-generated specs from blueprint if available
  const positioning = blueprint.listingPositioning;
  const copyDir = blueprint.copyDirection;

  // Step 1: Gemini creative copy — with local fallback when API unavailable
  let copy: ReturnType<typeof parseGeminiCopy>;
  try {
    if (!apiKey) throw new Error("No GEMINI_API_KEY");
    const prompt = buildCopyPrompt(blueprint, imagePlan, positioning, copyDir);
    const rawText = await callGeminiJSON(apiKey, prompt);
    const raw = parseGeminiJSON<Record<string, unknown>>(rawText);
    copy = parseGeminiCopy(raw);
  } catch (err) {
    console.warn("[ListingCopy] Gemini failed, using local fallback:", (err as Error).message);
    copy = buildLocalCopy(blueprint);
  }

  // Step 2: Validate tags (must be exactly 13, each under 20 chars)
  // Prefer positioning-derived tags, then generic fallbacks
  const positioningTags = positioning?.seoKeywords
    ?.map((t: string) => t.trim().slice(0, 20))
    .filter((t: string) => t.length > 0) || [];
  while (copy.tags.length < 13) {
    const fallbackTags = [
      ...positioningTags,
      "budget spreadsheet", "google sheets", "monthly budget",
      "savings tracker", "expense tracker", "budget planner",
      "finance template", "money tracker", "paycheck budget",
      "budget dashboard", "savings goals", "digital budget",
      "sheet template",
    ];
    const missing = fallbackTags.find((t) => !copy.tags.includes(t));
    if (missing) copy.tags.push(missing);
    else break;
  }
  copy.tags = copy.tags.slice(0, 13);

  // Step 3: Deterministic layers
  const niche = (blueprint.config as { sheetsType?: string }).sheetsType || "budget_tracker";

  return {
    factoryRunId,
    blueprintId: blueprint.id,
    productType: "sheets",
    niche: niche.replace(/_/g, " "),
    titleOptions: copy.titleOptions,
    recommendedTitle: copy.recommendedTitle,
    tags: copy.tags,
    thumbnailText: buildThumbnailText(blueprint),
    shortHook: copy.shortHook,
    fullDescription: copy.fullDescription,
    faq: buildFaq(blueprint),
    pricing: buildPricing(blueprint),
    differentiators: copy.differentiators,
    imageCaptions: buildImageCaptions(imagePlan),
    deliveryInstructions: buildDeliveryInstructions(blueprint),
  };
}
