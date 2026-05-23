# TASK LOG

Every task handed to Claude Code or Codex gets one row here. The Prompt Manager owns this file. No task is "done" until its row reflects the final state.

**Task ID format:** `T-YYYYMMDD-NN` (e.g. `T-20260523-01`).

**Status values:** `planned` · `in-progress` · `awaiting-review` · `changes-requested` · `merged` · `abandoned`.

**Risk levels:** `low` · `medium` · `high`.

---

| Task ID | Date | Agent | Branch | Status | Files Touched | Summary | Tests | Risks | Next Step |
|---|---|---|---|---|---|---|---|---|---|
| T-20260523-00 | 2026-05-23 | Claude | `ai/setup-agent-workflow` | awaiting-review | `AI_SYSTEM/*`, `AGENTS.md`, `CLAUDE.md`, `.github/*` | Bootstrap AI workflow system: templates, rules, PR/issue templates | n/a (docs only) | low | Merge PR; run first test issue |

---

## How to use this log

1. **Open a task:** add a new row with status `planned` before any code is written. Fill `Agent`, `Branch`, `Summary`, and intended `Files Touched`.
2. **Promote to `in-progress`** the moment the agent starts work.
3. **On PR open:** flip to `awaiting-review`, fill `Tests` (commands run + pass/fail) and `Risks`.
4. **On review feedback:** flip to `changes-requested`, append the requested change summary to `Next Step`.
5. **On merge:** flip to `merged`. Do not delete the row.
6. **If abandoned:** mark `abandoned` and write the reason in `Next Step`.

Keep `Summary` to one sentence. Long detail belongs in the PR description, not the log.
