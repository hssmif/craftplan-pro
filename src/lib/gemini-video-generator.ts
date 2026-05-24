// ══════════════════════════════════════════════════════════════
// Gemini Video Generator — Cinematic Product Videos
//
// Generates marketing-style Etsy product videos using:
//   - Playwright for smooth browser-based animation
//   - Real spreadsheet HTML rendered at high fidelity
//   - Ken Burns zoom, smooth scrolls, soft transitions
//   - Intro/outro title cards, feature callouts
//   - Device mockup scenes
//   - ffmpeg for final H.264 MP4 output
//
// This is NOT a slideshow. The video has continuous motion:
//   Scene 1: Fade-in hook text
//   Scene 2: Laptop mockup zoom-in (dashboard revealed)
//   Scene 3: Ken Burns zoom into KPI cards
//   Scene 4: Smooth scroll to data tables
//   Scene 5: Tab-switch to transactions
//   Scene 6: Feature callout overlay
//   Scene 7: CTA end card
//
// Output: 1080×1080 MP4, ~20 seconds, Etsy-ready
// ══════════════════════════════════════════════════════════════

import { chromium } from "playwright";
import sharp from "sharp";
import type { ProductBlueprint, BlueprintTab } from "@/types/factory";
import type { VideoDirectionSpec, VideoScene as SpecVideoScene } from "@/types/gemini-specs";
import type { NicheDesignProfile } from "./factory-niche-themes";
import { getNicheData, getNicheSavingsGoals } from "./factory-niche-data";
import { getVideoSceneConfig, getLayoutFamilyId, type LayoutFamilyId } from "./factory-layout-families";

// Browser-side cursor animation functions (injected in <script> tag, called via page.evaluate)
declare global {
  function moveCursor(x: number, y: number): void;
  function showCursor(): void;
  function hideCursor(): void;
  function clickRipple(x: number, y: number): void;
}
import {
  deriveKpiFromTransactions,
  deriveBudgetFromTransactions,
  formatCurrency,
} from "./factory-display-helpers";
import { execSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import path from "path";

// ── Types ────────────────────────────────────────────────────

export interface GeminiVideoResult {
  videoPath: string;
  durationSec: number;
  fileSizeBytes: number;
  frameCount: number;
  source: "gemini-enhanced" | "playwright-cinematic";
}

export interface GeminiVideoOptions {
  width?: number;
  height?: number;
  fps?: number;
  outputDir?: string;
  skipGemini?: boolean;
}

// ── Scene Timeline ───────────────────────────────────────────

interface VideoScene {
  type: "intro" | "reveal" | "zoom" | "scroll" | "tab-switch" | "callout" | "end-card";
  durationMs: number;
  tabName?: string;
  scrollPx?: number;
  caption?: string;
  /** CSS transform for zoom scenes */
  zoomScale?: number;
  zoomOrigin?: string;
}

// ── Main Generator ───────────────────────────────────────────

export async function generateGeminiVideo(
  blueprint: ProductBlueprint,
  nicheProfile: NicheDesignProfile,
  options: GeminiVideoOptions = {},
): Promise<GeminiVideoResult> {
  const W = options.width || 1080;
  const H = options.height || 1080;
  const fps = options.fps || 30;
  const outputDir = options.outputDir || "/tmp/factory-video";

  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  // Clean recording dir
  const videoDir = path.join(outputDir, "recording");
  if (existsSync(videoDir)) {
    for (const f of readdirSync(videoDir)) unlinkSync(path.join(videoDir, f));
  } else {
    mkdirSync(videoDir, { recursive: true });
  }

  const nicheData = getNicheData(nicheProfile.id);
  const productTitle = blueprint.sourceListingTitle || "Budget Tracker";
  // Use VideoDirectionSpec's emotional arc as captions if available
  const vdSpec = blueprint.videoDirection as import("@/types/gemini-specs").VideoDirectionSpec | undefined;
  const captions = vdSpec?.emotionalArc?.length
    ? [vdSpec.hookText, ...vdSpec.emotionalArc].slice(0, 5)
    : getCinematicCaptions(nicheProfile.id, productTitle);

  // ── Build scenes ───────────────────────────────────────────
  const scenes = buildCinematicScenes(blueprint, nicheProfile, captions);

  // ── Build the HTML page ────────────────────────────────────
  const html = buildCinematicHTML(blueprint, nicheProfile, W, H, productTitle, nicheData, captions[0]);

  // ── Record with Playwright ─────────────────────────────────
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });

  const context = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: videoDir, size: { width: W, height: H } },
  });

  const page = await context.newPage();

  try {
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);

    // ── Execute scene sequence with smooth motion ────────────
    for (const scene of scenes) {
      switch (scene.type) {
        case "intro": {
          // Fade in intro overlay
          await page.evaluate(() => {
            const el = document.getElementById("intro-card");
            if (el) el.style.opacity = "1";
          });
          await page.waitForTimeout(scene.durationMs * 0.65);
          // Fade out
          await page.evaluate(() => {
            const el = document.getElementById("intro-card");
            if (el) el.style.opacity = "0";
          });
          await page.waitForTimeout(scene.durationMs * 0.35);
          break;
        }

        case "reveal": {
          // Zoom from 115% → 100% (reveal effect, Ken Burns reverse)
          // Show cursor moving into frame
          await page.evaluate(() => {
            moveCursor(540, 800);
            showCursor();
          });
          const steps = 30;
          const stepDelay = Math.floor(scene.durationMs / steps);
          for (let i = 0; i <= steps; i++) {
            const scale = 1.15 - (i / steps) * 0.15;
            const cursorX = 540 - (i / steps) * 80;
            const cursorY = 800 - (i / steps) * 300;
            await page.evaluate(({ s, cx, cy }) => {
              const el = document.getElementById("tab-content");
              if (el) {
                el.style.transform = `scale(${s})`;
                el.style.transformOrigin = "center 30%";
              }
              moveCursor(cx, cy);
            }, { s: scale, cx: cursorX, cy: cursorY });
            await page.waitForTimeout(stepDelay);
          }
          break;
        }

        case "zoom": {
          // Ken Burns zoom in (slow, smooth) with cursor following focal point
          const targetScale = scene.zoomScale || 1.18;
          const origin = scene.zoomOrigin || "center 20%";
          const steps = 40;
          const stepDelay = Math.floor(scene.durationMs / steps);

          // Show cursor near zoom origin area
          await page.evaluate(() => {
            showCursor();
            moveCursor(460, 320);
          });
          await page.waitForTimeout(200);

          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            // Ease-in-out cubic
            const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            const scale = 1 + ease * (targetScale - 1);
            // Cursor drifts slightly during zoom for realism
            const cx = 460 + ease * 40;
            const cy = 320 + ease * 30;
            await page.evaluate(
              ({ s, o, curX, curY }) => {
                const el = document.getElementById("tab-content");
                if (el) {
                  el.style.transform = `scale(${s})`;
                  el.style.transformOrigin = o;
                }
                moveCursor(curX, curY);
              },
              { s: scale, o: origin, curX: cx, curY: cy },
            );
            await page.waitForTimeout(stepDelay);
          }
          // Hold at zoom
          await page.waitForTimeout(300);
          // Ease back — hide cursor during zoom-out
          await page.evaluate(() => { hideCursor(); });
          for (let i = steps; i >= 0; i--) {
            const t = i / steps;
            const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            const scale = 1 + ease * (targetScale - 1);
            await page.evaluate((s) => {
              const el = document.getElementById("tab-content");
              if (el) el.style.transform = `scale(${s})`;
            }, scale);
            await page.waitForTimeout(Math.floor(stepDelay * 0.6));
          }
          break;
        }

        case "scroll": {
          const scrollAmount = scene.scrollPx || 300;
          const steps = 30;
          const stepDelay = Math.floor(scene.durationMs / steps);
          const stepPx = scrollAmount / steps;
          // Show cursor and scroll wheel effect
          await page.evaluate(() => {
            showCursor();
            moveCursor(540, 400);
          });
          for (let i = 0; i < steps; i++) {
            // Cursor stays roughly in place while content scrolls (mimics scroll wheel)
            const cursorY = 400 + Math.sin(i / steps * Math.PI) * 20;
            await page.evaluate(({ px, cy }) => {
              const el = document.querySelector(".gs-grid") || document.getElementById("tab-content");
              if (el) el.scrollTop += px;
              moveCursor(540, cy);
            }, { px: stepPx, cy: cursorY });
            await page.waitForTimeout(stepDelay);
          }
          break;
        }

        case "tab-switch": {
          if (scene.tabName) {
            // Animate cursor to the tab before clicking
            const tabs = await page.locator(".gs-tab-bar .tab").all();
            let targetTab: typeof tabs[0] | null = null;
            for (const t of tabs) {
              const text = await t.textContent();
              if (text?.trim().toLowerCase().includes(scene.tabName.toLowerCase())) {
                targetTab = t;
                break;
              }
            }
            if (targetTab) {
              // Move cursor to target tab position then click
              const box = await targetTab.boundingBox();
              if (box) {
                await page.evaluate(({ x, y }) => {
                  showCursor();
                  moveCursor(x, y);
                }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
                await page.waitForTimeout(350);
                // Click ripple effect
                await page.evaluate(({ x, y }) => {
                  clickRipple(x, y);
                }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
              }
              await targetTab.click();
            }
          }
          await page.waitForTimeout(scene.durationMs);
          break;
        }

        case "callout": {
          if (scene.caption) {
            await page.evaluate((text) => {
              const el = document.getElementById("video-overlay");
              if (el) {
                el.textContent = text;
                el.style.opacity = "1";
              }
            }, scene.caption);
            await page.waitForTimeout(scene.durationMs * 0.65);
            await page.evaluate(() => {
              const el = document.getElementById("video-overlay");
              if (el) el.style.opacity = "0";
            });
            await page.waitForTimeout(scene.durationMs * 0.35);
          } else {
            await page.waitForTimeout(scene.durationMs);
          }
          break;
        }

        case "end-card": {
          await page.evaluate(() => {
            const el = document.getElementById("end-card");
            if (el) el.style.opacity = "1";
          });
          await page.waitForTimeout(scene.durationMs);
          break;
        }
      }
    }

    await page.waitForTimeout(500);
  } finally {
    await page.close();
    await context.close();
  }

  // ── Find & convert video ───────────────────────────────────
  const videoFiles = readdirSync(videoDir).filter(f => f.endsWith(".webm"));
  if (videoFiles.length === 0) {
    await browser.close();
    throw new Error("Playwright did not produce a video recording");
  }

  const rawVideo = path.join(videoDir, videoFiles[0]);
  const slug = productTitle.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase().slice(0, 40);
  const outputPath = path.join(outputDir, `${slug}-video.mp4`);

  // ffmpeg: WebM → polished MP4
  const ffmpegCmd = [
    `ffmpeg -y -i "${rawVideo}"`,
    `-vf "scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,fade=in:0:${fps},fade=out:st=18:d=1"`,
    `-c:v libx264 -preset medium -crf 22`,
    `-pix_fmt yuv420p -an -movflags +faststart`,
    `"${outputPath}"`,
  ].join(" ");

  execSync(ffmpegCmd, { stdio: "pipe", timeout: 90000 });
  try { unlinkSync(rawVideo); } catch {}
  await browser.close();

  const { statSync } = require("fs");
  const stat = statSync(outputPath);

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
    frameCount: scenes.length,
    source: "playwright-cinematic",
  };
}

