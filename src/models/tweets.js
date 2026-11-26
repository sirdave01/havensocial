import { db, pool } from './db.js';

import {
  dispatchMentionNotifications,
  notifyPendingTweetMentions,
  syncTweetMentions,
} from './mentions.js';

// ==================== HELPERS ====================

const buildReplyTree = (rows) => {
  const map = new Map();
  const roots = [];

  rows.forEach((row) => {
    row.replies = [];
    map.set(String(row.tweet_id), row);
  });

  rows.forEach((row) => {
    const parent = row.is_reply_to
      ? map.get(String(row.is_reply_to))
      : null;

    if (parent) parent.replies.push(row);
    else roots.push(row);
  });

  return roots;
};

const attachMedia = async (rows) => {
  const allRows = [];

  const visit = (row) => {
    allRows.push(row);

    for (const reply of row.replies || []) {
      visit(reply);
    }
  };

  rows.forEach(visit);

  if (!allRows.length) return rows;

  const tweetIds = [
    ...new Set(allRows.map((row) => String(row.tweet_id))),
  ];

  const { rows: mediaRows } = await db.query(
    `SELECT
       media_id,
       tweet_id,
       storage_key,
       media_url,
       media_type,
       mime_type,
       file_size,
       thumbnail_storage_key,
       thumbnail_url,
       width,
       height,
       duration_seconds,
       alt_text,
       position
     FROM tweet_media
     WHERE tweet_id = ANY($1::bigint[])
     ORDER BY tweet_id, position, media_id`,
    [tweetIds],
  );

  const mediaByTweet = new Map();

  for (const media of mediaRows) {
    const id = String(media.tweet_id);
    const attachments = mediaByTweet.get(id) || [];

    attachments.push(media);
    mediaByTweet.set(id, attachments);
  }

  allRows.forEach((row) => {
    row.media = mediaByTweet.get(String(row.tweet_id)) || [];
  });

  return rows;
};

const attachMentions = async (rows) => {
  const allRows = [];

  const visit = (row) => {
    allRows.push(row);

    for (const reply of row.replies || []) {
      visit(reply);
    }
  };

  rows.forEach(visit);

  if (!allRows.length) return rows;

  const tweetIds = [
    ...new Set(allRows.map((row) => String(row.tweet_id))),
  ];

  const { rows: mentionRows } = await db.query(
    `SELECT
       tm.tweet_id::text AS tweet_id,
       p.preferred_username AS username,
       u.bhid_sub AS sub
     FROM tweet_mentions tm
     JOIN users u
       ON u.users_id = tm.mentioned_user_id
     JOIN bhid_profile_cache p
       ON p.bhid_sub = u.bhid_sub
     WHERE tm.tweet_id = ANY($1::bigint[])
       AND u.app_status = 'ACTIVE'
     ORDER BY tm.tweet_id, LOWER(p.preferred_username)`,
    [tweetIds],
  );

  const mentionsByTweet = new Map();

  for (const mention of mentionRows) {
    const id = String(mention.tweet_id);
    const mentions = mentionsByTweet.get(id) || [];

    mentions.push({
      username: mention.username,
      sub: mention.sub,
    });

    mentionsByTweet.set(id, mentions);
  }

  allRows.forEach((row) => {
    row.mentions = mentionsByTweet.get(String(row.tweet_id)) || [];
  });

  return rows;
};

// ==================== THREADED REPLIES ====================

