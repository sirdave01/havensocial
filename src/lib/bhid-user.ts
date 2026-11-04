import { createHash } from 'node:crypto';
import type { QueryResult } from 'pg';
import { db } from '../models/db.js';

type Claims = Record<string, unknown>;

const readClaim = (claims: Claims, path: string): unknown => {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value && typeof value === 'object' && key in value) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, claims);
};

const claimString = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const limitedClaim = (value: unknown, limit: number) => claimString(value)?.slice(0, limit) || null;

function verificationLevel(claims: Claims) {
  const configured = process.env.BHID_VERIFICATION_CLAIM || 'verification.level';
  const value = readClaim(claims, configured);
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 100);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return (claimString(record.level) || claimString(record.tier))?.slice(0, 100) || null;
  }
  return null;
}

function roleFromClaims(claims: Claims) {
  const roleClaim = process.env.BHID_ROLE_CLAIM || 'roles';
  const value = readClaim(claims, roleClaim);
  const rawRoles = (Array.isArray(value) ? value : [value])
    .filter((role): role is string => typeof role === 'string')
    .map((role) => role.trim().toLowerCase());
  const roleMapValue = process.env.BHID_ROLE_MAP;
  let roleMap: Record<string, string> = {};
  if (roleMapValue) {
    const parsed: unknown = JSON.parse(roleMapValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('BHID_ROLE_MAP must be a JSON object');
    }
    const mappedRoles: Array<[string, string]> = [];
    for (const [source, target] of Object.entries(parsed)) {
      if (
        typeof target !== 'string' ||
        !['founder', 'admin', 'moderator', 'user'].includes(target.toLowerCase())
      ) {
        throw new Error('BHID_ROLE_MAP values must be HavenSocial role names');
      }
      mappedRoles.push([source.toLowerCase(), target.toLowerCase()]);
    }
    roleMap = Object.fromEntries(mappedRoles);
  }
  const roles = rawRoles.map((role) => roleMap[role]?.toLowerCase() || role);
  return ['founder', 'admin', 'moderator', 'user'].find((role) => roles.includes(role)) || 'user';
}

function normalizeUsername(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 30);
}

function makeUsername(claims: Claims, subject: string, unique = false) {
  const preferred = claimString(claims.preferred_username);
  const email = claimString(claims.email);
  const base = normalizeUsername(preferred || email?.split('@')[0] || 'havenuser') || 'havenuser';
  if (!unique) return base;

  const suffix = createHash('sha256').update(subject).digest('hex').slice(0, 7);
  return `${base.slice(0, 22)}_${suffix}`;
}

function validDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

export async function upsertBhidUser(claims: Claims) {
  const subject = claimString(claims.sub);
  if (!subject) throw new Error('BHID identity response did not contain a subject');

  const email = limitedClaim(claims.email, 255)?.toLowerCase() || null;
  const displayName = limitedClaim(claims.name, 255) || limitedClaim(claims.preferred_username, 255);
  const username = makeUsername(claims, subject);
  const fullName = limitedClaim(claims.name, 255);
  const avatar = limitedClaim(claims.picture, 2048);
  const bio = limitedClaim(claims.bio, 500);
  const dateOfBirth = validDate(claims.birthdate);
  const level = verificationLevel(claims);
  const role = roleFromClaims(claims);

  const saveUser = async (candidateUsername: string) => db.query(
    `INSERT INTO users (
       bhid_sub, username, email, full_name, display_name, bio,
      profile_picture_url, bhid_picture_url, date_of_birth, verification_level, verified, role_id
     )
     VALUES (
       $1, $2, $3, $4, COALESCE($5, $2), $6,
      NULL, $7, $8, $9, ($9 IS NOT NULL),
       COALESCE(
         (SELECT role_id FROM roles WHERE role_name = $10),
         (SELECT role_id FROM roles WHERE role_name = 'user')
       )
     )
     ON CONFLICT (bhid_sub) DO UPDATE SET
       username = EXCLUDED.username,
       email = COALESCE(EXCLUDED.email, users.email),
       full_name = COALESCE(EXCLUDED.full_name, users.full_name),
       display_name = COALESCE(EXCLUDED.display_name, users.display_name),
       bio = COALESCE(EXCLUDED.bio, users.bio),
       bhid_picture_url = COALESCE(EXCLUDED.bhid_picture_url, users.bhid_picture_url),
       date_of_birth = COALESCE(EXCLUDED.date_of_birth, users.date_of_birth),
       verification_level = EXCLUDED.verification_level,
       verified = (EXCLUDED.verification_level IS NOT NULL),
       role_id = (SELECT role_id FROM roles WHERE role_name = $10),
       updated_at = CURRENT_TIMESTAMP
     RETURNING users_id, bhid_sub, username, display_name,
               COALESCE(profile_picture_url, bhid_picture_url) AS profile_picture_url,
               verification_level, verified, role_id`,
    [
      subject,
      candidateUsername,
      email,
      fullName,
      displayName,
      bio,
      avatar,
      dateOfBirth,
      level,
      role,
    ],
  );

  let result: QueryResult;
  try {
    result = await saveUser(username);
  } catch (error) {
    if (
      !error ||
      typeof error !== 'object' ||
      !('code' in error) ||
      error.code !== '23505' ||
      !('constraint' in error) ||
      error.constraint !== 'users_username_key'
    ) {
      throw error;
    }
    result = await saveUser(makeUsername(claims, subject, true));
  }

  if (!result.rows[0]) throw new Error('Unable to link BHID identity to a local user');
  return result.rows[0];
}
