// POST /api/cross-stitch/pipeline/start
//
// Kicks off a server-side auto-pipeline job.  The orchestrator runs
// fire-and-forget in the background — this handler returns the
// job_id immediately so the client can start polling.  Per user
// 2026-05-16 spec: pipeline must survive refresh / nav / tab close.
import { NextRequest, NextResponse } from "next/server";
import { startJob } from "@/lib/auto-pipeline-orchestrator";

// Long maxDuration so the handler itself doesn't get killed before
// it can spawn the background loop.  We RETURN early after spawning,
// so this just covers the spawn overhead.
export const maxDuration = 30;
export const runtime = "nodejs";

interface Body {
  count?: number;
  style?: string;
}

export async function POST(req: NextRequest) {
  try {
    let body: Body = {};
    try {
      body = (await req.json()) as Body;
    } catch { /* default to {} */ }

    const count = Math.max(1, Math.min(20, Math.floor(body.count ?? 1)));
    // 2026-05-19: also accept "bestseller" + "bestseller_*" so the new
    // data-driven UI mode reaches the orchestrator's fetchIdeas branch.
    const allowedFixed = ["all", "funny", "bookmarks", "folk", "bestseller"] as const;
    type Style = typeof allowedFixed[number] | `bestseller_${string}`;
    const incoming = body.style ?? "";
    const isAllowed =
      (allowedFixed as readonly string[]).includes(incoming) ||
      incoming.startsWith("bestseller_");
    const style: Style | null = isAllowed ? (incoming as Style) : null;

    const job = startJob({ requestedCount: count, style });
    console.log(`[pipeline/start] created job ${job.id} count=${count} style=${style ?? "(default)"}`);

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      requestedCount: job.requestedCount,
      style: job.style,
      startedAt: job.startedAt,
    });
  } catch (err) {
    // Make sure we ALWAYS return JSON so the client doesn't get
    // "Unexpected end of JSON input" when something goes wrong.
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[pipeline/start] failed:", msg);
    return NextResponse.json(
      { error: msg || "Pipeline start failed" },
      { status: 500 },
    );
  }
}
