'use client';

import { useState } from 'react';

const FALLBACK_AVATAR = '/images/default-avatar.jpg';

export default function IdentityAvatar({
  src,
  className,
}: {
  src?: string;
  className: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const imageSrc = src && src !== failedSrc ? src : FALLBACK_AVATAR;

  return (
    <img
      src={imageSrc}
      alt=""
      className={className}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(imageSrc)}
    />
  );
}
