import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

function encryptionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters');
  }
  return Buffer.from(hkdfSync(
    'sha256',
    secret,
    'HavenSocial BHID token encryption v1',
    'app_sessions.bhid_access_token_enc',
    32,
  ));
}

export function encryptBhidAccessToken(accessToken: string, sessionId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(sessionId));
  const ciphertext = Buffer.concat([cipher.update(accessToken, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptBhidAccessToken(encryptedToken: string, sessionId: string) {
  const [version, encodedIv, encodedTag, encodedCiphertext, ...extra] = encryptedToken.split('.');
  if (version !== 'v1' || !encodedIv || !encodedTag || !encodedCiphertext || extra.length) {
    throw new Error('Stored BHID access token has an invalid encrypted format');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(encodedIv, 'base64url'),
  );
  decipher.setAAD(Buffer.from(sessionId));
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
