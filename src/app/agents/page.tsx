"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AgentCommandSnapshot,
  AgentEngine,
  AgentMessage,
  AgentMission,
  AgentTask,
  EngineProvider,
  EngineStatus,
  MessageKind,
  MissionStatus,
  TaskPriority,
  TaskStatus,
} from "@/lib/agent-command-center";
import type { LiveTerminalSession } from "@/lib/agent-terminal-sessions";

type TerminalSession = {
  id: string;
  engineId: string;
  provider: EngineProvider;
  title: string;
  command: string;
  cwd: string;
  status: "idle" | "working" | "waiting" | "review";
  taskId?: string;
  liveSessionId?: string;
};

type CommandResponse = AgentCommandSnapshot & { error?: string };
type SessionsResponse = { session?: LiveTerminalSession; sessions?: LiveTerminalSession[]; error?: string };

const EMPTY_STATE: AgentCommandSnapshot = {
  engines: [],
  missions: [],
  tasks: [],
  messages: [],
  updatedAt: new Date(0).toISOString(),
  runtime: { codexCli: false, claudeCli: false, checkedAt: new Date(0).toISOString() },
};

const TASK_STATUS_OPTIONS: TaskStatus[] = ["queued", "in_progress", "review", "blocked", "done"];
const ENGINE_STATUS_OPTIONS: EngineStatus[] = ["online", "busy", "paused", "offline"];
const MISSION_STATUS_OPTIONS: MissionStatus[] = ["planning", "active", "blocked", "review", "completed"];

const providerLabel: Record<EngineProvider, string> = {
  codex: "Codex",
  claude: "Claude Code",
  local: "Local",
  human: "Owner",
};

const providerDot: Record<EngineProvider, string> = {
  codex: "bg-blue-400",
  claude: "bg-orange-300",
  local: "bg-emerald-300",
  human: "bg-violet-300",
};

const providerRing: Record<EngineProvider, string> = {
  codex: "border-blue-400/40 shadow-[0_0_32px_rgba(59,130,246,0.12)]",
  claude: "border-orange-300/40 shadow-[0_0_32px_rgba(251,146,60,0.12)]",
  local: "border-emerald-300/35 shadow-[0_0_32px_rgba(16,185,129,0.10)]",
  human: "border-violet-300/35 shadow-[0_0_32px_rgba(139,92,246,0.10)]",
};

const priorityClass: Record<TaskPriority, string> = {
  low: "border-white/10 bg-white/[0.04] text-white/45",
  medium: "border-blue-400/20 bg-blue-400/10 text-blue-100",
  high: "border-orange-300/25 bg-orange-400/10 text-orange-100",
  critical: "border-rose-400/25 bg-rose-400/10 text-rose-100",
};

const statusClass: Record<EngineStatus | TaskStatus | MissionStatus, string> = {
  online: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
  busy: "border-orange-300/30 bg-orange-400/12 text-orange-100",
  paused: "border-amber-300/25 bg-amber-400/10 text-amber-100",
  offline: "border-white/10 bg-white/[0.04] text-white/38",
  queued: "border-white/10 bg-white/[0.04] text-white/45",
  in_progress: "border-blue-400/25 bg-blue-400/10 text-blue-100",
  blocked: "border-rose-400/25 bg-rose-400/10 text-rose-100",
  review: "border-violet-400/25 bg-violet-400/10 text-violet-100",
  done: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
  planning: "border-blue-400/25 bg-blue-400/10 text-blue-100",
  active: "border-orange-300/30 bg-orange-400/12 text-orange-100",
  completed: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
};

function makeSessionId(provider: EngineProvider): string {
  return `${provider}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function fmt(value: string): string {
  return value.replace(/_/g, " ");
}

function shortTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function donePercent(tasks: AgentTask[]): number {
  if (!tasks.length) return 0;
  return Math.round((tasks.filter((task) => task.status === "done").length / tasks.length) * 100);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const method = init?.method?.toUpperCase() || "GET";

  if (method === "GET" && typeof XMLHttpRequest !== "undefined") {
    return new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.timeout = 12_000;
      xhr.setRequestHeader("Accept", "application/json");
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(`Request failed (${xhr.status})`));
          return;
        }
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          reject(new Error("Invalid JSON response"));
        }
      };
      xhr.onerror = () => reject(new Error("AgentSpace server is offline. Restart the dev server."));
      xhr.ontimeout = () => reject(new Error("AgentSpace request timed out."));
      xhr.send();
    });
  }

  const resp = await fetch(url, init);
  const data = (await resp.json()) as T & { error?: string };
  if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`);
  return data;
}

