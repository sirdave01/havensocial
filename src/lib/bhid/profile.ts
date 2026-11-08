
import * as oidc from 'openid-client';
import type { UserInfoResponse } from 'openid-client';

import { db } from '../../models/db.js';
import { getHavenSession, hashAppSessionToken } from '../session';
import { getBhidConfiguration } from '../bhid';
import { decryptBhidAccessToken } from './token-vault';

// ==================== PROFILE TYPES ====================

export type BhidProfile = {
  sub: string;
  name?: string;
  preferredUsername?: string;
  picture?: string;
  bio?: string;
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

type CachedBhidProfileRow = {
  sub: string;
  name: string | null;
  preferred_username: string | null;
  picture: string | null;
  bio: string | null;
};

type LegacyBhidSessionRow = {
  bhid_sub: string;
  session_id: string;
  bhid_access_token_enc: string;
};

// ==================== ERRORS ====================

export class BhidUserInfoError extends Error {
  constructor(readonly diagnostic: BhidUserInfoDiagnostic) {
    super('BHID UserInfo request failed');
    this.name = 'BhidUserInfoError';
  }
}

// ==================== PROFILE HELPERS ====================

function stringClaim(userInfo: UserInfoResponse, claim: string) {
  const value = userInfo[claim];

  return typeof value === 'string' && value.trim()
    ? value.trim()
    : undefined;
}

function safePictureUrl(value?: string | null): string | undefined {
  if (!value) return undefined;

  try {
    const url = new URL(value);

    if (url.protocol === 'https:') {
      return url.href;
    }
  } catch {
    // Ignore invalid picture URLs.
  }

  return undefined;
}

function profileFromUserInfo(
  userInfo: UserInfoResponse,
): BhidProfile {
  return {
    sub: userInfo.sub,
    name: stringClaim(userInfo, 'name'),
    preferredUsername: stringClaim(
      userInfo,
      'preferred_username',
    ),
    picture: safePictureUrl(
      stringClaim(userInfo, 'picture'),
    ),
    bio: stringClaim(userInfo, 'bio'),
  };
}

function profileFromCache(
  row: CachedBhidProfileRow,
): BhidProfile {
  return {
    sub: row.sub,
    name: row.name ?? undefined,
    preferredUsername: row.preferred_username ?? undefined,
    picture: safePictureUrl(row.picture),
    bio: row.bio ?? undefined,
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
    preferredUsernamePresent: claimNames.includes(
      'preferred_username',
    ),
    bioPresent: claimNames.includes('bio'),
    verificationPresent: claimNames.some(
      (claim) => /verif/i.test(claim),
    ),
  };
}

// ==================== BHID USERINFO ====================

/**
 * Retrieves the authorized profile claims belonging to the
 * subject represented by the supplied BHID access token.
 */
export async function resolveBhidProfileWithDiagnostic(
  config: oidc.Configuration,
  accessToken: string,
  expectedSubject: string,
): Promise<{
  profile: BhidProfile;
  diagnostic: BhidUserInfoDiagnostic;
}> {
  const endpoint = config.serverMetadata().userinfo_endpoint;

  if (!endpoint || new URL(endpoint).protocol !== 'https:') {
    throw new Error(
      'BHID UserInfo endpoint must be advertised over HTTPS',
    );
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
    throw new BhidUserInfoError(
      diagnosticFor(response.status, false, false, []),
    );
  }

  let claims: unknown;

  try {
    claims = await response.json();
  } catch {
    throw new BhidUserInfoError(
      diagnosticFor(response.status, false, false, []),
    );
  }

  if (
    !claims ||
    typeof claims !== 'object' ||
    Array.isArray(claims)
  ) {
    throw new BhidUserInfoError(
      diagnosticFor(response.status, false, false, []),
    );
  }

  const claimNames = Object.keys(claims);
  const userInfo = claims as UserInfoResponse;

  const subjectMatches =
    typeof userInfo.sub === 'string' &&
    userInfo.sub === expectedSubject;

  const diagnostic = diagnosticFor(
    response.status,
    true,
    subjectMatches,
    claimNames,
  );

  if (!subjectMatches) {
    throw new BhidUserInfoError(diagnostic);
  }

  return {
    profile: profileFromUserInfo(userInfo),
    diagnostic,
  };
}

export async function resolveBhidProfile(
  config: oidc.Configuration,
  accessToken: string,
  expectedSubject: string,
): Promise<BhidProfile> {
  const { profile } =
    await resolveBhidProfileWithDiagnostic(
      config,
      accessToken,
      expectedSubject,
    );

  return profile;
}

// ==================== PERSISTENT PROFILE CACHE ====================

/**
 * Saves or refreshes a BHID profile snapshot in HavenSocial's
 * Neon database.
 *
 * BHID remains the source of truth.
 * HavenSocial stores only the profile information needed
 * for displaying user identities.
 */
export async function saveBhidProfileSnapshot(
  profile: BhidProfile,
) {
  if (!profile.sub) {
    throw new Error(
      'Cannot save a BHID profile without a subject',
    );
  }

  await db.query(
    `INSERT INTO bhid_profile_cache (
       bhid_sub,
       name,
       preferred_username,
       picture,
       bio,
       synced_at
     )
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
     ON CONFLICT (bhid_sub)
     DO UPDATE SET
       name = EXCLUDED.name,
       preferred_username = EXCLUDED.preferred_username,
       picture = EXCLUDED.picture,
       bio = EXCLUDED.bio,
       synced_at = CURRENT_TIMESTAMP`,
    [
      profile.sub,
      profile.name ?? null,
      profile.preferredUsername ?? null,
      safePictureUrl(profile.picture) ?? null,
      profile.bio ?? null,
    ],
  );
}

/**
 * Reads persistent profile snapshots from Neon.
 *
 * This query deliberately does not depend on app_sessions.
 * A user's expired or revoked login session therefore does
 * not remove their previously saved profile information.
 */
async function getCachedBhidProfiles(
  subjects: string[],
): Promise<Map<string, BhidProfile>> {
  const profiles = new Map<string, BhidProfile>();

  if (!subjects.length) {
    return profiles;
  }

  const result = await db.query<CachedBhidProfileRow>(
    `SELECT
       p.bhid_sub AS sub,
       p.name,
       p.preferred_username,
       p.picture,
       p.bio
     FROM bhid_profile_cache p
     JOIN users u
       ON u.bhid_sub = p.bhid_sub
     WHERE p.bhid_sub = ANY($1::text[])
       AND u.app_status = 'ACTIVE'`,
    [subjects],
  );

  for (const row of result.rows) {
    profiles.set(
      row.sub,
      profileFromCache(row),
    );
  }

  return profiles;
}

// ==================== CURRENT USER PROFILE ====================

/**
 * Returns the current user's profile.
 *
 * Cached information remains available when the BHID token
 * expires. When a valid token exists, the profile is refreshed
 * and its snapshot is updated.
 */
export async function getCurrentBhidProfile(
  expectedSubject: string,
): Promise<BhidProfile | null> {
  const cachedProfiles =
    await getCachedBhidProfiles([expectedSubject]);

  const cachedProfile =
    cachedProfiles.get(expectedSubject) ?? null;

  const session = await getHavenSession();

  if (!session.appSessionToken) {
    return cachedProfile;
  }

  const result = await db.query<{
    session_id: string;
    bhid_access_token_enc: string | null;
    bhid_access_token_expires_at: Date | string | null;
  }>(
    `SELECT
       s.session_id,
       s.bhid_access_token_enc,
       s.bhid_access_token_expires_at
     FROM app_sessions s
     JOIN users u
       ON u.users_id = s.user_id
     WHERE s.session_token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > CURRENT_TIMESTAMP
       AND u.app_status = 'ACTIVE'
       AND u.bhid_sub = $2`,
    [
      hashAppSessionToken(session.appSessionToken),
      expectedSubject,
    ],
  );

  const row = result.rows[0];

  if (!row?.bhid_access_token_enc) {
    return cachedProfile;
  }

  if (
    row.bhid_access_token_expires_at &&
    new Date(
      row.bhid_access_token_expires_at,
    ).valueOf() <= Date.now()
  ) {
    await db.query(
      `UPDATE app_sessions
       SET bhid_access_token_enc = NULL,
           bhid_access_token_expires_at = NULL
       WHERE session_id = $1`,
      [row.session_id],
    );

    return cachedProfile;
  }

  try {
    const accessToken = decryptBhidAccessToken(
      row.bhid_access_token_enc,
      row.session_id,
    );

    const config = await getBhidConfiguration();

    const profile = await resolveBhidProfile(
      config,
      accessToken,
      expectedSubject,
    );

    try {
      await saveBhidProfileSnapshot(profile);
    } catch (error) {
      console.error(
        'Could not refresh current BHID profile cache:',
        {
          errorName:
            error instanceof Error
              ? error.name
              : 'NonError',
        },
      );
    }

    return profile;
  } catch (error) {
    if (error instanceof BhidUserInfoError) {
      console.warn('BHID UserInfo request failed:', {
        status: error.diagnostic.httpStatus,
      });

      if (error.diagnostic.httpStatus === 401) {
        await db.query(
          `UPDATE app_sessions
           SET bhid_access_token_enc = NULL,
               bhid_access_token_expires_at = NULL
           WHERE session_id = $1`,
          [row.session_id],
        );
      }

      return cachedProfile;
    }

    console.warn(
      'Could not refresh current BHID profile:',
      {
        errorName:
          error instanceof Error
            ? error.name
            : 'NonError',
      },
    );

    return cachedProfile;
  }
}

// ==================== MULTIPLE USER PROFILES ====================

/**
 * Retrieves profiles for feed authors, reply authors,
 * reshare authors, followers and following accounts.
 *
 * 1. Reads saved profiles first.
 * 2. Identifies profiles that are missing.
 * 3. Attempts to retrieve missing profiles using existing,
 *    active HavenSocial sessions with usable BHID tokens.
 * 4. Saves successfully retrieved profiles into Neon.
 *
 * Once a profile has been cached, its owner's active session
 * is no longer needed for subsequent display.
 */
export async function getBhidProfiles(
  subjects: string[],
): Promise<Map<string, BhidProfile>> {
  const uniqueSubjects = [
    ...new Set(
      subjects
        .filter(
          (subject): subject is string =>
            typeof subject === 'string',
        )
        .map((subject) => subject.trim())
        .filter(Boolean),
    ),
  ];

  const profiles =
    await getCachedBhidProfiles(uniqueSubjects);

  const missingSubjects = uniqueSubjects.filter(
    (subject) => !profiles.has(subject),
  );

  if (!missingSubjects.length) {
    return profiles;
  }

  // Find existing usable BHID access tokens for missing profiles.
  const result = await db.query<LegacyBhidSessionRow>(
    `SELECT DISTINCT ON (u.bhid_sub)
       u.bhid_sub,
       s.session_id,
       s.bhid_access_token_enc
     FROM users u
     JOIN app_sessions s
       ON s.user_id = u.users_id
     WHERE u.bhid_sub = ANY($1::text[])
       AND u.app_status = 'ACTIVE'
       AND s.revoked_at IS NULL
       AND s.expires_at > CURRENT_TIMESTAMP
       AND s.bhid_access_token_enc IS NOT NULL
       AND (
         s.bhid_access_token_expires_at IS NULL
         OR s.bhid_access_token_expires_at > CURRENT_TIMESTAMP
       )
     ORDER BY
       u.bhid_sub,
       s.bhid_access_token_expires_at DESC NULLS LAST,
       s.expires_at DESC`,
    [missingSubjects],
  );

  if (!result.rows.length) {
    return profiles;
  }

  let config: oidc.Configuration;

  try {
    config = await getBhidConfiguration();
  } catch (error) {
    console.warn(
      'Could not initialize BHID profile lookup:',
      {
        errorName:
          error instanceof Error
            ? error.name
            : 'NonError',
      },
    );

    return profiles;
  }

  await Promise.all(
    result.rows.map(async (row) => {
      try {
        // Decrypt this user's existing BHID access token.
        const accessToken = decryptBhidAccessToken(
          row.bhid_access_token_enc,
          row.session_id,
        );

        // Retrieve the profile for the matching BHID subject.
        // IMPORTANT: Use accessToken, not tokens.accessToken.
        const profile = await resolveBhidProfile(
          config,
          accessToken,
          row.bhid_sub,
        );

        // Make the profile immediately available to the caller.
        profiles.set(row.bhid_sub, profile);

        // Persist the profile for future offline display.
        try {
          await saveBhidProfileSnapshot(profile);
        } catch (error) {
          console.error(
            'Could not save BHID profile snapshot:',
            {
              subject: row.bhid_sub,
              errorName:
                error instanceof Error
                  ? error.name
                  : 'NonError',
            },
          );
        }
      } catch (error) {
        console.warn(
          'Could not resolve a BHID post author profile:',
          {
            subject: row.bhid_sub,
            errorName:
              error instanceof Error
                ? error.name
                : 'NonError',
            ...(error instanceof BhidUserInfoError
              ? {
                  status: error.diagnostic.httpStatus,
                }
              : {}),
          },
        );
      }
    }),
  );

  return profiles;
}
