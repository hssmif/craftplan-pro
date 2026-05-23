// ── Notion Template Specs ──────────────────────────────────
// Randomized template generation system — each build produces a UNIQUE template
// Features: name pools, varied sample data, section shuffling, formula properties

import { applyPropertyDescriptions } from "./property-descriptions";

// ── Types ──

export interface SelectOption {
  name: string;
  color: string;
}

export interface DatabaseProperty {
  name: string;
  type: "title" | "rich_text" | "number" | "select" | "multi_select" | "date" | "checkbox" | "url" | "email" | "formula" | "relation" | "rollup" | "created_time" | "last_edited_time";
  description?: string; // Human-readable help text shown as tooltip in Notion
  options?: SelectOption[];
  numberFormat?: string;
  formula?: string;
  relationDbKey?: string;
  rollupRelation?: string;
  rollupProperty?: string;
  rollupFunction?: string;
}

export interface DatabaseSpec {
  key: string;
  name: string;
  icon: string;
  properties: DatabaseProperty[];
  sampleData: Record<string, unknown>[];
}

export interface BlockSpec {
  type: "heading_1" | "heading_2" | "heading_3" | "paragraph" | "callout" | "divider" | "to_do" | "toggle" | "bulleted_list_item" | "numbered_list_item" | "quote" | "column_list" | "column" | "table_of_contents" | "bookmark" | "embed" | "table" | "linked_database";
  text?: string;
  icon?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  children?: BlockSpec[];
  checked?: boolean;
  url?: string;
  columns?: BlockSpec[][];
  tableWidth?: number;
  tableRows?: string[][];
  hasColumnHeader?: boolean;
  /** Reference to a database key — used by linked_database blocks to create inline views */
  databaseKey?: string;
}

export interface PageSpec {
  name: string;
  icon: string;
  cover?: string; // Unsplash URL for sub-page cover image
  blocks: BlockSpec[];
}

export interface TemplateSection {
  /** Unique key for this section (e.g., "capture_process") */
  key: string;
  /** Display name (e.g., "Capture & Process") */
  name: string;
  /** Section icon emoji */
  icon: string;
  /** Description shown on dashboard card and section page callout */
  description: string;
  /** Database keys that belong in this section (references DatabaseSpec.key) */
  databaseKeys: string[];
  /** Optional cover image URL for the section sub-page */
  cover?: string;
  /** Optional pro tips shown at the bottom of the section sub-page */
  tips?: string[];
  /** Recommended view setups for the section page (e.g., "Board view grouped by Status") */
  viewSuggestions?: string[];
}

export interface NotionTemplateSpec {
  id: string;
  name: string;
  icon: string;
  cover?: string;
  description: string;
  dashboardBlocks: BlockSpec[];   // Root dashboard blocks (hub content, section cards)
  footerBlocks?: BlockSpec[];     // Content AFTER section cards (setup guides, emergency mode)
  databases: DatabaseSpec[];
  subPages: PageSpec[];
  /** Hub-style section groupings. When present, databases are created inside
   *  section sub-pages instead of on the root dashboard page. */
  sections?: TemplateSection[];
}

// ── Color palettes per aesthetic ──
export const AESTHETIC_COLORS: Record<string, { primary: string; secondary: string; accent: string; selectColors: string[] }> = {
  minimal: { primary: "default", secondary: "gray", accent: "blue", selectColors: ["gray", "default", "blue", "green", "red"] },
  brown: { primary: "brown", secondary: "orange", accent: "yellow", selectColors: ["brown", "orange", "yellow", "default", "red"] },
  pink: { primary: "pink", secondary: "red", accent: "purple", selectColors: ["pink", "red", "purple", "default", "orange"] },
  dark: { primary: "blue", secondary: "purple", accent: "gray", selectColors: ["blue", "purple", "gray", "default", "green"] },
  sage: { primary: "green", secondary: "default", accent: "brown", selectColors: ["green", "default", "brown", "yellow", "gray"] },
  pastel: { primary: "purple", secondary: "blue", accent: "pink", selectColors: ["purple", "blue", "pink", "orange", "green"] },
  mono: { primary: "blue", secondary: "default", accent: "gray", selectColors: ["blue", "default", "gray", "red", "green"] },
  os_dark: { primary: "blue", secondary: "purple", accent: "gray", selectColors: ["blue", "purple", "gray", "default", "green"] },
};

// ── Premium dark cover images per template type ──
const COVER_IMAGES: Record<string, string[]> = {
  adhd_planner: [
    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1500&q=80",
    "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1500&q=80",
    "https://images.unsplash.com/photo-1534972195531-d756b9bfa9f2?w=1500&q=80",
  ],
  finance_tracker: [
    "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1500&q=80",
    "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=1500&q=80",
    "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1500&q=80",
  ],
  life_os: [
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1500&q=80",
    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1500&q=80",
    "https://images.unsplash.com/photo-1534972195531-d756b9bfa9f2?w=1500&q=80",
  ],
  life_planner: [
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1500&q=80",
    "https://images.unsplash.com/photo-1636955779321-819753cd1741?w=1500&q=80",
    "https://images.unsplash.com/photo-1614854262318-831574f15f1f?w=1500&q=80",
  ],
  social_media_planner: [
    "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=1500&q=80",
    "https://images.unsplash.com/photo-1533750516457-a7f992034fec?w=1500&q=80",
    "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1500&q=80",
  ],
  student_planner: [
    "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=1500&q=80",
  ],
  habit_tracker: [
    "https://images.unsplash.com/photo-1614854262318-831574f15f1f?w=1500&q=80",
    "https://images.unsplash.com/photo-1636955779321-819753cd1741?w=1500&q=80",
  ],
  small_business_hub: [
    "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1500&q=80",
  ],
  debt_snowball: [
    "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1500&q=80",
  ],
};

// ── Randomization Helpers ──
function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}
function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function getCover(templateId: string): string {
  const pool = COVER_IMAGES[templateId];
  return pool ? pickOne(pool) : "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1500&q=80";
}

function getColors(aesthetic: string): string[] {
  return AESTHETIC_COLORS[aesthetic]?.selectColors || AESTHETIC_COLORS.minimal.selectColors;
}

// ── Date Helpers ──
function getFutureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
}

function getPastDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

function getFirstOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().split("T")[0];
}

// ── Callout Helper — guarantees valid icon for Notion API ──
/** Creates a callout BlockSpec that always has a valid icon emoji.
 *  Use this everywhere instead of manual { type: "callout", ... } to prevent
 *  Notion API errors ("callout.icon.emoji should be defined"). */
export function createCallout(
  text: string,
  emoji: string = "💡",
  opts: { color?: string; bold?: boolean } = {},
): BlockSpec {
  return {
    type: "callout",
    text,
    icon: emoji || "💡",
    color: opts.color || "blue_background",
    bold: opts.bold,
  };
}

// ── Navigation Cards Builder (premium hub-style dashboard) ──
/** Generates premium 2-column navigation cards with system stats for the root dashboard */
function buildSectionCards(
  sections: TemplateSection[],
  databases: DatabaseSpec[],
  palette: { primary: string; secondary: string; accent: string },
): BlockSpec[] {
  const dbMap = Object.fromEntries(databases.map(d => [d.key, d]));
  const colorCycle = [palette.accent, palette.primary, palette.secondary, palette.accent];

  // Compute system stats for overview
  const dbCount = databases.length;
  const propCount = databases.reduce((sum, db) => sum + db.properties.length, 0);
  const formulaCount = databases.reduce((sum, db) => sum + db.properties.filter(p => p.type === "formula").length, 0);
  const sampleCount = databases.reduce((sum, db) => sum + db.sampleData.length, 0);
  const relationCount = databases.reduce((sum, db) => sum + db.properties.filter(p => p.type === "relation").length, 0);

  const blocks: BlockSpec[] = [
    { type: "divider" },
    { type: "heading_2", text: "🗂️ Your Workspaces" },
    createCallout(`📦 ${dbCount} databases · ${propCount}+ properties · ${formulaCount} auto-formulas · ${relationCount} connections · ${sampleCount} sample entries pre-loaded`, "📦", { color: `${palette.secondary}_background`, bold: true }),
  ];

  for (let i = 0; i < sections.length; i += 2) {
    const columns: BlockSpec[][] = [];

    const buildCard = (section: TemplateSection, colorIdx: number): BlockSpec => {
      const sectionDbs = section.databaseKeys
        .map(k => dbMap[k])
        .filter(Boolean);
      const dbLines = sectionDbs
        .map(d => `   ${d.icon}  ${d.name}`)
        .join("\n");
      const sectionDbCount = sectionDbs.length;
      return createCallout(
        `${section.icon}  ${section.name.toUpperCase()}\n\n${section.description}\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n📂 ${sectionDbCount} database${sectionDbCount !== 1 ? "s" : ""}:\n${dbLines}\n\n→ Open workspace`,
        section.icon,
        { color: `${colorCycle[colorIdx % colorCycle.length]}_background`, bold: true },
      );
    };

    columns.push([buildCard(sections[i], i)]);
    if (i + 1 < sections.length) {
      columns.push([buildCard(sections[i + 1], i + 1)]);
    }

    blocks.push({ type: "column_list", columns });
  }

  blocks.push({ type: "divider" });

  return blocks;
}

// ── Command Center Builder (product-style action buttons) ──
/** Generates ⚡ Command Center as a grid of product-style action buttons */
function buildCommandCenter(
  actions: { icon: string; label: string; description: string }[],
  palette: { primary: string; secondary: string; accent: string },
): BlockSpec[] {
  const colorCycle = [palette.accent, palette.primary, palette.secondary, palette.accent, palette.primary];
  const blocks: BlockSpec[] = [
    { type: "heading_2", text: "⚡ Command Center" },
  ];

  for (let i = 0; i < actions.length; i += 3) {
    const batch = actions.slice(i, i + 3);
    const columns: BlockSpec[][] = batch.map((a, j) => [
      createCallout(`${a.label}\n\n${a.description}`, a.icon, { color: `${colorCycle[(i + j) % colorCycle.length]}_background`, bold: true }),
    ]);
    blocks.push({ type: "column_list", columns });
  }

  return blocks;
}

// ── Daily Ritual Builder (functional today dashboard) ──
/** Generates 📅 Today as working morning/evening checklists + quick capture zone */
function buildDailyRitual(
  morningTasks: string[],
  eveningTasks: string[],
  quickCapture: { title: string; icon: string; items: string[] },
  palette: { primary: string; secondary: string; accent: string },
): BlockSpec[] {
  return [
    { type: "heading_2", text: "📅 Today" },
    { type: "column_list", columns: [
      [
        createCallout("☀️ MORNING", "☀️", { color: `${palette.accent}_background`, bold: true }),
        ...morningTasks.map(t => ({ type: "to_do" as const, text: t, checked: false })),
      ],
      [
        createCallout("🌙 EVENING", "🌙", { color: `${palette.secondary}_background`, bold: true }),
        ...eveningTasks.map(t => ({ type: "to_do" as const, text: t, checked: false })),
      ],
    ]},
    { type: "toggle", text: `${quickCapture.icon} ${quickCapture.title}`, children: [
      ...quickCapture.items.map(item => ({ type: "to_do" as const, text: item, checked: false })),
    ]},
  ];
}

// ═══════════════════════════════════════════════════════════
// NAME & CONTENT POOLS — Every generation picks randomly
// ═══════════════════════════════════════════════════════════

const ADHD_NAMES = [
  "ADHD Brain OS", "ADHD Focus System", "ADHD Life Dashboard", "ADHD Planner Pro",
  "ADHD Command Center", "Neurodivergent Life Hub", "ADHD Productivity Suite",
  "Focus Flow Planner", "ADHD Clarity System", "The ADHD Toolkit",
];
const ADHD_TAGLINES = [
  "Built for brains that work differently. Less friction, more action.",
  "Your external brain — organized, visual, and ADHD-optimized.",
  "Stop fighting your brain. Start working with it.",
  "Designed for focus, built for chaos. Your ADHD superpower system.",
  "Everything in one place. No overwhelm. Just clarity.",
  "The planner that actually works for ADHD minds.",
];
const ADHD_ICONS = ["🧠", "⚡", "🎯", "🚀", "💡", "🔥"];

const FINANCE_NAMES = [
  "Money Command Center", "Financial Freedom Tracker", "Budget Boss Dashboard",
  "Wealth Builder System", "Smart Money Planner", "Personal Finance Hub",
  "Money Flow Dashboard", "Budget & Beyond", "Financial Clarity System", "Cash Flow Control",
];
const FINANCE_TAGLINES = [
  "See exactly where every dollar goes. Build wealth on autopilot.",
  "Your complete financial picture — income, expenses, savings, and debt — in one dashboard.",
  "Stop guessing. Start growing. Your money, fully organized.",
  "Track it. Budget it. Save it. Build the life you want.",
  "Financial clarity in 5 minutes a day. No spreadsheets needed.",
];
const FINANCE_ICONS = ["💰", "📊", "💵", "🏦", "📈", "💎"];

const LIFE_NAMES = [
  "Life OS Dashboard", "All-in-One Life Planner", "Life Command Center",
  "The Life Design System", "My Life Hub", "360° Life Planner",
  "Life Balance Dashboard", "Personal Growth System", "Life Mastery Planner", "The Everything Planner",
];
const LIFE_TAGLINES = [
  "Every area of your life, beautifully organized in one place.",
  "Goals, habits, journal, tasks — your entire life system.",
  "Design the life you want. Track the progress you make.",
  "From big dreams to daily actions. Your life, your system.",
  "One planner to rule them all. Simple, powerful, and beautiful.",
];
const LIFE_ICONS = ["🌟", "✨", "🎯", "💫"];

const SOCIAL_MEDIA_NAMES = [
  "Content Command Center", "Social Media HQ", "Creator Studio Dashboard",
  "Content Engine", "Brand Hub", "Social Strategy System",
  "Creator's Toolkit", "Content Planner Pro", "Social Growth Dashboard", "The Content OS",
];
const SOCIAL_MEDIA_TAGLINES = [
  "Plan. Create. Analyze. Grow.",
  "Your social media brain, beautifully organized.",
  "From content idea to viral post — all in one dashboard.",
  "Stop posting randomly. Start growing strategically.",
  "Every platform, every campaign, every metric — one system.",
];
const SOCIAL_MEDIA_ICONS = ["📱", "🎬", "📸", "🎨", "✨", "🚀"];

// ═══════════════════════════════════════════════════════════
// SAMPLE DATA POOLS — Large pools, pick random subsets
// ═══════════════════════════════════════════════════════════

const TASK_POOL = [
  // Work tasks
  { name: "Finish Q1 quarterly report", energy: "High Energy", priority: "Urgent", status: "In Progress", notes: "Pull metrics from dashboard, due Friday", due: 3 },
  { name: "Prepare client presentation deck", energy: "High Energy", priority: "High", status: "In Progress", notes: "15 slides max — focus on ROI story", due: 5 },
  { name: "Reply to team Slack messages", energy: "Low Energy", priority: "Urgent", status: "Done", notes: "Batch process — set 15-min timer", due: 0 },
  { name: "Review PR from junior developer", energy: "Medium Energy", priority: "High", status: "Not Started", notes: "Focus on error handling and tests", due: 2 },
  // Personal tasks
  { name: "Deep clean apartment", energy: "Medium Energy", priority: "Medium", status: "Not Started", notes: "Kitchen + bathroom. Buy supplies first", due: 2 },
  { name: "Schedule dentist appointment", energy: "Low Energy", priority: "Medium", status: "Not Started", notes: "Haven't been in 8 months — overdue", due: 4 },
  { name: "Renew passport", energy: "Medium Energy", priority: "High", status: "Blocked", notes: "Need new photos first. CVS has $14.99 option", due: 14 },
  { name: "Buy birthday gift for Mom", energy: "Low Energy", priority: "Urgent", status: "Not Started", notes: "She mentioned wanting that cookbook", due: 3 },
  // Health tasks
  { name: "Meal prep for the week", energy: "Medium Energy", priority: "Medium", status: "Not Started", notes: "Chicken + rice bowls, overnight oats", due: 1 },
  { name: "Run 5K (training day 12)", energy: "High Energy", priority: "Medium", status: "Done", notes: "29:42 — new personal best!", due: -1 },
  { name: "Book yoga class for Saturday", energy: "Low Energy", priority: "Low", status: "Not Started", notes: "CorePower 9am class fills up fast", due: 2 },
  // Growth tasks
  { name: "Finish online UX course (Module 5)", energy: "High Energy", priority: "Medium", status: "In Progress", notes: "45 min video + portfolio project", due: 7 },
  { name: "Read 20 pages of current book", energy: "Low Energy", priority: "Low", status: "Done", notes: "Four Thousand Weeks — incredible chapter on time", due: -2 },
  { name: "Practice Spanish on Duolingo", energy: "Low Energy", priority: "Low", status: "Not Started", notes: "Day 45 streak at risk!", due: 0 },
  { name: "Write journal entry", energy: "Low Energy", priority: "Medium", status: "Not Started", notes: "Process the career conversation from Monday", due: 1 },
  { name: "Update LinkedIn profile", energy: "Medium Energy", priority: "High", status: "Not Started", notes: "Add new project + skills section", due: 10 },
];

const HABIT_POOL = [
  { name: "Morning meditation", cat: "Mindfulness", freq: "Daily", streak: 12, best: 21 },
  { name: "10-minute walk", cat: "Health", freq: "Daily", streak: 8, best: 30 },
  { name: "Read 20 pages", cat: "Learning", freq: "Daily", streak: 5, best: 14 },
  { name: "Drink 8 glasses of water", cat: "Health", freq: "Daily", streak: 18, best: 45 },
  { name: "Journal before bed", cat: "Mindfulness", freq: "Daily", streak: 3, best: 10 },
  { name: "No phone first 30 min", cat: "Productivity", freq: "Daily", streak: 7, best: 12 },
  { name: "Stretch routine", cat: "Health", freq: "Daily", streak: 15, best: 25 },
  { name: "Practice gratitude", cat: "Mindfulness", freq: "Daily", streak: 22, best: 22 },
  { name: "Tidy workspace", cat: "Productivity", freq: "Weekdays", streak: 4, best: 8 },
  { name: "Take vitamins", cat: "Health", freq: "Daily", streak: 30, best: 60 },
  { name: "Cold shower", cat: "Self-Care", freq: "Daily", streak: 6, best: 10 },
  { name: "Deep breathing (5 min)", cat: "Mindfulness", freq: "Daily", streak: 9, best: 15 },
  { name: "Plan tomorrow", cat: "Productivity", freq: "Weekdays", streak: 11, best: 20 },
  { name: "Skin care routine", cat: "Self-Care", freq: "Daily", streak: 25, best: 40 },
  { name: "Workout (30 min)", cat: "Health", freq: "3x/week", streak: 3, best: 8 },
  { name: "Digital detox hour", cat: "Self-Care", freq: "Daily", streak: 2, best: 7 },
];

const GOAL_POOL = [
  { name: "Run a Half Marathon", area: "Health", progress: 45, status: "Active" },
  { name: "Get Promoted to Senior", area: "Career", progress: 60, status: "Active" },
  { name: "Read 24 Books This Year", area: "Personal Growth", progress: 33, status: "Active" },
  { name: "Save $10K Emergency Fund", area: "Finances", progress: 68, status: "Active" },
  { name: "Learn Conversational Spanish", area: "Personal Growth", progress: 20, status: "Active" },
  { name: "Meditate 100 Days Straight", area: "Health", progress: 75, status: "Active" },
  { name: "Launch Side Project Blog", area: "Career", progress: 15, status: "Planning" },
  { name: "Declutter Entire Apartment", area: "Personal Growth", progress: 90, status: "Active" },
];

const BRAIN_DUMP_POOL = [
  { thought: "Need to research new project management tools", cat: "Task", action: true },
  { thought: "What if I started a podcast about productivity?", cat: "Idea", action: false },
  { thought: "Remember to ask about the team meeting change", cat: "Task", action: true },
  { thought: "Worried about the deadline next week", cat: "Worry", action: true },
  { thought: "New idea: morning routine app concept", cat: "Idea", action: false },
  { thought: "Need to fix the leaking faucet", cat: "Task", action: true },
  { thought: "Maybe I should learn Python", cat: "Idea", action: false },
  { thought: "Birthday party planning for Sarah", cat: "Task", action: true },
  { thought: "Thinking about career direction", cat: "Random", action: false },
  { thought: "Should I switch to a standing desk?", cat: "Random", action: false },
  { thought: "Great article idea: ADHD tips for remote work", cat: "Idea", action: false },
  { thought: "Groceries: milk, eggs, bread, avocados", cat: "Task", action: true },
  { thought: "That meditation app ad looked interesting — check later", cat: "Note", action: false },
  { thought: "Am I drinking enough water? Feel foggy today", cat: "Worry", action: true },
  { thought: "Concept: body double matching app for remote workers", cat: "Idea", action: false },
  { thought: "Cancel that free trial before it charges tomorrow!", cat: "Task", action: true },
];

const JOURNAL_POOL = [
  { mood: "Great", energy: "High", wins: "Nailed the client presentation — they signed the proposal on the spot! Months of prep paid off.", challenges: "Stayed up too late celebrating. Need to protect my sleep schedule even on good days.", gratitude: "My team for backing me up during the Q&A. Couldn't have done it alone." },
  { mood: "Good", energy: "Medium", wins: "Kept my morning routine intact despite a rough start. 20 pages read + meditation done.", challenges: "Inbox anxiety hit hard after lunch. 47 unread emails felt paralyzing.", gratitude: "The quiet 10 minutes with coffee before the world woke up." },
  { mood: "Okay", energy: "Low", wins: "Showed up for the run even though every part of me wanted to skip.", challenges: "Career doubts creeping in again. Had the 'am I in the right field?' spiral.", gratitude: "Warm sunshine on the trail. Simple but enough." },
  { mood: "Great", energy: "High", wins: "Saturday hike to Eagle Creek Falls — 8 miles! New personal best distance. Photos turned out incredible.", challenges: "Sore legs made evening plans tough. Need better recovery habits.", gratitude: "Friends who drag me outside when I'd rather stay in. The view from the waterfall was unreal." },
  { mood: "Low", energy: "Low", wins: "Asked my manager for an extension instead of silently panicking. Vulnerability is growth.", challenges: "Comparison trap on LinkedIn. Everyone seems to be doing more. Had to close the app.", gratitude: "The fact that tomorrow exists and I get another chance." },
  { mood: "Good", energy: "Medium", wins: "Cooked a proper meal from scratch — lemon herb chicken. Kitchen was clean by 8pm.", challenges: "Kept putting off the dentist call. Why is making phone calls so hard?", gratitude: "The smell of a home-cooked meal. Music playing while I cook." },
];

