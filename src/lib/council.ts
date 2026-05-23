// ── Multi-Agent Strategist Council ─────────────────────────────────────
//
// A multi-agent "council" where several LLM agents — running on
// different models — debate the seller's next best move based on the
// real data already in the seller's DB.
//
// Why multi-model: each model has different blind spots. Gemini is
// great at structured signal extraction; GPT is sharper at strategy
// critique and synthesis. Running them as adversarial reviewers (one
// proposes, the next attacks, the third synthesizes) catches more bad
// takes than any single model.
//
// Hard rules baked into every agent prompt:
//   • Read-only DB access. No writes.
//   • No live Etsy fetching. The Scout reads the local SQLite
//     snapshot only — server-side scraping of etsy.com is forbidden
//     by the seller's KYC/TOS rules.
//   • No auto-listing. Verdicts are advisory only. The dashboard
//     never executes them automatically.
//   • Tool/code suggestions are flagged as "proposals" and queued
//     for the seller to review — they never run.
//
// Architecture:
//   1. Scout (deterministic, no LLM) — gathers signal from DB:
//      live_sales (last 24h), top tracked_listings, top scan
//      keyword results, idea funnel stats. Returns a brief.
//   2. Strategist (Gemini) — proposes 3-5 concrete next moves
//      based on the brief.
//   3. Critic (GPT) — attacks the Strategist's moves: where will
//      this lose money, where's the duplicate work, what's missing?
//   4. UX Observer (Gemini) — looks at the seller's funnel
//      (ideas → favorited → in_progress → built) and notices where
//      the tool itself is leaking time. Returns tool-level
//      suggestions ("idea engine returns notion when seller wants
//      cross-stitch — fix focus default").
//   5. Synthesizer (GPT) — merges the three takes into a final
//      action plan: { now: [...], later: [...], dont: [...] } plus
//      any tool_suggestions for the seller to triage.
//
// Each agent emits a "thinking" event when it starts and a
// completed event when it finishes (with its full text). The orchestrator
// pipes these through a callback so the SSE route can stream them to
// the dashboard live.

import { getDb } from "./db";
import { callGeminiJSON, parseGeminiJSON } from "./gemini";
import { callOpenAIJSON } from "./openai";

// ── Public types ──────────────────────────────────────────────────────

export type AgentName =
  // Debate mode (advisory council)
  | "scout"
  | "strategist"
  | "critic"
  | "ux_observer"
  | "synthesizer"
  // Build mode (production crew that produces ready-to-list packets)
  | "researcher"
  | "listing_writer"
  | "pricer"
  | "qa";

export type AgentPhase = "thinking" | "speaking" | "done" | "error";

/** "debate" = advisory council (default, backward compatible).
 *  "build"  = production crew that emits ready-to-list packets. */
export type CouncilMode = "debate" | "build";

export interface CouncilEvent {
  /** Stable ordering key — monotonic per-run */
  seq: number;
  /** Seconds since run start */
  t: number;
  agent: AgentName | "orchestrator";
  phase: AgentPhase | "started" | "finished";
  /** Human-readable line for the UI */
  message: string;
  /** Optional structured payload (the agent's full output) */
  data?: unknown;
}

/** Tool-suggestion entries on the verdict. The Synthesizer prompt asks
 *  the LLM to "pull the UX suggestions through verbatim if severity
 *  medium+", and the UX observer emits objects shaped
 *  {title, rationale, severity}. Half the time the LLM preserves that
 *  shape, half the time it flattens to a one-line string. The verdict
 *  must accept both — clients (the strategist page) handle either at
 *  render time. Forcing string-only was the source of the runtime crash
 *  "Objects are not valid as a React child". */
export type ToolSuggestion =
  | string
  | { title: string; rationale?: string; severity?: string };

export interface CouncilVerdict {
  now: string[];
  later: string[];
  dont: string[];
  tool_suggestions: ToolSuggestion[];
  one_liner: string;
}

/** A single ready-to-list packet produced by Build mode. Each packet
 *  has every field a seller needs to drop into the Cross-Stitch Studio:
 *  Etsy-shaped title (≤140 chars), 3-paragraph description, 13 tags
 *  (≤20 chars each), suggested price, and the signal it was based on. */
export interface BuildPacket {
  index: number;                     // 1, 2, 3 …
  niche: string;                     // e.g. "cross-stitch"
  product_type: string;              // e.g. "PDF pattern"
  subject: string;                   // e.g. "cute halloween cats"
  angle: string;                     // why this packet beats the competition
  title: string;                     // ≤140 chars, Etsy-optimised
  description: string;               // 3 paragraphs
  tags: string[];                    // exactly 13 entries, each ≤20 chars
  keywords: string[];                // 5–8 long-tail keywords for SEO
  price: number;                     // suggested USD price
  pricing_rationale: string;         // why this price (referencing market)
  target_buyer: string;              // who buys this (1 sentence)
  why_now: string;                   // why this listing right now
  signal: {
    based_on_listings: string[];     // titles of inspirations from DB
    avg_competitor_price: number;
    competition_level: string | null;
    demand_score: number;
  };
  qa: {
    passes: boolean;
    issues: string[];                // any QA flags
  };
}

export interface BuildResult {
  packets: BuildPacket[];
  /** Tool-level friction the build crew encountered while working —
   *  surfaced for the seller to triage. Same shape as the debate
   *  council's tool_suggestions. Never auto-applied. */
  tool_friction: { title: string; rationale: string; severity: "low" | "medium" | "high" }[];
  one_liner: string;
}

