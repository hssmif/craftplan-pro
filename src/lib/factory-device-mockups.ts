// ══════════════════════════════════════════════════════════════
// Factory Device Mockups — Sharp-based Compositing
//
// Creates REAL device mockups by compositing actual Google Sheet
// screenshots into device frames using Sharp.
//
// This produces perfect results every time because:
//   - Device frames are real device outlines (not AI-generated)
//   - Screen content is the actual Google Sheet screenshot
//   - Backgrounds are clean, professional gradients
//
// Much more reliable than AI-generated mockups from Pollinations
// where devices look fake and inconsistent.
// ══════════════════════════════════════════════════════════════

import sharp from "sharp";
import { storeAsset } from "@/lib/digital-asset-storage";
import fs from "fs";
import path from "path";

// ── Device frame SVGs ──────────────────────────────────────

function macbookFrame(screenWidth: number, screenHeight: number): string {
  const bezelTop = 28;
  const bezelSide = 18;
  const bezelBottom = 18;
  const baseHeight = 22;
  const baseExtraWidth = 80;
  const totalW = screenWidth + bezelSide * 2;
  const totalH = screenHeight + bezelTop + bezelBottom + baseHeight;
  const fullW = totalW + baseExtraWidth;

  return `<svg width="${fullW}" height="${totalH}" xmlns="http://www.w3.org/2000/svg">
    <!-- Laptop body -->
    <rect x="${baseExtraWidth / 2}" y="0" width="${totalW}" height="${screenHeight + bezelTop + bezelBottom}" rx="12" ry="12" fill="#2d2d2d"/>
    <!-- Screen bezel inner -->
    <rect x="${baseExtraWidth / 2 + bezelSide}" y="${bezelTop}" width="${screenWidth}" height="${screenHeight}" rx="4" ry="4" fill="#111"/>
    <!-- Camera dot -->
    <circle cx="${fullW / 2}" cy="${bezelTop / 2}" r="3" fill="#444"/>
    <!-- Base / hinge -->
    <path d="M ${baseExtraWidth / 2 - 10} ${screenHeight + bezelTop + bezelBottom}
             L ${fullW - baseExtraWidth / 2 + 10} ${screenHeight + bezelTop + bezelBottom}
             L ${fullW - 2} ${totalH}
             Q ${fullW} ${totalH + 2} ${fullW - 4} ${totalH + 2}
             L 4 ${totalH + 2}
             Q 0 ${totalH + 2} 2 ${totalH}
             Z" fill="#3a3a3a"/>
    <!-- Trackpad notch -->
    <rect x="${fullW / 2 - 30}" y="${screenHeight + bezelTop + bezelBottom}" width="60" height="4" rx="2" fill="#555"/>
  </svg>`;
}

function ipadFrame(screenWidth: number, screenHeight: number): string {
  const bezel = 24;
  const totalW = screenWidth + bezel * 2;
  const totalH = screenHeight + bezel * 2;

  return `<svg width="${totalW}" height="${totalH}" xmlns="http://www.w3.org/2000/svg">
    <!-- iPad body -->
    <rect x="0" y="0" width="${totalW}" height="${totalH}" rx="18" ry="18" fill="#2d2d2d"/>
    <!-- Screen area -->
    <rect x="${bezel}" y="${bezel}" width="${screenWidth}" height="${screenHeight}" rx="6" ry="6" fill="#111"/>
    <!-- Camera dot (landscape, right side) -->
    <circle cx="${totalW - bezel / 2}" cy="${totalH / 2}" r="3.5" fill="#444"/>
  </svg>`;
}

