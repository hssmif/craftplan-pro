# Pay Yourself First — Budget Tracker (GWS CLI Prompt)

Build me a "Pay Yourself First" budget tracker in Google Sheets with the following structure. This is a premium Etsy digital product — it must look polished, include real charts, and work immediately with sample data.

---

## Tabs

### Tab 1: Dashboard (sheetId: 0)
The main visual overview. Shows monthly income, savings goals, spending by bucket, goal allocation, and charts. Controlled by a month selector dropdown in E3.

### Tab 2: Transactions (sheetId: 1)
Transaction log where the user enters every income and expense entry. Each entry has a date, description, amount, sub-category, category (bucket), and month.

### Tab 3: Budget Setup (sheetId: 2)
Configuration tab where the user sets monthly income, bucket allocation percentages (Savings/Needs/Wants/Bills), and defines savings goals with target amounts and monthly contributions.

### Tab 4: Monthly Summary (sheetId: 3)
Automatic monthly breakdown by bucket. All values calculated via SUMIFS from the Transactions tab. Shows Income, Savings, Needs, Wants, Bills, and Net for each month.

### Tab 5: Savings Goals (sheetId: 4)
Detailed savings goal tracker with target, saved, remaining, progress percentage, and status indicators.

### Tab 6: Setup & Instructions (sheetId: 5)
Welcome tab with clear instructions on how to use the spreadsheet, tab descriptions, and delivery steps for Google Sheets.

### Tab 7 (Hidden): Reference (sheetId: 6)
Hidden helper tab with dropdown option lists for months, buckets, and categories.

---

## Column Definitions

### Tab 1: Dashboard

Row 1: Merged A1:K1 — Title: "💰 PAY YOURSELF FIRST — BUDGET DASHBOARD"
Row 2: Merged A2:K2 — Subtitle: "Monthly Budget Tracker"
Row 3: Controls row
- B3: Label "📅 SELECT MONTH"
- C3: Dropdown (month selector) — default "January", sourced from Reference!A2:A13
- H3: Label "💰 MONTHLY INCOME"
- I3: Formula `='Budget Setup'!C3` (pulls monthly income)

Rows 5-6: KPI metric cards (merged cells)
- B5:C6 — "TOTAL INCOME" + formula `=SUMIFS(Transactions!D:D, Transactions!G:G, "Income", Transactions!H:H, C3)`
- D5:E6 — "TOTAL SPENT" + formula `=SUMIFS(Transactions!D:D, Transactions!G:G, "<>Income", Transactions!H:H, C3)`
- G5:H6 — "NET SAVINGS" + formula `=B6-D6`
- I5:J6 — "SAVINGS RATE" + formula `=IF(B6>0, (B6-D6)/B6, 0)` formatted as percentage

