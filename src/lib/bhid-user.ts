import { db } from '../models/db.js';

type Claims = Record<string, unknown>;

const claimString = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const readClaim = (claims: Claims, path: string): unknown => {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value && typeof value === 'object' && key in value) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, claims);
};

function roleFromClaims(claims: Claims) {
  const roleClaim = process.env.BHID_ROLE_CLAIM || 'roles';
  const value = readClaim(claims, roleClaim);
  const rawRoles = (Array.isArray(value) ? value : [value])
    .filter((role): role is string => typeof role === 'string')
    .map((role) => role.trim().toLowerCase());
  const roleMapValue = process.env.BHID_ROLE_MAP;
  let roleMap: Record<string, string> = {};

  if (roleMapValue) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(roleMapValue);
    } catch (error) {
      throw new Error('BHID_ROLE_MAP must be valid JSON', { cause: error });
    }
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

  const roles = rawRoles.map((role) => roleMap[role]).filter((role): role is string => Boolean(role));
  return ['founder', 'admin', 'moderator', 'user'].find((role) => roles.includes(role)) || 'user';
}

export async function upsertBhidUser(claims: Claims) {
  const subject = claimString(claims.sub);
  if (!subject) throw new Error('BHID identity response did not contain a subject');

  const result = await db.query(
    `INSERT INTO users (bhid_sub, role_id)
     VALUES (
       $1,
       COALESCE(
         (SELECT role_id FROM roles WHERE role_name = $2),
         (SELECT role_id FROM roles WHERE role_name = 'user')
       )
     )
     ON CONFLICT (bhid_sub) DO UPDATE
       SET last_seen_at = CURRENT_TIMESTAMP
     RETURNING users_id, bhid_sub, role_id, app_status`,
    [subject, roleFromClaims(claims)],
  );
  const user = result.rows[0];
  if (!user) throw new Error('Unable to provision the HavenSocial user');

  await db.query(
    `INSERT INTO user_preferences (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [user.users_id],
  );

  return user;
}
