import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { readJsonObject } from '@/lib/http';
import { db } from '../../../../../models/db.js';

export const runtime = 'nodejs';
const MAX_POSTGRES_BIGINT = '9223372036854775807';

function validTweetId(value: string) {
  return /^[1-9]\d*$/.test(value) &&
    value.length <= 19 &&
    !(value.length === 19 && value > MAX_POSTGRES_BIGINT);
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
    return NextResponse.json({ message: 'Invalid scheduled post ID.' }, { status: 400 });
  }

  const body = await readJsonObject(request);
  if (!body || typeof body.content !== 'string' || typeof body.scheduledAt !== 'string') {
    return NextResponse.json({ message: 'Post text and a new publication time are required.' }, { status: 400 });
  }

  const content = body.content.trim();
  if (!content || content.includes('\0') || Array.from(content).length > 25000) {
    return NextResponse.json({ message: 'Post text must contain 1–25,000 valid characters.' }, { status: 400 });
  }

  const scheduledAt = new Date(body.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
    return NextResponse.json({ message: 'Choose a publication time in the future.' }, { status: 400 });
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
       AND scheduled_at > CURRENT_TIMESTAMP
       AND (replies_close_at IS NULL OR replies_close_at > $2)
       AND is_deleted = FALSE
       AND deleted_at IS NULL
     RETURNING tweet_id::text AS tweet_id, content, scheduled_at`,
    [content, scheduledAt, tweetId, user.users_id],
  );

  if (!result.rows[0]) {
    return NextResponse.json(
      { message: 'This scheduled post is no longer available to edit.' },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, post: result.rows[0] }, {
    headers: { 'Cache-Control': 'no-store' },
  });
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
    return NextResponse.json({ message: 'Invalid scheduled post ID.' }, { status: 400 });
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
       AND scheduled_at > CURRENT_TIMESTAMP
       AND is_deleted = FALSE
       AND deleted_at IS NULL
     RETURNING tweet_id::text AS tweet_id`,
    [tweetId, user.users_id],
  );

  if (!result.rows[0]) {
    return NextResponse.json(
      { message: 'This scheduled post is no longer available to cancel.' },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, cancelled: true });
}
