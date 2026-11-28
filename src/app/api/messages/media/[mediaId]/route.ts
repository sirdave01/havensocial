import { NextResponse } from 'next/server';

import { getLinkedUser } from '@/lib/linked-user';
import {
  createMessageMediaReadUrl,
  MessageMediaValidationError,
  readLocalMessageMedia,
} from '@/lib/message-media';
import { getDirectMessageMediaForUser } from '@/models/messaging.js';

type RouteContext = {
  params: Promise<{ mediaId: string }>;
};

export const runtime = 'nodejs';

const MAX_POSTGRES_BIGINT = '9223372036854775807';
const noStoreHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
};

function isValidBigintId(value: string) {
  return (
    /^[1-9]\d{0,18}$/.test(value) &&
    value.length <= 19 &&
    !(value.length === 19 && value > MAX_POSTGRES_BIGINT)
  );
}

function safeFileName(value: string | null | undefined) {
  return String(value || 'attachment')
    .replace(/[\\/\r\n\u0000-\u001f\u007f"]/g, '_')
    .slice(0, 180) || 'attachment';
}

function contentDisposition(mediaType: string, fileName: string) {
  const disposition = mediaType === 'FILE' ? 'attachment' : 'inline';
  return `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(request: Request, { params }: RouteContext) {
  const user = await getLinkedUser();
  if (!user) {
    return NextResponse.json(
      { message: 'Unauthorized' },
      { status: 401, headers: noStoreHeaders },
    );
  }

  const { mediaId } = await params;
  if (!isValidBigintId(mediaId)) {
    return NextResponse.json(
      { message: 'Attachment not found.' },
      { status: 404, headers: noStoreHeaders },
    );
  }

  try {
    const media = await getDirectMessageMediaForUser(mediaId, user.users_id);
    if (!media) {
      return NextResponse.json(
        { message: 'Attachment not found.' },
        { status: 404, headers: noStoreHeaders },
      );
    }

    const fileName = safeFileName(media.file_name);
    const mimeType = String(media.mime_type || 'application/octet-stream');
    const mediaType = String(media.media_type || 'FILE').toUpperCase();

    if (String(media.storage_key).startsWith('local/messages/')) {
      const bytes = await readLocalMessageMedia(
        media.storage_key,
        media.conversation_id,
      );

      const rangeHeader = request.headers.get('range');
      const baseHeaders = {
        ...noStoreHeaders,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Content-Disposition': contentDisposition(mediaType, fileName),
      };

      if (rangeHeader) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
        if (!match) {
          return new NextResponse(null, {
            status: 416,
            headers: {
              ...baseHeaders,
              'Content-Range': `bytes */${bytes.byteLength}`,
            },
          });
        }

        let start: number;
        let end: number;

        if (!match[1] && match[2]) {
          const suffixLength = Number(match[2]);
          start = Math.max(0, bytes.byteLength - suffixLength);
          end = bytes.byteLength - 1;
        } else {
          start = match[1] ? Number(match[1]) : 0;
          const requestedEnd = match[2] ? Number(match[2]) : bytes.byteLength - 1;
          end = Math.min(requestedEnd, bytes.byteLength - 1);
        }

        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          (!match[1] && !match[2]) ||
          start < 0 ||
          start > end ||
          start >= bytes.byteLength
        ) {
          return new NextResponse(null, {
            status: 416,
            headers: {
              ...baseHeaders,
              'Content-Range': `bytes */${bytes.byteLength}`,
            },
          });
        }

        const partial = bytes.subarray(start, end + 1);
        return new NextResponse(partial as unknown as BodyInit, {
          status: 206,
          headers: {
            ...baseHeaders,
            'Content-Length': String(partial.byteLength),
            'Content-Range': `bytes ${start}-${end}/${bytes.byteLength}`,
          },
        });
      }

      return new NextResponse(bytes as unknown as BodyInit, {
        status: 200,
        headers: {
          ...baseHeaders,
          'Content-Length': String(bytes.byteLength),
        },
      });
    }

    const signedUrl = await createMessageMediaReadUrl(
      media.storage_key,
      fileName,
      mimeType,
      mediaType as 'IMAGE' | 'VIDEO' | 'GIF' | 'FILE',
    );

    return NextResponse.redirect(signedUrl, {
      status: 302,
      headers: noStoreHeaders,
    });
  } catch (error) {
    if (error instanceof MessageMediaValidationError) {
      return NextResponse.json(
        { message: 'Attachment not found.' },
        { status: 404, headers: noStoreHeaders },
      );
    }

    console.error('Private message attachment retrieval failed:', {
      errorName: error instanceof Error ? error.name : 'NonError',
    });

    return NextResponse.json(
      { message: 'This attachment could not be retrieved.' },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
