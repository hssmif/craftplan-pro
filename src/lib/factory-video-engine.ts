// ══════════════════════════════════════════════════════════════
// Factory Video Engine — Real Spreadsheet Walkthrough Videos
//
// Uses Playwright to record a real browser session navigating
// through the spreadsheet product. The video shows:
//   1. Dashboard overview (scroll through KPIs + data)
//   2. Tab switching to Transactions
//   3. Tab switching to other tabs (Budget, Savings, etc.)
//   4. Return to Dashboard
//   5. End card with product title
//
// All motion is smooth and human-paced. No fake animations.
// The output is an MP4 ready for Etsy listing videos.
// ══════════════════════════════════════════════════════════════

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { ProductBlueprint, BlueprintTab } from "@/types/factory";
import { resolveNicheProfile, type NicheDesignProfile } from "./factory-niche-themes";
import {
  deriveKpiFromTransactions,
  deriveBudgetFromTransactions,
  formatCurrency,
} from "./factory-display-helpers";
import { getNicheData, getNicheSavingsGoals } from "./factory-niche-data";
import { execSync, exec } from "child_process";
import { existsSync, mkdirSync, readdirSync, unlinkSync, renameSync } from "fs";
import path from "path";

// ── Types ────────────────────────────────────────────────────

export interface VideoOptions {
  /** Output width (default: 1080) */
  width?: number;
  /** Output height (default: 1080 for square Etsy video) */
  height?: number;
  /** Target duration in seconds (default: 20) */
  duration?: number;
  /** FPS (default: 30) */
  fps?: number;
  /** Output directory */
  outputDir?: string;
  /** Add text overlays */
  overlays?: boolean;
  /** Overlay captions per scene */
  captions?: string[];
}

export interface VideoResult {
  /** Path to the generated MP4 */
  videoPath: string;
  /** Duration in seconds */
  durationSec: number;
  /** File size in bytes */
  fileSizeBytes: number;
  /** Number of scenes rendered */
  sceneCount: number;
}

// ── Scene Definition ─────────────────────────────────────────

interface Scene {
  /** Scene type */
  type: "dashboard" | "scroll" | "tab-switch" | "highlight" | "end-card" | "intro" | "zoom";
  /** Tab to show (for tab-switch) */
  tabName?: string;
  /** Duration in ms */
  durationMs: number;
  /** Scroll amount in px (for scroll) */
  scrollPx?: number;
  /** Overlay text */
  caption?: string;
}

// ── Core Video Generator ─────────────────────────────────────

/**
 * Generate a product walkthrough video using Playwright recording.
 *
 * This records a REAL browser session — the video shows actual
 * rendered HTML that looks like Google Sheets, with smooth tab
 * switching and scrolling.
 */
