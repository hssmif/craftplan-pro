// ── Printful API Client ─────────────────────────────────────
// REST client for Printful Print On Demand service.
// Handles store info, catalog, file uploads, product creation, and mockups.
// Auth: Bearer ${process.env.PRINTFUL_API_KEY}

const PRINTFUL_API_URL = "https://api.printful.com";

// ── Token Resolution ──
// Priority: PRINTFUL_API_KEY (preferred) → PRINTFUL_TOKEN (legacy fallback)

export function getPrintfulToken(): string {
  return process.env.PRINTFUL_API_KEY || process.env.PRINTFUL_TOKEN || "";
}

// ── Store Type Detection ──
// API_STORE: Manual/API store — uses /store/products (sync products) for creation
// CONNECTED_STORE: Platform-connected (Etsy, Shopify, etc.) — uses product templates + push

export type PrintfulStoreType = "API_STORE" | "CONNECTED_STORE" | "UNKNOWN";

export async function detectStoreType(
  token: string
): Promise<{ storeType: PrintfulStoreType; storeName: string; storeId: number }> {
  try {
    const store = await getStore(token);
    const storeType: PrintfulStoreType =
      store.type === "manual" || store.type === "api"
        ? "API_STORE"
        : store.type
        ? "CONNECTED_STORE"
        : "UNKNOWN";

    return {
      storeType,
      storeName: store.name || "Unknown",
      storeId: store.id || 0,
    };
  } catch (err) {
    // If getStore fails but we can still access sync/products, it's likely a connected store
    try {
      const resp = await printfulFetch("/sync/products?limit=1", token);
      if (resp.ok) {
        return { storeType: "CONNECTED_STORE", storeName: "Connected Store", storeId: 0 };
      }
    } catch {
      // ignore fallback
    }
    throw err;
  }
}

// ── List Store Products ──

