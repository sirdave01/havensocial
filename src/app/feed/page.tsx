
import Link from 'next/link';

import {
  getCurrentBhidProfile,
  getBhidProfiles,
} from '@/lib/bhid/profile';

import { requireLinkedUser } from '@/lib/linked-user';

import {
  getHomeFeed,
  getFollowingFeed,
} from '../../models/tweets.js';

import ComposePost from '../components/ComposePost';
import PostCard, { type Post } from '../components/PostCard';

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    error?: string;
  }>;
}) {
  // 1. Require an authenticated user.
  const user = await requireLinkedUser();

  // 2. Determine the active feed.
  const { tab, error } = await searchParams;

  const activeTab =
    tab === 'following' ? 'following' : 'for-you';

  // 3. Retrieve feed posts and current BHID profile.
  const [feed, currentProfile] = await Promise.all([
    activeTab === 'following'
      ? getFollowingFeed(user.users_id, 20, 0)
      : getHomeFeed(user.users_id, 20, 0),

    getCurrentBhidProfile(user.bhid_sub),
  ]);

  // 4. Collect unique BHID subjects.
  // Explicit Set<string> prevents TypeScript inference errors.
  const profileSubjects = new Set<string>();

  for (const post of feed as Post[]) {
    if (
      post.author_sub &&
      post.author_sub !== user.bhid_sub
    ) {
      profileSubjects.add(post.author_sub);
    }

    if (
      post.reshared_by_sub &&
      post.reshared_by_sub !== user.bhid_sub
    ) {
      profileSubjects.add(post.reshared_by_sub);
    }
  }

  // 5. Retrieve BHID profiles for all feed participants.
  const authorProfiles = await getBhidProfiles(
    Array.from(profileSubjects),
  );

  // 6. Include the currently authenticated user's profile.
  if (currentProfile) {
    authorProfiles.set(
      currentProfile.sub,
      currentProfile,
    );
  }

  // 7. Render the feed.
  return (
    <main className="feed-page">

      {/* COMPOSE POST */}
      <section className="compose-tweet">
        <ComposePost
          avatarUrl={currentProfile?.picture}
        />
      </section>

      {/* ACTION ERROR */}
      {error && (
        <p role="alert">
          That action could not be completed.
          Please check the post and try again.
        </p>
      )}

      {/* FEED NAVIGATION */}
      <nav
        className="feed-tabs"
        aria-label="Feed type"
      >
        <Link
          className={
            activeTab === 'for-you'
              ? 'tab active'
              : 'tab'
          }
          href="/feed"
        >
          For You
        </Link>

        <Link
          className={
            activeTab === 'following'
              ? 'tab active'
              : 'tab'
          }
          href="/feed?tab=following"
        >
          Following
        </Link>
      </nav>

      {/* FEED POSTS */}
      <section
        className="feed"
        aria-label="Posts"
      >
        {feed.length ? (
          (feed as Post[]).map((post) => (
            <PostCard
              key={
                post.is_reshare
                  ? `reshare-${post.feed_retweet_id ?? `${post.tweet_id}-${post.reshared_by_user_id ?? 'unknown'}`}`
                  : `tweet-${post.tweet_id}`
              }
              post={post}
              author={authorProfiles.get(post.author_sub)}
              resharedBy={
                post.reshared_by_sub
                  ? authorProfiles.get(post.reshared_by_sub)
                  : undefined
              }
              viewerId={user.users_id}
            />
          ))
        ) : (
          <p className="empty-feed">
            No posts yet.
          </p>
        )}
      </section>

    </main>
  );
}
