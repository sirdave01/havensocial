import { NextResponse } from 'next/server';

import { getLinkedUser } from '@/lib/linked-user';
import { db } from '@/models/db.js';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const viewer = await getLinkedUser();
  if (!viewer) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get('q') || '').trim().slice(0, 50);

  if (!/^[\p{L}\p{N}_.-]{1,50}$/u.test(query)) {
    return NextResponse.json(
      { users: [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const escapedQuery = query.replace(/[\\%_]/g, '\\$&').toLocaleLowerCase();
  const result = await db.query(
    `SELECT DISTINCT ON (LOWER(p.preferred_username))
       u.users_id::text AS user_id,
       u.bhid_sub AS sub,
       p.preferred_username AS username,
       COALESCE(NULLIF(BTRIM(p.name), ''), p.preferred_username) AS name,
       p.picture
     FROM users u
     JOIN bhid_profile_cache p ON p.bhid_sub = u.bhid_sub
     WHERE u.app_status = 'ACTIVE'
       AND p.preferred_username IS NOT NULL
       AND LOWER(p.preferred_username) LIKE $1 ESCAPE '\\'
     ORDER BY
       LOWER(p.preferred_username), u.users_id
     LIMIT 8`,
    [`${escapedQuery}%`],
  );

  return NextResponse.json(
    { users: result.rows },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