export async function generateProductVideo(
  blueprint: ProductBlueprint,
  nicheProfile: NicheDesignProfile,
  options: VideoOptions = {},
): Promise<VideoResult> {
  const W = options.width || 1080;
  const H = options.height || 1080;
  const fps = options.fps || 30;
  const outputDir = options.outputDir || "/tmp/factory-video";
  const addOverlays = options.overlays !== false;

  // Ensure output directory
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  // Clean up old recordings
  const videoDir = path.join(outputDir, "recording");
  if (existsSync(videoDir)) {
    for (const f of readdirSync(videoDir)) unlinkSync(path.join(videoDir, f));
  } else {
    mkdirSync(videoDir, { recursive: true });
  }

  // ── Build scenes ───────────────────────────────────────
  const scenes = buildSceneList(blueprint, nicheProfile, options);

  // ── Build the multi-tab HTML page ──────────────────────
  const html = buildVideoHTML(blueprint, nicheProfile, W, H);

  // ── Record with Playwright ─────────────────────────────
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });

  const context = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: {
      dir: videoDir,
      size: { width: W, height: H },
    },
  });

  const page = await context.newPage();

  try {
    // Load the page
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.waitForTimeout(300); // Let fonts settle

    // ── Execute scene sequence ──────────────────────────
    for (const scene of scenes) {
      switch (scene.type) {
        case "dashboard":
          // Just hold on current view
          await page.waitForTimeout(scene.durationMs);
          break;

        case "scroll": {
          // Smooth scroll down
          const scrollAmount = scene.scrollPx || 200;
          const steps = 20;
          const stepDelay = Math.floor(scene.durationMs / steps);
          const stepPx = scrollAmount / steps;
          for (let i = 0; i < steps; i++) {
            await page.evaluate((px) => {
              const grid = document.querySelector(".gs-grid");
              if (grid) grid.scrollTop += px;
              else window.scrollBy(0, px);
            }, stepPx);
            await page.waitForTimeout(stepDelay);
          }
          break;
        }

        case "tab-switch": {
          // Click a tab
          if (scene.tabName) {
            const tabSelector = `.gs-tab-bar .tab`;
            const tabs = await page.locator(tabSelector).all();
            for (const tab of tabs) {
              const text = await tab.textContent();
              if (text?.trim().toLowerCase().includes(scene.tabName.toLowerCase())) {
                await tab.click();
                break;
              }
            }
          }
          await page.waitForTimeout(scene.durationMs);
          break;
        }

        case "highlight": {
          // Brief pause with optional highlight effect
          if (scene.caption) {
            await page.evaluate((text) => {
              const overlay = document.getElementById("video-overlay");
              if (overlay) {
                overlay.textContent = text;
                overlay.style.opacity = "1";
              }
            }, scene.caption);
            await page.waitForTimeout(scene.durationMs * 0.7);
            await page.evaluate(() => {
              const overlay = document.getElementById("video-overlay");
              if (overlay) overlay.style.opacity = "0";
            });
            await page.waitForTimeout(scene.durationMs * 0.3);
          } else {
            await page.waitForTimeout(scene.durationMs);
          }
          break;
        }

        case "intro": {
          // Show intro overlay
          await page.evaluate(() => {
            const intro = document.getElementById("intro-card");
            if (intro) intro.style.opacity = "1";
          });
          await page.waitForTimeout(scene.durationMs * 0.7);
          // Fade out
          await page.evaluate(() => {
            const intro = document.getElementById("intro-card");
            if (intro) intro.style.opacity = "0";
          });
          await page.waitForTimeout(scene.durationMs * 0.3);
          break;
        }

        case "zoom": {
          // Ken Burns zoom effect
          const steps = 30;
          const stepDelay = Math.floor(scene.durationMs / steps);
          for (let i = 0; i <= steps; i++) {
            const scale = 1 + (i / steps) * 0.12; // zoom from 100% to 112%
            await page.evaluate((s) => {
              const content = document.getElementById("tab-content");
              if (content) {
                content.style.transform = `scale(${s})`;
                content.style.transformOrigin = "center 25%"; // target KPI area
              }
            }, scale);
            await page.waitForTimeout(stepDelay);
          }
          // Hold
          await page.waitForTimeout(300);
          // Zoom back
          for (let i = steps; i >= 0; i--) {
            const scale = 1 + (i / steps) * 0.12;
            await page.evaluate((s) => {
              const content = document.getElementById("tab-content");
              if (content) content.style.transform = `scale(${s})`;
            }, scale);
            await page.waitForTimeout(stepDelay / 2);
          }
          break;
        }

        case "end-card": {
          // Show end card
          await page.evaluate(() => {
            const endCard = document.getElementById("end-card");
            if (endCard) endCard.style.opacity = "1";
          });
          await page.waitForTimeout(scene.durationMs);
          break;
        }
      }
    }

    // Extra frame buffer to ensure video capture
    await page.waitForTimeout(500);
  } finally {
    await page.close();
    await context.close();
  }

  // ── Find the recorded video ────────────────────────────
  const videoFiles = readdirSync(videoDir).filter(f => f.endsWith(".webm"));
  if (videoFiles.length === 0) {
    await browser.close();
    throw new Error("Playwright did not produce a video recording");
  }

  const rawVideo = path.join(videoDir, videoFiles[0]);
  const productSlug = blueprint.sourceListingTitle
    ?.replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .slice(0, 40) || "product";
  const outputPath = path.join(outputDir, `${productSlug}-video.mp4`);

  // ── Convert with ffmpeg ────────────────────────────────
  // WebM → MP4 with proper codec for Etsy
  const ffmpegCmd = buildFfmpegCommand(rawVideo, outputPath, W, H, addOverlays, scenes);
  execSync(ffmpegCmd, { stdio: "pipe", timeout: 60000 });

  // Clean up raw recording
  try { unlinkSync(rawVideo); } catch {}

  await browser.close();

  // ── Get file info ──────────────────────────────────────
  const { statSync } = require("fs");
  const stat = statSync(outputPath);

  // Get duration
  let durationSec = 20;
  try {
    const probe = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${outputPath}"`,
      { encoding: "utf-8" },
    );
    durationSec = parseFloat(probe.trim()) || 20;
  } catch {}

  return {
    videoPath: outputPath,
    durationSec: Math.round(durationSec * 10) / 10,
    fileSizeBytes: stat.size,
    sceneCount: scenes.length,
  };
}

// ── Scene Builder ────────────────────────────────────────────

