// ══════════════════════════════════════════════════════════════
// Product Adapter Registry
//
// Import this module to initialize all available adapters.
// Each adapter auto-registers when its module is imported.
// ══════════════════════════════════════════════════════════════

// ── Core adapter exports ────────────────────────────────────
export {
  type ProductAdapter,
  type BuildResult,
  type ImageSlotOverride,
  getAdapter,
  hasAdapter,
  getAllAdapters,
  getAvailableProductTypes,
  registerAdapter,
} from "./product-adapter";

// ── Register all adapters ───────────────────────────────────
// Import each adapter to trigger auto-registration

import "./sheets-adapter";
import "./excel-adapter";
import "./notion-adapter";
import "./pdf-adapter";
import "./printable-adapter";

export { SheetsAdapter } from "./sheets-adapter";
export { ExcelAdapter } from "./excel-adapter";
export { NotionAdapter } from "./notion-adapter";
export { PdfAdapter } from "./pdf-adapter";
export { PrintableAdapter } from "./printable-adapter";
