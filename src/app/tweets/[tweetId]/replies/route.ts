import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { getThreadedRepliesForTweet } from '../../../../models/tweets.js';

type RouteContext = { params: Promise<{ tweetId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getLinkedUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { tweetId } = await params;
  if (!/^\d+$/.test(tweetId)) return NextResponse.json({ message: 'Invalid post ID' }, { status: 400 });
  const replies = await getThreadedRepliesForTweet(tweetId, user.users_id);
  return NextResponse.json({ replies });
}
