import { db } from "./db.js";

const likeTweet = async (userId, tweetId) => {
    const query = `
        INSERT INTO likes (user_id, tweet_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        RETURNING *;
    `;
    const result = await db.query(query, [userId, tweetId]);
    return result.rows[0];
};

const unlikeTweet = async (userId, tweetId) => {
    const query = `
        DELETE FROM likes 
        WHERE user_id = $1 AND tweet_id = $2 
        RETURNING *;
    `;
    const result = await db.query(query, [userId, tweetId]);
    return result.rows[0];
};

export { likeTweet, unlikeTweet };