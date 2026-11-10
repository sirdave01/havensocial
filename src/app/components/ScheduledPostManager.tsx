'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import styles from './ScheduledPostManager.module.css';

type ScheduledMedia = {
  media_id?: string | number;
  media_url?: string | null;
  media_type?: string | null;
  mime_type?: string | null;
  alt_text?: string | null;
  file_size?: number | null;
};

type ScheduledPost = {
  tweet_id: string;
  content: string | null;
  scheduled_at: string;
  created_at?: string | null;
  replies_open_at?: string | null;
  replies_close_at?: string | null;
  media: ScheduledMedia[];
};

type Draft = { content: string; scheduledAt: string };
type DraftMap = Record<string, Draft>;

const TIME_ZONE = 'Africa/Lagos';

function getDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function toWATDateTime(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = getDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function watInputToIso(value: string) {
  if (!value) return null;
  // Africa/Lagos uses UTC+01:00. This avoids depending on the visitor's device timezone.
  const date = new Date(`${value}:00+01:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatWAT(value: string | Date, includeDate = true) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return new Intl.DateTimeFormat('en-NG', {
    timeZone: TIME_ZONE,
    ...(includeDate ? { dateStyle: 'medium' as const } : {}),
    timeStyle: 'short',
  }).format(date);
}

function initialDrafts(posts: ScheduledPost[]): DraftMap {
  return Object.fromEntries(posts.map((post) => [post.tweet_id, {
    content: post.content || '',
    scheduledAt: toWATDateTime(post.scheduled_at),
  }]));
}

function mediaIsVideo(media: ScheduledMedia) {
  return media.media_type?.toUpperCase() === 'VIDEO' || media.mime_type?.toLowerCase().startsWith('video/') === true;
}

export default function ScheduledPostManager({ initialPosts }: { initialPosts: ScheduledPost[] }) {
  const [posts, setPosts] = useState(initialPosts);
  const [drafts, setDrafts] = useState<DraftMap>(() => initialDrafts(initialPosts));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const nextPost = useMemo(() => {
    return [...posts].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0] || null;
  }, [posts]);

  const mediaCount = useMemo(() => posts.reduce((total, post) => total + (post.media?.length || 0), 0), [posts]);

  function updateDraft(id: string, field: keyof Draft, value: string) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] || { content: '', scheduledAt: '' }), [field]: value },
    }));
    setError('');
    setSuccess('');
  }

  async function save(post: ScheduledPost) {
    if (busyId) return;
    const draft = drafts[post.tweet_id] || { content: post.content || '', scheduledAt: toWATDateTime(post.scheduled_at) };
    const scheduledAt = watInputToIso(draft.scheduledAt);

    if (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now()) {
      setError('Choose a new publication time in the future (WAT).');
      setSuccess('');
      return;
    }
    if (!draft.content.trim()) {
      setError('A scheduled post must contain text.');
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
      if (!result?.post) throw new Error('The server did not return the updated scheduled post.');

      const updatedPost: ScheduledPost = {
        ...post,
        content: result.post.content,
        scheduled_at: result.post.scheduled_at,
      };
      setPosts((current) => current.map((item) => item.tweet_id === post.tweet_id ? updatedPost : item));
      setDrafts((current) => ({
        ...current,
        [post.tweet_id]: {
          content: String(result.post.content ?? ''),
          scheduledAt: toWATDateTime(result.post.scheduled_at),
        },
      }));
      setSuccess('Your scheduled post has been updated.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the scheduled post.');
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(post: ScheduledPost) {
    if (busyId || !window.confirm('Cancel and delete this scheduled post?')) return;
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
      setDrafts((current) => {
        const next = { ...current };
        delete next[post.tweet_id];
        return next;
      });
      setSuccess('Scheduled post cancelled.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not cancel the scheduled post.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={styles.manager} aria-label="Scheduled posts">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>YOUR CONTENT</p>
          <h1>Scheduled posts</h1>
          <p className={styles.intro}>Plan ahead, review your posts and make changes before they go live.</p>
        </div>
        <Link className={styles.newPostButton} href="/feed">Create a post <span aria-hidden="true">↗</span></Link>
      </header>

      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>UPCOMING</span>
          <strong>{posts.length.toLocaleString()}</strong>
          <span className={styles.summaryHint}>Awaiting publication</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>ATTACHMENTS</span>
          <strong>{mediaCount.toLocaleString()}</strong>
          <span className={styles.summaryHint}>Across upcoming posts</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>NEXT PUBLISHING</span>
          <strong className={styles.nextValue}>{nextPost ? formatWAT(nextPost.scheduled_at, false) : '—'}</strong>
          <span className={styles.summaryHint}>{nextPost ? formatWAT(nextPost.scheduled_at) : 'Nothing in the queue'}</span>
        </div>
      </div>

      <div className={styles.sectionHeading}>
        <div>
          <h2>Upcoming queue</h2>
          <p>Publication times are shown in West Africa Time (WAT).</p>
        </div>
        <span className={styles.queueCount}>{posts.length} {posts.length === 1 ? 'post' : 'posts'}</span>
      </div>

      {error && <p className={styles.alertError} role="alert">{error}</p>}
      {success && <p className={styles.alertSuccess} role="status">{success}</p>}

      {posts.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon} aria-hidden="true">◷</span>
          <h3>Your queue is clear</h3>
          <p>Posts you schedule will appear here. You can edit their text, change publication times or cancel them before they are published.</p>
          <Link href="/feed" className={styles.emptyButton}>Schedule a post</Link>
        </div>
      ) : (
        <div className={styles.postList}>
          {posts.map((post) => {
            const draft = drafts[post.tweet_id] || {
              content: post.content || '',
              scheduledAt: toWATDateTime(post.scheduled_at),
            };
            const busy = busyId === post.tweet_id;

            return (
              <article className={styles.postCard} key={post.tweet_id}>
                <div className={styles.postTopline}>
                  <span className={styles.pending}><span aria-hidden="true" /> Scheduled</span>
                  <span className={styles.postId}>Post #{post.tweet_id}</span>
                </div>

                <div className={styles.postContent}>
                  <label htmlFor={`scheduled-content-${post.tweet_id}`}>Post content</label>
                  <textarea
                    id={`scheduled-content-${post.tweet_id}`}
                    value={draft.content}
                    maxLength={25000}
                    rows={Math.min(7, Math.max(3, Math.ceil(draft.content.length / 75)))}
                    disabled={busy}
                    onChange={(event) => updateDraft(post.tweet_id, 'content', event.target.value)}
                  />
                  <div className={styles.characterCount}>{draft.content.length.toLocaleString()} / 25,000</div>
                </div>

                {post.media?.length > 0 && (
                  <div className={styles.mediaBlock}>
                    <span className={styles.fieldLabel}>Attached media</span>
                    <div className={styles.mediaGrid}>
                      {post.media.map((media, index) => (
                        <div className={styles.mediaItem} key={`${post.tweet_id}-${media.media_id ?? index}`}>
                          {media.media_url ? mediaIsVideo(media) ? (
                            <video src={media.media_url} controls preload="metadata" />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={media.media_url} alt={media.alt_text || 'Scheduled post attachment'} loading="lazy" />
                          ) : (
                            <span className={styles.mediaUnavailable}>Preview unavailable</span>
                          )}
                          <span className={styles.mediaType}>{mediaIsVideo(media) ? 'VIDEO' : 'IMAGE'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className={styles.scheduleField}>
                  <label htmlFor={`scheduled-at-${post.tweet_id}`}>Publication date and time <span>WAT · Africa/Lagos</span></label>
                  <input
                    id={`scheduled-at-${post.tweet_id}`}
                    type="datetime-local"
                    value={draft.scheduledAt}
                    disabled={busy}
                    onChange={(event) => updateDraft(post.tweet_id, 'scheduledAt', event.target.value)}
                  />
                  <p>Currently scheduled for {formatWAT(post.scheduled_at)}.</p>
                </div>

                {(post.replies_open_at || post.replies_close_at) && (
                  <div className={styles.replyWindow}>
                    <span>Reply availability</span>
                    {post.replies_open_at && <small>Opens: {formatWAT(post.replies_open_at)}</small>}
                    {post.replies_close_at && <small>Closes: {formatWAT(post.replies_close_at)}</small>}
                  </div>
                )}

                <div className={styles.actions}>
                  <button type="button" className={styles.saveButton} onClick={() => void save(post)} disabled={busy}>
                    {busy ? 'Saving…' : 'Save changes'}
                  </button>
                  <button type="button" className={styles.cancelButton} onClick={() => void cancel(post)} disabled={busy}>
                    Cancel post
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
