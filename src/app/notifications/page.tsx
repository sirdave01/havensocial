import Link from 'next/link';
import { getBhidProfiles } from '@/lib/bhid/profile';
import { requireLinkedUser } from '@/lib/linked-user';
import { getNotifications } from '../../models/notification.js';
import IdentityAvatar from '../components/IdentityAvatar';

export default async function NotificationsPage() {
  const user = await requireLinkedUser();
  const notifications = await getNotifications(user.users_id, 50);
  const profiles = await getBhidProfiles(
    notifications.map((notification: { actor_sub: string }) => notification.actor_sub),
  );

  return (
    <main className="feed-page">
      <h1>Notifications</h1>
      {notifications.length ? notifications.map((notification: Record<string, unknown>) => (
        <article className="feed-item" key={String(notification.notifications_id)}>
          <IdentityAvatar
            src={profiles.get(String(notification.actor_sub))?.picture}
            className="profile-avatar-small"
          />
          <Link href={`/profile/${encodeURIComponent(String(notification.actor_sub))}`}>
            {profiles.get(String(notification.actor_sub))?.name || 'HavenSocial user'}
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
