// ══════════════════════════════════════════════════════════════
// Factory — In-app Google OAuth flow
//
// GET /api/factory/google-auth?action=status
//   → { configured, valid, expiresAt }
//
// GET /api/factory/google-auth?action=start
//   → 302 redirect to Google's consent screen
//
// GET /api/factory/google-auth/callback?code=xxx
//   → Receives the OAuth code, exchanges for tokens, writes to
//     ~/.config/gws/node_tokens.json, then redirects back to the app.
//
// Removes the need to drop into the terminal and run gws-oauth-helper.mjs.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import fs from "fs";
import path from "path";

const CLIENT_SECRET_PATH = path.join(process.env.HOME || "", ".config/gws/client_secret.json");
const TOKEN_PATH = path.join(process.env.HOME || "", ".config/gws/node_tokens.json");

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
];

function loadClientSecret(): { client_id: string; client_secret: string } | null {
  if (!fs.existsSync(CLIENT_SECRET_PATH)) return null;
  try {
    const content = JSON.parse(fs.readFileSync(CLIENT_SECRET_PATH, "utf8"));
    const { client_id, client_secret } = content.installed || content.web || {};
    if (!client_id || !client_secret) return null;
    return { client_id, client_secret };
  } catch {
    return null;
  }
}

function getRedirectUri(req: NextRequest): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}/api/factory/google-auth/callback`;
}

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action") || "status";

  // ── STATUS — used by the UI to decide whether to show "Connect" ──
  if (action === "status") {
    const cs = loadClientSecret();
    if (!cs) {
      return NextResponse.json({
        configured: false,
        valid: false,
        reason: "client_secret.json missing",
      });
    }

    if (!fs.existsSync(TOKEN_PATH)) {
      return NextResponse.json({ configured: true, valid: false, reason: "no tokens" });
    }

    try {
      const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
      const expiresAt = tokens.expiry_date as number | undefined;
      const isExpired = !expiresAt || expiresAt < Date.now();

      // Try a silent refresh if we have a refresh_token
      if (isExpired && tokens.refresh_token) {
        const oAuth2 = new google.auth.OAuth2(cs.client_id, cs.client_secret);
        oAuth2.setCredentials(tokens);
        try {
          const { credentials } = await oAuth2.refreshAccessToken();
          fs.writeFileSync(
            TOKEN_PATH,
            JSON.stringify({ ...tokens, ...credentials }, null, 2)
          );
          return NextResponse.json({
            configured: true,
            valid: true,
            refreshed: true,
            expiresAt: credentials.expiry_date,
          });
        } catch (refreshErr) {
          // Refresh token revoked — needs full re-auth
          return NextResponse.json({
            configured: true,
            valid: false,
            reason: "refresh failed — re-auth required",
            error: refreshErr instanceof Error ? refreshErr.message : "unknown",
          });
        }
      }

      return NextResponse.json({
        configured: true,
        valid: !isExpired,
        expiresAt,
      });
    } catch {
      return NextResponse.json({ configured: true, valid: false, reason: "tokens unreadable" });
    }
  }

  // ── START — 302 to Google consent page ──
  if (action === "start") {
    const cs = loadClientSecret();
    if (!cs) {
      return NextResponse.json(
        { error: "client_secret.json missing — set up OAuth client in Google Cloud Console first" },
        { status: 500 }
      );
    }

    const redirectUri = getRedirectUri(req);
    const oAuth2 = new google.auth.OAuth2(cs.client_id, cs.client_secret, redirectUri);
    const authUrl = oAuth2.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: SCOPES,
    });

    return NextResponse.redirect(authUrl);
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
