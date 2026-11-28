import { NextResponse } from 'next/server';

import { getLinkedUser } from '@/lib/linked-user';
import {
  getMessageMediaKeyDetails,
  MessageMediaValidationError,
  saveLocalMessageMedia,
} from '@/lib/message-media';
import { getDirectConversationForUser } from '@/models/messaging.js';

export const runtime = 'nodejs';

export async function PUT(request: Request) {
  const user = await getLinkedUser();
  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const key = new URL(request.url).searchParams.get('key') || '';
    const details = getMessageMediaKeyDetails(key);

    if (
      details.storage !== 'local' ||
      details.ownerId !== String(user.users_id)
    ) {
      return NextResponse.json(
        { message: 'Invalid private attachment upload key.' },
        { status: 400 },
      );
    }

    const conversation = await getDirectConversationForUser(
      details.conversationId,
      user.users_id,
    );

    if (!conversation) {
      return NextResponse.json({ message: 'Conversation not found.' }, { status: 404 });
    }
    if (!conversation.can_send) {
      return NextResponse.json(
        { message: 'You cannot upload attachments in this conversation.' },
        { status: 403 },
      );
    }

    const contentType = request.headers.get('content-type') || '';
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 15 * 1024 * 1024) {
      return NextResponse.json({ message: 'Each attachment must be 15 MB or smaller.' }, { status: 413 });
    }

    const bytes = new Uint8Array(await request.arrayBuffer());
    const saved = await saveLocalMessageMedia(
      key,
      details.conversationId,
      user.users_id,
      contentType,
      bytes,
    );

    return NextResponse.json(saved, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof MessageMediaValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    console.error('Local private message media upload failed:', {
      errorName: error instanceof Error ? error.name : 'NonError',
    });
    return NextResponse.json(
      { message: 'The attachment could not be uploaded.' },
      { status: 500 },
    );
  }
}
