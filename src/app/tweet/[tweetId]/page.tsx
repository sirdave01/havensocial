
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import {
  getBhidProfiles,
  getCurrentBhidProfile,
  type BhidProfile,
} from '@/lib/bhid/profile';

import { requireLinkedUser } from '@/lib/linked-user';

import { getTweetWithReplies } from '../../../models/tweets.js';

import ComposePost from '../../components/ComposePost';
import PostCard, { type Post } from '../../components/PostCard';
import ViewTracker from '../../components/ViewTracker';

// ==================== THREADED POST TYPE ====================

type ThreadPost = Post & {
  replies?: ThreadPost[];
};

// ==================== HELPER: FLATTEN REPLIES ====================

function flattenReplies(
  replies: ThreadPost[],
): ThreadPost[] {
  const result: ThreadPost[] = [];

  function visit(reply: ThreadPost) {
    result.push(reply);

    for (const child of reply.replies ?? []) {
      visit(child);
    }
  }

  for (const reply of replies) {
    visit(reply);
  }

  return result;
}

// ==================== HELPER: RENDER REPLY TREE ====================

function renderReplyTree(
  replies: ThreadPost[],
  profiles: Map<string, BhidProfile>,
  viewerId: string | number,
  depth = 0,
): ReactNode {
  return replies.map((reply) => (
    <div
      key={`reply-${reply.tweet_id}`}
      className="reply-thread-item"
      style={{
        marginLeft: depth > 0
          ? `${Math.min(depth, 4) * 16}px`
          : undefined,
      }}
    >
      <PostCard
        post={reply}
        author={profiles.get(reply.author_sub)}
        viewerId={viewerId}
        showFollow={false}
      />

      {/* NESTED REPLIES */}

      {reply.replies?.length ? (
        <div className="nested-replies">
          {renderReplyTree(
            reply.replies,
            profiles,
            viewerId,
            depth + 1,
          )}
        </div>
      ) : null}
    </div>
  ));
}

// ==================== TWEET PAGE ====================

export default async function TweetPage({
  params,
}: {
  params: Promise<{ tweetId: string }>;
}) {
  // 1. Require authentication.
  const user = await requireLinkedUser();

  // 2. Validate the post ID.
  const { tweetId } = await params;

  if (!/^\d+$/.test(tweetId)) {
    notFound();
  }

  // 3. Retrieve the post and current BHID profile.
  const [data, currentProfile] = await Promise.all([
    getTweetWithReplies(tweetId, user.users_id),
    getCurrentBhidProfile(user.bhid_sub),
  ]);

  if (!data) {
    notFound();
  }

  // 4. Get the complete reply tree.
  const replies = (data.replies ?? []) as ThreadPost[];

  // 5. Collect every reply, including nested replies.
  const allReplies = flattenReplies(replies);

  // 6. Collect original author and reply author subjects.
  const profileSubjects = new Set<string>();

  profileSubjects.add(data.author_sub);

  for (const reply of allReplies) {
    if (reply.author_sub) {
      profileSubjects.add(reply.author_sub);
    }
  }

  // Avoid requesting the current user's profile twice.
  profileSubjects.delete(user.bhid_sub);

  // 7. Retrieve BHID profiles.
  const authorProfiles = await getBhidProfiles(
    Array.from(profileSubjects),
  );

  if (currentProfile) {
    authorProfiles.set(
      currentProfile.sub,
      currentProfile,
    );
  }

  // 8. Render the conversation.
  return (
    <main className="feed-page">

      {/* TRACK POST VIEW */}

      <ViewTracker
        tweetId={String(data.tweet_id)}
      />

      {/* ORIGINAL POST */}

      <PostCard
        post={data as Post}
        author={authorProfiles.get(data.author_sub)}
        viewerId={user.users_id}
      />

      {/* REPLY COMPOSER */}

      <ComposePost
        replyTo={String(data.tweet_id)}
        avatarUrl={currentProfile?.picture}
      />

      {/* REPLY THREAD */}

      <section
        className="feed"
        aria-label="Replies"
      >
        {replies.length ? (
          renderReplyTree(
            replies,
            authorProfiles,
            user.users_id,
          )
        ) : (
          <p className="empty-feed">
            No replies yet. Be the first to reply.
          </p>
        )}
      </section>

    </main>
  );
}
