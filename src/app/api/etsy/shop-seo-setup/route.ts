// POST /api/etsy/shop-seo-setup
//
// One-shot SHOP-LEVEL SEO setup, separate from per-listing tweaks.
// Per 2026-05-17 video analysis: the shop's About / Announcement /
// Sale Message and Shop Sections are all indexed by Etsy + Google
// and compound across every listing — but most sellers leave them
// blank or generic.  This route fills them with keyword-rich copy.
//
// What it does:
//   1. Updates shop `announcement` (welcome banner) with a keyword-
//      stuffed-but-readable greeting + free shipping / instant
//      download promise.
//   2. Updates shop `sale_message` (post-purchase message on digital
//      downloads) with a thank-you + cross-sell prompt.
//   3. Creates 8 Shop Sections that categorize cross-stitch
//      patterns by niche (e.g., "Cottagecore Animals", "Fantasy
//      Creatures").  Section names ARE indexed in Etsy search.
//   4. Auto-assigns existing listings to the matching section based
//      on title keyword match.
//
// Idempotent — sections that already exist are reused, not duplicated.
//
// Body (optional):
//   { dry_run?: boolean }  // if true, returns plan without writing
import { NextRequest, NextResponse } from "next/server";
import { getListings } from "@/lib/etsy-client";
import { getEtsyTokens } from "@/lib/db";
import { getValidToken, getApiKeyHeader } from "@/lib/etsy-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

const ETSY_API_URL = "https://openapi.etsy.com/v3";

// Shop-level copy — kept generic enough to be evergreen, keyword-rich
// enough to feed Etsy/Google indexing.  Edit anytime by re-running
// this route or hitting Etsy's PUT /shops/{id} directly.
const SHOP_ANNOUNCEMENT = (
  "Welcome! 🌸 Cottagecore cross stitch patterns, kawaii animal " +
  "embroidery charts, folk art samplers, and bookmark designs — every " +
  "pattern is an instant download PDF with full DMC color chart, " +
  "symbols, and printable A4 + Letter sizes. Beginner-friendly to " +
  "advanced hoop projects, all $4.34 each. New designs added weekly."
).slice(0, 160);

const SHOP_SALE_MESSAGE = (
  "Thank you for your purchase! 🧵 Your cross stitch pattern PDF is " +
  "ready in your downloads. Print at home on A4 or Letter paper. " +
  "Love it? Browse our latest cottagecore animals, fantasy creatures, " +
  "and folk art samplers — and please leave a review!"
).slice(0, 1000);

// 8 cross-stitch sections sized for the existing catalog.  Names
// chosen to be keywords buyers actually search for on Etsy.
// Etsy caps section names at 24 chars — every name below stays inside that.
const SECTION_NAMES = [
  "Cottagecore Patterns",    // 20
  "Fantasy & Wizard",        // 16
  "Animal Patterns",         // 15
  "Kawaii & Cute",           // 13
  "Folk Art & Floral",       // 17
  "Bookmark Patterns",       // 17
  "Funny & Snarky",          // 14
  "Beginner Patterns",       // 17
];

