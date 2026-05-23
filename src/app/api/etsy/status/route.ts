// ── Etsy Connection Status Check ──
// Returns whether the user has valid Etsy tokens stored + token health info

import { NextResponse } from "next/server";
import { getEtsyTokens } from "@/lib/db";

export async function GET() {
  try {
    const tokens = getEtsyTokens();
    if (tokens?.access_token && tokens?.shop_id) {
      const expiresAt = tokens.expires_at;
      const isExpired = Date.now() > expiresAt;
      const expiresIn = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));

      return NextResponse.json({
        connected: true,
        shopId: tokens.shop_id,
        tokenHealth: isExpired
          ? "expired"
          : expiresIn < 300
            ? "expiring-soon"
            : "healthy",
        expiresIn, // seconds until expiry
      });
    }
    return NextResponse.json({ connected: false });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
