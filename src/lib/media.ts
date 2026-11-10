import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  UploadPartCommand,
  type CompletedPart,
  type HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { fromWebToken } from '@aws-sdk/credential-providers';
import { getVercelOidcToken } from '@vercel/oidc';

export type PostMediaType = 'IMAGE' | 'VIDEO' | 'GIF';

const allowedTypes: Record<string, { extension: string; mediaType: PostMediaType; folder: string }> = {
  'image/jpeg': { extension: 'jpg', mediaType: 'IMAGE', folder: 'images' },
  'image/png': { extension: 'png', mediaType: 'IMAGE', folder: 'images' },
  'image/gif': { extension: 'gif', mediaType: 'GIF', folder: 'gifs' },
  'image/webp': { extension: 'webp', mediaType: 'IMAGE', folder: 'images' },
  'video/mp4': { extension: 'mp4', mediaType: 'VIDEO', folder: 'videos' },
  'video/webm': { extension: 'webm', mediaType: 'VIDEO', folder: 'videos' },
  'video/quicktime': { extension: 'mov', mediaType: 'VIDEO', folder: 'videos' },
};

export const MAX_POST_MEDIA_SIZE = 15 * 1024 * 1024;
export const MULTIPART_PART_SIZE = 5 * 1024 * 1024;
const PRESIGNED_UPLOAD_URL_TTL_SECONDS = 30 * 60;
const PRESIGNED_PART_URL_TTL_SECONDS = 60 * 60;
const LOCAL_MEDIA_PREFIX = 'local/posts/';
const LOCAL_MEDIA_DIRECTORY = join(process.cwd(), 'public', 'uploads', 'tweets');

export class MediaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaValidationError';
  }
}

export class MediaStorageConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaStorageConfigurationError';
  }
}

let client: S3Client | undefined;

function getStorageConfig() {
  const bucket = process.env.S3_BUCKET_NAME?.trim();
  const region = process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1';
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const configuredPublicBaseUrl = process.env.S3_PUBLIC_BASE_URL?.replace(/\/+$/, '');
  const publicBaseUrl = configuredPublicBaseUrl || (endpoint
    ? undefined
    : `https://${bucket}.s3.${region}.amazonaws.com`);
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const roleArn = process.env.AWS_ROLE_ARN?.trim();

  if (!bucket) throw new MediaStorageConfigurationError('S3_BUCKET_NAME must be configured');
  if (!publicBaseUrl) {
    throw new MediaStorageConfigurationError('S3_PUBLIC_BASE_URL must be configured when using a custom S3 endpoint');
  }
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new MediaStorageConfigurationError('Both S3/AWS access key and secret access key must be configured together');
  }
  if (process.env.VERCEL === '1' && !roleArn) {
    throw new MediaStorageConfigurationError('AWS_ROLE_ARN must be configured for Vercel OIDC authentication');
  }

  return {
    bucket,
    region,
    endpoint,
    publicBaseUrl,
    roleArn,
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
  };
}

async function getVercelAwsCredentials(roleArn: string) {
  try {
    const webIdentityToken = await getVercelOidcToken();
    const credentialsProvider = fromWebToken({
      roleArn,
      webIdentityToken,
      roleSessionName: 'havensocial-media',
    });
    return await credentialsProvider();
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown authentication error';
    throw new MediaStorageConfigurationError(`Vercel OIDC could not obtain AWS credentials: ${details}`);
  }
}

function getClient() {
  if (!client) {
    const config = getStorageConfig();
    const commonConfig = {
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: Boolean(config.endpoint),
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
    };

    if (process.env.VERCEL === '1') {
      if (!config.roleArn) throw new MediaStorageConfigurationError('AWS_ROLE_ARN is required for Vercel deployments');
      client = new S3Client({
        ...commonConfig,
        credentials: async () => getVercelAwsCredentials(config.roleArn!),
      });
    } else {
      client = new S3Client({
        ...commonConfig,
        ...(config.credentials ? { credentials: config.credentials } : {}),
      });
    }
  }
  return client;
}

function validateUpload(contentType: string, size: number) {
  const normalizedType = contentType.trim().toLowerCase();
  const media = allowedTypes[normalizedType];
  if (!media) throw new MediaValidationError('Unsupported media type');
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_POST_MEDIA_SIZE) {
    throw new MediaValidationError(`Media must be between 1 byte and ${MAX_POST_MEDIA_SIZE} bytes`);
  }
  return { ...media, contentType: normalizedType };
}

function getLocalMediaDetails(key: string, ownerId: string | number) {
  const match = /^local\/posts\/(images|videos|gifs)\/([^/]+)\/([0-9a-f-]{36})\.([a-z0-9]+)$/i.exec(key);
  if (!match || match[2] !== String(ownerId)) throw new MediaValidationError('Invalid media key');
  const [, folder, , id, extension] = match;
  const mediaEntry = Object.entries(allowedTypes).find(([, media]) =>
    media.folder === folder && media.extension === extension.toLowerCase(),
  );
  if (!mediaEntry) throw new MediaValidationError('Unsupported media type');
  return { id, extension: extension.toLowerCase(), mediaEntry };
}

