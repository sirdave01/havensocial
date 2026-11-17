import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { readJsonObject } from '@/lib/http';
import { markDirectConversationRead } from '@/models/messaging.js';

type RouteContext = { params: Promise<{ conversationId: string }> };

export const runtime = 'nodejs';

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getLinkedUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { conversationId } = await params;
  if (!/^[1-9]\d{0,18}$/.test(conversationId)) {
    return NextResponse.json({ message: 'Invalid conversation ID.' }, { status: 400 });
  }
  const body = await readJsonObject(request);
  const readThrough = body && typeof body.readThrough === 'string'
    ? body.readThrough
    : null;
  try {
    const updated = await markDirectConversationRead(conversationId, user.users_id, readThrough);
    if (!updated) return NextResponse.json({ message: 'Conversation not found.' }, { status: 404 });
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Conversation read-state update failed:', {
      errorName: error instanceof Error ? error.name : 'NonError',
    });
    return NextResponse.json({ message: 'Read status could not be updated.' }, { status: 500 });
  }
}
