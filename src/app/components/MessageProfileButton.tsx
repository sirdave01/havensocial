'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle } from 'lucide-react';

type Props = {
  recipientSub: string;
};

type CreateConversationResponse = {
  conversationId?: string;
  message?: string;
};

export default function MessageProfileButton({ recipientSub }: Props) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');

  async function openConversation() {
    if (opening) return;

    setOpening(true);
    setError('');

    try {
      const response = await fetch('/api/messages/conversations', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientSub }),
      });

      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await response.json() as CreateConversationResponse
        : null;

      if (!response.ok || !payload?.conversationId) {
        throw new Error(
          payload?.message ||
          (contentType.includes('application/json')
            ? 'Could not open this conversation.'
            : 'The messaging service returned an unexpected response. Please try again.'),
        );
      }

      router.push(`/messages/${encodeURIComponent(payload.conversationId)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open this conversation.');
      setOpening(false);
    }
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
      <button
        type="button"
        onClick={() => void openConversation()}
        disabled={opening}
        aria-label="Message this user"
        title="Message"
        className="profile-message-button"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          minHeight: 42,
          padding: '0 16px',
          borderRadius: 999,
          border: '1px solid var(--border, #334155)',
          background: 'var(--surface-secondary, #164e63)',
          color: '#ffffff',
          boxShadow: 'none',
          cursor: opening ? 'wait' : 'pointer',
        }}
      >
        <MessageCircle size={18} aria-hidden="true" />
        <span>{opening ? 'Opening…' : 'Message'}</span>
      </button>
      {error && <span role="alert" style={{ fontSize: 12, color: '#f87171' }}>{error}</span>}
    </div>
  );
}