function getOwnedVideoKey(key: string, ownerId: string | number) {
  const match = /^posts\/videos\/([^/]+)\/([0-9a-f-]{36})\.(mp4|webm|mov)$/i.exec(key);
  if (!match || match[1] !== String(ownerId)) throw new MediaValidationError('Invalid video upload key');
  const extension = match[3].toLowerCase();
  const mediaEntry = Object.entries(allowedTypes).find(([, media]) =>
    media.folder === 'videos' && media.extension === extension,
  );
  if (!mediaEntry) throw new MediaValidationError('Unsupported video type');
  return { extension, mediaEntry };
}

function validateUploadId(uploadId: string) {
  if (typeof uploadId !== 'string' || uploadId.trim().length < 8 || uploadId.length > 2048) {
    throw new MediaValidationError('Invalid multipart upload identifier');
  }
  return uploadId;
}

function isMissingCredentials(error: unknown) {
  return error instanceof Error && error.name === 'CredentialsProviderError';
}

function createLocalMediaUpload(ownerId: string | number, contentType: string, size: number) {
  const media = validateUpload(contentType, size);
  const key = `${LOCAL_MEDIA_PREFIX}${media.folder}/${ownerId}/${randomUUID()}.${media.extension}`;
  return {
    uploadUrl: `/media/upload?key=${encodeURIComponent(key)}`,
    key,
    publicUrl: '',
    contentType: media.contentType,
    mediaType: media.mediaType,
  };
}

function publicUrl(key: string) {
  const base = getStorageConfig().publicBaseUrl;
  return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

/** Creates a normal presigned PUT URL. Used for images and local-development fallback uploads. */
export async function createMediaUpload(ownerId: string | number, contentType: string, size: number) {
  const media = validateUpload(contentType, size);
  try {
    const config = getStorageConfig();
    const key = `posts/${media.folder}/${ownerId}/${randomUUID()}.${media.extension}`;
    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: media.contentType,
    });
    const uploadUrl = await getSignedUrl(getClient(), command, { expiresIn: PRESIGNED_UPLOAD_URL_TTL_SECONDS });
    return {
      uploadUrl,
      key,
      publicUrl: publicUrl(key),
      contentType: media.contentType,
      mediaType: media.mediaType,
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production' &&
      (error instanceof MediaStorageConfigurationError || isMissingCredentials(error))) {
      return createLocalMediaUpload(ownerId, media.contentType, size);
    }
    if (isMissingCredentials(error)) {
      throw new MediaStorageConfigurationError('The AWS SDK could not find server-side credentials for S3 upload signing');
    }
    throw error;
  }
}

/** Starts an S3 multipart upload for a video. Local development falls back to one PUT request. */
export async function createMultipartMediaUpload(ownerId: string | number, contentType: string, size: number) {
  const media = validateUpload(contentType, size);
  if (media.mediaType !== 'VIDEO') throw new MediaValidationError('Multipart uploads are only available for videos');

  try {
    const config = getStorageConfig();
    const key = `posts/${media.folder}/${ownerId}/${randomUUID()}.${media.extension}`;
    const created = await getClient().send(new CreateMultipartUploadCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: media.contentType,
    }));
    if (!created.UploadId) throw new Error('S3 did not return a multipart upload identifier');
    return {
      mode: 'multipart' as const,
      key,
      uploadId: created.UploadId,
      partSize: MULTIPART_PART_SIZE,
      contentType: media.contentType,
      mediaType: media.mediaType,
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production' &&
      (error instanceof MediaStorageConfigurationError || isMissingCredentials(error))) {
      return {
        mode: 'single' as const,
        ...createLocalMediaUpload(ownerId, media.contentType, size),
      };
    }
    if (isMissingCredentials(error)) {
      throw new MediaStorageConfigurationError('The AWS SDK could not find server-side credentials for S3 multipart upload');
    }
    throw error;
  }
}

