import { NextRequest, NextResponse } from 'next/server';
import {
  getImportListings, createOpportunity, getOpportunities, getOpportunity,
  updateOpportunity, deleteOpportunity, type EtsyImportListing,
} from '@/lib/db';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// Compute opportunity score (0-100) using 6-factor model from SPEC.md
// Factors: Demand (25%) + Revenue (20%) + Moat Gap (20%) + Trust Barrier (15%) + Template Fit (10%) + Trend (10%)
function computeOpportunityScore(listings: EtsyImportListing[]): { score: number; decision: string; reason: string } {
  if (listings.length === 0) return { score: 0, decision: 'skip', reason: 'No listings' };
  const n = listings.length;

  // --- Factor 1: DEMAND (0-100) weight 0.25 ---
  const avgMonthlyRev = listings.reduce((s, l) => s + (l.revenue_estimate || 0), 0) / n;
  const bsRatio = listings.filter(l => l.is_bestseller).length / n;
  const avgFavs = listings.reduce((s, l) => s + (l.favorites || 0), 0) / n;
  const avgRevs = listings.reduce((s, l) => s + (l.reviews || 0), 0) / n;
  const demandRaw = (
    Math.min(avgMonthlyRev / 800, 1) * 35 +
    Math.min(bsRatio * 2, 1) * 25 +
    Math.min(avgFavs / 1000, 1) * 20 +
    Math.min(avgRevs / 150, 1) * 20
  );
  const demandScore = Math.min(100, demandRaw);

  // --- Factor 2: REVENUE (0-100) weight 0.20 ---
  const avgPrice = listings.reduce((s, l) => s + (l.price || 0), 0) / n;
  const maxRevenue = Math.max(...listings.map(l => l.revenue_estimate || 0));
  const prices = listings.map(l => l.price || 0).filter(p => p > 0);
  const priceStd = prices.length > 1 ? Math.sqrt(prices.reduce((s, p) => s + (p - avgPrice) ** 2, 0) / (prices.length - 1)) : 0;
  const priceConsistency = avgPrice > 0 ? 1 - Math.min(priceStd / avgPrice, 1) : 0.5;
  const revenueRaw = (
    Math.min(avgPrice / 15, 1) * 30 +
    Math.min(maxRevenue / 2000, 1) * 40 +
    priceConsistency * 30
  );
  const revenueScore = Math.min(100, revenueRaw);

  // --- Factor 3: MOAT GAP (0-100) weight 0.20 --- (HIGH gap = weak competitors = good for us)
  const avgDescQ = listings.reduce((s, l) => s + ((l as any).description_quality_score as number || 0), 0) / n;
  const avgImgQ = listings.reduce((s, l) => s + ((l as any).image_quality_score as number || 0), 0) / n;
  const avgFeatDens = listings.reduce((s, l) => s + ((l as any).feature_density as number || 0), 0) / n;
  const moatGapRaw = (
    (100 - avgDescQ) * 0.35 +
    (100 - avgImgQ) * 0.30 +
    Math.max(0, 20 - avgFeatDens) * 5 * 0.35
  );
  const moatGapScore = Math.max(0, Math.min(100, moatGapRaw));

  // --- Factor 4: TRUST BARRIER (0-100) weight 0.15 --- (LOW barrier = easy to break in)
  const ssRatio = listings.filter(l => (l as any).is_star_seller).length / n;
  const avgAge = listings.reduce((s, l) => s + (l.listing_age_days || 0), 0) / n;
  const barrierRaw = (
    Math.min(avgRevs / 500, 1) * 40 +
    ssRatio * 30 +
    Math.min(avgAge / 730, 1) * 30
  );
  const trustBarrierScore = Math.max(0, Math.min(100, 100 - barrierRaw));

  // --- Factor 5: TEMPLATE FIT (0-100) weight 0.10 ---
  const templateWords = ['notion', 'template', 'planner', 'tracker', 'dashboard', 'spreadsheet', 'organizer', 'journal', 'calendar', 'database'];
  let templateHits = 0;
  for (const l of listings) {
    const lower = ((l.title || '') + ' ' + (l.tags || '')).toLowerCase();
    if (templateWords.some(w => lower.includes(w))) templateHits++;
  }
  const templateRatio = templateHits / n;
  const priceViable = avgPrice >= 3.0 && avgPrice <= 30.0;
  const fitRaw = (
    30 + // assume all digital since we're on Etsy digital
    Math.min(templateRatio, 1) * 40 +
    (priceViable ? 30 : 10)
  );
  const templateFitScore = Math.min(100, fitRaw);

  // --- Factor 6: TREND (0-100) weight 0.10 ---
  const trendingR = listings.filter(l => l.classification === 'trending').length / n;
  const evergreenR = listings.filter(l => l.classification === 'evergreen').length / n;
  const newR = listings.filter(l => l.classification === 'new').length / n;
  const avgVel = listings.reduce((s, l) => s + (l.velocity_score || 0), 0) / n;
  const trendRaw = (
    trendingR * 40 +
    evergreenR * 30 +
    newR * 10 +
    Math.min(avgVel / 20, 1) * 20
  ) * 100;
  const trendScore = Math.min(100, trendRaw);

  // --- TOTAL ---
  const total = Math.round(
    demandScore * 0.25 +
    revenueScore * 0.20 +
    moatGapScore * 0.20 +
    trustBarrierScore * 0.15 +
    templateFitScore * 0.10 +
    trendScore * 0.10
  );

  // --- DECISION ---
  let decision = 'monitor';
  let reason = '';

  // Override: force SKIP
  if (templateFitScore < 20) { decision = 'skip'; reason = 'Poor template fit — cannot build this in Notion'; }
  else if (demandScore < 25) { decision = 'skip'; reason = 'No proven buyer demand'; }
  // Override: force MONITOR even if low
  else if (trendScore > 80 && total < 50) { decision = 'monitor'; reason = 'Rapidly growing niche — watch closely'; }
  else if (maxRevenue > 3000 && total < 50) { decision = 'monitor'; reason = 'Outlier opportunity — one listing has high revenue'; }
  // Standard thresholds
  else if (total >= 75) { decision = 'buy'; reason = 'Strong demand, weak competition, good template fit'; }
  else if (total >= 50) { decision = 'monitor'; reason = 'Moderate opportunity — collect more data'; }
  else { decision = 'skip'; reason = 'Market saturated or weak demand'; }

  return { score: total, decision, reason };
}