export interface CouncilRunResult {
  runId: number;
  mode: CouncilMode;
  focus: string;
  topic: string;
  events: CouncilEvent[];
  /** Set when mode === "debate". */
  verdict: CouncilVerdict | null;
  /** Set when mode === "build". */
  build: BuildResult | null;
  status: "completed" | "failed";
  error?: string;
}

export interface CouncilOptions {
  /** "debate" (default) or "build". Build mode produces ready-to-list packets. */
  mode?: CouncilMode;
  focus?: string;        // "cross-stitch" | "wall-art" | "notion" | "all"
  topic?: string;        // free-form question, e.g. "what should I list this week?"
  /** Build mode: how many packets to produce. Default 3, clamped 1–6. */
  count?: number;
  geminiKey: string;
  openaiKey?: string;    // optional — falls back to Gemini for every step if missing
  onEvent?: (ev: CouncilEvent) => void;
}

// ── Scout (deterministic — pulls real signal from DB) ─────────────────

interface SignalBrief {
  liveSales24h: number;
  recentSales: { title: string; shop: string | null; price: number; niche: string | null; sold_delta: number; detected_at: string }[];
  topTracked: { title: string; favorites: number; sales_estimate: number; price: number; tags: string[] }[];
  topCategories: { keyword: string; demand_score: number; competition_level: string | null; avg_price: number }[];
  ideaFunnel: { status: string; count: number }[];
  recentIdeas: { id: number; title: string; status: string; demand: number; competition: number }[];
}

function gatherSignal(focusTokens: string[]): SignalBrief {
  const db = getDb();

  // Build LIKE-OR clause for focus tokens (mirrors generate route's
  // approach but inlined here so council.ts has zero coupling to the
  // ideas route).
  const like = (cols: string[]): { clause: string; params: string[] } => {
    if (focusTokens.length === 0) return { clause: "", params: [] };
    const parts: string[] = [];
    const params: string[] = [];
    for (const c of cols) {
      for (const t of focusTokens) {
        parts.push(`LOWER(COALESCE(${c}, '')) LIKE ?`);
        params.push(`%${t}%`);
      }
    }
    return { clause: `(${parts.join(" OR ")})`, params };
  };

  const sales24Filter = like(["title", "niche", "category"]);
  const liveSalesRows = db
    .prepare(
      `SELECT title, shop_name, price, niche, sold_delta, detected_at
       FROM live_sales
       WHERE detected_at >= datetime('now', '-24 hours')${sales24Filter.clause ? ` AND ${sales24Filter.clause}` : ""}
       ORDER BY detected_at DESC
       LIMIT 15`,
    )
    .all(...sales24Filter.params) as Array<{
      title: string; shop_name: string | null; price: number; niche: string | null; sold_delta: number; detected_at: string
    }>;

  const liveSales24hCount = (db
    .prepare(
      `SELECT COUNT(*) AS c FROM live_sales WHERE detected_at >= datetime('now', '-24 hours')${sales24Filter.clause ? ` AND ${sales24Filter.clause}` : ""}`,
    )
    .get(...sales24Filter.params) as { c: number } | undefined)?.c ?? 0;

  const trackedFilter = like(["title", "category", "tags"]);
  const trackedRows = db
    .prepare(
      `SELECT title, favorites, sales_estimate, price, tags
       FROM tracked_listings
       WHERE (sales_estimate > 0 OR favorites > 50)${trackedFilter.clause ? ` AND ${trackedFilter.clause}` : ""}
       ORDER BY sales_estimate DESC, favorites DESC
       LIMIT 10`,
    )
    .all(...trackedFilter.params) as Array<{
      title: string; favorites: number; sales_estimate: number; price: number; tags: string | null
    }>;

  const catFilter = like(["keyword", "top_tags"]);
  const categoryRows = db
    .prepare(
      `SELECT keyword, demand_score, competition_level, avg_price
       FROM scan_keyword_results
       WHERE demand_score IS NOT NULL${catFilter.clause ? ` AND ${catFilter.clause}` : ""}
       ORDER BY demand_score DESC
       LIMIT 8`,
    )
    .all(...catFilter.params) as Array<{
      keyword: string; demand_score: number; competition_level: string | null; avg_price: number
    }>;

  const ideaFunnelRows = db
    .prepare(
      `SELECT status, COUNT(*) AS count FROM product_ideas GROUP BY status`,
    )
    .all() as Array<{ status: string; count: number }>;

  const recentIdeasRows = db
    .prepare(
      `SELECT id, title, status, demand_score AS demand, competition_score AS competition
       FROM product_ideas
       ORDER BY generated_at DESC
       LIMIT 10`,
    )
    .all() as Array<{ id: number; title: string; status: string; demand: number; competition: number }>;

  const parseTags = (raw: string | null): string[] => {
    if (!raw) return [];
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) return j.map(String).slice(0, 6);
    } catch { /* fall through */ }
    return raw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean).slice(0, 6);
  };

  return {
    liveSales24h: liveSales24hCount,
    recentSales: liveSalesRows.map((r) => ({
      title: r.title,
      shop: r.shop_name,
      price: r.price,
      niche: r.niche,
      sold_delta: r.sold_delta,
      detected_at: r.detected_at,
    })),
    topTracked: trackedRows.map((r) => ({
      title: r.title,
      favorites: r.favorites,
      sales_estimate: r.sales_estimate,
      price: r.price,
      tags: parseTags(r.tags),
    })),
    topCategories: categoryRows.map((r) => ({
      keyword: r.keyword,
      demand_score: r.demand_score,
      competition_level: r.competition_level,
      avg_price: r.avg_price,
    })),
    ideaFunnel: ideaFunnelRows,
    recentIdeas: recentIdeasRows,
  };
}

