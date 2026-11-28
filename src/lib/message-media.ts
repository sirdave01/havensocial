import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { fromWebToken } from '@aws-sdk/credential-providers';
import { getVercelOidcToken } from '@vercel/oidc';

export type MessageMediaType = 'IMAGE' | 'VIDEO' | 'GIF' | 'FILE';

type AllowedMessageType = {
  extension: string;
  mediaType: MessageMediaType;
};

const ALLOWED_MESSAGE_TYPES: Record<string, AllowedMessageType> = {
  'image/jpeg': { extension: 'jpg', mediaType: 'IMAGE' },
  'image/png': { extension: 'png', mediaType: 'IMAGE' },
  'image/gif': { extension: 'gif', mediaType: 'GIF' },
  'image/webp': { extension: 'webp', mediaType: 'IMAGE' },
  'video/mp4': { extension: 'mp4', mediaType: 'VIDEO' },
  'video/webm': { extension: 'webm', mediaType: 'VIDEO' },
  'video/quicktime': { extension: 'mov', mediaType: 'VIDEO' },
  'application/pdf': { extension: 'pdf', mediaType: 'FILE' },
  'text/plain': { extension: 'txt', mediaType: 'FILE' },
  'text/csv': { extension: 'csv', mediaType: 'FILE' },
  'application/msword': { extension: 'doc', mediaType: 'FILE' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    extension: 'docx', mediaType: 'FILE',
  },
  'application/vnd.ms-excel': { extension: 'xls', mediaType: 'FILE' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    extension: 'xlsx', mediaType: 'FILE',
  },
  'application/vnd.ms-powerpoint': { extension: 'ppt', mediaType: 'FILE' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    extension: 'pptx', mediaType: 'FILE',
  },
};

export const MAX_MESSAGE_MEDIA_SIZE = 15 * 1024 * 1024;
const UPLOAD_URL_TTL_SECONDS = 30 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 90;
const LOCAL_MESSAGE_PREFIX = 'local/messages/';
const LOCAL_MESSAGE_DIRECTORY = join(process.cwd(), '.private-uploads', 'messages');
const MAX_BIGINT = '9223372036854775807';

export class MessageMediaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MessageMediaValidationError';
  }
}

export class MessageMediaStorageConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MessageMediaStorageConfigurationError';
  }
}

export type MessageMediaKeyDetails = {
  storage: 'local' | 's3';
  conversationId: string;
  ownerId: string;
  id: string;
  extension: string;
  contentType: string;
  mediaType: MessageMediaType;
};

let s3Client: S3Client | undefined;

function normalizeId(value: string | number) {
  const text = String(value);
  if (!/^[1-9]\d{0,18}$/.test(text)) return null;
  if (text.length === 19 && text > MAX_BIGINT) return null;
  return text;
}

function getStorageConfig() {
  const bucket = process.env.S3_BUCKET_NAME?.trim();
  const region = process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1';
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const roleArn = process.env.AWS_ROLE_ARN?.trim();

  if (!bucket) throw new MessageMediaStorageConfigurationError('S3_BUCKET_NAME must be configured.');
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new MessageMediaStorageConfigurationError('Both S3 access key and secret key must be configured together.');
  }
  if (process.env.VERCEL === '1' && !roleArn) {
    throw new MessageMediaStorageConfigurationError('AWS_ROLE_ARN must be configured for Vercel OIDC authentication.');
  }

  return {
    bucket,
    region,
    endpoint,
    roleArn,
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
  };
}

async function getVercelAwsCredentials(roleArn: string) {
  try {
    const webIdentityToken = await getVercelOidcToken();
    const provider = fromWebToken({
      roleArn,
      webIdentityToken,
      roleSessionName: 'havensocial-private-message-media',
    });
    return await provider();
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown authentication error';
    throw new MessageMediaStorageConfigurationError(
      `Vercel OIDC could not obtain AWS credentials: ${details}`,
    );
  }
}

function getS3Client() {
  if (!s3Client) {
    const config = getStorageConfig();
    const common = {
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: Boolean(config.endpoint),
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
    };

    if (process.env.VERCEL === '1') {
      s3Client = new S3Client({
        ...common,
        credentials: async () => getVercelAwsCredentials(config.roleArn!),
      });
    } else {
      s3Client = new S3Client({
        ...common,
        ...(config.credentials ? { credentials: config.credentials } : {}),
      });
    }
  }

  return s3Client;
}

function validateContentType(contentType: string, size: number) {
  const normalized = contentType.trim().toLowerCase().split(';')[0];
  const definition = ALLOWED_MESSAGE_TYPES[normalized];
  if (!definition) throw new MessageMediaValidationError('This file type is not supported in messages.');
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_MESSAGE_MEDIA_SIZE) {
    throw new MessageMediaValidationError('Each attachment must be between 1 byte and 15 MB.');
  }
  return { contentType: normalized, ...definition };
}

