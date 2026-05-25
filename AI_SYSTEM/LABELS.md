# LABELS

The label scheme is the visible part of the workflow state machine. Every issue and PR carries exactly one label from each group: **stage**, **agent**, and (for tasks that touch code) **area** + **risk**.

The Project board (`AI Workflow`) groups by `stage:*` for live view. `TASK_LOG.md` is updated only on PR merge — see `AI_SYSTEM/WORKFLOW.md`.

---

## Stage (mutually exclusive — drives the workflow)

| Label | When | Next actor |
|---|---|---|
| `stage:rough` | Issue filed via "rough task" template, not yet scoped | Claude (planning) |
| `stage:scoped` | Scoped task ready, awaiting agent pickup | Claude or Codex |
| `stage:planning` | Claude is actively producing a plan | Claude |
| `stage:plan-ready` | Plan posted, awaiting operator approval | Operator |
| `stage:implementing` | Codex is actively producing code | Codex |
| `stage:review` | PR open + CI passing, awaiting Claude review | Claude |
| `stage:fixing` | Codex addressing Claude review comments | Codex |
| `stage:ready-to-merge` | Claude approved, awaiting operator merge | Operator |
| `stage:done` | Merged or closed | — |
| `stage:blocked` | Waiting on operator decision (see template 5) | Operator |

## Agent (who acts next)

| Label | Meaning |
|---|---|
| `agent:claude` | Claude Code is the next actor |
| `agent:codex` | Codex is the next actor |
| `agent:human` | Operator action required (approval, merge, secret entry, manual smoke) |

## Area (where the change lands)

| Label | Surface |
|---|---|
| `area:frontend` | `src/app/*` (pages, layouts), `src/components/*` |
| `area:backend` | `src/app/api/*`, `src/lib/*` |
| `area:extension` | `src/extension/*`, `etsy-keyword-research/*`, `public/extension/*` |
| `area:pattern-engine` | `pattern-engine/*` (Python / FastAPI) |
| `area:cross-stitch` | Anything cross-stitch (page, API, pattern engine, lib) |
| `area:pod` | POD Builder / Etsy / Printful integrations |
| `area:research` | Research, radar, opportunities, marketplace insights |
| `area:infra` | `.github/*`, CI, build config, branch protection |
| `area:docs` | `AI_SYSTEM/*`, READMEs, top-level docs |
| `area:ui` | Cross-cutting UI/UX issues (theming, layout, accessibility) |

A task can carry multiple `area:*` labels if it genuinely spans surfaces. Prefer one.

## Risk

| Label | Definition |
|---|---|
| `risk:low` | Docs, isolated bug fix, no shared utilities touched. Operator can self-merge without manual smoke. |
| `risk:medium` | Single-area feature, touches shared utilities or one API route. Manual smoke recommended. |
| `risk:high` | Cross-cutting change, schema change, auth/payment flow, external API integration, anything > ~300 LOC. Requires planning task before implementation. |

---

## One-time setup (run after this PR merges)

Create the labels in GitHub. Either:

### Option A — manual (GitHub UI)
Issues → Labels → New label, one per row in the tables above. Suggested colors:

| Group | Color hex |
|---|---|
| `stage:rough`, `stage:blocked` | `#d4c5f9` (light purple) |
| `stage:scoped`, `stage:planning`, `stage:plan-ready` | `#bfd4f2` (light blue) |
| `stage:implementing`, `stage:fixing` | `#f9d0c4` (light orange) |
| `stage:review`, `stage:ready-to-merge` | `#c2e0c6` (light green) |
| `stage:done` | `#cccccc` (gray) |
| `agent:claude` | `#5319e7` (purple) |
| `agent:codex` | `#0e8a16` (green) |
| `agent:human` | `#fbca04` (yellow) |
| `area:*` | `#1d76db` (blue) |
| `risk:low` | `#0e8a16` (green) |
| `risk:medium` | `#fbca04` (yellow) |
| `risk:high` | `#b60205` (red) |

### Option B — scripted (gh CLI, faster)
Run from any local clone with `gh` authenticated:

```bash
# stages
gh label create "stage:rough"            --color "d4c5f9" --description "Rough idea, not yet scoped"          --force
gh label create "stage:scoped"           --color "bfd4f2" --description "Scoped, awaiting agent pickup"      --force
gh label create "stage:planning"         --color "bfd4f2" --description "Claude is producing a plan"         --force
gh label create "stage:plan-ready"       --color "bfd4f2" --description "Plan posted, awaiting approval"     --force
gh label create "stage:implementing"     --color "f9d0c4" --description "Codex is producing code"            --force
gh label create "stage:review"           --color "c2e0c6" --description "PR open, awaiting Claude review"    --force
gh label create "stage:fixing"           --color "f9d0c4" --description "Codex addressing review comments"   --force
gh label create "stage:ready-to-merge"   --color "c2e0c6" --description "Claude approved, awaiting merge"    --force
gh label create "stage:done"             --color "cccccc" --description "Merged or closed"                   --force
gh label create "stage:blocked"          --color "d4c5f9" --description "Waiting on operator decision"       --force

# agents
gh label create "agent:claude"           --color "5319e7" --description "Claude Code is next actor"          --force
gh label create "agent:codex"            --color "0e8a16" --description "Codex is next actor"                --force
gh label create "agent:human"            --color "fbca04" --description "Operator action required"           --force

# areas
gh label create "area:frontend"          --color "1d76db" --force
gh label create "area:backend"           --color "1d76db" --force
gh label create "area:extension"         --color "1d76db" --force
gh label create "area:pattern-engine"    --color "1d76db" --force
gh label create "area:cross-stitch"      --color "1d76db" --force
gh label create "area:pod"               --color "1d76db" --force
gh label create "area:research"          --color "1d76db" --force
gh label create "area:infra"             --color "1d76db" --force
gh label create "area:docs"              --color "1d76db" --force
gh label create "area:ui"                --color "1d76db" --force

# risk
gh label create "risk:low"               --color "0e8a16" --force
gh label create "risk:medium"            --color "fbca04" --force
gh label create "risk:high"              --color "b60205" --force
```

`--force` updates an existing label of the same name in place — safe to re-run.

---

## How labels move

You apply them by hand or via the issue/PR templates. There is intentionally no Action that auto-mutates labels in Tier 1 — keeps the workflow predictable and debuggable.

A typical task moves through these label states:

```
stage:rough          (operator files via template 1)
    ↓ Claude scopes and re-files / comments
stage:scoped + agent:claude   (planning)
    ↓ Claude finishes plan
stage:plan-ready + agent:human
    ↓ operator approves, retitles, applies
stage:scoped + agent:codex   (implementation)
    ↓ Codex opens PR (PR inherits area + risk from issue)
stage:implementing → (CI passes) → stage:review + agent:claude
    ↓ Claude reviews
stage:fixing + agent:codex   (if changes requested)
    ↓ Codex pushes fix → loop until approved
stage:ready-to-merge + agent:human
    ↓ operator squash-merges
stage:done   (task-log-on-merge workflow auto-comments the TASK_LOG row)
```
