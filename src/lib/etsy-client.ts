import { getValidToken, getApiKeyHeader } from './etsy-auth';
import { getEtsyTokens } from './db';

// Re-export marker so Turbopack's static-export scanner sees this symbol
// at the top of the module (avoids stale-cache "export doesn't exist" build error).
export type { }; // keep module as ESM

const ETSY_API_URL = 'https://openapi.etsy.com/v3';

async function etsyFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getValidToken();
  // Etsy v3 requires "keystring:shared_secret" — bare CLIENT_ID 403s
  // with "Shared secret is required in x-api-key header."  See
  // getApiKeyHeader() in etsy-auth for the helper.
  const apiKey = getApiKeyHeader();

  const response = await fetch(`${ETSY_API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-api-key': apiKey,
      ...options.headers,
    },
  });

  return response;
}

function getShopId(): string {
  const tokens = getEtsyTokens();
  if (!tokens?.shop_id) throw new Error('No shop ID found. Please reconnect your Etsy account.');
  return tokens.shop_id;
}

// --- Shop Info ---

export async function getShopInfo(): Promise<{ shop_id: number; shop_name: string; url: string }> {
  const token = await getValidToken();
  // Etsy v3 requires "keystring:shared_secret" — bare CLIENT_ID 403s
  // with "Shared secret is required in x-api-key header."  See
  // getApiKeyHeader() in etsy-auth for the helper.
  const apiKey = getApiKeyHeader();

  // Step 1: GET /users/me — this response already contains `shop_id`
  // directly per the Etsy v3 docs, so we don't need the legacy
  // GET /users/{user_id}/shops lookup the older implementation did
  // (which returned a non-paginated shape some accounts also 404'd on).
  const userResp = await fetch(`${ETSY_API_URL}/application/users/me`, {
    headers: { Authorization: `Bearer ${token}`, 'x-api-key': apiKey },
  });
  if (!userResp.ok) throw new Error(`Failed to get user info: ${await userResp.text()}`);
  const user = await userResp.json();

  if (!user.shop_id) throw new Error('No shop found for this Etsy account.');

  // Step 2: GET /shops/{shop_id} — canonical single-shop lookup that
  // returns shop_name + url + the rest of the public shop fields.
  const shopResp = await fetch(`${ETSY_API_URL}/application/shops/${user.shop_id}`, {
    headers: { Authorization: `Bearer ${token}`, 'x-api-key': apiKey },
  });
  if (!shopResp.ok) throw new Error(`Failed to get shop details: ${await shopResp.text()}`);
  const shop = await shopResp.json();

  return {
    shop_id: shop.shop_id,
    shop_name: shop.shop_name,
    url: shop.url,
  };
}

export async function updateShop(data: Record<string, unknown>): Promise<unknown> {
  const shopId = getShopId();
  const resp = await etsyFetch(`/application/shops/${shopId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Failed to update shop: ${error}`);
  }

  return resp.json().catch(() => ({}));
}

// --- Listings ---

export interface CreateListingData {
  title: string;
  description: string;
  price: number;
  tags: string[];
  quantity?: number;
  taxonomy_id?: number;
}

/** Create a POD physical listing (draft). Printful handles shipping once connected. */
export async function createPODListing(data: CreateListingData & {
  shippingProfileId?: number;
}): Promise<{ listing_id: number; url: string }> {
  const shopId = getShopId();

  const body: Record<string, unknown> = {
    title: data.title.substring(0, 140),
    description: data.description,
    price: data.price,
    quantity: data.quantity || 999,
    tags: data.tags.slice(0, 13),
    who_made: 'i_did',
    when_made: '2020_2025',
    taxonomy_id: data.taxonomy_id || 482, // Clothing > Shirts & Tees
    is_supply: false,
    is_digital: false,
    type: 'physical',
    state: 'draft',
  };

  if (data.shippingProfileId) {
    body.shipping_profile_id = data.shippingProfileId;
  }

  const resp = await etsyFetch(`/application/shops/${shopId}/listings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const error = await resp.text();
    // If shipping profile is required, fall back to digital listing
    if (error.includes('shipping_profile_id') && !data.shippingProfileId) {
      return createDigitalListing(data);
    }
    throw new Error(`Failed to create POD listing: ${error}`);
  }

  const listing = await resp.json();
  return { listing_id: listing.listing_id, url: listing.url };
}

