
import Link from 'next/link';
import {
  Eye,
  Heart,
  MessageCircle,
  Trash2,
} from 'lucide-react';

import {
  deleteTweetAction,
  toggleLikeAction,
} from '@/app/actions';

import type { BhidProfile } from '@/lib/bhid/profile';

import FollowButton from './FollowButton';
import IdentityAvatar from './IdentityAvatar';
import MediaPreview from './MediaPreview';
import PostControls from './PostControls';
import PostEditor from './PostEditor';
import SharePostButton from './SharePostButton';

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

  media?: {
    media_id: string | number;
    media_url: string;
    media_type: string;
    mime_type?: string | null;
    alt_text: string | null;
  }[];
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

  const isOwner =
    String(post.user_id) === String(viewerId);

  const profileHref =
    `/profile/${encodeURIComponent(post.author_sub)}`;

  const tweetHref =
    `/tweet/${encodeURIComponent(tweetId)}`;

  return (
    <article className="feed-item">
      {/* POST AUTHOR */}
      <header className="post-card-header">
        <IdentityAvatar
          src={author?.picture}
          className="profile-avatar-small"
        />

        <div className="post-author-row">
          <Link
            href={profileHref}
            className="post-author"
          >
            <strong>
              {author?.name || 'HavenSocial user'}
            </strong>

            {author?.preferredUsername && (
              <span>
                @{author.preferredUsername}
              </span>
            )}
          </Link>

          {showFollow && !isOwner && (
            <FollowButton
              userId={post.user_id}
              initialFollowing={Boolean(post.is_following)}
            />
          )}
        </div>
      </header>

      {/* POST TEXT */}
      <Link
        href={tweetHref}
        className="feed-post-link"
      >
        <p>{post.content || ''}</p>
      </Link>

      {/* POST MEDIA */}
      {post.media?.length ? (
        <div className="post-media">
          {post.media.map((item) => (
            <MediaPreview
              key={String(item.media_id)}
              url={item.media_url}
              mediaType={item.media_type}
              mimeType={item.mime_type}
              altText={item.alt_text}
            />
          ))}
        </div>
      ) : null}

      {/* POST DATE */}
      <small>
        <time
          dateTime={
            new Date(post.created_at).toISOString()
          }
        >
          {new Date(post.created_at).toLocaleString()}
        </time>
      </small>

      {/* POST INTERACTIONS */}
      <div className="feed-actions">

        {/* LIKE */}
        <form action={toggleLikeAction}>
          <input
            type="hidden"
            name="tweetId"
            value={tweetId}
          />

          <input
            type="hidden"
            name="action"
            value={
              post.liked_by_user ? 'unlike' : 'like'
            }
          />

          <button
            type="submit"
            className={`like-action${
              post.liked_by_user ? ' is-liked' : ''
            }`}
            aria-label={`${
              post.liked_by_user ? 'Unlike' : 'Like'
            } (${count(post.like_count)})`}
          >
            <Heart
              aria-hidden="true"
              fill={
                post.liked_by_user
                  ? 'currentColor'
                  : 'none'
              }
            />

            <span>
              {count(post.like_count)}
            </span>
          </button>
        </form>

        {/* REPLIES */}
        <Link
          href={tweetHref}
          className="icon-action-button"
          aria-label={`Reply (${count(post.reply_count)})`}
          title="Reply"
        >
          <MessageCircle aria-hidden="true" />

          <span>
            {count(post.reply_count)}
          </span>
        </Link>

        {/* VIEWS - DISPLAYED ON ORIGINAL POSTS AND REPLIES */}
        <span
          className="post-view-count"
          role="img"
          aria-label={`${count(post.view_count)} views`}
          title="Views"
        >
          <Eye aria-hidden="true" />

          <span>
            {count(post.view_count)}
          </span>
        </span>

        {/* RETWEET AND PIN CONTROLS */}
        <PostControls
          tweetId={tweetId}
          retweetCount={post.retweet_count}
          retweeted={Boolean(post.retweeted_by_user)}
          pinned={Boolean(post.is_pinned)}
          canPin={isOwner}
        />

        {/* SHARE */}
        <SharePostButton tweetId={tweetId} />

        {/* OWNER ACTIONS */}
        {isOwner && (
          <>
            <PostEditor
              tweetId={tweetId}
              initialContent={post.content || ''}
            />

            <form action={deleteTweetAction}>
              <input
                type="hidden"
                name="tweetId"
                value={tweetId}
              />

              <button
                type="submit"
                aria-label="Delete post"
                title="Delete post"
              >
                <Trash2 aria-hidden="true" />
              </button>
            </form>
          </>
        )}
      </div>
    </article>
  );
}
