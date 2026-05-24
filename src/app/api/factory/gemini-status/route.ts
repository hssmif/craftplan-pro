// ══════════════════════════════════════════════════════════════
// Gemini Status API — Health check and capabilities test
//
// GET /api/factory/gemini-status
//   → Returns Gemini API availability and capabilities
//
// POST /api/factory/gemini-status
//   { test: "image" | "text" }
//   → Runs a quick test of Gemini image or text generation
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { geminiHealthCheck, geminiGenerateText, geminiGenerateImage } from "@/lib/gemini-client";

export async function GET() {
  try {
    const health = await geminiHealthCheck();
    const hasKey = !!process.env.GEMINI_API_KEY;

    return NextResponse.json({
      configured: hasKey,
      apiKeyPrefix: hasKey ? process.env.GEMINI_API_KEY!.slice(0, 8) + "..." : null,
      ...health,
      features: {
        imageGeneration: health.available,
        imageEditing: health.available,
        textGeneration: health.available,
        videoGeneration: false, // Gemini video API not yet available for consumers
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Health check failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { test } = body;

    if (test === "text") {
      const result = await geminiGenerateText(
        "Say 'Gemini is working!' in exactly 3 words.",
        { temperature: 0.1 },
      );
      return NextResponse.json({ success: true, test: "text", result: result.text });
    }

    if (test === "image") {
      const start = Date.now();
      const result = await geminiGenerateImage(
        "A simple gradient background in soft blue and white. Minimalist. 512x512 pixels.",
        undefined,
        { temperature: 0.2, maxRetries: 1 },
      );
      return NextResponse.json({
        success: true,
        test: "image",
        sizeKB: Math.round(result.buffer.length / 1024),
        mimeType: result.mimeType,
        timeMs: Date.now() - start,
      });
    }

    return NextResponse.json(
      { error: 'Specify test: "text" or "image"' },
      { status: 400 },
    );
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Test failed" },
      { status: 500 },
    );
  }
}
