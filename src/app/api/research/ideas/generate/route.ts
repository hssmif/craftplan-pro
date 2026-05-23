// POST /api/research/ideas/generate
//   Body: {
//     count?: number,
//     niche?: string,
//     focus?: "cross-stitch" | "wall-art" | "notion" | "all"
//   }
//
// Generates fresh product ideas grounded in the user's actual signals:
//   - Last 24h of live_sales (what's literally selling RIGHT NOW)
//   - Top 30 tracked_listings by sales_estimate (sustained sellers)
//   - Top 15 scan_keyword_results by demand_score (high-demand niches)
//   - Top 10 watched_listings by recent activity (sales velocity)
//
// FOCUS MODE: when `focus` is a category preset, signal rows are
// filtered with LIKE-pattern matching against the preset's tokens
// before reaching Gemini, AND the prompt enforces a hard constraint
// that every returned idea MUST fit the focus niche. This is the
// mechanism /cross-stitch uses so its idea engine doesn't return
// notion-template ideas just because the seller's recent scan data
// is notion-heavy. Default focus is "all" (legacy behavior).
//
// Why "grounded": the older opportunities/generate route works off a
// single import_id. This one pulls the full live picture so Gemini gets
// fresh data on what's selling THIS WEEK, not what was hot at scan time.
//
// Returns the inserted product_ideas rows so the UI can prepend them
// to the list without a roundtrip.
//
// Output contract: Gemini must return strict JSON of shape
// { ideas: [{ title, niche, product_type, why_now, target_buyer,
//   suggested_price, demand_score, competition_score, urgency_score,
//   confidence, signal_listings, suggested_tags, suggested_keywords }] }

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db"; // db helper — no checkpoint export

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_CHAIN = ["gemini-2.5-flash", "gemini-2.0-flash-lite"];

// ── Family-friendly content guardrail ─────────────────────────────────
// Per user 2026-05-16: their shop is family-friendly and must never
// contain occult / tarot / eye / hand / skull / etc. subjects regardless
// of what Gemini hallucinates. Applied to EVERY generation path (legacy
// POST flow AND the market-pulse strict-context flow below).
const HARAM_REGEX = /\b(tarot|wicca|wiccan|witchcraft|witchy|occult|pentagram|pentacle|pentagrams?|sigil(s)?|rune(s)?|ouija|planchette|cauldron|necromancer|necromancy|hexa?gram|wand-?(of|spell)|spirit\s+board|seance|grimoire|pagan|satan|satanic|demon|demonic|devil|hellfire|reaper|grim\s+reaper|ghost-?spirit|skull(s)?|skeleton(s)?|bones?-?cross-?stitch|anatomical|memento\s+mori|crystal\s+(ball|magic)|hand\s+of\s+(glory|fatima|hamsa)|hamsa|nazar|evil\s+eye|third\s+eye|all-?seeing\s+eye|eye\s+of\s+(horus|providence)|cthulhu|lovecraft|eldritch|mothman|cryptid|zodiac|astrology|astrological|natal\s+chart|moonchild|cult|crucifix|cross\s+(symbol|christian)|om\s+symbol|ganesha|krishna|shiva|buddha|goddess|deity|idol|cherub|putto|putti)\b/i;

// ── Focus presets ─────────────────────────────────────────────────────
// Each preset defines a label (used in the prompt's hard constraint)
// and a list of LIKE-tokens used to filter signal rows. Tokens are
// case-insensitive substring matches against title/category/niche/tag/
// keyword columns. Empty tokens array = no filtering (legacy mode).

interface FocusPreset {
  label: string;       // human-readable niche name shown to Gemini
  tokens: string[];    // SQL LIKE patterns (lowercase, no wildcards)
  // What product types make sense for this focus? Used to make the
  // prompt's hard constraint more specific so Gemini doesn't return,
  // e.g., notion templates under a cross-stitch focus just because
  // "pattern" appears in both vocabularies.
  productHint: string;
}

const FOCUS_PRESETS: Record<string, FocusPreset> = {
  "cross-stitch": {
    label: "cross stitch patterns",
    tokens: [
      "cross stitch",
      "cross-stitch",
      "xstitch",
      "needlepoint",
      "embroidery pattern",
      "stitching pattern",
    ],
    productHint:
      "PDF cross-stitch pattern charts (beginner-friendly, 8–18 DMC colors, instant download, $4–$6). Follow these PROVEN NalaAndStitch-style formulas — the top-selling patterns on Etsy right now use these exact structures:\n\nFORMULA 1 — NALAANDSTITCH COSTUME CHARACTER (HIGHEST SELLER): Animal character wearing a SPECIFIC elaborate costume or playing an unexpected role. The visual mismatch IS the hook — a tiny mouse dressed as a wizard, a bunny in a ballet tutu, a goose in a Victorian bonnet. Be SPECIFIC about costume details. GREAT examples: 'Mouse in Purple Wizard Robes with Gold Staff', 'Bunny in Pink Ballet Tutu with Pointe Shoes', 'Goose in Victorian Bonnet with Pearl Necklace and Parasol', 'Frog as Medieval Knight in Tiny Armor', 'Duck in Chef Apron Holding Rolling Pin', 'Raccoon in Cowboy Hat and Boots', 'Hamster in Astronaut Suit with Helmet', 'Hedgehog in Victorian Tea Dress Holding Teacup', 'Corgi in Wizard Hat Casting Spell', 'Capybara in Graduation Cap and Gown', 'Toad as Gentleman with Top Hat and Monocle', 'Cat in Renaissance Painter Beret with Tiny Canvas'.\n\nFORMULA 2 — Animal + Specific Prop (also top seller): Animal with ONE specific named prop. 'Duck in Rain Boots with Watering Can of Roses', 'Goose in Straw Hat', 'Duckling in Cowboy Hat', 'Bunny Holding Strawberry Basket', 'Cat with Oversized Coffee Mug', 'Goose in Pink Rain Boots', 'Duck in Chef Apron with Kiss the Chef Text'.\n\nFORMULA 3 — Food/Object Character: Kawaii food with animal features. 'Strawberry Snail', 'Boba Tea Cup with Kawaii Face', 'Mushroom with Flower Crown', 'Strawberry Duckling'.\n\nRULES: (1) ALWAYS name the SPECIFIC animal AND the SPECIFIC costume/prop — never vague like 'cute farm animal' or 'seasonal pattern'. (2) Formula 1 costume ideas outsell generic props — think 'what would be hilarious or adorable to see this animal wearing?'. (3) Unexpected combinations beat obvious ones: a mouse as a wizard princess beats a cat with a bow. (4) Cottagecore, Victorian, fantasy, kawaii aesthetics dominate. (5) Goose, duck, bunny, frog, mouse themes are proven top sellers.",
  },
  "wall-art": {
    label: "digital wall art",
    tokens: [
      "wall art",
      "printable art",
      "art print",
      "wall print",
      "poster",
      "digital print",
      "printable wall",
    ],
    productHint:
      "Printable digital wall art (PNG/JPG bundles, instant download). Each idea must be a visual subject + style + room/aesthetic — NOT a planner, template, or pattern.",
  },
  "notion": {
    label: "Notion templates",
    tokens: ["notion template", "notion planner", "notion dashboard", "notion system"],
    productHint:
      "Notion templates and dashboards. Each idea must be a Notion-native planner/system — NOT a PDF, printable, or pattern.",
  },
  "spreadsheet": {
    label: "spreadsheet templates (Google Sheets / Excel)",
    tokens: [
      "google sheets",
      "spreadsheet",
      "excel template",
      "budget tracker",
      "planner template",
      "digital planner",
      "finance tracker",
      "budget planner",
      "habit tracker",
    ],
    productHint:
      "Google Sheets and Excel templates as instant digital downloads (.xlsx). Each idea must be a specific spreadsheet product — budget tracker, planner, habit tracker, etc. — NOT a cross-stitch pattern, wall art, or Notion template.",
  },
  all: { label: "", tokens: [], productHint: "" },
};

function resolveFocus(raw: unknown): FocusPreset {
  const key = typeof raw === "string" ? raw.toLowerCase().trim() : "";
  return FOCUS_PRESETS[key] ?? FOCUS_PRESETS.all;
}

// Build a parameterized OR-chain of LIKE clauses against the supplied
// columns. Returns "" + [] when tokens is empty so callers can append
// nothing. All LIKE matches are anchored as %token% so partial matches
// work (e.g. "cross stitch pattern PDF" matches "cross stitch").
function buildFocusClause(columns: string[], tokens: string[]): {
  clause: string;
  params: string[];
} {
  if (tokens.length === 0) return { clause: "", params: [] };
  const parts: string[] = [];
  const params: string[] = [];
  for (const col of columns) {
    for (const tok of tokens) {
      parts.push(`LOWER(COALESCE(${col}, '')) LIKE ?`);
      params.push(`%${tok.toLowerCase()}%`);
    }
  }
  return { clause: `(${parts.join(" OR ")})`, params };
}