// ══════════════════════════════════════════════════════════════
// Scene Builder — Cinematic Timeline
// ══════════════════════════════════════════════════════════════

/**
 * Build video scenes from VideoDirectionSpec.
 * Maps spec scene types to our internal scene types with correct timing.
 */
function buildScenesFromSpec(
  spec: VideoDirectionSpec,
  blueprint: ProductBlueprint,
  captions: string[],
): VideoScene[] {
  const scenes: VideoScene[] = [];
  const tabs = blueprint.tabs.filter(t => {
    const low = t.name.toLowerCase();
    return !low.includes("setup") && !low.includes("instruction");
  });

  // Pacing multiplier — affects all durations
  const paceMultiplier = spec.defaultPaceMs ? spec.defaultPaceMs / 2000 : 1;

  for (const specScene of spec.scenes) {
    // Map spec scene types to our internal types
    const mappedType = mapSceneType(specScene.type);
    const durationMs = Math.max(800, Math.round(specScene.durationMs * paceMultiplier));
    const caption = specScene.caption || "";

    // For tab-switch scenes, resolve the tab name from focusArea
    let tabName = specScene.focusArea;
    if (mappedType === "tab-switch" && tabName) {
      const match = tabs.find(t => t.name.toLowerCase().includes(tabName!.toLowerCase()));
      if (match) tabName = match.name;
    }

    // Map motion to zoom settings
    let zoomScale: number | undefined;
    let zoomOrigin: string | undefined;
    if (specScene.motion === "zoom-in") {
      zoomScale = 1.2;
      zoomOrigin = "center 25%";
    } else if (specScene.motion === "zoom-out") {
      zoomScale = 0.85;
      zoomOrigin = "center center";
    }

    const scene: VideoScene = {
      type: mappedType,
      durationMs,
      ...(caption ? { caption } : {}),
      ...(tabName ? { tabName } : {}),
      ...(zoomScale ? { zoomScale, zoomOrigin } : {}),
      ...(specScene.motion === "scroll-down" ? { scrollPx: 300 } : {}),
    };

    scenes.push(scene);
  }

  // Ensure we have an intro and end-card (spec may omit them)
  if (scenes.length > 0 && scenes[0].type !== "intro") {
    scenes.unshift({
      type: "intro",
      durationMs: Math.round(2500 * paceMultiplier),
      caption: spec.hookText || captions[0] || "",
    });
  }
  if (scenes.length > 0 && scenes[scenes.length - 1].type !== "end-card") {
    scenes.push({
      type: "end-card",
      durationMs: Math.round(3000 * paceMultiplier),
      caption: spec.ctaText || captions[4] || "Instant Download",
    });
  }

  // Override intro caption with spec's hook text
  if (spec.hookText && scenes[0]?.type === "intro") {
    scenes[0].caption = spec.hookText;
  }

  // Override end-card caption with spec's CTA
  const lastScene = scenes[scenes.length - 1];
  if (spec.ctaText && lastScene?.type === "end-card") {
    lastScene.caption = spec.ctaText;
  }

  console.log(`[Video] Spec-driven: ${scenes.length} scenes, ~${Math.round(scenes.reduce((s, sc) => s + sc.durationMs, 0) / 1000)}s, mood=${spec.musicMood}, transition=${spec.transitionStyle}`);
  return scenes;
}

/** Map VideoDirectionSpec scene types to our internal scene types */
function mapSceneType(type: SpecVideoScene["type"]): VideoScene["type"] {
  switch (type) {
    case "intro": return "intro";
    case "hook": return "callout";
    case "reveal": return "reveal";
    case "zoom": return "zoom";
    case "scroll": return "scroll";
    case "tab-switch": return "tab-switch";
    case "callout": return "callout";
    case "comparison": return "callout";
    case "testimonial": return "callout";
    case "end-card": return "end-card";
    default: return "callout";
  }
}

