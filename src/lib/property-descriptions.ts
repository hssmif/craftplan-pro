// ── Property Descriptions ──────────────────────────────────
// Human-readable descriptions for every database property across all 4 templates.
// These appear as tooltips when hovering property headers in Notion.
// Premium signal: free templates NEVER have property descriptions.

export const PROPERTY_DESCRIPTIONS: Record<string, Record<string, Record<string, string>>> = {

  // ════════════════════════════════════════════════════════
  // ADHD PLANNER
  // ════════════════════════════════════════════════════════
  adhd_planner: {
    brain_dump: {
      "Thought": "Write anything on your mind — don't filter, just capture. Process later.",
      "Type": "Categorize: Task, Idea, Note, Question, or Worry. Helps prioritize during review.",
      "Energy Level": "How much energy would this require? Match to your current state before starting.",
      "Time Estimate": "Rough guess — 5min, 15min, or 30min. Helps find quick wins.",
      "Processed": "Check when you've moved this to Tasks or decided to let it go.",
      "Created": "Auto-set when you create the entry. Helps spot stale thoughts.",
      "Linked Task": "🔗 Links to the Task entry if you promoted this thought into action.",
      "Action Priority": "🤖 Auto-calculated triage: ⚡ Quick Win, 🧘 Process First, ✅ Done, or 📥 Inbox.",
    },
    goals: {
      "Goal": "What you want to achieve — be specific and measurable.",
      "Area": "Life area: Health, Career, Personal Growth, Finance, Relationships, or Creative.",
      "Status": "Current state: Not Started, Active, Completed, or On Hold.",
      "Target Date": "When you want to achieve this by. Used for urgency calculations.",
      "Progress": "Manually update 0-100. The Progress Bar formula visualizes this.",
      "Progress Bar": "🤖 Visual bar chart (██░░░░) generated from your Progress percentage.",
      "Notes": "Additional context, milestones, or sub-goals.",
    },
    tasks: {
      "Task": "What needs to get done — be specific enough to start immediately.",
      "Status": "Not Started → In Progress → Done or Cancelled. Move items as you work.",
      "Priority": "🔴 Now (today), 🟡 Soon (this week), 🔵 Later, ⚪ Someday.",
      "Category": "Group by area: Work, Personal, Health, Admin, Creative, Learning.",
      "Energy Required": "How much energy: Low 🔋, Medium ⚡, or High 🚀. Match to your current state.",
      "Time Estimate": "Rough time: 5min, 15min, 30min, 1hr, 2hr+. Find quick wins when energy is low.",
      "Due Date": "When this needs to be done. The Days Until Due formula tracks urgency.",
      "Dopamine Rating": "How fun is this? 🎉 Fun, 😐 Neutral, 😩 Boring. Helps the Hyperfocus Risk formula.",
      "Body Double Needed": "Check if you need someone nearby to stay focused on this task.",
      "Done Date": "Auto-set or manually add when completed. Tracks velocity.",
      "Notes": "Break it down, add links, or note blockers.",
      "Goal": "🔗 Links to a Goal this task supports. Keeps tasks purposeful.",
      "Focus Session": "🔗 Links to the Focus Session used for this task.",
      "From Brain Dump": "🔗 Links back to the Brain Dump thought that created this task.",
      "Days Until Due": "🤖 Auto-calculated days remaining. Shows ⚠️ Overdue when past due.",
      "Week": "🤖 Auto-calculated ISO week number from Due Date.",
      "Hyperfocus Risk": "🤖 ADHD awareness: ⚠️ Hyperfocus Trap (High energy + Fun), 🧊 Avoidance Risk (High + Boring), ✅ Balanced.",
      "Created": "Auto-set timestamp. Helps identify tasks sitting too long.",
    },
    focus_sessions: {
      "Session": "Name your focus block — e.g., 'Deep work: Project X' or 'Admin batch'.",
      "Date": "When the session happened. Helps track focus patterns over time.",
      "Duration (min)": "How long you planned to focus (in minutes).",
      "Actual (min)": "How long you actually focused. Used for Focus Score calculation.",
      "Type": "Session type: Deep Work, Admin, Creative, Learning, or Planning.",
      "Focus Rating": "Self-assessed quality: 1-5 stars. Be honest — it helps identify patterns.",
      "Distractions": "Count of times you got pulled away. Lower = better focus.",
      "Energy Before": "Energy level when you started: Low 🔋, Medium ⚡, High 🚀.",
      "Energy After": "Energy level when you finished. Track which tasks drain vs energize you.",
      "Completed": "Did you finish what you planned? Check if yes.",
      "Focus Score": "🤖 Efficiency percentage: (Actual ÷ Duration) × 100. Above 80% = great focus.",
      "Notes": "What worked, what didn't, insights for next time.",
    },
    habits: {
      "Habit": "The habit you're building — keep it small and specific.",
      "Category": "Group: Morning Routine, Evening Routine, Health, Productivity, Self-Care, Learning.",
      "Frequency": "How often: Daily, Weekdays, Weekends, 3x/week, Weekly.",
      "Importance": "How critical: Must Do (non-negotiable), Should Do, Nice to Have.",
      "Current Streak": "Consecutive completions. The Streak Bar visualizes this.",
      "Best Streak": "Your all-time record. Try to beat it!",
      "Streak Bar": "🤖 Visual streak (🔥🔥🔥░░) generated from Current Streak.",
      "Today": "Check daily when you complete this habit. Resets each day.",
      "Last Done": "Date of most recent completion. Helps spot gaps.",
      "Notes": "Tips, triggers, or rewards linked to this habit.",
    },
    daily_log: {
      "Date": "Today's entry label — e.g., 'Monday Jan 15'.",
      "Day Date": "The actual date. Used for calendar views and sorting.",
      "Mood": "Overall mood: 😊 Great, 🙂 Good, 😐 Okay, 😔 Low, 😤 Frustrated.",
      "Energy Peak": "When you felt most energized: Morning, Afternoon, Evening. Track your patterns.",
      "Top 3 Wins": "What went well today? Celebrate even small wins.",
      "Gratitude": "One thing you're grateful for. Builds positive mindset.",
      "Reflection": "What would you do differently? Brief is fine.",
      "Sleep Hours": "Hours slept last night. Correlates with focus and mood.",
      "Water Glasses": "Glasses of water today. Hydration affects focus.",
      "Tasks Done": "How many tasks you completed. Feeds into Day Score.",
      "Focus Minutes": "Total focused minutes today. From focus sessions or manual.",
      "Day Score": "🤖 Composite wellness score: Tasks×15 + Focus×0.5 + Mood + Water×2 + Sleep×3.",
      "Energy Match": "🤖 Feedback: 🎯 Peak Used Well (Morning peak + 3+ tasks), 💤 Low Output, or 📊 Average.",
    },
    meals: {
      "Meal": "What you're eating — name the dish or meal.",
      "Type": "Meal type: Breakfast, Lunch, Dinner, or Snack.",
      "Prep Time": "Effort: No Cook, Quick (15min), Medium (30min), Long (1hr+).",
      "Energy Level Needed": "Energy to prepare: Low 🔋, Medium ⚡, High 🚀. Plan for low-energy days.",
      "Ingredients": "Key ingredients or full recipe notes.",
      "Recipe Link": "URL to recipe source if you have one.",
      "Rating": "How much you enjoyed it: ⭐⭐⭐⭐⭐ scale.",
      "Day": "🔗 Links to the Daily Log entry for this meal.",
    },
    routines: {
      "Step": "Name of this routine step — e.g., 'Brush teeth', 'Check calendar'.",
      "Routine": "Which routine: Morning, Evening, Work Start, or Wind Down.",
      "Order": "Step number in sequence. Keeps your routine in the right order.",
      "Duration (min)": "How long this step takes in minutes.",
      "Done": "Check when completed. Reset daily.",
      "Notes": "Tips or modifications for this step.",
    },
  },

  // ════════════════════════════════════════════════════════
  // FINANCE TRACKER
  // ════════════════════════════════════════════════════════
  finance_tracker: {
    wallets: {
      "Name": "Wallet or account name — e.g., 'Main Checking', 'Savings', 'Crypto'.",
      "Type": "Account type: Cash, Bank, Investment, Credit, Crypto, or Savings.",
      "Balance": "Current balance in this wallet. Update regularly after transactions.",
      "Currency": "Primary currency: EUR, USD, or GBP.",
      "Color": "Color tag for visual identification in Gallery view.",
      "Is Active": "Uncheck for dormant or closed accounts.",
      "Notes": "Account details, bank name, or purpose.",
    },
    transactions: {
      "Name": "What the transaction is — payee, income source, or transfer description.",
      "Amount": "Transaction amount. Use positive numbers for all types.",
      "Type": "Transaction direction: Expense (money out), Income (money in), or Transfer (between wallets).",
      "Category": "Spending or income category: Salary, Freelance, Housing, Food & Dining, Utilities, etc.",
      "Wallet": "🔗 Which wallet this transaction belongs to. Link to Wallets database.",
      "Date": "When the transaction occurred or is expected.",
      "Month": "🤖 Auto-formatted month/year from Date for easy grouping and filtering.",
      "Week": "🤖 Auto-calculated week number from Date.",
      "Is Recurring": "Check for recurring transactions (salary, rent, subscriptions).",
      "Notes": "Receipt details, invoice numbers, or context.",
      "Status": "Processing state: Pending (not yet processed), Cleared (confirmed), or Reconciled (verified).",
    },
    budgets: {
      "Category": "Budget category name — should match your transaction categories for easy comparison.",
      "Monthly Limit": "Maximum spending allowed for this category per month.",
      "Spent This Month": "How much spent so far this month. Update from your Transactions totals.",
      "Remaining": "🤖 Auto-calculated: Monthly Limit minus Spent This Month.",
      "Usage %": "🤖 Percentage of budget consumed. Feeds the Status indicator.",
      "Status": "🤖 Auto-tiered: 🟢 Healthy (≤50%), 🟡 Caution (50-80%), 🟠 Tight (80-100%), 🔴 Over Budget (>100%).",
      "Period": "Which month/period this budget applies to.",
    },
    financial_goals: {
      "Goal": "What you're saving for — be specific and motivating.",
      "Target Amount": "Total amount needed to achieve this goal.",
      "Current Amount": "How much saved so far. Update as you make progress.",
      "Progress %": "🤖 Auto-calculated percentage toward your target.",
      "Progress Bar": "🤖 Visual bar (██████░░░░ 60%) showing savings progress at a glance.",
      "Target Date": "When you want to reach this goal. Feeds the Days Left countdown.",
      "Days Left": "🤖 Auto-calculated days remaining until your target date.",
      "Category": "Goal type: Safety Net, Travel, Investing, Big Purchase, or Education.",
      "Status": "Current state: Active (working toward it), Paused (on hold), or Achieved (done!).",
      "Linked Wallet": "🔗 Which wallet holds the funds for this goal.",
      "Monthly Contribution": "How much you contribute each month toward this goal.",
    },
    net_worth: {
      "Month": "Month/year snapshot label — e.g., 'March 2026'. Add one entry per month.",
      "Total Assets": "Sum of all asset values (savings, investments, property) for this month.",
      "Total Liabilities": "Sum of all debts (loans, credit cards, mortgages) for this month.",
      "Net Worth": "🤖 Auto-calculated: Total Assets minus Total Liabilities.",
      "Change from Last Month": "How much your net worth changed since last month's entry.",
      "Change %": "🤖 Auto-calculated percentage change from previous month.",
      "Notes": "Context: what changed this month, major purchases, milestones reached.",
    },
  },

  // ════════════════════════════════════════════════════════
  // LIFE PLANNER
  // ════════════════════════════════════════════════════════
  life_planner: {
    tasks_goals: {
      "Name": "What needs to get done (Task) or what you want to achieve (Goal).",
      "Type": "Entry type: Task for action items, Goal for objectives.",
      "Status": "Current state: To Do, In Progress, Done, Blocked (tasks) or Active, Achieved, Paused (goals).",
      "Priority": "Importance level: 🔴 High, 🟡 Medium, 🔵 Low.",
      "Due Date": "Deadline for this task. The Urgency Score formula tracks this.",
      "Area": "Life area: Career, Health, Finance, Learning, Personal, or Relationships.",
      "Progress": "Update 0-100 as you make progress on goals. Feeds the Progress Bar.",
      "Progress Bar": "🤖 Visual bar chart generated from your Progress percentage. Only shows for Goals.",
      "Timeline": "Time horizon for goals: Q1 2026, Q2 2026, This Year, Long-term.",
      "Parent Goal": "🔗 Links a task to the goal it supports. Self-relation within Tasks & Goals.",
      "Days Left": "🤖 Auto-calculated days until due date. Only shows for Tasks.",
      "Urgency Score": "🤖 Five-level urgency: 🔴 Overdue, 🟡 Urgent (≤2 days), 🟢 This Week, 📅 Scheduled, 📋 Backlog. Only shows for Tasks.",
      "Goal Momentum": "🤖 Motivational status: 🚀 Almost There (≥75%), 💪 Halfway (≥50%), 🌱 Growing (≥25%), 🏁 Just Started. Only shows for Goals.",
      "Why This Matters": "Your personal reason for pursuing this goal. Read it when motivation dips.",
      "Notes": "Subtasks, context, links, or blockers.",
      "Created": "Auto-set timestamp when the entry was created.",
    },
    habits_wellness: {
      "Habit": "The habit you're building or maintaining.",
      "Area": "Life area this habit supports: Health, Mind, Work, Self-Care.",
      "Streak": "Consecutive days completed. Try to beat your record!",
      "Streak Bar": "🤖 Visual streak bar generated from your current streak count.",
      "Today": "Check daily when you complete this habit.",
      "Frequency": "Target frequency: Daily, Weekdays, 3x/week.",
      "Time of Day": "Best time to do this: Morning, Afternoon, Evening, Anytime.",
    },
    journal_notes: {
      "Entry": "Title for your journal entry, note, idea, or meeting notes.",
      "Type": "Entry type: Journal for daily reflections, Note for reference, Idea for brainstorms, Meeting for meeting notes.",
      "Date": "The date of this entry.",
      "Mood": "Overall mood (for Journal entries): 😊 Great, 🙂 Good, 😐 Okay, 😔 Low.",
      "Category": "Topic category: Work, Personal, Idea, Learning, Meeting.",
      "Priority": "Importance: 🔴 High, 🟡 Medium, 🔵 Low.",
      "Tags": "Add multiple tags for easy filtering and search.",
      "Content": "Main content of your entry — wins, highlights, or note body.",
      "Gratitude": "What you're grateful for today. Longer entries boost your Reflection Depth.",
      "Reflection Depth": "🤖 Journal quality: 🌟 Deep Reflection (detailed Gratitude + Content), 📝 Good Entry, ✏️ Quick Note. Only shows for Journal type.",
      "Created": "Auto-set timestamp when the entry was created.",
    },
    reading_learning: {
      "Title": "Book title you're reading or have read.",
      "Author": "Author name(s).",
      "Status": "Reading state: Want to Read, Reading, Finished, or Abandoned.",
      "Genre": "Book genre: Self-Help, Business, Fiction, Science, Biography.",
      "Rating": "Your rating after finishing: ⭐ to ⭐⭐⭐⭐⭐.",
      "Date Finished": "When you completed the book.",
      "Key Takeaways": "Main lessons or favorite quotes from the book.",
    },
  },

  // ════════════════════════════════════════════════════════
  // SOCIAL MEDIA PLANNER
  // ════════════════════════════════════════════════════════
  social_media_planner: {
    content_calendar: {
      "Post Title": "Working title for this post — can be changed before publishing.",
      "Platform": "Where this will be posted: Instagram, TikTok, Pinterest, Twitter, or LinkedIn.",
      "Content Type": "Format: Reel, Carousel, Story, Static Image, Thread, or Pin.",
      "Status": "Workflow stage: 💡 Idea → ✏️ Drafting → ⏰ Scheduled → 📤 Published → 📊 Analyzing.",
      "Publish Date": "When this content should go live. Use Calendar view for scheduling.",
      "Caption": "Post caption/copy. Write the full text here before publishing.",
      "Hashtags": "Add relevant hashtags. Keep to 5-15 for Instagram, 3-5 for other platforms.",
      "Campaign": "🔗 Links to the Campaign this post belongs to.",
      "Performance Tier": "🤖 Auto-status: 📊 Check Analytics (Published), ⏰ Ready (Scheduled), ✏️ In Progress (Drafting), 💡 Idea.",
      "Created": "Auto-set timestamp when this post was created.",
    },
    campaigns: {
      "Campaign Name": "Name of this marketing campaign or content series.",
      "Goal": "Campaign objective: Brand Awareness, Engagement, Sales, Growth, or Collaboration.",
      "Start Date": "When this campaign launches.",
      "End Date": "When this campaign wraps up.",
      "Status": "Current state: Planning, Active, Completed, or Paused.",
      "Platform Focus": "Which platforms this campaign targets. Can select multiple.",
      "Content Count": "🤖 Shows linked post count. Check the relation to Content Calendar.",
      "Notes": "Campaign brief, KPIs, target audience, or creative direction.",
    },
    analytics: {
      "Post Reference": "Which post these analytics are for — match to Content Calendar title.",
      "Platform": "Platform where this was posted.",
      "Date": "Date of the analytics snapshot.",
      "Likes": "Total likes/hearts/reactions.",
      "Comments": "Total comments received.",
      "Shares": "Total shares, reposts, or saves.",
      "Reach": "Total unique accounts that saw this post.",
      "Engagement Rate": "🤖 Auto-calculated: (Likes + Comments + Shares) ÷ Reach × 100%. Above 3% = great.",
      "Best Time": "When this post performed best: Morning, Afternoon, Evening, or Night.",
    },
    content_ideas: {
      "Idea": "Brief description of the content idea.",
      "Category": "Content type: Tutorial, Behind the Scenes, Product, Lifestyle, Trending, or Educational.",
      "Platform": "Which platform(s) this idea works best for. Can select multiple.",
      "Effort Level": "Production effort: Quick (under 30min), Medium (1-2hr), Production (half day+).",
      "Saved": "Bookmark ideas you want to use soon. Affects the Priority formula.",
      "Inspiration Source": "Where you found this idea — competitor, trend, customer request, etc.",
      "Priority": "🤖 Auto-calculated: ⚡ Do Next (Saved + Quick), 📌 Saved, 🎯 Easy Win (Quick), 📋 Backlog.",
    },
    brand_assets: {
      "Asset Name": "Name of this brand asset — e.g., 'Primary Logo', 'Brand Colors'.",
      "Type": "Asset type: Color Palette, Font, Logo, Template, Hashtag Set, or Sound.",
      "Usage": "How and where to use this asset. Include guidelines.",
      "Link": "URL to the asset file, Canva template, or cloud storage link.",
      "Last Updated": "When this asset was last reviewed or modified.",
      "Active": "Uncheck for retired/deprecated assets. Helps keep the brand kit current.",
    },
  },
};

/**
 * Apply property descriptions to a template's databases.
 * Call at the end of each get*Spec() function before returning.
 */
export function applyPropertyDescriptions(
  templateId: string,
  databases: Array<{ key: string; properties: Array<{ name: string; description?: string }> }>,
): void {
  const templateDescs = PROPERTY_DESCRIPTIONS[templateId];
  if (!templateDescs) return;

  for (const db of databases) {
    const dbDescs = templateDescs[db.key];
    if (!dbDescs) continue;
    for (const prop of db.properties) {
      if (dbDescs[prop.name] && !prop.description) {
        prop.description = dbDescs[prop.name];
      }
    }
  }
}
