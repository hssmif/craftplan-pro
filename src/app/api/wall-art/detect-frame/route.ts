import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { detectFrameOpeningWithSam } from "@/lib/replicate";
import { geminiDetectFrameOpening } from "@/lib/gemini-client";

export const maxDuration = 30;

// Frame-opening detection via ray-casting from the image center.
//
// The frame RIM is always darker than the fabric opening it surrounds
// (wood, metal, resin — all materially darker than cream aida cloth).
// So we:
//   1. Sample the fabric luminance at center.
//   2. Cast rays outward in many angles. For each ray, walk one pixel at
//      a time until we hit a pixel that's significantly DARKER than the
//      fabric by some margin (that's the rim).
//   3. The collection of hit points traces the opening boundary.
//   4. Take the bounding box of those points = opening.
//
// Why this beats flood fill: flood fill leaks through any tiny
// brightness match (weathered planks look like fabric). Ray-casting
// stops at the FIRST dark pixel per ray — it physically cannot leak
// past the rim because it terminates there.
//
// Why this beats ML: free, ~30ms, deterministic, no auth.

type ShapeKind = "circle" | "oval" | "rectangle";
type DetectOut = {
  left: number; top: number; right: number; bottom: number;
  shape: ShapeKind;
  confidence: number;
};

const ANALYSIS_SIZE = 512;
const NUM_RAYS = 72; // every 5°
// How much darker than fabric counts as "the rim". 28 is tuned so that
// subtle fabric shadows don't trigger, but wood rims always do.
const RIM_DARKNESS = 28;

async function toGrayBuffer(imgBuffer: Buffer): Promise<{ px: Uint8Array; W: number; H: number }> {
  const { data, info } = await sharp(imgBuffer)
    .resize(ANALYSIS_SIZE, ANALYSIS_SIZE, { fit: "fill" })
    .grayscale()
    .blur(1.2) // smooth out fabric weave noise
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    px: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    W: info.width,
    H: info.height,
  };
}

// Seed luminance = average of a 9×9 patch at center.
function sampleSeed(px: Uint8Array, W: number, H: number): number {
  const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
  let sum = 0, n = 0;
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && x < W && y >= 0 && y < H) {
        sum += px[y * W + x];
        n++;
      }
    }
  }
  return sum / n;
}

// Cast a ray from (cx, cy) at angle θ. Walk outward; a hit requires
// RIM_CONFIRM consecutive dark pixels (so a single shadow or pattern
// fleck doesn't fool us — a real wood rim is always thicker than that).
// Return the position where the dark run STARTED — the inner edge of
// the rim. This also handles templates where the fabric sheet extends
// past the frame: the ray crosses fabric → rim (confirmed) → stop,
// before reaching the outer fabric.
function castRay(
  px: Uint8Array, W: number, H: number,
  cx: number, cy: number, dx: number, dy: number, darkThresh: number
): { x: number; y: number; hit: boolean } {
  const RIM_CONFIRM = 4; // pixels — wood rim is always thicker than this
  let darkStart: { x: number; y: number } | null = null;
  let darkRun = 0;
  let lastX = cx, lastY = cy;
  const maxSteps = Math.max(W, H);
  for (let t = 0; t < maxSteps; t += 0.7) {
    const ix = Math.round(cx + dx * t);
    const iy = Math.round(cy + dy * t);
    if (ix < 0 || ix >= W || iy < 0 || iy >= H) break;
    const v = px[iy * W + ix];
    if (v < darkThresh) {
      if (darkRun === 0) darkStart = { x: ix, y: iy };
      darkRun++;
      if (darkRun >= RIM_CONFIRM && darkStart) {
        return { x: darkStart.x, y: darkStart.y, hit: true };
      }
    } else {
      darkRun = 0;
      darkStart = null;
      lastX = ix; lastY = iy;
    }
  }
  return { x: lastX, y: lastY, hit: false };
}

