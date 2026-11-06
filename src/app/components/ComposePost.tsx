
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

  // HEIC/HEIF files will be converted to JPEG before uploading.
  if (isHeicFile(file)) {
    return 'image/heic';
  }

  // Preserve MOV as QuickTime rather than mislabelling it as MP4.
  if (extension === 'mov' || mime === 'video/quicktime') {
    return 'video/quicktime';
  }

  if (ACCEPTED_MEDIA_TYPES.includes(mime)) {
    return mime;
  }

  // Some mobile browsers return an empty or generic MIME type.
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
    throw new Error(
      `${originalFile.name}: unsupported media format.`,
    );
  }

  if (
    originalFile.size < 1 ||
    originalFile.size > MAX_MEDIA_SIZE
  ) {
    throw new Error(
      `${originalFile.name}: media must be between 1 byte and 15 MB.`,
    );
  }

  // Convert iPhone HEIC/HEIF photographs to JPEG.
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
        throw new Error(
          'The converted JPEG exceeds the 15 MB upload limit.',
        );
      }

      const newFilename =
        originalFile.name.replace(/\.(heic|heif)$/i, '') +
        '.jpg';

      const jpegFile = new File(
        [jpegBlob],
        newFilename,
        {
          type: 'image/jpeg',
          lastModified: originalFile.lastModified,
        },
      );

      return {
        file: jpegFile,
        contentType: 'image/jpeg',
      };
    } catch {
      throw new Error(
        `Could not convert ${originalFile.name} into JPEG. Please try another photograph.`,
      );
    }
  }

  return {
    file: originalFile,
    contentType: originalType,
  };
}

async function readResponse<T>(
  response: Response,
): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
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

      if (
        file.size < 1 ||
        file.size > MAX_MEDIA_SIZE
      ) {
        problems.push(
          `${file.name}: each attachment must be between 1 byte and 15 MB.`,
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
  ): Promise<UploadedMedia> {
    // Prepare the file before requesting an upload URL.
    const {
      file,
      contentType,
    } = await prepareMediaForUpload(originalFile);

    // STEP 1: Request an upload URL from HavenSocial.
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
      throw new Error(
        `Could not connect to HavenSocial while preparing ${file.name}. Check your internet connection.`,
      );
    }

    const result = await readResponse<UploadUrlResult>(
      response,
    );

    if (!response.ok) {
      throw new Error(
        result?.message ||
          `Could not prepare ${file.name} for upload (HTTP ${response.status}).`,
      );
    }

    if (!result?.uploadUrl || !result?.key) {
      throw new Error(
        `HavenSocial returned an incomplete upload response for ${file.name}.`,
      );
    }

    // STEP 2: Upload directly to Amazon S3.
    let uploadResponse: Response;

    try {
      uploadResponse = await fetch(result.uploadUrl, {
        method: 'PUT',
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Content-Type': contentType,
        },
        body: file,
      });
    } catch {
      throw new Error(
        `Could not transfer ${file.name} to AWS S3. Check your internet connection and try again.`,
      );
    }

    if (!uploadResponse.ok) {
      throw new Error(
        `AWS S3 rejected ${file.name} (HTTP ${uploadResponse.status}). Check the upload permissions and request configuration.`,
      );
    }

    return {
      key: result.key,
    };
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
      setError(
        'Post content cannot exceed 25,000 characters.',
      );
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

      // Upload one file at a time to improve reliability
      // on mobile connections.
      for (let index = 0; index < files.length; index++) {
        const file = files[index];

        setUploadProgress(
          `Uploading ${index + 1} of ${files.length}: ${file.name}`,
        );

        uploadedMedia.push(await uploadFile(file));
      }

      // STEP 3: Publish the post after every upload succeeds.
      setUploadProgress('Publishing your post...');

      let response: Response;

      try {
        response = await fetch('/tweets', {
          method: 'POST',
          credentials: 'same-origin',
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
        throw new Error(
          'Your media was uploaded, but HavenSocial could not connect to publish the post. Check your connection before retrying.',
        );
      }

      const result = await readResponse<{ message?: string }>(
        response,
      );

      if (!response.ok) {
        throw new Error(
          result?.message || 'Could not create the post.',
        );
      }

      setContent('');
      setFiles([]);
      setSuccess(
        replyTo ? 'Reply posted.' : 'Post published.',
      );
      setUploadProgress('');

      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not create the post.',
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
        disabled={
          busy || files.length >= MAX_MEDIA_PER_POST
        }
        onChange={chooseFiles}
      />

      <button
        type="button"
        className="media-picker-button"
        onClick={() => mediaInput.current?.click()}
        disabled={
          busy || files.length >= MAX_MEDIA_PER_POST
        }
        aria-describedby={`${textareaId}-media-status`}
      >
        <ImagePlus aria-hidden="true" />

        <span>
          {files.length
            ? 'Add more media'
            : 'Choose images or videos'}
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
            <li
              key={`${file.name}-${file.lastModified}-${index}`}
            >
              {file.name}

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setFiles((current) =>
                    current.filter(
                      (_, fileIndex) => fileIndex !== index,
                    ),
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

      <p
        id="post-character-count"
        aria-live="polite"
      >
        {characterCount.toLocaleString()} /{' '}
        {MAX_CONTENT_LENGTH.toLocaleString()}
      </p>

      {uploadProgress && (
        <p role="status" aria-live="polite">
          {uploadProgress}
        </p>
      )}

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

            {error ? (
        <p role="alert">{error}</p>
      ) : null}

      {success ? (
        <p role="status">{success}</p>
      ) : null}
    </form>
  );
}
