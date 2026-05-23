# PREMIUM TEMPLATE BLUEPRINT v1.0
## CraftPlan Digital — Etsy-Ready Template Specification

> This document defines every upgrade needed to go from "good auto-generated template"
> to "premium Etsy product indistinguishable from Planifest / Gridfiti / The Notion Bar".
> Every item is a builder rule — not a manual edit.

---

## A) Premium Visual Layer

### A1. Cover Image System

**Current state**: `buildVisualIdentity()` picks a random Unsplash URL. The build route passes it as `cover.external.url`. Notion silently drops covers when the URL returns a redirect or non-image content-type.

**Fix**: Replace raw Unsplash URLs with **direct-access image URLs** that Notion accepts reliably.

**Rules**:

| Parameter | Rule |
|-----------|------|
| `source` | Use `images.unsplash.com/photo-{id}?w=1500&q=80&fm=jpg` (explicit jpg format forces direct image) |
| `fallback` | If primary fails, builder retries with a solid-color gradient from `https://www.notion.so/images/page-cover/gradients_XX.png` (Notion's built-in covers) |
| `dimensions` | 1500×600 minimum. Crop mode: `fit=crop&crop=center` |
| `category_map` | Each `templateType` maps to a cover category (unchanged from current `AESTHETIC_TO_COVER_CATEGORY`) |
| `deterministic` | Use `hash(templateName) % pool.length` instead of `Math.random()` — same template name always gets same cover for reproducible mockups |

**New `NOTION_BUILTIN_COVERS` constant** (zero external dependency fallback):
```
gradients_2.png  — warm beige (life_planner, wedding)
gradients_3.png  — cool blue (student, finance)
gradients_5.png  — dark slate (dark aesthetic)
gradients_8.png  — sage green (wellness, fitness)
gradients_10.png — soft purple (adhd, pastel)
gradients_11.png — warm pink (pink aesthetic)
```

**Builder parameter**: `visual.coverMode: "unsplash" | "notion_builtin" | "custom_url"`

---

### A2. Page Icon Rules

**Current state**: Works. Emoji icon passed correctly.

**Rule**: No change needed. Keep `config.icon` → `spec.icon`.

---

### A3. Full-Width Layout Flag

**Current state**: Templates render at Notion's default content width (~720px). Premium sellers use full-width pages.

**Fix**: The Notion API does NOT support setting page width programmatically. However, the **onboarding guide** should include a step:

> "Click ••• (top-right) → Toggle 'Full width' for the best experience"

**Builder rule**: `onboarding.steps[0]` is ALWAYS the full-width instruction for every template. Hardcoded, not AI-generated.

---

## B) Navigation System Rules

### B1. The Wrapping Problem

**Current state**: `generateNavigationBar()` creates one `column_list` with N columns (one per tab). At 7+ tabs, column width < label width → vertical letter stacking.

**Root cause**: Notion column_list distributes width equally. 7 columns = ~100px each. "Productivity" needs ~110px minimum.

### B2. Navigation Rules (REPLACES current logic)

| Rule | Value |
|------|-------|
| `maxTabsPerRow` | **5** (hard cap) |
| `labelMaxChars` | **8** characters. Truncate or abbreviate longer labels. |
| `overflow_strategy` | If `tabs.length > 5`: switch to `callout_bar` style (single-line inline) |
| `abbreviation_map` | `"Productivity" → "Tasks"`, `"Self Care" → "Wellness"`, `"Subscriptions" → "Subs"`, `"Inspiration" → "Inspo"` |
| `home_tab` | Always first. Always highlighted with `accentColor_background`. |
| `style_selection` | `tabs.length <= 5` → `column_tabs`. `tabs.length > 5` → `callout_bar`. |

### B3. `callout_bar` Rendering Fix

**Current state**: `callout_bar` joins all tabs with `" | "` in a single callout. This works but looks flat.

**Upgrade**: Render as a **2-row column_list** (row 1: first 4 tabs, row 2: remaining tabs). Each column contains a mini callout with just `icon + short_label`. This keeps the visual tab aesthetic but avoids the 7-column squeeze.

**Generator pseudo-logic**:
```
if tabs.length <= 5:
  → single column_list, one column per tab (current "column_tabs")
elif tabs.length <= 10:
  → row 1: column_list with tabs[0..4]
  → row 2: column_list with tabs[5..9]
else:
  → callout_bar single-line (edge case only)
```

### B4. Navigation Config Parameter

```typescript
navigation: {
  enabled: boolean;
  tabs: NavTab[];
  style: "column_tabs" | "callout_bar" | "auto";  // ADD "auto"
  maxTabsPerRow: number;   // ADD — default 5
  labelMaxChars: number;   // ADD — default 8
}
```

When `style: "auto"`, the generator picks the optimal layout based on tab count.

---

## C) KPI System Definition

### C1. Current State

All KPI cards use `valueType: "static"` with hardcoded text values rendered as callout blocks. The `valueType` field supports `"formula"` and `"database_count"` but neither is implemented — both paths fall through to the same static text render.

### C2. KPI Architecture (3 Tiers)

**Tier 1: Static Display KPIs** (current — keep as-is for v1)
- Rendered as callout blocks with hardcoded numbers
- Buyer sees "what it would look like" with real data
- Zero Notion API dependency beyond blocks

**Tier 2: Rollup-Driven KPIs** (target — requires builder changes)
- Create a hidden "Dashboard Config" database with 1 row
- Add rollup properties that count/sum from linked databases
- KPI callout text references the rollup value via a formula
- Buyer's KPIs update automatically when they add data

**Tier 3: Formula-Only KPIs** (lightweight alternative to Tier 2)
- No extra database
- KPI values described in onboarding: "Your stats update when you use the template"
- Static display numbers chosen to look realistic for mockup screenshots

### C3. Which KPIs Per Template Type

| Template Type | KPI 1 | KPI 2 | KPI 3 | KPI 4 |
|---------------|-------|-------|-------|-------|
| `life_planner` | 🎯 Goals Active | 💪 Habit Streak | 📖 Books Read | 📝 Journal Streak |
| `adhd_planner` | ✅ Tasks Done | 🔥 Focus Streak | 🍅 Focus Hours | 📊 Day Score |
| `finance_tracker` | 💰 Net Income | 💸 Expenses | 🎯 Savings Rate | 📊 Budget Status |
| `student_planner` | 📊 GPA | 📝 Due This Week | 📖 Study Hours | ✅ Completion % |
| `fitness_tracker` | 🏋️ Workouts/Week | 🔥 Streak | 📏 Weight Trend | 🎯 Goal Progress |
| `wedding_planner` | 📅 Days Until | ✅ Tasks Done | 💰 Budget Used | 👥 RSVPs |

### C4. Rollup KPI Implementation Spec (Tier 2 — for future build)

**New hidden database**: `_dashboard_config`
- 1 row only, titled "Dashboard"
- Properties:
  - Relation to each main DB (Tasks, Goals, Habits, etc.)
  - Rollup: `count(Tasks where Status = "Done")` → "Tasks Done"
  - Rollup: `count(Goals where Status = "Active")` → "Goals Active"
  - Formula: combines rollups into display string

**Builder parameter**:
```typescript
kpiCards: KPICard[] // existing
kpiMode: "static" | "rollup" | "formula_only"  // ADD
```

**v1 decision**: Ship with `kpiMode: "static"`. Static values are chosen to match the demo data story arc. Numbers must be internally consistent (e.g., if Habits DB has 3 rows with streak 2/3/7, the KPI says "7 days" for best streak).

### C5. KPI Value Consistency Rules

| KPI | Source | Derivation Rule |
|-----|--------|-----------------|
| Goals Active | `goals` DB | Count of sample rows where status ≠ "Completed" |
| Habit Streak | `habits` DB | Max `streak` value from sample data |
| Books Read | `resources` DB | `"{count_read}/{target}"` — target = `historyDays / 30 * 4` |
| Tasks Done | `tasks` DB | Count of sample rows where status = "Done" or "Complete" / total |
| Focus Hours | `focus_sessions` DB | Sum of `duration` / 60, rounded |
| Net Income | `transactions` DB | Sum where type = "Income" minus sum where type = "Expense" |

**Builder rule**: After generating sample data, a `computeKPIValues()` function scans the sample data and overwrites the static KPI values to match. This eliminates the mismatch between "6 Goals Active" in the KPI and the actual 3 goals in the database.

---

## D) Demo Data Rules

### D1. Date Freshness

**Current state**: AI generates dates like `"July 20, 2024"` — hardcoded in the past.

**Fix**: All dates in sample data must be **relative to build time**.

**Date generation rules**:

| Date Category | Offset Rule | Example (if built Feb 28, 2026) |
|---------------|-------------|----------------------------------|
| Recent tasks | `today - random(0, 7)` days | Feb 21–28, 2026 |
| Upcoming due dates | `today + random(1, 14)` days | Mar 1–14, 2026 |
| Past completions | `today - random(7, 30)` days | Jan 29–Feb 21, 2026 |
| Goal start dates | `today - random(14, 60)` days | Dec 30–Feb 14 |
| Habit "last checked" | `today - random(0, 2)` days | Feb 26–28, 2026 |
| Transaction dates | `today - random(0, 30)` days, spread evenly | Jan 29–Feb 28 |

**Builder parameter**: None needed. The `aiPlanToNotionSpec()` or `applyPremiumFramework()` post-processes all date fields automatically using `new Date()` at build time.

### D2. Date Format

**Rule**: Always ISO 8601 for the Notion API: `"2026-02-28"`. Never `"July 20, 2024"` strings — those fail Notion date property parsing.

### D3. Progress Storytelling

Sample data must tell a **coherent story** visible in the mockup screenshot:

| Story Element | Rule |
|---------------|------|
| Mix of statuses | Never all "Not started". Always: 40% complete, 30% in progress, 30% not started |
| Streak variety | At least one habit with streak ≥ 7 (shows the feature works) |
| Price variety | Transactions range from small ($8.50) to large ($1,500). Never all similar amounts. |
| Name realism | Task names reference real activities ("Prepare quarterly report", "Buy groceries") — never "Task 1" |
| Cross-references | If Tasks has a "Related Project" relation, at least 1 task should be named to match a project |

### D4. Sample Data Count Rules

| Database Type | Min Rows | Max Rows | Default |
|---------------|----------|----------|---------|
| Primary (tasks, transactions) | 3 | 8 | 5 |
| Secondary (goals, projects) | 3 | 5 | 3 |
| Tracker (habits, workouts) | 3 | 5 | 3 |
| Config (accounts, budgets) | 2 | 4 | 3 |
| Capture (brain dump, notes) | 2 | 5 | 3 |

---

## E) Builder Inputs

### E1. Required Parameters (what CraftPlan MUST pass to build ANY template)

```typescript
interface BuilderInput {
  // Identity (from AI plan or manual config)
  templateName: string;           // "The Ultimate Life Planner & Dashboard"
  templateType: string;           // "life_planner"
  icon: string;                   // "✨"
  aesthetic: string;              // "minimal" | "dark" | "brown" | "sage" | "pink" | "pastel" | "mono"

  // Notion connection
  notionToken: string;
  parentPageId: string;

  // Premium toggle
  premium: boolean;               // true = apply full framework

  // Source: one of these
  opportunityPlan?: AITemplatePlan;  // from AI generation pipeline
  templateId?: string;               // from pre-built template library
  premiumConfig?: PremiumConfig;     // direct config override
}
```

### E2. Derived Parameters (builder computes from inputs)

| Parameter | Derived From | Logic |
|-----------|-------------|-------|
| `visual.coverUrl` | `aesthetic` + `templateType` | `buildVisualIdentity()` → deterministic cover selection |
| `navigation.tabs` | `templateType` OR `opportunityPlan.navigationTabs` | Preset lookup or AI-provided, capped to label rules |
| `navigation.style` | `tabs.length` | Auto-select: ≤5 → column_tabs, >5 → split rows |
| `kpiCards` | `templateType` + sample data | Preset KPIs with values computed from actual sample data |
| `demoData.dates` | `Date.now()` | All dates offset from build time |
| `onboarding.steps[0]` | Always | Full-width instruction (hardcoded) |

### E3. AI Plan → Builder Translation

The AI plan from `/api/opportunities/generate` produces a raw JSON. The translation chain:

```
AITemplatePlan (Gemini output)
    ↓ aiPlanToNotionSpec()      — converts to base NotionTemplateSpec
    ↓ buildPremiumConfig()      — generates PremiumConfig from type+aesthetic
    ↓ applyPremiumFramework()   — wraps base spec with premium layers
    ↓ POST /api/notion/build    — executes against Notion API
```

**Key translation rules**:
- AI property type `"status"` → `"select"` (Notion API doesn't support status via API)
- AI property type `"files"` → `"url"` (simplification)
- Relation properties injected from `plan.relations[]`, not from individual property defs
- Formula expressions from `plan.formulas[]` merged by `"DB.Property"` key
- Sample data from `plan.sampleData[]` merged by database name

---

## F) What Changes from "Good" → "Etsy-Premium"

### F1. Cover Image (BROKEN → FIXED)

| Before | After |
|--------|-------|
| Unsplash URL with redirect → Notion silently drops | Direct-format URL with `?fm=jpg` + Notion built-in fallback |
| Random cover per build | Deterministic: same template name = same cover |
| No cover visible in screenshot | Cover always visible — verified by URL format |

**Implementation**: Modify `buildVisualIdentity()` to append `&fm=jpg` to all Unsplash URLs. Add `NOTION_BUILTIN_COVERS` fallback map. Use hash-based selection.

### F2. Navigation Bar (WRAPPING → CLEAN)

| Before | After |
|--------|-------|
| 7 columns = vertical letter stacking | Max 5 columns per row |
| Labels like "Productivity" overflow | Labels capped at 8 chars with abbreviation map |
| Fixed `column_tabs` style always | `style: "auto"` selects optimal layout |
| Single row always | Multi-row split for 6+ tabs |

**Implementation**: Modify `generateNavigationBar()` to implement row-splitting and label truncation. Add `maxTabsPerRow` and `labelMaxChars` to navigation config.

### F3. KPI Values (RANDOM → CONSISTENT)

| Before | After |
|--------|-------|
| Hardcoded "6 goals, 12 day streak" regardless of data | Values computed from actual sample data |
| KPI says "4/12 books" but no books DB exists | KPIs only reference databases that exist in the spec |
| No validation | `computeKPIValues()` post-process ensures consistency |

**Implementation**: Add `computeKPIValues(kpiCards, databases)` function that scans sample data and overwrites static values. Called after sample data is finalized, before premium framework applies.

### F4. Dates (STALE → FRESH)

| Before | After |
|--------|-------|
| `"July 20, 2024"` hardcoded by AI | Relative dates computed at build time |
| Mixed format strings | Always ISO 8601 `"2026-02-28"` |
| All dates clustered in same week | Spread across past 30 days with intentional gaps |

**Implementation**: Add `freshenDates(databases, buildDate)` function in the premium framework. Runs after `aiPlanToNotionSpec()`, before `applyPremiumFramework()`. Scans all `sampleData` for date-typed properties and replaces values with offset dates.

### F5. Onboarding (GOOD → BETTER)

| Before | After |
|--------|-------|
| 5 generic steps | Step 0 always = "Enable full width" |
| No time estimate validation | Total time shown in summary callout (already works) |

**Implementation**: Prepend hardcoded step to `onboarding.steps[]` in `buildPremiumConfig()`.

### F6. Quick Actions Section (PRESENT → REMOVED from default)

| Before | After |
|--------|-------|
| ⚡ Quick Actions row with callout buttons | Removed from default section order |
| Adds visual noise between KPI and content | Databases listed below serve as navigation |

**Rationale**: The "Quick Actions" callout buttons don't link anywhere (Notion API can't create internal links to databases). They add 3-4 non-functional blocks that look clickable but aren't. Remove from `dashboard.sections` default order. Keep the generator available for manual inclusion.

**Implementation**: Remove `action_buttons` from the default `sections[]` array in `buildPremiumConfig()` and `aiPlanToPremiumConfig()`.

### F7. Database Preview Sections (REMOVED from default)

| Before | After |
|--------|-------|
| `aiPlanToPremiumConfig()` adds 6 DB preview sections | No DB preview sections in dashboard |
| Creates callout cards that duplicate what's in the DB | Databases accessible via page tree (sidebar) |

**Rationale**: Database preview callout cards are static snapshots — they don't update when the user changes data. Real Notion templates use **linked database views** (which the API doesn't support for inline rendering) or simply rely on the database list in the page tree. The preview sections add 18+ blocks of noise.

