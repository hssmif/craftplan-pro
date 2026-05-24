// ── Product Studio: Unified Type Definitions ──
// Single data model flowing through the 8-step pipeline:
// Inspiration → Generation → Selection → Products → Listings → Printful → Etsy → Fulfillment

// ── Pipeline Step Identifiers ──

export type StudioStep =
  | "inspiration"    // Step 1
  | "generation"     // Step 2
  | "selection"      // Step 3
  | "products"       // Step 4
  | "listings"       // Step 5
  | "printful"       // Step 6
  | "etsy-sync"      // Step 7
  | "fulfillment";   // Step 8

export const STEP_ORDER: StudioStep[] = [
  "inspiration",
  "generation",
  "selection",
  "products",
  "listings",
  "printful",
  "etsy-sync",
  "fulfillment",
];

export const STEP_LABELS: Record<StudioStep, string> = {
  inspiration: "Inspiration",
  generation: "Generate",
  selection: "Select",
  products: "Products",
  listings: "Listings",
  printful: "Printful",
  "etsy-sync": "Etsy Finish",
  fulfillment: "Fulfillment",
};

export const STEP_ICONS: Record<StudioStep, string> = {
  inspiration: "sparkles",
  generation: "wand",
  selection: "grid",
  products: "shirt",
  listings: "tag",
  printful: "printer",
  "etsy-sync": "edit",
  fulfillment: "check-circle",
};

export type StepStatus = "idle" | "running" | "done" | "error" | "skipped";

// ── Design Mode ──

export type DesignMode = "text" | "graphic" | "mixed";

// ── Step 1: Inspiration Source ──

export interface InspirationSource {
  type: "extension" | "upload" | "keyword" | "opportunity";
  keyword: string;
  referenceImageBase64?: string;   // From extension or file upload
  referenceImageUrl?: string;      // Etsy listing image URL
  sourceListingUrl?: string;       // Original Etsy listing URL
  sourceListingTitle?: string;
  opportunityId?: number;          // From opportunities DB
  referenceAnalysis?: ReferenceAnalysis; // Stored in Step 1 for Step 2 reuse
}

// ── Reference Image Analysis (from Gemini Vision) ──

export interface ReferenceAnalysis {
  designType: "text-only" | "graphic" | "mixed";
  extractedText: string;
  graphicDescription: string;
  style: {
    visual: string;
    colors: string[];
    typography: string;
    layout: string;
    mood: string;
  };
  suggestedStylePreset: string;
  suggestedPalette: string;
}

// ── Step 2: Niche Analysis (from Gemini) ──

export interface NicheAnalysis {
  nicheScore: number;
  demandLevel: string;
  competitionLevel: string;
  bestProductTypes: string[];
  topSubNiches: string[];
  buyerPersona: string;
  seasonality: string;
  peakMonths: string[];
  avgPriceRange: { min: number; max: number };
  topSellerEstimate: string;
}

// ── Step 2+3: Generated Design ──

export interface StudioDesign {
  id: string;                       // Unique per design
  mode: DesignMode;                 // text, graphic, or mixed

  // Text mode fields (from design-engine.ts)
  phrase?: string;                  // e.g. "I'd Rather Be Fishing"
  mood?: string;                    // "funny", "sarcastic", etc.
  audience?: string;                // "self-buyer", "gift", etc.
  subNiche?: string;
  stylePreset?: string;             // "retro-badge", "neon-glow", etc.
  palette?: string;                 // "vintage-rust", "navy-gold", etc.
  fontName?: string;
  layout?: string;                  // "centered-stack", "arch-center", etc.

  // Graphic mode fields
  aiPrompt?: string;                // Pollinations/Flux prompt
  graphicDescription?: string;      // From reference analysis
  imageUrl?: string;                // Pollinations public URL (for Printful)

  // Shared fields
  dataUrl: string;                  // Full-resolution PNG dataURL (4500x5400 for text)
  thumbnailUrl?: string;            // Smaller preview (600x600)
  width: number;
  height: number;
  selected: boolean;                // User selection state
  starred: boolean;                 // Favorite flag
}

// ── Step 4: Product Configuration ──

export interface ProductVariant {
  variantId: number;                // Printful variant ID
  size: string;
  color: string;
  colorCode: string;
  baseCost: number;
  retailPrice: number;
  enabled: boolean;
}