export async function createDigitalListing(data: CreateListingData): Promise<{ listing_id: number; url: string }> {
  const shopId = getShopId();

  // Digital-listing body deliberately OMITS two fields:
  // - shipping_profile_id: Etsy v3 parses JSON null as 0 and then
  //   errors with "Could not find shipping_profile_id='0'". For
  //   is_digital=true + type='download' the field must be absent
  //   from the request body entirely — Etsy doesn't ship digital
  //   downloads, so there's no profile to attach.
  // - state: listings are created in draft state by default, and
  //   some Etsy v3 API versions reject an explicit `state` field
  //   on creation. We flip to 'active' later via the
  //   listing-activate endpoint after files have been uploaded.
  const body = {
    title: data.title.substring(0, 140),
    description: data.description,
    price: data.price,
    quantity: data.quantity || 999,
    tags: data.tags.slice(0, 13),
    who_made: 'i_did',
    when_made: '2020_2025',
    taxonomy_id: data.taxonomy_id || 2078, // Digital Prints
    is_supply: false,
    is_digital: true,
    type: 'download',
  };

  const resp = await etsyFetch(`/application/shops/${shopId}/listings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Failed to create listing: ${error}`);
  }

  const listing = await resp.json();
  return {
    listing_id: listing.listing_id,
    url: listing.url,
  };
}

// ─────────────────────────────────────────────────────────────────
// Listing attributes (taxonomy-driven properties).
// Etsy's filter-narrowed search ("Cross stitch patterns + Color: Pink")
// only surfaces listings that have the matching property values set.
// Patterns published without attributes are invisible to these filters.
//
// Flow:
//   1. Fetch the taxonomy node's property list (cached per process)
//   2. For each attribute we want to set (color/theme/holiday/etc.),
//      find the matching property id + value id from the taxonomy
//   3. PUT to /listings/{id}/properties/{property_id}
//
// Failures on individual properties are logged but never thrown —
// missing one attribute shouldn't kill the whole publish flow.
// ─────────────────────────────────────────────────────────────────
interface TaxonomyProperty {
  property_id: number;
  name: string;
  display_name: string;
  is_required: boolean;
  supports_attributes: boolean;
  possible_values: Array<{ value_id: number; name: string }>;
  scales?: Array<{ scale_id: number; display_name: string }>;
}

const taxonomyPropertiesCache: Map<number, TaxonomyProperty[]> = new Map();

async function getTaxonomyProperties(taxonomyId: number): Promise<TaxonomyProperty[]> {
  if (taxonomyPropertiesCache.has(taxonomyId)) {
    return taxonomyPropertiesCache.get(taxonomyId)!;
  }
  const apiKey = getApiKeyHeader();
  // This endpoint doesn't require a user token — taxonomy is global.
  const resp = await fetch(
    `${ETSY_API_URL}/application/seller-taxonomy/nodes/${taxonomyId}/properties`,
    { headers: { "x-api-key": apiKey } },
  );
  if (!resp.ok) {
    console.warn(`[etsy] taxonomy ${taxonomyId} properties fetch HTTP ${resp.status}`);
    return [];
  }
  const data = await resp.json() as { results: TaxonomyProperty[] };
  const props = data.results || [];
  taxonomyPropertiesCache.set(taxonomyId, props);
  return props;
}

