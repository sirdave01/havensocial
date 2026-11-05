'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(initialContent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const characterCount = Array.from(content).length;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (editing && !dialog.open) {
      dialog.showModal();
      textareaRef.current?.focus();
    }
    if (!editing && dialog.open) dialog.close();
  }, [editing]);

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

  return (
    <div className="post-editor">
      {!editing && (
        <button
          type="button"
          className="icon-action-button"
          onClick={() => setEditing(true)}
          aria-label="Edit post"
          title="Edit post"
        >
          <Pencil aria-hidden="true" />
        </button>
      )}
      {success && <span role="status">{success}</span>}
      <dialog
        ref={dialogRef}
        className="post-editor-dialog"
        onClose={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      >
        <div className="post-editor-heading">
          <div>
            <h2>Edit post</h2>
            <p>Make your changes, then save when you’re ready.</p>
          </div>
          <button
            type="button"
            className="icon-action-button"
            onClick={() => setEditing(false)}
            aria-label="Close editor"
            title="Close editor"
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <form
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            void save();
          }}
        >
          <label htmlFor={`edit-post-${tweetId}`}>Post text</label>
          <textarea
            id={`edit-post-${tweetId}`}
            ref={textareaRef}
            className="post-editor-textarea"
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              setError('');
              setSuccess('');
            }}
            aria-describedby={`edit-post-count-${tweetId}`}
            aria-invalid={Boolean(error)}
          />
          <div className="post-editor-footer">
            <p id={`edit-post-count-${tweetId}`} aria-live="polite">
              {characterCount.toLocaleString()} / {MAX_CONTENT_LENGTH.toLocaleString()}
            </p>
            <div className="post-editor-buttons">
              <button type="button" className="post-editor-cancel" onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </button>
              <button
                type="submit"
                className="post-editor-save"
                disabled={busy || !content.trim() || characterCount > MAX_CONTENT_LENGTH}
              >
                <Check aria-hidden="true" />
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
          {error && <p role="alert" className="post-editor-error">{error}</p>}
        </form>
      </dialog>
    </div>
  );
}