const ROUTINE_POOL = {
  morning: [
    { step: "Wake up — no snooze", dur: 1, order: 1 },
    { step: "Drink glass of water", dur: 2, order: 2 },
    { step: "5-minute stretch", dur: 5, order: 3 },
    { step: "Meditation or deep breathing", dur: 10, order: 4 },
    { step: "Shower and get dressed", dur: 15, order: 5 },
    { step: "Healthy breakfast", dur: 15, order: 6 },
    { step: "Review today's plan", dur: 5, order: 7 },
    { step: "Take vitamins/meds", dur: 1, order: 8 },
  ],
  evening: [
    { step: "Tidy workspace", dur: 10, order: 1 },
    { step: "Prepare tomorrow's clothes", dur: 5, order: 2 },
    { step: "Brain dump any lingering thoughts", dur: 5, order: 3 },
    { step: "Read for 20 minutes", dur: 20, order: 4 },
    { step: "Skincare routine", dur: 10, order: 5 },
    { step: "Gratitude journal entry", dur: 5, order: 6 },
    { step: "Lights out by 10:30pm", dur: 0, order: 7 },
  ],
};

const FOCUS_SESSION_POOL = [
  { name: "Deep work: Blog post writing", type: "Deep Work 90min", dur: 90, rating: "Laser Focus", distractions: 1 },
  { name: "Email and admin batch", type: "Pomodoro 25min", dur: 25, rating: "Pretty Good", distractions: 3 },
  { name: "Project research phase", type: "Power Hour 60min", dur: 60, rating: "Laser Focus", distractions: 2 },
  { name: "Quick task sprint", type: "Sprint 15min", dur: 15, rating: "Pretty Good", distractions: 0 },
  { name: "Study session — Module 3", type: "Pomodoro 25min", dur: 25, rating: "Struggled", distractions: 5 },
  { name: "Creative brainstorm", type: "Power Hour 60min", dur: 60, rating: "Laser Focus", distractions: 1 },
  { name: "Code review and fixes", type: "Deep Work 90min", dur: 90, rating: "Pretty Good", distractions: 2 },
  { name: "Declutter and organize files", type: "Sprint 15min", dur: 15, rating: "Pretty Good", distractions: 1 },
];

// ── ADHD-specific pools: Meals & Daily Log ──
const MEAL_POOL = [
  { name: "Overnight oats with berries", type: "Breakfast", prep: "5min", energy: "Low", ingredients: "Oats, milk, honey, frozen berries", rating: "⭐⭐⭐⭐⭐" },
  { name: "PB banana toast", type: "Breakfast", prep: "5min", energy: "Low", ingredients: "Bread, peanut butter, banana", rating: "⭐⭐⭐⭐" },
  { name: "Greek yogurt parfait", type: "Snack", prep: "5min", energy: "Low", ingredients: "Greek yogurt, granola, honey", rating: "⭐⭐⭐⭐" },
  { name: "Quesadilla (cheese + beans)", type: "Lunch", prep: "15min", energy: "Low", ingredients: "Tortilla, cheese, canned beans, salsa", rating: "⭐⭐⭐⭐" },
  { name: "Pasta with jarred sauce", type: "Dinner", prep: "15min", energy: "Low", ingredients: "Pasta, marinara, parmesan", rating: "⭐⭐⭐" },
  { name: "Sheet pan chicken + veggies", type: "Dinner", prep: "30min", energy: "Medium", ingredients: "Chicken thighs, broccoli, sweet potato, olive oil", rating: "⭐⭐⭐⭐⭐" },
  { name: "Smoothie bowl", type: "Breakfast", prep: "5min", energy: "Low", ingredients: "Frozen mango, banana, spinach, almond milk", rating: "⭐⭐⭐⭐" },
  { name: "Rice bowl with fried egg", type: "Lunch", prep: "15min", energy: "Low", ingredients: "Rice, eggs, soy sauce, sriracha, green onion", rating: "⭐⭐⭐⭐⭐" },
  { name: "Trail mix snack box", type: "Snack", prep: "5min", energy: "Low", ingredients: "Nuts, dried fruit, dark chocolate chips", rating: "⭐⭐⭐" },
  { name: "Stir fry with frozen veggies", type: "Dinner", prep: "15min", energy: "Medium", ingredients: "Frozen stir fry mix, soy sauce, rice, sesame oil", rating: "⭐⭐⭐⭐" },
  { name: "Avocado toast + egg", type: "Lunch", prep: "5min", energy: "Low", ingredients: "Bread, avocado, egg, everything bagel seasoning", rating: "⭐⭐⭐⭐⭐" },
  { name: "Frozen pizza (no shame)", type: "Dinner", prep: "15min", energy: "Low", ingredients: "Frozen pizza, side salad (optional)", rating: "⭐⭐⭐" },
  { name: "Apple + peanut butter", type: "Snack", prep: "5min", energy: "Low", ingredients: "Apple, peanut butter", rating: "⭐⭐⭐⭐" },
  { name: "Slow cooker chili", type: "Dinner", prep: "15min", energy: "Medium", ingredients: "Ground beef, canned beans, tomatoes, chili powder", rating: "⭐⭐⭐⭐⭐" },
];

const DAILY_LOG_POOL = [
  { mood: "😊 Great", peak: "Morning", wins: "Crushed my focus session — 90 min deep work!", gratitude: "Great sleep last night", sleep: 8, water: 7, tasks: 5, focus: 90, reflection: "Felt like myself today. Morning meds kicked in right on time." },
  { mood: "🙂 Good", peak: "Afternoon", wins: "Remembered to eat lunch on time", gratitude: "My dog greeting me at the door", sleep: 7, water: 6, tasks: 3, focus: 50, reflection: "Solid day. Got distracted after lunch but recovered." },
  { mood: "😐 Okay", peak: "Evening", wins: "Showed up even though I didn't want to", gratitude: "Hot coffee on a cold morning", sleep: 6, water: 4, tasks: 2, focus: 25, reflection: "Brain fog day. Did the bare minimum and that's enough." },
  { mood: "😟 Rough", peak: "Unpredictable", wins: "Asked for help when I needed it", gratitude: "My therapist exists", sleep: 5, water: 3, tasks: 1, focus: 15, reflection: "Rejection sensitive dysphoria hit hard. Journaling helped." },
  { mood: "😊 Great", peak: "Morning", wins: "Completed Weekly Review + set up next week!", gratitude: "Progress on my goals is visible", sleep: 8.5, water: 8, tasks: 7, focus: 120, reflection: "Hyperfocus worked in my favor today. Rode the wave." },
  { mood: "🙂 Good", peak: "Afternoon", wins: "Cooked a real dinner instead of takeout", gratitude: "Friendly cashier at the store", sleep: 7.5, water: 5, tasks: 4, focus: 60, reflection: "Energy dip at 2pm as usual. Took a walk and bounced back." },
  { mood: "😫 Awful", peak: "Unpredictable", wins: "Got out of bed (that counts)", gratitude: "Tomorrow is a fresh start", sleep: 4, water: 2, tasks: 0, focus: 0, reflection: "Everything felt impossible today. Used Emergency Mode. It helped a little." },
];

// ═══ Finance Tracker OS — Sample Data Pools ═══