export const getThreadedRepliesForTweet = async (
  tweetId,
  viewerId = null,
) => {
  const query = `
    WITH RECURSIVE reply_tree AS (
      SELECT
        t.*,
        1 AS depth
      FROM tweets t
      WHERE t.is_reply_to = $1
        AND t.is_deleted = FALSE
        AND t.deleted_at IS NULL
        AND t.published_at IS NOT NULL

      UNION ALL

      SELECT
        child.*,
        parent.depth + 1
      FROM tweets child
      JOIN reply_tree parent
        ON child.is_reply_to = parent.tweet_id
      WHERE child.is_deleted = FALSE
        AND child.deleted_at IS NULL
        AND child.published_at IS NOT NULL
    )

    SELECT
      rt.*,

      u.bhid_sub AS author_sub,

      reply_parent_author.bhid_sub AS reply_to_author_sub,
      reply_parent_profile.preferred_username AS reply_to_author_username,

      (
        SELECT COUNT(*)
        FROM likes l
        WHERE l.tweet_id = rt.tweet_id
      ) AS like_count,

      (
        SELECT COUNT(*)
        FROM tweets r
        WHERE r.is_reply_to = rt.tweet_id
          AND r.is_deleted = FALSE
          AND r.deleted_at IS NULL
          AND r.published_at IS NOT NULL
      ) AS reply_count,

      (
        SELECT COUNT(*)
        FROM retweets r
        WHERE r.original_tweet_id = rt.tweet_id
      ) AS retweet_count,

      (
        SELECT COUNT(*)
        FROM tweet_views v
        WHERE v.tweet_id = rt.tweet_id
          AND v.qualification_status = 'QUALIFIED'
      ) AS view_count,

      EXISTS (
        SELECT 1
        FROM likes
        WHERE tweet_id = rt.tweet_id
          AND user_id = $2
      ) AS liked_by_user,

      EXISTS (
        SELECT 1
        FROM retweets
        WHERE original_tweet_id = rt.tweet_id
          AND user_id = $2
      ) AS retweeted_by_user,

      EXISTS (
        SELECT 1
        FROM follows
        WHERE follower_id = $2
          AND followee_id = rt.user_id
      ) AS is_following

    FROM reply_tree rt

    JOIN users u
      ON u.users_id = rt.user_id

    LEFT JOIN tweets reply_parent
      ON reply_parent.tweet_id = rt.is_reply_to

    LEFT JOIN users reply_parent_author
      ON reply_parent_author.users_id = reply_parent.user_id

    LEFT JOIN bhid_profile_cache reply_parent_profile
      ON reply_parent_profile.bhid_sub = reply_parent_author.bhid_sub

    ORDER BY
      rt.created_at ASC,
      rt.tweet_id ASC;
  `;

  const { rows } = await db.query(query, [tweetId, viewerId]);

  const tree = buildReplyTree(rows);

  await attachMedia(tree);

  return attachMentions(tree);
};

// ==================== SINGLE TWEET + THREAD ====================

export const getTweetWithReplies = async (
  tweetId,
  viewerId = null,
) => {
  const mainQuery = `
    SELECT
      t.*,

      u.bhid_sub AS author_sub,

      reply_parent_author.bhid_sub AS reply_to_author_sub,
      reply_parent_profile.preferred_username AS reply_to_author_username,

      (
        SELECT COUNT(*)
        FROM likes l
        WHERE l.tweet_id = t.tweet_id
      ) AS like_count,

      (
        SELECT COUNT(*)
        FROM tweets r
        WHERE r.is_reply_to = t.tweet_id
          AND r.is_deleted = FALSE
          AND r.deleted_at IS NULL
          AND r.published_at IS NOT NULL
      ) AS reply_count,

      (
        SELECT COUNT(*)
        FROM retweets rt
        WHERE rt.original_tweet_id = t.tweet_id
      ) AS retweet_count,

      (
        SELECT COUNT(*)
        FROM tweet_views v
        WHERE v.tweet_id = t.tweet_id
          AND v.qualification_status = 'QUALIFIED'
      ) AS view_count,

      EXISTS (
        SELECT 1
        FROM likes
        WHERE tweet_id = t.tweet_id
          AND user_id = $2
      ) AS liked_by_user,

      EXISTS (
        SELECT 1
        FROM retweets
        WHERE original_tweet_id = t.tweet_id
          AND user_id = $2
      ) AS retweeted_by_user,

      EXISTS (
        SELECT 1
        FROM follows
        WHERE follower_id = $2
          AND followee_id = t.user_id
      ) AS is_following

    FROM tweets t

    JOIN users u
      ON u.users_id = t.user_id

    LEFT JOIN tweets reply_parent
      ON reply_parent.tweet_id = t.is_reply_to

    LEFT JOIN users reply_parent_author
      ON reply_parent_author.users_id = reply_parent.user_id

    LEFT JOIN bhid_profile_cache reply_parent_profile
      ON reply_parent_profile.bhid_sub = reply_parent_author.bhid_sub

    WHERE t.tweet_id = $1
      AND t.published_at IS NOT NULL;
  `;

  const mainResult = await db.query(mainQuery, [
    tweetId,
    viewerId,
  ]);

  const tweet = mainResult.rows[0];

  if (!tweet) return null;

  const replies = await getThreadedRepliesForTweet(
    tweetId,
    viewerId,
  );

  const thread = {
    ...tweet,
    replies,
  };

  await attachMedia([thread]);
  await attachMentions([thread]);

  return thread;
};

