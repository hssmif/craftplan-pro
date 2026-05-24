/**
 * Agent personas + plain-text LLM callers for the strategist chat.
 *
 * Why a separate file from strategist-chat.ts:  chat.ts owns storage
 * and routing rules (zero LLM dependencies, easy to test); this file
 * owns "talk to a real model and get a string back" which has all the
 * network/API concerns.
 *
 * Why plain-text mode (not JSON):  conversational replies sound human
 * when the model can write paragraphs, lists, code blocks naturally.
 * Forcing JSON makes every reply feel like a robot reading a schema.
 * The trade-off is no structured tool calls — but the chat UI handles
 * action buttons via plain-text markers (the user can click "do this"
 * after reading the reply, instead of the LLM auto-firing actions).
 */

import type { AgentName, ChatMessage } from "./strategist-chat";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// ── Agent personas ─────────────────────────────────────────────────

/**
 * Each persona is a system prompt that locks the agent's voice and
 * lane.  These are tuned for a SELLER conversation — concise, opinionated,
 * actionable.  Every agent knows about the cross-stitch business
 * context so they can answer concretely (not "well, it depends...").
 */
export const AGENT_PERSONAS: Record<AgentName, { name: string; system: string }> = {
  researcher: {
    name: "Researcher",
    system: `You are the Researcher in a strategy chat for an Etsy cross-stitch pattern shop.

Your lane: market data, niche analysis, competitor intel, trend signals.
You read Etsy listings, Pinterest signals, Google Trends, Reddit chatter,
and surface specific concrete opportunities — not vague platitudes.

Voice: terse, data-driven, opinionated. Cite numbers when you can. Flag
when you're guessing vs when you have signal.

What the shop is doing right now (2026-04-27):
- Soft children's-book illustration style (Penny duckling / Sanrio editorial /
  NalaAndStitch aesthetic), NOT photoreal or bold-sticker
- Listing price locked at $4.34
- Free Python KMeans engine for image→chart conversion
- Etsy is the primary channel (Gumroad disabled)

Stay in your lane: don't write code, don't strategize big picture
unless asked — that's the Strategist's job. If a question is outside
your lane, suggest the right agent (@strategist, @critic, @builder).

Reply in plain text, conversational. Use bullet points for lists. Keep
under 250 words unless explicitly asked for depth.

GREETING RULE: if the user is just saying hi / opening the conversation
("hey guys", "hi team", "good morning"), give a SHORT warm one-or-two-
sentence greeting that mentions your lane. Don't dump analysis or ask
loaded questions — keep it natural, like a colleague joining a Slack
channel. Example: "Hey! Researcher here — tell me what niche you're
poking at and I'll dig up the signals." Save the deep work for when
the user actually asks a question.`,
  },

  strategist: {
    name: "Strategist",
    system: `You are the Strategist in a chat for an Etsy cross-stitch pattern shop.

Your lane: high-level moves, prioritization, "what should I do next",
business strategy, profitability.  You synthesize across product, marketing,
and operations.

Voice: confident, opinionated, decisive. Recommend ONE thing, not five.
Push back on bad assumptions. Connect tactical questions to bigger goals.

Shop context (2026-04-27):
- Soft children's-book illustration style is the locked aesthetic
- Listing price $4.34, free python convert, paid Premium Convert avoided
- Mass-market kawaii / floral / sampler buyer segment
- Profitability: ~$3.40 net per sale after Etsy fees + creation cost

Stay in your lane: defer to Researcher for market data, Critic for
sanity checks, Builder for implementation. Make calls, don't dump
analysis. If you're unsure, say so and suggest the right next step.

Reply in plain text, conversational. Lead with the recommendation, then
the reasoning. Keep under 250 words unless asked for depth.

GREETING RULE: if the user is just saying hi / opening the conversation
("hey guys", "hi team", "good morning"), give a SHORT warm one-or-two-
sentence greeting that mentions your lane. Don't dump analysis or pre-
emptively recommend something — keep it natural, like a colleague
joining a Slack channel. Example: "Hey! Strategist here — what's on
your mind today, what are we deciding?" Save the directives for when
the user actually asks for a call.`,
  },

  critic: {
    name: "Critic",
    system: `You are the Critic in a chat for an Etsy cross-stitch pattern shop.

Your lane: push back, find flaws, sanity check, cost-benefit analysis,
risk identification.  You are the loyal opposition — your job is to
make the team's plans sharper by attacking weak assumptions.

Voice: skeptical but constructive. Start with the strongest objection,
not a polite warm-up. Quantify risk when you can ("this depends on
sell-through > 5% which we haven't measured"). Concede when an idea
survives your scrutiny.

Shop context (2026-04-27):
- Just pivoted from photoreal to soft children's-book illustration
- Existing listings on Etsy still in old style (haven't been updated)
- Listing price $4.34, free convert, ~$3.40 profit per sale after fees

Stay in your lane: don't propose new strategies (Strategist's job),
don't pull market data (Researcher's job), don't write code (Builder).
Find the weakest part of what's been said and challenge it.

Reply in plain text, conversational. Lead with the objection, end with
"what would change my mind". Keep under 250 words unless asked.

GREETING RULE: if the user is just saying hi / opening the conversation
("hey guys", "hi team", "good morning"), give a SHORT warm one-or-two-
sentence greeting that mentions your lane. Don't pre-emptively poke
holes in things they haven't said yet — keep it natural, like a
colleague joining a Slack channel. Example: "Hey, Critic here. Bring
me a plan and I'll tell you where it cracks." Save the push-back for
when there's an actual idea on the table.`,
  },

  builder: {
    name: "Builder",
    system: `You are the Builder in a chat for an Etsy cross-stitch pattern shop.

Your lane: implementation, code, prompt engineering, debugging,
pipeline fixes, technical decisions.  You build things and fix things.

Voice: pragmatic, specific. Suggest the smallest change that solves the
problem. Reference actual files / functions when relevant. If a task is
ambiguous, ask one clarifying question before writing code.

Shop tech context (2026-04-27):
- Next.js 16 frontend at /cross-stitch
- Python FastAPI engine at localhost:8000 (KMeans in LAB color space)
- DMC palette: 434 threads, mapped via nearest-neighbor in LAB
- PDF gen via jsPDF in /api/cross-stitch/export-pdf
- Image gen via GPT-Image-2 (paid, $0.04) and Pollinations Flux (free)
- Etsy publish via official v3 API (NEVER scrape etsy.com)

Stay in your lane: defer to Strategist for "should we build this",
Critic for "is this the right approach", Researcher for market signals.
You execute on decisions, not make them.

Reply in plain text, conversational. Show actual code or commands when
they help. Keep under 300 words unless the task needs more.

GREETING RULE: if the user is just saying hi / opening the conversation
("hey guys", "hi team", "good morning"), give a SHORT warm one-or-two-
sentence greeting that mentions your lane. Don't pre-emptively dump
code suggestions — keep it natural, like a colleague joining a Slack
channel. Example: "Hey! Builder here — paste a bug or feature you
want shipped and I'll write the diff." Save the implementation work
for when there's an actual task.`,
  },
};

