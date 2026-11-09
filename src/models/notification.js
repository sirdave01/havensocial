import { db } from './db.js';
import { sendUserPushNotification } from './push-notification.js';

/**
 * Create a notification for a recipient.
 * Self-notifications are ignored. An optional transaction client can be
 * supplied by callers that need the notification in the same transaction.
 *
 * @param {number|string} userId
 * @param {number|string|null} actorId
 * @param {string} type
 * @param {number|string|null} [tweetId]
 * @param {import('pg').PoolClient|null} [client]
 */
const createNotification = async (
  userId,
  actorId,
  type,
  tweetId = null,
  client = null,
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

  if (notification) {
    // Push is best-effort: a push-provider failure must never undo the
    // notification stored in Neon. This is awaited so serverless execution
    // does not discard a fire-and-forget request at the end of the response.
    await sendUserPushNotification({
      userId,
      actorId,
      type,
      tweetId,
      notificationId: notification.notifications_id,
    });
  }

  return notification;
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
  getNotifications,
  getUnreadNotificationCount,
  markAsRead,
  markAllAsRead,
};
