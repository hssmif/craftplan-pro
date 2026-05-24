// fal.ai Clarity Upscaler — AI-based high-fidelity upscale for 300 DPI print.
//
// Cost: ~$0.035/image. Noticeably sharper than sharp.lanczos3 for illustrated
// artwork — preserves edges, adds fine detail, avoids the soft-blur typical
// of bicubic/lanczos. Used as pipeline step 1 to bring Flux 1.1 Pro Ultra
// output (2048²) up to ~7200² for 24x36" prints at 300 DPI.
//
// Endpoint: https://fal.run/fal-ai/clarity-upscaler
// Returns: { image: { url, content_type, width, height } }
//
// Falls back to sharp lanczos3 if FAL_KEY is missing, the API fails, or the
// image is already large enough.

import sharp from "sharp";

const FAL_CLARITY_URL = "https://fal.run/fal-ai/clarity-upscaler";

export interface UpscaleOptions {
  targetDim?: number;     // max output dimension (default 7200)
  creativity?: number;    // 0 = faithful, 1 = creative. Default 0.2 (preserve art).
  resemblance?: number;   // how closely to match source. Default 0.8.
}

async function tryFalClarity(
  apiKey: string,
  imageBuffer: Buffer,
  mimeType: string,
  scale: number,
  opts: UpscaleOptions
): Promise<Buffer | null> {
  try {
    const dataUrl = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
    const body = {
      image_url: dataUrl,
      upscale_factor: Math.max(1, Math.min(4, Math.round(scale))),
      creativity: opts.creativity ?? 0.2,
      resemblance: opts.resemblance ?? 0.8,
      guidance_scale: 4,
      num_inference_steps: 18,
      enable_safety_checker: false,
    };

    const resp = await fetch(FAL_CLARITY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000), // clarity can take 60-120s
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error(`[clarity-upscaler] ${resp.status}: ${errText.slice(0, 300)}`);
      return null;
    }

    const data = await resp.json();
    const imageUrl: string | undefined = data?.image?.url;
    if (!imageUrl) {
      console.error("[clarity-upscaler] no image.url in response");
      return null;
    }

    const imgResp = await fetch(imageUrl, { signal: AbortSignal.timeout(60000) });
    if (!imgResp.ok) {
      console.error(`[clarity-upscaler] image download ${imgResp.status}`);
      return null;
    }
    const ab = await imgResp.arrayBuffer();
    if (ab.byteLength < 5000) {
      console.error(`[clarity-upscaler] response too small (${ab.byteLength} bytes)`);
      return null;
    }
    return Buffer.from(ab);
  } catch (err) {
    console.error("[clarity-upscaler] error:", err);
    return null;
  }
}

// Smart upscale:
//  1. If already ≥ targetDim on any axis → no-op (just rewrite with 300 DPI metadata).
//  2. Else if FAL_KEY is set → clarity-upscaler (AI, best quality).
//  3. Else → sharp lanczos3 (fast, reasonable).
//
// Always outputs PNG with density=300 metadata.
export async function upscaleForPrint(
  imageBuffer: Buffer,
  opts: UpscaleOptions = {}
): Promise<{ buffer: Buffer; method: string; width: number; height: number }> {
  const targetDim = opts.targetDim ?? 7200;
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  const mimeType = meta.format === "jpeg" ? "image/jpeg" : "image/png";

  // Already big enough — just rewrite with 300 DPI metadata
  if (w >= targetDim || h >= targetDim) {
    const out = await sharp(imageBuffer)
      .png({ quality: 100 })
      .withMetadata({ density: 300 })
      .toBuffer();
    const outMeta = await sharp(out).metadata();
    return { buffer: out, method: "no-op (already large)", width: outMeta.width || w, height: outMeta.height || h };
  }

  const scaleNeeded = targetDim / Math.max(w, h, 1);
  const falKey = process.env.FAL_KEY;

  // fal.ai Clarity Upscaler — AI-based, best quality
  if (falKey && scaleNeeded > 1.2) {
    const scale = Math.min(4, Math.max(2, Math.ceil(scaleNeeded)));
    console.log(`[upscale] Trying fal.ai Clarity Upscaler (${scale}x)...`);
    const upscaled = await tryFalClarity(falKey, imageBuffer, mimeType, scale, opts);
    if (upscaled) {
      // Downsize slightly if it over-shot past target, and stamp 300 DPI.
      const up = await sharp(upscaled)
        .resize(targetDim, targetDim, { fit: "inside", kernel: sharp.kernel.lanczos3 })
        .png({ quality: 100 })
        .withMetadata({ density: 300 })
        .toBuffer();
      const upMeta = await sharp(up).metadata();
      return { buffer: up, method: "fal-clarity", width: upMeta.width || 0, height: upMeta.height || 0 };
    }
    console.warn("[upscale] Clarity failed — falling back to sharp lanczos3");
  }

  // Fallback: sharp lanczos3
  const out = await sharp(imageBuffer)
    .resize(targetDim, targetDim, { fit: "inside", kernel: sharp.kernel.lanczos3 })
    .png({ quality: 100 })
    .withMetadata({ density: 300 })
    .toBuffer();
  const outMeta = await sharp(out).metadata();
  return { buffer: out, method: "sharp-lanczos3", width: outMeta.width || 0, height: outMeta.height || 0 };
}
