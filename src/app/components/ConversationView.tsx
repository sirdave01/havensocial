'use client';

import Link from 'next/link';
import {
  FileText,
  Image as ImageIcon,
  Paperclip,
  Send,
  Video,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';

import IdentityAvatar from './IdentityAvatar';

type MessageMediaItem = {
  media_id: string;
  message_id: string;
  media_url: string;
  media_type: 'IMAGE' | 'VIDEO' | 'GIF' | 'FILE' | string;
  mime_type: string | null;
  file_size: string | number | null;
  file_name: string | null;
  created_at?: string | Date;
};

type MessageItem = {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  sender_sub: string;
  sender_name: string;
  sender_username: string | null;
  sender_picture: string | null;
  content: string | null;
  reply_to_message_id: string | null;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string | Date;
  updated_at: string | Date;
  media?: MessageMediaItem[];
};

type OtherParticipant = {
  other_sub: string;
  other_name: string;
  other_username: string | null;
  other_picture: string | null;
  can_send: boolean;
};

type PendingAttachment = {
  id: string;
  file: File;
  mimeType: string;
  previewUrl: string | null;
  progress: number;
  status: 'ready' | 'uploading' | 'uploaded' | 'error';
  uploadedKey?: string;
  error?: string;
};

type UploadUrlResponse = {
  uploadUrl?: string;
  key?: string;
  contentType?: string;
  mediaType?: string;
  message?: string;
};

type MessagePostResponse = {
  message?: MessageItem | string;
  messageText?: string;
};

const POLL_INTERVAL_MS = 5_000;
const MAX_MESSAGE_ATTACHMENTS = 4;
const MAX_MESSAGE_MEDIA_SIZE = 15 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const ACCEPTED_MIME_TYPES = new Set(Object.values(MIME_BY_EXTENSION));
const FILE_ACCEPT = [
  ...Object.keys(MIME_BY_EXTENSION).map((extension) => `.${extension}`),
  ...ACCEPTED_MIME_TYPES,
].join(',');

function compareMessageIds(a: string, b: string) {
  return a.length === b.length ? a.localeCompare(b) : a.length - b.length;
}

function formatMessageTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-NG', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatFileSize(value: string | number | null | undefined) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileMimeType(file: File) {
  const supplied = file.type.trim().toLowerCase().split(';')[0];
  if (ACCEPTED_MIME_TYPES.has(supplied)) return supplied;
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  return MIME_BY_EXTENSION[extension] || '';
}

function getUiId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
}

function uploadWithProgress(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress: (percentage: number) => void,
) {
  // Local-development uploads go through HavenSocial's authenticated route.
  if (uploadUrl.startsWith('/')) {
    return fetch(uploadUrl, {
      method: 'PUT',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': contentType },
      body: file,
    }).then(async (response) => {
      const payload = await readJson<{ message?: string }>(response);
      if (!response.ok) {
        throw new Error(payload?.message || 'The attachment could not be uploaded.');
      }
      onProgress(100);
    });
  }

  // S3 presigned PUT uploads use XHR so the UI can show real upload progress.
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.withCredentials = false;
    xhr.timeout = 120_000;
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Storage returned HTTP ${xhr.status} while uploading the attachment.`));
      }
    };
    xhr.onerror = () => reject(new Error('The attachment upload was interrupted. Check your connection and retry.'));
    xhr.ontimeout = () => reject(new Error('The attachment upload timed out. Please retry.'));
    xhr.onabort = () => reject(new Error('The attachment upload was cancelled.'));

    try {
      xhr.send(file);
    } catch {
      reject(new Error('Your browser could not start the attachment upload.'));
    }
  });
}

function MessageAttachment({ media }: { media: MessageMediaItem }) {
  const mediaType = String(media.media_type || 'FILE').toUpperCase();
  const fileName = media.file_name || 'Attachment';
  const mimeType = media.mime_type || undefined;
  const size = formatFileSize(media.file_size);

  if (mediaType === 'IMAGE' || mediaType === 'GIF') {
    return (
      <a
        href={media.media_url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open image ${fileName}`}
        style={{ display: 'block', maxWidth: '100%', marginTop: 8 }}
      >
        <img
          src={media.media_url}
          alt={fileName}
          loading="lazy"
          style={{
            display: 'block',
            maxWidth: '100%',
            maxHeight: 320,
            objectFit: 'contain',
            borderRadius: 10,
            background: 'rgba(0,0,0,.12)',
          }}
        />
        <span style={{ display: 'block', fontSize: 11, marginTop: 4, opacity: 0.8 }}>
          {fileName}{size ? ` · ${size}` : ''}
        </span>
      </a>
    );
  }

  if (mediaType === 'VIDEO') {
    return (
      <div style={{ marginTop: 8, maxWidth: '100%' }}>
        <video
          controls
          playsInline
          preload="metadata"
          style={{
            display: 'block',
            width: '100%',
            maxWidth: 420,
            maxHeight: 360,
            borderRadius: 10,
            background: '#000',
          }}
          aria-label={fileName}
        >
          <source src={media.media_url} type={mimeType} />
          Your browser does not support this video format.
        </video>
        <span style={{ display: 'block', fontSize: 11, marginTop: 4, opacity: 0.8 }}>
          {fileName}{size ? ` · ${size}` : ''}
        </span>
      </div>
    );
  }

  return (
    <a
      href={media.media_url}
      target="_blank"
      rel="noreferrer"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginTop: 8,
        padding: 10,
        borderRadius: 10,
        color: 'inherit',
        textDecoration: 'none',
        background: 'rgba(0,0,0,.12)',
        border: '1px solid rgba(255,255,255,.18)',
      }}
    >
      <FileText size={22} aria-hidden="true" />
      <span style={{ minWidth: 0, flex: 1 }}>
        <strong
          style={{ display: 'block', fontSize: 13, overflowWrap: 'anywhere' }}
        >
          {fileName}
        </strong>
        <small style={{ opacity: 0.78 }}>{size || 'Document'} · Download</small>
      </span>
    </a>
  );
}

