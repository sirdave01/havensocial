import { getBhidProfiles } from '@/lib/bhid/profile';
import { requireLinkedUser } from '@/lib/linked-user';
import {
  getNotifications,
  getUnreadNotificationCount,
} from '@/models/notification.js';
import NotificationList, {
  type NotificationListItem,
} from '../components/NotificationList';
import NotificationPushSettings from '../components/NotificationPushSettings';

export default async function NotificationsPage() {
  const user = await requireLinkedUser();

  const [notifications, unreadCount] = await Promise.all([
    getNotifications(user.users_id, 50),
    getUnreadNotificationCount(user.users_id),
  ]);

  const actorSubjects = notifications
    .map((notification: { actor_sub: string | null }) => notification.actor_sub)
    .filter((subject: string | null): subject is string => Boolean(subject));

  const profiles = await getBhidProfiles(actorSubjects);

  const items: NotificationListItem[] = notifications.map(
    (notification: Record<string, unknown>) => {
      const actorSub = notification.actor_sub
        ? String(notification.actor_sub)
        : null;
      const actorProfile = actorSub ? profiles.get(actorSub) : undefined;

      const createdAt = notification.created_at instanceof Date
        ? notification.created_at.toISOString()
        : new Date(String(notification.created_at)).toISOString();

      return {
        id: String(notification.notifications_id),
        actorSub,
        actorName: actorProfile?.name || 'HavenSocial user',
        actorUsername: actorProfile?.preferredUsername ?? null,
        actorPicture: actorProfile?.picture ?? null,
        type: String(notification.type),
        tweetId: notification.tweet_id == null
          ? null
          : String(notification.tweet_id),
        tweetContent: typeof notification.tweet_content === 'string'
          ? notification.tweet_content
          : null,
        read: Boolean(notification.read),
        createdAt,
      };
    },
  );

  return (
    <main className="feed-page">
      <h1>Notifications</h1>
      <NotificationPushSettings />
      <NotificationList
        initialNotifications={items}
        initialUnreadCount={unreadCount}
      />
    </main>
  );
}
