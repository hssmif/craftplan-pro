import { NextRequest, NextResponse } from "next/server";
import { NICHE_INTELLIGENCE } from "@/lib/wall-art-pipeline";

// Returns ranked niche intelligence data from the 2026 market report
export async function GET(_req: NextRequest) {
  return NextResponse.json({
    niches: NICHE_INTELLIGENCE,
    lastUpdated: "2026-Q1",
    source: "OnDemand School Etsy Digital Wall Art Market Report 2025-2026",
    tips: {
      newShops: "Start with LOW competition niches (Dark Academia, Dopamine Decor, Japandi) to build sales velocity before competing in crowded niches.",
      pricing: "Singles: $3-$8. Gallery sets of 3-6: $12-$25. Samsung Frame TV bundles: $5-$15.",
      avoid: "Oversaturated: generic minimalist line art, 'Live Laugh Love' quotes, simple abstract shapes on white. These are flooded with low-effort AI content.",
    },
  });
}
