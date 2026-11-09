import { NextResponse } from 'next/server';

import { getLinkedUser } from '@/lib/linked-user';
import { readJsonObject } from '@/lib/http';
import {
  createMediaUpload,
  MediaStorageConfigurationError,
  MediaValidationError,
} from '@/lib/media';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = await getLinkedUser();

  if (!user) {
    return NextResponse.json(
      { message: 'Your session has expired. Please sign in again.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const body = await readJsonObject(request);

  if (
    !body ||
    body.kind !== 'posts' ||
    typeof body.contentType !== 'string'
  ) {
    return NextResponse.json(
      { message: 'Invalid media upload request.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const contentType = body.contentType.trim().toLowerCase();
  const size = Number(body.size);

  try {
    const upload = await createMediaUpload(
      user.users_id,
      contentType,
      size,
    );

    return NextResponse.json(
      upload,
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof MediaValidationError) {
      return NextResponse.json(
        { message: error.message },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (error instanceof MediaStorageConfigurationError) {
      console.error('Post media storage configuration failed:', {
        errorName: error.name,
        reason: error.message,
      });

      return NextResponse.json(
        {
          message:
            'Media uploads are temporarily unavailable. Please try again later.',
        },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const details = error as {
      name?: unknown;
      code?: unknown;
      $metadata?: {
        httpStatusCode?: number;
        requestId?: string;
        extendedRequestId?: string;
      };
    };

    console.error('Could not create HavenSocial S3 upload URL:', {
      errorName:
        typeof details?.name === 'string'
          ? details.name
          : 'UnknownError',
      errorCode:
        typeof details?.code === 'string'
          ? details.code
          : undefined,
      httpStatusCode: details?.$metadata?.httpStatusCode,
      requestId: details?.$metadata?.requestId,
      extendedRequestId: details?.$metadata?.extendedRequestId,
    });

    return NextResponse.json(
      {
        message:
          'We could not prepare your media upload. Please try again shortly.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
