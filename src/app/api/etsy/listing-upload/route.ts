import { NextRequest, NextResponse } from 'next/server';
import { uploadListingImage, uploadListingFile } from '@/lib/etsy-client';
import { uploadListingVideo } from '@/lib/etsy-video';

// Upload a single image, video, or digital file to an existing Etsy listing
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { listingId, image, video, file, filename, rank, altText } = body;

    if (!listingId) {
      return NextResponse.json({ error: 'listingId is required' }, { status: 400 });
    }

    // Digital file upload (PDF etc.) for digital downloads
    if (file) {
      const fileClean = file.replace(/^data:[^;]+;base64,/, '');
      const fileBuffer = Buffer.from(fileClean, 'base64');
      await uploadListingFile(listingId, fileBuffer, filename || 'digital-download.pdf');
      return NextResponse.json({ success: true, type: 'file', filename });
    }

    if (image) {
      const imgClean = image.replace(/^data:[^;]+;base64,/, '');
      const imgBuffer = Buffer.from(imgClean, 'base64');
      await uploadListingImage(listingId, imgBuffer, `listing_image_${rank || 1}.png`, rank || 1, altText);
      return NextResponse.json({ success: true, type: 'image', rank });
    }

    if (video) {
      const videoClean = video.replace(/^data:[^;]+;base64,/, '');
      const videoBuffer = Buffer.from(videoClean, 'base64');
      await uploadListingVideo(listingId, videoBuffer, 'listing-video.mp4');
      return NextResponse.json({ success: true, type: 'video' });
    }

    return NextResponse.json({ error: 'image, video, or file is required' }, { status: 400 });
  } catch (error) {
    console.error('Upload error:', error);
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
