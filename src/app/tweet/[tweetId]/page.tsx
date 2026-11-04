import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireLinkedUser } from '@/lib/linked-user';
import { getTweetWithReplies } from '../../../models/tweets.js';
import ComposePost from '../../components/ComposePost';
import MediaPreview from '../../components/MediaPreview';
import ViewTracker from '../../components/ViewTracker';

export default async function TweetPage({
  params,
}: {
  params: Promise<{ tweetId: string }>;
}) {
  const user = await requireLinkedUser();
  const { tweetId } = await params;
  if (!/^\d+$/.test(tweetId)) notFound();
  const data = await getTweetWithReplies(tweetId, user.users_id);
  if (!data) notFound();

  return (
    <main className="feed-page">
      <ViewTracker tweetId={String(data.tweet_id)} />
      <article className="feed-item">
        <Link href={`/profile/${encodeURIComponent(data.username)}`}>
          {data.display_name || data.username}
        </Link>
        <p>{data.content}</p>
        {Array.isArray(data.media_url) && data.media_url.map((url: string) => (
          <MediaPreview key={url} url={url} />
        ))}
        <small>{new Date(data.created_at).toLocaleString()}</small>
      </article>
      <ComposePost replyTo={String(data.tweet_id)} />
      <section aria-label="Replies">
        {data.replies.map((reply: Record<string, unknown>) => (
          <article className="feed-item" key={String(reply.tweet_id)}>
            <Link href={`/profile/${encodeURIComponent(String(reply.username))}`}>
              {String(reply.display_name || reply.username)}
            </Link>
            <p>{String(reply.content || '')}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
