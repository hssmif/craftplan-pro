import { NextRequest } from "next/server";
import { runAutoPackage, PipelineStep, PackageResult } from "@/lib/wall-art-pipeline";

export async function POST(req: NextRequest) {
  try {
    const { image, niche, artDescription } = await req.json();

    if (!image) {
      return new Response(JSON.stringify({ error: "image (base64) is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Strip data URL prefix if present
    const base64Clean = image.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Clean, "base64");

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        function sendEvent(step: PipelineStep, result?: PackageResult) {
          const data = JSON.stringify({ ...step, result: result || undefined });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }

        try {
          const result = await runAutoPackage(
            imageBuffer,
            niche || "wall art",
            artDescription || "",
            sendEvent
          );

          // Send final result
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true, result })}\n\n`)
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Pipeline failed";
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
          );
        } finally {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
