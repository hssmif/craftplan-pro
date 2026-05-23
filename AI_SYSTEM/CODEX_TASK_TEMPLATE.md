# CODEX TASK TEMPLATE

Use this template for every task assigned to Codex. Codex implements; it does not architect. Every field is mandatory.

---

## Task ID
`T-YYYYMMDD-NN`

## Goal
One sentence. What the diff must accomplish. If you can't state it in one sentence, the task is too large — break it up.

## Approved Plan Source
Link to the Claude task / PR / document that contains the approved plan. Codex implements **the approved plan**, not its own interpretation. If no plan exists and this is a trivial fix (typo, lint, single-file fix), state explicitly: "No prior plan — trivial fix per operator request: `<quote>`".

## Branch Name
`ai/codex/<short-slug>`

Branch off `main`. Never off a Claude planning branch. Never reuse a branch from a previous task.

## Files Allowed to Edit
Explicit list. No globs. If the plan needs files added, list the new paths here.

## Files Forbidden to Edit
Always forbidden:
- `.env*`, any file under `secrets/`, any file containing credentials
- `package.json`, lockfiles
- `.github/workflows/*`
- `next.config.ts`
- Database files in `data/*.db*`
- Any file currently assigned to Claude

## Implementation Rules
1. **Smallest diff that satisfies the goal.** No drive-by edits.
2. **No new dependencies** unless the approved plan names them explicitly.
3. **No schema changes** unless the approved plan includes a migration.
4. **Match existing style.** Read 1–2 nearby files first; do not import a new style.
5. **No `any`-typed escapes** in TypeScript unless the plan calls them out.
6. **No commented-out code.** Delete it or keep it.
7. **No console.log left behind.** Use the project's logger if one exists.
8. **No TODOs without a Task ID** referencing the follow-up.
9. **Stop and report** if the plan turns out to be wrong on contact with the code. Do not improvise.

## Tests to Run
List the exact commands. Examples:
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test -- <path>`
- Manual: open `/research`, trigger X, expect Y

Every listed check must pass before opening the PR. If a check is failing on `main` already (pre-existing), say so in the report and proceed only if the failure is unrelated.

## Required Final Report
Follow `AGENT_REPORT_TEMPLATE.md` exactly. Reports that skip sections will be rejected and the task reopened.

## Diff Summary Required
At the top of the report, include a compact diff summary:

```
<N> files changed
<path>           +<added>  -<removed>
<path>           +<added>  -<removed>
...
```

Plus a one-paragraph plain-English description of what changed and why. The operator should be able to decide whether to look at the diff based on this paragraph alone.
