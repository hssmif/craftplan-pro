# TASK LOG

Every task handed to Claude Code or Codex gets one row here. The Prompt Manager owns this file. No task is "done" until its row reflects the final state.

**Task ID format:** `T-YYYYMMDD-NN` (e.g. `T-20260523-01`).

**Status values:** `planned` · `in-progress` · `awaiting-review` · `changes-requested` · `merged` · `abandoned`.

**Risk levels:** `low` · `medium` · `high`.

---

| Task ID | Date | Agent | Branch | Status | Files Touched | Summary | Tests | Risks | Next Step |
|---|---|---|---|---|---|---|---|---|---|
| T-20260523-00 | 2026-05-23 | Claude | `ai/setup-agent-workflow` | awaiting-review | `AI_SYSTEM/*`, `AGENTS.md`, `CLAUDE.md`, `.github/*` | Bootstrap AI workflow system: templates, rules, PR/issue templates | n/a (docs only) | low | Merge PR; run first test issue |
| T-20260524-01 | 2026-05-24 | Codex | `codex/fix-build-db-directory` | merged | `src/lib/db.ts`, `src/app/api/digital/export/route.ts` | PR #6 fixed the Next.js build failure when `data/` was missing during database initialization. | `npm run build` pass; `npm run lint` pass with existing warnings | low - creates the local data directory safely and does not change schema | Merged; continue monitoring build baseline |
| T-20260524-02 | 2026-05-24 | Codex | `codex/add-ci-check-workflow` | merged | `.github/workflows/check.yml` | PR #7 added GitHub Actions checks for lint, build, and extension build on PRs and main pushes. | `npm run lint` pass; `npm run build` pass; `npm run ext:build` pass | low - CI-only change may block merges if baseline checks regress | Merged; use CI as the default PR gate |
| T-20260524-03 | 2026-05-24 | Codex | `codex/fix-sqlite-schema-race` | merged | `src/lib/db.ts` | PR #8 made SQLite column migration initialization safe under parallel Next.js build workers. | `npm run build` pass; `npm run lint` pass with existing warnings | low - duplicate-column races are ignored only after confirming the column exists | Merged; revisit only if SQLite initialization regresses |
| T-20260524-04 | 2026-05-24 | Codex | `codex/document-extension-roles` | merged | `.gitignore`, `README.md`, `etsy-keyword-research/README.md`, `src/extension/README.md` | PR #9 documented the separate roles of the ListingView v1 and CraftPlan Research v2 browser extensions. | `npm run lint` pass; `npm run build` pass; `npm run ext:build` pass | low - documentation and ignore entries only | Merged; use docs to guide future extension work |

---

## How to use this log

1. **Open a task:** add a new row with status `planned` before any code is written. Fill `Agent`, `Branch`, `Summary`, and intended `Files Touched`.
2. **Promote to `in-progress`** the moment the agent starts work.
3. **On PR open:** flip to `awaiting-review`, fill `Tests` (commands run + pass/fail) and `Risks`.
4. **On review feedback:** flip to `changes-requested`, append the requested change summary to `Next Step`.
5. **On merge:** flip to `merged`. Do not delete the row.
6. **If abandoned:** mark `abandoned` and write the reason in `Next Step`.

Keep `Summary` to one sentence. Long detail belongs in the PR description, not the log.
