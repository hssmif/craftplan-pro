import { NextRequest, NextResponse } from "next/server";

// Post-convert chart refinement via GPT-4o Vision.
//
// LESSON LEARNED (first iteration made charts WORSE):
//   GPT-4o Vision is great at describing images but BAD at precise grid
//   coordinates. Asked for (x1,y1,x2,y2), it produced confident-but-wrong
//   rectangles — a 2-cell eye pupil would be filled as a 5×5 black blob,
//   or "close this gap" would draw a stroke across cells that weren't
//   broken in the first place.
//
// SAFETY RAILS (v2):
//   1. Chart-quality gate: GPT first rates the chart 0–10. If >=7, we
//      bail out and return an empty plan — no "just tweak it" fills.
//   2. Tiny ops only: fill_rect capped to 3×3 cells, stroke_line to 8
//      cells, fill_cells to 6 cells. Enforced in the applier — oversized
//      ops are rejected, not clipped.
//   3. Confidence gate: every op carries "confidence": "high" | "low".
//      Only "high" ops apply. Low-confidence ops appear in the issue list
//      for transparency but do NOT mutate the grid.
//   4. Op count cap: 8 ops max (was 50). The goal is surgical fixes to
//      OBVIOUS defects, not a wholesale redraw.
//   5. Temperature 0: deterministic output; no creative reinterpretation
//      of "what a bunny should look like".
//
// Flow:
//   1. Client sends current chart grid + cleaned source + chart preview
//      bitmap + DMC legend.
//   2. GPT rates the chart; if good, returns empty.
//   3. If defects exist, GPT emits small high-confidence operations.
//   4. Server applies only the whitelisted-size / high-confidence ops.
//   5. Grid round-trips to the client; refine_issues list surfaces what
//      was (and wasn't) applied for transparency.

export const maxDuration = 120;

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

// Hard caps — enforced server-side regardless of what GPT emits.
const MAX_OPS = 8;
const MAX_RECT_SIZE = 3;        // 3×3 cells max per fill_rect
const MAX_LINE_LEN = 8;         // 8 cells max per stroke_line
const MAX_CELLS_PER_OP = 6;     // 6 cells max per fill_cells
const MIN_RATING_TO_REFINE = 7; // if GPT rates chart >=7, skip refine

type Confidence = "high" | "low";

type Op =
  | { op: "fill_rect"; x1: number; y1: number; x2: number; y2: number; color: string; confidence?: Confidence; reason?: string }
  | { op: "fill_cells"; cells: [number, number][]; color: string; confidence?: Confidence; reason?: string }
  | { op: "stroke_line"; x1: number; y1: number; x2: number; y2: number; color: string; confidence?: Confidence; reason?: string }
  | { op: "replace_color_in_rect"; x1: number; y1: number; x2: number; y2: number; from: string; to: string; confidence?: Confidence; reason?: string };

type RefinePlan = {
  rating?: number;
  assessment?: string;
  issues?: string[];
  operations?: Op[];
};

