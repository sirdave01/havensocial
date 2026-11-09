import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { markAllAsRead } from '@/models/notification.js';

export async function POST() {
  const user = await getLinkedUser();

  if (!user) {
    return NextResponse.json(
      { message: 'Unauthorized' },
      { status: 401 },
    );
  }

  try {
    const updated = await markAllAsRead(user.users_id);

    return NextResponse.json({
      ok: true,
      updated,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Mark all notifications as read failed:', {
      errorName: error instanceof Error ? error.name : 'NonError',
    });

    return NextResponse.json(
      { message: 'Could not update notifications.' },
      { status: 500 },
    );
  }
}
