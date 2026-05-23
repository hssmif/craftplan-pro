"""
Selling-grade cross-stitch chart PDF renderer.

Single entrypoint:

    render_pattern_pdf(grid, dmc_map, pattern_name,
                       source_image_bytes, fabric_count=16) -> bytes

Document structure (matches the format the previous workflow shipped
on Etsy):

  Page 1 — Cover           (title + decorative line + source preview
                            + pattern-details table)
  Page 2 — DMC Thread List (per-thread row: N · SYM · COLOR swatch ·
                            DMC# · NAME · STITCHES · LENGTH · SKEINS)
  Pages 3+ — Chart Sections (max 48 cols × 67 rows per page, with
                             section header, mini-map showing current
                             section, and the cell grid itself).

Inputs
------
grid : list[list[str | None]]
    2-D row-major grid of DMC codes ("3865", "310", ...).  None means
    background — leave that cell white in the chart and exclude from
    the legend / skein totals.
dmc_map : dict[str, dict]
    {"744": {"hex": "#F5D776", "name": "Yellow Pale"}, ...}.  Only
    codes that appear in `grid` need to be present.
pattern_name : str
    Pattern title shown on the cover page (e.g. "White Bunny").
source_image_bytes : bytes
    Raw bytes of the original source image.  Decoded with PIL and
    drawn on the cover page; max 80×80 mm.
fabric_count : int
    Aida count for the finished-size calculation (default 16).

Output
------
bytes — a single complete multi-page PDF document.

Symbol set
----------
36 ASCII symbols, in priority order — symbol[0] goes to the
highest-count DMC, symbol[1] to the second, etc.  The previous
renderer used Unicode glyphs (♡ ✦ ∅) that required a bundled font;
this one uses pure ASCII so the standard Helvetica suffices.

    O + # * V Z S N T A B C D E F G H I J K L M P Q R U W Y @
    2 3 4 5 6 7 8 9

Skein math
----------
DMC stranded floss skeins are 8 m of 6-strand thread.  At 14 ct, one
square inch holds 14 × 14 = 196 stitches; each stitch consumes
roughly 4.5 cm of 2-strand thread which is ~3.2 cm per strand of
floss.  So:

    color_length_m   = stitches × 0.032
    skeins_per_color = max(1, ceil(length_m / 8.0))
    total_skeins     = sum over all colours

These numbers match the rule-of-thumb most pattern shops publish.
"""
from __future__ import annotations

import io
import math
import os
from typing import Optional

from PIL import Image as PILImage
from reportlab.lib.colors import Color, HexColor, black, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


# ── Symbol pool ─────────────────────────────────────────────────────
PATTERN_SYMBOLS: list[str] = [
    "O", "+", "#", "*", "V", "Z", "S", "N", "T",
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
    "P", "Q", "R", "U", "W", "Y",
    "@",
    "2", "3", "4", "5", "6", "7", "8", "9",
]
# 37 entries — alphabet minus X (looks like ✕), plus ASCII punctuation
# and digits.  Pattern palettes never come close to 37 distinct DMCs in
# the Beginner / Etsy preset (≤12) or the Standard preset (≤24); the
# extra slack is for very rich patterns.


# ── Page geometry ───────────────────────────────────────────────────
PAGE_W, PAGE_H = A4

# Chart section dimensions — fit comfortably on A4 with rulers + minimap.
MAX_SECTION_COLS = 48
MAX_SECTION_ROWS = 67

# ── Color constants (sourced from the user spec) ────────────────────
TAN_BROWN_LINE = HexColor("#8B6914")
DARK_BROWN_HEAD = HexColor("#3D2B1F")
LIGHT_GRAY_BORDER = HexColor("#E8E8E8")
HEADER_TAN = HexColor("#C8A87A")
ROW_ALT = HexColor("#FAF7F2")
GRID_THIN = HexColor("#9A9A9A")
RULER_GRAY = HexColor("#666666")
SUBTITLE_GRAY = HexColor("#666666")
CAPTION_GRAY = HexColor("#888888")
MINIMAP_BORDER = HexColor("#9A9A9A")
MINIMAP_RECT_RED = HexColor("#E63946")


