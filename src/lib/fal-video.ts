// ══════════════════════════════════════════════════════════════
// fal.ai Video Client — Cheap text-to-video for Etsy listing clips
//
// Why this replaces lib/veo.ts as the default:
//   - Veo 3 Fast costs ~$1.20 / 8s. fal.ai's Kling Standard does the
//     same job for ~$0.25 / 5s. For an Etsy seller with dozens of
//     listings the cost delta turns "professional video on every
//     listing" from a $1k bet into a $25 bet.
//   - The codebase already authenticates against fal.ai for the
//     premium-convert image2image flow (see /api/cross-stitch/
//     premium-convert), so the FAL_KEY is wired and battle-tested.
//   - Multiple models with different cost/quality tradeoffs can
//     share one wrapper since fal.ai's queue API is uniform across
//     models. Callers pick a `model` enum value; we route the right
//     endpoint + adapt the response shape.
//
// Architecture:
//   1. POST to https://queue.fal.run/<model> with the prompt + params
//   2. Get back a request_id + status_url + response_url
//   3. Poll status_url every few seconds until status === COMPLETED
//   4. GET response_url for the final payload (video URL)
//   5. Download the video bytes and save to disk
//
// Why save server-side instead of returning the fal.ai URL directly:
//   fal.ai URLs expire (~24h) and the seller may want to keep the
//   MP4 around for re-use across listings. We save under /tmp and
//   serve via /api/strategist/serve-video so the seller has a stable
//   URL for the session.

import { mkdir, writeFile } from "fs/promises";
import path from "path";

/** Models we support. Each entry maps to a fal.ai endpoint slug.
 *  Cheap → Premium, in cost order. The default (kling-1.6-standard)
 *  is the sweet spot for product hand-stitching footage: strong hand
 *  rendering at ~$0.25/5s. */
export type FalVideoModel =
  | "wan-2.2-5b"            // cheapest, ~$0.05/5s — for bulk first-tests
  | "kling-1.6-standard"    // default, ~$0.25/5s — strong hands
  | "kling-2-master"        // premium, ~$1.40/5s — Veo-tier hero listings
  // Image-to-video variants — same price/timeout as their t2v counterparts.
  // Callers normally don't pick these directly: pass `imageUrl` to
  // generateFalVideo() on a t2v model and it auto-routes here.
  | "kling-1.6-standard-i2v"
  | "kling-2-master-i2v";

/** Aspect ratios fal.ai's video models accept. Most models support
 *  all three; "9:16" is what we default to since vertical reads as
 *  Reels/TikTok-native and Etsy autoplay carousel handles both. */
export type FalAspectRatio = "9:16" | "16:9" | "1:1";

/** Cost-per-clip estimates in USD. Used by the UI to show the
 *  seller a price tag before they click Generate. These are
 *  approximate — real billing comes through on the fal.ai dashboard
 *  — but they're within 10% of actual based on our usage. */
export const FAL_VIDEO_COST_USD: Record<FalVideoModel, number> = {
  "wan-2.2-5b": 0.05,
  "kling-1.6-standard": 0.25,
  "kling-2-master": 1.4,
  "kling-1.6-standard-i2v": 0.25,
  "kling-2-master-i2v": 1.4,
};

/** Human-readable labels for the model picker. */
export const FAL_VIDEO_LABELS: Record<FalVideoModel, string> = {
  "wan-2.2-5b": "Wan 2.2 5B (cheapest)",
  "kling-1.6-standard": "Kling 1.6 Standard (default)",
  "kling-2-master": "Kling 2 Master (premium)",
  "kling-1.6-standard-i2v": "Kling 1.6 Standard — image-to-video",
  "kling-2-master-i2v": "Kling 2 Master — image-to-video",
};

