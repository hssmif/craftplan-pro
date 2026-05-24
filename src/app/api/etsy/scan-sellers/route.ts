// ═══ /api/etsy/scan-sellers ═════════════════════════════════════════
// Scans the top-selling Etsy shops in a niche and returns ranked velocity
// metrics (24h / 7d / 14d / 30d) + each seller's best listing so the user
// can study what's converting right now.

import { NextRequest, NextResponse } from "next/server";
import { scanTopSellers } from "@/lib/etsy-seller-scanner";

export const runtime = "nodejs";
export const maxDuration = 60;
// Never cache scan results — users expect "scan now" to pull live data so a
// sale made 5 minutes ago shows up on refresh.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const niche = (searchParams.get("niche") || "").trim();
  const maxSellers = parseInt(searchParams.get("max") || "10");
  const listingsToScan = parseInt(searchParams.get("listings") || "60");

  if (!niche) {
    return NextResponse.json({ error: "niche is required" }, { status: 400 });
  }

  try {
    const result = await scanTopSellers({
      niche,
      maxSellers: Math.min(15, Math.max(3, maxSellers)),
      listingsToScan: Math.min(100, Math.max(20, listingsToScan)),
    });
    return NextResponse.json(result, {
      headers: {
        // Belt-and-suspenders: tell any intermediate cache (CDN, browser) to
        // never reuse this response.
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Seller scan failed";
    if (msg.includes("ETSY_CLIENT_ID")) {
      return NextResponse.json(
        { error: "Etsy API not configured. Add ETSY_CLIENT_ID to .env.local" },
        { status: 500 },
      );
    }
    console.error("[scan-sellers] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
