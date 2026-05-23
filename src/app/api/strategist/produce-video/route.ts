// POST /api/strategist/produce-video
//
// "The agents make the video." — given a topic / niche, a Director
// agent (Gemini) writes a text-to-video prompt tuned for Etsy listing
// conventions (vertical 9:16, hands-on close-up, natural light,
// documentary-style), then we fire fal.ai and save the resulting MP4
// under /tmp/strategist-video/<id>.mp4. The browser polls
// /api/strategist/serve-video/<id> to play it.
//
// Provider: fal.ai (cheaper than Veo by ~5-25x; the lib supports
// Wan 2.2, Kling 1.6 Standard, and Kling 2 Master with cost-aware
// model selection). FAL_KEY is already in .env.local from the
// premium-convert flow. See lib/fal-video.ts for model details.
//
// This is the "Produce" mode the seller asked for: agents take the
// action, the seller doesn't have to film anything.
//
// Body: {
//   topic: string,         // e.g. "Mexican folk bird cross-stitch"
//   niche?: string,        // e.g. "cross-stitch", informs the prompt
//   durationSec?: 4|5|6|8|10, // snapped per-model in lib/fal-video.ts
//   aspectRatio?: "9:16"|"16:9"|"1:1",  // default 9:16 (vertical)
//   model?: FalVideoModel  // default kling-1.6-standard
// }
//
// Streams SSE events:
//   data: {"phase":"director","status":"thinking"}
//   data: {"phase":"director","status":"done","veoPrompt":"...","rationale":"..."}
//   data: {"phase":"veo_started","veoPrompt":"...","durationSec":5,"aspectRatio":"9:16","model":"kling-1.6-standard"}
//   data: {"phase":"veo_polling","elapsedSec":47,"queueStatus":"IN_PROGRESS"}
//   data: {"phase":"complete","videoId":"...","model":"...","estimatedCostUsd":0.25,...}
//   data: [DONE]
//
// (Field names keep the `veoPrompt` legacy from when this was Veo-
// only. Renaming would be a UI churn for no benefit; the field is
// just "the polished text-to-video prompt".)
//
// Hard rules:
//   - This NEVER lists on Etsy. The MP4 is saved locally; the seller
//     reviews it before deciding to use it on a listing.
//   - No prompts are sent to the video model without going through
//     the Director agent first — that agent strips out anything that
//     would trigger safety filters (faces in close-up, branded text,
//     etc.) and rewrites the request into model-friendly cinematic
//     language.

import { NextRequest } from "next/server";
import {
  generateFalVideo,
  FalVideoError,
  FAL_VIDEO_COST_USD,
  FAL_VIDEO_POLL_TIMEOUT_MS,
  type FalVideoModel,
} from "@/lib/fal-video";
import { callGeminiJSON, parseGeminiJSON } from "@/lib/gemini";
import { randomUUID } from "crypto";
import path from "path";

export const dynamic = "force-dynamic";
// Sized to the slowest model (Kling 2 Master ~10min p95) + Director step
// (~5s). Vercel hobby caps at 60s, pro at 300s, enterprise at 900s — the
// dev server doesn't enforce. We aim high so local renders complete
// even when fal.ai's queue is congested; cloud deploys hit the platform
// cap and surface our own timeout message before that.
export const maxDuration = 800;

interface InboundBody {
  topic?: string;
  niche?: string;
  durationSec?: number;
  aspectRatio?: "9:16" | "16:9" | "1:1";
  /** Provider-side model selection. The UI exposes a dropdown so
   *  the seller can dial up quality (Kling Master) for hero listings
   *  or down-cost (Wan 5B) for blanket A/B testing. Default is
   *  the balanced sweet spot. */
  model?: FalVideoModel;
}

interface DirectorOutput {
  veo_prompt: string;
  rationale: string;
}

const DIRECTOR_SYSTEM = `You are the DIRECTOR agent for an Etsy seller's listing-video pipeline. Your only job is to translate a seller's plain-language ask into a text-to-video prompt that produces a believable, conversion-friendly Etsy lifestyle clip. The downstream model is fal.ai (Wan 2.2, Kling 1.6, or Kling 2 Master depending on what the seller picked).

Hard rules:
- The video must show the PRODUCT being made or used, never abstract art shots.
- For cross-stitch: hands-on close-ups, natural light, hoop or fabric clearly visible, slow stitching motion. NO faces — text-to-video models are brittle on faces; hands + arms read as authentic without triggering uncanny-valley issues.
- For wall art: a finished print on a styled wall, soft camera dolly toward the art, warm interior light.
- For digital templates / spreadsheets: a laptop on a desk, screen showing the template, hand using a trackpad, cozy workspace.
- Style: documentary, cozy, warm, unhurried. No motion blur, no flashy cuts.
- Length: 4-10 seconds. The prompt should describe ONE continuous shot, not a sequence.
- Aspect: assume vertical (9:16) for Reels/TikTok unless told otherwise.
- Avoid branded text on screen, recognizable celebrity faces, or anything copyrighted.

Return JSON ONLY. The field is named "veo_prompt" for backward compatibility with the pipeline; treat it as just "the polished text-to-video prompt":
{
  "veo_prompt": "single string, ~60-150 words, describing the shot in cinematic language",
  "rationale": "one sentence on WHY this composition matches the seller's product type. Do NOT mention 'Veo' or any specific model — the seller picks the model separately."
}`;

