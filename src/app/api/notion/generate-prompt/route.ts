import { NextRequest, NextResponse } from "next/server";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PromptConfig {
  templateType: string;
  features: string[];
  targetAudience: string;
  aesthetic: string;
  complexity: string;
}

interface DatabaseProperty {
  name: string;
  type: string;
  description: string;
}

interface DatabaseDef {
  name: string;
  icon: string;
  properties: DatabaseProperty[];
  views: string[];
}

interface FormulaDef {
  database: string;
  property: string;
  formula: string;
  purpose: string;
}

interface TemplateSpec {
  title: string;
  icon: string;
  coverUrl: string;
  tagline: string;
  databases: DatabaseDef[];
  formulas: FormulaDef[];
  sampleData: string;
  dashboardLayout: string[];
  navigationSetup: string[];
}

/* ------------------------------------------------------------------ */
/*  Template Specifications                                            */
/* ------------------------------------------------------------------ */

const TEMPLATE_SPECS: Record<string, TemplateSpec> = {
  /* ============================================================== */
  /*  1. LIFE PLANNER                                                */
  /* ============================================================== */
  life_planner: {
    title: "Ultimate Life Planner",
    icon: "\u{1F3AF}",
    coverUrl:
      "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=1500&q=80",
    tagline:
      "Your all-in-one command center for tasks, habits, goals, journaling, and projects.",
    databases: [
      {
        name: "Tasks",
        icon: "\u2705",
        properties: [
          { name: "Task", type: "Title", description: "Name of the task" },
          {
            name: "Status",
            type: "Select",
            description:
              'Options: Not Started, In Progress, Done, Blocked (colors: gray, blue, green, red)',
          },
          {
            name: "Priority",
            type: "Select",
            description: 'Options: Urgent, High, Medium, Low (colors: red, orange, yellow, gray)',
          },
          {
            name: "Due Date",
            type: "Date",
            description: "Deadline for the task",
          },
          {
            name: "Project",
            type: "Relation",
            description: 'Linked to "Projects" database',
          },
          {
            name: "Category",
            type: "Select",
            description:
              "Options: Work, Personal, Health, Finance, Learning",
          },
          {
            name: "Time Estimate",
            type: "Number",
            description: "Estimated minutes to complete",
          },
          {
            name: "Completed Date",
            type: "Date",
            description: "Date when the task was completed",
          },
        ],
        views: [
          "All Tasks (Table) - default, sorted by Due Date ascending",
          "Kanban Board - grouped by Status",
          "This Week (Table) - filtered to Due Date within this week, sorted by Priority",
          "By Category (Board) - grouped by Category",
          "Completed (Table) - filtered to Status = Done, sorted by Completed Date descending",
        ],
      },
      {
        name: "Habits",
        icon: "\u{1F525}",
        properties: [
          { name: "Habit", type: "Title", description: "Name of the habit" },
          {
            name: "Frequency",
            type: "Select",
            description: "Options: Daily, Weekdays, 3x Week, Weekly",
          },
          {
            name: "Category",
            type: "Select",
            description: "Options: Health, Mindset, Productivity, Social, Self-care",
          },
          {
            name: "Current Streak",
            type: "Number",
            description: "How many consecutive completions",
          },
          {
            name: "Best Streak",
            type: "Number",
            description: "Longest streak ever achieved",
          },
          {
            name: "Total Completions",
            type: "Number",
            description: "Lifetime completions count",
          },
          {
            name: "Active",
            type: "Checkbox",
            description: "Whether the habit is currently being tracked",
          },
        ],
        views: [
          "Active Habits (Table) - filtered to Active = checked, sorted by Category",
          "Gallery View - grouped by Category, card shows streak info",
          "All Habits (Table) - all habits including inactive",
        ],
      },
      {
        name: "Goals",
        icon: "\u{1F3C6}",
        properties: [
          { name: "Goal", type: "Title", description: "Name of the goal" },
          {
            name: "Area",
            type: "Select",
            description:
              "Options: Career, Health, Finance, Relationships, Personal Growth, Education",
          },
          {
            name: "Timeline",
            type: "Select",
            description: "Options: This Month, This Quarter, This Year, 5-Year",
          },
          {
            name: "Target Value",
            type: "Number",
            description: "Numerical target (e.g. 10000 for savings goal)",
          },
          {
            name: "Current Value",
            type: "Number",
            description: "Current progress number",
          },
          {
            name: "Start Date",
            type: "Date",
            description: "When you started working on this goal",
          },
          {
            name: "Deadline",
            type: "Date",
            description: "Target completion date",
          },
          {
            name: "Status",
            type: "Select",
            description: "Options: Planning, Active, Completed, Paused",
          },
          {
            name: "Linked Tasks",
            type: "Relation",
            description: 'Linked to "Tasks" database',
          },
        ],
        views: [
          "Active Goals (Table) - filtered to Status = Active, sorted by Deadline",
          "By Area (Board) - grouped by Area",
          "Timeline View (Timeline) - using Start Date and Deadline",
        ],
      },
      {
        name: "Journal",
        icon: "\u{1F4D3}",
        properties: [
          {
            name: "Entry",
            type: "Title",
            description: 'Format: "YYYY-MM-DD Journal"',
          },
          {
            name: "Date",
            type: "Date",
            description: "Entry date",
          },
          {
            name: "Mood",
            type: "Select",
            description:
              'Options: Amazing \u{1F929}, Good \u{1F60A}, Neutral \u{1F610}, Low \u{1F614}, Tough \u{1F622}',
          },
          {
            name: "Gratitude",
            type: "Rich Text",
            description: "3 things you are grateful for today",
          },
          {
            name: "Highlight",
            type: "Rich Text",
            description: "Best moment of the day",
          },
          {
            name: "Energy Level",
            type: "Select",
            description: "Options: High, Medium, Low",
          },
        ],
        views: [
          "Recent Entries (Table) - sorted by Date descending",
          "Calendar View (Calendar) - by Date",
          "Mood Board (Board) - grouped by Mood",
        ],
      },
      {
        name: "Projects",
        icon: "\u{1F4C1}",
        properties: [
          {
            name: "Project",
            type: "Title",
            description: "Name of the project",
          },
          {
            name: "Status",
            type: "Select",
            description: "Options: Idea, Planning, In Progress, Completed, On Hold",
          },
          {
            name: "Priority",
            type: "Select",
            description: "Options: High, Medium, Low",
          },
          {
            name: "Start Date",
            type: "Date",
            description: "Project start date",
          },
          {
            name: "End Date",
            type: "Date",
            description: "Target completion date",
          },
          {
            name: "Area",
            type: "Select",
            description: "Options: Work, Personal, Side Hustle, Learning",
          },
          {
            name: "Tasks",
            type: "Relation",
            description: 'Linked to "Tasks" database',
          },
          {
            name: "Notes",
            type: "Rich Text",
            description: "Project description and notes",
          },
        ],
        views: [
          "Active Projects (Table) - filtered to Status = In Progress",
          "Kanban (Board) - grouped by Status",
          "Timeline (Timeline) - using Start Date and End Date",
        ],
      },
    ],
    formulas: [
      {
        database: "Tasks",
        property: "Days Until Due",
        formula:
          'if(empty(prop("Due Date")), 0, dateBetween(prop("Due Date"), now(), "days"))',
        purpose:
          "Shows how many days remain until the task is due. Negative = overdue.",
      },
      {
        database: "Goals",
        property: "Progress %",
        formula:
          'if(prop("Target Value") == 0, 0, round(prop("Current Value") / prop("Target Value") * 100))',
        purpose:
          "Calculates percentage progress toward the goal target.",
      },
      {
        database: "Habits",
        property: "Streak Status",
        formula:
          'if(prop("Current Streak") >= 30, "\u{1F525} On Fire!", if(prop("Current Streak") >= 7, "\u{1F4AA} Strong!", if(prop("Current Streak") >= 1, "\u{1F331} Growing", "\u26A0\uFE0F Start Today")))',
        purpose: "Motivational label based on current streak length.",
      },
      {
        database: "Goals",
        property: "Days Remaining",
        formula:
          'if(empty(prop("Deadline")), 0, dateBetween(prop("Deadline"), now(), "days"))',
        purpose: "How many days until the goal deadline.",
      },
    ],
    sampleData:
      'Tasks: "Review quarterly report" (Work/High/Due in 2 days), "Grocery shopping" (Personal/Medium/Due tomorrow), "30-min workout" (Health/High/Due today), "Read 20 pages" (Learning/Low/Due in 5 days), "Call dentist" (Health/Medium/Due this week). Habits: "Morning meditation" (Daily/Mindset/14-day streak), "Exercise" (Weekdays/Health/7-day streak), "Read 20 pages" (Daily/Productivity/21-day streak), "Drink 2L water" (Daily/Health/30-day streak), "Journal before bed" (Daily/Self-care/5-day streak). Goals: "Save $10,000 emergency fund" (Finance/This Year/$3,200 of $10,000), "Run a half marathon" (Health/This Quarter/8km of 21km), "Read 24 books" (Personal Growth/This Year/6 of 24). Journal: 5 recent daily entries with varying moods. Projects: "Kitchen renovation" (In Progress/High), "Online course launch" (Planning/Medium).',
    dashboardLayout: [
      'HEADER: Callout block with wave emoji - "Welcome to your Life Planner! Use this as your daily command center."',
      "ROW 1 - KPI CARDS: Create 4 callout blocks in a 4-column layout: (1) Tasks Due This Week [number], (2) Current Habit Streak [fire emoji + longest active streak], (3) Goal Progress [percentage], (4) Journal Streak [number of entries this month]",
      'ROW 2 - TODAY\'S FOCUS: Heading "Today\'s Focus" followed by a linked view of Tasks database filtered to Due Date = Today, Table view showing Task, Priority, Status, Time Estimate',
      'ROW 3 - TWO COLUMNS: Left column: "Active Goals" linked view (Gallery, filtered to Status = Active). Right column: "Habit Streaks" linked view (Table, showing Habit, Current Streak, Streak Status)',
      'ROW 4 - QUICK JOURNAL: Linked view of Journal database (Table, sorted by Date descending, limit 7 entries)',
      'ROW 5 - PROJECTS: "Active Projects" linked view (Board, grouped by Status, filtered to not Completed)',
    ],
    navigationSetup: [
      'Create a top-level toggle heading "Quick Navigation" with internal links to each database section',
      "Add a divider between the navigation and dashboard content",
      "Create sub-pages for each database so users can access full views: /Tasks, /Habits, /Goals, /Journal, /Projects",
    ],
  },

  /* ============================================================== */
  /*  2. STUDENT PLANNER                                             */
  /* ============================================================== */
  student_planner: {
    title: "Student Success Planner",
    icon: "\u{1F393}",
    coverUrl:
      "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=1500&q=80",
    tagline:
      "Manage your classes, assignments, exams, study sessions, and notes in one place.",
    databases: [
      {
        name: "Classes",
        icon: "\u{1F4DA}",
        properties: [
          { name: "Class", type: "Title", description: "Course name (e.g. CS 101 - Intro to Programming)" },
          { name: "Professor", type: "Rich Text", description: "Professor name" },
          { name: "Schedule", type: "Rich Text", description: "Meeting days and times (e.g. MWF 10:00-10:50)" },
          { name: "Room", type: "Rich Text", description: "Classroom location" },
          { name: "Credits", type: "Number", description: "Credit hours" },
          { name: "Current Grade", type: "Select", description: "Options: A, A-, B+, B, B-, C+, C, C-, D, F, N/A" },
          { name: "Color", type: "Select", description: "Options: Red, Blue, Green, Purple, Orange, Teal (for color coding)" },
          { name: "Semester", type: "Select", description: "Options: Fall 2025, Spring 2026, Summer 2026" },
        ],
        views: [
          "Current Semester (Table) - filtered to current semester, sorted by Class name",
          "By Day (Board) - grouped by schedule day",
          "All Classes (Table) - all semesters",
        ],
      },
      {
        name: "Assignments",
        icon: "\u{1F4DD}",
        properties: [
          { name: "Assignment", type: "Title", description: "Assignment name" },
          { name: "Class", type: "Relation", description: 'Linked to "Classes" database' },
          { name: "Type", type: "Select", description: "Options: Homework, Essay, Lab, Project, Presentation, Quiz" },
          { name: "Due Date", type: "Date", description: "Submission deadline" },
          { name: "Status", type: "Select", description: "Options: Not Started, In Progress, Done, Submitted, Late" },
          { name: "Weight", type: "Number", description: "Percentage weight of final grade (e.g. 10 for 10%)" },
          { name: "Grade", type: "Number", description: "Score received (0-100)" },
          { name: "Priority", type: "Select", description: "Options: High, Medium, Low" },
          { name: "Notes", type: "Rich Text", description: "Instructions or notes about the assignment" },
        ],
        views: [
          "Upcoming (Table) - filtered to Status != Done and Status != Submitted, sorted by Due Date ascending",
          "By Class (Board) - grouped by Class relation",
          "Completed (Table) - filtered to Status = Done or Submitted, sorted by Due Date descending",
          "Calendar (Calendar) - by Due Date",
          "This Week (Table) - filtered to Due Date within this week",
        ],
      },
      {
        name: "Exams",
        icon: "\u{1F4CB}",
        properties: [
          { name: "Exam", type: "Title", description: "Exam name (e.g. Midterm 1 - CS 101)" },
          { name: "Class", type: "Relation", description: 'Linked to "Classes" database' },
          { name: "Date", type: "Date", description: "Exam date and time" },
          { name: "Location", type: "Rich Text", description: "Exam room" },
          { name: "Topics", type: "Rich Text", description: "Topics covered (chapters, lecture numbers)" },
          { name: "Weight", type: "Number", description: "Percentage weight of final grade" },
          { name: "Grade", type: "Number", description: "Score received (0-100)" },
          { name: "Study Status", type: "Select", description: "Options: Not Started, Reviewing, Ready, Completed" },
        ],
        views: [
          "Upcoming Exams (Table) - filtered to Date >= today, sorted by Date ascending",
          "By Class (Board) - grouped by Class relation",
          "All Exams (Table) - sorted by Date descending",
        ],
      },
      {
        name: "Study Sessions",
        icon: "\u23F0",
        properties: [
          { name: "Session", type: "Title", description: "Study session topic" },
          { name: "Class", type: "Relation", description: 'Linked to "Classes" database' },
          { name: "Date", type: "Date", description: "Study date" },
          { name: "Duration", type: "Number", description: "Minutes studied" },
          { name: "Method", type: "Select", description: "Options: Active Recall, Flashcards, Practice Problems, Reading, Group Study, Video Lectures" },
          { name: "Productivity", type: "Select", description: 'Options: Very Productive, Productive, Okay, Unproductive' },
          { name: "Notes", type: "Rich Text", description: "Key takeaways from the session" },
        ],
        views: [
          "Recent Sessions (Table) - sorted by Date descending, limit 20",
          "By Class (Board) - grouped by Class relation",
          "Calendar (Calendar) - by Date",
          "This Week (Table) - filtered to Date within this week",
        ],
      },
      {
        name: "Notes",
        icon: "\u{1F5D2}\uFE0F",
        properties: [
          { name: "Note", type: "Title", description: "Note title (e.g. Lecture 5 - Data Structures)" },
          { name: "Class", type: "Relation", description: 'Linked to "Classes" database' },
          { name: "Date", type: "Date", description: "Lecture or note date" },
          { name: "Type", type: "Select", description: "Options: Lecture Notes, Textbook Notes, Summary, Cheat Sheet, Formula Sheet" },
          { name: "Tags", type: "Multi-select", description: "Topic tags for searching" },
        ],
        views: [
          "Recent Notes (Table) - sorted by Date descending",
          "By Class (Board) - grouped by Class relation",
          "By Type (Board) - grouped by Type",
        ],
      },
    ],
    formulas: [
      {
        database: "Assignments",
        property: "Days Until Due",
        formula: 'if(empty(prop("Due Date")), 0, dateBetween(prop("Due Date"), now(), "days"))',
        purpose: "Days remaining until the assignment is due. Negative means overdue.",
      },
      {
        database: "Assignments",
        property: "Weighted Score",
        formula: 'if(empty(prop("Grade")), 0, round(prop("Grade") * prop("Weight") / 100 * 100) / 100)',
        purpose: "Calculates the weighted contribution of this assignment to the final grade.",
      },
      {
        database: "Study Sessions",
        property: "Hours Studied",
        formula: 'round(prop("Duration") / 60 * 100) / 100',
        purpose: "Converts minutes to hours for easier tracking.",
      },
      {
        database: "Exams",
        property: "Days Until Exam",
        formula: 'if(empty(prop("Date")), 0, dateBetween(prop("Date"), now(), "days"))',
        purpose: "Countdown to exam day.",
      },
    ],
    sampleData:
      'Classes: "CS 101 - Intro to Programming" (Prof. Smith, MWF 10:00, 3 credits, A-), "MATH 201 - Calculus II" (Prof. Johnson, TTh 13:00, 4 credits, B+), "ENG 102 - Academic Writing" (Prof. Davis, MWF 14:00, 3 credits, A), "PHYS 101 - Physics I" (Prof. Lee, TTh 10:00, 4 credits, B), "HIST 110 - World History" (Prof. Chen, MW 16:00, 3 credits, N/A). Assignments: 5 varied assignments across different classes with mixed statuses. Exams: 3 upcoming exams. Study Sessions: 5 recent sessions. Notes: 5 lecture notes.',
    dashboardLayout: [
      'HEADER: Callout block with graduation cap emoji - "Welcome to your Student Planner! Stay on top of your academic game."',
      'ROW 1 - KPI CARDS: 4 callout blocks: (1) Assignments Due This Week [count], (2) Next Exam [name + days], (3) Study Hours This Week [total], (4) Current GPA [calculated]',
      'ROW 2 - URGENT: Heading "Upcoming Deadlines" with linked view of Assignments filtered to next 7 days, sorted by Due Date, Table view',
      'ROW 3 - TWO COLUMNS: Left: "This Week\'s Exams" linked view. Right: "Study Plan" linked view of Study Sessions this week',
      'ROW 4 - CLASS OVERVIEW: "My Classes" linked view as Gallery, showing current semester only',
      'ROW 5 - QUICK NOTES: "Recent Notes" linked view (Table, 5 most recent)',
    ],
    navigationSetup: [
      'Toggle heading "Quick Links" with links to each database page',
      "Sub-pages: /Classes, /Assignments, /Exams, /Study Log, /Notes",
      "Add a weekly schedule template page with time blocks for each day",
    ],
  },

  /* ============================================================== */
  /*  3. FINANCE TRACKER                                             */
  /* ============================================================== */
  finance_tracker: {
    title: "Personal Finance Dashboard",
    icon: "\u{1F4B0}",
    coverUrl:
      "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1500&q=80",
    tagline:
      "Track your wallets, transactions, budgets, financial goals, and net worth in one dashboard.",
    databases: [
      {
        name: "Wallets",
        icon: "\u{1F4B3}",
        properties: [
          { name: "Wallet", type: "Title", description: "Account name (e.g. Chase Checking, Savings, Cash)" },
          { name: "Type", type: "Select", description: "Options: Checking, Savings, Credit Card, Cash, Investment" },
          { name: "Starting Balance", type: "Number", description: "Initial balance when you started tracking (format as currency)" },
          { name: "Currency", type: "Select", description: "Options: USD, EUR, GBP" },
          { name: "Active", type: "Checkbox", description: "Whether this account is still in use" },
        ],
        views: [
          "Active Wallets (Table) - filtered to Active = checked",
          "All Wallets (Table) - sorted by Type",
        ],
      },
      {
        name: "Transactions",
        icon: "\u{1F4B8}",
        properties: [
          { name: "Transaction", type: "Title", description: "Description (e.g. Starbucks Coffee, Monthly Rent)" },
          { name: "Amount", type: "Number", description: "Transaction amount (positive = income, negative = expense). Format as currency." },
          { name: "Date", type: "Date", description: "Transaction date" },
          { name: "Category", type: "Select", description: "Options: Housing, Food & Dining, Transportation, Utilities, Entertainment, Health, Shopping, Income, Savings, Investments, Other" },
          { name: "Wallet", type: "Relation", description: 'Linked to "Wallets" database' },
          { name: "Type", type: "Select", description: "Options: Income, Expense, Transfer" },
          { name: "Recurring", type: "Checkbox", description: "Is this a recurring transaction" },
          { name: "Notes", type: "Rich Text", description: "Additional details" },
        ],
        views: [
          "Recent Transactions (Table) - sorted by Date descending, limit 50",
          "This Month (Table) - filtered to current month, sorted by Date descending",
          "By Category (Board) - grouped by Category",
          "Income Only (Table) - filtered to Type = Income",
          "Calendar (Calendar) - by Date",
        ],
      },
      {
        name: "Budgets",
        icon: "\u{1F4CA}",
        properties: [
          { name: "Budget", type: "Title", description: "Budget category name (should match transaction categories)" },
          { name: "Monthly Limit", type: "Number", description: "Maximum monthly spend (currency format)" },
          { name: "Category", type: "Select", description: "Same options as Transactions Category" },
          { name: "Priority", type: "Select", description: "Options: Essential, Important, Nice to Have" },
          { name: "Notes", type: "Rich Text", description: "Budget notes or rules" },
        ],
        views: [
          "All Budgets (Table) - sorted by Priority then Category",
          "By Priority (Board) - grouped by Priority",
        ],
      },
      {
        name: "Financial Goals",
        icon: "\u{1F3AF}",
        properties: [
          { name: "Goal", type: "Title", description: "Goal name (e.g. Emergency Fund, Vacation)" },
          { name: "Target Amount", type: "Number", description: "Total amount needed (currency)" },
          { name: "Current Amount", type: "Number", description: "Amount saved so far (currency)" },
          { name: "Deadline", type: "Date", description: "Target date to reach goal" },
          { name: "Priority", type: "Select", description: "Options: High, Medium, Low" },
          { name: "Status", type: "Select", description: "Options: Active, Reached, Paused" },
          { name: "Monthly Contribution", type: "Number", description: "How much you plan to save per month" },
        ],
        views: [
          "Active Goals (Table) - filtered to Status = Active, sorted by Deadline",
          "All Goals (Gallery) - card shows progress info",
        ],
      },
      {
        name: "Net Worth",
        icon: "\u{1F4C8}",
        properties: [
          { name: "Entry", type: "Title", description: 'Monthly snapshot title (e.g. "January 2025")' },
          { name: "Date", type: "Date", description: "Snapshot date (first of month)" },
          { name: "Total Assets", type: "Number", description: "Sum of all asset values" },
          { name: "Total Liabilities", type: "Number", description: "Sum of all debts" },
          { name: "Notes", type: "Rich Text", description: "Monthly financial notes" },
        ],
        views: [
          "Timeline (Table) - sorted by Date descending",
          "Chart Data (Table) - sorted by Date ascending for graphing",
        ],
      },
    ],
    formulas: [
      {
        database: "Financial Goals",
        property: "Progress %",
        formula: 'if(prop("Target Amount") == 0, 0, round(prop("Current Amount") / prop("Target Amount") * 100))',
        purpose: "Shows percentage progress toward the savings goal.",
      },
      {
        database: "Financial Goals",
        property: "Remaining",
        formula: 'prop("Target Amount") - prop("Current Amount")',
        purpose: "How much more needs to be saved.",
      },
      {
        database: "Financial Goals",
        property: "Months to Goal",
        formula: 'if(prop("Monthly Contribution") == 0, 0, ceil((prop("Target Amount") - prop("Current Amount")) / prop("Monthly Contribution")))',
        purpose: "Estimates how many months until the goal is reached at current contribution rate.",
      },
      {
        database: "Net Worth",
        property: "Net Worth",
        formula: 'prop("Total Assets") - prop("Total Liabilities")',
        purpose: "Calculates net worth as assets minus liabilities.",
      },
    ],
    sampleData:
      'Wallets: "Chase Checking" ($5,200 starting), "Ally Savings" ($12,000), "Visa Credit Card" (-$1,200), "Cash" ($150), "Vanguard 401k" ($45,000). Transactions: 10 recent across categories - rent $1,800, groceries $120, gas $45, salary $4,500, Netflix $15.99, coffee $6.50, gym $35, electricity $89, freelance income $800, restaurant $42. Budgets: Housing $1,800, Food $500, Transport $200, Utilities $200, Entertainment $150, Health $100, Savings $500. Goals: "Emergency Fund" ($12,000 of $15,000), "Japan Vacation" ($1,500 of $5,000), "New Laptop" ($400 of $1,200). Net Worth: 3 monthly snapshots.',
    dashboardLayout: [
      'HEADER: Callout with money bag emoji - "Your Personal Finance Dashboard. Track every dollar."',
      'ROW 1 - KPI CARDS: 4 callouts: (1) Total Balance [sum of wallets], (2) Monthly Income [this month], (3) Monthly Expenses [this month], (4) Savings Rate [percentage]',
      'ROW 2 - TRANSACTIONS: "Recent Transactions" linked view (Table, 10 most recent)',
      'ROW 3 - TWO COLUMNS: Left: "Budget Overview" linked view (Table, all budgets). Right: "Savings Goals" linked view (Gallery, active goals showing progress)',
      'ROW 4 - NET WORTH: "Net Worth History" linked view (Table, last 6 months)',
      'ROW 5 - QUICK ADD: Callout with instructions on how to quickly add a transaction',
    ],
    navigationSetup: [
      "Sub-pages: /Transactions, /Budgets, /Goals, /Net Worth, /Wallets",
      "Toggle heading for quick links to each section",
      "Monthly review template sub-page",
    ],
  },

  /* ============================================================== */
  /*  4. ADHD PLANNER                                                */
  /* ============================================================== */
  adhd_planner: {
    title: "ADHD-Friendly Life Planner",
    icon: "\u{1F9E0}",
    coverUrl:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1500&q=80",
    tagline:
      "Designed for ADHD brains: low-friction task capture, visual prioritization, and dopamine-friendly wins tracking.",
    databases: [
      {
        name: "Brain Dump",
        icon: "\u{1F4A1}",
        properties: [
          { name: "Thought", type: "Title", description: "Quick capture - any thought, task, or idea" },
          { name: "Type", type: "Select", description: "Options: Task, Idea, Reminder, Random, Important" },
          { name: "Processed", type: "Checkbox", description: "Have you reviewed and sorted this item?" },
          { name: "Captured At", type: "Date", description: "When you wrote this down (auto-fill with Created time)" },
          { name: "Action Needed", type: "Checkbox", description: "Does this require action?" },
          { name: "Moved To", type: "Rich Text", description: "Where this item was moved (Tasks, Calendar, etc.)" },
        ],
        views: [
          "Inbox (Table) - filtered to Processed = unchecked, sorted by Captured At descending",
          "All Items (Table) - sorted by Captured At descending",
          "Needs Action (Table) - filtered to Action Needed = checked AND Processed = unchecked",
        ],
      },
      {
        name: "Tasks",
        icon: "\u2705",
        properties: [
          { name: "Task", type: "Title", description: "Task name - keep it SHORT and specific" },
          { name: "Energy Level", type: "Select", description: "Options: High Energy \u26A1, Medium Energy \u{1F7E1}, Low Energy \u{1F7E2} (what energy level this task needs)" },
          { name: "Time Needed", type: "Select", description: "Options: 5 min, 15 min, 30 min, 1 hour, 2+ hours" },
          { name: "Status", type: "Select", description: "Options: To Do, Doing Now, Waiting, Done, Won't Do" },
          { name: "Due Date", type: "Date", description: "Deadline (only if there IS a real deadline)" },
          { name: "Category", type: "Select", description: "Options: Home, Work, Health, Admin, Fun, Self-care" },
          { name: "Body Double", type: "Checkbox", description: "Easier to do with someone else?" },
          { name: "Dopamine Rating", type: "Select", description: 'Options: \u{1F60D} Fun, \u{1F610} Meh, \u{1F629} Awful (how much you dread it)' },
          { name: "Completed Date", type: "Date", description: "When you finished it" },
        ],
        views: [
          "Today's Focus (Table) - filtered to Status = To Do, sorted by Energy Level, LIMIT TO 5 ITEMS",
          "Quick Wins (Table) - filtered to Time Needed = 5 min or 15 min, Status = To Do",
          "Kanban (Board) - grouped by Status",
          "By Energy (Board) - grouped by Energy Level",
          "Done! (Table) - filtered to Status = Done, sorted by Completed Date descending (celebration view!)",
        ],
      },
      {
        name: "Routines",
        icon: "\u{1F504}",
        properties: [
          { name: "Routine", type: "Title", description: "Routine name (e.g. Morning Routine, Bedtime Routine)" },
          { name: "Time of Day", type: "Select", description: "Options: Morning, Midday, Afternoon, Evening, Bedtime" },
          { name: "Steps", type: "Rich Text", description: "Numbered checklist of routine steps (keep under 7 steps)" },
          { name: "Duration", type: "Number", description: "Total minutes for routine" },
          { name: "Completions This Week", type: "Number", description: "How many times completed this week" },
          { name: "Target Per Week", type: "Number", description: "How many times you aim to do it per week" },
          { name: "Active", type: "Checkbox", description: "Currently tracking this routine" },
        ],
        views: [
          "Active Routines (Table) - filtered to Active = checked, sorted by Time of Day",
          "Gallery (Gallery) - shows routine name and steps",
        ],
      },
      {
        name: "Wins",
        icon: "\u{1F3C6}",
        properties: [
          { name: "Win", type: "Title", description: "What you accomplished (big or small!)" },
          { name: "Date", type: "Date", description: "When it happened" },
          { name: "Size", type: "Select", description: 'Options: Small Win \u2B50, Medium Win \u{1F31F}, Big Win \u{1F4AB}, HUGE Win \u{1F680}' },
          { name: "Category", type: "Select", description: "Options: Productivity, Health, Social, Creative, Adulting, Self-care" },
          { name: "How I Feel", type: "Rich Text", description: "Capture the good feeling!" },
        ],
        views: [
          "Recent Wins (Table) - sorted by Date descending",
          "By Size (Board) - grouped by Size",
          "Gallery (Gallery) - celebration view with all wins",
        ],
      },
      {
        name: "Energy Log",
        icon: "\u26A1",
        properties: [
          { name: "Entry", type: "Title", description: 'Format: "YYYY-MM-DD Energy"' },
          { name: "Date", type: "Date", description: "Log date" },
          { name: "Morning Energy", type: "Select", description: "Options: High, Medium, Low, Crash" },
          { name: "Afternoon Energy", type: "Select", description: "Options: High, Medium, Low, Crash" },
          { name: "Evening Energy", type: "Select", description: "Options: High, Medium, Low, Crash" },
          { name: "Meds Taken", type: "Checkbox", description: "Did you take medication today" },
          { name: "Sleep Hours", type: "Number", description: "Hours slept last night" },
          { name: "Notes", type: "Rich Text", description: "What affected energy today" },
        ],
        views: [
          "Recent (Table) - sorted by Date descending, limit 14",
          "Calendar (Calendar) - by Date",
        ],
      },
    ],
    formulas: [
      {
        database: "Tasks",
        property: "Urgency Score",
        formula: 'if(empty(prop("Due Date")), 0, if(dateBetween(prop("Due Date"), now(), "days") <= 0, 10, if(dateBetween(prop("Due Date"), now(), "days") <= 1, 8, if(dateBetween(prop("Due Date"), now(), "days") <= 3, 5, if(dateBetween(prop("Due Date"), now(), "days") <= 7, 3, 1)))))',
        purpose: "Scores urgency from 1-10 based on how close the due date is. Higher = more urgent.",
      },
      {
        database: "Routines",
        property: "Completion Rate",
        formula: 'if(prop("Target Per Week") == 0, 0, round(prop("Completions This Week") / prop("Target Per Week") * 100))',
        purpose: "Shows what percentage of the weekly target has been completed.",
      },
      {
        database: "Routines",
        property: "Status Emoji",
        formula: 'if(prop("Completions This Week") >= prop("Target Per Week"), "\u2705 Nailed it!", if(prop("Completions This Week") >= prop("Target Per Week") / 2, "\u{1F4AA} Halfway!", "\u{1F331} Keep going!"))',
        purpose: "Visual motivational indicator of routine progress.",
      },
    ],
    sampleData:
      'Brain Dump: "Buy cat food", "Cool app idea - habit timer", "Dentist appointment??", "Research standing desks", "Reply to Sarah\'s email". Tasks: "Do laundry" (Low Energy/30 min/Home), "Write project proposal" (High Energy/2+ hours/Work), "Call pharmacy" (Medium/5 min/Admin), "15-min kitchen cleanup" (Low/15 min/Home), "Workout" (High/1 hour/Health). Routines: "Morning Routine" (Morning/25 min/5 steps: Wake up+stretch, Meds, Breakfast, Get dressed, Check calendar), "Wind Down" (Bedtime/20 min/4 steps). Wins: "Cleaned the whole apartment!", "Finished project early", "Cooked dinner 3 days in a row", "Called the dentist finally". Energy Log: 5 recent days.',
    dashboardLayout: [
      'HEADER: Callout with brain emoji - "Your ADHD-Friendly Planner \u{1F9E0} You don\'t need to do everything. Just pick ONE thing to start."',
      'ROW 1 - TODAY\'S FOCUS: BIG heading "Pick Your Top 3 for Today" followed by linked view of Tasks (Table, filtered to Status = To Do, sorted by Urgency Score descending, LIMIT 3 rows)',
      "ROW 2 - QUICK WINS: Callout with star - \"Need a dopamine hit? Try a Quick Win:\" followed by linked view of Tasks (filtered to Time Needed = 5 min or 15 min, Status = To Do)",
      'ROW 3 - TWO COLUMNS: Left: "Brain Dump Inbox" linked view (unprocessed items). Right: "Today\'s Routines" linked view',
      'ROW 4 - WINS WALL: Heading "Your Wins! \u{1F389}" followed by Gallery view of recent Wins (celebration focused!)',
      'ROW 5 - ENERGY: "Energy Check" linked view of Energy Log (last 7 days)',
    ],
    navigationSetup: [
      "Keep navigation SIMPLE - ADHD brains get overwhelmed by too many options",
      "3 main buttons/links: Brain Dump, Tasks, Wins",
      "Sub-pages: /Brain Dump, /Tasks, /Routines, /Wins, /Energy Log",
      "Add a 'What should I do right now?' decision tree callout",
    ],
  },

  /* ============================================================== */
  /*  5. SOCIAL MEDIA PLANNER                                        */
  /* ============================================================== */
  social_media: {
    title: "Social Media Content Planner",
    icon: "\u{1F4F1}",
    coverUrl:
      "https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=1500&q=80",
    tagline:
      "Plan, schedule, and analyze your social media content across all platforms.",
    databases: [
      {
        name: "Content Calendar",
        icon: "\u{1F4C5}",
        properties: [
          { name: "Post", type: "Title", description: "Post title or hook" },
          { name: "Platform", type: "Multi-select", description: "Options: Instagram, TikTok, Twitter/X, LinkedIn, Pinterest, YouTube, Facebook" },
          { name: "Type", type: "Select", description: "Options: Carousel, Reel, Story, Static Post, Thread, Video, Pin, Blog" },
          { name: "Status", type: "Select", description: "Options: Idea, Drafting, Ready to Post, Scheduled, Published, Repurpose" },
          { name: "Publish Date", type: "Date", description: "Scheduled or actual publish date" },
          { name: "Caption", type: "Rich Text", description: "Full caption text" },
          { name: "Hashtags", type: "Relation", description: 'Linked to "Hashtag Sets" database' },
          { name: "Content Pillar", type: "Select", description: "Options: Educational, Entertaining, Inspiring, Promotional, Behind the Scenes, Community" },
          { name: "Call to Action", type: "Rich Text", description: "What action you want from the audience" },
          { name: "Visual Notes", type: "Rich Text", description: "Description of visuals needed" },
        ],
        views: [
          "Calendar (Calendar) - by Publish Date, colored by Platform",
          "Pipeline (Board) - grouped by Status",
          "This Week (Table) - filtered to Publish Date within this week",
          "By Platform (Board) - grouped by Platform",
          "By Pillar (Board) - grouped by Content Pillar",
          "Ideas Bank (Table) - filtered to Status = Idea",
        ],
      },
      {
        name: "Platforms",
        icon: "\u{1F310}",
        properties: [
          { name: "Platform", type: "Title", description: "Platform name" },
          { name: "Handle", type: "Rich Text", description: "Your username/handle" },
          { name: "Followers", type: "Number", description: "Current follower count" },
          { name: "Best Posting Time", type: "Rich Text", description: "Optimal posting times for your audience" },
          { name: "Posting Frequency", type: "Rich Text", description: "Target posts per week" },
          { name: "Notes", type: "Rich Text", description: "Platform-specific strategy notes" },
        ],
        views: [
          "All Platforms (Table) - sorted by Followers descending",
          "Gallery (Gallery) - overview cards",
        ],
      },
      {
        name: "Analytics",
        icon: "\u{1F4CA}",
        properties: [
          { name: "Report", type: "Title", description: 'Weekly report title (e.g. "Week of Jan 6")' },
          { name: "Week", type: "Date", description: "Start date of the reporting week" },
          { name: "Platform", type: "Select", description: "Options: Instagram, TikTok, Twitter/X, LinkedIn, Pinterest, YouTube, All" },
          { name: "Posts Published", type: "Number", description: "Number of posts this week" },
          { name: "Total Reach", type: "Number", description: "Total reach/impressions" },
          { name: "Total Engagement", type: "Number", description: "Likes + comments + shares + saves" },
          { name: "New Followers", type: "Number", description: "Net follower change" },
          { name: "Top Post", type: "Relation", description: 'Linked to "Content Calendar" database' },
          { name: "Notes", type: "Rich Text", description: "Key learnings this week" },
        ],
        views: [
          "Recent (Table) - sorted by Week descending",
          "By Platform (Board) - grouped by Platform",
        ],
      },
      {
        name: "Ideas",
        icon: "\u{1F4A1}",
        properties: [
          { name: "Idea", type: "Title", description: "Content idea" },
          { name: "Platform", type: "Multi-select", description: "Which platforms this could work on" },
          { name: "Content Pillar", type: "Select", description: "Options: Educational, Entertaining, Inspiring, Promotional, Behind the Scenes, Community" },
          { name: "Priority", type: "Select", description: "Options: Hot, Warm, Cold" },
          { name: "Source", type: "Rich Text", description: "Where the idea came from (trending audio, competitor, audience question, etc.)" },
          { name: "Notes", type: "Rich Text", description: "Rough notes or outline" },
        ],
        views: [
          "All Ideas (Table) - sorted by Priority",
          "By Pillar (Board) - grouped by Content Pillar",
          "Hot Ideas (Table) - filtered to Priority = Hot",
        ],
      },
      {
        name: "Hashtag Sets",
        icon: "#\uFE0F\u20E3",
        properties: [
          { name: "Set Name", type: "Title", description: 'Descriptive name (e.g. "Productivity Niche", "Fitness Motivation")' },
          { name: "Hashtags", type: "Rich Text", description: "Full list of hashtags (copy-paste ready)" },
          { name: "Platform", type: "Select", description: "Options: Instagram, TikTok, Twitter/X, LinkedIn, General" },
          { name: "Size", type: "Select", description: "Options: Small (under 100k), Medium (100k-1M), Large (1M+), Mixed" },
          { name: "Last Updated", type: "Date", description: "When you last checked/updated these hashtags" },
        ],
        views: [
          "All Sets (Table) - sorted by Platform then Set Name",
          "By Platform (Board) - grouped by Platform",
        ],
      },
    ],
    formulas: [
      {
        database: "Analytics",
        property: "Engagement Rate",
        formula: 'if(prop("Total Reach") == 0, 0, round(prop("Total Engagement") / prop("Total Reach") * 10000) / 100)',
        purpose: "Calculates engagement rate as a percentage of reach.",
      },
      {
        database: "Analytics",
        property: "Posts Per Day",
        formula: 'round(prop("Posts Published") / 7 * 100) / 100',
        purpose: "Average posts per day for the week.",
      },
    ],
    sampleData:
      'Content Calendar: 10 posts across platforms with varied statuses and types. Platforms: Instagram (5,200 followers), TikTok (1,800), Twitter/X (950), LinkedIn (2,100), Pinterest (800). Analytics: 4 weeks of data. Ideas: 8 content ideas across pillars. Hashtag Sets: 5 sets for different niches.',
    dashboardLayout: [
      'HEADER: Callout - "Social Media Command Center \u{1F4F1} Plan. Create. Publish. Analyze."',
      'ROW 1 - KPI CARDS: 4 callouts: (1) Posts This Week [count], (2) Total Followers [sum], (3) Avg Engagement Rate [%], (4) Content Ideas [count of hot ideas]',
      'ROW 2 - THIS WEEK: "This Week\'s Content" Calendar view of Content Calendar for this week',
      'ROW 3 - TWO COLUMNS: Left: "Content Pipeline" Board view (grouped by Status). Right: "Hot Ideas" Table view',
      'ROW 4 - ANALYTICS: "Weekly Performance" Table of recent Analytics entries',
      'ROW 5 - RESOURCES: "Hashtag Sets" Gallery view for quick copy-paste access',
    ],
    navigationSetup: [
      "Sub-pages: /Content Calendar, /Ideas Bank, /Analytics, /Hashtag Library, /Platform Strategy",
      "Quick-add button callout for new content ideas",
      "Weekly planning template sub-page",
    ],
  },

  /* ============================================================== */
  /*  6. HABIT TRACKER                                               */
  /* ============================================================== */
  habit_tracker: {
    title: "Habit Tracker & Builder",
    icon: "\u{1F525}",
    coverUrl:
      "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=1500&q=80",
    tagline:
      "Build lasting habits with streak tracking, daily logging, and milestone celebrations.",
    databases: [
      {
        name: "Habits",
        icon: "\u{1F3AF}",
        properties: [
          { name: "Habit", type: "Title", description: "Name of the habit" },
          { name: "Category", type: "Select", description: "Options: Health, Mindset, Productivity, Relationships, Creativity, Finance, Self-care" },
          { name: "Frequency", type: "Select", description: "Options: Daily, Weekdays, 3x Week, Weekly" },
          { name: "Time of Day", type: "Select", description: "Options: Morning, Afternoon, Evening, Anytime" },
          { name: "Current Streak", type: "Number", description: "Consecutive completions" },
          { name: "Longest Streak", type: "Number", description: "Best streak ever" },
          { name: "Total Completions", type: "Number", description: "All-time completions" },
          { name: "Start Date", type: "Date", description: "When you started this habit" },
          { name: "Cue", type: "Rich Text", description: 'Habit cue/trigger (e.g. "After my morning coffee")' },
          { name: "Reward", type: "Rich Text", description: 'Reward for completing (e.g. "5 min of social media")' },
          { name: "Active", type: "Checkbox", description: "Currently tracking" },
        ],
        views: [
          "Active Habits (Table) - filtered to Active = checked, sorted by Time of Day",
          "By Category (Board) - grouped by Category",
          "Streak Leaderboard (Table) - sorted by Current Streak descending",
          "Gallery (Gallery) - shows habit name, streak, and category",
        ],
      },
      {
        name: "Daily Logs",
        icon: "\u{1F4C6}",
        properties: [
          { name: "Log", type: "Title", description: 'Date entry (e.g. "Monday Jan 6, 2025")' },
          { name: "Date", type: "Date", description: "Log date" },
          { name: "Habits Completed", type: "Relation", description: 'Linked to "Habits" database (multi-select which habits done today)' },
          { name: "Mood", type: "Select", description: 'Options: Great \u{1F60A}, Good \u{1F642}, Okay \u{1F610}, Low \u{1F614}, Bad \u{1F61E}' },
          { name: "Energy", type: "Select", description: "Options: High, Medium, Low" },
          { name: "Notes", type: "Rich Text", description: "Daily reflection" },
          { name: "Overall Score", type: "Number", description: "Self-rated day score 1-10" },
        ],
        views: [
          "Recent Logs (Table) - sorted by Date descending, limit 14",
          "Calendar (Calendar) - by Date",
          "By Mood (Board) - grouped by Mood",
          "This Week (Table) - filtered to current week",
        ],
      },
      {
        name: "Milestones",
        icon: "\u{1F3C6}",
        properties: [
          { name: "Milestone", type: "Title", description: 'Achievement name (e.g. "7-Day Streak!", "100 Workouts")' },
          { name: "Habit", type: "Relation", description: 'Linked to "Habits" database' },
          { name: "Date Reached", type: "Date", description: "When the milestone was achieved" },
          { name: "Type", type: "Select", description: "Options: Streak (7 day), Streak (30 day), Streak (100 day), Total (50), Total (100), Total (365), Custom" },
          { name: "Celebration", type: "Rich Text", description: "How you celebrated or rewarded yourself" },
        ],
        views: [
          "All Milestones (Table) - sorted by Date Reached descending",
          "By Habit (Board) - grouped by Habit relation",
          "Gallery (Gallery) - celebration wall",
        ],
      },
    ],
    formulas: [
      {
        database: "Habits",
        property: "Streak Status",
        formula: 'if(prop("Current Streak") >= 100, "\u{1F48E} Legendary!", if(prop("Current Streak") >= 30, "\u{1F525} On Fire!", if(prop("Current Streak") >= 7, "\u{1F4AA} Strong!", if(prop("Current Streak") >= 1, "\u{1F331} Growing", "\u26A0\uFE0F Start Today"))))',
        purpose: "Motivational emoji label based on streak length.",
      },
      {
        database: "Habits",
        property: "Days Since Start",
        formula: 'if(empty(prop("Start Date")), 0, dateBetween(now(), prop("Start Date"), "days"))',
        purpose: "Total days since you started tracking this habit.",
      },
      {
        database: "Habits",
        property: "Completion Rate",
        formula: 'if(empty(prop("Start Date")), 0, if(dateBetween(now(), prop("Start Date"), "days") == 0, 0, round(prop("Total Completions") / dateBetween(now(), prop("Start Date"), "days") * 100)))',
        purpose: "Overall completion rate as a percentage of days since starting.",
      },
    ],
    sampleData:
      'Habits: "Morning Meditation" (Mindset/Daily/Morning/21-day streak), "Exercise 30 min" (Health/Weekdays/Morning/14-day streak), "Read 20 pages" (Productivity/Daily/Evening/45-day streak), "Drink 2L Water" (Health/Daily/Anytime/30-day streak), "Journal" (Mindset/Daily/Evening/7-day streak), "No Social Media Before 10am" (Productivity/Weekdays/Morning/5-day streak). Daily Logs: 7 recent days. Milestones: "30-day Reading Streak!", "100 Total Workouts", "7-day Meditation Streak".',
    dashboardLayout: [
      'HEADER: Callout with fire emoji - "Habit Tracker \u{1F525} Small daily actions create massive results."',
      "ROW 1 - KPI CARDS: 4 callouts: (1) Active Habits [count], (2) Longest Active Streak [max streak], (3) Today's Completion [X of Y], (4) Total Milestones [count]",
      'ROW 2 - TODAY: "Today\'s Habits" linked view (Table, active habits with checkboxes)',
      'ROW 3 - TWO COLUMNS: Left: "Streak Leaderboard" (Table, sorted by Current Streak descending). Right: "This Week\'s Log" (Table, last 7 daily logs)',
      'ROW 4 - MILESTONES: "Achievement Wall \u{1F3C6}" Gallery view of Milestones',
      'ROW 5 - STATS: "Habit Stats" linked view showing completion rates',
    ],
    navigationSetup: [
      "Sub-pages: /Habits, /Daily Log, /Milestones",
      "Quick-check callout for today's habits",
      "Monthly review template sub-page",
    ],
  },

  /* ============================================================== */
  /*  7. BUSINESS HUB                                                */
  /* ============================================================== */
  business_hub: {
    title: "Business Command Center",
    icon: "\u{1F4BC}",
    coverUrl:
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1500&q=80",
    tagline:
      "Manage clients, projects, tasks, revenue, and invoices from one central hub.",
    databases: [
      {
        name: "Clients",
        icon: "\u{1F465}",
        properties: [
          { name: "Client", type: "Title", description: "Client or company name" },
          { name: "Contact Person", type: "Rich Text", description: "Primary contact name" },
          { name: "Email", type: "Email", description: "Contact email" },
          { name: "Phone", type: "Phone", description: "Contact phone" },
          { name: "Status", type: "Select", description: "Options: Lead, Active, Paused, Completed, Lost" },
          { name: "Source", type: "Select", description: "Options: Referral, Social Media, Cold Outreach, Website, Repeat Client" },
          { name: "Industry", type: "Select", description: "Options: Tech, E-commerce, Healthcare, Finance, Education, Creative, Other" },
          { name: "Projects", type: "Relation", description: 'Linked to "Projects" database' },
          { name: "Notes", type: "Rich Text", description: "Client notes and preferences" },
          { name: "Start Date", type: "Date", description: "When the client relationship started" },
        ],
        views: [
          "Active Clients (Table) - filtered to Status = Active, sorted by Client name",
          "Pipeline (Board) - grouped by Status",
          "By Source (Board) - grouped by Source",
          "All Clients (Table) - sorted alphabetically",
        ],
      },
      {
        name: "Projects",
        icon: "\u{1F4C1}",
        properties: [
          { name: "Project", type: "Title", description: "Project name" },
          { name: "Client", type: "Relation", description: 'Linked to "Clients" database' },
          { name: "Status", type: "Select", description: "Options: Proposal, Active, In Review, Completed, Cancelled" },
          { name: "Type", type: "Select", description: "Options: Retainer, One-time, Hourly, Fixed Price" },
          { name: "Budget", type: "Number", description: "Project budget/value (currency)" },
          { name: "Amount Paid", type: "Number", description: "Total received so far (currency)" },
          { name: "Start Date", type: "Date", description: "Project start" },
          { name: "Deadline", type: "Date", description: "Project deadline" },
          { name: "Tasks", type: "Relation", description: 'Linked to "Tasks" database' },
          { name: "Priority", type: "Select", description: "Options: High, Medium, Low" },
          { name: "Deliverables", type: "Rich Text", description: "List of project deliverables" },
        ],
        views: [
          "Active Projects (Table) - filtered to Status = Active, sorted by Deadline",
          "Pipeline (Board) - grouped by Status",
          "By Client (Board) - grouped by Client relation",
          "Timeline (Timeline) - Start Date to Deadline",
          "Completed (Table) - filtered to Status = Completed",
        ],
      },
      {
        name: "Tasks",
        icon: "\u2705",
        properties: [
          { name: "Task", type: "Title", description: "Task description" },
          { name: "Project", type: "Relation", description: 'Linked to "Projects" database' },
          { name: "Status", type: "Select", description: "Options: To Do, In Progress, In Review, Done" },
          { name: "Priority", type: "Select", description: "Options: Urgent, High, Medium, Low" },
          { name: "Due Date", type: "Date", description: "Task deadline" },
          { name: "Assignee", type: "Rich Text", description: "Who is responsible" },
          { name: "Hours Spent", type: "Number", description: "Time tracked on this task" },
        ],
        views: [
          "My Tasks (Table) - sorted by Due Date ascending",
          "Kanban (Board) - grouped by Status",
          "By Project (Board) - grouped by Project relation",
          "Overdue (Table) - filtered to Due Date < today AND Status != Done",
        ],
      },
      {
        name: "Revenue",
        icon: "\u{1F4B0}",
        properties: [
          { name: "Entry", type: "Title", description: 'Description (e.g. "Jan 2025 - Project X")' },
          { name: "Date", type: "Date", description: "Revenue date" },
          { name: "Amount", type: "Number", description: "Revenue amount (currency)" },
          { name: "Client", type: "Relation", description: 'Linked to "Clients" database' },
          { name: "Project", type: "Relation", description: 'Linked to "Projects" database' },
          { name: "Type", type: "Select", description: "Options: Project Fee, Retainer, Hourly, Commission, Other" },
          { name: "Status", type: "Select", description: "Options: Invoiced, Paid, Pending, Overdue" },
        ],
        views: [
          "This Month (Table) - filtered to current month, sorted by Date",
          "All Revenue (Table) - sorted by Date descending",
          "By Client (Board) - grouped by Client relation",
          "By Status (Board) - grouped by Status",
        ],
      },
      {
        name: "Invoices",
        icon: "\u{1F4C4}",
        properties: [
          { name: "Invoice", type: "Title", description: 'Invoice number (e.g. "INV-2025-001")' },
          { name: "Client", type: "Relation", description: 'Linked to "Clients" database' },
          { name: "Project", type: "Relation", description: 'Linked to "Projects" database' },
          { name: "Amount", type: "Number", description: "Invoice total (currency)" },
          { name: "Issue Date", type: "Date", description: "When the invoice was sent" },
          { name: "Due Date", type: "Date", description: "Payment deadline" },
          { name: "Status", type: "Select", description: "Options: Draft, Sent, Paid, Overdue, Cancelled" },
          { name: "Payment Method", type: "Select", description: "Options: Bank Transfer, PayPal, Stripe, Cash, Check" },
          { name: "Notes", type: "Rich Text", description: "Invoice notes" },
        ],
        views: [
          "Outstanding (Table) - filtered to Status = Sent or Overdue, sorted by Due Date",
          "All Invoices (Table) - sorted by Issue Date descending",
          "By Status (Board) - grouped by Status",
          "By Client (Board) - grouped by Client relation",
        ],
      },
    ],
    formulas: [
      {
        database: "Projects",
        property: "Profitability",
        formula: 'if(prop("Budget") == 0, 0, round(prop("Amount Paid") / prop("Budget") * 100))',
        purpose: "Shows what percentage of the project budget has been collected.",
      },
      {
        database: "Projects",
        property: "Days Until Deadline",
        formula: 'if(empty(prop("Deadline")), 0, dateBetween(prop("Deadline"), now(), "days"))',
        purpose: "Countdown to project deadline.",
      },
      {
        database: "Invoices",
        property: "Days Overdue",
        formula: 'if(prop("Status") != "Paid", if(empty(prop("Due Date")), 0, if(dateBetween(now(), prop("Due Date"), "days") > 0, dateBetween(now(), prop("Due Date"), "days"), 0)), 0)',
        purpose: "Shows how many days an unpaid invoice is past due.",
      },
    ],
    sampleData:
      'Clients: "Acme Corp" (Active/Referral/Tech), "Bloom Studio" (Active/Social Media/Creative), "Peak Fitness" (Lead/Website/Healthcare), "DataFlow Inc" (Completed/Cold Outreach/Tech), "Luna Boutique" (Active/Repeat/E-commerce). Projects: "Acme Website Redesign" ($12,000/Active), "Bloom Brand Identity" ($5,000/Active), "DataFlow Dashboard" ($8,000/Completed). Tasks: 8 varied tasks across projects. Revenue: 5 entries totaling ~$15,000. Invoices: "INV-2025-001" through "INV-2025-005" with mixed statuses.',
    dashboardLayout: [
      'HEADER: Callout - "Business Command Center \u{1F4BC} Your business at a glance."',
      'ROW 1 - KPI CARDS: 4 callouts: (1) Monthly Revenue [$X], (2) Active Clients [count], (3) Active Projects [count], (4) Outstanding Invoices [$X]',
      'ROW 2 - PROJECTS: "Active Projects" linked view (Board, grouped by Status)',
      'ROW 3 - TWO COLUMNS: Left: "Upcoming Deadlines" (Tasks sorted by Due Date, limit 10). Right: "Outstanding Invoices" (Table, filtered to unpaid)',
      'ROW 4 - CLIENTS: "Client Pipeline" (Board, grouped by Status)',
      'ROW 5 - REVENUE: "Revenue This Month" linked view (Table)',
    ],
    navigationSetup: [
      "Sub-pages: /Clients, /Projects, /Tasks, /Revenue, /Invoices",
      "Toggle heading with quick links",
      "Client onboarding template sub-page",
      "Invoice template sub-page",
    ],
  },

  /* ============================================================== */
  /*  8. DEBT CALCULATOR                                             */
  /* ============================================================== */
  debt_calculator: {
    title: "Debt Payoff Tracker",
    icon: "\u{1F4B3}",
    coverUrl:
      "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=1500&q=80",
    tagline:
      "Visualize your debt-free journey with payoff calculators, payment tracking, and milestone celebrations.",
    databases: [
      {
        name: "Debts",
        icon: "\u{1F4B3}",
        properties: [
          { name: "Debt", type: "Title", description: 'Debt name (e.g. "Chase Visa", "Student Loan", "Car Payment")' },
          { name: "Type", type: "Select", description: "Options: Credit Card, Student Loan, Car Loan, Mortgage, Personal Loan, Medical, Other" },
          { name: "Original Balance", type: "Number", description: "Starting balance when you began tracking (currency)" },
          { name: "Current Balance", type: "Number", description: "Current remaining balance (currency)" },
          { name: "Interest Rate", type: "Number", description: "Annual interest rate (e.g. 19.99 for 19.99%)" },
          { name: "Minimum Payment", type: "Number", description: "Required minimum monthly payment (currency)" },
          { name: "Extra Payment", type: "Number", description: "Additional monthly payment beyond minimum (currency)" },
          { name: "Due Date", type: "Number", description: "Day of month payment is due (e.g. 15 for the 15th)" },
          { name: "Lender", type: "Rich Text", description: "Lender or institution name" },
          { name: "Status", type: "Select", description: "Options: Active, Paid Off, Paused, Deferred" },
          { name: "Priority", type: "Select", description: 'Options: Avalanche (highest interest first), Snowball (smallest balance first), Custom' },
          { name: "Start Date", type: "Date", description: "When you started paying this debt" },
        ],
        views: [
          "Active Debts (Table) - filtered to Status = Active, sorted by Interest Rate descending (avalanche method)",
          "Snowball Order (Table) - filtered to Status = Active, sorted by Current Balance ascending",
          "All Debts (Table) - sorted by Status then Type",
          "By Type (Board) - grouped by Type",
          "Paid Off! (Table) - filtered to Status = Paid Off (celebration view)",
        ],
      },
      {
        name: "Payments",
        icon: "\u{1F4B8}",
        properties: [
          { name: "Payment", type: "Title", description: 'Description (e.g. "January Payment - Chase Visa")' },
          { name: "Debt", type: "Relation", description: 'Linked to "Debts" database' },
          { name: "Date", type: "Date", description: "Payment date" },
          { name: "Amount", type: "Number", description: "Total payment amount (currency)" },
          { name: "Principal", type: "Number", description: "Amount applied to principal (currency)" },
          { name: "Interest", type: "Number", description: "Amount that went to interest (currency)" },
          { name: "Type", type: "Select", description: "Options: Minimum, Extra, Lump Sum, Windfall" },
          { name: "Balance After", type: "Number", description: "Remaining balance after this payment (currency)" },
          { name: "Notes", type: "Rich Text", description: "Payment notes" },
        ],
        views: [
          "Recent Payments (Table) - sorted by Date descending",
          "By Debt (Board) - grouped by Debt relation",
          "This Month (Table) - filtered to current month",
          "Calendar (Calendar) - by Date",
        ],
      },
      {
        name: "Milestones",
        icon: "\u{1F389}",
        properties: [
          { name: "Milestone", type: "Title", description: 'Achievement (e.g. "Paid off Chase Visa!", "50% of student loan gone!")' },
          { name: "Debt", type: "Relation", description: 'Linked to "Debts" database' },
          { name: "Date Reached", type: "Date", description: "When the milestone was achieved" },
          { name: "Type", type: "Select", description: "Options: 25% Paid, 50% Paid, 75% Paid, Debt Free, $1000 Paid, $5000 Paid, $10000 Paid, Custom" },
          { name: "Amount Paid Total", type: "Number", description: "Total amount paid toward this debt at milestone (currency)" },
          { name: "Celebration", type: "Rich Text", description: "How you celebrated" },
        ],
        views: [
          "All Milestones (Table) - sorted by Date Reached descending",
          "By Debt (Board) - grouped by Debt relation",
          "Gallery (Gallery) - celebration wall",
        ],
      },
    ],
    formulas: [
      {
        database: "Debts",
        property: "Total Paid",
        formula: 'prop("Original Balance") - prop("Current Balance")',
        purpose: "How much of this debt you have paid off.",
      },
      {
        database: "Debts",
        property: "Progress %",
        formula: 'if(prop("Original Balance") == 0, 0, round((prop("Original Balance") - prop("Current Balance")) / prop("Original Balance") * 100))',
        purpose: "Percentage of the original debt that has been paid off.",
      },
      {
        database: "Debts",
        property: "Monthly Interest",
        formula: 'round(prop("Current Balance") * (prop("Interest Rate") / 100 / 12) * 100) / 100',
        purpose: "Estimated monthly interest charge at current balance.",
      },
      {
        database: "Debts",
        property: "Months to Payoff",
        formula: 'if((prop("Minimum Payment") + prop("Extra Payment")) <= 0, 0, if((prop("Minimum Payment") + prop("Extra Payment")) <= prop("Current Balance") * (prop("Interest Rate") / 100 / 12), 999, ceil(prop("Current Balance") / ((prop("Minimum Payment") + prop("Extra Payment")) - prop("Current Balance") * (prop("Interest Rate") / 100 / 12)))))',
        purpose: "Estimated months until this debt is paid off at current payment rate. Shows 999 if payment doesn't cover interest.",
      },
      {
        database: "Debts",
        property: "Debt-Free Date",
        formula: 'if((prop("Minimum Payment") + prop("Extra Payment")) <= 0, "N/A", if((prop("Minimum Payment") + prop("Extra Payment")) <= prop("Current Balance") * (prop("Interest Rate") / 100 / 12), "Never at current rate", dateAdd(now(), ceil(prop("Current Balance") / ((prop("Minimum Payment") + prop("Extra Payment")) - prop("Current Balance") * (prop("Interest Rate") / 100 / 12))), "months")))',
        purpose: "Estimated date when this specific debt will be paid off.",
      },
    ],
    sampleData:
      'Debts: "Chase Visa" (Credit Card/$8,500 original/$5,200 current/19.99%/$170 min/$100 extra), "Student Loan" (Student Loan/$32,000 original/$24,500 current/5.5%/$350 min/$0 extra), "Car Payment" (Car Loan/$18,000 original/$11,200 current/4.9%/$380 min/$20 extra), "Medical Bill" (Medical/$2,400 original/$800 current/0%/$100 min/$50 extra), "Personal Loan" (Personal Loan/$5,000 original/$3,100 current/12%/$150 min/$0 extra). Payments: 10 recent payments across debts. Milestones: "Medical bill 75% paid!", "Chase Visa below $6,000!", "$5,000 total paid toward student loan".',
    dashboardLayout: [
      'HEADER: Callout with money emoji - "Debt Payoff Tracker \u{1F4B3} Every payment brings you closer to freedom!"',
      'ROW 1 - KPI CARDS: 4 callouts: (1) Total Debt Remaining [$X], (2) Total Paid So Far [$X], (3) Overall Progress [X%], (4) Estimated Debt-Free Date [date]',
      'ROW 2 - DEBTS OVERVIEW: "Your Debts" linked view (Table, active debts showing Debt, Current Balance, Progress %, Monthly Interest, Months to Payoff)',
      'ROW 3 - TWO COLUMNS: Left: "Recent Payments" (Table, last 10 payments). Right: "Milestones \u{1F389}" (Gallery view)',
      'ROW 4 - PAYOFF STRATEGY: Callout explaining Avalanche vs Snowball method with toggle for each view',
      'ROW 5 - MONTHLY SUMMARY: "This Month\'s Payments" linked view (Table)',
    ],
    navigationSetup: [
      "Sub-pages: /Debts, /Payments, /Milestones",
      "Payoff strategy explainer page (Avalanche vs Snowball)",
      "Monthly payment planning template",
    ],
  },
};

