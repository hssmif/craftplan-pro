"use client";

/**
 * StrategistChat — the primary "team chat" view for /strategist.
 *
 * Layout:  three columns
 *   ┌─ Threads ─┬─────── Conversation ───────┬─ Agents / Cost ─┐
 *   │ + new     │  [user]  Hey team...       │ Researcher  R   │
 *   │ • general │  [Strategist] Here's...    │ Strategist  P   │
 *   │ • bug-X   │  [Critic] But what about.. │ Critic      C   │
 *   │           │                            │ Builder     L   │
 *   │           │  ┌──────────────────────┐  │ Total: $0.012   │
 *   │           │  │ Composer + image     │  │                 │
 *   │           │  └──────────────────────┘  │                 │
 *   └───────────┴────────────────────────────┴─────────────────┘
 *
 * Routing rules visible in the UI:
 *   - Type @researcher / @strategist / @critic / @builder to mention
 *   - Open-ended messages auto-route to 1-2 most relevant agents
 *
 * State machine:
 *   idle → sending → streaming → idle
 *   The composer is locked while streaming so the seller can't send
 *   a follow-up before the agent replies arrive.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type AgentName = "researcher" | "strategist" | "critic" | "builder";
type MessageAuthor = "user" | AgentName | "system";

interface ChatAttachment {
  kind: "image";
  dataUrl: string;
  caption?: string;
}

interface ChatMessage {
  id: string;
  threadId: string;
  author: MessageAuthor;
  content: string;
  attachments?: ChatAttachment[];
  ts: string;
  cost?: number;
  routedTo?: AgentName[];
}

interface ChatThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

const AGENT_META: Record<AgentName, { label: string; avatar: string; hue: string; role: string }> = {
  researcher: { label: "Researcher", avatar: "R", hue: "cyan", role: "market data, niches, trends" },
  strategist: { label: "Strategist", avatar: "P", hue: "indigo", role: "high-level moves, prioritization" },
  critic: { label: "Critic", avatar: "C", hue: "rose", role: "push-back, sanity check" },
  builder: { label: "Builder", avatar: "L", hue: "emerald", role: "implementation, code, fixes" },
};

const HUE_CLASSES: Record<string, { avatar: string; bubble: string; chip: string }> = {
  cyan: {
    avatar: "bg-cyan-500/20 text-cyan-200 ring-cyan-500/40",
    bubble: "bg-cyan-500/[0.06] border-cyan-500/25",
    chip: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  },
  indigo: {
    avatar: "bg-indigo-500/20 text-indigo-200 ring-indigo-500/40",
    bubble: "bg-indigo-500/[0.07] border-indigo-500/25",
    chip: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  },
  rose: {
    avatar: "bg-rose-500/20 text-rose-200 ring-rose-500/40",
    bubble: "bg-rose-500/[0.06] border-rose-500/25",
    chip: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  },
  emerald: {
    avatar: "bg-emerald-500/20 text-emerald-200 ring-emerald-500/40",
    bubble: "bg-emerald-500/[0.06] border-emerald-500/25",
    chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
};

function classesFor(hue: string) {
  return HUE_CLASSES[hue] || HUE_CLASSES.indigo;
}

export default function StrategistChat() {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [thinkingAgents, setThinkingAgents] = useState<AgentName[]>([]);
  const [routedAgents, setRoutedAgents] = useState<AgentName[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [totalCost, setTotalCost] = useState(0);
  const [creatingThread, setCreatingThread] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Load threads on mount, auto-create first thread if empty ─────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch("/api/strategist/chat");
        const data = (await resp.json()) as { threads: ChatThread[] };
        if (cancelled) return;
        if (data.threads.length === 0) {
          // No threads yet — create a default "General" thread.
          const newThread = await createThread("General");
          if (newThread) {
            setThreads([newThread]);
            setActiveThreadId(newThread.id);
          }
        } else {
          setThreads(data.threads);
          setActiveThreadId(data.threads[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load threads");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Load messages whenever active thread changes ─────────────────
  useEffect(() => {
    if (!activeThreadId) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`/api/strategist/chat?threadId=${activeThreadId}`);
        const data = (await resp.json()) as { messages: ChatMessage[] };
        if (!cancelled) {
          setMessages(data.messages);
          // Recompute total cost from this thread for the dashboard
          setTotalCost(data.messages.reduce((s, m) => s + (m.cost || 0), 0));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load messages");
      }
    })();
    return () => { cancelled = true; };
  }, [activeThreadId]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinkingAgents]);

  // ── Helpers ──────────────────────────────────────────────────────

  const createThread = useCallback(async (title: string): Promise<ChatThread | null> => {
    try {
      const resp = await fetch("/api/strategist/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "create-thread", title }),
      });
      const data = (await resp.json()) as { thread: ChatThread };
      return data.thread;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create thread");
      return null;
    }
  }, []);

  const handleNewThread = useCallback(async () => {
    const title = prompt("Thread name (e.g. 'Bug: white-on-white', 'Idea: pet portraits', 'Q2 catalog plan'):");
    if (!title) return;
    setCreatingThread(true);
    const thread = await createThread(title);
    if (thread) {
      setThreads((t) => [thread, ...t]);
      setActiveThreadId(thread.id);
    }
    setCreatingThread(false);
  }, [createThread]);

  const handleArchive = useCallback(async (threadId: string) => {
    if (!confirm("Archive this thread? You can still see it in the JSON file but it'll vanish from the sidebar.")) return;
    await fetch(`/api/strategist/chat?threadId=${threadId}`, { method: "DELETE" });
    setThreads((t) => t.filter((x) => x.id !== threadId));
    if (activeThreadId === threadId) {
      const remaining = threads.filter((x) => x.id !== threadId);
      setActiveThreadId(remaining[0]?.id ?? null);
    }
  }, [activeThreadId, threads]);

  const handleAttachImage = useCallback((files: FileList | null) => {
    if (!files) return;
    const file = files[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setAttachments((a) => [...a, { kind: "image", dataUrl, caption: file.name }]);
    };
    reader.readAsDataURL(file);
  }, []);

  // ── Send message + stream agent replies ─────────────────────────

  const handleSend = useCallback(async () => {
    if (!activeThreadId || !composer.trim() || streaming) return;
    const myContent = composer.trim();
    setComposer("");
    setError(null);
    setStreaming(true);
    setThinkingAgents([]);
    setRoutedAgents([]);

    // Optimistic user message — replaced when the SSE stream echoes it.
    const optimistic: ChatMessage = {
      id: `opt-${Date.now()}`,
      threadId: activeThreadId,
      author: "user",
      content: myContent,
      attachments: attachments.length > 0 ? attachments : undefined,
      ts: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    const sentAttachments = attachments;
    setAttachments([]);

    try {
      const resp = await fetch("/api/strategist/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: activeThreadId,
          content: myContent,
          attachments: sentAttachments,
        }),
      });
      if (!resp.ok || !resp.body) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (!json) continue;
          let evt: { kind: string; [k: string]: unknown };
          try { evt = JSON.parse(json); } catch { continue; }
          if (evt.kind === "user-message") {
            const m = evt.message as ChatMessage;
            setMessages((arr) => arr.map((x) => x.id === optimistic.id ? m : x));
          } else if (evt.kind === "routed") {
            setRoutedAgents(evt.agents as AgentName[]);
          } else if (evt.kind === "agent-thinking") {
            setThinkingAgents((arr) => Array.from(new Set([...arr, evt.agent as AgentName])));
          } else if (evt.kind === "agent-message") {
            const m = evt.message as ChatMessage;
            setMessages((arr) => [...arr, m]);
            setTotalCost((c) => c + (m.cost || 0));
            setThinkingAgents((arr) => arr.filter((a) => a !== m.author));
          } else if (evt.kind === "agent-error") {
            const errMsg: ChatMessage = {
              id: `err-${Date.now()}-${evt.agent}`,
              threadId: activeThreadId,
              author: "system",
              content: `⚠ ${evt.agent} failed: ${evt.error}`,
              ts: new Date().toISOString(),
            };
            setMessages((arr) => [...arr, errMsg]);
            setThinkingAgents((arr) => arr.filter((a) => a !== evt.agent as AgentName));
          } else if (evt.kind === "done") {
            // stream complete
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStreaming(false);
      setThinkingAgents([]);
    }
  }, [activeThreadId, composer, streaming, attachments]);

  const handleMention = useCallback((agent: AgentName) => {
    setComposer((c) => {
      const trimmed = c.trim();
      const tag = `@${agent}`;
      if (trimmed.toLowerCase().includes(tag.toLowerCase())) return c;
      return trimmed ? `${tag} ${trimmed}` : `${tag} `;
    });
  }, []);

  const composerHint = useMemo(() => {
    const lower = composer.toLowerCase();
    const mentioned = (Object.keys(AGENT_META) as AgentName[]).filter((a) => lower.includes(`@${a}`));
    if (mentioned.length > 0) {
      return `→ ${mentioned.map((a) => AGENT_META[a].label).join(", ")}`;
    }
    return "auto-route to 1-2 most relevant agents";
  }, [composer]);

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[600px] gap-4">
      {/* ── Left: thread list ─────────────────────────────────────── */}
      <aside className="w-60 shrink-0 flex flex-col gap-2">
        <button
          onClick={handleNewThread}
          disabled={creatingThread}
          className="px-3 py-2 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-200 text-[12px] font-medium transition-colors disabled:opacity-50"
        >
          {creatingThread ? "Creating…" : "+ New thread"}
        </button>
        <div className="flex-1 overflow-y-auto space-y-1">
          {threads.length === 0 && (
            <p className="text-[11px] text-[var(--text-muted)] px-2 py-3">
              No threads yet — create one above.
            </p>
          )}
          {threads.map((t) => {
            const isActive = t.id === activeThreadId;
            return (
              <div
                key={t.id}
                className={`group flex items-center gap-1 rounded-lg transition-colors ${
                  isActive
                    ? "bg-[var(--bg-elev2)] border border-[var(--border-default)]"
                    : "hover:bg-[var(--bg-elev1)] border border-transparent"
                }`}
              >
                <button
                  onClick={() => setActiveThreadId(t.id)}
                  className="flex-1 min-w-0 text-left px-3 py-2 text-[12px]"
                >
                  <div className="truncate text-[var(--text-primary)]">{t.title}</div>
                  <div className="truncate text-[10px] text-[var(--text-muted)] mt-0.5">
                    {new Date(t.updatedAt).toLocaleString()}
                  </div>
                </button>
                <button
                  onClick={() => handleArchive(t.id)}
                  className="opacity-0 group-hover:opacity-100 px-2 py-1 text-[14px] text-[var(--text-muted)] hover:text-rose-400 transition-opacity"
                  title="Archive thread"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── Center: conversation ───────────────────────────────────── */}
      <section className="flex-1 flex flex-col min-w-0 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
              {threads.find((t) => t.id === activeThreadId)?.title || "—"}
            </div>
            <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
              {messages.length} message{messages.length === 1 ? "" : "s"} · group chat with 4 AI agents
            </div>
          </div>
          {routedAgents.length > 0 && (
            <div className="text-[10px] text-[var(--text-muted)]">
              last routed: {routedAgents.map((a) => AGENT_META[a].label).join(" + ")}
            </div>
          )}
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-[12px] text-[var(--text-muted)] py-12">
              <div className="text-[14px] mb-2">Start the conversation</div>
              <div>Type a message and the right agents will reply.</div>
              <div className="mt-3 inline-flex flex-wrap justify-center gap-2 text-[11px]">
                {(Object.keys(AGENT_META) as AgentName[]).map((a) => (
                  <span key={a} className={`px-2 py-1 rounded-md border ${classesFor(AGENT_META[a].hue).chip}`}>
                    @{a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => {
            if (m.author === "system") {
              return (
                <div key={m.id} className="text-center">
                  <span className="inline-block px-3 py-1 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px]">
                    {m.content}
                  </span>
                </div>
              );
            }
            if (m.author === "user") {
              return (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[75%] rounded-2xl rounded-br-md px-4 py-2.5 bg-amber-500/[0.10] border border-amber-500/30 text-[13px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="flex gap-2 mb-2 flex-wrap">
                        {m.attachments.map((a, i) => (
                          <img
                            key={i}
                            src={a.dataUrl}
                            alt={a.caption || "attachment"}
                            className="rounded-md max-w-[140px] max-h-[140px] object-cover"
                          />
                        ))}
                      </div>
                    )}
                    {m.content}
                  </div>
                </div>
              );
            }
            const meta = AGENT_META[m.author];
            const cls = classesFor(meta.hue);
            return (
              <div key={m.id} className="flex gap-3">
                <div className={`shrink-0 w-9 h-9 rounded-full ${cls.avatar} ring-2 flex items-center justify-center font-bold text-[14px]`}>
                  {meta.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[12px] font-semibold text-[var(--text-primary)]">{meta.label}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">{meta.role}</span>
                    {typeof m.cost === "number" && (
                      <span className="ml-auto text-[10px] text-[var(--text-muted)] font-mono">
                        ${m.cost.toFixed(4)}
                      </span>
                    )}
                  </div>
                  <div className={`rounded-2xl rounded-tl-md px-4 py-2.5 border ${cls.bubble} text-[13px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap`}>
                    {m.content}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Thinking indicator */}
          {thinkingAgents.map((a) => {
            const meta = AGENT_META[a];
            const cls = classesFor(meta.hue);
            return (
              <div key={`thinking-${a}`} className="flex gap-3 opacity-70">
                <div className={`shrink-0 w-9 h-9 rounded-full ${cls.avatar} ring-2 flex items-center justify-center font-bold text-[14px] animate-pulse`}>
                  {meta.avatar}
                </div>
                <div className="flex-1">
                  <div className="text-[12px] font-semibold text-[var(--text-primary)] mb-1">{meta.label}</div>
                  <div className={`rounded-2xl rounded-tl-md px-4 py-2.5 border ${cls.bubble} text-[12px] text-[var(--text-muted)]`}>
                    <span className="inline-flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce [animation-delay:300ms]" />
                    </span>
                    <span className="ml-2">thinking…</span>
                  </div>
                </div>
              </div>
            );
          })}

          {error && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-[11px] text-rose-300">
              {error}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-[var(--border-subtle)] p-3 space-y-2">
          {attachments.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {attachments.map((a, i) => (
                <div key={i} className="relative group">
                  <img src={a.dataUrl} alt={a.caption} className="h-16 rounded-md object-cover" />
                  <button
                    onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming}
              className="shrink-0 w-9 h-9 rounded-lg bg-[var(--bg-elev1)] hover:bg-[var(--bg-elev2)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center text-[16px] disabled:opacity-50"
              title="Attach image"
            >
              📎
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleAttachImage(e.target.files)}
            />
            <textarea
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={streaming || !activeThreadId}
              placeholder="Message the team. Type @researcher / @strategist / @critic / @builder to mention. Enter to send, Shift+Enter for newline."
              rows={2}
              className="flex-1 resize-none rounded-lg bg-[var(--bg-elev1)] border border-[var(--border-subtle)] focus:border-indigo-500/40 focus:outline-none px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={streaming || !composer.trim() || !activeThreadId}
              className="shrink-0 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-[12px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {streaming ? "Sending…" : "Send"}
            </button>
          </div>
          <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
            <span>{composerHint}</span>
            <span>Shift+Enter for newline · @-mention to direct a question</span>
          </div>
        </div>
      </section>

      {/* ── Right: agent roster + cost ─────────────────────────────── */}
      <aside className="w-56 shrink-0 space-y-3">
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-muted)] mb-2">
            Team
          </div>
          <div className="space-y-1.5">
            {(Object.keys(AGENT_META) as AgentName[]).map((a) => {
              const meta = AGENT_META[a];
              const cls = classesFor(meta.hue);
              return (
                <button
                  key={a}
                  onClick={() => handleMention(a)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--bg-elev1)] transition-colors text-left"
                  title={`Insert @${a} into composer`}
                >
                  <span className={`shrink-0 w-7 h-7 rounded-full ${cls.avatar} ring-2 flex items-center justify-center font-bold text-[11px]`}>
                    {meta.avatar}
                  </span>
                  <span className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-[var(--text-primary)] truncate">{meta.label}</div>
                    <div className="text-[9px] text-[var(--text-muted)] truncate">{meta.role}</div>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">
            Cost — this thread
          </div>
          <div className="text-[20px] font-bold font-mono text-emerald-300">
            ${totalCost.toFixed(4)}
          </div>
          <div className="text-[9px] text-[var(--text-muted)] leading-snug">
            Gemini Flash ≈ $0.0003 / reply.<br />
            GPT-4o-mini ≈ $0.0006 / reply.<br />
            Each agent thinks once per turn.
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">
            How routing works
          </div>
          <ul className="text-[10px] text-[var(--text-muted)] leading-relaxed space-y-1">
            <li>• @-mention → only that agent</li>
            <li>• Open question → 1-2 most relevant</li>
            <li>• Default fallback → Strategist</li>
            <li>• Each agent sees others' replies in this turn</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
