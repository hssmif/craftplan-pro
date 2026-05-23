"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useSettings } from "@/hooks/useSettings";
import { useCatalogStore } from "@/stores/catalogStore";

const TEMPLATE_TYPES = [
  { id: "life_os", name: "LifeOS Ultra — All-in-One", icon: "\u{1F9EC}", demand: "Very High", avgPrice: "$15-25", competition: "Low", features: ["11 connected databases with 15+ formulas", "Tasks with energy-based scheduling", "Focus sessions with Pomodoro tracking", "Habit streaks + daily wellness log", "Workout & fitness tracking", "Budget & expense tracking", "Journal with reflection depth scoring", "Reading & learning tracker", "Travel plans with budget calculator", "5 hub workspaces + weekly review"] },
  { id: "life_planner", name: "All-in-One Life Planner", icon: "\u{1F31F}", demand: "Very High", avgPrice: "$8-15", competition: "High", features: ["Dashboard home page with widgets", "Calendar & weekly planner", "Goal setting with progress tracking", "Habit tracker with streaks", "Budget & expense tracker", "Health & wellness log", "Journal / reflection pages", "To-do lists with priorities", "Reading list / media tracker"] },
  { id: "student_planner", name: "Student / University Planner", icon: "\u{1F393}", demand: "Very High", avgPrice: "$3-8", competition: "Medium", features: ["Semester overview dashboard", "Course manager with schedule", "Assignment tracker with deadlines", "Grade calculator with GPA", "Study session timer/log", "Exam preparation planner", "Notes & resources library", "Weekly class schedule", "Project tracker"] },
  { id: "finance_tracker", name: "Finance / Budget Tracker", icon: "\u{1F4B0}", demand: "High", avgPrice: "$5-12", competition: "Medium", features: ["Financial dashboard with summaries", "Income tracker (multiple sources)", "Expense tracker with categories", "Monthly budget planner", "Savings goals with progress bars", "Debt snowball/avalanche tracker", "Subscription manager", "Net worth calculator", "Bill payment reminders"] },
  { id: "adhd_planner", name: "ADHD-Friendly Planner", icon: "\u{1F9E0}", demand: "High", avgPrice: "$10-18", competition: "Low", features: ["Visual dashboard with color coding", "Brain dump / quick capture page", "Time blocking with visual blocks", "Task prioritization (energy levels)", "Habit tracker with visual streaks", "Focus timer / Pomodoro tracker", "Reward system / gamification", "Daily routine builder", "Quick links on every page"] },
  { id: "social_media", name: "Social Media Planner", icon: "\u{1F4F1}", demand: "High", avgPrice: "$5-10", competition: "Medium", features: ["Content calendar (grid view)", "Post planner with platform tags", "Content ideas bank", "Analytics tracker", "Hashtag library", "Brand guidelines page", "Collaboration / review pipeline", "Engagement tracker", "Monthly content themes"] },
  { id: "habit_tracker", name: "Habit Tracker & Wellness", icon: "\u2705", demand: "High", avgPrice: "$3-8", competition: "Medium", features: ["Habit dashboard with streaks", "Daily check-in with mood", "Weekly & monthly overview charts", "Gamification (points, levels, badges)", "Morning & evening routines", "Water intake tracker", "Sleep log", "Exercise / workout log", "Reflection journal"] },
  { id: "business_hub", name: "Small Business Hub", icon: "\u{1F4BC}", demand: "Medium", avgPrice: "$8-20", competition: "Low", features: ["Business dashboard with KPIs", "Client / customer database", "Project management board", "Invoice tracker", "Revenue & expense tracker", "Meeting notes database", "Task management with Kanban", "SOPs / process documentation", "Goal setting & quarterly reviews"] },
  { id: "debt_calculator", name: "Debt Snowball Calculator", icon: "\u{1F4C9}", demand: "Medium", avgPrice: "$5-10", competition: "Low", features: ["Debt overview dashboard", "Debt snowball calculator", "Debt avalanche calculator", "Payment log with history", "Progress bars per debt", "Total debt-free countdown", "Monthly payment scheduler", "Interest saved calculator", "Milestone celebrations"] },
];

const AESTHETICS = [
  { id: "minimal", name: "Minimal Clean", colors: ["#1a1a1a", "#666", "#f5f5f5"], desc: "Black & white, clean lines, lots of whitespace", colorNames: "Black, white, light gray" },
  { id: "brown", name: "Brown / Warm", colors: ["#8B6F47", "#C9A96E", "#F5EFE6"], desc: "Warm browns, beige, cream - cozy and trendy", colorNames: "Brown, beige, cream, warm tan" },
  { id: "pink", name: "Pink / It Girl", colors: ["#D4839B", "#F0C0D0", "#FFF0F5"], desc: "Soft pinks, rose gold accents - feminine and stylish", colorNames: "Blush pink, rose gold, soft white" },
  { id: "dark", name: "Dark Mode", colors: ["#1E1E2E", "#CDD6F4", "#45475A"], desc: "Dark background, neon or soft accents - modern", colorNames: "Dark gray, soft white, accent colors" },
  { id: "sage", name: "Sage / Earth", colors: ["#7A956B", "#B5C4A3", "#F0F4EC"], desc: "Nature-inspired greens and earth tones", colorNames: "Sage green, olive, cream, sand" },
  { id: "pastel", name: "Soft Pastels", colors: ["#B8A9C9", "#A8D8EA", "#FFE5CC"], desc: "Gentle pastel colors - calming and cute", colorNames: "Lavender, mint, peach, baby blue" },
  { id: "mono", name: "Monochrome Bold", colors: ["#2563EB", "#000000", "#FFFFFF"], desc: "Single strong color with black/white", colorNames: "One bold color + black + white" },
];

interface GeneratedResult {
  phase1: string;
  phase2: string;
  phase3: string;
  etsyTitle: string;
  etsyTags: string[];
  etsyDescription: string;
}

// ── Mockup Scene Configurations for Notion Templates ──
// Inspired by Etsy bestseller mockup patterns (dual-iPad, warm backgrounds, lifestyle shots)
const NOTION_MOCKUP_SCENES = [
  {
    id: "hero-dual-ipad",
    label: "Hero — Dual iPad",
    badge: "Thumbnail",
    badgeColor: "bg-red-100 text-red-700",
    prompt: (template: string, aesthetic: string) =>
      `A photorealistic product photography image of two iPad Pro tablets side by side on a warm beige linen fabric background with soft natural shadows. The left iPad displays a beautiful ${aesthetic} themed ${template} Notion template cover page with elegant title typography. The right iPad shows the template's main dashboard view with organized databases, colorful status tags, progress bars, and clean layouts. Warm cream and tan tones, soft diffused lighting from above, professional Etsy digital product listing photography, clean composition with plenty of breathing room, no hands, no text overlays. Ultra sharp focus on both screens, 4K quality, photorealistic rendering.`,
  },
  {
    id: "macbook-ipad-phone",
    label: "Multi-Device Trio",
    badge: "Popular",
    badgeColor: "bg-blue-100 text-blue-700",
    prompt: (template: string, aesthetic: string) =>
      `A photorealistic product photography image of a MacBook Pro laptop, an iPad Pro tablet, and an iPhone arranged in a professional composition on a clean minimalist wooden desk with a warm beige background. All three devices display a beautiful ${aesthetic} themed ${template} Notion template with organized databases, task boards, progress tracking widgets, and clean typography. The MacBook is centered and slightly behind, iPad to the right at a slight angle, iPhone to the left. Warm natural side lighting, a small ceramic coffee cup and a green succulent plant as props, professional Etsy digital product mockup style, editorial product photography. Ultra sharp, 4K quality, photorealistic.`,
  },
  {
    id: "ipad-hands-lifestyle",
    label: "iPad in Hands",
    badge: "Lifestyle",
    badgeColor: "bg-amber-100 text-amber-700",
    prompt: (template: string, aesthetic: string) =>
      `A photorealistic lifestyle photograph of feminine hands holding an iPad Pro tablet displaying a beautiful ${aesthetic} themed ${template} Notion template planner with organized sections, colorful task cards, and clean layouts. Shot from above at a slight angle, sitting at a cozy desk with a latte in a ceramic mug, a small potted plant, and warm natural window light. Soft bokeh background, warm tones, cream and beige color palette, authentic lifestyle product photography for Etsy digital product listing. The screen content is the main focus, sharp and clearly visible. 4K quality, photorealistic.`,
  },
  {
    id: "flatlay-aesthetic",
    label: "Flat Lay Aesthetic",
    badge: "Trendy",
    badgeColor: "bg-pink-100 text-pink-700",
    prompt: (template: string, aesthetic: string) =>
      `A photorealistic top-down flat lay photograph of an iPad Pro tablet on a warm beige linen background, surrounded by aesthetically arranged items: a ceramic coffee mug, dried flowers, a gold pen, a small notebook, and scattered decorative elements. The iPad displays a beautiful ${aesthetic} themed ${template} Notion template dashboard with databases, progress bars, and organized sections. ${aesthetic === "Brown / Warm" ? "Earth tones, warm brown and cream palette" : aesthetic === "Pink / It Girl" ? "Soft pink and rose gold accents" : aesthetic === "Sage / Earth" ? "Sage green and natural earth tones" : "Clean neutral palette"}. Professional Etsy-style product photography, warm soft lighting, dreamy aesthetic vibes. 4K quality, photorealistic, Instagram-worthy composition.`,
  },
  {
    id: "dark-premium",
    label: "Dark & Premium",
    badge: "Premium",
    badgeColor: "bg-slate-100 text-slate-700",
    prompt: (template: string, aesthetic: string) =>
      `A photorealistic product photography image of a MacBook Pro laptop on a dark charcoal desk surface with dramatic moody lighting, showing a beautiful ${aesthetic} themed ${template} Notion template dashboard with glowing colorful widgets, progress bars, and organized databases. Dark sophisticated background with subtle warm accent lighting from the side, creating depth and premium feel. A small designer desk lamp casting warm light, minimal props. High-end luxury digital product mockup style, dramatic shadows, editorial magazine quality photography. 4K quality, photorealistic, cinematic lighting.`,
  },
  {
    id: "cozy-workspace",
    label: "Cozy Workspace",
    badge: "Detail",
    badgeColor: "bg-green-100 text-green-700",
    prompt: (template: string, aesthetic: string) =>
      `A photorealistic image of an iPad Pro on a wooden desk next to a window with warm golden hour sunlight streaming in, displaying a beautiful ${aesthetic} themed ${template} Notion template with clearly visible databases, task lists, habit trackers, and colorful status indicators. A warm cup of coffee with latte art, a small candle, and an open paper notebook with a premium pen nearby. Warm cozy home office atmosphere, autumn vibes, hygge aesthetic. The iPad screen is the focal point with sharp detail on the template content. Professional lifestyle product photography for Etsy listing, natural authentic feeling. 4K quality, photorealistic.`,
  },
  {
    id: "boho-creative",
    label: "Boho Creative Desk",
    badge: "Aesthetic",
    badgeColor: "bg-orange-100 text-orange-700",
    prompt: (template: string, aesthetic: string) =>
      `A photorealistic bohemian creative workspace photograph featuring an iPad Pro displaying a beautiful ${aesthetic} themed ${template} Notion template, placed on a rattan woven mat on a light oak desk. Surrounding it: a small cluster of crystals, dried pampas grass in a terracotta vase, a macrame wall hanging in the background, warm fairy lights softly blurred behind, a small ceramic incense holder, and earthy woven textiles. Warm amber and sand color tones, soft natural diffused light from a large window, no harsh shadows. Artistic lifestyle product photography for Etsy, dreamy bohemian aesthetic, ultra-wide composition. 4K quality, photorealistic.`,
  },
  {
    id: "cafe-vibes",
    label: "Café Vibes",
    badge: "Social Proof",
    badgeColor: "bg-yellow-100 text-yellow-700",
    prompt: (template: string, aesthetic: string) =>
      `A photorealistic photograph of a MacBook Pro laptop open on a clean marble café table, displaying a beautiful ${aesthetic} themed ${template} Notion template with organized sections and colorful databases. A perfectly crafted flat white coffee in a ceramic cup with art sits beside it, along with a small vase of fresh flowers and a croissant on a plate. Soft warm café ambient lighting, blurred background of café interior with wooden accents. Authentic lifestyle product photography, content creator aesthetic, bright and airy. Etsy digital product mockup style. 4K quality, photorealistic.`,
  },
  {
    id: "phone-vertical-portrait",
    label: "Phone Portrait",
    badge: "Mobile",
    badgeColor: "bg-violet-100 text-violet-700",
    prompt: (template: string, aesthetic: string) =>
      `A photorealistic close-up product photograph of an iPhone Pro held vertically in one hand, screen displaying a mobile-adapted view of a beautiful ${aesthetic} themed ${template} Notion template with readable text, colorful tags, and clean organized sections. Background is softly blurred warm cream and sage tones. The other hand holds a stylish gold pen. Soft natural light from the side, authentic real-life usage feel, portrait orientation shot. Modern lifestyle product photography for Etsy digital products, Pinterest and Instagram style. 4K quality, photorealistic.`,
  },
  {
    id: "studio-white-clean",
    label: "Studio White Clean",
    badge: "Professional",
    badgeColor: "bg-gray-100 text-gray-700",
    prompt: (template: string, aesthetic: string) =>
      `A photorealistic high-end studio product photography image of an iPad Pro on a pure white seamless background, displaying a beautiful ${aesthetic} themed ${template} Notion template with sharp visible content, organized databases, and premium typography. Soft even studio lighting from multiple sources creating clean shadowless look with one subtle soft shadow underneath the device. The device is tilted at a slight angle for depth. Ultra minimal, clean, professional. Premium tech product photography style. White label template mockup for Etsy listings. 4K quality, photorealistic.`,
  },
  {
    id: "magazine-editorial",
    label: "Magazine Editorial",
    badge: "Editorial",
    badgeColor: "bg-rose-100 text-rose-700",
    prompt: (template: string, aesthetic: string) =>
      `A photorealistic editorial magazine-style spread photograph featuring a MacBook Pro open to a beautiful ${aesthetic} themed ${template} Notion template dashboard, surrounded by artfully placed design objects: an open Moleskine journal with a gold pen, a pair of glasses, a luxury watch, a small green plant, and a hot beverage in a designer mug. Shot from a 45-degree overhead angle on a richly textured warm linen surface. Dramatic but beautiful editorial lighting with golden tones and deep shadows. Luxury lifestyle product photography, premium Etsy digital product style, high fashion editorial quality. 4K quality, photorealistic.`,
  },
  {
    id: "lifeos-dashboard",
    label: "LifeOS Dashboard Split",
    badge: "LifeOS",
    badgeColor: "bg-indigo-100 text-indigo-700",
    prompt: (template: string, aesthetic: string) =>
      `Dual iPad Pro mockup on dark desk, left iPad shows Tasks database filtered to Today with energy level tags (High/Low) and Pomodoro count, right iPad shows Habits database with streak numbers and checkmarks, ${aesthetic} theme, premium product photography, soft ambient lighting, 4K resolution`
  },
  {
    id: "neon-dark-setup",
    label: "Neon Dark Setup",
    badge: "Gaming/Tech",
    badgeColor: "bg-cyan-100 text-cyan-700",
    prompt: (template: string, aesthetic: string) =>
      `A photorealistic dramatic product photography image of a high-end gaming and productivity desk setup in a dark room, featuring a large curved monitor and iPad Pro displaying a beautiful ${aesthetic} themed ${template} Notion template with glowing colorful databases and vibrant status indicators. Dramatic neon RGB accent lighting in purple, blue and teal colors illuminating the edges of the setup. Mechanical keyboard, high-end mouse, and premium desk accessories visible. Dark charcoal and black tones with vivid neon glow, cinematic shadows, modern tech aesthetic. Premium tech lifestyle product photography for Etsy. 4K quality, photorealistic.`,
  },
];

interface NotionMockupImage {
  id: string;
  sceneIndex: number;
  label: string;
  badge: string;
  badgeColor: string;
  imageData: string | null;
  prompt: string;
  status: "pending" | "generating" | "loaded" | "error";
  model?: string;
  errorMsg?: string;
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
  onComplete?: (index: number, result: T) => void
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      const result = await tasks[idx]();
      results[idx] = result;
      onComplete?.(idx, result);
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ── AI Build Result ──
interface AIBuildSection {
  title: string;
  content: string;
  type: "page" | "database" | "instructions";
}

function NotionBuilderInner() {
  const searchParams = useSearchParams();
  const { settings } = useSettings();
  const catalogStore = useCatalogStore();
  const [lastCatalogId, setLastCatalogId] = useState<string | null>(null);

  // Configuration state — defaults come from settings
  const [selectedType, setSelectedType] = useState("");
  const [selectedAesthetic, setSelectedAesthetic] = useState<string>(settings.defaultVariant || "minimal");
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [complexity, setComplexity] = useState<"simple" | "medium" | "advanced">(settings.defaultComplexity || "medium");
  const [targetAudience, setTargetAudience] = useState("");
  const [niche, setNiche] = useState("");

  // Loaded opportunity plan (from ?plan=<id>)
  const [loadedPlan, setLoadedPlan] = useState<Record<string, unknown> | null>(null);

  // Result state
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [activePhase, setActivePhase] = useState(1);
  const [copied, setCopied] = useState("");
  const [mockupPrompt, setMockupPrompt] = useState("");

  // AI Build state
  const [buildMode, setBuildMode] = useState<"prompts" | "ai" | "notion_api">(
    settings.defaultBuildMethod === "copy-prompts" ? "prompts" :
    settings.defaultBuildMethod === "ai-build" ? "ai" : "notion_api"
  );
  const [aiOutput, setAiOutput] = useState("");
  const [aiBuilding, setAiBuilding] = useState(false);
  const [aiBuildPhase, setAiBuildPhase] = useState(0);
  const [aiBuildSections, setAiBuildSections] = useState<AIBuildSection[]>([]);
  const [aiActiveTab, setAiActiveTab] = useState<"template" | "etsy" | "mockup" | "premium_steps" | "os_checklist" | "etsy_pack" | "quality_score" | "preview">("template");
  const [aiEtsyListing, setAiEtsyListing] = useState("");
  const [showResult, setShowResult] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);

  // Mockup generation state
  const [mockupImages, setMockupImages] = useState<NotionMockupImage[]>([]);
  const [mockupGenerating, setMockupGenerating] = useState(false);
  const mockupAbortRef = useRef<AbortController | null>(null);

  // Video generation state
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // Real screenshot mockups state
  const [realScreenshotUrl, setRealScreenshotUrl] = useState("");
  const [realScreenshots, setRealScreenshots] = useState<{ device: string; label: string; screenshot: string }[]>([]);
  const [realScreenshotGenerating, setRealScreenshotGenerating] = useState(false);
  const [realScreenshotError, setRealScreenshotError] = useState("");

