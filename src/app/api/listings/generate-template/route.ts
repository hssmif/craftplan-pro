import { NextRequest, NextResponse } from 'next/server';
import {
  getImportListingById,
  getImportListingByListingId,
  getImportListings,
  findOpportunityByListing,
  createOpportunity,
  getOpportunity,
  updateOpportunity,
} from '@/lib/db';
import { inferParity, enforceViewVariety, sanitizeParityTargets, enforceOsUltraStructure, type ParityHints } from '@/lib/premium-template-framework';

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
function buildListingBlock(l: any): string {
  const tags = l.tags ? (typeof l.tags === 'string' ? JSON.parse(l.tags) : l.tags) : [];
  const badges: string[] = [];
  if (l.is_bestseller) badges.push('Bestseller');
  if (l.is_etsy_pick) badges.push("Etsy's Pick");
  if (l.classification) badges.push(l.classification);

  let descFeatures = '';
  try {
    const ds = typeof l.description_sections === 'string' ? JSON.parse(l.description_sections) : l.description_sections;
    if (ds?.features?.length) descFeatures = `\n  features: [${ds.features.slice(0, 10).join(', ')}]`;
    if (ds?.whats_included?.length) descFeatures += `\n  includes: [${ds.whats_included.slice(0, 8).join(', ')}]`;
  } catch { /* */ }

  let reviewFeatures = '';
  try {
    const rs = typeof l.review_signals === 'string' ? JSON.parse(l.review_signals) : l.review_signals;
    if (rs?.mentioned_features?.length) reviewFeatures = `\n  review_mentions: [${rs.mentioned_features.slice(0, 8).join(', ')}]`;
    if (rs?.mentioned_complaints?.length) reviewFeatures += `\n  complaints: [${rs.mentioned_complaints.slice(0, 5).join(', ')}]`;
  } catch { /* */ }

  return [
    `LISTING: "${l.title}"`,
    `  shop: ${l.shop_name || 'unknown'}`,
    `  price: $${l.price || 0}`,
    `  reviews: ${l.reviews || 0}`,
    `  rating: ${l.rating || 0}`,
    `  favorites: ${l.favorites || 0}`,
    `  age: ${l.listing_age_days ? Math.round(l.listing_age_days / 30) + ' months' : 'unknown'}`,
    `  moRev: $${l.revenue_estimate ? Math.round(l.revenue_estimate) : 0}/mo`,
    `  images: ${l.image_count || 0}, video: ${l.has_video ? 'yes' : 'no'}`,
    `  badges: [${badges.join(', ')}]`,
    `  tags: [${tags.slice(0, 13).join(', ')}]`,
    `  tier: ${l.winner_tier || 'unknown'} (score: ${l.winner_score || 0}/100)`,
    `  feature_density: ${l.feature_density || 0}`,
    `  moat_score: ${l.moat_score || 0}`,
    descFeatures,
    reviewFeatures,
  ].filter(Boolean).join('\n');
}

function buildParityPromptBlock(hints: ParityHints): string {
  return [
    `═══ PARITY HINTS (match this structure) ═══`,
    `Page type: ${hints.pageType}`,
    `Visual tier: ${hints.visualTier}`,
    `Premium tier: ${hints.premiumTier}`,
    `Target database count: ${hints.inferredDbCount}`,
    `Inferred databases: [${hints.inferredDatabases.join(', ')}]`,
    `View types to use: [${hints.inferredViewTypes.join(', ')}]`,
    `KPI card count: ${hints.kpiCount}`,
    `Charts: ${hints.hasCharts ? `yes (${hints.chartCount})` : 'no'}`,
    `Sub-pages: ${hints.subPageCount > 0 ? hints.subPageCount : 'none'}`,
    `Section order: [${hints.sectionOrder.join(' → ')}]`,
    hints.complaintUpgrades.length > 0
      ? `Competitor complaints to fix as upgrades:\n  ${hints.complaintUpgrades.join('\n  ')}`
      : '',
  ].filter(Boolean).join('\n');
}

