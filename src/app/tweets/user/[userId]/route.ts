import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { boundedInteger } from '@/lib/http';
import { getUserTweets } from '../../../../models/tweets.js';

type RouteContext = { params: Promise<{ userId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  if (!await getLinkedUser()) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { userId } = await params;
  if (!/^\d+$/.test(userId)) return NextResponse.json({ message: 'Invalid user ID' }, { status: 400 });
  const url = new URL(request.url);
  const limit = boundedInteger(url.searchParams.get('limit'), 20, 1, 50);
  const offset = boundedInteger(url.searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
  if (limit === null || offset === null) {
    return NextResponse.json({ message: 'Invalid pagination' }, { status: 400 });
  }
  return NextResponse.json(await getUserTweets(userId, limit, offset));
}
