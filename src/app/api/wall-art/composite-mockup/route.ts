import { NextRequest } from "next/server";
import sharp from "sharp";
import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const exec = promisify(execFile);

export async function POST(req: NextRequest) {
  try {
    const { template, art, frameCorners } = await req.json();

    if (!template || !art) {
      return new Response(
        JSON.stringify({ error: "template and art (base64) are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!frameCorners || !Array.isArray(frameCorners) || frameCorners.length !== 4) {
      return new Response(
        JSON.stringify({ error: "frameCorners (4 points [{x,y},...] normalized 0-1) required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Decode base64 images
    const templateClean = template.replace(/^data:[^;]+;base64,/, "");
    const artClean = art.replace(/^data:[^;]+;base64,/, "");

    const templateBuffer = Buffer.from(templateClean, "base64");
    let artBuffer: Buffer = Buffer.from(artClean, "base64");

    // Get template dimensions
    const templateMeta = await sharp(templateBuffer).metadata();
    const tw = templateMeta.width || 1200;
    const th = templateMeta.height || 1600;

    // ── Lighting match ──
    // Sample the mean luminance of the frame region in the template and nudge
    // the art's tone curve toward it. MJ room photos frequently have warm
    // yellow lamplight or cool daylight — pasting a neutral-tone pattern into
    // either looks obviously fake. A subtle gamma/tint shift matches the scene.
    try {
      const tplStats = await sharp(templateBuffer).stats();
      const tplMeanLum = tplStats.channels?.length
        ? (0.299 * tplStats.channels[0].mean + 0.587 * tplStats.channels[1].mean + 0.114 * tplStats.channels[2].mean)
        : 180;
      const tplRGB = tplStats.channels?.length
        ? [tplStats.channels[0].mean, tplStats.channels[1].mean, tplStats.channels[2].mean]
        : [180, 180, 180];
      const artStats = await sharp(artBuffer).stats();
      const artMeanLum = artStats.channels?.length
        ? (0.299 * artStats.channels[0].mean + 0.587 * artStats.channels[1].mean + 0.114 * artStats.channels[2].mean)
        : 180;
      const artRGB = artStats.channels?.length
        ? [artStats.channels[0].mean, artStats.channels[1].mean, artStats.channels[2].mean]
        : [180, 180, 180];

      // Gamma nudge — brighten for dark rooms, darken for bright rooms, capped
      // so patterns stay legible. Tuned empirically to +/-15% exposure.
      const lumRatio = tplMeanLum > 0 ? Math.max(0.82, Math.min(1.18, artMeanLum / tplMeanLum)) : 1;

      // Color temperature nudge — subtle R/B multipliers scaled toward the
      // template's white-balance, clamped to avoid tinting the pattern away
      // from its DMC color intent.
      const safe = (n: number) => (n > 1 ? n : 1);
      const rMul = Math.max(0.9, Math.min(1.12, safe(tplRGB[0]) / safe(artRGB[0])));
      const bMul = Math.max(0.9, Math.min(1.12, safe(tplRGB[2]) / safe(artRGB[2])));

      // Sharp's .gamma() only accepts ≥ 1.0; for brightness adjustments we use
      // .linear with a uniform scalar. Combine color-temp tint + exposure.
      const expScale = Math.max(0.85, Math.min(1.15, 1 / lumRatio));
      artBuffer = await sharp(artBuffer)
        .linear([rMul * expScale, 1 * expScale, bMul * expScale], [0, 0, 0])
        .toBuffer();
    } catch (lightErr) {
      console.warn("[composite-mockup] Lighting match failed, using original art:", lightErr);
    }

    // Convert normalized corners to pixel coordinates
    // corners: [TL, TR, BR, BL]
    const corners = frameCorners.map((c: { x: number; y: number }) => ({
      x: Math.round(c.x * tw),
      y: Math.round(c.y * th),
    }));

    // Calculate bounding box of the 4 corners for art sizing
    const minX = Math.min(...corners.map((c: { x: number }) => c.x));
    const maxX = Math.max(...corners.map((c: { x: number }) => c.x));
    const minY = Math.min(...corners.map((c: { y: number }) => c.y));
    const maxY = Math.max(...corners.map((c: { y: number }) => c.y));
    const bboxW = maxX - minX;
    const bboxH = maxY - minY;

    // Check if it's a simple rectangle (no perspective needed)
    const isRect =
      Math.abs(corners[0].y - corners[1].y) < 5 &&
      Math.abs(corners[2].y - corners[3].y) < 5 &&
      Math.abs(corners[0].x - corners[3].x) < 5 &&
      Math.abs(corners[1].x - corners[2].x) < 5;

    if (isRect) {
      // Simple rectangle composite — no perspective needed
      const frameX = corners[0].x;
      const frameY = corners[0].y;

      const resizedArt = await sharp(artBuffer)
        .resize(bboxW, bboxH, { fit: "cover" })
        .toBuffer();

      const artMeta = await sharp(resizedArt).metadata();
      const aw = artMeta.width || bboxW;
      const ah = artMeta.height || bboxH;

      const croppedArt = (aw !== bboxW || ah !== bboxH)
        ? await sharp(resizedArt)
            .extract({
              left: Math.max(0, Math.round((aw - bboxW) / 2)),
              top: Math.max(0, Math.round((ah - bboxH) / 2)),
              width: Math.min(aw, bboxW),
              height: Math.min(ah, bboxH),
            })
            .toBuffer()
        : resizedArt;

      const composited = await sharp(templateBuffer)
        .composite([{ input: croppedArt, left: frameX, top: frameY }])
        .png({ quality: 90 })
        .toBuffer();

      const base64Result = `data:image/png;base64,${composited.toString("base64")}`;
      return new Response(
        JSON.stringify({ image: base64Result }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // ── Perspective transform using FFmpeg ──
    const tmpDir = path.join(process.cwd(), "data", `tmp-composite-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });

    const templatePath = path.join(tmpDir, "template.png");
    const artPath = path.join(tmpDir, "art.png");
    const warpedPath = path.join(tmpDir, "warped.png");
    const outputPath = path.join(tmpDir, "output.png");

    // Save template as PNG
    await writeFile(templatePath, await sharp(templateBuffer).png().toBuffer());

    // Resize art to bounding box size, then perspective-warp to match corners
    const artResized = await sharp(artBuffer)
      .resize(bboxW, bboxH, { fit: "cover" })
      .png()
      .toBuffer();
    await writeFile(artPath, artResized);

    // FFmpeg perspective filter: 8 values = 4 destination points (x0:y0:x1:y1:x2:y2:x3:y3)
    // With sense=source (default): maps source corners to these output positions
    // Order: TL, TR, BL, BR — where each corner of the source image ends up
    const dstTL_x = corners[0].x - minX;
    const dstTL_y = corners[0].y - minY;
    const dstTR_x = corners[1].x - minX;
    const dstTR_y = corners[1].y - minY;
    const dstBL_x = corners[3].x - minX;  // BL = corners[3]
    const dstBL_y = corners[3].y - minY;
    const dstBR_x = corners[2].x - minX;  // BR = corners[2]
    const dstBR_y = corners[2].y - minY;

    // perspective filter takes exactly 8 coordinate values + options
    const perspFilter = `perspective=${dstTL_x}:${dstTL_y}:${dstTR_x}:${dstTR_y}:${dstBL_x}:${dstBL_y}:${dstBR_x}:${dstBR_y}:interpolation=linear`;

    try {
      await exec("ffmpeg", [
        "-i", artPath,
        "-vf", `${perspFilter},format=rgba`,
        "-frames:v", "1",
        "-y", warpedPath,
      ], { timeout: 30000 });
    } catch (ffErr) {
      console.error("FFmpeg perspective failed:", ffErr);
      // Fallback: just resize to bounding box (no perspective)
      const fallback = await sharp(artBuffer)
        .resize(bboxW, bboxH, { fit: "cover" })
        .png()
        .toBuffer();
      await writeFile(warpedPath, fallback);
    }

    // Read warped art and composite onto template
    const warpedBuffer = await readFile(warpedPath);
    const warpedMeta = await sharp(warpedBuffer).metadata();

    const composited = await sharp(templateBuffer)
      .composite([{
        input: await sharp(warpedBuffer).png().toBuffer(),
        left: minX,
        top: minY,
      }])
      .png({ quality: 90 })
      .toBuffer();

    // Cleanup
    for (const f of [templatePath, artPath, warpedPath, outputPath]) {
      try { await unlink(f); } catch { /* ignore */ }
    }
    try { const { rmdir } = await import("fs/promises"); await rmdir(tmpDir); } catch { /* ignore */ }

    const base64Result = `data:image/png;base64,${composited.toString("base64")}`;

    return new Response(
      JSON.stringify({ image: base64Result }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Composite failed";
    console.error("Composite mockup error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
