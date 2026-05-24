// ─────────────────────────────────────────────────────────────────
// Auto-pipeline types — shared between server-side orchestrator
// (`src/lib/auto-pipeline-*.ts`) and client-side panel
// (`src/components/cross-stitch/AutoPipelinePanel.tsx`).
//
// Lives in /lib so server code can `import type { ... }` without
// pulling in React / "use client" boundary from the panel component.
// The panel re-exports these so existing imports keep working.
// ─────────────────────────────────────────────────────────────────

export type PipelineItemStatus =
  | "queued"
  | "generating"   // gpt-image-2 + flatten
  | "converting"   // Python KMeans
  | "exporting"    // PDF bundle generation
  | "mocking"      // mockups generation
  | "videoing"     // listing video render
  | "writing"      // listing copy generation
  | "done"         // all phase-2 steps complete
  | "publishing"   // Approve → Etsy publish flow in progress
  | "failed";

export interface ListingCopy {
  title: string;
  description: string;
  tags: string[];
  price: number;
  /** SEO attributes for Etsy filter-narrowed searches.  Set during
   *  Stage 3 (Gemini listing copy) and forwarded to /list-on-etsy
   *  during publish so Etsy's taxonomy properties get populated. */
  attributes?: {
    primaryColor?: string;
    secondaryColor?: string;
    theme?: string;
    holiday?: string;
    occasion?: string;
    recipient?: string;
  };
}

export interface MockupImage {
  scene: string;
  dataUrl: string;
  /** Slim polling responses keep scene metadata but strip the heavy base64
   *  image. This flag lets the UI distinguish "image exists on the server"
   *  from "safe to render this <img> right now". */
  hasDataUrl?: boolean;
}

export interface AutoPipelineItem {
  id: string;
  title: string;
  ideaId?: string;
  status: PipelineItemStatus;
  imageUrl?: string;
  cleanImageUrl?: string;
  patternStats?: {
    width: number;
    height: number;
    colors: number;
    totalStitches: number;
  };
  patternFull?: {
    grid: string[][];
    colors: Array<{ dmc: string; name: string; hex: string; symbol: string; count: number }>;
    width: number;
    height: number;
    totalStitches: number;
    backgroundDmc?: string;
    totalCells?: number;
    stitchedCells?: number;
    backgroundRemovedCells?: number;
    patternPdfB64?: string;
  };
  mockups?: MockupImage[];
  pdfBundleB64?: string;
  hasPdf?: boolean;
  videoB64?: string;
  hasVideo?: boolean;
  // Slim-mode shadow flag for imageUrl.  Set whenever stage1A persists
  // imageUrl so polling clients can render the ✓gen badge without
  // shipping the ~1.4 MB base64 data URL on every 2 s tick.
  hasImage?: boolean;
  listingCopy?: ListingCopy;
  etsyListingId?: string;
  error?: string;
  publishProgress?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface AutoPipelineState {
  /** Server-side auto_pipeline_jobs id, when this queue came from the API. */
  jobId?: string;
  active: boolean;
  /** User clicked cancel — orchestrator should bail at the next safe point. */
  cancelled: boolean;
  currentItemId: string | null;
  items: AutoPipelineItem[];
  /** Running USD spend tally. */
  totalCostUsd: number;
  /** Unix ms — when the queue first kicked off. */
  startedAt: number;
}
