import Link from 'next/link';
import { notFound } from 'next/navigation';
import { toggleFollowAction } from '@/app/actions';
import { getBhidProfiles, getCurrentBhidProfile } from '@/lib/bhid/profile';
import { requireLinkedUser } from '@/lib/linked-user';
import { getUserProfile } from '../../../models/users.js';
import { getUserTweets } from '../../../models/tweets.js';
import PostCard, { type Post } from '../../components/PostCard';

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
  const isOwner = String(profile.users_id) === String(viewer.users_id);
  const [authorProfiles, currentProfile] = await Promise.all([
    getBhidProfiles(isOwner ? [] : [profile.bhid_sub]),
    isOwner ? getCurrentBhidProfile(viewer.bhid_sub) : Promise.resolve(null),
  ]);
  if (currentProfile) authorProfiles.set(currentProfile.sub, currentProfile);
  const bhidProfile = authorProfiles.get(profile.bhid_sub);

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
        {tweets.length ? tweets.map((tweet: Post) => (
          <PostCard
            key={String(tweet.tweet_id)}
            post={tweet}
            author={authorProfiles.get(tweet.author_sub)}
            viewerId={viewer.users_id}
            showFollow={false}
          />
        )) : <p>No posts yet.</p>}
      </section>
    </main>
  );
}
