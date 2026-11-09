
import { NextResponse } from 'next/server';
import { getLinkedUser } from '@/lib/linked-user';
import { db } from '../../../../models/db.js';

type RouteContext = {
  params: Promise<{ tweetId: string }>;
};

const MINIMUM_DWELL_TIME_MS = 2_000;
const MAXIMUM_DWELL_TIME_MS = 10 * 60 * 1_000;
const VIEW_RULE_VERSION = 'visibility-50pct-2s-v1';

// PostgreSQL BIGINT maximum.
// String comparison avoids requiring the ES2020 BigInt target.
const MAX_POSTGRES_BIGINT = '9223372036854775807';

export async function POST(
  request: Request,
  { params }: RouteContext,
) {
  const user = await getLinkedUser();

  if (!user) {
    return NextResponse.json(
      { message: 'Please sign in to record a post view.' },
      { status: 401 },
    );
  }

  const { tweetId } = await params;

  // Validate a positive PostgreSQL BIGINT without using BigInt.
  if (
    !/^[1-9]\d*$/.test(tweetId) ||
    tweetId.length > 19 ||
    (
      tweetId.length === 19 &&
      tweetId > MAX_POSTGRES_BIGINT
    )
  ) {
    return NextResponse.json(
      { message: 'Invalid post ID.' },
      { status: 400 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: 'Invalid view request.' },
      { status: 400 },
    );
  }

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    return NextResponse.json(
      { message: 'Invalid view request.' },
      { status: 400 },
    );
  }

  const dwellTimeMs = (
    body as { dwellTimeMs?: unknown }
  ).dwellTimeMs;

  if (
    typeof dwellTimeMs !== 'number' ||
    !Number.isSafeInteger(dwellTimeMs) ||
    dwellTimeMs < MINIMUM_DWELL_TIME_MS ||
    dwellTimeMs > MAXIMUM_DWELL_TIME_MS
  ) {
    return NextResponse.json(
      { message: 'The post has not been viewed long enough.' },
      { status: 400 },
    );
  }

  // Confirm that the post exists and is not deleted.
  const original = await db.query<{
    user_id: string | number;
  }>(
    `SELECT user_id
     FROM tweets
     WHERE tweet_id = $1
       AND is_deleted = FALSE
       AND deleted_at IS NULL`,
    [tweetId],
  );

  if (!original.rows[0]) {
    return NextResponse.json(
      { message: 'Post not found.' },
      { status: 404 },
    );
  }

  // Do not count the author's own views.
  if (
    String(original.rows[0].user_id) ===
    String(user.users_id)
  ) {
    return NextResponse.json({
      ok: true,
      qualified: false,
      recorded: false,
      reason: 'own_post',
    });
  }

  // Insert a qualified view, or promote an existing PENDING view.
  const result = await db.query(
    `INSERT INTO tweet_views (
       tweet_id,
       user_id,
       dwell_time_ms,
       qualification_status,
       qualification_reason,
       qualified_at,
       qualification_rule_version
     )
     VALUES (
       $1,
       $2,
       $3,
       'QUALIFIED',
       NULL,
       CURRENT_TIMESTAMP,
       $4
     )
     ON CONFLICT (tweet_id, user_id)
     WHERE user_id IS NOT NULL
     DO UPDATE SET
       dwell_time_ms = GREATEST(
         COALESCE(tweet_views.dwell_time_ms, 0),
         EXCLUDED.dwell_time_ms
       ),
       qualification_status = 'QUALIFIED',
       qualification_reason = NULL,
       qualified_at = COALESCE(
         tweet_views.qualified_at,
         CURRENT_TIMESTAMP
       ),
       qualification_rule_version =
         EXCLUDED.qualification_rule_version
     WHERE tweet_views.qualification_status <> 'QUALIFIED'
     RETURNING view_id`,
    [
      tweetId,
      user.users_id,
      dwellTimeMs,
      VIEW_RULE_VERSION,
    ],
  );

  return NextResponse.json({
    ok: true,
    qualified: true,
    recorded: Boolean(result.rows[0]),
    alreadyCounted: !result.rows[0],
  });
}
