'use client';

import Link from 'next/link';
import { Paperclip, Send } from 'lucide-react';
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
  return new Intl.DateTimeFormat('en-NG', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
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

  const markAsRead = useCallback(async (readThroughMessageId: string | null) => {
    try {
      const response = await fetch(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/read`,
        {
          method: 'PATCH',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ readThroughMessageId }),
        },
      );

      if (response.ok) {
        window.dispatchEvent(new Event('havensocial:messages-updated'));
        return true;
      }
    } catch {
      // The next visible poll or navigation will retry the read update.
    }

    return false;
  }, [conversationId]);

  const refreshMessages = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;

    try {
      const response = await fetch(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/messages`,
        { credentials: 'same-origin', cache: 'no-store' },
      );
      if (!response.ok) return;

      const payload = await response.json();
      if (!Array.isArray(payload.messages)) return;

      const incoming = payload.messages as MessageItem[];
      setMessages((current) => {
        const older = current.filter(
          (message) => !incoming.some((item) => item.message_id === message.message_id),
        );
        const merged = [...older, ...incoming];
        const unique = new Map<string, MessageItem>();
        for (const message of merged) unique.set(message.message_id, message);
        return [...unique.values()].sort(
          (a, b) => compareMessageIds(a.message_id, b.message_id),
        );
      });

      const latest = incoming[incoming.length - 1];
      await markAsRead(latest?.message_id ?? null);
    } catch {
      // Polling is best-effort; existing conversation content remains visible.
    }
  }, [conversationId, markAsRead]);

  useEffect(() => {
    const initialLatest = initialMessages[initialMessages.length - 1];
    void markAsRead(initialLatest?.message_id ?? null);

    const intervalId = window.setInterval(
      () => void refreshMessages(),
      POLL_INTERVAL_MS,
    );
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refreshMessages();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [initialMessages, markAsRead, refreshMessages]);

  useEffect(() => {
    if (isNearBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
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
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: trimmed }),
        },
      );
      const payload = await response.json();
      if (!response.ok || !payload.message) {
        throw new Error(
          payload.messageText || payload.message || 'Message could not be sent.',
        );
      }

      const sentMessage = payload.message as MessageItem;
      setMessages((current) => (
        current.some((item) => item.message_id === sentMessage.message_id)
          ? current
          : [...current, sentMessage]
      ));
      setContent('');
      window.dispatchEvent(new Event('havensocial:messages-updated'));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Message could not be sent.',
      );
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
      if (!response.ok) {
        throw new Error(payload.message || 'Older messages could not be loaded.');
      }

      const older = Array.isArray(payload.messages)
        ? payload.messages as MessageItem[]
        : [];
      setMessages((current) => {
        const known = new Set(current.map((message) => message.message_id));
        return [
          ...older.filter((message) => !known.has(message.message_id)),
          ...current,
        ];
      });
      setHasMore(Boolean(payload.hasMore));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Older messages could not be loaded.',
      );
    } finally {
      setLoadingOlder(false);
    }
  }

  return (
    <section
      className="feed-item"
      style={{
        width: '100%',
        maxWidth: 820,
        margin: '0 auto',
        padding: 0,
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 16,
          borderBottom: '1px solid var(--border, #ddd)',
        }}
      >
        <Link
          href="/messages"
          aria-label="Back to messages"
          style={{ textDecoration: 'none', fontSize: 20 }}
        >
          ←
        </Link>
        <IdentityAvatar
          src={participant.other_picture ?? undefined}
          className="profile-avatar-small"
        />
        <span style={{ minWidth: 0 }}>
          <strong style={{ display: 'block' }}>{participant.other_name}</strong>
          {participant.other_username && (
            <small>@{participant.other_username}</small>
          )}
        </span>
      </header>

      {!participant.can_send && (
        <p
          role="status"
          style={{
            padding: '10px 16px',
            margin: 0,
            background: 'var(--notification-unread-background, rgba(37,99,235,.06))',
          }}
        >
          Messaging is unavailable because one of these accounts has blocked the other.
        </p>
      )}

      <div
        aria-label="Conversation messages"
        onScroll={(event) => {
          const element = event.currentTarget;
          isNearBottom.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 100;
        }}
        style={{
          minHeight: 300,
          maxHeight: '60vh',
          overflowY: 'auto',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {hasMore && (
          <button
            type="button"
            onClick={() => void loadOlder()}
            disabled={loadingOlder}
            style={{ alignSelf: 'center' }}
          >
            {loadingOlder ? 'Loading…' : 'Load older messages'}
          </button>
        )}

        {messages.length === 0 ? (
          <p
            style={{
              textAlign: 'center',
              color: 'var(--muted-foreground, #777)',
              margin: 'auto',
            }}
          >
            This is the beginning of your conversation.
          </p>
        ) : messages.map((message) => {
          const own = String(message.sender_id) === String(viewerId);
          const bubbleBackground = own ? '#1D4ED8' : '#164E63';
          const bubbleBorder = own ? '#1E40AF' : '#0E7490';

          return (
            <div
              key={message.message_id}
              style={{
                display: 'flex',
                justifyContent: own ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  maxWidth: 'min(82%, 560px)',
                  padding: '10px 13px',
                  borderRadius: 16,
                  background: bubbleBackground,
                  color: '#FFFFFF',
                  border: `1px solid ${bubbleBorder}`,
                  overflowWrap: 'anywhere',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.16)',
                }}
              >
                {!own && (
                  <strong
                    style={{
                      display: 'block',
                      fontSize: 12,
                      marginBottom: 4,
                      color: '#FFFFFF',
                    }}
                  >
                    {message.sender_name}
                  </strong>
                )}
                <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#FFFFFF' }}>
                  {message.is_deleted
                    ? 'This message was deleted.'
                    : message.content}
                </p>
                <small
                  style={{
                    display: 'block',
                    textAlign: 'right',
                    color: 'rgba(255,255,255,0.78)',
                    marginTop: 5,
                  }}
                >
                  {formatMessageTime(message.created_at)}
                  {message.is_edited ? ' · edited' : ''}
                </small>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={sendMessage}
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 10,
          padding: 12,
          borderTop: '1px solid var(--border, #ddd)',
        }}
      >
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={participant.can_send ? 'Write a message…' : 'Messaging unavailable'}
          aria-label="Message"
          rows={2}
          maxLength={10000}
          disabled={!participant.can_send || sending}
          style={{
            flex: 1,
            resize: 'vertical',
            minWidth: 0,
            minHeight: 52,
            maxHeight: 180,
            padding: 12,
            borderRadius: 12,
            border: '1px solid var(--border, #334155)',
            background: 'var(--bg, #0a0f1c)',
            color: 'var(--text, #f1f5f9)',
            font: 'inherit',
          }}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            disabled
            aria-label="Attachments will be available in a future update"
            title="Attachments will be available in a future update"
            style={{
              width: 46,
              minWidth: 46,
              height: 46,
              minHeight: 46,
              padding: 0,
              borderRadius: 12,
              background: 'var(--surface-secondary, #1e293b)',
              color: 'var(--text-muted, #94a3b8)',
              border: '1px solid var(--border, #334155)',
              boxShadow: 'none',
              opacity: 0.65,
              cursor: 'not-allowed',
            }}
          >
            <Paperclip aria-hidden="true" size={19} />
          </button>

          <button
            type="submit"
            disabled={!participant.can_send || sending || !content.trim()}
            style={{
              minWidth: 88,
              minHeight: 46,
              padding: '0 14px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              borderRadius: 12,
              background: '#2563EB',
              color: '#FFFFFF',
              border: '1px solid #1D4ED8',
              boxShadow: 'none',
              fontWeight: 700,
              cursor: !participant.can_send || sending || !content.trim()
                ? 'not-allowed'
                : 'pointer',
              opacity: !participant.can_send || sending || !content.trim()
                ? 0.65
                : 1,
            }}
          >
            <Send aria-hidden="true" size={17} />
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" style={{ padding: '0 12px 12px', margin: 0 }}>
          {error}
        </p>
      )}
      <p
        style={{
          margin: '0 12px 10px',
          color: 'var(--text-muted, #94a3b8)',
          fontSize: 12,
        }}
      >
        Attachments will be enabled in a later messaging stage.
      </p>
    </section>
  );
}
