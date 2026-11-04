export default function MediaPreview({ url }: { url: string }) {
  const isVideo = /\.(mp4|webm)(?:$|[?#])/i.test(url);
  return isVideo ? (
    <video className="tweet-media" controls preload="metadata">
      <source src={url} type={url.toLowerCase().includes('.webm') ? 'video/webm' : 'video/mp4'} />
    </video>
  ) : (
    <img src={url} alt="" className="tweet-media" />
  );
}
