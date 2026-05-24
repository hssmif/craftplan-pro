import { NextRequest } from "next/server";
import { subscribeLiveTerminalSession, type LiveTerminalEvent } from "@/lib/agent-terminal-sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encodeEvent(event: LiveTerminalEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (event: LiveTerminalEvent) => {
        controller.enqueue(encoder.encode(encodeEvent(event)));
      };

      try {
        unsubscribe = subscribeLiveTerminalSession(id, send);
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ error: error instanceof Error ? error.message : "Session not found" })}\n\n`,
          ),
        );
        controller.close();
        return;
      }

      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 15000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
