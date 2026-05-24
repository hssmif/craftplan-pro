// POST /api/etsy/seo-retrofit
//
// One-off batch operation: upgrade every cross-stitch listing the
// seller already has on Etsy to use the new SEO improvements landed
// 2026-05-17.  Specifically:
//
//   1. Move them to the correct taxonomy (5613 = Cross Stitch Patterns)
//      — most existing listings live under 2078 (Digital Prints) and
//      are invisible to cross-stitch-specific filter funnels.
//   2. Enroll them in the 30-day renewal schedule so they keep getting
//      Etsy's recency boost.
//   3. Best-effort guess at color/theme attributes from the title
//      (better-than-nothing; user can hand-edit on Etsy after).
//
// Body (optional):
//   { listing_ids?: string[] }  // restrict to these listings; default = all our active cross-stitch listings
//   { skip_attrs?: boolean }    // skip the attribute guessing
//
// Idempotent — running it twice is safe.  Each step is a separate
// try/catch so a single failure doesn't block the rest.
import { NextRequest, NextResponse } from "next/server";
import { getDb, getEtsyTokens } from "@/lib/db";
import { getListings, applyListingAttributes } from "@/lib/etsy-client";
import { getValidToken, getApiKeyHeader } from "@/lib/etsy-auth";

export const maxDuration = 300;
export const runtime = "nodejs";

const ETSY_API_URL = "https://openapi.etsy.com/v3";
// Etsy taxonomy 87 = Cross Stitch leaf node (path 66 → 82 → 87).
// Discovered via /api/etsy/taxonomy-discover.  Earlier value 5613
// returned "Invalid taxonomy_id" — that ID doesn't exist in Etsy's
// current seller-taxonomy tree.  Fixed 2026-05-17.
const CROSS_STITCH_TAXONOMY_ID = 87;

interface OurListing {
  listing_id: number;
  title: string;
  taxonomy_id: number;
  state?: string;
}

// Best-effort attribute inference from the title — cheaper than a
// Gemini round-trip and good enough to start populating Etsy filter
// values.  Keywords are matched lowercased + word-bounded.
function guessAttributesFromTitle(title: string): {
  primaryColor?: string;
  theme?: string;
  holiday?: string;
} {
  const t = title.toLowerCase();
  // Color guess — pick the first colour word found.
  const colorWords: Array<[RegExp, string]> = [
    [/\b(pink|rose|blush)\b/, "pink"],
    [/\b(purple|violet|lavender|lilac|plum)\b/, "purple"],
    [/\b(blue|navy|sapphire|teal|aqua|turquoise)\b/, "blue"],
    [/\b(green|emerald|sage|olive|mint|forest)\b/, "green"],
    [/\b(yellow|gold|golden|mustard)\b/, "yellow"],
    [/\b(orange|peach|coral|tangerine)\b/, "orange"],
    [/\b(red|burgundy|maroon|crimson|ruby)\b/, "red"],
    [/\b(black|charcoal|onyx)\b/, "black"],
    [/\b(white|cream|ivory|beige)\b/, "white"],
    [/\b(brown|tan|chocolate|caramel)\b/, "brown"],
    [/\b(gray|grey|silver)\b/, "gray"],
  ];
  let primaryColor: string | undefined;
  for (const [re, name] of colorWords) {
    if (re.test(t)) { primaryColor = name; break; }
  }

  const themes: Array<[RegExp, string]> = [
    [/\bcottagecore\b/, "cottagecore"],
    [/\bkawaii\b/, "kawaii"],
    [/\bvintage\b/, "vintage"],
    [/\bfarmhouse\b/, "farmhouse"],
    [/\b(fantasy|wizard|knight|medieval|tarot)\b/, "whimsical"],
    [/\bbotanical\b/, "nature"],
    [/\b(animal|bunny|goose|frog|cat|dog|mouse)\b/, "animals"],
    [/\bfood\b/, "food and drink"],
  ];
  let theme: string | undefined;
  for (const [re, name] of themes) {
    if (re.test(t)) { theme = name; break; }
  }

  const holidays: Array<[RegExp, string]> = [
    [/\b(christmas|xmas|winter)\b/, "Christmas"],
    [/\bhalloween\b/, "Halloween"],
    [/\beaster\b/, "Easter"],
    [/\b(valentine|valentines)\b/, "Valentines"],
    [/\bthanksgiving\b/, "Thanksgiving"],
  ];
  let holiday: string | undefined;
  for (const [re, name] of holidays) {
    if (re.test(t)) { holiday = name; break; }
  }

  return { primaryColor, theme, holiday };
}

