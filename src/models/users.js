import { db } from './db.js';

// Get all users (for founder dashboard)
const getAllUsers = async () => {

    const query = `
        SELECT 
            u.users_id,
            u.bhid_sub,
            u.app_status,
            r.role_name,
            u.created_at
        FROM users u
        JOIN roles r ON u.role_id = r.role_id
        ORDER BY u.created_at DESC;
    `;

    const result = await db.query(query);

    return result.rows;
};

// Get an application profile by its BHID subject
const getUserProfile = async (subject, viewerId = null) => {
    const query = `
        SELECT 
            u.users_id,
            u.bhid_sub,
            (u.app_status = 'RESTRICTED') AS suspended,
            u.created_at,
            r.role_name,
            COALESCE(pc.post_count, 0) AS tweet_count,
            COALESCE(fc.follower_count, 0) AS follower_count,
            COALESCE(fc.following_count, 0) AS following_count,
            
            EXISTS (
                SELECT 1 FROM follows f 
                WHERE f.follower_id = $2 
                  AND f.followee_id = u.users_id
            ) AS is_following

        FROM users u
        JOIN roles r ON u.role_id = r.role_id
        LEFT JOIN user_post_counts pc ON pc.users_id = u.users_id
        LEFT JOIN user_follow_counts fc ON fc.users_id = u.users_id
        WHERE u.bhid_sub = $1
          AND u.app_status <> 'DEACTIVATED'
        LIMIT 1;
    `;

    const result = await db.query(query, [subject, viewerId]);
    return result.rows[0] || null;
};

// Suspend or Unsuspend user
const toggleSuspendUser = async (userId, suspend) => {
    const query = `
        WITH updated_user AS (
            UPDATE users
            SET app_status = CASE WHEN $1 THEN 'RESTRICTED' ELSE 'ACTIVE' END
            WHERE users_id = $2
              AND app_status IN ('ACTIVE', 'RESTRICTED')
            RETURNING users_id, bhid_sub, app_status
        ), revoked_sessions AS (
            UPDATE app_sessions
            SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
            FROM updated_user
            WHERE $1
              AND app_sessions.user_id = updated_user.users_id
              AND app_sessions.revoked_at IS NULL
        )
        SELECT users_id, bhid_sub, app_status FROM updated_user;
    `;
    const result = await db.query(query, [suspend, userId]);
    return result.rows[0];
};

// Soft Delete user
const deleteUser = async (userId) => {
    const query = `
        WITH deactivated_user AS (
            UPDATE users
            SET app_status = 'DEACTIVATED'
            WHERE users_id = $1 AND app_status <> 'DEACTIVATED'
            RETURNING users_id, bhid_sub
        ), revoked_sessions AS (
            UPDATE app_sessions
            SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
            FROM deactivated_user
            WHERE app_sessions.user_id = deactivated_user.users_id
              AND app_sessions.revoked_at IS NULL
        )
        SELECT users_id, bhid_sub FROM deactivated_user;
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
    toggleSuspendUser,
    deleteUser,
    logAuditAction
};