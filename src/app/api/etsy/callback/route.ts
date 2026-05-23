import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/etsy-auth';
import { saveEtsyTokens } from '@/lib/db';
import { getShopInfo } from '@/lib/etsy-client';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/settings?error=no_code', request.url));
  }

  try {
    const cookieStore = await cookies();
    const codeVerifier = cookieStore.get('etsy_code_verifier')?.value;

    if (!codeVerifier) {
      return NextResponse.redirect(new URL('/settings?error=no_verifier', request.url));
    }

    // Exchange code for tokens
    const tokenData = await exchangeCodeForTokens(code, codeVerifier);

    // Save tokens temporarily to fetch shop info
    saveEtsyTokens({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + tokenData.expires_in * 1000,
      shop_id: null,
    });

    // Get shop info
    const shop = await getShopInfo();

    // Save tokens with shop ID
    saveEtsyTokens({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + tokenData.expires_in * 1000,
      shop_id: String(shop.shop_id),
    });

    // Clean up cookie
    cookieStore.delete('etsy_code_verifier');

    return NextResponse.redirect(new URL(`/settings?connected=true&shop=${shop.shop_name}`, request.url));
  } catch (error) {
    console.error('Etsy OAuth callback error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.redirect(new URL(`/settings?error=${encodeURIComponent(message)}`, request.url));
  }
}
