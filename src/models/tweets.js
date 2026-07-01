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
              AND t.deleted_at IS NULL

            UNION ALL

            -- Replies to replies
            SELECT 
                child.*,
                parent.depth + 1
            FROM tweets child
            JOIN reply_tree parent
              ON child.is_reply_to = parent.tweet_id
            WHERE child.deleted_at IS NULL
        )
        SELECT 
            rt.*,
            u.username,
            u.display_name,
            u.profile_picture_url,
            u.verified,

            -- replying to info
            pu.username AS replying_to_username,

            -- counts
            COALESCE((SELECT COUNT(*) FROM likes l WHERE l.tweet_id = rt.tweet_id), 0) AS like_count,
            COALESCE((SELECT COUNT(*) FROM tweets r WHERE r.is_reply_to = rt.tweet_id), 0) AS reply_count,

            -- viewer interaction
            EXISTS (
                SELECT 1 FROM likes
                WHERE tweet_id = rt.tweet_id
                  AND user_id = $2
            ) AS liked_by_user

        FROM reply_tree rt
        JOIN users u ON rt.user_id = u.users_id
        LEFT JOIN tweets parent ON parent.tweet_id = rt.is_reply_to
        LEFT JOIN users pu ON pu.users_id = parent.user_id
        ORDER BY rt.created_at ASC;
    `;

    const { rows } = await db.query(query, [tweetId, viewerId]);
    return buildReplyTree(rows);
};

// ==================== SINGLE TWEET + THREAD ====================

export const getTweetWithReplies = async (tweetId, viewerId = null) => {
    const mainQuery = `
        SELECT 
            t.*,
            u.username,
            u.display_name,
            u.profile_picture_url,
            u.verified,

            COALESCE((SELECT COUNT(*) FROM likes l WHERE l.tweet_id = t.tweet_id), 0) AS like_count,
            COALESCE((SELECT COUNT(*) FROM tweets r WHERE r.is_reply_to = t.tweet_id), 0) AS reply_count,
            COALESCE((SELECT COUNT(*) FROM retweets rt WHERE rt.original_tweet_id = t.tweet_id), 0) AS retweet_count,

            EXISTS (
                SELECT 1 FROM likes
                WHERE tweet_id = t.tweet_id
                  AND user_id = $2
            ) AS liked_by_user
        FROM tweets t
        JOIN users u ON t.user_id = u.users_id
        WHERE t.tweet_id = $1
          AND t.deleted_at IS NULL;
    `;

    const mainResult = await db.query(mainQuery, [tweetId, viewerId]);
    const tweet = mainResult.rows[0];
    if (!tweet) return null;

    const replies = await getThreadedRepliesForTweet(tweetId, viewerId);

    return {
        ...tweet,
        replies
    };
};

// Create tweet (or reply)
const createTweet = async (userId, content, mediaUrl = null, isReplyTo = null) => {
    const mediaArray = mediaUrl ? [mediaUrl] : null;

    const query = `
        INSERT INTO tweets (user_id, content, media_url, is_reply_to)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
    `;

    const result = await db.query(query, [userId, content, mediaArray, isReplyTo]);
    return result.rows[0];
};

// Get single tweet
const getTweetById = async (tweetId) => {
    const query = `
        SELECT t.*,
               u.username,
               u.display_name,
               u.profile_picture_url,
               u.verified
        FROM tweets t
        JOIN users u ON t.user_id = u.users_id
        WHERE t.tweet_id = $1
          AND t.deleted_at IS NULL;
    `;

    const result = await db.query(query, [tweetId]);
    return result.rows[0];
};

// Get user tweets
const getUserTweets = async (userId, limit = 20, offset = 0) => {
    const query = `
        SELECT t.*,
               u.username,
               u.display_name,
               u.profile_picture_url,
               u.verified
        FROM tweets t
        JOIN users u ON t.user_id = u.users_id
        WHERE t.user_id = $1
          AND t.deleted_at IS NULL
        ORDER BY t.created_at DESC
        LIMIT $2 OFFSET $3;
    `;

    const result = await db.query(query, [userId, limit, offset]);
    return result.rows;
};

// Get home feed
const getHomeFeed = async (viewerId, limit = 20, offset = 0) => {
    const query = `
        SELECT 
            t.*,
            u.username,
            u.display_name,
            u.profile_picture_url,
            u.verified,

            -- likes
            (SELECT COUNT(*) FROM likes l WHERE l.tweet_id = t.tweet_id) AS like_count,

            -- replies
            (SELECT COUNT(*) FROM tweets r WHERE r.is_reply_to = t.tweet_id) AS reply_count,

            -- viewer interaction
            EXISTS (
                SELECT 1 FROM likes
                WHERE user_id = $1 AND tweet_id = t.tweet_id
            ) AS liked_by_user,

            -- follow state
            EXISTS (
                SELECT 1 FROM follows f
                WHERE f.follower_id = $1
                  AND f.followee_id = t.user_id
            ) AS is_following

        FROM tweets t
        JOIN users u ON t.user_id = u.users_id
        WHERE t.deleted_at IS NULL
        ORDER BY u.verified DESC, t.created_at DESC
        LIMIT $2 OFFSET $3;
    `;

    const result = await db.query(query, [viewerId, limit, offset]);
    return result.rows;
};

// Delete tweet (soft)
const deleteTweet = async (tweetId, userId) => {
    const query = `
        UPDATE tweets
        SET deleted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE tweet_id = $1 AND user_id = $2
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
            edited_at = CURRENT_TIMESTAMP
        WHERE tweet_id = $2
          AND user_id = $3
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
            u.username,
            u.display_name,
            u.profile_picture_url,
            u.verified,

            (SELECT COUNT(*) FROM likes l WHERE l.tweet_id = t.tweet_id) AS like_count,
            (SELECT COUNT(*) FROM tweets r WHERE r.is_reply_to = t.tweet_id) AS reply_count,

            EXISTS (
                SELECT 1 FROM likes
                WHERE user_id = $1 AND tweet_id = t.tweet_id
            ) AS liked_by_user,

            TRUE AS is_following
        FROM tweets t
        JOIN users u ON t.user_id = u.users_id
        JOIN follows f ON f.followee_id = t.user_id
        WHERE f.follower_id = $1
          AND t.deleted_at IS NULL
        ORDER BY t.created_at DESC
        LIMIT $2 OFFSET $3;
    `;

    const result = await db.query(query, [viewerId, limit, offset]);
    return result.rows;
};

export {
    createTweet,
    getTweetById,
    getUserTweets,
    getHomeFeed,
    deleteTweet,
    getFollowingFeed,
    updateTweet
};