function buildCinematicScenes(
  blueprint: ProductBlueprint,
  nicheProfile: NicheDesignProfile,
  captions: string[],
): VideoScene[] {
  // ── If VideoDirectionSpec is available, use it as the primary driver ──
  const vdSpec = blueprint.videoDirection as VideoDirectionSpec | undefined;
  if (vdSpec && vdSpec.scenes && vdSpec.scenes.length > 0) {
    return buildScenesFromSpec(vdSpec, blueprint, captions);
  }

  // ══════════════════════════════════════════════════════════════
  // MINI-AD STRUCTURE: HOOK → TRANSFORMATION → PROOF → CTA
  //
  // HOOK (0-2s):          Emotional pain, big text overlay, fast attention
  // TRANSFORMATION (2-5s): Show "after" result — clean dashboard + KPI highlight
  // PROOF (5-12s):        Features, charts, tabs, real usage — rapid montage
  // CTA (final):          Clear action, benefit-driven
  //
  // Total: ~15 seconds — shorter, punchier, conversion-focused
  // ══════════════════════════════════════════════════════════════

  const config = getVideoSceneConfig(nicheProfile.id);
  const familyId = getLayoutFamilyId(nicheProfile.id);
  const scenes: VideoScene[] = [];

  const seen = new Set<string>();
  const tabs = blueprint.tabs.filter(t => {
    const low = t.name.toLowerCase();
    if (seen.has(low)) return false;
    seen.add(low);
    return !low.includes("setup") && !low.includes("instruction");
  });

  // ── ACT 1: HOOK (0-2s) — Emotional pain, fast attention ──
  // Shorter intro with emotional text — NOT a slow fade
  scenes.push({ type: "intro", durationMs: Math.min(config.introDurationMs, 2000) });

  // ── ACT 2: TRANSFORMATION (2-5s) — Show the "after" result ──
  if (familyId === "executive") {
    // Executive: No slow reveal — jump straight to dashboard zoom
    scenes.push({
      type: "zoom", durationMs: 1800,
      zoomScale: config.proofZoomScale,
      zoomOrigin: "center 25%", // Focus on KPI strip
    });
    scenes.push({ type: "callout", durationMs: 1200, caption: captions[1] });
  } else if (familyId === "editorial") {
    // Editorial: Quick elegant reveal into dashboard
    scenes.push({ type: "reveal", durationMs: 1800 });
    scenes.push({ type: "callout", durationMs: 1200, caption: captions[1] });
  } else {
    // Nurture: Brief reveal then zoom to savings/KPIs
    scenes.push({ type: "reveal", durationMs: 1500 });
    scenes.push({ type: "callout", durationMs: 1200, caption: captions[1] });
  }

  // ── ACT 3: PROOF (5-12s) — Rapid tab montage, features speak ──
  // Quick zoom into detail area
  scenes.push({
    type: "zoom", durationMs: 2000,
    zoomScale: config.proofZoomScale,
    zoomOrigin: config.proofZoomOrigin,
  });

  // Brief scroll to show data depth
  scenes.push({ type: "scroll", durationMs: 1200, scrollPx: config.proofScrollPx });

  // Feature callout overlay (mid-proof)
  if (captions[2]) {
    scenes.push({ type: "callout", durationMs: 1000, caption: captions[2] });
  }

  // Scroll back
  scenes.push({ type: "scroll", durationMs: 800, scrollPx: -config.proofScrollPx });

  // Rapid tab switches — the proof montage
  // Each niche shows its most impressive tabs (fast, 1.5s each)
  const tabHints = getProofTabHints(familyId, nicheProfile.id);
  const proofTabs = findTabsByHints(tabs, tabHints);
  const tabsToShow = proofTabs.length > 0 ? proofTabs.slice(0, 3) : tabs.slice(1, 4);
  for (const t of tabsToShow) {
    scenes.push({ type: "tab-switch", durationMs: 1500, tabName: t.name });
  }

  // Return to dashboard for final view
  scenes.push({ type: "tab-switch", durationMs: 800, tabName: "Dashboard" });

  // ── ACT 4: CTA (final) — Benefit-driven close ──
  scenes.push({ type: "callout", durationMs: 1500, caption: captions[4] || captions[3] || "Start today" });
  scenes.push({ type: "end-card", durationMs: Math.min(config.ctaDurationMs, 3000) });

  return scenes;
}

/** Get the best tab hints for the proof montage based on niche */
function getProofTabHints(familyId: LayoutFamilyId, nicheId: string): string[] {
  const hints: Record<string, string[]> = {
    "wedding-planner": ["vendor", "guest", "timeline", "payment", "registry"],
    "travel-planner": ["itinerary", "packing", "flight", "hotel", "trip"],
    "meal-planner": ["meal", "grocery", "recipe", "shopping", "food", "cost"],
    "business-pl": ["revenue", "p&l", "profit", "tax", "expense", "transaction"],
    "side-hustle": ["income", "profit", "expense", "hustle", "revenue"],
    "debt-payoff": ["debt", "payment", "balance", "payoff", "snowball", "milestone"],
    "student-budget": ["semester", "subscription", "income", "savings", "budget"],
    "baby-budget": ["milestone", "registry", "baby", "savings", "goal"],
    "paycheck-budget": ["bill", "sinking", "debt", "paycheck", "allocation"],
    "savings-tracker": ["savings", "goal", "emergency", "tracker"],
    "pregnancy-planner": ["prenatal", "nursery", "checklist", "milestone"],
    "adhd-planner": ["tracker", "simple", "overview"],
  };
  if (hints[nicheId]) return hints[nicheId];
  // Family-level fallbacks
  if (familyId === "executive") return ["revenue", "transaction", "expense", "profit"];
  if (familyId === "editorial") return ["vendor", "guest", "itinerary", "checklist"];
  return ["savings", "goal", "milestone", "tracker"];
}

/** Find tabs whose names match any of the hint keywords (case-insensitive). */
function findTabsByHints(tabs: ProductBlueprint["tabs"], hints: string[]): ProductBlueprint["tabs"] {
  return tabs.filter(t => {
    const low = t.name.toLowerCase();
    return hints.some(h => low.includes(h));
  });
}

// ══════════════════════════════════════════════════════════════
// Captions — Marketing-style per niche
// ══════════════════════════════════════════════════════════════

function getCinematicCaptions(nicheId: string, _title: string): string[] {
  // Structure: [hook, transformation, proof-feature, detail, cta]
  // Mini-ad format: emotional hook → outcome → proof → close
  const map: Record<string, string[]> = {
    "baby-budget": [
      "Baby costs piling up?",
      "Every diaper, formula, and checkup — tracked",
      "Visual charts show where it all goes",
      "Color-coded savings progress",
      "Finally feel prepared",
    ],
    "business-pl": [
      "Are you actually profitable?",
      "Revenue. Costs. Margin. One view.",
      "Auto-calculated P&L by category",
      "Tax-ready expense tracking",
      "Know your real numbers",
    ],
    "wedding-planner": [
      "Wedding costs spiraling?",
      "Every vendor, guest, and dollar — one planner",
      "Visual budget bars by category",
      "Payment schedules auto-tracked",
      "Enjoy the engagement. We handle the numbers.",
    ],
    "paycheck-budget": [
      "Paycheck gone before month ends?",
      "Every dollar planned before you spend it",
      "Bills, savings, spending — all allocated",
      "Color-coded progress on every goal",
      "Finally in control of your money",
    ],
    "travel-planner": [
      "Trips always cost more than planned?",
      "Every flight, hotel, and meal — tracked",
      "Budget bars show spending vs plan",
      "Savings progress for your dream trip",
      "Travel smarter. Stay on budget.",
    ],
    "savings-tracker": [
      "Saving feels impossible?",
      "Visual progress bars for every goal",
      "Color-coded: green, yellow, red",
      "Auto-tracking savings milestones",
      "Watch your savings grow",
    ],
    "debt-payoff": [
      "Drowning in payments?",
      "Every balance, rate, and payment — one view",
      "Snowball or avalanche — see the finish line",
      "Watch your balances drop month by month",
      "Freedom has a date",
    ],
    "side-hustle": [
      "Is your hustle actually profitable?",
      "Revenue, costs, profit — per stream",
      "Track day job + side income together",
      "Auto-calculated tax estimates",
      "Know your real numbers",
    ],
    "meal-planner": [
      "Spending too much on food?",
      "Grocery runs, dining out — all tracked",
      "Category bars show where food money goes",
      "Meal plans that keep you on budget",
      "Eat better. Spend less.",
    ],
    "pregnancy-planner": [
      "Financially ready for baby?",
      "Prenatal, nursery, leave — all planned",
      "Milestone-based savings tracking",
      "Visual progress on every goal",
      "Feel prepared. Not stressed.",
    ],
    "student-budget": [
      "Broke before midterms?",
      "Track every dollar against your budget",
      "Built for irregular student income",
      "Visual bars show what's left to spend",
      "Stretch every dollar further",
    ],
    "adhd-planner": [
      "Budget overwhelm is real.",
      "One dashboard. Zero clutter.",
      "Visual bars — no number crunching",
      "30-second check-ins that work",
      "Finally, a budget that clicks",
    ],
  };

  return map[nicheId] || [
    "Tired of messy finances?",
    "Every expense tracked in one place",
    "Auto-calculating budget formulas",
    "Set goals and watch your progress",
    "Start today — instant download",
  ];
}

