import { pool } from './db.js';
import { createNotification } from './notification.js';

/**
 * Creates an immediate or scheduled post/reply and persists media.
 * @param {number|string} userId
 * @param {string} content
 * @param {number|string|null} [isReplyTo]
 * @param {Array<object>} [media]
 * @param {{scheduledAt?: Date|null, repliesOpenAt?: Date|null, repliesCloseAt?: Date|null}} [options]
 */
export const createTweetWithExtras = async (
    userId,
    content,
    isReplyTo = null,
    media = [],
    options = {},
) => {
    let client;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Re-check reply availability inside the transaction to avoid a race
        // between the route's validation and this insert.
        let replyRecipientId = null;
        if (isReplyTo !== null && isReplyTo !== undefined) {
            const parentResult = await client.query(
                `SELECT
                    user_id,
                    (published_at IS NOT NULL
                     AND is_deleted = FALSE
                     AND deleted_at IS NULL
                     AND (replies_open_at IS NULL OR replies_open_at <= CURRENT_TIMESTAMP)
                     AND (replies_close_at IS NULL OR replies_close_at > CURRENT_TIMESTAMP)) AS can_reply,
                    (replies_open_at IS NOT NULL AND replies_open_at > CURRENT_TIMESTAMP) AS not_open_yet
                 FROM tweets
                 WHERE tweet_id = $1
                 FOR SHARE`,
                [isReplyTo],
            );

            const parent = parentResult.rows[0];
            if (!parent) {
                const error = new Error('REPLIES_CLOSED');
                throw error;
            }
            if (!parent.can_reply) {
                throw new Error(parent.not_open_yet ? 'REPLIES_NOT_OPEN' : 'REPLIES_CLOSED');
            }
            replyRecipientId = parent.user_id;
        }

        const scheduledAt = options.scheduledAt ?? null;
        const repliesOpenAt = options.repliesOpenAt ?? null;
        const repliesCloseAt = options.repliesCloseAt ?? null;

        const tweetResult = await client.query(
            `INSERT INTO tweets (
                user_id,
                content,
                visibility,
                is_reply_to,
                scheduled_at,
                published_at,
                replies_open_at,
                replies_close_at
             )
             SELECT
                users_id,
                $2,
                'PUBLIC',
                $3,
                $4,
                CASE WHEN $4::timestamptz IS NULL THEN CURRENT_TIMESTAMP ELSE NULL END,
                $5,
                $6
             FROM users
             WHERE users_id = $1
               AND app_status = 'ACTIVE'
             RETURNING *`,
            [userId, content, isReplyTo, scheduledAt, repliesOpenAt, repliesCloseAt],
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
                ],
            );
        }

        // Replies notify the original post owner in the same transaction.
        if (replyRecipientId != null && String(replyRecipientId) !== String(userId)) {
            await createNotification(
                replyRecipientId,
                userId,
                'reply',
                isReplyTo,
                client,
            );
        }

        await client.query('COMMIT');
        return tweet;
    } catch (error) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('Tweet transaction rollback failed:', {
                    errorName: rollbackError instanceof Error ? rollbackError.name : 'NonError',
                });
            }
        }
        throw error;
    } finally {
        if (client) client.release();
    }
};
