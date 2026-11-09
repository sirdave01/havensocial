'use client';

import { useEffect, useState } from 'react';

type ScheduledPost = {
  tweet_id: string;
  content: string | null;
  scheduled_at: string | Date;
};

function toLocalDateTime(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function localToIso(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default function ScheduledPostManager({
  initialPosts,
}: {
  initialPosts: ScheduledPost[];
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  const [drafts, setDrafts] = useState(() => Object.fromEntries(
    initialPosts.map((post) => [post.tweet_id, {
      content: post.content || '',
      scheduledAt: toLocalDateTime(post.scheduled_at),
    }]),
  ));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function updateDraft(id: string, field: 'content' | 'scheduledAt', value: string) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], [field]: value },
    }));
  }

  async function save(post: ScheduledPost) {
    if (busyId) return;
    const draft = drafts[post.tweet_id];
    const scheduledAt = localToIso(draft?.scheduledAt || '');
    if (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now()) {
      setError('Choose a new publication time in the future.');
      setSuccess('');
      return;
    }

    setBusyId(post.tweet_id);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`/api/tweets/scheduled/${encodeURIComponent(post.tweet_id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft.content, scheduledAt }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || 'Could not update the scheduled post.');
      setPosts((current) => current.map((item) => item.tweet_id === post.tweet_id
        ? { ...item, content: result.post.content, scheduled_at: result.post.scheduled_at }
        : item));
      setSuccess('Scheduled post updated.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the scheduled post.');
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(post: ScheduledPost) {
    if (busyId) return;
    if (!window.confirm('Cancel this scheduled post?')) return;

    setBusyId(post.tweet_id);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`/api/tweets/scheduled/${encodeURIComponent(post.tweet_id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || 'Could not cancel the scheduled post.');
      setPosts((current) => current.filter((item) => item.tweet_id !== post.tweet_id));
      setSuccess('Scheduled post cancelled.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not cancel the scheduled post.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="feed" aria-label="Scheduled posts">
      {error && <p role="alert">{error}</p>}
      {success && <p role="status">{success}</p>}
      {posts.length === 0 ? (
        <p>You have no scheduled posts.</p>
      ) : posts.map((post) => {
        const draft = drafts[post.tweet_id] || {
          content: post.content || '',
          scheduledAt: toLocalDateTime(post.scheduled_at),
        };
        const busy = busyId === post.tweet_id;
        return (
          <article className="feed-item scheduled-post-item" key={post.tweet_id}>
            <label htmlFor={`scheduled-content-${post.tweet_id}`}>Post text</label>
            <textarea
              id={`scheduled-content-${post.tweet_id}`}
              value={draft.content}
              maxLength={25000}
              disabled={busy}
              onChange={(event) => updateDraft(post.tweet_id, 'content', event.target.value)}
            />
            <label htmlFor={`scheduled-at-${post.tweet_id}`}>Publication date and time</label>
            <input
              id={`scheduled-at-${post.tweet_id}`}
              type="datetime-local"
              value={mounted ? draft.scheduledAt : ''}
              disabled={busy}
              onChange={(event) => updateDraft(post.tweet_id, 'scheduledAt', event.target.value)}
            />
            <div className="scheduled-post-actions">
              <button type="button" onClick={() => void save(post)} disabled={busy}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" onClick={() => void cancel(post)} disabled={busy}>
                Cancel post
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
