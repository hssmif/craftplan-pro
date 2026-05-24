// ══════════════════════════════════════════════════════════════
// Google OAuth2 Authentication Helper
//
// Provides authenticated Google API clients using stored tokens.
// Tokens are stored as plaintext JSON (no keyring dependency).
//
// Token path: ~/.config/gws/node_tokens.json
// Client secret: ~/.config/gws/client_secret.json
// ══════════════════════════════════════════════════════════════

import { google } from "googleapis";
import fs from "fs";
import path from "path";

const CLIENT_SECRET_PATH = path.join(
  process.env.HOME || "",
  ".config/gws/client_secret.json"
);
const TOKEN_PATH = path.join(
  process.env.HOME || "",
  ".config/gws/node_tokens.json"
);

/**
 * Returns an authenticated OAuth2 client for Google APIs.
 * Automatically refreshes expired tokens.
 *
 * Prerequisites:
 *   - ~/.config/gws/client_secret.json must exist (OAuth client)
 *   - ~/.config/gws/node_tokens.json must exist (run scripts/gws-oauth-helper.mjs first)
 *
 * @throws Error if client_secret.json or tokens are missing
 */
export async function getGoogleAuthClient(): Promise<InstanceType<typeof google.auth.OAuth2>> {
  if (!fs.existsSync(CLIENT_SECRET_PATH)) {
    throw new Error(
      `Google OAuth client_secret.json not found at ${CLIENT_SECRET_PATH}. ` +
        `Download it from Google Cloud Console → APIs & Services → Credentials.`
    );
  }

  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(
      `Google OAuth tokens not found at ${TOKEN_PATH}. ` +
        `Run 'node scripts/gws-oauth-helper.mjs' first to authenticate.`
    );
  }

  const content = JSON.parse(fs.readFileSync(CLIENT_SECRET_PATH, "utf8"));
  const { client_id, client_secret } = content.installed;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    "http://localhost:3333"
  );

  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
  oAuth2Client.setCredentials(tokens);

  // Refresh if expired
  if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
    console.log("[GoogleAuth] Refreshing expired token...");
    const { credentials } = await oAuth2Client.refreshAccessToken();
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(credentials, null, 2));
    oAuth2Client.setCredentials(credentials);
  }

  return oAuth2Client;
}

/**
 * Returns authenticated Google Sheets and Drive API instances.
 */
export async function getGoogleApis() {
  const auth = await getGoogleAuthClient();
  return {
    auth,
    sheets: google.sheets({ version: "v4", auth }),
    drive: google.drive({ version: "v3", auth }),
  };
}

/**
 * Check if Google OAuth is configured (tokens + client secret exist).
 * Does NOT validate tokens — just checks file existence.
 */
export function isGoogleAuthConfigured(): boolean {
  return fs.existsSync(CLIENT_SECRET_PATH) && fs.existsSync(TOKEN_PATH);
}
