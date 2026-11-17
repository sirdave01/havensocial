'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import IdentityAvatar from './IdentityAvatar';

type ConversationItem = {
  conversation_id: string;
  other_sub: string;
  other_name: string;
  other_username: string | null;
  other_picture: string | null;
  last_message_content: string | null;
  last_message_at: string | Date | null;
  last_message_sender_id: string | null;
  unread_count: number;
  is_muted: boolean;
};

type SearchUser = {
  user_id: string;
  bhid_sub: string;
  name: string;
  preferred_username: string | null;
  picture: string | null;
};

function formatTime(value: string | Date | null) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-NG', { hour: 'numeric', minute: '2-digit' }).format(date);
}

export default function MessagesInbox({ initialConversations }: { initialConversations: ConversationItem[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [openingUser, setOpeningUser] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const term = query.trim();
    if (term.replace(/^@/, '').length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/messages/users?q=${encodeURIComponent(term)}`, {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || 'Could not search users.');
        setResults(Array.isArray(payload.users) ? payload.users : []);
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : 'Could not search users.');
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function openConversation(user: SearchUser) {
    setOpeningUser(user.user_id);
    setError('');
    try {
      const response = await fetch('/api/messages/conversations', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientSub: user.bhid_sub }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.conversationId) {
        throw new Error(payload.message || 'Could not open this conversation.');
      }
      router.push(`/messages/${encodeURIComponent(payload.conversationId)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open this conversation.');
      setOpeningUser(null);
    }
  }

  return (
    <div className="messages-inbox" style={{ width: '100%', maxWidth: 760, margin: '0 auto' }}>
      <section className="feed-item" style={{ marginBottom: 16 }}>
        <label htmlFor="messages-user-search"><strong>Start a conversation</strong></label>
        <input
          id="messages-user-search"
          type="search"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setError(''); }}
          placeholder="Search by name, username or BHID…"
          autoComplete="off"
          style={{ display: 'block', width: '100%', marginTop: 8, padding: 12 }}
        />
        {searching && <p role="status">Searching…</p>}
        {error && <p role="alert">{error}</p>}
        {results.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
            {results.map((person) => (
              <li key={person.user_id} style={{ borderTop: '1px solid var(--border, #ddd)' }}>
                <button
                  type="button"
                  onClick={() => void openConversation(person)}
                  disabled={openingUser !== null}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: 12, textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer' }}
                >
                  <IdentityAvatar src={person.picture ?? undefined} className="profile-avatar-small" />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: 'block' }}>{person.name || 'HavenSocial user'}</strong>
                    <small>{person.preferred_username ? `@${person.preferred_username}` : person.bhid_sub}</small>
                  </span>
                  <span>{openingUser === person.user_id ? 'Opening…' : 'Message'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.trim().length >= 2 && !searching && results.length === 0 && !error && (
          <p>No matching users found.</p>
        )}
      </section>

      <section aria-label="Your conversations">
        <h2>Messages</h2>
        {initialConversations.length === 0 ? (
          <p className="empty-feed">You don't have any conversations yet. Search for someone above to start messaging.</p>
        ) : (
          <div>
            {initialConversations.map((item) => (
              <Link
                href={`/messages/${encodeURIComponent(item.conversation_id)}`}
                key={item.conversation_id}
                className="feed-item"
                style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', marginBottom: 8 }}
              >
                <IdentityAvatar src={item.other_picture ?? undefined} className="profile-avatar-small" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: 'block' }}>{item.other_name}</strong>
                  {item.other_username && <small>@{item.other_username}</small>}
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.last_message_content || 'Start the conversation'}
                  </span>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <small>{formatTime(item.last_message_at)}</small>
                  {item.unread_count > 0 && (
                    <strong style={{ borderRadius: 999, background: '#2563eb', color: '#fff', minWidth: 20, padding: '2px 6px', textAlign: 'center', fontSize: 12 }}>
                      {item.unread_count > 99 ? '99+' : item.unread_count}
                    </strong>
                  )}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
