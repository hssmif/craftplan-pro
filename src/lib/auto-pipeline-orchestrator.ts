// ─────────────────────────────────────────────────────────────────
// Server-side auto-pipeline orchestrator — runs the full
// ideas → image → chart → PDF → mockups → video → copy chain in
// a fire-and-forget async loop after the POST /start handler
// returns.  Per user 2026-05-16: pipeline must survive refresh,
// navigation, tab close, laptop close.
//
// Each stage:
//   - Reads current items from the DB job row (server-side source of truth)
//   - Calls the appropriate internal API route via fetch to localhost
//   - Writes incremental updates back to the DB
//   - Checks cancel_requested between every item
//
// Errors on a single item are non-fatal — they get logged into the
// item.error field and the loop continues with the next item.
// ─────────────────────────────────────────────────────────────────
import {
  createJob,
  getJob,
  updateJob,
  isCancelRequested,
  patchItem,
  type AutoPipelineJob,
} from "./auto-pipeline-jobs";
import type { AutoPipelineItem } from "./auto-pipeline-types";
import { filterOutOwnDuplicates } from "./own-shop-dedupe";

// Self-call base — orchestrator hits our own Next.js routes for each
// stage.  Read from env so prod / dev variants stay portable.  Port
// 3461 is the user's dev default (see package.json dev:next script).
function baseUrl(): string {
  return process.env.PIPELINE_INTERNAL_BASE_URL || "http://localhost:3461";
}

// ─── Per-route cost tags (mirror client constants) ───────────────
// Used to bump cost_usd_spent on the job row so the dashboard shows
// real-time spend.  Values mirror src/lib/openai-cost-tracker.ts.
const COST_GEN_USD = 0.042;
const COST_FLATTEN_USD = 0.042;
const COST_MOCKUPS_USD = 0.28;

const activeRunners = new Set<string>();

interface Idea { id: string; title: string }

/** Raw idea fetch — talks to whichever upstream endpoint matches the
 *  style.  No dedupe applied at this layer; that happens in
 *  fetchIdeas() below so it can over-fetch when dupes are dropped. */