/** Per-model poll timeout in ms — how long to wait before giving up on
 *  a render. Sized to p95 wall-clock observed in production: Wan
 *  finishes in 30-90s normally but tail can hit 150s when fal.ai's
 *  queue is busy; Kling Standard is 60-180s with a 360s tail; Master
 *  is heaviest at 120-240s + queue. The route reads this map and
 *  passes the right budget per request, so a Wan run won't hang for
 *  9 minutes if the prompt is wedged. */
export const FAL_VIDEO_POLL_TIMEOUT_MS: Record<FalVideoModel, number> = {
  "wan-2.2-5b": 240_000,           // 4 min
  "kling-1.6-standard": 420_000,    // 7 min
  "kling-2-master": 600_000,        // 10 min
  "kling-1.6-standard-i2v": 420_000,
  "kling-2-master-i2v": 600_000,
};

/** fal.ai queue endpoint slugs per model. Kept in one place so
 *  bumping a model version is a one-line change. */
const FAL_MODEL_SLUGS: Record<FalVideoModel, string> = {
  "wan-2.2-5b": "fal-ai/wan/v2.2-5b/text-to-video",
  "kling-1.6-standard": "fal-ai/kling-video/v1.6/standard/text-to-video",
  "kling-2-master": "fal-ai/kling-video/v2/master/text-to-video",
  "kling-1.6-standard-i2v": "fal-ai/kling-video/v1.6/standard/image-to-video",
  "kling-2-master-i2v": "fal-ai/kling-video/v2/master/image-to-video",
};

const FAL_QUEUE_BASE = "https://queue.fal.run";

export interface FalVideoOptions {
  prompt: string;
  /** Duration in seconds. fal.ai models accept 5 or 10 for Kling,
   *  4-8 for Wan. We clamp/default per model below. */
  durationSec?: number;
  aspectRatio?: FalAspectRatio;
  model?: FalVideoModel;
  /** Where to save the downloaded MP4. */
  outputPath: string;
  /** If provided, use image-to-video instead of text-to-video.
   *  Must be a publicly accessible URL or fal.ai storage URL.
   *  Kling will animate starting from this image.  When set on a
   *  t2v Kling model ("kling-1.6-standard" / "kling-2-master"),
   *  generateFalVideo() auto-routes to the matching "-i2v" endpoint
   *  so callers don't have to pick the i2v slug manually. */
  imageUrl?: string;
  /** Total wall-clock budget. Defaults to 300s — fal.ai usually
   *  finishes Kling Standard in 60-180s, Wan in 30-90s, Master in
   *  120-240s. */
  pollTimeoutMs?: number;
  pollIntervalMs?: number;
  onProgress?: (elapsedMs: number, status?: string) => void;
}

export interface FalVideoResult {
  videoPath: string;
  fileSizeBytes: number;
  durationSec: number;
  aspectRatio: FalAspectRatio;
  model: FalVideoModel;
  elapsedMs: number;
  /** What we actually paid (estimate). Logged so callers can show
   *  it back to the seller after the run. */
  estimatedCostUsd: number;
}

export class FalVideoError extends Error {
  override name = "FalVideoError";
  constructor(
    message: string,
    public readonly code:
      | "missing_key"
      | "permission_denied"
      | "quota"
      | "invalid_prompt"
      | "timeout"
      | "api_error"
      | "no_video_returned",
  ) {
    super(message);
  }
}

interface QueueSubmitResponse {
  request_id?: string;
  status_url?: string;
  response_url?: string;
  cancel_url?: string;
  // Errors come back as { detail: "..." } or { error: "..." } — both observed
  detail?: string;
  error?: string;
}

interface QueueStatusResponse {
  status?: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";
  logs?: Array<{ message?: string }>;
  detail?: string;
  error?: string;
}

interface VideoResultResponse {
  // Different models return slightly different shapes — accept all.
  video?: { url?: string; content_type?: string };
  output?: { url?: string };
  videos?: Array<{ url?: string }>;
  detail?: string;
  error?: string;
}

