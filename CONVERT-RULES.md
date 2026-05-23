# Convert Pipeline — Sealed Rules

**Established 2026-05-14 after multiple regressions destroyed chart output.
These rules are MANDATORY for every change in this repo.**

## Rule #1 — CHECK CONVERT FIRST, ALWAYS

Before making ANY code change, the first thing to do is verify the change
does not touch the convert pipeline. The user has lost hours of work to
"helpful" convert tweaks. The convert is sealed.

Run this check at the START of every task:

```bash
# Are any of the sealed convert files being modified?
# If YES → STOP and ask the user explicitly before proceeding.
# If NO  → proceed normally.
```

## The sealed convert pipeline — DO NOT TOUCH without explicit user approval

| File | Why it's sealed |
|---|---|
| `pattern-engine/pipeline.py` | KMeans+DMC quantizer. Byte-identical to v2 backup. |
| `pattern-engine/quantize.py` | LANCZOS resize + KMeans. Byte-identical to v2. |
| `pattern-engine/main.py` | FastAPI request/response shape. |
| `pattern-engine/dmc.py` | DMC palette lookup. |
| `pattern-engine/dmc_colors.json` | DMC color data. |
| `src/app/api/cross-stitch/python-convert/route.ts` | Next.js → Python proxy. |
| `src/app/api/cross-stitch/flatten-for-convert/route.ts` | STRONG flatten pass — load-bearing. |
| `convertViaPython` function body in `src/app/cross-stitch/page.tsx` | sourceMode gate, mergeDE value. |
| `generateAndCleanForConvert` function in `src/app/cross-stitch/page.tsx` | Must call flatten-for-convert for HQ path. |

## The non-negotiable parameter values

These were derived from `craftplan-digital-backup-good-convert-v2`. Do not
change them under any pretext (speed, cost, "simplification", etc.):

- `mergeDE: gridSize <= 90 ? 8.0 : 12.0` — NOT 8.5, NOT 3.5
- `setForceSquareNext(true)` at the start of `generateAndCleanForConvert`
- HQ path MUST call `/api/cross-stitch/flatten-for-convert` after `generate-design`
- `cleanConvertDataUrl` state set to `null` after flatten (sourceMode → "photo")
- For `nala-beginner` style, server's SOFT pass is skipped (route.ts line ~847)

## Known-good restore point

`backups/known-good-convert-2026-05-14/` — full snapshot of every sealed
file. See its `README.md` for one-command restore instructions.

## Regression history (lessons paid for in chart-quality)

| Date | Mistake | Symptom | Fix |
|---|---|---|---|
| 2026-05-14 | Removed `flatten-for-convert` call ("redundant for nala-beginner") | Muddy body, scattered confetti | Restored the call |
| 2026-05-14 | Set `mergeDE: 8.5` for stitch_art (was "tuned for fur clones") | Splotchy near-duplicate clones in body | Reverted to `12.0` |
| 2026-05-14 | Added FORBIDDEN cheek dots/eye highlights to reference prompt | Sterile empty face | Reverted to nala-beginner softness |
| 2026-05-14 | Added dark-outline-snap step in quantize.py | Brown outlines vanished | Removed |
| 2026-05-14 | Removed `source_mode == "stitch_art"` guard on flood-fill | Photo uploads got confetti | Restored guard |
| 2026-05-14 | `setCleanConvertDataUrl(null)` in generate-and-clean | photo mode on AI carts → confetti | Either keep null + flatten, OR set to source |

## Process rule for future changes

1. **Read the user request carefully.** Does it mention convert, chart,
   Python engine, or pattern quality?
2. **If YES** → check this file's "sealed files" list. Touching any of
   them requires explicit user approval BEFORE making the change.
3. **If NO** → still verify your planned edits don't accidentally land
   on a sealed file. Common traps:
   - Editing `page.tsx` for UI work and accidentally drifting into
     `convertViaPython` or `generateAndCleanForConvert`.
   - Touching `generate-design/route.ts` to change generation, but
     altering the response shape Python depends on.
4. **After any change** → if the user complains about chart quality,
   the FIRST thing to check is whether the convert pipeline files
   match the known-good backup. Use:
   ```bash
   diff -q backups/known-good-convert-2026-05-14/pattern-engine/pipeline.py pattern-engine/pipeline.py
   diff -q backups/known-good-convert-2026-05-14/src/app/api/cross-stitch/python-convert/route.ts src/app/api/cross-stitch/python-convert/route.ts
   ```

## What we are explicitly allowed to change

- UI / styling / layout in `src/app/cross-stitch/page.tsx` (outside the
  convert functions)
- Research Hub features (`src/components/cross-stitch/ResearchHub.tsx`,
  research-tab API routes)
- Trend / Pinterest / scan endpoints
- Generation prompts (gpt-image-2 prompt construction) — but if the
  chart quality changes, that's a signal the change had downstream
  effects, so test before committing
- New features added as separate files/routes that don't touch existing
  convert behavior

## TL;DR for any future agent reading this

**The convert pipeline is sealed. Check first, don't touch, ask before
changing. Chart quality regressions are the worst possible outcome —
they cost the user hours of debugging time and erode trust in the tool.**
