"""
FastAPI service: POST an image, get a stitch pattern back.

Dev:
    uvicorn main:app --reload --port 8000

The Next.js API route at /api/cross-stitch/python-convert proxies
browser requests to this service on http://localhost:8000.  Python
never faces the public internet in local development.
"""
from __future__ import annotations

import base64
import logging
import time
from typing import Any, Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from pipeline import ConvertOptions, convert_image_to_pattern

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("pattern-engine")

app = FastAPI(title="Cross-Stitch Pattern Engine", version="0.1.0")

# CORS for local dev.  The browser never actually calls this service
# directly — the Next.js proxy at /api/cross-stitch/python-convert does
# — but CORS is kept open to localhost so curl / manual testing works.
# `allow_origins` includes both Next.js dev ports (3461 is the project
# default, 3000 is the stock Next.js default if someone overrides it).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3461",
        "http://localhost:3000",
        "http://127.0.0.1:3461",
        "http://127.0.0.1:3000",
    ],
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)


class ConvertRequest(BaseModel):
    # Accepts either a full data URL (data:image/png;base64,...) or raw
    # base64 without the prefix.  The Next.js proxy typically sends the
    # data URL as-is since that's what the browser hands it.
    image: str = Field(..., description="Base64-encoded image or data URL")
    grid_size: int = Field(150, ge=40, le=400)
    max_colors: int = Field(24, ge=6, le=80)
    merge_de: float = Field(3.5, ge=0.5, le=15.0)
    # Source mode hint.  "photo" (default) runs the canonical pipeline
    # — resize → KMeans → DMC.  "stitch_art" adds a single MedianFilter
    # pre-pass that suppresses the per-stitch X-block / aida-fabric
    # texture that gpt-image-2 stitch-art renders contain, so KMeans
    # sees the underlying flat-colour pattern instead of fragmenting
    # the visible stitches into confetti.  Set by the Design → Convert
    # handoff in page.tsx; user uploads always default to "photo".
    source_mode: Literal["photo", "stitch_art"] = "photo"
    # Title shown on the cover page of the generated PDF.  Empty
    # string → renderer falls back to "Cross-Stitch Pattern".  Pure
    # cosmetic — has no effect on the quantize / DMC pipeline.
    pattern_name: str = ""
    # When True, skip the aspect-aware re-quantize pass so output stays
    # exactly grid_size × grid_size.  Idea-card "Design This →" flows
    # set this; user photo uploads omit it (default False) and keep the
    # subject-fits-canvas aspect crop.
    force_square: bool = False


class ConvertResponse(BaseModel):
    grid: list[list[str]]
    colors: list[dict[str, Any]]
    width: int
    height: int
    totalStitches: int
    backgroundDmc: Optional[str] = None
    # Selling-grade multi-page chart PDF, base64-encoded.  Produced in
    # pipeline.py via render_pattern_pdf (cover + DMC thread list +
    # chart sections).  May be None if rendering failed; the UI hides
    # the download button when the field is missing.
    patternPdfB64: Optional[str] = None
    # Diagnostic — how long the pipeline took end-to-end, in ms.  Shown
    # in the UI status line so we can compare JS vs Python performance.
    engineMs: int


def _decode_image(raw: str) -> bytes:
    """Accept either a data URL or raw base64 and return raw bytes."""
    if raw.startswith("data:"):
        # Split off the "data:image/png;base64," prefix.
        try:
            _, b64 = raw.split(",", 1)
        except ValueError as e:
            raise HTTPException(400, "invalid data URL") from e
    else:
        b64 = raw
    try:
        return base64.b64decode(b64)
    except Exception as e:
        raise HTTPException(400, f"base64 decode failed: {e}") from e


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe.  Next.js hits this at startup to confirm the
    Python service is reachable before enabling the Python engine."""
    return {"status": "ok", "service": "pattern-engine"}


@app.post("/convert", response_model=ConvertResponse)
def convert(req: ConvertRequest) -> ConvertResponse:
    """
    Convert an image to a cross-stitch pattern.  See pipeline.py for
    the exact algorithm.  This endpoint is the only one the Next.js
    UI calls for pattern generation.
    """
    t0 = time.perf_counter()
    image_bytes = _decode_image(req.image)
    result = convert_image_to_pattern(
        image_bytes,
        ConvertOptions(
            grid_size=req.grid_size,
            max_colors=req.max_colors,
            merge_de=req.merge_de,
            source_mode=req.source_mode,
            pattern_name=req.pattern_name,
            force_square=req.force_square,
        ),
    )
    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    log.info(
        "convert done: %dx%d grid, %d threads, %d stitches, %dms",
        result["width"],
        result["height"],
        len(result["colors"]),
        result["totalStitches"],
        elapsed_ms,
    )
    return ConvertResponse(
        **result,
        engineMs=elapsed_ms,
    )
