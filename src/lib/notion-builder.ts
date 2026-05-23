// ── Notion Template Builder ───────────────────────────────────
// Ultra-premium prompt generation with variation so every build is unique.
// Each call uses a random seed to vary names, copy, data, and styling.

export interface NotionTemplateConfig {
  type: string;
  niche: string;
  aesthetic: string;
  features: string[];
  complexity: "simple" | "medium" | "advanced";
  targetAudience: string;
}

// ── Variation Seeds ───────────────────────────────────────────
// Picked randomly each generation so no two templates look the same.

const TEMPLATE_NAME_VARIANTS: Record<string, string[]> = {
  life_planner: [
    "🌟 Ultimate Life Command Center",
    "✨ The Life OS — All-in-One Planner",
    "🚀 My Life Dashboard 2026",
    "💫 Life Mastery Planner",
    "🌸 The Everything Planner",
    "⚡ Life HQ — Your Personal OS",
    "🎯 The Organized Life System",
    "💎 Premium Life Planner Pro",
    "🌈 The Complete Life Planner",
    "🦋 Life Transformation Planner",
  ],
  student_planner: [
    "📚 Academic Excellence OS",
    "🎓 The Ultimate Study Hub",
    "✏️ Student Command Center",
    "🧠 Smart Student Dashboard",
    "📖 Academic Life Planner",
    "⭐ Scholar's Productivity System",
    "📐 The College OS",
    "🎯 Study & Life Balance Hub",
    "🌟 Campus Life Dashboard",
    "🔬 Academic Achievement System",
  ],
  finance_tracker: [
    "💰 Money Mastery Dashboard",
    "💵 Financial Freedom Tracker",
    "📊 Wealth Building System",
    "🏦 Personal Finance Command Center",
    "💎 The Budget Boss OS",
    "📈 Financial Glow-Up Tracker",
    "💸 Cash Flow Command Center",
    "🪙 The Money Map",
    "🎯 Financial Goals Dashboard",
    "💡 Smart Money System",
  ],
  adhd_planner: [
    "🧠 ADHD Brain OS",
    "⚡ The ADHD Focus System",
    "🎯 ADHD Productivity Hub",
    "🌟 Neurodivergent Life OS",
    "🔥 ADHD Command Center",
    "💡 The ADHD Success System",
    "🧩 ADHD-Friendly Life Planner",
    "🚀 Focus & Flow ADHD Dashboard",
    "✨ The ADHD Organizer",
    "🦋 ADHD Life Navigation System",
  ],
  social_media: [
    "📱 Content Creator Command Center",
    "🎬 Social Media Mastery Hub",
    "✨ Creator Studio Dashboard",
    "🚀 Content Calendar Pro",
    "📸 Influencer OS",
    "💫 Social Media Growth System",
    "🎯 Content Strategy Dashboard",
    "🌟 Creator's Business Hub",
    "📲 Social Growth Command Center",
    "🎨 The Content Creator OS",
  ],
  habit_tracker: [
    "🔥 Habit Stack — Daily OS",
    "✅ The Habit Builder Pro",
    "💪 Daily Discipline Tracker",
    "🌱 Growth Habits Dashboard",
    "⭐ The Streak Master",
    "🎯 Habit & Wellness Command Center",
    "🌟 The Habit Revolution System",
    "🏆 Level Up — Habits & Wellness",
    "💫 Daily Rituals Tracker",
    "🧘 The Wellness OS",
  ],
  business_hub: [
    "💼 Business Command Center",
    "🚀 Freelancer Business OS",
    "🎯 The CEO Dashboard",
    "📊 Business Growth System",
    "💡 Entrepreneur HQ",
    "🌟 Small Business Pro Dashboard",
    "⚡ The Business Brain",
    "💎 Agency Management System",
    "🔧 Operations Command Center",
    "📈 Business Scale Dashboard",
  ],
  debt_calculator: [
    "💸 Debt Freedom Planner",
    "🎯 Debt Snowball Master",
    "📉 The Debt Destroyer",
    "🏆 Debt-Free Journey Tracker",
    "💪 Financial Recovery OS",
    "🌟 Debt Payoff Command Center",
    "⚡ The Debt Freedom System",
    "🎉 Zero Debt Dashboard",
    "💡 Smart Debt Elimination Tracker",
    "🚀 Debt Avalanche Pro",
  ],
};

const MOTIVATIONAL_QUOTES: Record<string, string[]> = {
  life_planner: [
    '"The secret of getting ahead is getting started." — Mark Twain',
    '"You are the architect of your own life." — Unknown',
    '"Small daily improvements lead to stunning results." — Robin Sharma',
    '"A goal without a plan is just a wish." — Antoine de Saint-Exupéry',
    '"Design your life before someone else does." — Unknown',
  ],
  student_planner: [
    '"Education is the most powerful weapon you can use to change the world." — Nelson Mandela',
    '"The more that you read, the more things you will know." — Dr. Seuss',
    '"Success is the sum of small efforts repeated day in and day out." — Robert Collier',
    '"Invest in your mind. It pays the best interest." — Benjamin Franklin',
    '"Every expert was once a beginner." — Helen Hayes',
  ],
  finance_tracker: [
    '"Do not save what is left after spending. Spend what is left after saving." — Warren Buffett',
    '"Financial freedom is available to those who learn about it and work for it." — Robert Kiyosaki',
    '"It is not your salary that makes you rich, it is your spending habits." — Charles A. Jaffe',
    '"A budget is telling your money where to go instead of wondering where it went." — Dave Ramsey',
    '"The goal is not to be rich. The goal is to be financially free." — Unknown',
  ],
  adhd_planner: [
    '"You are not broken. You are a pioneer of a different kind of mind." — Unknown',
    '"ADHD is not a problem of knowing what to do. It is a problem of doing what you know." — Russell Barkley',
    '"Your brain is unique. Work with it, not against it." — Unknown',
    '"Small steps every day. That\'s all it takes." — Unknown',
    '"You don\'t have to be perfect. You just have to be present." — Unknown',
  ],
  social_media: [
    '"Content is king, but consistency is queen." — Unknown',
    '"Your story deserves to be told." — Unknown',
    '"Build your brand one post at a time." — Unknown',
    '"Create content that serves your audience." — Unknown',
    '"Consistency beats perfection every single time." — Unknown',
  ],
  habit_tracker: [
    '"We are what we repeatedly do. Excellence is not an act but a habit." — Aristotle',
    '"Motivation gets you started. Habit keeps you going." — Jim Ryun',
    '"You do not rise to the level of your goals. You fall to the level of your systems." — James Clear',
    '"The chains of habit are too light to be felt until they are too heavy to be broken." — Warren Buffett',
    '"Small habits, compounded over time, lead to remarkable results." — James Clear',
  ],
  business_hub: [
    '"The best investment you can make is in yourself." — Warren Buffett',
    '"Work smarter, not harder." — Allan F. Mogensen',
    '"Success is not final, failure is not fatal. It is the courage to continue that counts." — Winston Churchill',
    '"Build something 100 people love, not something 1 million people kind of like." — Paul Graham',
    '"Your business is only as good as your systems." — Unknown',
  ],
  debt_calculator: [
    '"The journey of a thousand miles begins with a single step." — Lao Tzu',
    '"Debt is like any other trap, easy enough to get into, hard enough to get out of." — Henry Wheeler Shaw',
    '"Financial peace is not the acquisition of stuff. It is learning to live on less." — Dave Ramsey',
    '"Every dollar paid toward debt is a step toward freedom." — Unknown',
    '"One debt at a time. That\'s how you win." — Unknown',
  ],
};

const COVER_IMAGE_PROMPTS: Record<string, string[]> = {
  minimal: [
    "clean white marble texture with subtle geometric lines",
    "minimalist white and light gray gradient with soft shadow",
    "clean white linen texture with delicate grid pattern",
  ],
  brown: [
    "warm brown kraft paper texture with golden hour light",
    "cozy coffee shop aesthetic — dark wood and cream tones",
    "earthy terracotta and cream watercolor wash",
  ],
  pink: [
    "soft blush pink watercolor wash with gold foil accents",
    "dreamy pink and rose gold gradient with subtle sparkle",
    "feminine pink floral pattern with white space",
  ],
  dark: [
    "deep charcoal dark mode gradient with neon purple accents",
    "midnight dark background with subtle grid and glow effects",
    "premium black with electric blue gradient shimmer",
  ],
  sage: [
    "sage green botanical watercolor with organic shapes",
    "natural earth tones — sage, olive, and cream textures",
    "pressed botanicals on cream parchment background",
  ],
  pastel: [
    "soft pastel rainbow gradient — lavender, mint, peach",
    "watercolor pastel wash with dreamy soft blobs",
    "cute pastel checkerboard with soft kawaii vibes",
  ],
  mono: [
    "bold black and white geometric pattern",
    "strong monochrome with one bold accent color stripe",
    "minimalist bold lines — black on pure white",
  ],
};

