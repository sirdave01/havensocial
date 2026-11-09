import webpush from 'web-push';
import { db } from './db.js';

let configuredFingerprint = null;

function configureWebPush() {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.WEB_PUSH_SUBJECT?.trim();

  if (!publicKey || !privateKey || !subject) {
    return false;
  }

  if (!subject.startsWith('mailto:') && !subject.startsWith('https://')) {
    throw new Error('WEB_PUSH_SUBJECT must be a mailto: address or HTTPS URL');
  }

  const fingerprint = `${publicKey}:${privateKey}:${subject}`;
  if (configuredFingerprint !== fingerprint) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configuredFingerprint = fingerprint;
  }

  return true;
}

function buildNotification(type, actorName, tweetId, actorSub, notificationId) {
  const name = actorName || 'Someone';
  const normalizedType = String(type || '').toLowerCase();

  let body;
  if (normalizedType === 'like') body = `${name} liked your post.`;
  else if (normalizedType === 'reply') body = `${name} replied to your post.`;
  else if (normalizedType === 'comment') body = `${name} commented on your post.`;
  else if (normalizedType === 'follow') body = `${name} started following you.`;
  else if (normalizedType === 'retweet' || normalizedType === 'reshare') body = `${name} reshared your post.`;
  else if (normalizedType === 'mention') body = `${name} mentioned you.`;
  else body = `${name} sent you a notification.`;

  let url = '/notifications';
  if (normalizedType === 'follow' && actorSub) {
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
    data: { url },
  };
}

/**
 * Deliver a Web Push notification to every active subscription owned by
 * the recipient. Push failures never invalidate the in-app notification.
 */
export async function sendUserPushNotification({
  userId,
  actorId = null,
  type,
  tweetId = null,
  notificationId,
}) {
  try {
    if (!configureWebPush()) {
      // Push is optional until VAPID environment variables are configured.
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

    const payload = JSON.stringify(
      buildNotification(type, actorName, tweetId, actorSub, notificationId),
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
          await webpush.sendNotification(subscription, payload, {
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
            error && typeof error === 'object' && 'statusCode' in error
              ? Number(error.statusCode)
              : 0;

          if (statusCode === 404 || statusCode === 410) {
            await db.query(
              `DELETE FROM push_subscriptions WHERE endpoint = $1`,
              [row.endpoint],
            );
          } else {
            console.warn('Web Push delivery failed:', {
              statusCode: statusCode || undefined,
              errorName: error instanceof Error ? error.name : 'NonError',
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
