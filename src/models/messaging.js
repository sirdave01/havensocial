import { db, pool } from './db.js';

const MAX_BIGINT = '9223372036854775807';
const DEFAULT_PAGE_SIZE = 50;

function normalizeId(value) {
  const text = String(value ?? '');
  if (!/^[1-9]\d*$/.test(text)) return null;
  if (text.length > 19 || (text.length === 19 && text > MAX_BIGINT)) return null;
  return text;
}

function clampLimit(value, fallback = DEFAULT_PAGE_SIZE) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed)
    ? Math.min(Math.max(parsed, 1), 100)
    : fallback;
}

/** Search active HavenSocial accounts that may receive a direct message. */
export async function searchDirectMessageUsers(viewerId, rawQuery, limit = 20) {
  const query = String(rawQuery ?? '').trim().replace(/^@/, '').slice(0, 80);
  if (query.length < 2) return [];

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 30);
  const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;

  const result = await db.query(
    `SELECT
       u.users_id::text AS user_id,
       u.bhid_sub,
       COALESCE(NULLIF(BTRIM(p.name), ''), 'HavenSocial user') AS name,
       p.preferred_username,
       p.picture
     FROM users u
     LEFT JOIN bhid_profile_cache p ON p.bhid_sub = u.bhid_sub
     WHERE u.app_status = 'ACTIVE'
       AND u.users_id <> $1
       AND (
         u.bhid_sub ILIKE $2 ESCAPE '\\'
         OR COALESCE(p.preferred_username, '') ILIKE $2 ESCAPE '\\'
         OR COALESCE(p.name, '') ILIKE $2 ESCAPE '\\'
       )
       AND NOT EXISTS (
         SELECT 1
         FROM blocked_users b
         WHERE (b.blocker_id = $1 AND b.blocked_id = u.users_id)
            OR (b.blocker_id = u.users_id AND b.blocked_id = $1)
       )
     ORDER BY
       (COALESCE(p.preferred_username, '') ILIKE $3 ESCAPE '\\') DESC,
       (u.bhid_sub ILIKE $3 ESCAPE '\\') DESC,
       u.created_at DESC
     LIMIT $4`,
    [viewerId, pattern, query, safeLimit],
  );

  return result.rows;
}

/** Return the current user's direct-message inbox. */
export async function getDirectConversationInbox(userId, limit = 50) {
  const safeLimit = clampLimit(limit, 50);
  const result = await db.query(
    `SELECT
       c.conversation_id::text AS conversation_id,
       c.updated_at,
       other.users_id::text AS other_user_id,
       other.bhid_sub AS other_sub,
       COALESCE(NULLIF(BTRIM(profile.name), ''), 'HavenSocial user') AS other_name,
       profile.preferred_username AS other_username,
       profile.picture AS other_picture,
       mine.is_muted,
       CASE WHEN latest.is_deleted THEN 'This message was deleted.' ELSE latest.content END AS last_message_content,
       latest.created_at AS last_message_at,
       latest.sender_id::text AS last_message_sender_id,
       COALESCE(unread.unread_count, 0)::int AS unread_count
     FROM conversation_participants mine
     JOIN conversations c
       ON c.conversation_id = mine.conversation_id
      AND c.conversation_type = 'DIRECT'
     JOIN conversation_participants theirs
       ON theirs.conversation_id = c.conversation_id
      AND theirs.user_id <> mine.user_id
     JOIN users other
       ON other.users_id = theirs.user_id
     LEFT JOIN bhid_profile_cache profile
       ON profile.bhid_sub = other.bhid_sub
     LEFT JOIN LATERAL (
       SELECT m.content, m.created_at, m.sender_id, m.is_deleted
       FROM messages m
       WHERE m.conversation_id = c.conversation_id
       ORDER BY m.message_id DESC
       LIMIT 1
     ) latest ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS unread_count
       FROM messages m
       WHERE m.conversation_id = c.conversation_id
         AND m.sender_id <> mine.user_id
         AND m.is_deleted = FALSE
         AND m.created_at > COALESCE(mine.last_read_at, mine.joined_at)
     ) unread ON TRUE
     WHERE mine.user_id = $1
       AND mine.is_archived = FALSE
       AND (SELECT COUNT(*) FROM conversation_participants all_members
            WHERE all_members.conversation_id = c.conversation_id) = 2
     ORDER BY c.updated_at DESC, c.conversation_id DESC
     LIMIT $2`,
    [userId, safeLimit],
  );

  return result.rows;
}

