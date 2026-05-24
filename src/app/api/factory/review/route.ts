// ══════════════════════════════════════════════════════════════
// Publish Review Gate API
//
// GET  /api/factory/review?runId=...
//   Generates and returns a ReviewScorecard for the run.
//
// POST /api/factory/review
//   { runId, action: "approve" | "reject" }
//   Updates review status. Publish is only allowed after approval.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getEtsyTokens } from "@/lib/db";
import {
  generateReviewScorecard,
  approveForPublish,
  rejectListing,
} from "@/lib/publish-review-gate";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("runId");

  if (!runId) {
    return NextResponse.json({ error: "Missing runId parameter" }, { status: 400 });
  }

  try {
    const scorecard = generateReviewScorecard(runId);

    if ("error" in scorecard) {
      return NextResponse.json({ error: scorecard.error }, { status: 404 });
    }

    // Check Etsy connection
    const tokens = getEtsyTokens();
    const etsyConnected = !!(tokens?.access_token && tokens?.shop_id);

    return NextResponse.json({
      success: true,
      scorecard,
      etsyConnected,
    });
  } catch (err) {
    console.error("[Review GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Review failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { runId, action } = body as {
      runId: string;
      action: "approve" | "reject";
    };

    if (!runId || !action) {
      return NextResponse.json(
        { error: "Missing runId or action" },
        { status: 400 }
      );
    }

    if (action === "approve") {
      const result = approveForPublish(runId);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        message: "Listing approved for publish",
        reviewStatus: "approved",
      });
    }

    if (action === "reject") {
      const result = rejectListing(runId);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        message: "Listing rejected",
        reviewStatus: "blocked_quality",
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    console.error("[Review POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Review action failed" },
      { status: 500 }
    );
  }
}
