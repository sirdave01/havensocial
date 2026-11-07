
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Pin, Repeat2 } from 'lucide-react';

// ==================== TYPES ====================

type PostActionResponse = {
  message?: string;
  reposted?: boolean;
  retweetCount?: number;
  tweet?: {
    is_pinned?: boolean;
  };
};

// ==================== HELPERS ====================

function normalizeCount(value: string | number | undefined) {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : 0;
}

// ==================== POST CONTROLS ====================

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
  const router = useRouter();

  // Reshare state.
  const [hasRetweeted, setHasRetweeted] = useState(retweeted);

  const [currentRetweetCount, setCurrentRetweetCount] =
    useState(() => normalizeCount(retweetCount));

  const [isRetweeting, setIsRetweeting] = useState(false);

  // Pin state.
  const [isPinned, setIsPinned] = useState(pinned);
  const [isPinning, setIsPinning] = useState(false);

  // Error state.
  const [error, setError] = useState('');

  // Synchronize with updated server-rendered props.
  useEffect(() => {
    setHasRetweeted(retweeted);
    setCurrentRetweetCount(normalizeCount(retweetCount));
    setIsPinned(pinned);
  }, [retweeted, retweetCount, pinned]);

  // ====================
  // API REQUEST HELPER
  // ====================

  async function send(
    path: string,
    method: 'POST' | 'DELETE',
    body: Record<string, unknown>,
  ): Promise<PostActionResponse> {
    const response = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const result = await response.json().catch(
      () => ({ message: 'Invalid server response' }),
    ) as PostActionResponse;

    if (!response.ok) {
      throw new Error(
        result.message || 'Action failed',
      );
    }

    return result;
  }

  // ====================
  // RESHARE / UNDO RESHARE
  // ====================

  async function toggleRetweet() {
    if (isRetweeting) return;

    setError('');
    setIsRetweeting(true);

    const wasRetweeted = hasRetweeted;

    try {
      const result = await send(
        '/retweets',
        wasRetweeted ? 'DELETE' : 'POST',
        { tweetId },
      );

      const nextRetweeted = Boolean(result.reposted);

      setHasRetweeted(nextRetweeted);

      if (
        typeof result.retweetCount === 'number' &&
        Number.isFinite(result.retweetCount)
      ) {
        setCurrentRetweetCount(
          Math.max(0, result.retweetCount),
        );
      } else if (nextRetweeted !== wasRetweeted) {
        setCurrentRetweetCount((previous) =>
          Math.max(
            0,
            previous + (nextRetweeted ? 1 : -1),
          ),
        );
      }

      // Refresh server data so duplicate feed entries
      // display the same reshare state and count.
      router.refresh();

    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not update reshare',
      );
    } finally {
      setIsRetweeting(false);
    }
  }

  // ====================
  // PIN / UNPIN
  // ====================

  async function togglePin() {
    if (isPinning) return;

    setError('');
    setIsPinning(true);

    try {
      const result = await send(
        '/tweets/pin',
        'POST',
        { tweetId },
      );

      const nextPinned = Boolean(
        result.tweet?.is_pinned,
      );

      setIsPinned(nextPinned);

      router.refresh();

    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not update pin',
      );
    } finally {
      setIsPinning(false);
    }
  }

  // ====================
  // RENDER
  // ====================

  return (
    <>
      {/* RESHARE BUTTON */}

      <button
        type="button"
        onClick={toggleRetweet}
        disabled={isRetweeting}
        aria-label={
          hasRetweeted
            ? `Undo reshare (${currentRetweetCount})`
            : `Reshare (${currentRetweetCount})`
        }
        aria-pressed={hasRetweeted}
        title={
          hasRetweeted
            ? 'Undo reshare'
            : 'Reshare'
        }
        className={
          hasRetweeted
            ? 'is-retweeted'
            : ''
        }
      >
        <Repeat2
          aria-hidden="true"
        />

        <span>
          {currentRetweetCount}
        </span>
      </button>

      {/* PIN BUTTON */}

      {canPin && (
        <button
          type="button"
          onClick={togglePin}
          disabled={isPinning}
          aria-label={
            isPinned ? 'Unpin post' : 'Pin post'
          }
          aria-pressed={isPinned}
          title={
            isPinned ? 'Unpin post' : 'Pin post'
          }
        >
          <Pin
            aria-hidden="true"
          />
        </button>
      )}

      {/* ACTION ERROR */}

      {error && (
        <span
          role="alert"
          className="post-action-error"
        >
          {error}
        </span>
      )}
    </>
  );
}
