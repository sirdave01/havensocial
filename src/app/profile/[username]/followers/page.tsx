import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireLinkedUser } from '@/lib/linked-user';
import { getUserProfile } from '../../../../models/users.js';
import { getFollowers } from '../../../../models/follow.js';

export default async function FollowersPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const viewer = await requireLinkedUser();
  const { username } = await params;
  const profile = await getUserProfile(username, viewer.users_id);
  if (!profile) notFound();
  const users = await getFollowers(profile.users_id, 50, 0, viewer.users_id);

  return (
    <main className="feed-page">
      <h1>Followers of @{profile.username}</h1>
      {users.map((person: Record<string, unknown>) => (
        <p key={String(person.users_id)}>
          <Link href={`/profile/${encodeURIComponent(String(person.username))}`}>
            {String(person.display_name || person.username)}
          </Link>
          {' '}@{String(person.username)}
        </p>
      ))}
    </main>
  );
}
