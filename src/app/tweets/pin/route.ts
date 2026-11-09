
import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { readJsonObject } from '@/lib/http';
import { db } from '../../../models/db.js';

const MAX_POSTGRES_BIGINT = '9223372036854775807';

export async function POST(request: Request) {
  try {
    const user = await getLinkedUser();

    if (!user) {
      return NextResponse.json(
        { message: 'Please sign in to pin posts.' },
        { status: 401 },
      );
    }

    const body = await readJsonObject(request);
    const rawTweetId = body?.tweetId;

    const tweetId =
      typeof rawTweetId === 'string'
        ? rawTweetId
        : typeof rawTweetId === 'number' &&
            Number.isSafeInteger(rawTweetId)
          ? String(rawTweetId)
          : '';

    // Validate PostgreSQL BIGINT without unsafe Number conversion.
    if (
      !/^[1-9]\d*$/.test(tweetId) ||
      tweetId.length > 19 ||
      (
        tweetId.length === 19 &&
        tweetId > MAX_POSTGRES_BIGINT
      )
    ) {
      return NextResponse.json(
        { message: 'A valid post ID is required.' },
        { status: 400 },
      );
    }

    // Only the original post owner can pin or unpin their post.
    const result = await db.query<{
      tweet_id: string;
      is_pinned: boolean;
    }>(
      `UPDATE tweets
       SET
         is_pinned = NOT is_pinned,
         updated_at = CURRENT_TIMESTAMP
       WHERE tweet_id = $1
         AND user_id = $2
         AND is_deleted = FALSE
         AND deleted_at IS NULL
       RETURNING
         tweet_id::text AS tweet_id,
         is_pinned`,
      [tweetId, user.users_id],
    );

    const tweet = result.rows[0];

    if (!tweet) {
      return NextResponse.json(
        {
          message: 'Post not found or you cannot pin this post.',
        },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: tweet.is_pinned
          ? 'Post pinned successfully.'
          : 'Post unpinned successfully.',
        tweet,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error('HavenSocial pin action failed:', {
      errorName:
        error instanceof Error ? error.name : 'NonError',
    });

    return NextResponse.json(
      { message: 'Could not update the post pin. Please try again.' },
      { status: 500 },
    );
  }
}