function summarizeSignalForLLM(brief: SignalBrief): string {
  const sales = brief.recentSales.length === 0
    ? "(no live sales in last 24h)"
    : brief.recentSales
        .map((s, i) => `${i + 1}. "${s.title}" — ${s.shop || "?"} — $${s.price} — ${s.niche || "—"} — +${s.sold_delta} sold @ ${s.detected_at}`)
        .join("\n");

  const tracked = brief.topTracked.length === 0
    ? "(no tracked listings yet)"
    : brief.topTracked
        .map((s, i) => `${i + 1}. "${s.title}" — ${s.favorites} favs — ~${s.sales_estimate} sales — $${s.price} — tags: [${s.tags.join(", ")}]`)
        .join("\n");

  const cats = brief.topCategories.length === 0
    ? "(no scan data yet)"
    : brief.topCategories
        .map((c, i) => `${i + 1}. "${c.keyword}" — demand ${c.demand_score}/100 — competition ${c.competition_level || "?"} — avg $${Math.round(c.avg_price)}`)
        .join("\n");

  const funnel = brief.ideaFunnel.length === 0
    ? "(no ideas in funnel)"
    : brief.ideaFunnel.map((f) => `${f.status}: ${f.count}`).join(" / ");

  const recent = brief.recentIdeas.length === 0
    ? "(none)"
    : brief.recentIdeas
        .map((r) => `[${r.id}] "${r.title}" — ${r.status} — demand ${r.demand} comp ${r.competition}`)
        .join("\n");

  return [
    `LIVE SALES (last 24h, ${brief.liveSales24h} total):`,
    sales,
    "",
    "TOP TRACKED LISTINGS (sustained sellers):",
    tracked,
    "",
    "TOP CATEGORIES BY DEMAND:",
    cats,
    "",
    `IDEA FUNNEL: ${funnel}`,
    "",
    "RECENT IDEAS:",
    recent,
  ].join("\n");
}

// ── Hard rules block injected into every LLM agent prompt ────────────

const HARD_RULES = `HARD RULES:
- You are an advisor, not an operator. Nothing you suggest is auto-executed.
- Never suggest scraping etsy.com server-side or spoofing browser headers — only the official Etsy v3 API and the seller's own Chrome extension while they browse are allowed paths to Etsy data.
- Never propose listing on Etsy without seller review.
- The seller's signal data was gathered legitimately. Trust it. Don't propose new scraping.`;

// ── Strategist (Gemini) ─────────────────────────────────────────────

interface StrategistOutput {
  takeaway: string;            // 1-line read on the data
  moves: { title: string; why: string; effort: "low" | "medium" | "high"; priority: 1 | 2 | 3 }[];
}

async function runStrategist(
  geminiKey: string,
  focusLabel: string,
  topic: string,
  signalText: string,
): Promise<StrategistOutput> {
  const prompt = `You are the STRATEGIST agent on a council reviewing a digital-product seller's next move.
Focus: ${focusLabel || "any niche"}.
Seller asked: ${topic || "what should I do this week?"}

${HARD_RULES}

SIGNAL DATA (read-only snapshot from the seller's DB):
${signalText}

Your job: propose 3-5 concrete next moves the seller should consider. Each move must be grounded in a specific signal above (name a listing or category). Stay terse — this is a debate, not a report. Return JSON only:
{
  "takeaway": "one sentence — what the data is screaming",
  "moves": [
    { "title": "string, max 80 chars, action-oriented", "why": "1-2 sentences citing a specific row above", "effort": "low|medium|high", "priority": 1 | 2 | 3 }
  ]
}`;
  const raw = await callGeminiJSON(geminiKey, prompt);
  return parseGeminiJSON<StrategistOutput>(raw);
}

// ── Critic (GPT) ─────────────────────────────────────────────────────

interface CriticOutput {
  attacks: { move_title: string; weakness: string; severity: "low" | "medium" | "high" }[];
  missing_angles: string[];
}

async function runCritic(
  openaiKey: string | undefined,
  geminiKey: string,
  focusLabel: string,
  signalText: string,
  strategist: StrategistOutput,
): Promise<CriticOutput> {
  const prompt = `You are the CRITIC agent on the council. Your job is to attack the Strategist's proposals — find where each one will lose money, where it duplicates work, where the data doesn't actually support it.
Focus: ${focusLabel || "any niche"}.

${HARD_RULES}

SIGNAL DATA:
${signalText}

STRATEGIST'S TAKE:
${JSON.stringify(strategist, null, 2)}

For each move, find at least one concrete weakness (or say "none — solid" if you genuinely can't). Then list angles the Strategist missed. Return JSON only:
{
  "attacks": [
    { "move_title": "string — must match a strategist move title verbatim", "weakness": "1-2 sentences", "severity": "low|medium|high" }
  ],
  "missing_angles": ["1-2 short bullet phrases"]
}`;

  // Prefer GPT for criticism — it's sharper at finding holes than Gemini.
  // Fall back to Gemini if no OpenAI key.
  if (openaiKey) {
    try {
      const raw = await callOpenAIJSON(openaiKey, prompt, "You are a sharp, terse critic. Return only valid JSON.");
      return JSON.parse(raw) as CriticOutput;
    } catch (err) {
      console.warn("[Council] Critic GPT failed, falling back to Gemini:", (err as Error).message);
    }
  }
  const raw = await callGeminiJSON(geminiKey, prompt);
  return parseGeminiJSON<CriticOutput>(raw);
}

