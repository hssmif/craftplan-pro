import type { CompetitorFeatures } from "./factory-competitor-scan";

export type SpreadsheetProductFamily =
  | "personal_finance"
  | "business_finance"
  | "etsy_inventory"
  | "wedding_event"
  | "real_estate"
  | "meal_fitness"
  | "habit_wellness"
  | "project_client"
  | "content_creator"
  | "education"
  | "travel_moving"
  | "custom_calculator";

export interface TabRequirement {
  name: string;
  purpose: string;
  mustHave?: boolean;
}

export interface SpreadsheetFamilyProfile {
  id: SpreadsheetProductFamily;
  label: string;
  buyer: string;
  targetTabs: string;
  minTabs: number;
  minCharts: number;
  minFormulas: number;
  minConditionalFormats: number;
  minDataValidations: number;
  minDefinedNames: number;
  visualDirection: string;
  requiredTabs: TabRequirement[];
  signatureTabs: TabRequirement[];
  coreEntities: string[];
  kpis: string[];
  formulas: string[];
  charts: string[];
  validations: string[];
  avoidTabs?: string[];
}

export interface SpreadsheetFamilyInput {
  niche?: string;
  nicheLabel?: string;
  projectName?: string;
  competitorTitle?: string;
  competitorDescription?: string;
  competitorTags?: string[];
  positioning?: string;
  competitorFeatures?: CompetitorFeatures;
}

export interface CompetitorTabHints {
  declaredTabCount: number;
  tabNames: string[];
}

