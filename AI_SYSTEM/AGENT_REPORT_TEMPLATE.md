# AGENT FINAL REPORT TEMPLATE

Every task ends with a report in this exact shape. No report → task is not done. Missing sections → report rejected.

Paste this template into the PR description (and copy back into the agent's response). The Prompt Manager copies the relevant fields into `TASK_LOG.md`.

---

## Task ID
`T-YYYYMMDD-NN`

## Agent
`claude-code` | `codex`

## Branch
`ai/<agent>/<slug>`

---

## What I Did
2–5 sentences. Plain English. No code. The operator should be able to read just this section and know whether to dig deeper.

## Files Changed
```
<N> files changed
<path>                          +<added>  -<removed>
<path>                          +<added>  -<removed>
```
For docs-only or plan-only tasks where no files were changed, write `No files changed — analysis/plan only`.

## Why
Why these changes (and not others). Reference the approved plan or the operator's request. If you departed from the plan, say where and why.

## Tests Run
Exact commands and their results.

| Command | Result | Notes |
|---|---|---|
| `pnpm typecheck` | pass | — |
| `pnpm lint` | pass | — |
| `pnpm test -- src/...` | pass | 14 passed |
| Manual: <steps> | pass / fail | <observation> |

If a check was skipped, say so and why.

## Results
What the user-visible or system-visible outcome is. Screenshots for UI changes (attach to PR). API response samples for API changes. Before/after numbers for perf work.

## Risks
What could go wrong if this ships. Be honest. Categories to consider:
- Regression in adjacent flows
- Performance / cost (extra API calls, larger payloads)
- Data integrity (writes to DB, file system, external services)
- Security (auth, input validation, secret handling)
- UX (accessibility, error states, mobile)

## What Needs Review
Specific files, functions, or behaviors that deserve extra reviewer attention. If everything is mechanical, say "Mechanical change — quick skim sufficient."

## Recommended Next Prompt
What the operator / Prompt Manager should send next. Examples:
- "Claude: review PR #<n> against the approved plan."
- "Codex: address review comments on PR #<n>."
- "Operator: manual smoke test on /research before merge."
- "None — task complete, ready to merge."

This field closes the loop so the Prompt Manager can chain the next task without re-deriving context.
