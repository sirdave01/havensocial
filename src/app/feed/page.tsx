import Link from 'next/link';
import { getCurrentBhidProfile, getBhidProfiles } from '@/lib/bhid/profile';
import { requireLinkedUser } from '@/lib/linked-user';
import { getHomeFeed, getFollowingFeed } from '../../models/tweets.js';
import ComposePost from '../components/ComposePost';
import PostCard, { type Post } from '../components/PostCard';

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const user = await requireLinkedUser();
  const { tab, error } = await searchParams;
  const activeTab = tab === 'following' ? 'following' : 'for-you';
  const [feed, currentProfile] = await Promise.all([
    activeTab === 'following'
      ? getFollowingFeed(user.users_id, 20, 0)
      : getHomeFeed(user.users_id, 20, 0),
    getCurrentBhidProfile(user.bhid_sub),
  ]);
  const authorProfiles = await getBhidProfiles(
    feed
      .map((post: Post) => post.author_sub)
      .filter((subject: string) => subject !== user.bhid_sub),
  );
  if (currentProfile) authorProfiles.set(currentProfile.sub, currentProfile);

  return (
    <main className="feed-page">
      <section className="compose-tweet">
        <ComposePost avatarUrl={currentProfile?.picture} />
      </section>
      {error && <p role="alert">That action could not be completed. Please check the post and try again.</p>}
      <nav className="feed-tabs" aria-label="Feed type">
        <Link className={activeTab === 'for-you' ? 'tab active' : 'tab'} href="/feed">For You</Link>
        <Link className={activeTab === 'following' ? 'tab active' : 'tab'} href="/feed?tab=following">
          Following
        </Link>
      </nav>
      <section className="feed" aria-label="Posts">
        {feed.length ? feed.map((post: Post) => (
          <PostCard
              key={
                post.is_reshare
                  ? `reshare-${post.feed_retweet_id}`
                  : `tweet-${post.tweet_id}`
              }
              post={post}
              author={authorProfiles.get(post.author_sub)}
              viewerId={user.users_id}
          />
        )) : <p className="empty-feed">No posts yet.</p>}
      </section>
    </main>
  );
}
