import { NextResponse } from 'next/server';
import { generateCodeVerifier, getAuthUrl } from '@/lib/etsy-auth';
import { cookies } from 'next/headers';

export async function GET() {
  const codeVerifier = generateCodeVerifier();
  const authUrl = getAuthUrl(codeVerifier);

  // Store code verifier in a cookie for the callback
  const cookieStore = await cookies();
  cookieStore.set('etsy_code_verifier', codeVerifier, {
    httpOnly: true,
    secure: false, // localhost
    maxAge: 600, // 10 minutes
    path: '/',
  });

  // Debug log so we can confirm exactly which redirect_uri is in
  // play when chasing port-mismatch / whitelist-mismatch bugs.  The
  // authUrl contains the redirect_uri param URL-encoded; grep the
  // dev-server log for "[etsy/auth] redirecting to:" after a click.
  console.log('[etsy/auth] redirecting to:', authUrl);

  // Server-side 302 redirect to Etsy's consent page.  This is the only
  // shape that keeps the etsy_code_verifier cookie in scope for the
  // /callback round-trip — returning JSON forces the client to do a
  // separate navigation, by which time the cookie is decoupled from
  // the OAuth flow and Etsy's callback fails with `no_verifier`.
  return NextResponse.redirect(authUrl);
}
