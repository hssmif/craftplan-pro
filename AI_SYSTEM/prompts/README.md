# Prompt Snippets

These are the saved prompts you paste into Claude Code or Codex at each step of the workflow. They are parameterized with `{{ISSUE_URL}}` / `{{PR_URL}}` / `{{TASK_ID}}` placeholders — replace before pasting.

The whole point of these snippets: **you never have to write a Claude or Codex prompt by hand.** Pick the right snippet, replace 1–2 placeholders, paste, run.

## When to use which

| You're at this stage | Paste this | Into |
|---|---|---|
| Filed a rough-task issue, want Claude to scope it | [`01-rough-to-claude-plan.md`](01-rough-to-claude-plan.md) | Claude Code |
| Claude's plan approved, ready for implementation | [`02-claude-plan-to-codex-implement.md`](02-claude-plan-to-codex-implement.md) | Codex |
| Codex opened a PR, want Claude to review | [`03-codex-pr-to-claude-review.md`](03-codex-pr-to-claude-review.md) | Claude Code |
| Claude's review requested changes | [`04-claude-review-to-codex-fix.md`](04-claude-review-to-codex-fix.md) | Codex |
| PR merged, want to update TASK_LOG.md | [`05-merge-to-task-log.md`](05-merge-to-task-log.md) | (manual or via `task-log-on-merge` workflow) |

## Placeholder reference

| Token | Where to find the value |
|---|---|
| `{{ISSUE_URL}}` | Browser URL of the GitHub issue, e.g. `https://github.com/hssmif/craftplan-pro/issues/42` |
| `{{PR_URL}}` | Browser URL of the GitHub PR, e.g. `https://github.com/hssmif/craftplan-pro/pull/15` |
| `{{TASK_ID}}` | The `T-YYYYMMDD-NN` ID from the issue's "Task ID" field |
| `{{BRANCH_NAME}}` | The branch Codex should use (from the issue), e.g. `ai/codex/etsy-tag-truncation` |
| `{{REVIEW_VERDICT}}` | "approve" / "request changes" / "block" — from Claude's review |

## How to use

1. Open the relevant `.md` file in this directory.
2. Copy the entire prompt block (everything inside the `---` markers).
3. Replace placeholders with the actual values.
4. Paste into Claude Code or Codex and run.

Each snippet is intentionally self-contained — Claude/Codex will read `AGENTS.md` / `CLAUDE.md` and `AI_SYSTEM/MASTER_CONTEXT.md` automatically as project context. The snippet only conveys *this task's* specifics.
