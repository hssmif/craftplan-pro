# Approved plan → Codex implementation prompt

Paste into Codex after the operator approves Claude's plan. Replace `{{ISSUE_URL}}`, `{{TASK_ID}}`, `{{BRANCH_NAME}}`.

---

You are Codex acting as the focused implementer for CraftPlan Pro. Read `AGENTS.md` and `AI_SYSTEM/CODEX_TASK_TEMPLATE.md` for your operating rules.

The approved plan lives at:

{{ISSUE_URL}}

Find the Claude planning comment on that issue — it has been approved by the operator. That comment is your scope; do not deviate from it.

Steps:
1. Read the approved plan in full. Note the recommendation, the implementation plan steps, the target files, and the test strategy.
2. Create branch `{{BRANCH_NAME}}` from the current `main`.
3. Implement the **smallest diff** that satisfies the plan. Do not refactor opportunistically. Do not add dependencies the plan doesn't name. Do not change files outside the plan's "files allowed to edit" list.
4. Run the tests listed in the plan. Every listed check must pass before opening the PR.
5. Open a PR against `main`. Title: the issue title with `[codex]` prefix stripped, prefixed with the area, e.g. `etsy: fix tag truncation at 19 chars`.
6. PR body must follow `AI_SYSTEM/AGENT_REPORT_TEMPLATE.md`. Critical fields:
   - **Task ID:** `{{TASK_ID}}`
   - **Linked issue:** `Closes {{ISSUE_URL}}`
   - **Workflow block** at the bottom:
     ```
     <!-- workflow:start -->
     task-id: {{TASK_ID}}
     plan-source: {{ISSUE_URL}}
     agent: codex
     <!-- workflow:end -->
     ```

7. After opening the PR, your final message should:
   - Quote the PR URL
   - List the test commands you ran and their results
   - Note 1-3 specific things you want the reviewer to look at
   - Recommend label changes: `stage:scoped` → `stage:implementing` while CI runs, then `stage:review` when CI green

Hard rules from `AGENTS.md`:
- No edits to `.env*`, secrets, `package.json`, lockfiles, `.github/workflows/*`, `next.config.ts`, `data/*.db*`.
- No edits to files outside the approved plan's allowed list.
- If the plan turns out to be wrong on contact with the code, **stop and report**. Do not improvise. File a `[blocked]` issue describing the plan-vs-code mismatch.
- Smallest diff. If the change is growing past ~300 LOC, pause and re-prompt for a smaller cut.
- No commented-out code, no leftover `console.log`, no `TODO` without a referencing Task ID.
