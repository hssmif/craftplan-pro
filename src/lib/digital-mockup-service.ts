"use client";

// ══════════════════════════════════════════════════════════════
// Digital Product Studio: Client-side Mockup Generation Service
// Orchestrates mockup generation for all 4 digital product types:
//   - PDF / Printable: device frames via pdf-mockup-utils + AI hero
//   - Excel: branded preview card + AI hero
//   - Notion: screenshot + AI hero
// ══════════════════════════════════════════════════════════════

import type {
  DigitalProduct,
  MockupAsset,
  DigitalProductConfig,
} from "@/types/digital-product";
import {
  renderPdfPages,
  compositeMockup,
  type DeviceType,
} from "@/lib/pdf-mockup-utils";

// ── Types ────────────────────────────────────────────────────

export interface MockupProgress {
  mockupId: string;
  status: "generating" | "done" | "error";
  label: string;
}

// ── Device Frame Scenes for PDF / Printable ──────────────────

const PDF_DEVICE_SCENES: Array<{
  id: string;
  label: string;
  pageIndex: number;
  device: DeviceType;
}> = [
  { id: "cover-ipad", label: "Cover — iPad", pageIndex: 0, device: "ipad-landscape" },
  { id: "content-macbook", label: "Content — MacBook", pageIndex: 1, device: "macbook" },
  { id: "detail-portrait", label: "Detail — iPad Portrait", pageIndex: 2, device: "ipad-portrait" },
];

// ── AI Mockup Prompt Builders ────────────────────────────────

function buildAIPrompt(
  productType: string,
  config: DigitalProductConfig | null,
  projectName: string,
): string {
  const name = projectName || "digital product";

  switch (productType) {
    case "pdf":
    case "printable": {
      const colorScheme = config?.type === "pdf"
        ? config.colorTheme || "neutral"
        : config?.type === "printable"
          ? config.colorScheme || "neutral"
          : "neutral";
      const plannerType = config?.type === "pdf"
        ? config.plannerType || "planner"
        : config?.type === "printable"
          ? config.printableType || "printable"
          : "planner";
      return `A photorealistic product photography image of two iPad Pro tablets side by side on a warm beige linen fabric background with soft natural shadows. The left iPad displays a beautiful ${colorScheme} themed ${plannerType} PDF planner cover page with elegant title typography and decorative elements. The right iPad shows the planner interior page with organized sections, checkboxes, structured grids, and clean layouts. Warm cream and tan tones, soft diffused lighting from above, professional Etsy digital product listing photography, clean composition. Ultra sharp focus, 4K quality, photorealistic rendering.`;
    }

    case "excel": {
      const trackerType = config?.type === "excel"
        ? config.trackerType || "tracker"
        : "tracker";
      const colorScheme = config?.type === "excel"
        ? config.colorScheme || "sage-green"
        : "sage-green";
      return `A photorealistic product photograph of a modern MacBook Pro laptop on a clean minimalist wooden desk, screen displaying a beautiful ${colorScheme} themed Excel spreadsheet ${trackerType} tracker with organized columns, conditional formatting, charts, and structured data. A ceramic coffee cup, small succulent plant, and premium stationery nearby. Warm natural side lighting, professional Etsy digital product mockup style. Ultra sharp, 4K quality, photorealistic.`;
    }

    case "notion": {
      const aesthetic = config?.type === "notion"
        ? config.aesthetic || "minimal"
        : "minimal";
      const templateType = config?.type === "notion"
        ? config.templateType || "template"
        : "template";
      return `A photorealistic product photography image of an iPad Pro on a warm beige desk, displaying a beautiful ${aesthetic} aesthetic Notion ${templateType} template with organized databases, toggle sections, clean typography, and dashboard layout. Surrounding props: a ceramic coffee mug, dried flowers in a vase, a gold pen, and a small notebook. Professional Etsy digital product mockup, warm soft lighting, dreamy aesthetic. Ultra sharp, 4K quality, photorealistic.`;
    }

    default:
      return `A photorealistic product photograph of a tablet displaying a beautiful digital product called "${name}" on a clean minimal desk with warm lighting. Professional Etsy listing style, 4K quality.`;
  }
}

// ── Excel Preview Card (Canvas-based) ────────────────────────