// ══════════════════════════════════════════════════════════════
// HTML Builder — Cinema-quality single page
// ══════════════════════════════════════════════════════════════

function buildCinematicHTML(
  blueprint: ProductBlueprint,
  nicheProfile: NicheDesignProfile,
  W: number,
  H: number,
  productTitle: string,
  nicheData: ReturnType<typeof getNicheData>,
  emotionalHook?: string,
): string {
  const accent = nicheProfile.palette.accent || "#34A853";
  const pal = nicheProfile.palette;
  const headerBg = nicheProfile.spreadsheetTokens.headerBg || "e2e8f0";
  const sectionBg = nicheProfile.spreadsheetTokens.sectionBg || "334155";
  const sectionText = nicheProfile.spreadsheetTokens.sectionText || "f8fafc";

  // Content density from layout family — drives font sizes and row counts
  const familyId = getLayoutFamilyId(nicheProfile.id);
  const nicheId = nicheProfile.id;

  const font = familyId === "editorial"
    ? "'Georgia', 'Playfair Display', serif"
    : "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif";
  const density = (familyId === "executive" ? "dense" : familyId === "editorial" ? "spacious" : "balanced") as "spacious" | "balanced" | "dense";
  const densityScale = density === "dense" ? 0.9 : density === "spacious" ? 1.1 : 1.0;
  const baseFontSize = Math.round(11 * densityScale);
  const kpiFontSize = Math.round(18 * densityScale);
  const maxDataRows = density === "dense" ? 12 : density === "spacious" ? 7 : 9;

  const dashData = extractVideoData(blueprint, nicheProfile, nicheData);
  const txnRows = extractVideoTransactions(blueprint);
  const savingsGoals = getNicheSavingsGoals(nicheProfile.id);

  // Build tab content
  const seen = new Set<string>();
  const uniqueTabs = blueprint.tabs.filter(t => {
    const low = t.name.toLowerCase();
    if (seen.has(low)) return false;
    seen.add(low);
    return true;
  });

  const tabContents: { name: string; html: string }[] = [];

  // Dashboard tab
  tabContents.push({ name: "Dashboard", html: buildDashboardHTML(dashData, nicheProfile, savingsGoals) });

  // Transaction tab
  const txnTab = uniqueTabs.find(t =>
    t.name.toLowerCase().includes("transaction") || t.name.toLowerCase().includes("log"));
  if (txnTab) {
    tabContents.push({ name: txnTab.name, html: buildTransactionHTML(txnRows, nicheProfile) });
  }

  // Other tabs
  for (const tab of uniqueTabs) {
    const low = tab.name.toLowerCase();
    if (low.includes("dashboard") || low.includes("transaction") || low.includes("log")) continue;
    if (low.includes("setup") || low.includes("instruction")) continue;
    if (tabContents.length >= 5) break;
    tabContents.push({ name: tab.name, html: buildGenericTabHTML(tab, nicheProfile) });
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@400;600;700&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: ${font};
  background: white;
  width: ${W}px; height: ${H}px;
  overflow: hidden; position: relative;
}

/* Google Sheets chrome */
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
.gs-toolbar select { border: 1px solid #dadce0; border-radius: 3px; padding: 1px 3px; font-size: 11px; background: white; }
.gs-formula-bar {
  display: flex; align-items: center;
  border-bottom: 1px solid #dadce0; height: 24px; font-size: 11px;
}
.gs-formula-bar .cell-ref { width: 60px; text-align: center; border-right: 1px solid #dadce0; padding: 0 6px; color: #3c4043; font-size: 10px; }
.gs-formula-bar .fx { padding: 0 6px; color: #80868b; border-right: 1px solid #dadce0; font-style: italic; font-size: 11px; }
.gs-formula-bar .content { padding: 0 6px; color: #3c4043; flex: 1; }

/* Tab content */
#tab-content {
  height: calc(100% - 130px);
  overflow-y: auto; overflow-x: hidden;
  scroll-behavior: smooth;
  transition: transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1);
  transform-origin: center top;
}
.tab-pane { display: none; }
.tab-pane.active { display: block; }

/* Grid styles — density-aware */
.grid-table { width: 100%; border-collapse: collapse; font-size: ${baseFontSize}px; line-height: ${density === "dense" ? "1.2" : "1.3"}; }
.grid-table td, .grid-table th {
  border: 1px solid #e8eaed; padding: ${density === "dense" ? "3px 5px" : "4px 6px"};
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px;
}
.grid-table th { background: #f8f9fa; color: #5f6368; font-weight: 400; font-size: ${baseFontSize - 1}px; text-align: center; position: sticky; top: 0; }
.grid-table .row-num { background: #f8f9fa; color: #80868b; text-align: center; width: 32px; font-size: ${baseFontSize - 1}px; }
.grid-table .title-row td { background: ${accent}; color: white; text-align: center; font-weight: 600; font-size: ${baseFontSize + 1}px; padding: 6px; }
.grid-table .kpi-label { text-align: center; font-size: ${baseFontSize - 2}px; text-transform: uppercase; letter-spacing: 0.5px; padding: 3px 4px; }
.grid-table .kpi-value { text-align: center; font-size: ${kpiFontSize}px; font-weight: 700; padding: ${density === "dense" ? "4px" : "6px"} 4px; }
.grid-table .section-header td { text-align: center; font-weight: 600; font-size: ${baseFontSize - 1}px; text-transform: uppercase; letter-spacing: 1px; padding: 4px; }
.grid-table .data-header td { font-weight: 600; font-size: ${baseFontSize - 1}px; }
.grid-table .totals td { font-weight: 700; }
.grid-table .alt-row td { background: #${nicheProfile.spreadsheetTokens.rowAlt || "f8fafc"}; }

/* Tab bar */
.gs-tab-bar {
  position: fixed; bottom: 0; left: 0; right: 0;
  display: flex; align-items: center;
  height: 28px; background: #f8f9fa;
  border-top: 1px solid #dadce0;
  padding: 0 8px; gap: 0; z-index: 100;
}
.gs-tab-bar .nav-btns { display: flex; gap: 2px; margin-right: 8px; font-size: 10px; color: #80868b; }
.gs-tab-bar .tab {
  padding: 4px 12px; border: 1px solid transparent;
  border-radius: 4px 4px 0 0; color: #80868b;
  cursor: pointer; font-size: 11px; transition: all 0.3s ease;
}
.gs-tab-bar .tab.active { background: white; color: #202124; font-weight: 500; border-bottom: 2px solid ${accent}; }

/* Overlay caption */
#video-overlay {
  position: fixed; bottom: 70px; left: 50%; transform: translateX(-50%);
  background: rgba(0,0,0,0.82); color: white;
  padding: 12px 36px; border-radius: 12px;
  font-size: 18px; font-weight: 600; letter-spacing: 0.3px;
  opacity: 0; transition: opacity 0.5s ease;
  z-index: 200; white-space: nowrap;
  backdrop-filter: blur(10px);
  box-shadow: 0 6px 24px rgba(0,0,0,0.25);
}

/* Intro card — family-specific */
#intro-card {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: ${familyId === "executive"
    ? `linear-gradient(160deg, #1a1a2e, #16213e, #0f3460)`
    : familyId === "editorial"
    ? `linear-gradient(135deg, #faf5ef, #f0e6d3, #e8d5b7)`
    : `linear-gradient(135deg, ${pal.primary}, ${pal.primaryLight})`};
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.9s ease;
  z-index: 350;
}
#intro-card .hook {
  font-size: ${familyId === "executive" ? "34px" : "38px"};
  font-weight: ${familyId === "editorial" ? "400" : "800"};
  font-family: ${familyId === "editorial" ? "'Georgia', 'Times New Roman', serif" : font};
  color: ${familyId === "executive" ? "white" : familyId === "editorial" ? "#3d2b1f" : "white"};
  text-align: center; max-width: 85%; line-height: 1.3;
  text-shadow: ${familyId === "executive" ? "0 2px 12px rgba(0,0,0,0.5)" : familyId === "editorial" ? "none" : "0 3px 8px rgba(0,0,0,0.2)"};
  letter-spacing: ${familyId === "editorial" ? "0.5px" : "-0.3px"};
}
#intro-card .sub {
  margin-top: 14px; font-size: ${familyId === "executive" ? "13px" : "16px"};
  color: ${familyId === "executive" ? "rgba(255,255,255,0.7)" : familyId === "editorial" ? "rgba(61,43,31,0.65)" : "rgba(255,255,255,0.85)"};
  letter-spacing: ${familyId === "executive" ? "4px" : "3px"}; text-transform: uppercase;
  font-family: ${familyId === "editorial" ? "'Georgia', 'Times New Roman', serif" : font};
}
#intro-card .badge {
  margin-top: 28px; padding: 10px 28px;
  background: ${familyId === "executive" ? "rgba(255,255,255,0.08)" : familyId === "editorial" ? "rgba(61,43,31,0.08)" : "rgba(255,255,255,0.18)"};
  border: 1px solid ${familyId === "executive" ? "rgba(255,255,255,0.15)" : familyId === "editorial" ? "rgba(61,43,31,0.15)" : "rgba(255,255,255,0.25)"};
  border-radius: 24px; font-size: 13px;
  color: ${familyId === "executive" ? "rgba(255,255,255,0.9)" : familyId === "editorial" ? "#3d2b1f" : "white"};
  letter-spacing: 0.5px;
}
#intro-card .kpi-preview {
  margin-top: 20px; display: flex; gap: 24px;
}
#intro-card .kpi-preview .kp { text-align: center; color: rgba(255,255,255,0.9); }
#intro-card .kpi-preview .kp .num { font-size: 28px; font-weight: 700; font-family: 'SF Mono', 'Consolas', monospace; }
#intro-card .kpi-preview .kp .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.7; margin-top: 4px; }

/* End card — family-specific */
#end-card {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: ${familyId === "executive"
    ? `linear-gradient(160deg, #1a1a2e, #16213e)`
    : familyId === "editorial"
    ? `linear-gradient(135deg, #faf5ef, #f0e6d3)`
    : `linear-gradient(135deg, ${pal.background}, ${pal.primaryLight})`};
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.9s ease;
  z-index: 300;
}
#end-card .title {
  font-size: 32px; font-weight: ${familyId === "editorial" ? "400" : "700"};
  font-family: ${familyId === "editorial" ? "'Georgia', 'Times New Roman', serif" : font};
  color: ${familyId === "executive" ? "white" : familyId === "editorial" ? "#3d2b1f" : pal.text};
  text-align: center; max-width: 80%; line-height: 1.3;
}
#end-card .sub {
  margin-top: 10px; font-size: 15px;
  color: ${familyId === "executive" ? "rgba(255,255,255,0.7)" : familyId === "editorial" ? "rgba(61,43,31,0.6)" : pal.textMuted};
  letter-spacing: 3px; text-transform: uppercase;
  font-family: ${familyId === "editorial" ? "'Georgia', 'Times New Roman', serif" : font};
}
#end-card .cta-btn {
  margin-top: 28px; padding: 12px 36px;
  background: ${familyId === "executive" ? "#0f3460" : accent};
  color: white; border-radius: 26px; font-size: 16px; font-weight: 700;
}
#end-card .trust {
  margin-top: 14px; font-size: 12px;
  color: ${familyId === "executive" ? "rgba(255,255,255,0.5)" : familyId === "editorial" ? "rgba(61,43,31,0.5)" : pal.textMuted};
  letter-spacing: 1px;
}

