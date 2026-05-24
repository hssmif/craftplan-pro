"use client";

import StrategistChat from "./StrategistChat";

// /strategist — Multi-Agent Council Dashboard (iMessage-style chat)
//
// Two modes:
//   • Build (default): a production crew (Researcher → Listing Writer →
//     Pricer → QA) produces ready-to-list packets — title, description,
//     tags, price — based on YOUR DB. Each packet has a "Send to Studio"
//     button that drops it into the Cross-Stitch / niche flow.
//   • Debate: an advisory council (Scout/Strategist/Critic/UX/Synthesis)
//     argues over your next strategic move. Outputs a Now / Later / Don't
//     plan. Useful when you want a sanity check, not a build.
//
// The page is on-demand — nothing runs until you press Start, because
// each run reads fresh signal from your DB and asks the LLMs to reason
// about it. We don't auto-poll — that would burn API credits.
//
// Hard rules surfaced server-side AND in the UI:
//   - Read-only badge on the header
//   - Scout reads local SQLite only — no Etsy network calls
//   - Verdicts and packets are advisory; nothing auto-lists
//   - Send-to-Studio is the seller's explicit click

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ── Types mirroring lib/council.ts ──────────────────────────────────

type AgentName =
  // Debate
  | "scout"
  | "strategist"
  | "critic"
  | "ux_observer"
  | "synthesizer"
  // Build
  | "researcher"
  | "listing_writer"
  | "pricer"
  | "qa"
  // System
  | "orchestrator";

type AgentPhase = "thinking" | "speaking" | "done" | "error" | "started" | "finished";

type CouncilMode = "debate" | "build";
/** Page-level mode adds "chat" — the new default group-conversation
 *  view alongside the existing single-shot debate/build council runs. */
type StrategistPageMode = "chat" | CouncilMode;

interface CouncilEvent {
  seq: number;
  t: number;
  agent: AgentName;
  phase: AgentPhase;
  message: string;
  data?: unknown;
}

/** Loose shape for tool-suggestion entries. The Synthesizer prompt
 *  tells Gemini/GPT to "pull the UX suggestions through verbatim if
 *  severity medium+", and the UX observer emits objects shaped
 *  {title, rationale, severity}. Half the time the LLM keeps the object
 *  shape, half the time it flattens to a one-line string. We accept
 *  both so we never crash the report on a string⇄object swap. */
type ToolSuggestion =
  | string
  | { title: string; rationale?: string; severity?: string };

interface CouncilVerdict {
  now: string[];
  later: string[];
  dont: string[];
  tool_suggestions: ToolSuggestion[];
  one_liner: string;
}

interface BuildPacket {
  index: number;
  niche: string;
  product_type: string;
  subject: string;
  angle: string;
  title: string;
  description: string;
  tags: string[];
  keywords: string[];
  price: number;
  pricing_rationale: string;
  target_buyer: string;
  why_now: string;
  signal: {
    based_on_listings: string[];
    avg_competitor_price: number;
    competition_level: string | null;
    demand_score: number;
  };
  qa: { passes: boolean; issues: string[] };
}

interface BuildResult {
  packets: BuildPacket[];
  tool_friction: { title: string; rationale: string; severity: "low" | "medium" | "high" }[];
  one_liner: string;
}

interface RunSummary {
  id: number;
  mode: CouncilMode;
  focus: string | null;
  topic: string | null;
  status: string;
  one_liner: string | null;
  packet_count: number | null;
  started_at: string;
  finished_at: string | null;
}

// ── Agent metadata: avatar, color, role tag ─────────────────────────

interface AgentMeta {
  label: string;
  model: string;
  /** One-letter avatar */
  avatar: string;
  /** Tailwind palette key — "indigo", "rose", etc. */
  hue: "cyan" | "indigo" | "rose" | "amber" | "emerald" | "zinc";
  role: string;
}

const AGENTS: Record<AgentName, AgentMeta> = {
  // System
  orchestrator:   { label: "Council",      model: "host",       avatar: "○", hue: "zinc",    role: "moderator" },
  // Debate-mode crew
  scout:          { label: "Scout",        model: "DB-only",    avatar: "S", hue: "cyan",    role: "reads your data" },
  strategist:     { label: "Strategist",   model: "Gemini 2.5", avatar: "P", hue: "indigo",  role: "proposes moves" },
  critic:         { label: "Critic",       model: "GPT",        avatar: "C", hue: "rose",    role: "attacks moves" },
  ux_observer:    { label: "UX Observer",  model: "Gemini 2.5", avatar: "U", hue: "amber",   role: "watches the funnel" },
  synthesizer:    { label: "Synthesizer",  model: "GPT",        avatar: "F", hue: "emerald", role: "decides" },
  // Build-mode crew
  researcher:     { label: "Researcher",   model: "DB + Gemini", avatar: "R", hue: "cyan",    role: "picks subjects" },
  listing_writer: { label: "Listing Writer", model: "GPT",      avatar: "L", hue: "indigo",  role: "writes the copy" },
  pricer:         { label: "Pricer",       model: "rules",      avatar: "$", hue: "amber",   role: "smart-prices" },
  qa:             { label: "QA",           model: "GPT",        avatar: "Q", hue: "emerald", role: "validates packets" },
};

