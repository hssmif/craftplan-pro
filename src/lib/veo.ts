// ══════════════════════════════════════════════════════════════
// Veo Client — Google Veo text-to-video via Gemini API
//
// Why this lives in /lib instead of being inline in a route:
//   - Veo is async/long-running. The generation call returns an
//     operation handle; the actual MP4 takes 60-180s to render and
//     requires polling. Wrapping that lifecycle here keeps callers
//     focused on "give me a video for this prompt" instead of
//     hand-rolling polling loops.
//   - The download URI returned by the operation expires (~24h) and
//     requires the API key as auth, so we download the bytes server-
//     side and return a Buffer + saved file path. Callers store the
//     file under /tmp and serve it via a thin Next route.
//
// Cost reminder: Veo 3 Fast is ~$0.15/sec; Veo 3 standard is ~$0.40/sec.
// An 8-second clip on Fast costs about $1.20. The default model is
// veo-3.0-fast-generate-001 — switch to standard only when the seller
// has validated the lifestyle clip lifts conversion.
//
// Access: Veo requires an API key on a paid tier with Veo allow-listed.
// Free-tier keys hit a clear PERMISSION_DENIED — we surface that
// error verbatim so the operator knows to upgrade rather than silently
// burning retries.

import { mkdir, writeFile } from "fs/promises";
import path from "path";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Veo aspect ratios the API accepts. 9:16 = vertical (Reels/TikTok),
 *  16:9 = horizontal (YouTube/listing video), 1:1 = square (Etsy
 *  listing thumbnail / Instagram feed). */
export type VeoAspectRatio = "9:16" | "16:9" | "1:1";

/** Veo model versions. Fast is cheaper + ~30% faster but lower
 *  fidelity; standard is the production-quality model. */
export type VeoModel = "veo-3.0-fast-generate-001" | "veo-3.0-generate-001";

export interface VeoGenerateOptions {
  /** Plain-language description of the video. Veo respects camera
   *  cues ("hands close-up", "tripod static", "natural light"),
   *  motion cues ("slow stitching motion"), and aesthetic cues
   *  ("cozy, warm, documentary-style"). Keep under ~500 chars. */
  prompt: string;
  /** 4–8 seconds is the sweet spot. Veo's max is 8s on Fast as of
   *  2026-04. Longer = more $$$ + more latency. */
  durationSec?: number;
  aspectRatio?: VeoAspectRatio;
  model?: VeoModel;
  /** Where to save the downloaded MP4. Caller is responsible for
   *  mkdir-ing the parent if it doesn't exist (we do it ourselves
   *  defensively). */
  outputPath: string;
  /** How long to wait for the operation to complete. Default 240s.
   *  Veo Fast typically finishes in 60-120s; standard can take 180s+. */
  pollTimeoutMs?: number;
  /** How often to poll. Default 5s. Don't go below 2s — the API
   *  will rate-limit and the polling churn isn't worth it. */
  pollIntervalMs?: number;
  /** Optional progress callback — fired on each successful poll
   *  with the elapsed time. Lets the caller stream "rendering, 47s
   *  elapsed…" updates over SSE so the user knows it's alive. */
  onProgress?: (elapsedMs: number) => void;
}

export interface VeoGenerateResult {
  /** Filesystem path the MP4 was saved to. */
  videoPath: string;
  /** Size in bytes — useful for logging + telemetry. */
  fileSizeBytes: number;
  /** Echoed back so callers can pick the same number when re-running
   *  the same brief without re-typing it. */
  durationSec: number;
  aspectRatio: VeoAspectRatio;
  model: VeoModel;
  /** Total wall-clock time from generate→download in ms. */
  elapsedMs: number;
}

/** Top-level error tag. Callers can `catch` and check `name === "VeoError"`
 *  to give the seller a helpful "your API key doesn't have Veo access"
 *  message instead of a stack trace. */
export class VeoError extends Error {
  override name = "VeoError";
  constructor(
    message: string,
    public readonly code: "permission_denied" | "quota" | "invalid_prompt" | "timeout" | "api_error",
  ) {
    super(message);
  }
}

interface PredictLongRunningResponse {
  name?: string; // operation name on success
  error?: { code: number; message: string; status?: string };
}

interface OperationResponse {
  name: string;
  done?: boolean;
  metadata?: Record<string, unknown>;
  error?: { code: number; message: string };
  response?: {
    "@type"?: string;
    // Veo emits one of these — the field name has shifted between
    // preview revisions, so we accept both.
    generatedVideos?: Array<{ video: { uri?: string; mimeType?: string } }>;
    generateVideoResponse?: {
      generatedSamples?: Array<{ video: { uri?: string; mimeType?: string } }>;
    };
  };
}

