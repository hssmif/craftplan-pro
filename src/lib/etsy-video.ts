// Standalone video-upload helper — kept in its own module so
// listing-upload/route.ts can import it without pulling in the full
// etsy-client barrel (which Turbopack's static-export scanner was
// failing to parse correctly when the function lived there).
import { getValidToken, getApiKeyHeader } from './etsy-auth';
import { getEtsyTokens } from './db';

const ETSY_API_URL = 'https://openapi.etsy.com/v3';

function getShopId(): string {
  const tokens = getEtsyTokens();
  if (!tokens?.shop_id) throw new Error('No shop ID found. Please reconnect your Etsy account.');
  return tokens.shop_id;
}

export async function uploadListingVideo(
  listingId: number,
  videoBuffer: Buffer,
  filename: string,
): Promise<void> {
  const shopId = getShopId();
  const token = await getValidToken();
  const apiKey = getApiKeyHeader();

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' });
  formData.append('video', blob, filename);
  formData.append('name', filename);

  const resp = await fetch(
    `${ETSY_API_URL}/application/shops/${shopId}/listings/${listingId}/videos`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-api-key': apiKey,
      },
      body: formData,
    },
  );

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Failed to upload listing video: ${error}`);
  }
}
