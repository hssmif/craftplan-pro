// ══════════════════════════════════════════════════════════════════════
// Marketplace Insights Scanner — Content Script
//
// Runs on Etsy Plus's Marketplace Insights pages. Two surfaces:
//
//   1. CATEGORY GRID   /your/shops/me/marketplace-insights
//      Reads the "What buyers are searching for across Etsy" cards when
//      the user clicks category radios. Captures {term, monthly_volume}.
//
//   2. SEARCH DETAIL   /your/shops/me/marketplace-insights/search?query=...
//      Reads the per-term detail page when the user searches a specific
//      keyword. Captures:
//        • main term: exact volume + growth % + search-results count
//          + 30-day daily series
//        • similar terms: 9-10 related-term rows, each with their own
//          volume + search-results
//
// All POSTs go to /api/research/insights-capture. The DB sink in
// b3a6a25 + the Phase-6 schema extension support both surfaces via the
// `capture_type` column ("grid" | "detail-main" | "detail-related").
//
// SELECTOR STRATEGY:
//   Etsy's React markup uses obfuscated class names that change between
//   deploys. We anchor on structural + textual cues instead:
//
//   1. Active category — read from the checked radio input. Each radio
//      has a sibling <label> with the visible category name.
//
//   2. Term cards — anchor on the heading text "What buyers are
//      searching for across Etsy", walk to its sibling container, then
//      iterate over <a> elements inside that contain BOTH:
//        a) an <img> (the thumbnail)
//        b) text content matching a volume pattern (e.g. "170.9k",
//           "1.2M", "850")
//      Within each card we extract:
//        - term  → the first text node inside that's NOT the volume
//                  string (typically immediately above it)
//        - volumeText → matched text
//        - thumbnailUrl → img.src
//
//   3. Re-scan triggers — MutationObserver on the term grid container.
//      Whenever a child changes (category click or initial hydration),
//      we re-scan and POST. Per-(category × term) de-dupe on the client
//      keeps us from POSTing the same batch repeatedly.
//
// SAFETY POSTURE:
//   The HARD RULE forbids scraping etsy.com server-side or spoofing
//   browser headers. This script does NEITHER — it reads the DOM the
//   user is ALREADY viewing in THEIR own authenticated session, on
//   THEIR own Etsy Plus subscription. Same risk model as the existing
//   etsy-pod-scanner content script.
// ══════════════════════════════════════════════════════════════════════

// ── Page-active check (defensive — manifest already restricts URL) ──
function isMarketplaceInsightsPage(): boolean {
  return window.location.pathname.startsWith("/your/shops/me/marketplace-insights");
}

/** Detail page = /marketplace-insights/search?query=...  */
function isDetailPage(): boolean {
  return window.location.pathname.startsWith("/your/shops/me/marketplace-insights/search");
}

if (isMarketplaceInsightsPage()) {
  initScanner();
}

// ── Config ──────────────────────────────────────────────────────────
const CAPTURE_ENDPOINT = "http://localhost:3461/api/research/insights-capture";

// Volume pattern: "170.9k", "1.2M", "850", "1,234" — covers Etsy's
// formats. We accept commas and optional k/m/b suffix (case-insensitive).
const VOLUME_RE = /^[\d,]+(?:\.\d+)?\s*[kKmMbB]?$/;

// ── Capture state ───────────────────────────────────────────────────
// Avoid re-POSTing the same (category, term, volume) more than once
// per page load. Re-renders fire the observer multiple times — without
// dedup we'd hammer the endpoint.
const sentKeys = new Set<string>();
let lastPostTs = 0;
const MIN_POST_INTERVAL_MS = 1500; // debounce: at most ~1 POST/1.5s
let pendingRescan: ReturnType<typeof setTimeout> | null = null;

// ── Helpers ─────────────────────────────────────────────────────────

function getActiveCategory(): string | null {
  // Each radio has a sibling label with the category name. Find the
  // currently-checked one.
  const radios = document.querySelectorAll<HTMLInputElement>(
    'input[type="radio"][name][checked], input[type="radio"]:checked',
  );
  for (const r of Array.from(radios)) {
    // Prefer the associated <label for=...>
    if (r.id) {
      const lbl = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(r.id)}"]`);
      if (lbl) {
        const txt = lbl.textContent?.trim();
        if (txt) return txt.slice(0, 100);
      }
    }
    // Fallback: aria-label
    const aria = r.getAttribute("aria-label");
    if (aria) return aria.trim().slice(0, 100);
  }
  return null;
}

