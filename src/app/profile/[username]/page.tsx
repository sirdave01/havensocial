import Link from 'next/link';
import { notFound } from 'next/navigation';
import { toggleFollowAction } from '@/app/actions';
import { requireLinkedUser } from '@/lib/linked-user';
import { getUserProfile } from '../../../models/users.js';
import { getUserTweets } from '../../../models/tweets.js';
import ProfileImageUpload from '../../components/ProfileImageUpload';

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const viewer = await requireLinkedUser();
  const { username } = await params;
  const profile = await getUserProfile(username, viewer.users_id);
  if (!profile) notFound();

  const tweets = await getUserTweets(profile.users_id, 20, 0);
  const isOwner = Number(profile.users_id) === Number(viewer.users_id);

  return (
    <main className="feed-page">
      <section className="profile-header">
        <img
          src={profile.profile_picture_url || '/images/default-avatar.jpg'}
          alt=""
          className="profile-avatar"
        />
        <h1>{profile.display_name || profile.username}</h1>
        <p>@{profile.username}</p>
        {profile.bio && <p>{profile.bio}</p>}
        <p>
          {profile.follower_count} followers · {profile.following_count} following · {profile.tweet_count} posts
        </p>
        <div className="profile-links">
          <Link href={`/profile/${encodeURIComponent(profile.username)}/followers`}>Followers</Link>
          <Link href={`/profile/${encodeURIComponent(profile.username)}/following`}>Following</Link>
        </div>
        {!isOwner && (
          <form action={toggleFollowAction}>
            <input type="hidden" name="followeeId" value={String(profile.users_id)} />
            <input type="hidden" name="action" value={profile.is_following ? 'unfollow' : 'follow'} />
            <button type="submit">{profile.is_following ? 'Unfollow' : 'Follow'}</button>
          </form>
        )}
        {isOwner && (
          <ProfileImageUpload hasCustomImage={Boolean(profile.custom_profile_picture_url)} />
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
