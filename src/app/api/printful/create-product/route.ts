// ── Printful Create Product ──
// Creates a product on Printful and pushes it to the connected store (e.g. Etsy).
// Works for both Manual/API stores and platform-connected stores.

import { NextRequest, NextResponse } from "next/server";
import { createAndPushProduct, getPrintfulToken, type ProductTemplateInput } from "@/lib/printful-client";

export async function POST(req: NextRequest) {
  try {
    const token =
      req.headers.get("x-printful-token") || getPrintfulToken();

    if (!token) {
      return NextResponse.json({ error: "No token" }, { status: 400 });
    }

    const body = await req.json();
    const {
      title,
      description,
      variants,
      fileId,
      fileUrl,
      placement = "front",
      tags,
      catalogProductId,
    } = body;

    if (!variants || !variants.length || (!fileId && !fileUrl)) {
      return NextResponse.json(
        { error: "Missing required fields: variants, and either fileId or fileUrl" },
        { status: 400 }
      );
    }

    // Build retail price map
    const retailPrices: Record<number, number> = {};
    const variantIds: number[] = [];
    for (const v of variants as Array<{ variantId: number; retailPrice: number }>) {
      variantIds.push(v.variantId);
      retailPrices[v.variantId] = v.retailPrice;
    }

    const input: ProductTemplateInput = {
      title: title || "POD Product",
      description: description || "",
      catalogProductId: catalogProductId || 71, // default to t-shirt
      variantIds,
      retailPrices,
      fileUrl: fileUrl || "",
      fileId: fileId || undefined,
      placement,
      tags: tags || [],
    };

    const result = await createAndPushProduct(token, input);

    return NextResponse.json({
      productId: result.templateId,
      pushed: result.pushed,
      variantCount: variantIds.length,
      error: result.error,
    });
  } catch (err) {
    console.error("[Printful Create Product] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Product creation failed" },
      { status: 500 }
    );
  }
}
