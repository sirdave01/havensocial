import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getBhidProfiles } from '@/lib/bhid/profile';

import { getTweetWithReplies } from '../../../../models/tweets.js';

import MediaPreview from '@/app/components/MediaPreview';

// ==================== CONFIGURATION ====================

const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://havensocial.bytehaven.world'
).replace(/\/+$/, '');

const MAX_BIGINT = '9223372036854775807';

// ==================== TYPES ====================

type ShareMedia = {
  media_id: string | number;
  media_url: string;
  media_type: string;
  mime_type?: string | null;
  alt_text?: string | null;
  width?: number | null;
  height?: number | null;
};

type ShareTweet = {
  tweet_id: string | number;
  author_sub: string;
  content: string | null;
  published_at: string | Date | null;
  is_deleted?: boolean;
  deleted_at?: string | Date | null;
  mentions?: {
    username: string;
    sub: string;
  }[];
  media?: ShareMedia[];
};

type PageProps = {
  params: Promise<{
    tweetId: string;
  }>;
};

// ==================== HELPERS ====================

function isValidTweetId(tweetId: string) {
  if (!/^[1-9]\d{0,18}$/.test(tweetId)) {
    return false;
  }

  if (
    tweetId.length === 19 &&
    tweetId > MAX_BIGINT
  ) {
    return false;
  }

  return true;
}

function isDeletedPost(tweet: ShareTweet) {
  return Boolean(tweet.is_deleted || tweet.deleted_at);
}