export async function getStoreProducts(
  token: string,
  limit: number = 20
): Promise<PrintfulSyncProduct[]> {
  const resp = await printfulFetch(`/sync/products?limit=${limit}`, token);
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to list store products: ${err}`);
  }
  const data = await resp.json();
  return data.result || [];
}

// ── Curated POD Catalog ──
// Pre-selected best-selling products grouped by category.
// Product IDs reference Printful's catalog.

export interface CatalogItem {
  name: string;
  productId: number;
  icon: string;
  margin: string;
}

export interface CatalogCategory {
  label: string;
  icon: string;
  items: CatalogItem[];
}

export const POD_CATALOG: Record<string, CatalogCategory> = {
  apparel: {
    label: "Apparel",
    icon: "👕",
    items: [
      { name: "Unisex T-Shirt", productId: 71, icon: "👕", margin: "50-65%" },
      { name: "Hoodie", productId: 380, icon: "🧥", margin: "45-55%" },
      { name: "Sweatshirt", productId: 383, icon: "👔", margin: "45-55%" },
    ],
  },
  drinkware: {
    label: "Drinkware",
    icon: "☕",
    items: [
      { name: "Ceramic Mug 11oz", productId: 19, icon: "☕", margin: "60-70%" },
      { name: "Ceramic Mug 15oz", productId: 438, icon: "🍵", margin: "60-65%" },
    ],
  },
  wall_art: {
    label: "Wall Art",
    icon: "🖼️",
    items: [
      { name: "Poster", productId: 1, icon: "🖼️", margin: "50-65%" },
      { name: "Canvas", productId: 53, icon: "🎨", margin: "40-60%" },
      { name: "Framed Print", productId: 486, icon: "🖼️", margin: "45-55%" },
    ],
  },
  accessories: {
    label: "Accessories",
    icon: "👜",
    items: [
      { name: "Tote Bag", productId: 83, icon: "👜", margin: "50-65%" },
      { name: "Phone Case", productId: 396, icon: "📱", margin: "60-68%" },
    ],
  },
  stationery: {
    label: "Stationery",
    icon: "📓",
    items: [
      { name: "Spiral Notebook", productId: 474, icon: "📓", margin: "50-65%" },
      { name: "Sticker Sheet", productId: 505, icon: "🏷️", margin: "60-75%" },
    ],
  },
};

// ── Types ──

export interface PrintfulStore {
  id: number;
  name: string;
  type: string;
  website: string;
  currency: string;
  created: number;
}

export interface PrintfulCatalogProduct {
  id: number;
  type: string;
  type_name: string;
  brand: string;
  model: string;
  image: string;
  variant_count: number;
  currency: string;
  title: string;
  description: string;
  techniques: Array<{
    key: string;
    display_name: string;
    is_default: boolean;
  }>;
  files: Array<{
    id: string;
    type: string;
    title: string;
  }>;
  options: Array<{
    id: string;
    title: string;
    type: string;
    values: Record<string, string>;
  }>;
}

export interface PrintfulCatalogVariant {
  id: number;
  product_id: number;
  name: string;
  size: string;
  color: string;
  color_code: string;
  color_code2: string | null;
  image: string;
  price: string;
  in_stock: boolean;
  availability_status: string;
}

export interface PrintfulFileResult {
  id: number;
  type: string;
  hash: string;
  url: string;
  filename: string;
  mime_type: string;
  size: number;
  width: number;
  height: number;
  dpi: number;
  status: string;
  created: number;
  thumbnail_url: string;
  preview_url: string;
  visible: boolean;
  is_temporary: boolean;
}

export interface CreateSyncProductData {
  sync_product: {
    name: string;
    thumbnail?: string;
    external_id?: string;
  };
  sync_variants: Array<{
    variant_id: number;
    retail_price: number;
    files: Array<{
      type: string;
      id?: number;
      url?: string;
    }>;
    external_id?: string;
  }>;
}

export interface PrintfulSyncProduct {
  id: number;
  external_id: string;
  name: string;
  variants: number;
  synced: number;
  thumbnail_url: string;
}

export interface PrintfulSyncVariant {
  id: number;
  external_id: string;
  sync_product_id: number;
  name: string;
  synced: boolean;
  variant_id: number;
  retail_price: string;
  currency: string;
  is_ignored: boolean;
  product: {
    variant_id: number;
    product_id: number;
    image: string;
    name: string;
  };
  files: Array<{
    id: number;
    type: string;
    hash: string;
    url: string;
    filename: string;
    mime_type: string;
    size: number;
    width: number;
    height: number;
    dpi: number;
    status: string;
    created: number;
    thumbnail_url: string;
    preview_url: string;
    visible: boolean;
    is_temporary: boolean;
  }>;
}

export interface PrintfulMockupTask {
  task_key: string;
  status: string;
}

export interface PrintfulMockupResult {
  task_key: string;
  status: string;
  mockups?: Array<{
    placement: string;
    variant_ids: number[];
    mockup_url: string;
    extra: Array<{
      title: string;
      url: string;
      option: string;
      option_group: string;
    }>;
  }>;
  error?: string;
}

export interface PrintfulMockupStyle {
  id: number;
  category_name: string;
  image_url: string;
  placement: string;
}

// ── Core fetch helper ──

async function printfulFetch(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  // Only set Content-Type for JSON requests (not multipart)
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const resp = await fetch(`${PRINTFUL_API_URL}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers as Record<string, string>),
    },
  });
  return resp;
}

// ── Store Operations ──

export async function getStore(
  token: string
): Promise<PrintfulStore> {
  // Try /store first; if scope is missing, fall back to /sync/products as a connection test
  const resp = await printfulFetch("/store", token);
  if (resp.ok) {
    const data = await resp.json();
    return data.result;
  }

  // Save error from first attempt
  const storeErr = await resp.text();

  // Fallback: use /sync/products (requires sync_products scope) to verify connection
  try {
    const fallbackResp = await printfulFetch("/sync/products?limit=1", token);
    if (fallbackResp.ok) {
      // Connection works — return minimal store info
      return {
        id: 0,
        name: "Connected Store",
        type: "etsy",
        currency: "USD",
      } as PrintfulStore;
    }
  } catch {
    // fallback also failed
  }

  // Second fallback: try catalog endpoint (no scope required for public catalog)
  try {
    const catalogResp = await printfulFetch("/products/71", token);
    if (catalogResp.ok) {
      return {
        id: 0,
        name: "Connected Store",
        type: "etsy",
        currency: "USD",
      } as PrintfulStore;
    }
  } catch {
    // catalog also failed
  }

  throw new Error(`Failed to get store: ${storeErr}`);
}

// ── Catalog Operations ──

export async function getCatalogProduct(
  token: string,
  productId: number
): Promise<PrintfulCatalogProduct> {
  const resp = await printfulFetch(`/v2/catalog-products/${productId}`, token);
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to get catalog product ${productId}: ${err}`);
  }
  const data = await resp.json();
  return data.data || data.result;
}

export async function getCatalogVariants(
  token: string,
  productId: number
): Promise<PrintfulCatalogVariant[]> {
  // Printful API: GET /products/{id} returns { result: { product, variants } }
  const resp = await printfulFetch(`/products/${productId}`, token);
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to get variants for product ${productId}: ${err}`);
  }
  const data = await resp.json();
  return data.result?.variants || [];
}

