import * as oidc from 'openid-client';
import { NextRequest, NextResponse } from 'next/server';
import { getBhidConfiguration, getBhidRedirectUri, getHavenSocialOrigin } from '@/lib/bhid';
import { upsertBhidUser } from '@/lib/bhid-user';
import { resolveBhidProfileWithDiagnostic, BhidUserInfoError } from '@/lib/bhid/profile';
import { createAppSession, getHavenSession } from '@/lib/session';

export const runtime = 'nodejs';

function safeProviderErrorCode(value: string) {
  return /^[a-zA-Z0-9._-]{1,64}$/.test(value) ? value : 'unrecognized';
}

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
    const errorCode = safeProviderErrorCode(providerError);
    console.warn('BHID authorization failed:', { code: errorCode });
    await session.save();
    const loginError = errorCode === 'invalid_scope'
      ? 'invalid_scope'
      : errorCode === 'access_denied'
        ? 'oauth_denied'
        : 'oauth_provider_error';
    return NextResponse.redirect(new URL(`/login?error=${loginError}`, getHavenSocialOrigin()));
  }

  let callbackStage = 'configuration';
  try {
    const config = await getBhidConfiguration();
    const callbackUrl = new URL(getBhidRedirectUri());
    request.nextUrl.searchParams.forEach((value, key) => {
      callbackUrl.searchParams.set(key, value);
    });
    callbackStage = 'token_exchange';
    const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
      expectedState: transaction.state,
      expectedNonce: transaction.nonce,
      pkceCodeVerifier: transaction.codeVerifier,
      idTokenExpected: true,
    });

    callbackStage = 'id_token_validation';
    const idTokenClaims = tokens.claims();
    if (!idTokenClaims?.sub) throw new Error('BHID did not return a signed ID token subject');

    callbackStage = 'userinfo';
    const { diagnostic } = await resolveBhidProfileWithDiagnostic(
      config,
      tokens.access_token,
      idTokenClaims.sub,
    );
    if (process.env.NODE_ENV !== 'production') {
      console.info('BHID UserInfo diagnostic:', diagnostic);
    }

    callbackStage = 'user_provisioning';
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
    callbackStage = 'app_session_creation';
    session.appSessionToken = await createAppSession(
      user.users_id,
      tokens.access_token,
      accessTokenExpiresAt,
    );
    callbackStage = 'session_persistence';
    await session.save();

    return NextResponse.redirect(new URL('/feed', getHavenSocialOrigin()));
  } catch (error) {
    if (error instanceof BhidUserInfoError && process.env.NODE_ENV !== 'production') {
      console.warn('BHID UserInfo diagnostic:', error.diagnostic);
    } else {
      const errorCode = typeof error === 'object' && error !== null && 'code' in error
        && typeof error.code === 'string' && /^[a-zA-Z0-9._-]{1,64}$/.test(error.code)
        ? error.code
        : undefined;
      console.error('BHID callback failed:', {
        stage: callbackStage,
        errorName: error instanceof Error ? error.name : 'NonError',
        ...(errorCode ? { errorCode } : {}),
      });
    }
    await session.save();
    return NextResponse.redirect(new URL('/login?error=oauth_callback', getHavenSocialOrigin()));
  }
}
