// ── Printful File Upload by URL ──
// Tells Printful to download and store the image from a public URL.

import { NextRequest, NextResponse } from "next/server";
import { uploadFileByUrl, getPrintfulToken } from "@/lib/printful-client";

export async function POST(req: NextRequest) {
  try {
    const token =
      req.headers.get("x-printful-token") || getPrintfulToken();

    if (!token) {
      return NextResponse.json({ error: "No token" }, { status: 400 });
    }

    const body = await req.json();
    const { imageUrl, fileName } = body;

    if (!imageUrl) {
      return NextResponse.json(
        { error: "imageUrl is required" },
        { status: 400 }
      );
    }

    const result = await uploadFileByUrl(token, imageUrl, fileName);

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
    console.error("[Printful Upload URL] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
