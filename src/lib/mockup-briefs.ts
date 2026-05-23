// ── Mockup Brief Generator ──────────────────────────────────
// Generates structured 10-slot mockup briefs with screenshot instructions.
// Tells users exactly what to capture in Notion for Etsy listing images.

export interface MockupSlot {
  slotNumber: number;
  sceneName: string;
  purpose: "thumbnail" | "feature" | "detail" | "lifestyle";
  device: "ipad" | "macbook" | "iphone" | "multi";
  notionViewToCapture: string;
  screenshotInstructions: string;
  framingTip: string;
  overlayText?: string;
}

export interface MockupBrief {
  templateName: string;
  templateType: string;
  totalSlots: number;
  slots: MockupSlot[];
  generalTips: string[];
}

// ── Template-specific view instructions ──

const TEMPLATE_DETAIL_SLOTS: Record<string, MockupSlot[]> = {
  finance_tracker: [
    {
      slotNumber: 4,
      sceneName: "Budget Dashboard",
      purpose: "detail",
      device: "ipad",
      notionViewToCapture: "Budget database — table view with Budget Health column visible",
      screenshotInstructions: "Open Budget database in table view. Ensure Budget Health formula shows colored emoji indicators (🟢🟡🟠🔴). Widen the Budget Health column.",
      framingTip: "iPad closeup showing budget categories with colored status indicators",
      overlayText: "See exactly where your money goes",
    },
    {
      slotNumber: 5,
      sceneName: "Savings Progress",
      purpose: "detail",
      device: "macbook",
      notionViewToCapture: "Savings database — table view with Progress Bar and Months to Goal visible",
      screenshotInstructions: "Open Savings Goals. Show Progress Bar (██░░░) and Months to Goal columns. Include at least one 'Reached!' status for social proof.",
      framingTip: "MacBook showing savings goals with visual progress bars",
      overlayText: "Track every savings goal automatically",
    },
    {
      slotNumber: 6,
      sceneName: "Debt Tracker",
      purpose: "detail",
      device: "iphone",
      notionViewToCapture: "Debts database — show Payoff Priority and Progress Bar columns",
      screenshotInstructions: "Open Debts database. Make sure Payoff Priority formula shows colored recommendations. Include one 'Paid Off!' debt for motivation.",
      framingTip: "Phone view showing debt payoff progress — feels personal and motivating",
      overlayText: "Crush your debt with smart prioritization",
    },
  ],
  adhd_planner: [
    {
      slotNumber: 4,
      sceneName: "Brain Dump View",
      purpose: "detail",
      device: "ipad",
      notionViewToCapture: "Brain Dump database — board view grouped by Type",
      screenshotInstructions: "Switch Brain Dump to Board view grouped by Type. Show columns: Task, Idea, Worry, Note. Make sure Action Priority formula is visible with colored badges.",
      framingTip: "iPad showing organized brain dump — visual proof that chaos becomes order",
      overlayText: "Dump it all, sort it later",
    },
    {
      slotNumber: 5,
      sceneName: "Focus Sessions",
      purpose: "detail",
      device: "macbook",
      notionViewToCapture: "Focus Sessions database — table view with Focus Score visible",
      screenshotInstructions: "Show Focus Sessions with Duration, Actual, and Focus Score columns visible. Include sessions with varying scores to show the formula working.",
      framingTip: "MacBook showing focus session data — appeals to productivity nerds",
      overlayText: "Track your focus patterns",
    },
    {
      slotNumber: 6,
      sceneName: "Hyperfocus Risk",
      purpose: "detail",
      device: "iphone",
      notionViewToCapture: "Tasks database — show Hyperfocus Risk column with warnings",
      screenshotInstructions: "Filter Tasks to show a mix of Hyperfocus Risk values: ⚠️ Hyperfocus Trap, 🧊 Avoidance Risk, ✅ Balanced. This is a unique selling point.",
      framingTip: "Phone view of ADHD-specific formula — this is the 'wow' feature",
      overlayText: "Built for ADHD brains",
    },
  ],
  life_planner: [
    {
      slotNumber: 4,
      sceneName: "Goals Dashboard",
      purpose: "detail",
      device: "ipad",
      notionViewToCapture: "Goals database — table view with Goal Momentum and Progress Bar",
      screenshotInstructions: "Show Goals with Progress Bar (██░░░), Goal Momentum (🚀💪🌱🏁), and Status columns. Include goals at different progress levels.",
      framingTip: "iPad showing goals with motivational momentum indicators",
      overlayText: "Watch your goals come alive",
    },
    {
      slotNumber: 5,
      sceneName: "Journal Entries",
      purpose: "detail",
      device: "macbook",
      notionViewToCapture: "Journal database — gallery or table view with Reflection Depth visible",
      screenshotInstructions: "Show Journal entries with Mood, Gratitude, and Reflection Depth columns. The depth formula (🌟📝✏️) encourages detailed journaling.",
      framingTip: "MacBook showing journal with quality indicators — unique selling point",
      overlayText: "Journaling that rewards depth",
    },
    {
      slotNumber: 6,
      sceneName: "Weekly Tasks",
      purpose: "detail",
      device: "iphone",
      notionViewToCapture: "Tasks database — board view grouped by Urgency Score",
      screenshotInstructions: "Switch Tasks to Board view grouped by Urgency Score. Show columns: 🔴 Overdue, 🟡 Urgent, 🟢 This Week, 📅 Scheduled, 📋 Backlog.",
      framingTip: "Phone showing task urgency — Kanban-style organization",
      overlayText: "Never miss a deadline again",
    },
  ],
  social_media_planner: [
    {
      slotNumber: 4,
      sceneName: "Content Calendar",
      purpose: "detail",
      device: "ipad",
      notionViewToCapture: "Content Calendar — calendar view by Publish Date",
      screenshotInstructions: "Switch Content Calendar to Calendar view. Show at least 2 weeks with posts scheduled. Make sure post titles and Platform tags are visible on calendar cards.",
      framingTip: "iPad calendar view filled with scheduled content — looks productive",
      overlayText: "Plan your content weeks ahead",
    },
    {
      slotNumber: 5,
      sceneName: "Analytics Dashboard",
      purpose: "detail",
      device: "macbook",
      notionViewToCapture: "Analytics database — table view with Engagement Rate formula",
      screenshotInstructions: "Show Analytics with Likes, Comments, Shares, Reach, and Engagement Rate columns. Include viral posts (high numbers) alongside normal ones for contrast.",
      framingTip: "MacBook showing social analytics — data-driven content strategy",
      overlayText: "Know what's working",
    },
    {
      slotNumber: 6,
      sceneName: "Content Ideas Board",
      purpose: "detail",
      device: "iphone",
      notionViewToCapture: "Content Ideas — board view grouped by Category",
      screenshotInstructions: "Switch Content Ideas to Board grouped by Category. Show Tutorial, BTS, Product, Trending columns. Make sure Priority formula badges are visible.",
      framingTip: "Phone showing idea backlog — never run out of content ideas",
      overlayText: "Never run out of ideas",
    },
  ],
};

