import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { getUnreadMessageCount } from '@/models/messaging.js';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getLinkedUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  try {
    const count = await getUnreadMessageCount(user.users_id);
    return NextResponse.json({ count }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Unread message count retrieval failed:', {
      errorName: error instanceof Error ? error.name : 'NonError',
    });
    return NextResponse.json({ message: 'Unread message count unavailable.' }, { status: 500 });
  }
}
