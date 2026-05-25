<!--
Use this template for every PR opened by Claude Code, Codex, or a human.
Required fields must be filled. Optional sections can be deleted if not applicable.
-->

## Summary
<!-- Required. 2–5 sentences. What changed and why. Plain English, no code. -->

## Linked issue
<!-- Required. Use "Closes #N" so the issue closes on merge. -->
Closes #

## Stage
<!-- Required. Reflects the current label state when this PR was opened. -->
- [ ] `stage:implementing` — Codex is producing code (CI may still be running)
- [ ] `stage:review` — CI green, awaiting Claude review
- [ ] `stage:fixing` — addressing review comments
- [ ] `stage:ready-to-merge` — Claude approved

## Agent used
<!-- Required. One of: claude-code, codex, human. -->
- [ ] claude-code
- [ ] codex
- [ ] human

## Branch
<!-- Auto-populated by git; sanity check it matches the issue's branch field. -->
`ai/<agent>/<slug>` or `chore/<slug>`

## Files changed
<!-- Required. Output of `git diff --stat`, or a one-paragraph summary by area. -->
```
<N> files changed
<path>                          +<added>  -<removed>
```

## Tests run
<!-- Required. Mark each. Skipped checks need a one-line reason. -->
- [ ] CI: `typecheck` passed
- [ ] CI: `lint` passed
- [ ] CI: `build` passed
- [ ] Manual smoke: <describe steps + result>
- [ ] gitleaks: 0 findings (required if PR adds new files outside `AI_SYSTEM/`, `.github/`, or `*.md`)

## Risk level
<!-- Required. Pick one — and apply the matching label. -->
- [ ] **`risk:low`** — docs, tests-only, isolated bug fix, no shared utilities touched
- [ ] **`risk:medium`** — single-area feature, touches shared utilities or one API route
- [ ] **`risk:high`** — cross-cutting change, schema change, auth/payment flow, external API integration

### Risk notes
<!-- Required if risk is medium or high. What could go wrong, what to watch in review. -->

## Screenshots
<!-- Required for any user-facing UI change. Before/after if relevant. -->

## Task log update needed?
<!-- After merge, `.github/workflows/task-log-on-merge.yml` posts a suggested
     AI_SYSTEM/TASK_LOG.md row as a comment. Mark whether the operator (or Codex
     via prompt 05) should append it. -->
- [ ] Yes — append the bot-suggested row to `AI_SYSTEM/TASK_LOG.md` after merge
- [ ] No — administrative PR, skip log

## Checklist
- [ ] Stayed inside the linked issue's `Files allowed to edit` list
- [ ] No secrets, env files, lockfiles, CI config, or `next.config.ts` touched (unless task explicitly required)
- [ ] No drive-by refactors; scope matches the task
- [ ] No new dependencies (or: dependency added is named in the approved plan)
- [ ] Issue labels updated: `stage:*`, `agent:*` reflect the next actor

## Recommended next step
<!-- Required. What should happen after this PR.
     Examples:
     - "Claude review requested — apply stage:review + agent:claude"
     - "Operator: smoke test /research before merging"
     - "Ready to merge — apply stage:ready-to-merge"
-->

<!-- ─────────────────────────────────────────────────────────────────
     Workflow block (machine-readable; do not delete or edit comments).
     The task-log-on-merge workflow parses this to build the TASK_LOG row.
     Leave a field blank if it doesn't apply.
     ───────────────────────────────────────────────────────────────── -->
<!-- workflow:start -->
task-id: T-YYYYMMDD-NN
plan-source: (URL to approved-plan comment, or "trivial fix" or "—")
agent: claude
<!-- workflow:end -->
