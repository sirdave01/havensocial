import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { boundedInteger } from '@/lib/http';
import { getFollowing } from '../../../models/follow.js';

type RouteContext = { params: Promise<{ userId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  if (!await getLinkedUser()) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { userId } = await params;
  if (!/^\d+$/.test(userId)) return NextResponse.json({ message: 'Invalid user ID' }, { status: 400 });
  const url = new URL(request.url);
  const limit = boundedInteger(url.searchParams.get('limit'), 50, 1, 100);
  if (limit === null) return NextResponse.json({ message: 'Invalid limit' }, { status: 400 });
  return NextResponse.json(await getFollowing(userId, limit));
}
