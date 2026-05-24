import { NextRequest, NextResponse } from "next/server";
import {
  loadLibrary,
  addFrame,
  removeFrame,
  matchFramesToArt,
  MOCKUP_MJ_PROMPTS,
} from "@/lib/mockup-library";

// GET — list all frames in library + MJ prompts
export async function GET(req: NextRequest) {
  const lib = await loadLibrary();
  return NextResponse.json({
    frames: lib.frames,
    mjPrompts: MOCKUP_MJ_PROMPTS,
    total: lib.frames.length,
  });
}

// POST — upload a new frame OR match frames to art
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  // JSON request = match frames to art
  if (contentType.includes("application/json")) {
    const { action, artDescription, niche, artBase64, frameId } = await req.json();

    if (action === "match") {
      if (!artBase64 || !artDescription) {
        return NextResponse.json({ error: "artBase64 and artDescription required" }, { status: 400 });
      }
      const artBuffer = Buffer.from(artBase64, "base64");
      const matches = await matchFramesToArt(artDescription, niche || "", artBuffer);
      return NextResponse.json({ matches });
    }

    if (action === "delete") {
      if (!frameId) return NextResponse.json({ error: "frameId required" }, { status: 400 });
      const ok = await removeFrame(frameId);
      return NextResponse.json({ success: ok });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  // FormData request = upload a new frame
  const formData = await req.formData();
  const file = formData.get("frame") as File | null;
  const name = formData.get("name") as string;
  const artX = parseInt(formData.get("artX") as string) || 0;
  const artY = parseInt(formData.get("artY") as string) || 0;
  const artW = parseInt(formData.get("artWidth") as string) || 0;
  const artH = parseInt(formData.get("artHeight") as string) || 0;
  const styleTags = (formData.get("styleTags") as string || "").split(",").map(s => s.trim()).filter(Boolean);
  const bestFor = (formData.get("bestFor") as string || "").split(",").map(s => s.trim()).filter(Boolean);
  const notFor = (formData.get("notFor") as string || "").split(",").map(s => s.trim()).filter(Boolean);
  const orientation = (formData.get("orientation") as string || "portrait") as "portrait" | "landscape" | "square" | "oval";
  const compositeMode = (formData.get("compositeMode") as string || "overlay") as "overlay" | "under";

  if (!file || !name) {
    return NextResponse.json({ error: "frame file and name required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const frame = await addFrame(
    buffer, name,
    { x: artX, y: artY, width: artW, height: artH },
    styleTags, bestFor, notFor, orientation, compositeMode
  );

  return NextResponse.json({ frame });
}
