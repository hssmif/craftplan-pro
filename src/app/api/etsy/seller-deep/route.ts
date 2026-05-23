// ═══ /api/etsy/seller-deep ═══════════════════════════════════════════
// Deep-scans one specific Etsy shop. Returns every signal the tool
// needs to reverse-engineer the seller's strategy: all listings,
// pricing stats, title/tag/description patterns, review sentiment,
// image gallery for style reference.

import { NextRequest, NextResponse } from "next/server";
import { deepScanSeller } from "@/lib/etsy-seller-deep";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const shopId = (searchParams.get("shop_id") || "").trim();

  if (!shopId) {
    return NextResponse.json({ error: "shop_id is required" }, { status: 400 });
  }

  try {
    const result = await deepScanSeller(shopId);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Deep scan failed";
    if (msg.includes("ETSY_CLIENT_ID") || msg.includes("not configured")) {
      return NextResponse.json(
        { error: "Etsy API not configured. Add ETSY_CLIENT_ID to .env.local" },
        { status: 500 },
      );
    }
    console.error("[seller-deep] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
