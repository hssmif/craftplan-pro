// ══════════════════════════════════════════════════════════════
// Factory Niche Data — Per-Niche Realistic Data Templates
//
// Provides niche-specific savings goals, budget categories,
// monthly income values, and KPI labels so that each product
// looks genuinely customized, not recolored from a template.
// ══════════════════════════════════════════════════════════════

export interface NicheSavingsGoal {
  name: string;
  target: number;
  saved: number;
}

export interface NicheBudgetCategory {
  name: string;
  budgetAmount: number;
}

export interface CustomSectionData {
  headers: string[];
  rows: Array<Array<string | number | null>>;
}

export interface NicheDataProfile {
  monthlyIncome: number;
  savingsGoals: NicheSavingsGoal[];
  budgetCategories: NicheBudgetCategory[];
  kpiLabels: [string, string, string, string]; // Income, Spent, Savings, Rate
  tagline: string;
  problemHook: string;
  customSections?: Record<string, CustomSectionData>;
}

const NICHE_DATA: Record<string, NicheDataProfile> = {
  "baby-budget": {
    monthlyIncome: 5500,
    savingsGoals: [
      { name: "College Fund", target: 15000, saved: 4200 },
      { name: "Baby Room Setup", target: 3000, saved: 1800 },
      { name: "Childcare Reserve", target: 8000, saved: 2700 },
      { name: "Emergency Fund", target: 10000, saved: 6500 },
    ],
    budgetCategories: [
      { name: "Diapers & Wipes", budgetAmount: 180 },
      { name: "Baby Formula", budgetAmount: 250 },
      { name: "Pediatric Visits", budgetAmount: 120 },
      { name: "Baby Clothes", budgetAmount: 100 },
      { name: "Nursery Supplies", budgetAmount: 80 },
      { name: "Childcare", budgetAmount: 1200 },
      { name: "Baby Food", budgetAmount: 150 },
      { name: "Toys & Books", budgetAmount: 60 },
    ],
    kpiLabels: ["Total Income", "Baby Costs", "Net Savings", "Savings Rate"],
    tagline: "Track your newborn's expenses and plan for the future",
    problemHook: "Where did my money go?",
    customSections: {
      milestones: {
        headers: ["Milestone", "Age", "Expected Cost", "Status"],
        rows: [
          ["First Car Seat", "0 months", 300, "✅ Purchased"],
          ["Crib & Mattress", "0 months", 450, "✅ Purchased"],
          ["Start Daycare", "3 months", 1200, "🟡 Researching"],
          ["First Solid Foods", "6 months", 80, "⏳ Upcoming"],
          ["Baby-Proofing", "8 months", 200, "⏳ Upcoming"],
          ["First Birthday Party", "12 months", 350, "⏳ Upcoming"],
        ],
      },
      gearChecklist: {
        headers: ["Item", "Category", "Budgeted", "Purchased"],
        rows: [
          ["Stroller", "Travel", 350, 320],
          ["High Chair", "Feeding", 120, 0],
          ["Baby Monitor", "Safety", 150, 150],
          ["Diaper Bag", "Travel", 80, 65],
          ["Play Mat", "Play", 60, 55],
        ],
      },
    },
  },

  "business-pl": {
    monthlyIncome: 8500,
    savingsGoals: [
      { name: "Tax Reserve", target: 12000, saved: 5400 },
      { name: "Equipment Fund", target: 5000, saved: 2800 },
      { name: "Business Expansion", target: 25000, saved: 7200 },
      { name: "Operating Cushion", target: 10000, saved: 4100 },
    ],
    budgetCategories: [
      { name: "Software & Tools", budgetAmount: 450 },
      { name: "Marketing", budgetAmount: 800 },
      { name: "Contractor Payments", budgetAmount: 2000 },
      { name: "Office & Supplies", budgetAmount: 200 },
      { name: "Insurance", budgetAmount: 350 },
      { name: "Professional Services", budgetAmount: 500 },
      { name: "Travel & Meetings", budgetAmount: 300 },
      { name: "Miscellaneous", budgetAmount: 150 },
    ],
    kpiLabels: ["Total Revenue", "Total Expenses", "Net Profit", "Profit Margin"],
    tagline: "Master your freelance income and expenses with ease.",
    problemHook: "Is your business actually profitable?",
    customSections: {
      taxPlanning: {
        headers: ["Quarter", "Revenue", "Tax Rate", "Set Aside"],
        rows: [
          ["Q1 2026", 25500, 0.25, 6375],
          ["Q2 2026", 28200, 0.25, 7050],
          ["Q3 2026", 24800, 0.25, 6200],
          ["Q4 2026", 31000, 0.25, 7750],
        ],
      },
      revenueLog: {
        headers: ["Date", "Client", "Service", "Amount"],
        rows: [
          ["2026-01-05", "Acme Corp", "Consulting", 3500],
          ["2026-01-12", "TechStart Inc", "Development", 4200],
          ["2026-01-20", "LocalBiz LLC", "Design", 1800],
          ["2026-01-28", "CloudNine Co", "Strategy", 2500],
        ],
      },
    },
  },

  "wedding-planner": {
    monthlyIncome: 6700,
    savingsGoals: [
      { name: "Honeymoon Fund", target: 8000, saved: 3200 },
      { name: "Wedding Day Fund", target: 20000, saved: 12500 },
      { name: "Ring Upgrade", target: 3000, saved: 900 },
      { name: "First Home Savings", target: 30000, saved: 8700 },
    ],
    budgetCategories: [
      { name: "Venue & Catering", budgetAmount: 8000 },
      { name: "Photography", budgetAmount: 3500 },
      { name: "Flowers & Decor", budgetAmount: 2000 },
      { name: "Attire & Beauty", budgetAmount: 2500 },
      { name: "Music & Entertainment", budgetAmount: 1500 },
      { name: "Invitations & Paper", budgetAmount: 500 },
      { name: "Transportation", budgetAmount: 600 },
      { name: "Favors & Gifts", budgetAmount: 400 },
    ],
    kpiLabels: ["Total Budget", "Total Spent", "Remaining", "Progress"],
    tagline: "Track your wedding budget and vendors with ease",
    problemHook: "Wedding costs spiraling out of control?",
    customSections: {
      vendorTracker: {
        headers: ["Vendor", "Category", "Quote", "Deposit", "Status"],
        rows: [
          ["Sunset Gardens Venue", "Venue", 12000, 3000, "Deposit Paid"],
          ["Maria Chen Photography", "Photography", 3500, 1000, "Deposit Paid"],
          ["Bloom & Petal Florals", "Flowers", 2200, 500, "Confirmed"],
          ["DJ Soundwave", "Entertainment", 1500, 400, "Deposit Paid"],
          ["Bella Bridal Salon", "Attire", 2800, 800, "In Progress"],
        ],
      },
      guestList: {
        headers: ["Category", "Count", "RSVP"],
        rows: [
          ["Bride's Family", 35, 28],
          ["Groom's Family", 30, 22],
          ["Mutual Friends", 25, 18],
          ["Work Colleagues", 15, 10],
          ["Plus Ones", 20, 12],
        ],
      },
      paymentSchedule: {
        headers: ["Vendor", "Amount", "Due Date", "Paid"],
        rows: [
          ["Sunset Gardens Venue", 4500, "2026-06-01", 3000],
          ["Maria Chen Photography", 1250, "2026-07-15", 1000],
          ["Bloom & Petal Florals", 1100, "2026-08-01", 500],
          ["DJ Soundwave", 550, "2026-08-15", 400],
          ["Bella Bridal Salon", 1000, "2026-05-01", 800],
        ],
      },
      timeline: {
        headers: ["Task", "Due Date", "Status"],
        rows: [
          ["Book venue", "2026-03-01", "✅ Done"],
          ["Send invitations", "2026-05-15", "🟡 In Progress"],
          ["Final dress fitting", "2026-07-20", "⏳ Upcoming"],
          ["Confirm catering menu", "2026-07-01", "⏳ Upcoming"],
          ["Rehearsal dinner", "2026-08-14", "⏳ Upcoming"],
        ],
      },
    },
  },

  "paycheck-budget": {
    monthlyIncome: 3900,
    savingsGoals: [
      { name: "Emergency Fund", target: 10000, saved: 3800 },
      { name: "Car Repair Fund", target: 2000, saved: 1100 },
      { name: "Down Payment", target: 25000, saved: 6200 },
      { name: "Vacation Fund", target: 3000, saved: 1500 },
    ],
    budgetCategories: [
      { name: "Rent / Mortgage", budgetAmount: 1200 },
      { name: "Groceries", budgetAmount: 400 },
      { name: "Utilities", budgetAmount: 200 },
      { name: "Transportation", budgetAmount: 250 },
      { name: "Insurance", budgetAmount: 300 },
      { name: "Debt Payments", budgetAmount: 350 },
      { name: "Subscriptions", budgetAmount: 80 },
      { name: "Personal Spending", budgetAmount: 200 },
    ],
    kpiLabels: ["Take-Home Pay", "Bills & Fixed", "Discretionary", "Remaining"],
    tagline: "Conquer fluctuating income and master your budget.",
    problemHook: "Paycheck gone before the month ends?",
    customSections: {
      billsDueDates: {
        headers: ["Bill", "Amount", "Due Date", "Status"],
        rows: [
          ["Rent", 1200, "1st", "✅ Auto-Pay"],
          ["Electric", 95, "5th", "✅ Auto-Pay"],
          ["Internet", 70, "10th", "✅ Auto-Pay"],
          ["Car Insurance", 150, "15th", "⏳ Due"],
          ["Phone", 65, "18th", "⏳ Due"],
          ["Streaming", 25, "20th", "✅ Auto-Pay"],
        ],
      },
      sinkingFunds: {
        headers: ["Fund", "Target", "Monthly", "Current"],
        rows: [
          ["Car Repairs", 2000, 100, 1100],
          ["Holiday Gifts", 800, 67, 400],
          ["Annual Insurance", 1800, 150, 900],
          ["Home Maintenance", 1500, 125, 625],
        ],
      },
      debtTracker: {
        headers: ["Debt", "Balance", "Rate", "Minimum"],
        rows: [
          ["Credit Card", 3200, 0.199, 95],
          ["Student Loan", 12500, 0.055, 180],
          ["Car Loan", 8400, 0.049, 275],
        ],
      },
    },
  },

  "savings-tracker": {
    monthlyIncome: 4200,
    savingsGoals: [
      { name: "Emergency Fund", target: 10000, saved: 5500 },
      { name: "Travel Fund", target: 5000, saved: 2100 },
      { name: "New Laptop", target: 2000, saved: 1400 },
      { name: "Retirement Boost", target: 15000, saved: 3800 },
    ],
    budgetCategories: [
      { name: "Fixed Bills", budgetAmount: 1500 },
      { name: "Savings Transfer", budgetAmount: 800 },
      { name: "Groceries", budgetAmount: 350 },
      { name: "Entertainment", budgetAmount: 150 },
      { name: "Transport", budgetAmount: 200 },
      { name: "Health", budgetAmount: 100 },
      { name: "Shopping", budgetAmount: 200 },
      { name: "Misc", budgetAmount: 100 },
    ],
    kpiLabels: ["Total Income", "Total Saved", "Remaining", "Savings Rate"],
    tagline: "See exactly where your money goes.",
    problemHook: "Saving feels impossible?",
  },

  "debt-payoff": {
    monthlyIncome: 4800,
    savingsGoals: [
      { name: "Credit Card Payoff", target: 8000, saved: 3200 },
      { name: "Student Loans", target: 25000, saved: 9800 },
      { name: "Emergency Buffer", target: 5000, saved: 2100 },
      { name: "Freedom Fund", target: 10000, saved: 1500 },
    ],
    budgetCategories: [
      { name: "Debt Payments", budgetAmount: 1200 },
      { name: "Rent / Mortgage", budgetAmount: 1100 },
      { name: "Groceries", budgetAmount: 300 },
      { name: "Utilities", budgetAmount: 180 },
      { name: "Transportation", budgetAmount: 200 },
      { name: "Insurance", budgetAmount: 250 },
      { name: "Minimum Lifestyle", budgetAmount: 150 },
      { name: "Extra Debt Payment", budgetAmount: 400 },
    ],
    kpiLabels: ["Total Income", "Total Expenses", "Debt Payment", "Payoff Progress"],
    tagline: "Crush your debt with a clear payoff plan.",
    problemHook: "Drowning in debt payments?",
    customSections: {
      debtAccounts: {
        headers: ["Account", "Balance", "APR", "Minimum", "Extra", "Payoff Date"],
        rows: [
          ["Chase Visa", 3200, 0.199, 95, 150, "2027-04"],
          ["Discover Card", 1800, 0.179, 55, 100, "2027-01"],
          ["Student Loan (Fed)", 12500, 0.055, 180, 0, "2032-06"],
          ["Student Loan (Private)", 8400, 0.079, 210, 50, "2030-08"],
          ["Car Loan", 6200, 0.049, 275, 0, "2028-09"],
        ],
      },
      snowballTracker: {
        headers: ["Month", "Starting Balance", "Payment", "Interest", "Ending Balance"],
        rows: [
          ["Jan 2026", 32100, 1215, 285, 31170],
          ["Feb 2026", 31170, 1215, 276, 30231],
          ["Mar 2026", 30231, 1215, 268, 29284],
          ["Apr 2026", 29284, 1215, 260, 28329],
          ["May 2026", 28329, 1215, 251, 27365],
          ["Jun 2026", 27365, 1215, 243, 26393],
        ],
      },
      milestones: {
        headers: ["Milestone", "Target Date", "Amount", "Status"],
        rows: [
          ["Pay off Discover Card", "Jan 2027", 1800, "🟡 On Track"],
          ["Pay off Chase Visa", "Apr 2027", 3200, "🟡 On Track"],
          ["Debt under $20,000", "Dec 2027", 20000, "⏳ Upcoming"],
          ["Pay off car loan", "Sep 2028", 6200, "⏳ Upcoming"],
          ["100% Debt Free!", "Jun 2032", 0, "⏳ Long-Term"],
        ],
      },
    },
  },

  "side-hustle": {
    monthlyIncome: 6200,
    savingsGoals: [
      { name: "Business Fund", target: 10000, saved: 3600 },
      { name: "Tax Savings", target: 8000, saved: 4200 },
      { name: "Equipment", target: 3000, saved: 1800 },
      { name: "Emergency Fund", target: 5000, saved: 2500 },
    ],
    budgetCategories: [
      { name: "Side Hustle Tools", budgetAmount: 300 },
      { name: "Marketing & Ads", budgetAmount: 500 },
      { name: "Materials / Inventory", budgetAmount: 400 },
      { name: "Platform Fees", budgetAmount: 200 },
      { name: "Day Job Expenses", budgetAmount: 1500 },
      { name: "Living Expenses", budgetAmount: 2000 },
      { name: "Savings", budgetAmount: 600 },
      { name: "Taxes Set-Aside", budgetAmount: 500 },
    ],
    kpiLabels: ["Total Income", "Total Costs", "Net Earnings", "Profit Margin"],
    tagline: "Track your side income and day job in one place.",
    problemHook: "Juggling income from multiple sources?",
    customSections: {
      incomeStreams: {
        headers: ["Source", "Monthly", "YTD", "% of Total"],
        rows: [
          ["Day Job (After Tax)", 3800, 22800, 0.61],
          ["Etsy Shop", 1200, 7200, 0.19],
          ["Freelance Design", 800, 4800, 0.13],
          ["Affiliate Income", 250, 1500, 0.04],
          ["YouTube Ad Revenue", 150, 900, 0.03],
        ],
      },
      taxSetAside: {
        headers: ["Quarter", "Hustle Revenue", "Tax Rate", "Set Aside", "Status"],
        rows: [
          ["Q1 2026", 7200, 0.25, 1800, "✅ Saved"],
          ["Q2 2026", 8100, 0.25, 2025, "🟡 Partial"],
          ["Q3 2026", 6900, 0.25, 1725, "⏳ Upcoming"],
          ["Q4 2026", 9000, 0.25, 2250, "⏳ Upcoming"],
        ],
      },
    },
  },

  "meal-planner": {
    monthlyIncome: 4500,
    savingsGoals: [
      { name: "Grocery Savings", target: 1200, saved: 680 },
      { name: "Kitchen Upgrade", target: 3000, saved: 1100 },
      { name: "Meal Prep Tools", target: 500, saved: 320 },
      { name: "Dining Out Fund", target: 600, saved: 250 },
    ],
    budgetCategories: [
      { name: "Groceries", budgetAmount: 600 },
      { name: "Meal Delivery", budgetAmount: 100 },
      { name: "Dining Out", budgetAmount: 200 },
      { name: "Snacks & Beverages", budgetAmount: 80 },
      { name: "Kitchen Supplies", budgetAmount: 50 },
      { name: "Specialty Items", budgetAmount: 60 },
      { name: "Supplements", budgetAmount: 40 },
      { name: "Coffee & Tea", budgetAmount: 30 },
    ],
    kpiLabels: ["Food Budget", "Total Spent", "Remaining", "% of Budget"],
    tagline: "Plan meals, save money, eat better.",
    problemHook: "Spending too much on food?",
    customSections: {
      weeklyMealPlan: {
        headers: ["Day", "Breakfast", "Lunch", "Dinner", "Snack"],
        rows: [
          ["Monday", "Overnight Oats", "Chicken Salad Wrap", "Salmon & Veggies", "Apple & PB"],
          ["Tuesday", "Smoothie Bowl", "Leftover Salmon", "Beef Stir-Fry", "Yogurt & Granola"],
          ["Wednesday", "Avocado Toast", "Turkey Club", "Pasta Primavera", "Trail Mix"],
          ["Thursday", "Greek Yogurt Parfait", "Grain Bowl", "Chicken Tacos", "Hummus & Veggies"],
          ["Friday", "Pancakes", "Soup & Bread", "Homemade Pizza", "Fruit Salad"],
          ["Saturday", "Eggs Benedict", "Leftover Pizza", "Grilled Chicken", "Cheese & Crackers"],
          ["Sunday", "French Toast", "Cobb Salad", "Slow Cooker Stew", "Popcorn"],
        ],
      },
      groceryList: {
        headers: ["Item", "Category", "Qty", "Est. Cost"],
        rows: [
          ["Chicken Breast (2 lb)", "Protein", 1, 8.99],
          ["Salmon Fillets (4)", "Protein", 1, 12.99],
          ["Ground Beef (1 lb)", "Protein", 1, 6.49],
          ["Mixed Greens", "Produce", 2, 3.99],
          ["Avocados (3)", "Produce", 1, 4.49],
          ["Rice (5 lb)", "Grains", 1, 5.99],
          ["Pasta (2 boxes)", "Grains", 1, 3.49],
          ["Greek Yogurt (32 oz)", "Dairy", 1, 5.49],
          ["Eggs (18 ct)", "Dairy", 1, 4.99],
          ["Olive Oil", "Pantry", 1, 7.99],
        ],
      },
      costPerMeal: {
        headers: ["Meal Type", "Avg Cost", "Homemade", "Savings"],
        rows: [
          ["Breakfast", 3.50, 2.10, 1.40],
          ["Lunch", 8.50, 3.80, 4.70],
          ["Dinner", 14.00, 5.20, 8.80],
          ["Snack", 3.00, 1.20, 1.80],
        ],
      },
    },
  },

  "travel-planner": {
    monthlyIncome: 5000,
    savingsGoals: [
      { name: "Europe Trip Fund", target: 6000, saved: 3200 },
      { name: "Flights & Hotels", target: 4000, saved: 2800 },
      { name: "Activity Fund", target: 1500, saved: 600 },
      { name: "Emergency Travel Fund", target: 2000, saved: 1200 },
    ],
    budgetCategories: [
      { name: "Flights", budgetAmount: 1200 },
      { name: "Hotels & Stays", budgetAmount: 1500 },
      { name: "Activities & Tours", budgetAmount: 600 },
      { name: "Food & Dining", budgetAmount: 500 },
      { name: "Local Transport", budgetAmount: 300 },
      { name: "Shopping & Souvenirs", budgetAmount: 200 },
      { name: "Travel Insurance", budgetAmount: 150 },
      { name: "Miscellaneous", budgetAmount: 100 },
    ],
    kpiLabels: ["Trip Budget", "Total Spent", "Remaining", "Budget Used"],
    tagline: "Plan smarter. Travel better. Stay on budget.",
    problemHook: "Trip always over budget?",
    customSections: {
      itinerary: {
        headers: ["Day", "Activity", "Location", "Est. Cost"],
        rows: [
          ["Day 1", "Arrive & check in", "Hotel Centro", 0],
          ["Day 1", "Walking food tour", "Old Town", 45],
          ["Day 2", "Museum visit", "National Gallery", 25],
          ["Day 2", "Sunset boat cruise", "Marina Bay", 80],
          ["Day 3", "Hiking excursion", "Mountain Trail", 60],
          ["Day 3", "Local dinner", "Seaside Restaurant", 55],
          ["Day 4", "Shopping & souvenirs", "Market Square", 100],
          ["Day 4", "Airport transfer", "Airport", 35],
        ],
      },
      packingChecklist: {
        headers: ["Item", "Category", "Packed"],
        rows: [
          ["Passport", "Documents", "✅"],
          ["Travel Insurance Card", "Documents", "✅"],
          ["Phone Charger", "Electronics", "✅"],
          ["Sunscreen", "Toiletries", "❌"],
          ["Comfortable Shoes", "Clothing", "❌"],
          ["Day Backpack", "Gear", "❌"],
          ["Water Bottle", "Gear", "✅"],
          ["First Aid Kit", "Health", "❌"],
        ],
      },
    },
  },

  "student-budget": {
    monthlyIncome: 2200,
    savingsGoals: [
      { name: "Textbook Fund", target: 800, saved: 450 },
      { name: "Summer Travel", target: 2500, saved: 900 },
      { name: "Emergency Fund", target: 3000, saved: 1200 },
      { name: "Post-Grad Buffer", target: 5000, saved: 1800 },
    ],
    budgetCategories: [
      { name: "Rent / Housing", budgetAmount: 750 },
      { name: "Groceries & Meal Plan", budgetAmount: 300 },
      { name: "Tuition & Fees", budgetAmount: 200 },
      { name: "Textbooks & Supplies", budgetAmount: 80 },
      { name: "Transportation", budgetAmount: 120 },
      { name: "Phone & Internet", budgetAmount: 85 },
      { name: "Social & Entertainment", budgetAmount: 100 },
      { name: "Personal Care", budgetAmount: 50 },
    ],
    kpiLabels: ["Total Income", "Total Expenses", "Remaining", "Savings Rate"],
    tagline: "Budget like a pro while you're still in school.",
    problemHook: "Broke before the semester ends?",
    customSections: {
      semesterCosts: {
        headers: ["Semester", "Tuition", "Books", "Housing", "Meal Plan", "Total"],
        rows: [
          ["Fall 2025", 4200, 380, 4500, 1800, 10880],
          ["Spring 2026", 4200, 420, 4500, 1800, 10920],
          ["Summer 2026", 2100, 150, 2250, 900, 5400],
        ],
      },
      incomeBreakdown: {
        headers: ["Source", "Monthly", "Semester Total", "Notes"],
        rows: [
          ["Part-Time Job", 1200, 6000, "Campus bookstore"],
          ["Financial Aid", 600, 3000, "Disbursed monthly"],
          ["Family Support", 300, 1500, "Monthly transfer"],
          ["Freelance / Gig", 100, 500, "Occasional tutoring"],
        ],
      },
      subscriptionAudit: {
        headers: ["Service", "Monthly Cost", "Category", "Keep?"],
        rows: [
          ["Spotify (Student)", 5.99, "Entertainment", "✅ Yes"],
          ["Netflix", 15.49, "Entertainment", "🟡 Maybe"],
          ["ChatGPT Plus", 20.00, "School", "✅ Yes"],
          ["Gym Membership", 25.00, "Health", "✅ Yes"],
          ["Amazon Prime (Student)", 7.49, "Shopping", "🟡 Maybe"],
          ["Cloud Storage", 2.99, "School", "✅ Yes"],
        ],
      },
    },
  },
};

