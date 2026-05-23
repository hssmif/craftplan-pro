import { NextRequest, NextResponse } from "next/server";

/**
 * Thin proxy → Python pattern engine (FastAPI on :8000).
 *
 * The browser never hits the Python service directly — it goes through
 * this Next.js route so:
 *   1. The Python service can stay bound to 127.0.0.1 (never exposed
 *      to the public internet, even when we later deploy to Railway).
 *   2. We can swap the backend URL via one env var (PATTERN_ENGINE_URL)
 *      without touching UI code.
 *   3. The browser honors Next.js cookies / auth middleware naturally.
 *
 * Response contract (matches `PatternData` in page.tsx):
 *   { grid, colors, width, height, totalStitches, backgroundDmc,
 *     patternPdfB64, engineMs }
 *
 * `patternPdfB64` is the selling-grade multi-page chart PDF produced
 * by pattern-engine/pdf_renderer.render_pattern_pdf — cover, DMC
 * thread list, and chart sections in one document.  May be omitted
 * (or null) if the renderer failed; the UI hides the download button
 * in that case.
 */

export const maxDuration = 60;

// Default to local FastAPI.  Set PATTERN_ENGINE_URL in .env to point
// elsewhere (Railway URL in production, for example).
const ENGINE_URL = process.env.PATTERN_ENGINE_URL ?? "http://127.0.0.1:8000";

type ConvertBody = {
  image?: string;      // data URL or raw base64
  gridSize?: number;   // target pattern width in stitches
  maxColors?: number;  // max distinct DMC threads
  mergeDE?: number;    // ΔE LAB merge threshold (optional)
  // Source-mode hint forwarded to the Python engine.  "photo" (default,
  // omitted = "photo") runs the canonical resize+KMeans path; "stitch_art"
  // adds a MedianFilter pre-pass that suppresses gpt-image-2 stitch/aida
  // texture so KMeans sees the underlying flat-colour design.  Only set
  // by the Design → Convert handoff in page.tsx; user uploads omit it.
  sourceMode?: "photo" | "stitch_art";
  // Title shown on the cover page of the generated PDF.  Forwarded as
  // pattern_name to the Python service.  No effect on the chart pipeline.
  patternName?: string;
  // When true, the Python pipeline skips its aspect-aware re-quantize
  // pass and returns an exact gridSize × gridSize square grid.  Idea-card
  // "Design This →" flows set this to keep AI-generated source images
  // (which sometimes compose tall subjects despite the square framing
  // prompt) from producing portrait grids.  User photo uploads omit it
  // (default false) so the existing subject-fits-canvas behaviour stays.
  forceSquare?: boolean;
};

export async function POST(req: NextRequest) {
  let body: ConvertBody;
  try {
    body = (await req.json()) as ConvertBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.image) {
    return NextResponse.json({ error: "image required" }, { status: 400 });
  }

  // Python endpoint uses snake_case; Next.js convention is camelCase.
  // Translate at the boundary so neither side has to accommodate the other.
  const pythonReq = {
    image: body.image,
    grid_size: body.gridSize ?? 150,
    max_colors: body.maxColors ?? 24,
    merge_de: body.mergeDE ?? 3.5,
    source_mode: body.sourceMode ?? "photo",
    pattern_name: body.patternName ?? "",
    force_square: body.forceSquare ?? false,
  };

  try {
    const resp = await fetch(`${ENGINE_URL}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pythonReq),
      // 55s — just under the Next.js maxDuration so the proxy times out
      // cleanly before Vercel/Next does.  KMeans on a 150x150 grid runs
      // in <1s so this is purely a safety net.
      signal: AbortSignal.timeout(55_000),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return NextResponse.json(
        { error: `pattern engine ${resp.status}: ${text.slice(0, 300)}` },
        { status: 502 },
      );
    }

    // Stream the Python response body through as-is — it already matches
    // the PatternData contract the UI expects.
    const data = await resp.json();
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Most common failure mode: Python service not running. Return a
    // clear, actionable error so the user knows what to do (start it
    // with `npm run dev` which launches both).
    const isConnRefused =
      msg.includes("ECONNREFUSED") ||
      msg.includes("fetch failed") ||
      msg.includes("Connect");
    return NextResponse.json(
      {
        error: isConnRefused
          ? `Pattern engine not reachable at ${ENGINE_URL}. Start it with "npm run dev" (launches both Next.js + Python).`
          : `pattern engine error: ${msg}`,
      },
      { status: 503 },
    );
  }
}

/**
 * Health check — hit this from the UI on page load to show a green/red
 * indicator next to the "Convert (Python)" button.
 */
export async function GET() {
  try {
    const resp = await fetch(`${ENGINE_URL}/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    if (!resp.ok) {
      return NextResponse.json({ status: "error", reachable: false });
    }
    return NextResponse.json({ status: "ok", reachable: true });
  } catch {
    return NextResponse.json({ status: "error", reachable: false });
  }
}