async function detectFrameOpening(imageBuffer: Buffer): Promise<DetectOut | null> {
  const { px, W, H } = await toGrayBuffer(imageBuffer);
  const seed = sampleSeed(px, W, H);
  const darkThresh = seed - RIM_DARKNESS;

  console.log(`[detect-frame] seed=${seed.toFixed(0)} darkThresh=${darkThresh.toFixed(0)}`);

  const cx = Math.floor(W / 2);
  const cy = Math.floor(H / 2);

  const hits: { x: number; y: number; hit: boolean }[] = [];
  for (let i = 0; i < NUM_RAYS; i++) {
    const theta = (i / NUM_RAYS) * Math.PI * 2;
    hits.push(castRay(px, W, H, cx, cy, Math.cos(theta), Math.sin(theta), darkThresh));
  }

  // Only use rays that ACTUALLY confirmed a rim (consecutive dark run).
  // Rays that escaped to the image edge without finding a rim are
  // discarded — common when fabric extends past the frame.
  const confirmed = hits.filter(h => h.hit);
  const dists = confirmed.map(h => Math.hypot(h.x - cx, h.y - cy));
  const sortedDists = [...dists].sort((a, b) => a - b);
  const medianDist = sortedDists[Math.floor(sortedDists.length / 2)] || 0;

  // Keep hits within [0.6, 1.4]× median — tighter window since we already
  // filtered by confirmation. This trims rays that stopped early on
  // pattern-induced dark spots inside the opening.
  const goodHits: { x: number; y: number }[] = [];
  for (let i = 0; i < confirmed.length; i++) {
    const d = dists[i];
    if (d >= medianDist * 0.6 && d <= medianDist * 1.4) {
      goodHits.push(confirmed[i]);
    }
  }

  if (goodHits.length < NUM_RAYS * 0.4) {
    console.warn(`[detect-frame] too few good hits: ${goodHits.length}/${NUM_RAYS}`);
    return null;
  }

  // Bounding box of good hits = opening bounds.
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (const h of goodHits) {
    if (h.x < minX) minX = h.x;
    if (h.x > maxX) maxX = h.x;
    if (h.y < minY) minY = h.y;
    if (h.y > maxY) maxY = h.y;
  }
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;
  const aspect = bboxH / bboxW;

  // Shape classification: measure how close the hits lie to the corners
  // of their own bbox. Rectangle → corners are on the bbox. Ellipse →
  // hits at 45° are inside the bbox corners (on the ellipse curve).
  const cornerDist = Math.hypot(bboxW / 2, bboxH / 2);
  let diagHit = 0, diagCount = 0;
  for (const h of goodHits) {
    // Is this hit near a diagonal (±45°)?
    const vx = h.x - cx, vy = h.y - cy;
    const ang = Math.atan2(vy, vx);
    const absAng = Math.abs(((ang + Math.PI) % (Math.PI / 2)) - Math.PI / 4);
    if (absAng < 0.15) {
      diagHit += Math.hypot(vx, vy);
      diagCount++;
    }
  }
  const avgDiag = diagCount > 0 ? diagHit / diagCount : cornerDist * 0.75;
  const cornerRatio = avgDiag / cornerDist;
  // cornerRatio ≈ 1.0 → rectangle; ≈ 0.707 → ellipse/circle.
  let shape: ShapeKind;
  if (cornerRatio > 0.9) shape = "rectangle";
  else if (aspect >= 0.93 && aspect <= 1.08) shape = "circle";
  else shape = "oval";

  console.log(
    `[detect-frame] shape=${shape} aspect=${aspect.toFixed(2)} ` +
    `bbox=${bboxW}x${bboxH} cornerRatio=${cornerRatio.toFixed(2)} ` +
    `hits=${goodHits.length}/${NUM_RAYS}`
  );

  // Safety: opening should be a plausible size.
  const areaRatio = (bboxW * bboxH) / (W * H);
  if (areaRatio < 0.03 || areaRatio > 0.9) {
    console.warn(`[detect-frame] implausible area ${areaRatio}`);
    return null;
  }

  const left = (minX / W) * 100;
  const right = (maxX / W) * 100;
  const top = (minY / H) * 100;
  const bottom = (maxY / H) * 100;
  const confidence = Math.min(0.98, 0.6 + (goodHits.length / NUM_RAYS) * 0.35);

  return { left, top, right, bottom, shape, confidence };
}

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();
    if (!image) return NextResponse.json({ error: "No image" }, { status: 400 });

    const base64 = image.replace(/^data:image\/[^;]+;base64,/, "");
    const buf = Buffer.from(base64, "base64");

    // Detection strategy — try the most accurate methods first:
    //   1. Gemini 2.5 Flash vision with native bbox output (~$0.00015,
    //      ~1s, reliable across any frame style)
    //   2. Replicate SAM with center point prompt (if configured)
    //   3. Free ray-casting fallback (deterministic, no API)
    let result: { left: number; top: number; right: number; bottom: number; shape: "circle" | "oval" | "rectangle"; confidence: number } | null = null;
    let via: "gemini" | "sam" | "ray" = "ray";

    // 1. Gemini vision first.
    if (process.env.GEMINI_API_KEY) {
      try {
        const gem = await geminiDetectFrameOpening(buf, "image/jpeg");
        if (gem) {
          result = {
            left: gem.left * 100,
            top: gem.top * 100,
            right: gem.right * 100,
            bottom: gem.bottom * 100,
            shape: gem.shape,
            confidence: gem.confidence,
          };
          via = "gemini";
          console.log(`[detect-frame] Gemini hit: shape=${gem.shape}`);
        }
      } catch (err) {
        console.warn("[detect-frame] Gemini error:", err);
      }
    }

    // 2. Replicate SAM fallback.
    if (!result) {
      try {
        const sam = await detectFrameOpeningWithSam(image);
        if (sam) {
          const W = sam.right - sam.left;
          const H = sam.bottom - sam.top;
          const aspect = H / W;
          const shape: "circle" | "oval" | "rectangle" =
            aspect >= 0.93 && aspect <= 1.08 ? "circle" : "oval";
          result = {
            left: sam.left * 100,
            top: sam.top * 100,
            right: sam.right * 100,
            bottom: sam.bottom * 100,
            shape,
            confidence: 0.9,
          };
          via = "sam";
          console.log(`[detect-frame] SAM hit: ${shape} aspect=${aspect.toFixed(2)}`);
        }
      } catch (err) {
        console.warn("[detect-frame] SAM error:", err);
      }
    }

    // 3. Ray-casting fallback.
    if (!result) {
      result = await detectFrameOpening(buf);
    }
    if (!result) {
      return NextResponse.json({ error: "Could not find frame opening" }, { status: 500 });
    }

    const { left, top, right, bottom, shape, confidence } = result;
    console.log(`[detect-frame] via=${via}`);
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;

    console.log(
      `[detect-frame] final shape=${shape} ` +
      `bbox ${(right - left).toFixed(1)}x${(bottom - top).toFixed(1)}% ` +
      `center=(${cx.toFixed(1)},${cy.toFixed(1)}) conf=${confidence.toFixed(2)}`
    );

    const corners = [
      { x: left / 100, y: top / 100 },
      { x: right / 100, y: top / 100 },
      { x: right / 100, y: bottom / 100 },
      { x: left / 100, y: bottom / 100 },
    ];

    return NextResponse.json({
      frameCorners: corners,
      shape,
      confidence,
      detectedVia: via,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[detect-frame] error:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
