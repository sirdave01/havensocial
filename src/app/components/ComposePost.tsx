'use client';

import { useRouter } from 'next/navigation';
import { ImagePlus } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import IdentityAvatar from './IdentityAvatar';

const MAX_CONTENT_LENGTH = 25000;
const MAX_MEDIA_PER_POST = 4;
const MAX_MEDIA_SIZE = 15 * 1024 * 1024;
const S3_UPLOAD_TIMEOUT = 10 * 60 * 1000;
const SINGLE_UPLOAD_MAX_ATTEMPTS = 2;
const VIDEO_PART_MAX_ATTEMPTS = 3;
const ACCEPTED_MEDIA_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
  'video/mp4', 'video/webm', 'video/quicktime',
];
const ACCEPTED_MEDIA_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif',
  '.mp4', '.webm', '.mov',
];

type UploadedMedia = { key: string };
type UploadUrlResult = { uploadUrl?: string; key?: string; message?: string };
type PreparedMedia = { file: File; contentType: string };
type MultipartStartResult = {
  mode: 'multipart';
  key: string;
  uploadId: string;
  partSize: number;
} | {
  mode: 'single';
  uploadUrl: string;
  key: string;
  message?: string;
};
type PartUrlResult = { uploadUrl?: string; message?: string };

class MediaUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaUploadError';
  }
}

class S3UploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly timedOut = false,
  ) {
    super(message);
    this.name = 'S3UploadError';
  }
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4',
  webm: 'video/webm', mov: 'video/quicktime',
};

function getFileExtension(file: File) {
  return file.name.split('.').pop()?.toLowerCase() || '';
}

function isHeicFile(file: File) {
  const extension = getFileExtension(file);
  const mime = file.type.toLowerCase().split(';')[0].trim();
  return ['heic', 'heif'].includes(extension) ||
    /^image\/(?:heic|heif)(?:-sequence)?$/.test(mime);
}

function getSupportedContentType(file: File): string | null {
  const extension = getFileExtension(file);
  const mime = file.type.toLowerCase().split(';')[0].trim();
  if (isHeicFile(file)) return 'image/heic';
  if (extension === 'mov' || mime === 'video/quicktime') return 'video/quicktime';
  if (ACCEPTED_MEDIA_TYPES.includes(mime)) return mime;
  if (!mime || mime === 'application/octet-stream') return MIME_BY_EXTENSION[extension] || null;
  return null;
}

async function prepareMediaForUpload(originalFile: File): Promise<PreparedMedia> {
  const originalType = getSupportedContentType(originalFile);
  if (!originalType) throw new MediaUploadError(`${originalFile.name}: unsupported media format.`);
  if (originalFile.size < 1 || originalFile.size > MAX_MEDIA_SIZE) {
    throw new MediaUploadError(`${originalFile.name}: each file must be 15 MB or smaller.`);
  }

  if (isHeicFile(originalFile)) {
    try {
      const heicModule = await import('heic2any');
      const converted = await heicModule.default({ blob: originalFile, toType: 'image/jpeg', quality: 0.88 });
      const jpegBlob = Array.isArray(converted) ? converted[0] : converted;
      if (!jpegBlob || jpegBlob.size === 0) throw new Error('Converted image is empty.');
      if (jpegBlob.size > MAX_MEDIA_SIZE) throw new Error('Converted image exceeds 15 MB.');
      const newFilename = originalFile.name.replace(/\.(heic|heif)$/i, '') + '.jpg';
      return {
        file: new File([jpegBlob], newFilename, { type: 'image/jpeg', lastModified: originalFile.lastModified }),
        contentType: 'image/jpeg',
      };
    } catch (error) {
      console.error('HEIC/HEIF conversion failed:', {
        fileName: originalFile.name,
        errorName: error instanceof Error ? error.name : 'NonError',
      });
      throw new MediaUploadError(`We couldn't prepare ${originalFile.name}. Please try another photograph.`);
    }
  }

  return { file: originalFile, contentType: originalType };
}

async function readResponse<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function getUploadUrlErrorMessage(status: number) {
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 413) return 'This file is too large. Please choose a file of 15 MB or less.';
  if (status === 503 || status >= 500) return 'Media uploads are temporarily unavailable. Please try again shortly.';
  return "We couldn't prepare this file for upload. Please try another file.";
}

