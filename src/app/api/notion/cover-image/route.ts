import { NextRequest } from "next/server";

/**
 * AI Cover Image Proxy
 *
 * Fetches AI-generated images from Pollinations/Flux server-side and proxies them
 * through our own domain. This solves two problems:
 * 1. Ad blockers that block image.pollinations.ai in the browser
 * 2. Mixed content issues (Notion HTTPS loading HTTP resources)
 *
 * URL: /api/notion/cover-image?prompt=...&seed=...
 *
 * In development: http://localhost:3461/api/notion/cover-image?...
 *   → localhost HTTP is allowed from HTTPS pages (Chrome security exception)
 *
 * In production: https://yourdomain.com/api/notion/cover-image?...
 *   → Set NEXT_PUBLIC_BASE_URL=https://yourdomain.com in .env.local
 */

const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const prompt = searchParams.get("prompt") || "";
  const seed = searchParams.get("seed") || "0";
  const width = searchParams.get("w") || "1600";
  const height = searchParams.get("h") || "400";

  if (!prompt) {
    return new Response("Missing prompt parameter", { status: 400 });
  }

  const pollinationsUrl = `${POLLINATIONS_BASE}/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=flux&enhance=true`;

  try {
    const resp = await fetch(pollinationsUrl, {
      signal: AbortSignal.timeout(60_000),
    });

    if (!resp.ok) {
      return new Response(`Image generation failed: ${resp.status}`, { status: 502 });
    }

    const buffer = await resp.arrayBuffer();
    const contentType = resp.headers.get("content-type") || "image/jpeg";

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        // Images are deterministic (same prompt+seed = same image), cache forever
        "Cache-Control": "public, max-age=31536000, immutable",
        // Allow Notion (notion.so) to load this image cross-origin
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
      },
    });
  } catch (err) {
    console.error("[cover-image proxy] Error:", err);
    return new Response("Image generation error", { status: 500 });
  }
}
