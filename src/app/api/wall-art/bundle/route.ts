import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { runGalleryBundle } from "@/lib/wall-art-pipeline";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { imagePaths, niche, setDescription, dryRun } = (await req.json()) as {
    imagePaths: string[];
    niche: string;
    setDescription: string;
    dryRun?: boolean;
  };

  if (!imagePaths || imagePaths.length < 2 || imagePaths.length > 6) {
    return new Response(JSON.stringify({ error: "imagePaths array required (2-6 images)" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        send({ type: "start", printCount: imagePaths.length, niche });

        // Read all images
        send({ type: "step", step: "reading", label: `Reading ${imagePaths.length} images...` });
        const imageBuffers: Buffer[] = [];
        for (const p of imagePaths) {
          imageBuffers.push(await readFile(p));
        }

        // Run gallery bundle pipeline
        const result = await runGalleryBundle(
          imageBuffers,
          niche,
          setDescription,
          (step) => {
            send({
              type: "pipeline_step",
              step: step.step,
              total: step.total,
              label: step.label,
              status: step.status,
              detail: step.detail,
            });
          }
        );

        send({
          type: "bundle_done",
          dryRun: dryRun ?? true,
          productId: result.productId,
          title: result.listing.title,
          description: result.listing.description,
          tags: result.listing.tags,
          price: result.listing.price,
          printCount: result.printCount,
          mockups: result.mockups.map(m => m.template),
          mockupPaths: result.mockups.map(m => m.path),
          galleryMockup: result.galleryMockup,
          prints: result.prints.length,
        });
      } catch (err) {
        send({ type: "error", error: err instanceof Error ? err.message : String(err) });
      }

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
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
