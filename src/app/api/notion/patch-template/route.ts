import { NextRequest } from "next/server";

// ── Rate limit helper ──
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Raw Notion API helper ──
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

// ── Types ──
interface AuditPage {
  id: string;
  title: string;
  type: "page" | "child_database";
  hasContent: boolean;
}

interface AuditResult {
  pages: AuditPage[];
  databases: AuditPage[];
  blocks: Array<{ id: string; type: string; text?: string }>;
}

// ── Cover URL mapping ──
const COVER_MAP: Record<string, string> = {
  "360": "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1500",
  "life planner": "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1500",
  "task": "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=1500",
  "goal": "https://images.unsplash.com/photo-1434494878577-86c23bcb06b9?w=1500",
  "habit": "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1500",
  "journal": "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=1500",
  "reading": "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=1500",
  "note": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1500",
  "idea": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1500",
  "finance": "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1500",
  "fitness": "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1500",
  "workout": "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1500",
  "travel": "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1500",
  "start here": "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=1500",
  "stats": "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1500",
  "kpi": "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1500",
};

function findCoverUrl(title: string): string | null {
  const lower = title.toLowerCase();
  for (const [key, url] of Object.entries(COVER_MAP)) {
    if (lower.includes(key)) return url;
  }
  return "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1500";
}

// ── KPI value fixes ──
const KPI_FIXES: Record<string, string> = {
  "habit streak": "\u{1F525} 30d",
  "books read": "6 / 12",
  "journal streak": "\u{1F4DD} 9d",
  "goals active": "\u2705 6 Active",
  "meditation": "\u{1F525} 30d",
};

// ══════════════════════════════════════════════════════════
// Step 1: AUDIT — recursively discover all children
// ══════════════════════════════════════════════════════════
async function auditTemplate(
  token: string,
  rootPageId: string
): Promise<AuditResult> {
  const pages: AuditPage[] = [];
  const databases: AuditPage[] = [];
  const blocks: Array<{ id: string; type: string; text?: string }> = [];

  // Fetch all children of root page
  let startCursor: string | undefined;
  do {
    const params = startCursor ? `?start_cursor=${startCursor}` : "";
    const resp = await notionFetch(token, "GET", `/blocks/${rootPageId}/children${params}`);
    const results = resp.results as Array<Record<string, unknown>>;

    for (const block of results) {
      const blockType = block.type as string;
      const blockId = block.id as string;

      if (blockType === "child_page") {
        const cp = block.child_page as Record<string, unknown>;
        const title = cp.title as string;
        pages.push({ id: blockId, title, type: "page", hasContent: true });
      } else if (blockType === "child_database") {
        const cd = block.child_database as Record<string, unknown>;
        const title = cd.title as string;
        databases.push({ id: blockId, title, type: "child_database", hasContent: true });
      } else {
        // Extract text from block for watermark detection
        let text: string | undefined;
        const blockContent = block[blockType] as Record<string, unknown> | undefined;
        if (blockContent?.rich_text) {
          const richTexts = blockContent.rich_text as Array<{ plain_text?: string }>;
          text = richTexts.map((rt) => rt.plain_text || "").join("");
        }
        blocks.push({ id: blockId, type: blockType, text });
      }
    }

    startCursor = resp.has_more ? (resp.next_cursor as string) : undefined;
    await delay(350);
  } while (startCursor);

  return { pages, databases, blocks };
}

