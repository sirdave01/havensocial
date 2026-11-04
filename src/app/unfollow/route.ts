import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { readJsonObject } from '@/lib/http';
import { unfollowUser } from '../../models/follow.js';

export async function POST(request: Request) {
  const user = await getLinkedUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const body = await readJsonObject(request);
  const followeeId = Number(body?.followeeId);
  if (!Number.isSafeInteger(followeeId) || followeeId < 1 || String(followeeId) === String(user.users_id)) {
    return NextResponse.json({ message: 'A valid, different user ID is required' }, { status: 400 });
  }
  return NextResponse.json(await unfollowUser(user.users_id, followeeId));
}
