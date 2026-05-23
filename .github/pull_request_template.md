<!--
Use this template for every PR opened by Claude Code, Codex, or a human.
Sections marked Required must be filled. Sections marked Optional can be removed if not applicable.
-->

## Summary
<!-- Required. 2–5 sentences. What changed and why. Plain English, no code. -->

## Related Task
<!-- Required. Task ID from AI_SYSTEM/TASK_LOG.md (e.g. T-20260523-01) and link to the originating issue if any. -->
- Task ID: `T-YYYYMMDD-NN`
- Issue: #

## Agent Used
<!-- Required. One of: claude-code, codex, human. If an agent assisted a human, list both. -->
- [ ] claude-code
- [ ] codex
- [ ] human

## Branch
<!-- Required. Branch this PR is from. Should match the task. -->
`ai/<agent>/<slug>`

## Files Changed
<!-- Required. Compact list. Use `git diff --stat` output or summarize by area. -->
```
<N> files changed
<path>                          +<added>  -<removed>
```

## Tests Run
<!-- Required. Exact commands and results. Mark skipped checks with a reason. -->
| Command | Result | Notes |
|---|---|---|
| `pnpm typecheck` |  |  |
| `pnpm lint` |  |  |
| `pnpm test -- <path>` |  |  |
| Manual: <steps> |  |  |

## Screenshots
<!-- Optional. Required for any user-facing UI change. Before/after if relevant. -->

## Risk Level
<!-- Required. Pick one. -->
- [ ] **low** — docs, tests-only, isolated bug fix, no shared utilities touched
- [ ] **medium** — single-area feature, touches shared utilities or one API route
- [ ] **high** — cross-cutting change, schema change, auth/payment flow, external API integration

### Risk Notes
<!-- Required if risk is medium or high. What could go wrong, what to watch in review. -->

## Checklist
- [ ] Stayed inside the task's `Files Allowed to Edit` list
- [ ] No secrets, env files, lockfiles, CI config, or `next.config.ts` touched (unless task required it)
- [ ] No `main` pushes; branch is `ai/<agent>/<slug>` or a human topic branch
- [ ] `AI_SYSTEM/TASK_LOG.md` updated for this task
- [ ] PR description follows `AI_SYSTEM/AGENT_REPORT_TEMPLATE.md` for agent-authored PRs
- [ ] No drive-by refactors; scope matches the task

## Recommended Next Step
<!-- Required. What should happen after this PR. Examples:
- "Claude review requested"
- "Operator manual smoke test on /research before merge"
- "None — ready to merge"
-->
