import Link from 'next/link';

import { getBhidProfiles } from '@/lib/bhid/profile';
import { requireLinkedUser } from '@/lib/linked-user';
import { db } from '../../models/db.js';
import IdentityAvatar from '../components/IdentityAvatar';

const MIN_SEARCH_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
const RESULT_LIMIT = 50;

type SearchResult = {
  users_id: string;
  bhid_sub: string;
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireLinkedUser();

  const { q = '' } = await searchParams;
  const query = q.trim().slice(0, MAX_QUERY_LENGTH);

  const result = query.length >= MIN_SEARCH_LENGTH
    ? await db.query<SearchResult>(
        `SELECT
           u.users_id::text AS users_id,
           u.bhid_sub
         FROM users u
         LEFT JOIN bhid_profile_cache p
           ON p.bhid_sub = u.bhid_sub
         WHERE u.app_status = 'ACTIVE'
           AND (
             POSITION(LOWER($1) IN LOWER(u.bhid_sub)) > 0
             OR POSITION(LOWER($1) IN LOWER(COALESCE(p.preferred_username, ''))) > 0
             OR POSITION(LOWER($1) IN LOWER(COALESCE(p.name, ''))) > 0
           )
         ORDER BY
           (LEFT(LOWER(COALESCE(p.preferred_username, '')), CHAR_LENGTH($1)) = LOWER($1)) DESC,
           (LEFT(LOWER(COALESCE(p.name, '')), CHAR_LENGTH($1)) = LOWER($1)) DESC,
           u.created_at DESC
         LIMIT $2`,
        [query, RESULT_LIMIT],
      )
    : { rows: [] as SearchResult[] };

  const profiles = await getBhidProfiles(
    result.rows.map((person) => person.bhid_sub),
  );

  return (
    <main className="feed-page">
      <h1>Search HavenSocial</h1>

      <form action="/search" method="get">
        <label htmlFor="search-query">Search users by name, username or BHID</label>
        <input
          id="search-query"
          type="search"
          name="q"
          defaultValue={query}
          minLength={MIN_SEARCH_LENGTH}
          maxLength={MAX_QUERY_LENGTH}
          placeholder="Enter a name, username or BHID…"
        />
        <button type="submit">Search</button>
      </form>

      {query.length > 0 && query.length < MIN_SEARCH_LENGTH && (
        <p role="status">Enter at least {MIN_SEARCH_LENGTH} characters to search.</p>
      )}

      {query.length >= MIN_SEARCH_LENGTH && result.rows.length === 0 && (
        <p className="empty-feed">No matching active HavenSocial accounts were found.</p>
      )}

      {result.rows.length > 0 && (
        <section aria-label="Search results" style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          {result.rows.map((person) => {
            const profile = profiles.get(person.bhid_sub);

            return (
              <article
                className="feed-item"
                key={person.users_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 14,
                  margin: 0,
                }}
              >
                <IdentityAvatar
                  src={profile?.picture}
                  className="profile-avatar-small"
                />
                <Link
                  href={`/profile/${encodeURIComponent(person.bhid_sub)}`}
                  className="post-author"
                  style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}
                >
                  <strong>{profile?.name || 'HavenSocial user'}</strong>
                  <span>
                    {profile?.preferredUsername
                      ? `@${profile.preferredUsername}`
                      : 'BHID account'}
                  </span>
                </Link>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