// ── UX Observer (Gemini) ─────────────────────────────────────────────

interface UXObserverOutput {
  funnel_read: string;
  tool_suggestions: { title: string; rationale: string; severity: "low" | "medium" | "high" }[];
}

async function runUXObserver(
  geminiKey: string,
  focusLabel: string,
  signalText: string,
  brief: SignalBrief,
): Promise<UXObserverOutput> {
  const funnelLine = brief.ideaFunnel.map((f) => `${f.status}=${f.count}`).join(", ") || "empty";
  const dismissedShare = (() => {
    const total = brief.ideaFunnel.reduce((acc, r) => acc + r.count, 0);
    if (!total) return 0;
    const d = brief.ideaFunnel.find((r) => r.status === "dismissed")?.count ?? 0;
    return Math.round((d / total) * 100);
  })();

  const prompt = `You are the UX OBSERVER agent. Your job is to look at the seller's funnel and spot where the tool itself is wasting their time.
Focus: ${focusLabel || "any niche"}.
Funnel snapshot: ${funnelLine}. Dismissed share: ${dismissedShare}%.

${HARD_RULES}

SIGNAL DATA (for reference):
${signalText}

Look for patterns:
- High dismissed share → ideas don't match seller intent (wrong focus, too vague, off-niche).
- Many "new" stuck → seller never gets to triage (UI friction).
- "in_progress" >> "built" → seller starts but doesn't finish (build pipeline too slow).
- Repeat near-duplicate ideas → idea engine lacks dedup memory.

Return JSON only:
{
  "funnel_read": "one sentence on what the funnel says",
  "tool_suggestions": [
    { "title": "short imperative — e.g. 'Add dedup check to idea engine'", "rationale": "1-2 sentences", "severity": "low|medium|high" }
  ]
}
Suggest 2-4 items max. These will be queued as advisory tickets — the seller decides what to act on.`;
  const raw = await callGeminiJSON(geminiKey, prompt);
  return parseGeminiJSON<UXObserverOutput>(raw);
}

// ── Synthesizer (GPT) ────────────────────────────────────────────────

async function runSynthesizer(
  openaiKey: string | undefined,
  geminiKey: string,
  focusLabel: string,
  topic: string,
  strategist: StrategistOutput,
  critic: CriticOutput,
  ux: UXObserverOutput,
): Promise<CouncilVerdict> {
  const prompt = `You are the SYNTHESIZER agent. Your council just produced three takes. Merge them into one tight action plan the seller will actually use.
Focus: ${focusLabel || "any niche"}.
Seller's question: ${topic || "what's next?"}

${HARD_RULES}

STRATEGIST:
${JSON.stringify(strategist, null, 2)}

CRITIC:
${JSON.stringify(critic, null, 2)}

UX OBSERVER:
${JSON.stringify(ux, null, 2)}

Decide which moves survive the critic, which are weakened-but-still-good (move to "later"), and which to drop ("dont"). Pull the UX suggestions through verbatim if they're severity medium+.

Return JSON only:
{
  "now": ["3-5 short imperatives — what the seller does THIS WEEK"],
  "later": ["1-3 imperatives — backlog candidates"],
  "dont": ["1-3 short reasons something on the strategist list got cut"],
  "tool_suggestions": ["pulled-through tool-level suggestions, may be empty"],
  "one_liner": "one sentence the seller can read in 3 seconds and know what to do next"
}`;

  if (openaiKey) {
    try {
      const raw = await callOpenAIJSON(openaiKey, prompt, "You are a decisive synthesizer. Return only valid JSON.");
      return JSON.parse(raw) as CouncilVerdict;
    } catch (err) {
      console.warn("[Council] Synthesizer GPT failed, falling back to Gemini:", (err as Error).message);
    }
  }
  const raw = await callGeminiJSON(geminiKey, prompt);
  return parseGeminiJSON<CouncilVerdict>(raw);
}

// ── Focus presets (mirrors /api/research/ideas/generate) ─────────────

const FOCUS_TOKENS: Record<string, { label: string; tokens: string[] }> = {
  "cross-stitch": {
    label: "cross-stitch patterns",
    tokens: ["cross stitch", "cross-stitch", "xstitch", "needlepoint", "embroidery pattern"],
  },
  "wall-art": {
    label: "digital wall art",
    tokens: ["wall art", "printable art", "art print", "wall print", "poster"],
  },
  notion: {
    label: "Notion templates",
    tokens: ["notion template", "notion planner", "notion dashboard"],
  },
  all: { label: "any niche", tokens: [] },
};

// ── Build mode: Listing Writer (GPT preferred, Gemini fallback) ──────

interface ListingDraft {
  subject: string;
  angle: string;
  title: string;
  description: string;
  tags: string[];
  keywords: string[];
  target_buyer: string;
  why_now: string;
}

