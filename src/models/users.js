import { db } from './db.js';

// Get all users (for founder dashboard)
const getAllUsers = async () => {

    const query = `
        SELECT 
            u.users_id,
            u.username,
            u.full_name,
            u.display_name,
            u.email,
            COALESCE(u.profile_picture_url, u.bhid_picture_url) AS profile_picture_url,
            u.verified,
            u.suspended,
            r.role_name,
            u.created_at
        FROM users u
        JOIN roles r ON u.role_id = r.role_id
        WHERE u.deleted_at IS NULL
        ORDER BY u.created_at DESC;
    `;

    const result = await db.query(query);

    return result.rows;
};

// Get user profile by username
const getUserProfile = async (username, viewerId = null) => {
    const query = `
        SELECT 
            u.users_id,
            u.username,
            u.full_name,
            u.display_name,
            u.bio,
            u.profile_picture_url AS custom_profile_picture_url,
            COALESCE(u.profile_picture_url, u.bhid_picture_url) AS profile_picture_url,
            u.verified,
            u.suspended,
            u.created_at,
            r.role_name,
            COALESCE(u.post_count, 0) AS tweet_count,
            COALESCE(u.follower_count, 0) AS follower_count,
            COALESCE(u.following_count, 0) AS following_count,
            
            EXISTS (
                SELECT 1 FROM follows f 
                WHERE f.follower_id = $2 
                  AND f.followee_id = u.users_id
            ) AS is_following

        FROM users u
        JOIN roles r ON u.role_id = r.role_id
        WHERE u.username = $1
          AND u.deleted_at IS NULL
        LIMIT 1;
    `;

    const result = await db.query(query, [username, viewerId]);
    return result.rows[0] || null;
};

// Update user profile (bio, profile picture, display name, etc.)
const updateUserProfile = async (userId, fullName, displayName, bio, profilePictureUrl) => {

    const query = `
        UPDATE users 
        SET 
            full_name = COALESCE($2, full_name),
            display_name = COALESCE($3, display_name),
            bio = COALESCE($4, bio),
            profile_picture_url = COALESCE($5, profile_picture_url),
            updated_at = CURRENT_TIMESTAMP
        WHERE users_id = $1
        RETURNING *;
    `;

    const result = await db.query(query, [userId, fullName, displayName, bio, profilePictureUrl]);

    return result.rows[0];
};

// Suspend or Unsuspend user
const toggleSuspendUser = async (userId, suspend) => {
    const query = `
        UPDATE users 
        SET suspended = $1, updated_at = CURRENT_TIMESTAMP
        WHERE users_id = $2 
        RETURNING users_id, username, suspended;
    `;
    const result = await db.query(query, [suspend, userId]);
    return result.rows[0];
};

// Soft Delete user
const deleteUser = async (userId) => {
    const query = `
        UPDATE users 
        SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE users_id = $1 
        RETURNING users_id, username;
    `;
    const result = await db.query(query, [userId]);

    return result.rows[0];
};

// Log admin actions (Founder activities)
const logAuditAction = async (actorId, actionType, targetId, targetType, details = {}) => {

    const query = `
        INSERT INTO audit_logs (actor_id, action_type, target_type, target_id, details)
        VALUES ($1, $2, $3, $4, $5);
    `;

    await db.query(query, [actorId, actionType, targetType, targetId, details]);

};

export { 
    getAllUsers,
    getUserProfile,
    updateUserProfile,
    toggleSuspendUser,
    deleteUser,
    logAuditAction
};