// Map our friendly attribute names → Etsy property name patterns to
// match.  We're permissive on capitalization / variations so the
// taxonomy lookup still works if Etsy renames things.
const ATTR_MAP: Record<string, RegExp> = {
  primaryColor: /^primary\s*color$|^color_one$|^color$/i,
  secondaryColor: /^secondary\s*color$|^color_two$|^accent\s*color$/i,
  theme: /^theme$|^style$/i,
  holiday: /^holiday$|^occasion$/i,
  occasion: /^occasion$|^event$/i,
  recipient: /^recipient$/i,
};

async function setListingProperty(
  listingId: number,
  shopId: string,
  propertyId: number,
  valueIds: number[],
  valueNames: string[],
  scaleId?: number,
): Promise<void> {
  const apiKey = getApiKeyHeader();
  const token = await getValidToken();
  const body: Record<string, unknown> = {
    value_ids: valueIds,
    values: valueNames,
  };
  if (scaleId) body.scale_id = scaleId;
  const resp = await fetch(
    `${ETSY_API_URL}/application/shops/${shopId}/listings/${listingId}/properties/${propertyId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-api-key": apiKey,
      },
      body: JSON.stringify(body),
    },
  );
  if (!resp.ok) {
    const t = await resp.text();
    console.warn(`[etsy] property ${propertyId} set HTTP ${resp.status}: ${t.slice(0, 200)}`);
  }
}

export async function applyListingAttributes(
  listingId: number,
  taxonomyId: number,
  attrs: {
    primaryColor?: string;
    secondaryColor?: string;
    theme?: string;
    holiday?: string;
    occasion?: string;
    recipient?: string;
  },
): Promise<void> {
  const shopId = getShopId();
  const properties = await getTaxonomyProperties(taxonomyId);
  if (properties.length === 0) {
    console.warn(`[etsy] taxonomy ${taxonomyId} returned no properties — skipping attribute set`);
    return;
  }

  for (const [attrKey, value] of Object.entries(attrs)) {
    if (!value) continue;
    const regex = ATTR_MAP[attrKey];
    if (!regex) continue;
    const matchingProperty = properties.find((p) => regex.test(p.name) || regex.test(p.display_name));
    if (!matchingProperty) continue;

    // Find the best-matching value_id from the property's enum.
    const wanted = String(value).toLowerCase().trim();
    const matchValue = matchingProperty.possible_values.find(
      (v) => v.name.toLowerCase() === wanted,
    ) || matchingProperty.possible_values.find(
      (v) => v.name.toLowerCase().includes(wanted) || wanted.includes(v.name.toLowerCase()),
    );

    if (matchValue) {
      try {
        await setListingProperty(
          listingId,
          shopId,
          matchingProperty.property_id,
          [matchValue.value_id],
          [matchValue.name],
        );
      } catch (err) {
        console.warn(`[etsy] failed to set ${attrKey}=${value}:`, (err as Error).message);
      }
    } else if (!matchingProperty.possible_values.length) {
      // Free-text property — send raw value with no value_id.
      try {
        await setListingProperty(
          listingId,
          shopId,
          matchingProperty.property_id,
          [],
          [String(value)],
        );
      } catch (err) {
        console.warn(`[etsy] failed to set ${attrKey}=${value} (free-text):`, (err as Error).message);
      }
    }
  }
}

export async function uploadListingFile(listingId: number, fileBuffer: Buffer, filename: string): Promise<void> {
  const shopId = getShopId();
  const token = await getValidToken();
  // Etsy v3 requires "keystring:shared_secret" — bare CLIENT_ID 403s
  // with "Shared secret is required in x-api-key header."  See
  // getApiKeyHeader() in etsy-auth for the helper.
  const apiKey = getApiKeyHeader();

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(fileBuffer)], { type: 'application/octet-stream' });
  formData.append('file', blob, filename);
  formData.append('name', filename);

  const resp = await fetch(
    `${ETSY_API_URL}/application/shops/${shopId}/listings/${listingId}/files`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-api-key': apiKey,
      },
      body: formData,
    }
  );

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Failed to upload listing file: ${error}`);
  }
}