// ==================== SINGLE TWEET ====================

const getTweetById = async (tweetId) => {
  const query = `
    SELECT
      t.*,

      u.bhid_sub AS author_sub,

      reply_parent_author.bhid_sub AS reply_to_author_sub,
      reply_parent_profile.preferred_username AS reply_to_author_username,

      (
        SELECT COUNT(*)
        FROM tweet_views v
        WHERE v.tweet_id = t.tweet_id
          AND v.qualification_status = 'QUALIFIED'
      ) AS view_count

    FROM tweets t

    JOIN users u
      ON u.users_id = t.user_id

    LEFT JOIN tweets reply_parent
      ON reply_parent.tweet_id = t.is_reply_to

    LEFT JOIN users reply_parent_author
      ON reply_parent_author.users_id = reply_parent.user_id

    LEFT JOIN bhid_profile_cache reply_parent_profile
      ON reply_parent_profile.bhid_sub = reply_parent_author.bhid_sub

    WHERE t.tweet_id = $1
      AND t.is_deleted = FALSE
      AND t.deleted_at IS NULL
      AND t.published_at IS NOT NULL;
  `;

  const result = await db.query(query, [tweetId]);

  const tweet = result.rows[0];

  if (tweet) {
    await attachMentions([tweet]);
  }

  return tweet;
};

// ==================== USER TWEETS ====================

const getUserTweets = async (
  userId,
  limit = 20,
  offset = 0,
) => {
  const safeLimit = Math.min(
    Math.max(Number(limit) || 20, 1),
    51,
  );

  const safeOffset = Math.max(Number(offset) || 0, 0);

  const query = `
    SELECT
      t.*,

      u.bhid_sub AS author_sub,

      reply_parent_author.bhid_sub AS reply_to_author_sub,
      reply_parent_profile.preferred_username AS reply_to_author_username,

      (
        SELECT COUNT(*)
        FROM likes l
        WHERE l.tweet_id = t.tweet_id
      ) AS like_count,

      (
        SELECT COUNT(*)
        FROM tweets r
        WHERE r.is_reply_to = t.tweet_id
          AND r.is_deleted = FALSE
          AND r.deleted_at IS NULL
          AND r.published_at IS NOT NULL
      ) AS reply_count,

      (
        SELECT COUNT(*)
        FROM retweets rt
        WHERE rt.original_tweet_id = t.tweet_id
      ) AS retweet_count,

      (
        SELECT COUNT(*)
        FROM tweet_views v
        WHERE v.tweet_id = t.tweet_id
          AND v.qualification_status = 'QUALIFIED'
      ) AS view_count

    FROM tweets t

    JOIN users u
      ON u.users_id = t.user_id

    LEFT JOIN tweets reply_parent
      ON reply_parent.tweet_id = t.is_reply_to

    LEFT JOIN users reply_parent_author
      ON reply_parent_author.users_id = reply_parent.user_id

    LEFT JOIN bhid_profile_cache reply_parent_profile
      ON reply_parent_profile.bhid_sub = reply_parent_author.bhid_sub

    WHERE t.user_id = $1
      AND t.is_deleted = FALSE
      AND t.deleted_at IS NULL
      AND t.published_at IS NOT NULL

    ORDER BY
      t.is_pinned DESC,
      t.published_at DESC,
      t.tweet_id DESC

    LIMIT $2 OFFSET $3;
  `;

  const result = await db.query(query, [
    userId,
    safeLimit,
    safeOffset,
  ]);

  await attachMedia(result.rows);

  return attachMentions(result.rows);
};

