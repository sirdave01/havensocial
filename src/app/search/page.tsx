import Link from 'next/link';
import { requireLinkedUser } from '@/lib/linked-user';
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
      `SELECT users_id, username, display_name, bio, profile_picture_url
       FROM users
       WHERE deleted_at IS NULL
         AND (username ILIKE $1 OR display_name ILIKE $1 OR full_name ILIKE $1 OR bio ILIKE $1)
       ORDER BY username ILIKE $2 DESC, created_at DESC
       LIMIT 50`,
      [`%${query}%`, query],
    )
    : { rows: [] };

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
          <Link href={`/profile/${encodeURIComponent(String(person.username))}`}>
            {String(person.display_name || person.username)} (@{String(person.username)})
          </Link>
          {Boolean(person.bio) && <p>{String(person.bio)}</p>}
        </article>
      ))}
    </main>
  );
}