# ── Helpers ─────────────────────────────────────────────────────────


def _luminance_0_255(hex_color: str) -> float:
    """ITU-R BT.601 luma — quick and standard for "is this dark?"."""
    h = hex_color.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return 0.299 * r + 0.587 * g + 0.114 * b


def _contrast_ink(hex_color: str):
    """Black on light cells, white on dark — matches NalaAndStitch's
    own legend swatches and the user's spec ("white text if cell
    luminance < 128")."""
    return white if _luminance_0_255(hex_color) < 128 else black


def _calculate_stats(grid, dmc_map) -> dict:
    """Per-DMC stitch count + length + skein estimate, plus globals.

    Sorted by stitch count descending so the legend leads with the
    body fill (highest cell count) and tails with rare accent threads.
    """
    H = len(grid)
    W = len(grid[0]) if H else 0

    counts: dict[str, int] = {}
    for row in grid:
        for code in row:
            if code is None:
                continue
            counts[code] = counts.get(code, 0) + 1

    total_stitches = sum(counts.values())
    sorted_codes = sorted(counts.keys(), key=lambda c: (-counts[c], c))

    entries = []
    for i, code in enumerate(sorted_codes):
        n = counts[code]
        length_m = n * 0.032
        skeins = max(1, math.ceil(length_m / 8.0))
        entries.append({
            "n": i + 1,
            "code": code,
            "name": dmc_map.get(code, {}).get("name", "(unknown)"),
            "hex": dmc_map.get(code, {}).get("hex", "#888888"),
            "stitches": n,
            "length_m": length_m,
            "skeins": skeins,
            "symbol": PATTERN_SYMBOLS[i % len(PATTERN_SYMBOLS)],
        })
    total_skeins = sum(e["skeins"] for e in entries)

    finished_14_in = (round(W / 14, 1), round(H / 14, 1))
    finished_14_cm = (
        round(finished_14_in[0] * 2.54, 1),
        round(finished_14_in[1] * 2.54, 1),
    )
    finished_16_in = (round(W / 16, 1), round(H / 16, 1))
    finished_16_cm = (
        round(finished_16_in[0] * 2.54, 1),
        round(finished_16_in[1] * 2.54, 1),
    )

    return {
        "W": W,
        "H": H,
        "total_stitches": total_stitches,
        "total_skeins": total_skeins,
        "n_colors": len(entries),
        "entries": entries,
        "code_to_symbol": {e["code"]: e["symbol"] for e in entries},
        "finished_14_in": finished_14_in,
        "finished_14_cm": finished_14_cm,
        "finished_16_in": finished_16_in,
        "finished_16_cm": finished_16_cm,
    }


def _build_minimap(grid, dmc_map) -> PILImage.Image:
    """Render the full grid at 2px/cell as a PIL RGB image.  Used on
    chart-section pages to show "you are here" — a red box overlays
    the current section's bounds."""
    H = len(grid)
    W = len(grid[0]) if H else 0
    px = 2
    img = PILImage.new("RGB", (W * px, H * px), (255, 255, 255))
    pixels = img.load()
    for y in range(H):
        row = grid[y]
        for x in range(W):
            code = row[x]
            if code is None:
                continue
            hex_c = dmc_map.get(code, {}).get("hex", "#888888")
            h = hex_c.lstrip("#")
            r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
            for dy in range(px):
                for dx in range(px):
                    pixels[x * px + dx, y * px + dy] = (r, g, b)
    return img


# ── Page 1: Cover ───────────────────────────────────────────────────


