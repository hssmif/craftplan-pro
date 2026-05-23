import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// GET — fetch all saved listings (newest first)
export async function GET() {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        "SELECT * FROM wall_art_listings ORDER BY updated_at DESC"
      )
      .all();

    // Parse JSON fields
    const listings = (rows as Record<string, unknown>[]).map((r) => ({
      ...r,
      mockup_images: r.mockup_images ? JSON.parse(r.mockup_images as string) : [],
      crop_ratios: r.crop_ratios ? JSON.parse(r.crop_ratios as string) : [],
      tags: r.tags || "",
    }));

    return NextResponse.json({ listings });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch listings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — save a new listing or update existing
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      title,
      description,
      tags,
      price,
      category,
      niche,
      mainImage,
      mockupImages,
      cropRatios,
      productId,
      etsyListingId,
      status,
    } = body;

    if (!title) {
      return NextResponse.json(
        { error: "title is required" },
        { status: 400 }
      );
    }

    const db = getDb();
    const listingId = id || `wal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    // Upsert
    db.prepare(
      `INSERT INTO wall_art_listings
        (id, title, description, tags, price, category, niche, main_image, mockup_images, crop_ratios, product_id, etsy_listing_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        tags = excluded.tags,
        price = excluded.price,
        category = excluded.category,
        niche = excluded.niche,
        main_image = excluded.main_image,
        mockup_images = excluded.mockup_images,
        crop_ratios = excluded.crop_ratios,
        product_id = excluded.product_id,
        etsy_listing_id = excluded.etsy_listing_id,
        status = excluded.status,
        updated_at = excluded.updated_at`
    ).run(
      listingId,
      title,
      description || "",
      tags || "",
      price || 2.99,
      category || "wall_art",
      niche || "",
      mainImage || "",
      JSON.stringify(mockupImages || []),
      JSON.stringify(cropRatios || []),
      productId || "",
      etsyListingId || "",
      status || "draft",
      now,
      now
    );

    getDb().pragma('wal_checkpoint(TRUNCATE)');

    return NextResponse.json({ id: listingId, saved: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save listing";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE — delete a listing by id (passed as ?id=xxx)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const db = getDb();
    db.prepare("DELETE FROM wall_art_listings WHERE id = ?").run(id);
    getDb().pragma('wal_checkpoint(TRUNCATE)');

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete listing";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