/**
 * ONE-CLICK endpoint: listing_id → create opportunity → generate plan → return redirect
 */
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500, headers: corsHeaders });
    }

    const body = await req.json();
    const { listing_id, import_id } = body;
    if (!listing_id || !import_id) {
      return NextResponse.json({ error: 'listing_id and import_id required' }, { status: 400, headers: corsHeaders });
    }

    // ── Step 1: Get the listing ──
    const listing = getImportListingByListingId(String(listing_id))
      || getImportListingById(Number(listing_id));
    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404, headers: corsHeaders });
    }

    // ── Step 2: Get siblings (same keyword) for context ──
    const allListings = getImportListings(Number(import_id));
    const siblings = allListings.filter(
      (l: any) => l.source_keyword === listing.source_keyword
    );
    siblings.sort((a: any, b: any) =>
      (b.winner_score || 0) - (a.winner_score || 0) || (b.reviews || 0) - (a.reviews || 0)
    );

    // ── Step 3: Find or create opportunity ──
    let opportunity = findOpportunityByListing(String(listing.listing_id), Number(import_id));
    if (!opportunity) {
      // Get unique tags from siblings
      const tagSet = new Set<string>();
      for (const s of siblings) {
        try {
          const t = typeof s.tags === 'string' ? JSON.parse(s.tags) : (s.tags || []);
          t.forEach((tag: string) => tagSet.add(tag));
        } catch { /* */ }
      }

      opportunity = createOpportunity({
        import_id: Number(import_id),
        title: listing.source_keyword || listing.title,
        core_keywords: [listing.source_keyword || ''],
        tag_set: Array.from(tagSet).slice(0, 30),
        niche: listing.source_keyword || '',
        category: listing.category || 'Digital Templates',
        opportunity_score: listing.winner_score || 50,
        status: 'shortlisted',
      });
    }

    // ── Step 4: Infer parity from listing data ──
    const competitors = siblings.filter((l: any) => l.listing_id !== listing.listing_id).slice(0, 5);
    const parityHints = inferParity(listing as any, competitors as any[], opportunity as any);

    // ── Step 5: Build Gemini prompt with parity hints ──
    const prompt = `You are a Notion template architect.
You are generating a TemplatePlan for CraftPlan Digital from ONE selected Etsy listing.
This is not brainstorming. This plan must match the STRUCTURE of the provided listing.

═══ PRIMARY LISTING (reverse-engineer this) ═══
${buildListingBlock(listing)}

═══ TOP COMPETITORS (learn from these) ═══
${competitors.length > 0 ? competitors.map((l: any) => buildListingBlock(l)).join('\n\n') : '(No competitor data)'}

${buildParityPromptBlock(parityHints)}

═══ TASK ═══
1) Reverse-engineer the template structure from the primary listing's features, tags, and description.
2) Produce a TemplatePlan that MATCHES the competitor's feature set (parity), then ADD upgrades.
3) Include a layoutBlueprint that defines the exact page section order.
4) Include a styleBlueprint that defines the visual rules.
5) Include parityTargets mapping each competitor feature to our implementation.

═══ OUTPUT FORMAT — JSON ONLY ═══
{
  "templateName": "string",
  "type": "life_planner|student_planner|finance_tracker|adhd_planner|social_media|habit_tracker|business_hub|debt_calculator|content_planner|project_tracker|productivity|journal|health_wellness",
  "aesthetic": "minimal|brown|pink|dark|sage|pastel|mono|rainbow|warm|cool",
  "complexity": "Simple|Medium|Advanced",
  "priceSuggestion": number,
  "databases": [
    { "name": "string", "icon": "emoji", "purpose": "string",
      "properties": [{ "name": "string", "type": "title|text|number|select|multi_select|date|checkbox|url|email|formula|relation|rollup|files|status", "options": ["opt1"] }]
    }
  ],
  "relations": [{ "from": "DB", "property": "PropName", "to": "DB" }],
  "rollups": [{ "db": "DB", "property": "Name", "relation": "Rel", "target_property": "Prop", "function": "sum|count|average" }],
  "formulas": [{ "db": "DB", "property": "Name", "logic": "description", "formula": "Notion expression" }],
  "views": [{ "db": "DB", "name": "View", "type": "table|board|calendar|timeline|gallery|list", "filter": "", "sort": "" }],
  "dashboards": [{ "name": "Home", "blocks": [{ "type": "heading|callout|linked_db|divider|toggle|quote|text", "content": "", "config": {} }] }],
  "sampleData": [{ "database": "DB", "rows": [{ "Prop": "value" }] }],

  "layoutBlueprint": {
    "pageType": "${parityHints.pageType}",
    "visualTier": "${parityHints.visualTier}",
    "sections": [
      { "id": "unique_id", "heading": "Section Name", "columns": 1,
        "componentType": "cover_hero|nav_bar|kpi_row|quick_actions|database_section|chart_row|toggle_section|spacer|divider|brand_footer",
        "databaseRef": "db_key_if_database_section",
        "viewType": "table|board|calendar|gallery",
        "charts": [{ "title": "", "chartType": "line|bar|donut", "databaseRef": "", "xAxis": "", "yAxis": "", "aggregation": "sum" }],
        "columnContents": [],
        "apiBuildable": true
      }
    ],
    "subPageLayouts": [{ "name": "", "icon": "", "sections": [] }]
  },

  "styleBlueprint": {
    "palette": { "aesthetic": "dark", "brandColor": "blue", "cardColor": "gray", "accentColor": "purple", "dividerFrequency": "every_section" },
    "cover": { "url": "https://images.unsplash.com/photo-...", "fallbackUrl": "https://www.notion.so/images/page-cover/gradients_5.png" },
    "icons": { "style": "emoji", "pageIcon": "emoji", "databaseIcons": {}, "navIcons": {}, "kpiIcons": {} },
    "typography": { "headingStyle": "emoji_prefix", "quotesAsTaglines": true },
    "spacing": { "sectionSeparator": "divider", "afterNavBar": "divider", "afterKpiRow": "spacer", "betweenDatabases": "heading_divider" }
  },

  "parityTargets": [
    { "competitorFeature": "what competitor has", "ourImplementation": "how we build it",
      "buildMethod": "api|prompt|manual", "priority": "critical|important|nice_to_have", "implemented": false, "notes": "" }
  ],

  "etsyListing": {
    "title": "SEO title <140 chars — REWRITTEN, not copied",
    "description": "300-word original description",
    "tags": ["13 unique tags"],
    "seoCategory": "Etsy category"
  },
  "mockupScenes": ["10 detailed AI image generation prompts"],
  "upgrades": [{ "feature": "", "description": "", "implementation": "" }]
}

RULES:
- layoutBlueprint.sections MUST follow the section order from the parity hints
- Use the parity hints above for database count, view types, visual tier, and premium tier
- Every database MUST have at least 5 properties
- Include at least 2 relations, 1 rollup, 1 formula
- Dashboard must have at least 8 blocks
- Sample data: at least 5 rows per database with a coherent story
- Charts are ALWAYS apiBuildable: false
- kpi_row sections are ALWAYS apiBuildable: false (require Notion /chart commands)
- widget_grid sections are ALWAYS apiBuildable: false (require Notion /chart upgrade)
- toggle_section sections are ALWAYS apiBuildable: false (require manual onboarding setup)
- hero_device_mockup sections are ALWAYS apiBuildable: false (require image generation)
- Filtered views are ALWAYS apiBuildable: false
- parityTargets must include EVERY feature from the competitor's listing
- All 13 Etsy tags unique, keyword-rich — REWRITTEN, not copied from competitor
- mockupScenes: generate exactly 10 prompts (hero, 4 detail, 3 lifestyle, 2 feature)
- ALL copy must be ORIGINAL — do not copy competitor text, titles, or descriptions
- Output ONLY the JSON object, no markdown or prose

OS_ULTRA REQUIREMENTS (when premium tier is "os_ultra"):
- layoutBlueprint.sections MUST follow: cover_hero → nav_bar → widget_grid → fast_actions → [app_panels with database_section pairs] → chart_row → toggle_section → brand_footer
- styleBlueprint MUST include osUltra object with: osStyle: true, backgroundMode: "dark_os", cardStyle: "elevated_tiles", cardRadius: "soft", shadowStyle: "subtle", accentPolicy: "single_accent", widgetStyle: "os_tiles"
- styleBlueprint.palette: use dark-friendly colors (blue primary, purple secondary, gray accent)
- styleBlueprint.cover: use cinematic/dark theme URLs from Unsplash (1500x600, landscape, dark aesthetic)
- widget_grid section: 3-4 KPI tiles, each with icon + label + formula value + color. apiBuildable: false
- fast_actions section: 2-4 action buttons as callouts with emoji + label. apiBuildable: true
- app_panels sections: group databases into 2-column panels. apiBuildable: true
- Navigation tabs: Use OS-style labels (Command Center, Analytics, Library, Settings)
- Icons: consistent emoji family (all colored circles, all objects, or all symbols — NOT mixed)
- mockupScenes: ALL 10 must be dark/cinematic device mockups (MacBook, iPad, iPhone in dark environments)
- styleBlueprint.premiumTier: "os_ultra"`;

    const rawResponse = await callGemini(apiKey, prompt);

    // ── Step 6: Parse JSON ──
    let parsed: any;
    try {
      let jsonStr = rawResponse;
      const firstBrace = jsonStr.indexOf('{');
      if (firstBrace > 0) jsonStr = jsonStr.slice(firstBrace);
      const lastBrace = jsonStr.lastIndexOf('}');
      if (lastBrace > 0) jsonStr = jsonStr.slice(0, lastBrace + 1);
      parsed = JSON.parse(jsonStr);
    } catch {
      try {
        const cleaned = rawResponse.replace(/^[\s\S]*?```json\s*/m, '').replace(/```[\s\S]*$/, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = { raw_text: rawResponse };
      }
    }

    const planJson = parsed.raw_text ? null : parsed;

    // ── Step 6b: Post-process plan — enforce quality gates ──
    if (planJson) {
      // Task A: Enforce view variety (>= 3 distinct types)
      const viewResult = enforceViewVariety(planJson);
      if (viewResult.added.length > 0) {
        console.log(`[Generate] View variety enforced: +${viewResult.added.length} views → ${viewResult.viewTypes.join(', ')}`);
      }
      // Task B: Sanitize parity targets (remove tag/SEO-based fakes)
      const parityResult = sanitizeParityTargets(planJson, listing as any);
      if (parityResult.removed.length > 0) {
        console.log(`[Generate] Parity cleanup: removed ${parityResult.removed.length} fake targets → ${parityResult.removed.join(', ')}`);
      }
      // Task C: Enforce OS_ULTRA structure if tier detected
      if (parityHints.premiumTier === "os_ultra") {
        const osResult = enforceOsUltraStructure(planJson);
        if (osResult.added.length > 0 || osResult.reordered) {
          console.log(`[Generate] OS_ULTRA enforced: added [${osResult.added.join(', ')}], reordered: ${osResult.reordered}`);
        }
      }
    }

    // ── Step 7: Update opportunity with plan ──
    const angleSummary = planJson
      ? `${planJson.templateName} (${planJson.type}, ${planJson.aesthetic}, ${planJson.complexity}) — $${planJson.priceSuggestion || 0}`
      : rawResponse.slice(0, 500);

    const deliverables = planJson ? JSON.stringify({
      databases: (planJson.databases || []).length,
      relations: (planJson.relations || []).length,
      views: (planJson.views || []).length,
      hasLayoutBlueprint: !!planJson.layoutBlueprint,
      hasStyleBlueprint: !!planJson.styleBlueprint,
      parityTargetCount: (planJson.parityTargets || []).length,
      sampleDataRows: (planJson.sampleData || []).reduce((sum: number, sd: any) => sum + (sd.rows?.length || 0), 0),
    }) : '{}';

    updateOpportunity(opportunity.id, {
      recommended_angle: angleSummary,
      deliverables: deliverables,
      listing_plan: JSON.stringify(planJson || parsed),
      status: 'shortlisted',
    });

    return NextResponse.json({
      success: true,
      opportunity_id: opportunity.id,
      redirect: `/notion-builder?plan=${opportunity.id}`,
      templateName: planJson?.templateName || 'Generated Template',
      hasBlueprint: !!planJson?.layoutBlueprint,
      hasStyle: !!planJson?.styleBlueprint,
      parityTargetCount: (planJson?.parityTargets || []).length,
    }, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
