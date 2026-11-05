import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { readJsonObject } from '@/lib/http';
import {
  createMediaUpload,
  MediaStorageConfigurationError,
  MediaValidationError,
} from '@/lib/media';

export async function POST(request: Request) {
  const user = await getLinkedUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const body = await readJsonObject(request);
  if (
    !body ||
    body.kind !== 'posts' ||
    typeof body.contentType !== 'string'
  ) {
    return NextResponse.json({ message: 'Invalid upload request' }, { status: 400 });
  }

  try {
    const upload = await createMediaUpload(
      user.users_id,
      body.contentType,
      Number(body.size),
    );
    return NextResponse.json(upload);
  } catch (error) {
    if (error instanceof MediaValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    if (error instanceof MediaStorageConfigurationError) {
      console.error('Post media storage is not configured:', error.message);
      return NextResponse.json(
        {
          message:
            'Post media uploads are unavailable. Configure the S3 bucket and server-side AWS credentials.',
        },
        { status: 503 },
      );
    }
    throw error;
  }
}
