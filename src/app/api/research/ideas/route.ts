// GET /api/research/ideas?status={all|new|favorited|dismissed|in_progress|built}
//   Returns saved product ideas, newest first.
//   Default status=all (no filter).

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_STATUS = new Set([
  "all",
  "new",
  "favorited",
  "dismissed",
  "in_progress",
  "built",
]);

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

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status") ?? "all";
  if (!VALID_STATUS.has(status)) {
    return NextResponse.json(
      { error: `Invalid status. Use one of: ${[...VALID_STATUS].join(", ")}` },
      { status: 400 },
    );
  }

  const limit = Math.min(
    200,
    Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 100)),
  );

  const db = getDb();
  const ideas = (
    status === "all"
      ? db
          .prepare(
            `SELECT * FROM product_ideas
             ORDER BY generated_at DESC
             LIMIT ?`,
          )
          .all(limit)
      : db
          .prepare(
            `SELECT * FROM product_ideas
             WHERE status = ?
             ORDER BY generated_at DESC
             LIMIT ?`,
          )
          .all(status, limit)
  ) as ProductIdeaRow[];

  return NextResponse.json({ ideas, count: ideas.length });
}
