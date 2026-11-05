import { notFound } from 'next/navigation';
import { getBhidProfiles, getCurrentBhidProfile } from '@/lib/bhid/profile';
import { requireLinkedUser } from '@/lib/linked-user';
import { getTweetWithReplies } from '../../../models/tweets.js';
import ComposePost from '../../components/ComposePost';
import PostCard, { type Post } from '../../components/PostCard';
import ViewTracker from '../../components/ViewTracker';

export default async function TweetPage({
  params,
}: {
  params: Promise<{ tweetId: string }>;
}) {
  const user = await requireLinkedUser();
  const { tweetId } = await params;
  if (!/^\d+$/.test(tweetId)) notFound();

  const [data, currentProfile] = await Promise.all([
    getTweetWithReplies(tweetId, user.users_id),
    getCurrentBhidProfile(user.bhid_sub),
  ]);
  if (!data) notFound();

  const replies = data.replies as Post[];
  const authorProfiles = await getBhidProfiles([
    data.author_sub,
    ...replies.map((reply) => reply.author_sub),
  ].filter((subject) => subject !== user.bhid_sub));
  if (currentProfile) authorProfiles.set(currentProfile.sub, currentProfile);

  return (
    <main className="feed-page">
      <ViewTracker tweetId={String(data.tweet_id)} />
      <PostCard
        post={data}
        author={authorProfiles.get(data.author_sub)}
        viewerId={user.users_id}
      />
      <ComposePost replyTo={String(data.tweet_id)} avatarUrl={currentProfile?.picture} />
      <section aria-label="Replies">
        {replies.map((reply) => (
          <PostCard
            key={String(reply.tweet_id)}
            post={reply}
            author={authorProfiles.get(reply.author_sub)}
            viewerId={user.users_id}
          />
        ))}
      </section>
    </main>
  );
}