/* Animated cursor */
#animated-cursor {
  position: fixed;
  z-index: 250;
  pointer-events: none;
  width: 28px;
  height: 28px;
  opacity: 0;
  filter: drop-shadow(0 2px 6px rgba(0,0,0,0.35));
  transition: left 0.5s cubic-bezier(0.4, 0, 0.2, 1), top 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
  left: 50%;
  top: 50%;
}
#animated-cursor svg { width: 28px; height: 28px; }

/* Click ripple */
#cursor-ripple {
  position: fixed;
  z-index: 249;
  pointer-events: none;
  width: 32px; height: 32px;
  border: 2px solid ${accent};
  border-radius: 50%;
  opacity: 0;
  transform: scale(0);
  transition: none;
}
#cursor-ripple.active {
  animation: ripple-out 0.5s ease-out forwards;
}
@keyframes ripple-out {
  0% { transform: scale(0); opacity: 0.7; }
  100% { transform: scale(2.5); opacity: 0; }
}
</style>
</head>
<body>

<!-- Chrome -->
<div class="gs-chrome">
  <div class="gs-title-bar"><div class="icon">⊞</div><span>Dashboard</span></div>
  <div class="gs-menu-bar"><span>File</span><span>Edit</span><span>View</span><span>Insert</span><span>Format</span><span>Data</span><span>Extensions</span><span>Help</span></div>
</div>
<div class="gs-toolbar">
  <span class="btn">↶</span><span class="btn">↷</span><div class="sep"></div>
  <select><option>${familyId === "editorial" ? "Georgia" : "Inter"}</option></select><select style="width:40px"><option>10</option></select>
  <div class="sep"></div>
  <span class="btn"><b>B</b></span><span class="btn"><i>I</i></span><span class="btn" style="text-decoration:underline">U</span>
  <div class="sep"></div><span class="btn">$</span><span class="btn">%</span>
</div>
<div class="gs-formula-bar">
  <div class="cell-ref">B6</div><div class="fx"><i>f</i>x</div><div class="content">Dashboard</div>
</div>

<!-- Tab content -->
<div id="tab-content">
  ${tabContents.map((tc, i) => `<div class="tab-pane${i === 0 ? " active" : ""}" data-tab="${esc(tc.name)}">${tc.html}</div>`).join("")}
</div>

<!-- Overlays -->
<div id="video-overlay"></div>

<!-- Animated cursor -->
<div id="animated-cursor">
  <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 2L22 13L14.5 13L18 22L14.5 23.5L11 14.5L6 19Z" fill="white" stroke="#1a1a1a" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>
</div>
<div id="cursor-ripple"></div>

${buildIntroCardHTML(familyId, nicheId, emotionalHook || nicheData.tagline || productTitle, productTitle, dashData)}

${buildEndCardHTML(familyId, nicheId, productTitle)}

<!-- Tab bar -->
<div class="gs-tab-bar">
  <div class="nav-btns"><span>◀</span><span>▶</span><span>+</span></div>
  ${uniqueTabs.map((t, i) =>
    `<div class="tab${i === 0 ? " active" : ""}" onclick="switchTab('${esc(t.name)}')">${esc(t.name)}</div>`
  ).join("\n  ")}
</div>

<script>
function switchTab(name) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  const t = document.querySelector('.tab-pane[data-tab="' + name + '"]');
  if (t) t.classList.add('active'); else { const f = document.querySelector('.tab-pane'); if (f) f.classList.add('active'); }
  document.querySelectorAll('.gs-tab-bar .tab').forEach(x => x.classList.toggle('active', x.textContent.trim() === name));
  document.getElementById('tab-content').scrollTop = 0;
}

