import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { getScheduledTweets } from '@/models/tweets.js';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getLinkedUser();
  if (!user) {
    return NextResponse.json({ message: 'Please sign in.' }, { status: 401 });
  }

  const posts = await getScheduledTweets(user.users_id, 100);
  return NextResponse.json(
    { posts },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
