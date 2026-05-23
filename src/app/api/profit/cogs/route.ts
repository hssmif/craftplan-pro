// ══════════════════════════════════════════════════════════════
// Profit Tracker — COGS edit endpoint
// POST /api/profit/cogs
//   { listingId: number, cogs: number, notes?: string }
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { setListingCogs } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { listingId, cogs, notes } = body as {
      listingId: number;
      cogs: number;
      notes?: string;
    };

    if (!listingId || typeof cogs !== "number" || cogs < 0) {
      return NextResponse.json(
        { error: "listingId (number) and cogs (>= 0) required" },
        { status: 400 }
      );
    }

    setListingCogs(listingId, cogs, notes);
    return NextResponse.json({ success: true, listingId, cogs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
