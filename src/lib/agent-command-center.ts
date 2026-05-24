import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { execFileSync } from "child_process";

export type EngineProvider = "codex" | "claude" | "local" | "human";
export type EngineStatus = "online" | "busy" | "paused" | "offline";
export type MissionStatus = "planning" | "active" | "blocked" | "review" | "completed";
export type TaskStatus = "queued" | "in_progress" | "blocked" | "review" | "done";
export type TaskPriority = "low" | "medium" | "high" | "critical";
export type MessageKind = "note" | "handoff" | "blocker" | "decision" | "system";

export interface AgentEngine {
  id: string;
  name: string;
  provider: EngineProvider;
  role: string;
  modelLabel: string;
  status: EngineStatus;
  costMode: string;
  capabilities: string[];
  commandHint: string;
  currentTaskId?: string;
  lastSeen: string;
}

export interface AgentTask {
  id: string;
  missionId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedEngineId: string;
  dependsOn: string[];
  checklist: Array<{ label: string; done: boolean }>;
  createdAt: string;
  updatedAt: string;
}

export interface AgentMission {
  id: string;
  title: string;
  brief: string;
  status: MissionStatus;
  priority: TaskPriority;
  createdAt: string;
  updatedAt: string;
}

export interface AgentMessage {
  id: string;
  missionId?: string;
  taskId?: string;
  from: string;
  targetEngineIds: string[];
  kind: MessageKind;
  body: string;
  createdAt: string;
}

export interface AgentCommandState {
  engines: AgentEngine[];
  missions: AgentMission[];
  tasks: AgentTask[];
  messages: AgentMessage[];
  updatedAt: string;
}

export interface RuntimeAvailability {
  codexCli: boolean;
  claudeCli: boolean;
  checkedAt: string;
}

export interface AgentCommandSnapshot extends AgentCommandState {
  runtime: RuntimeAvailability;
}

const DATA_PATH = join(process.cwd(), "data", "agent-command-center.json");

