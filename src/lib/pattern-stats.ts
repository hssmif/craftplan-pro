// Derived statistics from a finished cross-stitch pattern.
//
// Single source of truth for the numbers that appear in:
//   1. The convert-page "pattern generated" card (immediate feedback
//      after conversion).
//   2. The Etsy listing description / PDF cover (export step).
//
// Everything here is pure math on a shape that matches PatternData
// (grid + colors + width/height/totalStitches). No API calls, no
// side effects — safe to call in a render pass or on the server.
//
// Why these three metrics specifically:
//   - Finished size: top-filter on Etsy ("show me 8×10 patterns").
//     Buyers need to know the physical dimensions before they buy
//     aida cloth and a frame.
//   - Difficulty: Etsy buyers filter listings by beginner / intermediate
//     / advanced. Getting this right avoids bad reviews from a
//     beginner who thought they were buying a 5-color pattern.
//   - Stitching time: appears in ~70% of top-seller cross-stitch
//     listings. Buyers use it to estimate gift delivery / project
//     planning. We quote a range because one stitcher's 30 hours is
//     another's 50.

/** Structural subset of PatternData that the stats functions need.
 *  Kept loose so this helper can accept any pattern-shaped object
 *  without coupling to the interface in cross-stitch/page.tsx. */
export interface PatternLike {
  width: number;
  height: number;
  totalStitches: number;
  colors: Array<{ dmc: string; count: number }>;
  backgroundDmc?: string;
}

/** One aida-count size entry: width × height in both inches and cm.
 *  Numbers are rounded to 1 decimal — the level of precision that
 *  makes sense for a sewn-on-fabric dimension (cm precision beyond
 *  0.1 is noise once the piece is framed). */
export interface FinishedSize {
  count: 11 | 14 | 16 | 18;
  inchesW: number;
  inchesH: number;
  cmW: number;
  cmH: number;
  /** Human-readable label, e.g. `9.1" × 9.1"  (23.1 × 23.1 cm)`. */
  label: string;
}

/** Discrete difficulty buckets. Labels match Etsy's commonly-used
 *  filter vocabulary so the listing can map 1:1 without translation. */
export type DifficultyLabel =
  | "Beginner"
  | "Easy"
  | "Intermediate"
  | "Advanced"
  | "Expert";

export interface Difficulty {
  label: DifficultyLabel;
  /** 0-12 composite score. Exposed for callers that want to show a
   *  progress-bar style indicator instead of just the label. */
  score: number;
  /** Single-emoji visual badge for the UI. Intentionally neutral —
   *  nothing "hard" sounding, since it appears on the seller's own
   *  dashboard too. */
  emoji: string;
  /** Tailwind color token root, e.g. "emerald" or "amber". Lets the
   *  UI pick `text-emerald-400 bg-emerald-500/10` without this file
   *  knowing anything about CSS. */
  colorToken: "emerald" | "sky" | "amber" | "orange" | "rose";
  /** One-line plain-English reason — shown as a tooltip. */
  rationale: string;
}

/** Hours range for a typical stitcher. We quote min–max because
 *  stitch-speed varies ~3× between a distracted beginner and a
 *  practiced stitcher watching TV; a single number would be wrong
 *  for most readers. */
export interface StitchingTime {
  minHours: number;
  maxHours: number;
  /** Human-readable, e.g. "14–28 hours". */
  label: string;
  /** True when the range would span an unrealistic number of hours
   *  (≥100 min-bound). In those cases the UI should switch to days/
   *  weeks framing — 200 hours reads as "never" to most buyers. */
  isLarge: boolean;
}

/** How many non-background DMC threads the pattern actually uses.
 *  Background cells are stitched with the aida thread and so aren't
 *  a "thread change" for the stitcher. */
export function countUsedColors(pattern: PatternLike): number {
  return pattern.colors.filter((c) => c.dmc !== pattern.backgroundDmc).length;
}

/** Finished size at a single aida count. Formula:
 *    inches = grid_stitches / aida_count
 *    cm     = inches × 2.54
 *  Aida count = stitches-per-inch on the fabric. Standard retail
 *  counts are 11, 14 (most common beginner default), 16, and 18. */
export function finishedSize(
  pattern: PatternLike,
  count: 11 | 14 | 16 | 18
): FinishedSize {
  const inchesW = pattern.width / count;
  const inchesH = pattern.height / count;
  const cmW = inchesW * 2.54;
  const cmH = inchesH * 2.54;
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    count,
    inchesW: round(inchesW),
    inchesH: round(inchesH),
    cmW: round(cmW),
    cmH: round(cmH),
    label: `${round(inchesW)}" × ${round(inchesH)}"  (${round(cmW)} × ${round(cmH)} cm)`,
  };
}

/** All four standard aida counts, in ascending density (bigger count
 *  = smaller finished piece). This is the full "buyer picks their
 *  preferred size" lookup the listing description needs. */
export function allFinishedSizes(pattern: PatternLike): FinishedSize[] {
  return ([11, 14, 16, 18] as const).map((ct) => finishedSize(pattern, ct));
}

