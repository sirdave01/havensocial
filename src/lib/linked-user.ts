import { redirect } from 'next/navigation';
import { db } from '../models/db.js';
import { getHavenSession } from './session';

export async function getLinkedUser() {
  const session = await getHavenSession();
  if (!session.userId) return null;

  const result = await db.query(
    `SELECT u.users_id, u.bhid_sub, u.username, u.email, u.full_name,
            u.display_name, u.bio, u.profile_picture_url, u.date_of_birth,
            u.verification_level, u.verified, u.suspended, u.deleted_at,
            r.role_name
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE u.users_id = $1 AND u.deleted_at IS NULL AND u.suspended = FALSE`,
    [session.userId],
  );

  if (!result.rows[0]) {
    delete session.userId;
    await session.save();
    return null;
  }
  return result.rows[0];
}

export async function requireLinkedUser() {
  const user = await getLinkedUser();
  if (!user) redirect('/login');
  return user;
}
