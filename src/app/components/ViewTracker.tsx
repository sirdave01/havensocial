'use client';

import { useEffect } from 'react';

export default function ViewTracker({ tweetId }: { tweetId: string }) {
  useEffect(() => {
    fetch(`/tweets/${encodeURIComponent(tweetId)}/view`, { method: 'POST' })
      .then((response) => {
        if (!response.ok) console.error('Could not record post view:', response.status);
      })
      .catch((error: unknown) => console.error('Could not record post view:', error));
  }, [tweetId]);

  return null;
}