export async function getCatalogProductInfo(
  token: string,
  productId: number
): Promise<{ product: { id: number; title: string; description: string; image: string }; variants: PrintfulCatalogVariant[] }> {
  const resp = await printfulFetch(`/products/${productId}`, token);
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to get product info ${productId}: ${err}`);
  }
  const data = await resp.json();
  return data.result;
}

// ── File Upload ──

export async function uploadFile(
  token: string,
  base64Data: string,
  fileName: string
): Promise<PrintfulFileResult> {
  // Strip data URI prefix if present
  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(cleanBase64, "base64");

  // Detect mime type from original data URI or default to png
  let mimeType = "image/png";
  const mimeMatch = base64Data.match(/^data:(image\/\w+);base64,/);
  if (mimeMatch) mimeType = mimeMatch[1];
  if (mimeType === "image/svg+xml") mimeType = "image/png";

  // Printful's multipart file upload endpoint is broken (returns "file element
  // is not array" even from standard curl). Their JSON URL-based upload works
  // perfectly, but requires a publicly accessible URL.
  //
  // Strategy: upload the image to a temporary public host, then pass the public
  // URL to Printful's JSON API. The temp file auto-deletes after 1 hour.
  const publicUrl = await uploadToTempHost(buffer, fileName, mimeType);
  return uploadFileByUrl(token, publicUrl, fileName);
}

/** Upload a buffer to a temporary public host, returns a publicly accessible URL. */
async function uploadToTempHost(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string> {
  // Use litterbox.catbox.moe — free temp hosting, auto-deletes after 1 hour
  const boundary = `----TempUpload${Date.now()}`;
  const parts: Buffer[] = [];

  // reqtype field
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="reqtype"\r\n\r\n` +
    `fileupload\r\n`
  ));

  // time field (1 hour expiry)
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="time"\r\n\r\n` +
    `1h\r\n`
  ));

  // file field
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="fileToUpload"; filename="${fileName}"\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`
  ));
  parts.push(buffer);
  parts.push(Buffer.from(`\r\n`));

  // closing boundary
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  const resp = await fetch(
    "https://litterbox.catbox.moe/resources/internals/api.php",
    {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
      signal: AbortSignal.timeout(30000),
    }
  );

  if (!resp.ok) {
    throw new Error(`Temp host upload failed: HTTP ${resp.status}`);
  }

  const url = (await resp.text()).trim();
  if (!url.startsWith("http")) {
    throw new Error(`Temp host returned invalid URL: ${url}`);
  }

  console.log(`[Printful] Design uploaded to temp host: ${url}`);
  return url;
}

/** Upload file to Printful via URL (Printful downloads from the URL) */
export async function uploadFileByUrl(
  token: string,
  imageUrl: string,
  fileName?: string
): Promise<PrintfulFileResult> {
  const body: Record<string, string> = { url: imageUrl };
  if (fileName) body.filename = fileName;

  const resp = await printfulFetch("/files", token, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to upload file by URL: ${err}`);
  }
  const data = await resp.json();
  return data.result;
}

// ── Sync Product Operations ──

export async function createSyncProduct(
  token: string,
  data: CreateSyncProductData
): Promise<{ sync_product: PrintfulSyncProduct; sync_variants: PrintfulSyncVariant[] }> {
  const resp = await printfulFetch("/store/products", token, {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to create product: ${err}`);
  }
  const result = await resp.json();
  return result.result;
}

export async function getSyncProducts(
  token: string,
  offset: number = 0,
  limit: number = 100
): Promise<{ result: PrintfulSyncProduct[]; total: number }> {
  const resp = await printfulFetch(
    `/store/products?offset=${offset}&limit=${limit}`,
    token
  );
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to get products: ${err}`);
  }
  return resp.json();
}

export async function getSyncProduct(
  token: string,
  productId: number | string
): Promise<{ sync_product: PrintfulSyncProduct; sync_variants: PrintfulSyncVariant[] }> {
  const resp = await printfulFetch(`/store/products/${productId}`, token);
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to get product ${productId}: ${err}`);
  }
  const data = await resp.json();
  return data.result;
}