function iphoneFrame(screenWidth: number, screenHeight: number): string {
  const bezelSide = 12;
  const bezelTop = 12;
  const notchWidth = 90;
  const notchHeight = 24;
  const totalW = screenWidth + bezelSide * 2;
  const totalH = screenHeight + bezelTop * 2;

  return `<svg width="${totalW}" height="${totalH}" xmlns="http://www.w3.org/2000/svg">
    <!-- Phone body -->
    <rect x="0" y="0" width="${totalW}" height="${totalH}" rx="28" ry="28" fill="#2d2d2d"/>
    <!-- Screen area -->
    <rect x="${bezelSide}" y="${bezelTop}" width="${screenWidth}" height="${screenHeight}" rx="14" ry="14" fill="#111"/>
    <!-- Dynamic Island -->
    <rect x="${totalW / 2 - notchWidth / 2}" y="${bezelTop + 8}" width="${notchWidth}" height="${notchHeight}" rx="12" fill="#1a1a1a"/>
    <!-- Home indicator bar -->
    <rect x="${totalW / 2 - 40}" y="${totalH - bezelTop - 6}" width="80" height="4" rx="2" fill="#555"/>
  </svg>`;
}

// ── Background generators ───────────────────────────────────

function gradientBg(w: number, h: number, style: "warm" | "cool" | "dark" | "cream" | "marble"): string {
  const gradients: Record<string, { stops: string[] }> = {
    warm:   { stops: ['#fef3e2', '#fde6c4', '#fcd5a5'] },
    cool:   { stops: ['#eef2ff', '#dbe4ff', '#c5d0f6'] },
    dark:   { stops: ['#1a1a2e', '#16213e', '#0f3460'] },
    cream:  { stops: ['#faf8f5', '#f5f0ea', '#ece4d8'] },
    marble: { stops: ['#f5f5f5', '#eaeaea', '#e0ddd8'] },
  };

  const g = gradients[style];
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${g.stops[0]}"/>
        <stop offset="50%" stop-color="${g.stops[1]}"/>
        <stop offset="100%" stop-color="${g.stops[2]}"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
  </svg>`;
}

// ── Scene definitions ───────────────────────────────────────

interface MockupScene {
  id: string;
  label: string;
  badge: string;
  build: (screenshotPath: string) => Promise<Buffer | null>;
}

// Helper: create device with screenshot inside
async function compositeDeviceWithScreen(
  deviceSvg: string,
  screenshotPath: string,
  screenX: number,
  screenY: number,
  screenW: number,
  screenH: number,
  canvasW: number,
  canvasH: number,
  bgStyle: "warm" | "cool" | "dark" | "cream" | "marble",
  deviceX: number,
  deviceY: number,
): Promise<Buffer> {
  // Read and resize screenshot to fit screen
  const screenshot = await sharp(screenshotPath)
    .resize(screenW, screenH, { fit: "cover" })
    .toBuffer();

  // Create device frame
  const deviceBuffer = Buffer.from(deviceSvg);
  const deviceMeta = await sharp(deviceBuffer).metadata();
  const deviceW = deviceMeta.width!;
  const deviceH = deviceMeta.height!;

  // Composite screenshot into device frame
  const deviceWithScreen = await sharp(deviceBuffer)
    .composite([{
      input: screenshot,
      left: screenX,
      top: screenY,
    }])
    .png()
    .toBuffer();

  // Create background and place device on it
  const bgSvg = gradientBg(canvasW, canvasH, bgStyle);
  return sharp(Buffer.from(bgSvg))
    .composite([{
      input: deviceWithScreen,
      left: deviceX,
      top: deviceY,
    }])
    .png()
    .toBuffer();
}

function buildScenes(screenshotPaths: string[]): MockupScene[] {
  // Use first screenshot as the default, but vary across scenes
  const getScreenshot = (index: number) =>
    screenshotPaths[Math.min(index, screenshotPaths.length - 1)];

  return [
    {
      id: "hero-macbook",
      label: "Hero — MacBook Pro",
      badge: "Thumbnail",
      build: async (mainScreenshot: string) => {
        const screenW = 1500;
        const screenH = 940;
        const svg = macbookFrame(screenW, screenH);
        return compositeDeviceWithScreen(
          svg, mainScreenshot,
          58, 28, screenW, screenH,   // screen position in frame
          2000, 2000,                  // canvas size (square for Etsy)
          "cream",                     // background
          140, 340,                    // device position on canvas
        );
      },
    },
    {
      id: "dual-ipad",
      label: "Dual iPad Display",
      badge: "Feature",
      build: async () => {
        const screenW = 780;
        const screenH = 560;
        const svg = ipadFrame(screenW, screenH);

        // Two iPads side by side on 2000x2000 canvas
        const ipad1 = await compositeDeviceWithScreen(
          svg, getScreenshot(0),
          24, 24, screenW, screenH,
          2000, 2000, "warm",
          60, 480,
        );

        const ipad2Buf = Buffer.from(ipadFrame(screenW, screenH));
        const screen2 = await sharp(getScreenshot(1))
          .resize(screenW, screenH, { fit: "cover" })
          .toBuffer();
        const device2 = await sharp(ipad2Buf)
          .composite([{ input: screen2, left: 24, top: 24 }])
          .png()
          .toBuffer();

        return sharp(ipad1)
          .composite([{ input: device2, left: 1100, top: 480 }])
          .png()
          .toBuffer();
      },
    },
    {
      id: "macbook-ipad-phone",
      label: "Multi-Device Trio",
      badge: "Popular",
      build: async () => {
        const canvasW = 2000;
        const canvasH = 2000;

        // MacBook (center, prominent — fills ~75% width)
        const macScreenW = 1200;
        const macScreenH = 750;
        const macSvg = macbookFrame(macScreenW, macScreenH);
        const macDevice = Buffer.from(macSvg);
        const macScreen = await sharp(getScreenshot(0))
          .resize(macScreenW, macScreenH, { fit: "cover" }).toBuffer();
        const macComposite = await sharp(macDevice)
          .composite([{ input: macScreen, left: 58, top: 28 }])
          .png().toBuffer();

        // iPad (right, overlapping)
        const ipadScreenW = 560;
        const ipadScreenH = 400;
        const ipadSvg = ipadFrame(ipadScreenW, ipadScreenH);
        const ipadDevice = Buffer.from(ipadSvg);
        const ipadScreen = await sharp(getScreenshot(1))
          .resize(ipadScreenW, ipadScreenH, { fit: "cover" }).toBuffer();
        const ipadComposite = await sharp(ipadDevice)
          .composite([{ input: ipadScreen, left: 24, top: 24 }])
          .png().toBuffer();

        // iPhone (left foreground)
        const phoneScreenW = 220;
        const phoneScreenH = 460;
        const phoneSvg = iphoneFrame(phoneScreenW, phoneScreenH);
        const phoneDevice = Buffer.from(phoneSvg);
        const phoneScreen = await sharp(getScreenshot(2))
          .resize(phoneScreenW, phoneScreenH, { fit: "cover" }).toBuffer();
        const phoneComposite = await sharp(phoneDevice)
          .composite([{ input: phoneScreen, left: 12, top: 12 }])
          .png().toBuffer();

        // Assemble on 2000×2000 background
        const bg = Buffer.from(gradientBg(canvasW, canvasH, "cream"));
        return sharp(bg)
          .composite([
            { input: macComposite, left: 200, top: 320 },
            { input: ipadComposite, left: 1400, top: 900 },
            { input: phoneComposite, left: 80, top: 1000 },
          ])
          .png().toBuffer();
      },
    },
    {
      id: "ipad-lifestyle",
      label: "iPad Lifestyle",
      badge: "Lifestyle",
      build: async (mainScreenshot: string) => {
        const screenW = 1200;
        const screenH = 860;
        const svg = ipadFrame(screenW, screenH);
        return compositeDeviceWithScreen(
          svg, mainScreenshot,
          24, 24, screenW, screenH,
          2000, 2000, "warm",
          370, 480,
        );
      },
    },
    {
      id: "dark-macbook",
      label: "Dark & Premium",
      badge: "Premium",
      build: async (mainScreenshot: string) => {
        const screenW = 1500;
        const screenH = 940;
        const svg = macbookFrame(screenW, screenH);
        return compositeDeviceWithScreen(
          svg, mainScreenshot,
          58, 28, screenW, screenH,
          2000, 2000, "dark",
          140, 340,
        );
      },
    },
    {
      id: "ipad-phone-duo",
      label: "iPad & iPhone Duo",
      badge: "Detail",
      build: async () => {
        const canvasW = 2000;
        const canvasH = 2000;

        // iPad (left-center, big)
        const ipadScreenW = 1000;
        const ipadScreenH = 720;
        const ipadSvg = ipadFrame(ipadScreenW, ipadScreenH);
        const ipadDevice = Buffer.from(ipadSvg);
        const ipadScreen = await sharp(getScreenshot(0))
          .resize(ipadScreenW, ipadScreenH, { fit: "cover" }).toBuffer();
        const ipadComposite = await sharp(ipadDevice)
          .composite([{ input: ipadScreen, left: 24, top: 24 }])
          .png().toBuffer();

        // iPhone (right, bigger)
        const phoneScreenW = 300;
        const phoneScreenH = 620;
        const phoneSvg = iphoneFrame(phoneScreenW, phoneScreenH);
        const phoneDevice = Buffer.from(phoneSvg);
        const phoneScreen = await sharp(getScreenshot(1))
          .resize(phoneScreenW, phoneScreenH, { fit: "cover" }).toBuffer();
        const phoneComposite = await sharp(phoneDevice)
          .composite([{ input: phoneScreen, left: 12, top: 12 }])
          .png().toBuffer();

        const bg = Buffer.from(gradientBg(canvasW, canvasH, "marble"));
        return sharp(bg)
          .composite([
            { input: ipadComposite, left: 180, top: 460 },
            { input: phoneComposite, left: 1500, top: 520 },
          ])
          .png().toBuffer();
      },
    },
  ];
}

// ── Main export ──────────────────────────────────────────────

export interface DeviceMockupResult {
  sceneId: string;
  label: string;
  badge: string;
  buffer: Buffer;
  assetId?: string;
  downloadUrl?: string;
}

/**
 * Generate professional device mockups by compositing real Google Sheet
 * screenshots into device frames using Sharp.
 *
 * This produces much better results than AI-generated mockups because:
 * - Devices look 100% real (consistent SVG frames)
 * - Screen content is the actual Google Sheet (not AI interpretation)
 * - Consistent quality every time, no rate limits
 * - Much faster than AI generation
 *
 * @param screenshotPaths - Array of Google Sheet screenshot file paths
 * @param count - Number of mockups (default 4, max 6)
 * @param projectId - If provided, stores as digital assets
 */
export async function generateDeviceMockups(
  screenshotPaths: string[],
  count = 4,
  projectId?: string,
): Promise<DeviceMockupResult[]> {
  if (screenshotPaths.length === 0) {
    console.warn("[device-mockups] No screenshots provided");
    return [];
  }

  // Filter to existing files only
  const validPaths = screenshotPaths.filter((p) => fs.existsSync(p));
  if (validPaths.length === 0) {
    console.warn("[device-mockups] No valid screenshot files found");
    return [];
  }

  console.log(`[device-mockups] Generating ${count} device mockups from ${validPaths.length} screenshots...`);

  const scenes = buildScenes(validPaths).slice(0, Math.min(count, 6));
  const results: DeviceMockupResult[] = [];

  for (const scene of scenes) {
    try {
      console.log(`   🖥  ${scene.label}...`);
      const buf = await scene.build(validPaths[0]);
      if (!buf || buf.length < 5000) {
        console.warn(`   ⚠ ${scene.label} produced too small`);
        continue;
      }

      console.log(`   ✓ ${scene.label}: ${Math.round(buf.length / 1024)}KB`);

      const result: DeviceMockupResult = {
        sceneId: scene.id,
        label: scene.label,
        badge: scene.badge,
        buffer: buf,
      };

      if (projectId) {
        const filename = `mockup_${scene.id}.png`;
        const asset = await storeAsset(projectId, buf, filename, "mockup");
        result.assetId = asset.id;
        result.downloadUrl = asset.downloadUrl;
      }

      results.push(result);
    } catch (err) {
      console.warn(`   ⚠ ${scene.label} failed:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[device-mockups] Done: ${results.length}/${count} mockups generated`);
  return results;
}