// Pre-built tailwind class strings keyed by hue. Tailwind needs these
// to appear literally somewhere in the source so JIT picks them up.
const HUES: Record<AgentMeta["hue"], { avatar: string; bubble: string; ring: string; chip: string }> = {
  cyan: {
    avatar: "bg-cyan-500/20 text-cyan-200 ring-cyan-500/40",
    bubble: "bg-cyan-500/[0.08] border-cyan-500/25 text-cyan-50",
    ring: "ring-cyan-400/50",
    chip: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  },
  indigo: {
    avatar: "bg-indigo-500/20 text-indigo-200 ring-indigo-500/40",
    bubble: "bg-indigo-500/[0.10] border-indigo-500/25 text-indigo-50",
    ring: "ring-indigo-400/50",
    chip: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  },
  rose: {
    avatar: "bg-rose-500/20 text-rose-200 ring-rose-500/40",
    bubble: "bg-rose-500/[0.08] border-rose-500/25 text-rose-50",
    ring: "ring-rose-400/50",
    chip: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  },
  amber: {
    avatar: "bg-amber-500/20 text-amber-200 ring-amber-500/40",
    bubble: "bg-amber-500/[0.08] border-amber-500/25 text-amber-50",
    ring: "ring-amber-400/50",
    chip: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  emerald: {
    avatar: "bg-emerald-500/20 text-emerald-200 ring-emerald-500/40",
    bubble: "bg-emerald-500/[0.10] border-emerald-500/25 text-emerald-50",
    ring: "ring-emerald-400/50",
    chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  zinc: {
    avatar: "bg-zinc-500/20 text-zinc-200 ring-zinc-500/40",
    bubble: "bg-white/[0.04] border-white/[0.08] text-white/70",
    ring: "ring-white/20",
    chip: "bg-white/[0.06] text-white/70 border-white/[0.10]",
  },
};

const FOCUS_OPTIONS = [
  { id: "all",          label: "Any niche" },
  { id: "cross-stitch", label: "Cross-stitch patterns" },
  { id: "wall-art",     label: "Digital wall art" },
  { id: "notion",       label: "Notion templates" },
] as const;

// ── Page ─────────────────────────────────────────────────────────────

export default function StrategistPage() {
  // Page-level mode: "chat" is the new default — the seller talks to
  // the team in a persistent group conversation.  "build" and "debate"
  // remain for single-shot council runs (ready-to-list packets / advisory
  // plans).  Mode persists in localStorage so the seller stays where
  // they were last.
  const [pageMode, setPageMode] = useState<StrategistPageMode>("chat");
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("strategist-mode") : null;
    if (saved === "build" || saved === "debate" || saved === "chat") setPageMode(saved);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("strategist-mode", pageMode);
  }, [pageMode]);
  // CouncilMode mirrors page-mode for the existing build/debate code,
  // but stays at "build" while we're in chat — the run logic below
  // never fires unless the user explicitly switches to build/debate.
  const [mode, setMode] = useState<CouncilMode>("build");
  // Keep the council mode in sync when the user picks build/debate.
  useEffect(() => {
    if (pageMode === "build" || pageMode === "debate") setMode(pageMode);
  }, [pageMode]);
  const [focus, setFocus] = useState<string>("cross-stitch");
  const [topic, setTopic] = useState<string>("");
  const [count, setCount] = useState<number>(3);
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<CouncilEvent[]>([]);
  const [verdict, setVerdict] = useState<CouncilVerdict | null>(null);
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null);
  const [sendingIndex, setSendingIndex] = useState<number | null>(null);
  const [bulkSending, setBulkSending] = useState(false);
  const [sentMap, setSentMap] = useState<Record<number, number>>({}); // packet index → product_idea id
  const [activeAgent, setActiveAgent] = useState<AgentName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const startedAtRef = useRef<number>(0);

  // ── Produce-video state ──
  // Lives separate from the council state because the video pipeline
  // is its own SSE stream (POST /api/strategist/produce-video) with
  // its own progress phases. Mixing it into `events` would break the
  // chat-bubble rendering, so we keep a single-shot result here.
  type VideoPhase =
    | "idle"
    | "director"      // Director agent writing the prompt
    | "veo_started"   // fal.ai queue submission accepted
    | "veo_polling"   // Polling fal.ai — `videoElapsedSec` ticks here
    | "complete"
    | "error";
  /** fal.ai model identifiers — kept in sync with lib/fal-video.ts.
   *  Defining here too instead of importing because this is a client
   *  component and lib/fal-video.ts uses Node-only APIs (fs/promises).
   *  The cost map is mirrored manually for the same reason — small
   *  duplication, big build-graph win. */
  type VideoModel = "wan-2.2-5b" | "kling-1.6-standard" | "kling-2-master";
  const VIDEO_MODEL_OPTIONS: Array<{ id: VideoModel; label: string; costPerClip: number }> = [
    { id: "wan-2.2-5b", label: "Wan 2.2 5B — cheapest", costPerClip: 0.05 },
    { id: "kling-1.6-standard", label: "Kling 1.6 Standard — default", costPerClip: 0.25 },
    { id: "kling-2-master", label: "Kling 2 Master — premium", costPerClip: 1.4 },
  ];
  const [videoPhase, setVideoPhase] = useState<VideoPhase>("idle");
  const [videoTopic, setVideoTopic] = useState<string>("");
  const [videoDuration, setVideoDuration] = useState<number>(5);
  const [videoAspect, setVideoAspect] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [videoModel, setVideoModel] = useState<VideoModel>("kling-1.6-standard");
  const [videoElapsedSec, setVideoElapsedSec] = useState(0);
  const [videoQueueStatus, setVideoQueueStatus] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoVeoPrompt, setVideoVeoPrompt] = useState<string | null>(null);
  const [videoRationale, setVideoRationale] = useState<string | null>(null);
  const [videoCostUsd, setVideoCostUsd] = useState<number | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoErrorCode, setVideoErrorCode] = useState<string | null>(null);
  const videoAbortRef = useRef<AbortController | null>(null);

  // ── History rail ──
  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch("/api/strategist/runs");
      const d = await r.json();
      if (Array.isArray(d.runs)) setHistory(d.runs);
    } catch { /* best-effort */ }
  }, []);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  // ── Auto-scroll on new event ──
  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    // Only auto-scroll if user is near the bottom (don't yank them up while reading)
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  // ── Live elapsed timer ──
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 200);
    return () => clearInterval(id);
  }, [running]);

  // ── Convene a new council ──
  const startCouncil = useCallback(async () => {
    setEvents([]);
    setVerdict(null);
    setBuildResult(null);
    setSentMap({});
    setActiveAgent(null);
    setError(null);
    setActiveRunId(null);
    setRunning(true);
    startedAtRef.current = Date.now();
    setElapsedMs(0);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch("/api/strategist/council", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          focus,
          topic: topic.trim() || undefined,
          count: mode === "build" ? count : undefined,
        }),
        signal: controller.signal,
      });
      if (!resp.ok || !resp.body) {
        const err = await resp.text().catch(() => "");
        throw new Error(`Council failed (${resp.status}): ${err.slice(0, 200)}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const raw = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 2);
          if (!raw.startsWith("data: ")) continue;
          const payload = raw.slice(6).trim();
          if (payload === "[DONE]") continue;
          let parsed: unknown;
          try { parsed = JSON.parse(payload); } catch { continue; }

          if (parsed && typeof parsed === "object" && "type" in parsed) {
            const p = parsed as {
              type: string;
              runId?: number;
              mode?: CouncilMode;
              verdict?: CouncilVerdict | null;
              build?: BuildResult | null;
              error?: string;
            };
            if (p.type === "final") {
              if (p.verdict) setVerdict(p.verdict);
              if (p.build) setBuildResult(p.build);
              if (p.runId) setActiveRunId(p.runId);
              if (p.error) setError(p.error);
            } else if (p.type === "fatal" && p.error) {
              setError(p.error);
            }
            continue;
          }
          const ev = parsed as CouncilEvent;
          setEvents((prev) => [...prev, ev]);
          if (ev.phase === "thinking" || ev.phase === "speaking" || ev.phase === "started") {
            setActiveAgent(ev.agent);
          } else if (ev.phase === "done" || ev.phase === "finished") {
            setActiveAgent((cur) => (cur === ev.agent ? null : cur));
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Stream failed");
      }
    } finally {
      setRunning(false);
      setActiveAgent(null);
      abortRef.current = null;
      loadHistory();
    }
  }, [mode, focus, topic, count, loadHistory]);

  // ── Produce video — agent-only fal.ai pipeline ──
  // The user gives a plain-language ask ("woman cross-stitching a Mexican
  // folk bird pattern, hands-only, natural light, 5s vertical"); the
  // Director agent (Gemini) translates it into a model-friendly prompt;
  // fal.ai renders an MP4 server-side; we save it under /tmp and the
  // <video> player below points at /api/strategist/serve-video/<id>.
  //
  // Cost reminder visible in the panel: Wan 2.2 5B ~$0.05, Kling Standard
  // ~$0.25, Kling Master ~$1.40. The seller picks a model + clicks
  // Generate explicitly — no auto-fire, no implicit charges. The legacy
  // `veo*` prefix in some state names (videoVeoPrompt, the SSE
  // veo_started phase) is intentional churn-avoidance; the fields are
  // just "the polished text-to-video prompt" + "render started".
  const startProduceVideo = useCallback(async () => {
    const topicTrimmed = videoTopic.trim();
    if (!topicTrimmed) {
      setVideoError("Describe the video you want — e.g. 'woman stitching a Mexican folk bird pattern, hands-only, natural light'");
      setVideoErrorCode(null);
      setVideoPhase("error");
      return;
    }
    setVideoError(null);
    setVideoErrorCode(null);
    setVideoId(null);
    setVideoVeoPrompt(null);
    setVideoRationale(null);
    setVideoElapsedSec(0);
    setVideoQueueStatus(null);
    setVideoCostUsd(null);
    setVideoPhase("director");

    const controller = new AbortController();
    videoAbortRef.current = controller;

    try {
      const resp = await fetch("/api/strategist/produce-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topicTrimmed,
          niche: focus,                 // reuse the council's Focus selector — same niche taxonomy
          durationSec: videoDuration,
          aspectRatio: videoAspect,
          model: videoModel,
        }),
        signal: controller.signal,
      });
      if (!resp.ok || !resp.body) {
        const errText = await resp.text().catch(() => "");
        throw new Error(`Produce video failed (${resp.status}): ${errText.slice(0, 200)}`);
      }

      // Same SSE shape as /api/strategist/council — line-buffered
      // newline-delimited events, [DONE] terminator.
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const raw = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 2);
          if (!raw.startsWith("data: ")) continue;
          const payload = raw.slice(6).trim();
          if (payload === "[DONE]") continue;
          let parsed: unknown;
          try { parsed = JSON.parse(payload); } catch { continue; }
          if (!parsed || typeof parsed !== "object") continue;
          const ev = parsed as {
            phase?: VideoPhase;
            elapsedSec?: number;
            videoId?: string;
            veoPrompt?: string;
            rationale?: string;
            message?: string;
            code?: string;
            // fal.ai surface — queueStatus is "IN_QUEUE"|"IN_PROGRESS"|"COMPLETED"
            // streamed during polling; estimatedCostUsd lands once on
            // veo_started and again on complete (so the UI doesn't have to
            // reconcile two sources of truth).
            queueStatus?: string;
            estimatedCostUsd?: number;
          };
          if (ev.phase === "director" && ev.veoPrompt) {
            // Director finished — store the polished prompt + rationale
            // so the seller can see what fal.ai will actually receive.
            setVideoVeoPrompt(ev.veoPrompt);
            setVideoRationale(ev.rationale ?? null);
          }
          if (ev.phase === "veo_started") {
            setVideoPhase("veo_started");
            if (ev.veoPrompt) setVideoVeoPrompt(ev.veoPrompt);
            if (typeof ev.estimatedCostUsd === "number") setVideoCostUsd(ev.estimatedCostUsd);
          }
          if (ev.phase === "veo_polling") {
            setVideoPhase("veo_polling");
            if (typeof ev.elapsedSec === "number") setVideoElapsedSec(ev.elapsedSec);
            if (ev.queueStatus) setVideoQueueStatus(ev.queueStatus);
          }
          if (ev.phase === "complete" && ev.videoId) {
            setVideoId(ev.videoId);
            setVideoPhase("complete");
            if (ev.veoPrompt) setVideoVeoPrompt(ev.veoPrompt);
            if (ev.rationale) setVideoRationale(ev.rationale);
            if (typeof ev.estimatedCostUsd === "number") setVideoCostUsd(ev.estimatedCostUsd);
          }
          if (ev.phase === "error") {
            setVideoError(ev.message ?? "Unknown error");
            setVideoErrorCode(ev.code ?? null);
            setVideoPhase("error");
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setVideoError(err instanceof Error ? err.message : "Stream failed");
        setVideoErrorCode("client_error");
        setVideoPhase("error");
      }
    } finally {
      videoAbortRef.current = null;
    }
  }, [videoTopic, videoDuration, videoAspect, videoModel, focus]);

  const cancelProduceVideo = useCallback(() => {
    videoAbortRef.current?.abort();
    videoAbortRef.current = null;
    setVideoPhase("idle");
  }, []);

  // ── Send a packet to the Cross-Stitch / niche studio ──
  // Creates a product_ideas row and (for cross-stitch) opens that
  // studio with ?ideaId=N so the seller drops straight into the build
  // flow with their listing copy attached.
  const sendPacketToStudio = useCallback(async (packet: BuildPacket) => {
    if (sentMap[packet.index]) return;
    setSendingIndex(packet.index);
    try {
      const r = await fetch("/api/strategist/packets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packet, runId: activeRunId ?? undefined }),
      });
      const d = await r.json();
      if (!r.ok || !d.ideaId) throw new Error(d.error ?? `Send failed (${r.status})`);
      setSentMap((m) => ({ ...m, [packet.index]: d.ideaId }));
      // For cross-stitch, route to the studio with ?ideaId=N. For other
      // niches, leave the packet in /research where the seller can pick
      // it up — opening the cross-stitch studio for a notion template
      // would be confusing.
      if ((packet.niche || "").toLowerCase().includes("cross-stitch") ||
          (packet.niche || "").toLowerCase().includes("cross stitch")) {
        window.open(`/cross-stitch?ideaId=${d.ideaId}`, "_blank");
      } else {
        window.open(`/research?ideaId=${d.ideaId}`, "_blank");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send packet to studio");
    } finally {
      setSendingIndex(null);
    }
  }, [activeRunId, sentMap]);

  // ── Bulk send: every unsent packet → Studio in one click ──
  // Why parallel + single tab instead of one-by-one + many tabs:
  //   - The seller's mental model is "I built 3 packets, I want them in
  //     the funnel" — making them click 3 times + manage 3 popup tabs is
  //     friction that kills the build→list flow.
  //   - We POST in parallel because /api/strategist/packets is just an
  //     INSERT (deterministic, no LLM). better-sqlite3 serialises writes
  //     internally so concurrent INSERTs are safe.
  //   - We open ONE tab to /research?status=favorited&highlight=N,N,N
  //     so the seller lands on the funnel with their newly-staged ideas
  //     ringed and scrolled into view.
  const sendAllPacketsToStudio = useCallback(async () => {
    if (!buildResult || buildResult.packets.length === 0) return;
    const unsent = buildResult.packets.filter((p) => !sentMap[p.index]);
    if (unsent.length === 0) {
      // Already-sent rerun — just open the funnel filtered to favorited.
      const ids = Object.values(sentMap).filter(Boolean);
      const qs = ids.length ? `&highlight=${ids.join(",")}` : "";
      window.open(`/research?status=favorited${qs}`, "_blank");
      return;
    }
    setBulkSending(true);
    setError(null);
    try {
      // Fire all packet POSTs in parallel; collect ideaIds in packet
      // order so the highlight= param matches the seller's view.
      const results = await Promise.all(
        unsent.map(async (packet) => {
          const r = await fetch("/api/strategist/packets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ packet, runId: activeRunId ?? undefined }),
          });
          const d = await r.json();
          if (!r.ok || !d.ideaId) {
            throw new Error(d.error ?? `Send failed for packet ${packet.index} (${r.status})`);
          }
          return { index: packet.index, ideaId: d.ideaId as number };
        }),
      );
      // Merge into sentMap so per-packet buttons flip to "Sent" too.
      setSentMap((m) => {
        const next = { ...m };
        for (const { index, ideaId } of results) next[index] = ideaId;
        return next;
      });
      // Build the highlight list: union of just-sent + previously-sent
      // so the seller sees ALL packets from this run, not just the
      // last batch (matters if they sent some singly first and then
      // bulk'd the rest).
      const allIds = [
        ...results.map((r) => r.ideaId),
        ...Object.values(sentMap).filter(Boolean),
      ];
      const uniq = Array.from(new Set(allIds));
      window.open(
        `/research?status=favorited&highlight=${uniq.join(",")}`,
        "_blank",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk send failed");
    } finally {
      setBulkSending(false);
    }
  }, [buildResult, sentMap, activeRunId]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ── Replay a past run ──
  const loadPastRun = useCallback(async (id: number) => {
    if (running) return;
    setActiveRunId(id);
    setError(null);
    setSentMap({});
    try {
      const r = await fetch(`/api/strategist/runs/${id}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Failed to load run ${id}`);
      const run = d.run as {
        mode?: CouncilMode;
        focus: string | null;
        topic: string | null;
        events: CouncilEvent[];
        verdict: CouncilVerdict | null;
        build: BuildResult | null;
        error: string | null;
      };
      const runMode: CouncilMode = run.mode === "build" ? "build" : "debate";
      setMode(runMode);
      setFocus(run.focus ?? "all");
      setTopic(run.topic ?? "");
      setEvents(Array.isArray(run.events) ? run.events : []);
      setVerdict(run.verdict);
      setBuildResult(run.build ?? null);
      if (run.error) setError(run.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load run");
    }
  }, [running]);

  // ── Group consecutive events by sender (iMessage style) ──
  const groups = useMemo(() => groupConsecutive(events), [events]);

  // ── Build a plain-English report from the events + verdict ──
  const report = useMemo(
    () => buildReport(events, verdict, buildResult, mode),
    [events, verdict, buildResult, mode],
  );

  const hasStarted = events.length > 0 || running;
  const totalElapsedSec = (elapsedMs / 1000).toFixed(1);
  const focusLabel = FOCUS_OPTIONS.find((f) => f.id === focus)?.label ?? "Any niche";

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--bg)] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-semibold tracking-tight">Strategist Council</h1>
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Read-only
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              {pageMode === "chat"
                ? "Group chat with 4 AI agents — Researcher, Strategist, Critic, Builder. @-mention to direct a question, or just talk and the right agents will jump in."
                : mode === "build"
                  ? "A production crew of AI agents builds ready-to-list packets from your local data — title, description, tags, price. You review, then click Send to Studio."
                  : "Five AI agents debate your next Etsy move using your local data. Outputs an advisory plan."}
            </p>
          </div>
          <a href="/research" className="text-xs text-[var(--text-muted)] hover:text-white whitespace-nowrap pt-1">
            ← Research
          </a>
        </div>

        {/* ── Mode toggle ──
            "Chat" is the persistent group conversation (default).
            "Build" / "Debate" are the existing single-shot council runs. */}
        <div className="bg-[var(--bg-elevated)] rounded-2xl border border-white/[0.08] p-1 mb-3 inline-flex gap-1">
          <ModeButton
            active={pageMode === "chat"}
            onClick={() => !running && setPageMode("chat")}
            disabled={running}
            label="Chat"
            sub="group conversation"
          />
          <ModeButton
            active={pageMode === "build"}
            onClick={() => !running && setPageMode("build")}
            disabled={running}
            label="Build"
            sub="ready-to-list packets"
          />
          <ModeButton
            active={pageMode === "debate"}
            onClick={() => !running && setPageMode("debate")}
            disabled={running}
            label="Debate"
            sub="advisory plan"
          />
        </div>

        {/* ── Chat mode renders here, replacing the build/debate UI. */}
        {pageMode === "chat" && <StrategistChat />}

        {pageMode !== "chat" && (
        <>
        {/* ── Compose bar ── */}
        <div className="bg-[var(--bg-elevated)] rounded-2xl border border-white/[0.08] p-3 mb-5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/55">Focus</span>
            <select
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              disabled={running}
              className="bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] font-medium disabled:opacity-50 hover:border-white/[0.16] transition-colors"
            >
              {FOCUS_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          {mode === "build" && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-white/55">Packets</span>
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                disabled={running}
                className="bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] font-medium disabled:opacity-50 hover:border-white/[0.16] transition-colors"
              >
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          )}
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={running}
            placeholder={mode === "build"
              ? "Optional brief — e.g. Halloween cross-stitch, lean cute & beginner-friendly"
              : "Optional question — e.g. Which 3 ideas should I list this week?"}
            className="flex-1 min-w-[240px] bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] font-medium disabled:opacity-50 placeholder:text-white/40 focus:outline-none focus:border-indigo-500/50"
            onKeyDown={(e) => { if (e.key === "Enter" && !running) startCouncil(); }}
          />
          {running ? (
            <button
              onClick={cancel}
              className="px-5 py-2 bg-rose-600 hover:bg-rose-500 rounded-lg text-[13px] font-bold flex items-center gap-2"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              Stop · {totalElapsedSec}s
            </button>
          ) : (
            <button
              onClick={startCouncil}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-[13px] font-bold flex items-center gap-2"
            >
              {hasStarted
                ? (mode === "build" ? "Build again" : "Debate again")
                : (mode === "build" ? `Build ${count} packet${count === 1 ? "" : "s"}` : "Start debate")}
              <span aria-hidden>→</span>
            </button>
          )}
        </div>

        {/* ── Main grid: chat + side panel ── */}
        <div className="grid grid-cols-12 gap-5">
          {/* Chat */}
          <main className="col-span-12 lg:col-span-7">
            <div className="bg-[var(--bg-elevated)] rounded-2xl border border-white/[0.08] flex flex-col h-[680px]">
              {/* Chat header strip */}
              <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">Conversation</span>
                  <span className="text-[11px] text-[var(--text-muted)]">· {focusLabel}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-medium">
                  {activeAgent && activeAgent !== "orchestrator" ? (
                    <>
                      <Avatar agent={activeAgent} size="xs" />
                      <span className="text-white/80">{AGENTS[activeAgent].label} is typing…</span>
                    </>
                  ) : running ? (
                    <span className="text-[var(--text-muted)]">Streaming…</span>
                  ) : buildResult ? (
                    <span className="flex items-center gap-1.5 text-emerald-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Done · {buildResult.packets.length} packet{buildResult.packets.length === 1 ? "" : "s"} ready →
                    </span>
                  ) : verdict ? (
                    <span className="flex items-center gap-1.5 text-emerald-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Done · see Report &amp; Action plan →
                    </span>
                  ) : events.length > 0 ? (
                    <span className="text-[var(--text-muted)]">{events.length} messages</span>
                  ) : (
                    <span className="text-[var(--text-muted)]">Idle</span>
                  )}
                </div>
              </div>

              {/* Chat body */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
                {!hasStarted ? (
                  <EmptyState mode={mode} />
                ) : (
                  <div className="space-y-1">
                    {groups.map((g, i) => (
                      <MessageGroup
                        key={`${g.sender}-${g.events[0].seq}-${i}`}
                        group={g}
                        showTypingTail={running && activeAgent === g.sender && i === groups.length - 1}
                      />
                    ))}
                    {/* Typing indicator if no group yet but agent is thinking */}
                    {running && activeAgent && activeAgent !== "orchestrator" && groups.length > 0 &&
                      groups[groups.length - 1].sender !== activeAgent && (
                        <div className="flex items-end gap-2 py-2">
                          <Avatar agent={activeAgent} size="sm" />
                          <TypingDots agent={activeAgent} />
                        </div>
                      )}
                  </div>
                )}
              </div>

              {/* Footer: tiny "what just happened" hint */}
              {error && (
                <div className="px-4 py-2 border-t border-rose-500/30 bg-rose-500/[0.06] text-[11px] text-rose-200">
                  {error}
                </div>
              )}
            </div>
          </main>

          {/* Side panel: report + verdict + history */}
          <aside className="col-span-12 lg:col-span-5 space-y-4">
            {/* Report */}
            <div className="bg-[var(--bg-elevated)] rounded-2xl border border-white/[0.08] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Report</h3>
                {report && (
                  <span className="text-[10px] text-[var(--text-muted)]">{report.headline}</span>
                )}
              </div>
              {!hasStarted ? (
                <ReportEmpty mode={mode} />
              ) : !report ? (
                <p className="text-xs text-[var(--text-muted)]">Building report…</p>
              ) : (
                <div className="space-y-3 text-[14px] font-medium leading-relaxed text-white/90">
                  {report.paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              )}
            </div>

            {/* Build mode: packet cards */}
            {mode === "build" && buildResult && buildResult.packets.length > 0 && (
              <div className="bg-[var(--bg-elevated)] rounded-2xl border border-emerald-500/20 ring-1 ring-emerald-500/10 p-4">
                <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Ready-to-list packets
                  </h3>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-medium text-white/55">
                      {buildResult.packets.length} produced
                      {/* Show how many are already in the funnel so the
                         "Send all" button's behaviour (send rest vs. open
                         funnel only) doesn't surprise the seller. */}
                      {(() => {
                        const sentCount = buildResult.packets.filter((p) => sentMap[p.index]).length;
                        return sentCount > 0 ? ` · ${sentCount} sent` : "";
                      })()}
                    </span>
                    {/* Bulk-send CTA — primary path for the build flow.
                       Disabled while a single-send is in flight to avoid
                       a packet getting double-INSERTed (sentMap is the
                       guard but we belt-and-suspenders the UI here). */}
                    <button
                      onClick={sendAllPacketsToStudio}
                      disabled={bulkSending || sendingIndex !== null}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-[12px] font-bold flex items-center gap-1.5"
                    >
                      {bulkSending ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          Sending all…
                        </>
                      ) : buildResult.packets.every((p) => sentMap[p.index]) ? (
                        <>Open all in studio →</>
                      ) : (
                        <>Send all to Studio →</>
                      )}
                    </button>
                  </div>
                </div>
                <p className="text-[13px] font-medium text-white/85 leading-relaxed mb-4">&ldquo;{buildResult.one_liner}&rdquo;</p>
                <div className="space-y-3">
                  {buildResult.packets.map((p) => (
                    <PacketCard
                      key={p.index}
                      packet={p}
                      sending={sendingIndex === p.index}
                      sentIdeaId={sentMap[p.index] ?? null}
                      onSend={() => sendPacketToStudio(p)}
                    />
                  ))}
                </div>
                {buildResult.tool_friction.length > 0 && (
                  <div className="mt-4">
                    <Section title="Tool friction (advisory)" tone="amber">
                      {buildResult.tool_friction.map((f, i) => (
                        <li key={i} className="text-[13px] font-medium text-white/90 leading-relaxed">
                          <span className="text-amber-300/90">[{f.severity}]</span> <span className="font-semibold">{f.title}</span> — {f.rationale}
                        </li>
                      ))}
                    </Section>
                  </div>
                )}
              </div>
            )}

            {/* Debate mode: action plan */}
            {mode === "debate" && verdict && (
              <div className="bg-[var(--bg-elevated)] rounded-2xl border border-emerald-500/20 ring-1 ring-emerald-500/10 p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Action plan
                </h3>
                <p className="text-[14px] font-semibold text-white leading-relaxed mb-4">&ldquo;{verdict.one_liner}&rdquo;</p>
                {verdict.now?.length > 0 && (
                  <Section title="Now" tone="emerald">
                    {verdict.now.map((it, i) => <li key={i} className="text-[13px] font-medium text-white/95 leading-relaxed">• {it}</li>)}
                  </Section>
                )}
                {verdict.later?.length > 0 && (
                  <Section title="Later" tone="indigo">
                    {verdict.later.map((it, i) => <li key={i} className="text-[13px] font-medium text-white/85 leading-relaxed">• {it}</li>)}
                  </Section>
                )}
                {verdict.dont?.length > 0 && (
                  <Section title="Don't" tone="rose">
                    {verdict.dont.map((it, i) => <li key={i} className="text-[13px] font-medium text-white/80 leading-relaxed">• {it}</li>)}
                  </Section>
                )}
                {verdict.tool_suggestions?.length > 0 && (
                  <Section title="Tool fixes (advisory)" tone="amber">
                    {/* Each item can be a flat string OR a {title, rationale,
                       severity} object — see the ToolSuggestion type above
                       for why. Render both shapes safely; rendering the raw
                       object as {it} crashes React with "Objects are not
                       valid as a React child", which is what blew up the
                       report panel before this guard was added. */}
                    {verdict.tool_suggestions.map((it, i) => {
                      if (typeof it === "string") {
                        return (
                          <li key={i} className="text-[13px] font-medium text-white/90 leading-relaxed">
                            • {it}
                          </li>
                        );
                      }
                      return (
                        <li key={i} className="text-[13px] font-medium text-white/90 leading-relaxed">
                          {it.severity && (
                            <span className="text-amber-300/90">[{it.severity}] </span>
                          )}
                          <span className="font-semibold">{it.title}</span>
                          {it.rationale && <> — {it.rationale}</>}
                        </li>
                      );
                    })}
                  </Section>
                )}
              </div>
            )}

            {/* ── Produce video (agent-driven fal.ai pipeline) ──
               Self-contained: lives below the council results because
               the Director→fal.ai flow has no chat-bubble UI. The seller
               types what they want, agent writes the prompt, fal.ai
               renders the MP4 server-side. Cost label is loud + model-
               aware so the seller knows which budget bracket they're in
               (Wan ~$0.05 vs. Master ~$1.40) before clicking Generate. */}
            <div className="bg-[var(--bg-elevated)] rounded-2xl border border-white/[0.08] p-4">
              <div className="flex items-baseline justify-between mb-1">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                  Produce video
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wider text-violet-300/80">
                  fal.ai · agents make it
                </span>
              </div>
              <p className="text-[12px] text-white/60 leading-relaxed mb-3">
                Describe the clip. The Director agent rewrites it as a fal.ai prompt and renders the MP4 — no filming required.
              </p>
              <textarea
                value={videoTopic}
                onChange={(e) => setVideoTopic(e.target.value)}
                disabled={videoPhase !== "idle" && videoPhase !== "complete" && videoPhase !== "error"}
                placeholder="e.g. Woman cross-stitching a Mexican folk bird pattern, hands-only, natural light, cozy"
                rows={2}
                className="w-full bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] font-medium placeholder:text-white/40 focus:outline-none focus:border-violet-500/50 disabled:opacity-50 resize-none"
              />
              <div className="flex flex-wrap items-center gap-3 mt-3">
                <label className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-white/55">Model</span>
                  <select
                    value={videoModel}
                    onChange={(e) => setVideoModel(e.target.value as VideoModel)}
                    disabled={videoPhase !== "idle" && videoPhase !== "complete" && videoPhase !== "error"}
                    className="bg-black/30 border border-white/[0.08] rounded-lg px-2 py-1.5 text-[12px] font-medium disabled:opacity-50"
                  >
                    {VIDEO_MODEL_OPTIONS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label} (~${m.costPerClip.toFixed(2)})</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-white/55">Length</span>
                  <select
                    value={videoDuration}
                    onChange={(e) => setVideoDuration(Number(e.target.value))}
                    disabled={videoPhase !== "idle" && videoPhase !== "complete" && videoPhase !== "error"}
                    className="bg-black/30 border border-white/[0.08] rounded-lg px-2 py-1.5 text-[12px] font-medium disabled:opacity-50"
                  >
                    {/* Kling supports 5 or 10; Wan supports 3-6. The lib snaps
                       per-model — show a clean range that covers both. The
                       backend (lib/fal-video.ts → actualDurationSec) clamps
                       so e.g. picking 10 with Wan downshifts to 6. */}
                    {[5, 8, 10].map((n) => <option key={n} value={n}>{n}s</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-white/55">Aspect</span>
                  <select
                    value={videoAspect}
                    onChange={(e) => setVideoAspect(e.target.value as "9:16" | "16:9" | "1:1")}
                    disabled={videoPhase !== "idle" && videoPhase !== "complete" && videoPhase !== "error"}
                    className="bg-black/30 border border-white/[0.08] rounded-lg px-2 py-1.5 text-[12px] font-medium disabled:opacity-50"
                  >
                    <option value="9:16">9:16 (vertical)</option>
                    <option value="16:9">16:9 (horizontal)</option>
                    <option value="1:1">1:1 (square)</option>
                  </select>
                </label>
                {/* Cost label reads from VIDEO_MODEL_OPTIONS so the price
                   stays in lockstep with whichever model is selected.
                   Stripping `— …` keeps the label name short. */}
                {(() => {
                  const opt = VIDEO_MODEL_OPTIONS.find((m) => m.id === videoModel);
                  const shortName = opt ? opt.label.split(" — ")[0] : videoModel;
                  return (
                    <span className="text-[11px] text-amber-300/80 font-medium">
                      ≈ ${opt?.costPerClip.toFixed(2) ?? "?"} · {shortName}
                    </span>
                  );
                })()}
                <div className="flex-grow" />
                {/* Generate button — cancel button replaces it during a run.
                   Phase guards: idle/complete/error means "ready to start";
                   director/veo_started/veo_polling means "running, show
                   progress". The cost label is intentionally close to the
                   button so the seller cannot miss it. */}
                {(videoPhase === "idle" || videoPhase === "complete" || videoPhase === "error") ? (
                  <button
                    onClick={startProduceVideo}
                    disabled={!videoTopic.trim()}
                    className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-[13px] font-bold flex items-center gap-2"
                  >
                    {videoPhase === "complete" ? "Generate again" : "Generate video"}
                    <span aria-hidden>→</span>
                  </button>
                ) : (
                  <button
                    onClick={cancelProduceVideo}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 rounded-lg text-[13px] font-bold flex items-center gap-2"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    Stop
                  </button>
                )}
              </div>

              {/* Progress strip — phase-keyed so each step shows what
                 the agent is doing without blowing up into a heavy chat
                 panel. The Director step is fast (~2-4s); fal.ai polling
                 dominates total time (Wan ~30-90s, Kling 60-180s, Master
                 120-240s). */}
              {videoPhase !== "idle" && (
                <div className="mt-4 space-y-2">
                  {videoPhase === "director" && (
                    <div className="flex items-center gap-2 text-[12px] font-medium text-white/85">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                      Director is writing the video prompt…
                    </div>
                  )}
                  {videoVeoPrompt && (
                    <div className="rounded-lg border border-white/[0.08] bg-black/30 p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-violet-300/80 mb-1">
                        Director prompt {videoRationale && <span className="text-white/40 font-normal normal-case tracking-normal">· {videoRationale}</span>}
                      </div>
                      <p className="text-[12px] text-white/85 leading-relaxed">{videoVeoPrompt}</p>
                    </div>
                  )}
                  {(videoPhase === "veo_started" || videoPhase === "veo_polling") && (
                    <div className="flex items-center gap-2 text-[12px] font-medium text-white/85">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                      {/* fal.ai exposes IN_QUEUE → IN_PROGRESS → COMPLETED.
                         Map to friendly labels so the seller sees movement
                         (queue waits can stretch to 30s on free-tier accounts
                         and "0s elapsed, no status" looks dead otherwise). */}
                      fal.ai rendering · {videoElapsedSec}s elapsed
                      {videoQueueStatus && (
                        <span className="text-white/55 font-normal">
                          {" · "}
                          {videoQueueStatus === "IN_QUEUE" ? "queued" :
                           videoQueueStatus === "IN_PROGRESS" ? "rendering" :
                           videoQueueStatus.toLowerCase()}
                        </span>
                      )}
                    </div>
                  )}
                  {videoPhase === "error" && videoError && (
                    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-rose-300 mb-1">
                        {videoErrorCode === "missing_key" ? "FAL_KEY not set" :
                         videoErrorCode === "permission_denied" ? "fal.ai auth failed" :
                         videoErrorCode === "quota" ? "fal.ai quota exhausted" :
                         videoErrorCode === "invalid_prompt" ? "fal.ai rejected the prompt" :
                         videoErrorCode === "timeout" ? "Render timed out" :
                         videoErrorCode === "no_video_returned" ? "fal.ai returned no video" :
                         "Error"}
                      </div>
                      <p className="text-[12px] text-white/85 leading-relaxed">{videoError}</p>
                      {videoErrorCode === "missing_key" && (
                        <p className="text-[11px] text-white/60 mt-2">
                          Add FAL_KEY to <span className="text-violet-300">.env.local</span>. The same key the cross-stitch premium-convert flow uses.
                        </p>
                      )}
                      {videoErrorCode === "permission_denied" && (
                        <p className="text-[11px] text-white/60 mt-2">
                          Check that your FAL_KEY is correct and has the selected model enabled at <span className="text-violet-300">fal.ai/dashboard</span>.
                        </p>
                      )}
                    </div>
                  )}
                  {videoPhase === "complete" && videoId && (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-2">
                          Ready
                          {/* Echo back what the run actually cost. The
                             estimate comes from the API (FAL_VIDEO_COST_USD
                             keyed by the model that ran), so the seller
                             sees the real number even if they switched
                             models between runs. */}
                          {typeof videoCostUsd === "number" && (
                            <span className="text-amber-300/80 font-medium normal-case tracking-normal">
                              · ~${videoCostUsd.toFixed(2)}
                            </span>
                          )}
                        </span>
                        <a
                          href={`/api/strategist/serve-video/${videoId}`}
                          download={`${videoId}.mp4`}
                          className="text-[11px] font-semibold text-violet-300 hover:text-violet-200"
                        >
                          Download MP4 ↓
                        </a>
                      </div>
                      <video
                        src={`/api/strategist/serve-video/${videoId}`}
                        controls
                        className="w-full rounded-md bg-black"
                        // 9:16 videos are tall; cap height so the page
                        // doesn't become a giant scroll. 16:9 / 1:1
                        // naturally fit within this cap.
                        style={{ maxHeight: 480, aspectRatio: videoAspect.replace(":", " / ") }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* History */}
            <div className="bg-[var(--bg-elevated)] rounded-2xl border border-white/[0.08] p-4">
              <h3 className="text-sm font-semibold mb-2">Past sessions</h3>
              {history.length === 0 ? (
                <p className="text-[13px] font-medium text-white/60">None yet — finished runs land here so you can revisit them.</p>
              ) : (
                <ul className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {history.map((h) => (
                    <li key={h.id}>
                      <button
                        onClick={() => loadPastRun(h.id)}
                        className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                          activeRunId === h.id
                            ? "border-indigo-500/50 bg-indigo-500/10"
                            : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-white/55 flex items-center gap-1.5">
                            #{h.id}
                            <span className={`px-1 py-px text-[9px] rounded ${
                              h.mode === "build"
                                ? "bg-indigo-500/20 text-indigo-200"
                                : "bg-white/[0.06] text-white/55"
                            }`}>
                              {h.mode}
                            </span>
                            <span>· {h.focus ?? "all"}</span>
                            {typeof h.packet_count === "number" && (
                              <span className="text-emerald-300/80">· {h.packet_count}🎁</span>
                            )}
                          </span>
                          <span className={`text-[11px] font-bold ${
                            h.status === "completed" ? "text-emerald-400"
                              : h.status === "failed" ? "text-rose-400"
                              : h.status === "running" ? "text-amber-400"
                              : "text-white/55"
                          }`}>
                            {h.status}
                          </span>
                        </div>
                        <div className="text-[12.5px] font-medium text-white/90 line-clamp-2 leading-snug">
                          {h.one_liner ?? h.topic ?? (h.mode === "build" ? "(no packets)" : "(no verdict)")}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
        </>
        )}
      </div>
    </div>
  );
}

// ── Helper components ───────────────────────────────────────────────

function Avatar({ agent, size = "sm" }: { agent: AgentName; size?: "xs" | "sm" | "md" }) {
  const meta = AGENTS[agent];
  const hue = HUES[meta.hue];
  const dim = size === "xs" ? "w-5 h-5 text-[9px]" : size === "md" ? "w-9 h-9 text-sm" : "w-7 h-7 text-[11px]";
  return (
    <div className={`${dim} rounded-full ${hue.avatar} ring-1 flex items-center justify-center font-semibold flex-shrink-0`}>
      {meta.avatar}
    </div>
  );
}

function MessageGroup({ group, showTypingTail }: { group: { sender: AgentName; events: CouncilEvent[] }; showTypingTail: boolean }) {
  const meta = AGENTS[group.sender];

  // Orchestrator → centered system-style line, like iMessage system messages
  if (group.sender === "orchestrator") {
    return (
      <div className="text-center my-3 space-y-0.5">
        {group.events.map((e) => (
          <div key={e.seq} className="text-[10.5px] uppercase tracking-wider text-white/40">
            {e.phase === "error" ? "⚠ " : "· "}
            {e.message}
          </div>
        ))}
      </div>
    );
  }

  const hue = HUES[meta.hue];
  // Filter out pure "thinking" lines if a "speaking" line follows in same group
  // — they're noisy. But keep the FIRST one if it's the only message so far.
  const visible = collapseThinking(group.events);

  return (
    <div className="flex items-end gap-2 mt-3 first:mt-0">
      <Avatar agent={group.sender} />
      <div className="min-w-0 max-w-[85%]">
        <div className="flex items-baseline gap-2 mb-1.5 px-1">
          <span className="text-[12.5px] font-bold text-white">{meta.label}</span>
          <span className="text-[11px] font-medium text-white/55">{meta.model}</span>
          <span className="text-[11px] text-white/40">· {meta.role}</span>
          <span className="ml-auto text-[11px] text-white/40 tabular-nums">
            {visible[visible.length - 1]?.t.toFixed(1)}s
          </span>
        </div>
        <div className="space-y-1">
          {visible.map((e, i) => {
            const isFirst = i === 0;
            const isLast = i === visible.length - 1;
            // iMessage corner-rounding: pinch the corner closest to neighbour
            const radius =
              isFirst && isLast ? "rounded-2xl"
                : isFirst ? "rounded-2xl rounded-bl-md"
                : isLast ? "rounded-2xl rounded-tl-md"
                : "rounded-2xl rounded-l-md";
            const isThinking = e.phase === "thinking";
            const isError = e.phase === "error";
            return (
              <div
                key={e.seq}
                className={`${radius} border px-3.5 py-2.5 ${hue.bubble} ${
                  isThinking ? "italic opacity-70" : ""
                } ${isError ? "border-rose-500/60" : ""}`}
              >
                <p className="text-[14px] font-medium leading-relaxed whitespace-pre-wrap">
                  {e.message}
                </p>
              </div>
            );
          })}
          {showTypingTail && <TypingDots agent={group.sender} compact />}
        </div>
      </div>
    </div>
  );
}

function TypingDots({ agent, compact = false }: { agent: AgentName; compact?: boolean }) {
  const meta = AGENTS[agent];
  const hue = HUES[meta.hue];
  return (
    <div
      className={`inline-flex items-center gap-1 ${hue.bubble} border rounded-2xl rounded-tl-md ${
        compact ? "px-3 py-2" : "px-3 py-2"
      }`}
      aria-label={`${meta.label} is typing`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
    </div>
  );
}

function Section({ title, tone, children }: { title: string; tone: "emerald" | "indigo" | "rose" | "amber"; children: React.ReactNode }) {
  const color =
    tone === "emerald" ? "text-emerald-400"
      : tone === "indigo" ? "text-indigo-400"
      : tone === "rose" ? "text-rose-400"
      : "text-amber-400";
  return (
    <div className="mt-4 first:mt-0">
      <div className={`text-[11px] font-bold uppercase tracking-wider mb-1.5 ${color}`}>{title}</div>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────

function EmptyState({ mode }: { mode: CouncilMode }) {
  if (mode === "build") {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8 max-w-md mx-auto">
        <div className="flex -space-x-2 mb-5">
          {(["researcher", "listing_writer", "pricer", "qa"] as const).map((a) => (
            <Avatar key={a} agent={a} size="md" />
          ))}
        </div>
        <h3 className="text-lg font-bold mb-2">Production crew, on standby</h3>
        <p className="text-[13px] font-medium text-white/75 mb-5 leading-relaxed">
          Pick a niche, set how many packets you need, and press <span className="text-white font-bold">Build</span>.
          The crew reads your DB, picks differentiated subjects, and writes complete Etsy-ready packets — title,
          description, 13 tags, smart price. You review, then click <span className="text-white font-bold">Send to Studio</span> on the ones you like.
        </p>
        <div className="w-full space-y-2 text-left">
          <Step n={1} agent="researcher" what="picks N subjects with differentiating angles from your DB" />
          <Step n={2} agent="listing_writer" what="writes full Etsy listings — title, description, 13 tags" />
          <Step n={3} agent="pricer" what="smart-prices each packet from competitor data" />
          <Step n={4} agent="qa" what="validates packets and flags any tool friction" />
        </div>
        <p className="text-[10.5px] text-[var(--text-muted)]/80 mt-5 leading-relaxed">
          Cost: ~3–6¢ per run on paid tiers (per packet).
          Nothing auto-lists — Send to Studio is your explicit click.
        </p>
      </div>
    );
  }
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8 max-w-md mx-auto">
      <div className="flex -space-x-2 mb-5">
        {(["scout", "strategist", "critic", "ux_observer", "synthesizer"] as const).map((a) => (
          <Avatar key={a} agent={a} size="md" />
        ))}
      </div>
      <h3 className="text-lg font-bold mb-2">Five agents waiting on you</h3>
      <p className="text-[13px] font-medium text-white/75 mb-5 leading-relaxed">
        This dashboard is on-demand — agents only run when you ask, because each session reads fresh
        signal from your DB and asks the LLMs to reason about it. Pressing <span className="text-white font-bold">Start</span>
        {" "}kicks off one round (~30–60s).
      </p>
      <div className="w-full space-y-2 text-left">
        <Step n={1} agent="scout" what="reads your live_sales, tracked listings, and idea funnel" />
        <Step n={2} agent="strategist" what="proposes 3–5 concrete next moves" />
        <Step n={3} agent="critic" what="attacks each proposal and finds weaknesses" />
        <Step n={4} agent="ux_observer" what="checks if your tool itself is leaking time" />
        <Step n={5} agent="synthesizer" what="merges everything into a Now / Later / Don't plan" />
      </div>
      <p className="text-[10.5px] text-[var(--text-muted)]/80 mt-5 leading-relaxed">
        Cost: ~1–2¢ per run on the paid tiers, $0 on Gemini&apos;s free tier.
        Nothing auto-lists, nothing changes your code.
      </p>
    </div>
  );
}

// ── Mode toggle button ──────────────────────────────────────────────

function ModeButton({
  active, onClick, disabled, label, sub,
}: {
  active: boolean; onClick: () => void; disabled: boolean; label: string; sub: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-xl text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        active
          ? "bg-indigo-600/20 ring-1 ring-indigo-400/40 text-white"
          : "hover:bg-white/[0.04] text-white/80"
      }`}
    >
      <div className="text-[13px] font-bold leading-tight">{label}</div>
      <div className="text-[10.5px] font-medium text-white/55 leading-tight">{sub}</div>
    </button>
  );
}

