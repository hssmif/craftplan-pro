// Centralized wrapper around OpenAI's image-edits endpoint
// (https://api.openai.com/v1/images/edits).
//
// Why this file exists:
//   Before this helper, five different routes each hardcoded the model
//   string ("gpt-image-1") and the fetch/FormData plumbing. Rolling a
//   model bump meant editing five files and reviewing five diffs. Every
//   caller had slightly different error-surface behavior — some passed
//   through the upstream HTTP status, some swallowed it as 500.
//
//   Now: the model is one constant. Swap IMAGE_MODEL and every caller
//   picks it up. Error surface is uniform (OpenAIImageError carries
//   the upstream status so 429 / Tier-1 rate-limit responses survive
//   the round-trip to the browser).
//
// Migration log:
//   2026-04-22 — introduced. IMAGE_MODEL set to gpt-image-2 (released
//                2026-04-21 by OpenAI; drop-in replacement for
//                gpt-image-1 — same endpoint, same request shape, same
//                quality + size enum).
//                Rollout is phased: render-preview first, then the
//                remaining four routes once output is eyeballed.

const OPENAI_EDITS_URL = "https://api.openai.com/v1/images/edits";
const OPENAI_GENERATIONS_URL = "https://api.openai.com/v1/images/generations";

/**
 * The single source of truth for which OpenAI image model every route
 * uses. Change this one string to bump every caller.
 *
 * Known values:
 *   - "gpt-image-1"           (legacy — still callable, no gating)
 *   - "gpt-image-2"           (current — released 2026-04-21; requires a
 *                              one-time OpenAI organization verification.
 *                              This codebase verified + activated on
 *                              2026-04-22 after user submitted ID at
 *                              https://platform.openai.com/settings/organization/general.)
 *   - "gpt-image-2-2026-04-21" (pinned snapshot of gpt-image-2)
 *
 * The A/B buttons on the cross-stitch listing-preview UI can still
 * explicitly force "gpt-image-1" via the per-request `model` override,
 * so flipping this default doesn't lose the rollback path.
 */
export const IMAGE_MODEL = "gpt-image-2";

export type ImageQuality = "low" | "medium" | "high" | "auto";
export type ImageSize =
  | "1024x1024"
  | "1024x1536"
  | "1536x1024"
  | "auto";

export interface EditImageArgs {
  /**
   * One buffer for single-image edits, or multiple for multi-input
   * composites (e.g. frame + pattern for wall-art/gpt-composite).
   */
  images: Array<{
    buffer: Buffer;
    /** Defaults to "image/png". */
    mimeType?: string;
    /** Defaults to "image_{i}.{ext}"; shown in OpenAI dashboard logs. */
    filename?: string;
  }>;
  prompt: string;
  /** Defaults to "medium" — same as the most common historical caller. */
  quality?: ImageQuality;
  /** Defaults to "1024x1024". */
  size?: ImageSize;
  /** AbortSignal timeout. Defaults to 120_000 ms (2 min). */
  timeoutMs?: number;
  /** Short tag used in server logs, e.g. "render-preview". */
  caller?: string;
  /**
   * Per-request model override. Lets callers A/B between models without
   * touching the global IMAGE_MODEL constant. If omitted, the global
   * default applies. Example: the cross-stitch listing-preview UI has
   * two buttons ("gpt-image-1", "gpt-image-2") that pass this field.
   */
  model?: string;
}

export interface EditImageResult {
  /** "data:image/png;base64,..." */
  dataUrl: string;
  /** Echoes IMAGE_MODEL so callers can surface the active model to the UI. */
  model: string;
}

/**
 * Thrown on any non-2xx OpenAI response or missing-image payload.
 * `status` mirrors the upstream HTTP code so route handlers can
 * passthrough 429 (rate limit), 400 (bad request), etc. directly to
 * the browser instead of collapsing everything to 500.
 */
export class OpenAIImageError extends Error {
  readonly status: number;
  readonly model: string;
  constructor(message: string, status: number, model: string) {
    super(message);
    this.name = "OpenAIImageError";
    this.status = status;
    this.model = model;
  }
}

/** Status codes that are worth retrying — transient upstream issues.
 *  - 500/502/503/504  — origin or gateway failure
 *  - 520-524          — Cloudflare-edge "origin error" family
 *  - 429              — rate-limited
 *  Everything else (4xx auth/validation, anything < 500 except 429)
 *  is deterministic and won't recover from a retry. */
function isTransient(status: number): boolean {
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}

/** Run a fetch+parse function with retry-on-transient.  Up to 3 tries
 *  total with exponential backoff (5 s, 15 s).  Re-throws the LAST
 *  error if all tries fail.  Non-transient errors throw immediately. */
