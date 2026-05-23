// ══════════════════════════════════════════════════════════════
// Printable Kit Adapter (Stub)
//
// Generates printable products (cards, stickers, worksheets).
// Future: SVG/PDF generation with cut lines and print marks.
// ══════════════════════════════════════════════════════════════

import type { ProductConceptSpec, ProductStructureSpec } from "@/types/gemini-specs";
import type { ProductAdapter, BuildResult, ImageSlotOverride } from "./product-adapter";
import { registerAdapter } from "./product-adapter";

class PrintableAdapter implements ProductAdapter {
  readonly productType = "printable-kit" as const;
  readonly displayName = "Printable Kit";
  readonly fileExtension = "pdf";

  async build(
    structure: ProductStructureSpec,
    concept: ProductConceptSpec,
  ): Promise<BuildResult> {
    const printable = structure.printable;
    const pages = printable?.pages || [];

    // Stub: HTML preview of printable layout
    const html = `<!DOCTYPE html>
<html>
<head><title>${structure.title}</title>
<style>
  body { font-family: ${printable?.styleFamily === "whimsical" ? "'Comic Sans MS', cursive" : printable?.styleFamily === "vintage" ? "Georgia, serif" : "-apple-system, sans-serif"}; margin: 0; padding: 1rem; }
  .page { width: ${printable?.printSize === "4x6" ? "4in" : printable?.printSize === "5x7" ? "5in" : "8.5in"}; min-height: ${printable?.printSize === "4x6" ? "6in" : printable?.printSize === "5x7" ? "7in" : "11in"}; border: 1px solid #ccc; padding: 0.5in; margin: 1rem auto; position: relative; }
  ${printable?.cutLines ? `.page::after { content: ""; position: absolute; top: -0.25in; left: -0.25in; right: -0.25in; bottom: -0.25in; border: 1px dashed #ccc; pointer-events: none; }` : ""}
  .grid { display: grid; gap: 0.5rem; }
  h3 { margin-top: 0; }
</style>
</head>
<body>
${pages.map(p => `
  <div class="page">
    <h3>${p.title}</h3>
    ${p.layout === "grid-2x2" ? `<div class="grid" style="grid-template-columns: 1fr 1fr;">` : p.layout === "grid-3x3" ? `<div class="grid" style="grid-template-columns: 1fr 1fr 1fr;">` : `<div>`}
    ${p.elements.map(e => {
      if (e.type === "checkbox") return `<div>☐ ${e.content || ""}</div>`;
      if (e.type === "text") return `<div>${e.content || ""}</div>`;
      if (e.type === "line") return `<hr style="border: none; border-top: 1px solid #ddd;" />`;
      if (e.type === "box") return `<div style="border: 1px solid #ccc; padding: 0.5rem; min-height: 2rem;">${e.content || ""}</div>`;
      return `<div>[${e.type}]</div>`;
    }).join("\n    ")}
    </div>
  </div>`).join("\n")}
</body>
</html>`;

    const buffer = Buffer.from(html, "utf-8");
    return {
      buffer,
      fileName: `${structure.title.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-")}-printable.html`,
      fileSizeBytes: buffer.length,
      mimeType: "text/html",
      metadata: { pageCount: pages.length, format: printable?.format, cutLines: printable?.cutLines },
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
      1: { title: "Beautiful printable kit" },
      3: { kind: "feature", title: "Print and use immediately" },
    };
  }

  getOutputFormat() {
    return { extension: "pdf", mimeType: "application/pdf" };
  }

  canHandle(structure: ProductStructureSpec): boolean {
    return structure.productType === "printable-kit";
  }
}

registerAdapter(new PrintableAdapter());
export { PrintableAdapter };