// ── Template Types with Market Data ──────────────────────────
export const TEMPLATE_TYPES = [
  {
    id: "life_planner",
    name: "All-in-One Life Planner",
    icon: "🌟",
    demand: "Very High",
    avgPrice: "$8-15",
    competition: "High",
    desc: "Ultimate planner combining calendar, goals, habits, budget, health, and more",
    features: [
      "Dashboard home page with widgets",
      "Calendar & weekly planner",
      "Goal setting with progress tracking",
      "Habit tracker with streaks",
      "Budget & expense tracker",
      "Health & wellness log",
      "Journal / reflection pages",
      "To-do lists with priorities",
      "Reading list / media tracker",
    ],
  },
  {
    id: "student_planner",
    name: "Student / University Planner",
    icon: "🎓",
    demand: "Very High",
    avgPrice: "$3-8",
    competition: "Medium",
    desc: "Academic planner for students with courses, assignments, grades, and study tools",
    features: [
      "Semester overview dashboard",
      "Course manager with schedule",
      "Assignment tracker with deadlines",
      "Grade calculator with GPA",
      "Study session timer/log",
      "Exam preparation planner",
      "Notes & resources library",
      "Weekly class schedule",
      "Project tracker",
    ],
  },
  {
    id: "finance_tracker",
    name: "Finance / Budget Tracker",
    icon: "💰",
    demand: "High",
    avgPrice: "$5-12",
    competition: "Medium",
    desc: "Personal finance dashboard with income, expenses, savings goals, and debt tracking",
    features: [
      "Financial dashboard with summaries",
      "Income tracker (multiple sources)",
      "Expense tracker with categories",
      "Monthly budget planner",
      "Savings goals with progress bars",
      "Debt snowball/avalanche tracker",
      "Subscription manager",
      "Net worth calculator",
      "Bill payment reminders",
    ],
  },
  {
    id: "adhd_planner",
    name: "ADHD-Friendly Planner",
    icon: "🧠",
    demand: "High",
    avgPrice: "$10-18",
    competition: "Low",
    desc: "Visual, color-coded planner designed for ADHD minds with quick links and minimal friction",
    features: [
      "Visual dashboard with color coding",
      "Brain dump / quick capture page",
      "Time blocking with visual blocks",
      "Task prioritization (energy levels)",
      "Habit tracker with visual streaks",
      "Focus timer / Pomodoro tracker",
      "Reward system / gamification",
      "Daily routine builder",
      "Quick links on every page",
    ],
  },
  {
    id: "social_media",
    name: "Social Media Planner",
    icon: "📱",
    demand: "High",
    avgPrice: "$5-10",
    competition: "Medium",
    desc: "Content calendar and social media management hub for creators and businesses",
    features: [
      "Content calendar (grid view)",
      "Post planner with platform tags",
      "Content ideas bank",
      "Analytics tracker",
      "Hashtag library",
      "Brand guidelines page",
      "Collaboration / review pipeline",
      "Engagement tracker",
      "Monthly content themes",
    ],
  },
  {
    id: "habit_tracker",
    name: "Habit Tracker & Wellness",
    icon: "✅",
    demand: "High",
    avgPrice: "$3-8",
    competition: "Medium",
    desc: "Visual habit tracking with streaks, stats, and gamification to build better routines",
    features: [
      "Habit dashboard with streaks",
      "Daily check-in with mood",
      "Weekly & monthly overview charts",
      "Gamification (points, levels, badges)",
      "Morning & evening routines",
      "Water intake tracker",
      "Sleep log",
      "Exercise / workout log",
      "Reflection journal",
    ],
  },
  {
    id: "business_hub",
    name: "Small Business Hub",
    icon: "💼",
    demand: "Medium",
    avgPrice: "$8-20",
    competition: "Low",
    desc: "All-in-one business management workspace for freelancers and small business owners",
    features: [
      "Business dashboard with KPIs",
      "Client / customer database",
      "Project management board",
      "Invoice tracker",
      "Revenue & expense tracker",
      "Meeting notes database",
      "Task management with Kanban",
      "SOPs / process documentation",
      "Goal setting & quarterly reviews",
    ],
  },
  {
    id: "debt_calculator",
    name: "Debt Snowball Calculator",
    icon: "📉",
    demand: "Medium",
    avgPrice: "$5-10",
    competition: "Low",
    desc: "Interactive debt payoff planner using snowball or avalanche method with progress tracking",
    features: [
      "Debt overview dashboard",
      "Debt snowball calculator",
      "Debt avalanche calculator",
      "Payment log with history",
      "Progress bars per debt",
      "Total debt-free countdown",
      "Monthly payment scheduler",
      "Interest saved calculator",
      "Milestone celebrations",
    ],
  },
];

// ── Aesthetic Themes ──────────────────────────────────────────
export const AESTHETICS = [
  { id: "minimal", name: "Minimal Clean", desc: "Black & white, clean lines, lots of whitespace", colors: "Black, white, light gray" },
  { id: "brown", name: "Brown / Warm Aesthetic", desc: "Warm browns, beige, cream - cozy and trendy", colors: "Brown, beige, cream, warm tan" },
  { id: "pink", name: "Pink / It Girl", desc: "Soft pinks, rose gold accents - feminine and stylish", colors: "Blush pink, rose gold, soft white" },
  { id: "dark", name: "Dark Mode", desc: "Dark background, neon or soft accents - modern", colors: "Dark gray, soft white, neon accent" },
  { id: "sage", name: "Sage / Earth Tones", desc: "Nature-inspired greens and earth tones", colors: "Sage green, olive, cream, sand" },
  { id: "pastel", name: "Soft Pastels", desc: "Gentle pastel colors - calming and cute", colors: "Lavender, mint, peach, baby blue" },
  { id: "mono", name: "Monochrome Bold", desc: "Single strong color with black/white", colors: "One bold color + black + white" },
];

// ── Template-Specific Database Specs ─────────────────────────
// Each template type gets REAL database schemas, not generic boilerplate.
// Properties are specific to the content type with proper Notion types.

interface DbSpec {
  name: string;
  icon: string;
  desc: string;
  properties: string;
  views: string;
  sampleHint: string;
}