async function fetchIdeasRaw(count: number, style: string | null): Promise<Idea[]> {
  // 2026-05-19 — "bestseller_*" styles route to a new data-driven
  // endpoint that mines tracked_listings for real Etsy bestsellers
  // and asks Gemini to RIFF on them (vs. the original endpoint which
  // generates from a static formula list).
  if (style && style.startsWith("bestseller")) {
    const innerStyle = style === "bestseller" ? "all" : style.slice("bestseller_".length);
    const r = await fetch(`${baseUrl()}/api/cross-stitch/bestseller-ideas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count, style: innerStyle }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`Bestseller idea fetch HTTP ${r.status}: ${txt.slice(0, 200)}`);
    }
    const d = (await r.json()) as { ideas?: Array<{ id?: string; title?: string }> };
    return (d.ideas || [])
      .slice(0, count)
      .map((idea) => ({
        id: idea.id || `bs_${Math.random().toString(36).slice(2, 10)}`,
        title: String(idea.title || "Cross Stitch Pattern"),
      }));
  }

  const r = await fetch(`${baseUrl()}/api/research/ideas/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count, focus: "cross-stitch", ...(style ? { style } : {}) }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Idea fetch HTTP ${r.status}: ${txt.slice(0, 200)}`);
  }
  const d = (await r.json()) as { ideas?: Array<{ id?: string; title?: string }> };
  return (d.ideas || [])
    .slice(0, count)
    .map((idea) => ({
      id: idea.id || `i_${Math.random().toString(36).slice(2, 10)}`,
      title: String(idea.title || "Cross Stitch Pattern"),
    }));
}

/** Fetch + own-shop dedupe.  Per 2026-05-19 user directive: never
 *  regenerate an idea the user has already listed (or has sitting in
 *  drafts) on their own Etsy shop — each duplicate would cost ~$0.36
 *  in image/mockup spend AND hurt SEO via duplicate content.
 *
 *  Strategy: over-fetch up to 2x to absorb expected dupe rate, then
 *  filter against own-shop titles, then top up via one extra round
 *  if still short.  Worst case = 1 extra Gemini call. */
async function fetchIdeas(count: number, style: string | null): Promise<Idea[]> {
  // Round 1: ask for ~1.5x the requested count to absorb dupes
  // without a second LLM call in the common case.
  const overFetch = Math.min(count + Math.ceil(count * 0.5), 20);
  const round1 = await fetchIdeasRaw(overFetch, style);
  const filtered1 = await filterOutOwnDuplicates(round1);
  if (filtered1.droppedTitles.length > 0) {
    console.log(`[orchestrator] dedupe dropped ${filtered1.droppedTitles.length} own-shop duplicate idea(s):`);
    filtered1.droppedTitles.slice(0, 5).forEach((t) => console.log(`  ↳ ${t}`));
  }
  if (filtered1.kept.length >= count) {
    return filtered1.kept.slice(0, count);
  }

  // Round 2: still short after dedupe — top up with one more pass.
  // Track titles we already kept so the second round can't re-emit them.
  const need = count - filtered1.kept.length;
  console.log(`[orchestrator] dedupe left only ${filtered1.kept.length}/${count} — fetching ${need} more`);
  let round2: Idea[] = [];
  try {
    round2 = await fetchIdeasRaw(need * 2, style);
  } catch (err) {
    console.warn(`[orchestrator] round-2 dedupe fetch failed: ${(err as Error).message}`);
  }
  const filtered2 = await filterOutOwnDuplicates(round2);
  const keptTitles = new Set(filtered1.kept.map((i) => i.title.toLowerCase()));
  for (const i of filtered2.kept) {
    if (filtered1.kept.length >= count) break;
    if (!keptTitles.has(i.title.toLowerCase())) {
      filtered1.kept.push(i);
      keptTitles.add(i.title.toLowerCase());
    }
  }
  return filtered1.kept.slice(0, count);
}

// patchItem moved to lib/auto-pipeline-jobs.ts (exported so the
// retry-copy endpoint can use it too).  Imported below.

async function stage1A_genAndFlatten(jobId: string, item: AutoPipelineItem): Promise<void> {
  // Idempotency — skip if we already have both outputs (resume after refresh).
  if (item.imageUrl && item.cleanImageUrl) return;

  patchItem(jobId, item.id, { status: "generating", startedAt: Date.now(), error: undefined });

  // Gen step.
  let generated = item.imageUrl;
  if (!generated) {
    const r = await fetch(`${baseUrl()}/api/cross-stitch/generate-design`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: item.title, style: "nala-beginner", engine: "gpt-image-2" }),
      signal: AbortSignal.timeout(180_000),
    });
    const d = await r.json() as { dataUrl?: string; error?: string };
    if (!r.ok || !d?.dataUrl) throw new Error(d?.error || `Generate HTTP ${r.status}`);
    generated = d.dataUrl;
    // hasImage is the slim-mode shadow flag — see types.  Set it
    // alongside imageUrl so the ✓gen badge lights up under polling.
    patchItem(jobId, item.id, { imageUrl: generated, hasImage: true });
    updateJob(jobId, { costUsdDelta: COST_GEN_USD });
  }

  // Flatten step.
  const r2 = await fetch(`${baseUrl()}/api/cross-stitch/flatten-for-convert`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: generated }),
    signal: AbortSignal.timeout(120_000),
  });
  const d2 = await r2.json() as { flattenedImage?: string };
  const cleanImage = r2.ok && d2?.flattenedImage ? d2.flattenedImage : generated;
  patchItem(jobId, item.id, { cleanImageUrl: cleanImage });
  if (r2.ok) updateJob(jobId, { costUsdDelta: COST_FLATTEN_USD });
}

async function stage1B_pythonConvert(jobId: string, item: AutoPipelineItem): Promise<void> {
  if (item.patternFull) return; // already converted
  if (!item.cleanImageUrl) return; // can't convert without flatten output

  patchItem(jobId, item.id, { status: "converting" });
  const r = await fetch(`${baseUrl()}/api/cross-stitch/python-convert`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      image: item.cleanImageUrl,
      gridSize: 142,
      maxColors: 18,
      mergeDE: 12.0,
      sourceMode: "photo",
      patternName: item.title.replace(/cross stitch pattern/gi, "").trim(),
      forceSquare: true,
    }),
  });
  const d = await r.json() as {
    error?: string;
    grid?: string[][];
    colors?: AutoPipelineItem["patternFull"] extends infer T ? T extends { colors: infer C } ? C : never : never;
    width?: number;
    height?: number;
    totalStitches?: number;
    backgroundDmc?: string;
    totalCells?: number;
    stitchedCells?: number;
    backgroundRemovedCells?: number;
    patternPdfB64?: string;
  };
  if (!r.ok) throw new Error(d?.error || `Convert HTTP ${r.status}`);
  patchItem(jobId, item.id, {
    patternStats: {
      width: d.width!,
      height: d.height!,
      colors: (d.colors as unknown as unknown[])?.length ?? 0,
      totalStitches: d.totalStitches!,
    },
    patternFull: {
      grid: d.grid!,
      colors: (d.colors ?? []) as never,
      width: d.width!,
      height: d.height!,
      totalStitches: d.totalStitches!,
      backgroundDmc: d.backgroundDmc,
      totalCells: d.totalCells,
      stitchedCells: d.stitchedCells,
      backgroundRemovedCells: d.backgroundRemovedCells,
      patternPdfB64: d.patternPdfB64,
    },
  });
}

async function stage1C_pdfBundle(jobId: string, item: AutoPipelineItem): Promise<void> {
  if (item.hasPdf) return;
  if (!item.patternFull) return;
  patchItem(jobId, item.id, { status: "exporting" });
  const r = await fetch(`${baseUrl()}/api/cross-stitch/export-pdf`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      pattern: item.patternFull,
      name: item.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60),
      variant: "bundle",
    }),
  });
  patchItem(jobId, item.id, { hasPdf: r.ok });
}

async function stage2A_mockups(jobId: string, item: AutoPipelineItem): Promise<void> {
  if (item.mockups?.some((m) => !!m.dataUrl)) return;
  if (!item.cleanImageUrl) return;
  patchItem(jobId, item.id, { status: "mocking" });
  // 8 min — matches /api/cross-stitch/auto-mockup worst-case (3 passes with
  // 30s + 60s cooldowns when OpenAI is degraded). Previous 240s would abort
  // before pass-3 ran, losing the recovery window.
  const r = await fetch(`${baseUrl()}/api/cross-stitch/auto-mockup`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(480_000),
    body: JSON.stringify({ pattern: item.cleanImageUrl, title: item.title }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error((d as { error?: string }).error || `Mockup HTTP ${r.status}`);
  }
  const d = await r.json() as { images?: Array<{ scene: string; dataUrl?: string }> };
  const mockups = (d.images || [])
    .map((x) => ({ scene: x.scene, dataUrl: x.dataUrl || "", hasDataUrl: !!x.dataUrl }))
    .filter((x) => x.dataUrl.startsWith("data:image/"));
  if (mockups.length === 0) {
    throw new Error("Mockup API returned no renderable images");
  }
  patchItem(jobId, item.id, { mockups });
  updateJob(jobId, { costUsdDelta: COST_MOCKUPS_USD });
}

async function stage2B_video(jobId: string, item: AutoPipelineItem): Promise<void> {
  if (item.hasVideo) return;
  if (!item.patternFull || !item.mockups || item.mockups.length === 0) return;
  const mockups = item.mockups
    .map((m) => m.dataUrl)
    .filter((dataUrl): dataUrl is string => typeof dataUrl === "string" && dataUrl.startsWith("data:image/"));
  if (mockups.length < 2) {
    patchItem(jobId, item.id, { error: "video skipped: mockup image data not loaded" });
    return;
  }
  patchItem(jobId, item.id, { status: "videoing" });
  try {
    const r = await fetch(`${baseUrl()}/api/cross-stitch/listing-video`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(420_000),
      body: JSON.stringify({
        patternName: item.title,
        pattern: {
          grid: item.patternFull.grid,
          colors: item.patternFull.colors,
          width: item.patternFull.width,
          height: item.patternFull.height,
        },
        // No chartImg render available server-side; use clean image as fallback.
        finishedImage: item.cleanImageUrl,
        mockups,
        lifestyleMode: "none",
      }),
    });
    if (r.ok) {
      const d = await r.json() as { video?: string };
      const videoB64 = typeof d?.video === "string" ? (d.video.split(",")[1] || "") : "";
      if (videoB64) {
        patchItem(jobId, item.id, { hasVideo: true, videoB64, error: undefined });
      } else {
        patchItem(jobId, item.id, { error: "video route returned no video data" });
      }
    } else {
      const txt = await r.text().catch(() => "");
      patchItem(jobId, item.id, { error: `video HTTP ${r.status}: ${txt.slice(0, 160)}` });
    }
  } catch (err) {
    console.warn(`[orchestrator] video skipped for ${item.title}:`, (err as Error).message);
    patchItem(jobId, item.id, { error: `video skipped: ${(err as Error).message}` });
  }
}

async function stage3_listingCopy(jobId: string, item: AutoPipelineItem): Promise<void> {
  if (item.listingCopy && (item.listingCopy.tags?.length || 0) > 0) return;
  if (!item.patternFull) return;
  patchItem(jobId, item.id, { status: "writing" });
  try {
    // Cross-stitch listings legitimately take 40–70 s with the 16 K-token
    // cap (long description + FAQ block + tag-validation retry).  Use
    // 120 s so we never silently abort a healthy response.
    const r = await fetch(`${baseUrl()}/api/etsy/generate-listing`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        templateType: "cross_stitch_pattern",
        productFormat: "PDF Pattern",
        features: [item.title],
        niche: "cross-stitch patterns",
        targetAudience: "stitchers, crafters, gift buyers",
        aesthetic: "kawaii cottagecore",
      }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      const msg = `listing copy HTTP ${r.status}: ${txt.slice(0, 200)}`;
      console.warn(`[orchestrator] ${msg} (item: ${item.title})`);
      patchItem(jobId, item.id, { error: msg });
      return;
    }
    {
      const d = await r.json() as {
        listing?: {
          title?: unknown;
          description?: unknown;
          tags?: unknown;
          price?: unknown;
          attributes?: Record<string, unknown>;
        };
      };
      const listing = d.listing || (d as Record<string, unknown>);
      const title = typeof listing.title === "string" ? listing.title : item.title;
      const description = typeof listing.description === "string" ? listing.description : "";
      const tags = Array.isArray(listing.tags) ? (listing.tags as string[]).slice(0, 13) : [];
      // Extract SEO attributes for Etsy publish step (Phase 1 SEO fix).
      const rawAttrs = (listing.attributes ?? {}) as Record<string, unknown>;
      const clean = (v: unknown): string | undefined => {
        if (typeof v !== "string") return undefined;
        const t = v.trim();
        if (!t || t.toLowerCase() === "null" || t.toLowerCase() === "none") return undefined;
        return t;
      };
      const attributes = {
        primaryColor: clean(rawAttrs.primaryColor),
        secondaryColor: clean(rawAttrs.secondaryColor),
        theme: clean(rawAttrs.theme),
        holiday: clean(rawAttrs.holiday),
        occasion: clean(rawAttrs.occasion),
        recipient: clean(rawAttrs.recipient),
      };
      // Hard-lock to $4.34 per user directive.
      patchItem(jobId, item.id, {
        listingCopy: { title, description, tags, price: 4.34, attributes },
      });
    }
  } catch (err) {
    const msg = `listing copy failed: ${(err as Error).message}`;
    console.warn(`[orchestrator] ${msg} (item: ${item.title})`);
    patchItem(jobId, item.id, { error: msg });
  }
}

/** Run the whole pipeline for a job_id.  Designed to be called as
 *  fire-and-forget after the POST /start handler responds. */
export async function runJob(jobId: string): Promise<void> {
  const checkCancel = (): boolean => {
    if (isCancelRequested(jobId)) {
      updateJob(jobId, { status: "cancelled", currentStage: null, markCompleted: true });
      return true;
    }
    return false;
  };

  try {
    const job = getJob(jobId);
    if (!job) return;

    updateJob(jobId, { status: "running", currentStage: "ideas" });

    // ── Fetch ideas if none seeded yet ──
    if (job.items.length === 0) {
      const ideas = await fetchIdeas(job.requestedCount, job.style);
      if (ideas.length === 0) {
        updateJob(jobId, { status: "failed", error: "Gemini returned 0 ideas", markCompleted: true });
        return;
      }
      const seeded: AutoPipelineItem[] = ideas.map((idea) => ({
        id: idea.id,
        title: idea.title,
        ideaId: idea.id,
        status: "queued",
      }));
      updateJob(jobId, { items: seeded });
    }

    // ── Stage 1A — gen + flatten ──
    updateJob(jobId, { currentStage: "1A" });
    for (let i = 0; i < (getJob(jobId)?.items.length || 0); i++) {
      if (checkCancel()) return;
      const item = getJob(jobId)!.items[i];
      try {
        await stage1A_genAndFlatten(jobId, item);
      } catch (err) {
        patchItem(jobId, item.id, { status: "failed", error: (err as Error).message, completedAt: Date.now() });
      }
    }

    if (checkCancel()) return;

    // ── Stage 1B — python convert ──
    updateJob(jobId, { currentStage: "1B" });
    for (let i = 0; i < (getJob(jobId)?.items.length || 0); i++) {
      if (checkCancel()) return;
      const item = getJob(jobId)!.items[i];
      try {
        await stage1B_pythonConvert(jobId, item);
      } catch (err) {
        patchItem(jobId, item.id, { status: "failed", error: (err as Error).message, completedAt: Date.now() });
      }
    }

    if (checkCancel()) return;

    // ── Stage 1C — PDF bundle ──
    updateJob(jobId, { currentStage: "1C" });
    for (let i = 0; i < (getJob(jobId)?.items.length || 0); i++) {
      if (checkCancel()) return;
      const item = getJob(jobId)!.items[i];
      try {
        await stage1C_pdfBundle(jobId, item);
      } catch { /* non-fatal */ }
    }

    if (checkCancel()) return;

    // ── Stage 2A — mockups ──
    updateJob(jobId, { currentStage: "2A" });
    for (let i = 0; i < (getJob(jobId)?.items.length || 0); i++) {
      if (checkCancel()) return;
      const item = getJob(jobId)!.items[i];
      try {
        await stage2A_mockups(jobId, item);
      } catch (err) {
        patchItem(jobId, item.id, { error: `mockups: ${(err as Error).message}` });
      }
    }

    if (checkCancel()) return;

    // ── Stage 2B — listing video ──
    updateJob(jobId, { currentStage: "2B" });
    for (let i = 0; i < (getJob(jobId)?.items.length || 0); i++) {
      if (checkCancel()) return;
      const item = getJob(jobId)!.items[i];
      await stage2B_video(jobId, item);
    }

    if (checkCancel()) return;

    // ── Stage 3 — listing copy ──
    updateJob(jobId, { currentStage: "3" });
    for (let i = 0; i < (getJob(jobId)?.items.length || 0); i++) {
      if (checkCancel()) return;
      const item = getJob(jobId)!.items[i];
      await stage3_listingCopy(jobId, item);
    }

    // ── Stage 4 — mark all items "done", flip job to completed ──
    const finalItems = (getJob(jobId)?.items || []).map((i) => i.patternFull ? { ...i, status: "done" as const, completedAt: i.completedAt || Date.now() } : i);
    updateJob(jobId, {
      items: finalItems,
      status: "completed",
      currentStage: null,
      markCompleted: true,
    });
  } catch (err) {
    console.error("[orchestrator] fatal error:", err);
    updateJob(jobId, {
      status: "failed",
      error: (err as Error).message,
      currentStage: null,
      markCompleted: true,
    });
  }
}

/** Public API: create the job row + kick off the orchestrator in the
 *  background.  Returns the job_id so the caller can return it in the
 *  POST response.  The orchestrator runs after the response is sent. */
export function startJob(opts: {
  style?: string | null;
  requestedCount: number;
}): AutoPipelineJob {
  const job = createJob({
    style: opts.style ?? null,
    requestedCount: opts.requestedCount,
  });
  resumeJob(job.id);
  return job;
}

/** Ensure a queued/running job has a live in-process worker.
 *  This is intentionally idempotent: polling routes can call it after a
 *  dev-server restart and it will either resume the row or no-op if the
 *  current process is already running it. */
export function resumeJob(jobId: string): boolean {
  const job = getJob(jobId);
  if (!job || (job.status !== "queued" && job.status !== "running")) return false;
  if (activeRunners.has(jobId)) return false;
  activeRunners.add(jobId);
  void runJob(jobId).finally(() => {
    activeRunners.delete(jobId);
  });
  return true;
}
