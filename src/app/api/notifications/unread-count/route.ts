import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { getUnreadNotificationCount } from '@/models/notification.js';

export async function GET() {
  const user = await getLinkedUser();

  if (!user) {
    return NextResponse.json(
      { message: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const count = await getUnreadNotificationCount(user.users_id);

    return NextResponse.json(
      { count },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    console.error('Unread notification count failed:', {
      errorName: error instanceof Error ? error.name : 'NonError',
    });

    return NextResponse.json(
      { message: 'Could not load notification count.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
