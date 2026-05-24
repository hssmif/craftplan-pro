// ══════════════════════════════════════════════════════════════
// Factory Publish Handoff API
//
// GET  /api/factory/publish?runId=...
//   → Returns the EtsyPublishPayload for review (no side effects)
//
// POST /api/factory/publish
//   { runId, overrides?, autoActivate? }
//   → Publishes to Etsy: create draft → upload files → upload images
//   → Returns EtsyPublishResult with listing ID and URL
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { buildPublishPayload, executePublish } from "@/lib/factory-publish";
import { getEtsyTokens } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const runId = searchParams.get("runId");

    if (!runId) {
      return NextResponse.json(
        { error: "Missing runId query parameter" },
        { status: 400 }
      );
    }

    // Check Etsy connection status
    const tokens = getEtsyTokens();
    const etsyConnected = !!(tokens?.access_token && tokens?.shop_id);

    // Build the publish payload (read-only)
    const result = buildPublishPayload(runId);

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error, etsyConnected },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      payload: result,
      etsyConnected,
      canPublish: etsyConnected && result.state === "draft_ready",
    });
  } catch (err) {
    console.error("[Factory Publish GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build publish payload" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { runId, overrides, autoActivate = false } = body as {
      runId: string;
      overrides?: {
        title?: string;
        description?: string;
        tags?: string[];
        price?: number;
      };
      autoActivate?: boolean;
    };

    if (!runId) {
      return NextResponse.json(
        { error: "Missing runId" },
        { status: 400 }
      );
    }

    // Verify Etsy is connected
    const tokens = getEtsyTokens();
    if (!tokens?.access_token || !tokens?.shop_id) {
      return NextResponse.json(
        {
          error: "Etsy not connected. Go to Settings to connect your Etsy account.",
          code: "ETSY_NOT_CONNECTED",
        },
        { status: 401 }
      );
    }

    // Execute the publish
    const result = await executePublish(runId, { overrides, autoActivate });

    return NextResponse.json({
      success: result.success,
      result,
    });
  } catch (err) {
    console.error("[Factory Publish POST]", err);

    const message = err instanceof Error ? err.message : "Publish failed";
    const isAuthError =
      message.includes("No shop ID") ||
      message.includes("token") ||
      message.includes("reconnect");

    return NextResponse.json(
      {
        error: message,
        code: isAuthError ? "ETSY_NOT_CONNECTED" : "PUBLISH_FAILED",
      },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