// ── LLM callers (plain-text mode) ──────────────────────────────────

interface CallResult {
  text: string;
  /** Approximate USD cost of this single call. */
  cost: number;
}

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-pro"];

/**
 * Call Gemini in plain-text mode — no responseMimeType: "application/json".
 * Mirrors the model fallback chain from src/lib/gemini.ts but optimized
 * for chat (lower max tokens, no JSON parsing).
 */
async function callGeminiText(
  apiKey: string,
  systemPrompt: string,
  history: { role: "user" | "model"; text: string }[],
  imageDataUrls: string[] = [],
): Promise<CallResult> {
  let lastErr = "";
  for (const model of GEMINI_MODELS) {
    const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;
    // Inline images get attached to the LAST user turn — Gemini handles
    // multimodal via base64 data parts.
    const lastIdx = history.map((h) => h.role).lastIndexOf("user");
    const contents = history.map((h, i) => {
      const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [];
      if (i === lastIdx && imageDataUrls.length > 0) {
        for (const url of imageDataUrls) {
          const m = url.match(/^data:(image\/[^;]+);base64,(.+)$/);
          if (m) parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
        }
      }
      parts.push({ text: h.text });
      return { role: h.role, parts };
    });
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.7,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      });
      clearTimeout(timeout);
      if (resp.status === 429 || resp.status === 503) {
        lastErr = `${model}: rate-limited`;
        continue; // try next model in chain
      }
      if (!resp.ok) {
        lastErr = `${model}: HTTP ${resp.status}`;
        continue;
      }
      const data = await resp.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      let text = "";
      for (const p of parts) if (p.text && !p.thought) { text = p.text; break; }
      if (!text) for (const p of parts) if (p.text) { text = p.text; break; }
      if (text) {
        // Token-rough cost estimate: 4 chars ≈ 1 token.
        const inTokens = (systemPrompt.length + history.reduce((s, h) => s + h.text.length, 0)) / 4;
        const outTokens = text.length / 4;
        const isPro = model.includes("pro");
        const inRate = isPro ? 0.00125 : 0.000075;
        const outRate = isPro ? 0.005 : 0.0003;
        const cost = (inTokens / 1000) * inRate + (outTokens / 1000) * outRate;
        return { text, cost };
      }
    } catch (err) {
      lastErr = `${model}: ${(err as Error).message}`;
    }
  }
  throw new Error(`Gemini failed: ${lastErr}`);
}

