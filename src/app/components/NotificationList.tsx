'use client';

import Link from 'next/link';
import { useState } from 'react';

export type NotificationListItem = {
  id: string;
  actorSub: string | null;
  actorName: string;
  actorUsername: string | null;
  actorPicture: string | null;
  type: string;
  tweetId: string | null;
  tweetContent: string | null;
  read: boolean;
  createdAt: string;
};

function notificationMessage(type: string) {
  switch (type.toLowerCase()) {
    case 'follow':
      return 'started following you.';
    case 'like':
      return 'liked your post.';
    case 'reply':
      return 'replied to your post.';
    case 'comment':
      return 'commented on your post.';
    case 'retweet':
    case 'reshare':
      return 'reshared your post.';
    case 'mention':
      return 'mentioned you.';
    default:
      return 'sent you a notification.';
  }
}

function notifyBadgeToRefresh() {
  window.dispatchEvent(new Event('havensocial:notifications-updated'));
}

export default function NotificationList({
  initialNotifications,
  initialUnreadCount,
}: {
  initialNotifications: NotificationListItem[];
  initialUnreadCount: number;
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [unreadCount, setUnreadCount] = useState(Math.max(0, initialUnreadCount));
  const [error, setError] = useState('');

  async function markOneAsRead(notificationId: string) {
    if (busyId || markingAll) return;

    setBusyId(notificationId);
    setError('');

    try {
      const response = await fetch(
        `/api/notifications/${encodeURIComponent(notificationId)}/read`,
        {
          method: 'PATCH',
          credentials: 'same-origin',
          cache: 'no-store',
        },
      );

      if (!response.ok) {
        throw new Error('Could not update this notification.');
      }

      setNotifications((current) => current.map((item) => (
        item.id === notificationId ? { ...item, read: true } : item
      )));
      setUnreadCount((current) => Math.max(0, current - 1));
      notifyBadgeToRefresh();
    } catch {
      setError('Could not update this notification. Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  async function markAllAsRead() {
    if (markingAll || unreadCount === 0) return;

    setMarkingAll(true);
    setError('');

    try {
      const response = await fetch('/api/notifications/read-all', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Could not update notifications.');
      }

      setNotifications((current) => current.map((item) => ({
        ...item,
        read: true,
      })));
      setUnreadCount(0);
      notifyBadgeToRefresh();
    } catch {
      setError('Could not mark notifications as read. Please try again.');
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <section className="notifications-list" aria-label="Your notifications">
      <div className="notifications-list-heading">
        <p aria-live="polite">
          {unreadCount > 0
            ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
            : 'You’re all caught up.'}
        </p>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllAsRead}
            disabled={markingAll}
          >
            {markingAll ? 'Updating…' : 'Mark all as read'}
          </button>
        )}
      </div>

      {error && <p role="alert">{error}</p>}

      {notifications.length === 0 ? (
        <p>You’re all caught up. New activity will appear here.</p>
      ) : (
        notifications.map((notification) => (
          <article
            className="feed-item notification-item"
            key={notification.id}
            aria-label={notification.read ? 'Read notification' : 'Unread notification'}
            style={!notification.read ? {
              borderLeft: '3px solid #2563eb',
              background: 'var(--notification-unread-background, rgba(37, 99, 235, 0.06))',
            } : undefined}
          >
            <div className="notification-item-content">
              {notification.actorPicture ? (
                // BHID owns this avatar URL; HavenSocial only displays it.
                <img
                  src={notification.actorPicture}
                  alt=""
                  className="profile-avatar-small"
                  loading="lazy"
                />
              ) : (
                <div className="profile-avatar-small notification-avatar-fallback" aria-hidden="true">
                  {notification.actorName.slice(0, 1).toUpperCase() || 'H'}
                </div>
              )}

              <div className="notification-item-text">
                <p>
                  {notification.actorSub ? (
                    <Link href={`/profile/${encodeURIComponent(notification.actorSub)}`}>
                      <strong>{notification.actorName}</strong>
                    </Link>
                  ) : (
                    <strong>{notification.actorName}</strong>
                  )}
                  {' '}{notificationMessage(notification.type)}
                  {!notification.read && <span className="notification-unread-label"> New</span>}
                </p>

                {notification.actorUsername && (
                  <small>@{notification.actorUsername}</small>
                )}

                <time dateTime={notification.createdAt}>
                  {new Date(notification.createdAt).toLocaleString()}
                </time>

                {notification.tweetId && (
                  <p>
                    <Link href={`/tweet/${encodeURIComponent(notification.tweetId)}`}>
                      View post
                    </Link>
                  </p>
                )}
              </div>
            </div>

            {!notification.read && (
              <button
                type="button"
                onClick={() => void markOneAsRead(notification.id)}
                disabled={busyId === notification.id || markingAll}
                aria-label="Mark notification as read"
              >
                {busyId === notification.id ? 'Updating…' : 'Mark as read'}
              </button>
            )}
          </article>
        ))
      )}
    </section>
  );
}
