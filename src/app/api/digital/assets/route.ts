// ══════════════════════════════════════════════════════════════
// Digital Product Studio: Asset Upload API
// POST — Upload a generated file (PDF, XLSX, etc.) for
//        persistent storage via the digital asset system.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { storeAsset } from "@/lib/digital-asset-storage";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const projectId = formData.get("projectId") as string | null;
    const fileName = formData.get("fileName") as string | null;
    const assetType = (formData.get("assetType") as string) || "product";

    if (!file || !projectId || !fileName) {
      return NextResponse.json(
        { error: "Missing required fields: file, projectId, fileName" },
        { status: 400 }
      );
    }

    const validTypes = ["product", "mockup", "preview", "thumbnail"];
    if (!validTypes.includes(assetType)) {
      return NextResponse.json(
        { error: `Invalid assetType. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const asset = storeAsset(
      projectId,
      buffer,
      fileName,
      assetType as "product" | "mockup" | "preview" | "thumbnail"
    );

    return NextResponse.json({ asset });
  } catch (err) {
    console.error("[Digital Assets Upload]", err);
    return NextResponse.json(
      { error: "Failed to upload asset" },
      { status: 500 }
    );
  }
}
