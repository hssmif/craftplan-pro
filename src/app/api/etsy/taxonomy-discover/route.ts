// GET /api/etsy/taxonomy-discover?q=cross-stitch
//
// Walks Etsy's seller-taxonomy tree and returns every node whose
// name matches the query (default: cross-stitch).  Used to find
// the correct taxonomy_id for our cross-stitch pattern listings.
// Read-only, no Etsy data is modified.
import { NextRequest, NextResponse } from "next/server";
import { getApiKeyHeader } from "@/lib/etsy-auth";

export const runtime = "nodejs";

const ETSY_API_URL = "https://openapi.etsy.com/v3";

interface TaxonomyNode {
  id: number;
  name: string;
  level: number;
  parent_id: number | null;
  full_path_taxonomy_ids: number[];
  children?: TaxonomyNode[];
}

function flatten(nodes: TaxonomyNode[], out: TaxonomyNode[] = []): TaxonomyNode[] {
  for (const n of nodes) {
    out.push(n);
    if (n.children?.length) flatten(n.children, out);
  }
  return out;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "cross").toLowerCase();

  const apiKey = getApiKeyHeader();
  const resp = await fetch(
    `${ETSY_API_URL}/application/seller-taxonomy/nodes`,
    { headers: { "x-api-key": apiKey } },
  );
  if (!resp.ok) {
    const t = await resp.text();
    return NextResponse.json(
      { error: `Etsy taxonomy fetch HTTP ${resp.status}: ${t.slice(0, 200)}` },
      { status: 500 },
    );
  }
  const data = (await resp.json()) as { results: TaxonomyNode[] };
  const all = flatten(data.results);
  const matches = all
    .filter((n) => n.name.toLowerCase().includes(q))
    .map((n) => ({
      id: n.id,
      name: n.name,
      level: n.level,
      parent_id: n.parent_id,
      path: n.full_path_taxonomy_ids,
    }));

  return NextResponse.json({ q, total: matches.length, matches });
}