export const SPREADSHEET_FAMILIES: Record<SpreadsheetProductFamily, SpreadsheetFamilyProfile> = {
  personal_finance: {
    id: "personal_finance",
    label: "Personal finance / budget planner",
    buyer: "families, students, couples, and individuals who want a simple money command center",
    targetTabs: "18-28 tabs for annual budget systems; 10-16 tabs for narrow debt, bill, or savings tools",
    minTabs: 14,
    minCharts: 3,
    minFormulas: 45,
    minConditionalFormats: 5,
    minDataValidations: 3,
    minDefinedNames: 5,
    visualDirection: "Etsy bestseller budget look: cream/taupe base, black divider bars, blush/sage cards, large serif titles, dense dashboard previews.",
    requiredTabs: [
      { name: "Start Here", purpose: "Plain-language setup guide", mustHave: true },
      { name: "Settings", purpose: "Currency, year, income targets, categories, accounts", mustHave: true },
      { name: "Transactions", purpose: "Master income, expense, savings, debt, and gift log", mustHave: true },
      { name: "Dashboard", purpose: "KPI summary with chart-ready monthly and category data", mustHave: true },
      { name: "Bills", purpose: "Recurring bill calendar and next-due tracking" },
      { name: "Savings Goals", purpose: "Goal targets, contributions, progress bars" },
      { name: "Debt Payoff", purpose: "Debt balance, APR, minimum payment, payoff progress" },
    ],
    signatureTabs: [
      { name: "Smart Calendar", purpose: "Calendar view of bills, transactions, and cash-flow dates", mustHave: true },
      { name: "Year in Review", purpose: "Annual recap with category wins, charts, and headline KPIs", mustHave: true },
      { name: "AI Money Coach", purpose: "Formula-written insight cards using IF, TEXT, SUMIFS, and ratios", mustHave: true },
      { name: "What-If Simulator", purpose: "Scenario inputs for income, savings, debt, and spending changes", mustHave: true },
    ],
    coreEntities: ["transactions", "categories", "accounts", "bills", "debts", "savings goals", "monthly summaries"],
    kpis: ["income", "expenses", "remaining budget", "savings rate", "debt progress", "net worth"],
    formulas: ["SUMIFS by month/category/type", "COUNTIFS for unpaid bills", "debt payoff estimate", "savings progress percent", "variance versus budget"],
    charts: ["income vs expense column chart", "category spending doughnut", "savings/debt progress bar or line chart"],
    validations: ["transaction type", "category", "account", "month", "bill status"],
  },
  business_finance: {
    id: "business_finance",
    label: "Small business finance / bookkeeping",
    buyer: "freelancers, side hustlers, creators, and service businesses tracking profit without accounting software",
    targetTabs: "12-20 tabs depending on bookkeeping depth",
    minTabs: 10,
    minCharts: 3,
    minFormulas: 45,
    minConditionalFormats: 5,
    minDataValidations: 4,
    minDefinedNames: 5,
    visualDirection: "Executive but Etsy-friendly: clean cream base, charcoal headers, green profit accents, amber tax/reserve warnings, compact tables.",
    requiredTabs: [
      { name: "Dashboard", purpose: "Revenue, expenses, profit, margin, tax reserve, cash runway", mustHave: true },
      { name: "Settings", purpose: "Business info, tax rate, categories, service/product list", mustHave: true },
      { name: "Revenue Log", purpose: "Client, product, invoice, status, amount, paid date", mustHave: true },
      { name: "Expense Log", purpose: "Category, vendor, deductible flag, payment method", mustHave: true },
      { name: "Monthly P&L", purpose: "Formula-driven profit and loss by month", mustHave: true },
      { name: "Tax Planning", purpose: "Estimated quarterly tax and reserve tracker" },
    ],
    signatureTabs: [
      { name: "Profit Coach", purpose: "Formula-written business insights and margin advice", mustHave: true },
      { name: "Pricing Simulator", purpose: "Inputs for price, cost, units, fees, and target margin", mustHave: true },
      { name: "Tax Calendar", purpose: "Due dates, estimated payments, and reserve status" },
      { name: "Year in Review", purpose: "Annual business recap with best month/client/category" },
    ],
    coreEntities: ["revenue", "expenses", "clients", "products/services", "taxes", "payment status"],
    kpis: ["gross revenue", "net profit", "profit margin", "tax reserve", "unpaid invoices", "monthly trend"],
    formulas: ["SUMIFS by month/status/category", "profit margin", "tax reserve", "invoice aging", "pricing margin math"],
    charts: ["monthly revenue vs expense chart", "profit margin line chart", "expense category doughnut"],
    validations: ["client", "service/product", "category", "payment status", "deductible yes/no"],
  },
  etsy_inventory: {
    id: "etsy_inventory",
    label: "Etsy seller inventory / COGS tracker",
    buyer: "handmade sellers who need materials, finished goods, orders, costs, stock status, and profit in one workbook",
    targetTabs: "10-16 tabs for a serious seller operations workbook",
    minTabs: 10,
    minCharts: 3,
    minFormulas: 50,
    minConditionalFormats: 6,
    minDataValidations: 5,
    minDefinedNames: 5,
    visualDirection: "Maker-business style: warm neutral base, organized SKU tables, status badges, low-stock color alerts, polished operations dashboard.",
    requiredTabs: [
      { name: "Dashboard", purpose: "Sales, profit, inventory value, low-stock alerts, best sellers", mustHave: true },
      { name: "Settings", purpose: "Shop info, tax/fee rates, categories, vendors", mustHave: true },
      { name: "Materials Inventory", purpose: "SKU, material name, unit cost, quantity on hand, reorder point", mustHave: true },
      { name: "Product Inventory", purpose: "Finished products, retail price, stock, stock status", mustHave: true },
      { name: "Bill of Materials", purpose: "Connect products to materials and unit usage", mustHave: true },
      { name: "Orders", purpose: "Order log with revenue, fees, shipping, COGS, profit", mustHave: true },
      { name: "Purchases", purpose: "Supplier purchases and landed unit costs" },
      { name: "Reports", purpose: "Monthly COGS, profit, and inventory value" },
    ],
    signatureTabs: [
      { name: "Reorder Command Center", purpose: "Low-stock and reorder priority dashboard", mustHave: true },
      { name: "Profit Simulator", purpose: "Price, cost, Etsy fees, shipping, and margin scenarios", mustHave: true },
      { name: "COGS Audit", purpose: "Checks missing costs, negative stock, stale SKUs, and margin leaks", mustHave: true },
    ],
    coreEntities: ["materials", "products", "BOM recipes", "orders", "vendors", "fees", "stock levels"],
    kpis: ["revenue", "gross profit", "COGS", "inventory value", "low-stock count", "top product margin"],
    formulas: ["INDEX-MATCH unit costs", "SUMIFS order totals", "COGS per order", "stock status", "gross margin", "reorder quantity"],
    charts: ["monthly revenue/profit chart", "inventory value by category", "top products bar chart"],
    validations: ["SKU", "category", "vendor", "order status", "stock status"],
    avoidTabs: ["Debt Payoff", "AI Money Coach"],
  },
  wedding_event: {
    id: "wedding_event",
    label: "Wedding / event planner",
    buyer: "couples, event planners, and families managing vendors, guests, timelines, payments, and seating",
    targetTabs: "24-36 tabs for full wedding/event planners; bestseller listings often advertise 29-33 tabs",
    minTabs: 18,
    minCharts: 3,
    minFormulas: 60,
    minConditionalFormats: 8,
    minDataValidations: 6,
    minDefinedNames: 6,
    visualDirection: "Elegant editorial: ivory, soft blush, sage, champagne, black dividers, serif titles, clean tables suitable for wedding screenshots.",
    requiredTabs: [
      { name: "Setup", purpose: "Quick setup, event date, couple info, currency, theme", mustHave: true },
      { name: "Dashboard", purpose: "Budget, RSVP, task, vendor, payment, and timeline overview", mustHave: true },
      { name: "Wedding Budget", purpose: "Budget vs actual by category with formulas and variance", mustHave: true },
      { name: "Guest List", purpose: "RSVP, party size, meal preference, table number, gifts", mustHave: true },
      { name: "Vendor Tracker", purpose: "Vendor quotes, deposits, balances, due dates, contracts", mustHave: true },
      { name: "Venue Comparison", purpose: "Compare venues by quote, capacity, inclusions, deposits, notes", mustHave: true },
      { name: "Reception Seating", purpose: "Table assignments, capacities, open seats, RSVP links", mustHave: true },
      { name: "Wedding Checklist", purpose: "Pre-wedding to post-wedding task plan with deadlines and owners", mustHave: true },
      { name: "Wedding Itinerary", purpose: "Wedding day schedule by time, location, owner, status", mustHave: true },
      { name: "Registry", purpose: "Registry items, price, priority, status, gifted by, thank-you status" },
      { name: "Wedding Party", purpose: "Wedding party contacts, attire, gifts, responsibilities" },
      { name: "Food & Drinks", purpose: "Menu, catering, drinks, tastings, dietary notes, cost" },
      { name: "Photos & Videos", purpose: "Photo/video shot list, vendor, timeline, must-have moments" },
      { name: "Packing List", purpose: "Packing checklist by person/category/status" },
      { name: "Moodboard", purpose: "Theme, colors, links, inspiration notes" },
      { name: "Decor", purpose: "Decor inventory, quantity, source, cost, setup area" },
      { name: "Floral", purpose: "Flower arrangements, quantities, vendor, cost, delivery" },
      { name: "Attire & Makeup", purpose: "Outfits, fittings, beauty appointments, costs, status" },
      { name: "Accommodation", purpose: "Hotel blocks, guests, rates, confirmation status" },
      { name: "Transportation", purpose: "Vehicles, routes, times, contacts, costs" },
      { name: "Stationery Tracker", purpose: "Save the dates, invitations, menus, signage, print status" },
      { name: "Music", purpose: "Ceremony, reception, do-not-play, first dance, DJ notes" },
      { name: "Honeymoon Planner", purpose: "Honeymoon itinerary, budget, bookings, packing, tasks" },
      { name: "Gift & Thanks", purpose: "Gift log and thank-you note tracker" },
    ],
    signatureTabs: [
      { name: "Smart Calendar", purpose: "Calendar view of checklist tasks, payments, events, and appointments", mustHave: true },
      { name: "Wedding Day Binder", purpose: "Day-of command sheet for contacts, timeline, vendors, emergency notes", mustHave: true },
      { name: "Vendor Risk Board", purpose: "Flags unpaid deposits, missing contracts, and urgent deadlines", mustHave: true },
      { name: "RSVP Command Center", purpose: "Guest counts, meals, table capacity, missing replies", mustHave: true },
      { name: "Budget What-If", purpose: "Scenario inputs for guest count, venue, catering, decor, and honeymoon" },
      { name: "Bridal Shower Planner", purpose: "Separate mini-planner for shower tasks, guests, budget, and gifts" },
      { name: "Bachelor(ette) Planner", purpose: "Separate mini-planner for party itinerary, guests, budget, tasks" },
    ],
    coreEntities: ["guests", "vendors", "payments", "tasks", "tables", "budget categories", "meal choices"],
    kpis: ["total budget", "actual spend", "remaining budget", "RSVP rate", "vendor balance due", "tasks overdue"],
    formulas: ["SUMIFS by vendor/category/status", "COUNTIFS RSVP/table/meal/task status", "budget variance", "days until event", "payment due flags", "table open seats", "thank-you completion rate"],
    charts: ["budget by category doughnut", "RSVP status bar chart", "payment timeline", "task completion chart"],
    validations: ["RSVP status", "meal choice", "vendor category", "payment status", "task priority", "contract status", "booking status"],
    avoidTabs: ["Debt Payoff", "AI Money Coach"],
  },
  real_estate: {
    id: "real_estate",
    label: "Real estate / rental property tracker",
    buyer: "landlords, Airbnb hosts, investors, and property managers tracking cash flow and ROI",
    targetTabs: "10-18 tabs for one-property or portfolio tools",
    minTabs: 10,
    minCharts: 3,
    minFormulas: 45,
    minConditionalFormats: 5,
    minDataValidations: 4,
    minDefinedNames: 5,
    visualDirection: "Professional investor dashboard: cream or white base, navy/charcoal headers, green cash-flow positives, red vacancy/repair alerts.",
    requiredTabs: [
      { name: "Dashboard", purpose: "Cash flow, ROI, occupancy, repairs, rent collection", mustHave: true },
      { name: "Properties", purpose: "Property details, purchase price, loan terms, rent targets", mustHave: true },
      { name: "Rent Ledger", purpose: "Tenant, due date, paid date, amount, balance", mustHave: true },
      { name: "Expenses", purpose: "Repairs, utilities, taxes, insurance, management fees", mustHave: true },
      { name: "Mortgage", purpose: "Payment, interest, principal, escrow, balance" },
      { name: "ROI Calculator", purpose: "Cap rate, cash-on-cash return, NOI, breakeven" },
    ],
    signatureTabs: [
      { name: "Cash Flow Simulator", purpose: "Rent, vacancy, mortgage, repairs, and rate scenario planner", mustHave: true },
      { name: "Repair Reserve Planner", purpose: "Reserve targets and upcoming maintenance risk", mustHave: true },
      { name: "Tenant Command Center", purpose: "Rent status, lease dates, contact notes, issue flags" },
    ],
    coreEntities: ["properties", "tenants", "rent payments", "expenses", "mortgage", "repairs", "leases"],
    kpis: ["monthly cash flow", "NOI", "cap rate", "cash-on-cash return", "occupancy", "repair reserve"],
    formulas: ["SUMIFS by property/month", "NOI", "cap rate", "cash-on-cash return", "mortgage breakdown", "late rent flags"],
    charts: ["cash flow trend", "expense category doughnut", "property ROI comparison"],
    validations: ["property", "tenant", "expense category", "payment status", "lease status"],
    avoidTabs: ["AI Money Coach"],
  },
  meal_fitness: {
    id: "meal_fitness",
    label: "Meal, grocery, fitness, or wellness planner",
    buyer: "busy families and individuals planning meals, groceries, workouts, wellness routines, and costs",
    targetTabs: "8-16 tabs for planner/tracker hybrids",
    minTabs: 8,
    minCharts: 2,
    minFormulas: 30,
    minConditionalFormats: 4,
    minDataValidations: 3,
    minDefinedNames: 3,
    visualDirection: "Fresh and organized: light base, greens, citrus or soft rose accents, checklist-heavy layouts, progress rings, weekly views.",
    requiredTabs: [
      { name: "Dashboard", purpose: "Weekly plan, budget, nutrition/workout progress, habit streaks", mustHave: true },
      { name: "Settings", purpose: "Goals, categories, meal types, workout types, grocery stores", mustHave: true },
      { name: "Weekly Planner", purpose: "Plan meals, workouts, or wellness routines by day", mustHave: true },
      { name: "Grocery List", purpose: "Items, quantity, category, estimated cost, purchased status" },
      { name: "Recipe Bank", purpose: "Recipes, ingredients, servings, prep time, cost per serving" },
      { name: "Progress Tracker", purpose: "Measurements, workouts, habits, or wellness metrics" },
    ],
    signatureTabs: [
      { name: "Auto Grocery Builder", purpose: "Aggregates ingredients or planned meals into a shopping list", mustHave: true },
      { name: "Weekly Reset", purpose: "Review, prep list, next-week priorities, habit reflection", mustHave: true },
      { name: "Goal Simulator", purpose: "Scenario inputs for food budget, calories, workouts, or habit targets" },
    ],
    coreEntities: ["days", "meals", "recipes", "ingredients", "grocery items", "workouts", "habits"],
    kpis: ["weekly cost", "meals planned", "prep time", "habits completed", "workouts done", "goal progress"],
    formulas: ["SUMIFS weekly grocery costs", "COUNTIFS completion/streaks", "cost per serving", "progress percentage", "variance vs goal"],
    charts: ["weekly cost chart", "habit/workout completion chart", "category spending doughnut"],
    validations: ["meal type", "category", "purchased yes/no", "workout type", "completion status"],
  },
  habit_wellness: {
    id: "habit_wellness",
    label: "Habit, goal, or wellness tracker",
    buyer: "people tracking routines, goals, wellness behaviors, moods, streaks, and personal progress",
    targetTabs: "8-14 tabs for daily/weekly/monthly tracking",
    minTabs: 8,
    minCharts: 2,
    minFormulas: 30,
    minConditionalFormats: 5,
    minDataValidations: 3,
    minDefinedNames: 3,
    visualDirection: "Calm productivity style: light neutral base, restrained color, streak heatmaps, progress cards, compact check-in grids.",
    requiredTabs: [
      { name: "Dashboard", purpose: "Goal progress, habit streaks, completion rate, monthly trend", mustHave: true },
      { name: "Settings", purpose: "Habit list, goals, categories, scoring rules", mustHave: true },
      { name: "Daily Tracker", purpose: "Daily habit and wellness check-in grid", mustHave: true },
      { name: "Weekly Review", purpose: "Weekly score, notes, wins, blockers" },
      { name: "Monthly Review", purpose: "Month summary, streaks, goal progress" },
    ],
    signatureTabs: [
      { name: "Streak Dashboard", purpose: "Formula-driven current and best streaks", mustHave: true },
      { name: "Pattern Finder", purpose: "Highlights strongest days, weak spots, and consistency patterns", mustHave: true },
      { name: "Goal What-If", purpose: "Scenario planner for habit frequency and completion targets" },
    ],
    coreEntities: ["habits", "days", "weeks", "goals", "scores", "notes"],
    kpis: ["completion rate", "current streak", "best streak", "weekly score", "monthly progress"],
    formulas: ["COUNTIFS completion rates", "streak calculations", "weekly averages", "goal progress", "best/worst day"],
    charts: ["completion trend line", "habit category bar chart", "monthly progress chart"],
    validations: ["habit", "status", "mood", "energy", "category"],
  },
  project_client: {
    id: "project_client",
    label: "Project management / client CRM",
    buyer: "freelancers, agencies, teams, and consultants managing projects, tasks, clients, and deadlines",
    targetTabs: "10-18 tabs for CRM and project dashboards",
    minTabs: 10,
    minCharts: 2,
    minFormulas: 35,
    minConditionalFormats: 5,
    minDataValidations: 4,
    minDefinedNames: 4,
    visualDirection: "Quiet SaaS-style operations workbook: crisp tables, status badges, muted palette, dense but scannable dashboards.",
    requiredTabs: [
      { name: "Dashboard", purpose: "Pipeline, active projects, overdue tasks, revenue, capacity", mustHave: true },
      { name: "Settings", purpose: "Statuses, stages, service types, priorities, team members", mustHave: true },
      { name: "Clients", purpose: "Client details, status, contact, value, notes", mustHave: true },
      { name: "Projects", purpose: "Scope, owner, due date, stage, budget, progress", mustHave: true },
      { name: "Tasks", purpose: "Task tracker with priority, owner, deadline, status", mustHave: true },
      { name: "Pipeline", purpose: "Leads, stage, value, next action" },
    ],
    signatureTabs: [
      { name: "Client Command Center", purpose: "One view for client status, revenue, tasks, and next action", mustHave: true },
      { name: "Capacity Planner", purpose: "Workload by week/team member and deadline pressure", mustHave: true },
      { name: "Project Risk Board", purpose: "Flags overdue, blocked, over-budget, and idle projects" },
    ],
    coreEntities: ["clients", "projects", "tasks", "leads", "owners", "statuses", "deadlines"],
    kpis: ["active projects", "overdue tasks", "pipeline value", "close rate", "capacity", "revenue forecast"],
    formulas: ["COUNTIFS by status/owner", "SUMIFS pipeline value", "days overdue", "completion percent", "weighted forecast"],
    charts: ["pipeline by stage", "task status chart", "weekly workload chart"],
    validations: ["client", "project", "status", "priority", "owner", "pipeline stage"],
    avoidTabs: ["Debt Payoff", "AI Money Coach"],
  },
  content_creator: {
    id: "content_creator",
    label: "Social media / content creator planner",
    buyer: "creators, small brands, marketers, and influencers planning content and tracking campaigns",
    targetTabs: "10-18 tabs for content calendar plus analytics",
    minTabs: 10,
    minCharts: 3,
    minFormulas: 35,
    minConditionalFormats: 5,
    minDataValidations: 4,
    minDefinedNames: 4,
    visualDirection: "Creator dashboard: clean editorial calendar, platform color accents, campaign cards, trend and performance charts.",
    requiredTabs: [
      { name: "Dashboard", purpose: "Posting plan, content status, campaign KPIs, platform performance", mustHave: true },
      { name: "Settings", purpose: "Platforms, content pillars, statuses, campaign types", mustHave: true },
      { name: "Content Calendar", purpose: "Date, platform, pillar, caption, asset, status", mustHave: true },
      { name: "Ideas Bank", purpose: "Idea backlog with pillar, priority, hook, format", mustHave: true },
      { name: "Campaign Tracker", purpose: "Campaign timeline, deliverables, status, goals" },
      { name: "Analytics", purpose: "Reach, engagement, clicks, followers, conversion metrics" },
    ],
    signatureTabs: [
      { name: "Content Gap Finder", purpose: "Flags missing pillars, empty weeks, and platform imbalance", mustHave: true },
      { name: "Campaign Command Center", purpose: "Campaign deliverables, deadlines, metrics, and status", mustHave: true },
      { name: "Growth Simulator", purpose: "Scenario planner for posting cadence and engagement targets" },
    ],
    coreEntities: ["posts", "platforms", "content pillars", "campaigns", "analytics", "assets", "deadlines"],
    kpis: ["posts scheduled", "completion rate", "engagement rate", "reach", "followers gained", "campaign ROI"],
    formulas: ["COUNTIFS by platform/status/week", "engagement rate", "posting cadence", "campaign progress", "best pillar"],
    charts: ["posts by platform", "engagement trend", "pillar mix doughnut"],
    validations: ["platform", "content pillar", "status", "campaign", "format"],
    avoidTabs: ["Debt Payoff", "AI Money Coach"],
  },
  education: {
    id: "education",
    label: "Teacher, student, gradebook, or homeschool planner",
    buyer: "teachers, homeschool parents, tutors, and students organizing classes, assignments, grades, attendance, and lessons",
    targetTabs: "10-18 tabs for full education planners",
    minTabs: 10,
    minCharts: 2,
    minFormulas: 35,
    minConditionalFormats: 5,
    minDataValidations: 4,
    minDefinedNames: 4,
    visualDirection: "Clean academic planner: printable-friendly tables, soft color sections, grade/status badges, calendar and lesson views.",
    requiredTabs: [
      { name: "Dashboard", purpose: "Class progress, grades, attendance, upcoming assignments", mustHave: true },
      { name: "Settings", purpose: "Classes, students, grading scale, terms, subjects", mustHave: true },
      { name: "Students", purpose: "Student roster and contact notes", mustHave: true },
      { name: "Gradebook", purpose: "Assignments, scores, weights, calculated grades", mustHave: true },
      { name: "Attendance", purpose: "Daily attendance, absences, tardies", mustHave: true },
      { name: "Lesson Planner", purpose: "Lesson dates, subjects, objectives, resources" },
      { name: "Assignment Tracker", purpose: "Due dates, status, late/missing flags" },
    ],
    signatureTabs: [
      { name: "Grade Insight Board", purpose: "Formula-driven weak areas, class averages, and missing work flags", mustHave: true },
      { name: "Lesson Calendar", purpose: "Weekly/monthly class plan with upcoming work", mustHave: true },
      { name: "Progress Conference", purpose: "Student summary cards for parent/student check-ins" },
    ],
    coreEntities: ["students", "classes", "assignments", "scores", "attendance", "lessons", "terms"],
    kpis: ["class average", "missing assignments", "attendance rate", "students at risk", "assignments due"],
    formulas: ["weighted grade", "COUNTIFS attendance/status", "average by class/student", "missing work flags", "grade scale lookup"],
    charts: ["grade distribution", "attendance trend", "assignment status chart"],
    validations: ["class", "student", "assignment type", "attendance status", "grade status"],
    avoidTabs: ["Debt Payoff", "AI Money Coach"],
  },
  travel_moving: {
    id: "travel_moving",
    label: "Travel, itinerary, or moving planner",
    buyer: "families, groups, and individuals planning trips, relocations, itineraries, packing, costs, and bookings",
    targetTabs: "10-18 tabs for trip/moving command centers",
    minTabs: 10,
    minCharts: 2,
    minFormulas: 30,
    minConditionalFormats: 4,
    minDataValidations: 4,
    minDefinedNames: 4,
    visualDirection: "Airy editorial planner: destination/moving sections, clean checklists, trip budget cards, booking status badges.",
    requiredTabs: [
      { name: "Dashboard", purpose: "Budget, itinerary, packing, booking, and task overview", mustHave: true },
      { name: "Settings", purpose: "Trip dates, destinations, categories, travelers, booking statuses", mustHave: true },
      { name: "Itinerary", purpose: "Day, time, activity, location, cost, booking status", mustHave: true },
      { name: "Budget Tracker", purpose: "Estimated vs actual costs by category", mustHave: true },
      { name: "Packing List", purpose: "Items, category, packed status, owner" },
      { name: "Bookings", purpose: "Flights, hotels, tickets, confirmations, due dates" },
      { name: "Tasks", purpose: "Pre-trip or moving checklist with deadlines" },
    ],
    signatureTabs: [
      { name: "Booking Command Center", purpose: "Missing confirmations, unpaid bookings, upcoming deadlines", mustHave: true },
      { name: "Packing Auto-Checklist", purpose: "Packing list grouped by traveler/category/status", mustHave: true },
      { name: "Budget What-If", purpose: "Scenario planner for travelers, nights, transport, and activity budget" },
    ],
    coreEntities: ["destinations", "travelers", "activities", "bookings", "expenses", "packing items", "tasks"],
    kpis: ["total budget", "actual spend", "bookings complete", "items packed", "tasks overdue", "daily cost"],
    formulas: ["SUMIFS by category/day/traveler", "COUNTIFS booking/packing/task status", "daily average cost", "budget variance"],
    charts: ["budget by category", "daily spend trend", "booking status chart"],
    validations: ["destination", "traveler", "category", "booking status", "packed yes/no"],
    avoidTabs: ["Debt Payoff", "AI Money Coach"],
  },
  custom_calculator: {
    id: "custom_calculator",
    label: "Custom calculator / decision workbook",
    buyer: "buyers who need a focused calculator for pricing, loans, launches, subscriptions, comparisons, or scenario decisions",
    targetTabs: "6-12 tabs for focused calculators, 12-16 for bundle calculators",
    minTabs: 6,
    minCharts: 2,
    minFormulas: 30,
    minConditionalFormats: 3,
    minDataValidations: 2,
    minDefinedNames: 3,
    visualDirection: "Utility-first premium calculator: clear input cells, locked-looking calculated outputs, scenario cards, concise charts.",
    requiredTabs: [
      { name: "Dashboard", purpose: "Decision summary, best option, warnings, and output KPIs", mustHave: true },
      { name: "Inputs", purpose: "All user-editable assumptions and scenario inputs", mustHave: true },
      { name: "Calculator", purpose: "Core formula engine with transparent calculations", mustHave: true },
      { name: "Scenarios", purpose: "Base, conservative, and stretch case comparisons", mustHave: true },
      { name: "Instructions", purpose: "Setup and interpretation guide" },
    ],
    signatureTabs: [
      { name: "Scenario Simulator", purpose: "Editable assumptions with live output deltas", mustHave: true },
      { name: "Decision Scorecard", purpose: "Formula-scored recommendation and risk flags", mustHave: true },
    ],
    coreEntities: ["inputs", "assumptions", "scenarios", "outputs", "risks", "recommendation"],
    kpis: ["best case", "base case", "worst case", "break-even point", "margin", "recommendation score"],
    formulas: ["scenario deltas", "break-even math", "margin/ROI math", "weighted score", "risk thresholds"],
    charts: ["scenario comparison bar chart", "sensitivity line or tornado chart"],
    validations: ["scenario", "category", "yes/no", "risk level"],
  },
};

