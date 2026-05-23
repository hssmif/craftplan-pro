// ─── Etsy CDN Image Proxy ─────────────────────────────────────────────
// Some Etsy CDN edges hotlink-block requests from non-Etsy origins
// (the browser sends a `Referer: http://localhost:3461/...` header which
// the CDN refuses). This server-side proxy lets us fetch the image
// without exposing the localhost referer to the CDN.
//
// TOS guardrails (per the user's hard rule "no Etsy TOS violations"):
//   - Hostname allow-list locks the proxy to known Etsy CDN edges
//     (i.etsystatic.com + img0/img1.etsystatic.com). No proxying of
//     etsy.com pages or arbitrary URLs.
//   - User-Agent identifies us as CraftPlan, not a browser. The
//     "Mozilla/5.0 (compatible; …)" prefix is the standard convention
//     for non-browser clients (RSS readers, search crawlers, etc.) so
//     servers that strict-filter on the Mozilla token still recognize
//     us — but the "(compatible; CraftPlan/1.0)" suffix makes our
//     identity explicit.
//   - Referer header is intentionally OMITTED. Setting `Referer:
//     https://www.etsy.com/` would be a spoofed origin claim and that
//     crosses the line set by the user's memory rule. We rely on the
//     CDN's behaviour with a missing Referer (most CDNs allow this).
//     If a particular edge still 403s, individual images surface as
//     the 🧵 fallback rather than the proxy growing a spoofed Referer.
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("missing url", { status: 400 });
  const allowed = ["i.etsystatic.com", "img0.etsystatic.com", "img1.etsystatic.com"];
  try {
    const parsed = new URL(url);
    if (!allowed.some((d) => parsed.hostname.endsWith(d))) {
      return new NextResponse("disallowed domain", { status: 403 });
    }
  } catch {
    return new NextResponse("invalid url", { status: 400 });
  }
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; CraftPlan/1.0)",
    },
  });
  if (!res.ok) {
    // Surface the real upstream status + URL so we can tell whether the
    // CDN is rejecting on Referer absence, the URL is signed-and-expired,
    // the hash is gone, etc. Without this every failure looks the same
    // to the browser and we end up guessing.
    console.error("image-proxy failed:", res.status, url);
    return new NextResponse("upstream error", { status: res.status });
  }
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
