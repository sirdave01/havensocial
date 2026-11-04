import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { readJsonObject } from '@/lib/http';
import { confirmUploadedMedia, MediaValidationError } from '@/lib/media';
import { db } from '../../../models/db.js';

export async function POST(request: Request) {
  const user = await getLinkedUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const body = await readJsonObject(request);
  if (!body || (body.remove !== true && typeof body.key !== 'string')) {
    return NextResponse.json({ message: 'A valid uploaded profile image or remove action is required' }, { status: 400 });
  }

  try {
    const pictureUrl = body.remove === true
      ? null
      : await confirmUploadedMedia(body.key as string, 'profile', user.users_id);
    const result = await db.query(
      `UPDATE users SET profile_picture_url = $1, updated_at = CURRENT_TIMESTAMP
       WHERE users_id = $2 AND deleted_at IS NULL
       RETURNING users_id`,
      [pictureUrl, user.users_id],
    );
    if (!result.rows[0]) return NextResponse.json({ message: 'User not found' }, { status: 404 });
    return NextResponse.json({ message: 'Profile image updated', pictureUrl });
  } catch (error) {
    if (error instanceof MediaValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    throw error;
  }
}
