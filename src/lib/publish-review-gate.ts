// ══════════════════════════════════════════════════════════════
// Publish Review Gate
//
// Generates a ReviewScorecard for a factory run before publish.
// Checks: duplicate titles, niche limits, image quality,
// listing completeness, and generates a recommendation.
//
// No listing can be published without passing this gate.
// ══════════════════════════════════════════════════════════════

import { getFactoryRun, updateFactoryRun, getDb } from "@/lib/db";
import { buildPublishPayload } from "@/lib/factory-publish";
import type {
  EtsyPublishPayload,
  ReviewCheck,
  ReviewScorecard,
  ReviewStatus,
  SimilarListing,
} from "@/types/factory";

// ── Thresholds ──────────────────────────────────────────────

const NICHE_LIMIT = 2;                    // Max active listings per niche
const TITLE_SIMILARITY_BLOCK = 0.65;      // Block if >= 65% similar
const TITLE_SIMILARITY_WARN  = 0.40;      // Warn if >= 40% similar
const MIN_IMAGES = 5;                     // Minimum images for quality
const MIN_TAGS   = 8;                     // Minimum tags recommended
const MAX_TITLE_LENGTH = 140;
const MIN_TITLE_LENGTH = 40;

// ── Title Similarity (Jaccard on word bigrams + unigrams) ───

function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  const tokens = new Set<string>();

  // Unigrams
  for (const w of words) tokens.add(w);

  // Bigrams (capture phrase-level overlap)
  for (let i = 0; i < words.length - 1; i++) {
    tokens.add(`${words[i]} ${words[i + 1]}`);
  }

  return tokens;
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ── Niche Extraction ────────────────────────────────────────

const NICHE_KEYWORDS: Record<string, string[]> = {
  "wedding":     ["wedding", "bridal", "bride"],
  "baby":        ["baby", "newborn", "infant", "nursery"],
  "business":    ["business", "profit", "p&l", "revenue", "expense tracker"],
  "paycheck":    ["paycheck", "bi-weekly", "biweekly", "pay period"],
  "debt":        ["debt", "snowball", "avalanche", "payoff"],
  "savings":     ["savings", "saving", "sinking fund", "emergency fund"],
  "travel":      ["travel", "trip", "vacation", "itinerary"],
  "student":     ["student", "college", "university", "tuition"],
  "meal":        ["meal", "grocery", "food", "recipe"],
  "side-hustle": ["side hustle", "freelance", "gig", "contractor"],
  "budget":      ["budget", "spending", "monthly budget"],
};

function inferNiche(title: string, tags: string[]): string {
  const content = `${title} ${tags.join(" ")}`.toLowerCase();
  for (const [niche, keywords] of Object.entries(NICHE_KEYWORDS)) {
    if (keywords.some((k) => content.includes(k))) return niche;
  }
  return "general";
}

function getNicheForRun(run: Record<string, unknown>): string {
  // Priority 1: Infer from listing copy (title + tags = most reliable)
  if (run.listing_copy) {
    try {
      const copy = JSON.parse(String(run.listing_copy));
      const inferred = inferNiche(copy.title || "", copy.tags || []);
      if (inferred !== "general") return inferred;
    } catch { /* ignore */ }
  }

  // Priority 2: Blueprint concept_spec niche field
  if (run.blueprint_id) {
    const bp = getDb()
      .prepare("SELECT concept_spec FROM factory_blueprints WHERE id = ?")
      .get(run.blueprint_id) as Record<string, unknown> | undefined;
    if (bp?.concept_spec) {
      try {
        const spec = JSON.parse(String(bp.concept_spec));
        if (spec.niche) return String(spec.niche);
      } catch { /* ignore */ }
    }
  }

  // Priority 3: Infer from keywords
  if (run.keywords) {
    try {
      const kw = JSON.parse(String(run.keywords)) as string[];
      const inferred = inferNiche(kw.join(" "), []);
      if (inferred !== "general") return inferred;
    } catch { /* ignore */ }
  }

  return "general";
}

// ── Existing Listings Query ─────────────────────────────────

interface ExistingListing {
  runId: string;
  title: string;
  niche: string;
  etsyListingId: number | null;
  etsyListingUrl: string | null;
  etsyStatus: string | null;
}

