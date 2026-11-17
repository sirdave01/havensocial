'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import IdentityAvatar from './IdentityAvatar';

type MessageItem = {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  sender_sub: string;
  sender_name: string;
  sender_username: string | null;
  sender_picture: string | null;
  content: string | null;
  reply_to_message_id: string | null;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string | Date;
  updated_at: string | Date;
};

type OtherParticipant = {
  other_sub: string;
  other_name: string;
  other_username: string | null;
  other_picture: string | null;
  can_send: boolean;
};

const POLL_INTERVAL_MS = 5_000;

function compareMessageIds(a: string, b: string) {
  return a.length === b.length ? a.localeCompare(b) : a.length - b.length;
}

function formatMessageTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-NG', { hour: 'numeric', minute: '2-digit' }).format(date);
}

export default function ConversationView({
  conversationId,
  viewerId,
  participant,
  initialMessages,
  initialHasMore,
}: {
  conversationId: string;
  viewerId: string;
  participant: OtherParticipant;
  initialMessages: MessageItem[];
  initialHasMore: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);

  const refreshMessages = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    try {
      const response = await fetch(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/messages`,
        { credentials: 'same-origin', cache: 'no-store' },
      );
      if (!response.ok) return;
      const payload = await response.json();
      if (Array.isArray(payload.messages)) {
        setMessages((current) => {
          const incoming = payload.messages as MessageItem[];
          const older = current.filter((message) => !incoming.some((item) => item.message_id === message.message_id));
          const merged = [...older, ...incoming];
          // Keep a stable unique list in case a poll overlaps a send response.
          const unique = new Map<string, MessageItem>();
          for (const message of merged) unique.set(message.message_id, message);
          return [...unique.values()].sort((a, b) => compareMessageIds(a.message_id, b.message_id));
        });
        const latest = (payload.messages as MessageItem[])[(payload.messages as MessageItem[]).length - 1];
        await fetch(`/api/messages/conversations/${encodeURIComponent(conversationId)}/read`, {
          method: 'PATCH', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ readThrough: latest?.created_at ?? null }),
        });
        window.dispatchEvent(new Event('havensocial:messages-updated'));
      }
    } catch {
      // Polling is best-effort; existing conversation content remains visible.
    }
  }, [conversationId]);

  useEffect(() => {
    const initialLatest = initialMessages[initialMessages.length - 1];
    void fetch(`/api/messages/conversations/${encodeURIComponent(conversationId)}/read`, {
      method: 'PATCH', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readThrough: initialLatest?.created_at ?? null }),
    }).then(() => window.dispatchEvent(new Event('havensocial:messages-updated'))).catch(() => undefined);

    const intervalId = window.setInterval(() => void refreshMessages(), POLL_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refreshMessages();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [conversationId, refreshMessages, initialMessages]);

  useEffect(() => {
    if (isNearBottom.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError('');
    try {
      const response = await fetch(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/messages`,
        {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: trimmed }),
        },
      );
      const payload = await response.json();
      if (!response.ok || !payload.message) throw new Error(payload.messageText || payload.message || 'Message could not be sent.');
      setMessages((current) => [...current, payload.message as MessageItem]);
      setContent('');
      window.dispatchEvent(new Event('havensocial:messages-updated'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Message could not be sent.');
    } finally {
      setSending(false);
    }
  }

  async function loadOlder() {
    const oldest = messages[0]?.message_id;
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const response = await fetch(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/messages?before=${encodeURIComponent(oldest)}`,
        { credentials: 'same-origin', cache: 'no-store' },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Older messages could not be loaded.');
      const older = Array.isArray(payload.messages) ? payload.messages as MessageItem[] : [];
      setMessages((current) => {
        const known = new Set(current.map((message) => message.message_id));
        return [...older.filter((message) => !known.has(message.message_id)), ...current];
      });
      setHasMore(Boolean(payload.hasMore));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Older messages could not be loaded.');
    } finally {
      setLoadingOlder(false);
    }
  }

  return (
    <section className="feed-item" style={{ width: '100%', maxWidth: 820, margin: '0 auto', padding: 0, overflow: 'hidden' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderBottom: '1px solid var(--border, #ddd)' }}>
        <Link href="/messages" aria-label="Back to messages" style={{ textDecoration: 'none', fontSize: 20 }}>←</Link>
        <IdentityAvatar src={participant.other_picture ?? undefined} className="profile-avatar-small" />
        <span style={{ minWidth: 0 }}>
          <strong style={{ display: 'block' }}>{participant.other_name}</strong>
          {participant.other_username && <small>@{participant.other_username}</small>}
        </span>
      </header>

      {!participant.can_send && (
        <p role="status" style={{ padding: '10px 16px', margin: 0, background: 'var(--notification-unread-background, rgba(37,99,235,.06))' }}>
          Messaging is unavailable because one of these accounts has blocked the other.
        </p>
      )}

      <div
        aria-label="Conversation messages"
        onScroll={(event) => {
          const element = event.currentTarget;
          isNearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
        }}
        style={{ minHeight: 300, maxHeight: '60vh', overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {hasMore && (
          <button type="button" onClick={() => void loadOlder()} disabled={loadingOlder} style={{ alignSelf: 'center' }}>
            {loadingOlder ? 'Loading…' : 'Load older messages'}
          </button>
        )}
        {messages.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--muted-foreground, #777)', margin: 'auto' }}>This is the beginning of your conversation.</p>
        ) : messages.map((message) => {
          const own = String(message.sender_id) === String(viewerId);
          return (
            <div key={message.message_id} style={{ display: 'flex', justifyContent: own ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: 'min(82%, 560px)', padding: '10px 13px', borderRadius: 16, background: own ? 'var(--primary, #2563eb)' : 'var(--surface-secondary, #eee)', color: own ? '#fff' : 'inherit', overflowWrap: 'anywhere' }}>
                {!own && <strong style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>{message.sender_name}</strong>}
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message.is_deleted ? 'This message was deleted.' : message.content}</p>
                <small style={{ display: 'block', textAlign: 'right', opacity: 0.75, marginTop: 5 }}>
                  {formatMessageTime(message.created_at)}{message.is_edited ? ' · edited' : ''}
                </small>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--border, #ddd)' }}>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={participant.can_send ? 'Write a message…' : 'Messaging unavailable'}
          aria-label="Message"
          rows={2}
          maxLength={10000}
          disabled={!participant.can_send || sending}
          style={{ flex: 1, resize: 'vertical', minWidth: 0, padding: 10, borderRadius: 10 }}
        />
        <button type="submit" disabled={!participant.can_send || sending || !content.trim()}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
      {error && <p role="alert" style={{ padding: '0 12px 12px', margin: 0 }}>{error}</p>}
    </section>
  );
}