function generateExcelPreviewCard(
  config: DigitalProductConfig | null,
  projectName: string,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 900;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, 1200, 900);

  // Accent gradient bar at top
  const gradient = ctx.createLinearGradient(0, 0, 1200, 0);
  gradient.addColorStop(0, "#10b981");
  gradient.addColorStop(1, "#059669");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1200, 6);

  // Card background
  ctx.fillStyle = "#1e293b";
  ctx.beginPath();
  ctx.roundRect(60, 60, 1080, 780, 24);
  ctx.fill();

  // Excel icon area
  ctx.fillStyle = "#064e3b";
  ctx.beginPath();
  ctx.roundRect(100, 100, 80, 80, 16);
  ctx.fill();

  // Grid icon
  ctx.strokeStyle = "#34d399";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(120, 120); ctx.lineTo(120, 160);
  ctx.moveTo(140, 120); ctx.lineTo(140, 160);
  ctx.moveTo(160, 120); ctx.lineTo(160, 160);
  ctx.moveTo(110, 130); ctx.lineTo(170, 130);
  ctx.moveTo(110, 145); ctx.lineTo(170, 145);
  ctx.stroke();

  // Title
  ctx.fillStyle = "#f1f5f9";
  ctx.font = "bold 32px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(projectName || "Excel Tracker", 200, 135);

  // Subtitle
  const trackerType = config?.type === "excel" ? config.trackerType || "Tracker" : "Tracker";
  const colorScheme = config?.type === "excel" ? config.colorScheme || "" : "";
  ctx.fillStyle = "#94a3b8";
  ctx.font = "18px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(
    `${trackerType.charAt(0).toUpperCase() + trackerType.slice(1)} · ${colorScheme || "Default Theme"}`,
    200,
    165,
  );

  // Mock spreadsheet grid
  const gridX = 100;
  const gridY = 240;
  const colW = 180;
  const rowH = 50;
  const cols = 5;
  const rows = 8;

  // Header row
  ctx.fillStyle = "#064e3b";
  ctx.fillRect(gridX, gridY, colW * cols, rowH);

  ctx.fillStyle = "#34d399";
  ctx.font = "bold 14px -apple-system, BlinkMacSystemFont, sans-serif";
  const headers = ["Category", "Amount", "Budget", "Status", "Notes"];
  for (let c = 0; c < cols; c++) {
    ctx.fillText(headers[c], gridX + c * colW + 16, gridY + 32);
  }

  // Data rows
  for (let r = 1; r < rows; r++) {
    ctx.fillStyle = r % 2 === 0 ? "#1e293b" : "#172033";
    ctx.fillRect(gridX, gridY + r * rowH, colW * cols, rowH);

    // Fake row data
    ctx.fillStyle = "#64748b";
    ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif";
    for (let c = 0; c < cols; c++) {
      const fakeData = [
        ["Housing", "$1,200", "$1,500", "On Track", "Rent + utils"],
        ["Food", "$450", "$500", "Warning", "Groceries"],
        ["Transport", "$200", "$300", "Good", "Gas + transit"],
        ["Entertainment", "$150", "$200", "Over", "Subscriptions"],
        ["Savings", "$500", "$600", "On Track", "Emergency"],
        ["Health", "$100", "$150", "Good", "Insurance"],
        ["Shopping", "$250", "$200", "Over", "Clothing"],
      ];
      const row = fakeData[(r - 1) % fakeData.length];
      ctx.fillText(row[c], gridX + c * colW + 16, gridY + r * rowH + 32);
    }
  }

  // Grid lines
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(gridX, gridY + r * rowH);
    ctx.lineTo(gridX + colW * cols, gridY + r * rowH);
    ctx.stroke();
  }
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath();
    ctx.moveTo(gridX + c * colW, gridY);
    ctx.lineTo(gridX + c * colW, gridY + rows * rowH);
    ctx.stroke();
  }

  return canvas.toDataURL("image/jpeg", 0.92);
}

// ── Upload Mockup Data URL to Asset Storage ──────────────────

async function uploadMockupImage(
  projectId: string,
  imageDataUrl: string,
  fileName: string,
): Promise<{ assetId: string; downloadUrl: string }> {
  // Convert data URL to blob
  const resp = await fetch(imageDataUrl);
  const blob = await resp.blob();

  const formData = new FormData();
  formData.append("file", blob, fileName);
  formData.append("projectId", projectId);
  formData.append("fileName", fileName);
  formData.append("assetType", "mockup");

  const uploadResp = await fetch("/api/digital/assets", {
    method: "POST",
    body: formData,
  });

  if (!uploadResp.ok) {
    throw new Error("Failed to upload mockup image");
  }

  const data = await uploadResp.json();
  return {
    assetId: data.asset.id,
    downloadUrl: data.asset.downloadUrl,
  };
}

// ── Main Mockup Generation Function ──────────────────────────

