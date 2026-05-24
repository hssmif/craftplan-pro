"""
DMC thread palette and color-matching utilities.

The DMC palette is loaded from `dmc_colors.json` (derived from
`src/lib/dmc-colors.ts`, see `scripts/extract_dmc.py`).  All color
distances are computed in CIE LAB (D65) via scikit-image — this is
perceptually uniform, so "nearest color" actually looks nearest to the
human eye, unlike naive RGB distance.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import NamedTuple

import numpy as np
from skimage import color as skcolor

_DMC_JSON = Path(__file__).with_name("dmc_colors.json")

# 50 distinct ASCII symbols for pattern-grid charts.  Matches the JS
# PATTERN_SYMBOLS in src/lib/dmc-colors.ts — order is significant because
# the PDF legend assigns them in array order.
PATTERN_SYMBOLS: list[str] = [
    "X", "O", "+", "#", "*", "V", "Z", "S", "N", "T",
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J",
    "K", "L", "M", "P", "Q", "R", "U", "W", "Y", "@",
    "1", "2", "3", "4", "5", "6", "7", "8", "9", "a",
    "b", "c", "d", "e", "f", "g", "h", "k", "m", "n",
]


class DmcEntry(NamedTuple):
    code: str
    name: str
    hex: str
    rgb: tuple[int, int, int]
    lab: tuple[float, float, float]


def _hex_to_rgb(hex_str: str) -> tuple[int, int, int]:
    h = hex_str.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


@lru_cache(maxsize=1)
def load_palette() -> list[DmcEntry]:
    """
    Load the DMC palette once and cache for the lifetime of the process.

    Converts every entry to LAB up-front so the matching hot-path is a
    single vectorised numpy distance computation per pixel batch.
    """
    raw = json.loads(_DMC_JSON.read_text())
    entries: list[DmcEntry] = []
    # Batch-convert all DMC sRGB triples to LAB at once.  skimage expects
    # values in [0, 1] and shape (..., 3).
    rgb_array = np.array(
        [_hex_to_rgb(e["hex"]) for e in raw], dtype=np.float64
    ) / 255.0
    lab_array = skcolor.rgb2lab(rgb_array.reshape(-1, 1, 3)).reshape(-1, 3)
    for meta, lab in zip(raw, lab_array):
        r, g, b = _hex_to_rgb(meta["hex"])
        entries.append(
            DmcEntry(
                code=meta["code"],
                name=meta["name"],
                hex=meta["hex"],
                rgb=(r, g, b),
                lab=tuple(lab.tolist()),
            )
        )
    return entries


@lru_cache(maxsize=1)
def dmc_lab_matrix() -> np.ndarray:
    """(N, 3) LAB matrix for vectorised nearest-DMC search."""
    return np.array([e.lab for e in load_palette()], dtype=np.float64)


def nearest_dmc_indices(lab_points: np.ndarray) -> np.ndarray:
    """
    Vectorised nearest-DMC lookup.

    Parameters
    ----------
    lab_points : (M, 3) ndarray of LAB triples.

    Returns
    -------
    (M,) ndarray of DMC indices (into load_palette()).
    """
    dmc_lab = dmc_lab_matrix()  # (N, 3)
    # Squared euclidean distance in LAB is monotonic with CIE76 ΔE² — good
    # enough for palette snap.  For the final merge pass we use real ΔE.
    diff = lab_points[:, None, :] - dmc_lab[None, :, :]  # (M, N, 3)
    dist2 = np.einsum("mnk,mnk->mn", diff, diff)
    return np.argmin(dist2, axis=1)


def merge_close_dmcs(
    dmc_indices: np.ndarray,
    max_colors: int,
    merge_threshold: float = 3.5,
) -> np.ndarray:
    """
    Collapse near-duplicate DMC threads in a quantized image.

    The KMeans pass produces clusters whose nearest-DMC matches are
    sometimes two adjacent DMC variants (e.g. "Peach" and "Peach Lt").
    This is visually noisy and inflates the thread count.  We iteratively
    merge the two closest DMCs in the output palette until either:

      - All remaining pairs are further apart than `merge_threshold` in
        ΔE LAB space, OR
      - Only `max_colors` distinct DMCs remain.

    Returns a new dmc_indices array with the merges applied.  The caller
    is free to re-derive the palette by taking np.unique().
    """
    palette = load_palette()
    indices = dmc_indices.copy()
    # Active DMC set and counts.
    unique, counts = np.unique(indices, return_counts=True)

    while True:
        if len(unique) <= max_colors:
            # Even if we hit max_colors, keep merging pairs that are
            # within the ΔE threshold — those are perceptually indistinct
            # and collapsing them makes the pattern cleaner.
            pass

        # Build LAB matrix for the currently active DMCs only.
        lab_active = np.array(
            [palette[i].lab for i in unique], dtype=np.float64
        )
        # Pairwise distances; diag set high so we don't self-match.
        diff = lab_active[:, None, :] - lab_active[None, :, :]
        dist = np.sqrt(np.einsum("ijk,ijk->ij", diff, diff))
        np.fill_diagonal(dist, np.inf)

        min_dist = float(dist.min())
        if min_dist > merge_threshold and len(unique) <= max_colors:
            break
        if len(unique) <= 1:
            break

        # Find the closest pair; merge the LESS-used into the MORE-used
        # so the dominant color's identity is preserved in the legend.
        i, j = np.unravel_index(np.argmin(dist), dist.shape)
        if counts[i] >= counts[j]:
            keep_idx, drop_idx = unique[i], unique[j]
            keep_count, drop_count = counts[i], counts[j]
        else:
            keep_idx, drop_idx = unique[j], unique[i]
            keep_count, drop_count = counts[j], counts[i]

        indices[indices == drop_idx] = keep_idx

        # Update unique/counts in-place rather than recomputing.
        mask = unique != drop_idx
        unique = unique[mask]
        counts = counts[mask]
        counts[unique == keep_idx] = keep_count + drop_count

        # Safety net: if we're above max_colors and merge_threshold is
        # already exhausted, keep going anyway by extending the threshold.
        if min_dist > merge_threshold and len(unique) > max_colors:
            merge_threshold = min_dist + 0.01

    return indices


def assign_symbols(
    dmc_code_to_count: dict[str, int],
) -> dict[str, str]:
    """
    Assign a unique PDF-friendly symbol to each DMC thread.

    Highest-count DMCs get the clearest symbols (X, O, +) because
    they'll appear most often in the legend.
    """
    sorted_codes = sorted(
        dmc_code_to_count.keys(),
        key=lambda c: dmc_code_to_count[c],
        reverse=True,
    )
    symbols: dict[str, str] = {}
    for i, code in enumerate(sorted_codes):
        # If there are more DMCs than symbols (>50), wrap — unlikely but
        # gracefully handle it.
        symbols[code] = PATTERN_SYMBOLS[i % len(PATTERN_SYMBOLS)]
    return symbols
