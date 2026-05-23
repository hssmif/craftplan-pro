import { NextRequest, NextResponse } from "next/server";
import {
  appendMessage,
  archiveThread,
  autoRoute,
  createThread,
  getThreadMessages,
  listThreads,
  parseMentions,
  type AgentName,
  type ChatAttachment,
} from "@/lib/strategist-chat";
import { runAgent } from "@/lib/strategist-agents";

/**
 * Strategist Chat API
 *
 * GET /api/strategist/chat               — list threads + total cost
 * GET /api/strategist/chat?threadId=X    — list messages for a thread
 * POST /api/strategist/chat              — send a user message, stream agent replies (SSE)
 *   body: { threadId, content, attachments?, mention? }
 * DELETE /api/strategist/chat?threadId=X — soft-archive a thread
 * POST /api/strategist/chat/threads      — create a new thread (separate route below would be cleaner
 *                                          but we co-locate for simplicity; uses ?op=create-thread)
 */

export const maxDuration = 120;
export const runtime = "nodejs";

// ── GET ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const threadId = req.nextUrl.searchParams.get("threadId");
  if (threadId) {
    const messages = await getThreadMessages(threadId);
    return NextResponse.json({ messages });
  }
  const threads = await listThreads();
  return NextResponse.json({ threads });
}

// ── DELETE (archive) ───────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const threadId = req.nextUrl.searchParams.get("threadId");
  if (!threadId) return NextResponse.json({ error: "threadId required" }, { status: 400 });
  await archiveThread(threadId);
  return NextResponse.json({ ok: true });
}

// ── POST: send message + stream agent replies ──────────────────────

interface PostBody {
  /** When op="create-thread", body needs only `title`. */
  op?: "create-thread" | "send";
  title?: string;
  threadId?: string;
  content?: string;
  attachments?: ChatAttachment[];
  /** Force a specific agent regardless of @-mention parsing. */
  mention?: AgentName;
}

export async function POST(req: NextRequest) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // ── Sub-route: create a new thread ───────────────────────────────
  if (body.op === "create-thread") {
    const thread = await createThread(body.title || "New conversation");
    return NextResponse.json({ thread });
  }

  // ── Main flow: send a message + stream agent replies ─────────────
  const { threadId, content, attachments } = body;
  if (!threadId || !content?.trim()) {
    return NextResponse.json({ error: "threadId and content required" }, { status: 400 });
  }

  // 1. Persist the user's message immediately.
  const userMsg = await appendMessage({
    threadId,
    author: "user",
    content: content.trim(),
    attachments,
  });

  // 2. Decide which agent(s) reply.
  //    Priority: explicit mention from caller → @-mentions in text → auto-route.
  let agents: AgentName[];
  if (body.mention) {
    agents = [body.mention];
  } else {
    const mentions = parseMentions(content);
    agents = mentions.length > 0 ? mentions : autoRoute(content);
  }

  // 3. Stream replies as SSE.  Frontend reads one event per agent reply.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Echo the user message so the client can render it from the stream
      // even if its local state was lagging.
      send({ kind: "user-message", message: userMsg });
      send({ kind: "routed", agents });

      // Pull image data URLs out of attachments for vision-capable models.
      const imageUrls = (attachments || [])
        .filter((a) => a.kind === "image")
        .map((a) => a.dataUrl);

      // Run agents sequentially so each can see prior replies in this
      // turn.  This is the "group chat" feel — the second agent reacts
      // to what the first said.
      for (const agent of agents) {
        send({ kind: "agent-thinking", agent });
        try {
          // Re-fetch full thread history every iteration so the agent
          // sees the user's message PLUS any prior agent replies in
          // this same turn.
          const history = await getThreadMessages(threadId);
          const result = await runAgent(agent, history, imageUrls);
          const reply = await appendMessage({
            threadId,
            author: agent,
            content: result.text,
            cost: result.cost,
            routedTo: agents,
            mentionTrigger: parseMentions(content).length > 0,
          });
          send({ kind: "agent-message", message: reply });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          send({ kind: "agent-error", agent, error: errMsg });
        }
      }

      send({ kind: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