// Cursor animation helpers
function showCursor() {
  const c = document.getElementById('animated-cursor');
  if (c) c.style.opacity = '1';
}
function hideCursor() {
  const c = document.getElementById('animated-cursor');
  if (c) c.style.opacity = '0';
}
function moveCursor(x, y) {
  const c = document.getElementById('animated-cursor');
  if (c) { c.style.left = x + 'px'; c.style.top = y + 'px'; }
}
function clickRipple(x, y) {
  const r = document.getElementById('cursor-ripple');
  if (r) {
    r.style.left = (x - 16) + 'px';
    r.style.top = (y - 16) + 'px';
    r.classList.remove('active');
    void r.offsetWidth;
    r.classList.add('active');
  }
}
</script>
</body></html>`;
}

// ══════════════════════════════════════════════════════════════
// Data Extraction (same as factory-video-engine)
// ══════════════════════════════════════════════════════════════

function extractVideoData(
  blueprint: ProductBlueprint,
  nicheProfile: NicheDesignProfile,
  nicheData: ReturnType<typeof getNicheData>,
) {
  const dataTab = blueprint.tabs.find(t => t.sampleRows && t.sampleRows.length > 0);
  const income = nicheData.monthlyIncome || 5000;
  const expenses = Math.round(income * 0.75);

  let budgetRows = nicheData.budgetCategories.map(c => {
    const actual = Math.round(c.budgetAmount * 0.85);
    return { category: c.name, budget: formatCurrency(c.budgetAmount), actual: formatCurrency(actual), remaining: formatCurrency(c.budgetAmount - actual) };
  });

  if (dataTab?.sampleRows && dataTab.sampleRows.length > 0) {
    try {
      const result = deriveBudgetFromTransactions(dataTab.sampleRows);
      if (result.length > 0) {
        const mult = [1.15, 1.22, 1.08, 1.30, 1.18, 1.12, 1.25, 1.09];
        budgetRows = result.slice(0, 8).map((r, i) => {
          const act = parseInt(r.amount.replace(/[^0-9.-]/g, "") || "0");
          const bud = Math.round(act * (mult[i % 8] || 1.15));
          return { category: r.name, budget: formatCurrency(bud), actual: r.amount, remaining: formatCurrency(bud - act) };
        });
      }
    } catch {}
  }

  const net = income - expenses;
  const rate = income > 0 ? Math.round((net / income) * 100) : 0;

  return {
    tagline: nicheData.tagline, monthLabel: "March", monthlyIncome: formatCurrency(income),
    kpis: [
      { label: nicheData.kpiLabels[0] || "Total Income", value: formatCurrency(income), bgColor: "e8f5e9", textColor: "1b5e20" },
      { label: nicheData.kpiLabels[1] || "Total Spent", value: formatCurrency(expenses), bgColor: "fff3e0", textColor: "e65100" },
      { label: nicheData.kpiLabels[2] || "Net Savings", value: formatCurrency(net), bgColor: "e8f5e9", textColor: "1b5e20" },
      { label: nicheData.kpiLabels[3] || "Savings Rate", value: `${rate}%`, bgColor: "f3e5f5", textColor: "4a148c" },
    ],
    budgetRows,
  };
}

function extractVideoTransactions(blueprint: ProductBlueprint) {
  const dataTab = blueprint.tabs.find(t => t.sampleRows && t.sampleRows.length > 0);
  if (!dataTab?.sampleRows) return [];
  return dataTab.sampleRows.slice(0, 18).map(row => ({
    date: String(row[0] ?? ""), description: String(row[1] ?? ""), amount: String(row[2] ?? ""),
    category: String(row[4] ?? ""), subcategory: String(row[3] ?? ""), bucket: String(row[5] ?? ""),
  }));
}

// ══════════════════════════════════════════════════════════════
// Content Builders
// ══════════════════════════════════════════════════════════════

function buildDashboardHTML(
  data: ReturnType<typeof extractVideoData>,
  np: NicheDesignProfile,
  savingsGoals: ReturnType<typeof getNicheSavingsGoals>,
): string {
  const familyId = getLayoutFamilyId(np.id);
  const sectionBg = np.spreadsheetTokens.sectionBg || "334155";
  const sectionText = np.spreadsheetTokens.sectionText || "f8fafc";
  const headerBg = np.spreadsheetTokens.headerBg || "e2e8f0";
  const totalsBg = np.spreadsheetTokens.totalsBg || "e2e8f0";

  const totalBudget = data.budgetRows.reduce((s, r) => s + parseInt(r.budget.replace(/[^0-9.-]/g, "") || "0"), 0);
  const totalActual = data.budgetRows.reduce((s, r) => s + parseInt(r.actual.replace(/[^0-9.-]/g, "") || "0"), 0);

  // ── Executive: Horizontal KPI strip (Revenue | Expenses | Net Profit | Margin) + dense cost breakdown
  if (familyId === "executive") {
    return `<table class="grid-table"><thead>
    <tr><th style="width:32px"></th>${"ABCDEFGHIJ".split("").map(c => `<th>${c}</th>`).join("")}</tr>
  </thead><tbody>
    <tr class="title-row"><td class="row-num">1</td><td colspan="10">${esc(data.tagline)}</td></tr>
    <tr><td class="row-num">2</td><td colspan="10" style="height:4px;"></td></tr>
    <tr><td class="row-num">3</td><td></td><td colspan="2" style="text-align:right;font-weight:600;font-size:10px;">PERIOD:</td><td style="font-weight:600;">${esc(data.monthLabel)}</td><td colspan="6"></td></tr>
    <tr><td class="row-num">4</td><td colspan="10" style="height:4px;"></td></tr>
    <tr><td class="row-num">5</td>${data.kpis.map(k => `<td colspan="2" class="kpi-label" style="background:#${k.bgColor};color:#${k.textColor};font-size:9px;letter-spacing:1.5px;">${esc(k.label)}</td>`).join("")}<td colspan="2"></td></tr>
    <tr><td class="row-num">6</td>${data.kpis.map(k => `<td colspan="2" class="kpi-value" style="background:#${k.bgColor};color:#${k.textColor};font-size:22px;">${esc(k.value)}</td>`).join("")}<td colspan="2"></td></tr>
    <tr><td class="row-num">7</td><td colspan="10" style="height:4px;"></td></tr>
    <tr class="section-header"><td class="row-num">8</td><td colspan="10" style="background:#${sectionBg};color:#${sectionText};">COST BREAKDOWN</td></tr>
    <tr class="data-header"><td class="row-num">9</td><td colspan="3" style="background:#${headerBg};">Category</td><td colspan="2" style="background:#${headerBg};text-align:right;">Budget</td><td colspan="2" style="background:#${headerBg};text-align:right;">Actual</td><td colspan="3" style="background:#${headerBg};text-align:right;">Variance</td></tr>
    ${data.budgetRows.map((row, i) => {
      const alt = i % 2 === 1 ? ' class="alt-row"' : "";
      return `<tr${alt}><td class="row-num">${10 + i}</td><td colspan="3">${esc(row.category)}</td><td colspan="2" style="text-align:right;">${esc(row.budget)}</td><td colspan="2" style="text-align:right;">${esc(row.actual)}</td><td colspan="3" style="text-align:right;">${esc(row.remaining)}</td></tr>`;
    }).join("")}
    <tr class="totals"><td class="row-num">${10 + data.budgetRows.length}</td><td colspan="3" style="background:#${totalsBg};font-weight:700;">TOTAL</td><td colspan="2" style="text-align:right;background:#${totalsBg};font-weight:700;">${formatCurrency(totalBudget)}</td><td colspan="2" style="text-align:right;background:#${totalsBg};font-weight:700;">${formatCurrency(totalActual)}</td><td colspan="3" style="text-align:right;background:#${totalsBg};font-weight:700;">${formatCurrency(totalBudget - totalActual)}</td></tr>
    ${Array.from({ length: 10 }, (_, i) => `<tr><td class="row-num">${11 + data.budgetRows.length + i}</td>${"<td></td>".repeat(10)}</tr>`).join("")}
  </tbody></table>`;
  }

  // ── Editorial/Wedding: Elegant centered budget cards (Total Budget | Spent | Remaining)
  if (familyId === "editorial") {
    // Show 3 large centered KPIs, then a cleaner category table below
    const kpi0 = data.kpis[0] || { label: "Total Budget", value: formatCurrency(totalBudget), bgColor: "e8f5e9", textColor: "1b5e20" };
    const kpi1 = data.kpis[1] || { label: "Spent", value: formatCurrency(totalActual), bgColor: "fff3e0", textColor: "e65100" };
    const kpi2 = data.kpis[2] || { label: "Remaining", value: formatCurrency(totalBudget - totalActual), bgColor: "e8f5e9", textColor: "1b5e20" };
    return `<table class="grid-table"><thead>
    <tr><th style="width:32px"></th>${"ABCDEFGHIJ".split("").map(c => `<th>${c}</th>`).join("")}</tr>
  </thead><tbody>
    <tr class="title-row"><td class="row-num">1</td><td colspan="10">${esc(data.tagline)}</td></tr>
    <tr><td class="row-num">2</td><td colspan="10" style="height:8px;"></td></tr>
    <tr><td class="row-num">3</td><td></td><td colspan="2" style="text-align:center;font-weight:600;font-size:10px;letter-spacing:2px;">MONTH</td><td style="font-weight:600;text-align:center;">${esc(data.monthLabel)}</td><td colspan="6"></td></tr>
    <tr><td class="row-num">4</td><td colspan="10" style="height:8px;"></td></tr>
    <tr><td class="row-num">5</td><td></td><td colspan="2" class="kpi-label" style="background:#${kpi0.bgColor};color:#${kpi0.textColor};text-align:center;">${esc(kpi0.label)}</td><td></td><td colspan="2" class="kpi-label" style="background:#${kpi1.bgColor};color:#${kpi1.textColor};text-align:center;">${esc(kpi1.label)}</td><td></td><td colspan="2" class="kpi-label" style="background:#${kpi2.bgColor};color:#${kpi2.textColor};text-align:center;">${esc(kpi2.label)}</td><td></td></tr>
    <tr><td class="row-num">6</td><td></td><td colspan="2" class="kpi-value" style="background:#${kpi0.bgColor};color:#${kpi0.textColor};text-align:center;font-size:24px;">${esc(kpi0.value)}</td><td></td><td colspan="2" class="kpi-value" style="background:#${kpi1.bgColor};color:#${kpi1.textColor};text-align:center;font-size:24px;">${esc(kpi1.value)}</td><td></td><td colspan="2" class="kpi-value" style="background:#${kpi2.bgColor};color:#${kpi2.textColor};text-align:center;font-size:24px;">${esc(kpi2.value)}</td><td></td></tr>
    <tr><td class="row-num">7</td><td colspan="10" style="height:10px;"></td></tr>
    <tr class="section-header"><td class="row-num">8</td><td colspan="10" style="background:#${sectionBg};color:#${sectionText};">BUDGET BREAKDOWN</td></tr>
    <tr class="data-header"><td class="row-num">9</td><td colspan="3" style="background:#${headerBg};">Category</td><td colspan="2" style="background:#${headerBg};text-align:right;">Budget</td><td colspan="2" style="background:#${headerBg};text-align:right;">Actual</td><td colspan="3" style="background:#${headerBg};text-align:right;">Remaining</td></tr>
    ${data.budgetRows.map((row, i) => {
      const alt = i % 2 === 1 ? ' class="alt-row"' : "";
      return `<tr${alt}><td class="row-num">${10 + i}</td><td colspan="3">${esc(row.category)}</td><td colspan="2" style="text-align:right;">${esc(row.budget)}</td><td colspan="2" style="text-align:right;">${esc(row.actual)}</td><td colspan="3" style="text-align:right;">${esc(row.remaining)}</td></tr>`;
    }).join("")}
    <tr class="totals"><td class="row-num">${10 + data.budgetRows.length}</td><td colspan="3" style="background:#${totalsBg};font-weight:700;">TOTAL</td><td colspan="2" style="text-align:right;background:#${totalsBg};font-weight:700;">${formatCurrency(totalBudget)}</td><td colspan="2" style="text-align:right;background:#${totalsBg};font-weight:700;">${formatCurrency(totalActual)}</td><td colspan="3" style="text-align:right;background:#${totalsBg};font-weight:700;">${formatCurrency(totalBudget - totalActual)}</td></tr>
    ${Array.from({ length: 12 }, (_, i) => `<tr><td class="row-num">${11 + data.budgetRows.length + i}</td>${"<td></td>".repeat(10)}</tr>`).join("")}
  </tbody></table>`;
  }

  // ── Nurture (default): 2x2 KPI grid (Income | Baby Costs | Net Savings | Rate) + spending + savings goals
  return `<table class="grid-table"><thead>
    <tr><th style="width:32px"></th>${"ABCDEFGHIJ".split("").map(c => `<th>${c}</th>`).join("")}</tr>
  </thead><tbody>
    <tr class="title-row"><td class="row-num">1</td><td colspan="10">${esc(data.tagline)}</td></tr>
    <tr><td class="row-num">2</td><td colspan="10" style="height:6px;"></td></tr>
    <tr><td class="row-num">3</td><td></td><td colspan="2" style="text-align:right;font-weight:600;font-size:10px;">SELECT MONTH:</td><td style="font-weight:600;">${esc(data.monthLabel)}</td><td></td><td colspan="2" style="text-align:right;font-weight:600;font-size:10px;">MONTHLY INCOME:</td><td style="font-weight:600;background:#e8f5e9;border-radius:3px;">${esc(data.monthlyIncome)}</td><td colspan="2"></td></tr>
    <tr><td class="row-num">4</td><td colspan="10" style="height:6px;"></td></tr>
    <tr><td class="row-num">5</td><td></td>${data.kpis.slice(0, 2).map(k => `<td colspan="2" class="kpi-label" style="background:#${k.bgColor};color:#${k.textColor};">${esc(k.label)}</td>`).join("<td></td>")}<td colspan="3"></td></tr>
    <tr><td class="row-num">6</td><td></td>${data.kpis.slice(0, 2).map(k => `<td colspan="2" class="kpi-value" style="background:#${k.bgColor};color:#${k.textColor};">${esc(k.value)}</td>`).join("<td></td>")}<td colspan="3"></td></tr>
    <tr><td class="row-num">7</td><td></td>${data.kpis.slice(2, 4).map(k => `<td colspan="2" class="kpi-label" style="background:#${k.bgColor};color:#${k.textColor};">${esc(k.label)}</td>`).join("<td></td>")}<td colspan="3"></td></tr>
    <tr><td class="row-num">8</td><td></td>${data.kpis.slice(2, 4).map(k => `<td colspan="2" class="kpi-value" style="background:#${k.bgColor};color:#${k.textColor};">${esc(k.value)}</td>`).join("<td></td>")}<td colspan="3"></td></tr>
    <tr><td class="row-num">9</td><td colspan="10" style="height:6px;"></td></tr>
    <tr class="section-header"><td class="row-num">10</td><td colspan="5" style="background:#${sectionBg};color:#${sectionText};">SPENDING BY CATEGORY</td><td colspan="5" style="background:#${sectionBg};color:#${sectionText};">SAVINGS GOALS</td></tr>
    <tr class="data-header"><td class="row-num">11</td><td colspan="2" style="background:#${headerBg};">Category</td><td style="background:#${headerBg};text-align:right;">Budget</td><td style="background:#${headerBg};text-align:right;">Actual</td><td style="background:#${headerBg};text-align:right;">Remaining</td><td colspan="2" style="background:#${headerBg};">Goal</td><td style="background:#${headerBg};text-align:right;">Target</td><td style="background:#${headerBg};text-align:right;">Saved</td><td style="background:#${headerBg};text-align:right;">Progress</td></tr>
    ${data.budgetRows.map((row, i) => {
      const goal = savingsGoals[i];
      const alt = i % 2 === 1 ? ' class="alt-row"' : "";
      return `<tr${alt}><td class="row-num">${12 + i}</td><td colspan="2">${esc(row.category)}</td><td style="text-align:right;">${esc(row.budget)}</td><td style="text-align:right;">${esc(row.actual)}</td><td style="text-align:right;">${esc(row.remaining)}</td>${goal ? `<td colspan="2">${esc(goal.name)}</td><td style="text-align:right;">${esc(goal.target)}</td><td style="text-align:right;">${esc(goal.saved)}</td><td style="text-align:right;">${esc(goal.progress)}</td>` : `<td colspan="5"></td>`}</tr>`;
    }).join("")}
    <tr class="totals"><td class="row-num">${12 + data.budgetRows.length}</td><td colspan="2" style="background:#${totalsBg};font-weight:700;">TOTAL</td><td style="text-align:right;background:#${totalsBg};font-weight:700;">${formatCurrency(totalBudget)}</td><td style="text-align:right;background:#${totalsBg};font-weight:700;">${formatCurrency(totalActual)}</td><td style="text-align:right;background:#${totalsBg};font-weight:700;">${formatCurrency(totalBudget - totalActual)}</td><td colspan="5"></td></tr>
    ${Array.from({ length: 10 }, (_, i) => `<tr><td class="row-num">${13 + data.budgetRows.length + i}</td>${"<td></td>".repeat(10)}</tr>`).join("")}
  </tbody></table>`;
}

function buildTransactionHTML(
  rows: ReturnType<typeof extractVideoTransactions>,
  np: NicheDesignProfile,
): string {
  const accent = np.palette.accent || "#34A853";
  const headerBg = np.spreadsheetTokens.headerBg || "e2e8f0";
  const cols = ["Date", "Description", "Amount", "Sub-Category", "Category", "Bucket"];

  return `<table class="grid-table"><thead>
    <tr><th style="width:32px"></th>${"ABCDEFG".split("").map(c => `<th>${c}</th>`).join("")}</tr>
  </thead><tbody>
    <tr class="title-row"><td class="row-num">1</td><td colspan="7" style="background:${accent};color:white;text-align:center;font-weight:600;">${rows.length > 0 ? rows[0].date.slice(0, 7) || "2026-01" : "2026-01"}</td></tr>
    <tr><td class="row-num">2</td><td colspan="7" style="height:6px;"></td></tr>
    <tr class="data-header"><td class="row-num">3</td>${cols.map(c => `<td style="background:#${headerBg};font-weight:600;">${c}</td>`).join("")}<td></td></tr>
    ${rows.map((row, i) => {
      const alt = i % 2 === 1 ? ' class="alt-row"' : "";
      return `<tr${alt}><td class="row-num">${4 + i}</td><td>${esc(row.date)}</td><td>${esc(row.description)}</td><td style="text-align:right;">${esc(row.amount)}</td><td>${esc(row.subcategory)}</td><td>${esc(row.category)}</td><td>${esc(row.bucket)}</td><td></td></tr>`;
    }).join("")}
    ${Array.from({ length: 15 }, (_, i) => `<tr><td class="row-num">${4 + rows.length + i}</td>${"<td></td>".repeat(7)}</tr>`).join("")}
  </tbody></table>`;
}

function buildGenericTabHTML(tab: BlueprintTab, np: NicheDesignProfile): string {
  const accent = np.palette.accent || "#34A853";
  const headerBg = np.spreadsheetTokens.headerBg || "e2e8f0";
  const cols = (tab.columns?.slice(0, 6).map(c => typeof c === "string" ? c : c.name) || ["A", "B", "C", "D", "E", "F"]) as string[];
  const letters = "ABCDEFGHIJ".split("").slice(0, cols.length + 1);

  return `<table class="grid-table"><thead>
    <tr><th style="width:32px"></th>${letters.map(c => `<th>${c}</th>`).join("")}</tr>
  </thead><tbody>
    <tr class="title-row"><td class="row-num">1</td><td colspan="${cols.length + 1}" style="background:${accent};color:white;text-align:center;font-weight:600;">${esc(tab.name)}</td></tr>
    <tr><td class="row-num">2</td><td colspan="${cols.length + 1}" style="height:6px;"></td></tr>
    <tr class="data-header"><td class="row-num">3</td>${cols.map(c => `<td style="background:#${headerBg};font-weight:600;">${esc(c)}</td>`).join("")}<td></td></tr>
    ${Array.from({ length: 25 }, (_, i) => `<tr><td class="row-num">${4 + i}</td>${"<td></td>".repeat(cols.length + 1)}</tr>`).join("")}
  </tbody></table>`;
}

// ══════════════════════════════════════════════════════════════
// Intro & End Card Builders — Family-specific content
// ══════════════════════════════════════════════════════════════

function buildIntroCardHTML(
  familyId: LayoutFamilyId,
  nicheId: string,
  hookText: string,
  productTitle: string,
  dashData: ReturnType<typeof extractVideoData>,
): string {
  if (familyId === "executive") {
    // Executive: No emoji, sharp data-focused intro with KPI number preview
    return `<div id="intro-card">
  <div class="hook">${esc(hookText)}</div>
  <div class="sub">Data-driven decisions start here.</div>
  <div class="kpi-preview">
    ${dashData.kpis.slice(0, 3).map(k => `<div class="kp"><div class="num">${esc(k.value)}</div><div class="lbl">${esc(k.label)}</div></div>`).join("")}
  </div>
  <div class="badge">${esc(productTitle)}</div>
