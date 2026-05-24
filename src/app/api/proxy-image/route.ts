// ── Image Proxy ──
// Fetches an image URL server-side and returns base64.
// Needed because Etsy CDN blocks cross-origin (CORS) requests from the browser.

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    // Only allow image URLs from known CDNs
    const allowed = [
      "i.etsystatic.com",
      "img.etsystatic.com",
      "i.imgur.com",
      "images.unsplash.com",
    ];
    const parsed = new URL(url);
    if (!allowed.some(d => parsed.hostname === d || parsed.hostname.endsWith("." + d))) {
      return NextResponse.json({ error: "URL domain not allowed" }, { status: 403 });
    }

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CraftPlan/1.0)",
        Accept: "image/*",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      return NextResponse.json({ error: `Fetch failed: ${resp.status}` }, { status: resp.status });
    }

    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await resp.arrayBuffer();

    if (arrayBuffer.byteLength < 100) {
      return NextResponse.json({ error: "Image too small" }, { status: 400 });
    }

    const base64 = Buffer.from(arrayBuffer).toString("base64");

    return NextResponse.json({
      base64,
      mimeType: contentType,
      size: arrayBuffer.byteLength,
    });
  } catch (err) {
    console.error("[Proxy Image] Error:", err);
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 });
  }
}
