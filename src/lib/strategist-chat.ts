/**
 * Strategist Chat — multi-agent group conversation backend.
 *
 * The seller sits in a chat room with 4 AI personas:
 *   • Researcher  (Gemini 2.5 Flash) — market data, niche analysis,
 *                                       Etsy trends from local DB
 *   • Strategist  (Gemini 2.5 Flash) — high-level moves, prioritization,
 *                                       what-next decisions
 *   • Critic      (GPT-4o-mini)      — push back, find flaws, sanity check
 *   • Builder     (GPT-4o-mini)      — implementation, code, fixes,
 *                                       prompt engineering
 *
 * Persistence: simple JSON file at data/strategist-chat.json — survives
 * dev restarts, easy to back up / inspect, no migration friction.  When
 * the conversation grows past ~10MB we'll move to SQLite, but at the
 * realistic scale of one seller chatting daily that's months out.
 *
 * Routing rule for which agent(s) reply:
 *   1. Explicit @-mention → only that agent replies
 *   2. Open-ended question → orchestrator picks 1-2 most-relevant
 *      agents by keyword match (research/trend → researcher, code/fix →
 *      builder, etc.).  When ambiguous, defaults to Strategist alone so
 *      the seller doesn't get a 4-way pile-on.
 */

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

export type AgentName = "researcher" | "strategist" | "critic" | "builder";
export type MessageAuthor = "user" | AgentName | "system";

export interface ChatAttachment {
  kind: "image";
  /** Full data URL — kept inline so the JSON is self-contained. */
  dataUrl: string;
  /** Optional caption / filename for display. */
  caption?: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  author: MessageAuthor;
  content: string;
  attachments?: ChatAttachment[];
  /** ISO timestamp. */
  ts: string;
  /** USD cost — present on agent messages, undefined on user/system. */
  cost?: number;
  /** When agent had to pick which agent(s) to invoke, log it for transparency. */
  routedTo?: AgentName[];
  /** True when this message was auto-routed via @-mention. */
  mentionTrigger?: boolean;
}

export interface ChatThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Soft-archive flag — hides from sidebar but keeps history. */
  archived?: boolean;
}

export interface ChatStore {
  threads: ChatThread[];
  messages: ChatMessage[];
  /** Aggregate USD spent across all messages — quick dashboard read. */
  totalCost: number;
}

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "strategist-chat.json");

// ── Storage primitives ─────────────────────────────────────────────

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function loadStore(): Promise<ChatStore> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as ChatStore;
    // Defensive defaults so a partial/corrupt file doesn't crash callers.
    return {
      threads: Array.isArray(parsed.threads) ? parsed.threads : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      totalCost: typeof parsed.totalCost === "number" ? parsed.totalCost : 0,
    };
  } catch {
    return { threads: [], messages: [], totalCost: 0 };
  }
}

async function saveStore(store: ChatStore): Promise<void> {
  await ensureDir();
  // Atomic-ish write: tmp file → rename.  Prevents readers seeing a
  // half-written JSON if the process is killed mid-write.
  const tmp = `${STORE_PATH}.tmp-${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf-8");
  await fs.rename(tmp, STORE_PATH);
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(6).toString("hex")}`;
}

// ── Thread CRUD ────────────────────────────────────────────────────

