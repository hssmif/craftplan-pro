#!/usr/bin/env npx tsx
/**
 * End-to-End Spec Chain Validator
 *
 * Runs the full factory pipeline for 5 niches and compares outputs.
 * Tests whether the Gemini-first spec chain is materially affecting results.
 */

const BASE = "http://localhost:3461";

interface NicheTest {
  nicheId: string;
  label: string;
  competitorTitle: string;
  tags: string[];
  price: number;
  niche: string;
}

const NICHES: NicheTest[] = [
  {
    nicheId: "wedding",
    label: "Wedding Planner",
    competitorTitle: "Wedding Budget Planner Google Sheets, Wedding Planner Spreadsheet, Wedding Budget Tracker",
    tags: ["wedding budget", "wedding planner", "bridal budget"],
    price: 14.99,
    niche: "wedding-planner",
  },
  {
    nicheId: "baby",
    label: "Baby Budget",
    competitorTitle: "Baby Budget Tracker Google Sheets, New Parent Finance Planner, Baby Expense Tracker",
    tags: ["baby budget", "new parent", "baby expenses"],
    price: 11.97,
    niche: "baby-budget",
  },
  {
    nicheId: "business",
    label: "Business P&L",
    competitorTitle: "Small Business P&L Tracker Google Sheets, Profit Loss Statement Template",
    tags: ["business budget", "profit loss", "small business"],
    price: 15.97,
    niche: "business-pl",
  },
  {
    nicheId: "paycheck",
    label: "Paycheck Budget",
    competitorTitle: "Paycheck Budget Planner Google Sheets, Bi-Weekly Budget Template",
    tags: ["paycheck budget", "biweekly budget", "pay period planner"],
    price: 9.97,
    niche: "paycheck-budget",
  },
  {
    nicheId: "travel",
    label: "Travel Planner",
    competitorTitle: "Travel Budget Planner Google Sheets, Vacation Expense Tracker Spreadsheet",
    tags: ["travel budget", "vacation planner", "trip expenses"],
    price: 12.97,
    niche: "travel-planner",
  },
];

// ── API Helpers ──────────────────────────────────────────

async function apiFetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => "unknown");
    throw new Error(`${path}: HTTP ${resp.status} — ${err.slice(0, 300)}`);
  }
  return resp.json() as Promise<T>;
}

// ── Spec Extraction Helpers ──────────────────────────────

function extractSpecSummary(bp: Record<string, unknown>) {
  const concept = bp.conceptSpec as Record<string, unknown> | undefined;
  const structure = bp.structureSpec as Record<string, unknown> | undefined;
  const visual = bp.visualDirection as Record<string, unknown> | undefined;
  const video = bp.videoDirection as Record<string, unknown> | undefined;
  const positioning = bp.listingPositioning as Record<string, unknown> | undefined;
  const copy = bp.copyDirection as Record<string, unknown> | undefined;

  return {
    specsPresent: {
      concept: !!concept,
      structure: !!structure,
      visual: !!visual,
      video: !!video,
      positioning: !!positioning,
      copy: !!copy,
      total: [concept, structure, visual, video, positioning, copy].filter(Boolean).length,
    },
    concept: concept ? {
      targetCustomer: concept.targetCustomer,
      productPromise: concept.productPromise,
      uniqueAngle: concept.uniqueAngle,
      emotionalHook: concept.emotionalHook,
      suggestedTitle: concept.suggestedTitle,
      niche: concept.niche,
      pricePositioning: concept.pricePositioning,
    } : null,
    structure: structure ? {
      title: structure.title,
      productType: structure.productType,
      tabCount: ((structure.sheets as Record<string, unknown>)?.tabs as unknown[])?.length || 0,
      tabNames: ((structure.sheets as Record<string, unknown>)?.tabs as Array<{name: string}>)?.map(t => t.name) || [],
      chartCount: ((structure.sheets as Record<string, unknown>)?.charts as unknown[])?.length || 0,
      colorPrimary: ((structure.sheets as Record<string, unknown>)?.colorScheme as Record<string, unknown>)?.primary,
      dashboardStyle: (structure.sheets as Record<string, unknown>)?.dashboardStyle,
    } : null,
    visual: visual ? {
      heroLayout: (visual.hero as Record<string, unknown>)?.layout,
      heroMockupType: (visual.hero as Record<string, unknown>)?.mockupType,
      problemLayout: (visual.problem as Record<string, unknown>)?.layout,
      methodLayout: (visual.method as Record<string, unknown>)?.layout,
      includedCardStyle: (visual.included as Record<string, unknown>)?.cardStyle,
      deliveryLayout: (visual.delivery as Record<string, unknown>)?.layout,
      typography: (visual.typography as Record<string, unknown>)?.headingStyle,
    } : null,
    video: video ? {
      durationSec: video.totalDurationSec,
      sceneCount: (video.scenes as unknown[])?.length || 0,
      musicMood: video.musicMood,
      pacing: video.pacing,
      openingStyle: video.openingStyle,
      closingStyle: video.closingStyle,
      transitionDefault: video.transitionDefault,
    } : null,
    positioning: positioning ? {
      primaryBenefit: positioning.primaryBenefit,
      hookAngle: positioning.hookAngle,
      socialProofAngle: positioning.socialProofAngle,
      categoryPosition: positioning.categoryPosition,
      seoKeywords: (positioning.seoKeywords as string[])?.slice(0, 5),
    } : null,
    copy: copy ? {
      tone: copy.tone,
      sentenceStyle: copy.sentenceStyle,
      ctaStyle: copy.ctaStyle,
      emojiStyle: copy.emojiStyle,
      titleFormat: copy.titleFormat,
      descriptionStructure: copy.descriptionStructure,
      brandVoice: copy.brandVoice,
    } : null,
  };
}