function getS3UserMessage(error: S3UploadError) {
  if (error.timedOut) return 'The upload is taking too long. Check your connection or try a smaller file.';
  if (error.status === 0) return "We couldn't connect to the media storage. Check your connection and try again.";
  if (error.status === 403 || error.status === 401) return 'The media upload was not authorized. Please try again. If it keeps happening, contact support.';
  if (error.status === 408 || error.status === 429 || error.status >= 500) return 'The media service is temporarily unavailable. Please try again.';
  return "We couldn't upload this file. Please try again or choose another file.";
}

function uploadToS3(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress?: (percentage: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    xhr.open('PUT', uploadUrl, true);
    xhr.withCredentials = false;
    xhr.timeout = S3_UPLOAD_TIMEOUT;
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        if (!settled) {
          settled = true;
          resolve();
        }
        return;
      }
      const retryable = xhr.status === 0 || xhr.status === 408 || xhr.status === 429 || xhr.status >= 500;
      fail(new S3UploadError(`S3 returned HTTP ${xhr.status}.`, xhr.status, retryable));
    };
    xhr.onerror = () => fail(new S3UploadError('Browser upload request failed.', xhr.status, true));
    xhr.ontimeout = () => fail(new S3UploadError('Upload request timed out.', xhr.status, true, true));
    xhr.onabort = () => fail(new S3UploadError('Upload was cancelled.', xhr.status, false));
    try {
      xhr.send(file);
    } catch {
      fail(new S3UploadError('Browser could not start the upload.', xhr.status, true));
    }
  });
}

/** Uploads one video part and returns the S3 ETag needed for multipart completion. */
function uploadVideoPart(
  uploadUrl: string,
  part: Blob,
  onProgress?: (loaded: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    xhr.open('PUT', uploadUrl, true);
    xhr.withCredentials = false;
    xhr.timeout = S3_UPLOAD_TIMEOUT;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('ETag');
        if (!etag) {
          fail(new S3UploadError('S3 did not expose the ETag response header. Check the bucket CORS configuration.', xhr.status, false));
          return;
        }
        if (!settled) {
          settled = true;
          resolve(etag);
        }
        return;
      }
      const retryable = xhr.status === 0 || xhr.status === 408 || xhr.status === 429 || xhr.status >= 500;
      fail(new S3UploadError(`S3 returned HTTP ${xhr.status} for a video part.`, xhr.status, retryable));
    };
    xhr.onerror = () => fail(new S3UploadError('Video part upload was interrupted.', xhr.status, true));
    xhr.ontimeout = () => fail(new S3UploadError('Video part upload timed out.', xhr.status, true, true));
    xhr.onabort = () => fail(new S3UploadError('Video part upload was cancelled.', xhr.status, false));
    try {
      xhr.send(part);
    } catch {
      fail(new S3UploadError('Browser could not start the video part upload.', xhr.status, true));
    }
  });
}

