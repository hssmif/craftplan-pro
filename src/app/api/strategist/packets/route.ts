// POST /api/strategist/packets
//
// Bridges a build-mode packet from the Strategist Council into the
// existing /research idea funnel by inserting a product_ideas row. The
// returned `ideaId` plugs into /cross-stitch?ideaId=N (and any other
// niche-specific studios) so the seller can drop straight into the
// build flow with their listing copy already attached.
//
// Body: { packet: BuildPacket, runId?: number }
//
// The packet shape comes from lib/council.ts BuildPacket. We don't run
// any LLM here — this is a deterministic INSERT.
//
// Hard rules:
//   - This NEVER lists on Etsy. It only stages the idea in the seller's
//     local funnel where they can review, edit, and decide what to do.
//   - Status is set to "favorited" so the seller sees it as an
//     intentional pick (not unreviewed Gemini output).

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface InboundPacket {
  index?: number;
  niche?: string;
  product_type?: string;
  subject?: string;
  angle?: string;
  title?: string;
  description?: string;
  tags?: string[];
  keywords?: string[];
  price?: number;
  pricing_rationale?: string;
  target_buyer?: string;
  why_now?: string;
  signal?: {
    based_on_listings?: string[];
    avg_competitor_price?: number;
    competition_level?: string | null;
    demand_score?: number;
  };
  qa?: { passes?: boolean; issues?: string[] };
}

export async function POST(req: NextRequest) {
  let body: { packet?: InboundPacket; runId?: number } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const p = body.packet;
  if (!p || typeof p !== "object") {
    return NextResponse.json({ error: "Missing `packet` in body" }, { status: 400 });
  }
  if (!p.title || typeof p.title !== "string") {
    return NextResponse.json({ error: "Packet must have a non-empty title" }, { status: 400 });
  }

  const db = getDb();

  // Build the notes blob: include the full listing copy + pricing
  // rationale + any QA flags so the seller can copy/paste into Etsy
  // without re-opening the council. Uses simple plain-text headers —
  // no markdown — because /research renders notes verbatim today.
  const noteParts: string[] = [];
  if (p.angle) noteParts.push(`Angle:\n${p.angle}`);
  if (p.description) noteParts.push(`Description:\n${p.description}`);
  if (p.pricing_rationale) noteParts.push(`Price reasoning:\n${p.pricing_rationale}`);
  if (p.qa?.issues && p.qa.issues.length > 0) {
    noteParts.push(`QA flags:\n- ${p.qa.issues.join("\n- ")}`);
  }
  if (typeof body.runId === "number" && body.runId > 0) {
    noteParts.push(`Source: Strategist Council run #${body.runId}`);
  }
  const notes = noteParts.join("\n\n");

  // Score defaults — 50 if signal is missing so the funnel sort stays stable.
  const demand = clampScore(p.signal?.demand_score, 50);
  const competition = competitionToScore(p.signal?.competition_level, 50);
  const urgency = 60; // build-mode packets are pre-curated; modestly urgent
  const confidence = p.qa?.passes ? 80 : 55;

  const tagsJson = Array.isArray(p.tags) ? JSON.stringify(p.tags) : null;
  const keywordsJson = Array.isArray(p.keywords) ? JSON.stringify(p.keywords) : null;
  const signalJson = Array.isArray(p.signal?.based_on_listings)
    ? JSON.stringify(p.signal!.based_on_listings)
    : null;

  // Status starts at 'favorited' — the seller chose to send this packet
  // to the studio, so it shouldn't sit in the unreviewed 'new' bucket.
  const ins = db.prepare(
    `INSERT INTO product_ideas (
        title, niche, product_type, why_now, target_buyer,
        suggested_price, demand_score, competition_score, urgency_score, confidence,
        signal_listings, suggested_tags, suggested_keywords,
        status, notes
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'favorited', ?)`,
  ).run(
    p.title.slice(0, 240),
    p.niche ?? null,
    p.product_type ?? null,
    p.why_now ?? null,
    p.target_buyer ?? null,
    typeof p.price === "number" ? p.price : 0,
    demand,
    competition,
    urgency,
    confidence,
    signalJson,
    tagsJson,
    keywordsJson,
    notes,
  );

  const ideaId = Number(ins.lastInsertRowid);
  db.pragma("wal_checkpoint(TRUNCATE)");

  return NextResponse.json({ ideaId });
}

// ── Helpers ──────────────────────────────────────────────────────────

function clampScore(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Map textual competition level → a 0–100 score. Higher score = more
 *  crowded niche. Mirrors the convention used elsewhere in the codebase
 *  where a low competition_score = good opportunity. */
function competitionToScore(level: string | null | undefined, fallback: number): number {
  if (!level) return fallback;
  const norm = level.toLowerCase().trim();
  if (norm === "very high") return 90;
  if (norm === "high") return 75;
  if (norm === "medium") return 50;
  if (norm === "low") return 25;
  if (norm === "very low") return 10;
  return fallback;
}
