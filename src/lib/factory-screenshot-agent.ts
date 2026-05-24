// ══════════════════════════════════════════════════════════════
// Factory Screenshot Agent
// Captures spreadsheet screenshots and composes Etsy listing
// images using browser preview tools.
// ══════════════════════════════════════════════════════════════

import type {
  ListingImagePlan,
  ListingImageSpec,
  ListingImageKind,
  CropIntent,
  MockupType,
  OverlayStyle,
} from "@/types/factory";

// ── Types ───────────────────────────────────────────────────

export interface ScreenshotResult {
  tabName: string;
  screenshotPath: string; // local file path
  region: "full" | "kpi" | "chart" | "table" | "header";
  width: number;
  height: number;
}

export interface MockupResult {
  slot: number; // 1-7 for Etsy listing
  imagePath: string;
  title: string;
  type: "thumbnail" | "dashboard" | "feature" | "method" | "included" | "delivery" | "problem";
}

export interface ScreenshotPlan {
  spreadsheetUrl: string;
  captures: Array<{
    tabName: string;
    region: string; // CSS selector or cell range
    viewport: { width: number; height: number };
    outputPath: string;
    description: string;
  }>;
}

export interface ScreenshotCommand {
  type: "navigate" | "click" | "wait" | "screenshot" | "resize" | "scroll";
  params: Record<string, unknown>;
}

// ── Viewport presets ────────────────────────────────────────

const VIEWPORT_PRESETS = {
  thumbnail: { width: 2400, height: 1800 },
  dashboard: { width: 2400, height: 1600 },
  feature: { width: 2400, height: 1600 },
  fullTab: { width: 2400, height: 1800 },
  kpi: { width: 2400, height: 800 },
  chart: { width: 1600, height: 1200 },
  textSlide: { width: 2400, height: 1800 },
} as const;

// ── Region selectors by crop intent ─────────────────────────

function regionSelectorForIntent(intent: CropIntent | undefined, sourceRange?: string): string {
  if (sourceRange) {
    // If a cell range is provided (e.g., "A1:L23"), use it as a reference
    return `[data-range="${sourceRange}"]`;
  }
  switch (intent) {
    case "kpi":
      return ".kpi-section, [data-section='kpi'], tr:nth-child(-n+3)";
    case "chart":
      return ".chart-container, canvas, svg.chart";
    case "table":
      return "table, .data-table, .grid-container";
    case "section":
      return ".section, [data-section]";
    case "tabs-bar":
      return ".sheet-tab-bar, [role='tablist']";
    case "full":
    default:
      return "body";
  }
}

function viewportForSpec(spec: ListingImageSpec): { width: number; height: number } {
  if (spec.mockupType === "text-slide") return VIEWPORT_PRESETS.textSlide;
  switch (spec.cropIntent) {
    case "kpi":
      return VIEWPORT_PRESETS.kpi;
    case "chart":
      return VIEWPORT_PRESETS.chart;
    case "full":
      return VIEWPORT_PRESETS.fullTab;
    default:
      return VIEWPORT_PRESETS.dashboard;
  }
}

// ── Plan screenshots ────────────────────────────────────────

/**
 * Analyze the image plan and determine what screenshots are needed
 * from the spreadsheet. Text-only slides (problem, method, delivery)
 * do not require spreadsheet captures.
 */
export function planScreenshots(imagePlan: ListingImagePlan): ScreenshotPlan {
  const captures: ScreenshotPlan["captures"] = [];

  for (const spec of imagePlan.images) {
    // Text-only slides don't need spreadsheet screenshots
    if (spec.mockupType === "text-slide") continue;

    // Skip images that don't reference a source tab
    if (!spec.sourceTab) continue;

    const viewport = viewportForSpec(spec);
    const region = regionSelectorForIntent(spec.cropIntent, spec.sourceRange);

    captures.push({
      tabName: spec.sourceTab,
      region,
      viewport,
      outputPath: `capture_slot${spec.slot}_${spec.kind}.png`,
      description: `Slot ${spec.slot} (${spec.kind}): ${spec.title} — tab "${spec.sourceTab}"`,
    });
  }

  return {
    spreadsheetUrl: "", // Set by caller when spreadsheet is opened
    captures,
  };
}

// ── Build screenshot commands ───────────────────────────────

/**
 * Convert a screenshot plan into an ordered sequence of browser
 * commands (navigate, click, resize, wait, screenshot).
 * These commands map directly to Claude Preview MCP tool calls.
 */