async function uploadVideoMultipart(
  file: File,
  contentType: string,
  onProgress?: (percentage: number) => void,
): Promise<UploadedMedia> {
  let key: string | undefined;
  let uploadId: string | undefined;
  let completed = false;

  try {
    const startResponse = await fetch('/media/multipart/start', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType, size: file.size }),
    });
    const start = await readResponse<MultipartStartResult & { message?: string }>(startResponse);
    if (!startResponse.ok || !start) {
      throw new MediaUploadError(start?.message || getUploadUrlErrorMessage(startResponse.status));
    }

    key = start.key;
    if (start.mode === 'single') {
      if (!start.uploadUrl || !start.key) throw new MediaUploadError("HavenSocial couldn't prepare this video.");
      for (let attempt = 1; attempt <= SINGLE_UPLOAD_MAX_ATTEMPTS; attempt += 1) {
        try {
          await uploadToS3(start.uploadUrl, file, contentType, onProgress);
          return { key: start.key };
        } catch (error) {
          const uploadError = error instanceof S3UploadError
            ? error
            : new S3UploadError('Unexpected upload failure.', 0, false);
          if (!uploadError.retryable || attempt === SINGLE_UPLOAD_MAX_ATTEMPTS) throw new MediaUploadError(getS3UserMessage(uploadError));
          await wait(1200 * attempt);
        }
      }
      throw new MediaUploadError("We couldn't upload this video. Please try again.");
    }

    if (start.mode !== 'multipart' || !start.key || !start.uploadId ||
      !Number.isSafeInteger(start.partSize) || start.partSize < 5 * 1024 * 1024) {
      throw new MediaUploadError("HavenSocial returned an invalid video upload configuration.");
    }
    uploadId = start.uploadId;

    const partCount = Math.ceil(file.size / start.partSize);
    if (partCount < 1 || partCount > 3) throw new MediaUploadError('This video cannot be split into supported upload parts.');

    const completedParts: Array<{ PartNumber: number; ETag: string }> = [];
    let completedBytes = 0;

    // Upload sequentially to avoid saturating slow mobile connections.
    for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
      const startOffset = (partNumber - 1) * start.partSize;
      const endOffset = Math.min(startOffset + start.partSize, file.size);
      const blob = file.slice(startOffset, endOffset);
      let partEtag: string | null = null;

      for (let attempt = 1; attempt <= VIDEO_PART_MAX_ATTEMPTS; attempt += 1) {
        try {
          setUploadProgressSafe(onProgress, Math.round((completedBytes / file.size) * 100));
          const urlResponse = await fetch('/media/multipart/part-url', {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: start.key, uploadId, partNumber }),
          });
          const urlResult = await readResponse<PartUrlResult>(urlResponse);
          if (!urlResponse.ok || !urlResult?.uploadUrl) {
            const retryable = urlResponse.status === 0 || urlResponse.status === 408 || urlResponse.status === 429 || urlResponse.status >= 500;
            if (retryable && attempt < VIDEO_PART_MAX_ATTEMPTS) {
              await wait(1000 * attempt);
              continue;
            }
            throw new MediaUploadError(urlResult?.message || getUploadUrlErrorMessage(urlResponse.status));
          }

          partEtag = await uploadVideoPart(urlResult.uploadUrl, blob, (loaded) => {
            const percentage = Math.round(((completedBytes + Math.min(loaded, blob.size)) / file.size) * 100);
            onProgress?.(percentage);
          });
          break;
        } catch (error) {
          if (error instanceof MediaUploadError) throw error;
          const uploadError = error instanceof S3UploadError
            ? error
            : new S3UploadError('Unexpected video part upload failure.', 0, error instanceof TypeError);
          console.warn('HavenSocial video part upload attempt failed:', {
            fileName: file.name,
            partNumber,
            attempt,
            status: uploadError.status,
            retryable: uploadError.retryable,
            timedOut: uploadError.timedOut,
          });
          if (!uploadError.retryable || attempt === VIDEO_PART_MAX_ATTEMPTS) {
            throw new MediaUploadError(getS3UserMessage(uploadError));
          }
          await wait(1200 * attempt);
        }
      }

      if (!partEtag) throw new MediaUploadError(`Video part ${partNumber} could not be uploaded.`);
      completedParts.push({ PartNumber: partNumber, ETag: partEtag });
      completedBytes += blob.size;
      onProgress?.(Math.round((completedBytes / file.size) * 100));
    }

    const completeResponse = await fetch('/media/multipart/complete', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: start.key, uploadId, parts: completedParts }),
    });
    const completeResult = await readResponse<{ ok?: boolean; key?: string; message?: string }>(completeResponse);
    if (!completeResponse.ok || !completeResult?.ok || completeResult.key !== start.key) {
      throw new MediaUploadError(completeResult?.message || "HavenSocial couldn't finish assembling your video. Please try again.");
    }

    completed = true;
    onProgress?.(100);
    return { key: start.key };
  } catch (error) {
    if (key && uploadId && !completed) {
      try {
        await fetch('/media/multipart/abort', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, uploadId }),
        });
      } catch {
        // S3 lifecycle cleanup will remove any incomplete multipart upload later.
      }
    }
    throw error;
  }
}

function setUploadProgressSafe(onProgress: ((percentage: number) => void) | undefined, percentage: number) {
  onProgress?.(percentage);
}

