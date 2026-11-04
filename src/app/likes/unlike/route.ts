import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { readJsonObject } from '@/lib/http';
import { unlikeTweet } from '../../../models/like.js';

export async function POST(request: Request) {
  const user = await getLinkedUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const body = await readJsonObject(request);
  const tweetId = Number(body?.tweetId);
  if (!Number.isSafeInteger(tweetId) || tweetId < 1) {
    return NextResponse.json({ message: 'A valid post ID is required' }, { status: 400 });
  }
  await unlikeTweet(user.users_id, tweetId);
  return NextResponse.json({ message: 'Post unliked' });
}
