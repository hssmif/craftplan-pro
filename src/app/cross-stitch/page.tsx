"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { findNearestDMC, findNearestDMCFromLab, rgbToLab, deltaE2Lab, DMC_LAB, DMC_COLORS, PATTERN_SYMBOLS } from "@/lib/dmc-colors";
import { generateAllListingImages, generateAllListingImagesAsync } from "@/lib/cross-stitch-listing-images";
import SellerScanner from "@/components/SellerScanner";
import type { SellerStudyApplyPayload } from "@/components/SellerDeepScan";
import { computeFingerprint, findCachedPosition, savePosition } from "@/lib/frame-fingerprint";
import { saveConvertState, loadConvertState, clearConvertState } from "@/lib/convert-cache";
import { computePatternStats } from "@/lib/pattern-stats";
import { normalizeEtsyTitle } from "@/lib/listing-optimizer";
import { getTrademarkMatch } from "@/lib/trademark-filter";
import { useSettings } from "@/hooks/useSettings";
import { CrossStitchResearchHub } from "@/components/cross-stitch/ResearchHub";
import { AutoPipelinePanel, type AutoPipelineState, type AutoPipelineItem, type PipelineItemStatus } from "@/components/cross-stitch/AutoPipelinePanel";
import { OpenAICostBadge } from "@/components/OpenAICostBadge";
import { recordCost, COST } from "@/lib/openai-cost-tracker";

/* ── Types ── */
// Step 6 ("preview") is the readonly "look at the whole listing before
// I publish" summary — sits between List (where you edit copy) and
// Bulk (pipeline management). The "List on Etsy" button lives here
// now, so this is the ONLY place a listing gets published from the
// single-item flow.
type Tab = "research" | "design" | "convert" | "export" | "list" | "preview" | "bulk";
type ExportSection = "mockups" | "thumbnails" | "listing";

type BulkStage = "selected" | "prompt_ready" | "image_uploaded" | "converted" | "mockup_done" | "review" | "approved" | "listed";

interface BulkItem {
  id: string;
  trend: { title: string; description: string; mj_prompt: string; etsy_tags: string[]; urgency: string; source: string };
  stage: BulkStage;
  mjPrompt: string;
  titleOptions: string[];
  selectedTitle: string;
  suggestedPrice: string;
  tags: string;
  description: string;
  imageFile?: File;
  imagePreview?: string;
  pattern?: PatternData;
  /** Final ordered listing-image set that gets uploaded to Etsy (max 10).
   *  Mix of GPT lifestyle mockups + canvas-rendered info cards, in the same
   *  HIGHEST→LOWEST-impact order as the single-item flow. */
  mockupUrls?: string[];
  /** 6 photorealistic GPT-image-2 lifestyle mockups (hoop flat-lay, hands
   *  stitching, oval frame, macro detail, framed shelf, maker's desk). Fed
   *  to Etsy as the first 6 gallery slots — same as single-item flow. */
  gptMockups?: string[];
  /** 12s listing video data URL. Uploaded to Etsy as the listing video and
   *  included in the local customer-package zip. Non-fatal if generation
   *  fails (bulk continues without video). */
  videoDataUrl?: string;
  /** All 5 PDF variants — colour+symbols, B&W symbols, one-page colour,
   *  one-page B&W, pattern-keeper. Etsy caps digital files at 5/listing
   *  so we fill every slot, matching the single-item flow. */
  pdfBundle?: Array<{ filename: string; base64: string }>;
  /** DEPRECATED — kept for backwards compat during migration. Main PDF only
   *  (colorSymbols). New code should consult pdfBundle instead. */
  pdfBase64?: string;
  listingId?: string;
  error?: string;
  processing?: boolean;
  trademarkWarnings?: { term: string; risk: string; suggestion: string }[];
  approved?: boolean;
  reviewExpanded?: boolean;
}

interface StitchColor {
  dmc: string;
  name: string;
  hex: string;
  symbol: string;
  count: number;
}

interface PatternData {
  grid: string[][]; // grid[row][col] = DMC code
  colors: StitchColor[];
  width: number;
  height: number;
  totalStitches: number;
  /** DMC code of the aida/background color. Cells matching this are rendered
   *  UNSTITCHED in the chart (blank aida shows through) and excluded from
   *  the thread list / stitch count — matching pro-seller patterns. */
  backgroundDmc?: string;
  totalCells?: number;
  stitchedCells?: number;
  backgroundRemovedCells?: number;
  /** Selling-grade multi-page chart PDF (cover + DMC list + sections),
   *  base64-encoded.  Produced by pattern-engine/pdf_renderer.render_pattern_pdf.
   *  May be missing if the renderer failed; the UI hides the download
   *  button when absent.  Not persisted to convert-cache. */
  patternPdfB64?: string;
}

const AIDA_SENTINEL = "AIDA";
// Convert UI bounds — sliders clamp into these.  Sellers can go up to
// 180×40 if they really need it.  Defaults are 142×24 — needed to
// preserve thin text strokes, wreath leaves, and small flower petals
// on stitch-art Design renders (validated on the deer + wreath, mouse
// + flowers, and duck text test images).  Drop the sliders for
// chunkier beginner patterns.
const PATTERN_WIDTH_MIN = 80;
// 200 = the "Detailed / Text / Premium" preset upper bound.  A 2026-05-05
// width sweep on the live stitch_art pipeline (142/180/200/220 against
// the mouse + flowers + banner test image) showed 200 is the inflection
// point where banner text becomes readable, the correct rose pink (3326)
// is preserved, and 353 Peach drops to zero — without paying the extra
// cost of 220 (~26.7k stitches, marginal gains).  180 sat in a bad
// middle: pink restored but 353/3854 confetti returned in the body.
const PATTERN_WIDTH_MAX = 200;
const DEFAULT_PATTERN_WIDTH = 142;
const MAX_COLORS_MIN = 8;
const MAX_COLORS_MAX = 40;
const DEFAULT_MAX_COLORS = 24;
// Beginner / Etsy preset — calibrated against NalaAndStitch listings
// (Goose with Blue Bow 51×80 11 DMC, Pink Dancer Goose 56×98 12 DMC,
// White Swan 70×72 10 DMC, Cowgirl Goose 48×80 13 DMC).  The pattern
// across that store is 48-100 stitches wide with 7-13 DMC threads.
// Picking 80×12 hits the centre of that distribution.  A single
// preset click sets BOTH grid_size and max_colors so the resulting
// chart matches the small-batch Etsy aesthetic without the user
// having to manually drag two sliders.
const BEGINNER_PATTERN_WIDTH = 80;
const BEGINNER_MAX_COLORS = 12;

function normalizeGridValue(dmc: string | undefined | null): string {
  return typeof dmc === "string" ? dmc.trim() : "";
}

/** Treat a cell as "background / unstitched" if it's empty, the AIDA
 *  sentinel string from the python engine, or matches pattern's
 *  declared backgroundDmc.  This is the single source of truth for
 *  "should the chart skip this cell?" — keeps render code consistent. */
function isBackgroundCell(dmc: string | undefined | null, backgroundDmc?: string | null): boolean {
  const value = normalizeGridValue(dmc);
  const bg = normalizeGridValue(backgroundDmc);
  return !value || value === AIDA_SENTINEL || (!!bg && value === bg);
}

/** Content-hashed identity for a pattern. Two patterns produce the same
 *  sig iff their dimensions, palette size, stitch count AND first grid
 *  row all match — collisions require byte-identical grids, which won't
 *  happen across different designs in practice.
 *
 *  Lives at module scope (not inside the component) so a useEffect can
 *  call it without ESLint demanding it goes into the deps array.
 *
 *  Used by the listing-form invalidation effect: when the sig of the
 *  current pattern diverges from the sig stamped on the ref, the prior
 *  listTitle/Description/Tags were generated against a stale design and
 *  must be wiped before the List tab re-renders. */
function patternSignature(p: PatternData | null): string {
  if (!p) return "";
  const firstRow = Array.isArray(p.grid?.[0]) ? p.grid[0].slice(0, 24).join(",") : "";
  return `${p.width}x${p.height}-${p.colors.length}c-${p.totalStitches}s-${firstRow}`;
}

/**
/**
 * Locked retail price for every single-pattern cross-stitch listing.
 *
 * User directive: "make the listing price always 4.34 for cross stitch."
 * Every auto-apply path uses this constant instead of dynamic values
 * so a manual typo can't ship at the wrong price.
 */
const CROSS_STITCH_LISTING_PRICE = "4.34";
const CROSS_STITCH_LISTING_PRICE_NUMBER = 4.34;

interface EtsyResult {
  title: string;
  price: string;
  sales: string;
  image_url: string;
  url: string;
  tags: string[];
  // ── Competitor-intel enrichment (top-10 slice from /api/cross-stitch/research) ──
  favorites?: number;
  views?: number;
  listing_age_days?: number;
  shop_name?: string;
}

// Legacy `medianCutLab` JS quantizer was removed — Python (KMeans LAB)
// owns ALL pattern generation now.  See pattern-engine/quantize.py.


/* ── Component ── */
export default function CrossStitchPage() {
  const [activeTab, setActiveTab] = useState<Tab>("research");
  const [exportSection, setExportSection] = useState<ExportSection>("mockups");

  // Belt-and-braces redirect: the Design tab is hidden from the nav and
  // its content (Describe-design → Upload-or-render → Send-to-Convert
  // sub-nav, plus the gradient-prone preview prompts) is no longer
  // appropriate.  Any code path that lands on activeTab="design" — old
  // saved state hydrating from convert-cache, a missed call site, a
  // future regression — gets bounced to "convert" before the design
  // JSX renders.
  useEffect(() => {
    if (activeTab === "design") {
      setActiveTab("convert");
    }
  }, [activeTab]);

  /* ── Research State ── */
  const [searchQuery, setSearchQuery] = useState("cross stitch pattern");
  const [scanning, setScanning] = useState(false);
  const [etsyResults, setEtsyResults] = useState<EtsyResult[]>([]);
  // Sort state for the profittree-style product table in the Research tab.
  // Default desc by favorites — same ordering as the legacy "Top N Sellers"
  // list, so first paint matches what users were used to.
  const [tableSortCol, setTableSortCol] = useState<"price" | "sales" | "revenue" | "favorites" | "views" | "age" | "conv">("favorites");
  const [tableSortDir, setTableSortDir] = useState<"desc" | "asc">("desc");
  // Research-tab everbee.io-style nav: which sub-tab is active
  // (Radar/Listings/Shops/Tags) and which sub-filter is applied to the
  // Listings tab (All/Rising/Trending/Seasonal — chip clicks also adjust
  // tableSortCol so the table re-ranks under the chosen lens).
  const [dbTab, setDbTab] = useState<"radar" | "listings" | "shops" | "tags">("radar");
  const [dbFilter, setDbFilter] = useState<"all" | "rising" | "trending" | "seasonal">("all");
  const [trendInsights, setTrendInsights] = useState<string>("");
  const [trendSources, setTrendSources] = useState<{ source: string; icon: string; count: number; fetched: boolean; top_items: { term: string; context?: string; score?: number }[] }[]>([]);
  const [emergingTrends, setEmergingTrends] = useState<{ title: string; description: string; mj_prompt: string; etsy_tags: string[]; urgency: string; source: string }[]>([]);
  const [copiedTrendIdx, setCopiedTrendIdx] = useState<number | null>(null);
  const [opportunityScore, setOpportunityScore] = useState(0);
  const [bestTimeToList, setBestTimeToList] = useState("");
  // Niche Intelligence panel state (populated by /api/cross-stitch/research)
  const [scanAnalysis, setScanAnalysis] = useState<{
    avg_price: number;
    avg_favorites: number;
    competition_level: string;
    demand_score: number;
  } | null>(null);
  const [scanTagFreq, setScanTagFreq] = useState<{ tag: string; count: number }[]>([]);
  const [scanTotalResults, setScanTotalResults] = useState(0);
  // Flash for the "Copy Top 13" / single-tag copy buttons on the tag cloud
  const [copiedTags, setCopiedTags] = useState<string | null>(null);
  // Tracks the term of the LAST completed scan and whether it returned
  // zero hits, so the empty-state UI can distinguish "user hasn't
  // searched yet" (show generic placeholder) from "we just scanned X
  // and got nothing back" (show "no results for X" with a hint to try
  // shorter keywords). Without this, a Reddit-sourced unsearchable
  // term silently lands on the generic placeholder and the user
  // thinks the click did nothing.
  const [lastScannedTerm, setLastScannedTerm] = useState<string>("");
  const [scanCompletedEmpty, setScanCompletedEmpty] = useState(false);

  /* ── Idea bridge (from /research → here) ──
   * If the page was opened with ?ideaId=N, fetch that idea from
   * /api/research/ideas/[id] and pre-fill the search keyword so the
   * user lands on the Research tab with their selected idea ready to
   * scan. We pick the FIRST suggested keyword (Gemini already curated
   * these for Etsy search) → fall back to niche → fall back to title.
   * After consuming the param we strip it from the URL so a refresh
   * doesn't re-trigger this and clobber whatever the user typed since.
   *
   * Read window.location.search instead of useSearchParams() so we
   * don't have to wrap this 13k-line component in <Suspense>. */
  const [bridgedFromIdea, setBridgedFromIdea] = useState<string | null>(null);
  // Reference product from Research Hub "Design Similar" — shown in Convert tab
  const [refImage, setRefImage] = useState<string | null>(null);
  const [refTitle, setRefTitle] = useState<string | null>(null);
  const bridgeRanRef = useRef(false);
  useEffect(() => {
    if (bridgeRanRef.current) return;
    if (typeof window === "undefined") return;
    const ideaId = new URLSearchParams(window.location.search).get("ideaId");
    if (!ideaId) return;
    bridgeRanRef.current = true;

    (async () => {
      try {
        const r = await fetch(`/api/research/ideas/${ideaId}`, { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as {
          idea?: {
            title: string;
            niche: string | null;
            suggested_keywords: string | null;
          };
        };
        const idea = data.idea;
        if (!idea) return;

        let keywords: string[] = [];
        if (idea.suggested_keywords) {
          try {
            const parsed = JSON.parse(idea.suggested_keywords);
            if (Array.isArray(parsed)) keywords = parsed.map(String);
          } catch {
            /* ignore — fall through to niche/title */
          }
        }
        const seed = keywords[0] || idea.niche || idea.title;
        if (seed) setSearchQuery(seed);
        setBridgedFromIdea(idea.title);
        // Switch to Convert tab so the user lands ready to design
        setActiveTab("convert");
      } catch {
        /* silent — the user can still type their own query */
      } finally {
        // Strip ?ideaId from the URL so refresh doesn't re-bridge.
        const url = new URL(window.location.href);
        url.searchParams.delete("ideaId");
        window.history.replaceState({}, "", url.toString());
      }
    })();
  }, []);

  /* ── Live Pulse State (always-on intelligence, loads on mount) ──
   * Powered by /api/cross-stitch/live-pulse. Three rows:
   *   spiking  — top keywords across live sources, ranked by velocity
   *   ideas    — Gemini-synthesized product concepts cross-referenced
   *              against the spiking feed + seasonal events
   *   seasonal — next 4 events with days-until urgency */
  const [livePulse, setLivePulse] = useState<{
    spiking: { term: string; sources: string[]; context?: string; score: number }[];
    ideas: {
      title: string;
      why_now: string;
      urgency: "hot" | "rising" | "seasonal" | "evergreen";
      tags: string[];
      search_query: string;
      // Optional Etsy reference image + listing URL — populated by the
      // live-pulse route so the seller can see what this niche already
      // looks like BEFORE paying gpt-image-2 to generate their own.
      reference_image_url?: string;
      reference_listing_url?: string;
      // Optional 0–100 signal scores — rendered as small bar indicators
      // on the AI Opportunities card when the API returns them. The
      // route is allowed to omit these without breaking the UI.
      demand_score?: number;
      competition_score?: number;
    }[];
    seasonal: { event: string; days_until: number | null; urgency: string; tags: string[]; score: number }[];
  } | null>(null);
  const [pulseLoading, setPulseLoading] = useState(true);
  const [pulseFetched, setPulseFetched] = useState(false); // one-shot guard — don't re-fetch on tab switch
  // Which term is currently being scanned — used to show a per-card
  // spinner on the exact button the user clicked (Spiking / AI Opp /
  // Seasonal / Best Idea all live in the same panel, so without this
  // the user can't tell if their click did anything during the 30–45s
  // scan). Cleared when scan finishes or fails.
  const [scanningTerm, setScanningTerm] = useState<string | null>(null);
  // Scroll target for auto-scroll on scan start. Results render ~1000px
  // below the Live Pulse panel, outside the viewport — without this the
  // user clicks "Scan this" and sees no change for 30+ seconds.
  const scanResultsRef = useRef<HTMLDivElement | null>(null);

  /* ── Best Idea State (single high-confidence recommendation) ── */
  const [bestIdea, setBestIdea] = useState<{
    title: string;
    why_this: string;
    confidence: number;
    urgency: "hot" | "rising" | "seasonal" | "evergreen";
    tags: string[];
    search_query: string;
    image_prompt: string;
  } | null>(null);
  const [findingBestIdea, setFindingBestIdea] = useState(false);

  /* ── Cross Stitch Idea Engine State ──
   * Calls the global /api/research/ideas/generate route with
   * focus=cross-stitch. Same backing table as /research, but signal
   * data + Gemini prompt are scoped so every idea is a stitchable
   * pattern (no notion templates, no wall art). Results persist in
   * product_ideas — the user can later see them on /research too. */
  interface CrossStitchIdea {
    id: number;
    title: string;
    niche: string | null;
    product_type: string | null;
    why_now: string | null;
    target_buyer: string | null;
    suggested_price: number;
    demand_score: number;
    competition_score: number;
    urgency_score: number;
    confidence: number;
    signal_listings: string | null;
    suggested_tags: string | null;
    suggested_keywords: string | null;
    status: string;
  }
  const [csIdeas, setCsIdeas] = useState<CrossStitchIdea[]>([]);
  const [csIdeasGenerating, setCsIdeasGenerating] = useState(false);
  const [csIdeasError, setCsIdeasError] = useState<string | null>(null);
  const [csIdeasLoaded, setCsIdeasLoaded] = useState(false);
  // Tracks an idea→scan in flight so the card UI can show which keyword
  // is being tried during the fallback chain (Etsy zero-result auto-retry).
  const [csIdeaScanning, setCsIdeaScanning] = useState<{ ideaId: number; tried: string[] } | null>(null);

  /* ── Smart Autocomplete State ── */
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [autocompleteItems, setAutocompleteItems] = useState<{ term: string; opportunity: "green" | "yellow" | "red"; competition?: string; why?: string }[]>([]);
  const [autocompleteLoading, setAutocompleteLoading] = useState(false);
  const [autocompleteIdx, setAutocompleteIdx] = useState(-1);
  const autocompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Design State ── */
  const [designPrompt, setDesignPrompt] = useState("");
  const [designStyle, setDesignStyle] = useState<
    "cute" | "vintage" | "modern" | "sampler" | "pixel" | "nala-beginner"
  >("cute");
  const [generatedDesignUrl, setGeneratedDesignUrl] = useState<string | null>(null);
  // Second render returned by /api/cross-stitch/generate-design on the
  // paid HQ path — a clean flat-vector source for Convert.  The route
  // always emits this on HQ (decided 2026-05-01 — handing the stitch
  // preview to Convert on non-text designs caused bgDmc=null + 100%
  // fabric fill).  Null on the free Flux path and on older session
  // designs.  useDesignForConversion() prefers it over generatedDesignUrl.
  const [cleanConvertDataUrl, setCleanConvertDataUrl] = useState<string | null>(null);
  // Which engine produced `generatedDesignUrl`. Drives the UI label on
  // the result card ("Preview (free)" vs "HQ render"), and the "Upgrade
  // to HQ" button visibility — we only show it when a preview is
  // sitting there waiting to be upgraded to a paid GPT-Image-2 render.
  const [generatedDesignEngine, setGeneratedDesignEngine] = useState<"flux-free" | "gpt-image-2" | null>(null);
  // Loading flag + error surface for the text-to-image call. The
  // render takes 20–40 seconds server-side (GPT-Image-2 "medium"
  // quality) so the button needs a real spinner, not just a
  // disabled state.
  const [generatingDesign, setGeneratingDesign] = useState(false);
  // Separate flag for the FREE preview pass (Pollinations Flux) so the
  // two buttons can spin independently — user can see exactly which
  // engine is running, and we never double-fire.
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [designError, setDesignError] = useState<string | null>(null);

  /* ── Convert State ── */
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  // Opt-in flatten step for direct uploads.  Sends the current
  // sourceImage through gpt-image-2 + CLEAN_CONVERT_EDIT_PROMPT (the
  // same SOFT prompt the Design tab pipes its renders through), then
  // replaces sourceImage in-place with the flattened result.  Solves
  // the noisy-chart problem on hand-uploaded PNGs that have gradients,
  // anti-aliased text edges, or drop shadows that KMeans would otherwise
  // fragment into confetti DMC threads.  Cleared on any new source
  // selection so the button reappears for a fresh upload.
  const [isFlattening, setIsFlattening] = useState(false);
  const [hasFlattenedUpload, setHasFlattenedUpload] = useState(false);
  const [gridSize, setGridSize] = useState(DEFAULT_PATTERN_WIDTH);
  const [maxColors, setMaxColors] = useState(DEFAULT_MAX_COLORS);
  // One-shot flag: when true, the next /python-convert POST passes
  // forceSquare=true so the engine skips its aspect-aware re-quantize
  // and returns exactly gridSize × gridSize.  Set by the idea-card
  // "Design This →" handlers (best-idea + Early Trend Alerts) because
  // GPT-Image-2 sometimes composes tall subjects inside its 1024×1024
  // frame, which then triggers the bbox-aware portrait crop in
  // pipeline.py and produces unintended 74×131-style grids.  Reset to
  // false after each convert (success or error) so user photo uploads
  // keep the existing subject-fits-canvas behaviour by default.
  const [forceSquareNext, setForceSquareNext] = useState(false);
  // Simple Python engine options. Keep these fixed-on for the converter.
  const [removeBackground, setRemoveBackground] = useState(true);
  const [cleanupConfetti, setCleanupConfetti] = useState(true);
  const [useDither, setUseDither] = useState(false);
  // AI clean (gpt-image-1 pre-process) is OFF by default. Clean
  // vector-style illustrations (MJ, DALL·E, Flux) already have flat
  // colors and crisp outlines — running them through gpt-image-1
  // REDRAWS them, which can drop intentional details (catchlights,
  // blush, subtle highlights) and slightly change proportions. Turn
  // this ON for noisy photo sources where gradient flattening helps.
  const [useAiClean, setUseAiClean] = useState(false);
  // Which AI cleaner to use:
  //   "openai"  — gpt-image-1 (~$0.04/call, BEST QUALITY per user testing — default)
  //   "gemini"  — Gemini 2.5 Flash Image "Nano Banana" (~$0.003, great composition preservation)
  //   "fal"     — Fal flux/dev img2img (~$0.025/call, balanced)
  // Recraft V3 was removed because it's a vector-GENERATION engine and
  // would hallucinate colors/details/scenery even at low strength.
  // Replicate SDXL Lightning was removed because it produced off-subject outputs.
  const [aiCleanProvider, setAiCleanProvider] = useState<"openai" | "gemini" | "fal">("openai");
  const [enforceOutlines, setEnforceOutlines] = useState(false); // OPT-IN outline snap (kept for save/load back-compat)
  // Outline mode:
  //   "auto"       — detector decides based on outline-cell fraction (with
  //                  the new ornate-pattern cap that skips enforcement when
  //                  >10% of cells flag as outline, i.e. the source is a
  //                  busy pattern not a character with linework)
  //   "force-on"   — treat every dark-edge cell as outline → DMC 310 black.
  //                  For characters/cartoons with real black linework.
  //   "force-off"  — NO outline enforcement at all. For ornate/patterned
  //                  sources (kimono patterns, folk art, mandalas) where
  //                  forcing outlines welds every pattern edge into a
  //                  black cage and dissolves the colorwork.
  const [outlineMode, setOutlineMode] = useState<"auto" | "force-on" | "force-off">("auto");
  const [cleaning, setCleaning] = useState(false);
  const [cleanedImage, setCleanedImage] = useState<string | null>(null); // cache of AI-cleaned source (fed to quantizer)
  const [cleanedModel, setCleanedModel] = useState<string | null>(null); // which model cleaned it
  const [converting, setConverting] = useState(false);
  // Python pattern engine (FastAPI + NumPy + scikit-learn KMeans).  This
  // is the new quantizer replacing the JS median-cut + cell-vote pipeline.
  // The button calls /api/cross-stitch/python-convert which proxies to
  // the Python service on localhost:8000.
  const [pythonConverting, setPythonConverting] = useState(false);
  const [pythonEngineMs, setPythonEngineMs] = useState<number | null>(null);
  // Premium Convert — Real-ESRGAN 2× upscale + gpt-image-1 HIGH cleanup
  // before quantization, plus ornate-safe defaults auto-applied. ~$0.17/run.
  // Separate state from `converting` so the UI can show a distinct loading
  // label ("✨ Premium enhancing…") that tells the user why it takes longer.
  const [premiumConverting, setPremiumConverting] = useState(false);
  const [premiumPhase, setPremiumPhase] = useState<"idle" | "upscaling" | "cleaning" | "scanning" | "quantizing">("idle");
  const [premiumInfo, setPremiumInfo] = useState<{ upscaledVia: string; model: string; estimatedCost: number } | null>(null);
  const [pattern, setPattern] = useState<PatternData | null>(null);
  // ── Debug stages: captures intermediate grids during Convert so we can
  // visualize where detail gets lost in the pipeline. OFF by default
  // (capture + render costs memory). When ON, convertToPattern populates
  // debugStages with deep-copied grid snapshots + a palette legend. ──
  const [debugMode, setDebugMode] = useState(false);
  type DebugStageSnap = { label: string; grid: string[][]; description: string };
  const [debugStages, setDebugStages] = useState<{
    palette: { dmc: string; hex: string; count: number }[];
    stages: DebugStageSnap[];
    gw: number;
    gh: number;
    colorMap: Record<string, string>; // dmc → hex (for rendering)
    aidaDmc: string;
  } | null>(null);
  // ChatGPT-style finished cross-stitch render (listing hero image)
  const [renderedPreview, setRenderedPreview] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  // A/B cache: results keyed by model ID so the two buttons (gpt-image-1 /
  // gpt-image-2) can toggle between previously-generated previews without
  // re-paying for the API call. On click, if we have a cached result for
  // the requested model, we just swap `renderedPreview` to point at it.
  // Only models the user has actually clicked appear as keys.
  const [renderedPreviewsByModel, setRenderedPreviewsByModel] = useState<
    Record<string, string>
  >({});
  // Tag for the currently-displayed preview so we can badge it in the UI
  // (e.g. "Showing: gpt-image-2"). Null when no preview yet.
  const [activePreviewModel, setActivePreviewModel] = useState<string | null>(
    null
  );
  // Invalidate the A/B cache whenever the source inputs change. The
  // listing-preview render is generated from (cleanedImage || sourceImage),
  // so a change to either one means the cached renders are for a now-
  // stale input. Pattern regeneration and chart refinement do NOT
  // invalidate — those only rework the grid, not the listing preview.
  useEffect(() => {
    setRenderedPreviewsByModel({});
    setActivePreviewModel(null);
  }, [sourceImage, cleanedImage]);
  // Preview rendering mode: "chart" = flat cells + symbols + rulers (NalaAndStitch style),
  // "stitch" = realistic X-stitches on aida. Persisted to localStorage.
  const [previewMode, setPreviewMode] = useState<"chart" | "stitch">("chart");
  // Show DMC glyphs (X, +, O, #, …) inside each chart cell. Default on
  // because that's the NalaAndStitch convention every stitcher follows.
  // Toggle off for a pure flat-color view — useful when you want to evaluate
  // whether the actual color pattern is good without the per-cell symbol
  // speckle making the chart look noisy at zoom-out. Persisted.
  const [chartSymbols, setChartSymbols] = useState(true);
  useEffect(() => {
    if (gridSize < PATTERN_WIDTH_MIN) setGridSize(PATTERN_WIDTH_MIN);
    if (gridSize > PATTERN_WIDTH_MAX) setGridSize(PATTERN_WIDTH_MAX);
    if (maxColors < MAX_COLORS_MIN) setMaxColors(MAX_COLORS_MIN);
    if (maxColors > MAX_COLORS_MAX) setMaxColors(MAX_COLORS_MAX);
  }, [gridSize, maxColors]);

  /* ── Export State ── */
  const [exportingPdf, setExportingPdf] = useState(false);
  const [patternName, setPatternName] = useState("");
  const [mockupImage, setMockupImage] = useState<string | null>(null);
  const [generatingMockup, setGeneratingMockup] = useState(false);
  const [listingImages, setListingImages] = useState<string[]>([]);
  const [customHeroImage, setCustomHeroImage] = useState<string | null>(null);
  const [generatingListingImages, setGeneratingListingImages] = useState(false);

  /* ── Mockup State ── */
  const [hoopMockups, setHoopMockups] = useState<string[]>([]);
  const [generatingHoopMockups, setGeneratingHoopMockups] = useState(false);
  const [mockupTemplates, setMockupTemplates] = useState<
    {
      id: string;
      previewUrl: string;
      file: File;
      frameCorners?: { x: number; y: number }[];
      detecting?: boolean;
      detectedShape?: "circle" | "oval" | "rectangle";
      fingerprint?: string;
      cachedPos?: { x: number; y: number; scale: number; aspect: number; shape: "circle" | "oval" | "rectangle" };
    }[]
  >([]);
  const [compositedMockups, setCompositedMockups] = useState<{ name: string; dataUrl: string }[]>([]);
  const [compositing, setCompositing] = useState(false);
  const [showMjSection, setShowMjSection] = useState(false);
  const [editingMockupIdx, setEditingMockupIdx] = useState<number | null>(null);
  // GPT-image-1 mockup composer: user uploads a frame photo, we send it
  // along with the rendered cross-stitch preview to OpenAI's image edits
  // endpoint. GPT handles positioning, perspective, and lighting —
  // no manual frame detection or canvas math needed.
  const [gptMockups, setGptMockups] = useState<{ dataUrl: string }[]>([]);
  // Standalone "Generate Listing Video" preview on the Export tab.
  // Same input shape and route ternary as listOnEtsy's Step 2.5, but
  // runs on its own — lets the seller eyeball the video before
  // publishing. previewVideoUrl is a data URL (matches the response
  // shape of /api/cross-stitch/listing-video and listing-video-ai),
  // played inline via a <video> element and downloadable as MP4.
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  const [generatingPreviewVideo, setGeneratingPreviewVideo] = useState(false);
  // First 120 chars of the renderedPreview/patternPreview that produced
  // the current gptMockups. Used to detect "these mockups belong to a
  // DIFFERENT pattern" — without this key, converting a new pattern
  // (Lavender Sprigs) while an old cached batch (Duck) sits in IDB will
  // hydrate the duck mockups into the Etsy gallery for the wrong design.
  // See convert-cache.ts ConvertSnapshot.gptMockupsSourceKey for the
  // storage-side docs.
  const [gptMockupsSourceKey, setGptMockupsSourceKey] = useState<string | null>(null);
  // Derive the source key for a given data URL. 120 chars is enough of
  // the base64 prefix that two different PNGs are virtually guaranteed
  // to produce different keys (PNG header + IHDR chunk alone vary
  // byte-for-byte per image). Null-safe so callers can pass a maybe-null
  // preview without guarding at every site.
  const mockupsKeyFor = useCallback(
    (src: string | null | undefined) => (src ? src.substring(0, 120) : null),
    [],
  );
  const [gptComposing, setGptComposing] = useState(false);
  const [gptError, setGptError] = useState<string | null>(null);
  const [artPosition, setArtPosition] = useState({ x: 50, y: 50, scale: 60 }); // percent-based
  const [dragging, setDragging] = useState(false);
  const [removeBg, setRemoveBg] = useState(true);
  const [clipShape, setClipShape] = useState<"rectangle" | "circle" | "oval">("oval");
  // Portrait oval default aspect (height / width). matches typical oval frames (~4:5)
  const OVAL_ASPECT_DEFAULT = 1.25;
  // Actual aspect of the detected frame (height/width). updated on auto-fit.
  // For oval/rectangle clipping, the overlay uses this exact ratio so it fits
  // the frame regardless of how stretched the oval is.
  const [detectedAspect, setDetectedAspect] = useState(OVAL_ASPECT_DEFAULT);
  // Test-mode art: use a plain uploaded image as the "pattern" so the
  // positioning overlay is visible without running Convert (which costs money).
  const [testArtImage, setTestArtImage] = useState<string | null>(null);

  /* ── Auto-fit art overlay to detected frame ──
     When the user opens a template in the positioning editor, read its
     frameCorners (from /api/wall-art/detect-frame), compute the bbox
     center/size, guess the shape from the aspect ratio, and update
     artPosition + clipShape so the overlay snaps into the frame without
     any manual dragging. */
  // Load persisted preview mode once on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("cs-preview-mode");
      if (saved === "chart" || saved === "stitch") setPreviewMode(saved);
      const savedSym = localStorage.getItem("cs-chart-symbols");
      if (savedSym === "0") setChartSymbols(false);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("cs-preview-mode", previewMode);
      localStorage.setItem("cs-chart-symbols", chartSymbols ? "1" : "0");
    } catch {}
  }, [previewMode, chartSymbols]);

  /* ── Live Pulse: fetch always-on intelligence the first time the
   * Research tab is visited. Gated by pulseFetched so we don't re-hit
   * the endpoint when the user tabs out and back. The backend sets
   * its own Next.js route cache so repeat page loads are cheap. */
  useEffect(() => {
    if (activeTab !== "research" || pulseFetched) return;
    setPulseFetched(true);
    setPulseLoading(true);
    (async () => {
      try {
        const resp = await fetch("/api/cross-stitch/live-pulse");
        if (resp.ok) {
          const data = await resp.json();
          setLivePulse({
            spiking: data.spiking ?? [],
            ideas: data.ideas ?? [],
            seasonal: data.seasonal ?? [],
          });
        }
      } catch (err) {
        console.warn("[live-pulse] fetch failed:", err);
      } finally {
        setPulseLoading(false);
      }
    })();
  }, [activeTab, pulseFetched]);

  /* ── Smart autocomplete: debounced fetch on searchQuery change.
   * Hits /api/cross-stitch/autocomplete with the in-flight query,
   * gets back up to 8 suggestions each tagged with an opportunity
   * color based on competition + search volume. */
  useEffect(() => {
    if (activeTab !== "research") return;
    const q = searchQuery.trim();
    if (autocompleteTimerRef.current) clearTimeout(autocompleteTimerRef.current);
    if (q.length < 2) {
      setAutocompleteItems([]);
      setAutocompleteOpen(false);
      return;
    }
    autocompleteTimerRef.current = setTimeout(async () => {
      setAutocompleteLoading(true);
      try {
        const resp = await fetch(`/api/cross-stitch/autocomplete?q=${encodeURIComponent(q)}`);
        if (resp.ok) {
          const data = await resp.json();
          setAutocompleteItems(data.items ?? []);
          setAutocompleteOpen((data.items ?? []).length > 0);
          setAutocompleteIdx(-1);
        }
      } catch {
        // silent — autocomplete is progressive enhancement
      } finally {
        setAutocompleteLoading(false);
      }
    }, 220);
    return () => {
      if (autocompleteTimerRef.current) clearTimeout(autocompleteTimerRef.current);
    };
  }, [searchQuery, activeTab]);

  useEffect(() => {
    if (editingMockupIdx === null) return;
    const tpl = mockupTemplates[editingMockupIdx];
    if (!tpl || !tpl.frameCorners || tpl.frameCorners.length < 4) return;

    const xs = tpl.frameCorners.map((c) => c.x);
    const ys = tpl.frameCorners.map((c) => c.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const cx = ((minX + maxX) / 2) * 100;
    const cy = ((minY + maxY) / 2) * 100;
    const wPct = (maxX - minX) * 100;
    const hPct = (maxY - minY) * 100;
    const aspect = hPct / Math.max(wPct, 0.01); // height/width

    // Trust the server-reported shape. The offline detector classifies shape
    // using residuals against ellipse vs rectangle models. it already knows
    // the difference between an oval (aspect ~1.1) and a true circle.
    // Only fall back to aspect-based guessing when the server didn't report.
    let shape: "circle" | "oval" | "rectangle";
    if (tpl.detectedShape) {
      shape = tpl.detectedShape;
    } else {
      const nearSquare = aspect >= 0.92 && aspect <= 1.08;
      if (nearSquare) shape = "circle";
      else if ((aspect >= 1.08 && aspect <= 1.7) || (aspect >= 0.55 && aspect <= 0.92)) shape = "oval";
      else shape = "rectangle";
    }

    // Fill the entire detected opening. The overlay container matches the
    // opening's size AND shape (ellipse for oval/circle, rect for rectangle),
    // and the art uses `contain` to fit inside without distortion. For oval
    // frames with square art, fabric naturally shows at the narrow axis -
    // that's physically accurate and matches how real framed art looks.
    //
    // 0.98 safety margin since flood-fill detection is pixel-accurate.
    const rawScale = wPct * 0.98;
    const scale = Math.max(15, Math.min(100, Math.round(rawScale)));
    setArtPosition({ x: cx, y: cy, scale });
    setClipShape(shape);
    // For circles force aspect to 1.0 (server may report a slightly off-square
    // bbox due to blur/sampling). For ovals and rectangles use the real
    // bbox aspect so the art fills the opening top-to-bottom.
    const finalAspect = shape === "circle" ? 1.0 : Math.max(0.4, Math.min(2.5, aspect));
    setDetectedAspect(finalAspect);
  }, [editingMockupIdx, mockupTemplates]);

  /* ── List State ── */
  const [listTitle, setListTitle] = useState("");
  const [listDescription, setListDescription] = useState("");
  const [listTags, setListTags] = useState("");
  // Locked default — see CROSS_STITCH_LISTING_PRICE. User asked for a
  // flat $4.34 on every listing, so the state starts there and every
  // auto-apply path preserves it.
  const [listPrice, setListPrice] = useState(CROSS_STITCH_LISTING_PRICE);
  const [etsyListing, setEtsyListing] = useState(false);
  const [etsyStatus, setEtsyStatus] = useState("");
  // Gumroad publish state — mirrors etsyListing/etsyStatus. Gumroad's
  // public REST API doesn't allow programmatic product creation
  // (POST /v2/products returns 404), so the "List on Gumroad" button
  // can't fully auto-publish like Etsy can. Instead it does the parts
  // we CAN automate (build the PDF bundle ZIP, format the description,
  // copy listing copy to clipboard) and opens gumroad.com/products/new
  // in a new tab so the seller does the final paste + upload + Publish
  // click manually. ~10 seconds vs the 60s+ Etsy pipeline, but reliable.
  const [gumroadListing, setGumroadListing] = useState(false);
  const [gumroadStatus, setGumroadStatus] = useState("");
  // Settings hook gives us the user's pasted-in extension ID. The cross-
  // stitch page lives inside <SettingsProvider> via app/providers.tsx, so
  // useSettings() is safe to call here. We use it from listOnGumroad() to
  // decide between the "extension automates the whole form" path and the
  // older clipboard+tab handoff.
  const { settings, updateSettings } = useSettings();
  const [generatingListing, setGeneratingListing] = useState(false);
  const [trademarkWarnings, setTrademarkWarnings] = useState<{ term: string; risk: string; suggestion: string }[]>([]);

  /* ── Best Picker State ── */
  const [pickerImages, setPickerImages] = useState<{ file: File; previewUrl: string }[]>([]);
  const [pickerScoring, setPickerScoring] = useState(false);
  const [pickerScores, setPickerScores] = useState<{ index: number; composition: number; detail: number; color_harmony: number; print_quality: number; market_appeal: number; overall: number; note: string }[] | null>(null);
  const [pickerBestIdx, setPickerBestIdx] = useState<number | null>(null);
  const [pickerBestReason, setPickerBestReason] = useState<string | null>(null);

  /* ── Mockup Best Picker State ── */
  const [mockupPickerLoading, setMockupPickerLoading] = useState(false);
  const [mockupPickerResults, setMockupPickerResults] = useState<{ templateId: string; score: number; reason: string; badge?: string }[] | null>(null);

  /* ── Etsy CTR Optimizer State ── */
  const [thumbnailVariants, setThumbnailVariants] = useState<{ style: string; dataUrl: string }[]>([]);
  const [generatingThumbnails, setGeneratingThumbnails] = useState(false);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);
  const [selectedThumbnailIdx, setSelectedThumbnailIdx] = useState<number | null>(null);
  const [thumbnailBadges, setThumbnailBadges] = useState({
    topLeft: "INSTANT DOWNLOAD",
    topRight: "SET OF 4",
    bottomLeft: "6 SIZES",
    bottomRight: "PRINTABLE",
    bottomBar: "INSTANT DOWNLOAD • 6 SIZES • PRINTABLE",
  });

  const [optimizing, setOptimizing] = useState(false);
  const [optimizerError, setOptimizerError] = useState<string | null>(null);
  const [optimizerResult, setOptimizerResult] = useState<{
    titles: string[];
    description: string;
    tags: string[];
    price: number;
    priceReason: string;
    socialProof?: string;
    priceOptions?: {
      coldTraffic: { price: number; reason: string };
      marketMatch: { price: number; reason: string };
      premium: { price: number; reason: string };
    };
  } | null>(null);
  const [optimizerSubject, setOptimizerSubject] = useState("");
  const [optimizerStyle, setOptimizerStyle] = useState("cute");
  const [priceStrategy, setPriceStrategy] = useState<"cold-traffic" | "market-match" | "premium">("cold-traffic");

  /* ── Lightbox State ── */
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIdx, setLightboxIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  function openLightbox(images: string[], startIdx: number) {
    setLightboxImages(images);
    setLightboxIdx(startIdx);
    setLightboxOpen(true);
  }

  /* ── Bulk Pipeline State ── */
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkStep, setBulkStep] = useState("");
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const bulkImageInputRef = useRef<HTMLInputElement>(null);

  /* ── Bulk Shared Mockup Templates ── */
  const [bulkTemplates, setBulkTemplates] = useState<
    { id: string; previewUrl: string; file: File; frameCorners?: { x: number; y: number }[]; detecting?: boolean }[]
  >([]);
  const [bulkArtPos, setBulkArtPos] = useState({ x: 50, y: 50, scale: 60 });
  const [bulkClipShape, setBulkClipShape] = useState<"rectangle" | "circle">("circle");
  const [bulkRemoveBg, setBulkRemoveBg] = useState(true);
  const bulkTemplateInputRef = useRef<HTMLInputElement>(null);
  const [bulkEditingIdx, setBulkEditingIdx] = useState<number | null>(null);
  const [bulkDragging, setBulkDragging] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickerInputRef = useRef<HTMLInputElement>(null);
  // Dedicated file input for the Design step's "Upload your image" CTA.
  // Separate from fileInputRef (which lives on the Convert tab) because
  // the Design tab's upload also auto-advances to Convert — we don't want
  // that auto-advance behavior on the Convert tab's own re-upload.
  const designUploadInputRef = useRef<HTMLInputElement>(null);

  /* ── Seller-Study Applied State ── */
  // Style hint captured from a deep-scanned competitor; prepended to MJ prompts.
  const [sellerStyleHint, setSellerStyleHint] = useState("");
  // Pricing bracket captured from a deep-scanned competitor (informational).
  const [sellerPricingBracket, setSellerPricingBracket] = useState<{ min: number; max: number; launch: number } | null>(null);
  // Tags captured from a deep-scanned competitor (becomes the initial listTags when the List tab opens).
  const [sellerCopiedTags, setSellerCopiedTags] = useState<string[]>([]);
  // Friendly banner announcing the most recent apply action; auto-dismisses after 4s.
  const [sellerApplyNotice, setSellerApplyNotice] = useState<string>("");

  useEffect(() => {
    if (!sellerApplyNotice) return;
    const t = setTimeout(() => setSellerApplyNotice(""), 4000);
    return () => clearTimeout(t);
  }, [sellerApplyNotice]);

  /* ── Persist Convert state across refreshes ──
     Pattern generation + AI cleaning + rendered preview each cost API money.
     We snapshot the expensive results to localStorage so a refresh doesn't
     force a regeneration. Cheap settings (grid size, color count, etc.) ride
     along so the user's last config is preserved too.

     Images are base64 data URLs; localStorage has ~5MB/origin so we save the
     most valuable items and swallow quota errors. */
  const convertHydratedRef = useRef(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // ── GPT chart refinement (post-convert) ────────────────────────
  // Experimental: after the quantizer runs, send the rendered chart +
  // cleaned source to GPT-4o Vision and have it emit structural fix
  // operations (fill pupils, close outline gaps, erase stray specks,
  // recolor wrong regions). We apply the operations server-side with
  // fixed code — no sandboxing needed since the ops are schema'd data,
  // not arbitrary JavaScript.
  const [refiningChart, setRefiningChart] = useState(false);
  const [refineIssues, setRefineIssues] = useState<string[] | null>(null);
  const [preRefineGrid, setPreRefineGrid] = useState<string[][] | null>(null);
  // Result metadata from the last refine call — surfaced to the user so
  // they know what GPT thought of the chart and why ops may have been
  // rejected (oversized, low-confidence, or chart-already-good gate).
  const [refineMeta, setRefineMeta] = useState<{
    rating: number;
    assessment: string;
    skippedBecauseGood: boolean;
    appliedOps: number;
    rejectedOps: string[];
  } | null>(null);

  // Load on mount — before the save effect registers so we don't clobber the cache.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await loadConvertState();
      if (cancelled || !s) { convertHydratedRef.current = true; return; }
      if (s.sourceImage) setSourceImage(s.sourceImage);
      // Hard reset: do not hydrate old generated charts or AI-cleaned
      // source images into the simple Python converter. A fresh Convert
      // replaces pattern state completely.
      // Restore the 6-scene GPT mockups from cache so the Export tab's
      // auto-trigger skips the $0.20–0.50 re-render on every refresh.
      // The auto-mockup effect gates on `gptMockups.length === 0`, so a
      // hydrated batch prevents any fresh API call.
      //
      // HARD GATE — source-key match: before we hydrate, verify the
      // cached mockups were generated FROM the preview we just
      // restored. The key is the first 120 chars of the preview data
      // URL (see ConvertSnapshot.gptMockupsSourceKey). Mismatch means
      // the user converted a different pattern after the cached batch
      // was saved (e.g. Duck mockups lingering after a Lavender
      // convert) — dropping them here lets the Export-tab auto-trigger
      // re-fire on the current pattern instead of showing the wrong
      // design in the Etsy gallery.
      //
      // Trim to 6 on hydration: a pre-existing cache from when we ran
      // 10-scene batches would otherwise push info cards out of the
      // 10-slot Etsy gallery. Taking the FIRST 6 keeps the strongest
      // hero shots (hoopGinghamPink, handsStitching, etc. — the
      // DEFAULT_SCENES order front-loads thumbnail winners).
      if (Array.isArray(s.gptMockups) && s.gptMockups.length) {
        const currentKey = s.renderedPreview ? s.renderedPreview.substring(0, 120) : null;
        const cachedKey = typeof s.gptMockupsSourceKey === "string" ? s.gptMockupsSourceKey : null;
        if (cachedKey && currentKey && cachedKey === currentKey) {
          setGptMockups(s.gptMockups.slice(0, 6).map((dataUrl) => ({ dataUrl })));
          setGptMockupsSourceKey(cachedKey);
          // Flip the one-shot latch so the Export-tab auto-trigger doesn't
          // fire after hydration — there's nothing left to render.
          autoMockupTriggeredRef.current = true;
        } else {
          // Cache mismatch (or legacy unkeyed format) — drop the stale
          // mockups. The auto-trigger effect will kick a fresh 6-scene
          // batch next time the user opens the Export tab.
          console.log(
            `[convert-cache] dropping stale mockups: cachedKey=${cachedKey?.substring(0, 40)}… currentKey=${currentKey?.substring(0, 40)}…`,
          );
        }
      }
      // Restore the per-model GPT-image-* cache so toggling between
      // gpt-image-1 ↔ gpt-image-2 reuses prior renders instead of re-hitting
      // the API. Also recompute `activePreviewModel` from the renderedPreview
      // match so the UI shows the correct "showing: X" badge.
      if (s.renderedPreviewsByModel && typeof s.renderedPreviewsByModel === "object") {
        setRenderedPreviewsByModel(s.renderedPreviewsByModel);
        if (s.renderedPreview) {
          const matchingModel = Object.entries(s.renderedPreviewsByModel).find(
            ([, url]) => url === s.renderedPreview
          )?.[0];
          if (matchingModel) setActivePreviewModel(matchingModel);
        }
      }
      // Defaults stay authoritative after the reset: 130 width / 18 colors.
      if (typeof s.useDither === "boolean") setUseDither(s.useDither);
      // NOTE: we intentionally do NOT restore useAiClean from saved state.
      // The default is OFF and we don't want stale true values from earlier
      // sessions silently spending $0.04/convert on gpt-image-1 redraws.
      // The user can re-enable per-session if they actually want it.
      if (typeof s.enforceOutlines === "boolean") setEnforceOutlines(s.enforceOutlines);
      if (typeof s.patternName === "string") setPatternName(s.patternName);
      if (typeof s.savedAt === "number") setSavedAt(s.savedAt);
      convertHydratedRef.current = true;
    })();
    return () => { cancelled = true; };
  }, []);

  // Save whenever a tracked value changes. Debounced to avoid racing image
  // state updates. IndexedDB handles the big blobs so we never hit quota.
  //
  // CRITICAL — every new state slice added here MUST map to something the
  // user would want restored on refresh. Right now that means: things that
  // either cost real money to regenerate (gpt-image-* renders, mockup
  // batches) or take real time (the quantized pattern grid). Cheap local
  // canvas renders (compositedMockups, hoopMockups, listingImages) are
  // intentionally NOT cached — they rebuild in milliseconds from the
  // pattern data which IS cached.
  useEffect(() => {
    if (typeof window === "undefined" || !convertHydratedRef.current) return;
    const t = setTimeout(() => {
      const now = Date.now();
      saveConvertState({
        sourceImage,
        cleanedImage,
        cleanedModel,
        pattern,
        renderedPreview,
        // Paid collections — persisted so refresh doesn't re-bill OpenAI.
        gptMockups: gptMockups.map((m) => m.dataUrl).filter(Boolean),
        // Source-key pairing: this is what makes the hydration gate
        // work. Without persisting the key, a refresh would see
        // mockups+null-key and treat them as "legacy unkeyed" →
        // invalidate → free re-render. Paying gpt-image-2 a second
        // time after a plain refresh is the bug that motivated the
        // whole cache in the first place.
        gptMockupsSourceKey,
        renderedPreviewsByModel,
        gridSize,
        maxColors,
        useDither,
        useAiClean,
        enforceOutlines,
        patternName,
        savedAt: now,
      }).then((ok) => { if (ok) setSavedAt(now); });
    }, 400);
    return () => clearTimeout(t);
  }, [
    sourceImage,
    cleanedImage,
    cleanedModel,
    pattern,
    renderedPreview,
    gptMockups,
    gptMockupsSourceKey,
    renderedPreviewsByModel,
    gridSize,
    maxColors,
    useDither,
    useAiClean,
    enforceOutlines,
    patternName,
  ]);

  const handleApplySellerStudy = useCallback(
    (payload: SellerStudyApplyPayload) => {
      const { apply, shopName } = payload;
      switch (apply.kind) {
        case "queue_topics": {
          for (const topic of apply.topics) {
            // Skip dupes via the same title check inside addToBulk
            addToBulk({
              title: topic,
              description: `Research topic queued from ${shopName}`,
              mj_prompt: sellerStyleHint ? `${sellerStyleHint}, ${topic}, cross stitch pattern` : `${topic}, cross stitch pattern`,
              etsy_tags: [],
              urgency: "medium",
              source: `seller: ${shopName}`,
            });
          }
          setActiveTab("bulk");
          setSellerApplyNotice(`Queued ${apply.topics.length} research topic${apply.topics.length === 1 ? "" : "s"} into Bulk`);
          break;
        }
        case "use_product_idea": {
          // Load the idea's text into the prompt state.  The Design
          // tab is now hidden — the same `designPrompt` state pre-fills
          // the new "Generate Image" section at the top of the Convert
          // tab, where the user clicks "Generate & Clean" (which runs
          // gpt-image-2 → flatten-for-convert → setSourceImage in one
          // step).  Ignore apply.suggested_price; cross-stitch listings
          // are locked to CROSS_STITCH_LISTING_PRICE.
          setDesignPrompt(apply.idea.idea);
          setGeneratedDesignUrl(null);
          setCleanConvertDataUrl(null);
          setGeneratedDesignEngine(null);
          setActiveTab("convert");
          setSellerApplyNotice(`Loaded product idea: "${apply.idea.idea}"`);
          break;
        }
        case "copy_tags": {
          const tags = apply.tags.filter(Boolean).slice(0, 13);
          setSellerCopiedTags(tags);
          setListTags(tags.join(", "));
          setActiveTab("list");
          setSellerApplyNotice(`Copied ${tags.length} tags into the Listing form`);
          break;
        }
        case "copy_pricing": {
          // The bracket info is still useful context for the seller
          // (shows the market range in the sidebar), but we do NOT
          // push apply.launch into listPrice — the listing price is
          // locked to CROSS_STITCH_LISTING_PRICE.
          setSellerPricingBracket({ min: apply.min, max: apply.max, launch: apply.launch });
          setActiveTab("list");
          setSellerApplyNotice(
            `Reviewed price bracket $${apply.min}–$${apply.max}. Listing remains locked at $${CROSS_STITCH_LISTING_PRICE}.`
          );
          break;
        }
        case "copy_style_hint": {
          const hint = apply.hint.trim();
          setSellerStyleHint(hint);
          // styleHint is threaded server-side into buildDesignPrompt()
          // on the next render — no need to mutate a client-side
          // prompt textbox.  Land the user on the Convert tab where
          // the new "Generate & Clean" section will pick up the hint.
          setActiveTab("convert");
          setSellerApplyNotice(`Style hint saved. Will be prepended to the next design render.`);
          break;
        }
      }
    },
    [sellerStyleHint],
  );

  // The "design" tab is intentionally HIDDEN from the nav — its
  // gradient-heavy preview prompts hurt downstream pattern quality, so
  // the workflow now goes Research → Convert (where users paste a
  // prompt and click "Generate & Clean", which combines gpt-image-2
  // generation + flatten-for-convert in one step).
  //
  // The tab itself is NOT deleted: existing flows that set
  // activeTab="design" still work, and any old saved state hydrates
  // cleanly.  We just exclude `hidden:true` entries when rendering the
  // step nav at the top of the page.  `num` is computed from visible
  // index so the remaining tabs renumber 1, 2, 3… without a gap.
  const tabs: { id: Tab; label: string; hidden?: boolean }[] = [
    { id: "research", label: "Research" },
    { id: "design", label: "Design", hidden: true },
    { id: "convert", label: "Convert" },
    { id: "export", label: "Export" },
    { id: "list", label: "List" },
    { id: "preview", label: "Preview" },
    { id: "bulk", label: "Bulk" },
  ] as const;
  const visibleTabs = tabs.filter((t) => !t.hidden);

  /* ── Research: Scan all trend sources ──
   * A scan takes 30–45 seconds (Etsy + 6 trend sources + Gemini). The
   * results render in a section ~1000px below the Live Pulse panel,
   * which means the user clicks "Scan this" on a card and sees no
   * immediate feedback. Three UX fixes make the buttons feel responsive:
   *   1. setScanningTerm(q)  — per-card spinner on the clicked button
   *   2. auto-scroll          — jump to the results area so the loading
   *                             state is visible the whole time
   *   3. main "Scan Trends" button already had a global spinner; we
   *      keep that for the bottom search row. */
  /* sanitizeScanTerm — defense-in-depth for unsearchable terms.
   *
   * The server-side filter in /api/cross-stitch/live-pulse already
   * drops Reddit post titles before they hit the spiking feed, but
   * other paths into scanEtsy (autocomplete, manual typing, idea
   * cards) can still arrive with emoji or wrapped quotes that Etsy
   * won't match against. Strip those before sending to the research
   * endpoint so a single stray 🍔 doesn't tank the result count.
   *
   * Keep this conservative: don't aggressively rewrite the user's
   * intent — just normalize whitespace and drop characters Etsy
   * search treats as noise. */
  function sanitizeScanTerm(raw: string): string {
    return raw
      // Strip emoji + pictographs
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, " ")
      // Strip smart and straight quotes (Etsy doesn't use them)
      .replace(/['"\u2018\u2019\u201C\u201D]/g, " ")
      // Strip ellipsis (truncated-title artifact)
      .replace(/[…]/g, " ")
      .replace(/\.{3,}/g, " ")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .trim();
  }

  /* Returns the number of Etsy results found. Callers can use this to
   * implement fallback chains (e.g. the cross-stitch idea engine tries
   * the next keyword candidate when the first returns 0 hits). Existing
   * call sites that ignore the return continue to work unchanged. */
  async function scanEtsy(overrideQuery?: string): Promise<number> {
    const rawQ = (overrideQuery ?? searchQuery).trim();
    if (!rawQ) return 0;
    const q = sanitizeScanTerm(rawQ);
    // If sanitization stripped the whole thing (e.g. "🍔🍔🍔"), bail
    // with the empty-state hint rather than firing off a useless scan.
    if (!q || q.length < 3) {
      setLastScannedTerm(rawQ);
      setScanCompletedEmpty(true);
      setEtsyResults([]);
      return 0;
    }
    if (overrideQuery && overrideQuery !== searchQuery) {
      // Preserve the sanitized version in the search box so the user
      // sees what we actually searched for.
      setSearchQuery(q);
    }
    setAutocompleteOpen(false);
    setScanning(true);
    // Use the raw (un-sanitized) query so the idea cards' isScanningThis
    // check matches.  Cards hold their raw `idea.search_query`; if we
    // stored the sanitized `q` here, no card would equal scanningTerm,
    // every other card disabled={scanning && !false}, and the UI looked
    // like every button did nothing.  The Etsy API still receives `q`
    // below — only the scanningTerm marker changes.
    setScanningTerm(rawQ);
    setEtsyResults([]);
    setTrendInsights("");
    setTrendSources([]);
    setEmergingTrends([]);
    setOpportunityScore(0);
    setBestTimeToList("");
    setScanAnalysis(null);
    setScanTagFreq([]);
    setScanTotalResults(0);
    setScanCompletedEmpty(false);
    setLastScannedTerm(q);
    // Auto-scroll to the results area so the user can see the loading
    // skeleton while the 30–45 second scan runs.  scrollIntoView()
    // silently no-ops when the page lives inside a custom overflow
    // scroll container (the studio shell uses one), so we fall back
    // to a manual window.scrollTo.  -96px offset accounts for the
    // sticky chrome at the top.
    requestAnimationFrame(() => {
      const el = scanResultsRef.current;
      if (el) {
        const y = el.getBoundingClientRect().top + window.scrollY - 96;
        window.scrollTo({ top: y, behavior: "smooth" });
      }
    });
    try {
      const resp = await fetch("/api/cross-stitch/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const results = data.results || [];
        setEtsyResults(results);
        setTrendInsights(data.insights || "");
        setTrendSources(data.trend_sources || []);
        setEmergingTrends(data.emerging_trends || []);
        setOpportunityScore(data.opportunity_score || 0);
        setBestTimeToList(data.best_time_to_list || "");
        setScanAnalysis(data.analysis || null);
        setScanTagFreq(data.tag_frequency || []);
        setScanTotalResults(data.total_results || 0);
        // Flag empty result sets so the UI can show "no matches for X"
        // instead of the generic search-bar placeholder.
        setScanCompletedEmpty(results.length === 0);
        return results.length;
      }
      setScanCompletedEmpty(true);
      return 0;
    } catch (err) {
      console.error("Trend scan failed:", err);
      setScanCompletedEmpty(true);
      return 0;
    } finally {
      setScanning(false);
      setScanningTerm(null);
    }
  }

  /* ── Research: Find THE single best idea right now ──
   * Backend aggregates every signal we have (spiking feed, seasonal
   * events, autocomplete, live Etsy scan for the top term) and asks
   * Gemini to pick ONE high-confidence recommendation. Renders as a
   * single hero card above the search row. "Design this" jumps to
   * step 2 with the image prompt pre-filled.
   *
   * If the server refuses because the top pick was IP-tainted,
   * `data.idea` is null but `data.error` has a user-readable note.
   * Surface that in a toast so the user understands WHY nothing
   * rendered (instead of silently failing). */
  async function findBestIdea() {
    setFindingBestIdea(true);
    setBestIdea(null);
    try {
      const resp = await fetch("/api/cross-stitch/best-idea", { method: "POST" });
      if (resp.ok) {
        const data = await resp.json();
        if (data.idea) {
          setBestIdea(data.idea);
        } else if (data.error) {
          // The API deliberately returned null with an explanation.
          // Show it in-line via a toast-like alert. Keeping it simple
          // with window.alert for now — can upgrade to a toast later.
          alert(data.error);
        }
      }
    } catch (err) {
      console.error("best-idea failed:", err);
    } finally {
      setFindingBestIdea(false);
    }
  }

  /* ── Cross Stitch Idea Engine: load any previously-generated
   * cross-stitch ideas on first research-tab visit, and expose
   * generate / favorite / dismiss actions. Same product_ideas table
   * as /research, just filtered to entries whose niche/product_type
   * looks cross-stitchy. */
  const loadCrossStitchIdeas = useCallback(async () => {
    try {
      // Pull a generous limit then client-side filter to cross-stitch.
      // The route doesn't support focus filtering yet on GET — we keep
      // GET dumb and do the niche check here.
      const r = await fetch("/api/research/ideas?status=all&limit=50", { cache: "no-store" });
      if (!r.ok) return;
      const data = (await r.json()) as { ideas: CrossStitchIdea[] };
      const tokens = ["cross stitch", "cross-stitch", "xstitch", "needlepoint", "embroidery"];
      const filtered = (data.ideas || []).filter((idea) => {
        const hay = `${idea.niche ?? ""} ${idea.product_type ?? ""} ${idea.title}`.toLowerCase();
        return tokens.some((t) => hay.includes(t));
      });
      setCsIdeas(filtered);
    } catch {
      /* swallow */
    } finally {
      setCsIdeasLoaded(true);
    }
  }, []);

  async function generateCrossStitchIdeas() {
    setCsIdeasGenerating(true);
    setCsIdeasError(null);
    try {
      const r = await fetch("/api/research/ideas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 6, focus: "cross-stitch" }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || `Generation failed (${r.status})`);
      }
      const data = (await r.json()) as { ideas: CrossStitchIdea[] };
      // Prepend new ideas (newest first matches /research convention).
      setCsIdeas((prev) => [...(data.ideas || []), ...prev]);
    } catch (err) {
      setCsIdeasError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setCsIdeasGenerating(false);
    }
  }

  async function generateFunnyIdeas() {
    setCsIdeasGenerating(true);
    setCsIdeasError(null);
    try {
      const r = await fetch("/api/research/ideas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 10, focus: "cross-stitch", style: "funny" }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `Generation failed (${r.status})`);
      }
      const data = (await r.json()) as { ideas: CrossStitchIdea[] };
      setCsIdeas(data.ideas || []);
    } catch (err) {
      setCsIdeasError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setCsIdeasGenerating(false);
    }
  }

  async function updateCrossStitchIdeaStatus(
    id: number,
    status: "favorited" | "dismissed" | "new" | "in_progress" | "built",
  ) {
    setCsIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    try {
      await fetch(`/api/research/ideas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch {
      void loadCrossStitchIdeas();
    }
  }

  /* Build an ordered list of fallback search candidates from one
   * product idea. Etsy search returns ZERO results for verbose phrases
   * like "vibrant mexican folk hummingbird cross stitch" — so we score
   * every candidate (suggested_keywords + suggested_tags + niche) and
   * return them shortest-and-most-Etsy-friendly first.
   *
   * Scoring favors phrases that:
   *   - Are 2-4 words (Etsy's sweet spot)
   *   - Contain a noun anchor a buyer would actually search:
   *     "cross stitch", "pattern", "embroidery", "needlepoint"
   *   - Don't lead with throwaway adjectives (vibrant, beautiful, ...) */
  function buildScanCandidates(idea: CrossStitchIdea): string[] {
    const ADJECTIVE_NOISE = new Set([
      "vibrant", "beautiful", "stunning", "gorgeous", "amazing",
      "ultimate", "modern", "classic", "detailed", "colorful",
      "elegant", "cute", "lovely", "premium", "deluxe",
    ]);
    const ANCHOR_TOKENS = ["cross stitch", "cross-stitch", "pattern", "embroidery", "needlepoint", "needlework", "stitch"];

    function parseArray(raw: string | null): string[] {
      if (!raw) return [];
      try {
        const p = JSON.parse(raw);
        return Array.isArray(p) ? p.map(String) : [];
      } catch {
        return [];
      }
    }

    const fromKeywords = parseArray(idea.suggested_keywords);
    const fromTags = parseArray(idea.suggested_tags);
    const fromNiche = idea.niche ? [idea.niche] : [];

    // Also derive a "trim leading adjectives" version of the title
    // for very long ideas (e.g. "Vibrant Mexican Folk Hummingbird
    // Cross Stitch Pattern" → "hummingbird cross stitch pattern").
    let titleTrimmed = idea.title.toLowerCase();
    const titleWords = titleTrimmed.split(/\s+/).filter(Boolean);
    while (titleWords.length > 4 && ADJECTIVE_NOISE.has(titleWords[0])) {
      titleWords.shift();
    }
    titleTrimmed = titleWords.slice(-4).join(" "); // last 4 words

    const candidates = [...fromKeywords, ...fromTags, ...fromNiche, titleTrimmed]
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    function score(phrase: string): number {
      const wc = phrase.split(/\s+/).filter(Boolean).length;
      let s = 0;
      // Word count: 2-4 ideal, 1 generic-but-OK, 5+ likely zero hits.
      if (wc >= 2 && wc <= 4) s += 100;
      else if (wc === 1) s += 40;
      else if (wc === 5) s += 20;
      else s += 0;
      // Noun anchor — Etsy listings tend to include these.
      if (ANCHOR_TOKENS.some((t) => phrase.includes(t))) s += 30;
      // Penalize leading adjective noise.
      const first = phrase.split(/\s+/)[0];
      if (first && ADJECTIVE_NOISE.has(first)) s -= 25;
      return s;
    }

    // Score, dedupe, sort high-to-low.
    const seen = new Set<string>();
    const unique: { phrase: string; s: number }[] = [];
    for (const c of candidates) {
      if (seen.has(c)) continue;
      seen.add(c);
      unique.push({ phrase: c, s: score(c) });
    }
    unique.sort((a, b) => b.s - a.s);
    return unique.map((u) => u.phrase);
  }

  /* Apply an idea's keyword AND fire the scan, with auto-fallback to
   * shorter candidates when Etsy returns zero results. Mirrors how a
   * human would react to an empty results page: try a shorter version,
   * then shorter still, give up after 3 tries. */
  async function applyCrossStitchIdeaAsKeyword(idea: CrossStitchIdea) {
    if (scanning) return; // don't stack scans
    const candidates = buildScanCandidates(idea);
    if (candidates.length === 0) return;

    // Mark in_progress so the user's pick is reflected on /research too.
    void updateCrossStitchIdeaStatus(idea.id, "in_progress");

    const tried: string[] = [];
    setCsIdeaScanning({ ideaId: idea.id, tried });
    try {
      // Walk the candidate list — first hit with results wins. Cap at
      // 3 tries so we don't spam Etsy if Gemini produced all-bad keywords.
      for (const candidate of candidates.slice(0, 3)) {
        if (tried.includes(candidate)) continue;
        tried.push(candidate);
        setCsIdeaScanning({ ideaId: idea.id, tried: [...tried] });
        const found = await scanEtsy(candidate);
        if (found > 0) { setDbTab("listings"); return; } // success — jump to results
      }
      // All candidates exhausted with zero hits. The empty-state UI
      // already explains this, no extra action needed.
    } finally {
      setCsIdeaScanning(null);
    }
  }

  /* Load existing cross-stitch ideas on mount (research tab is the
   * default — no need to gate by activeTab). One-shot via the
   * csIdeasLoaded guard so revisits don't re-fetch. */
  useEffect(() => {
    if (csIdeasLoaded) return;
    void loadCrossStitchIdeas();
  }, [csIdeasLoaded, loadCrossStitchIdeas]);

  /* ── Convert: Image to cross-stitch pattern (professional quality) ──
   * opts.forceOriginal — one-shot override to bypass AI cleanup for this
   * call only (without mutating the useAiClean toggle). Used by the
   * "Use original instead" button on the cleaned-image panel when
   * Gemini/Fal dropped detail the user wants preserved. */
  /**
   * Legacy convertToPattern wrapper — Python now owns ALL pattern
   * generation.  This callback used to contain ~1800 lines of JS
   * median-cut + cell-vote quantization (the old pre-Python engine).
   * That entire codepath has been deleted; every UI button that used to
   * trigger JS quantization now routes through `/api/cross-stitch/python-convert`.
   *
   * Why a wrapper instead of just deleting the function:  Premium
   * Convert and the "Re-convert from original" escape-hatch button
   * pass overrideCleanedImage / overrideMaxColors / forceOriginal to
   * inject parameters that haven't yet been flushed through React
   * state.  We translate those into an explicit-image override on the
   * python convert call so the callers keep working.
   *
   * No JS canvas / Sharp / median-cut / LAB-pixel-vote logic runs in
   * this file.  Only the python KMeans engine produces patterns.
   */

  /* ── Python Engine Convert ──
   * Routes the convert through the Python FastAPI service at
   * /api/cross-stitch/python-convert (which proxies to uvicorn on :8000).
   *
   * Why it exists: the JS convertToPattern pipeline (median-cut + cell
   * mode-vote + rescue overlay) was losing thin features (hat ribs,
   * filigree) due to the 2-stage quantize → bin → vote architecture.
   * The Python engine uses KMeans in LAB space with one-pixel-per-cell
   * resampling — no binning stage, no voting loss.
   *
   * Returns the same PatternData shape as convertToPattern so the rest
   * of the UI (chart render, PDF export, Etsy listing) is unchanged.
   *
   * Requires the Python service to be running.  `npm run dev` at the
   * repo root starts both Next.js and the Python service via
   * concurrently — if the user runs `next dev` directly, they'll need
   * to start Python separately (`cd pattern-engine && uvicorn main:app --port 8000`).
   */
  const convertViaPython = useCallback(async (opts?: {
    /** Explicit image override — bypasses cleanedImage/sourceImage state.
     *  Used by the legacy convertToPattern wrapper + Premium Convert
     *  when the caller has just received an image and can't wait for
     *  setCleanedImage to flush through React state. */
    explicitImage?: string;
  }) => {
    if (!sourceImage || pythonConverting || converting || premiumConverting) return;
    setPythonConverting(true);
    // Python convert is authoritative. Clear stale chart/render/cache state
    // before the request so an old full-canvas symbol chart cannot remain
    // visible while the new AIDA-aware grid is being generated.
    setPattern(null);
    setDebugStages(null);
    setRenderedPreview(null);
    setRenderedPreviewsByModel({});
    setActivePreviewModel(null);
    setListingImages([]);
    setRefineMeta(null);
    setRefineIssues(null);
    setPreRefineGrid(null);
    setPythonEngineMs(null);
    setRemoveBackground(true);
    setCleanupConfetti(true);
    try {
      await clearConvertState();
    } catch (err) {
      console.warn("[python-convert] failed to clear stale convert cache:", err);
    }

    try {
      // Normalize to data URL.  The proxy accepts both but the Python
      // service prefers a single content-type in the stream.
      //
      // Priority: explicit override (from Premium Convert / wrappers
      // that pre-resolved an image) → raw sourceImage.
      //
      // `cleanedImage` (the AI-redrawn version produced by Premium /
      // AI-Clean) is intentionally NOT consulted here.  The default
      // Convert button must always quantize the user's actual
      // uploaded source — earlier behaviour silently fed the AI-redrawn
      // version when it existed, which made small features (eyes,
      // beak shape, sombrero pattern) drift to whatever the AI
      // hallucinated.  Premium / AI-Clean still flow through the
      // `explicitImage` opt so they can opt-in to using the cleaned
      // version when the user explicitly asked for it.
      let imageForApi = opts?.explicitImage ?? sourceImage;

      // Defensive hygiene: when running a default Convert (no explicit
      // override), drop any stale cleanedImage from a prior Premium /
      // AI-Clean run so it can't sit around and confuse the side-panel
      // / mismatch the chart we're about to render from sourceImage.
      // Premium's own flow uses `explicitImage` and re-sets
      // `cleanedImage` itself, so this branch leaves it alone.
      if (!opts?.explicitImage) {
        setCleanedImage(null);
        setCleanedModel(null);
      }
      if (!imageForApi.startsWith("data:")) {
        const blob = await (await fetch(imageForApi)).blob();
        imageForApi = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.onerror = () => rej(new Error("blob read failed"));
          r.readAsDataURL(blob);
        });
      }

      // First-day Python interface: image + gridSize + maxColors + mergeDE.
      // Python owns the rest (KMeans LAB, DMC mapping, bg classification,
      // symbols).  Next.js only proxies.
      //
      // sourceMode hint: when the current sourceImage came from the AI
      // Design tab (not a user upload), flag it as "stitch_art" so
      // Python applies a MedianFilter pre-pass that suppresses the
      // gpt-image-2 X-stitch / aida-fabric texture, AND triggers the
      // pipeline.py step 5b interior-bg flood-fill that preserves
      // enclosed cream/white subject regions instead of erasing them
      // as background.  Premium / AI-Clean flows pass `explicitImage`
      // (already pre-processed) so they keep photo mode.  User uploads
      // default to photo mode (omit field).
      //
      // Both members of the dual-prompt pair (the listing preview at
      // `generatedDesignUrl` AND the clean-convert sibling at
      // `cleanConvertDataUrl`) qualify as AI-generated.  After the
      // 2026-05-01 image-edit flow change (commit 85d9eb8),
      // `useDesignForConversion` puts `cleanConvertDataUrl` into
      // `sourceImage` whenever it exists, so without the second branch
      // here the gate would miss it and clean-vector designs with
      // white/cream subject bodies (goose, duck, lamb) would lose their
      // body cells to the photo-mode "clear every bg-DMC cell" rule.
      const sourceMode: "photo" | "stitch_art" =
        !opts?.explicitImage &&
        generatedDesignUrl &&
        (sourceImage === generatedDesignUrl ||
          sourceImage === cleanConvertDataUrl)
          ? "stitch_art"
          : "photo";
      const resp = await fetch("/api/cross-stitch/python-convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageForApi,
          gridSize: Math.max(PATTERN_WIDTH_MIN, Math.min(gridSize, PATTERN_WIDTH_MAX)),
          maxColors: Math.max(MAX_COLORS_MIN, Math.min(maxColors, MAX_COLORS_MAX)),
          // Beginner-preset path (gridSize ≤ 90): 8.0 ΔE so near-duplicate
          // DMC variants of the same hue (e.g. 4 yellows for a duck body)
          // collapse to one thread.  Standard / Detailed (gridSize > 90):
          // 12.0 ΔE collapses cream/beige body-fill clones that share a
          // hue but quantize as separate DMC entries.  Real intentional
          // accents (eyes, outlines, accessories) sit 15–30 ΔE from the
          // body palette so they survive the higher threshold; only the
          // near-duplicate body clones merge.
          //
          // RESTORED 2026-05-14 to match craftplan-digital-backup-good-
          // convert-v2.  The interim `sourceMode === "stitch_art" ? 8.5`
          // branch produced muddy output (8.5 was too gentle — left
          // near-duplicate clones in the palette, then KMeans split the
          // body cream into 3-4 buckets and the bow blue into 2-3,
          // visible as splotchy confetti on the chart).  Single value
          // 12.0 for grid > 90 matches the known-good v2 baseline.
          mergeDE: gridSize <= 90 ? 8.0 : 12.0,
          sourceMode,
          // Pattern title for the cover page of the generated PDF —
          // pure cosmetic, no effect on quantize / DMC.
          patternName: patternName.trim(),
          // One-shot square-lock for idea-card "Design This →" flows.
          // See forceSquareNext declaration for context.  Reset in
          // the finally{} below so user uploads keep aspect-aware.
          forceSquare: forceSquareNext,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(err.error ?? `HTTP ${resp.status}`);
      }

      const data = (await resp.json()) as PatternData & { engineMs?: number; engineVersion?: string };
      console.info("[python-convert]", {
        engineVersion: data.engineVersion,
        totalCells: data.totalCells,
        stitchedCells: data.stitchedCells ?? data.totalStitches,
        backgroundRemovedCells: data.backgroundRemovedCells,
        backgroundDmc: data.backgroundDmc,
      });
      setPattern({
        grid: data.grid,
        colors: data.colors,
        width: data.width,
        height: data.height,
        totalStitches: data.totalStitches,
        backgroundDmc: data.backgroundDmc,
        totalCells: data.totalCells,
        stitchedCells: data.stitchedCells,
        backgroundRemovedCells: data.backgroundRemovedCells,
        patternPdfB64: data.patternPdfB64,
      });
      if (typeof data.engineMs === "number") setPythonEngineMs(data.engineMs);
      // Python engine bypasses the JS AI-clean + preview-render flow.
      // Clear any stale render from a previous JS convert so the UI
      // rebuilds the chart from the new grid.
      setRenderedPreview(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[python-convert] failed:", msg);
      alert(`Python engine failed: ${msg}`);
    } finally {
      setPythonConverting(false);
      // Reset the one-shot square-lock — user-upload converts that
      // follow an idea-card convert in the same session should default
      // back to aspect-aware behaviour.
      setForceSquareNext(false);
    }
  }, [sourceImage, generatedDesignUrl, gridSize, maxColors, removeBackground, cleanupConfetti, pythonConverting, converting, premiumConverting, forceSquareNext]);
  const convertToPattern = useCallback(async (opts?: {
    forceOriginal?: boolean;
    overrideCleanedImage?: string;
    overrideOutlineMode?: "auto" | "force-on" | "force-off";
    overrideMaxColors?: number;
    overrideUseAiClean?: boolean;
    overrideMergeDE?: number;
    overridePreserveRareFeatures?: boolean;
  }) => {
    if (opts?.overrideMaxColors !== undefined) {
      setMaxColors(opts.overrideMaxColors);
    }
    if (opts?.overrideCleanedImage) {
      setCleanedImage(opts.overrideCleanedImage);
    }
    // Resolve which image the python convert should use:
    //   • forceOriginal → raw sourceImage (skip cleanedImage)
    //   • overrideCleanedImage → that exact image (state hasn't flushed)
    //   • else → fall through, convertViaPython picks cleaned ?? source
    const explicitImage =
      opts?.forceOriginal
        ? sourceImage ?? undefined
        : opts?.overrideCleanedImage;
    await convertViaPython({ explicitImage });
  }, [sourceImage, convertViaPython, setMaxColors, setCleanedImage]);

  /* ── Premium Convert ──
   * Paid pipeline for the "I want this to sell" quality bar.
   *   1. Send source to /api/cross-stitch/premium-convert
   *      → server runs Real-ESRGAN 2× upscale then the chosen cleanup
   *        model (openai-high | gemini | fal — picked via the provider
   *        radio above the button).
   *      → returns a much sharper, detail-preserved cleaned image.
   *   2. Drop the cleaned image into `cleanedImage` state.
   *   3. Auto-apply ornate-safe defaults (Force OFF outline, bump
   *      maxColors to at least 24) so the existing quantizer doesn't
   *      undo the premium cleanup by welding everything into a black cage.
   *   4. Kick off convertToPattern — it reuses the premium cleaned image
   *      (skips re-cleaning because cleanedImage is already set).
   *
   * Cost depends on provider: $0.17 (OpenAI HIGH), $0.003 (Gemini),
   * or $0.025 (Fal) — all plus Replicate upscale ~$0.001.
   */
  const runPremiumConvert = useCallback(async () => {
    if (!sourceImage || premiumConverting || converting) return;
    setPremiumConverting(true);
    setPremiumInfo(null);
    try {
      // Normalize source to a base64 data URL (may be a blob URL).
      let imageForApi = sourceImage;
      if (!sourceImage.startsWith("data:")) {
        const blob = await (await fetch(sourceImage)).blob();
        imageForApi = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.onerror = () => rej(new Error("Failed to read blob"));
          r.readAsDataURL(blob);
        });
      }

      // Map UI provider radio → API provider enum.
      //   "openai" (free tier's medium-quality) → "openai-high" (premium's HIGH quality)
      //   "gemini" / "fal" pass through as-is.
      const providerParam =
        aiCleanProvider === "openai" ? "openai-high" : aiCleanProvider;

      // Premium DMC palette budget. Computed up-front so we can pass it
      // to the server — libimagequant needs to know the target palette
      // size (we give it maxColors+8 headroom so DMC merge doesn't
      // starve the mapper).
      const premiumMaxColors = Math.max(maxColors, 32);

      // Phase 1 — the slow one: upscale + cleanup + libimagequant run
      // back-to-back server-side and we don't get individual progress
      // from the server (single fetch). We flip the phase label on
      // timers so the UI shows the pipeline stages: upscaling (first
      // 15s) → AI cleanup (next 30s) → libimagequant flatten (until
      // fetch returns). User can see each stage of the paid pipeline.
      setPremiumPhase("upscaling");
      const cleaningTimer = setTimeout(() => setPremiumPhase("cleaning"), 15000);
      const scanningTimer = setTimeout(() => setPremiumPhase("scanning"), 45000);

      const resp = await fetch("/api/cross-stitch/premium-convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageForApi,
          provider: providerParam,
          // Tell the server how tight the palette should be. With a
          // maxColors=32 slider the server targets 40 libimagequant
          // entries — flat enough for the DMC mapper but with enough
          // variety for rare chromatic features (hat ribs etc.) to
          // survive the production-grade quantizer.
          maxColors: premiumMaxColors,
        }),
      });
      clearTimeout(cleaningTimer);
      clearTimeout(scanningTimer);

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "");
        let errMsg = `Premium convert failed (${resp.status})`;
        try {
          const parsed = JSON.parse(errBody);
          if (parsed?.error) errMsg = parsed.error;
        } catch {
          if (errBody) errMsg = errBody.substring(0, 300);
        }
        throw new Error(errMsg);
      }

      const data = await resp.json() as {
        image: string;
        model: string;
        upscaledVia: string;
        estimatedCost: number;
      };

      // Apply ornate-safe defaults so the quantizer doesn't undo the
      // premium cleanup. The user can still override these after — they
      // trigger a free re-convert, not another premium run.
      //
      // React quirk: these setState calls won't be visible inside the
      // convertToPattern closure we're about to call (useCallback keeps
      // its old snapshot until the next render). We pass the SAME values
      // via overrideX opts so the quantizer actually uses them — otherwise
      // it re-runs with the pre-premium cleanedImage/maxColors/outlineMode
      // and we get the same broken result the user keeps screenshotting.
      setCleanedImage(data.image);
      setCleanedModel(data.model);
      setUseAiClean(true);
      setOutlineMode("force-off");
      setMaxColors(premiumMaxColors);
      setPremiumInfo({
        upscaledVia: data.upscaledVia,
        model: data.model,
        estimatedCost: data.estimatedCost,
      });

      // Phase 2 — local quantize. Pass the premium values as overrides
      // so the stale-closure version of convertToPattern still uses them.
      setPremiumPhase("quantizing");
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      await convertToPattern({
        overrideCleanedImage: data.image,
        overrideOutlineMode: "force-off",
        overrideMaxColors: premiumMaxColors,
        overrideUseAiClean: true,
        // Merge distance lowered from 6.0 → 3.5 for libimagequant input.
        //
        // Why: libimagequant already produces tight, flat colors (no
        // Floyd-Steinberg stippling, no gradient noise), so we don't
        // need aggressive merging to collapse quantizer artifacts.
        // Previous 6.0 was collapsing 32 palette entries down to 12 —
        // which is why the kokeshi lost hat ribs, kimono scallops, and
        // lotus detail (12 colors is too few for ornate designs).
        //
        // DE 3.5 = "clearly different colors stay separate" — preserves
        // the cream/sage/peach scallop variation, copper ribs vs black
        // hat, and coral lotus distinct from background peach.
        overrideMergeDE: 3.5,
        // Rare-feature overlay RE-ENABLED.
        //
        // Context: I turned this off thinking libimagequant would
        // handle rare features natively. That's true at the PIXEL
        // level — libimagequant preserves copper rib pixels in the
        // posterized source. But the browser then bins to 150×150
        // cells, and any cell that's 60% black + 40% copper will vote
        // BLACK without this overlay. Result: ribs disappear at the
        // pattern-grid stage even though they exist in the source.
        //
        // The chromatic-boost speckle from previous iterations was
        // removed; what's left is the tightened rescue logic (localFrac
        // ≥ 10%, score > 20) plus the 2-neighbor line-closing pass.
        // That combination is what let hat ribs first appear cleanly,
        // and it's needed here because cell voting is lossy regardless
        // of source quality.
        overridePreserveRareFeatures: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[premium-convert] failed:", msg);
      alert(`Premium Convert failed: ${msg}`);
    } finally {
      setPremiumConverting(false);
      setPremiumPhase("idle");
    }
  }, [sourceImage, premiumConverting, converting, convertToPattern, aiCleanProvider, maxColors]);

  /* ── Generate listing hero (explicit — not auto) ──
   * Formerly this ran automatically on every Convert, burning OpenAI
   * credits on a render that doesn't appear in the PDF. Now the user
   * clicks a button to request it, so a typical workflow (convert →
   * tweak colors → re-convert) costs $0 until they actually want the
   * hero image for their Etsy listing.
   */
  const generateListingPreview = useCallback(
    async (modelOverride?: "gpt-image-1" | "gpt-image-2") => {
      if (!sourceImage || rendering) return;

      // Cache hit — no API call. The "regen" path below covers re-running
      // on the same model deliberately (currently only exposed by forcing
      // a fresh click after Clear; expose a refresh icon later if needed).
      if (modelOverride && renderedPreviewsByModel[modelOverride]) {
        setRenderedPreview(renderedPreviewsByModel[modelOverride]);
        setActivePreviewModel(modelOverride);
        return;
      }

      setRendering(true);
      try {
        let previewSource: string | null = cleanedImage || sourceImage;
        if (previewSource && !previewSource.startsWith("data:")) {
          const blob = await (await fetch(previewSource)).blob();
          previewSource = await new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result as string);
            r.onerror = () => rej(new Error("blob read failed"));
            r.readAsDataURL(blob);
          });
        }
        const resp = await fetch("/api/cross-stitch/render-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: previewSource,
            // Omit `model` entirely when not overridden so the server uses
            // its default (IMAGE_MODEL) — keeps single-button callers
            // untouched.
            ...(modelOverride ? { model: modelOverride } : {}),
          }),
        });
        if (!resp.ok) {
          const err = await resp.text().catch(() => "");
          console.error(
            "[render-preview] failed:",
            resp.status,
            err.slice(0, 300)
          );
          // Surface a human message for the most common non-obvious
          // failure: OpenAI's 403 on gpt-image-2 when the org isn't
          // verified. Other errors stay in the console where devs look.
          if (resp.status === 403 && modelOverride === "gpt-image-2") {
            alert(
              "gpt-image-2 requires OpenAI organization verification.\n\n" +
                "Go to https://platform.openai.com/settings/organization/general\n" +
                "→ click 'Verify Organization'\n" +
                "→ wait up to 15 min for access to propagate.\n\n" +
                "Meanwhile, use the gpt-image-1 button — it works without verification."
            );
          }
          return;
        }
        const data = await resp.json();
        if (data.image) {
          setRenderedPreview(data.image);
          // The server echoes the model it actually used; trust that over
          // our request-side guess (defends against the server swapping
          // to a fallback we didn't know about).
          const modelUsed: string = data.model || modelOverride || "unknown";
          setActivePreviewModel(modelUsed);
          setRenderedPreviewsByModel((prev) => ({
            ...prev,
            [modelUsed]: data.image,
          }));
        }
      } catch (err) {
        console.error("[render-preview] error:", err);
      } finally {
        setRendering(false);
      }
    },
    [sourceImage, cleanedImage, rendering, renderedPreviewsByModel]
  );

  /* ── One-click AI preview (Python convert → listing render) ──
   * The two gpt-img-* buttons in the left panel call this. Flow:
   *   1. Run Python convert (always — produces a fresh chart so the
   *      pattern metrics panel reflects the current source). Python
   *      is deterministic so re-running on the same source doesn't
   *      cause comparison drift between gpt-img-1 and gpt-img-2
   *      runs; it's just a visible "step 1" that matches the
   *      mental model of "click AI → get pattern + preview + stitch
   *      detail all fresh".
   *   2. Generate the AI listing preview with the chosen model.
   *   3. Cache hit on the chosen model? generateListingPreview
   *      short-circuits to the cached data URL — the Python step
   *      is still cheap (~5-7s) but the AI step is free.
   *
   * Previous behavior skipped step 1 when pattern already existed —
   * surprised users who expected the Python progress indicator to
   * light up on every AI click. Removed that shortcut; the ~5s Python
   * cost is worth the clarity.
   */
  const runAiPreview = useCallback(
    async (model: "gpt-image-1" | "gpt-image-2") => {
      if (!sourceImage || converting || premiumConverting || pythonConverting || rendering) return;
      await convertViaPython();
      await generateListingPreview(model);
    },
    [
      sourceImage,
      converting,
      premiumConverting,
      pythonConverting,
      rendering,
      convertViaPython,
      generateListingPreview,
    ]
  );

  /* ── Refine chart with GPT-4o Vision (post-convert) ──
   * Sends the rendered chart + cleaned source to GPT, which emits
   * a structured operation plan (fill rects, draw lines, replace
   * colors). We apply them with fixed server-side code and overwrite
   * pattern.grid. If the user doesn't like the result, Undo restores
   * the pre-refine snapshot. */
  const refineChartWithGpt = useCallback(async () => {
    if (!pattern || refiningChart) return;
    const sourceForRefine = cleanedImage || sourceImage;
    if (!sourceForRefine) {
      alert("No source image available to compare against.");
      return;
    }
    // The chart preview data URL — reuse the already-rendered bitmap.
    const chartImg = typeof renderPatternChart === "function" ? renderPatternChart() : null;
    if (!chartImg) {
      alert("Chart image not ready yet — try again in a moment.");
      return;
    }
    // Normalize the source to a data URL (GPT endpoint accepts http(s) URLs
    // too, but we may have a blob: URL from the file input).
    let sourceDataUrl = sourceForRefine;
    if (!sourceDataUrl.startsWith("data:")) {
      try {
        const blob = await (await fetch(sourceDataUrl)).blob();
        sourceDataUrl = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.onerror = () => rej(new Error("source blob read failed"));
          r.readAsDataURL(blob);
        });
      } catch (err) {
        console.error("[refine-chart] source blob read failed:", err);
        alert("Couldn't prepare the source image — see console.");
        return;
      }
    }
    // Build legend (DMC code → hex) for GPT.
    const legend: Record<string, string> = {};
    for (const c of pattern.colors) legend[c.dmc] = c.hex;

    setRefiningChart(true);
    setRefineIssues(null);
    setRefineMeta(null);
    try {
      const resp = await fetch("/api/cross-stitch/refine-chart-gpt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grid: pattern.grid,
          sourceImage: sourceDataUrl,
          chartImage: chartImg,
          legend,
          aidaDmc: pattern.backgroundDmc,
        }),
      });
      if (!resp.ok) {
        const err = await resp.text().catch(() => "");
        console.error("[refine-chart] API error:", resp.status, err.slice(0, 400));
        alert(`Refine failed (${resp.status}). Check console for details.`);
        return;
      }
      const data = (await resp.json()) as {
        grid?: string[][];
        rating?: number;
        assessment?: string;
        issues?: string[];
        skippedBecauseGood?: boolean;
        operations?: unknown[];
        rejectedOps?: string[];
        stats?: {
          rating: number;
          operationsReceived: number;
          operationsApplied: number;
          cellsApplied: number;
          cellsSkipped: number;
        };
      };
      if (!data.grid || !Array.isArray(data.grid)) {
        alert("Refine returned no grid.");
        return;
      }
      const rating = typeof data.rating === "number" ? data.rating : 0;
      const assessment = data.assessment || "";
      const skippedBecauseGood = data.skippedBecauseGood === true;
      const appliedOps = Array.isArray(data.operations) ? data.operations.length : 0;
      const rejectedOps = Array.isArray(data.rejectedOps) ? data.rejectedOps : [];
      // If GPT judged the chart good or no safe ops remained, don't mutate.
      const didMutate = !skippedBecauseGood && appliedOps > 0;
      if (didMutate) {
        // Snapshot the pre-refine grid so the user can undo.
        setPreRefineGrid(pattern.grid);
        const newGrid = data.grid;
        const counts = new Map<string, number>();
        for (const row of newGrid) {
          for (const code of row) counts.set(code, (counts.get(code) || 0) + 1);
        }
        const newColors = pattern.colors
          .map((c) => ({ ...c, count: counts.get(c.dmc) || 0 }))
          .filter((c) => c.count > 0 || c.dmc === pattern.backgroundDmc);
        for (const [code] of counts) {
          if (!newColors.some((c) => c.dmc === code)) {
            const original = pattern.colors.find((c) => c.dmc === code);
            if (original) newColors.push({ ...original, count: counts.get(code) || 0 });
          }
        }
        const totalStitches = newColors
          .filter((c) => c.dmc !== pattern.backgroundDmc)
          .reduce((s, c) => s + c.count, 0);
        setPattern({ ...pattern, grid: newGrid, colors: newColors, totalStitches });
        // Clear the rendered "listing preview" — it's stale now.
        setRenderedPreview(null);
      }
      setRefineIssues(data.issues || []);
      setRefineMeta({ rating, assessment, skippedBecauseGood, appliedOps, rejectedOps });
      const stats = data.stats;
      if (stats) {
        console.log(
          `[refine-chart] rating=${stats.rating} received=${stats.operationsReceived} applied=${stats.operationsApplied} cells=${stats.cellsApplied} skipped=${stats.cellsSkipped}`
        );
      }
    } catch (err) {
      console.error("[refine-chart] error:", err);
      alert("Refine failed — see console.");
    } finally {
      setRefiningChart(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pattern, cleanedImage, sourceImage, refiningChart]);

  /* ── Undo the last GPT refinement ── */
  const undoRefine = useCallback(() => {
    if (!pattern || !preRefineGrid) return;
    // Recount colors for the restored grid.
    const counts = new Map<string, number>();
    for (const row of preRefineGrid) {
      for (const code of row) counts.set(code, (counts.get(code) || 0) + 1);
    }
    const restoredColors = pattern.colors
      .map((c) => ({ ...c, count: counts.get(c.dmc) || 0 }))
      .filter((c) => c.count > 0 || c.dmc === pattern.backgroundDmc);
    const totalStitches = restoredColors
      .filter((c) => c.dmc !== pattern.backgroundDmc)
      .reduce((s, c) => s + c.count, 0);
    setPattern({ ...pattern, grid: preRefineGrid, colors: restoredColors, totalStitches });
    setPreRefineGrid(null);
    setRefineIssues(null);
    setRefineMeta(null);
    setRenderedPreview(null);
  }, [pattern, preRefineGrid]);

  /* ── Handle image upload ── */
  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setSourceFile(file);
      setSourceImage(URL.createObjectURL(file));
      setPattern(null);
      setCleanedImage(null);
      setCleanedModel(null); // new upload ⇒ stale AI cache
      setRenderedPreview(null);
      setHasFlattenedUpload(false); // new upload ⇒ flatten button reappears
      // Auto-name the pattern from the uploaded filename so the PDF cover
      // shows a real title (e.g. "Kokeshi Doll") instead of our generic
      // "cross-stitch-pattern" default. Handles the ugly Midjourney-style
      // filenames too: strips UUID hex hashes, vendor prefixes, trailing
      // version suffixes, and caps at 60 chars so the cover title fits.
      const derived = file.name
        .replace(/\.[^.]+$/, "")                       // drop .png / .jpg etc.
        .replace(/\s*\(\d+\)\s*$/, "")                 // drop trailing "(2)"
        .replace(/[-_]+/g, " ")
        // Strip common vendor / generator prefixes
        .replace(/^(SAMEX|MJ|DALLE?|SD|IMG|IMAGE|PHOTO|SCREENSHOT)[\s_-]+/i, "")
        // Drop any hex run of 4+ chars (UUID fragments like cbb9d6f2)
        .replace(/\b[a-f0-9]{4,}\b/gi, "")
        // Drop standalone digit/short token clusters left at end
        .replace(/(?:\s+\d{1,3})+\s*$/, "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .slice(0, 60)
        .trim();
      if (derived && !patternName.trim()) {
        setPatternName(derived);
      }
    }
  }

  /* ── Opt-in flatten for direct uploads ──
   * Mirrors the Design tab's clean-convert step (gpt-image-2 edit
   * with CLEAN_CONVERT_EDIT_PROMPT) but applied to a user-uploaded
   * source.  After success, sourceImage is REPLACED with the
   * flattened data URL so the existing Convert / Premium / preview
   * paths pick it up automatically — no other code paths need to
   * branch.  The Python source_mode stays "photo" because the AI
   * has already removed the gradients/anti-aliasing that
   * stitch_art's median pre-pass would otherwise compensate for.
   * One round-trip costs ~$0.04 (gpt-image-2 medium edit). */
  async function flattenUploadForConvert() {
    if (!sourceImage || isFlattening) return;
    setIsFlattening(true);
    try {
      // Resolve sourceImage to a data URL — the upload path stores it
      // as a blob: URL via URL.createObjectURL, but the route expects
      // a data: URL so it can decode raw bytes for OpenAI's multipart
      // form.  Same blob → data dance as convertViaPython at line ~1455.
      let imageForApi = sourceImage;
      if (!imageForApi.startsWith("data:")) {
        const blob = await (await fetch(imageForApi)).blob();
        imageForApi = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.onerror = () => rej(new Error("blob read failed"));
          r.readAsDataURL(blob);
        });
      }
      const resp = await fetch("/api/cross-stitch/flatten-for-convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageForApi }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.error || `flatten failed (HTTP ${resp.status})`);
      }
      if (!data?.flattenedImage) {
        throw new Error("flatten returned no image");
      }
      setSourceImage(data.flattenedImage);
      setHasFlattenedUpload(true);
      // Drop any cached chart / cleaned-image derived from the
      // pre-flatten source so the next Convert run quantizes the
      // flattened input.
      setPattern(null);
      setCleanedImage(null);
      setCleanedModel(null);
      setRenderedPreview(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Flatten failed";
      console.error("[flatten-for-convert] failed:", msg);
      alert(`Simplify failed: ${msg}`);
    } finally {
      setIsFlattening(false);
    }
  }

  /* ── Convert-tab Generate & Clean ──
   * One-click composite of:
   *   1. /api/cross-stitch/generate-design at style="nala-beginner"
   *      (the flat-cartoon-sticker style — no gradient/watercolor
   *      preview prompts that the now-hidden Design tab used to
   *      generate).
   *   2. /api/cross-stitch/flatten-for-convert on the result so any
   *      residual airbrush gets snapped flat before quantization.
   *   3. setSourceImage(flattened) so the Convert button picks it up
   *      as a clean photo-mode source (no stitch_art texture pre-pass
   *      needed because the flatten already produced flat zones).
   *
   * Cost ≈ $0.04 (gpt-image-2 medium gen) + $0.04 (gpt-image-2 medium
   * edit) = $0.08.  Mirrors the cost label shown on the button.
   *
   * Replaces the old Research → Design → Convert hand-off entirely.
   * Failure in either step surfaces an alert and leaves the prior
   * state unchanged so the user can retry.
   */
  const [generatingForConvert, setGeneratingForConvert] = useState<
    null | "generating" | "cleaning"
  >(null);
  const [generateEngine, setGenerateEngine] = useState<"fal-fast" | "gpt-image-2">("fal-fast");

  // ── Auto-Pipeline (Phase 1) ───────────────────────────────────────
  // Sequential orchestrator that takes N ideas → for each: Generate &
  // Clean (HQ) + Python convert.  Per CONVERT-RULES.md, this code
  // never touches the convert pipeline — it only calls existing
  // routes in sequence and tracks per-item progress in a queue.
  // Future phases will add mockups, video, listing copy, Etsy draft.
  const AUTO_PIPELINE_LS_KEY = "cross-stitch-auto-pipeline-state-v1";
  const [autoPipelineState, setAutoPipelineState] = useState<AutoPipelineState | null>(null);
  const autoPipelineStateRef = useRef<AutoPipelineState | null>(null);
  // Keep ref in sync with state so the orchestrator loop can read
  // the latest cancelled flag without dependency-array rerenders.
  useEffect(() => { autoPipelineStateRef.current = autoPipelineState; }, [autoPipelineState]);

  // IndexedDB-backed persistence.  localStorage caps at ~5–10 MB
  // per origin which is FAR too small for 5+ items with mockups
  // (4 × 1 MB), video (~1.5 MB), source images (~2 MB), and chart
  // grid (~1 MB) each.  Every save was silently QuotaExceeded'ing,
  // so on refresh the queue looked empty and auto-resume re-ran the
  // whole pipeline from scratch — burning $1.80 of gpt-image-2 calls
  // per refresh.  IndexedDB's per-origin quota is typically 50% of
  // free disk (gigabytes), so the full queue + assets fit cleanly.
  //
  // Helpers are inlined (no new dep).  Single object store keyed by
  // AUTO_PIPELINE_LS_KEY holds the entire state blob.
  const idbOpen = useCallback(async (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("craftplan-cross-stitch", 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains("kv")) {
          req.result.createObjectStore("kv");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }, []);
  const idbGet = useCallback(async (key: string): Promise<unknown> => {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readonly");
      const r = tx.objectStore("kv").get(key);
      r.onsuccess = () => { db.close(); resolve(r.result); };
      r.onerror = () => { db.close(); reject(r.error); };
    });
  }, [idbOpen]);
  const idbPut = useCallback(async (key: string, value: unknown): Promise<void> => {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(value, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }, [idbOpen]);
  const idbDelete = useCallback(async (key: string): Promise<void> => {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").delete(key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }, [idbOpen]);

  // IndexedDB hydration + persistence — DISABLED 2026-05-16 after the
  // pipeline moved server-side (see /api/cross-stitch/pipeline/*).  The
  // server's auto_pipeline_jobs table is now the single source of
  // truth; the rehydrate-on-mount effect below GETs /api/cross-stitch/
  // pipeline/active and adopts whatever the server reports.  Local
  // IDB writes here would just race with the polling effect and bring
  // stale data back.  One-time cleanup: drop any legacy IDB entry so
  // it can't resurface.
  useEffect(() => {
    (async () => {
      try {
        await idbDelete(AUTO_PIPELINE_LS_KEY);
        if (typeof window !== "undefined") {
          localStorage.removeItem(AUTO_PIPELINE_LS_KEY);
        }
      } catch { /* ignore */ }
    })();
  }, [idbDelete]);

  /**
   * Run the auto-pipeline for N items.
   *
   * For each idea, sequentially:
   *   1. POST /api/cross-stitch/generate-design (HQ engine)
   *   2. POST /api/cross-stitch/flatten-for-convert
   *   3. POST /api/cross-stitch/python-convert
   *
   * Results live in queue items — we do NOT touch the existing
   * single-design state (sourceImage, generatedDesignUrl, etc.) so
   * any work the user already had in the Convert tab is preserved.
   * When they click "View →" on a completed item, THAT'S when we
   * load it into the single-design state.
   */
  // Render a Python-convert chart grid into a PNG data URL.  This is
  // what gets passed to /auto-mockup-free as the "pattern" image — we
  // want the actual STITCHED-LOOKING chart in the hoop mockups, not
  // the raw gpt-image-2 cartoon source.  Each grid cell renders as a
  // colored square sized to fill a 1024px canvas.  Background cells
  // (matching backgroundDmc) are rendered transparent so the hoop
  // template's white aida shows through.
  const renderChartAsImage = useCallback((
    grid: string[][],
    colors: Array<{ dmc: string; hex: string }>,
    backgroundDmc?: string,
  ): string => {
    const h = grid.length;
    const w = grid[0]?.length || 0;
    if (h === 0 || w === 0) return "";
    const canvas = document.createElement("canvas");
    const SIZE = 1024;
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    // White background — matches aida cloth
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Build DMC → hex lookup
    const dmcToHex = new Map<string, string>();
    for (const c of colors) dmcToHex.set(c.dmc, c.hex);

    // Center the grid in the canvas with a small margin
    const margin = 32;
    const gridMax = SIZE - 2 * margin;
    const cellSize = Math.min(gridMax / w, gridMax / h);
    const offsetX = (SIZE - cellSize * w) / 2;
    const offsetY = (SIZE - cellSize * h) / 2;

    for (let r = 0; r < h; r++) {
      const row = grid[r];
      for (let col = 0; col < w; col++) {
        const dmc = row[col];
        if (!dmc || dmc === backgroundDmc) continue;
        const hex = dmcToHex.get(dmc) || "#888888";
        ctx.fillStyle = hex;
        ctx.fillRect(
          offsetX + col * cellSize,
          offsetY + r * cellSize,
          Math.ceil(cellSize) + 0.5,   // +0.5 to avoid hairline gaps
          Math.ceil(cellSize) + 0.5,
        );
      }
    }
    return canvas.toDataURL("image/png");
  }, []);

  // Process the queue's remaining queued items.  Used by both
  // runAutoPipeline (after seeding fresh ideas) and resumeAutoPipeline
  // (after a page reload picked up an existing queue).
  // Process the queue using STAGE-BATCHED orchestration.
  //
  // Order (per the user's spec 2026-05-15):
  //   Stage 1 — Convert tab : for each item, generate image + flatten + python-convert
  //   Stage 2 — Export tab  : for each item, export PDF bundle
  //                           for each item, generate mockups
  //                           for each item, render listing video
  //   Stage 3 — List tab    : for each item, generate listing copy
  //   Stage 4 — Preview tab : auto-navigate so user sees queue
  //
  // The tab auto-advances between stages so the user can SEE the work
  // happening in the right tab.  Each stage processes ALL items before
  // moving to the next stage (batched, not item-by-item end-to-end).
  // ─────────────────────────────────────────────────────────────────
  // Auto-Pipeline orchestrator — PHASE 1 ONLY (Research → Convert).
  // ─────────────────────────────────────────────────────────────────
  // 2026-05-15 — Per user spec: stop adding stages until this is
  // rock-solid.  Stages 2-4 (Export/Mockups/Video/List/Preview) are
  // gated behind separate manual buttons triggered after the user
  // approves the convert results.
  //
  // What this does:
  //   1. Pulls N ideas from the Gemini grounded generator.
  //   2. Auto-switches to the Convert tab.
  //   3. For each item, sequentially: generate image → flatten → python convert.
  //   4. Loads each finished item into the single-design state so the
  //      user SEES each chart appear in the Convert tab as it completes.
  //   5. STOPS at the Convert tab when all items are done.  Does NOT
  //      auto-navigate to Export.  The dashboard panel surfaces a
  //      "Continue to Export & Mockups" button when ready.
  // ═════════════════════════════════════════════════════════════════
  // Auto-Pipeline orchestrator — FULLY AUTOMATIC, ZERO MANUAL CLICKS.
  // ═════════════════════════════════════════════════════════════════
  // 2026-05-15 — Per user spec ("no manual i need all automatic"):
  //   ONE CLICK on Auto-Generate runs the entire pipeline end-to-end.
  //   Tabs auto-advance: Research → Convert → Export → List → Preview.
  //
  // Strict stage batching (per user 2026-05-15):
  //   Stage 1A : generate image (gpt-image-2 HQ) + flatten — ALL items
  //              one by one (wait for each).
  //   Stage 1B : python convert — ALL items one by one (wait for each).
  //   Stage 2A : mockups (auto-mockup-free) — ALL items one by one.
  //   Stage 2B : listing video (ffmpeg) — ALL items one by one.
  //   Stage 3  : listing copy (Gemini) — ALL items one by one.
  //   Stage 4  : auto-navigate to Preview.
  //
  // EVERYTHING is INLINED in this single function (no separate
  // runExportStage / runListStage / refs).  Prior version used refs
  // to chain stages, which left the user stuck at Stage 1 when the
  // chain misfired.  Inlining guarantees the full flow runs.
  const processAutoPipelineQueue = useCallback(async () => {
    const updateState = (mutator: (prev: AutoPipelineState) => AutoPipelineState) => {
      const prev = autoPipelineStateRef.current;
      if (!prev) return;
      const next = mutator(prev);
      autoPipelineStateRef.current = next;
      setAutoPipelineState(next);
    };
    const updateItem = (id: string, mut: (i: AutoPipelineItem) => AutoPipelineItem) => {
      updateState((prev) => ({ ...prev, items: prev.items.map((i) => i.id === id ? mut(i) : i) }));
    };
    const isCancelled = () => !!autoPipelineStateRef.current?.cancelled;

    updateState((prev) => ({ ...prev, active: true, cancelled: false }));

    const allItems = autoPipelineStateRef.current?.items || [];
    const initialItems = allItems.filter((i) => i.status === "queued");
    console.log("[processAutoPipelineQueue] items in queue:", allItems.length, "queued:", initialItems.length);
    if (initialItems.length === 0) {
      console.log("[processAutoPipelineQueue] no queued items — exiting early. All statuses:", allItems.map((i) => i.status));
      updateState((prev) => ({ ...prev, active: false, currentItemId: null }));
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // STAGE 1A — Generate images (HQ gpt-image-2 + flatten) for ALL.
    // Per 2026-05-16 spec: pipeline runs in BACKGROUND — no tab
    // switching during stages.  The floating Auto-Pipeline dashboard
    // panel (bottom-right) is the user's progress UI; they can stay
    // on any tab while the orchestrator works.
    // ═══════════════════════════════════════════════════════════════
    console.log("[processAutoPipelineQueue] STAGE 1A: processing", initialItems.length, "items (background mode)");

    for (const seedItem of initialItems) {
      if (isCancelled()) break;

      // Resume guard: if the item already has imageUrl + cleanImageUrl
      // from a previous run (page refresh / nav-away mid-flight) then
      // gen + flatten were already paid for — skip Stage 1A and let
      // the later stages pick it up via their data-presence filters.
      // Without this, every refresh during the pipeline burns another
      // $0.08 per item re-generating images we already have.
      if (seedItem.imageUrl && seedItem.cleanImageUrl) {
        console.log(`[processAutoPipelineQueue] STAGE 1A: skipping ${seedItem.title} — already has imageUrl+cleanImageUrl from prior run`);
        continue;
      }

      updateItem(seedItem.id, (i) => ({ ...i, status: "generating" as const, startedAt: Date.now(), error: undefined }));

      try {
        // Generate (HQ gpt-image-2).
        // Timeout: 180s (3 min).  gpt-image-2 normally finishes in ~40s
        // but can be slow under load.  Without a client-side timeout,
        // a stalled server (e.g., OpenAI billing limit silently hanging)
        // would freeze the orchestrator on this item forever — the user
        // would see "1/7 · Generating image…" with no progress.
        const genResp = await fetch("/api/cross-stitch/generate-design", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: seedItem.title, style: "nala-beginner", engine: "gpt-image-2" }),
          signal: AbortSignal.timeout(180_000),
        });
        const genData = await genResp.json();
        if (!genResp.ok || !genData?.dataUrl) {
          throw new Error(genData?.error || `Generate failed (HTTP ${genResp.status})`);
        }
        recordCost("gpt-image-2", COST.IMAGE_GEN_MEDIUM, `gen: ${seedItem.title.slice(0, 40)}`);
        const generated = genData.dataUrl as string;

        // Flatten-for-convert (STRONG flatten pass).
        // Timeout: 120s (2 min).
        const flatResp = await fetch("/api/cross-stitch/flatten-for-convert", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: generated }),
          signal: AbortSignal.timeout(120_000),
        });
        if (flatResp.ok) recordCost("gpt-image-2", COST.IMAGE_EDIT_MEDIUM, `flatten: ${seedItem.title.slice(0, 40)}`);
        const flatData = await flatResp.json();
        const cleanImage = flatResp.ok && flatData?.flattenedImage
          ? (flatData.flattenedImage as string)
          : generated;

        updateState((prev) => ({
          ...prev,
          totalCostUsd: prev.totalCostUsd + 0.08,
          items: prev.items.map((i) => i.id === seedItem.id
            ? { ...i, imageUrl: generated, cleanImageUrl: cleanImage }
            : i,
          ),
        }));
      } catch (err) {
        updateItem(seedItem.id, (i) => ({
          ...i,
          status: "failed" as const,
          error: err instanceof Error ? err.message : "unknown error",
          completedAt: Date.now(),
        }));
      }
    }

    if (isCancelled()) {
      updateState((prev) => ({ ...prev, active: false, currentItemId: null }));
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // STAGE 1B — Python convert (KMeans → chart) for ALL items.
    // ═══════════════════════════════════════════════════════════════
    const itemsWithImage = (autoPipelineStateRef.current?.items || []).filter(
      (i) => i.cleanImageUrl && !i.patternFull,
    );

    for (const item of itemsWithImage) {
      if (isCancelled()) break;
      updateItem(item.id, (i) => ({ ...i, status: "converting" as const }));

      try {
        const convResp = await fetch("/api/cross-stitch/python-convert", {
          method: "POST", headers: { "Content-Type": "application/json" },
          // 60s timeout — KMeans normally finishes in 2-3s, 60s is generous safety net.
          signal: AbortSignal.timeout(60_000),
          body: JSON.stringify({
            image: item.cleanImageUrl,
            gridSize: 142,
            maxColors: 18,
            mergeDE: 12.0,         // v2 baseline — DO NOT CHANGE (per CONVERT-RULES.md)
            sourceMode: "photo",
            patternName: item.title.replace(/cross stitch pattern/gi, "").trim(),
            forceSquare: true,
          }),
        });
        const convData = await convResp.json();
        if (!convResp.ok) throw new Error(convData?.error || `Convert failed (HTTP ${convResp.status})`);

        updateItem(item.id, (i) => ({
          ...i,
          patternStats: {
            width: convData.width,
            height: convData.height,
            colors: (convData.colors || []).length,
            totalStitches: convData.totalStitches,
          },
          patternFull: {
            grid: convData.grid,
            colors: convData.colors || [],
            width: convData.width,
            height: convData.height,
            totalStitches: convData.totalStitches,
            backgroundDmc: convData.backgroundDmc,
            totalCells: convData.totalCells,
            stitchedCells: convData.stitchedCells,
            backgroundRemovedCells: convData.backgroundRemovedCells,
            patternPdfB64: convData.patternPdfB64,
          },
        }));

        // Load just-finished chart into single-design state so the
        // Convert tab visibly shows progress as items complete.
        setSourceImage(item.cleanImageUrl!);
        setGeneratedDesignUrl(item.imageUrl || null);
        setCleanConvertDataUrl(null);
        setHasFlattenedUpload(true);
        setForceSquareNext(true);
        setPattern({
          grid: convData.grid,
          colors: convData.colors || [],
          width: convData.width,
          height: convData.height,
          totalStitches: convData.totalStitches,
          backgroundDmc: convData.backgroundDmc,
          totalCells: convData.totalCells,
          stitchedCells: convData.stitchedCells,
          backgroundRemovedCells: convData.backgroundRemovedCells,
          patternPdfB64: convData.patternPdfB64,
        });
        // Stale-info-card guard: the auto-info-cards effect (~line 8039)
        // only fires once per session and skips when listingImages is
        // already populated.  Without this reset, run #2's Preview tab
        // shows run #1's stitch-count card (wrong character embedded).
        // Clearing both lets the effect re-fire against the new pattern.
        setListingImages([]);
        autoInfoCardsTriggeredRef.current = false;
      } catch (err) {
        updateItem(item.id, (i) => ({
          ...i,
          status: "failed" as const,
          error: err instanceof Error ? err.message : "unknown error",
          completedAt: Date.now(),
        }));
      }
    }

    if (isCancelled()) {
      updateState((prev) => ({ ...prev, active: false, currentItemId: null }));
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // STAGE 1C — PDF bundle for ALL items that have a chart.
    //   The python-convert response already includes patternPdfB64, but
    //   that's the SINGLE-size chart preview.  /api/cross-stitch/export-pdf
    //   with variant=bundle produces the full 5-PDF + OXS bundle the
    //   listing actually ships with.  Flips item.hasPdf so the dashboard
    //   pdf pill lights up green.
    // ═══════════════════════════════════════════════════════════════
    const itemsForPdf = (autoPipelineStateRef.current?.items || []).filter(
      (i) => i.patternFull && !i.hasPdf,
    );

    for (const item of itemsForPdf) {
      if (isCancelled()) break;
      updateItem(item.id, (i) => ({ ...i, status: "exporting" as const }));
      try {
        const r = await fetch("/api/cross-stitch/export-pdf", {
          method: "POST", headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(120_000),
          body: JSON.stringify({
            pattern: item.patternFull,
            name: item.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60),
            variant: "bundle",
          }),
        });
        updateItem(item.id, (i) => ({ ...i, hasPdf: r.ok }));
      } catch { /* non-fatal — user can retry from dashboard */ }
    }

    if (isCancelled()) {
      updateState((prev) => ({ ...prev, active: false, currentItemId: null }));
      return;
    }

    // Snapshot items that have full pattern (= ready for Stage 2+).
    const convertedItems = (autoPipelineStateRef.current?.items || []).filter((i) => i.patternFull && i.cleanImageUrl);

    // ═══════════════════════════════════════════════════════════════
    // STAGE 2A — Mockups for ALL items.
    //   Per user 2026-05-15: user must SEE each item being mocked up on
    //   the Export tab, not just feel the tab flash by.  We load each
    //   item into single-design state + populate gptMockups (the Export
    //   tab's display state) so mockups visibly appear on Export tab
    //   one item at a time.
    //
    //   Background mode (2026-05-16): no tab switch — dashboard panel
    //   shows per-item ✓mocks pill as each item completes.
    // ═══════════════════════════════════════════════════════════════

    for (const item of convertedItems) {
      if (isCancelled()) break;
      if (item.mockups?.some((m) => !!m.dataUrl)) continue;
      updateItem(item.id, (i) => ({ ...i, status: "mocking" as const }));

      // Load THIS item into single-design state so the Export tab's UI
      // shows the right chart + so the orchestrator's mockups land in
      // the Export tab's gptMockups slot (visually).
      setSourceImage(item.cleanImageUrl!);
      setPattern({
        grid: item.patternFull!.grid,
        colors: item.patternFull!.colors,
        width: item.patternFull!.width,
        height: item.patternFull!.height,
        totalStitches: item.patternFull!.totalStitches,
        backgroundDmc: item.patternFull!.backgroundDmc,
        totalCells: item.patternFull!.totalCells,
        stitchedCells: item.patternFull!.stitchedCells,
        backgroundRemovedCells: item.patternFull!.backgroundRemovedCells,
        patternPdfB64: item.patternFull!.patternPdfB64,
      });
      // Clear previous mockups + show "generating" indicator on Export tab.
      setGptMockups([]);
      setGptComposing(true);
      setGptError(null);

      try {
        const chartImg = renderChartAsImage(
          item.patternFull!.grid,
          item.patternFull!.colors,
          item.patternFull!.backgroundDmc,
        );
        // PAID gpt-image-2 mockup endpoint per original plan ($0.28/item
        // for 4 photoreal lifestyle scenes).  The earlier auto-mockup-free
        // shipped flat template paste-ups that didn't match the
        // "photoreal lifestyle mockups — flat-lay hero, hands mid-stitch,
        // cozy lap, shelf styled" promise.  240s timeout matches the
        // route's maxDuration (4 photos in parallel via gpt-image-2).
        const r = await fetch("/api/cross-stitch/auto-mockup", {
          method: "POST", headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(240_000),
          body: JSON.stringify({ pattern: chartImg || item.cleanImageUrl, title: item.title }),
        });
        if (r.ok) {
          recordCost("gpt-image-2", COST.AUTO_MOCKUP_4, `4 mockups: ${item.title.slice(0, 40)}`);
          const d = await r.json();
          const m = (d.images || []).map((x: { scene: string; dataUrl: string }) => ({
            scene: x.scene,
            dataUrl: x.dataUrl,
            hasDataUrl: !!x.dataUrl,
          })).filter((x: { dataUrl?: string }) => !!x.dataUrl);
          // Save to queue (Preview cards read this) AND to Export tab state
          // (so the 4 mockups visibly appear on Export tab).
          updateItem(item.id, (i) => ({ ...i, mockups: m }));
          setGptMockups(m.map((x: { dataUrl: string }) => ({ dataUrl: x.dataUrl })));
        } else {
          // Surface the upstream error so the user sees why mockups failed
          // (e.g., OpenAI billing limit, org-not-verified for gpt-image-2).
          const errJson = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
          setGptError(errJson?.error || `Mockup failed (HTTP ${r.status})`);
        }
      } catch (err) {
        setGptError(err instanceof Error ? err.message : "mockup failed");
      }
      setGptComposing(false);

      // Hold for 1.5s so the user can SEE the mockups appear on Export
      // before moving to the next item.
      await new Promise((r) => setTimeout(r, 1500));
    }

    if (isCancelled()) {
      updateState((prev) => ({ ...prev, active: false, currentItemId: null }));
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // STAGE 2B — Listing video for ALL items that have mockups.
    //   Free Ken-Burns route (/api/cross-stitch/listing-video) — uses
    //   the 4 mockups + the chart render as ffmpeg frames.  ~30-60s per
    //   item.  User sees each video appear on the Export tab via
    //   setPreviewVideoUrl so the pipeline is visible, not silent.
    // ═══════════════════════════════════════════════════════════════
    const itemsForVideo = (autoPipelineStateRef.current?.items || []).filter(
      (i) => i.patternFull && !!i.mockups?.some((m) => !!m.dataUrl) && !i.hasVideo,
    );

    for (const item of itemsForVideo) {
      if (isCancelled()) break;
      updateItem(item.id, (i) => ({ ...i, status: "videoing" as const }));

      // Mirror the Stage 2A pattern: load this item into single-design state
      // so the Export tab visibly shows progress (chart + the "Generating video…"
      // indicator) for the right item.
      setSourceImage(item.cleanImageUrl!);
      setPattern({
        grid: item.patternFull!.grid,
        colors: item.patternFull!.colors,
        width: item.patternFull!.width,
        height: item.patternFull!.height,
        totalStitches: item.patternFull!.totalStitches,
        backgroundDmc: item.patternFull!.backgroundDmc,
        totalCells: item.patternFull!.totalCells,
        stitchedCells: item.patternFull!.stitchedCells,
        backgroundRemovedCells: item.patternFull!.backgroundRemovedCells,
        patternPdfB64: item.patternFull!.patternPdfB64,
      });
      setGptMockups((item.mockups || []).filter((m) => !!m.dataUrl).map((m) => ({ dataUrl: m.dataUrl })));
      setPreviewVideoUrl(null);
      setGeneratingPreviewVideo(true);

      try {
        const chartImg = renderChartAsImage(
          item.patternFull!.grid,
          item.patternFull!.colors,
          item.patternFull!.backgroundDmc,
        );
        // Free Ken-Burns ffmpeg route — predictable, no API key needed.
        // 240s timeout matches the route's maxDuration (~30-60s typical).
        const r = await fetch("/api/cross-stitch/listing-video", {
          method: "POST", headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(240_000),
          body: JSON.stringify({
            patternName: item.title,
            pattern: {
              grid: item.patternFull!.grid,
              colors: item.patternFull!.colors,
              width: item.patternFull!.width,
              height: item.patternFull!.height,
            },
            finishedImage: chartImg,
            mockups: (item.mockups || []).map((m) => m.dataUrl).filter(Boolean),
            lifestyleMode: "none",
          }),
        });
        if (r.ok) {
          const d = await r.json();
          const videoDataUrl = typeof d?.video === "string" ? d.video : null;
          // Strip the data: prefix before saving — zip.file later uses
          // the bare base64 with { base64: true }.
          const videoB64 = videoDataUrl ? (videoDataUrl.split(",")[1] || "") : "";
          updateItem(item.id, (i) => ({ ...i, hasVideo: true, videoB64 }));
          if (videoDataUrl) setPreviewVideoUrl(videoDataUrl);
        }
      } catch {
        // non-fatal — leave hasVideo=false; user can retry from dashboard
      }
      setGeneratingPreviewVideo(false);

      // Hold so the user can SEE the video appear on Export before moving on.
      await new Promise((r) => setTimeout(r, 1500));
    }

    if (isCancelled()) {
      updateState((prev) => ({ ...prev, active: false, currentItemId: null }));
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // STAGE 3 — Listing copy (title / description / tags / price) for ALL
    //   items that already have a chart.  Generated by Gemini via
    //   /api/etsy/generate-listing.  Background mode (2026-05-16): no
    //   tab switch — listingCopy lands on each item via updateItem so
    //   the ✓copy pill lights up in the dashboard panel.
    // ═══════════════════════════════════════════════════════════════
    const itemsForCopy = (autoPipelineStateRef.current?.items || []).filter(
      (i) => i.patternFull && (!i.listingCopy || (i.listingCopy.tags?.length || 0) === 0),
    );

    for (const item of itemsForCopy) {
      if (isCancelled()) break;
      updateItem(item.id, (i) => ({ ...i, status: "writing" as const }));

      // Mirror Stage 2A/2B: load this item into single-design state so the
      // List tab's form is bound to the right pattern while copy generates.
      setSourceImage(item.cleanImageUrl!);
      setPattern({
        grid: item.patternFull!.grid,
        colors: item.patternFull!.colors,
        width: item.patternFull!.width,
        height: item.patternFull!.height,
        totalStitches: item.patternFull!.totalStitches,
        backgroundDmc: item.patternFull!.backgroundDmc,
        totalCells: item.patternFull!.totalCells,
        stitchedCells: item.patternFull!.stitchedCells,
        backgroundRemovedCells: item.patternFull!.backgroundRemovedCells,
        patternPdfB64: item.patternFull!.patternPdfB64,
      });
      // Clear previous form values so the user visibly sees fresh copy land.
      setListTitle("");
      setListDescription("");
      setListTags("");

      try {
        const r = await fetch("/api/etsy/generate-listing", {
          method: "POST", headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(45_000),
          body: JSON.stringify({
            templateType: "cross_stitch_pattern",
            productFormat: "PDF Pattern",
            features: [item.title],
            niche: "cross-stitch patterns",
            targetAudience: "stitchers, crafters, gift buyers",
            aesthetic: "kawaii cottagecore",
          }),
        });
        if (r.ok) {
          const d = await r.json();
          // The route wraps the payload as { listing: {...} } — fall back
          // to flat shape just in case.
          const listing = d.listing || d;
          const title = typeof listing.title === "string" ? listing.title : item.title;
          const description = typeof listing.description === "string" ? listing.description : "";
          const tags = Array.isArray(listing.tags) ? listing.tags.slice(0, 13) : [];
          // Hard-lock to CROSS_STITCH_LISTING_PRICE_NUMBER regardless of
          // what Gemini suggests — user directive: all cross-stitch listings
          // ship at a flat $4.34.  Ignore listing.price entirely.
          const price = CROSS_STITCH_LISTING_PRICE_NUMBER;

          updateItem(item.id, (i) => ({
            ...i,
            listingCopy: { title, description, tags, price },
          }));
          // Populate List tab so the user SEES the generated copy.
          setListTitle(title);
          setListDescription(description);
          setListTags(tags.join(", "));
          setListPrice(CROSS_STITCH_LISTING_PRICE);
        }
      } catch {
        // non-fatal — leave listingCopy empty; user can retry from dashboard
      }

      // Hold so the user can SEE the copy appear before moving to the next.
      await new Promise((r) => setTimeout(r, 1500));
    }

    if (isCancelled()) {
      updateState((prev) => ({ ...prev, active: false, currentItemId: null }));
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // STAGE 4 — Land on the Preview tab so the user sees the full
    //   approval queue (all items with chart + mockups + video + copy).
    //   The Preview tab already renders the Auto-Pipeline Queue as
    //   approve/remove cards; we just need to switch to it.  Final stop
    //   per spec — user manually approves to publish to Etsy from here.
    //
    //   Stale-info-card fix: the auto-info-cards effect (~line 8039)
    //   captured pattern at Stage 2A's first iteration and locked
    //   triggerRef=true.  By Preview the Listing Preview embeds the
    //   FIRST item's stitch-count character even when the LAST item's
    //   pattern is in single-design state — visible mix.  Reset both
    //   so the effect re-fires here against the now-current pattern
    //   (last item loaded in Stage 3) and regenerates matching cards.
    // ═══════════════════════════════════════════════════════════════
    setListingImages([]);
    autoInfoCardsTriggeredRef.current = false;
    // Background mode (2026-05-16): no auto tab switch even at the
    // end.  Dashboard panel flips to "complete" + the per-item
    // approveAndListItem function generates its own info cards inline,
    // so we don't need to land on Preview to trigger the auto-effect.
    // User clicks Preview manually when ready to publish.

    updateState((prev) => ({
      ...prev,
      active: false,
      currentItemId: null,
      items: prev.items.map((i) => i.patternFull ? { ...i, status: "done" as const, completedAt: i.completedAt || Date.now() } : i),
    }));
    return;
  }, [renderChartAsImage]);



  // Auto-resume RE-ENABLED 2026-05-16 with idempotency guards.
  //
  // User's actual frustration: pipeline died mid-run when they navigated
  // away or refreshed, leaving paid-for gen+flatten work ($0.08/item)
  // unusable because mockups never ran.  Disabling auto-resume entirely
  // (previous attempt) didn't fix that — it just left orphaned items.
  //
  // Now:
  //   1. Stage 1A SKIPS items that already have imageUrl+cleanImageUrl
  //      (idempotency guard added earlier).  No double-charge for gen.
  //   2. Stages 1B/1C/2A/2B/3 use data-presence filters that auto-skip
  //      completed work, so resume only does what's missing.
  //   3. We only resume when there's GENUINE unfinished work — items
  //      with `queued` status AND a startedAt within the last 4 hours.
  //      Older items are considered abandoned (cleared by the stale
  //      cleanup effect below) so the user isn't ambushed by an
  //      auto-restart of a queue they forgot about.
  // Client-side auto-resume + stale-cleanup — RETIRED 2026-05-16.
  // The server-side orchestrator at /api/cross-stitch/pipeline/* now
  // owns continuation (Stage 1A skips items with imageUrl set, so
  // resume = picking back up where it left off) and stale pruning
  // (auto_pipeline_jobs table drops rows >72h via pruneOldJobs in
  // src/lib/auto-pipeline-jobs.ts).  The rehydrate-and-poll effect
  // earlier in this file is the only mechanism that touches
  // autoPipelineState on mount.
  const autoResumeAttemptedRef = useRef(false);
  // Intentionally no useEffect — see comment above.
  void autoResumeAttemptedRef;

  // Server-side job ID for the currently-tracked pipeline run.  When
  // set, a polling effect (below) keeps autoPipelineState in sync with
  // the server's auto_pipeline_jobs row.  Per user 2026-05-16: pipeline
  // must survive page refresh, navigation, tab close, and laptop close
  // — so it runs server-side as a fire-and-forget async loop after
  // /api/cross-stitch/pipeline/start returns.
  const [pipelineJobId, setPipelineJobId] = useState<string | null>(null);
  const pipelineJobIdRef = useRef<string | null>(null);
  useEffect(() => { pipelineJobIdRef.current = pipelineJobId; }, [pipelineJobId]);

  // Helper: convert a server job row into the AutoPipelineState shape
  // the UI already knows how to render.  This is the single point of
  // truth for "what does the panel show?" — server JSON in, UI state
  // out.  Cost total comes directly from the server (it tracks every
  // gen / flatten / mockup call) so the OpenAI cost badge stays
  // accurate across refreshes.
  const mapServerJobToState = useCallback((job: {
    id: string;
    status: string;
    items: AutoPipelineItem[];
    costUsdSpent: number;
    cancelRequested: boolean;
    startedAt: number;
  }): AutoPipelineState => ({
    jobId: job.id,
    active: job.status === "running" || job.status === "queued",
    cancelled: job.cancelRequested || job.status === "cancelled",
    currentItemId: null,
    items: job.items,
    totalCostUsd: job.costUsdSpent,
    startedAt: job.startedAt,
  }), []);

  const runAutoPipeline = useCallback(async (count: number) => {
    console.log("[auto-pipeline] starting server-side job with count=", count);
    // Read the persisted style preset (set by the Ideas tab UI).
    let style: string | null = null;
    try {
      const raw = typeof window !== "undefined"
        ? localStorage.getItem("cross-stitch-research-ideas-style-v1")
        : null;
      if (raw === "funny" || raw === "bookmarks" || raw === "folk" || raw === "all" || raw === "bestseller") {
        style = raw;
      }
      if (raw === "weird") style = "all"; // retired preset
    } catch { /* ignore */ }

    try {
      const r = await fetch("/api/cross-stitch/pipeline/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, ...(style ? { style } : {}) }),
        signal: AbortSignal.timeout(15_000),
      });
      // Defensive: read as text first so we can give a useful error if the
      // server returned HTML (404 page) or an empty body (route compile error).
      const raw = await r.text();
      let d: { jobId?: string; startedAt?: number; error?: string } = {};
      try {
        d = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(
          `Pipeline route returned non-JSON (HTTP ${r.status}). ` +
          `Likely the dev server hasn't picked up the new /api/cross-stitch/pipeline/start route yet — try restarting "npm run dev".`,
        );
      }
      if (!r.ok) throw new Error(d?.error || `Pipeline start HTTP ${r.status}`);
      if (!d.jobId) throw new Error("Pipeline start response did not include a jobId");
      console.log("[auto-pipeline] server job created:", d.jobId);
      setPipelineJobId(d.jobId);
      // Seed the UI immediately with empty state; the polling effect
      // will fill in items as Gemini returns them.
      const seed: AutoPipelineState = {
        active: true,
        currentItemId: null,
        items: [],
        cancelled: false,
        totalCostUsd: 0,
        startedAt: d.startedAt || Date.now(),
      };
      setAutoPipelineState(seed);
      autoPipelineStateRef.current = seed;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "pipeline start failed";
      console.error("[auto-pipeline] start failed:", msg);
      alert(`Auto-Pipeline failed to start: ${msg}`);
    }
  }, []);

  const fullItemLoadKeysRef = useRef<Set<string>>(new Set());
  const fullItemLoadInFlightRef = useRef<Set<string>>(new Set());

  const needsFullPipelineItem = useCallback((item: AutoPipelineItem): boolean => {
    const slimPattern = !!item.patternFull && ((item.patternFull.grid?.length || 0) === 0 || (item.patternFull.colors?.length || 0) === 0);
    const slimMockups = !!item.mockups?.some((m) => !m.dataUrl);
    return (
      (!!item.hasImage && (!item.imageUrl || !item.cleanImageUrl)) ||
      slimPattern ||
      slimMockups ||
      (!!item.hasVideo && !item.videoB64)
    );
  }, []);

  const fullItemSignature = useCallback((jobId: string, item: AutoPipelineItem): string => {
    return [
      jobId,
      item.id,
      item.status,
      item.hasImage ? "img" : "",
      item.patternFull ? `chart-${item.patternFull.grid?.length || 0}-${item.patternFull.colors?.length || 0}` : "",
      item.hasPdf ? "pdf" : "",
      item.mockups ? `mock-${item.mockups.length}-${item.mockups.filter((m) => !!m.dataUrl).length}` : "",
      item.hasVideo ? "video" : "",
    ].join(":");
  }, []);

  const loadFullPipelineItem = useCallback(async (jobId: string, item: AutoPipelineItem) => {
    if (!needsFullPipelineItem(item)) return;
    const signature = fullItemSignature(jobId, item);
    const inFlightKey = `${jobId}:${item.id}`;
    if (fullItemLoadKeysRef.current.has(signature) || fullItemLoadInFlightRef.current.has(inFlightKey)) return;
    fullItemLoadInFlightRef.current.add(inFlightKey);
    try {
      const ir = await fetch(`/api/cross-stitch/pipeline/${jobId}?item=${item.id}&full=true`, {
        cache: "no-store",
      }).catch((err) => {
        console.warn(`[auto-pipeline] full item fetch failed for ${item.id}:`, err instanceof Error ? err.message : "network error");
        return null;
      });
      if (!ir) return;
      if (!ir.ok) return;
      const id = (await ir.json()) as { item?: AutoPipelineItem };
      if (!id.item) return;
      const fullItem = id.item;
      const prev: AutoPipelineState | null = autoPipelineStateRef.current;
      if (!prev) return;
      const updated: AutoPipelineState = {
        ...prev,
        items: prev.items.map((existing: AutoPipelineItem) =>
          existing.id === fullItem.id ? { ...existing, ...fullItem } : existing,
        ),
      };
      fullItemLoadKeysRef.current.add(signature);
      autoPipelineStateRef.current = updated;
      setAutoPipelineState(updated);
    } catch (err) {
      console.warn(`[auto-pipeline] full item load failed for ${item.id}:`, (err as Error).message);
    } finally {
      fullItemLoadInFlightRef.current.delete(inFlightKey);
    }
  }, [fullItemSignature, needsFullPipelineItem]);

  // Merge slim server items into local items, preserving heavy fields
  // (mockups dataUrls, patternFull grid/colors, videoB64, image data URLs).
  // The slim endpoint sends mockups with empty dataUrl strings and an
  // empty patternFull.grid/colors; those would clobber thumbnails if
  // we did a straight replace.  See lib/auto-pipeline-jobs.ts → slimJob.
  const mergeServerItems = useCallback((
    serverItems: AutoPipelineItem[],
    localItems: AutoPipelineItem[],
  ): AutoPipelineItem[] => {
    const localById = new Map(localItems.map((i) => [i.id, i]));
    return serverItems.map((s) => {
      const local = localById.get(s.id);
      if (!local) return s; // new item, take server version verbatim
      // Take ALL light fields from server (status, error, listingCopy, flags...),
      // but keep heavy fields from local if local has them and server's are empty.
      const mockups = (s.mockups && s.mockups.some((m) => m.dataUrl))
        ? s.mockups
        : (local.mockups || s.mockups);
      const patternFull = (s.patternFull && s.patternFull.grid?.length > 0)
        ? s.patternFull
        : (local.patternFull || s.patternFull);
      return {
        ...s,
        mockups,
        patternFull,
        imageUrl: s.imageUrl || local.imageUrl,
        cleanImageUrl: s.cleanImageUrl || local.cleanImageUrl,
        videoB64: s.videoB64 || local.videoB64,
        pdfBundleB64: s.pdfBundleB64 || local.pdfBundleB64,
      };
    });
  }, []);

  // ── Rehydrate on mount: GET /active and adopt any recent job ──
  // Runs once per page load so a refresh / navigation back to the
  // page picks up the in-flight pipeline.  Uses SLIM mode so the
  // initial fetch is ~7 KB instead of ~100 MB.  After the slim fetch
  // succeeds, we lazy-load each item's heavy data (mockups, video,
  // pattern grid) sequentially — every fetch hits SQLite only, costs
  // $0, and yields control between items so the tab stays responsive.
  const rehydrateRanRef = useRef(false);
  useEffect(() => {
    if (rehydrateRanRef.current) return;
    rehydrateRanRef.current = true;
    (async () => {
      try {
        const r = await fetch("/api/cross-stitch/pipeline/active", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { job: null | Parameters<typeof mapServerJobToState>[0] };
        if (!d.job) return;
        // Adopt the slim job snapshot first so the UI renders.
        const jobId = d.job.id;
        if (d.job.status === "queued" || d.job.status === "running") {
          setPipelineJobId(jobId);
        }
        const next = mapServerJobToState(d.job);
        setAutoPipelineState(next);
        autoPipelineStateRef.current = next;
        console.log(`[auto-pipeline] rehydrated job ${jobId} (status=${d.job.status})`);

        // Lazy-load heavy fields for each item, one at a time.  Each
        // response is ~15–20 MB but we only hold ONE in transit, then
        // merge it into state and let the browser GC the JSON before
        // the next fetch.  This keeps peak memory low.
        for (const slimItem of d.job.items) {
          await loadFullPipelineItem(jobId, slimItem);
        }
        console.log(`[auto-pipeline] lazy-load complete for ${d.job.items.length} items`);
      } catch (err) {
        console.warn("[auto-pipeline] rehydrate failed (non-fatal):", (err as Error).message);
      }
    })();
  }, [loadFullPipelineItem, mapServerJobToState]);

  // ── Poll the server job every 5s while the pipeline is active ──
  // Stops when status flips to completed / cancelled / failed (server
  // is the source of truth).  Uses SLIM mode — payload is ~2 KB per
  // tick instead of ~100 MB.  Heavy fields (mockup dataUrls, video,
  // pattern grid) are preserved from local state via mergeServerItems.
  useEffect(() => {
    if (!pipelineJobId) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    let pollInFlight = false;
    const poll = async () => {
      if (pollInFlight) return;
      pollInFlight = true;
      try {
        const r = await fetch(`/api/cross-stitch/pipeline/${pipelineJobId}`, { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { job: Parameters<typeof mapServerJobToState>[0] };
        if (cancelled || !d.job) return;
        const localItems = autoPipelineStateRef.current?.items || [];
        const mergedJob = { ...d.job, items: mergeServerItems(d.job.items, localItems) };
        const next = mapServerJobToState(mergedJob);
        setAutoPipelineState(next);
        autoPipelineStateRef.current = next;
        // If the server already considers the job done, stop here. The
        // full item payload can be very large; polling a completed job
        // only needs the slim terminal state and should not trigger
        // extra heavy fetches that can surface Chrome "Failed to fetch"
        // overlays when the dev server restarts.
        if (d.job.status === "completed" || d.job.status === "cancelled" || d.job.status === "failed") {
          console.log(`[auto-pipeline] job ${d.job.id} reached terminal status: ${d.job.status}`);
          if (interval) clearInterval(interval);
          setPipelineJobId(null);
          return;
        }
        for (const item of next.items) {
          if (needsFullPipelineItem(item)) {
            void loadFullPipelineItem(d.job.id, item).catch((err) => {
              console.warn("[auto-pipeline] full item lazy-load failed:", (err as Error).message);
            });
          }
        }
      } catch (err) {
        console.warn("[auto-pipeline] poll failed:", (err as Error).message);
      } finally {
        pollInFlight = false;
      }
    };
    void poll(); // immediate first tick
    interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [pipelineJobId, mapServerJobToState, mergeServerItems, needsFullPipelineItem, loadFullPipelineItem]);

  // Approve handler — the button click is the explicit seller action.
  // The route still creates a draft first because Etsy requires files to
  // be attached before activation; this flow activates after uploads.
  const approveAndListItem = useCallback(async (
    item: AutoPipelineItem,
    _options: { skipConfirmation?: boolean } = {},
  ) => {
    if (!item.listingCopy || !item.patternFull) {
      alert("Listing copy or pattern is missing. Try regenerating or remove.");
      return;
    }

    const safeTitle = normalizeEtsyTitle(item.listingCopy.title, "cross-stitch");
    const safeTags = item.listingCopy.tags
      .map((t) => t.trim().substring(0, 20))
      .filter(Boolean)
      .slice(0, 13);
    // Etsy's digital-file filename rules: 3–70 chars, only [a-zA-Z0-9-_.].
    // Spaces, pipes, slashes are rejected — the previous code passed
    // item.title raw (100+ chars with " | " separators) and Etsy 400'd
    // mid-upload.  Slugify aggressively: lowercase, collapse non-alnum
    // to hyphen, trim, cap at 40 chars so suffix + .pdf fit under 70.
    const safeName = (() => {
      const slug = (item.title || "cross-stitch")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40)
        .replace(/-+$/g, "");
      return slug.length >= 3 ? slug : "cross-stitch";
    })();
    // Mark the item as publishing + write the live progress text so the
    // card renders an inline progress line ("3/8 Uploading images…").
    // Replaces the previous error-field hack which only showed on the
    // failed render path.
    const setStatus = (s: string) => {
      setAutoPipelineState((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          items: prev.items.map((i) =>
            i.id === item.id ? { ...i, status: "publishing" as const, publishProgress: s } : i,
          ),
        };
        autoPipelineStateRef.current = next;
        return next;
      });
    };

    // Etsy v3 enforces a ~10 req/sec per-token rate limit.  Any call in
    // the publish flow can transiently return "Exceeded per second rate
    // limit"; the cure is just to wait briefly and retry.  This wrapper
    // does that with exponential backoff (1s, 2s, 4s, then give up) and
    // also adds a small inter-call cushion so back-to-back uploads
    // don't immediately re-trip the limit.
    const etsyFetch = async (url: string, init: RequestInit, label: string): Promise<Response> => {
      const isRateLimited = (txt: string) =>
        /rate limit|too many requests|exceeded per second/i.test(txt);
      const lastErr = "";
      for (let attempt = 0; attempt < 4; attempt++) {
        let r: Response;
        try {
          r = await fetch(url, init);
        } catch (err) {
          const raw = err instanceof Error ? err.message : "network error";
          throw new Error(`${label} failed before the server replied: ${raw}. Make sure CraftPlan is running on http://localhost:3461, then retry.`);
        }
        if (r.ok) return r;
        // Clone before reading so callers can still parse if we return it.
        const txt = await r.clone().text();
        if (r.status === 429 || isRateLimited(txt)) {
          const waitMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s, 8s
          setStatus(`${label} — rate-limited, retrying in ${waitMs / 1000}s…`);
          await new Promise((res) => setTimeout(res, waitMs));
          continue;
        }
        // Non-rate-limit error — return the response so caller surfaces it.
        return r;
      }
      throw new Error(`${label} — Etsy rate limit didn't clear after 4 retries. ${lastErr}`);
    };
    // Tiny cushion between Etsy-touching calls.  Etsy's docs say the
    // per-second window resets each second, so 250ms keeps us at ~4 req/s
    // worst-case — well under the 10/s ceiling.
    const cushion = () => new Promise((r) => setTimeout(r, 250));

    try {
      // ── Step 1: Create draft listing (Etsy v3 requires draft state
      //   before digital files can be attached; we activate at the end) ──
      setStatus("1/8 Creating listing on Etsy…");
      const resp = await etsyFetch("/api/cross-stitch/list-on-etsy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: safeTitle,
          description: item.listingCopy.description,
          price: CROSS_STITCH_LISTING_PRICE_NUMBER,
          tags: safeTags,
          // SEO attributes — color/theme/holiday/recipient.  Without
          // these, Etsy's filter-narrowed searches can't surface the
          // listing.  Forwarded as-is to list-on-etsy which calls
          // applyListingAttributes() in the Etsy client.
          attributes: item.listingCopy.attributes,
        }),
      }, "Creating listing");
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || `Etsy listing failed (HTTP ${resp.status})`);
      const listingId = data.listing_id;
      const productId = data.productId || data.product_id;
      await cushion();

      // ── Step 2: Render the 4 info cards (stitch-count, pattern-example,
      //   pdf-contents, digital-notice) from the item's pattern so they
      //   embed the matching character — same as the in-app gallery. ──
      setStatus("2/8 Rendering info cards…");
      const patternForCards = {
        grid: item.patternFull.grid,
        colors: item.patternFull.colors,
        width: item.patternFull.width,
        height: item.patternFull.height,
        totalStitches: item.patternFull.totalStitches,
        backgroundDmc: item.patternFull.backgroundDmc,
        totalCells: item.patternFull.totalCells,
        stitchedCells: item.patternFull.stitchedCells,
        backgroundRemovedCells: item.patternFull.backgroundRemovedCells,
        patternPdfB64: item.patternFull.patternPdfB64,
      };
      const infoCards = await generateAllListingImagesAsync(
        patternForCards,
        item.imageUrl || null,
        null,
      );

      // ── Step 3: Build the gallery image list (max 10 Etsy slots). ──
      //   Order matters: mockups first (highest-converting hero scenes),
      //   then info cards, then the finished-look render as a fallback.
      const allImages: string[] = [];
      for (const m of item.mockups || []) {
        if (m.dataUrl) allImages.push(m.dataUrl);
      }
      for (const c of infoCards) {
        allImages.push(c);
      }
      if (item.imageUrl) allImages.push(item.imageUrl);

      // ── Step 4: Upload each image (cap at 10 — Etsy hard limit). ──
      // Each image gets keyword-rich alt text for image-search SEO.
      // Per-image labels match the rank order set in Step 3 (4 mockups
      // → 4 info cards → finished look).  Phase 2 SEO fix 2026-05-17.
      const imgTotal = Math.min(allImages.length, 10);
      const altTextForRank = (rank: number): string => {
        const subject = item.listingCopy?.title?.replace(/\(.*\)$/, "").trim() || item.title;
        if (rank === 1) return `${subject} — Etsy thumbnail mockup, cottagecore cross stitch pattern in embroidery hoop`;
        if (rank <= 4) return `${subject} — finished cross stitch in lifestyle scene, hand-stitched on Aida cloth`;
        if (rank === 5) return `${subject} — DMC color chart and stitch count detail card`;
        if (rank === 6) return `${subject} — pattern example showing color symbols and grid chart`;
        if (rank === 7) return `${subject} — PDF contents preview, what's included in this digital download`;
        if (rank === 8) return `${subject} — digital pattern, instant download, no physical item shipped`;
        return `${subject} — cross stitch pattern PDF download`;
      };
      for (let i = 0; i < imgTotal; i++) {
        setStatus(`3/8 Uploading images (${i + 1}/${imgTotal})…`);
        const imgResp = await etsyFetch("/api/etsy/listing-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listingId,
            image: allImages[i],
            rank: i + 1,
            altText: altTextForRank(i + 1),
          }),
        }, `Image ${i + 1}`);
        if (!imgResp.ok) {
          const err = await imgResp.json().catch(() => ({}));
          console.error(`[approve] image ${i + 1} upload failed:`, err.error);
        }
        await cushion();
      }

      // ── Step 5: Upload the listing video if we have one. ──
      if (item.videoB64) {
        setStatus("4/8 Uploading listing video…");
        try {
          const videoDataUrl = `data:video/mp4;base64,${item.videoB64}`;
          const vResp = await etsyFetch("/api/etsy/listing-upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ listingId, video: videoDataUrl }),
          }, "Video upload");
          if (!vResp.ok) {
            const verr = await vResp.json().catch(() => ({}));
            console.error("[approve] video upload failed:", verr.error);
          }
          await cushion();
        } catch (verr) {
          console.error("[approve] video step error:", verr);
        }
      }

      // ── Step 6: Generate + upload 5 PDF variants (Etsy caps at 5
      //   digital files per listing — matches single-design behaviour). ──
      const pdfVariants = [
        { key: "colorSymbols" as const, suffix: "ColorSymbols" },
        { key: "bwSymbols" as const, suffix: "BlackAndWhiteSymbols" },
        { key: "onePageColor" as const, suffix: "OnePageColor" },
        { key: "onePageBw" as const, suffix: "OnePageBlackAndWhite" },
        { key: "patternKeeper" as const, suffix: "PatternKeeper" },
      ];
      const ETSY_DIGITAL_FILE_MAX_BYTES = 20 * 1024 * 1024;
      for (let pi = 0; pi < pdfVariants.length; pi++) {
        const v = pdfVariants[pi];
        setStatus(`5/8 Generating PDFs (${pi + 1}/${pdfVariants.length}) — ${v.suffix}…`);
        const pdfResp = await fetch("/api/cross-stitch/export-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pattern: item.patternFull, name: safeName, variant: v.key }),
        });
        if (!pdfResp.ok) throw new Error(`Failed to generate ${v.suffix} PDF`);
        const blob = await pdfResp.blob();
        if (blob.size > ETSY_DIGITAL_FILE_MAX_BYTES) {
          throw new Error(`${v.suffix}.pdf is ${(blob.size / 1024 / 1024).toFixed(1)} MB — exceeds Etsy's 20 MB digital-file limit.`);
        }
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        setStatus(`6/8 Uploading digital files (${pi + 1}/${pdfVariants.length})…`);
        const fileResp = await etsyFetch("/api/etsy/listing-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listingId,
            file: base64,
            filename: `${safeName}-${v.suffix}.pdf`,
          }),
        }, `PDF ${pi + 1}/${pdfVariants.length}`);
        if (!fileResp.ok) {
          const fileErr = await fileResp.json().catch(() => ({}));
          throw new Error(`Failed to upload ${v.suffix}.pdf: ${fileErr.error || "unknown"}`);
        }
        await cushion();
      }

      // ── Step 7: Activate — flip draft → LIVE.  This is the moment
      //   the listing becomes buyer-visible.  Required Etsy listing fee
      //   of $0.20 hits the seller's account here. ──
      setStatus("7/8 Activating listing on Etsy…");
      const actResp = await etsyFetch("/api/etsy/listing-activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, productId, confirmLivePublish: true }),
      }, "Activation");
      if (!actResp.ok) {
        const actErr = await actResp.json().catch(() => ({}));
        throw new Error(`Failed to activate listing: ${actErr.error || "unknown"}`);
      }

      // Mark as listed + REMOVE from the queue per user 2026-05-16:
      // once an item is LIVE on Etsy, drop it from the Preview cards
      // (it's done its job).  Show one final "8/8 LIVE on Etsy ✓"
      // progress flicker for ~600ms so the user sees confirmation
      // before the card disappears.  Bulk publish flow benefits from
      // this too — cards vanish one-by-one as each item goes live.
      setStatus("8/8 LIVE on Etsy ✓");
      setAutoPipelineState((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          items: prev.items.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  etsyListingId: String(listingId),
                  status: "done" as const,
                  publishProgress: undefined,
                  error: undefined,
                }
              : i,
          ),
        };
        autoPipelineStateRef.current = next;
        return next;
      });
      // Brief delay so user catches the success flicker, then drop.
      // Mirror the removal to the server so the next poll doesn't bring
      // the item back from the dead.
      setTimeout(async () => {
        const prev = autoPipelineStateRef.current;
        if (!prev) return;
        const remaining = prev.items.filter((i) => i.id !== item.id);
        const next = { ...prev, items: remaining };
        autoPipelineStateRef.current = next;
        setAutoPipelineState(next);
        const jobId = prev.jobId || pipelineJobIdRef.current;
        if (jobId) {
          try {
            await fetch(`/api/cross-stitch/pipeline/${jobId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ items: remaining }),
            });
          } catch { /* non-fatal */ }
        }
      }, 600);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      // Surface the failure on the card and revert status so the Approve
      // button reappears for retry.
      setAutoPipelineState((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          items: prev.items.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: "done" as const,
                  publishProgress: undefined,
                  error: `Publish failed: ${msg}`,
                }
              : i,
          ),
        };
        autoPipelineStateRef.current = next;
        return next;
      });
      alert(`Etsy listing failed: ${msg}\n\nThe draft may have been partially created — check your Etsy shop drafts.`);
    }
  }, []);

  // Sequential bulk publish — iterate every "done" item that has copy
  // but no Etsy listing yet, and run the full Approve flow for each.
  // Cushion between items so Etsy's rate limiter doesn't trip even
  // though each item's own retry logic would catch it.  Skips items
  // that fail (their card flips back to Approve so user can retry).
  const [bulkPublishing, setBulkPublishing] = useState(false);

  // SEO scoring helper — runs client-side on each item's listing copy
  // before publish so the user can SEE at a glance whether the SEO is
  // strong (long-tail tags, no title duplication, has attributes).
  // Phase 3.3 SEO 2026-05-17.
  const scoreListingSEO = useCallback((lc?: { title: string; description: string; tags: string[]; attributes?: { primaryColor?: string; theme?: string; holiday?: string; recipient?: string } } | undefined): { score: number; flags: string[] } => {
    if (!lc) return { score: 0, flags: ["no listing copy"] };
    const flags: string[] = [];
    let score = 100;
    const title = (lc.title || "").toLowerCase();
    const titleHasCrossStitchPattern = /cross\s*stitch\s*pattern/i.test(title);
    if (!titleHasCrossStitchPattern) { score -= 15; flags.push("title missing 'Cross Stitch Pattern'"); }
    if (title.length > 110) { score -= 10; flags.push("title >110 chars (truncated by Etsy)"); }
    if (title.length < 40) { score -= 10; flags.push("title <40 chars (under-using keyword space)"); }

    const tags = lc.tags || [];
    if (tags.length < 13) { score -= 10; flags.push(`only ${tags.length}/13 tags`); }
    const singleWordTags = tags.filter((t) => t.trim().split(/\s+/).length < 2);
    if (singleWordTags.length > 0) {
      score -= 5 * singleWordTags.length;
      flags.push(`${singleWordTags.length} single-word tag(s): ${singleWordTags.join(", ")}`);
    }
    const titleDups = tags.filter((t) => title.includes(t.toLowerCase()) && t.split(/\s+/).length >= 2);
    if (titleDups.length > 0) { score -= 4 * titleDups.length; flags.push(`${titleDups.length} tag(s) duplicate title`); }

    const desc = (lc.description || "");
    const first160 = desc.slice(0, 160).toLowerCase();
    const subjectWords = title.replace(/cross\s*stitch\s*pattern/gi, "").split(/[|,()]/)[0].trim().split(/\s+/).slice(0, 3);
    const subjectInFirst160 = subjectWords.length > 0 && subjectWords.every((w) => w.length < 3 || first160.includes(w.toLowerCase()));
    if (!subjectInFirst160) { score -= 10; flags.push("first 160 chars of description missing subject keyword"); }

    if (!lc.attributes?.primaryColor) { score -= 8; flags.push("no primary color attribute"); }
    if (!lc.attributes?.theme) { score -= 5; flags.push("no theme attribute"); }

    score = Math.max(0, Math.min(100, score));
    return { score, flags };
  }, []);
  const approveAllItems = useCallback(async () => {
    if (bulkPublishing) return;
    const eligible = (autoPipelineStateRef.current?.items || []).filter(
      (i) => i.status === "done" && !i.etsyListingId && i.listingCopy && i.patternFull,
    );
    if (eligible.length === 0) return;
    setBulkPublishing(true);
    try {
      for (const item of eligible) {
        // Re-read from the ref each iteration in case prior approves
        // updated the queue (e.g., flipped earlier items to listed).
        const fresh = autoPipelineStateRef.current?.items.find((x) => x.id === item.id);
        if (!fresh || fresh.etsyListingId) continue;
        await approveAndListItem(fresh, { skipConfirmation: true });
        // Cushion between items — Etsy v3 caps at ~10 req/sec per token
        // and each item burns ~20 requests during its own flow.
        await new Promise((r) => setTimeout(r, 1500));
      }
    } finally {
      setBulkPublishing(false);
    }
  }, [bulkPublishing, approveAndListItem]);

  // Retry an existing item's missing Phase 2 steps WITHOUT re-paying
  // for the image generation (which we already have).  Use when items
  // are partially complete — e.g., a stale queue from before PDF/video
  // steps were added, or steps that failed silently due to a missing
  // ffmpeg / server hiccup.  Picks up wherever the item left off.
  const retryItemMissingSteps = useCallback(async (itemId: string) => {
    const item = autoPipelineStateRef.current?.items.find((i) => i.id === itemId);
    if (!item) return;
    // Need at least the convert output to retry downstream steps.
    if (!item.patternFull || !item.cleanImageUrl) {
      // Reset to queued so the main orchestrator runs it from scratch.
      setAutoPipelineState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((i) =>
            i.id === itemId
              ? { ...i, status: "queued" as const, error: undefined }
              : i,
          ),
        };
      });
      autoResumeAttemptedRef.current = false;
      return;
    }

    const updateItem = (mut: (i: AutoPipelineItem) => AutoPipelineItem) => {
      const prev = autoPipelineStateRef.current;
      if (!prev) return;
      const next = {
        ...prev,
        items: prev.items.map((i) => (i.id === itemId ? mut(i) : i)),
      };
      autoPipelineStateRef.current = next;
      setAutoPipelineState(next);
    };

    // ── Re-run PDF if missing ──
    if (!item.hasPdf) {
      updateItem((i) => ({ ...i, status: "exporting" as const }));
      try {
        const r = await fetch("/api/cross-stitch/export-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pattern: item.patternFull,
            name: item.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60),
            variant: "bundle",
          }),
        });
        updateItem((i) => ({ ...i, hasPdf: r.ok }));
      } catch { /* non-fatal */ }
    }

    // ── Re-run mockups if missing or short of the target (4) ──
    // Previously only triggered at 0 mockups, but the gpt-image-2 batch
    // sometimes returns 2/4 or 3/4 when OpenAI is briefly degraded.
    // Treat any count < 4 as "needs retry" so the user gets a full gallery.
    // The free-mockup endpoint regenerates ALL 4 fresh ones (it doesn't
    // append) — acceptable trade-off since the free version is $0 cost.
    if (!item.mockups || item.mockups.filter((m) => !!m.dataUrl).length < 4) {
      updateItem((i) => ({ ...i, status: "mocking" as const }));
      try {
        const chartImg = renderChartAsImage(
          item.patternFull.grid,
          item.patternFull.colors,
          item.patternFull.backgroundDmc,
        );
        const r = await fetch("/api/cross-stitch/auto-mockup-free", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pattern: chartImg || item.cleanImageUrl, title: item.title }),
        });
        if (r.ok) {
          const d = await r.json();
          const m = (d.images || []).map((x: { scene: string; dataUrl: string }) => ({
            scene: x.scene,
            dataUrl: x.dataUrl,
            hasDataUrl: !!x.dataUrl,
          })).filter((x: { dataUrl?: string }) => !!x.dataUrl);
          // Only overwrite if the retry actually returned more mockups
          // than we currently have — otherwise keep the existing ones.
          updateItem((i) => (
            m.length > (i.mockups?.filter((mockup) => !!mockup.dataUrl).length || 0)
              ? { ...i, mockups: m }
              : i
          ));
        }
      } catch { /* non-fatal */ }
    }

    // ── Re-run video if missing ──
    if (!item.hasVideo) {
      updateItem((i) => ({ ...i, status: "videoing" as const }));
      try {
        const chartImg = renderChartAsImage(
          item.patternFull.grid,
          item.patternFull.colors,
          item.patternFull.backgroundDmc,
        );
        const latestItem = autoPipelineStateRef.current?.items.find((i) => i.id === itemId);
        const r = await fetch("/api/cross-stitch/listing-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patternName: item.title,
            pattern: {
              grid: item.patternFull.grid,
              colors: item.patternFull.colors,
              width: item.patternFull.width,
              height: item.patternFull.height,
            },
            finishedImage: chartImg,
            mockups: (latestItem?.mockups || []).map((m) => m.dataUrl).filter(Boolean),
            lifestyleMode: "none",
          }),
        });
        updateItem((i) => ({ ...i, hasVideo: r.ok }));
      } catch { /* non-fatal */ }
    }

    // ── Re-run listing copy if missing ──
    // Hits the server-side retry-copy endpoint, which calls generate-listing
    // AND writes the result back to SQLite via patchItem().  The next 2 s
    // poll picks up the new copy from the server and updates local state.
    // This closes the loop that previously had retry update only client
    // state — which the next poll would immediately clobber with the
    // (still empty) server state.
    if (!item.listingCopy || item.listingCopy.tags.length === 0) {
      const jobId = pipelineJobId;
      if (!jobId) {
        updateItem((i) => ({ ...i, error: "no job id — refresh the page" }));
      } else {
        updateItem((i) => ({ ...i, status: "writing" as const, error: undefined }));
        try {
          const r = await fetch(`/api/cross-stitch/pipeline/${jobId}/retry-copy`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(180_000),
            body: JSON.stringify({ itemId: item.id }),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok || !d.ok) {
            const msg = d.error || `retry-copy HTTP ${r.status}`;
            console.warn(`[retry] ${msg}`);
            updateItem((i) => ({ ...i, error: msg }));
          }
          // On success: nothing to do here — the next poll will pull the
          // newly-saved listingCopy from the server and update state.
        } catch (err) {
          const msg = `retry-copy failed: ${(err as Error).message}`;
          console.warn(`[retry] ${msg}`);
          updateItem((i) => ({ ...i, error: msg }));
        }
      }
    }

    // Mark as done
    updateItem((i) => ({ ...i, status: "done" as const, completedAt: Date.now() }));
  }, [renderChartAsImage, pipelineJobId]);

  // Retry every item in the queue that's missing any Phase 2 asset.
  // Runs them sequentially.  Cheap because we don't pay for the image
  // generation again — only the missing downstream assets.
  const retryAllMissingAssets = useCallback(async () => {
    const items = autoPipelineStateRef.current?.items || [];
    const needsWork = items.filter((i) =>
      i.status === "done" &&
      (!i.hasPdf || !i.mockups || i.mockups.filter((m) => !!m.dataUrl).length < 4 || !i.hasVideo || !i.listingCopy || i.listingCopy.tags.length === 0),
    );
    if (needsWork.length === 0) {
      alert("All items already have a full asset set. Nothing to retry.");
      return;
    }
    if (!confirm(`Retry missing assets for ${needsWork.length} item${needsWork.length === 1 ? "" : "s"}?\n\nNo new gpt-image-2 calls — just fills in PDFs, mockups, video, listing copy. ~$${(0.01 * needsWork.length).toFixed(2)} total.`)) {
      return;
    }
    setAutoPipelineState((prev) => prev ? { ...prev, active: true } : prev);
    for (const item of needsWork) {
      await retryItemMissingSteps(item.id);
    }
    setAutoPipelineState((prev) => prev ? { ...prev, active: false, currentItemId: null } : prev);
  }, [retryItemMissingSteps]);

  // Remove handler for the Preview queue.
  const removeAutoPipelineItem = useCallback((itemId: string) => {
    setAutoPipelineState((prev) => {
      if (!prev) return prev;
      const next = { ...prev, items: prev.items.filter((i) => i.id !== itemId) };
      return next.items.length === 0 ? null : next;
    });
  }, []);

  // ── Preview-and-pick gallery ──────────────────────────────────────
  // Generate 4 cheap FAL variants in parallel (~$0.012 total), show
  // them in a 2x2 grid, user clicks the best one → that becomes the
  // sourceImage and the gallery clears.  Eliminates the wasted $0.04
  // per "unlucky" gpt-image-2 generation by letting the user filter
  // visually before committing to convert.
  const [previewVariants, setPreviewVariants] = useState<
    Array<{ dataUrl: string; cleanDataUrl: string }>
  >([]);
  const [generatingVariants, setGeneratingVariants] = useState(false);

  async function generatePreviewVariants() {
    const prompt = designPrompt.trim();
    if (!prompt || generatingVariants || generatingForConvert) return;
    setGeneratingVariants(true);
    setPreviewVariants([]);
    try {
      // 4 parallel FAL calls.  Each is ~2-4s, so wall-clock is ~4s
      // total instead of 16s sequential.  Failures of individual
      // requests are non-fatal — we keep whatever succeeded.
      const results = await Promise.allSettled(
        Array.from({ length: 4 }, () =>
          fetch("/api/cross-stitch/generate-design", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description: prompt,
              style: "nala-beginner",
              styleHint: sellerStyleHint || undefined,
              engine: "fal-fast",
              referenceImageUrl: undefined,
            }),
          }).then(async (r) => {
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d?.dataUrl) throw new Error(d?.error || `HTTP ${r.status}`);
            return {
              dataUrl: d.dataUrl as string,
              cleanDataUrl: (d.cleanConvertDataUrl as string | undefined) || d.dataUrl as string,
            };
          }),
        ),
      );
      const variants = results
        .filter((r): r is PromiseFulfilledResult<{ dataUrl: string; cleanDataUrl: string }> => r.status === "fulfilled")
        .map((r) => r.value);
      if (variants.length === 0) {
        alert("All 4 preview generations failed. Check FAL_KEY and try again.");
      } else {
        setPreviewVariants(variants);
      }
    } catch (err) {
      alert(`Variant generation failed: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setGeneratingVariants(false);
    }
  }

  async function pickPreviewVariant(variant: { dataUrl: string; cleanDataUrl: string }) {
    // Picked variants need the SAME flatten-for-convert pass that the
    // HQ Generate & Clean path runs.  Without it, the raw FAL gradient
    // output goes straight to Python and produces muddy charts (this
    // was the regression the user kept hitting on the Generate & Clean
    // path until 2026-05-14).  Cost: $0.04 once per variant pick — still
    // cheaper than HQ ($0.04) + HQ flatten ($0.04) = $0.08, and you've
    // already filtered visually so you're not wasting the flatten on
    // an unlucky generation.
    setForceSquareNext(true);
    setPreviewVariants([]);   // hide gallery immediately
    setGeneratingForConvert("cleaning");
    try {
      const flatResp = await fetch("/api/cross-stitch/flatten-for-convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: variant.dataUrl }),
      });
      const flatData = await flatResp.json().catch(() => ({}));
      if (!flatResp.ok || !flatData?.flattenedImage) {
        console.warn("[pick-variant] flatten failed; using raw variant");
        setSourceImage(variant.dataUrl);
        setHasFlattenedUpload(false);
      } else {
        setSourceImage(flatData.flattenedImage as string);
        setHasFlattenedUpload(true);
      }
      // Reset all derived state so Convert re-quantizes from the
      // newly-flattened source.  Mirrors generateAndCleanForConvert.
      setPattern(null);
      setCleanedImage(null);
      setCleanedModel(null);
      setRenderedPreview(null);
      setGeneratedDesignUrl(variant.dataUrl);
      setCleanConvertDataUrl(null); // v2 behavior — sourceMode falls to "photo"
      setGeneratedDesignEngine("gpt-image-2");
    } catch (err) {
      console.error("[pick-variant] failed:", err);
      alert(`Variant flatten failed: ${err instanceof Error ? err.message : "unknown"}`);
      // Fall back to using the raw variant so the user isn't stuck
      setSourceImage(variant.dataUrl);
      setHasFlattenedUpload(false);
    } finally {
      setGeneratingForConvert(null);
    }
  }

  async function generateAndCleanForConvert(engineOverride?: "fal-fast" | "gpt-image-2") {
    setForceSquareNext(true);
    const prompt = designPrompt.trim();
    const engine = engineOverride ?? generateEngine;
    if (!prompt || generatingForConvert) return;
    setGeneratingForConvert("generating");
    try {
      // Step 1 — generate.
      // If there's a reference product image, pass it so the engine
      // can use it as visual context (what subject/style to beat).
      const genResp = await fetch("/api/cross-stitch/generate-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: prompt,
          style: "nala-beginner",
          styleHint: sellerStyleHint || undefined,
          engine,
          // Inspiration / reference-image flow RE-ENABLED 2026-05-14.
          // The HQ path now runs flatten-for-convert AFTER generation,
          // which normalizes the vision-guided output to a true flat-
          // vector source before Python sees it.  That flatten step is
          // the great equalizer — chart quality depends on the FLAT
          // input, not on how charming the gpt-image-2 output was.
          referenceImageUrl: refImage || undefined,
        }),
      });
      const genData = await genResp.json().catch(() => ({}));
      if (!genResp.ok || !genData?.dataUrl) {
        throw new Error(
          genData?.error || `generation failed (HTTP ${genResp.status})`,
        );
      }
      const generated = genData.dataUrl as string;

      // Step 2 — flatten.
      // RESTORED 2026-05-14 to v2 backup behavior.  Earlier this session I
      // had removed this call thinking the nala-beginner server SOFT skip
      // made it redundant.  That was wrong — for nala-beginner the server
      // returns `cleanConvertDataUrl = dataUrl` (the RAW gpt-image-2 output
      // with subtle gradients), and the missing flatten-for-convert pass
      // is what produced the muddy charts the user kept reporting.  The
      // flatten-for-convert prompt is STRONGER than the server SOFT pass:
      // it forces every region to a single solid flat color (zero
      // gradients, zero shading, zero texture).  Python then receives a
      // truly flat-vector image and KMeans produces clean color regions.
      //
      // Only runs for the HQ gpt-image-2 path.  For Fast (FAL Schnell),
      // we skip the $0.04 flatten and accept slightly more muddy output
      // — Fast is meant for cheap iteration, not final production.
      if (engine === "gpt-image-2") {
        setGeneratingForConvert("cleaning");
        const flatResp = await fetch("/api/cross-stitch/flatten-for-convert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: generated }),
        });
        const flatData = await flatResp.json().catch(() => ({}));
        if (!flatResp.ok || !flatData?.flattenedImage) {
          console.warn("[generate-and-clean] flatten failed; using raw gen");
          setSourceImage(generated);
          setHasFlattenedUpload(false);
        } else {
          setSourceImage(flatData.flattenedImage as string);
          setHasFlattenedUpload(true);
        }
      } else {
        // Fast / FAL — skip flatten to keep this path cheap.
        setSourceImage(generated);
        setHasFlattenedUpload(true);
      }

      // Drop any state derived from a previous source so Convert
      // re-quantizes from the new image.
      setPattern(null);
      setCleanedImage(null);
      setCleanedModel(null);
      setRenderedPreview(null);
      setGeneratedDesignUrl(generated);
      // V2 behavior: clear cleanConvertDataUrl so convertViaPython's
      // sourceMode gate falls through to "photo" mode.  V2 paired a
      // truly-flattened source (from flatten-for-convert) with photo-
      // mode Python, which produced the proven-good charts.
      setCleanConvertDataUrl(null);
      // Engine state only accepts "flux-free" | "gpt-image-2" | null;
      // collapse fal-fast → gpt-image-2 since both produce nala-style
      // sources that flow through the same downstream pipeline.
      setGeneratedDesignEngine("gpt-image-2");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generate & clean failed";
      console.error("[generate-and-clean] failed:", msg);
      alert(`Generate & Clean failed: ${msg}`);
    } finally {
      setGeneratingForConvert(null);
    }
  }

  /* ── Best Picker: Upload multiple images ── */
  function handlePickerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    const newImages = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => ({ file: f, previewUrl: URL.createObjectURL(f) }));
    setPickerImages((prev) => [...prev, ...newImages]);
    setPickerScores(null);
    setPickerBestIdx(null);
    setPickerBestReason(null);
    e.target.value = "";
  }

  async function scorePickerImages() {
    if (pickerImages.length < 2) return;
    setPickerScoring(true);
    setPickerScores(null);
    setPickerBestIdx(null);

    try {
      // Convert images to base64 (resize to 384px for speed)
      const images = await Promise.all(
        pickerImages.map(async (img, i) => {
          const cvs = document.createElement("canvas");
          const ctx = cvs.getContext("2d")!;
          const image = await new Promise<HTMLImageElement>((resolve) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.src = img.previewUrl;
          });
          const maxDim = 384;
          const scale = Math.min(maxDim / image.naturalWidth, maxDim / image.naturalHeight, 1);
          cvs.width = Math.round(image.naturalWidth * scale);
          cvs.height = Math.round(image.naturalHeight * scale);
          ctx.drawImage(image, 0, 0, cvs.width, cvs.height);
          const base64 = cvs.toDataURL("image/jpeg", 0.5).split(",")[1];
          return { base64, index: i };
        })
      );

      const resp = await fetch("/api/wall-art/score-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      });

      if (resp.ok) {
        const data = await resp.json();
        setPickerScores(data.scores || []);
        setPickerBestIdx(data.best_index ?? null);
        setPickerBestReason(data.best_reason || null);

        // Auto-select best image as source
        if (data.best_index != null && pickerImages[data.best_index]) {
          setSourceImage(pickerImages[data.best_index].previewUrl);
          setSourceFile(pickerImages[data.best_index].file);
          setPattern(null);
          setCleanedImage(null); setCleanedModel(null);
          setHasFlattenedUpload(false);
        }
      }
    } catch (err) {
      console.error("Scoring failed:", err);
    } finally {
      setPickerScoring(false);
    }
  }

  function selectPickerImage(idx: number) {
    if (pickerImages[idx]) {
      setSourceImage(pickerImages[idx].previewUrl);
      setSourceFile(pickerImages[idx].file);
      setPattern(null);
      setCleanedImage(null); setCleanedModel(null);
      setPickerBestIdx(idx);
      setHasFlattenedUpload(false);
    }
  }

  /* ── Generate Design Image directly via GPT-Image-2 ──
   * Replaces the old "build MJ prompt → user copies → pastes into
   * Midjourney" flow. The Design tab now RENDERS the image server-side
   * via /api/cross-stitch/generate-design and drops the resulting data
   * URL into `generatedDesignUrl` — one click, no copy-paste.
   *
   * Prompt construction lives server-side (single source of truth with
   * research / best-idea / bulk-prompts). We just send the user's
   * description plus the selected style preset; the server applies the
   * cross-stitch guardrails (flat colors, outlines, pure white bg,
   * canonical composition sentence) and the IP gate. */
  async function generateDesignImage() {
    if (!designPrompt.trim() || generatingDesign || generatingPreview) return;
    setGeneratingDesign(true);
    setDesignError(null);
    setGeneratedDesignUrl(null);
    setCleanConvertDataUrl(null);
    setGeneratedDesignEngine(null);
    try {
      const resp = await fetch("/api/cross-stitch/generate-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: designPrompt,
          style: designStyle,
          styleHint: sellerStyleHint || undefined,
          engine: "gpt-image-2",
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        // Preserve upstream reason (IP trademark hit, OpenAI rate
        // limit, bad prompt, etc.) instead of a generic error.
        throw new Error(data?.error || `Request failed with status ${resp.status}`);
      }
      if (!data?.dataUrl) {
        throw new Error("No image returned from the server.");
      }
      setGeneratedDesignUrl(data.dataUrl);
      // Server always returns a cleanConvertDataUrl on the paid HQ
      // path; null fallback handles older deployments / API errors and
      // makes Convert revert to the stitch preview cleanly.
      setCleanConvertDataUrl(data.cleanConvertDataUrl ?? null);
      setGeneratedDesignEngine("gpt-image-2");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Image generation failed";
      setDesignError(msg);
    } finally {
      setGeneratingDesign(false);
    }
  }

  /* ── Free Preview render (Pollinations Flux) ──────────────────
   * The "eyeball it before paying" path. Calls the same server-side
   * prompt construction pipeline (strip craft terms, apply style preset,
   * add the canonical composition sentence) as the paid GPT-Image-2
   * path, but routes the request to the free Pollinations Flux service
   * instead of OpenAI. Typically 5-15 seconds, zero cost.
   *
   * Users can re-click this as many times as they want to iterate on
   * the prompt before deciding whether the idea is worth $0.04 to
   * upgrade to a GPT-Image-2 final render — or just send the preview
   * straight to Convert if the Flux output is already good enough. */
  async function generateDesignPreview() {
    if (!designPrompt.trim() || generatingPreview || generatingDesign) return;
    setGeneratingPreview(true);
    setDesignError(null);
    setGeneratedDesignUrl(null);
    setCleanConvertDataUrl(null);
    setGeneratedDesignEngine(null);
    try {
      const resp = await fetch("/api/cross-stitch/generate-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: designPrompt,
          style: designStyle,
          styleHint: sellerStyleHint || undefined,
          engine: "flux-free",
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || `Preview failed with status ${resp.status}`);
      }
      if (!data?.dataUrl) {
        throw new Error("No preview image returned.");
      }
      setGeneratedDesignUrl(data.dataUrl);
      setGeneratedDesignEngine("flux-free");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Preview failed";
      setDesignError(msg);
    } finally {
      setGeneratingPreview(false);
    }
  }

  /* ── Use design from Design tab ── */
  function useDesignForConversion() {
    if (generatedDesignUrl) {
      // Prefer the clean flat-vector source for Convert whenever the
      // route provided one (always on the paid HQ path post-2026-05-01).
      // Falls back to the stitch preview for the free Flux path and
      // any legacy state without a clean sibling.
      setSourceImage(cleanConvertDataUrl ?? generatedDesignUrl);
      setPattern(null);
      setCleanedImage(null); setCleanedModel(null);
      setActiveTab("convert");
    }
  }

  /* ── Use result from Research ──
   * Pre-fills the prompt and lands the user on the Convert tab where
   * the new "Generate Image" section (gpt-image-2 + flatten-for-convert
   * in one click) is the start of the workflow.  The Design tab is
   * intentionally hidden — its preview prompts ask for gradients and
   * watercolor which destroyed downstream pattern quality. */
  function useInspirationForDesign(result: EtsyResult) {
    setDesignPrompt(`Cross-stitch pattern art inspired by: ${result.title}. Show the animal character FULL BODY wearing a complete elaborate costume — the costume is the entire point of the design. Cute kawaii face, full outfit visible from head to toe, character posed charmingly. Plain white background, flat bold black outlines, clean limited pastel palette (8–14 colors max), NalaAndStitch style. No text, no scenery, no background pattern.`);
    setActiveTab("convert");
  }

  /* ── Generate listing copy ── */
  async function generateListingCopy() {
    if (!pattern) return;
    setGeneratingListing(true);
    // Clear the form BEFORE the network call. If we leave the prior
    // pattern's title/description/tags in place while Gemini is
    // thinking, the "Generating..." button sits above STALE text that
    // looks like the result — easy to mistake for a successful
    // regeneration. A failed call (Gemini rate limit, image too big)
    // then compounds the confusion by never overwriting. Wipe first,
    // let the success path fill back in.
    setListTitle("");
    setListDescription("");
    setListTags("");
    setTrademarkWarnings([]);
    try {
      // Get pattern preview image so AI can see what the design actually looks like
      const previewDataUrl = renderPatternPreview();
      const imageBase64 = previewDataUrl ? previewDataUrl.split(",")[1] : undefined;
      // Also try source image if available (original uploaded/generated image)
      const srcBase64 = sourceImage ? sourceImage.split(",")[1] : undefined;
      const imgToSend = srcBase64 || imageBase64;

      const resp = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `You are an expert Etsy seller for cross-stitch patterns. Look at this image and write a listing that matches the format of top-selling Etsy cross-stitch shops (HappySlothPatterns style).

FIRST: Describe what you see in the image. the subject, theme, style, colors, mood. Use this to create a specific, appealing listing.

Pattern specs (use these EXACT numbers in the description):
- Stitch count: ${pattern.width} x ${pattern.height}
- DMC colours: ${pattern.colors.length}
- 14 count: ${(pattern.width / 14).toFixed(1)}" x ${(pattern.height / 14).toFixed(1)}" (${(pattern.width / 14 * 2.54).toFixed(1)}cm x ${(pattern.height / 14 * 2.54).toFixed(1)}cm) - suits ${Math.max(5, Math.ceil(Math.max(pattern.width, pattern.height) / 14) + 2)} inch hoop
- 16 count: ${(pattern.width / 16).toFixed(1)}" x ${(pattern.height / 16).toFixed(1)}" (${(pattern.width / 16 * 2.54).toFixed(1)}cm x ${(pattern.height / 16 * 2.54).toFixed(1)}cm) - suits ${Math.max(5, Math.ceil(Math.max(pattern.width, pattern.height) / 16) + 2)} inch hoop
- 18 count: ${(pattern.width / 18).toFixed(1)}" x ${(pattern.height / 18).toFixed(1)}" (${(pattern.width / 18 * 2.54).toFixed(1)}cm x ${(pattern.height / 18 * 2.54).toFixed(1)}cm) - suits ${Math.max(5, Math.ceil(Math.max(pattern.width, pattern.height) / 18) + 2)} inch hoop
- 20 count: ${(pattern.width / 20).toFixed(1)}" x ${(pattern.height / 20).toFixed(1)}" (${(pattern.width / 20 * 2.54).toFixed(1)}cm x ${(pattern.height / 20 * 2.54).toFixed(1)}cm) - suits ${Math.max(5, Math.ceil(Math.max(pattern.width, pattern.height) / 20) + 2)} inch hoop
- 22 count: ${(pattern.width / 22).toFixed(1)}" x ${(pattern.height / 22).toFixed(1)}" (${(pattern.width / 22 * 2.54).toFixed(1)}cm x ${(pattern.height / 22 * 2.54).toFixed(1)}cm) - suits ${Math.max(5, Math.ceil(Math.max(pattern.width, pattern.height) / 22) + 2)} inch hoop

═══ TITLE RULES. Etsy 2026 algorithm ═══
Etsy penalizes keyword-stuffed, pipe-heavy, ALL-CAPS titles. Write ONE natural title.

1. Length: 70–120 characters is the sweet spot. Max 140.
2. First 40 chars carry the most search weight. front-load the EXACT phrase buyers type (e.g. "Kokeshi Doll Cross Stitch Pattern").
3. Natural language. write like a product display, not a keyword list.
4. Punctuation: at most ONE separator. Use a colon (:) OR a single pipe (|) OR parentheses. never stack.
5. Title Case. NO ALL-CAPS. NO emojis. NO ★ ❤ symbols.
6. Include: subject → "Cross Stitch Pattern" → 1 key attribute → format in parens.
7. Don't repeat the same word. "Cross Stitch Pattern PDF Chart Counted Digital Download" is 5 ways to say one thing. pick one.
8. Avoid banner words: "INSTANT DOWNLOAD", "BESTSELLER", "2026 HIT", "SET OF N". modern Etsy strips them.

GOOD TITLES (real Etsy-recommended style):
- "Attempted Murder (of Crows) Cross Stitch Pattern (PDF Download)"
- "Kokeshi Doll Cross Stitch Pattern: Elegant Traditional Japanese Art (PDF Download)"
- "Funny Skeleton Coffee Cross Stitch Pattern: Snarky Adult Humor (Digital Download)"

BAD TITLES (old keyword-stuffed, do NOT produce these):
- "Cute Baby Dragon Fantasy Nursery Wall Art Counted Cross Stitch Pattern PDF Chart Digital Download"
- "DRAGON PATTERN | INSTANT DOWNLOAD | PDF | COUNTED | DIGITAL | 2026 HIT"

═══ DESCRIPTION. top-seller format (HappySlothPatterns structure) ═══
Use TEXT section markers (••• Section Title •••). NO emojis like 📄 ✨ 🖼️. Follow this EXACT structure:

••• This is a downloadable cross-stitch pattern •••
[Subject] Cross-Stitch Pattern.

This pattern is designed with 14 count Aida cloth, can be stitched on any grade of canvas. The size will change based on the thread count of your fabric.

Stitch Count: ${pattern.width} x ${pattern.height}
Finished Sizes:
14 count: ${(pattern.width / 14).toFixed(1)} x ${(pattern.height / 14).toFixed(1)} inches (${(pattern.width / 14 * 2.54).toFixed(1)} x ${(pattern.height / 14 * 2.54).toFixed(1)} cm) - suits ${Math.max(5, Math.ceil(Math.max(pattern.width, pattern.height) / 14) + 2)} inch hoop
16 count: ${(pattern.width / 16).toFixed(1)} x ${(pattern.height / 16).toFixed(1)} inches (${(pattern.width / 16 * 2.54).toFixed(1)} x ${(pattern.height / 16 * 2.54).toFixed(1)} cm) - suits ${Math.max(5, Math.ceil(Math.max(pattern.width, pattern.height) / 16) + 2)} inch hoop
18 count: ${(pattern.width / 18).toFixed(1)} x ${(pattern.height / 18).toFixed(1)} inches (${(pattern.width / 18 * 2.54).toFixed(1)} x ${(pattern.height / 18 * 2.54).toFixed(1)} cm) - suits ${Math.max(5, Math.ceil(Math.max(pattern.width, pattern.height) / 18) + 2)} inch hoop
20 count: ${(pattern.width / 20).toFixed(1)} x ${(pattern.height / 20).toFixed(1)} inches (${(pattern.width / 20 * 2.54).toFixed(1)} x ${(pattern.height / 20 * 2.54).toFixed(1)} cm) - suits ${Math.max(5, Math.ceil(Math.max(pattern.width, pattern.height) / 20) + 2)} inch hoop
22 count: ${(pattern.width / 22).toFixed(1)} x ${(pattern.height / 22).toFixed(1)} inches (${(pattern.width / 22 * 2.54).toFixed(1)} x ${(pattern.height / 22 * 2.54).toFixed(1)} cm) - suits ${Math.max(5, Math.ceil(Math.max(pattern.width, pattern.height) / 22) + 2)} inch hoop

DMC Colours: ${pattern.colors.length}
Cloth Colour: Any

••• The Download •••
Your pattern includes:
- Thread chart with symbol key and thread lengths
- Full colour pattern chart
- Black and white pattern (for easier printing)
- Symbol-only version (great for Pattern Keeper)

The pattern file will be available immediately after checkout.

••• Our Guarantee •••
[Warm 1–2 sentence guarantee paragraph. satisfaction matters, reach out with questions, quick reply.]

••• Copyright •••
[1–2 sentence copyright paragraph. original design, personal use only, no commercial reuse.]

The only part YOU write is the opening subject line (first 2 lines), then the Guarantee and Copyright sections. Leave everything else EXACTLY as provided above.

═══ TAGS ═══
13 comma-separated tags, each max 20 chars, all lowercase. Mix specific design tags with general cross-stitch tags. Use long-tail 2-3 word phrases (e.g. "baby dragon pattern" not "dragon"). Do NOT repeat words already in the title.

CRITICAL. TRADEMARK & COPYRIGHT SAFETY:
Before writing the listing, scan the image and your proposed title/description/tags for ANY potential trademark or copyright issues:
- Character names from movies, TV, games, anime, books (Disney, Marvel, Pokemon, Sanrio, Studio Ghibli, Nintendo, etc.)
- Brand names, logos, sports teams (NFL, NBA, Nike, Starbucks, etc.)
- Song lyrics, movie quotes, book quotes
- Celebrity names or likenesses
- University/college names and mascots
- Any trademarked phrase ("Just Do It", "May the Force", etc.)

If the design LOOKS LIKE a known character (even if not named), flag it. Better safe than sorry.

For EACH issue found, provide the term, risk level ("high" = instant takedown, "medium" = likely flagged, "low" = borderline), and a safe alternative suggestion.

If no issues found, return empty array for trademark_warnings.

Return ONLY valid JSON:
{
  "title": "descriptive title here",
  "description": "full description here",
  "tags": "tag1, tag2, tag3, ...",
  "trademark_warnings": [
    { "term": "the problematic word/phrase", "risk": "high|medium|low", "suggestion": "safe alternative phrasing" }
  ]
}`,
          stream: false,
          image: imgToSend,
          imageMimeType: "image/png",
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const text = data.text || data.response || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          setListTitle(parsed.title || "");
          setListDescription(parsed.description || "");
          setListTags(parsed.tags || "");
          setTrademarkWarnings(parsed.trademark_warnings || []);
        }
      }
    } catch (err) {
      console.error("Listing generation failed:", err);
    } finally {
      setGeneratingListing(false);
    }
  }

  /* ── Extension-driven Gumroad progress poller ──
   *
   * Critical detail: a regular web page (localhost:3461) CANNOT receive
   * pushed messages from an extension via chrome.runtime.onMessage —
   * that API only fires inside content scripts and extension contexts.
   * `externally_connectable` lets the page SEND to the extension, but
   * the reverse direction has no equivalent. We worked around that by
   * having the background store every GUMROAD_PROGRESS / GUMROAD_COMPLETE
   * in chrome.storage.local under `gumroadProgress`, and we POLL it
   * from here while a Gumroad listing is in flight.
   *
   * The poll runs only while `gumroadListing === true` so we don't keep
   * pinging the extension forever. A hard 120s timeout ensures the
   * spinner clears even if the content script never reports anything
   * (e.g. user not logged in to Gumroad → page redirected to /login). */
  useEffect(() => {
    if (!gumroadListing) return;
    if (typeof chrome === "undefined" || !chrome?.runtime?.sendMessage) return;
    const extId = settings.extensionId;
    if (!extId) return;

    type ProgressMsg = {
      type?: string;
      step?: number;
      total?: number;
      label?: string;
      status?: "running" | "done" | "error";
      detail?: string;
      success?: boolean;
      error?: string;
    };

    let cancelled = false;
    let lastSeenSerialized = "";
    const startedAt = Date.now();
    const HARD_TIMEOUT_MS = 120_000;
    // Stale-state guard: if a previous run left a "complete" snapshot in
    // chrome.storage.local, the first poll would fire it immediately and
    // clear our spinner before the NEW run even sends LIST_ON_GUMROAD.
    // The background clears storage as soon as it processes the new
    // request, but listOnGumroad takes 5-10s to build + cache the ZIP
    // before sending LIST_ON_GUMROAD. So we ignore any COMPLETE seen in
    // the first 4s — by then either the background has cleared the
    // stale value or the content script has produced a real progress
    // event we'd rather wait for.
    const STALE_GUARD_MS = 4_000;

    const poll = () => {
      if (cancelled) return;
      try {
        chrome.runtime.sendMessage(
          extId,
          { type: "GET_GUMROAD_PROGRESS" },
          (resp: unknown) => {
            if (cancelled) return;
            if (chrome.runtime.lastError) return;
            const progress = (resp as { progress?: ProgressMsg } | null)?.progress;
            if (!progress) return;
            const serialized = JSON.stringify(progress);
            if (serialized === lastSeenSerialized) return;
            lastSeenSerialized = serialized;

            if (progress.type === "GUMROAD_COMPLETE") {
              if (Date.now() - startedAt < STALE_GUARD_MS) {
                // Almost certainly a leftover from a previous run.
                // Ignore until the guard window expires.
                return;
              }
              if (progress.success) {
                setGumroadStatus(
                  "🎉 Gumroad form filled. Switch to the Gumroad tab, review, and click Save and continue.",
                );
              } else {
                setGumroadStatus(
                  `Error: ${progress.error || "Gumroad automation failed"}`,
                );
              }
              setGumroadListing(false);
              cancelled = true;
              return;
            }

            if (progress.type === "GUMROAD_PROGRESS") {
              const stepLabel =
                progress.step && progress.total
                  ? `${progress.step}/${progress.total}`
                  : "";
              const dot =
                progress.status === "done"
                  ? "✓"
                  : progress.status === "error"
                  ? "⚠️"
                  : "…";
              const detail = progress.detail ? ` — ${progress.detail}` : "";
              setGumroadStatus(
                `${dot} ${stepLabel} ${progress.label || ""}${detail}`.trim(),
              );
            }
          },
        );
      } catch {
        // Extension may have been uninstalled mid-flight. Let the timeout
        // below clear the spinner.
      }

      if (Date.now() - startedAt > HARD_TIMEOUT_MS) {
        if (!cancelled) {
          setGumroadStatus(
            "Error: Gumroad automation timed out. Are you signed in to Gumroad? Check the Gumroad tab.",
          );
          setGumroadListing(false);
          cancelled = true;
        }
      }
    };

    // Kick off immediately so we don't wait 1.5s for the first paint.
    poll();
    const interval = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [gumroadListing, settings.extensionId]);

  /* ── List on Gumroad ──
   *
   * Two paths depending on whether the CraftPlan Chrome extension is
   * installed and registered (the user pastes its ID into Settings):
   *
   *   A. Extension installed → the extension drives the whole form.
   *      We POST the bundle ZIP to /api/cross-stitch/gumroad-bundle
   *      to cache it server-side under a UUID, send a LIST_ON_GUMROAD
   *      message to the extension with {title, description, price,
   *      bundleUrl, fileName}, and the content script on gumroad.com/
   *      products/new fills name/price/description and injects the
   *      ZIP into the file uploader. The user just reviews and clicks
   *      "Save and continue".
   *
   *   B. No extension → fall back to the original clipboard+tab handoff
   *      from v1: download the ZIP, copy markdown to clipboard, open
   *      Gumroad in a new tab. User pastes + drags + saves.
   *
   * Why the cache server-side: an 18MB ZIP doesn't fit through
   * chrome.runtime.sendMessage (~10MB practical limit) and would also
   * exceed chrome.storage.local quota. The content script fetches the
   * ZIP from the cache URL with CORS — see the gumroad-bundle route.
   *
   * Disabled-state mirrors the Etsy button: requires a title and no
   * high-risk trademark warnings. Same IP rules apply on Gumroad as
   * Etsy and we don't want to make it easier to publish a flagged
   * listing on a less-policed platform. */
  async function listOnGumroad() {
    if (!pattern || !listTitle) return;
    setGumroadListing(true);
    setGumroadStatus("Building PDF bundle…");

    // ── Common helpers (used by both extension & fallback paths) ──
    const safeName =
      (patternName || "cross-stitch-pattern")
        .replace(/[^a-zA-Z0-9-_ ]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .toLowerCase() || "cross-stitch-pattern";
    const zipFilename = `${safeName}-gumroad-bundle.zip`;

    // Build a markdown description we can use either path. We re-use the
    // Etsy listing body (already SEO-optimized + reviewed by the seller)
    // and add a Gumroad-specific "What's in the download" block.
    const safeTagsList = listTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const tagsBlock = safeTagsList.length
      ? `\n\n**Tags:** ${safeTagsList.join(" · ")}`
      : "";
    const gumroadDescription =
      `# ${listTitle}\n\n` +
      `${listDescription}\n\n` +
      `---\n\n` +
      `**📦 What's in the download (${zipFilename}):**\n` +
      `- Main color chart with DMC symbols (multi-page) — start here\n` +
      `- Black & white symbol-only chart (ink-saver)\n` +
      `- Single-page color quick reference\n` +
      `- Single-page B&W quick reference\n` +
      `- Pattern Keeper app-compatible PDF (mobile stitchers)\n` +
      `- README with stitching tips and license terms` +
      tagsBlock;

    // Step 1 (both paths): generate the 5-PDF bundle ZIP via the existing
    // /api/cross-stitch/export-pdf route. Omitting `variant` returns the
    // bundle instead of a single PDF.
    let zipBlob: Blob;
    try {
      const pdfResp = await fetch("/api/cross-stitch/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern,
          name: patternName || listTitle,
          finishedLook: renderedPreview || undefined,
        }),
      });
      if (!pdfResp.ok) {
        const err = await pdfResp.json().catch(() => ({}));
        throw new Error(err.error || `PDF bundle generation failed (${pdfResp.status})`);
      }
      zipBlob = await pdfResp.blob();
    } catch (err) {
      console.error("[list-on-gumroad] bundle build failed:", err);
      const msg = err instanceof Error ? err.message : "Bundle build failed";
      setGumroadStatus(`Error: ${msg}`);
      setGumroadListing(false);
      return;
    }

    // ── Step 2: detect the Chrome extension ──
    //
    // The user pastes their extension's ID into Settings. If we have one
    // and chrome.runtime.sendMessage works, we PING the extension. A
    // truthy response = installed and listening; we use the auto path.
    // Anything else = fall back to the clipboard+tab handoff.
    const extId = settings.extensionId;
    console.log("[list-on-gumroad] settings.extensionId =", JSON.stringify(extId));
    console.log("[list-on-gumroad] chrome.runtime.sendMessage available?", typeof chrome !== "undefined" && !!chrome?.runtime?.sendMessage);
    const extensionInstalled = await new Promise<boolean>((resolve) => {
      if (
        !extId ||
        typeof chrome === "undefined" ||
        !chrome?.runtime?.sendMessage
      ) {
        console.warn("[list-on-gumroad] ⚠️ extension preflight failed: no extId or no chrome.runtime");
        resolve(false);
        return;
      }
      try {
        let resolved = false;
        chrome.runtime.sendMessage(
          extId,
          { type: "PING" },
          (response: unknown) => {
            if (resolved) return;
            resolved = true;
            const lastError = chrome.runtime.lastError;
            console.log("[list-on-gumroad] PING response:", { response, lastError: lastError?.message });
            // chrome.runtime.lastError fires if the extension ID is wrong
            // or the extension isn't installed. Either way, treat as not
            // available and fall back.
            if (lastError) resolve(false);
            else resolve(!!response);
          },
        );
        // Hard timeout — some Chrome builds don't fire the callback at
        // all when no extension is registered with the given ID.
        setTimeout(() => {
          if (!resolved) {
            console.warn("[list-on-gumroad] ⚠️ PING timed out after 1500ms — extension didn't respond");
            resolved = true;
            resolve(false);
          }
        }, 1500);
      } catch (err) {
        console.error("[list-on-gumroad] PING threw:", err);
        resolve(false);
      }
    });
    console.log("[list-on-gumroad] extensionInstalled =", extensionInstalled);

    // ── Path A: extension installed → full automation ──
    if (extensionInstalled) {
      try {
        // Step A1: cache the ZIP server-side. The content script will
        // fetch it from this URL with CORS once it lands on Gumroad.
        setGumroadStatus("Caching bundle for the extension…");
        const form = new FormData();
        form.set("file", zipBlob, zipFilename);
        form.set("fileName", zipFilename);
        const cacheResp = await fetch("/api/cross-stitch/gumroad-bundle", {
          method: "POST",
          body: form,
        });
        if (!cacheResp.ok) {
          const err = await cacheResp.json().catch(() => ({}));
          throw new Error(err.error || `Cache failed (${cacheResp.status})`);
        }
        const { bundleUrl } = (await cacheResp.json()) as {
          listingId: string;
          bundleUrl: string;
        };

        // Step A2: send the listing payload to the extension. The
        // extension stashes it in chrome.storage.local and opens a new
        // tab on app.gumroad.com/products/new. The content script there
        // picks it up, fills the form, and fetches the bundle from
        // bundleUrl.
        setGumroadStatus("Opening Gumroad and filling form…");
        const ok = await new Promise<boolean>((resolve) => {
          let resolved = false;
          chrome.runtime.sendMessage(
            extId,
            {
              type: "LIST_ON_GUMROAD",
              payload: {
                title: listTitle,
                description: gumroadDescription,
                price: typeof listPrice === "number"
                  ? listPrice
                  : parseFloat(String(listPrice).replace(/[^0-9.]/g, "")) || 0,
                fileName: zipFilename,
                bundleUrl,
                tags: safeTagsList,
                // Force USD on Stage 1's currency dropdown — Gumroad
                // defaults to whatever currency the seller's account is
                // set to (often EUR for EU sellers); we always price the
                // bundle in USD on the cross-stitch side.
                currency: "usd",
                // Short summary shown above the description in the
                // product preview. First sentence of the description,
                // capped at 150 chars to fit the field.
                summary: (gumroadDescription.split(/(?<=[.!?])\s/)[0] || "")
                  .slice(0, 150)
                  .trim(),
                // Friendly URL slug from the title — Gumroad otherwise
                // assigns a 5-char random ID (e.g. /l/begsc).
                urlSlug: listTitle
                  .toLowerCase()
                  .normalize("NFKD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .replace(/[^a-z0-9\s-]/g, "")
                  .trim()
                  .replace(/\s+/g, "-")
                  .replace(/-+/g, "-")
                  .slice(0, 60),
                // Use the first generated mockup as the Cover image and
                // the second as the Thumbnail. These are data URLs which
                // the extension's fetch() will handle just like an http
                // URL. If we don't have any, the extension skips them
                // and the seller picks images manually.
                coverImageUrl: gptMockups[0]?.dataUrl || undefined,
                thumbnailImageUrl: gptMockups[1]?.dataUrl || undefined,
              },
            },
            (response: unknown) => {
              if (resolved) return;
              resolved = true;
              if (chrome.runtime.lastError) resolve(false);
              else resolve(!!response);
            },
          );
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              resolve(false);
            }
          }, 5000);
        });

        if (!ok) {
          throw new Error("Extension didn't acknowledge — is it enabled?");
        }

        // From here, GUMROAD_PROGRESS messages drive `gumroadStatus`
        // (see the useEffect listener above). We DON'T setGumroadListing
        // (false) here — the listener clears it on GUMROAD_COMPLETE.
        return;
      } catch (err) {
        // Fall through to the clipboard handoff below if the extension
        // path fails for any reason. The seller shouldn't be stranded
        // just because something went wrong with the auto path.
        console.warn(
          "[list-on-gumroad] extension path failed, falling back:",
          err,
        );
        const msg = err instanceof Error ? err.message : "Extension path failed";
        setGumroadStatus(`${msg} — falling back to manual handoff…`);
      }
    }

    // ── Path B: no extension → original clipboard+tab handoff ──
    //
    // Same flow as v1 of this function. We download the ZIP, copy the
    // description to the clipboard, and open Gumroad in a new tab. The
    // seller pastes + drags + clicks Save themselves.
    try {
      setGumroadStatus("Downloading bundle…");
      const blobUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = zipFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Defer revoking — some browsers race the download if we revoke
      // immediately after .click().
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);

      let clipboardOk = false;
      try {
        await navigator.clipboard.writeText(gumroadDescription);
        clipboardOk = true;
      } catch {
        // Fall through — we'll surface a "couldn't copy" hint below.
      }

      setGumroadStatus("Opening Gumroad…");
      window.open(
        "https://gumroad.com/products/new",
        "_blank",
        "noopener,noreferrer",
      );

      // Stash the description on window so the seller can paste it back
      // if their clipboard got clobbered between tabs.
      try {
        (
          window as unknown as { __lastGumroadDescription?: string }
        ).__lastGumroadDescription = gumroadDescription;
      } catch {
        /* noop */
      }

      const priceHint = listPrice ? ` Set price to ${listPrice}.` : "";
      const installHint = extId
        ? ""
        : " Install the CraftPlan extension and paste its ID into Settings to fully automate this in future.";
      setGumroadStatus(
        clipboardOk
          ? `🎉 Bundle downloaded. Description copied to clipboard.${priceHint} Paste it in Gumroad → drag the zip → Publish.${installHint}`
          : `Bundle downloaded. Couldn't auto-copy description (clipboard blocked) — find it in window.__lastGumroadDescription in DevTools.${priceHint}${installHint}`,
      );
    } catch (err) {
      console.error("[list-on-gumroad] fallback failed:", err);
      const msg = err instanceof Error ? err.message : "Gumroad handoff failed";
      setGumroadStatus(`Error: ${msg}`);
    } finally {
      setGumroadListing(false);
    }
  }

  /** Generate listing video for preview — same Step-2.5 logic as
   *  listOnEtsy() (AI route when mockups≥3 with silent Ken-Burns
   *  fallback, identical request body), but standalone: no listing,
   *  no Etsy upload, no PDF, no zip.  Just renders the MP4 and parks
   *  it in `previewVideoUrl` for the inline <video> player in the
   *  Export tab.  Uses the actual in-scope vars (`pattern`,
   *  renderedPreview || renderPatternPreview(), `patternName || listTitle`),
   *  NOT the spec placeholders. */
  async function generateVideoPreview() {
    if (generatingPreviewVideo) return;
    setGeneratingPreviewVideo(true);
    setPreviewVideoUrl(null);
    try {
      const mockupDataUrls = gptMockups.map((m) => m.dataUrl).filter(Boolean);
      const finishedImageForVideo =
        renderedPreview || renderPatternPreview() || undefined;
      // Top 3 DMC color names from the current pattern feed the Kling
      // route's hands-stitching prompt so the visible floss colours
      // match the listing.  pattern.colors is sorted stitched-by-count-
      // desc with background last, so slice(0,3) gets the top 3
      // stitched threads.  Empty when pattern hasn't been converted.
      const dominantColors = (pattern?.colors ?? [])
        .slice(0, 3)
        .map((c) => c.name);
      const videoBody = JSON.stringify({
        patternName: patternName || listTitle || "Cross Stitch Pattern",
        pattern,
        finishedImage: finishedImageForVideo,
        mockups: mockupDataUrls,
        lifestyleMode: "none",
        // Only consumed by the Kling route; the SVD and Ken-Burns
        // routes ignore unknown fields, so a single shared body is safe.
        dominantColors,
        // Two distinct images for the two Kling segments — keeping
        // them separate avoids showing the same picture twice:
        //   finishedImageDataUrl → the canvas-rendered cross-stitch
        //     pixel grid (Ken-Burns "pattern reveal" segment).
        //   designImageDataUrl → the flat-cartoon GPT-image-2 listing
        //     preview (stitching-segment fallback when we lack a
        //     handsStitching mockup, so the viewer at least sees the
        //     actual character design rather than a second copy of
        //     the pixel grid).
        finishedImageDataUrl: finishedImageForVideo ?? undefined,
        designImageDataUrl: generatedDesignUrl ?? undefined,
      });

      // Try Kling 1.6 Standard FIRST — adds real-hands stitching
      // footage between a hook card and a CTA card, ~$0.25 / 60-180s.
      // Falls back to SVD (existing $0.07 mockup-derived motion) when
      // Kling fails for any reason (missing FAL_KEY → 400, rate limit,
      // ffmpeg failure, etc.); SVD falls back to free Ken-Burns when
      // mockups < 3 or its own pipeline errors.
      let videoResp = await fetch("/api/cross-stitch/listing-video-kling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: videoBody,
      });

      // Fallback 1 — SVD if we have ≥3 mockups (its required input).
      if (!videoResp.ok && mockupDataUrls.length >= 3) {
        console.warn(
          "[video-preview] Kling route failed — falling back to SVD",
        );
        videoResp = await fetch("/api/cross-stitch/listing-video-ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: videoBody,
        });
      }

      // Fallback 2 — Ken Burns slideshow (free, always works).
      if (!videoResp.ok) {
        console.warn(
          "[video-preview] SVD/Kling failed — falling back to Ken Burns",
        );
        videoResp = await fetch("/api/cross-stitch/listing-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: videoBody,
        });
      }

      if (!videoResp.ok) {
        throw new Error(`Video generation failed (${videoResp.status})`);
      }
      const videoData = await videoResp.json();
      if (videoData?.video) {
        setPreviewVideoUrl(videoData.video as string);
      }
    } catch (err) {
      console.error("[video-preview]", err);
    } finally {
      setGeneratingPreviewVideo(false);
    }
  }

  /* ── List on Etsy via API ── */
  async function listOnEtsy() {
    if (!pattern || !listTitle) return;
    setEtsyListing(true);
    setEtsyStatus("Preparing images...");

    try {
      // Collect all images in HIGHEST → LOWEST visual impact order,
      // targeting the Etsy-standard 10-slot split: 4 paid GPT lifestyle
      // mockups + 6 free canvas fills (2-3 hoop renders + 4 info cards,
      // sliced down to 10 before upload). Etsy ranks by upload order;
      // the hero (image 1) drives CTR most, so we put GPT lifestyle
      // mockups first, then any legacy composited/hoop mockups as
      // overflow, then info cards last. The gptMockups array is sliced
      // to 4 so if the user manually clicked "Generate 4 more" a second
      // time, only the most recent batch takes the lifestyle slots —
      // the rest get dropped cleanly instead of pushing info cards out
      // of the 10-slot window.
      const allImages: string[] = [];
      // 4 GPT lifestyle mockups — photorealistic hero shots (flat-lay
      // hero, hands stitching, cozy lap, framed shelf). Hardcoded cap
      // of 4 matches the auto-mockup route's DEFAULT_SCENES count
      // (cut from 6 → 4 on 2026-04-25 to save $0.14/listing).
      for (const m of gptMockups.slice(0, 4)) {
        if (!m?.dataUrl) continue;
        allImages.push(m.dataUrl.startsWith("data:") ? m.dataUrl : await urlToBase64(m.dataUrl));
      }
      for (const m of compositedMockups) {
        allImages.push(m.dataUrl.startsWith("data:") ? m.dataUrl : await urlToBase64(m.dataUrl));
      }
      for (const m of hoopMockups) {
        if (!m) continue;
        allImages.push(m.startsWith("data:") ? m : await urlToBase64(m));
      }
      // 4 info cards — stitch count + DMC legend, pattern example,
      // PDF contents bullet list, digital-notice (instant download).
      // These fill the remaining 4 slots for free (canvas-rendered,
      // no paid API calls). See src/lib/cross-stitch-listing-images.ts.
      for (const img of listingImages) {
        allImages.push(img.startsWith("data:") ? img : await urlToBase64(img));
      }

      // Step 1: Create draft listing on Etsy
      setEtsyStatus("Creating Etsy listing...");
      // Etsy hard-caps tags at 20 chars each and 13 tags max. The
      // optimizer sanitizer normally enforces this, but manually-edited
      // tags or tags copied from a competitor scan can slip through
      // longer than the limit. Defensive truncate here so submission
      // never hits the Etsy API "Vtags too_long" validation error.
      const safeTags = listTags
        .split(",")
        .map((t) => t.trim().substring(0, 20))
        .filter(Boolean)
        .slice(0, 13);
      // Apply Etsy's own title-rewrite norms at the submission boundary
      // (strip leading banner adjectives like "Cute", swap "Design" →
      // "Needlecraft" for cross-stitch). The optimizer's sanitizer
      // already does this, but the user can hand-edit listTitle after
      // applying the optimized copy — this last-line pass guarantees
      // submitted titles match what Etsy's recommendation engine would
      // rewrite to, so sellers never see the "Review new listing titles"
      // modal after publishing.
      const safeTitle = normalizeEtsyTitle(listTitle, "cross-stitch");
      const resp = await fetch("/api/cross-stitch/list-on-etsy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: safeTitle,
          description: listDescription,
          // Hard-lock to CROSS_STITCH_LISTING_PRICE regardless of what's
          // in the input field — user directive that all cross-stitch
          // listings ship at a flat $4.34.
          price: CROSS_STITCH_LISTING_PRICE_NUMBER,
          tags: safeTags,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Listing failed");
      const listingId = data.listing_id;
      const productId = data.productId || data.product_id;

      // Step 2: Upload images one by one
      for (let i = 0; i < Math.min(allImages.length, 10); i++) {
        setEtsyStatus(`Uploading image ${i + 1}/${Math.min(allImages.length, 10)}...`);
        const imgResp = await fetch("/api/etsy/listing-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId, image: allImages[i], rank: i + 1 }),
        });
        if (!imgResp.ok) {
          const err = await imgResp.json();
          console.error(`Image ${i + 1} upload failed:`, err.error);
        }
      }

      // Step 2.5: Reuse the Kling listing video already generated in the
      // Export tab (previewVideoUrl) when available, otherwise generate
      // one on-the-fly via the same Kling route. Avoids a second $0.25
      // Kling call and keeps the listing identical to what the user
      // previewed and approved. Non-fatal by design — a failed video
      // must not block the listing going live. We keep the rendered mp4
      // around (listingVideoDataUrl) so we can also drop it into the
      // customer-package zip below.
      let listingVideoDataUrl: string | null = previewVideoUrl;
      try {
        if (!listingVideoDataUrl) {
          // No preview video yet — generate one now using the same
          // Kling route as generateVideoPreview() so the result is
          // consistent with what the Export tab would have produced.
          setEtsyStatus("Generating listing video…");
          const mockupDataUrls = gptMockups.map((m) => m.dataUrl).filter(Boolean);
          const dominantColors = (pattern?.colors ?? []).slice(0, 3).map((c) => c.name);
          const klingBody = JSON.stringify({
            patternName: patternName || listTitle || "Cross Stitch Pattern",
            mockups: mockupDataUrls,
            dominantColors,
            designImageDataUrl: generatedDesignUrl ?? undefined,
          });

          let videoResp = await fetch("/api/cross-stitch/listing-video-kling", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: klingBody,
          });

          // Fallback to Ken Burns if Kling fails — the legacy route is
          // free and reliable, so a 500/timeout/etc. should never block
          // the listing.
          if (!videoResp.ok) {
            console.warn("[listOnEtsy] Kling failed — falling back to Ken Burns");
            videoResp = await fetch("/api/cross-stitch/listing-video", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: klingBody,
            });
          }

          if (videoResp.ok) {
            const videoData = await videoResp.json();
            listingVideoDataUrl = videoData.video ?? null;
          } else {
            const verr = await videoResp.json().catch(() => ({}));
            console.error("[list-on-etsy] video generation failed:", verr.error);
          }
        }

        if (listingVideoDataUrl) {
          setEtsyStatus("Uploading video to Etsy…");
          const videoUploadResp = await fetch("/api/etsy/listing-upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              listingId,
              video: listingVideoDataUrl,
            }),
          });
          if (!videoUploadResp.ok) {
            const verr = await videoUploadResp.json().catch(() => ({}));
            console.error("[list-on-etsy] video upload failed:", verr.error);
          }
        }
      } catch (videoErr) {
        // Swallow — the listing flow continues without the video.
        console.error("[list-on-etsy] video step error:", videoErr);
      }

      // Step 3: Generate PDF and upload as digital download file
      // Ship all 5 PDF variants — matches what top Etsy cross-stitch
      // shops deliver. Etsy caps digital files at 5/listing so we fill
      // every slot. Buyer gets: main colour+symbols chart (the go-to),
      // B&W symbols chart (ink-saver), single-page colour and B&W
      // quick references, and the Pattern Keeper mobile-app variant.
      const pdfVariants = [
        { key: "colorSymbols" as const, suffix: "ColorSymbols" },
        { key: "bwSymbols" as const, suffix: "BlackAndWhiteSymbols" },
        { key: "onePageColor" as const, suffix: "OnePageColor" },
        { key: "onePageBw" as const, suffix: "OnePageBlackAndWhite" },
        { key: "patternKeeper" as const, suffix: "PatternKeeper" },
      ];
      const safePatternName =
        patternName.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "cross-stitch";
      const pdfFiles: Array<{ filename: string; base64: string; blob: Blob }> = [];

      for (let pi = 0; pi < pdfVariants.length; pi++) {
        const v = pdfVariants[pi];
        setEtsyStatus(`Generating PDF ${pi + 1}/${pdfVariants.length} (${v.suffix})...`);
        const pdfResp = await fetch("/api/cross-stitch/export-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pattern, name: patternName, variant: v.key }),
        });
        if (!pdfResp.ok) {
          throw new Error(`Failed to generate ${v.suffix} PDF`);
        }
        const blob = await pdfResp.blob();
        // Pre-flight size check: Etsy's per-file digital-download limit
        // is 20 MB. If we generated something bigger we want to fail
        // here with a descriptive message instead of burning through the
        // whole upload flow only to get a cryptic "exceeds the maximum
        // file size" back from Etsy after several slow uploads.
        const ETSY_DIGITAL_FILE_MAX_BYTES = 20 * 1024 * 1024;
        if (blob.size > ETSY_DIGITAL_FILE_MAX_BYTES) {
          const mb = (blob.size / (1024 * 1024)).toFixed(1);
          throw new Error(
            `${v.suffix}.pdf is ${mb} MB — Etsy's limit is 20 MB per digital file. Try the mini-size bundle, drop the AI finished-look cover, or reduce the pattern grid.`,
          );
        }
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        pdfFiles.push({
          filename: `${safePatternName}-${v.suffix}.pdf`,
          base64,
          blob,
        });
      }

      // Upload all 5 PDFs to the Etsy listing as individual digital files
      // so buyers see 5 clearly-labelled downloads on their order page.
      for (let pi = 0; pi < pdfFiles.length; pi++) {
        const f = pdfFiles[pi];
        setEtsyStatus(`Uploading digital file ${pi + 1}/${pdfFiles.length}...`);
        const fileResp = await fetch("/api/etsy/listing-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listingId,
            file: f.base64,
            filename: f.filename,
          }),
        });
        if (!fileResp.ok) {
          const fileErr = await fileResp.json();
          console.error(`Digital file upload failed (${f.filename}):`, fileErr.error);
          throw new Error(
            `Failed to upload ${f.filename}: ${fileErr.error || "unknown"}`
          );
        }
      }

      // Step 4: Activate listing (now it has the digital file)
      setEtsyStatus("Activating listing...");
      const actResp = await fetch("/api/etsy/listing-activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, productId, confirmLivePublish: true }),
      });
      if (!actResp.ok) {
        const actErr = await actResp.json();
        console.error("Activation failed:", actErr.error);
        throw new Error("Failed to activate listing: " + (actErr.error || "unknown"));
      }

      setEtsyStatus(`🎉 Live on Etsy! Listing ID: ${listingId}. https://www.etsy.com/listing/${listingId}`);

      // Step 5: Auto-download the customer package so the seller sees
      // exactly what buyers will receive — pattern PDF + all the listing
      // images (mockups + info cards) bundled into a single zip.
      try {
        setEtsyStatus("Building your customer package preview…");
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        const safeName = safePatternName;

        // Pattern PDFs — exactly what the customer gets: all 5 variants.
        for (const f of pdfFiles) {
          zip.file(f.filename, f.blob);
        }

        // Listing video — same mp4 we uploaded to Etsy, so the seller has
        // a local copy to reuse (Pinterest/IG reels etc.). Only included
        // when video generation succeeded; drops out silently otherwise.
        if (listingVideoDataUrl) {
          const videoBase64 = listingVideoDataUrl.split(",")[1] || "";
          if (videoBase64) {
            const videoBin = atob(videoBase64);
            const videoBytes = new Uint8Array(videoBin.length);
            for (let i = 0; i < videoBin.length; i++) {
              videoBytes[i] = videoBin.charCodeAt(i);
            }
            zip.file(`${safeName}-listing-video.mp4`, videoBytes);
          }
        }

        // Listing images for the seller's reference (what buyers see).
        const mockupFolder = zip.folder("mockups");
        const listingFolder = zip.folder("listing-images");
        const b64ToBytes = (dataUrl: string) => {
          const base64 = dataUrl.split(",")[1] || "";
          const bin = atob(base64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return bytes;
        };
        // Mockup filenames use a neutral `mockup-N.png` scheme — never
        // expose that these came from gpt-image-2. If a customer somehow
        // sees inside the zip (e.g. seller forwards the preview), "gpt"
        // in the filename breaks the illusion that these are real product
        // photos. A single continuous counter avoids collisions between
        // the AI lifestyle mockups and any legacy canvas-composited ones.
        let mockupIdx = 1;
        gptMockups.forEach((m) => {
          if (!m?.dataUrl) return;
          mockupFolder?.file(`mockup-${mockupIdx++}.png`, b64ToBytes(m.dataUrl));
        });
        compositedMockups.forEach((m) => {
          if (m.dataUrl?.startsWith("data:")) {
            mockupFolder?.file(`mockup-${mockupIdx++}.png`, b64ToBytes(m.dataUrl));
          }
        });
        listingImages.forEach((img, i) => {
          if (img?.startsWith("data:")) {
            // Order must match generateAllListingImagesAsync() output in
            // src/lib/cross-stitch-listing-images.ts. Swap these if the
            // library reorders. Current order: info card first (the
            // "Stitch count + Finished size + DMC legend" card) which
            // Etsy buyers open most, then chart crops, PDF contents,
            // digital notice.
            const labels = ["pattern-info", "pattern-example", "pdf-contents", "digital-notice"];
            const label = labels[i] || `listing-${i + 1}`;
            listingFolder?.file(`${label}.png`, b64ToBytes(img));
          }
        });

        // Small README so the seller knows what's in the zip.
        zip.file(
          "README.txt",
          [
            `${patternName || "Cross Stitch Pattern"}`,
            `Etsy listing: https://www.etsy.com/listing/${listingId}`,
            ``,
            `What your customer downloads (5 PDFs — one per format):`,
            `  • ${safeName}-ColorSymbols.pdf        — main chart (colour + symbols, easiest to stitch from)`,
            `  • ${safeName}-BlackAndWhiteSymbols.pdf — ink-saver B&W chart`,
            `  • ${safeName}-OnePageColor.pdf         — single-page colour quick reference`,
            `  • ${safeName}-OnePageBlackAndWhite.pdf — single-page B&W quick reference`,
            `  • ${safeName}-PatternKeeper.pdf        — chart-only version for the Pattern Keeper mobile app`,
            ``,
            `What your buyers see on the listing (not part of the download):`,
            `  • mockups/ — product photos shown on the Etsy gallery`,
            `  • listing-images/ — info cards (pattern example, sizes, PDF contents, digital notice)`,
            listingVideoDataUrl
              ? `  • ${safeName}-listing-video.mp4 — 12s listing video (also live on the listing)`
              : ``,
            ``,
            `Pattern: ${pattern.width}×${pattern.height} stitches · ${pattern.colors.length} DMC colors`,
          ]
            .filter(Boolean)
            .join("\n")
        );

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeName}-etsy-package.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        setEtsyStatus(`🎉 Live on Etsy! Listing ID: ${listingId}. Customer package downloaded.`);
      } catch (zipErr) {
        // Non-fatal — the listing already went live. Just log.
        console.error("[list-on-etsy] package zip failed:", zipErr);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      if (msg.includes("No Etsy token") || msg.includes("token")) {
        setEtsyStatus("Not connected to Etsy. Connecting...");
        window.open("/api/etsy/auth", "_blank");
      } else {
        setEtsyStatus(`Error: ${msg}`);
      }
    } finally {
      setEtsyListing(false);
    }
  }

  async function urlToBase64(url: string): Promise<string> {
    if (url.startsWith("data:")) return url;
    const resp = await fetch(url);
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /* ── Bulk Pipeline Functions ── */
  function addToBulk(trend: { title: string; description: string; mj_prompt: string; etsy_tags: string[]; urgency: string; source: string }) {
    // Don't add duplicates
    if (bulkItems.some((b) => b.trend.title === trend.title)) return;
    const item: BulkItem = {
      id: `bulk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      trend,
      stage: "selected",
      mjPrompt: trend.mj_prompt || "",
      titleOptions: [],
      selectedTitle: "",
      suggestedPrice: CROSS_STITCH_LISTING_PRICE,
      tags: (trend.etsy_tags || []).join(", "),
      description: "",
    };
    setBulkItems((prev) => [...prev, item]);
  }

  function addAllToBulk() {
    for (const trend of emergingTrends) {
      if (!bulkItems.some((b) => b.trend.title === trend.title)) {
        addToBulk(trend);
      }
    }
  }

  function removeBulkItem(id: string) {
    setBulkItems((prev) => prev.filter((b) => b.id !== id));
  }

  async function generateBulkPrompts() {
    const needsPrompts = bulkItems.filter((b) => b.stage === "selected");
    if (needsPrompts.length === 0) return;
    setBulkProcessing(true);
    setBulkStep("Generating image prompts & SEO titles...");
    setBulkProgress({ current: 0, total: needsPrompts.length });

    try {
      const resp = await fetch("/api/cross-stitch/bulk-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trends: needsPrompts.map((b) => ({ title: b.trend.title, description: b.trend.description, etsy_tags: b.trend.etsy_tags })),
          style: designStyle,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const results = data.results || [];
        setBulkItems((prev) =>
          prev.map((item) => {
            const match = results.find((r: { trend_title: string }) => r.trend_title === item.trend.title);
            if (match) {
              return {
                ...item,
                stage: "prompt_ready" as BulkStage,
                mjPrompt: match.mj_prompt || item.mjPrompt,
                titleOptions: match.title_options || [],
                selectedTitle: match.title_options?.[0] || item.trend.title + " Cross Stitch Pattern (Digital Download)",
                // Ignore the analyzer's suggested_price range — cross-stitch
                // listings are locked to CROSS_STITCH_LISTING_PRICE.
                suggestedPrice: CROSS_STITCH_LISTING_PRICE,
                tags: (match.tags || []).join(", "),
              };
            }
            return item;
          })
        );
      }
    } catch (err) {
      console.error("Bulk prompt generation failed:", err);
    } finally {
      setBulkProcessing(false);
      setBulkStep("");
    }
  }

  /* ── Bulk: Auto-generate images via GPT-Image-2 server-side ──
   * Replaces the manual "copy prompt → paste into GPT-Image-2
   * externally → re-upload" loop with one click. Hits the existing
   * /api/cross-stitch/generate-design endpoint per item — same
   * route used by the single-design flow, so cost/quality match.
   * ~$0.04/image at quality "medium". Sequential to respect OpenAI
   * rate limits and to keep progress updates accurate. */
  async function generateBulkImages() {
    const needsImages = bulkItems.filter((b) => b.stage === "prompt_ready" && !b.imageFile);
    if (needsImages.length === 0) return;
    setBulkProcessing(true);
    setBulkProgress({ current: 0, total: needsImages.length });

    for (let i = 0; i < needsImages.length; i++) {
      const item = needsImages[i];
      setBulkProgress({ current: i + 1, total: needsImages.length });
      setBulkStep(`Rendering image ${i + 1}/${needsImages.length}: ${item.trend.title}`);
      setBulkItems((prev) => prev.map((b) => b.id === item.id ? { ...b, processing: true, error: undefined } : b));

      try {
        // Prefer the full mjPrompt (has the cross-stitch guardrails baked
        // in) over the bare trend title — lines up with what the user
        // would have pasted manually.
        const description = item.mjPrompt || `${item.trend.title}. ${item.trend.description}`;
        const resp = await fetch("/api/cross-stitch/generate-design", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description, style: designStyle }),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || `Generation failed (${resp.status})`);
        }
        const data = await resp.json();
        if (!data.dataUrl) throw new Error("No image returned");

        // data URL → File so the rest of the pipeline (which expects
        // a real File from the upload input) works unchanged.
        const blobResp = await fetch(data.dataUrl);
        const blob = await blobResp.blob();
        const safeName = item.trend.title.replace(/[^a-zA-Z0-9-_ ]/g, "").trim().slice(0, 60) || "design";
        const file = new File([blob], `${safeName}.png`, { type: blob.type || "image/png" });

        setBulkItems((prev) => prev.map((b) => b.id === item.id ? {
          ...b,
          stage: "image_uploaded" as BulkStage,
          imageFile: file,
          imagePreview: URL.createObjectURL(file),
          processing: false,
        } : b));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Render failed";
        setBulkItems((prev) => prev.map((b) => b.id === item.id ? { ...b, error: msg, processing: false } : b));
      }
    }

    setBulkProcessing(false);
    setBulkStep("");
  }

  function handleBulkImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    const fileArr = Array.from(files);

    // Match images to bulk items that need images (in order)
    const needsImage = bulkItems.filter((b) => b.stage === "prompt_ready" && !b.imagePreview);

    setBulkItems((prev) => {
      const updated = [...prev];
      let fileIdx = 0;
      for (let i = 0; i < updated.length && fileIdx < fileArr.length; i++) {
        if (updated[i].stage === "prompt_ready" && !updated[i].imagePreview) {
          const file = fileArr[fileIdx];
          updated[i] = {
            ...updated[i],
            stage: "image_uploaded",
            imageFile: file,
            imagePreview: URL.createObjectURL(file),
          };
          fileIdx++;
        }
      }
      return updated;
    });
    e.target.value = "";
  }

  function assignImageToBulkItem(id: string, file: File) {
    setBulkItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, stage: "image_uploaded", imageFile: file, imagePreview: URL.createObjectURL(file) }
          : item
      )
    );
  }

  /**
   * Bulk pipeline single-item convert.  Reads the image file, base64-
   * encodes it, and POSTs to `/api/cross-stitch/python-convert` —
   * Python's KMeans LAB pipeline produces the chart.  No JS canvas /
   * Sharp / median-cut quantization runs here.  Same Python service
   * the single-pattern flow uses, just driven from the bulk loop.
   */
  async function processBulkConvert(itemId: string): Promise<PatternData | null> {
    const item = bulkItems.find((b) => b.id === itemId);
    if (!item?.imageFile) return null;

    // Read image to data URL — python convert accepts both data URLs
    // and raw base64; data URL is what the rest of the app uses.
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(item.imageFile!);
    });

    try {
      const resp = await fetch("/api/cross-stitch/python-convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: dataUrl,
          gridSize: Math.max(PATTERN_WIDTH_MIN, Math.min(gridSize, PATTERN_WIDTH_MAX)),
          maxColors: Math.max(MAX_COLORS_MIN, Math.min(maxColors, MAX_COLORS_MAX)),
          mergeDE: 3.5,
        }),
      });
      if (!resp.ok) {
        console.error(`[bulk-convert] python engine ${resp.status}`);
        return null;
      }
      const data = (await resp.json()) as PatternData;
      return {
        grid: data.grid,
        colors: data.colors,
        width: data.width,
        height: data.height,
        totalStitches: data.totalStitches,
        backgroundDmc: data.backgroundDmc,
      };
    } catch (err) {
      console.error("[bulk-convert] failed:", err);
      return null;
    }
  }

  /* ── Render a cross-stitch mockup from a pattern (standalone, for bulk) ── */
  function renderBulkStitchMockup(pat: PatternData): string {
    const maxDim = Math.max(pat.width, pat.height);
    const cellSize = Math.max(8, Math.min(16, Math.floor(1600 / maxDim)));
    const pad = cellSize * 3;
    const cw = pat.width * cellSize + pad * 2;
    const ch = pat.height * cellSize + pad * 2;

    const cvs = document.createElement("canvas");
    cvs.width = cw;
    cvs.height = ch;
    const ctx = cvs.getContext("2d")!;

    // Warm cream Aida fabric background
    ctx.fillStyle = "#FAF6EE";
    ctx.fillRect(0, 0, cw, ch);

    // Fabric weave grid
    ctx.strokeStyle = "rgba(180,170,150,0.08)";
    ctx.lineWidth = 0.5;
    for (let x = pad; x <= pad + pat.width * cellSize; x += cellSize) {
      ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, pad + pat.height * cellSize); ctx.stroke();
    }
    for (let y = pad; y <= pad + pat.height * cellSize; y += cellSize) {
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(pad + pat.width * cellSize, y); ctx.stroke();
    }

    const colorHexMap = new Map(pat.colors.map((c) => [c.dmc, c.hex]));
    function hToRgb(hex: string): [number, number, number] {
      const h = hex.replace("#", "");
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }

    // Draw cross-stitches
    for (let y = 0; y < pat.height; y++) {
      for (let x = 0; x < pat.width; x++) {
        const dmc = pat.grid[y][x];
        if (isBackgroundCell(dmc, pat.backgroundDmc)) continue;
        const hex = colorHexMap.get(dmc);
        if (!hex) continue;
        const sx = pad + x * cellSize;
        const sy = pad + y * cellSize;
        const m = cellSize * 0.1;
        const [r, g, b] = hToRgb(hex);
        const tw = cellSize * 0.28;
        ctx.lineCap = "round";

        // Shadow
        ctx.strokeStyle = `rgba(0,0,0,0.1)`;
        ctx.lineWidth = tw + 1;
        ctx.beginPath(); ctx.moveTo(sx + m + 0.5, sy + m + 1); ctx.lineTo(sx + cellSize - m + 0.5, sy + cellSize - m + 1); ctx.stroke();

        // Under thread
        ctx.strokeStyle = `rgb(${Math.round(r * 0.75)},${Math.round(g * 0.75)},${Math.round(b * 0.75)})`;
        ctx.lineWidth = tw;
        ctx.beginPath(); ctx.moveTo(sx + m, sy + m); ctx.lineTo(sx + cellSize - m, sy + cellSize - m); ctx.stroke();

        // Over thread
        ctx.strokeStyle = hex;
        ctx.lineWidth = tw;
        ctx.beginPath(); ctx.moveTo(sx + cellSize - m, sy + m); ctx.lineTo(sx + m, sy + cellSize - m); ctx.stroke();

        // Highlight
        ctx.strokeStyle = `rgba(${Math.min(255, r + 50)},${Math.min(255, g + 50)},${Math.min(255, b + 50)},0.3)`;
        ctx.lineWidth = tw * 0.2;
        ctx.beginPath(); ctx.moveTo(sx + cellSize - m - tw * 0.1, sy + m - tw * 0.06); ctx.lineTo(sx + m - tw * 0.1, sy + cellSize - m - tw * 0.06); ctx.stroke();
      }
    }

    // Aida holes
    ctx.fillStyle = "rgba(0,0,0,0.04)";
    for (let y = 0; y <= pat.height; y++) {
      for (let x = 0; x <= pat.width; x++) {
        ctx.beginPath(); ctx.arc(pad + x * cellSize, pad + y * cellSize, cellSize * 0.05, 0, Math.PI * 2); ctx.fill();
      }
    }
    return cvs.toDataURL("image/png");
  }

  /* ── Render a hoop mockup from pattern (standalone, for bulk) ── */
  function renderBulkHoopMockup(pat: PatternData, bgColor: string = "#e8ddd0"): string {
    const sz = 1400;
    const cvs = document.createElement("canvas");
    cvs.width = sz;
    cvs.height = sz;
    const ctx = cvs.getContext("2d")!;

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, sz, sz);

    // Fabric texture noise
    for (let i = 0; i < 15000; i++) {
      const fx = Math.random() * sz, fy = Math.random() * sz;
      ctx.fillStyle = `rgba(${120 + Math.random() * 50},${110 + Math.random() * 50},${100 + Math.random() * 40},0.03)`;
      ctx.fillRect(fx, fy, 2, 2);
    }

    // Hoop dimensions
    const hoopCx = sz / 2, hoopCy = sz / 2;
    const hoopR = sz * 0.38;

    // Shadow behind hoop
    ctx.save();
    ctx.beginPath(); ctx.arc(hoopCx + 4, hoopCy + 6, hoopR + 12, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.15)"; ctx.filter = "blur(12px)"; ctx.fill();
    ctx.restore();

    // White Aida fabric circle
    ctx.save();
    ctx.beginPath(); ctx.arc(hoopCx, hoopCy, hoopR - 8, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = "#FAF6EE";
    ctx.fillRect(0, 0, sz, sz);

    // Draw cross-stitches inside the circle
    const colorHexMap = new Map(pat.colors.map((c) => [c.dmc, c.hex]));
    const maxDim = Math.max(pat.width, pat.height);
    const cellSize = Math.max(4, Math.min(12, Math.floor((hoopR * 1.5) / maxDim)));
    const patW = pat.width * cellSize;
    const patH = pat.height * cellSize;
    const offsetX = hoopCx - patW / 2;
    const offsetY = hoopCy - patH / 2;

    function hToRgb(hex: string): [number, number, number] {
      const h = hex.replace("#", "");
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }

      for (let y = 0; y < pat.height; y++) {
        for (let x = 0; x < pat.width; x++) {
          const dmc = pat.grid[y][x];
          if (isBackgroundCell(dmc, pat.backgroundDmc)) continue;
          const hex = colorHexMap.get(dmc);
          if (!hex) continue;
          const sx = offsetX + x * cellSize;
          const sy = offsetY + y * cellSize;
          const m = cellSize * 0.12;
          const [r, g, b] = hToRgb(hex);
          const tw = cellSize * 0.3;
          ctx.lineCap = "round";

          // Under thread
          ctx.strokeStyle = `rgb(${Math.round(r * 0.78)},${Math.round(g * 0.78)},${Math.round(b * 0.78)})`;
          ctx.lineWidth = tw;
          ctx.beginPath(); ctx.moveTo(sx + m, sy + m); ctx.lineTo(sx + cellSize - m, sy + cellSize - m); ctx.stroke();

          // Over thread
          ctx.strokeStyle = hex;
          ctx.lineWidth = tw;
          ctx.beginPath(); ctx.moveTo(sx + cellSize - m, sy + m); ctx.lineTo(sx + m, sy + cellSize - m); ctx.stroke();
        }
      }
    ctx.restore();

    // Wood hoop ring (outer)
    ctx.strokeStyle = "#8B6914";
    ctx.lineWidth = 18;
    ctx.beginPath(); ctx.arc(hoopCx, hoopCy, hoopR, 0, Math.PI * 2); ctx.stroke();
    // Inner ring highlight
    ctx.strokeStyle = "#C4993A";
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(hoopCx, hoopCy, hoopR - 9, 0, Math.PI * 2); ctx.stroke();
    // Outer ring shadow
    ctx.strokeStyle = "#6B4F10";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(hoopCx, hoopCy, hoopR + 8, 0, Math.PI * 2); ctx.stroke();

    // Hoop screw at top
    ctx.fillStyle = "#A07818";
    ctx.beginPath(); ctx.arc(hoopCx, hoopCy - hoopR - 6, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#6B4F10"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(hoopCx, hoopCy - hoopR - 6, 10, 0, Math.PI * 2); ctx.stroke();
    // Screw slot
    ctx.strokeStyle = "#5A4010"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(hoopCx - 5, hoopCy - hoopR - 6); ctx.lineTo(hoopCx + 5, hoopCy - hoopR - 6); ctx.stroke();

    return cvs.toDataURL("image/jpeg", 0.92);
  }

  /* ── Bulk: Process images → patterns → mockups → AI listing copy → STOP at review ── */
  async function runBulkPipeline() {
    const ready = bulkItems.filter((b) => b.stage === "image_uploaded");
    if (ready.length === 0) return;
    setBulkProcessing(true);
    setBulkProgress({ current: 0, total: ready.length });

    for (let i = 0; i < ready.length; i++) {
      const item = ready[i];
      setBulkProgress({ current: i + 1, total: ready.length });

      try {
        setBulkItems((prev) => prev.map((b) => b.id === item.id ? { ...b, processing: true } : b));

        // Step 1: Convert to cross-stitch pattern
        setBulkStep(`Converting ${i + 1}/${ready.length}: ${item.trend.title}`);
        const pat = await processBulkConvert(item.id);
        if (!pat) throw new Error("Conversion failed");
        setBulkItems((prev) => prev.map((b) => b.id === item.id ? { ...b, stage: "converted", pattern: pat } : b));

        // Step 2: Generate cross-stitch mockups
        setBulkStep(`Generating mockups ${i + 1}/${ready.length}: ${item.trend.title}`);
        await new Promise((r) => setTimeout(r, 50));

        const stitchMockup = renderBulkStitchMockup(pat);
        const hoopMockup = renderBulkHoopMockup(pat, "#e8ddd0");
        const hoopMockup2 = renderBulkHoopMockup(pat, "#dce8dc");

        // Pattern preview for listing images
        const patPreview = (() => {
          const maxD = Math.max(pat.width, pat.height);
          const cs = Math.max(3, Math.min(6, Math.floor(600 / maxD)));
          const c = document.createElement("canvas");
          c.width = pat.width * cs; c.height = pat.height * cs;
          const cx = c.getContext("2d")!;
          const colorMap = new Map(pat.colors.map((cl) => [cl.dmc, cl.hex]));
          for (let y = 0; y < pat.height; y++) for (let x = 0; x < pat.width; x++) {
            const dmc = pat.grid[y][x];
            if (isBackgroundCell(dmc, pat.backgroundDmc)) continue;
            const hex = colorMap.get(dmc);
            if (!hex) continue;
            cx.fillStyle = hex;
            cx.fillRect(x * cs, y * cs, cs, cs);
          }
          return c.toDataURL("image/png");
        })();
        const listImgs = await generateAllListingImagesAsync(pat, patPreview, customHeroImage);
        const allImages: string[] = [];

        // ── MJ source image (raw sticker art) ──
        // This is the vector-style image from Midjourney. Flat colors,
        // black outlines, no texture. We use it as the INPUT to the
        // render-preview step below to get a photoreal stitched look.
        let mjSource: string = patPreview;
        if (item.imageFile) {
          try {
            mjSource = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(item.imageFile!);
            });
          } catch (readErr) {
            console.error(`[bulk MJ source] FileReader failed for ${item.trend.title}, falling back to canvas preview:`, readErr);
            // mjSource already === patPreview — continue silently
          }
        }

        // Step 2a: GPT-image-2 PHOTOREAL FINISHED-LOOK RENDER.
        // This is the single-listing's `renderedPreview` — the GPT-image-2
        // render that turns the flat MJ sticker into a photoreal stitched
        // piece (visible weave texture, DMC floss luster, aida fabric).
        //
        // Before this step bulk skipped the paid render and used the raw
        // MJ sticker everywhere, so the listing video's "Finished Look"
        // frame captioned "Photoreal render of the stitched piece" was
        // actually showing flat vector art — visually dishonest and the
        // #1 user complaint about the bulk flow.
        //
        // Cost: ~$0.07 per item. Non-fatal — on failure we fall back to
        // patPreview (canvas pixel grid) which is what single-listing
        // does when the user hasn't clicked "Render finished look".
        setBulkStep(`Finished-look render ${i + 1}/${ready.length}: ${item.trend.title}`);
        let renderedPreview: string = patPreview;
        try {
          const rpResp = await fetch("/api/cross-stitch/render-preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: mjSource }),
          });
          if (rpResp.ok) {
            const rpData = await rpResp.json();
            if (rpData?.image) {
              renderedPreview = rpData.image;
              console.log(`[bulk render-preview] ${item.trend.title}: ok (model=${rpData.model ?? "?"})`);
            }
          } else {
            const errJson = await rpResp.json().catch(() => ({}));
            console.error(`[bulk render-preview] ${item.trend.title} failed:`, errJson.error || rpResp.status);
          }
        } catch (rpErr) {
          console.error(`[bulk render-preview] ${item.trend.title} threw:`, rpErr);
        }

        // mockupSource = what we feed to auto-mockup, video, and custom
        // template composites. Matches single-listing's `mockupSource`:
        //   const mockupSource = renderedPreview || patternPreview;
        // So bulk is now 1:1 with single — photoreal when the render
        // succeeds, canvas-grid fallback otherwise. NEVER the flat MJ
        // sticker, which single never uses as finishedImage either.
        const mockupSource: string = renderedPreview;

        if (bulkTemplates.length > 0) {
          setBulkStep(`Compositing templates ${i + 1}/${ready.length}: ${item.trend.title}`);
          try {
            const composited = await compositeBulkPattern(pat, mockupSource);
            allImages.push(...composited);
          } catch (compErr) {
            console.error("Bulk template composite failed:", compErr);
          }
        }

        // Step 2c: Generate 6 GPT-image-2 lifestyle mockups. Matches the
        // single-item flow EXACTLY — same endpoint, same input source
        // (photoreal render, or canvas grid fallback). The MJ sticker is
        // NOT passed as reference because GPT-image-2 lifestyle mockups
        // produced from flat sticker art tend to render as "printed
        // poster" instead of "cross-stitch hoop". Passing the photoreal
        // render gives GPT a textured aida-fabric reference and the
        // resulting lifestyle shots read as actual stitched pieces.
        setBulkStep(`AI mockups ${i + 1}/${ready.length}: ${item.trend.title}`);
        let gptMockupDataUrls: string[] = [];
        try {
          // Test mode also routes the bulk pipeline to free Sharp mockups
          // — without this, "Bulk approve 12 listings" in test mode would
          // still spend 12 × $0.28 = $3.36 on AI mockups defeating the
          // whole point of the toggle.
          const bulkEndpoint = settings.testMode
            ? "/api/cross-stitch/auto-mockup-free"
            : "/api/cross-stitch/auto-mockup";
          const mockupResp = await fetch(bulkEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pattern: mockupSource, title: item.selectedTitle || item.trend.title }),
          });
          if (mockupResp.ok) {
            const mockData = (await mockupResp.json()) as {
              images?: { scene: string; dataUrl: string }[];
              succeeded?: number;
              requested?: number;
            };
            gptMockupDataUrls = (mockData.images || [])
              .map((m) => m.dataUrl)
              .filter(Boolean);
            console.log(
              `[bulk auto-mockup] ${item.trend.title}: ${gptMockupDataUrls.length}/${mockData.requested ?? 4} mockups`
            );
          } else {
            const errJson = await mockupResp.json().catch(() => ({}));
            console.error(`[bulk auto-mockup] ${item.trend.title} failed:`, errJson.error || mockupResp.status);
          }
        } catch (mockErr) {
          console.error(`[bulk auto-mockup] ${item.trend.title} threw:`, mockErr);
        }

        // Match single-item gallery ordering: AI mockups first (hero slots),
        // then template composites (already pushed above), then hoop/stitch
        // canvas renders, then info cards. Capped to 10 — Etsy's gallery
        // limit — in listApprovedBulk before upload.
        allImages.unshift(...gptMockupDataUrls);
        allImages.push(hoopMockup, stitchMockup, hoopMockup2, ...listImgs);

        // Step 2d: Generate 12s listing video. Matches the single-item
        // "/api/cross-stitch/listing-video" call EXACTLY so bulk listings
        // ship the same video structure as single-item listings.
        //
        // Crucial detail: finishedImage is patPreview (the CANVAS-RENDERED
        // pattern grid), NOT mockupSource (the raw MJ sticker). Single
        // passes `renderedPreview || renderPatternPreview()` — a photoreal
        // GPT render when available, otherwise the pixel-grid canvas. The
        // MJ sticker is NEVER what single shows in the video's "Finished
        // Look" frame, because flat vector art labelled "Photoreal render
        // of the stitched piece" is visually dishonest — buyers expect to
        // see pixel stitches on aida, not a sticker illustration.
        //
        // Bulk used to pass mockupSource here, which made the video show
        // the raw MJ sticker (e.g. Highland Cow Breathe flat art) where
        // the caption promises a stitched render. User feedback: "i dont
        // want this image like this to be in the video... make all the
        // same as single listing." Fix: use patPreview, same fallback
        // single uses when no paid render exists.
        //
        // lifestyleMode "none" so each listing video is uniquely derived
        // from THIS pattern (no shared stock footage). Non-fatal on
        // failure (the listing still goes live).
        setBulkStep(`Listing video ${i + 1}/${ready.length}: ${item.trend.title}`);
        let itemVideoDataUrl: string | null = null;
        try {
          const videoResp = await fetch("/api/cross-stitch/listing-video", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              patternName: item.trend.title,
              pattern: pat,
              finishedImage: patPreview,
              // Per-listing photoreal lifestyle mockups (the 4 GPT scenes
              // generated above for THIS bulk item — already in scope as
              // gptMockupDataUrls). When ≥2 are present the renderer
              // switches to its mockup-driven cinematic path: ken-burns
              // over hands-mid-stitch + flat-lay + lifestyle + decor.
              // Mirrors the single-listing call and is what Etsy's video
              // guidance actually wants — the actual product being made,
              // not a generic text slideshow. Empty array (mockup gen
              // failed for this item) is fine — renderer falls back to
              // the legacy static slideshow so the listing still gets a
              // video.
              mockups: gptMockupDataUrls,
              lifestyleMode: "none",
            }),
          });
          if (videoResp.ok) {
            const videoData = await videoResp.json();
            if (videoData?.video) itemVideoDataUrl = videoData.video as string;
          } else {
            const verr = await videoResp.json().catch(() => ({}));
            console.error(`[bulk listing-video] ${item.trend.title} failed:`, verr.error || videoResp.status);
          }
        } catch (videoErr) {
          console.error(`[bulk listing-video] ${item.trend.title} threw:`, videoErr);
        }

        // Step 3: Generate all 5 PDF variants — matches single-item flow.
        // Etsy caps digital files at 5/listing so we fill every slot. Buyer
        // gets: main colour+symbols chart, B&W symbols (ink-saver), single-
        // page colour + B&W quick refs, Pattern Keeper mobile variant.
        setBulkStep(`PDFs ${i + 1}/${ready.length}: ${item.trend.title}`);
        const pdfVariants: Array<{ key: "colorSymbols" | "bwSymbols" | "onePageColor" | "onePageBw" | "patternKeeper"; suffix: string }> = [
          { key: "colorSymbols", suffix: "ColorSymbols" },
          { key: "bwSymbols", suffix: "BlackAndWhiteSymbols" },
          { key: "onePageColor", suffix: "OnePageColor" },
          { key: "onePageBw", suffix: "OnePageBlackAndWhite" },
          { key: "patternKeeper", suffix: "PatternKeeper" },
        ];
        const safeItemName = item.trend.title.replace(/[^a-zA-Z0-9 -]/g, "").trim() || "cross-stitch";
        const itemPdfBundle: Array<{ filename: string; base64: string }> = [];
        for (let pi = 0; pi < pdfVariants.length; pi++) {
          const v = pdfVariants[pi];
          try {
            const pdfVResp = await fetch("/api/cross-stitch/export-pdf", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                pattern: pat,
                name: safeItemName,
                // Pass the File-derived data URL (same one used for mockups/
                // video) so if this route ever starts consuming previewImage
                // it gets valid base64, not an opaque blob: handle.
                previewImage: mockupSource,
                variant: v.key,
              }),
            });
            if (pdfVResp.ok) {
              const blob = await pdfVResp.blob();
              const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
              itemPdfBundle.push({ filename: `${safeItemName}-${v.suffix}.pdf`, base64 });
            } else {
              console.error(`[bulk pdf] ${item.trend.title} variant=${v.key} status=${pdfVResp.status}`);
            }
          } catch (pdfErr) {
            console.error(`[bulk pdf] ${item.trend.title} variant=${v.key} threw:`, pdfErr);
          }
        }
        // Legacy single-PDF field still points at the colorSymbols variant
        // for any code path that hasn't been migrated to pdfBundle yet.
        const pdfB64 = itemPdfBundle.find((f) => f.filename.endsWith("ColorSymbols.pdf"))?.base64.split(",")[1] || "";

        // Step 4: AI-generate listing copy (title, description, tags, trademark check)
        setBulkStep(`AI writing listing ${i + 1}/${ready.length}: ${item.trend.title}`);
        let aiTitle = item.selectedTitle;
        let aiDesc = "";
        let aiTags = item.tags;
        let tmWarnings: { term: string; risk: string; suggestion: string }[] = [];

        try {
          const imgB64 = stitchMockup.split(",")[1];
          const aiResp = await fetch("/api/ai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: `You are an expert Etsy seller for cross-stitch patterns. Look at this cross-stitch pattern image and write a listing that matches how Etsy's own title-recommendations engine phrases top-ranking listings.

FIRST: Describe what you see in the image — the subject, theme, style, colors, mood.

Pattern specs: ${pat.width}x${pat.height} stitches, ${pat.colors.length} DMC colors.
Finished sizes: ${(pat.width / 14).toFixed(1)}" x ${(pat.height / 14).toFixed(1)}" on 14-count Aida, ${(pat.width / 16).toFixed(1)}" x ${(pat.height / 16).toFixed(1)}" on 16-count, ${(pat.width / 18).toFixed(1)}" x ${(pat.height / 18).toFixed(1)}" on 18-count.

TITLE RULES (Etsy's own recommendation format — follow EXACTLY):
- Target length: 70–100 characters. DO NOT keyword-stuff to 140. Etsy's search engine penalizes keyword-spam titles and surfaces clean, natural titles higher.
- Exact structure: "[Style Adjective] [Subject] Cross Stitch Pattern [separator] [Theme/Mood Descriptor] (Digital Download)"
- Use ONE separator only: either " | " (pipe with spaces) OR " : " (colon with spaces). Never both. Never commas as separators.
- End with exactly "(Digital Download)" or "(PDF Download)" in parentheses.
- BANNED phrases (these are the keyword-spam flags Etsy's algo downranks): "PDF Counted Chart Digital Download" as a string, "Instant Download" + "Digital Download" together, "Printable" + "PDF" together, any phrase appearing twice.
- Capitalize Each Major Word (Title Case). Keep "a", "the", "of", "and", "in" lowercase unless first word.

EXAMPLES of the format Etsy surfaces as TOP titles (match this shape exactly):
- "Kawaii Chicken Teacup Cross Stitch Pattern | Farm Animal Motivational Quote (Digital Download)"
- "Kawaii Floral Wreath Cross Stitch Pattern: You Are Loved Affirmation (PDF Download)"
- "Happy Goose Driving Car Cross Stitch Pattern (Digital Download)"
- "Baby Duck Cross Stitch Pattern: Sunny Spring Animal Nursery Decor (Digital Download)"
- "Frog Lotus Cross Stitch Pattern: Grow Your Own Way (Digital Download)"
- "Highland Cow Teacup Cross Stitch Pattern: Floral Nursery Decor (PDF Download)"

DESCRIPTION: 4 paragraphs — design emotions, pattern details, what's included, digital download note.

TAGS: 13 comma-separated tags, each max 20 chars.

TRADEMARK SAFETY: Scan for any trademark/copyright issues. Flag character names, brands, logos, song lyrics, celebrity names.

Return ONLY valid JSON:
{
  "title": "...",
  "description": "...",
  "tags": "...",
  "trademark_warnings": [{ "term": "...", "risk": "high|medium|low", "suggestion": "..." }]
}`,
              stream: false,
              image: imgB64,
              imageMimeType: "image/png",
            }),
          });
          if (aiResp.ok) {
            const aiData = await aiResp.json();
            const text = aiData.text || aiData.response || "";
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              aiTitle = parsed.title || aiTitle;
              aiDesc = parsed.description || "";
              aiTags = parsed.tags || aiTags;
              tmWarnings = parsed.trademark_warnings || [];
            }
          }
        } catch (aiErr) {
          console.error("AI listing copy failed for bulk item:", aiErr);
        }

        // ── STOP at review. do NOT list on Etsy ──
        setBulkItems((prev) => prev.map((b) => b.id === item.id ? {
          ...b,
          stage: "review" as BulkStage,
          pattern: pat,
          mockupUrls: allImages,
          gptMockups: gptMockupDataUrls,
          videoDataUrl: itemVideoDataUrl || undefined,
          pdfBundle: itemPdfBundle,
          pdfBase64: pdfB64,
          selectedTitle: aiTitle,
          description: aiDesc,
          tags: aiTags,
          trademarkWarnings: tmWarnings,
          processing: false,
          reviewExpanded: true,
          approved: false,
        } : b));

      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed";
        setBulkItems((prev) => prev.map((b) => b.id === item.id ? { ...b, error: msg, processing: false } : b));
      }
    }

    setBulkProcessing(false);
    setBulkStep("");
  }

  function approveBulkItem(id: string) {
    setBulkItems((prev) => prev.map((b) => b.id === id ? { ...b, stage: "approved" as BulkStage, approved: true } : b));
  }

  /* ── Regenerate a bulk item through the fixed full pipeline ──
   * Use case: the item already went through the OLD bulk flow (which
   * missed GPT mockups, listing video, and 4/5 PDF variants and silently
   * left listings in DRAFT). The user likes the design enough to keep it
   * but wants the proper asset bundle and a LIVE listing this time.
   *
   * We reset the item back to "image_uploaded" so runBulkPipeline picks it
   * up again — this re-runs Convert → AI mockups → Video → 5 PDFs → AI copy.
   * The OLD Etsy listing (if any) is left alone so the user can delete it
   * manually from their shop; we don't want to touch it because deletions
   * are irreversible. The next pipeline run creates a NEW listing with a
   * fresh ID, fully populated and activated LIVE.
   *
   * Preserves: trend concept, MJ prompt, source image, user-edited copy
   *            (title/description/tags), title options, suggested price.
   * Clears:    pattern, mockups, video, PDFs, old listingId, error, approval. */
  function regenerateBulkItem(id: string) {
    setBulkItems((prev) => prev.map((b) => {
      if (b.id !== id) return b;
      // Fall back to "selected" if there's no image — shouldn't happen on a
      // card that's already LIVE, but defensive so we never strand an item.
      const hasImage = Boolean(b.imageFile || b.imagePreview);
      return {
        ...b,
        stage: (hasImage ? "image_uploaded" : "selected") as BulkStage,
        pattern: undefined,
        mockupUrls: undefined,
        gptMockups: undefined,
        videoDataUrl: undefined,
        pdfBundle: undefined,
        pdfBase64: undefined,
        listingId: undefined,
        error: undefined,
        processing: false,
        approved: false,
        reviewExpanded: false,
        trademarkWarnings: undefined,
      };
    }));
  }

  function updateBulkItem(id: string, field: "selectedTitle" | "description" | "tags" | "suggestedPrice", value: string) {
    setBulkItems((prev) => prev.map((b) => b.id === id ? { ...b, [field]: value } : b));
  }

  /* ── Remove a single image from a bulk item's gallery ──
   * Etsy caps listings at 10 images. The pipeline produces up to 23 per
   * item (6 GPT + 8 custom-template + 3 canvas + 6 listing cards), and
   * some of the custom-template composites don't fit well (e.g. square
   * MJ image into a round hoop shows white corners). Let the user delete
   * bad fits so they can curate exactly which 10 go to Etsy.
   *
   * We also keep gptMockups in sync when a GPT mockup is removed so the
   * "6× AI mockups" badge reflects reality. */
  function removeBulkImage(id: string, index: number) {
    setBulkItems((prev) => prev.map((b) => {
      if (b.id !== id) return b;
      const urls = b.mockupUrls || [];
      if (index < 0 || index >= urls.length) return b;
      const removedUrl = urls[index];
      const nextUrls = urls.filter((_, i) => i !== index);
      // If the removed image was one of our GPT mockups, drop it from
      // that list too so the badge count stays accurate.
      const nextGpt = (b.gptMockups || []).filter((u) => u !== removedUrl);
      return { ...b, mockupUrls: nextUrls, gptMockups: nextGpt };
    }));
  }

  /* ── Move an image to the front of the gallery ──
   * Etsy uses the first image as the listing thumbnail — it's the single
   * highest-leverage spot on the card. Let the user promote their best
   * mockup to that hero slot without deleting others. */
  function promoteBulkImage(id: string, index: number) {
    setBulkItems((prev) => prev.map((b) => {
      if (b.id !== id) return b;
      const urls = b.mockupUrls || [];
      if (index <= 0 || index >= urls.length) return b;
      const hero = urls[index];
      const rest = urls.filter((_, i) => i !== index);
      return { ...b, mockupUrls: [hero, ...rest] };
    }));
  }

  function removeBulkTemplate(id: string) {
    setBulkTemplates((prev) => prev.filter((t) => t.id !== id));
    if (bulkEditingIdx !== null) {
      const remaining = bulkTemplates.filter((t) => t.id !== id);
      if (remaining.length === 0) setBulkEditingIdx(null);
      else if (bulkEditingIdx >= remaining.length) setBulkEditingIdx(remaining.length - 1);
    }
  }

  /* ── Bulk Template Upload ── */
  async function handleBulkTemplateUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const id = `btpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const previewUrl = URL.createObjectURL(file);
      const tpl = { id, previewUrl, file, detecting: true as boolean, frameCorners: undefined as { x: number; y: number }[] | undefined };
      setBulkTemplates((prev) => [...prev, tpl]);

      // Auto-detect frame via Gemini
      try {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.readAsDataURL(file);
        });
        const resp = await fetch("/api/wall-art/detect-frame", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64 }),
        });
        if (resp.ok) {
          const data = await resp.json();
          setBulkTemplates((prev) =>
            prev.map((t) => (t.id === id ? { ...t, frameCorners: data.frameCorners, detecting: false } : t))
          );
        } else {
          setBulkTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, detecting: false } : t)));
        }
      } catch {
        setBulkTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, detecting: false } : t)));
      }
    }
    e.target.value = "";
  }

  /* ── Composite a pattern onto all bulk templates ── */
  async function compositeBulkPattern(pat: PatternData, sourceImageDataUrl?: string): Promise<string[]> {
    if (bulkTemplates.length === 0) return [];
    const results: string[] = [];

    // PREFER the MJ finished-look image for the art layer — the templates
    // the user uploaded are beautiful lifestyle photos (pink gingham, dark
    // wood, white shiplap, dried-flower shelves etc.), and compositing the
    // raw pattern-grid pixel render into those looks jarring: the pixels
    // read as "8-bit sprite", not "cross-stitch on aida in that room."
    //
    // Using the MJ source image instead gives the composite the right
    // visual register — what buyers actually see in a styled Etsy listing
    // photo. We still fall back to the canvas pixel render so the feature
    // works even if the user never attached a source image (manual upload
    // path without an MJ reference).
    let artBase64: string;
    if (sourceImageDataUrl) {
      // Load the MJ image into a canvas so we can optionally circle-clip
      // it to match embroidery-hoop templates. Strip the data: prefix for
      // server consumption; we re-add it when stitching the canvas output
      // back through toDataURL below.
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.crossOrigin = "anonymous";
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = sourceImageDataUrl;
      });
      const sz = Math.max(img.width, img.height) || 1024;
      const sc = document.createElement("canvas");
      sc.width = sz;
      sc.height = sz;
      const sctx = sc.getContext("2d")!;
      if (bulkClipShape === "circle") {
        sctx.beginPath();
        sctx.arc(sz / 2, sz / 2, sz / 2, 0, Math.PI * 2);
        sctx.clip();
      }
      // Center the MJ art in a square canvas so the template's frame
      // corners map cleanly regardless of source aspect ratio.
      sctx.drawImage(img, (sz - img.width) / 2, (sz - img.height) / 2);
      artBase64 = sc.toDataURL("image/png").split(",")[1];
    } else {
      // Fallback: canvas pixel-grid render of the pattern. Kept here for
      // backwards-compat with any flow that calls compositeBulkPattern
      // without a source image — e.g. a seller who uploaded raw files
      // directly instead of using an MJ/trend reference.
      const colorHexMap = new Map(pat.colors.map((c) => [c.dmc, c.hex]));
      let bgDmc = "";
      if (bulkRemoveBg) {
        let maxCount = 0;
        for (const c of pat.colors) { if (c.count > maxCount) { maxCount = c.count; bgDmc = c.dmc; } }
      }
      const cellSize = 12;
      const artCvs = document.createElement("canvas");
      artCvs.width = pat.width * cellSize;
      artCvs.height = pat.height * cellSize;
      const actx = artCvs.getContext("2d")!;
      actx.clearRect(0, 0, artCvs.width, artCvs.height);
      for (let y = 0; y < pat.height; y++) {
        for (let x = 0; x < pat.width; x++) {
          const dmc = pat.grid[y][x];
          if (isBackgroundCell(dmc, pat.backgroundDmc) || (bulkRemoveBg && dmc === bgDmc)) continue;
          const hex = colorHexMap.get(dmc);
          if (!hex) continue;
          const sx = x * cellSize, sy = y * cellSize, m = cellSize * 0.1;
          const hh = hex.replace("#", "");
          const r = parseInt(hh.slice(0, 2), 16), g = parseInt(hh.slice(2, 4), 16), b = parseInt(hh.slice(4, 6), 16);
          actx.lineWidth = cellSize * 0.28; actx.lineCap = "round";
          actx.strokeStyle = `rgb(${Math.round(r * 0.8)},${Math.round(g * 0.8)},${Math.round(b * 0.8)})`;
          actx.beginPath(); actx.moveTo(sx + m, sy + m); actx.lineTo(sx + cellSize - m, sy + cellSize - m); actx.stroke();
          actx.strokeStyle = hex;
          actx.beginPath(); actx.moveTo(sx + cellSize - m, sy + m); actx.lineTo(sx + m, sy + cellSize - m); actx.stroke();
        }
      }

      // Circle clip if needed
      let finalArt = artCvs;
      if (bulkClipShape === "circle") {
        const sz = Math.max(artCvs.width, artCvs.height);
        const clipped = document.createElement("canvas");
        clipped.width = sz; clipped.height = sz;
        const cctx = clipped.getContext("2d")!;
        cctx.beginPath(); cctx.arc(sz / 2, sz / 2, sz / 2, 0, Math.PI * 2); cctx.clip();
        cctx.drawImage(artCvs, (sz - artCvs.width) / 2, (sz - artCvs.height) / 2);
        finalArt = clipped;
      }
      artBase64 = finalArt.toDataURL("image/png").split(",")[1];
    }

    // Position → corners
    // Square canvas when compositing the MJ image (we centered it in sz×sz
    // above). Fall back to the pattern's natural aspect ratio for the pixel
    // render path. ar is only consulted when the template has no detected
    // frame corners — otherwise tpl.frameCorners wins below.
    const ar = sourceImageDataUrl || bulkClipShape === "circle" ? 1 : pat.height / pat.width;
    const halfW = (bulkArtPos.scale / 2) / 100;
    const halfH = (bulkArtPos.scale / 2 * ar) / 100;
    const cx = bulkArtPos.x / 100, cy = bulkArtPos.y / 100;
    const corners = [
      { x: Math.max(0, cx - halfW), y: Math.max(0, cy - halfH) },
      { x: Math.min(1, cx + halfW), y: Math.max(0, cy - halfH) },
      { x: Math.min(1, cx + halfW), y: Math.min(1, cy + halfH) },
      { x: Math.max(0, cx - halfW), y: Math.min(1, cy + halfH) },
    ];

    for (const tpl of bulkTemplates) {
      try {
        const reader = new FileReader();
        const tplBase64 = await new Promise<string>((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.readAsDataURL(tpl.file);
        });
        const resp = await fetch("/api/wall-art/composite-mockup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template: tplBase64, art: artBase64, frameCorners: tpl.frameCorners || corners }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.image) {
            results.push(data.image.startsWith("data:") ? data.image : `data:image/png;base64,${data.image}`);
          }
        }
      } catch (err) {
        console.error("Bulk composite failed:", err);
      }
    }
    return results;
  }

  /* ── Bulk: List ONLY approved items on Etsy ── */
  async function listApprovedBulk() {
    const approved = bulkItems.filter((b) => b.stage === "approved" && b.approved);
    if (approved.length === 0) return;
    setBulkProcessing(true);
    setBulkProgress({ current: 0, total: approved.length });

    for (let i = 0; i < approved.length; i++) {
      const item = approved[i];
      setBulkStep(`Listing ${i + 1}/${approved.length}: ${item.selectedTitle.slice(0, 40)}...`);
      setBulkProgress({ current: i + 1, total: approved.length });

      try {
        setBulkItems((prev) => prev.map((b) => b.id === item.id ? { ...b, processing: true } : b));

        // Etsy hard-caps tags at 20 chars / 13 total. Defensive truncate
        // — optimizer should already enforce this but manually-edited or
        // competitor-copied tags can exceed the limit.
        const tags = item.tags.split(",").map((t: string) => t.trim().substring(0, 20)).filter(Boolean).slice(0, 13);
        // Same title-rewrite norms the single-listing flow uses so bulk
        // listings never trigger the Etsy "Review new listing titles"
        // modal post-publish.
        const safeBulkTitle = normalizeEtsyTitle(item.selectedTitle, "cross-stitch");
        const pat = item.pattern!;

        // Create Etsy listing
        const listResp = await fetch("/api/cross-stitch/list-on-etsy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: safeBulkTitle,
            description: item.description,
            // Hard-lock to CROSS_STITCH_LISTING_PRICE — the bulk flow
            // used to pass item.suggestedPrice through, but per the
            // "always 4.34" directive we ignore per-item overrides.
            price: CROSS_STITCH_LISTING_PRICE_NUMBER,
            tags,
          }),
        });
        if (!listResp.ok) throw new Error("Listing creation failed");
        const listData = await listResp.json();
        const listingId = listData.listingId || listData.listing_id;
        const productId = listData.productId || listData.product_id;

        // Upload up to 10 gallery images with explicit rank — Etsy hard-caps
        // listings at 10 slots and ranks by upload order. Rank must be
        // explicit so the hero position (rank 1) always lands on the
        // highest-impact mockup, matching single-item gallery ordering.
        setBulkStep(`Uploading images ${i + 1}/${approved.length}: ${item.selectedTitle.slice(0, 30)}...`);
        const images = (item.mockupUrls || []).slice(0, 10);
        for (let imgIdx = 0; imgIdx < images.length; imgIdx++) {
          try {
            const b64 = images[imgIdx].startsWith("data:") ? images[imgIdx] : `data:image/png;base64,${images[imgIdx]}`;
            await fetch("/api/etsy/listing-upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ listingId, image: b64, rank: imgIdx + 1 }),
            });
          } catch (upErr) {
            console.error(`[bulk image upload] rank=${imgIdx + 1} failed:`, upErr);
          }
        }

        // Upload listing video (if generated) — same endpoint as single-item.
        // Non-fatal: a failed video must not block the listing going live.
        if (item.videoDataUrl) {
          try {
            setBulkStep(`Uploading video ${i + 1}/${approved.length}: ${item.selectedTitle.slice(0, 30)}...`);
            const videoUploadResp = await fetch("/api/etsy/listing-upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ listingId, video: item.videoDataUrl }),
            });
            if (!videoUploadResp.ok) {
              const verr = await videoUploadResp.json().catch(() => ({}));
              console.error(`[bulk video upload] failed:`, verr.error || videoUploadResp.status);
            }
          } catch (videoErr) {
            console.error(`[bulk video upload] threw:`, videoErr);
          }
        }

        // Upload all 5 PDF digital files — Etsy caps digital downloads at 5
        // per listing and the customer package should match single-item
        // output. We upload each one individually so buyers see 5 clearly-
        // labelled downloads on their order page. Etsy also requires at
        // least ONE digital file attached before it will activate the
        // listing — which is why bulk used to leave listings in DRAFT.
        const pdfFiles = item.pdfBundle && item.pdfBundle.length > 0
          ? item.pdfBundle
          : (item.pdfBase64
              ? [{
                  filename: `${item.selectedTitle.replace(/[^a-zA-Z0-9 -]/g, "").trim() || "pattern"}.pdf`,
                  // pdfBase64 historically stored the raw base64 body
                  // (no data-URL prefix). The upload endpoint accepts both,
                  // but prefix it here defensively so either path works.
                  base64: item.pdfBase64.startsWith("data:")
                    ? item.pdfBase64
                    : `data:application/pdf;base64,${item.pdfBase64}`,
                }]
              : []);
        if (pdfFiles.length === 0) {
          throw new Error("No PDFs generated — cannot activate listing without a digital file");
        }
        for (let pi = 0; pi < pdfFiles.length; pi++) {
          const f = pdfFiles[pi];
          setBulkStep(`PDF ${pi + 1}/${pdfFiles.length} ${i + 1}/${approved.length}: ${item.selectedTitle.slice(0, 25)}...`);
          const fileResp = await fetch("/api/etsy/listing-upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ listingId, file: f.base64, filename: f.filename }),
          });
          if (!fileResp.ok) {
            const fileErr = await fileResp.json().catch(() => ({}));
            console.error(`[bulk pdf upload] ${f.filename} failed:`, fileErr.error || fileResp.status);
            // Don't throw on non-primary PDFs — the main ColorSymbols PDF
            // is enough for Etsy to accept activation. But if we've uploaded
            // zero so far and this is the last one, fail loudly.
            if (pi === 0) throw new Error(`Failed to upload primary PDF: ${fileErr.error || "unknown"}`);
          }
        }

        // Activate — flip from draft → active. This is the step the user
        // explicitly opted into by clicking "List on Etsy". Unlike the old
        // fire-and-forget version, we now check the response so a silent
        // Etsy refusal (missing files, invalid state, taxonomy errors)
        // surfaces as an error instead of leaving the item in DRAFT.
        setBulkStep(`Activating ${i + 1}/${approved.length}: ${item.selectedTitle.slice(0, 30)}...`);
        const actResp = await fetch("/api/etsy/listing-activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId, productId, confirmLivePublish: true }),
        });
        if (!actResp.ok) {
          const actErr = await actResp.json().catch(() => ({}));
          throw new Error(`Activation failed: ${actErr.error || actResp.status}`);
        }

        // ── Download the customer package zip — matches single-item flow ──
        // The seller wants to SEE the same package their buyer will download
        // after purchase. Same zip shape as listOnEtsy() for a single pattern:
        // 5 PDFs at root, listing video MP4, mockups/ folder, listing-images/
        // folder, README.txt. Non-fatal — the listing is already LIVE, this
        // is just a local-preview convenience.
        try {
          setBulkStep(`Packaging ${i + 1}/${approved.length}: ${item.selectedTitle.slice(0, 30)}...`);
          await downloadBulkItemPackage(item, listingId, pdfFiles);
        } catch (zipErr) {
          console.error(`[bulk package zip] ${item.trend.title} failed:`, zipErr);
        }

        setBulkItems((prev) => prev.map((b) => b.id === item.id ? { ...b, stage: "listed", listingId, processing: false } : b));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed";
        setBulkItems((prev) => prev.map((b) => b.id === item.id ? { ...b, error: msg, processing: false } : b));
      }
    }

    setBulkProcessing(false);
    setBulkStep("");
  }

  /* ── Build & download the per-item customer-package zip ──
   * Matches the single-item structure from listOnEtsy():
   *   {slug}-ColorSymbols.pdf                (main stitching chart)
   *   {slug}-BlackAndWhiteSymbols.pdf        (ink-saver B&W)
   *   {slug}-OnePageColor.pdf                (one-page color ref)
   *   {slug}-OnePageBlackAndWhite.pdf        (one-page B&W ref)
   *   {slug}-PatternKeeper.pdf               (Pattern Keeper mobile app)
   *   {slug}-listing-video.mp4               (if generated)
   *   mockups/mockup-N.png                   (AI + custom template composites)
   *   listing-images/*.png                   (info cards — stitch count, finished size, DMC legend, etc.)
   *   README.txt                             (what's in the zip + Etsy URL)
   *
   * The bulk flow mixes all mockups into item.mockupUrls, so we use
   * item.gptMockups as the identity for "AI mockup" and bucket the rest
   * as template composites. This keeps the zip shape the seller sees
   * consistent whether they listed one pattern or a hundred. */
  async function downloadBulkItemPackage(
    item: BulkItem,
    listingId: string | number,
    pdfFiles: Array<{ filename: string; base64: string }>
  ): Promise<void> {
    if (!item.pattern) return;

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    // Filesystem-safe name: strip everything but alnum/space/dash so the
    // user's OS doesn't reject the download (Windows especially).
    const safeName =
      item.selectedTitle.replace(/[^a-zA-Z0-9 -]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) ||
      "pattern";

    // ── Pattern PDFs (all 5 variants, same as the customer download) ──
    for (const f of pdfFiles) {
      const pdfB64 = f.base64.split(",")[1] || f.base64;
      zip.file(f.filename, pdfB64, { base64: true });
    }

    // ── Listing video MP4 (if generated) ──
    if (item.videoDataUrl) {
      const videoB64 = item.videoDataUrl.split(",")[1] || "";
      if (videoB64) {
        zip.file(`${safeName}-listing-video.mp4`, videoB64, { base64: true });
      }
    }

    // ── Mockups + listing images ──
    // Split item.mockupUrls into:
    //   - AI/GPT mockups (anything whose URL matches item.gptMockups)
    //   - the rest (custom-template composites, canvas hoop/stitch, info cards)
    // Single-item splits the info cards into a listing-images/ folder by
    // filename label — in bulk we don't have per-image labels, so we stream
    // everything non-AI into mockups/ with sequential naming to avoid
    // collisions. Info cards still end up in listing-images/ when we can
    // detect them (last 4-6 images are info cards per generateAllListingImagesAsync).
    const mockupFolder = zip.folder("mockups");
    const listingFolder = zip.folder("listing-images");
    const b64ToBytes = (dataUrl: string) => {
      const base64 = dataUrl.split(",")[1] || "";
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    };

    const gptSet = new Set(item.gptMockups || []);
    const allMockups = item.mockupUrls || [];
    // Last N images are listing-info cards; match single-item labels so the
    // zip layout is byte-compatible with what the seller already knows.
    const INFO_LABELS = ["pattern-info", "pattern-example", "pdf-contents", "digital-notice"];
    const infoCount = Math.min(INFO_LABELS.length, allMockups.length);
    const infoStart = allMockups.length - infoCount;
    let mockupIdx = 1;
    allMockups.forEach((url, idx) => {
      if (!url?.startsWith("data:")) return;
      const isInfoCard = idx >= infoStart;
      if (isInfoCard) {
        const label = INFO_LABELS[idx - infoStart] || `listing-${idx + 1}`;
        listingFolder?.file(`${label}.png`, b64ToBytes(url));
      } else {
        // Filename stays neutral — never leak "gpt" into the zip. A seller
        // might forward the package preview to a partner; "mockup-3.png"
        // is opaque, "gpt-mockup-3.png" would break the illusion.
        void gptSet; // referenced above for future per-source bucketing
        mockupFolder?.file(`mockup-${mockupIdx++}.png`, b64ToBytes(url));
      }
    });

    // ── README — matches single-item format ──
    zip.file(
      "README.txt",
      [
        item.selectedTitle || "Cross Stitch Pattern",
        `Etsy listing: https://www.etsy.com/listing/${listingId}`,
        ``,
        `What your customer downloads (5 PDFs — one per format):`,
        ...pdfFiles.map((f) => `  • ${f.filename}`),
        ``,
        `What your buyers see on the listing (not part of the download):`,
        `  • mockups/ — product photos shown on the Etsy gallery`,
        `  • listing-images/ — info cards (pattern example, sizes, PDF contents, digital notice)`,
        item.videoDataUrl ? `  • ${safeName}-listing-video.mp4 — 12s listing video (also live on the listing)` : ``,
        ``,
        `Pattern: ${item.pattern.width}×${item.pattern.height} stitches · ${item.pattern.colors.length} DMC colors`,
      ]
        .filter(Boolean)
        .join("\n")
    );

    // ── Trigger browser download ──
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}-etsy-package.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Small delay before revoking so the browser finishes writing the file.
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const [bulkCopied, setBulkCopied] = useState<string | null>(null);
  const [bulkCopiedSet, setBulkCopiedSet] = useState<Set<string>>(new Set());

  function copyNextBulkPrompt() {
    // Find the next un-copied prompt
    const next = bulkItems.find((b) => b.mjPrompt && !bulkCopiedSet.has(b.id));
    if (next) {
      navigator.clipboard.writeText(next.mjPrompt);
      setBulkCopied(next.id);
      setBulkCopiedSet((prev) => new Set([...prev, next.id]));
      setTimeout(() => setBulkCopied(null), 2000);
    }
  }

  function copySingleBulkPrompt(id: string) {
    const item = bulkItems.find((b) => b.id === id);
    if (item?.mjPrompt) {
      navigator.clipboard.writeText(item.mjPrompt);
      setBulkCopied(id);
      setBulkCopiedSet((prev) => new Set([...prev, id]));
      setTimeout(() => setBulkCopied(null), 2000);
    }
  }

  const bulkPromptsWithPrompt = bulkItems.filter((b) => b.mjPrompt);
  const bulkCopiedCount = bulkPromptsWithPrompt.filter((b) => bulkCopiedSet.has(b.id)).length;

  const bulkStats = {
    total: bulkItems.length,
    selected: bulkItems.filter((b) => b.stage === "selected").length,
    prompted: bulkItems.filter((b) => b.stage === "prompt_ready").length,
    uploaded: bulkItems.filter((b) => b.stage === "image_uploaded").length,
    converted: bulkItems.filter((b) => b.stage === "converted").length,
    exported: bulkItems.filter((b) => b.stage === "mockup_done").length,
    review: bulkItems.filter((b) => b.stage === "review").length,
    approved: bulkItems.filter((b) => b.stage === "approved").length,
    listed: bulkItems.filter((b) => b.stage === "listed").length,
    errors: bulkItems.filter((b) => b.error).length,
    revenue: bulkItems.filter((b) => b.stage === "listed").length * CROSS_STITCH_LISTING_PRICE_NUMBER,
  };

  /* ── Export PDF Bundle — 5 variants (ColorSymbols, BlackAndWhiteSymbols,
   * PatternKeeper, OnePageColor, OnePageBlackAndWhite) zipped — matches
   * what top Etsy shops (NalaAndStitch etc.) ship. ── */
  async function exportPdf() {
    if (!pattern) return;
    setExportingPdf(true);
    try {
      // The AI-rendered "finished stitch look" image becomes the cover's
      // hero shot ("what it looks like when you're done"). Prefer the
      // gpt-image-2 render (mechanical grid, real X-stitches); fall back
      // to gpt-image-1 (softer/painterly) if that's all we have; finally
      // fall back to whatever is currently on screen. null means the
      // cover gracefully collapses to chart-thumbnail-only.
      const finishedLook =
        renderedPreviewsByModel["gpt-image-2"] ||
        renderedPreviewsByModel["gpt-image-1"] ||
        renderedPreview ||
        null;
      const resp = await fetch("/api/cross-stitch/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern,
          name: patternName,
          previewImage: sourceImage,
          finishedLook,
          variant: "bundle",
        }),
      });
      if (resp.ok) {
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${patternName}-pattern-bundle.zip`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("PDF bundle export failed:", err);
    } finally {
      setExportingPdf(false);
    }
  }

  /* ── Resample a pattern to a smaller grid for mini-size bundle ──
   * Uses a block-majority vote (nearest color by cell-group majority)
   * rather than pixel nearest-neighbor so small details survive and
   * don't dissolve into the background.
   */
  function resamplePattern(src: PatternData, targetWidth: number): PatternData {
    if (targetWidth >= src.width) return src;
    const ar = src.height / src.width;
    const newW = targetWidth;
    const newH = Math.max(10, Math.round(newW * ar));
    const sxRatio = src.width / newW;
    const syRatio = src.height / newH;
    const newGrid: string[][] = [];
    const counts = new Map<string, number>();
    for (let y = 0; y < newH; y++) {
      const row: string[] = [];
      for (let x = 0; x < newW; x++) {
        const x0 = Math.floor(x * sxRatio);
        const y0 = Math.floor(y * syRatio);
        const x1 = Math.min(src.width, Math.floor((x + 1) * sxRatio));
        const y1 = Math.min(src.height, Math.floor((y + 1) * syRatio));
        const cell: Map<string, number> = new Map();
        for (let py = y0; py < y1; py++) {
          for (let px = x0; px < x1; px++) {
            const c = src.grid[py][px];
            cell.set(c, (cell.get(c) || 0) + 1);
          }
        }
        let best = src.grid[y0][x0];
        let bestN = 0;
        for (const [c, n] of cell) if (n > bestN) { bestN = n; best = c; }
        row.push(best);
        counts.set(best, (counts.get(best) || 0) + 1);
      }
      newGrid.push(row);
    }
    // Rebuild colors, preserving symbol assignments from source where possible.
    const srcColors = new Map(src.colors.map((c) => [c.dmc, c]));
    const newColors: StitchColor[] = [];
    for (const [dmc, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      const base = srcColors.get(dmc);
      if (!base) continue;
      newColors.push({ ...base, count });
    }
    return {
      grid: newGrid,
      colors: newColors,
      width: newW,
      height: newH,
      totalStitches: newW * newH,
    };
  }

  /* ── Export Mini Size Bundle ──
   * Creates 3 size variants (full, medium, mini) and merges the three PDFs
   * into one ZIP download. Top Etsy sellers commonly ship bundles so the
   * buyer can pick their preferred finished size. more perceived value
   * per listing = higher conversion.
   */
  async function exportMiniBundle() {
    if (!pattern) return;
    setExportingPdf(true);
    try {
      const JSZip = (await import("jszip")).default;
      const full = pattern;
      const mediumW = Math.max(60, Math.round(full.width * 0.7));
      const miniW = Math.max(40, Math.round(full.width * 0.45));
      const medium = resamplePattern(full, mediumW);
      const mini = resamplePattern(full, miniW);

      const variants = [
        { pat: full, label: "full", stitches: `${full.width}x${full.height}` },
        { pat: medium, label: "medium", stitches: `${medium.width}x${medium.height}` },
        { pat: mini, label: "mini", stitches: `${mini.width}x${mini.height}` },
      ];

      const zip = new JSZip();
      for (const v of variants) {
        const resp = await fetch("/api/cross-stitch/export-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pattern: v.pat,
            name: `${patternName}-${v.label}-${v.stitches}`,
            variant: "colorSymbols",
          }),
        });
        if (!resp.ok) throw new Error(`PDF generation failed for ${v.label}`);
        const buf = await resp.arrayBuffer();
        zip.file(`${patternName}-${v.label}-${v.stitches}.pdf`, buf);
      }

      // README so buyers instantly know what's in the zip
      const readme =
        `${patternName}. Size Bundle\n\n` +
        `This bundle contains the same design in 3 sizes so you can match it to your hoop:\n\n` +
        variants
          .map((v) => {
            const inches14 = (v.pat.width / 14).toFixed(1);
            return `- ${v.label.toUpperCase()}: ${v.pat.width}×${v.pat.height} stitches (${inches14}" on 14ct), ${v.pat.colors.length} DMC colors`;
          })
          .join("\n") +
        `\n\nAll three PDFs contain the full chart, color+symbol chart, B&W chart, DMC thread list, and instructions.`;
      zip.file("README.txt", readme);

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${patternName}-bundle.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Mini bundle export failed:", err);
    } finally {
      setExportingPdf(false);
    }
  }

  /* ── Chart-style X-stitch cell renderer (shared) ──
   * Full-color X on both diagonals. keeps color vibrancy when the image
   * is displayed downsampled. Stitch separation comes from the grid lines
   * and aida-dot texture, not from internal tonal variation.
   */
  function drawRealisticStitch(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    cellSize: number,
    hex: string
  ) {
    const m = cellSize * 0.06;
    const tw = Math.max(1.8, cellSize * 0.40);

    ctx.lineCap = "butt";
    ctx.strokeStyle = hex;
    ctx.lineWidth = tw;

    // Both diagonals in full color
    ctx.beginPath();
    ctx.moveTo(sx + m, sy + m);
    ctx.lineTo(sx + cellSize - m, sy + cellSize - m);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx + cellSize - m, sy + m);
    ctx.lineTo(sx + m, sy + cellSize - m);
    ctx.stroke();
  }

  /* ── Render pattern preview on canvas (high quality) ──
   * Renders pattern using realistic X-stitch cells on warm aida fabric so
   * the on-screen preview matches the look of the finished hoop mockup.
   * Falls back to flat squares only when cells get too small to read as
   * stitches (heavy pattern + small render = pixel preview).
   */
  function renderPatternPreview(): string | null {
    if (!pattern) return null;
    // Clean chart preview. pattern on cream aida, no fake styling.
    // The real product mockups (wood frames, gingham, etc) live in the Export tab.
    const maxDim = Math.max(pattern.width, pattern.height);
    const cellSize = Math.max(6, Math.min(14, Math.floor(1400 / maxDim)));
    const pad = Math.round(cellSize * 2);

    const canvas = document.createElement("canvas");
    canvas.width = pattern.width * cellSize + pad * 2;
    canvas.height = pattern.height * cellSize + pad * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    const colorHexMap = new Map(pattern.colors.map((c) => [c.dmc, c.hex]));

    // Cream aida fabric base
    ctx.fillStyle = "#FAF6EE";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Aida weave grid
    ctx.strokeStyle = "rgba(150,135,105,0.18)";
    ctx.lineWidth = 0.6;
    for (let x = 0; x <= pattern.width; x++) {
      ctx.beginPath();
      ctx.moveTo(pad + x * cellSize, pad);
      ctx.lineTo(pad + x * cellSize, pad + pattern.height * cellSize);
      ctx.stroke();
    }
    for (let y = 0; y <= pattern.height; y++) {
      ctx.beginPath();
      ctx.moveTo(pad, pad + y * cellSize);
      ctx.lineTo(pad + pattern.width * cellSize, pad + y * cellSize);
      ctx.stroke();
    }

    // Aida holes at intersections
    ctx.fillStyle = "rgba(120,100,70,0.10)";
    for (let y = 0; y <= pattern.height; y++) {
      for (let x = 0; x <= pattern.width; x++) {
        ctx.beginPath();
        ctx.arc(pad + x * cellSize, pad + y * cellSize, cellSize * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Stitches
    let renderedCells = 0;
    let skippedBackgroundCells = 0;
    let missingColorCells = 0;
    for (let y = 0; y < pattern.height; y++) {
      for (let x = 0; x < pattern.width; x++) {
        const dmc = normalizeGridValue(pattern.grid[y][x]);
        if (isBackgroundCell(dmc, pattern.backgroundDmc)) {
          skippedBackgroundCells++;
          continue;
        }
        const hex = colorHexMap.get(dmc);
        if (!hex) {
          missingColorCells++;
          continue;
        }
        renderedCells++;
        drawRealisticStitch(ctx, pad + x * cellSize, pad + y * cellSize, cellSize, hex);
      }
    }

    return canvas.toDataURL("image/png");
  }

  /* ── Render a native-resolution detail crop so individual X-stitches are crisp ── */
  function renderStitchDetail(): string | null {
    if (!pattern) return null;
    // Target: ~60x60 region at 14 px/cell = 840 px wide, which is LARGER than display scale
    // so the browser doesn't downsample. stitches stay razor-sharp like the reference photo.
    const cropW = Math.min(60, pattern.width);
    const cropH = Math.min(60, pattern.height);
    const cellSize = 14;
    const pad = cellSize * 2;
    const canvas = document.createElement("canvas");
    canvas.width = cropW * cellSize + pad * 2;
    canvas.height = cropH * cellSize + pad * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    // Center the crop on the pattern's content (find densest non-background region)
    const cx = Math.max(0, Math.min(pattern.width - cropW, Math.floor((pattern.width - cropW) / 2)));
    const cy = Math.max(0, Math.min(pattern.height - cropH, Math.floor((pattern.height - cropH) / 2)));

    const colorHexMap = new Map(pattern.colors.map((c) => [c.dmc, c.hex]));

    // Warm linen fabric base with subtle noise
    ctx.fillStyle = "#FAF5E8";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Fabric weave grid
    ctx.strokeStyle = "rgba(180,170,150,0.14)";
    ctx.lineWidth = 0.7;
    for (let x = pad; x <= pad + cropW * cellSize; x += cellSize) {
      ctx.beginPath();
      ctx.moveTo(x, pad);
      ctx.lineTo(x, pad + cropH * cellSize);
      ctx.stroke();
    }
    for (let y = pad; y <= pad + cropH * cellSize; y += cellSize) {
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(pad + cropW * cellSize, y);
      ctx.stroke();
    }

    // Stitches
    let renderedCells = 0;
    let skippedBackgroundCells = 0;
    let missingColorCells = 0;
    for (let y = 0; y < cropH; y++) {
      for (let x = 0; x < cropW; x++) {
        const dmc = normalizeGridValue(pattern.grid[cy + y][cx + x]);
        if (isBackgroundCell(dmc, pattern.backgroundDmc)) {
          skippedBackgroundCells++;
          continue;
        }
        const hex = colorHexMap.get(dmc);
        if (!hex) {
          missingColorCells++;
          continue;
        }
        renderedCells++;
        drawRealisticStitch(ctx, pad + x * cellSize, pad + y * cellSize, cellSize, hex);
      }
    }

    // Aida holes at grid intersections (subtle)
    ctx.fillStyle = "rgba(130,115,90,0.10)";
    for (let y = 0; y <= cropH; y++) {
      for (let x = 0; x <= cropW; x++) {
        ctx.beginPath();
        ctx.arc(pad + x * cellSize, pad + y * cellSize, cellSize * 0.075, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    return canvas.toDataURL("image/png");
  }

  /* ── Chart-style renderers (NalaAndStitch-tier) ────────────────
   * These draw the pattern as a flat CHART — solid colored cells
   * with DMC symbols overlaid, thin grey cell borders, bold black
   * major grid every 10 cells, and ruler numbers on all four sides.
   * This is what buyers actually stitch from (matches the exported
   * PDF chart exactly) and what top Etsy shops show as a preview.
   *
   * The pair below mirrors renderPatternPreview / renderStitchDetail
   * but with chart aesthetics instead of X-stitch-on-aida realism.
   * ── */
  function drawChartCell(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    cellSize: number,
    hex: string,
    symbol: string,
    showSymbol: boolean,
  ) {
    // Solid color fill
    ctx.fillStyle = hex;
    ctx.fillRect(sx, sy, cellSize, cellSize);

    // Symbol overlay — luminance-based contrast so symbols stay
    // readable on both dark (e.g. 310 Black) and pastel cells.
    if (showSymbol && symbol && cellSize >= 8) {
      const h = hex.replace("#", "");
      const r = parseInt(h.slice(0, 2), 16) || 0;
      const g = parseInt(h.slice(2, 4), 16) || 0;
      const b = parseInt(h.slice(4, 6), 16) || 0;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      ctx.fillStyle = lum < 140 ? "#ffffff" : "#1a1a1a";
      ctx.font = `${Math.round(cellSize * 0.68)}px 'SF Mono', 'Menlo', 'Courier New', monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(symbol, sx + cellSize / 2, sy + cellSize / 2 + 0.5);
    }
  }

  /** Render an arbitrary grid snapshot to a small data-URL preview.
   * Used by the Debug Stages panel — takes a grid + code→hex map and
   * produces a flat-color PNG (no symbols, no rulers, no gridlines) at a
   * fixed size so each intermediate stage renders as a comparable thumb. */
  function renderGridSnapshot(
    grid: string[][],
    colorMap: Record<string, string>,
    bgDmc: string,
    gw: number,
    gh: number,
  ): string | null {
    if (typeof document === "undefined") return null;
    const cellSize = Math.max(2, Math.floor(480 / Math.max(gw, gh)));
    const canvas = document.createElement("canvas");
    canvas.width = gw * cellSize;
    canvas.height = gh * cellSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    // Aida background = off-white so background cells are visible as "fabric".
    ctx.fillStyle = "#f7f3e6";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const dmc = grid[y][x];
        if (isBackgroundCell(dmc, bgDmc)) continue;
        const hex = colorMap[dmc];
        if (!hex) continue;
        ctx.fillStyle = hex;
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }
    return canvas.toDataURL("image/png");
  }

  function renderPatternChart(): string | null {
    if (!pattern) return null;
    const maxDim = Math.max(pattern.width, pattern.height);
    // Slightly larger cells than the stitch renderer because symbols
    // need room to breathe — cap at 18px so 150×150 patterns still fit.
    const cellSize = Math.max(7, Math.min(18, Math.floor(1600 / maxDim)));
    // Symbols need ≥9px cells to be legible, AND the user toggle must be on.
    // When off, we render pure flat colors (no per-cell glyph speckle) which
    // is the "other canvas" view for evaluating pattern quality visually.
    const showSymbols = cellSize >= 9 && chartSymbols;
    const rulerPad = Math.max(22, Math.round(cellSize * 2.2));

    const canvas = document.createElement("canvas");
    canvas.width = pattern.width * cellSize + rulerPad * 2;
    canvas.height = pattern.height * cellSize + rulerPad * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    const colorMap = new Map(pattern.colors.map((c) => [c.dmc, c]));

    // White chart background — NalaAndStitch convention. Unstitched
    // aida is white in the chart, not cream; cream appears only in
    // the finished-piece mockup, never in the instructional chart.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Cell fills + symbols
    let renderedCells = 0;
    let skippedBackgroundCells = 0;
    let missingColorCells = 0;
    for (let y = 0; y < pattern.height; y++) {
      for (let x = 0; x < pattern.width; x++) {
        const dmc = normalizeGridValue(pattern.grid[y][x]);
        if (isBackgroundCell(dmc, pattern.backgroundDmc)) {
          skippedBackgroundCells++;
          continue;
        }
        const c = colorMap.get(dmc);
        if (!c) {
          missingColorCells++;
          continue;
        }
        renderedCells++;
        drawChartCell(
          ctx,
          rulerPad + x * cellSize,
          rulerPad + y * cellSize,
          cellSize,
          c.hex,
          c.symbol,
          showSymbols,
        );
      }
    }

    // Thin 1px cell grid
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= pattern.width; x++) {
      const px = rulerPad + x * cellSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, rulerPad);
      ctx.lineTo(px, rulerPad + pattern.height * cellSize);
      ctx.stroke();
    }
    for (let y = 0; y <= pattern.height; y++) {
      const py = rulerPad + y * cellSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(rulerPad, py);
      ctx.lineTo(rulerPad + pattern.width * cellSize, py);
      ctx.stroke();
    }

    // Bold 2.5px major grid every 10 cells — THE thing that reads as
    // "real cross-stitch chart" to anyone who's ever bought one.
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2.5;
    for (let x = 0; x <= pattern.width; x += 10) {
      const px = rulerPad + x * cellSize;
      ctx.beginPath();
      ctx.moveTo(px, rulerPad);
      ctx.lineTo(px, rulerPad + pattern.height * cellSize);
      ctx.stroke();
    }
    // Right edge if pattern width isn't a multiple of 10
    if (pattern.width % 10 !== 0) {
      const px = rulerPad + pattern.width * cellSize;
      ctx.beginPath();
      ctx.moveTo(px, rulerPad);
      ctx.lineTo(px, rulerPad + pattern.height * cellSize);
      ctx.stroke();
    }
    for (let y = 0; y <= pattern.height; y += 10) {
      const py = rulerPad + y * cellSize;
      ctx.beginPath();
      ctx.moveTo(rulerPad, py);
      ctx.lineTo(rulerPad + pattern.width * cellSize, py);
      ctx.stroke();
    }
    if (pattern.height % 10 !== 0) {
      const py = rulerPad + pattern.height * cellSize;
      ctx.beginPath();
      ctx.moveTo(rulerPad, py);
      ctx.lineTo(rulerPad + pattern.width * cellSize, py);
      ctx.stroke();
    }

    // Ruler numbers — every 5, plus col/row 1. Draws on all four
    // sides so a buyer scrolling through a multi-page print can
    // orient either by top+left or by bottom+right rulers.
    ctx.fillStyle = "#333333";
    ctx.font = `${Math.round(rulerPad * 0.48)}px 'SF Mono', 'Menlo', 'Courier New', monospace`;
    ctx.textBaseline = "middle";
    for (let x = 1; x <= pattern.width; x++) {
      if (x !== 1 && x % 5 !== 0) continue;
      const cx = rulerPad + (x - 0.5) * cellSize;
      ctx.textAlign = "center";
      ctx.fillText(String(x), cx, rulerPad / 2);
      ctx.fillText(String(x), cx, rulerPad + pattern.height * cellSize + rulerPad / 2);
    }
    for (let y = 1; y <= pattern.height; y++) {
      if (y !== 1 && y % 5 !== 0) continue;
      const cy = rulerPad + (y - 0.5) * cellSize;
      ctx.textAlign = "right";
      ctx.fillText(String(y), rulerPad - 4, cy);
      ctx.textAlign = "left";
      ctx.fillText(String(y), rulerPad + pattern.width * cellSize + 4, cy);
    }

    // Center-column + center-row triangles — quick-aim markers.
    ctx.fillStyle = "#c0392b";
    const mcx = rulerPad + Math.floor(pattern.width / 2) * cellSize;
    const mcy = rulerPad + Math.floor(pattern.height / 2) * cellSize;
    const tri = Math.max(4, cellSize * 0.45);
    // top
    ctx.beginPath();
    ctx.moveTo(mcx - tri, rulerPad - 1);
    ctx.lineTo(mcx + tri, rulerPad - 1);
    ctx.lineTo(mcx, rulerPad - 1 - tri);
    ctx.closePath();
    ctx.fill();
    // bottom
    ctx.beginPath();
    ctx.moveTo(mcx - tri, rulerPad + pattern.height * cellSize + 1);
    ctx.lineTo(mcx + tri, rulerPad + pattern.height * cellSize + 1);
    ctx.lineTo(mcx, rulerPad + pattern.height * cellSize + 1 + tri);
    ctx.closePath();
    ctx.fill();
    // left
    ctx.beginPath();
    ctx.moveTo(rulerPad - 1, mcy - tri);
    ctx.lineTo(rulerPad - 1, mcy + tri);
    ctx.lineTo(rulerPad - 1 - tri, mcy);
    ctx.closePath();
    ctx.fill();
    // right
    ctx.beginPath();
    ctx.moveTo(rulerPad + pattern.width * cellSize + 1, mcy - tri);
    ctx.lineTo(rulerPad + pattern.width * cellSize + 1, mcy + tri);
    ctx.lineTo(rulerPad + pattern.width * cellSize + 1 + tri, mcy);
    ctx.closePath();
    ctx.fill();

    return canvas.toDataURL("image/png");
  }

  /* ── Chart-style detail crop — same aesthetics, zoomed 60×60. ── */
  function renderStitchDetailChart(): string | null {
    if (!pattern) return null;
    const cropW = Math.min(60, pattern.width);
    const cropH = Math.min(60, pattern.height);
    const cellSize = 18; // bigger than preview — room for symbols
    const rulerPad = 32;
    const canvas = document.createElement("canvas");
    canvas.width = cropW * cellSize + rulerPad * 2;
    canvas.height = cropH * cellSize + rulerPad * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    const cx = Math.max(0, Math.floor((pattern.width - cropW) / 2));
    const cy = Math.max(0, Math.floor((pattern.height - cropH) / 2));
    const colorMap = new Map(pattern.colors.map((c) => [c.dmc, c]));

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let renderedCells = 0;
    let skippedBackgroundCells = 0;
    let missingColorCells = 0;
    for (let y = 0; y < cropH; y++) {
      for (let x = 0; x < cropW; x++) {
        const dmc = normalizeGridValue(pattern.grid[cy + y][cx + x]);
        if (isBackgroundCell(dmc, pattern.backgroundDmc)) {
          skippedBackgroundCells++;
          continue;
        }
        const c = colorMap.get(dmc);
        if (!c) {
          missingColorCells++;
          continue;
        }
        renderedCells++;
        drawChartCell(
          ctx,
          rulerPad + x * cellSize,
          rulerPad + y * cellSize,
          cellSize,
          c.hex,
          c.symbol,
          chartSymbols,
        );
      }
    }

    // Thin cell grid
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= cropW; x++) {
      const px = rulerPad + x * cellSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, rulerPad);
      ctx.lineTo(px, rulerPad + cropH * cellSize);
      ctx.stroke();
    }
    for (let y = 0; y <= cropH; y++) {
      const py = rulerPad + y * cellSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(rulerPad, py);
      ctx.lineTo(rulerPad + cropW * cellSize, py);
      ctx.stroke();
    }

    // Bold major grid — align to the ABSOLUTE pattern grid, not the
    // crop offset, so a buyer's eye finds the same "every-10" lines
    // they'd see on the full chart.
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2.5;
    const firstMajorX = ((10 - (cx % 10)) % 10);
    for (let x = firstMajorX; x <= cropW; x += 10) {
      const px = rulerPad + x * cellSize;
      ctx.beginPath();
      ctx.moveTo(px, rulerPad);
      ctx.lineTo(px, rulerPad + cropH * cellSize);
      ctx.stroke();
    }
    const firstMajorY = ((10 - (cy % 10)) % 10);
    for (let y = firstMajorY; y <= cropH; y += 10) {
      const py = rulerPad + y * cellSize;
      ctx.beginPath();
      ctx.moveTo(rulerPad, py);
      ctx.lineTo(rulerPad + cropW * cellSize, py);
      ctx.stroke();
    }

    // Ruler numbers using ABSOLUTE coordinates (same reason).
    ctx.fillStyle = "#333333";
    ctx.font = `${Math.round(rulerPad * 0.5)}px 'SF Mono', 'Menlo', 'Courier New', monospace`;
    ctx.textBaseline = "middle";
    for (let x = 0; x <= cropW; x++) {
      const absX = cx + x;
      if (absX !== 1 && absX % 10 !== 0) continue;
      const px = rulerPad + (x - 0.5) * cellSize;
      if (x === 0) continue;
      ctx.textAlign = "center";
      ctx.fillText(String(absX), px, rulerPad / 2);
    }
    for (let y = 0; y <= cropH; y++) {
      const absY = cy + y;
      if (absY !== 1 && absY % 10 !== 0) continue;
      const py = rulerPad + (y - 0.5) * cellSize;
      if (y === 0) continue;
      ctx.textAlign = "right";
      ctx.fillText(String(absY), rulerPad - 4, py);
    }

    return canvas.toDataURL("image/png");
  }

  /* ── Generate realistic stitch-effect mockup for Etsy listing image ── */
  async function generateStitchMockup() {
    if (!pattern) return;
    setGeneratingMockup(true);
    await new Promise((r) => setTimeout(r, 50)); // yield to UI

    try {
      const maxDim = Math.max(pattern.width, pattern.height);
      const cellSize = Math.max(8, Math.min(20, Math.floor(1900 / maxDim)));
      const pad = cellSize * 3;
      const cw = pattern.width * cellSize + pad * 2;
      const ch = pattern.height * cellSize + pad * 2;

      const cvs = document.createElement("canvas");
      cvs.width = cw;
      cvs.height = ch;
      const ctx = cvs.getContext("2d")!;

      // Warm cream Aida fabric background
      ctx.fillStyle = "#FAF6EE";
      ctx.fillRect(0, 0, cw, ch);

      // Subtle fabric weave grid lines
      ctx.strokeStyle = "rgba(180,170,150,0.1)";
      ctx.lineWidth = 0.5;
      for (let x = pad; x <= pad + pattern.width * cellSize; x += cellSize) {
        ctx.beginPath();
        ctx.moveTo(x, pad);
        ctx.lineTo(x, pad + pattern.height * cellSize);
        ctx.stroke();
      }
      for (let y = pad; y <= pad + pattern.height * cellSize; y += cellSize) {
        ctx.beginPath();
        ctx.moveTo(pad, y);
        ctx.lineTo(pad + pattern.width * cellSize, y);
        ctx.stroke();
      }

      // Use the shared realistic-stitch renderer (same look as preview).
      const colorHexMap = new Map(pattern.colors.map((c) => [c.dmc, c.hex]));
      for (let y = 0; y < pattern.height; y++) {
        for (let x = 0; x < pattern.width; x++) {
          const dmc = pattern.grid[y][x];
          if (isBackgroundCell(dmc, pattern.backgroundDmc)) continue;
          const hex = colorHexMap.get(dmc);
          if (!hex) continue;
          drawRealisticStitch(ctx, pad + x * cellSize, pad + y * cellSize, cellSize, hex);
        }
      }

      // Aida fabric holes at grid intersections
      ctx.fillStyle = "rgba(0,0,0,0.05)";
      for (let y = 0; y <= pattern.height; y++) {
        for (let x = 0; x <= pattern.width; x++) {
          ctx.beginPath();
          ctx.arc(pad + x * cellSize, pad + y * cellSize, cellSize * 0.06, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      setMockupImage(cvs.toDataURL("image/png"));
    } finally {
      setGeneratingMockup(false);
    }
  }

  function downloadMockup() {
    if (!mockupImage) return;
    const a = document.createElement("a");
    a.href = mockupImage;
    a.download = `${patternName}-mockup.png`;
    a.click();
  }

  /* ── Generate all Etsy listing images ── */
  async function generateListingImgs() {
    if (!pattern) return;
    setGeneratingListingImages(true);
    await new Promise((r) => setTimeout(r, 50));
    try {
      // Async variant awaits preview image decode so the Pattern Info
      // card embeds the real rendered mockup instead of a pixel grid.
      const images = await generateAllListingImagesAsync(pattern, patternPreview, customHeroImage);
      setListingImages(images);
    } finally {
      setGeneratingListingImages(false);
    }
  }

  function downloadListingImage(dataUrl: string, index: number) {
    // Order must match generateAllListingImagesAsync() output in
    // src/lib/cross-stitch-listing-images.ts. Info card first, then
    // chart crops, PDF contents, digital notice.
    const names = ["pattern-info", "pattern-example", "pdf-contents", "digital-notice"];
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${patternName}-${names[index] || `image-${index}`}.png`;
    a.click();
  }

  function downloadAllListingImages() {
    listingImages.forEach((img, i) => {
      setTimeout(() => downloadListingImage(img, i), i * 200);
    });
  }

  /* ── Etsy CTR Thumbnail Builder ────────────────────────────────── */
  async function generateEtsyThumbnails() {
    // Only use real mockups. never listing info-cards (pattern example, PDF notice, etc)
    const sources: string[] = [];
    // GPT-composed mockups are the primary source (frame photo + pattern
    // rendered by gpt-image-1). Fall back to hoop/composited mockups.
    gptMockups.forEach((m) => { if (m.dataUrl) sources.push(m.dataUrl); });
    compositedMockups.forEach((m) => { if (m.dataUrl) sources.push(m.dataUrl); });
    hoopMockups.forEach((m) => { if (m) sources.push(m); });

    if (sources.length === 0) {
      setThumbnailError(
        "No mockups found. Switch to the Mockups tab first and generate hoop mockups. the CTR builder composes text overlays on top of real hoop scenes.",
      );
      setExportSection("mockups");
      return;
    }

    setGeneratingThumbnails(true);
    setThumbnailError(null);
    try {
      const resp = await fetch("/api/etsy-optimizer/thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: sources.slice(0, 6),
          style: "all",
          badges: thumbnailBadges,
          accentColor: "#F1641E",
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setThumbnailError(data.error || "Thumbnail generation failed");
        return;
      }
      setThumbnailVariants(data.variants || []);
      setSelectedThumbnailIdx(0);
    } catch (err) {
      setThumbnailError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setGeneratingThumbnails(false);
    }
  }

  function downloadThumbnail(variant: { style: string; dataUrl: string }) {
    const a = document.createElement("a");
    a.href = variant.dataUrl;
    a.download = `${patternName || "thumbnail"}-${variant.style}.png`;
    a.click();
  }

  function useThumbnailAsListingImage(variant: { style: string; dataUrl: string }) {
    // Prepend the optimized thumbnail to listingImages so it becomes the first image uploaded to Etsy
    setListingImages((prev) => [variant.dataUrl, ...prev.filter((x) => x !== variant.dataUrl)]);
  }

  /* ── Etsy Listing Optimizer (titles + tags + price) ────────────── */
  async function runListingOptimizer() {
    const subject = optimizerSubject.trim() || patternName.replace(/-/g, " ").trim();
    if (!subject) {
      setOptimizerError("Enter a subject/keyword first");
      return;
    }

    setOptimizing(true);
    setOptimizerError(null);
    try {
      // Pass real pattern specs so the optimizer's description includes the
      // actual stitch count, DMC colours, and finished sizes per fabric count
      //. matches top-seller listings like HappySlothPatterns.
      const specs = pattern
        ? {
            stitchWidth: pattern.width,
            stitchHeight: pattern.height,
            dmcColorCount: pattern.colors.length,
            fabricCountsInches: [14, 16, 18, 20, 22].map((c) => ({
              count: c,
              wIn: Math.round((pattern.width / c) * 10) / 10,
              hIn: Math.round((pattern.height / c) * 10) / 10,
              wCm: Math.round((pattern.width / c) * 2.54 * 10) / 10,
              hCm: Math.round((pattern.height / c) * 2.54 * 10) / 10,
              hoop: Math.max(5, Math.ceil(Math.max(pattern.width, pattern.height) / c) + 2),
            })),
          }
        : undefined;

      // Build competitor intel from Research-tab scan so titles/tags/price
      // are grounded in real Etsy results rather than generic guesses.
      let competitor: {
        avgPrice?: number;
        competitionLevel?: "low" | "medium" | "high" | "very high";
        demandScore?: number;
        topTags?: string[];
      } | undefined;
      if (etsyResults.length > 0) {
        const prices = etsyResults
          .map((r) => parseFloat((r.price || "").replace(/[^0-9.]/g, "")))
          .filter((n) => n > 0 && n < 50);
        const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : undefined;
        const tagCount = new Map<string, number>();
        for (const r of etsyResults) for (const t of r.tags || []) {
          const k = t.trim().toLowerCase();
          if (k) tagCount.set(k, (tagCount.get(k) || 0) + 1);
        }
        const topTags = [...tagCount.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map((e) => e[0]);
        const n = etsyResults.length;
        const competitionLevel: "low" | "medium" | "high" | "very high" =
          n >= 25 ? "very high" : n >= 15 ? "high" : n >= 7 ? "medium" : "low";
        const salesNums = etsyResults
          .map((r) => parseInt((r.sales || "").replace(/[^0-9]/g, "")))
          .filter((n) => n > 0);
        const avgSales = salesNums.length ? salesNums.reduce((a, b) => a + b, 0) / salesNums.length : 0;
        const demandScore = Math.max(5, Math.min(95, Math.round(Math.log10(avgSales + 1) * 30)));
        competitor = { avgPrice, competitionLevel, demandScore, topTags };
      }

      const resp = await fetch("/api/etsy-optimizer/listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          productType: "cross-stitch",
          style: optimizerStyle,
          niche: "cross stitch pattern",
          strategy: priceStrategy,
          specs,
          competitor,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setOptimizerError(data.error || "Listing optimization failed");
        return;
      }
      setOptimizerResult(data);
    } catch (err) {
      setOptimizerError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setOptimizing(false);
    }
  }

  function applyOptimizedListing() {
    if (!optimizerResult) return;
    // Pick the first title as default. user can still edit
    setListTitle(optimizerResult.titles[0] || "");
    setListDescription(optimizerResult.description || "");
    setListTags(optimizerResult.tags.join(", "));
    // DO NOT call setListPrice here — cross-stitch listings are locked
    // to CROSS_STITCH_LISTING_PRICE. The optimizer still computes a
    // market-aware price (surfaced in the comparison card below the
    // form), but it does not override the locked retail value.
  }

  /* ── Smart Hoop & Frame Mockup Generator ── */
  type HoopScene = {
    name: string;
    shape: "circle";
    bgType: "gingham" | "linen";
    bgA: string; bgB: string;
    hoop: string; hoopDk: string; hoopLt: string;
    fabric: string;
  };
  type FrameScene = {
    name: string;
    shape: "oval";
    bgGrad: [string, string]; // top → bottom warm gradient
    frame: string; frameDk: string; frameLt: string;
    fabric: string;
    shadow: string;
  };
  type MockupScene = HoopScene | FrameScene;

  const HOOP_SCENES: MockupScene[] = [
    // ── Oval frames (like top sellers use) ──
    // White Oval. matches the floral-cat reference (clean modern aesthetic)
    { name: "White Oval", shape: "oval", bgGrad: ["#F5F0E8", "#E8DDD0"], frame: "#F5F2EE", frameDk: "#D5D0C8", frameLt: "#FFFFFF", fabric: "#FAF7F0", shadow: "rgba(80,60,40,0.18)" },
    // Cream Oval. soft warm option for nursery/baby designs
    { name: "Cream Oval", shape: "oval", bgGrad: ["#EDE7DC", "#DDD5C8"], frame: "#EDE8E0", frameDk: "#C8C0B5", frameLt: "#FAF8F5", fabric: "#FDF9F2", shadow: "rgba(70,50,30,0.2)" },
    // Wood Oval. matches the duck-with-blue-bow reference (heritage feel)
    { name: "Wood Oval", shape: "oval", bgGrad: ["#D9E5F0", "#C2D4E5"], frame: "#A87B4E", frameDk: "#6B4423", frameLt: "#C99A6B", fabric: "#FAF6EE", shadow: "rgba(60,40,20,0.28)" },
    // Walnut Oval. dark vintage look for botanicals + folk art
    { name: "Walnut Oval", shape: "oval", bgGrad: ["#E8E1D5", "#D5CBB8"], frame: "#5D3A1F", frameDk: "#3A2412", frameLt: "#7A5435", fabric: "#FDF9F0", shadow: "rgba(40,25,10,0.32)" },
    // ── Classic circular hoops ──
    { name: "Blue Gingham", shape: "circle", bgType: "gingham", bgA: "#A8CCE0", bgB: "#FFFFFF", hoop: "#B8860B", hoopDk: "#8B6914", hoopLt: "#D4A843", fabric: "#FAF6EE" },
    { name: "Pink Gingham", shape: "circle", bgType: "gingham", bgA: "#E8B4C0", bgB: "#FFFFFF", hoop: "#C8A96E", hoopDk: "#A08A55", hoopLt: "#DFC088", fabric: "#FFF8F5" },
    { name: "Clean White", shape: "circle", bgType: "linen", bgA: "#F0EDE6", bgB: "#E8E4DC", hoop: "#6B4226", hoopDk: "#4A2C1A", hoopLt: "#8B5E3C", fabric: "#FAF6EE" },
    { name: "Sage Linen", shape: "circle", bgType: "linen", bgA: "#CDD8BF", bgB: "#C0CCAF", hoop: "#C8A96E", hoopDk: "#A08A55", hoopLt: "#DFC088", fabric: "#FDFAF4" },
    // Dark Walnut Hoop. matches the dragon-bookshelf reference
    { name: "Walnut Hoop", shape: "circle", bgType: "linen", bgA: "#E8DFD0", bgB: "#D5C8B5", hoop: "#5D3A1F", hoopDk: "#3A2412", hoopLt: "#7A5435", fabric: "#FAF5E8" },
  ];

  async function generateHoopMockups() {
    if (!pattern) return;
    setGeneratingHoopMockups(true);
    await new Promise((r) => setTimeout(r, 50));

    try {
      const colorHexMap = new Map(pattern.colors.map((c) => [c.dmc, c.hex]));
      const results: string[] = [];

      // Simple seeded random for consistent texture
      function seeded(seed: number) {
        let s = seed;
        return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
      }

      function hexRgb(hex: string): [number, number, number] {
        const h = hex.replace("#", "");
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
      }

      for (let si = 0; si < HOOP_SCENES.length; si++) {
        const scene = HOOP_SCENES[si];
        const rng = seeded(si * 31337 + 42);
        const sz = 2000;
        const cvs = document.createElement("canvas");
        cvs.width = sz;
        cvs.height = sz;
        const ctx = cvs.getContext("2d")!;

        // ═════════════════════════════════════════════════════
        // OVAL FRAME path. white decorative frame like top sellers
        // ═════════════════════════════════════════════════════
        if (scene.shape === "oval") {
          const fs = scene as FrameScene;
          const cx = sz / 2;
          const cy = sz / 2 + 20; // slight offset for natural lean
          const rx = 660;  // horizontal radius
          const ry = 720;  // vertical radius (taller than wide)
          const frameW = 62; // frame border width

          // ── Warm gradient background ──
          const bgGrad = ctx.createLinearGradient(0, 0, 0, sz);
          bgGrad.addColorStop(0, fs.bgGrad[0]);
          bgGrad.addColorStop(0.6, fs.bgGrad[1]);
          bgGrad.addColorStop(1, "#D5CCBF");
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, sz, sz);

          // Subtle surface texture (table/surface feel)
          for (let i = 0; i < 8000; i++) {
            const tx = rng() * sz;
            const ty = rng() * sz;
            const tl = 2 + rng() * 6;
            ctx.strokeStyle = `rgba(0,0,0,${0.01 + rng() * 0.015})`;
            ctx.lineWidth = 0.3 + rng() * 0.3;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx + tl, ty + (rng() - 0.5) * 2);
            ctx.stroke();
          }

          // Soft depth-of-field / vignette on background
          const vigBg = ctx.createRadialGradient(cx, cy, 300, cx, cy, sz);
          vigBg.addColorStop(0, "rgba(0,0,0,0)");
          vigBg.addColorStop(0.5, "rgba(0,0,0,0)");
          vigBg.addColorStop(1, "rgba(0,0,0,0.08)");
          ctx.fillStyle = vigBg;
          ctx.fillRect(0, 0, sz, sz);

          // ── Frame shadow (soft, underneath) ──
          for (let sh = 4; sh >= 0; sh--) {
            ctx.save();
            ctx.shadowColor = fs.shadow;
            ctx.shadowBlur = 30 + sh * 18;
            ctx.shadowOffsetX = 6 + sh * 3;
            ctx.shadowOffsetY = 10 + sh * 5;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx + frameW * 0.4, ry + frameW * 0.4, 0, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(0,0,0,0.005)";
            ctx.fill();
            ctx.restore();
          }

          // ── Clip to inner oval for fabric + stitches ──
          const innerRx = rx - frameW;
          const innerRy = ry - frameW;
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(cx, cy, innerRx, innerRy, 0, 0, Math.PI * 2);
          ctx.clip();

          // Aida fabric base
          const [fR, fG, fB] = hexRgb(fs.fabric);
          ctx.fillStyle = fs.fabric;
          ctx.fillRect(0, 0, sz, sz);

          // Visible Aida weave threads
          const maxDimOval = Math.max(pattern.width, pattern.height);
          const cellSzOval = Math.max(8, Math.min(14, Math.floor((Math.min(innerRx, innerRy) * 1.6) / maxDimOval)));
          const patWOval = pattern.width * cellSzOval;
          const patHOval = pattern.height * cellSzOval;
          const patXOval = cx - patWOval / 2;
          const patYOval = cy - patHOval / 2;

          // Draw weave grid across entire oval area
          for (let wx = cx - innerRx; wx <= cx + innerRx; wx += cellSzOval) {
            ctx.strokeStyle = `rgba(${fR - 12},${fG - 12},${fB - 10},0.2)`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(wx, cy - innerRy);
            ctx.lineTo(wx, cy + innerRy);
            ctx.stroke();
          }
          for (let wy = cy - innerRy; wy <= cy + innerRy; wy += cellSzOval) {
            ctx.strokeStyle = `rgba(${fR - 12},${fG - 12},${fB - 10},0.2)`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(cx - innerRx, wy);
            ctx.lineTo(cx + innerRx, wy);
            ctx.stroke();
          }

          // Aida holes
          ctx.fillStyle = `rgba(${fR - 35},${fG - 35},${fB - 30},0.14)`;
          for (let wx = cx - innerRx; wx <= cx + innerRx; wx += cellSzOval) {
            for (let wy = cy - innerRy; wy <= cy + innerRy; wy += cellSzOval) {
              const dx = (wx - cx) / innerRx, dy = (wy - cy) / innerRy;
              if (dx * dx + dy * dy < 1) {
                ctx.beginPath();
                ctx.arc(wx, wy, cellSzOval * 0.055, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }

          // ── Draw cross-stitches ──
          for (let y = 0; y < pattern.height; y++) {
            for (let x = 0; x < pattern.width; x++) {
              const dmc = pattern.grid[y][x];
              if (isBackgroundCell(dmc, pattern.backgroundDmc)) continue;
              const hex = colorHexMap.get(dmc);
              if (!hex) continue;
              const sx = patXOval + x * cellSzOval;
              const sy = patYOval + y * cellSzOval;
              const m = cellSzOval * 0.1;
              const [rr, gg, bb] = hexRgb(hex);
              const tw = cellSzOval * 0.28;

              ctx.lineCap = "round";

              // Shadow
              ctx.strokeStyle = "rgba(0,0,0,0.1)";
              ctx.lineWidth = tw + 1.5;
              ctx.beginPath();
              ctx.moveTo(sx + m + 0.5, sy + m + 1);
              ctx.lineTo(sx + cellSzOval - m + 0.5, sy + cellSzOval - m + 1);
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(sx + cellSzOval - m + 0.5, sy + m + 1);
              ctx.lineTo(sx + m + 0.5, sy + cellSzOval - m + 1);
              ctx.stroke();

              // Under thread
              ctx.strokeStyle = `rgb(${Math.round(rr * 0.75)},${Math.round(gg * 0.75)},${Math.round(bb * 0.75)})`;
              ctx.lineWidth = tw;
              ctx.beginPath();
              ctx.moveTo(sx + m, sy + m);
              ctx.lineTo(sx + cellSzOval - m, sy + cellSzOval - m);
              ctx.stroke();

              // Under highlight
              ctx.strokeStyle = `rgba(${Math.min(255, rr + 30)},${Math.min(255, gg + 30)},${Math.min(255, bb + 30)},0.3)`;
              ctx.lineWidth = tw * 0.3;
              ctx.beginPath();
              ctx.moveTo(sx + m + tw * 0.15, sy + m - tw * 0.1);
              ctx.lineTo(sx + cellSzOval - m + tw * 0.15, sy + cellSzOval - m - tw * 0.1);
              ctx.stroke();

              // Over thread
              ctx.strokeStyle = hex;
              ctx.lineWidth = tw;
              ctx.beginPath();
              ctx.moveTo(sx + cellSzOval - m, sy + m);
              ctx.lineTo(sx + m, sy + cellSzOval - m);
              ctx.stroke();

              // Over highlight
              ctx.strokeStyle = `rgba(${Math.min(255, rr + 50)},${Math.min(255, gg + 50)},${Math.min(255, bb + 50)},0.35)`;
              ctx.lineWidth = tw * 0.25;
              ctx.beginPath();
              ctx.moveTo(sx + cellSzOval - m - tw * 0.12, sy + m - tw * 0.08);
              ctx.lineTo(sx + m - tw * 0.12, sy + cellSzOval - m - tw * 0.08);
              ctx.stroke();

              // Center bump
              ctx.fillStyle = `rgba(${Math.min(255, rr + 60)},${Math.min(255, gg + 60)},${Math.min(255, bb + 60)},0.4)`;
              ctx.beginPath();
              ctx.arc(sx + cellSzOval / 2, sy + cellSzOval / 2, tw * 0.2, 0, Math.PI * 2);
              ctx.fill();
            }
          }

          // Inner shadow vignette
          const vigInner = ctx.createRadialGradient(cx, cy, Math.min(innerRx, innerRy) * 0.8, cx, cy, Math.max(innerRx, innerRy));
          vigInner.addColorStop(0, "rgba(0,0,0,0)");
          vigInner.addColorStop(0.6, "rgba(0,0,0,0)");
          vigInner.addColorStop(1, "rgba(0,0,0,0.08)");
          ctx.fillStyle = vigInner;
          ctx.fillRect(0, 0, sz, sz);

          ctx.restore(); // unclip

          // ── Oval frame (decorative white molding) ──
          // Multi-layer frame for depth: outer rim, main body, inner bead
          const [frR, frG, frB] = hexRgb(fs.frame);
          const [fdR, fdG, fdB] = hexRgb(fs.frameDk);
          const [flR, flG, flB] = hexRgb(fs.frameLt);

          // Outer shadow edge
          ctx.strokeStyle = `rgba(${fdR},${fdG},${fdB},0.4)`;
          ctx.lineWidth = frameW + 10;
          ctx.beginPath();
          ctx.ellipse(cx + 2, cy + 3, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();

          // Main frame body
          ctx.strokeStyle = fs.frame;
          ctx.lineWidth = frameW;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();

          // Frame molding. outer raised edge (lighter)
          ctx.strokeStyle = `rgba(${flR},${flG},${flB},0.7)`;
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx + frameW * 0.38, ry + frameW * 0.38, 0, 0, Math.PI * 2);
          ctx.stroke();

          // Frame molding. inner lip
          ctx.strokeStyle = `rgba(${fdR},${fdG},${fdB},0.3)`;
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx - frameW * 0.38, ry - frameW * 0.38, 0, 0, Math.PI * 2);
          ctx.stroke();

          // Frame molding. decorative bead (subtle ridge)
          ctx.strokeStyle = `rgba(${flR},${flG},${flB},0.4)`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx + frameW * 0.15, ry + frameW * 0.15, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = `rgba(${fdR},${fdG},${fdB},0.15)`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx + frameW * 0.12, ry + frameW * 0.12, 0, 0, Math.PI * 2);
          ctx.stroke();

          // Top highlight arc (light hitting the top of the frame)
          ctx.strokeStyle = `rgba(255,255,255,0.35)`;
          ctx.lineWidth = frameW * 0.3;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, -1.8, -0.3);
          ctx.stroke();

          // Bottom shadow arc
          ctx.strokeStyle = `rgba(${fdR},${fdG},${fdB},0.25)`;
          ctx.lineWidth = frameW * 0.25;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 1.2, 2.2);
          ctx.stroke();

          // Inner edge shadow (where frame meets fabric)
          ctx.strokeStyle = `rgba(${fdR},${fdG},${fdB},0.2)`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(cx, cy, innerRx + 1, innerRy + 1, 0, 0, Math.PI * 2);
          ctx.stroke();

          results.push(cvs.toDataURL("image/jpeg", 0.93));
          continue; // skip the circular hoop code below
        }

        // ═════════════════════════════════════════════════════
        // CIRCULAR HOOP path (existing code)
        // ═════════════════════════════════════════════════════
        const hoopScene = scene as HoopScene;

        // ── Background ──
        if (hoopScene.bgType === "gingham") {
          const gsz = 48;
          const [aR, aG, aB] = hexRgb(hoopScene.bgA);
          const [bR, bG, bB] = hexRgb(hoopScene.bgB);
          const mR = Math.round((aR + bR) / 2), mG = Math.round((aG + bG) / 2), mB = Math.round((aB + bB) / 2);
          for (let gy = 0; gy < sz; gy += gsz) {
            for (let gx = 0; gx < sz; gx += gsz) {
              const col = Math.floor(gx / gsz) % 2;
              const row = Math.floor(gy / gsz) % 2;
              // True gingham: intersections darker, stripes mid, gaps light
              if (col === 0 && row === 0) ctx.fillStyle = `rgb(${aR},${aG},${aB})`;
              else if (col === 1 && row === 1) ctx.fillStyle = `rgb(${bR},${bG},${bB})`;
              else ctx.fillStyle = `rgb(${mR},${mG},${mB})`;
              ctx.fillRect(gx, gy, gsz, gsz);
            }
          }
          // Subtle fabric weave texture on gingham
          ctx.globalAlpha = 0.03;
          for (let fy = 0; fy < sz; fy += 4) {
            ctx.fillStyle = fy % 8 === 0 ? "rgba(0,0,0,1)" : "rgba(255,255,255,1)";
            ctx.fillRect(0, fy, sz, 1);
          }
          ctx.globalAlpha = 1;
        } else {
          // Linen texture
          const [bR, bG, bB] = hexRgb(hoopScene.bgA);
          ctx.fillStyle = hoopScene.bgA;
          ctx.fillRect(0, 0, sz, sz);
          // Linen fiber texture
          for (let i = 0; i < 15000; i++) {
            const fx = rng() * sz;
            const fy = rng() * sz;
            const fl = 4 + rng() * 12;
            const fa = rng() * Math.PI;
            const v = -6 + rng() * 12;
            ctx.strokeStyle = `rgba(${bR + v},${bG + v},${bB + v},${0.15 + rng() * 0.15})`;
            ctx.lineWidth = 0.5 + rng() * 0.5;
            ctx.beginPath();
            ctx.moveTo(fx, fy);
            ctx.lineTo(fx + Math.cos(fa) * fl, fy + Math.sin(fa) * fl);
            ctx.stroke();
          }
        }

        // Subtle fabric wrinkle/fold shadow (random curves)
        ctx.globalAlpha = 0.04;
        for (let w = 0; w < 3; w++) {
          ctx.strokeStyle = "rgba(0,0,0,1)";
          ctx.lineWidth = 40 + rng() * 60;
          ctx.beginPath();
          ctx.moveTo(rng() * sz, rng() * sz);
          ctx.quadraticCurveTo(rng() * sz, rng() * sz, rng() * sz, rng() * sz);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        const cx = sz / 2;
        const cy = sz / 2;
        const hoopR = 680;
        const ringW = 38;

        // ── Shadow under hoop (multi-layer for realism) ──
        for (let sh = 3; sh >= 0; sh--) {
          ctx.save();
          ctx.shadowColor = `rgba(0,0,0,${0.04 + sh * 0.03})`;
          ctx.shadowBlur = 20 + sh * 20;
          ctx.shadowOffsetX = 4 + sh * 4;
          ctx.shadowOffsetY = 6 + sh * 6;
          ctx.beginPath();
          ctx.arc(cx, cy, hoopR + ringW / 2, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(0,0,0,0.01)";
          ctx.fill();
          ctx.restore();
        }

        // ── Clip to inner hoop for fabric + stitches ──
        const innerR = hoopR - ringW / 2 - 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
        ctx.clip();

        // Aida fabric base
        const [fR, fG, fB] = hexRgb(hoopScene.fabric);
        ctx.fillStyle = hoopScene.fabric;
        ctx.fillRect(0, 0, sz, sz);

        // Visible Aida weave with holes
        const maxDim = Math.max(pattern.width, pattern.height);
        const cellSz = Math.max(8, Math.min(14, Math.floor((hoopR * 1.5) / maxDim)));
        const weaveSz = cellSz; // weave matches stitch grid
        const patW = pattern.width * cellSz;
        const patH = pattern.height * cellSz;
        const patX = cx - patW / 2;
        const patY = cy - patH / 2;

        // Draw Aida weave across entire hoop area
        const weaveStart = Math.floor((cx - innerR) / weaveSz) * weaveSz;
        const weaveEnd = Math.ceil((cx + innerR) / weaveSz) * weaveSz;
        const weaveStartY = Math.floor((cy - innerR) / weaveSz) * weaveSz;
        const weaveEndY = Math.ceil((cy + innerR) / weaveSz) * weaveSz;

        // Horizontal and vertical thread bands
        for (let wx = weaveStart; wx <= weaveEnd; wx += weaveSz) {
          const noise = (Math.sin(wx * 0.1) + 1) * 2;
          ctx.strokeStyle = `rgba(${fR - 12 + noise},${fG - 12 + noise},${fB - 10 + noise},0.25)`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(wx, cy - innerR);
          ctx.lineTo(wx, cy + innerR);
          ctx.stroke();
        }
        for (let wy = weaveStartY; wy <= weaveEndY; wy += weaveSz) {
          const noise = (Math.cos(wy * 0.1) + 1) * 2;
          ctx.strokeStyle = `rgba(${fR - 12 + noise},${fG - 12 + noise},${fB - 10 + noise},0.25)`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(cx - innerR, wy);
          ctx.lineTo(cx + innerR, wy);
          ctx.stroke();
        }

        // Aida holes at intersections (tiny dark dots)
        ctx.fillStyle = `rgba(${fR - 40},${fG - 40},${fB - 35},0.18)`;
        for (let wx = weaveStart; wx <= weaveEnd; wx += weaveSz) {
          for (let wy = weaveStartY; wy <= weaveEndY; wy += weaveSz) {
            const dx = wx - cx, dy = wy - cy;
            if (dx * dx + dy * dy < innerR * innerR) {
              ctx.beginPath();
              ctx.arc(wx, wy, cellSz * 0.06, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }

        // ── Draw cross-stitches with realistic thread ──
        for (let y = 0; y < pattern.height; y++) {
          for (let x = 0; x < pattern.width; x++) {
            const dmc = pattern.grid[y][x];
            if (isBackgroundCell(dmc, pattern.backgroundDmc)) continue;
            const hex = colorHexMap.get(dmc);
            if (!hex) continue;
            const sx = patX + x * cellSz;
            const sy = patY + y * cellSz;
            const m = cellSz * 0.1;
            const [rr, gg, bb] = hexRgb(hex);
            const tw = cellSz * 0.28; // thread width

            // Thread shadow (underneath both diagonals)
            ctx.strokeStyle = `rgba(0,0,0,0.12)`;
            ctx.lineWidth = tw + 1.5;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(sx + m + 0.5, sy + m + 1);
            ctx.lineTo(sx + cellSz - m + 0.5, sy + cellSz - m + 1);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(sx + cellSz - m + 0.5, sy + m + 1);
            ctx.lineTo(sx + m + 0.5, sy + cellSz - m + 1);
            ctx.stroke();

            // Under thread (bottom-left to top-right, darker)
            ctx.strokeStyle = `rgb(${Math.round(rr * 0.75)},${Math.round(gg * 0.75)},${Math.round(bb * 0.75)})`;
            ctx.lineWidth = tw;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(sx + m, sy + m);
            ctx.lineTo(sx + cellSz - m, sy + cellSz - m);
            ctx.stroke();

            // Under thread. subtle highlight line
            ctx.strokeStyle = `rgba(${Math.min(255, rr + 30)},${Math.min(255, gg + 30)},${Math.min(255, bb + 30)},0.3)`;
            ctx.lineWidth = tw * 0.3;
            ctx.beginPath();
            ctx.moveTo(sx + m + tw * 0.15, sy + m - tw * 0.1);
            ctx.lineTo(sx + cellSz - m + tw * 0.15, sy + cellSz - m - tw * 0.1);
            ctx.stroke();

            // Over thread (top-right to bottom-left, full color)
            ctx.strokeStyle = hex;
            ctx.lineWidth = tw;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(sx + cellSz - m, sy + m);
            ctx.lineTo(sx + m, sy + cellSz - m);
            ctx.stroke();

            // Over thread. highlight (thread sheen)
            ctx.strokeStyle = `rgba(${Math.min(255, rr + 50)},${Math.min(255, gg + 50)},${Math.min(255, bb + 50)},0.35)`;
            ctx.lineWidth = tw * 0.25;
            ctx.beginPath();
            ctx.moveTo(sx + cellSz - m - tw * 0.12, sy + m - tw * 0.08);
            ctx.lineTo(sx + m - tw * 0.12, sy + cellSz - m - tw * 0.08);
            ctx.stroke();

            // Center crossover bump (tiny bright dot where threads cross)
            const ccx = sx + cellSz / 2;
            const ccy = sy + cellSz / 2;
            ctx.fillStyle = `rgba(${Math.min(255, rr + 60)},${Math.min(255, gg + 60)},${Math.min(255, bb + 60)},0.4)`;
            ctx.beginPath();
            ctx.arc(ccx, ccy, tw * 0.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Inner hoop shadow on fabric (vignette inside hoop edge)
        const vigGrad = ctx.createRadialGradient(cx, cy, innerR * 0.85, cx, cy, innerR);
        vigGrad.addColorStop(0, "rgba(0,0,0,0)");
        vigGrad.addColorStop(0.7, "rgba(0,0,0,0)");
        vigGrad.addColorStop(1, "rgba(0,0,0,0.12)");
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, sz, sz);

        ctx.restore(); // unclip

        // ── Hoop ring (multi-layer 3D wood) ──
        const [hR, hG, hB] = hexRgb(hoopScene.hoop);
        const [hdR, hdG, hdB] = hexRgb(hoopScene.hoopDk);
        const [hlR, hlG, hlB] = hexRgb(hoopScene.hoopLt);

        // Outer shadow ring
        ctx.strokeStyle = `rgba(${hdR},${hdG},${hdB},0.6)`;
        ctx.lineWidth = ringW + 8;
        ctx.beginPath();
        ctx.arc(cx + 2, cy + 3, hoopR, 0, Math.PI * 2);
        ctx.stroke();

        // Main wood ring
        ctx.lineWidth = ringW;
        ctx.beginPath();
        ctx.arc(cx, cy, hoopR, 0, Math.PI * 2);
        ctx.strokeStyle = hoopScene.hoop;
        ctx.stroke();

        // Wood grain effect (radial lines with slight color variation)
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, hoopR + ringW / 2 + 2, 0, Math.PI * 2);
        ctx.arc(cx, cy, hoopR - ringW / 2 - 2, 0, Math.PI * 2);
        // Use evenodd clipping to clip to the ring area
        ctx.clip("evenodd");

        for (let a = 0; a < Math.PI * 2; a += 0.015) {
          const grainV = Math.sin(a * 12 + si) * 8;
          const r1 = hoopR - ringW / 2;
          const r2 = hoopR + ringW / 2;
          ctx.strokeStyle = `rgba(${hR + grainV},${hG + grainV},${hB + grainV},0.3)`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
          ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
          ctx.stroke();
        }
        ctx.restore();

        // Inner edge shadow (where hoop presses fabric)
        ctx.strokeStyle = `rgba(${hdR},${hdG},${hdB},0.35)`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy, hoopR - ringW / 2 + 1, 0, Math.PI * 2);
        ctx.stroke();

        // Outer highlight arc (light reflection on top half)
        ctx.strokeStyle = `rgba(${hlR},${hlG},${hlB},0.5)`;
        ctx.lineWidth = ringW * 0.3;
        ctx.beginPath();
        ctx.arc(cx, cy, hoopR, -1.2, 0.2);
        ctx.stroke();

        // Bright specular highlight (narrow)
        ctx.strokeStyle = `rgba(255,255,255,0.2)`;
        ctx.lineWidth = ringW * 0.12;
        ctx.beginPath();
        ctx.arc(cx, cy, hoopR + ringW * 0.1, -0.9, -0.1);
        ctx.stroke();

        // Bottom shadow arc
        ctx.strokeStyle = `rgba(${hdR},${hdG},${hdB},0.3)`;
        ctx.lineWidth = ringW * 0.25;
        ctx.beginPath();
        ctx.arc(cx, cy, hoopR, 1.8, 3.0);
        ctx.stroke();

        // ── Tightener screw at top ──
        const screwW = 28;
        const screwH = 55;
        const screwY = cy - hoopR - screwH + 8;

        // Screw housing (rectangle with rounded top)
        ctx.fillStyle = hoopScene.hoopDk;
        ctx.beginPath();
        ctx.roundRect(cx - screwW, screwY, screwW * 2, screwH, [screwW, screwW, 4, 4]);
        ctx.fill();

        // Screw housing highlight
        ctx.fillStyle = hoopScene.hoop;
        ctx.beginPath();
        ctx.roundRect(cx - screwW + 4, screwY + 3, screwW * 2 - 8, screwH - 6, [screwW - 4, screwW - 4, 2, 2]);
        ctx.fill();

        // Screw knob (circle at top)
        const knobR = 18;
        const knobY = screwY - 2;
        ctx.fillStyle = hoopScene.hoop;
        ctx.beginPath();
        ctx.arc(cx, knobY, knobR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = hoopScene.hoopDk;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Screw knob slot
        ctx.strokeStyle = hoopScene.hoopDk;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - knobR * 0.55, knobY);
        ctx.lineTo(cx + knobR * 0.55, knobY);
        ctx.stroke();

        // Knob highlight
        ctx.fillStyle = `rgba(255,255,255,0.15)`;
        ctx.beginPath();
        ctx.arc(cx - 3, knobY - 4, knobR * 0.4, 0, Math.PI * 2);
        ctx.fill();

        results.push(cvs.toDataURL("image/jpeg", 0.93));
      }

      setHoopMockups(results);
    } finally {
      setGeneratingHoopMockups(false);
    }
  }

  function mixHex(a: string, b: string, t: number): string {
    const ah = a.replace("#", ""),
      bh = b.replace("#", "");
    const r = Math.round(parseInt(ah.slice(0, 2), 16) * (1 - t) + parseInt(bh.slice(0, 2), 16) * t);
    const g = Math.round(parseInt(ah.slice(2, 4), 16) * (1 - t) + parseInt(bh.slice(2, 4), 16) * t);
    const bl = Math.round(parseInt(ah.slice(4, 6), 16) * (1 - t) + parseInt(bh.slice(4, 6), 16) * t);
    return `rgb(${r},${g},${bl})`;
  }

  /* ── Upload Mockup Template ── */
  const mockupFileRef = useRef<HTMLInputElement>(null);

  /* ── Auto-flow latches ──
     The seller's journey is Research → Design → Convert → Export →
     List → Preview → Bulk. Each "tab arrival" effect uses a boolean
     ref so we only auto-run ONCE per session; the user can still
     manually re-trigger anything via the button in the card. Refs
     (not state) so flipping them doesn't re-render.

     autoMockupTriggeredRef     — Export tab auto-generates 4 GPT scenes
     autoInfoCardsTriggeredRef  — Export tab auto-generates 6 info cards
     autoExportAdvancedRef      — Convert finish auto-forwards to Export
     autoListAdvancedRef        — 4 mockups ready auto-forwards to List
     autoListingGenTriggeredRef — List arrival auto-runs optimizer + copy
     listingPatternSigRef       — fingerprint of the pattern that last
                                  populated the listing form. Effect below
                                  compares this to the current pattern and
                                  wipes the form when they diverge, so
                                  swapping designs mid-session doesn't
                                  leak the prior listing copy into the
                                  new pattern's List tab.
  */
  const autoMockupTriggeredRef = useRef(false);
  const autoInfoCardsTriggeredRef = useRef(false);
  const autoExportAdvancedRef = useRef(false);
  const autoListAdvancedRef = useRef(false);
  const autoListingGenTriggeredRef = useRef(false);
  const listingPatternSigRef = useRef<string | null>(null);
  // Tracks the previous value of gptComposing so we can detect the
  // true→false edge ("batch just finished"). Using a ref to hold the
  // previous value of a prop/state is the idiomatic React pattern for
  // transition detection without extra renders.
  const prevGptComposingRef = useRef(false);

  // GPT-based mockup: send the uploaded frame photo + the rendered
  // pattern to OpenAI's image edits endpoint. Returns a finished
  // composite with pattern positioned inside the frame's opening,
  // matching the frame's perspective and lighting.
  async function handleGptMockupUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (!renderedPreview) {
      setGptError("Run Convert first so there's a pattern to composite.");
      return;
    }

    setGptError(null);
    setGptComposing(true);

    const readAsDataURL = (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error ?? new Error("read failed"));
        reader.readAsDataURL(file);
      });

    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const frameDataUrl = await readAsDataURL(file);
        const resp = await fetch("/api/wall-art/gpt-composite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ frame: frameDataUrl, pattern: renderedPreview }),
        });
        if (!resp.ok) {
          const errJson = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
          throw new Error(errJson.error || `HTTP ${resp.status}`);
        }
        const data = await resp.json();
        if (!data?.image) throw new Error("No image returned");
        setGptMockups((prev) => [...prev, { dataUrl: data.image as string }]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "GPT composite failed";
      console.error("[gpt-mockup] error:", msg);
      setGptError(msg);
    } finally {
      setGptComposing(false);
      // clear input so same file can be re-selected
      if (e.target) e.target.value = "";
    }
  }

  // Auto-generate 4 cross-stitch lifestyle mockups in parallel via
  // GPT-image-2. Replaces the upload-a-frame flow — no user input
  // needed. Fires on Export tab entry (see the auto-trigger effect
  // below) so by the time the seller sees the page, mockups are
  // already rendering. Results land in gptMockups so the existing
  // Etsy-upload + zip-package code picks them up unchanged.
  //
  // Why 4 scenes (cut from 6 on 2026-04-25): Etsy galleries have 10
  // image slots. We split them 4 lifestyle mockups + 6 info / pattern
  // cards (stitch count, PDF contents, pattern example, chart preview,
  // digital notice, color legend). Info cards are free canvas renders;
  // mockups are paid GPT-image-2 calls. The 4 kept scenes
  // (flat-lay hero, hands-stitching, cozy lap, shelf styled) are the
  // conversion-tested angles buyers actually scan for. The two dropped
  // scenes (hoopNavyLinen, desktopMakersKit) were near-duplicates of
  // hoopGinghamPink and lapCozy respectively. Cost: $0.28/listing
  // instead of $0.42 — saves $0.14/listing.
  async function generateAutoMockups() {
    // Prefer the AI-rendered finished-look (renderedPreview) because
    // it's a photorealistic render of how the embroidery will actually
    // look — gives GPT-image-2 the richest visual reference. If the
    // user only ran the cheap Python convert (no AI preview), fall
    // back to the quantized chart render (patternPreview). That still
    // works as a reference since GPT just needs SOMETHING to see.
    // Without this fallback, auto-firing on Export tab entry would
    // silently do nothing after a Python-only convert.
    const mockupSource = renderedPreview || patternPreview;
    if (!mockupSource) {
      setGptError("Run Convert first so there's a pattern to mockup.");
      return;
    }
    setGptError(null);
    setGptComposing(true);
    try {
      // TEST MODE — route to the free Sharp-based endpoint instead of
      // GPT-image-2. Same input/output shape, $0 cost, ~1-2s instead
      // of 60-120s. Use this for rehearsing the flow without burning
      // $0.28/iteration on listings you'll never publish.
      const endpoint = settings.testMode
        ? "/api/cross-stitch/auto-mockup-free"
        : "/api/cross-stitch/auto-mockup";
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: mockupSource, title: listTitle || patternName }),
      });
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        // 403 on gpt-image-2 == unverified-org. Surface the specific
        // fix-it link the Convert flow already uses, so the user isn't
        // left guessing.
        if (resp.status === 403) {
          throw new Error(
            "gpt-image-2 requires OpenAI organization verification. " +
              "Visit https://platform.openai.com/settings/organization/general → Verify Organization."
          );
        }
        throw new Error(errJson.error || `HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as {
        images?: { scene: string; dataUrl: string; model?: string }[];
        model?: string;
        succeeded?: number;
        requested?: number;
      };
      const imgs = data.images ?? [];
      if (imgs.length === 0) throw new Error("No mockups returned");
      // Log the actual model so "did it really use gpt-image-2?" is
      // verifiable from the browser console without server access.
      console.log(
        `[auto-mockup] model=${data.model ?? "?"} succeeded=${data.succeeded ?? imgs.length}/${data.requested ?? imgs.length}`,
        imgs.map((i) => ({ scene: i.scene, model: i.model }))
      );
      setGptMockups((prev) => [
        ...prev,
        ...imgs.map((i) => ({ dataUrl: i.dataUrl })),
      ]);
      // Tag the batch with the source key so hydration (and the
      // in-session invalidation effect) can detect "a different
      // pattern is active now — drop these." If the user clicked
      // "Generate 6 more" against the same preview, the key is
      // already set to the same value, so this is a no-op in that
      // case. If they clicked after switching patterns, the key
      // updates to point at the NEW preview — which is what we want.
      setGptMockupsSourceKey(mockupsKeyFor(mockupSource));
      // If some scenes failed (Tier-1 rate limit etc.), tell the user.
      // Don't block — partial results are still useful.
      if (
        typeof data.requested === "number" &&
        typeof data.succeeded === "number" &&
        data.succeeded < data.requested
      ) {
        setGptError(
          `Generated ${data.succeeded}/${data.requested} mockups — retry for the missing scenes.`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Auto-mockup failed";
      console.error("[auto-mockup] error:", msg);
      setGptError(msg);
    } finally {
      setGptComposing(false);
    }
  }

  /* ── In-session mockup invalidation ────────────────────────────
     Dump stale gptMockups the moment the preview source changes
     (user re-converted, switched gpt-image-1↔2, or loaded a new
     research idea). Without this, mockups generated for the PREVIOUS
     pattern persist in state and the Export-tab gallery shows the
     wrong design — the original "duck appearing in the Lavender
     Sprigs listing" bug was exactly this: autoMockupTriggeredRef was
     already true from the prior session, gptMockups was non-empty,
     so the auto-trigger effect short-circuited and the stale duck
     batch was displayed.

     We compare the current preview's key to the key stamped on the
     cached batch. On mismatch, drop both and flip the latch off —
     the auto-trigger effect will re-fire with the new preview.

     Dep is `renderedPreview` only; patternPreview derives from
     `pattern` but the auto-mockup path prefers renderedPreview when
     available, so gating on the richer source is sufficient. */
  useEffect(() => {
    if (!convertHydratedRef.current) return; // avoid firing during hydration
    if (gptMockups.length === 0) return;     // nothing to invalidate
    const currentKey = mockupsKeyFor(renderedPreview);
    if (!currentKey) return;                  // preview went null (reset path) — leave mockups alone
    if (gptMockupsSourceKey && gptMockupsSourceKey !== currentKey) {
      console.log(
        `[auto-mockup] preview changed — invalidating ${gptMockups.length} stale mockup(s)`,
      );
      setGptMockups([]);
      setGptMockupsSourceKey(null);
      autoMockupTriggeredRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderedPreview]);

  /* ── Auto-kick the mockup render on Export tab entry ──
     User asked for "mockups should generate automatic after i
     convert" — the moment they land on Export with any kind of
     pattern preview in hand (AI-rendered OR the Python/JS quantized
     chart), we kick off the 6-scene render. No click required.

     Gating conditions (all must hold):
       1. activeTab === "export" — don't render on Research/Convert.
       2. At least one preview image source exists — either the
          photorealistic AI render or the raw quantized chart.
       3. gptMockups.length === 0 — don't blow away existing results.
       4. !gptComposing — don't stack renders.
       5. !autoMockupTriggeredRef.current — one automatic run per
          session; user can still click "Generate 6 more".
       6. settings.testMode === true — auto-fire is GATED on test
          mode now. The paid GPT-image-2 endpoint costs $0.28/run,
          and silently auto-firing it on every tab entry was burning
          money on rehearsal sessions. In test mode (free Sharp),
          auto-fire is fine because the cost is $0. To run the paid
          mockups, the user clicks "Generate Mockups" deliberately.

     Errors bubble through generateAutoMockups' internal try/catch
     into gptError, same as the manual path. */
  useEffect(() => {
    // Use `pattern` as the dep instead of `patternPreview` — patternPreview is
    // declared further down the component body (to keep it near other derived
    // render-time values), so referencing it here would be a TDZ violation.
    // `patternPreview` is a direct function of `pattern`, so `pattern` flipping
    // to truthy is the right signal for "we now have a preview to render from".
    if (
      activeTab === "export" &&
      (renderedPreview || pattern) &&
      gptMockups.length === 0 &&
      !gptComposing &&
      !autoMockupTriggeredRef.current &&
      settings.testMode
    ) {
      autoMockupTriggeredRef.current = true;
      void generateAutoMockups();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, renderedPreview, pattern, settings.testMode]);

  /* ── Auto-generate the 4 info cards on Export/Preview tab entry ──
     The Etsy listing ships 10 images: 4 paid GPT lifestyle mockups + 4
     canvas-rendered info cards (pattern-info, pattern-example,
     pdf-contents, digital-notice) + 2 free canvas hoop renders =
     10 slots. Without this effect the info cards only populate when the
     user manually clicks a button that doesn't exist on every tab, so
     the gallery preview ends up showing only mockups and NO info cards
     — which is exactly the bug the user reported ("here is still 10
     listing images without info cards").

     Firing on BOTH Export and Preview because:
       - Export is where mockups auto-fire, so landing there should
         also prep the info cards in parallel (they render fast —
         canvas-only, ~100ms total).
       - Preview is the readonly gallery view where the user verifies
         the 10-slot split. If they skipped Export (e.g. refreshed
         into Preview), the cards still need to exist.

     Gating conditions (all must hold):
       1. On Export or Preview tab.
       2. Pattern exists (cards need the grid/colors).
       3. listingImages is empty — don't blow away existing cards.
       4. !generatingListingImages — don't stack render passes.
       5. !autoInfoCardsTriggeredRef.current — one automatic run per
          session; user can still manually regenerate if they add
          a custom hero via the Mockups tab.

     The 100ms setTimeout inside generateListingImgs lets the "generating"
     spinner actually render before the synchronous canvas work blocks
     the main thread. */
  useEffect(() => {
    if (
      (activeTab === "export" || activeTab === "preview") &&
      pattern &&
      listingImages.length === 0 &&
      !generatingListingImages &&
      !autoInfoCardsTriggeredRef.current
    ) {
      autoInfoCardsTriggeredRef.current = true;
      void generateListingImgs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, pattern]);

  /* ── Auto-advance Convert → Export ──
     User asked: "after convert finish auto move to the next page
     export". So the moment a fresh pattern lands while the user is
     still on the Convert tab, we forward them to Export (which then
     auto-starts the 4-mockup render via the effect above).

     IMPORTANT — wait for the GPT-image-2 listing preview too.
     The raw Python/JS pattern lands first (sets `pattern`), and the
     gpt-image-2 "Refine with GPT" render can still be in flight —
     the user sees "Generating listing preview…" on the chart. If we
     advanced purely on `pattern`, we'd whisk them to Export while
     the hero render is still loading and the Export page would miss
     the finished-look image in its mockup seed. So we also require
     `!rendering`. When the user never kicks off a refine render,
     `rendering` stays false and this effectively still fires on
     `pattern` arrival — no extra wait for the common path.

     Why a 600ms delay instead of instant: the convert result has a
     satisfying "pattern generated" card in the Convert tab with the
     metrics (stitch count, color count, difficulty). A brief pause
     gives the user a chance to glance at those before we whisk them
     away. Long enough to feel intentional, short enough to not feel
     like lag. */
  useEffect(() => {
    // Already advanced once — don't re-fire even if the user navigates
    // back to Convert later. The latch is set inside the setTimeout
    // callback (not here) so that a rendering=true→false flip-flop
    // during the 600ms window correctly reschedules the advance
    // instead of latching-and-cancelling.
    if (autoExportAdvancedRef.current) return;
    if (activeTab !== "convert" || !pattern || rendering) return;

    const timeout = setTimeout(() => {
      // Re-check activeTab at fire-time in case the user has
      // already navigated elsewhere manually — we don't want to
      // yank them away from wherever they are now.
      setActiveTab((prev) => (prev === "convert" ? "export" : prev));
      autoExportAdvancedRef.current = true;
    }, 600);
    return () => clearTimeout(timeout);
  }, [activeTab, pattern, rendering]);

  /* ── Auto-advance Export → List when mockups finish ──
     Once the batch is done, there's nothing else to do on Export —
     PDF is built, mockups are on screen. Forward to List so the
     SEO optimizer can auto-run.

     Edge detection: we want to fire exactly once, right when
     gptComposing transitions from true → false. Using a "has been
     composing" ref + just-finished check rather than a count
     threshold handles partial successes gracefully — if only 2 of
     4 scenes succeed (rate limits, etc.), we STILL advance so the
     user isn't stranded on Export with an incomplete gallery. */
  useEffect(() => {
    const justFinishedComposing =
      prevGptComposingRef.current && !gptComposing;
    prevGptComposingRef.current = gptComposing;

    if (
      justFinishedComposing &&
      activeTab === "export" &&
      gptMockups.length >= 1 &&
      !autoListAdvancedRef.current
    ) {
      autoListAdvancedRef.current = true;
      const timeout = setTimeout(() => {
        setActiveTab((prev) => (prev === "export" ? "list" : prev));
      }, 900);
      return () => clearTimeout(timeout);
    }
  }, [activeTab, gptMockups.length, gptComposing]);

  /* ── Invalidate stale listing copy when the pattern identity changes ──
     Motivating bug: user works on Pattern A, lands on List, auto-copy
     effect fires → listTitle/Description/Tags filled AND
     autoListingGenTriggeredRef flipped true. User goes back to Convert,
     uploads Pattern B, converts. Pattern state updates but the listing
     form + trigger ref don't — so when they next hit List they see
     Pattern A's copy under Pattern B's image (e.g. a "Loving Floral
     Embrace — Mother and Child Hug" title on a Silly Goose chart).

     Fix: track the sig of the pattern that owns the current listing
     copy. When the pattern's sig changes to something new, wipe the
     form and re-arm the auto-trigger — the List-tab auto-run effect
     below then regenerates against the current pattern.

     Why content-hash instead of object reference: refine() mutates
     pattern into a new object even when only a single cell changed,
     and we DO want that to invalidate (description mentions DMC count
     + stitch count which may shift). But we only want the effect to
     fire on genuinely new content, not on the initial hydrate render
     where pattern just transitioned null → P1 for the first time. */
  useEffect(() => {
    if (!pattern) return;
    const sig = patternSignature(pattern);
    if (listingPatternSigRef.current === null) {
      // First pattern of the session — stamp the sig but leave the
      // form alone. On a fresh load the form is empty anyway; on a
      // cache-hydrate the user's previous session's grid came back
      // with no listing copy attached (the cache doesn't persist
      // listTitle et al), so there's nothing to invalidate.
      listingPatternSigRef.current = sig;
      return;
    }
    if (listingPatternSigRef.current === sig) return;
    // Pattern swapped to a new design — wipe stale copy.
    setListTitle("");
    setListDescription("");
    setListTags("");
    setOptimizerResult(null);
    setTrademarkWarnings([]);
    autoListingGenTriggeredRef.current = false;
    listingPatternSigRef.current = sig;
  }, [pattern]);

  /* ── Auto-run the Etsy SEO Optimizer + listing copy on List entry ──
     User asked: "listing Etsy SEO Optimizer and Title tags price
     Description... all should be auto generate". Fire both pipelines
     in parallel the moment the seller lands on List:

       1. runListingOptimizer()  — produces the 3 title options, 13
          long-tail tags, smart price, and thumbnail hook shown in
          the optimizer card. This is the Etsy-SEO-focused pass.
       2. generateListingCopy()  — image-aware Gemini call that
          produces the title/description/tags directly into the form
          fields below AND flags trademark issues. Vision-grounded
          so the description mentions what's actually in the design.

     applyOptimizedListing() fires once the optimizer result lands
     (see next effect) as a fallback — if generateListingCopy failed
     for any reason, the form is still pre-filled from optimizer
     output. */
  useEffect(() => {
    if (
      activeTab === "list" &&
      pattern &&
      !autoListingGenTriggeredRef.current &&
      !optimizing &&
      !generatingListing
    ) {
      autoListingGenTriggeredRef.current = true;
      // Fire both in parallel — they hit different endpoints and
      // set different state slices, so there's no race condition.
      void runListingOptimizer();
      void generateListingCopy();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, pattern]);

  /* ── Auto-apply optimizer result to listing form ──
     When runListingOptimizer() lands a result, copy its first title
     + tags + price + description into the form fields below — but
     ONLY if those fields are still blank. If generateListingCopy()
     already beat us to filling them (image-aware description), we
     don't want to clobber that richer copy with the generic optimizer
     template. */
  useEffect(() => {
    if (!optimizerResult) return;
    if (listTitle) return; // form already populated by generateListingCopy — respect it
    applyOptimizedListing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optimizerResult]);

  async function handleMockupUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const id = `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const previewUrl = URL.createObjectURL(file);
      setMockupTemplates((prev) => [...prev, { id, previewUrl, file, detecting: true }]);

      // Compute perceptual fingerprint first. if a visually-similar frame
      // was positioned before, reuse that position instantly without hitting
      // the detection API. This is the fast path for repeat frame styles.
      let fingerprint: string | undefined;
      let cached: ReturnType<typeof findCachedPosition> = null;
      try {
        fingerprint = await computeFingerprint(previewUrl);
        cached = findCachedPosition(fingerprint);
      } catch { /* fingerprint failed. fall back to detection */ }

      if (cached) {
        // INSTANT path. apply saved position, no detection call.
        console.log(`[mockup] cache HIT for template ${id}. reusing saved position`);
        setMockupTemplates((prev) =>
          prev.map((t) => (t.id === id
            ? {
                ...t,
                fingerprint,
                cachedPos: cached!,
                detectedShape: cached!.shape,
                // Fabricate frameCorners from cached pos so the auto-fit effect applies it.
                frameCorners: [
                  { x: (cached!.x - cached!.scale / 2) / 100, y: (cached!.y - (cached!.scale * cached!.aspect) / 2) / 100 },
                  { x: (cached!.x + cached!.scale / 2) / 100, y: (cached!.y - (cached!.scale * cached!.aspect) / 2) / 100 },
                  { x: (cached!.x + cached!.scale / 2) / 100, y: (cached!.y + (cached!.scale * cached!.aspect) / 2) / 100 },
                  { x: (cached!.x - cached!.scale / 2) / 100, y: (cached!.y + (cached!.scale * cached!.aspect) / 2) / 100 },
                ],
                detecting: false,
              }
            : t))
        );
        continue;
      }

      // Fallback: run auto-detect as before.
      try {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.readAsDataURL(file);
        });
        const resp = await fetch("/api/wall-art/detect-frame", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64 }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.frameCorners) {
            setMockupTemplates((prev) =>
              prev.map((t) => (t.id === id ? { ...t, frameCorners: data.frameCorners, detectedShape: data.shape, fingerprint, detecting: false } : t))
            );
          } else {
            setMockupTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, fingerprint, detecting: false } : t)));
          }
        } else {
          setMockupTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, fingerprint, detecting: false } : t)));
        }
      } catch {
        setMockupTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, fingerprint, detecting: false } : t)));
      }
    }
    e.target.value = "";
  }

  /* ── Composite Pattern onto Uploaded Templates ── */
  /* ── Generate art with optional background removal ── */
  // Load an image URL (data: or http) into a canvas. Used so the AI-rendered
  // fabric preview can flow straight into the composite API as the art layer.
  async function urlToCanvas(url: string): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext("2d")!.drawImage(img, 0, 0);
        resolve(c);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  // Strip the aida-cloth background from the AI-rendered preview so only the
  // colored stitches remain (transparent elsewhere).
  //
  // Algorithm (saturation gate + RGB-distance to sampled fabric color):
  //   1. Sample fabric color from corner patches (the aida cream).
  //   2. For each pixel:
  //      - If saturation is HIGH → it's a colored stitch → keep opaque.
  //      - If saturation is LOW → check if color is close to fabric sample:
  //          - Close → fabric (including darker aida grid dots) → transparent.
  //          - Far → some dark desaturated stitch (grey, black) → keep opaque.
  //
  // This catches both the light fabric AND the darker grid dots of the aida
  // weave, while preserving pale pastel stitches AND dark grey stitches.
  function removeFabricBackground(src: HTMLCanvasElement): HTMLCanvasElement {
    const ctx = src.getContext("2d")!;
    const { width: W, height: H } = src;
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;

    // 1. Sample fabric from 4 corner patches (16×16 each), take median.
    const patch = 16;
    const samples: [number, number, number][] = [];
    const corners = [
      [0, 0],
      [W - patch, 0],
      [0, H - patch],
      [W - patch, H - patch],
    ];
    for (const [cx, cy] of corners) {
      for (let dy = 0; dy < patch; dy++) {
        for (let dx = 0; dx < patch; dx++) {
          const i = ((cy + dy) * W + (cx + dx)) * 4;
          samples.push([d[i], d[i + 1], d[i + 2]]);
        }
      }
    }
    samples.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
    const [fr, fg, fb] = samples[Math.floor(samples.length / 2)];

    const SAT_STITCH = 0.22;  // saturation ≥ this → definitely a stitch
    const FABRIC_DIST = 90;   // RGB distance within this of fabric → transparent

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const rn = r / 255, gn = g / 255, bn = b / 255;
      const max = Math.max(rn, gn, bn);
      const min = Math.min(rn, gn, bn);
      const delta = max - min;
      const saturation = max === 0 ? 0 : delta / max;

      // High saturation → colored stitch, always keep.
      if (saturation >= SAT_STITCH) continue;

      // Low saturation → could be fabric OR a grey/black stitch. Distance check.
      const dr = r - fr, dg = g - fg, db = b - fb;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist <= FABRIC_DIST) {
        d[i + 3] = 0; // fabric
      }
      // else: dark desaturated stitch (gray/black) → keep opaque.
    }

    const out = document.createElement("canvas");
    out.width = W;
    out.height = H;
    out.getContext("2d")!.putImageData(img, 0, 0);
    return out;
  }

  // Art canvas for compositing. Uses the detailed AI-rendered preview EXACTLY
  // as shown in Convert/Export — cream aida background included. The user
  // wants the mockup to look identical to the rendered preview, so we skip
  // any background removal or color adjustment.
  async function getBestArtCanvas(): Promise<HTMLCanvasElement | null> {
    if (renderedPreview) {
      try {
        return await urlToCanvas(renderedPreview);
      } catch (err) {
        console.warn("[composite] failed to load renderedPreview, falling back:", err);
      }
    }
    return generateArtCanvas();
  }

  // Overlay uses a background-stripped version of the rendered preview so
  // the user can see the frame through it while positioning. The final
  // composite still uses the full rendered preview (aida included) via
  // buildClientComposite, which paints the opening with sampled aida.
  const [transparentPreview, setTransparentPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!renderedPreview) { setTransparentPreview(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const raw = await urlToCanvas(renderedPreview);
        const clean = removeFabricBackground(raw);
        if (!cancelled) setTransparentPreview(clean.toDataURL("image/png"));
      } catch (err) {
        console.warn("[overlay] background removal failed:", err);
        if (!cancelled) setTransparentPreview(renderedPreview);
      }
    })();
    return () => { cancelled = true; };
  }, [renderedPreview]);

  // Sample a clean aida tile from the rendered preview.
  //
  // Naive "top-left corner" sampling can catch stitched content or chart
  // symbols and make the repeated tile look like text/lines. Instead we
  // scan several candidate patches (all 4 corners + midpoints of each edge)
  // and pick the one with the lowest color variance — that's the patch
  // that's all clean fabric, not stitches.
  function sampleAidaTile(src: HTMLCanvasElement): HTMLCanvasElement {
    const TILE = 128;
    const { width: W, height: H } = src;
    const sctx = src.getContext("2d")!;
    const margin = Math.min(16, Math.floor(Math.min(W, H) * 0.02));
    const candidates: [number, number][] = [
      // 4 corners
      [margin, margin],
      [W - TILE - margin, margin],
      [margin, H - TILE - margin],
      [W - TILE - margin, H - TILE - margin],
      // 4 edge midpoints
      [Math.floor(W / 2 - TILE / 2), margin],
      [Math.floor(W / 2 - TILE / 2), H - TILE - margin],
      [margin, Math.floor(H / 2 - TILE / 2)],
      [W - TILE - margin, Math.floor(H / 2 - TILE / 2)],
    ].map(([x, y]) => [Math.max(0, Math.min(W - TILE, x)), Math.max(0, Math.min(H - TILE, y))]);

    let best: { x: number; y: number; score: number } | null = null;
    for (const [x, y] of candidates) {
      const d = sctx.getImageData(x, y, TILE, TILE).data;
      // Variance of luminance — lower = cleaner (more uniform) fabric.
      let sum = 0, sum2 = 0, n = 0;
      for (let i = 0; i < d.length; i += 16) { // stride for speed
        const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        sum += L; sum2 += L * L; n++;
      }
      const mean = sum / n;
      const variance = sum2 / n - mean * mean;
      if (!best || variance < best.score) best = { x, y, score: variance };
    }

    const sx = best!.x, sy = best!.y;
    const imgData = sctx.getImageData(sx, sy, TILE, TILE);

    // Compute mean fabric color from this patch — used as a safe fallback
    // and as a "denoiser": if the patch's variance is still too high
    // (meaning stitches leaked in everywhere), blend heavily toward the
    // mean color to kill banding.
    const d = imgData.data;
    let mr = 0, mg = 0, mb = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { mr += d[i]; mg += d[i + 1]; mb += d[i + 2]; n++; }
    mr = Math.round(mr / n); mg = Math.round(mg / n); mb = Math.round(mb / n);

    // Blend each pixel toward the mean — 70% mean, 30% original. Preserves
    // just a hint of weave texture without any stitch-color banding.
    const BLEND = 0.7;
    for (let i = 0; i < d.length; i += 4) {
      d[i]     = Math.round(d[i]     * (1 - BLEND) + mr * BLEND);
      d[i + 1] = Math.round(d[i + 1] * (1 - BLEND) + mg * BLEND);
      d[i + 2] = Math.round(d[i + 2] * (1 - BLEND) + mb * BLEND);
      d[i + 3] = 255;
    }

    const tile = document.createElement("canvas");
    tile.width = TILE; tile.height = TILE;
    tile.getContext("2d")!.putImageData(imgData, 0, 0);
    return tile;
  }

  // End-to-end client-side composite: the pattern goes BEHIND the frame,
  // and the frame's interior fabric is cut out so our aida shows through.
  //
  //   Layer 1 (bottom): full-size art canvas (aida fill + rendered preview)
  //                     covering the opening bbox in template coords.
  //   Layer 2 (top):    template with an ellipse/rect hole punched where
  //                     the opening was — frame rim and background stay,
  //                     but the old interior fabric is gone.
  //
  // Returns a PNG data URL ready to display, or null if we can't do it
  // (missing rendered preview or frame corners).
  async function buildClientComposite(
    tpl: { file: File; frameCorners?: { x: number; y: number }[] }
  ): Promise<string | null> {
    if (!renderedPreview || !tpl.frameCorners || tpl.frameCorners.length < 4) return null;

    const preview = await urlToCanvas(renderedPreview);
    const template = await new Promise<HTMLCanvasElement>((resolve, reject) => {
      const url = URL.createObjectURL(tpl.file);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext("2d")!.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(c);
      };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });

    const tw = template.width;
    const th = template.height;

    // Opening bbox in pixels.
    const xs = tpl.frameCorners.map((c) => c.x * tw);
    const ys = tpl.frameCorners.map((c) => c.y * th);
    let opL = Math.min(...xs), opR = Math.max(...xs);
    let opT = Math.min(...ys), opB = Math.max(...ys);

    // Overshoot the detected opening so the aida reaches under the frame's
    // inner rim — covers any mismatched fabric ring between the detection
    // boundary and the wood. 5% is the sweet spot: big enough to kill the
    // visible gap, small enough to not eat into the wood.
    const OVERSHOOT = 0.05;
    const ow = opR - opL;
    const oh = opB - opT;
    opL = Math.max(0, opL - ow * OVERSHOOT);
    opR = Math.min(tw, opR + ow * OVERSHOOT);
    opT = Math.max(0, opT - oh * OVERSHOOT);
    opB = Math.min(th, opB + oh * OVERSHOOT);
    const opW = opR - opL, opH = opB - opT;
    if (opW <= 0 || opH <= 0) return null;

    // 1) Build art layer sized to match the opening bbox. We draw the
    // rendered preview scaled to COVER the whole opening — the preview's
    // own aida fills everything, so there's only ONE visible background.
    const art = document.createElement("canvas");
    art.width = Math.round(opW);
    art.height = Math.round(opH);
    const actx = art.getContext("2d")!;

    // Object-fit: cover sizing — whichever dimension needs to grow more,
    // scale the preview to match the opening, and let the other axis
    // overflow (we'll crop via positioning).
    const pAR = preview.width / preview.height;
    const oAR = opW / opH;
    let dw: number, dh: number;
    if (pAR > oAR) {
      dh = opH; dw = dh * pAR;
    } else {
      dw = opW; dh = dw / pAR;
    }

    // Honor the user's positioning: their artPosition.x/y (in template %)
    // tells us where in the opening they want the pattern centered. Map
    // that to opening-local coords and translate accordingly. Clamp so
    // the preview never uncovers an edge (cover invariant).
    const patCxOp = (artPosition.x / 100) * tw - opL;
    const patCyOp = (artPosition.y / 100) * th - opT;
    let dx = patCxOp - dw / 2;
    let dy = patCyOp - dh / 2;
    dx = Math.max(opW - dw, Math.min(0, dx));
    dy = Math.max(opH - dh, Math.min(0, dy));
    actx.drawImage(preview, dx, dy, dw, dh);

    // 2) Build "frame with hole": template minus the opening.
    const frame = document.createElement("canvas");
    frame.width = tw; frame.height = th;
    const fctx = frame.getContext("2d")!;
    fctx.drawImage(template, 0, 0);
    fctx.save();
    fctx.globalCompositeOperation = "destination-out";
    if (clipShape === "rectangle") {
      fctx.fillStyle = "#000";
      fctx.fillRect(opL, opT, opW, opH);
    } else {
      fctx.beginPath();
      fctx.ellipse(opL + opW / 2, opT + opH / 2, opW / 2, opH / 2, 0, 0, Math.PI * 2);
      fctx.fillStyle = "#000";
      fctx.fill();
    }
    fctx.restore();

    // 3) Compose: art first (bottom), then frame-with-hole on top.
    const out = document.createElement("canvas");
    out.width = tw; out.height = th;
    const octx = out.getContext("2d")!;
    octx.drawImage(art, opL, opT);
    octx.drawImage(frame, 0, 0);

    return out.toDataURL("image/png");
  }

  // Build an art canvas that FILLS the entire frame opening with aida, then
  // places the rendered preview at the user's chosen position/scale on top.
  // This way the frame's interior fabric is replaced with the exact same
  // cream aida as the rendered preview — no seam, no mismatch.
  //
  // Returns null if we have no rendered preview or no frame corners; the
  // caller should fall back to the old behavior in that case.
  async function buildOpeningFilledArt(
    tpl: { frameCorners?: { x: number; y: number }[] }
  ): Promise<{ canvas: HTMLCanvasElement; corners: { x: number; y: number }[] } | null> {
    if (!renderedPreview || !tpl.frameCorners || tpl.frameCorners.length < 4) return null;

    const preview = await urlToCanvas(renderedPreview);
    const tile = sampleAidaTile(preview);

    // Opening bbox in template [0-1] coords.
    const xs = tpl.frameCorners.map((c) => c.x);
    const ys = tpl.frameCorners.map((c) => c.y);
    const opL = Math.min(...xs), opR = Math.max(...xs);
    const opT = Math.min(...ys), opB = Math.max(...ys);
    const opW = opR - opL, opH = opB - opT;
    if (opW <= 0 || opH <= 0) return null;

    // Output canvas matching opening aspect.
    const W = 1200;
    const H = Math.max(1, Math.round(W * (opH / opW)));
    const out = document.createElement("canvas");
    out.width = W; out.height = H;
    const ctx = out.getContext("2d")!;

    // Fill with the aida tile (repeated) — this becomes the new fabric.
    const pat = ctx.createPattern(tile, "repeat");
    if (pat) {
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W, H);
    } else {
      // Fallback: solid average fabric color.
      ctx.fillStyle = "#efe6d5";
      ctx.fillRect(0, 0, W, H);
    }

    // Place the rendered preview at the user's chosen spot INSIDE the
    // opening. artPosition is in template coords (0-100); convert to
    // opening-relative coords.
    const ar = preview.height / preview.width;
    const patCxRel = (artPosition.x / 100 - opL) / opW;
    const patCyRel = (artPosition.y / 100 - opT) / opH;
    const patWRel = (artPosition.scale / 100) / opW;
    const patHRel = patWRel * ar * (opW / opH); // keep pixel aspect correct

    const pw = patWRel * W;
    const ph = patHRel * H;
    const px = patCxRel * W - pw / 2;
    const py = patCyRel * H - ph / 2;
    ctx.drawImage(preview, px, py, pw, ph);

    // Clip to the frame opening's shape so oval/circle frames get clean edges.
    if (clipShape === "oval" || clipShape === "circle") {
      const clipped = document.createElement("canvas");
      clipped.width = W; clipped.height = H;
      const cctx = clipped.getContext("2d")!;
      cctx.beginPath();
      cctx.ellipse(W / 2, H / 2, W / 2, H / 2, 0, 0, Math.PI * 2);
      cctx.clip();
      cctx.drawImage(out, 0, 0);
      return {
        canvas: clipped,
        corners: [
          { x: opL, y: opT }, { x: opR, y: opT },
          { x: opR, y: opB }, { x: opL, y: opB },
        ],
      };
    }

    return {
      canvas: out,
      corners: [
        { x: opL, y: opT }, { x: opR, y: opT },
        { x: opR, y: opB }, { x: opL, y: opB },
      ],
    };
  }

  function generateArtCanvas(): HTMLCanvasElement | null {
    if (!pattern) return null;
    const colorHexMap = new Map(pattern.colors.map((c) => [c.dmc, c.hex]));

    // Find background color: most common color in the pattern
    let bgDmc = pattern.backgroundDmc ?? "";
    if (removeBg && !bgDmc) {
      let maxCount = 0;
      for (const c of pattern.colors) {
        if (c.count > maxCount) { maxCount = c.count; bgDmc = c.dmc; }
      }
    }

    // Render at higher res with X-stitch effect for realism
    const cellSize = 12;
    const c = document.createElement("canvas");
    c.width = pattern.width * cellSize;
    c.height = pattern.height * cellSize;
    const ctx = c.getContext("2d")!;

    // Transparent background (no cream fill)
    ctx.clearRect(0, 0, c.width, c.height);

    for (let y = 0; y < pattern.height; y++) {
      for (let x = 0; x < pattern.width; x++) {
        const dmc = pattern.grid[y][x];
        if (isBackgroundCell(dmc, pattern.backgroundDmc) || (removeBg && dmc === bgDmc)) continue;
        const hex = colorHexMap.get(dmc);
        if (!hex) continue;
        const sx = x * cellSize;
        const sy = y * cellSize;
        const m = cellSize * 0.1;
        const hh = hex.replace("#", "");
        const r = parseInt(hh.slice(0, 2), 16);
        const g = parseInt(hh.slice(2, 4), 16);
        const b = parseInt(hh.slice(4, 6), 16);

        ctx.lineWidth = cellSize * 0.28;
        ctx.lineCap = "round";

        // Under thread (darker)
        ctx.strokeStyle = `rgb(${Math.round(r * 0.8)},${Math.round(g * 0.8)},${Math.round(b * 0.8)})`;
        ctx.beginPath(); ctx.moveTo(sx + m, sy + m); ctx.lineTo(sx + cellSize - m, sy + cellSize - m); ctx.stroke();

        // Over thread (full color)
        ctx.strokeStyle = hex;
        ctx.beginPath(); ctx.moveTo(sx + cellSize - m, sy + m); ctx.lineTo(sx + m, sy + cellSize - m); ctx.stroke();
      }
    }
    return c;
  }

  /* ── Composite one template using manual position ── */
  async function compositeOneTemplate(tplIdx: number) {
    if (!pattern) return;
    const tpl = mockupTemplates[tplIdx];
    if (!tpl) return;

    // Persist the user's final position against this template's fingerprint,
    // so the next time a visually-similar frame is uploaded it snaps to this
    // exact position without any detection or manual work.
    if (tpl.fingerprint) {
      savePosition(tpl.fingerprint, {
        x: artPosition.x,
        y: artPosition.y,
        scale: artPosition.scale,
        aspect: clipShape === "circle" ? 1 : detectedAspect,
        shape: clipShape,
      });
    }

    setCompositing(true);

    // Preferred path: composite entirely client-side, putting the pattern
    // BEHIND the frame and cutting the frame's interior fabric out. No
    // server call needed, and the frame's original fabric is completely
    // replaced by our aida.
    try {
      const directUrl = await buildClientComposite(tpl);
      if (directUrl) {
        setCompositedMockups((prev) => {
          const existing = prev.findIndex((m) => m.name === `Mockup ${tplIdx + 1}`);
          const entry = { name: `Mockup ${tplIdx + 1}`, dataUrl: directUrl };
          if (existing >= 0) { const copy = [...prev]; copy[existing] = entry; return copy; }
          return [...prev, entry];
        });
        setCompositing(false);
        return;
      }
    } catch (err) {
      console.warn("[composite] client-side path failed, falling back to server:", err);
    }

    let artBase64: string;
    let corners: { x: number; y: number }[];
    const filled = await buildOpeningFilledArt(tpl);
    if (filled) {
      artBase64 = filled.canvas.toDataURL("image/png").split(",")[1];
      corners = filled.corners;
    } else {
      // Fallback: previous behavior (position/scale driven, no aida fill).
      const artCanvas = await getBestArtCanvas();
      if (!artCanvas) { setCompositing(false); return; }
      let finalArt = artCanvas;
      if (clipShape === "circle") {
        const sz = Math.max(artCanvas.width, artCanvas.height);
        const clipped = document.createElement("canvas");
        clipped.width = sz; clipped.height = sz;
        const cctx = clipped.getContext("2d")!;
        cctx.beginPath();
        cctx.arc(sz / 2, sz / 2, sz / 2, 0, Math.PI * 2);
        cctx.clip();
        const ox = (sz - artCanvas.width) / 2;
        const oy = (sz - artCanvas.height) / 2;
        cctx.drawImage(artCanvas, ox, oy);
        finalArt = clipped;
      } else if (clipShape === "oval") {
        const w = artCanvas.width;
        const h = Math.round(w * detectedAspect);
        const clipped = document.createElement("canvas");
        clipped.width = w; clipped.height = h;
        const cctx = clipped.getContext("2d")!;
        cctx.beginPath();
        cctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        cctx.clip();
        const oy = (h - artCanvas.height) / 2;
        cctx.drawImage(artCanvas, 0, oy);
        finalArt = clipped;
      }
      artBase64 = finalArt.toDataURL("image/png").split(",")[1];
      const ar = clipShape === "circle" ? 1 : clipShape === "oval" ? detectedAspect : (pattern ? pattern.height / pattern.width : detectedAspect);
      const halfW = (artPosition.scale / 2) / 100;
      const halfH = (artPosition.scale / 2 * ar) / 100;
      const cx = artPosition.x / 100;
      const cy = artPosition.y / 100;
      corners = [
        { x: Math.max(0, cx - halfW), y: Math.max(0, cy - halfH) },
        { x: Math.min(1, cx + halfW), y: Math.max(0, cy - halfH) },
        { x: Math.min(1, cx + halfW), y: Math.min(1, cy + halfH) },
        { x: Math.max(0, cx - halfW), y: Math.min(1, cy + halfH) },
      ];
    }

    try {
      const reader = new FileReader();
      const tplBase64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(tpl.file);
      });

      const resp = await fetch("/api/wall-art/composite-mockup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: tplBase64, art: artBase64, frameCorners: corners }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.image) {
          const url = data.image.startsWith("data:") ? data.image : `data:image/png;base64,${data.image}`;
          setCompositedMockups((prev) => {
            const existing = prev.findIndex((m) => m.name === `Mockup ${tplIdx + 1}`);
            const entry = { name: `Mockup ${tplIdx + 1}`, dataUrl: url };
            if (existing >= 0) { const copy = [...prev]; copy[existing] = entry; return copy; }
            return [...prev, entry];
          });
        }
      }
    } catch (err) {
      console.error("Composite failed:", err);
    }
    setCompositing(false);
  }

  /* ── Composite all templates at once ── */
  async function compositeAllTemplates() {
    if (!pattern || mockupTemplates.length === 0) return;
    setCompositing(true);
    const results: { name: string; dataUrl: string }[] = [];

    // Save current position against the CURRENTLY OPEN template's fingerprint.
    // Applying to all uses the same position for every template, so we only
    // cache against templates whose fingerprint matches what the user
    // actually positioned. In practice the currently-open template is the
    // one the user tuned; the rest may or may not match visually.
    const activeIdx = editingMockupIdx;
    if (activeIdx !== null) {
      const activeTpl = mockupTemplates[activeIdx];
      if (activeTpl?.fingerprint) {
        savePosition(activeTpl.fingerprint, {
          x: artPosition.x,
          y: artPosition.y,
          scale: artPosition.scale,
          aspect: clipShape === "circle" ? 1 : detectedAspect,
          shape: clipShape,
        });
      }
    }

    for (const tpl of mockupTemplates) {
      if (!tpl.frameCorners) continue;
      try {
        // Preferred: client-side composite (pattern behind frame, interior
        // cut out). Falls through to server on failure.
        try {
          const directUrl = await buildClientComposite(tpl);
          if (directUrl) {
            results.push({ name: `Mockup ${results.length + 1}`, dataUrl: directUrl });
            continue;
          }
        } catch (err) {
          console.warn("[composite-all] client-side failed for a template:", err);
        }

        let artBase64: string;
        let corners: { x: number; y: number }[];
        const filled = await buildOpeningFilledArt(tpl);
        if (filled) {
          artBase64 = filled.canvas.toDataURL("image/png").split(",")[1];
          corners = filled.corners;
        } else {
          const artCanvas = await getBestArtCanvas();
          if (!artCanvas) continue;
          let finalArt = artCanvas;
          if (clipShape === "circle") {
            const sz = Math.max(artCanvas.width, artCanvas.height);
            const clipped = document.createElement("canvas");
            clipped.width = sz; clipped.height = sz;
            const cctx = clipped.getContext("2d")!;
            cctx.beginPath();
            cctx.arc(sz / 2, sz / 2, sz / 2, 0, Math.PI * 2);
            cctx.clip();
            const ox = (sz - artCanvas.width) / 2;
            const oy = (sz - artCanvas.height) / 2;
            cctx.drawImage(artCanvas, ox, oy);
            finalArt = clipped;
          } else if (clipShape === "oval") {
            const w = artCanvas.width;
            const h = Math.round(w * detectedAspect);
            const clipped = document.createElement("canvas");
            clipped.width = w; clipped.height = h;
            const cctx = clipped.getContext("2d")!;
            cctx.beginPath();
            cctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
            cctx.clip();
            const oy = (h - artCanvas.height) / 2;
            cctx.drawImage(artCanvas, 0, oy);
            finalArt = clipped;
          }
          artBase64 = finalArt.toDataURL("image/png").split(",")[1];
          const ar = clipShape === "circle" ? 1 : clipShape === "oval" ? detectedAspect : (pattern ? pattern.height / pattern.width : detectedAspect);
          const cx = artPosition.x / 100;
          const cy = artPosition.y / 100;
          const halfW = (artPosition.scale / 2) / 100;
          const halfH = (artPosition.scale / 2 * ar) / 100;
          corners = [
            { x: Math.max(0, cx - halfW), y: Math.max(0, cy - halfH) },
            { x: Math.min(1, cx + halfW), y: Math.max(0, cy - halfH) },
            { x: Math.min(1, cx + halfW), y: Math.min(1, cy + halfH) },
            { x: Math.max(0, cx - halfW), y: Math.min(1, cy + halfH) },
          ];
        }

        const reader = new FileReader();
        const tplBase64 = await new Promise<string>((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.readAsDataURL(tpl.file);
        });

        const resp = await fetch("/api/wall-art/composite-mockup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template: tplBase64, art: artBase64, frameCorners: corners }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.image) {
            const url = data.image.startsWith("data:") ? data.image : `data:image/png;base64,${data.image}`;
            results.push({ name: `Mockup ${results.length + 1}`, dataUrl: url });
          }
        }
      } catch (err) {
        console.error("Composite failed:", err);
      }
    }

    setCompositedMockups(results);
    setCompositing(false);
  }

  function removeMockupTemplate(id: string) {
    setMockupTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  /* ── AI Mockup Best Picker ── */
  async function runMockupBestPicker() {
    if (mockupTemplates.length < 2) return;
    setMockupPickerLoading(true);
    setMockupPickerResults(null);

    try {
      // Convert art pattern to base64 if we have one
      let artBase64: string | null = null;
      if (pattern) {
        const c = generateArtCanvas();
        if (c) {
          const dataUrl = c.toDataURL("image/png");
          const idx = dataUrl.indexOf(",");
          artBase64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
        }
      }

      // Convert all templates to base64
      const templates = await Promise.all(
        mockupTemplates.map(async (t) => {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(t.file);
          });
          const idx = dataUrl.indexOf(",");
          return {
            id: t.id,
            name: `Template ${mockupTemplates.indexOf(t) + 1}`,
            base64: idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl,
          };
        })
      );

      const resp = await fetch("/api/wall-art/best-picker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artBase64,
          templates,
          niche: "cross-stitch embroidery hoop",
          artDescription: pattern ? `Cross-stitch pattern, ${pattern.width}x${pattern.height} grid, ${pattern.colors.length} colors` : "",
        }),
      });

      if (!resp.ok) throw new Error("Best picker failed");
      const data = await resp.json();
      setMockupPickerResults(data.rankings || []);
    } catch (err) {
      console.error("Mockup best picker error:", err);
      setMockupPickerResults([]);
    } finally {
      setMockupPickerLoading(false);
    }
  }

  const patternPreview = pattern ? renderPatternPreview() : null;
  const stitchDetail = pattern ? renderStitchDetail() : null;
  const patternChart = pattern ? renderPatternChart() : null;
  const stitchDetailChart = pattern ? renderStitchDetailChart() : null;
  // Debug stage thumbnails. Rendered once per debugStages change and
  // cached — re-rendering 5 canvases on every parent re-render would be
  // wasteful. Empty array when debugStages is null.
  const debugStageThumbs = useMemo(() => {
    if (!debugStages) return [] as { label: string; description: string; url: string | null }[];
    return debugStages.stages.map((s) => ({
      label: s.label,
      description: s.description,
      url: renderGridSnapshot(s.grid, debugStages.colorMap, debugStages.aidaDmc, debugStages.gw, debugStages.gh),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debugStages]);

  // Pattern stats (finished size at each aida count, difficulty rating,
  // stitching-time range). Recomputed whenever the pattern changes so
  // refine/undo/color-edit operations stay in sync with the card. Pure
  // math via @/lib/pattern-stats — no side effects, no API call.
  const patternStats = useMemo(
    () => (pattern ? computePatternStats(pattern) : null),
    [pattern]
  );

  /* ── JSX ── */
  // Progress / step nav uses the VISIBLE tabs only — the hidden Design
  // tab stays out of both the numbered step circles and the progress
  // bar fill.  When a (legacy) flow sets activeTab="design", we treat
  // that as still on the previous visible step so the bar doesn't
  // jump to a phantom tab the user never sees.
  const currentVisibleIdx = visibleTabs.findIndex((t) => t.id === activeTab);
  const currentTabIdx = currentVisibleIdx >= 0 ? currentVisibleIdx : 0;
  const progressPct = ((currentTabIdx + 1) / visibleTabs.length) * 100;

  // Load a completed Auto-Pipeline item back into the single-design
  // state and jump to the Convert tab.  Loads the PRE-COMPUTED chart
  // (from patternFull, captured at orchestrator time) so the user
  // sees the finished chart instantly — no need to click Convert
  // again.  Falls back to clearing pattern if patternFull is missing
  // (legacy queue items from before this code shipped).
  const viewAutoPipelineItem = useCallback((item: AutoPipelineItem) => {
    if (!item.imageUrl || !item.cleanImageUrl) return;
    setForceSquareNext(true);
    setSourceImage(item.cleanImageUrl);
    setHasFlattenedUpload(true);
    // Load the pre-computed chart directly into state so the Convert
    // tab shows the finished design without any further API calls.
    if (item.patternFull) {
      setPattern({
        grid: item.patternFull.grid,
        colors: item.patternFull.colors,
        width: item.patternFull.width,
        height: item.patternFull.height,
        totalStitches: item.patternFull.totalStitches,
        backgroundDmc: item.patternFull.backgroundDmc,
        totalCells: item.patternFull.totalCells,
        stitchedCells: item.patternFull.stitchedCells,
        backgroundRemovedCells: item.patternFull.backgroundRemovedCells,
        patternPdfB64: item.patternFull.patternPdfB64,
      });
    } else {
      // Legacy item (saved before patternFull existed) — user will need
      // to click Convert again to regenerate the chart.
      setPattern(null);
    }
    setCleanedImage(null);
    setCleanedModel(null);
    setRenderedPreview(null);
    setGeneratedDesignUrl(item.imageUrl);
    setCleanConvertDataUrl(null);
    setGeneratedDesignEngine("gpt-image-2");
    setDesignPrompt(item.title);
    // Stale-info-card guard: without resetting here, navigating to
    // Preview after clicking View on a different queue item leaves
    // the previous item's stitch-count / pattern-example cards on
    // screen even though the chart + mockups have switched.
    setListingImages([]);
    autoInfoCardsTriggeredRef.current = false;
    setActiveTab("convert");
  }, []);

  return (
    <div
      className="min-h-screen bg-[#05070b] px-4 py-5 text-white sm:px-6 lg:px-8"
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px), radial-gradient(circle at 76% 4%, rgba(37,99,235,0.24), transparent 34%), radial-gradient(circle at 8% 86%, rgba(180,83,9,0.16), transparent 28%)",
        backgroundSize: "56px 56px, 56px 56px, auto, auto",
      }}
    >
      <div className="mx-auto max-w-[1500px] space-y-5">
      {/* Per-session OpenAI cost badge — top-right floating overlay.
          Sums every gpt-image-2 + gpt-4o-mini call this session so the
          seller can see real-time spend without flipping to the OpenAI
          dashboard.  Hidden until first call. */}
      <OpenAICostBadge />

      {/* Auto-Pipeline dashboard — fixed bottom-right overlay.
          Per 2026-05-15 spec: ZERO manual clicks after Auto-Generate.
          The orchestrator runs ALL stages inline (Stage 1 → 2 → 3 → 4)
          and auto-navigates to Preview when complete.  No
          onContinueExport prop is wired — the whole flow is automatic. */}
      <AutoPipelinePanel
        state={autoPipelineState}
        onCancel={async () => {
          // Optimistic UI flip — server cancel is async.
          setAutoPipelineState((prev) => prev ? { ...prev, cancelled: true } : prev);
          const id = pipelineJobIdRef.current;
          if (id) {
            try {
              await fetch(`/api/cross-stitch/pipeline/${id}`, { method: "DELETE" });
            } catch { /* polling will catch up */ }
          }
        }}
        onViewItem={viewAutoPipelineItem}
        onClear={async () => {
          // Optimistic clear, then PATCH delete:true on the server so
          // a refresh doesn't bring the stale queue back.
          setAutoPipelineState(null);
          const id = pipelineJobIdRef.current;
          setPipelineJobId(null);
          if (id) {
            try {
              await fetch(`/api/cross-stitch/pipeline/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ delete: true }),
              });
            } catch { /* non-fatal */ }
          }
        }}
      />

      <header className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black/38 p-5 shadow-[0_28px_120px_rgba(0,0,0,0.42)] backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.04] via-transparent to-blue-500/[0.06]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-emerald-100/80">
              <span className="h-2 w-2 rounded-full bg-emerald-300" />
              Cross Stitch Command
            </div>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-white md:text-5xl">
              Research, convert, package.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/48">
              One workspace for idea discovery, pattern conversion, mockups, listing assets, and review before anything goes live.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[360px]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
              <p className="text-lg font-semibold text-white">{autoPipelineState?.items.length || 0}</p>
              <p className="text-[9px] uppercase tracking-[0.16em] text-white/32">queue</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
              <p className="text-lg font-semibold text-white">{autoPipelineState?.items.filter((i) => i.status === "done").length || 0}</p>
              <p className="text-[9px] uppercase tracking-[0.16em] text-white/32">ready</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
              <p className="text-lg font-semibold text-white">${(autoPipelineState?.totalCostUsd || 0).toFixed(2)}</p>
              <p className="text-[9px] uppercase tracking-[0.16em] text-white/32">spent</p>
            </div>
          </div>
        </div>
      </header>

      {/* ── Progress Stepper ── */}
      <div className="relative rounded-[24px] border border-white/10 bg-black/34 p-4 shadow-[0_22px_90px_rgba(0,0,0,0.34)] backdrop-blur-xl">
        {/* Track */}
        <div className="absolute left-0 right-0 top-[19px] h-[2px] bg-[var(--border-subtle)] -z-0" />
        <div
          className="absolute left-0 top-[19px] h-[2px] -z-0 transition-all duration-500"
          style={{
            width: `${progressPct}%`,
            background: "linear-gradient(90deg, #F1641E, #F59454)",
          }}
        />

        <div className="relative flex items-start justify-between gap-1">
          {visibleTabs.map((tab, i) => {
            const isActive = activeTab === tab.id;
            const isComplete = i < currentTabIdx;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="group flex flex-col items-center gap-2 flex-1 min-w-0"
              >
                <div
                  className={`w-[38px] h-[38px] rounded-full flex items-center justify-center text-[12px] font-semibold transition-all ${
                    isActive
                      ? "text-[var(--accent-contrast)] scale-110"
                      : isComplete
                        ? "text-[var(--accent-contrast)]"
                        : "text-[var(--text-muted)] bg-[var(--bg-elevated)] border border-[var(--border-default)] group-hover:border-[var(--border-strong)]"
                  }`}
                  style={
                    isActive || isComplete
                      ? {
                          background: "linear-gradient(180deg, #F1641E, #D94F0F)",
                          boxShadow:
                            "inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 14px rgba(241, 100, 30, 0.35)",
                        }
                      : undefined
                  }
                >
                  {isComplete ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={`text-[11.5px] font-medium tracking-[-0.005em] transition-colors ${
                    isActive ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ────────── RESEARCH TAB ────────── */}
      {activeTab === "research" && (
        <div className="page-enter">
          <div className="mb-5">
            <p className="text-[11px] font-bold text-amber-500/60 uppercase tracking-widest mb-1">Cross Stitch Studio</p>
            <h1 className="text-[28px] font-bold text-[var(--text-primary)] leading-none tracking-tight mb-1">Research Hub</h1>
            <p className="text-[12px] text-[var(--text-muted)]">Find what sells — market intelligence powered by live Etsy data</p>
          </div>
          <CrossStitchResearchHub
            autoPipelineActive={!!autoPipelineState?.active}
            onStartAutoPipeline={runAutoPipeline}
            onConvert={(query, imageUrl, productTitle) => {
            // Build a useful image-generation prompt.
            // Use the full product TITLE when available — it has the rich
            // details ("Goose with Blue Bow") vs the scan keyword which
            // is generic ("cross stitch goose pattern").
            const baseText = productTitle || query;
            const stripped = baseText
              // Remove cross-stitch medium references (no visual meaning)
              .replace(/cross[\s-]?stitch/gi, "")
              .replace(/\bcounted\b/gi, "")
              // Remove "- Beginner Friendly ..." style suffixes before stripping
              .replace(/-\s*(beginner[\s\w]*|easy[\s\w]*|simple[\s\w]*|pattern\s*keeper[\s\w]*).*/i, "")
              // Remove Etsy boilerplate words
              .replace(/\b(pattern|pdf|chart|dmc|instant\s*download|digital\s*download|printable|download|sampler|beginner|friendly|compatible|counted|embroidery\s*art|embroidery)\b/gi, "")
              .replace(/\(.*?\)/g, "")   // strip parenthesised notes
              .replace(/[,;:]+/g, " ")
              .replace(/\s+/g, " ")
              .trim();

            const words = stripped.split(/\s+/).filter(Boolean);
            let prompt: string;

            if (!stripped || words.length === 0) {
              prompt = query;
            } else if (words.length <= 2) {
              // Short subject — enrich with style context
              const lower = stripped.toLowerCase();
              if (/gothic|witch|skull|ghost|dark|grim|pumpkin|halloween/.test(lower)) {
                prompt = `${stripped}, gothic spooky art, flat illustration`;
              } else if (/floral|botanical|flower|rose|daisy|wildflower|lavender/.test(lower)) {
                prompt = `${stripped}, delicate botanical illustration, watercolor style`;
              } else if (/funny|snarky|humor|quote|text/.test(lower)) {
                prompt = `funny ${stripped} character, cartoon sticker style`;
              } else if (/cottagecore|cozy|forest|cottage|fairy/.test(lower)) {
                prompt = `${stripped}, cottagecore aesthetic, soft illustration`;
              } else if (/fantasy|wizard|dragon|mermaid|unicorn|elf/.test(lower)) {
                prompt = `${stripped}, fantasy art, flat cartoon illustration`;
              } else if (/kawaii|cute|chibi/.test(lower)) {
                prompt = `${stripped}, kawaii flat sticker style, pastel colors`;
              } else {
                prompt = `cute ${stripped} character, flat cartoon sticker style, white background`;
              }
            } else {
              // 3+ meaningful words — the title already describes the subject well
              prompt = stripped;
            }

            setSearchQuery(query);
            setDesignPrompt(prompt);
            // Store reference product so the Convert tab can show it as inspiration
            setRefImage(imageUrl || null);
            setRefTitle(productTitle || null);
            setActiveTab("convert");
          }} />
        </div>
      )}

      {/* ────────── DESIGN TAB ────────── */}
      {activeTab === "design" && (
        <div className="page-enter space-y-6">
          {/* Workflow Steps */}
          <div className="flex items-center gap-2 px-1 flex-wrap">
            {[
              { num: "1", label: "Describe design", done: !!designPrompt },
              // Step 2 can happen EITHER by a free user upload OR a paid
              // AI render — we label it neutrally so the stepper doesn't
              // push the paid path as the "correct" route.
              { num: "2", label: "Upload or render", done: !!generatedDesignUrl || !!sourceImage },
              { num: "3", label: "Send to Convert", done: false },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`w-[22px] h-[22px] rounded-full text-[10px] font-semibold flex items-center justify-center transition-all ${
                  step.done
                    ? "text-[var(--accent-contrast)]"
                    : "bg-[var(--bg-inset)] text-[var(--text-muted)] border border-[var(--border-subtle)]"
                }`}
                style={
                  step.done
                    ? {
                        background: "linear-gradient(180deg, #F1641E, #D94F0F)",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 2px 6px rgba(241, 100, 30, 0.28)",
                      }
                    : undefined
                }>
                  {step.done ? (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : step.num}
                </div>
                <span className={`text-[11.5px] font-medium ${step.done ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>
                  {step.label}
                </span>
                {i < 2 && <svg className="w-3 h-3 text-[var(--text-faint)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>}
              </div>
            ))}
          </div>

          <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-5">
            <h3 className="text-[var(--text-primary)] font-semibold text-[14px] mb-4">Design Your Pattern</h3>

            {/* Style selector */}
            <div className="flex flex-wrap gap-2 mb-4">
              {([
                // Beginner / Etsy first \u2014 it's the recommended starting
                // point for new sellers (matches NalaAndStitch-style
                // listings: simple subject, ~80 stitches, 10-13 DMC).
                // The other styles assume more design experience and
                // larger / busier outputs.
                { id: "nala-beginner" as const, label: "Beginner / Etsy", emoji: "\uD83D\uDC23" },
                { id: "cute" as const, label: "Cute & Fun", emoji: "\uD83D\uDE0A" },
                { id: "vintage" as const, label: "Vintage", emoji: "\uD83C\uDF39" },
                { id: "modern" as const, label: "Modern", emoji: "\u2728" },
                { id: "sampler" as const, label: "Sampler", emoji: "\uD83E\uDDF5" },
                { id: "pixel" as const, label: "Pixel Art", emoji: "\uD83C\uDFAE" },
              ]).map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setDesignStyle(s.id); setGeneratedDesignUrl(null); setCleanConvertDataUrl(null); setGeneratedDesignEngine(null); setDesignError(null); }}
                  className={`px-3.5 py-2 rounded-lg text-[12px] font-medium transition-all ${
                    designStyle === s.id
                      ? "bg-[var(--accent-soft)] text-[var(--accent-primary)] border border-[var(--border-accent)]"
                      : "bg-[var(--bg-inset)] text-[var(--text-muted)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>

            <textarea
              value={designPrompt}
              onChange={(e) => { setDesignPrompt(e.target.value); setGeneratedDesignUrl(null); setCleanConvertDataUrl(null); setGeneratedDesignEngine(null); setDesignError(null); }}
              placeholder="Describe your cross-stitch design... e.g., 'A cute goose wearing a chef hat with text SILLY GOOSE'"
              rows={3}
              className="w-full px-4 py-3 rounded-xl text-[13px] resize-none mb-3"
            />

            {/* Cost guidance — the Design step's paid AI render is the
                single biggest recurring OpenAI spend in this pipeline
                (~$0.04/click at medium quality). The fix the user
                requested: render a FREE Flux preview first so they can
                eyeball composition/subject before committing. If the
                preview already looks good, they can send it straight to
                Convert and skip the paid render entirely. If it's close
                but not right, they tweak the prompt and re-preview (still
                free). Only pay GPT-Image-2 when they actually want HQ. */}
            <div className="mb-3 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-[11px] text-emerald-300/90 flex items-start gap-2">
              <span className="mt-0.5">💡</span>
              <span>
                <strong className="text-emerald-200">Click Preview first — it's free.</strong> See how the idea looks before spending $0.04 on a final GPT-Image-2 render. If the preview already looks right, send it straight to Convert.
              </span>
            </div>

            <div className="flex gap-3 flex-wrap">
              {/* PRIMARY: Free Pollinations Flux preview. Re-clickable as
                  many times as the seller wants while iterating on the
                  prompt — zero cost per click. */}
              <button
                disabled={!designPrompt.trim() || generatingPreview || generatingDesign}
                className="btn-amber rounded-xl h-11 px-5 text-[13px] font-semibold disabled:opacity-40 flex items-center gap-2"
                onClick={generateDesignPreview}
                title={!designPrompt.trim() ? "Type a description first" : "Free preview — uses Pollinations Flux (no OpenAI cost)"}
              >
                {generatingPreview ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    Previewing…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Preview
                    <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      FREE
                    </span>
                  </>
                )}
              </button>

              {/* SECONDARY: Paid GPT-Image-2 final render. Outline style
                  so it reads as "the upgrade option", with per-click cost
                  shown BEFORE the click. Only worth clicking if the free
                  preview showed the idea is viable. */}
              <button
                disabled={!designPrompt.trim() || generatingDesign || generatingPreview}
                className="h-11 px-4 rounded-xl text-[12px] font-medium text-[var(--text-secondary)] bg-[var(--bg-inset)] border border-[var(--border-default)] hover:text-[var(--text-primary)] hover:border-purple-500/40 hover:bg-purple-500/5 transition-all disabled:opacity-40 flex items-center gap-2"
                onClick={generateDesignImage}
                title={!designPrompt.trim() ? "Type a description first" : "Calls OpenAI GPT-Image-2 — ~$0.04 per render"}
              >
                {generatingDesign ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    Rendering HQ…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    HQ render
                    <span className="text-[10px] font-semibold text-purple-300/80">
                      ~$0.04
                    </span>
                  </>
                )}
              </button>
            </div>

            {/* Small escape hatch for sellers who already have MJ / DALL·E
                art ready — no need to re-generate. Tucked below the main
                buttons as a text link so it doesn't compete with Preview
                for attention. Clicking opens a file picker; on pick,
                handleImageUpload loads it and we auto-advance to Convert
                so there's no "click Skip afterwards" extra step. */}
            <div className="mt-3">
              <button
                type="button"
                disabled={generatingDesign || generatingPreview}
                onClick={() => designUploadInputRef.current?.click()}
                className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] underline decoration-dotted underline-offset-2 transition-colors disabled:opacity-40"
              >
                Or upload your own image (from Midjourney, DALL·E, etc.) →
              </button>
            </div>

            {/* Hidden file input wired to the "upload your own" link above. */}
            <input
              ref={designUploadInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                handleImageUpload(e);
                if (e.target.files?.[0]) setActiveTab("convert");
              }}
              className="hidden"
            />

            {/* Error surface — preserves upstream reason (IP hit, rate
                limit, bad prompt) so user knows whether to rephrase or
                retry later. */}
            {designError && (
              <div className="mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-[11.5px] text-red-300">
                <span className="font-semibold">Generation failed:</span> {designError}
              </div>
            )}
          </div>

          {/* Rendered Design Preview ────────────────────────────
              Shows the output directly — either the free Pollinations
              preview or the paid GPT-Image-2 HQ render. The header,
              re-render button, and actions adapt based on which engine
              produced the current image. */}
          {generatedDesignUrl && (
            <div className={`bg-[var(--bg-elevated)] border rounded-xl p-5 ${
              generatedDesignEngine === "flux-free"
                ? "border-sky-500/25"
                : "border-emerald-500/20"
            }`}>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className={`font-semibold text-[13px] flex items-center gap-2 ${
                  generatedDesignEngine === "flux-free" ? "text-sky-400" : "text-emerald-400"
                }`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {generatedDesignEngine === "flux-free" ? "Preview Ready" : "HQ Design Ready"}
                  {/* Engine badge — makes it unmistakable which model
                      produced the image, so the seller knows whether
                      they're looking at a free preview or the paid
                      render they already paid for. */}
                  <span className={`ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                    generatedDesignEngine === "flux-free"
                      ? "bg-sky-500/10 text-sky-300 border-sky-500/30"
                      : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                  }`}>
                    {generatedDesignEngine === "flux-free" ? "FREE · Flux" : "HQ · GPT-Image-2"}
                  </span>
                </h3>
                <div className="flex items-center gap-2">
                  {/* Re-render with the SAME engine (free stays free, HQ
                      stays HQ). For preview re-rolls this is effectively
                      a "try a different seed" button. */}
                  <button
                    onClick={generatedDesignEngine === "flux-free" ? generateDesignPreview : generateDesignImage}
                    disabled={generatingDesign || generatingPreview}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-muted)] bg-[var(--bg-inset)] border border-[var(--border-default)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all disabled:opacity-40 flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {generatedDesignEngine === "flux-free" ? "Re-roll (free)" : "Regenerate"}
                  </button>
                </div>
              </div>

              {/* Image preview — center-aligned, contained so tall
                  renders don't blow out the card height. */}
              <div className="bg-black/30 rounded-lg p-3 mb-4 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={generatedDesignUrl}
                  alt={generatedDesignEngine === "flux-free" ? "Free Flux preview" : "HQ GPT-Image-2 render"}
                  className="max-h-[420px] w-auto rounded-md"
                />
              </div>

              {/* Convert source indicator — present only on the paid HQ
                  path.  The route always returns a clean-artwork sibling
                  on HQ, so the emerald state is the normal one.  The
                  amber fallback only triggers if the design predates
                  always-on dual (older session state) or one of the
                  parallel generations was lost — informational so the
                  seller knows Convert is using a degraded source.
                  Free Flux path stays single-image and shows no badge. */}
              {generatedDesignEngine === "gpt-image-2" && (
                <div
                  className={`mb-3 flex items-center gap-2 px-3 py-2 rounded-md text-[11px] ${
                    cleanConvertDataUrl
                      ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-200"
                      : "bg-amber-500/10 border border-amber-500/30 text-amber-200"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Convert source: {cleanConvertDataUrl ? "clean artwork (separate flat-vector render)" : "stitch preview — clean source unavailable, falling back"}
                </div>
              )}

              {/* Action area — two buttons side-by-side for the preview
                  case (send-as-is OR upgrade to HQ), one full-width send
                  button for the HQ case. The preview → upgrade path is
                  the whole point of the cost-saving workflow: eyeball
                  free, pay only when you're committed to the idea. */}
              {generatedDesignEngine === "flux-free" ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={useDesignForConversion}
                    className="px-4 py-3 rounded-xl text-[12px] font-semibold bg-emerald-600/90 text-white hover:bg-emerald-500 transition-all flex items-center justify-center gap-2"
                    title="Use this free preview as your source — zero OpenAI cost. Convert pixelates it into a cross-stitch chart."
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    Use this (free) → Convert
                  </button>
                  <button
                    onClick={generateDesignImage}
                    disabled={generatingDesign || generatingPreview}
                    className="px-4 py-3 rounded-xl text-[12px] font-semibold text-purple-200 bg-purple-600/20 border border-purple-500/40 hover:bg-purple-600/30 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                    title="Render a higher-quality version via GPT-Image-2 — ~$0.04"
                  >
                    {generatingDesign ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                          <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                        Rendering HQ…
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Upgrade to HQ (~$0.04)
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <button
                  onClick={useDesignForConversion}
                  className="w-full px-5 py-3 rounded-xl text-[13px] font-semibold bg-emerald-600/90 text-white hover:bg-emerald-500 transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  Send to Convert Tab
                </button>
              )}
            </div>
          )}

          {/* Design ideas */}
          <div>
            <h3 className="text-[var(--text-primary)] font-semibold text-[13px] mb-3">Popular Design Ideas</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { title: "Silly Goose", desc: "Funny goose with accessories", prompt: "A cute cartoon silly goose wearing a tiny chef hat and bow tie, kawaii illustration, flat color fills" },
                { title: "Coffee Sampler", desc: "Coffee cups and quotes", prompt: "A sampler-style arrangement of three coffee cups with steam swirls, coffee beans, and a small banner reading BUT FIRST COFFEE" },
                { title: "Mushroom Cottage", desc: "Whimsical mushroom house", prompt: "A whimsical mushroom cottage with a round red cap roof, tiny arched door, round windows, small flowers around the base" },
                { title: "Cat Portrait", desc: "Cute cat face", prompt: "A cute orange tabby cat face portrait with big round eyes, slightly tilted head, simple flat kawaii style" },
                { title: "Floral Wreath", desc: "Flower wreath with text", prompt: "A circular wreath of pink roses, green leaves and small wildflowers surrounding the text HOME SWEET HOME in a serif font" },
                { title: "Skeleton Humor", desc: "Funny skeleton design", prompt: "A cute cartoon skeleton sitting in an armchair drinking coffee from a mug, text DEAD INSIDE on a small banner below" },
              ].map((idea) => (
                <button
                  key={idea.title}
                  onClick={() => { setDesignPrompt(idea.prompt); setGeneratedDesignUrl(null); setCleanConvertDataUrl(null); setGeneratedDesignEngine(null); setDesignError(null); }}
                  className="text-left bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-3 hover:border-purple-500/30 transition-all"
                >
                  <p className="text-[12px] font-semibold text-[var(--text-primary)]">{idea.title}</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{idea.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ────────── CONVERT TAB ────────── */}
      {activeTab === "convert" && (
        <div className="page-enter">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Upload + Settings */}
            <div className="space-y-5">
              {/* ── Generate Image ──
                  One-click "type a prompt → get a clean Convert-ready
                  source image".  Replaces the old Research → Design →
                  Convert flow (the Design tab is now hidden because its
                  preview prompts asked for gradients / watercolor that
                  hurt downstream pattern quality).  See
                  generateAndCleanForConvert() for the two-step internals
                  (gpt-image-2 nala-beginner gen + flatten-for-convert).

                  The text input is bound to designPrompt — the same
                  state Research tab "Use this idea" buttons populate,
                  so a research → convert hand-off pre-fills the prompt
                  and the user just clicks Generate & Clean. */}
              <div className="bg-[var(--bg-elevated)] border border-purple-500/20 rounded-xl p-5">
                <h3 className="text-[var(--text-primary)] font-semibold text-[14px] mb-1 flex items-center gap-2">
                  <span>✨ Generate Image</span>
                  <span className="text-[10px] font-normal text-[var(--text-muted)]">AI render → AI clean → ready to convert</span>
                </h3>
                <p className="text-[11px] text-[var(--text-muted)] mb-3">
                  Describe your design.  We&apos;ll render it as a flat
                  cartoon sticker (gpt-image-2) and clean it for
                  quantization in one click.
                </p>

                {/* ── Reference product from Research Hub — RE-ENABLED 2026-05-14 ──
                    Banner shows the Etsy product the user wants to beat.
                    The reference image is sent to /api/cross-stitch/generate-design
                    which runs GPT-4o-mini vision to extract its features,
                    builds a vision-guided prompt, generates with gpt-image-2,
                    then flatten-for-convert normalizes it before Python. */}
                {refImage != null && (
                  <div className="flex items-center gap-3 mb-3 p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl">
                    <img
                      src={refImage ?? ""}
                      alt="reference"
                      className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-amber-500/30"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold text-amber-500/70 uppercase tracking-widest mb-0.5">Inspiration — make something better than this</p>
                      <p className="text-[11px] text-white line-clamp-2 leading-snug">{refTitle || "Etsy bestseller"}</p>
                    </div>
                    <button
                      onClick={() => { setRefImage(null); setRefTitle(null); }}
                      className="flex-shrink-0 text-[var(--text-muted)] hover:text-white transition-colors p-1"
                      title="Dismiss"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}

                <input
                  type="text"
                  value={designPrompt}
                  onChange={(e) => setDesignPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      designPrompt.trim() &&
                      !generatingForConvert
                    ) {
                      e.preventDefault();
                      void generateAndCleanForConvert();
                    }
                  }}
                  placeholder="Describe your design, e.g. cute frog reading a book"
                  className="w-full px-3 py-2 mb-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] text-[13px] focus:outline-none focus:border-purple-500/40"
                />
                {/* Engine toggle */}
                <div className="flex gap-1.5 mb-2.5">
                  {(["fal-fast", "gpt-image-2"] as const).map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setGenerateEngine(e)}
                      disabled={!!generatingForConvert}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all border ${
                        generateEngine === e
                          ? e === "fal-fast"
                            ? "bg-emerald-600/20 border-emerald-500/50 text-emerald-300"
                            : "bg-purple-600/20 border-purple-500/50 text-purple-300"
                          : "bg-white/[0.04] border-white/[0.08] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                      }`}
                    >
                      {e === "fal-fast" ? "⚡ Fast  ~2-4s  ~$0.003" : "✨ HQ GPT-Image-2  ~20s  ~$0.04"}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => generateAndCleanForConvert()}
                  disabled={!designPrompt.trim() || !!generatingForConvert}
                  className={`w-full px-3 py-2.5 rounded-lg text-[13px] font-semibold disabled:cursor-not-allowed text-white flex items-center justify-center gap-2 transition-all ${
                    generateEngine === "fal-fast"
                      ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-emerald-900/40 disabled:to-teal-900/40 shadow-[0_0_20px_-4px_rgba(16,185,129,0.4)]"
                      : "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 disabled:from-purple-900/40 disabled:to-fuchsia-900/40 shadow-[0_0_24px_-4px_rgba(168,85,247,0.5)]"
                  }`}
                >
                  {generatingForConvert ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="40 60" />
                      </svg>
                      <span>Generating…</span>
                    </>
                  ) : generateEngine === "fal-fast" ? (
                    <><span>⚡ Generate Fast</span><span className="text-[10px] opacity-70">FLUX Schnell · ~$0.003</span></>
                  ) : (
                    <><span>✨ Generate &amp; Clean</span><span className="text-[10px] opacity-70">GPT-Image-2 · ~$0.04</span></>
                  )}
                </button>

                {/* ── Preview & pick: 4 cheap FAL variants — DISABLED 2026-05-14 ──
                    User confirmed the standard Generate & Clean (HQ) path
                    with flatten-for-convert restored produces clean charts.
                    Variants feature not needed for now.  To re-enable:
                    change both `{false &&` guards below back to just `{`. */}
                {false && (
                <button
                  type="button"
                  onClick={generatePreviewVariants}
                  disabled={!designPrompt.trim() || generatingVariants || !!generatingForConvert}
                  className="w-full mt-2 px-3 py-2 rounded-lg text-[12px] font-medium disabled:cursor-not-allowed bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[var(--text-secondary)] hover:text-white flex items-center justify-center gap-2 transition-all"
                  title="Generate 4 cheap FAL variants in parallel so you can pick the best before converting. Total cost ~$0.012."
                >
                  {generatingVariants ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="40 60" />
                      </svg>
                      <span>Generating 4 variants…</span>
                    </>
                  ) : (
                    <><span>🎲 Generate 4 Previews</span><span className="text-[10px] opacity-70">FAL × 4 · ~$0.012</span></>
                  )}
                </button>
                )}

                {/* Variant gallery — also DISABLED 2026-05-14. */}
                {false && previewVariants.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[10px] text-[var(--text-muted)]">
                      Click the variant you like best to use it as the convert source.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {previewVariants.map((v, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => pickPreviewVariant(v)}
                          className="relative rounded-lg overflow-hidden border border-white/[0.08] hover:border-emerald-400/60 transition-all group"
                          title={`Use variant ${i + 1}`}
                        >
                          <img
                            src={v.dataUrl}
                            alt={`Variant ${i + 1}`}
                            className="w-full aspect-square object-cover bg-white"
                          />
                          <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-[9px] rounded">
                            #{i + 1}
                          </div>
                          <div className="absolute inset-0 bg-emerald-500/0 group-hover:bg-emerald-500/15 transition-colors flex items-center justify-center">
                            <span className="opacity-0 group-hover:opacity-100 px-2 py-1 bg-emerald-500 text-black text-[10px] font-bold rounded transition-opacity">
                              Use this →
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreviewVariants([])}
                      className="text-[10px] text-[var(--text-muted)] hover:text-white transition-colors"
                    >
                      Clear gallery
                    </button>
                  </div>
                )}
              </div>

              {/* ── AI Best Picker — hidden ── */}
              {false && (
              <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[var(--text-primary)] font-semibold text-[14px]">AI Best Picker</h3>
                  {pickerImages.length > 0 && (
                    <button
                      onClick={() => { setPickerImages([]); setPickerScores(null); setPickerBestIdx(null); setPickerBestReason(null); }}
                      className="text-[10px] text-[var(--text-muted)] hover:text-red-400 transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-[var(--text-muted)] mb-3">Upload your image variations (4-8 images) and AI will pick the best one for cross-stitch.</p>

                {/* Upload area or image grid */}
                {pickerImages.length === 0 ? (
                  <div
                    onClick={() => pickerInputRef.current?.click()}
                    className="border-2 border-dashed border-[var(--border-default)] rounded-xl p-6 text-center cursor-pointer hover:border-purple-500/30 transition-all"
                  >
                    <svg className="w-10 h-10 mx-auto mb-2 text-[var(--text-muted)]/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-[12px] text-[var(--text-muted)]">Drop or click to upload 4-8 image variations</p>
                    <p className="text-[9px] text-[var(--text-muted)] mt-1">Select multiple images at once</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Image grid with scores */}
                    <div className="grid grid-cols-4 gap-2">
                      {pickerImages.map((img, i) => {
                        const score = pickerScores?.find((s) => s.index === i);
                        const isBest = pickerBestIdx === i;
                        return (
                          <div
                            key={i}
                            onClick={() => selectPickerImage(i)}
                            className={`relative rounded-lg overflow-hidden cursor-pointer transition-all group ${
                              isBest
                                ? "ring-2 ring-emerald-400 shadow-lg shadow-emerald-500/20"
                                : sourceImage === img.previewUrl
                                ? "ring-2 ring-purple-500"
                                : "ring-1 ring-[var(--border-default)] hover:ring-purple-500/50"
                            }`}
                          >
                            <img src={img.previewUrl} alt={`Variation ${i + 1}`} className="w-full aspect-square object-cover" />

                            {/* Score overlay */}
                            {score && (
                              <div className={`absolute bottom-0 left-0 right-0 px-2 py-1.5 ${
                                isBest ? "bg-emerald-900/90" : "bg-black/70"
                              }`}>
                                <div className="flex items-center justify-between">
                                  <span className={`text-[11px] font-bold ${isBest ? "text-emerald-300" : "text-white"}`}>
                                    {score.overall.toFixed(1)}
                                  </span>
                                  {isBest && (
                                    <span className="text-[8px] font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded">BEST</span>
                                  )}
                                </div>
                                {/* Mini score bars */}
                                <div className="flex gap-0.5 mt-1">
                                  {[
                                    { v: score.market_appeal, c: "bg-emerald-400" },
                                    { v: score.composition, c: "bg-blue-400" },
                                    { v: score.detail, c: "bg-purple-400" },
                                    { v: score.color_harmony, c: "bg-amber-400" },
                                  ].map((bar, j) => (
                                    <div key={j} className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                                      <div className={`h-full ${bar.c} rounded-full`} style={{ width: `${bar.v * 10}%` }} />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Image number */}
                            <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/60 text-white text-[9px] font-bold flex items-center justify-center">
                              {i + 1}
                            </div>

                            {/* Remove button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPickerImages((prev) => prev.filter((_, idx) => idx !== i));
                                setPickerScores(null);
                                setPickerBestIdx(null);
                              }}
                              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                            >
                              x
                            </button>
                          </div>
                        );
                      })}

                      {/* Add more button */}
                      {pickerImages.length < 8 && (
                        <div
                          onClick={() => pickerInputRef.current?.click()}
                          className="aspect-square rounded-lg border-2 border-dashed border-[var(--border-default)] flex items-center justify-center cursor-pointer hover:border-purple-500/30 transition-all"
                        >
                          <svg className="w-6 h-6 text-[var(--text-muted)]/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Best reason */}
                    {pickerBestReason && (
                      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <svg className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <div>
                          <span className="text-[11px] text-emerald-400 font-semibold">Best: Image #{(pickerBestIdx ?? 0) + 1}</span>
                          <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">{pickerBestReason}</p>
                        </div>
                      </div>
                    )}

                    {/* Score breakdown */}
	                    {(pickerScores?.length ?? 0) > 0 && (
	                      <details className="text-[10px]">
                        <summary className="text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-primary)] transition-colors">
                          Score breakdown
                        </summary>
                        <div className="mt-2 space-y-1.5">
	                          {[...(pickerScores ?? [])].sort((a, b) => b.overall - a.overall).map((s) => (
                            <div key={s.index} className={`flex items-center gap-2 px-2 py-1 rounded ${pickerBestIdx === s.index ? "bg-emerald-500/10" : ""}`}>
                              <span className="font-bold text-[var(--text-primary)] w-4">#{s.index + 1}</span>
                              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${pickerBestIdx === s.index ? "bg-emerald-500" : "bg-purple-500/60"}`}
                                  style={{ width: `${s.overall * 10}%` }}
                                />
                              </div>
                              <span className="font-bold text-[var(--text-primary)] w-6 text-right">{s.overall.toFixed(1)}</span>
                              <span className="text-[var(--text-muted)] w-40 text-right">
                                Mkt {s.market_appeal} Comp {s.composition} Det {s.detail} Col {s.color_harmony}
                              </span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    {/* Score button */}
                    <button
                      onClick={scorePickerImages}
                      disabled={pickerImages.length < 2 || pickerScoring}
                      className="btn-amber w-full text-[12px] py-2.5"
                    >
                      {pickerScoring ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Scoring {pickerImages.length} images…
                        </>
                      ) : pickerScores ? (
                        "Re-score Images"
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                          AI Pick the Best ({pickerImages.length} images)
                        </>
                      )}
                    </button>
                  </div>
                )}
                <input ref={pickerInputRef} type="file" accept="image/*" multiple onChange={handlePickerUpload} className="hidden" />
              </div>
              )}

              {/* ── Single Image Upload ── */}
              <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-5">
                <h3 className="text-[var(--text-primary)] font-semibold text-[14px] mb-4">
                  {pickerImages.length > 0 ? "Selected Image" : "Upload Image"}
                </h3>

                {sourceImage ? (
                  <div className="mb-4 space-y-2">
                    <div className="relative rounded-lg overflow-hidden">
                      <img src={sourceImage} alt="Source" className="w-full max-h-80 object-contain bg-[var(--bg-surface)]" />
                      <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 text-white text-[9px] uppercase tracking-wider rounded">
                        Original
                      </div>
                      <button
                        onClick={() => { setSourceImage(null); setPattern(null); setCleanedImage(null); setCleanedModel(null); setHasFlattenedUpload(false); }}
                        className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-black/80"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    {/* Opt-in AI flatten — visible only when the currently
                        loaded source is a direct upload (not a Design-tab
                        artifact) and only until the user has run it once
                        on this source.  Replaces sourceImage in-place with
                        a CLEAN_CONVERT_EDIT_PROMPT-flattened version so
                        KMeans sees clean flat regions instead of gradients
                        / anti-aliased text edges.

                        Predicate compares sourceImage against the Design-tab
                        artifacts (mirrors the inverse of the convertViaPython
                        sourceMode predicate at line ~1488).  Earlier shape
                        used `sourceFile && !generatedDesignUrl`, but
                        generatedDesignUrl can persist in state from any
                        prior Design-tab generation in this or a previous
                        session (loadConvertState hydration at line ~838),
                        which would hide the button whenever the user had
                        EVER generated a design — even on a brand-new
                        upload.  The sourceImage-comparison form is
                        independent of stale state. */}
                    {sourceImage &&
                      sourceImage !== generatedDesignUrl &&
                      sourceImage !== cleanConvertDataUrl &&
                      !hasFlattenedUpload && (
                      <button
                        type="button"
                        onClick={flattenUploadForConvert}
                        disabled={isFlattening || !sourceImage}
                        className="w-full px-3 py-2 rounded-lg text-[12px] font-medium bg-amber-500/15 text-amber-200 border border-amber-500/40 hover:bg-amber-500/25 disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2 transition-colors"
                        title="One-shot AI flatten via gpt-image-2.  Strips gradients, anti-aliasing, and texture so the Python engine produces a cleaner chart.  ~$0.04 per click."
                      >
                        {isFlattening ? (
                          <>
                            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="40 60" />
                            </svg>
                            Cleaning…
                          </>
                        ) : (
                          <>🪄 AI Clean  ~$0.04</>
                        )}
                      </button>
                    )}
                    {false && cleanedImage && (
                      <div className="relative rounded-lg overflow-hidden">
	                        <img src={cleanedImage ?? ""} alt="AI-cleaned source" className="w-full max-h-80 object-contain bg-[var(--bg-surface)]" />
                        <div className="absolute top-2 left-2 px-2 py-1 bg-emerald-600/80 text-white text-[9px] uppercase tracking-wider rounded">
                          AI Cleaned {cleanedModel ? `· ${cleanedModel}` : ""} (fed to quantizer)
                        </div>
                        {/* Escape hatch: Gemini/Fal sometimes drop small
                            decorative details (scattered blossoms, texture
                            speckles). One-click re-convert using the raw
                            original image instead of the cleaned one. */}
                        <button
                          onClick={() => convertToPattern({ forceOriginal: true })}
                          disabled={converting}
                          className="absolute top-2 right-2 px-2 py-1 bg-amber-600/90 hover:bg-amber-600 text-white text-[10px] rounded disabled:opacity-60 disabled:cursor-wait"
                          title="Detail lost in cleanup? Re-convert the chart using the ORIGINAL image (skips the AI cleanup step for this run only)."
                        >
                          {converting ? "Converting…" : "↺ Re-convert from original"}
                        </button>
                        {(() => {
                          // Detect provider/model mismatch and warn the user
                          // their cached cleaned image is from a DIFFERENT
                          // provider than the one currently selected. Also
                          // surface stale Replicate caches (since that
                          // provider was removed) and urge clearing them.
                          const cachedProvider =
                            cleanedModel?.startsWith("gemini") ? "gemini"
                            : cleanedModel?.startsWith("fal") ? "fal"
                            : cleanedModel?.startsWith("sdxl") || cleanedModel?.startsWith("replicate") || cleanedModel?.startsWith("recraft") ? "removed"
                            : cleanedModel?.startsWith("gpt") ? "openai"
                            : null;
                          if (cachedProvider && cachedProvider !== aiCleanProvider) {
                            return (
                              <div className="absolute inset-x-0 bottom-0 px-3 py-2 bg-amber-600/95 text-white text-[10px] flex items-center justify-between gap-2">
                                <span>
                                  ⚠ Cached from <strong>{cachedProvider}</strong>. Click ✕ to clear, then Convert again to use <strong>{aiCleanProvider}</strong>.
                                </span>
                                <button
                                  onClick={() => { setCleanedImage(null); setCleanedModel(null); }}
                                  className="px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-[10px] font-medium"
                                >
                                  Clear cache
                                </button>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-[var(--border-default)] rounded-xl p-8 text-center cursor-pointer hover:border-purple-500/30 transition-all"
                  >
                    <svg className="w-12 h-12 mx-auto mb-3 text-[var(--text-muted)]/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-[13px] text-[var(--text-muted)]">Click to upload your design image</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">PNG, JPG. any AI-generated or hand-drawn image</p>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />

	                {/* Settings — hidden; only Convert Python button is shown */}
	                {false && <div className="space-y-4 mt-4">
	                  {/* Size presets — quick choice between Standard (142) and
	                      Detailed (200).  Selecting a preset only changes
	                      gridSize; maxColors is untouched.  Width values are
	                      the outcome of a 2026-05-05 width sweep on the live
	                      stitch_art pipeline: 142 is clean but loses banner
	                      text and shifts the rose pink to salmon; 180 is a
	                      bad middle (pink restored, but 353 Peach + 3854
	                      Autumn Gold return as body confetti); 200 is the
	                      inflection point where text becomes readable, the
	                      correct rose pink (3326) is preserved, and 353 drops
	                      to zero; 220 is marginally clearer but ~26.7k
	                      stitches with the same cheek-hue trade-off.  We
	                      deliberately avoid offering 180 as a preset. */}
	                  <div>
	                    <label className="text-[11px] text-[var(--text-muted)] font-medium">Size Preset</label>
	                    <div className="grid grid-cols-3 gap-2 mt-1">
	                      <button
	                        type="button"
	                        onClick={() => { setGridSize(BEGINNER_PATTERN_WIDTH); setMaxColors(BEGINNER_MAX_COLORS); }}
	                        className={`text-left rounded-xl border p-3 transition-all ${
	                          gridSize === BEGINNER_PATTERN_WIDTH && maxColors === BEGINNER_MAX_COLORS
	                            ? "border-orange-500 bg-orange-500/10"
	                            : "border-[var(--border-default)] hover:border-orange-500/40"
	                        }`}
	                      >
	                        <div className="text-[12px] font-medium text-[var(--text-primary)]">Beginner / Etsy</div>
	                        <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{BEGINNER_PATTERN_WIDTH} stitches · {BEGINNER_MAX_COLORS} DMC</div>
	                        <div className="text-[10px] text-[var(--text-muted)] mt-1">Nala-style: small project, quick to stitch, low thread count.</div>
	                      </button>
	                      <button
	                        type="button"
	                        onClick={() => setGridSize(142)}
	                        className={`text-left rounded-xl border p-3 transition-all ${
	                          gridSize === 142
	                            ? "border-orange-500 bg-orange-500/10"
	                            : "border-[var(--border-default)] hover:border-orange-500/40"
	                        }`}
	                      >
	                        <div className="text-[12px] font-medium text-[var(--text-primary)]">Standard</div>
	                        <div className="text-[10px] text-[var(--text-muted)] mt-0.5">142 stitches wide</div>
	                        <div className="text-[10px] text-[var(--text-muted)] mt-1">Mid-detail; default for most patterns.</div>
	                      </button>
	                      <button
	                        type="button"
	                        onClick={() => setGridSize(200)}
	                        className={`text-left rounded-xl border p-3 transition-all ${
	                          gridSize === 200
	                            ? "border-orange-500 bg-orange-500/10"
	                            : "border-[var(--border-default)] hover:border-orange-500/40"
	                        }`}
	                      >
	                        <div className="text-[12px] font-medium text-[var(--text-primary)]">Detailed / Text</div>
	                        <div className="text-[10px] text-[var(--text-muted)] mt-0.5">200 stitches wide</div>
	                        <div className="text-[10px] text-[var(--text-muted)] mt-1">Readable text and fine detail, more stitches/time.</div>
	                      </button>
	                    </div>
	                    {gridSize !== BEGINNER_PATTERN_WIDTH && gridSize !== 142 && gridSize !== 200 && (
	                      <p className="text-[9px] text-[var(--text-muted)] mt-1">Custom width: {gridSize}</p>
	                    )}
	                  </div>

	                  <div>
	                    <label className="text-[11px] text-[var(--text-muted)] font-medium">Pattern Width (stitches)</label>
	                    <div className="flex items-center gap-3 mt-1">
	                      <input
	                        type="range"
	                        min={PATTERN_WIDTH_MIN}
	                        max={PATTERN_WIDTH_MAX}
	                        value={gridSize}
	                        onChange={(e) => setGridSize(Number(e.target.value))}
	                        className="flex-1 accent-orange-500"
	                      />
	                      <span className="text-[13px] text-[var(--text-primary)] font-mono w-10 text-right">{gridSize}</span>
	                    </div>
	                    <p className="text-[9px] text-[var(--text-muted)] mt-1">
	                      {gridSize < DEFAULT_PATTERN_WIDTH ? "Compact / quick project" : gridSize === DEFAULT_PATTERN_WIDTH ? "Default Etsy / detailed chart" : "Higher detail / larger chart"}
	                    </p>
	                    {gridSize >= 158 && gridSize <= 162 && (
	                      <p className="text-[10px] text-amber-600 mt-1">
	                        Width 160 can cause uneven color matching on some images. Try 142 or 200 instead.
	                      </p>
	                    )}
	                  </div>

	                  <div>
	                    <label className="text-[11px] text-[var(--text-muted)] font-medium">Max Colors (DMC threads)</label>
                    <div className="flex items-center gap-3 mt-1">
	                      <input
	                        type="range"
	                        min={MAX_COLORS_MIN}
	                        max={MAX_COLORS_MAX}
	                        value={maxColors}
	                        onChange={(e) => setMaxColors(Number(e.target.value))}
	                        className="flex-1 accent-orange-500"
	                      />
	                      <span className="text-[13px] text-[var(--text-primary)] font-mono w-10 text-right">{maxColors}</span>
	                    </div>
	                    <p className="text-[9px] text-[var(--text-muted)] mt-1">
	                      {maxColors < DEFAULT_MAX_COLORS ? "Simple / beginner friendly" : maxColors === DEFAULT_MAX_COLORS ? "Default Etsy / clean palette" : "Richer palette / more detail"}
	                    </p>
	                  </div>

                  {/* ── Advanced settings (collapsed by default) ──
                      The streamlined UI hides AI Clean-up, Floyd-Steinberg
                      dithering, outline enforcement, and debug stages
                      behind this disclosure. The defaults (AI Clean off,
                      dither off, outlineMode="auto", debug off) are the
                      ones the Python engine + AI buttons flow expect, so
                      most users never need to open this.
                      Left in place (not deleted) so the JS free convert
                      and Premium Convert still have their knobs available
                      for fallback / comparison workflows. */}
	                  {true && (
	                  <details className="group border border-[var(--border-default)] rounded-lg bg-[var(--bg-surface)]/40">
                    <summary className="cursor-pointer select-none px-3 py-2 text-[11px] text-[var(--text-muted)] font-medium flex items-center gap-1.5 hover:text-[var(--text-primary)]">
                      <span className="transition-transform group-open:rotate-90">▸</span>
                      ⚙️ Advanced settings
                      <span className="ml-1 text-[9px] opacity-60">(AI clean, dither, outline, debug)</span>
                    </summary>
                    <div className="px-3 pb-3 pt-1 space-y-4">
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={useAiClean}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setUseAiClean(v);
                          setCleanedImage(null); setCleanedModel(null);
                          // Auto-disable dither when AI Clean is on. the
                          // cleaned output is already flat, dithering just
                          // creates speckle.
                          if (v) setUseDither(false);
                        }}
                        className="accent-purple-500"
                      />
                      <span className="text-[11px] text-[var(--text-muted)] font-medium">AI Clean-up <span className="text-[var(--text-muted)] opacity-60">(optional · costs $)</span></span>
                    </label>
                    <p className="text-[9px] text-[var(--text-muted)] mt-1 ml-6">
                      Only needed for messy/photographic inputs. Clean MJ illustrations convert fine without it — the Python engine handles gradients on its own.
                    </p>
                    {useAiClean && (
                      <div className="mt-2 ml-6 flex flex-col gap-1.5">
                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="radio"
                            name="aiCleanProvider"
                            value="openai"
                            checked={aiCleanProvider === "openai"}
                            onChange={() => { setAiCleanProvider("openai"); setCleanedImage(null); setCleanedModel(null); }}
                            className="accent-purple-500"
                          />
                          <span className="text-[10px] text-[var(--text-muted)]">
                            <strong className="text-[var(--text-primary)]">OpenAI gpt-image-1</strong> · ~$0.04 · crispest flat-vector redraw
                          </span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="radio"
                            name="aiCleanProvider"
                            value="gemini"
                            checked={aiCleanProvider === "gemini"}
                            onChange={() => { setAiCleanProvider("gemini"); setCleanedImage(null); setCleanedModel(null); }}
                            className="accent-purple-500"
                          />
                          <span className="text-[10px] text-[var(--text-muted)]">
                            <strong className="text-[var(--text-primary)]">Gemini Nano Banana</strong> · ~$0.003 · cheapest · preserves source most faithfully
                          </span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="radio"
                            name="aiCleanProvider"
                            value="fal"
                            checked={aiCleanProvider === "fal"}
                            onChange={() => { setAiCleanProvider("fal"); setCleanedImage(null); setCleanedModel(null); }}
                            className="accent-purple-500"
                          />
                          <span className="text-[10px] text-[var(--text-muted)]">
                            <strong className="text-[var(--text-primary)]">Fal.ai Flux img2img</strong> · ~$0.025 · balanced general editor
                          </span>
                        </label>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className={`flex items-center gap-2 select-none ${useAiClean ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                      <input
                        type="checkbox"
                        checked={useDither && !useAiClean}
                        disabled={useAiClean}
                        onChange={(e) => setUseDither(e.target.checked)}
                        className="accent-purple-500"
                      />
                      <span className="text-[11px] text-[var(--text-muted)] font-medium">Floyd-Steinberg dithering</span>
                    </label>
                    <p className="text-[9px] text-[var(--text-muted)] mt-1 ml-6">
                      {useAiClean
                        ? "Auto-off. AI Clean output is already flat. Dithering would add unwanted speckle."
                        : "Off: flat-color look (top-seller style). On: photo-realistic, uses more thread variety."}
                    </p>
                  </div>

                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] font-medium block mb-1">Outline enforcement</label>
                    <div className="flex flex-col gap-1">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="radio"
                          name="outlineMode"
                          value="auto"
                          checked={outlineMode === "auto"}
                          onChange={() => { setOutlineMode("auto"); setEnforceOutlines(false); }}
                          className="accent-purple-500"
                        />
                        <span className="text-[11px] text-[var(--text-muted)]">
                          <strong className="text-[var(--text-primary)]">Auto</strong> · detector decides (skips enforcement on ornate patterns)
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="radio"
                          name="outlineMode"
                          value="force-on"
                          checked={outlineMode === "force-on"}
                          onChange={() => { setOutlineMode("force-on"); setEnforceOutlines(true); }}
                          className="accent-purple-500"
                        />
                        <span className="text-[11px] text-[var(--text-muted)]">
                          <strong className="text-[var(--text-primary)]">Force ON</strong> · cartoons/kawaii with real black linework
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="radio"
                          name="outlineMode"
                          value="force-off"
                          checked={outlineMode === "force-off"}
                          onChange={() => { setOutlineMode("force-off"); setEnforceOutlines(false); }}
                          className="accent-purple-500"
                        />
                        <span className="text-[11px] text-[var(--text-muted)]">
                          <strong className="text-[var(--text-primary)]">Force OFF</strong> · ornate patterns (kimono, folk art, mandalas)
                        </span>
                      </label>
                    </div>
                    <p className="text-[9px] text-[var(--text-muted)] mt-1 leading-relaxed">
                      Outline enforcement injects DMC 310 black on dark-edge cells. Great for crisp characters, disastrous for ornate sources where every pattern edge gets welded into a black cage. Pick Force OFF if you see colorwork dissolving into black in the Debug Stages panel (B→C).
                    </p>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={debugMode}
                        onChange={(e) => setDebugMode(e.target.checked)}
                        className="accent-amber-500"
                      />
                      <span className="text-[11px] text-amber-400 font-medium">🔬 Debug stages (show pipeline intermediates)</span>
                    </label>
                    <p className="text-[9px] text-[var(--text-muted)] mt-1 ml-6">
                      When on, Convert captures snapshots at each pipeline stage (raw vote → aida snap → outlines → small-region cull → final). A panel below the chart shows each intermediate. Use this to diagnose WHICH stage loses detail so we can target the fix.
                    </p>
                  </div>
	                    </div>
	                  </details>
	                  )}

                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] font-medium">Pattern Name</label>
                    <input
                      type="text"
                      value={patternName}
                      onChange={(e) => setPatternName(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] text-[12px] focus:outline-none focus:border-purple-500/40"
                    />
                  </div>
                </div>}

                {/* Quality tip shown only when the user uploaded an image
                    directly (no Design-tab handoff).  Without a clean source
                    from the Design tab, gpt-image-2's edit-step doesn't
                    pre-flatten the image, so Python's KMeans sees the raw
                    gradients/noise/detail and produces a noisier chart.
                    Predicate: source loaded AND no cleanConvertDataUrl AND
                    source isn't a Design-tab generation either (a Flux
                    preview without a clean sibling already counts as a
                    Design-tab path, so we don't nag those users). */}
                {sourceImage &&
                  !hasFlattenedUpload &&
                  !cleanConvertDataUrl &&
                  sourceImage !== generatedDesignUrl && (
                  <div className="mt-3 px-3 py-2 rounded-lg text-[11px] bg-amber-500/10 text-amber-300 border border-amber-500/30">
                    <span className="font-semibold">Tip:</span> For better results, click <strong>🪄 AI Clean</strong> above to flatten gradients and remove the background before converting.
                  </div>
                )}

                {/* Python engine β — KMeans quantizer in LAB via FastAPI.
                    This is now the PRIMARY convert action. It produces the
                    pattern grid that the AI buttons below consume to render
                    the listing preview. Bypasses the JS median-cut + cell-
                    vote pipeline (kept in Alternate methods below).*/}
                <button
                  onClick={() => convertViaPython()}
                  disabled={!sourceImage || converting || premiumConverting || pythonConverting}
                  className="mt-2 w-full rounded-lg border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 font-semibold text-sm py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  title="Primary convert: KMeans-in-LAB pattern engine (Python FastAPI on :8000). Run `npm run dev` to start both services."
                >
                  {pythonConverting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Running Python engine…
                    </>
                  ) : (
                    <>
                      <span>🐍 Convert (Python engine β)</span>
                      {pythonEngineMs !== null && (
                        <span className="text-[10px] font-mono opacity-70">
                          last: {pythonEngineMs}ms
                        </span>
                      )}
                    </>
                  )}
                </button>

                {/* ── AI listing-preview buttons (gpt-img-2 primary, gpt-img-1 secondary) ──
                    Click behavior (implemented in runAiPreview):
                      1. If no pattern exists yet, auto-run Python Convert
                         first so the buttons double as a one-click flow
                         from source upload → finished listing render.
                      2. Then call generateListingPreview(model), which
                         caches per-model and sets the active preview.

                    Visual hierarchy:
                      - gpt-img-2: big, gradient-filled, "Recommended" pill —
                        the default click after a/b comparison showed it
                        produces real X-stitch structure with straight
                        grid-aligned single-column stems.
                      - gpt-img-1: small, muted, "softer alternative" —
                        only useful when the user wants a watercolor/painted
                        look instead of literal cross-stitch.

                    The chart preview + stitch detail (right column) don't
                    change — stitch detail stays as the existing client-
                    side center crop. */}
                {/* RE-ENABLED (2026-04-26) — user explicitly asked these
                    buttons back so they can A/B compare the gpt-image-1 vs
                    gpt-image-2 finished-look render BEFORE moving to export.
                    Yes, this can mean two ~$0.04 calls per pattern when the
                    user clicks both, but the per-model cache
                    (renderedPreviewsByModel) makes re-clicks free, and the
                    seller's preview-first workflow is more important than
                    the duplication with the Mockups-step render. */}
	                {false && (
                  <>
                    <p className="mt-4 text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wide">
                      ✨ AI Listing Preview <span className="opacity-60 normal-case tracking-normal">(auto-converts if needed · ~$0.04)</span>
                    </p>
                    <button
                      onClick={() => runAiPreview("gpt-image-2")}
                      disabled={!sourceImage || converting || premiumConverting || pythonConverting || rendering}
                      className="mt-1.5 w-full rounded-lg px-4 py-3 font-semibold text-[13px] bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 disabled:from-purple-900/40 disabled:to-fuchsia-900/40 disabled:cursor-not-allowed text-white shadow-[0_0_24px_-4px_rgba(168,85,247,0.5)] flex items-center justify-center gap-2 transition-all"
                      title="gpt-image-2 — produces real X-stitch structure on aida, grid-aligned stems, authentic cross-stitch texture. Requires one-time OpenAI org verification. ~$0.04/image."
                    >
                      <span>✨ gpt-img-2</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/20 uppercase tracking-wide font-bold">Recommended</span>
                      {renderedPreviewsByModel["gpt-image-2"] ? <span className="text-[11px] opacity-90">✓</span> : null}
                    </button>
                    <button
                      onClick={() => runAiPreview("gpt-image-1")}
                      disabled={!sourceImage || converting || premiumConverting || pythonConverting || rendering}
                      className="mt-2 w-full rounded-md border border-[var(--border-default)] bg-transparent hover:bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium text-[11px] py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                      title="gpt-image-1 — softer watercolor/painted alternative. No visible X-stitches; stems are brush strokes. Use only when you want a painterly aesthetic. No org verification required. ~$0.04/image."
                    >
                      <span>gpt-img-1</span>
                      <span className="text-[9px] opacity-70">softer alternative</span>
                      {renderedPreviewsByModel["gpt-image-1"] ? <span className="text-[10px] opacity-80">✓</span> : null}
                    </button>
                  </>
                )}

                {/* ── Alternate convert methods (collapsed) ──
                    The legacy JS median-cut convert and the Real-ESRGAN
                    premium convert live here. Hidden by default because
                    the Python engine + AI preview covers 95% of cases.
                    Kept in place (not deleted) so premium/ornate fallback
                    workflows still have one-click access. */}
	                {false && (
	                <details className="mt-4 group border border-[var(--border-default)] rounded-lg bg-[var(--bg-surface)]/40">
                  <summary className="cursor-pointer select-none px-3 py-2 text-[11px] text-[var(--text-muted)] font-medium flex items-center gap-1.5 hover:text-[var(--text-primary)]">
                    <span className="transition-transform group-open:rotate-90">▸</span>
                    Alternate convert methods
                    <span className="ml-1 text-[9px] opacity-60">(JS engine, Premium upscale)</span>
                  </summary>
                  <div className="px-3 pb-3 pt-1 space-y-2">
                    {/* Premium Convert — paid pipeline (Real-ESRGAN 2× upscale
                        + chosen cleanup model) tuned for ornate sources that
                        the free pipeline loses detail on. Auto-applies Force
                        OFF outlines and 24+ colors so the quantizer doesn't
                        undo the premium cleanup. Provider is the same radio
                        used by the free AI cleanup (in Advanced settings). */}
                    {(() => {
                      // UI-only mapping from provider radio → display info.
                      // Keep in sync with COST/MODEL_LABEL in
                      // src/app/api/cross-stitch/premium-convert/route.ts.
                      const premiumMeta = {
                        openai: {
                          cost: "~$0.17",
                          label: "upscale + HIGH cleanup",
                          cleanLabel: "gpt-image-1 HIGH cleanup…",
                          tip: "Paid pipeline (~$0.17/run): Real-ESRGAN 2× upscale → gpt-image-1 HIGH cleanup → ornate-safe quantizer defaults. Crispest flat-vector output — best for cartoons/stickers. May over-stylize pastel/watercolor sources (can remap palette).",
                        },
                        gemini: {
                          cost: "~$0.004",
                          label: "upscale + Gemini cleanup",
                          cleanLabel: "Gemini Nano Banana cleanup…",
                          tip: "Paid pipeline (~$0.004/run): Real-ESRGAN 2× upscale → Gemini 2.5 Flash Image (Nano Banana) cleanup → ornate-safe quantizer defaults. Preserves source palette most faithfully — best for delicate pastels, kimonos, watercolor-style illustrations.",
                        },
                        fal: {
                          cost: "~$0.026",
                          label: "upscale + Flux Dev cleanup",
                          cleanLabel: "Flux Dev img2img cleanup…",
                          tip: "Paid pipeline (~$0.026/run): Real-ESRGAN 2× upscale → Flux Dev img2img cleanup → ornate-safe quantizer defaults. Balanced — more faithful than OpenAI HIGH, more flattening than Gemini.",
                        },
                      }[aiCleanProvider];
                      return (
                        <button
                          onClick={runPremiumConvert}
                          disabled={!sourceImage || converting || premiumConverting}
                          className="w-full rounded-lg px-4 py-2.5 font-semibold text-[12px] bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 disabled:from-purple-900/40 disabled:to-fuchsia-900/40 disabled:cursor-not-allowed text-white shadow-[0_0_24px_-4px_rgba(168,85,247,0.5)] flex items-center justify-center gap-2 transition-all"
                          title={premiumMeta.tip}
                        >
                          {premiumConverting ? (
                            <>
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              {premiumPhase === "upscaling"
                                ? "Real-ESRGAN 2× upscaling…"
                                : premiumPhase === "cleaning"
                                ? premiumMeta.cleanLabel
                                : premiumPhase === "scanning"
                                ? "Scanning 4 quadrants for detail preservation…"
                                : premiumPhase === "quantizing"
                                ? "Quantizing premium source…"
                                : "Premium enhancing…"}
                            </>
                          ) : (
                            <>
                              <span>✨ Premium Convert</span>
                              <span className="text-[10px] opacity-80">· {premiumMeta.cost} · {premiumMeta.label}</span>
                            </>
                          )}
                        </button>
                      );
                    })()}
                    {premiumInfo && !premiumConverting && (
                      <div className="text-[10px] text-purple-300/80 flex items-center justify-center gap-2 flex-wrap">
                        <span>Last premium run:</span>
	                        <span className="font-mono">{premiumInfo?.model}</span>
                        <span>·</span>
	                        <span>upscale: <span className="font-mono">{premiumInfo?.upscaledVia}</span></span>
                        <span>·</span>
	                        <span>cost ≈ <span className="font-mono">${(premiumInfo?.estimatedCost ?? 0).toFixed(3)}</span></span>
                      </div>
                    )}

                    <button
                      onClick={() => convertToPattern()}
                      disabled={!sourceImage || converting || premiumConverting || pythonConverting}
                      className="btn-amber w-full"
                    >
                      {converting ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          {cleaning ? "AI cleaning source…" : "Converting…"}
                        </>
                      ) : (
                        "Convert to Cross Stitch Pattern (JS engine, free)"
                      )}
                    </button>
	                  </div>
	                </details>
	                )}
              </div>
            </div>

            {/* Right: Pattern Preview */}
            <div className="space-y-5">
              {pattern && patternPreview ? (
                <>
                  <div className="bg-[var(--bg-elevated)] border border-emerald-500/20 rounded-xl p-4">
                    <h3 className="text-emerald-400 font-semibold text-[13px] mb-3 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Pattern Generated
                      {rendering && <span className="text-[10px] text-[var(--text-muted)] font-normal ml-2">Rendering preview…</span>}
                      {/* Chart / Stitch view toggle */}
                      <span className="ml-3 inline-flex rounded-md overflow-hidden border border-[var(--border-default)] text-[10px]">
                        <button
                          onClick={() => setPreviewMode("chart")}
                          className={`px-2 py-0.5 ${previewMode === "chart" ? "bg-emerald-500/20 text-emerald-300" : "bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                          title="Chart view: flat cells + symbols + rulers (what buyers stitch from)"
                        >Chart</button>
                        <button
                          onClick={() => setPreviewMode("stitch")}
                          className={`px-2 py-0.5 ${previewMode === "stitch" ? "bg-emerald-500/20 text-emerald-300" : "bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                          title="Stitch view: realistic X-stitches on aida cloth"
                        >Stitch</button>
                      </span>
                      {/* Symbols on/off — the "other canvas" for chart view.
                          When OFF, the chart renders as pure flat-color cells
                          so you can evaluate pattern quality without the per-
                          cell glyph speckle that makes the chart look noisy
                          at zoom-out. */}
                      {previewMode === "chart" && (
                        <span className="ml-2 inline-flex rounded-md overflow-hidden border border-[var(--border-default)] text-[10px]">
                          <button
                            onClick={() => setChartSymbols(true)}
                            className={`px-2 py-0.5 ${chartSymbols ? "bg-sky-500/20 text-sky-300" : "bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                            title="Show DMC symbols (X, +, O, #) inside each cell — NalaAndStitch convention for stitchers"
                          >Symbols</button>
                          <button
                            onClick={() => setChartSymbols(false)}
                            className={`px-2 py-0.5 ${!chartSymbols ? "bg-sky-500/20 text-sky-300" : "bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                            title="Hide symbols — pure flat-color chart (lets you see the real pattern without glyph speckle)"
                          >Color only</button>
                        </span>
                      )}
                      <span className="ml-auto text-[10px] text-[var(--text-muted)] font-normal flex items-center gap-2">
                        {savedAt && (
                          <span title={new Date(savedAt).toLocaleString()}>
                            Saved {new Date(savedAt).toLocaleTimeString()}
                          </span>
                        )}
                        {true && (
                        <button
                          onClick={refineChartWithGpt}
                          disabled={refiningChart}
                          className={`px-2 py-0.5 rounded ${refiningChart ? "bg-purple-500/10 text-purple-300/60 cursor-wait" : "bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 underline"}`}
                          title="Experimental: sends the chart + source to GPT-4o Vision and applies structured fix operations (fill pupils, close outline gaps, clean stray specks, recolor wrong regions). ~$0.03 per call."
                        >
                          {refiningChart ? "✨ Refining…" : "✨ Refine with GPT"}
                        </button>
                        )}
                        {false && preRefineGrid && (
                          <button
                            onClick={undoRefine}
                            className="underline hover:text-[var(--text-primary)] bg-[var(--bg-elevated)] px-2 py-0.5 rounded"
                            title="Restore the pre-refine chart"
                          >↶ Undo refine</button>
                        )}
                        <button
                          onClick={async () => {
                            const now = Date.now();
                            const ok = await saveConvertState({
                              sourceImage, cleanedImage, cleanedModel, pattern, renderedPreview,
                              // Include the paid collections so "Save now" snapshots
                              // the full expensive state, not just the Convert bits.
                              gptMockups: gptMockups.map((m) => m.dataUrl).filter(Boolean),
                              gptMockupsSourceKey,
                              renderedPreviewsByModel,
		                              gridSize, maxColors, useDither, useAiClean, enforceOutlines, patternName,
                              savedAt: now,
                            });
                            if (ok) { setSavedAt(now); alert("Saved the current pattern."); }
                            else alert("Save failed — check console.");
                          }}
                          className="underline hover:text-[var(--text-primary)] bg-[var(--bg-elevated)] px-2 py-0.5 rounded"
                          title="Force-save current pattern to browser storage"
                        >💾 Save now</button>
                        <button
                          onClick={() => {
                            const src = renderedPreview || (previewMode === "chart" ? (patternChart || patternPreview) : patternPreview);
                            if (!src) return;
                            const a = document.createElement("a");
                            a.href = src;
                            a.download = `${patternName || "cross-stitch-pattern"}-preview.png`;
                            a.click();
                          }}
                          className="underline hover:text-[var(--text-primary)] bg-[var(--bg-elevated)] px-2 py-0.5 rounded"
                          title="Download this preview image"
                        >⬇ Download</button>
                        {/* Selling-grade chart PDF download (cover + DMC list +
                            chart sections in one document).  Renders only when
                            the convert response carried back patternPdfB64 —
                            pdf_renderer.py fail-softs to None on render error
                            and the UI hides the button gracefully.  Filename
                            uses the Pattern Name field above the Convert button
                            (sanitised — non-filename chars stripped — falls
                            back to "pattern" when empty). */}
                        {pattern?.patternPdfB64 && (
                          <button
                            onClick={() => {
                              const bytes = Uint8Array.from(atob(pattern.patternPdfB64!), c => c.charCodeAt(0));
                              const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              const safeName = (patternName || "pattern")
                                .replace(/[^a-zA-Z0-9-_ ]/g, "")
                                .trim()
                                .replace(/\s+/g, "-")
                                || "pattern";
                              a.download = `${safeName}.pdf`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                            className="underline hover:text-[var(--text-primary)] bg-[var(--bg-elevated)] px-2 py-0.5 rounded"
                            title="Download the selling-grade pattern PDF (cover + DMC thread list + chart sections)"
                          >⬇ Download Pattern PDF</button>
                        )}
                        <button
                          onClick={async () => {
                            if (!confirm("Clear saved pattern + AI mockups? You'll need to re-run Convert and re-render mockups (costs API credits).")) return;
                            setSourceImage(null);
                            setCleanedImage(null);
                            setCleanedModel(null);
                            setPattern(null);
                            setRenderedPreview(null);
                            setRenderedPreviewsByModel({});
                            // Also wipe the expensive 6-mockup batch. Without
                            // this, the cached IDB blobs persist and the next
                            // session would "restore" stale mockups tied to
                            // a pattern that no longer exists.
                            setGptMockups([]);
                            // Drop the fingerprint too — keeping it without
                            // the mockups would leave the hydration gate
                            // comparing a ghost key against the next
                            // pattern's preview, which is confusing at best
                            // and a "duck-in-lavender" regression at worst.
                            setGptMockupsSourceKey(null);
                            autoMockupTriggeredRef.current = false;
                            // Wipe the 4 info cards too — they're cheap to
                            // re-render but they're tied to THIS pattern's
                            // stitch count / DMC legend, so stale cards from
                            // the previous pattern would be worse than no
                            // cards at all.
                            setListingImages([]);
                            autoInfoCardsTriggeredRef.current = false;
                            setSavedAt(null);
                            await clearConvertState();
                          }}
                          className="underline hover:text-[var(--text-primary)]"
                        >Clear</button>
                      </span>
                    </h3>
                    {false && renderedPreview ? (
                      <div className="relative">
                        <img
	                          src={renderedPreview ?? ""}
                          alt="Finished cross-stitch preview"
                          className="w-full rounded-lg border border-[var(--border-default)]"
                        />
                        {/* A/B toggle: shows badges for every model that
                            has a cached preview. Clicking a badge swaps
                            the displayed image to that model's result
                            (free — no API call). The active model is
                            highlighted so you always know what you're
                            looking at. Hidden if there's only one cached
                            model (nothing to compare yet). */}
                        {Object.keys(renderedPreviewsByModel).length > 0 && (
                          <div className="absolute top-2 left-2 flex gap-1.5">
                            {(
                              ["gpt-image-1", "gpt-image-2"] as const
                            ).map((m) => {
                              const cached = renderedPreviewsByModel[m];
                              if (!cached) return null;
                              const active = activePreviewModel === m;
                              return (
                                <button
                                  key={m}
                                  onClick={() => {
                                    setRenderedPreview(cached);
                                    setActivePreviewModel(m);
                                  }}
                                  className={`text-[10px] px-2 py-1 rounded backdrop-blur transition-colors ${
                                    active
                                      ? "bg-purple-600/90 text-white ring-1 ring-purple-300/50"
                                      : "bg-black/60 text-white/70 hover:bg-black/80"
                                  }`}
                                  title={
                                    active
                                      ? `Currently showing: ${m}`
                                      : `Switch to cached ${m} result`
                                  }
                                >
                                  {m}
                                  {active ? " •" : ""}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="relative">
                        <img src={previewMode === "chart" ? (patternChart || patternPreview) : patternPreview} alt="Pattern preview" className="w-full rounded-lg border border-[var(--border-default)]" style={{ imageRendering: "pixelated" }} />
                        {rendering && (
                          <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                            <div className="text-center text-white text-[11px]">
                              <div className="animate-spin w-6 h-6 border-2 border-white/20 border-t-white rounded-full mx-auto mb-2" />
                              Generating listing preview…
                            </div>
                          </div>
                        )}
                        {/* The in-preview A/B buttons were moved to the
                            left panel (primary "AI Listing Preview"
                            section) so the convert + render flow lives
                            in one column. The top-left model-switch
                            badges (rendered above when renderedPreview
                            exists) still handle toggling between cached
                            results. */}
                      </div>
                    )}
                    {refineMeta && (
                      <div className="mt-2 text-[11px] bg-purple-500/5 border border-purple-500/20 rounded-md p-2 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-purple-300">✨ GPT review</span>
                          <span className="text-[var(--text-muted)]">
                            rated this chart {refineMeta.rating}/10
                          </span>
                          {refineMeta.skippedBecauseGood ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">
                              no changes — chart already looks good
                            </span>
                          ) : refineMeta.appliedOps > 0 ? (
                            <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px]">
                              applied {refineMeta.appliedOps} fix{refineMeta.appliedOps === 1 ? "" : "es"}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">
                              no safe fixes applied
                            </span>
                          )}
                        </div>
                        {refineMeta.assessment && (
                          <p className="text-[var(--text-muted)] italic">&ldquo;{refineMeta.assessment}&rdquo;</p>
                        )}
                        {refineIssues && refineIssues.length > 0 && (
                          <div>
                            <p className="text-purple-300/80 mb-0.5">Noted defects:</p>
                            <ul className="list-disc list-inside space-y-0.5 text-[var(--text-muted)]">
                              {refineIssues.map((issue, i) => (
                                <li key={i}>{issue}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {refineMeta.rejectedOps.length > 0 && (
                          <details className="text-[10px] text-[var(--text-muted)]">
                            <summary className="cursor-pointer hover:text-[var(--text-primary)]">
                              {refineMeta.rejectedOps.length} op{refineMeta.rejectedOps.length === 1 ? "" : "s"} rejected by safety rails
                            </summary>
                            <ul className="list-disc list-inside mt-1 space-y-0.5 pl-2">
                              {refineMeta.rejectedOps.map((r, i) => <li key={i}>{r}</li>)}
                            </ul>
                          </details>
                        )}
                      </div>
                    )}
                    {/* ── Pattern metrics (all derived from pattern data) ──
                        Three cards stacked compact:
                          1. Core stats (grid / colors / total stitches) — existing.
                          2. Finished size at four aida counts — the number buyers
                             need to pick fabric + frame before purchase.
                          3. Difficulty rating + stitching-time range — the
                             metadata that top Etsy listings surface to help
                             buyers pre-qualify themselves. */}
                    <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-[18px] font-bold text-[var(--text-primary)]">{pattern.width}x{pattern.height}</p>
                        <p className="text-[9px] text-[var(--text-muted)]">Grid (stitches)</p>
                      </div>
                      <div>
                        <p className="text-[18px] font-bold text-[var(--text-primary)]">{patternStats?.colorCount ?? 0}</p>
                        <p className="text-[9px] text-[var(--text-muted)]">DMC Colors</p>
                      </div>
                      <div>
                        <p className="text-[18px] font-bold text-[var(--text-primary)]">{pattern.totalStitches.toLocaleString()}</p>
                        <p className="text-[9px] text-[var(--text-muted)]">Total Stitches</p>
                      </div>
                    </div>

                    {patternStats && (
                      <>
                        {/* Finished size at each standard aida count. Shown in
                            both inches and cm because the Etsy audience is
                            international — US buyers think in inches, EU buyers
                            in cm. Separate rows for each count so the listing
                            can quote all four without the seller doing math. */}
                        <div className="mt-3 bg-[var(--bg-surface)]/50 border border-[var(--border-default)] rounded-lg p-3">
                          <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                            <span>📏</span>
                            <span>Finished Size</span>
                            <span className="opacity-60 normal-case tracking-normal font-normal">— varies by aida count buyer picks</span>
                          </p>
                          <div className="grid grid-cols-4 gap-2 text-center">
                            {patternStats.sizes.map((s) => (
                              <div
                                key={s.count}
                                className="bg-[var(--bg-elevated)]/50 rounded-md py-1.5 px-1"
                                title={`Aida ${s.count}-count: ${s.count} stitches per inch. ${s.count === 14 ? "Most popular beginner-friendly default." : s.count === 18 ? "Finest common count — smallest finished piece." : s.count === 11 ? "Largest cells — easiest to see, biggest finished piece." : "Standard intermediate count."}`}
                              >
                                <p className="text-[11px] font-bold text-[var(--text-primary)]">{s.count}ct</p>
                                <p className="text-[11px] font-mono text-[var(--text-primary)] leading-tight">
                                  {s.inchesW}&quot;×{s.inchesH}&quot;
                                </p>
                                <p className="text-[9px] font-mono text-[var(--text-muted)] leading-tight">
                                  {s.cmW}×{s.cmH}cm
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Difficulty + stitching-time. The Difficulty colorToken
                            maps to explicit Tailwind classes below rather than
                            interpolated strings because Tailwind's JIT needs
                            the class names to appear literally to generate CSS. */}
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {(() => {
                            const tokenClasses: Record<string, string> = {
                              emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
                              sky: "bg-sky-500/10 border-sky-500/30 text-sky-300",
                              amber: "bg-amber-500/10 border-amber-500/30 text-amber-300",
                              orange: "bg-orange-500/10 border-orange-500/30 text-orange-300",
                              rose: "bg-rose-500/10 border-rose-500/30 text-rose-300",
                            };
                            const diffClass = tokenClasses[patternStats.difficulty.colorToken] ?? tokenClasses.amber;
                            return (
                              <div
                                className={`rounded-lg border p-3 text-center ${diffClass}`}
                                title={patternStats.difficulty.rationale}
                              >
                                <p className="text-[10px] font-semibold opacity-80 uppercase tracking-wide">🎯 Difficulty</p>
                                <p className="text-[14px] font-bold mt-0.5">
                                  {patternStats.difficulty.emoji} {patternStats.difficulty.label}
                                </p>
                              </div>
                            );
                          })()}
                          <div
                            className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)]/50 p-3 text-center"
                            title={`Based on ${pattern.totalStitches.toLocaleString()} stitches at 400 (beginner) to 1000 (experienced) stitches/hour.`}
                          >
                            <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">⏱️ Stitching Time</p>
                            <p className="text-[14px] font-bold text-[var(--text-primary)] mt-0.5">
                              {patternStats.time.label}
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                    {/* Debug stages panel — shows intermediate grid snapshots
                        captured during Convert when debugMode is on. Each
                        snapshot is a tiny flat-color thumbnail so the user
                        can scan across stages and see exactly where detail
                        gets lost in the pipeline. Hint: if a decorative
                        speck is present in stage A but gone in stage B, the
                        aida snap ate it; present in B but gone in C, the
                        outline enforcement ate it; present in C but gone in
                        D, the small-region cull ate it. */}
                    {debugStages && debugStageThumbs.length > 0 && (
                      <div className="mt-3 bg-amber-500/5 border border-amber-500/20 rounded-md p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[12px] font-semibold text-amber-400">🔬 Pipeline stages</p>
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {debugStages.palette.length} DMCs · {debugStages.gw}×{debugStages.gh} grid
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--text-muted)] mb-3 leading-relaxed">
                          Each stage is a thumbnail of the grid at that point in the pipeline.
                          Scan left→right: if a decorative speck disappears between two stages,
                          that&apos;s where the loss happens.
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                          {debugStageThumbs.map((t, i) => (
                            <div key={i} className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded p-1.5">
                              <p className="text-[10px] font-semibold text-amber-300 mb-1">{t.label}</p>
                              {t.url ? (
                                <img
                                  src={t.url}
                                  alt={t.label}
                                  className="w-full rounded border border-[var(--border-default)]"
                                  style={{ imageRendering: "pixelated", aspectRatio: `${debugStages.gw} / ${debugStages.gh}` }}
                                />
                              ) : (
                                <div className="w-full bg-[var(--bg-elevated)] rounded flex items-center justify-center text-[9px] text-[var(--text-muted)]" style={{ aspectRatio: `${debugStages.gw} / ${debugStages.gh}` }}>
                                  render failed
                                </div>
                              )}
                              <p className="text-[9px] text-[var(--text-muted)] mt-1 leading-tight">{t.description}</p>
                            </div>
                          ))}
                        </div>
                        <details className="mt-3">
                          <summary className="text-[10px] text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-primary)]">
                            Palette ({debugStages.palette.length} DMC thread{debugStages.palette.length === 1 ? "" : "s"} sorted by use)
                          </summary>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {debugStages.palette.map((p) => (
                              <div key={p.dmc} className="flex items-center gap-1 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded px-1.5 py-0.5">
                                <div
                                  className="w-3 h-3 rounded-sm border border-black/20"
                                  style={{ backgroundColor: p.hex }}
                                  title={`${p.dmc} · ${p.hex}`}
                                />
                                <span className="text-[9px] text-[var(--text-muted)]">
                                  {p.dmc}{p.dmc === debugStages.aidaDmc ? " (aida)" : ""} · {p.count.toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        </details>
                      </div>
                    )}
                    {debugMode && !debugStages && pattern && (
                      <div className="mt-3 bg-amber-500/5 border border-amber-500/20 rounded-md p-2 text-[10px] text-amber-300/80">
                        🔬 Debug mode is ON — click Convert again to capture pipeline stages.
                      </div>
                    )}
                  </div>

                  {/* Stitch Detail. center crop. Prefers the gpt-image-1
                      rendered preview (consistent premium look). Falls back
                      to the quantizer chart crop if render not ready. */}
                  {(renderedPreview || stitchDetail) && (
                    <div className="bg-[var(--bg-elevated)] border border-amber-500/20 rounded-xl p-4">
                      <h3 className="text-amber-400 font-semibold text-[13px] mb-1 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Stitch Detail <span className="text-[10px] text-[var(--text-muted)] font-normal">(center crop, actual render quality)</span>
                      </h3>
                      {renderedPreview ? (
                        <div className="relative overflow-hidden rounded-lg border border-[var(--border-default)] bg-[#FAF5E8]" style={{ aspectRatio: "1 / 1" }}>
                          {/* Zoom 2x into center of rendered preview */}
                          <img
                            src={renderedPreview}
                            alt="Stitch detail"
                            className="absolute"
                            style={{ width: "200%", height: "200%", top: "-50%", left: "-50%", objectFit: "cover" }}
                          />
                        </div>
                      ) : (
                      <img
                        src={previewMode === "chart" ? (stitchDetailChart || stitchDetail!) : stitchDetail!}
                        alt="Stitch detail"
                        className="w-full rounded-lg border border-[var(--border-default)]"
                        style={{ backgroundColor: previewMode === "chart" ? "#ffffff" : "#FAF5E8", imageRendering: "pixelated" }}
                      />
                      )}
                      <p className="text-[10px] text-[var(--text-muted)] mt-2 leading-relaxed">
                        {renderedPreview
                          ? "Zoomed 2× into the finished cross-stitch preview. shows how thread and aida fabric will look up close."
                          : "This is exactly how individual X-stitches will render in your mockup frame. thread shadow, sheen highlight, and aida-fabric holes."}
                      </p>
                    </div>
                  )}

                  {/* Color Legend */}
                  <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-4">
                    <h3 className="text-[var(--text-primary)] font-semibold text-[13px] mb-3">DMC Color Legend</h3>
                    <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
                      {pattern.colors.map((c) => (
                        <div key={c.dmc} className="flex items-center gap-2 px-2 py-1 rounded bg-[var(--bg-surface)]">
                          <span className="text-[14px] w-5 text-center" style={{ color: c.hex }}>{c.symbol}</span>
                          <div
                            className="w-4 h-4 rounded-sm border border-white/20 flex-shrink-0"
                            style={{ backgroundColor: c.hex }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] text-[var(--text-primary)] font-mono">DMC {c.dmc}</p>
                            <p className="text-[8px] text-[var(--text-muted)] truncate">{c.name} ({c.count})</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => setActiveTab("export")}
                    className="w-full px-5 py-2.5 rounded-xl text-[13px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 transition-all"
                  >
                    Continue to Export &rarr;
                  </button>
                </>
              ) : (
                <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-8 text-center">
                  <svg className="w-16 h-16 mx-auto mb-4 text-[var(--text-muted)]/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                  <p className="text-[var(--text-muted)] text-[13px] mb-1">Upload an image and convert</p>
                  <p className="text-[var(--text-muted)] text-[10px]">Your cross-stitch pattern preview will appear here</p>
                </div>
              )}
            </div>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      {/* ────────── EXPORT TAB ────────── */}
      {activeTab === "export" && (
        <div className="page-enter">
          {false ? (
            <div className="text-center py-16">
              <p className="text-[var(--text-muted)] text-[14px] mb-3">No pattern to export yet</p>
              <button
                onClick={() => setActiveTab("convert")}
                className="btn-outline text-[12px] py-2 px-5"
              >
                Go to Convert
              </button>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto">
              {/* ── Page header ──
                 The sub-tab pill nav (Mockups / Thumbnails / Listing) was
                 removed: Thumbnails + Listing moved to the dedicated List
                 tab, and Mockups is the only thing left here, so a
                 switcher added confusion without value. The Mockups
                 section auto-triggers below. */}
              <div className="mb-6 flex items-baseline justify-between">
                <h2 className="font-display text-[22px] text-[var(--text-page-title)] leading-tight">Export & Package</h2>
                <p className="text-[11px] text-[var(--text-muted)]">Step 3 of 6</p>
              </div>

              <div className="space-y-6">
              {/* Dead "Test Art (no pattern yet)" uploader block removed —
                 it was wrapped in `{false && !pattern && (...)}` so it
                 never rendered, but it held the last remaining purple
                 styling + the one testArtImage null-narrowing TS error.
                 With the Export tab now Mockups-only, the standalone
                 test-uploader path has no role here. */}
              {pattern && (
              <>
              {/* Pattern summary */}
              <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-5">
                <h3 className="text-[var(--text-primary)] font-semibold text-[15px] mb-4">Export Pattern PDF</h3>

                <div className="flex gap-5 mb-5">
                  {(renderedPreview || patternPreview) && (
                    <img
                      src={renderedPreview || patternPreview!}
                      alt="Preview"
                      className="w-32 h-32 object-contain rounded-lg border border-[var(--border-default)]"
                      style={renderedPreview ? undefined : { imageRendering: "pixelated" }}
                    />
                  )}
                  <div className="flex-1">
                    <input
                      type="text"
                      value={patternName}
                      onChange={(e) => setPatternName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] text-[13px] font-semibold focus:outline-none focus:border-purple-500/40 mb-3"
                    />
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-[var(--bg-surface)] rounded-lg p-2">
                        <p className="text-[14px] font-bold text-[var(--text-primary)]">{pattern.width}x{pattern.height}</p>
                        <p className="text-[8px] text-[var(--text-muted)]">Grid Size</p>
                      </div>
                      <div className="bg-[var(--bg-surface)] rounded-lg p-2">
                        <p className="text-[14px] font-bold text-[var(--text-primary)]">{pattern.colors.filter((c) => c.dmc !== pattern.backgroundDmc).length}</p>
                        <p className="text-[8px] text-[var(--text-muted)]">Colors</p>
                      </div>
                      <div className="bg-[var(--bg-surface)] rounded-lg p-2">
                        <p className="text-[14px] font-bold text-[var(--text-primary)]">{pattern.totalStitches.toLocaleString()}</p>
                        <p className="text-[8px] text-[var(--text-muted)]">Stitches</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-[var(--bg-surface)] rounded-lg p-3 mb-5">
                  <h4 className="text-[11px] font-semibold text-[var(--text-primary)] mb-2">PDF Includes:</h4>
                  <ul className="space-y-1">
                    {[
                      "Full-color pattern preview",
                      "Symbol grid chart (printable on A4/Letter)",
                      "DMC color legend with thread numbers",
                      "Stitch count per color",
                      "Pattern dimensions and fabric requirements",
                    ].map((item, i) => (
                      <li key={i} className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                        <svg className="w-3 h-3 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={exportPdf}
                    disabled={exportingPdf}
                    className="flex-1 btn-amber rounded-xl h-11 text-[14px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {exportingPdf ? (
                      <>
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Building pattern bundle...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download Pattern Bundle (5 PDFs + OXS)
                      </>
                    )}
                  </button>
                  <button
                    onClick={exportMiniBundle}
                    disabled={exportingPdf}
                    title="Generate 3 size variants (full, medium, mini) in a single ZIP. perceived value bump for Etsy buyers"
                    className="h-11 px-4 rounded-xl text-[13px] font-medium bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] hover:border-[var(--border-strong)] transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h10M4 17h7" />
                    </svg>
                    Mini Bundle (3 sizes)
                  </button>
                  {/* "List on Etsy" button removed — publishing lives on
                     the List tab now. The seller reaches it via the
                     "Next: List" CTA at the bottom of this page once
                     mockups have generated. */}
                </div>
              </div>

              {/* "Next: Generate hoop mockups" hint box removed — the
                 Mockups section now renders directly below the PDF
                 card and auto-starts generating on tab entry, so there's
                 nothing for the user to navigate to manually. */}

              </>
              )}

              {/* ── Auto-Generate Mockups (GPT-image-2) ──
                 One click → 4 photorealistic cross-stitch scenes
                 generated in parallel from the rendered pattern alone.
                 Etsy caps listing galleries at 10 images, but only the
                 4 distinct angles below convert (hero flat-lay, making-
                 it, lifestyle, decor-in-situ). Remaining 6 slots get
                 free canvas info cards. This costs $0.28/listing vs.
                 $0.70 if we filled all 10 with paid GPT calls. Replaces
                 the old "upload a frame photo" flow — the user doesn't
                 need a frame photo or any input beyond having run
                 Convert first. Also auto-fires on tab entry once
                 Convert has produced a rendered preview — the seller
                 never has to click. */}
              <div className="mb-8 bg-[var(--bg-elevated)] border border-amber-500/20 rounded-xl p-5">
                <h3 className="text-[var(--text-primary)] font-semibold text-[15px] mb-1 flex items-center gap-2 flex-wrap">
                  <span>Auto-Generate Mockups</span>
                  {/* Badge mirrors which engine will actually run on the
                     next click — switches between paid GPT-image-2 and
                     free Sharp compositing based on the testMode toggle
                     below. Color also flips (amber=paid, emerald=free)
                     so it's impossible to confuse the two at a glance. */}
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    AI (GPT-image-2) · $0.28
                  </span>
                </h3>
                <p className="text-[var(--text-muted)] text-[12px] mb-3">
                  Generates 4 photorealistic lifestyle mockups — flat-lay hero, hands mid-stitch, cozy lap, shelf styled — the conversion-tested angles buyers actually scan for. Click to start; auto-firing is disabled to avoid surprise charges.
                </p>

                {/* Test-mode toggle removed by user request — was annoying. AI
                   path is now the only mockup mode. The settings.testMode
                   reads downstream (auto-fire gate, bulk endpoint, Re-mockup
                   tooltip) still respect the persisted localStorage value
                   for any user who had it set, but no UI surfaces it. */}

                {/* Generate button — the primary action. Disabled until Convert
                   has produced a renderedPreview to mock up. */}
                <div className="flex flex-wrap items-center gap-3 mb-5">
                  {/* Primary CTA — uses the Etsy clementine palette via
                     `--accent-primary` / `--accent-hover` so the button
                     matches "Scan Top Sellers", "Deep Scan & Study", and
                     the Next: Thumbnails button below. No gradient — Etsy
                     buttons are flat solid orange. */}
                  <button
                    onClick={generateAutoMockups}
                    // Accept either preview source. `renderedPreview` is the
                    // photoreal GPT-image-2 finished-look; `patternPreview` is
                    // the cheaper canvas-rendered chart that already exists
                    // after a Python convert. The mockup endpoint accepts
                    // either — the previous `!renderedPreview` gate stranded
                    // the button in "Run Convert first" state after a
                    // Python-only convert, even though the mockup pipeline
                    // would have happily run on patternPreview.
                    disabled={gptComposing || !(renderedPreview || patternPreview)}
                    className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
                    style={{
                      background: "var(--accent-primary)",
                      border: "1px solid var(--accent-primary)",
                      boxShadow: "0 8px 24px var(--accent-glow)",
                    }}
                    onMouseEnter={(e) => {
                      if (!e.currentTarget.disabled) {
                        e.currentTarget.style.background = "var(--accent-hover)";
                        e.currentTarget.style.borderColor = "var(--accent-hover)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "var(--accent-primary)";
                      e.currentTarget.style.borderColor = "var(--accent-primary)";
                    }}
                  >
                    {gptComposing ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Generating 4 mockups…
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        {gptMockups.length > 0 ? "Generate 4 more" : "Generate Mockups"}
                      </>
                    )}
                  </button>
                  {/* Re-mockup — clears the existing batch and runs fresh in
                     whichever mode is currently selected. The common path
                     this solves: seller ran test-mode mockups to rehearse,
                     then unchecks Test mode to get the real AI batch. With
                     just the primary button they'd have to wait for the
                     toggle's clear-effect AND re-click Generate. This
                     button does both in one click — drops the cached
                     mockups + the source key + the auto-trigger guard,
                     then re-fires generateAutoMockups so the new mode
                     takes effect immediately.

                     Visibility gate: any mockupSource generateAutoMockups
                     would actually accept (renderedPreview OR the cheaper
                     patternPreview). The primary button is gated stricter
                     (renderedPreview only), but that's overly conservative
                     and was hiding this button after a Python-only convert
                     even though re-running would have worked. Disabled
                     state is also handled — disabled while composing.
                     Hidden when no mockups exist (otherwise it would just
                     duplicate the primary button). */}
                  {gptMockups.length > 0 && !gptComposing && (renderedPreview || patternPreview) && (
                    <button
                      onClick={() => {
                        setGptMockups([]);
                        setGptMockupsSourceKey(null);
                        autoMockupTriggeredRef.current = false;
                        void generateAutoMockups();
                      }}
                      className="px-3 py-2 rounded-xl text-[12px] font-semibold text-[var(--text-secondary)] hover:text-white border border-white/[0.12] hover:border-white/[0.25] bg-white/[0.02] hover:bg-white/[0.04] transition-colors flex items-center gap-1.5"
                      title={settings.testMode
                        ? "Drop the current batch and re-run in Test mode (free)"
                        : "Drop the current batch and re-run with AI ($0.28)"}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Re-mockup
                    </button>
                  )}
                  {gptComposing && (
                    <span className="text-[11px] text-[var(--text-muted)]">~60–120 seconds</span>
                  )}
                  {!renderedPreview && !patternPreview && !gptComposing && (
                    <span className="text-[11px] text-amber-400">⚠️ Run Convert first</span>
                  )}
                </div>

                {/* Results grid — shows each finished mockup as a
                   thumbnail with Save + remove controls. Keeps the same
                   {dataUrl} shape as before so downstream code (Etsy
                   upload, zip package) doesn't need to change. */}
                {gptMockups.length > 0 && (
                  <div className="flex flex-wrap gap-4">
                    {gptMockups.map((m, idx) => (
                      <div key={idx} className="relative w-48 rounded-xl overflow-hidden border border-amber-500/30 bg-[var(--bg-surface)] group">
                        <img src={m.dataUrl} alt={`Mockup ${idx + 1}`} className="w-full h-44 object-cover" />
                        <div className="px-2 py-1.5 bg-[var(--bg-elevated)] flex items-center justify-between">
                          <p className="text-[10px] text-[var(--text-primary)] font-medium">Mockup {idx + 1}</p>
                          <a
                            href={m.dataUrl}
                            download={`${patternName || "cross-stitch"}-mockup-${idx + 1}.png`}
                            className="text-[10px] text-amber-400 hover:text-amber-300"
                          >Save</a>
                        </div>
                        <button
                          onClick={() => setGptMockups((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Remove mockup"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {gptError && (
                  <p className="text-[11px] text-red-400 mt-3">✗ {gptError}</p>
                )}

                {/* ── Listing Video Preview ──
                   Standalone Generate-Video button + inline <video> player.
                   Sibling card below the mockup grid; uses the same
                   AI/Ken-Burns endpoint ternary as listOnEtsy() so the
                   preview is exactly what the listing will ship. Gated
                   on having ≥1 GPT mockup so we don't spin up SVD on an
                   empty input. */}
                <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5 mt-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
                        <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Listing Video
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        {gptMockups.length >= 3
                          ? "AI-animated (SVD) — real motion from your mockups · ~90s"
                          : "Ken Burns slideshow · ~30s · generate mockups first for AI video"}
                      </div>
                    </div>
                    <button
                      onClick={generateVideoPreview}
                      disabled={generatingPreviewVideo || gptMockups.length === 0}
                      className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                      {generatingPreviewVideo ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Generating… (~90s)
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          </svg>
                          Generate Video
                        </>
                      )}
                    </button>
                  </div>

                  {gptMockups.length === 0 && (
                    <div className="text-[11px] text-[var(--text-muted)] italic text-center py-4">
                      Generate mockups first — the video uses them as frames
                    </div>
                  )}

                  {generatingPreviewVideo && (
                    <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-6 text-center">
                      <div className="text-[13px] text-amber-300 font-medium mb-1">
                        {gptMockups.length >= 3 ? "Animating with Stable Video Diffusion…" : "Rendering video…"}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {gptMockups.length >= 3
                          ? "SVD is generating real hand-motion clips from your mockups. This takes ~90s."
                          : "Building Ken Burns slideshow from your mockups."}
                      </div>
                    </div>
                  )}

                  {previewVideoUrl && !generatingPreviewVideo && (
                    <div className="space-y-3">
                      <video
                        src={previewVideoUrl}
                        controls
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full max-w-sm mx-auto rounded-xl border border-[var(--border-default)] block"
                        style={{ aspectRatio: "1/1" }}
                      />
                      <div className="flex items-center justify-center gap-3">
                        <a
                          href={previewVideoUrl}
                          download="listing-video.mp4"
                          className="px-4 py-2 rounded-lg text-[12px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1.5"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download MP4
                        </a>
                        <button
                          onClick={generateVideoPreview}
                          className="px-4 py-2 rounded-lg text-[12px] font-semibold bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] border border-[var(--border-default)] transition-colors"
                        >
                          Regenerate
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* In-section "Next: Thumbnails" CTA removed — there's
                   now a single "Next: List" button at the very bottom of
                   the page that routes straight to the publish step, so
                   we don't need a nested sub-navigation here. */}
              </div>

              </div>

              {/* ── Next: List ──
                 Once the seller has their PDF + mockups, the only remaining
                 step is publishing. Thumbnails + SEO copy + Etsy upload all
                 live on the List tab now — this page is intentionally
                 stripped to Mockups-only so the flow reads as:
                   Convert → Export (PDF + mockups) → List (publish).
                 Gated on having at least one mockup so the seller doesn't
                 accidentally list an empty gallery. */}
              {gptMockups.length > 0 && (
                <div className="mt-8 border-t border-[var(--border-subtle)] pt-6">
                  <button
                    onClick={() => setActiveTab("list")}
                    className="btn-amber w-full h-14 text-[14px] font-semibold flex items-center justify-center gap-3"
                  >
                    Next: List
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                  <p className="text-[10px] text-[var(--text-muted)] text-center mt-2">
                    {gptMockups.length} mockup{gptMockups.length === 1 ? "" : "s"} ready · PDF bundle downloaded · continue to publish
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ────────── LIST TAB ────────── */}
      {activeTab === "list" && (
        <div className="page-enter">
          {!pattern ? (
            <div className="text-center py-16">
              <p className="text-[var(--text-muted)] text-[14px] mb-3">Convert a pattern first before creating a listing</p>
              <button
                onClick={() => setActiveTab("convert")}
                className="px-5 py-2 rounded-lg text-[12px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all"
              >
                Go to Convert
              </button>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-[var(--text-primary)] font-semibold text-[15px]">Create Etsy Listing</h3>
                <button
                  onClick={generateListingCopy}
                  disabled={generatingListing}
                  className="px-4 py-2 rounded-lg text-[12px] font-medium bg-violet-500/15 text-violet-400 border border-violet-500/20 hover:bg-violet-500/25 disabled:opacity-40 transition-all"
                >
                  {generatingListing ? "Generating..." : "AI Generate Copy"}
                </button>
              </div>

              {/* Etsy SEO Optimizer panel hidden per user request — the
                   auto-run effect above still fires runListingOptimizer()
                   + generateListingCopy() on List entry, and the result
                   auto-populates Title / Tags / Price / Description into
                   the form fields below via applyOptimizedListing(). Users
                   no longer see the optimizer card, but the optimization
                   logic (140-char titles, 13 long-tail 20-char tags,
                   cold-traffic pricing, Etsy title-rewrite norms) keeps
                   running behind the scenes. If an error needs surfacing
                   we rely on the trademark warnings block below. */}

              {/* Listing Images gallery removed from List tab per user
                   request — now rendered once on the Preview tab (below
                   the form edits), where the same mockups + info cards
                   display together in one gallery. Keeping them on two
                   tabs duplicated the content and made the List tab
                   feel crowded. */}

              <div className="space-y-4">
                <div>
                  <label className="text-[11px] text-[var(--text-muted)] font-medium">Title</label>
                  <input
                    type="text"
                    value={listTitle}
                    onChange={(e) => setListTitle(e.target.value)}
                    placeholder="SEO-optimized title ending with (Digital Download)..."
                    maxLength={140}
                    className="w-full mt-1 px-3 py-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] text-[13px] focus:outline-none focus:border-purple-500/40"
                  />
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-medium ${
                        listTitle.length === 0 ? "text-[var(--text-muted)]" :
                        listTitle.length <= 80 ? "text-amber-400" :
                        listTitle.length <= 120 ? "text-emerald-400" :
                        listTitle.length <= 140 ? "text-blue-400" :
                        "text-red-400"
                      }`}>
                        {listTitle.length}/140
                      </span>
                      {listTitle.length > 0 && listTitle.length <= 80 && (
                        <span className="text-[9px] text-amber-400">Add more keywords for better SEO</span>
                      )}
                      {listTitle.length > 80 && listTitle.length <= 140 && (
                        <span className="text-[9px] text-emerald-400">Great length for SEO</span>
                      )}
                    </div>
                    {listTitle && (
                      <div className="flex items-center gap-1">
                        {listTitle.toLowerCase().includes("cross stitch") && <span className="px-1.5 py-0.5 rounded text-[8px] bg-emerald-500/15 text-emerald-400">cross stitch</span>}
                        {listTitle.toLowerCase().includes("pattern") && <span className="px-1.5 py-0.5 rounded text-[8px] bg-emerald-500/15 text-emerald-400">pattern</span>}
                        {listTitle.toLowerCase().includes("digital download") && <span className="px-1.5 py-0.5 rounded text-[8px] bg-emerald-500/15 text-emerald-400">digital</span>}
                        {!listTitle.toLowerCase().includes("digital download") && <span className="px-1.5 py-0.5 rounded text-[8px] bg-red-500/15 text-red-400">add &quot;Digital Download&quot;</span>}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-[var(--text-muted)] font-medium">Description</label>
                  <textarea
                    value={listDescription}
                    onChange={(e) => setListDescription(e.target.value)}
                    rows={8}
                    className="w-full mt-1 px-3 py-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] text-[12px] focus:outline-none focus:border-purple-500/40 resize-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-[var(--text-muted)] font-medium">Tags (13 comma-separated)</label>
                  <input
                    type="text"
                    value={listTags}
                    onChange={(e) => setListTags(e.target.value)}
                    className="w-full mt-1 px-3 py-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] text-[12px] focus:outline-none focus:border-purple-500/40"
                  />
                </div>

                <div className="flex gap-4">
                  <div className="w-48">
                    <label className="text-[11px] text-[var(--text-muted)] font-medium flex items-center gap-1.5">
                      Price ($)
                      <span className="px-1.5 py-0.5 rounded text-[8px] bg-amber-500/15 text-amber-400 flex items-center gap-1">
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        locked
                      </span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={listPrice}
                      readOnly
                      title={`Cross-stitch listings are locked at $${CROSS_STITCH_LISTING_PRICE}.`}
                      className="w-full mt-1 px-3 py-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] text-[13px] focus:outline-none cursor-not-allowed opacity-70"
                    />
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">
                      All cross-stitch listings ship at a flat ${CROSS_STITCH_LISTING_PRICE}.
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Trademark Warnings ── */}
              {trademarkWarnings.length > 0 && (
                <div className="bg-[var(--bg-elevated)] border border-red-500/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <h3 className="text-[13px] font-bold text-red-400">Trademark / Copyright Risk Detected</h3>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Fix these issues before listing to avoid takedowns, suspensions, or legal trouble on Etsy.
                  </p>
                  <div className="space-y-2">
                    {trademarkWarnings.map((w, i) => (
                      <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${
                        w.risk === "high" ? "bg-red-500/10 border border-red-500/20" :
                        w.risk === "medium" ? "bg-amber-500/10 border border-amber-500/20" :
                        "bg-yellow-500/10 border border-yellow-500/20"
                      }`}>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase flex-shrink-0 mt-0.5 ${
                          w.risk === "high" ? "bg-red-500/20 text-red-400" :
                          w.risk === "medium" ? "bg-amber-500/20 text-amber-400" :
                          "bg-yellow-500/20 text-yellow-400"
                        }`}>{w.risk}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] text-[var(--text-primary)] font-medium">
                            &ldquo;{w.term}&rdquo;
                          </p>
                          <p className="text-[11px] text-emerald-400 mt-1">
                            Safe alternative: {w.suggestion}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            // Auto-replace in title, description, and tags
                            setListTitle((t) => t.replace(new RegExp(w.term, "gi"), w.suggestion));
                            setListDescription((d) => d.replace(new RegExp(w.term, "gi"), w.suggestion));
                            setListTags((t) => t.replace(new RegExp(w.term, "gi"), w.suggestion));
                            setTrademarkWarnings((prev) => prev.filter((_, idx) => idx !== i));
                          }}
                          className="px-2.5 py-1 rounded-md text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 transition-all flex-shrink-0"
                        >
                          Fix
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {trademarkWarnings.length === 0 && listTitle && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span className="text-[11px] text-emerald-400 font-medium">No trademark issues detected</span>
                </div>
              )}

              {/* ── Next: Preview ──
                 The actual "List on Etsy" button now lives on the Preview
                 tab, which shows the whole listing package (images, PDF,
                 title, description, price, tags, video) in one summary
                 view. Forwarding the seller here means they review the
                 full picture before publish, instead of firing a publish
                 from the middle of a long edit form. Gated on a title
                 being present and no high-risk trademark warnings. */}
              <div className="mt-4 border-t border-[var(--border-subtle)] pt-6 space-y-3">
                <button
                  onClick={() => setActiveTab("preview")}
                  disabled={!listTitle || trademarkWarnings.some((w) => w.risk === "high")}
                  className="btn-amber w-full h-14 text-[14px] font-semibold flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next: Preview listing
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
                {!listTitle && (
                  <p className="text-[10px] text-amber-400 text-center">
                    Title is required — wait for the SEO Optimizer to finish or pick one of the 3 title options above.
                  </p>
                )}
                {trademarkWarnings.some((w) => w.risk === "high") && (
                  <p className="text-[10px] text-red-400 text-center">
                    Resolve the high-risk trademark warning(s) above before previewing.
                  </p>
                )}
                <p className="text-[10px] text-[var(--text-muted)] text-center">
                  Preview shows the whole package before you publish to Etsy.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ────────── LISTING PREVIEW TAB ──────────
         Readonly summary of everything that's about to become an Etsy
         listing: the 10 mockup images, the PDF bundle, the title,
         description, tags, price, and video. Plus the single "List on
         Etsy" button — this is the ONLY place a publish happens from
         the single-item flow. Separating preview from edit means the
         seller sees their listing as Etsy shoppers will see it before
         committing to publish. */}
      {activeTab === "preview" && (
        <div className="page-enter">
          {/* ── Auto-Pipeline approval queue (Phase 1.5) ──
              When the orchestrator has generated items, show them all
              here as approve/remove cards.  Click "View →" to load one
              into Convert tab for inspection; click "Remove" to drop
              one from the queue.  Phase 2 will replace this section
              with full mockups + video + Etsy draft for each item. */}
          {autoPipelineState && autoPipelineState.items.length > 0 && (
            <div className="mx-auto mb-8 max-w-[1280px]">
              <div className="mb-4 overflow-hidden rounded-[24px] border border-white/10 bg-black/42 p-5 shadow-[0_24px_100px_rgba(0,0,0,0.38)] backdrop-blur-xl">
                <div className="flex items-baseline justify-between gap-4 mb-1">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-blue-200/55">Approval queue</p>
                    <h2 className="font-display text-[22px] text-white">Pipeline package review</h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-blue-200/80">
                      {autoPipelineState.items.filter((i) => i.status === "done" && !i.etsyListingId).length} ready ·
                      {autoPipelineState.items.filter((i) => !!i.etsyListingId).length > 0 && (
                        <span className="text-emerald-400 ml-1">
                          {autoPipelineState.items.filter((i) => !!i.etsyListingId).length} live
                        </span>
                      )}
                      {autoPipelineState.items.filter((i) => i.status === "failed").length > 0 && (
                        <span className="text-red-400 ml-1">
                          {autoPipelineState.items.filter((i) => i.status === "failed").length} failed
                        </span>
                      )}
                    </span>
                    {/* "Retry missing assets" — fills PDF/mockups/video/copy
                        for items that completed but skipped some assets
                        (e.g., legacy items from older code, or steps that
                        failed silently due to ffmpeg missing). */}
                    {autoPipelineState.items.some(
                      (i) => i.status === "done" && (!i.hasPdf || !i.mockups?.some((m) => !!m.dataUrl) || !i.hasVideo || !i.listingCopy?.tags.length),
                    ) && !autoPipelineState.active && (
	                      <button
	                        onClick={retryAllMissingAssets}
	                        className="text-[11px] px-3 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-100 font-medium transition-colors"
                        title="Fills in missing PDFs / mockups / video / copy for items that completed without them"
                      >
                        🔄 Retry missing assets
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[12px] text-[var(--text-secondary)]">
                  {autoPipelineState.items.some((i) => i.status === "done" && !i.etsyListingId)
                    ? (
                      <>
                        Each item has: chart · 4 mockups · video · 5 PDFs · listing copy · ready to publish.
                        Click <strong>✓ List ALL LIVE on Etsy</strong> to publish every ready item at ${CROSS_STITCH_LISTING_PRICE} each in one go,
                        or click the green button on a single card to publish just that one. Live publish now requires a typed confirmation.
                        Click <strong>✗ Remove</strong> to drop items you don&apos;t like.
                        Click <strong>🔄 Retry missing assets</strong> to fill in any skipped steps without re-generating images.
                      </>
                    ) : (
                      <>
                        Published items stay here for final review, downloads, and Etsy links. Click <strong>✗ Remove</strong> when you are done with the card.
                      </>
                    )}
                </p>
                {/* Bulk publish — fires Approve & List LIVE for every
                    ready item in sequence with a 1.5s cushion between
                    items so Etsy's rate limiter stays happy.  Disabled
                    while a bulk run is mid-flight or when there's
                    nothing left to publish. */}
                {(() => {
                  const readyToPublish = autoPipelineState.items.filter(
                    (i) => i.status === "done" && !i.etsyListingId && i.listingCopy && i.patternFull,
                  );
                  if (readyToPublish.length === 0) return null;
                  return (
                    <button
                      onClick={approveAllItems}
                      disabled={bulkPublishing}
                      className="mt-4 w-full px-4 py-3 rounded-lg text-[13px] font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-60 disabled:cursor-not-allowed text-white shadow-[0_0_20px_-4px_rgba(16,185,129,0.6)] transition-all flex items-center justify-center gap-2"
                    >
                      {bulkPublishing ? (
                        <>
                          <span className="inline-block w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          <span>Publishing all {readyToPublish.length}… watch each card for progress</span>
                        </>
                      ) : (
                        <>
                          <span>✓ List ALL {readyToPublish.length} LIVE on Etsy</span>
                          <span className="text-[11px] opacity-80">
                            (${(CROSS_STITCH_LISTING_PRICE_NUMBER * readyToPublish.length).toFixed(2)} total · requires confirmation)
                          </span>
                        </>
                      )}
                    </button>
                  );
                })()}
              </div>
              <div className="grid grid-cols-1 gap-4">
                {autoPipelineState.items.map((item) => {
                  const renderableMockups = (item.mockups || []).filter((m) => !!m.dataUrl);
                  const mockupSlots = item.mockups || [];
                  const mockupReadyCount = renderableMockups.length;
                  const mockupLabel = mockupReadyCount > 0
                    ? `${mockupReadyCount}/${mockupSlots.length || mockupReadyCount} mockups loaded`
                    : mockupSlots.length > 0
                      ? `${mockupSlots.length} mockups generated · loading previews`
                      : "";
                  return (
                  <div
                    key={item.id}
                    className={`border rounded-2xl bg-black/45 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.25)] ${
                      item.status === "failed"
                        ? "border-red-500/30 opacity-70"
                        : item.etsyListingId
                          ? "border-emerald-500/40 bg-emerald-500/[0.04]"
                          : "border-white/[0.08] hover:border-blue-400/30 transition-colors"
                    }`}
                  >
                    {/* Header: source image + title + chart stats + actions */}
                    <div className="flex gap-3 mb-3">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="w-24 h-24 rounded-lg object-cover bg-white flex-shrink-0"
                        />
                      ) : item.hasImage ? (
                        // Image was generated server-side but the slim
                        // poll stripped the data URL.  Lazy-load fills
                        // this in on the next rehydrate; meanwhile show
                        // a non-alarming "loading" hint.
                        <div className="w-24 h-24 rounded-lg bg-white/[0.04] flex-shrink-0 flex items-center justify-center text-[10px] text-[var(--text-muted)]">
                          loading…
                        </div>
                      ) : (
                        <div className="w-24 h-24 rounded-lg bg-white/[0.04] flex-shrink-0 flex items-center justify-center text-[10px] text-[var(--text-muted)]">
                          no image
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-white line-clamp-2 mb-1">
                          {item.listingCopy?.title || item.title}
                        </p>
                        {item.patternStats ? (
                          <div className="text-[10px] text-[var(--text-muted)] space-y-0.5">
                            <p>{item.patternStats.width}×{item.patternStats.height} · {item.patternStats.colors} DMC · {item.patternStats.totalStitches.toLocaleString()} stitches</p>
                            <div className="flex items-center gap-2 text-[9px]">
                              {item.hasPdf && <span className="text-emerald-400">✓ PDF bundle</span>}
                              {mockupReadyCount > 0 && <span className="text-emerald-400">✓ {mockupReadyCount} mockups</span>}
                              {mockupReadyCount === 0 && mockupSlots.length > 0 && <span className="text-blue-300">mockups saved · loading previews</span>}
                              {item.hasVideo && <span className="text-emerald-400">✓ Video</span>}
                            </div>
                            {item.listingCopy && (
                              <p className="text-emerald-400">
                                ${CROSS_STITCH_LISTING_PRICE} · {item.listingCopy.tags.length} tags
                              </p>
                            )}
                          </div>
                        ) : item.status === "failed" ? (
                          <p className="text-[10px] text-red-400">{item.error || "failed"}</p>
                        ) : (
                          <p className="text-[10px] text-[var(--text-muted)]">
                            {item.status === "generating" && "1/7 · Generating image…"}
                            {item.status === "converting" && "2/7 · Converting to chart…"}
                            {item.status === "exporting" && "3/7 · Exporting PDF bundle…"}
                            {item.status === "mocking" && "4/7 · Creating mockups…"}
                            {item.status === "videoing" && "5/7 · Rendering listing video…"}
                            {item.status === "writing" && "6/7 · Writing listing copy…"}
                            {item.status === "queued" && "Queued…"}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        {item.status === "done" && (
                          <button
                            onClick={() => viewAutoPipelineItem(item)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-purple-500/15 hover:bg-purple-500/25 text-purple-200 transition-colors"
                            title="Open in Convert tab for review"
                          >
                            View Chart
                          </button>
                        )}
                        {item.status === "done" &&
                          (!item.hasPdf || mockupReadyCount < 4 || !item.hasVideo || !item.listingCopy?.tags.length) && (
                          <button
                            onClick={() => retryItemMissingSteps(item.id)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 transition-colors"
                            title="Fill in missing PDFs / mockups / video / copy without re-generating image"
                          >
                            🔄 Retry
                          </button>
                        )}
                        <button
                          onClick={() => removeAutoPipelineItem(item.id)}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.04] hover:bg-red-500/15 hover:text-red-400 text-[var(--text-muted)] transition-colors"
                          title="Remove from queue"
                        >
                          ✗ Remove
                        </button>
                      </div>
                    </div>

                    {/* Mockups gallery */}
                    {mockupSlots.length > 0 && (
                      <div className="mb-3">
                        <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                          Mockups ({mockupLabel})
                        </p>
                        <div className="grid grid-cols-4 gap-1.5">
                          {mockupSlots.map((m, idx) => (
                            m.dataUrl ? (
                              <img
                                key={idx}
                                src={m.dataUrl}
                                alt={m.scene}
                                className="w-full aspect-square rounded object-cover bg-white border border-white/[0.04]"
                                title={m.scene}
                              />
                            ) : (
                              <div
                                key={idx}
                                className="flex aspect-square w-full items-center justify-center rounded border border-white/[0.08] bg-white/[0.035] text-center text-[9px] leading-4 text-white/36"
                                title={m.scene}
                              >
                                loading<br />{m.scene}
                              </div>
                            )
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Video + PDF row — listing video plays inline, PDFs download
                        directly so the user never has to leave Preview to grab
                        the bundle. */}
                    {(item.videoB64 || item.patternFull?.patternPdfB64 || item.hasPdf) && (
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        {item.videoB64 ? (
                          <div>
                            <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-1.5">Listing Video</p>
                            <video
                              src={`data:video/mp4;base64,${item.videoB64}`}
                              controls
                              loop
                              muted
                              playsInline
                              className="w-full aspect-square rounded object-cover bg-black border border-white/[0.04]"
                            />
                          </div>
                        ) : <div />}
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-1.5">Downloads</p>
                          <div className="flex flex-col gap-1.5">
                            {item.patternFull?.patternPdfB64 && (
                              <a
                                href={`data:application/pdf;base64,${item.patternFull.patternPdfB64}`}
                                download={`${item.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60)}-chart.pdf`}
                                className="px-3 py-2 rounded-lg text-[11px] font-medium bg-purple-500/15 hover:bg-purple-500/25 text-purple-200 transition-colors text-center flex items-center justify-center gap-1.5"
                              >
                                <span>📄</span> Chart PDF
                              </a>
                            )}
                            {item.hasPdf && (
                              <button
                                onClick={async () => {
                                  // Re-fetch the full bundle from the API as a blob.
                                  // The orchestrator already generated it (hasPdf=true);
                                  // this call returns the same bytes for download.
                                  const r = await fetch("/api/cross-stitch/export-pdf", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      pattern: item.patternFull,
                                      name: item.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60),
                                      variant: "bundle",
                                    }),
                                  });
                                  if (!r.ok) return;
                                  const blob = await r.blob();
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = `${item.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60)}-bundle.zip`;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                }}
                                className="px-3 py-2 rounded-lg text-[11px] font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 transition-colors text-center flex items-center justify-center gap-1.5"
                              >
                                <span>📦</span> Full Bundle (5 PDFs + OXS)
                              </button>
                            )}
                            {item.videoB64 && (
                              <a
                                href={`data:video/mp4;base64,${item.videoB64}`}
                                download={`${item.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60)}-listing-video.mp4`}
                                className="px-3 py-2 rounded-lg text-[11px] font-medium bg-blue-500/15 hover:bg-blue-500/25 text-blue-200 transition-colors text-center flex items-center justify-center gap-1.5"
                              >
                                <span>🎬</span> Video MP4
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Listing copy — expanded inline so user sees title +
                        full description + tag chips + price without clicking
                        a collapse toggle.  Per 2026-05-16 spec: the Preview
                        card is the ONE place that shows everything. */}
                    {item.listingCopy && (
                      <div className="mb-3 p-3 bg-[var(--bg-surface)] rounded-lg space-y-2.5 text-[11px]">
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-1">Title</p>
                          <p className="text-white">{item.listingCopy.title}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-1">Price</p>
                          <p className="text-emerald-400 font-semibold text-[14px]">${CROSS_STITCH_LISTING_PRICE}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-1">Tags ({item.listingCopy.tags.length}/13)</p>
                          <div className="flex flex-wrap gap-1">
                            {item.listingCopy.tags.map((t, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-200 text-[10px]"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                        {/* SEO score — client-side check of title length,
                            tag quality, attribute presence, description
                            hook.  Click to expand flag list.  Phase 3.3
                            SEO 2026-05-17. */}
                        {(() => {
                          const seo = scoreListingSEO(item.listingCopy);
                          const color = seo.score >= 80 ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30"
                            : seo.score >= 60 ? "text-amber-300 bg-amber-500/10 border-amber-500/30"
                            : "text-red-300 bg-red-500/10 border-red-500/30";
                          return (
                            <details className="group">
                              <summary className={`cursor-pointer px-2.5 py-1.5 rounded-lg border ${color} text-[11px] flex items-center justify-between`}>
                                <span>SEO score: <strong>{seo.score}/100</strong></span>
                                <span className="text-[9px] opacity-70">{seo.flags.length} issue{seo.flags.length === 1 ? "" : "s"}</span>
                              </summary>
                              {seo.flags.length > 0 && (
                                <ul className="mt-1.5 ml-3 list-disc text-[10px] text-[var(--text-muted)] space-y-0.5">
                                  {seo.flags.map((f, i) => <li key={i}>{f}</li>)}
                                </ul>
                              )}
                              {/* Show attributes that ARE set (good
                                  signals) for transparency. */}
                              {item.listingCopy.attributes && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {Object.entries(item.listingCopy.attributes)
                                    .filter(([, v]) => !!v && String(v).toLowerCase() !== "null")
                                    .map(([k, v]) => (
                                      <span key={k} className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 text-[9px]">
                                        {k}: {String(v)}
                                      </span>
                                    ))}
                                </div>
                              )}
                            </details>
                          );
                        })()}
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-1">Description</p>
                          <div className="text-[var(--text-secondary)] whitespace-pre-line max-h-48 overflow-y-auto pr-1 leading-relaxed">
                            {item.listingCopy.description}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Live publish progress — replaces the Approve button
                        while the Etsy publish flow is running.  Each
                        setStatus() call updates publishProgress so the user
                        watches "1/8 Creating listing…" → "8/8 LIVE on Etsy ✓"
                        in real time. */}
                    {item.status === "publishing" && (
                      <div className="w-full px-4 py-3 rounded-lg text-[12px] font-medium bg-gradient-to-r from-emerald-500/15 to-teal-500/15 border border-emerald-500/30 text-emerald-200 flex items-center gap-3">
                        <span className="inline-block w-4 h-4 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin flex-shrink-0" />
                        <span>{item.publishProgress || "Publishing to Etsy…"}</span>
                      </div>
                    )}

                    {/* Approve & List on Etsy — main action */}
                    {item.status === "done" && !item.etsyListingId && item.listingCopy && (
                      <>
                        {item.error && (
                          <div className="mb-2 px-3 py-2 rounded-lg text-[11px] bg-red-500/10 border border-red-500/30 text-red-300">
                            {item.error}
                          </div>
                        )}
                        <button
                          onClick={() => approveAndListItem(item)}
                          className="w-full px-4 py-2 rounded-lg text-[12px] font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-[0_0_16px_-4px_rgba(16,185,129,0.5)] transition-all flex items-center justify-center gap-2"
                        >
                          <span>✓ Approve & List LIVE on Etsy</span>
                          <span className="text-[10px] opacity-70">(${CROSS_STITCH_LISTING_PRICE})</span>
                        </button>
                      </>
                    )}
                    {item.etsyListingId && (
                      <div className="w-full px-4 py-2 rounded-lg text-[12px] font-medium bg-emerald-500/15 text-emerald-300 text-center">
                        🎉 LIVE on Etsy (ID: {item.etsyListingId}) — <a href={`https://www.etsy.com/listing/${item.etsyListingId}`} target="_blank" rel="noreferrer" className="underline">view listing</a>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* When the Auto-Pipeline Queue is active, each item card above
              already shows mockups + video + downloads + listing copy
              inline — the standalone "Listing Preview" below would be a
              redundant duplicate of the last-loaded item, so we hide it.
              For the manual single-design flow (no queue), the Listing
              Preview still renders normally. */}
          {(autoPipelineState && autoPipelineState.items.length > 0) ? null : !pattern ? (
            <div className="text-center py-16">
              <p className="text-[var(--text-muted)] text-[14px] mb-3">Create a listing first before previewing</p>
              <button
                onClick={() => setActiveTab("convert")}
                className="btn-outline text-[12px] py-2 px-5"
              >
                Go to Convert
              </button>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto">
              {/* Header */}
              <div className="mb-6 flex items-baseline justify-between">
                <h2 className="font-display text-[22px] text-[var(--text-page-title)] leading-tight">Listing Preview</h2>
                <p className="text-[11px] text-[var(--text-muted)]">Step 5 of 6</p>
              </div>

              <div className="space-y-6">
                {/* ── Images gallery ──
                   Mockups from Export + any additional listing images
                   that might have been generated. First image becomes
                   the Etsy thumbnail (the one shoppers see in search). */}
                <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[var(--text-primary)] font-semibold text-[14px]">
                      Gallery ({gptMockups.length + (listingImages?.length || 0)} / 10)
                    </h3>
                    <span className="text-[10px] text-[var(--text-muted)]">First image = Etsy thumbnail</span>
                  </div>
                  {gptMockups.length + (listingImages?.length || 0) > 0 ? (
                    <div className="grid grid-cols-5 gap-2">
                      {gptMockups.map((m, i) => (
                        <div key={`mk-${i}`} className="rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface)] aspect-square relative">
                          <img src={m.dataUrl} alt={`Mockup ${i + 1}`} className="w-full h-full object-cover" />
                          {i === 0 && (
                            <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[8px] font-bold bg-[var(--accent-primary)] text-white uppercase tracking-wider">Thumb</span>
                          )}
                        </div>
                      ))}
                      {listingImages?.map((url, i) => (
                        <div key={`li-${i}`} className="rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface)] aspect-square">
                          <img src={url} alt={`Listing ${i + 1}`} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-[var(--text-muted)] text-[12px] border border-dashed border-[var(--border-subtle)] rounded-lg">
                      No mockup images yet — run Export tab first to auto-generate.
                    </div>
                  )}
                </div>

                {/* ── Title + Description + Tags + Price ──
                   Readonly rendering of the SEO copy the user locked in
                   on the List tab. Grouped into one card so it reads
                   top-to-bottom like an Etsy listing page. */}
                <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-5 space-y-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Title</p>
                    <p className="text-[var(--text-primary)] text-[15px] font-medium leading-snug">
                      {listTitle || <span className="italic text-[var(--text-muted)]">No title set</span>}
                    </p>
                    {listTitle && (
                      <p className="text-[9px] text-[var(--text-muted)] mt-1">{listTitle.length}/140 chars</p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-baseline justify-between mb-1">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Price</p>
                      <p className="text-[9px] text-[var(--text-muted)]">as configured on List tab</p>
                    </div>
                    <p className="text-[var(--accent-primary)] text-[26px] font-serif italic leading-none">
                      ${listPrice || "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Tags ({listTags.split(",").filter((t) => t.trim()).length}/13)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {listTags.split(",").map((t, i) => t.trim() && (
                        <span
                          key={i}
                          className={`chip text-[10px] ${
                            t.trim().length > 20
                              ? "!bg-red-500/15 !text-red-400 !border-red-500/40"
                              : "chip-amber"
                          }`}
                          title={t.trim().length > 20 ? `Too long (${t.trim().length}/20) — will be truncated on Etsy submit` : undefined}
                        >
                          {t.trim()}
                          {t.trim().length > 20 && <span className="ml-1 opacity-80">·{t.trim().length}</span>}
                        </span>
                      ))}
                      {!listTags && <span className="text-[var(--text-muted)] italic text-[11px]">No tags set</span>}
                    </div>
                    {listTags.split(",").some((t) => t.trim().length > 20) && (
                      <p className="text-[10px] text-red-400 mt-1.5">
                        Tag length over 20 chars will be auto-truncated when listed on Etsy.
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Description</p>
                    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-3 max-h-64 overflow-auto">
                      <pre className="text-[var(--text-primary)] text-[11px] whitespace-pre-wrap font-sans leading-relaxed">
                        {listDescription || <span className="italic text-[var(--text-muted)]">No description set</span>}
                      </pre>
                    </div>
                  </div>
                </div>

                {/* ── PDF + Video + Pattern stats ──
                   The downloadable assets a buyer actually receives.
                   Rendered from pattern metrics so we show "6 files,
                   14 DMC colors, 100×100 stitches" as a reality check
                   before publish. */}
                <div className="grid grid-cols-2 gap-4">
                  {/* PDF bundle */}
                  <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-4 h-4 text-[var(--accent-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">PDF bundle</h4>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                      Full colour chart, symbol-only chart, black & white chart, thread key, stitch guide.
                    </p>
                    {pattern && (
                      <div className="grid grid-cols-2 gap-2 mt-3 text-[10px]">
                        <div>
                          <p className="text-[var(--text-muted)]">Stitches</p>
                          <p className="text-[var(--text-primary)] font-semibold">{pattern.width} × {pattern.height}</p>
                        </div>
                        <div>
                          <p className="text-[var(--text-muted)]">DMC colours</p>
                          <p className="text-[var(--text-primary)] font-semibold">{pattern.colors.length}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Video */}
                  <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-4 h-4 text-[var(--accent-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">Listing video</h4>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                      {previewVideoUrl
                        ? "Your generated listing video is ready and will be uploaded to Etsy."
                        : "No video generated yet — one will be created automatically during publish using Kling AI."}
                    </p>
                    {previewVideoUrl && (
                      <video
                        src={previewVideoUrl}
                        className="mt-2 w-full rounded-lg"
                        style={{ maxHeight: 180 }}
                        controls
                        muted
                        playsInline
                      />
                    )}
                  </div>
                </div>

                {/* ── Trademark status ── */}
                {trademarkWarnings.length > 0 ? (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                    <p className="text-[12px] font-semibold text-red-400 mb-2">
                      ⚠️ {trademarkWarnings.length} trademark warning{trademarkWarnings.length === 1 ? "" : "s"} unresolved
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      Go back to List tab to review and fix. High-risk warnings block publishing.
                    </p>
                  </div>
                ) : listTitle && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span className="text-[11px] text-emerald-400 font-medium">No trademark issues — ready to publish</span>
                  </div>
                )}

                {/* ── Profit Calculator ──
                   Shown to the seller BEFORE they click List on Etsy
                   so they know exactly what this listing cost to make
                   AND what they'll keep after Etsy's cut on a sale.
                   All cost figures are derived from current state:
                     • generatedDesignEngine === "gpt-image-2"  → $0.04 HQ render
                     • premiumInfo.estimatedCost               → live cost from Premium Convert
                     • listTitle present                       → +$0.005 Gemini SEO
                     • Always: $0.20 Etsy listing fee, ~$0.05 listing video
                   Sale-side fees use Etsy's published 2025 rates:
                     • 6.5% transaction
                     • 3% + $0.25 payment processing (US default)
                     • 0.25% regulatory operating fee
                   All calculations are read-only / advisory; nothing here
                   changes the listing price or blocks publishing. */}
                {(() => {
                  const salePrice = parseFloat(listPrice) || CROSS_STITCH_LISTING_PRICE_NUMBER;
                  // Per-listing creation costs (only counted if actually used)
                  const hqRenderCost = generatedDesignEngine === "gpt-image-2" ? 0.04 : 0;
                  const premiumCost = premiumInfo?.estimatedCost ?? 0;
                  const seoCost = listTitle ? 0.005 : 0;
                  const videoCost = 0.05; // Veo / image-to-video estimate
                  const etsyListingFee = 0.20; // $0.20 per listing for 4 months
                  const totalCreationCost =
                    hqRenderCost + premiumCost + seoCost + videoCost + etsyListingFee;
                  // Etsy take on a sale at salePrice
                  const txnFee = salePrice * 0.065;
                  const payFee = salePrice * 0.03 + 0.25;
                  const regFee = salePrice * 0.0025;
                  const totalEtsyFees = txnFee + payFee + regFee;
                  // Net keep per sale
                  const netProfit = salePrice - totalEtsyFees - totalCreationCost;
                  const isProfit = netProfit > 0;
                  return (
                    <div className="border-t border-[var(--border-subtle)] pt-6 mb-4">
                      <div className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/[0.05] to-emerald-500/[0.04] p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-[14px] font-bold text-amber-200/95 flex items-center gap-2">
                            💰 Profit Calculator
                          </h3>
                          <span className="text-[10px] text-[var(--text-muted)] font-mono">
                            sale price: ${salePrice.toFixed(2)}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {/* Listing creation costs */}
                          <div className="rounded-lg bg-[var(--bg-elev1)] border border-[var(--border-subtle)] p-3 space-y-1.5 text-[11px]">
                            <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-muted)] pb-1 border-b border-[var(--border-subtle)]">
                              Listing creation cost
                            </div>
                            {hqRenderCost > 0 && (
                              <div className="flex justify-between"><span>HQ render (gpt-image-2)</span><span className="font-mono">${hqRenderCost.toFixed(3)}</span></div>
                            )}
                            {premiumCost > 0 && (
                              <div className="flex justify-between"><span>Premium Convert ({premiumInfo?.model})</span><span className="font-mono">${premiumCost.toFixed(3)}</span></div>
                            )}
                            {seoCost > 0 && (
                              <div className="flex justify-between"><span>SEO copy (Gemini)</span><span className="font-mono">${seoCost.toFixed(3)}</span></div>
                            )}
                            <div className="flex justify-between"><span>Listing video</span><span className="font-mono">${videoCost.toFixed(3)}</span></div>
                            <div className="flex justify-between"><span>Etsy listing fee</span><span className="font-mono">${etsyListingFee.toFixed(2)}</span></div>
                            <div className="flex justify-between font-semibold text-amber-300 pt-1 border-t border-[var(--border-subtle)]">
                              <span>Total cost</span>
                              <span className="font-mono">${totalCreationCost.toFixed(3)}</span>
                            </div>
                          </div>

                          {/* Etsy fees on sale */}
                          <div className="rounded-lg bg-[var(--bg-elev1)] border border-[var(--border-subtle)] p-3 space-y-1.5 text-[11px]">
                            <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-muted)] pb-1 border-b border-[var(--border-subtle)]">
                              Etsy fees per sale
                            </div>
                            <div className="flex justify-between"><span>Transaction (6.5%)</span><span className="font-mono">${txnFee.toFixed(3)}</span></div>
                            <div className="flex justify-between"><span>Payment (3% + $0.25)</span><span className="font-mono">${payFee.toFixed(3)}</span></div>
                            <div className="flex justify-between"><span>Regulatory (0.25%)</span><span className="font-mono">${regFee.toFixed(3)}</span></div>
                            <div className="flex justify-between text-[10px] text-[var(--text-muted)]"><span>(offsite ads if active)</span><span className="font-mono">+12%</span></div>
                            <div className="flex justify-between font-semibold text-rose-300 pt-1 border-t border-[var(--border-subtle)]">
                              <span>Etsy take</span>
                              <span className="font-mono">${totalEtsyFees.toFixed(3)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Net profit big number */}
                        <div
                          className={`rounded-xl p-4 flex items-center justify-between ${
                            isProfit
                              ? "bg-emerald-500/10 border border-emerald-500/30"
                              : "bg-rose-500/10 border border-rose-500/30"
                          }`}
                        >
                          <div>
                            <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">
                              Net profit per sale
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                              after all costs + Etsy fees
                            </div>
                          </div>
                          <div className={`text-[28px] font-bold font-mono ${isProfit ? "text-emerald-300" : "text-rose-300"}`}>
                            ${netProfit.toFixed(2)}
                          </div>
                        </div>

                        {/* Break-even hint */}
                        <div className="text-[10px] text-[var(--text-muted)] text-center">
                          {isProfit ? (
                            <>
                              Break-even on creation cost: <span className="font-mono text-amber-300">1 sale</span>
                              {totalCreationCost > 0 && (
                                <> · keeps <span className="font-mono text-emerald-300">${(salePrice - totalEtsyFees).toFixed(2)}</span> per sale before creation cost</>
                              )}
                            </>
                          ) : (
                            <span className="text-rose-300 font-semibold">⚠ Listing cost exceeds sale net — reduce AI tool usage or raise price</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* ── List on Etsy Button ──
                   Per the user's "No auto Etsy listing" memory: publishing
                   ONLY happens on an explicit click here. We never auto-
                   fire this from the auto-flow effects above. The button
                   disabled-state gates on title + no-high-risk-trademarks
                   so the seller can't accidentally list an incomplete
                   listing. */}
                <div className="border-t border-[var(--border-subtle)] pt-6 space-y-3">
                  <button
                    onClick={listOnEtsy}
                    disabled={!listTitle || etsyListing || trademarkWarnings.some((w) => w.risk === "high")}
                    className="w-full py-4 rounded-2xl text-[16px] font-bold text-white transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: (!listTitle || etsyListing || trademarkWarnings.some((w) => w.risk === "high"))
                        ? "var(--accent-soft)"
                        : "var(--accent-primary)",
                      border: "1px solid var(--accent-primary)",
                      boxShadow: "0 8px 24px var(--accent-glow)",
                    }}
                    onMouseEnter={(e) => {
                      if (!e.currentTarget.disabled) {
                        e.currentTarget.style.background = "var(--accent-hover)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!e.currentTarget.disabled) {
                        e.currentTarget.style.background = "var(--accent-primary)";
                      }
                    }}
                  >
                    {etsyListing ? (
                      <>
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        {etsyStatus || "Publishing…"}
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                        </svg>
                        List on Etsy
                      </>
                    )}
                  </button>
                  {etsyStatus && !etsyListing && (
                    <p className={`text-[11px] text-center font-medium ${etsyStatus.includes("Error") || etsyStatus.includes("Not connected") ? "text-red-400" : "text-emerald-400"}`}>
                      {etsyStatus}
                    </p>
                  )}
                  <p className="text-[10px] text-[var(--text-muted)] text-center">
                    Creates listing, uploads {gptMockups.length + (listingImages?.length || 0)} images + PDF + video, activates on your Etsy shop.
                  </p>

                  {/* List on Gumroad — HIDDEN.
                      The Gumroad publish channel is currently disabled
                      for cross-stitch. The pipeline (extension content
                      script, listOnGumroad fn, gumroadListing/Status
                      state, and the GUMROAD_PROGRESS poller) is all
                      kept intact — only the button is hidden, so we can
                      revisit Gumroad in the future by flipping the
                      `false` below to `true`.
                      Reason for hiding (2026-04-25): Gumroad's product
                      form has been a moving target for the form-filler
                      and isn't critical to the cross-stitch flow right
                      now; Etsy is sufficient for digital downloads. */}
                  {false && (
                    <>
                      <button
                        onClick={listOnGumroad}
                        disabled={!listTitle || gumroadListing || trademarkWarnings.some((w) => w.risk === "high")}
                        className="w-full py-3.5 rounded-2xl text-[15px] font-bold text-white transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                          // Gumroad pink (#FF90E8) on a dark base — distinct
                          // from the Etsy orange so the seller can tell the
                          // two CTAs apart at a glance.
                          background: (!listTitle || gumroadListing || trademarkWarnings.some((w) => w.risk === "high"))
                            ? "rgba(255, 144, 232, 0.25)"
                            : "linear-gradient(135deg, #FF90E8 0%, #E075CC 100%)",
                          border: "1px solid #FF90E8",
                          boxShadow: "0 8px 24px rgba(255, 144, 232, 0.35)",
                          color: "#1F1230",
                        }}
                      >
                        {gumroadListing ? (
                          <>
                            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            {gumroadStatus || "Preparing…"}
                          </>
                        ) : (
                          <>
                            {/* Gumroad-style folded-corner icon, mono so it
                                reads on the pink gradient. */}
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 3v5h5M5 21h14a2 2 0 002-2V8.5L13.5 3H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6M9 17h4" />
                            </svg>
                            List on Gumroad
                          </>
                        )}
                      </button>
                      {gumroadStatus && !gumroadListing && (
                        <p className={`text-[11px] text-center font-medium ${gumroadStatus.startsWith("Error") ? "text-red-400" : "text-pink-300"}`}>
                          {gumroadStatus}
                        </p>
                      )}
                      <p className="text-[10px] text-[var(--text-muted)] text-center">
                        {settings.extensionId
                          ? "Extension fills the form on Gumroad — review and click Save and continue."
                          : "Downloads bundle + copies description. Paste + drop on Gumroad, then Save."}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ────────── BULK PIPELINE TAB ────────── */}
      {activeTab === "bulk" && (
        <div className="page-enter space-y-6">
          {/* ── Header with stats ── */}
          <div className="surface-premium gradient-accent rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-[20px] font-bold text-[var(--text-primary)] flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center text-[18px]" style={{ background: "linear-gradient(135deg, var(--accent-primary), var(--accent-hover))", color: "var(--accent-contrast)" }}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  </span>
                  Bulk Pipeline
                </h2>
                <p className="text-[12px] text-[var(--text-muted)] mt-1 ml-[52px]">
                  Process {bulkItems.length} designs: Research → Prompt → Design → Convert → List
                </p>
              </div>
              {bulkItems.length > 0 && (
                <div className="text-right">
                  <div className="text-[24px] font-bold text-[var(--accent-primary)]">${(bulkStats.listed * CROSS_STITCH_LISTING_PRICE_NUMBER).toFixed(2)}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Projected from {bulkStats.listed} listed</div>
                </div>
              )}
            </div>

            {/* Pipeline progress bar */}
            {bulkItems.length > 0 && (
              <div className="grid grid-cols-6 gap-1 mb-3">
                {([
                  { label: "Selected", count: bulkStats.selected, color: "bg-[var(--text-muted)]" },
                  { label: "Prompted", count: bulkStats.prompted, color: "bg-[var(--accent-primary)]" },
                  { label: "Uploaded", count: bulkStats.uploaded, color: "bg-[var(--accent-primary)]" },
                  { label: "Review", count: bulkStats.review, color: "bg-[var(--accent-primary)]" },
                  { label: "Approved", count: bulkStats.approved, color: "bg-[var(--accent-hover)]" },
                  { label: "Listed", count: bulkStats.listed, color: "bg-emerald-500" },
                ] as const).map((s) => (
                  <div key={s.label} className="text-center">
                    <div className="h-2 rounded-full bg-[var(--bg-inset)] overflow-hidden mb-1">
                      <div className={`h-full ${s.color} rounded-full transition-all duration-500`} style={{ width: `${bulkStats.total ? (s.count / bulkStats.total) * 100 : 0}%` }} />
                    </div>
                    <span className="text-[9px] text-[var(--text-muted)]">{s.label}</span>
                    <span className="text-[10px] font-bold text-[var(--text-primary)] ml-1">{s.count}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Processing indicator */}
            {bulkProcessing && (
              <div className="flex items-center gap-3 bg-[var(--bg-inset)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 mt-2">
                <svg className="w-5 h-5 animate-spin text-[var(--accent-primary)]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <div className="flex-1">
                  <div className="text-[12px] text-[var(--accent-primary)] font-medium">{bulkStep}</div>
                  {bulkProgress.total > 0 && (
                    <div className="h-1.5 bg-[var(--bg-hover)] rounded-full mt-1.5 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%`, background: "linear-gradient(90deg, var(--accent-primary), var(--accent-hover))" }} />
                    </div>
                  )}
                </div>
                <span className="text-[11px] text-[var(--text-muted)] font-mono">{bulkProgress.current}/{bulkProgress.total}</span>
              </div>
            )}
          </div>

          {/* ── Empty State ── */}
          {bulkItems.length === 0 && (
            <div className="text-center py-16 space-y-4">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-[var(--accent-soft)] border border-[var(--border-accent)] flex items-center justify-center">
                <svg className="w-10 h-10 text-[var(--accent-primary)] opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div>
                <p className="text-[16px] font-semibold text-[var(--text-primary)]">No designs in pipeline yet</p>
                <p className="text-[12px] text-[var(--text-muted)] mt-1">Go to Research tab, scan trends, and add emerging trends to the bulk pipeline</p>
              </div>
              <button
                onClick={() => setActiveTab("research")}
                className="btn-amber"
              >
                Start Research
              </button>
            </div>
          )}

          {/* ── Step 1: Generate Prompts ── */}
          {bulkItems.length > 0 && bulkStats.selected > 0 && (
            <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[14px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-[var(--accent-soft)] border border-[var(--border-accent)] text-[var(--accent-primary)] flex items-center justify-center text-[11px] font-bold">1</span>
                  Generate Image Prompts & SEO Titles
                </h3>
                <span className="text-[11px] text-[var(--text-muted)]">{bulkStats.selected} designs need prompts</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mb-4">AI generates optimized GPT-Image-2 prompts, 3 SEO title options, pricing, and 13 Etsy tags for each design.</p>
              <button
                onClick={generateBulkPrompts}
                disabled={bulkProcessing}
                className="btn-amber"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate All Prompts ({bulkStats.selected})
              </button>
            </div>
          )}

          {/* ── Step 2: Render Images (auto or manual) ── */}
          {bulkStats.prompted > 0 && (
            <div className="bg-[var(--bg-elevated)] border border-amber-500/20 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[14px] font-semibold text-amber-400 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center text-[11px] font-bold">2</span>
                  Render with GPT-Image-2
                </h3>
                <span className="text-[11px] text-[var(--text-muted)] font-mono">{bulkStats.prompted} pending</span>
              </div>

              {/* Auto-generate CTA (primary path) */}
              <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-lg p-4 mb-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-[13px] font-semibold text-purple-300 mb-1">Auto-generate all images server-side</p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Renders every pending design via GPT-Image-2 in one click. Est. cost: <span className="text-purple-300 font-mono">${(bulkStats.prompted * 0.04).toFixed(2)}</span> ({bulkStats.prompted} × $0.04 medium quality).
                    </p>
                  </div>
                </div>
                <button
                  onClick={generateBulkImages}
                  disabled={bulkProcessing}
                  className="w-full px-5 py-3 rounded-xl text-[13px] font-semibold bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-[0_4px_12px_-4px_rgba(168,85,247,0.45)]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {bulkProcessing ? "Rendering…" : `Auto-generate ${bulkStats.prompted} images`}
                </button>
              </div>

              {/* Manual fallback (collapsed) */}
              <details className="bg-black/20 rounded-lg p-3 mb-4">
                <summary className="text-[11px] text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-primary)]">Or render manually in an external tool</summary>
                <p className="text-[11px] text-[var(--text-secondary)] mt-3 mb-2">
                  Copy each prompt sequentially and paste into <span className="text-amber-400 font-semibold">GPT-Image-2</span> or any image generator:
                </p>
                <ol className="text-[10px] text-[var(--text-muted)] space-y-1 ml-4 list-decimal">
                  <li>Click <span className="text-purple-400 font-semibold">Copy Next Prompt</span> below</li>
                  <li>Paste it into GPT-Image-2 and generate</li>
                  <li>Save the best result</li>
                  <li>Repeat for each design</li>
                </ol>
              </details>

              {/* Copy Next + Upload row */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={copyNextBulkPrompt}
                  disabled={bulkCopiedCount >= bulkPromptsWithPrompt.length}
                  className={`px-5 py-3 rounded-xl text-[13px] font-semibold transition-all flex items-center gap-2 ${
                    bulkCopiedCount >= bulkPromptsWithPrompt.length
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                      : "bg-[var(--accent-primary)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_4px_12px_-4px_rgba(241,100,30,0.45)]"
                  }`}
                >
                  {bulkCopiedCount >= bulkPromptsWithPrompt.length ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      All {bulkPromptsWithPrompt.length} Prompts Copied
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy Next Prompt ({bulkCopiedCount + 1}/{bulkPromptsWithPrompt.length})
                    </>
                  )}
                </button>

                {bulkCopiedCount > 0 && (
                  <button
                    onClick={() => setBulkCopiedSet(new Set())}
                    className="px-3 py-3 rounded-xl text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all"
                  >
                    Reset
                  </button>
                )}

                <button
                  onClick={() => bulkImageInputRef.current?.click()}
                  className="px-5 py-3 rounded-xl text-[13px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20 hover:bg-amber-500/25 transition-all flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Upload MJ Images
                </button>
                <input ref={bulkImageInputRef} type="file" accept="image/*" multiple onChange={handleBulkImageUpload} className="hidden" />
              </div>
            </div>
          )}

          {/* ── Mockup Templates (shared across all bulk items) ── */}
          {bulkItems.length > 0 && (bulkStats.prompted > 0 || bulkStats.uploaded > 0 || bulkStats.review > 0 || bulkStats.approved > 0) && (
            <div className="bg-[var(--bg-elevated)] border border-pink-500/20 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[14px] font-semibold text-pink-400 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Custom Mockup Templates
                </h3>
                <span className="text-[10px] text-[var(--text-muted)]">{bulkTemplates.length} template{bulkTemplates.length !== 1 ? "s" : ""} • applied to all designs</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mb-4">
                Upload your own room/frame mockup scenes. Position where the art goes, set clip shape & size. every design in the pipeline will be composited onto these templates automatically.
              </p>

              {/* Template preview grid + upload button */}
              <div className="flex flex-wrap gap-3 mb-4">
                {bulkTemplates.map((tpl, idx) => (
                  <div
                    key={tpl.id}
                    onClick={() => setBulkEditingIdx(idx)}
                    className={`relative w-36 rounded-xl overflow-hidden border group cursor-pointer transition-all ${
                      bulkEditingIdx === idx ? "border-pink-500 ring-2 ring-pink-500/30" : "border-[var(--border-default)] hover:border-pink-500/40"
                    }`}
                  >
                    <img src={tpl.previewUrl} alt="Template" className="w-full h-24 object-cover" />
                    <div className="px-2 py-1.5 bg-[var(--bg-elevated)]">
                      <p className="text-[10px] text-[var(--text-primary)] font-medium">Template {idx + 1}</p>
                      {tpl.detecting && <span className="text-[8px] text-amber-400">Detecting frame...</span>}
                      {!tpl.detecting && tpl.frameCorners && <span className="text-[8px] text-emerald-400">Frame detected ✓</span>}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeBulkTemplate(tpl.id); }}
                      className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => bulkTemplateInputRef.current?.click()}
                  className="w-36 h-[112px] border-2 border-dashed border-[var(--border-default)] rounded-xl flex flex-col items-center justify-center gap-2 hover:border-pink-500/30 bg-[var(--bg-surface)] transition-all"
                >
                  <svg className="w-7 h-7 text-pink-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-[10px] text-[var(--text-muted)]">Add mockup scene</span>
                </button>
                <input ref={bulkTemplateInputRef} type="file" accept="image/*" multiple onChange={handleBulkTemplateUpload} className="hidden" />
              </div>

              {/* ── Position Editor ── */}
              {bulkEditingIdx !== null && bulkTemplates[bulkEditingIdx] && (
                <div className="bg-black/20 border border-[var(--border-default)] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[var(--text-primary)] font-semibold text-[13px]">Position Art on Template {bulkEditingIdx + 1}</h4>
                    <button
                      onClick={() => setBulkEditingIdx(null)}
                      className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[11px]"
                    >Close</button>
                  </div>

                  {/* Drag preview area */}
                  <div
                    className="relative mx-auto rounded-xl overflow-hidden border border-[var(--border-subtle)] select-none bg-black/30"
                    style={{ width: 380, height: 380, cursor: bulkDragging ? "grabbing" : "grab" }}
                    onMouseDown={(e) => {
                      setBulkDragging(true);
                      const rect = e.currentTarget.getBoundingClientRect();
                      const onMove = (ev: MouseEvent) => {
                        const nx = ((ev.clientX - rect.left) / rect.width) * 100;
                        const ny = ((ev.clientY - rect.top) / rect.height) * 100;
                        setBulkArtPos((p) => ({ ...p, x: Math.max(5, Math.min(95, nx)), y: Math.max(5, Math.min(95, ny)) }));
                      };
                      const onUp = () => { setBulkDragging(false); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
                      window.addEventListener("mousemove", onMove);
                      window.addEventListener("mouseup", onUp);
                    }}
                    onTouchStart={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const onMove = (ev: TouchEvent) => {
                        const t = ev.touches[0];
                        const nx = ((t.clientX - rect.left) / rect.width) * 100;
                        const ny = ((t.clientY - rect.top) / rect.height) * 100;
                        setBulkArtPos((p) => ({ ...p, x: Math.max(5, Math.min(95, nx)), y: Math.max(5, Math.min(95, ny)) }));
                      };
                      const onEnd = () => { window.removeEventListener("touchmove", onMove); window.removeEventListener("touchend", onEnd); };
                      window.addEventListener("touchmove", onMove);
                      window.addEventListener("touchend", onEnd);
                    }}
                  >
                    {/* Template background */}
                    <img
                      src={bulkTemplates[bulkEditingIdx].previewUrl}
                      alt="Template"
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                      draggable={false}
                    />
                    {/* Art placement overlay */}
                    {(() => {
                      const isCircle = bulkClipShape === "circle";
                      const w = bulkArtPos.scale;
                      const h = isCircle ? bulkArtPos.scale : bulkArtPos.scale * 1.2;
                      return (
                        <div
                          className="absolute pointer-events-none border-2 border-dashed border-white/60"
                          style={{
                            width: `${w}%`,
                            height: `${h}%`,
                            left: `${bulkArtPos.x - w / 2}%`,
                            top: `${bulkArtPos.y - h / 2}%`,
                            borderRadius: isCircle ? "50%" : "4px",
                            background: "rgba(168, 85, 247, 0.15)",
                            backdropFilter: "blur(1px)",
                          }}
                        >
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[10px] text-white/70 font-medium bg-black/30 px-2 py-0.5 rounded">
                              {isCircle ? "⊕" : "▢"} Art here
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                    {/* Center crosshair */}
                    <div className="absolute pointer-events-none" style={{ left: `${bulkArtPos.x}%`, top: `${bulkArtPos.y}%`, transform: "translate(-50%,-50%)" }}>
                      <div className="w-3 h-3 border-2 border-white/80 rounded-full shadow-lg" />
                    </div>
                    {/* Frame detection overlay */}
                    {bulkTemplates[bulkEditingIdx].frameCorners && (
                      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <polygon
                          points={bulkTemplates[bulkEditingIdx].frameCorners!.map(c => `${c.x * 100},${c.y * 100}`).join(" ")}
                          fill="none"
                          stroke="rgba(52, 211, 153, 0.5)"
                          strokeWidth="0.5"
                          strokeDasharray="2,2"
                        />
                      </svg>
                    )}
                  </div>

                  {/* Controls */}
                  <div className="mt-3 space-y-2">
                    {/* Size slider */}
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-[var(--text-muted)] w-12">Size</span>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        value={bulkArtPos.scale}
                        onChange={(e) => setBulkArtPos((p) => ({ ...p, scale: Number(e.target.value) }))}
                        className="flex-1 accent-pink-500"
                      />
                      <span className="text-[11px] text-[var(--text-primary)] font-mono w-10">{bulkArtPos.scale}%</span>
                    </div>

                    {/* Clip shape toggle */}
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-[var(--text-muted)] w-12">Shape</span>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setBulkClipShape("circle")}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1.5 ${
                            bulkClipShape === "circle"
                              ? "bg-pink-500/20 text-pink-300 border border-pink-500/40"
                              : "bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-default)] hover:text-[var(--text-primary)]"
                          }`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="9" strokeWidth={2} />
                          </svg>
                          Circle
                        </button>
                        <button
                          onClick={() => setBulkClipShape("rectangle")}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1.5 ${
                            bulkClipShape === "rectangle"
                              ? "bg-pink-500/20 text-pink-300 border border-pink-500/40"
                              : "bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-default)] hover:text-[var(--text-primary)]"
                          }`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <rect x="4" y="4" width="16" height="16" rx="1" strokeWidth={2} />
                          </svg>
                          Rectangle
                        </button>
                      </div>
                    </div>

                    {/* Remove background toggle */}
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-[var(--text-muted)] w-12">BG</span>
                      <button
                        onClick={() => setBulkRemoveBg(!bulkRemoveBg)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1.5 ${
                          bulkRemoveBg
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : "bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-default)]"
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {bulkRemoveBg ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          )}
                        </svg>
                        {bulkRemoveBg ? "Remove background" : "Keep background"}
                      </button>
                    </div>

                    {/* Use detected frame button */}
                    {bulkTemplates[bulkEditingIdx].frameCorners && (
                      <button
                        onClick={() => {
                          const corners = bulkTemplates[bulkEditingIdx].frameCorners!;
                          const minX = Math.min(...corners.map(c => c.x));
                          const maxX = Math.max(...corners.map(c => c.x));
                          const minY = Math.min(...corners.map(c => c.y));
                          const maxY = Math.max(...corners.map(c => c.y));
                          const cx = ((minX + maxX) / 2) * 100;
                          const cy = ((minY + maxY) / 2) * 100;
                          const scale = (maxX - minX) * 100;
                          setBulkArtPos({ x: cx, y: cy, scale: Math.min(95, Math.max(10, scale)) });
                        }}
                        className="w-full py-2 rounded-lg text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all flex items-center justify-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                        </svg>
                        Snap to Detected Frame
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Quick info if templates loaded but no editor open */}
              {bulkTemplates.length > 0 && bulkEditingIdx === null && (
                <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] bg-black/10 rounded-lg px-3 py-2">
                  <svg className="w-3.5 h-3.5 text-pink-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Click a template to adjust position & size. All patterns will be composited at the configured position.
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Process All ── */}
          {bulkStats.uploaded > 0 && (
            <div className="bg-[var(--bg-elevated)] border border-emerald-500/20 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[14px] font-semibold text-emerald-400 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center text-[11px] font-bold">3</span>
                  Convert & Generate Mockups
                </h3>
                <span className="text-[11px] text-[var(--text-muted)]">{bulkStats.uploaded} ready to process</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mb-4">
                Each design gets: converted to cross-stitch pattern → hoop mockups rendered → listing images generated → AI writes title/description/tags → trademark check. <span className="text-amber-400 font-medium">Nothing is listed yet. you review everything first.</span>
              </p>
              <button
                onClick={runBulkPipeline}
                disabled={bulkProcessing}
                className="btn-amber text-[14px] py-3.5 px-6"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Process {bulkStats.uploaded} designs → Review
              </button>
            </div>
          )}

          {/* ── Step 4: Review reminder ── */}
          {bulkStats.review > 0 && (
            <div className="bg-[var(--bg-elevated)] border border-amber-500/20 rounded-xl p-5">
              <h3 className="text-[14px] font-semibold text-amber-400 flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center text-[11px] font-bold">4</span>
                Review & Approve ({bulkStats.review} awaiting review)
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Check each design below: verify the mockups look good, edit the title/description/tags, fix any trademark issues, then click <strong className="text-emerald-400">Approve</strong>.
              </p>
            </div>
          )}

          {/* ── Step 5: List Approved on Etsy ── */}
          {bulkStats.approved > 0 && (
            <div className="bg-[var(--bg-elevated)] border border-emerald-500/20 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[14px] font-semibold text-emerald-400 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center text-[11px] font-bold">5</span>
                  List on Etsy
                </h3>
                <span className="text-[11px] text-emerald-400 font-medium">{bulkStats.approved} approved, ready to go LIVE</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mb-4">
                Each listing will be created with all mockup images, PDF digital file, and activated LIVE on your Etsy shop.
              </p>
              <button
                onClick={listApprovedBulk}
                disabled={bulkProcessing}
                className="px-6 py-3.5 rounded-xl text-[14px] font-bold bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-400 hover:to-orange-500 disabled:opacity-40 transition-all flex items-center gap-2 shadow-lg shadow-orange-500/20"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                </svg>
                List {bulkStats.approved} Approved on Etsy
              </button>
            </div>
          )}

          {/* ── Pipeline Items Grid ── */}
          {bulkItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">All Designs ({bulkItems.length})</h3>
                <div className="flex items-center gap-3">
                  {/* Reset every processed item (review/approved/listed) back
                   * to "image_uploaded" in one click. Covers the case where
                   * the pipeline ran but produced incomplete assets (no AI
                   * mockups because of the earlier blob-URL bug, etc.) and
                   * the user wants to redo everything without clicking
                   * Redo/Regenerate on each card. Items still in earlier
                   * stages (selected/prompt_ready/image_uploaded) are left
                   * alone — nothing to regenerate yet. Creates NEW Etsy
                   * listings on the next run — old ones stay put. */}
                  {(() => {
                    const resetableStages: BulkStage[] = ["review", "approved", "listed"];
                    const resetable = bulkItems.filter((b) => resetableStages.includes(b.stage));
                    if (resetable.length === 0) return null;
                    const totalCost = (resetable.length * 0.42).toFixed(2);
                    return (
                      <button
                        onClick={() => {
                          if (!confirm(
                            `Regenerate all ${resetable.length} items with the FULL pipeline?\n\n` +
                            `• Re-runs: Convert → 6 AI mockups → video → 5 PDFs → AI copy\n` +
                            `• Estimated AI mockup cost: ~$${totalCost} (${resetable.length} × ~$0.42)\n` +
                            `• Any LIVE listings stay in your shop (delete manually if you want) — this creates NEW ones\n\n` +
                            `Then click "Process Queue" to run.`
                          )) return;
                          for (const b of resetable) regenerateBulkItem(b.id);
                        }}
                        disabled={bulkProcessing}
                        className="text-[10px] font-semibold text-amber-400 hover:text-amber-300 disabled:opacity-40 transition-colors flex items-center gap-1"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Regenerate all {resetable.length}
                      </button>
                    );
                  })()}
                  <button
                    onClick={() => setBulkItems([])}
                    className="text-[10px] text-[var(--text-muted)] hover:text-red-400 transition-colors"
                  >
                    Clear all
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {bulkItems.map((item) => {
                  const stageColors: Record<BulkStage, string> = {
                    selected: "border-gray-500/20 bg-gray-500/5",
                    prompt_ready: "border-blue-500/20 bg-blue-500/5",
                    image_uploaded: "border-amber-500/20 bg-amber-500/5",
                    converted: "border-purple-500/20 bg-purple-500/5",
                    mockup_done: "border-pink-500/20 bg-pink-500/5",
                    review: "border-amber-500/30 bg-amber-500/10",
                    approved: "border-emerald-500/20 bg-emerald-500/5",
                    listed: "border-emerald-500/30 bg-emerald-500/10",
                  };
                  const stageLabels: Record<BulkStage, string> = {
                    selected: "Pending",
                    prompt_ready: "Prompt Ready",
                    image_uploaded: "Image Ready",
                    converted: "Converting...",
                    mockup_done: "Generating...",
                    review: "REVIEW",
                    approved: "APPROVED",
                    listed: "LIVE",
                  };
                  const badgeColor: Record<BulkStage, string> = {
                    selected: "bg-gray-500/20 text-gray-400",
                    prompt_ready: "bg-blue-500/20 text-blue-400",
                    image_uploaded: "bg-amber-500/20 text-amber-400",
                    converted: "bg-purple-500/20 text-purple-400",
                    mockup_done: "bg-pink-500/20 text-pink-400",
                    review: "bg-amber-500/20 text-amber-400",
                    approved: "bg-emerald-500/20 text-emerald-400",
                    listed: "bg-emerald-500/30 text-emerald-300",
                  };

                  return (
                    <div key={item.id} className={`rounded-xl border p-4 transition-all ${stageColors[item.stage]} ${item.processing ? "animate-pulse" : ""}`}>
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-start gap-2 min-w-0">
                          {item.imagePreview && (
                            <img src={item.imagePreview} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <h4 className="text-[12px] font-semibold text-[var(--text-primary)] truncate">{item.trend.title}</h4>
                            <p className="text-[10px] text-[var(--text-muted)] line-clamp-1">{item.trend.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${badgeColor[item.stage]}`}>
                            {stageLabels[item.stage]}
                          </span>
                          <button onClick={() => removeBulkItem(item.id)} className="text-[var(--text-muted)] hover:text-red-400 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Stage progress dots */}
                      <div className="flex items-center gap-1 mb-2">
                        {(["selected", "prompt_ready", "image_uploaded", "converted", "mockup_done", "listed"] as BulkStage[]).map((s, idx) => {
                          const stages: BulkStage[] = ["selected", "prompt_ready", "image_uploaded", "converted", "mockup_done", "listed"];
                          const currentIdx = stages.indexOf(item.stage);
                          const filled = idx <= currentIdx;
                          return (
                            <div key={s} className="flex items-center gap-1">
                              <div className={`w-2 h-2 rounded-full transition-all ${filled ? "bg-emerald-500" : "bg-white/10"}`} />
                              {idx < 5 && <div className={`w-3 h-0.5 ${filled && idx < currentIdx ? "bg-emerald-500/50" : "bg-white/5"}`} />}
                            </div>
                          );
                        })}
                      </div>

                      {/* MJ Prompt (if generated) */}
                      {item.mjPrompt && item.stage === "prompt_ready" && (
                        <div className={`rounded-lg p-2 mb-2 relative group/prompt ${bulkCopiedSet.has(item.id) ? "bg-emerald-500/10 border border-emerald-500/15" : "bg-black/20"}`}>
                          {bulkCopiedSet.has(item.id) && (
                            <div className="absolute top-1.5 left-2 flex items-center gap-1">
                              <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                              <span className="text-[8px] text-emerald-400 font-semibold">COPIED</span>
                            </div>
                          )}
                          <p className={`text-[9px] font-mono line-clamp-2 pr-14 ${bulkCopiedSet.has(item.id) ? "text-emerald-300/60 mt-3" : "text-[var(--text-muted)]"}`}>{item.mjPrompt}</p>
                          <button
                            onClick={(e) => { e.stopPropagation(); copySingleBulkPrompt(item.id); }}
                            className={`absolute top-1.5 right-1.5 px-2 py-0.5 rounded text-[9px] font-semibold transition-all ${
                              bulkCopied === item.id
                                ? "bg-emerald-500/20 text-emerald-400"
                                : bulkCopiedSet.has(item.id)
                                ? "bg-emerald-500/15 text-emerald-400/60"
                                : "bg-purple-500/15 text-purple-400"
                            }`}
                          >
                            {bulkCopied === item.id ? "Copied!" : bulkCopiedSet.has(item.id) ? "Re-copy" : "Copy"}
                          </button>
                        </div>
                      )}

                      {/* Title options (if generated) */}
                      {item.titleOptions.length > 0 && (
                        <div className="space-y-1 mb-2">
                          {item.titleOptions.map((t, ti) => (
                            <button
                              key={ti}
                              onClick={() => setBulkItems((prev) => prev.map((b) => b.id === item.id ? { ...b, selectedTitle: t } : b))}
                              className={`w-full text-left px-2 py-1 rounded text-[9px] transition-all ${
                                item.selectedTitle === t
                                  ? "bg-purple-500/15 text-purple-300 border border-purple-500/30"
                                  : "bg-white/5 text-[var(--text-muted)] hover:bg-white/10"
                              }`}
                            >
                              {t}
                              <span className="ml-1 text-[8px] opacity-50">{t.length}ch</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Individual image upload for this item */}
                      {item.stage === "prompt_ready" && !item.imagePreview && (
                        <label className="block border border-dashed border-[var(--border-default)] rounded-lg p-2 text-center cursor-pointer hover:border-amber-500/30 transition-all">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) assignImageToBulkItem(item.id, f);
                              e.target.value = "";
                            }}
                          />
                          <span className="text-[10px] text-[var(--text-muted)]">Drop image here</span>
                        </label>
                      )}

                      {/* Error */}
                      {item.error && (
                        <div className="text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-1 mt-1">{item.error}</div>
                      )}

                      {/* Listed - success */}
                      {/* ── Review panel ── */}
                      {(item.stage === "review" || item.stage === "approved") && (
                        <div className="mt-2 space-y-2">
                          {/* Mockup previews. scrollable, clickable for full-size.
                            * Each image has an X to delete and a ⇧ to promote to
                            * the hero (first) slot. First 10 get a green ring +
                            * numbered badge so the user can tell at a glance which
                            * will actually be uploaded to Etsy — the rest are
                            * dimmed with a "won't upload" overlay. */}
                          {item.mockupUrls && item.mockupUrls.length > 0 && (
                            <div>
                              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                                {item.mockupUrls.map((url, mi) => {
                                  const willUpload = mi < 10;
                                  const isHero = mi === 0;
                                  return (
                                    <div key={mi} className="relative flex-shrink-0 group">
                                      <img
                                        src={url}
                                        alt={`Mockup ${mi + 1}`}
                                        onClick={() => openLightbox(item.mockupUrls!, mi)}
                                        className={`h-32 w-32 object-cover rounded-lg border-2 cursor-pointer hover:scale-[1.03] transition-all ${
                                          isHero
                                            ? "border-amber-400 ring-2 ring-amber-400/40"
                                            : willUpload
                                            ? "border-emerald-500/60"
                                            : "border-[var(--border-default)] opacity-40 grayscale"
                                        }`}
                                      />
                                      {/* Slot number badge. Amber for hero, emerald
                                        * for slots 2–10, gray for "won't upload". */}
                                      <span
                                        className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-bold pointer-events-none ${
                                          isHero
                                            ? "bg-amber-400 text-black"
                                            : willUpload
                                            ? "bg-emerald-500 text-white"
                                            : "bg-gray-700 text-gray-300"
                                        }`}
                                      >
                                        {isHero ? "HERO" : willUpload ? mi + 1 : "—"}
                                      </span>
                                      {/* Remove X — click stops propagation so the
                                        * image doesn't also open the lightbox. */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeBulkImage(item.id, mi);
                                        }}
                                        title="Remove this image"
                                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                      >
                                        ×
                                      </button>
                                      {/* Promote to hero — only show on non-hero
                                        * slots. Makes this image the Etsy thumb. */}
                                      {!isHero && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            promoteBulkImage(item.id, mi);
                                          }}
                                          title="Make this the hero image (Etsy thumbnail)"
                                          className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-black text-[9px] font-bold opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                        >
                                          ★ Hero
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <span
                                  className={`text-[9px] font-medium ${
                                    item.mockupUrls.length > 10 ? "text-amber-400" : "text-emerald-400"
                                  }`}
                                >
                                  {Math.min(item.mockupUrls.length, 10)} / 10 going to Etsy
                                  {item.mockupUrls.length > 10 && (
                                    <span className="ml-1 text-[var(--text-muted)]">
                                      ({item.mockupUrls.length - 10} extra — remove with ×)
                                    </span>
                                  )}
                                </span>
                                <span className="text-[8px] text-[var(--text-muted)]">Hover to × remove or ★ set hero</span>
                              </div>
                              {/* Asset readiness chips — mirror what the single-item
                                * flow ships (AI mockups, video, 5-PDF bundle) so the
                                * user can confirm bulk matches single before approving.
                                * Missing badges = "didn't generate" — a no-surprise
                                * signal before publishing. */}
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                {item.gptMockups && item.gptMockups.length > 0 && (
                                  <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-semibold">
                                    {item.gptMockups.length}× AI mockups
                                  </span>
                                )}
                                {item.videoDataUrl && (
                                  <span className="text-[8px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 font-semibold">
                                    Listing video ready
                                  </span>
                                )}
                                {item.pdfBundle && item.pdfBundle.length > 0 && (
                                  <span className="text-[8px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-semibold">
                                    {item.pdfBundle.length}× PDFs
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Editable title */}
                          <div>
                            <label className="text-[9px] text-[var(--text-muted)]">Title ({item.selectedTitle.length}/140)</label>
                            <input
                              value={item.selectedTitle}
                              onChange={(e) => updateBulkItem(item.id, "selectedTitle", e.target.value)}
                              maxLength={140}
                              className="w-full px-2 py-1.5 rounded text-[10px] bg-black/20 border border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:border-purple-500/40"
                            />
                          </div>

                          {/* Editable description */}
                          <div>
                            <label className="text-[9px] text-[var(--text-muted)]">Description</label>
                            <textarea
                              value={item.description}
                              onChange={(e) => updateBulkItem(item.id, "description", e.target.value)}
                              rows={3}
                              className="w-full px-2 py-1.5 rounded text-[9px] bg-black/20 border border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:border-purple-500/40 resize-none"
                            />
                          </div>

                          {/* Editable tags */}
                          <div>
                            <label className="text-[9px] text-[var(--text-muted)]">Tags (13 comma-separated)</label>
                            <input
                              value={item.tags}
                              onChange={(e) => updateBulkItem(item.id, "tags", e.target.value)}
                              className="w-full px-2 py-1.5 rounded text-[9px] bg-black/20 border border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:border-purple-500/40"
                            />
                          </div>

                          {/* Price */}
                          <div className="flex items-center gap-2">
                            <label className="text-[9px] text-[var(--text-muted)]">Price $</label>
                            <input
                              value={item.suggestedPrice}
                              onChange={(e) => updateBulkItem(item.id, "suggestedPrice", e.target.value)}
                              type="number" step="0.01"
                              className="w-20 px-2 py-1 rounded text-[10px] bg-black/20 border border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:border-purple-500/40"
                            />
                          </div>

                          {/* Trademark warnings */}
                          {item.trademarkWarnings && item.trademarkWarnings.length > 0 && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 space-y-1">
                              <div className="text-[9px] font-bold text-red-400">Trademark Warnings:</div>
                              {item.trademarkWarnings.map((w, wi) => (
                                <div key={wi} className="flex items-center gap-1.5 text-[9px]">
                                  <span className={`px-1 py-0.5 rounded text-[8px] font-bold ${w.risk === "high" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"}`}>{w.risk}</span>
                                  <span className="text-[var(--text-muted)]">&ldquo;{w.term}&rdquo;</span>
                                  <span className="text-emerald-400">→ {w.suggestion}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Approve / Unapprove button */}
                          {item.stage === "review" && (
                            <button
                              onClick={() => approveBulkItem(item.id)}
                              disabled={!item.selectedTitle || (item.trademarkWarnings || []).some((w) => w.risk === "high")}
                              className="w-full py-2 rounded-lg text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                              Approve for listing
                            </button>
                          )}
                          {item.stage === "approved" && (
                            <div className="flex items-center gap-2 py-1.5">
                              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                              <span className="text-[11px] text-emerald-400 font-bold">Approved. ready to list</span>
                              <button
                                onClick={() => setBulkItems((prev) => prev.map((b) => b.id === item.id ? { ...b, stage: "review" as BulkStage, approved: false } : b))}
                                className="text-[9px] text-[var(--text-muted)] hover:text-amber-400 ml-auto"
                              >
                                Edit
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {item.stage === "listed" && item.listingId && (
                        <div className="mt-1 space-y-1.5">
                          <div className="flex items-center gap-2 bg-emerald-500/10 rounded-lg px-2 py-1.5">
                            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-[10px] text-emerald-400 font-semibold">LIVE. ID: {item.listingId}</span>
                            <a
                              href={`https://www.etsy.com/listing/${item.listingId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-auto text-[9px] text-emerald-400/80 hover:text-emerald-300 underline"
                            >
                              View on Etsy ↗
                            </a>
                          </div>
                          {/* Regenerate through the FIXED full pipeline so this
                           * item gets the asset bundle the OLD bulk flow skipped
                           * (6 AI mockups, listing video, 5 PDFs) and publishes
                           * LIVE instead of silently landing in DRAFT.
                           *
                           * Clicking this creates a NEW Etsy listing — the old
                           * one stays where it is (delete it manually from your
                           * shop if you want to clean up). */}
                          <button
                            onClick={() => {
                              if (!confirm(
                                `Regenerate "${item.selectedTitle.slice(0, 60)}" with the FULL pipeline?\n\n` +
                                `This will:\n` +
                                `• Re-run: Convert → 6 AI lifestyle mockups (~$0.42) → 12s listing video → all 5 PDFs → AI listing copy\n` +
                                `• Create a NEW Etsy listing (the old one stays, you can delete it manually)\n\n` +
                                `Then click "Process Queue" to run it, review, and list.`
                              )) return;
                              regenerateBulkItem(item.id);
                            }}
                            className="w-full py-1.5 rounded-lg text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 hover:border-amber-500/50 transition-all flex items-center justify-center gap-1.5"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Regenerate with full pipeline
                          </button>
                        </div>
                      )}
                      {/* Regenerate option available on review/approved too, in
                       * case the user wants to redo the mockups/PDFs before the
                       * listing goes out (e.g. the AI mockups didn't look right).
                       * Same behavior: clears generated assets and drops back to
                       * "image_uploaded" so Process Queue re-runs the pipeline. */}
                      {(item.stage === "review" || item.stage === "approved") && (
                        <button
                          onClick={() => {
                            if (!confirm(
                              `Regenerate "${item.selectedTitle.slice(0, 60)}" with the FULL pipeline?\n\n` +
                              `• Clears current mockups/video/PDFs\n` +
                              `• Re-runs: Convert → 6 AI mockups (~$0.42) → video → 5 PDFs → AI copy\n\n` +
                              `Then click "Process Queue" to run it.`
                            )) return;
                            regenerateBulkItem(item.id);
                          }}
                          className="mt-1.5 w-full py-1.5 rounded-lg text-[10px] font-semibold bg-black/20 text-[var(--text-muted)] border border-[var(--border-default)] hover:text-amber-400 hover:border-amber-500/30 transition-all flex items-center justify-center gap-1.5"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Redo with full pipeline
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Revenue Projections ── */}
          {bulkStats.listed > 0 && (
            <div className="bg-gradient-to-r from-emerald-900/20 to-teal-900/20 border border-emerald-500/20 rounded-2xl p-6">
              <h3 className="text-[16px] font-bold text-emerald-400 mb-4">Revenue Projections</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-black/20 rounded-xl p-4 text-center">
                  <div className="text-[24px] font-bold text-white">{bulkStats.listed}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Active Listings</div>
                </div>
                <div className="bg-black/20 rounded-xl p-4 text-center">
                  <div className="text-[24px] font-bold text-emerald-400">${(bulkStats.listed * CROSS_STITCH_LISTING_PRICE_NUMBER * 30).toFixed(0)}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Monthly (if 1 sale/day each)</div>
                </div>
                <div className="bg-black/20 rounded-xl p-4 text-center">
                  <div className="text-[24px] font-bold text-amber-400">${(bulkStats.listed * CROSS_STITCH_LISTING_PRICE_NUMBER * 365).toFixed(0)}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Yearly Potential</div>
                </div>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-3 text-center">
                Based on flat ${CROSS_STITCH_LISTING_PRICE}/pattern. Top sellers report 5-20+ sales/day per trending design.
              </p>
            </div>
          )}
        </div>
      )}
      {/* ── Lightbox Modal ── */}
      {lightboxOpen && lightboxImages.length > 0 && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}
        >
          {/* Close button */}
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-all z-10"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Image counter */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 px-4 py-1.5 rounded-full text-white text-[13px] font-medium z-10">
            {lightboxIdx + 1} / {lightboxImages.length}
          </div>

          {/* Prev button */}
          {lightboxImages.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIdx((p) => (p - 1 + lightboxImages.length) % lightboxImages.length); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-all z-10"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* Main image */}
          <img
            src={lightboxImages[lightboxIdx]}
            alt={`Image ${lightboxIdx + 1}`}
            onClick={(e) => e.stopPropagation()}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl shadow-2xl"
          />

          {/* Next button */}
          {lightboxImages.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIdx((p) => (p + 1) % lightboxImages.length); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-all z-10"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          {/* Thumbnail strip */}
          {lightboxImages.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-black/60 p-2 rounded-xl max-w-[90vw] overflow-x-auto">
              {lightboxImages.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`Thumb ${i + 1}`}
                  onClick={(e) => { e.stopPropagation(); setLightboxIdx(i); }}
                  className={`w-14 h-14 flex-shrink-0 object-cover rounded-lg cursor-pointer transition-all ${
                    i === lightboxIdx ? "ring-2 ring-purple-500 opacity-100" : "opacity-50 hover:opacity-80"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