function now(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultState(): AgentCommandState {
  const timestamp = now();
  const missionId = "mission_factory_rebuild";
  return {
    updatedAt: timestamp,
    engines: [
      {
        id: "codex_primary",
        name: "Codex Primary Builder",
        provider: "codex",
        role: "Owns implementation, integration, tests, and final merge readiness.",
        modelLabel: "Codex / GPT engineering agent",
        status: "online",
        costMode: "Subscription",
        capabilities: ["code edits", "terminal", "tests", "browser QA", "integration"],
        commandHint: "Use this chat or a Codex CLI session for implementation work.",
        currentTaskId: "task_architecture",
        lastSeen: timestamp,
      },
      {
        id: "claude_code",
        name: "Claude Code Reviewer",
        provider: "claude",
        role: "Secondary reviewer for architecture, copy, product taste, and risk checks.",
        modelLabel: "Claude Code",
        status: "paused",
        costMode: "Subscription",
        capabilities: ["review", "copy critique", "architecture feedback", "handoff notes"],
        commandHint: "Open Claude Code in the same repo and paste the mission or task handoff.",
        lastSeen: timestamp,
      },
      {
        id: "codex_qa",
        name: "Codex QA Runner",
        provider: "codex",
        role: "Runs focused verification, screenshots, lint, build, and regression checks.",
        modelLabel: "Codex verification lane",
        status: "online",
        costMode: "Subscription",
        capabilities: ["lint", "build", "screenshots", "responsive QA", "bug reproduction"],
        commandHint: "Assign verification tasks here after implementation changes land.",
        lastSeen: timestamp,
      },
      {
        id: "local_shell",
        name: "Local Shell Runner",
        provider: "local",
        role: "Tracks deterministic commands and dev-server tasks.",
        modelLabel: "Local machine",
        status: "online",
        costMode: "Free",
        capabilities: ["dev server", "scripts", "build commands", "logs"],
        commandHint: "Use for npm, tsx, curl, Playwright, and non-AI command runs.",
        lastSeen: timestamp,
      },
      {
        id: "human_owner",
        name: "Human Owner",
        provider: "human",
        role: "Approves publishing, commits, pushes, product direction, and risky actions.",
        modelLabel: "You",
        status: "online",
        costMode: "Manual approval",
        capabilities: ["approval", "product taste", "account access", "publishing"],
        commandHint: "Required for Etsy publish, commits, pushes, billing choices, and final taste calls.",
        lastSeen: timestamp,
      },
    ],
    missions: [
      {
        id: missionId,
        title: "Build the multi-agent command dashboard",
        brief:
          "Create a dashboard that combines Codex and Claude Code into one control surface with engines, tasks, progress, messages, handoffs, and project mission planning.",
        status: "active",
        priority: "critical",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    tasks: [
      createTaskSeed({
        id: "task_architecture",
        missionId,
        title: "Define command-center architecture",
        description: "Model engines, missions, tasks, messages, and safe control boundaries.",
        status: "in_progress",
        priority: "critical",
        assignedEngineId: "codex_primary",
      }),
      createTaskSeed({
        id: "task_dashboard_ui",
        missionId,
        title: "Build the management dashboard UI",
        description: "Show engine roster, active mission, task board, messages, and operator controls.",
        status: "queued",
        priority: "critical",
        assignedEngineId: "codex_primary",
      }),
      createTaskSeed({
        id: "task_claude_handoff",
        missionId,
        title: "Create Claude Code handoff lane",
        description: "Prepare a clean handoff format so Claude Code can review or critique a selected task.",
        status: "queued",
        priority: "high",
        assignedEngineId: "claude_code",
      }),
      createTaskSeed({
        id: "task_verification",
        missionId,
        title: "Verify routes, layout, and persistence",
        description: "Run TypeScript, lint, browser screenshots, and API smoke checks.",
        status: "queued",
        priority: "high",
        assignedEngineId: "codex_qa",
      }),
    ],
    messages: [
      {
        id: "msg_initial",
        missionId,
        from: "system",
        targetEngineIds: ["codex_primary", "claude_code", "codex_qa"],
        kind: "system",
        body:
          "Command Center initialized. Codex owns implementation. Claude Code is available as a secondary reviewer/copy strategist. Human Owner approves risky actions.",
        createdAt: timestamp,
      },
    ],
  };
}

function createTaskSeed(input: {
  id: string;
  missionId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedEngineId: string;
}): AgentTask {
  const timestamp = now();
  return {
    ...input,
    dependsOn: [],
    checklist: [
      { label: "Understand the request", done: input.status !== "queued" },
      { label: "Do the work", done: input.status === "done" },
      { label: "Report outcome", done: false },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function readState(): AgentCommandState {
  if (!existsSync(DATA_PATH)) {
    const initial = defaultState();
    writeState(initial);
    return initial;
  }
  try {
    const raw = readFileSync(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw) as AgentCommandState;
    return {
      ...defaultState(),
      ...parsed,
      engines: parsed.engines || [],
      missions: parsed.missions || [],
      tasks: parsed.tasks || [],
      messages: parsed.messages || [],
    };
  } catch {
    const initial = defaultState();
    writeState(initial);
    return initial;
  }
}

function writeState(state: AgentCommandState): AgentCommandState {
  mkdirSync(dirname(DATA_PATH), { recursive: true });
  const next = { ...state, updatedAt: now() };
  writeFileSync(DATA_PATH, JSON.stringify(next, null, 2));
  return next;
}

function hasExecutable(binary: string): boolean {
  try {
    execFileSync("which", [binary], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function getRuntimeAvailability(): RuntimeAvailability {
  return {
    codexCli: hasExecutable("codex"),
    claudeCli: hasExecutable("claude"),
    checkedAt: now(),
  };
}

export function getAgentCommandSnapshot(): AgentCommandSnapshot {
  return {
    ...readState(),
    runtime: getRuntimeAvailability(),
  };
}

export function createMission(input: { title: string; brief: string; priority?: TaskPriority }): AgentCommandState {
  const state = readState();
  const timestamp = now();
  const missionId = makeId("mission");
  const mission: AgentMission = {
    id: missionId,
    title: input.title.trim() || "Untitled mission",
    brief: input.brief.trim(),
    status: "planning",
    priority: input.priority || "high",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const tasks = createMissionTasks(missionId, mission.brief, mission.priority);
  const next: AgentCommandState = {
    ...state,
    missions: [mission, ...state.missions],
    tasks: [...tasks, ...state.tasks],
    messages: [
      {
        id: makeId("msg"),
        missionId,
        from: "human_owner",
        targetEngineIds: ["codex_primary", "claude_code", "codex_qa"],
        kind: "handoff",
        body: `New mission created: ${mission.title}\n\n${mission.brief}`,
        createdAt: timestamp,
      },
      ...state.messages,
    ],
  };
  return writeState(next);
}

function createMissionTasks(missionId: string, brief: string, priority: TaskPriority): AgentTask[] {
  const timestamp = now();
  const normalized = brief.toLowerCase();
  const includesDesign = /ui|design|layout|dashboard|frontend|page/.test(normalized);
  const includesApi = /api|server|database|persist|store|integration|agent|engine/.test(normalized);
  const includesResearch = /research|market|etsy|competitor|strategy/.test(normalized);

  const specs = [
    {
      title: "Clarify mission and constraints",
      description: "Turn the project brief into concrete scope, risks, and acceptance criteria.",
      assignedEngineId: "codex_primary",
      status: "queued" as TaskStatus,
    },
    includesResearch && {
      title: "Research and product-direction review",
      description: "Use Claude Code as reviewer/copy strategist to challenge assumptions and improve positioning.",
      assignedEngineId: "claude_code",
      status: "queued" as TaskStatus,
    },
    includesApi && {
      title: "Build data/API foundation",
      description: "Create the persistence, route handlers, and control surface contracts.",
      assignedEngineId: "codex_primary",
      status: "queued" as TaskStatus,
    },
    includesDesign && {
      title: "Build premium responsive UI",
      description: "Implement the user-facing dashboard with clear states, controls, and mobile layout.",
      assignedEngineId: "codex_primary",
      status: "queued" as TaskStatus,
    },
    {
      title: "Run verification and smoke tests",
      description: "Run TypeScript, lint, route checks, and browser screenshots before handoff.",
      assignedEngineId: "codex_qa",
      status: "queued" as TaskStatus,
    },
    {
      title: "Human approval checkpoint",
      description: "Collect owner approval before commits, pushes, publishing, billing changes, or risky automation.",
      assignedEngineId: "human_owner",
      status: "queued" as TaskStatus,
    },
  ].filter(Boolean) as Array<{ title: string; description: string; assignedEngineId: string; status: TaskStatus }>;

  return specs.map((spec, index) => ({
    id: makeId("task"),
    missionId,
    title: spec.title,
    description: spec.description,
    status: spec.status,
    priority: index === 0 ? priority : index >= specs.length - 2 ? "high" : "medium",
    assignedEngineId: spec.assignedEngineId,
    dependsOn: index === 0 ? [] : [],
    checklist: [
      { label: "Assigned", done: true },
      { label: "In progress", done: false },
      { label: "Reviewed", done: false },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

export function updateTask(input: {
  taskId: string;
  status?: TaskStatus;
  assignedEngineId?: string;
  title?: string;
  description?: string;
}): AgentCommandState {
  const state = readState();
  const timestamp = now();
  const tasks = state.tasks.map((task) => {
    if (task.id !== input.taskId) return task;
    return {
      ...task,
      status: input.status || task.status,
      assignedEngineId: input.assignedEngineId || task.assignedEngineId,
      title: input.title ?? task.title,
      description: input.description ?? task.description,
      checklist: task.checklist.map((item) => {
        if (input.status === "in_progress" && item.label === "In progress") return { ...item, done: true };
        if (input.status === "review" && item.label === "Reviewed") return { ...item, done: true };
        if (input.status === "done") return { ...item, done: true };
        return item;
      }),
      updatedAt: timestamp,
    };
  });
  const engines = state.engines.map((engine) => {
    const currentTask = tasks.find((task) => task.assignedEngineId === engine.id && task.status === "in_progress");
    return {
      ...engine,
      status: currentTask ? "busy" as EngineStatus : engine.status === "busy" ? "online" as EngineStatus : engine.status,
      currentTaskId: currentTask?.id,
      lastSeen: currentTask ? timestamp : engine.lastSeen,
    };
  });
  return writeState({ ...state, tasks, engines });
}

export function updateEngine(input: { engineId: string; status: EngineStatus }): AgentCommandState {
  const state = readState();
  const timestamp = now();
  return writeState({
    ...state,
    engines: state.engines.map((engine) =>
      engine.id === input.engineId
        ? { ...engine, status: input.status, lastSeen: timestamp }
        : engine,
    ),
  });
}

export function postAgentMessage(input: {
  missionId?: string;
  taskId?: string;
  from?: string;
  targetEngineIds?: string[];
  kind?: MessageKind;
  body: string;
}): AgentCommandState {
  const state = readState();
  const message: AgentMessage = {
    id: makeId("msg"),
    missionId: input.missionId,
    taskId: input.taskId,
    from: input.from || "human_owner",
    targetEngineIds: input.targetEngineIds || [],
    kind: input.kind || "note",
    body: input.body.trim(),
    createdAt: now(),
  };
  return writeState({
    ...state,
    messages: [message, ...state.messages],
  });
}

export function updateMission(input: { missionId: string; status?: MissionStatus }): AgentCommandState {
  const state = readState();
  const timestamp = now();
  return writeState({
    ...state,
    missions: state.missions.map((mission) =>
      mission.id === input.missionId
        ? { ...mission, status: input.status || mission.status, updatedAt: timestamp }
        : mission,
    ),
  });
}