function buildPrompt(legend: Record<string, string>, gw: number, gh: number, aidaDmc: string): string {
  const legendStr = Object.entries(legend)
    .map(([code, hex]) => `  "${code}": "${hex}"`)
    .join(",\n");
  return `You are a cross-stitch pattern QA reviewer. You will see TWO images:

1. SOURCE — the cleaned cartoon illustration (the target).
2. CHART — the current cross-stitch chart output (what the quantizer produced).

Your job is TWO-PHASE:
  PHASE 1: Rate how faithfully the CHART reproduces the SOURCE on a 0–10 scale.
           A chart that already reads as the subject (face, outlines, key features
           all present, colors recognizable) is a 7 or higher.
  PHASE 2: IF AND ONLY IF your rating is 6 or less, identify the single
           biggest SPECIFIC, VISIBLE defect and emit at most 3 tiny
           high-confidence operations to correct it.

CRITICAL — BE EXTREMELY CONSERVATIVE:
  • If you are NOT 100% certain a cell needs to change, DO NOT include an op for it.
  • If in doubt, emit NO operations. A no-op is infinitely better than a wrong op.
  • Previous version of this tool made charts WORSE by confidently mis-locating
    fills. The fix is: emit fewer, smaller, higher-confidence ops.
  • DO NOT invent defects. If the eyes already look like eyes, don't "improve" them.
  • DO NOT "close gaps" in outlines unless you can point to a clear, visible break
    ≥2 cells long that a human embroidering the chart would notice.

GRID: ${gw} columns × ${gh} rows. Coordinates: x=0..${gw - 1}, y=0..${gh - 1}.
Top-left = (0,0). Use the ruler numbers printed on the chart edges to locate cells.

AVAILABLE DMC COLORS (code → hex):
{
${legendStr}
}

AIDA (unstitched background) = "${aidaDmc}".

HARD SIZE LIMITS — operations larger than these are REJECTED server-side:
  • fill_rect:  max ${MAX_RECT_SIZE}×${MAX_RECT_SIZE} cells  (i.e. x2-x1 ≤ ${MAX_RECT_SIZE - 1})
  • stroke_line: max ${MAX_LINE_LEN} cells in length
  • fill_cells:  max ${MAX_CELLS_PER_OP} cells
  • Total ops: max 3 (hard cap ${MAX_OPS})

OPERATION CONFIDENCE:
  Every op MUST include "confidence": "high" or "low".
  • "high" = you can see the exact defect and exact fix location
  • "low"  = you suspect but aren't sure
  ONLY high-confidence ops apply. Low-confidence ops appear in the notes only.

DEFECT CATEGORIES (in priority order, ONLY fix if OBVIOUS):
  1. MISSING PUPILS — eye pupil cells absent when source shows a solid black dot.
     Use fill_cells with 1-4 specific cells, NOT fill_rect.
  2. CLEAR GAP IN OUTLINE — a visible ≥2-cell break in a dark outline that
     otherwise connects. Use stroke_line.
  3. ISOLATED STRAY SPECK — a 1–2 cell blob of wrong color in clear aida space.
     Use fill_cells to replace with aida "${aidaDmc}".
  4. CLEARLY-WRONG COLOR in a small region. Use replace_color_in_rect.

EMIT EXACTLY THIS JSON (no markdown, no code fence):
{
  "rating": 0-10,
  "assessment": "1-2 sentences: how faithful is the chart overall?",
  "issues": [
    "Plain-English description of each defect you note (even if you don't emit an op)"
  ],
  "operations": [
    {
      "op": "fill_cells",
      "cells": [[74,85],[75,85]],
      "color": "310",
      "confidence": "high",
      "reason": "Nostril dots visible in source, absent in chart at these exact cells"
    }
  ]
}

IF YOUR RATING IS >= ${MIN_RATING_TO_REFINE}, emit { "rating": <n>, "assessment": "...", "issues": [], "operations": [] }.
Do not suggest improvements for an already-good chart.`;
}

/** True if the op is small enough to be safe to apply. */
function opWithinLimits(op: Op): boolean {
  if (op.op === "fill_rect") {
    const w = Math.abs(op.x2 - op.x1) + 1;
    const h = Math.abs(op.y2 - op.y1) + 1;
    return w <= MAX_RECT_SIZE && h <= MAX_RECT_SIZE;
  }
  if (op.op === "fill_cells") {
    return Array.isArray(op.cells) && op.cells.length <= MAX_CELLS_PER_OP;
  }
  if (op.op === "stroke_line") {
    const len = Math.max(Math.abs(op.x2 - op.x1), Math.abs(op.y2 - op.y1)) + 1;
    return len <= MAX_LINE_LEN;
  }
  if (op.op === "replace_color_in_rect") {
    // replace_color_in_rect is non-destructive (only touches cells that
    // already match `from`), so a slightly bigger rect is tolerable — but
    // still cap to 6×6 so it can't silently rewrite a whole region.
    const w = Math.abs(op.x2 - op.x1) + 1;
    const h = Math.abs(op.y2 - op.y1) + 1;
    return w <= 6 && h <= 6;
  }
  return false;
}

