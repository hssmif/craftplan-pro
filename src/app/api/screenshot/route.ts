import { NextRequest, NextResponse } from "next/server";

// Uses microlink.io free tier (100 req/day, no API key needed)
// to screenshot a publicly published Notion page

export async function GET(request: NextRequest) {
  const pageUrl = request.nextUrl.searchParams.get("url");
  if (!pageUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  try {
    // Call microlink.io to get a screenshot (returns JSON metadata)
    const microlinkUrl = `https://api.microlink.io?url=${encodeURIComponent(pageUrl)}&screenshot=true&meta=false&viewport.width=1440&viewport.height=900&waitFor=2500`;

    const resp = await fetch(microlinkUrl, {
      headers: { "User-Agent": "CraftPlanDigital/1.0", "Accept": "application/json" },
    });

    const text = await resp.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Microlink returned unexpected response. Make sure the Notion page is published to web." },
        { status: 422 }
      );
    }

    if (!resp.ok || (data as { status?: string }).status !== "success") {
      const msg = (data as { message?: string }).message || `Microlink error ${resp.status}`;
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const screenshotData = (data as { data?: { screenshot?: { url?: string } } }).data?.screenshot;
    if (!screenshotData?.url) {
      return NextResponse.json(
        { error: "Screenshot URL not found in response — make sure the Notion page is published to web" },
        { status: 422 }
      );
    }

    const screenshotUrl = screenshotData.url;

    // Proxy the image so CORS isn't an issue in the browser
    const imgResp = await fetch(screenshotUrl);
    if (!imgResp.ok) {
      return NextResponse.json({ error: "Could not fetch screenshot image" }, { status: 502 });
    }

    const imgBuffer = await imgResp.arrayBuffer();
    const contentType = imgResp.headers.get("content-type") || "image/png";

    return new NextResponse(imgBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Screenshot failed" },
      { status: 500 }
    );
  }
}