export interface ProductConfig {
  catalogProductId: number;         // Printful catalog ID (71 = T-Shirt, 380 = Hoodie, etc.)
  productName: string;              // "Unisex T-Shirt"
  category: string;                 // "apparel", "drinkware", etc.
  icon: string;
  enabled: boolean;
  markupPercent: number;            // Default 40
  variants: ProductVariant[];
  retailPrice: number;              // Calculated from highest cost + markup
  taxonomyId: number;               // Etsy taxonomy ID (482 for shirts, etc.)
}

// ── Step 5: Listing Metadata (SEO) ──

export interface ListingMetadata {
  designId: string;                 // Links to StudioDesign.id
  title: string;                    // Max 140 chars
  description: string;
  tags: string[];                   // Max 13, each max 20 chars
  price: number;
  taxonomyId: number;               // Etsy taxonomy
  edited: boolean;                  // User manually edited
}

// ── Step 6: Printful Product Record ──

export interface PrintfulProductRecord {
  designId: string;
  productConfigIndex: number;       // Index into productConfigs[]
  fileId: number;                   // Printful file library ID
  fileUrl: string;                  // Printful file URL
  syncProductId?: number;           // Printful sync product ID
  templateId?: number;              // From createAndPushProduct() return
  pushed: boolean;                  // Whether Printful pushed to connected store (Etsy)
  pushError?: string;               // If push failed, why
  mockupUrls: string[];
  variantIds: number[];
  retailPrices?: Record<number, number>; // variant ID → retail price
  status: "pending" | "uploading" | "creating" | "pushing" | "mockups" | "done" | "error";
  error?: string;
}

// ── Step 7: Etsy Listing Record ──

export interface EtsyListingRecord {
  designId: string;
  listingId?: number;                // Populated when user finishes on Etsy
  listingUrl?: string;               // Populated when user finishes on Etsy
  printfulSyncProductId?: number;    // Links to Printful product that was pushed
  status: "pending" | "ready-to-finish" | "finishing" | "active" | "draft" | "error";
  imagesUploaded: number;
  finishedAt?: string;               // ISO timestamp when user finished on Etsy
  error?: string;
}

// ══════════════════════════════════════════════════
// THE UNIFIED PROJECT ENTITY
// ══════════════════════════════════════════════════

export interface StudioProject {
  id: string;                       // "sp_1710000000_abc123"
  createdAt: string;                // ISO timestamp
  updatedAt: string;

  // Pipeline state
  currentStep: StudioStep;
  stepStatuses: Record<StudioStep, StepStatus>;
  stepDurations: Partial<Record<StudioStep, number>>;  // ms per step
  stepErrors: Partial<Record<StudioStep, string>>;

  // Step 1: Inspiration
  inspiration: InspirationSource;

  // Step 2: Generation context
  designMode: DesignMode;
  nicheAnalysis: NicheAnalysis | null;
  batchSize: 10 | 15 | 30 | 50 | 100;

  // Step 2+3: Designs
  designs: StudioDesign[];

  // Step 4: Products
  productConfigs: ProductConfig[];

  // Step 5: Listings
  listings: ListingMetadata[];

  // Step 6: Printful
  printfulProducts: PrintfulProductRecord[];

  // Step 7: Etsy
  etsyListings: EtsyListingRecord[];

  // Step 8: Fulfillment summary
  totalRevenue: number;
  totalProfit: number;
  status: "draft" | "in-progress" | "completed" | "error";
}

// ── Helpers ──

export function createEmptyProject(): StudioProject {
  return {
    id: `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentStep: "inspiration",
    stepStatuses: {
      inspiration: "idle",
      generation: "idle",
      selection: "idle",
      products: "idle",
      listings: "idle",
      printful: "idle",
      "etsy-sync": "idle",
      fulfillment: "idle",
    },
    stepDurations: {},
    stepErrors: {},
    inspiration: { type: "keyword", keyword: "" },
    designMode: "text",
    nicheAnalysis: null,
    batchSize: 30,
    designs: [],
    productConfigs: [],
    listings: [],
    printfulProducts: [],
    etsyListings: [],
    totalRevenue: 0,
    totalProfit: 0,
    status: "draft",
  };
}

// ── Etsy Taxonomy IDs for common POD product types ──

export const POD_TAXONOMY_IDS: Record<number, number> = {
  71: 482,     // T-Shirt → Clothing > Shirts & Tees
  380: 482,    // Hoodie → Clothing > Shirts & Tees
  19: 1229,    // Mug → Home & Living > Kitchen & Dining > Drinkware
  83: 482,     // Tote Bag → Bags & Purses > Tote Bags
  1: 485,      // Poster → Art & Collectibles > Prints
};
