import { randomUUID } from 'node:crypto';
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  type HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type MediaKind = 'profile' | 'tweets';

const allowedTypes: Record<MediaKind, Record<string, string>> = {
  profile: {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  },
  tweets: {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
  },
};

const maxSize: Record<MediaKind, number> = {
  profile: 5 * 1024 * 1024,
  tweets: 15 * 1024 * 1024,
};

export class MediaValidationError extends Error {}

let client: S3Client | undefined;

function getStorageConfig() {
  const bucket = process.env.S3_BUCKET;
  const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL?.replace(/\/+$/, '');
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !publicBaseUrl || !accessKeyId || !secretAccessKey) {
    throw new Error('S3_BUCKET, S3_PUBLIC_BASE_URL, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY must be configured');
  }
  return {
    bucket,
    publicBaseUrl,
    region: process.env.S3_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    accessKeyId,
    secretAccessKey,
  };
}

function getClient() {
  if (!client) {
    const config = getStorageConfig();
    client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: Boolean(config.endpoint),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return client;
}

function validateUpload(kind: MediaKind, contentType: string, size: number) {
  const extension = allowedTypes[kind][contentType];
  if (!extension) throw new MediaValidationError('Unsupported media type');
  if (!Number.isSafeInteger(size) || size < 1 || size > maxSize[kind]) {
    throw new MediaValidationError(`Media must be between 1 byte and ${maxSize[kind]} bytes`);
  }
  return extension;
}

function publicUrl(key: string) {
  const base = getStorageConfig().publicBaseUrl;
  return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export async function createMediaUpload(
  kind: MediaKind,
  ownerId: string | number,
  contentType: string,
  size: number,
) {
  const config = getStorageConfig();
  const extension = validateUpload(kind, contentType, size);
  const key = `uploads/${kind}/${ownerId}/${randomUUID()}.${extension}`;
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: size,
  });
  const uploadUrl = await getSignedUrl(getClient(), command, { expiresIn: 300 });
  return { uploadUrl, key, publicUrl: publicUrl(key), contentType };
}

export async function confirmUploadedMedia(
  key: string,
  kind: MediaKind,
  ownerId: string | number,
) {
  const config = getStorageConfig();
  const prefix = `uploads/${kind}/${ownerId}/`;
  if (!key.startsWith(prefix) || key.includes('..')) {
    throw new MediaValidationError('Invalid media key');
  }

  const extension = key.split('.').pop();
  const expectedType = Object.entries(allowedTypes[kind])
    .find(([, allowedExtension]) => allowedExtension === extension)?.[0];
  if (!expectedType) throw new MediaValidationError('Unsupported media type');

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
    head.ContentLength > maxSize[kind] ||
    head.ContentType !== expectedType
  ) {
    throw new MediaValidationError('Uploaded media does not match the allowed type or size');
  }
  return publicUrl(key);
}
