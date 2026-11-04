'use client';

import { useState } from 'react';

export default function PostControls({
  tweetId,
  retweeted,
  pinned,
  canPin,
}: {
  tweetId: string;
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
    <div className="feed-actions">
      <button type="button" onClick={retweet} disabled={hasRetweeted}>
        {hasRetweeted ? 'Reposted' : 'Repost'}
      </button>
      {canPin && (
        <button type="button" onClick={togglePin}>
          {isPinned ? 'Unpin' : 'Pin'}
        </button>
      )}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