function applyOps(grid: string[][], ops: Op[], gw: number, gh: number): { applied: number; skipped: number } {
  let applied = 0;
  let skipped = 0;
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < gw && y < gh;
  const setCell = (x: number, y: number, color: string) => {
    if (!inBounds(x, y)) { skipped++; return; }
    grid[y][x] = color;
    applied++;
  };
  for (const op of ops) {
    if (op.op === "fill_rect") {
      const x1 = Math.min(op.x1, op.x2);
      const y1 = Math.min(op.y1, op.y2);
      const x2 = Math.max(op.x1, op.x2);
      const y2 = Math.max(op.y1, op.y2);
      for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) setCell(x, y, op.color);
      }
    } else if (op.op === "fill_cells") {
      if (!Array.isArray(op.cells)) continue;
      for (const pair of op.cells) {
        if (!Array.isArray(pair) || pair.length !== 2) { skipped++; continue; }
        setCell(pair[0], pair[1], op.color);
      }
    } else if (op.op === "stroke_line") {
      // Bresenham's line.
      let x = op.x1, y = op.y1;
      const dx = Math.abs(op.x2 - op.x1);
      const dy = Math.abs(op.y2 - op.y1);
      const sx = op.x1 < op.x2 ? 1 : -1;
      const sy = op.y1 < op.y2 ? 1 : -1;
      let err = dx - dy;
      let guard = 0;
      while (guard++ < 1000) {
        setCell(x, y, op.color);
        if (x === op.x2 && y === op.y2) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; }
      }
    } else if (op.op === "replace_color_in_rect") {
      const x1 = Math.min(op.x1, op.x2);
      const y1 = Math.min(op.y1, op.y2);
      const x2 = Math.max(op.x1, op.x2);
      const y2 = Math.max(op.y1, op.y2);
      for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) {
          if (!inBounds(x, y)) { skipped++; continue; }
          if (grid[y][x] === op.from) {
            grid[y][x] = op.to;
            applied++;
          }
        }
      }
    }
  }
  return { applied, skipped };
}

// Per user 2026-05-16 cost-saving directive: gpt-4o-mini disabled.
// Refine-with-GPT short-circuits with a clear 503 so the user sees
// "disabled in cost-saving mode" instead of a silent failure.
const GPT_4O_MINI_DISABLED = true;

