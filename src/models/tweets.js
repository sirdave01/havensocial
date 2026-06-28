import { db } from "./db.js"

// ==================== TWEET MODELS ====================

// Get Single Tweet + Replies (for detail page)
export const getTweetWithReplies = async (tweetId) => {
    // Main tweet with full user info + counts
    const mainQuery = `
        SELECT 
            t.*,
            u.username,
            u.display_name,
            u.profile_picture_url,
            u.verified,

            -- Counts
            COALESCE((SELECT COUNT(*) FROM likes l WHERE l.tweet_id = t.tweet_id), 0) AS like_count,
            COALESCE((SELECT COUNT(*) FROM tweets r WHERE r.is_reply_to = t.tweet_id), 0) AS reply_count,
            COALESCE((SELECT COUNT(*) FROM retweets rt WHERE rt.original_tweet_id = t.tweet_id), 0) AS retweet_count,

            -- Viewer interaction (if we pass viewerId later)
            FALSE AS liked_by_user
        FROM tweets t
        JOIN users u ON t.user_id = u.users_id
        WHERE t.tweet_id = $1 
          AND t.deleted_at IS NULL;
    `;

    const mainResult = await db.query(mainQuery, [tweetId]);
    const tweet = mainResult.rows[0];

    if (!tweet) return null;

    // Fetch replies (direct replies only, ordered by newest)
    const repliesQuery = `
        SELECT 
            t.*,
            u.username,
            u.display_name,
            u.profile_picture_url,
            u.verified,
            COALESCE((SELECT COUNT(*) FROM likes l WHERE l.tweet_id = t.tweet_id), 0) AS like_count,
            COALESCE((SELECT COUNT(*) FROM tweets r WHERE r.is_reply_to = t.tweet_id), 0) AS reply_count
        FROM tweets t
        JOIN users u ON t.user_id = u.users_id
        WHERE t.is_reply_to = $1 
          AND t.deleted_at IS NULL
        ORDER BY t.created_at DESC
        LIMIT 50;
    `;

    const repliesResult = await db.query(repliesQuery, [tweetId]);
    const replies = repliesResult.rows;

    return {
        ...tweet,
        replies
    };
};

// Create Tweet - Future-proof for multiple media
const createTweet = async (userId, content, mediaUrl = null, isReplyTo = null) => {
    // Convert single URL to array for DB (TEXT[])
    const mediaArray = mediaUrl ? [mediaUrl] : null;

    const query = `
        INSERT INTO tweets (
            user_id, 
            content, 
            media_url, 
            is_reply_to
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *;
    `;

    const result = await db.query(query, [userId, content, mediaArray, isReplyTo]);

    return result.rows[0];
};

// Get Single Tweet
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

// Get User Tweets
const getUserTweets = async (userId, limit = 20, offset = 0) => {

    const query = `
        SELECT t.*, 
               u.username, 
               u.display_name, 
               u.profile_picture_url,     -- ← This was missing
               u.verified                 -- ← Nice to have for the badge
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

// Get Home Feed
const getHomeFeed = async (viewerId, limit = 20, offset = 0) => {
  const query = `
    SELECT 
      t.*,
      u.username, 
      u.display_name, 
      u.profile_picture_url, 
      u.verified,

      -- likes count
      (
        SELECT COUNT(*) 
        FROM likes l 
        WHERE l.tweet_id = t.tweet_id
      ) AS like_count,

      -- reply count
      (
        SELECT COUNT(*)
        FROM tweets r
        WHERE r.is_reply_to = t.tweet_id
      ) AS reply_count,

      -- liked by viewer
      EXISTS (
        SELECT 1 
        FROM likes 
        WHERE user_id = $1 AND tweet_id = t.tweet_id
      ) AS liked_by_user,

      -- 🔥 FOLLOW STATE (THIS FIXES REFRESH)
      EXISTS (
        SELECT 1
        FROM follows f
        WHERE f.follower_id = $1
          AND f.followee_id = t.user_id
      ) AS is_following

    FROM tweets t
    JOIN users u ON t.user_id = u.users_id
    WHERE t.deleted_at IS NULL
    ORDER BY 
      u.verified DESC,
      t.created_at DESC
    LIMIT $2 OFFSET $3;
  `;

  const result = await db.query(query, [viewerId, limit, offset]);
  return result.rows;
};

// Soft Delete Tweet
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

// ==================== UPDATE TWEET ====================
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

    const result = await db.query(query, [
        content,
        tweetId,
        userId
    ]);

    return result.rows[0];
};


const getFollowingFeed = async (viewerId, limit = 20, offset = 0) => {
  const query = `
    SELECT
      t.*,
      u.username,
      u.display_name,
      u.profile_picture_url,
      u.verified,

      -- likes count
      (
        SELECT COUNT(*)
        FROM likes l
        WHERE l.tweet_id = t.tweet_id
      ) AS like_count,

      -- reply count
      (
        SELECT COUNT(*)
        FROM tweets r
        WHERE r.is_reply_to = t.tweet_id
      ) AS reply_count,

      -- liked by viewer
      EXISTS (
        SELECT 1
        FROM likes
        WHERE user_id = $1 AND tweet_id = t.tweet_id
      ) AS liked_by_user,

      -- 🔥 FOLLOW STATE (CONSISTENT)
      TRUE AS is_following

    FROM tweets t
    JOIN users u ON t.user_id = u.users_id
    JOIN follows f ON f.followee_id = t.user_id
    WHERE
      f.follower_id = $1
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