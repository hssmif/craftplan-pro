// ─────────────────────────────────────────────────────────────────
// Server-side auto-pipeline jobs — per user 2026-05-16, the cross-
// stitch auto-pipeline must survive page refresh, navigation, tab
// close, and even closing the laptop.  The orchestrator now runs
// server-side as a fire-and-forget async function; this module is
// the thin DB layer that owns job state.
//
// Why SQLite (not Redis / Postgres):
//   - This app already runs better-sqlite3 in `src/lib/db.ts`
//   - User runs the app locally — long-lived Node process, no
//     serverless cold-start to worry about
//   - One file (data/products.db) ships with the rest of the app
// ─────────────────────────────────────────────────────────────────
import { getDb } from "./db";
import type { AutoPipelineItem } from "./auto-pipeline-types";

export type JobStatus = "queued" | "running" | "completed" | "cancelled" | "failed";

export interface AutoPipelineJob {
  id: string;
  status: JobStatus;
  style: string | null;
  requestedCount: number;
  items: AutoPipelineItem[];
  costUsdSpent: number;
  currentStage: string | null;
  cancelRequested: boolean;
  error: string | null;
  startedAt: number;
  updatedAt: number;
  completedAt: number | null;
}

interface Row {
  id: string;
  status: JobStatus;
  style: string | null;
  requested_count: number;
  items_json: string;
  cost_usd_spent: number;
  current_stage: string | null;
  cancel_requested: number;
  error: string | null;
  started_at: number;
  updated_at: number;
  completed_at: number | null;
}

function rowToJob(row: Row): AutoPipelineJob {
  let items: AutoPipelineItem[] = [];
  try {
    items = JSON.parse(row.items_json) as AutoPipelineItem[];
  } catch {
    items = [];
  }
  return {
    id: row.id,
    status: row.status,
    style: row.style,
    requestedCount: row.requested_count,
    items,
    costUsdSpent: row.cost_usd_spent,
    currentStage: row.current_stage,
    cancelRequested: !!row.cancel_requested,
    error: row.error,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

/** Create a new job in 'queued' state.  Caller is responsible for
 *  spawning the orchestrator afterwards. */
export function createJob(opts: {
  style?: string | null;
  requestedCount: number;
}): AutoPipelineJob {
  const db = getDb();
  const id = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  db.prepare(
    `INSERT INTO auto_pipeline_jobs
       (id, status, style, requested_count, items_json, cost_usd_spent,
        current_stage, cancel_requested, started_at, updated_at)
     VALUES (?, 'queued', ?, ?, '[]', 0, NULL, 0, ?, ?)`
  ).run(id, opts.style ?? null, opts.requestedCount, now, now);
  return getJob(id)!;
}

export function getJob(id: string): AutoPipelineJob | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM auto_pipeline_jobs WHERE id = ?`)
    .get(id) as Row | undefined;
  return row ? rowToJob(row) : null;
}

export function listRecentJobs(limit = 50): AutoPipelineJob[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM auto_pipeline_jobs ORDER BY started_at DESC LIMIT ?`)
    .all(limit) as Row[];
  return rows.map(rowToJob);
}

/** Returns the most-recent active or recently-completed job so the
 *  client can rehydrate UI state without a job_id.  "Recent" =
 *  started_at within the last 24h, regardless of status. */
