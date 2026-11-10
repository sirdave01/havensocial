import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { readJsonObject } from '@/lib/http';
import {
  createMultipartPartUrl,
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
    return NextResponse.json({ message: 'Invalid video part request.' }, {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  try {
    const uploadUrl = await createMultipartPartUrl(
      user.users_id,
      body.key,
      body.uploadId,
      Number(body.partNumber),
    );
    return NextResponse.json({ uploadUrl }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof MediaValidationError) {
      return NextResponse.json({ message: error.message }, {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    if (error instanceof MediaStorageConfigurationError) {
      return NextResponse.json({ message: 'Video uploads are temporarily unavailable.' }, {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    console.error('Could not sign HavenSocial video part:', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return NextResponse.json({ message: 'Could not prepare this video part for upload.' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