// ==================== SCHEDULED TWEETS ====================

export const getScheduledTweets = async (
  userId,
  limit = 100,
) => {
  const safeLimit = Math.min(
    Math.max(Number(limit) || 100, 1),
    100,
  );

  const result = await db.query(
    `SELECT
       tweet_id::text AS tweet_id,
       content,
       scheduled_at,
       replies_open_at,
       replies_close_at,
       created_at
     FROM tweets
     WHERE user_id = $1
       AND published_at IS NULL
       AND scheduled_at IS NOT NULL
       AND is_deleted = FALSE
       AND deleted_at IS NULL
     ORDER BY scheduled_at ASC, tweet_id ASC
     LIMIT $2`,
    [userId, safeLimit],
  );

  // Attach each scheduled post's existing tweet_media rows
  // for dashboard previews.
  return attachMedia(result.rows);
};

// ==================== SHARED FEED BUILDER ====================

const getFeed = async (
  viewerId,
  limit = 20,
  offset = 0,
  followingOnly = false,
) => {
  const safeLimit = Math.min(
    Math.max(Number(limit) || 20, 1),
    51,
  );

  const safeOffset = Math.max(Number(offset) || 0, 0);

  const query = `
    WITH feed_items AS (

      SELECT
        t.*,

        original_author.bhid_sub AS author_sub,

        NULL::bigint AS feed_retweet_id,
        FALSE AS is_reshare,
        NULL::bigint AS reshared_by_user_id,
        NULL::text AS reshared_by_sub,
        NULL::timestamptz AS reshared_at,
        NULL::text AS reshare_quote_text,

        t.user_id AS feed_actor_id,

        -- A scheduled post enters the feed according to when it was published,
        -- not when its author originally composed it.
        t.published_at AS feed_created_at

      FROM tweets t

      JOIN users original_author
        ON original_author.users_id = t.user_id

      WHERE t.is_deleted = FALSE
        AND t.deleted_at IS NULL
        AND t.published_at IS NOT NULL

      UNION ALL

      SELECT
        t.*,

        original_author.bhid_sub AS author_sub,

        r.retweet_id AS feed_retweet_id,
        TRUE AS is_reshare,
        r.user_id AS reshared_by_user_id,
        resharing_user.bhid_sub AS reshared_by_sub,
        r.created_at AS reshared_at,
        r.quote_text AS reshare_quote_text,

        r.user_id AS feed_actor_id,

        -- Reshares are ordered by the time the reshare itself happened.
        r.created_at AS feed_created_at

      FROM retweets r

      JOIN tweets t
        ON t.tweet_id = r.original_tweet_id

      JOIN users original_author
        ON original_author.users_id = t.user_id

      JOIN users resharing_user
        ON resharing_user.users_id = r.user_id

      WHERE t.is_deleted = FALSE
        AND t.deleted_at IS NULL
        AND t.published_at IS NOT NULL
    )

    SELECT
      feed_items.*,

      reply_parent_author.bhid_sub AS reply_to_author_sub,
      reply_parent_profile.preferred_username AS reply_to_author_username,

      (
        SELECT COUNT(*)
        FROM likes l
        WHERE l.tweet_id = feed_items.tweet_id
      ) AS like_count,

      (
        SELECT COUNT(*)
        FROM tweets r
        WHERE r.is_reply_to = feed_items.tweet_id
          AND r.is_deleted = FALSE
          AND r.deleted_at IS NULL
          AND r.published_at IS NOT NULL
      ) AS reply_count,

      (
        SELECT COUNT(*)
        FROM retweets rt
        WHERE rt.original_tweet_id = feed_items.tweet_id
      ) AS retweet_count,

      (
        SELECT COUNT(*)
        FROM tweet_views v
        WHERE v.tweet_id = feed_items.tweet_id
          AND v.qualification_status = 'QUALIFIED'
      ) AS view_count,

      EXISTS (
        SELECT 1
        FROM likes
        WHERE user_id = $1
          AND tweet_id = feed_items.tweet_id
      ) AS liked_by_user,

      EXISTS (
        SELECT 1
        FROM retweets
        WHERE user_id = $1
          AND original_tweet_id = feed_items.tweet_id
      ) AS retweeted_by_user,

      EXISTS (
        SELECT 1
        FROM follows
        WHERE follower_id = $1
          AND followee_id = feed_items.user_id
      ) AS is_following

    FROM feed_items

    LEFT JOIN tweets reply_parent
      ON reply_parent.tweet_id = feed_items.is_reply_to

    LEFT JOIN users reply_parent_author
      ON reply_parent_author.users_id = reply_parent.user_id

    LEFT JOIN bhid_profile_cache reply_parent_profile
      ON reply_parent_profile.bhid_sub = reply_parent_author.bhid_sub

    WHERE NOT $4::boolean
       OR EXISTS (
            SELECT 1
            FROM follows f
            WHERE f.follower_id = $1
              AND f.followee_id = feed_items.feed_actor_id
       )

    ORDER BY
      feed_items.feed_created_at DESC,
      feed_items.is_reshare DESC,
      COALESCE(
        feed_items.feed_retweet_id,
        feed_items.tweet_id
      ) DESC

    LIMIT $2 OFFSET $3;
  `;

  const { rows } = await db.query(query, [
    viewerId,
    safeLimit,
    safeOffset,
    followingOnly,
  ]);

  await attachMedia(rows);

  return attachMentions(rows);
};

