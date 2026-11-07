import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { readJsonObject } from '@/lib/http';
import { db } from '../../models/db.js';
import { createNotification } from '../../models/notification.js';
import { createTweetWithExtras } from '../../models/tweetService.js';

export async function POST(request: Request) {
  const user = await getLinkedUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const body = await readJsonObject(request);
  const tweetId = Number(body?.tweetId);
  const quoteText = typeof body?.quoteText === 'string' ? body.quoteText.trim() : '';
  if (!Number.isSafeInteger(tweetId) || tweetId < 1 || quoteText.length > 280) {
    return NextResponse.json({ message: 'Invalid post ID or quote' }, { status: 400 });
  }
  const original = await db.query(
    `SELECT user_id
    FROM tweets
    WHERE tweet_id = $1
      AND is_deleted = FALSE
      AND deleted_at IS NULL`,
    [tweetId],
  );
  
  if (!original.rows[0]) return NextResponse.json({ message: 'Post not found' }, { status: 404 });

  const inserted = await db.query(
    `INSERT INTO retweets (user_id, original_tweet_id, quote_text)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, original_tweet_id) DO NOTHING
     RETURNING retweet_id`,
    [user.users_id, tweetId, quoteText || null],
  );
  if (!inserted.rows[0]) return NextResponse.json({ message: 'Already reposted' }, { status: 409 });

  const quoteTweet = quoteText ? await createTweetWithExtras(user.users_id, quoteText) : null;
  if (String(original.rows[0].user_id) !== String(user.users_id)) {
    await createNotification(original.rows[0].user_id, user.users_id, 'retweet', tweetId);
  }
  return NextResponse.json({ message: 'Reposted', quoteTweet }, { status: 201 });
}