function getExistingListings(): ExistingListing[] {
  const rows = getDb()
    .prepare(
      `SELECT id, listing_copy, blueprint_id, etsy_listing_id, etsy_listing_url, etsy_status
       FROM factory_runs
       WHERE listing_copy IS NOT NULL
         AND (etsy_listing_id IS NOT NULL OR status IN ('ready_to_list','completed'))
       ORDER BY created_at DESC`
    )
    .all() as Record<string, unknown>[];

  return rows
    .map((row) => {
      let title = "";
      try {
        const copy = JSON.parse(String(row.listing_copy || "{}"));
        // Handle both formats: { title } and { titleOptions: [...] }
        title = copy.title
          || (copy.titleOptions && copy.titleOptions[0])
          || (copy.pricing?.title)
          || "";
      } catch { /* ignore */ }

      return {
        runId: String(row.id),
        title,
        niche: getNicheForRun(row),
        etsyListingId: (row.etsy_listing_id as number) || null,
        etsyListingUrl: (row.etsy_listing_url as string) || null,
        etsyStatus: (row.etsy_status as string) || null,
      };
    })
    .filter((l) => l.title.length > 0);
}

// ══════════════════════════════════════════════════════════════
// Generate Review Scorecard
// ══════════════════════════════════════════════════════════════