export function getMostRecentJob(): AutoPipelineJob | null {
  const db = getDb();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const row = db
    .prepare(
      `SELECT * FROM auto_pipeline_jobs
       WHERE started_at > ?
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get(cutoff) as Row | undefined;
  return row ? rowToJob(row) : null;
}

interface UpdateOptions {
  status?: JobStatus;
  items?: AutoPipelineItem[];
  costUsdDelta?: number;        // additive
  costUsdAbsolute?: number;     // set if provided
  currentStage?: string | null;
  error?: string | null;
  markCompleted?: boolean;
}

export function updateJob(id: string, opts: UpdateOptions): void {
  const db = getDb();
  const now = Date.now();
  const sets: string[] = ["updated_at = ?"];
  const params: (string | number | null)[] = [now];

  if (opts.status !== undefined) {
    sets.push("status = ?");
    params.push(opts.status);
  }
  if (opts.items !== undefined) {
    sets.push("items_json = ?");
    params.push(JSON.stringify(opts.items));
  }
  if (opts.costUsdAbsolute !== undefined) {
    sets.push("cost_usd_spent = ?");
    params.push(opts.costUsdAbsolute);
  } else if (opts.costUsdDelta !== undefined && opts.costUsdDelta !== 0) {
    sets.push("cost_usd_spent = cost_usd_spent + ?");
    params.push(opts.costUsdDelta);
  }
  if (opts.currentStage !== undefined) {
    sets.push("current_stage = ?");
    params.push(opts.currentStage);
  }
  if (opts.error !== undefined) {
    sets.push("error = ?");
    params.push(opts.error);
  }
  if (opts.markCompleted) {
    sets.push("completed_at = ?");
    params.push(now);
  }

  params.push(id);
  db.prepare(`UPDATE auto_pipeline_jobs SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

export function requestCancel(id: string): boolean {
  const db = getDb();
  const r = db
    .prepare(
      `UPDATE auto_pipeline_jobs
       SET cancel_requested = 1, updated_at = ?
       WHERE id = ? AND status IN ('queued', 'running')`,
    )
    .run(Date.now(), id);
  return r.changes > 0;
}

export function isCancelRequested(id: string): boolean {
  const db = getDb();
  const row = db
    .prepare(`SELECT cancel_requested FROM auto_pipeline_jobs WHERE id = ?`)
    .get(id) as { cancel_requested: number } | undefined;
  return !!row?.cancel_requested;
}

export function deleteJob(id: string): boolean {
  const db = getDb();
  const r = db.prepare(`DELETE FROM auto_pipeline_jobs WHERE id = ?`).run(id);
  return r.changes > 0;
}

/** Drop jobs older than N hours.  Called opportunistically when the
 *  recent-job lookup runs, so the table doesn't grow forever. */
/** Read-modify-write patch for one item inside a job's items array.
 *  Used by the orchestrator (during a live run) and by the retry-copy
 *  endpoint (after-the-fact correction).  Idempotent — patch fields
 *  override existing ones; un-patched fields are preserved. */
export function patchItem(
  jobId: string,
  itemId: string,
  patch: Partial<AutoPipelineItem>,
): boolean {
  const job = getJob(jobId);
  if (!job) return false;
  const items = job.items.map((i) =>
    String(i.id) === String(itemId) ? { ...i, ...patch } : i,
  );
  updateJob(jobId, { items });
  return true;
}

export function pruneOldJobs(olderThanHours = 72): number {
  const db = getDb();
  const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;
  const r = db
    .prepare(`DELETE FROM auto_pipeline_jobs WHERE started_at < ?`)
    .run(cutoff);
  return r.changes;
}

// ─────────────────────────────────────────────────────────────────
// Slim serialization — used by GET endpoints to keep the polling
// payload tiny.  Before this helper existed, /api/cross-stitch/pipeline/[id]
// returned ~100 MB every 2 s once 5 items each carried mockups + video
// + pattern grid, which OOM'd the browser tab (Chrome STATUS_OUT_OF_MEMORY,
// "Aw, Snap! Error code: 5") within seconds of the dev server starting.
//
// Slim mode keeps:
//   - status / progress flags (status, error, hasPdf, hasVideo)
//   - text-only listing copy (title, description, tags, price, attributes)
//   - mockup metadata (scene names only — dataUrl stripped)
//   - timestamps + ids
//
// Slim mode strips (~95 MB worth of base64):
//   - mockups[].dataUrl   (~11 MB/item — biggest offender)
//   - videoB64            (~5 MB/item)
//   - patternFull         (~2 MB/item — grid arrays + DMC keys)
//   - imageUrl, cleanImageUrl (each ~1.4 MB/item — data URLs)
//   - pdfBundleB64        (~600 KB/item)
//
// The client merges slim updates into existing state — heavy fields
// stay populated from the initial full fetch.
// ─────────────────────────────────────────────────────────────────
export function slimJob(job: AutoPipelineJob): AutoPipelineJob {
  return {
    ...job,
    items: job.items.map((it) => ({
      id: it.id,
      title: it.title,
      ideaId: it.ideaId,
      status: it.status,
      patternStats: it.patternStats,
      hasPdf: it.hasPdf,
      hasVideo: it.hasVideo,
      // hasImage: explicit boolean OR inferred from imageUrl presence
      // (back-compat for items persisted before the flag was added).
      hasImage: it.hasImage || !!it.imageUrl,
      listingCopy: it.listingCopy,
      etsyListingId: it.etsyListingId,
      error: it.error,
      publishProgress: it.publishProgress,
      startedAt: it.startedAt,
      completedAt: it.completedAt,
      // Mockup metadata only — scene name preserved so UI knows
      // mockups exist without shipping the 11 MB of base64. Keep an
      // explicit hasDataUrl flag so the client does not render src="".
      mockups: it.mockups?.map((m) => ({
        scene: m.scene,
        dataUrl: "",
        hasDataUrl: !!m.dataUrl,
      })),
      // Pattern indicator only (UI uses this to flip the ✓chart badge).
      patternFull: it.patternFull
        ? ({
            width: it.patternFull.width,
            height: it.patternFull.height,
            totalStitches: it.patternFull.totalStitches,
            grid: [],
            colors: [],
            backgroundDmc: it.patternFull.backgroundDmc,
          } as AutoPipelineItem["patternFull"])
        : undefined,
    })),
  };
}
