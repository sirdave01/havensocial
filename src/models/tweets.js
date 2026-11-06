import { db } from "./db.js";

// ==================== TWEET MODELS ====================

// ==================== HELPERS ====================

const buildReplyTree = (rows) => {
    const map = {};
    const roots = [];

    rows.forEach(row => {
        row.replies = [];
        map[row.tweet_id] = row;
    });

    rows.forEach(row => {
        if (row.is_reply_to && map[row.is_reply_to]) {
            map[row.is_reply_to].replies.push(row);
        } else {
            roots.push(row);
        }
    });

    return roots;
};

const attachMedia = async (rows) => {
    const allRows = [];
    const visit = (row) => {
        allRows.push(row);
        for (const reply of row.replies || []) visit(reply);
    };
    rows.forEach(visit);
    if (!allRows.length) return rows;

    const { rows: mediaRows } = await db.query(
        `SELECT media_id, tweet_id, storage_key, media_url, media_type,
                mime_type, file_size, width, height, duration_seconds, alt_text, position
         FROM tweet_media
         WHERE tweet_id = ANY($1::bigint[])
         ORDER BY tweet_id, position, media_id`,
        [[...new Set(allRows.map((row) => String(row.tweet_id)))]],
    );
    const mediaByTweet = new Map();
    for (const media of mediaRows) {
        const tweetId = String(media.tweet_id);
        const attachments = mediaByTweet.get(tweetId) || [];
        attachments.push(media);
        mediaByTweet.set(tweetId, attachments);
    }
    allRows.forEach((row) => {
        row.media = mediaByTweet.get(String(row.tweet_id)) || [];
    });
    return rows;
};

// ==================== THREADED REPLIES ====================

export const getThreadedRepliesForTweet = async (tweetId, viewerId = null) => {
    const query = `
        WITH RECURSIVE reply_tree AS (
            -- Direct replies
            SELECT 
                t.*,
                1 AS depth
            FROM tweets t
            WHERE t.is_reply_to = $1
              AND t.is_deleted = FALSE
              AND t.deleted_at IS NULL

            UNION ALL

            -- Replies to replies
            SELECT 
                child.*,
                parent.depth + 1
            FROM tweets child
            JOIN reply_tree parent
              ON child.is_reply_to = parent.tweet_id
            WHERE child.is_deleted = FALSE
              AND child.deleted_at IS NULL
        )
        SELECT 
            rt.*,
            u.bhid_sub AS author_sub,

            -- counts
            COALESCE((SELECT COUNT(*) FROM likes l WHERE l.tweet_id = rt.tweet_id), 0) AS like_count,
            COALESCE((SELECT COUNT(*) FROM tweets r
                      WHERE r.is_reply_to = rt.tweet_id
                        AND r.is_deleted = FALSE
                        AND r.deleted_at IS NULL), 0) AS reply_count,
            COALESCE((SELECT COUNT(*) FROM retweets r
                      WHERE r.original_tweet_id = rt.tweet_id), 0) AS retweet_count,
            COALESCE((SELECT COUNT(*) FROM tweet_views v
                      WHERE v.tweet_id = rt.tweet_id), 0) AS view_count,

            -- viewer interaction
            EXISTS (
                SELECT 1 FROM likes
                WHERE tweet_id = rt.tweet_id
                  AND user_id = $2
            ) AS liked_by_user,
            EXISTS (
                SELECT 1 FROM retweets
                WHERE original_tweet_id = rt.tweet_id
                  AND user_id = $2
            ) AS retweeted_by_user,
            EXISTS (
                SELECT 1 FROM follows
                WHERE follower_id = $2
                  AND followee_id = rt.user_id
            ) AS is_following

        FROM reply_tree rt
        JOIN users u ON u.users_id = rt.user_id
        ORDER BY rt.created_at ASC;
    `;

    const { rows } = await db.query(query, [tweetId, viewerId]);
    return attachMedia(buildReplyTree(rows));
};

// ==================== SINGLE TWEET + THREAD ====================