**Implementation**: Remove the `for (const db of plan.databases.slice(0, 6))` loop from `aiPlanToPremiumConfig()`.

### F8. Welcome Section (EXISTS → ENHANCED)

| Before | After |
|--------|-------|
| Generic "⚡ Welcome!" callout | Themed welcome with template-specific message |
| Same text for all templates | Dynamic: "Welcome to your {templateName}! {1-line value prop}" |

**Implementation**: The welcome callout text in `aiPlanToNotionSpec()` should use template name. Already partially done — just needs the value prop line from `etsyListing.description` first sentence.

---

## Summary: Implementation Priority

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| **P0** | F4: Date freshening | Small | High — stale dates look broken |
| **P0** | F1: Cover image fix | Small | High — no cover = amateur |
| **P1** | F2: Nav bar row splitting | Medium | High — wrapping kills first impression |
| **P1** | F3: KPI consistency | Medium | Medium — numbers should match data |
| **P2** | F6: Remove Quick Actions default | Tiny | Medium — cleaner dashboard |
| **P2** | F7: Remove DB preview default | Tiny | Medium — less noise |
| **P2** | F5: Onboarding full-width step | Tiny | Low — nice to have |

Total estimated implementation: ~400 lines of code changes across 2 files
(`premium-template-framework.ts` and `notion/build/route.ts`).
