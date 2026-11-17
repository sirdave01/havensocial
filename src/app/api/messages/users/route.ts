import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { searchDirectMessageUsers } from '@/models/messaging.js';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = await getLinkedUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const query = (url.searchParams.get('q') || '').trim();
  if (query.replace(/^@/, '').length < 2) {
    return NextResponse.json({ users: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const users = await searchDirectMessageUsers(user.users_id, query);
    return NextResponse.json({ users }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Direct-message user search failed:', {
      errorName: error instanceof Error ? error.name : 'NonError',
    });
    return NextResponse.json({ message: 'User search is temporarily unavailable.' }, { status: 500 });
  }
}
