import bcrypt from 'bcrypt';

import { db } from './db.js';

// Check if email already exists
const getUserByEmail = async (email) => {

    const query = `
        SELECT users_id 
        FROM users 
        WHERE email = $1 
          AND deleted_at IS NULL
    `;

    const result = await db.query(query, [email]);

    return result.rows[0] || null;

};

// Create new user
const createUser = async (username, email, passwordHash, fullName = null, displayName = null) => {

    const existingUser = await getUserByEmail(email);

    if (existingUser) {

        throw new Error('Email already in use');

    }

    const defaultRole = 'user';

    const query = `
        INSERT INTO users (
            username,
            email,
            password_hash,
            full_name,
            display_name,
            role_id
        ) 
        VALUES (
            $1, $2, $3, $4, $5,
            (SELECT role_id FROM roles WHERE role_name = $6)
        ) 
        RETURNING 
            users_id, 
            username, 
            display_name, 
            full_name,
            verified;
    `;

    const queryParams = [
        username,
        email,
        passwordHash,
        fullName,
        displayName || fullName,
        defaultRole
    ];

    const result = await db.query(query, queryParams);

    if (result.rows.length === 0) {
        throw new Error('Failed to create user');
    }

    if (process.env.ENABLE_SQL_LOGGING === 'true') {
        console.log('Created new user with ID:', result.rows[0].user_id);
    }

    return result.rows[0];
};

// Find user for login
const findUserByEmail = async (email) => {

    const query = `
        SELECT 
            u.users_id,
            u.username,
            u.email,
            u.password_hash,
            u.full_name,
            u.display_name,
            u.profile_picture_url,
            u.verified,
            u.suspended,
            r.role_name
        FROM users u
        JOIN roles r ON u.role_id = r.role_id
        WHERE u.email = $1
          AND u.suspended = FALSE 
          AND u.deleted_at IS NULL;
    `;

    const result = await db.query(query, [email]);

    return result.rows[0] || null;
};

// Verify password
const verifyPassword = async (password, password_hash) => {

    return await bcrypt.compare(password, password_hash);
};

// Authenticate user (for login)
const authenticateUser = async (email, password) => {

    const user = await findUserByEmail(email);

    if (!user) return null;

    const isMatch = await verifyPassword(password, user.password_hash);

    if (!isMatch) return null;

    delete user.password_hash;   // Remove sensitive data

    return user;
};

// Get all users (for founder dashboard)
const getAllUsers = async () => {

    const query = `
        SELECT 
            u.users_id,
            u.username,
            u.full_name,
            u.display_name,
            u.email,
            u.profile_picture_url,
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
            u.*,
            r.role_name,
            
            COALESCE(u.post_count, 0) AS tweet_count,        -- Important: alias as tweet_count
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

// Verify or Unverify user
const toggleVerifyUser = async (actorUser, targetUserId, verify) => {

    // 1. Get actor role
    const actorQuery = `
        SELECT role_id FROM users WHERE users_id = $1
    `;
    const actorResult = await db.query(actorQuery, [actorUser]);

    const roleId = actorResult.rows[0]?.role_id;

    // 2. Only founder (1) or admin (3) can verify users
    if (![1, 3].includes(roleId)) {
        throw new Error('Not authorized to verify users');
    }

    // 3. Proceed with update
    const query = `
        UPDATE users 
        SET verified = $1, updated_at = CURRENT_TIMESTAMP
        WHERE users_id = $2 
        RETURNING users_id, username, verified;
    `;

    const result = await db.query(query, [verify, targetUserId]);

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
    createUser, 
    authenticateUser, 
    getAllUsers,
    getUserByEmail,
    findUserByEmail,
    getUserProfile,
    updateUserProfile,
    toggleSuspendUser,
    toggleVerifyUser,
    deleteUser,
    logAuditAction
};