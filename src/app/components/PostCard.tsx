import Link from 'next/link';
import { deleteTweetAction, toggleFollowAction, toggleLikeAction } from '@/app/actions';
import type { BhidProfile } from '@/lib/bhid/profile';
import PostControls from './PostControls';
import PostEditor from './PostEditor';

export type Post = {
  tweet_id: string | number;
  user_id: string | number;
  author_sub: string;
  content: string | null;
  created_at: string | Date;
  like_count?: string | number;
  reply_count?: string | number;
  retweet_count?: string | number;
  view_count?: string | number;
  liked_by_user?: boolean;
  retweeted_by_user?: boolean;
  is_following?: boolean;
  is_pinned?: boolean;
};

function count(value: string | number | undefined) {
  return String(value ?? 0);
}

export default function PostCard({
  post,
  author,
  viewerId,
  showFollow = true,
}: {
  post: Post;
  author: BhidProfile | undefined;
  viewerId: string | number;
  showFollow?: boolean;
}) {
  const tweetId = String(post.tweet_id);
  const isOwner = String(post.user_id) === String(viewerId);
  const profileHref = `/profile/${encodeURIComponent(post.author_sub)}`;

  return (
    <article className="feed-item">
      <header className="post-card-header">
        <img
          src={author?.picture || '/images/default-avatar.jpg'}
          alt=""
          className="profile-avatar-small"
          referrerPolicy="no-referrer"
        />
        <Link href={profileHref} className="post-author">
          <strong>{author?.name || 'HavenSocial user'}</strong>
          {author?.preferredUsername && <span>@{author.preferredUsername}</span>}
        </Link>
      </header>
      <Link href={`/tweet/${encodeURIComponent(tweetId)}`} className="feed-post-link">
        <p>{post.content || ''}</p>
      </Link>
      <small>
        <time dateTime={new Date(post.created_at).toISOString()}>
          {new Date(post.created_at).toLocaleString()}
        </time>
      </small>
      <p className="post-counts" aria-label="Post activity">
        <span>Likes: {count(post.like_count)}</span>
        <span>Replies: {count(post.reply_count)}</span>
        <span>Retweets: {count(post.retweet_count)}</span>
        <span>Views: {count(post.view_count)}</span>
      </p>
      <div className="feed-actions">
        <form action={toggleLikeAction}>
          <input type="hidden" name="tweetId" value={tweetId} />
          <input type="hidden" name="action" value={post.liked_by_user ? 'unlike' : 'like'} />
          <button type="submit">{post.liked_by_user ? 'Unlike' : 'Like'} ({count(post.like_count)})</button>
        </form>
        {showFollow && !isOwner && (
          <form action={toggleFollowAction}>
            <input type="hidden" name="followeeId" value={String(post.user_id)} />
            <input type="hidden" name="action" value={post.is_following ? 'unfollow' : 'follow'} />
            <button type="submit">{post.is_following ? 'Unfollow' : 'Follow'}</button>
          </form>
        )}
        {isOwner && (
          <>
            <PostEditor tweetId={tweetId} initialContent={post.content || ''} />
            <form action={deleteTweetAction}>
              <input type="hidden" name="tweetId" value={tweetId} />
              <button type="submit">Delete</button>
            </form>
          </>
        )}
      </div>
      <PostControls
        tweetId={tweetId}
        retweeted={Boolean(post.retweeted_by_user)}
        pinned={Boolean(post.is_pinned)}
        canPin={isOwner}
      />
    </article>
  );
}
