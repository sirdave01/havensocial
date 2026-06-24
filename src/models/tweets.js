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
        SELECT t.*, u.username, u.display_name
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
const getHomeFeed = async (userId, limit = 20, offset = 0) => {

    const query = `
        SELECT 
            t.*,
            u.username, 
            u.display_name, 
            u.profile_picture_url, 
            u.verified,
            COUNT(l.user_id) AS like_count,
            COUNT(r.user_id) AS reply_count
        FROM tweets t
        JOIN users u ON t.user_id = u.users_id
        LEFT JOIN likes l ON l.tweet_id = t.tweet_id
        LEFT JOIN tweets r ON r.is_reply_to = t.tweet_id
        WHERE t.deleted_at IS NULL
          AND (t.user_id = $1 
               OR t.user_id IN (SELECT followee_id FROM follows WHERE follower_id = $1))
        GROUP BY t.tweet_id, u.users_id
        ORDER BY t.created_at DESC
        LIMIT $2 OFFSET $3;
    `;

    const result = await db.query(query, [userId, limit, offset]);

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

export {
    createTweet,
    getTweetById,
    getUserTweets,
    getHomeFeed,
    deleteTweet
};