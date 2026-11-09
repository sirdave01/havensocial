import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBhidProfiles, getCurrentBhidProfile } from '@/lib/bhid/profile';
import { requireLinkedUser } from '@/lib/linked-user';
import { getUserProfile } from '../../../models/users.js';
import { getUserTweets } from '../../../models/tweets.js';
import FollowButton from '../../components/FollowButton';
import IdentityAvatar from '../../components/IdentityAvatar';
import PostCard, { type Post } from '../../components/PostCard';

const PAGE_SIZE = 20;
const MAX_PAGE = 10000;

function parsePage(value?: string) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1
    ? Math.min(parsed, MAX_PAGE)
    : 1;
}

function profilePageHref(subject: string, page: number) {
  const base = `/profile/${encodeURIComponent(subject)}`;
  return page > 1 ? `${base}?page=${page}` : base;
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ subject: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const viewer = await requireLinkedUser();
  const [{ subject }, { page: pageParam }] = await Promise.all([params, searchParams]);
  const profile = await getUserProfile(subject, viewer.users_id);
  if (!profile) notFound();

  const page = parsePage(pageParam);
  const tweets = await getUserTweets(
    profile.users_id,
    PAGE_SIZE + 1,
    (page - 1) * PAGE_SIZE,
  );
  const hasNextPage = tweets.length > PAGE_SIZE;
  const visibleTweets = tweets.slice(0, PAGE_SIZE) as Post[];
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
        <div className="profile-identity">
          <IdentityAvatar src={bhidProfile?.picture} className="profile-avatar" />
          <div className="profile-heading">
            <h1>{bhidProfile?.name || 'HavenSocial user'}</h1>
            <p>
              {bhidProfile?.preferredUsername
                ? `@${bhidProfile.preferredUsername}`
                : 'Username unavailable'}
            </p>
            {isOwner && !bhidProfile && (
              <p role="status">
                BHID profile details are unavailable. Sign out and sign in again to refresh access.
              </p>
            )}
          </div>
        </div>

        <div className="profile-details">
          <div className="profile-stats">
            <span><strong>{profile.follower_count}</strong> followers</span>
            <span><strong>{profile.following_count}</strong> following</span>
            <span><strong>{profile.tweet_count}</strong> posts</span>
          </div>
          <div className="profile-links">
            <Link href={`/profile/${encodeURIComponent(profile.bhid_sub)}/followers`}>
              Followers <span>{profile.follower_count}</span>
            </Link>
            <Link href={`/profile/${encodeURIComponent(profile.bhid_sub)}/following`}>
              Following <span>{profile.following_count}</span>
            </Link>
          </div>
        </div>

        {!isOwner && (
          <FollowButton
            userId={profile.users_id}
            initialFollowing={Boolean(profile.is_following)}
            showLabel
          />
        )}
      </section>

      <section className="feed" aria-label="User posts">
        {visibleTweets.length ? (
          visibleTweets.map((tweet) => (
            <PostCard
              key={String(tweet.tweet_id)}
              post={tweet}
              author={authorProfiles.get(tweet.author_sub)}
              viewerId={viewer.users_id}
              showFollow={false}
            />
          ))
        ) : (
          <p>No posts yet.</p>
        )}
      </section>

      {(page > 1 || hasNextPage) && (
        <nav className="feed-pagination" aria-label="Profile post pages">
          {page > 1 && (
            <Link href={profilePageHref(profile.bhid_sub, page - 1)} rel="prev">
              Newer posts
            </Link>
          )}
          <span>Page {page}</span>
          {hasNextPage && (
            <Link href={profilePageHref(profile.bhid_sub, page + 1)} rel="next">
              Older posts
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
