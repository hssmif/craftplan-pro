// Minimal Replicate client — we only need to POST a prediction, poll for
// completion, and fetch the output image. Kept as a tiny helper rather
// than pulling in the full `replicate` npm package.
//
// Env var: REPLICATE_API_TOKEN (paid account, ~$0.0011/upscale run).

const REPLICATE_API = "https://api.replicate.com/v1/predictions";

export type PredictionInput = Record<string, unknown>;

/** Generic: returns the full prediction object so callers can pull
 *  arbitrary fields (e.g. SAM returns masks, not a single image URL). */
export async function runReplicateRaw(
  modelVersion: string,
  input: PredictionInput,
  opts: { pollIntervalMs?: number; maxWaitMs?: number } = {}
): Promise<{ output: unknown; status: string }> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN not configured");

  const pollIntervalMs = opts.pollIntervalMs ?? 1500;
  const maxWaitMs = opts.maxWaitMs ?? 120_000;

  const startResp = await fetch(REPLICATE_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait=60",
    },
    body: JSON.stringify({ version: modelVersion, input }),
  });

  if (!startResp.ok) {
    const txt = await startResp.text().catch(() => "");
    throw new Error(`Replicate start ${startResp.status}: ${txt.slice(0, 300)}`);
  }

  let prediction = await startResp.json();
  const deadline = Date.now() + maxWaitMs;

  while (
    prediction.status !== "succeeded" &&
    prediction.status !== "failed" &&
    prediction.status !== "canceled"
  ) {
    if (Date.now() > deadline) throw new Error("Replicate prediction timed out");
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const pollResp = await fetch(prediction.urls.get, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!pollResp.ok) throw new Error(`Replicate poll ${pollResp.status}`);
    prediction = await pollResp.json();
  }

  if (prediction.status !== "succeeded") {
    throw new Error(
      `Replicate ${prediction.status}: ${prediction.error ?? "unknown"}`
    );
  }

  return { output: prediction.output, status: prediction.status };
}

/** Run a Replicate model and return the first output URL (most image
 *  models return a string URL or an array of URLs). */
export async function runReplicate(
  modelVersion: string,
  input: PredictionInput,
  opts: { pollIntervalMs?: number; maxWaitMs?: number } = {}
): Promise<string> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN not configured");

  const pollIntervalMs = opts.pollIntervalMs ?? 1500;
  const maxWaitMs = opts.maxWaitMs ?? 120_000;

  // Kick off prediction with Prefer: wait so for fast models we get the
  // result inline and skip polling entirely.
  const startResp = await fetch(REPLICATE_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait=60",
    },
    body: JSON.stringify({ version: modelVersion, input }),
  });

  if (!startResp.ok) {
    const txt = await startResp.text().catch(() => "");
    throw new Error(`Replicate start ${startResp.status}: ${txt.slice(0, 300)}`);
  }

  let prediction = await startResp.json();
  const deadline = Date.now() + maxWaitMs;

  while (
    prediction.status !== "succeeded" &&
    prediction.status !== "failed" &&
    prediction.status !== "canceled"
  ) {
    if (Date.now() > deadline) throw new Error("Replicate prediction timed out");
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const pollResp = await fetch(prediction.urls.get, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!pollResp.ok) {
      throw new Error(`Replicate poll ${pollResp.status}`);
    }
    prediction = await pollResp.json();
  }

  if (prediction.status !== "succeeded") {
    throw new Error(
      `Replicate ${prediction.status}: ${prediction.error ?? "unknown"}`
    );
  }

  const out = prediction.output;
  if (typeof out === "string") return out;
  if (Array.isArray(out) && typeof out[0] === "string") return out[0];
  throw new Error("Replicate returned unexpected output shape");
}

// --- Model presets -----------------------------------------------------

/** Real-ESRGAN — detail-reconstructing image upscaler. ~$0.0011/run.
 *  Much better for print-size outputs than a plain Sharp resize. */
export const REAL_ESRGAN_VERSION =
  "f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa";

/** Run Real-ESRGAN on a base64 data URI. Returns the upscaled image URL. */
export async function upscaleWithRealEsrgan(
  imageDataUri: string,
  scale: 2 | 4 = 4,
  faceEnhance = false
): Promise<string> {
  return runReplicate(REAL_ESRGAN_VERSION, {
    image: imageDataUri,
    scale,
    face_enhance: faceEnhance,
  });
}

