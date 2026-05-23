import crypto from 'crypto';
import { getEtsyTokens, saveEtsyTokens } from './db';

const ETSY_API_URL = 'https://openapi.etsy.com/v3';

// Set these in .env.local
const CLIENT_ID = process.env.ETSY_CLIENT_ID || '';
const SHARED_SECRET = process.env.ETSY_SHARED_SECRET || '';
const REDIRECT_URI = process.env.ETSY_REDIRECT_URI || 'http://localhost:3461/api/etsy/callback';

// Etsy v3 requires x-api-key in the form "keystring:shared_secret" for
// authenticated requests.  Bare CLIENT_ID was rejected with a misleading
// "Shared secret is required in x-api-key header." 403; the colon-joined
// form is the form Etsy actually accepts.  Fall back to bare CLIENT_ID
// when the shared secret is absent so older .env.local setups keep
// working.  Same fix that landed in src/lib/etsy-research.ts under
// commit 0383d35.
const API_KEY_HEADER = SHARED_SECRET ? `${CLIENT_ID}:${SHARED_SECRET}` : CLIENT_ID;

// PKCE helpers
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export function getAuthUrl(codeVerifier: string): string {
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    // Scopes 2026-05-17:
    //   listings_w / listings_r — required for creating + reading listings
    //   shops_r / shops_w — required for reading + WRITING shop-level
    //     fields (sections, announcement, sale_message).  Added shops_w
    //     so the SEO setup route can create shop sections and update
    //     the about/announcement banner.
    //   transactions_r — needed for ranking telemetry to read sale signals
    // After changing scope, the user must RECONNECT their Etsy account
    // via /api/etsy/connect → /etsy-connect page so the token re-mints
    // with the new scope set.
    scope: 'listings_w listings_r shops_r shops_w transactions_r',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `https://www.etsy.com/oauth/connect?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const response = await fetch(`${ETSY_API_URL}/public/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json();
}

export async function refreshAccessToken(): Promise<string> {
  const tokens = getEtsyTokens();
  if (!tokens) throw new Error('No Etsy tokens found. Please connect your Etsy account first.');

  // If token hasn't expired yet, return it
  if (Date.now() < tokens.expires_at - 60000) {
    return tokens.access_token;
  }

  const response = await fetch(`${ETSY_API_URL}/public/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: tokens.refresh_token,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = await response.json();

  saveEtsyTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    shop_id: tokens.shop_id,
  });

  return data.access_token;
}

export async function getValidToken(): Promise<string> {
  return refreshAccessToken();
}

export function getClientId(): string {
  return CLIENT_ID;
}

/** Returns the full x-api-key header value (keystring:shared_secret for
 *  apps with a shared secret).  Use this for any v3 API call's
 *  `x-api-key` header — do NOT pass getClientId() there alone, Etsy
 *  will return 403 "Shared secret is required in x-api-key header." */
export function getApiKeyHeader(): string {
  return API_KEY_HEADER;
}
