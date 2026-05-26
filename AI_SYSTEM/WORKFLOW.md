# WORKFLOW — Claude + Codex on One Repo (Tier 1)

This is the end-to-end loop. Every task flows through these steps in order. Skipping steps is how collisions, merge conflicts, and bad merges happen.

**Tier 1** means no API keys, no paid automation. You (the operator) invoke Claude Code and Codex by hand, but everything around that — task structure, labels, branching, CI gating, file-ownership enforcement, log updates — is mechanical and supported by templates and Actions. See `AI_SYSTEM/LABELS.md` for the label state machine and `AI_SYSTEM/MANUAL_SETUP.md` for one-time setup.

The Prompt Manager role no longer requires writing prompts from scratch. The issue templates + prompt snippets in `AI_SYSTEM/prompts/` collapse that step into "fill in a form, paste a snippet."

---

## The Loop

### 1. Operator files a rough idea (`stage:rough`)
Pick the "1. Rough task" issue template. Type the idea in plain English. Add an `area:*` label. Submit. Title is auto-prefixed `[rough]`.

Examples:
> "The etsy tag generator sometimes cuts tags at 19 chars instead of 20, fix it"
> "I want to add a CSV export to the research page"
> "Look at the cross-stitch generator and tell me what's slow"

### 2. Claude scopes and plans (`stage:planning` → `stage:plan-ready`)
Open Claude Code. Paste `AI_SYSTEM/prompts/01-rough-to-claude-plan.md` with this issue's URL. Claude:
- Reads the issue + relevant files
- Posts a planning comment on the issue (findings, options, recommendation, implementation plan, risks, open questions)
- Suggests a Task ID and next-step labels

The operator reviews the plan and **approves explicitly** (a comment, an emoji reaction, or just a label flip). No approval → no implementation.

To skip this step (genuinely trivial fixes only — typo, lint, single-line bug fix), the operator may file an issue from template "3. Codex implementation task" directly, and the Codex task must say "trivial fix per operator request" in its plan source field.

### 3. Codex implements (`stage:scoped` → `stage:implementing`)
After approval, the operator either files a fresh "3. Codex implementation task" issue (preferred — keeps a clean record) or applies `agent:codex` to the planning issue. Open Codex. Paste `AI_SYSTEM/prompts/02-claude-plan-to-codex-implement.md` with the issue URL, Task ID, and branch name.

Codex creates the branch, writes the smallest diff that satisfies the plan, runs the listed checks, and opens a PR. The PR description follows `AI_SYSTEM/AGENT_REPORT_TEMPLATE.md` and includes the workflow-block footer that `task-log-on-merge` parses.

### 4. CI runs (`stage:implementing` → `stage:review` when green)
The `check.yml` workflow runs typecheck + lint + build on every PR. The operator manually flips the label to `stage:review` + `agent:claude` once CI is green. (Tier 2 will automate this; Tier 1 keeps it manual for predictability.)

### 5. Claude reviews (`stage:review`)
Open Claude Code on the PR branch. Paste `AI_SYSTEM/prompts/03-codex-pr-to-claude-review.md` with the PR URL. Claude:
- Reads the diff against the approved plan
- Evaluates correctness, architecture fit, regression risk, UI/UX, edge cases, security
- Posts inline comments + a top-level review with `approve` / `request changes` / `block`
- Lists findings by severity: must-fix, should-fix, nit

### 6. Codex fixes review comments (`stage:fixing`)
If Claude requested changes, the operator applies `stage:fixing` + `agent:codex`. Open Codex. Paste `AI_SYSTEM/prompts/04-claude-review-to-codex-fix.md` with the PR URL. Codex addresses must-fix and should-fix items on the same branch, skips nits, replies to each addressed comment with the fixing commit SHA.

Loop steps 5–6 until Claude's verdict is `approve`. The operator flips the label to `stage:ready-to-merge` + `agent:human`.

### 7. Operator merges (`stage:ready-to-merge` → `stage:done`)
**Only the operator merges.** No agent merges, ever. The operator:
1. Reads Claude's final verdict and Codex's report.
2. Runs a final smoke test if the change is user-visible.
3. Squash-merges via the GitHub UI.
4. The `task-log-on-merge` workflow posts a suggested `TASK_LOG.md` row as a comment on the merged PR.
5. The operator appends that row to `AI_SYSTEM/TASK_LOG.md` in a tiny follow-up PR (or uses `prompts/05-merge-to-task-log.md` to have Codex do it).
6. The Project board auto-flips the card to `Done` based on the merge.

---

## Branching Rules

- `main` is protected. No direct pushes. Required approvals: 0 (solo dev), but PRs are mandatory and stale reviews are dismissed.
- Every task gets its own branch:
  - `ai/claude/<slug>` for Claude-authored
  - `ai/codex/<slug>` for Codex-authored
  - `chore/<slug>` for administrative changes (TASK_LOG updates, label config, infra)
  - `fix/<slug>` for hot fixes
  - `feat/<slug>` for human-written features (rare in this workflow)
- Branches are deleted after merge (configured in branch protection).
- No long-lived feature branches. If a task can't ship within a day or two, split it.

## File-Ownership Rules

- Claude and Codex **never** edit the same file at the same time.
- File ownership is implicit: any file listed in an open task's `Files allowed to edit` is locked to that agent until merge or task close.
- When filing a Codex task, list any file an open Claude task currently owns in `Files forbidden`.

## When to Stop

Stop the agent and re-prompt with a smaller cut when any of these happen:
- Diff grows past ~300 lines
- Plan turns out to be wrong on contact with the code
- A required test starts failing for reasons unrelated to the task
- The agent asks for permission to edit a forbidden file
- The agent encounters a secret, token, or credential

In all cases, file a "5. Blocked task" issue rather than letting the agent improvise.

---

## What Tier 1 Does NOT Do

Tier 2 (API-keyed) would add automatic agent invocation on label changes and `@claude`/`@codex` PR mentions. Tier 1 deliberately keeps you in the loop for:

- Pasting the prompt snippet into Claude Code / Codex
- Approving plans
- Transitioning labels between stages
- Merging PRs
- Appending the bot-suggested row to `TASK_LOG.md`

These take ~30 seconds each. They are the only ongoing manual work in this workflow.
