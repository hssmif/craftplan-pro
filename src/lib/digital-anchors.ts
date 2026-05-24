// ══════════════════════════════════════════════════════════════════════
// Digital product anchor catalog — Etsy Marketplace Insights sweep
//
// Etsy has no "Digital Products" top-level category. Digital wares are
// scattered across all 15 of Etsy's categories. To get a clean buyer-
// demand signal across the ENTIRE digital surface area, we sweep
// Marketplace Insights with a curated list of anchor terms that span
// every major digital-product niche.
//
// Each anchor is a search term. When the user (or auto-sweep) visits
// /your/shops/me/marketplace-insights/search?query=<anchor>, the Phase 6
// content script captures:
//   • The anchor itself with exact monthly_searches + growth % + competition
//   • 9-10 related buyer-corroborated terms with their own metrics
//
// So 40 anchors → ~400 captured digital terms in one sweep.
//
// Anchors are grouped by the FACTORY pipeline that could build the
// resulting product. When market-pulse surfaces an idea matched to a
// niche, /research can suggest which factory to route to.
// ══════════════════════════════════════════════════════════════════════

export type AnchorNiche =
  | "planners"
  | "patterns-needle"
  | "wall-art"
  | "cut-files"
  | "templates"
  | "invitations"
  | "activity"
  | "apparel-designs"
  | "editorial-media"
  | "other-digital";

export interface AnchorTerm {
  /** Search term to feed into Marketplace Insights. Lowercase recommended. */
  term: string;
  /** Niche bucket — tells /research which factory pipeline to suggest. */
  niche: AnchorNiche;
  /** Short label shown in the UI grouping. */
  factoryHint: string;
}

export const NICHE_LABELS: Record<AnchorNiche, { emoji: string; label: string }> = {
  "planners":         { emoji: "📅", label: "Planners & Budgets" },
  "patterns-needle":  { emoji: "🧵", label: "Needle Patterns" },
  "wall-art":         { emoji: "🖼️", label: "Wall Art & Prints" },
  "cut-files":        { emoji: "✂️", label: "Cut Files & Clipart" },
  "templates":        { emoji: "📋", label: "Templates" },
  "invitations":      { emoji: "💌", label: "Invitations" },
  "activity":         { emoji: "🎨", label: "Activity & Coloring" },
  "apparel-designs":  { emoji: "👕", label: "Apparel Designs" },
  "editorial-media":  { emoji: "📸", label: "Editorial & Media" },
  "other-digital":    { emoji: "💾", label: "Other Digital" },
};

