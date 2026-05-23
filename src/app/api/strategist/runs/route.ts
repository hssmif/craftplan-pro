// GET /api/strategist/runs
//   Returns the most recent council runs (id, focus, topic, status,
//   one-liner from verdict if available, started_at). Used by the
//   /strategist dashboard's "history" rail.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface Row {
  id: number;
  mode: string | null;
  focus: string | null;
  topic: string | null;
  status: string;
  verdict: string | null;
  started_at: string;
  finished_at: string | null;
}

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, mode, focus, topic, status, verdict, started_at, finished_at
       FROM strategist_runs
       ORDER BY started_at DESC
       LIMIT 30`,
    )
    .all() as Row[];

  const runs = rows.map((r) => {
    let oneLiner: string | null = null;
    let packetCount: number | null = null;
    if (r.verdict) {
      try {
        const v = JSON.parse(r.verdict) as { one_liner?: string; packets?: unknown[] };
        oneLiner = typeof v.one_liner === "string" ? v.one_liner : null;
        if (Array.isArray(v.packets)) packetCount = v.packets.length;
      } catch {
        // ignore
      }
    }
    return {
      id: r.id,
      mode: r.mode === "build" ? "build" : "debate",
      focus: r.focus,
      topic: r.topic,
      status: r.status,
      one_liner: oneLiner,
      packet_count: packetCount,
      started_at: r.started_at,
      finished_at: r.finished_at,
    };
  });

  return NextResponse.json({ runs });
}
