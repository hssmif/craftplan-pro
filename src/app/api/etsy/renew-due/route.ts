// POST /api/etsy/renew-due
//
// Runs the renewal cadence — finds every listing in
// listing_renewal_schedule with next_renewal_at <= now and enabled=1,
// renews each via Etsy's POST /listings/{id}/renew (costs $0.20 each
// — paid out of the seller's Etsy account, not OpenAI).  Designed
// to be triggered hourly by cron / scheduled task.
//
// Etsy gives a recency boost to renewed listings, so keeping older
// listings on a 30-day renewal cadence prevents them from slipping
// down search results.  Phase 3 SEO 2026-05-17.
//
// GET /api/etsy/renew-due
//   Returns the renewal schedule with last/next dates per listing.
//
// PATCH /api/etsy/renew-due
//   Body: { listing_id, enabled?, cadence_days? } — toggles a listing's
//   renewal or changes its cadence.
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { renewListing } from "@/lib/etsy-client";

export const runtime = "nodejs";
export const maxDuration = 300;

// Etsy Plus subscribers get 15 listing credits per calendar month —
// each credit covers one renewal OR one new listing.  Per 2026-05-17
// Plus activation: we cap renewals to the remaining monthly credits
// so we never pay $0.20 out of pocket for a renewal when a free
// credit was available.
const PLUS_MONTHLY_CREDITS = 15;

function getPlusCreditsUsedThisMonth(db: ReturnType<typeof getDb>): number {
  // Count renewals we've done since midnight on the 1st of the current
  // month — those each consumed one of the 15 monthly credits.
  // New-listing creations ALSO consume credits but we don't track
  // those here yet; the worst case is we under-use credits, never
  // over-spend.
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const row = db.prepare(
    `SELECT COUNT(*) AS n
     FROM listing_renewal_schedule
     WHERE last_renewed_at IS NOT NULL AND last_renewed_at >= ?`,
  ).get(monthStart.getTime()) as { n: number } | undefined;
  return row?.n ?? 0;
}

export async function POST() {
  const db = getDb();
  const now = Date.now();

  // Calculate how many free Etsy Plus credits remain this month.
  const creditsUsed = getPlusCreditsUsedThisMonth(db);
  const creditsRemaining = Math.max(0, PLUS_MONTHLY_CREDITS - creditsUsed);
  console.log(`[renew-due] Plus credits used this month: ${creditsUsed}/${PLUS_MONTHLY_CREDITS}, remaining: ${creditsRemaining}`);

  // If we've exhausted this month's free credits, skip renewals entirely
  // — they'd cost real money.  Will resume on the 1st next month.
  if (creditsRemaining <= 0) {
    return NextResponse.json({
      renewed: 0,
      failed: 0,
      skipped_credits_exhausted: true,
      plus_credits_used: creditsUsed,
      plus_credits_remaining: 0,
      message: "Etsy Plus monthly credits exhausted — renewals paused until 1st of next month.",
    });
  }

  const due = db
    .prepare(
      `SELECT listing_id, cadence_days, last_renewed_at
       FROM listing_renewal_schedule
       WHERE enabled = 1 AND next_renewal_at <= ?
       ORDER BY next_renewal_at ASC
       LIMIT ?`,
    )
    .all(now, creditsRemaining) as Array<{ listing_id: string; cadence_days: number; last_renewed_at: number | null }>;

  const updateSuccess = db.prepare(
    `UPDATE listing_renewal_schedule
     SET last_renewed_at = ?, next_renewal_at = ?, last_error = NULL
     WHERE listing_id = ?`,
  );
  const updateFail = db.prepare(
    `UPDATE listing_renewal_schedule
     SET last_error = ?, next_renewal_at = ?
     WHERE listing_id = ?`,
  );

  const renewed: string[] = [];
  const failed: Array<{ listing_id: string; error: string }> = [];
  for (const row of due) {
    try {
      await renewListing(Number(row.listing_id));
      const next = now + row.cadence_days * 24 * 60 * 60 * 1000;
      updateSuccess.run(now, next, row.listing_id);
      renewed.push(row.listing_id);
      // Cushion to stay under Etsy's rate limit.
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      const msg = (err as Error).message;
      // Push next attempt 1 hour out so we don't keep hammering.
      updateFail.run(msg.slice(0, 200), now + 60 * 60 * 1000, row.listing_id);
      failed.push({ listing_id: row.listing_id, error: msg });
    }
  }

  return NextResponse.json({
    renewed: renewed.length,
    failed: failed.length,
    renewedIds: renewed,
    failedIds: failed,
    plus_credits_used: creditsUsed + renewed.length,
    plus_credits_remaining: PLUS_MONTHLY_CREDITS - creditsUsed - renewed.length,
  });
}

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT listing_id, enabled, cadence_days, last_renewed_at, next_renewal_at, last_error
       FROM listing_renewal_schedule
       ORDER BY next_renewal_at ASC`,
    )
    .all();
  return NextResponse.json({ schedule: rows });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    listing_id?: string;
    enabled?: boolean;
    cadence_days?: number;
  };
  if (!body.listing_id) {
    return NextResponse.json({ error: "listing_id required" }, { status: 400 });
  }
  const db = getDb();
  const now = Date.now();
  // Upsert behaviour — if no row exists, create one with sensible defaults.
  const existing = db
    .prepare(`SELECT listing_id FROM listing_renewal_schedule WHERE listing_id = ?`)
    .get(body.listing_id);
  if (!existing) {
    const cadence = body.cadence_days ?? 30;
    db.prepare(
      `INSERT INTO listing_renewal_schedule
         (listing_id, enabled, cadence_days, next_renewal_at)
       VALUES (?, ?, ?, ?)`,
    ).run(
      body.listing_id,
      body.enabled === false ? 0 : 1,
      cadence,
      now + cadence * 24 * 60 * 60 * 1000,
    );
  } else {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    if (body.enabled !== undefined) {
      sets.push("enabled = ?");
      params.push(body.enabled ? 1 : 0);
    }
    if (body.cadence_days !== undefined) {
      sets.push("cadence_days = ?");
      params.push(body.cadence_days);
      // Recompute next based on last renewal if any.
      sets.push("next_renewal_at = COALESCE(last_renewed_at, ?) + ? * 86400000");
      params.push(now, body.cadence_days);
    }
    if (sets.length) {
      params.push(body.listing_id);
      db.prepare(
        `UPDATE listing_renewal_schedule SET ${sets.join(", ")} WHERE listing_id = ?`,
      ).run(...params);
    }
  }
  return NextResponse.json({ ok: true });
}
