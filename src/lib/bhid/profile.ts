import * as oidc from 'openid-client';
import type { UserInfoResponse } from 'openid-client';
import { db } from '../../models/db.js';
import { getHavenSession, hashAppSessionToken } from '../session';
import { getBhidConfiguration } from '../bhid';
import { decryptBhidAccessToken } from './token-vault';

export type BhidProfile = {
  sub: string;
  name?: string;
  preferredUsername?: string;
  picture?: string;
  bio?: string;
  verification?: {
    level?: string;
    tier?: string;
  };
};

function stringClaim(userInfo: UserInfoResponse, claim: string) {
  const value = userInfo[claim];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function profileFromUserInfo(userInfo: UserInfoResponse): BhidProfile {
  const picture = stringClaim(userInfo, 'picture');
  let safePicture: string | undefined;
  if (picture) {
    try {
      const url = new URL(picture);
      if (url.protocol === 'https:') safePicture = url.href;
    } catch {
      safePicture = undefined;
    }
  }

  const level = stringClaim(userInfo, 'verification_level');
  const tier = stringClaim(userInfo, 'verification_tier');
  const verification = level || tier
    ? { level, tier }
    : undefined;

  return {
    sub: userInfo.sub,
    name: stringClaim(userInfo, 'name'),
    preferredUsername: stringClaim(userInfo, 'preferred_username'),
    picture: safePicture,
    bio: stringClaim(userInfo, 'bio'),
    verification,
  };
}

export async function resolveBhidProfile(
  config: oidc.Configuration,
  accessToken: string,
  expectedSubject: string,
): Promise<BhidProfile> {
  const userInfo = await oidc.fetchUserInfo(config, accessToken, expectedSubject);
  if (userInfo.sub !== expectedSubject) {
    throw new Error('BHID UserInfo subject does not match the verified ID token subject');
  }
  return profileFromUserInfo(userInfo);
}

export async function getCurrentBhidProfile(expectedSubject: string) {
  const session = await getHavenSession();
  if (!session.appSessionToken) return null;

  const result = await db.query(
    `SELECT s.session_id, s.bhid_access_token_enc, s.bhid_access_token_expires_at
     FROM app_sessions s
     JOIN users u ON u.users_id = s.user_id
     WHERE s.session_token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > CURRENT_TIMESTAMP
       AND u.app_status = 'ACTIVE'
       AND u.bhid_sub = $2`,
    [hashAppSessionToken(session.appSessionToken), expectedSubject],
  );
  const row = result.rows[0];
  if (!row?.bhid_access_token_enc) return null;

  if (
    row.bhid_access_token_expires_at &&
    new Date(row.bhid_access_token_expires_at).valueOf() <= Date.now()
  ) {
    await db.query(
      `UPDATE app_sessions
       SET bhid_access_token_enc = NULL, bhid_access_token_expires_at = NULL
       WHERE session_id = $1`,
      [row.session_id],
    );
    return null;
  }

  const accessToken = decryptBhidAccessToken(row.bhid_access_token_enc, row.session_id);
  const config = await getBhidConfiguration();
  try {
    return await resolveBhidProfile(config, accessToken, expectedSubject);
  } catch (error) {
    if (error instanceof oidc.ResponseBodyError) {
      console.error('BHID UserInfo request failed:', {
        status: error.status,
        code: error.error,
      });
      if (error.status === 401) {
        await db.query(
          `UPDATE app_sessions
           SET bhid_access_token_enc = NULL, bhid_access_token_expires_at = NULL
           WHERE session_id = $1`,
          [row.session_id],
        );
      }
      return null;
    }
    throw error;
  }
}