const TEMPLATE_DB_SPECS: Record<string, { layout: string; databases: DbSpec[] }> = {
  finance_tracker: {
    layout: `SINGLE-PAGE layout — all 3 databases are INLINE on the main page.

═══ CHARTS DASHBOARD (top of page, 3-column row) ═══
Create THREE Notion Charts using /chart, arranged in a 3-column layout:
1. "📈 Yearly Savings" — LINE CHART from Total Savings database
   • X-axis: Month (sorted by Month Number)
   • Y-axis: 📊 Net (the formula property)
   • Shows monthly net savings trend over the year
2. "💵 Income Breakdown" — DONUT CHART from Income database
   • Group by: Tags property
   • Value: SUM of Amount
   • Shows total income by source (Salary, Freelance, etc.)
   • Use green color scheme
3. "💸 Expenses Breakdown" — DONUT CHART from Expenses database
   • Group by: Tags property
   • Value: SUM of Amount
   • Shows spending by category (Rent, Utilities, Dining Out, etc.)
   • Use red/coral color scheme

═══ TOTAL SAVINGS SECTION ═══
• "💰 Total Savings" heading
• Total Savings database as Gallery view — monthly cards showing Income/Expenses/Net

═══ TRANSACTIONS SECTION (two-column layout) ═══
• "💵 Income" heading (left column) with Income database table view
• "💸 Expenses" heading (right column) with Expenses database table view

• NO sub-pages needed — everything lives on one page`,
    databases: [
      {
        name: "💰 Total Savings",
        icon: "💰",
        desc: "One row per month (Jan–Dec). Auto-calculates income and expenses using rollups from the other databases.",
        properties: `• Month (title) — "January", "February", ... "December"
• Quarter (select) — Q1 (blue), Q2 (green), Q3 (yellow), Q4 (red)
• 💵 Income (rollup) — relation to Income db → SUM of Amount
• 💸 Expenses (rollup) — relation to Expenses db → SUM of Amount
• 📊 Net (formula) — prop("💵 Income") - prop("💸 Expenses")
• Month Number (number, hidden) — 1–12 for sorting`,
        views: `• DEFAULT: Gallery — cards show Month, Income, Expenses, Net. Sorted by Month Number. Card size: Small.
• "Q1" — Gallery filtered Quarter = Q1
• "Q2" — Gallery filtered Quarter = Q2
• "Q3" — Gallery filtered Quarter = Q3
• "Q4" — Gallery filtered Quarter = Q4
• "All Months" — Table view with all 12 months and totals row`,
        sampleHint: "Create ALL 12 months. Fill Jan ($6500 in / $2845 out), Feb ($6000 in / $2500 out), Mar ($7500 in / $0 out). Apr–Dec: $0/$0.",
      },
      {
        name: "💵 Income",
        icon: "💵",
        desc: "Every income transaction. Grouped by month with SUM per group.",
        properties: `• Source (title) — who paid (e.g., "Acme Inc.", "Design Agency")
• 💲 Amount (number, dollar format)
• Tags (select) — Salary (green), Freelance (blue), Investment (yellow), Side Hustle (purple), Refund (gray)
• 📅 Date (date)
• Month (relation → Total Savings)`,
        views: `• DEFAULT "Q1": Table grouped by Month, filtered Q1, sorted by Date desc. Show SUM of Amount per group.
• "Q2" / "Q3" / "Q4" — same with respective quarter filter
• "All Months" — Table showing every entry`,
        sampleHint: "7 entries: Acme $5000 Salary Jan, Design Agency $1000 Freelance Jan, Brokerage $500 Investment Jan, Acme $5000 Salary Feb, Digital Store $1000 Freelance Feb, Acme $5000 Salary Mar, Design Agency $2500 Freelance Mar.",
      },
      {
        name: "💸 Expenses",
        icon: "💸",
        desc: "Every expense transaction. Grouped by month with SUM per group.",
        properties: `• Source (title) — what/where paid (e.g., "Mortgage", "Joe's Pizza")
• 💲 Amount (number, dollar format)
• Tags (select) — Rent/Mortgage (red), Utilities (orange), Retail (pink), Dining Out (purple), Transport (blue), Health (green), Groceries (yellow)
• 📅 Date (date)
• Month (relation → Total Savings)`,
        views: `• DEFAULT "Q1": Table grouped by Month, filtered Q1, sorted by Date desc. Show SUM of Amount per group.
• "Q2" / "Q3" / "Q4" — same with respective quarter filter
• "All Months" — Table showing every entry`,
        sampleHint: "7 entries: Joe's Pizza $25 Dining Out Jan, Mortgage $2500 Rent Jan, Hydro $120 Utilities Jan, Gym Clothes $200 Retail Jan, Mortgage $2500 Rent Feb, Mortgage $2500 Rent Mar, Netflix $16 Utilities Mar.",
      },
    ],
  },

  student_planner: {
    layout: `HOME DASHBOARD + sub-pages for each database section.
• Dashboard: welcome banner, semester progress, this week's classes, upcoming deadlines
• Navigation grid linking to each section
• Linked views of Assignments (filtered to upcoming) and Study Sessions (this week)`,
    databases: [
      {
        name: "📚 Courses",
        icon: "📚",
        desc: "All courses for the semester with schedule, credits, and current grade.",
        properties: `• Course Name (title) — e.g., "CS 201 — Data Structures"
• Professor (rich_text)
• Schedule (rich_text) — e.g., "Mon/Wed 10:00–11:30"
• Room (rich_text)
• Credits (number)
• Current Grade (select) — A+ (green), A (green), B+ (blue), B (blue), C+ (yellow), C (yellow), D (orange), F (red)
• GPA Points (formula) — maps grade to 4.0 scale
• Status (select) — In Progress (blue), Completed (green), Dropped (red)`,
        views: `• DEFAULT: Table sorted by Schedule
• "By Grade" — Board grouped by Current Grade
• "Active" — Table filtered Status = In Progress`,
        sampleHint: "5 courses: CS 201 Data Structures (A, 3cr), MATH 202 Linear Algebra (B+, 4cr), ENG 101 Academic Writing (A-, 3cr), PHYS 201 Mechanics (B, 4cr), HIST 110 World History (A, 3cr).",
      },
      {
        name: "📝 Assignments",
        icon: "📝",
        desc: "All assignments, projects, and homework with deadlines and grades.",
        properties: `• Assignment (title) — e.g., "Lab 3: Binary Trees"
• Course (relation → Courses)
• Due Date (date)
• Status (select) — Not Started (gray), In Progress (blue), Submitted (green), Graded (purple), Late (red)
• Priority (select) — High (red), Medium (yellow), Low (green)
• Grade (number, percent format) — grade received
• Weight (number, percent format) — % of course grade
• Type (select) — Homework (blue), Project (purple), Essay (green), Lab (orange), Quiz (yellow), Exam (red)
• Notes (rich_text)`,
        views: `• DEFAULT: Table sorted by Due Date ascending
• "By Course" — Board grouped by Course relation
• "Kanban" — Board grouped by Status
• "Calendar" — Calendar view by Due Date
• "Upcoming" — Table filtered Due Date next 7 days`,
        sampleHint: "8 entries across different courses, mix of statuses (2 graded, 3 submitted, 2 in progress, 1 not started). Realistic names and dates spread over the semester.",
      },
      {
        name: "⏱️ Study Sessions",
        icon: "⏱️",
        desc: "Log study hours per course with focus ratings.",
        properties: `• Subject (title) — what you studied
• Course (relation → Courses)
• Date (date)
• Duration (number) — hours studied (e.g., 2.5)
• Focus Rating (select) — 🔥 Deep Focus (green), ⚡ Good (blue), 😐 Okay (yellow), 😴 Distracted (red)
• Notes (rich_text)`,
        views: `• DEFAULT: Table sorted by Date descending
• "Calendar" — Calendar view by Date
• "By Course" — Table grouped by Course relation with SUM of Duration`,
        sampleHint: "8 entries over 2 weeks, varied courses and focus ratings. Total ~20 hours.",
      },
      {
        name: "📅 Exam Prep",
        icon: "📅",
        desc: "Exam schedule with study plans and confidence tracking.",
        properties: `• Exam (title) — e.g., "CS 201 Midterm"
• Course (relation → Courses)
• Exam Date (date)
• Study Hours Target (number)
• Study Hours Done (number)
• Progress (formula) — round(prop("Study Hours Done") / prop("Study Hours Target") * 100) + "%"
• Confidence (select) — Very Ready (green), Mostly Ready (blue), Need More Study (yellow), Not Ready (red)
• Key Topics (rich_text)`,
        views: `• DEFAULT: Table sorted by Exam Date ascending
• "By Confidence" — Board grouped by Confidence
• "Timeline" — Timeline view by Exam Date`,
        sampleHint: "5 exams: mix of midterms and finals, varied confidence levels and progress percentages.",
      },
    ],
  },

  life_planner: {
    layout: `HOME DASHBOARD + sub-pages for each section.
• Dashboard: welcome greeting, today's date formula, quick stats (active goals, habits completed, tasks due)
• 2-column layout: left = welcome + focus, right = today's top 3
• Navigation grid with colored callout blocks linking to each section
• Linked views of active tasks and today's habits`,
    databases: [
      {
        name: "🎯 Goals",
        icon: "🎯",
        desc: "Life goals organized by category with progress tracking.",
        properties: `• Goal (title) — e.g., "Run a marathon"
• Category (select) — Health (green), Career (blue), Finance (yellow), Personal Growth (purple), Relationships (pink), Creative (orange)
• Target Date (date)
• Progress (number, percent format) — 0–100%
• Status (select) — Active (blue), Completed (green), On Hold (yellow), Abandoned (gray)
• Priority (select) — Must Do (red), Should Do (yellow), Nice To Have (green)
• Notes (rich_text)
• Progress Bar (formula) — slice("██████████", 0, floor(prop("Progress") / 10)) + slice("░░░░░░░░░░", 0, 10 - floor(prop("Progress") / 10)) + " " + format(prop("Progress")) + "%"`,
        views: `• DEFAULT: Board grouped by Status
• "By Category" — Board grouped by Category
• "Gallery" — Gallery with progress visible on cards
• "Timeline" — Timeline by Target Date`,
        sampleHint: "8 goals across categories: 2 completed, 4 active (varied progress 20-80%), 1 on hold, 1 nice-to-have.",
      },
      {
        name: "✅ Tasks",
        icon: "✅",
        desc: "Daily/weekly tasks linked to goals.",
        properties: `• Task (title)
• Goal (relation → Goals)
• Due Date (date)
• Status (select) — To Do (gray), In Progress (blue), Done (green), Blocked (red)
• Priority (select) — Urgent (red), High (orange), Medium (yellow), Low (green)
• Energy Level (select) — ⚡ High Energy (red), 🔋 Medium (yellow), 🧘 Low Energy (green)
• Time Estimate (select) — 15 min, 30 min, 1 hour, 2+ hours
• Recurring (checkbox)`,
        views: `• DEFAULT: Table sorted by Due Date, filtered Status ≠ Done
• "Kanban" — Board grouped by Status
• "Today" — Table filtered Due Date = today
• "By Goal" — Table grouped by Goal relation`,
        sampleHint: "10 tasks: mix of completed, in progress, and todo. Linked to various goals. Spread across this week.",
      },
      {
        name: "🔥 Habits",
        icon: "🔥",
        desc: "Daily habits with streak tracking and categories.",
        properties: `• Habit (title) — e.g., "Morning meditation"
• Category (select) — Health (green), Productivity (blue), Wellness (purple), Learning (yellow)
• Frequency (select) — Daily, Weekdays, 3x/week, Weekly
• Current Streak (number) — days in a row
• Best Streak (number)
• Last Completed (date)
• Active (checkbox)`,
        views: `• DEFAULT: Gallery showing habit name, streak, and category
• "By Category" — Board grouped by Category
• "Active Only" — Table filtered Active = checked`,
        sampleHint: "8 habits: Exercise (streak 12), Meditate (streak 5), Read 30min (streak 22), Journal (streak 3), Drink 8 glasses (streak 45), No phone before 9am (streak 8), Study language (streak 15), Gratitude list (streak 9).",
      },
      {
        name: "📔 Journal",
        icon: "📔",
        desc: "Daily reflections with mood and gratitude tracking.",
        properties: `• Date (title) — formatted as "Mon, Feb 24"
• Mood (select) — 😊 Great (green), 🙂 Good (blue), 😐 Okay (yellow), 😔 Low (orange), 😢 Tough (red)
• Energy (select) — High (green), Medium (yellow), Low (red)
• Gratitude (rich_text) — 3 things grateful for
• Reflection (rich_text) — what happened today
• Rating (select) — ⭐⭐⭐⭐⭐, ⭐⭐⭐⭐, ⭐⭐⭐, ⭐⭐, ⭐`,
        views: `• DEFAULT: Gallery sorted by Date descending, showing mood + rating
• "Calendar" — Calendar view by Date
• "By Mood" — Board grouped by Mood`,
        sampleHint: "7 entries for the past week with varied moods and reflections. Make them feel authentic.",
      },
    ],
  },

  adhd_planner: {
    layout: `SINGLE-PAGE with clear visual sections — minimal clicks required.
• Big colorful header with template name
• Brain Dump section at the very TOP (most important for ADHD — capture before you forget)
• Quick action buttons: "🧠 Dump an Idea", "⚡ Add a Task"
• Today's tasks filtered by energy level
• Visual routine checklist (morning/evening)
• NO deep page hierarchies — everything accessible in 1-2 clicks`,
    databases: [
      {
        name: "🧠 Brain Dump",
        icon: "🧠",
        desc: "Quick capture for ideas, thoughts, and random things. Zero friction — just type and categorize later.",
        properties: `• Idea (title) — whatever's on your mind
• Category (select) — Task (blue), Idea (purple), Note (yellow), Later (gray), Urgent (red)
• Energy Needed (select) — ⚡ High (red), 🔋 Medium (yellow), 🧘 Low (green), 🤔 Unknown (gray)
• Time Needed (select) — 5 min, 15 min, 30 min, 1 hour, Deep Work
• Status (select) — Captured (gray), Processing (blue), Actioned (green), Archived (purple)
• Date Added (created_time)`,
        views: `• DEFAULT: Board grouped by Category — drag ideas between columns
• "Quick List" — Table sorted by Date Added descending (newest first)
• "By Energy" — Board grouped by Energy Needed
• "Unprocessed" — Table filtered Status = Captured`,
        sampleHint: "10 entries: mix of task ideas, random thoughts, project ideas, and 'remember to...' items. Show varied categories and energy levels.",
      },
      {
        name: "⚡ Tasks",
        icon: "⚡",
        desc: "Tasks organized by energy level — pick tasks that match your current energy, not just priority.",
        properties: `• Task (title)
• Energy Level (select) — 🔥 Hyperfocus (red), ⚡ High Energy (orange), 🔋 Medium (yellow), 🧘 Low Energy (green), 🛋️ Couch Mode (blue)
• Time Block (select) — Tiny (5 min), Short (15 min), Medium (30 min), Long (1 hr), Deep (2+ hr)
• Category (select) — Work (blue), Personal (green), Health (pink), Admin (gray), Creative (purple)
• Status (select) — ⏳ Waiting (gray), 🎯 Today (blue), 🚀 Doing (orange), ✅ Done (green), 🚫 Won't Do (red)
• Due Date (date)
• Dopamine Rating (select) — 🎉 Fun (green), 😐 Meh (yellow), 😩 Boring (red)
• Body Double Needed (checkbox) — do you need someone with you?
• Notes (rich_text)`,
        views: `• DEFAULT "Today": Board grouped by Status, filtered Status ∈ [Today, Doing]
• "By Energy" — Board grouped by Energy Level (pick tasks matching current energy!)
• "Quick Wins" — Table filtered Time Block ∈ [Tiny, Short] AND Status ≠ Done
• "All Tasks" — Table sorted by Due Date
• "Done This Week" — Table filtered Status = Done AND last 7 days`,
        sampleHint: "12 tasks: varied energy levels and time blocks. Include some quick wins, some deep work. Mix of fun and boring tasks. 4 done, 3 today, 3 waiting, 2 doing.",
      },
      {
        name: "🌅 Routines",
        icon: "🌅",
        desc: "Morning and evening routine checklists — visual, simple, satisfying to check off.",
        properties: `• Step (title) — e.g., "Take medication", "Brush teeth"
• Routine (select) — 🌅 Morning (yellow), 🌙 Evening (purple), 🏋️ Workout (green)
• Order (number) — sequence in routine
• Duration (select) — 2 min, 5 min, 10 min, 15 min, 30 min
• Completed Today (checkbox)
• Streak (number) — days in a row
• Notes (rich_text) — tips or reminders`,
        views: `• DEFAULT: Table sorted by Routine then Order — shows checklist for today
• "Morning" — Table filtered Routine = Morning, sorted by Order
• "Evening" — Table filtered Routine = Evening, sorted by Order
• "Gallery" — Gallery showing step name and streak`,
        sampleHint: "12 items: 6 morning (wake up, medication, breakfast, get dressed, review tasks, set timer), 4 evening (review day, prep tomorrow, journal, wind down), 2 workout.",
      },
    ],
  },

  social_media: {
    layout: `HOME DASHBOARD + sub-pages.
• Dashboard: content stats, upcoming posts, platform breakdown
• Main Content Calendar as the hero section
• Quick link buttons for each section
• Linked view of this week's scheduled posts`,
    databases: [
      {
        name: "📅 Content Calendar",
        icon: "📅",
        desc: "Plan, schedule, and track all social media posts across platforms.",
        properties: `• Post Title (title) — working title for the post
• Platform (multi_select) — Instagram (pink), TikTok (purple), YouTube (red), Twitter/X (blue), Pinterest (green), LinkedIn (blue)
• Publish Date (date)
• Status (select) — 💡 Idea (gray), 📝 Drafting (yellow), 🎨 Designing (blue), ✅ Ready (green), 📤 Published (purple), 📊 Analyzed (orange)
• Content Type (select) — Reel/Short (red), Carousel (blue), Single Image (green), Story (yellow), Long-form (purple), Thread (orange)
• Caption (rich_text)
• Hashtags (rich_text) — from hashtag library
• Campaign (select) — Weekly Tips, Behind the Scenes, Product Launch, Engagement, Tutorial, Personal
• Engagement (number) — total likes + comments + shares after posting
• Link (url) — link to published post`,
        views: `• DEFAULT: Calendar view by Publish Date
• "Kanban" — Board grouped by Status
• "By Platform" — Board grouped by Platform
• "This Week" — Table filtered Publish Date = this week
• "Published" — Gallery filtered Status = Published, showing engagement`,
        sampleHint: "10 posts across platforms, varied statuses (3 published with engagement data, 3 ready, 2 drafting, 2 ideas). Spread across next 2 weeks.",
      },
      {
        name: "💡 Content Ideas",
        icon: "💡",
        desc: "Bank of content ideas organized by category and platform.",
        properties: `• Idea (title)
• Category (select) — Educational (blue), Entertainment (pink), Inspirational (purple), Behind the Scenes (yellow), Trending (red), Collaboration (green)
• Platform (multi_select) — same as Content Calendar
• Priority (select) — 🔥 Hot (red), ⭐ Good (yellow), 💭 Someday (gray)
• Source/Inspiration (rich_text)
• Notes (rich_text)
• Used (checkbox) — mark when turned into a post`,
        views: `• DEFAULT: Gallery showing idea title and category
• "By Category" — Board grouped by Category
• "Unused" — Table filtered Used = unchecked, sorted by Priority`,
        sampleHint: "12 ideas: mix of categories and priorities. 3 marked as used, 9 available.",
      },
      {
        name: "📊 Analytics Tracker",
        icon: "📊",
        desc: "Weekly analytics per platform to track growth.",
        properties: `• Week (title) — e.g., "Week of Feb 24"
• Platform (select) — Instagram, TikTok, YouTube, Twitter/X
• Followers (number)
• New Followers (number)
• Posts Published (number)
• Total Engagement (number)
• Top Post (rich_text)
• Engagement Rate (formula) — round(prop("Total Engagement") / prop("Followers") * 100 * 100) / 100 + "%"
• Notes (rich_text)`,
        views: `• DEFAULT: Table sorted by Week descending
• "By Platform" — Table grouped by Platform
• "Growth Chart" — Table showing Followers and New Followers columns`,
        sampleHint: "8 entries: 2 per platform over 4 weeks. Show realistic growth numbers.",
      },
    ],
  },

  habit_tracker: {
    layout: `SINGLE-PAGE focused layout — visual and satisfying.
• Header with streak count and motivational quote
• Today's habits as a checklist (quick daily view)
• Habit gallery with streaks prominently displayed
• Weekly/monthly overview section
• Gamification: points, levels, badges section`,
    databases: [
      {
        name: "🔥 Habits",
        icon: "🔥",
        desc: "All habits with streak tracking, categories, and gamification.",
        properties: `• Habit (title) — e.g., "Morning meditation"
• Category (select) — 💪 Health (green), 🧠 Mind (blue), 📚 Learning (purple), 🏃 Fitness (orange), 💤 Sleep (indigo), 💧 Hydration (cyan), ✍️ Creative (pink)
• Frequency (select) — Daily, Weekdays, 3x/week, Weekly
• Current Streak (number) — consecutive completions
• Best Streak (number) — all-time record
• Total Completions (number)
• Points Per Complete (number) — gamification points earned
• Last Completed (date)
• Active (checkbox)
• Level (formula) — if(prop("Total Completions") >= 100, "🏆 Master", if(prop("Total Completions") >= 50, "⭐ Expert", if(prop("Total Completions") >= 25, "🔥 Pro", if(prop("Total Completions") >= 10, "💪 Regular", "🌱 Beginner"))))
• Streak Display (formula) — slice("🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥", 0, min(prop("Current Streak"), 10) * 2) + " " + format(prop("Current Streak")) + " days"`,
        views: `• DEFAULT: Gallery showing Habit name, Streak Display, Level, Category. Sorted by Current Streak desc.
• "By Category" — Board grouped by Category
• "Active" — Table filtered Active = checked, sorted by Current Streak desc
• "Leaderboard" — Table sorted by Total Completions desc (gamification!)`,
        sampleHint: "10 habits: Exercise (streak 23), Meditate (streak 45), Read (streak 12), Journal (streak 67), Drink Water (streak 100+), No Phone AM (streak 8), Stretch (streak 15), Vitamins (streak 30), Gratitude (streak 50), Walk 10K steps (streak 5). Show varied levels.",
      },
      {
        name: "📋 Daily Check-In",
        icon: "📋",
        desc: "Daily log tracking mood, energy, water, sleep, and exercise. One entry per day.",
        properties: `• Date (title) — formatted as "Mon, Feb 24"
• Mood (select) — 😊 Amazing (green), 🙂 Good (blue), 😐 Okay (yellow), 😔 Low (orange), 😢 Rough (red)
• Energy (select) — ⚡ High (green), 🔋 Medium (yellow), 🪫 Low (red)
• Sleep Hours (number) — e.g., 7.5
• Water Glasses (number) — e.g., 8
• Exercise (checkbox)
• Exercise Type (rich_text) — e.g., "30 min run"
• Daily Score (formula) — sum points: mood (1-5) + energy (1-3) + sleep bonus + water bonus + exercise bonus
• Reflection (rich_text) — one sentence about the day
• Habits Completed (number) — how many habits done today`,
        views: `• DEFAULT: Table sorted by Date descending
• "Calendar" — Calendar view by Date
• "Mood Tracker" — Board grouped by Mood
• "This Week" — Table filtered Date = last 7 days`,
        sampleHint: "14 entries (2 weeks). Varied moods and energy. Sleep 5.5–9 hours. Water 3–10 glasses. Exercise on 8 of 14 days. Realistic daily reflections.",
      },
    ],
  },

  business_hub: {
    layout: `HOME DASHBOARD + sub-pages for each section.
• Dashboard: revenue this month, active projects count, upcoming deadlines, client count
• Quick stats in callout blocks
• Linked views: active projects (board), upcoming invoices (table)
• Navigation grid to all sections`,
    databases: [
      {
        name: "👤 Clients",
        icon: "👤",
        desc: "Client/customer database with contact info and revenue tracking.",
        properties: `• Client Name (title) — company or person name
• Contact Email (email)
• Phone (phone_number)
• Status (select) — Active (green), Prospect (blue), On Hold (yellow), Past (gray)
• Industry (select) — Tech, E-commerce, Health, Education, Finance, Creative, Other
• Start Date (date)
• Monthly Retainer (number, dollar) — if applicable
• Lifetime Revenue (rollup) — from Projects → SUM of Budget
• Notes (rich_text)`,
        views: `• DEFAULT: Table sorted by Client Name
• "Active" — Gallery filtered Status = Active, showing name + industry
• "By Industry" — Board grouped by Industry
• "Revenue" — Table sorted by Lifetime Revenue desc`,
        sampleHint: "8 clients: 5 active, 1 prospect, 1 on hold, 1 past. Mix of industries. Revenue $2K–$15K each.",
      },
      {
        name: "📁 Projects",
        icon: "📁",
        desc: "All client projects with budgets, deadlines, and status tracking.",
        properties: `• Project (title) — e.g., "Website Redesign — Acme Corp"
• Client (relation → Clients)
• Status (select) — 📋 Scoping (gray), 🚀 Active (blue), ⏸️ Paused (yellow), ✅ Completed (green), ❌ Cancelled (red)
• Deadline (date)
• Budget (number, dollar)
• Hours Spent (number)
• Hourly Rate (number, dollar)
• Revenue (formula) — max(prop("Budget"), prop("Hours Spent") * prop("Hourly Rate"))
• Priority (select) — High (red), Medium (yellow), Low (green)
• Notes (rich_text)`,
        views: `• DEFAULT: Board grouped by Status
• "By Client" — Table grouped by Client relation
• "Timeline" — Timeline by Deadline
• "Revenue" — Table sorted by Revenue desc`,
        sampleHint: "10 projects: 4 active, 2 completed, 2 scoping, 1 paused, 1 cancelled. Budgets $1K–$15K.",
      },
      {
        name: "🧾 Invoices",
        icon: "🧾",
        desc: "Invoice tracking with payment status and due dates.",
        properties: `• Invoice # (title) — e.g., "INV-2026-001"
• Client (relation → Clients)
• Amount (number, dollar)
• Status (select) — Draft (gray), Sent (blue), Paid (green), Overdue (red), Cancelled (gray)
• Issue Date (date)
• Due Date (date)
• Paid Date (date)
• Days Overdue (formula) — if Status = "Overdue": dateBetween(now(), Due Date, "days") else 0
• Notes (rich_text)`,
        views: `• DEFAULT: Table sorted by Due Date ascending
• "By Status" — Board grouped by Status
• "Overdue" — Table filtered Status = Overdue
• "By Client" — Table grouped by Client`,
        sampleHint: "10 invoices: 4 paid, 3 sent, 2 overdue, 1 draft. Amounts $500–$8000.",
      },
      {
        name: "✅ Tasks",
        icon: "✅",
        desc: "Task management linked to projects.",
        properties: `• Task (title)
• Project (relation → Projects)
• Status (select) — To Do (gray), In Progress (blue), Review (yellow), Done (green)
• Priority (select) — Urgent (red), High (orange), Medium (yellow), Low (green)
• Assignee (rich_text) — who's responsible
• Due Date (date)
• Time Estimate (select) — 15 min, 30 min, 1 hr, 2 hr, Half Day, Full Day`,
        views: `• DEFAULT: Board grouped by Status (Kanban)
• "By Project" — Table grouped by Project relation
• "My Tasks" — Table filtered to active, sorted by Due Date
• "Calendar" — Calendar by Due Date`,
        sampleHint: "15 tasks across projects: 5 done, 4 in progress, 4 to do, 2 in review.",
      },
    ],
  },

  debt_calculator: {
    layout: `SINGLE-PAGE layout — everything on one page for easy tracking.
• Hero banner: "Your Debt-Free Journey" with total debt remaining and projected payoff date
• Debt overview gallery (each debt as a card with balance and progress bar)
• Payment log table below
• Motivational milestones section`,
    databases: [
      {
        name: "💳 Debts",
        icon: "💳",
        desc: "Each debt account with balance, interest, and payoff tracking.",
        properties: `• Debt Name (title) — e.g., "Chase Visa", "Student Loan"
• Type (select) — Credit Card (red), Student Loan (blue), Car Loan (orange), Personal Loan (yellow), Medical (purple), Mortgage (green)
• Original Balance (number, dollar)
• Current Balance (number, dollar)
• Interest Rate (number, percent) — APR
• Minimum Payment (number, dollar)
• Extra Payment (number, dollar) — snowball/avalanche extra
• Monthly Payment (formula) — prop("Minimum Payment") + prop("Extra Payment")
• Progress (formula) — round((1 - prop("Current Balance") / prop("Original Balance")) * 100) + "%"
• Progress Bar (formula) — slice("██████████", 0, floor((1 - prop("Current Balance") / prop("Original Balance")) * 10)) + slice("░░░░░░░░░░", 0, 10 - floor((1 - prop("Current Balance") / prop("Original Balance")) * 10))
• Status (select) — Active (red), Snowball Focus (orange), Paid Off 🎉 (green)
• Snowball Order (number) — rank by smallest balance first
• Avalanche Order (number) — rank by highest interest first`,
        views: `• DEFAULT: Gallery showing Debt Name, Current Balance, Progress Bar, Monthly Payment. Sorted by Snowball Order.
• "Snowball" — Table sorted by Current Balance ascending (smallest first)
• "Avalanche" — Table sorted by Interest Rate descending (highest first)
• "Paid Off" — Gallery filtered Status = Paid Off 🎉`,
        sampleHint: "5 debts: Chase Visa $4,200 (22% APR), Student Loan $18,000 (6.5%), Car Loan $12,000 (7.9%), Personal Loan $3,500 (14%), Medical Bill $1,800 (0%). 1 paid off, 1 snowball focus, 3 active. Varied progress.",
      },
      {
        name: "💵 Payments",
        icon: "💵",
        desc: "Log every payment made toward debts.",
        properties: `• Payment (title) — e.g., "March payment — Chase Visa"
• Debt (relation → Debts)
• Amount (number, dollar)
• Date (date)
• Type (select) — Minimum (gray), Extra (green), Lump Sum (blue), Snowball (orange)
• Remaining After (number, dollar) — balance after this payment
• Notes (rich_text)`,
        views: `• DEFAULT: Table sorted by Date descending
• "By Debt" — Table grouped by Debt relation with SUM of Amount
• "Calendar" — Calendar by Date
• "This Month" — Table filtered Date = this month`,
        sampleHint: "12 payments over 3 months. Mix of minimum and extra payments. Show balances decreasing. Include 1 lump sum payment.",
      },
    ],
  },
};

