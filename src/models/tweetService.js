import { pool } from "./db.js";
import { createNotification } from "./notification.js";

// IMPORTANT: we move tweet insert here so we can use the SAME client
export const createTweetWithExtras = async (
    userId,
    content,
    mediaUrl = null,
    isReplyTo = null
) => {

    let client;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        console.log('🔄 Creating tweet with extras:', {
            userId,
            hasMedia: !!mediaUrl,
            isReplyTo
        });

        // ===================== CREATE TWEET =====================
        const tweetResult = await client.query(
            `
            INSERT INTO tweets (
                user_id,
                content,
                media_url,
                is_reply_to
            )
            VALUES ($1, $2, $3, $4)
            RETURNING *;
            `,
            [userId, content, mediaUrl ? [mediaUrl] : null, isReplyTo]
        );

        const tweet = tweetResult.rows[0];

        // ===================== REPLY NOTIFICATION =====================
        if (isReplyTo) {
            await client.query(
                `UPDATE tweets SET reply_count = reply_count + 1 WHERE tweet_id = $1`,
                [isReplyTo]
            );

            // Fetch original tweet owner for notification (inside transaction)
            const originalResult = await client.query(
                `SELECT user_id FROM tweets 
                 WHERE tweet_id = $1 AND deleted_at IS NULL`,
                [isReplyTo]
            );

            const originalTweet = originalResult.rows[0];

            if (originalTweet && originalTweet.user_id !== userId) {
                await createNotification(
                    originalTweet.user_id,
                    userId,
                    'reply',
                    tweet.tweet_id,
                    client // 🔥 pass transaction client (important)
                );
            }
        }

        await client.query('COMMIT');

        console.log('✅ Tweet created successfully:', tweet.tweet_id);

        return tweet;

    } catch (error) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackErr) {
                console.error('Rollback failed:', rollbackErr);
            }
        }

        console.error('❌ Tweet service error:', error.message);
        console.error(error.stack);
        throw error;

    } finally {
        if (client) client.release();
    }
};