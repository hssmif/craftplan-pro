// GET /api/cross-stitch/pipeline/[id]
//   → Returns current state of a server-side auto-pipeline job.
//     Client polls this every 2s to render progress.
//     Default response is SLIM (text + flags only, ~2 KB).
//     Pass ?full=true for the one-shot rehydration that needs the
//     base64 blobs (~100 MB for 5 items).  Polling MUST stay slim —
//     before this split the 2 s loop hit /[id] for 100 MB each tick
//     and OOM'd the browser tab within seconds.
//     Pass ?item=<itemId>&full=true to lazy-load a single item's
//     heavy data (mockup thumbnails, video) on demand.
//
// DELETE /api/cross-stitch/pipeline/[id]
//   → Requests cancellation.  The orchestrator checks
//     cancel_requested between every item and exits cleanly.
//
// PATCH /api/cross-stitch/pipeline/[id]
//   → Mutates items in-place (e.g., remove one item after publishing
//     to Etsy, or clear the whole queue).  Body: { items: [...] }
//     OR { delete: true }.
import { NextRequest, NextResponse } from "next/server";
import { getJob, requestCancel, deleteJob, updateJob, slimJob } from "@/lib/auto-pipeline-jobs";
import { resumeJob } from "@/lib/auto-pipeline-orchestrator";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status === "queued" || job.status === "running") {
    resumeJob(job.id);
  }
  const full = req.nextUrl.searchParams.get("full") === "true";
  const itemId = req.nextUrl.searchParams.get("item");
  // Single-item lazy load: ?item=<id>&full=true returns just that
  // one item with its base64 blobs populated.  Used to fetch a
  // mockup thumbnail after slim polling shows it's ready.
  if (itemId) {
    // Item IDs may be numbers (DB) or strings (UUIDs from older runs) —
    // compare as strings so both kinds match.
    const item = job.items.find((it) => String(it.id) === String(itemId));
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    return NextResponse.json({ item: full ? item : slimJob({ ...job, items: [item] }).items[0] });
  }
  return NextResponse.json({ job: full ? job : slimJob(job) });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ok = requestCancel(id);
  if (!ok) {
    return NextResponse.json({ error: "Job not found or already complete" }, { status: 404 });
  }
  return NextResponse.json({ cancelRequested: true });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    items?: unknown;
    delete?: boolean;
  };

  // Full delete — used when user clicks "Clear" on the panel.
  if (body.delete === true) {
    const removed = deleteJob(id);
    return NextResponse.json({ deleted: removed });
  }

  // Items replace — used when client removes a single listed item
  // (auto-removed after Etsy publish succeeds).
  if (Array.isArray(body.items)) {
    updateJob(id, { items: body.items as never });
    const job = getJob(id);
    return NextResponse.json({ job });
  }

  return NextResponse.json({ error: "PATCH body must include items[] or delete:true" }, { status: 400 });
}
