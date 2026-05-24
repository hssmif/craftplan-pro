// ══════════════════════════════════════════════════════════════
// Digital Product Studio: Asset Download API
// GET /api/digital/download/{assetId} — Serve stored asset files
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { readAssetBuffer } from "@/lib/digital-asset-storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Missing asset id" }, { status: 400 });
    }

    const result = readAssetBuffer(id);
    if (!result) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const { buffer, asset } = result;

    // Determine Content-Disposition: inline for images, attachment for files
    const isImage = asset.mimeType.startsWith("image/");
    const disposition = isImage
      ? `inline; filename="${asset.fileName}"`
      : `attachment; filename="${asset.fileName}"`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Disposition": disposition,
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("[Digital Download]", err);
    return NextResponse.json(
      { error: "Failed to serve asset" },
      { status: 500 }
    );
  }
}