async function uploadImageOrGif(file: File, contentType: string, onProgress?: (percentage: number) => void): Promise<UploadedMedia> {
  let response: Response;
  try {
    response = await fetch('/media/upload-url', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'posts', contentType, size: file.size }),
    });
  } catch {
    throw new MediaUploadError("We couldn't connect to HavenSocial to prepare your upload.");
  }

  const result = await readResponse<UploadUrlResult>(response);
  if (!response.ok) throw new MediaUploadError(getUploadUrlErrorMessage(response.status));
  if (!result?.uploadUrl || !result.key) throw new MediaUploadError("HavenSocial couldn't prepare this file. Please try again.");

  for (let attempt = 1; attempt <= SINGLE_UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    try {
      onProgress?.(0);
      await uploadToS3(result.uploadUrl, file, contentType, onProgress);
      return { key: result.key };
    } catch (error) {
      const uploadError = error instanceof S3UploadError
        ? error
        : new S3UploadError('Unexpected S3 upload failure.', 0, false);
      console.warn('HavenSocial S3 image upload attempt failed:', {
        attempt,
        fileName: file.name,
        contentType,
        fileSize: file.size,
        status: uploadError.status,
        timedOut: uploadError.timedOut,
        retryable: uploadError.retryable,
      });
      if (uploadError.retryable && attempt < SINGLE_UPLOAD_MAX_ATTEMPTS) {
        await wait(1200 * attempt);
        continue;
      }
      throw new MediaUploadError(getS3UserMessage(uploadError));
    }
  }
  throw new MediaUploadError("We couldn't upload this file. Please try again.");
}

async function uploadFile(originalFile: File, onProgress?: (percentage: number) => void): Promise<UploadedMedia> {
  const { file, contentType } = await prepareMediaForUpload(originalFile);
  if (contentType.startsWith('video/')) {
    return uploadVideoMultipart(file, contentType, onProgress);
  }
  return uploadImageOrGif(file, contentType, onProgress);
}

