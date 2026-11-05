import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBhidProfiles } from '@/lib/bhid/profile';
import { requireLinkedUser } from '@/lib/linked-user';
import { getUserProfile } from '../../../../models/users.js';
import { getFollowing } from '../../../../models/follow.js';
import IdentityAvatar from '../../../components/IdentityAvatar';

export default async function FollowingPage({
  params,
}: {
  params: Promise<{ subject: string }>;
}) {
  const viewer = await requireLinkedUser();
  const { subject } = await params;
  const profile = await getUserProfile(subject, viewer.users_id);
  if (!profile) notFound();
  const users = await getFollowing(profile.users_id, 50, 0, viewer.users_id);
  const profiles = await getBhidProfiles(users.map((person: { bhid_sub: string }) => person.bhid_sub));

  return (
    <main className="feed-page">
      <h1>Following of BHID account</h1>
      {users.map((person: Record<string, unknown>) => (
        <p key={String(person.users_id)}>
          <IdentityAvatar
            src={profiles.get(String(person.bhid_sub))?.picture}
            className="profile-avatar-small"
          />
          <Link href={`/profile/${encodeURIComponent(String(person.bhid_sub))}`}>
            {profiles.get(String(person.bhid_sub))?.name || 'HavenSocial user'}
          </Link>
        </p>
      ))}
    </main>
  );
}
