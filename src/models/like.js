import { db } from './db.js';
import { createNotification } from './notification.js';

// ==================== LIKE A POST ====================

const likeTweet = async (userId, tweetId) => {
  const query = `
    WITH inserted_like AS (
      INSERT INTO likes (user_id, tweet_id)
      SELECT
        u.users_id,
        t.tweet_id
      FROM users u
      JOIN tweets t ON t.tweet_id = $2
      WHERE u.users_id = $1
        AND u.app_status = 'ACTIVE'
        AND t.is_deleted = FALSE
        AND t.deleted_at IS NULL
      ON CONFLICT DO NOTHING
      RETURNING *
    )
    SELECT
      inserted_like.*,
      t.user_id AS post_author_id
    FROM inserted_like
    JOIN tweets t ON t.tweet_id = inserted_like.tweet_id;
  `;

  const result = await db.query(query, [userId, tweetId]);
  const like = result.rows[0] ?? null;

  // Notify the post owner only when a new like was actually inserted.
  // A failed notification must not undo or misreport the successful like.
  if (like && String(like.post_author_id) !== String(userId)) {
    try {
      await createNotification(
        like.post_author_id,
        userId,
        'like',
        tweetId,
      );
    } catch (error) {
      console.error('Like notification creation failed:', {
        errorName: error instanceof Error ? error.name : 'NonError',
      });
    }
  }

  return like;
};

// ==================== UNLIKE A POST ====================

const unlikeTweet = async (userId, tweetId) => {
  const query = `
    DELETE FROM likes
    WHERE user_id = $1
      AND tweet_id = $2
    RETURNING *;
  `;

  const result = await db.query(query, [userId, tweetId]);
  return result.rows[0] ?? null;
};

export {
  likeTweet,
  unlikeTweet,
};
