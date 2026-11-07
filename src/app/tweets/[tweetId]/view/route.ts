
import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { db } from '../../../../models/db.js';

type RouteContext = {
  params: Promise<{ tweetId: string }>;
};

export async function POST(
  _request: Request,
  { params }: RouteContext,
) {
  // 1. Require an authenticated HavenSocial account.
  const user = await getLinkedUser();

  if (!user) {
    return NextResponse.json(
      { message: 'Unauthorized' },
      { status: 401 },
    );
  }

  // 2. Validate the post ID.
  const { tweetId } = await params;

  if (!/^[1-9]\d*$/.test(tweetId)) {
    return NextResponse.json(
      { message: 'Invalid post ID' },
      { status: 400 },
    );
  }

  // 3. Confirm that the post exists and is not deleted.
  const original = await db.query(
    `SELECT user_id
     FROM tweets
     WHERE tweet_id = $1
       AND is_deleted = FALSE
       AND deleted_at IS NULL`,
    [tweetId],
  );

  if (!original.rows[0]) {
    return NextResponse.json(
      { message: 'Post not found' },
      { status: 404 },
    );
  }

  // 4. Do not count the author's own views.
  if (String(original.rows[0].user_id) === String(user.users_id)) {
    return NextResponse.json({
      ok: true,
      recorded: false,
      reason: 'own_post',
    });
  }

  // 5. Record one view per authenticated account per post.
  const result = await db.query(
    `INSERT INTO tweet_views (
       tweet_id,
       user_id,
       qualification_status
     )
     VALUES ($1, $2, 'PENDING')
     ON CONFLICT (tweet_id, user_id)
     WHERE user_id IS NOT NULL
     DO NOTHING
     RETURNING view_id`,
    [tweetId, user.users_id],
  );

  // 6. Always return a valid response.
  return NextResponse.json({
    ok: true,
    recorded: Boolean(result.rows[0]),
  });
}