export function buildScreenshotCommands(
  spreadsheetUrl: string,
  plan: ScreenshotPlan,
  outputDir: string
): ScreenshotCommand[] {
  const commands: ScreenshotCommand[] = [];

  // 1. Navigate to the spreadsheet
  commands.push({
    type: "navigate",
    params: { url: spreadsheetUrl },
  });

  // 2. Wait for initial load
  commands.push({
    type: "wait",
    params: { ms: 3000, description: "Wait for spreadsheet to fully render" },
  });

  // Group captures by tab to minimize navigation
  const capturesByTab = new Map<string, typeof plan.captures>();
  for (const capture of plan.captures) {
    const existing = capturesByTab.get(capture.tabName) ?? [];
    existing.push(capture);
    capturesByTab.set(capture.tabName, existing);
  }

  for (const [tabName, captures] of capturesByTab) {
    // Click on the tab to switch to it
    commands.push({
      type: "click",
      params: {
        selector: `[data-tab="${tabName}"], [aria-label="${tabName}"], .sheet-tab:has-text("${tabName}")`,
        description: `Switch to tab: ${tabName}`,
      },
    });

    // Wait for tab content to render
    commands.push({
      type: "wait",
      params: { ms: 1500, description: `Wait for "${tabName}" tab to render` },
    });

    for (const capture of captures) {
      // Resize viewport for this capture
      commands.push({
        type: "resize",
        params: {
          width: capture.viewport.width,
          height: capture.viewport.height,
          description: `Resize for ${capture.description}`,
        },
      });

      // Scroll to the relevant region if it's not "full"
      if (capture.region !== "body") {
        commands.push({
          type: "scroll",
          params: {
            selector: capture.region,
            description: `Scroll to region: ${capture.region}`,
          },
        });
      }

      // Wait briefly for scroll/render
      commands.push({
        type: "wait",
        params: { ms: 500 },
      });

      // Take the screenshot
      commands.push({
        type: "screenshot",
        params: {
          outputPath: `${outputDir}/${capture.outputPath}`,
          selector: capture.region !== "body" ? capture.region : undefined,
          fullPage: capture.region === "body",
          description: capture.description,
        },
      });
    }
  }

  return commands;
}

// ── HTML templates for listing image composition ────────────

function overlayColors(style: OverlayStyle, colorScheme: ListingImagePlan["colorScheme"]) {
  switch (style) {
    case "bold-dark":
      return {
        bg: colorScheme.primary,
        text: "#FFFFFF",
        accent: colorScheme.accent,
        overlay: "rgba(0,0,0,0.55)",
      };
    case "clean-light":
      return {
        bg: colorScheme.background,
        text: colorScheme.primary,
        accent: colorScheme.accent,
        overlay: "rgba(255,255,255,0.85)",
      };
    case "minimal-premium":
      return {
        bg: "#FFFFFF",
        text: "#1A1A1A",
        accent: colorScheme.accent,
        overlay: "rgba(255,255,255,0.92)",
      };
  }
}

function buildThumbnailHtml(
  spec: ListingImageSpec,
  screenshotPath: string | null,
  colors: ReturnType<typeof overlayColors>,
  productName: string
): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 2400px; height: 1800px; background: ${colors.bg}; font-family: 'Inter', 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; }
  .laptop-frame {
    width: 1800px; height: 1150px; background: #222; border-radius: 20px; padding: 30px 30px 60px;
    box-shadow: 0 40px 80px rgba(0,0,0,0.3);
    position: relative;
  }
  .laptop-frame::after {
    content: ''; position: absolute; bottom: -20px; left: 50%; transform: translateX(-50%);
    width: 600px; height: 20px; background: #333; border-radius: 0 0 10px 10px;
  }
  .screen {
    width: 100%; height: 100%; background: #fff; border-radius: 6px; overflow: hidden;
    ${screenshotPath ? `background-image: url('file://${screenshotPath}'); background-size: cover; background-position: top left;` : ""}
  }
  .overlay {
    position: absolute; bottom: 120px; left: 50%; transform: translateX(-50%);
    background: ${colors.overlay}; backdrop-filter: blur(10px);
    padding: 30px 60px; border-radius: 16px; text-align: center; max-width: 90%;
  }
  .title { font-size: 56px; font-weight: 800; color: ${colors.text}; line-height: 1.2; }
  .subtitle { font-size: 28px; font-weight: 500; color: ${colors.accent}; margin-top: 10px; }
</style></head>
<body>
  <div class="laptop-frame">
    <div class="screen"></div>
    <div class="overlay">
      <div class="title">${escapeHtml(spec.title || productName)}</div>
      ${spec.subtitle ? `<div class="subtitle">${escapeHtml(spec.subtitle)}</div>` : ""}
    </div>
  </div>
