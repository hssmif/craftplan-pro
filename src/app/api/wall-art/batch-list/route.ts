import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { runAutoPackage, PackageResult } from "@/lib/wall-art-pipeline";
import {
  createDigitalListing,
  uploadListingImage,
  uploadListingFile,
  activateListing,
} from "@/lib/etsy-client";

export const maxDuration = 300; // 5 min for batch

interface BatchItem {
  imagePath: string;
  niche: string;
  artDescription: string;
}

export async function POST(req: NextRequest) {
  const { items, dryRun } = (await req.json()) as { items: BatchItem[]; dryRun?: boolean };

  if (!items || !Array.isArray(items) || items.length === 0) {
    return new Response(JSON.stringify({ error: "items array required" }), {
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

      const results: {
        niche: string;
        listingId?: number;
        url?: string;
        title?: string;
        price?: number;
        error?: string;
      }[] = [];

      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        send({
          type: "item_start",
          index: idx,
          total: items.length,
          niche: item.niche,
        });

        try {
          // 1. Read image from disk
          send({ type: "step", index: idx, step: "reading", label: `Reading ${item.imagePath.split("/").pop()}` });
          const imageBuffer = await readFile(item.imagePath);

          // 2. Run auto-package pipeline
          send({ type: "step", index: idx, step: "packaging", label: "Running auto-package pipeline..." });
          let packageResult: PackageResult;
          try {
            packageResult = await runAutoPackage(
              imageBuffer,
              item.niche,
              item.artDescription,
              (step) => {
                send({
                  type: "pipeline_step",
                  index: idx,
                  step: step.step,
                  total: step.total,
                  label: step.label,
                  status: step.status,
                  detail: step.detail,
                });
              }
            );
          } catch (pipeErr) {
            throw new Error(`Pipeline failed: ${pipeErr instanceof Error ? pipeErr.message : String(pipeErr)}`);
          }

          // ── Dry-run mode: skip Etsy, just return pipeline results ──
          if (dryRun) {
            const result = {
              niche: item.niche,
              title: packageResult.listing.title,
              description: packageResult.listing.description,
              tags: packageResult.listing.tags,
              price: packageResult.listing.price,
              crops: packageResult.crops.length,
              mockups: packageResult.mockups.map(m => m.template),
              mockupPaths: packageResult.mockups.map(m => m.path),
              infoImages: packageResult.infoImages.length,
              productId: packageResult.productId,
            };
            results.push({ niche: item.niche, title: result.title, price: result.price });

            send({
              type: "item_done",
              index: idx,
              ...result,
              dryRun: true,
            });
          } else {
          // 3. Create Etsy listing
          send({ type: "step", index: idx, step: "creating_listing", label: `Creating Etsy listing: ${packageResult.listing.title.substring(0, 60)}...` });
          const listing = await createDigitalListing({
            title: packageResult.listing.title,
            description: packageResult.listing.description,
            price: packageResult.listing.price,
            tags: packageResult.listing.tags,
          });
          const listingId = listing.listing_id;

          // 4. Upload mockup images (these are the best preview images)
          let rank = 1;
          for (const mockup of packageResult.mockups) {
            try {
              send({ type: "step", index: idx, step: "uploading_image", label: `Uploading mockup ${rank}/${packageResult.mockups.length}: ${mockup.template}` });
              const imgBuf = await readFile(mockup.path);
              await uploadListingImage(listingId, Buffer.from(imgBuf), `mockup_${mockup.template}.png`, rank);
              rank++;
            } catch (err) {
              console.error(`Mockup upload failed (${mockup.template}):`, err);
            }
          }

          // 5. Upload info images
          for (const info of packageResult.infoImages) {
            try {
              send({ type: "step", index: idx, step: "uploading_image", label: `Uploading info image: ${info.name}` });
              const imgBuf = await readFile(info.path);
              await uploadListingImage(listingId, Buffer.from(imgBuf), `info_${info.name}.png`, rank);
              rank++;
            } catch (err) {
              console.error(`Info image upload failed (${info.name}):`, err);
            }
          }

          // 6. Upload main art as last listing image
          try {
            send({ type: "step", index: idx, step: "uploading_image", label: "Uploading main art image" });
            await uploadListingImage(listingId, Buffer.from(imageBuffer), "main_art.png", rank);
          } catch (err) {
            console.error("Main art upload failed:", err);
          }

          // 7. Upload crop files as digital downloads (buyer gets these)
          for (const crop of packageResult.crops) {
            try {
              send({ type: "step", index: idx, step: "uploading_file", label: `Uploading digital file: ${crop.ratio} (${crop.width}x${crop.height})` });
              const cropBuf = await readFile(crop.path);
              await uploadListingFile(listingId, Buffer.from(cropBuf), `wall-art-${crop.ratio.replace(":", "x")}-${crop.width}x${crop.height}.png`);
            } catch (err) {
              console.error(`Crop file upload failed (${crop.ratio}):`, err);
            }
          }

          // 8. Activate listing
          send({ type: "step", index: idx, step: "activating", label: "Activating listing on Etsy..." });
          await activateListing(listingId);

          const result = {
            niche: item.niche,
            listingId,
            url: `https://www.etsy.com/listing/${listingId}`,
            title: packageResult.listing.title,
            price: packageResult.listing.price,
          };
          results.push(result);

          send({
            type: "item_done",
            index: idx,
            ...result,
          });
          } // end if/else dryRun
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`Batch item ${idx} (${item.niche}) failed:`, errMsg);
          results.push({ niche: item.niche, error: errMsg });
          send({
            type: "item_error",
            index: idx,
            niche: item.niche,
            error: errMsg,
          });
        }
      }

      send({ type: "batch_done", results });
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
