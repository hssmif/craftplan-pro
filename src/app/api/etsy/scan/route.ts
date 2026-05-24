import { NextRequest, NextResponse } from "next/server";
import { searchEtsyListings, analyzeNiche, estimateSales } from "@/lib/etsy-research";

const ETSY_API_URL = "https://openapi.etsy.com/v3";

async function fetchListingImages(
  listingIds: string[],
  apiKey: string
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};

  // Batch fetch images — Etsy v3 allows fetching images per listing
  await Promise.allSettled(
    listingIds.map(async (id) => {
      try {
        const resp = await fetch(
          `${ETSY_API_URL}/application/listings/${id}/images`,
          { headers: { "x-api-key": apiKey } }
        );
        if (resp.ok) {
          const data = await resp.json();
          const firstImage = data.results?.[0];
          map[id] = firstImage?.url_570xN || firstImage?.url_fullxfull || "";
        }
      } catch {
        /* skip failed image fetches */
      }
    })
  );

  return map;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const niche = searchParams.get("niche") || "wall art";
  const sort = searchParams.get("sort") || "score";
  const limit = parseInt(searchParams.get("limit") || "24");

  try {
    const query = `${niche} wall art digital download printable`;
    const { total, listings } = await searchEtsyListings(query, sort, Math.min(limit, 100));

    const analysis = analyzeNiche(
      listings.map((l) => ({
        price: l.price,
        favorites: l.favorites,
        views: l.views,
        listing_age_days: l.listing_age_days,
      })),
      total
    );

    // If images are missing, fetch them separately
    const missingImages = listings.filter((l) => !l.image_url);
    let imageMap: Record<string, string> = {};

    if (missingImages.length > 0) {
      const clientId = process.env.ETSY_CLIENT_ID || "";
      const secret = process.env.ETSY_SHARED_SECRET || "";
      const apiKey = secret ? `${clientId}:${secret}` : clientId;
      if (apiKey) {
        imageMap = await fetchListingImages(
          missingImages.map((l) => l.listing_id),
          apiKey
        );
      }
    }

    const enriched = listings.map((l) => ({
      ...l,
      image_url: l.image_url || imageMap[l.listing_id] || "",
      estimated_sales: estimateSales(l.favorites, l.listing_age_days),
    }));

    if (sort === "score") {
      enriched.sort((a, b) => b.favorites - a.favorites);
    }

    return NextResponse.json({
      niche,
      total_results: total,
      analysis,
      listings: enriched,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Scan failed";

    if (msg.includes("ETSY_CLIENT_ID")) {
      return NextResponse.json(
        { error: "Etsy API not configured. Add ETSY_CLIENT_ID to .env.local" },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
