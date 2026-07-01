import { db } from "./db.js";

const createNotification = async (userId, actorId, type, tweetId = null, client = null) => {
    const query = `
        INSERT INTO notifications (user_id, actor_id, type, tweet_id)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
    `;
    const executor = client || db;
    const result = await executor.query(query, [userId, actorId, type, tweetId]);
    return result.rows[0];
};

const getNotifications = async (userId, limit = 20) => {
    const query = `
        SELECT n.*, 
               u.username as actor_username, 
               u.display_name as actor_display_name,
               u.profile_picture_url as actor_profile_picture,
               t.content as tweet_content
        FROM notifications n
        JOIN users u ON n.actor_id = u.users_id
        LEFT JOIN tweets t ON n.tweet_id = t.tweet_id
        WHERE n.user_id = $1
        ORDER BY n.created_at DESC
        LIMIT $2;
    `;
    const result = await db.query(query, [userId, limit]);
    return result.rows;
};

const markAsRead = async (notificationId, userId) => {
    const query = `
        UPDATE notifications 
        SET read = TRUE 
        WHERE notifications_id = $1 AND user_id = $2;
    `;
    await db.query(query, [notificationId, userId]);
};

export { createNotification, getNotifications, markAsRead };