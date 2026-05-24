import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

// Standard print sizes at 300 DPI
const PRINT_SIZES: Record<string, { width: number; height: number }> = {
  '8x10': { width: 2400, height: 3000 },
  '11x14': { width: 3300, height: 4200 },
  '12x16': { width: 3600, height: 4800 },
  '16x20': { width: 4800, height: 6000 },
  '18x24': { width: 5400, height: 7200 },
  '24x36': { width: 7200, height: 10800 },
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File | null;
    const sizeKey = (formData.get('size') as string) || '12x16';
    const productId = formData.get('productId') as string;

    if (!file) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    const size = PRINT_SIZES[sizeKey] || PRINT_SIZES['12x16'];
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upscale to print resolution (300 DPI)
    const upscaled = await sharp(buffer)
      .resize(size.width, size.height, {
        fit: 'cover',
        kernel: sharp.kernel.lanczos3,
      })
      .png({ quality: 100 })
      .withMetadata({ density: 300 })
      .toBuffer();

    // Save to output directory
    const outputDir = path.join(process.cwd(), 'data', 'outputs');
    await mkdir(outputDir, { recursive: true });

    const timestamp = Date.now();
    const filename = `wallart_${productId || 'temp'}_${sizeKey}_${timestamp}.png`;
    const outputPath = path.join(outputDir, filename);

    await writeFile(outputPath, upscaled);

    // Also create a preview (smaller version for listing images)
    const preview = await sharp(buffer)
      .resize(1200, 1600, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
      .png({ quality: 90 })
      .toBuffer();

    const previewFilename = `preview_${productId || 'temp'}_${timestamp}.png`;
    const previewPath = path.join(outputDir, previewFilename);
    await writeFile(previewPath, preview);

    return NextResponse.json({
      success: true,
      outputPath,
      previewPath,
      size: sizeKey,
      dimensions: size,
      fileSize: upscaled.length,
    });
  } catch (error) {
    console.error('Upscale error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