async function runListingWriter(
  openaiKey: string | undefined,
  geminiKey: string,
  focusLabel: string,
  productType: string,
  candidate: { subject: string; angle: string; based_on: string[]; avg_price: number; demand_score: number; competition_level: string | null },
): Promise<ListingDraft> {
  const prompt = `You are the LISTING WRITER agent on a production crew. Your one job: produce a complete, ready-to-publish Etsy listing for ONE product. The seller will paste this verbatim into their listing studio — so every field must be polished and rule-compliant.

Niche: ${focusLabel}
Product type: ${productType}
Subject: ${candidate.subject}
Angle (your differentiation): ${candidate.angle}
Based on these top sellers (do NOT copy them — they are inspiration only): ${candidate.based_on.slice(0, 5).join(" / ") || "(none)"}
Market avg price: $${candidate.avg_price.toFixed(2)} · Demand: ${candidate.demand_score}/100 · Competition: ${candidate.competition_level ?? "?"}.

${HARD_RULES}

OUTPUT RULES (Etsy):
- title: ≤140 chars total, front-load primary keywords, include the subject + product type + a key descriptor + "digital download" where applicable. Use Title Case. No stuffing.
- description: exactly 3 paragraphs separated by blank lines. P1 = hook + what the buyer gets. P2 = sizes/quality/format details (e.g. "PDF, A4 + Letter, 14ct + 16ct + 18ct charts"). P3 = instant-download note + a tasteful CTA.
- tags: EXACTLY 13 entries, each ≤20 characters (count incl. spaces). Mix high-volume + long-tail. No duplicates. No competitor brand names.
- keywords: 5–8 long-tail SEO phrases (3–6 words each) for the seller to track.
- target_buyer: 1 sentence on who buys this.
- why_now: 1 sentence on why this listing right now (cite the demand/seasonality).
- subject + angle: echo what was given so the seller can sanity-check.

Return JSON only (no prose, no markdown fences):
{
  "subject": "string",
  "angle": "string",
  "title": "string ≤140 chars",
  "description": "string with two \\n\\n separators",
  "tags": ["13 entries"],
  "keywords": ["5-8 entries"],
  "target_buyer": "string",
  "why_now": "string"
}`;

  if (openaiKey) {
    try {
      const raw = await callOpenAIJSON(openaiKey, prompt, "You are a precise Etsy listing copywriter. Return only valid JSON conforming to the schema.");
      return JSON.parse(raw) as ListingDraft;
    } catch (err) {
      console.warn("[Council] Listing Writer GPT failed, falling back to Gemini:", (err as Error).message);
    }
  }
  const raw = await callGeminiJSON(geminiKey, prompt);
  return parseGeminiJSON<ListingDraft>(raw);
}

// ── Build mode: Researcher (Gemini, picks subjects + angles) ─────────

interface ResearcherCandidate {
  subject: string;
  angle: string;
  based_on_listings: string[];
  avg_competitor_price: number;
  competition_level: string | null;
  demand_score: number;
  product_type: string;
}

interface ResearcherOutput {
  candidates: ResearcherCandidate[];
}

async function runResearcher(
  geminiKey: string,
  focusLabel: string,
  topic: string,
  signalText: string,
  count: number,
): Promise<ResearcherOutput> {
  const prompt = `You are the RESEARCHER agent on a production crew. The seller wants ${count} concrete, differentiated product packets for the niche "${focusLabel}" — not strategy advice. Your job: pick ${count} specific subjects that should ship next, each with a clear angle that beats the competition.

Seller's brief: ${topic}

${HARD_RULES}

SIGNAL DATA (from the seller's local DB):
${signalText}

Rules:
- Each subject must be specific enough to draw/design (e.g. "minimalist black cat in moonlight" — not "cute animals").
- Each subject must have an angle that differentiates it from the listings above (different style, different audience, missing combo). Reference at least one specific row.
- Spread the ${count} packets across different audiences/styles so they don't cannibalize each other.
- Include a realistic price + a competition_level + a demand_score for each, drawn from the signal above. If the signal is sparse, pick conservative values and note "low data".
- product_type must match the niche (e.g. "PDF cross-stitch pattern", "printable wall art", "Notion template").

Return JSON only:
{
  "candidates": [
    {
      "subject": "specific drawable subject",
      "angle": "1-2 sentences citing a row from signal data and explaining the differentiation",
      "based_on_listings": ["title 1", "title 2"],
      "avg_competitor_price": number,
      "competition_level": "low|medium|high|very high|null",
      "demand_score": number 0-100,
      "product_type": "string"
    }
  ]
}
Produce exactly ${count} candidates.`;
  const raw = await callGeminiJSON(geminiKey, prompt);
  return parseGeminiJSON<ResearcherOutput>(raw);
}

// ── Build mode: Pricer (deterministic) ───────────────────────────────

function calculateSmartPrice(avgPrice: number, competition: string | null, demandScore: number): { price: number; rationale: string } {
  // Anchor: market average. If we have no signal, fall back to $4.99 — Etsy
  // digital-art sweet spot most newcomers hit.
  let base = avgPrice && avgPrice > 0.5 ? avgPrice : 4.99;
  const reasons: string[] = [`anchored to market avg $${base.toFixed(2)}`];

  // Comp adjustment — undercut in crowded niches, charge premium in low-comp.
  const comp = (competition ?? "").toLowerCase();
  if (comp === "very high") {
    base *= 0.88;
    reasons.push("−12% (very high competition → undercut)");
  } else if (comp === "high") {
    base *= 0.95;
    reasons.push("−5% (high competition)");
  } else if (comp === "low") {
    base *= 1.15;
    reasons.push("+15% (low competition → premium)");
  }

  // Demand adjustment — high demand can absorb a small premium.
  if (demandScore >= 70) {
    base *= 1.08;
    reasons.push(`+8% (demand ${demandScore}/100)`);
  } else if (demandScore <= 30) {
    base *= 0.92;
    reasons.push(`−8% (demand ${demandScore}/100)`);
  }

  // New-listing slight discount so first reviews come faster.
  base *= 0.97;
  reasons.push("−3% new-listing discount");

  // Clamp to a reasonable digital-product range.
  let price = Math.max(2.99, Math.min(14.99, Math.round(base * 100) / 100));
  // Etsy psych pricing — round to a "9" ending where close.
  const cents = Math.round((price - Math.floor(price)) * 100);
  if (cents > 50 && cents < 95) price = Math.floor(price) + 0.99;
  else if (cents <= 50 && cents > 5) price = Math.floor(price) + 0.49;

  return { price, rationale: reasons.join("; ") };
}

