import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import {
  getTemplateSpec,
  BlockSpec,
  DatabaseSpec,
  DatabaseProperty,
  PageSpec,
  TemplateSection,
  createCallout,
} from "@/lib/notion-templates";
import {
  applyPremiumFramework,
  buildPremiumConfig,
  aiPlanToNotionSpec,
  PremiumConfig,
  freshenSampleDates,
  computeKPIValues,
  applyLayoutBlueprint,
  validatePremiumOutput,
  evaluateOsChecklist,
  generateViewSetupSteps,
  type LayoutBlueprint,
  type StyleBlueprint,
  type ParityTarget,
  type PromptOnlyStep,
} from "@/lib/premium-template-framework";
import { computeQualityScore } from "@/lib/quality-score";

// ── Rate limit helper: 300ms between calls ──
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Database cover image map (keyword → premium dark Unsplash URL) ──
const DB_COVER_MAP: Record<string, string> = {
  wallet: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1500&q=80",
  task: "https://images.unsplash.com/photo-1557683316-973673baf926?w=1500&q=80",
  goal: "https://images.unsplash.com/photo-1636955779321-819753cd1741?w=1500&q=80",
  habit: "https://images.unsplash.com/photo-1614854262318-831574f15f1f?w=1500&q=80",
  journal: "https://images.unsplash.com/photo-1579547944212-c4f4961a8dd8?w=1500&q=80",
  reading: "https://images.unsplash.com/photo-1535905557558-afc4877a26fc?w=1500&q=80",
  note: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1500&q=80",
  idea: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1500&q=80",
  finance: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1500&q=80",
  budget: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1500&q=80",
  fitness: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1500&q=80",
  workout: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1500&q=80",
  travel: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1500&q=80",
  project: "https://images.unsplash.com/photo-1557683316-973673baf926?w=1500&q=80",
  meal: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1500&q=80",
  recipe: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1500&q=80",
  social: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=1500&q=80",
  content: "https://images.unsplash.com/photo-1533750516457-a7f992034fec?w=1500&q=80",
  student: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=1500&q=80",
  course: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=1500&q=80",
  wedding: "https://images.unsplash.com/photo-1519741497674-611481863552?w=1500&q=80",
};

function findCoverUrlForDb(dbName: string): string | null {
  const lower = dbName.toLowerCase();
  for (const [keyword, url] of Object.entries(DB_COVER_MAP)) {
    if (lower.includes(keyword)) return url;
  }
  return null;
}


