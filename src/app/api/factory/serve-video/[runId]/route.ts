// ══════════════════════════════════════════════════════════════
// Factory Engine: Video Serve API
//
// GET /api/factory/serve-video/{runId}
//   → Serves the generated listing video as MP4
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import path from "path";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const videoDir = path.join("/tmp/factory-video", runId);

    if (!existsSync(videoDir)) {
      return NextResponse.json(
        { error: "Video not found", runId },
        { status: 404 }
      );
    }

    const mp4Files = readdirSync(videoDir).filter((f) =>
      f.toLowerCase().endsWith(".mp4")
    );

    if (mp4Files.length === 0) {
      return NextResponse.json(
        { error: "No MP4 files found for this run", runId },
        { status: 404 }
      );
    }

    const filePath = path.join(videoDir, mp4Files[0]);
    const stats = statSync(filePath);
    const buffer = readFileSync(filePath);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(stats.size),
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=3600",
        "Accept-Ranges": "bytes",
      },
    });
  } catch (err) {
    console.error("[serve-video] Error:", err);
    return NextResponse.json(
      { error: "Failed to serve video" },
      { status: 500 }
    );
  }
}
