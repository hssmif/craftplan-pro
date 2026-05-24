// ══════════════════════════════════════════════════════════════
// Factory — Push Gemini-built .xlsx to Google Drive as native Sheets
// POST /api/factory/push-to-sheets
//
// Takes a Gemini-built spreadsheet asset (.xlsx) and uploads it to
// the user's Google Drive with mimeType conversion to native Google
// Sheets. Returns the edit URL so the user can open it in Sheets.
//
// This bridges our backend-rendered .xlsx (Gemini-quality content,
// no green template) with Google Sheets editing — the buyer can
// share, edit, and collaborate in Sheets just like the consumer
// Gemini app does, but the content is what WE generated.
//
// Request body:
//   { assetId: string }
//
// Response:
//   { success, sheetId, editUrl, viewUrl, fileName }
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { readAssetBuffer } from "@/lib/digital-asset-storage";
import { getGoogleApis, isGoogleAuthConfigured } from "@/lib/google-auth";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { assetId } = body as { assetId: string };

    if (!assetId) {
      return NextResponse.json({ error: "assetId is required" }, { status: 400 });
    }

    if (!isGoogleAuthConfigured()) {
      return NextResponse.json(
        {
          error: "Google OAuth is not configured. Run scripts/gws-oauth-helper.mjs to authenticate.",
        },
        { status: 500 }
      );
    }

    // ── 1. Read the Gemini-built .xlsx from local asset storage ──
    const result = readAssetBuffer(assetId);
    if (!result) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }
    const { buffer, asset } = result;

    if (
      asset.mimeType !==
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      return NextResponse.json(
        { error: `Asset is not an .xlsx file (got ${asset.mimeType})` },
        { status: 400 }
      );
    }

    // ── 2. Upload to Drive with mimeType conversion to Google Sheets ──
    const { drive } = await getGoogleApis();
    const baseFileName = (asset.fileName || "Spreadsheet").replace(/\.xlsx$/i, "");

    console.log(`[push-to-sheets] Uploading ${buffer.length} bytes as "${baseFileName}"...`);
    const t0 = Date.now();

    const driveResp = await drive.files.create({
      // The magic line: requestBody.mimeType = google sheets type → Drive
      // imports the .xlsx and converts it to a native Google Sheet.
      requestBody: {
        name: baseFileName,
        mimeType: "application/vnd.google-apps.spreadsheet",
      },
      media: {
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body: Readable.from(buffer),
      },
      fields: "id, name, webViewLink",
      supportsAllDrives: false,
    });

    const elapsed = Date.now() - t0;
    const sheetId = driveResp.data.id;
    const webViewLink = driveResp.data.webViewLink;

    if (!sheetId) {
      return NextResponse.json(
        { error: "Drive upload succeeded but returned no file id" },
        { status: 500 }
      );
    }

    console.log(`[push-to-sheets] ✓ Created sheet ${sheetId} in ${elapsed}ms`);

    return NextResponse.json({
      success: true,
      sheetId,
      editUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
      viewUrl: webViewLink || `https://docs.google.com/spreadsheets/d/${sheetId}/view`,
      fileName: driveResp.data.name || baseFileName,
      timingMs: elapsed,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[push-to-sheets] failed:", msg);

    // Surface common OAuth errors clearly
    if (msg.includes("invalid_grant")) {
      return NextResponse.json(
        {
          error:
            "Google OAuth token expired or revoked. Re-run: node scripts/gws-oauth-helper.mjs",
        },
        { status: 401 }
      );
    }
    if (msg.includes("insufficient")) {
      return NextResponse.json(
        {
          error:
            "OAuth scope is missing Drive file write. Re-authorize with drive.file scope.",
        },
        { status: 403 }
      );
    }

    return NextResponse.json({ error: `Push to Sheets failed: ${msg}` }, { status: 500 });
  }
}