// ── Raw Notion API helper (bypasses SDK's bodyParam stripping) ──
async function notionFetch(
  token: string,
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Notion API ${method} ${path} failed: ${data.message || JSON.stringify(data)}`
    );
  }
  return data;
}

// ── Emoji safety — Notion API rejects non-emoji Unicode symbols like ✓ (U+2713) ──
// Only true emoji characters (e.g. ✅ ⚡ 📋 🧠) are accepted.
// This deny-list catches known dingbats/symbols that LOOK like emoji but aren't.
const NON_EMOJI_SYMBOLS = new Set([
  "✓", "✗", "✕", "×", "÷", "★", "☆", "♦", "♣", "♠", "♥",
  "•", "‣", "※", "§", "†", "‡", "¶", "©", "®", "™", "℠",
]);

function safeEmoji(raw: string | undefined): string {
  if (!raw || raw.trim().length === 0) return "💡";
  const trimmed = raw.trim();
  if (NON_EMOJI_SYMBOLS.has(trimmed)) {
    console.warn(`[Notion Build] Replaced non-emoji icon "${trimmed}" with fallback 💡`);
    return "💡";
  }
  return trimmed;
}

// ── Convert our BlockSpec to Notion API block format ──
function blockSpecToNotionBlock(block: BlockSpec): Record<string, unknown> {
  const annotations: Record<string, boolean> = {};
  if (block.bold) annotations.bold = true;
  if (block.italic) annotations.italic = true;

  const richText = block.text
    ? [
        {
          type: "text",
          text: { content: block.text },
          ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
        },
      ]
    : [];

  switch (block.type) {
    case "heading_1":
      return {
        object: "block",
        type: "heading_1",
        heading_1: { rich_text: richText, color: block.color || "default" },
      };
    case "heading_2":
      return {
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: richText, color: block.color || "default" },
      };
    case "heading_3":
      return {
        object: "block",
        type: "heading_3",
        heading_3: { rich_text: richText, color: block.color || "default" },
      };
    case "paragraph":
      return {
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: richText, color: block.color || "default" },
      };
    case "callout":
      return {
        object: "block",
        type: "callout",
        callout: {
          rich_text: richText,
          icon: { type: "emoji", emoji: safeEmoji(block.icon) },
          color: block.color || "blue_background",
        },
      };
    case "divider":
      return { object: "block", type: "divider", divider: {} };
    case "to_do":
      return {
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: richText,
          checked: block.checked ?? false,
        },
      };
    case "toggle":
      return {
        object: "block",
        type: "toggle",
        toggle: {
          rich_text: richText,
          children: (block.children || []).map(blockSpecToNotionBlock),
        },
      };
    case "bulleted_list_item":
      return {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: richText },
      };
    case "numbered_list_item":
      return {
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: { rich_text: richText },
      };
    case "quote":
      return {
        object: "block",
        type: "quote",
        quote: { rich_text: richText, color: block.color || "default" },
      };
    case "table_of_contents":
      return {
        object: "block",
        type: "table_of_contents",
        table_of_contents: { color: block.color || "default" },
      };
    case "bookmark":
      return {
        object: "block",
        type: "bookmark",
        bookmark: { url: block.url || "", caption: richText },
      };
    case "column_list": {
      // Notion requires column_list to have at least 2 columns
      const columns = (block.columns || []).slice();
      while (columns.length < 2) {
        columns.push([{ type: "paragraph", text: "" }] as BlockSpec[]);
      }
      return {
        object: "block",
        type: "column_list",
        column_list: {
          children: columns.map((columnBlocks) => ({
            object: "block",
            type: "column",
            column: {
              children: columnBlocks.map(blockSpecToNotionBlock),
            },
          })),
        },
      };
    }
    case "table":
      return {
        object: "block",
        type: "table",
        table: {
          table_width: block.tableWidth || 2,
          has_column_header: block.hasColumnHeader !== false,
          children: (block.tableRows || []).map(row => ({
            object: "block",
            type: "table_row",
            table_row: {
              cells: row.map(cell => [
                { type: "text", text: { content: String(cell) } }
              ])
            }
          }))
        }
      };
    case "linked_database":
      // Placeholder — linked_database blocks are resolved AFTER database creation
      // by blockSpecToNotionBlock_withDbMap(). If we reach here, emit a paragraph hint.
      return {
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [{ type: "text", text: { content: `📊 Linked view: ${block.text || block.databaseKey || "database"}` } }] },
      };
    default:
      return {
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: richText },
      };
  }
}

// ── Convert our DatabaseProperty to Notion API property schema ──
function propertyToNotionSchema(
  prop: DatabaseProperty,
  _dbIdMap: Record<string, string>
): Record<string, unknown> | null {
  let schema: Record<string, unknown> | null = null;
  switch (prop.type) {
    case "title":
      schema = { title: {} };
      break;
    case "rich_text":
      schema = { rich_text: {} };
      break;
    case "number":
      schema = { number: { format: prop.numberFormat || "number" } };
      break;
    case "select":
      schema = {
        select: {
          options: (prop.options || []).map((o) => ({
            name: o.name,
            color: o.color,
          })),
        },
      };
      break;
    case "multi_select":
      schema = {
        multi_select: {
          options: (prop.options || []).map((o) => ({
            name: o.name,
            color: o.color,
          })),
        },
      };
      break;
    case "date":
      schema = { date: {} };
      break;
    case "checkbox":
      schema = { checkbox: {} };
      break;
    case "url":
      schema = { url: {} };
      break;
    case "email":
      schema = { email: {} };
      break;
    case "formula":
      schema = { formula: { expression: prop.formula || "" } };
      break;
    case "relation":
      // Relations will be added after all databases are created
      return null;
    case "rollup":
      return null; // Same — need relations first
    case "created_time":
      schema = { created_time: {} };
      break;
    case "last_edited_time":
      schema = { last_edited_time: {} };
      break;
    default:
      schema = { rich_text: {} };
  }

  // Add property description if present (Notion API v2022-06-28 supports this)
  if (schema && prop.description) {
    schema.description = prop.description;
  }

  return schema;
}

// ── Convert sample data row to Notion API page properties ──
function sampleRowToNotionProperties(
  row: Record<string, unknown>,
  dbSpec: DatabaseSpec
): Record<string, unknown> {
  const props: Record<string, unknown> = {};

  for (const propSpec of dbSpec.properties) {
    const value = row[propSpec.name];
    if (value === undefined || value === null) continue;

    switch (propSpec.type) {
      case "title":
        props[propSpec.name] = {
          title: [{ type: "text", text: { content: String(value) } }],
        };
        break;
      case "rich_text":
        props[propSpec.name] = {
          rich_text: [{ type: "text", text: { content: String(value) } }],
        };
        break;
      case "number":
        props[propSpec.name] = { number: Number(value) };
        break;
      case "select":
        props[propSpec.name] = { select: { name: String(value) } };
        break;
      case "multi_select":
        if (Array.isArray(value)) {
          props[propSpec.name] = {
            multi_select: value.map((v: string) => ({ name: v })),
          };
        }
        break;
      case "date":
        props[propSpec.name] = { date: { start: String(value) } };
        break;
      case "checkbox":
        props[propSpec.name] = { checkbox: Boolean(value) };
        break;
      case "url":
        props[propSpec.name] = { url: String(value) };
        break;
      // Skip relation, rollup, formula, created_time, last_edited_time — auto-filled
    }
  }

  return props;
}

// ═══════════════════════════════════════════════════════════
// POST /api/notion/build — Build a template in Notion
// ═══════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    const { notionToken, parentPageId, templateId, aesthetic, premium, premiumConfig, opportunityPlan, competitorContext } =
      await req.json();

    if (!notionToken || !parentPageId) {
      return NextResponse.json(
        { error: "Missing required fields: notionToken, parentPageId" },
        { status: 400 }
      );
    }

    // Two modes:
    // 1. opportunityPlan → build from AI-generated plan JSON (from Etsy opportunity)
    // 2. templateId → build from pre-built template spec (ADHD, Life, Finance)
    let spec;
    let promptOnlySteps: PromptOnlyStep[] = [];

    if (opportunityPlan) {
      // ── Mode 1: Build from AI-generated opportunity plan ──
      console.log(`[Notion Build] Building from AI opportunity plan: ${opportunityPlan.templateName}`);
      const baseSpec = aiPlanToNotionSpec(opportunityPlan, aesthetic);

      if (premium) {
        // 1. Freshen dates BEFORE computing KPIs (so counts/streaks match fresh data)
        freshenSampleDates(baseSpec.databases);
        console.log(`[Notion Build] Freshened sample data dates to build time`);

        // 2. Build premium config
        const config: PremiumConfig = buildPremiumConfig(
          opportunityPlan.type || "life_planner",
          aesthetic || opportunityPlan.aesthetic || "minimal",
          {
            templateName: opportunityPlan.templateName,
            tagline: opportunityPlan.etsyListing?.title || "",
            icon: opportunityPlan.icon || baseSpec.icon,
          }
        );

        // 3. Sync KPI values with ACTUAL sample data BEFORE framework bakes them into blocks
        computeKPIValues(config.dashboard.kpiCards, baseSpec.databases);
        console.log(`[Notion Build] Synced KPI values with sample data`);

        // 4. Apply framework — KPI values are now correct in the config
        spec = applyPremiumFramework(baseSpec, config);
        console.log(`[Notion Build] Premium framework applied to AI plan`);

        // 5. Phase 2.5: Apply Layout Blueprint if present in the AI plan
        const blueprint = opportunityPlan.layoutBlueprint as LayoutBlueprint | undefined;
        const styleBp = opportunityPlan.styleBlueprint as StyleBlueprint | undefined;
        if (blueprint && styleBp) {
          console.log(`[Notion Build] Applying layout blueprint (${blueprint.sections.length} sections, tier: ${blueprint.visualTier})`);
          const result = applyLayoutBlueprint(spec, blueprint, styleBp, config);
          spec.dashboardBlocks = result.blocks;
          promptOnlySteps = result.promptOnlySteps;

          // Apply style cover override
          if (styleBp.cover?.url) {
            spec.cover = styleBp.cover.url;
          }
          // Apply style icon override
          if (styleBp.icons?.pageIcon) {
            spec.icon = styleBp.icons.pageIcon;
          }
          console.log(`[Notion Build] Blueprint applied: ${result.blocks.length} blocks, ${promptOnlySteps.length} prompt-only steps`);
        }

        // Collect parity targets for prompt-only features
        // Note: Gemini always sets implemented=true in template output,
        // so we only check buildMethod (manual/prompt targets need manual steps)
        const parityTargets = (opportunityPlan.parityTargets || []) as ParityTarget[];
        for (const pt of parityTargets) {
          if (pt.buildMethod !== "api") {
            const methodLabel = pt.buildMethod === "prompt"
              ? "Use Notion AI (/) to generate"
              : "Manual setup in Notion";
            promptOnlySteps.push({
              section: `Parity: ${pt.competitorFeature}`,
              instruction: [
                `COMPETITOR FEATURE: "${pt.competitorFeature}"`,
                `OUR IMPLEMENTATION: ${pt.ourImplementation}`,
                `METHOD: ${methodLabel}`,
                `PRIORITY: ${pt.priority || "important"}`,
                pt.notes ? `NOTE: ${pt.notes}` : "",
              ].filter(Boolean).join("\n"),
              componentType: `parity_${pt.buildMethod}`,
            });
          }
        }

        // Phase 2.7: Add view/button/nav setup steps based on template type
        const aiTemplateType = opportunityPlan.type || "life_planner";
        const viewSteps = generateViewSetupSteps(aiTemplateType);
        promptOnlySteps.push(...viewSteps);
      } else {
        freshenSampleDates(baseSpec.databases);
        spec = baseSpec;
      }
    } else if (templateId) {
      // ── Mode 2: Build from pre-built template spec ──
      const baseSpec = getTemplateSpec(templateId, aesthetic || "minimal");
      if (!baseSpec) {
        return NextResponse.json(
          { error: `Unknown template: ${templateId}` },
          { status: 400 }
        );
      }

      if (premium) {
        // 1. Freshen dates first
        freshenSampleDates(baseSpec.databases);
        console.log(`[Notion Build] Freshened sample data dates to build time`);

        // 2. Build premium config
        const config: PremiumConfig = premiumConfig
          ? premiumConfig as PremiumConfig
          : buildPremiumConfig(templateId, aesthetic || "minimal", {
              templateName: baseSpec.name,
              tagline: baseSpec.description,
              icon: baseSpec.icon,
            });

        // 3. Sync KPI values
        computeKPIValues(config.dashboard.kpiCards, baseSpec.databases);
        console.log(`[Notion Build] Synced KPI values with sample data`);

        // 4. Apply framework
        spec = applyPremiumFramework(baseSpec, config);
        console.log(`[Notion Build] Premium framework applied to ${templateId}`);

        // 5. Add view/button/nav setup steps
        const viewSteps = generateViewSetupSteps(templateId);
        promptOnlySteps.push(...viewSteps);
      } else {
        freshenSampleDates(baseSpec.databases);
        spec = baseSpec;
      }
    } else {
      return NextResponse.json(
        { error: "Either templateId or opportunityPlan is required" },
        { status: 400 }
      );
    }

    // Keep SDK for page/block operations (those still work fine)
    const notion = new Client({ auth: notionToken });

    const steps: string[] = [];
    const dbIdMap: Record<string, string> = {};

    // ── Step 1: Create main template page ──
    // ── Competitor intelligence context ──
    if (competitorContext) {
      const cc = competitorContext;
      console.log(`[Notion Build] Competitor intelligence: "${cc.title}" by ${cc.shop} — $${cc.price}, ${cc.reviews} reviews, $${cc.revenue}/mo, tier: ${cc.tier}`);
      steps.push(`🔍 Competitor: ${cc.shop || "Unknown"} — $${cc.price || "?"} · ${cc.reviews || 0} reviews · $${Math.round(cc.revenue || 0)}/mo · ${cc.tier || ""}`);
      steps.push(`🎯 Building to beat: "${(cc.title || "").slice(0, 60)}${(cc.title || "").length > 60 ? "..." : ""}"`);
    }

    steps.push("Creating main template page...");
    console.log(`[Notion Build] Creating main page: ${spec.name}`);

    // Split blocks into 3 tiers:
    // 1. simpleBlocks — go in initial page create (no column_list/table)
    // 2. complexBlocks — appended right after page create (column_list/table, no linked_database)
    // 3. deferredBlocks — appended AFTER databases are created (contain linked_database refs)
    const simpleBlocks: BlockSpec[] = [];
    const complexBlocks: BlockSpec[] = [];
    const deferredBlocks: BlockSpec[] = [];

    /** Check if a block or any of its nested children contain a linked_database */
    function hasLinkedDb(block: BlockSpec): boolean {
      if (block.type === "linked_database") return true;
      if (block.columns) return block.columns.some(col => col.some(hasLinkedDb));
      if (block.children) return block.children.some(hasLinkedDb);
      return false;
    }

    let hitComplex = false;
    let hitDeferred = false;
    for (const block of spec.dashboardBlocks) {
      if (hasLinkedDb(block)) {
        hitDeferred = true;
        deferredBlocks.push(block);
      } else if (hitDeferred) {
        // Everything after the first linked_database section stays deferred
        deferredBlocks.push(block);
      } else if (block.type === "column_list" || block.type === "table") {
        hitComplex = true;
        complexBlocks.push(block);
      } else if (hitComplex) {
        complexBlocks.push(block);
      } else {
        simpleBlocks.push(block);
      }
    }

    // Create page with cover image and initial simple blocks
    const pageCreatePayload: Record<string, unknown> = {
      parent: { page_id: parentPageId },
      icon: { type: "emoji", emoji: spec.icon },
      properties: {
        title: [{ type: "text", text: { content: spec.name } }],
      },
      children: simpleBlocks.map(blockSpecToNotionBlock),
    };

    // Add cover image — use Unsplash URL directly (Notion's built-in URLs don't work as "external" type)
    // Fallback: a known-working generic Unsplash image
    const coverUrl = spec.cover || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1500&q=80";
    console.log(`[Notion Build] Using cover URL: ${coverUrl.substring(0, 80)}...`);

    pageCreatePayload.cover = {
      type: "external",
      external: { url: coverUrl },
    };

    // ── Debug: inspect callout icons in initial payload ──
    const initialChildren = pageCreatePayload.children as Record<string, unknown>[];
    for (let i = 0; i < Math.min(5, initialChildren.length); i++) {
      const child = initialChildren[i] as Record<string, unknown>;
      if (child.type === "callout") {
        const co = child.callout as Record<string, unknown>;
        console.log(`[Notion Build] simpleBlock[${i}] callout icon:`, JSON.stringify(co.icon));
      }
    }

    const mainPage = await notion.pages.create(pageCreatePayload as never);
    console.log(`[Notion Build] Page created with cover image`);

    const mainPageId = mainPage.id;
    await delay(350);

    // ── Step 1b: Append complex blocks (column_list etc) in batches ──
    if (complexBlocks.length > 0) {
      steps.push("Building dashboard layout...");
      console.log(`[Notion Build] Appending ${complexBlocks.length} complex blocks`);

      // Notion API allows max 100 blocks per append, batch them
      const batchSize = 100;
      for (let i = 0; i < complexBlocks.length; i += batchSize) {
        const batch = complexBlocks.slice(i, i + batchSize);
        const notionBatch = batch.map(blockSpecToNotionBlock);

        // ── Debug: inspect first 5 blocks for callout icon issues ──
        for (let j = 0; j < Math.min(5, notionBatch.length); j++) {
          const nb = notionBatch[j] as Record<string, unknown>;
          if (nb.type === "callout") {
            const co = nb.callout as Record<string, unknown>;
            console.log(`[Notion Build] complexBlock[${j}] callout icon:`, JSON.stringify(co.icon));
          } else if (nb.type === "column_list") {
            // Check nested callouts inside column_list
            const cl = nb.column_list as { children?: Array<{ column?: { children?: Array<Record<string, unknown>> } }> };
            for (const [ci, col] of (cl.children || []).entries()) {
              for (const [bi, block] of (col.column?.children || []).entries()) {
                if (block.type === "callout") {
                  const co = block.callout as Record<string, unknown>;
                  console.log(`[Notion Build] complexBlock[${j}].col[${ci}].block[${bi}] callout icon:`, JSON.stringify(co.icon));
                }
              }
            }
          }
        }

        await notion.blocks.children.append({
          block_id: mainPageId,
          children: notionBatch as never[],
        });
        await delay(350);
      }
    }

    // ── Step 2: Create databases ──
    // When spec.sections exists (hub-style): create section sub-pages, databases inside them
    // When spec.sections is absent (AI plans / backward compat): databases on root page

    /** Helper: create a single database as child of parentPageId */
    async function createDatabase(dbSpec: DatabaseSpec, parentPageId: string) {
      // Build properties schema (skip relations for now — added in Step 3)
      const properties: Record<string, unknown> = {};
      for (const prop of dbSpec.properties) {
        const schema = propertyToNotionSchema(prop, dbIdMap);
        if (schema) {
          properties[prop.name] = schema;
        }
      }

      console.log(`[Notion Build] DB ${dbSpec.name} — ${Object.keys(properties).length} properties (parent: ${parentPageId.slice(0, 8)}…)`);

      const db = await notionFetch(notionToken, "POST", "/databases", {
        parent: { type: "page_id", page_id: parentPageId },
        title: [{ type: "text", text: { content: dbSpec.name } }],
        icon: { type: "emoji", emoji: dbSpec.icon },
        properties,
      });

      dbIdMap[dbSpec.key] = db.id as string;
      await delay(350);

      // Set database cover image
      const dbCoverUrl = findCoverUrlForDb(dbSpec.name);
      if (dbCoverUrl) {
        try {
          await notionFetch(notionToken, "PATCH", `/databases/${db.id}`, {
            cover: { type: "external", external: { url: dbCoverUrl } },
          });
          console.log(`[Notion Build] Set cover for DB: ${dbSpec.name}`);
          await delay(200);
        } catch (err) {
          console.error(`[Notion Build] Failed to set cover for ${dbSpec.name}:`, err);
        }
      }
    }

    if (spec.sections && spec.sections.length > 0) {
      // ── Hub-style: create section sub-pages with databases inside ──
      const assignedDbKeys = new Set<string>();

      for (const section of spec.sections) {
        steps.push(`Creating ${section.icon} ${section.name} section...`);
        console.log(`[Notion Build] Creating section sub-page: ${section.icon} ${section.name}`);

        // Create the section sub-page as child of main page
        const sectionPage = await notion.pages.create({
          parent: { page_id: mainPageId },
          icon: { type: "emoji", emoji: section.icon as never },
          properties: {
            title: [{ type: "text", text: { content: `${section.icon} ${section.name}` } }],
          } as never,
        });
        const sectionPageId = sectionPage.id;
        await delay(350);

        // Set section cover if provided
        if (section.cover) {
          try {
            await notion.pages.update({
              page_id: sectionPageId,
              cover: { type: "external", external: { url: section.cover } },
            });
            await delay(200);
          } catch {
            // Non-fatal
          }
        }

        // ── Build rich section page content ──
        // Each section page is a polished workspace with workflow, stats, and interactive checklist

        const sectionDbs = section.databaseKeys
          .map(k => spec.databases.find(d => d.key === k))
          .filter(Boolean) as DatabaseSpec[];

        // Enhanced "What's Inside" with property + formula counts
        const dbDetails = sectionDbs.map(d => {
          const fCount = d.properties.filter(p => p.type === "formula").length;
          return `${d.icon} ${d.name} — ${d.properties.length} properties${fCount > 0 ? `, ${fCount} auto-formulas` : ""}, ${d.sampleData.length} entries`;
        }).join("\n");

        // Daily workflow from section tips
        const workflowSteps = (section.tips || []).slice(0, 3);
        const workflowText = workflowSteps.length > 0
          ? workflowSteps.map((t, i) => `${i + 1}. ${t}`).join("\n")
          : "1. Review your databases below\n2. Add your own entries\n3. Create your preferred views";

        // Header + description
        const sectionHeaderBlocks: BlockSpec[] = [
          { type: "heading_1", text: `${section.icon} ${section.name}` },
          createCallout(section.description, section.icon, { color: "blue_background" }),
          { type: "divider" },
        ];

        // 2-column overview: Daily Workflow + What's Inside (enhanced)
        const overviewColumns: BlockSpec[][] = [
          [createCallout(`📋 DAILY WORKFLOW\n\n${workflowText}`, "📋", { color: "gray_background", bold: true })],
          [createCallout(`📦 WHAT'S INSIDE\n\n${dbDetails}`, "📦", { color: "gray_background", bold: true })],
        ];

        sectionHeaderBlocks.push({ type: "column_list", columns: overviewColumns });

        // Append header blocks (simple first, then column_list separately)
        const simpleHeaders = sectionHeaderBlocks.filter(b => b.type !== "column_list");
        const complexHeaders = sectionHeaderBlocks.filter(b => b.type === "column_list");

        if (simpleHeaders.length > 0) {
          await notion.blocks.children.append({
            block_id: sectionPageId,
            children: simpleHeaders.map(blockSpecToNotionBlock) as never[],
          });
          await delay(350);
        }

        if (complexHeaders.length > 0) {
          await notion.blocks.children.append({
            block_id: sectionPageId,
            children: complexHeaders.map(blockSpecToNotionBlock) as never[],
          });
          await delay(350);
        }

        // Get Started checklist (immediately interactive on first open)
        await notion.blocks.children.append({
          block_id: sectionPageId,
          children: [
            blockSpecToNotionBlock(createCallout("✅ GET STARTED", "✅", { color: "green_background", bold: true })),
            blockSpecToNotionBlock({ type: "to_do", text: "Review the sample data to understand the structure", checked: false }),
            blockSpecToNotionBlock({ type: "to_do", text: "Delete sample entries and add your own data", checked: false }),
            blockSpecToNotionBlock({ type: "to_do", text: "Create your preferred database views (Table, Board, Gallery)", checked: false }),
          ] as never[],
        });
        await delay(350);

        // Create each database inside this section sub-page
        for (const dbKey of section.databaseKeys) {
          const dbSpec = spec.databases.find(d => d.key === dbKey);
          if (!dbSpec) continue;

          steps.push(`Creating ${dbSpec.name} database...`);
          console.log(`[Notion Build] Creating DB ${dbSpec.name} inside section ${section.name}`);

          // Add divider + heading before the database
          await notion.blocks.children.append({
            block_id: sectionPageId,
            children: [
              blockSpecToNotionBlock({ type: "divider" }),
              blockSpecToNotionBlock({ type: "heading_2", text: `${dbSpec.icon} ${dbSpec.name}` }),
            ] as never[],
          });
          await delay(350);

          await createDatabase(dbSpec, sectionPageId);
          assignedDbKeys.add(dbKey);
        }

        // Section footer: merged tips + view suggestions in single clean toggle
        const allSectionTips: string[] = [
          ...(section.tips || []),
          ...(section.viewSuggestions || []).map(v => `📐 ${v}`),
        ];

        if (allSectionTips.length > 0) {
          await notion.blocks.children.append({
            block_id: sectionPageId,
            children: [
              blockSpecToNotionBlock({ type: "divider" }),
              blockSpecToNotionBlock({
                type: "toggle",
                text: "💡 Pro Tips & View Ideas",
                children: allSectionTips.map(tip => ({
                  type: "bulleted_list_item" as const,
                  text: tip,
                })),
              }),
            ] as never[],
          });
          await delay(350);
        }
      }

      // Safety net: create any unassigned databases on root page
      for (const dbSpec of spec.databases) {
        if (!assignedDbKeys.has(dbSpec.key)) {
          console.log(`[Notion Build] Unassigned DB ${dbSpec.name} — creating on root page`);
          steps.push(`Creating ${dbSpec.name} database...`);
          await createDatabase(dbSpec, mainPageId);
        }
      }
    } else {
      // ── Flat mode (backward compat for AI plans): databases on root page ──
      for (const dbSpec of spec.databases) {
        steps.push(`Creating ${dbSpec.name} database...`);
        console.log(`[Notion Build] Creating section: ${dbSpec.icon} ${dbSpec.name}`);

        // Append section heading blocks before the database
        const sectionBlocks: BlockSpec[] = [
          { type: "divider" },
          { type: "heading_2", text: `${dbSpec.icon} ${dbSpec.name}` },
        ];
        await notion.blocks.children.append({
          block_id: mainPageId,
          children: sectionBlocks.map(blockSpecToNotionBlock) as never[],
        });
        await delay(350);

        await createDatabase(dbSpec, mainPageId);
      }
    }

    // ── Step 2d: Append deferred blocks (linked database views — need dbIdMap) ──
    if (deferredBlocks.length > 0) {
      steps.push("Adding live dashboard widgets...");
      console.log(`[Notion Build] Appending ${deferredBlocks.length} deferred blocks (linked DB views)`);

      /** Convert a BlockSpec to Notion block, resolving linked_database refs via dbIdMap.
       *  Notion API uses "link_to_page" with database_id to create inline linked views. */
      function resolveBlock(block: BlockSpec): Record<string, unknown> {
        if (block.type === "linked_database" && block.databaseKey) {
          const realDbId = dbIdMap[block.databaseKey];
          if (realDbId) {
            console.log(`[Notion Build] Resolving linked_database: ${block.databaseKey} → ${realDbId.slice(0, 8)}…`);
            return {
              object: "block",
              type: "link_to_page",
              link_to_page: { type: "database_id", database_id: realDbId },
            };
          }
          // Fallback if DB key not found
          console.warn(`[Notion Build] linked_database key "${block.databaseKey}" not found in dbIdMap`);
          return blockSpecToNotionBlock({ ...block, type: "paragraph", text: `📊 ${block.text || block.databaseKey}` });
        }
        // For column_list, recursively resolve nested linked_database blocks
        if (block.type === "column_list" && block.columns) {
          const columns = block.columns.map(colBlocks =>
            colBlocks.map(b => resolveBlock(b))
          );
          while (columns.length < 2) {
            columns.push([{ object: "block", type: "paragraph", paragraph: { rich_text: [] } }]);
          }
          return {
            object: "block",
            type: "column_list",
            column_list: {
              children: columns.map(colChildren => ({
                object: "block",
                type: "column",
                column: { children: colChildren },
              })),
            },
          };
        }
        return blockSpecToNotionBlock(block);
      }

      const batchSize = 100;
      for (let i = 0; i < deferredBlocks.length; i += batchSize) {
        const batch = deferredBlocks.slice(i, i + batchSize);
        const resolved = batch.map(resolveBlock);
        await notion.blocks.children.append({
          block_id: mainPageId,
          children: resolved as never[],
        });
        await delay(350);
      }
    }

    // ── Step 2e: Append footer blocks (setup guides, chart tips) ──
    if (spec.footerBlocks && spec.footerBlocks.length > 0) {
      steps.push("Adding setup guides...");
      console.log(`[Notion Build] Appending ${spec.footerBlocks.length} footer blocks`);

      const footerSimple: BlockSpec[] = [];
      const footerComplex: BlockSpec[] = [];
      for (const block of spec.footerBlocks) {
        if (block.type === "column_list" || block.type === "table") {
          footerComplex.push(block);
        } else if (footerComplex.length > 0) {
          footerComplex.push(block);
        } else {
          footerSimple.push(block);
        }
      }

      if (footerSimple.length > 0) {
        await notion.blocks.children.append({
          block_id: mainPageId,
          children: [
            blockSpecToNotionBlock({ type: "divider" }),
            ...footerSimple.map(blockSpecToNotionBlock),
          ] as never[],
        });
        await delay(350);
      }

      if (footerComplex.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < footerComplex.length; i += batchSize) {
          const batch = footerComplex.slice(i, i + batchSize);
          await notion.blocks.children.append({
            block_id: mainPageId,
            children: batch.map(blockSpecToNotionBlock) as never[],
          });
          await delay(350);
        }
      }
    }

    // ── Step 3: Add relation properties (now that all DBs exist) — raw fetch ──
    for (const dbSpec of spec.databases) {
      const relationProps = dbSpec.properties.filter(
        (p) => p.type === "relation" && p.relationDbKey
      );
      if (relationProps.length === 0) continue;

      for (const relProp of relationProps) {
        const targetDbId = dbIdMap[relProp.relationDbKey!];
        if (!targetDbId) continue;

        steps.push(`Linking ${dbSpec.name} \u2192 ${relProp.name}...`);
        console.log(
          `[Notion Build] Adding relation: ${dbSpec.name}.${relProp.name} -> ${relProp.relationDbKey}`
        );

        try {
          // Use raw fetch — SDK v5.9.0 also strips "properties" from databases.update
          await notionFetch(notionToken, "PATCH", `/databases/${dbIdMap[dbSpec.key]}`, {
            properties: {
              [relProp.name]: {
                relation: {
                  database_id: targetDbId,
                  type: "dual_property",
                  dual_property: {},
                },
              },
            },
          });
          await delay(350);
        } catch (err) {
          console.error(
            `[Notion Build] Failed to add relation ${relProp.name}:`,
            err
          );
          // Non-fatal — continue
        }
      }
    }

    // ── Step 4: Add sample data to each database ──
    for (const dbSpec of spec.databases) {
      if (!dbSpec.sampleData || dbSpec.sampleData.length === 0) continue;

      steps.push(
        `Adding sample data to ${dbSpec.name} (${dbSpec.sampleData.length} rows)...`
      );
      console.log(
        `[Notion Build] Adding ${dbSpec.sampleData.length} sample rows to ${dbSpec.name}`
      );

      for (const row of dbSpec.sampleData) {
        try {
          const properties = sampleRowToNotionProperties(
            row as Record<string, unknown>,
            dbSpec
          );

          // Extract optional page-level metadata (covers & icons for gallery-ready entries)
          const rowData = row as Record<string, unknown>;
          const cover = rowData._cover
            ? { type: "external" as const, external: { url: String(rowData._cover) } }
            : undefined;
          const icon = rowData._icon
            ? { type: "emoji" as const, emoji: String(rowData._icon) }
            : undefined;

          await notion.pages.create({
            parent: { database_id: dbIdMap[dbSpec.key] },
            properties: properties as never,
            ...(cover && { cover }),
            ...(icon && { icon }),
          });
          await delay(350);
        } catch (err) {
          console.error(
            `[Notion Build] Failed to add sample row:`,
            err
          );
          // Non-fatal — continue with next row
        }
      }
    }

    // ── Step 5: Create sub-pages (e.g. Weekly Review) ──
    if (spec.subPages && spec.subPages.length > 0) {
      for (const subPage of spec.subPages) {
        steps.push(`Creating sub-page: ${subPage.name}...`);
        console.log(`[Notion Build] Creating sub-page: ${subPage.name}`);

        try {
          // Split blocks into simple (initial) and complex (append after)
          const spSimple: BlockSpec[] = [];
          const spComplex: BlockSpec[] = [];
          for (const block of subPage.blocks) {
            if (block.type === "column_list" || block.type === "table") {
              spComplex.push(block);
            } else if (spComplex.length > 0) {
              spComplex.push(block);
            } else {
              spSimple.push(block);
            }
          }

          const spPayload: Record<string, unknown> = {
            parent: { page_id: mainPageId },
            icon: { type: "emoji", emoji: subPage.icon },
            properties: {
              title: [{ type: "text", text: { content: subPage.name } }],
            },
            children: spSimple.map(blockSpecToNotionBlock),
          };

          // Add cover image to sub-page if defined
          if (subPage.cover) {
            spPayload.cover = {
              type: "external",
              external: { url: subPage.cover },
            };
          }

          const spResult = await notion.pages.create(spPayload as never);
          await delay(350);

          // Append complex blocks if any
          if (spComplex.length > 0) {
            const batchSize = 100;
            for (let i = 0; i < spComplex.length; i += batchSize) {
              const batch = spComplex.slice(i, i + batchSize);
              await notion.blocks.children.append({
                block_id: spResult.id,
                children: batch.map(blockSpecToNotionBlock) as never[],
              });
              await delay(350);
            }
          }
        } catch (err) {
          console.error(`[Notion Build] Failed to create sub-page ${subPage.name}:`, err);
          // Non-fatal — continue
        }
      }
    }

    steps.push("\u2728 Premium upgrades applied");

    // ── Done! ──
    steps.push("Template created successfully!");
    console.log(`[Notion Build] Done! Page ID: ${mainPageId}`);

    // Build Notion URL
    const pageUrl = `https://notion.so/${mainPageId.replace(/-/g, "")}`;

    // ── Phase 8: Premium Validation ──
    const blueprint = opportunityPlan?.layoutBlueprint as LayoutBlueprint | undefined;
    const planViews = (opportunityPlan?.views || []) as Array<{ type?: string }>;
    const validation = validatePremiumOutput(spec, blueprint, planViews);
    if (validation.failures.length > 0) {
      console.log(`[Notion Build] Validation failures: ${validation.failures.join(', ')}`);
    }
    console.log(`[Notion Build] Premium score: ${validation.score}/100`);

    // ── Phase 8b: OS_ULTRA Checklist (if tier detected) ──
    const isOsUltra = opportunityPlan?.styleBlueprint?.osUltra?.osStyle === true
      || (opportunityPlan?.styleBlueprint as Record<string, unknown>)?.premiumTier === "os_ultra";
    const premiumChecklist = isOsUltra
      ? evaluateOsChecklist(spec, blueprint, opportunityPlan as Record<string, unknown>)
      : undefined;
    if (premiumChecklist) {
      console.log(`[Notion Build] OS_ULTRA checklist: ${premiumChecklist.score}% (${premiumChecklist.results.filter(r => r.passed).length}/${premiumChecklist.total})`);
    }

    // ── Phase 8c: Quality Score System ──
    const qualityScore = computeQualityScore(spec, blueprint, planViews, opportunityPlan as Record<string, unknown> | undefined);
    console.log(`[Notion Build] Quality: ${qualityScore.tierEmoji} ${qualityScore.tier} (${qualityScore.overall}/100) — Est. $${qualityScore.etsyPriceEstimate.min}-$${qualityScore.etsyPriceEstimate.max}`);

    return NextResponse.json({
      success: true,
      pageId: mainPageId,
      pageUrl,
      steps,
      databases: Object.entries(dbIdMap).map(([key, id]) => ({ key, id })),
      promptOnlySteps,
      validation,
      premiumChecklist,
      qualityScore,
      premiumUpgradesApplied: true,
    });
  } catch (err: unknown) {
    console.error("[Notion Build] Error:", err);

    const errMsg =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null
        ? JSON.stringify(err)
        : String(err);

    // Check for common Notion API errors
    if (errMsg.includes("Could not find page") || errMsg.includes("object_not_found")) {
      return NextResponse.json(
        {
          error:
            "Page not found. Make sure you shared the parent page with your Notion integration.",
        },
        { status: 404 }
      );
    }

    if (errMsg.includes("unauthorized") || errMsg.includes("Invalid token")) {
      return NextResponse.json(
        { error: "Invalid Notion token. Check your integration token." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: `Build failed: ${errMsg}` },
      { status: 500 }
    );
  }
}