export async function uploadListingImage(
  listingId: number,
  imageBuffer: Buffer,
  filename: string,
  rank?: number,
  altText?: string,
): Promise<void> {
  const shopId = getShopId();
  const token = await getValidToken();
  // Etsy v3 requires "keystring:shared_secret" — bare CLIENT_ID 403s
  // with "Shared secret is required in x-api-key header."  See
  // getApiKeyHeader() in etsy-auth for the helper.
  const apiKey = getApiKeyHeader();

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' });
  formData.append('image', blob, filename);
  if (rank !== undefined) {
    formData.append('rank', String(rank));
  }
  // alt_text is Etsy's per-image SEO field — populated for image-search
  // ranking on Google + Etsy.  Capped at 250 chars per Etsy spec.
  // Phase 2 SEO fix 2026-05-17.
  if (altText && altText.trim()) {
    formData.append('alt_text', altText.trim().slice(0, 250));
  }

  const resp = await fetch(
    `${ETSY_API_URL}/application/shops/${shopId}/listings/${listingId}/images`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-api-key': apiKey,
      },
      body: formData,
    }
  );

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Failed to upload listing image: ${error}`);
  }
}

// Etsy v3 endpoint:
//   POST /application/shops/{shop_id}/listings/{listing_id}/videos
// Mirrors the image-upload shape: multipart/form-data with a single
// `video` blob plus a `name` field for the display filename.  Etsy
// accepts MP4 (the format our listing-video renderer produces); other
// containers will 400 here.  The endpoint is used by the listing-video
// step in page.tsx's listOnEtsy() ("Step 2.5") and by the bulk version
// in factory-publish.ts.  Failure is non-fatal at the call-site; we
// throw here so the route-level catch can log+swallow without breaking
// the listing.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- export kept; Turbopack recompile marker
export async function uploadListingVideo(listingId: number, videoBuffer: Buffer, filename: string): Promise<void> {
  const shopId = getShopId();
  const token = await getValidToken();
  // Etsy v3 requires "keystring:shared_secret" — bare CLIENT_ID 403s
  // with "Shared secret is required in x-api-key header."  See
  // getApiKeyHeader() in etsy-auth for the helper.
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
    }
  );

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Failed to upload listing video: ${error}`);
  }
}

export async function activateListing(listingId: number): Promise<void> {
  const shopId = getShopId();

  const resp = await etsyFetch(`/application/shops/${shopId}/listings/${listingId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: 'active' }),
  });

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Failed to activate listing: ${error}`);
  }
}

export async function updateListing(listingId: number, data: {
  title?: string;
  description?: string;
  tags?: string[];
  price?: number;
}): Promise<void> {
  const shopId = getShopId();

  const body: Record<string, unknown> = {};
  if (data.title) body.title = data.title.substring(0, 140);
  if (data.description) body.description = data.description;
  if (data.tags) body.tags = data.tags.slice(0, 13);
  if (data.price !== undefined) body.price = data.price;

  const resp = await etsyFetch(`/application/shops/${shopId}/listings/${listingId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Failed to update listing ${listingId}: ${error}`);
  }
}

// --- Shipping Profiles ---

export async function getShippingProfiles(): Promise<Array<{ shipping_profile_id: number; title: string }>> {
  const shopId = getShopId();

  const resp = await etsyFetch(`/application/shops/${shopId}/shipping-profiles`);

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Failed to get shipping profiles: ${error}`);
  }

  const data = await resp.json();
  return (data.results || []).map((p: { shipping_profile_id: number; title: string }) => ({
    shipping_profile_id: p.shipping_profile_id,
    title: p.title,
  }));
}

export async function getListings(state?: string): Promise<unknown[]> {
  const shopId = getShopId();
  const params = new URLSearchParams({ limit: '100' });
  if (state) params.set('state', state);

  const resp = await etsyFetch(`/application/shops/${shopId}/listings?${params.toString()}`);

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Failed to get listings: ${error}`);
  }

  const data = await resp.json();
  return data.results || [];
}

