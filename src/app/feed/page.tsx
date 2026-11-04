import Link from 'next/link';
import { deleteTweetAction, toggleFollowAction, toggleLikeAction } from '@/app/actions';
import { requireLinkedUser } from '@/lib/linked-user';
import { getHomeFeed, getFollowingFeed } from '../../models/tweets.js';
import ComposePost from '../components/ComposePost';
import MediaPreview from '../components/MediaPreview';
import PostControls from '../components/PostControls';

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const user = await requireLinkedUser();
  const { tab, error } = await searchParams;
  const activeTab = tab === 'following' ? 'following' : 'for-you';
  const feed = activeTab === 'following'
    ? await getFollowingFeed(user.users_id, 20, 0)
    : await getHomeFeed(user.users_id, 20, 0);

  return (
    <main className="feed-page">
      <section className="compose-tweet">
        <ComposePost />
      </section>
      {error && <p role="alert">That action could not be completed. Please check the post and try again.</p>}
      <nav className="feed-tabs" aria-label="Feed type">
        <Link className={activeTab === 'for-you' ? 'tab active' : 'tab'} href="/feed">For You</Link>
        <Link className={activeTab === 'following' ? 'tab active' : 'tab'} href="/feed?tab=following">
          Following
        </Link>
      </nav>
      <section className="feed" aria-label="Posts">
        {feed.length ? feed.map((tweet: Record<string, unknown>) => (
          <article className="feed-item" key={String(tweet.tweet_id)}>
            <p>
              <img
                src={String(tweet.profile_picture_url || '/images/default-avatar.jpg')}
                alt=""
                className="profile-avatar-small"
              />
              <Link href={`/profile/${encodeURIComponent(String(tweet.username))}`}>
                {String(tweet.display_name || tweet.username)}
              </Link>
              {' '}@{String(tweet.username)}
            </p>
            <Link href={`/tweet/${String(tweet.tweet_id)}`} className="feed-post-link">
              <p>{String(tweet.content || '')}</p>
            </Link>
            {Array.isArray(tweet.media_url) && tweet.media_url.map((url: string) => (
              <MediaPreview key={url} url={url} />
            ))}
            <small>{new Date(String(tweet.created_at)).toLocaleString()}</small>
            <div className="feed-actions">
              <form action={toggleLikeAction}>
                <input type="hidden" name="tweetId" value={String(tweet.tweet_id)} />
                <input type="hidden" name="action" value={tweet.liked_by_user ? 'unlike' : 'like'} />
                <button type="submit">{tweet.liked_by_user ? 'Unlike' : 'Like'} ({String(tweet.like_count || 0)})</button>
              </form>
              {Number(tweet.user_id) !== Number(user.users_id) && (
                <form action={toggleFollowAction}>
                  <input type="hidden" name="followeeId" value={String(tweet.user_id)} />
                  <input type="hidden" name="action" value={tweet.is_following ? 'unfollow' : 'follow'} />
                  <button type="submit">{tweet.is_following ? 'Unfollow' : 'Follow'}</button>
                </form>
              )}
              {Number(tweet.user_id) === Number(user.users_id) && (
                <form action={deleteTweetAction}>
                  <input type="hidden" name="tweetId" value={String(tweet.tweet_id)} />
                  <button type="submit">Delete</button>
                </form>
              )}
            </div>
            <PostControls
              tweetId={String(tweet.tweet_id)}
              retweeted={Boolean(tweet.retweeted_by_user)}
              pinned={Boolean(tweet.is_pinned)}
              canPin={Number(tweet.user_id) === Number(user.users_id)}
            />
          </article>
        )) : <p className="empty-feed">No posts yet.</p>}
      </section>
    </main>
  );
}