function extractBlueprintStructure(bp: Record<string, unknown>) {
  const tabs = bp.tabs as Array<{ name: string; purpose: string; columns?: unknown[] }> || [];
  const charts = bp.charts as Array<{ title: string; type: string }> || [];
  const colorScheme = bp.colorScheme as Record<string, unknown>;

  return {
    tabCount: tabs.length,
    tabNames: tabs.map(t => t.name),
    tabPurposes: tabs.map(t => `${t.name}: ${t.purpose}`),
    chartCount: charts.length,
    charts: charts.map(c => `${c.title} (${c.type})`),
    colorPrimary: colorScheme?.primary,
    colorAccent: colorScheme?.accent,
    suggestedPrice: bp.suggestedPrice,
    positioning: bp.positioning,
  };
}

// ── Main Runner ──────────────────────────────────────────

interface NicheResult {
  nicheId: string;
  label: string;
  specs: ReturnType<typeof extractSpecSummary>;
  blueprintStructure: ReturnType<typeof extractBlueprintStructure>;
  imagePlan: {
    imageCount: number;
    images: Array<{ slot: number; kind: string; title: string; subtitle?: string }>;
    rendered: boolean;
    renderStats?: Record<string, unknown>;
  } | null;
  listingCopy: {
    recommendedTitle: string;
    tagCount: number;
    tags: string[];
    shortHook: string;
    descriptionLength: number;
    pricing: Record<string, unknown>;
  } | null;
  video: {
    success: boolean;
    durationSec?: number;
    sceneCount?: number;
  } | null;
  errors: string[];
  timings: Record<string, number>;
}

