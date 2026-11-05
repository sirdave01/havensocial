import Link from 'next/link';
import { notFound } from 'next/navigation';
import { toggleFollowAction } from '@/app/actions';
import { getCurrentBhidProfile } from '@/lib/bhid/profile';
import { requireLinkedUser } from '@/lib/linked-user';
import { getUserProfile } from '../../../models/users.js';
import { getUserTweets } from '../../../models/tweets.js';

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ subject: string }>;
}) {
  const viewer = await requireLinkedUser();
  const { subject } = await params;
  const profile = await getUserProfile(subject, viewer.users_id);
  if (!profile) notFound();

  const tweets = await getUserTweets(profile.users_id, 20, 0);
  const isOwner = Number(profile.users_id) === Number(viewer.users_id);
  const bhidProfile = isOwner ? await getCurrentBhidProfile(viewer.bhid_sub) : null;

  return (
    <main className="feed-page">
      <section className="profile-header">
        <img
          src={bhidProfile?.picture || '/images/default-avatar.jpg'}
          alt=""
          className="profile-avatar"
          referrerPolicy="no-referrer"
        />
        <h1>{bhidProfile?.name || 'HavenSocial user'}</h1>
        <p>{bhidProfile?.preferredUsername ? `@${bhidProfile.preferredUsername}` : 'Username unavailable'}</p>
        {isOwner && !bhidProfile && (
          <p role="status">BHID profile details are unavailable. Sign out and sign in again to refresh access.</p>
        )}
        <p>
          {profile.follower_count} followers · {profile.following_count} following · {profile.tweet_count} posts
        </p>
        <div className="profile-links">
          <Link href={`/profile/${encodeURIComponent(profile.bhid_sub)}/followers`}>Followers</Link>
          <Link href={`/profile/${encodeURIComponent(profile.bhid_sub)}/following`}>Following</Link>
        </div>
        {!isOwner && (
          <form action={toggleFollowAction}>
            <input type="hidden" name="followeeId" value={String(profile.users_id)} />
            <input type="hidden" name="action" value={profile.is_following ? 'unfollow' : 'follow'} />
            <button type="submit">{profile.is_following ? 'Unfollow' : 'Follow'}</button>
          </form>
        )}
      </section>
      <section className="feed" aria-label="User posts">
        {tweets.length ? tweets.map((tweet: Record<string, unknown>) => (
          <article className="feed-item" key={String(tweet.tweet_id)}>
            <Link href={`/tweet/${String(tweet.tweet_id)}`}>{String(tweet.content || '')}</Link>
          </article>
        )) : <p>No posts yet.</p>}
      </section>
    </main>
  );
}
