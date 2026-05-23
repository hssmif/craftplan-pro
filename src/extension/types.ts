// ══════════════════════════════════════════════════════════════════════
// CraftPlan Research — Shared TypeScript Types
//
// Only types needed by the current Marketplace Insights + Digital Studio
// flows. The old POD-scanner / Printful / Midjourney types lived here
// too and were removed alongside their content scripts (commit:
// extension cleanup, 2026-05-19). If you're hunting for a POD type,
// it's gone — that pipeline was retired.
// ══════════════════════════════════════════════════════════════════════

/** Payload sent from the extension to /digital-studio via localStorage.
 *  Mirrors the importFromExtension signature in digitalStudioStore.ts.
 *  Used when the popup's "Open in Digital Studio" CTA fires on a
 *  selected listing or when an external app triggers SEND_TO_DIGITAL_STUDIO. */
export interface ExtensionToDigitalStudioPayload {
  title: string;
  tags: string[];
  price: number;
  shopName: string;
  url: string;
  searchQuery: string;
  podScore: number;
  reviews: number;
  rating: number;
  isBestseller: boolean;
  designKeywords: string[];
  /** Optional base-64-encoded reference image, fetched + resized by the
   *  background service worker so the studio can use it without
   *  re-downloading. */
  referenceImageBase64?: string;
  description?: string;
}

export interface EtsyListingPayload {
  title: string;
  description: string;
  tags: string[];
  price: number;
  quantity: number;
  sku?: string;
  images: string[];
  category?: string;
  processingTime?: string;
  shippingProfile?: string;
}

/** Brief summary of captured Marketplace Insights data — fetched by the
 *  popup from /api/research/insights-capture and shown as live status. */
export interface InsightsCaptureSummary {
  total: number;
  mostRecentCapturedAt: string | null;
  byCategory: Array<{ category: string; count: number; max_captured_at: string }>;
}

/** Coverage state for the curated digital-anchor sweep — fetched from
 *  /api/research/anchor-coverage. */
export interface AnchorCoverageSummary {
  total: number;
  covered: number;
}