/** Build the request body for a given model. fal.ai's models share
 *  most params (prompt, aspect_ratio) but diverge on duration/length
 *  field names — Kling uses `duration` as a string ("5" or "10"),
 *  Wan uses `num_frames` based on FPS. This helper keeps that mess
 *  in one place. */
function buildModelBody(
  model: FalVideoModel,
  prompt: string,
  durationSec: number,
  aspectRatio: FalAspectRatio,
  imageUrl?: string,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    prompt,
    aspect_ratio: aspectRatio,
  };
  // i2v models require an `image_url` field; t2v models ignore it
  // (passing it doesn't error, but adds noise to the body — only
  // include when we actually have one).
  if (imageUrl) {
    base.image_url = imageUrl;
  }
  switch (model) {
    case "kling-1.6-standard":
    case "kling-2-master":
    case "kling-1.6-standard-i2v":
    case "kling-2-master-i2v": {
      // Kling accepts "5" or "10" only. Anything else → snap to nearest.
      const snap = durationSec >= 8 ? "10" : "5";
      return { ...base, duration: snap };
    }
    case "wan-2.2-5b": {
      // Wan accepts num_frames (16fps default). 4s = 64 frames, 5s = 80.
      // We expose seconds in the public API and translate here.
      const frames = Math.max(48, Math.min(96, Math.round(durationSec * 16)));
      return { ...base, num_frames: frames };
    }
  }
}

/** Snap requested seconds to what each model actually delivers. The
 *  UI shows the snapped value back to the user so they're not
 *  surprised when an "8s" request returns a 10s clip. */
export function actualDurationSec(model: FalVideoModel, requested: number): number {
  if (model === "wan-2.2-5b") {
    return Math.max(3, Math.min(6, Math.round(requested)));
  }
  // Kling: 5s or 10s
  return requested >= 8 ? 10 : 5;
}