async function updateListingTaxonomy(listingId: number, shopId: string, taxonomyId: number): Promise<void> {
  const apiKey = getApiKeyHeader();
  const token = await getValidToken();
  const resp = await fetch(
    `${ETSY_API_URL}/application/shops/${shopId}/listings/${listingId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ taxonomy_id: taxonomyId }),
    },
  );
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Taxonomy update HTTP ${resp.status}: ${t.slice(0, 200)}`);
  }
}

function getShopId(): string {
  const tokens = getEtsyTokens();
  if (!tokens?.shop_id) throw new Error("No shop ID — reconnect Etsy account first");
  return tokens.shop_id;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      listing_ids?: string[];
      skip_attrs?: boolean;
    };

    // 1. Pull every active listing from Etsy.
    const all = (await getListings("active")) as OurListing[];
    let targets = all;
    if (body.listing_ids?.length) {
      const wanted = new Set(body.listing_ids.map(String));
      targets = all.filter((l) => wanted.has(String(l.listing_id)));
    }

    if (targets.length === 0) {
      return NextResponse.json({ retrofitted: 0, message: "No active listings to retrofit" });
    }

    const shopId = getShopId();
    const db = getDb();
    const now = Date.now();
    const upsertRenewal = db.prepare(
      `INSERT INTO listing_renewal_schedule (listing_id, enabled, cadence_days, next_renewal_at)
       VALUES (?, 1, 30, ?)
       ON CONFLICT(listing_id) DO NOTHING`,
    );

    const report: Array<{
      listing_id: string;
      title: string;
      taxonomy_updated: boolean;
      attributes_applied: string[];
      renewal_enrolled: boolean;
      errors: string[];
    }> = [];

    for (const listing of targets) {
      const id = String(listing.listing_id);
      const r: typeof report[number] = {
        listing_id: id,
        title: listing.title,
        taxonomy_updated: false,
        attributes_applied: [],
        renewal_enrolled: false,
        errors: [],
      };

      // 1a. Taxonomy migration.
      if (listing.taxonomy_id !== CROSS_STITCH_TAXONOMY_ID) {
        try {
          await updateListingTaxonomy(listing.listing_id, shopId, CROSS_STITCH_TAXONOMY_ID);
          r.taxonomy_updated = true;
          await new Promise((res) => setTimeout(res, 300));
        } catch (err) {
          r.errors.push(`taxonomy: ${(err as Error).message}`);
        }
      }

      // 1b. Attribute back-fill (only if listing now has the new taxonomy).
      if (!body.skip_attrs) {
        const attrs = guessAttributesFromTitle(listing.title);
        if (Object.values(attrs).some(Boolean)) {
          try {
            await applyListingAttributes(listing.listing_id, CROSS_STITCH_TAXONOMY_ID, attrs);
            r.attributes_applied = Object.entries(attrs)
              .filter(([, v]) => !!v)
              .map(([k, v]) => `${k}=${v}`);
            await new Promise((res) => setTimeout(res, 300));
          } catch (err) {
            r.errors.push(`attributes: ${(err as Error).message}`);
          }
        }
      }

      // 1c. Renewal enrolment.
      try {
        upsertRenewal.run(id, now + 30 * 24 * 60 * 60 * 1000);
        r.renewal_enrolled = true;
      } catch (err) {
        r.errors.push(`renewal: ${(err as Error).message}`);
      }

      report.push(r);
    }

    return NextResponse.json({
      retrofitted: report.length,
      taxonomy_updates: report.filter((r) => r.taxonomy_updated).length,
      attribute_updates: report.filter((r) => r.attributes_applied.length > 0).length,
      renewal_enrolled: report.filter((r) => r.renewal_enrolled).length,
      with_errors: report.filter((r) => r.errors.length > 0).length,
      report,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[seo-retrofit] fatal:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
