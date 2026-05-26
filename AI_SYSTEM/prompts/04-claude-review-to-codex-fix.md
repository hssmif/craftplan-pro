# Claude review → Codex fix prompt

Paste into Codex when Claude's review requested changes. Replace `{{PR_URL}}`.

---

You are Codex acting as the implementer for CraftPlan Pro. Read `AGENTS.md` for your operating rules.

The PR you opened received a review with requested changes. Read the review at:

{{PR_URL}}

Steps:
1. Read **every** review comment, both inline and the top-level review. Group them mentally as the reviewer did: must-fix, should-fix, nit.
2. Address all **must-fix** items. Each must-fix is non-negotiable for merge.
3. Address **should-fix** items if the fix is local and small. If a should-fix would expand the diff significantly, leave a reply comment proposing it as a follow-up task and skip.
4. **Skip nits.** Don't even reply to them unless you have a quick observation. They're opinions.
5. Push the fix commits to the **same branch** the PR is on. Do not open a new PR. Do not rebase or force-push unless explicitly asked.
6. Reply to each addressed comment with a one-line note saying what you changed and which commit fixed it (use commit SHA).

7. Re-run the listed tests. Push only after they all pass.

8. After pushing, your final message should:
   - Quote the new commit SHAs
   - Confirm test results
   - List which must-fix and should-fix items you addressed, which you skipped (with reason), and which became follow-up suggestions
   - Recommend label changes: `stage:fixing` → `stage:review` (Claude re-reviews automatically when CI re-passes)

Hard rules:
- Same forbidden-files list as the original implementation (see `AGENTS.md`).
- Do not change scope. The review's must-fix items define what changes; don't add unrelated improvements.
- Do not delete or modify Claude's review comments.
- If a must-fix requires touching a forbidden file or expanding scope past the original plan, **stop** and file a `[blocked]` issue rather than proceeding.
- If you can't reproduce a reviewer-claimed bug, say so explicitly in a reply and ask for a clarifying example — don't silently skip.
