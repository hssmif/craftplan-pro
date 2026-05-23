// GET /api/cross-stitch/listing-image?id=LISTING_ID
//
// Fetches the main image URL for a single Etsy listing and caches it in the DB.
// Used by the Research Hub Products tab to lazy-load images for listings that
// were scanned before the `includes[]=Images` fix.

import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const ETSY_API_URL = "https://openapi.etsy.com/v3";

function getApiKey(): string {
  const clientId = process.env.ETSY_CLIENT_ID || "";
  const sharedSecret = process.env.ETSY_SHARED_SECRET || "";
  return sharedSecret ? `${clientId}:${sharedSecret}` : clientId;
}

// Module-level in-memory cache so repeated renders don't re-fetch
const memCache = new Map<string, string>();

export async function GET(req: NextRequest): Promise<Response> {
  const listingId = req.nextUrl.searchParams.get("id");
  if (!listingId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  // 1. Check memory cache
  if (memCache.has(listingId)) {
    return NextResponse.json({ image_url: memCache.get(listingId) });
  }

  // 2. Check DB cache
  try {
    const db = new Database(path.join(process.cwd(), "data", "products.db"), { readonly: false });
    const row = db.prepare("SELECT image_url FROM tracked_listings WHERE listing_id = ?").get(listingId) as { image_url: string | null } | undefined;
    if (row?.image_url) {
      memCache.set(listingId, row.image_url);
      db.close();
      return NextResponse.json({ image_url: row.image_url });
    }
    db.close();
  } catch { /* DB not available, continue to API */ }

  // 3. Fetch from Etsy API
  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json({ image_url: null });
  }

  try {
    const url = `${ETSY_API_URL}/application/listings/${listingId}?includes[]=Images`;
    const resp = await fetch(url, {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(6000),
    });

    if (!resp.ok) {
      return NextResponse.json({ image_url: null });
    }

    interface EtsyListing {
      images?: { url_570xN?: string; url_fullxfull?: string }[];
    }
    const data = await resp.json() as EtsyListing;
    const imageUrl = data.images?.[0]?.url_570xN || data.images?.[0]?.url_fullxfull || null;

    // 4. Persist to DB so next page load is instant
    if (imageUrl) {
      try {
        const db = new Database(path.join(process.cwd(), "data", "products.db"), { readonly: false });
        db.prepare("UPDATE tracked_listings SET image_url = ? WHERE listing_id = ?").run(imageUrl, listingId);
        db.close();
      } catch { /* non-fatal */ }
      memCache.set(listingId, imageUrl);
    }

    return NextResponse.json({ image_url: imageUrl });
  } catch {
    return NextResponse.json({ image_url: null });
  }
}