// ── Random picker helper ──────────────────────────────────────
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// ── Generate Notion AI Prompt ────────────────────────────────
export function generateNotionPrompt(config: NotionTemplateConfig): {
  phase1: string;
  phase2: string;
  phase3: string;
  etsyTitle: string;
  etsyTags: string[];
  etsyDescription: string;
} {
  const template = TEMPLATE_TYPES.find((t) => t.id === config.type);
  const aesthetic = AESTHETICS.find((a) => a.id === config.aesthetic);

  if (!template || !aesthetic) {
    throw new Error("Invalid template type or aesthetic");
  }

  const selectedFeatures = config.features.length > 0
    ? config.features
    : template.features;

  // Pick random variants for this generation
  const templateName = pick(TEMPLATE_NAME_VARIANTS[config.type] || [template.name]);
  const quote = pick(MOTIVATIONAL_QUOTES[config.type] || ['"Stay organized, stay ahead."']);
  const coverPrompt = pick(COVER_IMAGE_PROMPTS[config.aesthetic] || ["clean gradient background"]);

  // Randomize the color tag palette so each build has different color labels
  const colorSets = [
    ["🔴 Red", "🟠 Orange", "🟡 Yellow", "🟢 Green", "🔵 Blue", "🟣 Purple"],
    ["🍎 Urgent", "🍊 High", "🍋 Medium", "🍃 Low", "🌊 Optional"],
    ["🔥 Priority 1", "⚡ Priority 2", "💧 Priority 3", "🌱 Someday"],
    ["💎 Must Do", "⭐ Should Do", "💭 Nice To Do", "🗑️ Drop It"],
  ];
  const colorTags = pick(colorSets);

  // Randomize status labels
  const statusSets = [
    ["🧊 Not Started", "⚡ In Progress", "✅ Done", "🔄 On Hold"],
    ["📋 Todo", "🚧 Doing", "🏆 Complete", "⏸️ Paused"],
    ["💤 Backlog", "🔥 Active", "✅ Shipped", "❌ Cancelled"],
    ["🌱 Planned", "🚀 In Progress", "✨ Finished", "🗂️ Archived"],
  ];
  const statusTags = pick(statusSets);

  // Phase 1: Build the structure — template-specific
  const dbSpecs = TEMPLATE_DB_SPECS[config.type];

  const phase1 = dbSpecs
    ? // ── Template-specific Phase 1 ──────────────────────────────
      `You are an elite Notion template designer. You are creating a PREMIUM, SELLABLE Notion template called "${templateName}" — designed to be an Etsy bestseller.

═══════════════════════════════════════════
DESIGN BRIEF
═══════════════════════════════════════════
Template Name: ${templateName}
Aesthetic: ${aesthetic.name} — ${aesthetic.desc}
Color palette: ${aesthetic.colors}
Target audience: ${config.targetAudience || "productivity-focused individuals"}
Complexity level: ${config.complexity}
Motivational tagline: ${quote}

═══════════════════════════════════════════
MANDATORY DESIGN RULES
═══════════════════════════════════════════
✦ Every page MUST have a cover image (use Unsplash: type /cover → Unsplash → search "${coverPrompt}")
✦ Every page MUST have an icon emoji that matches the section
✦ Use callout blocks (not plain text) for important sections and headers
✦ Add colored dividers between every major section
✦ Use toggle blocks for instructional/help text — keep the page clean
✦ Navigation: every sub-page needs a "← Back to Home" button at top
✦ Use property options EXACTLY as specified per database below — do NOT add generic Status/Priority/Tags unless specified
✦ When the layout specifies CHARTS — use Notion Charts (/chart command). Create the chart type specified (line, bar, donut/pie), connect it to the correct database, and configure the axes/grouping as described. Place charts in column layouts as instructed.

═══════════════════════════════════════════
PAGE LAYOUT
═══════════════════════════════════════════
${dbSpecs.layout}

═══════════════════════════════════════════
DATABASES TO CREATE (${dbSpecs.databases.length} databases)
═══════════════════════════════════════════

${dbSpecs.databases.map((db, i) => `━━━ DATABASE ${i + 1}: ${db.name} ━━━
${db.icon} ${db.desc}

PROPERTIES (create ALL of these EXACTLY as specified):
${db.properties}

VIEWS (create ALL of these):
${db.views}
`).join("\n")}
═══════════════════════════════════════════
HOME PAGE STRUCTURE
═══════════════════════════════════════════
• Header callout: template name "${templateName}" + tagline: ${quote}
• Follow the PAGE LAYOUT instructions above for how to arrange content on the home page
• Show linked views of the key databases as described in the layout
• Create all charts specified in the layout section using /chart — connect each to its database with the correct chart type and configuration
• Add a "How to use this template" toggle with 3-step quick start instructions

START NOW: Create the home page first with full cover image and icon. Then build each database in order. Create the charts AFTER the databases are built so they can reference the data.`
    : // ── Fallback generic Phase 1 (for unknown template types) ──
      `You are an elite Notion template designer. You are creating a PREMIUM, SELLABLE Notion template called "${templateName}" — designed to be an Etsy bestseller.

═══════════════════════════════════════════
DESIGN BRIEF
═══════════════════════════════════════════
Template Name: ${templateName}
Aesthetic: ${aesthetic.name} — ${aesthetic.desc}
Color palette: ${aesthetic.colors}
Target audience: ${config.targetAudience || "productivity-focused individuals"}
Complexity level: ${config.complexity}
Motivational tagline: ${quote}

═══════════════════════════════════════════
MANDATORY DESIGN RULES
═══════════════════════════════════════════
✦ Every page MUST have a cover image (use Unsplash: type /cover → Unsplash → search "${coverPrompt}")
✦ Every page MUST have an icon emoji that matches the section
✦ Use callout blocks (not plain text) for important sections and headers
✦ Add colored dividers between every major section
✦ ALL databases must have MINIMUM 3 views (default + 2 alternates)
✦ Use toggle blocks for instructional/help text — keep the page clean
✦ Navigation: every sub-page needs a "← Back to Home" button at top
✦ Color tags must use this palette: ${colorTags.join(", ")}
✦ Status tags: ${statusTags.join(", ")}

═══════════════════════════════════════════
PAGES & DATABASES TO CREATE
═══════════════════════════════════════════

━━━ PAGE 1: 🏠 HOME DASHBOARD ━━━
Create a stunning home page with header callout, quick navigation, and linked database views.
Tagline: ${quote}

${selectedFeatures.map((f, i) => {
  const featureNum = i + 2;
  const isDB = !f.toLowerCase().includes("page") && !f.toLowerCase().includes("guide");
  return `━━━ PAGE/DATABASE ${featureNum}: ${f.toUpperCase()} ━━━
${isDB ? `DATABASE PROPERTIES:
• Name/Title (title) — main identifier
• Status (select) — options: ${statusTags.slice(0, 4).join(", ")}
• Priority (select) — options: ${colorTags.slice(0, 4).join(", ")}
• Date (date) — with end date enabled
• Notes (rich_text)
• Tags (multi_select) — 5–8 relevant options
• [Add 2–3 more specific properties relevant to "${f}"]

DATABASE VIEWS:
• Table view (default), Board/Kanban, Gallery, Calendar if relevant` :
`PAGE STRUCTURE: Icon + cover + content with dividers + "How to use" toggle`}`;
}).join("\n\n")}

START NOW: Create the home page first, then build each section in order.`;

  // Phase 2: Fill with realistic, varied sample data
  const sampleDataThemes: Record<string, string[]> = {
    life_planner: [
      "Emma Chen, 28, marketing manager in NYC — goals include running a marathon, starting a side business selling digital products on Etsy, and reading 24 books this year",
      "Alex Rivera, 32, remote software engineer — goals include learning Spanish, buying a home, and launching a SaaS product",
      "Priya Sharma, 25, grad student and freelance designer — goals include finishing thesis, building a client base, and traveling to 3 new countries",
    ],
    student_planner: [
      "Jake Thompson, 20, sophomore studying Computer Science + Business minor — taking 5 courses this semester, applying for internships, working part-time",
      "Sofia Martínez, 22, pre-med student — studying for MCATs, volunteering at hospital, managing heavy course load of biology/chemistry/physics",
      "Mia Johnson, 19, freshman studying Psychology — adjusting to college life, joining clubs, balancing social life and studying",
    ],
    finance_tracker: [
      "A 27-year-old nurse earning $68K/year trying to pay off $22K in student loans while saving for a house down payment and building a $10K emergency fund",
      "A freelance graphic designer with variable income ($3K–$8K/month) managing multiple income streams, business expenses, and quarterly taxes",
      "A couple (30s) with combined income of $120K trying to pay off car loans, credit card debt, and save for retirement and a kitchen renovation",
    ],
    adhd_planner: [
      "Jordan, 29, diagnosed ADHD + anxiety — struggles with task initiation, time blindness, and overwhelm — working as a UX designer remotely",
      "Sam, 35, entrepreneur with ADHD — has tons of ideas but struggles with follow-through, managing a team, and staying focused on priorities",
      "Riley, 22, college student with ADHD — managing coursework, medication schedule, therapy appointments, and part-time job",
    ],
    social_media: [
      "A lifestyle content creator with 45K Instagram followers and growing TikTok, posting about minimalism, productivity, and aesthetic living",
      "A small bakery owner using Instagram + Pinterest to grow their local business and drive online orders for their custom cake side hustle",
      "A fitness coach building a personal brand on multiple platforms — Instagram, YouTube, and email newsletter — to sell online programs",
    ],
    habit_tracker: [
      "A 31-year-old teacher trying to build morning and evening routines, exercise consistently (3x/week), drink more water, and journal daily",
      "A remote worker battling screen fatigue who wants to build a workout habit, limit social media, meditate daily, and improve sleep quality",
      "A new parent trying to maintain personal habits (exercise, reading, learning) while adjusting to a new schedule with a baby",
    ],
    business_hub: [
      "A freelance brand designer with 12 active clients, billing $5K–$15K/month, managing projects solo with occasional contractor help",
      "A 2-person marketing agency managing 8 recurring retainer clients, tracking billable hours, proposals, and monthly reports",
      "A Etsy shop owner scaling to a full business — managing inventory, suppliers, custom orders, and marketing content creation",
    ],
    debt_calculator: [
      "A 28-year-old with $45,000 total debt: $18K student loans (6.5%), $12K car loan (7.9%), $8K credit card (22%), $7K personal loan (14%)",
      "A couple with $67,000 combined debt wanting to be debt-free before having kids: medical bills, credit cards, and student loans",
      "A recent grad with $29,000 in student loans using the avalanche method to save maximum interest over 5 years",
    ],
  };

  const storyTheme = pick(sampleDataThemes[config.type] || ["a professional looking to improve their productivity"]);

  const phase2 = dbSpecs
    ? // ── Template-specific Phase 2 ──────────────────────────────
      `Now fill "${templateName}" with realistic, detailed demo data. The user persona is: ${storyTheme}

═══════════════════════════════════════════
SAMPLE DATA RULES
═══════════════════════════════════════════
✦ Use REAL-sounding names, real amounts, real dates (February–April 2026)
✦ Make the data TELL A STORY — entries should relate to each other and match the persona above
✦ Show VARIETY: mix of statuses/stages so the template looks lived-in
✦ All formulas must display correctly — verify each one shows calculated output
✦ Relations must be linked — connect related entries across databases
✦ Progress bars and rollups should show REALISTIC values (not all 100% or all 0%)
✦ Use the exact property options defined in each database's schema — do NOT invent new ones

═══════════════════════════════════════════
DATA TO ADD PER DATABASE
═══════════════════════════════════════════
${dbSpecs.databases.map((db) => `• ${db.name}: ${db.sampleHint}`).join("\n\n")}

═══════════════════════════════════════════
FINAL CHECKS
═══════════════════════════════════════════
✦ Home page linked views show the sample data correctly
✦ All relations between databases are connected (not empty)
✦ All formulas and rollups display calculated values (no errors or blanks)
✦ All pages have cover images and icons
✦ Add a "👋 Welcome" callout at the top of home with quick instructions
✦ Add a "🗑️ Reset Template" toggle at bottom with instructions to clear demo data`
    : // ── Fallback generic Phase 2 ──────────────────────────────
      `Now fill "${templateName}" with realistic, detailed demo data. The user persona is: ${storyTheme}

═══════════════════════════════════════════
SAMPLE DATA RULES
═══════════════════════════════════════════
✦ Every database needs 6–10 sample entries — NOT generic placeholders
✦ Use REAL-sounding names, real amounts, real dates (February–April 2026)
✦ Make the data TELL A STORY — entries should relate to each other
✦ Show VARIETY: mix of completed, in-progress, and upcoming items
✦ All formulas must display correctly — verify each one shows output
✦ Relations must be linked — connect related entries across databases
✦ Use the STATUS tags: ${statusTags.join(", ")}
✦ Use PRIORITY tags: ${colorTags.join(", ")}

═══════════════════════════════════════════
DATA TO ADD PER SECTION
═══════════════════════════════════════════
${selectedFeatures.map((f) => `• ${f}: Add 6–10 entries with ALL properties filled, dates set, statuses varied, and any formulas/rollups showing results`).join("\n")}

═══════════════════════════════════════════
FINAL CHECKS
═══════════════════════════════════════════
✦ Home page linked views show the sample data correctly
✦ All pages have cover images and icons
✦ Add a "👋 Welcome" callout at the top of home with quick instructions
✦ Add a "🗑️ Reset Template" toggle at bottom with instructions to clear demo data`;

  // Phase 3: Ultra-premium polish — template-specific
  const phase3 = dbSpecs
    ? // ── Template-specific Phase 3 ──────────────────────────────
      `FINAL POLISH — Make "${templateName}" look like a $30 Etsy bestseller.

═══════════════════════════════════════════
VISUAL UPGRADES
═══════════════════════════════════════════
1. HOME PAGE HERO:
   • Header callout styled as a bold banner with template name + tagline
   • Clean layout following the page structure defined earlier
   • Colored dividers between sections (use ── ✨ ── style)

2. COVER IMAGES (ALL PAGES):
   • Home: "${coverPrompt}" via Unsplash
   • Each database page: unique cover matching the section theme
   • Covers must all be different — search specific terms per section

3. ICON SYSTEM:
   • Home: 🏠 or the template's primary emoji
   • Each database: ${dbSpecs.databases.map(db => `${db.icon} for ${db.name}`).join(", ")}

═══════════════════════════════════════════
DATABASE VERIFICATION
═══════════════════════════════════════════
Verify EACH database matches the spec exactly:
${dbSpecs.databases.map((db) => `• ${db.name}:
  - All properties created with correct types (especially formulas, rollups, relations)
  - All views created with correct names, filters, grouping, and sorting
  - Sample data is populated and formulas/rollups display calculated values`).join("\n")}

═══════════════════════════════════════════
LAYOUT VERIFICATION
═══════════════════════════════════════════
Verify the page layout matches this spec:
${dbSpecs.layout}

═══════════════════════════════════════════
FINAL CHECKLIST
═══════════════════════════════════════════
☐ Every database view has a descriptive name (not "View 1", "View 2")
☐ All relations between databases are properly linked with data
☐ All formulas and rollups show calculated values (no errors or #ERROR)
☐ Cover images on ALL pages — unique per section
☐ Icons on ALL pages and databases
☐ "[Your Name]" placeholders are highlighted
☐ Section dividers are consistent throughout
☐ H1 for page titles, H2 for sections, H3 for sub-sections
☐ Toggle blocks for any instructional text longer than 2 lines
☐ No broken links or empty sections`
    : // ── Fallback generic Phase 3 ──────────────────────────────
      `FINAL POLISH — Make "${templateName}" look like a $30 Etsy bestseller.

═══════════════════════════════════════════
VISUAL UPGRADES
═══════════════════════════════════════════
1. HOME PAGE HERO:
   • Bold callout banner with template name + tagline
   • Colorful navigation callout blocks linking to each section
   • Colored dividers between sections

2. COVER IMAGES (ALL PAGES):
   • Home: "${coverPrompt}" via Unsplash
   • Each sub-page: unique cover matching the section
   • Covers must all be different

3. ICON SYSTEM:
   • Home: 🏠 or the template's primary emoji
   • Each section gets a unique, relevant icon

═══════════════════════════════════════════
FINAL CHECKLIST
═══════════════════════════════════════════
☐ Every database view has a descriptive name (not "View 1", "View 2")
☐ All formulas display correctly
☐ Cover images on ALL pages
☐ Icons on ALL pages
☐ "[Your Name]" placeholders highlighted
☐ Section dividers are consistent
☐ No broken links or empty sections`;

  // Generate Etsy listing
  const etsyTitle = generateEtsyTitle(template, aesthetic, config, templateName);
  const etsyTags = generateEtsyTags(template, aesthetic, config);
  const etsyDescription = generateEtsyDescription(template, aesthetic, config, selectedFeatures, templateName, quote);

  return { phase1, phase2, phase3, etsyTitle, etsyTags, etsyDescription };
}