def _draw_cover_page(
    c: canvas.Canvas,
    stats: dict,
    pattern_name: str,
    source_image_bytes: Optional[bytes],
) -> None:
    # Title — bold 28pt, centered, top margin 40 mm
    c.setFont("Helvetica-Bold", 28)
    c.setFillColor(black)
    title_y = PAGE_H - 40 * mm
    c.drawCentredString(PAGE_W / 2, title_y, pattern_name)

    # Decorative line — 80mm wide, 1.5pt, tan/brown #8B6914,
    # centered, 8mm below title baseline
    line_y = title_y - 8 * mm
    c.setStrokeColor(TAN_BROWN_LINE)
    c.setLineWidth(1.5)
    line_w = 80 * mm
    c.line((PAGE_W - line_w) / 2, line_y, (PAGE_W + line_w) / 2, line_y)

    # Source image — centered, max 80×80mm, light gray border
    # #E8E8E8, 4pt padding, 15mm below the line.
    img_top_y = line_y - 15 * mm
    img_max = 80 * mm
    img_bottom_y = img_top_y - img_max
    if source_image_bytes:
        try:
            pil = PILImage.open(io.BytesIO(source_image_bytes))
            iw, ih = pil.size
            scale = min(img_max / iw, img_max / ih)
            draw_w = iw * scale
            draw_h = ih * scale
            img_x = (PAGE_W - draw_w) / 2
            img_bottom_y = img_top_y - draw_h
            pad = 4
            # Border + padding box (filled with light gray)
            c.setFillColor(LIGHT_GRAY_BORDER)
            c.setStrokeColor(LIGHT_GRAY_BORDER)
            c.rect(
                img_x - pad, img_bottom_y - pad,
                draw_w + 2 * pad, draw_h + 2 * pad,
                stroke=0, fill=1,
            )
            c.drawImage(
                ImageReader(pil), img_x, img_bottom_y,
                width=draw_w, height=draw_h, mask="auto",
            )
        except Exception:
            # Renderer must NEVER crash on a malformed source image —
            # the pipeline still owes the caller a valid PDF even if
            # the cover preview is missing.
            img_bottom_y = img_top_y - img_max

    # Caption "PATTERN PREVIEW" 8pt gray centered, 4mm below image
    c.setFont("Helvetica", 8)
    c.setFillColor(CAPTION_GRAY)
    caption_y = img_bottom_y - 4 * mm
    c.drawCentredString(PAGE_W / 2, caption_y, "PATTERN PREVIEW")

    # Pattern Details table — 120mm wide, centered, 12mm below caption
    rows = [
        ("Size", f"{stats['W']} × {stats['H']} stitches"),
        ("Colors", f"{stats['n_colors']} DMC threads"),
        ("Stitches", f"{stats['total_stitches']:,} total"),
        (
            "Finished (14 ct)",
            f'{stats["finished_14_in"][0]}" × {stats["finished_14_in"][1]}"  '
            f'({stats["finished_14_cm"][0]}cm × {stats["finished_14_cm"][1]}cm)',
        ),
        (
            "Finished (16 ct)",
            f'{stats["finished_16_in"][0]}" × {stats["finished_16_in"][1]}"  '
            f'({stats["finished_16_cm"][0]}cm × {stats["finished_16_cm"][1]}cm)',
        ),
        ("Skeins (est.)", f"{stats['total_skeins']} DMC skeins"),
    ]

    table_w = 120 * mm
    table_x = (PAGE_W - table_w) / 2
    label_w = 55 * mm
    row_h = 14
    header_h = 16

    cur_y = caption_y - 12 * mm

    # Header strip — dark brown #3D2B1F, white bold 10pt, "Pattern Details"
    c.setFillColor(DARK_BROWN_HEAD)
    c.rect(table_x, cur_y - header_h, table_w, header_h, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(table_x + 6, cur_y - header_h + 5, "Pattern Details")
    cur_y -= header_h

    for i, (label, value) in enumerate(rows):
        bg = white if i % 2 == 0 else ROW_ALT
        c.setFillColor(bg)
        c.rect(table_x, cur_y - row_h, table_w, row_h, stroke=0, fill=1)
        c.setFillColor(black)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(table_x + 6, cur_y - row_h + 4.5, label)
        c.setFont("Helvetica", 9)
        c.drawString(table_x + label_w, cur_y - row_h + 4.5, value)
        cur_y -= row_h


# ── Page 2: DMC Thread List ────────────────────────────────────────


def _draw_dmc_list_page(c: canvas.Canvas, stats: dict) -> None:
    margin = 20 * mm
    title_y = PAGE_H - margin

    # Title
    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(margin, title_y, "DMC Thread List")

    # Subtitle
    c.setFillColor(SUBTITLE_GRAY)
    c.setFont("Helvetica", 9)
    sub_y = title_y - 14
    c.drawString(
        margin, sub_y,
        f"{stats['n_colors']} colors · {stats['total_stitches']:,} total stitches",
    )

    # Column widths chosen per user spec — total ≈ 169 mm
    cols = [
        ("N", 8 * mm),
        ("SYM", 12 * mm),
        ("COLOR", 18 * mm),
        ("DMC #", 16 * mm),
        ("NAME", 55 * mm),
        ("STITCHES", 22 * mm),
        ("LENGTH", 20 * mm),
        ("SKEINS", 18 * mm),
    ]
    table_w = sum(w for _, w in cols)
    table_x = margin
    header_h = 14
    row_h = 14

    # Header — tan #C8A87A bg, bold 8pt white, centered per cell
    cur_y = sub_y - 16
    c.setFillColor(HEADER_TAN)
    c.rect(table_x, cur_y - header_h, table_w, header_h, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 8)
    cx = table_x
    for label, w in cols:
        c.drawCentredString(cx + w / 2, cur_y - header_h + 4.5, label)
        cx += w
    cur_y -= header_h

    # Rows — sorted by stitch count desc, alternating white/#FAF7F2.
    # Uses the natural pagination cap if a pattern explodes past one
    # page (extremely rare at 12-thread Beginner / 24-thread Standard
    # palettes — a 36-color list fits in 36×14pt = 504pt < page height).
    for i, e in enumerate(stats["entries"]):
        # Page break protection — if we run out of vertical room we
        # start a fresh DMC List continuation page.  The Beginner /
        # Etsy preset never triggers this (≤12 threads), but it's
        # cheap insurance.
        if cur_y - row_h < margin:
            c.showPage()
            cur_y = PAGE_H - margin
            c.setFillColor(HEADER_TAN)
            c.rect(table_x, cur_y - header_h, table_w, header_h, stroke=0, fill=1)
            c.setFillColor(white)
            c.setFont("Helvetica-Bold", 8)
            cx = table_x
            for label, w in cols:
                c.drawCentredString(cx + w / 2, cur_y - header_h + 4.5, label)
                cx += w
            cur_y -= header_h

        bg = white if i % 2 == 0 else ROW_ALT
        c.setFillColor(bg)
        c.rect(table_x, cur_y - row_h, table_w, row_h, stroke=0, fill=1)

        cx = table_x
        text_y = cur_y - row_h + 4.5

        # N (centered)
        c.setFillColor(black)
        c.setFont("Helvetica", 9)
        c.drawCentredString(cx + cols[0][1] / 2, text_y, str(e["n"]))
        cx += cols[0][1]

        # SYM (bold centered 10pt)
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(cx + cols[1][1] / 2, text_y - 0.5, e["symbol"])
        cx += cols[1][1]

        # COLOR — solid color rect 32×12pt centered in the cell
        rect_w, rect_h = 32, 12
        rect_x = cx + (cols[2][1] - rect_w) / 2
        rect_y = cur_y - row_h + (row_h - rect_h) / 2
        c.setFillColor(HexColor(e["hex"]))
        c.setStrokeColor(HexColor("#444444"))
        c.setLineWidth(0.4)
        c.rect(rect_x, rect_y, rect_w, rect_h, stroke=1, fill=1)
        cx += cols[2][1]

        # DMC # (centered)
        c.setFillColor(black)
        c.setFont("Helvetica", 9)
        c.drawCentredString(cx + cols[3][1] / 2, text_y, e["code"])
        cx += cols[3][1]

        # NAME (left-aligned, truncated if too long)
        c.setFont("Helvetica", 9)
        name = e["name"]
        if len(name) > 32:
            name = name[:30] + "…"
        c.drawString(cx + 3, text_y, name)
        cx += cols[4][1]

        # STITCHES (right-aligned)
        c.drawRightString(cx + cols[5][1] - 4, text_y, f"{e['stitches']:,}")
        cx += cols[5][1]

        # LENGTH "71.8m" (right-aligned)
        c.drawRightString(cx + cols[6][1] - 4, text_y, f"{e['length_m']:.1f}m")
        cx += cols[6][1]

        # SKEINS (right-aligned)
        c.drawRightString(cx + cols[7][1] - 4, text_y, str(e["skeins"]))

        cur_y -= row_h


# ── Pages 3+: Chart Sections ───────────────────────────────────────


def _draw_chart_section(
    c: canvas.Canvas,
    grid,
    stats: dict,
    dmc_map: dict,
    minimap: PILImage.Image,
    section_idx: int,
    total_sections: int,
    row_start: int, row_end: int,
    col_start: int, col_end: int,
) -> None:
    H = stats["H"]
    W = stats["W"]
    margin = 12 * mm

    # ── Header strip ─────────────────────────────────────────────
    header_top = PAGE_H - margin

    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(margin, header_top - 11, f"Section {section_idx} of {total_sections}")
    c.setFillColor(SUBTITLE_GRAY)
    c.setFont("Helvetica", 8)
    c.drawString(
        margin, header_top - 23,
        f"Rows {row_start + 1}–{row_end} · Cols {col_start + 1}–{col_end}",
    )

    # Mini-map — 30×30 mm max, top-right
    minimap_max = 30 * mm
    miw, mih = minimap.size
    scale = min(minimap_max / miw, minimap_max / mih)
    map_w = miw * scale
    map_h = mih * scale
    map_x = PAGE_W - margin - map_w
    map_y = header_top - map_h
    c.drawImage(
        ImageReader(minimap), map_x, map_y,
        width=map_w, height=map_h, mask=None,
    )
    c.setStrokeColor(MINIMAP_BORDER)
    c.setLineWidth(0.5)
    c.rect(map_x, map_y, map_w, map_h, stroke=1, fill=0)

    # Red rectangle showing this section's bounds in the minimap
    cell_map_w = map_w / W
    cell_map_h = map_h / H
    rect_x = map_x + col_start * cell_map_w
    # PDF Y axis goes UP; grid rows go DOWN, so the section's top
    # row (row_start) is at the high-Y end of the minimap rectangle.
    rect_y = map_y + (H - row_end) * cell_map_h
    rect_w = (col_end - col_start) * cell_map_w
    rect_h = (row_end - row_start) * cell_map_h
    c.setStrokeColor(MINIMAP_RECT_RED)
    c.setLineWidth(1.2)
    c.rect(rect_x, rect_y, rect_w, rect_h, stroke=1, fill=0)

    # ── Chart grid ───────────────────────────────────────────────
    section_rows = row_end - row_start
    section_cols = col_end - col_start

    # Vertical room: from `header_top - max(map_h, ~28pt)` down to
    # the bottom margin, minus ruler padding above + below.
    grid_top_y = header_top - max(map_h, 28) - 10
    grid_bottom_y = margin

    avail_w = PAGE_W - 2 * margin
    avail_h = grid_top_y - grid_bottom_y

    # Reserve ruler bands on top + bottom + left + right.
    ruler_pad = 14
    chart_w = avail_w - 2 * ruler_pad
    chart_h = avail_h - 2 * ruler_pad

    cell_size = min(chart_w / section_cols, chart_h / section_rows)
    grid_w = cell_size * section_cols
    grid_h = cell_size * section_rows
    grid_x0 = margin + ruler_pad + (chart_w - grid_w) / 2
    grid_y0 = grid_bottom_y + ruler_pad + (chart_h - grid_h) / 2

    # Two symbol sizes:
    #   - Normal cells: cell_size × 0.55 (the existing default).
    #   - Very-dark cells (luma < 60 — dark green, near-black, dark
    #     brown): cell_size × 0.7 so the white-on-dark glyph stays
    #     readable at small chart scales.  Dark zones in a cross-stitch
    #     chart are also where the symbol matters most (you can't read
    #     the colour itself, you read the symbol), so beefier glyphs
    #     here improve legibility without affecting bright zones.
    sym_size_normal = max(2.0, cell_size * 0.55)
    sym_size_dark = max(2.0, cell_size * 0.70)
    DARK_LUMA_THRESHOLD = 60.0
    code_to_symbol = stats["code_to_symbol"]

    # 1) Cell fills + symbols (paint BEFORE grid lines so lines paint cleanly).
    for ry in range(section_rows):
        gy = row_start + ry
        if gy >= H:
            continue
        cy_bottom = grid_y0 + grid_h - (ry + 1) * cell_size
        for rx in range(section_cols):
            gx = col_start + rx
            if gx >= W:
                continue
            code = grid[gy][gx]
            if code is None:
                continue
            cx = grid_x0 + rx * cell_size
            hex_c = dmc_map.get(code, {}).get("hex", "#888888")
            luma = _luminance_0_255(hex_c)
            is_dark = luma < DARK_LUMA_THRESHOLD

            c.setFillColor(HexColor(hex_c))
            if is_dark:
                # Thin white border (0.5pt) around very-dark cells so
                # adjacent dark blocks (dark green next to dark brown,
                # black on dark brown outline) don't merge into one
                # silhouette.  The border is drawn ON the fill, not
                # outside, so cell footprint is unchanged — the visible
                # white edge is ~0.25pt either side of the boundary.
                c.setStrokeColor(white)
                c.setLineWidth(0.5)
                c.rect(cx, cy_bottom, cell_size, cell_size, stroke=1, fill=1)
            else:
                c.setStrokeColor(HexColor(hex_c))
                c.rect(cx, cy_bottom, cell_size, cell_size, stroke=0, fill=1)

            sym = code_to_symbol.get(code)
            if sym:
                # Dark cells force white ink + larger glyph; light cells
                # use the existing contrast-aware ink (black on bright
                # cells, white on mid-tones that are still ≥ 60 luma).
                if is_dark:
                    ink = white
                    sym_size = sym_size_dark
                else:
                    ink = _contrast_ink(hex_c)
                    sym_size = sym_size_normal
                c.setFillColor(ink)
                c.setFont("Helvetica-Bold", sym_size)
                c.drawCentredString(
                    cx + cell_size / 2,
                    cy_bottom + cell_size / 2 - sym_size * 0.32,
                    sym,
                )

    # 2) Grid lines — thin everywhere, bold every 5 (anchored to the
    # GLOBAL coordinate so bold lines align across sections).
    c.setStrokeColor(GRID_THIN)
    c.setLineWidth(0.2)
    for i in range(1, section_cols):
        x = grid_x0 + i * cell_size
        c.line(x, grid_y0, x, grid_y0 + grid_h)
    for j in range(1, section_rows):
        y = grid_y0 + j * cell_size
        c.line(grid_x0, y, grid_x0 + grid_w, y)

    c.setStrokeColor(black)
    c.setLineWidth(1.2)
    for i in range(section_cols + 1):
        gx = col_start + i
        if gx % 5 == 0 and 0 < i < section_cols:
            x = grid_x0 + i * cell_size
            c.line(x, grid_y0, x, grid_y0 + grid_h)
    for j in range(section_rows + 1):
        gy = row_start + j
        if gy % 5 == 0 and 0 < j < section_rows:
            y = grid_y0 + grid_h - j * cell_size
            c.line(grid_x0, y, grid_x0 + grid_w, y)

    # 3) Outer border 1.5pt
    c.setLineWidth(1.5)
    c.rect(grid_x0, grid_y0, grid_w, grid_h, stroke=1, fill=0)

    # 4) Rulers — col numbers top + bottom, row numbers left + right.
    c.setFont("Helvetica", 6)
    c.setFillColor(RULER_GRAY)
    # Cols
    for i in range(section_cols + 1):
        gx = col_start + i
        if not (gx % 5 == 0 or i == 0 or i == section_cols):
            continue
        # Label is the 1-indexed grid column at that boundary.
        # i = 0 → col_start + 1 (first col in this section)
        # i = section_cols → col_end (last col in this section)
        # else: gx itself (1-indexed at the boundary, or technically
        #       gx+1 for the column to the right of the boundary).
        # We label the column-NUMBER that sits to the right of the
        # boundary, so at i=0 it's col_start+1.
        label_col = gx + 1 if i == 0 else gx
        x = grid_x0 + i * cell_size
        c.drawCentredString(x, grid_y0 + grid_h + 4, str(label_col))
        c.drawCentredString(x, grid_y0 - 9, str(label_col))
    # Rows
    for j in range(section_rows + 1):
        gy = row_start + j
        if not (gy % 5 == 0 or j == 0 or j == section_rows):
            continue
        label_row = gy + 1 if j == 0 else gy
        y = grid_y0 + grid_h - j * cell_size
        c.drawRightString(grid_x0 - 3, y - 2, str(label_row))
        c.drawString(grid_x0 + grid_w + 3, y - 2, str(label_row))

    # 5) Center markers — only if center falls inside this section.
    c.setFillColor(black)
    center_col_global = W / 2.0  # boundary, in global cell coords
    center_row_global = H / 2.0
    tri_h = 4.0
    tri_w = 4.0

    if col_start <= center_col_global <= col_end:
        cx_center = grid_x0 + (center_col_global - col_start) * cell_size
        # ▼ above
        p = c.beginPath()
        p.moveTo(cx_center - tri_w, grid_y0 + grid_h + tri_h + 1)
        p.lineTo(cx_center + tri_w, grid_y0 + grid_h + tri_h + 1)
        p.lineTo(cx_center, grid_y0 + grid_h + 1)
        p.close()
        c.drawPath(p, fill=1, stroke=0)
        # ▲ below
        p = c.beginPath()
        p.moveTo(cx_center - tri_w, grid_y0 - tri_h - 1)
        p.lineTo(cx_center + tri_w, grid_y0 - tri_h - 1)
        p.lineTo(cx_center, grid_y0 - 1)
        p.close()
        c.drawPath(p, fill=1, stroke=0)

    if row_start <= center_row_global <= row_end:
        cy_center = grid_y0 + grid_h - (center_row_global - row_start) * cell_size
        # ► left
        p = c.beginPath()
        p.moveTo(grid_x0 - tri_w - 1, cy_center - tri_h)
        p.lineTo(grid_x0 - tri_w - 1, cy_center + tri_h)
        p.lineTo(grid_x0 - 1, cy_center)
        p.close()
        c.drawPath(p, fill=1, stroke=0)
        # ◄ right
        p = c.beginPath()
        p.moveTo(grid_x0 + grid_w + tri_w + 1, cy_center - tri_h)
        p.lineTo(grid_x0 + grid_w + tri_w + 1, cy_center + tri_h)
        p.lineTo(grid_x0 + grid_w + 1, cy_center)
        p.close()
        c.drawPath(p, fill=1, stroke=0)


# ── Public API ─────────────────────────────────────────────────────


def render_pattern_pdf(
    grid,
    dmc_map: dict,
    pattern_name: str,
    source_image_bytes: Optional[bytes],
    fabric_count: int = 16,
) -> bytes:
    """See module docstring for layout details."""
    if not pattern_name or not pattern_name.strip():
        pattern_name = "Cross-Stitch Pattern"
    pattern_name = pattern_name.strip()

    H = len(grid)
    W = len(grid[0]) if H else 0
    if H == 0 or W == 0:
        raise ValueError("grid must be non-empty")

    stats = _calculate_stats(grid, dmc_map)

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(pattern_name)

    # Page 1 — Cover
    _draw_cover_page(c, stats, pattern_name, source_image_bytes)
    c.showPage()

    # Page 2 — DMC Thread List (may showPage internally if list overflows)
    _draw_dmc_list_page(c, stats)
    c.showPage()

    # Pages 3+ — Chart Sections.  Build the minimap once and reuse.
    minimap = _build_minimap(grid, dmc_map)

    n_section_cols = max(1, math.ceil(W / MAX_SECTION_COLS))
    n_section_rows = max(1, math.ceil(H / MAX_SECTION_ROWS))
    total_sections = n_section_cols * n_section_rows

    section_idx = 1
    for sr in range(n_section_rows):
        row_start = sr * MAX_SECTION_ROWS
        row_end = min(row_start + MAX_SECTION_ROWS, H)
        for sc in range(n_section_cols):
            col_start = sc * MAX_SECTION_COLS
            col_end = min(col_start + MAX_SECTION_COLS, W)
            _draw_chart_section(
                c, grid, stats, dmc_map, minimap,
                section_idx, total_sections,
                row_start, row_end, col_start, col_end,
            )
            c.showPage()
            section_idx += 1

    c.save()
    return buf.getvalue()