</div>`;
  }

  if (familyId === "editorial") {
    // Editorial: Elegant serif, romantic/aspirational emoji, cream gradient
    const emoji = nicheId === "wedding-planner" ? "💍" : nicheId === "travel-planner" ? "✈️" : "✨";
    const subtitle = nicheId === "wedding-planner"
      ? "Your perfect day, perfectly planned."
      : nicheId === "travel-planner"
      ? "Adventure awaits."
      : "Elevate your planning.";
    return `<div id="intro-card">
  <div style="font-size:48px;margin-bottom:18px;">${emoji}</div>
  <div class="hook">${esc(hookText)}</div>
  <div class="sub">${esc(subtitle)}</div>
  <div class="badge">${esc(productTitle)}</div>
</div>`;
  }

  // Nurture: Warm emoji, reassuring subtitle, soft gradient
  const emoji = nicheId === "baby-budget" || nicheId === "pregnancy-planner" ? "👶" : "💰";
  const subtitle = nicheId === "baby-budget" || nicheId === "pregnancy-planner"
    ? "You've got this, mama."
    : "There's a calmer way to budget.";
  return `<div id="intro-card">
  <div style="font-size:56px;margin-bottom:18px;">${emoji}</div>
  <div class="hook">${esc(hookText)}</div>
  <div class="sub">${esc(subtitle)}</div>
  <div class="badge">${esc(productTitle)}</div>