const FAMILY_KEYWORDS: Array<[SpreadsheetProductFamily, RegExp]> = [
  ["etsy_inventory", /\b(etsy seller|etsy shop|inventory|stock|sku|cogs|cost of goods|materials?|supplies|reorder|bill of materials|bom|orders?)\b/i],
  ["wedding_event", /\b(wedding|bridal|bride|groom|engagement|event planner|guest list|rsvp|seating|vendor|venue|baby shower|party planner)\b/i],
  ["real_estate", /\b(real estate|rental|property|landlord|tenant|airbnb|mortgage|cap rate|cash flow|cashflow|roi|repair|lease)\b/i],
  ["business_finance", /\b(business|bookkeeping|profit|p&l|pnl|invoice|tax|quarterly|freelance|side hustle|client revenue|small business|expense report)\b/i],
  ["content_creator", /\b(content|social media|instagram|tiktok|youtube|creator|campaign|posting|editorial calendar|influencer|brand deal)\b/i],
  ["project_client", /\b(project|client|crm|pipeline|lead tracker|task tracker|agency|consultant|deadline|kanban|workflow)\b/i],
  ["education", /\b(teacher|gradebook|student|classroom|lesson|attendance|assignment|homeschool|school|tutor|syllabus)\b/i],
  ["meal_fitness", /\b(meal|recipe|grocery|fitness|workout|weight loss|nutrition|calorie|macro|wellness planner)\b/i],
  ["habit_wellness", /\b(habit|goal tracker|routine|mood|wellness|self care|streak|daily tracker|weekly tracker|monthly tracker)\b/i],
  ["travel_moving", /\b(travel|trip|vacation|itinerary|packing|moving|relocation|destination|flight|hotel|road trip)\b/i],
  ["personal_finance", /\b(budget|paycheck|finance|money|expense|saving|savings|debt|bill|net worth|subscription|cash envelope)\b/i],
];