</body></html>`;
}

function buildProblemSlideHtml(
  spec: ListingImageSpec,
  colors: ReturnType<typeof overlayColors>
): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 2400px; height: 1800px; background: ${colors.bg};
    font-family: 'Inter', 'Segoe UI', sans-serif;
    display: flex; align-items: center; justify-content: center;
    padding: 120px;
  }
  .content { text-align: center; max-width: 1800px; }
  .hook { font-size: 72px; font-weight: 800; color: ${colors.text}; line-height: 1.3; margin-bottom: 40px; }
  .subtext { font-size: 36px; font-weight: 400; color: ${colors.text}; opacity: 0.7; line-height: 1.5; }
  .accent-bar { width: 120px; height: 6px; background: ${colors.accent}; margin: 40px auto; border-radius: 3px; }
</style></head>
<body>
  <div class="content">
    <div class="hook">${escapeHtml(spec.title)}</div>
    <div class="accent-bar"></div>
    ${spec.subtitle ? `<div class="subtext">${escapeHtml(spec.subtitle)}</div>` : ""}
  </div>
</body></html>`;
}

function buildDashboardCloseupHtml(
  spec: ListingImageSpec,
  screenshotPath: string | null,
  colors: ReturnType<typeof overlayColors>
): string {
  const highlights = spec.highlights ?? [];
  const calloutHtml = highlights
    .map(
      (h, i) =>
        `<div class="callout" style="top:${15 + i * 18}%; right: 40px;">
          <span class="dot"></span> ${escapeHtml(h)}
        </div>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 2400px; height: 1800px; background: ${colors.bg};
    font-family: 'Inter', 'Segoe UI', sans-serif; position: relative;
  }
  .screenshot {
    position: absolute; inset: 60px; border-radius: 16px; overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,0.15);
    ${screenshotPath ? `background: url('file://${screenshotPath}') top left / cover no-repeat;` : "background: #f5f5f5;"}
  }
  .callout {
    position: absolute; background: ${colors.overlay}; backdrop-filter: blur(8px);
    padding: 14px 28px; border-radius: 12px; font-size: 28px; font-weight: 600;
    color: ${colors.text}; display: flex; align-items: center; gap: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.1);
  }
  .dot { width: 14px; height: 14px; border-radius: 50%; background: ${colors.accent}; flex-shrink: 0; }
  .header {
    position: absolute; top: 0; left: 0; right: 0; padding: 20px 40px;
    background: linear-gradient(to bottom, ${colors.bg}, transparent);
    font-size: 36px; font-weight: 700; color: ${colors.text};
  }
</style></head>
<body>
  <div class="header">${escapeHtml(spec.title)}</div>
  <div class="screenshot"></div>
  ${calloutHtml}
</body></html>`;
}

function buildFeatureShowcaseHtml(
  spec: ListingImageSpec,
  screenshotPath: string | null,
  colors: ReturnType<typeof overlayColors>
): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 2400px; height: 1800px; background: ${colors.bg};
    font-family: 'Inter', 'Segoe UI', sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 40px;
    padding: 80px;
  }
  .title { font-size: 52px; font-weight: 800; color: ${colors.text}; text-align: center; }
  .screenshot-frame {
    width: 2000px; height: 1200px; border-radius: 16px; overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,0.12); border: 3px solid ${colors.accent}20;
    ${screenshotPath ? `background: url('file://${screenshotPath}') top left / cover no-repeat;` : "background: #f9f9f9;"}
  }
  .subtitle { font-size: 30px; color: ${colors.text}; opacity: 0.6; text-align: center; }
</style></head>
<body>
  <div class="title">${escapeHtml(spec.title)}</div>
  <div class="screenshot-frame"></div>
  ${spec.subtitle ? `<div class="subtitle">${escapeHtml(spec.subtitle)}</div>` : ""}
