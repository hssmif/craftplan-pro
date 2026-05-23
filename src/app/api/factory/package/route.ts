// ══════════════════════════════════════════════════════════════
// Factory Engine 6: Delivery Package API
// POST /api/factory/package
// Takes a completed factory run → builds ZIP package
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { buildFactoryPackage } from "@/lib/factory-delivery";
import { updateFactoryRun } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { factoryRunId } = body;

    if (!factoryRunId) {
      return NextResponse.json({ error: "Missing factoryRunId" }, { status: 400 });
    }

    const url = new URL(req.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    const result = await buildFactoryPackage(factoryRunId, baseUrl);

    // Store package asset ID on the factory run
    updateFactoryRun(factoryRunId, {
      packageAssetId: result.zipAssetId,
    });

    return NextResponse.json({
      success: true,
      ...result,
      package: result,
    });
  } catch (err) {
    console.error("[Factory Package]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Package creation failed" },
      { status: 500 }
    );
  }
}
