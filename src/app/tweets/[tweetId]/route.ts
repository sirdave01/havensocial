import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { readJsonObject } from '@/lib/http';
import { deleteTweet, getTweetById, updateTweet } from '../../../models/tweets.js';

type RouteContext = { params: Promise<{ tweetId: string }> };

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: RouteContext) {
  if (!await getLinkedUser()) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { tweetId } = await params;
  if (!/^\d+$/.test(tweetId)) return NextResponse.json({ message: 'Invalid post ID' }, { status: 400 });
  const tweet = await getTweetById(tweetId);
  return tweet
    ? NextResponse.json(tweet)
    : NextResponse.json({ message: 'Post not found' }, { status: 404 });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getLinkedUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const body = await readJsonObject(request);
  if (!body || typeof body.content !== 'string') {
    return NextResponse.json({ message: 'A JSON content string is required' }, { status: 400 });
  }
  const content = body.content.trim();
  if (!content) return NextResponse.json({ message: 'Post content cannot be empty' }, { status: 400 });
  if (content.includes('\0')) {
    return NextResponse.json({ message: 'Post content cannot contain null characters' }, { status: 400 });
  }
  if (Array.from(content).length > 25000) {
    return NextResponse.json({ message: 'Post content cannot exceed 25,000 characters' }, { status: 400 });
  }
  const { tweetId } = await params;
  if (!/^\d+$/.test(tweetId)) return NextResponse.json({ message: 'Invalid post ID' }, { status: 400 });
  const tweet = await updateTweet(tweetId, user.users_id, content);
  return tweet
    ? NextResponse.json({ message: 'Post updated', tweet })
    : NextResponse.json({ message: 'Post not found or not allowed' }, { status: 404 });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await getLinkedUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { tweetId } = await params;
  if (!/^\d+$/.test(tweetId)) return NextResponse.json({ message: 'Invalid post ID' }, { status: 400 });
  const deleted = await deleteTweet(tweetId, user.users_id);
  if (!deleted) return NextResponse.json({ message: 'Post not found or not allowed' }, { status: 404 });
  return NextResponse.json({ message: 'Post deleted' });
}
