import Link from 'next/link';
import { requireLinkedUser } from '@/lib/linked-user';
import { getNotifications } from '../../models/notification.js';

export default async function NotificationsPage() {
  const user = await requireLinkedUser();
  const notifications = await getNotifications(user.users_id, 50);

  return (
    <main className="feed-page">
      <h1>Notifications</h1>
      {notifications.length ? notifications.map((notification: Record<string, unknown>) => (
        <article className="feed-item" key={String(notification.notifications_id)}>
          <Link href={`/profile/${encodeURIComponent(String(notification.actor_username))}`}>
            {String(notification.actor_display_name || notification.actor_username)}
          </Link>
          {' '}{String(notification.type)}d you.
          {Boolean(notification.tweet_id) && (
            <Link href={`/tweet/${String(notification.tweet_id)}`}> View post</Link>
          )}
        </article>
      )) : <p>You’re all caught up.</p>}
    </main>
  );
}