export function generateReviewScorecard(
  runId: string
): ReviewScorecard | { error: string } {
  const run = getFactoryRun(runId);
  if (!run) return { error: "Factory run not found" };

  // ── Build payload (read-only) to get structured listing data ──
  const payloadOrError = buildPublishPayload(runId);
  let payload: EtsyPublishPayload | null = null;
  let payloadError: string | null = null;

  if ("error" in payloadOrError) {
    payloadError = payloadOrError.error;
  } else {
    payload = payloadOrError;
  }

  // ── Extract listing data ──
  let title = payload?.title || "";
  let tags: string[] = payload?.tags || [];
  let price = payload?.price || 0;
  let description = payload?.description || "";
  const imageCount = payload?.imageAssets?.length || 0;
  const imageUrls = (payload?.imageAssets || []).map((a) => a.downloadUrl);
  const hasProductFile = !!(
    payload?.digitalFileAsset ||
    payload?._googleSheetId ||
    payload?.packageAsset
  );
  let originalPrice = 0;

  // Fallback: extract from listing_copy JSON if payload build failed
  if (!title && run.listing_copy) {
    try {
      const copy = JSON.parse(String(run.listing_copy));
      title = copy.title || "";
      tags = copy.tags || [];
      price = copy.price || copy.pricing?.launchPrice || 0;
      originalPrice = copy.originalPrice || copy.pricing?.standardPrice || 0;
      description = copy.description || "";
    } catch { /* ignore */ }
  }

  // Try to extract original price from sale banner in description
  if (!originalPrice && description) {
    const match = description.match(/Was\s+(\d+\.\d+)/);
    if (match) originalPrice = parseFloat(match[1]);
  }

  const niche = getNicheForRun(run);
  const hasThumbnail = imageCount > 0;

  // ── Get existing listings for comparison ──
  const existing = getExistingListings().filter((l) => l.runId !== runId);

  // ── Duplicate Detection ──
  const similarListings: SimilarListing[] = [];
  let maxTitleSimilarity = 0;

  for (const listing of existing) {
    const similarity = jaccardSimilarity(title, listing.title);
    if (similarity >= TITLE_SIMILARITY_WARN) {
      similarListings.push({
        runId: listing.runId,
        title: listing.title,
        niche: listing.niche,
        titleSimilarity: Math.round(similarity * 100) / 100,
        etsyListingId: listing.etsyListingId || undefined,
        etsyListingUrl: listing.etsyListingUrl || undefined,
        etsyStatus: listing.etsyStatus || undefined,
      });
    }
    maxTitleSimilarity = Math.max(maxTitleSimilarity, similarity);
  }

  similarListings.sort((a, b) => b.titleSimilarity - a.titleSimilarity);

  // ── Niche Count ──
  const nicheActiveCount = existing.filter(
    (l) => l.niche === niche && l.etsyStatus === "active"
  ).length;
  const nicheExceeded = nicheActiveCount >= NICHE_LIMIT;

  // ══════════════════════════════════════════════════════════════
  // Quality Checks
  // ══════════════════════════════════════════════════════════════

  const checks: ReviewCheck[] = [];
  const blockReasons: string[] = [];
  const warnings: string[] = [];

  // ── 1. Title ──
  if (!title) {
    checks.push({ id: "title_missing", label: "Title", status: "fail", message: "No title found" });
    blockReasons.push("Missing title");
  } else if (title.length < MIN_TITLE_LENGTH) {
    checks.push({
      id: "title_short",
      label: "Title Length",
      status: "warn",
      message: `${title.length} chars — recommend ${MIN_TITLE_LENGTH}+`,
    });
    warnings.push("Title may be too short for SEO");
  } else if (title.length > MAX_TITLE_LENGTH) {
    checks.push({
      id: "title_long",
      label: "Title Length",
      status: "fail",
      message: `${title.length} chars — exceeds ${MAX_TITLE_LENGTH} limit`,
    });
    blockReasons.push("Title too long for Etsy");
  } else {
    checks.push({ id: "title_ok", label: "Title Length", status: "pass", message: `${title.length} characters` });
  }

  // ── 2. Title Uniqueness ──
  if (maxTitleSimilarity >= TITLE_SIMILARITY_BLOCK) {
    const top = similarListings[0];
    checks.push({
      id: "title_duplicate",
      label: "Title Uniqueness",
      status: "fail",
      message: `${Math.round(maxTitleSimilarity * 100)}% similar to existing listing`,
      details: top?.title,
    });
    blockReasons.push(`Title too similar to "${top?.title?.substring(0, 60)}..."`);
  } else if (maxTitleSimilarity >= TITLE_SIMILARITY_WARN) {
    checks.push({
      id: "title_similar",
      label: "Title Uniqueness",
      status: "warn",
      message: `${Math.round(maxTitleSimilarity * 100)}% similar to another listing`,
    });
    warnings.push("Title may overlap with an existing listing");
  } else {
    checks.push({ id: "title_unique", label: "Title Uniqueness", status: "pass", message: "Unique title" });
  }

  // ── 3. Niche Limit ──
  if (nicheExceeded) {
    checks.push({
      id: "niche_exceeded",
      label: "Niche Limit",
      status: "fail",
      message: `${nicheActiveCount} active in "${niche}" — max ${NICHE_LIMIT}`,
    });
    blockReasons.push(`Niche "${niche}" already has ${nicheActiveCount} active (max ${NICHE_LIMIT})`);
  } else if (nicheActiveCount === NICHE_LIMIT - 1) {
    checks.push({
      id: "niche_near",
      label: "Niche Limit",
      status: "warn",
      message: `${nicheActiveCount}/${NICHE_LIMIT} active in "${niche}" — will reach limit`,
    });
    warnings.push(`Publishing will reach niche limit for "${niche}"`);
  } else {
    checks.push({
      id: "niche_ok",
      label: "Niche Limit",
      status: "pass",
      message: `${nicheActiveCount}/${NICHE_LIMIT} active in "${niche}"`,
    });
  }

  // ── 4. Thumbnail ──
  if (!hasThumbnail) {
    checks.push({ id: "thumb_missing", label: "Thumbnail", status: "fail", message: "No thumbnail image" });
    blockReasons.push("Missing thumbnail");
  } else {
    checks.push({ id: "thumb_ok", label: "Thumbnail", status: "pass", message: "Thumbnail ready" });
  }

  // ── 5. Images ──
  if (imageCount === 0) {
    checks.push({ id: "images_none", label: "Images", status: "fail", message: "No listing images" });
    blockReasons.push("No listing images");
  } else if (imageCount < MIN_IMAGES) {
    checks.push({
      id: "images_few",
      label: "Images",
      status: "fail",
      message: `${imageCount} images — minimum ${MIN_IMAGES} required`,
    });
    blockReasons.push(`Only ${imageCount} images — ${MIN_IMAGES} minimum`);
  } else {
    checks.push({ id: "images_ok", label: "Images", status: "pass", message: `${imageCount} images` });
  }

  // ── 6. Tags ──
  if (tags.length === 0) {
    checks.push({ id: "tags_none", label: "Tags", status: "fail", message: "No tags" });
    blockReasons.push("No tags");
  } else if (tags.length < MIN_TAGS) {
    checks.push({
      id: "tags_few",
      label: "Tags",
      status: "warn",
      message: `${tags.length}/13 tags — recommend ${MIN_TAGS}+`,
    });
    warnings.push(`Only ${tags.length} tags — ${MIN_TAGS}+ recommended for SEO`);
  } else {
    checks.push({ id: "tags_ok", label: "Tags", status: "pass", message: `${tags.length}/13 tags` });
  }

  // ── 7. Product File ──
  if (!hasProductFile) {
    checks.push({ id: "file_missing", label: "Product File", status: "fail", message: "No downloadable product" });
    blockReasons.push("No product file");
  } else {
    checks.push({ id: "file_ok", label: "Product File", status: "pass", message: "Product file ready" });
  }

  // ── 8. Price ──
  if (price < 0.20) {
    checks.push({ id: "price_min", label: "Price", status: "fail", message: `$${price.toFixed(2)} — below Etsy minimum` });
    blockReasons.push("Price below Etsy minimum ($0.20)");
  } else if (price < 3.99) {
    checks.push({ id: "price_low", label: "Price", status: "warn", message: `$${price.toFixed(2)} — may be too low` });
    warnings.push("Price may be too low for profitability");
  } else {
    const priceMsg = originalPrice
      ? `$${price.toFixed(2)} (was $${originalPrice.toFixed(2)})`
      : `$${price.toFixed(2)}`;
    checks.push({ id: "price_ok", label: "Price", status: "pass", message: priceMsg });
  }

  // ── 9. Description ──
  if (!description || description.length < 50) {
    checks.push({ id: "desc_missing", label: "Description", status: "fail", message: "Description missing or too short" });
    blockReasons.push("Missing description");
  } else if (description.length < 200) {
    checks.push({ id: "desc_short", label: "Description", status: "warn", message: `${description.length} chars — recommend 200+` });
    warnings.push("Description may be too short");
  } else {
    checks.push({ id: "desc_ok", label: "Description", status: "pass", message: `${description.length} characters` });
  }

  // ── 10. Already Published ──
  if (run.etsy_listing_id) {
    checks.push({
      id: "already_published",
      label: "Already Published",
      status: "fail",
      message: `Listing #${run.etsy_listing_id} already exists`,
    });
    blockReasons.push("Already published on Etsy");
  }

  // ── 11. Payload Build Error ──
  if (payloadError && !run.etsy_listing_id) {
    checks.push({ id: "payload_error", label: "Build Check", status: "fail", message: payloadError });
    blockReasons.push(payloadError);
  }

  // ── Recommendation ──
  const hasBlocks = blockReasons.length > 0;
  const hasWarnings = warnings.length > 0;
  const recommendation = hasBlocks ? "block" : hasWarnings ? "review" : "approve";

  // ── Determine review status ──
  const currentReviewStatus = (run.review_status as ReviewStatus | null) || null;

  // Auto-set review status based on scorecard
  let reviewStatus = currentReviewStatus;
  if (hasBlocks) {
    // Determine primary block reason
    const isDuplicate = blockReasons.some((r) => r.includes("similar") || r.includes("duplicate"));
    reviewStatus = isDuplicate ? "blocked_duplicate" : "blocked_quality";
  } else if (!currentReviewStatus || currentReviewStatus.startsWith("blocked")) {
    // Clear block if issues are resolved, but don't downgrade from approved
    reviewStatus = "pending_review";
  }

  // Persist the review status + scorecard
  const scorecard: ReviewScorecard = {
    runId,
    reviewedAt: new Date().toISOString(),
    title,
    niche,
    price,
    originalPrice,
    imageCount,
    imageUrls,
    tagCount: tags.length,
    tags,
    hasProductFile,
    hasThumbnail,
    descriptionLength: description.length,
    checks,
    similarListings,
    maxTitleSimilarity: Math.round(maxTitleSimilarity * 100) / 100,
    nicheActiveCount,
    nicheLimit: NICHE_LIMIT,
    nicheExceeded,
    recommendation,
    blockReasons,
    warnings,
    canApprove: !hasBlocks,
    reviewStatus,
  };

  // Save to DB
  updateFactoryRun(runId, {
    reviewStatus,
    reviewScorecard: JSON.stringify(scorecard),
    reviewedAt: new Date().toISOString(),
  });

  return scorecard;
}

