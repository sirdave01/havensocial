import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { readJsonObject } from '@/lib/http';
import { confirmUploadedMedia, MediaValidationError } from '@/lib/media';
import { db } from '../../models/db.js';
import { createTweetWithExtras } from '../../models/tweetService.js';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = await getLinkedUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const body = await readJsonObject(request);
  if (!body || typeof body.content !== 'string') {
    return NextResponse.json({ message: 'A JSON content string is required' }, { status: 400 });
  }

  const content = body.content.trim();
  const replyTo = body.isReplyTo == null ? null : Number(body.isReplyTo);
  if (!content || content.length > 280 || (replyTo !== null && (!Number.isSafeInteger(replyTo) || replyTo < 1))) {
    return NextResponse.json({ message: 'Invalid post content or reply target' }, { status: 400 });
  }
  if (replyTo !== null) {
    const parent = await db.query(
      'SELECT tweet_id FROM tweets WHERE tweet_id = $1 AND deleted_at IS NULL',
      [replyTo],
    );
    if (!parent.rows[0]) return NextResponse.json({ message: 'Parent post not found' }, { status: 404 });
  }

  let mediaUrl: string | null = null;
  if (body.mediaKey !== undefined) {
    if (typeof body.mediaKey !== 'string') {
      return NextResponse.json({ message: 'Invalid media key' }, { status: 400 });
    }
    try {
      mediaUrl = await confirmUploadedMedia(body.mediaKey, 'tweets', user.users_id);
    } catch (error) {
      if (error instanceof MediaValidationError) {
        return NextResponse.json({ message: error.message }, { status: 400 });
      }
      throw error;
    }
  }
  const tweet = await createTweetWithExtras(user.users_id, content, mediaUrl, replyTo);
  return NextResponse.json({ message: 'Post created', tweet, isReply: replyTo !== null }, { status: 201 });
}
