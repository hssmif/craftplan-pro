import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Unified "My Listings" endpoint — returns wall-art + cross-stitch listings
// from both tables (wall_art_listings + products) in one shape so the
// /my-listings dashboard can show everything in one place.
export async function GET() {
  try {
    const db = getDb();

    // Wall-art listings (dedicated table with richer metadata)
    let wallArt: Array<Record<string, unknown>> = [];
    try {
      wallArt = db
        .prepare("SELECT * FROM wall_art_listings ORDER BY updated_at DESC LIMIT 500")
        .all() as Array<Record<string, unknown>>;
    } catch { /* table may not exist yet */ }

    // Cross-stitch listings live in the generic products table (type=cross_stitch)
    let crossStitch: Array<Record<string, unknown>> = [];
    try {
      crossStitch = db
        .prepare("SELECT * FROM products WHERE type = 'cross_stitch' ORDER BY created_at DESC LIMIT 500")
        .all() as Array<Record<string, unknown>>;
    } catch { /* noop */ }

    // Other product types (wall_art rows inserted through createProduct)
    let otherProducts: Array<Record<string, unknown>> = [];
    try {
      otherProducts = db
        .prepare("SELECT * FROM products WHERE type != 'cross_stitch' ORDER BY created_at DESC LIMIT 500")
        .all() as Array<Record<string, unknown>>;
    } catch { /* noop */ }

    const unified = [
      ...wallArt.map((r) => ({
        id: String(r.id),
        kind: "wall_art" as const,
        title: (r.title as string) || "Untitled",
        price: Number(r.price || 0),
        status: (r.status as string) || "draft",
        etsyListingId: r.etsy_listing_id ? String(r.etsy_listing_id) : null,
        etsyUrl: r.etsy_listing_id ? `https://www.etsy.com/listing/${r.etsy_listing_id}` : null,
        thumbnail: (r.main_image as string) || null,
        updatedAt: (r.updated_at as string) || (r.created_at as string) || null,
        niche: (r.niche as string) || "",
      })),
      ...crossStitch.map((r) => ({
        id: String(r.id),
        kind: "cross_stitch" as const,
        title: (r.title as string) || "Untitled",
        price: Number(r.price || 0),
        status: (r.etsy_status as string) || "draft",
        etsyListingId: r.etsy_listing_id ? String(r.etsy_listing_id) : null,
        etsyUrl: r.etsy_listing_id ? `https://www.etsy.com/listing/${r.etsy_listing_id}` : null,
        thumbnail: (r.preview_path as string) || null,
        updatedAt: (r.created_at as string) || null,
        niche: "",
      })),
      ...otherProducts
        .filter((r) => r.etsy_listing_id) // only show the ones that got published
        .map((r) => ({
          id: String(r.id),
          kind: (r.type as string) || "other",
          title: (r.title as string) || "Untitled",
          price: Number(r.price || 0),
          status: (r.etsy_status as string) || "draft",
          etsyListingId: r.etsy_listing_id ? String(r.etsy_listing_id) : null,
          etsyUrl: r.etsy_listing_id ? `https://www.etsy.com/listing/${r.etsy_listing_id}` : null,
          thumbnail: (r.preview_path as string) || null,
          updatedAt: (r.created_at as string) || null,
          niche: "",
        })),
    ];

    // Dedupe by etsyListingId so a row stored in both tables doesn't show twice.
    const seenEtsy = new Set<string>();
    const deduped = unified.filter((row) => {
      if (!row.etsyListingId) return true;
      if (seenEtsy.has(row.etsyListingId)) return false;
      seenEtsy.add(row.etsyListingId);
      return true;
    });

    const stats = {
      total: deduped.length,
      live: deduped.filter((r) => r.status === "active").length,
      draft: deduped.filter((r) => r.status === "draft" || !r.status).length,
      wallArt: deduped.filter((r) => r.kind === "wall_art").length,
      crossStitch: deduped.filter((r) => r.kind === "cross_stitch").length,
    };

    return NextResponse.json({ listings: deduped, stats });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch listings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
