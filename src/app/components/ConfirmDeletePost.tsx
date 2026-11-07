
'use client';

import type { FormEvent } from 'react';
import { Trash2 } from 'lucide-react';

import { deleteTweetAction } from '@/app/actions';

export default function ConfirmDeletePost({
  tweetId,
}: {
  tweetId: string;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const confirmed = window.confirm(
      'Are you sure you want to delete this post? It will be removed from HavenSocial.'
    );

    if (!confirmed) {
      event.preventDefault();
    }
  }

  return (
    <form
      action={deleteTweetAction}
      onSubmit={handleSubmit}
    >
      <input
        type="hidden"
        name="tweetId"
        value={tweetId}
      />

      <button
        type="submit"
        aria-label="Delete post"
        title="Delete post"
      >
        <Trash2 aria-hidden="true" />
      </button>
    </form>
  );
}
