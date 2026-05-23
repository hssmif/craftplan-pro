// ══════════════════════════════════════════════════════════════════════
// /api/cross-stitch/gumroad-bundle  (POST + GET)
//
// In-memory cache for the Gumroad listing handoff. The cross-stitch page
// already builds an 18MB+ ZIP bundle client-side via /api/cross-stitch/
// export-pdf. That ZIP is too big to ship through chrome.runtime.send-
// Message (~10MB practical message limit + chrome.storage.local quota
// pressure), so we cache the binary on the server under a UUID and let
// the Chrome extension's content script fetch it directly from the
// gumroad.com tab via CORS.
//
//   POST /api/cross-stitch/gumroad-bundle
//     Body: multipart/form-data { file: <zip blob>, fileName: <string> }
//     →    { ok: true, listingId, bundleUrl, expiresAt }
//
//   GET /api/cross-stitch/gumroad-bundle?id=<uuid>
//     CORS-enabled; returns the ZIP as application/zip with the original
//     filename in Content-Disposition. Returns 404 after the 1h TTL.
//
// Why CORS-enabled GET: the content script runs in the gumroad.com origin
// and needs to fetch from localhost:3461. The extension's host_permissions
// alone aren't enough — content-script fetches inherit page CORS rules.
// We send `Access-Control-Allow-Origin: *` because the cache is keyed by
// a non-guessable UUID and the ZIP is a digital pattern bundle the seller
// is about to publish publicly anyway.
//
// Storage: a process-local Map. Survives between requests but NOT across
// dev-server restarts. That's fine — the ZIP is regenerated cheaply from
// the live cross-stitch page on the next click. We expire entries after
// 1 hour so memory doesn't grow unbounded if the seller never uses them.
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

interface CachedBundle {
  buffer: Buffer;
  fileName: string;
  createdAt: number;
}

// Process-local cache. We attach to globalThis so Next.js's hot-module
// reload in dev doesn't drop the cache between edits — small UX win that
// avoids re-clicking through the cross-stitch page after every code change.
const GLOBAL_KEY = "__craftplan_gumroad_bundle_cache__";
type GlobalWithCache = typeof globalThis & {
  [GLOBAL_KEY]?: Map<string, CachedBundle>;
};
const g = globalThis as GlobalWithCache;
if (!g[GLOBAL_KEY]) {
  g[GLOBAL_KEY] = new Map<string, CachedBundle>();
}
const cache = g[GLOBAL_KEY]!;

const TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_BYTES = 100 * 1024 * 1024; // 100 MB safety cap

// Sweep expired entries. Cheap operation — runs on every request.
function sweepExpired() {
  const now = Date.now();
  for (const [id, entry] of cache.entries()) {
    if (now - entry.createdAt > TTL_MS) {
      cache.delete(id);
    }
  }
}

// CORS headers for GET. The bundle is unguessable (UUID) and meant to be
// downloaded by the extension's content script running on gumroad.com.
function corsHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    ...extra,
  };
}

// ── OPTIONS (CORS preflight) ─────────────────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// ── POST: cache a ZIP, return UUID + URL ─────────────────────────────

export async function POST(req: NextRequest) {
  sweepExpired();

  try {
    const contentType = req.headers.get("content-type") || "";

    let zipBuffer: Buffer;
    let fileName: string;

    if (contentType.includes("multipart/form-data")) {
      // Browser path: <fetch> with FormData. Most efficient for large blobs.
      const form = await req.formData();
      const file = form.get("file");
      const nameField = form.get("fileName");
      if (!(file instanceof Blob)) {
        return NextResponse.json(
          { ok: false, error: "Missing 'file' field" },
          { status: 400, headers: corsHeaders() },
        );
      }
      const arrayBuffer = await file.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_BYTES) {
        return NextResponse.json(
          { ok: false, error: `File too large (max ${MAX_BYTES} bytes)` },
          { status: 413, headers: corsHeaders() },
        );
      }
      zipBuffer = Buffer.from(arrayBuffer);
      fileName =
        (typeof nameField === "string" && nameField.trim()) ||
        (file instanceof File ? file.name : null) ||
        "bundle.zip";
    } else if (contentType.includes("application/json")) {
      // JSON path: { fileBase64, fileName }. Used when callers can't easily
      // build a multipart body (some test scripts).
      const body = (await req.json()) as {
        fileBase64?: string;
        fileName?: string;
      };
      if (!body.fileBase64) {
        return NextResponse.json(
          { ok: false, error: "Missing 'fileBase64' field" },
          { status: 400, headers: corsHeaders() },
        );
      }
      zipBuffer = Buffer.from(body.fileBase64, "base64");
      if (zipBuffer.byteLength > MAX_BYTES) {
        return NextResponse.json(
          { ok: false, error: `File too large (max ${MAX_BYTES} bytes)` },
          { status: 413, headers: corsHeaders() },
        );
      }
      fileName = body.fileName || "bundle.zip";
    } else {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Unsupported content-type. Use multipart/form-data or application/json.",
        },
        { status: 415, headers: corsHeaders() },
      );
    }

    // Generate an unguessable cache key and store.
    const listingId = crypto.randomUUID();
    cache.set(listingId, {
      buffer: zipBuffer,
      fileName,
      createdAt: Date.now(),
    });

    // The extension content script (running on gumroad.com) needs an
    // absolute URL to fetch from. Construct from the request origin so
    // dev (localhost:3461) and prod both work without env vars.
    const origin =
      req.headers.get("origin") ||
      `${req.nextUrl.protocol}//${req.nextUrl.host}`;
    const bundleUrl = `${origin}/api/cross-stitch/gumroad-bundle?id=${listingId}`;

    return NextResponse.json(
      {
        ok: true,
        listingId,
        bundleUrl,
        sizeBytes: zipBuffer.byteLength,
        fileName,
        expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
      },
      { headers: corsHeaders() },
    );
  } catch (err) {
    console.error("[gumroad-bundle] POST failed:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500, headers: corsHeaders() },
    );
  }
}

// ── GET: return the cached ZIP (CORS-enabled for content-script use) ──

export async function GET(req: NextRequest) {
  sweepExpired();

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Missing 'id' query param" },
      { status: 400, headers: corsHeaders() },
    );
  }

  const entry = cache.get(id);
  if (!entry) {
    return NextResponse.json(
      { ok: false, error: "Bundle not found or expired" },
      { status: 404, headers: corsHeaders() },
    );
  }

  // Wrap the Node Buffer's bytes in a Blob. NextResponse's BodyInit type
  // accepts Blob across all runtimes (edge / node), unlike a bare
  // Uint8Array which TS rejects in Next.js 16. We copy into a fresh
  // ArrayBuffer rather than slicing to dodge TS's SharedArrayBuffer
  // ambiguity on Buffer.buffer.
  const fresh = new Uint8Array(entry.buffer.byteLength);
  fresh.set(entry.buffer);
  const blob = new Blob([fresh.buffer], { type: "application/zip" });

  return new NextResponse(blob, {
    status: 200,
    headers: corsHeaders({
      "Content-Type": "application/zip",
      "Content-Length": String(entry.buffer.byteLength),
      "Content-Disposition": `attachment; filename="${entry.fileName.replace(
        /"/g,
        "",
      )}"`,
      // Don't let the browser cache the ZIP — once the seller publishes,
      // re-fetching is a wasted round-trip. Cache-busting also helps if
      // they edit and re-list.
      "Cache-Control": "no-store, no-cache, must-revalidate",
    }),
  });
}