// ── Build mode: QA (GPT preferred, Gemini fallback) ──────────────────

interface QAOutput {
  packets_review: { index: number; passes: boolean; issues: string[] }[];
  tool_friction: { title: string; rationale: string; severity: "low" | "medium" | "high" }[];
  one_liner: string;
}

async function runQA(
  openaiKey: string | undefined,
  geminiKey: string,
  focusLabel: string,
  drafts: { index: number; title: string; description: string; tags: string[]; price: number; subject: string }[],
): Promise<QAOutput> {
  const prompt = `You are the QA agent on a production crew. Review the listing packets below for Etsy compliance + quality. Also: as you work, note any friction in the tool itself (data gaps, missing presets, repetitive copy patterns) so the seller can triage tool fixes.

Niche: ${focusLabel}.

${HARD_RULES}

PACKETS:
${JSON.stringify(drafts, null, 2)}

For each packet, check:
- title length ≤140 chars (count it).
- exactly 13 tags, each ≤20 chars, no duplicates.
- description has 3 paragraphs separated by blank lines.
- price is in the $2.99–$14.99 range.
- title front-loads keywords and isn't keyword-stuffed.
- subject + title + tags are coherent.

Return JSON only:
{
  "packets_review": [
    { "index": 1, "passes": true|false, "issues": ["short bullets if any, otherwise empty array"] }
  ],
  "tool_friction": [
    { "title": "short imperative", "rationale": "1-2 sentences on what the tool should add", "severity": "low|medium|high" }
  ],
  "one_liner": "one sentence the seller reads in 3s — what they got and what to do next"
}`;

  if (openaiKey) {
    try {
      const raw = await callOpenAIJSON(openaiKey, prompt, "You are a sharp QA reviewer. Return only valid JSON.");
      return JSON.parse(raw) as QAOutput;
    } catch (err) {
      console.warn("[Council] QA GPT failed, falling back to Gemini:", (err as Error).message);
    }
  }
  const raw = await callGeminiJSON(geminiKey, prompt);
  return parseGeminiJSON<QAOutput>(raw);
}

// ── Orchestrator ─────────────────────────────────────────────────────

