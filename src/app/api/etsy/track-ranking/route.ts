// POST /api/etsy/track-ranking
//
// For each of OUR active Etsy listings, search Etsy publicly for its
// target tag (or a passed-in keyword) and record the position the
// listing appears at.  Stored in `listing_ranking_history` so we can
// chart whether SEO tweaks moved a listing up or down.
//
// Body (optional):
//   { listing_ids?: string[] }  // only track these listings; default = all our active
//   { keywords?: Record<string, string[]> }  // override per-listing keywords; default = each listing's first 3 tags
//
// Schedule this hourly/daily via cron for a meaningful trend.  TOS-safe
// because it uses the official v3 findAllActiveListings endpoint, not
// browser scraping.  Phase 2 SEO 2026-05-17.
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getListings, searchListingsByKeyword } from "@/lib/etsy-client";

export const maxDuration = 300;
export const runtime = "nodejs";

interface OurListing {
  listing_id: number;
  title: string;
  tags?: string[];
  state?: string;
}

interface Body {
  listing_ids?: string[];
  keywords?: Record<string, string[]>;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    // 1. Pull our active listings from Etsy.
    const ourListings = (await getListings("active")) as OurListing[];
    let targets = ourListings;
    if (body.listing_ids && body.listing_ids.length > 0) {
      const wanted = new Set(body.listing_ids.map(String));
      targets = ourListings.filter((l) => wanted.has(String(l.listing_id)));
    }
    if (targets.length === 0) {
      return NextResponse.json({ checked: 0, message: "No active listings to track" });
    }

    const db = getDb();
    const insert = db.prepare(
      `INSERT INTO listing_ranking_history
         (listing_id, keyword, position, total_results, checked_at)
       VALUES (?, ?, ?, ?, ?)`,
    );

    const now = Date.now();
    let totalChecks = 0;
    const results: Array<{ listing_id: string; keyword: string; position: number }> = [];

    for (const listing of targets) {
      const id = String(listing.listing_id);
      const keywords = body.keywords?.[id] ?? (listing.tags || []).slice(0, 3);
      for (const kw of keywords) {
        if (!kw) continue;
        try {
          const hits = await searchListingsByKeyword(kw, 100);
          const idx = hits.findIndex((h) => String(h.listing_id) === id);
          const position = idx === -1 ? 0 : idx + 1; // 0 = not in top 100
          insert.run(id, kw, position, hits.length, now);
          results.push({ listing_id: id, keyword: kw, position });
          totalChecks++;
          // 250ms breather to stay well under Etsy's 10 req/s cap.
          await new Promise((r) => setTimeout(r, 250));
        } catch (err) {
          console.warn(`[track-ranking] ${id} / "${kw}":`, (err as Error).message);
        }
      }
    }

    return NextResponse.json({
      checked: totalChecks,
      listings: targets.length,
      results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[track-ranking] fatal:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/etsy/track-ranking
//   Returns ranking history for our listings.
//   Query: ?listing_id=X (optional, default = all)
//          &days=7 (optional, default = 30)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const listingId = url.searchParams.get("listing_id");
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const db = getDb();
  let rows: unknown[];
  if (listingId) {
    rows = db
      .prepare(
        `SELECT listing_id, keyword, position, total_results, checked_at
         FROM listing_ranking_history
         WHERE listing_id = ? AND checked_at > ?
         ORDER BY checked_at DESC, keyword`,
      )
      .all(listingId, cutoff);
  } else {
    rows = db
      .prepare(
        `SELECT listing_id, keyword, position, total_results, checked_at
         FROM listing_ranking_history
         WHERE checked_at > ?
         ORDER BY checked_at DESC, listing_id, keyword
         LIMIT 1000`,
      )
      .all(cutoff);
  }
  return NextResponse.json({ rows });
}