function createTerminalSessions(state: AgentCommandSnapshot, missionId: string | null): TerminalSession[] {
  const missionTasks = missionId
    ? state.tasks.filter((task) => task.missionId === missionId)
    : state.tasks;

  return state.engines
    .filter((engine) => engine.provider !== "human")
    .slice(0, 6)
    .map((engine, index) => {
      const task = missionTasks.find((item) => item.assignedEngineId === engine.id && item.status !== "done");
      return createTerminalSession(engine, task, index);
    });
}

function Icon({
  name,
  className = "h-4 w-4",
}: {
  name: "terminal" | "tasks" | "agents" | "review" | "send" | "plus" | "play" | "pause" | "check" | "grid";
  className?: string;
}) {
  const paths = {
    terminal: "M4 17l6-6-6-6m8 12h8",
    tasks: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    agents: "M7 8a3 3 0 110-6 3 3 0 010 6zm10 0a3 3 0 110-6 3 3 0 010 6zM7 22a3 3 0 110-6 3 3 0 010 6zm10 0a3 3 0 110-6 3 3 0 010 6zM7 8v8m3-11h4m-4 14h4m3-11v8",
    review: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    send: "M22 2L11 13m11-11l-7 20-4-9-9-4 20-7z",
    plus: "M12 5v14m-7-7h14",
    play: "M8 5v14l11-7-11-7z",
    pause: "M8 5v14M16 5v14",
    check: "M20 6L9 17l-5-5",
    grid: "M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z",
  };
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d={paths[name]} />
    </svg>
  );
}