export async function deleteSyncProduct(
  token: string,
  productId: number | string
): Promise<void> {
  const resp = await printfulFetch(`/store/products/${productId}`, token, {
    method: "DELETE",
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to delete product: ${err}`);
  }
}

// ── Product Templates (for platform-connected stores like Etsy) ──

export interface ProductTemplateInput {
  title: string;
  description?: string;
  catalogProductId: number;
  variantIds: number[];
  retailPrices: Record<number, number>; // variantId → retail price
  fileUrl: string;
  fileId?: number;
  placement?: string;
  tags?: string[];
}

/**
 * Create a product on Printful and push to the connected store.
 *
 * For API_STORE (Manual/API): Uses /store/products to create sync products directly.
 * For CONNECTED_STORE (Etsy/Shopify): Tries /v2/product-templates, then falls back to
 *   "file uploaded" mode where the design is stored in Printful's file library and the
 *   user finishes the listing on Etsy via the browser extension.
 *
 * @param storeType - Pass store type to avoid wasting API calls on blocked endpoints
 */
export async function createAndPushProduct(
  token: string,
  input: ProductTemplateInput,
  storeType?: PrintfulStoreType
): Promise<{ templateId: number; pushed: boolean; error?: string }> {
  // Build the variant list
  const variants = input.variantIds.map((vid) => ({
    variant_id: vid,
    retail_price: input.retailPrices[vid] || 24.99,
    is_enabled: true,
  }));

  const placement = input.placement || "front";
  const fileSpec: Record<string, unknown> = { type: placement };
  if (input.fileId) {
    fileSpec.id = input.fileId;
  } else if (input.fileUrl) {
    fileSpec.url = input.fileUrl;
  }

  // ── Strategy 1: Sync product (for API_STORE / Manual stores) ──
  if (storeType !== "CONNECTED_STORE") {
    const syncBody = {
      sync_product: {
        name: input.title,
        external_id: `craftplan_${Date.now()}`,
      },
      sync_variants: variants.map((v) => ({
        variant_id: v.variant_id,
        retail_price: v.retail_price,
        files: [fileSpec],
        external_id: `cv_${v.variant_id}_${Date.now()}`,
      })),
    };

    const syncResp = await printfulFetch("/store/products", token, {
      method: "POST",
      body: JSON.stringify(syncBody),
    });

    if (syncResp.ok) {
      const result = await syncResp.json();
      return {
        templateId: result.result?.sync_product?.id || 0,
        pushed: true,
      };
    }

    // If this was supposed to be an API store but failed, check the error
    const syncErr = await syncResp.text().catch(() => "");
    if (storeType === "API_STORE") {
      throw new Error(`Failed to create sync product: ${syncErr.slice(0, 300)}`);
    }
    // Otherwise fall through to try template approach
  }

  // ── Strategy 2: Product template (for CONNECTED_STORE) ──
  const templateBody = {
    product_template: {
      title: input.title,
      description: input.description || "",
      catalog_product_id: input.catalogProductId,
      catalog_variant_ids: input.variantIds,
    },
    placement_option_values: [
      {
        placement: placement,
        ...(input.fileId ? { file_id: input.fileId } : { file_url: input.fileUrl }),
      },
    ],
    variant_price_data: variants.map((v) => ({
      catalog_variant_id: v.variant_id,
      retail_price: String(v.retail_price),
    })),
  };

  const templateResp = await printfulFetch("/v2/product-templates", token, {
    method: "POST",
    body: JSON.stringify(templateBody),
  });

  if (templateResp.ok) {
    const tResult = await templateResp.json();
    const templateId = tResult.data?.id || tResult.result?.id || 0;

    // Push template to the connected store
    if (templateId) {
      const pushResp = await printfulFetch(
        `/v2/product-templates/${templateId}/actions/push-to-store`,
        token,
        { method: "POST" }
      );

      if (pushResp.ok) {
        return { templateId, pushed: true };
      }

      const pushErr = await pushResp.text().catch(() => "");
      return { templateId, pushed: false, error: `Template created but push failed: ${pushErr.slice(0, 200)}` };
    }
  }

  // ── Strategy 3: File-library mode (design uploaded, product created on Etsy via extension) ──
  // For connected stores without product_templates scope, the design is already
  // in Printful's file library. The user creates the listing on Etsy via the
  // browser extension, and Printful auto-syncs when the Etsy listing is created.
  if (storeType === "CONNECTED_STORE") {
    console.log("[Printful] Connected store: design saved to file library. Product will be created via Etsy Draft Finisher.");
    return {
      templateId: input.fileId || 0,
      pushed: false,
      error: undefined, // Not an error — this is the expected flow for connected stores
    };
  }

  // ── Strategy 4: Final attempt — direct push ──
  const directResp = await printfulFetch("/store/products", token, {
    method: "POST",
    body: JSON.stringify({
      sync_product: { name: input.title, external_id: `craftplan_${Date.now()}` },
      sync_variants: variants.map((v) => ({
        variant_id: v.variant_id,
        retail_price: v.retail_price,
        files: [fileSpec],
      })),
    }),
  });

  if (directResp.ok) {
    const result = await directResp.json();
    return { templateId: result.result?.sync_product?.id || 0, pushed: true };
  }

  const finalErr = await directResp.text().catch(() => "");
  throw new Error(`Failed to create product on Printful: ${finalErr.slice(0, 300)}`);
}

// ── Mockup Generation ──

export async function getMockupStyles(
  token: string,
  productId: number
): Promise<PrintfulMockupStyle[]> {
  const resp = await printfulFetch(
    `/mockup-generator/printfiles/${productId}`,
    token
  );
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to get mockup styles for product ${productId}: ${err}`);
  }
  const data = await resp.json();
  // Extract available print file placements
  return data.result?.available_placements || data.result || [];
}