// Locate the term-grid container by anchoring on the heading text.
// Returns null if Etsy has changed the page structure — caller logs +
// retries on next mutation.
function findTermGridContainer(): HTMLElement | null {
  // Find any heading whose visible text contains the anchor phrase.
  // We restrict to h1-h6 to avoid matching arbitrary <p>'s.
  const anchorText = "what buyers are searching for";
  const headings = document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6");
  for (const h of Array.from(headings)) {
    const txt = (h.textContent || "").toLowerCase();
    if (txt.includes(anchorText)) {
      // The grid is a sibling or descendant of the heading's parent.
      // Walk up at most 3 levels then scan downward for an element
      // containing multiple <a> with <img> + volume text.
      let node: HTMLElement | null = h;
      for (let i = 0; i < 4 && node; i++) {
        node = node.parentElement;
        if (node && countTermCardsIn(node) >= 2) {
          return node;
        }
      }
    }
  }
  return null;
}

function countTermCardsIn(root: HTMLElement): number {
  let n = 0;
  const links = root.querySelectorAll<HTMLAnchorElement>("a");
  for (const a of Array.from(links)) {
    if (looksLikeTermCard(a)) n += 1;
    if (n >= 2) break;
  }
  return n;
}

function looksLikeTermCard(a: HTMLAnchorElement): boolean {
  if (!a.querySelector("img")) return false;
  // Has at least one descendant text node matching the volume pattern
  return findVolumeTextNode(a) !== null;
}

function findVolumeTextNode(root: HTMLElement): string | null {
  // Use a TreeWalker to find descendant text nodes; first one that
  // matches the volume pattern wins. This is robust to Etsy nesting
  // the volume inside multiple wrapper <span>s.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = (walker.currentNode.nodeValue || "").trim();
    if (t && VOLUME_RE.test(t)) return t;
  }
  return null;
}

interface ScrapedTerm {
  term: string;
  volumeText: string;
  thumbnailUrl: string | null;
}

function scrapeCardsFromGrid(grid: HTMLElement): ScrapedTerm[] {
  const out: ScrapedTerm[] = [];
  const links = grid.querySelectorAll<HTMLAnchorElement>("a");
  for (const a of Array.from(links)) {
    if (!looksLikeTermCard(a)) continue;
    const volumeText = findVolumeTextNode(a);
    if (!volumeText) continue;

    // Find the term name: the term is typically the OTHER significant
    // text inside the card (not the volume). We collect all text nodes,
    // skip the volume itself, and pick the longest remaining one (the
    // term name tends to be longer than tiny decorative text like "·").
    const otherTexts: string[] = [];
    const walker = document.createTreeWalker(a, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = (walker.currentNode.nodeValue || "").trim();
      if (!t) continue;
      if (t === volumeText) continue;
      if (VOLUME_RE.test(t)) continue; // skip stray secondary volumes
      otherTexts.push(t);
    }
    if (otherTexts.length === 0) continue;
    const term = otherTexts.sort((a, b) => b.length - a.length)[0];
    // Reasonable sanity: terms should be 2-100 chars, not URL-like.
    if (term.length < 2 || term.length > 120 || term.startsWith("http")) continue;

    const img = a.querySelector<HTMLImageElement>("img");
    const thumbnailUrl = img?.src || null;

    out.push({ term, volumeText, thumbnailUrl });
  }
  return out;
}

// ── POST batch to the capture endpoint ──────────────────────────────

interface BatchEnvelope {
  category: string | null;
  rows: ScrapedTerm[];
  sourcePage: string;
}

