'use client';

import { useState } from 'react';
import { Pin, Repeat2 } from 'lucide-react';

export default function PostControls({
  tweetId,
  retweetCount,
  retweeted,
  pinned,
  canPin,
}: {
  tweetId: string;
  retweetCount: string | number | undefined;
  retweeted: boolean;
  pinned: boolean;
  canPin: boolean;
}) {
  const [hasRetweeted, setHasRetweeted] = useState(retweeted);
  const [isPinned, setIsPinned] = useState(pinned);
  const [error, setError] = useState('');

  async function send(path: string, body: Record<string, unknown>) {
    setError('');
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Action failed');
    return result;
  }

  async function retweet() {
    try {
      await send('/retweets', { tweetId });
      setHasRetweeted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not repost');
    }
  }

  async function togglePin() {
    try {
      const result = await send('/tweets/pin', { tweetId });
      setIsPinned(Boolean(result.tweet.is_pinned));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update pin');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={retweet}
        disabled={hasRetweeted}
        aria-label={hasRetweeted ? 'Reposted' : 'Repost'}
        title={hasRetweeted ? 'Reposted' : 'Repost'}
      >
        <Repeat2 aria-hidden="true" />
        <span>{String(retweetCount ?? 0)}</span>
      </button>
      {canPin && (
        <button type="button" onClick={togglePin} aria-label={isPinned ? 'Unpin post' : 'Pin post'} title={isPinned ? 'Unpin post' : 'Pin post'}>
          <Pin aria-hidden="true" />
        </button>
      )}
      {error && <span role="alert" className="post-action-error">{error}</span>}
    </>
  );
}
