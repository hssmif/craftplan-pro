import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";

async function listSharedPages(token: string) {
  const notion = new Client({ auth: token });
  const response = await notion.search({
    filter: { property: "object", value: "page" },
    sort: { direction: "descending", timestamp: "last_edited_time" },
    page_size: 50,
  });

  return response.results.map((page: unknown) => {
    const p = page as Record<string, unknown>;
    const properties = p.properties as Record<string, unknown> | undefined;
    const titleProp = properties?.title as { title?: Array<{ plain_text: string }> } | undefined;
    const title = titleProp?.title?.[0]?.plain_text || "Untitled";

    const iconObj = p.icon as { type?: string; emoji?: string } | null;
    const icon = iconObj?.type === "emoji" ? iconObj.emoji : null;

    return {
      id: p.id,
      title,
      icon,
      lastEdited: p.last_edited_time,
    };
  });
}

// ── GET /api/notion/pages?token=xxx — List pages shared with integration ──
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token parameter" }, { status: 400 });
  }

  try {
    return NextResponse.json({ pages: await listSharedPages(token) });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);

    if (errMsg.includes("unauthorized") || errMsg.includes("Invalid token")) {
      return NextResponse.json(
        { error: "Invalid Notion token. Please check your integration token." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: `Failed to list pages: ${errMsg}` },
      { status: 500 }
    );
  }
}

// ── POST /api/notion/pages — Test connection (verify token works) ──
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const notion = new Client({ auth: token });

    // Try to get bot user info — this validates the token
    const me = await notion.users.me({});
    const pages = await listSharedPages(token);

    return NextResponse.json({
      connected: true,
      botName: (me as Record<string, unknown>).name || "Notion Integration",
      botType: (me as Record<string, unknown>).type,
      pages,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { connected: false, error: errMsg },
      { status: 401 }
    );
  }
}