export default function ConversationView({
  conversationId,
  viewerId,
  participant,
  initialMessages,
  initialHasMore,
}: {
  conversationId: string;
  viewerId: string;
  participant: OtherParticipant;
  initialMessages: MessageItem[];
  initialHasMore: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [content, setContent] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const isNearBottom = useRef(true);

  const markAsRead = useCallback(async (readThroughMessageId: string | null) => {
    try {
      const response = await fetch(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/read`,
        {
          method: 'PATCH',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ readThroughMessageId }),
        },
      );

      if (response.ok) {
        window.dispatchEvent(new Event('havensocial:messages-updated'));
        return true;
      }
    } catch {
      // The next visible poll or navigation will retry the read update.
    }

    return false;
  }, [conversationId]);

  const refreshMessages = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;

    try {
      const response = await fetch(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/messages`,
        { credentials: 'same-origin', cache: 'no-store' },
      );
      if (!response.ok) return;

      const payload = await response.json();
      if (!Array.isArray(payload.messages)) return;

      const incoming = payload.messages as MessageItem[];
      setMessages((current) => {
        const older = current.filter(
          (message) => !incoming.some((item) => item.message_id === message.message_id),
        );
        const merged = [...older, ...incoming];
        const unique = new Map<string, MessageItem>();
        for (const message of merged) unique.set(message.message_id, message);
        return [...unique.values()].sort(
          (a, b) => compareMessageIds(a.message_id, b.message_id),
        );
      });

      const latest = incoming[incoming.length - 1];
      await markAsRead(latest?.message_id ?? null);
    } catch {
      // Polling is best-effort; existing conversation content remains visible.
    }
  }, [conversationId, markAsRead]);

  useEffect(() => {
    const initialLatest = initialMessages[initialMessages.length - 1];
    void markAsRead(initialLatest?.message_id ?? null);

    const intervalId = window.setInterval(
      () => void refreshMessages(),
      POLL_INTERVAL_MS,
    );
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refreshMessages();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [initialMessages, markAsRead, refreshMessages]);

  useEffect(() => {
    if (isNearBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      for (const url of previewUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      previewUrlsRef.current.clear();
    };
  }, []);

  function updatePendingFile(id: string, update: Partial<PendingAttachment>) {
    setPendingFiles((current) => current.map((item) => (
      item.id === id ? { ...item, ...update } : item
    )));
  }

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selected.length) return;

    const availableSlots = MAX_MESSAGE_ATTACHMENTS - pendingFiles.length;
    if (availableSlots <= 0) {
      setError(`A message can contain at most ${MAX_MESSAGE_ATTACHMENTS} attachments.`);
      return;
    }

    const accepted: PendingAttachment[] = [];
    const problems: string[] = [];

    for (const file of selected) {
      if (accepted.length >= availableSlots) {
        problems.push(`Only ${MAX_MESSAGE_ATTACHMENTS} attachments can be added to one message.`);
        break;
      }

      const mimeType = getFileMimeType(file);
      if (!mimeType) {
        problems.push(`${file.name}: this file type is not supported.`);
        continue;
      }
      if (file.size < 1 || file.size > MAX_MESSAGE_MEDIA_SIZE) {
        problems.push(`${file.name}: each attachment must be between 1 byte and 15 MB.`);
        continue;
      }

      const previewUrl = mimeType.startsWith('image/')
        ? URL.createObjectURL(file)
        : null;
      if (previewUrl) previewUrlsRef.current.add(previewUrl);

      accepted.push({
        id: getUiId(),
        file,
        mimeType,
        previewUrl,
        progress: 0,
        status: 'ready',
      });
    }

    if (accepted.length) {
      setPendingFiles((current) => [...current, ...accepted]);
    }
    setError(problems.join(' '));
  }

  function removePendingFile(id: string) {
    const item = pendingFiles.find((file) => file.id === id);
    if (item?.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
      previewUrlsRef.current.delete(item.previewUrl);
    }
    setPendingFiles((current) => current.filter((file) => file.id !== id));
  }

  function clearPendingFiles() {
    for (const url of previewUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    previewUrlsRef.current.clear();
    setPendingFiles([]);
  }

  async function uploadPendingFile(item: PendingAttachment) {
    const response = await fetch('/media/upload-url', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'messages',
        conversationId,
        contentType: item.mimeType,
        size: item.file.size,
      }),
    });

    const payload = await readJson<UploadUrlResponse>(response);
    if (!response.ok || !payload?.uploadUrl || !payload.key) {
      throw new Error(payload?.message || 'HavenSocial could not prepare this attachment.');
    }

    await uploadWithProgress(
      payload.uploadUrl,
      item.file,
      item.mimeType,
      (progress) => updatePendingFile(item.id, { progress, status: 'uploading', error: undefined }),
    );

    updatePendingFile(item.id, {
      progress: 100,
      status: 'uploaded',
      uploadedKey: payload.key,
      error: undefined,
    });

    return payload.key;
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = content.trim();
    if ((!trimmed && pendingFiles.length === 0) || sending || !participant.can_send) return;

    setSending(true);
    setError('');

    try {
      const attachments: Array<{ key: string; fileName: string }> = [];

      // Upload sequentially to keep memory and concurrent S3 requests modest.
      // A successful key is retained in state so a failed send can be retried
      // without uploading already-completed files again.
      for (const item of pendingFiles) {
        let key = item.uploadedKey;
        if (!key) {
          updatePendingFile(item.id, { status: 'uploading', progress: 0, error: undefined });
          try {
            key = await uploadPendingFile(item);
          } catch (caught) {
            const message = caught instanceof Error
              ? caught.message
              : 'This attachment could not be uploaded.';
            updatePendingFile(item.id, { status: 'error', error: message });
            throw new Error(`${item.file.name}: ${message}`);
          }
        }
        attachments.push({ key, fileName: item.file.name });
      }

      const response = await fetch(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/messages`,
        {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: trimmed, attachments }),
        },
      );
      const payload = await readJson<MessagePostResponse>(response);
      if (
        !response.ok ||
        !payload?.message ||
        typeof payload.message !== 'object'
      ) {
        const serverMessage = typeof payload?.message === 'string'
          ? payload.message
          : payload?.messageText;
        throw new Error(serverMessage || 'Message could not be sent.');
      }

      const sentMessage = payload.message;
      setMessages((current) => (
        current.some((item) => item.message_id === sentMessage.message_id)
          ? current.map((item) => item.message_id === sentMessage.message_id ? sentMessage : item)
          : [...current, sentMessage]
      ));
      setContent('');
      clearPendingFiles();
      window.dispatchEvent(new Event('havensocial:messages-updated'));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Message could not be sent.',
      );
    } finally {
      setSending(false);
    }
  }

  async function loadOlder() {
    const oldest = messages[0]?.message_id;
    if (!oldest || loadingOlder) return;

    setLoadingOlder(true);
    try {
      const response = await fetch(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/messages?before=${encodeURIComponent(oldest)}`,
        { credentials: 'same-origin', cache: 'no-store' },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message || 'Older messages could not be loaded.');
      }

      const older = Array.isArray(payload.messages)
        ? payload.messages as MessageItem[]
        : [];
      setMessages((current) => {
        const known = new Set(current.map((message) => message.message_id));
        return [
          ...older.filter((message) => !known.has(message.message_id)),
          ...current,
        ];
      });
      setHasMore(Boolean(payload.hasMore));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Older messages could not be loaded.',
      );
    } finally {
      setLoadingOlder(false);
    }
  }

  const canSubmit = participant.can_send && !sending && (Boolean(content.trim()) || pendingFiles.length > 0);

  return (
    <section
      className="feed-item"
      style={{
        width: '100%',
        maxWidth: 820,
        margin: '0 auto',
        padding: 0,
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 16,
          borderBottom: '1px solid var(--border, #ddd)',
        }}
      >
        <Link
          href="/messages"
          aria-label="Back to messages"
          style={{ textDecoration: 'none', fontSize: 20 }}
        >
          ←
        </Link>
        <IdentityAvatar
          src={participant.other_picture ?? undefined}
          className="profile-avatar-small"
        />
        <span style={{ minWidth: 0 }}>
          <strong style={{ display: 'block' }}>{participant.other_name}</strong>
          {participant.other_username && (
            <small>@{participant.other_username}</small>
          )}
        </span>
      </header>

      {!participant.can_send && (
        <p
          role="status"
          style={{
            padding: '10px 16px',
            margin: 0,
            background: 'var(--notification-unread-background, rgba(37,99,235,.06))',
          }}
        >
          Messaging is unavailable because one of these accounts has blocked the other.
        </p>
      )}

      <div
        aria-label="Conversation messages"
        onScroll={(event) => {
          const element = event.currentTarget;
          isNearBottom.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 100;
        }}
        style={{
          minHeight: 300,
          maxHeight: '60vh',
          overflowY: 'auto',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {hasMore && (
          <button
            type="button"
            onClick={() => void loadOlder()}
            disabled={loadingOlder}
            style={{ alignSelf: 'center' }}
          >
            {loadingOlder ? 'Loading…' : 'Load older messages'}
          </button>
        )}

        {messages.length === 0 ? (
          <p
            style={{
              textAlign: 'center',
              color: 'var(--muted-foreground, #777)',
              margin: 'auto',
            }}
          >
            This is the beginning of your conversation.
          </p>
        ) : messages.map((message) => {
          const own = String(message.sender_id) === String(viewerId);
          const bubbleBackground = own ? '#1D4ED8' : '#164E63';
          const bubbleBorder = own ? '#1E40AF' : '#0E7490';
          const visibleMedia = message.is_deleted ? [] : (message.media || []);

          return (
            <div
              key={message.message_id}
              style={{
                display: 'flex',
                justifyContent: own ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  maxWidth: 'min(82%, 560px)',
                  padding: '10px 13px',
                  borderRadius: 16,
                  background: bubbleBackground,
                  color: '#FFFFFF',
                  border: `1px solid ${bubbleBorder}`,
                  overflowWrap: 'anywhere',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.16)',
                }}
              >
                {!own && (
                  <strong
                    style={{
                      display: 'block',
                      fontSize: 12,
                      marginBottom: 4,
                      color: '#FFFFFF',
                    }}
                  >
                    {message.sender_name}
                  </strong>
                )}

                {message.is_deleted ? (
                  <p style={{ margin: 0, color: '#FFFFFF', fontStyle: 'italic' }}>
                    This message was deleted.
                  </p>
                ) : (
                  <>
                    {message.content?.trim() ? (
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#FFFFFF' }}>
                        {message.content}
                      </p>
                    ) : null}

                    {visibleMedia.length > 0 && (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {visibleMedia.map((media) => (
                          <MessageAttachment key={media.media_id} media={media} />
                        ))}
                      </div>
                    )}
                  </>
                )}

                <small
                  style={{
                    display: 'block',
                    textAlign: 'right',
                    color: 'rgba(255,255,255,0.78)',
                    marginTop: 5,
                  }}
                >
                  {formatMessageTime(message.created_at)}
                  {message.is_edited ? ' · edited' : ''}
                </small>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={sendMessage}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: 12,
          borderTop: '1px solid var(--border, #ddd)',
        }}
      >
        {pendingFiles.length > 0 && (
          <div
            aria-label="Attachments selected for this message"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}
          >
            {pendingFiles.map((item) => (
              <div
                key={item.id}
                style={{
                  position: 'relative',
                  minWidth: 0,
                  padding: 8,
                  border: '1px solid var(--border, #334155)',
                  borderRadius: 10,
                  background: 'var(--surface-secondary, rgba(148,163,184,.08))',
                  color: 'var(--text, inherit)',
                }}
              >
                <button
                  type="button"
                  onClick={() => removePendingFile(item.id)}
                  disabled={sending}
                  aria-label={`Remove ${item.file.name}`}
                  title="Remove attachment"
                  style={{
                    position: 'absolute',
                    top: 5,
                    right: 5,
                    width: 26,
                    height: 26,
                    minHeight: 26,
                    padding: 0,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: 99,
                    background: 'rgba(15,23,42,.85)',
                    color: '#fff',
                    border: 0,
                    zIndex: 1,
                  }}
                >
                  <X size={14} aria-hidden="true" />
                </button>

                {item.previewUrl ? (
                  <img
                    src={item.previewUrl}
                    alt=""
                    style={{ width: '100%', height: 76, objectFit: 'cover', borderRadius: 6 }}
                  />
                ) : (
                  <div style={{ height: 76, display: 'grid', placeItems: 'center' }}>
                    {item.mimeType.startsWith('video/')
                      ? <Video size={28} aria-hidden="true" />
                      : item.mimeType.startsWith('image/')
                        ? <ImageIcon size={28} aria-hidden="true" />
                        : <FileText size={28} aria-hidden="true" />}
                  </div>
                )}

                <span
                  title={item.file.name}
                  style={{ display: 'block', fontSize: 12, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {item.file.name}
                </span>
                <small style={{ display: 'block', opacity: 0.72, fontSize: 11 }}>
                  {formatFileSize(item.file.size)}
                  {item.status === 'uploaded' ? ' · Ready' : ''}
                  {item.status === 'error' ? ' · Failed' : ''}
                </small>

                {(item.status === 'uploading' || item.status === 'uploaded') && (
                  <div style={{ marginTop: 5 }}>
                    <progress
                      value={item.progress}
                      max={100}
                      aria-label={`Upload progress for ${item.file.name}`}
                      style={{ width: '100%', height: 6 }}
                    />
                    <small style={{ fontSize: 10, opacity: 0.72 }}>{item.progress}%</small>
                  </div>
                )}
                {item.error && (
                  <small role="alert" style={{ display: 'block', color: '#FCA5A5', marginTop: 4 }}>
                    {item.error}
                  </small>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={participant.can_send ? 'Write a message…' : 'Messaging unavailable'}
            aria-label="Message"
            rows={2}
            maxLength={10000}
            disabled={!participant.can_send || sending}
            style={{
              flex: 1,
              resize: 'vertical',
              minWidth: 0,
              minHeight: 52,
              maxHeight: 180,
              padding: 12,
              borderRadius: 12,
              border: '1px solid var(--border, #334155)',
              background: 'var(--bg, #0a0f1c)',
              color: 'var(--text, #f1f5f9)',
              font: 'inherit',
            }}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={FILE_ACCEPT}
              multiple
              disabled={!participant.can_send || sending || pendingFiles.length >= MAX_MESSAGE_ATTACHMENTS}
              onChange={handleFileSelection}
              aria-label="Choose message attachments"
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!participant.can_send || sending || pendingFiles.length >= MAX_MESSAGE_ATTACHMENTS}
              aria-label="Attach files"
              title={`Attach files (up to ${MAX_MESSAGE_ATTACHMENTS}, 15 MB each)`}
              style={{
                width: 46,
                minWidth: 46,
                height: 46,
                minHeight: 46,
                padding: 0,
                display: 'grid',
                placeItems: 'center',
                borderRadius: 12,
                background: 'var(--surface-secondary, #1e293b)',
                color: 'var(--text, #f1f5f9)',
                border: '1px solid var(--border, #334155)',
                boxShadow: 'none',
                opacity: !participant.can_send || sending || pendingFiles.length >= MAX_MESSAGE_ATTACHMENTS ? 0.55 : 1,
                cursor: !participant.can_send || sending || pendingFiles.length >= MAX_MESSAGE_ATTACHMENTS ? 'not-allowed' : 'pointer',
              }}
            >
              <Paperclip aria-hidden="true" size={19} />
            </button>

            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                minWidth: 88,
                minHeight: 46,
                padding: '0 14px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                borderRadius: 12,
                background: '#2563EB',
                color: '#FFFFFF',
                border: '1px solid #1D4ED8',
                boxShadow: 'none',
                fontWeight: 700,
                cursor: !canSubmit ? 'not-allowed' : 'pointer',
                opacity: !canSubmit ? 0.65 : 1,
              }}
            >
              <Send aria-hidden="true" size={17} />
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>

        <small style={{ color: 'var(--text-muted, #94a3b8)', fontSize: 11 }}>
          Up to {MAX_MESSAGE_ATTACHMENTS} files per message · 15 MB maximum per file. Images, videos, GIFs, PDF, text, Word, Excel and PowerPoint files are supported.
        </small>
      </form>

      {error && (
        <p role="alert" style={{ padding: '0 12px 12px', margin: 0 }}>
          {error}
        </p>
      )}
    </section>
  );
}
