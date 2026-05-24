// GET /api/etsy/seo-health
//
// Single endpoint that aggregates SEO telemetry for the seller's
// cross-stitch shop into one JSON dashboard payload:
//   - active listing count
//   - average ranking position across all tracked keywords
//   - listings with no ranking telemetry yet
//   - listings due / overdue for renewal
//   - top performing keywords (best avg position)
//   - worst performing keywords (need attention)
//
// Read-only — does NOT trigger any Etsy API calls.  Cheap.  Phase 4
// SEO dashboard 2026-05-17.
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

interface RankRow {
  listing_id: string;
  keyword: string;
  position: number;
  checked_at: number;
}

export async function GET() {
  const db = getDb();
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  // Most recent rank per listing × keyword (last 7 days).
  const recentRanks = db
    .prepare(
      `SELECT listing_id, keyword, position, checked_at
       FROM listing_ranking_history
       WHERE checked_at > ?
       ORDER BY checked_at DESC`,
    )
    .all(sevenDaysAgo) as RankRow[];

  // Dedupe to most recent per (listing, keyword) pair.
  const seen = new Set<string>();
  const latest: RankRow[] = [];
  for (const r of recentRanks) {
    const key = `${r.listing_id}::${r.keyword}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(r);
  }

  // Compute per-keyword aggregate position (lower = better, 0 = not found).
  const byKeyword = new Map<string, number[]>();
  for (const r of latest) {
    if (!byKeyword.has(r.keyword)) byKeyword.set(r.keyword, []);
    byKeyword.get(r.keyword)!.push(r.position);
  }
  const keywordStats = Array.from(byKeyword.entries()).map(([keyword, positions]) => {
    const inTop100 = positions.filter((p) => p > 0);
    const avg = inTop100.length > 0
      ? inTop100.reduce((a, b) => a + b, 0) / inTop100.length
      : 0;
    return {
      keyword,
      sample_size: positions.length,
      avg_position: avg > 0 ? Math.round(avg * 10) / 10 : null,
      in_top_100: inTop100.length,
      not_found: positions.length - inTop100.length,
    };
  });
  const topKeywords = keywordStats
    .filter((k) => k.avg_position !== null && k.avg_position! > 0)
    .sort((a, b) => (a.avg_position! - b.avg_position!))
    .slice(0, 10);
  const worstKeywords = keywordStats
    .filter((k) => k.not_found > 0 || (k.avg_position && k.avg_position > 50))
    .sort((a, b) => b.not_found - a.not_found)
    .slice(0, 10);

  // Renewal schedule status.
  const renewalRows = db
    .prepare(
      `SELECT listing_id, enabled, cadence_days, last_renewed_at, next_renewal_at, last_error
       FROM listing_renewal_schedule`,
    )
    .all() as Array<{
      listing_id: string;
      enabled: number;
      cadence_days: number;
      last_renewed_at: number | null;
      next_renewal_at: number;
      last_error: string | null;
    }>;
  const enrolled = renewalRows.length;
  const overdue = renewalRows.filter((r) => r.enabled && r.next_renewal_at <= now).length;
  const renewedLast7Days = renewalRows.filter((r) => r.last_renewed_at && r.last_renewed_at > sevenDaysAgo).length;

  // Listings with no ranking telemetry (potentially silent SEO leaks).
  const trackedListings = new Set(latest.map((r) => r.listing_id));
  const untrackedRows = db
    .prepare(
      `SELECT etsy_listing_id, title
       FROM products
       WHERE type = 'cross_stitch'
         AND etsy_listing_id IS NOT NULL
         AND etsy_status = 'active'`,
    )
    .all() as Array<{ etsy_listing_id: string; title: string }>;
  const untracked = untrackedRows.filter((r) => !trackedListings.has(r.etsy_listing_id));

  return NextResponse.json({
    summary: {
      total_active_listings: untrackedRows.length,
      tracked_listings: trackedListings.size,
      untracked_listings: untracked.length,
      keywords_tracked: byKeyword.size,
      avg_position_overall: (() => {
        const all = latest.filter((r) => r.position > 0).map((r) => r.position);
        return all.length > 0 ? Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 10) / 10 : null;
      })(),
      renewal_enrolled: enrolled,
      renewal_overdue: overdue,
      renewal_recent: renewedLast7Days,
      window_days: 7,
      generated_at: now,
    },
    top_keywords: topKeywords,
    worst_keywords: worstKeywords,
    untracked_listings: untracked.slice(0, 20),
    renewal_schedule: renewalRows.slice(0, 50),
  });
}