/**
 * Generate a video from a text prompt and save the resulting MP4 to
 * disk. Throws VeoError on permission/quota/timeout issues; throws
 * generic Error on unexpected shapes.
 */
export async function generateVeoVideo(opts: VeoGenerateOptions): Promise<VeoGenerateResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new VeoError("GEMINI_API_KEY is not set", "api_error");
  }

  const model = opts.model ?? "veo-3.0-fast-generate-001";
  const durationSec = opts.durationSec ?? 8;
  const aspectRatio = opts.aspectRatio ?? "9:16";
  const pollTimeoutMs = opts.pollTimeoutMs ?? 240_000;
  const pollIntervalMs = Math.max(opts.pollIntervalMs ?? 5_000, 2_000);

  // Step 1 — kick off the long-running operation.
  const generateUrl = `${GEMINI_BASE}/models/${model}:predictLongRunning?key=${apiKey}`;
  const generateBody = {
    instances: [{ prompt: opts.prompt }],
    parameters: {
      numberOfVideos: 1,
      durationSeconds: durationSec,
      aspectRatio,
      // Veo gates "person" generation behind a parameter — without
      // this, prompts that include people (which is exactly our use
      // case) silently render with empty rooms. "allow_all" enables
      // the seller's intended subject (a woman stitching).
      personGeneration: "allow_all",
    },
  };

  const startMs = Date.now();
  const genResp = await fetch(generateUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(generateBody),
  });

  const genJson = (await genResp.json()) as PredictLongRunningResponse;

  if (!genResp.ok || genJson.error) {
    const code = genJson.error?.code ?? genResp.status;
    const status = genJson.error?.status ?? "";
    const message = genJson.error?.message ?? `Veo API returned ${genResp.status}`;
    if (code === 403 || status === "PERMISSION_DENIED") {
      throw new VeoError(
        `Veo access denied. Your GEMINI_API_KEY needs Veo enabled (paid tier, allow-listed). Original: ${message}`,
        "permission_denied",
      );
    }
    if (code === 429 || status === "RESOURCE_EXHAUSTED") {
      throw new VeoError(`Veo quota exhausted: ${message}`, "quota");
    }
    if (code === 400) {
      throw new VeoError(`Veo rejected the prompt: ${message}`, "invalid_prompt");
    }
    throw new VeoError(`Veo error ${code}: ${message}`, "api_error");
  }

  if (!genJson.name) {
    throw new VeoError("Veo did not return an operation handle", "api_error");
  }

  // Step 2 — poll the operation until done or timeout.
  const operationUrl = `${GEMINI_BASE}/${genJson.name}?key=${apiKey}`;
  const deadline = Date.now() + pollTimeoutMs;
  let opJson: OperationResponse | null = null;

  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);
    const opResp = await fetch(operationUrl);
    opJson = (await opResp.json()) as OperationResponse;
    if (opJson.error) {
      throw new VeoError(`Veo operation failed: ${opJson.error.message}`, "api_error");
    }
    opts.onProgress?.(Date.now() - startMs);
    if (opJson.done) break;
  }

  if (!opJson || !opJson.done) {
    throw new VeoError(
      `Veo did not finish within ${Math.round(pollTimeoutMs / 1000)}s — render may still complete; consider raising pollTimeoutMs`,
      "timeout",
    );
  }

  // Step 3 — extract the video URI from whichever schema the
  // current Veo preview is using (the response shape has churned
  // mid-preview; accept both).
  const samples =
    opJson.response?.generatedVideos ??
    opJson.response?.generateVideoResponse?.generatedSamples ??
    [];
  const videoUri = samples[0]?.video?.uri;

  if (!videoUri) {
    throw new VeoError(
      `Veo finished but returned no video URI. Raw response keys: ${Object.keys(opJson.response ?? {}).join(", ")}`,
      "api_error",
    );
  }

  // Step 4 — download the bytes. The URI requires the API key as
  // a query param (the operation's storage is gated by the same
  // key that submitted the request).
  const downloadUrl = videoUri.includes("?") ? `${videoUri}&key=${apiKey}` : `${videoUri}?key=${apiKey}`;
  const dlResp = await fetch(downloadUrl);
  if (!dlResp.ok) {
    throw new VeoError(`Failed to download MP4: ${dlResp.status} ${await dlResp.text().catch(() => "")}`, "api_error");
  }
  const buf = Buffer.from(await dlResp.arrayBuffer());

  // Step 5 — save to disk. Defensive mkdir so callers can pass any
  // path without pre-creating directories.
  await mkdir(path.dirname(opts.outputPath), { recursive: true });
  await writeFile(opts.outputPath, buf);

  return {
    videoPath: opts.outputPath,
    fileSizeBytes: buf.length,
    durationSec,
    aspectRatio,
    model,
    elapsedMs: Date.now() - startMs,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
