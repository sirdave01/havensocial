
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '../../../../models/db.js';

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

function hasValidCronSecret(request: Request): boolean {
  const configuredSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization') || '';

  // Reject missing or weak server-side configuration.
  if (!configuredSecret || configuredSecret.length < 32) {
    return false;
  }

  // Require Bearer authentication.
  if (!authorization.startsWith('Bearer ')) {
    return false;
  }

  const supplied = authorization.slice(7);

  const expectedBuffer = Buffer.from(configuredSecret, 'utf8');
  const suppliedBuffer = Buffer.from(supplied, 'utf8');

  // timingSafeEqual requires buffers of equal length.
  if (suppliedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(suppliedBuffer, expectedBuffer);
}

async function publishDuePosts(request: Request) {
  // Authenticate the cron request independently of proxy.ts.
  if (!hasValidCronSecret(request)) {
    return jsonResponse(
      { message: 'Unauthorized' },
      401,
    );
  }

  const result = await db.query(
    `WITH due_posts AS MATERIALIZED (
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
     RETURNING
       t.tweet_id::text AS tweet_id,
       t.scheduled_at,
       t.published_at`,
  );

  const publishedCount =
    result.rowCount ?? result.rows.length;

  return jsonResponse({
    ok: true,
    publishedCount,
    published: result.rows,
  });
}

// POST is the preferred method for scheduled publication.
export async function POST(request: Request) {
  try {
    return await publishDuePosts(request);
  } catch (error) {
    console.error('Scheduled post publishing failed:', {
      errorName:
        error instanceof Error ? error.name : 'NonError',
    });

    return jsonResponse(
      { message: 'Scheduled posts could not be published.' },
      500,
    );
  }
}

// Retained temporarily for compatibility with your existing
// GitHub Actions workflow, which currently uses GET.
export async function GET(request: Request) {
  try {
    return await publishDuePosts(request);
  } catch (error) {
    console.error('Scheduled post publishing failed:', {
      errorName:
        error instanceof Error ? error.name : 'NonError',
    });

    return jsonResponse(
      { message: 'Scheduled posts could not be published.' },
      500,
    );
  }
}
