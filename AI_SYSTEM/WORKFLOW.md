# WORKFLOW — Claude + Codex on One Repo

This is the end-to-end loop. Every task flows through these steps in order. Skipping steps is how collisions, merge conflicts, and bad merges happen.

---

## The Loop

### 1. Operator writes a normal idea
Rough, natural language. No need to format it. Examples:
> "the etsy tag generator sometimes cuts tags at 19 chars instead of 20, fix it"
> "I want to add a CSV export to the research page"
> "look at the cross-stitch generator and tell me what's slow"

### 2. Prompt Manager converts it to a professional task
- Reads the request, classifies it (see `PROMPT_MANAGER_RULES.md`).
- Chooses Claude (analysis/plan/review) or Codex (implementation/fix).
- Fills the appropriate template (`CLAUDE_TASK_TEMPLATE.md` or `CODEX_TASK_TEMPLATE.md`).
- Assigns a Task ID and adds a row to `TASK_LOG.md` with status `planned`.

### 3. Claude analyzes / plans
For anything non-trivial, Claude goes first. Claude produces:
- Findings
- Options and trade-offs
- Recommendation
- Implementation plan (ordered steps, files, tests)
- Risk assessment

Claude **does not write code** in this step. Output is a plan document — usually posted as a comment on the originating GitHub issue or as a draft PR with no diff and the plan in the description.

The operator reviews the plan and approves it. No approval → no implementation.

### 4. Codex implements small changes
Codex receives the approved plan and a fresh Codex task on a new branch `ai/codex/<slug>`. It produces the diff, runs the required checks, and opens a PR with the report from `AGENT_REPORT_TEMPLATE.md` as the description.

If the change is genuinely tiny (typo, lint, one-line fix), the Prompt Manager may skip step 3 — but the Codex task must say "No prior plan — trivial fix" in its Approved Plan Source field.

### 5. Claude reviews the PR
A fresh Claude review task is created against the PR. Claude returns:
- Verdict
- Findings by severity (must-fix, should-fix, nit)
- Regression risk
- UX risk
- Suggested follow-ups

Comments are posted on the PR (inline where possible).

### 6. Codex fixes review comments
A new Codex task is created on the same branch (or a follow-up commit) to address must-fix and should-fix items. Nits are optional and may be filed as separate tasks.

When fixes are pushed, Claude re-reviews if any must-fix items existed. Loop steps 5–6 until Claude's verdict is `approve`.

### 7. Human approves and merges
**Only the operator merges.** No agent merges, ever. The operator:
- Reads Claude's final verdict and Codex's report
- Runs a final smoke test if the change is user-visible
- Squash-merges via the GitHub UI
- Confirms `TASK_LOG.md` row is updated to `merged`

---

## Branching Rules

- `main` is protected. No direct pushes.
- Every task gets its own branch: `ai/claude/<slug>` or `ai/codex/<slug>`.
- Branches are deleted after merge.
- No long-lived feature branches. If a task can't ship within a day or two, split it.

## File-Ownership Rules

- Claude and Codex **never** edit the same file at the same time.
- The Prompt Manager tracks active file ownership implicitly via the open task list — any file listed in an `awaiting-review` or `in-progress` task is locked to that agent until merge.

## When to Stop

Stop the agent and re-prompt with a smaller cut when any of these happen:
- Diff grows past ~300 lines
- Plan turns out to be wrong on contact with the code
- A required test starts failing for reasons unrelated to the task
- The agent asks for permission to edit a forbidden file
- The agent encounters a secret, token, or credential