export async function createMockupTask(
  token: string,
  productId: number,
  variantIds: number[],
  fileUrl: string,
  placement: string = "front"
): Promise<PrintfulMockupTask> {
  const resp = await printfulFetch(
    `/mockup-generator/create-task/${productId}`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        variant_ids: variantIds,
        format: "jpg",
        files: [
          {
            placement,
            image_url: fileUrl,
            position: {
              area_width: 1800,
              area_height: 2400,
              width: 1800,
              height: 2400,
              top: 0,
              left: 0,
            },
          },
        ],
      }),
    }
  );
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to create mockup task: ${err}`);
  }
  const data = await resp.json();
  return data.result;
}

export async function getMockupTaskResult(
  token: string,
  taskKey: string
): Promise<PrintfulMockupResult> {
  const resp = await printfulFetch(
    `/mockup-generator/task?task_key=${taskKey}`,
    token
  );
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to get mockup task result: ${err}`);
  }
  const data = await resp.json();
  return data.result;
}

// ── Helpers ──

/** Get all catalog items as a flat array */
export function getAllCatalogItems(): (CatalogItem & { category: string })[] {
  const items: (CatalogItem & { category: string })[] = [];
  for (const [category, data] of Object.entries(POD_CATALOG)) {
    for (const item of data.items) {
      items.push({ ...item, category });
    }
  }
  return items;
}

/** Get sensible default variants for a product (White+Black, S-2XL for apparel) */
export async function getDefaultVariants(
  token: string,
  productId: number,
  markupPercent: number = 40
): Promise<{
  variantIds: number[];
  retailPrices: Record<number, number>;
  variants: Array<{ id: number; size: string; color: string; price: string }>;
}> {
  const allVariants = await getCatalogVariants(token, productId);
  const inStock = allVariants.filter((v) => v.in_stock);

  // For apparel: filter to White + Black, sizes S through 2XL
  const targetColors = ["white", "black"];
  const targetSizes = ["S", "M", "L", "XL", "2XL"];

  let selected = inStock.filter(
    (v) =>
      targetColors.some((c) => v.color.toLowerCase().includes(c)) &&
      targetSizes.includes(v.size)
  );

  // Fallback: if no matches, take first 10 in-stock variants
  if (selected.length === 0) {
    selected = inStock.slice(0, 10);
  }

  // Calculate retail price: highest base cost × (1 + markup/100), rounded to $X.99
  const highestCost = Math.max(...selected.map((v) => parseFloat(v.price)));
  const rawRetail = highestCost * (1 + markupPercent / 100);
  const retailPrice = Math.floor(rawRetail) + 0.99;

  const variantIds = selected.map((v) => v.id);
  const retailPrices: Record<number, number> = {};
  for (const id of variantIds) {
    retailPrices[id] = retailPrice;
  }

  return {
    variantIds,
    retailPrices,
    variants: selected.map((v) => ({
      id: v.id,
      size: v.size,
      color: v.color,
      price: v.price,
    })),
  };
}

/** Calculate retail price from base cost and markup percentage */
export function calculateRetailPrice(baseCost: number, markupPercent: number): number {
  return Math.ceil((baseCost * (1 + markupPercent / 100)) * 100) / 100;
}

/** Calculate profit from retail price and base cost */
export function calculateProfit(retailPrice: number, baseCost: number): number {
  return Math.round((retailPrice - baseCost) * 100) / 100;
}

/** Calculate markup percentage from base cost and retail price */
export function calculateMarkupPercent(baseCost: number, retailPrice: number): number {
  if (baseCost <= 0) return 0;
  return Math.round(((retailPrice - baseCost) / baseCost) * 100);
}