// ── Packet card ─────────────────────────────────────────────────────

function PacketCard({
  packet, sending, sentIdeaId, onSend,
}: {
  packet: BuildPacket; sending: boolean; sentIdeaId: number | null; onSend: () => void;
}) {
  const titleLen = packet.title.length;
  const titleOver = titleLen > 140;
  const tagsOver = packet.tags.length !== 13;
  const tagTooLong = packet.tags.find((t) => t.length > 20);
  const cx = packet.qa.passes ? "border-emerald-500/25" : "border-amber-500/30";

  return (
    <div className={`bg-white/[0.02] border ${cx} rounded-xl p-3.5`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-200 border border-indigo-500/30">
            Packet {packet.index}
          </span>
          <span className="text-[11px] font-medium text-white/55">{packet.product_type}</span>
        </div>
        <span className="text-[14px] font-bold text-emerald-300 tabular-nums">${packet.price.toFixed(2)}</span>
      </div>

      {/* Title */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">Title</span>
          <span className={`text-[10px] font-bold tabular-nums ${titleOver ? "text-rose-300" : "text-white/40"}`}>{titleLen}/140</span>
        </div>
        <p className="text-[13px] font-semibold text-white leading-snug">{packet.title}</p>
      </div>

      {/* Subject + Angle */}
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-white/45 mb-0.5">Subject</div>
          <div className="text-[12px] font-medium text-white/90">{packet.subject}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-white/45 mb-0.5">Angle</div>
          <div className="text-[12px] font-medium text-white/85 line-clamp-2">{packet.angle}</div>
        </div>
      </div>

      {/* Tags */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">Tags</span>
          <span className={`text-[10px] font-bold tabular-nums ${tagsOver ? "text-rose-300" : "text-white/40"}`}>
            {packet.tags.length}/13{tagTooLong ? ` · "${tagTooLong}" >20ch` : ""}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {packet.tags.map((t, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-[10.5px] font-medium text-white/80">
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Description preview */}
      <details className="mb-2 group">
        <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-white/45 hover:text-white/70 select-none">
          Description preview ▸
        </summary>
        <p className="mt-1.5 text-[12px] font-medium text-white/85 leading-relaxed whitespace-pre-wrap line-clamp-[10]">
          {packet.description}
        </p>
      </details>

      {/* Pricing rationale */}
      <div className="mb-2 text-[11px] font-medium text-white/60 leading-snug">
        <span className="text-white/45">Price · </span>{packet.pricing_rationale}
      </div>

      {/* QA flags */}
      {packet.qa.issues.length > 0 && (
        <div className="mb-2 rounded-lg bg-amber-500/[0.08] border border-amber-500/30 px-2.5 py-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300 mb-0.5">QA flags</div>
          <ul className="space-y-0.5">
            {packet.qa.issues.map((i, ix) => (
              <li key={ix} className="text-[11.5px] font-medium text-amber-100/90 leading-snug">• {i}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Send to studio */}
      <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-white/[0.06]">
        <span className="text-[11px] font-medium text-white/50">
          Demand {packet.signal.demand_score}/100 · comp {packet.signal.competition_level ?? "?"}
        </span>
        {sentIdeaId ? (
          <a
            href={packet.niche.toLowerCase().includes("cross") ? `/cross-stitch?ideaId=${sentIdeaId}` : `/research?ideaId=${sentIdeaId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 rounded-lg text-[11.5px] font-bold text-emerald-200 flex items-center gap-1.5"
          >
            ✓ Sent · open studio
            <span aria-hidden>↗</span>
          </a>
        ) : (
          <button
            onClick={onSend}
            disabled={sending}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-[11.5px] font-bold text-white disabled:opacity-60 flex items-center gap-1.5"
          >
            {sending ? "Sending…" : "Send to Studio"}
            {!sending && <span aria-hidden>→</span>}
          </button>
        )}
      </div>
    </div>
  );
}

function Step({ n, agent, what }: { n: number; agent: AgentName; what: string }) {
  const meta = AGENTS[agent];
  return (
    <div className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2.5">
      <span className="text-[11px] text-white/50 font-mono font-semibold tabular-nums w-4">{n}</span>
      <Avatar agent={agent} size="xs" />
      <span className="text-[13px] font-semibold text-white">{meta.label}</span>
      <span className="text-[12px] font-medium text-white/65">{what}</span>
    </div>
  );
}

function ReportEmpty({ mode }: { mode: CouncilMode }) {
  if (mode === "build") {
    return (
      <div className="text-[13px] font-medium text-white/70 leading-relaxed space-y-3">
        <p>
          After the build crew finishes, this panel shows a <span className="text-white font-semibold">plain-English summary</span>
          {" "}— what the Researcher picked, how many packets the Listing Writer drafted, what the Pricer set, and what the QA agent flagged.
        </p>
        <p className="text-white/55">
          Press <span className="text-white font-semibold">Build packets</span> above to begin.
        </p>
      </div>
    );
  }
  return (
    <div className="text-[13px] font-medium text-white/70 leading-relaxed space-y-3">
      <p>
        After the council finishes, this panel shows a <span className="text-white font-semibold">plain-English summary</span>
        {" "}— what data Scout pulled, what each agent argued, and what the Synthesizer decided.
      </p>
      <p className="text-white/55">
        Press <span className="text-white font-semibold">Start debate</span> above to begin.
      </p>
    </div>
  );
}

// ── Helpers (pure) ──────────────────────────────────────────────────

function groupConsecutive(events: CouncilEvent[]): { sender: AgentName; events: CouncilEvent[] }[] {
  const groups: { sender: AgentName; events: CouncilEvent[] }[] = [];
  for (const ev of events) {
    const last = groups[groups.length - 1];
    if (last && last.sender === ev.agent) {
      last.events.push(ev);
    } else {
      groups.push({ sender: ev.agent, events: [ev] });
    }
  }
  return groups;
}

// If a group has both a "thinking" event AND a "speaking" event from the
// same agent, drop the thinking line — it's noise once the real content
// arrives. Keep "thinking" only when nothing else has come in yet.
function collapseThinking(events: CouncilEvent[]): CouncilEvent[] {
  const hasNonThinking = events.some((e) => e.phase !== "thinking");
  if (!hasNonThinking) return events;
  return events.filter((e) => e.phase !== "thinking");
}

// ── Plain-English report builder ────────────────────────────────────

interface ReportData {
  headline: string;
  paragraphs: string[];
}

function buildReport(
  events: CouncilEvent[],
  verdict: CouncilVerdict | null,
  build: BuildResult | null,
  mode: CouncilMode,
): ReportData | null {
  if (events.length === 0) return null;

  // Find each agent's "done" event so we can pull their .data payload
  const lastByAgent = (agent: AgentName) =>
    [...events].reverse().find((e) => e.agent === agent && (e.phase === "done" || e.phase === "finished"));

  const totalDuration = events.length > 0 ? events[events.length - 1].t : 0;
  const orchestratorStart = events.find((e) => e.agent === "orchestrator" && e.phase === "started");

  const paragraphs: string[] = [];
  // 1. Setup line — same for both modes
  const setup = orchestratorStart?.message ?? "Council ran.";
  const finished = mode === "build" ? !!build : !!verdict;
  paragraphs.push(setup + (finished ? ` Total time: ${totalDuration.toFixed(1)}s.` : " (still running…)"));

  if (mode === "build") {
    // Build-mode report
    const researcherDone = lastByAgent("researcher");
    const writerDone = lastByAgent("listing_writer");
    const qaDone = lastByAgent("qa");

    type ResearchPayload = { research?: { candidates?: unknown[] }; brief?: { recentSales?: unknown[]; topTracked?: unknown[] } };
    type WriterPayload = unknown[]; // BuildPacket[]
    type QAPayload = { packets_review?: { passes: boolean }[]; tool_friction?: unknown[] };

    const rdata = (researcherDone?.data ?? null) as ResearchPayload | null;
    const wdata = (writerDone?.data ?? null) as WriterPayload | null;
    const qdata = (qaDone?.data ?? null) as QAPayload | null;

    if (rdata) {
      const candCount = rdata.research?.candidates?.length ?? 0;
      const sales = rdata.brief?.recentSales?.length ?? 0;
      const tracked = rdata.brief?.topTracked?.length ?? 0;
      paragraphs.push(
        `Researcher scanned your DB (${sales} recent sale${sales === 1 ? "" : "s"}, ${tracked} sustained seller${tracked === 1 ? "" : "s"}) and locked in ${candCount} packet candidate${candCount === 1 ? "" : "s"}.`,
      );
    }

    if (wdata && Array.isArray(wdata)) {
      paragraphs.push(`Listing Writer drafted ${wdata.length} full Etsy packet${wdata.length === 1 ? "" : "s"} — title + 3-paragraph description + 13 tags each.`);
    }

    if (build) {
      const prices = build.packets.map((p) => p.price);
      const minP = prices.length ? Math.min(...prices).toFixed(2) : "—";
      const maxP = prices.length ? Math.max(...prices).toFixed(2) : "—";
      paragraphs.push(`Pricer set per-packet prices ranging $${minP}–$${maxP} based on competitor data.`);
    }

    if (qdata) {
      const passing = qdata.packets_review?.filter((r) => r.passes).length ?? 0;
      const total = qdata.packets_review?.length ?? 0;
      const friction = qdata.tool_friction?.length ?? 0;
      let line = `QA validated ${passing}/${total} packet${total === 1 ? "" : "s"} as ready to ship`;
      if (friction > 0) line += `; flagged ${friction} tool friction item${friction === 1 ? "" : "s"} for your triage`;
      line += ".";
      paragraphs.push(line);
    }

    if (build) {
      paragraphs.push(`Bottom line: "${build.one_liner}" Click Send to Studio on the packets you want to publish.`);
    } else if (events.some((e) => e.phase === "error")) {
      paragraphs.push("The build crew didn't finish — see error above.");
    }

    const headline = build
      ? `${totalDuration.toFixed(1)}s · ${build.packets.length} packet${build.packets.length === 1 ? "" : "s"}`
      : `${totalDuration.toFixed(1)}s · in progress`;
    return { headline, paragraphs };
  }

  // Debate-mode report (original)
  const scoutDone = lastByAgent("scout");
  const stratDone = lastByAgent("strategist");
  const critDone = lastByAgent("critic");
  const uxDone = lastByAgent("ux_observer");

  type ScoutBrief = {
    recentSales?: unknown[];
    topTracked?: unknown[];
    topCategories?: unknown[];
    recentIdeas?: unknown[];
    ideaFunnel?: { status: string; count: number }[];
  };
  type StratPayload = { takeaway?: string; moves?: { title: string }[] };
  type CritPayload = { attacks?: { severity: string }[]; missing_angles?: string[] };
  type UXPayload = { funnel_read?: string; tool_suggestions?: { severity: string }[] };

  const brief = (scoutDone?.data ?? null) as ScoutBrief | null;
  const strat = (stratDone?.data ?? null) as StratPayload | null;
  const crit = (critDone?.data ?? null) as CritPayload | null;
  const ux = (uxDone?.data ?? null) as UXPayload | null;

  if (brief) {
    const sales = brief.recentSales?.length ?? 0;
    const tracked = brief.topTracked?.length ?? 0;
    const cats = brief.topCategories?.length ?? 0;
    const ideas = brief.recentIdeas?.length ?? 0;
    const funnel = (brief.ideaFunnel ?? []).map((f) => `${f.status}=${f.count}`).join(", ") || "empty";
    paragraphs.push(
      `Scout pulled ${sales} recent sale${sales === 1 ? "" : "s"}, ${tracked} sustained seller${tracked === 1 ? "" : "s"}, ${cats} hot categor${cats === 1 ? "y" : "ies"}, and ${ideas} recent idea${ideas === 1 ? "" : "s"}. Funnel: ${funnel}.`,
    );
  }

  if (strat) {
    const moveCount = strat.moves?.length ?? 0;
    const takeaway = strat.takeaway ? `Their headline read: "${strat.takeaway}"` : "";
    paragraphs.push(`Strategist proposed ${moveCount} move${moveCount === 1 ? "" : "s"}. ${takeaway}`.trim());
  }

  if (crit) {
    const attackCount = crit.attacks?.length ?? 0;
    const high = crit.attacks?.filter((a) => a.severity === "high").length ?? 0;
    const angles = crit.missing_angles?.length ?? 0;
    let line = `Critic raised ${attackCount} attack${attackCount === 1 ? "" : "s"}`;
    if (high > 0) line += ` (${high} marked high-severity)`;
    line += ` and flagged ${angles} missing angle${angles === 1 ? "" : "s"}.`;
    paragraphs.push(line);
  }

  if (ux) {
    const sugCount = ux.tool_suggestions?.length ?? 0;
    const read = ux.funnel_read ?? "";
    let line = "UX Observer read your funnel.";
    if (read) line = `UX Observer's read: "${read}"`;
    if (sugCount > 0) line += ` They queued ${sugCount} tool suggestion${sugCount === 1 ? "" : "s"} for your triage.`;
    paragraphs.push(line);
  }

  if (verdict) {
    const nowCount = verdict.now?.length ?? 0;
    const laterCount = verdict.later?.length ?? 0;
    const dontCount = verdict.dont?.length ?? 0;
    paragraphs.push(
      `Synthesizer's call: ${nowCount} thing${nowCount === 1 ? "" : "s"} to do now, ${laterCount} for later, ${dontCount} to skip. Bottom line: "${verdict.one_liner}"`,
    );
  } else if (events.some((e) => e.phase === "error")) {
    paragraphs.push("The council didn't reach a verdict — see error above.");
  }

  const headline = verdict
    ? `${totalDuration.toFixed(1)}s · verdict ready`
    : `${totalDuration.toFixed(1)}s · in progress`;

  return { headline, paragraphs };
}
