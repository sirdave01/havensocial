import Link from 'next/link';

import {
  Eye,
  Heart,
  MessageCircle,
  Repeat2,
} from 'lucide-react';

import { toggleLikeAction } from '@/app/actions';
import type { BhidProfile } from '@/lib/bhid/profile';

import FollowButton from './FollowButton';
import IdentityAvatar from './IdentityAvatar';
import MediaPreview from './MediaPreview';
import PostControls from './PostControls';
import PostEditor from './PostEditor';
import SharePostButton from './SharePostButton';
import ConfirmDeletePost from './ConfirmDeletePost';
import ViewTracker from './ViewTracker';

// ==================== POST TYPE ====================

export type Post = {
  tweet_id: string | number;
  user_id: string | number;
  author_sub: string;
  content: string | null;
  created_at: string | Date;
  published_at?: string | Date | null;

  // COUNTS
  like_count?: string | number;
  reply_count?: string | number;
  retweet_count?: string | number;
  view_count?: string | number;

  // VIEWER INTERACTIONS
  liked_by_user?: boolean;
  retweeted_by_user?: boolean;
  is_following?: boolean;
  is_pinned?: boolean;

  // DELETION STATUS
  is_deleted?: boolean;
  deleted_at?: string | Date | null;

  // RESHARE INFORMATION
  is_reshare?: boolean;
  feed_retweet_id?: string | number | null;
  reshared_by_user_id?: string | number | null;
  reshared_by_sub?: string | null;
  reshared_at?: string | Date | null;
  reshare_quote_text?: string | null;

  // POST MEDIA
  media?: {
    media_id: string | number;
    media_url: string;
    media_type: string;
    mime_type?: string | null;
    alt_text: string | null;
  }[];
};

// ==================== HELPERS ====================

function count(value: string | number | undefined) {
  return String(value ?? 0);
}

function formatPublicationDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return {
    dateTime: date.toISOString(),
    label: new Intl.DateTimeFormat('en-NG', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Africa/Lagos',
    }).format(date),
  };
}

// ==================== POST CARD ====================

export default function PostCard({
  post,
  author,
  resharedBy,
  viewerId,
  showFollow = true,
}: {
  post: Post;
  author: BhidProfile | undefined;
  resharedBy?: BhidProfile;
  viewerId: string | number;
  showFollow?: boolean;
}) {
  const tweetId = String(post.tweet_id);

  const isDeleted = Boolean(
    post.is_deleted || post.deleted_at,
  );

  // Do not expose deleted content or track views for deleted posts.
  if (isDeleted) {
    return (
      <article className="feed-item deleted-post">
        <p role="status" className="deleted-post-message">
          This post has been deleted.
        </p>
      </article>
    );
  }

  const isReshare = Boolean(post.is_reshare);
  const isOwner = String(post.user_id) === String(viewerId);
  const canManagePost = isOwner && !isReshare;

  const profileHref = `/profile/${encodeURIComponent(post.author_sub)}`;
  const tweetHref = `/tweet/${encodeURIComponent(tweetId)}`;
  const resharerHref = post.reshared_by_sub
    ? `/profile/${encodeURIComponent(post.reshared_by_sub)}`
    : null;

  // Published posts use their actual publication timestamp. The original
  // created_at value remains available for record-keeping.
  const publicationDate = formatPublicationDate(
    post.published_at ?? post.created_at,
  );

  // Each appearance of a post gets its own DOM target. A reshare and the
  // original post can therefore be observed independently, while the
  // database still counts the viewer only once for the original tweet.
  const viewTargetId =
    isReshare && post.feed_retweet_id != null
      ? `post-view-reshare-${post.feed_retweet_id}`
      : `post-view-tweet-${tweetId}`;

  return (
    <article
      id={viewTargetId}
      data-view-tweet-id={tweetId}
      className="feed-item"
    >
      {!isOwner && (
        <ViewTracker tweetId={tweetId} targetId={viewTargetId} />
      )}

      {/* RESHARE ATTRIBUTION */}
      {isReshare && (
        <div className="reshare-attribution">
          <Repeat2 aria-hidden="true" size={16} />

          {resharerHref ? (
            <Link href={resharerHref}>
              {resharedBy?.name || 'HavenSocial user'}

              {resharedBy?.preferredUsername && (
                <span className="reshare-username">
                  {' '}@{resharedBy.preferredUsername}
                </span>
              )}
            </Link>
          ) : (
            <span>HavenSocial user</span>
          )}

          <span>reshared</span>
        </div>
      )}

      {/* RESHARE QUOTE */}
      {isReshare && post.reshare_quote_text && (
        <p className="reshare-quote">
          {post.reshare_quote_text}
        </p>
      )}

      {/* ORIGINAL POST AUTHOR */}
      <header className="post-card-header">
        <IdentityAvatar
          src={author?.picture}
          className="profile-avatar-small"
        />

        <div className="post-author-row">
          <Link href={profileHref} className="post-author">
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
      <Link href={tweetHref} className="feed-post-link">
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

      {/* PUBLICATION DATE: DISPLAYED IN NIGERIAN TIME (WAT) */}
      <small>
        {publicationDate ? (
          <time dateTime={publicationDate.dateTime}>
            {publicationDate.label} WAT
          </time>
        ) : (
          <span>Publication time unavailable</span>
        )}
      </small>

      {/* POST INTERACTIONS */}
      <div className="feed-actions">
        {/* LIKE */}
        <form action={toggleLikeAction}>
          <input type="hidden" name="tweetId" value={tweetId} />
          <input
            type="hidden"
            name="action"
            value={post.liked_by_user ? 'unlike' : 'like'}
          />

          <button
            type="submit"
            className={`like-action${post.liked_by_user ? ' is-liked' : ''}`}
            aria-label={`${post.liked_by_user ? 'Unlike' : 'Like'} (${count(post.like_count)})`}
          >
            <Heart
              aria-hidden="true"
              fill={post.liked_by_user ? 'currentColor' : 'none'}
            />
            <span>{count(post.like_count)}</span>
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
          <span>{count(post.reply_count)}</span>
        </Link>

        {/* QUALIFIED VIEWS */}
        <span
          className="post-view-count"
          role="img"
          aria-label={`${count(post.view_count)} views`}
          title="Views"
        >
          <Eye aria-hidden="true" />
          <span>{count(post.view_count)}</span>
        </span>

        {/* RESHARE AND PIN */}
        <PostControls
          tweetId={tweetId}
          retweetCount={post.retweet_count}
          retweeted={Boolean(post.retweeted_by_user)}
          pinned={Boolean(post.is_pinned)}
          canPin={canManagePost}
        />

        {/* SHARE */}
        <SharePostButton tweetId={tweetId} />

        {/* OWNER ACTIONS */}
        {canManagePost && (
          <>
            <PostEditor
              tweetId={tweetId}
              initialContent={post.content || ''}
            />
            <ConfirmDeletePost tweetId={tweetId} />
          </>
        )}
      </div>
    </article>
  );
}
