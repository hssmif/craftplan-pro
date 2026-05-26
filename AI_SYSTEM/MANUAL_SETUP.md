# MANUAL SETUP — Tier 1 Workflow

One-time operator tasks to activate the Tier 1 workflow after this PR merges. Each section is independent — run in any order. Time estimate: ~15 minutes total.

---

## 1. Create the labels (~5 min)

The labels drive everything. Without them, the issue templates' default-label fields silently fail.

**Fastest path — scripted via `gh`:**

```bash
cd path/to/craftplan-pro

# stages
gh label create "stage:rough"            --color "d4c5f9" --description "Rough idea, not yet scoped"          --force
gh label create "stage:scoped"           --color "bfd4f2" --description "Scoped, awaiting agent pickup"      --force
gh label create "stage:planning"         --color "bfd4f2" --description "Claude is producing a plan"         --force
gh label create "stage:plan-ready"       --color "bfd4f2" --description "Plan posted, awaiting approval"     --force
gh label create "stage:implementing"     --color "f9d0c4" --description "Codex is producing code"            --force
gh label create "stage:review"           --color "c2e0c6" --description "PR open, awaiting Claude review"    --force
gh label create "stage:fixing"           --color "f9d0c4" --description "Codex addressing review comments"   --force
gh label create "stage:ready-to-merge"   --color "c2e0c6" --description "Claude approved, awaiting merge"    --force
gh label create "stage:done"             --color "cccccc" --description "Merged or closed"                   --force
gh label create "stage:blocked"          --color "d4c5f9" --description "Waiting on operator decision"       --force

# agents
gh label create "agent:claude"           --color "5319e7" --force
gh label create "agent:codex"            --color "0e8a16" --force
gh label create "agent:human"            --color "fbca04" --force

# areas
gh label create "area:frontend"          --color "1d76db" --force
gh label create "area:backend"           --color "1d76db" --force
gh label create "area:extension"         --color "1d76db" --force
gh label create "area:pattern-engine"    --color "1d76db" --force
gh label create "area:cross-stitch"      --color "1d76db" --force
gh label create "area:pod"               --color "1d76db" --force
gh label create "area:research"          --color "1d76db" --force
gh label create "area:infra"             --color "1d76db" --force
gh label create "area:docs"              --color "1d76db" --force
gh label create "area:ui"                --color "1d76db" --force

# risk
gh label create "risk:low"               --color "0e8a16" --force
gh label create "risk:medium"            --color "fbca04" --force
gh label create "risk:high"              --color "b60205" --force
```

`--force` updates an existing label of the same name in place. Safe to re-run.

**Slow path — GitHub UI:** Issues → Labels → New label. One per row of `AI_SYSTEM/LABELS.md`. ~20 clicks per label times 26 labels — only choose this if `gh` isn't installed.

**Verify:** `gh label list` should show all 26.

---

## 2. Create the Project board (~5 min)

The Project board is the live view of in-flight tasks. `TASK_LOG.md` is the merged-history view.

1. Go to the repo on GitHub → Projects tab → New project.
2. Layout: **Board**.
3. Name: `AI Workflow`. Visibility: same as the repo.
4. Click into the new project. Settings (top right) → Workflows.
5. Add an `Item added to project` workflow: when an issue is added, set the field `Status` to `Todo`.
6. Add an `Item closed` workflow: when an issue or PR is closed/merged, set `Status` to `Done`.
7. Settings → Custom fields. Edit the `Status` field. Replace the default options with:
   - `Rough` (gray)
   - `Scoped` (blue)
   - `Planning` (blue)
   - `Plan ready` (blue)
   - `Implementing` (orange)
   - `Review` (green)
   - `Fixing` (orange)
   - `Ready to merge` (green)
   - `Done` (gray)
   - `Blocked` (purple)

   These should match (case-insensitive) the `stage:*` labels in `AI_SYSTEM/LABELS.md`.
8. Settings → Manage access → add the repo as a linked repository.
9. (Optional, recommended) Settings → Workflows → enable the built-in "Auto-add to project" rule, filtered to `is:issue is:open` and `is:pr is:open` in the linked repo.

