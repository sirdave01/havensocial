import * as oidc from 'openid-client';
import { NextResponse } from 'next/server';
import { getBhidConfiguration, getBhidRedirectUri, getHavenSocialOrigin } from '@/lib/bhid';
import { getLinkedUser } from '@/lib/linked-user';
import { getHavenSession } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET() {
  if (await getLinkedUser()) {
    return NextResponse.redirect(new URL('/feed', getHavenSocialOrigin()));
  }

  const session = await getHavenSession();
  const config = await getBhidConfiguration();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();

  session.oauth = { state, nonce, codeVerifier };
  await session.save();

  const parameters = new URLSearchParams({
    redirect_uri: getBhidRedirectUri(),
    scope: 'openid profile name preferred_username picture bio verification',
    response_type: 'code',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });

  return NextResponse.redirect(oidc.buildAuthorizationUrl(config, parameters));
}
