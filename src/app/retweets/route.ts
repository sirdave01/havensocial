
import { NextResponse } from 'next/server';

import { getLinkedUser } from '@/lib/linked-user';
import { readJsonObject } from '@/lib/http';

import { db } from '../../models/db.js';
import { createNotification } from '../../models/notification.js';
import { createTweetWithExtras } from '../../models/tweetService.js';

// ==================== HELPERS ====================

function parseTweetId(value: unknown): number | null {
  const tweetId = Number(value);

  if (!Number.isSafeInteger(tweetId) || tweetId < 1) {
    return null;
  }

  return tweetId;
}

async function getRetweetCount(tweetId: number): Promise<number> {
  const result = await db.query(
    `SELECT COUNT(*)::int AS retweet_count
     FROM retweets
     WHERE original_tweet_id = $1`,
    [tweetId],
  );

  return Number(result.rows[0]?.retweet_count ?? 0);
}

// ==================== CREATE RESHARE ====================

export async function POST(request: Request) {
  // 1. Require authentication.
  const user = await getLinkedUser();

  if (!user) {
    return NextResponse.json(
      { message: 'Unauthorized' },
      { status: 401 },
    );
  }

  // 2. Read and validate request body.
  const body = await readJsonObject(request);

  const tweetId = parseTweetId(body?.tweetId);

  const quoteText =
    typeof body?.quoteText === 'string'
      ? body.quoteText.trim()
      : '';

  if (!tweetId || quoteText.length > 280) {
    return NextResponse.json(
      { message: 'Invalid post ID or quote' },
      { status: 400 },
    );
  }

  // 3. Confirm the original post exists.
  const original = await db.query(
    `SELECT user_id
     FROM tweets
     WHERE tweet_id = $1
       AND is_deleted = FALSE
       AND deleted_at IS NULL`,
    [tweetId],
  );

  if (!original.rows[0]) {
    return NextResponse.json(
      { message: 'Post not found' },
      { status: 404 },
    );
  }

  // 4. Create the reshare.
  // The unique database index prevents duplicate reshares.
  const inserted = await db.query(
    `INSERT INTO retweets (
       user_id,
       original_tweet_id,
       quote_text
     )
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, original_tweet_id)
     DO NOTHING
     RETURNING retweet_id`,
    [
      user.users_id,
      tweetId,
      quoteText || null,
    ],
  );

  // 5. If it already exists, return the actual state.
  if (!inserted.rows[0]) {
    const retweetCount = await getRetweetCount(tweetId);

    return NextResponse.json({
      message: 'Already reposted',
      reposted: true,
      created: false,
      retweetCount,
    });
  }

  // 6. Preserve existing quote-post behaviour.
  const quoteTweet = quoteText
    ? await createTweetWithExtras(user.users_id, quoteText)
    : null;

  // 7. Notify the original author.
  if (
    String(original.rows[0].user_id) !==
    String(user.users_id)
  ) {
    await createNotification(
      original.rows[0].user_id,
      user.users_id,
      'retweet',
      tweetId,
    );
  }

  // 8. Return the updated reshare count.
  const retweetCount = await getRetweetCount(tweetId);

  return NextResponse.json(
    {
      message: 'Reposted',
      reposted: true,
      created: true,
      retweetCount,
      quoteTweet,
    },
    { status: 201 },
  );
}

// ==================== UNDO RESHARE ====================

export async function DELETE(request: Request) {
  // 1. Require authentication.
  const user = await getLinkedUser();

  if (!user) {
    return NextResponse.json(
      { message: 'Unauthorized' },
      { status: 401 },
    );
  }

  // 2. Read and validate request body.
  const body = await readJsonObject(request);

  const tweetId = parseTweetId(body?.tweetId);

  if (!tweetId) {
    return NextResponse.json(
      { message: 'Invalid post ID' },
      { status: 400 },
    );
  }

  // 3. Remove only this user's reshare.
  const removed = await db.query(
    `DELETE FROM retweets
     WHERE user_id = $1
       AND original_tweet_id = $2
     RETURNING retweet_id`,
    [user.users_id, tweetId],
  );

  // 4. Retrieve the actual count.
  const retweetCount = await getRetweetCount(tweetId);

  return NextResponse.json({
    message: removed.rows[0]
      ? 'Reshare removed'
      : 'Reshare was already removed',
    reposted: false,
    removed: Boolean(removed.rows[0]),
    retweetCount,
  });
}
