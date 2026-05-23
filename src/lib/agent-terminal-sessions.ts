import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import type { EngineProvider } from "@/lib/agent-command-center";

export type LiveTerminalStatus = "starting" | "running" | "exited" | "error";

export interface LiveTerminalSession {
  id: string;
  provider: EngineProvider;
  engineId: string;
  title: string;
  cwd: string;
  command: string;
  taskId?: string;
  status: LiveTerminalStatus;
  createdAt: string;
  updatedAt: string;
  exitCode?: number | null;
  signal?: string | null;
  output: string;
}

export type LiveTerminalEvent =
  | { type: "snapshot"; session: LiveTerminalSession }
  | { type: "chunk"; session: LiveTerminalSession; chunk: string }
  | { type: "status"; session: LiveTerminalSession }
  | { type: "clear"; session: LiveTerminalSession };

interface InternalTerminalSession {
  meta: Omit<LiveTerminalSession, "output">;
  child: ChildProcessWithoutNullStreams;
  output: string;
  subscribers: Set<(event: LiveTerminalEvent) => void>;
}

type GlobalTerminalStore = typeof globalThis & {
  __craftplanLiveTerminals?: Map<string, InternalTerminalSession>;
};

const MAX_OUTPUT_CHARS = 90_000;
const PROJECT_CWD = process.cwd();
const WORKER_PATH = join(PROJECT_CWD, "scripts", "agent-terminal-worker.py");

function terminalStore(): Map<string, InternalTerminalSession> {
  const globalStore = globalThis as GlobalTerminalStore;
  if (!globalStore.__craftplanLiveTerminals) {
    globalStore.__craftplanLiveTerminals = new Map();
  }
  return globalStore.__craftplanLiveTerminals;
}

function now(): string {
  return new Date().toISOString();
}

function makeId(provider: EngineProvider): string {
  return `term_${provider}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function providerCommand(provider: EngineProvider, command?: string): string {
  if (command?.trim()) return command.trim();
  if (provider === "codex") return "codex";
  if (provider === "claude") return "claude";
  if (provider === "local") return "";
  return "";
}

function resolvePython(): string {
  return process.env.PYTHON || "python3";
}

function stripAnsi(value: string): string {
  return value
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function snapshot(session: InternalTerminalSession): LiveTerminalSession {
  return {
    ...session.meta,
    output: session.output,
  };
}

function emit(session: InternalTerminalSession, event: LiveTerminalEvent): void {
  for (const subscriber of session.subscribers) {
    subscriber(event);
  }
}

function appendOutput(session: InternalTerminalSession, raw: Buffer | string): void {
  const chunk = stripAnsi(Buffer.isBuffer(raw) ? raw.toString("utf8") : raw);
  if (!chunk) return;
  session.output = (session.output + chunk).slice(-MAX_OUTPUT_CHARS);
  session.meta.updatedAt = now();
  emit(session, { type: "chunk", session: snapshot(session), chunk });
}

export function createLiveTerminalSession(input: {
  provider: EngineProvider;
  engineId: string;
  title: string;
  cwd?: string;
  taskId?: string;
  command?: string;
  autoRun?: boolean;
}): LiveTerminalSession {
  if (!existsSync(WORKER_PATH)) {
    throw new Error(`Terminal worker not found at ${WORKER_PATH}`);
  }

  const id = makeId(input.provider);
  const timestamp = now();
  const command = providerCommand(input.provider, input.command);
  const cwd = input.cwd || PROJECT_CWD;
  const python = resolvePython();
  const workerConfig = {
    cwd,
    shell: "/bin/zsh",
    initialCommand: input.autoRun && command ? command : "",
    env: {
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      CLICOLOR_FORCE: "1",
      FORCE_COLOR: "1",
    },
  };

  const child = spawn(python, [WORKER_PATH, JSON.stringify(workerConfig)], {
    cwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      CLICOLOR_FORCE: "1",
      FORCE_COLOR: "1",
    },
    stdio: "pipe",
  });

  const session: InternalTerminalSession = {
    meta: {
      id,
      provider: input.provider,
      engineId: input.engineId,
      title: input.title,
      cwd,
      command,
      taskId: input.taskId,
      status: "starting",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    child,
    output: `Starting ${input.title}...\n`,
    subscribers: new Set(),
  };

  terminalStore().set(id, session);

  child.stdout.on("data", (data) => {
    session.meta.status = "running";
    appendOutput(session, data);
  });

  child.stderr.on("data", (data) => appendOutput(session, data));

  child.on("error", (error) => {
    session.meta.status = "error";
    session.meta.updatedAt = now();
    appendOutput(session, `\n[terminal error] ${error.message}\n`);
    emit(session, { type: "status", session: snapshot(session) });
  });

  child.on("exit", (code, signal) => {
    session.meta.status = "exited";
    session.meta.exitCode = code;
    session.meta.signal = signal;
    session.meta.updatedAt = now();
    appendOutput(session, `\n[session exited${code === null ? "" : ` code=${code}`}${signal ? ` signal=${signal}` : ""}]\n`);
    emit(session, { type: "status", session: snapshot(session) });
  });

  setTimeout(() => {
    if (session.meta.status === "starting") {
      session.meta.status = "running";
      session.meta.updatedAt = now();
      emit(session, { type: "status", session: snapshot(session) });
    }
  }, 700);

  return snapshot(session);
}

export function listLiveTerminalSessions(): LiveTerminalSession[] {
  return Array.from(terminalStore().values())
    .map(snapshot)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getLiveTerminalSession(id: string): LiveTerminalSession | null {
  const session = terminalStore().get(id);
  return session ? snapshot(session) : null;
}

export function writeLiveTerminalSession(id: string, input: string): LiveTerminalSession {
  const session = terminalStore().get(id);
  if (!session) throw new Error("Terminal session not found");
  if (session.child.killed || session.meta.status === "exited") {
    throw new Error("Terminal session is not running");
  }
  session.child.stdin.write(input);
  session.meta.updatedAt = now();
  return snapshot(session);
}

export function clearLiveTerminalSession(id: string): LiveTerminalSession {
  const session = terminalStore().get(id);
  if (!session) throw new Error("Terminal session not found");
  session.output = "";
  session.meta.updatedAt = now();
  emit(session, { type: "clear", session: snapshot(session) });
  return snapshot(session);
}

export function stopLiveTerminalSession(id: string, force = false): LiveTerminalSession {
  const session = terminalStore().get(id);
  if (!session) throw new Error("Terminal session not found");
  if (!session.child.killed && session.meta.status !== "exited") {
    if (force) {
      session.child.kill("SIGKILL");
    } else {
      session.child.stdin.write("\u0003");
      setTimeout(() => {
        if (!session.child.killed && session.meta.status !== "exited") {
          session.child.kill("SIGTERM");
        }
      }, 400);
    }
  }
  session.meta.updatedAt = now();
  emit(session, { type: "status", session: snapshot(session) });
  return snapshot(session);
}

export function subscribeLiveTerminalSession(
  id: string,
  subscriber: (event: LiveTerminalEvent) => void,
): () => void {
  const session = terminalStore().get(id);
  if (!session) {
    throw new Error("Terminal session not found");
  }
  session.subscribers.add(subscriber);
  subscriber({ type: "snapshot", session: snapshot(session) });
  return () => {
    session.subscribers.delete(subscriber);
  };
}
