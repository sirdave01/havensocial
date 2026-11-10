import Link from 'next/link';
import { requireLinkedUser } from '@/lib/linked-user';
import { getScheduledTweets } from '@/models/tweets.js';
import ScheduledPostManager from '../components/ScheduledPostManager';

export const metadata = {
  title: 'Scheduled posts | HavenSocial',
  description: 'Manage your upcoming HavenSocial posts.',
};

export default async function ScheduledPostsPage() {
  const user = await requireLinkedUser();
  const posts = await getScheduledTweets(user.users_id, 100);

  const serializablePosts = posts.map((post: {
    tweet_id: string;
    content: string | null;
    scheduled_at: Date | string;
    created_at?: Date | string | null;
    replies_open_at?: Date | string | null;
    replies_close_at?: Date | string | null;
    media?: Array<{
      media_id?: string | number;
      media_url?: string | null;
      media_type?: string | null;
      mime_type?: string | null;
      alt_text?: string | null;
      file_size?: number | null;
    }>;
  }) => ({
    tweet_id: String(post.tweet_id),
    content: post.content,
    scheduled_at: new Date(post.scheduled_at).toISOString(),
    created_at: post.created_at ? new Date(post.created_at).toISOString() : null,
    replies_open_at: post.replies_open_at ? new Date(post.replies_open_at).toISOString() : null,
    replies_close_at: post.replies_close_at ? new Date(post.replies_close_at).toISOString() : null,
    media: (post.media || []).map((item) => ({
      media_id: item.media_id == null ? undefined : String(item.media_id),
      media_url: item.media_url || null,
      media_type: item.media_type || null,
      mime_type: item.mime_type || null,
      alt_text: item.alt_text || null,
      file_size: item.file_size ?? null,
    })),
  }));

  return (
    <main className="feed-page">
      <p className="scheduled-back-link"><Link href="/feed">← Back to feed</Link></p>
      <ScheduledPostManager initialPosts={serializablePosts} />
    </main>
  );
}