function buildSceneList(
  blueprint: ProductBlueprint,
  nicheProfile: NicheDesignProfile,
  options: VideoOptions,
): Scene[] {
  const captions = options.captions || getDefaultCaptions(nicheProfile.id);

  // Get unique tab names
  const seen = new Set<string>();
  const tabs = blueprint.tabs.filter(t => {
    const low = t.name.toLowerCase();
    if (seen.has(low)) return false;
    seen.add(low);
    return true;
  });

  // Pick interesting tabs to show (skip Setup, Instructions, Dashboard)
  const interestingTabs = tabs.filter(t =>
    !t.name.toLowerCase().includes("setup") &&
    !t.name.toLowerCase().includes("instruction") &&
    !t.name.toLowerCase().includes("dashboard")
  );

  // Limit to 3 tabs max for video pacing
  const tabsToShow = interestingTabs.slice(0, 3);

  const scenes: Scene[] = [];

  // Scene 1: Intro title card (3s)
  scenes.push({
    type: "intro",
    durationMs: 3000,
  });

  // Scene 2: Dashboard reveal (2.5s)
  scenes.push({
    type: "dashboard",
    durationMs: 2500,
    caption: captions[0],
  });

  // Scene 3: Zoom into KPIs (2s) — Ken Burns effect
  scenes.push({
    type: "zoom",
    durationMs: 2000,
    scrollPx: 0,
  });

  // Scene 4: KPI highlight caption (1.8s)
  scenes.push({
    type: "highlight",
    durationMs: 1800,
    caption: captions[1],
  });

  // Scene 5: Scroll down to see expense/savings data (2s)
  scenes.push({
    type: "scroll",
    durationMs: 2000,
    scrollPx: 300,
  });

  // Scene 6: Expense breakdown caption (1.8s)
  scenes.push({
    type: "highlight",
    durationMs: 1800,
    caption: captions[2],
  });

  // Scene 7: Scroll back up (1.5s)
  scenes.push({
    type: "scroll",
    durationMs: 1500,
    scrollPx: -300,
  });

  // Scenes 8-N: Tab switches (2-3 tabs max)
  for (let i = 0; i < tabsToShow.length; i++) {
    const tab = tabsToShow[i];

    // Switch to tab
    scenes.push({
      type: "tab-switch",
      tabName: tab.name,
      durationMs: 2500,
    });

    // Brief caption if available
    if (captions[3 + i]) {
      scenes.push({
        type: "highlight",
        durationMs: 1500,
        caption: captions[3 + i],
      });
    }
  }

  // Return to Dashboard
  scenes.push({
    type: "tab-switch",
    tabName: "Dashboard",
    durationMs: 2000,
  });

  // End card — professional CTA (3.5s)
  scenes.push({
    type: "end-card",
    durationMs: 3500,
  });

  return scenes;
}

function getDefaultCaptions(nicheId: string): string[] {
  const captionMap: Record<string, string[]> = {
    "baby-budget": [
      "Track every baby expense — automatically",
      "Smart budget categories built for new parents",
      "See exactly where your money goes",
      "Set savings goals and watch them grow",
    ],
    "business-pl": [
      "Your complete business finance dashboard",
      "Track revenue, expenses & profit at a glance",
      "Monthly P&L reports — auto-calculated",
      "Tax-ready categories for easy filing",
    ],
    "wedding-planner": [
      "Plan your dream wedding — on budget",
      "Track every vendor payment in one place",
      "Guest list, seating & RSVP tracking",
      "Stay organized and stress-free",
    ],
    "paycheck-budget": [
      "Take control of every paycheck",
      "Auto-calculate your budget splits",
      "Track spending across all categories",
      "Crush your savings goals faster",
    ],
  };

  return captionMap[nicheId] || [
    "Your complete financial dashboard",
    "Track spending across every category",
    "Auto-calculating budget formulas",
    "Set goals and watch your progress",
  ];
}

// ── Multi-Tab HTML Builder ───────────────────────────────────
//
// Builds a SINGLE HTML page with all tab views embedded.
// Tab switching is done via JS onclick — no page navigation.
// This means the Playwright recording captures smooth transitions.

