'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import IdentityAvatar from './IdentityAvatar';

const MAX_CONTENT_LENGTH = 25000;
const MAX_MEDIA_PER_POST = 4;
const ACCEPTED_MEDIA_TYPES = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm';

type UploadedMedia = {
  key: string;
};

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
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const characterCount = Array.from(content).length;
  const textareaId = replyTo ? 'reply-content' : 'tweet-content';

  function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    setFiles((current) => [...current, ...selected].slice(0, MAX_MEDIA_PER_POST));
    event.target.value = '';
    setError('');
    setSuccess('');
  }

  async function uploadFile(file: File): Promise<UploadedMedia> {
    const response = await fetch('/media/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'posts', contentType: file.type, size: file.size }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not prepare media upload');

    const uploadResponse = await fetch(result.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!uploadResponse.ok) throw new Error('Could not upload media');
    return { key: result.key };
  }

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
      const uploadedMedia = await Promise.all(files.map(uploadFile));
      const response = await fetch('/tweets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: trimmedContent,
          isReplyTo: replyTo,
          media: uploadedMedia.map(({ key }) => ({ key, altText: '' })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not create the post');

      setContent('');
      setFiles([]);
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
        <IdentityAvatar src={avatarUrl} className="profile-avatar-small" />
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
      <label htmlFor={`${textareaId}-media`}>Attach images or videos</label>
      <input
        id={`${textareaId}-media`}
        type="file"
        accept={ACCEPTED_MEDIA_TYPES}
        multiple
        disabled={busy || files.length >= MAX_MEDIA_PER_POST}
        onChange={chooseFiles}
      />
      {files.length > 0 && (
        <ul className="compose-media-list">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.lastModified}-${index}`}>
              {file.name}
              <button
                type="button"
                disabled={busy}
                onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <p>{files.length} / {MAX_MEDIA_PER_POST} attachments</p>
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
