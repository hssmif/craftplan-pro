// GET /api/strategist/runs/[id]
//   Returns one council run with its full event log + verdict. Used
//   when the dashboard user clicks a past run from the history rail
//   to replay the conversation.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface Row {
  id: number;
  mode: string | null;
  focus: string | null;
  topic: string | null;
  status: string;
  agents_log: string;
  verdict: string | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, mode, focus, topic, status, agents_log, verdict, error_message, started_at, finished_at
       FROM strategist_runs
       WHERE id = ?`,
    )
    .get(numericId) as Row | undefined;

  if (!row) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  let events: unknown[] = [];
  try {
    events = JSON.parse(row.agents_log);
    if (!Array.isArray(events)) events = [];
  } catch {
    events = [];
  }

  // The verdict column holds either a CouncilVerdict (debate mode) or a
  // BuildResult (build mode). The `mode` column tells us which.
  const mode = row.mode === "build" ? "build" : "debate";
  let verdict: unknown = null;
  let build: unknown = null;
  if (row.verdict) {
    try {
      const parsed = JSON.parse(row.verdict);
      if (mode === "build") build = parsed;
      else verdict = parsed;
    } catch {
      // ignore — both stay null
    }
  }

  return NextResponse.json({
    run: {
      id: row.id,
      mode,
      focus: row.focus,
      topic: row.topic,
      status: row.status,
      events,
      verdict,
      build,
      error: row.error_message,
      started_at: row.started_at,
      finished_at: row.finished_at,
    },
  });
}
