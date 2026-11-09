import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '../../../../models/db.js';

export const runtime = 'nodejs';

function hasValidCronSecret(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization') || '';

  if (!configuredSecret || configuredSecret.length < 32) return false;

  const supplied = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : '';

  const expectedBuffer = Buffer.from(configuredSecret);
  const suppliedBuffer = Buffer.from(supplied);

  return suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer);
}

async function publishDuePosts(request: Request) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const result = await db.query(
    `WITH due_posts AS (
       SELECT tweet_id
       FROM tweets
       WHERE published_at IS NULL
         AND scheduled_at IS NOT NULL
         AND scheduled_at <= CURRENT_TIMESTAMP
         AND is_deleted = FALSE
         AND deleted_at IS NULL
       ORDER BY scheduled_at ASC, tweet_id ASC
       LIMIT 100
       FOR UPDATE SKIP LOCKED
     )
     UPDATE tweets AS t
     SET published_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     FROM due_posts AS due
     WHERE t.tweet_id = due.tweet_id
     RETURNING t.tweet_id::text AS tweet_id, t.scheduled_at`,
  );

  return NextResponse.json(
    {
      ok: true,
      publishedCount: result.rowCount ?? result.rows.length,
      published: result.rows,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(request: Request) {
  try {
    return await publishDuePosts(request);
  } catch (error) {
    console.error('Scheduled post publishing failed:', {
      errorName: error instanceof Error ? error.name : 'NonError',
    });
    return NextResponse.json(
      { message: 'Scheduled posts could not be published.' },
      { status: 500 },
    );
  }
}
