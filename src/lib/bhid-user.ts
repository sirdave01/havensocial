import { db } from '../models/db.js';

export async function upsertBhidUser(subject: string) {
  const normalizedSubject = subject.trim();
  if (!normalizedSubject) throw new Error('BHID identity response did not contain a subject');

  const result = await db.query(
    `INSERT INTO users (bhid_sub, role_id)
     VALUES (
       $1,
       (SELECT role_id FROM roles WHERE role_name = 'user')
     )
     ON CONFLICT (bhid_sub) DO UPDATE
       SET last_seen_at = CURRENT_TIMESTAMP
     RETURNING users_id, bhid_sub, role_id, app_status`,
    [normalizedSubject],
  );
  const user = result.rows[0];
  if (!user) throw new Error('Unable to provision the HavenSocial user');

  await db.query(
    `INSERT INTO user_preferences (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [user.users_id],
  );

  return user;
}
