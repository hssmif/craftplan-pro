// ══════════════════════════════════════════════════════════════
// Factory Engine: Template Preview API
//
// GET /api/factory/preview?blueprintId=xxx
//   → Returns a real Playwright screenshot of the spreadsheet
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { getFactoryBlueprint, getFactoryRun } from "@/lib/db";
import { screenshotDashboard } from "@/lib/factory-preview-engine";
import { resolveNicheProfile } from "@/lib/factory-niche-themes";
import { getGoogleApis, isGoogleAuthConfigured } from "@/lib/google-auth";
import type { ProductBlueprint } from "@/types/factory";
import type { DigitalProductConfig } from "@/types/digital-product";

// ── Gemini Spec → Beautiful HTML Preview ─────────────────────
// Renders the Gemini-generated sheet structure as a styled HTML page
// that screenshots cleanly. Uses the spec's actual colors, tab names,
// columns, and sample data — so every product looks distinct.

interface GeminiSpec {
  product_name: string;
  tagline: string;
  niche: string;
  color_scheme: {
    primary: string;
    primary_text: string;
    accent: string;
    accent_text: string;
    alt_row: string;
    section_header: string;
  };
  tabs: Array<{
    name: string;
    type: string;
    purpose: string;
    sections: Array<{
      title?: string;
      columns: Array<{ header: string; key: string; width: number; type: string; formula_template?: string }>;
      row_count: number;
      sample_data: Array<Record<string, string | number | null>>;
      totals_row: boolean;
    }>;
  }>;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function formatCellValue(value: unknown, type: string): string {
  if (value === null || value === undefined || value === "") return "";
  if (type === "currency" && typeof value === "number") return `$${value.toFixed(2)}`;
  if (type === "percent" && typeof value === "number") return `${value.toFixed(1)}%`;
  if (type === "number" && typeof value === "number") return value.toLocaleString();
  return String(value);
}

function renderGeminiSpecHtml(spec: GeminiSpec): string {
  const cs = spec.color_scheme;
  const primary = `#${cs.primary}`;
  const primaryText = `#${cs.primary_text}`;
  const accent = `#${cs.accent}`;
  const altRow = `#${cs.alt_row}`;
  const sectionHeader = `#${cs.section_header}`;

  // Render the FIRST (dashboard) tab as the preview hero
  const firstTab = spec.tabs[0];
  if (!firstTab) return "<html><body>No tabs in spec</body></html>";

  // Build the tab strip
  const tabStrip = spec.tabs
    .map((t, i) => `
      <div style="
        padding: 6px 14px;
        font-size: 11px;
        ${i === 0
          ? `background: white; border-top: 2px solid ${primary}; color: #222; font-weight: 600;`
          : `background: #f1f3f4; color: #666;`}
        border-right: 1px solid #dadce0;
      ">${escapeHtml(t.name)}</div>`)
    .join("");

  // Build sections of the first tab
  const sectionsHtml = firstTab.sections.map((section) => {
    const headerRow = `
      <tr style="background: ${primary};">
        ${section.columns.map((col, i) => `
          <th style="
            padding: 10px 12px;
            color: ${primaryText};
            font-weight: 600;
            font-size: 11px;
            text-align: ${i === 0 ? "left" : "center"};
            border: 1px solid ${primary};
            white-space: nowrap;
          ">${escapeHtml(col.header)}</th>
        `).join("")}
      </tr>`;

    const rows = Array.from({ length: Math.min(section.row_count, 12) }, (_, r) => {
      const data = section.sample_data[r] ?? {};
      const isAlt = r % 2 === 1;
      return `
        <tr style="background: ${isAlt ? altRow : "white"};">
          ${section.columns.map((col, i) => {
            const v = data[col.key];
            const display = formatCellValue(v, col.type);
            return `<td style="
              padding: 8px 12px;
              font-size: 11px;
              color: #2d2d2d;
              text-align: ${i === 0 ? "left" : (col.type === "currency" || col.type === "number" || col.type === "percent" ? "right" : "center")};
              border: 1px solid #e5e7eb;
              white-space: nowrap;
            ">${escapeHtml(display)}</td>`;
          }).join("")}
        </tr>`;
    }).join("");

    let totalsHtml = "";
    if (section.totals_row && section.row_count > 0) {
      totalsHtml = `
        <tr style="background: ${accent};">
          ${section.columns.map((col, i) => {
            let cellText = "";
            if (i === 0) {
              cellText = "TOTAL";
            } else if (col.type === "currency" || col.type === "number") {
              const sum = (section.sample_data.slice(0, Math.min(section.row_count, 12)) || [])
                .reduce((acc, row) => {
                  const v = row?.[col.key];
                  return acc + (typeof v === "number" ? v : 0);
                }, 0);
              cellText = col.type === "currency" ? `$${sum.toFixed(2)}` : sum.toLocaleString();
            }
            return `<td style="
              padding: 9px 12px;
              font-weight: 700;
              font-size: 11px;
              color: #${cs.accent_text};
              text-align: ${i === 0 ? "left" : "right"};
              border: 1px solid ${accent};
            ">${escapeHtml(cellText)}</td>`;
          }).join("")}
        </tr>`;
    }

    const sectionTitleHtml = section.title
      ? `<tr><td colspan="${section.columns.length}" style="
          padding: 10px 14px;
          background: ${sectionHeader};
          font-weight: 700;
          font-size: 11px;
          letter-spacing: 0.5px;
          color: #444;
          text-transform: uppercase;
          border: 1px solid ${primary};
        ">${escapeHtml(section.title)}</td></tr>`
      : "";

    return `
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px;">
        ${sectionTitleHtml}
        ${headerRow}
        ${rows}
        ${totalsHtml}
      </table>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: white;
    color: #1f2937;
  }
  .chrome {
    background: #f8f9fa;
    border-bottom: 1px solid #dadce0;
    padding: 8px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .chrome .icon {
    width: 22px;
    height: 22px;
    border-radius: 4px;
    background: ${primary};
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 13px;
    font-weight: bold;
  }
  .chrome .title {
    font-size: 14px;
    color: #202124;
    font-weight: 500;
  }
  .toolbar {
    background: white;
    border-bottom: 1px solid #dadce0;
    padding: 6px 16px;
    font-size: 11px;
    color: #5f6368;
  }
  .header-banner {
    background: ${primary};
    color: ${primaryText};
    text-align: center;
    padding: 16px;
    font-size: 16px;
    font-weight: 600;
  }
  .product-info {
    padding: 18px 24px;
    background: white;
    border-bottom: 1px solid #f0f0f0;
  }
  .product-info h1 {
    margin: 0 0 4px 0;
    font-size: 22px;
    font-weight: 700;
    color: ${primary};
    letter-spacing: -0.3px;
  }
  .product-info .tagline {
    margin: 0;
    font-size: 13px;
    color: #6b7280;
    font-style: italic;
  }
  .content { padding: 18px 24px; }
  .tab-strip {
    display: flex;
    background: #f1f3f4;
    border-top: 1px solid #dadce0;
    margin-top: auto;
    overflow: hidden;
  }
</style>
</head>
<body>
  <div class="chrome">
    <div class="icon">${spec.tabs[0]?.type === "dashboard" ? "📊" : "📋"}</div>
    <div class="title">${escapeHtml(spec.product_name.slice(0, 60))}</div>
  </div>
  <div class="toolbar">File &nbsp; Edit &nbsp; View &nbsp; Insert &nbsp; Format &nbsp; Data &nbsp; Tools &nbsp; Extensions &nbsp; Help</div>

  <div class="product-info">
    <h1>${escapeHtml(spec.product_name)}</h1>
    <p class="tagline">${escapeHtml(spec.tagline)}</p>
  </div>

  <div class="header-banner">${escapeHtml(firstTab.purpose)}</div>

  <div class="content">${sectionsHtml}</div>

  <div class="tab-strip">${tabStrip}</div>
</body>
</html>`;
}

async function screenshotHtmlPlaywright(html: string): Promise<Buffer | null> {
  const tmpHtml = path.join("/tmp", `gemini-preview-${Date.now()}.html`);
  const tmpScript = path.join("/tmp", `gemini-screenshot-${Date.now()}.cjs`);
  try {
    fs.writeFileSync(tmpHtml, html, "utf-8");
    const scriptContent = [
      `const { chromium } = require('playwright');`,
      `(async () => {`,
      `  const browser = await chromium.launch({ headless: true });`,
      `  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 2 });`,
      `  await page.goto('file://${tmpHtml}', { waitUntil: 'load', timeout: 15000 });`,
      `  await page.waitForTimeout(300);`,
      `  const buf = await page.screenshot({ type: 'png', fullPage: true });`,
      `  process.stdout.write(buf);`,
      `  await browser.close();`,
      `})().catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    fs.writeFileSync(tmpScript, scriptContent);

    const screenshotBuf = execSync(`node "${tmpScript}"`, {
      timeout: 30_000,
      maxBuffer: 20 * 1024 * 1024,
      cwd: process.cwd(),
    });

    return screenshotBuf;
  } catch (err) {
    console.error("[factory/preview] Gemini screenshot exec failed:", err instanceof Error ? err.message.slice(0, 200) : err);
    return null;
  } finally {
    try { fs.unlinkSync(tmpHtml); } catch { /* ignore */ }
    try { fs.unlinkSync(tmpScript); } catch { /* ignore */ }
  }
}

// ── Helpers ───────────────────────────────────────────────────

function reconstructBlueprint(
  raw: Record<string, unknown>,
): ProductBlueprint {
  const config = JSON.parse(raw.config as string) as DigitalProductConfig;
  const differentiation = JSON.parse(
    (raw.differentiation_strategy as string) || "{}",
  );

  return {
    id: raw.id as string,
    factoryRunId: (raw.factory_run_id as string) || "",
    sourceListingTitle: raw.source_listing_title as string,
    productType: raw.product_type as ProductBlueprint["productType"],
    config,
    competitorStrengths: JSON.parse((raw.competitor_strengths as string) || "[]"),
    competitorWeaknesses: JSON.parse((raw.competitor_weaknesses as string) || "[]"),
    differentiation,
    listingStrategy: differentiation.listingStrategy || {
      titleKeywords: [],
      positionAs: "premium",
      uniqueSellingPoints: [],
    },
    suggestedPrice: raw.suggested_price as number,
    positioning: raw.positioning as string,
    createdAt: raw.created_at as string,
    tabs: JSON.parse((raw.tabs as string) || "[]"),
    charts: JSON.parse((raw.charts as string) || "[]"),
    colorScheme: JSON.parse(
      (raw.color_scheme as string) ||
        '{"primary":"#1B3A5C","secondary":"#2C5282","accent":"#D4AF37","background":"#FFFFFF","text":"#2D3436","success":"#22C55E","danger":"#EF4444"}',
    ),
    sampleDataStrategy: (raw.sample_data as string) || "",
    deliveryMethod: ((raw.delivery_method as string) || "xlsx_download") as
      | "xlsx_download"
      | "sheets_link"
      | "both",
  };
}

// ── GET handler ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const blueprintId = searchParams.get("blueprintId");

    if (!blueprintId) {
      return NextResponse.json(
        { error: "Missing required query param: blueprintId" },
        { status: 400 },
      );
    }

    // Fetch from DB
    const raw = getFactoryBlueprint(blueprintId);
    if (!raw) {
      return NextResponse.json(
        { error: `Blueprint not found: ${blueprintId}` },
        { status: 404 },
      );
    }

    // Reconstruct typed blueprint
    const blueprint = reconstructBlueprint(raw as Record<string, unknown>);

    const factoryRunId = raw.factory_run_id as string;
    const run = factoryRunId ? getFactoryRun(factoryRunId) : null;

    // ── PRIORITY 1: Gemini sheet spec render ──
    // The Gemini builder saves its full spec on the run. Render the
    // actual Gemini structure (niche-specific tabs, columns, sample
    // data, color palette) instead of the generic blueprint template.
    const geminiSpecRaw = run?.gemini_sheet_spec as string | undefined;
    if (geminiSpecRaw) {
      try {
        const geminiSpec = JSON.parse(geminiSpecRaw);
        const html = renderGeminiSpecHtml(geminiSpec);
        const screenshotBuf = await screenshotHtmlPlaywright(html);
        if (screenshotBuf && screenshotBuf.length > 1000) {
          return new NextResponse(new Uint8Array(screenshotBuf), {
            status: 200,
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "public, max-age=3600",
            },
          });
        }
      } catch (err) {
        console.warn("[factory/preview] Gemini-spec render failed, falling back:", err instanceof Error ? err.message.slice(0, 120) : "");
      }
    }

    // ── Legacy: Real Google Sheet screenshot (when OAuth was used) ──
    if (factoryRunId && run) {
      const googleSheetId = run.google_sheet_id as string;
      if (googleSheetId && isGoogleAuthConfigured()) {
        let permissionId: string | null = null;
        try {
          // 1. Share the sheet publicly so headless Playwright can access it
          const { drive } = await getGoogleApis();
          const perm = await drive.permissions.create({
            fileId: googleSheetId,
            requestBody: { role: "reader", type: "anyone" },
          });
          permissionId = perm.data.id || null;
          console.log(`[factory/preview] Sheet ${googleSheetId} shared publicly for screenshot`);

          // 2. Screenshot the real Google Sheet at /edit URL (full formatting)
          const sheetUrl = `https://docs.google.com/spreadsheets/d/${googleSheetId}/edit#gid=0`;
          console.log(`[factory/preview] Screenshotting real Google Sheet (edit view): ${sheetUrl}`);

          const tmpScript = path.join("/tmp", `preview_${Date.now()}.cjs`);
          const scriptContent = [
            `const { chromium } = require('playwright');`,
            `(async () => {`,
            `  const browser = await chromium.launch({ headless: true });`,
            `  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });`,
            `  await page.goto(${JSON.stringify(sheetUrl)}, { waitUntil: 'load', timeout: 30000 });`,
            `  try { await page.waitForSelector('.grid-container, .waffle, [role="grid"]', { timeout: 15000 }); } catch {}`,
            `  await page.waitForTimeout(5000);`,
            `  // Dismiss popups`,
            `  const btns = await page.$$('[aria-label="Close"], [aria-label="Dismiss"], .docs-butterbar-dismiss');`,
            `  for (const b of btns) await b.click().catch(() => {});`,
            `  await page.waitForTimeout(1000);`,
            `  const buf = await page.screenshot({ type: 'png', fullPage: false });`,
            `  process.stdout.write(buf);`,
            `  await browser.close();`,
            `})();`,
          ].join("\n");
          fs.writeFileSync(tmpScript, scriptContent);

          const screenshotBuf = execSync(`node "${tmpScript}"`, {
            timeout: 45_000,
            maxBuffer: 10 * 1024 * 1024,
            cwd: process.cwd(),
          });

          // Clean up temp file
          try { fs.unlinkSync(tmpScript); } catch { /* ignore */ }

          if (screenshotBuf.length > 1000) {
            // 3. Revoke public access before returning
            if (permissionId) {
              try {
                await drive.permissions.delete({ fileId: googleSheetId, permissionId });
                console.log(`[factory/preview] Public access revoked`);
              } catch { /* ignore revoke errors */ }
            }

            return new NextResponse(new Uint8Array(screenshotBuf), {
              status: 200,
              headers: {
                "Content-Type": "image/png",
                "Cache-Control": "public, max-age=3600",
              },
            });
          }
        } catch (ssErr) {
          console.warn("[factory/preview] Real sheet screenshot failed, using synthetic:", ssErr instanceof Error ? ssErr.message.slice(0, 100) : "");
        } finally {
          // Always revoke public access, even on error
          if (permissionId) {
            try {
              const { drive } = await getGoogleApis();
              await drive.permissions.delete({ fileId: googleSheetId, permissionId });
              console.log(`[factory/preview] Public access revoked (cleanup)`);
            } catch { /* ignore — best effort */ }
          }
        }
      }
    }

    // ── Fallback: synthetic HTML screenshot ──
    const config = blueprint.config as {
      sheetsType?: string;
      niche?: string;
      colorScheme?: unknown;
    };
    const nicheStr =
      config.niche ||
      blueprint.sourceListingTitle ||
      (config.sheetsType as string) ||
      "budget_tracker";
    const nicheProfile = resolveNicheProfile(nicheStr, blueprint.colorScheme);

    // Take a Playwright screenshot of the dashboard tab
    const result = await screenshotDashboard(blueprint, nicheProfile, {
      width: 1200,
      height: 800,
      showChrome: true,
      showTabBar: true,
      cropToData: true,
    });

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[factory/preview] Screenshot failed:", err);
    return NextResponse.json(
      { error: "Failed to generate preview", detail: String(err) },
      { status: 500 },
    );
  }
}
