import { NextRequest, NextResponse } from 'next/server';
import { getOpportunity, updateOpportunity, getImportListings } from '@/lib/db';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL_CHAIN = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  for (const model of MODEL_CHAIN) {
    try {
      const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 65536, temperature: 0.4 },
        }),
      });
      if (resp.status === 429 || resp.status === 503) continue;
      if (!resp.ok) continue;
      const data = await resp.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
    } catch {
      continue;
    }
  }
  throw new Error('All Gemini models failed');
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface ImportListing {
  listing_id?: string;
  title: string;
  price?: number;
  reviews?: number;
  favorites?: number;
  rating?: number;
  listing_age_days?: number;
  listing_age_source?: string;
  revenue_estimate?: number;
  monthly_sales?: number;
  is_bestseller?: number;
  is_etsy_pick?: number;
  tags?: string;
  classification?: string;
  shop_name?: string;
  category?: string;
  source_keyword?: string;
  winner_tier?: string;
  winner_score?: number;
  [key: string]: any;
}

function buildListingBlock(l: ImportListing): string {
  const tags = l.tags ? (typeof l.tags === 'string' ? JSON.parse(l.tags) : l.tags) : [];
  const badges: string[] = [];
  if (l.is_bestseller) badges.push('Bestseller');
  if (l.is_etsy_pick) badges.push("Etsy's Pick");
  if (l.classification) badges.push(l.classification);

  return [
    `LISTING: "${l.title}"`,
    `  shop: ${l.shop_name || 'unknown'}`,
    `  price: $${l.price || 0}`,
    `  reviews: ${l.reviews || 0}`,
    `  rating: ${l.rating || 0}`,
    `  favorites: ${l.favorites || 0}`,
    `  age: ${l.listing_age_days ? Math.round(l.listing_age_days / 30) + ' months' : 'unknown'}`,
    `  moRev: $${l.revenue_estimate ? Math.round(l.revenue_estimate) : 0}/mo`,
    `  badges: [${badges.join(', ')}]`,
    `  tags: [${tags.slice(0, 13).join(', ')}]`,
    `  tier: ${l.winner_tier || 'unknown'} (score: ${l.winner_score || 0}/100)`,
  ].join('\n');
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500, headers: corsHeaders });
    }

    const body = await req.json();
    const { opportunity_id, listing_id } = body;
    if (!opportunity_id) {
      return NextResponse.json({ error: 'opportunity_id required' }, { status: 400, headers: corsHeaders });
    }

    const opp = getOpportunity(opportunity_id);
    if (!opp) {
      return NextResponse.json({ error: 'Opportunity not found' }, { status: 404, headers: corsHeaders });
    }

    // Get related listings
    const allListings: ImportListing[] = (opp.import_id ? getImportListings(opp.import_id) : []) as unknown as ImportListing[];
    const coreKeywords: string[] = opp.core_keywords ? JSON.parse(opp.core_keywords) : [];

    // Filter to relevant listings
    const relatedListings = allListings.filter(l =>
      coreKeywords.length === 0 || coreKeywords.includes(l.source_keyword || '')
    );

    // Sort by winner_score desc, then reviews desc
    relatedListings.sort((a, b) => (b.winner_score || 0) - (a.winner_score || 0) || (b.reviews || 0) - (a.reviews || 0));

    // If a specific listing_id was passed, use that as the primary listing
    let primaryListing = listing_id
      ? relatedListings.find(l => String(l.listing_id) === String(listing_id))
      : relatedListings[0];

    if (!primaryListing && relatedListings.length > 0) {
      primaryListing = relatedListings[0];
    }

    // Build competitor context (top 5 excluding primary)
    const competitors = relatedListings
      .filter(l => l.listing_id !== primaryListing?.listing_id)
      .slice(0, 5);

    const tags: string[] = opp.tag_set ? JSON.parse(opp.tag_set) : [];
    const signals = opp.market_signals ? JSON.parse(opp.market_signals) : {};

    // ═══════════════════════════════════════════════════════════
    // STRUCTURED PROMPT — listing-driven, Notion Builder output
    // ═══════════════════════════════════════════════════════════
    const prompt = `You are Claude Opus 4.6.
You are generating a TemplatePlan for CraftPlan Digital from ONE selected Etsy listing.
This is not brainstorming. This plan must be tied directly to the provided listing fields.

═══ PRIMARY LISTING (reverse-engineer this) ═══
${primaryListing ? buildListingBlock(primaryListing) : 'No primary listing available — use market signals below.'}

═══ TOP COMPETITORS (learn from these) ═══
${competitors.length > 0 ? competitors.map(l => buildListingBlock(l)).join('\n\n') : '(No competitor data)'}

═══ MARKET SIGNALS ═══
- Niche: ${opp.niche || opp.title}
- Category: ${opp.category || 'Digital Templates'}
- Opportunity Score: ${opp.opportunity_score}/100
- ${signals.listings_count || relatedListings.length} competing listings analyzed
- ${signals.bestseller_count || 0} bestsellers in niche
- Average price: $${signals.avg_price || 0}
- Average monthly revenue: $${signals.avg_monthly_revenue || 0}
- Popular tags: ${tags.slice(0, 20).join(', ') || '(none)'}

═══ TASK ═══
1) Infer the template's real structure from the primary listing (databases, properties, relations, rollups, formulas, views, dashboards).
2) Produce a plan that matches the structure and perceived value of what buyers are paying for.
3) Add an "upgrade layer" that improves UX, automation, and justifies a higher price.
4) Output must be a COMPLETE spec for our Notion Builder to execute.

═══ OUTPUT FORMAT — JSON ONLY ═══
{
  "templateName": "exact creative product name",
  "type": "life_planner|student_planner|finance_tracker|adhd_planner|social_media|habit_tracker|business_hub|debt_calculator|content_planner|project_tracker|productivity|journal|health_wellness",
  "aesthetic": "minimal|brown|pink|dark|sage|pastel|mono|rainbow|warm|cool",
  "complexity": "Simple|Medium|Advanced",
  "priceSuggestion": number,
  "databases": [
    {
      "name": "Database Name",
      "icon": "emoji",
      "purpose": "what this db tracks",
      "properties": [
        { "name": "PropName", "type": "title|text|number|select|multi_select|date|checkbox|url|email|formula|relation|rollup|files|status", "options": ["opt1","opt2"] }
      ]
    }
  ],
  "relations": [
    { "from": "DB Name", "property": "RelPropName", "to": "Target DB Name" }
  ],
  "rollups": [
    { "db": "DB Name", "property": "RollupName", "relation": "RelPropName", "target_property": "PropInTargetDB", "function": "count|sum|average|min|max|percent_checked" }
  ],
  "formulas": [
    { "db": "DB Name", "property": "FormulaName", "logic": "human-readable formula description", "formula": "Notion formula expression" }
  ],
  "views": [
    { "db": "DB Name", "name": "View Name", "type": "table|board|calendar|timeline|gallery|list", "filter": "optional filter description", "sort": "optional sort description" }
  ],
  "dashboards": [
    {
      "name": "Dashboard Name",
      "blocks": [
        { "type": "heading|callout|linked_db|divider|toggle|quote|text", "content": "block content or db reference", "config": {} }
      ]
    }
  ],
  "sampleData": [
    { "database": "DB Name", "rows": [ { "PropName": "value", "PropName2": "value" } ] }
  ],
  "etsyListing": {
    "title": "SEO title under 140 chars with keywords",
    "description": "300-word Etsy description with features, benefits, bullet points, and call to action",
    "tags": ["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8","tag9","tag10","tag11","tag12","tag13"],
    "seoCategory": "Etsy category path"
  },
  "mockupScenes": [
    "scene 1: detailed mockup description for AI image generation",
    "scene 2: detailed mockup description"
  ],
  "upgrades": [
    { "feature": "upgrade name", "description": "what it adds", "implementation": "how to build it in Notion" }
  ]
}

RULES:
- Every database MUST have at least 5 properties with correct types.
- Include at least 2 relations between databases.
- Include at least 1 rollup and 1 formula.
- Include at least 3 views across databases.
- Dashboard must have at least 8 blocks.
- Sample data must include at least 3 rows per database.
- All 13 Etsy tags must be unique, relevant, and keyword-rich.
- Upgrades must be concrete Notion features (automations, formulas, linked views), not vague ideas.
- Do NOT output markdown, prose, or explanations. ONLY the JSON object.`;

    const rawResponse = await callGemini(apiKey, prompt);

    // Parse JSON from response (handle markdown code blocks)
    let parsed: any;
    try {
      // Strip markdown fences aggressively
      let jsonStr = rawResponse;
      // Remove everything before first {
      const firstBrace = jsonStr.indexOf('{');
      if (firstBrace > 0) jsonStr = jsonStr.slice(firstBrace);
      // Remove everything after last }
      const lastBrace = jsonStr.lastIndexOf('}');
      if (lastBrace > 0) jsonStr = jsonStr.slice(0, lastBrace + 1);
      parsed = JSON.parse(jsonStr);
    } catch {
      // Try one more time with regex cleanup
      try {
        const cleaned = rawResponse.replace(/^[\s\S]*?```json\s*/m, '').replace(/```[\s\S]*$/, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = { raw_text: rawResponse };
      }
    }

    // Store the full plan_json for Notion Builder
    const planJson = parsed.raw_text ? null : parsed;

    // Build recommended_angle summary
    const angleSummary = planJson
      ? `${planJson.templateName} (${planJson.type}, ${planJson.aesthetic}, ${planJson.complexity}) — $${planJson.priceSuggestion || 0} suggested`
      : rawResponse.slice(0, 500);

    // Build deliverables summary
    const deliverables = planJson ? JSON.stringify({
      databases: (planJson.databases || []).length,
      relations: (planJson.relations || []).length,
      views: (planJson.views || []).length,
      dashboards: (planJson.dashboards || []).length,
      upgrades: (planJson.upgrades || []).length,
      sampleDataRows: (planJson.sampleData || []).reduce((sum: number, sd: any) => sum + (sd.rows?.length || 0), 0),
    }) : '{}';

    // Update opportunity with generated plan
    const updated = updateOpportunity(opportunity_id, {
      recommended_angle: angleSummary,
      deliverables: deliverables,
      listing_plan: JSON.stringify(planJson || parsed),
      status: 'shortlisted',
    });

    return NextResponse.json({
      success: true,
      opportunity: updated,
      generated_plan: planJson || parsed,
      primary_listing: primaryListing ? {
        listing_id: primaryListing.listing_id,
        title: primaryListing.title,
        price: primaryListing.price,
        reviews: primaryListing.reviews,
      } : null,
    }, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
