// ── Printful Mockup Generation ──
// Creates mockup tasks and polls for results.
// Printful generates mockups asynchronously.

import { NextRequest, NextResponse } from "next/server";
import {
  createMockupTask,
  getMockupTaskResult,
  getPrintfulToken,
} from "@/lib/printful-client";

// POST: Create a new mockup generation task
export async function POST(req: NextRequest) {
  try {
    const token =
      req.headers.get("x-printful-token") || getPrintfulToken();

    if (!token) {
      return NextResponse.json({ error: "No token" }, { status: 400 });
    }

    const body = await req.json();
    const {
      productId,
      variantIds,
      fileUrl,
      placement = "front",
    } = body;

    if (!productId || !variantIds?.length || !fileUrl) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: productId, variantIds, fileUrl",
        },
        { status: 400 }
      );
    }

    const task = await createMockupTask(
      token,
      productId,
      variantIds,
      fileUrl,
      placement
    );

    return NextResponse.json({
      taskKey: task.task_key,
      status: task.status,
    });
  } catch (err) {
    console.error("[Printful Mockups] Create task error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Mockup task creation failed" },
      { status: 500 }
    );
  }
}

// GET: Poll for mockup task results
export async function GET(req: NextRequest) {
  try {
    const token =
      req.headers.get("x-printful-token") || getPrintfulToken();
    const taskKey = req.nextUrl.searchParams.get("taskKey");

    if (!token) {
      return NextResponse.json({ error: "No token" }, { status: 400 });
    }

    if (!taskKey) {
      return NextResponse.json(
        { error: "taskKey query parameter is required" },
        { status: 400 }
      );
    }

    const result = await getMockupTaskResult(token, taskKey);

    if (result.status === "completed" && result.mockups) {
      return NextResponse.json({
        status: "completed",
        mockups: result.mockups.map((m) => ({
          placement: m.placement,
          variantIds: m.variant_ids,
          mockupUrl: m.mockup_url,
          extras: m.extra?.map((e) => ({
            title: e.title,
            url: e.url,
          })) || [],
        })),
      });
    }

    if (result.status === "error") {
      return NextResponse.json({
        status: "error",
        error: result.error || "Mockup generation failed",
      });
    }

    // Still pending
    return NextResponse.json({
      status: result.status || "pending",
    });
  } catch (err) {
    console.error("[Printful Mockups] Poll error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to check mockup status" },
      { status: 500 }
    );
  }
}