export default function ComposePost({
  replyTo,
  avatarUrl,
}: {
  replyTo?: string;
  avatarUrl?: string;
}) {
  const router = useRouter();
  const submitting = useRef(false);
  const mediaInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const [scheduledLocal, setScheduledLocal] = useState('');
  const [repliesOpenLocal, setRepliesOpenLocal] = useState('');
  const [repliesCloseLocal, setRepliesCloseLocal] = useState('');
  const characterCount = Array.from(content).length;
  const textareaId = replyTo ? 'reply-content' : 'tweet-content';

  function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    const availableSlots = MAX_MEDIA_PER_POST - files.length;
    const accepted: File[] = [];
    const problems: string[] = [];

    for (const file of selected) {
      if (accepted.length >= availableSlots) {
        problems.push(`You can attach a maximum of ${MAX_MEDIA_PER_POST} files per post.`);
        break;
      }
      if (!getSupportedContentType(file)) {
        problems.push(`${file.name}: unsupported format.`);
        continue;
      }
      if (file.size < 1 || file.size > MAX_MEDIA_SIZE) {
        problems.push(`${file.name}: each attachment must be 15 MB or smaller.`);
        continue;
      }
      accepted.push(file);
    }

    if (accepted.length) setFiles((current) => [...current, ...accepted].slice(0, MAX_MEDIA_PER_POST));
    setError(problems.join(' '));
    setSuccess('');
    event.target.value = '';
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      setError(replyTo ? 'Write a reply before sending.' : 'Write something before posting.');
      setSuccess('');
      return;
    }
    if (characterCount > MAX_CONTENT_LENGTH) {
      setError('Post content cannot exceed 25,000 characters.');
      setSuccess('');
      return;
    }

    const now = new Date();
    const scheduledAt = scheduledLocal ? new Date(scheduledLocal) : null;
    const repliesOpenAt = repliesOpenLocal ? new Date(repliesOpenLocal) : null;
    const repliesCloseAt = repliesCloseLocal ? new Date(repliesCloseLocal) : null;

    if (scheduledLocal && (!scheduledAt || Number.isNaN(scheduledAt.getTime()) || scheduledAt <= now)) {
      setError('Choose a publication date and time in the future.');
      return;
    }
    if (replyTo && (repliesOpenLocal || repliesCloseLocal)) {
      setError('Reply availability can only be configured on a new post.');
      return;
    }

    const publicationTime = scheduledAt || now;
    if (repliesOpenAt && (Number.isNaN(repliesOpenAt.getTime()) || repliesOpenAt < publicationTime)) {
      setError('Replies cannot open before the post is published.');
      return;
    }
    if (repliesCloseAt) {
      const earliestClose = repliesOpenAt || publicationTime;
      if (Number.isNaN(repliesCloseAt.getTime()) || repliesCloseAt <= earliestClose) {
        setError('The reply closing time must be after publication and after the opening time.');
        return;
      }
    }

    submitting.current = true;
    setBusy(true);
    setError('');
    setSuccess('');
    setUploadProgress('');

    try {
      const uploadedMedia: UploadedMedia[] = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setUploadProgress(`Preparing ${index + 1} of ${files.length}: ${file.name}`);
        const uploaded = await uploadFile(file, (percentage) => {
          setUploadProgress(`Uploading ${index + 1} of ${files.length}: ${file.name} (${percentage}%)`);
        });
        uploadedMedia.push(uploaded);
      }

      setUploadProgress(scheduledAt ? 'Scheduling your post...' : 'Publishing your post...');
      const response = await fetch('/tweets', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: trimmedContent,
          isReplyTo: replyTo,
          scheduledAt: scheduledAt?.toISOString() ?? null,
          repliesOpenAt: repliesOpenAt?.toISOString() ?? null,
          repliesCloseAt: repliesCloseAt?.toISOString() ?? null,
          media: uploadedMedia.map(({ key }) => ({ key, altText: '' })),
        }),
      });
      const result = await readResponse<{ message?: string }>(response);
      if (!response.ok) {
        if (response.status === 401) throw new MediaUploadError('Your session has expired. Please sign in again.');
        throw new MediaUploadError(result?.message || "We couldn't publish your post. Please try again.");
      }

      setContent('');
      setFiles([]);
      setScheduledLocal('');
      setRepliesOpenLocal('');
      setRepliesCloseLocal('');
      setSuccess(replyTo
        ? 'Reply posted.'
        : scheduledAt
          ? 'Your post has been scheduled. Manage it from Scheduled posts.'
          : 'Post published.');
      setUploadProgress('');
      router.refresh();
    } catch (caught) {
      console.error('HavenSocial compose submission failed:', {
        errorName: caught instanceof Error ? caught.name : 'NonError',
        message: caught instanceof Error ? caught.message : 'Unknown error',
      });
      setError(caught instanceof Error ? caught.message : "We couldn't create your post. Please try again.");
      setUploadProgress('');
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
        ref={mediaInput}
        className="visually-hidden"
        type="file"
        accept={[...ACCEPTED_MEDIA_TYPES, ...ACCEPTED_MEDIA_EXTENSIONS].join(',')}
        multiple
        disabled={busy || files.length >= MAX_MEDIA_PER_POST}
        onChange={chooseFiles}
      />
      <button
        type="button"
        className="media-picker-button"
        onClick={() => mediaInput.current?.click()}
        disabled={busy || files.length >= MAX_MEDIA_PER_POST}
        aria-describedby={`${textareaId}-media-status`}
      >
        <ImagePlus aria-hidden="true" />
        <span>{files.length ? 'Add more media' : 'Choose images or videos'}</span>
      </button>
      <p id={`${textareaId}-media-status`} className="media-selection-status" aria-live="polite">
        {files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'No media selected'}
      </p>

      {files.length > 0 && (
        <ul className="compose-media-list">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.lastModified}-${index}`}>
              {file.name}
              <button
                type="button"
                disabled={busy}
                onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                aria-label={`Remove ${file.name}`}
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

      {!replyTo && (
        <fieldset className="post-scheduling-options">
          <legend>Post timing and reply availability</legend>
          <label htmlFor="post-scheduled-at">Publish at (leave empty to post now)</label>
          <input
            id="post-scheduled-at"
            type="datetime-local"
            value={scheduledLocal}
            disabled={busy}
            onChange={(event) => setScheduledLocal(event.target.value)}
          />
          <label htmlFor="replies-open-at">Open replies at (optional)</label>
          <input
            id="replies-open-at"
            type="datetime-local"
            value={repliesOpenLocal}
            disabled={busy}
            onChange={(event) => setRepliesOpenLocal(event.target.value)}
          />
          <label htmlFor="replies-close-at">Close replies at (optional)</label>
          <input
            id="replies-close-at"
            type="datetime-local"
            value={repliesCloseLocal}
            disabled={busy}
            onChange={(event) => setRepliesCloseLocal(event.target.value)}
          />
          <small>Leave both reply times empty to keep replies open immediately and indefinitely.</small>
        </fieldset>
      )}

      {uploadProgress && <p role="status" aria-live="polite">{uploadProgress}</p>}
      <button
        type="submit"
        className="btn-primary"
        disabled={busy || !content.trim() || characterCount > MAX_CONTENT_LENGTH}
      >
        {busy ? 'Uploading / Saving…' : replyTo ? 'Reply' : scheduledLocal ? 'Schedule post' : 'Post'}
      </button>
      {error && <p role="alert">{error}</p>}
      {success && <p role="status">{success}</p>}
    </form>
  );
}
