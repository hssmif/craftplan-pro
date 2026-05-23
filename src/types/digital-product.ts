// ══════════════════════════════════════════════════════════════
// Digital Product Studio: Unified Type Definitions
// Shared data model for all digital product types:
// Notion Templates · PDF Planners · Excel Trackers · Printables
//
// Flows through a 6-step pipeline:
// Discover → Configure → Generate → Preview → Listing → Publish
// ══════════════════════════════════════════════════════════════

// ── Product Type ─────────────────────────────────────────────

export type DigitalProductType = "notion" | "pdf" | "excel" | "printable";
export type DigitalConfigType = DigitalProductType | "sheets";

export const DIGITAL_PRODUCT_LABELS: Record<DigitalConfigType, string> = {
  notion: "Notion Template",
  pdf: "PDF Planner",
  excel: "Excel Tracker",
  printable: "Printable",
  sheets: "Google Sheets Template",
};

export const DIGITAL_PRODUCT_ICONS: Record<DigitalConfigType, string> = {
  notion: "layout-template",
  pdf: "file-text",
  excel: "table",
  printable: "printer",
  sheets: "table",
};

// ── Pipeline Steps ───────────────────────────────────────────

export type DigitalStudioStep =
  | "discover"    // Step 1
  | "configure"   // Step 2
  | "generate"    // Step 3
  | "preview"     // Step 4
  | "listing"     // Step 5
  | "publish";    // Step 6

export const DIGITAL_STEP_ORDER: DigitalStudioStep[] = [
  "discover",
  "configure",
  "generate",
  "preview",
  "listing",
  "publish",
];

export const DIGITAL_STEP_LABELS: Record<DigitalStudioStep, string> = {
  discover: "Discover",
  configure: "Configure",
  generate: "Generate",
  preview: "Preview & Mockups",
  listing: "Listing Package",
  publish: "Publish",
};

export const DIGITAL_STEP_ICONS: Record<DigitalStudioStep, string> = {
  discover: "search",
  configure: "settings",
  generate: "wand",
  preview: "image",
  listing: "tag",
  publish: "upload",
};

export type DigitalStepStatus = "idle" | "running" | "done" | "error" | "skipped";

// ── Product Status (Lifecycle) ───────────────────────────────

export type DigitalProductStatus =
  | "draft"           // Created, configuring
  | "generated"       // Product file/template created
  | "mockups-ready"   // Mockups generated
  | "listing-ready"   // Etsy listing package complete
  | "published"       // Live on Etsy
  | "archived";       // Archived

// ── Type-Specific Configuration ──────────────────────────────

export interface NotionConfig {
  type: "notion";
  templateType: string;          // "life_planner" | "finance_tracker" | etc.
  aesthetic: string;             // "minimal" | "brown" | "pink" | etc.
  complexity: "simple" | "medium" | "advanced";
  features?: string[];
  premium: boolean;
  notionToken?: string;          // For API build mode
  parentPageId?: string;
}

export interface PdfConfig {
  type: "pdf";
  plannerType: string;           // "weekly" | "monthly" | "daily" | etc.
  colorTheme: string;            // "sage" | "blush" | "ocean" | etc.
  designStyle?: string;          // "modern-minimal" | "boho-creative" | etc.
  paperSize: "letter" | "a4" | "a5";
  year?: number;
  customTitle?: string;
  includeNotes?: boolean;
}

export interface ExcelConfig {
  type: "excel";
  trackerType: string;           // "budget" | "habit" | "fitness" | etc.
  colorScheme: string;           // "sage-green" | "dusty-rose" | etc.
  customCategories?: string[];
}

export interface SheetsConfig {
  type: "sheets";
  sheetsType: string;             // "budget_tracker" | "paycheck_budget" | etc.
  colorScheme: string;            // "sage-green" | "dusty-rose" | etc.
  customTitle?: string;
  customCategories?: string[];
  complexity?: "simple" | "medium" | "advanced";
}

export interface PrintableConfig {
  type: "printable";
  printableType: string;         // "quote_prints" | "habit_tracker" | etc.
  colorScheme: string;
  quoteTheme?: string;
  customQuotes?: string[];
}

export type DigitalProductConfig =
  | NotionConfig
  | PdfConfig
  | ExcelConfig
  | SheetsConfig
  | PrintableConfig;

// ── Generation Result ────────────────────────────────────────

export interface NotionGenerationResult {
  type: "notion";
  pageId: string;
  pageUrl: string;
  databases: Array<{ key: string; id: string }>;
  qualityTier: "STANDARD" | "PREMIUM" | "ULTRA";
  promptOnlySteps?: string[];
}

export interface FileGenerationResult {
  type: "file";
  assetId: string;               // Reference in digital_assets table
  fileName: string;
  fileSizeBytes: number;
  pageCount?: number;
  mimeType: string;              // "application/pdf" | "application/vnd.openxmlformats-..."
  downloadUrl: string;           // /api/digital/download/{assetId}
}

export type DigitalGenerationResult =
  | NotionGenerationResult
  | FileGenerationResult;

// ── Mockup Asset ─────────────────────────────────────────────

export interface MockupAsset {
  id: string;
  sceneType: string;             // "desk-hero" | "lifestyle" | "flatlay" | etc.
  imageUrl: string;              // Pollinations URL or stored asset URL
  status: "pending" | "generating" | "done" | "error";
  width: number;
  height: number;
}

// ── Listing Package ──────────────────────────────────────────

