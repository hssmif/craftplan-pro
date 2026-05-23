// ── Etsy Image Preparation ──
// Downloads Printful mockup URLs server-side and returns base64 data URLs.
// This avoids CORS / browser-fetch failures when the client tries to
// download remote Printful CDN images directly.

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60; // allow up to 60s for large batches

export async function POST(req: NextRequest) {
  try {
    const { urls } = (await req.json()) as { urls: string[] };

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { error: "Request body must include a non-empty `urls` array" },
        { status: 400 }
      );
    }

    // Cap at 10 images (Etsy allows max 10 listing photos)
    const toFetch = urls.slice(0, 10);

    const results: { url: string; dataUrl: string | null; error?: string }[] =
      await Promise.all(
        toFetch.map(async (url) => {
          try {
            const resp = await fetch(url, {
              headers: {
                // Some CDNs require a browser-like UA
                "User-Agent":
                  "Mozilla/5.0 (compatible; CraftPlan/1.0; image-prep)",
              },
            });

            if (!resp.ok) {
              return {
                url,
                dataUrl: null,
                error: `HTTP ${resp.status} ${resp.statusText}`,
              };
            }

            const contentType =
              resp.headers.get("content-type") || "image/png";
            const buffer = await resp.arrayBuffer();
            const base64 = Buffer.from(buffer).toString("base64");
            const dataUrl = `data:${contentType};base64,${base64}`;

            return { url, dataUrl };
          } catch (err) {
            return {
              url,
              dataUrl: null,
              error: err instanceof Error ? err.message : "Fetch failed",
            };
          }
        })
      );

    const succeeded = results.filter((r) => r.dataUrl !== null);
    const failed = results.filter((r) => r.dataUrl === null);

    return NextResponse.json({
      images: succeeded.map((r) => r.dataUrl),
      fetchedCount: succeeded.length,
      failedCount: failed.length,
      errors: failed.length > 0 ? failed.map((r) => ({ url: r.url, error: r.error })) : undefined,
    });
  } catch (err) {
    console.error("[Etsy Prepare Images] Error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Image preparation failed",
      },
      { status: 500 }
    );
  }
}
