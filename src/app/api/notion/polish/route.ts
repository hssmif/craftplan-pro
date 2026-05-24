import { NextRequest } from "next/server";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function notionHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

function extractPageId(url: string): string {
  const cleaned = url.trim();
  if (/^[a-f0-9]{32}$/i.test(cleaned)) return cleaned;
  if (/^[a-f0-9-]{36}$/i.test(cleaned)) return cleaned.replace(/-/g, "");

  let path = cleaned;
  try {
    const parsed = new URL(cleaned.startsWith("http") ? cleaned : `https://${cleaned}`);
    path = parsed.pathname;
  } catch { /* use cleaned directly */ }

  const lastSeg = path.replace(/\/$/, "").split("/").pop() || "";
  const hexStr = lastSeg.replace(/-/g, "");
  const hexMatch = hexStr.match(/[a-f0-9]{32}$/i);
  if (hexMatch) return hexMatch[0];

  const uuidMatch = lastSeg.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
  if (uuidMatch) return uuidMatch[1].replace(/-/g, "");

  throw new Error(`Could not parse page ID from: ${url}`);
}

function formatUUID(id: string): string {
  const h = id.replace(/-/g, "");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function getIconForPage(title: string, templateType: string, index: number): string {
  const t = title.toLowerCase();

  const emojiMap: [string[], string][] = [
    [["dashboard", "home", "overview", "main", "start", "welcome", "hub", "system"], "🏠"],
    [["budget", "financial", "finance", "money tracker"], "💰"],
    [["income", "earning", "revenue", "salary", "profit"], "💵"],
    [["expense", "spending", "cost", "bill", "purchase"], "💸"],
    [["saving", "emergency fund", "sinking fund"], "🏦"],
    [["goal", "target", "objective", "dream", "vision"], "🎯"],
    [["habit", "streak", "routine", "daily check"], "✅"],
    [["journal", "diary", "reflection", "gratitude", "writing"], "📔"],
    [["calendar", "schedule", "event", "timeline"], "📅"],
    [["task", "todo", "to-do", "checklist", "action item"], "📋"],
    [["note", "memo", "capture", "brain dump", "quick capture"], "📝"],
    [["project", "work", "plan", "sprint"], "📁"],
    [["client", "customer", "contact", "crm"], "👤"],
    [["invoice", "payment", "receipt", "billing"], "🧾"],
    [["focus", "pomodoro", "deep work", "session", "timer"], "⏱️"],
    [["health", "wellness", "body", "fitness"], "💪"],
    [["sleep", "rest", "recovery", "bedtime"], "😴"],
    [["water", "hydrat", "intake"], "💧"],
    [["meal", "food", "nutrition", "diet", "recipe"], "🥗"],
    [["exercise", "workout", "gym", "sport", "training"], "🏋️"],
    [["course", "class", "lecture", "subject", "module"], "📚"],
    [["grade", "gpa", "score", "mark", "result"], "📊"],
    [["assignment", "homework", "essay", "paper", "deadline"], "📝"],
    [["content", "post", "publish", "creator"], "📱"],
    [["hashtag", "keyword", "seo", "tag"], "#️⃣"],
    [["brand", "identity", "style", "guideline"], "✨"],
    [["analytic", "metric", "stat", "report", "kpi", "okr"], "📈"],
    [["subscription", "recurring", "service"], "🔄"],
    [["debt", "loan", "credit card", "payoff"], "📉"],
    [["net worth", "wealth", "asset", "liability"], "💎"],
    [["meeting", "call", "interview", "standup"], "🤝"],
    [["sop", "process", "workflow", "procedure", "system"], "⚙️"],
    [["resource", "library", "reference", "link"], "📚"],
    [["study", "exam", "review", "quiz", "test"], "📖"],
    [["mood", "emotion", "mental", "mindset", "anxiety"], "🧠"],
    [["reward", "achievement", "badge", "point", "level"], "🏆"],
    [["time block", "time boxing", "block time"], "⏰"],
    [["bookmark", "quick link", "resource link"], "🔗"],
    [["snowball", "avalanche", "payoff plan"], "❄️"],
    [["category", "type", "classification"], "🏷️"],
    [["brain dump"], "🧠"],
    [["review", "weekly review", "monthly review"], "📊"],
    [["sidebar", "navigation", "index"], "🗂️"],
  ];

  for (const [keywords, emoji] of emojiMap) {
    if (keywords.some((k) => t.includes(k))) return emoji;
  }

  const typeDefaults: Record<string, string[]> = {
    finance_tracker:  ["💰", "📊", "💵", "🏦", "📈", "💸", "🎯"],
    adhd_planner:     ["🧠", "⚡", "🎯", "⏱️", "✅", "📝", "🔗"],
    life_planner:     ["🌟", "📅", "🎯", "💫", "✨", "📖", "🌱"],
    student_planner:  ["🎓", "📚", "📝", "🏫", "⏰", "📊", "✏️"],
    social_media:     ["📱", "✨", "📊", "🎨", "💫", "📅", "🔥"],
    habit_tracker:    ["✅", "💪", "🌱", "⭐", "🏆", "😴", "💧"],
    business_hub:     ["💼", "📊", "🤝", "🎯", "⚙️", "📁", "💡"],
    debt_snowball:    ["💸", "❄️", "📉", "🏦", "✅", "🎯", "💎"],
  };

  const defaults = typeDefaults[templateType] || ["📋", "📊", "📝", "🗂️", "⚡", "🌟", "✅"];
  return defaults[index % defaults.length];
}

// ── AI Cover Generation via Pollinations (Flux model) ──────────────────────
// Uses Pollinations public URL — publicly accessible so Notion can fetch it as
// an external cover image. Same Flux engine used for mockup generation.

const BANNER_STYLE = "ultra-wide banner photo 4:1 ratio, professional product photography, clean minimal aesthetic, warm neutral tones, soft natural lighting, high quality";

function buildCoverPrompt(title: string, templateType: string, index: number): string {
  const t = title.toLowerCase();

  // Title-keyword specific prompts
  if (t.includes("dashboard") || t.includes("home") || t.includes("overview") || t.includes("hub") || t.includes("main") || t.includes("welcome")) {
    return `minimalist modern workspace desk, laptop open showing dashboard, coffee mug and small succulent, overhead aerial view, ${BANNER_STYLE}`;
  }
  if (t.includes("budget") || t.includes("finance") || t.includes("money") || t.includes("income") || t.includes("revenue") || t.includes("expense") || t.includes("spending")) {
    return `financial planning desk flatlay, graphs and charts on paper, calculator, gold pen, notebook, ${BANNER_STYLE}`;
  }
  if (t.includes("saving") || t.includes("fund") || t.includes("emergency")) {
    return `piggy bank and coins jar with notebook, financial saving concept, clean minimal desk, ${BANNER_STYLE}`;
  }
  if (t.includes("debt") || t.includes("loan") || t.includes("payoff") || t.includes("snowball") || t.includes("avalanche")) {
    return `debt payoff chart on paper with rising line, calculator, pen, financial freedom concept, clean desk, ${BANNER_STYLE}`;
  }
  if (t.includes("net worth") || t.includes("wealth") || t.includes("asset") || t.includes("investment")) {
    return `investment portfolio charts, stock market graphs on screen, financial growth concept, ${BANNER_STYLE}`;
  }
  if (t.includes("goal") || t.includes("target") || t.includes("vision") || t.includes("dream") || t.includes("objective")) {
    return `sunrise over mountain peak, achievement and ambition concept, inspiring landscape banner, ${BANNER_STYLE}`;
  }
  if (t.includes("habit") || t.includes("streak") || t.includes("routine") || t.includes("daily")) {
    return `morning wellness routine flatlay, yoga mat, water bottle, fresh fruit, green plant, ${BANNER_STYLE}`;
  }
  if (t.includes("journal") || t.includes("diary") || t.includes("reflection") || t.includes("gratitude")) {
    return `open leather journal with fountain pen, coffee cup, candle, cozy morning desk, ${BANNER_STYLE}`;
  }
  if (t.includes("calendar") || t.includes("schedule") || t.includes("event") || t.includes("appointment")) {
    return `elegant paper planner opened to calendar spread, gold pen, sticky notes, organized desk, ${BANNER_STYLE}`;
  }
  if (t.includes("task") || t.includes("todo") || t.includes("checklist") || t.includes("action")) {
    return `task checklist on clipboard with pen, productive workspace, sticky notes, minimal desk, ${BANNER_STYLE}`;
  }
  if (t.includes("note") || t.includes("capture") || t.includes("brain dump") || t.includes("memo")) {
    return `scattered notes and ideas on paper, brainstorming desk flatlay, pens and markers, ${BANNER_STYLE}`;
  }
  if (t.includes("project") || t.includes("sprint") || t.includes("work")) {
    return `project planning whiteboard with colorful sticky notes, modern office desk, ${BANNER_STYLE}`;
  }
  if (t.includes("focus") || t.includes("pomodoro") || t.includes("deep work") || t.includes("timer")) {
    return `minimalist desk with timer, noise-canceling headphones, single coffee cup, focused workspace, ${BANNER_STYLE}`;
  }
  if (t.includes("health") || t.includes("wellness") || t.includes("fitness") || t.includes("workout") || t.includes("exercise") || t.includes("gym")) {
    return `healthy lifestyle flatlay, dumbbells, fresh fruits, water bottle, green smoothie, ${BANNER_STYLE}`;
  }
  if (t.includes("sleep") || t.includes("rest") || t.includes("bedtime") || t.includes("recovery")) {
    return `cozy bedroom setup, soft pillows and white linen, moon night lamp, relaxation concept, ${BANNER_STYLE}`;
  }
  if (t.includes("meal") || t.includes("food") || t.includes("nutrition") || t.includes("recipe") || t.includes("diet")) {
    return `fresh colorful meal prep ingredients, vegetables and fruits flatlay, kitchen counter, ${BANNER_STYLE}`;
  }
  if (t.includes("course") || t.includes("class") || t.includes("lecture") || t.includes("subject") || t.includes("study") || t.includes("exam") || t.includes("learn")) {
    return `university student desk with textbooks stacked, open notebook, coffee, pencil case, studying setup, ${BANNER_STYLE}`;
  }
  if (t.includes("grade") || t.includes("gpa") || t.includes("score") || t.includes("result")) {
    return `academic report card with gold pen, graduation concept, books and diploma, clean desk, ${BANNER_STYLE}`;
  }
  if (t.includes("assignment") || t.includes("homework") || t.includes("essay") || t.includes("deadline")) {
    return `writing assignment papers on desk, laptop open, coffee, deadline pressure concept, ${BANNER_STYLE}`;
  }
  if (t.includes("content") || t.includes("post") || t.includes("social") || t.includes("instagram") || t.includes("creator")) {
    return `content creator flatlay, smartphone showing social media, camera, notebook, pastel desk aesthetic, ${BANNER_STYLE}`;
  }
  if (t.includes("brand") || t.includes("identity") || t.includes("style guide")) {
    return `branding moodboard with color swatches, typography samples, minimalist creative workspace, ${BANNER_STYLE}`;
  }
  if (t.includes("client") || t.includes("customer") || t.includes("crm") || t.includes("invoice") || t.includes("billing")) {
    return `professional business meeting desk, contract papers, laptop, handshake concept, clean office, ${BANNER_STYLE}`;
  }
  if (t.includes("meeting") || t.includes("call") || t.includes("interview")) {
    return `professional video call setup, laptop with camera, notebook, minimal home office, ${BANNER_STYLE}`;
  }
  if (t.includes("analytic") || t.includes("metric") || t.includes("stat") || t.includes("kpi") || t.includes("report")) {
    return `business analytics dashboard on screen, charts and graphs, data visualization, professional desk, ${BANNER_STYLE}`;
  }
  if (t.includes("read") || t.includes("book") || t.includes("library") || t.includes("resource")) {
    return `open book flatlay with pen and coffee, cozy reading setup, warm bookshelf background, ${BANNER_STYLE}`;
  }
  if (t.includes("quick") || t.includes("start") || t.includes("guide") || t.includes("help") || t.includes("faq")) {
    return `clean minimal workspace with open notebook and guide, welcoming desk setup, ${BANNER_STYLE}`;
  }
  if (t.includes("changelog") || t.includes("update") || t.includes("version") || t.includes("reset")) {
    return `tech workspace with laptop showing code, modern minimal desk, update concept, ${BANNER_STYLE}`;
  }
  if (t.includes("subscription") || t.includes("recurring") || t.includes("service")) {
    return `subscription management concept, credit card, calendar, laptop, organized desk, ${BANNER_STYLE}`;
  }
  if (t.includes("mood") || t.includes("emotion") || t.includes("mental") || t.includes("mindset") || t.includes("anxiety") || t.includes("adhd")) {
    return `calm zen workspace with plants, soft colors, mindfulness concept, peaceful desk setup, ${BANNER_STYLE}`;
  }

  // Template-type fallbacks for unmatched titles
  const typePrompts: Record<string, string> = {
    student_planner:  `university student productivity desk, textbooks, laptop, coffee, academic aesthetic, ${BANNER_STYLE}`,
    finance_tracker:  `financial planning workspace, charts calculator notebook, professional clean desk, ${BANNER_STYLE}`,
    adhd_planner:     `colorful organized creative workspace, sticky notes, planning tools, energetic desk setup, ${BANNER_STYLE}`,
    life_planner:     `balanced lifestyle workspace, journal coffee plants, morning routine flatlay, ${BANNER_STYLE}`,
    social_media:     `content creator desk with phone camera notebook, pastel aesthetic workspace, ${BANNER_STYLE}`,
    habit_tracker:    `wellness morning routine flatlay, yoga mat fruits water, healthy lifestyle, ${BANNER_STYLE}`,
    business_hub:     `modern professional office desk, laptop documents coffee, business environment, ${BANNER_STYLE}`,
    debt_snowball:    `financial freedom concept desk, calculator debt chart, minimalist financial planning, ${BANNER_STYLE}`,
  };

  return typePrompts[templateType] || `beautiful minimal workspace desk flatlay, ${templateType.replace(/_/g, " ")} theme, ${BANNER_STYLE}`;
}

// Deterministic seed based on title + index for consistent covers per page
function coverSeed(title: string, index: number): number {
  let h = 0;
  for (let i = 0; i < title.length; i++) {
    h = Math.imul(31, h) + title.charCodeAt(i) | 0;
  }
  return Math.abs(h + index * 1337) % 2147483647;
}

function getAICoverUrl(title: string, templateType: string, index: number): string {
  const prompt = buildCoverPrompt(title, templateType, index);
  const seed = coverSeed(title, index);

  // If a public base URL is configured (production deployment), use our proxy so
  // the image is served from a trusted HTTPS domain (no ad-blocker issues).
  // Set NEXT_PUBLIC_BASE_URL=https://yourdomain.com in .env.local for production.
  const base = process.env.NEXT_PUBLIC_BASE_URL;
  if (base && base.startsWith("https://")) {
    return `${base}/api/notion/cover-image?prompt=${encodeURIComponent(prompt)}&seed=${seed}`;
  }

  // Default: direct Pollinations URL (works for all users without a Pollinations ad-block rule)
  // Note: if image.pollinations.ai is blocked in your browser, whitelist it in your ad blocker.
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1600&height=400&seed=${seed}&nologo=true&model=flux&enhance=true`;
}

// Pre-warm the Pollinations image from our server so it's cached before Notion loads it
async function prewarmCover(url: string): Promise<void> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(30000) });
  } catch {
    // Best-effort — if pre-warm fails, Notion will still eventually load it
  }
}

interface NotionBlock {
  id: string;
  type: string;
  child_page?: { title: string };
  child_database?: { title: string };
}

interface NotionBlocksResponse {
  results: NotionBlock[];
  has_more: boolean;
  next_cursor: string | null;
}

interface NotionPageResponse {
  properties?: Record<string, {
    type: string;
    title?: Array<{ plain_text: string }>;
  }>;
  child_page?: { title: string };
}

async function getPageTitle(pageId: string, token: string): Promise<string> {
  const resp = await fetch(`${NOTION_API}/pages/${formatUUID(pageId)}`, {
    headers: notionHeaders(token),
  });
  if (!resp.ok) {
    const errBody = await resp.text();
    if (resp.status === 404) throw new Error(`Page not found (404) — share this page with your CraftPlan integration first`);
    if (resp.status === 401) throw new Error(`Unauthorized (401) — check your Notion token in Settings`);
    throw new Error(`Notion API error ${resp.status}: ${errBody}`);
  }
  const data = (await resp.json()) as NotionPageResponse;

  if (data.properties) {
    const titleProp = Object.values(data.properties).find((p) => p.type === "title");
    if (titleProp?.title) {
      return titleProp.title.map((t) => t.plain_text).join("") || "Untitled";
    }
  }
  if (data.child_page?.title) return data.child_page.title;
  return "Untitled";
}

async function getChildPages(
  pageId: string,
  token: string
): Promise<Array<{ id: string; title: string; type: "child_page" | "child_database" }>> {
  const results: Array<{ id: string; title: string; type: "child_page" | "child_database" }> = [];
  let cursor: string | undefined;

  do {
    const url = `${NOTION_API}/blocks/${formatUUID(pageId)}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;
    const resp = await fetch(url, { headers: notionHeaders(token) });
    if (!resp.ok) break;

    const data = (await resp.json()) as NotionBlocksResponse;

    for (const block of data.results) {
      if (block.type === "child_page") {
        results.push({ id: block.id, title: block.child_page?.title || "Untitled", type: "child_page" });
      } else if (block.type === "child_database") {
        results.push({ id: block.id, title: block.child_database?.title || "Untitled", type: "child_database" });
      }
    }

    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);

  return results;
}

