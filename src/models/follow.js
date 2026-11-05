import { db } from "./db.js";
import { createNotification } from "./notification.js";

// Follow a user
export const followUser = async (followerId, followeeId) => {
    if (String(followerId) === String(followeeId)) {
        throw new Error('A user cannot follow themselves');
    }

    const result = await db.query(`
        INSERT INTO follows (follower_id, followee_id)
        VALUES ($1, $2)
        ON CONFLICT (follower_id, followee_id) DO NOTHING
        RETURNING follower_id
    `, [followerId, followeeId]);

    if (result.rows.length > 0) {
        await createNotification(followeeId, followerId, 'follow', null);
    }

    return { following: true, alreadyExists: result.rows.length === 0 };
};

// Unfollow
export const unfollowUser = async (followerId, followeeId) => {
    if (String(followerId) === String(followeeId)) {
        throw new Error('A user cannot unfollow themselves');
    }

    const result = await db.query(`
        DELETE FROM follows
        WHERE follower_id = $1 AND followee_id = $2
        RETURNING *
    `, [followerId, followeeId]);

    return {
        following: false,
        removed: result.rows.length > 0
    };
};

// Improved - Get users that this user is following
export const getFollowing = async (userId, limit = 20, offset = 0, viewerId = null) => {
    const query = `
        SELECT 
            u.users_id,
            u.bhid_sub,
            COALESCE(fc.follower_count, 0) AS follower_count,
            COALESCE(fc.following_count, 0) AS following_count,
            COALESCE(pc.post_count, 0) AS tweet_count,
            EXISTS (
                SELECT 1 FROM follows f2
                WHERE f2.follower_id = $3::BIGINT
                  AND f2.followee_id = u.users_id
            ) AS is_following
        FROM follows f
        JOIN users u ON f.followee_id = u.users_id
        LEFT JOIN user_follow_counts fc ON fc.users_id = u.users_id
        LEFT JOIN user_post_counts pc ON pc.users_id = u.users_id
        WHERE f.follower_id = $1
          AND u.app_status <> 'DEACTIVATED'
        ORDER BY f.created_at DESC
        LIMIT $2 OFFSET $4;
    `;

    const result = await db.query(query, [userId, limit, viewerId, offset]);
    return result.rows;
};

// Improved - Get followers of this user
export const getFollowers = async (userId, limit = 20, offset = 0, viewerId = null) => {
    const query = `
        SELECT 
            u.users_id,
            u.bhid_sub,
            COALESCE(fc.follower_count, 0) AS follower_count,
            COALESCE(fc.following_count, 0) AS following_count,
            COALESCE(pc.post_count, 0) AS tweet_count,
            EXISTS (
                SELECT 1 FROM follows f2
                WHERE f2.follower_id = $3::BIGINT
                  AND f2.followee_id = u.users_id
            ) AS is_following
        FROM follows f
        JOIN users u ON f.follower_id = u.users_id
        LEFT JOIN user_follow_counts fc ON fc.users_id = u.users_id
        LEFT JOIN user_post_counts pc ON pc.users_id = u.users_id
        WHERE f.followee_id = $1
          AND u.app_status <> 'DEACTIVATED'
        ORDER BY f.created_at DESC
        LIMIT $2 OFFSET $4;
    `;

    const result = await db.query(query, [userId, limit, viewerId, offset]);
    return result.rows;
};