function generateEtsyTitle(
  template: (typeof TEMPLATE_TYPES)[0],
  aesthetic: (typeof AESTHETICS)[0],
  config: NotionTemplateConfig,
  templateName?: string
): string {
  const year = new Date().getFullYear();

  // Multiple title formats — pick one randomly for variety
  const formats = [
    `${templateName || template.name} | Notion Template ${year} | ${aesthetic.name} | Digital Download`,
    `${template.name} Notion Template ${year} | ${config.targetAudience || "Productivity"} | ${aesthetic.name} | Instant Download`,
    `Premium ${template.name} | Notion Planner ${year} | ${aesthetic.name} Digital Planner | Instant Download`,
    `${templateName || template.name} Notion ${year} | ${aesthetic.name} | Digital Planner for ${config.targetAudience || "Everyone"}`,
  ];

  let title = pick(formats);
  if (title.length > 140) title = title.substring(0, 137) + "...";
  return title;
}

function generateEtsyTags(
  template: (typeof TEMPLATE_TYPES)[0],
  aesthetic: (typeof AESTHETICS)[0],
  config: NotionTemplateConfig
): string[] {
  const year = new Date().getFullYear();
  const allTags = [
    "notion template",
    "digital planner",
    "notion planner",
    `${year} planner`,
    "digital download",
    "instant download",
    "notion dashboard",
    "productivity template",
    "notion workspace",
    "digital organizer",
    "notion system",
    "planner template",
    "work from home",
    "organization system",
    "life planner",
  ];

  // Aesthetic-specific tags
  const aestheticTags: Record<string, string[]> = {
    brown: ["aesthetic planner", "brown aesthetic", "cozy planner"],
    pink: ["pink planner", "pink notion", "girly planner", "cute planner"],
    dark: ["dark mode planner", "dark aesthetic", "dark notion"],
    sage: ["sage planner", "earth tone", "boho planner", "green planner"],
    pastel: ["pastel planner", "cute planner", "kawaii planner"],
    minimal: ["minimalist planner", "clean planner", "simple planner"],
    mono: ["minimal planner", "bold planner"],
  };

  // Type-specific tags
  const typeTags: Record<string, string[]> = {
    student_planner: ["student planner", "academic planner", "college planner", "school planner", "uni planner"],
    finance_tracker: ["budget tracker", "finance planner", "expense tracker", "money tracker", "budget planner"],
    adhd_planner: ["adhd planner", "adhd friendly", "adhd template", "neurodivergent", "focus planner"],
    social_media: ["content creator", "content calendar", "social media", "creator planner", "influencer"],
    habit_tracker: ["habit tracker", "habit planner", "streak tracker", "wellness planner", "daily tracker"],
    business_hub: ["business planner", "freelancer planner", "client tracker", "business template", "crm notion"],
    debt_calculator: ["debt tracker", "budget planner", "debt free", "money planner", "finance tracker"],
    life_planner: ["all in one planner", "life planner", "personal planner", "goal planner", "self improvement"],
  };

  const combined = [
    ...allTags,
    ...(aestheticTags[aesthetic.id] || []),
    ...(typeTags[config.type] || []),
  ];

  // Shuffle and pick 13 (Etsy max), each max 20 chars
  return pickN(combined, combined.length)
    .map((t) => t.substring(0, 20))
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 13);
}

