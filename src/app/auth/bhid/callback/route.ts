import * as oidc from 'openid-client';
import { NextRequest, NextResponse } from 'next/server';
import { getBhidConfiguration, getBhidRedirectUri, getHavenSocialOrigin } from '@/lib/bhid';
import { upsertBhidUser } from '@/lib/bhid-user';
import { resolveBhidProfile } from '@/lib/bhid/profile';
import { createAppSession, getHavenSession } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const session = await getHavenSession();
  const transaction = session.oauth;
  delete session.oauth;

  const returnedState = request.nextUrl.searchParams.get('state');
  if (!transaction || !returnedState || returnedState !== transaction.state) {
    await session.save();
    return NextResponse.redirect(new URL('/login?error=oauth_state', getHavenSocialOrigin()));
  }

  const providerError = request.nextUrl.searchParams.get('error');
  if (providerError) {
    await session.save();
    return NextResponse.redirect(new URL('/login?error=oauth_denied', getHavenSocialOrigin()));
  }

  try {
    const config = await getBhidConfiguration();
    const callbackUrl = new URL(getBhidRedirectUri());
    request.nextUrl.searchParams.forEach((value, key) => {
      callbackUrl.searchParams.set(key, value);
    });
    const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
      expectedState: transaction.state,
      expectedNonce: transaction.nonce,
      pkceCodeVerifier: transaction.codeVerifier,
      idTokenExpected: true,
    });

    const idTokenClaims = tokens.claims();
    if (!idTokenClaims?.sub) throw new Error('BHID did not return a signed ID token subject');

    await resolveBhidProfile(config, tokens.access_token, idTokenClaims.sub);

    const user = await upsertBhidUser(idTokenClaims.sub);
    if (user.app_status !== 'ACTIVE') {
      await session.save();
      return NextResponse.redirect(
        new URL('/login?error=account_unavailable', getHavenSocialOrigin()),
      );
    }

    const expiresIn = tokens.expiresIn();
    const accessTokenExpiresAt = expiresIn === undefined
      ? null
      : new Date(Date.now() + expiresIn * 1000);
    session.appSessionToken = await createAppSession(
      user.users_id,
      tokens.access_token,
      accessTokenExpiresAt,
    );
    await session.save();

    return NextResponse.redirect(new URL('/feed', getHavenSocialOrigin()));
  } catch (error) {
    console.error('BHID callback failed:', error);
    await session.save();
    return NextResponse.redirect(new URL('/login?error=oauth_callback', getHavenSocialOrigin()));
  }
}
