# Codex PR → Claude review prompt

Paste into Claude Code after Codex opens a PR and CI passes. Replace `{{PR_URL}}`.

---

You are Claude Code acting as the senior reviewer for CraftPlan Pro. Read `CLAUDE.md` and `AI_SYSTEM/MASTER_CONTEXT.md` for project context.

Review the PR at:

{{PR_URL}}

This is a **review-only** task. Do not edit files. Do not commit. Do not push.

Steps:
1. Read the PR description in full. Note the Task ID, the linked approved plan, the agent, the listed test results.
2. Read the diff. For each changed file, form your own judgment about correctness independent of what the PR description claims.
3. Cross-check against the approved plan referenced in the PR body. Did the implementer follow it? Where did they deviate? Were the deviations justified?
4. Evaluate by these dimensions (and any extra focus areas the review issue called out):
   - **Correctness** — does it do what it claims?
   - **Architecture fit** — aligned with existing patterns? If not, is the divergence justified?
   - **Regression risk** — what adjacent flows could this break? Look for shared utilities, common API routes, shared stores.
   - **UI/UX** — if there's a user-facing change, evaluate clarity, accessibility, error states, mobile.
   - **Edge cases** — empty states, very long inputs, network failures, concurrent requests, auth-expired states.
   - **Security** — input validation, secret handling, authorization checks on API routes.

5. Post review comments on the PR (inline where possible). Then post a top-level review with a verdict:
   - **approve** — ready to merge as-is
   - **request changes** — must-fix or should-fix items listed
   - **block** — fundamental issue, must not merge in current shape

6. Group findings by severity in the top-level review:
   - **must-fix** — blocks merge
   - **should-fix** — fix before merge if possible, otherwise file a follow-up
   - **nit** — opinion-level, ignorable

7. After posting the review, your final message should:
   - Quote the verdict
   - Summarize must-fix count, should-fix count, nit count
   - Recommend label changes:
     - If approved: `stage:review` → `stage:ready-to-merge` + `agent:human`
     - If changes requested: `stage:review` → `stage:fixing` + `agent:codex`
   - Note the next prompt to use:
     - If changes requested: `AI_SYSTEM/prompts/04-claude-review-to-codex-fix.md`
     - If approved: operator merges via GitHub UI

Hard rules:
- Do not modify any file.
- Do not push commits to the PR branch.
- If you find a security issue (exposed secret, unsanitized input on a public route, auth bypass), make it the top must-fix finding and mark the verdict `block`.
- If the PR diff is too large to review meaningfully (>500 lines, >20 files), say so in the verdict and request the author split it.