// ── The catalog ───────────────────────────────────────────────────────
// Curated to cover every major digital-product niche the user could
// produce. ~40 terms total. Add more here over time as we discover gaps.
//
// Rule of thumb: each term should be something a buyer would type in
// Etsy's search bar with INTENT TO PURCHASE a digital product. Avoid
// physical-product-only terms ("mug", "shirt") even if they cross over.
export const DIGITAL_ANCHORS: AnchorTerm[] = [
  // ── Planners & Budgets (spreadsheet factory + PDF/Goodnotes)
  { term: "digital planner",       niche: "planners", factoryHint: "PDF planner" },
  { term: "budget tracker",        niche: "planners", factoryHint: "Spreadsheet" },
  { term: "habit tracker",         niche: "planners", factoryHint: "PDF planner" },
  { term: "meal planner",          niche: "planners", factoryHint: "PDF planner" },
  { term: "paycheck budget",       niche: "planners", factoryHint: "Spreadsheet" },

  // ── Needle / Textile Patterns (cross-stitch factory + new ones)
  { term: "cross stitch pattern",  niche: "patterns-needle", factoryHint: "Cross-stitch" },
  { term: "embroidery pattern",    niche: "patterns-needle", factoryHint: "Embroidery (TBD)" },
  { term: "knitting pattern",      niche: "patterns-needle", factoryHint: "Pattern (TBD)" },
  { term: "crochet pattern",       niche: "patterns-needle", factoryHint: "Pattern (TBD)" },
  { term: "sewing pattern",        niche: "patterns-needle", factoryHint: "Pattern (TBD)" },

  // ── Wall Art (digital prints / printables)
  { term: "printable wall art",    niche: "wall-art", factoryHint: "Wall art" },
  { term: "digital print",         niche: "wall-art", factoryHint: "Wall art" },
  { term: "nursery printable",     niche: "wall-art", factoryHint: "Wall art" },
  { term: "boho wall art",         niche: "wall-art", factoryHint: "Wall art" },
  { term: "minimalist art print",  niche: "wall-art", factoryHint: "Wall art" },

  // ── Cut Files & Clipart (SVG factory / Cricut / sublimation)
  { term: "svg cut file",          niche: "cut-files", factoryHint: "SVG factory" },
  { term: "svg bundle",            niche: "cut-files", factoryHint: "SVG factory" },
  { term: "cricut svg",            niche: "cut-files", factoryHint: "SVG factory" },
  { term: "clipart png",           niche: "cut-files", factoryHint: "Clipart pack" },
  { term: "sublimation design",    niche: "cut-files", factoryHint: "Sublimation" },

  // ── Templates (Notion / Canva / business)
  { term: "notion template",       niche: "templates", factoryHint: "Notion" },
  { term: "canva template",        niche: "templates", factoryHint: "Canva" },
  { term: "instagram template",    niche: "templates", factoryHint: "Canva" },
  { term: "resume template",       niche: "templates", factoryHint: "Resume" },

  // ── Invitations (printable / editable)
  { term: "wedding invitation",    niche: "invitations", factoryHint: "Invitation" },
  { term: "birthday invitation",   niche: "invitations", factoryHint: "Invitation" },
  { term: "baby shower invitation",niche: "invitations", factoryHint: "Invitation" },
  { term: "save the date",         niche: "invitations", factoryHint: "Invitation" },

  // ── Activity & Coloring (kids + adult)
  { term: "coloring page",         niche: "activity", factoryHint: "Coloring" },
  { term: "kids worksheet",        niche: "activity", factoryHint: "Worksheet" },
  { term: "printable activity",    niche: "activity", factoryHint: "Activity" },

  // ── Apparel Designs (digital PNG/SVG for POD)
  { term: "t shirt png",           niche: "apparel-designs", factoryHint: "T-shirt PNG" },
  { term: "tumbler wrap png",      niche: "apparel-designs", factoryHint: "Tumbler" },
  { term: "sticker bundle",        niche: "apparel-designs", factoryHint: "Sticker bundle" },

  // ── Editorial & Media (presets / fonts / mockups)
  { term: "lightroom preset",      niche: "editorial-media", factoryHint: "Preset" },
  { term: "font",                  niche: "editorial-media", factoryHint: "Font" },
  { term: "logo template",         niche: "editorial-media", factoryHint: "Logo" },
  { term: "mockup",                niche: "editorial-media", factoryHint: "Mockup" },

  // ── Other Digital (catch-all for the long tail)
  { term: "ebook",                 niche: "other-digital", factoryHint: "Ebook" },
  { term: "printable journal",     niche: "other-digital", factoryHint: "Journal" },
  { term: "recipe card printable", niche: "other-digital", factoryHint: "Recipe card" },
  { term: "bookmark printable",    niche: "other-digital", factoryHint: "Bookmark" },
];

/** Build the Marketplace Insights search URL for an anchor term. */
export function anchorSearchUrl(term: string): string {
  const q = encodeURIComponent(term);
  return `https://www.etsy.com/your/shops/me/marketplace-insights/search?search_trigger=craftplan_sweep&query=${q}`;
}

/** Normalize an anchor's term for matching against captured rows.
 *  Mirrors normalizeInsightTerm() in db.ts — kept here to avoid pulling
 *  in the SQLite import client-side. */
export function normalizeAnchorTerm(raw: string): string {
  let t = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  t = t
    .split(" ")
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ");
  return t;
}

/** Group anchors by niche for UI rendering. */
export function groupAnchorsByNiche(): Record<AnchorNiche, AnchorTerm[]> {
  const groups = {} as Record<AnchorNiche, AnchorTerm[]>;
  for (const a of DIGITAL_ANCHORS) {
    (groups[a.niche] ??= []).push(a);
  }
  return groups;
}
