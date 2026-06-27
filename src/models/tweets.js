import { db } from "./db.js"

// ==================== TWEET MODELS ====================

// Create Tweet
const createTweet = async (userId, content, mediaUrls = null, isReplyTo = null) => {

    const query = `
        INSERT INTO tweets (user_id, content, media_url, is_reply_to)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
    `;
    const result = await db.query(query, [userId, content, mediaUrls, isReplyTo]);

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
    getFollowingFeed
};