async function withTransientRetry<T>(
  task: () => Promise<T>,
  caller: string,
): Promise<T> {
  const delays = [5_000, 15_000]; // gap BEFORE try #2 and #3
  for (let attempt = 0; attempt < delays.length + 1; attempt++) {
    try {
      return await task();
    } catch (err) {
      const isRetryable =
        err instanceof OpenAIImageError && isTransient(err.status);
      const isLastAttempt = attempt === delays.length;
      if (!isRetryable || isLastAttempt) throw err;
      const wait = delays[attempt];
      console.warn(
        `${caller} transient ${(err as OpenAIImageError).status} on attempt ${attempt + 1} — retrying in ${wait}ms`,
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  // Unreachable — the loop either returns or throws.
  throw new Error("unreachable");
}

/**
 * POST to OpenAI's image-edits endpoint. Returns a base64 data URL.
 *
 * Throws:
 *   - Error("OPENAI_API_KEY not configured") if the env var is missing
 *     (status 500-ish — caller decides).
 *   - OpenAIImageError(msg, status, model) for upstream failures; the
 *     `status` field lets callers mirror the HTTP code in their response.
 */
export async function editImage(
  args: EditImageArgs
): Promise<EditImageResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  if (!args.images || args.images.length === 0) {
    throw new Error("editImage requires at least one image");
  }

  const form = new FormData();

  // Field-name convention:
  //   - Single image → "image"   (OpenAI's original single-file shape)
  //   - Multiple imgs → "image[]" (multi-input shape)
  //
  // Both are accepted by OpenAI's edits endpoint; we pick per-count to
  // minimize behavioral drift vs the pre-helper call sites, which all
  // used one or the other based on whether they sent 1 or 2 files.
  const fieldName = args.images.length > 1 ? "image[]" : "image";

  for (let i = 0; i < args.images.length; i++) {
    const img = args.images[i];
    const mime = img.mimeType || "image/png";
    const ext = mime.includes("png")
      ? "png"
      : mime.includes("webp")
        ? "webp"
        : "jpg";
    const filename = img.filename || `image_${i}.${ext}`;
    const blob = new Blob([new Uint8Array(img.buffer)], { type: mime });
    form.append(fieldName, blob, filename);
  }

  const modelToUse = args.model || IMAGE_MODEL;
  form.append("model", modelToUse);
  form.append("prompt", args.prompt);
  form.append("n", "1");
  form.append("size", args.size || "1024x1024");
  form.append("quality", args.quality || "medium");

  const timeoutMs = args.timeoutMs ?? 120_000;
  const tag = args.caller ? `[${args.caller}]` : "[editImage]";

  // Retry-on-transient wrapper.  Cloudflare 520/524 and OpenAI 5xx
  // happen unpredictably — without retry, one blip during a 5-item
  // auto-pipeline run becomes 1 lost item and ~$0.36 wasted.  Up to
  // 3 attempts, 5 s + 15 s backoff.  4xx (auth/validation) still
  // throws on the first attempt.
  return withTransientRetry(async () => {
    const resp = await fetch(OPENAI_EDITS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error(
        `${tag} OpenAI ${modelToUse} ${resp.status}:`,
        errText.substring(0, 600)
      );
      throw new OpenAIImageError(
        `${modelToUse} ${resp.status}: ${errText.substring(0, 400) || "request failed"}`,
        resp.status,
        modelToUse
      );
    }

    const data = await resp.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      throw new OpenAIImageError(
        `${modelToUse} returned no image data`,
        502,
        modelToUse
      );
    }

    return {
      dataUrl: `data:image/png;base64,${b64}`,
      model: modelToUse,
    };
  }, tag);
}

/* ─────────────────────────────────────────────────────────────
 * generateImage — text-to-image variant of editImage.
 *
 * editImage() hits /v1/images/edits, which REQUIRES at least one
 * input image to transform. For the cross-stitch Design tab we
 * need to render a fresh image from pure text (user's description
 * + style preset) — that's the /v1/images/generations endpoint.
 * Same request shape otherwise, same b64 response, same error
 * semantics (OpenAIImageError preserves upstream status).
 *
 * Using JSON body instead of multipart because there's no file to
 * upload. Simpler on both sides.
 * ───────────────────────────────────────────────────────────── */
export interface GenerateImageArgs {
  prompt: string;
  /** Defaults to "medium". */
  quality?: ImageQuality;
  /** Defaults to "1024x1024". */
  size?: ImageSize;
  /** AbortSignal timeout. Defaults to 120_000 ms (2 min). */
  timeoutMs?: number;
  /** Short tag used in server logs. */
  caller?: string;
  /** Per-request model override. */
  model?: string;
}

export async function generateImage(
  args: GenerateImageArgs,
): Promise<EditImageResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  if (!args.prompt || !args.prompt.trim()) {
    throw new Error("generateImage requires a prompt");
  }

  const modelToUse = args.model || IMAGE_MODEL;
  const timeoutMs = args.timeoutMs ?? 120_000;
  const tag = args.caller ? `[${args.caller}]` : "[generateImage]";

  const body = {
    model: modelToUse,
    prompt: args.prompt,
    n: 1,
    size: args.size || "1024x1024",
    quality: args.quality || "medium",
  };

  // Retry-on-transient — same rationale as editImage above.
  return withTransientRetry(async () => {
    const resp = await fetch(OPENAI_GENERATIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error(
        `${tag} OpenAI ${modelToUse} ${resp.status}:`,
        errText.substring(0, 600),
      );
      throw new OpenAIImageError(
        `${modelToUse} ${resp.status}: ${errText.substring(0, 400) || "request failed"}`,
        resp.status,
        modelToUse,
      );
    }

    const data = await resp.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      throw new OpenAIImageError(
        `${modelToUse} returned no image data`,
        502,
        modelToUse,
      );
    }

    return {
      dataUrl: `data:image/png;base64,${b64}`,
      model: modelToUse,
    };
  }, tag);
}
