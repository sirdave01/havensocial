import * as oidc from 'openid-client';
import { NextResponse } from 'next/server';
import { getBhidConfiguration, getBhidRedirectUri } from '@/lib/bhid';
import { getHavenSession } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await getHavenSession();
  if (session.userId) {
    return NextResponse.redirect(new URL('/feed', getBhidRedirectUri()));
  }

  const config = await getBhidConfiguration();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();

  session.oauth = { state, nonce, codeVerifier };
  await session.save();

  const parameters = new URLSearchParams({
    redirect_uri: getBhidRedirectUri(),
    scope: process.env.BHID_SCOPES || 'openid profile email verification',
    response_type: 'code',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });

  return NextResponse.redirect(oidc.buildAuthorizationUrl(config, parameters));
}
