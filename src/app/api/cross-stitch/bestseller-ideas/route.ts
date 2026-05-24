// POST /api/cross-stitch/bestseller-ideas
//
// Etsy-backed cross-stitch idea engine.
//
// This route is intentionally isolated from convert/export. It only reads
// research data and writes product_ideas rows. The premium-convert pipeline
// stays untouched.

import { NextRequest, NextResponse } from "next/server";
import { callGeminiJSON, repairJSON } from "@/lib/gemini";
import { getDb } from "@/lib/db";
import {
  filterOutOwnDuplicates,
  getOwnTopPerformers,
  type OwnListing,
} from "@/lib/own-shop-dedupe";
import { checkIdeaForIP, IP_GUARDRAIL_PROMPT, isTrademarked } from "@/lib/trademark-filter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

type IdeaStyle = "all" | "funny" | "bookmarks" | "folk";

interface BestsellerRow {
  title: string;
  favorites: number;
  sales_estimate: number;
  price: number | null;
  keyword: string | null;
  image_url: string | null;
  url: string | null;
}

interface MarketLane {
  keyword: string;
  demand_score: number;
  avg_favorites: number;
  total_results: number;
  competition_level: string | null;
  top_tags: string | null;
}

interface InsightTerm {
  term: string;
  monthly_searches: number | null;
  growth_pct: number | null;
  search_results: number | null;
  category: string | null;
  digital_niche: string | null;
}

interface RawIdea {
  title?: unknown;
  niche?: unknown;
  product_type?: unknown;
  why_now?: unknown;
  target_buyer?: unknown;
  suggested_price?: unknown;
  demand_score?: unknown;
  competition_score?: unknown;
  urgency_score?: unknown;
  confidence?: unknown;
  signal_listings?: unknown;
  suggested_tags?: unknown;
  suggested_keywords?: unknown;
}

interface NormalizedIdea {
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
  signal_listings: unknown[];
  suggested_tags: string[];
  suggested_keywords: string[];
}

interface ProductIdeaRow {
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
  generated_at: string;
}

const STYLE_KEYWORDS: Record<IdeaStyle, string[]> = {
  bookmarks: ["bookmark"],
  funny: ["funny", "snarky", "sassy", "silly", "not my problem", "i'm fine", "nope"],
  folk: ["sampler", "folk", "vintage", "botanical", "alphabet", "wreath", "floral"],
  all: [],
};

const STYLE_LABELS: Record<IdeaStyle, string> = {
  bookmarks: "cross-stitch bookmark patterns with narrow layouts and giftable subjects",
  funny: "funny or light-snark cross-stitch patterns with clean, family-safe captions",
  folk: "sampler, folk-art, botanical, kitchen, and cottagecore collection patterns",
  all: "mixed high-demand cross-stitch patterns across safe bestseller lanes",
};

const BLOCKED_THEME_RE =
  /tarot|occult|witch|witchy|skull|skelet|bone\b|\beye\b|evil eye|hand of|pentagram|ouija|demon|devil|ghost|satan|ritual|blood|gore|goth|gothic|mystic|mystical|horror|haunted|grave|vampire|zombie|anatom|crucifix|\bjesus\b|christian|church|hijab|gun\b|knife\b/i;

