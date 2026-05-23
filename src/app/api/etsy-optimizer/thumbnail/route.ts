// ═══ Thumbnail Builder API ══════════════════════════════════════
// POST: generate optimized Etsy thumbnail(s) with text overlays
// Returns base64 data URL(s) ready to download or upload to Etsy

import { NextRequest, NextResponse } from "next/server";
import {
  buildThumbnail,
  buildAllThumbnailVariants,
  type ThumbnailStyle,
  type ThumbnailOptions,
} from "@/lib/thumbnail-builder";

export const runtime = "nodejs";
export const maxDuration = 60;

interface RequestBody {
  images: string[];                         // base64 data URLs or raw base64
  style?: ThumbnailStyle | "all";           // single style or "all" to get every variant
  badges?: ThumbnailOptions["badges"];
  accentColor?: string;
  width?: number;
  height?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;

    if (!body.images || !Array.isArray(body.images) || body.images.length === 0) {
      return NextResponse.json({ error: "images array is required" }, { status: 400 });
    }

    // Validate base64 inputs
    for (let i = 0; i < body.images.length; i++) {
      if (typeof body.images[i] !== "string" || body.images[i].length < 100) {
        return NextResponse.json(
          { error: `images[${i}] must be a base64 string or data URL` },
          { status: 400 },
        );
      }
    }

    const { style = "hero-badges", badges, accentColor, width, height } = body;

    if (style === "all") {
      const variants = await buildAllThumbnailVariants(body.images, badges, accentColor);
      return NextResponse.json({ variants });
    }

    const buf = await buildThumbnail({
      images: body.images,
      style: style as ThumbnailStyle,
      badges,
      accentColor,
      width,
      height,
    });

    return NextResponse.json({
      style,
      dataUrl: `data:image/png;base64,${buf.toString("base64")}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Thumbnail build failed";
    console.error("[thumbnail API] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