function generateEtsyDescription(
  template: (typeof TEMPLATE_TYPES)[0],
  aesthetic: (typeof AESTHETICS)[0],
  config: NotionTemplateConfig,
  features: string[],
  templateName?: string,
  quote?: string
): string {
  const year = new Date().getFullYear();
  const name = templateName || template.name;

  // Randomize opening hooks
  const hooks = [
    `🚀 Stop wasting time on scattered notes and missed deadlines. This premium Notion template puts everything in one beautiful place.`,
    `✨ Finally — a Notion template that actually works. Designed for real life, not just for looks.`,
    `💎 The last Notion template you'll ever need. Built by a designer, optimized for results.`,
    `🌟 Thousands of Notion users are using templates just like this to transform their ${config.niche || "life"}. Now it's your turn.`,
    `⚡ Your ${config.niche || "productivity"} just leveled up. This isn't just a template — it's a system.`,
  ];

  const hook = pick(hooks);

  return `${hook}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ ${name} ${year} ✨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${quote || '"Stay organized, stay ahead."'}

🎨 AESTHETIC: ${aesthetic.name}
${aesthetic.desc}. Colors: ${aesthetic.colors}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 WHAT'S INSIDE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${features.map((f) => `✅ ${f}`).join("\n")}
✅ Getting Started Quick Guide
✅ Reset Template page (wipe demo data easily)
✅ FAQ & Troubleshooting page
✅ Beautiful cover images on every page

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ KEY FEATURES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 100% functional databases with working formulas
• Progress tracking with visual progress bars
• Multiple views per database (table, board, calendar, gallery)
• Pre-filled with realistic demo data — see it working instantly
• Color-coded labels and priority tags
• Mobile-friendly layout (works on iPhone & iPad)
• Links and navigation between all sections

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 PERFECT FOR:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${config.targetAudience || "Anyone who wants to get more organized and productive"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛠️ HOW TO USE (3 STEPS):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1️⃣ Purchase → receive instant download link
2️⃣ Open in Notion (free account at notion.so)
3️⃣ Click "Duplicate" → start using immediately!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 COMPATIBILITY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• ✅ Notion Free plan (no paid plan needed)
• ✅ Desktop (Mac, Windows, Linux)
• ✅ Mobile (iPhone, Android)
• ✅ Tablet (iPad, Android tablet)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⭐ ⭐ ⭐ ⭐ ⭐ INSTANT DOWNLOAD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You'll receive your template link immediately after purchase.

⚠️ This is a DIGITAL PRODUCT — no physical item will be shipped.
A FREE Notion account is required (notion.so).

Questions? Message me anytime — happy to help! 💌`;
}

// ── Mockup Prompt Generator ──────────────────────────────────
export function generateMockupPrompt(
  template: (typeof TEMPLATE_TYPES)[0],
  aesthetic: (typeof AESTHETICS)[0]
): string {
  return `Professional product mockup for an Etsy digital product listing. Show a ${aesthetic.name} themed Notion template on a modern laptop and iPad screen, placed on a clean ${aesthetic.id === "dark" ? "dark" : "light"} desk. The screens should show a beautiful dashboard with organized sections, progress bars, and clean typography. ${aesthetic.desc}. Photorealistic, professional product photography, soft lighting, shallow depth of field, marketing image, 4K quality.`;
}
