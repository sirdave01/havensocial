import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { readJsonObject } from '@/lib/http';
import {
  getDirectConversationMessages,
  sendDirectMessage,
} from '@/models/messaging.js';

type RouteContext = { params: Promise<{ conversationId: string }> };

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: RouteContext) {
  const user = await getLinkedUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { conversationId } = await params;
  if (!/^[1-9]\d{0,18}$/.test(conversationId)) {
    return NextResponse.json({ message: 'Invalid conversation ID.' }, { status: 400 });
  }
  const url = new URL(request.url);
  const before = url.searchParams.get('before');
  try {
    const result = await getDirectConversationMessages(conversationId, user.users_id, before);
    if (!result) return NextResponse.json({ message: 'Conversation not found.' }, { status: 404 });
    return NextResponse.json(
      { messages: result.messages, hasMore: result.hasMore },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_MESSAGE_CURSOR') {
      return NextResponse.json({ message: 'Invalid message cursor.' }, { status: 400 });
    }
    console.error('Conversation messages retrieval failed:', {
      errorName: error instanceof Error ? error.name : 'NonError',
    });
    return NextResponse.json({ message: 'Messages could not be loaded.' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getLinkedUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { conversationId } = await params;
  if (!/^[1-9]\d{0,18}$/.test(conversationId)) {
    return NextResponse.json({ message: 'Invalid conversation ID.' }, { status: 400 });
  }
  const body = await readJsonObject(request);
  if (!body || typeof body.content !== 'string') {
    return NextResponse.json({ message: 'A message string is required.' }, { status: 400 });
  }
  try {
    const message = await sendDirectMessage(conversationId, user.users_id, body.content);
    return NextResponse.json({ message }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'INVALID_CONVERSATION' || code === 'CONVERSATION_NOT_FOUND') return NextResponse.json({ message: 'Conversation not found.' }, { status: 404 });
    if (code === 'EMPTY_MESSAGE') return NextResponse.json({ message: 'Write a message before sending.' }, { status: 400 });
    if (code === 'INVALID_MESSAGE_CONTENT') return NextResponse.json({ message: 'Messages cannot contain null characters or exceed 10,000 characters.' }, { status: 400 });
    if (code === 'MESSAGING_BLOCKED') return NextResponse.json({ message: 'This message cannot be sent because one account has blocked the other.' }, { status: 403 });
    if (code === 'RECIPIENT_UNAVAILABLE') return NextResponse.json({ message: 'This account is currently unavailable.' }, { status: 403 });
    console.error('Direct message creation failed:', {
      errorName: error instanceof Error ? error.name : 'NonError',
    });
    return NextResponse.json({ message: 'Your message could not be sent.' }, { status: 500 });
  }
}