</body></html>`;
}

function buildMethodSlideHtml(
  spec: ListingImageSpec,
  colors: ReturnType<typeof overlayColors>
): string {
  const steps = [
    { num: "1", label: "Download", desc: "Instant delivery to your inbox" },
    { num: "2", label: "Customize", desc: "Add your own categories & goals" },
    { num: "3", label: "Track", desc: "Watch your progress in real-time" },
  ];

  const stepsHtml = steps
    .map(
      (s) => `
    <div class="step">
      <div class="step-num">${s.num}</div>
      <div class="step-label">${s.label}</div>
      <div class="step-desc">${s.desc}</div>
    </div>`
    )
    .join(`<div class="arrow">→</div>`);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 2400px; height: 1800px; background: ${colors.bg};
    font-family: 'Inter', 'Segoe UI', sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 80px;
    padding: 100px;
  }
  .title { font-size: 60px; font-weight: 800; color: ${colors.text}; }
  .steps { display: flex; align-items: center; gap: 40px; }
  .step {
    width: 500px; padding: 60px 40px; background: ${colors.text}10;
    border-radius: 24px; text-align: center;
    border: 2px solid ${colors.accent}30;
  }
  .step-num {
    width: 80px; height: 80px; border-radius: 50%; background: ${colors.accent};
    color: #fff; font-size: 40px; font-weight: 800;
    display: flex; align-items: center; justify-content: center; margin: 0 auto 24px;
  }
  .step-label { font-size: 36px; font-weight: 700; color: ${colors.text}; margin-bottom: 12px; }
  .step-desc { font-size: 24px; color: ${colors.text}; opacity: 0.6; }
  .arrow { font-size: 60px; color: ${colors.accent}; font-weight: 300; }
</style></head>
<body>
  <div class="title">${escapeHtml(spec.title)}</div>
  <div class="steps">${stepsHtml}</div>
</body></html>`;
}

