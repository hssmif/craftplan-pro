// ── Etsy Publish PDF Listing ──
// Accepts FormData with PDF file, mockup images, and listing metadata.
// Creates a draft listing, uploads the PDF as a digital file, uploads mockup images.

import { NextRequest, NextResponse } from "next/server";
import {
  createDigitalListing,
  uploadListingFile,
  uploadListingImage,
  activateListing,
} from "@/lib/etsy-client";
import { getEtsyTokens } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    // Check auth
    const tokens = getEtsyTokens();
    if (!tokens?.access_token || !tokens?.shop_id) {
      return NextResponse.json(
        { error: "Not connected to Etsy. Please connect your account first." },
        { status: 401 }
      );
    }

    const formData = await req.formData();

    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const price = parseFloat(formData.get("price") as string);
    const tagsJson = formData.get("tags") as string;
    const tags = JSON.parse(tagsJson || "[]");
    const activate = formData.get("activate") === "true";
    const pdfFilename = (formData.get("pdfFilename") as string) || "planner.pdf";
    const pdfFile = formData.get("pdf") as Blob | null;

    if (!title || !description || !price) {
      return NextResponse.json(
        { error: "Missing required fields: title, description, price" },
        { status: 400 }
      );
    }

    // 1. Create draft listing
    const listing = await createDigitalListing({
      title,
      description,
      price,
      tags,
    });

    // 2. Upload PDF file
    if (pdfFile) {
      const buffer = Buffer.from(await pdfFile.arrayBuffer());
      await uploadListingFile(listing.listing_id, buffer, pdfFilename);
    }

    // 3. Upload mockup images (up to 10)
    for (let i = 0; i < 10; i++) {
      const mockupBlob = formData.get(`mockup_${i}`) as Blob | null;
      if (!mockupBlob) break;
      const buffer = Buffer.from(await mockupBlob.arrayBuffer());
      await uploadListingImage(listing.listing_id, buffer, `mockup-${i + 1}.png`, i + 1);
    }

    // 4. Optionally activate (publish live)
    if (activate) {
      await activateListing(listing.listing_id);
    }

    return NextResponse.json({
      success: true,
      listingId: listing.listing_id,
      url: listing.url,
      status: activate ? "active" : "draft",
    });
  } catch (err: unknown) {
    console.error("[Etsy Publish PDF] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to publish listing" },
      { status: 500 }
    );
  }
}
