import { randomUUID } from 'node:crypto';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  type HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type PostMediaType = 'IMAGE' | 'VIDEO' | 'GIF';

const allowedTypes: Record<string, { extension: string; mediaType: PostMediaType; folder: string }> = {
  'image/jpeg': { extension: 'jpg', mediaType: 'IMAGE', folder: 'images' },
  'image/png': { extension: 'png', mediaType: 'IMAGE', folder: 'images' },
  'image/gif': { extension: 'gif', mediaType: 'GIF', folder: 'gifs' },
  'image/webp': { extension: 'webp', mediaType: 'IMAGE', folder: 'images' },
  'video/mp4': { extension: 'mp4', mediaType: 'VIDEO', folder: 'videos' },
  'video/webm': { extension: 'webm', mediaType: 'VIDEO', folder: 'videos' },
};

const MAX_POST_MEDIA_SIZE = 15 * 1024 * 1024;

export class MediaValidationError extends Error {}

let client: S3Client | undefined;

function getStorageConfig() {
  const bucket = process.env.S3_BUCKET_NAME?.replace(/\/+$/, '');
  const region = process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1';
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const configuredPublicBaseUrl = process.env.S3_PUBLIC_BASE_URL?.replace(/\/+$/, '');
  const publicBaseUrl = configuredPublicBaseUrl || (
    endpoint ? undefined : `https://${bucket}.s3.${region}.amazonaws.com`
  );
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  if (!bucket) {
    throw new Error('S3_BUCKET_NAME must be configured');
  }
  if (!publicBaseUrl) {
    throw new Error('S3_PUBLIC_BASE_URL must be configured when using a custom S3 endpoint');
  }
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error('Both S3/AWS access key and secret access key must be configured together');
  }
  return {
    bucket,
    publicBaseUrl,
    region,
    endpoint,
    credentials: accessKeyId && secretAccessKey
      ? { accessKeyId, secretAccessKey }
      : undefined,
  };
}

function getClient() {
  if (!client) {
    const config = getStorageConfig();
    client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: Boolean(config.endpoint),
      ...(config.credentials ? { credentials: config.credentials } : {}),
    });
  }
  return client;
}

function validateUpload(contentType: string, size: number) {
  const media = allowedTypes[contentType];
  if (!media) throw new MediaValidationError('Unsupported media type');
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_POST_MEDIA_SIZE) {
    throw new MediaValidationError(`Media must be between 1 byte and ${MAX_POST_MEDIA_SIZE} bytes`);
  }
  return media;
}

function publicUrl(key: string) {
  const base = getStorageConfig().publicBaseUrl;
  return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export async function createMediaUpload(
  ownerId: string | number,
  contentType: string,
  size: number,
) {
  const config = getStorageConfig();
  const media = validateUpload(contentType, size);
  const key = `posts/${media.folder}/${ownerId}/${randomUUID()}.${media.extension}`;
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: size,
  });
  const uploadUrl = await getSignedUrl(getClient(), command, { expiresIn: 300 });
  return {
    uploadUrl,
    key,
    publicUrl: publicUrl(key),
    contentType,
    mediaType: media.mediaType,
  };
}

export async function confirmUploadedMedia(
  key: string,
  ownerId: string | number,
) {
  const config = getStorageConfig();
  const match = /^posts\/(images|videos|gifs)\/([^/]+)\/([0-9a-f-]{36})\.([a-z0-9]+)$/i.exec(key);
  if (!match || match[2] !== String(ownerId)) {
    throw new MediaValidationError('Invalid media key');
  }

  const [, folder, , , extension] = match;
  const mediaEntry = Object.entries(allowedTypes).find(
    ([, media]) => media.folder === folder && media.extension === extension.toLowerCase(),
  );
  if (!mediaEntry) throw new MediaValidationError('Unsupported media type');
  const [expectedType, media] = mediaEntry;

  let head: HeadObjectCommandOutput;
  try {
    head = await getClient().send(new HeadObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }));
  } catch (error) {
    if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) {
      throw new MediaValidationError('Uploaded media was not found');
    }
    throw error;
  }
  if (
    !head.ContentLength ||
    head.ContentLength > MAX_POST_MEDIA_SIZE ||
    head.ContentType !== expectedType
  ) {
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

  return {
    key,
    url: publicUrl(key),
    mediaType: media.mediaType,
    mimeType: expectedType,
    fileSize: head.ContentLength,
  };
}

function hasExpectedSignature(bytes: Uint8Array, contentType: string) {
  const startsWith = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.slice(start, start + length));

  switch (contentType) {
    case 'image/jpeg':
      return startsWith(0xff, 0xd8, 0xff);
    case 'image/png':
      return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'image/gif':
      return ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a';
    case 'image/webp':
      return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP';
    case 'video/mp4':
      return ascii(4, 4) === 'ftyp';
    case 'video/webm':
      return startsWith(0x1a, 0x45, 0xdf, 0xa3);
    default:
      return false;
  }
}
