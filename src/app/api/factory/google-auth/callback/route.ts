// ══════════════════════════════════════════════════════════════
// Factory — Google OAuth Callback
// GET /api/factory/google-auth/callback?code=xxx
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import fs from "fs";
import path from "path";

const CLIENT_SECRET_PATH = path.join(process.env.HOME || "", ".config/gws/client_secret.json");
const TOKEN_PATH = path.join(process.env.HOME || "", ".config/gws/node_tokens.json");

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

function htmlPage(title: string, body: string, kind: "success" | "error" = "success") {
  const color = kind === "success" ? "#22c55e" : "#ef4444";
  const bg = kind === "success" ? "#0a1f12" : "#1f0a0a";
  return `<!DOCTYPE html>
<html><head><title>${title}</title><style>
  body { background:${bg}; color:#e5e7eb; font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif; padding:48px; max-width:640px; margin:0 auto; }
  h1 { color:${color}; font-size:28px; margin:0 0 12px; }
  p { font-size:14px; line-height:1.6; color:#9ca3af; }
  code { background:#1f2937; padding:2px 6px; border-radius:4px; font-size:12px; }
  .panel { background:#0f1117; border:1px solid #1f2937; border-radius:12px; padding:24px; margin-top:16px; }
</style></head>
<body>
  <div class="panel"><h1>${title}</h1>${body}</div>
  <script>
    // Auto-close window if opened from a popup, OR redirect after 2s
    setTimeout(() => {
      if (window.opener) {
        try { window.opener.postMessage({ type: 'gws-auth-${kind}' }, '*'); } catch (e) {}
        window.close();
      } else {
        window.location.href = '/factory';
      }
    }, ${kind === "success" ? 1500 : 4000});
  </script>
</body></html>`;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return new NextResponse(
      htmlPage("Authorization denied", `<p>Google returned: <code>${error}</code></p><p>This window will redirect to the factory in a few seconds.</p>`, "error"),
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }

  if (!code) {
    return new NextResponse(
      htmlPage("Missing authorization code", `<p>The callback was hit without an OAuth code. Go back to the factory and try again.</p>`, "error"),
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }

  const cs = loadClientSecret();
  if (!cs) {
    return new NextResponse(
      htmlPage("OAuth client not configured", `<p>Missing <code>~/.config/gws/client_secret.json</code>.</p>`, "error"),
      { status: 500, headers: { "Content-Type": "text/html" } }
    );
  }

  const url = new URL(req.url);
  const redirectUri = `${url.protocol}//${url.host}/api/factory/google-auth/callback`;

  try {
    const oAuth2 = new google.auth.OAuth2(cs.client_id, cs.client_secret, redirectUri);
    const { tokens } = await oAuth2.getToken(code);

    if (!tokens.refresh_token) {
      // Google only returns refresh_token on first consent. If user re-auths
      // without revoking first, we get only access_token. Merge with existing
      // refresh_token if we have one.
      let existing: Record<string, unknown> = {};
      if (fs.existsSync(TOKEN_PATH)) {
        try { existing = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8")); } catch { /* ignore */ }
      }
      if (!existing.refresh_token) {
        return new NextResponse(
          htmlPage(
            "No refresh token returned",
            `<p>Google didn't return a refresh token. Visit <a href="https://myaccount.google.com/permissions" style="color:#60a5fa">Google Account → Connections</a>, revoke this app's access, then try again.</p>`,
            "error"
          ),
          { status: 400, headers: { "Content-Type": "text/html" } }
        );
      }
      // Merge: keep existing refresh_token, update access_token + expiry
      const merged = { ...existing, ...tokens };
      fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    } else {
      fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    }

    const expiresInMin = tokens.expiry_date
      ? Math.round((tokens.expiry_date - Date.now()) / 60000)
      : "?";

    return new NextResponse(
      htmlPage(
        "✓ Google connected",
        `<p>Tokens saved to <code>~/.config/gws/node_tokens.json</code>.<br>Access valid for ~${expiresInMin} minutes (refresh token will keep it alive).</p><p>You can close this window — the factory will auto-detect the new tokens.</p>`,
        "success"
      ),
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("[google-auth/callback] failed:", msg);
    return new NextResponse(
      htmlPage(
        "Token exchange failed",
        `<p>Google returned an error during token exchange:</p><p><code>${msg}</code></p>`,
        "error"
      ),
      { status: 500, headers: { "Content-Type": "text/html" } }
    );
  }
}