// ══════════════════════════════════════════════════════════════
// Approve / Reject
// ══════════════════════════════════════════════════════════════

export function approveForPublish(runId: string): { success: boolean; error?: string } {
  const run = getFactoryRun(runId);
  if (!run) return { success: false, error: "Factory run not found" };

  // Must have been reviewed
  if (!run.review_status) {
    return { success: false, error: "Run has not been reviewed yet. Generate a scorecard first." };
  }

  // Cannot approve if blocked
  if (run.review_status === "blocked_duplicate" || run.review_status === "blocked_quality") {
    return {
      success: false,
      error: `Cannot approve — status is "${run.review_status}". Fix the issues and re-review.`,
    };
  }

  // Cannot approve if already published
  if (run.etsy_listing_id) {
    return { success: false, error: "Already published on Etsy" };
  }

  updateFactoryRun(runId, {
    reviewStatus: "approved",
    reviewedAt: new Date().toISOString(),
  });

  return { success: true };
}

export function rejectListing(runId: string, reason?: string): { success: boolean; error?: string } {
  const run = getFactoryRun(runId);
  if (!run) return { success: false, error: "Factory run not found" };

  updateFactoryRun(runId, {
    reviewStatus: "blocked_quality",
    reviewedAt: new Date().toISOString(),
  });

  return { success: true };
}
