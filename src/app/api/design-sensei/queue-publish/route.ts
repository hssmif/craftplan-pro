import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Ensure the design_sensei_runs table exists
function ensureTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS design_sensei_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      niche_score INTEGER DEFAULT 0,
      products_count INTEGER DEFAULT 0,
      total_duration_ms INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','queued','publishing','published','error')),
      data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function POST(req: NextRequest) {
  try {
    ensureTable();
    const body = await req.json();
    const { keyword, nicheScore, products, totalDuration, runData } = body;

    if (!keyword || !products?.length) {
      return NextResponse.json({ error: "keyword and products required" }, { status: 400 });
    }

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO design_sensei_runs (keyword, niche_score, products_count, total_duration_ms, status, data)
      VALUES (?, ?, ?, ?, 'queued', ?)
    `).run(
      keyword,
      nicheScore || 0,
      products.length,
      totalDuration || 0,
      runData ? JSON.stringify(runData) : null
    );

    return NextResponse.json({
      id: result.lastInsertRowid,
      status: "queued",
      productsCount: products.length,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function GET() {
  try {
    ensureTable();
    const db = getDb();
    const runs = db.prepare(
      "SELECT id, keyword, niche_score, products_count, total_duration_ms, status, created_at FROM design_sensei_runs ORDER BY created_at DESC LIMIT 50"
    ).all();
    return NextResponse.json({ runs });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
