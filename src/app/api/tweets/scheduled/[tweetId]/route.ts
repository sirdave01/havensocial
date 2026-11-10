import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { readJsonObject } from '@/lib/http';
import { db } from '../../../../../models/db.js';

export const runtime = 'nodejs';

const MAX_POSTGRES_BIGINT = '9223372036854775807';

type ScheduledPostState = {
  published_at: Date | string | null;
  scheduled_at: Date | string | null;
  replies_close_at: Date | string | null;
  is_deleted: boolean;
  deleted_at: Date | string | null;
};

function validTweetId(value: string) {
  return (
    /^[1-9]\d*$/.test(value) &&
    value.length <= 19 &&
    !(value.length === 19 && value > MAX_POSTGRES_BIGINT)
  );
}

async function getOwnedPostState(tweetId: string, userId: string | number) {
  const result = await db.query(
    `SELECT published_at, scheduled_at, replies_close_at,
            is_deleted, deleted_at
     FROM tweets
     WHERE tweet_id = $1
       AND user_id = $2
     LIMIT 1`,
    [tweetId, userId],
  );

  return (result.rows as ScheduledPostState[])[0] || null;
}

function unavailablePostResponse(
  state: ScheduledPostState | null,
  action: 'edit' | 'cancel',
  newScheduledAt?: Date,
) {
  if (!state) {
    return NextResponse.json(
      { message: 'This post could not be found in your account.' },
      { status: 404 },
    );
  }

  if (state.is_deleted || state.deleted_at) {
    return NextResponse.json(
      { message: 'This post has already been deleted.' },
      { status: 410 },
    );
  }

  if (state.published_at) {
    return NextResponse.json(
      {
        message:
          action === 'cancel'
            ? 'This post has already been published and cannot be cancelled from Scheduled posts.'
            : 'This post has already been published and can no longer be edited from Scheduled posts.',
      },
      { status: 409 },
    );
  }

  if (!state.scheduled_at) {
    return NextResponse.json(
      { message: 'This post is no longer in the scheduled queue.' },
      { status: 409 },
    );
  }

  if (
    action === 'edit' &&
    newScheduledAt &&
    state.replies_close_at &&
    new Date(state.replies_close_at).getTime() <= newScheduledAt.getTime()
  ) {
    return NextResponse.json(
      {
        message:
          'The new publication time must be earlier than the configured reply closing time. Adjust the reply window before rescheduling this post.',
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      message:
        action === 'cancel'
          ? 'This scheduled post could not be cancelled. Refresh the page and try again.'
          : 'This scheduled post could not be updated. Refresh the page and try again.',
    },
    { status: 409 },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tweetId: string }> },
) {
  const user = await getLinkedUser();
  if (!user) {
    return NextResponse.json({ message: 'Please sign in.' }, { status: 401 });
  }

  const { tweetId } = await params;
  if (!validTweetId(tweetId)) {
    return NextResponse.json(
      { message: 'Invalid scheduled post ID.' },
      { status: 400 },
    );
  }

  const body = await readJsonObject(request);
  if (
    !body ||
    typeof body.content !== 'string' ||
    typeof body.scheduledAt !== 'string'
  ) {
    return NextResponse.json(
      { message: 'Post text and a new publication time are required.' },
      { status: 400 },
    );
  }

  const content = body.content.trim();
  if (!content || content.includes('\0') || Array.from(content).length > 25000) {
    return NextResponse.json(
      { message: 'Post text must contain 1–25,000 valid characters.' },
      { status: 400 },
    );
  }

  const scheduledAt = new Date(body.scheduledAt);
  if (
    Number.isNaN(scheduledAt.getTime()) ||
    scheduledAt.getTime() <= Date.now()
  ) {
    return NextResponse.json(
      { message: 'Choose a publication time in the future.' },
      { status: 400 },
    );
  }

  const result = await db.query(
    `UPDATE tweets
     SET content = $1,
         scheduled_at = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE tweet_id = $3
       AND user_id = $4
       AND published_at IS NULL
       AND scheduled_at IS NOT NULL
       AND (replies_close_at IS NULL OR replies_close_at > $2)
       AND is_deleted = FALSE
       AND deleted_at IS NULL
     RETURNING tweet_id::text AS tweet_id, content, scheduled_at`,
    [content, scheduledAt, tweetId, user.users_id],
  );

  if (!result.rows[0]) {
    const state = await getOwnedPostState(tweetId, user.users_id);
    return unavailablePostResponse(state, 'edit', scheduledAt);
  }

  return NextResponse.json(
    { ok: true, post: result.rows[0] },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ tweetId: string }> },
) {
  const user = await getLinkedUser();
  if (!user) {
    return NextResponse.json({ message: 'Please sign in.' }, { status: 401 });
  }

  const { tweetId } = await params;
  if (!validTweetId(tweetId)) {
    return NextResponse.json(
      { message: 'Invalid scheduled post ID.' },
      { status: 400 },
    );
  }

  const result = await db.query(
    `UPDATE tweets
     SET is_deleted = TRUE,
         deleted_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE tweet_id = $1
       AND user_id = $2
       AND published_at IS NULL
       AND scheduled_at IS NOT NULL
       AND is_deleted = FALSE
       AND deleted_at IS NULL
     RETURNING tweet_id::text AS tweet_id`,
    [tweetId, user.users_id],
  );

  if (!result.rows[0]) {
    const state = await getOwnedPostState(tweetId, user.users_id);
    return unavailablePostResponse(state, 'cancel');
  }

  return NextResponse.json(
    { ok: true, cancelled: true },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
