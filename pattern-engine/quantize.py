"""
Image → stitch grid quantization.

Strategy:

  1. Resize the source image so that output_width = grid_size.  One
     pixel in the resized image = one stitch cell.  This eliminates the
     whole "bin N source pixels into one cell, then mode-vote" phase
     that lost thin features (hat ribs, filigree) in the original JS
     pipeline.

  2. Hand the resized RGBA pixels to libimagequant (pip: `imagequant`)
     with `dithering_level=0.0` and `max_colors = max_colors *
     over_alloc` (default 1.5×).  We over-allocate because we want
     headroom for rare-but-important colors; the DMC merge pass
     collapses the excess later.

     Zero dithering is mandatory for cross-stitch — Floyd-Steinberg
     stippling looks like confetti on an aida grid where every cell is
     a discrete stitch.  Cross-stitch needs solid color blocks.

  3. Each pixel's palette index becomes its cluster id; each palette
     entry's RGB is converted to LAB to match the existing downstream
     contract (centroid_lab fed to nearest_dmc_indices).

  4. Return the (H, W) grid of palette indices + the (K, 3) LAB matrix
     of palette colors.  pipeline.py maps centroids → DMC threads and
     merges via ΔE — no change to that downstream logic.

Why libimagequant over scikit-learn KMeans (our previous choice):
  - libimagequant is the same algorithm pngquant uses; it's literally
    state-of-the-art for fixed-palette quantization on images.  It
    builds a perceptually-tuned histogram, picks colors that best
    represent the source distribution, and remaps each pixel to its
    closest match.
  - KMeans in LAB picks CLUSTER CENTROIDS — averages of pixel groups.
    Averages are not actual source colors; the centroid of cream-body
    + brown-outline pixels is some muddy tan that doesn't exist in the
    source.  libimagequant picks REAL representative colors instead,
    which is why pngquant output never looks washed-out.
  - libimagequant is deterministic without seed control (its histogram
    is built deterministically from the input), so we drop the
    KMeans `random_state=42` knob with no loss of reproducibility.
  - Speed: ~5-10× faster than KMeans+n_init=10 at 150×150.

The ZERO-DITHER requirement is non-negotiable — `dithering_level=0.0`
gives flat solid blocks; even `0.1` would scatter speckled neighbours
into adjacent cells, which on a 1-pixel-per-cell grid reads as
confetti.
"""
from __future__ import annotations

from typing import NamedTuple

import imagequant
import numpy as np
from PIL import Image, ImageFilter
from skimage import color as skcolor


class QuantizeResult(NamedTuple):
    """Result of the quantization pass."""

    cluster_grid: np.ndarray  # (H, W) int — palette index per cell
    centroid_lab: np.ndarray  # (K, 3) float — LAB of each palette entry
    width: int
    height: int


def resize_image_to_grid(
    img: Image.Image, grid_width: int
) -> Image.Image:
    """
    Aspect-preserving resize so the output has exactly `grid_width`
    columns.  Height is computed to preserve the source aspect ratio.

    Uses LANCZOS (high-quality) rather than NEAREST or BILINEAR to
    preserve fine features during aggressive downsampling — a 2048×2048
    MJ source being reduced to 150×150 is a 13× shrink and low-quality
    resamplers will smear thin features.
    """
    w, h = img.size
    if w <= 0 or h <= 0:
        raise ValueError("invalid image dimensions")
    target_h = max(1, round(h * grid_width / w))
    return img.resize((grid_width, target_h), Image.LANCZOS)