function combineInput(input: SpreadsheetFamilyInput): string {
  return [
    input.niche,
    input.nicheLabel,
    input.projectName,
    input.competitorTitle,
    input.competitorDescription,
    input.positioning,
    ...(input.competitorTags ?? []),
    ...(input.competitorFeatures?.declaredFeatures ?? []),
    ...(input.competitorFeatures?.detectedTabs ?? []),
    ...(input.competitorFeatures?.uniqueWidgets ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function resolveSpreadsheetFamily(input: SpreadsheetFamilyInput): SpreadsheetFamilyProfile {
  const combined = combineInput(input);
  for (const [familyId, pattern] of FAMILY_KEYWORDS) {
    if (pattern.test(combined)) return SPREADSHEET_FAMILIES[familyId];
  }
  if (/\b(calculator|calculate|scenario|simulator|comparison|pricing|margin|break even|breakeven)\b/i.test(combined)) {
    return SPREADSHEET_FAMILIES.custom_calculator;
  }
  return SPREADSHEET_FAMILIES.custom_calculator;
}

export function extractCompetitorTabHints(input: SpreadsheetFamilyInput): CompetitorTabHints {
  const text = [
    input.competitorTitle,
    input.competitorDescription,
    ...(input.competitorFeatures?.declaredFeatures ?? []),
  ]
    .filter(Boolean)
    .join("\n");

  const counts = [
    input.competitorFeatures?.tabCount ?? 0,
    ...Array.from(text.matchAll(/\b(\d{1,2})\s*(?:tabs?|sheets?|pages?)\b/gi)).map((m) => Number(m[1])),
  ].filter((n) => Number.isFinite(n) && n > 0);

  const tabNames = new Set<string>();
  for (const tab of input.competitorFeatures?.detectedTabs ?? []) {
    const cleaned = cleanTabHint(tab);
    if (cleaned) tabNames.add(cleaned);
  }

  let insideTabList = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      if (insideTabList) continue;
      continue;
    }
    if (/\b(?:tabs?|sheets?)\s+included\b/i.test(line) || /\b\d{1,2}\s+tabs?\b/i.test(line)) {
      insideTabList = true;
      continue;
    }
    if (insideTabList && /what you will receive|important|how to|please note|download/i.test(line)) {
      insideTabList = false;
    }
    if (!insideTabList) continue;
    const cleaned = cleanTabHint(line);
    if (cleaned) tabNames.add(cleaned);
  }

  return {
    declaredTabCount: Math.max(0, ...counts),
    tabNames: Array.from(tabNames).slice(0, 50),
  };
}

export function tabMatchesRequirement(tabName: string, requirementName: string): boolean {
  const tab = normalizeMatchText(tabName);
  const req = normalizeMatchText(requirementName);
  if (!tab || !req) return false;
  if (tab.includes(req) || req.includes(tab)) return true;

  const reqTokens = req.split(" ").filter((token) => token.length > 2);
  if (reqTokens.length === 0) return false;
  const matches = reqTokens.filter((token) => tab.includes(token)).length;
  return matches >= Math.min(2, reqTokens.length);
}

function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTabHint(value: string): string | null {
  const cleaned = value
    .replace(/^[✓✔★•*\-\d.)\s]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length < 3 || cleaned.length > 45) return null;
  if (/^(why this planner|key features|what you will receive|important)$/i.test(cleaned)) return null;
  return cleaned
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .replace(/\bAnd\b/g, "&");
}
