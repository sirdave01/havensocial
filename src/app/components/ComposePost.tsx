'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export default function ComposePost({ replyTo }: { replyTo?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      const form = new FormData(event.currentTarget);
      const content = String(form.get('content') || '').trim();
      const selectedFile = form.get('media');
      let mediaKey: string | undefined;

      if (selectedFile instanceof File && selectedFile.size > 0) {
        const signedResponse = await fetch('/media/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'tweets',
            contentType: selectedFile.type,
            size: selectedFile.size,
          }),
        });
        const signed = await signedResponse.json();
        if (!signedResponse.ok) throw new Error(signed.message || 'Could not prepare the media upload');

        const uploadResponse = await fetch(signed.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': selectedFile.type },
          body: selectedFile,
        });
        if (!uploadResponse.ok) throw new Error('Media upload failed');
        mediaKey = signed.key;
      }

      const response = await fetch('/tweets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, isReplyTo: replyTo, mediaKey }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not create the post');
      event.currentTarget.reset();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the post');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor={replyTo ? 'reply-content' : 'tweet-content'}>
        {replyTo ? 'Reply' : 'Share a post'}
      </label>
      <textarea
        id={replyTo ? 'reply-content' : 'tweet-content'}
        name="content"
        maxLength={280}
        required
      />
      <label htmlFor={replyTo ? 'reply-media' : 'tweet-media'}>Attach image or video</label>
      <input
        id={replyTo ? 'reply-media' : 'tweet-media'}
        name="media"
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
      />
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? 'Posting…' : replyTo ? 'Reply' : 'Post'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
