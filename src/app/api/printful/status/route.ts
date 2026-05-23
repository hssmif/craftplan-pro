// ── Printful Connection Status ──
// Tests Printful API connection and returns store info + store type.
// Auth: Bearer ${process.env.PRINTFUL_API_KEY}

import { NextRequest, NextResponse } from "next/server";
import { getStore, detectStoreType, getPrintfulToken } from "@/lib/printful-client";

export async function GET(req: NextRequest) {
  try {
    // Priority: header (from settings UI) → PRINTFUL_API_KEY → PRINTFUL_TOKEN
    const token =
      req.headers.get("x-printful-token") || getPrintfulToken();

    if (!token) {
      return NextResponse.json(
        { connected: false, error: "No Printful token configured. Set PRINTFUL_API_KEY in .env.local" },
        { status: 400 }
      );
    }

    // Detect store type (API_STORE vs CONNECTED_STORE)
    const { storeType, storeName, storeId } = await detectStoreType(token);

    // Get full store info if possible
    let store: { id: number; name: string; type: string; currency: string } | null = null;
    try {
      const storeInfo = await getStore(token);
      store = {
        id: storeInfo.id,
        name: storeInfo.name,
        type: storeInfo.type,
        currency: storeInfo.currency,
      };
    } catch {
      // Use info from detectStoreType if getStore fails
      store = { id: storeId, name: storeName, type: storeType, currency: "USD" };
    }

    return NextResponse.json({
      connected: true,
      store,
      storeType,
    });
  } catch (err) {
    console.error("[Printful Status] Error:", err);
    const message = err instanceof Error ? err.message : "Connection failed";

    // Provide specific error guidance
    let hint = "";
    if (message.includes("401") || message.includes("Unauthorized")) {
      hint = " Check that PRINTFUL_API_KEY is correct in .env.local";
    } else if (message.includes("403") || message.includes("Forbidden")) {
      hint = " The token may not have the required API scopes";
    }

    return NextResponse.json({
      connected: false,
      error: message + hint,
    });
  }
}
