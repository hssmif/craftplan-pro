/**
 * OAuth Helper — Gets a Google access token using the client_secret.json
 * Stores refresh token in a plain JSON file (no keyring).
 *
 * Usage:
 *   node scripts/gws-oauth-helper.mjs
 *   → Opens browser, you approve, tokens saved to ~/.config/gws/node_tokens.json
 */
import { google } from 'googleapis';
import fs from 'fs';
import http from 'http';
import { execSync } from 'child_process';
import path from 'path';

const CLIENT_SECRET_PATH = path.join(process.env.HOME, '.config/gws/client_secret.json');
const TOKEN_PATH = path.join(process.env.HOME, '.config/gws/node_tokens.json');

export async function getAuthClient() {
  const content = JSON.parse(fs.readFileSync(CLIENT_SECRET_PATH, 'utf8'));
  const { client_id, client_secret, redirect_uris } = content.installed;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333');

  // Check for existing tokens
  if (fs.existsSync(TOKEN_PATH)) {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oAuth2Client.setCredentials(tokens);

    // Check if token needs refresh
    if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
      console.log('🔄 Refreshing expired token...');
      const { credentials } = await oAuth2Client.refreshAccessToken();
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(credentials, null, 2));
      oAuth2Client.setCredentials(credentials);
    }

    return oAuth2Client;
  }

  // No tokens — do interactive OAuth
  console.log('🔐 No saved tokens. Starting OAuth flow...');
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });

  // Start a local server to catch the callback
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost:3333');
      const code = url.searchParams.get('code');
      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>✅ Authorization successful!</h1><p>You can close this tab and go back to your terminal.</p>');
        server.close();
        resolve(code);
      } else {
        res.writeHead(400);
        res.end('Missing code parameter');
      }
    });

    server.listen(3333, () => {
      console.log('🌐 Opening browser for authorization...');
      try {
        execSync(`open "${authUrl}"`);
      } catch {
        console.log(`Open this URL in your browser:\n${authUrl}`);
      }
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error('Port 3333 is in use. Close the process using it and try again.'));
      } else {
        reject(err);
      }
    });

    // Timeout after 2 minutes
    setTimeout(() => { server.close(); reject(new Error('OAuth timeout')); }, 120000);
  });

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log('✅ Tokens saved to', TOKEN_PATH);

  return oAuth2Client;
}

// If run directly, just authenticate
if (import.meta.url === `file://${process.argv[1]}`) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });
  const about = await drive.about.get({ fields: 'user' });
  console.log('✅ Authenticated as:', about.data.user.displayName, `(${about.data.user.emailAddress})`);
}