async function patchPage(pageId: string, token: string, updates: Record<string, unknown>): Promise<void> {
  const resp = await fetch(`${NOTION_API}/pages/${formatUUID(pageId)}`, {
    method: "PATCH",
    headers: notionHeaders(token),
    body: JSON.stringify(updates),
  });
  if (!resp.ok) {
    const err = (await resp.json()) as { message?: string };
    throw new Error(err.message || `API error ${resp.status}`);
  }
}

// Run async tasks with max concurrency
async function runConcurrent<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = [];
  const queue = [...tasks];
  const running: Promise<void>[] = [];

  while (queue.length > 0 || running.length > 0) {
    while (running.length < limit && queue.length > 0) {
      const task = queue.shift()!;
      const p = task().then((r) => { results.push(r); });
      running.push(p);
      p.finally(() => { running.splice(running.indexOf(p), 1); });
    }
    if (running.length > 0) await Promise.race(running);
  }

  return results;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { pageUrl: string; templateType: string; token: string };
  const { pageUrl, templateType, token } = body;

  if (!pageUrl || !token) {
    return Response.json({ error: "Missing pageUrl or token" }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(msg: string) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ msg })}\n\n`));
      }

      try {
        const pageId = extractPageId(pageUrl);
        send(`🔍 Connecting to Notion...`);

        const rootTitle = await getPageTitle(pageId, token);
        send(`📄 Found: "${rootTitle}"`);

        // Get all child pages/databases
        send(`🔍 Scanning sub-pages...`);
        const children = await getChildPages(pageId, token);
        const total = children.length + 1;

        // Build cover URLs for all pages (root + children)
        const allPages = [
          { id: pageId, title: rootTitle, index: 0 },
          ...children.map((c, i) => ({ id: c.id, title: c.title, index: i + 1 })),
        ];

        // Pre-warm all AI covers in parallel (max 5 concurrent) before applying to Notion
        send(`🎨 Generating AI covers for ${total} page${total !== 1 ? "s" : ""} with Flux AI...`);
        const coverUrls = allPages.map(p => getAICoverUrl(p.title, templateType, p.index));

        await runConcurrent(
          coverUrls.map((url, i) => async () => {
            await prewarmCover(url);
            send(`🖼️ Cover ready: "${allPages[i].title}"`);
          }),
          5
        );

        send(`✨ All covers generated! Applying to Notion...`);

        // Apply icon + AI cover to root page
        const rootIcon = getIconForPage(rootTitle, templateType, 0);
        await patchPage(pageId, token, {
          icon: { type: "emoji", emoji: rootIcon },
          cover: { type: "external", external: { url: coverUrls[0] } },
        });
        send(`${rootIcon} "${rootTitle}" — icon + AI cover ✓`);

        if (children.length === 0) {
          send(`ℹ️ No sub-pages found (root page polished)`);
        } else {
          send(`📁 Applying to ${children.length} sub-pages...`);

          let idx = 1;
          for (const child of children) {
            try {
              const icon = getIconForPage(child.title, templateType, idx);
              const cover = coverUrls[idx];

              await patchPage(child.id, token, {
                icon: { type: "emoji", emoji: icon },
                cover: { type: "external", external: { url: cover } },
              });

              send(`${icon} "${child.title}" — icon + AI cover ✓`);
              idx++;
            } catch (err) {
              send(`⚠️ "${child.title}" — skipped (${err instanceof Error ? err.message : "error"})`);
            }

            // Respect Notion rate limit: max 3 req/s
            await new Promise((r) => setTimeout(r, 350));
          }

          send(`✅ All ${total} pages polished with AI-generated covers!`);
        }

        send("__DONE__");
      } catch (err) {
        send(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
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
