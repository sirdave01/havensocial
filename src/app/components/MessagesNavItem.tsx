'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import NavIcon from './NavIcon';

const REFRESH_INTERVAL_MS = 20_000;

export default function MessagesNavItem({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(
    Number.isFinite(initialCount) ? Math.max(0, initialCount) : 0,
  );

  const refreshCount = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    try {
      const response = await fetch('/api/messages/unread-count', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const result: unknown = await response.json();
      if (
        result && typeof result === 'object' && 'count' in result &&
        typeof result.count === 'number' && Number.isFinite(result.count)
      ) setCount(Math.max(0, result.count));
    } catch {
      // Keep the last known count while offline.
    }
  }, []);

  useEffect(() => {
    void refreshCount();
    const intervalId = window.setInterval(() => void refreshCount(), REFRESH_INTERVAL_MS);
    const handleFocus = () => void refreshCount();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refreshCount();
    };
    const handleUpdate = () => void refreshCount();
    window.addEventListener('focus', handleFocus);
    window.addEventListener('havensocial:messages-updated', handleUpdate);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('havensocial:messages-updated', handleUpdate);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshCount]);

  const badgeText = count > 99 ? '99+' : String(count);
  return (
    <Link
      href="/messages"
      className="nav-item"
      aria-label={count > 0 ? `Messages, ${count} unread` : 'Messages'}
    >
      <span aria-hidden="true" style={{ position: 'relative', display: 'inline-flex' }}>
        <NavIcon name="messages" />
        {count > 0 && (
          <span style={{
            position: 'absolute', top: -8, right: -11, minWidth: 18, height: 18,
            padding: '0 4px', display: 'inline-flex', alignItems: 'center',
            justifyContent: 'center', borderRadius: 999, background: '#2563eb',
            color: '#ffffff', fontSize: 10, fontWeight: 700, lineHeight: 1,
            border: '2px solid var(--background, #ffffff)', boxSizing: 'content-box',
          }}>{badgeText}</span>
        )}
      </span>
      <span>Messages</span>
    </Link>
  );
}
