
type MediaPreviewProps = {
  url: string;
  mediaType: string;
  altText: string | null;
  mimeType?: string | null;
};

const VIDEO_MIME_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

export default function MediaPreview({
  url,
  mediaType,
  altText,
  mimeType,
}: MediaPreviewProps) {
  // Remove query strings before checking the file extension.
  // This is important for presigned or query-based media URLs.
  const cleanUrl = url.split(/[?#]/, 1)[0].toLowerCase();

  const extension = cleanUrl.split('.').pop() || '';

  const suppliedMimeType = mimeType
    ?.split(';')[0]
    .trim()
    .toLowerCase();

  const inferredMimeType = VIDEO_MIME_TYPES[extension];

  const videoMimeType =
    suppliedMimeType?.startsWith('video/')
      ? suppliedMimeType
      : inferredMimeType;

  const isVideo =
    mediaType.toUpperCase() === 'VIDEO' ||
    Boolean(inferredMimeType);

  if (isVideo) {
    return (
      <video
        className="tweet-media"
        controls
        playsInline
        preload="metadata"
        aria-label={altText || 'Post video'}
      >
        <source
          src={url}
          type={videoMimeType}
        />

        Your browser does not support this video format.
      </video>
    );
  }

  return (
    <img
      src={url}
      alt={altText || ''}
      className="tweet-media"
      loading="lazy"
      decoding="async"
    />
  );
}
