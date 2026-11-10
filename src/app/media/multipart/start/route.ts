import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { readJsonObject } from '@/lib/http';
import {
  createMultipartMediaUpload,
  MediaStorageConfigurationError,
  MediaValidationError,
} from '@/lib/media';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = await getLinkedUser();
  if (!user) {
    return NextResponse.json({ message: 'Your session has expired. Please sign in again.' }, {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const body = await readJsonObject(request);
  if (!body || typeof body.contentType !== 'string') {
    return NextResponse.json({ message: 'Invalid video upload request.' }, {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  try {
    const result = await createMultipartMediaUpload(
      user.users_id,
      body.contentType.trim().toLowerCase(),
      Number(body.size),
    );
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof MediaValidationError) {
      return NextResponse.json({ message: error.message }, {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    if (error instanceof MediaStorageConfigurationError) {
      console.error('Video multipart storage configuration failed:', { errorName: error.name });
      return NextResponse.json({ message: 'Video uploads are temporarily unavailable. Please try again later.' }, {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    console.error('Could not start HavenSocial video multipart upload:', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return NextResponse.json({ message: 'We could not prepare your video upload. Please try again.' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
