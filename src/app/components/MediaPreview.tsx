export default function MediaPreview({
  url,
  mediaType,
  altText,
  mimeType,
}: {
  url: string;
  mediaType: string;
  altText: string | null;
  mimeType?: string | null;
}) {
  const isVideo = mediaType === 'VIDEO';
  return isVideo ? (
    <video className="tweet-media" controls preload="metadata">
      <source
        src={url}
        type={mimeType || (url.toLowerCase().includes('.webm') ? 'video/webm' : 'video/mp4')}
      />
    </video>
  ) : (
    <img src={url} alt={altText || ''} className="tweet-media" loading="lazy" decoding="async" />
  );
}