export async function generateDigitalMockups(
  product: DigitalProduct,
  onProgress?: (progress: MockupProgress) => void,
): Promise<MockupAsset[]> {
  const mockups: MockupAsset[] = [];
  const { productType, generation, config, projectName, id: projectId } = product;
  const genResult = generation.result;

  if (!genResult) {
    throw new Error("No generation result — generate the product first");
  }

  // ── PDF / Printable: Device Frame Mockups ──────────────────

  if (
    (productType === "pdf" || productType === "printable") &&
    genResult.type === "file" &&
    genResult.mimeType === "application/pdf"
  ) {
    try {
      // Fetch the PDF
      onProgress?.({ mockupId: "pdf-fetch", status: "generating", label: "Fetching PDF..." });
      const pdfResp = await fetch(genResult.downloadUrl);
      const pdfBlob = await pdfResp.blob();

      // Render pages
      const pageNumbers = PDF_DEVICE_SCENES.map((s) => s.pageIndex + 1); // 1-indexed
      onProgress?.({ mockupId: "pdf-render", status: "generating", label: "Rendering pages..." });
      const pageImages = await renderPdfPages(pdfBlob, pageNumbers, 2);

      // Composite into device frames
      for (let i = 0; i < PDF_DEVICE_SCENES.length; i++) {
        const scene = PDF_DEVICE_SCENES[i];
        const pageImage = pageImages[i];
        if (!pageImage) continue;

        onProgress?.({ mockupId: scene.id, status: "generating", label: `Creating ${scene.label}...` });

        try {
          const composited = await compositeMockup(pageImage, scene.device);
          const uploaded = await uploadMockupImage(
            projectId,
            composited,
            `mockup-${scene.id}.jpg`,
          );

          mockups.push({
            id: uploaded.assetId,
            sceneType: scene.id,
            imageUrl: uploaded.downloadUrl,
            status: "done",
            width: 1200,
            height: 900,
          });

          onProgress?.({ mockupId: scene.id, status: "done", label: scene.label });
        } catch (err) {
          console.error(`Device mockup ${scene.id} failed:`, err);
          onProgress?.({ mockupId: scene.id, status: "error", label: scene.label });
        }
      }
    } catch (err) {
      console.error("PDF mockup generation failed:", err);
    }
  }

  // ── Excel: Preview Card Mockup ─────────────────────────────

  if (productType === "excel") {
    try {
      onProgress?.({ mockupId: "excel-card", status: "generating", label: "Creating preview card..." });
      const cardImage = generateExcelPreviewCard(config, projectName);
      const uploaded = await uploadMockupImage(projectId, cardImage, "mockup-excel-card.jpg");

      mockups.push({
        id: uploaded.assetId,
        sceneType: "excel-preview-card",
        imageUrl: uploaded.downloadUrl,
        status: "done",
        width: 1200,
        height: 900,
      });

      onProgress?.({ mockupId: "excel-card", status: "done", label: "Preview card" });
    } catch (err) {
      console.error("Excel preview card failed:", err);
    }
  }

  // ── Notion: Screenshot Mockup ──────────────────────────────

  if (productType === "notion" && genResult.type === "notion" && genResult.pageUrl) {
    try {
      onProgress?.({ mockupId: "notion-screenshot", status: "generating", label: "Capturing screenshot..." });

      const screenshotResp = await fetch("/api/digital/mockups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          productType: "notion",
          scenes: ["screenshot"],
          pageUrl: genResult.pageUrl,
          config,
        }),
      });

      if (screenshotResp.ok) {
        const data = await screenshotResp.json();
        if (data.mockups?.length > 0) {
          for (const m of data.mockups) {
            mockups.push(m);
          }
          onProgress?.({ mockupId: "notion-screenshot", status: "done", label: "Screenshot captured" });
        }
      }
    } catch (err) {
      console.error("Notion screenshot failed:", err);
      onProgress?.({ mockupId: "notion-screenshot", status: "error", label: "Screenshot failed" });
    }
  }

  // ── AI Lifestyle Hero Mockup (all types) ───────────────────

  try {
    onProgress?.({ mockupId: "ai-hero", status: "generating", label: "Creating AI lifestyle mockup..." });

    const aiResp = await fetch("/api/digital/mockups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        productType,
        scenes: ["hero"],
        config,
        projectName,
      }),
    });

    if (aiResp.ok) {
      const data = await aiResp.json();
      if (data.mockups?.length > 0) {
        for (const m of data.mockups) {
          mockups.push(m);
        }
        onProgress?.({ mockupId: "ai-hero", status: "done", label: "AI lifestyle hero" });
      }
    } else {
      onProgress?.({ mockupId: "ai-hero", status: "error", label: "AI hero failed" });
    }
  } catch (err) {
    console.error("AI hero mockup failed:", err);
    onProgress?.({ mockupId: "ai-hero", status: "error", label: "AI hero failed" });
  }

  return mockups;
}