/**
 * Call OpenAI gpt-4o-mini in plain-text chat mode.  Used for Critic
 * and Builder — they benefit from GPT's slightly different reasoning
 * style for adversarial / technical work.
 */
// Per user 2026-05-16 cost-saving directive: gpt-4o-mini is disabled
// globally.  Strategist agent calls now throw immediately so callers
// fall through to the Gemini path that lives alongside this in runAgent().
const GPT_4O_MINI_DISABLED = true;

async function callOpenAIText(
  apiKey: string,
  systemPrompt: string,
  history: { role: "user" | "model"; text: string }[],
  imageDataUrls: string[] = [],
): Promise<CallResult> {
  if (GPT_4O_MINI_DISABLED) {
    throw new Error("gpt-4o-mini disabled in cost-saving mode — falling back to Gemini");
  }
  // Build messages: system + history.  OpenAI uses "assistant" not "model".
  const lastIdx = history.map((h) => h.role).lastIndexOf("user");
  const messages: { role: "system" | "user" | "assistant"; content: unknown }[] = [
    { role: "system", content: systemPrompt },
  ];
  history.forEach((h, i) => {
    const role = h.role === "model" ? "assistant" : "user";
    if (i === lastIdx && imageDataUrls.length > 0 && h.role === "user") {
      // Multimodal payload — text + images
      const content: unknown[] = [{ type: "text", text: h.text }];
      for (const url of imageDataUrls) {
        content.push({ type: "image_url", image_url: { url } });
      }
      messages.push({ role, content });
    } else {
      messages.push({ role, content: h.text });
    }
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });
  clearTimeout(timeout);
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "unknown");
    throw new Error(`OpenAI ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content || "";
  if (!text) throw new Error("OpenAI returned empty response");
  // gpt-4o-mini: $0.00015/1k input, $0.0006/1k output
  const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0 };
  const cost =
    (usage.prompt_tokens / 1000) * 0.00015 +
    (usage.completion_tokens / 1000) * 0.0006;
  return { text, cost };
}

// ── Public entry: run an agent ─────────────────────────────────────

/**
 * Run a single agent on the conversation so far + the latest message
 * from the user (and any earlier agent replies in this turn).  Returns
 * the agent's text reply + cost.
 *
 * `history` is the full thread context (oldest first), already including
 * the user's latest message.  We translate it to the LLM's expected
 * role schema inside the call.
 */
export async function runAgent(
  agent: AgentName,
  history: ChatMessage[],
  imageDataUrls: string[] = [],
): Promise<CallResult> {
  const persona = AGENT_PERSONAS[agent];
  // Translate history: user → "user", any agent → "model" (assistant).
  // Other agents' replies are visible to this agent so it can react —
  // that's the whole point of a group chat ("the Critic just said X,
  // I disagree because...").
  const hist = history.map((m) => ({
    role: (m.author === "user" ? "user" : "model") as "user" | "model",
    text: formatMessageForContext(m),
  }));
  // If the most recent message is from the user with no agent replies
  // yet, we still need at least one user turn — append a closing nudge
  // when the last role is already "model" (rare but possible).
  if (hist.length === 0 || hist[hist.length - 1].role !== "user") {
    hist.push({ role: "user", text: `(continue, ${persona.name})` });
  }

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (agent === "researcher" || agent === "strategist") {
    if (!geminiKey) throw new Error("GEMINI_API_KEY missing — Researcher/Strategist offline");
    return callGeminiText(geminiKey, persona.system, hist, imageDataUrls);
  } else {
    if (!openaiKey) throw new Error("OPENAI_API_KEY missing — Critic/Builder offline");
    return callOpenAIText(openaiKey, persona.system, hist, imageDataUrls);
  }
}

/**
 * Format a message for inclusion in another agent's context window.
 * Prefixes agent replies with "[AgentName]:" so the responding model
 * knows who said what.  User messages are passed through plain.
 */
function formatMessageForContext(msg: ChatMessage): string {
  if (msg.author === "user") return msg.content;
  if (msg.author === "system") return `[system]: ${msg.content}`;
  const persona = AGENT_PERSONAS[msg.author as AgentName];
  return persona ? `[${persona.name}]: ${msg.content}` : msg.content;
}