// Map a listing's title to the best section.  First match wins.
function pickSection(title: string): string | null {
  const t = title.toLowerCase();
  if (/\bbookmark\b/.test(t)) return "Bookmark Patterns";
  if (/"|'m fine'|chaos mode|not my problem|main character|unbothered/.test(t)) return "Funny & Snarky";
  if (/\b(wizard|knight|mage|sorcerer|alchemist|tarot|cthulhu)\b/.test(t)) return "Fantasy & Wizard";
  if (/\b(sampler|folk|rushnyk|otomi|mandala|botanical|herbarium)\b/.test(t)) return "Folk Art & Floral";
  if (/\bkawaii\b/.test(t)) return "Kawaii & Cute";
  if (/\b(bunny|rabbit|goose|duck|frog|mouse|cat|fox|cow|sheep|owl|bear|hedgehog|alpaca)\b/.test(t)) return "Animal Patterns";
  if (/\b(cottagecore|cottage|garden|spring|easter)\b/.test(t)) return "Cottagecore Patterns";
  return "Beginner Patterns";
}

function getShopId(): string {
  const tokens = getEtsyTokens();
  if (!tokens?.shop_id) throw new Error("No shop ID — reconnect Etsy account first");
  return tokens.shop_id;
}

interface SectionRow { shop_section_id: number; title: string }

async function listSections(shopId: string): Promise<SectionRow[]> {
  const apiKey = getApiKeyHeader();
  const token = await getValidToken();
  const r = await fetch(
    `${ETSY_API_URL}/application/shops/${shopId}/sections`,
    { headers: { Authorization: `Bearer ${token}`, "x-api-key": apiKey } },
  );
  if (!r.ok) throw new Error(`List sections HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json() as { results: SectionRow[] };
  return d.results || [];
}

async function createSection(shopId: string, title: string): Promise<SectionRow> {
  const apiKey = getApiKeyHeader();
  const token = await getValidToken();
  const r = await fetch(
    `${ETSY_API_URL}/application/shops/${shopId}/sections`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-api-key": apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ title }).toString(),
    },
  );
  if (!r.ok) throw new Error(`Create section "${title}" HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return await r.json() as SectionRow;
}

async function updateShop(shopId: string, fields: Record<string, string>): Promise<void> {
  const apiKey = getApiKeyHeader();
  const token = await getValidToken();
  const r = await fetch(
    `${ETSY_API_URL}/application/shops/${shopId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-api-key": apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(fields).toString(),
    },
  );
  if (!r.ok) throw new Error(`Update shop HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function assignListingToSection(shopId: string, listingId: number, sectionId: number): Promise<void> {
  const apiKey = getApiKeyHeader();
  const token = await getValidToken();
  const r = await fetch(
    `${ETSY_API_URL}/application/shops/${shopId}/listings/${listingId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ shop_section_id: sectionId }),
    },
  );
  if (!r.ok) throw new Error(`Assign section HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

interface OurListing { listing_id: number; title: string; shop_section_id?: number }

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { dry_run?: boolean };
    const shopId = getShopId();

    // 1. Reconcile sections — keep what exists, create what's missing.
    const existing = await listSections(shopId);
    const existingByTitle = new Map(existing.map((s) => [s.title, s]));
    const sectionMap: Record<string, SectionRow> = {};
    const createdSections: string[] = [];
    for (const name of SECTION_NAMES) {
      if (existingByTitle.has(name)) {
        sectionMap[name] = existingByTitle.get(name)!;
      } else if (!body.dry_run) {
        try {
          const made = await createSection(shopId, name);
          sectionMap[name] = made;
          createdSections.push(name);
          await new Promise((r) => setTimeout(r, 300));
        } catch (err) {
          console.warn(`[shop-seo-setup] section "${name}" failed:`, (err as Error).message);
        }
      } else {
        createdSections.push(name);
      }
    }

    // 2. Update shop About fields.
    let shopUpdated = false;
    if (!body.dry_run) {
      try {
        await updateShop(shopId, {
          announcement: SHOP_ANNOUNCEMENT,
          sale_message: SHOP_SALE_MESSAGE,
          digital_sale_message: SHOP_SALE_MESSAGE,
        });
        shopUpdated = true;
      } catch (err) {
        console.warn(`[shop-seo-setup] shop update failed:`, (err as Error).message);
      }
    }

    // 3. Auto-assign listings to sections.
    const all = (await getListings("active")) as OurListing[];
    const assignmentPlan: Array<{ listing_id: string; title: string; section: string; assigned: boolean }> = [];
    for (const listing of all) {
      const sectionName = pickSection(listing.title);
      if (!sectionName) continue;
      const section = sectionMap[sectionName];
      if (!section) continue;
      // Skip if already assigned to the right section.
      if (listing.shop_section_id === section.shop_section_id) continue;
      if (body.dry_run) {
        assignmentPlan.push({
          listing_id: String(listing.listing_id),
          title: listing.title,
          section: sectionName,
          assigned: false,
        });
        continue;
      }
      try {
        await assignListingToSection(shopId, listing.listing_id, section.shop_section_id);
        assignmentPlan.push({
          listing_id: String(listing.listing_id),
          title: listing.title,
          section: sectionName,
          assigned: true,
        });
        await new Promise((r) => setTimeout(r, 300));
      } catch (err) {
        console.warn(`[shop-seo-setup] assign ${listing.listing_id}:`, (err as Error).message);
        assignmentPlan.push({
          listing_id: String(listing.listing_id),
          title: listing.title,
          section: sectionName,
          assigned: false,
        });
      }
    }

    return NextResponse.json({
      dry_run: !!body.dry_run,
      sections_existing: existing.length,
      sections_created: createdSections,
      shop_about_updated: shopUpdated,
      assignment_count: assignmentPlan.filter((a) => a.assigned).length,
      assignment_plan: assignmentPlan,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[shop-seo-setup] fatal:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
