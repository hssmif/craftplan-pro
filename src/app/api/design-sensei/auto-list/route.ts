// ── Design Sensei: Auto-List Pipeline (Full Server-Side) ──
// SSE streaming endpoint: uploads design, generates mockups, creates Etsy listing,
// uploads images, activates listing — all server-side via API.
// Like the eBay extension approach: one API call creates the entire listing.

import { NextRequest } from "next/server";
import { runAutoListPipeline, type AutoListInput, type PipelineStep, type PipelineResult } from "@/lib/auto-list-pipeline";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const printfulToken = process.env.PRINTFUL_API_KEY || process.env.PRINTFUL_TOKEN;
  if (!printfulToken) {
    return new Response(
      JSON.stringify({ error: "PRINTFUL_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body: {
    designBase64: string;
    designText: string;
    keyword: string;
    metadata: { title: string; tags: string[]; description: string };
    productType?: number;
    markupPercent?: number;
    autoActivate?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!body.designBase64 || !body.keyword || !body.metadata) {
    return new Response(
      JSON.stringify({ error: "designBase64, keyword, and metadata are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const input: AutoListInput = {
        designBase64: body.designBase64,
        designText: body.designText || "",
        keyword: body.keyword,
        metadata: body.metadata,
        productId: body.productType || 71,
        markupPercent: body.markupPercent || 40,
        autoActivate: body.autoActivate !== false,
      };

      const sendEvent = (step: PipelineStep, result?: PipelineResult) => {
        const data = JSON.stringify({ ...step, result: result || undefined });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      runAutoListPipeline(printfulToken, input, sendEvent)
        .then((result) => {
          const finalData = JSON.stringify({
            step: 5,
            totalSteps: 5,
            status: "done",
            label: "Pipeline complete — listing is live!",
            result,
          });
          controller.enqueue(encoder.encode(`data: ${finalData}\n\n`));
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        })
        .catch((err) => {
          const errData = JSON.stringify({
            step: 0,
            totalSteps: 5,
            status: "error",
            label: "Pipeline failed",
            error: err instanceof Error ? err.message : "Unknown error",
          });
          controller.enqueue(encoder.encode(`data: ${errData}\n\n`));
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
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