export async function generateFalVideo(opts: FalVideoOptions): Promise<FalVideoResult> {
  const apiKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (!apiKey) {
    throw new FalVideoError(
      "FAL_KEY is not set. Add it to .env.local (already used by /api/cross-stitch/premium-convert).",
      "missing_key",
    );
  }

  const requestedModel = opts.model ?? "kling-1.6-standard";
  // Auto-switch t2v Kling models to their i2v variant when the caller
  // supplies a source image.  Lets the public API stay simple — callers
  // pick "kling-1.6-standard" and pass `imageUrl` and we route to the
  // right endpoint.  If the caller already picked an i2v variant
  // explicitly, leave it alone.  Non-Kling models pass through too;
  // their endpoints don't have an i2v split today.
  const model: FalVideoModel = opts.imageUrl
    ? requestedModel === "kling-1.6-standard"
      ? "kling-1.6-standard-i2v"
      : requestedModel === "kling-2-master"
        ? "kling-2-master-i2v"
        : requestedModel
    : requestedModel;
  const aspectRatio = opts.aspectRatio ?? "9:16";
  const requestedDuration = opts.durationSec ?? 5;
  const durationSec = actualDurationSec(model, requestedDuration);
  const pollTimeoutMs = opts.pollTimeoutMs ?? 300_000;
  const pollIntervalMs = Math.max(opts.pollIntervalMs ?? 4_000, 2_000);

  const slug = FAL_MODEL_SLUGS[model];
  const submitUrl = `${FAL_QUEUE_BASE}/${slug}`;
  const submitBody = buildModelBody(model, opts.prompt, durationSec, aspectRatio, opts.imageUrl);

  const startMs = Date.now();

  // Step 1 — submit to queue
  const submitResp = await fetch(submitUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(submitBody),
  });

  const submitJson = (await submitResp.json().catch(() => ({}))) as QueueSubmitResponse;

  if (!submitResp.ok) {
    const detail = submitJson.detail || submitJson.error || `HTTP ${submitResp.status}`;
    if (submitResp.status === 401 || submitResp.status === 403) {
      throw new FalVideoError(`fal.ai auth failed: ${detail}`, "permission_denied");
    }
    if (submitResp.status === 429) {
      throw new FalVideoError(`fal.ai quota: ${detail}`, "quota");
    }
    if (submitResp.status === 422 || submitResp.status === 400) {
      throw new FalVideoError(`fal.ai rejected the request: ${detail}`, "invalid_prompt");
    }
    throw new FalVideoError(`fal.ai error ${submitResp.status}: ${detail}`, "api_error");
  }

  const statusUrl = submitJson.status_url;
  const responseUrl = submitJson.response_url;
  if (!statusUrl || !responseUrl) {
    throw new FalVideoError(
      `fal.ai did not return queue URLs (request_id=${submitJson.request_id ?? "?"})`,
      "api_error",
    );
  }

  // Step 2 — poll
  const deadline = Date.now() + pollTimeoutMs;
  let lastStatus: string | undefined;
  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);
    const statusResp = await fetch(statusUrl, {
      headers: { Authorization: `Key ${apiKey}` },
    });
    const statusJson = (await statusResp.json().catch(() => ({}))) as QueueStatusResponse;
    if (!statusResp.ok) {
      // Don't fail on transient 5xx — keep polling.
      if (statusResp.status >= 500) continue;
      throw new FalVideoError(
        `fal.ai status check failed ${statusResp.status}: ${statusJson.detail ?? statusJson.error ?? ""}`,
        "api_error",
      );
    }
    lastStatus = statusJson.status;
    opts.onProgress?.(Date.now() - startMs, lastStatus);
    if (lastStatus === "COMPLETED") break;
    if (lastStatus === "FAILED" || lastStatus === "CANCELLED") {
      const logTail = (statusJson.logs ?? [])
        .slice(-3)
        .map((l) => l.message)
        .filter(Boolean)
        .join(" | ");
      throw new FalVideoError(
        `fal.ai render ${lastStatus}${logTail ? `: ${logTail}` : ""}`,
        "api_error",
      );
    }
  }

  if (lastStatus !== "COMPLETED") {
    throw new FalVideoError(
      `fal.ai did not finish within ${Math.round(pollTimeoutMs / 1000)}s (last status: ${lastStatus ?? "unknown"})`,
      "timeout",
    );
  }

  // Step 3 — fetch the final result
  const resultResp = await fetch(responseUrl, {
    headers: { Authorization: `Key ${apiKey}` },
  });
  const resultJson = (await resultResp.json().catch(() => ({}))) as VideoResultResponse;
  if (!resultResp.ok) {
    throw new FalVideoError(
      `fal.ai result fetch failed ${resultResp.status}: ${resultJson.detail ?? resultJson.error ?? ""}`,
      "api_error",
    );
  }

  // Different models return different shapes; accept any.
  const videoUrl =
    resultJson.video?.url ??
    resultJson.output?.url ??
    resultJson.videos?.[0]?.url;
  if (!videoUrl) {
    throw new FalVideoError(
      `fal.ai completed but returned no video URL. Keys: ${Object.keys(resultJson).join(", ")}`,
      "no_video_returned",
    );
  }

  // Step 4 — download bytes (fal.ai URLs are public + tokenless,
  // unlike Veo's which need API key in the query)
  const dlResp = await fetch(videoUrl);
  if (!dlResp.ok) {
    throw new FalVideoError(
      `Failed to download MP4 from fal.ai CDN: ${dlResp.status}`,
      "api_error",
    );
  }
  const buf = Buffer.from(await dlResp.arrayBuffer());

  // Step 5 — persist
  await mkdir(path.dirname(opts.outputPath), { recursive: true });
  await writeFile(opts.outputPath, buf);

  return {
    videoPath: opts.outputPath,
    fileSizeBytes: buf.length,
    durationSec,
    aspectRatio,
    model,
    elapsedMs: Date.now() - startMs,
    estimatedCostUsd: FAL_VIDEO_COST_USD[model],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