export const getTweetWithReplies = async (tweetId, viewerId = null) => {
    const mainQuery = `
        SELECT 
            t.*,
            u.bhid_sub AS author_sub,

            COALESCE((SELECT COUNT(*) FROM likes l WHERE l.tweet_id = t.tweet_id), 0) AS like_count,
            COALESCE((SELECT COUNT(*) FROM tweets r
                      WHERE r.is_reply_to = t.tweet_id
                        AND r.is_deleted = FALSE
                        AND r.deleted_at IS NULL), 0) AS reply_count,
            COALESCE((SELECT COUNT(*) FROM retweets rt WHERE rt.original_tweet_id = t.tweet_id), 0) AS retweet_count,
            COALESCE((SELECT COUNT(*) FROM tweet_views v WHERE v.tweet_id = t.tweet_id), 0) AS view_count,

            EXISTS (
                SELECT 1 FROM likes
                WHERE tweet_id = t.tweet_id
                  AND user_id = $2
            ) AS liked_by_user,
            EXISTS (
                SELECT 1 FROM retweets
                WHERE original_tweet_id = t.tweet_id
                  AND user_id = $2
            ) AS retweeted_by_user,
            EXISTS (
                SELECT 1 FROM follows
                WHERE follower_id = $2
                  AND followee_id = t.user_id
            ) AS is_following
        FROM tweets t
        JOIN users u ON u.users_id = t.user_id
        WHERE t.tweet_id = $1
          AND t.is_deleted = FALSE
          AND t.deleted_at IS NULL;
    `;

    const mainResult = await db.query(mainQuery, [tweetId, viewerId]);
    const tweet = mainResult.rows[0];
    if (!tweet) return null;

    const replies = await getThreadedRepliesForTweet(tweetId, viewerId);
    await attachMedia([tweet]);

    return {
        ...tweet,
        replies
    };
};

// Get single tweet
const getTweetById = async (tweetId) => {
    const query = `
        SELECT
            t.*,
            u.bhid_sub AS author_sub,
            COALESCE(
                (SELECT COUNT(*)
                FROM tweet_views v
                WHERE v.tweet_id = t.tweet_id),
                0
            ) AS view_count
        FROM tweets t
        JOIN users u ON u.users_id = t.user_id
        WHERE t.tweet_id = $1
          AND t.is_deleted = FALSE
          AND t.deleted_at IS NULL;
    `;

    const result = await db.query(query, [tweetId]);
    return result.rows[0];
};

// Get user tweets
const getUserTweets = async (userId, limit = 20, offset = 0) => {
    const query = `
        SELECT
            t.*,
            u.bhid_sub AS author_sub,
            (SELECT COUNT(*) FROM likes l WHERE l.tweet_id = t.tweet_id) AS like_count,
            (SELECT COUNT(*) FROM tweets r
             WHERE r.is_reply_to = t.tweet_id
               AND r.is_deleted = FALSE
               AND r.deleted_at IS NULL) AS reply_count,
            (SELECT COUNT(*) FROM retweets rt WHERE rt.original_tweet_id = t.tweet_id) AS retweet_count,
            (SELECT COUNT(*) FROM tweet_views v WHERE v.tweet_id = t.tweet_id) AS view_count
        FROM tweets t
        JOIN users u ON u.users_id = t.user_id
        WHERE t.user_id = $1
          AND t.is_deleted = FALSE
          AND t.deleted_at IS NULL
        ORDER BY t.created_at DESC
        LIMIT $2 OFFSET $3;
    `;

    const result = await db.query(query, [userId, limit, offset]);
    return attachMedia(result.rows);
};