// ══════════════════════════════════════════════════════════
// Step 2: COVER IMAGES — patch every page and database
// ══════════════════════════════════════════════════════════
async function patchCovers(
  token: string,
  rootPageId: string,
  audit: AuditResult,
  log: string[]
) {
  // Patch main page cover + icon
  await notionFetch(token, "PATCH", `/pages/${rootPageId}`, {
    cover: {
      type: "external",
      external: { url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1500" },
    },
    icon: { type: "emoji", emoji: "\u{1F31F}" },
  });
  log.push("\u2705 Main page: cover + icon \u{1F31F} set");
  await delay(350);

  // Patch child pages
  for (const page of audit.pages) {
    const coverUrl = findCoverUrl(page.title);
    if (coverUrl) {
      try {
        await notionFetch(token, "PATCH", `/pages/${page.id}`, {
          cover: { type: "external", external: { url: coverUrl } },
        });
        log.push(`\u2705 Cover set: ${page.title}`);
      } catch (e) {
        log.push(`\u26A0\uFE0F Cover failed for ${page.title}: ${e instanceof Error ? e.message : String(e)}`);
      }
      await delay(350);
    }
  }

  // Patch databases (they can also have covers)
  for (const db of audit.databases) {
    const coverUrl = findCoverUrl(db.title);
    if (coverUrl) {
      try {
        await notionFetch(token, "PATCH", `/databases/${db.id}`, {
          cover: { type: "external", external: { url: coverUrl } },
        });
        log.push(`\u2705 DB cover set: ${db.title}`);
      } catch {
        // Some DBs might not support cover, ignore
      }
      await delay(350);
    }
  }
}

// ══════════════════════════════════════════════════════════
// Step 3: REMOVE DUPLICATES
// ══════════════════════════════════════════════════════════
async function removeDuplicates(
  token: string,
  audit: AuditResult,
  log: string[]
) {
  // Group databases by title
  const byTitle: Record<string, AuditPage[]> = {};
  for (const db of audit.databases) {
    const key = db.title.toLowerCase().trim();
    if (!byTitle[key]) byTitle[key] = [];
    byTitle[key].push(db);
  }

  for (const [title, dbs] of Object.entries(byTitle)) {
    if (dbs.length <= 1) continue;

    log.push(`\u{1F50D} Found ${dbs.length} databases named "${title}"`);

    // Query each to find which has more rows
    const counts: Array<{ db: AuditPage; count: number }> = [];
    for (const db of dbs) {
      try {
        const resp = await notionFetch(token, "POST", `/databases/${db.id}/query`, {
          page_size: 1,
        });
        const results = resp.results as unknown[];
        // Use has_more to distinguish 0 vs 1+ rows
        counts.push({ db, count: results.length + (resp.has_more ? 100 : 0) });
      } catch {
        counts.push({ db, count: -1 });
      }
      await delay(350);
    }

    // Sort: keep the one with most rows, delete the rest
    counts.sort((a, b) => b.count - a.count);
    const keep = counts[0];
    log.push(`  Keeping: ${keep.db.id} (${keep.count} rows)`);

    for (let i = 1; i < counts.length; i++) {
      const toDelete = counts[i];
      try {
        await notionFetch(token, "DELETE", `/blocks/${toDelete.db.id}`);
        log.push(`  \u{1F5D1}\uFE0F Deleted duplicate: ${toDelete.db.id} (${toDelete.count} rows)`);
      } catch (e) {
        log.push(`  \u26A0\uFE0F Failed to delete ${toDelete.db.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
      await delay(350);
    }
  }

  // Also check pages for duplicates
  const pagesByTitle: Record<string, AuditPage[]> = {};
  for (const p of audit.pages) {
    const key = p.title.toLowerCase().trim();
    if (!pagesByTitle[key]) pagesByTitle[key] = [];
    pagesByTitle[key].push(p);
  }

  for (const [title, pgs] of Object.entries(pagesByTitle)) {
    if (pgs.length <= 1) continue;
    log.push(`\u{1F50D} Found ${pgs.length} pages named "${title}"`);

    // Keep first, delete rest
    for (let i = 1; i < pgs.length; i++) {
      try {
        await notionFetch(token, "DELETE", `/blocks/${pgs[i].id}`);
        log.push(`  \u{1F5D1}\uFE0F Deleted duplicate page: ${title} (${pgs[i].id})`);
      } catch (e) {
        log.push(`  \u26A0\uFE0F Failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      await delay(350);
    }
  }
}

// ══════════════════════════════════════════════════════════
// Step 4: FIX KPI TEXT OVERFLOW
// ══════════════════════════════════════════════════════════
async function fixKpiOverflow(
  token: string,
  audit: AuditResult,
  log: string[]
) {
  // Find Stats/KPI database
  const kpiDb = audit.databases.find(
    (db) =>
      db.title.toLowerCase().includes("stat") ||
      db.title.toLowerCase().includes("kpi")
  );
  if (!kpiDb) {
    log.push("\u26A0\uFE0F No Stats/KPI database found, skipping KPI fix");
    return;
  }

  // Query all rows
  const resp = await notionFetch(token, "POST", `/databases/${kpiDb.id}/query`, {});
  const rows = resp.results as Array<Record<string, unknown>>;
  await delay(350);

  for (const row of rows) {
    const props = row.properties as Record<string, Record<string, unknown>>;
    // Find the title property
    let titlePropName = "";
    let titleValue = "";
    for (const [name, prop] of Object.entries(props)) {
      if (prop.type === "title") {
        titlePropName = name;
        const titleArr = prop.title as Array<{ plain_text: string }>;
        titleValue = titleArr.map((t) => t.plain_text).join("");
        break;
      }
    }

    // Find value property (rich_text or number)
    let valuePropName = "";
    let currentValue = "";
    for (const [name, prop] of Object.entries(props)) {
      if (name.toLowerCase() === "value" || name.toLowerCase() === "metric") {
        valuePropName = name;
        if (prop.type === "rich_text") {
          const rt = prop.rich_text as Array<{ plain_text: string }>;
          currentValue = rt.map((t) => t.plain_text).join("");
        } else if (prop.type === "number") {
          currentValue = String(prop.number);
        }
        break;
      }
    }

    // Check if we have a fix for this KPI
    const titleLower = titleValue.toLowerCase();
    let newValue: string | null = null;
    for (const [key, fix] of Object.entries(KPI_FIXES)) {
      if (titleLower.includes(key)) {
        newValue = fix;
        break;
      }
    }

    if (newValue && valuePropName && newValue !== currentValue) {
      try {
        await notionFetch(token, "PATCH", `/pages/${row.id as string}`, {
          properties: {
            [valuePropName]: {
              rich_text: [{ type: "text", text: { content: newValue } }],
            },
          },
        });
        log.push(`\u2705 KPI fixed: "${titleValue}" \u2192 "${newValue}"`);
      } catch (e) {
        log.push(`\u26A0\uFE0F KPI fix failed for ${titleValue}: ${e instanceof Error ? e.message : String(e)}`);
      }
      await delay(350);
    }
  }
}

// ══════════════════════════════════════════════════════════
// Step 5: REMOVE WATERMARK
// ══════════════════════════════════════════════════════════
async function removeWatermark(
  token: string,
  audit: AuditResult,
  log: string[]
) {
  for (const block of audit.blocks) {
    if (
      block.text &&
      (block.text.toLowerCase().includes("made with craftplan") ||
        block.text.toLowerCase().includes("craftplan digital") ||
        block.text.toLowerCase().includes("built with craftplan"))
    ) {
      try {
        await notionFetch(token, "DELETE", `/blocks/${block.id}`);
        log.push(`\u{1F5D1}\uFE0F Removed watermark: "${block.text}"`);
      } catch (e) {
        log.push(`\u26A0\uFE0F Failed to remove watermark: ${e instanceof Error ? e.message : String(e)}`);
      }
      await delay(350);
    }
  }
}

// ══════════════════════════════════════════════════════════
// Step 6: POPULATE START HERE PAGE
// ══════════════════════════════════════════════════════════
async function populateStartHere(
  token: string,
  audit: AuditResult,
  log: string[]
) {
  const startPage = audit.pages.find(
    (p) => p.title.toLowerCase().includes("start here")
  );
  if (!startPage) {
    log.push("\u26A0\uFE0F No 'Start Here' page found, skipping");
    return;
  }

  // Set cover
  await notionFetch(token, "PATCH", `/pages/${startPage.id}`, {
    cover: {
      type: "external",
      external: { url: "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=1500" },
    },
  });
  await delay(350);

  // Build blocks
  const blocks: Record<string, unknown>[] = [
    // Heading
    {
      object: "block",
      type: "heading_1",
      heading_1: {
        rich_text: [{ type: "text", text: { content: "Welcome to your 360\u00B0 Life Planner \u{1F31F}" } }],
        color: "default",
      },
    },
    // Quote
    {
      object: "block",
      type: "quote",
      quote: {
        rich_text: [
          {
            type: "text",
            text: { content: "You didn\u2019t buy a template. You bought a system for living intentionally." },
            annotations: { italic: true, bold: false, strikethrough: false, underline: false, code: false, color: "default" },
          },
        ],
        color: "default",
      },
    },
    // Success callout
    {
      object: "block",
      type: "callout",
      callout: {
        rich_text: [{ type: "text", text: { content: "You\u2019re 4 steps away from being fully set up." } }],
        icon: { type: "emoji", emoji: "\u2705" },
        color: "green_background",
      },
    },
    // Step 1 toggle
    {
      object: "block",
      type: "toggle",
      toggle: {
        rich_text: [
          { type: "text", text: { content: "\u25B6 Step 1: Make it yours" }, annotations: { bold: true, italic: false, strikethrough: false, underline: false, code: false, color: "default" } },
        ],
        children: [
          { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: "Change your name in the Dashboard title" } }] } },
          { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: "Delete sample data you don\u2019t need" } }] } },
          { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: "Add your real goals to the Goals database" } }] } },
        ],
      },
    },
    // Step 2 toggle
    {
      object: "block",
      type: "toggle",
      toggle: {
        rich_text: [
          { type: "text", text: { content: "\u25B6 Step 2: Set up your habits" }, annotations: { bold: true, italic: false, strikethrough: false, underline: false, code: false, color: "default" } },
        ],
        children: [
          { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: "Delete the sample habits" } }] } },
          { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: "Add YOUR habits (start with just 3)" } }] } },
          { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: "Check \u201CToday\u201D each evening when complete" } }] } },
        ],
      },
    },
    // Step 3 toggle
    {
      object: "block",
      type: "toggle",
      toggle: {
        rich_text: [
          { type: "text", text: { content: "\u25B6 Step 3: Add your first journal entry" }, annotations: { bold: true, italic: false, strikethrough: false, underline: false, code: false, color: "default" } },
        ],
        children: [
          { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: "Click Journal in the sidebar" } }] } },
          { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: "Hit \u201CNew\u201D and write today\u2019s reflection" } }] } },
          { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: "Use the Mood selector to track how you feel" } }] } },
        ],
      },
    },
    // Step 4 toggle
    {
      object: "block",
      type: "toggle",
      toggle: {
        rich_text: [
          { type: "text", text: { content: "\u25B6 Step 4: Connect your goals to tasks" }, annotations: { bold: true, italic: false, strikethrough: false, underline: false, code: false, color: "default" } },
        ],
        children: [
          { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: "Open any Goal" } }] } },
          { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: "In \u201CRelated Tasks\u201D add tasks that move that goal forward" } }] } },
          { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: "Watch your Progress % update automatically" } }] } },
        ],
      },
    },
    // Divider
    { object: "block", type: "divider", divider: {} },
    // Pro Tips callout
    {
      object: "block",
      type: "callout",
      callout: {
        rich_text: [{ type: "text", text: { content: "Pro Tips" } }],
        icon: { type: "emoji", emoji: "\u{1F4A1}" },
        color: "yellow_background",
        children: [
          {
            object: "block", type: "toggle", toggle: {
              rich_text: [{ type: "text", text: { content: "\u{1F4A1} Use the Dashboard KPIs to stay motivated" } }],
              children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: "The KPI cards at the top of your dashboard update based on your actual data. Check them daily for a quick pulse on your progress." } }] } }],
            },
          },
          {
            object: "block", type: "toggle", toggle: {
              rich_text: [{ type: "text", text: { content: "\u{1F4A1} The Urgency Score auto-calculates based on due date" } }],
              children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: "Tasks with closer due dates get higher urgency scores. Use this to prioritize what to work on next." } }] } }],
            },
          },
          {
            object: "block", type: "toggle", toggle: {
              rich_text: [{ type: "text", text: { content: "\u{1F4A1} Streak Bar resets if you miss a day \u2014 consistency wins" } }],
              children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: "Your habit streak counts consecutive days. Missing a day resets it. Start small and build up." } }] } }],
            },
          },
          {
            object: "block", type: "toggle", toggle: {
              rich_text: [{ type: "text", text: { content: "\u{1F4A1} Link every Task to a Goal for automatic progress tracking" } }],
              children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: "When tasks are linked to goals, completing tasks automatically increases your goal progress percentage." } }] } }],
            },
          },
          {
            object: "block", type: "toggle", toggle: {
              rich_text: [{ type: "text", text: { content: "\u{1F4A1} Journal daily \u2014 Reflection Depth formula rewards longer entries" } }],
              children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: "The more you write, the higher your Reflection Depth score. Aim for at least 3 sentences per entry." } }] } }],
            },
          },
        ],
      },
    },
    // Divider
    { object: "block", type: "divider", divider: {} },
    // FAQ heading
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "\u2753 FAQ" } }],
        color: "default",
      },
    },
    // FAQ toggles
    {
      object: "block", type: "toggle", toggle: {
        rich_text: [{ type: "text", text: { content: "How do I duplicate this template?" }, annotations: { bold: true, italic: false, strikethrough: false, underline: false, code: false, color: "default" } }],
        children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: "Click \u2022\u2022\u2022 in the top right \u2192 Duplicate. Then move to your workspace." } }] } }],
      },
    },
    {
      object: "block", type: "toggle", toggle: {
        rich_text: [{ type: "text", text: { content: "Can I add more databases?" }, annotations: { bold: true, italic: false, strikethrough: false, underline: false, code: false, color: "default" } }],
        children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: "Yes! Hit New Page inside 360\u00B0 Life Planner and create any database you need." } }] } }],
      },
    },
    {
      object: "block", type: "toggle", toggle: {
        rich_text: [{ type: "text", text: { content: "Why is my Progress % not updating?" }, annotations: { bold: true, italic: false, strikethrough: false, underline: false, code: false, color: "default" } }],
        children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: "Make sure your Tasks are linked to a Goal via the Goal relation field. The Progress formula counts completed linked tasks." } }] } }],
      },
    },
  ];

  // Append blocks in batches of 100
  for (let i = 0; i < blocks.length; i += 100) {
    const batch = blocks.slice(i, i + 100);
    await notionFetch(token, "PATCH", `/blocks/${startPage.id}/children`, {
      children: batch,
    });
    await delay(500);
  }

  log.push(`\u2705 Start Here page populated with ${blocks.length} blocks`);
}