async function postBatch(batch: BatchEnvelope): Promise<void> {
  // Filter rows we've already sent this page-load
  const fresh = batch.rows.filter((r) => {
    const key = `${batch.category || ""}|${r.term}|${r.volumeText}`;
    if (sentKeys.has(key)) return false;
    sentKeys.add(key);
    return true;
  });
  if (fresh.length === 0) return;

  try {
    const resp = await fetch(CAPTURE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: batch.category,
        sourcePage: batch.sourcePage,
        capturedAt: new Date().toISOString(),
        results: fresh.map((r) => ({
          term: r.term,
          volumeText: r.volumeText,
          thumbnailUrl: r.thumbnailUrl,
        })),
      }),
    });
    if (!resp.ok) {
      // Roll back the dedup keys on failure so we retry next tick
      for (const r of fresh) {
        sentKeys.delete(`${batch.category || ""}|${r.term}|${r.volumeText}`);
      }
      console.warn(`[CraftPlan/insights] capture POST failed: ${resp.status}`);
      return;
    }
    const data = (await resp.json().catch(() => null)) as { captured?: number } | null;
    console.log(
      `[CraftPlan/insights] captured ${data?.captured ?? fresh.length} terms in "${batch.category || "(no category)"}"`,
    );
  } catch (err) {
    // Network error — roll back dedup for retry
    for (const r of fresh) {
      sentKeys.delete(`${batch.category || ""}|${r.term}|${r.volumeText}`);
    }
    console.warn("[CraftPlan/insights] capture POST errored:", err);
  }
}

// ══════════════════════════════════════════════════════════════════════
// DETAIL PAGE SCRAPER  (/marketplace-insights/search?query=...)
// ══════════════════════════════════════════════════════════════════════
//
// Strategy: anchor on stable English labels Etsy puts next to each
// metric ("Searches", "Search results"). For each label, walk its
// parent and find a sibling/descendant text node that matches the
// expected value pattern. This is the same DOM-agnostic approach
// the grid scraper uses — no obfuscated React class names involved.

interface DetailScrape {
  /** The primary searched term (from the page heading). */
  mainTerm: string | null;
  /** "38.5k", "1.2M", "850". */
  mainVolumeText: string | null;
  /** "+12.4%", "-6.4%". Negative = decline. */
  growthText: string | null;
  /** "9.1M", "901.6k" — Etsy's reported listing count for this query. */
  searchResultsText: string | null;
  /** Up to 30 rows of {date, searches, ma7}. */
  dailySeries: Array<{ date: string; searches: number; ma7: number | null }>;
  /** "Discover what buyers are searching for" related-term rows. */
  related: Array<{ term: string; volumeText: string; searchResultsText: string }>;
}

// Find the *first* text node under root whose trimmed content matches
// the predicate. Returns the value (trimmed) or null.
function findText(root: HTMLElement, pred: (s: string) => boolean): string | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = (walker.currentNode.nodeValue || "").trim();
    if (t && pred(t)) return t;
  }
  return null;
}

// Locate the element whose visible text is exactly `label`, then walk
// UP to find a container that ALSO contains the value via `valuePred`.
// Returns the value text or null.
function findValueNearLabel(
  label: string,
  valuePred: (s: string) => boolean,
): string | null {
  const all = document.querySelectorAll<HTMLElement>("body *");
  for (const el of Array.from(all)) {
    // Skip elements with descendants — we want the LEAF that says the label
    if ((el.textContent || "").trim().toLowerCase() !== label.toLowerCase()) continue;
    if (el.children.length > 0) continue;
    // Walk up at most 4 levels looking for the value as a sibling text
    let node: HTMLElement | null = el;
    for (let i = 0; i < 4 && node; i++) {
      node = node.parentElement;
      if (!node) break;
      const found = findText(node, valuePred);
      if (found) return found;
    }
  }
  return null;
}

// Volume pattern is shared with the grid scraper.
const GROWTH_RE = /^[+-]?\d+(?:\.\d+)?\s*%$/;
const DATE_LABEL_RE = /^[A-Z][a-z]{2}\s+\d{1,2}$/; // "Apr 19"