/** Segment the fabric opening inside a frame using SAM with a center
 *  point prompt. Returns bbox of the mask as normalized [0-1] coords,
 *  or null if SAM isn't configured / the mask is implausible.
 *
 *  Set REPLICATE_SAM_VERSION to the Replicate version hash of the SAM
 *  (or SAM-2) model you want to use — see replicate.com/meta/sam-2.
 *  If unset, this returns null and the caller falls back to the
 *  built-in ray-casting detector. */
export async function detectFrameOpeningWithSam(
  imageDataUri: string
): Promise<{ left: number; top: number; right: number; bottom: number } | null> {
  // SAM with point prompt at center. The point = (w/2, h/2).
  // Returns an array of masks; we take the one covering our point.
  // Using `yyjim/segment-anything-everything` or similar.
  //
  // NOTE: Replicate model IDs change. Rather than hard-code a fragile
  // version hash, we let callers pass in the desired model via env
  // REPLICATE_SAM_VERSION. If not set, this function returns null and
  // the caller falls back to ray-casting.
  const version = process.env.REPLICATE_SAM_VERSION;
  if (!version) return null;

  try {
    const { output } = await runReplicateRaw(version, {
      image: imageDataUri,
      point_coords: JSON.stringify([[0.5, 0.5]]), // normalized center
      point_labels: JSON.stringify([1]),
    });

    // Output shape varies by model; we look for a mask URL or mask image.
    // Typical SAM output: { masks: [url, url, ...], scores: [...] }
    let maskUrl: string | null = null;
    if (typeof output === "string") {
      maskUrl = output;
    } else if (Array.isArray(output) && typeof output[0] === "string") {
      maskUrl = output[0];
    } else if (output && typeof output === "object") {
      const obj = output as Record<string, unknown>;
      const masks = obj.masks ?? obj.mask ?? obj.output;
      if (Array.isArray(masks) && typeof masks[0] === "string") {
        maskUrl = masks[0];
      } else if (typeof masks === "string") {
        maskUrl = masks;
      }
    }

    if (!maskUrl) return null;

    // Fetch the mask and find its bbox (white pixels).
    const resp = await fetch(maskUrl);
    if (!resp.ok) return null;
    const maskBuf = Buffer.from(await resp.arrayBuffer());
    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(maskBuf)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height;
    let minX = W, minY = H, maxX = 0, maxY = 0;
    let count = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (data[y * W + x] > 127) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          count++;
        }
      }
    }
    if (count < W * H * 0.02) return null; // too small
    if (count > W * H * 0.9) return null;   // probably grabbed the whole image
    return {
      left: minX / W,
      top: minY / H,
      right: maxX / W,
      bottom: maxY / H,
    };
  } catch (err) {
    console.warn("[replicate/sam] failed:", err);
    return null;
  }
}

// ── Stable Video Diffusion XT ──────────────────────────────────────────────
// Animates a still image into a ~4 second video clip (25 frames @ 6 fps).
// Used by the listing-video-ai route to turn the GPT-image-2 handsStitching
// and lapCozy mockups into real-motion video instead of Ken Burns stills.
// Cost: ~$0.034 / run. Wall-clock: 60–90 s cold, 20–40 s warm.
// Model: stability-ai/stable-video-diffusion (SVD-XT variant)
// Version pinned — update when Replicate ships a newer SVD checkpoint.
export const SVD_XT_VERSION =
  "3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438";

/**
 * Animate a still image into a short MP4 clip using Stable Video Diffusion XT.
 *
 * @param imageDataUri  PNG or JPEG data URI (the GPT-image-2 lifestyle mockup)
 * @param opts.motionBucket  60–80 = gentle hand motion (good for stitching close-ups).
 *                           100–127 = more dramatic motion (lifestyle / room shots).
 * @param opts.fps           Frames per second of the output clip. Default 6.
 * @returns URL of the generated MP4 (hosted on Replicate CDN, valid ~1 h).
 */
export async function animateWithSVD(
  imageDataUri: string,
  opts: { motionBucket?: number; fps?: number } = {}
): Promise<string> {
  return runReplicate(
    SVD_XT_VERSION,
    {
      input_image: imageDataUri,
      video_length: "25_frames_with_svd_xt",
      sizing_strategy: "crop_to_16_9",
      frames_per_second: opts.fps ?? 6,
      motion_bucket_id: opts.motionBucket ?? 70,
      cond_aug: 0.02,
      decoding_t: 14,
    },
    { maxWaitMs: 180_000, pollIntervalMs: 3_000 }
  );
}
