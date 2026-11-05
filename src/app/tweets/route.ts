import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { hasPermission } from '@/lib/authorization';
import { readJsonObject } from '@/lib/http';
import { db } from '../../models/db.js';
import { createTweetWithExtras } from '../../models/tweetService.js';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = await getLinkedUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user, 'posts.create')) {
    return NextResponse.json({ message: 'You are not allowed to publish posts' }, { status: 403 });
  }
  const body = await readJsonObject(request);
  if (!body || typeof body.content !== 'string') {
    return NextResponse.json({ message: 'A JSON content string is required' }, { status: 400 });
  }
  if (body.mediaKey !== undefined) {
    return NextResponse.json({ message: 'Media attachments are not supported yet' }, { status: 400 });
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
  let replyTo: number | null = null;
  if (body.isReplyTo != null) {
    const rawReplyTo = body.isReplyTo;
    if (
      !(typeof rawReplyTo === 'number' && Number.isSafeInteger(rawReplyTo))
      && !(typeof rawReplyTo === 'string' && /^\d+$/.test(rawReplyTo))
    ) {
      return NextResponse.json({ message: 'Invalid reply target' }, { status: 400 });
    }
    replyTo = Number(rawReplyTo);
    if (!Number.isSafeInteger(replyTo) || replyTo < 1) {
      return NextResponse.json({ message: 'Invalid reply target' }, { status: 400 });
    }
  }
  if (replyTo !== null) {
    const parent = await db.query(
      `SELECT tweet_id FROM tweets
       WHERE tweet_id = $1 AND is_deleted = FALSE AND deleted_at IS NULL`,
      [replyTo],
    );
    if (!parent.rows[0]) return NextResponse.json({ message: 'Parent post not found' }, { status: 404 });
  }

  let tweet;
  try {
    tweet = await createTweetWithExtras(user.users_id, content, replyTo);
  } catch (error) {
    console.error('Post creation failed:', {
      errorName: error instanceof Error ? error.name : 'NonError',
      ...(typeof error === 'object' && error !== null && 'code' in error
        && typeof error.code === 'string'
        ? { errorCode: error.code }
        : {}),
    });
    return NextResponse.json({ message: 'Post could not be saved. Please try again.' }, { status: 500 });
  }
  if (!tweet) {
    return NextResponse.json({ message: 'Only active accounts can publish posts' }, { status: 403 });
  }
  return NextResponse.json({ message: 'Post created', tweet, isReply: replyTo !== null }, { status: 201 });
}
