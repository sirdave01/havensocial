import * as oidc from 'openid-client';
import { NextRequest, NextResponse } from 'next/server';
import { getBhidConfiguration, getBhidRedirectUri } from '@/lib/bhid';
import { upsertBhidUser } from '@/lib/bhid-user';
import { getHavenSession } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const session = await getHavenSession();
  const transaction = session.oauth;
  delete session.oauth;

  const returnedState = request.nextUrl.searchParams.get('state');
  if (!transaction || !returnedState || returnedState !== transaction.state) {
    await session.save();
    return NextResponse.redirect(new URL('/login?error=oauth_state', getBhidRedirectUri()));
  }

  const providerError = request.nextUrl.searchParams.get('error');
  if (providerError) {
    await session.save();
    return NextResponse.redirect(new URL('/login?error=oauth_denied', getBhidRedirectUri()));
  }

  try {
    const config = await getBhidConfiguration();
    const tokens = await oidc.authorizationCodeGrant(config, request.nextUrl, {
      expectedState: transaction.state,
      expectedNonce: transaction.nonce,
      pkceCodeVerifier: transaction.codeVerifier,
      idTokenExpected: true,
    });

    const idTokenClaims = tokens.claims();
    if (!idTokenClaims?.sub) throw new Error('BHID did not return a signed ID token subject');

    const metadata = config.serverMetadata();
    let claims: Record<string, unknown> = { ...idTokenClaims };
    if (metadata.userinfo_endpoint && tokens.access_token) {
      const userInfo = await oidc.fetchUserInfo(config, tokens.access_token, idTokenClaims.sub);
      claims = { ...claims, ...userInfo };
    }

    const user = await upsertBhidUser(claims);
    session.userId = String(user.users_id);
    await session.save();

    return NextResponse.redirect(new URL('/feed', getBhidRedirectUri()));
  } catch (error) {
    console.error('BHID callback failed:', error);
    await session.save();
    return NextResponse.redirect(new URL('/login?error=oauth_callback', getBhidRedirectUri()));
  }
}
