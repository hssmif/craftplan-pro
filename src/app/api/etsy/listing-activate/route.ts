import { NextRequest, NextResponse } from 'next/server';
import { activateListing } from '@/lib/etsy-client';
import { updateProduct } from '@/lib/db';

// Flip an Etsy listing from draft → active (LIVE). This is the explicit
// user-approved publish step triggered by the "List on Etsy Live" button.
//
// Optionally accepts productId so we can keep the local DB row in sync.
export async function POST(request: NextRequest) {
  try {
    const { listingId, productId, confirmLivePublish } = await request.json();

    if (!listingId) {
      return NextResponse.json({ error: 'listingId is required' }, { status: 400 });
    }

    if (confirmLivePublish !== true) {
      return NextResponse.json(
        { error: 'Explicit live-publish confirmation is required before activating an Etsy listing.' },
        { status: 403 },
      );
    }

    await activateListing(listingId);

    // Keep our local DB row in sync so dashboards show the correct state.
    if (productId) {
      try {
        updateProduct(Number(productId), {
          etsy_listing_id: String(listingId),
          etsy_status: 'active',
        });
      } catch (dbErr) {
        console.warn('[listing-activate] DB sync failed (non-fatal):', dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      listing_id: listingId,
      state: 'active',
      url: `https://www.etsy.com/listing/${listingId}`,
    });
  } catch (error) {
    console.error('Activate listing error:', error);
    const message = error instanceof Error ? error.message : 'Activation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
