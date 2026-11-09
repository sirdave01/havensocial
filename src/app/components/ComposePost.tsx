'use client';

import { useRouter } from 'next/navigation';
import { ImagePlus } from 'lucide-react';
import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';

import IdentityAvatar from './IdentityAvatar';

const MAX_CONTENT_LENGTH = 25000;
const MAX_MEDIA_PER_POST = 4;
const MAX_MEDIA_SIZE = 15 * 1024 * 1024;
const S3_UPLOAD_TIMEOUT = 10 * 60 * 1000; // 10 minutes per attempt
const S3_UPLOAD_MAX_ATTEMPTS = 2;

const ACCEPTED_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
  'video/mp4',
  'video/webm',
  'video/quicktime',
];

const ACCEPTED_MEDIA_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.heic',
  '.heif',
  '.mp4',
  '.webm',
  '.mov',
];

type UploadedMedia = {
  key: string;
};

type UploadUrlResult = {
  uploadUrl?: string;
  key?: string;
  message?: string;
};

type PreparedMedia = {
  file: File;
  contentType: string;
};

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
    readonly responseSnippet?: string,
  ) {
    super(message);
    this.name = 'S3UploadError';
  }
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

function getFileExtension(file: File) {
  return file.name.split('.').pop()?.toLowerCase() || '';
}

function isHeicFile(file: File) {
  const extension = getFileExtension(file);
  const mime = file.type.toLowerCase().split(';')[0].trim();

  return (
    ['heic', 'heif'].includes(extension) ||
    /^image\/hei[cf](?:-sequence)?$/.test(mime)
  );
}

function getSupportedContentType(file: File): string | null {
  const extension = getFileExtension(file);
  const mime = file.type.toLowerCase().split(';')[0].trim();

  // HEIC/HEIF photographs are converted to JPEG before uploading.
  if (isHeicFile(file)) {
    return 'image/heic';
  }

  if (extension === 'mov' || mime === 'video/quicktime') {
    return 'video/quicktime';
  }

  if (ACCEPTED_MEDIA_TYPES.includes(mime)) {
    return mime;
  }

  // Some mobile browsers provide an empty or generic MIME type.
  if (!mime || mime === 'application/octet-stream') {
    return MIME_BY_EXTENSION[extension] || null;
  }

  return null;
}

async function prepareMediaForUpload(
  originalFile: File,
): Promise<PreparedMedia> {
  const originalType = getSupportedContentType(originalFile);

  if (!originalType) {
    throw new MediaUploadError(
      `${originalFile.name}: unsupported media format. Choose an image or video in a supported format.`,
    );
  }

  if (originalFile.size < 1 || originalFile.size > MAX_MEDIA_SIZE) {
    throw new MediaUploadError(
      `${originalFile.name}: each file must be 15 MB or smaller.`,
    );
  }

  if (isHeicFile(originalFile)) {
    try {
      const heicModule = await import('heic2any');
      const converted = await heicModule.default({
        blob: originalFile,
        toType: 'image/jpeg',
        quality: 0.88,
      });

      const jpegBlob = Array.isArray(converted)
        ? converted[0]
        : converted;

      if (!jpegBlob || jpegBlob.size === 0) {
        throw new Error('The converted image is empty.');
      }

      if (jpegBlob.size > MAX_MEDIA_SIZE) {
        throw new Error('The converted image is larger than 15 MB.');
      }

      const newFilename =
        originalFile.name.replace(/\.(heic|heif)$/i, '') + '.jpg';

      const jpegFile = new File([jpegBlob], newFilename, {
        type: 'image/jpeg',
        lastModified: originalFile.lastModified,
      });

      return {
        file: jpegFile,
        contentType: 'image/jpeg',
      };
    } catch (error) {
      console.error('HEIC/HEIF conversion failed:', {
        fileName: originalFile.name,
        errorName: error instanceof Error ? error.name : 'NonError',
      });

      throw new MediaUploadError(
        `We couldn't prepare ${originalFile.name}. Please try another photograph.`,
      );
    }
  }

  return {
    file: originalFile,
    contentType: originalType,
  };
}

async function readResponse<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function getUploadUrlErrorMessage(status: number) {
  if (status === 401) {
    return 'Your session has expired. Please sign in again.';
  }

  if (status === 413) {
    return 'This file is too large. Please choose a file of 15 MB or less.';
  }

  if (status === 503 || status >= 500) {
    return 'Media uploads are temporarily unavailable. Please try again shortly.';
  }

  return "We couldn't prepare this file for upload. Please try another file.";
}

