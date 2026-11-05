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
};

export type BhidUserInfoDiagnostic = {
  httpStatus: number;
  succeeded: boolean;
  subjectMatches: boolean;
  claimNames: string[];
  picturePresent: boolean;
  namePresent: boolean;
  preferredUsernamePresent: boolean;
  bioPresent: boolean;
  verificationPresent: boolean;
};

export class BhidUserInfoError extends Error {
  constructor(readonly diagnostic: BhidUserInfoDiagnostic) {
    super('BHID UserInfo request failed');
    this.name = 'BhidUserInfoError';
  }
}

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

  return {
    sub: userInfo.sub,
    name: stringClaim(userInfo, 'name'),
    preferredUsername: stringClaim(userInfo, 'preferred_username'),
    picture: safePicture,
  };
}

function diagnosticFor(
  status: number,
  succeeded: boolean,
  subjectMatches: boolean,
  claimNames: string[],
): BhidUserInfoDiagnostic {
  return {
    httpStatus: status,
    succeeded,
    subjectMatches,
    claimNames,
    picturePresent: claimNames.includes('picture'),
    namePresent: claimNames.includes('name'),
    preferredUsernamePresent: claimNames.includes('preferred_username'),
    bioPresent: claimNames.includes('bio'),
    verificationPresent: claimNames.some((claim) => /verif/i.test(claim)),
  };
}

export async function resolveBhidProfileWithDiagnostic(
  config: oidc.Configuration,
  accessToken: string,
  expectedSubject: string,
): Promise<{ profile: BhidProfile; diagnostic: BhidUserInfoDiagnostic }> {
  const endpoint = config.serverMetadata().userinfo_endpoint;
  if (!endpoint || new URL(endpoint).protocol !== 'https:') {
    throw new Error('BHID UserInfo endpoint must be advertised over HTTPS');
  }

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) {
    throw new BhidUserInfoError(diagnosticFor(response.status, false, false, []));
  }

  let claims: unknown;
  try {
    claims = await response.json();
  } catch {
    throw new BhidUserInfoError(diagnosticFor(response.status, false, false, []));
  }
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
    throw new BhidUserInfoError(diagnosticFor(response.status, false, false, []));
  }

  const claimNames = Object.keys(claims);
  const userInfo = claims as UserInfoResponse;
  const subjectMatches = typeof userInfo.sub === 'string' && userInfo.sub === expectedSubject;
  const diagnostic = diagnosticFor(response.status, true, subjectMatches, claimNames);
  if (userInfo.sub !== expectedSubject) {
    throw new BhidUserInfoError(diagnostic);
  }
  return { profile: profileFromUserInfo(userInfo), diagnostic };
}

export async function resolveBhidProfile(
  config: oidc.Configuration,
  accessToken: string,
  expectedSubject: string,
): Promise<BhidProfile> {
  const { profile } = await resolveBhidProfileWithDiagnostic(config, accessToken, expectedSubject);
  return profile;
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
    if (error instanceof BhidUserInfoError) {
      console.error('BHID UserInfo request failed:', {
        status: error.diagnostic.httpStatus,
      });
      if (error.diagnostic.httpStatus === 401) {
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