export interface EtsyMoney {
  amount: number;
  divisor: number;
  currency_code?: string;
}

export interface EtsyReceiptTransaction {
  listing_id: number;
  title: string;
  quantity: number;
  price?: EtsyMoney;
  is_digital: boolean;
}

export interface EtsyReceipt {
  receipt_id: number;
  created_timestamp: number;
  name: string;
  status: string;
  is_paid: boolean;
  is_shipped: boolean;
  subtotal?: EtsyMoney;
  total_shipping_cost?: EtsyMoney;
  total_tax_cost?: EtsyMoney;
  discount_amt?: EtsyMoney;
  grandtotal?: EtsyMoney;
  total_price?: EtsyMoney;
  transactions?: EtsyReceiptTransaction[];
}

export async function getAllReceipts(options: {
  minCreated?: number;
  maxCreated?: number;
  maxPages?: number;
} = {}): Promise<EtsyReceipt[]> {
  const shopId = getShopId();
  const maxPages = Math.max(1, Math.min(options.maxPages ?? 5, 25));
  const limit = 100;
  const receipts: EtsyReceipt[] = [];

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(page * limit),
    });
    if (options.minCreated) params.set("min_created", String(options.minCreated));
    if (options.maxCreated) params.set("max_created", String(options.maxCreated));

    const resp = await etsyFetch(`/application/shops/${shopId}/receipts?${params.toString()}`);
    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Failed to get receipts: ${error}`);
    }

    const data = await resp.json() as { results?: EtsyReceipt[]; count?: number };
    const batch = data.results || [];
    receipts.push(...batch);
    if (batch.length < limit) break;
  }

  return receipts;
}

export async function getAdSpend(_options: {
  minCreated?: number;
  maxCreated?: number;
} = {}): Promise<{ etsy_ads: number; offsite_ads: number; entries: unknown[] }> {
  // Etsy's public seller API does not expose a reliable ads-spend endpoint
  // for this app yet. Keep Profit usable and explicit by returning zeros.
  return { etsy_ads: 0, offsite_ads: 0, entries: [] };
}

// ─────────────────────────────────────────────────────────────────
// Public Etsy search — uses the official v3 findAllActiveListings
// endpoint so it's TOS-safe (no scraping etsy.com).  Returns up to
// `limit` active listings matching the keyword phrase, sorted by
// Etsy's default relevance (which is what real buyers see).
//
// Used by the ranking tracker to find where OUR listings sit in
// search results for their target keywords.
//
// Per user 2026-05-15 memory: never scrape etsy.com.  Only the v3 API.
// ─────────────────────────────────────────────────────────────────
export interface EtsyPublicListing {
  listing_id: number;
  title: string;
  shop_id?: number;
}

export async function searchListingsByKeyword(
  keyword: string,
  limit = 100,
): Promise<EtsyPublicListing[]> {
  const apiKey = getApiKeyHeader();
  // findAllActiveListings doesn't need a user token — it's the same
  // endpoint behind public Etsy search.
  const params = new URLSearchParams({
    keywords: keyword,
    limit: String(Math.min(100, Math.max(1, limit))),
    sort_on: "score",       // relevance, matches default search
    sort_order: "desc",
  });
  const resp = await fetch(
    `${ETSY_API_URL}/application/listings/active?${params.toString()}`,
    { headers: { "x-api-key": apiKey } },
  );
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Etsy keyword search HTTP ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json() as { results?: EtsyPublicListing[]; count?: number };
  return data.results || [];
}

/** Renew an active listing — gives it a recency boost in search.
 *  Etsy charges $0.20 per renewal (same as a new listing fee). */
export async function renewListing(listingId: number): Promise<void> {
  const shopId = getShopId();
  const resp = await etsyFetch(
    `/application/shops/${shopId}/listings/${listingId}/renew`,
    { method: "POST" },
  );
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Renew HTTP ${resp.status}: ${t.slice(0, 200)}`);
  }
}
