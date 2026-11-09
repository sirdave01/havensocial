import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { hasPermission } from '@/lib/authorization';
import { readJsonObject } from '@/lib/http';
import { confirmUploadedMedia, MediaValidationError } from '@/lib/media';
import { db } from '../../models/db.js';
import { createTweetWithExtras } from '../../models/tweetService.js';

export const runtime = 'nodejs';
const MAX_MEDIA_PER_POST = 4;
const MAX_POSTGRES_BIGINT = '9223372036854775807';

function parsePostgresBigint(value: unknown): string | null {
  const text = typeof value === 'string'
    ? value
    : typeof value === 'number' && Number.isSafeInteger(value)
      ? String(value)
      : '';

  if (
    !/^[1-9]\d*$/.test(text) ||
    text.length > 19 ||
    (text.length === 19 && text > MAX_POSTGRES_BIGINT)
  ) {
    return null;
  }
  return text;
}

function parseOptionalDate(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return { valid: true, date: null as Date | null };
  }
  if (typeof value !== 'string' || value.length > 64) {
    return { valid: false, date: null as Date | null };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { valid: false, date: null as Date | null };
  }
  return { valid: true, date };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '';
}

export async function POST(request: Request) {
  const user = await getLinkedUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(user, 'posts.create')) {
    return NextResponse.json(
      { message: 'You are not allowed to publish posts' },
      { status: 403 },
    );
  }

  const body = await readJsonObject(request);
  if (!body || typeof body.content !== 'string') {
    return NextResponse.json(
      { message: 'A JSON content string is required' },
      { status: 400 },
    );
  }
  if (
    body.media !== undefined &&
    (!Array.isArray(body.media) || body.media.length > MAX_MEDIA_PER_POST)
  ) {
    return NextResponse.json(
      { message: `A post can contain at most ${MAX_MEDIA_PER_POST} media attachments` },
      { status: 400 },
    );
  }

  const content = body.content.trim();
  if (!content) {
    return NextResponse.json({ message: 'Post content cannot be empty' }, { status: 400 });
  }
  if (content.includes('\0')) {
    return NextResponse.json({ message: 'Post content cannot contain null characters' }, { status: 400 });
  }
  if (Array.from(content).length > 25000) {
    return NextResponse.json({ message: 'Post content cannot exceed 25,000 characters' }, { status: 400 });
  }

  const replyTo = body.isReplyTo == null
    ? null
    : parsePostgresBigint(body.isReplyTo);

  if (body.isReplyTo != null && !replyTo) {
    return NextResponse.json({ message: 'Invalid reply target' }, { status: 400 });
  }

  const scheduled = parseOptionalDate(body.scheduledAt);
  const repliesOpen = parseOptionalDate(body.repliesOpenAt);
  const repliesClose = parseOptionalDate(body.repliesCloseAt);

  if (!scheduled.valid || !repliesOpen.valid || !repliesClose.valid) {
    return NextResponse.json({ message: 'Please provide valid scheduling dates and times.' }, { status: 400 });
  }

  const now = new Date();
  if (scheduled.date && scheduled.date.getTime() <= now.getTime()) {
    return NextResponse.json({ message: 'The scheduled publication time must be in the future.' }, { status: 400 });
  }

  if (replyTo && (scheduled.date || repliesOpen.date || repliesClose.date)) {
    return NextResponse.json(
      { message: 'Scheduling and reply-window settings are available when creating a new post, not a reply.' },
      { status: 400 },
    );
  }

  const publicationTime = scheduled.date ?? now;
  if (repliesOpen.date && repliesOpen.date.getTime() < publicationTime.getTime()) {
    return NextResponse.json({ message: 'Replies cannot open before the post is published.' }, { status: 400 });
  }
  const replyWindowStart = repliesOpen.date ?? publicationTime;
  if (repliesClose.date && repliesClose.date.getTime() <= replyWindowStart.getTime()) {
    return NextResponse.json({ message: 'The reply closing time must be after the opening time.' }, { status: 400 });
  }

  // Validate reply target and its current reply window before media processing.
  if (replyTo) {
    const parent = await db.query<{
      user_id: string;
      can_reply: boolean;
      published_at: Date | null;
    }>(
      `SELECT
         user_id::text AS user_id,
         published_at,
         (published_at IS NOT NULL
          AND (replies_open_at IS NULL OR replies_open_at <= CURRENT_TIMESTAMP)
          AND (replies_close_at IS NULL OR replies_close_at > CURRENT_TIMESTAMP)) AS can_reply
       FROM tweets
       WHERE tweet_id = $1
         AND is_deleted = FALSE
         AND deleted_at IS NULL`,
      [replyTo],
    );

    if (!parent.rows[0] || !parent.rows[0].published_at) {
      return NextResponse.json({ message: 'The post is unavailable for replies.' }, { status: 404 });
    }
    if (!parent.rows[0].can_reply) {
      const state = await db.query<{ replies_open_at: Date | null; replies_close_at: Date | null }>(
        `SELECT replies_open_at, replies_close_at FROM tweets WHERE tweet_id = $1`,
        [replyTo],
      );
      const window = state.rows[0];
      const message = window?.replies_open_at && new Date(window.replies_open_at).getTime() > now.getTime()
        ? 'Replies are not open yet.'
        : 'Replies are closed for this post.';
      return NextResponse.json({ message }, { status: 403 });
    }
  }

  const mediaKeys = new Set<string>();
  const media = [];
  for (const attachment of body.media || []) {
    if (
      !attachment ||
      typeof attachment !== 'object' ||
      Array.isArray(attachment) ||
      typeof attachment.key !== 'string' ||
      typeof attachment.altText !== 'string' ||
      attachment.altText.length > 1000 ||
      mediaKeys.has(attachment.key)
    ) {
      return NextResponse.json({ message: 'Invalid media attachment' }, { status: 400 });
    }

    mediaKeys.add(attachment.key);
    try {
      media.push({
        ...await confirmUploadedMedia(attachment.key, user.users_id),
        altText: attachment.altText,
      });
    } catch (error) {
      if (error instanceof MediaValidationError) {
        return NextResponse.json({ message: error.message }, { status: 400 });
      }
      throw error;
    }
  }

  try {
    const tweet = await createTweetWithExtras(
      user.users_id,
      content,
      replyTo,
      media,
      {
        scheduledAt: scheduled.date,
        repliesOpenAt: repliesOpen.date,
        repliesCloseAt: repliesClose.date,
      },
    );

    if (!tweet) {
      return NextResponse.json(
        { message: 'Only active accounts can publish posts' },
        { status: 403 },
      );
    }

    return NextResponse.json(
      {
        message: scheduled.date
          ? 'Post scheduled successfully.'
          : replyTo
            ? 'Reply created.'
            : 'Post created.',
        tweet,
        isReply: replyTo !== null,
        isScheduled: Boolean(scheduled.date),
      },
      { status: 201 },
    );
  } catch (error) {
    const message = errorMessage(error);
    if (message === 'REPLIES_NOT_OPEN') {
      return NextResponse.json({ message: 'Replies are not open yet.' }, { status: 403 });
    }
    if (message === 'REPLIES_CLOSED') {
      return NextResponse.json({ message: 'Replies are closed for this post.' }, { status: 403 });
    }

    console.error('Post creation failed:', {
      errorName: error instanceof Error ? error.name : 'NonError',
      ...(typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
        ? { errorCode: error.code }
        : {}),
    });
    return NextResponse.json(
      { message: 'Post could not be saved. Please try again.' },
      { status: 500 },
    );
  }
}
