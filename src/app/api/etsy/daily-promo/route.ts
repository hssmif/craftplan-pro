// POST /api/etsy/daily-promo
//
// Daily promo rotation — runs once per day to keep urgency fresh.
// Per video analysis 2026-05-17: the "green sale ticker" Etsy shows
// requires manual seller-dashboard setup and is NOT available via
// v3 API.  Verified 2026-05-17: the v3 /discount-codes endpoint
// returns 404 — coupon creation is NOT exposed via Etsy v3 API.
//
// What this route actually does (post-discovery):
//   1. Rotates the shop announcement banner with urgency text +
//      day-of-week messaging — gives the "limited time" feel.
//   2. References a SHARED_COUPON_CODE env var (set once after the
//      seller manually creates a "FOREVER15" coupon in the Etsy
//      dashboard).  If unset, just runs urgency without a code.
//   3. Idempotent — running twice the same day re-applies the same
//      announcement.
//
// Schedule daily 6am via cron / scheduled task.  Body (optional):
//   { percent_off?: number }
import { NextRequest, NextResponse } from "next/server";
import { getEtsyTokens } from "@/lib/db";
import { getValidToken, getApiKeyHeader } from "@/lib/etsy-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const ETSY_API_URL = "https://openapi.etsy.com/v3";

function getShopId(): string {
  const tokens = getEtsyTokens();
  if (!tokens?.shop_id) throw new Error("No shop ID — reconnect Etsy account first");
  return tokens.shop_id;
}

// Code shape: 3-letter month + day-of-month, e.g. MAY17.  Unique
// per calendar day, predictable, easy to type, fits Etsy's 20-char
// limit.
function todaysCode(suffix?: string): string {
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "short" }).toUpperCase();
  const day = String(now.getDate()).padStart(2, "0");
  const base = `${month}${day}`;
  return suffix ? `${base}${suffix}`.slice(0, 20) : base;
}

interface CouponRow {
  promotion_id?: number;
  shop_promotion_id?: number;
  coupon_id?: number;
  name?: string;
  status?: string;
}

async function listActiveCoupons(shopId: string): Promise<CouponRow[]> {
  const apiKey = getApiKeyHeader();
  const token = await getValidToken();
  const r = await fetch(
    `${ETSY_API_URL}/application/shops/${shopId}/discount-codes`,
    { headers: { Authorization: `Bearer ${token}`, "x-api-key": apiKey } },
  );
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`List coupons HTTP ${r.status}: ${t.slice(0, 200)}`);
  }
  const d = await r.json() as { results: CouponRow[] };
  return d.results || [];
}

async function createCoupon(shopId: string, code: string, percentOff: number): Promise<unknown> {
  const apiKey = getApiKeyHeader();
  const token = await getValidToken();
  const now = Math.floor(Date.now() / 1000);
  const tomorrow = now + 24 * 60 * 60;
  const body = new URLSearchParams({
    name: code,
    discount_type: "percentage",
    percent_discount: String(percentOff),
    start_time: String(now),
    end_time: String(tomorrow),
    minimum_purchase_amount: "0",
  });
  const r = await fetch(
    `${ETSY_API_URL}/application/shops/${shopId}/discount-codes`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-api-key": apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    },
  );
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Create coupon HTTP ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json();
}

async function updateShopAnnouncement(shopId: string, announcement: string): Promise<void> {
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
      body: new URLSearchParams({ announcement: announcement.slice(0, 160) }).toString(),
    },
  );
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Update announcement HTTP ${r.status}: ${t.slice(0, 200)}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { percent_off?: number };
    const percentOff = Math.max(5, Math.min(50, Math.floor(body.percent_off ?? 15)));
    const shopId = getShopId();

    // ETSY_COUPON_CODE is the static coupon the seller created ONCE in
    // their Etsy seller dashboard (e.g. "STITCH15" for 15% off, valid
    // indefinitely).  We just promote it in the daily banner — Etsy
    // v3 API doesn't expose coupon creation, so the code itself must
    // exist in their dashboard.
    const code = process.env.ETSY_COUPON_CODE || "";

    // Rotate the urgency message based on day-of-week + day-of-month so
    // refreshing the same day shows the same banner (idempotent) but
    // each new day feels fresh.
    const now = new Date();
    const dayName = now.toLocaleString("en-US", { weekday: "long" });
    const dayOfMonth = now.getDate();
    const daysToWeekend = (6 - now.getDay() + 7) % 7;

    let urgencyHook: string;
    if (now.getDay() === 0 || now.getDay() === 6) {
      urgencyHook = `🎉 Weekend special! ${dayName} ${dayOfMonth} only — `;
    } else if (daysToWeekend === 1) {
      urgencyHook = `⏳ Friday flash! Last chance before the weekend rush — `;
    } else if (now.getDay() === 1) {
      urgencyHook = `✨ Monday motivation — start your week with a new stitching project! `;
    } else {
      urgencyHook = `🌸 ${dayName} pick — `;
    }

    const announcement = code
      ? `${urgencyHook}Use code ${code} for ${percentOff}% OFF every cross stitch pattern PDF! ` +
        `Cottagecore animals, kawaii bookmarks, fantasy charts & folk art samplers — all $4.34, ` +
        `now ${percentOff}% off this week. Instant download, print at home.`
      : `${urgencyHook}Cottagecore, kawaii, fantasy & folk art cross stitch pattern PDFs — all $4.34. ` +
        `Instant download, beginner-friendly charts, full DMC color guide.  New designs added weekly!`;

    let announcementUpdated = false;
    try {
      await updateShopAnnouncement(shopId, announcement);
      announcementUpdated = true;
    } catch (err) {
      console.warn("[daily-promo] couldn't update announcement:", (err as Error).message);
    }

    return NextResponse.json({
      announcement,
      announcement_updated: announcementUpdated,
      coupon_code_used: code || "(none configured — set ETSY_COUPON_CODE env)",
      percent_off: code ? percentOff : null,
      day_name: dayName,
      note: code
        ? "Promo code present in env. Make sure '" + code + "' exists in your Etsy dashboard, otherwise checkout will reject it."
        : "No ETSY_COUPON_CODE env var set. Add one (e.g. ETSY_COUPON_CODE=STITCH15) and create the code in Etsy dashboard once.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[daily-promo] fatal:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  try {
    const shopId = getShopId();
    const coupons = await listActiveCoupons(shopId);
    const todayCode = todaysCode();
    return NextResponse.json({
      todays_code: todayCode,
      todays_code_exists: coupons.some((c) => c.name === todayCode),
      active_coupon_count: coupons.length,
      coupons: coupons.slice(0, 10),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
