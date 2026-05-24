// ── Printful File Upload ──
// Proxies design image upload to Printful.

import { NextRequest, NextResponse } from "next/server";
import { uploadFile, getPrintfulToken } from "@/lib/printful-client";

export async function POST(req: NextRequest) {
  try {
    const token =
      req.headers.get("x-printful-token") || getPrintfulToken();

    if (!token) {
      return NextResponse.json({ error: "No token" }, { status: 400 });
    }

    const body = await req.json();
    const { image, fileName } = body;

    if (!image) {
      return NextResponse.json(
        { error: "image (base64) is required" },
        { status: 400 }
      );
    }

    const result = await uploadFile(token, image, fileName || "design.png");

    return NextResponse.json({
      id: result.id,
      fileName: result.filename,
      url: result.url,
      width: result.width,
      height: result.height,
      previewUrl: result.preview_url,
      thumbnailUrl: result.thumbnail_url,
    });
  } catch (err) {
    console.error("[Printful Upload] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
