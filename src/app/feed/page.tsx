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

const PAGE_SIZE = 20;
const MAX_PAGE = 10000;

function parsePage(value?: string) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1
    ? Math.min(parsed, MAX_PAGE)
    : 1;
}

function feedPageHref(tab: string, page: number) {
  const params = new URLSearchParams();
  if (tab === 'following') params.set('tab', 'following');
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/feed?${query}` : '/feed';
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    page?: string;
    error?: string;
  }>;
}) {
  const user = await requireLinkedUser();
  const { tab, page: pageParam, error } = await searchParams;
  const activeTab = tab === 'following' ? 'following' : 'for-you';
  const page = parsePage(pageParam);
  const offset = (page - 1) * PAGE_SIZE;

  const [feedRows, currentProfile] = await Promise.all([
    activeTab === 'following'
      ? getFollowingFeed(user.users_id, PAGE_SIZE + 1, offset)
      : getHomeFeed(user.users_id, PAGE_SIZE + 1, offset),
    getCurrentBhidProfile(user.bhid_sub),
  ]);

  const hasNextPage = feedRows.length > PAGE_SIZE;
  const feed = feedRows.slice(0, PAGE_SIZE) as Post[];

  const profileSubjects = new Set<string>();
  for (const post of feed) {
    if (post.author_sub && post.author_sub !== user.bhid_sub) {
      profileSubjects.add(post.author_sub);
    }
    if (post.reshared_by_sub && post.reshared_by_sub !== user.bhid_sub) {
      profileSubjects.add(post.reshared_by_sub);
    }
  }

  const authorProfiles = await getBhidProfiles(Array.from(profileSubjects));
  if (currentProfile) authorProfiles.set(currentProfile.sub, currentProfile);

  return (
    <main className="feed-page">
      <section className="compose-tweet">
        <ComposePost avatarUrl={currentProfile?.picture} />
      </section>

      {error && (
        <p role="alert">
          That action could not be completed. Please check the post and try again.
        </p>
      )}

      <div className="feed-page-actions">
        <Link href="/scheduled">Scheduled posts</Link>
      </div>

      <nav className="feed-tabs" aria-label="Feed type">
        <Link
          className={activeTab === 'for-you' ? 'tab active' : 'tab'}
          href={feedPageHref('for-you', 1)}
        >
          For You
        </Link>
        <Link
          className={activeTab === 'following' ? 'tab active' : 'tab'}
          href={feedPageHref('following', 1)}
        >
          Following
        </Link>
      </nav>

      <section className="feed" aria-label="Posts">
        {feed.length ? (
          feed.map((post) => (
            <PostCard
              key={post.is_reshare
                ? `reshare-${post.feed_retweet_id ?? `${post.tweet_id}-${post.reshared_by_user_id ?? 'unknown'}`}`
                : `tweet-${post.tweet_id}`}
              post={post}
              author={authorProfiles.get(post.author_sub)}
              resharedBy={post.reshared_by_sub
                ? authorProfiles.get(post.reshared_by_sub)
                : undefined}
              viewerId={user.users_id}
            />
          ))
        ) : (
          <p className="empty-feed">
            {page > 1 ? 'There are no more posts on this page.' : 'No posts yet.'}
          </p>
        )}
      </section>

      {(page > 1 || hasNextPage) && (
        <nav className="feed-pagination" aria-label="Feed pages">
          {page > 1 && (
            <Link href={feedPageHref(activeTab, page - 1)} rel="prev">
              Newer posts
            </Link>
          )}
          <span>Page {page}</span>
          {hasNextPage && (
            <Link href={feedPageHref(activeTab, page + 1)} rel="next">
              Older posts
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
