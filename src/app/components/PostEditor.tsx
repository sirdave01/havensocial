'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';

const MAX_CONTENT_LENGTH = 25000;

export default function PostEditor({
  tweetId,
  initialContent,
}: {
  tweetId: string;
  initialContent: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(initialContent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const characterCount = Array.from(content).length;

  async function save() {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      setError('Post content cannot be empty.');
      return;
    }
    if (characterCount > MAX_CONTENT_LENGTH) {
      setError('Post content cannot exceed 25,000 characters.');
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`/tweets/${encodeURIComponent(tweetId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmedContent }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not update the post');

      setContent(trimmedContent);
      setEditing(false);
      setSuccess('Post updated.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the post');
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="post-editor">
        <button
          type="button"
          className="icon-action-button"
          onClick={() => setEditing(true)}
          aria-label="Edit post"
          title="Edit post"
        >
          <Pencil aria-hidden="true" />
        </button>
        {success && <span role="status">{success}</span>}
      </div>
    );
  }

  return (
    <div className="post-editor editing">
      <label htmlFor={`edit-post-${tweetId}`}>Edit post</label>
      <textarea
        id={`edit-post-${tweetId}`}
        value={content}
        onChange={(event) => {
          setContent(event.target.value);
          setError('');
          setSuccess('');
        }}
        aria-describedby={`edit-post-count-${tweetId}`}
        aria-invalid={Boolean(error)}
      />
      <p id={`edit-post-count-${tweetId}`}>
        {characterCount.toLocaleString()} / {MAX_CONTENT_LENGTH.toLocaleString()}
      </p>
      <button
        type="button"
        onClick={save}
        disabled={busy || !content.trim() || characterCount > MAX_CONTENT_LENGTH}
        aria-label={busy ? 'Saving post' : 'Save post'}
        title={busy ? 'Saving post' : 'Save post'}
      >
        <Check aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => {
          setContent(initialContent);
          setEditing(false);
          setError('');
        }}
        disabled={busy}
        aria-label="Cancel editing"
        title="Cancel editing"
      >
        <X aria-hidden="true" />
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
