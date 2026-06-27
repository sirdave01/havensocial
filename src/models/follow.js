import { db } from "./db.js";

// Follow a user
export const followUser = async (followerId, followeeId) => {

    const existing = await db.query(`
        SELECT 1 FROM follows
        WHERE follower_id = $1 AND followee_id = $2
    `, [followerId, followeeId]);

    if (existing.rows.length > 0) {
        return { following: true, alreadyExists: true };
    }

    await db.query(`
        INSERT INTO follows (follower_id, followee_id)
        VALUES ($1, $2)
    `, [followerId, followeeId]);


    return { following: true, alreadyExists: false };
};

// Unfollow
export const unfollowUser = async (followerId, followeeId) => {

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
            u.username,
            u.display_name,
            u.full_name,
            u.profile_picture_url,
            u.bio,
            u.follower_count,
            u.following_count,
            u.post_count as tweet_count,
            EXISTS (
                SELECT 1 FROM follows f2
                WHERE f2.follower_id = $3::BIGINT
                  AND f2.followee_id = u.users_id
            ) AS is_following
        FROM follows f
        JOIN users u ON f.followee_id = u.users_id
        WHERE f.follower_id = $1
          AND u.deleted_at IS NULL
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
            u.username,
            u.display_name,
            u.full_name,
            u.profile_picture_url,
            u.bio,
            u.follower_count,
            u.following_count,
            u.post_count as tweet_count,
            EXISTS (
                SELECT 1 FROM follows f2
                WHERE f2.follower_id = $3::BIGINT
                  AND f2.followee_id = u.users_id
            ) AS is_following
        FROM follows f
        JOIN users u ON f.follower_id = u.users_id
        WHERE f.followee_id = $1
          AND u.deleted_at IS NULL
        ORDER BY f.created_at DESC
        LIMIT $2 OFFSET $4;
    `;

    const result = await db.query(query, [userId, limit, viewerId, offset]);
    return result.rows;
};