export interface DigitalListingPackage {
  title: string;
  description: string;
  tags: string[];                // max 13
  price: { min: number; max: number; recommended: number };
  faqs: Array<{ question: string; answer: string }>;
  mockupIdeas: string[];
  status: "idle" | "generating" | "done" | "edited";
}

// ── Quality Score ────────────────────────────────────────────

export interface DigitalQualityScore {
  overall: number;               // 0-100
  tier: "BASIC" | "STANDARD" | "PREMIUM" | "ULTRA";
  breakdown: {
    content: number;             // Template richness, page count, formula count
    design: number;              // Visual quality, color consistency
    completeness: number;        // All required sections present
    etsyReadiness: number;       // Title length, tag count, image quality
  };
  etsyPriceEstimate: { min: number; max: number };
}

// ── Import Source ────────────────────────────────────────────

export interface ImportSource {
  type: "extension" | "manual" | "api";
  url?: string;                     // Source Etsy listing URL
  title?: string;                   // Original listing title
  shopName?: string;                // Etsy shop name
  importedAt: string;               // ISO timestamp
  suggestedProductType?: DigitalProductType; // Heuristic suggestion
  podScore?: number;                // Extension POD score (0-100)
  searchQuery?: string;             // Original search query
  configSource?: "inferred" | "manual"; // How config was populated
}

// ── Batch Metadata ───────────────────────────────────────────

export interface BatchMetadata {
  batchId: string;           // Groups variants together (e.g., "batch_1710000000_abc")
  parentProjectId: string;   // The project this was cloned from
  variantLabel: string;      // e.g., "sage-green", "dusty-rose"
  variantIndex: number;      // 0-based position in batch
  totalVariants: number;     // Total siblings in this batch
}

// ── Publish State ────────────────────────────────────────────

export interface DigitalPublishState {
  platform: "etsy" | "none";
  etsyListingId?: number;
  etsyListingUrl?: string;
  etsyStatus: "unpublished" | "draft" | "active" | "error";
  publishedAt?: string;
  downloadUrl?: string;          // For local export
  error?: string;
}

// ── The Unified Digital Product ──────────────────────────────

export interface DigitalProduct {
  // ── Identity ──
  id: string;
  projectName: string;
  productType: DigitalProductType;
  status: DigitalProductStatus;
  currentStep: DigitalStudioStep;
  stepStatuses: Record<DigitalStudioStep, DigitalStepStatus>;

  // ── Step 1: Discovery ──
  inspiration: {
    source: "keyword" | "opportunity" | "manual" | "auto";
    keyword?: string;
    niche?: string;
    targetAudience?: string;
    opportunityId?: string;
    competitorUrls?: string[];
  };

  // ── Step 2: Configuration ──
  config: DigitalProductConfig | null;

  // ── Step 3: Generation ──
  generation: {
    status: "idle" | "generating" | "done" | "error";
    startedAt?: string;
    completedAt?: string;
    error?: string;
    result: DigitalGenerationResult | null;
  };

  // ── Step 4: Preview & Mockups ──
  preview: {
    thumbnailUrl?: string;
    previewUrl?: string;
    mockups: MockupAsset[];
    mockupStatus: "idle" | "generating" | "done" | "error";
  };

  // ── Step 5: Listing Package ──
  listing: DigitalListingPackage;

  // ── Step 6: Publish ──
  publish: DigitalPublishState;

  // ── Quality ──
  qualityScore: DigitalQualityScore | null;

  // ── Batch ──
  batchMeta: BatchMetadata | null;

  // ── Import ──
  importSource: ImportSource | null;

  // ── Metadata ──
  createdAt: string;
  updatedAt: string;
}

// ── Factory Function ─────────────────────────────────────────

export function createEmptyDigitalProduct(
  productType: DigitalProductType = "pdf",
  projectName: string = "Untitled Product"
): DigitalProduct {
  const now = new Date().toISOString();
  return {
    id: `dp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    projectName,
    productType,
    status: "draft",
    currentStep: "discover",
    stepStatuses: {
      discover: "idle",
      configure: "idle",
      generate: "idle",
      preview: "idle",
      listing: "idle",
      publish: "idle",
    },
    inspiration: {
      source: "manual",
    },
    config: null,
    generation: {
      status: "idle",
      result: null,
    },
    preview: {
      mockups: [],
      mockupStatus: "idle",
    },
    listing: {
      title: "",
      description: "",
      tags: [],
      price: { min: 0, max: 0, recommended: 0 },
      faqs: [],
      mockupIdeas: [],
      status: "idle",
    },
    publish: {
      platform: "none",
      etsyStatus: "unpublished",
    },
    qualityScore: null,
    batchMeta: null,
    importSource: null,
    createdAt: now,
    updatedAt: now,
  };
}

// ── Project Library Summary ──────────────────────────────────

export interface DigitalProjectSummary {
  id: string;
  projectName: string;
  productType: DigitalProductType;
  status: DigitalProductStatus;
  currentStep: DigitalStudioStep;
  thumbnailUrl?: string;
  etsyListingUrl?: string;
  qualityTier?: string;
  batchId?: string;
  variantLabel?: string;
  importSourceType?: ImportSource["type"];
  importSourceUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Asset Metadata ───────────────────────────────────────────

export interface DigitalAsset {
  id: string;
  projectId: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  assetType: "product" | "mockup" | "preview" | "thumbnail";
  storagePath: string;           // Relative path from data root
  downloadUrl: string;           // API URL for downloading
  createdAt: string;
}
