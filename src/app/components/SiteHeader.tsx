import Link from 'next/link';

import { getCurrentBhidProfile } from '@/lib/bhid/profile';
import { getLinkedUser } from '@/lib/linked-user';
import { getUnreadNotificationCount } from '@/models/notification.js';

import IdentityAvatar from './IdentityAvatar';
import NavIcon, { type NavIconName } from './NavIcon';
import NotificationNavItem from './NotificationNavItem';
import ThemeToggle from './ThemeToggle';

const navigation: { href: string; label: string; icon: NavIconName }[] = [
  { href: '/feed', label: 'Home', icon: 'home' },
  { href: '/search', label: 'Search', icon: 'search' },
  { href: '/profile', label: 'Profile', icon: 'profile' },
  { href: '/notifications', label: 'Notifications', icon: 'notifications' },
];

export default async function SiteHeader() {
  const user = await getLinkedUser();

  const [profile, unreadCount] = user
    ? await Promise.all([
        getCurrentBhidProfile(user.bhid_sub),
        getUnreadNotificationCount(user.users_id),
      ])
    : [null, 0];

  return (
    <header>
      <div className="header-container">
        <Link href="/" className="logo" aria-label="HavenSocial Home">
          <img src="/images/havensocial_logo.webp" alt="HavenSocial" />
        </Link>

        <div className="header-actions">
          <ThemeToggle />
          {user && (
            <form action="/auth/logout" method="post" className="nav-logout">
              <button
                type="submit"
                className="header-icon-button"
                aria-label="Sign out"
                title="Sign out"
              >
                <NavIcon name="logout" />
              </button>
            </form>
          )}
        </div>
      </div>

      {user && (
        <nav className="site-nav" aria-label="Main navigation">
          {navigation.map((item) => {
            if (item.label === 'Notifications') {
              return (
                <NotificationNavItem
                  key={item.label}
                  initialCount={unreadCount}
                />
              );
            }

            const href = item.label === 'Profile'
              ? `/profile/${encodeURIComponent(user.bhid_sub)}`
              : item.href;

            return (
              <Link href={href} className="nav-item" key={item.label}>
                {item.label === 'Profile'
                  ? <IdentityAvatar src={profile?.picture} className="nav-avatar" />
                  : <NavIcon name={item.icon} />}
                <span>{item.label}</span>
              </Link>
            );
          })}

          {user.role_name === 'founder' && (
            <Link href="/users" className="nav-item">
              <NavIcon name="users" />
              <span>Users</span>
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
