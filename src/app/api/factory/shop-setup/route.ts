// ══════════════════════════════════════════════════════════════
// Shop Trust Setup API
//
// POST /api/factory/shop-setup
//   Updates shop announcement & digital download message
//   for maximum buyer trust and conversion.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { updateShop } from "@/lib/etsy-client";
import { getEtsyTokens } from "@/lib/db";

const SHOP_ANNOUNCEMENT = `Welcome to CraftPlan Digital!

We make beautiful, easy-to-use Google Sheets templates that help you organize your life and money.

Every template includes:
- Automatic formulas (no manual math)
- Clean, modern design
- Works on desktop, tablet, and phone
- Instant digital download

New templates added regularly. Follow our shop for updates!`;

const DIGITAL_DOWNLOAD_MESSAGE = `Thank you for your purchase!

Your template is ready:

1. Open the PDF file you just downloaded
2. Click the Google Sheets link inside
3. Click "Make a copy" when Google asks
4. Your copy saves to your Google Drive — start customizing!

Works on any device with Google Sheets (desktop, tablet, phone).

Need help? Message us — we reply within 24 hours.`;

export async function POST(req: NextRequest) {
  try {
    // Verify Etsy connection
    const tokens = getEtsyTokens();
    if (!tokens?.access_token || !tokens?.shop_id) {
      return NextResponse.json(
        { error: "Etsy not connected. Go to Settings to connect." },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const announcement = body.announcement || SHOP_ANNOUNCEMENT;
    const digitalMessage = body.digitalMessage || DIGITAL_DOWNLOAD_MESSAGE;

    await updateShop({
      announcement,
      digital_sale_message: digitalMessage,
    });

    return NextResponse.json({
      success: true,
      message: "Shop announcement and digital download message updated.",
    });
  } catch (err) {
    console.error("[Shop Setup]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Shop setup failed" },
      { status: 500 },
    );
  }
}
