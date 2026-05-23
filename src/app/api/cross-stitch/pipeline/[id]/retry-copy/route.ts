// POST /api/cross-stitch/pipeline/[id]/retry-copy
//   → Re-runs listing-copy generation for ONE item and persists the
//     result back to SQLite via patchItem().  Body: { itemId: string }.
//
// Why this exists: the auto-pipeline runs server-side and SQLite is
// the canonical source of truth.  The client polls /[id] every 2 s
// and overwrites local state with whatever the server has.  If the
// retry only updated client state (the original implementation), the
// next poll would clobber it.  This endpoint closes that loop —
// retry writes to the server, polling picks up the change.
//
// Returns: { ok: true, item: AutoPipelineItem } on success.

import { NextRequest, NextResponse } from "next/server";
import { getJob, patchItem } from "@/lib/auto-pipeline-jobs";

export const runtime = "nodejs";
// Listing copy with 16K-token cap takes 40–70 s in normal runs and
// occasionally up to ~110 s with the tag-validator retry.  Give the
// route enough budget that we never hit Next's default route timeout.
export const maxDuration = 180;

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3461";
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: jobId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { itemId?: string };
  if (!body.itemId) {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }
  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  const item = job.items.find((it) => String(it.id) === String(body.itemId));
  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  // Hit the same generate-listing endpoint the orchestrator's stage 3
  // uses.  120 s timeout matches the orchestrator's stage 3 timeout
  // (lib/auto-pipeline-orchestrator.ts).
  try {
    const r = await fetch(`${baseUrl()}/api/etsy/generate-listing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        templateType: "cross_stitch_pattern",
        productFormat: "PDF Pattern",
        features: [item.title],
        niche: "cross-stitch patterns",
        targetAudience: "stitchers, crafters, gift buyers",
        aesthetic: "kawaii cottagecore",
      }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      const msg = `listing copy HTTP ${r.status}: ${txt.slice(0, 200)}`;
      patchItem(jobId, item.id, { error: msg });
      return NextResponse.json({ ok: false, error: msg }, { status: 502 });
    }
    const d = (await r.json()) as {
      listing?: {
        title?: unknown;
        description?: unknown;
        tags?: unknown;
        price?: unknown;
        attributes?: Record<string, unknown>;
      };
    };
    const listing = d.listing || (d as Record<string, unknown>);
    const title = typeof listing.title === "string" ? listing.title : item.title;
    const description = typeof listing.description === "string" ? listing.description : "";
    const tags = Array.isArray(listing.tags) ? (listing.tags as string[]).slice(0, 13) : [];
    if (tags.length === 0) {
      const msg = "listing copy returned no tags (Gemini truncation?)";
      patchItem(jobId, item.id, { error: msg });
      return NextResponse.json({ ok: false, error: msg }, { status: 502 });
    }
    const rawAttrs = (listing.attributes ?? {}) as Record<string, unknown>;
    const clean = (v: unknown): string | undefined => {
      if (typeof v !== "string") return undefined;
      const t = v.trim();
      if (!t || t.toLowerCase() === "null" || t.toLowerCase() === "none") return undefined;
      return t;
    };
    const attributes = {
      primaryColor: clean(rawAttrs.primaryColor),
      secondaryColor: clean(rawAttrs.secondaryColor),
      theme: clean(rawAttrs.theme),
      holiday: clean(rawAttrs.holiday),
      occasion: clean(rawAttrs.occasion),
      recipient: clean(rawAttrs.recipient),
    };
    // Price hard-locked to $4.34 per user directive (matches orchestrator).
    patchItem(jobId, item.id, {
      listingCopy: { title, description, tags, price: 4.34, attributes },
      error: undefined,
    });
    return NextResponse.json({
      ok: true,
      itemId: item.id,
      tags: tags.length,
      titleChars: title.length,
      descChars: description.length,
    });
  } catch (err) {
    const msg = `retry-copy failed: ${(err as Error).message}`;
    patchItem(jobId, item.id, { error: msg });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