**Manual column updates:** when you flip an issue's label from `stage:planning` to `stage:plan-ready`, also drag the card on the board from `Planning` to `Plan ready`. GitHub doesn't sync labels → project status automatically in Tier 1. (Tier 2 would automate this.)

---

## 3. Verify the new issue templates (~1 min)

1. Go to repo → Issues → New issue.
2. You should see **5 options**: rough task, Claude planning task, Codex implementation task, Claude review task, blocked task.
3. You should **not** see the old "AI Task" template (it was deleted in this PR).
4. You should **not** see "Open a blank issue" (`config.yml` disables it).

If any of those are wrong, file a `[blocked]` issue.

---

## 4. Verify the workflow file is wired (~1 min)

1. Open repo → Actions tab.
2. You should see "TASK_LOG row on merge" in the workflow list.
3. It should show "0 workflow runs" — it only fires on PR merges, not on the PR that introduces it.
4. The first merged PR after this one will get a bot comment with a suggested TASK_LOG row.

---

## 5. Daily workflow — first time

After the one-time setup, your daily flow is:

### Filing a task
1. Repo → Issues → New issue → pick a template.
2. Fill the form. Submit.
3. Add an `area:*` label (the templates pre-apply `stage:*` and `agent:*`).

### Running Claude for planning
1. Open Claude Code (terminal or IDE integration).
2. Open `AI_SYSTEM/prompts/01-rough-to-claude-plan.md`.
3. Copy the prompt body (everything inside the `---` markers).
4. Replace `{{ISSUE_URL}}` with the issue URL you just filed.
5. Paste into Claude Code, hit run.
6. Claude posts a plan comment on the issue.
7. Read the plan. If you approve, comment `approve` on the issue and apply `stage:plan-ready` + `agent:human`.

### Running Codex for implementation
1. File a "3. Codex implementation task" issue using the approved plan as the `plan-source`.
2. Open Codex.
3. Open `AI_SYSTEM/prompts/02-claude-plan-to-codex-implement.md`.
4. Replace `{{ISSUE_URL}}`, `{{TASK_ID}}`, `{{BRANCH_NAME}}`.
5. Paste into Codex, run.
6. Codex opens a PR. CI runs automatically (typecheck, lint, build).

### Running Claude for review
1. Wait for CI green. Apply `stage:review` + `agent:claude` to the PR.
2. Open Claude Code.
3. Open `AI_SYSTEM/prompts/03-codex-pr-to-claude-review.md`.
4. Replace `{{PR_URL}}` with the PR URL.
5. Paste into Claude Code, run.
6. Claude posts inline review + top-level verdict.

### Codex fixes review comments
1. If Claude said "request changes", apply `stage:fixing` + `agent:codex`.
2. Open Codex.
3. Open `AI_SYSTEM/prompts/04-claude-review-to-codex-fix.md`.
4. Replace `{{PR_URL}}`.
5. Paste, run.
6. Codex pushes fix commits to the same branch.
7. Loop back to "Running Claude for review" until verdict is `approve`.

### Merging
1. Apply `stage:ready-to-merge` + `agent:human`.
2. Smoke-test if user-facing.
3. Squash-merge in the GitHub UI.
4. The `task-log-on-merge` Action posts a suggested TASK_LOG row as a comment on the merged PR.
5. Open the comment. Copy the markdown row.
6. Open `AI_SYSTEM/TASK_LOG.md` in any text editor. Paste the row at the bottom of the table.
7. Open a tiny PR with that single-line change: branch `chore/task-log-T-…`, title `chore: log T-… to TASK_LOG.md`. Or paste `prompts/05-merge-to-task-log.md` into Codex to do steps 5–7 automatically.

---

## What this setup does NOT do

- It does **not** auto-invoke Claude or Codex. You always paste the snippet yourself.
- It does **not** auto-update labels on PR events. CI passing does not auto-flip `stage:implementing` to `stage:review` — you do that.
- It does **not** auto-update `TASK_LOG.md` on `main`. It only proposes the row.
- It does **not** auto-link issues to PRs unless you write `Closes #N` in the PR body.

All of those are Tier 2 (API-keyed) automation candidates. Tier 1 keeps you in the loop on every state transition so the workflow stays predictable and debuggable.