/* ------------------------------------------------------------------ */
/*  Prompt Generator                                                   */
/* ------------------------------------------------------------------ */

function generateNotionBuildPrompt(config: PromptConfig): string {
  const spec = TEMPLATE_SPECS[config.templateType];
  if (!spec) {
    return `Error: Unknown template type "${config.templateType}". Supported types: ${Object.keys(TEMPLATE_SPECS).join(", ")}`;
  }

  const sections: string[] = [];

  /* ---------- Header ---------- */
  sections.push(`=== PREMIUM NOTION TEMPLATE BUILD INSTRUCTIONS ===

You are building a premium Notion template to sell on Etsy for $15-25.
This template must look and function like a professional $30+ product.
Follow every instruction precisely. Do NOT skip any step.

TEMPLATE TYPE: ${config.templateType.replace(/_/g, " ").toUpperCase()}
TEMPLATE NAME: ${spec.title}
TARGET AUDIENCE: ${config.targetAudience}
AESTHETIC: ${config.aesthetic}
COMPLEXITY: ${config.complexity}

---`);

  /* ---------- Step 1: Main Page ---------- */
  sections.push(`STEP 1: CREATE THE MAIN PAGE

1. Create a new Notion page.
2. Set the page title to: "${spec.title}"
3. Set the page icon to: ${spec.icon}
4. Set the cover image: Go to "Change Cover" > "Link" and paste this URL:
   ${spec.coverUrl}
5. At the very top of the page, add a callout block:
   - Icon: ${spec.icon}
   - Text: "Welcome to your ${spec.title}! ${spec.tagline}"
   - Color the callout background: use a soft, muted tone that matches the ${config.aesthetic} aesthetic.
6. Below the callout, add a divider line.
7. Add a toggle heading called "Quick Navigation" - you will fill this with links after creating all databases.

---`);

  /* ---------- Step 2: Create Databases ---------- */
  sections.push(`STEP 2: CREATE DATABASES

You will create ${spec.databases.length} databases. For each database, follow the exact property specifications below.
Create each database as a FULL-PAGE database first (so it gets its own page), then add linked views to the dashboard later.
`);

  spec.databases.forEach((db, idx) => {
    sections.push(`== Database ${idx + 1}: ${db.name} ${db.icon} ==

Create a new full-page database called "${db.name}".
Set the page icon to: ${db.icon}

Properties (create in this exact order):
`);

    db.properties.forEach((prop, pIdx) => {
      sections.push(
        `  ${pIdx + 1}. "${prop.name}" (${prop.type}): ${prop.description}`
      );
    });

    sections.push(`
Views to create for this database:`);

    db.views.forEach((view, vIdx) => {
      sections.push(`  ${vIdx + 1}. ${view}`);
    });

    sections.push("");
  });

  /* ---------- Step 3: Formulas ---------- */
  if (spec.formulas.length > 0) {
    sections.push(`---

STEP 3: ADD FORMULAS

For each formula below, go to the specified database, click "+ Add a property", choose "Formula", name it exactly as specified, and paste the formula code.
`);

    spec.formulas.forEach((f, idx) => {
      sections.push(`Formula ${idx + 1}:
  Database: "${f.database}"
  Property name: "${f.property}"
  Formula code:
    ${f.formula}
  Purpose: ${f.purpose}
`);
    });
  }

  /* ---------- Step 4: Sample Data ---------- */
  sections.push(`---

STEP 4: ADD SAMPLE DATA

Add realistic sample data to make the template look professional and help buyers understand how to use it. A template with good sample data sells significantly better than an empty one.

Here is what to add:
${spec.sampleData}

IMPORTANT: Add at least 5 sample rows to each database. Use realistic names, dates (use dates within the next 2-4 weeks for upcoming items), and values. Make the data tell a story - the sample user should feel like a real person using this template.

---`);

  /* ---------- Step 5: Dashboard ---------- */
  sections.push(`STEP 5: BUILD THE DASHBOARD

Go back to your main "${spec.title}" page. Below the Quick Navigation toggle and divider, build the dashboard layout as follows.

Use Notion's column feature (drag blocks side by side) to create multi-column layouts where specified.
For KPI cards, use callout blocks with relevant emojis and bold numbers.
For linked views, use "Create linked view of database" and apply the specified filters/sorts.
`);

  spec.dashboardLayout.forEach((section, idx) => {
    sections.push(`  ${idx + 1}. ${section}`);
  });

  /* ---------- Step 6: Navigation ---------- */
  sections.push(`
---

STEP 6: ADD NAVIGATION

${spec.navigationSetup.map((n, i) => `  ${i + 1}. ${n}`).join("\n")}

Now go back to the "Quick Navigation" toggle at the top and add an internal link to each database page and sub-page. Format as a bulleted list with emojis:
${spec.databases.map((db) => `  - ${db.icon} ${db.name}`).join("\n")}

---`);

  /* ---------- Step 7: Styling ---------- */
  sections.push(`STEP 7: STYLING & AESTHETICS

This step is critical for making the template look premium and worth $15-25.

1. Cover Image: Already set in Step 1 (${spec.coverUrl})
2. Aesthetic: "${config.aesthetic}"
   - If minimal: Use clean dividers, lots of white space, muted colors, simple icons
   - If colorful: Use colored callout backgrounds, diverse emojis, vibrant database colors
   - If dark/moody: Use dark cover images, deep-toned callout backgrounds, dramatic emojis
   - If pastel: Use soft pinks, blues, lavenders for callout backgrounds, cute emojis
3. Color-code your database select properties:
   - Status properties: use green for done/active, blue for in progress, gray for not started, red for urgent/overdue
   - Priority properties: use red for urgent/high, orange for medium, gray for low
4. Add emojis to each page icon:
${spec.databases.map((db) => `   - ${db.name}: ${db.icon}`).join("\n")}
5. Add dividers between major dashboard sections
6. Ensure consistent spacing throughout
7. Make callout blocks visually distinct from database views

---`);

  /* ---------- Step 8: Final Touches ---------- */
  sections.push(`STEP 8: FINAL TOUCHES & QUALITY CHECK

Before sharing, verify everything works:

1. TEST ALL FORMULAS: Click into each formula property and verify it calculates correctly with the sample data. Fix any errors.
2. TEST ALL VIEWS: Open each view and verify filters, sorts, and groupings work correctly.
3. TEST ALL RELATIONS: Verify linked databases connect properly.
4. CHECK MOBILE: Preview the template on mobile (Notion mobile app) - ensure the dashboard is readable and databases are navigable.
5. REVIEW SAMPLE DATA: Ensure all 5+ sample rows per database look realistic and professional.
6. REMOVE PERSONAL INFO: Make sure no personal data is in the template.
7. CLEAN UP: Remove any test pages or duplicate databases created during building.

Final settings:
- Click "Share" in the top right
- Enable "Share to web"
- Set to "Allow duplicate as template" - THIS IS CRITICAL
- Copy the share URL

---`);

  /* ---------- After Building ---------- */
  sections.push(`AFTER BUILDING:

1. Copy the share URL - this is what you will deliver to Etsy buyers
2. Test the template by opening the share URL in an incognito window and clicking "Duplicate"
3. Verify the duplicated copy has all databases, formulas, views, and sample data intact
4. Create 3-5 mockup images for your Etsy listing using Canva:
   - Main dashboard screenshot (hero image)
   - Individual database views
   - Mobile view screenshot
   - Before/after or feature highlight graphics
5. Write an Etsy listing description highlighting:
   - Number of databases (${spec.databases.length})
   - Number of views (${spec.databases.reduce((sum, db) => sum + db.views.length, 0)}+)
   - Key features and formulas
   - "Instant delivery - duplicate link"
   - "Works on desktop, tablet, and mobile"
   - "Includes sample data and instructions"

---

=== END OF BUILD INSTRUCTIONS ===
Total databases: ${spec.databases.length}
Total properties: ${spec.databases.reduce((sum, db) => sum + db.properties.length, 0)}
Total views: ${spec.databases.reduce((sum, db) => sum + db.views.length, 0)}
Total formulas: ${spec.formulas.length}
Estimated build time: ${config.complexity === "advanced" ? "90-120" : config.complexity === "simple" ? "30-45" : "45-90"} minutes`);

  /* ---------- Feature-specific additions ---------- */
  if (config.features.length > 0) {
    sections.push(`
---

ADDITIONAL FEATURES REQUESTED:

${config.features
  .map(
    (f, i) =>
      `${i + 1}. ${f}: Add this feature to the template. Create any additional properties, views, or pages needed to support it. Integrate it into the dashboard layout.`
  )
  .join("\n")}
`);
  }

  return sections.join("\n\n");
}