interface LiveSaleSignal {
  title: string;
  shop_name: string | null;
  price: number;
  niche: string | null;
  category: string | null;
  sold_delta: number;
  detected_at: string;
  url: string | null;
}

interface TrackedSignal {
  title: string;
  shop_name: string | null;
  price: number;
  favorites: number;
  sales_estimate: number;
  category: string | null;
  tags: string[];
  url: string | null;
}

interface CategorySignal {
  keyword: string;
  total_results: number;
  avg_price: number;
  avg_favorites: number;
  competition_level: string;
  demand_score: number;
  top_tags: string[];
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
  notes: string | null;
  generated_at: string;
  updated_at: string;
}

// ── Signal collection ─────────────────────────────────────────────────

function collectLiveSales(limit = 25, focusTokens: string[] = []): LiveSaleSignal[] {
  try {
    const db = getDb();
    // Pull the most recent sales from the last 24h. If we don't have any,
    // fall back to the most recent 25 we have at any age — better than
    // sending Gemini an empty signal block.
    const focus = buildFocusClause(["title", "niche", "category"], focusTokens);
    const focusFilter = focus.clause ? ` AND ${focus.clause}` : "";

    const recent = db
      .prepare(
        `SELECT title, shop_name, price, niche, category, sold_delta, detected_at, url
         FROM live_sales
         WHERE detected_at >= datetime('now', '-24 hours')${focusFilter}
         ORDER BY detected_at DESC
         LIMIT ?`,
      )
      .all(...focus.params, limit) as LiveSaleSignal[];
    if (recent.length > 0) return recent;

    const fallbackFilter = focus.clause ? ` WHERE ${focus.clause}` : "";
    return db
      .prepare(
        `SELECT title, shop_name, price, niche, category, sold_delta, detected_at, url
         FROM live_sales${fallbackFilter}
         ORDER BY detected_at DESC
         LIMIT ?`,
      )
      .all(...focus.params, limit) as LiveSaleSignal[];
  } catch {
    return []; // table doesn't exist yet — caller treats empty as "no signal"
  }
}

function collectTopTracked(limit = 30, focusTokens: string[] = []): TrackedSignal[] {
  try {
    const db = getDb();
    type Row = Omit<TrackedSignal, "tags"> & { tags: string | null };
    // tags is stored as JSON or comma-list — we LIKE-match the raw string
    // which catches both representations.
    const focus = buildFocusClause(["title", "category", "tags"], focusTokens);
    const focusFilter = focus.clause ? ` AND ${focus.clause}` : "";

    const rows = db
      .prepare(
        `SELECT title, shop_name, price, favorites, sales_estimate, category, tags, url
         FROM tracked_listings
         WHERE (sales_estimate > 0 OR favorites > 50)${focusFilter}
         ORDER BY sales_estimate DESC, favorites DESC
         LIMIT ?`,
      )
      .all(...focus.params, limit) as Row[];
    return rows.map((r) => ({
      ...r,
      tags: parseTagList(r.tags),
    }));
  } catch {
    return []; // table doesn't exist yet
  }
}

function collectTopCategories(limit = 15, focusTokens: string[] = []): CategorySignal[] {
  try {
    const db = getDb();
    // Pull from the most recent completed scan only — older scan data is
    // stale and would dilute the "what's hot now" signal.
    type Row = Omit<CategorySignal, "top_tags"> & { top_tags: string | null };
    const focus = buildFocusClause(["skr.keyword", "skr.top_tags"], focusTokens);
    const focusFilter = focus.clause ? ` AND ${focus.clause}` : "";

    const rows = db
      .prepare(
        `SELECT skr.keyword, skr.total_results, skr.avg_price, skr.avg_favorites,
                skr.competition_level, skr.demand_score, skr.top_tags
         FROM scan_keyword_results skr
         WHERE skr.scan_run_id = (
           SELECT id FROM scan_runs
           WHERE status = 'completed'
           ORDER BY started_at DESC
           LIMIT 1
         )${focusFilter}
         ORDER BY skr.demand_score DESC
         LIMIT ?`,
      )
      .all(...focus.params, limit) as Row[];
    return rows.map((r) => ({
      ...r,
      top_tags: parseTagList(r.top_tags),
    }));
  } catch {
    return []; // table doesn't exist yet
  }
}

function parseTagList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).slice(0, 13);
  } catch {
    // Not JSON — fall through to comma split
  }
  return raw
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 13);
}

// ── Prompt assembly ───────────────────────────────────────────────────