const getHomeFeed = (
  viewerId,
  limit = 20,
  offset = 0,
) => getFeed(viewerId, limit, offset, false);

const getFollowingFeed = (
  viewerId,
  limit = 20,
  offset = 0,
) => getFeed(viewerId, limit, offset, true);

// ==================== DELETE TWEET (SOFT) ====================

const deleteTweet = async (tweetId, userId) => {
  const result = await db.query(
    `UPDATE tweets
     SET is_deleted = TRUE,
         deleted_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE tweet_id = $1
       AND user_id = $2
       AND is_deleted = FALSE
       AND deleted_at IS NULL
     RETURNING tweet_id`,
    [tweetId, userId],
  );

  return result.rows[0];
};

// ==================== UPDATE TWEET ====================

const updateTweet = async (
  tweetId,
  userId,
  content,
) => {
  const client = await pool.connect();

  let mentionNotifications = [];

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE tweets
       SET content = $1,
           updated_at = CURRENT_TIMESTAMP,
           edited_at = CASE
             WHEN content IS DISTINCT FROM $1
               THEN CURRENT_TIMESTAMP
             ELSE edited_at
           END
       WHERE tweet_id = $2
         AND user_id = $3
         AND is_deleted = FALSE
         AND deleted_at IS NULL
         AND published_at IS NOT NULL
       RETURNING *`,
      [content, tweetId, userId],
    );

    const tweet = result.rows[0] ?? null;

    if (!tweet) {
      await client.query('COMMIT');
      return null;
    }

    await syncTweetMentions(
      client,
      tweetId,
      content,
    );

    mentionNotifications = await notifyPendingTweetMentions(
      client,
      tweetId,
      userId,
    );

    await client.query('COMMIT');

    await dispatchMentionNotifications(
      mentionNotifications,
    );

    return tweet;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Post edit transaction rollback failed:', {
        errorName:
          rollbackError instanceof Error
            ? rollbackError.name
            : 'NonError',
      });
    }

    throw error;
  } finally {
    client.release();
  }
};

export {
  getTweetById,
  getTweetWithReplies,
  getThreadedRepliesForTweet,
  getUserTweets,
  getHomeFeed,
  deleteTweet,
  getFollowingFeed,
  getScheduledTweets,
  updateTweet,
};