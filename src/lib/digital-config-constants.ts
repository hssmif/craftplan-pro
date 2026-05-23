// ══════════════════════════════════════════════════════════════
// Digital Config Constants
// Single source of truth for all valid config values.
// Shared by: ConfigurePanel (UI), auto-infer API (prompt + validation)
// ══════════════════════════════════════════════════════════════

export const NOTION_TEMPLATE_TYPES = [
  { value: "finance_tracker", label: "Finance Tracker" },
  { value: "adhd_planner", label: "ADHD Planner" },
  { value: "life_planner", label: "Life Planner" },
  { value: "social_media_planner", label: "Social Media Planner" },
  { value: "habit_tracker", label: "Habit Tracker" },
  { value: "reading_log", label: "Reading Log" },
] as const;

export const NOTION_AESTHETICS = [
  { value: "minimal", label: "Minimal" },
  { value: "brown", label: "Brown / Warm" },
  { value: "pink", label: "Pink / Soft" },
  { value: "dark", label: "Dark Mode" },
  { value: "colorful", label: "Colorful" },
] as const;

export const PDF_PLANNER_TYPES = [
  { value: "daily", label: "Daily Planner" },
  { value: "weekly", label: "Weekly Planner" },
  { value: "monthly", label: "Monthly Planner" },
  { value: "budget", label: "Budget Planner" },
  { value: "fitness", label: "Fitness Planner" },
  { value: "self_care", label: "Self-Care Planner" },
  { value: "business", label: "Business Planner" },
  { value: "student", label: "Student Planner" },
] as const;

export const EXCEL_TRACKER_TYPES = [
  { value: "budget", label: "Budget Tracker" },
  { value: "habit", label: "Habit Tracker" },
  { value: "fitness", label: "Fitness Tracker" },
  { value: "business", label: "Business Tracker" },
  { value: "meal_planner", label: "Meal Planner" },
  { value: "project", label: "Project Timeline" },
] as const;

export const PRINTABLE_TYPES = [
  { value: "quote_prints", label: "Quote Prints" },
  { value: "habit_tracker", label: "Habit Tracker" },
  { value: "gratitude_journal", label: "Gratitude Journal" },
  { value: "goal_worksheet", label: "Goal Worksheet" },
  { value: "meal_planner", label: "Meal Planner" },
  { value: "budget_worksheet", label: "Budget Worksheet" },
] as const;

export const SHEETS_TYPES = [
  { value: "budget_tracker", label: "Monthly Budget Tracker" },
  { value: "paycheck_budget", label: "Paycheck Budget Planner" },
  { value: "business_pl", label: "Business P&L Tracker" },
] as const;

export const COLOR_SCHEMES = [
  { value: "sage-green", label: "Sage Green" },
  { value: "dusty-rose", label: "Dusty Rose" },
  { value: "navy-gold", label: "Navy & Gold" },
  { value: "minimal-black", label: "Minimal Black" },
  { value: "ocean", label: "Ocean Blue" },
  { value: "lavender", label: "Lavender" },
  { value: "terracotta", label: "Terracotta" },
] as const;

export const SHEETS_COLOR_SCHEMES = [
  { value: "sage-green", label: "Sage Green" },
  { value: "dusty-rose", label: "Dusty Rose" },
  { value: "navy-gold", label: "Navy & Gold" },
  { value: "minimal-black", label: "Minimal Black" },
  { value: "lavender", label: "Lavender" },
  { value: "sheets-green", label: "Sheets Green (Google)" },
] as const;

// Helper: extract just the value strings for validation
export function getValidValues(items: ReadonlyArray<{ value: string }>): string[] {
  return items.map((i) => i.value);
}