function Pill({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "green" | "blue" | "orange" | "purple" }) {
  const toneClass = {
    default: "border-white/10 bg-white/[0.04] text-white/50",
    green: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
    blue: "border-blue-400/25 bg-blue-400/10 text-blue-100",
    orange: "border-orange-300/25 bg-orange-400/10 text-orange-100",
    purple: "border-violet-400/25 bg-violet-400/10 text-violet-100",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${toneClass}`}>
      {children}
    </span>
  );
}

export default function AgentCommandPage() {
  const [snapshot, setSnapshot] = useState<AgentCommandSnapshot>(EMPTY_STATE);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const [terminals, setTerminals] = useState<TerminalSession[]>([]);
  const [liveSessions, setLiveSessions] = useState<LiveTerminalSession[]>([]);
  const [terminalInputs, setTerminalInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [missionTitle, setMissionTitle] = useState("");
  const [missionBrief, setMissionBrief] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [messageKind, setMessageKind] = useState<MessageKind>("note");

  const load = useCallback(async () => {
    try {
      const data = await requestJson<AgentCommandSnapshot>("/api/agent-command");
      setSnapshot(data);
      setSelectedMissionId((current) =>
        current && data.missions.some((mission) => mission.id === current)
          ? current
          : data.missions[0]?.id || null,
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AgentSpace");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 10000);
    return () => clearInterval(interval);
  }, [load]);

  const selectedMission = useMemo(
    () => snapshot.missions.find((mission) => mission.id === selectedMissionId) || snapshot.missions[0] || null,
    [snapshot.missions, selectedMissionId],
  );

  const missionTasks = useMemo(
    () => snapshot.tasks.filter((task) => task.missionId === selectedMission?.id),
    [snapshot.tasks, selectedMission?.id],
  );

  const engineById = useMemo(() => {
    const map = new Map<string, AgentEngine>();
    for (const engine of snapshot.engines) map.set(engine.id, engine);
    return map;
  }, [snapshot.engines]);

  const liveSessionById = useMemo(() => {
    const map = new Map<string, LiveTerminalSession>();
    for (const session of liveSessions) map.set(session.id, session);
    return map;
  }, [liveSessions]);

  const liveSessionIdsKey = useMemo(
    () => terminals.map((terminal) => terminal.liveSessionId).filter(Boolean).join("|"),
    [terminals],
  );

  const missionMessages = useMemo(
    () => snapshot.messages.filter((message) => !selectedMission || !message.missionId || message.missionId === selectedMission.id).slice(0, 8),
    [snapshot.messages, selectedMission],
  );

  const loadLiveSessions = useCallback(async () => {
    try {
      const data = await requestJson<SessionsResponse>("/api/agent-command/sessions");
      setLiveSessions(data.sessions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load live terminals");
    }
  }, []);

  useEffect(() => {
    if (terminals.length || !snapshot.engines.length) return;
    setTerminals(createTerminalSessions(snapshot, selectedMissionId));
  }, [selectedMissionId, snapshot, terminals.length]);

  useEffect(() => {
    void loadLiveSessions();
  }, [loadLiveSessions]);

  useEffect(() => {
    const ids = liveSessionIdsKey.split("|").filter(Boolean);
    if (!ids.length) return;

    const sources = ids.map((id) => {
      const source = new EventSource(`/api/agent-command/sessions/${id}/stream`);
      const updateSession = (event: MessageEvent) => {
        const payload = JSON.parse(event.data) as { session?: LiveTerminalSession };
        const session = payload.session;
        if (!session) return;
        setLiveSessions((items) => {
          const exists = items.some((item) => item.id === session.id);
          return exists
            ? items.map((item) => (item.id === session.id ? session : item))
            : [session, ...items];
        });
      };

      source.addEventListener("snapshot", updateSession);
      source.addEventListener("chunk", updateSession);
      source.addEventListener("status", updateSession);
      source.addEventListener("clear", updateSession);
      source.addEventListener("error", () => source.close());
      return source;
    });

    return () => {
      for (const source of sources) source.close();
    };
  }, [liveSessionIdsKey]);

  const metrics = useMemo(() => {
    return {
      terminals: terminals.length,
      active: missionTasks.filter((task) => task.status === "in_progress").length,
      blocked: missionTasks.filter((task) => task.status === "blocked").length,
      done: missionTasks.filter((task) => task.status === "done").length,
      progress: donePercent(missionTasks),
    };
  }, [missionTasks, terminals.length]);

  const command = useCallback(async (body: unknown): Promise<AgentCommandSnapshot | null> => {
    setBusy(true);
    try {
      const data = await requestJson<CommandResponse>("/api/agent-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const next = { ...data, runtime: data.runtime || snapshot.runtime };
      setSnapshot(next);
      setError(null);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Command failed");
      return null;
    } finally {
      setBusy(false);
      void load();
    }
  }, [load, snapshot.runtime]);

  async function terminalCommand(body: unknown): Promise<SessionsResponse | null> {
    try {
      const data = await requestJson<SessionsResponse>("/api/agent-command/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (data.sessions) setLiveSessions(data.sessions);
      if (data.session) {
        const session = data.session;
        setLiveSessions((items) => {
          const exists = items.some((item) => item.id === session.id);
          return exists
            ? items.map((item) => (item.id === session.id ? session : item))
            : [session, ...items];
        });
      }
      setError(null);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terminal command failed");
      return null;
    }
  }

  async function startLiveTerminal(terminal: TerminalSession, autoRun = true): Promise<LiveTerminalSession | null> {
    if (terminal.liveSessionId) return liveSessionById.get(terminal.liveSessionId) || null;
    const sessionTitle = terminal.title;
    const data = await terminalCommand({
      action: "create",
      provider: terminal.provider,
      engineId: terminal.engineId,
      title: sessionTitle,
      cwd: terminal.cwd,
      taskId: terminal.taskId,
      command: terminal.command,
      autoRun,
    });
    if (!data?.session) return null;
    const session = data.session;
    setTerminals((items) =>
      items.map((item) => (item.id === terminal.id ? { ...item, liveSessionId: session.id, status: "working" } : item)),
    );
    if (terminal.taskId) {
      void command({ action: "update-task", taskId: terminal.taskId, status: "in_progress" });
    }
    return session;
  }

  async function sendTerminalInput(terminal: TerminalSession) {
    const value = terminalInputs[terminal.id]?.trimEnd();
    if (!value) return;
    const session = terminal.liveSessionId
      ? liveSessionById.get(terminal.liveSessionId) || null
      : await startLiveTerminal(terminal, false);
    if (!session) return;
    await terminalCommand({ action: "write", sessionId: session.id, input: `${value}\n` });
    setTerminalInputs((items) => ({ ...items, [terminal.id]: "" }));
    setTimeout(() => void loadLiveSessions(), 350);
    setTimeout(() => void loadLiveSessions(), 1100);
  }

  async function stopTerminal(terminal: TerminalSession) {
    if (!terminal.liveSessionId) return;
    await terminalCommand({ action: "stop", sessionId: terminal.liveSessionId });
  }

  async function clearTerminal(terminal: TerminalSession) {
    if (!terminal.liveSessionId) return;
    await terminalCommand({ action: "clear", sessionId: terminal.liveSessionId });
  }

  function openTerminal(provider: EngineProvider) {
    const engine = snapshot.engines.find((item) => item.provider === provider) || snapshot.engines[0];
    if (!engine) return;
    const task = missionTasks.find((item) => item.assignedEngineId === engine.id && item.status !== "done");
    const terminal = createTerminalSession(engine, task, terminals.length);
    setTerminals((items) => [terminal, ...items].slice(0, 12));
    void startLiveTerminal(terminal, provider === "codex" || provider === "claude");
  }

  function selectMission(missionId: string) {
    setSelectedMissionId(missionId);
    setTerminals(createTerminalSessions(snapshot, missionId));
    setNotice(null);
  }

  async function createMissionFromForm() {
    if (!missionTitle.trim() || !missionBrief.trim()) return;
    const next = await command({ action: "create-mission", title: missionTitle, brief: missionBrief, priority: "high" });
    const mission = next?.missions[0];
    if (mission) {
      const tasks = next.tasks.filter((task) => task.missionId === mission.id);
      setSelectedMissionId(mission.id);
      setTerminals(createTerminalSessions(next, mission.id));
      setNotice(`Mission created: "${mission.title}". ${tasks.length} tasks are queued in the left task board.`);
    }
    setMissionTitle("");
    setMissionBrief("");
  }

  async function sendMessage() {
    if (!messageBody.trim()) return;
    await command({
      action: "post-message",
      missionId: selectedMission?.id,
      from: "human_owner",
      targetEngineIds: ["codex_primary", "claude_code", "codex_qa"],
      kind: messageKind,
      body: messageBody,
    });
    setMessageBody("");
  }

  if (loading) {
    return (
      <div className="flex min-h-[540px] items-center justify-center p-8 text-white/45">
        Loading AgentSpace...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05070b] text-white">
      <div
        className="min-h-screen p-4 sm:p-6 lg:p-8"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px), radial-gradient(circle at 72% 8%, rgba(31,83,158,0.30), transparent 34%), radial-gradient(circle at 8% 88%, rgba(160,104,22,0.18), transparent 28%)",
          backgroundSize: "56px 56px, 56px 56px, auto, auto",
        }}
      >
        <div className="mx-auto max-w-[1500px] space-y-5">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-gradient-to-br from-orange-400 via-blue-500 to-cyan-300 text-lg font-black shadow-[0_18px_60px_rgba(59,130,246,0.22)]">
                AS
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">AgentSpace</h1>
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/38">Codex + Claude workbench</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={snapshot.runtime.codexCli ? "green" : "default"}>
                <span className={`h-2 w-2 rounded-full ${snapshot.runtime.codexCli ? "bg-emerald-300" : "bg-white/30"}`} />
                Codex CLI
              </Pill>
              <Pill tone={snapshot.runtime.claudeCli ? "green" : "default"}>
                <span className={`h-2 w-2 rounded-full ${snapshot.runtime.claudeCli ? "bg-emerald-300" : "bg-white/30"}`} />
                Claude CLI
              </Pill>
              <button
                type="button"
                onClick={() => openTerminal("codex")}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-400/30 bg-blue-500/12 px-4 text-sm font-semibold text-blue-100 transition hover:bg-blue-500/20"
              >
                <Icon name="plus" />
                Codex terminal
              </button>
              <button
                type="button"
                onClick={() => openTerminal("claude")}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-orange-300/30 bg-orange-500/12 px-4 text-sm font-semibold text-orange-100 transition hover:bg-orange-500/20"
              >
                <Icon name="plus" />
                Claude terminal
              </button>
            </div>
          </header>

          {error && (
            <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-100">
              {error}
            </div>
          )}
          {notice && (
            <div className="flex flex-col gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm text-emerald-50 sm:flex-row sm:items-center sm:justify-between">
              <span>{notice}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="self-start rounded-lg border border-emerald-200/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100 hover:bg-emerald-300/10 sm:self-auto"
              >
                Got it
              </button>
            </div>
          )}

          <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black/35 shadow-[0_28px_120px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.035] via-transparent to-blue-500/[0.055]" />
            <div className="relative grid gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)_280px] xl:p-5">
              <TaskSidebar
                missions={snapshot.missions}
                selectedMission={selectedMission}
                tasks={missionTasks}
                progress={metrics.progress}
                busy={busy}
                onSelectMission={selectMission}
                onMissionStatus={(missionId, status) => command({ action: "update-mission", missionId, status })}
                onTaskStatus={(taskId, status) => command({ action: "update-task", taskId, status })}
              />

              <WorkspaceCenter
                selectedMission={selectedMission}
                terminals={terminals}
                tasks={missionTasks}
                engines={snapshot.engines}
                engineById={engineById}
                liveSessionById={liveSessionById}
                terminalInputs={terminalInputs}
                metrics={metrics}
                onOpenTerminal={openTerminal}
                onStartTerminal={startLiveTerminal}
                onStopTerminal={stopTerminal}
                onClearTerminal={clearTerminal}
                onTerminalInput={(terminalId, value) => setTerminalInputs((items) => ({ ...items, [terminalId]: value }))}
                onSendTerminalInput={sendTerminalInput}
                onRemoveTerminal={(id) => setTerminals((items) => items.filter((item) => item.id !== id))}
              />

              <AgentsPanel
                engines={snapshot.engines}
                messages={missionMessages}
                messageBody={messageBody}
                messageKind={messageKind}
                busy={busy}
                onMessageBody={setMessageBody}
                onMessageKind={setMessageKind}
                onSend={sendMessage}
                onEngineStatus={(engineId, status) => command({ action: "update-engine", engineId, status })}
              />
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="rounded-[24px] border border-white/10 bg-black/28 p-4 backdrop-blur-xl">
              <div className="mb-4 flex items-center gap-2">
                <Icon name="review" className="h-4 w-4 text-violet-200" />
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">Full build loop</p>
                  <h2 className="text-xl font-semibold">Simple workflow</h2>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_40px_1fr_40px_1fr_40px_1fr] md:items-center">
                <LoopStep tone="orange" icon="tasks" title="Task" body="Create the mission and split the work." />
                <Arrow />
                <LoopStep tone="blue" icon="terminal" title="Workspace" body="Open Codex and Claude terminals side by side." />
                <Arrow />
                <LoopStep tone="green" icon="agents" title="Agents" body="Assign owners and track progress." />
                <Arrow />
                <LoopStep tone="purple" icon="review" title="Review" body="Approve outputs before commits or publishing." />
              </div>
            </div>

            <NewMissionPanel
              title={missionTitle}
              brief={missionBrief}
              busy={busy}
              onTitle={setMissionTitle}
              onBrief={setMissionBrief}
              onCreate={createMissionFromForm}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

function createTerminalSession(engine: AgentEngine, task: AgentTask | undefined, index: number): TerminalSession {
  const provider = engine.provider;
  const command =
    provider === "claude"
      ? "claude --no-chrome"
      : provider === "codex"
        ? "codex --no-alt-screen -C /Users/houssam/Documents/Projects/craftplan-digital-svcode"
        : provider === "local"
          ? ""
          : "awaiting approval";
  return {
    id: makeSessionId(provider),
    engineId: engine.id,
    provider,
    title: `${providerLabel[provider]} ${index + 1}`,
    command,
    cwd: "/Users/houssam/Documents/Projects/craftplan-digital-svcode",
    status: task?.status === "review" ? "review" : task?.status === "in_progress" ? "working" : "idle",
    taskId: task?.id,
  };
}

function TaskSidebar({
  missions,
  selectedMission,
  tasks,
  progress,
  busy,
  onSelectMission,
  onMissionStatus,
  onTaskStatus,
}: {
  missions: AgentMission[];
  selectedMission: AgentMission | null;
  tasks: AgentTask[];
  progress: number;
  busy: boolean;
  onSelectMission: (id: string) => void;
  onMissionStatus: (id: string, status: MissionStatus) => void;
  onTaskStatus: (id: string, status: TaskStatus) => void;
}) {
  const todo = tasks.filter((task) => task.status === "queued" || task.status === "blocked");
  const progressTasks = tasks.filter((task) => task.status === "in_progress");
  const reviewTasks = tasks.filter((task) => task.status === "review" || task.status === "done");

  return (
    <aside className="order-2 rounded-[22px] border border-white/10 bg-black/55 p-4 shadow-[0_22px_80px_rgba(0,0,0,0.35)] lg:order-1">
      <div className="mb-4 flex items-center justify-between">
        <Pill tone="orange">
          <span className="h-2 w-2 rounded-full bg-orange-300" />
          Task board
        </Pill>
        <span className="text-xs text-white/35">{progress}%</span>
      </div>

      <div className="mb-4 space-y-2">
        <select
          value={selectedMission?.id || ""}
          onChange={(event) => onSelectMission(event.target.value)}
          className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs text-white"
        >
          {missions.map((mission) => (
            <option key={mission.id} value={mission.id}>{mission.title}</option>
          ))}
        </select>
        {selectedMission && (
          <select
            value={selectedMission.status}
            onChange={(event) => onMissionStatus(selectedMission.id, event.target.value as MissionStatus)}
            disabled={busy}
            className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs text-white"
          >
            {MISSION_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{fmt(status)}</option>
            ))}
          </select>
        )}
      </div>

      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-emerald-300" style={{ width: `${progress}%` }} />
      </div>

      <TaskGroup title="To Do" count={todo.length} tasks={todo} onTaskStatus={onTaskStatus} />
      <TaskGroup title="In Progress" count={progressTasks.length} tasks={progressTasks} onTaskStatus={onTaskStatus} />
      <TaskGroup title="Review / Done" count={reviewTasks.length} tasks={reviewTasks} onTaskStatus={onTaskStatus} />
    </aside>
  );
}

function TaskGroup({
  title,
  count,
  tasks,
  onTaskStatus,
}: {
  title: string;
  count: number;
  tasks: AgentTask[];
  onTaskStatus: (id: string, status: TaskStatus) => void;
}) {
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-white/45">
        <span>{title}</span>
        <span>{count}</span>
      </div>
      <div className="space-y-2">
        {tasks.slice(0, 6).map((task) => (
          <div key={task.id} className="rounded-xl border border-white/10 bg-white/[0.045] p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold leading-5 text-white">{task.title}</p>
              <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase ${priorityClass[task.priority]}`}>
                {task.priority}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-white/38">{task.description}</p>
            <select
              value={task.status}
              onChange={(event) => onTaskStatus(task.id, event.target.value as TaskStatus)}
              className="mt-2 h-8 w-full rounded-lg border border-white/10 bg-black/45 px-2 text-[11px] text-white"
            >
              {TASK_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{fmt(status)}</option>
              ))}
            </select>
          </div>
        ))}
        {!tasks.length && (
          <div className="rounded-xl border border-dashed border-white/10 p-3 text-xs text-white/28">
            Nothing here.
          </div>
        )}
      </div>
    </div>
  );
}

