import { NextRequest, NextResponse } from "next/server";
import {
  clearLiveTerminalSession,
  createLiveTerminalSession,
  listLiveTerminalSessions,
  stopLiveTerminalSession,
  writeLiveTerminalSession,
  type LiveTerminalSession,
} from "@/lib/agent-terminal-sessions";
import type { EngineProvider } from "@/lib/agent-command-center";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionCommand =
  | {
      action: "create";
      provider: EngineProvider;
      engineId: string;
      title: string;
      cwd?: string;
      taskId?: string;
      command?: string;
      autoRun?: boolean;
    }
  | {
      action: "write";
      sessionId: string;
      input: string;
    }
  | {
      action: "stop";
      sessionId: string;
      force?: boolean;
    }
  | {
      action: "clear";
      sessionId: string;
    };

export async function GET() {
  return NextResponse.json({ sessions: listLiveTerminalSessions() });
}

export async function POST(req: NextRequest) {
  let body: SessionCommand;
  try {
    body = (await req.json()) as SessionCommand;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    let session: LiveTerminalSession;

    if (body.action === "create") {
      if (!body.provider || !body.engineId || !body.title) {
        return NextResponse.json({ error: "provider, engineId, and title are required" }, { status: 400 });
      }
      session = createLiveTerminalSession(body);
      return NextResponse.json({ session, sessions: listLiveTerminalSessions() });
    }

    if (body.action === "write") {
      if (!body.sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
      session = writeLiveTerminalSession(body.sessionId, body.input);
      return NextResponse.json({ session });
    }

    if (body.action === "stop") {
      if (!body.sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
      session = stopLiveTerminalSession(body.sessionId, body.force);
      return NextResponse.json({ session });
    }

    if (body.action === "clear") {
      if (!body.sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
      session = clearLiveTerminalSession(body.sessionId);
      return NextResponse.json({ session });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Terminal command failed" },
      { status: 500 },
    );
  }
}
