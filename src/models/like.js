
import { db } from "./db.js";

// ==================== LIKE A POST ====================

const likeTweet = async (userId, tweetId) => {
    const query = `
        INSERT INTO likes (user_id, tweet_id)

        SELECT
            u.users_id,
            t.tweet_id

        FROM users u

        JOIN tweets t
          ON t.tweet_id = $2

        WHERE u.users_id = $1
          AND u.app_status = 'ACTIVE'
          AND t.is_deleted = FALSE
          AND t.deleted_at IS NULL

        ON CONFLICT DO NOTHING

        RETURNING *;
    `;

    const result = await db.query(query, [
        userId,
        tweetId,
    ]);

    return result.rows[0] ?? null;
};

// ==================== UNLIKE A POST ====================

const unlikeTweet = async (userId, tweetId) => {
    const query = `
        DELETE FROM likes
        WHERE user_id = $1
          AND tweet_id = $2
        RETURNING *;
    `;

    const result = await db.query(query, [
        userId,
        tweetId,
    ]);

    return result.rows[0] ?? null;
};

export {
    likeTweet,
    unlikeTweet,
};