const SAFE_FALLBACK_LANES = [
  {
    subject: "Mushroom Garden Sampler",
    detail: "small fungi, moss, and wildflower motifs in a cottage palette",
    tags: ["mushroom pattern", "cross stitch pdf", "cottagecore chart", "fungi sampler"],
    keywords: ["mushroom cross stitch", "cottagecore pattern", "fungi sampler"],
  },
  {
    subject: "Goose with Blue Bow",
    detail: "farmhouse goose, gingham bow, and simple floral border",
    tags: ["goose pattern", "cross stitch pdf", "farmhouse decor", "beginner chart"],
    keywords: ["goose cross stitch", "farmhouse pattern", "beginner cross stitch"],
  },
  {
    subject: "Frog in Rain Boots",
    detail: "cheerful pond scene with boots, umbrella, and tiny flowers",
    tags: ["frog pattern", "cross stitch pdf", "pond sampler", "cute chart"],
    keywords: ["frog cross stitch", "cute frog pattern", "pond cross stitch"],
  },
  {
    subject: "Strawberry Jam Jar",
    detail: "jam jar label, berry border, and kitchen shelf mini motifs",
    tags: ["strawberry chart", "cross stitch pdf", "kitchen pattern", "jam jar"],
    keywords: ["strawberry cross stitch", "kitchen cross stitch", "jam jar pattern"],
  },
  {
    subject: "Cat Garden Window",
    detail: "sleepy cat, potted flowers, and sunny window frame",
    tags: ["cat pattern", "cross stitch pdf", "garden chart", "cat lover gift"],
    keywords: ["cat cross stitch", "garden cat pattern", "cat lover chart"],
  },
  {
    subject: "Tiny Folk Flower Alphabet",
    detail: "A-Z mini florals with soft vintage borders",
    tags: ["alphabet sampler", "cross stitch pdf", "folk flowers", "nursery chart"],
    keywords: ["alphabet cross stitch", "folk flower sampler", "nursery pattern"],
  },
  {
    subject: "Lavender Bee Bookmark",
    detail: "long bookmark layout with bees, lavender sprigs, and tassel cue",
    tags: ["bookmark pattern", "cross stitch pdf", "bee bookmark", "lavender chart"],
    keywords: ["cross stitch bookmark", "bee cross stitch", "lavender pattern"],
  },
  {
    subject: "Cozy Cottage Pantry Labels",
    detail: "mini labels for tea, flour, honey, herbs, and jam",
    tags: ["kitchen sampler", "cross stitch pdf", "pantry labels", "cottage chart"],
    keywords: ["kitchen cross stitch", "pantry sampler", "cottage pattern"],
  },
  {
    subject: "Highland Calf Flower Crown",
    detail: "soft meadow palette with floral crown and beginner-friendly blocks",
    tags: ["cow pattern", "cross stitch pdf", "farm animal", "flower crown"],
    keywords: ["cow cross stitch", "highland calf", "farm animal pattern"],
  },
  {
    subject: "Funny Laundry Day Duck",
    detail: "light clean caption with laundry basket and pastel socks",
    tags: ["funny pattern", "cross stitch pdf", "duck chart", "laundry humor"],
    keywords: ["funny cross stitch", "duck cross stitch", "laundry pattern"],
  },
];

function normalizeStyle(input: unknown): IdeaStyle {
  const style = String(input ?? "all").replace(/^bestseller_/, "");
  return style === "funny" || style === "bookmarks" || style === "folk" ? style : "all";
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  return String(value);
}

