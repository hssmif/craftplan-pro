// ── Printful Catalog ──
// Returns curated POD catalog with live product details and variants.
// Caches product metadata in memory (5-min TTL).
// Variant fetching includes retry logic (3 attempts).

import { NextRequest, NextResponse } from "next/server";
import {
  POD_CATALOG,
  getCatalogProductInfo,
  getCatalogVariants,
  getPrintfulToken,
  type PrintfulCatalogVariant,
} from "@/lib/printful-client";

// In-memory cache
interface CacheEntry {
  data: unknown;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
}

/** Fetch with retry — retries up to `maxRetries` on failure */
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[Printful Catalog] Attempt ${attempt}/${maxRetries} failed: ${lastError.message}`);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, delayMs * attempt));
      }
    }
  }
  throw lastError!;
}

export async function GET(req: NextRequest) {
  try {
    // Token resolution: header → PRINTFUL_API_KEY → PRINTFUL_TOKEN
    const token =
      req.headers.get("x-printful-token") || getPrintfulToken();
    const productId = req.nextUrl.searchParams.get("productId");

    if (!token) {
      return NextResponse.json(
        { error: "No Printful token configured. Set PRINTFUL_API_KEY in .env.local" },
        { status: 400 }
      );
    }

    // If specific product requested → return variants with pricing (with retry)
    if (productId) {
      const cacheKey = `variants_${productId}`;
      const cached = getCached<PrintfulCatalogVariant[]>(cacheKey);
      if (cached) {
        return NextResponse.json({ variants: cached });
      }

      const variants = await fetchWithRetry(
        () => getCatalogVariants(token, Number(productId)),
        3
      );
      setCache(cacheKey, variants);
      return NextResponse.json({ variants });
    }

    // Default: return curated catalog with product details
    const catalog: Record<string, {
      label: string;
      icon: string;
      items: Array<{
        name: string;
        productId: number;
        icon: string;
        margin: string;
        title?: string;
        description?: string;
        image?: string;
      }>;
    }> = {};

    for (const [category, data] of Object.entries(POD_CATALOG)) {
      const items = [];
      for (const item of data.items) {
        const cacheKey = `product_${item.productId}`;
        let details = getCached<{ title: string; description: string; image: string }>(cacheKey);

        if (!details) {
          try {
            const info = await fetchWithRetry(
              () => getCatalogProductInfo(token, item.productId),
              3
            );
            details = {
              title: info.product?.title || item.name,
              description: info.product?.description || "",
              image: info.product?.image || "",
            };
            setCache(cacheKey, details);
          } catch {
            // Product not found — use catalog defaults
            details = { title: item.name, description: "", image: "" };
          }
        }

        items.push({
          ...item,
          title: details.title,
          description: details.description,
          image: details.image,
        });
      }
      catalog[category] = { label: data.label, icon: data.icon, items };
    }

    return NextResponse.json({ catalog });
  } catch (err) {
    console.error("[Printful Catalog] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load catalog" },
      { status: 500 }
    );
  }
}
