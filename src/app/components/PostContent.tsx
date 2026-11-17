import Link from 'next/link';
import type { ReactNode } from 'react';

type MentionProfile = {
  username: string;
  sub: string;
};

const TOKEN_PATTERN = /@([\p{L}\p{N}][\p{L}\p{N}_.-]{0,49})/gu;

export default function PostContent({
  content,
  postHref,
  mentions = [],
}: {
  content: string;
  postHref: string;
  mentions?: MentionProfile[];
}) {
  const elements: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const match of content.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    const username = match[1];
    const preceding = content.slice(0, index);
    const previousCharacter = preceding.slice(-1);

    // Do not turn email addresses or embedded @ strings into mentions.
    if (previousCharacter && /[\p{L}\p{N}_.+-]/u.test(previousCharacter)) continue;

    if (index > cursor) {
      elements.push(
        <Link href={postHref} key={`text-${key++}`}>
          {content.slice(cursor, index)}
        </Link>,
      );
    }

    const profile = mentions.find(
      (item) => item.username.toLocaleLowerCase() === username.toLocaleLowerCase(),
    );

    elements.push(
      <Link
        href={profile ? `/profile/${encodeURIComponent(profile.sub)}` : postHref}
        key={`mention-${key++}`}
        className={profile ? 'post-mention' : undefined}
      >
        @{username}
      </Link>,
    );

    cursor = index + match[0].length;
  }

  if (cursor < content.length) {
    elements.push(
      <Link href={postHref} key={`text-${key++}`}>
        {content.slice(cursor)}
      </Link>,
    );
  }

  if (!elements.length) {
    return <Link href={postHref}>{content}</Link>;
  }

  return <>{elements}</>;
}
