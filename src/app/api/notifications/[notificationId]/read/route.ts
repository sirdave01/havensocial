import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { markAsRead } from '@/models/notification.js';

type RouteContext = {
  params: Promise<{ notificationId: string }>;
};

const MAX_POSTGRES_BIGINT = '9223372036854775807';

function isValidId(value: string) {
  return (
    /^[1-9]\d*$/.test(value) &&
    value.length <= 19 &&
    (value.length < 19 || value <= MAX_POSTGRES_BIGINT)
  );
}

export async function PATCH(
  _request: Request,
  { params }: RouteContext,
) {
  const user = await getLinkedUser();

  if (!user) {
    return NextResponse.json(
      { message: 'Unauthorized' },
      { status: 401 },
    );
  }

  const { notificationId } = await params;

  if (!isValidId(notificationId)) {
    return NextResponse.json(
      { message: 'Invalid notification ID.' },
      { status: 400 },
    );
  }

  try {
    const updated = await markAsRead(notificationId, user.users_id);

    return NextResponse.json({
      ok: true,
      updated: Boolean(updated),
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Mark notification as read failed:', {
      errorName: error instanceof Error ? error.name : 'NonError',
    });

    return NextResponse.json(
      { message: 'Could not update this notification.' },
      { status: 500 },
    );
  }
}
