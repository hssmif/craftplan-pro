// ══════════════════════════════════════════════════════════════
// PDF Planner Adapter (Stub)
//
// Generates PDF planner/worksheet products.
// Future: use pdfkit or puppeteer for styled PDF generation.
// ══════════════════════════════════════════════════════════════

import type { ProductConceptSpec, ProductStructureSpec } from "@/types/gemini-specs";
import type { ProductAdapter, BuildResult, ImageSlotOverride } from "./product-adapter";
import { registerAdapter } from "./product-adapter";

class PdfAdapter implements ProductAdapter {
  readonly productType = "pdf-planner" as const;
  readonly displayName = "PDF Planner";
  readonly fileExtension = "pdf";

  async build(
    structure: ProductStructureSpec,
    concept: ProductConceptSpec,
  ): Promise<BuildResult> {
    // Stub: Generate an HTML-based PDF preview
    // Future: Use pdfkit or puppeteer to generate actual styled PDFs
    const pdf = structure.pdf;
    const pages = pdf?.pages || [];
    const palette = pdf?.palette || { primary: "#1B3A5C", secondary: "#2D5A87", accent: "#E8A87C", background: "#FFFFFF", text: "#1F2937" };

    const html = `<!DOCTYPE html>
<html>
<head><title>${structure.title}</title>
<style>
  @page { size: ${pdf?.pageSize || "letter"} ${pdf?.orientation || "portrait"}; margin: 0.75in; }
  body { font-family: ${pdf?.styleFamily === "elegant-serif" ? "Georgia, serif" : pdf?.styleFamily === "hand-drawn" ? "'Comic Sans MS', cursive" : "-apple-system, sans-serif"}; color: ${palette.text}; }
  .page { page-break-after: always; min-height: 9in; padding: 1rem; border: 1px solid #ddd; margin-bottom: 1rem; }
  .page:last-child { page-break-after: auto; }
  h1 { color: ${palette.primary}; }
  h2 { color: ${palette.secondary}; border-bottom: 2px solid ${palette.accent}; padding-bottom: 0.3rem; }
  .grid { display: grid; gap: 0.5rem; }
  .checklist-item { padding: 0.3rem 0; border-bottom: 1px solid #eee; }
  .checklist-item::before { content: "☐ "; }
</style>
</head>
<body>
${pages.map(p => `
  <div class="page">
    ${p.title ? `<h2>${p.title}</h2>` : ""}
    ${p.sections.map(s => {
      if (s.type === "checklist") return Array.from({ length: s.rows || 8 }, () => `<div class="checklist-item">&nbsp;</div>`).join("\n");
      if (s.type === "lined-area") return Array.from({ length: s.rows || 12 }, () => `<div style="border-bottom: 1px solid #ddd; height: 2rem;">&nbsp;</div>`).join("\n");
      if (s.type === "grid") return `<div class="grid" style="grid-template-columns: repeat(${s.cols || 3}, 1fr);">${Array.from({ length: (s.rows || 3) * (s.cols || 3) }, () => `<div style="border: 1px solid #eee; height: 3rem;"></div>`).join("")}</div>`;
      if (s.type === "prompt-box") return `<div style="border: 2px solid ${palette.accent}; border-radius: 8px; padding: 1rem; margin: 0.5rem 0;"><em>${s.prompt || "Write here..."}</em></div>`;
      return `<div style="margin: 0.5rem 0; padding: 0.5rem; background: ${palette.background};">${s.type}</div>`;
    }).join("\n    ")}
  </div>`).join("\n")}
</body>
</html>`;

    const buffer = Buffer.from(html, "utf-8");
    return {
      buffer,
      fileName: `${structure.title.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-")}-planner.html`,
      fileSizeBytes: buffer.length,
      mimeType: "text/html", // Will be "application/pdf" when real PDF gen is implemented
      metadata: { pageCount: pages.length, styleFamily: pdf?.styleFamily },
    };
  }

  async renderPreview(
    structure: ProductStructureSpec,
    concept: ProductConceptSpec,
  ): Promise<string> {
    const result = await this.build(structure, concept);
    return result.buffer.toString("utf-8");
  }

  getImageSlotOverrides(_structure: ProductStructureSpec): Partial<Record<number, ImageSlotOverride>> {
    return {
      // PDF products show page previews instead of spreadsheet screenshots
      1: { title: "Beautiful printable planner" },
      3: { kind: "dashboard", title: "Thoughtfully designed pages" },
      4: { kind: "feature", title: "Every page serves a purpose" },
    };
  }

  getOutputFormat() {
    return { extension: "pdf", mimeType: "application/pdf" };
  }

  canHandle(structure: ProductStructureSpec): boolean {
    return structure.productType === "pdf-planner";
  }
}

registerAdapter(new PdfAdapter());
export { PdfAdapter };