/** Composite difficulty rating.
 *
 *  Scoring philosophy: difficulty for a cross-stitcher is driven by
 *  THREE independent factors, each roughly equal weight:
 *
 *    1. Color count — each thread is a separate needle-threading
 *       operation and a row in the legend they have to consult.
 *    2. Grid size (longest side) — determines total visual complexity
 *       and the chance of miscounting a row.
 *    3. Total stitches — determines raw hours-to-finish, which
 *       influences "will I abandon this" drop-off.
 *
 *  Each factor contributes 0-4 points; total 0-12.
 *
 *  The buckets were calibrated against popular Etsy listings:
 *    - A 40×40 / 5-color / 1500-stitch pattern is clearly "Beginner".
 *    - A 100×100 / 15-color / 8000-stitch pattern is "Intermediate".
 *    - A 200×200 / 40-color / 30000-stitch pattern is "Expert".
 *
 *  Adjust thresholds here and everywhere re-renders — the UI doesn't
 *  hard-code any of these numbers. */
export function difficulty(pattern: PatternLike): Difficulty {
  const colors = countUsedColors(pattern);
  const gridLong = Math.max(pattern.width, pattern.height);
  const stitches = pattern.totalStitches;

  const colorScore =
    colors <= 5 ? 0 : colors <= 12 ? 1 : colors <= 20 ? 2 : colors <= 30 ? 3 : 4;
  const gridScore =
    gridLong <= 50 ? 0 : gridLong <= 80 ? 1 : gridLong <= 120 ? 2 : gridLong <= 160 ? 3 : 4;
  const stitchScore =
    stitches <= 2500 ? 0 : stitches <= 6000 ? 1 : stitches <= 12000 ? 2 : stitches <= 22000 ? 3 : 4;

  const score = colorScore + gridScore + stitchScore; // 0-12

  // Pick label + visuals from the composite. Rationale lists whichever
  // factor pushed the score up most — tells the seller *why* we rated
  // it that way so they can decide whether to simplify the pattern.
  const factors: Array<[string, number]> = [
    [`${colors} colors`, colorScore],
    [`${gridLong}-stitch longest side`, gridScore],
    [`${stitches.toLocaleString()} total stitches`, stitchScore],
  ];
  const topFactor = factors.reduce((a, b) => (b[1] > a[1] ? b : a));
  const rationale = `Score ${score}/12 — heaviest factor: ${topFactor[0]}`;

  if (score <= 2)
    return { label: "Beginner", score, emoji: "🌱", colorToken: "emerald", rationale };
  if (score <= 5)
    return { label: "Easy", score, emoji: "😊", colorToken: "sky", rationale };
  if (score <= 8)
    return { label: "Intermediate", score, emoji: "⭐", colorToken: "amber", rationale };
  if (score <= 10)
    return { label: "Advanced", score, emoji: "🔥", colorToken: "orange", rationale };
  return { label: "Expert", score, emoji: "👑", colorToken: "rose", rationale };
}

/** Stitching-time estimate.
 *
 *  Community-standard stitch-rates (from r/CrossStitch surveys and
 *  pattern-designer FAQs):
 *    - Beginner, careful, cross-referencing every stitch: ~400/hr
 *    - Experienced, watching TV, muscle memory: ~1000/hr
 *
 *  We quote the band between those two numbers. Real speeds spread
 *  further (a new stitcher with a complex 30-color pattern might be
 *  closer to 250/hr; a speedrunner doing a single-color design can
 *  hit 1500/hr), but the 400-1000 range covers ~80% of buyers and
 *  matches what top sellers quote in their listings. */
export function stitchingTime(pattern: PatternLike): StitchingTime {
  const BEGINNER_PER_HOUR = 400;
  const EXPERT_PER_HOUR = 1000;

  const minHours = Math.max(1, Math.round(pattern.totalStitches / EXPERT_PER_HOUR));
  const maxHours = Math.max(1, Math.round(pattern.totalStitches / BEGINNER_PER_HOUR));
  const isLarge = minHours >= 100;

  // Switch to a days/weeks framing for huge patterns — 120–300 hours
  // reads as gibberish to most shoppers, but "2-4 weeks at 2hrs/day"
  // plants a realistic picture.
  let label: string;
  if (isLarge) {
    const minDays = Math.round(minHours / 2); // 2hrs/day
    const maxDays = Math.round(maxHours / 2);
    label = `${minDays}–${maxDays} days (at 2 hrs/day)`;
  } else if (minHours === maxHours) {
    label = `${minHours} hours`;
  } else {
    label = `${minHours}–${maxHours} hours`;
  }

  return { minHours, maxHours, label, isLarge };
}

/** One-shot stats bundle for convenience — the UI typically wants all
 *  three at once, and Node loaders hoist the individual functions so
 *  there's no cost to wrapping them. */
export interface PatternStats {
  colorCount: number;
  sizes: FinishedSize[];
  difficulty: Difficulty;
  time: StitchingTime;
}

export function computePatternStats(pattern: PatternLike): PatternStats {
  return {
    colorCount: countUsedColors(pattern),
    sizes: allFinishedSizes(pattern),
    difficulty: difficulty(pattern),
    time: stitchingTime(pattern),
  };
}