async function runNiche(test: NicheTest): Promise<NicheResult> {
  const result: NicheResult = {
    nicheId: test.nicheId,
    label: test.label,
    specs: {} as any,
    blueprintStructure: {} as any,
    imagePlan: null,
    listingCopy: null,
    video: null,
    errors: [],
    timings: {},
  };

  const runId = `val_${test.nicheId}_${Date.now()}`;

  // ── Phase 1: Blueprint ──
  console.log(`  [${test.nicheId}] Generating blueprint...`);
  let t = Date.now();
  let bp: Record<string, unknown>;
  try {
    const bpResult = await apiFetch<{ blueprint: Record<string, unknown> }>("/api/factory/blueprint", {
      title: test.competitorTitle,
      tags: test.tags,
      price: test.price,
      niche: test.niche,
      factoryRunId: runId,
    });
    bp = bpResult.blueprint;
    result.timings.blueprint = Date.now() - t;
    result.specs = extractSpecSummary(bp);
    result.blueprintStructure = extractBlueprintStructure(bp);
    console.log(`  [${test.nicheId}] Blueprint done (${result.timings.blueprint}ms) — ${result.specs.specsPresent.total}/6 specs`);
  } catch (err) {
    result.errors.push(`Blueprint: ${(err as Error).message}`);
    console.error(`  [${test.nicheId}] Blueprint FAILED:`, (err as Error).message.slice(0, 100));
    return result;
  }

  const blueprintId = bp.id as string;

  // ── Phase 2: Listing Images ──
  console.log(`  [${test.nicheId}] Generating listing images...`);
  t = Date.now();
  try {
    const imgResult = await apiFetch<{
      plan?: { images?: Array<{ slot: number; kind: string; title: string; subtitle?: string }> };
      rendered?: boolean;
      renderStats?: Record<string, unknown>;
    }>("/api/factory/listing-images", {
      blueprintId,
      render: true,
    });
    result.timings.images = Date.now() - t;
    result.imagePlan = {
      imageCount: imgResult.plan?.images?.length || 0,
      images: imgResult.plan?.images || [],
      rendered: imgResult.rendered || false,
      renderStats: imgResult.renderStats,
    };
    console.log(`  [${test.nicheId}] Images done (${result.timings.images}ms) — ${result.imagePlan.imageCount} images, rendered=${result.imagePlan.rendered}`);
  } catch (err) {
    result.errors.push(`Images: ${(err as Error).message.slice(0, 200)}`);
    result.timings.images = Date.now() - t;
    console.error(`  [${test.nicheId}] Images FAILED:`, (err as Error).message.slice(0, 100));
  }

  // ── Phase 3: Listing Copy ──
  console.log(`  [${test.nicheId}] Generating listing copy...`);
  t = Date.now();
  try {
    const copyResult = await apiFetch<{ listing?: Record<string, unknown> }>("/api/factory/listing-copy", {
      blueprintId,
    });
    const listing = copyResult.listing || {};
    result.timings.copy = Date.now() - t;
    result.listingCopy = {
      recommendedTitle: listing.recommendedTitle as string || "",
      tagCount: (listing.tags as string[])?.length || 0,
      tags: (listing.tags as string[]) || [],
      shortHook: listing.shortHook as string || "",
      descriptionLength: (listing.fullDescription as string)?.length || 0,
      pricing: listing.pricing as Record<string, unknown> || {},
    };
    console.log(`  [${test.nicheId}] Copy done (${result.timings.copy}ms) — title: "${result.listingCopy.recommendedTitle.slice(0, 60)}..."`);
  } catch (err) {
    result.errors.push(`Copy: ${(err as Error).message.slice(0, 200)}`);
    result.timings.copy = Date.now() - t;
    console.error(`  [${test.nicheId}] Copy FAILED:`, (err as Error).message.slice(0, 100));
  }

  // ── Phase 4: Video ──
  console.log(`  [${test.nicheId}] Generating video...`);
  t = Date.now();
  try {
    const videoResult = await apiFetch<{
      success: boolean;
      video?: { durationSec: number; sceneCount: number };
    }>("/api/factory/listing-video", {
      blueprintId,
    });
    result.timings.video = Date.now() - t;
    result.video = {
      success: videoResult.success,
      durationSec: videoResult.video?.durationSec,
      sceneCount: videoResult.video?.sceneCount,
    };
    console.log(`  [${test.nicheId}] Video done (${result.timings.video}ms) — ${result.video.sceneCount} scenes, ${result.video.durationSec}s`);
  } catch (err) {
    result.errors.push(`Video: ${(err as Error).message.slice(0, 200)}`);
    result.timings.video = Date.now() - t;
    console.error(`  [${test.nicheId}] Video FAILED:`, (err as Error).message.slice(0, 100));
  }

  return result;
}

// ── Analysis ──────────────────────────────────────────────