export async function POST(req: NextRequest) {
  if (GPT_4O_MINI_DISABLED) {
    return NextResponse.json(
      { error: "Refine-with-GPT is disabled in cost-saving mode (gpt-4o-mini turned off). Re-enable by flipping GPT_4O_MINI_DISABLED in the route." },
      { status: 503 },
    );
  }
  try {
    const body = (await req.json()) as {
      grid?: string[][];
      sourceImage?: string;
      chartImage?: string;
      legend?: Record<string, string>;
      aidaDmc?: string;
    };

    const { grid, sourceImage, chartImage, legend, aidaDmc } = body;

    if (!grid || !Array.isArray(grid) || grid.length === 0) {
      return NextResponse.json({ error: "grid required (non-empty 2D array)" }, { status: 400 });
    }
    if (!sourceImage || !chartImage) {
      return NextResponse.json({ error: "sourceImage and chartImage (data URLs) required" }, { status: 400 });
    }
    if (!legend || typeof legend !== "object") {
      return NextResponse.json({ error: "legend (code → hex map) required" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    const gh = grid.length;
    const gw = grid[0].length;
    const aida = aidaDmc || "blanc";

    const prompt = buildPrompt(legend, gw, gh, aida);

    // Cost calibration (2026-04-25):
    //   - Model: gpt-4o → gpt-4o-mini. The per-input-token cost drops
    //     ~17× ($2.50/M → $0.15/M). For this task — rate the chart, then
    //     emit a handful of tiny high-confidence ops — mini is plenty.
    //     The route's safety rails (rating gate at 7+, hard size caps,
    //     confidence:high filter) absorb any precision loss: a less-sharp
    //     model just emits fewer ops, which is the SAFE failure mode.
    //   - SOURCE image: detail:high → detail:low. The source is the
    //     "what should this look like" reference; mini doesn't need pixel
    //     precision there. Cuts ~1300 vision tokens off every call.
    //   - CHART image: kept at detail:high — that's where GPT needs to
    //     read the printed ruler numbers to locate cells correctly.
    //   - max_tokens: 2048 → 1024. The JSON response is tiny (3-8 ops).
    //
    // Result: ~$0.030/call → ~$0.0009/call (97% reduction). Refining a
    // chart now costs a tenth of a cent.
    const resp = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "text", text: "SOURCE (target appearance):" },
              { type: "image_url", image_url: { url: sourceImage, detail: "low" } },
              { type: "text", text: "CURRENT CHART (with ruler numbers for coordinates):" },
              { type: "image_url", image_url: { url: chartImage, detail: "high" } },
            ],
          },
        ],
        response_format: { type: "json_object" },
        // Deterministic: we don't want creative reinterpretation.
        temperature: 0,
        max_tokens: 1024,
      }),
      signal: AbortSignal.timeout(110000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error(`[refine-chart-gpt] OpenAI ${resp.status}:`, errText.substring(0, 600));
      return NextResponse.json(
        { error: `OpenAI error ${resp.status}: ${errText.substring(0, 400)}` },
        { status: resp.status }
      );
    }

    const data = await resp.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "OpenAI returned no content" }, { status: 502 });
    }

    let plan: RefinePlan;
    try {
      plan = JSON.parse(content) as RefinePlan;
    } catch (e) {
      console.error("[refine-chart-gpt] JSON parse failed:", content.substring(0, 400));
      return NextResponse.json(
        { error: "OpenAI returned unparseable JSON", raw: content.substring(0, 500) },
        { status: 502 }
      );
    }

    const rating = typeof plan.rating === "number" ? plan.rating : 0;
    const assessment = typeof plan.assessment === "string" ? plan.assessment : "";
    const issues = Array.isArray(plan.issues) ? plan.issues : [];
    const rawOps = Array.isArray(plan.operations) ? plan.operations : [];

    // Filter to high-confidence + within-limits ops.
    const rejectedReasons: string[] = [];
    const safeOps: Op[] = [];
    for (const op of rawOps) {
      if (safeOps.length >= MAX_OPS) {
        rejectedReasons.push(`Skipped extra ops past cap of ${MAX_OPS}.`);
        break;
      }
      if (op.confidence !== "high") {
        rejectedReasons.push(`Skipped low-confidence op: ${op.reason || op.op}`);
        continue;
      }
      if (!opWithinLimits(op)) {
        rejectedReasons.push(`Skipped oversized op: ${op.reason || op.op}`);
        continue;
      }
      safeOps.push(op);
    }

    // If the chart already looks good, skip refinement entirely.
    const skipBecauseGood = rating >= MIN_RATING_TO_REFINE;

    const newGrid = grid.map((row) => row.slice());
    let applied = 0;
    let skipped = 0;
    if (!skipBecauseGood && safeOps.length > 0) {
      const res = applyOps(newGrid, safeOps, gw, gh);
      applied = res.applied;
      skipped = res.skipped;
    }

    return NextResponse.json({
      grid: newGrid,
      rating,
      assessment,
      issues,
      skippedBecauseGood: skipBecauseGood,
      operations: safeOps,
      rejectedOps: rejectedReasons,
      stats: {
        rating,
        operationsReceived: rawOps.length,
        operationsApplied: safeOps.length,
        cellsApplied: applied,
        cellsSkipped: skipped,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[refine-chart-gpt] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