function score(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed.map((item) => asString(item).trim()).filter(Boolean);
    } catch {
      return value.split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function parseTagList(raw: string | null): string[] {
  if (!raw) return [];
  return asStringArray(raw).slice(0, 12);
}

function isSafeText(value: string): boolean {
  const text = value.toLowerCase();
  return Boolean(text.trim()) && !BLOCKED_THEME_RE.test(text) && !isTrademarked(text);
}

function isSafeSeed(row: Pick<BestsellerRow, "title" | "keyword">): boolean {
  return isSafeText(`${row.title} ${row.keyword ?? ""}`);
}

function uniqueByTitle<T extends { title: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = row.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function fetchTopSeeds(style: IdeaStyle, limit = 15): BestsellerRow[] {
  const db = getDb();
  const keywords = STYLE_KEYWORDS[style];
  const baseWhere = `
    (LOWER(title) LIKE '%cross stitch%' OR LOWER(title) LIKE '%cross-stitch%' OR LOWER(title) LIKE '%crossstitch%')
    AND COALESCE(favorites, 0) > 30
  `;
  const styleWhere = keywords.length === 0
    ? "1=1"
    : "(" + keywords.map(() => "LOWER(title) LIKE ?").join(" OR ") + ")";

  const sql = `
    SELECT title, COALESCE(favorites, 0) AS favorites, COALESCE(sales_estimate, 0) AS sales_estimate,
           price, keyword, image_url, url
    FROM tracked_listings
    WHERE ${baseWhere} AND ${styleWhere}
    ORDER BY (COALESCE(favorites, 0) + COALESCE(sales_estimate, 0) * 5) DESC
    LIMIT ?
  `;

  const rows = db
    .prepare(sql)
    .all(...keywords.map((kw) => `%${kw.toLowerCase()}%`), limit * 5) as BestsellerRow[];

  let filtered = uniqueByTitle(rows.filter(isSafeSeed));

  if (filtered.length < Math.min(limit, 8) && keywords.length > 0) {
    const broad = db.prepare(`
      SELECT title, COALESCE(favorites, 0) AS favorites, COALESCE(sales_estimate, 0) AS sales_estimate,
             price, keyword, image_url, url
      FROM tracked_listings
      WHERE ${baseWhere}
      ORDER BY (COALESCE(favorites, 0) + COALESCE(sales_estimate, 0) * 5) DESC
      LIMIT ?
    `).all(limit * 5) as BestsellerRow[];
    filtered = uniqueByTitle([...filtered, ...broad.filter(isSafeSeed)]);
  }

  return filtered.slice(0, limit);
}

function fetchMarketLanes(limit = 12): MarketLane[] {
  try {
    const rows = getDb().prepare(`
      SELECT keyword,
             MAX(COALESCE(demand_score, 0)) AS demand_score,
             ROUND(AVG(COALESCE(avg_favorites, 0)), 1) AS avg_favorites,
             MIN(COALESCE(total_results, 0)) AS total_results,
             MAX(competition_level) AS competition_level,
             MAX(top_tags) AS top_tags
      FROM scan_keyword_results
      WHERE error IS NULL
        AND (LOWER(keyword) LIKE '%cross stitch%' OR LOWER(keyword) LIKE '%cross-stitch%')
      GROUP BY LOWER(keyword)
      ORDER BY demand_score DESC, avg_favorites DESC
      LIMIT ?
    `).all(limit * 3) as MarketLane[];

    return rows
      .filter((row) => isSafeText(row.keyword))
      .slice(0, limit);
  } catch (err) {
    console.warn("[bestseller-ideas] market lane fetch failed:", (err as Error).message);
    return [];
  }
}

function fetchEtsyInsightTerms(limit = 10): InsightTerm[] {
  try {
    const rows = getDb().prepare(`
      SELECT term, monthly_searches, growth_pct, search_results, category, digital_niche
      FROM etsy_insights_terms
      WHERE (is_digital IS NULL OR is_digital != 'physical')
        AND (
          LOWER(term) LIKE '%cross stitch%'
          OR LOWER(term) LIKE '%cross-stitch%'
          OR LOWER(term) LIKE '%embroidery pattern%'
          OR LOWER(term) LIKE '%pdf pattern%'
          OR LOWER(term) LIKE '%sampler pattern%'
        )
      ORDER BY COALESCE(monthly_searches, 0) DESC, COALESCE(growth_pct, 0) DESC, captured_at DESC
      LIMIT ?
    `).all(limit * 2) as InsightTerm[];

    return rows.filter((row) => isSafeText(row.term)).slice(0, limit);
  } catch (err) {
    console.warn("[bestseller-ideas] insight term fetch failed:", (err as Error).message);
    return [];
  }
}

function buildPrompt(params: {
  count: number;
  style: IdeaStyle;
  competitorSeeds: BestsellerRow[];
  ownWinners: OwnListing[];
  marketLanes: MarketLane[];
  insightTerms: InsightTerm[];
}): string {
  const { count, style, competitorSeeds, ownWinners, marketLanes, insightTerms } = params;
  const competitorBlock = competitorSeeds
    .map((seed, index) => {
      const source = seed.keyword ? ` · lane: ${seed.keyword}` : "";
      const sales = seed.sales_estimate ? ` · ~${seed.sales_estimate} sales` : "";
      const price = seed.price ? ` · $${Number(seed.price).toFixed(2)}` : "";
      return `${index + 1}. "${seed.title.replace(/"/g, "'")}" · ${seed.favorites} favorites${sales}${price}${source}`;
    })
    .join("\n");

  const ownBlock = ownWinners.length
    ? ownWinners
        .map((winner, index) => `${index + 1}. "${winner.title.replace(/"/g, "'")}" · ${winner.num_favorers} favorites · ${winner.views} views`)
        .join("\n")
    : "No own-shop winner data available for this request.";

  const laneBlock = marketLanes.length
    ? marketLanes
        .map((lane, index) => {
          const tags = parseTagList(lane.top_tags).slice(0, 5).join(", ");
          return `${index + 1}. ${lane.keyword} · demand ${lane.demand_score}/100 · avg ${Math.round(lane.avg_favorites)} favorites · ${lane.total_results.toLocaleString()} results · ${lane.competition_level ?? "unknown"} competition${tags ? ` · tags: ${tags}` : ""}`;
        })
        .join("\n")
    : "No scan_keyword_results lanes available.";

  const insightBlock = insightTerms.length
    ? insightTerms
        .map((term, index) => {
          const volume = term.monthly_searches ? `${term.monthly_searches.toLocaleString()} mo. searches` : "unknown volume";
          const growth = term.growth_pct ? ` · +${Math.round(term.growth_pct)}% growth` : "";
          const results = term.search_results ? ` · ${term.search_results.toLocaleString()} results` : "";
          return `${index + 1}. ${term.term} · ${volume}${growth}${results}`;
        })
        .join("\n")
    : "No cross-stitch Marketplace Insights captures available yet.";

  return `You are CraftPlanDigital's Etsy cross-stitch research strategist. Generate ${count} NEW, family-friendly ${STYLE_LABELS[style]}.

Your job is not to be random. Your job is to make sellable Etsy ideas from evidence:
- Own-shop winners are strongest because this shop's audience already responded.
- Competitor seeds are real Etsy listings captured by the scanner and ranked by favorites/sales estimate.
- Market lanes are keyword scans with demand, competition, and average favorites.
- Marketplace Insights terms are buyer-side search demand when available.

OWN-SHOP WINNERS:
${ownBlock}

COMPETITOR BESTSELLER SEEDS:
${competitorBlock || "No competitor seeds available."}

MARKET LANES:
${laneBlock}

MARKETPLACE INSIGHTS:
${insightBlock}

${IP_GUARDRAIL_PROMPT}

FAMILY-SAFE RULES:
- Never use occult, witchcraft, skull, eye, anatomical, horror, gothic, religious-symbol, gore, alcohol, cigarette, or weapon-centered ideas.
- Never copy a seed title. Make a close commercial riff: same buyer intent, original subject/details.
- Every title must include "Cross Stitch Pattern" or "Cross Stitch Bookmark Pattern".
- Use precise visual details: subject, setting, palette, border, prop, pose, or collection format.
- Prefer proven safe lanes: mushrooms, frogs, geese, cats, strawberries, folk flowers, kitchen samplers, bookmarks, alphabet samplers, cozy animals, garden scenes.
- Avoid protected characters, franchises, brands, celebrity names, and "inspired by" IP language.
- Return practical ideas that can be generated into a chart today.

OUTPUT — return ONLY a JSON object with exactly this shape. No prose and no markdown:
{
  "ideas": [
    {
      "title": "specific title, max 90 chars",
      "niche": "cross stitch pattern",
      "product_type": "PDF cross stitch pattern",
      "why_now": "1 sentence naming the seed/lane and why this riff can sell",
      "target_buyer": "1 sentence",
      "suggested_price": 6.95,
      "demand_score": 0,
      "competition_score": 0,
      "urgency_score": 0,
      "confidence": 0,
      "signal_listings": [{"title":"seed or lane name","source":"own|competitor|market_lane|insights"}],
      "suggested_tags": ["13 lowercase Etsy tags, each <=20 chars"],
      "suggested_keywords": ["5-7 short buyer search phrases"]
    }
  ]
}

Generate exactly ${count} ideas. Vary subjects and lanes. Do not output two ideas with the same main subject.`;
}

function fallbackIdeas(count: number, style: IdeaStyle, marketLanes: MarketLane[], competitorSeeds: BestsellerRow[]): NormalizedIdea[] {
  const styleFilter = (lane: (typeof SAFE_FALLBACK_LANES)[number]) => {
    if (style === "bookmarks") return lane.subject.toLowerCase().includes("bookmark");
    if (style === "funny") return lane.subject.toLowerCase().includes("funny") || lane.subject.toLowerCase().includes("duck");
    if (style === "folk") return /sampler|alphabet|pantry|flower|jar/.test(lane.subject.toLowerCase());
    return true;
  };

  const marketSubjects = marketLanes
    .map((lane) => lane.keyword.replace(/cross[- ]?stitch|pattern|pdf/gi, "").trim())
    .filter((term) => term.length > 2 && isSafeText(term))
    .slice(0, 4);

  const competitorSubjects = competitorSeeds
    .map((seed) => seed.keyword?.replace(/cross[- ]?stitch|pattern|pdf/gi, "").trim() || "")
    .filter((term) => term.length > 2 && isSafeText(term))
    .slice(0, 4);

  const extras = [...new Set([...marketSubjects, ...competitorSubjects])]
    .map((subject) => ({
      subject: subject
        .split(/\s+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" "),
      detail: "riffed from a high-demand scanned Etsy keyword lane",
      tags: [`${subject.slice(0, 18)}`, "cross stitch pdf", "pattern chart", "digital download"],
      keywords: [`${subject} cross stitch`, `${subject} pattern`, "cross stitch pdf"],
    }));

  const lanes = [...SAFE_FALLBACK_LANES.filter(styleFilter), ...extras];
  const used = new Set<string>();
  const ideas: NormalizedIdea[] = [];

  for (const lane of lanes) {
    if (ideas.length >= count) break;
    const title = style === "bookmarks" && !lane.subject.toLowerCase().includes("bookmark")
      ? `${lane.subject} Bookmark Cross Stitch Pattern`
      : `${lane.subject} Cross Stitch Pattern`;
    const key = lane.subject.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (used.has(key) || !isSafeText(title)) continue;
    used.add(key);

    const baseDemand = style === "all" ? 82 : 76;
    ideas.push({
      title: title.slice(0, 90),
      niche: "cross stitch pattern",
      product_type: "PDF cross stitch pattern",
      why_now: `Built from safe Etsy demand lanes; ${lane.detail}.`,
      target_buyer: "Beginner-to-intermediate stitchers looking for a giftable PDF pattern.",
      suggested_price: 6.95,
      demand_score: Math.max(62, baseDemand - ideas.length * 3),
      competition_score: 42 + (ideas.length % 4) * 6,
      urgency_score: 58 + (ideas.length % 5) * 5,
      confidence: 72 + (ideas.length % 4) * 4,
      signal_listings: [{ title: lane.subject, source: "deterministic_fallback" }],
      suggested_tags: [
        ...lane.tags,
        "xstitch pattern",
        "beginner pattern",
        "gift pattern",
        "pdf download",
        "dmc chart",
        "instant download",
      ].slice(0, 13),
      suggested_keywords: [
        ...lane.keywords,
        "cross stitch pattern",
        "pdf cross stitch",
        "beginner cross stitch",
      ].slice(0, 7),
    });
  }

  return ideas;
}

function normalizeIdeas(rawIdeas: RawIdea[], count: number): NormalizedIdea[] {
  const usedSubjects = new Set<string>();
  const normalized: NormalizedIdea[] = [];

  for (const raw of rawIdeas) {
    if (normalized.length >= count) break;

    let title = asString(raw.title).replace(/\s+/g, " ").trim();
    if (!title) continue;
    if (!/cross stitch/i.test(title)) {
      title = `${title} Cross Stitch Pattern`;
    }
    title = title.slice(0, 120);

    const tags = asStringArray(raw.suggested_tags)
      .map((tag) => tag.toLowerCase().slice(0, 20))
      .filter(Boolean)
      .slice(0, 13);
    const keywords = asStringArray(raw.suggested_keywords)
      .map((keyword) => keyword.toLowerCase().slice(0, 60))
      .filter(Boolean)
      .slice(0, 7);

    if (!isSafeText(`${title} ${tags.join(" ")} ${keywords.join(" ")}`)) continue;
    if (checkIdeaForIP({ title, tags, search_query: keywords.join(" ") })) continue;

    const subjectKey = title
      .toLowerCase()
      .replace(/cross[- ]?stitch|bookmark|pattern|pdf|digital|download|beginner|friendly/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join(" ");
    if (!subjectKey || usedSubjects.has(subjectKey)) continue;
    usedSubjects.add(subjectKey);

    normalized.push({
      title,
      niche: asString(raw.niche, "cross stitch pattern").slice(0, 80) || "cross stitch pattern",
      product_type: asString(raw.product_type, "PDF cross stitch pattern").slice(0, 80) || "PDF cross stitch pattern",
      why_now: asString(raw.why_now).slice(0, 1000) || null,
      target_buyer: asString(raw.target_buyer).slice(0, 500) || null,
      suggested_price: Math.max(3.95, Number(raw.suggested_price) || 6.95),
      demand_score: score(raw.demand_score, 55, 96, 74),
      competition_score: score(raw.competition_score, 20, 88, 52),
      urgency_score: score(raw.urgency_score, 42, 92, 64),
      confidence: score(raw.confidence, 58, 96, 76),
      signal_listings: Array.isArray(raw.signal_listings) ? raw.signal_listings.slice(0, 5) : [],
      suggested_tags: tags.length ? tags : ["cross stitch pdf", "pattern chart", "digital download"],
      suggested_keywords: keywords.length ? keywords : [title.toLowerCase(), "cross stitch pattern"],
    });
  }

  return normalized;
}

async function dedupeAgainstOwnShop(ideas: NormalizedIdea[]): Promise<{ kept: NormalizedIdea[]; droppedTitles: string[] }> {
  try {
    return await filterOutOwnDuplicates(ideas);
  } catch (err) {
    console.warn("[bestseller-ideas] own-shop dedupe failed:", (err as Error).message);
    return { kept: ideas, droppedTitles: [] };
  }
}

function insertIdeas(ideas: NormalizedIdea[]): ProductIdeaRow[] {
  if (ideas.length === 0) return [];
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO product_ideas
      (title, niche, product_type, why_now, target_buyer, suggested_price,
       demand_score, competition_score, urgency_score, confidence,
       signal_listings, suggested_tags, suggested_keywords, status)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
  `);

  const rows: ProductIdeaRow[] = [];
  const txn = db.transaction((items: NormalizedIdea[]) => {
    for (const idea of items) {
      const result = stmt.run(
        idea.title.slice(0, 200),
        idea.niche,
        idea.product_type,
        idea.why_now,
        idea.target_buyer,
        idea.suggested_price,
        idea.demand_score,
        idea.competition_score,
        idea.urgency_score,
        idea.confidence,
        JSON.stringify(idea.signal_listings),
        JSON.stringify(idea.suggested_tags.slice(0, 13)),
        JSON.stringify(idea.suggested_keywords.slice(0, 10)),
      );
      rows.push(db.prepare(`SELECT * FROM product_ideas WHERE id = ?`).get(result.lastInsertRowid) as ProductIdeaRow);
    }
  });

  txn(ideas);
  try { db.pragma("wal_checkpoint(TRUNCATE)"); } catch { /* non-fatal */ }
  return rows;
}

async function generateWithGemini(params: {
  apiKey: string;
  count: number;
  style: IdeaStyle;
  competitorSeeds: BestsellerRow[];
  ownWinners: OwnListing[];
  marketLanes: MarketLane[];
  insightTerms: InsightTerm[];
}): Promise<RawIdea[]> {
  const prompt = buildPrompt(params);
  const text = await callGeminiJSON(params.apiKey, prompt, { maxOutputTokens: 16384 });
  try {
    const parsed = JSON.parse(text) as { ideas?: RawIdea[] };
    return Array.isArray(parsed.ideas) ? parsed.ideas : [];
  } catch {
    const repaired = JSON.parse(repairJSON(text)) as { ideas?: RawIdea[] };
    return Array.isArray(repaired.ideas) ? repaired.ideas : [];
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { count?: number; style?: unknown };
  const count = Math.max(1, Math.min(20, Number(body.count) || 8));
  const style = normalizeStyle(body.style);

  const competitorSeeds = fetchTopSeeds(style, 18);
  const marketLanes = fetchMarketLanes(14);
  const insightTerms = fetchEtsyInsightTerms(10);

  let ownWinners: OwnListing[] = [];
  try {
    ownWinners = await getOwnTopPerformers(8);
  } catch (err) {
    console.warn("[bestseller-ideas] own-winner fetch failed:", (err as Error).message);
  }
  ownWinners = ownWinners.filter((winner) => isSafeText(winner.title));

  if (competitorSeeds.length === 0 && ownWinners.length === 0 && marketLanes.length === 0) {
    return NextResponse.json(
      { error: "No safe research seeds available yet. Run a cross-stitch Etsy scan first." },
      { status: 503 },
    );
  }

  let engine: "gemini" | "deterministic_fallback" = "deterministic_fallback";
  let rawIdeas: RawIdea[] = [];
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      rawIdeas = await generateWithGemini({
        apiKey,
        count,
        style,
        competitorSeeds,
        ownWinners,
        marketLanes,
        insightTerms,
      });
      engine = "gemini";
    } catch (err) {
      console.warn("[bestseller-ideas] Gemini failed; using deterministic fallback:", (err as Error).message);
    }
  }

  let normalized = normalizeIdeas(rawIdeas, count);

  if (normalized.length < count) {
    const fallback = fallbackIdeas(count, style, marketLanes, competitorSeeds);
    normalized = normalizeIdeas([...normalized, ...fallback], count);
    if (engine !== "gemini" || normalized.length > rawIdeas.length) {
      engine = rawIdeas.length > 0 ? "gemini" : "deterministic_fallback";
    }
  }

  const deduped = await dedupeAgainstOwnShop(normalized);
  normalized = deduped.kept.slice(0, count);

  if (normalized.length < count) {
    const fallback = fallbackIdeas(count + deduped.droppedTitles.length, style, marketLanes, competitorSeeds);
    const patched = normalizeIdeas([...normalized, ...fallback], count + deduped.droppedTitles.length);
    const secondPass = await dedupeAgainstOwnShop(patched);
    normalized = secondPass.kept.slice(0, count);
  }

  const rows = insertIdeas(normalized);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No safe, non-duplicate ideas survived filtering. Run a fresh scan or try another style." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ideas: rows,
    meta: {
      engine,
      style,
      ownWinnerCount: ownWinners.length,
      topOwnWinner: ownWinners[0]?.title ?? null,
      competitorSeedCount: competitorSeeds.length,
      topCompetitorSeed: competitorSeeds[0]?.title ?? null,
      marketLaneCount: marketLanes.length,
      topMarketLane: marketLanes[0]?.keyword ?? null,
      insightTermCount: insightTerms.length,
      topInsightTerm: insightTerms[0]?.term ?? null,
      droppedDuplicates: deduped.droppedTitles.length,
    },
  });
}
