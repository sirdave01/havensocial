import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { readJsonObject } from '@/lib/http';
import {
  getDirectConversationInbox,
  getOrCreateDirectConversation,
} from '@/models/messaging.js';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getLinkedUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  try {
    const conversations = await getDirectConversationInbox(user.users_id);
    return NextResponse.json({ conversations }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Direct-message inbox retrieval failed:', {
      errorName: error instanceof Error ? error.name : 'NonError',
    });
    return NextResponse.json({ message: 'Your conversations could not be loaded.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getLinkedUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const body = await readJsonObject(request);
  if (!body || typeof body.recipientSub !== 'string' || !body.recipientSub.trim() || body.recipientSub.length > 512) {
    return NextResponse.json({ message: 'A valid recipient account is required.' }, { status: 400 });
  }

  try {
    const conversationId = await getOrCreateDirectConversation(user.users_id, body.recipientSub.trim());
    return NextResponse.json({ conversationId }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'RECIPIENT_NOT_FOUND') return NextResponse.json({ message: 'This account is unavailable.' }, { status: 404 });
    if (code === 'CANNOT_MESSAGE_SELF') return NextResponse.json({ message: 'You cannot start a conversation with yourself.' }, { status: 400 });
    if (code === 'MESSAGING_BLOCKED') return NextResponse.json({ message: 'A conversation cannot be started because one account has blocked the other.' }, { status: 403 });
    console.error('Direct conversation creation failed:', {
      errorName: error instanceof Error ? error.name : 'NonError',
    });
    return NextResponse.json({ message: 'The conversation could not be opened.' }, { status: 500 });
  }
}
