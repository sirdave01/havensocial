'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { UserCheck, UserPlus } from 'lucide-react';

export default function FollowButton({
  userId,
  initialFollowing,
  showLabel = false,
}: {
  userId: string | number;
  initialFollowing: boolean;
  showLabel?: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setFollowing(initialFollowing);
  }, [initialFollowing]);

  async function toggleFollow() {
    if (busy) return;
    setBusy(true);
    setError('');
    const nextFollowing = !following;
    setFollowing(nextFollowing);
    try {
      const response = await fetch(nextFollowing ? '/follow' : '/unfollow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followeeId: userId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not update follow status');
      router.refresh();
    } catch (caught) {
      setFollowing(!nextFollowing);
      setError(caught instanceof Error ? caught.message : 'Could not update follow status');
    } finally {
      setBusy(false);
    }
  }

  const label = following ? 'Following' : 'Follow';
  const Icon = following ? UserCheck : UserPlus;

  return (
    <span className={showLabel ? 'follow-control follow-control-labeled' : 'follow-control'}>
      <button
        type="button"
        className={`follow-button${following ? ' is-following' : ''}`}
        onClick={toggleFollow}
        disabled={busy}
        aria-label={label}
        aria-pressed={following}
        aria-busy={busy}
        title={label}
      >
        <Icon aria-hidden="true" />
        {showLabel && <span>{label}</span>}
      </button>
      {error && <span role="alert" className="follow-error">{error}</span>}
    </span>
  );
}
