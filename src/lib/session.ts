import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { encryptBhidAccessToken } from './bhid/token-vault';
import { db } from '../models/db.js';

export type OAuthTransaction = {
  state: string;
  nonce: string;
  codeVerifier: string;
};

export type HavenSession = {
  appSessionToken?: string;
  oauth?: OAuthTransaction;
};

export function getAppSessionTtlSeconds() {
  const configured = process.env.APP_SESSION_TTL_SECONDS;
  if (!configured) return 60 * 60 * 24 * 7;

  const seconds = Number(configured);
  if (!Number.isSafeInteger(seconds) || seconds < 60 || seconds > 60 * 60 * 24 * 30) {
    throw new Error('APP_SESSION_TTL_SECONDS must be an integer between 60 and 2592000');
  }
  return seconds;
}

const sessionOptions = (): SessionOptions => {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters');
  }

  return {
    cookieName: 'haven_session',
    password,
    ttl: getAppSessionTtlSeconds(),
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    },
  };
};

export async function getHavenSession() {
  return getIronSession<HavenSession>(await cookies(), sessionOptions());
}

const hashSessionToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export async function createAppSession(
  userId: string | number,
  bhidAccessToken: string,
  bhidAccessTokenExpiresAt: Date | null,
) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(token);
  const sessionId = randomUUID();
  const result = await db.query(
    `INSERT INTO app_sessions (
       session_id, user_id, session_token_hash, expires_at, last_seen_at,
       bhid_access_token_enc, bhid_access_token_expires_at
     )
     SELECT $4, users_id, $2, NOW() + ($3 * INTERVAL '1 second'), NOW(), $5, $6
     FROM users
     WHERE users_id = $1 AND app_status = 'ACTIVE'
     RETURNING session_id`,
    [
      userId,
      tokenHash,
      getAppSessionTtlSeconds(),
      sessionId,
      encryptBhidAccessToken(bhidAccessToken, sessionId),
      bhidAccessTokenExpiresAt,
    ],
  );

  if (!result.rows[0]) {
    throw new Error('Cannot create a HavenSocial session for an inactive or missing user');
  }
  return token;
}

export async function revokeAppSession(token: string | undefined) {
  if (!token) return;
  await db.query(
    `UPDATE app_sessions
     SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
         bhid_access_token_enc = NULL,
         bhid_access_token_expires_at = NULL
     WHERE session_token_hash = $1`,
    [hashSessionToken(token)],
  );
}

export function hashAppSessionToken(token: string) {
  return hashSessionToken(token);
}
