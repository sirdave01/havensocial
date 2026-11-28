import { NextResponse } from 'next/server';

import { getLinkedUser } from '@/lib/linked-user';
import { readJsonObject } from '@/lib/http';
import {
  createMediaUpload,
  MediaStorageConfigurationError,
  MediaValidationError,
} from '@/lib/media';
import {
  createMessageMediaUpload,
  MessageMediaStorageConfigurationError,
  MessageMediaValidationError,
} from '@/lib/message-media';
import { getDirectConversationForUser } from '@/models/messaging.js';

export const runtime = 'nodejs';

const noStore = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  const user = await getLinkedUser();
  if (!user) {
    return NextResponse.json(
      { message: 'Your session has expired. Please sign in again.' },
      { status: 401, headers: noStore },
    );
  }

  const body = await readJsonObject(request);
  if (!body || typeof body.kind !== 'string' || typeof body.contentType !== 'string') {
    return NextResponse.json(
      { message: 'Invalid media upload request.' },
      { status: 400, headers: noStore },
    );
  }

  const contentType = body.contentType.trim().toLowerCase();
  const size = Number(body.size);

  try {
    // Keep the existing public feed-media upload contract unchanged.
    if (body.kind === 'posts') {
      const upload = await createMediaUpload(user.users_id, contentType, size);
      return NextResponse.json(upload, { headers: noStore });
    }

    if (body.kind === 'messages') {
      const conversationId = String(body.conversationId ?? '');
      const conversation = await getDirectConversationForUser(
        conversationId,
        user.users_id,
      );

      if (!conversation) {
        return NextResponse.json(
          { message: 'Conversation not found.' },
          { status: 404, headers: noStore },
        );
      }

      if (!conversation.can_send) {
        return NextResponse.json(
          { message: 'You cannot send attachments in this conversation.' },
          { status: 403, headers: noStore },
        );
      }

      const upload = await createMessageMediaUpload(
        conversation.conversation_id,
        user.users_id,
        contentType,
        size,
      );

      return NextResponse.json(upload, { headers: noStore });
    }

    return NextResponse.json(
      { message: 'Unsupported media upload destination.' },
      { status: 400, headers: noStore },
    );
  } catch (error) {
    if (
      error instanceof MediaValidationError ||
      error instanceof MessageMediaValidationError
    ) {
      return NextResponse.json(
        { message: error.message },
        { status: 400, headers: noStore },
      );
    }

    if (
      error instanceof MediaStorageConfigurationError ||
      error instanceof MessageMediaStorageConfigurationError
    ) {
      console.error('HavenSocial media storage configuration failed:', {
        errorName: error.name,
      });
      return NextResponse.json(
        { message: 'Media uploads are temporarily unavailable. Please try again later.' },
        { status: 503, headers: noStore },
      );
    }

    console.error('Could not create HavenSocial media upload URL:', {
      errorName: error instanceof Error ? error.name : 'NonError',
    });
    return NextResponse.json(
      { message: 'We could not prepare your upload. Please try again shortly.' },
      { status: 503, headers: noStore },
    );
  }
}
