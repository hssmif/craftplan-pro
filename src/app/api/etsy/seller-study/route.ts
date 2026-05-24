// ═══ /api/etsy/seller-study ══════════════════════════════════════════
// POST a SellerDeepScanResult (or a shop_id we fetch fresh) and get back
// a Gemini-generated playbook: title/description templates, tag strategy,
// pricing recommendation, mockup style notes, and concrete product ideas.
// If Gemini is unavailable we return a heuristic fallback so the UI
// always gets useful output.

import { NextRequest, NextResponse } from "next/server";
import { deepScanSeller } from "@/lib/etsy-seller-deep";
import { studySeller, fallbackPlaybook } from "@/lib/etsy-seller-study";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  let body: { shop_id?: string; scan?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const shopId = (body.shop_id || "").trim();
  if (!shopId && !body.scan) {
    return NextResponse.json(
      { error: "Provide either shop_id or a pre-computed scan payload" },
      { status: 400 },
    );
  }

  try {
    // If caller didn't send a scan, do one now (keeps the endpoint usable
    // standalone, e.g. from a direct link or saved workflow).
    const scan =
      body.scan && typeof body.scan === "object" && "listings" in (body.scan as object)
        ? (body.scan as Awaited<ReturnType<typeof deepScanSeller>>)
        : await deepScanSeller(shopId);

    const apiKey = process.env.GEMINI_API_KEY || "";
    let playbook;
    let source: "gemini" | "fallback" = "gemini";
    try {
      if (!apiKey) throw new Error("GEMINI_API_KEY missing");
      playbook = await studySeller(scan, apiKey);
    } catch (err) {
      console.warn("[seller-study] Gemini failed, using fallback:", err instanceof Error ? err.message : err);
      playbook = fallbackPlaybook(scan);
      source = "fallback";
    }

    return NextResponse.json({
      shop_id: scan.shop.shop_id,
      shop_name: scan.shop.shop_name,
      playbook,
      source,
      scanned_at: scan.scanned_at,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Seller study failed";
    console.error("[seller-study] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
