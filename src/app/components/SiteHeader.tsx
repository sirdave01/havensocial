import Link from 'next/link';
import { hasPermission } from '@/lib/authorization';
import { getLinkedUser } from '@/lib/linked-user';

export default async function SiteHeader() {
  const user = await getLinkedUser();
  return (
    <header>
      <div className="header-container">
        <Link href="/" className="logo" aria-label="HavenSocial Home">
          <img src="/images/havensocial_logo.webp" alt="" />
          <span>HavenSocial</span>
        </Link>
        {user && (
          <nav className="site-nav" aria-label="Main navigation">
            <Link href="/feed">Home</Link>
            <Link href="/search">Search</Link>
            <Link href={`/profile/${encodeURIComponent(user.bhid_sub)}`}>Profile</Link>
            <Link href="/notifications">Notifications</Link>
            {hasPermission(user, 'users.manage') && <Link href="/users">Users</Link>}
            <form action="/auth/logout" method="post">
              <button type="submit" className="text-button">Sign out</button>
            </form>
          </nav>
        )}
      </div>
    </header>
  );
}