function buildVideoHTML(
  blueprint: ProductBlueprint,
  nicheProfile: NicheDesignProfile,
  W: number,
  H: number,
): string {
  const nicheData = getNicheData(nicheProfile.id);
  const accentColor = nicheProfile.palette.accent || "#34A853";
  const headerBg = nicheProfile.spreadsheetTokens.headerBg || "e2e8f0";
  const sectionBg = nicheProfile.spreadsheetTokens.sectionBg || "334155";
  const sectionText = nicheProfile.spreadsheetTokens.sectionText || "f8fafc";
  const font = "Arial, Helvetica, sans-serif";

  // Extract data for dashboard
  const dashData = extractVideoData(blueprint, nicheProfile, nicheData);

  // Get unique tabs
  const seen = new Set<string>();
  const uniqueTabs = blueprint.tabs.filter(t => {
    const low = t.name.toLowerCase();
    if (seen.has(low)) return false;
    seen.add(low);
    return true;
  });

  // Extract transaction data for "Transactions" tab
  const txnRows = extractVideoTransactions(blueprint);

  // Build tab content sections
  const tabContents: { name: string; html: string }[] = [];

  // Dashboard tab
  tabContents.push({
    name: "Dashboard",
    html: buildDashboardContent(dashData, nicheProfile),
  });

  // Transactions tab
  const txnTab = uniqueTabs.find(t =>
    t.name.toLowerCase().includes("transaction") || t.name.toLowerCase().includes("log")
  );
  if (txnTab) {
    tabContents.push({
      name: txnTab.name,
      html: buildTransactionContent(txnRows, nicheProfile),
    });
  }

  // Other tabs — simple placeholder grids
  for (const tab of uniqueTabs) {
    const low = tab.name.toLowerCase();
    if (low.includes("dashboard") || low.includes("transaction") || low.includes("log")) continue;
    if (low.includes("setup") || low.includes("instruction")) continue;
    if (tabContents.length >= 5) break;

    tabContents.push({
      name: tab.name,
      html: buildGenericTabContent(tab, nicheProfile),
    });
  }

  const productTitle = blueprint.sourceListingTitle || "Budget Tracker Spreadsheet";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: ${font};
    background: white;
    width: ${W}px;
    height: ${H}px;
    overflow: hidden;
    position: relative;
  }

  /* Google Sheets Chrome */
  .gs-chrome { background: white; border-bottom: 1px solid #dadce0; }
  .gs-title-bar {
    display: flex; align-items: center; gap: 8px;
    padding: 4px 10px; font-size: 14px; color: #202124;
  }
  .gs-title-bar .icon {
    width: 20px; height: 20px; background: #0f9d58; border-radius: 3px;
    display: flex; align-items: center; justify-content: center;
    color: white; font-size: 11px; font-weight: bold;
  }
  .gs-menu-bar {
    display: flex; gap: 2px; padding: 0 10px 3px;
    font-size: 11px; color: #3c4043;
  }
  .gs-menu-bar span { padding: 3px 6px; border-radius: 3px; }
  .gs-toolbar {
    display: flex; align-items: center; gap: 3px;
    padding: 3px 6px; background: #edf2fa;
    border-bottom: 1px solid #dadce0;
    font-size: 11px; color: #444746;
  }
  .gs-toolbar .sep { width: 1px; height: 16px; background: #dadce0; margin: 0 3px; }
  .gs-toolbar .btn { padding: 1px 4px; border-radius: 2px; font-size: 11px; }
  .gs-toolbar select {
    border: 1px solid #dadce0; border-radius: 3px; padding: 1px 3px;
    font-size: 11px; background: white;
  }
  .gs-formula-bar {
    display: flex; align-items: center;
    border-bottom: 1px solid #dadce0; height: 24px; font-size: 11px;
  }
  .gs-formula-bar .cell-ref {
    width: 60px; text-align: center; border-right: 1px solid #dadce0;
    padding: 0 6px; color: #3c4043; font-size: 10px;
  }
  .gs-formula-bar .fx {
    padding: 0 6px; color: #80868b; border-right: 1px solid #dadce0;
    font-style: italic; font-size: 11px;
  }
  .gs-formula-bar .content { padding: 0 6px; color: #3c4043; flex: 1; }

  /* Tab content area */
  .tab-content {
    height: calc(100% - 130px);
    overflow-y: auto;
    overflow-x: hidden;
    scroll-behavior: smooth;
    transition: transform 0.3s ease;
    transform-origin: center top;
  }
  .tab-pane { display: none; }
  .tab-pane.active { display: block; }

  /* Grid styles */
  .grid-table {
    width: 100%; border-collapse: collapse;
    font-size: 11px; line-height: 1.3;
  }
  .grid-table td, .grid-table th {
    border: 1px solid #e8eaed;
    padding: 4px 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 160px;
  }
  .grid-table th {
    background: #f8f9fa; color: #5f6368;
    font-weight: 400; font-size: 10px;
    text-align: center; position: sticky; top: 0;
  }
  .grid-table .row-num {
    background: #f8f9fa; color: #80868b;
    text-align: center; width: 32px; font-size: 10px;
  }
  .grid-table .title-row td {
    background: ${accentColor}; color: white;
    text-align: center; font-weight: 600; font-size: 12px;
    padding: 6px;
  }
  .grid-table .kpi-label {
    text-align: center; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.5px;
    padding: 3px 4px;
  }
  .grid-table .kpi-value {
    text-align: center; font-size: 18px; font-weight: 700;
    padding: 6px 4px;
  }
  .grid-table .section-header td {
    text-align: center; font-weight: 600;
    font-size: 10px; text-transform: uppercase;
    letter-spacing: 1px; padding: 4px;
  }
  .grid-table .data-header td {
    font-weight: 600; font-size: 10px;
  }
  .grid-table .totals td {
    font-weight: 700;
  }
  .grid-table .alt-row td { background: #${nicheProfile.spreadsheetTokens.rowAlt || "f8fafc"}; }

  /* Tab bar */
  .gs-tab-bar {
    position: fixed; bottom: 0; left: 0; right: 0;
    display: flex; align-items: center;
    height: 28px; background: #f8f9fa;
    border-top: 1px solid #dadce0;
    padding: 0 8px; gap: 0; z-index: 100;
  }
  .gs-tab-bar .nav-btns {
    display: flex; gap: 2px; margin-right: 8px; font-size: 10px; color: #80868b;
  }
  .gs-tab-bar .tab {
    padding: 4px 12px; border: 1px solid transparent;
    border-radius: 4px 4px 0 0; color: #80868b;
    cursor: pointer; font-size: 11px; transition: all 0.2s ease;
  }
  .gs-tab-bar .tab.active {
    background: white; color: #202124; font-weight: 500;
    border-bottom: 2px solid ${accentColor};
  }
  .gs-tab-bar .tab:hover:not(.active) { background: #e8eaed; }

  /* Video overlay */
  #video-overlay {
    position: fixed; bottom: 70px; left: 50%; transform: translateX(-50%);
    background: rgba(0,0,0,0.8); color: white;
    padding: 12px 32px; border-radius: 10px;
    font-size: 17px; font-weight: 600; letter-spacing: 0.5px;
    opacity: 0; transition: opacity 0.5s ease;
    z-index: 200; white-space: nowrap;
    pointer-events: none;
    backdrop-filter: blur(8px);
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
  }

  /* End card */
  #end-card {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: linear-gradient(135deg, ${nicheProfile.palette.background}, ${nicheProfile.palette.primaryLight});
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.8s ease;
    z-index: 300;
    pointer-events: none;
  }
  #end-card .title {
    font-size: 30px; font-weight: 700;
    color: ${nicheProfile.palette.text};
    text-align: center; max-width: 80%;
    line-height: 1.3; margin-bottom: 16px;
  }
  #end-card .subtitle {
    font-size: 15px; color: ${nicheProfile.palette.textMuted};
    letter-spacing: 3px; text-transform: uppercase;
    margin-bottom: 8px;
  }
  #end-card .badge {
    margin-top: 24px; padding: 10px 28px;
    background: ${accentColor}; color: white;
    border-radius: 24px; font-size: 14px; font-weight: 600;
  }
  #end-card .cta {
    margin-top: 16px; font-size: 13px;
    color: ${nicheProfile.palette.textMuted};
    letter-spacing: 1px;
  }

  /* Intro card */
  #intro-card {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: linear-gradient(135deg, ${nicheProfile.palette.primary}, ${nicheProfile.palette.primaryLight});
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.8s ease;
    z-index: 350;
    pointer-events: none;
  }
  #intro-card .intro-icon { font-size: 60px; margin-bottom: 20px; }
  #intro-card .intro-title {
    font-size: 32px; font-weight: 700;
    color: white; text-align: center;
    max-width: 80%; line-height: 1.3;
    margin-bottom: 12px;
    text-shadow: 0 2px 4px rgba(0,0,0,0.2);
  }
  #intro-card .intro-subtitle {
    font-size: 16px; color: rgba(255,255,255,0.85);
    letter-spacing: 3px; text-transform: uppercase;
  }
  #intro-card .intro-badge {
    margin-top: 24px; padding: 10px 28px;
    background: rgba(255,255,255,0.2); color: white;
    border-radius: 24px; font-size: 13px; font-weight: 500;
    letter-spacing: 0.5px;
    border: 1px solid rgba(255,255,255,0.3);
  }

  /* Scrollbar styling */
  .tab-content::-webkit-scrollbar { width: 12px; }
  .tab-content::-webkit-scrollbar-track { background: #f1f1f1; }
  .tab-content::-webkit-scrollbar-thumb { background: #c1c1c1; border-radius: 6px; }
</style>
</head>
<body>

<!-- Google Sheets Chrome -->
<div class="gs-chrome">
  <div class="gs-title-bar">
    <div class="icon">⊞</div>
    <span id="sheet-title">Dashboard</span>
  </div>
  <div class="gs-menu-bar">
    <span>File</span><span>Edit</span><span>View</span><span>Insert</span>
    <span>Format</span><span>Data</span><span>Extensions</span><span>Help</span>
  </div>
</div>
<div class="gs-toolbar">
  <span class="btn">↶</span><span class="btn">↷</span>
  <div class="sep"></div>
  <select><option>Arial</option></select>
  <select style="width:40px"><option>10</option></select>
  <div class="sep"></div>
  <span class="btn"><b>B</b></span><span class="btn"><i>I</i></span>
  <span class="btn" style="text-decoration:underline">U</span>
  <div class="sep"></div>
  <span class="btn">$</span><span class="btn">%</span>
</div>
<div class="gs-formula-bar">
  <div class="cell-ref">B6</div>
  <div class="fx"><i>f</i>x</div>
  <div class="content" id="formula-content">Dashboard</div>
</div>

<!-- Tab content area -->
<div class="tab-content" id="tab-content">
  ${tabContents.map((tc, i) => `
  <div class="tab-pane${i === 0 ? " active" : ""}" data-tab="${escHtml(tc.name)}">
    ${tc.html}
  </div>`).join("")}
</div>

<!-- Video overlay -->
<div id="video-overlay"></div>

<!-- End card -->
<div id="end-card">
  <div class="title">${escHtml(productTitle)}</div>
  <div class="subtitle">Google Sheets Template</div>
  <div class="badge">⬇ Instant Download</div>
  <div class="cta">Available on Etsy • Lifetime Access</div>
</div>

<!-- Intro card -->
<div id="intro-card">
  <div class="intro-icon">📊</div>
  <div class="intro-title">${escHtml(productTitle)}</div>
  <div class="intro-subtitle">Google Sheets Template</div>
  <div class="intro-badge">Instant Download • Works in Google Sheets & Excel</div>
</div>

<!-- Tab bar -->
<div class="gs-tab-bar">
  <div class="nav-btns"><span>◀</span><span>▶</span><span>+</span></div>
  ${uniqueTabs.map((t, i) =>
    `<div class="tab${i === 0 ? " active" : ""}" onclick="switchTab('${escHtml(t.name)}')">${escHtml(t.name)}</div>`
  ).join("\n  ")}
</div>

<script>
function switchTab(tabName) {
  // Update panes
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  const target = document.querySelector('.tab-pane[data-tab=\"' + tabName + '\"]');
  if (target) {
    target.classList.add('active');
  } else {
    // Fallback to first pane
    const first = document.querySelector('.tab-pane');
    if (first) first.classList.add('active');
  }

  // Update tab bar
  document.querySelectorAll('.gs-tab-bar .tab').forEach(t => {
    t.classList.toggle('active', t.textContent.trim() === tabName);
  });

  // Update title
  document.getElementById('sheet-title').textContent = tabName;
  document.getElementById('formula-content').textContent = tabName;

  // Scroll content to top
  document.getElementById('tab-content').scrollTop = 0;
}
</script>
</body>
</html>`;
}

// ── Data Extraction ──────────────────────────────────────────

function extractVideoData(
  blueprint: ProductBlueprint,
  nicheProfile: NicheDesignProfile,
  nicheData: ReturnType<typeof getNicheData>,
) {
  // Reuse the same logic as preview engine
  const dashTab = blueprint.tabs.find(t => t.name.toLowerCase().includes("dashboard"));
  const dataTab = blueprint.tabs.find(t => t.sampleRows && t.sampleRows.length > 0);

  const income = nicheData.monthlyIncome || 5000;
  const expenses = Math.round(income * 0.75);
  const kpiLabels = nicheData.kpiLabels;
  let budgetRows = nicheData.budgetCategories.map(c => {
    const actual = Math.round(c.budgetAmount * 0.85);
    return {
      category: c.name,
      budget: formatCurrency(c.budgetAmount),
      actual: formatCurrency(actual),
      remaining: formatCurrency(c.budgetAmount - actual),
    };
  });
  const savingsGoals = getNicheSavingsGoals(nicheProfile.id);

  // Try to derive budget rows from real transaction data (but keep KPIs from niche data for consistency)
  if (dataTab?.sampleRows && dataTab.sampleRows.length > 0) {

    try {
      const budgetResult = deriveBudgetFromTransactions(dataTab.sampleRows);
      if (budgetResult.length > 0) {
        const multipliers = [1.15, 1.22, 1.08, 1.30, 1.18, 1.12, 1.25, 1.09];
        budgetRows = budgetResult.slice(0, 8).map((r, idx) => {
          const actualNum = parseInt(r.amount.replace(/[^0-9.-]/g, "") || "0");
          const budgetNum = Math.round(actualNum * (multipliers[idx % 8] || 1.15));
          return {
            category: r.name,
            budget: formatCurrency(budgetNum),
            actual: r.amount,
            remaining: formatCurrency(budgetNum - actualNum),
          };
        });
      }
    } catch {}
  }

  // Compute KPI values
  const net = income - expenses;
  const rate = income > 0 ? Math.round((net / income) * 100) : 0;

  return {
    tagline: nicheData.tagline,
    monthLabel: "March",
    monthlyIncome: formatCurrency(income),
    kpis: [
      { label: kpiLabels[0] || "Total Income", value: formatCurrency(income), bgColor: "e8f5e9", textColor: "1b5e20" },
      { label: kpiLabels[1] || "Total Spent", value: formatCurrency(expenses), bgColor: "fff3e0", textColor: "e65100" },
      { label: kpiLabels[2] || "Net Savings", value: formatCurrency(net), bgColor: "e8f5e9", textColor: "1b5e20" },
      { label: kpiLabels[3] || "Savings Rate", value: `${rate}%`, bgColor: "f3e5f5", textColor: "4a148c" },
    ],
    budgetRows,
    savingsGoals,
  };
}

function extractVideoTransactions(blueprint: ProductBlueprint) {
  const dataTab = blueprint.tabs.find(t => t.sampleRows && t.sampleRows.length > 0);
  if (!dataTab?.sampleRows) return [];

  // sampleRows are arrays: [Date, Description, Amount, SubCategory, Category, Bucket, ...]
  return dataTab.sampleRows.slice(0, 18).map(row => ({
    date: String(row[0] ?? ""),
    description: String(row[1] ?? ""),
    amount: String(row[2] ?? ""),
    category: String(row[4] ?? ""),
    subcategory: String(row[3] ?? ""),
    bucket: String(row[5] ?? ""),
  }));
}

// ── Content Builders ─────────────────────────────────────────

function buildDashboardContent(
  data: ReturnType<typeof extractVideoData>,
  np: NicheDesignProfile,
): string {
  const sectionBg = np.spreadsheetTokens.sectionBg || "334155";
  const sectionText = np.spreadsheetTokens.sectionText || "f8fafc";
  const headerBg = np.spreadsheetTokens.headerBg || "e2e8f0";
  const accent = np.palette.accent || "#34A853";

  const totalBudget = data.budgetRows.reduce((s, r) => s + parseInt(r.budget.replace(/[^0-9.-]/g, "") || "0"), 0);
  const totalActual = data.budgetRows.reduce((s, r) => s + parseInt(r.actual.replace(/[^0-9.-]/g, "") || "0"), 0);

  return `
<table class="grid-table">
  <thead>
    <tr><th style="width:32px"></th>${"ABCDEFGHIJ".split("").map(c => `<th>${c}</th>`).join("")}</tr>
  </thead>
  <tbody>
    <tr class="title-row"><td class="row-num">1</td><td colspan="10">${escHtml(data.tagline)}</td></tr>
    <tr><td class="row-num">2</td><td colspan="10" style="text-align:center;color:#80868b;font-size:9px;">SELECT MONTH:</td></tr>
    <tr><td class="row-num">3</td><td colspan="10" style="height:6px;"></td></tr>
    <tr><td class="row-num">4</td>
      <td></td><td colspan="2" style="text-align:right;font-weight:600;font-size:10px;">SELECT MONTH:</td>
      <td style="font-weight:600;">${escHtml(data.monthLabel)}</td><td></td>
      <td colspan="2" style="text-align:right;font-weight:600;font-size:10px;">MONTHLY INCOME:</td>
      <td style="font-weight:600;background:#e8f5e9;border-radius:3px;">${escHtml(data.monthlyIncome)}</td>
      <td colspan="2"></td>
    </tr>
    <tr><td class="row-num">5</td><td colspan="10" style="height:6px;"></td></tr>
    <!-- KPI Labels -->
    <tr><td class="row-num">6</td>
      ${data.kpis.map(k => `<td colspan="2" class="kpi-label" style="background:#${k.bgColor};color:#${k.textColor};">${escHtml(k.label)}</td>`).join("")}
      <td colspan="2"></td>
    </tr>
    <!-- KPI Values -->
    <tr><td class="row-num">7</td>
      ${data.kpis.map(k => `<td colspan="2" class="kpi-value" style="background:#${k.bgColor};color:#${k.textColor};">${escHtml(k.value)}</td>`).join("")}
      <td colspan="2"></td>
    </tr>
    <tr><td class="row-num">8</td><td colspan="10" style="height:6px;"></td></tr>
    <!-- Section headers -->
    <tr class="section-header"><td class="row-num">9</td>
      <td colspan="5" style="background:#${sectionBg};color:#${sectionText};">SPENDING BY CATEGORY</td>
      <td colspan="5" style="background:#${sectionBg};color:#${sectionText};">SAVINGS GOALS</td>
    </tr>
    <!-- Data headers -->
    <tr class="data-header"><td class="row-num">10</td>
      <td colspan="2" style="background:#${headerBg};">Category</td>
      <td style="background:#${headerBg};text-align:right;">Budget</td>
      <td style="background:#${headerBg};text-align:right;">Actual</td>
      <td style="background:#${headerBg};text-align:right;">Remaining</td>
      <td colspan="2" style="background:#${headerBg};">Goal</td>
      <td style="background:#${headerBg};text-align:right;">Target</td>
      <td style="background:#${headerBg};text-align:right;">Saved</td>
      <td style="background:#${headerBg};text-align:right;">Progress</td>
    </tr>
    ${data.budgetRows.map((row, i) => {
      const goal = data.savingsGoals[i];
      const alt = i % 2 === 1 ? ' class="alt-row"' : "";
      return `<tr${alt}><td class="row-num">${11 + i}</td>
        <td colspan="2">${escHtml(row.category)}</td>
        <td style="text-align:right;">${escHtml(row.budget)}</td>
        <td style="text-align:right;">${escHtml(row.actual)}</td>
        <td style="text-align:right;">${escHtml(row.remaining)}</td>
        ${goal ? `<td colspan="2">${escHtml(goal.name)}</td>
        <td style="text-align:right;">${escHtml(goal.target)}</td>
        <td style="text-align:right;">${escHtml(goal.saved)}</td>
        <td style="text-align:right;">${escHtml(goal.progress)}</td>`
        : `<td colspan="5"></td>`}
      </tr>`;
    }).join("")}
    <!-- Totals -->
    <tr class="totals"><td class="row-num">${11 + data.budgetRows.length}</td>
      <td colspan="2" style="background:#${np.spreadsheetTokens.totalsBg || "e2e8f0"};font-weight:700;">TOTAL</td>
      <td style="text-align:right;background:#${np.spreadsheetTokens.totalsBg || "e2e8f0"};font-weight:700;">${formatCurrency(totalBudget)}</td>
      <td style="text-align:right;background:#${np.spreadsheetTokens.totalsBg || "e2e8f0"};font-weight:700;">${formatCurrency(totalActual)}</td>
      <td style="text-align:right;background:#${np.spreadsheetTokens.totalsBg || "e2e8f0"};font-weight:700;">${formatCurrency(totalBudget - totalActual)}</td>
      <td colspan="5"></td>
    </tr>
    ${Array.from({ length: 15 }, (_, i) => `<tr><td class="row-num">${12 + data.budgetRows.length + i}</td>${"<td></td>".repeat(10)}</tr>`).join("")}
  </tbody>
</table>`;
}

function buildTransactionContent(
  rows: ReturnType<typeof extractVideoTransactions>,
  np: NicheDesignProfile,
): string {
  const headerBg = np.spreadsheetTokens.headerBg || "e2e8f0";
  const accent = np.palette.accent || "#34A853";

  const columns = ["Date", "Description", "Amount", "Sub-Category", "Category", "Bucket"];

  return `
<table class="grid-table">
  <thead>
    <tr><th style="width:32px"></th>${"ABCDEFG".split("").map(c => `<th>${c}</th>`).join("")}</tr>
  </thead>
  <tbody>
    <tr class="title-row"><td class="row-num">1</td>
      <td colspan="7" style="background:${accent};color:white;text-align:center;font-weight:600;">
        ${rows.length > 0 ? rows[0].date.slice(0, 7) || "2026-01" : "2026-01"}
      </td>
    </tr>
    <tr><td class="row-num">2</td><td colspan="7" style="height:6px;"></td></tr>
    <tr class="data-header"><td class="row-num">3</td>
      ${columns.map(c => `<td style="background:#${headerBg};font-weight:600;">${c}</td>`).join("")}
      <td></td>
    </tr>
    ${rows.map((row, i) => {
      const alt = i % 2 === 1 ? ' class="alt-row"' : "";
      return `<tr${alt}><td class="row-num">${4 + i}</td>
        <td>${escHtml(row.date)}</td>
        <td>${escHtml(row.description)}</td>
        <td style="text-align:right;">${escHtml(row.amount)}</td>
        <td>${escHtml(row.subcategory)}</td>
        <td>${escHtml(row.category)}</td>
        <td>${escHtml(row.bucket)}</td>
        <td></td>
      </tr>`;
    }).join("")}
    ${Array.from({ length: 20 }, (_, i) => `<tr><td class="row-num">${4 + rows.length + i}</td>${"<td></td>".repeat(7)}</tr>`).join("")}
  </tbody>
</table>`;
}

function buildGenericTabContent(
  tab: BlueprintTab,
  np: NicheDesignProfile,
): string {
  const accent = np.palette.accent || "#34A853";
  const headerBg = np.spreadsheetTokens.headerBg || "e2e8f0";

  // Try to use column names from the tab
  const cols = (tab.columns?.slice(0, 6).map(c => typeof c === "string" ? c : c.name) || ["A", "B", "C", "D", "E", "F"]) as string[];
  const letters = "ABCDEFGHIJ".split("").slice(0, cols.length + 1);

  return `
<table class="grid-table">
  <thead>
    <tr><th style="width:32px"></th>${letters.map(c => `<th>${c}</th>`).join("")}</tr>
  </thead>
  <tbody>
    <tr class="title-row"><td class="row-num">1</td>
      <td colspan="${cols.length + 1}" style="background:${accent};color:white;text-align:center;font-weight:600;">
        ${escHtml(tab.name)}
      </td>
    </tr>
    <tr><td class="row-num">2</td><td colspan="${cols.length + 1}" style="height:6px;"></td></tr>
    <tr class="data-header"><td class="row-num">3</td>
      ${cols.map(c => `<td style="background:#${headerBg};font-weight:600;">${escHtml(c)}</td>`).join("")}
      <td></td>
    </tr>
    ${Array.from({ length: 30 }, (_, i) => `<tr><td class="row-num">${4 + i}</td>${`<td></td>`.repeat(cols.length + 1)}</tr>`).join("")}
  </tbody>
</table>`;
}

// ── ffmpeg Command Builder ───────────────────────────────────

function buildFfmpegCommand(
  inputPath: string,
  outputPath: string,
  W: number,
  H: number,
  addOverlays: boolean,
  scenes: Scene[],
): string {
  // Basic conversion: WebM → MP4 with H.264
  const filters: string[] = [];

  // Scale to exact dimensions
  filters.push(`scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`);

  // Apply slight vignette for premium feel
  filters.push("vignette=PI/6");

  const filterStr = filters.join(",");

  return [
    `ffmpeg -y -i "${inputPath}"`,
    `-vf "${filterStr}"`,
    `-c:v libx264 -preset medium -crf 23`,
    `-pix_fmt yuv420p`,
    `-an`, // no audio
    `-movflags +faststart`,
    `"${outputPath}"`,
  ].join(" ");
}

// ── Helper ───────────────────────────────────────────────────

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
