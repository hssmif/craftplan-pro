// GET /api/strategist/serve-video/[id]
//
// Streams an MP4 saved by /api/strategist/produce-video back to the
// browser so the <video> tag in /strategist can play it. Files live
// in /tmp/strategist-video/<id>.mp4.
//
// Why a thin proxy instead of /public/: the Veo MP4s are user-
// generated artefacts that shouldn't leak into the static build
// output (each gen is ~$1+ and the seller may want to delete them).
// Keeping them in /tmp + behind this route means we control TTL,
// can add auth later, and the seller's /public/ stays clean.
//
// The id format is `vid_<unixms>_<uuid8>` — strict regex check below
// prevents path traversal even if a caller crafts a weird id.

import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Strict id shape: vid_<digits>_<8 hex/alphanum chars>. Anything that
// doesn't match is rejected before we touch the filesystem.
const ID_PATTERN = /^vid_\d+_[a-z0-9]{4,16}$/;

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!ID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid video id" }, { status: 400 });
  }

  const filePath = path.join("/tmp", "strategist-video", `${id}.mp4`);

  try {
    const st = await stat(filePath);
    const buf = await readFile(filePath);
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(st.size),
        // Allow inline playback in <video> + caching by the browser.
        // 1 hour is enough for the seller's session; longer would
        // make iteration confusing if they re-render with the same id
        // (which currently isn't possible since ids include unixms,
        // but defensive caching headers stay tight regardless).
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to read video", message: e.message },
      { status: 500 },
    );
  }
}