function getAbsoluteUrl(
  value: string | null | undefined,
): string | null {
  if (!value) return null;

  try {
    const url = new URL(value, SITE_URL);

    if (
      url.protocol !== 'https:' &&
      url.protocol !== 'http:'
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function isImageMedia(media: ShareMedia) {
  const mimeType = String(
    media.mime_type || '',
  ).toLowerCase();

  const mediaType = String(
    media.media_type || '',
  ).toLowerCase();

  if (
    mimeType.startsWith('image/') ||
    mediaType.includes('image')
  ) {
    return true;
  }

  const mediaUrl = String(media.media_url || '');

  return /\.(jpg|jpeg|png|gif|webp|avif)(?:$|[?#])/i.test(
    mediaUrl,
  );
}

function getPublicationDate(
  value: string | Date | null | undefined,
) {
  if (!value) return null;

  const date = value instanceof Date
    ? value
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function getPostDescription(
  content: string | null,
  authorName: string,
) {
  const cleanContent = String(content || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanContent) {
    return `A post shared by ${authorName} on HavenSocial.`;
  }

  if (cleanContent.length <= 200) {
    return cleanContent;
  }

  return `${cleanContent.slice(0, 197)}...`;
}

// ==================== SHARED DATA FETCH ====================

// React cache avoids unnecessarily repeating the same lookup
// when generateMetadata and the page both request the post.

const getShareData = cache(async (tweetId: string) => {
  const tweet = await getTweetWithReplies(
    tweetId,
    null,
  );

  if (!tweet) {
    return null;
  }

  const post = tweet as ShareTweet;

  // Deleted posts must never expose their old content or media.
  if (isDeletedPost(post)) {
    return null;
  }

  if (!post.author_sub) {
    return {
      tweet: post,
      author: undefined,
    };
  }

  const profiles = await getBhidProfiles([
    post.author_sub,
  ]);

  return {
    tweet: post,
    author: profiles.get(post.author_sub),
  };
});

// ==================== SOCIAL METADATA ====================

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { tweetId } = await params;

  if (!isValidTweetId(tweetId)) {
    return {
      title: 'Post unavailable | HavenSocial',
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const data = await getShareData(tweetId);

  if (!data) {
    return {
      title: 'Post unavailable | HavenSocial',
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const { tweet, author } = data;

  const authorName = author?.name || 'HavenSocial user';

  const title = `${authorName} on HavenSocial`;

  const description = getPostDescription(
    tweet.content,
    authorName,
  );

  const canonicalUrl =
    `${SITE_URL}/share/tweet/${encodeURIComponent(tweetId)}`;

  // Select an actual image attachment for Open Graph.
  // Do not use an MP4 or other video URL as an image.
  const imageMedia = (tweet.media ?? []).find(
    isImageMedia,
  );

  const imageUrl = imageMedia
    ? getAbsoluteUrl(imageMedia.media_url)
    : null;

  const openGraphImages = imageUrl
    ? [
        {
          url: imageUrl,
          alt:
            imageMedia?.alt_text ||
            `Post by ${authorName} on HavenSocial`,
          ...(imageMedia?.mime_type
            ? { type: imageMedia.mime_type }
            : {}),
          ...(imageMedia?.width
            ? { width: Number(imageMedia.width) }
            : {}),
          ...(imageMedia?.height
            ? { height: Number(imageMedia.height) }
            : {}),
        },
      ]
    : undefined;

  const publicationDate = getPublicationDate(
    tweet.published_at,
  );

  return {
    metadataBase: new URL(SITE_URL),

    title,
    description,

    applicationName: 'HavenSocial',

    alternates: {
      canonical: canonicalUrl,
    },

    openGraph: {
      type: 'article',
      url: canonicalUrl,
      siteName: 'HavenSocial',
      title,
      description,
      ...(openGraphImages
        ? { images: openGraphImages }
        : {}),
      ...(publicationDate
        ? {
            publishedTime: publicationDate.toISOString(),
          }
        : {}),
    },

    twitter: {
      card: imageUrl
        ? 'summary_large_image'
        : 'summary',
      title,
      description,
      ...(imageUrl
        ? { images: [imageUrl] }
        : {}),
    },
  };
}

// ==================== PUBLIC SHARE PAGE ====================

export default async function SharedTweetPage({
  params,
}: PageProps) {
  const { tweetId } = await params;

  if (!isValidTweetId(tweetId)) {
    notFound();
  }

  const data = await getShareData(tweetId);

  if (!data) {
    notFound();
  }

  const { tweet, author } = data;

  const authorName = author?.name || 'HavenSocial user';

  const username = author?.preferredUsername;

  const publicationDate = getPublicationDate(
    tweet.published_at,
  );

  const tweetHref =
    `/tweet/${encodeURIComponent(tweetId)}`;

  const media = tweet.media ?? [];

  return (
    <main className="feed-page">
      <section className="feed">
        <div className="share-preview-heading">
          <Link href="/" className="share-preview-brand">
            HavenSocial
          </Link>

          <p>Shared post</p>
        </div>

        <article className="feed-item share-preview-card">
          {/* AUTHOR */}

          <header className="post-card-header">
            {author?.picture ? (
              <img
                src={author.picture}
                alt={`${authorName}'s profile`}
                className="profile-avatar-small"
                width={44}
                height={44}
              />
            ) : (
              <div
                className="profile-avatar-small"
                aria-hidden="true"
              >
                HS
              </div>
            )}

            <div className="post-author-row">
              <div className="post-author">
                <strong>{authorName}</strong>

                {username && (
                  <span>@{username}</span>
                )}
              </div>
            </div>
          </header>

          {/* POST TEXT */}

          {tweet.content?.trim() ? (
            <p
              className="feed-post-link"
              style={{ whiteSpace: 'pre-wrap' }}
            >
              {tweet.content}
            </p>
          ) : null}

          {/* POST MEDIA */}

          {media.length > 0 && (
            <div className="post-media">
              {media.map((item) => (
                <MediaPreview
                  key={String(item.media_id)}
                  url={item.media_url}
                  mediaType={item.media_type}
                  mimeType={item.mime_type}
                  altText={String(item.alt_text)}
                />
              ))}
            </div>
          )}

          {/* PUBLICATION DATE */}

          <small>
            {publicationDate ? (
              <time dateTime={publicationDate.toISOString()}>
                {new Intl.DateTimeFormat('en-NG', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'Africa/Lagos',
                }).format(publicationDate)}{' '}
                WAT
              </time>
            ) : (
              <span>Publication time unavailable</span>
            )}
          </small>

          {/* OPEN ORIGINAL INTERACTIVE POST */}

          <div className="share-preview-actions">
            <Link
              href={tweetHref}
              className="icon-action-button"
            >
              Open in HavenSocial
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}