function analyzeResults(results: NicheResult[]) {
  console.log("\n\n" + "═".repeat(80));
  console.log("  SPEC CHAIN VALIDATION REPORT");
  console.log("═".repeat(80));

  // 1. Spec presence
  console.log("\n┌─ SPEC PRESENCE ─────────────────────────────────────────────┐");
  for (const r of results) {
    const sp = r.specs.specsPresent;
    const flags = [
      sp.concept ? "✅concept" : "❌concept",
      sp.structure ? "✅structure" : "❌structure",
      sp.visual ? "✅visual" : "❌visual",
      sp.video ? "✅video" : "❌video",
      sp.positioning ? "✅positioning" : "❌positioning",
      sp.copy ? "✅copy" : "❌copy",
    ].join(" ");
    console.log(`  ${r.label.padEnd(20)} ${sp.total}/6  ${flags}`);
  }
  console.log("└─────────────────────────────────────────────────────────────┘");

  // 2. Concept Spec Differences
  console.log("\n┌─ CONCEPT SPEC COMPARISON ────────────────────────────────────┐");
  for (const r of results) {
    const c = r.specs.concept;
    if (c) {
      console.log(`\n  ── ${r.label} ──`);
      console.log(`  Target: ${c.targetCustomer}`);
      console.log(`  Promise: ${c.productPromise}`);
      console.log(`  Angle: ${c.uniqueAngle}`);
      console.log(`  Hook: ${c.emotionalHook}`);
      console.log(`  Price: ${c.pricePositioning}`);
    }
  }
  console.log("└─────────────────────────────────────────────────────────────┘");

  // 3. Structure Comparison
  console.log("\n┌─ STRUCTURE SPEC COMPARISON ──────────────────────────────────┐");
  for (const r of results) {
    const s = r.specs.structure;
    const bs = r.blueprintStructure;
    console.log(`\n  ── ${r.label} ──`);
    if (s) {
      console.log(`  [StructureSpec] Tabs(${s.tabCount}): ${s.tabNames.join(", ")}`);
      console.log(`  [StructureSpec] Charts: ${s.chartCount}, Dashboard: ${s.dashboardStyle}, Color: ${s.colorPrimary}`);
    }
    console.log(`  [Blueprint]     Tabs(${bs.tabCount}): ${bs.tabNames.join(", ")}`);
    console.log(`  [Blueprint]     Charts: ${bs.chartCount} → ${bs.charts.join(", ") || "none"}`);
    console.log(`  [Blueprint]     Color: ${bs.colorPrimary}/${bs.colorAccent}`);
  }
  console.log("└─────────────────────────────────────────────────────────────┘");

  // 4. Visual Direction Comparison
  console.log("\n┌─ VISUAL DIRECTION COMPARISON ───────────────────────────────┐");
  for (const r of results) {
    const v = r.specs.visual;
    if (v) {
      console.log(`  ${r.label.padEnd(20)} hero=${v.heroLayout}/${v.heroMockupType} problem=${v.problemLayout} method=${v.methodLayout} included=${v.includedCardStyle} delivery=${v.deliveryLayout} typo=${v.typography}`);
    }
  }
  console.log("└─────────────────────────────────────────────────────────────┘");

  // 5. Video Direction Comparison
  console.log("\n┌─ VIDEO DIRECTION COMPARISON ────────────────────────────────┐");
  for (const r of results) {
    const v = r.specs.video;
    if (v) {
      console.log(`  ${r.label.padEnd(20)} ${v.sceneCount} scenes, ${v.durationSec}s, mood=${v.musicMood}, pacing=${v.pacing}, open=${v.openingStyle}, close=${v.closingStyle}, transition=${v.transitionDefault}`);
    }
  }
  console.log("└─────────────────────────────────────────────────────────────┘");

  // 6. Copy Direction Comparison
  console.log("\n┌─ COPY DIRECTION COMPARISON ─────────────────────────────────┐");
  for (const r of results) {
    const c = r.specs.copy;
    if (c) {
      console.log(`  ${r.label.padEnd(20)} tone=${c.tone} sentence=${c.sentenceStyle} cta=${c.ctaStyle} emoji=${c.emojiStyle} title=${c.titleFormat} desc=${c.descriptionStructure}`);
      console.log(`  ${"".padEnd(20)} voice: "${c.brandVoice}"`);
    }
  }
  console.log("└─────────────────────────────────────────────────────────────┘");

  // 7. Positioning Comparison
  console.log("\n┌─ POSITIONING COMPARISON ────────────────────────────────────┐");
  for (const r of results) {
    const p = r.specs.positioning;
    if (p) {
      console.log(`\n  ── ${r.label} ──`);
      console.log(`  Benefit: ${p.primaryBenefit}`);
      console.log(`  Hook: ${p.hookAngle}`);
      console.log(`  Social: ${p.socialProofAngle}`);
      console.log(`  Category: ${p.categoryPosition}`);
      console.log(`  SEO: ${p.seoKeywords?.join(", ")}`);
    }
  }
  console.log("└─────────────────────────────────────────────────────────────┘");

  // 8. Image Plan Comparison
  console.log("\n┌─ IMAGE PLAN COMPARISON ─────────────────────────────────────┐");
  for (const r of results) {
    const img = r.imagePlan;
    if (img) {
      console.log(`\n  ── ${r.label} (${img.imageCount} images, rendered=${img.rendered}) ──`);
      for (const i of img.images) {
        console.log(`    ${i.slot}. [${i.kind}] "${i.title}" ${i.subtitle ? `— "${i.subtitle}"` : ""}`);
      }
    }
  }
  console.log("└─────────────────────────────────────────────────────────────┘");

  // 9. Listing Copy Comparison
  console.log("\n┌─ LISTING COPY COMPARISON ───────────────────────────────────┐");
  for (const r of results) {
    const lc = r.listingCopy;
    if (lc) {
      console.log(`\n  ── ${r.label} ──`);
      console.log(`  Title: "${lc.recommendedTitle}"`);
      console.log(`  Hook: "${lc.shortHook}"`);
      console.log(`  Tags(${lc.tagCount}): ${lc.tags.slice(0, 6).join(", ")}...`);
      console.log(`  Description: ${lc.descriptionLength} chars`);
      console.log(`  Pricing: ${JSON.stringify(lc.pricing)}`);
    }
  }
  console.log("└─────────────────────────────────────────────────────────────┘");

  // 10. Video Output Comparison
  console.log("\n┌─ VIDEO OUTPUT COMPARISON ───────────────────────────────────┐");
  for (const r of results) {
    const v = r.video;
    console.log(`  ${r.label.padEnd(20)} ${v ? `✅ ${v.sceneCount} scenes, ${v.durationSec}s` : "❌ failed"}`);
  }
  console.log("└─────────────────────────────────────────────────────────────┘");

  // 11. Timings
  console.log("\n┌─ TIMINGS (ms) ──────────────────────────────────────────────┐");
  console.log(`  ${"Niche".padEnd(20)} ${"Blueprint".padEnd(12)} ${"Images".padEnd(12)} ${"Copy".padEnd(12)} ${"Video".padEnd(12)} Total`);
  for (const r of results) {
    const total = Object.values(r.timings).reduce((a, b) => a + b, 0);
    console.log(`  ${r.label.padEnd(20)} ${String(r.timings.blueprint || "—").padEnd(12)} ${String(r.timings.images || "—").padEnd(12)} ${String(r.timings.copy || "—").padEnd(12)} ${String(r.timings.video || "—").padEnd(12)} ${total}`);
  }
  console.log("└─────────────────────────────────────────────────────────────┘");

  // 12. Errors
  const allErrors = results.flatMap(r => r.errors.map(e => `[${r.nicheId}] ${e}`));
  if (allErrors.length > 0) {
    console.log("\n┌─ ERRORS ────────────────────────────────────────────────────┐");
    for (const e of allErrors) {
      console.log(`  ⚠️  ${e}`);
    }
    console.log("└─────────────────────────────────────────────────────────────┘");
  }

  // ── PASS/FAIL Verdicts ──
  console.log("\n" + "═".repeat(80));
  console.log("  PASS/FAIL VERDICTS");
  console.log("═".repeat(80));

  for (const r of results) {
    console.log(`\n  ── ${r.label} ──`);
    const verdicts: string[] = [];

    // Check 1: All 6 specs present?
    const specFull = r.specs.specsPresent.total === 6;
    verdicts.push(specFull ? "  ✅ All 6 specs generated" : `  ❌ Only ${r.specs.specsPresent.total}/6 specs generated`);

    // Check 2: Niche-specific structure?
    const hasUniqueTab = r.blueprintStructure.tabNames.some(t =>
      !["Dashboard", "Setup", "Instructions", "Budget Setup"].includes(t)
    );
    verdicts.push(hasUniqueTab ? "  ✅ Spreadsheet has niche-specific tabs" : "  ❌ FAIL: Only generic tabs");

    // Check 3: Images rendered?
    const imgOk = r.imagePlan && r.imagePlan.rendered && r.imagePlan.imageCount >= 7;
    verdicts.push(imgOk ? "  ✅ 7 images rendered" : `  ❌ FAIL: ${r.imagePlan?.imageCount || 0} images, rendered=${r.imagePlan?.rendered}`);

    // Check 4: Image titles feel niche-specific?
    const imgTitles = r.imagePlan?.images.map(i => i.title).join(" ") || "";
    const nicheInImages = imgTitles.toLowerCase().includes(r.nicheId) ||
      imgTitles.toLowerCase().includes(r.label.split(" ")[0].toLowerCase());
    verdicts.push(nicheInImages ? "  ✅ Image titles reference niche" : "  ⚠️  Image titles may be generic");

    // Check 5: Copy reflects specs?
    const hasCopy = r.listingCopy && r.listingCopy.recommendedTitle.length > 20;
    verdicts.push(hasCopy ? "  ✅ Listing copy generated" : "  ❌ FAIL: No listing copy");

    // Check 6: Video generated?
    const hasVideo = r.video && r.video.success;
    verdicts.push(hasVideo ? "  ✅ Video generated" : "  ⚠️  Video failed (non-critical)");

    // Check 7: Visual direction matches niche
    const vd = r.specs.visual;
    verdicts.push(vd ? `  ✅ Visual direction: hero=${vd.heroLayout}, method=${vd.methodLayout}, included=${vd.includedCardStyle}` : "  ❌ FAIL: No visual direction");

    for (const v of verdicts) console.log(v);

    const fails = verdicts.filter(v => v.includes("❌ FAIL")).length;
    const warns = verdicts.filter(v => v.includes("⚠️")).length;
    console.log(`\n  VERDICT: ${fails === 0 ? (warns === 0 ? "✅ PASS" : "⚠️  PASS WITH WARNINGS") : "❌ FAIL"} (${fails} fails, ${warns} warnings)`);
  }

  // ── Cross-Niche Differentiation Check ──
  console.log("\n" + "═".repeat(80));
  console.log("  CROSS-NICHE DIFFERENTIATION ANALYSIS");
  console.log("═".repeat(80));

  // Check tab name uniqueness
  const allTabSets = results.map(r => new Set(r.blueprintStructure.tabNames));
  const sharedTabs = [...allTabSets[0]].filter(t => allTabSets.every(s => s.has(t)));
  const uniqueTabsByNiche = results.map(r => ({
    niche: r.label,
    unique: r.blueprintStructure.tabNames.filter(t => !sharedTabs.includes(t)),
  }));

  console.log(`\n  Shared tabs across ALL niches: ${sharedTabs.join(", ") || "none"}`);
  for (const u of uniqueTabsByNiche) {
    console.log(`  ${u.niche.padEnd(20)} Unique tabs: ${u.unique.join(", ") || "NONE ⚠️"}`);
  }

  // Check visual layout diversity
  const heroLayouts = new Set(results.map(r => r.specs.visual?.heroLayout).filter(Boolean));
  const methodLayouts = new Set(results.map(r => r.specs.visual?.methodLayout).filter(Boolean));
  const includedStyles = new Set(results.map(r => r.specs.visual?.includedCardStyle).filter(Boolean));
  const deliveryLayouts = new Set(results.map(r => r.specs.visual?.deliveryLayout).filter(Boolean));

  console.log(`\n  Visual layout diversity:`);
  console.log(`    Hero layouts:    ${heroLayouts.size} distinct  ${[...heroLayouts].join(", ")}`);
  console.log(`    Method layouts:  ${methodLayouts.size} distinct  ${[...methodLayouts].join(", ")}`);
  console.log(`    Included styles: ${includedStyles.size} distinct  ${[...includedStyles].join(", ")}`);
  console.log(`    Delivery layouts:${deliveryLayouts.size} distinct  ${[...deliveryLayouts].join(", ")}`);

  const layoutDiversity = heroLayouts.size + methodLayouts.size + includedStyles.size + deliveryLayouts.size;
  console.log(`    Total diversity score: ${layoutDiversity}/20 (${layoutDiversity >= 10 ? "✅ GOOD" : layoutDiversity >= 6 ? "⚠️  OK" : "❌ POOR"})`);

  // Check copy tone diversity
  const tones = new Set(results.map(r => r.specs.copy?.tone).filter(Boolean));
  const ctaStyles = new Set(results.map(r => r.specs.copy?.ctaStyle).filter(Boolean));
  console.log(`\n  Copy direction diversity:`);
  console.log(`    Tones: ${tones.size} distinct — ${[...tones].join(", ")}`);
  console.log(`    CTA styles: ${ctaStyles.size} distinct — ${[...ctaStyles].join(", ")}`);

  // Check video direction diversity
  const musicMoods = new Set(results.map(r => r.specs.video?.musicMood).filter(Boolean));
  const pacings = new Set(results.map(r => r.specs.video?.pacing).filter(Boolean));
  const transitions = new Set(results.map(r => r.specs.video?.transitionDefault).filter(Boolean));
  console.log(`\n  Video direction diversity:`);
  console.log(`    Music moods:  ${musicMoods.size} distinct — ${[...musicMoods].join(", ")}`);
  console.log(`    Pacings:      ${pacings.size} distinct — ${[...pacings].join(", ")}`);
  console.log(`    Transitions:  ${transitions.size} distinct — ${[...transitions].join(", ")}`);

  // ── FINAL VERDICT ──
  console.log("\n" + "═".repeat(80));
  const totalFails = results.reduce((sum, r) => {
    const v = r.specs.specsPresent.total < 5 ? 1 : 0;
    const imgFail = !r.imagePlan?.rendered ? 1 : 0;
    const copyFail = !r.listingCopy?.recommendedTitle ? 1 : 0;
    return sum + v + imgFail + copyFail;
  }, 0);

  if (totalFails === 0 && layoutDiversity >= 10) {
    console.log("  🟢 FINAL VERDICT: READY FOR NEXT PHASE");
  } else if (totalFails <= 2 && layoutDiversity >= 6) {
    console.log("  🟡 FINAL VERDICT: PARTIALLY READY — fix noted issues before proceeding");
  } else {
    console.log("  🔴 FINAL VERDICT: NOT READY — significant gaps in spec-to-output influence");
  }
  console.log(`  Total failures: ${totalFails}, Layout diversity: ${layoutDiversity}/20`);
  console.log("═".repeat(80));
}

// ── Entry Point ──────────────────────────────────────────

async function main() {
  console.log("═".repeat(80));
  console.log("  GEMINI-FIRST SPEC CHAIN — 5-NICHE END-TO-END VALIDATION");
  console.log("═".repeat(80));
  console.log(`  Date: ${new Date().toISOString()}`);
  console.log(`  Server: ${BASE}`);
  console.log(`  Niches: ${NICHES.map(n => n.nicheId).join(", ")}`);
  console.log("");

  const results: NicheResult[] = [];

  for (const niche of NICHES) {
    console.log(`\n▶ Running ${niche.label} (${niche.nicheId})...`);
    const t = Date.now();
    const result = await runNiche(niche);
    console.log(`  ✓ ${niche.label} complete in ${Date.now() - t}ms`);
    results.push(result);
  }

  analyzeResults(results);
}

main().catch(err => {
  console.error("Validation script failed:", err);
  process.exit(1);
});
