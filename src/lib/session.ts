import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export type OAuthTransaction = {
  state: string;
  nonce: string;
  codeVerifier: string;
};

export type HavenSession = {
  userId?: string;
  oauth?: OAuthTransaction;
};

const sessionOptions = (): SessionOptions => {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters');
  }

  return {
    cookieName: 'haven_session',
    password,
    ttl: 60 * 60 * 24 * 7,
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