function buildPrompt(args: {
  count: number;
  niche: string | null;
  focus: FocusPreset;
  signalsAreFocusFiltered: boolean;
  liveSales: LiveSaleSignal[];
  topTracked: TrackedSignal[];
  topCategories: CategorySignal[];
  style?: "funny" | "bookmarks" | "folk" | "all";
  // Real Etsy listing titles from recent Research scans.  When non-empty,
  // we surface them in a dedicated DATA block so Gemini can use the proven
  // animal + accessory pairings as a creative seed for new variations.
  etsyBestsellers?: string[];
}): string {
  const { count, niche, focus, signalsAreFocusFiltered, liveSales, topTracked, topCategories, style, etsyBestsellers } = args;

  const liveSalesBlock =
    liveSales.length === 0
      ? "(no live sales detected yet — start the live tracker for fresher signals)"
      : liveSales
          .map(
            (s, i) =>
              `${i + 1}. "${s.title}" — ${s.shop_name || "unknown"} — $${s.price} — ${s.niche || s.category || "—"} — +${s.sold_delta} sold @ ${s.detected_at}`,
          )
          .join("\n");

  const trackedBlock =
    topTracked.length === 0
      ? "(no tracked listings yet — run a scan first)"
      : topTracked
          .map(
            (s, i) =>
              `${i + 1}. "${s.title}" — ${s.shop_name || "unknown"} — $${s.price} — ${s.favorites} favs — ~${s.sales_estimate} sales — tags: [${s.tags.slice(0, 6).join(", ")}]`,
          )
          .join("\n");

  const categoryBlock =
    topCategories.length === 0
      ? "(no category demand data — run a full scan first)"
      : topCategories
          .map(
            (c, i) =>
              `${i + 1}. "${c.keyword}" — demand ${c.demand_score}/100 — competition ${c.competition_level} — avg $${Math.round(c.avg_price)} / ${Math.round(c.avg_favorites)} favs — ${c.total_results.toLocaleString()} listings — top tags: [${c.top_tags.slice(0, 5).join(", ")}]`,
          )
          .join("\n");

  // "all" mixes every shelf — costumes, captions, dark/occult, folk.
  // Injected directly into the market-grounded prompt to force diverse
  // output instead of NalaAndStitch-cottagecore-only ideas.
  // HARD CONTENT POLICY — applied to EVERY prompt branch.  Seller's
  // shop is family-friendly; per user 2026-05-16, never generate any
  // occult, tarot, witchy, religious-symbol, anatomical, body-part,
  // skull, demon, or violent content under any circumstances.
  const HARD_BAN = `\n\nABSOLUTE CONTENT BAN — APPLIES TO EVERY IDEA, NO EXCEPTIONS:
The seller's shop is family-friendly.  Generating any of the following is a HARD FAILURE — the idea will be rejected even if the rest of it is good.  These subjects are FORBIDDEN as a hook, accessory, prop, background, or wrapper:
  • Eyes as a standalone subject (no all-seeing eye, no evil eye, no third eye, no Eye of Horus, no nazar, no eye on a hand, no floating eyeballs)
  • Hands as a standalone subject (no palmistry hands, no Hamsa, no Hand of Fatima, no Hand of Glory, no skeletal hands, no hand holding tarot card, no hand pose ANY religious significance)
  • Tarot cards, tarot spreads, tarot art, ANY card called "The ___" with arcana imagery
  • Witchcraft / wicca / paganism / occult symbols — pentagrams, pentacles, sigils, runes, ouija boards, planchettes, witch hats with significance, broomsticks-as-symbol, cauldrons-with-spells, scrying mirrors
  • Memento mori — skulls (human OR animal), skeletons, bones, deer/bird skulls with flowers, "anatomical" anything
  • Anatomical organs — hearts (anatomical), brains, lungs, eyes-as-organs, ribs, dissections
  • Crystals, herbs, potions, candles, moons, when arranged in WITCHY/OCCULT context (a single moon in a nursery design is OK; a moon-with-pentagram is NOT)
  • Religious symbols of any faith presented decoratively — crosses, crucifixes, om symbols, hindu deities, idols, gods/goddesses/spirits, angels-as-religious-figures, cherubs/putti
  • Demons, devils, satanic anything, hellfire, grim reapers, ghosts-as-spirit-entities
  • Astrology zodiacs, astrology charts, planetary alignment "natal" charts
  • Nudity, pin-ups, suggestive poses
  • Violence, weapons-as-hero (a knight's sword is OK as a costume prop; a bloody dagger is NOT)
  • Alcohol/drug iconography as the subject (a coffee mug is fine; a wine glass labelled "Witch's Brew" is not)
  • Cthulhu, Lovecraftian horrors, tentacled monsters
  • Cryptids posed as spiritual subjects (Mothman silhouette is generally OK as a "cute cryptid"; Mothman with summoning circle is NOT)

If your idea contains ANY of the above, DELETE IT and replace with a safe cottagecore animal-costume or sampler idea.  Subject must be SAFE FOR A CHILD'S BEDROOM — cute animals, kitchen samplers, botanical flowers (non-poisonous mood), seasonal motifs, snarky captions, fantasy bookmarks (key/bee/ladybug/sword-as-prop/rose), photoreal pet portraits, jam jar samplers, vintage sampler grids.`;

  const allMixedBlock =
    style === "all"
      ? `\n\nSTYLE DIRECTIVE — MIX EVERY CROSS-STITCH SHELF (force diversity):
The seller wants a VARIETY PACK across all four bestselling FAMILY-FRIENDLY cross-stitch shelves on Etsy. Spread the ${count} ideas roughly evenly across these four formulas — do NOT concentrate on just one:
  A) NALAANDSTITCH COSTUME CHARACTER — animal in unexpected elaborate cottagecore/fantasy costume (e.g. 'Mouse in Purple Wizard Robes Cross Stitch Pattern', 'Goose in Victorian Bonnet Cross Stitch Pattern').
  B) SNARKY CAPTION ANIMAL — animal + short witty caption (e.g. 'Frog "Not My Problem" Cross Stitch Pattern', 'Cat "Not Before Coffee" Cross Stitch Pattern').
  C) BOOKMARK / FUNCTIONAL CROSS-STITCH — single elongated motif designed for a bookmark with tassel (e.g. 'Fantasy Key Cross Stitch Bookmark Pattern', 'Honey Bee Cross Stitch Bookmark Pattern', 'Cottagecore Ladybug Cross Stitch Bookmark Pattern').
  D) SAMPLER COLLECTION — grid/collection of small motifs on one design (e.g. 'Jam Jar Sampler Cross Stitch Pattern', 'Mini Cottagecore Motif Grid Cross Stitch Pattern', 'Vintage Sewing Sampler Cross Stitch Pattern').
Aim for ${Math.max(1, Math.floor(count / 4))} ideas in each formula bucket. Animal/subject can NOT repeat across the ${count} ideas.${HARD_BAN}`
      : "";

  const funnyStyleBlock =
    style === "funny"
      ? `\n\nSTYLE DIRECTIVE — FUNNY / SNARKY CAPTIONS (NalaAndStitch formula):
Every idea MUST follow this formula: [Animal or creature] + [short snarky, relatable, or absurdist caption stitched onto the design].
The caption IS the product hook — it's what makes someone click "add to cart" and tag a friend.
Caption tone: dry wit, deadpan, mild self-deprecating humor, or Gen-Z irony. Keep captions SHORT (2–6 words).
GREAT examples (use this energy):
  - Frog "Not My Problem" Cross Stitch
  - Duck "I'm Fine Everything Is Fine" Cross Stitch
  - Cat "Cool Story" Cross Stitch
  - Raccoon "Chaos Mode Activated" Cross Stitch
  - Dog "Send Help" Cross Stitch
  - Axolotl "Still Figuring It Out" Cross Stitch
  - Duck "Kiss the Chef" Cross Stitch (holding spatula, wearing apron)
  - Goose "Main Character Energy" Cross Stitch (wearing sunglasses + straw hat)
  - Cat "Not Before Coffee" Cross Stitch (holding oversized coffee mug)
  - Frog "Unbothered" Cross Stitch (sitting in tiny armchair)
BAD examples (do NOT produce these — too generic, no hook):
  - "Cute Frog Cross Stitch" (no caption = no differentiation)
  - "Funny Cat Cross Stitch" (tells buyer nothing)
  - "Adorable Animal Pattern" (zero personality)
The title field MUST include the animal AND the caption. Put the caption in quotes inside the title, e.g.: 'Raccoon "Chaos Mode Activated" Cross Stitch Pattern'.`
      : "";

  const focusBlock = focus.tokens.length
    ? `\n\nHARD CONSTRAINT — FOCUS NICHE: "${focus.label}".
Every single idea you return MUST be a "${focus.label}" product. ${focus.productHint}
If a signal below does not fit "${focus.label}", IGNORE IT — do not use it as the basis for an idea, and do not pad the output with unrelated niches. If you cannot generate ${count} ideas inside "${focus.label}", return FEWER ideas. Returning a planner/template/wall-art idea under a "${focus.label}" focus is a hard failure.${
        signalsAreFocusFiltered
          ? ""
          : ` Note: signal data below has NO "${focus.label}" rows — draw on your general knowledge of what sells in this niche on Etsy right now (subjects, styles, color palettes, seasonal hooks).`
      }`
    : "";

  const nicheConstraint = niche
    ? `\n\nUSER NICHE HINT: prioritize ideas inside the "${niche}" niche. Stay close to it; don't drift.`
    : "";

  // Real Etsy bestseller titles from the most recent Research scan,
  // surfaced as a creative seed.  These are the richest signal we have:
  // exact titles that buyers are clicking RIGHT NOW (e.g. "Goose in
  // Straw Hat Cross Stitch Pattern").  Gemini extrapolates the visual
  // formula — animal + named accessory — and generates non-overlapping
  // variations.  Omitted entirely when the array is empty so behaviour
  // is unchanged for sessions that haven't scanned yet.
  const bestsellersBlock =
    etsyBestsellers && etsyBestsellers.length > 0
      ? `\n\nDATA — PROVEN ETSY BESTSELLERS (actual titles currently selling — generate VARIATIONS of these formulas, not copies):
${etsyBestsellers.map((t, i) => `${i + 1}. "${t}"`).join("\n")}

Study the animal + accessory formula in these titles. Generate NEW variations using DIFFERENT animal + DIFFERENT accessory/costume combos that don't exist yet in this list. These proven titles show what buyers want — your ideas should follow the same visual specificity.`
      : "";

  // Funny mode bypasses the market-grounded prompt entirely.  The
  // NalaAndStitch "animal + snarky caption" formula is its own product
  // category — the hook is the caption, not signal-based demand
  // evidence.  Trying to ground every funny idea in tracked-listings
  // data was producing generic ideas because Gemini would either
  // anchor on whatever non-funny signals existed (returning irrelevant
  // niches like wedding stationery) or refuse to invent when no
  // signals existed at all (returning the "no signals" error path).
  // This early return swaps in a creative prompt that draws on
  // Gemini's general knowledge of the snarky-cross-stitch market.
  // Output schema is identical to the market-grounded path below so
  // the same card renderer in page.tsx works without changes.
  if (style === "funny") {
    return `You are a creative cross-stitch pattern designer specializing in NalaAndStitch-style Etsy bestsellers. Generate ${count} ready-to-stitch funny, whimsical pattern ideas.

NalaAndStitch sells thousands of patterns using these two formulas — use BOTH, but prioritize Formula 1:

FORMULA 1 — VISUAL COSTUME CHARACTER (PRIMARY — highest converting on Etsy):
Animal character in an UNEXPECTED, ELABORATE costume or role. The humor and charm come from the VISUAL MISMATCH — a tiny mouse dressed as a wizard princess, a bunny in a ballet tutu, a goose in a Victorian bonnet with pearls. Be SPECIFIC about every costume detail — NOT "bunny in hat" but "Bunny in Pink Ballet Tutu and Satin Pointe Shoes".
GREAT examples:
  - Mouse in Purple Wizard Robes with Gold Star Staff Cross Stitch Pattern
  - Bunny in Pink Ballet Tutu and Satin Pointe Shoes Cross Stitch Pattern
  - Frog as Medieval Knight in Tiny Silver Armor with Shield Cross Stitch Pattern
  - Raccoon in Cowboy Hat and Boots Strumming Guitar Cross Stitch Pattern
  - Hamster in Full NASA Astronaut Suit with Helmet Cross Stitch Pattern
  - Hedgehog in Victorian Tea Dress Holding Fine China Teacup Cross Stitch Pattern
  - Crow in Baroque Opera Cape with Tiny Candelabra Cross Stitch Pattern
  - Capybara in Graduation Cap and Gown Holding Diploma Cross Stitch Pattern
  - Axolotl as Tiny Ballerina in Sparkly Tutu and Flower Crown Cross Stitch Pattern
  - Otter in a Three-Piece Business Suit Reading Tiny Newspaper Cross Stitch Pattern
  - Quokka in Hawaiian Shirt and Sunglasses Sipping Cocktail Cross Stitch Pattern
  - Platypus in Chef Hat and Apron Cooking Gourmet Meal Cross Stitch Pattern
  - Penguin in Tuxedo and Top Hat Playing Tiny Piano Cross Stitch Pattern
  - Pangolin in Renaissance Painter Beret Holding Tiny Canvas Cross Stitch Pattern
  - Narwhal in Full Rock Star Outfit with Electric Guitar Cross Stitch Pattern
  - Goose in Victorian Bonnet with Pearl Necklace and Lace Parasol Cross Stitch Pattern
  - Wombat in Judge Robes Banging Tiny Gavel Cross Stitch Pattern
  - Toad as Gentleman Scholar in Top Hat with Monocle and Pocket Watch Cross Stitch Pattern
  - Secretary Bird in Lawyer Suit Carrying Briefcase Cross Stitch Pattern
  - Sloth in Yoga Pants Doing Meditation with Tiny Candles Cross Stitch Pattern
  - Mantis Shrimp in Lab Coat as Tiny Scientist Cross Stitch Pattern
  - Corgi in Full Royalty Crown and Velvet Cape Cross Stitch Pattern
  - Duck in Yellow Rain Boots with Watering Can of Roses Cross Stitch Pattern
  - Cat in Renaissance Painter Beret Holding Tiny Canvas Cross Stitch Pattern

FORMULA 2 — SNARKY CAPTION ANIMAL (secondary — also bestselling):
Animal + short snarky, relatable, or absurdist caption that appears as stitched text on the design.
GREAT examples:
  - Frog "Not My Problem" Cross Stitch Pattern
  - Duck "I'm Fine Everything Is Fine" Cross Stitch Pattern
  - Cat "Not Before Coffee" Cross Stitch Pattern (holding oversized mug)
  - Raccoon "Chaos Mode Activated" Cross Stitch Pattern
  - Goose "Main Character Energy" Cross Stitch Pattern (sunglasses + straw hat)
  - Opossum "This Is Fine" Cross Stitch Pattern

GENERATION RULES:
1. Aim for at least ${Math.ceil(count * 0.65)} Formula 1 (visual costume character) ideas — they outsell captions
2. Every costume must be SPECIFIC and SURPRISING — the more unexpected the pairing, the better it sells
3. Vary the animals WIDELY and include unexpected/rare ones: mouse, frog, bunny, goose, duck, raccoon, hedgehog, toad, corgi, capybara, axolotl, hamster, crow, cat, opossum, otter, quokka, platypus, penguin, pangolin, narwhal, wombat, secretary bird, sloth, mantis shrimp, tardigrade, cassowary, red panda — pick unexpected ones first
4. Costume aesthetics to draw from — MIX CLASSIC AND MODERN: Victorian, fantasy/wizard, ballet/dance, medieval knight, space/NASA, cottagecore, Renaissance, opera/baroque, cowboy, academia, corporate/office worker, celebrity chef, rockstar/musician, yoga/wellness, judge/lawyer, scientist/lab, royal/monarchy, barista, graduation, detective noir — the MORE unexpected the animal+costume pairing, the better it sells
5. The BEST ideas have MAXIMUM visual absurdity — imagine the funniest possible thing an animal could be dressed as that you would NEVER expect. A tardigrade in a tiny tuxedo, a wombat as a judge, a mantis shrimp as a scientist — these are funny because the pairing is genuinely surprising and specific.
6. BAD (too generic): "Cute Bunny Cross Stitch", "Funny Frog Pattern", "Bunny in Hat" — these have ZERO specificity and will not sell

OUTPUT — return ONLY a JSON object with this exact shape, no prose, no code fences:
{
  "ideas": [
    {
      "title": "string — [Specific Animal in Specific Costume] Cross Stitch Pattern OR [Animal] \\"[Caption]\\" Cross Stitch Pattern (max 80 chars)",
      "niche": "funny cross stitch",
      "product_type": "PDF cross stitch pattern",
      "why_now": "string — explain the visual appeal and which buyer buys this. Example: 'NalaAndStitch costume-character formula — bunny in unexpected elaborate ballet costume drives impulse buys and gift tags; cottagecore + whimsy is peaking on Etsy right now.'",
      "target_buyer": "string — who buys this and why (1 sentence)",
      "suggested_price": number (NalaAndStitch range $4-$8),
      "demand_score": number 0-100 (REALISTIC — do not put 90+ on every idea),
      "competition_score": number 0-100 (HIGHER = more crowded; lower is better for the seller),
      "urgency_score": number 0-100,
      "confidence": number 0-100 (REALISTIC — do not put 90+ on every idea),
      "signal_listings": [],
      "suggested_tags": ["13 Etsy tags mixing the animal, costume details, 'cross stitch', 'funny', 'cute', 'whimsical', 'gift'. Each <=20 chars, lowercase, no commas."],
      "suggested_keywords": [
        "5-7 SHORT Etsy-search phrases, each 2-4 words MAX, ordered broadest first.",
        "Examples: 'funny bunny cross stitch', 'wizard mouse pattern', 'Victorian animal stitch', 'cute cross stitch', 'whimsical animal pattern'.",
        "These are typed verbatim into Etsy search — they MUST return real results."
      ]
    }
  ]
}

Generate exactly ${count} ideas. NO two ideas can use the same animal. Push for SURPRISING, HYPER-SPECIFIC costume combinations that feel fresh and original.${HARD_BAN}`;
  }

  // "bookmarks" — single elongated motif designed to be stitched onto
  // a cross-stitch bookmark with a tassel.  Different Etsy shelf —
  // buyers are book lovers + crafty gift shoppers.  Subjects are
  // small, charming, instantly readable from a bookshelf.
  // (The retired "weird" branch — dark/occult/tarot — has been
  // removed per user 2026-05-16.)
  if (style === "bookmarks") {
    return `You are a creative cross-stitch designer specializing in CROSS-STITCH BOOKMARK patterns.  Generate ${count} family-friendly bookmark designs — these are LONG NARROW patterns (~30 wide × 100 tall) stitched onto Aida cloth strips, finished with a tassel, used as functional book accessories.

USE THESE 4 BESTSELLING BOOKMARK FORMULAS — mix all four across the batch:

FORMULA A — SINGLE FANTASY OBJECT ON GINGHAM:
A single ornate fantasy object centered vertically on a gingham/checked background.  Object is usually gold, jewel-toned, or pastel.
Examples: 'Fantasy Gold Key with Pink Heart Gem Cross Stitch Bookmark Pattern', 'Magic Wand with Crescent Charm Cross Stitch Bookmark Pattern', 'Ornate Skeleton Key Cross Stitch Bookmark Pattern' [skeleton key = a TYPE of antique key, NOT a bone skull], 'Royal Crown with Ruby Cross Stitch Bookmark Pattern', 'Treasure Chest Cross Stitch Bookmark Pattern'.

FORMULA B — CUTE BUG / SMALL ANIMAL ON GINGHAM:
One small charming insect or tiny animal on gingham/checked background.
Examples: 'Honey Bee on Yellow Gingham Cross Stitch Bookmark Pattern', 'Ladybug on Yellow Gingham Cross Stitch Bookmark Pattern', 'Tiny Mouse Reading a Book Cross Stitch Bookmark Pattern', 'Cottagecore Butterfly Cross Stitch Bookmark Pattern', 'Snail with Tiny Flower Crown Cross Stitch Bookmark Pattern'.

FORMULA C — BOTANICAL VINE / FLORAL STEM:
Vertical floral vine or single flower stem — climbing roses, lavender, sunflowers.
Examples: 'Climbing Rose Vine Cross Stitch Bookmark Pattern', 'Lavender Stem Cross Stitch Bookmark Pattern', 'Wildflower Bouquet Cross Stitch Bookmark Pattern', 'Sunflower Stem Cross Stitch Bookmark Pattern', 'Cherry Blossom Branch Cross Stitch Bookmark Pattern'.

FORMULA D — FANTASY WEAPON / FANTASY PROP:
A decorative fantasy prop styled as a fancy object — NOT a violent weapon, treated as a fairy-tale ornament with roses or flowers wrapped around it.
Examples: 'Fantasy Sword with Rose Vine Cross Stitch Bookmark Pattern', 'Magic Staff with Flower Crystal Cross Stitch Bookmark Pattern', 'Ornate Quill Pen with Ink Drop Cross Stitch Bookmark Pattern', 'Compass with Floral Border Cross Stitch Bookmark Pattern', 'Hot Air Balloon Cross Stitch Bookmark Pattern'.

GENERATION RULES:
1. Every title must include "Cross Stitch Bookmark Pattern" exactly once.
2. Subject must be SINGLE and ELONGATED so it fits a 30×100 bookmark strip.
3. Cottagecore / kawaii / pastel aesthetic — no dark moody themes.
4. Price range $3-$6 (bookmarks are quick stitches; lower price than full hoop designs).
5. Backgrounds: pastel gingham, plain Aida cream, or solid pastel.
${HARD_BAN}

OUTPUT — return ONLY a JSON object with this exact shape, no prose, no code fences:
{
  "ideas": [
    {
      "title": "string — [Subject] Cross Stitch Bookmark Pattern (max 80 chars)",
      "niche": "cross stitch bookmark",
      "product_type": "PDF cross stitch pattern",
      "why_now": "string — explain appeal + buyer (book lovers, gift shoppers, beginner stitchers wanting a quick win)",
      "target_buyer": "string — who buys this (1 sentence)",
      "suggested_price": number (range $3-$6),
      "demand_score": number 0-100 (REALISTIC),
      "competition_score": number 0-100,
      "urgency_score": number 0-100,
      "confidence": number 0-100,
      "signal_listings": [],
      "suggested_tags": ["13 Etsy tags. Include 'cross stitch pattern', 'bookmark', subject, audience ('book lover gift', 'reader gift'), and aesthetic ('cottagecore', 'kawaii'). Each <=20 chars, lowercase."],
      "suggested_keywords": [
        "5-7 SHORT Etsy-search phrases, each 2-4 words MAX.",
        "Examples: 'cross stitch bookmark','floral bookmark pattern','fantasy bookmark stitch','reader gift cross stitch'."
      ]
    }
  ]
}

Generate exactly ${count} ideas. No two ideas may repeat the same subject.`;
  }

  // RETIRED — placeholder so the old branch's closing brace + the
  // historical comment that follows still align.  Never reached because
  // style="weird" is normalised to "all" upstream.
  if ((style as string) === "weird") {
    return `You are a creative cross-stitch designer specializing in DARK / OCCULT / WEIRD patterns. Generate ${count} ready-to-stitch ideas in the witchy / gothic / surreal-absurd shelf — a totally separate Etsy niche from cute cottagecore.

USE THESE 4 BESTSELLING FORMULAS — mix all four across the batch (roughly equal weight):

FORMULA A — TAROT CARD CROSS STITCH:
Pattern shaped like a major-arcana tarot card with full ornate frame, a CENTRAL motif, and a "THE ___" name plaque at the bottom. Re-imagined cards on objects/animals are a hit.
Examples: 'The Coffee Tarot Cross Stitch Pattern' (skeleton hand holding steaming mug), 'The Cat Tarot Cross Stitch Pattern' (black cat with moon), 'The Wine Tarot Cross Stitch Pattern' (skeletal hand pouring wine glass), 'The Books Tarot Cross Stitch Pattern' (stack of grimoires with candle), 'The Mushroom Tarot Cross Stitch Pattern' (red amanita with crescent moon).

FORMULA B — MEMENTO MORI / SKULL + FLOWERS:
Animal or human skull centered, encircled by botanical wreath of moody flowers (poppies, roses, foxglove, wisteria) on dark background. Gothic Victorian taxidermy-illustration vibe.
Examples: 'Bird Skull and Wildflowers Cross Stitch Pattern', 'Deer Skull with Poppy Wreath Cross Stitch Pattern', 'Fox Skull Surrounded by Roses Cross Stitch Pattern', 'Cat Skull with Lavender and Moths Cross Stitch Pattern', 'Raven Skull and Belladonna Cross Stitch Pattern'.

FORMULA C — WITCHY / OCCULT SAMPLER:
Botanical sampler of witchy herbs, mushrooms, crystals, candles, moths, hands, moons. Labelled like an apothecary chart.
Examples: 'Witchy Herb Apothecary Sampler Cross Stitch Pattern', 'Mushroom Identification Chart Cross Stitch Pattern', 'Moon Phases with Crystals Cross Stitch Pattern', 'Tarot Spread Layout Cross Stitch Pattern', 'Hand of Glory with Candles Cross Stitch Pattern'.

FORMULA D — ABSURD / SURREAL HUMOR:
Unexpected pairings that are funny because they're WEIRD, not cute. Cryptid creatures, deep-sea horrors, body parts as flowers, food with eyeballs, anatomical hearts.
Examples: 'Anatomical Heart with Flowers Cross Stitch Pattern', 'Eyeball Bouquet Cross Stitch Pattern', 'Cryptid Mothman Portrait Cross Stitch Pattern', 'Deep Sea Anglerfish with Bioluminescence Cross Stitch Pattern', 'Tongue with Pierced Tooth Cross Stitch Pattern'.

GENERATION RULES:
1. ZERO cottagecore-cute-animal-in-costume patterns. No bunnies in bonnets, no geese in aprons, no frogs as medieval knights, no mice in wizard robes, NO NalaAndStitch formula. If your idea sounds like "[cute animal] in [Victorian/wizard/ballet/knight/farmer] costume", DELETE IT and try again.
2. Color palette skew: BLACK / DEEP NAVY / DEEP BURGUNDY backgrounds with muted floral pops (dusty rose, sage, ochre, plum). Or rich black + bone-white + blood red.
3. Subjects ALLOWED: skulls (animal & human), tarot card layouts, mushrooms (esp. amanita, fly agaric), moons, crystals, herbs, skeletons, skeletal hands, candles, moths, ravens, snakes, eyes, anatomical hearts, daggers, potions, witchy alphabets, gothic florals, deep-sea horrors, cryptids (mothman, jersey devil), occult symbols.
4. Subjects FORBIDDEN: bunnies in costumes, geese in bonnets, ducks in rain boots, frog knights/gentlemen/wizards, mice in robes, hamsters in suits, raccoons playing instruments, axolotls in tutus, kawaii food characters, ANY "[cute animal] + [costume]" formula. If a "weird" idea is just "frog in occult robes" — that's still NalaAndStitch, REJECT IT.
5. Every title must include "Cross Stitch Pattern" exactly once.
6. The MORE niche/dark/weird the subject, the better. A skull is fine. A skull-with-flowers-and-moths is BETTER. A "Tarot of the Skeleton Bride" card is BEST.

FINAL REMINDER — ABSOLUTE BAN ON ANIMAL PROTAGONISTS.
If ANY of these animals appears as the SUBJECT or PROTAGONIST of your idea, the idea is INVALID — even if the wrapper is "Tarot card" or "alchemist" or "witch" or "necromancer":
  bunny, rabbit, goose, duck, frog, mouse, cat, dog, fox, owl, raven, crow, hamster, hedgehog, mole, raccoon, opossum, axolotl, capybara, otter, sloth, snail, cthulhu, octopus, jellyfish, deer, bird, bear, wolf
INVALID examples (DO NOT GENERATE — these are still NalaAndStitch with dark paint on top):
  - "Cthulhu's Teacup Cross Stitch Pattern"  (animal as subject)
  - "The Alchemist Tarot Cross Stitch Pattern" featuring a rabbit  (animal in costume = banned)
  - "Witch Cat Cross Stitch Pattern"  (animal as witch = banned)
  - "Frog Necromancer Cross Stitch Pattern"  (animal in occult role = banned)
  - "Rabbit Wizard Tarot Cross Stitch Pattern"  (animal + tarot wrapper = still banned)
  - "Cat Reading Tarot Cards Cross Stitch Pattern"  (animal centered = banned)

VALID examples (THESE are what to generate):
  - "The Coffee Tarot Cross Stitch Pattern" — central image is a skeletal hand holding a steaming mug, no animal anywhere
  - "Anatomical Human Heart with Poppies Cross Stitch Pattern" — heart + flowers, no animal
  - "Witchy Herb Apothecary Sampler Cross Stitch Pattern" — labelled herb chart, no animal
  - "Bird Skull and Wildflower Wreath Cross Stitch Pattern" — animal SKULL is fine (it's a skull, not a live animal), wreath of flowers around it
  - "Moon Phases with Crystal Border Cross Stitch Pattern" — moons + crystals, no animal
  - "Hand of Glory with Black Candles Cross Stitch Pattern" — skeletal hand, candles, no animal
  - "Mushroom Identification Chart Cross Stitch Pattern" — botanical, no animal
  - "Tarot Spread with Pentacle Layout Cross Stitch Pattern" — tarot cards + pentacle, no animal
  - "Cryptid Mothman Silhouette Cross Stitch Pattern" — cryptid silhouette as subject (NOT in a cute outfit, just a creature shape)
  - "Pressed Belladonna and Foxglove Specimen Cross Stitch Pattern" — botanical specimen
  - "Ouija Board with Planchette Cross Stitch Pattern" — object, no animal
  - "Skeletal Wedding Couple Cross Stitch Pattern" — skeletons, no animals

RULE OF THUMB: If you can replace your subject with "a cute animal" and the title still makes sense, the idea is INVALID. The subject must be an OBJECT (tarot card, skull, herb, mushroom, candle, moon, hand, heart, ouija board, crystal, runes, sigil) — not a creature.

OUTPUT — return ONLY a JSON object with this exact shape, no prose, no code fences:
{
  "ideas": [
    {
      "title": "string — [Subject Name] Cross Stitch Pattern (max 80 chars)",
      "niche": "dark cross stitch",
      "product_type": "PDF cross stitch pattern",
      "why_now": "string — explain the visual appeal + buyer (witchy/dark aesthetic Etsy shelf is consistently top-100 in needlework, especially Q3-Q4)",
      "target_buyer": "string — who buys this (1 sentence)",
      "suggested_price": number (range $4-$8),
      "demand_score": number 0-100 (REALISTIC),
      "competition_score": number 0-100,
      "urgency_score": number 0-100,
      "confidence": number 0-100,
      "signal_listings": [],
      "suggested_tags": ["13 Etsy tags. Mix: 'cross stitch pattern', specific subject ('skull','tarot','witchy'), aesthetic ('gothic','dark academia','memento mori'), audience ('witchy gift'). Each <=20 chars, lowercase."],
      "suggested_keywords": [
        "5-7 SHORT Etsy-search phrases, each 2-4 words MAX, ordered broadest first.",
        "Examples: 'witchy cross stitch','tarot cross stitch','skull cross stitch','memento mori pattern','dark academia stitch'."
      ]
    }
  ]
}

Generate exactly ${count} ideas. No two ideas may repeat the same subject. Make each ${count >= 4 ? "roughly evenly spread across the 4 formulas above" : "use a different formula"}.`;
  }

  // "folk" — Folk Art / Mandala / Floral Sampler / Photoreal animals.
  // Different shelf entirely — buyers are traditional-craft sampler
  // enthusiasts, not impulse-buy gift shoppers.  Tends toward HIGHER
  // stitch counts and HIGHER prices because patterns are "heirloom".
  if (style === "folk") {
    return `You are a creative cross-stitch designer specializing in TRADITIONAL FOLK ART, MANDALA SAMPLERS, and PHOTOREAL animal patterns. Generate ${count} ready-to-stitch ideas in the heirloom-pattern shelf — buyers are serious stitchers looking for project-grade designs, not impulse gifts.

USE THESE 4 BESTSELLING FORMULAS — mix all four across the batch:

FORMULA A — FOLK ART MANDALA / SAMPLER:
Symmetrical grid sampler of stylized folk-art flowers, tulips, lotuses, rosettes, in bold saturated colors (red, teal, gold, navy, forest, orange). Inspired by Polish/Ukrainian/Mexican folk embroidery.
Examples: 'Folk Art Tulip Sampler Cross Stitch Pattern', 'Polish Folk Mandala Cross Stitch Pattern', 'Mexican Otomi Flower Grid Cross Stitch Pattern', 'Ukrainian Rushnyk Floral Cross Stitch Pattern', 'Scandinavian Folk Sampler Cross Stitch Pattern'.

FORMULA B — PHOTOREAL ANIMAL PORTRAIT:
Realistic illustrated animal head/face, often with neutral or pastel background, painted-illustration style. NOT cute kawaii — more like a fine-art portrait.
Examples: 'Curious Goose Portrait Cross Stitch Pattern', 'Highland Cow Photoreal Cross Stitch Pattern', 'Mallard Duck Portrait Cross Stitch Pattern', 'Barn Owl Photoreal Cross Stitch Pattern', 'Red Fox Realistic Portrait Cross Stitch Pattern'.

FORMULA C — BOTANICAL HERBARIUM SAMPLER:
Vintage-illustration botanical chart — pressed flowers, herbs, mushrooms, leaves arranged in scientific specimen layout with labels.
Examples: 'Pressed Wildflower Herbarium Cross Stitch Pattern', 'Vintage Mushroom Chart Cross Stitch Pattern', 'Apothecary Herb Sampler Cross Stitch Pattern', 'Botanical Leaf Identification Cross Stitch Pattern', 'Wild Berry Botanical Chart Cross Stitch Pattern'.

FORMULA D — GEOMETRIC / QUILT-PATTERN SAMPLER:
Repeating geometric blocks like a quilt — diamonds, stars, chevrons, fractal-like spirals — bold color palettes.
Examples: 'Geometric Star Quilt Cross Stitch Pattern', 'Sacred Geometry Mandala Cross Stitch Pattern', 'Bohemian Diamond Sampler Cross Stitch Pattern', 'Art Deco Sunburst Cross Stitch Pattern', 'Compass Rose Geometric Cross Stitch Pattern'.

GENERATION RULES:
1. ZERO cute cottagecore animals in costumes. No bunnies in bonnets. No NalaAndStitch formula. If your idea is "[cute animal] in [folk costume]" — REJECT IT, that's the wrong shelf.
2. Designs are PROJECT-GRADE — buyers expect 100+ hours of stitching.
3. Color palette is RICH and SATURATED — folk reds, forest greens, mustard, teal, navy, terracotta — NOT pastels.
4. Subjects ALLOWED: folk-art flower samplers (Polish/Ukrainian/Mexican/Scandinavian), photoreal animal portraits (NOT in costumes — just realistic head/face), botanical herbariums (pressed flowers, mushroom charts, leaf identification), geometric mandalas, quilt-style blocks, sacred geometry, traditional samplers, art-deco motifs.
5. Subjects FORBIDDEN: bunny in folk costume, goose in folk dress, duck in folk hat, any "[animal] + [folk outfit]" formula — those go in the "funny" bucket. THIS bucket is for samplers, mandalas, photoreal animal HEADS (no body costumes), and botanicals.
6. Every title must include "Cross Stitch Pattern" exactly once.
7. Suggested price range is HIGHER than cottagecore ($6-$12) because pattern complexity is much greater.

FINAL REMINDER — DO NOT CHEAT BY DRESSING UP ANIMALS IN FOLK OUTFITS.
"Goose in Hungarian Embroidered Vest" is still NalaAndStitch. REJECT. Instead: "Hungarian Folk Tulip Sampler", "Highland Cow Photoreal Portrait" (no costume), "Pressed Wildflower Herbarium Chart".

OUTPUT — return ONLY a JSON object with this exact shape, no prose, no code fences:
{
  "ideas": [
    {
      "title": "string — [Subject + Style] Cross Stitch Pattern (max 80 chars)",
      "niche": "folk art cross stitch",
      "product_type": "PDF cross stitch pattern",
      "why_now": "string — explain the appeal + buyer (heirloom-pattern stitchers, dedicated hobbyists, project-grade gift)",
      "target_buyer": "string — who buys this (1 sentence)",
      "suggested_price": number (range $6-$12 — higher because heirloom-grade),
      "demand_score": number 0-100 (REALISTIC),
      "competition_score": number 0-100,
      "urgency_score": number 0-100,
      "confidence": number 0-100,
      "signal_listings": [],
      "suggested_tags": ["13 Etsy tags. Mix: 'cross stitch pattern', subject ('folk art','mandala','botanical'), style ('vintage','heirloom'), audience ('advanced stitcher'). Each <=20 chars, lowercase."],
      "suggested_keywords": [
        "5-7 SHORT Etsy-search phrases, each 2-4 words MAX, ordered broadest first.",
        "Examples: 'folk art cross stitch','mandala sampler','botanical cross stitch','heirloom pattern','photoreal cross stitch'."
      ]
    }
  ]
}

Generate exactly ${count} ideas. No two ideas may repeat the same subject. Spread roughly evenly across the 4 formulas above.${HARD_BAN}`;
  }

  return `You are a senior digital-product strategist for an Etsy seller. Your job is to surface ${count} HIGH-CONVICTION product ideas that the seller can build NOW and list TODAY — ideas backed by real, fresh signals from this seller's marketplace data.

CRITICAL RULES:
1. Ground every idea in at least one signal from the data below. Reference the specific listing(s) or category in "signal_listings".
2. Prefer ideas with proof of demand (recent sales, high favorites, demand_score >= 60) over creative-but-speculative concepts.
3. Suggest products the seller can produce digitally and deliver instantly: printables, templates, planners, SVGs, clipart bundles, wall art, digital stickers, mockups. No physical fulfillment.
4. The "why_now" must cite a real reason from the data: a trending sale, a high-demand category, a recurring tag pattern. NOT generic ("seasonal", "popular").
5. Score honestly. Don't put 90+ on every metric.${allMixedBlock}${funnyStyleBlock}${focusBlock}

DATA — RECENT LIVE SALES (last 24h, sorted newest first):
${liveSalesBlock}

DATA — TOP TRACKED LISTINGS (sustained sellers from prior scans):
${trackedBlock}

DATA — TOP CATEGORIES BY DEMAND (latest scan):
${categoryBlock}${nicheConstraint}${bestsellersBlock}

OUTPUT — return ONLY a JSON object with this exact shape, no prose, no code fences:
{
  "ideas": [
    {
      "title": "string — the product idea, max 80 chars, written like a product name not a sentence",
      "niche": "string — the niche bucket (e.g. 'wedding stationery', 'digital planners', 'wall art')",
      "product_type": "string — physical format (e.g. 'PDF planner', 'PNG bundle', 'Canva template', 'SVG cut file')",
      "why_now": "string — 1-2 sentences citing a SPECIFIC signal above (name a listing, category, or tag)",
      "target_buyer": "string — who buys this and why",
      "suggested_price": number,
      "demand_score": number 0-100,
      "competition_score": number 0-100 (HIGHER = more crowded; lower is better for the seller),
      "urgency_score": number 0-100 (how time-sensitive — high = list this week),
      "confidence": number 0-100,
      "signal_listings": [{ "title": "string", "url": "string|null" }],
      "suggested_tags": ["13 etsy-style tags, each <=20 chars, lowercase, no commas"],
      "suggested_keywords": [
        "5-7 SHORT Etsy-search phrases, each 2-4 words MAX, ordered broadest first.",
        "These are typed verbatim into Etsy search — they MUST return real results. Anchor each with a noun (e.g. 'cross stitch', 'pattern', 'wall art', 'planner').",
        "GOOD: 'mexican cross stitch', 'hummingbird pattern', 'folk bird stitch', 'cat cross stitch', 'modern wall art'.",
        "BAD (will return 0 Etsy hits, do NOT produce these): 'vibrant mexican folk hummingbird cross stitch', 'beautiful detailed colorful bird pattern', 'ultimate notion life planner dashboard'.",
        "Drop adjectives like 'vibrant', 'beautiful', 'ultimate', 'stunning' — they don't appear in Etsy listing titles or tags."
      ]
    }
  ]
}

Generate exactly ${count} ideas. Diverse niches preferred — don't return ${count} planner ideas.`;
}