// ══════════════════════════════════════════════════════════
// Step 7: CREATE MISSING DATABASES (Finance, Fitness, Travel)
// ══════════════════════════════════════════════════════════
async function createMissingDatabases(
  token: string,
  rootPageId: string,
  audit: AuditResult,
  log: string[]
): Promise<Record<string, string>> {
  const newDbIds: Record<string, string> = {};
  const existingNames = new Set(audit.databases.map((d) => d.title.toLowerCase()));

  // ── FINANCE DATABASE ──
  if (!existingNames.has("finance") && !existingNames.has("finances") && !existingNames.has("budget")) {
    const financeDb = await notionFetch(token, "POST", "/databases", {
      parent: { type: "page_id", page_id: rootPageId },
      icon: { type: "emoji", emoji: "\u{1F4B0}" },
      cover: {
        type: "external",
        external: { url: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1500" },
      },
      title: [{ type: "text", text: { content: "Finance" } }],
      properties: {
        "Transaction": { title: {} },
        "Amount": { number: { format: "dollar" } },
        "Type": {
          select: {
            options: [
              { name: "Income", color: "green" },
              { name: "Expense", color: "red" },
              { name: "Saving", color: "blue" },
              { name: "Investment", color: "purple" },
            ],
          },
        },
        "Category": {
          select: {
            options: [
              { name: "Housing", color: "brown" },
              { name: "Food", color: "orange" },
              { name: "Transport", color: "yellow" },
              { name: "Health", color: "green" },
              { name: "Entertainment", color: "pink" },
              { name: "Work", color: "blue" },
              { name: "Personal", color: "purple" },
              { name: "Subscription", color: "gray" },
              { name: "Saving", color: "default" },
            ],
          },
        },
        "Date": { date: {} },
        "Month": {
          formula: { expression: 'formatDate(prop("Date"), "MMMM YYYY")' },
        },
        "Budget Health": {
          formula: {
            expression:
              'if(prop("Type") == "Expense" and prop("Amount") > 500, "\u{1F534} Large", if(prop("Type") == "Expense" and prop("Amount") > 200, "\u{1F7E1} Medium", if(prop("Type") == "Expense", "\u{1F7E2} Small", "\u2705 Income")))',
          },
        },
        "Notes": { rich_text: {} },
      },
    });
    newDbIds.finance = financeDb.id as string;
    log.push("\u2705 Created Finance database");
    await delay(500);

    // Add sample data
    const financeRows = [
      { Transaction: "Rent payment", Amount: 1200, Type: "Expense", Category: "Housing", Date: "2026-03-01", Notes: "Monthly rent" },
      { Transaction: "Salary deposit", Amount: 4500, Type: "Income", Category: "Work", Date: "2026-03-01", Notes: "Monthly salary" },
      { Transaction: "Grocery run", Amount: 127, Type: "Expense", Category: "Food", Date: "2026-03-03", Notes: "Weekly groceries" },
      { Transaction: "Spotify + Netflix", Amount: 28, Type: "Expense", Category: "Subscription", Date: "2026-03-05", Notes: "Monthly subscriptions" },
      { Transaction: "Gym membership", Amount: 45, Type: "Expense", Category: "Health", Date: "2026-03-05", Notes: "Monthly gym fee" },
      { Transaction: "Coffee & lunch out", Amount: 67, Type: "Expense", Category: "Food", Date: "2026-03-07", Notes: "Friday treat" },
      { Transaction: "Freelance project", Amount: 800, Type: "Income", Category: "Work", Date: "2026-03-10", Notes: "Logo design project" },
      { Transaction: "New running shoes", Amount: 120, Type: "Expense", Category: "Personal", Date: "2026-03-12", Notes: "Nike Pegasus 41" },
      { Transaction: "Electric bill", Amount: 89, Type: "Expense", Category: "Housing", Date: "2026-03-15", Notes: "Monthly electric" },
      { Transaction: "Emergency fund transfer", Amount: 300, Type: "Saving", Category: "Saving", Date: "2026-03-20", Notes: "Monthly savings transfer" },
    ];

    for (const row of financeRows) {
      await notionFetch(token, "POST", "/pages", {
        parent: { database_id: newDbIds.finance },
        properties: {
          "Transaction": { title: [{ type: "text", text: { content: row.Transaction } }] },
          "Amount": { number: row.Amount },
          "Type": { select: { name: row.Type } },
          "Category": { select: { name: row.Category } },
          "Date": { date: { start: row.Date } },
          "Notes": { rich_text: [{ type: "text", text: { content: row.Notes } }] },
        },
      });
      await delay(350);
    }
    log.push(`\u2705 Finance: ${financeRows.length} sample rows added`);
  } else {
    log.push("\u2139\uFE0F Finance database already exists, skipping");
  }

  // ── FITNESS DATABASE ──
  if (!existingNames.has("fitness") && !existingNames.has("workouts") && !existingNames.has("workout")) {
    const fitnessDb = await notionFetch(token, "POST", "/databases", {
      parent: { type: "page_id", page_id: rootPageId },
      icon: { type: "emoji", emoji: "\u{1F3CB}\uFE0F" },
      cover: {
        type: "external",
        external: { url: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1500" },
      },
      title: [{ type: "text", text: { content: "Fitness" } }],
      properties: {
        "Workout": { title: {} },
        "Type": {
          select: {
            options: [
              { name: "Strength", color: "red" },
              { name: "Cardio", color: "orange" },
              { name: "Yoga", color: "green" },
              { name: "HIIT", color: "yellow" },
              { name: "Walk", color: "blue" },
              { name: "Run", color: "purple" },
              { name: "Swim", color: "default" },
            ],
          },
        },
        "Duration (min)": { number: { format: "number" } },
        "Date": { date: {} },
        "Intensity": {
          select: {
            options: [
              { name: "\u{1F7E2} Easy", color: "green" },
              { name: "\u{1F7E1} Moderate", color: "yellow" },
              { name: "\u{1F534} Hard", color: "red" },
            ],
          },
        },
        "Calories Burned": { number: { format: "number" } },
        "Notes": { rich_text: {} },
        "Personal Best": { checkbox: {} },
      },
    });
    newDbIds.fitness = fitnessDb.id as string;
    log.push("\u2705 Created Fitness database");
    await delay(500);

    const fitnessRows = [
      { Workout: "Morning Run 5K", Type: "Run", Duration: 32, Date: "2026-03-01", Intensity: "\u{1F534} Hard", Calories: 320, Notes: "New PB!", PB: true },
      { Workout: "Full Body Strength", Type: "Strength", Duration: 45, Date: "2026-03-03", Intensity: "\u{1F7E1} Moderate", Calories: 280, Notes: "Chest and back focus", PB: false },
      { Workout: "Yoga Flow", Type: "Yoga", Duration: 30, Date: "2026-03-05", Intensity: "\u{1F7E2} Easy", Calories: 120, Notes: "Recovery session", PB: false },
      { Workout: "HIIT Circuit", Type: "HIIT", Duration: 25, Date: "2026-03-07", Intensity: "\u{1F534} Hard", Calories: 350, Notes: "Tabata style", PB: false },
      { Workout: "Evening Walk", Type: "Walk", Duration: 45, Date: "2026-03-08", Intensity: "\u{1F7E2} Easy", Calories: 180, Notes: "Post-dinner walk", PB: false },
      { Workout: "Upper Body Push", Type: "Strength", Duration: 40, Date: "2026-03-10", Intensity: "\u{1F7E1} Moderate", Calories: 240, Notes: "Bench + overhead press", PB: false },
      { Workout: "5K Race Day", Type: "Run", Duration: 28, Date: "2026-03-12", Intensity: "\u{1F534} Hard", Calories: 340, Notes: "New PB! 28:03", PB: true },
      { Workout: "Recovery Yoga", Type: "Yoga", Duration: 20, Date: "2026-03-14", Intensity: "\u{1F7E2} Easy", Calories: 80, Notes: "Stretching focus", PB: false },
    ];

    for (const row of fitnessRows) {
      await notionFetch(token, "POST", "/pages", {
        parent: { database_id: newDbIds.fitness },
        properties: {
          "Workout": { title: [{ type: "text", text: { content: row.Workout } }] },
          "Type": { select: { name: row.Type } },
          "Duration (min)": { number: row.Duration },
          "Date": { date: { start: row.Date } },
          "Intensity": { select: { name: row.Intensity } },
          "Calories Burned": { number: row.Calories },
          "Notes": { rich_text: [{ type: "text", text: { content: row.Notes } }] },
          "Personal Best": { checkbox: row.PB },
        },
      });
      await delay(350);
    }
    log.push(`\u2705 Fitness: ${fitnessRows.length} sample rows added`);
  } else {
    log.push("\u2139\uFE0F Fitness database already exists, skipping");
  }

  // ── TRAVEL DATABASE ──
  if (!existingNames.has("travel") && !existingNames.has("trips")) {
    const travelDb = await notionFetch(token, "POST", "/databases", {
      parent: { type: "page_id", page_id: rootPageId },
      icon: { type: "emoji", emoji: "\u2708\uFE0F" },
      cover: {
        type: "external",
        external: { url: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1500" },
      },
      title: [{ type: "text", text: { content: "Travel" } }],
      properties: {
        "Trip": { title: {} },
        "Destination": { rich_text: {} },
        "Status": {
          select: {
            options: [
              { name: "Planning", color: "yellow" },
              { name: "Booked", color: "blue" },
              { name: "Upcoming", color: "green" },
              { name: "Completed", color: "gray" },
              { name: "Dreaming", color: "pink" },
            ],
          },
        },
        "Start Date": { date: {} },
        "End Date": { date: {} },
        "Budget": { number: { format: "dollar" } },
        "Spent": { number: { format: "dollar" } },
        "Budget Left": {
          formula: { expression: 'prop("Budget") - prop("Spent")' },
        },
        "Travel Style": {
          select: {
            options: [
              { name: "Adventure", color: "orange" },
              { name: "Relaxation", color: "blue" },
              { name: "Culture", color: "purple" },
              { name: "Business", color: "gray" },
              { name: "Road Trip", color: "green" },
            ],
          },
        },
        "Notes": { rich_text: {} },
      },
    });
    newDbIds.travel = travelDb.id as string;
    log.push("\u2705 Created Travel database");
    await delay(500);

    const travelRows = [
      { Trip: "Tokyo & Kyoto Spring", Destination: "Japan", Status: "Upcoming", StartDate: "2026-06-15", EndDate: "2026-07-01", Budget: 3500, Spent: 890, Style: "Culture", Notes: "Cherry blossom season, JR pass booked" },
      { Trip: "Amsterdam Weekend", Destination: "Netherlands", Status: "Booked", StartDate: "2026-04-18", EndDate: "2026-04-21", Budget: 800, Spent: 320, Style: "Culture", Notes: "Flights + hotel confirmed" },
      { Trip: "Morocco Road Trip", Destination: "Morocco", Status: "Planning", StartDate: "2026-08-01", EndDate: null, Budget: 2000, Spent: 0, Style: "Adventure", Notes: "Need to research routes" },
      { Trip: "Local Camping Trip", Destination: "Oregon", Status: "Completed", StartDate: "2026-02-14", EndDate: "2026-02-16", Budget: 200, Spent: 175, Style: "Adventure", Notes: "Great weekend, campsite was amazing" },
      { Trip: "Bali Retreat", Destination: "Indonesia", Status: "Dreaming", StartDate: null, EndDate: null, Budget: 4000, Spent: 0, Style: "Relaxation", Notes: "Someday... yoga retreat" },
    ];

    for (const row of travelRows) {
      const props: Record<string, unknown> = {
        "Trip": { title: [{ type: "text", text: { content: row.Trip } }] },
        "Destination": { rich_text: [{ type: "text", text: { content: row.Destination } }] },
        "Status": { select: { name: row.Status } },
        "Budget": { number: row.Budget },
        "Spent": { number: row.Spent },
        "Travel Style": { select: { name: row.Style } },
        "Notes": { rich_text: [{ type: "text", text: { content: row.Notes } }] },
      };
      if (row.StartDate) {
        props["Start Date"] = { date: { start: row.StartDate } };
      }
      if (row.EndDate) {
        props["End Date"] = { date: { start: row.EndDate } };
      }

      await notionFetch(token, "POST", "/pages", {
        parent: { database_id: newDbIds.travel },
        properties: props,
      });
      await delay(350);
    }
    log.push(`\u2705 Travel: ${travelRows.length} sample rows added`);
  } else {
    log.push("\u2139\uFE0F Travel database already exists, skipping");
  }

  return newDbIds;
}

// ══════════════════════════════════════════════════════════
// Step 8: ENRICH EXISTING DATA (Reading List, Notes)
// ══════════════════════════════════════════════════════════
async function enrichExistingData(
  token: string,
  audit: AuditResult,
  log: string[]
) {
  // ── Reading List: Add Pages/Pages Read properties + update rows ──
  const readingDb = audit.databases.find(
    (db) => db.title.toLowerCase().includes("reading")
  );
  if (readingDb) {
    // Add new properties
    try {
      await notionFetch(token, "PATCH", `/databases/${readingDb.id}`, {
        properties: {
          "Pages": { number: { format: "number" } },
          "Pages Read": { number: { format: "number" } },
          "Reading Progress": {
            formula: {
              expression:
                'if(prop("Pages") > 0, format(round(prop("Pages Read") / prop("Pages") * 100)) + "%", "\u2014")',
            },
          },
        },
      });
      log.push("\u2705 Reading List: Added Pages, Pages Read, Reading Progress properties");
      await delay(500);
    } catch (e) {
      log.push(`\u26A0\uFE0F Reading List property update failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Query rows and update
    const readingResp = await notionFetch(token, "POST", `/databases/${readingDb.id}/query`, {});
    const readingRows = readingResp.results as Array<Record<string, unknown>>;
    await delay(350);

    const readingUpdates: Record<string, { pages: number; pagesRead: number }> = {
      "project hail mary": { pages: 476, pagesRead: 476 },
      "think again": { pages: 307, pagesRead: 150 },
      "the body keeps the score": { pages: 464, pagesRead: 89 },
      "deep work": { pages: 296, pagesRead: 296 },
      "dune": { pages: 688, pagesRead: 0 },
      "atomic habits": { pages: 320, pagesRead: 320 },
    };

    for (const row of readingRows) {
      const props = row.properties as Record<string, Record<string, unknown>>;
      let titleVal = "";
      for (const prop of Object.values(props)) {
        if (prop.type === "title") {
          const titles = prop.title as Array<{ plain_text: string }>;
          titleVal = titles.map((t) => t.plain_text).join("").toLowerCase();
          break;
        }
      }

      const update = Object.entries(readingUpdates).find(([key]) =>
        titleVal.includes(key)
      );
      if (update) {
        const [, data] = update;
        try {
          await notionFetch(token, "PATCH", `/pages/${row.id as string}`, {
            properties: {
              "Pages": { number: data.pages },
              "Pages Read": { number: data.pagesRead },
            },
          });
          log.push(`\u2705 Reading: Updated "${titleVal}" \u2192 ${data.pagesRead}/${data.pages} pages`);
        } catch (e) {
          log.push(`\u26A0\uFE0F Reading update failed for "${titleVal}": ${e instanceof Error ? e.message : String(e)}`);
        }
        await delay(350);
      }
    }
  }

  // ── Notes & Ideas: Update tags ──
  const notesDb = audit.databases.find(
    (db) =>
      db.title.toLowerCase().includes("note") ||
      db.title.toLowerCase().includes("idea")
  );
  if (notesDb) {
    // Ensure Tags property exists as multi_select
    try {
      await notionFetch(token, "PATCH", `/databases/${notesDb.id}`, {
        properties: {
          "Tags": {
            multi_select: {
              options: [
                { name: "business", color: "blue" },
                { name: "side-hustle", color: "green" },
                { name: "online", color: "purple" },
                { name: "family", color: "pink" },
                { name: "personal", color: "orange" },
                { name: "shopping", color: "yellow" },
                { name: "learning", color: "default" },
                { name: "productivity", color: "gray" },
                { name: "research", color: "brown" },
                { name: "books", color: "blue" },
                { name: "reading", color: "green" },
                { name: "work", color: "purple" },
                { name: "meeting", color: "pink" },
                { name: "Q1", color: "orange" },
                { name: "ideas", color: "yellow" },
                { name: "tech", color: "default" },
                { name: "product", color: "gray" },
              ],
            },
          },
        },
      });
      log.push("\u2705 Notes & Ideas: Tags property ensured");
      await delay(500);
    } catch (e) {
      log.push(`\u26A0\uFE0F Notes Tags property update failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Query rows and add tags
    const notesResp = await notionFetch(token, "POST", `/databases/${notesDb.id}/query`, {});
    const notesRows = notesResp.results as Array<Record<string, unknown>>;
    await delay(350);

    const tagUpdates: Record<string, string[]> = {
      "side project": ["business", "side-hustle", "online"],
      "birthday gift": ["family", "personal", "shopping"],
      "productivity": ["learning", "productivity", "research"],
      "book recommendation": ["books", "personal", "reading"],
      "team meeting": ["work", "meeting", "Q1"],
      "app idea": ["ideas", "tech", "product"],
      "habit tracker": ["ideas", "tech", "product"],
    };

    for (const row of notesRows) {
      const props = row.properties as Record<string, Record<string, unknown>>;
      let titleVal = "";
      for (const prop of Object.values(props)) {
        if (prop.type === "title") {
          const titles = prop.title as Array<{ plain_text: string }>;
          titleVal = titles.map((t) => t.plain_text).join("").toLowerCase();
          break;
        }
      }

      const matchedTags = Object.entries(tagUpdates).find(([key]) =>
        titleVal.includes(key)
      );
      if (matchedTags) {
        const [, tags] = matchedTags;
        try {
          await notionFetch(token, "PATCH", `/pages/${row.id as string}`, {
            properties: {
              "Tags": {
                multi_select: tags.map((t) => ({ name: t })),
              },
            },
          });
          log.push(`\u2705 Notes: Tagged "${titleVal}" \u2192 [${tags.join(", ")}]`);
        } catch (e) {
          log.push(`\u26A0\uFE0F Notes tag failed for "${titleVal}": ${e instanceof Error ? e.message : String(e)}`);
        }
        await delay(350);
      }
    }
  }
}

// ══════════════════════════════════════════════════════════
// Step 9: ADD KPI ROWS
// ══════════════════════════════════════════════════════════
async function expandKpiDashboard(
  token: string,
  audit: AuditResult,
  log: string[]
) {
  const kpiDb = audit.databases.find(
    (db) =>
      db.title.toLowerCase().includes("stat") ||
      db.title.toLowerCase().includes("kpi")
  );
  if (!kpiDb) {
    log.push("\u26A0\uFE0F No Stats/KPI database found for expansion");
    return;
  }

  // Query existing rows to avoid duplicates
  const resp = await notionFetch(token, "POST", `/databases/${kpiDb.id}/query`, {});
  const existing = resp.results as Array<Record<string, unknown>>;
  await delay(350);

  const existingTitles = new Set<string>();
  for (const row of existing) {
    const props = row.properties as Record<string, Record<string, unknown>>;
    for (const prop of Object.values(props)) {
      if (prop.type === "title") {
        const titles = prop.title as Array<{ plain_text: string }>;
        existingTitles.add(titles.map((t) => t.plain_text).join("").toLowerCase());
      }
    }
  }

  // Find the right property names by inspecting the first row
  let titlePropName = "Metric";
  let valuePropName = "Value";
  let iconPropName = "";
  if (existing.length > 0) {
    const firstProps = existing[0].properties as Record<string, Record<string, unknown>>;
    for (const [name, prop] of Object.entries(firstProps)) {
      if (prop.type === "title") titlePropName = name;
      if (name.toLowerCase() === "value" || name.toLowerCase() === "metric value") valuePropName = name;
      if (name.toLowerCase() === "icon" || name.toLowerCase() === "emoji") iconPropName = name;
    }
  }

  const newKpis = [
    { title: "Tasks Done", value: "\u2705 3 today", icon: "\u2705" },
    { title: "Finance", value: "\u{1F49A} On Budget", icon: "\u{1F4B0}" },
    { title: "Fitness", value: "\u{1F3C3} 3 this week", icon: "\u{1F3CB}\uFE0F" },
    { title: "Weekly Score", value: "\u2B50 78/100", icon: "\u{1F4CA}" },
  ];

  for (const kpi of newKpis) {
    if (existingTitles.has(kpi.title.toLowerCase())) {
      log.push(`\u2139\uFE0F KPI "${kpi.title}" already exists, skipping`);
      continue;
    }

    const props: Record<string, unknown> = {
      [titlePropName]: {
        title: [{ type: "text", text: { content: kpi.title } }],
      },
    };

    // Try to set value property
    if (valuePropName) {
      props[valuePropName] = {
        rich_text: [{ type: "text", text: { content: kpi.value } }],
      };
    }

    // Try to set icon property
    if (iconPropName) {
      props[iconPropName] = {
        rich_text: [{ type: "text", text: { content: kpi.icon } }],
      };
    }

    try {
      await notionFetch(token, "POST", "/pages", {
        parent: { database_id: kpiDb.id },
        icon: { type: "emoji", emoji: kpi.icon },
        properties: props,
      });
      log.push(`\u2705 KPI added: "${kpi.title}" = ${kpi.value}`);
    } catch (e) {
      log.push(`\u26A0\uFE0F KPI add failed for "${kpi.title}": ${e instanceof Error ? e.message : String(e)}`);
    }
    await delay(350);
  }
}

// ══════════════════════════════════════════════════════════
// Step 10: ADD LINKED DATABASE VIEWS TO DASHBOARD
// ══════════════════════════════════════════════════════════
async function addDashboardLinkedViews(
  token: string,
  rootPageId: string,
  audit: AuditResult,
  log: string[]
) {
  // Find key databases
  const goalsDb = audit.databases.find((db) => db.title.toLowerCase().includes("goal"));
  const tasksDb = audit.databases.find((db) => db.title.toLowerCase().includes("task"));
  const habitsDb = audit.databases.find((db) => db.title.toLowerCase().includes("habit"));

  // Add section headers + linked database blocks to the dashboard page
  const dashBlocks: Record<string, unknown>[] = [];

  // Divider before sections
  dashBlocks.push({ object: "block", type: "divider", divider: {} });

  if (goalsDb) {
    dashBlocks.push({
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "\u{1F3AF} Active Goals" } }],
        color: "default",
      },
    });
    // Linked database block — Notion API doesn't fully support creating linked views
    // We create a callout with link to the database instead
    dashBlocks.push({
      object: "block",
      type: "callout",
      callout: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Open Goals database \u2192 Create a \u201CLinked View\u201D here. Filter: Status = Active. Show: Goal, Area, Progress, Momentum.",
            },
          },
        ],
        icon: { type: "emoji", emoji: "\u{1F517}" },
        color: "blue_background",
      },
    });
  }

  if (tasksDb) {
    dashBlocks.push({
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "\u2705 Today\u2019s Tasks" } }],
        color: "default",
      },
    });
    dashBlocks.push({
      object: "block",
      type: "callout",
      callout: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Open Tasks database \u2192 Create a \u201CLinked View\u201D here. Filter: Due Date = Today. Show: Task, Priority, Status, Urgency Score.",
            },
          },
        ],
        icon: { type: "emoji", emoji: "\u{1F517}" },
        color: "green_background",
      },
    });
  }

  if (habitsDb) {
    dashBlocks.push({
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "\u{1F4AA} Today\u2019s Habits" } }],
        color: "default",
      },
    });
    dashBlocks.push({
      object: "block",
      type: "callout",
      callout: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Open Habits database \u2192 Create a \u201CLinked View\u201D here. Filter: Active habits. Show: Habit, Streak Bar, Time of Day, Today checkbox.",
            },
          },
        ],
        icon: { type: "emoji", emoji: "\u{1F517}" },
        color: "purple_background",
      },
    });
  }

  if (dashBlocks.length > 1) {
    await notionFetch(token, "PATCH", `/blocks/${rootPageId}/children`, {
      children: dashBlocks,
    });
    log.push(`\u2705 Dashboard: Added ${dashBlocks.length} linked view instruction blocks`);
  }
}