// ── Main Generator ──

export function generateMockupBrief(
  templateName: string,
  templateType: string,
  databases: string[],
  aesthetic: string,
): MockupBrief {
  // Universal slots (same for all templates)
  const universalSlots: MockupSlot[] = [
    {
      slotNumber: 1,
      sceneName: "Hero Thumbnail",
      purpose: "thumbnail",
      device: "multi",
      notionViewToCapture: "Main dashboard — top section with title, nav, and KPI cards",
      screenshotInstructions: `Take 2 screenshots: (1) the main page zoomed to show the title and cover image, (2) the dashboard with KPI cards and navigation visible. Use full-width browser window. These will be composited into a dual-device mockup.`,
      framingTip: "Two iPads side by side on warm background. Left = cover, right = dashboard. This is your most important image.",
      overlayText: templateName,
    },
    {
      slotNumber: 2,
      sceneName: "Full Dashboard Overview",
      purpose: "feature",
      device: "macbook",
      notionViewToCapture: "Main dashboard — scrolled to show database sections",
      screenshotInstructions: `Scroll dashboard to show 2-3 database sections with sample data visible. Hide Notion sidebar (Cmd/Ctrl+\\). ${aesthetic === "dark" ? "Use dark mode." : "Use default light mode."} Ensure database headers and section callouts are visible.`,
      framingTip: "MacBook centered, floating on gradient background. Shows the full scope of the template.",
      overlayText: `Everything you need in one dashboard`,
    },
    {
      slotNumber: 3,
      sceneName: "Start Here Page",
      purpose: "feature",
      device: "ipad",
      notionViewToCapture: "🚀 Start Here sub-page — show setup steps and pro tips",
      screenshotInstructions: "Open the Start Here sub-page. Show the Quick Setup steps and at least 2 Pro Tip toggles expanded. This proves the template has great onboarding.",
      framingTip: "iPad in hands, casual lifestyle shot. Shows the template is beginner-friendly.",
      overlayText: "Set up in 5 minutes",
    },
  ];

  // Template-specific detail slots (slots 4-6)
  const detailSlots = TEMPLATE_DETAIL_SLOTS[templateType] || [];

  // Additional universal slots (slots 7-10)
  const additionalSlots: MockupSlot[] = [
    {
      slotNumber: 7,
      sceneName: "Mobile View",
      purpose: "lifestyle",
      device: "iphone",
      notionViewToCapture: "Main dashboard — mobile responsive view",
      screenshotInstructions: "Open the template on a phone or resize browser to 375px width. Scroll to show a database section with data. Mobile-friendly = more sales.",
      framingTip: "iPhone floating at angle with soft shadow. Shows template works on mobile.",
      overlayText: "Works on all devices",
    },
    {
      slotNumber: 8,
      sceneName: "Formula Close-up",
      purpose: "detail",
      device: "macbook",
      notionViewToCapture: `Any database with formula columns — zoom to show formulas in action`,
      screenshotInstructions: `Pick the database with the most impressive formulas (${databases.slice(0, 2).join(", ")}). Zoom to 150% and screenshot just the formula columns. Show emoji-based status formulas working.`,
      framingTip: "Tight crop of formula columns on MacBook. Shows the 'smart' factor that justifies premium pricing.",
      overlayText: "Smart formulas do the work for you",
    },
    {
      slotNumber: 9,
      sceneName: "Sample Data Showcase",
      purpose: "feature",
      device: "ipad",
      notionViewToCapture: "Primary database — table view with all columns visible",
      screenshotInstructions: "Open the main database in full table view. Ensure all columns are visible (may need to scroll horizontally). Show 5+ rows of realistic sample data. Buyers want to see the template 'filled in'.",
      framingTip: "iPad flat-lay on marble or wooden desk. Shows dense, useful data — proves value.",
      overlayText: "Comes with sample data to get you started",
    },
    {
      slotNumber: 10,
      sceneName: "Lifestyle Context Shot",
      purpose: "lifestyle",
      device: "multi",
      notionViewToCapture: "Main dashboard — hero section",
      screenshotInstructions: "Take a clean screenshot of the top of the dashboard (title + first section). This will be placed into a lifestyle mockup scene — café table, cozy desk, or studio setup.",
      framingTip: "Multi-device setup (laptop + phone + tablet) on styled desk with props (coffee, plant, notebook). Aspirational lifestyle shot.",
      overlayText: templateName,
    },
  ];

  const allSlots = [...universalSlots, ...detailSlots, ...additionalSlots];
  // Re-number slots sequentially
  allSlots.forEach((slot, i) => {
    slot.slotNumber = i + 1;
  });

  return {
    templateName,
    templateType,
    totalSlots: allSlots.length,
    slots: allSlots.slice(0, 10),
    generalTips: [
      `Hide the Notion sidebar before every screenshot (Cmd/Ctrl+\\)`,
      "Use full-width layout in Notion Settings → Appearance",
      `Match the "${aesthetic}" aesthetic in your Notion theme settings`,
      "Sample data must look realistic — empty templates don't sell",
      "For iPad mockups: screenshot at 1024×768 minimum resolution",
      "For iPhone mockups: screenshot at 390×844 minimum resolution",
      "Overlay text should use a clean font (Inter, Poppins) — Canva works great",
      "Keep overlays to 5-8 words max — let the template speak for itself",
      "Use consistent overlay placement across all 10 images",
      "Image 1 (hero thumbnail) gets the most views — spend the most time on it",
    ],
  };
}