/* ------------------------------------------------------------------ */
/*  Route Handler                                                      */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  try {
    const { templateType, features, targetAudience, aesthetic, complexity } =
      await req.json();

    if (!templateType) {
      return NextResponse.json(
        { error: "Missing templateType" },
        { status: 400 }
      );
    }

    if (!TEMPLATE_SPECS[templateType]) {
      return NextResponse.json(
        {
          error: `Unknown templateType "${templateType}". Supported: ${Object.keys(TEMPLATE_SPECS).join(", ")}`,
        },
        { status: 400 }
      );
    }

    const prompt = generateNotionBuildPrompt({
      templateType,
      features: features || [],
      targetAudience: targetAudience || "general",
      aesthetic: aesthetic || "minimal",
      complexity: complexity || "medium",
    });

    return NextResponse.json({
      prompt,
      estimatedTime:
        complexity === "advanced"
          ? "90-120 minutes"
          : complexity === "simple"
            ? "30-45 minutes"
            : "45-90 minutes",
      difficulty:
        complexity === "simple"
          ? "beginner"
          : complexity === "advanced"
            ? "advanced"
            : "intermediate",
      wordCount: prompt.split(/\s+/).length,
      templateType,
      databases: TEMPLATE_SPECS[templateType].databases.length,
      totalProperties: TEMPLATE_SPECS[templateType].databases.reduce(
        (s, db) => s + db.properties.length,
        0
      ),
      totalViews: TEMPLATE_SPECS[templateType].databases.reduce(
        (s, db) => s + db.views.length,
        0
      ),
      totalFormulas: TEMPLATE_SPECS[templateType].formulas.length,
    });
  } catch (err: unknown) {
    console.error("[Notion Prompt Generate] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
