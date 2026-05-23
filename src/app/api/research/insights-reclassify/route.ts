// ══════════════════════════════════════════════════════════════════════
// Research — Insights Reclassify (Gemini-backed catch-up classifier)
//
// POST /api/research/insights-reclassify
//   Body: { limit?: number }   default limit=50
//
// Walks all distinct term_normalized values in etsy_insights_terms
// that have is_digital = NULL (i.e. the heuristic couldn't classify
// them on insert, OR they were captured before Phase-7b shipped) and
// classifies them via Gemini in batches of 30.
//
// Idempotent — only touches rows where is_digital IS NULL. Safe to
// call repeatedly; eventually the entire history is tagged.
//
// Use case: after a sweep adds 400 new terms, hit this endpoint to
// catch up classification. UI can also call it on a timer or on
// /research mount.
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import {
  getUnclassifiedInsightsTerms,
  updateInsightsClassification,
} from "@/lib/db";
import { classifyHeuristic, classifyWithGeminiBatch } from "@/lib/digital-classifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH_SIZE = 30; // Gemini call cap — matches the lib helper

export async function POST(req: NextRequest) {
  let body: { limit?: number } = {};
  try {
    body = (await req.json()) as { limit?: number };
  } catch {
    /* body optional */
  }
  const limit = Math.max(1, Math.min(500, body.limit ?? 50));

  try {
    const pending = getUnclassifiedInsightsTerms(limit);
    if (pending.length === 0) {
      return NextResponse.json({ success: true, classified: 0, processed: 0 });
    }

    let totalClassified = 0;
    let viaHeuristic = 0;
    let viaGemini = 0;
    const needsGemini: Array<{ term: string; term_normalized: string }> = [];

    // ── Step 1: try the heuristic on each pending term ──────────────
    // Heuristic is fast (regex), free, and deterministic. Whatever it
    // classifies confidently we save immediately. Whatever returns
    // null (genuinely ambiguous) gets queued for Gemini.
    for (const p of pending) {
      const h = classifyHeuristic(p.term);
      if (h) {
        updateInsightsClassification(p.term_normalized, h);
        totalClassified += 1;
        viaHeuristic += 1;
      } else {
        needsGemini.push(p);
      }
    }

    // ── Step 2: Gemini batch-classify the leftovers ─────────────────
    for (let i = 0; i < needsGemini.length; i += BATCH_SIZE) {
      const chunk = needsGemini.slice(i, i + BATCH_SIZE);
      const terms = chunk.map((p) => p.term);
      const results = await classifyWithGeminiBatch(terms);
      for (let j = 0; j < chunk.length; j++) {
        const c = results[j];
        if (!c) continue;
        const changed = updateInsightsClassification(chunk[j].term_normalized, c);
        if (changed > 0) {
          totalClassified += 1;
          viaGemini += 1;
        }
      }
    }

    return NextResponse.json({
      success: true,
      processed: pending.length,
      classified: totalClassified,
      viaHeuristic,
      viaGemini,
      pendingBefore: pending.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "reclassify failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  // Lightweight summary — how many terms are still unclassified?
  try {
    const pending = getUnclassifiedInsightsTerms(1000);
    return NextResponse.json({
      success: true,
      pending: pending.length,
      sample: pending.slice(0, 10).map((p) => p.term),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "summary failed" },
      { status: 500 },
    );
  }
}
