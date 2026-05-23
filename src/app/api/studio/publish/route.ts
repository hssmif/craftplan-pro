// ── Studio Publish SSE Route ──
// Streams progress events as designs are pushed to Printful.
// Printful handles Etsy draft creation via its official integration.
// POST /api/studio/publish

import { NextRequest, NextResponse } from "next/server";
import {
  runStudioPublishPipeline,
  type StudioPublishInput,
  type StudioProgressEvent,
} from "@/lib/studio-pipeline";

export const maxDuration = 300; // 5 minute timeout for multi-design publishing

export async function POST(req: NextRequest) {
  const printfulToken = process.env.PRINTFUL_API_KEY || process.env.PRINTFUL_TOKEN;
  if (!printfulToken) {
    return NextResponse.json(
      { error: "PRINTFUL_API_KEY not configured. Add your Printful API token to .env.local" },
      { status: 500 }
    );
  }

  let body: StudioPublishInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.designs?.length || !body.products?.length || !body.listings?.length) {
    return NextResponse.json(
      { error: "designs, products, and listings are required" },
      { status: 400 }
    );
  }

  // Create SSE stream
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      function send(event: StudioProgressEvent) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Stream closed
        }
      }

      runStudioPublishPipeline(printfulToken, body, send)
        .then(() => {
          try {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch {
            // Already closed
          }
        })
        .catch((err) => {
          const errorEvent: StudioProgressEvent = {
            type: "error",
            designId: "",
            designIndex: 0,
            totalDesigns: body.designs.length,
            label: "Pipeline failed",
            status: "error",
            error: err instanceof Error ? err.message : "Unknown error",
          };
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch {
            // Already closed
          }
        });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
