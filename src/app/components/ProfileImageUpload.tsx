'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export default function ProfileImageUpload({ hasCustomImage }: { hasCustomImage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const form = new FormData(event.currentTarget);
      const file = form.get('profilePicture');
      if (!(file instanceof File) || file.size === 0) throw new Error('Choose an image first');
      const signedResponse = await fetch('/media/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'profile', contentType: file.type, size: file.size }),
      });
      const signed = await signedResponse.json();
      if (!signedResponse.ok) throw new Error(signed.message || 'Could not prepare the image upload');

      const uploadResponse = await fetch(signed.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error('Image upload failed');
      const saveResponse = await fetch('/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: signed.key }),
      });
      const result = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(result.message || 'Could not update your profile image');
      router.refresh();
      event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update your profile image');
    } finally {
      setBusy(false);
    }
  }

  async function removeImage() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remove: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not remove your profile image');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove your profile image');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <form onSubmit={submit}>
        <label htmlFor="profile-picture">Profile image (JPEG, PNG, GIF, or WebP; up to 5 MB)</label>
        <input id="profile-picture" name="profilePicture" type="file" accept="image/jpeg,image/png,image/gif,image/webp" />
        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Update image'}</button>
      </form>
      {hasCustomImage && (
        <button type="button" onClick={removeImage} disabled={busy}>Use BHID avatar</button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
