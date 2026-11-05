import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { db } from '../../../../models/db.js';

type RouteContext = { params: Promise<{ tweetId: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  const user = await getLinkedUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { tweetId } = await params;
  if (!/^\d+$/.test(tweetId)) return NextResponse.json({ message: 'Invalid post ID' }, { status: 400 });

  const original = await db.query(
    `SELECT user_id FROM tweets
     WHERE tweet_id = $1 AND is_deleted = FALSE AND deleted_at IS NULL`,
    [tweetId],
  );
  if (!original.rows[0]) return NextResponse.json({ message: 'Post not found' }, { status: 404 });
  if (String(original.rows[0].user_id) === String(user.users_id)) return NextResponse.json({ ok: true });

  await db.query(
    `INSERT INTO tweet_views (tweet_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (tweet_id, user_id) DO NOTHING
     RETURNING view_id`,
    [tweetId, user.users_id],
  );
  return NextResponse.json({ ok: true });
}
