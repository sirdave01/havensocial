import { pool } from "./db.js";
import { createNotification } from "./notification.js";

// IMPORTANT: we move tweet insert here so we can use the SAME client
/**
 * @param {number|string} userId
 * @param {string} content
 * @param {number|string|null} [isReplyTo]
 */
export const createTweetWithExtras = async (
    userId,
    content,
    isReplyTo = null,
    media = []
) => {

    let client;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        console.log('🔄 Creating tweet with extras:', {
            userId,
            isReplyTo
        });

        // ===================== CREATE TWEET =====================
        const tweetResult = await client.query(
            `
            INSERT INTO tweets (
                user_id,
                content,
                visibility,
                is_reply_to
            )
            SELECT users_id, $2, 'PUBLIC', $3
            FROM users
            WHERE users_id = $1
              AND app_status = 'ACTIVE'
            RETURNING *;
            `,
            [userId, content, isReplyTo]
        );

        const tweet = tweetResult.rows[0];
        if (!tweet) {
            await client.query('ROLLBACK');
            return null;
        }

        for (const [position, attachment] of media.entries()) {
            await client.query(
                `INSERT INTO tweet_media (
                    tweet_id, storage_key, media_url, media_type,
                    mime_type, file_size, alt_text, position
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    tweet.tweet_id,
                    attachment.key,
                    attachment.url,
                    attachment.mediaType,
                    attachment.mimeType,
                    attachment.fileSize,
                    attachment.altText,
                    position,
                ]
            );
        }

        // ===================== REPLY NOTIFICATION =====================
        if (isReplyTo && tweet) {
            // Fetch original tweet owner for notification (inside transaction)
            const originalResult = await client.query(
                `SELECT user_id FROM tweets 
                 WHERE tweet_id = $1 AND is_deleted = FALSE AND deleted_at IS NULL`,
                [isReplyTo]
            );

            const originalTweet = originalResult.rows[0];

            if (originalTweet && String(originalTweet.user_id) !== String(userId)) {
                await createNotification(
                    originalTweet.user_id,
                    userId,
                    'reply',
                    isReplyTo,
                    client
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