function getS3UserMessage(error: S3UploadError) {
  if (error.timedOut) {
    return 'The upload is taking too long. Check your connection or try a smaller file.';
  }

  if (error.status === 0) {
    return "We couldn't connect to upload your media. Check your internet connection and try again.";
  }

  if (error.status === 403 || error.status === 401) {
    return 'The media upload was not authorized. Please try again. If it keeps happening, contact support.';
  }

  if (error.status === 408 || error.status === 429 || error.status >= 500) {
    return 'The media service is temporarily unavailable. Please try again.';
  }

  return "We couldn't upload this file. Please try again or choose another file.";
}

/**
 * Uploads directly to S3 using XMLHttpRequest so upload progress
 * remains available in the browser.
 */
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
      if (event.lengthComputable && onProgress) {
        const percentage = Math.round(
          (event.loaded / event.total) * 100,
        );
        onProgress(percentage);
      }
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

      const retryable =
        xhr.status === 408 ||
        xhr.status === 429 ||
        xhr.status >= 500;

      fail(
        new S3UploadError(
          `S3 returned HTTP ${xhr.status}.`,
          xhr.status,
          retryable,
          false,
          xhr.responseText?.slice(0, 250),
        ),
      );
    };

    xhr.onerror = () => {
      fail(
        new S3UploadError(
          'The browser could not complete the upload request.',
          xhr.status,
          true,
        ),
      );
    };

    xhr.ontimeout = () => {
      fail(
        new S3UploadError(
          'The upload request timed out.',
          xhr.status,
          true,
          true,
        ),
      );
    };

    xhr.onabort = () => {
      fail(
        new S3UploadError(
          'The upload was cancelled.',
          xhr.status,
          false,
        ),
      );
    };

    try {
      xhr.send(file);
    } catch {
      fail(
        new S3UploadError(
          'The browser could not start the upload.',
          xhr.status,
          true,
        ),
      );
    }
  });
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

  const characterCount = Array.from(content).length;
  const textareaId = replyTo ? 'reply-content' : 'tweet-content';

  function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    const availableSlots = MAX_MEDIA_PER_POST - files.length;
    const accepted: File[] = [];
    const problems: string[] = [];

    for (const file of selected) {
      if (accepted.length >= availableSlots) {
        problems.push(
          `You can attach a maximum of ${MAX_MEDIA_PER_POST} files per post.`,
        );
        break;
      }

      if (!getSupportedContentType(file)) {
        problems.push(
          `${file.name}: unsupported format. Use JPEG, PNG, GIF, WebP, HEIC, HEIF, MP4, WebM or MOV.`,
        );
        continue;
      }

      if (file.size < 1 || file.size > MAX_MEDIA_SIZE) {
        problems.push(
          `${file.name}: each attachment must be 15 MB or smaller.`,
        );
        continue;
      }

      accepted.push(file);
    }

    if (accepted.length) {
      setFiles((current) =>
        [...current, ...accepted].slice(0, MAX_MEDIA_PER_POST),
      );
    }

    setError(problems.join(' '));
    setSuccess('');
    event.target.value = '';
  }

  async function uploadFile(
    originalFile: File,
    onProgress?: (percentage: number) => void,
  ): Promise<UploadedMedia> {
    const { file, contentType } =
      await prepareMediaForUpload(originalFile);

    // Request a fresh presigned URL for this file.
    let response: Response;

    try {
      response = await fetch('/media/upload-url', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          kind: 'posts',
          contentType,
          size: file.size,
        }),
      });
    } catch {
      throw new MediaUploadError(
        "We couldn't connect to HavenSocial to prepare your upload. Check your connection and try again.",
      );
    }

    const result = await readResponse<UploadUrlResult>(response);

    if (!response.ok) {
      console.error('HavenSocial could not create an upload URL:', {
        status: response.status,
        fileName: file.name,
        contentType,
        fileSize: file.size,
      });

      throw new MediaUploadError(
        getUploadUrlErrorMessage(response.status),
      );
    }

    if (!result?.uploadUrl || !result.key) {
      throw new MediaUploadError(
        "HavenSocial couldn't prepare this file. Please try again.",
      );
    }

    // Retry only temporary network, timeout, throttling or server failures.
    for (
      let attempt = 1;
      attempt <= S3_UPLOAD_MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        onProgress?.(0);
        await uploadToS3(
          result.uploadUrl,
          file,
          contentType,
          onProgress,
        );

        return { key: result.key };
      } catch (error) {
        const uploadError =
          error instanceof S3UploadError
            ? error
            : new S3UploadError(
                'Unexpected S3 upload failure.',
                0,
                false,
              );

        console.warn('HavenSocial S3 upload attempt failed:', {
          attempt,
          maxAttempts: S3_UPLOAD_MAX_ATTEMPTS,
          fileName: file.name,
          contentType,
          fileSize: file.size,
          status: uploadError.status,
          timedOut: uploadError.timedOut,
          retryable: uploadError.retryable,
          responseSnippet: uploadError.responseSnippet,
        });

        const shouldRetry =
          uploadError.retryable &&
          attempt < S3_UPLOAD_MAX_ATTEMPTS;

        if (shouldRetry) {
          setUploadProgress(
            `Connection interrupted. Retrying ${file.name}...`,
          );
          await wait(1200 * attempt);
          continue;
        }

        throw new MediaUploadError(
          getS3UserMessage(uploadError),
        );
      }
    }

    throw new MediaUploadError(
      "We couldn't upload this file. Please try again.",
    );
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
    setUploadProgress('');

    try {
      const uploadedMedia: UploadedMedia[] = [];

      // Upload sequentially to reduce simultaneous network demand on mobile.
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];

        setUploadProgress(
          `Preparing ${index + 1} of ${files.length}: ${file.name}`,
        );

        const uploaded = await uploadFile(file, (percentage) => {
          setUploadProgress(
            `Uploading ${index + 1} of ${files.length}: ${file.name} (${percentage}%)`,
          );
        });

        uploadedMedia.push(uploaded);
      }

      // Publish only after every media upload has succeeded.
      setUploadProgress('Publishing your post...');

      let response: Response;

      try {
        response = await fetch('/tweets', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: trimmedContent,
            isReplyTo: replyTo,
            media: uploadedMedia.map(({ key }) => ({
              key,
              altText: '',
            })),
          }),
        });
      } catch {
        throw new MediaUploadError(
          'Your media uploaded, but we could not publish the post. Check your connection and try again.',
        );
      }

      const result = await readResponse<{ message?: string }>(response);

      if (!response.ok) {
        if (response.status === 401) {
          throw new MediaUploadError(
            'Your session has expired. Please sign in again.',
          );
        }

        if (response.status === 413) {
          throw new MediaUploadError(
            'Your post or its attachments are too large. Please reduce the size and try again.',
          );
        }

        console.error('HavenSocial post publishing failed:', {
          status: response.status,
          serverMessage: result?.message,
        });

        throw new MediaUploadError(
          "We couldn't publish your post. Please try again.",
        );
      }

      setContent('');
      setFiles([]);
      setSuccess(replyTo ? 'Reply posted.' : 'Post published.');
      setUploadProgress('');
      router.refresh();
    } catch (caught) {
      console.error('HavenSocial compose submission failed:', {
        errorName:
          caught instanceof Error ? caught.name : 'NonError',
        message:
          caught instanceof Error ? caught.message : 'Unknown error',
      });

      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn't create your post. Please try again.",
      );
      setUploadProgress('');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor={textareaId}>
        {replyTo ? 'Reply' : 'Share a post'}
      </label>

      <div className="compose-post-input">
        <IdentityAvatar
          src={avatarUrl}
          className="profile-avatar-small"
        />

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

      <label htmlFor={`${textareaId}-media`}>
        Attach images or videos
      </label>

      <input
        id={`${textareaId}-media`}
        ref={mediaInput}
        className="visually-hidden"
        type="file"
        accept={[
          ...ACCEPTED_MEDIA_TYPES,
          ...ACCEPTED_MEDIA_EXTENSIONS,
        ].join(',')}
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
        <span>
          {files.length ? 'Add more media' : 'Choose images or videos'}
        </span>
      </button>

      <p
        id={`${textareaId}-media-status`}
        className="media-selection-status"
        aria-live="polite"
      >
        {files.length
          ? `${files.length} file${files.length === 1 ? '' : 's'} selected`
          : 'No media selected'}
      </p>

      {files.length > 0 && (
        <ul className="compose-media-list">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.lastModified}-${index}`}>
              {file.name}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setFiles((current) =>
                    current.filter((_, fileIndex) => fileIndex !== index),
                  )
                }
                aria-label={`Remove ${file.name}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <p>
        {files.length} / {MAX_MEDIA_PER_POST} attachments
      </p>

      <p id="post-character-count" aria-live="polite">
        {characterCount.toLocaleString()} /{' '}
        {MAX_CONTENT_LENGTH.toLocaleString()}
      </p>

      {uploadProgress ? (
        <p role="status" aria-live="polite">
          {uploadProgress}
        </p>
      ) : null}

      <button
        type="submit"
        className="btn-primary"
        disabled={
          busy ||
          !content.trim() ||
          characterCount > MAX_CONTENT_LENGTH
        }
      >
        {busy
          ? 'Uploading / Posting…'
          : replyTo
            ? 'Reply'
            : 'Post'}
      </button>

      {error ? <p role="alert">{error}</p> : null}
      {success ? <p role="status">{success}</p> : null}
    </form>
  );
}
