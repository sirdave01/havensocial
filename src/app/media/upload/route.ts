import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { MediaValidationError, saveLocalMedia } from '@/lib/media';

export const runtime = 'nodejs';
const MAX_POST_MEDIA_SIZE = 15 * 1024 * 1024;

export async function PUT(request: Request) {
  const user = await getLinkedUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const key = new URL(request.url).searchParams.get('key');
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim();
  if (!key || !contentType || !request.body) {
    return NextResponse.json({ message: 'Invalid media upload' }, { status: 400 });
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_POST_MEDIA_SIZE) {
        await reader.cancel();
        return NextResponse.json({ message: 'Media exceeds the 15 MB limit' }, { status: 413 });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return NextResponse.json(await saveLocalMedia(key, user.users_id, contentType, bytes));
  } catch (error) {
    if (error instanceof MediaValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    throw error;
  }
}
