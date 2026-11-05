'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';

export default function SharePostButton({ tweetId }: { tweetId: string }) {
  const [message, setMessage] = useState('');

  async function share() {
    const url = new URL(`/tweet/${encodeURIComponent(tweetId)}`, window.location.origin).toString();
    try {
      if (navigator.share) {
        await navigator.share({ url });
      } else {
        await navigator.clipboard.writeText(url);
        setMessage('Link copied');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setMessage('Could not share post');
    }
  }

  return (
    <>
      <button type="button" className="icon-action-button" onClick={share} aria-label="Share post" title="Share post">
        <Share2 aria-hidden="true" />
      </button>
      {message && <span role="status" className="share-status">{message}</span>}
    </>
  );
}