// ── Gemini call ───────────────────────────────────────────────────────

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  let lastErr: unknown = null;
  for (const model of MODEL_CHAIN) {
    try {
      const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 32768,
            temperature: 0.6,
            // Tell Gemini we want JSON — it's stricter than relying on
            // the prompt alone, especially with 2.5-flash which
            // sometimes wraps output in ```json fences.
            responseMimeType: "application/json",
          },
        }),
      });
      if (resp.status === 429 || resp.status === 503) {
        lastErr = `${model}: ${resp.status}`;
        continue;
      }
      if (!resp.ok) {
        lastErr = `${model}: ${resp.status} ${await resp.text().catch(() => "")}`;
        continue;
      }
      const data = await resp.json();
      const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
      lastErr = `${model}: empty response`;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Gemini call failed: ${String(lastErr)}`);
}

function extractJson(raw: string): unknown {
  // Trim whitespace + fences if Gemini ignored responseMimeType.
  let txt = raw.trim();
  if (txt.startsWith("```")) {
    txt = txt.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  try {
    return JSON.parse(txt);
  } catch {
    // Last-ditch: find the outermost { ... }
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("Gemini returned unparseable JSON");
  }
}

function clamp(n: unknown, min: number, max: number, fallback = 0): number {
  const num = Number(n);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function asString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (v == null) return fallback;
  return String(v);
}

