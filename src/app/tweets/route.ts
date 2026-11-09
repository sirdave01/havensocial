import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { hasPermission } from '@/lib/authorization';
import { readJsonObject } from '@/lib/http';
import { confirmUploadedMedia, MediaValidationError } from '@/lib/media';
import { db } from '../../models/db.js';
import { createNotification } from '../../models/notification.js';
import { createTweetWithExtras } from '../../models/tweetService.js';

export const runtime = 'nodejs';
const MAX_MEDIA_PER_POST = 4;

export async function POST(request: Request) {
  const user = await getLinkedUser();

  if (!user) {
    return NextResponse.json(
      { message: 'Unauthorized' },
      { status: 401 },
    );
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
      {
        message: `A post can contain at most ${MAX_MEDIA_PER_POST} media attachments`,
      },
      { status: 400 },
    );
  }

  const content = body.content.trim();

  if (!content) {
    return NextResponse.json(
      { message: 'Post content cannot be empty' },
      { status: 400 },
    );
  }

  if (content.includes('\0')) {
    return NextResponse.json(
      { message: 'Post content cannot contain null characters' },
      { status: 400 },
    );
  }

  if (Array.from(content).length > 25000) {
    return NextResponse.json(
      { message: 'Post content cannot exceed 25,000 characters' },
      { status: 400 },
    );
  }

  let replyTo: number | null = null;
  let replyRecipientId: string | number | null = null;

  if (body.isReplyTo != null) {
    const rawReplyTo = body.isReplyTo;

    if (
      !(typeof rawReplyTo === 'number' && Number.isSafeInteger(rawReplyTo)) &&
      !(typeof rawReplyTo === 'string' && /^\d+$/.test(rawReplyTo))
    ) {
      return NextResponse.json(
        { message: 'Invalid reply target' },
        { status: 400 },
      );
    }

    replyTo = Number(rawReplyTo);

    if (!Number.isSafeInteger(replyTo) || replyTo < 1) {
      return NextResponse.json(
        { message: 'Invalid reply target' },
        { status: 400 },
      );
    }
  }

  if (replyTo !== null) {
    const parent = await db.query<{
      tweet_id: string;
      user_id: string | number;
    }>(
      `SELECT tweet_id::text AS tweet_id, user_id
       FROM tweets
       WHERE tweet_id = $1
         AND is_deleted = FALSE
         AND deleted_at IS NULL`,
      [replyTo],
    );

    if (!parent.rows[0]) {
      return NextResponse.json(
        { message: 'Parent post not found' },
        { status: 404 },
      );
    }

    replyRecipientId = parent.rows[0].user_id;
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
      return NextResponse.json(
        { message: 'Invalid media attachment' },
        { status: 400 },
      );
    }

    mediaKeys.add(attachment.key);

    try {
      media.push({
        ...await confirmUploadedMedia(attachment.key, user.users_id),
        altText: attachment.altText,
      });
    } catch (error) {
      if (error instanceof MediaValidationError) {
        return NextResponse.json(
          { message: error.message },
          { status: 400 },
        );
      }

      throw error;
    }
  }

  let tweet;

  try {
    tweet = await createTweetWithExtras(
      user.users_id,
      content,
      replyTo,
      media,
    );
  } catch (error) {
    console.error('Post creation failed:', {
      errorName: error instanceof Error ? error.name : 'NonError',
      ...(typeof error === 'object' && error !== null && 'code' in error &&
      typeof error.code === 'string'
        ? { errorCode: error.code }
        : {}),
    });

    return NextResponse.json(
      { message: 'Post could not be saved. Please try again.' },
      { status: 500 },
    );
  }

  if (!tweet) {
    return NextResponse.json(
      { message: 'Only active accounts can publish posts' },
      { status: 403 },
    );
  }

  // Notify the parent-post author when somebody replies.
  // Notification failure must not undo a successfully created reply.
  if (
    replyTo !== null &&
    replyRecipientId !== null &&
    String(replyRecipientId) !== String(user.users_id)
  ) {
    try {
      await createNotification(
        replyRecipientId,
        user.users_id,
        'reply',
        replyTo,
      );
    } catch (error) {
      console.error('Reply notification creation failed:', {
        errorName: error instanceof Error ? error.name : 'NonError',
      });
    }
  }

  return NextResponse.json(
    {
      message: replyTo !== null ? 'Reply created' : 'Post created',
      tweet,
      isReply: replyTo !== null,
    },
    { status: 201 },
  );
}
