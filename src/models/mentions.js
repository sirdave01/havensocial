import { createNotification, dispatchNotificationPush } from './notification.js';

// Keep this expression aligned with MentionTextarea and PostContent.
const MENTION_PATTERN = /(^|[^\p{L}\p{N}_.+-])@([\p{L}\p{N}_][\p{L}\p{N}_.-]{0,49})/gu;

export function extractMentionUsernames(content) {
  const usernames = new Set();

  for (const match of content.matchAll(MENTION_PATTERN)) {
    const username = match[2]?.trim();
    if (username) usernames.add(username.toLocaleLowerCase());
  }

  return [...usernames];
}

/**
 * Synchronize the users mentioned in a post with its persistent mention rows.
 * This must be called inside the caller's database transaction.
 */
export async function syncTweetMentions(client, tweetId, content) {
  const usernames = extractMentionUsernames(content);
  let mentionedUserIds = [];

  if (usernames.length) {
    const result = await client.query(
      `SELECT DISTINCT ON (LOWER(p.preferred_username))
         u.users_id::text AS user_id
       FROM users u
       JOIN bhid_profile_cache p ON p.bhid_sub = u.bhid_sub
       WHERE u.app_status = 'ACTIVE'
         AND p.preferred_username IS NOT NULL
         AND LOWER(p.preferred_username) = ANY($1::text[])
       ORDER BY LOWER(p.preferred_username), u.users_id`,
      [usernames],
    );

    mentionedUserIds = result.rows.map((row) => String(row.user_id));
  }

  if (mentionedUserIds.length) {
    await client.query(
      `DELETE FROM tweet_mentions
       WHERE tweet_id = $1
         AND NOT (mentioned_user_id = ANY($2::bigint[]))`,
      [tweetId, mentionedUserIds],
    );

    await client.query(
      `INSERT INTO tweet_mentions (tweet_id, mentioned_user_id)
       SELECT $1, mentioned_user_id
       FROM UNNEST($2::bigint[]) AS mention(mentioned_user_id)
       ON CONFLICT (tweet_id, mentioned_user_id) DO NOTHING`,
      [tweetId, mentionedUserIds],
    );
  } else {
    await client.query(
      `DELETE FROM tweet_mentions WHERE tweet_id = $1`,
      [tweetId],
    );
  }

  return mentionedUserIds;
}

/**
 * Create in-app notifications for mentions whose post is already published.
 * Notification rows and tweet_mentions.notified_at are written in the same
 * transaction. Web Push is dispatched by the caller after COMMIT.
 */
export async function notifyPendingTweetMentions(client, tweetId, actorId) {
  const pending = await client.query(
    `SELECT tm.mentioned_user_id::text AS user_id
     FROM tweet_mentions tm
     JOIN tweets t ON t.tweet_id = tm.tweet_id
     WHERE tm.tweet_id = $1
       AND tm.notified_at IS NULL
       AND t.published_at IS NOT NULL
       AND t.is_deleted = FALSE
       AND t.deleted_at IS NULL
     ORDER BY tm.mentioned_user_id
     FOR UPDATE OF tm`,
    [tweetId],
  );

  const created = [];

  for (const row of pending.rows) {
    const userId = String(row.user_id);
    const notification = await createNotification(
      userId,
      actorId,
      'mention',
      tweetId,
      client,
      { deferPush: true },
    );

    await client.query(
      `UPDATE tweet_mentions
       SET notified_at = CURRENT_TIMESTAMP
       WHERE tweet_id = $1 AND mentioned_user_id = $2
         AND notified_at IS NULL`,
      [tweetId, userId],
    );

    if (notification) {
      created.push({
        notification,
        userId,
        actorId: String(actorId),
        tweetId: String(tweetId),
      });
    }
  }

  return created;
}

export async function dispatchMentionNotifications(notifications) {
  await Promise.allSettled(
    notifications.map(({ notification, actorId, tweetId }) =>
      dispatchNotificationPush(notification, actorId, 'mention', tweetId),
    ),
  );
}
