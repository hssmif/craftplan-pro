"""
Orchestrator: turns a raw image into the Pattern data structure the
Next.js UI consumes.

Output contract (must match `PatternData` in src/app/cross-stitch/page.tsx):

    {
      "grid": string[][],         # grid[row][col] = DMC code string
      "colors": [                 # one entry per thread used
        {
          "dmc": str,
          "name": str,
          "hex": str,
          "symbol": str,          # single-char PDF symbol
          "count": int,           # cells using this color
        },
        ...
      ],
      "width": int,
      "height": int,
      "totalStitches": int,       # stitched cells (excludes background)
      "backgroundDmc": str | None # DMC for unstitched aida, if any
    }
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
from io import BytesIO
from typing import Any, Optional

import numpy as np
from PIL import Image
from scipy.ndimage import label
from skimage import color as skcolor

from dmc import (
    assign_symbols,
    load_palette,
    merge_close_dmcs,
    nearest_dmc_indices,
)
from pdf_renderer import render_pattern_pdf
from quantize import quantize


# Lightness above this in LAB (L* 0-100) + chroma below CHROMA_MAX
# → treat as aida background (unstitched).  Tightened 2026-05-09:
# the previous L>=92 threshold (≈RGB ≥ 232) was eating ivory/cream
# subject bodies (white bunny on white aida → invisible) because the
# kmeans centroid for a "white" cartoon body lands around L~93-95.
# At L>=97 only true near-pure-white (RGB all channels ≥ ~245) passes
# the gate, so cream/ivory/light-beige stays stitched while a pure
# #FFFFFF aida background is still removed.
BACKGROUND_L_MIN = 97.0
BACKGROUND_CHROMA_MAX = 8.0
# Minimum fraction of cells that must be "background-like" for us to
# actually designate a background.  If only 5% of cells are white, it's
# not a real background — it's a highlight.
BACKGROUND_MIN_FRACTION = 0.15


@dataclass
class ConvertOptions:
    grid_size: int = 150
    max_colors: int = 24
    # Merge threshold in CIE ΔE (LAB).  Lower = keep more distinct
    # threads; higher = fewer total threads in the final pattern.
    merge_de: float = 3.5
    # Cluster over-allocation multiplier (see quantize.quantize).
    over_alloc: float = 1.5
    # Source-mode hint forwarded to quantize().  "photo" (default) is
    # the canonical pipeline; "stitch_art" applies a MedianFilter pre-
    # pass to suppress the per-stitch X-block / aida-fabric texture
    # found in gpt-image-2 stitch-art renders.  See quantize.quantize.
    source_mode: str = "photo"
    # Pattern title shown on the cover page of the generated PDF.  Empty
    # → renderer falls back to "Cross-Stitch Pattern".  No effect on
    # the quantize / DMC pipeline; only flows through to render_pattern_pdf.
    pattern_name: str = ""
    # When True, skip the aspect-aware re-quantize pass and keep the
    # first-pass square output at exactly grid_size × grid_size.  Used by
    # the "Design This →" idea-card flows where the source is a GPT-Image-2
    # render that's already framed as a centered square subject — running
    # bbox-aware crop on those produces unintended portrait grids when the
    # subject (florals, tall figures, vertical arrangements) happens to
    # occupy a non-square colour region inside the 1024×1024 frame.  User
    # uploads (real photos) keep force_square=False so the existing
    # subject-fits-canvas behaviour stays intact.
    force_square: bool = False


def _is_background_candidate(lab: tuple[float, float, float]) -> bool:
    L, a, b = lab
    chroma = (a * a + b * b) ** 0.5
    return L >= BACKGROUND_L_MIN and chroma <= BACKGROUND_CHROMA_MAX


def _absorb_singleton_components(
    dmc_grid: np.ndarray,
    palette: list[Any],
) -> np.ndarray:
    """
    Stitch-art only: reassign every cell whose 4-connected same-DMC
    component is exactly 1 cell to the dominant DMC of its 4 neighbours.

    What this is for
    ----------------
    GPT-image-2 stitch-art renders contain visible aida texture and
    anti-alias halos around dark outlines / text strokes.  Even after
    the MedianFilter pre-pass and KMeans+merge collapse, the DMC grid
    keeps a long tail of single-cell components — random colour specks
    that the eye reads as "static" on the chart.  Absorbing them into
    their dominant neighbour cleans the chart without disturbing any
    legitimate design feature: at the 142-stitch target every text
    stroke, petal edge, eye highlight, and outline is at least 2 cells
    wide, so size==1 components are unambiguously confetti.

    Stitch-count invariant
    ----------------------
    Two boundary-crossing reassignments would silently change the
    stitch count after the next step's background-mask:

      (a) stitched singleton → near-white neighbour: the cell would
          become aida and lose its stitch.
      (b) near-white singleton → stitched neighbour: the cell would
          become stitched and gain one.

    We forbid both by gating the source AND the chosen target on a
    per-DMC bg-like flag (the same lightness/chroma rule
    `_is_background_candidate` uses on the actual background DMC, but
    applied here to any palette entry).  Singletons are only moved
    among neighbours of the same bg-like-ness.

    Photo mode never calls this — the call site in
    `convert_image_to_pattern` gates on `source_mode == "stitch_art"`.
    """
    H, W = dmc_grid.shape
    structure = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]])
    out = dmc_grid.copy()

    # Pre-compute bg-like flag per palette index so the inner neighbour
    # loop is a single boolean lookup (palette has ~430 entries).
    palette_is_bg_like = np.array(
        [_is_background_candidate(e.lab) for e in palette],
        dtype=bool,
    )

    for d in np.unique(dmc_grid):
        mask = dmc_grid == d
        labeled, n = label(mask, structure=structure)
        if n == 0:
            continue
        # bincount index 0 = "outside mask"; indices 1..n = component sizes.
        sizes = np.bincount(labeled.ravel())
        d_is_bg_like = bool(palette_is_bg_like[int(d)])
        for comp_id in range(1, n + 1):
            comp_size = int(sizes[comp_id])
            # Absorb ≤2 cell components.  Originally 1-cell only, but
            # measurement on 80×80 / Beginner-preset showed gradient
            # cartoons leave 2-cell confetti pairs that ==1 missed
            # (mouse-strawberries baseline 3.18% confetti).  Extending
            # to ≤2 still preserves intentional 3+ cell features
            # (eyes, beak ribs, small text strokes at standard /
            # detailed widths) under the bg-class invariant gate.
            if comp_size > 2:
                continue
            ys_arr, xs_arr = np.where(labeled == comp_id)

            # Gather neighbouring cells of every cell in the component
            # (not just the first), so a 2-cell component has both
            # cells' neighbours considered when picking the dominant
            # absorb target.
            neighbours: list[int] = []
            for y, x in zip(ys_arr.tolist(), xs_arr.tolist()):
                for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < H and 0 <= nx < W:
                        nv = int(out[ny, nx])
                        # Stitch-count invariant: only consider
                        # neighbours of matching bg-like-ness.
                        if bool(palette_is_bg_like[nv]) == d_is_bg_like:
                            neighbours.append(nv)
            if not neighbours:
                # Component entirely surrounded by the opposite class
                # (e.g. a stitched accent in pure aida) — leave it.
                continue
            vals, counts = np.unique(neighbours, return_counts=True)
            target = int(vals[int(np.argmax(counts))])
            # Reassign EVERY cell in the component, not just [0].
            # The earlier ys[0]/xs[0] form was correct for 1-cell
            # components but would leave half of a 2-cell pair
            # dangling and re-create a singleton on the next scan.
            out[labeled == comp_id] = target
    return out


def _absorb_small_neutral_components(
    dmc_grid: np.ndarray,
    palette: list[Any],
    background_idx: Optional[int],
    max_size: int = 3,
) -> np.ndarray:
    """
    Stitch-art only: merge tiny light/mid neutral islands into their
    dominant non-background neighbour.

    This is a second, narrower cleanup pass for fake aida/thread
    texture that survives KMeans as 2-3 cell beige/grey flecks.  It
    deliberately avoids dark and saturated colours so text, outlines,
    eyes, flowers, cactus needles, etc. stay intact.  Very bright
    islands that touch dark pixels are also preserved, because those
    are usually eye glints or tiny intentional highlights.
    """
    H, W = dmc_grid.shape
    structure = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]])
    out = dmc_grid.copy()

    palette_lab = np.array([e.lab for e in palette], dtype=np.float64)
    chroma = np.sqrt(palette_lab[:, 1] ** 2 + palette_lab[:, 2] ** 2)
    smoothable = (palette_lab[:, 0] >= 50.0) & (chroma <= 24.0)
    dark = palette_lab[:, 0] <= 42.0

    for d in np.unique(dmc_grid):
        d = int(d)
        if d == background_idx or not bool(smoothable[d]):
            continue

        mask = out == d
        labeled, n = label(mask, structure=structure)
        if n == 0:
            continue
        sizes = np.bincount(labeled.ravel())

        for comp_id in range(1, n + 1):
            if sizes[comp_id] > max_size:
                continue

            ys, xs = np.where(labeled == comp_id)
            neighbours: list[int] = []
            touches_dark = False
            for y, x in zip(ys.tolist(), xs.tolist()):
                for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < H and 0 <= nx < W:
                        nv = int(out[ny, nx])
                        if nv == d:
                            continue
                        if bool(dark[nv]):
                            touches_dark = True
                        if background_idx is None or nv != background_idx:
                            neighbours.append(nv)

            # Preserve tiny bright-on-dark marks: eye glints, sparkle
            # dots, and small holes/counters around dark text.
            if palette_lab[d, 0] >= 84.0 and touches_dark:
                continue

            if len(neighbours) < max(2, int(sizes[comp_id])):
                continue

            vals, counts = np.unique(neighbours, return_counts=True)
            order = np.argsort(-counts)

            target: Optional[int] = None
            for idx in order:
                candidate = int(vals[int(idx)])
                if bool(smoothable[candidate]):
                    target = candidate
                    break
            if target is None:
                target = int(vals[int(order[0])])

            out[labeled == comp_id] = target

    return out


# Aspect-aware grid tolerances.
#
# A square source whose subject naturally fills the frame stays
# square (the bunny example: subject and frame both have aspect ≈ 1).
# Subjects whose bbox is meaningfully taller or wider than wide get
# the grid scaled so the LONG edge equals user.grid_size and the
# short edge falls out of the bbox aspect — matches NalaAndStitch's
# 51×80 goose, 70×72 swan, etc.
#
# Tolerances picked from the Nala reference set:
#   goose         51×80  → 80/51  = 1.57  (portrait)
#   pink dancer   56×98  → 98/56  = 1.75  (portrait)
#   swan          70×72  → 72/70  = 1.03  (square — keeps 70×72 ≈ square)
#   cowgirl       48×80  → 80/48  = 1.67  (portrait)
# 1.15 / 0.87 = ±15% from square; anything inside stays square.
ASPECT_PORTRAIT_THRESHOLD = 1.15
ASPECT_LANDSCAPE_THRESHOLD = 0.87
ASPECT_BBOX_PAD_CELLS = 5  # 5-cell border: ensures subject edges (hat dome tops, wing tips, etc.) are captured in the aspect-aware crop even when they are close to the first-pass background boundary


def _quantize_dmc_map(
    image_bytes: bytes, opts: ConvertOptions, grid_width: int,
) -> dict[str, Any]:
    """
    Inner pipeline pass: quantize → DMC-map → background detection →
    cleanups → return result dict (no PDF rendering).

    Pulled out of convert_image_to_pattern() so the aspect-aware
    re-pass can call it twice — first to detect the natural subject
    aspect, second on the bbox-cropped source at the corrected grid
    width.  PDF rendering happens once at the end on the final grid.
    """
    img = Image.open(BytesIO(image_bytes))

    # Step 1 — quantize to K cluster centroids in LAB.
    qres = quantize(
        img, grid_width=grid_width, max_colors=opts.max_colors,
        over_alloc=opts.over_alloc, source_mode=opts.source_mode,
    )

    # Step 1b — Beginner-mode singleton cleanup on the cluster grid.
    # Only fires for grid_size ≤ 90 (the BEGINNER_PATTERN_WIDTH=80
    # Convert-tab preset path).  At small grid sizes, gradient-heavy
    # input quantizes into scattered single-pixel clusters that read
    # as confetti — the duck body fragments into multiple yellow
    # shades, the white aida picks up stray gray pixels.  3×3
    # majority-vote pass: if a cell's cluster appears EXACTLY ONCE
    # in its 9-pixel window (true singleton, no same-cluster
    # neighbours), reassign to the dominant cluster in the window.
    # If it appears ≥2 times (has at least one same-cluster
    # neighbour), keep — preserves 2-pixel features like banner
    # text strokes, eye highlights, thin outlines.
    #
    # Standard / Detailed (grid_width > 90) skip this cleanup so
    # their behaviour stays byte-identical to the current pipeline.
    # NB: gate on the ACTUAL grid_width (post aspect-aware adjustment),
    # not opts.grid_size — a portrait pass at grid_width=51 still
    # benefits from the small-grid cleanup even when the user picked
    # opts.grid_size=80.
    if grid_width <= 90:
        from scipy.ndimage import generic_filter

        def _clean_singletons(grid: np.ndarray) -> np.ndarray:
            def _majority(values: np.ndarray) -> int:
                v = values.astype(int)
                counts = np.bincount(v, minlength=int(v.max()) + 1)
                return int(v[4]) if counts[int(v[4])] > 1 else int(counts.argmax())
            return generic_filter(
                grid.astype(float), _majority, size=3,
            ).astype(grid.dtype)

        cluster_grid = _clean_singletons(qres.cluster_grid)
    else:
        cluster_grid = qres.cluster_grid

    # Step 2 — map each centroid to the nearest DMC thread.
    centroid_dmc_idx = nearest_dmc_indices(qres.centroid_lab)  # (K,)

    # Step 3 — project the cluster grid to a DMC-index grid.
    #   cluster_grid[y, x] ∈ [0, K)  →  dmc_grid[y, x] ∈ [0, N_DMC)
    # Uses the cleaned cluster_grid from Step 1b when grid_size ≤ 90;
    # falls through to the raw qres.cluster_grid above 90.
    dmc_grid_flat = centroid_dmc_idx[cluster_grid.ravel()]

    # Step 4 — collapse near-duplicate DMCs until we're within the
    # merge threshold AND at or below max_colors.
    dmc_grid_flat = merge_close_dmcs(
        dmc_grid_flat,
        max_colors=opts.max_colors,
        merge_threshold=opts.merge_de,
    )
    dmc_grid = dmc_grid_flat.reshape(qres.height, qres.width)

    # Step 4b — stitch_art singleton confetti cleanup.
    #
    # Reassign every 1-cell 4-connected same-DMC component to its
    # dominant neighbour DMC, with the bg-like-class constraint that
    # keeps the stitch count and background mask invariant.  Photo
    # mode skips this entirely — the photo path is byte-identical to
    # the previous baseline.
    if opts.source_mode == "stitch_art" or grid_width <= 90:
        dmc_grid = _absorb_singleton_components(dmc_grid, load_palette())

    # Step 5 — identify background (if any).  A DMC qualifies if it's
    # near-white, achromatic, and covers ≥15% of the grid.
    palette = load_palette()
    unique_dmc, counts = np.unique(dmc_grid, return_counts=True)
    total_cells = qres.width * qres.height

    background_dmc: Optional[str] = None
    background_idx: Optional[int] = None
    for dmc_i, ct in zip(unique_dmc, counts):
        entry = palette[int(dmc_i)]
        if (
            _is_background_candidate(entry.lab)
            and ct / total_cells >= BACKGROUND_MIN_FRACTION
        ):
            # Prefer the highest-count qualifying candidate (there's
            # usually just one, but defensive against multiple near-
            # whites like DMC White + DMC 3865 Winter White).
            if background_idx is None or ct > counts[list(unique_dmc).index(background_idx)]:
                background_idx = int(dmc_i)
                background_dmc = entry.code

    # Step 5b — stitch_art mode at grid_size > 90: distinguish real
    # aida from enclosed white/cream stitch regions.
    #
    # Photo-mode behaviour (unchanged): every cell matching the bg DMC
    # is rendered as unstitched aida. That works for photos because
    # near-white photo backgrounds are genuinely contiguous with the
    # frame edge.
    #
    # Stitch-art behaviour (new): finished cross-stitch artwork (Etsy
    # best-seller previews, gpt-image-2 stitch renders, our Design tab)
    # often has white/cream subjects (a goose body, a duck belly, lamb
    # wool) that quantize to the same near-white DMC as the aida fabric.
    # The old "clear every matching cell" rule eats those interior body
    # cells.
    #
    # Fix: flood-fill ONLY cells that actually match the chosen bg DMC.
    # The bg-DMC components connected to the image border are real aida.
    # Any bg-DMC component enclosed by non-bg stitches is remapped to its
    # next-nearest non-bg DMC so it remains stitched.  We intentionally
    # do not dilate the whole subject here: floral wreaths and text can
    # otherwise become fake closed barriers and turn large white fabric
    # areas into stitched confetti.
    #
    # Beginner / Etsy mode skip (grid_size ≤ 90, e.g. 80×N from the
    # BEGINNER_PATTERN_WIDTH=80 Convert-tab preset): at small grid
    # sizes the interior-bg flood-fill remap risks pushing legitimate
    # white-body subject cells to a nearest-non-bg DMC, which on the
    # DMC palette is often a peach/salmon variant — the same
    # brown→orange drift the user hit on the cartoon mouse.  Below
    # 90, the source is small enough that genuine bg cells are
    # reliably contiguous with the frame, so the flood-fill protect
    # is both unnecessary AND risks erosion of intentional white
    # subject regions.
    if opts.source_mode == "stitch_art" and background_idx is not None and grid_width > 90:
        bg_candidates = dmc_grid == background_idx

        # 4-connectivity (no diagonals) — matches how a flood-fill
        # would propagate through the aida fabric in real stitching.
        structure = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]])
        labeled, _ = label(bg_candidates, structure=structure)

        border_label_ids: set[int] = set()
        if labeled.size > 0:
            border_label_ids.update(int(v) for v in labeled[0, :].tolist())
            border_label_ids.update(int(v) for v in labeled[-1, :].tolist())
            border_label_ids.update(int(v) for v in labeled[:, 0].tolist())
            border_label_ids.update(int(v) for v in labeled[:, -1].tolist())
        border_label_ids.discard(0)  # 0 = "not a candidate" pixels

        if border_label_ids:
            true_bg_mask = np.isin(labeled, sorted(border_label_ids))
        else:
            # Subject fills the frame — no real aida exists.
            true_bg_mask = np.zeros_like(bg_candidates, dtype=bool)

        # Cells matching the bg DMC but NOT touching the border = interior.
        interior_bg_mask = bg_candidates & ~true_bg_mask

        if interior_bg_mask.any():
            # Pre-compute palette LAB matrix for nearest-neighbour search.
            palette_lab = np.array(
                [e.lab for e in palette], dtype=np.float64,
            )  # (N_DMC, 3)

            # Each interior cell's quantization centroid (from the
            # original KMeans pass) gives us the underlying colour. We
            # find the nearest DMC EXCLUDING the bg DMC and remap there.
            # This preserves per-cluster colour fidelity rather than
            # flattening every interior white to a single fallback.
            cluster_grid_2d = qres.cluster_grid
            for cidx in np.unique(cluster_grid_2d[interior_bg_mask]):
                centroid = qres.centroid_lab[int(cidx)]
                dists = np.linalg.norm(palette_lab - centroid, axis=1)
                dists[background_idx] = np.inf
                alt_dmc_idx = int(np.argmin(dists))
                cell_mask = interior_bg_mask & (cluster_grid_2d == int(cidx))
                dmc_grid[cell_mask] = alt_dmc_idx

            # Refresh unique/counts since dmc_grid now has new values.
            unique_dmc, counts = np.unique(dmc_grid, return_counts=True)

        if not border_label_ids:
            # No real aida — drop the bg designation so the UI doesn't
            # render any cells as unstitched.
            background_dmc = None
            background_idx = None

    # Step 5c — stitch_art mode: absorb tiny neutral texture islands.
    #
    # Removes 2-3 cell beige/grey flecks left by fake fabric/thread
    # texture in white/cream regions while skipping dark/saturated
    # details and bright highlights touching dark outlines.
    #
    # Originally gated to grid_size > 90 (Phase 4) on the theory
    # that "every cell at 80×80 is a deliberate choice" — but
    # measurement on 80×80 / Beginner-preset duck shows the
    # opposite: gradient-heavy cartoon sources still produce 2-3
    # cell beige/grey flecks at small grid sizes (mouse-strawberries
    # baseline 3.18% confetti).  Step 5c's smoothable/dark-skip
    # guards already prevent eroding dark text/outlines and
    # saturated subject features, so the small-grid risk was
    # smaller than the small-grid confetti win.
    if opts.source_mode == "stitch_art" or grid_width <= 90:
        dmc_grid = _absorb_small_neutral_components(
            dmc_grid,
            palette,
            background_idx,
        )

    # Step 5d — stitch_art mode: enforce max_colors after the 5b/5c remap.
    #
    # The interior-bg remap in 5b can introduce non-bg DMCs that
    # weren't in the merge_close_dmcs output, pushing the total
    # palette past opts.max_colors (a typical stitch_art duck at 110×18
    # ends up at ~20 distinct DMCs). Collapse the smallest-count non-bg
    # DMC into its nearest in-grid non-bg neighbour; repeat until we're
    # within budget.
    #
    # Smallest-first ordering protects what stitchers care about: dark
    # outlines, eye/text blacks, body fills, and major accessory threads
    # all have hundreds-to-thousands of cells, so they're never the
    # smallest. Only rare confetti/near-duplicate threads (typically
    # 5-50 cells) get merged out.
    #
    # Photo mode skips this entirely — it never overshoots because
    # merge_close_dmcs in step 4 already capped it.
    if opts.source_mode == "stitch_art" or grid_width <= 90:
        palette_lab_full = np.array(
            [e.lab for e in palette], dtype=np.float64,
        )
        while True:
            unique_dmc, counts = np.unique(dmc_grid, return_counts=True)
            if len(unique_dmc) <= opts.max_colors:
                break
            eligible = [
                (int(d), int(c))
                for d, c in zip(unique_dmc, counts)
                if background_idx is None or int(d) != background_idx
            ]
            if not eligible:
                break
            # Smallest-count non-bg DMC is the merge source.
            eligible.sort(key=lambda x: x[1])
            smallest_dmc = eligible[0][0]
            # Candidates: every other non-bg DMC currently in the grid.
            candidate_dmcs = [d for d, _ in eligible if d != smallest_dmc]
            if not candidate_dmcs:
                break
            cand_arr = np.array(candidate_dmcs)
            dists = np.linalg.norm(
                palette_lab_full[cand_arr] - palette_lab_full[smallest_dmc],
                axis=1,
            )
            target_dmc = int(cand_arr[int(np.argmin(dists))])
            dmc_grid[dmc_grid == smallest_dmc] = target_dmc

    # Step 6 — build the grid as string[][] of DMC codes, and the
    # colors list with symbols + counts.
    grid_rows: list[list[str]] = []
    for y in range(qres.height):
        row: list[str] = []
        for x in range(qres.width):
            row.append(palette[int(dmc_grid[y, x])].code)
        grid_rows.append(row)

    # Stitch count excludes background cells.
    if background_idx is not None:
        total_stitches = int((dmc_grid != background_idx).sum())
    else:
        total_stitches = total_cells

    # Color list — include background so the UI can render it as aida,
    # but mark it via `backgroundDmc` so the PDF legend can skip it.
    code_to_count: dict[str, int] = {
        palette[int(d)].code: int(c) for d, c in zip(unique_dmc, counts)
    }
    # Symbols assigned in descending count order for legend readability.
    code_to_symbol = assign_symbols(code_to_count)

    colors: list[dict[str, Any]] = []
    # Ordering: stitched threads by count desc, background last.
    stitched_codes = [
        c for c in code_to_count
        if background_dmc is None or c != background_dmc
    ]
    stitched_codes.sort(key=lambda c: code_to_count[c], reverse=True)
    ordered_codes = stitched_codes + (
        [background_dmc] if background_dmc else []
    )
    for code in ordered_codes:
        # Find the DMC entry by code (O(n) but n=434, negligible).
        entry = next(e for e in palette if e.code == code)
        colors.append({
            "dmc": entry.code,
            "name": entry.name,
            "hex": entry.hex,
            "symbol": code_to_symbol[code],
            "count": code_to_count[code],
        })

    return {
        "grid": grid_rows,
        "colors": colors,
        "width": qres.width,
        "height": qres.height,
        "totalStitches": total_stitches,
        "backgroundDmc": background_dmc,
    }


def _detect_subject_bbox(
    grid_rows: list[list[str]], background_dmc: Optional[str],
) -> Optional[tuple[int, int, int, int]]:
    """
    Find the (rmin, rmax, cmin, cmax) bbox of non-background cells in
    a finished DMC grid.  Returns None if the grid is empty or the
    classifier didn't pick a background (in which case there's no
    aspect adjustment to do — the whole frame is "subject").
    """
    if background_dmc is None:
        return None
    H = len(grid_rows)
    if H == 0:
        return None
    W = len(grid_rows[0])
    rmin = H
    rmax = -1
    cmin = W
    cmax = -1
    for r in range(H):
        row = grid_rows[r]
        for c in range(W):
            if row[c] != background_dmc:
                if r < rmin:
                    rmin = r
                if r > rmax:
                    rmax = r
                if c < cmin:
                    cmin = c
                if c > cmax:
                    cmax = c
    if rmax < 0 or cmax < 0:
        return None
    return (rmin, rmax, cmin, cmax)


def _crop_source_to_subject(
    image_bytes: bytes,
    grid_w: int, grid_h: int,
    bbox_grid: tuple[int, int, int, int],
) -> bytes:
    """
    Translate a grid-cell bbox to source-pixel coordinates and crop
    the original PNG to that region (with ASPECT_BBOX_PAD_CELLS of
    margin).  Returns fresh PNG bytes the second pipeline pass can
    open exactly like the original.
    """
    rmin, rmax, cmin, cmax = bbox_grid
    img = Image.open(BytesIO(image_bytes))
    src_w, src_h = img.size
    px_per_cell_x = src_w / grid_w
    px_per_cell_y = src_h / grid_h
    pad = ASPECT_BBOX_PAD_CELLS
    px_left = max(0, int(round((cmin - pad) * px_per_cell_x)))
    px_top = max(0, int(round((rmin - pad) * px_per_cell_y)))
    px_right = min(src_w, int(round((cmax + 1 + pad) * px_per_cell_x)))
    px_bottom = min(src_h, int(round((rmax + 1 + pad) * px_per_cell_y)))
    cropped = img.crop((px_left, px_top, px_right, px_bottom))
    buf = BytesIO()
    cropped.save(buf, format="PNG")
    return buf.getvalue()


def convert_image_to_pattern(
    image_bytes: bytes, opts: ConvertOptions
) -> dict[str, Any]:
    """
    Full pipeline: decode → aspect-aware quantize → DMC-map → merge →
    PDF render → serialize.

    Aspect-aware behaviour
    ----------------------
    1.  First pass quantizes at opts.grid_size as the WIDTH (height
        derived from source aspect via resize_image_to_grid).
    2.  Background classification gives us the subject bbox; its
        aspect tells us whether the subject naturally fills a portrait,
        landscape, or square frame.
    3.  If the bbox aspect is outside [0.87, 1.15] from square, we
        crop the original source PNG to the subject's pixel region
        (+2 cells of margin) and rerun the pipeline with grid_size
        as the LONG edge.  The short edge then derives from the
        cropped source aspect.
    4.  PDFs are rendered once on the final grid.

    Net effect: a 1024×1024 gpt-image-2 portrait bunny with body
    occupying cells 15..70 × 5..78 of an 80×80 first pass becomes a
    ~57×80 second-pass output — matching NalaAndStitch's "subject
    fills the canvas" aesthetic.  Square subjects (swan-style 70×72)
    stay square at the user's grid_size.
    """
    # First pass at opts.grid_size (used as the working width — height
    # is derived from source aspect by quantize.resize_image_to_grid).
    first = _quantize_dmc_map(image_bytes, opts, grid_width=opts.grid_size)

    # Detect subject bbox in the first-pass grid.
    bbox_grid = _detect_subject_bbox(first["grid"], first["backgroundDmc"])

    # Decide whether to re-run on a cropped source.
    final = first
    if not opts.force_square and bbox_grid is not None:
        rmin, rmax, cmin, cmax = bbox_grid
        bbox_h = rmax - rmin + 1
        bbox_w = cmax - cmin + 1
        if bbox_w > 0 and bbox_h > 0:
            aspect = bbox_h / bbox_w
            need_repass = (
                aspect > ASPECT_PORTRAIT_THRESHOLD
                or aspect < ASPECT_LANDSCAPE_THRESHOLD
            )
            if need_repass:
                # Compute target grid dimensions with grid_size as the
                # long edge.  We only need target_w because quantize()
                # re-derives height from the (cropped) source aspect.
                if aspect > ASPECT_PORTRAIT_THRESHOLD:
                    target_w = max(8, round(opts.grid_size / aspect))
                else:  # landscape: aspect < ASPECT_LANDSCAPE_THRESHOLD
                    target_w = opts.grid_size
                cropped_bytes = _crop_source_to_subject(
                    image_bytes, first["width"], first["height"], bbox_grid,
                )
                final = _quantize_dmc_map(
                    cropped_bytes, opts, grid_width=target_w,
                )

    # Step 7 — render the multi-page selling-grade chart PDF.
    # render_pattern_pdf returns ONE PDF (cover + DMC list + chart
    # sections) instead of the previous color/BW pair; the cover page
    # uses the original source bytes for the preview block.
    grid_rows = final["grid"]
    background_dmc = final["backgroundDmc"]
    colors = final["colors"]

    pdf_grid: list[list[Optional[str]]] = [
        [None if (background_dmc and code == background_dmc) else code for code in row]
        for row in grid_rows
    ]
    pdf_dmc_map: dict[str, dict[str, str]] = {
        c["dmc"]: {"hex": c["hex"], "name": c["name"]} for c in colors
    }

    pattern_pdf_b64: Optional[str] = None
    try:
        pattern_pdf_b64 = base64.b64encode(
            render_pattern_pdf(
                pdf_grid,
                pdf_dmc_map,
                pattern_name=opts.pattern_name,
                source_image_bytes=image_bytes,
                fabric_count=16,
            )
        ).decode("ascii")
    except Exception as exc:  # pragma: no cover — diagnostic
        print(f"[pipeline] pattern PDF render failed: {exc}")

    final["patternPdfB64"] = pattern_pdf_b64
    return final
