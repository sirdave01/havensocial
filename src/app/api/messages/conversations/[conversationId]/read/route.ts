import { NextResponse } from 'next/server';

import { getLinkedUser } from '@/lib/linked-user';
import { readJsonObject } from '@/lib/http';
import { markDirectConversationRead } from '@/models/messaging.js';

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export const runtime = 'nodejs';

const MAX_POSTGRES_BIGINT = '9223372036854775807';

function isValidBigintId(value: string) {
  return (
    /^[1-9]\d*$/.test(value) &&
    value.length <= 19 &&
    !(value.length === 19 && value > MAX_POSTGRES_BIGINT)
  );
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getLinkedUser();
  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { conversationId } = await params;
  if (!isValidBigintId(conversationId)) {
    return NextResponse.json(
      { message: 'Invalid conversation ID.' },
      { status: 400 },
    );
  }

  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json(
      { message: 'A valid JSON request body is required.' },
      { status: 400 },
    );
  }

  const rawMessageId = body.readThroughMessageId;
  if (rawMessageId !== undefined && rawMessageId !== null && typeof rawMessageId !== 'string') {
    return NextResponse.json(
      { message: 'Invalid read position.' },
      { status: 400 },
    );
  }

  const readThroughMessageId = typeof rawMessageId === 'string'
    ? rawMessageId
    : null;

  if (readThroughMessageId && !isValidBigintId(readThroughMessageId)) {
    return NextResponse.json(
      { message: 'Invalid read position.' },
      { status: 400 },
    );
  }

  try {
    const updated = await markDirectConversationRead(
      conversationId,
      user.users_id,
      readThroughMessageId,
    );

    if (!updated) {
      return NextResponse.json(
        { message: 'Conversation or read position not found.' },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Conversation read-state update failed:', {
      errorName: error instanceof Error ? error.name : 'NonError',
    });

    return NextResponse.json(
      { message: 'Read status could not be updated.' },
      { status: 500 },
    );
  }
}
