import { NextRequest, NextResponse } from "next/server";
import { createDigitalListing, applyListingAttributes } from "@/lib/etsy-client";
import { createProduct, updateProduct, getDb } from "@/lib/db";

// Etsy taxonomy 87 = Cross Stitch leaf node (full path 66 → 82 → 87).
// This is the ONLY "Cross Stitch" node in Etsy's current seller
// taxonomy — discovered via /api/etsy/taxonomy-discover.  The earlier
// guess of 5613 returned "Invalid taxonomy_id" because that ID
// doesn't exist in the active tree.  Fixed 2026-05-17.
const CROSS_STITCH_TAXONOMY_ID = 87;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      title?: string;
      description?: string;
      price?: number;
      tags?: string[];
      attributes?: {
        primaryColor?: string;
        secondaryColor?: string;
        theme?: string;
        holiday?: string;
        occasion?: string;
        recipient?: string;
      };
    };
    const { title, description, price, tags, attributes } = body;

    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    // Save as product in DB
    const product = createProduct({
      type: "cross_stitch",
      title,
      description: description || "",
      tags: tags || [],
      price: price || 4.99,
    });

    // Create draft listing on Etsy under the proper cross-stitch taxonomy.
    const listing = await createDigitalListing({
      title,
      description: description || "",
      price: price || 4.99,
      tags: tags || [],
      taxonomy_id: CROSS_STITCH_TAXONOMY_ID,
    });

    // Apply attributes (color / theme / holiday / recipient) so the
    // listing appears in Etsy's filter-narrowed searches.  Without this
    // step, a buyer narrowing "cross stitch patterns" by "Color: Pink"
    // cannot see our listing at all.  Failures are non-fatal — listing
    // creation already succeeded above.
    if (attributes) {
      try {
        await applyListingAttributes(listing.listing_id, CROSS_STITCH_TAXONOMY_ID, attributes);
      } catch (err) {
        console.warn("[list-on-etsy] attribute application failed (non-fatal):", (err as Error).message);
      }
    }

    // Update product with Etsy listing ID
    updateProduct(product.id, {
      etsy_listing_id: String(listing.listing_id),
      etsy_status: "draft",
    });

    // Auto-enroll for 30-day renewal cadence (Phase 3 SEO 2026-05-17).
    // Listings get a recency boost when renewed; keeping them on a
    // monthly cycle prevents organic ranking decay.  $0.20 per renewal
    // hits the seller's Etsy account.  User can disable via PATCH to
    // /api/etsy/renew-due if they don't want this for a specific item.
    try {
      const db = getDb();
      const now = Date.now();
      const next30Days = now + 30 * 24 * 60 * 60 * 1000;
      db.prepare(
        `INSERT OR IGNORE INTO listing_renewal_schedule
           (listing_id, enabled, cadence_days, next_renewal_at)
         VALUES (?, 1, 30, ?)`,
      ).run(String(listing.listing_id), next30Days);
    } catch (err) {
      console.warn("[list-on-etsy] renewal-schedule enrollment failed (non-fatal):", (err as Error).message);
    }

    return NextResponse.json({
      success: true,
      listing_id: listing.listing_id,
      product_id: product.id,
      productId: product.id, // client convenience alias
      url: listing.url,
      state: 'draft', // will flip to 'active' after /api/etsy/listing-activate is called
    });
  } catch (error) {
    console.error("Cross-stitch list on Etsy error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
