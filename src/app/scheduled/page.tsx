import Link from 'next/link';
import { requireLinkedUser } from '@/lib/linked-user';
import { getScheduledTweets } from '@/models/tweets.js';
import ScheduledPostManager from '../components/ScheduledPostManager';

export const metadata = {
  title: 'Scheduled posts | HavenSocial',
};

export default async function ScheduledPostsPage() {
  const user = await requireLinkedUser();
  const posts = await getScheduledTweets(user.users_id, 100);
  const serializablePosts = posts.map((post: {
    tweet_id: string;
    content: string | null;
    scheduled_at: Date | string;
  }) => ({
    tweet_id: String(post.tweet_id),
    content: post.content,
    scheduled_at: new Date(post.scheduled_at).toISOString(),
  }));

  return (
    <main className="feed-page">
      <p><Link href="/feed">Back to feed</Link></p>
      <h1>Scheduled posts</h1>
      <p>Review, edit, reschedule or cancel posts that have not been published.</p>
      <ScheduledPostManager initialPosts={serializablePosts} />
    </main>
  );
}
