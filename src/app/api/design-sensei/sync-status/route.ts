// ── Design Sensei: Sync Status ──
// Polls Printful /sync/products to check if a product has synced to Etsy.
// Returns the list of synced products so the client can detect new ones.

import { NextRequest } from "next/server";

export const runtime = "nodejs";

const PRINTFUL_API = "https://api.printful.com";

export async function GET(req: NextRequest) {
  const printfulToken = process.env.PRINTFUL_API_KEY || process.env.PRINTFUL_TOKEN;
  if (!printfulToken) {
    return Response.json({ error: "PRINTFUL_API_KEY not configured" }, { status: 500 });
  }

  // Optional: filter by product title
  const searchTitle = req.nextUrl.searchParams.get("title") || "";

  try {
    const resp = await fetch(`${PRINTFUL_API}/sync/products?limit=20`, {
      headers: { Authorization: `Bearer ${printfulToken}` },
    });

    if (!resp.ok) {
      const err = await resp.text();
      return Response.json({ error: `Printful API error: ${err}` }, { status: resp.status });
    }

    const data = await resp.json();
    let products = data.result || [];

    // If a title filter was provided, match against it
    if (searchTitle) {
      const needle = searchTitle.toLowerCase();
      products = products.filter((p: { name?: string }) =>
        p.name?.toLowerCase().includes(needle)
      );
    }

    return Response.json({
      products,
      total: data.paging?.total || products.length,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
