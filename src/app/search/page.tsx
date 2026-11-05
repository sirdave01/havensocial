import Link from 'next/link';
import { getBhidProfiles } from '@/lib/bhid/profile';
import { requireLinkedUser } from '@/lib/linked-user';
import IdentityAvatar from '../components/IdentityAvatar';
import { db } from '../../models/db.js';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireLinkedUser();
  const { q = '' } = await searchParams;
  const query = q.trim().slice(0, 100);
  const result = query.length >= 2
    ? await db.query(
      `SELECT users_id, bhid_sub
       FROM users
       WHERE app_status = 'ACTIVE'
         AND bhid_sub ILIKE $1
       ORDER BY bhid_sub ILIKE $2 DESC, created_at DESC
       LIMIT 50`,
      [`%${query}%`, query],
    )
    : { rows: [] };
  const profiles = await getBhidProfiles(result.rows.map((person: { bhid_sub: string }) => person.bhid_sub));

  return (
    <main className="feed-page">
      <h1>Search HavenSocial</h1>
      <form action="/search" method="get">
        <label htmlFor="search-query">Search users</label>
        <input id="search-query" type="search" name="q" defaultValue={query} minLength={2} />
        <button type="submit">Search</button>
      </form>
      {result.rows.map((person: Record<string, unknown>) => (
        <article className="feed-item" key={String(person.users_id)}>
          <IdentityAvatar
            src={profiles.get(String(person.bhid_sub))?.picture}
            className="profile-avatar-small"
          />
          <Link href={`/profile/${encodeURIComponent(String(person.bhid_sub))}`} className="post-author">
            <strong>{profiles.get(String(person.bhid_sub))?.name || 'HavenSocial user'}</strong>
            <span>
              {profiles.get(String(person.bhid_sub))?.preferredUsername
                ? `@${profiles.get(String(person.bhid_sub))?.preferredUsername}`
                : 'BHID account'}
            </span>
          </Link>
        </article>
      ))}
    </main>
  );
}
