import { db } from "./db.js";

// Follow a user
const followUser = async (followerId, followeeId) => {
    const query = `
        INSERT INTO follows (follower_id, followee_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        RETURNING *;
    `;
    const result = await db.query(query, [followerId, followeeId]);
    return result.rows[0];
};

// Unfollow a user
const unfollowUser = async (followerId, followeeId) => {
    const query = `
        DELETE FROM follows 
        WHERE follower_id = $1 AND followee_id = $2 
        RETURNING *;
    `;
    const result = await db.query(query, [followerId, followeeId]);
    return result.rows[0];
};

// Get users that a person is following
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

// Get followers of a user
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