// ═══ Listing Optimizer API ═════════════════════════════════════
// POST: generate pipe-formula titles, long-tail tags, smart price
// Uses Gemini if GEMINI_API_KEY is set, falls back to deterministic builder

import { NextRequest, NextResponse } from "next/server";
import {
  optimizeListing,
  calculateSmartPrice,
  type OptimizerOptions,
  type PriceStrategy,
  type CompetitorIntel,
  type ProductType,
} from "@/lib/listing-optimizer";

export const runtime = "nodejs";
export const maxDuration = 60;

interface RequestBody {
  subject: string;
  productType: ProductType;
  style?: string;
  niche?: string;
  competitor?: CompetitorIntel;
  strategy?: PriceStrategy;
  specs?: OptimizerOptions["specs"];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;

    if (!body.subject || typeof body.subject !== "string") {
      return NextResponse.json({ error: "subject is required" }, { status: 400 });
    }

    const validTypes: ProductType[] = ["cross-stitch", "wall-art", "printable", "digital"];
    if (!body.productType || !validTypes.includes(body.productType)) {
      return NextResponse.json(
        { error: `productType must be one of: ${validTypes.join(", ")}` },
        { status: 400 },
      );
    }

    const opts: OptimizerOptions = {
      subject: body.subject.trim(),
      productType: body.productType,
      style: body.style?.trim(),
      niche: body.niche?.trim(),
      competitor: body.competitor,
      strategy: body.strategy || "cold-traffic",
      specs: body.specs,
    };

    const result = await optimizeListing(opts);

    // Also return alternative price strategies for UI comparison
    const priceOptions = {
      coldTraffic: calculateSmartPrice(body.competitor, "cold-traffic"),
      marketMatch: calculateSmartPrice(body.competitor, "market-match"),
      premium: calculateSmartPrice(body.competitor, "premium"),
    };

    return NextResponse.json({
      ...result,
      priceOptions,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Listing optimization failed";
    console.error("[listing optimizer API] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