/** Parse and validate a private-message storage key without trusting client path segments. */
export function getMessageMediaKeyDetails(key: string): MessageMediaKeyDetails {
  if (typeof key !== 'string' || key.length > 500) {
    throw new MessageMediaValidationError('Invalid message attachment key.');
  }

  const match = /^(local\/)?messages\/([^/]+)\/([^/]+)\/([0-9a-f-]{36})\.([a-z0-9]+)$/i.exec(key);
  if (!match) throw new MessageMediaValidationError('Invalid message attachment key.');

  const [, localPrefix, conversationId, ownerId, id, rawExtension] = match;
  if (!normalizeId(conversationId) || !normalizeId(ownerId)) {
    throw new MessageMediaValidationError('Invalid message attachment owner.');
  }

  const extension = rawExtension.toLowerCase();
  const entry = Object.entries(ALLOWED_MESSAGE_TYPES).find(
    ([, definition]) => definition.extension === extension,
  );
  if (!entry) throw new MessageMediaValidationError('Unsupported message attachment type.');

  return {
    storage: localPrefix ? 'local' : 's3',
    conversationId,
    ownerId,
    id,
    extension,
    contentType: entry[0],
    mediaType: entry[1].mediaType,
  };
}

function getLocalMessageFilePath(details: MessageMediaKeyDetails) {
  return join(
    LOCAL_MESSAGE_DIRECTORY,
    details.conversationId,
    details.ownerId,
    `${details.id}.${details.extension}`,
  );
}

function hasExpectedSignature(bytes: Uint8Array, contentType: string) {
  const startsWith = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.slice(start, start + length));

  switch (contentType) {
    case 'image/jpeg': return startsWith(0xff, 0xd8, 0xff);
    case 'image/png': return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'image/gif': return ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a';
    case 'image/webp': return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP';
    case 'video/mp4':
    case 'video/quicktime': return ascii(4, 4) === 'ftyp';
    case 'video/webm': return startsWith(0x1a, 0x45, 0xdf, 0xa3);
    case 'application/pdf': return ascii(0, 5) === '%PDF-';
    case 'application/msword':
    case 'application/vnd.ms-excel':
    case 'application/vnd.ms-powerpoint':
      return startsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return startsWith(0x50, 0x4b, 0x03, 0x04);
    case 'text/plain':
    case 'text/csv':
      return !bytes.some((byte) => byte === 0);
    default: return false;
  }
}

function isMissingCredentials(error: unknown) {
  return error instanceof Error && error.name === 'CredentialsProviderError';
}

function createLocalMessageUpload(
  conversationId: string,
  ownerId: string,
  contentType: string,
  size: number,
) {
  const definition = validateContentType(contentType, size);
  const key = `${LOCAL_MESSAGE_PREFIX}${conversationId}/${ownerId}/${randomUUID()}.${definition.extension}`;
  return {
    uploadUrl: `/api/messages/media/upload-local?key=${encodeURIComponent(key)}`,
    key,
    contentType: definition.contentType,
    mediaType: definition.mediaType,
    maxSize: MAX_MESSAGE_MEDIA_SIZE,
  };
}

/** Creates a presigned upload URL under the private messages/ S3 prefix. */
export async function createMessageMediaUpload(
  conversationId: string | number,
  ownerId: string | number,
  contentType: string,
  size: number,
) {
  const safeConversationId = normalizeId(conversationId);
  const safeOwnerId = normalizeId(ownerId);
  if (!safeConversationId || !safeOwnerId) {
    throw new MessageMediaValidationError('Invalid conversation or account identifier.');
  }

  const definition = validateContentType(contentType, size);

  try {
    const config = getStorageConfig();
    const key = `messages/${safeConversationId}/${safeOwnerId}/${randomUUID()}.${definition.extension}`;
    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: definition.contentType,
    });
    const uploadUrl = await getSignedUrl(getS3Client(), command, {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
    });

    return {
      uploadUrl,
      key,
      contentType: definition.contentType,
      mediaType: definition.mediaType,
      maxSize: MAX_MESSAGE_MEDIA_SIZE,
    };
  } catch (error) {
    if (
      process.env.NODE_ENV !== 'production' &&
      (error instanceof MessageMediaStorageConfigurationError || isMissingCredentials(error))
    ) {
      return createLocalMessageUpload(safeConversationId, safeOwnerId, definition.contentType, size);
    }

    if (isMissingCredentials(error)) {
      throw new MessageMediaStorageConfigurationError(
        'The AWS SDK could not find server-side credentials for private message uploads.',
      );
    }
    throw error;
  }
}