// Get home feed
const getHomeFeed = async (viewerId, limit = 20, offset = 0) => {
    const query = `
        SELECT 
            t.*,
            u.bhid_sub AS author_sub,

            -- likes
            (SELECT COUNT(*) FROM likes l WHERE l.tweet_id = t.tweet_id) AS like_count,

            -- replies
            (SELECT COUNT(*) FROM tweets r
             WHERE r.is_reply_to = t.tweet_id
               AND r.is_deleted = FALSE
               AND r.deleted_at IS NULL) AS reply_count,

            (SELECT COUNT(*) FROM retweets rt WHERE rt.original_tweet_id = t.tweet_id) AS retweet_count,

            (SELECT COUNT(*) FROM tweet_views v WHERE v.tweet_id = t.tweet_id) AS view_count,

            -- viewer interaction
            EXISTS (
                SELECT 1 FROM likes
                WHERE user_id = $1 AND tweet_id = t.tweet_id
            ) AS liked_by_user,

            EXISTS (
                SELECT 1 FROM retweets
                WHERE user_id = $1 AND original_tweet_id = t.tweet_id
            ) AS retweeted_by_user,

            -- follow state
            EXISTS (
                SELECT 1 FROM follows f
                WHERE f.follower_id = $1
                  AND f.followee_id = t.user_id
            ) AS is_following

        FROM tweets t
        JOIN users u ON u.users_id = t.user_id
        WHERE t.deleted_at IS NULL
          AND t.is_deleted = FALSE
        ORDER BY t.created_at DESC
        LIMIT $2 OFFSET $3;
    `;

    const result = await db.query(query, [viewerId, limit, offset]);
    return attachMedia(result.rows);
};

// Delete tweet (soft)
const deleteTweet = async (tweetId, userId) => {
    const query = `
        UPDATE tweets
        SET is_deleted = TRUE,
            deleted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE tweet_id = $1 AND user_id = $2
          AND is_deleted = FALSE
          AND deleted_at IS NULL
        RETURNING tweet_id;
    `;

    const result = await db.query(query, [tweetId, userId]);
    return result.rows[0];
};

// Update tweet
const updateTweet = async (tweetId, userId, content) => {
    const query = `
        UPDATE tweets
        SET content = $1,
            updated_at = CURRENT_TIMESTAMP,
            edited_at = CASE
                WHEN content IS DISTINCT FROM $1 THEN CURRENT_TIMESTAMP
                ELSE edited_at
            END
        WHERE tweet_id = $2
          AND user_id = $3
          AND is_deleted = FALSE
          AND deleted_at IS NULL
        RETURNING *;
    `;

    const result = await db.query(query, [content, tweetId, userId]);
    return result.rows[0];
};

// Following feed
const getFollowingFeed = async (viewerId, limit = 20, offset = 0) => {
    const query = `
        SELECT 
            t.*,
            u.bhid_sub AS author_sub,

            (SELECT COUNT(*) FROM likes l WHERE l.tweet_id = t.tweet_id) AS like_count,
            (SELECT COUNT(*) FROM tweets r
             WHERE r.is_reply_to = t.tweet_id
               AND r.is_deleted = FALSE
               AND r.deleted_at IS NULL) AS reply_count,
            (SELECT COUNT(*) FROM retweets rt WHERE rt.original_tweet_id = t.tweet_id) AS retweet_count,
            (SELECT COUNT(*) FROM tweet_views v WHERE v.tweet_id = t.tweet_id) AS view_count,

            EXISTS (
                SELECT 1 FROM likes
                WHERE user_id = $1 AND tweet_id = t.tweet_id
            ) AS liked_by_user,

            EXISTS (
                SELECT 1 FROM retweets
                WHERE user_id = $1 AND original_tweet_id = t.tweet_id
            ) AS retweeted_by_user,

            TRUE AS is_following
        FROM tweets t
        JOIN users u ON u.users_id = t.user_id
        JOIN follows f ON f.followee_id = t.user_id
        WHERE f.follower_id = $1
          AND t.is_deleted = FALSE
          AND t.deleted_at IS NULL
        ORDER BY t.created_at DESC
        LIMIT $2 OFFSET $3;
    `;

    const result = await db.query(query, [viewerId, limit, offset]);
    return attachMedia(result.rows);
};

export {
    getTweetById,
    getUserTweets,
    getHomeFeed,
    deleteTweet,
    getFollowingFeed,
    updateTweet
};