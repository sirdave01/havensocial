'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const MINIMUM_DWELL_TIME_MS = 2_000;
const VIEW_RULE_VERSION = 'visibility-50pct-2s-v1';

type ViewTrackerProps = {
  tweetId: string;
  /** The article element to observe. Omit to locate it by data-view-tweet-id. */
  targetId?: string;
};

export default function ViewTracker({
  tweetId,
  targetId,
}: ViewTrackerProps) {
  const router = useRouter();

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const candidates = document.querySelectorAll<HTMLElement>(
      '[data-view-tweet-id]',
    );

    const target = targetId
      ? document.getElementById(targetId)
      : Array.from(candidates).find(
          (element) => element.dataset.viewTweetId === tweetId,
        );

    if (!target || target.dataset.viewRequestSent === 'true') return;

    // Avoid attaching duplicate observers when both a page and its
    // PostCard contain a tracker, or when React Strict Mode replays effects.
    if (target.dataset.viewObserverAttached === 'true') return;
    target.dataset.viewObserverAttached = 'true';

    let timer: ReturnType<typeof setTimeout> | undefined;
    let visibleEnough = false;
    let requestInProgress = false;
    let disposed = false;
    let visibleSince = 0;

    const clearDwellTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      visibleSince = 0;
    };

    const submitQualifiedView = async (dwellTimeMs: number) => {
      if (requestInProgress || disposed) return;

      requestInProgress = true;
      target.dataset.viewRequestSent = 'pending';

      try {
        const response = await fetch(
          `/tweets/${encodeURIComponent(tweetId)}/view`,
          {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              dwellTimeMs,
              ruleVersion: VIEW_RULE_VERSION,
            }),
          },
        );

        if (!response.ok) {
          console.warn('Could not record qualified post view:', response.status);
          delete target.dataset.viewRequestSent;
          return;
        }

        const result = (await response.json().catch(() => null)) as
          | { qualified?: boolean; alreadyCounted?: boolean }
          | null;

        if (result?.qualified || result?.alreadyCounted) {
          target.dataset.viewRequestSent = 'true';
          if (result?.qualified && !result?.alreadyCounted) {
            router.refresh();
          }
        } else {
          delete target.dataset.viewRequestSent;
        }
      } catch (error) {
        delete target.dataset.viewRequestSent;
        console.warn('Could not record qualified post view:', error);
      } finally {
        requestInProgress = false;
      }
    };

    const startDwellTimer = () => {
      if (
        timer ||
        requestInProgress ||
        target.dataset.viewRequestSent === 'true' ||
        target.dataset.viewRequestSent === 'pending' ||
        !visibleEnough ||
        document.visibilityState !== 'visible'
      ) {
        return;
      }

      visibleSince = performance.now();
      timer = setTimeout(() => {
        timer = undefined;

        if (
          disposed ||
          !visibleEnough ||
          document.visibilityState !== 'visible'
        ) {
          clearDwellTimer();
          return;
        }

        const elapsed = Math.max(
          MINIMUM_DWELL_TIME_MS,
          Math.round(performance.now() - visibleSince),
        );

        void submitQualifiedView(elapsed);
      }, MINIMUM_DWELL_TIME_MS);
    };

    // For taller posts, require at least half a viewport of the post to
    // be visible rather than requiring half of an impossibly tall card.
    const targetHeight = target.getBoundingClientRect().height;
    const viewportHeight = Math.max(window.innerHeight, 1);
    const requiredVisibleRatio = targetHeight > viewportHeight
      ? Math.min(0.5, (viewportHeight * 0.5) / targetHeight)
      : 0.5;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target !== target) continue;

          visibleEnough =
            entry.isIntersecting &&
            entry.intersectionRatio >= requiredVisibleRatio;

          if (visibleEnough) {
            startDwellTimer();
          } else {
            clearDwellTimer();
          }
        }
      },
      {
        threshold: [0, requiredVisibleRatio],
      },
    );

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        clearDwellTimer();
      } else if (visibleEnough) {
        startDwellTimer();
      }
    };

    observer.observe(target);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      clearDwellTimer();
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      delete target.dataset.viewObserverAttached;
    };
  }, [tweetId, targetId, router]);

  return null;
}