Rows 8-15: Left section — SAVINGS GOALS
- Row 8: Merged B8:F8 — Section header "🎯 SAVINGS GOALS" (rose background #CC6666)
- Row 9: Headers — Goal | Target | Saved | Remaining | Progress
- Rows 10-14: 5 goal rows pulling from 'Savings Goals' tab
  - B: `='Savings Goals'!B{row}`
  - C: `='Savings Goals'!C{row}` (Target)
  - D: `='Savings Goals'!D{row}` (Saved)
  - E: `='Savings Goals'!E{row}` (Remaining = Target - Saved)
  - F: Progress bar using `=SPARKLINE('Savings Goals'!F{row}, {"charttype","bar";"max",1;"color1","#22c55e";"color2","#1e293b"})`
- Row 15: TOTAL row with SUM formulas

Rows 8-15: Right section — WHERE YOUR MONEY WENT
- Row 8: Merged H8:L8 — Section header "💳 WHERE YOUR MONEY WENT" (navy #1B3A5C)
- Row 9: Headers — Category | Budgeted | Spent | Left | Status
- Rows 10-13: 4 bucket rows (Savings, Needs, Wants, Bills)
  - H: Bucket name
  - I: Budgeted — `='Budget Setup'!D{row}` (allocation $ amount)
  - J: Spent — `=SUMIFS(Transactions!D:D, Transactions!G:G, H{row}, Transactions!H:H, $C$3)`
  - K: Left — `=I{row}-J{row}`
  - L: Status — `=IF(J{row}=0,"—",IF(J{row}<=I{row},"✅ On Track",IF(J{row}<=I{row}*1.15,"⚠️ "&TEXT(J{row}/I{row},"0%"),"🔴 Over")))`
- Row 14: TOTAL SPENT row

Rows 17-23: GOAL ALLOCATION
- Row 17: Section header "📊 MY GOAL ALLOCATION"
- Row 18: Headers — Bucket | % Goal | $ Goal | % Actual | $ Actual
- Rows 19-22: 4 bucket rows
  - B: Bucket name
  - C: % Goal from Budget Setup
  - D: $ Goal = % * income
  - E: % Actual = spent / income
  - F: $ Actual = spent amount
- Row 23: TOTAL row

Rows 25-26: Chart placeholder area (charts anchored here)

### Tab 2: Transactions

| Column | Header | Type | Details |
|--------|--------|------|---------|
| A | # | Auto-number | Row number |
| B | Date | Date | Format: YYYY-MM-DD |
| C | Description | Text | Free text |
| D | Amount | Currency | Format: $#,##0.00 |
| E | Sub-Category | Text | e.g., Rent, Groceries, Coffee |
| F | Category | Dropdown | Strict: Income, Savings, Needs, Wants, Bills |
| G | Bucket | Text | Same as Category (for backward compat) |
| H | Month | Dropdown | Strict: January through December, from Reference tab |

### Tab 3: Budget Setup

Row 3: Monthly Income input
- B3: Label "💰 MONTHLY INCOME"
- C3: Number input (default: 4200), format $#,##0.00

Rows 5-10: Bucket Allocation
- Row 5: Section header "📊 BUCKET ALLOCATION"
- Row 6: Headers — Bucket | % of Income | $ Amount
- Rows 7-10: Savings (25%), Needs (35%), Wants (20%), Bills (20%)
  - D{row}: `=C{row}/100*$C$3`
- Row 11: TOTAL with SUM

Rows 13-19: Savings Goals
- Row 13: Section header "🎯 SAVINGS GOALS"
- Row 14: Headers — Goal | Target | Monthly Contribution
- Rows 15-19: 5 goals
  - Emergency Fund ($5,000, $400/mo)
  - Travel Fund ($3,500, $200/mo)
  - Retirement Roth IRA ($6,500, $250/mo)
  - High-Yield Savings ($2,000, $150/mo)
  - Sinking Fund Car/Tech ($1,500, $100/mo)

### Tab 4: Monthly Summary

| Column | Header | Type | Details |
|--------|--------|------|---------|
| A | # | Number | Row number |
| B | Month | Text | January through December |
| C | Income | Formula | `=SUMIFS(Transactions!D:D, Transactions!F:F, "Income", Transactions!H:H, B{row})` |
| D | Savings | Formula | `=SUMIFS(Transactions!D:D, Transactions!G:G, "Savings", Transactions!H:H, B{row})` |
| E | Needs | Formula | `=SUMIFS(Transactions!D:D, Transactions!G:G, "Needs", Transactions!H:H, B{row})` |
| F | Wants | Formula | `=SUMIFS(Transactions!D:D, Transactions!G:G, "Wants", Transactions!H:H, B{row})` |
| G | Bills | Formula | `=SUMIFS(Transactions!D:D, Transactions!G:G, "Bills", Transactions!H:H, B{row})` |
| H | Net | Formula | `=C{row}-D{row}-E{row}-F{row}-G{row}` |

Row 15: TOTAL row with SUM for each column.

### Tab 5: Savings Goals

| Column | Header | Type | Details |
|--------|--------|------|---------|
| A | # | Number | 1-5 |
| B | Goal Name | Text | From Budget Setup |
| C | Target | Currency | From Budget Setup |
| D | Saved | Currency | User updates monthly |
| E | Remaining | Formula | `=C{row}-D{row}` |
| F | Progress | Formula | `=IF(C{row}>0, D{row}/C{row}, 0)` format 0% |
| G | Status | Formula | `=IF(F{row}>=1,"✅ Funded",IF(F{row}>=0.5,"⏳ Halfway","🚀 In Progress"))` |

Sample data:
- Emergency Fund: $5,000 target, $1,100 saved
- Travel Fund: $3,500 target, $800 saved
- Retirement: $6,500 target, $2,500 saved
- High-Yield: $2,000 target, $900 saved
- Sinking Fund: $1,500 target, $600 saved

### Tab 7 (Hidden): Reference

- A1:A13 — Month names: (header) Month, January, February, ... December
- B1:B6 — Bucket names: (header) Bucket, Income, Savings, Needs, Wants, Bills
- C1:C20 — Sub-categories: Salary, Freelance, Emergency, Travel, Retirement, HY Savings, Car/Tech, Rent, Groceries, Gas, Insurance, Health, Coffee, Amazon, Nails, Shopping, Internet, Streaming, Phone, Student Loans, Gym

---

## Sample Data (Transactions Tab)

Include 20 sample transactions for January across all buckets:

```
2026-01-01, Monthly salary, 4200, Salary, Income, Income, January
2026-01-02, Emergency Fund, 400, Emergency, Savings, Savings, January
2026-01-02, Roth IRA contribution, 250, Retirement, Savings, Savings, January
2026-01-02, High-yield savings, 150, HY Savings, Savings, Savings, January
2026-01-02, Travel fund, 200, Travel, Savings, Savings, January
2026-01-02, Sinking fund (car), 100, Car/Tech, Savings, Savings, January
2026-01-03, Rent payment, 1200, Rent, Needs, Needs, January
2026-01-05, Whole Foods groceries, 62, Groceries, Needs, Needs, January
2026-01-10, Gas fill up, 45, Gas, Needs, Needs, January
2026-01-14, Car insurance, 145, Insurance, Needs, Needs, January
2026-01-20, Therapy session, 40, Health, Needs, Needs, January
2026-01-06, Starbucks, 32.50, Coffee, Wants, Wants, January
2026-01-08, Amazon phone case, 22, Amazon, Wants, Wants, January
2026-01-12, Nail appointment, 50, Nails, Wants, Wants, January
2026-01-18, Target run, 55, Shopping, Wants, Wants, January
2026-01-01, Internet, 59.99, Internet, Bills, Bills, January
2026-01-01, Netflix + Spotify, 32.48, Streaming, Bills, Bills, January
2026-01-05, Phone plan, 85, Phone, Bills, Bills, January
2026-01-15, Student loans, 280, Loans, Bills, Bills, January
2026-01-20, Gym membership, 45, Gym, Bills, Bills, January
```

---

## Visual Design

### Color Palette
- **Navy (headers, primary):** #1B3A5C
- **Gold (accent, highlights):** #D4AF37
- **Rose (savings goals header):** #CC6666
- **Green (positive/on track):** #22C55E
- **Red (negative/over):** #EF4444
- **Warning (caution):** #F59E0B
- **Dark background:** #0F172A
- **Card background:** #162033
- **Alt row:** #1E293B
- **White text:** #F8FAFC
- **Muted text:** #94A3B8

### Header Styling
- Row 1 (title): Background #1B3A5C, text white, bold, 16pt, merged across full width
- Section headers: Background matches semantic color, white text, bold, 12pt
- Column headers: Background #1B3A5C, white text, bold, 10pt
- KPI value cells: Bold, 18pt, color-coded (green for income, red for expenses, gold for savings)

### Body Styling
- Default: 10pt Arial, text color #F8FAFC on dark background
- Alternating rows: #162033 / #0F172A
- Currency: $#,##0.00
- Percentage: 0%
- Date: YYYY-MM-DD

### Column Widths (Dashboard)
- A: 30px (spacer)
- B-F: 140px each
- G: 30px (spacer between sections)
- H-L: 140px each

---

## Charts

### Chart 1: Donut — "Savings Goal Progress"
- Type: PIE with pieHole: 0.5 (donut)
- Data: Savings Goals tab — Goal Names (B3:B7) vs Saved amounts (D3:D7)
- Colors: #22C55E, #EF4444, #F59E0B, #60A5FA, #A78BFA (one per goal)
- Position: Dashboard tab, anchored at B25, 500x400 pixels
- Title: "Savings Goal Progress"
- Legend: BOTTOM

### Chart 2: Donut — "Where My Money Went"
- Type: PIE with pieHole: 0.5 (donut)
- Data: Dashboard — Bucket names (H10:H13) vs Spent amounts (J10:J13)
- Colors: #22C55E (Savings), #EF4444 (Needs), #F59E0B (Wants), #60A5FA (Bills)
- Position: Dashboard tab, anchored at G25, 500x400 pixels
- Title: "Where My Money Went"
- Legend: BOTTOM

### Chart 3: Bar — "Goal vs Actual by Bucket"
- Type: COLUMN (grouped, not stacked)
- Data: Dashboard allocation — Bucket names (B19:B22), $ Goal (D19:D22), $ Actual (F19:F22)
- Colors: #1B3A5C (Goal), #D4AF37 (Actual)
- Position: Dashboard tab, anchored at B32, 900x400 pixels
- Title: "Goal vs Actual by Bucket"
- Legend: TOP

---

## Conditional Formatting

### Dashboard — Status column (L10:L13)
1. Text contains "On Track" → background #22C55E20 (light green), text #22C55E
2. Text contains "⚠️" → background #F59E0B20 (light amber), text #F59E0B
3. Text contains "Over" → background #EF444420 (light red), text #EF4444
4. Text contains "Funded" → background #60A5FA20 (light blue), text #60A5FA

### Dashboard — Net/Left values (K10:K13)
1. NUMBER_LESS than 0 → text #EF4444 (red)
2. NUMBER_GREATER than 0 → text #22C55E (green)

### Savings Goals — Progress column (F3:F7)
1. Color scale: 0% = #EF4444, 50% = #F59E0B, 100% = #22C55E

### Transactions — Category column (F2:F200)
1. TEXT_EQ "Income" → background #22C55E20
2. TEXT_EQ "Savings" → background #60A5FA20
3. TEXT_EQ "Needs" → background #F59E0B20
4. TEXT_EQ "Wants" → background #A78BFA20
5. TEXT_EQ "Bills" → background #EF444420

---

## Data Validation

### Dashboard C3 (Month Selector)
- Type: ONE_OF_LIST
- Values: From Reference!A2:A13
- Strict: true

### Transactions F2:F200 (Category/Bucket)
- Type: ONE_OF_LIST
- Values: Income, Savings, Needs, Wants, Bills
- Strict: true

### Transactions H2:H200 (Month)
- Type: ONE_OF_LIST
- Values: From Reference!A2:A13
- Strict: true

---

## Frozen Rows/Columns

- Dashboard: Freeze rows 1-3 (title + subtitle + controls stay visible)
- Transactions: Freeze row 1 (header)
- Budget Setup: Freeze row 1
- Monthly Summary: Freeze row 1
- Savings Goals: Freeze row 1

---

## Requirements

- All formulas must be native Google Sheets (no Apps Script)
- Dashboard must update dynamically when the month selector (C3) changes
- Dropdowns must be sourced from the hidden Reference tab
- IFERROR wrapping on all cross-sheet formulas
- Sample data must exercise all conditional formatting rules
- Charts must populate correctly with the sample data
- Sheet tab colors: Dashboard=#1B3A5C, Transactions=#94A3B8, Budget Setup=#D4AF37, Monthly Summary=#22C55E, Savings Goals=#CC6666, Setup=#475569, Reference=#333333
