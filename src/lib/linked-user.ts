import { redirect } from 'next/navigation';
import { db } from '../models/db.js';
import { getHavenSession, hashAppSessionToken } from './session';

export async function getLinkedUser() {
  const session = await getHavenSession();
  if (!session.appSessionToken) return null;

  const result = await db.query(
    `SELECT u.users_id, u.bhid_sub, u.app_status, u.last_seen_at,
            r.role_name, s.session_id
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     JOIN app_sessions s ON s.user_id = u.users_id
     WHERE s.session_token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > CURRENT_TIMESTAMP
       AND u.app_status = 'ACTIVE'`,
    [hashAppSessionToken(session.appSessionToken)],
  );

  if (!result.rows[0]) {
    delete session.appSessionToken;
    await session.save();
    return null;
  }

  const user = result.rows[0];
  const lastSeenAt = user.last_seen_at ? new Date(user.last_seen_at).valueOf() : 0;
  if (Date.now() - lastSeenAt >= 5 * 60 * 1000) {
    await db.query(
      `UPDATE app_sessions
       SET last_seen_at = CURRENT_TIMESTAMP
       WHERE session_id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
      [user.session_id],
    );
    await db.query(
      'UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE users_id = $1',
      [user.users_id],
    );
  }
  delete user.last_seen_at;
  delete user.session_id;
  return user;
}

export async function requireLinkedUser() {
  const user = await getLinkedUser();
  if (!user) redirect('/login');
  return user;
}
