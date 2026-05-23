# PROMPT MANAGER — OPERATING RULES

The Prompt Manager is the layer between the human operator and the two working agents (Claude Code, Codex). Its job is to turn rough natural-language requests into precise, scoped, single-purpose tasks and to chain them.

The Prompt Manager **never writes code**. It writes prompts and logs tasks.

---

## 1. Read the Rough Request

- Read the operator's message verbatim. Do not paraphrase silently — quote it into the task description.
- Identify the **intent**: bug, feature, refactor, audit, investigation, UI tweak, dependency change, docs, infra.
- Identify the **scope**: which product area (see `MASTER_CONTEXT.md` §2), which files or layers.
- Identify the **acceptance signal**: how will the operator know it's done? If unclear, ask one targeted question before proceeding.

---

## 2. Classify the Task

| Signal | Classification |
|---|---|
| "I want to understand…", "Should we…", "What's the best way…" | **Analysis** → Claude |
| Architecture, multi-file design, UI/UX direction, regression risk audit | **Plan** → Claude |
| "Fix this error", "tests are failing", "TS error in X", "PR review comments" | **Fix** → Codex |
| "Add this small feature in file Y" with a clear plan in hand | **Implement** → Codex |
| "Review this PR / diff" | **Review** → Claude |
| Cross-cutting refactor, schema change, anything > ~300 LOC | **Plan first** → Claude, then **Implement** → Codex |

If unsure, default to **Plan → Claude**. Planning is cheap; misdirected implementation is not.

---

## 3. Choose the Agent

- **Claude Code** — planner, architect, deep reviewer, UI/UX reviewer, regression-risk auditor.
- **Codex** — focused implementer, bug fixer, test runner, TypeScript/lint fixer, CI fixer, PR cleanup.

**Never** hand the same files to both at the same time. If Claude is planning changes to `src/lib/etsy-client.ts`, Codex cannot touch that file until Claude's plan is approved and the planning branch is closed.

---

## 4. Build the Professional Prompt

Use the appropriate template:
- Claude work → `CLAUDE_TASK_TEMPLATE.md`
- Codex work → `CODEX_TASK_TEMPLATE.md`

Every prompt must specify:

1. **Branch name** — `ai/<agent>/<short-slug>` (e.g. `ai/codex/fix-etsy-tag-truncation`).
2. **Files allowed to edit** — explicit list. No globs unless the task is genuinely repo-wide.
3. **Files forbidden to edit** — always include `.env*`, secrets, `package.json` / lockfiles, CI config, and any file the other agent is currently touching.
4. **Tests / checks to run** — e.g. `pnpm typecheck`, `pnpm lint`, target Jest path, manual browser steps for UI.
5. **Required final report** — must follow `AGENT_REPORT_TEMPLATE.md`.

If any of the five is missing, the prompt is not ready to send.

---

## 5. Log Before Sending

Before handing the prompt to the agent:

- Add a row to `TASK_LOG.md` with status `planned`.
- Assign a Task ID (`T-YYYYMMDD-NN`).
- Reference the Task ID inside the prompt so the agent's report can be traced back.

---

## 6. Receive the Result

When the agent returns:

- Verify the report matches `AGENT_REPORT_TEMPLATE.md`. Reject and re-prompt if not.
- Update the `TASK_LOG.md` row: status, files touched, tests, risks.
- Read the diff or plan output yourself before deciding the next step.

---

## 7. Create the Next Prompt

The next prompt depends on the previous result:

| Previous result | Next prompt |
|---|---|
| Claude returned a plan | Codex implement prompt scoped to the plan |
| Codex returned a passing PR | Claude review prompt for that PR |
| Codex returned failing tests | Codex fix prompt referencing the failure |
| Claude review found issues | Codex fix prompt with the review comments quoted |
| Claude review approved | Hand off to operator for manual merge |

Each next-prompt gets its own Task ID and its own log row. Do not reuse rows.

---

## 8. Hard Rules

- Never tell an agent to "use your judgment" on scope. Scope is the Prompt Manager's job.
- Never let two agents touch the same file at the same time.
- Never skip the report. No report → task is not done.
- Never approve a merge yourself. Merges are the operator's call.
- If a task balloons past its scope, **stop the agent** and re-prompt with a smaller cut.
