import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { readJsonObject } from '@/lib/http';
import { db } from '../../../models/db.js';

export async function POST(request: Request) {
  const user = await getLinkedUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const body = await readJsonObject(request);
  const tweetId = Number(body?.tweetId);
  if (!Number.isSafeInteger(tweetId) || tweetId < 1) {
    return NextResponse.json({ message: 'A valid post ID is required' }, { status: 400 });
  }
  const result = await db.query(
    `UPDATE tweets SET is_pinned = NOT is_pinned
     WHERE tweet_id = $1 AND user_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [tweetId, user.users_id],
  );
  return result.rows[0]
    ? NextResponse.json({ message: 'Pin updated', tweet: result.rows[0] })
    : NextResponse.json({ message: 'Post not found or not allowed' }, { status: 404 });
}
