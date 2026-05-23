// POST /api/strategist/council
//
// Convenes the multi-agent council and STREAMS each agent's thought as
// it arrives, using Server-Sent Events. The dashboard at /strategist
// reads this stream to render live chat bubbles per agent.
//
// Body: {
//   mode?: "debate" | "build",   // default "debate"
//   focus?: "cross-stitch" | "wall-art" | "notion" | "all",
//   topic?: string,
//   count?: number               // build mode only — how many packets, default 3
// }
//
// SSE events emitted:
//   data: <JSON CouncilEvent>\n\n   — for every agent message
//   data: {"type":"final","runId":N,"mode":"...","verdict":{...},"build":{...}}\n\n   — once at the end
//   data: [DONE]\n\n   — terminator
//
// Hard rules enforced upstream in lib/council.ts:
//   - No Etsy network calls (DB-only Scout)
//   - No auto-listing (verdicts and build packets are advisory until the
//     seller explicitly clicks Send-to-Studio in the UI)
//   - Tool suggestions are surfaced, never executed

import { NextRequest, NextResponse } from "next/server";
import { runCouncil, type CouncilEvent, type CouncilMode } from "@/lib/council";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // up to 5 min — multiple LLM calls in series

// Per user 2026-05-16 cost-saving directive: gpt-4o-mini disabled.
// Force openaiKey to undefined so the council uses Gemini-only path.
// The council's lib/council.ts already has Gemini fallback for every
// agent (critic / synthesizer / copywriter / QA), so this just routes
// every call through Gemini Flash instead of OpenAI.
const GPT_4O_MINI_DISABLED = true;

export async function POST(req: NextRequest) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured. Add it to .env.local — it's the council's primary model." },
      { status: 500 },
    );
  }
  const openaiKey = GPT_4O_MINI_DISABLED ? undefined : process.env.OPENAI_API_KEY; // optional but recommended

  let body: { mode?: string; focus?: string; topic?: string; count?: number } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine — defaults will apply
  }

  const mode: CouncilMode = body.mode === "build" ? "build" : "debate";

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      let closed = false;

      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const sendRaw = (line: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(line));
        } catch {
          closed = true;
        }
      };

      runCouncil({
        mode,
        focus: body.focus,
        topic: body.topic,
        count: typeof body.count === "number" ? body.count : undefined,
        geminiKey,
        openaiKey,
        onEvent: (ev: CouncilEvent) => send(ev),
      })
        .then((result) => {
          send({
            type: "final",
            runId: result.runId,
            mode: result.mode,
            status: result.status,
            verdict: result.verdict,
            build: result.build,
            error: result.error,
          });
          sendRaw("data: [DONE]\n\n");
          if (!closed) controller.close();
          closed = true;
        })
        .catch((err) => {
          send({
            type: "fatal",
            error: err instanceof Error ? err.message : "Council orchestrator threw",
          });
          sendRaw("data: [DONE]\n\n");
          if (!closed) controller.close();
          closed = true;
        });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable Nginx-style buffering
    },
  });
}