export async function POST(req: NextRequest) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: InboundBody = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const topic = (body.topic || "").trim();
  if (!topic) {
    return new Response(JSON.stringify({ error: "Missing `topic`" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const niche = body.niche || "cross-stitch";
  const durationSec = clampDuration(body.durationSec ?? 5);
  const aspectRatio = body.aspectRatio ?? "9:16";
  // Default to Kling Standard — best $/quality balance for product
  // hand-stitching footage. The seller can dial up to Master for
  // hero listings or down to Wan 5B for cheap A/B fodder.
  const model: FalVideoModel = body.model ?? "kling-1.6-standard";

  const videoId = `vid_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const outputPath = path.join("/tmp", "strategist-video", `${videoId}.mp4`);

  // SSE plumbing — same pattern as /api/strategist/council
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      const done = () => controller.enqueue(encoder.encode(`data: [DONE]\n\n`));

      try {
        // ── Step 1: Director agent writes the text-to-video prompt ──
        send({ phase: "director", status: "thinking" });
        const directorPrompt = `${DIRECTOR_SYSTEM}

Seller's ask: "${topic}"
Niche: ${niche}
Target duration: ${durationSec}s
Target aspect: ${aspectRatio}

Write the text-to-video prompt now.`;

        const raw = await callGeminiJSON(geminiKey, directorPrompt);
        const director = parseGeminiJSON<DirectorOutput>(raw);
        if (!director.veo_prompt || typeof director.veo_prompt !== "string") {
          throw new Error("Director did not return a veo_prompt");
        }
        send({
          phase: "director",
          status: "done",
          veoPrompt: director.veo_prompt,
          rationale: director.rationale,
        });

        // ── Step 2: Fire fal.ai and stream progress ──────────────
        send({
          phase: "veo_started",
          veoPrompt: director.veo_prompt,
          durationSec,
          aspectRatio,
          model,
          estimatedCostUsd: FAL_VIDEO_COST_USD[model],
        });

        const result = await generateFalVideo({
          prompt: director.veo_prompt,
          durationSec,
          aspectRatio,
          model,
          outputPath,
          // Per-model render budget — Wan ~4min, Kling Standard ~7min,
          // Master ~10min. Without this we'd default to 5min and Master
          // (which routinely takes 6-9 min when the queue is busy)
          // would error out as "timed out, last status IN_PROGRESS"
          // even when fal.ai was about to finish.
          pollTimeoutMs: FAL_VIDEO_POLL_TIMEOUT_MS[model],
          onProgress: (elapsedMs, status) => {
            // SSE controller is async-safe; firing from inside a poll
            // tick is fine. Surface fal.ai's queue status verbatim
            // so the UI can show "queued" → "rendering" transitions.
            send({
              phase: "veo_polling",
              elapsedSec: Math.round(elapsedMs / 1000),
              queueStatus: status,
            });
          },
        });

        // ── Step 3: Final payload — videoId is what /serve-video uses ──
        send({
          phase: "complete",
          videoId,
          videoPath: result.videoPath,
          durationSec: result.durationSec,
          aspectRatio: result.aspectRatio,
          model: result.model,
          estimatedCostUsd: result.estimatedCostUsd,
          fileSizeKB: Math.round(result.fileSizeBytes / 1024),
          elapsedMs: result.elapsedMs,
          veoPrompt: director.veo_prompt,
          rationale: director.rationale,
        });
      } catch (err) {
        const e = err as Error;
        // Surface FalVideoError codes verbatim so the UI can show
        // "your FAL_KEY isn't set" or "fal.ai quota exhausted"
        // instead of a stack trace.
        const code = err instanceof FalVideoError ? err.code : "internal";
        send({ phase: "error", message: e.message || String(err), code });
      } finally {
        done();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function clampDuration(n: number): number {
  // Accept 4-10s here; lib/fal-video.ts snaps to the nearest length
  // each model actually supports (Kling: 5 or 10, Wan: 3-6). Default
  // 5 hits the cheaper Kling tier and matches the UI's 5/8/10 picker.
  if (!Number.isFinite(n)) return 5;
  return Math.max(4, Math.min(10, Math.round(n)));
}