/** Creates a short-lived URL for one part of an owned video upload. */
export async function createMultipartPartUrl(
  ownerId: string | number,
  key: string,
  uploadId: string,
  partNumber: number,
) {
  getOwnedVideoKey(key, ownerId);
  const safeUploadId = validateUploadId(uploadId);
  if (!Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > 3) {
    throw new MediaValidationError('Invalid video upload part number');
  }
  const config = getStorageConfig();
  const command = new UploadPartCommand({
    Bucket: config.bucket,
    Key: key,
    UploadId: safeUploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(getClient(), command, { expiresIn: PRESIGNED_PART_URL_TTL_SECONDS });
}

/** Completes an owned multipart video upload using the ETags returned by S3. */
export async function completeMultipartMediaUpload(
  ownerId: string | number,
  key: string,
  uploadId: string,
  parts: Array<{ PartNumber: number; ETag: string }>,
) {
  getOwnedVideoKey(key, ownerId);
  const safeUploadId = validateUploadId(uploadId);
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > 3) {
    throw new MediaValidationError('Invalid video upload parts');
  }

  const completedParts: CompletedPart[] = parts.map((part, index) => {
    if (!part || part.PartNumber !== index + 1 || typeof part.ETag !== 'string' || !part.ETag.trim() || part.ETag.length > 256) {
      throw new MediaValidationError('Video upload parts are incomplete or out of order');
    }
    return { PartNumber: part.PartNumber, ETag: part.ETag };
  });

  const config = getStorageConfig();
  await getClient().send(new CompleteMultipartUploadCommand({
    Bucket: config.bucket,
    Key: key,
    UploadId: safeUploadId,
    MultipartUpload: { Parts: completedParts },
  }));
  return { key, url: publicUrl(key) };
}

/** Aborts an owned multipart video upload after a terminal client-side failure. */
export async function abortMultipartMediaUpload(ownerId: string | number, key: string, uploadId: string) {
  getOwnedVideoKey(key, ownerId);
  const safeUploadId = validateUploadId(uploadId);
  const config = getStorageConfig();
  await getClient().send(new AbortMultipartUploadCommand({
    Bucket: config.bucket,
    Key: key,
    UploadId: safeUploadId,
  }));
  return { ok: true };
}

/** Saves files to local disk for the existing local-development upload route. */
export async function saveLocalMedia(
  key: string,
  ownerId: string | number,
  contentType: string,
  bytes: Uint8Array,
) {
  const media = validateUpload(contentType, bytes.byteLength);
  const { id, extension, mediaEntry } = getLocalMediaDetails(key, ownerId);
  const [expectedType, expectedMedia] = mediaEntry;
  if (expectedType !== media.contentType || expectedMedia.mediaType !== media.mediaType ||
    !hasExpectedSignature(bytes, media.contentType)) {
    throw new MediaValidationError('Uploaded media content does not match its declared type');
  }
  await mkdir(LOCAL_MEDIA_DIRECTORY, { recursive: true });
  const filename = `${id}.${extension}`;
  await writeFile(join(LOCAL_MEDIA_DIRECTORY, filename), bytes, { flag: 'wx' });
  return { key, url: `/uploads/tweets/${filename}` };
}

/** Confirms uploaded media against the actual object stored in S3 or on local disk. */
export async function confirmUploadedMedia(key: string, ownerId: string | number) {
  if (key.startsWith(LOCAL_MEDIA_PREFIX)) {
    const { id, extension, mediaEntry } = getLocalMediaDetails(key, ownerId);
    const [mimeType, media] = mediaEntry;
    const filename = `${id}.${extension}`;
    let bytes: Buffer;
    try {
      bytes = await readFile(join(LOCAL_MEDIA_DIRECTORY, filename));
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        throw new MediaValidationError('Uploaded media was not found');
      }
      throw error;
    }
    if (bytes.byteLength < 1 || bytes.byteLength > MAX_POST_MEDIA_SIZE || !hasExpectedSignature(bytes, mimeType)) {
      throw new MediaValidationError('Uploaded media does not match the allowed type or size');
    }
    return { key, url: `/uploads/tweets/${filename}`, mediaType: media.mediaType, mimeType, fileSize: bytes.byteLength };
  }

  const config = getStorageConfig();
  const match = /^posts\/(images|videos|gifs)\/([^/]+)\/([0-9a-f-]{36})\.([a-z0-9]+)$/i.exec(key);
  if (!match || match[2] !== String(ownerId)) throw new MediaValidationError('Invalid media key');
  const [, folder, , , extension] = match;
  const mediaEntry = Object.entries(allowedTypes).find(([, media]) =>
    media.folder === folder && media.extension === extension.toLowerCase(),
  );
  if (!mediaEntry) throw new MediaValidationError('Unsupported media type');
  const [expectedType, media] = mediaEntry;

  let head: HeadObjectCommandOutput;
  try {
    head = await getClient().send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
  } catch (error) {
    if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) {
      throw new MediaValidationError('Uploaded media was not found');
    }
    throw error;
  }

  if (head.ContentLength === undefined || head.ContentLength < 1 ||
    head.ContentLength > MAX_POST_MEDIA_SIZE || head.ContentType !== expectedType) {
    throw new MediaValidationError('Uploaded media does not match the allowed type or size');
  }

  const object = await getClient().send(new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Range: 'bytes=0-15',
  }));
  const signature = await object.Body?.transformToByteArray();
  if (!signature || !hasExpectedSignature(signature, expectedType)) {
    throw new MediaValidationError('Uploaded media content does not match its declared type');
  }

  return { key, url: publicUrl(key), mediaType: media.mediaType, mimeType: expectedType, fileSize: head.ContentLength };
}

function hasExpectedSignature(bytes: Uint8Array, contentType: string) {
  const startsWith = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));

  switch (contentType) {
    case 'image/jpeg': return startsWith(0xff, 0xd8, 0xff);
    case 'image/png': return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'image/gif': return ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a';
    case 'image/webp': return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP';
    case 'video/mp4':
    case 'video/quicktime': return ascii(4, 4) === 'ftyp';
    case 'video/webm': return startsWith(0x1a, 0x45, 0xdf, 0xa3);
    default: return false;
  }
}
