import {
  setVapidDetails,
  sendNotification,
} from 'web-push';

import { db } from './db.js';

let configuredFingerprint = null;

function configureWebPush() {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.WEB_PUSH_SUBJECT?.trim();

  if (!publicKey || !privateKey || !subject) return false;

  if (!subject.startsWith('mailto:') && !subject.startsWith('https://')) {
    throw new Error(
      'WEB_PUSH_SUBJECT must be a mailto: address or HTTPS URL',
    );
  }

  const fingerprint = `${publicKey}:${privateKey}:${subject}`;

  if (configuredFingerprint !== fingerprint) {
    setVapidDetails(subject, publicKey, privateKey);
    configuredFingerprint = fingerprint;
  }

  return true;
}

function buildNotification(
  type,
  actorName,
  tweetId,
  actorSub,
  notificationId,
  conversationId = null,
  badgeCount = null,
) {
  const name = actorName || 'Someone';
  const normalizedType = String(type || '').toLowerCase();

  let body;

  if (normalizedType === 'like') {
    body = `${name} liked your post.`;
  } else if (normalizedType === 'reply') {
    body = `${name} replied to your post.`;
  } else if (normalizedType === 'comment') {
    body = `${name} commented on your post.`;
  } else if (normalizedType === 'follow') {
    body = `${name} started following you.`;
  } else if (
    normalizedType === 'retweet' ||
    normalizedType === 'reshare'
  ) {
    body = `${name} reshared your post.`;
  } else if (normalizedType === 'mention') {
    body = `${name} mentioned you.`;
  } else if (normalizedType === 'new_post') {
    body = `${name} published a new post.`;
  } else if (normalizedType === 'message') {
    // Never put private message contents in push payloads.
    body = `${name} sent you a message.`;
  } else {
    body = `${name} sent you a notification.`;
  }

  let url = '/notifications';

  if (normalizedType === 'message' && conversationId != null) {
    url = `/messages/${encodeURIComponent(String(conversationId))}`;
  } else if (normalizedType === 'follow' && actorSub) {
    url = `/profile/${encodeURIComponent(actorSub)}`;
  } else if (tweetId != null) {
    url = `/tweet/${encodeURIComponent(String(tweetId))}`;
  }

  return {
    title: 'HavenSocial',
    body,
    icon: '/images/havensocial_logo.webp',
    badge: '/images/havensocial_logo.webp',
    tag: `havensocial-notification-${notificationId}`,
    badgeCount:
      Number.isInteger(badgeCount) && badgeCount >= 0
        ? badgeCount
        : null,
    data: { url },
  };
}

/**
 * Deliver a Web Push notification to every active subscription belonging
 * to the notification recipient.
 *
 * Push failures never invalidate the in-app notification.
 */
export async function sendUserPushNotification({
  userId,
  actorId = null,
  type,
  tweetId = null,
  conversationId = null,
  notificationId,
  badgeCount = null,
}) {
  try {
    if (!configureWebPush()) {
      return { delivered: 0, skipped: true };
    }

    const subscriptionsResult = await db.query(
      `SELECT ps.endpoint, ps.p256dh, ps.auth
       FROM push_subscriptions ps
       JOIN users u ON u.users_id = ps.user_id
       WHERE ps.user_id = $1
         AND u.app_status = 'ACTIVE'`,
      [userId],
    );

    if (!subscriptionsResult.rows.length) {
      return { delivered: 0, skipped: false };
    }

    let actorName = 'Someone';
    let actorSub = null;

    if (actorId != null) {
      const actorResult = await db.query(
        `SELECT
           u.bhid_sub,
           COALESCE(
             NULLIF(BTRIM(p.name), ''),
             NULLIF(BTRIM(p.preferred_username), '')
           ) AS display_name
         FROM users u
         LEFT JOIN bhid_profile_cache p ON p.bhid_sub = u.bhid_sub
         WHERE u.users_id = $1
         LIMIT 1`,
        [actorId],
      );

      actorName = actorResult.rows[0]?.display_name || actorName;
      actorSub = actorResult.rows[0]?.bhid_sub || null;
    }

    let authoritativeBadgeCount = badgeCount;

    if (
      !Number.isInteger(authoritativeBadgeCount) ||
      authoritativeBadgeCount < 0
    ) {
      const unreadResult = await db.query(
        `SELECT COUNT(*)::int AS count
         FROM notifications
         WHERE user_id = $1
           AND read = FALSE`,
        [userId],
      );

      authoritativeBadgeCount = Number(
        unreadResult.rows[0]?.count ?? 0,
      );
    }

    const payload = JSON.stringify(
      buildNotification(
        type,
        actorName,
        tweetId,
        actorSub,
        notificationId,
        conversationId,
        authoritativeBadgeCount,
      ),
    );

    const deliveries = await Promise.allSettled(
      subscriptionsResult.rows.map(async (row) => {
        const subscription = {
          endpoint: row.endpoint,
          keys: {
            p256dh: row.p256dh,
            auth: row.auth,
          },
        };

        try {
          await sendNotification(subscription, payload, {
            TTL: 60 * 60 * 24,
          });

          await db.query(
            `UPDATE push_subscriptions
             SET last_used_at = CURRENT_TIMESTAMP
             WHERE endpoint = $1`,
            [row.endpoint],
          );

          return true;
        } catch (error) {
          const statusCode =
            error &&
            typeof error === 'object' &&
            'statusCode' in error
              ? Number(error.statusCode)
              : 0;

          if (statusCode === 404 || statusCode === 410) {
            await db.query(
              'DELETE FROM push_subscriptions WHERE endpoint = $1',
              [row.endpoint],
            );
          } else {
            console.warn('Web Push delivery failed:', {
              statusCode: statusCode || undefined,
              errorName:
                error instanceof Error ? error.name : 'NonError',
            });
          }

          throw error;
        }
      }),
    );

    const delivered = deliveries.filter(
      (delivery) => delivery.status === 'fulfilled',
    ).length;

    return { delivered, skipped: false };
  } catch (error) {
    console.warn('Web Push could not be dispatched:', {
      errorName: error instanceof Error ? error.name : 'NonError',
    });

    return { delivered: 0, skipped: false };
  }
}