/** Local-only upload storage. Files are kept outside /public and are never directly web-served. */
export async function saveLocalMessageMedia(
  key: string,
  conversationId: string | number,
  ownerId: string | number,
  contentType: string,
  bytes: Uint8Array,
) {
  const details = getMessageMediaKeyDetails(key);
  if (
    details.storage !== 'local' ||
    details.conversationId !== String(conversationId) ||
    details.ownerId !== String(ownerId)
  ) {
    throw new MessageMediaValidationError('This upload does not belong to your account or conversation.');
  }

  const definition = validateContentType(contentType, bytes.byteLength);
  if (
    details.contentType !== definition.contentType ||
    !hasExpectedSignature(bytes, definition.contentType)
  ) {
    throw new MessageMediaValidationError('The uploaded file content does not match its declared type.');
  }

  const path = getLocalMessageFilePath(details);
  await mkdir(join(LOCAL_MESSAGE_DIRECTORY, details.conversationId, details.ownerId), {
    recursive: true,
  });
  await writeFile(path, bytes, { flag: 'wx' });
  return { key, fileSize: bytes.byteLength };
}

/** Re-checks ownership, actual size, MIME type and file signature before a message is saved. */
export async function confirmUploadedMessageMedia(
  key: string,
  conversationId: string | number,
  ownerId: string | number,
) {
  const details = getMessageMediaKeyDetails(key);
  if (
    details.conversationId !== String(conversationId) ||
    details.ownerId !== String(ownerId)
  ) {
    throw new MessageMediaValidationError('This attachment does not belong to your account or conversation.');
  }

  if (details.storage === 'local') {
    let bytes: Buffer;
    try {
      bytes = await readFile(getLocalMessageFilePath(details));
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        throw new MessageMediaValidationError('The uploaded attachment could not be found.');
      }
      throw error;
    }

    if (
      bytes.byteLength < 1 ||
      bytes.byteLength > MAX_MESSAGE_MEDIA_SIZE ||
      !hasExpectedSignature(bytes, details.contentType)
    ) {
      throw new MessageMediaValidationError('The uploaded attachment is invalid or exceeds 15 MB.');
    }

    return {
      key,
      mediaType: details.mediaType,
      mimeType: details.contentType,
      fileSize: bytes.byteLength,
    };
  }

  const config = getStorageConfig();
  let head;
  try {
    head = await getS3Client().send(new HeadObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }));
  } catch (error) {
    if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) {
      throw new MessageMediaValidationError('The uploaded attachment could not be found.');
    }
    throw error;
  }

  if (
    head.ContentLength === undefined ||
    head.ContentLength < 1 ||
    head.ContentLength > MAX_MESSAGE_MEDIA_SIZE ||
    head.ContentType !== details.contentType
  ) {
    throw new MessageMediaValidationError('The uploaded attachment is invalid or exceeds 15 MB.');
  }

  const object = await getS3Client().send(new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Range: 'bytes=0-63',
  }));
  const signature = await object.Body?.transformToByteArray();
  if (!signature || !hasExpectedSignature(signature, details.contentType)) {
    throw new MessageMediaValidationError('The uploaded file content does not match its declared type.');
  }

  return {
    key,
    mediaType: details.mediaType,
    mimeType: details.contentType,
    fileSize: head.ContentLength,
  };
}

/** Returns a short-lived S3 read URL. Call only after the database confirms conversation membership. */
export async function createMessageMediaReadUrl(
  key: string,
  fileName: string,
  mimeType: string,
  mediaType: MessageMediaType,
) {
  const details = getMessageMediaKeyDetails(key);
  if (details.storage !== 's3') {
    throw new MessageMediaValidationError('This attachment is stored locally.');
  }

  const config = getStorageConfig();
  const safeName = fileName.replace(/[\r\n"\\/]/g, '_').slice(0, 180) || 'attachment';
  const disposition = mediaType === 'FILE' ? 'attachment' : 'inline';
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ResponseContentType: mimeType,
    ResponseContentDisposition: `${disposition}; filename*=UTF-8''${encodeURIComponent(safeName)}`,
  });

  return getSignedUrl(getS3Client(), command, {
    expiresIn: DOWNLOAD_URL_TTL_SECONDS,
  });
}

/** Reads a local private attachment after the caller has verified database membership. */
export async function readLocalMessageMedia(key: string, conversationId: string | number) {
  const details = getMessageMediaKeyDetails(key);
  if (details.storage !== 'local' || details.conversationId !== String(conversationId)) {
    throw new MessageMediaValidationError('Invalid private attachment location.');
  }
  return readFile(getLocalMessageFilePath(details));
}
