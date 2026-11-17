import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { pool } from '@/models/db.js';
import {
  createFollowedPostNotifications,
  dispatchNotificationPush,
} from '@/models/notification.js';
import {
  dispatchMentionNotifications,
  notifyPendingTweetMentions,
  syncTweetMentions,
} from '@/models/mentions.js';

export const runtime = 'nodejs';

function jsonResponse(body: Record<string, unknown>, status = 200) {
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

  if (!configuredSecret || configuredSecret.length < 32) return false;
  if (!authorization.startsWith('Bearer ')) return false;

  const suppliedBuffer = Buffer.from(authorization.slice(7), 'utf8');
  const expectedBuffer = Buffer.from(configuredSecret, 'utf8');

  if (suppliedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(suppliedBuffer, expectedBuffer);
}

async function publishDuePosts(request: Request) {
  if (!hasValidCronSecret(request)) {
    return jsonResponse({ message: 'Unauthorized' }, 401);
  }

  const client = await pool.connect();
  let mentionNotifications = [];
  let followedPostNotifications = [];
  let published = [];
  let dueBefore = { due_count: 0, oldest_due_at: null as Date | string | null };
  let remainingDueCount = 0;

  try {
    await client.query('BEGIN');

    const dueStats = await client.query(
      `SELECT COUNT(*)::int AS due_count,
              MIN(scheduled_at) AS oldest_due_at
       FROM tweets
       WHERE published_at IS NULL
         AND scheduled_at IS NOT NULL
         AND scheduled_at <= CURRENT_TIMESTAMP
         AND is_deleted = FALSE
         AND deleted_at IS NULL`,
    );
    dueBefore = dueStats.rows[0] || dueBefore;

    // Lock due rows before changing publication state. Concurrent invocations
    // cannot publish the same post or create its follower notifications twice.
    const dueRows = await client.query(
      `SELECT tweet_id::text AS tweet_id, user_id::text AS user_id, content
       FROM tweets
       WHERE published_at IS NULL
         AND scheduled_at IS NOT NULL
         AND scheduled_at <= CURRENT_TIMESTAMP
         AND is_deleted = FALSE
         AND deleted_at IS NULL
       ORDER BY scheduled_at ASC, tweet_id ASC
       LIMIT 100
       FOR UPDATE SKIP LOCKED`,
    );

    const dueIds = dueRows.rows.map((row) => String(row.tweet_id));

    if (dueIds.length) {
      const publishResult = await client.query(
        `UPDATE tweets
         SET published_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE tweet_id = ANY($1::bigint[])
           AND published_at IS NULL
           AND scheduled_at <= CURRENT_TIMESTAMP
           AND is_deleted = FALSE
           AND deleted_at IS NULL
         RETURNING tweet_id::text AS tweet_id,
                   user_id::text AS user_id,
                   scheduled_at,
                   published_at,
                   content`,
        [dueIds],
      );

      published = publishResult.rows;

      for (const post of published) {
        // Re-resolve final text in case the scheduled post was edited.
        await syncTweetMentions(client, post.tweet_id, post.content || '');
        const pendingMentions = await notifyPendingTweetMentions(
          client,
          post.tweet_id,
          post.user_id,
        );
        mentionNotifications.push(...pendingMentions);

        // Only original posts notify followers. createFollowedPostNotifications
        // also checks is_reply_to IS NULL and published_at inside its SQL.
        const postNotifications = await createFollowedPostNotifications(
          client,
          post.user_id,
          post.tweet_id,
        );
        followedPostNotifications.push(...postNotifications);
      }
    }

    const remaining = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM tweets
       WHERE published_at IS NULL
         AND scheduled_at IS NOT NULL
         AND scheduled_at <= CURRENT_TIMESTAMP
         AND is_deleted = FALSE
         AND deleted_at IS NULL`,
    );
    remainingDueCount = Number(remaining.rows[0]?.count ?? 0);

    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Scheduled publishing rollback failed:', {
        errorName: rollbackError instanceof Error ? rollbackError.name : 'NonError',
      });
    }
    throw error;
  } finally {
    client.release();
  }

  // Deliver push only after the publishing transaction commits.
  const pushDispatches = [
    dispatchMentionNotifications(mentionNotifications),
    ...followedPostNotifications.map((notification) =>
      dispatchNotificationPush(
        notification,
        String(notification.actor_id),
        'new_post',
        String(notification.tweet_id),
      ),
    ),
  ];
  await Promise.allSettled(pushDispatches);

  const oldestDueAt = dueBefore.oldest_due_at
    ? new Date(dueBefore.oldest_due_at).toISOString()
    : null;
  const oldestDueDelayMinutes = dueBefore.oldest_due_at
    ? Math.max(
        0,
        Math.round(
          ((Date.now() - new Date(dueBefore.oldest_due_at).getTime()) / 60000) * 10,
        ) / 10,
      )
    : 0;

  return jsonResponse({
    ok: true,
    checkedAt: new Date().toISOString(),
    dueCountBefore: Number(dueBefore.due_count ?? 0),
    publishedCount: published.length,
    published,
    oldestDueAt,
    oldestDueDelayMinutes,
    remainingDueCount,
    mentionNotificationsCreated: mentionNotifications.length,
    followedPostNotificationsCreated: followedPostNotifications.length,
  });
}

async function handleCron(request: Request) {
  try {
    return await publishDuePosts(request);
  } catch (error) {
    console.error('Scheduled post publishing failed:', {
      errorName: error instanceof Error ? error.name : 'NonError',
    });

    return jsonResponse(
      { message: 'Scheduled posts could not be published.' },
      500,
    );
  }
}

// POST is the preferred method for scheduled publication.
export async function POST(request: Request) {
  return handleCron(request);
}

// Retained for compatibility with any existing caller still using GET.
export async function GET(request: Request) {
  return handleCron(request);
}
