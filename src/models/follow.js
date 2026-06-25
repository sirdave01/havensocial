import { db } from "./db.js";

// Follow a user
const followUser = async (followerId, followeeId) => {

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
const unfollowUser = async (followerId, followeeId) => {

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

// Following list
const getFollowing = async (userId, limit = 50) => {
    const query = `
        SELECT u.* FROM users u
        JOIN follows f ON u.users_id = f.followee_id
        WHERE f.follower_id = $1
        LIMIT $2;
    `;

    const result = await db.query(query, [userId, limit]);
    return result.rows;
};

// Followers list
const getFollowers = async (userId, limit = 50) => {
    const query = `
        SELECT u.* FROM users u
        JOIN follows f ON u.users_id = f.follower_id
        WHERE f.followee_id = $1
        LIMIT $2;
    `;

    const result = await db.query(query, [userId, limit]);
    return result.rows;
};

export {
    followUser,
    unfollowUser,
    getFollowing,
    getFollowers
};