function WorkspaceCenter({
  selectedMission,
  terminals,
  tasks,
  engines,
  engineById,
  liveSessionById,
  terminalInputs,
  metrics,
  onOpenTerminal,
  onStartTerminal,
  onStopTerminal,
  onClearTerminal,
  onTerminalInput,
  onSendTerminalInput,
  onRemoveTerminal,
}: {
  selectedMission: AgentMission | null;
  terminals: TerminalSession[];
  tasks: AgentTask[];
  engines: AgentEngine[];
  engineById: Map<string, AgentEngine>;
  liveSessionById: Map<string, LiveTerminalSession>;
  terminalInputs: Record<string, string>;
  metrics: { terminals: number; active: number; blocked: number; done: number; progress: number };
  onOpenTerminal: (provider: EngineProvider) => void;
  onStartTerminal: (terminal: TerminalSession, autoRun?: boolean) => void;
  onStopTerminal: (terminal: TerminalSession) => void;
  onClearTerminal: (terminal: TerminalSession) => void;
  onTerminalInput: (terminalId: string, value: string) => void;
  onSendTerminalInput: (terminal: TerminalSession) => void;
  onRemoveTerminal: (id: string) => void;
}) {
  return (
    <main className="order-1 min-w-0 space-y-4 lg:order-2">
      <section className="rounded-[22px] border border-white/10 bg-black/45 p-4 shadow-[0_28px_100px_rgba(0,0,0,0.38)]">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <Pill tone="blue">
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              Agent workspace
            </Pill>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white md:text-3xl">
              {selectedMission?.title || "No mission selected"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
              {selectedMission?.brief || "Create a mission and open Codex/Claude terminals to start."}
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <MiniStat label="terms" value={metrics.terminals} />
            <MiniStat label="active" value={metrics.active} />
            <MiniStat label="blocked" value={metrics.blocked} />
            <MiniStat label="done" value={metrics.done} />
          </div>
        </div>

        <div className="mb-4 grid gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-xs text-white/55 md:grid-cols-3">
          <div>
            <span className="font-semibold text-orange-100">Left:</span> mission tasks and progress.
          </div>
          <div>
            <span className="font-semibold text-blue-100">Center:</span> Codex and Claude work lanes.
          </div>
          <div>
            <span className="font-semibold text-emerald-100">Right:</span> agent status and handoff messages.
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
          {terminals.map((terminal) => (
            <TerminalCard
              key={terminal.id}
              terminal={terminal}
              engine={engineById.get(terminal.engineId)}
              task={terminal.taskId ? tasks.find((item) => item.id === terminal.taskId) : undefined}
              liveSession={terminal.liveSessionId ? liveSessionById.get(terminal.liveSessionId) : undefined}
              inputValue={terminalInputs[terminal.id] || ""}
              onStart={() => onStartTerminal(terminal, true)}
              onStop={() => onStopTerminal(terminal)}
              onClear={() => onClearTerminal(terminal)}
              onInput={(value) => onTerminalInput(terminal.id, value)}
              onSend={() => onSendTerminalInput(terminal)}
              onRemove={() => onRemoveTerminal(terminal.id)}
            />
          ))}
          <button
            type="button"
            onClick={() => onOpenTerminal("codex")}
            className="min-h-[220px] rounded-2xl border border-dashed border-white/14 bg-white/[0.025] p-5 text-left transition hover:border-blue-300/40 hover:bg-blue-400/10"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-300/30 bg-blue-400/10 text-blue-100">
              <Icon name="plus" />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-white">Open another terminal</h3>
            <p className="mt-2 text-xs leading-5 text-white/38">
              Add more Codex or Claude panes to let multiple work lanes run side by side.
            </p>
          </button>
        </div>
      </section>

      <section className="rounded-[22px] border border-white/10 bg-black/36 p-4">
        <div className="mb-4 flex items-center justify-between">
          <Pill tone="purple">
            <span className="h-2 w-2 rounded-full bg-violet-300" />
            Session launcher
          </Pill>
          <span className="text-xs text-white/32">{engines.length} engines registered</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <LauncherButton provider="codex" title="Codex builder" subtitle="Implementation terminal" onClick={() => onOpenTerminal("codex")} />
          <LauncherButton provider="claude" title="Claude reviewer" subtitle="Review/copy terminal" onClick={() => onOpenTerminal("claude")} />
          <LauncherButton provider="local" title="Local runner" subtitle="Server and scripts" onClick={() => onOpenTerminal("local")} />
          <LauncherButton provider="human" title="Owner approval" subtitle="Manual checkpoints" onClick={() => onOpenTerminal("human")} />
        </div>
      </section>
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[9px] uppercase tracking-[0.16em] text-white/30">{label}</p>
    </div>
  );
}

function TerminalCard({
  terminal,
  engine,
  task,
  liveSession,
  inputValue,
  onStart,
  onStop,
  onClear,
  onInput,
  onSend,
  onRemove,
}: {
  terminal: TerminalSession;
  engine?: AgentEngine;
  task?: AgentTask;
  liveSession?: LiveTerminalSession;
  inputValue: string;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
  onInput: (value: string) => void;
  onSend: () => void;
  onRemove: () => void;
}) {
  const liveStatus = liveSession?.status || "not started";
  const output = liveSession?.output || "";
  const isRunning = liveSession?.status === "running" || liveSession?.status === "starting";
  const displayCommand = terminal.command || "interactive shell";
  const inputPlaceholder = terminal.provider === "local"
    ? "Run shell command, e.g. echo hi"
    : "Send input to this live session...";

  return (
    <div className={`overflow-hidden rounded-2xl border bg-black shadow-[0_20px_80px_rgba(0,0,0,0.36)] ${providerRing[terminal.provider]}`}>
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.045] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${isRunning ? providerDot[terminal.provider] : "bg-white/25"}`} />
          <span className="truncate text-xs font-semibold text-white">{terminal.title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onStart}
            disabled={isRunning}
            className="rounded-md p-1 text-white/35 hover:bg-white/10 hover:text-white disabled:opacity-30"
            title="Start live session"
          >
            <Icon name="play" className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onStop}
            disabled={!liveSession || liveSession.status === "exited"}
            className="rounded-md p-1 text-white/35 hover:bg-white/10 hover:text-white disabled:opacity-30"
            title="Stop session"
          >
            <Icon name="pause" className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={!liveSession}
            className="rounded-md px-1.5 text-[10px] text-white/35 hover:bg-white/10 hover:text-white disabled:opacity-30"
            title="Clear output"
          >
            clr
          </button>
          <button type="button" onClick={onRemove} className="rounded-md px-1.5 text-white/35 hover:bg-white/10 hover:text-white" title="Close">
            x
          </button>
        </div>
      </div>
      <div className="p-4 font-mono text-[11px] leading-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-orange-300">{providerLabel[terminal.provider]}</span>
          <span className="text-white/25">/</span>
          <span className="text-white/45">{liveStatus}</span>
          <span className="text-white/20">/</span>
          <span className="text-white/38">{engine?.status || terminal.status}</span>
        </div>
        <p className="break-words text-white/42">$ {displayCommand}</p>
        <p className="mt-1 truncate text-white/24">cwd {terminal.cwd}</p>
        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.035] p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/28">Assigned work</p>
          <p className="mt-2 whitespace-pre-wrap text-xs font-sans leading-5 text-white/68">
            {task?.title || "Idle. Drag or assign a task to this terminal."}
          </p>
          {task && (
            <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-emerald-200/70">
              {fmt(task.status)}
            </p>
          )}
        </div>
        <p className="mt-5 text-[10px] text-yellow-200/70">
          {liveSession ? "Live output is streaming below." : "Click play to start a real terminal session."}
        </p>
        <pre className="mt-3 max-h-[260px] min-h-[180px] overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-[#020305] p-3 text-[11px] leading-5 text-emerald-100/78">
          {output || "No live output yet. Start this session to open a shell and run the command."}
        </pre>
        <div className="mt-3 flex gap-2">
          <input
            value={inputValue}
            onChange={(event) => onInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder={liveSession ? inputPlaceholder : "Type a command; Send will start the shell..."}
            className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 font-mono text-xs text-white placeholder:text-white/25"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!inputValue.trim()}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-300/25 bg-emerald-400/10 px-3 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/20 disabled:opacity-35"
          >
            {liveSession ? "Send" : "Start + Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LauncherButton({
  provider,
  title,
  subtitle,
  onClick,
}: {
  provider: EngineProvider;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border bg-white/[0.035] p-4 text-left transition hover:-translate-y-0.5 hover:bg-white/[0.06] ${providerRing[provider]}`}
    >
      <div className="flex items-center gap-3">
        <span className={`h-3 w-3 rounded-full ${providerDot[provider]}`} />
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-white/38">{subtitle}</p>
        </div>
      </div>
    </button>
  );
}

