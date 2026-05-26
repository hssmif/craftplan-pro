# Merge → TASK_LOG.md update prompt

The `task-log-on-merge` GitHub Action posts a pre-built `TASK_LOG.md` row as a comment on the merged PR. You normally just copy that row into `AI_SYSTEM/TASK_LOG.md` yourself. This prompt is for the cases where you want an agent to do it (e.g. bulk-updating multiple skipped merges).

Paste into Codex. Replace `{{PR_URL}}`.

---

You are Codex acting as a docs-only maintainer. Your task is purely administrative.

The PR at:

{{PR_URL}}

has been merged. The `task-log-on-merge` workflow has posted a comment on that PR with a pre-built markdown row for `AI_SYSTEM/TASK_LOG.md`.

Steps:
1. Fetch the latest `main`.
2. Read the comment on the PR (the one authored by `github-actions[bot]`, titled "TASK_LOG row").
3. Open `AI_SYSTEM/TASK_LOG.md`.
4. Append the row from the comment **as-is** to the table — do not modify, summarize, or "improve" it.
5. If a row for the same Task ID already exists (operator handled it manually), do nothing and report skipped.
6. Open a tiny PR with the single-line append. Branch: `chore/task-log-{{PR_NUMBER}}`. Title: `chore: log T-YYYYMMDD-NN to TASK_LOG.md`.
7. Skip the workflow:start block in the PR body (it's a docs-only chore, not a tracked task). PR body: 1–2 sentences plus a link to the merged PR.

Hard rules:
- Edit **only** `AI_SYSTEM/TASK_LOG.md`. Touch nothing else.
- Do not modify other rows in the table. Do not re-sort. Do not reformat.
- If the bot comment is missing or malformed, report that and stop — do not invent a row.
- Do not delete the bot comment.
