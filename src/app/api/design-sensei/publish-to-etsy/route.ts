// ── Design Sensei: Publish to Etsy ──
// Creates draft listings on Etsy with design images for POD products.

import { NextRequest, NextResponse } from "next/server";
import { createPODListing, uploadListingImage } from "@/lib/etsy-client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { listings, imageBase64, imageMimeType } = body;

    if (!listings?.length) {
      return NextResponse.json({ error: "No listings to publish" }, { status: 400 });
    }

    // Prepare image buffer if base64 provided
    let imageBuffer: Buffer | null = null;
    if (imageBase64) {
      const clean = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      imageBuffer = Buffer.from(clean, "base64");
    }

    const results: Array<{
      productType: string;
      listingId?: number;
      url?: string;
      error?: string;
    }> = [];

    for (const listing of listings) {
      try {
        // Create listing on Etsy as draft
        const result = await createPODListing({
          title: listing.title,
          description: listing.description,
          price: listing.price,
          tags: listing.tags || [],
          taxonomy_id: listing.taxonomyId,
        });

        // Upload design image
        if (imageBuffer && result.listing_id) {
          try {
            await uploadListingImage(
              result.listing_id,
              imageBuffer,
              `${listing.productType.replace(/\s+/g, "-")}-design.png`,
              1
            );
          } catch (imgErr) {
            console.warn(`[Publish Etsy] Image upload failed for ${listing.productType}:`, imgErr);
          }
        }

        results.push({
          productType: listing.productType,
          listingId: result.listing_id,
          url: result.url,
        });
      } catch (err) {
        results.push({
          productType: listing.productType,
          error: (err as Error).message,
        });
      }

      // Delay between Etsy API calls
      await new Promise((r) => setTimeout(r, 500));
    }

    const successCount = results.filter((r) => !r.error).length;

    return NextResponse.json({
      published: successCount,
      total: listings.length,
      results,
    });
  } catch (err) {
    console.error("[Publish Etsy] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Publishing failed" },
      { status: 500 }
    );
  }
}