function AgentsPanel({
  engines,
  messages,
  messageBody,
  messageKind,
  busy,
  onMessageBody,
  onMessageKind,
  onSend,
  onEngineStatus,
}: {
  engines: AgentEngine[];
  messages: AgentMessage[];
  messageBody: string;
  messageKind: MessageKind;
  busy: boolean;
  onMessageBody: (body: string) => void;
  onMessageKind: (kind: MessageKind) => void;
  onSend: () => void;
  onEngineStatus: (engineId: string, status: EngineStatus) => void;
}) {
  return (
    <aside className="order-3 space-y-4 rounded-[22px] border border-white/10 bg-black/55 p-4 shadow-[0_22px_80px_rgba(0,0,0,0.35)]">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <Pill tone="green">
            <span className="h-2 w-2 rounded-full bg-emerald-300" />
            Agents
          </Pill>
          <span className="text-xs text-white/35">{engines.length}</span>
        </div>
        <div className="space-y-2">
          {engines.map((engine) => (
            <div key={engine.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{engine.name}</p>
                  <p className="text-[11px] text-white/35">{providerLabel[engine.provider]} / {engine.modelLabel}</p>
                </div>
                <span className={`h-2.5 w-2.5 rounded-full ${providerDot[engine.provider]}`} />
              </div>
              <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-white/42">{engine.role}</p>
              <select
                value={engine.status}
                onChange={(event) => onEngineStatus(engine.id, event.target.value as EngineStatus)}
                className="mt-2 h-8 w-full rounded-lg border border-white/10 bg-black/45 px-2 text-[11px] text-white"
              >
                {ENGINE_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{fmt(status)}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 pt-4">
        <div className="mb-3 flex items-center gap-2">
          <Icon name="send" className="h-4 w-4 text-orange-200" />
          <div>
            <p className="text-sm font-semibold">War room</p>
            <p className="text-[11px] text-white/35">Handoffs, blockers, decisions</p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex gap-2">
            <select
              value={messageKind}
              onChange={(event) => onMessageKind(event.target.value as MessageKind)}
              className="h-10 w-28 rounded-xl border border-white/10 bg-white/[0.04] px-2 text-xs text-white"
            >
              {(["note", "handoff", "blocker", "decision", "system"] as MessageKind[]).map((kind) => (
                <option key={kind} value={kind}>{kind}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={onSend}
              disabled={busy || !messageBody.trim()}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 px-3 text-xs font-semibold text-white transition hover:bg-orange-400 disabled:opacity-40"
            >
              <Icon name="send" />
              Send
            </button>
          </div>
          <textarea
            value={messageBody}
            onChange={(event) => onMessageBody(event.target.value)}
            rows={3}
            placeholder="Tell all engines what changed..."
            className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/25"
          />
        </div>
        <div className="mt-3 max-h-[300px] space-y-2 overflow-y-auto pr-1">
          {messages.map((message) => (
            <div key={message.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white">{message.from}</span>
                <span className="text-[10px] text-white/28">{shortTime(message.createdAt)}</span>
              </div>
              <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-orange-200/70">{message.kind}</p>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-white/48">{message.body}</p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function Arrow() {
  return <div className="hidden h-px bg-white/20 md:block" />;
}

function LoopStep({
  tone,
  icon,
  title,
  body,
}: {
  tone: "orange" | "blue" | "green" | "purple";
  icon: "terminal" | "tasks" | "agents" | "review";
  title: string;
  body: string;
}) {
  const toneClass = {
    orange: "border-orange-300/25 bg-orange-400/10 text-orange-100",
    blue: "border-blue-400/25 bg-blue-400/10 text-blue-100",
    green: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
    purple: "border-violet-400/25 bg-violet-400/10 text-violet-100",
  }[tone];
  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="flex items-center gap-2">
        <Icon name={icon} />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <p className="mt-2 text-xs leading-5 text-white/45">{body}</p>
    </div>
  );
}

function NewMissionPanel({
  title,
  brief,
  busy,
  onTitle,
  onBrief,
  onCreate,
}: {
  title: string;
  brief: string;
  busy: boolean;
  onTitle: (value: string) => void;
  onBrief: (value: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/28 p-4 backdrop-blur-xl">
      <div className="mb-4 flex items-center gap-2">
        <Icon name="plus" className="h-4 w-4 text-orange-200" />
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">New project</p>
          <h2 className="text-xl font-semibold">Create mission</h2>
        </div>
      </div>
      <div className="space-y-3">
        <input
          value={title}
          onChange={(event) => onTitle(event.target.value)}
          placeholder="Example: Rebuild spreadsheet generator"
          className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/25"
        />
        <textarea
          value={brief}
          onChange={(event) => onBrief(event.target.value)}
          rows={4}
          placeholder="Describe the project. AgentSpace will create tasks and assign Codex, Claude, QA, and owner checkpoints."
          className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white placeholder:text-white/25"
        />
        <button
          type="button"
          onClick={onCreate}
          disabled={busy || !title.trim() || !brief.trim()}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:opacity-40"
        >
          <Icon name="plus" />
          Create mission and tasks
        </button>
      </div>
    </div>
  );
}
