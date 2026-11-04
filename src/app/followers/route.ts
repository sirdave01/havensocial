import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { boundedInteger } from '@/lib/http';
import { getFollowers } from '../../models/follow.js';

export async function GET(request: Request) {
  const user = await getLinkedUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const limit = boundedInteger(url.searchParams.get('limit'), 50, 1, 100);
  if (limit === null) return NextResponse.json({ message: 'Invalid limit' }, { status: 400 });
  return NextResponse.json(await getFollowers(user.users_id, limit));
}
