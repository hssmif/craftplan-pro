# MASTER CONTEXT — CraftPlan Pro

This document is the canonical project context for any AI agent operating on this repo. It must be read before any non-trivial task. Keep it current; out-of-date context is the single biggest source of bad AI output.

---

## 1. Project Overview

CraftPlan Pro is a workflow suite for digital-product sellers. It combines automated market research, AI-assisted design, and listing automation into a single operator console. Primary users are solo sellers and small studios shipping POD (print-on-demand) and digital downloads to Etsy and Printful.

**Tech stack at a glance:**
- Next.js (App Router, TypeScript) frontend + API routes
- Python / FastAPI service for pattern engine compute
- SQLite for local product/research state (`data/products.db`)
- Browser extension (Chromium MV3) for marketplace research capture
- External APIs: Etsy, Printful, OpenAI / GPT-Image, Gemini, Notion, Kling (video)

---

## 2. Main Product Areas

1. **Research** — trend scanning, niche discovery, marketplace insights via the browser extension and aggregated APIs.
2. **POD Builder / Etsy / Printful** — listing generation, mockup automation, draft publishing.
3. **Design Sensei** — AI-assisted creative direction and source-image generation.
4. **Cross-Stitch Generator** — converts source images into stitchable patterns with DMC color charts and PDF exports.
5. **Pattern Engine (FastAPI)** — image processing, color quantization, and pattern rendering.
6. **Notion Integration** — pushes finished assets and metadata into the user's Notion workspace.

---

## 3. POD Builder / Etsy / Printful Workflow

- Niche or product idea selected from Research.
- Source artwork generated (GPT-Image or Flux) or uploaded.
- Mockup pack produced (4 lifestyle scenes).
- Listing copy generated (title, description, 13 tags, smart price).
- Draft pushed to Etsy via the Etsy API. **Drafts only — never auto-publishes without explicit user approval.**
- Optional Printful sync for fulfillment.

---

## 4. Design Sensei Workflow

- Operator describes a target aesthetic, niche, or constraint.
- Model proposes a creative brief and reference moodboard direction.
- Image generation runs against approved direction.
- Output flows into the same downstream packaging steps as POD Builder.

---

## 5. Cross-Stitch Generator Workflow

- Source image (AI-generated or uploaded) → clean-source.
- Render photoreal preview.
- Premium conversion to stitchable grid + DMC palette.
- Export 5 PDF variants (full pattern, color chart, symbol-only, color-by-symbol, instructions).
- Hands off to packaging (4 mockups + 12s listing video) before listing.

---

## 6. Next.js Frontend

- App Router under `src/app/`.
- API routes under `src/app/api/`.
- Component library under `src/components/`.
- Client state via Zustand stores (`src/stores/`).
- Hooks under `src/hooks/`.
- Shared library / clients under `src/lib/` (Etsy, Printful, Gemini, DB).
- Sidebar-driven navigation; pages map 1:1 with product areas.

---

## 7. Python / FastAPI Pattern Engine

- Lives under `pattern-engine/`.
- Entrypoint: `pattern-engine/main.py`.
- Owns CPU-bound image work (quantization, grid render, PDF export).
- Called from Next.js API routes via HTTP.
- Treat as a separate deployable; changes here do **not** automatically require frontend changes and vice versa.

---

## 8. Important Safety Rules

These rules apply to every agent, every task, no exceptions.

1. **Never commit, log, or echo secrets.** This includes `.env*`, API keys, OAuth tokens, session cookies, Etsy refresh tokens, Printful keys, Gemini/OpenAI keys, Notion integration tokens.
2. **Never push to `main`.** All changes go through a PR from a feature branch.
3. **Never auto-publish to Etsy.** Drafts only unless the user explicitly approves a publish step in the same session.
4. **Never auto-send money, place orders, or trigger Printful fulfillment** without explicit user approval.
5. **Do not touch unrelated files.** Stay inside the `Files allowed to edit` list for the task.
6. **Do not refactor opportunistically.** A bug fix fixes the bug. A feature ships the feature. Cleanups need their own task.
7. **Do not modify `package.json`, lockfiles, CI config, or `next.config.ts`** unless the task explicitly requires it.
8. **Do not change the database schema** without an approved migration plan.
9. **Stop and ask** when login, 2FA, payment, or secret entry is required.
10. **Small diffs.** If a change is growing past ~300 lines, pause and re-plan.

---

## 9. Current AI Workflow Goal

Run Claude Code and Codex in parallel on this repo without collisions. Claude plans and reviews; Codex implements small, focused changes. A Prompt Manager translates rough operator requests into properly scoped tasks for the correct agent, logs every task, and chains the next prompt based on results. The system in `/AI_SYSTEM/` defines the templates, rules, and report formats that make that loop reproducible.
