import { NextResponse } from 'next/server';

import { getLinkedUser } from '@/lib/linked-user';
import { readJsonObject } from '@/lib/http';
import {
  confirmUploadedMessageMedia,
  MessageMediaValidationError,
} from '@/lib/message-media';
import {
  getDirectConversationMessages,
  sendDirectMessage,
} from '@/models/messaging.js';

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export const runtime = 'nodejs';

const MAX_MESSAGE_ATTACHMENTS = 4;
const MAX_POSTGRES_BIGINT = '9223372036854775807';
const noStore = { 'Cache-Control': 'no-store' };

function isValidBigintId(value: string) {
  return (
    /^[1-9]\d{0,18}$/.test(value) &&
    value.length <= 19 &&
    !(value.length === 19 && value > MAX_POSTGRES_BIGINT)
  );
}

function cleanFileName(value: string) {
  return value
    .replace(/[\\/\u0000-\u001f\u007f]/g, '_')
    .trim()
    .slice(0, 180) || 'attachment';
}

export async function GET(
  request: Request,
  { params }: RouteContext,
) {
  const user = await getLinkedUser();
  if (!user) {
    return NextResponse.json(
      { message: 'Unauthorized' },
      { status: 401, headers: noStore },
    );
  }

  const { conversationId } = await params;
  if (!isValidBigintId(conversationId)) {
    return NextResponse.json(
      { message: 'Invalid conversation ID.' },
      { status: 400, headers: noStore },
    );
  }

  const url = new URL(request.url);
  const before = url.searchParams.get('before');

  try {
    const result = await getDirectConversationMessages(
      conversationId,
      user.users_id,
      before,
    );

    if (!result) {
      return NextResponse.json(
        { message: 'Conversation not found.' },
        { status: 404, headers: noStore },
      );
    }

    return NextResponse.json(
      { messages: result.messages, hasMore: result.hasMore },
      { headers: noStore },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_MESSAGE_CURSOR') {
      return NextResponse.json(
        { message: 'Invalid message cursor.' },
        { status: 400, headers: noStore },
      );
    }

    console.error('Conversation messages retrieval failed:', {
      errorName: error instanceof Error ? error.name : 'NonError',
    });

    return NextResponse.json(
      { message: 'Messages could not be loaded.' },
      { status: 500, headers: noStore },
    );
  }
}

export async function POST(
  request: Request,
  { params }: RouteContext,
) {
  const user = await getLinkedUser();
  if (!user) {
    return NextResponse.json(
      { message: 'Unauthorized' },
      { status: 401, headers: noStore },
    );
  }

  const { conversationId } = await params;
  if (!isValidBigintId(conversationId)) {
    return NextResponse.json(
      { message: 'Invalid conversation ID.' },
      { status: 400, headers: noStore },
    );
  }

  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json(
      { message: 'A valid JSON message is required.' },
      { status: 400, headers: noStore },
    );
  }

  const content = body.content === undefined
    ? ''
    : typeof body.content === 'string'
      ? body.content
      : null;

  if (content === null) {
    return NextResponse.json(
      { message: 'Message content must be a string.' },
      { status: 400, headers: noStore },
    );
  }

  const rawAttachments = body.attachments === undefined ? [] : body.attachments;
  if (
    !Array.isArray(rawAttachments) ||
    rawAttachments.length > MAX_MESSAGE_ATTACHMENTS
  ) {
    return NextResponse.json(
      { message: `A message can contain at most ${MAX_MESSAGE_ATTACHMENTS} attachments.` },
      { status: 400, headers: noStore },
    );
  }

  if (!content.trim() && rawAttachments.length === 0) {
    return NextResponse.json(
      { message: 'Write a message or attach a file before sending.' },
      { status: 400, headers: noStore },
    );
  }

  const keys = new Set<string>();
  const attachments = [];

  try {
    for (const raw of rawAttachments) {
      if (
        !raw ||
        typeof raw !== 'object' ||
        Array.isArray(raw) ||
        typeof raw.key !== 'string' ||
        typeof raw.fileName !== 'string' ||
        raw.fileName.length > 255 ||
        keys.has(raw.key)
      ) {
        return NextResponse.json(
          { message: 'One or more message attachments are invalid.' },
          { status: 400, headers: noStore },
        );
      }

      keys.add(raw.key);

      const confirmed = await confirmUploadedMessageMedia(
        raw.key,
        conversationId,
        user.users_id,
      );

      attachments.push({
        ...confirmed,
        fileName: cleanFileName(raw.fileName),
      });
    }

    const message = await sendDirectMessage(
      conversationId,
      user.users_id,
      content,
      attachments,
    );

    return NextResponse.json(
      { message },
      { status: 201, headers: noStore },
    );
  } catch (error) {
    if (error instanceof MessageMediaValidationError) {
      return NextResponse.json(
        { message: error.message },
        { status: 400, headers: noStore },
      );
    }

    const code = error instanceof Error ? error.message : '';
    if (code === 'INVALID_CONVERSATION' || code === 'CONVERSATION_NOT_FOUND') {
      return NextResponse.json(
        { message: 'Conversation not found.' },
        { status: 404, headers: noStore },
      );
    }
    if (code === 'EMPTY_MESSAGE') {
      return NextResponse.json(
        { message: 'Write a message or attach a file before sending.' },
        { status: 400, headers: noStore },
      );
    }
    if (code === 'INVALID_MESSAGE_CONTENT') {
      return NextResponse.json(
        { message: 'Messages cannot contain null characters or exceed 10,000 characters.' },
        { status: 400, headers: noStore },
      );
    }
    if (code === 'INVALID_MESSAGE_ATTACHMENTS') {
      return NextResponse.json(
        { message: 'One or more message attachments are invalid.' },
        { status: 400, headers: noStore },
      );
    }
    if (code === 'MESSAGING_BLOCKED') {
      return NextResponse.json(
        { message: 'This message cannot be sent because one account has blocked the other.' },
        { status: 403, headers: noStore },
      );
    }
    if (code === 'RECIPIENT_UNAVAILABLE') {
      return NextResponse.json(
        { message: 'This account is currently unavailable.' },
        { status: 403, headers: noStore },
      );
    }

    console.error('Direct message creation failed:', {
      errorName: error instanceof Error ? error.name : 'NonError',
    });

    return NextResponse.json(
      { message: 'Your message could not be sent.' },
      { status: 500, headers: noStore },
    );
  }
}
