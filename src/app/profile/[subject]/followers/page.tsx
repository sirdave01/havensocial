import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBhidProfiles } from '@/lib/bhid/profile';
import { requireLinkedUser } from '@/lib/linked-user';
import { getUserProfile } from '../../../../models/users.js';
import { getFollowers } from '../../../../models/follow.js';
import IdentityAvatar from '../../../components/IdentityAvatar';

type FollowerRow = Record<string, unknown> & {
  users_id: string | number;
  bhid_sub: string;
};

export default async function FollowersPage({
  params,
}: {
  params: Promise<{ subject: string }>;
}) {
  const viewer = await requireLinkedUser();
  const { subject } = await params;
  const profile = await getUserProfile(subject, viewer.users_id);
  if (!profile) notFound();

  const users = await getFollowers(profile.users_id, 50, 0, viewer.users_id) as FollowerRow[];
  const profiles = await getBhidProfiles(
    users.map((person) => person.bhid_sub),
  );

  return (
    <main className="feed-page follow-list-page">
      <h1>Followers</h1>
      <p className="follow-list-subtitle">
        Accounts following this account.
      </p>

      {users.length ? (
        <section
          className="follow-list"
          aria-label="Followers"
          style={{ display: 'grid', gap: 12, marginTop: 20 }}
        >
          {users.map((person) => {
            const bhidProfile = profiles.get(person.bhid_sub);
            return (
              <article
                className="follow-list-card"
                key={String(person.users_id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 16px',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  background: 'var(--surface)',
                  minWidth: 0,
                }}
              >
                <IdentityAvatar
                  src={bhidProfile?.picture}
                  className="profile-avatar-small"
                />
                <Link
                  href={`/profile/${encodeURIComponent(person.bhid_sub)}`}
                  className="follow-list-identity"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0,
                    flex: 1,
                    color: 'var(--text)',
                    textDecoration: 'none',
                  }}
                >
                  <strong style={{ overflowWrap: 'anywhere' }}>
                    {bhidProfile?.name || 'HavenSocial user'}
                  </strong>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', overflowWrap: 'anywhere' }}>
                    {bhidProfile?.preferredUsername
                      ? `@${bhidProfile.preferredUsername}`
                      : 'BHID account'}
                  </span>
                </Link>
              </article>
            );
          })}
        </section>
      ) : (
        <p className="empty-feed">No followers to display yet.</p>
      )}
    </main>
  );
}