// Collect unique tags from listings
function collectTags(listings: EtsyImportListing[]): string[] {
  const tagSet = new Set<string>();
  for (const l of listings) {
    if (!l.tags) continue;
    try {
      const tags = JSON.parse(l.tags) as string[];
      for (const t of tags) {
        if (t && tagSet.size < 30) tagSet.add(t.toLowerCase().trim());
      }
    } catch {
      // tags might be comma-separated
      for (const t of String(l.tags).split(',')) {
        if (t.trim() && tagSet.size < 30) tagSet.add(t.trim().toLowerCase());
      }
    }
  }
  return Array.from(tagSet);
}

// GET: list opportunities
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const id = searchParams.get('id');

    if (id) {
      const opp = getOpportunity(parseInt(id, 10));
      if (!opp) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
      // Include linked listings
      const listings = opp.import_id ? getImportListings(opp.import_id) : [];
      const keywordFilter = opp.core_keywords ? JSON.parse(opp.core_keywords) : [];
      const relatedListings = listings.filter(l =>
        keywordFilter.length === 0 || keywordFilter.includes(l.source_keyword)
      );
      return NextResponse.json({ opportunity: opp, listings: relatedListings }, { headers: corsHeaders });
    }

    const opportunities = getOpportunities(status);
    return NextResponse.json({ opportunities }, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}

