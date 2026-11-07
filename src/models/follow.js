
import { db } from "./db.js";
import { createNotification } from "./notification.js";

// ==================== FOLLOW A USER ====================

export const followUser = async (followerId, followeeId) => {

    if (String(followerId) === String(followeeId)) {
        throw new Error('A user cannot follow themselves');
    }

    // Only ACTIVE accounts can participate in a new follow.
    const result = await db.query(`
        INSERT INTO follows (
            follower_id,
            followee_id
        )

        SELECT
            follower.users_id,
            followee.users_id

        FROM users AS follower

        JOIN users AS followee
          ON followee.users_id = $2

        WHERE follower.users_id = $1
          AND follower.app_status = 'ACTIVE'
          AND followee.app_status = 'ACTIVE'

        ON CONFLICT (follower_id, followee_id)
        DO NOTHING

        RETURNING follower_id;

    `, [
        followerId,
        followeeId,
    ]);

    // A new follow was successfully created.
    if (result.rows.length > 0) {
        await createNotification(
            followeeId,
            followerId,
            'follow',
            null
        );

        return {
            following: true,
            alreadyExists: false,
        };
    }

    // Determine whether this is an existing follow
    // or an unavailable account.
    const existing = await db.query(`
        SELECT EXISTS (
            SELECT 1

            FROM follows f

            JOIN users AS follower
              ON follower.users_id = f.follower_id

            JOIN users AS followee
              ON followee.users_id = f.followee_id

            WHERE f.follower_id = $1
              AND f.followee_id = $2
              AND follower.app_status = 'ACTIVE'
              AND followee.app_status = 'ACTIVE'
        ) AS already_exists;
    `, [
        followerId,
        followeeId,
    ]);

    if (!existing.rows[0]?.already_exists) {
        throw new Error('This account is unavailable for following');
    }

    return {
        following: true,
        alreadyExists: true,
    };
};


// ==================== UNFOLLOW A USER ====================

export const unfollowUser = async (followerId, followeeId) => {

    if (String(followerId) === String(followeeId)) {
        throw new Error('A user cannot unfollow themselves');
    }

    const result = await db.query(`
        DELETE FROM follows

        WHERE follower_id = $1
          AND followee_id = $2

        RETURNING follower_id;

    `, [
        followerId,
        followeeId,
    ]);

    return {
        following: false,
        removed: result.rows.length > 0,
    };
};


// ==================== GET FOLLOWING ====================

export const getFollowing = async (
    userId,
    limit = 20,
    offset = 0,
    viewerId = null
) => {

    const query = `
        SELECT
            u.users_id,
            u.bhid_sub,

            COALESCE(
                fc.follower_count,
                0
            ) AS follower_count,

            COALESCE(
                fc.following_count,
                0
            ) AS following_count,

            COALESCE(
                pc.post_count,
                0
            ) AS tweet_count,

            EXISTS (
                SELECT 1
                FROM follows f2

                WHERE f2.follower_id = $3::BIGINT
                  AND f2.followee_id = u.users_id

            ) AS is_following

        FROM follows f

        JOIN users u
          ON f.followee_id = u.users_id

        LEFT JOIN user_follow_counts fc
          ON fc.users_id = u.users_id

        LEFT JOIN user_post_counts pc
          ON pc.users_id = u.users_id

        WHERE f.follower_id = $1
          AND u.app_status = 'ACTIVE'

        ORDER BY f.created_at DESC

        LIMIT $2 OFFSET $4;
    `;

    const result = await db.query(query, [
        userId,
        limit,
        viewerId,
        offset,
    ]);

    return result.rows;
};


// ==================== GET FOLLOWERS ====================

export const getFollowers = async (
    userId,
    limit = 20,
    offset = 0,
    viewerId = null
) => {

    const query = `
        SELECT
            u.users_id,
            u.bhid_sub,

            COALESCE(
                fc.follower_count,
                0
            ) AS follower_count,

            COALESCE(
                fc.following_count,
                0
            ) AS following_count,

            COALESCE(
                pc.post_count,
                0
            ) AS tweet_count,

            EXISTS (
                SELECT 1
                FROM follows f2

                WHERE f2.follower_id = $3::BIGINT
                  AND f2.followee_id = u.users_id

            ) AS is_following

        FROM follows f

        JOIN users u
          ON f.follower_id = u.users_id

        LEFT JOIN user_follow_counts fc
          ON fc.users_id = u.users_id

        LEFT JOIN user_post_counts pc
          ON pc.users_id = u.users_id

        WHERE f.followee_id = $1
          AND u.app_status = 'ACTIVE'

        ORDER BY f.created_at DESC

        LIMIT $2 OFFSET $4;
    `;

    const result = await db.query(query, [
        userId,
        limit,
        viewerId,
        offset,
    ]);

    return result.rows;
};
