import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { readJsonObject } from '@/lib/http';
import {
  abortMultipartMediaUpload,
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
  if (!body || typeof body.key !== 'string' || typeof body.uploadId !== 'string') {
    return NextResponse.json({ message: 'Invalid video abort request.' }, {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  try {
    await abortMultipartMediaUpload(user.users_id, body.key, body.uploadId);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof MediaValidationError) {
      return NextResponse.json({ message: error.message }, {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    if (error instanceof MediaStorageConfigurationError) {
      return NextResponse.json({ message: 'Video upload cleanup is temporarily unavailable.' }, {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    // A multipart upload may already have completed or expired; cleanup is best-effort.
    console.warn('Could not abort HavenSocial video multipart upload:', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return NextResponse.json({ ok: false }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
