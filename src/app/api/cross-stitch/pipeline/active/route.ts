// GET /api/cross-stitch/pipeline/active
//
// Returns the most-recent auto-pipeline job (within last 24h) so the
// client can rehydrate the UI on page load without needing to know the
// job_id.  Falls back to 404 when no recent job exists.
//
// Default response is SLIM (text + flags only, ~2 KB).  Pass ?full=true
// to include the base64 mockups / video / pattern grid (~100 MB for
// 5 items — only safe for one-shot fetches, never polling).  See
// lib/auto-pipeline-jobs.ts → slimJob for the full rationale.
//
// Also opportunistically prunes any job >72h old so the table stays
// small over time.
import { NextRequest, NextResponse } from "next/server";
import { getMostRecentJob, pruneOldJobs, slimJob } from "@/lib/auto-pipeline-jobs";
import { resumeJob } from "@/lib/auto-pipeline-orchestrator";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // Opportunistic cleanup — cheap, runs on each rehydrate poll.
  try { pruneOldJobs(72); } catch { /* non-fatal */ }

  const job = getMostRecentJob();
  if (!job) {
    return NextResponse.json({ job: null }, { status: 200 });
  }
  const full = req.nextUrl.searchParams.get("full") === "true";
  if (job.status === "queued" || job.status === "running") {
    resumeJob(job.id);
  }
  return NextResponse.json({ job: full ? job : slimJob(job) });
}
