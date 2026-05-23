import { NextRequest, NextResponse } from 'next/server';
import { createDigitalListing, uploadListingFile, uploadListingImage } from '@/lib/etsy-client';
import { updateProduct, getProduct } from '@/lib/db';
import { readFile } from 'fs/promises';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productId, title, description, price, tags } = body;

    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }

    const product = getProduct(productId);
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Create the listing on Etsy
    const listing = await createDigitalListing({
      title: title || product.title,
      description: description || product.description || '',
      price: price || product.price,
      tags: tags || (product.tags ? JSON.parse(product.tags) : []),
    });

    // Upload the digital file(s)
    const filePaths: string[] = product.file_paths ? JSON.parse(product.file_paths) : [];
    for (const filePath of filePaths) {
      try {
        const fileBuffer = await readFile(filePath);
        const filename = filePath.split('/').pop() || 'download.png';
        await uploadListingFile(listing.listing_id, Buffer.from(fileBuffer), filename);
      } catch (err) {
        console.error(`Failed to upload file ${filePath}:`, err);
      }
    }

    // Upload preview image
    if (product.preview_path) {
      try {
        const imageBuffer = await readFile(product.preview_path);
        const filename = product.preview_path.split('/').pop() || 'preview.png';
        await uploadListingImage(listing.listing_id, Buffer.from(imageBuffer), filename, 1);
      } catch (err) {
        console.error('Failed to upload preview image:', err);
      }
    }

    // Update product in database
    updateProduct(productId, {
      etsy_listing_id: String(listing.listing_id),
      etsy_status: 'draft',
    });

    return NextResponse.json({
      success: true,
      listing_id: listing.listing_id,
      url: listing.url,
    });
  } catch (error) {
    console.error('Create listing error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