def quantize(
    img: Image.Image,
    grid_width: int,
    max_colors: int,
    over_alloc: float = 1.5,
    source_mode: str = "photo",
) -> QuantizeResult:
    """
    Run the full quantization pipeline.

    Parameters
    ----------
    img : Pillow image (any mode, any size, any aspect).
    grid_width : target pattern width in stitch cells.
    max_colors : maximum distinct DMC threads the DMC-mapping stage
        will be allowed to produce.
    over_alloc : multiplier on max_colors for the libimagequant palette
        budget.  Higher = more colors survive to the DMC stage = richer
        output but more work for the merge pass.  1.5 is a good
        default: it gives the merge pass enough headroom to drop 1-2
        near-duplicates without starving the DMC mapper.
    source_mode : "photo" (default) runs LANCZOS straight to libimagequant.
        "stitch_art" applies an 11-pixel MedianFilter pre-pass that
        suppresses gpt-image-2 X-stitch / aida-fabric texture so
        quantization sees the underlying flat design.
    """
    # Ensure RGB (drop alpha if present — alpha becomes aida background
    # later in the pipeline via the lightness check).
    if img.mode != "RGB":
        img = img.convert("RGB")

    # Stitch-art pre-pass — only fires when the caller flagged the
    # source as a finished cross-stitch render (gpt-image-2 Design
    # output).  The render contains visible X-stitch blocks + aida
    # holes + thread highlights at ~10-20px scale; the quantizer treats
    # those high-frequency texture pixels as real colour variation
    # and fragments the underlying flat pattern into confetti.  An
    # 11-pixel median filter erases the per-stitch texture while
    # preserving the bold dark outline (which has a much larger
    # spatial extent), so the quantizer receives the underlying
    # flat-colour design.  Validated on the goose stitch-art test:
    # +487 stitched cells survive bg classification (white body no
    # longer absorbed into aida bg) and confetti drops from 20.6% →
    # 19.9%.  Photo-mode sources bypass this and go straight to
    # LANCZOS resize — backward compatible.
    if source_mode == "stitch_art":
        img = img.filter(ImageFilter.MedianFilter(size=11))

    resized = resize_image_to_grid(img, grid_width)
    W, H = resized.size

    # libimagequant requires RGBA input.  We drop alpha conceptually
    # (the prior pipeline already converted to RGB above), but the
    # library API insists on RGBA bytes; re-attach an opaque alpha
    # plane so every pixel weighs equally in the histogram.
    resized_rgba = resized.convert("RGBA")

    # Palette budget.  libimagequant caps `max_colors` at 256.  We also
    # bound by total pixel count (no point asking for 200 colors on a
    # 10×10 image) — though at our typical 80×80 / 150×150 grid sizes
    # this is never the binding constraint.
    n_clusters = max(2, min(int(round(max_colors * over_alloc)), W * H, 256))

    # Quantize.  `dithering_level=0.0` is the cross-stitch contract:
    # every cell must be a single solid colour, no Floyd-Steinberg
    # speckle into adjacent cells.  min_quality=0 / max_quality=100
    # disables libimagequant's quality-abort safety (we always want a
    # result, even if the image is hard to represent in N colors —
    # the merge pass downstream will collapse near-duplicates).
    quantized = imagequant.quantize_pil_image(
        resized_rgba,
        dithering_level=0.0,
        max_colors=n_clusters,
        min_quality=0,
        max_quality=100,
    )

    # Pixel grid: each cell is a uint8 index into the 256-entry palette
    # table held internally by the P-mode image.  Cast to int64 to
    # match the previous (KMeans-derived) cluster_grid dtype expected
    # by pipeline.py's masking arithmetic.
    cluster_grid = np.asarray(quantized, dtype=np.int64)

    # Extract the palette as an (n_used, 3) RGB uint8 array.  PIL's
    # getpalette() always returns 768 ints (256 entries × RGB), padded
    # with zeros for unused slots — we slice down to the actually-used
    # range so downstream LAB conversion isn't polluted by dummy black
    # entries.  libimagequant packs indices densely starting at 0, so
    # `max_index + 1` is the count.
    n_used = int(cluster_grid.max()) + 1
    flat_palette = quantized.getpalette()
    rgb_palette = np.asarray(
        flat_palette[: n_used * 3], dtype=np.uint8
    ).reshape(-1, 3)

    # Convert the palette to LAB.  pipeline.py feeds this matrix to
    # `nearest_dmc_indices` which expects (K, 3) LAB rows — exactly
    # the shape KMeans's `cluster_centers_` produced.
    rgb_norm = rgb_palette.astype(np.float64) / 255.0
    centroid_lab = skcolor.rgb2lab(
        rgb_norm.reshape(1, -1, 3)
    ).reshape(-1, 3)

    return QuantizeResult(
        cluster_grid=cluster_grid,
        centroid_lab=centroid_lab,
        width=W,
        height=H,
    )