function scrapeDetailPage(): DetailScrape {
  // ── Main term: prefer the page <h1> INSIDE <main>, fall back to URL.
  // (Without the <main> scope we'd grab Etsy's sidebar h1 "Shop manager menu".)
  // Etsy also renders multiple "Shop Manager" / "Shop manager menu" headings
  // before the actual content, so we explicitly reject obviously-not-a-term
  // strings.
  const mainContent =
    document.querySelector<HTMLElement>("main#main-content") ||
    document.querySelector<HTMLElement>("main") ||
    document.body;
  // Etsy renders the searched term as an <h3> inside <main#main-content>
  // (NOT an <h1> — those belong to the sidebar). We scan h1-h4 in order
  // because the same DOM gets restructured between deploys and we want
  // resilience. The REJECTED set kills the few non-term headings that
  // can leak through ("Shop Manager", "Marketplace Insights" breadcrumb).
  const REJECTED_TERMS = new Set([
    "shop manager",
    "shop manager menu",
    "sales channels",
    "marketplace insights",
    "discover what buyers are searching for on etsy",
    "search term analysis",
    "saved searches",
    "what buyers are searching for across etsy",
    "explore search terms related to your shop",
  ]);
  const candidates = mainContent.querySelectorAll<HTMLElement>("h1, h2, h3, h4");
  let mainTerm: string | null = null;
  for (const h of Array.from(candidates)) {
    const t = (h.textContent || "").trim();
    if (
      t.length > 0 &&
      t.length < 80 &&
      !REJECTED_TERMS.has(t.toLowerCase())
    ) {
      mainTerm = t;
      break;
    }
  }
  if (!mainTerm) {
    const qp = new URLSearchParams(window.location.search).get("query");
    if (qp) mainTerm = qp;
  }

  // ── Main volume: text near the "Searches" label matching volume pattern.
  // We exclude growth (%) text since "5.2%" also matches numeric-ish content.
  const isVol = (s: string) => VOLUME_RE.test(s);
  const isPct = (s: string) => GROWTH_RE.test(s);

  const mainVolumeText = findValueNearLabel("Searches", isVol);
  const searchResultsText = findValueNearLabel("Search results", isVol);

  // ── Growth %: anywhere on page, but prefer near "Searches" label.
  // Etsy renders it as a small button immediately after the volume.
  // We just scan the whole document for the first growth-pattern text.
  let growthText: string | null = null;
  {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = (walker.currentNode.nodeValue || "").trim();
      if (t && GROWTH_RE.test(t)) {
        growthText = t;
        break;
      }
    }
  }

  // ── Daily series: find any <table> with rows of [date-label, num, num]
  // structure. Etsy renders the chart's accessibility-table version
  // with exactly that shape.
  const dailySeries: DetailScrape["dailySeries"] = [];
  for (const table of Array.from(document.querySelectorAll<HTMLTableElement>("table"))) {
    const candidate: DetailScrape["dailySeries"] = [];
    // Etsy doesn't use <tr><td> here — they put each cell as a generic
    // direct child. Walk the table's direct text nodes in DOM order
    // and group every 3 that match the pattern.
    const cells: string[] = [];
    const walker = document.createTreeWalker(table, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = (walker.currentNode.nodeValue || "").trim();
      if (t) cells.push(t);
    }
    for (let i = 0; i + 2 < cells.length; i++) {
      if (
        DATE_LABEL_RE.test(cells[i]) &&
        /^\d{1,6}$/.test(cells[i + 1]) &&
        /^\d{1,6}$/.test(cells[i + 2])
      ) {
        candidate.push({
          date: cells[i],
          searches: parseInt(cells[i + 1], 10),
          ma7: parseInt(cells[i + 2], 10),
        });
        i += 2; // jump past the consumed cells
      }
    }
    if (candidate.length >= 7) {
      // Looks like a 7+ day series. Use the longest table we find.
      if (candidate.length > dailySeries.length) {
        dailySeries.length = 0;
        dailySeries.push(...candidate);
      }
    }
  }

  // ── Related terms: find the table whose leaf-text stream contains
  // the "Searches" + "Search results" header pair followed by triples
  // of (term, volume, search-results). Etsy renders the term cells as
  // <div role="button"> inside <td>, so a `querySelector("button")`
  // misses them — we walk text nodes in DOM order instead, same
  // approach we use for the daily-series table.
  const related: DetailScrape["related"] = [];
  for (const tbl of Array.from(mainContent.querySelectorAll<HTMLTableElement>("table"))) {
    const cells: string[] = [];
    const walker = document.createTreeWalker(tbl, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = (walker.currentNode.nodeValue || "").trim();
      if (t) cells.push(t);
    }
    // Find the header pair
    let start = -1;
    for (let i = 0; i + 1 < cells.length; i++) {
      if (cells[i] === "Searches" && cells[i + 1] === "Search results") {
        start = i + 2;
        break;
      }
    }
    if (start < 0) continue;
    for (let i = start; i + 2 < cells.length; i += 3) {
      const term = cells[i];
      const vol = cells[i + 1];
      const res = cells[i + 2];
      // Sanity check: terms shouldn't look like volumes, vol+results
      // both should match the volume pattern.
      if (
        term &&
        !VOLUME_RE.test(term) &&
        VOLUME_RE.test(vol) &&
        VOLUME_RE.test(res)
      ) {
        related.push({ term, volumeText: vol, searchResultsText: res });
      }
    }
    if (related.length > 0) break;
  }

  return {
    mainTerm,
    mainVolumeText,
    growthText,
    searchResultsText,
    dailySeries,
    related,
  };
}

