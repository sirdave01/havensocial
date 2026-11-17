import { db } from './db.js';
import { sendUserPushNotification } from './push-notification.js';

/**
 * Create a notification for a recipient.
 * Self-notifications are ignored. An optional transaction client can be
 * supplied by callers that need the notification in the same transaction.
 *
 * The final options argument supports deferring Web Push until after COMMIT.
 * @param {number|string} userId
 * @param {number|string|null} actorId
 * @param {string} type
 * @param {number|string|null} [tweetId]
 * @param {import('pg').PoolClient|null} [client]
 * @param {{deferPush?: boolean}} [options]
 */
const createNotification = async (
  userId,
  actorId,
  type,
  tweetId = null,
  client = null,
  options = {},
) => {
  if (actorId != null && String(userId) === String(actorId)) {
    return null;
  }

  const query = `
    INSERT INTO notifications (user_id, actor_id, type, tweet_id)
    SELECT recipient.users_id, actor.users_id, $3, $4
    FROM users recipient
    LEFT JOIN users actor ON actor.users_id = $2
    WHERE recipient.users_id = $1
      AND recipient.app_status = 'ACTIVE'
      AND ($2::bigint IS NULL OR actor.app_status = 'ACTIVE')
      AND ($2::bigint IS NULL OR recipient.users_id <> actor.users_id)
    RETURNING *;
  `;

  const executor = client || db;
  const result = await executor.query(query, [userId, actorId, type, tweetId]);
  const notification = result.rows[0] ?? null;

  if (notification && !options.deferPush) {
    await dispatchNotificationPush(notification, actorId, type, tweetId);
  }

  return notification;
};

/**
 * Create one `new_post` notification for each active follower of an author's
 * newly published original post. The caller must pass its transaction client.
 * A partial unique index makes retries safe and prevents duplicate records.
 *
 * @param {import('pg').PoolClient} client
 * @param {number|string} actorId
 * @param {number|string} tweetId
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
const createFollowedPostNotifications = async (client, actorId, tweetId) => {
  const result = await client.query(
    `INSERT INTO notifications (user_id, actor_id, type, tweet_id)
     SELECT DISTINCT
       recipient.users_id,
       author.users_id,
       'new_post',
       post.tweet_id
     FROM tweets post
     JOIN users author
       ON author.users_id = post.user_id
      AND author.app_status = 'ACTIVE'
     JOIN follows f
       ON f.followee_id = author.users_id
     JOIN users recipient
       ON recipient.users_id = f.follower_id
      AND recipient.app_status = 'ACTIVE'
     WHERE post.tweet_id = $2
       AND post.user_id = $1
       AND post.is_reply_to IS NULL
       AND post.published_at IS NOT NULL
       AND post.is_deleted = FALSE
       AND post.deleted_at IS NULL
       AND recipient.users_id <> author.users_id
     ON CONFLICT (user_id, actor_id, tweet_id)
       WHERE type = 'new_post' AND tweet_id IS NOT NULL
       DO NOTHING
     RETURNING *`,
    [actorId, tweetId],
  );

  return result.rows;
};

/**
 * Dispatch Web Push for an already-persisted notification.
 * @param {number|string|null} actorId
 * @param {string} type
 * @param {number|string|null} [tweetId]
 */
const dispatchNotificationPush = async (
  notification,
  actorId,
  type,
  tweetId = null,
) => {
  if (!notification) return { delivered: 0, skipped: true };

  return sendUserPushNotification({
    userId: notification.user_id,
    actorId,
    type,
    tweetId,
    notificationId: notification.notifications_id,
  });
};

/** Retrieve the newest notifications for a user. */
const getNotifications = async (userId, limit = 20) => {
  const safeLimit = Number.isInteger(limit)
    ? Math.min(Math.max(limit, 1), 100)
    : 20;

  const query = `
    SELECT
      n.*,
      u.bhid_sub AS actor_sub,
      t.content AS tweet_content
    FROM notifications n
    LEFT JOIN users u ON n.actor_id = u.users_id
    LEFT JOIN tweets t ON n.tweet_id = t.tweet_id
    WHERE n.user_id = $1
    ORDER BY n.created_at DESC, n.notifications_id DESC
    LIMIT $2;
  `;

  const result = await db.query(query, [userId, safeLimit]);
  return result.rows;
};

/** Return the unread notification count for a user. */
const getUnreadNotificationCount = async (userId) => {
  const result = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM notifications
     WHERE user_id = $1 AND read = FALSE`,
    [userId],
  );

  return Number(result.rows[0]?.count ?? 0);
};

/** Mark one notification as read, scoped to its owner. */
const markAsRead = async (notificationId, userId) => {
  const result = await db.query(
    `UPDATE notifications
     SET read = TRUE
     WHERE notifications_id = $1
       AND user_id = $2
       AND read = FALSE
     RETURNING notifications_id`,
    [notificationId, userId],
  );

  return result.rows[0] ?? null;
};

/** Mark all of a user's unread notifications as read. */
const markAllAsRead = async (userId) => {
  const result = await db.query(
    `UPDATE notifications
     SET read = TRUE
     WHERE user_id = $1
       AND read = FALSE
     RETURNING notifications_id`,
    [userId],
  );

  return result.rowCount ?? result.rows.length;
};

export {
  createNotification,
  createFollowedPostNotifications,
  dispatchNotificationPush,
  getNotifications,
  getUnreadNotificationCount,
  markAsRead,
  markAllAsRead,
};
