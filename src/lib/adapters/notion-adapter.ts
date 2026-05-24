// ══════════════════════════════════════════════════════════════
// Notion Template Adapter (Stub)
//
// Generates Notion-compatible template packages.
// Future: exports as Notion API-ready JSON or HTML duplicatable pages.
// ══════════════════════════════════════════════════════════════

import type { ProductConceptSpec, ProductStructureSpec } from "@/types/gemini-specs";
import type { ProductAdapter, BuildResult, ImageSlotOverride } from "./product-adapter";
import { registerAdapter } from "./product-adapter";

class NotionAdapter implements ProductAdapter {
  readonly productType = "notion-template" as const;
  readonly displayName = "Notion Template";
  readonly fileExtension = "html";

  async build(
    structure: ProductStructureSpec,
    concept: ProductConceptSpec,
  ): Promise<BuildResult> {
    // Stub: generate an HTML representation of the Notion template
    // Future: generate Notion API-compatible JSON for template duplication
    const notion = structure.notion;
    const pages = notion?.pages || [];
    const databases = notion?.databases || [];

    const html = `<!DOCTYPE html>
<html>
<head><title>${structure.title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; }
  .page { border: 1px solid #e5e5e5; border-radius: 8px; padding: 1.5rem; margin: 1rem 0; }
  .page h2 { margin-top: 0; }
  .database { background: #f7f6f3; border-radius: 4px; padding: 1rem; margin: 0.5rem 0; }
  .property { display: inline-block; background: #e3e2de; padding: 2px 8px; border-radius: 3px; margin: 2px; font-size: 0.85em; }
</style>
</head>
<body>
  <h1>${structure.title}</h1>
  <p>${structure.subtitle}</p>
  <p><em>${concept.productPromise}</em></p>
  ${pages.map(p => `
  <div class="page">
    <h2>${p.icon} ${p.title}</h2>
    ${p.blocks.map(b => `<div class="${b.type}">${b.content || b.type}</div>`).join("\n    ")}
  </div>`).join("\n")}
  ${databases.map(db => `
  <div class="database">
    <h3>${db.name}</h3>
    <div>${db.properties.map(p => `<span class="property">${p.name} (${p.type})</span>`).join(" ")}</div>
    <div>Views: ${db.views.map(v => v.name).join(", ")}</div>
  </div>`).join("\n")}
</body>
</html>`;

    const buffer = Buffer.from(html, "utf-8");
    return {
      buffer,
      fileName: `${structure.title.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-")}-notion-template.html`,
      fileSizeBytes: buffer.length,
      mimeType: "text/html",
      metadata: { pageCount: pages.length, databaseCount: databases.length },
    };
  }

  async renderPreview(
    structure: ProductStructureSpec,
    _concept: ProductConceptSpec,
  ): Promise<string> {
    return this.build(structure, _concept).then(r => r.buffer.toString("utf-8"));
  }

  getImageSlotOverrides(_structure: ProductStructureSpec): Partial<Record<number, ImageSlotOverride>> {
    return {
      // Notion screenshots look different — emphasize page structure
      3: { kind: "dashboard", title: "Your Notion workspace at a glance" },
      4: { kind: "feature", title: "Powerful databases built in" },
    };
  }

  getOutputFormat() {
    return { extension: "html", mimeType: "text/html" };
  }

  canHandle(structure: ProductStructureSpec): boolean {
    return structure.productType === "notion-template";
  }
}

registerAdapter(new NotionAdapter());
export { NotionAdapter };
