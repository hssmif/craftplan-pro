import { NextRequest, NextResponse } from 'next/server';
import { searchEtsyListings, analyzeNiche, estimateSales } from '@/lib/etsy-research';
import { saveTrackedListings, saveNicheResearch, getNicheResearch, getTrackedListings } from '@/lib/db';

// GET: fetch saved research data
export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type');

  if (type === 'niches') {
    return NextResponse.json(getNicheResearch());
  }

  if (type === 'listings') {
    const sortBy = request.nextUrl.searchParams.get('sort') || 'favorites';
    return NextResponse.json(getTrackedListings(sortBy));
  }

  // Return both
  return NextResponse.json({
    niches: getNicheResearch(),
    listings: getTrackedListings(),
  });
}

// POST: run a new search/analysis
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keyword, sort, limit } = body;

    if (!keyword) {
      return NextResponse.json({ error: 'keyword is required' }, { status: 400 });
    }

    // Search Etsy
    const results = await searchEtsyListings(keyword, sort, limit);

    // Enrich with sales estimates
    const enrichedListings = results.listings.map((l) => ({
      ...l,
      sales_estimate: estimateSales(l.favorites, l.listing_age_days),
      shop_name: l.shop_name || null,
      last_checked: null,
    }));

    // Save listings to DB
    saveTrackedListings(enrichedListings);

    // Analyze niche
    const analysis = analyzeNiche(
      enrichedListings.map((l) => ({
        price: l.price,
        favorites: l.favorites,
        views: l.views,
        listing_age_days: l.listing_age_days,
      })),
      results.total
    );

    // Collect all tags
    const allTags: Record<string, number> = {};
    for (const listing of enrichedListings) {
      try {
        const tags = JSON.parse(listing.tags) as string[];
        for (const tag of tags) {
          allTags[tag] = (allTags[tag] || 0) + 1;
        }
      } catch { /* ignore */ }
    }
    const topTags = Object.entries(allTags)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([tag]) => tag);

    // Save niche research
    saveNicheResearch({
      keyword,
      total_results: results.total,
      avg_price: analysis.avg_price,
      avg_favorites: analysis.avg_favorites,
      top_tags: JSON.stringify(topTags),
      competition_level: analysis.competition_level,
      demand_score: analysis.demand_score,
    });

    return NextResponse.json({
      keyword,
      total_results: results.total,
      listings: enrichedListings,
      analysis,
      top_tags: topTags,
    });
  } catch (error) {
    console.error('Research error:', error);
    const message = error instanceof Error ? error.message : 'Research failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
