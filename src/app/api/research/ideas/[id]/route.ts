// GET /api/research/ideas/[id]
//   Returns one idea by primary key. Used by the studio pages
//   (/cross-stitch, /wall-art) to fetch the idea referenced in
//   ?ideaId=N so they can pre-fill their first input.
//
// PATCH /api/research/ideas/[id]
//   Body: { status?: "new" | "favorited" | "dismissed" | "in_progress" | "built", notes?: string }
//   Updates a saved product idea (favorite/dismiss/notes).
//
// DELETE /api/research/ideas/[id]
//   Hard-deletes an idea. (UI doesn't expose this yet but the route is
//   here so a power-user could clean up if needed.)

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const VALID_STATUS = new Set([
  "new",
  "favorited",
  "dismissed",
  "in_progress",
  "built",
]);

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface ProductIdeaRow {
  id: number;
  title: string;
  niche: string | null;
  product_type: string | null;
  why_now: string | null;
  target_buyer: string | null;
  suggested_price: number;
  demand_score: number;
  competition_score: number;
  urgency_score: number;
  confidence: number;
  signal_listings: string | null;
  suggested_tags: string | null;
  suggested_keywords: string | null;
  status: string;
  notes: string | null;
  generated_at: string;
  updated_at: string;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM product_ideas WHERE id = ?`)
    .get(numericId) as ProductIdeaRow | undefined;
  if (!row) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }
  return NextResponse.json({ idea: row });
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: { status?: string; notes?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.status !== undefined) {
    if (!VALID_STATUS.has(body.status)) {
      return NextResponse.json(
        { error: `Invalid status. Use one of: ${[...VALID_STATUS].join(", ")}` },
        { status: 400 },
      );
    }
    updates.push("status = ?");
    values.push(body.status);
  }

  if (body.notes !== undefined) {
    updates.push("notes = ?");
    values.push(typeof body.notes === "string" ? body.notes.slice(0, 2000) : null);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Always bump updated_at so the UI can sort by edit recency if it
  // wants to later.
  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(numericId);

  const db = getDb();
  const result = db
    .prepare(`UPDATE product_ideas SET ${updates.join(", ")} WHERE id = ?`)
    .run(...values);

  if (result.changes === 0) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }

  getDb().pragma('wal_checkpoint(TRUNCATE)');
  const row = db
    .prepare(`SELECT * FROM product_ideas WHERE id = ?`)
    .get(numericId) as ProductIdeaRow | undefined;

  return NextResponse.json({ idea: row });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const db = getDb();
  const result = db
    .prepare(`DELETE FROM product_ideas WHERE id = ?`)
    .run(numericId);

  if (result.changes === 0) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }

  getDb().pragma('wal_checkpoint(TRUNCATE)');
  return NextResponse.json({ deleted: true });
}
