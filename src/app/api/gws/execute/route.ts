// ══════════════════════════════════════════════════════════════
// GWS CLI Execution API
// Runs Google Workspace CLI commands server-side.
// Used by the auto-mode orchestrator to build and format
// Google Sheets spreadsheets programmatically.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { commands } = body as { commands: string[] };

    if (!commands || !Array.isArray(commands) || commands.length === 0) {
      return NextResponse.json({ error: "Missing required field: commands (array of GWS CLI commands)" }, { status: 400 });
    }

    // Validate all commands start with "gws "
    for (const cmd of commands) {
      if (!cmd.startsWith("gws ")) {
        return NextResponse.json({ error: `Invalid command — must start with 'gws': ${cmd.slice(0, 50)}` }, { status: 400 });
      }
    }

    const results: Array<{ command: string; success: boolean; output?: string; error?: string }> = [];

    for (const cmd of commands) {
      try {
        const output = execSync(cmd, {
          encoding: "utf-8",
          timeout: 60000,
          env: { ...process.env, PATH: process.env.PATH },
        });
        results.push({ command: cmd.slice(0, 80) + "...", success: true, output: output.slice(0, 500) });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Command failed";
        results.push({ command: cmd.slice(0, 80) + "...", success: false, error: message.slice(0, 300) });
      }
    }

    const allSuccess = results.every((r) => r.success);
    return NextResponse.json({
      success: allSuccess,
      executed: results.length,
      failed: results.filter((r) => !r.success).length,
      results,
    });
  } catch (err) {
    console.error("[GWS Execute]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Execution failed" },
      { status: 500 }
    );
  }
}