// Aliases for niche ID variations — maps design profile IDs and config
// sheetsType values to the correct NICHE_DATA key
const ALIASES: Record<string, string> = {
  "pregnancy-planner": "baby-budget",
  "adhd-budget": "paycheck-budget",
  "adhd-planner": "paycheck-budget",
  "travel-budget": "travel-planner",
  "generic-budget": "paycheck-budget",
  "generic": "paycheck-budget",
  "budget_tracker": "paycheck-budget",
  "baby_budget": "baby-budget",
  "wedding_planner": "wedding-planner",
  "business_pl": "business-pl",
  "paycheck_budget": "paycheck-budget",
  "debt_payoff": "debt-payoff",
  "savings_tracker": "savings-tracker",
  "side_hustle": "side-hustle",
  "meal_planner": "meal-planner",
};

/**
 * Get niche-specific data for a product.
 * Falls back to paycheck-budget as the most generic profile.
 */
export function getNicheData(nicheProfileId: string): NicheDataProfile {
  return NICHE_DATA[nicheProfileId]
    || NICHE_DATA[ALIASES[nicheProfileId] || ""]
    || NICHE_DATA["paycheck-budget"]!;
}

/**
 * Get niche-specific savings goals formatted for display.
 */
export function getNicheSavingsGoals(nicheProfileId: string): Array<{
  name: string;
  target: string;
  saved: string;
  progress: string;
}> {
  const data = getNicheData(nicheProfileId);
  return data.savingsGoals.map(g => ({
    name: g.name,
    target: `$${g.target.toLocaleString("en-US")}`,
    saved: `$${g.saved.toLocaleString("en-US")}`,
    progress: `${Math.round((g.saved / g.target) * 100)}%`,
  }));
}

/**
 * Get niche-specific monthly income.
 */
export function getNicheMonthlyIncome(nicheProfileId: string): number {
  return getNicheData(nicheProfileId).monthlyIncome;
}
