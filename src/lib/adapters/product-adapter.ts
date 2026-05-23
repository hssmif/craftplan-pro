// ══════════════════════════════════════════════════════════════
// Product Adapter Interface
//
// Each digital product type implements this interface.
// The factory orchestrator calls adapters generically —
// it doesn't need to know product-type specifics.
//
// Adapter responsibilities:
//   - Accept a ProductStructureSpec
//   - Build the actual product file (xlsx, html, pdf, etc.)
//   - Provide type-specific image plan adjustments
//   - Return a BuildResult with the file buffer
// ══════════════════════════════════════════════════════════════

import type {
  ProductConceptSpec,
  ProductStructureSpec,
  GeminiProductType,
} from "@/types/gemini-specs";

// ── Build Result ───────────────────────────────────────────────

export interface BuildResult {
  /** The product file buffer */
  buffer: Buffer;
  /** Suggested file name */
  fileName: string;
  /** File size in bytes */
  fileSizeBytes: number;
  /** MIME type for downloads */
  mimeType: string;
  /** Product-specific metadata */
  metadata?: Record<string, unknown>;
}

// ── Image Slot Override ────────────────────────────────────────

export interface ImageSlotOverride {
  /** Override the image kind for this slot */
  kind?: string;
  /** Override the title text */
  title?: string;
  /** Skip this slot for this product type */
  skip?: boolean;
}

// ── Product Adapter Interface ──────────────────────────────────

export interface ProductAdapter {
  /** Which product type this adapter handles */
  readonly productType: GeminiProductType;

  /** Human-readable product type name */
  readonly displayName: string;

  /** File extension (e.g., "xlsx", "pdf", "html") */
  readonly fileExtension: string;

  /**
   * Build the actual product from a structure spec.
   * This is the core method — takes the Gemini-generated structure
   * and produces a downloadable file.
   */
  build(
    structure: ProductStructureSpec,
    concept: ProductConceptSpec,
  ): Promise<BuildResult>;

  /**
   * Generate type-specific preview HTML for Playwright screenshots.
   * Used by the image renderer to capture product previews.
   */
  renderPreview(
    structure: ProductStructureSpec,
    concept: ProductConceptSpec,
  ): Promise<string>;

  /**
   * Get image slot overrides for this product type.
   * Some product types need different image compositions
   * (e.g., PDF shows page previews, not spreadsheet screenshots).
   */
  getImageSlotOverrides(
    structure: ProductStructureSpec,
  ): Partial<Record<number, ImageSlotOverride>>;

  /**
   * Get the output format info for packaging.
   */
  getOutputFormat(): { extension: string; mimeType: string };

  /**
   * Check if this adapter can handle the given structure.
   */
  canHandle(structure: ProductStructureSpec): boolean;
}

// ── Adapter Registry ───────────────────────────────────────────

const registry = new Map<GeminiProductType, ProductAdapter>();

export function registerAdapter(adapter: ProductAdapter): void {
  registry.set(adapter.productType, adapter);
}

export function getAdapter(productType: GeminiProductType): ProductAdapter {
  const adapter = registry.get(productType);
  if (!adapter) {
    throw new Error(
      `No adapter registered for product type "${productType}". Available: ${[...registry.keys()].join(", ")}`,
    );
  }
  return adapter;
}

export function hasAdapter(productType: GeminiProductType): boolean {
  return registry.has(productType);
}

export function getAllAdapters(): ProductAdapter[] {
  return [...registry.values()];
}

export function getAvailableProductTypes(): GeminiProductType[] {
  return [...registry.keys()];
}