interface DetailPayloadResult {
  term: string;
  volumeText: string;
  growthText?: string;
  searchResultsText?: string;
  captureType: "detail-main" | "detail-related";
  parentTerm?: string;
  dailySeries?: Array<{ date: string; searches: number; ma7: number | null }>;
}

async function postDetailBatch(scrape: DetailScrape): Promise<void> {
  if (!scrape.mainTerm || !scrape.mainVolumeText) return;
  // De-dup: include the term + volume + (related-terms-count) so a
  // refresh on the same page doesn't re-POST identical data, but a
  // new related-terms page from pagination DOES.
  const dedupKey = `detail|${scrape.mainTerm}|${scrape.mainVolumeText}|${scrape.related.length}`;
  if (sentKeys.has(dedupKey)) return;
  sentKeys.add(dedupKey);

  const rows: DetailPayloadResult[] = [];
  // Main row
  rows.push({
    term: scrape.mainTerm,
    volumeText: scrape.mainVolumeText,
    growthText: scrape.growthText ?? undefined,
    searchResultsText: scrape.searchResultsText ?? undefined,
    captureType: "detail-main",
    dailySeries: scrape.dailySeries.length > 0 ? scrape.dailySeries : undefined,
  });
  // Related rows
  for (const r of scrape.related) {
    rows.push({
      term: r.term,
      volumeText: r.volumeText,
      searchResultsText: r.searchResultsText,
      captureType: "detail-related",
      parentTerm: scrape.mainTerm,
    });
  }

  try {
    const resp = await fetch(CAPTURE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourcePage: window.location.href,
        capturedAt: new Date().toISOString(),
        results: rows,
      }),
    });
    if (!resp.ok) {
      sentKeys.delete(dedupKey);
      console.warn(`[CraftPlan/insights] detail POST failed: ${resp.status}`);
      return;
    }
    const data = (await resp.json().catch(() => null)) as { captured?: number } | null;
    console.log(
      `[CraftPlan/insights] detail capture: "${scrape.mainTerm}" (${scrape.mainVolumeText}, ${scrape.growthText ?? "no Δ"}, ${scrape.dailySeries.length} days, ${scrape.related.length} related) — ${data?.captured ?? rows.length} rows`,
    );
  } catch (err) {
    sentKeys.delete(dedupKey);
    console.warn("[CraftPlan/insights] detail POST errored:", err);
  }
}

// ── Main scan + observe loop ────────────────────────────────────────

function runScan() {
  if (!isMarketplaceInsightsPage()) return;
  const now = Date.now();
  if (now - lastPostTs < MIN_POST_INTERVAL_MS) {
    // Debounce — coalesce rapid mutation bursts into a single scan
    if (pendingRescan) return;
    pendingRescan = setTimeout(() => {
      pendingRescan = null;
      runScan();
    }, MIN_POST_INTERVAL_MS);
    return;
  }
  lastPostTs = now;

  // ── Branch on page type ──
  if (isDetailPage()) {
    const scrape = scrapeDetailPage();
    if (scrape.mainTerm && scrape.mainVolumeText) {
      postDetailBatch(scrape);
    }
    return;
  }

  // ── Grid page ──
  const grid = findTermGridContainer();
  if (!grid) {
    // Page not fully hydrated yet, or DOM changed. The observer will
    // re-fire when content appears.
    return;
  }
  const rows = scrapeCardsFromGrid(grid);
  if (rows.length === 0) return;

  const category = getActiveCategory();
  postBatch({
    category,
    rows,
    sourcePage: window.location.href,
  });
}

function initScanner() {
  // First pass after initial hydration
  setTimeout(runScan, 1500);

  // Watch for DOM changes — category clicks repaint the grid.
  const observer = new MutationObserver(() => {
    runScan();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: false,
  });

  console.log("[CraftPlan/insights] Marketplace Insights scanner active");
}

// Export nothing — content scripts are top-level side effects.
export {};