function asStringArray(v: unknown): string[] {
  // Wrap asString in an arrow because Array.map passes (value, index, array)
  // and asString's 2nd arg is a string fallback — TS rightly rejects the
  // direct reference.
  if (Array.isArray(v)) return v.map((x) => asString(x)).filter(Boolean);
  return [];
}

// ── Insert + normalize ────────────────────────────────────────────────

function insertIdeas(rawIdeas: RawIdea[]): ProductIdeaRow[] {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO product_ideas
      (title, niche, product_type, why_now, target_buyer, suggested_price,
       demand_score, competition_score, urgency_score, confidence,
       signal_listings, suggested_tags, suggested_keywords, status)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
  `);

  const inserted: ProductIdeaRow[] = [];
  const txn = db.transaction((items: RawIdea[]) => {
    for (const idea of items) {
      const title = asString(idea.title).trim();
      if (!title) continue; // skip empty titles
      const result = stmt.run(
        title.slice(0, 200),
        asString(idea.niche, "").slice(0, 80) || null,
        asString(idea.product_type, "").slice(0, 80) || null,
        asString(idea.why_now, "").slice(0, 1000) || null,
        asString(idea.target_buyer, "").slice(0, 500) || null,
        Math.max(0, Number(idea.suggested_price) || 0),
        clamp(idea.demand_score, 0, 100),
        clamp(idea.competition_score, 0, 100),
        clamp(idea.urgency_score, 0, 100),
        clamp(idea.confidence, 0, 100),
        Array.isArray(idea.signal_listings) ? JSON.stringify(idea.signal_listings) : null,
        JSON.stringify(asStringArray(idea.suggested_tags).slice(0, 13)),
        JSON.stringify(asStringArray(idea.suggested_keywords).slice(0, 10)),
      );
      const row = db
        .prepare(`SELECT * FROM product_ideas WHERE id = ?`)
        .get(result.lastInsertRowid) as ProductIdeaRow;
      inserted.push(row);
    }
  });

  txn(rawIdeas);
  getDb().pragma('wal_checkpoint(TRUNCATE)');
  return inserted;
}

// ── Route handler ─────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured. Add it to .env.local to generate ideas." },
        { status: 500 },
      );
    }

    let body: {
      count?: number;
      niche?: string;
      focus?: string;
      style?: string;
      // ── NEW: market-pulse strict-context mode ──────────────────────
      // When the Ideas tab on /research generates from a corroborated
      // term, it passes the corroboration context here. If source_count
      // >= 2 we take the STRICT path (generateFromMarketPulse below)
      // which uses ONLY this evidence — no local DB pollution. This is
      // the "no guessing" guarantee for /research → Ideas.
      context?: {
        source_count?: number;
        sources?: string[];
        evidence?: Array<{ source: string; text: string; score?: number; url?: string }>;
        etsy_competition?: number | null;
        etsy_avg_favorites?: number | null;
      };
    } = {};
    try {
      body = await req.json();
    } catch {
      // Empty body — defaults
    }

    // ── EARLY BRANCH: strict-context (market-pulse) mode ────────────
    // If the caller provided a corroborated context with ≥2 sources, we
    // generate ideas anchored ONLY to that evidence — no local-DB
    // signals, no focus tokens, no DB fallback. Result: ideas can't
    // drift to whatever else happens to be in the seller's scan_*
    // tables (e.g. cross-stitch).
    if (
      body.context &&
      typeof body.context.source_count === "number" &&
      body.context.source_count >= 2 &&
      body.niche &&
      body.niche.trim().length > 0
    ) {
      const count = clamp(body.count ?? 3, 1, 10, 3);
      return await generateFromMarketPulse(apiKey, body.niche.trim(), body.context, count);
    }

    const count = clamp(body.count ?? 10, 1, 20, 10);
    const niche = body.niche?.trim() || null;
    const focus = resolveFocus(body.focus);
    // Accept the four style presets the Ideas tab UI offers.  The
    // previous version only let "funny" through, so every other
    // selection silently fell back to the default NalaAndStitch
    // animal-costume prompt — picking "Dark / Occult / Weird" still
    // produced geese in bonnets.  Now style flows end-to-end.
    const styleRaw = body.style;
    // "weird" was retired 2026-05-16 — any client still sending it
    // gets silently mapped to "all" (variety pack) so no occult
    // prompts can be triggered.
    const normalisedStyle = styleRaw === "weird" ? "all" : styleRaw;
    const style: "funny" | "bookmarks" | "folk" | "all" | undefined =
      normalisedStyle === "funny" || normalisedStyle === "bookmarks" || normalisedStyle === "folk" || normalisedStyle === "all"
        ? normalisedStyle
        : undefined;

    // Collect signals — apply focus filter if a preset was chosen.
    let liveSales = collectLiveSales(25, focus.tokens);
    let topTracked = collectTopTracked(30, focus.tokens);
    let topCategories = collectTopCategories(15, focus.tokens);

    // If focus filtering wiped out all signals, fall back to UNfiltered
    // signals — Gemini will then lean on the focusBlock's "draw on
    // general knowledge" hint instead of trying to ground in unrelated
    // notion/wall-art rows. Better than 400'ing the user.
    let signalsAreFocusFiltered = focus.tokens.length > 0;
    if (
      focus.tokens.length > 0 &&
      liveSales.length === 0 &&
      topTracked.length === 0 &&
      topCategories.length === 0
    ) {
      liveSales = collectLiveSales(25);
      topTracked = collectTopTracked(30);
      topCategories = collectTopCategories(15);
      signalsAreFocusFiltered = false;
    }

    // Styles with their own creative-prompt early return ("funny",
    // "weird", "folk") DON'T need scan data — they build from Gemini's
    // general knowledge of those Etsy shelves.  Only the default
    // market-grounded path requires signals.
    const isCreativeStyle = style === "funny" || style === "bookmarks" || style === "folk";
    if (
      liveSales.length === 0 &&
      topTracked.length === 0 &&
      topCategories.length === 0 &&
      !isCreativeStyle
    ) {
      return NextResponse.json(
        {
          error:
            "No signal data yet. Run a market scan or start the live tracker first — Gemini needs real signals to ground ideas in.",
        },
        { status: 400 },
      );
    }

    // Top 8 tracked-listing titles are the richest creative seed for
    // Gemini: they're exact strings buyers click on RIGHT NOW.  Passing
    // them as a separate data block lets Gemini extrapolate the proven
    // animal+accessory formula into NEW variations instead of returning
    // generic ideas.  When topTracked is empty the array is empty and
    // the bestsellers block is omitted by buildPrompt.
    const etsyBestsellers = topTracked.slice(0, 8).map((t) => t.title);

    const prompt = buildPrompt({
      count,
      niche,
      focus,
      signalsAreFocusFiltered,
      liveSales,
      topTracked,
      topCategories,
      style,
      etsyBestsellers,
    });
    const rawText = await callGemini(apiKey, prompt);
    let parsed = extractJson(rawText) as { ideas?: RawIdea[] };

    if (!parsed?.ideas || !Array.isArray(parsed.ideas)) {
      return NextResponse.json(
        { error: "Gemini returned malformed output (missing 'ideas' array)" },
        { status: 502 },
      );
    }

    // Server-side content guardrail — see HARAM_REGEX at module scope.
    const isHaram = (idea: RawIdea): boolean => HARAM_REGEX.test((idea.title || "").toString());
    {
      const cleanIdeas = (parsed.ideas || []).filter((i) => !isHaram(i));
      const bannedCount = (parsed.ideas?.length || 0) - cleanIdeas.length;
      if (bannedCount > 0 && cleanIdeas.length < count) {
        // Retry once with a stricter reprimand listing the offending titles.
        const violations = (parsed.ideas || []).filter(isHaram).map((i) => i.title).slice(0, 5);
        const reprompt = `${prompt}\n\n⚠️ RETRY — YOUR PREVIOUS RESPONSE CONTAINED FORBIDDEN CONTENT.\nThese titles you generated are INVALID because they contain occult / tarot / skull / hand / eye / religious / haram subjects:\n${violations.map((t) => `  - "${t}"`).join("\n")}\n\nRegenerate ALL ${count} ideas.  Subject must be SAFE FOR A CHILD'S BEDROOM — cute animals in cottagecore costumes, snarky-caption animals, cross-stitch bookmarks (key/bee/ladybug/rose), kitchen samplers (jam jars, mini-motif grids), botanical flowers, photoreal cute-pet portraits, vintage sampler collections.  No exceptions, no clever wrappers.`;
        try {
          const retryRaw = await callGemini(apiKey, reprompt);
          const retryParsed = extractJson(retryRaw) as { ideas?: RawIdea[] };
          if (retryParsed?.ideas?.length) {
            parsed = { ideas: retryParsed.ideas.filter((i) => !isHaram(i)) };
            console.log(`[ideas-generate] haram filter replaced ${bannedCount} forbidden titles`);
          }
        } catch (err) {
          console.warn(`[ideas-generate] haram retry failed:`, (err as Error).message);
          parsed = { ideas: cleanIdeas };
        }
      } else if (bannedCount > 0) {
        parsed = { ideas: cleanIdeas };
        console.log(`[ideas-generate] haram filter dropped ${bannedCount} forbidden titles (still met count)`);
      }
    }

    const inserted = insertIdeas(parsed.ideas || []);

    if (inserted.length === 0) {
      return NextResponse.json(
        { error: "Gemini returned no usable ideas. Try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ideas: inserted,
      count: inserted.length,
      signalSummary: {
        liveSales: liveSales.length,
        topTracked: topTracked.length,
        topCategories: topCategories.length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Idea generation failed" },
      { status: 500 },
    );
  }
}

// ══════════════════════════════════════════════════════════════════════
// generateFromMarketPulse — STRICT niche-anchored idea generation
//
// Path: /research → Ideas tab → "Generate 3 product ideas" on a term card.
// The Ideas tab passes the corroborated term + its full evidence chain.
// We use ONLY that as Gemini's signal seed (no local-DB pollution), and
// the prompt enforces a HARD constraint: every idea MUST be a variant
// of the niche term. No drift to cross-stitch / unrelated categories
// regardless of what's in scan_keyword_results etc.
//
// Caller invariants (checked in POST before delegating here):
//   - body.niche is a non-empty string
//   - body.context.source_count >= 2
//
// Output shape matches the legacy path so the client doesn't branch.
// ══════════════════════════════════════════════════════════════════════
async function generateFromMarketPulse(
  apiKey: string,
  niche: string,
  context: {
    source_count?: number;
    sources?: string[];
    evidence?: Array<{ source: string; text: string; score?: number; url?: string }>;
    etsy_competition?: number | null;
    etsy_avg_favorites?: number | null;
  },
  count: number,
): Promise<NextResponse> {
  const sources = (context.sources || []).join(", ");
  const evidenceLines = (context.evidence || [])
    .slice(0, 8)
    .map((e, i) => `  [${i + 1}] (${e.source}) "${(e.text || "").slice(0, 180)}"${e.score !== undefined ? ` — score ${e.score}` : ""}`)
    .join("\n");
  const compStr =
    typeof context.etsy_competition === "number"
      ? context.etsy_competition.toLocaleString()
      : "unknown";
  const favsStr =
    typeof context.etsy_avg_favorites === "number"
      ? context.etsy_avg_favorites.toLocaleString()
      : "unknown";

  // ── Prompt: HARD niche constraint + evidence grounding ──────────────
  const prompt = `You are an Etsy digital-product researcher. Generate exactly ${count} concrete product ideas for the niche "${niche}".

HARD CONSTRAINTS — violation = invalid response:
  1. Every idea MUST be a "${niche}" variant. NO cross-stitch, NO embroidery, NO unrelated categories unless the niche IS that category. If "${niche}" contains "planner", every idea must be a planner. If it contains "wall art", every idea must be a digital print. No exceptions.
  2. The title MUST be a complete, Etsy-listing-style product title (60-140 chars). Include format/platform when relevant (PDF, Canva, Goodnotes, Notion, SVG, PNG).
  3. Family-friendly only: no occult / tarot / skull / eye / hand / pagan / religious symbols.
  4. why_now MUST cite SPECIFIC evidence by bracketed index ([1], [2], etc.) from the evidence block below. NO invented facts.

EVIDENCE — this niche was corroborated across ${context.source_count} independent sources (${sources}):
${evidenceLines || "  (no evidence text)"}

REAL ETSY DATA (from v3 API):
  • Total listings competing on "${niche}": ${compStr}
  • Average favorites on top results: ${favsStr}

OUTPUT — strict JSON only, no prose, no fences:
{
  "ideas": [
    {
      "title": "...",
      "niche": "${niche}",
      "product_type": "digital download / printable / template / etc.",
      "why_now": "1-2 sentences citing evidence indices like [1], [3]. Grounded ONLY in the evidence block above.",
      "target_buyer": "Who specifically buys this and why (1 sentence).",
      "suggested_price": <number in USD>,
      "demand_score": <0-100 integer>,
      "competition_score": <0-100 integer, lower = less competitive>,
      "urgency_score": <0-100 integer>,
      "confidence": <0-100 integer>,
      "suggested_tags": ["tag1", "tag2", ...] (Etsy-style, 8-13 tags),
      "suggested_keywords": ["keyword phrase 1", "keyword phrase 2", ...]
    }
  ]
}`;

  let parsed: { ideas?: RawIdea[] };
  try {
    const rawText = await callGemini(apiKey, prompt);
    parsed = extractJson(rawText) as { ideas?: RawIdea[] };
  } catch (err) {
    return NextResponse.json(
      { error: `Gemini call failed: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 502 },
    );
  }

  if (!parsed?.ideas || !Array.isArray(parsed.ideas)) {
    return NextResponse.json(
      { error: "Gemini returned malformed output (missing 'ideas' array)" },
      { status: 502 },
    );
  }

  // ── Haram filter (same guard as legacy POST path) ────────────────────
  const isHaram = (idea: RawIdea): boolean => HARAM_REGEX.test((idea.title || "").toString());
  parsed.ideas = parsed.ideas.filter((i) => !isHaram(i));

  // ── Niche-fit filter — second line of defense against drift.
  // Require that the title OR niche field literally contains a key word
  // from the requested niche. This catches Gemini drifting to "cross
  // stitch" when we asked for "digital planner".
  const nicheKeywords = niche
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3); // drop "the", "and", short connectors
  if (nicheKeywords.length > 0) {
    parsed.ideas = parsed.ideas.filter((idea) => {
      const hay = `${(idea.title || "")} ${(idea.niche || "")} ${(idea.product_type || "")}`.toLowerCase();
      return nicheKeywords.some((kw) => hay.includes(kw));
    });
  }

  const inserted = insertIdeas(parsed.ideas);

  if (inserted.length === 0) {
    return NextResponse.json(
      { error: "Gemini returned no usable ideas (all drifted off-niche or were filtered). Try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ideas: inserted,
    count: inserted.length,
    signalSummary: {
      mode: "market-pulse-strict",
      niche,
      source_count: context.source_count,
      sources: context.sources,
      evidence_used: (context.evidence || []).length,
    },
  });
}