  // Notion API Build state
  const [notionToken, setNotionToken] = useState("");
  const [notionPages, setNotionPages] = useState<Array<{ id: string; title: string; icon: string | null }>>([]);
  const [selectedParentPage, setSelectedParentPage] = useState("");
  const [notionBuilding, setNotionBuilding] = useState(false);
  const [notionBuildSteps, setNotionBuildSteps] = useState<string[]>([]);
  const [notionBuildResult, setNotionBuildResult] = useState<{ pageUrl: string; pageId: string } | null>(null);
  const [promptOnlySteps, setPromptOnlySteps] = useState<Array<{ section: string; instruction: string; componentType: string }>>([]);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; score: number; failures: string[]; warnings: string[] } | null>(null);
  const [premiumChecklist, setPremiumChecklist] = useState<{ results: Array<{ rule: string; passed: boolean; category: string }>; score: number; total: number } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [qualityScore, setQualityScore] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [etsyGeneratedListing, setEtsyGeneratedListing] = useState<any>(null);
  const [etsyListingLoading, setEtsyListingLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [mockupBrief, setMockupBrief] = useState<any>(null);
  const [notionConnected, setNotionConnected] = useState(false);
  const [loadingPages, setLoadingPages] = useState(false);

  // Premium framework toggle
  const [premiumMode, setPremiumMode] = useState(true);

  // Auto-Polish state
  const [polishUrl, setPolishUrl] = useState("");
  const [polishRunning, setPolishRunning] = useState(false);
  const [polishSteps, setPolishSteps] = useState<string[]>([]);
  const [polishDone, setPolishDone] = useState(false);
  const [polishError, setPolishError] = useState("");

  // Upgrade Template state
  const [upgradeRunning, setUpgradeRunning] = useState(false);
  const [upgradeSteps, setUpgradeSteps] = useState<string[]>([]);
  const [upgradeDone, setUpgradeDone] = useState(false);
  const [upgradeError, setUpgradeError] = useState("");

  // Competitor context (from Etsy Imports redirect)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [competitorContext, setCompetitorContext] = useState<Record<string, any> | null>(null);

  // Smart Suggestions state
  const [etsyImportListings, setEtsyImportListings] = useState<Array<{
    title: string; price: number; favorites: number; reviews: number;
    revenue_estimate: number | null; demand_score: number | null;
    classification: string; source_keyword: string | null;
    is_bestseller: number; monthly_trend: string | null;
  }>>([]);
  const [suggestionsCollapsed, setSuggestionsCollapsed] = useState(false);

  // Load Notion token from settings context or localStorage on mount
  useEffect(() => {
    const token = settings.notionToken || localStorage.getItem("notion_token") || "";
    if (token) {
      setNotionToken(token);
      setNotionConnected(true);
      loadNotionPages(token);
    }
    // Always start fresh — reset any leftover polish state from previous sessions
    setPolishDone(false);
    setPolishSteps([]);
    setPolishError("");
    setPolishUrl("");
  }, []);

  // Load Etsy import listings for Smart Suggestions
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/integrations/etsy/import");
        const data = await res.json();
        const imports = data.imports || [];
        if (imports.length === 0) return;

        // Load the most recent import's listings
        const latestId = imports[0].id;
        const detailRes = await fetch(`/api/integrations/etsy/import?id=${latestId}`);
        const detail = await detailRes.json();
        const listings = (detail.listings || []).map((l: Record<string, unknown>) => ({
          title: l.title as string,
          price: (l.price as number) || 0,
          favorites: (l.favorites as number) || 0,
          reviews: (l.reviews as number) || 0,
          revenue_estimate: l.revenue_estimate as number | null,
          demand_score: l.demand_score as number | null,
          classification: (l.classification as string) || "",
          source_keyword: l.source_keyword as string | null,
          is_bestseller: (l.is_bestseller as number) || 0,
          monthly_trend: l.monthly_trend as string | null,
        }));
        setEtsyImportListings(listings);
      } catch {
        // Silently fail — suggestions are optional
      }
    })();
  }, []);

  // Load plan from opportunity if ?plan=<id> is in the URL
  useEffect(() => {
    const planId = searchParams.get("plan");
    if (!planId) return;

    (async () => {
      try {
        const res = await fetch(`/api/opportunities?id=${planId}`);
        const data = await res.json();
        const opp = data.opportunity || data.opportunities?.[0];
        if (!opp?.listing_plan) return;

        const plan = JSON.parse(opp.listing_plan);
        if (!plan || plan.raw_text) return;

        setLoadedPlan(plan);

        // Pre-fill configuration from plan
        if (plan.type) {
          const typeMap: Record<string, string> = {
            life_os: "life_os",
            life_planner: "life_planner", student_planner: "student_planner",
            finance_tracker: "finance_tracker", adhd_planner: "adhd_planner",
            social_media: "social_media", habit_tracker: "habit_tracker",
            business_hub: "business_hub", debt_calculator: "debt_calculator",
            content_planner: "social_media", project_tracker: "business_hub",
            productivity: "life_planner", journal: "habit_tracker",
            health_wellness: "habit_tracker",
          };
          const mappedType = typeMap[plan.type] || plan.type;
          setSelectedType(mappedType);

          // Auto-select features for the type
          const typeObj = TEMPLATE_TYPES.find(t => t.id === mappedType);
          if (typeObj) setSelectedFeatures(typeObj.features);
        }

        if (plan.aesthetic) setSelectedAesthetic(plan.aesthetic);
        if (plan.complexity) {
          const cMap: Record<string, "simple" | "medium" | "advanced"> = {
            Simple: "simple", Medium: "medium", Advanced: "advanced",
            simple: "simple", medium: "medium", advanced: "advanced",
          };
          setComplexity(cMap[plan.complexity] || "medium");
        }

        if (opp.niche) setNiche(opp.niche);
        if (opp.category) setTargetAudience(opp.category);

        // Build a comprehensive AI output text from the plan
        const outputLines: string[] = [];
        outputLines.push(`# ${plan.templateName || "Template Plan"}`);
        outputLines.push(`**Type:** ${plan.type} | **Aesthetic:** ${plan.aesthetic} | **Complexity:** ${plan.complexity} | **Price:** $${plan.priceSuggestion}`);
        outputLines.push("");

        // Databases section
        if (plan.databases?.length > 0) {
          outputLines.push(`## 🗄️ Databases (${plan.databases.length})`);
          for (const db of plan.databases) {
            outputLines.push(`\n### ${db.icon || "📊"} ${db.name}`);
            if (db.purpose) outputLines.push(`*${db.purpose}*`);
            outputLines.push("\n| Property | Type | Options |");
            outputLines.push("|---|---|---|");
            for (const p of (db.properties || [])) {
              outputLines.push(`| ${p.name} | ${p.type} | ${p.options?.join(", ") || "—"} |`);
            }
          }
          outputLines.push("");
        }

        // Relations
        if (plan.relations?.length > 0) {
          outputLines.push(`## 🔗 Relations (${plan.relations.length})`);
          for (const r of plan.relations) {
            outputLines.push(`- ${r.from} → **${r.property}** → ${r.to}`);
          }
          outputLines.push("");
        }

        // Rollups
        if (plan.rollups?.length > 0) {
          outputLines.push(`## 📊 Rollups (${plan.rollups.length})`);
          for (const r of plan.rollups) {
            outputLines.push(`- ${r.db}.${r.property} = **${r.function}**(${r.relation}.${r.target_property})`);
          }
          outputLines.push("");
        }

        // Formulas
        if (plan.formulas?.length > 0) {
          outputLines.push(`## 🧮 Formulas (${plan.formulas.length})`);
          for (const f of plan.formulas) {
            outputLines.push(`- ${f.db}.${f.property}: *${f.logic}*`);
            if (f.formula) outputLines.push(`  \`${f.formula}\``);
          }
          outputLines.push("");
        }

        // Views
        if (plan.views?.length > 0) {
          outputLines.push(`## 👁️ Views (${plan.views.length})`);
          for (const v of plan.views) {
            outputLines.push(`- **${v.name}** (${v.db}) — ${v.type}${v.filter ? ` [filter: ${v.filter}]` : ""}`);
          }
          outputLines.push("");
        }

        // Dashboard
        if (plan.dashboards?.length > 0) {
          outputLines.push(`## 📊 Dashboard`);
          for (const d of plan.dashboards) {
            outputLines.push(`### ${d.name}`);
            for (const b of (d.blocks || [])) {
              outputLines.push(`- [${b.type}] ${b.content}`);
            }
          }
          outputLines.push("");
        }

        // Upgrades
        if (plan.upgrades?.length > 0) {
          outputLines.push(`## ⚡ Upgrades`);
          for (const u of plan.upgrades) {
            outputLines.push(`\n### ${u.feature}`);
            outputLines.push(u.description);
            outputLines.push(`*Implementation:* ${u.implementation}`);
          }
          outputLines.push("");
        }

        // Sample data
        if (plan.sampleData?.length > 0) {
          outputLines.push(`## 📝 Sample Data`);
          for (const sd of plan.sampleData) {
            outputLines.push(`\n**${sd.database}** — ${sd.rows?.length || 0} rows`);
            if (sd.rows?.length > 0) {
              const keys = Object.keys(sd.rows[0]);
              outputLines.push(`| ${keys.join(" | ")} |`);
              outputLines.push(`| ${keys.map(() => "---").join(" | ")} |`);
              for (const row of sd.rows) {
                outputLines.push(`| ${keys.map(k => String(row[k] ?? "")).join(" | ")} |`);
              }
            }
          }
        }

        setAiOutput(outputLines.join("\n"));

        // Pre-fill AI build sections from the plan databases
        const sections: AIBuildSection[] = [];
        if (plan.dashboards?.length > 0) {
          const db = plan.dashboards[0];
          const blocks = (db.blocks || []).map((b: { type: string; content: string }) => `- [${b.type}] ${b.content}`).join("\n");
          sections.push({ title: db.name || "Dashboard", content: blocks, type: "page" });
        }
        if (plan.databases) {
          for (const db of plan.databases) {
            const props = (db.properties || []).map((p: { name: string; type: string; options?: string[] }) =>
              `| ${p.name} | ${p.type} | ${p.options?.join(", ") || "—"} |`
            ).join("\n");
            sections.push({
              title: `${db.icon || "📊"} ${db.name}`,
              content: `${db.purpose || ""}\n\n| Property | Type | Options |\n|---|---|---|\n${props}`,
              type: "database",
            });
          }
        }
        if (sections.length > 0) setAiBuildSections(sections);

        // Pre-fill Etsy listing
        if (plan.etsyListing) {
          const el = plan.etsyListing;
          const etsyText = [
            `# ${el.title || ""}`,
            "",
            el.description || "",
            "",
            `**Tags (${(el.tags || []).length}):** ${(el.tags || []).join(", ")}`,
            el.seoCategory ? `**Category:** ${el.seoCategory}` : "",
          ].join("\n");
          setAiEtsyListing(etsyText);
        }

        // Show results
        setBuildMode("ai");
        setShowResult(true);
        setAiActiveTab("template");
      } catch {
        // Silently ignore — user can still use builder manually
      }
    })();
  }, [searchParams]);

  // Pre-select template type from onboarding ?preselect=<type>
  useEffect(() => {
    const preselect = searchParams.get("preselect");
    if (!preselect) return;
    const tmpl = TEMPLATE_TYPES.find(t => t.id === preselect);
    if (tmpl) {
      setSelectedType(preselect);
      setSelectedFeatures([...tmpl.features]);
    }
  }, [searchParams]);

  // Load competitor context from ?competitor=<json>
  useEffect(() => {
    const competitorParam = searchParams.get("competitor");
    if (!competitorParam) return;
    try {
      const parsed = JSON.parse(competitorParam);
      setCompetitorContext(parsed);
      // Auto-fill from competitor detection
      if (parsed.detectedType) {
        const tmpl = TEMPLATE_TYPES.find(t => t.id === parsed.detectedType);
        if (tmpl && !selectedType) {
          setSelectedType(parsed.detectedType);
          setSelectedFeatures([...tmpl.features]);
        }
      }
      if (parsed.detectedAudience && !targetAudience) {
        setTargetAudience(parsed.detectedAudience);
      }
    } catch { /* invalid JSON, ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function loadNotionPages(token?: string) {
    const t = token || notionToken;
    if (!t) return;
    setLoadingPages(true);
    try {
      const resp = await fetch("/api/notion/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t }),
      });
      const data = await resp.json();
      if (data.pages) {
        setNotionPages(data.pages);
        if (data.pages.length > 0 && !selectedParentPage) {
          setSelectedParentPage(data.pages[0].id);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingPages(false);
    }
  }

  // ── Build template via Notion API ──
  async function buildWithNotionAPI() {
    if (!notionToken || !selectedParentPage) return;

    // Pre-build connection check (via backend proxy to avoid CORS)
    try {
      const checkResp = await fetch("/api/notion/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: notionToken }),
      });
      const checkData = await checkResp.json();
      if (!checkData.connected) {
        setNotionBuildSteps(["❌ Notion connection failed. Your token may be expired — go to Settings to reconnect."]);
        setShowResult(true);
        setAiActiveTab("template");
        return;
      }
    } catch {
      setNotionBuildSteps(["❌ Could not reach Notion API. Check your internet connection."]);
      setShowResult(true);
      setAiActiveTab("template");
      return;
    }

    // Determine build payload: use loaded opportunity plan or pre-built template
    let buildPayload: Record<string, unknown>;

    if (loadedPlan) {
      // ── Build from AI-generated opportunity plan (Etsy → Gemini → Notion) ──
      buildPayload = {
        notionToken,
        parentPageId: selectedParentPage,
        opportunityPlan: loadedPlan,
        aesthetic: selectedAesthetic,
        premium: premiumMode,
        competitorContext: competitorContext || undefined,
      };
    } else {
      // ── Build from pre-built template spec ──
      if (!selectedType) return;

      const templateIdMap: Record<string, string> = {
        life_os: "life_os",
        adhd_planner: "adhd_planner",
        life_planner: "life_planner",
        finance_tracker: "finance_tracker",
        student_planner: "life_planner",
        social_media: "social_media_planner",
        habit_tracker: "adhd_planner",
        business_hub: "finance_tracker",
        debt_calculator: "finance_tracker",
      };

      const specId = templateIdMap[selectedType];
      if (!specId) {
        setNotionBuildSteps(["Error: This template type is not yet available for Notion API build. Try ADHD Planner, Life Planner, or Finance Tracker."]);
        return;
      }

      buildPayload = {
        notionToken,
        parentPageId: selectedParentPage,
        templateId: specId,
        aesthetic: selectedAesthetic,
        premium: premiumMode,
      };
    }

    setNotionBuilding(true);
    setNotionBuildSteps([loadedPlan ? "Building from Etsy opportunity plan..." : "Starting build..."]);
    setNotionBuildResult(null);
    setPromptOnlySteps([]);
    setValidationResult(null);
    setQualityScore(null);
    setEtsyGeneratedListing(null);
    setEtsyListingLoading(false);
    setMockupBrief(null);
    setUpgradeRunning(false);
    setUpgradeSteps([]);
    setUpgradeDone(false);
    setUpgradeError("");
    setShowResult(true);
    setAiActiveTab("template");

    try {
      const resp = await fetch("/api/notion/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload),
      });

      const data = await resp.json();

      if (!resp.ok) {
        const errMsg = data.error || "Unknown error";
        let userMessage = `Error: ${errMsg}`;
        if (resp.status === 401 || errMsg.includes("unauthorized") || errMsg.includes("token")) {
          userMessage = "❌ Notion token is invalid or expired. Go to Settings → Notion Connection and re-enter your token.";
        } else if (resp.status === 404 || errMsg.includes("not found") || errMsg.includes("Could not find")) {
          userMessage = "❌ Parent page not found. Make sure the page is shared with your Notion integration (click ··· → Connect to → your integration).";
        } else if (resp.status === 429 || errMsg.includes("rate_limited") || errMsg.includes("rate limit")) {
          userMessage = "⏳ Notion rate limit hit. Wait 30 seconds and try again.";
        } else if (resp.status >= 500) {
          userMessage = `❌ Server error: ${errMsg}. Try again in a moment.`;
        }
        setNotionBuildSteps((prev) => [...prev, userMessage]);
        return;
      }

      if (data.steps) {
        setNotionBuildSteps(data.steps);
      }

      if (data.success) {
        setNotionBuildResult({
          pageUrl: data.pageUrl,
          pageId: data.pageId,
        });
        if (data.promptOnlySteps?.length) {
          setPromptOnlySteps(data.promptOnlySteps);
        }
        if (data.validation) {
          setValidationResult(data.validation);
        }
        if (data.premiumChecklist) {
          setPremiumChecklist(data.premiumChecklist);
        }
        if (data.qualityScore) {
          setQualityScore(data.qualityScore);
        }

        // Generate Etsy listing in background
        let generatedEtsyListing = null;
        try {
          setEtsyListingLoading(true);
          const etsyResp = await fetch("/api/etsy/generate-listing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              templateName: data.pageUrl ? selectedType : "Template",
              templateType: selectedType,
              databases: (data.databases || []).map((d: { key: string }) => d.key),
              formulaNames: [],
              aesthetic: selectedAesthetic,
              qualityTier: data.qualityScore?.tier || "Gold",
              hasOnboarding: true,
              databaseCount: (data.databases || []).length,
            }),
          });
          if (etsyResp.ok) {
            const etsyData = await etsyResp.json();
            if (etsyData.listing) {
              setEtsyGeneratedListing(etsyData.listing);
              generatedEtsyListing = etsyData.listing;
            }
          }
        } catch (etsyErr) {
          console.log("Etsy listing generation failed (non-fatal):", etsyErr);
        } finally {
          setEtsyListingLoading(false);
        }

        // Generate mockup brief locally
        let generatedBrief = null;
        try {
          const { generateMockupBrief } = await import("@/lib/mockup-briefs");
          const brief = generateMockupBrief(
            selectedType || "Template",
            selectedType || "",
            (data.databases || []).map((d: { key: string }) => d.key),
            selectedAesthetic || "minimal",
          );
          setMockupBrief(brief);
          generatedBrief = brief;
        } catch (briefErr) {
          console.log("Mockup brief generation failed (non-fatal):", briefErr);
        }

        // Add to catalog store
        try {
          const catalogId = catalogStore.addItem({
            productType: "notion",
            templateType: selectedType || "",
            templateName: currentTemplate?.name || loadedPlan?.templateName as string || "Notion Template",
            variantName: aesthetic?.name || selectedAesthetic || "minimal",
            notionPageUrl: data.pageUrl || "",
            notionPageId: data.pageId || "",
            qualityScore: data.qualityScore || null,
            etsyListing: generatedEtsyListing,
            mockupBrief: generatedBrief,
            status: generatedEtsyListing ? "mockups_needed" : "draft",
            tags: generatedEtsyListing?.tags || [],
            notes: "",
            competitorSource: competitorContext
              ? `${competitorContext.shop || "Etsy"} — $${competitorContext.price || "?"} — ${competitorContext.tier || ""}`.trim()
              : loadedPlan ? "etsy-import" : undefined,
          });
          setLastCatalogId(catalogId);
        } catch (catErr) {
          console.log("Catalog save failed (non-fatal):", catErr);
        }
      }
    } catch (err) {
      setNotionBuildSteps((prev) => [...prev, `Error: ${err instanceof Error ? err.message : "Build failed"}`]);
    } finally {
      setNotionBuilding(false);
    }
  }

  // ── Smart Suggestions Logic ──
  interface SmartSuggestion {
    templateTypeId: string;
    templateName: string;
    icon: string;
    reason: string;
    confidence: "high" | "medium" | "low";
    avgPrice: number;
    avgRevenue: number;
    totalListings: number;
    topKeyword: string;
    suggestedAudience: string;
  }

  function generateSmartSuggestions(listings: typeof etsyImportListings): SmartSuggestion[] {
    if (listings.length === 0) return [];

    // Keyword → template type mapping
    const keywordToTemplate: Record<string, { typeId: string; audience: string }> = {
      "life os": { typeId: "life_os", audience: "Productivity power users who want everything in one system" },
      "life operating system": { typeId: "life_os", audience: "People who want a complete digital life management system" },
      "ultimate life": { typeId: "life_os", audience: "Ambitious planners seeking a premium all-in-one template" },
      "everything planner": { typeId: "life_os", audience: "People who want tasks, habits, fitness, finance, and journal in one place" },
      "complete life": { typeId: "life_os", audience: "People seeking a comprehensive life management system" },
      planner: { typeId: "life_planner", audience: "Productivity enthusiasts, busy professionals" },
      "life planner": { typeId: "life_planner", audience: "Professionals seeking work-life balance" },
      "all in one": { typeId: "life_planner", audience: "People who want one comprehensive system" },
      student: { typeId: "student_planner", audience: "College students, graduate students" },
      university: { typeId: "student_planner", audience: "University students, academic planners" },
      study: { typeId: "student_planner", audience: "Students preparing for exams" },
      school: { typeId: "student_planner", audience: "High school and college students" },
      budget: { typeId: "finance_tracker", audience: "Budget-conscious individuals, young professionals" },
      finance: { typeId: "finance_tracker", audience: "People tracking expenses and savings" },
      money: { typeId: "finance_tracker", audience: "Personal finance enthusiasts" },
      savings: { typeId: "finance_tracker", audience: "People building savings habits" },
      adhd: { typeId: "adhd_planner", audience: "ADHD adults seeking structure and focus" },
      "brain dump": { typeId: "adhd_planner", audience: "People with racing thoughts who need capture tools" },
      focus: { typeId: "adhd_planner", audience: "People struggling with focus and attention" },
      social: { typeId: "social_media", audience: "Content creators, small business owners" },
      content: { typeId: "social_media", audience: "Content creators, influencers, brand managers" },
      instagram: { typeId: "social_media", audience: "Instagram creators, social media managers" },
      tiktok: { typeId: "social_media", audience: "TikTok creators, short-form video producers" },
      habit: { typeId: "habit_tracker", audience: "People building new habits, self-improvement enthusiasts" },
      wellness: { typeId: "habit_tracker", audience: "Health and wellness seekers" },
      fitness: { typeId: "habit_tracker", audience: "Fitness enthusiasts tracking workouts" },
      health: { typeId: "habit_tracker", audience: "Health-conscious individuals" },
      business: { typeId: "business_hub", audience: "Small business owners, freelancers, solopreneurs" },
      freelance: { typeId: "business_hub", audience: "Freelancers managing clients and projects" },
      client: { typeId: "business_hub", audience: "Service providers managing client relationships" },
      crm: { typeId: "business_hub", audience: "Small business owners tracking customers" },
      debt: { typeId: "debt_calculator", audience: "People working to become debt-free" },
      snowball: { typeId: "debt_calculator", audience: "Debt-payoff strategists using snowball method" },
      loan: { typeId: "debt_calculator", audience: "People managing loans and credit payments" },
    };

    // Group listings by detected template type
    const typeGroups: Record<string, {
      listings: typeof listings;
      keywords: Set<string>;
      audiences: Set<string>;
    }> = {};

    for (const listing of listings) {
      const titleLower = listing.title.toLowerCase();
      const keyword = listing.source_keyword?.toLowerCase() || "";

      // Check title and keyword against mapping
      for (const [term, mapping] of Object.entries(keywordToTemplate)) {
        if (titleLower.includes(term) || keyword.includes(term)) {
          if (!typeGroups[mapping.typeId]) {
            typeGroups[mapping.typeId] = { listings: [], keywords: new Set(), audiences: new Set() };
          }
          typeGroups[mapping.typeId].listings.push(listing);
          if (listing.source_keyword) typeGroups[mapping.typeId].keywords.add(listing.source_keyword);
          typeGroups[mapping.typeId].audiences.add(mapping.audience);
          break; // Only count each listing once
        }
      }
    }

    // Build suggestions sorted by total listings (most evidence first)
    const suggestions: SmartSuggestion[] = [];

    for (const [typeId, group] of Object.entries(typeGroups)) {
      const templateType = TEMPLATE_TYPES.find(t => t.id === typeId);
      if (!templateType) continue;

      const prices = group.listings.map(l => l.price).filter(p => p > 0);
      const revenues = group.listings.map(l => l.revenue_estimate || 0).filter(r => r > 0);
      const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
      const avgRevenue = revenues.length > 0 ? revenues.reduce((a, b) => a + b, 0) / revenues.length : 0;

      const bestsellers = group.listings.filter(l => l.is_bestseller).length;
      const highDemand = group.listings.filter(l => (l.demand_score || 0) >= 70).length;

      // Confidence based on evidence strength
      let confidence: "high" | "medium" | "low" = "low";
      if (group.listings.length >= 10 && (bestsellers >= 3 || highDemand >= 5)) confidence = "high";
      else if (group.listings.length >= 5 || bestsellers >= 1) confidence = "medium";

      // Generate reason
      const reasons: string[] = [];
      if (bestsellers > 0) reasons.push(`${bestsellers} bestseller${bestsellers > 1 ? "s" : ""} found`);
      if (highDemand > 0) reasons.push(`${highDemand} high-demand listings`);
      if (avgPrice > 0) reasons.push(`avg price $${avgPrice.toFixed(0)}`);
      if (group.listings.some(l => l.monthly_trend === "rising")) reasons.push("trending up");

      const topKeyword = [...group.keywords][0] || templateType.name.toLowerCase();
      const suggestedAudience = [...group.audiences][0] || "";

      suggestions.push({
        templateTypeId: typeId,
        templateName: templateType.name,
        icon: templateType.icon,
        reason: reasons.length > 0 ? reasons.join(" · ") : `${group.listings.length} matching listings in your imports`,
        confidence,
        avgPrice,
        avgRevenue,
        totalListings: group.listings.length,
        topKeyword,
        suggestedAudience,
      });
    }

    // Sort: high confidence first, then by listing count
    return suggestions.sort((a, b) => {
      const confOrder = { high: 3, medium: 2, low: 1 };
      if (confOrder[a.confidence] !== confOrder[b.confidence]) return confOrder[b.confidence] - confOrder[a.confidence];
      return b.totalListings - a.totalListings;
    }).slice(0, 4); // Max 4 suggestions
  }

  const smartSuggestions = generateSmartSuggestions(etsyImportListings);

  const templateGridRef = useRef<HTMLDivElement>(null);
  const [highlightedType, setHighlightedType] = useState<string | null>(null);

  function handleSuggestionBuild(suggestion: SmartSuggestion) {
    // Select the template type
    setSelectedType(suggestion.templateTypeId);
    // Auto-select all features for this type
    const typeObj = TEMPLATE_TYPES.find(t => t.id === suggestion.templateTypeId);
    if (typeObj) setSelectedFeatures([...typeObj.features]);
    // Pre-fill audience
    if (suggestion.suggestedAudience) setTargetAudience(suggestion.suggestedAudience);
    // Highlight with pulse animation
    setHighlightedType(suggestion.templateTypeId);
    setTimeout(() => setHighlightedType(null), 2000);
    // Scroll to template grid
    templateGridRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const currentTemplate = TEMPLATE_TYPES.find((t) => t.id === selectedType);
  const aesthetic = AESTHETICS.find((a) => a.id === selectedAesthetic);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [aiOutput]);

  function toggleFeature(feature: string) {
    setSelectedFeatures((prev) =>
      prev.includes(feature) ? prev.filter((f) => f !== feature) : [...prev, feature]
    );
  }

  function selectAllFeatures() {
    if (currentTemplate) {
      setSelectedFeatures([...currentTemplate.features]);
    }
  }

  // ── Generate Copy Prompts (calls the new generate-prompt API) ──
  async function generatePrompts() {
    if (!selectedType) return;
    setGenerating(true);
    try {
      const resp = await fetch("/api/notion/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateType: selectedType,
          colorScheme: selectedAesthetic || "minimal",
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);

      // The generate-prompt API returns { prompt, estimatedTime, difficulty, wordCount, stats }
      // Split the prompt text into 3 phases for the existing result UI
      const fullPrompt = data.prompt || "";
      const sections = fullPrompt.split(/(?=## Step )/);

      // Group into 3 phases: Setup (steps 1-3), Build (steps 4-5), Polish (steps 6-8)
      const phase1Parts: string[] = [];
      const phase2Parts: string[] = [];
      const phase3Parts: string[] = [];

      for (const section of sections) {
        const stepMatch = section.match(/## Step (\d+)/);
        if (!stepMatch) {
          phase1Parts.push(section); // header/intro goes to phase 1
          continue;
        }
        const stepNum = parseInt(stepMatch[1]);
        if (stepNum <= 3) phase1Parts.push(section);
        else if (stepNum <= 5) phase2Parts.push(section);
        else phase3Parts.push(section);
      }

      setResult({
        phase1: phase1Parts.join("\n") || fullPrompt.slice(0, Math.floor(fullPrompt.length / 3)),
        phase2: phase2Parts.join("\n") || fullPrompt.slice(Math.floor(fullPrompt.length / 3), Math.floor(2 * fullPrompt.length / 3)),
        phase3: phase3Parts.join("\n") || fullPrompt.slice(Math.floor(2 * fullPrompt.length / 3)),
        etsyTitle: `${currentTemplate?.name || selectedType} Notion Template — Digital Planner`,
        etsyTags: data.stats ? [`notion template`, selectedType.replace(/_/g, ' '), `digital planner`, `${selectedAesthetic} theme`] : [],
        etsyDescription: `Premium ${currentTemplate?.name || selectedType} Notion template with ${data.stats?.databases || 0} databases, ${data.stats?.properties || 0} properties, and ${data.stats?.formulas || 0} formulas. ${data.estimatedTime || "30-45 min"} setup time.`,
      });
      setActivePhase(1);
      setShowResult(true);
      const aes = AESTHETICS.find((a) => a.id === selectedAesthetic);
      setMockupPrompt(
        `Two iPad Pro tablets side by side on warm beige linen background with soft shadows. ${aes?.name || "Minimal"} themed ${currentTemplate?.name || "Notion"} template shown on both screens — cover page on left, dashboard with databases and progress bars on right. Professional Etsy digital product listing photography, warm cream tones, 4K quality.`
      );
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  }

  // ── Helper: stream from our Gemini API endpoint ──
  async function streamFromAPI(prompt: string, onChunk: (text: string) => void): Promise<string> {
    const resp = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, stream: true }),
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || `API error ${resp.status}`);
    }

    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              fullText += parsed.text;
              onChunk(fullText);
            }
          } catch {
            // skip
          }
        }
      }
    }

    return fullText;
  }

  // ── AI Build with Gemini ──
  async function buildWithAI() {
    if (!selectedType || !currentTemplate || !aesthetic) return;

    setAiBuilding(true);
    setAiOutput("");
    setAiBuildPhase(1);
    setAiBuildSections([]);
    setAiEtsyListing("");
    setAiActiveTab("template");
    setShowResult(true);

    const features = selectedFeatures.length > 0 ? selectedFeatures : currentTemplate.features;

    try {
      // ── PHASE 1: Build Complete Template ──
      setAiBuildPhase(1);
      setAiOutput("🧠 Gemini AI is building your Notion template...\n\n");

      const buildPrompt = `You are an expert Notion template designer. Create a COMPLETE, DETAILED ${currentTemplate.name} Notion template.

REQUIREMENTS:
- Template type: ${currentTemplate.name}
- Aesthetic: ${aesthetic.name} (${aesthetic.desc})
- Color palette: ${aesthetic.colorNames}
- Target audience: ${targetAudience || "Anyone looking to get organized"}
- Niche: ${niche || currentTemplate.name}
- Complexity: ${complexity}

FEATURES TO INCLUDE:
${features.map((f, i) => `${i + 1}. ${f}`).join("\n")}

OUTPUT FORMAT:
Generate the COMPLETE template in Notion-compatible markdown. For each section:

1. Start with the HOME DASHBOARD page
2. Then create each feature section with:
   - Page title with icon
   - Database tables (use markdown tables with columns)
   - Formulas explained in code blocks
   - Views described (Table, Board, Calendar, Gallery)
   - Example/demo data filled in (5-8 entries per database)
   - Instructions in callout blocks

USE THESE NOTION ELEMENTS:
- Databases as markdown tables with property types noted
- Formulas written in code blocks
- Color-coded tags matching ${aesthetic.name} palette
- Callout blocks for tips (use > blockquotes with emoji)
- Relations between databases
- Progress bars using formulas

Make it PREMIUM quality - this will be sold on Etsy for $${currentTemplate.avgPrice.replace("$", "")}.
Include realistic demo data so buyers can see it working immediately.
Be very detailed and thorough. This should be a complete, production-ready template.`;

      const fullOutput = await streamFromAPI(buildPrompt, (text) => {
        setAiOutput("🧠 Gemini AI is building your Notion template...\n\n" + text);
      });

      // Parse sections from output
      const sections: AIBuildSection[] = [];
      const sectionRegex = /^#{1,2}\s+(.+)/gm;
      let match;
      const sectionStarts: { title: string; index: number }[] = [];
      while ((match = sectionRegex.exec(fullOutput)) !== null) {
        sectionStarts.push({ title: match[1], index: match.index });
      }
      for (let i = 0; i < sectionStarts.length; i++) {
        const start = sectionStarts[i].index;
        const end = i + 1 < sectionStarts.length ? sectionStarts[i + 1].index : fullOutput.length;
        sections.push({
          title: sectionStarts[i].title,
          content: fullOutput.substring(start, end).trim(),
          type: sectionStarts[i].title.toLowerCase().includes("database") ? "database" : "page",
        });
      }
      if (sections.length > 0) {
        setAiBuildSections(sections);
      }

      // ── PHASE 2: Generate Etsy Listing ──
      setAiBuildPhase(2);
      setAiOutput(prev => prev + "\n\n---\n🏪 Generating Etsy listing...\n");

      const etsyPrompt = `Based on this ${currentTemplate.name} Notion template (${aesthetic.name} aesthetic, for ${targetAudience || "anyone"}), generate a complete Etsy listing:

1. TITLE (max 140 characters, SEO optimized with pipes | as separators)
2. TAGS (exactly 13 tags, each max 20 characters, comma-separated)
3. DESCRIPTION (full Etsy description with emojis, sections for What's Included, Key Features, How It Works, Perfect For)

Template features: ${features.join(", ")}

Format the output clearly with headers:
## TITLE
[title here]

## TAGS
[tag1, tag2, ...]

## DESCRIPTION
[full description]`;

      await streamFromAPI(etsyPrompt, (text) => {
        setAiEtsyListing(text);
      });

      // ── DONE ──
      setAiBuildPhase(3);
      setAiOutput(prev => prev + "\n\n✅ Template complete! Copy the content and paste it into Notion.\n");

    } catch (err: unknown) {
      const errorObj = err as { error?: { message?: string }; message?: string };
      const msg = errorObj.error?.message || errorObj.message || JSON.stringify(err);
      const isRateLimit = msg.includes("429") || msg.includes("rate limit") || msg.includes("quota");
      setAiOutput(prev =>
        prev + `\n\n❌ ${isRateLimit
          ? "Rate limited — Google's free tier has per-minute limits. Please wait 1 minute and click Build again."
          : `Error: ${msg}`}`
      );
    } finally {
      setAiBuilding(false);
    }
  }

  // ── Mockup Generation ──
  async function generateNotionMockups() {
    mockupAbortRef.current?.abort();
    const controller = new AbortController();
    mockupAbortRef.current = controller;

    setMockupGenerating(true);
    const templateName = currentTemplate?.name || "Notion Planner";
    const aestheticName = aesthetic?.name || "Minimal Clean";

    const initialImages: NotionMockupImage[] = NOTION_MOCKUP_SCENES.map((scene, i) => ({
      id: `${scene.id}-${Date.now()}-${i}`,
      sceneIndex: i,
      label: scene.label,
      badge: scene.badge,
      badgeColor: scene.badgeColor,
      imageData: null,
      prompt: scene.prompt(templateName, aestheticName),
      status: "pending" as const,
    }));
    setMockupImages(initialImages);

    const tasks = NOTION_MOCKUP_SCENES.map((scene, i) => async () => {
      setMockupImages((prev) =>
        prev.map((img, idx) => (idx === i ? { ...img, status: "generating" as const } : img))
      );

      const prompt = scene.prompt(templateName, aestheticName);
      try {
        const resp = await fetch("/api/ai/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            provider: "pollinations",
            width: 1920,
            height: 1080,
            model: "flux",
            seed: Math.floor(Math.random() * 2147483647),
            enhance: true,
          }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({ error: "Unknown error" }));
          return { imageData: null as string | null, model: undefined as string | undefined, error: errData.error || `HTTP ${resp.status}` };
        }

        const data = await resp.json();
        if (data.image) {
          const mimeType = data.mimeType || "image/jpeg";
          const dataUrl = `data:${mimeType};base64,${data.image}`;
          return { imageData: dataUrl as string | null, model: data.model as string | undefined, error: undefined as string | undefined };
        }
        return { imageData: null as string | null, model: undefined as string | undefined, error: "No image in response" };
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return { imageData: null as string | null, model: undefined as string | undefined, error: "Cancelled" };
        }
        return { imageData: null as string | null, model: undefined as string | undefined, error: String(err) };
      }
    });

    await runWithConcurrency(tasks, 2, (index, result) => {
      setMockupImages((prev) =>
        prev.map((img, idx) =>
          idx === index
            ? {
                ...img,
                imageData: result.imageData,
                model: result.model,
                status: result.imageData ? ("loaded" as const) : ("error" as const),
                errorMsg: result.error,
              }
            : img
        )
      );
    });

    setMockupGenerating(false);
  }

  async function retryMockup(index: number) {
    const scene = NOTION_MOCKUP_SCENES[index];
    if (!scene) return;
    const templateName = currentTemplate?.name || "Notion Planner";
    const aestheticName = aesthetic?.name || "Minimal Clean";

    setMockupImages((prev) =>
      prev.map((img, i) =>
        i === index ? { ...img, status: "generating" as const, imageData: null, errorMsg: undefined } : img
      )
    );

    const prompt = scene.prompt(templateName, aestheticName);
    try {
      const resp = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          provider: "pollinations",
          width: 1920,
          height: 1080,
          model: "flux",
          seed: Math.floor(Math.random() * 2147483647),
          enhance: true,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: "Unknown error" }));
        setMockupImages((prev) =>
          prev.map((img, i) =>
            i === index ? { ...img, status: "error" as const, errorMsg: errData.error } : img
          )
        );
        return;
      }

      const data = await resp.json();
      if (data.image) {
        const mimeType = data.mimeType || "image/jpeg";
        const dataUrl = `data:${mimeType};base64,${data.image}`;
        setMockupImages((prev) =>
          prev.map((img, i) =>
            i === index ? { ...img, imageData: dataUrl, model: data.model, status: "loaded" as const } : img
          )
        );
      } else {
        setMockupImages((prev) =>
          prev.map((img, i) =>
            i === index ? { ...img, status: "error" as const, errorMsg: "No image in response" } : img
          )
        );
      }
    } catch (err) {
      setMockupImages((prev) =>
        prev.map((img, i) =>
          i === index ? { ...img, status: "error" as const, errorMsg: String(err) } : img
        )
      );
    }
  }

  function downloadMockupImage(img: NotionMockupImage) {
    if (!img.imageData) return;
    try {
      const a = document.createElement("a");
      a.href = img.imageData;
      a.download = `notion-mockup-${currentTemplate?.id || "template"}-${img.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      window.open(img.imageData, "_blank");
    }
  }

  // ── Video Generation (Canvas + MediaRecorder slideshow) ──
  async function generateVideo() {
    const loadedImgs = mockupImages.filter((img) => img.status === "loaded" && img.imageData);
    if (loadedImgs.length < 2) return;

    setVideoGenerating(true);
    setVideoProgress(0);
    setVideoUrl(null);

    try {
      // Create offscreen canvas at 16:9 HD resolution
      const canvas = document.createElement("canvas");
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext("2d")!;

      // Load all HTMLImageElements in parallel
      const images = await Promise.all(
        loadedImgs.map(
          (img) =>
            new Promise<HTMLImageElement>((resolve, reject) => {
              const el = new Image();
              el.onload = () => resolve(el);
              el.onerror = reject;
              el.src = img.imageData!;
            })
        )
      );

      // Setup MediaRecorder
      const stream = canvas.captureStream(30); // 30 fps
      const mimeType = (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm;codecs=vp9"))
        ? "video/webm;codecs=vp9"
        : "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      const videoReady = new Promise<string>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: "video/webm" });
          resolve(URL.createObjectURL(blob));
        };
      });

      recorder.start(100); // collect data every 100ms

      const FPS = 30;
      const HOLD_FRAMES = FPS * 3;     // 3 seconds per slide
      const FADE_FRAMES = Math.round(FPS * 0.6); // 0.6s crossfade
      const totalFrames = images.length * (HOLD_FRAMES + FADE_FRAMES);
      let frameCount = 0;

      for (let imgIdx = 0; imgIdx < images.length; imgIdx++) {
        const nextIdx = (imgIdx + 1) % images.length;

        // ── Hold phase ──
        for (let f = 0; f < HOLD_FRAMES; f++) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(images[imgIdx], 0, 0, canvas.width, canvas.height);

          // Slide counter pill
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.beginPath();
          ctx.roundRect(canvas.width - 130, canvas.height - 52, 110, 34, 17);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.92)";
          ctx.font = "bold 15px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(`${imgIdx + 1} / ${images.length}`, canvas.width - 75, canvas.height - 29);

          frameCount++;
          if (frameCount % 10 === 0) {
            setVideoProgress(Math.round((frameCount / totalFrames) * 100));
          }
          await new Promise((r) => setTimeout(r, 1000 / FPS));
        }

        // ── Crossfade phase ──
        for (let f = 0; f < FADE_FRAMES; f++) {
          const alpha = f / FADE_FRAMES;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.globalAlpha = 1 - alpha;
          ctx.drawImage(images[imgIdx], 0, 0, canvas.width, canvas.height);
          ctx.globalAlpha = alpha;
          ctx.drawImage(images[nextIdx], 0, 0, canvas.width, canvas.height);
          ctx.globalAlpha = 1;

          frameCount++;
          if (frameCount % 5 === 0) {
            setVideoProgress(Math.round((frameCount / totalFrames) * 100));
          }
          await new Promise((r) => setTimeout(r, 1000 / FPS));
        }
      }

      recorder.stop();
      const url = await videoReady;
      setVideoUrl(url);
    } catch (err) {
      console.error("Video generation error:", err);
    } finally {
      setVideoGenerating(false);
      setVideoProgress(100);
    }
  }

  function downloadVideo() {
    if (!videoUrl) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `notion-mockup-${currentTemplate?.id || "template"}-etsy-video.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ── Real Screenshot Mockups ──
  // Takes a publicly published Notion page URL, screenshots it via microlink.io,
  // then composites it into device frames on Canvas to produce accurate Etsy listing images
  async function generateRealScreenshots() {
    const url = realScreenshotUrl.trim();
    if (!url) return;

    setRealScreenshotGenerating(true);
    setRealScreenshotError("");
    setRealScreenshots([]);

    try {
      // 1. Fetch the screenshot of the actual Notion page
      const resp = await fetch(`/api/screenshot?url=${encodeURIComponent(url)}`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Screenshot failed" }));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      const blob = await resp.blob();
      const screenshotDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // 2. Load the screenshot as an image element
      const screenshotImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = screenshotDataUrl;
      });

      // 3. Composite into multiple device frames using Canvas
      const devices = [
        { device: "ipad-landscape", label: "iPad — Landscape", w: 1600, h: 1200, screenX: 60, screenY: 80, screenW: 1480, screenH: 1040, bg: "#f5f5f0" },
        { device: "macbook", label: "MacBook — Dashboard", w: 1800, h: 1200, screenX: 200, screenY: 60, screenW: 1400, screenH: 880, bg: "#e8e8e8" },
        { device: "ipad-portrait", label: "iPad — Portrait", w: 900, h: 1200, screenX: 40, screenY: 60, screenW: 820, screenH: 1080, bg: "#fafafa" },
      ];

      const composited: { device: string; label: string; screenshot: string }[] = [];

      for (const dev of devices) {
        const canvas = document.createElement("canvas");
        canvas.width = dev.w;
        canvas.height = dev.h;
        const ctx = canvas.getContext("2d")!;

        // Background fill (neutral, clean)
        ctx.fillStyle = dev.bg;
        ctx.fillRect(0, 0, dev.w, dev.h);

        // Outer device shadow
        ctx.shadowColor = "rgba(0,0,0,0.18)";
        ctx.shadowBlur = 40;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 12;

        // Device body (rounded rect, dark aluminum)
        ctx.fillStyle = "#1c1c1e";
        const radius = 28;
        ctx.beginPath();
        ctx.roundRect(0, 0, dev.w, dev.h, radius);
        ctx.fill();
        ctx.shadowColor = "transparent";

        // Inner screen bezel (slightly inset)
        const bx = dev.screenX - 10, by = dev.screenY - 10;
        const bw = dev.screenW + 20, bh = dev.screenH + 20;
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 8);
        ctx.fill();

        // Draw actual screenshot onto the screen area
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(dev.screenX, dev.screenY, dev.screenW, dev.screenH, 4);
        ctx.clip();
        // Scale screenshot to fill screen area
        const scaleX = dev.screenW / screenshotImg.naturalWidth;
        const scaleY = dev.screenH / screenshotImg.naturalHeight;
        const scale = Math.max(scaleX, scaleY);
        const drawW = screenshotImg.naturalWidth * scale;
        const drawH = screenshotImg.naturalHeight * scale;
        const offsetX = dev.screenX + (dev.screenW - drawW) / 2;
        const offsetY = dev.screenY;
        ctx.drawImage(screenshotImg, offsetX, offsetY, drawW, drawH);
        ctx.restore();

        // Screen glare (subtle white gradient overlay)
        const glare = ctx.createLinearGradient(dev.screenX, dev.screenY, dev.screenX + dev.screenW * 0.5, dev.screenY + dev.screenH * 0.4);
        glare.addColorStop(0, "rgba(255,255,255,0.06)");
        glare.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = glare;
        ctx.beginPath();
        ctx.roundRect(dev.screenX, dev.screenY, dev.screenW, dev.screenH, 4);
        ctx.fill();

        // Home button / notch indicators
        if (dev.device === "ipad-landscape" || dev.device === "ipad-portrait") {
          ctx.fillStyle = "#333";
          ctx.beginPath();
          ctx.arc(dev.w / 2, dev.h - 22, 10, 0, Math.PI * 2);
          ctx.fill();
        }

        composited.push({
          device: dev.device,
          label: dev.label,
          screenshot: canvas.toDataURL("image/jpeg", 0.92),
        });
      }

      setRealScreenshots(composited);
    } catch (err) {
      setRealScreenshotError(err instanceof Error ? err.message : "Screenshot failed");
    } finally {
      setRealScreenshotGenerating(false);
    }
  }

  // ── Auto-Polish: auto-set icons + covers on every Notion page ──
  async function runAutoPolish(overrideUrl?: string) {
    const url = (overrideUrl || polishUrl || notionBuildResult?.pageUrl || "").trim();
    if (!url || !notionToken) return;
    setPolishRunning(true);
    setPolishSteps([]);
    setPolishDone(false);
    setPolishError("");
    try {
      const resp = await fetch("/api/notion/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageUrl: url, templateType: selectedType || "life_planner", token: notionToken }),
      });
      if (!resp.ok || !resp.body) {
        const err = await resp.json() as { error?: string };
        throw new Error(err.error || "Polish failed");
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        for (const line of text.split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6)) as { msg: string };
              if (data.msg === "__DONE__") {
                setPolishDone(true);
              } else {
                setPolishSteps((prev) => [...prev, data.msg]);
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } catch (err) {
      setPolishError(err instanceof Error ? err.message : String(err));
    }
    setPolishRunning(false);
  }

  // ── Run Upgrade Template (SSE) ──
  async function runUpgrade() {
    if (!notionBuildResult?.pageId || !notionToken) return;
    setUpgradeRunning(true);
    setUpgradeSteps([]);
    setUpgradeDone(false);
    setUpgradeError("");
    try {
      const resp = await fetch("/api/notion/patch-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notionToken, pageId: notionBuildResult.pageId }),
      });
      if (!resp.ok || !resp.body) {
        const err = await resp.json() as { error?: string };
        throw new Error(err.error || "Upgrade failed");
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        for (const line of text.split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6)) as { msg: string };
              if (data.msg === "__DONE__") {
                setUpgradeDone(true);
                // Update catalog item with patch timestamp
                if (lastCatalogId) {
                  catalogStore.updateItem(lastCatalogId, {
                    lastPatched: new Date().toISOString(),
                  });
                }
              } else if (!data.msg.startsWith("{")) {
                // Regular progress message (skip JSON summary)
                setUpgradeSteps((prev) => [...prev, data.msg]);
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } catch (err) {
      setUpgradeError(err instanceof Error ? err.message : String(err));
    }
    setUpgradeRunning(false);
  }

  function downloadRealScreenshot(item: { device: string; label: string; screenshot: string }) {
    const a = document.createElement("a");
    a.href = item.screenshot;
    a.download = `notion-real-mockup-${currentTemplate?.id || "template"}-${item.device}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const mockupLoadedCount = mockupImages.filter((img) => img.status === "loaded").length;
  const mockupGeneratingCount = mockupImages.filter((img) => img.status === "generating").length;

  async function copyToClipboard(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
  }

  // ── Export Etsy Package as ZIP ──
  async function exportEtsyPackage() {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    const aiListing = etsyGeneratedListing as Record<string, unknown> | null;
    const planListing = loadedPlan?.etsyListing as Record<string, unknown> | null;
    const listing = aiListing || planListing;
    const brief = mockupBrief as Record<string, unknown> | null;
    const templateName = (loadedPlan?.templateName as string) || currentTemplate?.name || "Template";

    // 1. title.txt
    zip.file("title.txt", String(listing?.title || ""));

    // 2. description.txt
    zip.file("description.txt", String(listing?.description || ""));

    // 3. tags.txt (comma-separated + one per line)
    const tags = (Array.isArray(listing?.tags) ? listing.tags : []) as string[];
    zip.file("tags.txt", `Comma-separated (paste into Etsy):\n${tags.join(", ")}\n\nOne per line:\n${tags.join("\n")}`);

    // 4. faqs.txt
    const faqs = (Array.isArray(listing?.faqs) ? listing.faqs : []) as Array<{ question: string; answer: string }>;
    const faqText = faqs.map((f, i) => `Q${i + 1}: ${f.question}\nA: ${f.answer}`).join("\n\n");
    zip.file("faqs.txt", faqText || "No FAQs generated.");

    // 5. mockup-brief.json
    if (brief) zip.file("mockup-brief.json", JSON.stringify(brief, null, 2));

    // 6. screenshot-instructions.md
    if (brief) {
      const slots = (Array.isArray(brief.slots) ? brief.slots : []) as Array<{ slotNumber: number; sceneName: string; purpose: string; device: string; notionViewToCapture: string; screenshotInstructions: string; framingTip: string; overlayText?: string }>;
      let md = `# Screenshot Instructions for ${templateName}\n\n`;
      for (const slot of slots) {
        md += `## Slot ${slot.slotNumber}: ${slot.sceneName}\n`;
        md += `- **Purpose:** ${slot.purpose}\n`;
        md += `- **Device:** ${slot.device}\n`;
        md += `- **View:** ${slot.notionViewToCapture}\n`;
        md += `- **Instructions:** ${slot.screenshotInstructions}\n`;
        md += `- **Framing:** ${slot.framingTip}\n`;
        if (slot.overlayText) md += `- **Overlay:** "${slot.overlayText}"\n`;
        md += "\n";
      }
      const generalTips = (Array.isArray(brief.generalTips) ? brief.generalTips : []) as string[];
      if (generalTips.length > 0) {
        md += "## General Tips\n";
        for (const tip of generalTips) md += `- ${tip}\n`;
      }
      zip.file("screenshot-instructions.md", md);
    }

    // 7. ai-image-prompts.txt (from mockup scenes)
    const scenes = (Array.isArray(loadedPlan?.mockupScenes) ? loadedPlan.mockupScenes : []) as string[];
    if (scenes.length > 0) {
      zip.file("ai-image-prompts.txt", scenes.map((s: string, i: number) => `Prompt ${i + 1}:\n${s}`).join("\n\n---\n\n"));
    }

    // 8. listing-data.json (full structured data)
    const price = listing?.price as { min?: number; max?: number; recommended?: number } | undefined;
    zip.file("listing-data.json", JSON.stringify({
      title: listing?.title,
      price: price,
      description: listing?.description,
      tags: listing?.tags,
      faqs: listing?.faqs,
      categories: listing?.categories,
      templateName,
      qualityScore: qualityScore?.overall,
      qualityTier: qualityScore?.tier,
      notionUrl: notionBuildResult?.pageUrl,
    }, null, 2));

    // Generate and download
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `etsy-package-${templateName.toLowerCase().replace(/\s+/g, "-")}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── RENDER ──
  return (
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white tracking-tight">Digital Product Studio</h2>
        <p className="text-[var(--text-secondary)] mt-1 text-sm">
          Build premium digital products that sell on Etsy — Notion templates, PDFs, Excel trackers & printables
        </p>
      </div>

      {/* ── Product Hub ── */}
      <div className="mb-8">
        <div className="grid grid-cols-4 gap-4">
          {/* Notion Templates - current page, highlighted */}
          <div className="relative bg-gradient-to-br from-indigo-950/60 to-violet-950/40 rounded-xl border-2 border-indigo-500/40 p-4 cursor-default">
            <div className="absolute top-2.5 right-2.5">
              <span className="text-[9px] font-bold bg-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30">CURRENT</span>
            </div>
            <span className="text-2xl block mb-2">📋</span>
            <h3 className="text-sm font-bold text-white">Notion Templates</h3>
            <p className="text-[11px] text-indigo-300/70 mt-1">Build via API or prompts</p>
            <p className="text-[10px] text-indigo-400 font-semibold mt-2">$5–$20 avg</p>
          </div>
          {/* PDF Planners */}
          <a href="/pdf-builder" className="group bg-gradient-to-br from-[#0f0f1a] to-[#161624] rounded-xl border border-white/[0.08] p-4 hover:border-blue-500/30 hover:bg-blue-950/20 transition-all duration-200">
            <span className="text-2xl block mb-2">📄</span>
            <h3 className="text-sm font-bold text-white group-hover:text-blue-300 transition-colors">PDF Planners</h3>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">8 types · instant download</p>
            <p className="text-[10px] text-blue-400 font-semibold mt-2">$3–$15 avg</p>
          </a>
          {/* Excel Trackers */}
          <a href="/excel-builder" className="group bg-gradient-to-br from-[#0f0f1a] to-[#161624] rounded-xl border border-white/[0.08] p-4 hover:border-emerald-500/30 hover:bg-emerald-950/20 transition-all duration-200">
            <span className="text-2xl block mb-2">📊</span>
            <h3 className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors">Excel Trackers</h3>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">6 types · .xlsx files</p>
            <p className="text-[10px] text-emerald-400 font-semibold mt-2">$5–$12 avg</p>
          </a>
          {/* Printables */}
          <a href="/printable-builder" className="group bg-gradient-to-br from-[#0f0f1a] to-[#161624] rounded-xl border border-white/[0.08] p-4 hover:border-pink-500/30 hover:bg-pink-950/20 transition-all duration-200">
            <span className="text-2xl block mb-2">🎨</span>
            <h3 className="text-sm font-bold text-white group-hover:text-pink-300 transition-colors">Printables</h3>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">6 types · quote prints & journals</p>
            <p className="text-[10px] text-pink-400 font-semibold mt-2">$2–$8 avg</p>
          </a>
        </div>
      </div>

      {!showResult ? (
        <div className="space-y-8">

          {/* ✨ Quick Polish — standalone, no generation needed */}
          <div className="bg-gradient-to-r from-violet-950/50 to-indigo-950/50 border border-violet-500/20 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-violet-500/20 flex items-center gap-3">
              <span className="text-2xl">✨</span>
              <div className="flex-1">
                <h3 className="font-bold text-violet-200 text-sm">Already built your template on Notion?</h3>
                <p className="text-xs text-violet-400 mt-0.5">Paste your page link → auto-add emoji icons + <strong>AI-generated Flux covers</strong> to every page</p>
              </div>
              <span className="text-xs bg-violet-600 text-white px-2.5 py-1 rounded-full font-semibold flex-shrink-0">Auto-Polish</span>
            </div>
            <div className="px-5 py-4 space-y-3">
              {/* URL input — always visible */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={polishUrl}
                  onChange={(e) => { setPolishUrl(e.target.value); if (polishDone) { setPolishDone(false); setPolishSteps([]); setPolishError(""); } }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !polishRunning && polishUrl.trim()) runAutoPolish(polishUrl); }}
                  placeholder="https://notion.so/Your-Template-Page-xxxxx"
                  className="flex-1 text-sm border border-white/[0.08] rounded-xl px-4 py-2.5 bg-[var(--bg-elevated)] focus:outline-none focus:ring-2 focus:ring-violet-500/30 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                />
                <button
                  onClick={() => runAutoPolish(polishUrl)}
                  disabled={polishRunning || !polishUrl.trim()}
                  className={`flex-shrink-0 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                    polishRunning
                      ? "bg-violet-300 text-white cursor-not-allowed"
                      : polishDone && !polishSteps.some(s => s.includes("❌"))
                        ? "bg-green-600 text-white hover:bg-green-700 shadow-sm"
                        : "bg-violet-600 text-white hover:bg-violet-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  }`}
                >
                  {polishRunning ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Polishing...
                    </>
                  ) : polishDone && !polishSteps.some(s => s.includes("❌")) ? (
                    "✅ Done — Run again"
                  ) : (
                    "✨ Auto-Polish"
                  )}
                </button>
              </div>
              <p className="text-xs text-[var(--text-muted)]">💡 Open your template in Notion → copy the URL from the address bar → paste above</p>

              {/* Progress / result log — shown inline, never hides the input */}
              {polishSteps.length > 0 && (
                <div className={`rounded-xl p-3 max-h-44 overflow-y-auto space-y-1 border ${
                  polishDone && polishSteps.some(s => s.includes("❌"))
                    ? "bg-red-950/30 border-red-500/20"
                    : polishDone
                      ? "bg-emerald-950/30 border-emerald-500/20"
                      : "bg-[var(--bg-elevated)] border-white/[0.06]"
                }`}>
                  {polishSteps.map((s, i) => (
                    <p key={i} className={`text-xs font-mono ${s.includes("❌") ? "text-red-400" : s.includes("✅") ? "text-emerald-400" : "text-[var(--text-secondary)]"}`}>{s}</p>
                  ))}
                  {polishRunning && <p className="text-xs text-violet-400 animate-pulse">Processing pages...</p>}
                </div>
              )}

              {/* 404 / access hint */}
              {polishDone && polishSteps.some(s => s.includes("❌")) && (
                <p className="text-xs text-amber-300 bg-amber-950/30 border border-amber-500/20 rounded-lg p-2">
                  💡 In Notion: open your page → click <strong>···</strong> (top-right) → <strong>Connections</strong> → add <strong>CraftPlan</strong> — then paste the link again above
                </p>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <p className="text-xs text-[var(--text-muted)] font-medium">— OR build a new template below —</p>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          {/* Smart Suggestions Banner — only when etsy imports exist */}
          {smartSuggestions.length > 0 && (
            <div className="bg-amber-950/30 border border-amber-500/20 rounded-2xl overflow-hidden">
              <button
                onClick={() => setSuggestionsCollapsed(!suggestionsCollapsed)}
                className="w-full px-5 py-4 flex items-center gap-3 hover:bg-amber-950/40 transition-colors"
              >
                <span className="text-2xl">💡</span>
                <div className="flex-1 text-left">
                  <h3 className="font-bold text-amber-200 text-sm">Smart Suggestions from Your Imports</h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Based on {etsyImportListings.length} listings analyzed · {smartSuggestions.length} template {smartSuggestions.length === 1 ? "opportunity" : "opportunities"} detected
                  </p>
                </div>
                <svg className={`w-5 h-5 text-amber-400 transition-transform ${suggestionsCollapsed ? "" : "rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {!suggestionsCollapsed && (
                <div className="px-5 pb-5 grid grid-cols-2 gap-3">
                  {smartSuggestions.map((s) => (
                    <div
                      key={s.templateTypeId}
                      className="bg-[var(--bg-elevated)] border border-white/[0.08] rounded-xl p-4 flex flex-col gap-2 hover:border-amber-500/30 transition-all"
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{s.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white">{s.templateName}</p>
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">{s.reason}</p>
                        </div>
                        <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          s.confidence === "high" ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/50" :
                          s.confidence === "medium" ? "bg-blue-950/60 text-blue-400 border border-blue-800/50" :
                          "bg-white/[0.06] text-[var(--text-muted)]"
                        }`}>
                          {s.confidence} confidence
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                        <span>{s.totalListings} listings</span>
                        {s.avgPrice > 0 && <span>avg ${s.avgPrice.toFixed(0)}</span>}
                        {s.avgRevenue > 0 && <span>~${s.avgRevenue.toFixed(0)}/mo rev</span>}
                        {s.topKeyword && <span className="truncate text-amber-400">"{s.topKeyword}"</span>}
                      </div>
                      <button
                        onClick={() => handleSuggestionBuild(s)}
                        className="mt-1 w-full py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-500 hover:to-orange-500 transition-all shadow-sm"
                      >
                        BUILD →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 1: Choose Template Type */}
          <div ref={templateGridRef}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">1</span>
              <h3 className="text-lg font-semibold text-slate-800">Choose Template Type</h3>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {TEMPLATE_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setSelectedType(t.id); setSelectedFeatures([]); }}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    selectedType === t.id
                      ? "border-indigo-500 bg-indigo-50 shadow-md"
                      : highlightedType === t.id
                        ? "border-amber-400 bg-amber-50 shadow-lg ring-2 ring-amber-300 animate-pulse"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <span className="text-2xl">{t.icon}</span>
                  <p className="text-sm font-medium leading-tight text-slate-800 mt-1 line-clamp-2">{t.name}</p>
                  <div className="flex gap-2 mt-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      t.demand === "Very High" ? "bg-green-100 text-green-700" :
                      t.demand === "High" ? "bg-blue-100 text-blue-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>{t.demand}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">{t.avgPrice}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      t.competition === "Low" ? "bg-green-100 text-green-700" :
                      t.competition === "Medium" ? "bg-yellow-100 text-yellow-700" :
                      "bg-red-100 text-red-600"
                    }`}>{t.competition} comp</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Features */}
          {currentTemplate && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">2</span>
                <h3 className="text-lg font-semibold text-slate-800">Select Features</h3>
                <button onClick={selectAllFeatures} className="ml-auto text-xs text-indigo-600 hover:underline">Select All</button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {currentTemplate.features.map((f) => (
                  <label
                    key={f}
                    className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedFeatures.includes(f)
                        ? "border-indigo-400 bg-indigo-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFeatures.includes(f)}
                      onChange={() => toggleFeature(f)}
                      className="rounded border-slate-300 text-indigo-600"
                    />
                    <span className="text-sm text-slate-700">{f}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Aesthetic + Details */}
          {selectedType && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">3</span>
                <h3 className="text-lg font-semibold text-slate-800">Aesthetic &amp; Details</h3>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Aesthetic Theme</label>
                  <div className="space-y-2">
                    {AESTHETICS.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setSelectedAesthetic(a.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                          selectedAesthetic === a.id
                            ? "border-indigo-500 bg-indigo-50"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex -space-x-1">
                          {a.colors.map((c, i) => (
                            <div key={i} className="w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: c }} />
                          ))}
                        </div>
                        <span className="text-sm font-medium text-slate-700">{a.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Target Audience</label>
                    <input
                      type="text"
                      value={targetAudience}
                      onChange={(e) => setTargetAudience(e.target.value)}
                      placeholder="e.g. College students, Freelancers, Working moms..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Niche / Focus</label>
                    <input
                      type="text"
                      value={niche}
                      onChange={(e) => setNiche(e.target.value)}
                      placeholder="e.g. productivity, personal finance, studying..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Complexity</label>
                    <div className="flex gap-2">
                      {(["simple", "medium", "advanced"] as const).map((c) => (
                        <button
                          key={c}
                          onClick={() => setComplexity(c)}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                            complexity === c
                              ? "bg-indigo-600 text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Build Mode Selector */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Build Method</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setBuildMode("notion_api")}
                        className={`flex-1 py-3 px-3 rounded-xl text-sm font-medium transition-all border-2 ${
                          buildMode === "notion_api"
                            ? "border-green-500 bg-green-50 text-green-700"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        <span className="block text-lg mb-0.5">🚀</span>
                        Notion API
                        <span className="block text-[10px] opacity-70 mt-0.5">Real templates (Recommended)</span>
                      </button>
                      <button
                        onClick={() => setBuildMode("ai")}
                        className={`flex-1 py-3 px-3 rounded-xl text-sm font-medium transition-all border-2 ${
                          buildMode === "ai"
                            ? "border-purple-500 bg-purple-50 text-purple-700"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        <span className="block text-lg mb-0.5">🤖</span>
                        AI Build
                        <span className="block text-[10px] opacity-70 mt-0.5">Gemini text output</span>
                      </button>
                      <button
                        onClick={() => setBuildMode("prompts")}
                        className={`flex-1 py-3 px-3 rounded-xl text-sm font-medium transition-all border-2 ${
                          buildMode === "prompts"
                            ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        <span className="block text-lg mb-0.5">📋</span>
                        Copy Prompts
                        <span className="block text-[10px] opacity-70 mt-0.5">Paste into Notion AI</span>
                      </button>
                    </div>
                  </div>

                  <div className={`rounded-xl border p-4 mt-2 ${
                    buildMode === "notion_api" ? "bg-green-50 border-green-200" :
                    buildMode === "ai" ? "bg-purple-50 border-purple-200" :
                    "bg-amber-50 border-amber-200"
                  }`}>
                    <p className={`text-xs font-semibold mb-1 ${
                      buildMode === "notion_api" ? "text-green-800" :
                      buildMode === "ai" ? "text-purple-800" : "text-amber-800"
                    }`}>
                      {buildMode === "notion_api" ? "🚀 Notion API Mode (Best Quality)" : buildMode === "ai" ? "🤖 AI Build Mode" : "📋 Prompt Mode"}
                    </p>
                    {buildMode === "notion_api" ? (
                      <ol className="text-xs text-green-700 space-y-1 list-decimal list-inside leading-relaxed">
                        <li>Connect your Notion workspace (one-time setup in Settings)</li>
                        <li>Select a parent page to build the template in</li>
                        <li>Click Build &mdash; creates real databases, properties, formulas &amp; sample data</li>
                        <li>Open in Notion, publish to web, and list on Etsy!</li>
                      </ol>
                    ) : buildMode === "ai" ? (
                      <ol className="text-xs text-purple-700 space-y-1 list-decimal list-inside leading-relaxed">
                        <li>Click Build &mdash; Gemini AI generates everything</li>
                        <li>Review the complete template + Etsy listing</li>
                        <li>Copy the template content into a new Notion page</li>
                        <li>Adjust formatting and publish on Etsy!</li>
                      </ol>
                    ) : (
                      <ol className="text-xs text-amber-700 space-y-1 list-decimal list-inside leading-relaxed">
                        <li>Click Generate to get 3 Notion AI prompts</li>
                        <li>Open Notion and create a new page</li>
                        <li>Paste Phase 1, 2, 3 into Notion AI one by one</li>
                        <li>Copy the Etsy listing and publish!</li>
                      </ol>
                    )}
                  </div>

                  {/* Notion API Setup — show when Notion API mode selected */}
                  {buildMode === "notion_api" && (
                    <div className="space-y-3">
                      {!notionConnected ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                          <p className="text-xs font-semibold text-amber-800 mb-2">⚠️ Notion Not Connected</p>
                          <p className="text-xs text-amber-700 mb-3">
                            You need to connect your Notion workspace first. Go to Settings to add your integration token.
                          </p>
                          <a
                            href="/settings"
                            className="inline-block px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 transition-colors"
                          >
                            Open Settings →
                          </a>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-green-200 rounded-full flex items-center justify-center">
                              <svg className="w-3.5 h-3.5 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                            <span className="text-xs font-semibold text-green-800">Notion Connected</span>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-green-800 mb-1.5">Parent Page</label>
                            {loadingPages ? (
                              <div className="flex items-center gap-2 text-xs text-green-600">
                                <div className="w-3 h-3 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                                Loading pages...
                              </div>
                            ) : notionPages.length > 0 ? (
                              <select
                                value={selectedParentPage}
                                onChange={(e) => setSelectedParentPage(e.target.value)}
                                className="w-full px-3 py-2 border border-green-300 rounded-lg text-sm bg-white"
                              >
                                {notionPages.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.icon ? `${p.icon} ` : ""}{p.title}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <p className="font-medium mb-1">No pages found</p>
                                <p>Share a page with your Notion integration: Open a Notion page → click <strong>...</strong> → <strong>Connect to</strong> → select your integration.</p>
                              </div>
                            )}
                            <button
                              onClick={() => loadNotionPages()}
                              className="mt-1.5 text-[10px] text-green-600 hover:underline"
                            >
                              ↻ Refresh pages
                            </button>
                          </div>

                          {/* Available templates note */}
                          {selectedType && !["adhd_planner", "life_planner", "finance_tracker", "life_os", "social_media"].includes(selectedType) && (
                            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                              ⚠️ This template type uses a fallback spec. For best results, try ADHD Planner, Life Planner, or Finance Tracker.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Competitor Context Banner (from Etsy Imports) */}
          {competitorContext && (
            <div className="p-4 rounded-xl border border-orange-300 bg-gradient-to-r from-orange-50 to-amber-50">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🔍</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-orange-900">
                    Competitor Intelligence Loaded
                  </p>
                  <p className="text-xs text-orange-800 mt-0.5 truncate" title={competitorContext.title}>
                    {competitorContext.title}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-orange-700">
                    <span>💰 ${competitorContext.price?.toFixed(2)}</span>
                    <span>❤️ {competitorContext.favorites} favs</span>
                    <span>⭐ {competitorContext.reviews} reviews</span>
                    <span>📈 ${competitorContext.revenue?.toFixed(0)}/mo</span>
                    {competitorContext.tier && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        competitorContext.tier === 'BUY' ? 'bg-green-100 text-green-700' :
                        competitorContext.tier === 'MONITOR' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {competitorContext.tier}
                      </span>
                    )}
                    {competitorContext.shop && <span>🏪 {competitorContext.shop}</span>}
                  </div>
                </div>
                <button
                  onClick={() => setCompetitorContext(null)}
                  className="text-xs text-orange-500 hover:text-orange-700 underline flex-shrink-0"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Loaded Opportunity Plan Banner */}
          {loadedPlan && buildMode === "notion_api" && (
            <div className="p-4 rounded-xl border border-blue-300 bg-gradient-to-r from-blue-50 to-indigo-50">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🎯</span>
                <div className="flex-1">
                  <p className="font-bold text-sm text-blue-900">
                    Etsy Opportunity Plan Loaded
                  </p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    {(loadedPlan as any).templateName || "AI-Generated Template"} — {(loadedPlan as any).databases?.length || 0} databases, {(loadedPlan as any).relations?.length || 0} relations
                  </p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    💰 ${(loadedPlan as any).priceSuggestion || "?"} suggested • {(loadedPlan as any).aesthetic || "dark"} aesthetic • {(loadedPlan as any).complexity || "Advanced"}
                  </p>
                </div>
                <button
                  onClick={() => { setLoadedPlan(null); }}
                  className="text-xs text-blue-500 hover:text-blue-700 underline"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Premium Framework Toggle */}
          {(selectedType || loadedPlan) && buildMode === "notion_api" && (
            <div className="flex items-center justify-between p-4 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50">
              <div className="flex items-center gap-3">
                <span className="text-lg">✨</span>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm text-amber-900">Premium Template Framework</p>
                    {(loadedPlan?.styleBlueprint as Record<string, unknown> | undefined)?.premiumTier === "os_ultra" && (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full">
                        OS ULTRA
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-amber-700">Navigation bar, KPI dashboard, onboarding guide, action buttons</p>
                </div>
              </div>
              <button
                onClick={() => setPremiumMode(!premiumMode)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${premiumMode ? "bg-amber-500" : "bg-gray-300"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${premiumMode ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          )}

          {/* Generate / Build Button */}
          {(selectedType || loadedPlan) && (
            <button
              onClick={
                buildMode === "notion_api" ? buildWithNotionAPI :
                buildMode === "ai" ? buildWithAI :
                generatePrompts
              }
              disabled={
                generating || aiBuilding || notionBuilding ||
                (buildMode === "notion_api" && (!notionConnected || !selectedParentPage))
              }
              className={`w-full py-4 rounded-xl font-semibold text-lg disabled:opacity-50 transition-all shadow-lg text-white ${
                buildMode === "notion_api"
                  ? "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                  : buildMode === "ai"
                  ? "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                  : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
              }`}
            >
              {notionBuilding
                ? "🚀 Building in Notion..."
                : aiBuilding
                ? `🧠 Gemini is building... Phase ${aiBuildPhase}/3`
                : generating
                ? "Generating..."
                : buildMode === "notion_api" && loadedPlan
                ? `🚀 Build "${(loadedPlan as any).templateName || "Etsy Plan"}" in Notion`
                : buildMode === "notion_api"
                ? "🚀 Build Template in Notion"
                : buildMode === "ai"
                ? "🤖 Build with Gemini AI"
                : "Generate Notion AI Prompts + Etsy Listing"}
            </button>
          )}
        </div>
      ) : (
        /* ══════════════ RESULTS VIEW ══════════════ */
        <div className="space-y-6">
          <button
            onClick={() => { setShowResult(false); setResult(null); setAiOutput(""); setAiEtsyListing(""); setNotionBuildSteps([]); setNotionBuildResult(null); setPromptOnlySteps([]); setValidationResult(null); setQualityScore(null); setEtsyGeneratedListing(null); setMockupBrief(null); setUpgradeRunning(false); setUpgradeSteps([]); setUpgradeDone(false); setUpgradeError(""); setLastCatalogId(null); }}
            className="text-sm text-indigo-600 hover:underline flex items-center gap-1"
          >
            ← Back to builder
          </button>

          {/* ── NOTION API BUILD RESULTS ── */}
          {(notionBuildSteps.length > 0 || notionBuilding) && (
            <div className="space-y-4">
              {/* Status bar */}
              <div className={`flex items-center gap-3 rounded-xl p-4 border ${
                notionBuildResult
                  ? "bg-gradient-to-r from-green-50 to-emerald-50 border-green-200"
                  : notionBuildSteps.some(s => s.startsWith("Error"))
                  ? "bg-gradient-to-r from-red-50 to-orange-50 border-red-200"
                  : "bg-gradient-to-r from-green-50 to-emerald-50 border-green-200"
              }`}>
                {notionBuilding ? (
                  <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                ) : notionBuildResult ? (
                  <span className="text-2xl flex-shrink-0">✅</span>
                ) : (
                  <span className="text-2xl flex-shrink-0">❌</span>
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${
                    notionBuildResult ? "text-green-800" :
                    notionBuildSteps.some(s => s.startsWith("Error")) ? "text-red-800" :
                    "text-green-800"
                  }`}>
                    {notionBuilding
                      ? "Building template in Notion..."
                      : notionBuildResult
                      ? "Template built successfully!"
                      : "Build failed"}
                  </p>
                  <p className="text-xs text-green-600 mt-0.5">
                    {notionBuilding
                      ? notionBuildSteps[notionBuildSteps.length - 1] || "Starting..."
                      : notionBuildResult
                      ? "Your template is ready in Notion with real databases, properties, and sample data"
                      : "Check the build log for errors"}
                  </p>
                </div>
              </div>

              {/* Build result — open in Notion */}
              {notionBuildResult && (
                <div className="bg-white border border-green-200 rounded-xl p-6 text-center space-y-4">
                  <div className="w-16 h-16 mx-auto bg-green-100 rounded-2xl flex items-center justify-center">
                    <span className="text-3xl">🎉</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Template Created!</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      Your {currentTemplate?.name || "template"} has been built with real databases, properties, formulas, and sample data.
                    </p>
                  </div>
                  <div className="flex gap-3 justify-center">
                    <a
                      href={notionBuildResult.pageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors shadow-md"
                    >
                      Open in Notion →
                    </a>
                    <button
                      onClick={() => copyToClipboard(notionBuildResult.pageUrl, "notion-url")}
                      className={`px-4 py-3 rounded-xl font-medium text-sm transition-colors ${
                        copied === "notion-url"
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {copied === "notion-url" ? "Copied!" : "Copy Link"}
                    </button>
                    {(etsyGeneratedListing || loadedPlan?.etsyListing) && (
                      <button
                        onClick={exportEtsyPackage}
                        className="px-4 py-3 bg-amber-100 text-amber-800 rounded-xl font-medium text-sm hover:bg-amber-200 transition-colors border border-amber-200"
                      >
                        📦 Export Etsy Package
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 space-y-0.5 pt-2">
                    <p>Next steps: Open in Notion → Share → Publish to web → Copy link for Etsy listing</p>
                  </div>
                </div>
              )}

              {/* 3 Manual Steps Remaining */}
              {notionBuildResult && (
                <div className="bg-white border border-orange-200 rounded-xl overflow-hidden shadow-sm">
                  {/* Header */}
                  <div className="bg-gradient-to-r from-violet-50 to-purple-50 px-5 py-4 border-b border-violet-200 flex items-center gap-3">
                    <span className="text-2xl">✨</span>
                    <div className="flex-1">
                      <h3 className="font-bold text-violet-900 text-sm">Finish Your Template</h3>
                      <p className="text-xs text-violet-600 mt-0.5">2 auto-steps by tool · 2 quick manual steps in Notion</p>
                    </div>
                    <span className="bg-violet-100 text-violet-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-violet-200 flex-shrink-0">
                      4 steps total
                    </span>
                  </div>

                  {/* Steps */}
                  <div className="divide-y divide-slate-100">

                    {/* Step 1: AUTO-POLISH (automated!) */}
                    <div className="p-4">
                      <div className="flex gap-3 mb-3">
                        <div className="w-7 h-7 rounded-full bg-green-100 text-green-700 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5 border border-green-200">
                          1
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base">✨</span>
                            <p className="font-semibold text-slate-800 text-sm">Auto-Add Icons &amp; Covers</p>
                            <span className="text-xs bg-green-100 text-green-700 border border-green-200 rounded-full px-2 py-0.5 font-semibold">AUTOMATED</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            Our tool sets emoji icons + beautiful cover photos on every page via Notion API
                          </p>
                        </div>
                      </div>

                      {/* Auto-Polish Box */}
                      <div className="ml-10 bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-3">
                        {!polishDone ? (
                          <>
                            <p className="text-xs text-violet-700 font-medium">
                              {notionBuildResult
                                ? "✓ Your template link is ready — click to auto-polish now:"
                                : "Paste your Notion page link to auto-add icons & covers:"}
                            </p>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={polishUrl || notionBuildResult?.pageUrl || ""}
                                onChange={(e) => setPolishUrl(e.target.value)}
                                placeholder="https://notion.so/your-template-page..."
                                className="flex-1 text-xs border border-violet-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 text-slate-700 placeholder-slate-400"
                              />
                              <button
                                onClick={() => runAutoPolish(polishUrl || notionBuildResult?.pageUrl || "")}
                                disabled={polishRunning || (!polishUrl && !notionBuildResult?.pageUrl)}
                                className={`flex-shrink-0 px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                                  polishRunning
                                    ? "bg-violet-300 text-white cursor-not-allowed"
                                    : "bg-violet-600 text-white hover:bg-violet-700 shadow-sm disabled:opacity-50"
                                }`}
                              >
                                {polishRunning ? (
                                  <>
                                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Polishing...
                                  </>
                                ) : (
                                  "✨ Auto-Polish"
                                )}
                              </button>
                            </div>
                            {polishError && (
                              <p className="text-xs text-red-600">❌ {polishError}</p>
                            )}
                            {polishSteps.length > 0 && (
                              <div className="bg-white border border-violet-100 rounded-lg p-3 max-h-40 overflow-y-auto space-y-1">
                                {polishSteps.map((s, i) => (
                                  <p key={i} className="text-xs text-slate-600 font-mono">{s}</p>
                                ))}
                                {polishRunning && <p className="text-xs text-violet-400 animate-pulse">Processing...</p>}
                              </div>
                            )}
                          </>
                        ) : polishSteps.some(s => s.includes("❌")) ? (
                          <div className="flex items-start gap-3">
                            <span className="text-2xl">⚠️</span>
                            <div>
                              <p className="text-sm font-bold text-red-700">Something went wrong</p>
                              <p className="text-xs text-red-500 mt-0.5">Make sure the page is shared with your Notion integration</p>
                              <div className="mt-2 max-h-32 overflow-y-auto space-y-0.5">
                                {polishSteps.map((s, i) => (
                                  <p key={i} className={`text-xs font-mono ${s.includes("❌") ? "text-red-600" : "text-slate-500"}`}>{s}</p>
                                ))}
                              </div>
                              <p className="text-xs text-slate-500 mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2">
                                💡 In Notion: open the page → click <strong>...</strong> → <strong>Connect to</strong> → select <strong>CraftPlan</strong> integration
                              </p>
                              <button
                                onClick={() => { setPolishDone(false); setPolishSteps([]); setPolishError(""); }}
                                className="mt-2 text-xs text-violet-600 underline hover:text-violet-800"
                              >
                                Try again
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-3">
                            <span className="text-2xl">🎉</span>
                            <div>
                              <p className="text-sm font-bold text-green-800">All pages polished!</p>
                              <p className="text-xs text-green-600 mt-0.5">Every page now has an icon + cover image</p>
                              <div className="mt-2 max-h-32 overflow-y-auto space-y-0.5">
                                {polishSteps.slice(-10).map((s, i) => (
                                  <p key={i} className="text-xs text-slate-500 font-mono">{s}</p>
                                ))}
                              </div>
                              <button
                                onClick={() => { setPolishDone(false); setPolishSteps([]); }}
                                className="mt-2 text-xs text-violet-600 underline hover:text-violet-800"
                              >
                                Re-run polish
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Step 2: UPGRADE TEMPLATE (automated!) */}
                    <div className="p-4">
                      <div className="flex gap-3 mb-3">
                        <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5 border border-amber-200">
                          2
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base">{"\u26A1"}</span>
                            <p className="font-semibold text-slate-800 text-sm">Upgrade Template (Premium)</p>
                            <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 font-semibold">AUTOMATED</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            Add Finance, Fitness, Travel databases · Fix KPI overflow · Build Start Here page · Enrich data
                          </p>
                        </div>
                      </div>

                      {/* Upgrade Box */}
                      <div className="ml-10 bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                        {!upgradeDone ? (
                          <>
                            <p className="text-xs text-amber-700 font-medium">
                              Apply 10 premium upgrade patches to your template (covers, databases, data enrichment, KPI fixes, and more):
                            </p>
                            <button
                              onClick={runUpgrade}
                              disabled={upgradeRunning}
                              className={`px-5 py-2.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                                upgradeRunning
                                  ? "bg-amber-300 text-white cursor-not-allowed"
                                  : "bg-amber-600 text-white hover:bg-amber-700 shadow-sm disabled:opacity-50"
                              }`}
                            >
                              {upgradeRunning ? (
                                <>
                                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  Upgrading...
                                </>
                              ) : (
                                "\u26A1 Run Upgrade"
                              )}
                            </button>
                            {upgradeError && (
                              <p className="text-xs text-red-600">{"\u274C"} {upgradeError}</p>
                            )}
                            {upgradeSteps.length > 0 && (
                              <div className="bg-white border border-amber-100 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
                                {upgradeSteps.map((s, i) => (
                                  <p key={i} className={`text-xs font-mono ${s.includes("\u274C") || s.includes("\u26A0") ? "text-red-600" : s.includes("\u2705") ? "text-green-700" : "text-slate-600"}`}>{s}</p>
                                ))}
                                {upgradeRunning && <p className="text-xs text-amber-400 animate-pulse">Processing...</p>}
                              </div>
                            )}
                          </>
                        ) : upgradeSteps.some(s => s.includes("\u274C Error")) ? (
                          <div className="flex items-start gap-3">
                            <span className="text-2xl">{"\u26A0\uFE0F"}</span>
                            <div>
                              <p className="text-sm font-bold text-red-700">Upgrade failed</p>
                              <p className="text-xs text-red-500 mt-0.5">Check that the page is shared with your integration</p>
                              <div className="mt-2 max-h-32 overflow-y-auto space-y-0.5">
                                {upgradeSteps.map((s, i) => (
                                  <p key={i} className={`text-xs font-mono ${s.includes("\u274C") ? "text-red-600" : "text-slate-500"}`}>{s}</p>
                                ))}
                              </div>
                              <button
                                onClick={() => { setUpgradeDone(false); setUpgradeSteps([]); setUpgradeError(""); }}
                                className="mt-2 text-xs text-amber-600 underline hover:text-amber-800"
                              >
                                Try again
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-3">
                            <span className="text-2xl">{"\uD83C\uDF89"}</span>
                            <div>
                              <p className="text-sm font-bold text-green-800">Template upgraded!</p>
                              <p className="text-xs text-green-600 mt-0.5">All 10 premium patches applied successfully</p>
                              <div className="mt-2 max-h-32 overflow-y-auto space-y-0.5">
                                {upgradeSteps.slice(-10).map((s, i) => (
                                  <p key={i} className="text-xs text-slate-500 font-mono">{s}</p>
                                ))}
                              </div>
                              <button
                                onClick={() => { setUpgradeDone(false); setUpgradeSteps([]); }}
                                className="mt-2 text-xs text-amber-600 underline hover:text-amber-800"
                              >
                                Re-run upgrade
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Step 3: Publish to Web */}
                    <div className="p-4 flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-orange-100 text-orange-700 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5 border border-orange-200">
                        3
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-base">🌐</span>
                          <p className="font-semibold text-slate-800 text-sm">Publish to Web</p>
                        </div>
                        <p className="text-xs text-slate-500">
                          <code className="bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">Share</code> → <code className="bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">Publish to web</code> → toggle on → copy the public link
                        </p>
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-slate-400">Then paste public link in the</span>
                          <button
                            onClick={() => setAiActiveTab("etsy")}
                            className="text-xs bg-slate-100 text-slate-600 hover:bg-orange-100 hover:text-orange-700 rounded px-1.5 py-0.5 transition-colors border border-slate-200 hover:border-orange-300"
                          >
                            📸 Real Screenshots
                          </button>
                          <span className="text-xs text-slate-400">tab below ↓</span>
                        </div>
                      </div>
                    </div>

                    {/* Step 4: Allow Duplicate */}
                    <div className="p-4 flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-orange-100 text-orange-700 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5 border border-orange-200">
                        4
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-base">📋</span>
                          <p className="font-semibold text-slate-800 text-sm">Enable &quot;Allow Duplicate&quot;</p>
                        </div>
                        <p className="text-xs text-slate-500">
                          <code className="bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">Share</code> → <code className="bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">Publish</code> → tick <code className="bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">Allow duplicate as template</code>
                        </p>
                        <div className="mt-2">
                          <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-0.5">
                            <span>✓</span> Etsy buyers click &quot;Duplicate&quot; to get their own copy
                          </span>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Footer CTA */}
                  <div className="bg-gradient-to-r from-violet-50 to-purple-50 px-5 py-3 border-t border-violet-200 flex items-center gap-2">
                    <span className="text-sm">👇</span>
                    <p className="text-xs text-violet-800">
                      Once done — go to{" "}
                      <button
                        onClick={() => setAiActiveTab("etsy")}
                        className="font-semibold underline hover:text-violet-900 transition-colors"
                      >
                        📸 Real Screenshots
                      </button>
                      {" "}tab below to auto-generate device mockup photos for your Etsy listing
                    </p>
                  </div>
                </div>
              )}

              {/* Tabs for Notion API result */}
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                {(() => {
                  const tabs: Array<{ id: typeof aiActiveTab; label: string; badge: string }> = [
                    { id: "template", label: "📋 Build Log", badge: notionBuilding ? "building..." : "" },
                  ];
                  if (qualityScore) tabs.push({ id: "quality_score", label: `${qualityScore.tierEmoji} Quality (${qualityScore.overall}%)`, badge: "" });
                  if (notionBuildResult) tabs.push({ id: "preview", label: "\uD83D\uDC41\uFE0F Preview", badge: "" });
                  if (promptOnlySteps.length > 0) tabs.push({ id: "premium_steps", label: `\u26A1 Manual Steps (${promptOnlySteps.length})`, badge: "" });
                  if (premiumChecklist) tabs.push({ id: "os_checklist", label: `🎯 OS Checklist (${premiumChecklist.score}%)`, badge: "" });
                  if (loadedPlan?.etsyListing || etsyGeneratedListing) tabs.push({ id: "etsy_pack", label: etsyListingLoading ? "🏷️ Generating..." : "🏷️ Etsy Pack", badge: etsyListingLoading ? "loading" : "" });
                  tabs.push({ id: "mockup", label: "🖼️ AI Lifestyle Mockups", badge: "" });
                  tabs.push({ id: "etsy", label: "📸 Real Screenshots", badge: "" });
                  return tabs;
                })().map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setAiActiveTab(tab.id)}
                    className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-2 ${
                      aiActiveTab === tab.id
                        ? "bg-white text-green-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {tab.label}
                    {tab.badge && (
                      <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    )}
                  </button>
                ))}
              </div>

              {/* Build Log */}
              {aiActiveTab === "template" && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-slate-200 bg-slate-50">
                    <h3 className="font-semibold text-slate-800">Build Log</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Steps taken to create your template via the Notion API
                    </p>
                  </div>
                  <div className="p-4 max-h-[400px] overflow-y-auto">
                    <div className="space-y-2">
                      {notionBuildSteps.map((step, i) => (
                        <div key={i} className="flex items-start gap-2">
                          {step.startsWith("Error") ? (
                            <span className="text-red-500 mt-0.5 flex-shrink-0">✗</span>
                          ) : (
                            <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
                          )}
                          <span className={`text-xs ${
                            step.startsWith("Error") ? "text-red-700" : "text-slate-600"
                          }`}>
                            {step}
                          </span>
                        </div>
                      ))}
                      {notionBuilding && (
                        <div className="flex items-center gap-2 mt-2">
                          <div className="w-3 h-3 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs text-green-600">Working...</span>
                        </div>
                      )}
                      {/* Retry button on build failure */}
                      {!notionBuilding && notionBuildSteps.some(s => s.startsWith("Error") || s.startsWith("❌") || s.startsWith("⏳")) && !notionBuildResult && (
                        <button
                          onClick={buildWithNotionAPI}
                          className="mt-3 px-4 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                          🔄 Retry Build
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Premium Steps (promptOnlySteps + validation) */}
              {aiActiveTab === "premium_steps" && promptOnlySteps.length > 0 && (
                <div className="space-y-4">
                  {/* Validation Score */}
                  {validationResult && (
                    <div className={`border rounded-xl p-4 ${validationResult.score >= 80 ? 'bg-green-50 border-green-200' : validationResult.score >= 50 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-slate-800 text-sm">Template Quality Score</h4>
                        <span className={`text-2xl font-bold ${validationResult.score >= 80 ? 'text-green-700' : validationResult.score >= 50 ? 'text-amber-700' : 'text-red-700'}`}>
                          {validationResult.score}/100
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                        <div
                          className={`h-2 rounded-full transition-all ${validationResult.score >= 80 ? 'bg-green-500' : validationResult.score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${validationResult.score}%` }}
                        />
                      </div>
                      {validationResult.failures.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs font-semibold text-red-700 mb-1">Issues ({validationResult.failures.length})</p>
                          {validationResult.failures.map((f, i) => (
                            <p key={i} className="text-xs text-red-600 flex items-start gap-1.5">
                              <span className="flex-shrink-0">✗</span> {f}
                            </p>
                          ))}
                        </div>
                      )}
                      {validationResult.warnings.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-amber-700 mb-1">Warnings ({validationResult.warnings.length})</p>
                          {validationResult.warnings.map((w, i) => (
                            <p key={i} className="text-xs text-amber-600 flex items-start gap-1.5">
                              <span className="flex-shrink-0">⚠</span> {w}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Prompt-Only Steps */}
                  <div className="bg-white border border-purple-200 rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50">
                      <h3 className="font-semibold text-purple-900 text-sm">Manual Premium Steps</h3>
                      <p className="text-xs text-purple-600 mt-0.5">
                        These features cannot be built via the Notion API — complete them manually in Notion for premium quality
                      </p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {promptOnlySteps.map((step, i) => (
                        <div key={i} className="p-4 flex gap-3 hover:bg-slate-50 transition-colors">
                          <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5 border border-purple-200">
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <p className="font-semibold text-slate-800 text-sm">{step.section}</p>
                              <span className="text-[10px] bg-purple-100 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5 font-medium">
                                {step.componentType}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed">{step.instruction}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* OS_ULTRA Checklist Tab */}
              {aiActiveTab === "os_checklist" && premiumChecklist && (
                <div className="space-y-4">
                  {/* Score Header */}
                  <div className={`border rounded-xl p-4 ${premiumChecklist.score >= 80 ? 'bg-blue-50 border-blue-200' : premiumChecklist.score >= 50 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-slate-800 text-sm">OS_ULTRA Checklist</h4>
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full">
                          {premiumChecklist.results.filter(r => r.passed).length}/{premiumChecklist.total}
                        </span>
                      </div>
                      <span className={`text-2xl font-bold ${premiumChecklist.score >= 80 ? 'text-blue-700' : premiumChecklist.score >= 50 ? 'text-amber-700' : 'text-red-700'}`}>
                        {premiumChecklist.score}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${premiumChecklist.score >= 80 ? 'bg-blue-500' : premiumChecklist.score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${premiumChecklist.score}%` }}
                      />
                    </div>
                  </div>

                  {/* Checklist items grouped by category */}
                  {["layout", "visual", "data", "ux", "seo"].map(category => {
                    const items = premiumChecklist.results.filter(r => r.category === category);
                    if (items.length === 0) return null;
                    const passedCount = items.filter(r => r.passed).length;
                    return (
                      <div key={category} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                        <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                          <span className="font-semibold text-sm text-slate-700 capitalize">{category}</span>
                          <span className="text-xs text-slate-500">{passedCount}/{items.length} passed</span>
                        </div>
                        <div className="divide-y divide-slate-50">
                          {items.map((item, i) => (
                            <div key={i} className="px-4 py-2 flex items-center gap-2 text-xs">
                              <span className={`text-sm ${item.passed ? 'text-green-500' : 'text-red-400'}`}>
                                {item.passed ? '✓' : '✗'}
                              </span>
                              <span className={item.passed ? 'text-slate-600' : 'text-red-600 font-medium'}>{item.rule}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Quality Score Tab */}
              {aiActiveTab === "quality_score" && qualityScore && (
                <div className="space-y-4">
                  {/* Tier Header */}
                  <div className={`border rounded-xl p-5 ${
                    qualityScore.overall >= 90 ? 'bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-300' :
                    qualityScore.overall >= 80 ? 'bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200' :
                    qualityScore.overall >= 70 ? 'bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200' :
                    qualityScore.overall >= 55 ? 'bg-gradient-to-br from-slate-50 to-gray-50 border-slate-200' :
                    'bg-gradient-to-br from-orange-50 to-red-50 border-orange-200'
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-4xl">{qualityScore.tierEmoji}</span>
                        <div>
                          <h4 className="font-bold text-lg text-slate-800">{qualityScore.tier} Tier</h4>
                          <p className="text-xs text-slate-500">Etsy Price Estimate: ${qualityScore.etsyPriceEstimate.min}–${qualityScore.etsyPriceEstimate.max}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-3xl font-bold ${
                          qualityScore.overall >= 80 ? 'text-green-600' : qualityScore.overall >= 55 ? 'text-amber-600' : 'text-red-600'
                        }`}>{qualityScore.overall}</span>
                        <span className="text-sm text-slate-400">/100</span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full transition-all ${
                          qualityScore.overall >= 90 ? 'bg-gradient-to-r from-amber-400 to-yellow-400' :
                          qualityScore.overall >= 80 ? 'bg-gradient-to-r from-purple-500 to-indigo-500' :
                          qualityScore.overall >= 70 ? 'bg-gradient-to-r from-yellow-400 to-amber-400' :
                          qualityScore.overall >= 55 ? 'bg-gradient-to-r from-slate-400 to-gray-400' :
                          'bg-gradient-to-r from-orange-400 to-red-400'
                        }`}
                        style={{ width: `${qualityScore.overall}%` }}
                      />
                    </div>
                  </div>

                  {/* Category Breakdown */}
                  {qualityScore.categories?.map((cat: { category: string; score: number; maxScore: number; items: Array<{ name: string; passed: boolean; weight: number }> }) => (
                    <div key={cat.category} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                        <span className="font-semibold text-sm text-slate-700">{cat.category}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-200 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${cat.score >= 80 ? 'bg-green-500' : cat.score >= 55 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${cat.score}%` }}
                            />
                          </div>
                          <span className={`text-xs font-bold ${cat.score >= 80 ? 'text-green-600' : cat.score >= 55 ? 'text-amber-600' : 'text-red-600'}`}>
                            {cat.score}%
                          </span>
                        </div>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {cat.items.map((item: { name: string; passed: boolean; weight: number }, i: number) => (
                          <div key={i} className="px-4 py-2 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm ${item.passed ? 'text-green-500' : 'text-red-400'}`}>
                                {item.passed ? '✓' : '✗'}
                              </span>
                              <span className={item.passed ? 'text-slate-600' : 'text-red-600 font-medium'}>{item.name}</span>
                            </div>
                            <span className="text-slate-400 text-[10px]">+{item.weight}pts</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Strengths */}
                  {qualityScore.strengths?.length > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <h4 className="font-semibold text-green-800 text-sm mb-2">💪 Strengths</h4>
                      <div className="space-y-1">
                        {qualityScore.strengths.map((s: string, i: number) => (
                          <p key={i} className="text-xs text-green-700 flex items-center gap-1.5">
                            <span className="text-green-500">✓</span> {s}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Missing for Next Tier */}
                  {qualityScore.missingForNextTier?.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <h4 className="font-semibold text-amber-800 text-sm mb-2">🎯 To Reach Next Tier</h4>
                      <div className="space-y-1">
                        {qualityScore.missingForNextTier.map((m: string, i: number) => (
                          <p key={i} className="text-xs text-amber-700 flex items-center gap-1.5">
                            <span className="text-amber-500">→</span> {m}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Preview Tab */}
              {aiActiveTab === "preview" && notionBuildResult && (() => {
                const templateName = (loadedPlan?.templateName as string) || currentTemplate?.name || "Template";
                const templateIcon = (loadedPlan?.icon as string) || currentTemplate?.icon || "\uD83D\uDCCB";
                const spec = loadedPlan || {};
                const databases = (Array.isArray(spec.databases) ? spec.databases : []) as Array<{
                  name: string; key: string; icon: string;
                  properties: Array<{ name: string; type: string; formula?: string; description?: string }>;
                  sampleData?: unknown[];
                }>;
                const subPages = (Array.isArray(spec.subPages) ? spec.subPages : []) as Array<{ name: string; icon: string }>;

                // Compute stats
                const totalDbs = databases.length;
                const totalProps = databases.reduce((sum, db) => sum + (db.properties?.length || 0), 0);
                const totalRows = databases.reduce((sum, db) => sum + (db.sampleData?.length || 0), 0);
                const formulas = databases.flatMap((db) =>
                  (db.properties || []).filter((p) => p.type === "formula").map((p) => ({
                    name: p.name,
                    formula: p.formula || "",
                    description: p.description || "",
                    dbName: db.name,
                  }))
                );
                const setupMinutes = totalDbs * 2 + Math.ceil(totalRows / 10);

                return (
                <div className="space-y-4">
                  {/* Header card */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-3xl">{templateIcon}</span>
                      <div className="flex-1">
                        <h3 className="font-bold text-slate-900 text-lg">{templateName}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium">{selectedAesthetic}</span>
                          {qualityScore && (
                            <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">{qualityScore.tierEmoji} {qualityScore.tier}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { label: "Databases", value: totalDbs, icon: "\uD83D\uDDC3\uFE0F" },
                        { label: "Properties", value: totalProps, icon: "\uD83D\uDD27" },
                        { label: "Sample Rows", value: totalRows, icon: "\uD83D\uDCCA" },
                        { label: "Formulas", value: formulas.length, icon: "\u26A1" },
                      ].map((stat) => (
                        <div key={stat.label} className="bg-slate-50 rounded-lg p-3 text-center">
                          <span className="text-lg">{stat.icon}</span>
                          <p className="text-lg font-bold text-slate-900 mt-1">{stat.value}</p>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider">{stat.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Database cards grid */}
                  {totalDbs > 0 && (
                    <div className="grid grid-cols-2 gap-3">
                      {databases.map((db) => (
                        <div key={db.key} className="bg-white border border-slate-200 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">{db.icon}</span>
                            <span className="font-semibold text-sm text-slate-800 flex-1 truncate">{db.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">{db.properties?.length || 0} props</span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">{db.sampleData?.length || 0} rows</span>
                          </div>
                          <div className="flex flex-wrap gap-1 mb-2">
                            {(db.properties || []).slice(0, 4).map((p) => (
                              <span key={p.name} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{p.name}</span>
                            ))}
                            {(db.properties?.length || 0) > 4 && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded">+{(db.properties?.length || 0) - 4}</span>
                            )}
                          </div>
                          {(db.sampleData || []).length > 0 && (
                            <div className="space-y-0.5">
                              {(db.sampleData as Array<Record<string, unknown>>).slice(0, 2).map((row, i) => {
                                const titleProp = db.properties?.find((p) => p.type === "title");
                                const titleVal = titleProp ? String(row[titleProp.name] || "") : Object.values(row)[0];
                                return <p key={i} className="text-[10px] text-slate-400 italic truncate">{String(titleVal)}</p>;
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Formula showcase */}
                  {formulas.length > 0 && (
                    <details className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <summary className="px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors">
                        <span className="font-semibold text-sm text-slate-800">{"\u26A1"} Smart Formulas ({formulas.length})</span>
                      </summary>
                      <div className="divide-y divide-slate-100">
                        {formulas.map((f, i) => (
                          <div key={i} className="px-4 py-3">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-xs text-slate-800">{f.name}</span>
                              <span className="text-[10px] text-slate-400">{f.dbName}</span>
                            </div>
                            {f.description && <p className="text-xs text-slate-500 mb-1.5">{f.description}</p>}
                            <pre className="text-[10px] bg-slate-50 text-slate-600 p-2 rounded font-mono overflow-x-auto whitespace-pre-wrap">{f.formula}</pre>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}

                  {/* Template structure tree */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Template Structure</p>
                    <div className="font-mono text-xs text-slate-700 space-y-1">
                      <p>{templateIcon} {templateName}</p>
                      {databases.map((db, i) => (
                        <p key={db.key} className="pl-4">{i < databases.length - 1 && !subPages.length ? "\u251C\u2500\u2500" : i === databases.length - 1 && !subPages.length ? "\u2514\u2500\u2500" : "\u251C\u2500\u2500"} {db.icon} {db.name}</p>
                      ))}
                      {subPages.map((sp, i) => (
                        <p key={i} className="pl-4">{i === subPages.length - 1 ? "\u2514\u2500\u2500" : "\u251C\u2500\u2500"} {sp.icon} {sp.name}</p>
                      ))}
                    </div>
                  </div>

                  {/* Buyer experience estimate */}
                  <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-4">
                    <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wider mb-3">Buyer Experience Estimate</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2">
                        <span>{"\u23F1\uFE0F"}</span>
                        <div>
                          <p className="text-xs font-semibold text-slate-800">Setup time</p>
                          <p className="text-xs text-slate-500">~{setupMinutes} minutes</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>{"\uD83D\uDCCA"}</span>
                        <div>
                          <p className="text-xs font-semibold text-slate-800">Complexity</p>
                          <p className="text-xs text-slate-500">{totalDbs > 6 ? "Advanced" : totalDbs > 3 ? "Medium" : "Simple"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>{"\uD83D\uDC8E"}</span>
                        <div>
                          <p className="text-xs font-semibold text-slate-800">Etsy tier</p>
                          <p className="text-xs text-slate-500">{qualityScore?.tier || "Gold"} (${qualityScore?.etsyPriceEstimate?.min || 5}-${qualityScore?.etsyPriceEstimate?.max || 15})</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>{"\uD83C\uDFAF"}</span>
                        <div>
                          <p className="text-xs font-semibold text-slate-800">Best for</p>
                          <p className="text-xs text-slate-500">{targetAudience || currentTemplate?.name || "Digital planners"}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                );
              })()}

              {/* Etsy Pack Tab */}
              {aiActiveTab === "etsy_pack" && (loadedPlan?.etsyListing || etsyGeneratedListing) && (() => {
                const aiListing = etsyGeneratedListing as Record<string, unknown> | null;
                const planListing = loadedPlan?.etsyListing as Record<string, unknown> | null;
                const listing = aiListing || planListing;
                const etsyTitle = String(listing?.title || 'N/A');
                const etsyDesc = String(listing?.description || 'N/A');
                const etsyTags = (Array.isArray(listing?.tags) ? listing.tags : []) as string[];
                const etsyPrice = listing?.price as { min?: number; max?: number; recommended?: number } | undefined;
                const etsyFaqs = (Array.isArray(listing?.faqs) ? listing.faqs : []) as Array<{ question: string; answer: string }>;
                const mockupScenes = (Array.isArray(loadedPlan?.mockupScenes) ? loadedPlan.mockupScenes : []) as string[];
                return (
                <div className="space-y-4">
                  {/* Export Etsy Package Button */}
                  <button
                    onClick={exportEtsyPackage}
                    className="w-full px-5 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold text-sm hover:from-amber-600 hover:to-orange-600 transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    <span className="text-lg">📦</span>
                    Export Etsy Package (ZIP)
                  </button>

                  {/* AI-Generated Badge */}
                  {aiListing && (
                    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
                      <span className="text-lg">✨</span>
                      <div>
                        <p className="text-xs font-semibold text-emerald-800">AI-Generated Etsy Listing</p>
                        <p className="text-[10px] text-emerald-600">Powered by Gemini — optimized for Etsy SEO</p>
                      </div>
                    </div>
                  )}

                  {/* Etsy Listing Info */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-orange-50 to-amber-50">
                      <h3 className="font-semibold text-amber-900 text-sm">🏷️ Etsy Listing Details</h3>
                    </div>
                    <div className="p-4 space-y-3">
                      <div>
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Title ({etsyTitle.length}/140 chars)</p>
                        <p className="text-sm font-medium text-slate-800">{etsyTitle}</p>
                      </div>
                      {etsyPrice && (
                        <div>
                          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Suggested Price</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-lg font-bold text-green-600">${etsyPrice.recommended || etsyPrice.min}</span>
                            <span className="text-xs text-slate-400">Range: ${etsyPrice.min}–${etsyPrice.max}</span>
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Description</p>
                        <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{etsyDesc}</p>
                        <button
                          onClick={() => navigator.clipboard.writeText(etsyDesc)}
                          className="mt-1 text-[10px] text-indigo-500 hover:text-indigo-700"
                        >
                          📋 Copy description
                        </button>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Tags ({etsyTags.length}/13)</p>
                        <div className="flex flex-wrap gap-1">
                          {etsyTags.map((tag: string, i: number) => (
                            <span key={i} className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] rounded-full border border-amber-200">{tag}</span>
                          ))}
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(etsyTags.join(", "))}
                          className="mt-1 text-[10px] text-indigo-500 hover:text-indigo-700"
                        >
                          📋 Copy all tags
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* FAQs */}
                  {etsyFaqs.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                        <h3 className="font-semibold text-blue-900 text-sm">❓ Listing FAQs ({etsyFaqs.length})</h3>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {etsyFaqs.map((faq, i) => (
                          <div key={i} className="p-3">
                            <p className="text-xs font-semibold text-slate-700 mb-1">Q: {faq.question}</p>
                            <p className="text-xs text-slate-500">{faq.answer}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Mockup Brief (Structured 10-Slot) */}
                  {mockupBrief && (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-fuchsia-50">
                        <h3 className="font-semibold text-violet-900 text-sm">📸 Screenshot Brief ({mockupBrief.totalSlots} Slots)</h3>
                        <p className="text-xs text-violet-600 mt-0.5">Step-by-step instructions for capturing Etsy listing images from your Notion template</p>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {mockupBrief.slots?.map((slot: { slotNumber: number; sceneName: string; purpose: string; device: string; notionViewToCapture: string; screenshotInstructions: string; framingTip: string; overlayText?: string }) => (
                          <div key={slot.slotNumber} className="p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 font-bold text-[10px] flex items-center justify-center border border-violet-200">
                                {slot.slotNumber}
                              </span>
                              <span className="font-semibold text-sm text-slate-800">{slot.sceneName}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                slot.purpose === 'thumbnail' ? 'bg-red-100 text-red-700 border border-red-200' :
                                slot.purpose === 'feature' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                                slot.purpose === 'detail' ? 'bg-green-100 text-green-700 border border-green-200' :
                                'bg-amber-100 text-amber-700 border border-amber-200'
                              }`}>{slot.purpose}</span>
                              <span className="text-[10px] text-slate-400">{slot.device}</span>
                            </div>
                            <div className="pl-8 space-y-1.5">
                              <p className="text-xs text-slate-700"><strong>View:</strong> {slot.notionViewToCapture}</p>
                              <p className="text-xs text-slate-600">{slot.screenshotInstructions}</p>
                              <p className="text-[10px] text-slate-400 italic">💡 {slot.framingTip}</p>
                              {slot.overlayText && (
                                <p className="text-[10px] text-violet-600 font-medium">Overlay: &quot;{slot.overlayText}&quot;</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* General Tips */}
                      {mockupBrief.generalTips?.length > 0 && (
                        <div className="p-4 border-t border-slate-100 bg-slate-50">
                          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">General Tips</p>
                          <div className="space-y-1">
                            {mockupBrief.generalTips.map((tip: string, i: number) => (
                              <p key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                                <span className="text-slate-400 flex-shrink-0">•</span> {tip}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mockup Scene Prompts (from plan) */}
                  {mockupScenes.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-purple-50 to-indigo-50">
                        <h3 className="font-semibold text-purple-900 text-sm">🎨 AI Mockup Prompts ({mockupScenes.length})</h3>
                        <p className="text-xs text-purple-600 mt-0.5">Copy these prompts into Midjourney or DALL-E for product photos</p>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {mockupScenes.map((scene: string, i: number) => (
                          <div key={i} className="p-3 flex items-start gap-2 hover:bg-slate-50 transition-colors">
                            <span className="text-xs text-slate-400 mt-0.5 w-5 flex-shrink-0">{i + 1}.</span>
                            <p className="text-xs text-slate-600 flex-1">{scene}</p>
                            <button
                              onClick={() => navigator.clipboard.writeText(scene)}
                              className="text-[10px] text-slate-400 hover:text-slate-700 flex-shrink-0"
                              title="Copy to clipboard"
                            >
                              📋
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                );
              })()}

              {/* Mockup Images for Notion API mode */}
              {aiActiveTab === "mockup" && (
                <div className="space-y-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-semibold text-slate-800">AI Lifestyle Mockups</h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Beautiful scene/vibe photos • For real template screenshots use the <strong>📸 Real Screenshots</strong> tab
                        </p>
                      </div>
                      <button
                        onClick={generateNotionMockups}
                        disabled={mockupGenerating}
                        className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-md disabled:opacity-60 disabled:cursor-wait transition-all"
                      >
                        {mockupGenerating ? (
                          <span className="flex items-center gap-2">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Generating {mockupLoadedCount}/{mockupImages.length || 12}...
                          </span>
                        ) : mockupImages.length > 0 ? "Regenerate 12 Mockups" : "Generate 12 Mockups"}
                      </button>
                    </div>

                    {mockupGenerating && mockupImages.length > 0 && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                          <span>{mockupGeneratingCount > 0 && <span className="text-green-600 font-medium">{mockupGeneratingCount} in progress</span>}</span>
                          <span className="font-semibold">{mockupLoadedCount}/{mockupImages.length || 12} ready</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div className="bg-gradient-to-r from-green-500 to-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${(mockupLoadedCount / (mockupImages.length || 12)) * 100}%` }} />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">12 Etsy-quality mockups. ~30-60s each, two at a time.</p>
                      </div>
                    )}
                  </div>

                  {mockupImages.length > 0 && (
                    <div className="grid grid-cols-2 gap-4">
                      {mockupImages.map((img, index) => (
                        <div key={img.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                          <div className="relative aspect-video bg-slate-50">
                            {(img.status === "pending" || img.status === "generating") && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10">
                                {img.status === "generating" ? (
                                  <div className="w-10 h-10 border-3 border-green-200 border-t-green-600 rounded-full animate-spin" />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                                    <span className="text-slate-400">{index + 1}</span>
                                  </div>
                                )}
                                <p className="text-xs text-slate-500">{img.status === "generating" ? "Generating..." : "In queue"}</p>
                              </div>
                            )}
                            {img.status === "error" && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10">
                                <span className="text-2xl">⚠️</span>
                                <p className="text-xs text-slate-500">Failed</p>
                                <button onClick={() => retryMockup(index)} className="px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700">Retry</button>
                              </div>
                            )}
                            {img.status === "loaded" && img.imageData && (
                              <img src={img.imageData} alt={img.label} className="w-full h-full object-cover" />
                            )}
                          </div>
                          <div className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <h5 className="text-xs font-semibold text-slate-800">{img.label}</h5>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${img.badgeColor}`}>{img.badge}</span>
                              </div>
                              {img.status === "loaded" && <span className="text-[10px] text-green-600 font-medium">Ready</span>}
                            </div>
                            <div className="flex gap-1.5">
                              <button onClick={() => downloadMockupImage(img)} disabled={img.status !== "loaded"} className="flex-1 py-1.5 px-2 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-40 transition-all">Download</button>
                              <button onClick={() => retryMockup(index)} disabled={img.status === "generating"} className="py-1.5 px-2 bg-slate-100 text-slate-600 text-xs rounded-lg hover:bg-slate-200 disabled:opacity-40 transition-all">Retry</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {mockupImages.length === 0 && (
                    <div className="bg-green-50 rounded-xl border border-green-200 p-5 text-center">
                      <span className="text-3xl block mb-2">🖼️</span>
                      <h4 className="font-semibold text-green-800 text-sm mb-1">Ready to generate mockups</h4>
                      <p className="text-xs text-green-600">
                        Click the button above to auto-generate 12 professional mockup images for your {currentTemplate?.name || "template"} Etsy listing.
                      </p>
                    </div>
                  )}

                  {/* ── Video Generation Section ── */}
                  {mockupLoadedCount >= 2 && (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-slate-50">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-bold text-slate-800 flex items-center gap-2">
                              🎬 <span>Etsy Video Slideshow</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">NEW</span>
                            </h4>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Create an animated WebM video from your {mockupLoadedCount} mockup images — perfect for your Etsy listing video slot
                            </p>
                          </div>
                          <button
                            onClick={generateVideo}
                            disabled={videoGenerating}
                            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-slate-700 to-slate-900 hover:from-slate-800 hover:to-black shadow-md disabled:opacity-60 disabled:cursor-wait transition-all flex items-center gap-2"
                          >
                            {videoGenerating ? (
                              <>
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                Rendering {videoProgress}%
                              </>
                            ) : videoUrl ? "🔄 Re-render Video" : "🎬 Generate Video"}
                          </button>
                        </div>
                        {videoGenerating && (
                          <div className="mt-3">
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div className="bg-gradient-to-r from-slate-600 to-slate-800 h-full rounded-full transition-all duration-300" style={{ width: `${videoProgress}%` }} />
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">Rendering at 30fps with crossfade transitions... ~{Math.round((mockupLoadedCount * 3.6) - (videoProgress / 100 * mockupLoadedCount * 3.6))}s remaining</p>
                          </div>
                        )}
                      </div>
                      {videoUrl && !videoGenerating && (
                        <div className="p-4 space-y-3">
                          <video src={videoUrl} controls className="w-full rounded-lg border border-slate-100 bg-black" style={{ maxHeight: 320 }} />
                          <div className="flex gap-2">
                            <button
                              onClick={downloadVideo}
                              className="flex-1 py-2.5 px-4 bg-gradient-to-r from-slate-700 to-slate-900 hover:from-slate-800 hover:to-black text-white text-sm font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                            >
                              ⬇️ Download for Etsy (.webm)
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-400 text-center">Upload this video to your Etsy listing &rsquo;s video slot — Etsy accepts WebM format</p>
                        </div>
                      )}
                      {!videoUrl && !videoGenerating && (
                        <div className="p-4">
                          <div className="grid grid-cols-3 gap-3 text-center">
                            <div className="bg-slate-50 rounded-lg p-3">
                              <p className="text-lg mb-1">🎞️</p>
                              <p className="text-xs font-semibold text-slate-700">{mockupLoadedCount} slides</p>
                              <p className="text-[10px] text-slate-500">3s each</p>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                              <p className="text-lg mb-1">✨</p>
                              <p className="text-xs font-semibold text-slate-700">Crossfade</p>
                              <p className="text-[10px] text-slate-500">Smooth transitions</p>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                              <p className="text-lg mb-1">📦</p>
                              <p className="text-xs font-semibold text-slate-700">1920×1080</p>
                              <p className="text-[10px] text-slate-500">HD quality</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── REAL SCREENSHOTS TAB (Notion API mode) ── */}
              {aiActiveTab === "etsy" && (
                <div className="space-y-4">
                  {/* Explanation banner */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                    <span className="text-xl flex-shrink-0">⚠️</span>
                    <div>
                      <p className="text-sm font-semibold text-amber-800">Why use Real Screenshots?</p>
                      <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                        The &ldquo;AI Lifestyle Mockups&rdquo; tab shows beautiful scene photography but with <strong>random fictional screens</strong> — not your actual template. Etsy buyers expect listings to show the <strong>exact product they&apos;re buying</strong>. Use this tab to capture your real template and put it in device frames.
                      </p>
                    </div>
                  </div>

                  {/* Step-by-step */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                    <h4 className="font-bold text-slate-800 flex items-center gap-2">
                      📸 <span>Generate Real Template Screenshots</span>
                    </h4>

                    <ol className="space-y-2 text-xs text-slate-600">
                      <li className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-green-100 text-green-700 font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                        <span>Open your built template in Notion → click <strong>Share</strong> → <strong>Publish to web</strong> → copy the public link</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-green-100 text-green-700 font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                        <span>Paste the public link below and click <strong>Capture Real Screenshots</strong></span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-green-100 text-green-700 font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                        <span>Download the device mockups — these show your <strong>actual template</strong> inside iPad and MacBook frames</span>
                      </li>
                    </ol>

                    {/* Quick link if template was just built */}
                    {notionBuildResult && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
                        <span className="text-green-600 text-lg">✅</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-green-800">Template built! Publish it to web first:</p>
                          <a href={notionBuildResult.pageUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 hover:underline truncate block">{notionBuildResult.pageUrl}</a>
                        </div>
                        <a href={notionBuildResult.pageUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 flex-shrink-0">Open →</a>
                      </div>
                    )}

                    {/* URL input + button */}
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={realScreenshotUrl}
                        onChange={(e) => setRealScreenshotUrl(e.target.value)}
                        placeholder="https://notion.so/your-published-page..."
                        className="flex-1 px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                      <button
                        onClick={generateRealScreenshots}
                        disabled={realScreenshotGenerating || !realScreenshotUrl.trim()}
                        className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white text-sm font-bold rounded-xl shadow-md disabled:opacity-50 disabled:cursor-wait transition-all flex items-center gap-2 flex-shrink-0"
                      >
                        {realScreenshotGenerating ? (
                          <>
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            Capturing...
                          </>
                        ) : "📸 Capture Real Screenshots"}
                      </button>
                    </div>

                    {realScreenshotError && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                        <p className="font-semibold mb-1">⚠️ Screenshot failed</p>
                        <p>{realScreenshotError}</p>
                        <p className="mt-1 text-red-600">Make sure the Notion page is <strong>published to web</strong> (Share → Publish to web).</p>
                      </div>
                    )}
                  </div>

                  {/* Real screenshot composites */}
                  {realScreenshots.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        <p className="text-xs font-semibold text-slate-700">Your actual template in device frames — download and use as Etsy listing photos</p>
                      </div>
                      <div className="grid grid-cols-1 gap-4">
                        {realScreenshots.map((item) => (
                          <div key={item.device} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <img src={item.screenshot} alt={item.label} className="w-full" />
                            <div className="p-3 flex items-center justify-between">
                              <div>
                                <p className="text-xs font-semibold text-slate-800">{item.label}</p>
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Real Template</span>
                              </div>
                              <button
                                onClick={() => downloadRealScreenshot(item)}
                                className="px-4 py-2 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition-all"
                              >
                                ⬇️ Download
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 text-center">✅ These images show your exact template — use these as your primary Etsy listing photos</p>
                    </div>
                  )}

                  {realScreenshots.length === 0 && !realScreenshotGenerating && !realScreenshotError && (
                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 text-center">
                      <span className="text-3xl block mb-2">📸</span>
                      <h4 className="font-semibold text-slate-700 text-sm mb-1">No screenshots yet</h4>
                      <p className="text-xs text-slate-500">Publish your template to web and paste the URL above to get started.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── AI BUILD RESULTS ── */}
          {(aiOutput || aiBuilding) && !(notionBuildSteps.length > 0 || notionBuilding) && (
            <div className="space-y-4">
              {/* Status bar */}
              <div className="flex items-center gap-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-4 border border-purple-200">
                {aiBuilding ? (
                  <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="text-xl">✅</span>
                )}
                <div className="flex-1">
                  <p className="text-sm font-semibold text-purple-800">
                    {aiBuilding
                      ? `Building with Gemini AI — Phase ${aiBuildPhase}/3...`
                      : "Template built successfully!"}
                  </p>
                  <p className="text-xs text-purple-600 mt-0.5">
                    {aiBuilding
                      ? aiBuildPhase === 1 ? "Creating template structure, databases, formulas, and demo data..."
                        : aiBuildPhase === 2 ? "Generating optimized Etsy listing..."
                        : "Finalizing..."
                      : "Copy the content below and paste it into a new Notion page"}
                  </p>
                </div>
                {!aiBuilding && aiOutput && (
                  <button
                    onClick={() => {
                      const cleanOutput = aiOutput.replace(/^🧠 Gemini AI is building your Notion template\.\.\.\n\n/, "");
                      copyToClipboard(cleanOutput, "ai-full");
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      copied === "ai-full"
                        ? "bg-green-600 text-white"
                        : "bg-purple-600 text-white hover:bg-purple-700"
                    }`}
                  >
                    {copied === "ai-full" ? "Copied!" : "📋 Copy Full Template"}
                  </button>
                )}
              </div>

              {/* Tabs for AI output */}
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                {[
                  { id: "template" as const, label: "📄 Full Template", badge: aiBuilding && aiBuildPhase === 1 ? "building..." : "" },
                  { id: "etsy" as const, label: "🏪 Etsy Listing", badge: aiBuilding && aiBuildPhase === 2 ? "building..." : "" },
                  { id: "mockup" as const, label: "🖼️ Mockup Image" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setAiActiveTab(tab.id)}
                    className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-2 ${
                      aiActiveTab === tab.id
                        ? "bg-white text-purple-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {tab.label}
                    {tab.badge && (
                      <span className="inline-block w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                    )}
                  </button>
                ))}
              </div>

              {/* Template Output */}
              {aiActiveTab === "template" && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
                    <div>
                      <h3 className="font-semibold text-slate-800">Complete Notion Template</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Copy this entire content and paste it into a new Notion page
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        const cleanOutput = aiOutput.replace(/^🧠 Gemini AI is building your Notion template\.\.\.\n\n/, "")
                          .replace(/\n\n---\n🏪 Generating Etsy listing with Claude\.\.\.\n[\s\S]*$/, "");
                        copyToClipboard(cleanOutput, "template");
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        copied === "template"
                          ? "bg-green-600 text-white"
                          : "bg-purple-600 text-white hover:bg-purple-700"
                      }`}
                    >
                      {copied === "template" ? "Copied!" : "Copy Template"}
                    </button>
                  </div>
                  <pre
                    ref={outputRef}
                    className="p-4 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-y-auto font-mono"
                  >
                    {aiOutput
                      .replace(/^🧠 Gemini AI is building your Notion template\.\.\.\n\n/, "")
                      .replace(/\n\n---\n🏪 Generating Etsy listing with Claude\.\.\.\n[\s\S]*$/, "")
                      || (aiBuilding ? "Waiting for Claude..." : "")}
                  </pre>
                  {aiBuilding && aiBuildPhase === 1 && (
                    <div className="p-3 bg-purple-50 border-t border-purple-100 flex items-center gap-2">
                      <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-purple-600">Claude is writing...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Etsy Listing Output */}
              {aiActiveTab === "etsy" && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
                    <div>
                      <h3 className="font-semibold text-slate-800">Etsy Listing</h3>
                      <p className="text-xs text-slate-500 mt-0.5">AI-generated title, tags, and description for your listing</p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(aiEtsyListing, "etsy-ai")}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        copied === "etsy-ai"
                          ? "bg-green-600 text-white"
                          : "bg-purple-600 text-white hover:bg-purple-700"
                      }`}
                    >
                      {copied === "etsy-ai" ? "Copied!" : "Copy Listing"}
                    </button>
                  </div>
                  <pre className="p-4 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-y-auto font-mono">
                    {aiEtsyListing || (aiBuilding && aiBuildPhase < 2 ? "Will be generated after template..." : aiBuilding ? "Generating..." : "No listing generated")}
                  </pre>
                  {aiBuilding && aiBuildPhase === 2 && (
                    <div className="p-3 bg-purple-50 border-t border-purple-100 flex items-center gap-2">
                      <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-purple-600">Claude is writing the Etsy listing...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Mockup Image Tab — Auto-generate with Pollinations */}
              {aiActiveTab === "mockup" && (
                <div className="space-y-4">
                  {/* Generate button */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-semibold text-slate-800">AI Mockup Images</h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Generate 12 pro mockups styled like Etsy bestsellers
                        </p>
                      </div>
                      <button
                        onClick={generateNotionMockups}
                        disabled={mockupGenerating}
                        className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-md disabled:opacity-60 disabled:cursor-wait transition-all"
                      >
                        {mockupGenerating ? (
                          <span className="flex items-center gap-2">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Generating {mockupLoadedCount}/{mockupImages.length || 12}...
                          </span>
                        ) : mockupImages.length > 0 ? "Regenerate 12 Mockups" : "Generate 12 Mockups"}
                      </button>
                    </div>

                    {/* Progress bar */}
                    {mockupGenerating && mockupImages.length > 0 && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                          <span>
                            {mockupGeneratingCount > 0 && (
                              <span className="text-purple-600 font-medium">{mockupGeneratingCount} in progress</span>
                            )}
                          </span>
                          <span className="font-semibold">{mockupLoadedCount}/{mockupImages.length || 12} ready</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${(mockupLoadedCount / (mockupImages.length || 12)) * 100}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">12 Etsy-quality mockups. ~30-60s each, two at a time.</p>
                      </div>
                    )}
                  </div>

                  {/* Generated mockup images grid */}
                  {mockupImages.length > 0 && (
                    <div className="grid grid-cols-2 gap-4">
                      {mockupImages.map((img, index) => (
                        <div key={img.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                          {/* Image area */}
                          <div className="relative aspect-video bg-slate-50">
                            {(img.status === "pending" || img.status === "generating") && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10">
                                {img.status === "generating" ? (
                                  <div className="w-10 h-10 border-3 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                                    <span className="text-slate-400">{index + 1}</span>
                                  </div>
                                )}
                                <p className="text-xs text-slate-500">{img.status === "generating" ? "Generating..." : "In queue"}</p>
                              </div>
                            )}
                            {img.status === "error" && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10">
                                <span className="text-2xl">&#9888;&#65039;</span>
                                <p className="text-xs text-slate-500">Failed</p>
                                {img.errorMsg && <p className="text-[10px] text-red-400 max-w-[200px] text-center truncate">{img.errorMsg}</p>}
                                <button onClick={() => retryMockup(index)} className="px-3 py-1 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700">Retry</button>
                              </div>
                            )}
                            {img.status === "loaded" && img.imageData && (
                              <img src={img.imageData} alt={img.label} className="w-full h-full object-cover" />
                            )}
                          </div>
                          {/* Controls */}
                          <div className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <h5 className="text-xs font-semibold text-slate-800">{img.label}</h5>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${img.badgeColor}`}>{img.badge}</span>
                              </div>
                              {img.status === "loaded" && <span className="text-[10px] text-green-600 font-medium">Ready</span>}
                            </div>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => downloadMockupImage(img)}
                                disabled={img.status !== "loaded"}
                                className="flex-1 py-1.5 px-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-all"
                              >
                                Download
                              </button>
                              <button
                                onClick={() => retryMockup(index)}
                                disabled={img.status === "generating"}
                                className="py-1.5 px-2 bg-slate-100 text-slate-600 text-xs rounded-lg hover:bg-slate-200 disabled:opacity-40 transition-all"
                              >
                                Retry
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Empty state */}
                  {mockupImages.length === 0 && (
                    <div className="bg-purple-50 rounded-xl border border-purple-200 p-5 text-center">
                      <span className="text-3xl block mb-2">&#127912;</span>
                      <h4 className="font-semibold text-purple-800 text-sm mb-1">Ready to generate mockups</h4>
                      <p className="text-xs text-purple-600">
                        Click the button above to auto-generate 12 professional mockup images for your {currentTemplate?.name || "template"} Etsy listing.
                      </p>
                    </div>
                  )}

                  {/* ── Video Generation Section (AI mode) ── */}
                  {mockupLoadedCount >= 2 && (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-slate-50">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-bold text-slate-800 flex items-center gap-2">
                              🎬 <span>Etsy Video Slideshow</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold">NEW</span>
                            </h4>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Create an animated WebM video from your {mockupLoadedCount} mockup images — perfect for your Etsy listing video slot
                            </p>
                          </div>
                          <button
                            onClick={generateVideo}
                            disabled={videoGenerating}
                            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-purple-700 to-indigo-800 hover:from-purple-800 hover:to-indigo-900 shadow-md disabled:opacity-60 disabled:cursor-wait transition-all flex items-center gap-2"
                          >
                            {videoGenerating ? (
                              <>
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                Rendering {videoProgress}%
                              </>
                            ) : videoUrl ? "🔄 Re-render Video" : "🎬 Generate Video"}
                          </button>
                        </div>
                        {videoGenerating && (
                          <div className="mt-3">
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div className="bg-gradient-to-r from-purple-500 to-indigo-600 h-full rounded-full transition-all duration-300" style={{ width: `${videoProgress}%` }} />
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">Rendering at 30fps with crossfade transitions...</p>
                          </div>
                        )}
                      </div>
                      {videoUrl && !videoGenerating && (
                        <div className="p-4 space-y-3">
                          <video src={videoUrl} controls className="w-full rounded-lg border border-slate-100 bg-black" style={{ maxHeight: 320 }} />
                          <button
                            onClick={downloadVideo}
                            className="w-full py-2.5 px-4 bg-gradient-to-r from-purple-700 to-indigo-800 hover:from-purple-800 hover:to-indigo-900 text-white text-sm font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                          >
                            ⬇️ Download for Etsy (.webm)
                          </button>
                          <p className="text-[10px] text-slate-400 text-center">Upload this video to your Etsy listing&rsquo;s video slot — Etsy accepts WebM format</p>
                        </div>
                      )}
                      {!videoUrl && !videoGenerating && (
                        <div className="p-4">
                          <div className="grid grid-cols-3 gap-3 text-center">
                            <div className="bg-slate-50 rounded-lg p-3">
                              <p className="text-lg mb-1">🎞️</p>
                              <p className="text-xs font-semibold text-slate-700">{mockupLoadedCount} slides</p>
                              <p className="text-[10px] text-slate-500">3s each</p>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                              <p className="text-lg mb-1">✨</p>
                              <p className="text-xs font-semibold text-slate-700">Crossfade</p>
                              <p className="text-[10px] text-slate-500">Smooth transitions</p>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                              <p className="text-lg mb-1">📦</p>
                              <p className="text-xs font-semibold text-slate-700">1920×1080</p>
                              <p className="text-[10px] text-slate-500">HD quality</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── STATIC PROMPTS RESULTS (old mode) ── */}
          {result && !aiOutput && (
            <div className="space-y-6">
              {/* Phase Tabs */}
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                {[
                  { n: 1, label: "Phase 1: Build Structure" },
                  { n: 2, label: "Phase 2: Fill Demo Data" },
                  { n: 3, label: "Phase 3: Polish & Finalize" },
                  { n: 4, label: "🖐️ Manual Steps" },
                  { n: 5, label: "Etsy Listing" },
                  { n: 6, label: "Mockup Image" },
                ].map((tab) => (
                  <button
                    key={tab.n}
                    onClick={() => setActivePhase(tab.n)}
                    className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                      activePhase === tab.n
                        ? "bg-white text-indigo-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Phase Content */}
              {activePhase <= 3 && (
                <div className="bg-white border border-slate-200 rounded-xl">
                  <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <div>
                      <h3 className="font-semibold text-slate-800">
                        Phase {activePhase}: {activePhase === 1 ? "Build Structure" : activePhase === 2 ? "Fill Demo Data" : "Polish & Finalize"}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">Copy this prompt and paste it into Notion AI</p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(
                        activePhase === 1 ? result.phase1 : activePhase === 2 ? result.phase2 : result.phase3,
                        `phase${activePhase}`
                      )}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        copied === `phase${activePhase}`
                          ? "bg-green-600 text-white"
                          : "bg-indigo-600 text-white hover:bg-indigo-700"
                      }`}
                    >
                      {copied === `phase${activePhase}` ? "Copied!" : "Copy Prompt"}
                    </button>
                  </div>
                  <pre className="p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto font-mono text-xs">
                    {activePhase === 1 ? result.phase1 : activePhase === 2 ? result.phase2 : result.phase3}
                  </pre>
                </div>
              )}

              {/* Manual Steps */}
              {activePhase === 4 && (
                <div className="bg-white border border-violet-200 rounded-xl overflow-hidden shadow-sm">
                  {/* Header */}
                  <div className="bg-gradient-to-r from-violet-50 to-purple-50 px-5 py-4 border-b border-violet-200 flex items-center gap-3">
                    <span className="text-2xl">✨</span>
                    <div className="flex-1">
                      <h3 className="font-bold text-violet-900 text-sm">Finish Your Template</h3>
                      <p className="text-xs text-violet-600 mt-0.5">1 auto step by tool · 2 quick manual steps in Notion</p>
                    </div>
                    <span className="bg-violet-100 text-violet-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-violet-200 flex-shrink-0">
                      3 steps total
                    </span>
                  </div>

                  {/* Steps */}
                  <div className="divide-y divide-slate-100">

                    {/* Step 1: AUTO-POLISH */}
                    <div className="p-4">
                      <div className="flex gap-3 mb-3">
                        <div className="w-7 h-7 rounded-full bg-green-100 text-green-700 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5 border border-green-200">1</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-base">✨</span>
                            <p className="font-semibold text-slate-800 text-sm">Auto-Add Icons &amp; Covers</p>
                            <span className="text-xs bg-green-100 text-green-700 border border-green-200 rounded-full px-2 py-0.5 font-semibold">AUTOMATED</span>
                          </div>
                          <p className="text-xs text-slate-500">
                            Paste your Notion page link — our tool sets emoji icons + beautiful Unsplash covers on every page automatically
                          </p>
                        </div>
                      </div>

                      {/* Auto-Polish Box */}
                      <div className="ml-10 bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-3">
                        {!polishDone ? (
                          <>
                            <p className="text-xs text-violet-700 font-medium">Paste your Notion page link (internal link, not public):</p>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={polishUrl}
                                onChange={(e) => setPolishUrl(e.target.value)}
                                placeholder="https://notion.so/your-template-page..."
                                className="flex-1 text-xs border border-violet-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 text-slate-700 placeholder-slate-400"
                              />
                              <button
                                onClick={() => runAutoPolish(polishUrl)}
                                disabled={polishRunning || !polishUrl.trim()}
                                className={`flex-shrink-0 px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                                  polishRunning
                                    ? "bg-violet-300 text-white cursor-not-allowed"
                                    : "bg-violet-600 text-white hover:bg-violet-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                }`}
                              >
                                {polishRunning ? (
                                  <>
                                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Polishing...
                                  </>
                                ) : (
                                  "✨ Auto-Polish"
                                )}
                              </button>
                            </div>
                            <p className="text-xs text-slate-400">
                              💡 Open your template in Notion → copy the URL from the browser address bar → paste above
                            </p>
                            {polishError && (
                              <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-200">❌ {polishError}</p>
                            )}
                            {polishSteps.length > 0 && (
                              <div className="bg-white border border-violet-100 rounded-lg p-3 max-h-44 overflow-y-auto space-y-1">
                                {polishSteps.map((s, i) => (
                                  <p key={i} className="text-xs text-slate-600 font-mono">{s}</p>
                                ))}
                                {polishRunning && <p className="text-xs text-violet-400 animate-pulse">Processing pages...</p>}
                              </div>
                            )}
                          </>
                        ) : polishSteps.some(s => s.includes("❌")) ? (
                          <div className="flex items-start gap-3">
                            <span className="text-2xl">⚠️</span>
                            <div className="flex-1">
                              <p className="text-sm font-bold text-red-700">Something went wrong</p>
                              <p className="text-xs text-red-500 mt-0.5">Make sure the page is shared with your Notion integration</p>
                              <div className="mt-2 max-h-32 overflow-y-auto space-y-0.5 bg-white border border-red-100 rounded-lg p-2">
                                {polishSteps.map((s, i) => (
                                  <p key={i} className={`text-xs font-mono ${s.includes("❌") ? "text-red-600" : "text-slate-500"}`}>{s}</p>
                                ))}
                              </div>
                              <p className="text-xs text-slate-500 mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2">
                                💡 In Notion: open the page → click <strong>...</strong> → <strong>Connect to</strong> → select <strong>CraftPlan</strong> integration, then try again
                              </p>
                              <button
                                onClick={() => { setPolishDone(false); setPolishSteps([]); setPolishError(""); }}
                                className="mt-2 text-xs text-violet-600 underline hover:text-violet-800"
                              >
                                Try again
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-3">
                            <span className="text-2xl">🎉</span>
                            <div className="flex-1">
                              <p className="text-sm font-bold text-green-800">All pages polished!</p>
                              <p className="text-xs text-green-600 mt-0.5">Every page now has an icon + cover image from Unsplash</p>
                              <div className="mt-2 max-h-32 overflow-y-auto space-y-0.5 bg-white border border-green-100 rounded-lg p-2">
                                {polishSteps.map((s, i) => (
                                  <p key={i} className="text-xs text-slate-500 font-mono">{s}</p>
                                ))}
                              </div>
                              <button
                                onClick={() => { setPolishDone(false); setPolishSteps([]); setPolishUrl(""); }}
                                className="mt-2 text-xs text-violet-600 underline hover:text-violet-800"
                              >
                                Run again on a different page
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Step 2: Publish to Web */}
                    <div className="p-4 flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-orange-100 text-orange-700 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5 border border-orange-200">2</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-base">🌐</span>
                          <p className="font-semibold text-slate-800 text-sm">Publish to Web</p>
                        </div>
                        <p className="text-xs text-slate-500">
                          <code className="bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">Share</code> → <code className="bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">Publish to web</code> → toggle on → copy public link
                        </p>
                        <div className="mt-2 p-2.5 bg-indigo-50 rounded-lg border border-indigo-100">
                          <p className="text-xs text-indigo-700">📸 Then paste that public link in the <strong>Notion Builder → Real Screenshots</strong> tab to auto-generate Etsy device photos</p>
                        </div>
                      </div>
                    </div>

                    {/* Step 3: Allow Duplicate */}
                    <div className="p-4 flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-orange-100 text-orange-700 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5 border border-orange-200">3</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-base">📋</span>
                          <p className="font-semibold text-slate-800 text-sm">Enable &quot;Allow Duplicate&quot;</p>
                        </div>
                        <p className="text-xs text-slate-500">
                          <code className="bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">Share</code> → <code className="bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">Publish</code> → tick <code className="bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">Allow duplicate as template</code>
                        </p>
                        <div className="mt-2">
                          <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-0.5">
                            <span>✓</span> Etsy buyers click &quot;Duplicate&quot; to get their own copy
                          </span>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Footer */}
                  <div className="bg-gradient-to-r from-violet-50 to-purple-50 px-5 py-3 border-t border-violet-200 flex items-center gap-2">
                    <span className="text-sm">✅</span>
                    <p className="text-xs text-violet-800 font-medium">
                      Once done → go to <strong>Etsy Listing</strong> tab to copy title, tags &amp; description
                    </p>
                    <button
                      onClick={() => setActivePhase(5)}
                      className="ml-auto text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-violet-700 transition-colors flex-shrink-0"
                    >
                      Etsy Listing →
                    </button>
                  </div>
                </div>
              )}

              {/* Etsy Listing */}
              {activePhase === 5 && (
                <div className="space-y-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-slate-800">Etsy Title</h4>
                      <button
                        onClick={() => copyToClipboard(result.etsyTitle, "title")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          copied === "title" ? "bg-green-600 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700"
                        }`}
                      >
                        {copied === "title" ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">{result.etsyTitle}</p>
                    <p className="text-xs text-slate-400 mt-1">{result.etsyTitle.length}/140 characters</p>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-slate-800">Etsy Tags ({result.etsyTags.length}/13)</h4>
                      <button
                        onClick={() => copyToClipboard(result.etsyTags.join(", "), "tags")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          copied === "tags" ? "bg-green-600 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700"
                        }`}
                      >
                        {copied === "tags" ? "Copied!" : "Copy All"}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {result.etsyTags.map((tag, i) => (
                        <span key={i} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-slate-800">Etsy Description</h4>
                      <button
                        onClick={() => copyToClipboard(result.etsyDescription, "desc")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          copied === "desc" ? "bg-green-600 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700"
                        }`}
                      >
                        {copied === "desc" ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <pre className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto bg-slate-50 p-4 rounded-lg">
                      {result.etsyDescription}
                    </pre>
                  </div>
                </div>
              )}

              {/* Mockup Image — Auto-generate */}
              {activePhase === 6 && (
                <div className="space-y-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-semibold text-slate-800">AI Mockup Images</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Generate 12 pro mockups styled like Etsy bestsellers</p>
                      </div>
                      <button
                        onClick={generateNotionMockups}
                        disabled={mockupGenerating}
                        className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-md disabled:opacity-60 disabled:cursor-wait transition-all"
                      >
                        {mockupGenerating ? (
                          <span className="flex items-center gap-2">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Generating {mockupLoadedCount}/{mockupImages.length || 12}...
                          </span>
                        ) : mockupImages.length > 0 ? "Regenerate 12 Mockups" : "Generate 12 Mockups"}
                      </button>
                    </div>

                    {mockupGenerating && mockupImages.length > 0 && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                          <span>{mockupGeneratingCount > 0 && <span className="text-indigo-600 font-medium">{mockupGeneratingCount} in progress</span>}</span>
                          <span className="font-semibold">{mockupLoadedCount}/{mockupImages.length || 12} ready</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-500" style={{ width: `${(mockupLoadedCount / (mockupImages.length || 12)) * 100}%` }} />
                        </div>
                      </div>
                    )}
                  </div>

                  {mockupImages.length > 0 && (
                    <div className="grid grid-cols-2 gap-4">
                      {mockupImages.map((img, index) => (
                        <div key={img.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                          <div className="relative aspect-video bg-slate-50">
                            {(img.status === "pending" || img.status === "generating") && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10">
                                {img.status === "generating" ? (
                                  <div className="w-10 h-10 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center"><span className="text-slate-400">{index + 1}</span></div>
                                )}
                                <p className="text-xs text-slate-500">{img.status === "generating" ? "Generating..." : "In queue"}</p>
                              </div>
                            )}
                            {img.status === "error" && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10">
                                <span className="text-2xl">&#9888;&#65039;</span>
                                <p className="text-xs text-slate-500">Failed</p>
                                <button onClick={() => retryMockup(index)} className="px-3 py-1 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Retry</button>
                              </div>
                            )}
                            {img.status === "loaded" && img.imageData && (
                              <img src={img.imageData} alt={img.label} className="w-full h-full object-cover" />
                            )}
                          </div>
                          <div className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <h5 className="text-xs font-semibold text-slate-800">{img.label}</h5>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${img.badgeColor}`}>{img.badge}</span>
                              </div>
                              {img.status === "loaded" && <span className="text-[10px] text-green-600 font-medium">Ready</span>}
                            </div>
                            <div className="flex gap-1.5">
                              <button onClick={() => downloadMockupImage(img)} disabled={img.status !== "loaded"} className="flex-1 py-1.5 px-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-all">Download</button>
                              <button onClick={() => retryMockup(index)} disabled={img.status === "generating"} className="py-1.5 px-2 bg-slate-100 text-slate-600 text-xs rounded-lg hover:bg-slate-200 disabled:opacity-40 transition-all">Retry</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {mockupImages.length === 0 && (
                    <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-5 text-center">
                      <span className="text-3xl block mb-2">&#127912;</span>
                      <h4 className="font-semibold text-indigo-800 text-sm mb-1">Ready to generate mockups</h4>
                      <p className="text-xs text-indigo-600">Click the button above to auto-generate 12 professional mockup images.</p>
                    </div>
                  )}

                  {/* ── Video Generation Section (Prompts mode) ── */}
                  {mockupLoadedCount >= 2 && (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-slate-50">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-bold text-slate-800 flex items-center gap-2">
                              🎬 <span>Etsy Video Slideshow</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">NEW</span>
                            </h4>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Create an animated WebM video from your {mockupLoadedCount} mockup images — perfect for your Etsy listing video slot
                            </p>
                          </div>
                          <button
                            onClick={generateVideo}
                            disabled={videoGenerating}
                            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-700 hover:from-indigo-700 hover:to-purple-800 shadow-md disabled:opacity-60 disabled:cursor-wait transition-all flex items-center gap-2"
                          >
                            {videoGenerating ? (
                              <>
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                Rendering {videoProgress}%
                              </>
                            ) : videoUrl ? "🔄 Re-render Video" : "🎬 Generate Video"}
                          </button>
                        </div>
                        {videoGenerating && (
                          <div className="mt-3">
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div className="bg-gradient-to-r from-indigo-500 to-purple-600 h-full rounded-full transition-all duration-300" style={{ width: `${videoProgress}%` }} />
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">Rendering at 30fps with crossfade transitions...</p>
                          </div>
                        )}
                      </div>
                      {videoUrl && !videoGenerating && (
                        <div className="p-4 space-y-3">
                          <video src={videoUrl} controls className="w-full rounded-lg border border-slate-100 bg-black" style={{ maxHeight: 320 }} />
                          <button
                            onClick={downloadVideo}
                            className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-purple-700 hover:from-indigo-700 hover:to-purple-800 text-white text-sm font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                          >
                            ⬇️ Download for Etsy (.webm)
                          </button>
                          <p className="text-[10px] text-slate-400 text-center">Upload this video to your Etsy listing&rsquo;s video slot — Etsy accepts WebM format</p>
                        </div>
                      )}
                      {!videoUrl && !videoGenerating && (
                        <div className="p-4">
                          <div className="grid grid-cols-3 gap-3 text-center">
                            <div className="bg-slate-50 rounded-lg p-3">
                              <p className="text-lg mb-1">🎞️</p>
                              <p className="text-xs font-semibold text-slate-700">{mockupLoadedCount} slides</p>
                              <p className="text-[10px] text-slate-500">3s each</p>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                              <p className="text-lg mb-1">✨</p>
                              <p className="text-xs font-semibold text-slate-700">Crossfade</p>
                              <p className="text-[10px] text-slate-500">Smooth transitions</p>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                              <p className="text-lg mb-1">📦</p>
                              <p className="text-xs font-semibold text-slate-700">1920×1080</p>
                              <p className="text-[10px] text-slate-500">HD quality</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function NotionBuilderPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-gray-400">Loading...</div>}>
      <NotionBuilderInner />
    </Suspense>
  );
}
