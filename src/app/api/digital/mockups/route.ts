// ══════════════════════════════════════════════════════════════
// Digital Product Studio: Server-side Mockup Generation Route
// Handles mockup types that require external services:
//   - AI lifestyle hero via Pollinations Flux (free tier)
//   - Notion page screenshot via microlink.io
// Stores results as assets and returns MockupAsset metadata.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { storeAsset } from "@/lib/digital-asset-storage";
import type { MockupAsset, DigitalProductConfig } from "@/types/digital-product";

// ── POST: Generate server-side mockups ───────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      projectId,
      productType,
      scenes,
      config,
      pageUrl,
      projectName,
    } = body as {
      projectId: string;
      productType: string;
      scenes: string[];
      config?: DigitalProductConfig | null;
      pageUrl?: string;
      projectName?: string;
    };

    if (!projectId || !productType || !scenes?.length) {
      return NextResponse.json(
        { error: "Missing required fields: projectId, productType, scenes" },
        { status: 400 }
      );
    }

    const mockups: MockupAsset[] = [];

    for (const scene of scenes) {
      try {
        switch (scene) {
          case "hero":
          case "lifestyle": {
            const mockup = await generateAIHeroMockup(
              projectId,
              productType,
              config || null,
              projectName || "Digital Product",
            );
            if (mockup) mockups.push(mockup);
            break;
          }

          case "screenshot": {
            if (!pageUrl) {
              console.warn("Screenshot requested but no pageUrl provided");
              break;
            }
            const mockup = await captureNotionScreenshot(projectId, pageUrl);
            if (mockup) mockups.push(mockup);
            break;
          }

          default:
            console.warn(`Unknown mockup scene: ${scene}`);
        }
      } catch (err) {
        console.error(`Mockup scene "${scene}" failed:`, err);
        // Continue with remaining scenes
      }
    }

    return NextResponse.json({ mockups });
  } catch (err) {
    console.error("Mockup generation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Mockup generation failed" },
      { status: 500 }
    );
  }
}

// ── AI Lifestyle Hero via Pollinations Flux ──────────────────

async function generateAIHeroMockup(
  projectId: string,
  productType: string,
  config: DigitalProductConfig | null,
  projectName: string,
): Promise<MockupAsset | null> {
  const prompt = buildPollinationsPrompt(productType, config, projectName);
  const width = 1200;
  const height = 900;

  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${Date.now()}`;

  // Fetch the generated image (Pollinations generates on-the-fly)
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(90000), // 90s timeout — AI image gen can be slow
  });

  if (!resp.ok) {
    console.error(`Pollinations returned ${resp.status}`);
    return null;
  }

  const imageBuffer = Buffer.from(await resp.arrayBuffer());

  if (imageBuffer.length < 5000) {
    console.error("Pollinations returned suspiciously small image");
    return null;
  }

  // Store the image as a mockup asset
  const asset = storeAsset(
    projectId,
    imageBuffer,
    `mockup-ai-hero-${Date.now()}.jpg`,
    "mockup"
  );

  return {
    id: asset.id,
    sceneType: "ai-hero",
    imageUrl: asset.downloadUrl,
    status: "done",
    width,
    height,
  };
}

// ── Notion Page Screenshot via microlink.io ──────────────────

async function captureNotionScreenshot(
  projectId: string,
  pageUrl: string,
): Promise<MockupAsset | null> {
  // Use microlink.io (same approach as /api/screenshot)
  const microlinkUrl = `https://api.microlink.io?url=${encodeURIComponent(pageUrl)}&screenshot=true&meta=false&viewport.width=1440&viewport.height=900&waitFor=2500`;

  const resp = await fetch(microlinkUrl, {
    headers: {
      "User-Agent": "CraftPlanDigital/1.0",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30000),
  });

  const data = await resp.json();

  if (
    !resp.ok ||
    (data as { status?: string }).status !== "success"
  ) {
    console.error("Microlink screenshot failed:", (data as { message?: string }).message);
    return null;
  }

  const screenshotUrl = (data as { data?: { screenshot?: { url?: string } } })
    ?.data?.screenshot?.url;

  if (!screenshotUrl) {
    console.error("No screenshot URL in microlink response");
    return null;
  }

  // Fetch the screenshot image
  const imgResp = await fetch(screenshotUrl);
  if (!imgResp.ok) {
    console.error("Failed to fetch screenshot image from microlink");
    return null;
  }

  const imgBuffer = Buffer.from(await imgResp.arrayBuffer());

  // Store as mockup asset
  const asset = storeAsset(
    projectId,
    imgBuffer,
    `mockup-screenshot-${Date.now()}.png`,
    "mockup"
  );

  return {
    id: asset.id,
    sceneType: "notion-screenshot",
    imageUrl: asset.downloadUrl,
    status: "done",
    width: 1440,
    height: 900,
  };
}

// ── Pollinations Prompt Builder ──────────────────────────────

function buildPollinationsPrompt(
  productType: string,
  config: DigitalProductConfig | null,
  projectName: string,
): string {
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
      const trackerType = config?.type === "excel" ? config.trackerType || "tracker" : "tracker";
      const colorScheme = config?.type === "excel" ? config.colorScheme || "sage-green" : "sage-green";
      return `A photorealistic product photograph of a modern MacBook Pro laptop on a clean minimalist wooden desk, screen displaying a beautiful ${colorScheme} themed Excel spreadsheet ${trackerType} tracker with organized columns, conditional formatting, charts, and structured data. A ceramic coffee cup, small succulent plant, and premium stationery nearby. Warm natural side lighting, professional Etsy digital product mockup style. Ultra sharp, 4K quality, photorealistic.`;
    }

    case "notion": {
      const aesthetic = config?.type === "notion" ? config.aesthetic || "minimal" : "minimal";
      const templateType = config?.type === "notion" ? config.templateType || "template" : "template";
      return `A photorealistic product photography image of an iPad Pro on a warm beige desk, displaying a beautiful ${aesthetic} aesthetic Notion ${templateType} template with organized databases, toggle sections, clean typography, and dashboard layout. Surrounding props: a ceramic coffee mug, dried flowers in a vase, a gold pen, and a small notebook. Professional Etsy digital product mockup, warm soft lighting, dreamy aesthetic. Ultra sharp, 4K quality, photorealistic.`;
    }

    default:
      return `A photorealistic product photograph of a tablet displaying a beautiful digital product called "${projectName}" on a clean minimal desk with warm lighting. Professional Etsy listing style, 4K quality.`;
  }
}
