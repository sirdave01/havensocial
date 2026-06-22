import { db } from "./db.js";
import { createTweet } from "./tweet.js";
import { createNotification } from "./notification.js";

const createTweetWithExtras = async (userId, content, mediaUrls = null, isReplyTo = null) => {
    let client;
    try {
        client = await db.pool.connect();
        await client.query('BEGIN');

        // Create the tweet
        const tweet = await createTweet(userId, content, mediaUrls, isReplyTo);

        // Create notification if it's a reply
        if (isReplyTo) {
            const original = await client.query(
                'SELECT user_id FROM tweets WHERE tweet_id = $1', 
                [isReplyTo]
            );

            if (original.rows.length > 0 && original.rows[0].user_id !== userId) {
                await createNotification(
                    original.rows[0].user_id,
                    userId,
                    'reply',
                    tweet.tweet_id
                );
            }
        }

        await client.query('COMMIT');
        return tweet;

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Tweet service error:', error);
        throw error;
    } finally {
        if (client) client.release();
    }
};

export { createTweetWithExtras };