const WALLET_POOL = [
  { name: "Main Wallet", type: "Bank", balance: 2103.22, currency: "EUR", color: "Green", _cover: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&fm=jpg&q=80", _icon: "🏦" },
  { name: "Media Project", type: "Cash", balance: 298, currency: "EUR", color: "Blue", _cover: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=400&fm=jpg&q=80", _icon: "💵" },
  { name: "Investments", type: "Investment", balance: 104, currency: "EUR", color: "Purple", _cover: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&fm=jpg&q=80", _icon: "📈" },
  { name: "Savings", type: "Bank", balance: 4200, currency: "EUR", color: "Orange", _cover: "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=400&fm=jpg&q=80", _icon: "🐷" },
  { name: "Dream Vault", type: "Savings", balance: 890, currency: "EUR", color: "Yellow", _cover: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=400&fm=jpg&q=80", _icon: "✨" },
];

const FIN_TRANSACTION_POOL = [
  // Current month — Income
  { name: "Design Agency Salary", amount: 4200, type: "Income", category: "Salary", daysAgo: 2, recurring: true, status: "Cleared" },
  { name: "Logo Project (Brew Co)", amount: 1200, type: "Income", category: "Freelance", daysAgo: 8, recurring: false, status: "Cleared" },
  { name: "Etsy Template Sales", amount: 320, type: "Income", category: "Side Hustle", daysAgo: 5, recurring: true, status: "Cleared" },
  { name: "Stock Dividends (VOO)", amount: 45, type: "Income", category: "Investments", daysAgo: 15, recurring: true, status: "Cleared" },
  // Current month — Expenses
  { name: "Rent (Pearl District)", amount: 1450, type: "Expense", category: "Housing", daysAgo: 1, recurring: true, status: "Cleared" },
  { name: "Grocery Haul (New Seasons)", amount: 187, type: "Expense", category: "Food & Dining", daysAgo: 3, recurring: false, status: "Cleared" },
  { name: "Electric Bill", amount: 68, type: "Expense", category: "Utilities", daysAgo: 10, recurring: true, status: "Cleared" },
  { name: "Netflix Standard", amount: 15.49, type: "Expense", category: "Subscriptions", daysAgo: 12, recurring: true, status: "Cleared" },
  { name: "CorePower Yoga", amount: 89, type: "Expense", category: "Health", daysAgo: 4, recurring: true, status: "Cleared" },
  { name: "Coffee (Heart Roasters)", amount: 24, type: "Expense", category: "Food & Dining", daysAgo: 1, recurring: false, status: "Pending" },
  { name: "New Running Shoes", amount: 134, type: "Expense", category: "Shopping", daysAgo: 6, recurring: false, status: "Cleared" },
  // Transfer
  { name: "Monthly Savings Transfer", amount: 500, type: "Transfer", category: "Savings", daysAgo: 1, recurring: true, status: "Cleared" },
  // Previous month
  { name: "Design Agency Salary", amount: 4200, type: "Income", category: "Salary", daysAgo: 32, recurring: true, status: "Cleared" },
  { name: "Rent (Pearl District)", amount: 1450, type: "Expense", category: "Housing", daysAgo: 31, recurring: true, status: "Cleared" },
  { name: "Grocery Haul", amount: 210, type: "Expense", category: "Food & Dining", daysAgo: 35, recurring: false, status: "Cleared" },
];

const FIN_BUDGET_POOL = [
  { category: "Housing", limit: 1500 },
  { category: "Food & Dining", limit: 400 },
  { category: "Transportation", limit: 150 },
  { category: "Entertainment", limit: 200 },
  { category: "Health", limit: 120 },
  { category: "Subscriptions", limit: 80 },
];

const FIN_GOAL_POOL = [
  { goal: "Emergency Fund (3 months)", target: 10000, current: 6800, targetDays: 180, category: "Safety Net", status: "Active", monthly: 400 },
  { goal: "Japan Trip 2026 ✈️", target: 3500, current: 1200, targetDays: 270, category: "Travel", status: "Active", monthly: 250 },
  { goal: "Investment Account (VOO)", target: 5000, current: 1800, targetDays: 365, category: "Investing", status: "Active", monthly: 200 },
];

const FIN_NET_WORTH_POOL = [
  { month: "January 2026", assets: 7100, liabilities: 20300, change: 0 },
  { month: "February 2026", assets: 7595, liabilities: 19850, change: 945 },
  { month: "March 2026", assets: 8095, liabilities: 19400, change: 950 },
];

// ═══ Maya Persona — handmade jewelry maker on Instagram + TikTok ═══
const CONTENT_POST_POOL = [
  { title: "Wire-wrapping tutorial — moonstone pendant", platform: "TikTok", contentType: "Reel", status: "Published", caption: "The most requested tutorial is finally here! Watch me transform raw moonstone into a pendant 🌙✨ #handmadejewelry #wirejewelry", hashtags: ["handmadejewelry", "wirejewelry", "tutorial"] },
  { title: "New collection flat lay — Summer Solstice", platform: "Instagram", contentType: "Carousel", status: "Published", caption: "Introducing the Summer Solstice Collection ☀️ Inspired by golden hour light and warm earth tones. Each piece is one-of-a-kind. Which is your favorite? 1, 2, or 3?", hashtags: ["newcollection", "handmadejewelry", "summersolstice"] },
  { title: "Behind the scenes — studio tour", platform: "Instagram", contentType: "Reel", status: "Scheduled", caption: "Come inside my little studio! 🎨 From messy workbench to finished jewelry — this is where the magic happens", hashtags: ["studiotour", "bts", "makerlife"] },
  { title: "Customer spotlight — Sarah's custom ring", platform: "Instagram", contentType: "Static", status: "Drafting", caption: "When Sarah asked for a rose gold ring with her grandmother's birthstone, I knew it had to be perfect 💍", hashtags: ["customjewelry", "customersupport", "handmade"] },
  { title: "3 ways to style ear cuffs", platform: "TikTok", contentType: "Reel", status: "Idea", caption: "", hashtags: ["earcuffs", "jewelrystyling", "fashiontips"] },
  { title: "Process reel — from sketch to finished piece", platform: "Instagram", contentType: "Reel", status: "Published", caption: "It started as a sketch in my notebook ✏️ 72 hours later, it's a wearable piece of art 🌿", hashtags: ["process", "handmadejewelry", "artistlife"] },
  { title: "Q&A: Your most asked questions", platform: "TikTok", contentType: "Reel", status: "Idea", caption: "", hashtags: ["qanda", "smallbusiness", "handmadejewelry"] },
  { title: "Holiday gift guide — under $50", platform: "Pinterest", contentType: "Pin", status: "Scheduled", caption: "The perfect handmade gift guide for your favorite person. Every piece under $50 and ready to ship!", hashtags: ["giftguide", "handmadegifts", "shopsmall"] },
  { title: "Packing orders ASMR", platform: "TikTok", contentType: "Reel", status: "Published", caption: "The most satisfying part of my day 📦✨ Every order wrapped with care", hashtags: ["packingorders", "asmr", "smallbusiness"] },
  { title: "Brand story — why I started making jewelry", platform: "Instagram", contentType: "Carousel", status: "Drafting", caption: "3 years ago I made my first ring at a weekend workshop. Today, jewelry is my full-time passion. Here's how it happened.", hashtags: ["brandstory", "smallbusiness", "handmadejewelry"] },
];

const CAMPAIGN_POOL = [
  { name: "Summer Solstice Collection Launch", goal: "Sales", status: "Active", platformFocus: ["Instagram", "TikTok"], daysActive: 14 },
  { name: "Behind the Scenes Series", goal: "Engagement", status: "Active", platformFocus: ["TikTok", "Instagram"], daysActive: 30 },
  { name: "Customer Spotlight Week", goal: "Brand Awareness", status: "Completed", platformFocus: ["Instagram"], daysActive: 7 },
  { name: "Holiday Gift Guide", goal: "Sales", status: "Planning", platformFocus: ["Pinterest", "Instagram"], daysActive: 0 },
  { name: "Collab with @StoneAndThread", goal: "Growth", status: "Planning", platformFocus: ["Instagram", "TikTok"], daysActive: 0 },
];

const ANALYTICS_POOL = [
  { postRef: "Wire-wrapping tutorial", platform: "TikTok", likes: 2847, comments: 156, shares: 89, reach: 24300, time: "Evening" },
  { postRef: "Summer Solstice flat lay", platform: "Instagram", likes: 342, comments: 47, shares: 12, reach: 1850, time: "Morning" },
  { postRef: "Process reel — sketch to piece", platform: "Instagram", likes: 567, comments: 73, shares: 34, reach: 3200, time: "Afternoon" },
  { postRef: "Packing orders ASMR", platform: "TikTok", likes: 1203, comments: 89, shares: 45, reach: 11200, time: "Evening" },
  { postRef: "Studio tour BTS", platform: "Instagram", likes: 189, comments: 28, shares: 8, reach: 920, time: "Morning" },
  { postRef: "Customer spotlight — Sarah", platform: "Instagram", likes: 276, comments: 41, shares: 15, reach: 1400, time: "Afternoon" },
  { postRef: "Moonstone pendant close-up", platform: "Instagram", likes: 445, comments: 52, shares: 22, reach: 2100, time: "Morning" },
  { postRef: "Holiday gift guide pin", platform: "Pinterest", likes: 89, comments: 5, shares: 67, reach: 4500, time: "Morning" },
];

const CONTENT_IDEAS_POOL = [
  { idea: "Wire-wrapping tutorial reel (beginner level)", category: "Tutorial", platforms: ["TikTok", "Instagram"], effort: "Medium", saved: true, source: "Most requested in DMs" },
  { idea: "Workspace tour with morning coffee", category: "BTS", platforms: ["TikTok", "Instagram"], effort: "Quick", saved: true, source: "Trending audio" },
  { idea: "Customer unboxing compilation", category: "Product", platforms: ["TikTok"], effort: "Medium", saved: false, source: "Customer tagged posts" },
  { idea: "3 ways to style ear cuffs", category: "Educational", platforms: ["TikTok", "Instagram"], effort: "Medium", saved: true, source: "Pinterest trending" },
  { idea: "Trend: ASMR jewelry making", category: "Trending", platforms: ["TikTok"], effort: "Quick", saved: false, source: "FYP trending" },
  { idea: "Flat lay photography tips for makers", category: "Educational", platforms: ["Instagram", "Pinterest"], effort: "Production", saved: false, source: "Own expertise" },
  { idea: "Brand story: why I started making jewelry", category: "Lifestyle", platforms: ["Instagram"], effort: "Production", saved: true, source: "Content calendar gap" },
  { idea: "Q&A: most asked questions about my process", category: "BTS", platforms: ["TikTok", "Instagram"], effort: "Quick", saved: false, source: "Story question sticker" },
  { idea: "Process: from sketch to finished piece", category: "BTS", platforms: ["Instagram", "TikTok"], effort: "Production", saved: true, source: "Best performing content type" },
  { idea: "Holiday collection teaser — sneak peek", category: "Product", platforms: ["Instagram", "TikTok"], effort: "Quick", saved: false, source: "Seasonal planning" },
];

const BRAND_ASSETS_POOL = [
  { name: "Brand Color Palette", assetType: "Color Palette", usage: "Primary: #2C3E50 (dark navy), Secondary: #E74C3C (coral), Accent: #F39C12 (gold). Use dark navy for text, coral for CTAs, gold for highlights.", link: "" },
  { name: "Primary Font — Playfair Display", assetType: "Font", usage: "Use for headings, logo text, and feature callouts. Pair with Lato for body text.", link: "" },
  { name: "Logo Variations", assetType: "Logo", usage: "Main logo (dark bg), Watermark (semi-transparent), Icon-only (for profile pics). All in brand assets Google Drive folder.", link: "" },
  { name: "Instagram Highlight Covers", assetType: "Template", usage: "8 covers: Shop, New, Process, FAQ, Reviews, BTS, Collabs, Sales. All in dark navy + gold.", link: "" },
  { name: "Core Hashtag Set", assetType: "Hashtag Set", usage: "#handmadejewelry #artisancraft #wirejewelry #crystaljewelry #shopsmall #supportsmallbusiness #handmadewithcare #jewelrymaker #jewelrydesigner #etsyseller", link: "" },
  { name: "Trending Audio Library", assetType: "Sound", usage: "Saved audio clips for Reels/TikTok. Updated weekly. Check 'Saved Audio' folder in TikTok app.", link: "" },
];

const READING_POOL = [
  { title: "Atomic Habits", author: "James Clear", status: "Finished", genre: "Self-Help", rating: "⭐⭐⭐⭐⭐" },
  { title: "Deep Work", author: "Cal Newport", status: "Finished", genre: "Business", rating: "⭐⭐⭐⭐" },
  { title: "The Body Keeps the Score", author: "Bessel van der Kolk", status: "Reading", genre: "Science", rating: "" },
  { title: "Think Again", author: "Adam Grant", status: "Want to Read", genre: "Self-Help", rating: "" },
  { title: "Project Hail Mary", author: "Andy Weir", status: "Finished", genre: "Fiction", rating: "⭐⭐⭐⭐⭐" },
  { title: "Four Thousand Weeks", author: "Oliver Burkeman", status: "Reading", genre: "Self-Help", rating: "" },
  { title: "Educated", author: "Tara Westover", status: "Finished", genre: "Biography", rating: "⭐⭐⭐⭐" },
  { title: "The Psychology of Money", author: "Morgan Housel", status: "Finished", genre: "Business", rating: "⭐⭐⭐⭐⭐" },
  { title: "Dune", author: "Frank Herbert", status: "Want to Read", genre: "Fiction", rating: "" },
  { title: "Driven to Distraction", author: "Edward Hallowell", status: "Finished", genre: "Science", rating: "⭐⭐⭐⭐" },
];

// ═══════════════════════════════════════════════════════════
// TEMPLATE GENERATORS — Each call produces a unique template
// ═══════════════════════════════════════════════════════════

export function getADHDPlannerSpec(aesthetic: string): NotionTemplateSpec {
  const colors = getColors(aesthetic);
  const palette = AESTHETIC_COLORS[aesthetic] || AESTHETIC_COLORS.minimal;
  const name = pickOne(ADHD_NAMES);
  const tagline = pickOne(ADHD_TAGLINES);
  const icon = pickOne(ADHD_ICONS);

  // Pick random subsets of sample data
  const tasks = pickN(TASK_POOL, 10);
  const habits = pickN(HABIT_POOL, 8);
  const goals = pickN(GOAL_POOL, 6);
  const brainDumps = pickN(BRAIN_DUMP_POOL, 8);
  const dailyLogs = pickN(DAILY_LOG_POOL, 5);
  const morningSteps = pickN(ROUTINE_POOL.morning, 6);
  const eveningSteps = pickN(ROUTINE_POOL.evening, 5);
  const focusSessions = pickN(FOCUS_SESSION_POOL, 6);
  const meals = pickN(MEAL_POOL, 10);

  // ── 8 DATABASES with rich properties, formulas, and relations ──
  const databases: DatabaseSpec[] = [
    // DB1: Brain Dump (Inbox) — created first, no relations needed initially
    {
      key: "brain_dump",
      name: "Brain Dump",
      icon: "🧠",
      properties: [
        { name: "Thought", type: "title" },
        { name: "Type", type: "select", options: [
          { name: "Task", color: colors[2] }, { name: "Idea", color: colors[1] },
          { name: "Note", color: colors[0] }, { name: "Question", color: colors[3] },
          { name: "Worry", color: colors[4] },
        ]},
        { name: "Energy Level", type: "select", options: [
          { name: "Low 🔋", color: colors[3] }, { name: "Medium ⚡", color: colors[1] },
          { name: "High 🚀", color: colors[4] },
        ]},
        { name: "Time Estimate", type: "select", options: [
          { name: "5min", color: colors[3] }, { name: "15min", color: colors[2] },
          { name: "30min", color: colors[1] }, { name: "1hr", color: colors[0] },
          { name: "2hr+", color: colors[4] },
        ]},
        { name: "Processed", type: "checkbox" },
        { name: "Created", type: "created_time" },
        { name: "Linked Task", type: "relation", relationDbKey: "tasks" },
        { name: "Action Priority", type: "formula", formula: `if(prop("Type") == "Task" and prop("Energy Level") == "Low 🔋", "⚡ Quick Win", if(prop("Type") == "Worry", "🧘 Process First", if(prop("Processed"), "✅ Done", "📥 Inbox")))` },
      ],
      sampleData: brainDumps.map(b => ({
        Thought: b.thought,
        Type: b.cat === "Random" ? "Note" : b.cat === "Goal" ? "Idea" : b.cat,
        "Energy Level": pickOne(["Low 🔋", "Medium ⚡", "High 🚀"]),
        "Time Estimate": pickOne(["5min", "15min", "30min"]),
        Processed: false,
      })),
    },

    // DB2: Goals — created before tasks so tasks can relate to goals
    {
      key: "goals",
      name: "Goals",
      icon: "🎯",
      properties: [
        { name: "Goal", type: "title" },
        { name: "Area", type: "select", options: [
          { name: "Health", color: colors[3] }, { name: "Career", color: colors[2] },
          { name: "Personal Growth", color: colors[1] }, { name: "Finances", color: colors[0] },
          { name: "Relationships", color: colors[4] },
        ]},
        { name: "Status", type: "select", options: [
          { name: "Planning", color: colors[0] }, { name: "Active", color: colors[3] },
          { name: "On Hold", color: colors[1] }, { name: "Achieved", color: colors[2] },
        ]},
        { name: "Target Date", type: "date" },
        { name: "Progress", type: "number" },
        { name: "Progress Bar", type: "formula", formula: `slice("██████████", 0, floor(prop("Progress") / 10)) + slice("░░░░░░░░░░", 0, 10 - floor(prop("Progress") / 10)) + " " + format(round(prop("Progress"))) + "%"` },
        { name: "Notes", type: "rich_text" },
      ],
      sampleData: goals.map(g => ({
        Goal: g.name, Area: g.area, Status: g.status,
        "Target Date": getFutureDate(Math.floor(Math.random() * 180) + 30),
        Progress: g.progress, Notes: "",
      })),
    },

    // DB3: Tasks — relates to goals, brain_dump, focus_sessions
    {
      key: "tasks",
      name: "Tasks",
      icon: "✅",
      properties: [
        { name: "Task", type: "title" },
        { name: "Status", type: "select", options: [
          { name: "Not Started", color: colors[0] }, { name: "In Progress", color: colors[2] },
          { name: "Done", color: colors[3] }, { name: "Cancelled", color: colors[4] },
        ]},
        { name: "Priority", type: "select", options: [
          { name: "🔴 Now", color: colors[4] }, { name: "🟡 Soon", color: colors[1] },
          { name: "🟢 Later", color: colors[3] }, { name: "⚪ Someday", color: colors[0] },
        ]},
        { name: "Category", type: "select", options: [
          { name: "Work", color: colors[2] }, { name: "Health", color: colors[3] },
          { name: "Home", color: colors[0] }, { name: "Finance", color: colors[1] },
          { name: "Social", color: colors[4] }, { name: "Growth", color: colors[3] },
        ]},
        { name: "Energy Required", type: "select", options: [
          { name: "Low 🔋", color: colors[3] }, { name: "Medium ⚡", color: colors[1] },
          { name: "High 🚀", color: colors[4] },
        ]},
        { name: "Time Estimate", type: "select", options: [
          { name: "5min", color: colors[3] }, { name: "15min", color: colors[2] },
          { name: "30min", color: colors[1] }, { name: "1hr", color: colors[0] },
          { name: "2hr+", color: colors[4] },
        ]},
        { name: "Due Date", type: "date" },
        { name: "Dopamine Rating", type: "select", options: [
          { name: "🎉 Fun", color: colors[3] }, { name: "😐 Meh", color: colors[1] },
          { name: "😩 Boring", color: colors[4] },
        ]},
        { name: "Body Double Needed", type: "checkbox" },
        { name: "Done Date", type: "date" },
        { name: "Notes", type: "rich_text" },
        { name: "Goal", type: "relation", relationDbKey: "goals" },
        { name: "Focus Session", type: "relation", relationDbKey: "focus_sessions" },
        { name: "From Brain Dump", type: "relation", relationDbKey: "brain_dump" },
        { name: "Days Until Due", type: "formula", formula: `if(empty(prop("Due Date")), "No rush", if(dateBetween(prop("Due Date"), now(), "days") < 0, "🔴 OVERDUE", if(dateBetween(prop("Due Date"), now(), "days") == 0, "🟡 TODAY", if(dateBetween(prop("Due Date"), now(), "days") <= 3, "🟠 " + format(dateBetween(prop("Due Date"), now(), "days")) + "d left", "🟢 " + format(dateBetween(prop("Due Date"), now(), "days")) + "d left"))))` },
        { name: "Week", type: "formula", formula: `if(empty(prop("Due Date")), "", formatDate(prop("Due Date"), "YYYY-[W]WW"))` },
        { name: "Hyperfocus Risk", type: "formula", formula: `if(prop("Energy Required") == "High 🚀" and prop("Dopamine Rating") == "🎉 Fun", "⚠️ Hyperfocus Trap", if(prop("Energy Required") == "High 🚀" and prop("Dopamine Rating") == "😩 Boring", "🧊 Avoidance Risk", "✅ Balanced"))` },
        { name: "Created", type: "created_time" },
      ],
      sampleData: tasks.map(t => ({
        Task: t.name, Status: t.status,
        Priority: t.priority === "Urgent" ? "🔴 Now" : t.priority === "High" ? "🟡 Soon" : t.priority === "Medium" ? "🟢 Later" : "⚪ Someday",
        Category: pickOne(["Work", "Health", "Home", "Finance", "Social", "Growth"]),
        "Energy Required": t.energy === "High Energy" ? "High 🚀" : t.energy === "Medium Energy" ? "Medium ⚡" : "Low 🔋",
        "Time Estimate": pickOne(["5min", "15min", "30min", "1hr"]),
        "Due Date": getFutureDate(t.due),
        "Dopamine Rating": pickOne(["🎉 Fun", "😐 Meh", "😩 Boring"]),
        "Body Double Needed": Math.random() > 0.7,
        Notes: t.notes,
      })),
    },

    // DB4: Focus Sessions — relates to tasks
    {
      key: "focus_sessions",
      name: "Focus Sessions",
      icon: "🍅",
      properties: [
        { name: "Session", type: "title" },
        { name: "Date", type: "date" },
        { name: "Duration (min)", type: "number" },
        { name: "Actual (min)", type: "number" },
        { name: "Type", type: "select", options: [
          { name: "Pomodoro 25min", color: colors[3] }, { name: "Power Hour 60min", color: colors[2] },
          { name: "Deep Work 90min", color: colors[1] }, { name: "Sprint 15min", color: colors[0] },
        ]},
        { name: "Focus Rating", type: "select", options: [
          { name: "😫 1", color: colors[4] }, { name: "😐 2", color: colors[0] },
          { name: "🙂 3", color: colors[1] }, { name: "😊 4", color: colors[2] },
          { name: "🤩 5", color: colors[3] },
        ]},
        { name: "Distractions", type: "number" },
        { name: "Energy Before", type: "select", options: [
          { name: "Low 🔋", color: colors[3] }, { name: "Medium ⚡", color: colors[1] },
          { name: "High 🚀", color: colors[4] },
        ]},
        { name: "Energy After", type: "select", options: [
          { name: "Low 🔋", color: colors[3] }, { name: "Medium ⚡", color: colors[1] },
          { name: "High 🚀", color: colors[4] },
        ]},
        { name: "Completed", type: "checkbox" },
        { name: "Focus Score", type: "formula", formula: `if(prop("Duration (min)") == 0, 0, round(prop("Actual (min)") / max(prop("Duration (min)"), 1) * 100))` },
        { name: "Notes", type: "rich_text" },
      ],
      sampleData: focusSessions.map((s, i) => ({
        Session: s.name, "Duration (min)": s.dur,
        "Actual (min)": Math.max(10, s.dur - Math.floor(Math.random() * 15)),
        Type: s.type,
        "Focus Rating": s.rating === "Laser Focus" ? "🤩 5" : s.rating === "Pretty Good" ? "😊 4" : "😐 2",
        Distractions: s.distractions,
        "Energy Before": pickOne(["Low 🔋", "Medium ⚡", "High 🚀"]),
        "Energy After": pickOne(["Low 🔋", "Medium ⚡"]),
        Completed: i < 4, Date: getPastDate(i),
      })),
    },

    // DB5: Habits
    {
      key: "habits",
      name: "Habits",
      icon: "💪",
      properties: [
        { name: "Habit", type: "title" },
        { name: "Category", type: "select", options: [
          { name: "Health", color: colors[3] }, { name: "Productivity", color: colors[2] },
          { name: "Mindfulness", color: colors[0] }, { name: "Self-Care", color: colors[1] },
          { name: "Learning", color: colors[4] },
        ]},
        { name: "Frequency", type: "select", options: [
          { name: "Daily", color: colors[3] }, { name: "Weekdays", color: colors[2] },
          { name: "3x/week", color: colors[1] }, { name: "Weekly", color: colors[0] },
        ]},
        { name: "Importance", type: "select", options: [
          { name: "Core", color: colors[4] }, { name: "Nice-to-have", color: colors[0] },
        ]},
        { name: "Current Streak", type: "number" },
        { name: "Best Streak", type: "number" },
        { name: "Streak Bar", type: "formula", formula: `if(prop("Current Streak") >= 30, "🔥🔥🔥 " + format(prop("Current Streak")) + " days!", if(prop("Current Streak") >= 14, "🔥🔥 " + format(prop("Current Streak")) + " days", if(prop("Current Streak") >= 7, "🔥 " + format(prop("Current Streak")) + " days", if(prop("Current Streak") >= 1, "✨ " + format(prop("Current Streak")) + " days", "Start today!"))))` },
        { name: "Today", type: "checkbox" },
        { name: "Last Done", type: "date" },
        { name: "Notes", type: "rich_text" },
      ],
      sampleData: habits.map(h => ({
        Habit: h.name, Category: h.cat, Frequency: h.freq,
        Importance: h.streak >= 10 ? "Core" : "Nice-to-have",
        "Current Streak": h.streak, "Best Streak": h.best,
        Today: h.streak > 5, "Last Done": getPastDate(h.streak > 0 ? 0 : 3),
      })),
    },

    // DB6: Daily Log — UPGRADED from old Journal. Tracks mood, energy, sleep, water, wins
    {
      key: "daily_log",
      name: "Daily Log",
      icon: "📅",
      properties: [
        { name: "Date", type: "title" },
        { name: "Day Date", type: "date" },
        { name: "Mood", type: "select", options: [
          { name: "😫 Awful", color: colors[4] }, { name: "😟 Rough", color: colors[0] },
          { name: "😐 Okay", color: colors[1] }, { name: "🙂 Good", color: colors[2] },
          { name: "😊 Great", color: colors[3] },
        ]},
        { name: "Energy Peak", type: "select", options: [
          { name: "Morning", color: colors[1] }, { name: "Afternoon", color: colors[0] },
          { name: "Evening", color: colors[2] }, { name: "Unpredictable", color: colors[4] },
        ]},
        { name: "Top 3 Wins", type: "rich_text" },
        { name: "Gratitude", type: "rich_text" },
        { name: "Reflection", type: "rich_text" },
        { name: "Sleep Hours", type: "number" },
        { name: "Water Glasses", type: "number" },
        { name: "Tasks Done", type: "number" },
        { name: "Focus Minutes", type: "number" },
        { name: "Day Score", type: "formula", formula: `round(prop("Tasks Done") * 15 + prop("Focus Minutes") * 0.5 + if(prop("Mood") == "😊 Great", 20, if(prop("Mood") == "🙂 Good", 15, if(prop("Mood") == "😐 Okay", 10, 5))) + prop("Water Glasses") * 2 + prop("Sleep Hours") * 3)` },
        { name: "Energy Match", type: "formula", formula: `if(prop("Energy Peak") == "Morning" and prop("Tasks Done") >= 3, "🎯 Peak Used Well", if(prop("Tasks Done") < 2, "💤 Low Output", "📊 Average Day"))` },
      ],
      sampleData: dailyLogs.map((d, i) => {
        const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const dateObj = new Date();
        dateObj.setDate(dateObj.getDate() - (dailyLogs.length - i));
        const dayName = dayNames[dateObj.getDay()];
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return {
          Date: `${dayName}, ${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}`,
          "Day Date": dateObj.toISOString().split("T")[0],
          Mood: d.mood,
          "Energy Peak": d.peak,
          "Top 3 Wins": d.wins,
          Gratitude: d.gratitude,
          Reflection: d.reflection,
          "Sleep Hours": d.sleep,
          "Water Glasses": d.water,
          "Tasks Done": d.tasks,
          "Focus Minutes": d.focus,
        };
      }),
    },

    // DB7: Meals — COMPETITIVE GAP (no competitor has this!)
    {
      key: "meals",
      name: "Meals",
      icon: "🍽️",
      properties: [
        { name: "Meal", type: "title" },
        { name: "Type", type: "select", options: [
          { name: "Breakfast", color: colors[1] }, { name: "Lunch", color: colors[0] },
          { name: "Dinner", color: colors[2] }, { name: "Snack", color: colors[3] },
        ]},
        { name: "Prep Time", type: "select", options: [
          { name: "5min", color: colors[3] }, { name: "15min", color: colors[2] },
          { name: "30min", color: colors[1] }, { name: "1hr", color: colors[4] },
        ]},
        { name: "Energy Level Needed", type: "select", options: [
          { name: "Low", color: colors[3] }, { name: "Medium", color: colors[1] },
          { name: "High", color: colors[4] },
        ]},
        { name: "Ingredients", type: "rich_text" },
        { name: "Recipe Link", type: "url" },
        { name: "Rating", type: "select", options: [
          { name: "⭐⭐⭐⭐⭐", color: colors[3] }, { name: "⭐⭐⭐⭐", color: colors[2] },
          { name: "⭐⭐⭐", color: colors[1] }, { name: "⭐⭐", color: colors[0] },
          { name: "⭐", color: colors[4] },
        ]},
        { name: "Day", type: "relation", relationDbKey: "daily_log" },
      ],
      sampleData: meals.map(m => ({
        Meal: m.name, Type: m.type, "Prep Time": m.prep,
        "Energy Level Needed": m.energy,
        Ingredients: m.ingredients, Rating: m.rating,
      })),
    },

    // DB8: Routines
    {
      key: "routines",
      name: "Routines",
      icon: "🌅",
      properties: [
        { name: "Step", type: "title" },
        { name: "Routine", type: "select", options: [
          { name: "🌅 Morning", color: colors[1] }, { name: "🌙 Evening", color: colors[0] },
          { name: "🏋️ Workout", color: colors[3] },
        ]},
        { name: "Order", type: "number" },
        { name: "Duration (min)", type: "number" },
        { name: "Done", type: "checkbox" },
        { name: "Notes", type: "rich_text" },
      ],
      sampleData: [
        ...morningSteps.map(s => ({ Step: s.step, Routine: "🌅 Morning", "Duration (min)": s.dur, Order: s.order, Done: s.order <= 3 })),
        ...eveningSteps.map(s => ({ Step: s.step, Routine: "🌙 Evening", "Duration (min)": s.dur, Order: s.order, Done: false })),
      ],
    },
  ];

  // ── SECTIONS (hub-style grouping) ──
  const sections: TemplateSection[] = [
    {
      key: "capture_process",
      name: "Capture & Process",
      icon: "📥",
      description: "Your ADHD-friendly quick-capture zone. Dump everything from your brain, then sort and process into actionable items.",
      databaseKeys: ["brain_dump"],
      tips: [
        "Use Brain Dump whenever you feel overwhelmed — just get it all out of your head",
        "Process your inbox daily: sort items into Tasks, Ideas, or archive them",
        "The Action Priority formula auto-tags Quick Wins — start there when stuck",
      ],
      viewSuggestions: [
        "Board view grouped by Type — see Tasks, Ideas, Worries at a glance",
        "Filter: Processed = false — your unprocessed inbox",
        "Sort by Created (newest) — most recent brain dumps on top",
      ],
    },
    {
      key: "productivity",
      name: "Productivity",
      icon: "⚡",
      description: "Tasks with energy matching and Pomodoro-style focus sessions. Work with your brain, not against it.",
      databaseKeys: ["tasks", "focus_sessions"],
      tips: [
        "Match tasks to your current energy level — Low energy = easy wins, High energy = big projects",
        "The Hyperfocus Risk formula auto-detects tasks where you might get stuck",
        "Use Focus Sessions when you need external structure to start — even 15 minutes counts",
      ],
      viewSuggestions: [
        "Board view grouped by Status — Kanban-style task flow",
        "Filter: Priority = 🔴 Now — today's urgent tasks only",
        "Calendar view by Due Date — visual weekly planning",
        "Board view for Focus Sessions grouped by Type — see session history",
      ],
    },
    {
      key: "goals_growth",
      name: "Goals & Growth",
      icon: "🎯",
      description: "Set big goals, break them into milestones, and watch your progress bars fill up automatically.",
      databaseKeys: ["goals"],
      tips: [
        "Keep goals visible — check your progress bars weekly",
        "Goal Momentum formula shows 🏁 → 🌱 → 💪 → 🚀 as you make progress",
        "Link tasks to goals to see which actions move the needle",
      ],
      viewSuggestions: [
        "Gallery view — visual goal cards with progress bars",
        "Filter: Status = Active — current goals only",
        "Board view grouped by Area — Health, Career, Personal Growth goals",
      ],
    },
    {
      key: "wellness_routines",
      name: "Wellness & Routines",
      icon: "💪",
      description: "Habits, daily wellness tracking, easy meals, and structured routines — the foundation that keeps everything else running.",
      databaseKeys: ["habits", "daily_log", "meals", "routines"],
      tips: [
        "Start with just 2-3 habits — you can always add more later",
        "Daily Log tracks mood, energy, sleep, and water — spot your best patterns over time",
        "Meals database has low-energy food options sorted by prep time — perfect for ADHD days",
      ],
      viewSuggestions: [
        "Board view for Habits grouped by Category — Health, Productivity, Mindfulness",
        "Sort Habits by Current Streak descending — celebrate your progress",
        "Gallery view for Meals — visual recipe cards sorted by Prep Time",
        "Calendar view for Daily Log — track mood patterns over time",
      ],
    },
  ];

  // ══════════════════════════════════════════════════════
  // DASHBOARD BLOCKS — Premium OS-style control center
  // Order: Header → Command Center → Today Dashboard →
  //        Focus Session → Energy Workflow → Daily Ritual →
  //        Goals Progress → Quick Capture → Workspaces
  // ══════════════════════════════════════════════════════
  const dashboardBlocks: BlockSpec[] = [
    // ── 1. HEADER (indices 0-3 filtered by premium framework) ──
    { type: "heading_1", text: `${icon} ${name}` },
    { type: "quote", text: tagline, italic: true },
    createCallout("⚡ ALL TRACKING IS AUTOMATIC — Progress bars, streak counts, focus scores, and days-left indicators update instantly when you edit data.", "⚡", { color: "yellow_background" }),
    { type: "divider" },

    // ── 2. COMMAND CENTER (3+2 grid of action buttons) ──
    ...buildCommandCenter([
      { icon: "✅", label: "New Task", description: "Add a task with priority, energy level, and dopamine rating." },
      { icon: "📥", label: "Brain Dump", description: "Quick-capture any thought. Sort it later." },
      { icon: "🍅", label: "Focus Session", description: "Start a timed sprint or deep work block." },
      { icon: "💪", label: "Log Habit", description: "Check in on today's habits. Grow streaks." },
      { icon: "📋", label: "Plan Today", description: "Set your top 3 using the checklist below." },
    ], palette),

    { type: "divider" },

    // ── 3. TODAY DASHBOARD (live linked database views) ──
    { type: "heading_2", text: "📊 Today Dashboard" },
    { type: "column_list", columns: [
      [
        createCallout("🎯 ACTIVE TASKS", "🎯", { color: `${palette.accent}_background`, bold: true }),
        { type: "linked_database", databaseKey: "tasks", text: "Active Tasks" },
      ],
      [
        createCallout("🔥 TODAY'S HABITS", "🔥", { color: `${palette.primary}_background`, bold: true }),
        { type: "linked_database", databaseKey: "habits", text: "Today's Habits" },
      ],
    ]},

    { type: "divider" },

    // ── 4. FOCUS SESSION (live view + tip) ──
    { type: "heading_2", text: "🍅 Focus Session" },
    { type: "linked_database", databaseKey: "focus_sessions", text: "Today's Focus Sessions" },
    createCallout("Use 25-minute focus sprints followed by 5-minute breaks. After 4 sprints, take a 15-minute break. Track your Focus Score to find your peak performance pattern.", "🍅", { color: `${palette.secondary}_background` }),

    { type: "divider" },

    // ── 5. ENERGY WORKFLOW (2-column decision tree) ──
    { type: "heading_2", text: "⚡ Energy Workflow" },
    { type: "column_list", columns: [
      [
        createCallout("🔋 LOW ENERGY\n\nOpen ⚡ Productivity\nFilter: Energy = Low 🔋\nPick the easiest task\nDo a 15-min Sprint", "🔋", { color: `${palette.secondary}_background`, bold: true }),
      ],
      [
        createCallout("🚀 HIGH ENERGY\n\nOpen ⚡ Productivity\nFilter: Energy = High 🚀\nTackle your biggest task\nStart a 90-min Deep Work", "🚀", { color: `${palette.accent}_background`, bold: true }),
      ],
    ]},

    { type: "divider" },

    // ── 6. DAILY RITUAL (morning/evening checklists) ──
    ...buildDailyRitual([
      "Check your energy level (Low, Medium, or High?)",
      "Pick 3 tasks that match your energy",
      "Start your first focus session",
      "Check today's habit streaks",
      "Process any new brain dump items",
    ], [
      "Mark completed tasks as Done",
      "Update habit check-ins for today",
      "Brain dump anything still lingering",
      "Update goal progress if applicable",
      "Plan tomorrow's top 3 priorities",
    ], { title: "Quick Brain Dump — capture anything on your mind", icon: "📥", items: [
      "Quick thought — type here and move to Brain Dump later",
      "Something to remember...",
      "Idea to explore...",
    ]}, palette),

    { type: "divider" },

    // ── 7. GOALS PROGRESS (live linked view) ──
    { type: "heading_2", text: "🎯 Goals Progress" },
    { type: "linked_database", databaseKey: "goals", text: "Goals" },

    { type: "divider" },

    // ── 8. QUICK CAPTURE (high-visibility action zone for ADHD) ──
    { type: "heading_2", text: "📥 Quick Capture" },
    { type: "column_list", columns: [
      [
        createCallout("🧠 Brain Dump\n\nCapture any thought instantly.\nSort and process later.", "🧠", { color: `${palette.accent}_background`, bold: true }),
      ],
      [
        createCallout("✅ New Task\n\nAdd a task with priority,\nenergy level, and due date.", "✅", { color: `${palette.primary}_background`, bold: true }),
      ],
      [
        createCallout("💡 Save Idea\n\nLog an idea or inspiration.\nReview during weekly planning.", "💡", { color: `${palette.secondary}_background`, bold: true }),
      ],
    ]},

    { type: "divider" },

    // ── 9. WORKSPACES (section navigation cards) ──
    ...buildSectionCards(sections, databases, palette),
  ];

  // ── FOOTER BLOCKS (after section cards on root page) ──
  const footerBlocks: BlockSpec[] = [
    { type: "toggle", text: "🆘 Emergency Mode — Click when overwhelmed", children: [
      createCallout("STOP. BREATHE. You're okay.", "🫁", { color: "red_background", bold: true }),
      { type: "numbered_list_item", text: "Close all other tabs right now" },
      { type: "numbered_list_item", text: "Pick ONE task from your Tasks database — the easiest one" },
      { type: "numbered_list_item", text: "Set a 10-minute timer and just start" },
      { type: "numbered_list_item", text: "After 10 minutes, decide: continue or switch?" },
      { type: "paragraph", text: "You don't have to do everything. You just have to do ONE thing.", italic: true },
    ]},
    { type: "toggle", text: "📖 Setup Guide — Click to expand", children: [
      { type: "numbered_list_item", text: "Delete the sample data from each database (keep the structure)" },
      { type: "numbered_list_item", text: "Start with Brain Dump — spend 5 minutes writing everything on your mind" },
      { type: "numbered_list_item", text: "Move actionable items to Tasks, set energy level and dopamine rating" },
      { type: "numbered_list_item", text: "Add your Habits — start with just 2-3. Streak bars update automatically!" },
      { type: "numbered_list_item", text: "Set 3-5 Goals — type your progress % and the bar fills automatically" },
    ]},
  ];

  // ── Sub-Pages ──
  const subPages: PageSpec[] = [
    {
      name: "🚀 Start Here",
      icon: "🚀",
      cover: "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=1500",
      blocks: [
        { type: "heading_1", text: `Welcome to ${name}!` },
        createCallout("This template was built for ADHD brains — less friction, more action. Follow these steps to make it yours in 5 minutes.", "🧠", { color: `${palette.primary}_background` }),
        { type: "divider" },
        { type: "heading_2", text: "⚡ Quick Setup (5 minutes)" },
        { type: "numbered_list_item", text: "Brain dump everything in 🧠 Brain Dump — don't filter, just capture every thought, task, and worry" },
        { type: "numbered_list_item", text: "Set up your daily routines in 🔄 Routines — morning and evening steps. Keep it simple (5-8 steps max)" },
        { type: "numbered_list_item", text: "Log your first day in 📅 Daily Log — watch your Day Score calculate automatically" },
        { type: "numbered_list_item", text: "Add your top 3 goals to 🎯 Goals — the Progress Bar fills as you update the % number" },
        { type: "numbered_list_item", text: "Delete sample data and start adding your own entries" },
        { type: "divider" },
        { type: "heading_2", text: "💡 Pro Tips" },
        { type: "toggle", text: "How does the Hyperfocus Risk formula work?", children: [
          { type: "paragraph", text: "The Hyperfocus Risk formula in your Tasks database automatically detects when a task is High Energy + Fun (⚠️ Hyperfocus Trap) or High Energy + Boring (🧊 Avoidance Risk). Use this to set timers on fun tasks and pair boring ones with body doubles." },
        ]},
        { type: "toggle", text: "What's the best way to use Energy Matching?", children: [
          { type: "paragraph", text: "The Energy Match formula in Daily Log compares your peak energy time to your output. If you're a morning person and get 3+ tasks done, it shows 🎯 Peak Used Well. Track this for a week to find your best patterns." },
        ]},
        { type: "toggle", text: "How to use the Body Double column", children: [
          { type: "paragraph", text: "Check 'Body Double Needed' on tasks you tend to avoid. Then batch those tasks for times when you have a coworking buddy, virtual body double session, or can use Focusmate." },
        ]},
        { type: "toggle", text: "Keyboard shortcuts to speed things up", children: [
          { type: "bulleted_list_item", text: "/ — Open block menu (type 'database' to quickly add a new DB)" },
          { type: "bulleted_list_item", text: "Ctrl/Cmd + N — New page" },
          { type: "bulleted_list_item", text: "Ctrl/Cmd + D — Duplicate a block" },
          { type: "bulleted_list_item", text: "Ctrl/Cmd + Shift + M — Comment on any block" },
          { type: "bulleted_list_item", text: "@ — Mention a page, person, or date" },
        ]},
        { type: "divider" },
        { type: "heading_2", text: "❓ FAQ" },
        { type: "toggle", text: "Can I add more databases?", children: [
          { type: "paragraph", text: "Yes! Use / → Database to add inline or full-page databases. You can also add relation properties to link them to existing databases." },
        ]},
        { type: "toggle", text: "How do formulas update?", children: [
          { type: "paragraph", text: "Formulas auto-calculate whenever you change a property value. Day Score, Focus Score, Streak Bar — they all update instantly. No manual work needed." },
        ]},
        { type: "toggle", text: "Can I change the layout?", children: [
          { type: "paragraph", text: "Absolutely! Drag blocks to rearrange, delete sections you don't use, add new ones. This is YOUR system — customize it to match how YOUR brain works." },
        ]},
        { type: "divider" },
        { type: "paragraph", text: "Made with ❤️ by CraftPlan Digital — You've got this! 🚀", italic: true },
      ],
    },
    {
      name: "📋 Weekly Review",
      icon: "📋",
      blocks: [
        { type: "heading_1" as const, text: "📋 Weekly Review" },
        createCallout("Complete this every Sunday. Takes ~10 minutes. Your future self will thank you.", "📋", { color: `${palette.accent}_background` }),
        { type: "divider" as const },
        { type: "heading_2" as const, text: "🏆 What went well this week?" },
        { type: "paragraph" as const, text: "List your wins — even small ones count. Especially small ones.", italic: true },
        { type: "bulleted_list_item" as const, text: "[Write your wins here]" },
        { type: "divider" as const },
        { type: "heading_2" as const, text: "😤 What drained me?" },
        { type: "paragraph" as const, text: "What tasks, people, or situations sucked your energy?", italic: true },
        { type: "bulleted_list_item" as const, text: "[Write here]" },
        { type: "divider" as const },
        { type: "heading_2" as const, text: "🎯 Next week's #1 priority" },
        { type: "paragraph" as const, text: "If you could only accomplish ONE thing, what would it be?", italic: true },
        { type: "bulleted_list_item" as const, text: "[Write here]" },
        { type: "divider" as const },
        { type: "heading_2" as const, text: "⚡ Energy Pattern Check" },
        { type: "bulleted_list_item" as const, text: "Best focus time this week: ___" },
        { type: "bulleted_list_item" as const, text: "Hardest day: ___" },
        { type: "bulleted_list_item" as const, text: "What I'll do differently: ___" },
        { type: "divider" as const },
        { type: "heading_2" as const, text: "📊 Quick Stats (fill from your databases)" },
        { type: "bulleted_list_item" as const, text: "Tasks completed: ___" },
        { type: "bulleted_list_item" as const, text: "Focus sessions: ___" },
        { type: "bulleted_list_item" as const, text: "Habit streak longest: ___" },
        { type: "bulleted_list_item" as const, text: "Average mood: ___" },
        { type: "bulleted_list_item" as const, text: "Brain dumps processed: ___" },
      ],
    },
  ];

  applyPropertyDescriptions("adhd_planner", databases);

  return {
    id: "adhd_planner",
    name,
    icon,
    cover: getCover("adhd_planner"),
    description: tagline,
    dashboardBlocks,
    footerBlocks,
    databases,
    sections,
    subPages,
  };
}

// ═══════════════════════════════════════════════════════════
// TEMPLATE: Finance & Budget Tracker
// ═══════════════════════════════════════════════════════════

function computeSpentForBudget(category: string, transactions: typeof FIN_TRANSACTION_POOL): number {
  return transactions
    .filter(t => t.type === "Expense" && t.category === category && t.daysAgo <= 30)
    .reduce((sum, t) => sum + t.amount, 0);
}

export function getFinanceTrackerSpec(aesthetic: string): NotionTemplateSpec {
  const colors = getColors(aesthetic);
  const palette = AESTHETIC_COLORS[aesthetic] || AESTHETIC_COLORS.minimal;
  const name = pickOne(FINANCE_NAMES);
  const tagline = pickOne(FINANCE_TAGLINES);
  const icon = pickOne(FINANCE_ICONS);

  // Sample data
  const wallets = WALLET_POOL;
  const transactions = FIN_TRANSACTION_POOL;
  const budgets = FIN_BUDGET_POOL;
  const goals = FIN_GOAL_POOL;
  const netWorthData = FIN_NET_WORTH_POOL;

  // Compute budget spent from sample transactions
  const budgetsWithSpent = budgets.map(b => ({
    ...b,
    spent: computeSpentForBudget(b.category, transactions),
  }));

  // ── 5 DATABASES ──
  const databases: DatabaseSpec[] = [
    // Database 1: Wallets
    {
      key: "wallets",
      name: "Wallets",
      icon: "💳",
      properties: [
        { name: "Name", type: "title", description: "Wallet or account name" },
        { name: "Type", type: "select", options: [
          { name: "Cash", color: colors[0] }, { name: "Bank", color: colors[1] },
          { name: "Investment", color: colors[2] }, { name: "Credit", color: colors[3] },
          { name: "Crypto", color: colors[4] }, { name: "Savings", color: colors[0] },
        ]},
        { name: "Balance", type: "number", numberFormat: "euro" },
        { name: "Currency", type: "select", options: [
          { name: "EUR", color: colors[0] }, { name: "USD", color: colors[1] }, { name: "GBP", color: colors[2] },
        ]},
        { name: "Color", type: "select", options: [
          { name: "Green", color: "green" }, { name: "Blue", color: "blue" },
          { name: "Purple", color: "purple" }, { name: "Orange", color: "orange" },
          { name: "Yellow", color: "yellow" }, { name: "Red", color: "red" },
        ]},
        { name: "Is Active", type: "checkbox" },
        { name: "Notes", type: "rich_text" },
      ],
      sampleData: wallets.map(w => ({
        Name: w.name,
        Type: w.type,
        Balance: w.balance,
        Currency: w.currency,
        Color: w.color,
        "Is Active": true,
        _cover: w._cover,
        _icon: w._icon,
      })),
    },

    // Database 2: Transactions
    {
      key: "transactions",
      name: "Transactions",
      icon: "💰",
      properties: [
        { name: "Name", type: "title", description: "Transaction description" },
        { name: "Amount", type: "number", numberFormat: "euro" },
        { name: "Type", type: "select", options: [
          { name: "Expense", color: colors[4] },
          { name: "Income", color: colors[3] },
          { name: "Transfer", color: colors[2] },
        ]},
        { name: "Category", type: "select", options: [
          { name: "Salary", color: colors[0] }, { name: "Freelance", color: colors[1] },
          { name: "Side Hustle", color: colors[2] }, { name: "Investments", color: colors[3] },
          { name: "Housing", color: colors[4] }, { name: "Food & Dining", color: colors[0] },
          { name: "Utilities", color: colors[1] }, { name: "Health", color: colors[2] },
          { name: "Shopping", color: colors[3] }, { name: "Subscriptions", color: colors[4] },
          { name: "Savings", color: colors[0] }, { name: "Entertainment", color: colors[1] },
          { name: "Transportation", color: colors[2] },
        ]},
        { name: "Wallet", type: "relation", relationDbKey: "wallets" },
        { name: "Date", type: "date" },
        { name: "Month", type: "formula", formula: `formatDate(prop("Date"), "MMMM YYYY")` },
        { name: "Week", type: "formula", formula: `"W" + format(ceil(toNumber(formatDate(prop("Date"), "D")) / 7))` },
        { name: "Is Recurring", type: "checkbox" },
        { name: "Notes", type: "rich_text" },
        { name: "Status", type: "select", options: [
          { name: "Pending", color: colors[1] },
          { name: "Cleared", color: colors[3] },
          { name: "Reconciled", color: colors[2] },
        ]},
      ],
      sampleData: transactions.map(t => ({
        Name: t.name,
        Amount: t.amount,
        Type: t.type,
        Category: t.category,
        Date: getPastDate(t.daysAgo),
        "Is Recurring": t.recurring,
        Status: t.status,
      })),
    },

    // Database 3: Budgets
    {
      key: "budgets",
      name: "Budgets",
      icon: "📊",
      properties: [
        { name: "Category", type: "title", description: "Budget category name" },
        { name: "Monthly Limit", type: "number", numberFormat: "euro" },
        { name: "Spent This Month", type: "number", numberFormat: "euro" },
        { name: "Remaining", type: "formula", formula: `prop("Monthly Limit") - prop("Spent This Month")` },
        { name: "Usage %", type: "formula", formula: `if(prop("Monthly Limit") == 0, 0, round(prop("Spent This Month") / prop("Monthly Limit") * 100))` },
        { name: "Status", type: "formula", formula: `if(prop("Monthly Limit") == 0, "⚪ No Budget", if(prop("Spent This Month") / prop("Monthly Limit") <= 0.5, "🟢 Healthy", if(prop("Spent This Month") / prop("Monthly Limit") <= 0.8, "🟡 Caution", if(prop("Spent This Month") / prop("Monthly Limit") <= 1, "🟠 Tight", "🔴 Over Budget"))))` },
        { name: "Period", type: "select", options: [
          { name: "March 2026", color: colors[0] },
          { name: "February 2026", color: colors[1] },
          { name: "January 2026", color: colors[2] },
        ]},
      ],
      sampleData: budgetsWithSpent.map(b => ({
        Category: b.category,
        "Monthly Limit": b.limit,
        "Spent This Month": b.spent,
        Period: "March 2026",
      })),
    },

    // Database 4: Financial Goals
    {
      key: "financial_goals",
      name: "Financial Goals",
      icon: "🎯",
      properties: [
        { name: "Goal", type: "title", description: "What you're saving for" },
        { name: "Target Amount", type: "number", numberFormat: "euro" },
        { name: "Current Amount", type: "number", numberFormat: "euro" },
        { name: "Progress %", type: "formula", formula: `if(prop("Target Amount") == 0, 0, round(prop("Current Amount") / prop("Target Amount") * 100))` },
        { name: "Progress Bar", type: "formula", formula: `slice("██████████", 0, min(floor(prop("Current Amount") / max(prop("Target Amount"), 1) * 10), 10)) + slice("░░░░░░░░░░", 0, max(10 - floor(prop("Current Amount") / max(prop("Target Amount"), 1) * 10), 0)) + " " + format(round(prop("Current Amount") / max(prop("Target Amount"), 1) * 100)) + "%"` },
        { name: "Target Date", type: "date" },
        { name: "Days Left", type: "formula", formula: `if(empty(prop("Target Date")), "", format(dateBetween(prop("Target Date"), now(), "days")) + " days")` },
        { name: "Category", type: "select", options: [
          { name: "Safety Net", color: colors[0] }, { name: "Travel", color: colors[1] },
          { name: "Investing", color: colors[2] }, { name: "Big Purchase", color: colors[3] },
          { name: "Education", color: colors[4] },
        ]},
        { name: "Status", type: "select", options: [
          { name: "Active", color: colors[3] }, { name: "Paused", color: colors[1] },
          { name: "Achieved", color: colors[2] },
        ]},
        { name: "Linked Wallet", type: "relation", relationDbKey: "wallets" },
        { name: "Monthly Contribution", type: "number", numberFormat: "euro" },
      ],
      sampleData: goals.map(g => ({
        Goal: g.goal,
        "Target Amount": g.target,
        "Current Amount": g.current,
        "Target Date": getFutureDate(g.targetDays),
        Category: g.category,
        Status: g.status,
        "Monthly Contribution": g.monthly,
      })),
    },

    // Database 5: Net Worth Tracker
    {
      key: "net_worth",
      name: "Net Worth Tracker",
      icon: "📈",
      properties: [
        { name: "Month", type: "title", description: "Monthly snapshot label" },
        { name: "Total Assets", type: "number", numberFormat: "euro" },
        { name: "Total Liabilities", type: "number", numberFormat: "euro" },
        { name: "Net Worth", type: "formula", formula: `prop("Total Assets") - prop("Total Liabilities")` },
        { name: "Change from Last Month", type: "number", numberFormat: "euro" },
        { name: "Change %", type: "formula", formula: `if(prop("Change from Last Month") == 0, "—", if(prop("Change from Last Month") > 0, "+" + format(round(prop("Change from Last Month") / max(prop("Total Assets") - prop("Change from Last Month"), 1) * 100)) + "%", format(round(prop("Change from Last Month") / max(abs(prop("Total Assets")) + abs(prop("Change from Last Month")), 1) * 100)) + "%"))` },
        { name: "Notes", type: "rich_text" },
      ],
      sampleData: netWorthData.map(nw => ({
        Month: nw.month,
        "Total Assets": nw.assets,
        "Total Liabilities": nw.liabilities,
        "Change from Last Month": nw.change,
      })),
    },
  ];

  // ── SECTIONS (hub-style grouping) ──
  const sections: TemplateSection[] = [
    {
      key: "accounts_tracking",
      name: "Accounts & Tracking",
      icon: "💳",
      description: "Your financial accounts and every transaction logged in one place. Link transactions to wallets for per-account tracking.",
      databaseKeys: ["wallets", "transactions"],
      tips: [
        "Switch Wallets to Gallery view for visual wallet cards with cover images",
        "Use the Month formula to filter transactions by month for quick totals",
        "Check 'Is Recurring' on fixed costs — create a filtered view to see all recurring expenses",
      ],
      viewSuggestions: [
        "Gallery view for Wallets — visual account cards with cover images and balances",
        "Board view for Transactions grouped by Type — Income vs Expense vs Transfer",
        "Filter: This month's Transactions — quick monthly spending view",
        "Filter: Is Recurring = true — all your fixed costs in one view",
      ],
    },
    {
      key: "budget_planning",
      name: "Budget & Planning",
      icon: "📊",
      description: "Set monthly spending limits and watch the Budget Health formula auto-classify 🟢🟡🟠🔴 as you spend.",
      databaseKeys: ["budgets"],
      tips: [
        "The Status formula auto-shows 🟢 Healthy → 🟡 Caution → 🟠 Tight → 🔴 Over Budget",
        "Create a Board view grouped by Status for an at-a-glance budget health overview",
        "Duplicate budget rows each month — just update the Period and reset Spent This Month",
      ],
      viewSuggestions: [
        "Board view grouped by Status — see 🟢🟡🟠🔴 budget health at a glance",
        "Sort by Usage % descending — spot which budgets are tightest",
        "Gallery view — visual budget cards showing remaining amounts",
      ],
    },
    {
      key: "growth_goals",
      name: "Growth & Goals",
      icon: "🎯",
      description: "Financial goals with automatic progress bars and net worth tracking over time. Watch your wealth grow month by month.",
      databaseKeys: ["financial_goals", "net_worth"],
      tips: [
        "Update Financial Goals monthly — the Progress Bar fills automatically as amounts change",
        "Add a Net Worth snapshot on the 1st of each month to see your wealth trend",
        "Link goals to wallets to see which accounts are funding which dreams",
      ],
      viewSuggestions: [
        "Gallery view for Goals — visual cards showing progress bars and amounts",
        "Filter: Status = Active — current savings goals only",
        "Sort Net Worth by Month — see your wealth trend over time",
      ],
    },
  ];

  // ── DASHBOARD BLOCKS (root hub page) ──
  // Order: Header (filtered) → Command Center → Today Dashboard → Daily Widget → Navigation
  const dashboardBlocks: BlockSpec[] = [
    // ── Header (indices 0-3 filtered by premium framework) ──
    { type: "heading_1", text: `${icon} ${name}` },
    { type: "quote", text: tagline, italic: true },
    createCallout("💰 ALL CALCULATIONS ARE AUTOMATIC — Budget health, progress bars, savings tracking, and net worth update instantly when you add transactions.", "💰", { color: "yellow_background" }),
    { type: "divider" },

    // ── Command Center (5 product-style action buttons) ──
    ...buildCommandCenter([
      { icon: "💳", label: "Log Transaction", description: "Record income, expense, or transfer instantly." },
      { icon: "📊", label: "Check Budgets", description: "See 🟢🟡🟠🔴 health for every category." },
      { icon: "🎯", label: "Update Goal", description: "Track progress toward savings targets." },
      { icon: "📈", label: "Log Net Worth", description: "Add this month's total wealth snapshot." },
      { icon: "🏦", label: "Add Account", description: "Register a new bank account or wallet." },
    ], palette),

    // ── Daily Ritual (functional morning/evening checklist) ──
    ...buildDailyRitual([
      "Log yesterday's remaining transactions",
      "Check budget health indicators",
      "Review upcoming recurring charges",
      "Verify savings goal progress",
    ], [
      "Log today's remaining expenses",
      "Review daily spending total",
      "Check if any bills are due this week",
      "Update savings balance if payday",
    ], { title: "Quick Money Note — expenses, reminders, or ideas", icon: "💡", items: [
      "Expense to log later...",
      "Bill to track...",
      "Savings idea...",
    ]}, palette),

    // ── Monthly Snapshot (daily widget) ──
    createCallout("📊 MONTHLY SNAPSHOT", "📊", { color: "blue_background", bold: true }),
    { type: "column_list", columns: [
      [
        createCallout("INCOME & EXPENSES\n\n→ Open 💳 Accounts & Tracking\n→ Filter by this month\n→ Compare Income vs Expenses\n→ Check recurring costs", "💰", { color: `${palette.secondary}_background` }),
      ],
      [
        createCallout("SAVINGS PROGRESS\n\n→ Open 🎯 Growth & Goals\n→ Check progress bars\n→ Update current amounts\n→ Log net worth snapshot", "🎯", { color: `${palette.accent}_background` }),
      ],
    ]},

    // ── Life Area Navigation ──
    ...buildSectionCards(sections, databases, palette),
  ];

  // ── FOOTER BLOCKS (after section cards on root page) ──
  const footerBlocks: BlockSpec[] = [
    createCallout("📊 ADD LIVE CHARTS (2 minutes)\n\nClick + on this page → type \"Chart\":\n• Bar chart → Transactions → X: Month, Y: Amount, Group by: Type → income vs expenses\n• Donut chart → Budgets → group by Status → see 🟢🟡🟠🔴 at a glance\n• Line chart → Net Worth Tracker → X: Month, Y: Net Worth → wealth trend", "📊", { color: "blue_background" }),
    { type: "toggle", text: "📖 Setup Guide — Get Started in 5 Minutes", children: [
      { type: "numbered_list_item", text: "Open 💳 Accounts & Tracking — add your bank accounts, then log income and expenses" },
      { type: "numbered_list_item", text: "Open 📊 Budget & Planning — set monthly spending limits per category" },
      { type: "numbered_list_item", text: "Open 🎯 Growth & Goals — define savings targets and track net worth monthly" },
      { type: "numbered_list_item", text: "Delete the sample data and start tracking your real finances!" },
    ]},
  ];

  // ── Start Here Sub-Page ──
  const financeStartHere: PageSpec = {
    name: "🚀 Start Here",
    icon: "🚀",
    cover: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1500&h=600&fit=crop&fm=jpg&q=80",
    blocks: [
      { type: "heading_1", text: "🚀 Welcome to Your Finance Tracker OS" },
      createCallout("This is your complete financial command center. 5 interconnected databases track your wallets, transactions, budgets, goals, and net worth — all with automatic calculations.", "💰", { color: "blue_background" }),
      { type: "divider" },

      { type: "heading_2", text: "⚡ Quick Setup (5 minutes)" },
      { type: "numbered_list_item", text: "💳 Wallets — Add your accounts (checking, savings, investments, cash). Switch to Gallery view for visual cards with covers." },
      { type: "numbered_list_item", text: "💰 Transactions — Log income, expenses, and transfers. Link each to a wallet. Use Board view grouped by Type for a quick overview." },
      { type: "numbered_list_item", text: "📊 Budgets — Set spending limits per category. The Status formula auto-shows 🟢🟡🟠🔴 as you spend." },
      { type: "numbered_list_item", text: "🎯 Financial Goals — Define savings targets with deadlines. Progress bars fill automatically as you update amounts." },
      { type: "numbered_list_item", text: "📈 Net Worth — Add a monthly snapshot. Track your wealth growth over time." },
      { type: "divider" },

      { type: "heading_2", text: "💡 Pro Tips" },
      { type: "toggle", text: "🔁 Set up recurring transactions", children: [
        { type: "paragraph", text: "Check 'Is Recurring' on regular transactions (rent, salary, subscriptions). Create a 'Recurring' view filtered by Is Recurring = true to see all your fixed costs." },
      ]},
      { type: "toggle", text: "📊 Create custom views for insights", children: [
        { type: "paragraph", text: "Transactions: Add a Board view grouped by Category to see spending breakdown. Add a Calendar view by Date for a spending timeline. Create a 'This Month' filter view." },
      ]},
      { type: "toggle", text: "💳 Use wallet gallery for at-a-glance balances", children: [
        { type: "paragraph", text: "Each wallet has a cover image. Switch to Gallery view and set the card preview to show Balance and Type. This gives you a visual dashboard of all your accounts." },
      ]},
      { type: "toggle", text: "🎯 Track goal progress visually", children: [
        { type: "paragraph", text: "Switch Financial Goals to Gallery view. Set the card preview to show the Progress Bar property. You'll see ██████░░░░ 60% at a glance for every goal." },
      ]},
      { type: "toggle", text: "📈 Monthly net worth ritual", children: [
        { type: "paragraph", text: "On the 1st of each month, add a new entry to Net Worth Tracker. Sum up all your asset balances and all your debts. The Change formula shows your monthly growth automatically." },
      ]},
      { type: "divider" },

      { type: "heading_2", text: "❓ FAQ" },
      { type: "toggle", text: "How do I link transactions to wallets?", children: [
        { type: "paragraph", text: "Open a transaction → click the 'Wallet' relation property → search and select the wallet. This lets you track spending per account." },
      ]},
      { type: "toggle", text: "How do I update my budget spent amount?", children: [
        { type: "paragraph", text: "Currently, 'Spent This Month' is a manual number field. At month-end, filter your Transactions by category and month, sum the expenses, and update the budget. A future version may automate this with rollups." },
      ]},
      { type: "toggle", text: "Can I use USD or GBP instead of EUR?", children: [
        { type: "paragraph", text: "Yes! Change the number format on Amount/Balance properties from Euro to Dollar or Pound. Update the Currency select on your wallets too." },
      ]},
      { type: "divider" },

      createCallout("💡 Delete all sample data before tracking real finances. The formulas and structure stay — your data replaces the examples.", "💡", { color: "yellow_background" }),
    ],
  };

  const cover = pickOne(COVER_IMAGES.finance_tracker || COVER_IMAGES.default);

  return {
    id: "finance_tracker",
    name,
    icon,
    cover,
    description: tagline,
    dashboardBlocks,
    footerBlocks,
    databases,
    sections,
    subPages: [financeStartHere],
  };
}

// ═══════════════════════════════════════════════════════════
// TEMPLATE: All-in-One Life Planner
// ═══════════════════════════════════════════════════════════

export function getLifePlannerSpec(aesthetic: string): NotionTemplateSpec {
  const colors = getColors(aesthetic);
  const palette = AESTHETIC_COLORS[aesthetic] || AESTHETIC_COLORS.minimal;
  const name = pickOne(LIFE_NAMES);
  const tagline = pickOne(LIFE_TAGLINES);
  const icon = pickOne(LIFE_ICONS);

  const tasks = pickN(TASK_POOL, 10);
  const goals = pickN(GOAL_POOL, 6);
  const habits = pickN(HABIT_POOL, 7);
  const journals = pickN(JOURNAL_POOL, 4);
  const books = pickN(READING_POOL, 6);

  // Compute current week date range for the dashboard
  const _now = new Date();
  const _mon = new Date(_now);
  _mon.setDate(_now.getDate() - _now.getDay() + 1);
  const _sun = new Date(_mon);
  _sun.setDate(_mon.getDate() + 6);
  const weekRange = "[" + _mon.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) + "] → [" + _sun.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) + "]";

  const databases: DatabaseSpec[] = [
    {
      key: "tasks_goals",
      name: "Tasks & Goals",
      icon: "📋",
      properties: [
        { name: "Name", type: "title" },
        { name: "Type", type: "select", options: [
          { name: "Task", color: colors[2] }, { name: "Goal", color: colors[3] },
        ]},
        { name: "Status", type: "select", options: [
          { name: "To Do", color: colors[0] }, { name: "In Progress", color: colors[2] },
          { name: "Done", color: colors[3] }, { name: "Blocked", color: colors[4] },
          { name: "Active", color: colors[1] }, { name: "Achieved", color: colors[3] },
          { name: "Paused", color: colors[0] },
        ]},
        { name: "Priority", type: "select", options: [
          { name: "High", color: colors[4] }, { name: "Medium", color: colors[1] }, { name: "Low", color: colors[0] },
        ]},
        { name: "Due Date", type: "date" },
        { name: "Area", type: "select", options: [
          { name: "Career", color: colors[2] }, { name: "Health", color: colors[3] },
          { name: "Finance", color: colors[0] }, { name: "Learning", color: colors[4] },
          { name: "Personal", color: colors[1] }, { name: "Relationships", color: colors[4] },
        ]},
        { name: "Progress", type: "number" },
        { name: "Progress Bar", type: "formula", formula: `if(prop("Type") != "Goal", "", slice("██████████", 0, floor(prop("Progress") / 10)) + slice("░░░░░░░░░░", 0, 10 - floor(prop("Progress") / 10)) + " " + format(round(prop("Progress"))) + "%")` },
        { name: "Timeline", type: "select", options: [
          { name: "Q1 2026", color: colors[3] }, { name: "Q2 2026", color: colors[2] },
          { name: "This Year", color: colors[1] }, { name: "Long-term", color: colors[0] },
        ]},
        { name: "Parent Goal", type: "relation", relationDbKey: "tasks_goals" },
        { name: "Days Left", type: "formula", formula: `if(prop("Type") != "Task", "", if(empty(prop("Due Date")), "—", if(dateBetween(prop("Due Date"), now(), "days") < 0, "🔴 Overdue", format(dateBetween(prop("Due Date"), now(), "days")) + "d")))` },
        { name: "Urgency Score", type: "formula", formula: `if(prop("Type") != "Task", "", if(empty(prop("Due Date")), "📋 Backlog", if(dateBetween(prop("Due Date"), now(), "days") < 0, "🔴 Overdue!", if(dateBetween(prop("Due Date"), now(), "days") <= 2, "🟡 Urgent", if(dateBetween(prop("Due Date"), now(), "days") <= 7, "🟢 This Week", "📅 Scheduled")))))` },
        { name: "Goal Momentum", type: "formula", formula: `if(prop("Type") != "Goal", "", if(prop("Progress") >= 75, "🚀 Almost There!", if(prop("Progress") >= 50, "💪 Halfway!", if(prop("Progress") >= 25, "🌱 Growing", "🏁 Just Started"))))` },
        { name: "Why This Matters", type: "rich_text" },
        { name: "Notes", type: "rich_text" },
        { name: "Created", type: "created_time" },
      ],
      sampleData: [
        ...tasks.map(t => ({
          Name: t.name,
          Type: "Task",
          Status: t.status === "Not Started" ? "To Do" : t.status === "Blocked" ? "To Do" : t.status,
          Priority: t.priority === "Urgent" ? "High" : t.priority,
          "Due Date": getFutureDate(t.due),
          Area: pickOne(["Career", "Personal", "Health", "Finance", "Learning"]),
          Notes: t.notes,
        })),
        ...goals.map(g => {
          const whyMap: Record<string, string> = {
            "Health": "Physical health is the foundation everything else is built on",
            "Career": "I want to prove to myself I can reach the next level",
            "Personal Growth": "Becoming a better version of myself every single day",
            "Finances": "Financial security means freedom to make choices without fear",
            "Relationships": "The people in my life deserve my best energy",
          };
          const areaMap: Record<string, string> = {
            "Personal Growth": "Personal", "Finances": "Finance",
          };
          return {
            Name: g.name,
            Type: "Goal",
            Status: g.status === "Planning" ? "Active" : g.status,
            Area: areaMap[g.area] || g.area,
            Progress: g.progress,
            Timeline: pickOne(["Q1 2026", "Q2 2026", "This Year", "Long-term"]),
            "Why This Matters": whyMap[g.area] || "This goal aligns with who I want to become",
          };
        }),
      ],
    },
    {
      key: "habits_wellness",
      name: "Habits & Wellness",
      icon: "💪",
      properties: [
        { name: "Habit", type: "title" },
        { name: "Area", type: "select", options: [
          { name: "Health", color: colors[3] }, { name: "Mind", color: colors[2] },
          { name: "Work", color: colors[1] }, { name: "Self-Care", color: colors[0] },
        ]},
        { name: "Streak", type: "number" },
        { name: "Streak Bar", type: "formula", formula: `if(prop("Streak") >= 30, "🔥🔥🔥 " + format(prop("Streak")) + "d", if(prop("Streak") >= 14, "🔥🔥 " + format(prop("Streak")) + "d", if(prop("Streak") >= 7, "🔥 " + format(prop("Streak")) + "d", if(prop("Streak") >= 1, "✨ " + format(prop("Streak")) + "d", "Start!"))))` },
        { name: "Today", type: "checkbox" },
        { name: "Frequency", type: "select", options: [
          { name: "Daily", color: colors[3] }, { name: "Weekdays", color: colors[2] },
          { name: "3x/week", color: colors[1] },
        ]},
        { name: "Time of Day", type: "select", options: [
          { name: "Morning", color: colors[1] }, { name: "Afternoon", color: colors[2] },
          { name: "Evening", color: colors[0] }, { name: "Anytime", color: colors[3] },
        ]},
      ],
      sampleData: habits.map(h => ({
        Habit: h.name, Area: pickOne(["Health", "Mind", "Work", "Self-Care"]),
        Streak: h.streak, Today: h.streak > 5,
        Frequency: h.freq, "Time of Day": pickOne(["Morning", "Afternoon", "Evening", "Anytime"]),
      })),
    },
    {
      key: "journal_notes",
      name: "Journal & Notes",
      icon: "📝",
      properties: [
        { name: "Entry", type: "title" },
        { name: "Type", type: "select", options: [
          { name: "Journal", color: colors[3] }, { name: "Note", color: colors[2] },
          { name: "Idea", color: colors[1] }, { name: "Meeting", color: colors[4] },
        ]},
        { name: "Date", type: "date" },
        { name: "Mood", type: "select", options: [
          { name: "Great", color: colors[3] }, { name: "Good", color: colors[2] },
          { name: "Okay", color: colors[1] }, { name: "Low", color: colors[4] },
        ]},
        { name: "Category", type: "select", options: [
          { name: "Work", color: colors[2] }, { name: "Personal", color: colors[1] },
          { name: "Idea", color: colors[3] }, { name: "Learning", color: colors[0] },
          { name: "Meeting", color: colors[4] },
        ]},
        { name: "Priority", type: "select", options: [
          { name: "High", color: colors[4] }, { name: "Medium", color: colors[1] }, { name: "Low", color: colors[0] },
        ]},
        { name: "Tags", type: "multi_select", options: [
          { name: "Reference", color: colors[0] }, { name: "Action Item", color: colors[4] },
          { name: "Inspiration", color: colors[3] }, { name: "Project", color: colors[2] },
        ]},
        { name: "Content", type: "rich_text" },
        { name: "Gratitude", type: "rich_text" },
        { name: "Reflection Depth", type: "formula", formula: `if(prop("Type") != "Journal", "", if(length(prop("Gratitude")) > 50 and length(prop("Content")) > 50, "🌟 Deep Reflection", if(length(prop("Gratitude")) > 20, "📝 Good Entry", "✏️ Quick Note")))` },
        { name: "Created", type: "created_time" },
      ],
      sampleData: [
        ...journals.map((j, i) => ({
          Entry: `Day ${i + 1} Reflection`,
          Type: "Journal",
          Date: getPastDate(journals.length - i),
          Mood: j.mood,
          Gratitude: j.gratitude,
          Content: j.wins,
        })),
        { Entry: "App idea: habit tracker with AI coaching", Type: "Idea", Category: "Idea", Priority: "Medium" },
        { Entry: "Team meeting notes — Q1 planning", Type: "Meeting", Category: "Meeting", Priority: "High" },
        { Entry: "Book recommendation from friend: Sapiens", Type: "Note", Category: "Personal", Priority: "Low" },
        { Entry: "Research: best productivity methods for 2026", Type: "Note", Category: "Learning", Priority: "Medium" },
        { Entry: "Birthday gift ideas for family", Type: "Note", Category: "Personal", Priority: "Medium" },
        { Entry: "Side project brainstorm: online course", Type: "Idea", Category: "Idea", Priority: "High" },
      ],
    },
    {
      key: "reading_learning",
      name: "Reading & Learning",
      icon: "📚",
      properties: [
        { name: "Title", type: "title" },
        { name: "Author", type: "rich_text" },
        { name: "Status", type: "select", options: [
          { name: "Want to Read", color: colors[0] }, { name: "Reading", color: colors[2] },
          { name: "Finished", color: colors[3] }, { name: "Abandoned", color: colors[4] },
        ]},
        { name: "Genre", type: "select", options: [
          { name: "Self-Help", color: colors[1] }, { name: "Business", color: colors[2] },
          { name: "Fiction", color: colors[3] }, { name: "Science", color: colors[0] },
          { name: "Biography", color: colors[4] },
        ]},
        { name: "Rating", type: "rich_text" },
        { name: "Date Finished", type: "date" },
        { name: "Key Takeaways", type: "rich_text" },
      ],
      sampleData: books.map(b => ({
        Title: b.title, Author: b.author, Status: b.status,
        Genre: b.genre, Rating: b.rating,
        "Date Finished": b.status === "Finished" ? getPastDate(Math.floor(Math.random() * 90)) : undefined,
        "Key Takeaways": b.status === "Finished" ? "Great insights on personal development" : "",
      })),
    },
  ];

  // ── SECTIONS (hub-style grouping) ──
  const sections: TemplateSection[] = [
    {
      key: "planning_action",
      name: "Planning & Action",
      icon: "📋",
      description: "Tasks and goals in one unified database. Link tasks to goals, track urgency, and watch progress bars fill automatically.",
      databaseKeys: ["tasks_goals"],
      tips: [
        "Use the Type column to switch between Task and Goal views — filter for focused lists",
        "Link tasks to goals with the Parent Goal relation to see which actions move the needle",
        "The Urgency Score formula auto-classifies: 🔴 Overdue → 🟡 Urgent → 🟢 This Week → 📅 Scheduled",
      ],
      viewSuggestions: [
        "Board view grouped by Status — Kanban-style task flow",
        "Filter: Type = Goal — goals-only view with progress bars",
        "Filter: Type = Task, Priority = High — today's top priorities",
        "Calendar view by Due Date — visual weekly planning",
      ],
    },
    {
      key: "growth_reflection",
      name: "Growth & Reflection",
      icon: "🌱",
      description: "Journal entries, notes, ideas, and your reading list — all the inputs that fuel personal growth and self-awareness.",
      databaseKeys: ["journal_notes", "reading_learning"],
      tips: [
        "Write journal entries daily — the Reflection Depth formula rewards detailed entries with 🌟",
        "Use the Category filter to separate Journal, Note, Idea, and Meeting entries",
        "Track your reading with status updates — Want to Read → Reading → Finished",
      ],
      viewSuggestions: [
        "Calendar view for Journal — daily entries on a calendar",
        "Filter: Type = Journal — reflections only",
        "Board view for Reading grouped by Status — Want to Read → Reading → Finished",
        "Filter: Type = Idea — your idea backlog for future projects",
      ],
    },
    {
      key: "wellness_habits",
      name: "Wellness & Habits",
      icon: "💪",
      description: "Daily habits with streak tracking and visual progress bars. Start small, build momentum, and watch your streaks grow.",
      databaseKeys: ["habits_wellness"],
      tips: [
        "Start with just 3 habits — you can always add more once streaks are solid",
        "Check 'Today' each day and your Streak Bar updates: ✨ → 🔥 → 🔥🔥 → 🔥🔥🔥",
        "Use a Board view grouped by Area to see Health, Mind, Work, and Self-Care habits separately",
      ],
      viewSuggestions: [
        "Board view grouped by Area — Health, Mind, Work, Self-Care at a glance",
        "Sort by Streak descending — celebrate your longest streaks",
        "Filter: Today = true — today's habit checklist",
        "Filter: Frequency = Daily — your core daily habits",
      ],
    },
  ];

  // ── DASHBOARD BLOCKS (root hub page) ──
  // Order: Header (filtered) → Command Center → Today Dashboard → Daily Widget → Navigation
  const dashboardBlocks: BlockSpec[] = [
    // ── Header (indices 0-3 filtered by premium framework) ──
    { type: "heading_1", text: `${icon} ${name}` },
    { type: "quote", text: tagline, italic: true },
    createCallout("🌟 ALL TRACKING IS AUTOMATIC — Progress bars, streak counts, and days-left indicators update instantly when you edit data.", "🌟", { color: "yellow_background" }),
    { type: "divider" },

    // ── Command Center (5 product-style action buttons) ──
    ...buildCommandCenter([
      { icon: "✅", label: "New Task", description: "Add a task with priority, area, and due date." },
      { icon: "🎯", label: "Set Goal", description: "Define a goal with progress tracking." },
      { icon: "✍️", label: "Journal Entry", description: "Write a reflection with mood and energy." },
      { icon: "✅", label: "Log Habit", description: "Check in on today's habits. Grow streaks." },
      { icon: "📋", label: "Plan Today", description: "Set your priorities using the checklist below." },
    ], palette),

    // ── Daily Ritual (functional morning/evening checklist) ──
    ...buildDailyRitual([
      "Review your top 3 goals for the week",
      "Pick today's priority tasks",
      "Check your habit streaks",
      "Set an intention for today",
    ], [
      "Mark completed tasks as Done",
      "Update goal progress percentages",
      "Write a journal entry",
      "Check off today's habits",
      "Plan tomorrow's top 3",
    ], { title: "Quick Thought — capture and move to Journal later", icon: "✍️", items: [
      "Task to add later...",
      "Thought to journal about...",
      "Goal idea to explore...",
    ]}, palette),

    // ── Life Area Navigation ──
    ...buildSectionCards(sections, databases, palette),
  ];

  // ── FOOTER BLOCKS (after section cards on root page) ──
  const footerBlocks: BlockSpec[] = [
    createCallout("📊 ADD LIVE CHARTS (2 minutes)\n\nClick + on this page → type \"Chart\" → select chart type:\n• Bar chart → Tasks & Goals → X: Area, Y: Count → tasks by area\n• Bar chart → Habits & Wellness → X: Habit, Y: Streak → habit streaks\n• Pie chart → Tasks & Goals → Group by: Status → completion overview", "📊", { color: "blue_background" }),
    { type: "toggle", text: "📖 Setup Guide — 5 Steps to Get Started", children: [
      { type: "numbered_list_item", text: "Open 📋 Planning & Action — add your top 3 goals (Type: Goal) and this week's tasks" },
      { type: "numbered_list_item", text: "Open 🌱 Growth & Reflection — write your first journal entry and add books to your list" },
      { type: "numbered_list_item", text: "Open 💪 Wellness & Habits — set up 3 habits and check 'Today' to start your streak" },
      { type: "numbered_list_item", text: "Delete sample data and make this system your own!" },
    ]},
  ];

  const lifeStartHere: PageSpec = {
    name: "🚀 Start Here",
    icon: "🚀",
    cover: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1500",
    blocks: [
      { type: "heading_1", text: `Welcome to ${name}!` },
      createCallout("This template brings your tasks, goals, habits, journal, notes, and reading list into one streamlined system. Everything is connected through 4 focused databases. Follow these steps to get started.", "🌟", { color: `${palette.primary}_background` }),
      { type: "divider" },
      { type: "heading_2", text: "⚡ Quick Setup (5 minutes)" },
      { type: "numbered_list_item", text: "Set your top 3 goals in 📋 Tasks & Goals — set Type to 'Goal', add 'Why This Matters' for motivation. The Goal Momentum formula rewards your progress" },
      { type: "numbered_list_item", text: "Add this week's tasks to 📋 Tasks & Goals — set Type to 'Task', link them to goals using the Parent Goal relation" },
      { type: "numbered_list_item", text: "Start your first journal entry in 📝 Journal & Notes — set Type to 'Journal'. The Reflection Depth formula rewards detail" },
      { type: "numbered_list_item", text: "Set up 3-5 habits in 💪 Habits & Wellness — check 'Today' each day and watch your Streak Bar grow" },
      { type: "numbered_list_item", text: "Delete sample data and make this system your own" },
      { type: "divider" },
      { type: "heading_2", text: "💡 Pro Tips" },
      { type: "toggle", text: "Using the merged databases", children: [
        { type: "paragraph", text: "Each merged database uses a Type column to distinguish entries. Use Notion's Filter feature to create focused views:" },
        { type: "bulleted_list_item", text: "Tasks & Goals: Filter by Type = 'Task' for a task-only view, or Type = 'Goal' for goals-only" },
        { type: "bulleted_list_item", text: "Journal & Notes: Filter by Type = 'Journal' for daily reflections, 'Note' for reference material, 'Idea' for brainstorms" },
        { type: "paragraph", text: "Tip: Save these filtered views as separate database views (Table, Board, Gallery) for quick access." },
      ]},
      { type: "toggle", text: "How Goal Momentum works", children: [
        { type: "paragraph", text: "The Goal Momentum formula gives motivational feedback: 🏁 Just Started (0-25%), 🌱 Growing (25-50%), 💪 Halfway! (50-75%), 🚀 Almost There! (75-100%). Update your Progress number regularly to see it change. Only shows for items with Type = 'Goal'." },
      ]},
      { type: "toggle", text: "Using Urgency Score for task prioritization", children: [
        { type: "paragraph", text: "Every task with a Due Date gets an auto-classified urgency: 🔴 Overdue!, 🟡 Urgent (2 days), 🟢 This Week (7 days), 📅 Scheduled (later), 📋 Backlog (no date). Use a Board view grouped by Urgency Score to see your priorities. Only shows for items with Type = 'Task'." },
      ]},
      { type: "toggle", text: "Weekly review ritual", children: [
        { type: "paragraph", text: "Every Sunday: 1) Review completed tasks, 2) Update goal progress %, 3) Write a journal entry reflecting on the week, 4) Plan next week's top 3 tasks. Takes 15 minutes and makes Monday mornings peaceful. Use the Weekly Review toggle on the dashboard." },
      ]},
      { type: "toggle", text: "Keyboard shortcuts", children: [
        { type: "bulleted_list_item", text: "/ — Open block menu" },
        { type: "bulleted_list_item", text: "Ctrl/Cmd + N — New page" },
        { type: "bulleted_list_item", text: "@ + date — Quick date entry" },
        { type: "bulleted_list_item", text: "Ctrl/Cmd + D — Duplicate a block or row" },
      ]},
      { type: "divider" },
      { type: "heading_2", text: "❓ FAQ" },
      { type: "toggle", text: "How do Tasks link to Goals?", children: [
        { type: "paragraph", text: "Both tasks and goals live in the same Tasks & Goals database. Use the 'Parent Goal' relation to link a task to a goal. Filter by Type = 'Goal' to see all goals and their linked tasks." },
      ]},
      { type: "toggle", text: "How do formulas update?", children: [
        { type: "paragraph", text: "All formulas (Days Left, Urgency Score, Progress Bar, Streak Bar, Goal Momentum, Reflection Depth) auto-calculate. Just update the input values and the formulas refresh instantly. Type-specific formulas only show values for the relevant Type." },
      ]},
      { type: "toggle", text: "Can I add new areas?", children: [
        { type: "paragraph", text: "Yes! Click the 'Area' select property in Tasks & Goals and add new options like 'Spirituality', 'Creativity', or 'Community'. Colors are assigned automatically." },
      ]},
      { type: "divider" },
      { type: "paragraph", text: "Made with ❤️ by CraftPlan Digital — Design the life you want! ✨", italic: true },
    ],
  };

  applyPropertyDescriptions("life_planner", databases);

  return {
    id: "life_planner",
    name,
    icon,
    cover: getCover("life_planner"),
    description: tagline,
    dashboardBlocks,
    footerBlocks,
    databases,
    sections,
    subPages: [lifeStartHere],
  };
}

// ═══════════════════════════════════════════════════════════
// TEMPLATE 4: Social Media Content Planner
// ═══════════════════════════════════════════════════════════

export function getSocialMediaPlannerSpec(aesthetic: string): NotionTemplateSpec {
  const colors = getColors(aesthetic);
  const palette = AESTHETIC_COLORS[aesthetic] || AESTHETIC_COLORS.minimal;
  const name = pickOne(SOCIAL_MEDIA_NAMES);
  const tagline = pickOne(SOCIAL_MEDIA_TAGLINES);
  const icon = pickOne(SOCIAL_MEDIA_ICONS);

  const posts = pickN(CONTENT_POST_POOL, 8);
  const campaigns = pickN(CAMPAIGN_POOL, 5);
  const analyticsData = pickN(ANALYTICS_POOL, 8);
  const ideas = pickN(CONTENT_IDEAS_POOL, 10);
  const assets = pickN(BRAND_ASSETS_POOL, 6);

  const publishedCount = posts.filter(p => p.status === "Published").length;
  const scheduledCount = posts.filter(p => p.status === "Scheduled").length;
  const avgEngagement = analyticsData.length > 0
    ? (analyticsData.reduce((s, a) => s + ((a.likes + a.comments + a.shares) / Math.max(a.reach, 1) * 100), 0) / analyticsData.length).toFixed(1)
    : "0.0";
  const topPlatform = (() => {
    const platCounts: Record<string, number> = {};
    analyticsData.forEach(a => { platCounts[a.platform] = (platCounts[a.platform] || 0) + a.likes; });
    return Object.entries(platCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Instagram";
  })();
  const activeCampaigns = campaigns.filter(c => c.status === "Active").length;

  const databases: DatabaseSpec[] = [
    {
      key: "content_calendar",
      name: "Content Calendar",
      icon: "📅",
      properties: [
        { name: "Post Title", type: "title" },
        { name: "Platform", type: "select", options: [
          { name: "Instagram", color: colors[4] }, { name: "TikTok", color: colors[2] },
          { name: "Pinterest", color: colors[1] }, { name: "Twitter", color: colors[0] },
          { name: "LinkedIn", color: colors[3] },
        ]},
        { name: "Content Type", type: "select", options: [
          { name: "Reel", color: colors[2] }, { name: "Carousel", color: colors[3] },
          { name: "Story", color: colors[1] }, { name: "Static", color: colors[0] },
          { name: "Thread", color: colors[4] }, { name: "Pin", color: colors[1] },
        ]},
        { name: "Status", type: "select", options: [
          { name: "Idea", color: colors[0] }, { name: "Drafting", color: colors[1] },
          { name: "Scheduled", color: colors[2] }, { name: "Published", color: colors[3] },
          { name: "Analyzing", color: colors[4] },
        ]},
        { name: "Publish Date", type: "date" },
        { name: "Caption", type: "rich_text" },
        { name: "Hashtags", type: "multi_select", options: [
          { name: "handmadejewelry", color: colors[0] }, { name: "wirejewelry", color: colors[1] },
          { name: "shopsmall", color: colors[2] }, { name: "tutorial", color: colors[3] },
          { name: "bts", color: colors[4] }, { name: "newcollection", color: colors[0] },
          { name: "customjewelry", color: colors[1] }, { name: "smallbusiness", color: colors[2] },
        ]},
        { name: "Campaign", type: "relation", relationDbKey: "campaigns" },
        { name: "Performance Tier", type: "formula", formula: `if(prop("Status") == "Published", "📊 Check Analytics", if(prop("Status") == "Scheduled", "⏰ Ready", if(prop("Status") == "Drafting", "✏️ In Progress", "💡 Idea")))` },
        { name: "Created", type: "created_time" },
      ],
      sampleData: posts.map((p, i) => ({
        "Post Title": p.title,
        Platform: p.platform,
        "Content Type": p.contentType,
        Status: p.status,
        "Publish Date": p.status === "Published" ? getPastDate(i * 3 + 1) : p.status === "Scheduled" ? getFutureDate(i * 2 + 1) : "",
        Caption: p.caption,
        Hashtags: p.hashtags,
      })),
    },
    {
      key: "campaigns",
      name: "Campaigns",
      icon: "🎯",
      properties: [
        { name: "Campaign Name", type: "title" },
        { name: "Goal", type: "select", options: [
          { name: "Brand Awareness", color: colors[0] }, { name: "Engagement", color: colors[2] },
          { name: "Sales", color: colors[3] }, { name: "Growth", color: colors[4] },
          { name: "Collab", color: colors[1] },
        ]},
        { name: "Start Date", type: "date" },
        { name: "End Date", type: "date" },
        { name: "Status", type: "select", options: [
          { name: "Planning", color: colors[0] }, { name: "Active", color: colors[3] },
          { name: "Completed", color: colors[2] }, { name: "Paused", color: colors[1] },
        ]},
        { name: "Platform Focus", type: "multi_select", options: [
          { name: "Instagram", color: colors[4] }, { name: "TikTok", color: colors[2] },
          { name: "Pinterest", color: colors[1] }, { name: "Twitter", color: colors[0] },
          { name: "LinkedIn", color: colors[3] },
        ]},
        { name: "Content Count", type: "formula", formula: `"See linked posts below"` },
        { name: "Notes", type: "rich_text" },
      ],
      sampleData: campaigns.map(c => ({
        "Campaign Name": c.name,
        Goal: c.goal,
        "Start Date": c.status === "Completed" ? getPastDate(c.daysActive + 7) : c.status === "Active" ? getPastDate(c.daysActive) : getFutureDate(7),
        "End Date": c.status === "Completed" ? getPastDate(7) : c.status === "Active" ? getFutureDate(14) : getFutureDate(21),
        Status: c.status,
        "Platform Focus": c.platformFocus,
        Notes: c.status === "Active" ? "Campaign performing well — continue pushing content" : "",
      })),
    },
    {
      key: "analytics",
      name: "Analytics",
      icon: "📊",
      properties: [
        { name: "Post Reference", type: "title" },
        { name: "Platform", type: "select", options: [
          { name: "Instagram", color: colors[4] }, { name: "TikTok", color: colors[2] },
          { name: "Pinterest", color: colors[1] }, { name: "Twitter", color: colors[0] },
        ]},
        { name: "Date", type: "date" },
        { name: "Likes", type: "number" },
        { name: "Comments", type: "number" },
        { name: "Shares", type: "number" },
        { name: "Reach", type: "number" },
        { name: "Engagement Rate", type: "formula", formula: `if(prop("Reach") == 0, "N/A", format(round((prop("Likes") + prop("Comments") + prop("Shares")) / max(prop("Reach"), 1) * 10000) / 100) + "%")` },
        { name: "Best Time", type: "select", options: [
          { name: "Morning", color: colors[1] }, { name: "Afternoon", color: colors[2] },
          { name: "Evening", color: colors[3] }, { name: "Night", color: colors[0] },
        ]},
      ],
      sampleData: analyticsData.map((a, i) => ({
        "Post Reference": a.postRef,
        Platform: a.platform,
        Date: getPastDate(i * 3 + 1),
        Likes: a.likes,
        Comments: a.comments,
        Shares: a.shares,
        Reach: a.reach,
        "Best Time": a.time,
      })),
    },
    {
      key: "content_ideas",
      name: "Content Ideas",
      icon: "💡",
      properties: [
        { name: "Idea", type: "title" },
        { name: "Category", type: "select", options: [
          { name: "Tutorial", color: colors[2] }, { name: "BTS", color: colors[1] },
          { name: "Product", color: colors[3] }, { name: "Lifestyle", color: colors[0] },
          { name: "Trending", color: colors[4] }, { name: "Educational", color: colors[2] },
        ]},
        { name: "Platform", type: "multi_select", options: [
          { name: "Instagram", color: colors[4] }, { name: "TikTok", color: colors[2] },
          { name: "Pinterest", color: colors[1] },
        ]},
        { name: "Effort Level", type: "select", options: [
          { name: "Quick", color: colors[3] }, { name: "Medium", color: colors[1] },
          { name: "Production", color: colors[4] },
        ]},
        { name: "Saved", type: "checkbox" },
        { name: "Inspiration Source", type: "rich_text" },
        { name: "Priority", type: "formula", formula: `if(prop("Saved") and prop("Effort Level") == "Quick", "⚡ Do Next", if(prop("Saved"), "📌 Saved", if(prop("Effort Level") == "Quick", "🎯 Easy Win", "📋 Backlog")))` },
      ],
      sampleData: ideas.map(i => ({
        Idea: i.idea,
        Category: i.category,
        Platform: i.platforms,
        "Effort Level": i.effort,
        Saved: i.saved,
        "Inspiration Source": i.source,
      })),
    },
    {
      key: "brand_assets",
      name: "Brand Kit",
      icon: "🎨",
      properties: [
        { name: "Asset Name", type: "title" },
        { name: "Type", type: "select", options: [
          { name: "Color Palette", color: colors[4] }, { name: "Font", color: colors[2] },
          { name: "Logo", color: colors[3] }, { name: "Template", color: colors[1] },
          { name: "Hashtag Set", color: colors[0] }, { name: "Sound", color: colors[2] },
        ]},
        { name: "Usage", type: "rich_text" },
        { name: "Link", type: "url" },
        { name: "Last Updated", type: "date" },
        { name: "Active", type: "checkbox" },
      ],
      sampleData: assets.map((a, i) => ({
        "Asset Name": a.name,
        Type: a.assetType,
        Usage: a.usage,
        "Last Updated": getPastDate(i * 7),
        Active: true,
      })),
    },
  ];

  // ── SECTIONS (hub-style grouping) ──
  const sections: TemplateSection[] = [
    {
      key: "content_production",
      name: "Content Production",
      icon: "📅",
      description: "Your content calendar and idea bank. Plan posts, schedule content, and save ideas for later — all with auto-priority sorting.",
      databaseKeys: ["content_calendar", "content_ideas"],
      tips: [
        "Use the Content Calendar in Calendar view for a visual posting schedule",
        "Mark ideas as 'Saved' — the Priority formula auto-sorts ⚡ Do Next for saved + quick ideas",
        "Batch content creation: brainstorm 10 ideas Monday, create 3-5 pieces mid-week, schedule Thursday",
      ],
      viewSuggestions: [
        "Calendar view for Content Calendar — visual posting schedule by date",
        "Board view grouped by Status — Idea → Drafting → Scheduled → Published pipeline",
        "Filter: Status = Idea — your content backlog for brainstorming",
        "Sort Content Ideas by Priority — ⚡ Do Next items first",
      ],
    },
    {
      key: "strategy_campaigns",
      name: "Strategy & Campaigns",
      icon: "🎯",
      description: "Campaign management with goal tracking and platform focus. Link posts to campaigns for organized content pushes.",
      databaseKeys: ["campaigns"],
      tips: [
        "Link Content Calendar posts to campaigns using the Campaign relation",
        "Use a Board view grouped by Status to see Planning → Active → Completed pipeline",
        "Even simple weekly themes count as campaigns — they help organize your content strategy",
      ],
      viewSuggestions: [
        "Board view grouped by Status — Planning → Active → Completed pipeline",
        "Filter: Status = Active — current campaigns with linked posts",
        "Board view grouped by Goal — see campaigns by objective",
      ],
    },
    {
      key: "performance_brand",
      name: "Performance & Brand",
      icon: "📊",
      description: "Analytics tracking with automatic engagement rate calculations and your complete brand asset kit for visual consistency.",
      databaseKeys: ["analytics", "brand_assets"],
      tips: [
        "Log analytics 48-72 hours after posting — that's when most engagement has settled",
        "Track Best Time to find your optimal posting windows for each platform",
        "Keep your Brand Kit updated — colors, fonts, hashtag sets, and audio library all in one place",
      ],
      viewSuggestions: [
        "Sort Analytics by Engagement Rate descending — your best performing content",
        "Board view grouped by Platform — per-platform performance breakdown",
        "Gallery view for Brand Kit — visual asset cards with usage notes",
        "Filter: Best Time = Evening — find your peak posting windows",
      ],
    },
  ];

  // ── DASHBOARD BLOCKS (root hub page) ──
  // Order: Header (filtered) → Command Center → Today Dashboard → Daily Widget → Navigation
  const dashboardBlocks: BlockSpec[] = [
    // ── Header (indices 0-3 filtered by premium framework) ──
    { type: "heading_1", text: `${icon} ${name}` },
    { type: "quote", text: tagline, italic: true },
    createCallout("📱 ENGAGEMENT METRICS UPDATE AUTOMATICALLY — Log your post analytics and watch engagement rates, performance tiers, and content priorities calculate instantly.", "📱", { color: "yellow_background" }),
    { type: "divider" },

    // ── Command Center (5 product-style action buttons) ──
    ...buildCommandCenter([
      { icon: "📝", label: "Plan Post", description: "Schedule a post with platform and date." },
      { icon: "💡", label: "Save Idea", description: "Capture content inspiration for later." },
      { icon: "🎯", label: "New Campaign", description: "Start an organized campaign with goals." },
      { icon: "📊", label: "Log Analytics", description: "Record post metrics and engagement rate." },
      { icon: "📅", label: "Check Schedule", description: "Review your content queue for the week." },
    ], palette),

    // ── Daily Ritual (functional morning/evening checklist) ──
    ...buildDailyRitual([
      "Check today's scheduled posts",
      "Review engagement on recent posts",
      "Brainstorm 1-2 content ideas",
      "Plan any stories or live content",
    ], [
      "Log post performance metrics",
      "Save engagement insights",
      "Review tomorrow's content queue",
      "Update campaign progress",
    ], { title: "Content Idea — capture inspiration instantly", icon: "💡", items: [
      "Post idea...",
      "Caption inspiration...",
      "Trending topic to try...",
    ]}, palette),

    // ── This Week's Content (weekly widget) ──
    createCallout("📅 THIS WEEK'S CONTENT", "📅", { color: "blue_background", bold: true }),
    { type: "column_list", columns: [
      [
        createCallout("CONTENT PIPELINE\n\n→ Open 📅 Content Production\n→ Check Scheduled posts\n→ Move Drafts to Scheduled\n→ Brainstorm new Ideas", "✏️", { color: `${palette.secondary}_background` }),
      ],
      [
        createCallout("ENGAGEMENT CHECK\n\n→ Open 📊 Performance & Brand\n→ Log recent post metrics\n→ Check engagement rates\n→ Note best posting times", "📊", { color: `${palette.accent}_background` }),
      ],
    ]},

    // ── Life Area Navigation ──
    ...buildSectionCards(sections, databases, palette),
  ];

  // ── FOOTER BLOCKS (after section cards on root page) ──
  const footerBlocks: BlockSpec[] = [
    { type: "toggle", text: "📖 Setup Guide — Click to expand", children: [
      { type: "numbered_list_item", text: "Open 📅 Content Production — plan your first week of content and save ideas" },
      { type: "numbered_list_item", text: "Open 🎯 Strategy & Campaigns — create your first campaign to organize posts" },
      { type: "numbered_list_item", text: "Open 📊 Performance & Brand — set up your brand kit and log your first analytics" },
      { type: "numbered_list_item", text: "Delete sample data and start building your content empire!" },
    ]},
  ];

  const socialStartHere: PageSpec = {
    name: "🚀 Start Here",
    icon: "🚀",
    cover: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=1500",
    blocks: [
      { type: "heading_1", text: `Welcome to ${name}!` },
      createCallout("This template is your all-in-one social media command center. Plan content, track campaigns, analyze performance, and manage your brand — all in one place.", "📱", { color: `${palette.primary}_background` }),
      { type: "divider" },
      { type: "heading_2", text: "⚡ Quick Setup (5 minutes)" },
      { type: "numbered_list_item", text: "Set up your brand assets in 🎨 Brand Kit — add your color palette, fonts, logo links, and core hashtag set" },
      { type: "numbered_list_item", text: "Plan your first week of content in 📅 Content Calendar — aim for 3-5 posts to start" },
      { type: "numbered_list_item", text: "Create your first campaign in 🎯 Campaigns — even a simple 'Weekly Posts' campaign helps organize content" },
      { type: "numbered_list_item", text: "After your first post, log metrics in 📊 Analytics — Engagement Rate auto-calculates" },
      { type: "numbered_list_item", text: "Delete sample data and start building your content empire!" },
      { type: "divider" },
      { type: "heading_2", text: "💡 Pro Tips" },
      { type: "toggle", text: "Understanding Engagement Rate", children: [
        { type: "paragraph", text: "Engagement Rate = (Likes + Comments + Shares) ÷ Reach × 100. Above 3% is good for Instagram. Above 5% is excellent. The formula calculates this automatically from your logged metrics." },
      ]},
      { type: "toggle", text: "Content batching workflow", children: [
        { type: "paragraph", text: "1) Brainstorm 10 ideas on Monday (use 💡 Content Ideas), 2) Film/create 3-5 pieces on Tuesday/Wednesday, 3) Write captions + schedule on Thursday, 4) Engage with audience daily. This saves hours vs creating one post at a time." },
      ]},
      { type: "toggle", text: "Using the Priority formula in Content Ideas", children: [
        { type: "paragraph", text: "Mark ideas as 'Saved' (bookmark icon) and set Effort Level. The Priority formula auto-sorts: ⚡ Do Next (saved + quick), 📌 Saved (saved + harder), 🎯 Easy Win (not saved but quick), 📋 Backlog (everything else)." },
      ]},
      { type: "toggle", text: "Best posting times", children: [
        { type: "paragraph", text: "Track 'Best Time' in Analytics for 2-4 weeks. Then use a Board view grouped by Best Time to see patterns. Most creators find evenings work for Reels and mornings for carousel posts." },
      ]},
      { type: "divider" },
      { type: "heading_2", text: "❓ FAQ" },
      { type: "toggle", text: "How do I connect posts to campaigns?", children: [
        { type: "paragraph", text: "Use the 'Campaign' relation property in Content Calendar. Click it and select the campaign. This lets you see all posts within a campaign from the campaign page." },
      ]},
      { type: "toggle", text: "Can I add more platforms?", children: [
        { type: "paragraph", text: "Yes! Click the 'Platform' select property and add new options like 'YouTube', 'Threads', or 'Facebook'. The analytics and content calendar will work with any platform you add." },
      ]},
      { type: "toggle", text: "How often should I update Analytics?", children: [
        { type: "paragraph", text: "Log metrics 48-72 hours after posting (when most engagement has happened). For viral content, check again at 7 days. Weekly analytics reviews help you spot what's working." },
      ]},
      { type: "divider" },
      { type: "paragraph", text: "Made with ❤️ by CraftPlan Digital — Go create something amazing! 🎬", italic: true },
    ],
  };

  applyPropertyDescriptions("social_media_planner", databases);

  return {
    id: "social_media_planner",
    name,
    icon,
    cover: getCover("social_media_planner"),
    description: tagline,
    dashboardBlocks,
    footerBlocks,
    databases,
    sections,
    subPages: [socialStartHere],
  };
}


// ═══════════════════════════════════════════════════════════
// LIFE OS ULTRA — Premium flagship all-in-one template
// ═══════════════════════════════════════════════════════════

const LIFE_OS_NAMES = [
  "LifeOS Ultra", "LifeOS Ultra", "LifeOS Ultra",
  "LifeOS Ultra", "LifeOS Ultra", "LifeOS Ultra",
];
const LIFE_OS_TAGLINES = [
  "Run your entire life from one system.",
  "Run your entire life from one system.",
  "Run your entire life from one system.",
];
const LIFE_OS_ICONS = ["🧬", "🧬", "🧬"];

// ── LifeOS Sample Data Pools ──
const WORKOUT_POOL = [
  { name: "Upper Body Push", type: "Strength", dur: 45, muscle: "Chest & Shoulders", intensity: "Hard", cal: 320 },
  { name: "Morning Run — 5K", type: "Cardio", dur: 30, muscle: "Full Body", intensity: "Moderate", cal: 350 },
  { name: "Yoga Flow", type: "Flexibility", dur: 40, muscle: "Full Body", intensity: "Easy", cal: 180 },
  { name: "HIIT Circuit", type: "HIIT", dur: 25, muscle: "Full Body", intensity: "Intense", cal: 400 },
  { name: "Leg Day — Squats & Lunges", type: "Strength", dur: 50, muscle: "Legs & Glutes", intensity: "Hard", cal: 380 },
  { name: "Cycling (outdoor)", type: "Cardio", dur: 60, muscle: "Legs", intensity: "Moderate", cal: 500 },
  { name: "Pull Day — Back & Biceps", type: "Strength", dur: 45, muscle: "Back & Arms", intensity: "Hard", cal: 300 },
  { name: "Stretching & Mobility", type: "Flexibility", dur: 20, muscle: "Full Body", intensity: "Easy", cal: 80 },
  { name: "Swimming Laps", type: "Cardio", dur: 40, muscle: "Full Body", intensity: "Moderate", cal: 420 },
  { name: "Tabata Sprints", type: "HIIT", dur: 20, muscle: "Full Body", intensity: "Intense", cal: 350 },
];

const TRAVEL_POOL = [
  { trip: "Weekend in Barcelona", dest: "Barcelona, Spain", budget: 800, spent: 620, status: "Completed", days: 3 },
  { trip: "Summer Road Trip — West Coast", dest: "California, USA", budget: 3000, spent: 0, status: "Planning", days: 10 },
  { trip: "Tokyo Adventure", dest: "Tokyo, Japan", budget: 4500, spent: 0, status: "Planning", days: 14 },
  { trip: "Ski Weekend — Alps", dest: "Chamonix, France", budget: 1200, spent: 950, status: "Completed", days: 4 },
  { trip: "Bali Digital Nomad Month", dest: "Bali, Indonesia", budget: 2500, spent: 0, status: "Planning", days: 30 },
  { trip: "NYC Long Weekend", dest: "New York, USA", budget: 1800, spent: 1650, status: "Completed", days: 4 },
];

export function getLifeOSSpec(aesthetic: string): NotionTemplateSpec {
  const colors = getColors(aesthetic);
  const palette = AESTHETIC_COLORS[aesthetic] || AESTHETIC_COLORS.minimal;
  const name = pickOne(LIFE_OS_NAMES);
  const tagline = pickOne(LIFE_OS_TAGLINES);
  const icon = pickOne(LIFE_OS_ICONS);

  // Pick random subsets from existing shared pools
  const tasks = pickN(TASK_POOL, 10);
  const habits = pickN(HABIT_POOL, 8);
  const goals = pickN(GOAL_POOL, 6);
  const brainDumps = pickN(BRAIN_DUMP_POOL, 8);
  const dailyLogs = pickN(DAILY_LOG_POOL, 5);
  const focusSessions = pickN(FOCUS_SESSION_POOL, 6);
  const journals = pickN(JOURNAL_POOL, 4);
  const books = pickN(READING_POOL, 6);
  const workouts = pickN(WORKOUT_POOL, 7);
  const travels = pickN(TRAVEL_POOL, 4);
  const finTransactions = pickN(FIN_TRANSACTION_POOL, 12);

  // ── 10 DATABASES — reused + 2 new ──
  const databases: DatabaseSpec[] = [
    // DB1: Brain Dump (reused from adhd_planner)
    {
      key: "brain_dump",
      name: "Brain Dump",
      icon: "🧠",
      properties: [
        { name: "Thought", type: "title" },
        { name: "Type", type: "select", options: [
          { name: "Task", color: colors[2] }, { name: "Idea", color: colors[1] },
          { name: "Note", color: colors[0] }, { name: "Question", color: colors[3] },
          { name: "Worry", color: colors[4] },
        ]},
        { name: "Energy Level", type: "select", options: [
          { name: "Low 🔋", color: colors[3] }, { name: "Medium ⚡", color: colors[1] },
          { name: "High 🚀", color: colors[4] },
        ]},
        { name: "Time Estimate", type: "select", options: [
          { name: "5min", color: colors[3] }, { name: "15min", color: colors[2] },
          { name: "30min", color: colors[1] }, { name: "1hr", color: colors[0] },
          { name: "2hr+", color: colors[4] },
        ]},
        { name: "Processed", type: "checkbox" },
        { name: "Created", type: "created_time" },
        { name: "Linked Task", type: "relation", relationDbKey: "tasks_goals" },
        { name: "Action Priority", type: "formula", formula: `if(prop("Type") == "Task" and prop("Energy Level") == "Low 🔋", "⚡ Quick Win", if(prop("Type") == "Worry", "🧘 Process First", if(prop("Processed"), "✅ Done", "📥 Inbox")))` },
      ],
      sampleData: brainDumps.map(b => ({
        Thought: b.thought,
        Type: b.cat === "Random" ? "Note" : b.cat === "Goal" ? "Idea" : b.cat,
        "Energy Level": pickOne(["Low 🔋", "Medium ⚡", "High 🚀"]),
        "Time Estimate": pickOne(["5min", "15min", "30min"]),
        Processed: false,
      })),
    },

    // DB2: Goals (reused from adhd_planner)
    {
      key: "goals",
      name: "Goals",
      icon: "🎯",
      properties: [
        { name: "Goal", type: "title" },
        { name: "Area", type: "select", options: [
          { name: "Health", color: colors[3] }, { name: "Career", color: colors[2] },
          { name: "Personal Growth", color: colors[1] }, { name: "Finances", color: colors[0] },
          { name: "Fitness", color: colors[4] }, { name: "Relationships", color: colors[3] },
        ]},
        { name: "Status", type: "select", options: [
          { name: "Planning", color: colors[0] }, { name: "Active", color: colors[3] },
          { name: "On Hold", color: colors[1] }, { name: "Achieved", color: colors[2] },
        ]},
        { name: "Target Date", type: "date" },
        { name: "Progress", type: "number" },
        { name: "Progress Bar", type: "formula", formula: `slice("██████████", 0, floor(prop("Progress") / 10)) + slice("░░░░░░░░░░", 0, 10 - floor(prop("Progress") / 10)) + " " + format(round(prop("Progress"))) + "%"` },
        { name: "Notes", type: "rich_text" },
      ],
      sampleData: goals.map(g => ({
        Goal: g.name, Area: g.area === "Finances" ? "Finances" : g.area,
        Status: g.status,
        "Target Date": getFutureDate(Math.floor(Math.random() * 180) + 30),
        Progress: g.progress, Notes: "",
      })),
    },

    // DB3: Tasks (adapted from adhd_planner — relates to goals, brain_dump, focus_sessions)
    {
      key: "tasks_goals",
      name: "Tasks",
      icon: "✅",
      properties: [
        { name: "Task", type: "title" },
        { name: "Status", type: "select", options: [
          { name: "Not Started", color: colors[0] }, { name: "In Progress", color: colors[2] },
          { name: "Done", color: colors[3] }, { name: "Cancelled", color: colors[4] },
        ]},
        { name: "Priority", type: "select", options: [
          { name: "🔴 Now", color: colors[4] }, { name: "🟡 Soon", color: colors[1] },
          { name: "🟢 Later", color: colors[3] }, { name: "⚪ Someday", color: colors[0] },
        ]},
        { name: "Area", type: "select", options: [
          { name: "Career", color: colors[2] }, { name: "Health", color: colors[3] },
          { name: "Finance", color: colors[0] }, { name: "Learning", color: colors[4] },
          { name: "Personal", color: colors[1] }, { name: "Fitness", color: colors[3] },
        ]},
        { name: "Energy Required", type: "select", options: [
          { name: "Low 🔋", color: colors[3] }, { name: "Medium ⚡", color: colors[1] },
          { name: "High 🚀", color: colors[4] },
        ]},
        { name: "Time Estimate", type: "select", options: [
          { name: "5min", color: colors[3] }, { name: "15min", color: colors[2] },
          { name: "30min", color: colors[1] }, { name: "1hr", color: colors[0] },
          { name: "2hr+", color: colors[4] },
        ]},
        { name: "Due Date", type: "date" },
        { name: "Done Date", type: "date" },
        { name: "Notes", type: "rich_text" },
        { name: "Goal", type: "relation", relationDbKey: "goals" },
        { name: "Focus Session", type: "relation", relationDbKey: "focus_sessions" },
        { name: "From Brain Dump", type: "relation", relationDbKey: "brain_dump" },
        { name: "Days Until Due", type: "formula", formula: `if(empty(prop("Due Date")), "No rush", if(dateBetween(prop("Due Date"), now(), "days") < 0, "🔴 OVERDUE", if(dateBetween(prop("Due Date"), now(), "days") == 0, "🟡 TODAY", if(dateBetween(prop("Due Date"), now(), "days") <= 3, "🟠 " + format(dateBetween(prop("Due Date"), now(), "days")) + "d left", "🟢 " + format(dateBetween(prop("Due Date"), now(), "days")) + "d left"))))` },
        { name: "Week", type: "formula", formula: `if(empty(prop("Due Date")), "", formatDate(prop("Due Date"), "YYYY-[W]WW"))` },
        { name: "Created", type: "created_time" },
      ],
      sampleData: tasks.map(t => ({
        Task: t.name, Status: t.status,
        Priority: t.priority === "Urgent" ? "🔴 Now" : t.priority === "High" ? "🟡 Soon" : t.priority === "Medium" ? "🟢 Later" : "⚪ Someday",
        Area: pickOne(["Career", "Health", "Finance", "Personal", "Learning", "Fitness"]),
        "Energy Required": t.energy === "High Energy" ? "High 🚀" : t.energy === "Medium Energy" ? "Medium ⚡" : "Low 🔋",
        "Time Estimate": pickOne(["5min", "15min", "30min", "1hr"]),
        "Due Date": getFutureDate(t.due),
        Notes: t.notes,
      })),
    },

    // DB4: Focus Sessions (reused from adhd_planner)
    {
      key: "focus_sessions",
      name: "Focus Sessions",
      icon: "🍅",
      properties: [
        { name: "Session", type: "title" },
        { name: "Date", type: "date" },
        { name: "Duration (min)", type: "number" },
        { name: "Actual (min)", type: "number" },
        { name: "Type", type: "select", options: [
          { name: "Pomodoro 25min", color: colors[3] }, { name: "Power Hour 60min", color: colors[2] },
          { name: "Deep Work 90min", color: colors[1] }, { name: "Sprint 15min", color: colors[0] },
        ]},
        { name: "Focus Rating", type: "select", options: [
          { name: "😫 1", color: colors[4] }, { name: "😐 2", color: colors[0] },
          { name: "🙂 3", color: colors[1] }, { name: "😊 4", color: colors[2] },
          { name: "🤩 5", color: colors[3] },
        ]},
        { name: "Distractions", type: "number" },
        { name: "Energy Before", type: "select", options: [
          { name: "Low 🔋", color: colors[3] }, { name: "Medium ⚡", color: colors[1] },
          { name: "High 🚀", color: colors[4] },
        ]},
        { name: "Energy After", type: "select", options: [
          { name: "Low 🔋", color: colors[3] }, { name: "Medium ⚡", color: colors[1] },
          { name: "High 🚀", color: colors[4] },
        ]},
        { name: "Completed", type: "checkbox" },
        { name: "Focus Score", type: "formula", formula: `if(prop("Duration (min)") == 0, 0, round(prop("Actual (min)") / max(prop("Duration (min)"), 1) * 100))` },
        { name: "Notes", type: "rich_text" },
      ],
      sampleData: focusSessions.map((s, i) => ({
        Session: s.name, "Duration (min)": s.dur,
        "Actual (min)": Math.max(10, s.dur - Math.floor(Math.random() * 15)),
        Type: s.type,
        "Focus Rating": s.rating === "Laser Focus" ? "🤩 5" : s.rating === "Pretty Good" ? "😊 4" : "😐 2",
        Distractions: s.distractions,
        "Energy Before": pickOne(["Low 🔋", "Medium ⚡", "High 🚀"]),
        "Energy After": pickOne(["Low 🔋", "Medium ⚡"]),
        Completed: i < 4, Date: getPastDate(i),
      })),
    },

    // DB5: Habits (reused from adhd_planner)
    {
      key: "habits",
      name: "Habits",
      icon: "💪",
      properties: [
        { name: "Habit", type: "title" },
        { name: "Category", type: "select", options: [
          { name: "Health", color: colors[3] }, { name: "Productivity", color: colors[2] },
          { name: "Mindfulness", color: colors[0] }, { name: "Self-Care", color: colors[1] },
          { name: "Fitness", color: colors[4] }, { name: "Learning", color: colors[3] },
        ]},
        { name: "Frequency", type: "select", options: [
          { name: "Daily", color: colors[3] }, { name: "Weekdays", color: colors[2] },
          { name: "3x/week", color: colors[1] }, { name: "Weekly", color: colors[0] },
        ]},
        { name: "Importance", type: "select", options: [
          { name: "Core", color: colors[4] }, { name: "Nice-to-have", color: colors[0] },
        ]},
        { name: "Current Streak", type: "number" },
        { name: "Best Streak", type: "number" },
        { name: "Streak Bar", type: "formula", formula: `if(prop("Current Streak") >= 30, "🔥🔥🔥 " + format(prop("Current Streak")) + " days!", if(prop("Current Streak") >= 14, "🔥🔥 " + format(prop("Current Streak")) + " days", if(prop("Current Streak") >= 7, "🔥 " + format(prop("Current Streak")) + " days", if(prop("Current Streak") >= 1, "✨ " + format(prop("Current Streak")) + " days", "Start today!"))))` },
        { name: "Today", type: "checkbox" },
        { name: "Last Done", type: "date" },
        { name: "Notes", type: "rich_text" },
      ],
      sampleData: habits.map(h => ({
        Habit: h.name, Category: h.cat === "Learning" ? "Learning" : h.cat,
        Frequency: h.freq,
        Importance: h.streak >= 10 ? "Core" : "Nice-to-have",
        "Current Streak": h.streak, "Best Streak": h.best,
        Today: h.streak > 5, "Last Done": getPastDate(h.streak > 0 ? 0 : 3),
      })),
    },

    // DB6: Daily Log (reused from adhd_planner)
    {
      key: "daily_log",
      name: "Daily Log",
      icon: "📅",
      properties: [
        { name: "Date", type: "title" },
        { name: "Day Date", type: "date" },
        { name: "Mood", type: "select", options: [
          { name: "😫 Awful", color: colors[4] }, { name: "😟 Rough", color: colors[0] },
          { name: "😐 Okay", color: colors[1] }, { name: "🙂 Good", color: colors[2] },
          { name: "😊 Great", color: colors[3] },
        ]},
        { name: "Energy Peak", type: "select", options: [
          { name: "Morning", color: colors[1] }, { name: "Afternoon", color: colors[0] },
          { name: "Evening", color: colors[2] }, { name: "Unpredictable", color: colors[4] },
        ]},
        { name: "Top 3 Wins", type: "rich_text" },
        { name: "Gratitude", type: "rich_text" },
        { name: "Reflection", type: "rich_text" },
        { name: "Sleep Hours", type: "number" },
        { name: "Water Glasses", type: "number" },
        { name: "Tasks Done", type: "number" },
        { name: "Focus Minutes", type: "number" },
        { name: "Day Score", type: "formula", formula: `round(prop("Tasks Done") * 15 + prop("Focus Minutes") * 0.5 + if(prop("Mood") == "😊 Great", 20, if(prop("Mood") == "🙂 Good", 15, if(prop("Mood") == "😐 Okay", 10, 5))) + prop("Water Glasses") * 2 + prop("Sleep Hours") * 3)` },
        { name: "Energy Match", type: "formula", formula: `if(prop("Energy Peak") == "Morning" and prop("Tasks Done") >= 3, "🎯 Peak Used Well", if(prop("Tasks Done") < 2, "💤 Low Output", "📊 Average Day"))` },
      ],
      sampleData: dailyLogs.map((d, i) => {
        const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const dateObj = new Date();
        dateObj.setDate(dateObj.getDate() - (dailyLogs.length - i));
        const dayName = dayNames[dateObj.getDay()];
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return {
          Date: `${dayName}, ${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}`,
          "Day Date": dateObj.toISOString().split("T")[0],
          Mood: d.mood, "Energy Peak": d.peak,
          "Top 3 Wins": d.wins, Gratitude: d.gratitude, Reflection: d.reflection,
          "Sleep Hours": d.sleep, "Water Glasses": d.water,
          "Tasks Done": d.tasks, "Focus Minutes": d.focus,
        };
      }),
    },

    // DB7: Journal & Notes (reused from life_planner)
    {
      key: "journal_notes",
      name: "Journal & Notes",
      icon: "📝",
      properties: [
        { name: "Entry", type: "title" },
        { name: "Type", type: "select", options: [
          { name: "Journal", color: colors[3] }, { name: "Note", color: colors[2] },
          { name: "Idea", color: colors[1] }, { name: "Meeting", color: colors[4] },
        ]},
        { name: "Date", type: "date" },
        { name: "Mood", type: "select", options: [
          { name: "Great", color: colors[3] }, { name: "Good", color: colors[2] },
          { name: "Okay", color: colors[1] }, { name: "Low", color: colors[4] },
        ]},
        { name: "Category", type: "select", options: [
          { name: "Work", color: colors[2] }, { name: "Personal", color: colors[1] },
          { name: "Idea", color: colors[3] }, { name: "Learning", color: colors[0] },
          { name: "Meeting", color: colors[4] },
        ]},
        { name: "Tags", type: "multi_select", options: [
          { name: "Reference", color: colors[0] }, { name: "Action Item", color: colors[4] },
          { name: "Inspiration", color: colors[3] }, { name: "Project", color: colors[2] },
        ]},
        { name: "Content", type: "rich_text" },
        { name: "Gratitude", type: "rich_text" },
        { name: "Reflection Depth", type: "formula", formula: `if(prop("Type") != "Journal", "", if(length(prop("Gratitude")) > 50 and length(prop("Content")) > 50, "🌟 Deep Reflection", if(length(prop("Gratitude")) > 20, "📝 Good Entry", "✏️ Quick Note")))` },
        { name: "Created", type: "created_time" },
      ],
      sampleData: [
        ...journals.map((j, i) => ({
          Entry: `Day ${i + 1} Reflection`,
          Type: "Journal",
          Date: getPastDate(journals.length - i),
          Mood: j.mood,
          Gratitude: j.gratitude,
          Content: j.wins,
        })),
        { Entry: "App idea: life dashboard concept", Type: "Idea", Category: "Idea" },
        { Entry: "Team meeting notes — Q1 planning", Type: "Meeting", Category: "Meeting" },
        { Entry: "Book recommendation from friend", Type: "Note", Category: "Personal" },
      ],
    },

    // DB8: Reading & Learning (reused from life_planner)
    {
      key: "reading_learning",
      name: "Reading & Learning",
      icon: "📚",
      properties: [
        { name: "Title", type: "title" },
        { name: "Author", type: "rich_text" },
        { name: "Status", type: "select", options: [
          { name: "Want to Read", color: colors[0] }, { name: "Reading", color: colors[2] },
          { name: "Finished", color: colors[3] }, { name: "Abandoned", color: colors[4] },
        ]},
        { name: "Genre", type: "select", options: [
          { name: "Self-Help", color: colors[1] }, { name: "Business", color: colors[2] },
          { name: "Fiction", color: colors[3] }, { name: "Science", color: colors[0] },
          { name: "Biography", color: colors[4] },
        ]},
        { name: "Rating", type: "rich_text" },
        { name: "Date Finished", type: "date" },
        { name: "Key Takeaways", type: "rich_text" },
      ],
      sampleData: books.map(b => ({
        Title: b.title, Author: b.author, Status: b.status,
        Genre: b.genre, Rating: b.rating,
        "Date Finished": b.status === "Finished" ? getPastDate(Math.floor(Math.random() * 90)) : undefined,
        "Key Takeaways": b.status === "Finished" ? "Great insights on personal development" : "",
      })),
    },

    // DB9: Workouts & Fitness (NEW — unique to life_os)
    {
      key: "workouts",
      name: "Workouts",
      icon: "🏋️",
      properties: [
        { name: "Workout", type: "title" },
        { name: "Type", type: "select", options: [
          { name: "Strength", color: colors[3] }, { name: "Cardio", color: colors[2] },
          { name: "Flexibility", color: colors[1] }, { name: "HIIT", color: colors[4] },
        ]},
        { name: "Date", type: "date" },
        { name: "Duration (min)", type: "number" },
        { name: "Muscle Group", type: "select", options: [
          { name: "Full Body", color: colors[0] }, { name: "Chest & Shoulders", color: colors[1] },
          { name: "Back & Arms", color: colors[2] }, { name: "Legs & Glutes", color: colors[3] },
          { name: "Legs", color: colors[4] }, { name: "Core", color: colors[0] },
        ]},
        { name: "Intensity", type: "select", options: [
          { name: "Easy", color: colors[3] }, { name: "Moderate", color: colors[1] },
          { name: "Hard", color: colors[4] }, { name: "Intense", color: colors[4] },
        ]},
        { name: "Calories (est)", type: "number" },
        { name: "Fitness Goal", type: "relation", relationDbKey: "goals" },
        { name: "Completed", type: "checkbox" },
        { name: "Notes", type: "rich_text" },
      ],
      sampleData: workouts.map((w, i) => ({
        Workout: w.name, Type: w.type, Date: getPastDate(i * 2),
        "Duration (min)": w.dur, "Muscle Group": w.muscle,
        Intensity: w.intensity, "Calories (est)": w.cal,
        Completed: i < 5, Notes: "",
      })),
    },

    // DB10: Transactions (adapted from finance_tracker — simplified, no wallet relation)
    {
      key: "transactions",
      name: "Transactions",
      icon: "💰",
      properties: [
        { name: "Name", type: "title" },
        { name: "Amount", type: "number", numberFormat: "euro" },
        { name: "Type", type: "select", options: [
          { name: "Expense", color: colors[4] },
          { name: "Income", color: colors[3] },
        ]},
        { name: "Category", type: "select", options: [
          { name: "Salary", color: colors[0] }, { name: "Freelance", color: colors[1] },
          { name: "Housing", color: colors[4] }, { name: "Food & Dining", color: colors[0] },
          { name: "Utilities", color: colors[1] }, { name: "Health", color: colors[2] },
          { name: "Shopping", color: colors[3] }, { name: "Subscriptions", color: colors[4] },
          { name: "Savings", color: colors[0] }, { name: "Entertainment", color: colors[1] },
          { name: "Transportation", color: colors[2] },
        ]},
        { name: "Date", type: "date" },
        { name: "Month", type: "formula", formula: `formatDate(prop("Date"), "MMMM YYYY")` },
        { name: "Is Recurring", type: "checkbox" },
        { name: "Notes", type: "rich_text" },
        { name: "Status", type: "select", options: [
          { name: "Pending", color: colors[1] },
          { name: "Cleared", color: colors[3] },
        ]},
      ],
      sampleData: finTransactions.map(t => ({
        Name: t.name, Amount: t.amount, Type: t.type,
        Category: t.category, Date: getPastDate(t.daysAgo),
        "Is Recurring": t.recurring, Status: t.status,
      })),
    },

    // DB11: Travel Plans (NEW — unique to life_os)
    {
      key: "travel",
      name: "Travel Plans",
      icon: "✈️",
      properties: [
        { name: "Trip", type: "title" },
        { name: "Destination", type: "rich_text" },
        { name: "Start Date", type: "date" },
        { name: "End Date", type: "date" },
        { name: "Duration (days)", type: "number" },
        { name: "Budget", type: "number", numberFormat: "euro" },
        { name: "Spent", type: "number", numberFormat: "euro" },
        { name: "Budget Left", type: "formula", formula: `if(prop("Budget") == 0, "No budget set", format(prop("Budget") - prop("Spent")) + "€ remaining (" + format(round(prop("Spent") / max(prop("Budget"), 1) * 100)) + "% used)")` },
        { name: "Status", type: "select", options: [
          { name: "Dreaming", color: colors[0] }, { name: "Planning", color: colors[1] },
          { name: "Booked", color: colors[2] }, { name: "Completed", color: colors[3] },
        ]},
        { name: "Packing Done", type: "checkbox" },
        { name: "Notes", type: "rich_text" },
      ],
      sampleData: travels.map(t => ({
        Trip: t.trip, Destination: t.dest,
        "Start Date": t.status === "Completed" ? getPastDate(t.days + 10) : getFutureDate(30 + Math.floor(Math.random() * 120)),
        "End Date": t.status === "Completed" ? getPastDate(10) : getFutureDate(30 + t.days + Math.floor(Math.random() * 120)),
        "Duration (days)": t.days,
        Budget: t.budget, Spent: t.spent,
        Status: t.status,
        "Packing Done": t.status === "Completed",
      })),
    },
  ];

  // ── SECTIONS (5 hub-style workspaces) ──
  const sections: TemplateSection[] = [
    {
      key: "planning_action",
      name: "Plan & Execute",
      icon: "⚡",
      description: "Turn your plans into action — without overwhelm.",
      databaseKeys: ["tasks_goals", "focus_sessions", "brain_dump"],
      tips: [
        "Match tasks to your energy — easy wins when tired, big projects when focused",
        "15-minute focus sprints count — just start",
        "Brain dump daily, process weekly",
      ],
      viewSuggestions: [
        "Board view grouped by Status — Kanban-style task flow",
        "Filter: Priority = 🔴 Now — today's urgent tasks only",
        "Calendar view by Due Date — visual weekly planning",
      ],
    },
    {
      key: "wellness_fitness",
      name: "Body & Mind",
      icon: "💪",
      description: "Build consistency that actually sticks.",
      databaseKeys: ["habits", "workouts", "daily_log"],
      tips: [
        "Start with 3 habits — streaks grow fast",
        "Link workouts to goals — see fitness progress automatically",
        "Daily Log reveals your best patterns over time",
      ],
      viewSuggestions: [
        "Board view for Habits grouped by Category",
        "Calendar view for Workouts — training frequency",
        "Calendar view for Daily Log — mood patterns",
      ],
    },
    {
      key: "money_finance",
      name: "Money Clarity",
      icon: "💰",
      description: "Know exactly where every dollar goes.",
      databaseKeys: ["transactions"],
      tips: [
        "Log expenses in seconds — auto-grouped by month",
        "Filter by category to spot spending patterns",
        "Recurring charges tracked automatically",
      ],
      viewSuggestions: [
        "Board view grouped by Category — spending at a glance",
        "Filter: Type = Expense — expenses only",
        "Filter: Is Recurring = true — recurring charges",
      ],
    },
    {
      key: "learning_growth",
      name: "Grow & Reflect",
      icon: "🌱",
      description: "Become the person you're working toward.",
      databaseKeys: ["journal_notes", "reading_learning"],
      tips: [
        "Journal daily — deep reflections earn 🌟 automatically",
        "Track your reading pipeline from Want to Read → Finished",
        "Capture ideas and inspiration for future projects",
      ],
      viewSuggestions: [
        "Calendar view for Journal — daily entries",
        "Board view for Reading grouped by Status",
        "Filter: Type = Idea — your idea backlog",
      ],
    },
    {
      key: "travel_adventures",
      name: "Dream & Explore",
      icon: "✈️",
      description: "Plan adventures with built-in budget tracking.",
      databaseKeys: ["travel"],
      tips: [
        "Start in 'Dreaming' — move to 'Planning' when ready",
        "Budget Left calculates automatically as you log costs",
        "Notes field perfect for packing lists and itineraries",
      ],
      viewSuggestions: [
        "Board view grouped by Status — Dreaming → Booked → Completed",
        "Gallery view — visual trip cards",
        "Sort by Start Date — upcoming trips first",
      ],
    },
  ];

  // ── DASHBOARD BLOCKS — Premium high-converting layout ──
  const dashboardBlocks: BlockSpec[] = [
    // ══════════════════════════════════════════════════════
    // 1. HERO — Emotional entry point
    // ══════════════════════════════════════════════════════
    { type: "heading_1", text: `🧬 ${name}` },
    { type: "quote", text: "Run your entire life from one system.", italic: true },
    { type: "paragraph", text: "" },
    createCallout("Plan. Focus. Track. Grow.\n\n✦  Finally stay organized — without 10 different apps\n✦  See your progress instantly — goals, habits, and finances\n✦  Work with your energy — not against it\n✦  Build real consistency — streaks, rituals, and reviews\n✦  Everything connected — tasks link to goals, workouts link to habits", "🧬", { color: `${palette.primary}_background`, bold: true }),
    { type: "divider" },

    // ══════════════════════════════════════════════════════
    // 2. WHY THIS WORKS — Builds trust instantly
    // ══════════════════════════════════════════════════════
    { type: "heading_2", text: "⚡ Your Life — Simplified" },
    { type: "column_list", columns: [
      [
        createCallout("📋 Plan your day\n\nKnow exactly what to do — matched to your energy level.", "📋", { color: `${palette.accent}_background`, bold: true }),
      ],
      [
        createCallout("💪 Stay consistent\n\nHabit streaks, daily rituals, and wellness tracking.", "💪", { color: `${palette.primary}_background`, bold: true }),
      ],
      [
        createCallout("📊 Track progress\n\nGoals, finances, fitness — all with auto-updating bars.", "📊", { color: `${palette.secondary}_background`, bold: true }),
      ],
      [
        createCallout("🧘 Avoid overwhelm\n\nBrain dump, energy workflow, and emergency mode.", "🧘", { color: `${palette.accent}_background`, bold: true }),
      ],
    ]},
    { type: "paragraph", text: "Everything you need. One system. Zero friction.", italic: true },

    { type: "divider" },

    // ══════════════════════════════════════════════════════
    // 3. HOW IT WORKS — System flow visualization
    // ══════════════════════════════════════════════════════
    { type: "heading_2", text: "🧠 How It Works" },
    createCallout("Capture  →  Plan  →  Execute  →  Reflect  →  Improve\n\nYou don't need to think about the system. Just follow it.", "🧠", { color: `${palette.secondary}_background`, bold: true }),

    { type: "divider" },

    // ══════════════════════════════════════════════════════
    // 4. START HERE — Critical for conversion
    // ══════════════════════════════════════════════════════
    { type: "heading_2", text: "🚀 Start Here — Ready in 3 Minutes" },
    { type: "column_list", columns: [
      [
        createCallout("1️⃣\n\nAdd your\nfirst task", "1️⃣", { color: `${palette.accent}_background`, bold: true }),
      ],
      [
        createCallout("2️⃣\n\nCheck today's\nhabits", "2️⃣", { color: `${palette.primary}_background`, bold: true }),
      ],
      [
        createCallout("3️⃣\n\nStart a\nfocus session", "3️⃣", { color: `${palette.secondary}_background`, bold: true }),
      ],
      [
        createCallout("4️⃣\n\nReview your\ndashboard", "4️⃣", { color: `${palette.accent}_background`, bold: true }),
      ],
    ]},
    { type: "paragraph", text: "That's it. You're running your life OS.", italic: true },

    { type: "divider" },

    // ══════════════════════════════════════════════════════
    // 5. COMMAND CENTER — Feels like buttons
    // ══════════════════════════════════════════════════════
    ...buildCommandCenter([
      { icon: "✅", label: "New Task", description: "Start something important — in seconds." },
      { icon: "📥", label: "Brain Dump", description: "Get it out of your head instantly." },
      { icon: "🏋️", label: "Log Workout", description: "Enter beast mode. Track everything." },
      { icon: "💰", label: "Track Expense", description: "Know where your money goes." },
      { icon: "✍️", label: "Journal", description: "Reflect. Reset. Stay grounded." },
    ], palette),

    { type: "divider" },

    // ══════════════════════════════════════════════════════
    // 6. TODAY — Live linked database views
    // ══════════════════════════════════════════════════════
    { type: "heading_2", text: "📊 Today" },
    { type: "column_list", columns: [
      [
        createCallout("🎯 WHAT TO DO NOW", "🎯", { color: `${palette.accent}_background`, bold: true }),
        { type: "linked_database", databaseKey: "tasks_goals", text: "Active Tasks" },
      ],
      [
        createCallout("🔥 STAY CONSISTENT", "🔥", { color: `${palette.primary}_background`, bold: true }),
        { type: "linked_database", databaseKey: "habits", text: "Today's Habits" },
      ],
    ]},
    { type: "paragraph", text: "You're in control today. Keep going.", italic: true },

    { type: "divider" },

    // ══════════════════════════════════════════════════════
    // 7. ENERGY + FOCUS — Adaptive workflow
    // ══════════════════════════════════════════════════════
    { type: "heading_2", text: "🍅 Deep Focus" },
    { type: "linked_database", databaseKey: "focus_sessions", text: "Focus Sessions" },
    { type: "column_list", columns: [
      [
        createCallout("🔋 LOW ENERGY?\n\nFilter → Energy = Low\nPick the easiest task\n15-min sprint → done.", "🔋", { color: `${palette.secondary}_background`, bold: true }),
      ],
      [
        createCallout("🚀 HIGH ENERGY?\n\nFilter → Energy = High\nTackle the big one\n90-min deep work → flow.", "🚀", { color: `${palette.accent}_background`, bold: true }),
      ],
    ]},

    { type: "divider" },

    // ══════════════════════════════════════════════════════
    // 8. DAILY RITUAL — Morning/evening flow
    // ══════════════════════════════════════════════════════
    ...buildDailyRitual([
      "Check your energy level",
      "Pick 3 tasks that match",
      "Start a focus session",
      "Check your habit streaks",
    ], [
      "Mark tasks as done",
      "Update habits for today",
      "Log any expenses",
      "Write a quick journal entry",
      "Plan tomorrow's top 3",
    ], { title: "Quick Brain Dump", icon: "📥", items: [
      "Capture a thought...",
      "Expense to log...",
      "Idea to explore...",
    ]}, palette),

    { type: "divider" },

    // ══════════════════════════════════════════════════════
    // 9. GOALS — Progress visualization
    // ══════════════════════════════════════════════════════
    { type: "heading_2", text: "🎯 Your Goals" },
    { type: "paragraph", text: "Every bar updates automatically. Just update your progress.", italic: true },
    { type: "linked_database", databaseKey: "goals", text: "Goals" },

    { type: "divider" },

    // ══════════════════════════════════════════════════════
    // 10. QUICK CAPTURE — Action zone
    // ══════════════════════════════════════════════════════
    { type: "heading_2", text: "📥 Quick Capture" },
    { type: "column_list", columns: [
      [
        createCallout("🧠 Brain Dump\n\nCapture anything. Sort later.", "🧠", { color: `${palette.accent}_background`, bold: true }),
      ],
      [
        createCallout("✅ New Task\n\nAdd it. Prioritize it. Done.", "✅", { color: `${palette.primary}_background`, bold: true }),
      ],
      [
        createCallout("💡 Save Idea\n\nInspiration captured forever.", "💡", { color: `${palette.secondary}_background`, bold: true }),
      ],
    ]},

    { type: "divider" },

    // ══════════════════════════════════════════════════════
    // 11. WORKSPACES — Section navigation cards
    // ══════════════════════════════════════════════════════
    ...buildSectionCards(sections, databases, palette),
  ];

  // ── FOOTER BLOCKS ──
  const footerBlocks: BlockSpec[] = [
    { type: "paragraph", text: "Built for people creating discipline, clarity, and consistency.", italic: true },
    { type: "paragraph", text: "" },
    { type: "toggle", text: "🆘 Feeling overwhelmed? Click here.", children: [
      createCallout("STOP. BREATHE. You're okay.", "🫁", { color: "red_background", bold: true }),
      { type: "numbered_list_item", text: "Close all other tabs" },
      { type: "numbered_list_item", text: "Pick ONE task — the easiest one" },
      { type: "numbered_list_item", text: "Set a 10-minute timer. Just start." },
      { type: "paragraph", text: "You don't have to do everything. Just one thing.", italic: true },
    ]},
    { type: "toggle", text: "📖 Full setup guide", children: [
      { type: "numbered_list_item", text: "Delete sample data (keep the structure)" },
      { type: "numbered_list_item", text: "Brain dump everything on your mind" },
      { type: "numbered_list_item", text: "Add 3 habits — streaks update automatically" },
      { type: "numbered_list_item", text: "Set your goals — progress bars fill as you update" },
      { type: "numbered_list_item", text: "Log your first workout and expense" },
    ]},
    { type: "toggle", text: "📊 Add live charts (2 minutes)", children: [
      { type: "paragraph", text: "Click + → type \"Chart\" → pick a chart type:" },
      { type: "bulleted_list_item", text: "Bar chart → Tasks → tasks by area" },
      { type: "bulleted_list_item", text: "Bar chart → Habits → streak lengths" },
      { type: "bulleted_list_item", text: "Pie chart → Transactions → spending breakdown" },
      { type: "bulleted_list_item", text: "Line chart → Daily Log → wellness trend" },
    ]},
  ];

  // ── Sub-Pages ──
  const subPages: PageSpec[] = [
    {
      name: "🚀 Start Here",
      icon: "🚀",
      cover: "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=1500",
      blocks: [
        { type: "heading_1", text: `Welcome to ${name}` },
        createCallout("Your life operating system is ready. 5 connected workspaces, 11 databases, 15+ auto-formulas. Make it yours in under 5 minutes.", "🧬", { color: `${palette.primary}_background` }),
        { type: "divider" },
        { type: "heading_2", text: "⚡ Quick Setup" },
        { type: "numbered_list_item", text: "Brain dump everything on your mind into 🧠 Brain Dump" },
        { type: "numbered_list_item", text: "Set 3 goals in 🎯 Goals — progress bars fill automatically" },
        { type: "numbered_list_item", text: "Add 3 habits to 💪 Habits — streaks update instantly" },
        { type: "numbered_list_item", text: "Log one expense in 💰 Transactions" },
        { type: "numbered_list_item", text: "Delete sample data and make it yours" },
        { type: "divider" },
        { type: "heading_2", text: "💡 How It Works" },
        { type: "toggle", text: "Energy Workflow — work with your body, not against it", children: [
          { type: "paragraph", text: "Low energy? Filter tasks to Low 🔋 and knock out quick wins. High energy? Filter to High 🚀 and tackle deep work. The system adapts to you." },
        ]},
        { type: "toggle", text: "Best daily workflow", children: [
          { type: "paragraph", text: "Morning: energy check → pick 3 tasks → focus session. Evening: mark done, check habits, journal, plan tomorrow. Sunday: weekly review." },
        ]},
        { type: "toggle", text: "Keyboard shortcuts", children: [
          { type: "bulleted_list_item", text: "/ — Open block menu" },
          { type: "bulleted_list_item", text: "Ctrl/Cmd + N — New page" },
          { type: "bulleted_list_item", text: "@ — Mention a page, person, or date" },
        ]},
      ],
    },
    {
      name: "📋 Weekly Review",
      icon: "📋",
      cover: "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=1500",
      blocks: [
        { type: "heading_1", text: "📋 Weekly Review" },
        createCallout("15 minutes every Sunday. The single habit that keeps everything on track.", "📋", { color: `${palette.primary}_background` }),
        { type: "divider" },
        { type: "heading_2", text: "🔍 Review" },
        { type: "to_do", text: "Tasks — what went well?" },
        { type: "to_do", text: "Goals — update progress %" },
        { type: "to_do", text: "Habits — any streaks at risk?" },
        { type: "to_do", text: "Spending — within budget?" },
        { type: "to_do", text: "Workouts — on track?" },
        { type: "divider" },
        { type: "heading_2", text: "📝 Reflect" },
        { type: "paragraph", text: "Biggest win this week?", bold: true },
        { type: "paragraph", text: "" },
        { type: "paragraph", text: "What would I do differently?", bold: true },
        { type: "paragraph", text: "" },
        { type: "divider" },
        { type: "heading_2", text: "🎯 Next Week" },
        { type: "to_do", text: "Top 3 priorities" },
        { type: "to_do", text: "Schedule focus sessions" },
        { type: "to_do", text: "Process Brain Dump backlog" },
        { type: "to_do", text: "Set weekly spending target" },
      ],
    },
  ];

  return {
    id: "life_os",
    name,
    icon,
    cover: getCover("life_os"),
    description: tagline,
    dashboardBlocks,
    footerBlocks,
    databases,
    sections,
    subPages,
  };
}


// ── Template Registry ──
export function getTemplateSpec(templateId: string, aesthetic: string): NotionTemplateSpec | null {
  switch (templateId) {
    case "adhd_planner": return getADHDPlannerSpec(aesthetic);
    case "finance_tracker": return getFinanceTrackerSpec(aesthetic);
    case "life_planner": return getLifePlannerSpec(aesthetic);
    case "social_media_planner": return getSocialMediaPlannerSpec(aesthetic);
    case "life_os": return getLifeOSSpec(aesthetic);
    default: return null;
  }
}

export const AVAILABLE_TEMPLATES = [
  { id: "life_os", name: "LifeOS Ultra — All-in-One", icon: "🧬" },
  { id: "adhd_planner", name: "ADHD-Friendly Planner", icon: "\u{1F9E0}" },
  { id: "life_planner", name: "All-in-One Life Planner", icon: "\u{1F31F}" },
  { id: "finance_tracker", name: "Finance & Budget Tracker", icon: "\u{1F4B0}" },
  { id: "social_media_planner", name: "Social Media Content Planner", icon: "\u{1F4F1}" },
];
