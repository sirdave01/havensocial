'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';

const MAX_CONTENT_LENGTH = 25000;

export default function ComposePost({
  replyTo,
  avatarUrl,
}: {
  replyTo?: string;
  avatarUrl?: string;
}) {
  const router = useRouter();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const characterCount = Array.from(content).length;
  const textareaId = replyTo ? 'reply-content' : 'tweet-content';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      setError('Write something before posting.');
      setSuccess('');
      return;
    }
    if (characterCount > MAX_CONTENT_LENGTH) {
      setError('Post content cannot exceed 25,000 characters.');
      setSuccess('');
      return;
    }

    submitting.current = true;
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/tweets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmedContent, isReplyTo: replyTo }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not create the post');

      setContent('');
      setSuccess(replyTo ? 'Reply posted.' : 'Post published.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the post');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor={textareaId}>{replyTo ? 'Reply' : 'Share a post'}</label>
      <div className="compose-post-input">
        <img
          src={avatarUrl || '/images/default-avatar.jpg'}
          alt=""
          className="profile-avatar-small"
          referrerPolicy="no-referrer"
        />
        <textarea
          id={textareaId}
          name="content"
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            setError('');
            setSuccess('');
          }}
          aria-describedby="post-character-count"
          aria-invalid={Boolean(error)}
        />
      </div>
      <p id="post-character-count" aria-live="polite">
        {characterCount.toLocaleString()} / {MAX_CONTENT_LENGTH.toLocaleString()}
      </p>
      <button
        type="submit"
        className="btn-primary"
        disabled={busy || !content.trim() || characterCount > MAX_CONTENT_LENGTH}
      >
        {busy ? 'Posting…' : replyTo ? 'Reply' : 'Post'}
      </button>
      {error && <p role="alert">{error}</p>}
      {success && <p role="status">{success}</p>}
    </form>
  );
}