</div>`;
}

function buildEndCardHTML(
  familyId: LayoutFamilyId,
  nicheId: string,
  productTitle: string,
): string {
  if (familyId === "executive") {
    return `<div id="end-card">
  <div class="title">${esc(productTitle)}</div>
  <div class="sub">Know your numbers. Grow your business.</div>
  <div class="cta-btn">⬇ Download Now</div>
  <div class="trust">Instant Delivery · Lifetime Access · Works in Google Sheets</div>
</div>`;
  }

  if (familyId === "editorial") {
    const cta = nicheId === "wedding-planner"
      ? "Plan your dream day."
      : nicheId === "travel-planner"
      ? "Plan smarter. Travel better."
      : "Organize beautifully.";
    return `<div id="end-card">
  <div class="title">${esc(productTitle)}</div>
  <div class="sub">${esc(cta)}</div>
  <div class="cta-btn">⬇ Download Now</div>
  <div class="trust">Instant Delivery · Lifetime Access · Works in Google Sheets</div>
</div>`;
  }

  // Nurture
  return `<div id="end-card">
  <div class="title">${esc(productTitle)}</div>
  <div class="sub">Start planning with confidence.</div>
  <div class="cta-btn">⬇ Download Now</div>
  <div class="trust">Instant Delivery · Lifetime Access · Works in Google Sheets</div>
</div>`;
}

// ── Helpers ──────────────────────────────────────────────────

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