function buildIncludedGridHtml(
  spec: ListingImageSpec,
  tabNames: string[],
  colors: ReturnType<typeof overlayColors>
): string {
  const gridItems = tabNames
    .map(
      (name) => `
    <div class="grid-item">
      <div class="icon">📊</div>
      <div class="label">${escapeHtml(name)}</div>
    </div>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 2400px; height: 1800px; background: ${colors.bg};
    font-family: 'Inter', 'Segoe UI', sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 60px;
    padding: 100px;
  }
  .title { font-size: 56px; font-weight: 800; color: ${colors.text}; }
  .grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 30px; width: 100%; max-width: 2000px;
  }
  .grid-item {
    background: ${colors.text}08; border: 2px solid ${colors.accent}25;
    border-radius: 20px; padding: 40px 30px; text-align: center;
    display: flex; flex-direction: column; align-items: center; gap: 16px;
  }
  .icon { font-size: 48px; }
  .label { font-size: 28px; font-weight: 600; color: ${colors.text}; }
  .count { font-size: 30px; color: ${colors.accent}; font-weight: 700; margin-top: 20px; }
</style></head>
<body>
  <div class="title">${escapeHtml(spec.title)}</div>
  <div class="grid">${gridItems}</div>
  <div class="count">${tabNames.length} Professional Tabs Included</div>
</body></html>`;
}

function buildDeliverySlideHtml(
  spec: ListingImageSpec,
  colors: ReturnType<typeof overlayColors>
): string {
  const steps = [
    { icon: "⬇️", label: "Download", desc: "Instant digital delivery" },
    { icon: "📂", label: "Open", desc: "Works in Google Sheets & Excel" },
    { icon: "🚀", label: "Start", desc: "Begin tracking immediately" },
  ];

  const stepsHtml = steps
    .map(
      (s) => `
    <div class="step">
      <div class="icon">${s.icon}</div>
      <div class="label">${s.label}</div>
      <div class="desc">${s.desc}</div>
    </div>`
    )
    .join(`<div class="connector"></div>`);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 2400px; height: 1800px; background: ${colors.bg};
    font-family: 'Inter', 'Segoe UI', sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 80px;
    padding: 100px;
  }
  .title { font-size: 56px; font-weight: 800; color: ${colors.text}; }
  .flow { display: flex; align-items: center; gap: 30px; }
  .step {
    width: 480px; padding: 60px 40px; background: ${colors.text}08;
    border-radius: 24px; text-align: center; border: 2px solid ${colors.accent}25;
  }
  .icon { font-size: 64px; margin-bottom: 20px; }
  .label { font-size: 36px; font-weight: 700; color: ${colors.text}; margin-bottom: 12px; }
  .desc { font-size: 24px; color: ${colors.text}; opacity: 0.6; }
  .connector { width: 60px; height: 4px; background: ${colors.accent}; border-radius: 2px; }
  .note { font-size: 28px; color: ${colors.accent}; font-weight: 600; }
</style></head>
<body>
  <div class="title">${escapeHtml(spec.title)}</div>
  <div class="flow">${stepsHtml}</div>
  <div class="note">Instant Download • No Shipping • Start Today</div>
</body></html>`;
}

// ── Utility ─────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function findScreenshot(
  screenshots: ScreenshotResult[],
  tabName?: string,
  region?: CropIntent
): ScreenshotResult | null {
  if (!tabName) return null;

  // Try exact match on tab + region
  if (region) {
    const exact = screenshots.find(
      (s) => s.tabName === tabName && s.region === region
    );
    if (exact) return exact;
  }

  // Fall back to any screenshot from this tab
  return screenshots.find((s) => s.tabName === tabName) ?? null;
}

// ── Compose listing images ──────────────────────────────────

/**
 * Compose the 7 Etsy listing images by:
 * 1. Building HTML templates for each slot
 * 2. Embedding captured screenshots where applicable
 * 3. Adding overlay text via CSS
 *
 * The returned MockupResults contain the HTML file paths.
 * A subsequent step should use browser preview (preview_start +
 * preview_screenshot) to render each HTML into a final PNG.
 *
 * The 7-image Etsy pattern:
 *   1. Thumbnail — dashboard in laptop frame + product name
 *   2. Problem Hook — text-only pain point slide
 *   3. Dashboard Close-up — full dashboard, KPI callouts
 *   4. Feature Showcase — charts and data visualization
 *   5. Method/System — 3-step "how it works" flow
 *   6. What's Included — grid showing all tabs
 *   7. Delivery — download → open → start visual
 */
export async function composeListingImages(
  screenshots: ScreenshotResult[],
  imagePlan: ListingImagePlan,
  outputDir: string
): Promise<MockupResult[]> {
  const { writeFile, mkdir } = await import("fs/promises");
  const { join } = await import("path");

  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  const results: MockupResult[] = [];

  // Extract tab names for the "included" slide
  const tabNames = imagePlan.images
    .filter((img) => img.sourceTab)
    .map((img) => img.sourceTab!)
    .filter((name, i, arr) => arr.indexOf(name) === i);

  for (const spec of imagePlan.images) {
    const colors = overlayColors(
      spec.overlayStyle,
      imagePlan.colorScheme
    );

    const screenshot = findScreenshot(
      screenshots,
      spec.sourceTab,
      spec.cropIntent
    );
    const screenshotPath = screenshot?.screenshotPath ?? null;

    let html: string;

    switch (spec.kind as ListingImageKind) {
      case "thumbnail":
        html = buildThumbnailHtml(spec, screenshotPath, colors, imagePlan.productName);
        break;

      case "problem":
        html = buildProblemSlideHtml(spec, colors);
        break;

      case "dashboard":
        html = buildDashboardCloseupHtml(spec, screenshotPath, colors);
        break;

      case "feature":
        html = buildFeatureShowcaseHtml(spec, screenshotPath, colors);
        break;

      case "method":
        html = buildMethodSlideHtml(spec, colors);
        break;

      case "included":
        html = buildIncludedGridHtml(spec, tabNames, colors);
        break;

      case "delivery":
        html = buildDeliverySlideHtml(spec, colors);
        break;

      default:
        // Fallback: use feature showcase layout
        html = buildFeatureShowcaseHtml(spec, screenshotPath, colors);
        break;
    }

    const htmlPath = join(outputDir, `listing_slot${spec.slot}_${spec.kind}.html`);
    await writeFile(htmlPath, html, "utf-8");

    results.push({
      slot: spec.slot,
      imagePath: htmlPath,
      title: spec.title,
      type: spec.kind as MockupResult["type"],
    });
  }

  return results;
}

// ── Render commands (for use with Claude Preview MCP) ───────

/**
 * Build the sequence of preview MCP commands to render each
 * composed HTML file into a final PNG image.
 */
export function buildRenderCommands(
  mockups: MockupResult[],
  outputDir: string
): ScreenshotCommand[] {
  const commands: ScreenshotCommand[] = [];

  for (const mockup of mockups) {
    // Open the HTML file in the browser preview
    commands.push({
      type: "navigate",
      params: {
        url: `file://${mockup.imagePath}`,
        description: `Render listing image slot ${mockup.slot}: ${mockup.type}`,
      },
    });

    // Resize to Etsy recommended dimensions (2400x1800 for main, 2400x1800 for all)
    commands.push({
      type: "resize",
      params: { width: 2400, height: 1800 },
    });

    // Wait for render
    commands.push({
      type: "wait",
      params: { ms: 1000, description: "Wait for HTML template to render" },
    });

    // Capture the final image
    const finalPath = `${outputDir}/final_slot${mockup.slot}_${mockup.type}.png`;
    commands.push({
      type: "screenshot",
      params: {
        outputPath: finalPath,
        fullPage: false,
        description: `Final listing image slot ${mockup.slot}`,
      },
    });
  }

  return commands;
}