// POST: auto-generate opportunities from an import batch
export async function POST(req: NextRequest) {
  try {
    const { import_id } = await req.json();
    if (!import_id) {
      return NextResponse.json({ error: 'import_id required' }, { status: 400, headers: corsHeaders });
    }

    const listings = getImportListings(import_id);
    if (listings.length === 0) {
      return NextResponse.json({ error: 'No listings in this import' }, { status: 404, headers: corsHeaders });
    }

    // Group listings by source_keyword
    const groups: Record<string, EtsyImportListing[]> = {};
    for (const l of listings) {
      const key = (l.source_keyword || l.category || 'uncategorized').toLowerCase().trim();
      if (!groups[key]) groups[key] = [];
      groups[key].push(l);
    }

    const created = [];
    for (const [keyword, group] of Object.entries(groups)) {
      // Only create opportunity for groups with 2+ listings
      if (group.length < 2) continue;

      const { score, decision, reason } = computeOpportunityScore(group);
      const tags = collectTags(group);
      const avgPrice = group.reduce((s, l) => s + (l.price || 0), 0) / group.length;
      const totalFavs = group.reduce((s, l) => s + (l.favorites || 0), 0);
      const bsCount = group.filter(l => l.is_bestseller).length;
      const avgAge = group.reduce((s, l) => s + (l.listing_age_days || 0), 0) / group.length;
      const avgRevenue = group.reduce((s, l) => s + (l.revenue_estimate || 0), 0) / group.length;

      // New quality metrics
      const avgDescQ = group.reduce((s, l) => s + ((l as any).description_quality_score as number || 0), 0) / group.length;
      const avgImgQ = group.reduce((s, l) => s + ((l as any).image_quality_score as number || 0), 0) / group.length;
      const avgTrust = group.reduce((s, l) => s + ((l as any).trust_score as number || 0), 0) / group.length;
      const avgMoat = group.reduce((s, l) => s + ((l as any).moat_score as number || 0), 0) / group.length;

      // Extract top features and complaints from review signals
      const topFeatures: string[] = [];
      const topComplaints: string[] = [];
      for (const l of group) {
        const rs = (l as any).review_signals;
        if (rs) {
          try {
            const signals = typeof rs === 'string' ? JSON.parse(rs) : rs;
            if (signals.mentioned_features) for (const f of signals.mentioned_features) { if (topFeatures.indexOf(f) === -1) topFeatures.push(f); }
            if (signals.mentioned_complaints) for (const c of signals.mentioned_complaints) { if (topComplaints.indexOf(c) === -1) topComplaints.push(c); }
          } catch { /* ignore */ }
        }
      }

      // Determine category from most common
      const cats: Record<string, number> = {};
      for (const l of group) {
        const c = l.category || 'uncategorized';
        cats[c] = (cats[c] || 0) + 1;
      }
      const topCategory = Object.entries(cats).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

      // Map decision to status
      const statusMap: Record<string, string> = { buy: 'shortlisted', monitor: 'new', skip: 'dismissed' };

      const opportunity = createOpportunity({
        import_id,
        title: keyword.charAt(0).toUpperCase() + keyword.slice(1),
        core_keywords: [keyword],
        tag_set: tags.slice(0, 13),
        niche: keyword,
        category: topCategory,
        market_signals: {
          listings_count: group.length,
          bestseller_count: bsCount,
          etsy_pick_count: group.filter(l => l.is_etsy_pick).length,
          star_seller_count: group.filter(l => (l as any).is_star_seller).length,
          total_favorites: totalFavs,
          avg_price: Math.round(avgPrice * 100) / 100,
          avg_listing_age_days: Math.round(avgAge),
          avg_monthly_revenue: Math.round(avgRevenue * 100) / 100,
          trending_count: group.filter(l => l.classification === 'trending').length,
          evergreen_count: group.filter(l => l.classification === 'evergreen').length,
          avg_description_quality: Math.round(avgDescQ),
          avg_image_quality: Math.round(avgImgQ),
          avg_trust_score: Math.round(avgTrust),
          avg_moat_score: Math.round(avgMoat),
          decision,
          decision_reason: reason,
          top_features: topFeatures.slice(0, 10),
          top_complaints: topComplaints.slice(0, 10),
        },
        opportunity_score: score,
        status: statusMap[decision] || 'new',
      });

      created.push(opportunity);
    }

    // Sort by score descending
    created.sort((a, b) => b.opportunity_score - a.opportunity_score);

    return NextResponse.json({
      success: true,
      opportunities_created: created.length,
      opportunities: created,
    }, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}

// PATCH: update opportunity status or content
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...data } = body;
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400, headers: corsHeaders });
    }
    const updated = updateOpportunity(id, data);
    if (!updated) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
    }
    return NextResponse.json({ opportunity: updated }, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}

// DELETE
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400, headers: corsHeaders });
    }
    const deleted = deleteOpportunity(parseInt(id, 10));
    return NextResponse.json({ success: deleted }, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