/** Create a direct conversation or return the existing one for this pair. */
export async function getOrCreateDirectConversation(userId, recipientSub) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const recipientResult = await client.query(
      `SELECT users_id::text AS user_id
       FROM users
       WHERE bhid_sub = $1
         AND app_status = 'ACTIVE'
       LIMIT 1
       FOR SHARE`,
      [recipientSub],
    );
    const recipientId = recipientResult.rows[0]?.user_id;
    if (!recipientId) {
      throw new Error('RECIPIENT_NOT_FOUND');
    }
    if (String(recipientId) === String(userId)) {
      throw new Error('CANNOT_MESSAGE_SELF');
    }

    const blockResult = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM blocked_users
         WHERE (blocker_id = $1 AND blocked_id = $2)
            OR (blocker_id = $2 AND blocked_id = $1)
       ) AS blocked`,
      [userId, recipientId],
    );
    if (blockResult.rows[0]?.blocked) throw new Error('MESSAGING_BLOCKED');

    const pairKey = `direct:${[String(userId), String(recipientId)].sort().join(':')}`;
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [pairKey]);

    const existing = await client.query(
      `SELECT c.conversation_id::text AS conversation_id
       FROM conversations c
       JOIN conversation_participants mine
         ON mine.conversation_id = c.conversation_id
        AND mine.user_id = $1
       JOIN conversation_participants theirs
         ON theirs.conversation_id = c.conversation_id
        AND theirs.user_id = $2
       WHERE c.conversation_type = 'DIRECT'
         AND (SELECT COUNT(*) FROM conversation_participants member
              WHERE member.conversation_id = c.conversation_id) = 2
       ORDER BY c.updated_at DESC, c.conversation_id DESC
       LIMIT 1
       FOR UPDATE OF c`,
      [userId, recipientId],
    );

    if (existing.rows[0]) {
      await client.query(
        `UPDATE conversation_participants
         SET is_archived = FALSE
         WHERE conversation_id = $1 AND user_id = $2`,
        [existing.rows[0].conversation_id, userId],
      );
      await client.query('COMMIT');
      return existing.rows[0].conversation_id;
    }

    const created = await client.query(
      `INSERT INTO conversations (conversation_type, created_by)
       VALUES ('DIRECT', $1)
       RETURNING conversation_id::text AS conversation_id`,
      [userId],
    );
    const conversationId = created.rows[0].conversation_id;

    await client.query(
      `INSERT INTO conversation_participants (conversation_id, user_id)
       VALUES ($1, $2), ($1, $3)`,
      [conversationId, userId, recipientId],
    );

    await client.query('COMMIT');
    return conversationId;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
    throw error;
  } finally {
    client.release();
  }
}

/** Check that a user belongs to a two-person direct conversation. */
export async function getDirectConversationForUser(conversationId, userId) {
  const safeConversationId = normalizeId(conversationId);
  if (!safeConversationId) return null;

  const result = await db.query(
    `SELECT
       c.conversation_id::text AS conversation_id,
       c.conversation_type,
       c.created_at,
       c.updated_at,
       other.users_id::text AS other_user_id,
       other.bhid_sub AS other_sub,
       COALESCE(NULLIF(BTRIM(profile.name), ''), 'HavenSocial user') AS other_name,
       profile.preferred_username AS other_username,
       profile.picture AS other_picture,
       (other.app_status = 'ACTIVE' AND NOT EXISTS (
         SELECT 1 FROM blocked_users b
         WHERE (b.blocker_id = $2 AND b.blocked_id = other.users_id)
            OR (b.blocker_id = other.users_id AND b.blocked_id = $2)
       )) AS can_send
     FROM conversations c
     JOIN conversation_participants mine
       ON mine.conversation_id = c.conversation_id
      AND mine.user_id = $2
     JOIN conversation_participants theirs
       ON theirs.conversation_id = c.conversation_id
      AND theirs.user_id <> $2
     JOIN users other
       ON other.users_id = theirs.user_id
     LEFT JOIN bhid_profile_cache profile
       ON profile.bhid_sub = other.bhid_sub
     WHERE c.conversation_id = $1
       AND c.conversation_type = 'DIRECT'
       AND (SELECT COUNT(*) FROM conversation_participants member
            WHERE member.conversation_id = c.conversation_id) = 2
     LIMIT 1`,
    [safeConversationId, userId],
  );

  return result.rows[0] ?? null;
}

/**
 * Retrieve a page of messages after verifying conversation membership.
 * @param {string | number} conversationId
 * @param {string | number} userId
 * @param {string | null} [before=null]
 * @param {number} [limit=50]
 */
export async function getDirectConversationMessages(conversationId, userId, before = null, limit = 50) {
  const conversation = await getDirectConversationForUser(conversationId, userId);
  if (!conversation) return null;

  const safeBefore = before == null ? null : normalizeId(before);
  if (before != null && !safeBefore) throw new Error('INVALID_MESSAGE_CURSOR');
  const safeLimit = clampLimit(limit, 50);

  const result = await db.query(
    `SELECT
       m.message_id::text AS message_id,
       m.conversation_id::text AS conversation_id,
       m.sender_id::text AS sender_id,
       sender.bhid_sub AS sender_sub,
       COALESCE(NULLIF(BTRIM(profile.name), ''), 'HavenSocial user') AS sender_name,
       profile.preferred_username AS sender_username,
       profile.picture AS sender_picture,
       m.content,
       m.reply_to_message_id::text AS reply_to_message_id,
       m.is_edited,
       m.is_deleted,
       m.created_at,
       m.updated_at
     FROM messages m
     JOIN users sender ON sender.users_id = m.sender_id
     LEFT JOIN bhid_profile_cache profile ON profile.bhid_sub = sender.bhid_sub
     WHERE m.conversation_id = $1
       AND ($2::bigint IS NULL OR m.message_id < $2::bigint)
     ORDER BY m.message_id DESC
     LIMIT $3`,
    [conversation.conversation_id, safeBefore, safeLimit + 1],
  );

  const hasMore = result.rows.length > safeLimit;
  const rows = result.rows.slice(0, safeLimit).reverse();
  return { conversation, messages: rows, hasMore };
}

/** Send a text message in a direct conversation. */
export async function sendDirectMessage(conversationId, senderId, rawContent) {
  const safeConversationId = normalizeId(conversationId);
  if (!safeConversationId) throw new Error('INVALID_CONVERSATION');

  const content = String(rawContent ?? '').trim();
  if (!content) throw new Error('EMPTY_MESSAGE');
  if (content.includes('\0') || Array.from(content).length > 10000) {
    throw new Error('INVALID_MESSAGE_CONTENT');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const access = await client.query(
      `SELECT
         recipient.user_id::text AS recipient_id,
         recipient_user.app_status AS recipient_status,
         EXISTS (
           SELECT 1 FROM blocked_users b
           WHERE (b.blocker_id = $2 AND b.blocked_id = recipient.user_id)
              OR (b.blocker_id = recipient.user_id AND b.blocked_id = $2)
         ) AS blocked
       FROM conversations c
       JOIN conversation_participants mine
         ON mine.conversation_id = c.conversation_id
        AND mine.user_id = $2
       JOIN conversation_participants recipient
         ON recipient.conversation_id = c.conversation_id
        AND recipient.user_id <> $2
       JOIN users recipient_user ON recipient_user.users_id = recipient.user_id
       WHERE c.conversation_id = $1
         AND c.conversation_type = 'DIRECT'
         AND (SELECT COUNT(*) FROM conversation_participants member
              WHERE member.conversation_id = c.conversation_id) = 2
       LIMIT 1
       FOR UPDATE OF c`,
      [safeConversationId, senderId],
    );

    const target = access.rows[0];
    if (!target) throw new Error('CONVERSATION_NOT_FOUND');
    if (target.blocked) throw new Error('MESSAGING_BLOCKED');
    if (target.recipient_status !== 'ACTIVE') throw new Error('RECIPIENT_UNAVAILABLE');

    const inserted = await client.query(
      `INSERT INTO messages (conversation_id, sender_id, content)
       VALUES ($1, $2, $3)
       RETURNING message_id::text AS message_id,
                 conversation_id::text AS conversation_id,
                 sender_id::text AS sender_id,
                 content, reply_to_message_id::text AS reply_to_message_id,
                 is_edited, is_deleted, created_at, updated_at`,
      [safeConversationId, senderId, content],
    );

    await client.query(
      `UPDATE conversations
       SET updated_at = CURRENT_TIMESTAMP
       WHERE conversation_id = $1`,
      [safeConversationId],
    );
    await client.query(
      `UPDATE conversation_participants
       SET last_read_at = CURRENT_TIMESTAMP,
           is_archived = FALSE
       WHERE conversation_id = $1
         AND user_id = $2`,
      [safeConversationId, senderId],
    );
    await client.query(
      `UPDATE conversation_participants
       SET is_archived = FALSE
       WHERE conversation_id = $1
         AND user_id = $2`,
      [safeConversationId, target.recipient_id],
    );

    const profile = await client.query(
      `SELECT u.bhid_sub AS sender_sub,
              COALESCE(NULLIF(BTRIM(p.name), ''), 'HavenSocial user') AS sender_name,
              p.preferred_username AS sender_username,
              p.picture AS sender_picture
       FROM users u
       LEFT JOIN bhid_profile_cache p ON p.bhid_sub = u.bhid_sub
       WHERE u.users_id = $1`,
      [senderId],
    );

    await client.query('COMMIT');
    return { ...inserted.rows[0], ...profile.rows[0] };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Mark all messages visible at the time of this database statement as read.
 * The client timestamp is intentionally not used: JavaScript Date truncates
 * PostgreSQL microseconds to milliseconds, which can leave the newest message
 * appearing unread after it has been opened.
 * @param {string | number} conversationId
 * @param {string | number} userId
 * @param {string | Date | null} [_readThrough=null]
 */
export async function markDirectConversationRead(conversationId, userId, _readThrough = null) {
  const safeConversationId = normalizeId(conversationId);
  if (!safeConversationId) return false;

  const result = await db.query(
    `UPDATE conversation_participants cp
     SET last_read_at = GREATEST(
           COALESCE(cp.last_read_at, cp.joined_at),
           statement_timestamp()
         ),
         is_archived = FALSE
     FROM conversations c
     WHERE cp.conversation_id = c.conversation_id
       AND cp.conversation_id = $1
       AND cp.user_id = $2
       AND c.conversation_type = 'DIRECT'
       AND (SELECT COUNT(*) FROM conversation_participants member
            WHERE member.conversation_id = c.conversation_id) = 2
     RETURNING cp.conversation_id`,
    [safeConversationId, userId],
  );
  return Boolean(result.rows[0]);
}

/** Count unread direct messages for the navigation badge. */
export async function getUnreadMessageCount(userId) {
  const result = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM messages m
     JOIN conversation_participants cp
       ON cp.conversation_id = m.conversation_id
      AND cp.user_id = $1
     JOIN conversations c
       ON c.conversation_id = m.conversation_id
      AND c.conversation_type = 'DIRECT'
     WHERE m.sender_id <> $1
       AND m.is_deleted = FALSE
       AND cp.is_archived = FALSE
       AND m.created_at > COALESCE(cp.last_read_at, cp.joined_at)`,
    [userId],
  );
  return Number(result.rows[0]?.count ?? 0);
}
