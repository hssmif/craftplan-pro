// ══════════════════════════════════════════════════════════════
// Dev-only — kick the Next.js dev server to fully restart
//
// POST /api/dev/restart
//
// Strategy: Next.js watches `next.config.ts` and full-restarts the
// dev server whenever it changes. We just touch the file (rewrite
// its bytes with the same content + an updated trailing comment) —
// no semantic change, but mtime bumps and the watcher fires.
//
// This is the most reliable cross-platform way to force a fresh
// dev-server boot without killing the parent process (which would
// require a supervisor like pm2 / nodemon and a stable PID).
//
// GUARDS:
//  • 404 in production — this endpoint must never reach end users.
//  • No request body — nothing the caller can pass that affects
//    behavior, so no input-validation surface.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

const CONFIG_PATH = path.join(process.cwd(), "next.config.ts");
const SENTINEL_PREFIX = "// dev-restart sentinel:";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not available in production" }, { status: 404 });
  }

  try {
    const original = await fs.readFile(CONFIG_PATH, "utf8");
    const lines = original.split("\n");
    // Strip any prior sentinel comment lines so the file doesn't grow
    // unboundedly when this endpoint is called repeatedly.
    const clean = lines.filter((l) => !l.trim().startsWith(SENTINEL_PREFIX));
    // Append a fresh sentinel — Next.js watches this file and will
    // hot-restart on any byte change.
    const stamped = `${clean.join("\n").replace(/\n+$/, "")}\n${SENTINEL_PREFIX} ${Date.now()}\n`;
    await fs.writeFile(CONFIG_PATH, stamped, "utf8");
    return NextResponse.json({ ok: true, restartTriggered: true, ts: Date.now() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "restart trigger failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  // Tiny health-check so the client can poll "is the server back?"
  // after a restart click.
  return NextResponse.json({ ok: true, ts: Date.now() });
}