export async function runCouncil(opts: CouncilOptions): Promise<CouncilRunResult> {
  const { geminiKey, openaiKey, onEvent } = opts;
  const mode: CouncilMode = opts.mode === "build" ? "build" : "debate";
  const focusKey = (opts.focus ?? "all").toLowerCase();
  const focus = FOCUS_TOKENS[focusKey] ?? FOCUS_TOKENS.all;
  const topic = opts.topic?.trim() || (mode === "build"
    ? "produce 3 ready-to-list packets"
    : "what should I list this week?");
  const count = Math.max(1, Math.min(6, opts.count ?? 3));

  const events: CouncilEvent[] = [];
  let seq = 0;
  const startedAt = Date.now();

  const emit = (ev: Omit<CouncilEvent, "seq" | "t">) => {
    const full: CouncilEvent = {
      ...ev,
      seq: seq++,
      t: Math.round((Date.now() - startedAt) / 100) / 10,
    };
    events.push(full);
    onEvent?.(full);
  };

  // Persist run row up-front so the dashboard can link to it before
  // synthesis finishes.
  const db = getDb();
  const ins = db.prepare(
    `INSERT INTO strategist_runs (mode, focus, topic, status, agents_log)
     VALUES (?, ?, ?, 'running', '[]')`,
  ).run(mode, focusKey, topic);
  const runId = Number(ins.lastInsertRowid);

  emit({
    agent: "orchestrator",
    phase: "started",
    message: mode === "build"
      ? `Build crew convened — focus: ${focus.label}, target: ${count} ready-to-list packets.`
      : `Council convened — focus: ${focus.label}, topic: "${topic}"`,
  });

  let verdict: CouncilVerdict | null = null;
  let buildResult: BuildResult | null = null;
  let status: "completed" | "failed" = "completed";
  let errorMessage: string | undefined;

  try {
    if (mode === "build") {
      buildResult = await runBuildPipeline({
        emit,
        geminiKey,
        openaiKey,
        focus,
        topic,
        count,
      });
    } else {
      verdict = await runDebatePipeline({
        emit,
        geminiKey,
        openaiKey,
        focus,
        topic,
      });
    }

    emit({
      agent: "orchestrator",
      phase: "finished",
      message: mode === "build"
        ? `Build crew complete in ${Math.round((Date.now() - startedAt) / 100) / 10}s — ${buildResult?.packets.length ?? 0} packet(s) ready for your review.`
        : `Council complete in ${Math.round((Date.now() - startedAt) / 100) / 10}s.`,
    });
  } catch (err) {
    status = "failed";
    errorMessage = err instanceof Error ? err.message : "Unknown council failure";
    emit({ agent: "orchestrator", phase: "error", message: `${mode === "build" ? "Build" : "Council"} failed: ${errorMessage}` });
  }

  // Persist final state. Verdict slot holds whichever output the run
  // produced — debate writes CouncilVerdict, build writes BuildResult.
  // The page distinguishes via the `mode` column.
  try {
    const finalPayload = mode === "build"
      ? (buildResult ? JSON.stringify(buildResult) : null)
      : (verdict ? JSON.stringify(verdict) : null);
    db.prepare(
      `UPDATE strategist_runs
         SET status = ?, agents_log = ?, verdict = ?, error_message = ?, finished_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(
      status,
      JSON.stringify(events),
      finalPayload,
      errorMessage ?? null,
      runId,
    );
    db.pragma("wal_checkpoint(TRUNCATE)");
  } catch (e) {
    console.warn("[Council] Failed to persist run", e);
  }

  return {
    runId,
    mode,
    focus: focusKey,
    topic,
    events,
    verdict,
    build: buildResult,
    status,
    error: errorMessage,
  };
}

// ── Debate pipeline (extracted from old runCouncil body) ─────────────

interface PipelineCtx {
  emit: (ev: Omit<CouncilEvent, "seq" | "t">) => void;
  geminiKey: string;
  openaiKey?: string;
  focus: { label: string; tokens: string[] };
  topic: string;
}

async function runDebatePipeline(ctx: PipelineCtx): Promise<CouncilVerdict> {
  const { emit, geminiKey, openaiKey, focus, topic } = ctx;

  // 1. Scout — gather signal (deterministic, no LLM)
  emit({ agent: "scout", phase: "thinking", message: "Reading live_sales, tracked_listings, scan_keyword_results, product_ideas funnel…" });
  const brief = gatherSignal(focus.tokens);
  const signalText = summarizeSignalForLLM(brief);
  emit({
    agent: "scout",
    phase: "done",
    message: `Pulled ${brief.recentSales.length} recent sales, ${brief.topTracked.length} tracked sellers, ${brief.topCategories.length} hot categories, ${brief.recentIdeas.length} recent ideas (funnel: ${brief.ideaFunnel.map((r) => `${r.status}=${r.count}`).join(", ") || "empty"}).`,
    data: brief,
  });

  // 2. Strategist (Gemini)
  emit({ agent: "strategist", phase: "thinking", message: "Drafting moves on Gemini 2.5 flash…" });
  const strat = await runStrategist(geminiKey, focus.label, topic, signalText);
  emit({ agent: "strategist", phase: "speaking", message: `Takeaway: ${strat.takeaway}` });
  for (const m of strat.moves || []) {
    emit({
      agent: "strategist",
      phase: "speaking",
      message: `Move (P${m.priority}, ${m.effort}): ${m.title} — ${m.why}`,
    });
  }
  emit({ agent: "strategist", phase: "done", message: `Proposed ${strat.moves?.length ?? 0} moves.`, data: strat });

  // 3. Critic
  emit({ agent: "critic", phase: "thinking", message: openaiKey ? "Attacking proposals on GPT…" : "Attacking proposals on Gemini (no OpenAI key)…" });
  const crit = await runCritic(openaiKey, geminiKey, focus.label, signalText, strat);
  for (const a of crit.attacks || []) {
    emit({
      agent: "critic",
      phase: "speaking",
      message: `[${a.severity}] "${a.move_title}" — ${a.weakness}`,
    });
  }
  for (const m of crit.missing_angles || []) {
    emit({ agent: "critic", phase: "speaking", message: `Missing angle: ${m}` });
  }
  emit({ agent: "critic", phase: "done", message: `${crit.attacks?.length ?? 0} attacks, ${crit.missing_angles?.length ?? 0} missing angles.`, data: crit });

  // 4. UX Observer
  emit({ agent: "ux_observer", phase: "thinking", message: "Reading the seller's idea funnel for tool-level friction…" });
  const ux = await runUXObserver(geminiKey, focus.label, signalText, brief);
  emit({ agent: "ux_observer", phase: "speaking", message: `Funnel read: ${ux.funnel_read}` });
  for (const s of ux.tool_suggestions || []) {
    emit({
      agent: "ux_observer",
      phase: "speaking",
      message: `Tool suggestion [${s.severity}]: ${s.title} — ${s.rationale}`,
    });
  }
  emit({ agent: "ux_observer", phase: "done", message: `${ux.tool_suggestions?.length ?? 0} tool suggestions.`, data: ux });

  // 5. Synthesizer
  emit({ agent: "synthesizer", phase: "thinking", message: openaiKey ? "Merging takes into final plan on GPT…" : "Merging takes into final plan on Gemini (no OpenAI key)…" });
  const verdict = await runSynthesizer(openaiKey, geminiKey, focus.label, topic, strat, crit, ux);
  emit({ agent: "synthesizer", phase: "speaking", message: verdict.one_liner });
  for (const item of verdict.now || []) emit({ agent: "synthesizer", phase: "speaking", message: `NOW: ${item}` });
  for (const item of verdict.later || []) emit({ agent: "synthesizer", phase: "speaking", message: `LATER: ${item}` });
  for (const item of verdict.dont || []) emit({ agent: "synthesizer", phase: "speaking", message: `DON'T: ${item}` });
  emit({ agent: "synthesizer", phase: "done", message: "Verdict assembled.", data: verdict });

  return verdict;
}

// ── Build pipeline (production crew) ──────────────────────────────────

async function runBuildPipeline(ctx: PipelineCtx & { count: number }): Promise<BuildResult> {
  const { emit, geminiKey, openaiKey, focus, topic, count } = ctx;

  // 1. Researcher: signal scan + LLM picks N candidates with angles.
  emit({ agent: "researcher", phase: "thinking", message: `Scanning your DB for top sellers in ${focus.label}…` });
  const brief = gatherSignal(focus.tokens);
  const signalText = summarizeSignalForLLM(brief);
  emit({
    agent: "researcher",
    phase: "speaking",
    message: `Found ${brief.recentSales.length} recent sales, ${brief.topTracked.length} sustained sellers, ${brief.topCategories.length} hot categories. Picking ${count} packet candidates…`,
  });
  const research = await runResearcher(geminiKey, focus.label, topic, signalText, count);
  for (const c of research.candidates) {
    emit({
      agent: "researcher",
      phase: "speaking",
      message: `Candidate: "${c.subject}" — ${c.angle}`,
    });
  }
  emit({ agent: "researcher", phase: "done", message: `${research.candidates.length} candidate(s) locked in.`, data: { brief, research } });

  // 2. Listing Writer: produce a full listing per candidate.
  const drafts: BuildPacket[] = [];
  for (let i = 0; i < research.candidates.length; i++) {
    const c = research.candidates[i];
    emit({
      agent: "listing_writer",
      phase: "thinking",
      message: `Writing packet ${i + 1}/${research.candidates.length}: "${c.subject}"…`,
    });
    const draft = await runListingWriter(openaiKey, geminiKey, focus.label, c.product_type, {
      subject: c.subject,
      angle: c.angle,
      based_on: c.based_on_listings,
      avg_price: c.avg_competitor_price,
      demand_score: c.demand_score,
      competition_level: c.competition_level,
    });

    // 3. Pricer: deterministic per-packet price.
    const pricing = calculateSmartPrice(c.avg_competitor_price, c.competition_level, c.demand_score);

    const packet: BuildPacket = {
      index: i + 1,
      niche: focus.label,
      product_type: c.product_type,
      subject: draft.subject || c.subject,
      angle: draft.angle || c.angle,
      title: draft.title,
      description: draft.description,
      tags: Array.isArray(draft.tags) ? draft.tags.slice(0, 13) : [],
      keywords: Array.isArray(draft.keywords) ? draft.keywords : [],
      price: pricing.price,
      pricing_rationale: pricing.rationale,
      target_buyer: draft.target_buyer || "",
      why_now: draft.why_now || "",
      signal: {
        based_on_listings: c.based_on_listings,
        avg_competitor_price: c.avg_competitor_price,
        competition_level: c.competition_level,
        demand_score: c.demand_score,
      },
      qa: { passes: true, issues: [] }, // QA agent fills this in step 4
    };
    drafts.push(packet);

    emit({
      agent: "listing_writer",
      phase: "speaking",
      message: `Packet ${i + 1} draft: "${packet.title}" — ${packet.tags.length} tags @ $${packet.price}.`,
    });
  }
  emit({ agent: "listing_writer", phase: "done", message: `${drafts.length} packet draft(s) written.`, data: drafts });

  // 3.5 Pricer announces the pricing strategy as a separate agent voice.
  emit({ agent: "pricer", phase: "thinking", message: "Calculating smart prices from competitor data…" });
  for (const p of drafts) {
    emit({
      agent: "pricer",
      phase: "speaking",
      message: `Packet ${p.index}: $${p.price} — ${p.pricing_rationale}`,
    });
  }
  emit({ agent: "pricer", phase: "done", message: "Pricing locked.", data: drafts.map((p) => ({ index: p.index, price: p.price, rationale: p.pricing_rationale })) });

  // 4. QA: validate packets + flag tool friction.
  emit({ agent: "qa", phase: "thinking", message: openaiKey ? "Validating packets on GPT…" : "Validating packets on Gemini (no OpenAI key)…" });
  const qa = await runQA(openaiKey, geminiKey, focus.label, drafts.map((p) => ({
    index: p.index, title: p.title, description: p.description, tags: p.tags, price: p.price, subject: p.subject,
  })));

  // Stitch QA results back onto packets.
  for (const review of qa.packets_review || []) {
    const target = drafts.find((p) => p.index === review.index);
    if (!target) continue;
    target.qa = { passes: !!review.passes, issues: Array.isArray(review.issues) ? review.issues : [] };
    emit({
      agent: "qa",
      phase: "speaking",
      message: review.passes
        ? `Packet ${review.index}: ✓ passes`
        : `Packet ${review.index}: needs attention — ${(review.issues || []).join("; ") || "issues flagged"}`,
    });
  }
  for (const f of qa.tool_friction || []) {
    emit({
      agent: "qa",
      phase: "speaking",
      message: `Tool friction [${f.severity}]: ${f.title} — ${f.rationale}`,
    });
  }
  emit({ agent: "qa", phase: "speaking", message: qa.one_liner });
  emit({ agent: "qa", phase: "done", message: "QA complete.", data: qa });

  return {
    packets: drafts,
    tool_friction: qa.tool_friction || [],
    one_liner: qa.one_liner || `${drafts.length} packet(s) ready for your review.`,
  };
}