export async function listThreads(): Promise<ChatThread[]> {
  const store = await loadStore();
  return store.threads
    .filter((t) => !t.archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createThread(title: string): Promise<ChatThread> {
  const store = await loadStore();
  const now = new Date().toISOString();
  const thread: ChatThread = {
    id: newId("thread"),
    title: title.trim() || "New conversation",
    createdAt: now,
    updatedAt: now,
  };
  store.threads.push(thread);
  await saveStore(store);
  return thread;
}

export async function getThreadMessages(threadId: string): Promise<ChatMessage[]> {
  const store = await loadStore();
  return store.messages
    .filter((m) => m.threadId === threadId)
    .sort((a, b) => a.ts.localeCompare(b.ts));
}

export async function archiveThread(threadId: string): Promise<void> {
  const store = await loadStore();
  const thread = store.threads.find((t) => t.id === threadId);
  if (thread) {
    thread.archived = true;
    thread.updatedAt = new Date().toISOString();
    await saveStore(store);
  }
}

// ── Message append + cost tracking ─────────────────────────────────

export async function appendMessage(
  msg: Omit<ChatMessage, "id" | "ts">,
): Promise<ChatMessage> {
  const store = await loadStore();
  const full: ChatMessage = {
    ...msg,
    id: newId("msg"),
    ts: new Date().toISOString(),
  };
  store.messages.push(full);
  // Bump thread updatedAt so the sidebar shows newest activity first.
  const thread = store.threads.find((t) => t.id === msg.threadId);
  if (thread) thread.updatedAt = full.ts;
  if (typeof msg.cost === "number") store.totalCost += msg.cost;
  await saveStore(store);
  return full;
}

// ── @-mention parser ───────────────────────────────────────────────

const AGENT_HANDLES: Record<string, AgentName> = {
  "@researcher": "researcher",
  "@strategist": "strategist",
  "@critic": "critic",
  "@builder": "builder",
  // Common aliases — sellers won't always remember exact handles.
  "@research": "researcher",
  "@strategy": "strategist",
  "@review": "critic",
  "@code": "builder",
  "@dev": "builder",
};

/**
 * Find @-mentions at the start or anywhere in the message.  Returns
 * unique agent list in the order they appeared.
 */
export function parseMentions(content: string): AgentName[] {
  const out: AgentName[] = [];
  const seen = new Set<AgentName>();
  // Match @word at word boundaries — case-insensitive.
  const matches = content.matchAll(/@(\w+)/gi);
  for (const m of matches) {
    const handle = `@${m[1].toLowerCase()}`;
    const agent = AGENT_HANDLES[handle];
    if (agent && !seen.has(agent)) {
      seen.add(agent);
      out.push(agent);
    }
  }
  return out;
}

// ── Auto-routing for un-mentioned messages ─────────────────────────

/**
 * Detect group greetings / social opener messages.  When the user is
 * addressing the whole team ("hey guys", "hi team", "anyone there",
 * "yo everyone"), the right behavior is for ALL FOUR agents to jump
 * in with a quick hello — not a single agent answering as if it were
 * a substantive question.  This makes the room feel like a real team
 * standup instead of a one-on-one with whoever the router picked.
 */
export function isGroupGreeting(content: string): boolean {
  const trimmed = content.trim().toLowerCase();
  if (trimmed.length > 80) return false; // Real questions aren't this short
  // Greeting verb patterns
  const hasGreeting = /\b(hi|hey|hello|yo|sup|howdy|morning|afternoon|evening|hola|salam|ahoy|wassup|good\s+(morning|afternoon|evening))\b/i.test(trimmed);
  // Group addressing patterns — "guys", "team", "everyone", "all", "y'all", "folks", "people"
  const hasGroupAddress = /\b(guys|team|everyone|every\s*one|all|y'?all|folks|people|squad|gang|crew|fam)\b/i.test(trimmed);
  // Bare greetings ("hi", "hello") are also group-greeting at the start of a thread
  const isBareGreeting =
    /^(hi|hey|hello|yo|sup|howdy)[\s.!?]*$/i.test(trimmed) ||
    /^(good\s+(morning|afternoon|evening))[\s.!?]*$/i.test(trimmed);
  // Explicit "everyone weigh in" / "anyone there" prompts
  const isAddressAll = /\b(anyone\s+(there|here|home|around)|everyone\s+weigh|all\s+(thoughts|chime|say)|whole\s+team)\b/i.test(trimmed);
  return (hasGreeting && hasGroupAddress) || isBareGreeting || isAddressAll;
}

/**
 * Pick which agent(s) should respond when the user didn't @-mention
 * anyone.  Three modes:
 *   1. Group greeting → all 4 agents reply briefly (team standup feel)
 *   2. Topic message  → keyword scoring, top 1-2 most relevant
 *   3. Anything else  → Strategist alone (default fallback)
 */
export function autoRoute(content: string): AgentName[] {
  // Mode 1: group greeting — pull EVERYONE in for a quick hello.
  if (isGroupGreeting(content)) {
    return ["researcher", "strategist", "critic", "builder"];
  }

  const lower = content.toLowerCase();

  // Score each agent based on keyword triggers
  const scores: Record<AgentName, number> = {
    researcher: 0,
    strategist: 0,
    critic: 0,
    builder: 0,
  };

  // Researcher — market signals, niches, trends, competitor data
  for (const kw of [
    "trend", "niche", "research", "market", "competitor", "etsy",
    "pinterest", "tiktok", "search volume", "demand", "popular",
    "seasonal", "holiday", "what's selling", "data",
  ]) {
    if (lower.includes(kw)) scores.researcher += 2;
  }

  // Strategist — high-level moves, planning, prioritization
  for (const kw of [
    "should i", "what next", "plan", "strategy", "focus", "priority",
    "decision", "approach", "long term", "goal", "roadmap",
    "scale", "grow", "profit", "business",
  ]) {
    if (lower.includes(kw)) scores.strategist += 2;
  }

  // Critic — feedback, sanity check, review
  for (const kw of [
    "is this good", "review", "feedback", "thoughts", "wrong", "bad",
    "concern", "risk", "problem", "issue", "broken", "doesn't work",
    "critique", "what do you think",
  ]) {
    if (lower.includes(kw)) scores.critic += 2;
  }

  // Builder — implementation, fixing, prompts, code
  for (const kw of [
    "build", "implement", "code", "fix", "bug", "error", "prompt",
    "engine", "pipeline", "convert", "render", "pdf", "chart",
    "function", "api", "deploy", "ship",
  ]) {
    if (lower.includes(kw)) scores.builder += 2;
  }

  // Pick top 2 by score, but require score > 0
  const ranked = (Object.entries(scores) as [AgentName, number][])
    .filter(([, s]) => s > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([agent]) => agent);

  // Default fallback: Strategist alone for open-ended chat
  return ranked.length > 0 ? ranked : ["strategist"];
}

// ── Cost estimation ─────────────────────────────────────────────────

/**
 * Per-message USD cost estimates based on typical token counts.
 * These are LOW-side estimates — the actual API call may cost more if
 * the response is long.  We surface the rough number to the seller so
 * they can see "this conversation is costing me $0.0X" not the exact
 * cent breakdown.
 *
 * Gemini 2.5 Flash:  $0.000075 / 1k input tokens, $0.0003 / 1k output
 *   → typical chat reply (500 in, 800 out) ≈ $0.000275
 * GPT-4o-mini:       $0.00015 / 1k input tokens, $0.0006 / 1k output
 *   → typical chat reply (500 in, 800 out) ≈ $0.000555
 */
export const AGENT_MODEL: Record<AgentName, "gemini" | "openai"> = {
  researcher: "gemini",
  strategist: "gemini",
  critic: "openai",
  builder: "openai",
};

export const AGENT_COST_PER_REPLY: Record<AgentName, number> = {
  researcher: 0.0003,
  strategist: 0.0003,
  critic: 0.0006,
  builder: 0.0006,
};