// ══════════════════════════════════════════════════════════
// MAIN ENDPOINT
// ══════════════════════════════════════════════════════════
// ── Streaming log proxy: array-like with push() that also sends SSE messages ──
function createStreamingLog(
  sendFn: (msg: string) => void
): string[] {
  const arr: string[] = [];
  return new Proxy(arr, {
    get(target, prop, receiver) {
      if (prop === "push") {
        return (...items: string[]) => {
          for (const item of items) {
            sendFn(item);
          }
          return Array.prototype.push.apply(target, items);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { notionToken, pageId } = body;

  if (!notionToken || !pageId) {
    return Response.json(
      { error: "Missing required fields: notionToken, pageId" },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(msg: string) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ msg })}\n\n`));
      }

      try {
        const log = createStreamingLog(send);
        const rootPageId = pageId.replace(/-/g, "");

        log.push("\u{1F50D} Starting template audit...");

        // Step 1: Audit
        const audit = await auditTemplate(notionToken, rootPageId);
        log.push(
          `\u{1F4CB} Audit complete: ${audit.pages.length} pages, ${audit.databases.length} databases, ${audit.blocks.length} blocks`
        );

        // Step 2: Cover images
        log.push("\u{1F3A8} Applying cover images...");
        await patchCovers(notionToken, rootPageId, audit, log);

        // Step 3: Remove duplicates
        log.push("\u{1F50D} Checking for duplicates...");
        await removeDuplicates(notionToken, audit, log);

        // Step 4: Fix KPI overflow
        log.push("\u{1F4CA} Fixing KPI text overflow...");
        await fixKpiOverflow(notionToken, audit, log);

        // Step 5: Remove watermark
        log.push("\u{1F5D1}\uFE0F Removing watermarks...");
        await removeWatermark(notionToken, audit, log);

        // Step 6: Populate Start Here
        log.push("\u{1F680} Populating Start Here page...");
        await populateStartHere(notionToken, audit, log);

        // Step 7: Create missing databases
        log.push("\u{1F4E6} Creating missing databases...");
        const newDbIds = await createMissingDatabases(notionToken, rootPageId, audit, log);

        // Step 8: Enrich existing data
        log.push("\u2728 Enriching existing data...");
        await enrichExistingData(notionToken, audit, log);

        // Step 9: Expand KPI dashboard
        log.push("\u{1F4CA} Expanding KPI dashboard...");
        await expandKpiDashboard(notionToken, audit, log);

        // Step 10: Add linked views to dashboard
        log.push("\u{1F517} Adding dashboard linked view sections...");
        await addDashboardLinkedViews(notionToken, rootPageId, audit, log);

        log.push("\u2705 All patches applied successfully!");

        // Send final summary as structured data
        send(JSON.stringify({
          __summary: true,
          success: true,
          audit: {
            pages: audit.pages.length,
            databases: audit.databases.length,
            blocks: audit.blocks.length,
          },
          newDatabases: newDbIds,
        }));

        send("__DONE__");
      } catch (err) {
        send(`\u274C Error: ${err instanceof Error ? err.message : String(err)}`);
        send("__DONE__");
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
