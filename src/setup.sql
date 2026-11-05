```sql
-- ============================================================
-- HAVENSOCIAL DATABASE
-- VERSION: 3.0
-- DATABASE: PostgreSQL / Neon
-- IDENTITY PROVIDER: BHID
--
-- ARCHITECTURE:
-- BHID = Single Source of Truth for user identity.
-- HavenSocial = Social application data and functionality.
--
-- IMPORTANT:
-- This script is intended for a FRESH PostgreSQL database.
-- Execute using a single database connection.
-- ============================================================


BEGIN;


-- ============================================================
-- 1. EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- 2. ROLES
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
    role_id SERIAL PRIMARY KEY,

    role_name VARCHAR(100) UNIQUE NOT NULL,

    role_description TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


INSERT INTO roles (role_name, role_description)
VALUES
    ('founder', 'Platform founder with complete application access'),
    ('admin', 'Administrative access'),
    ('moderator', 'Content moderation privileges'),
    ('user', 'Standard HavenSocial user')
ON CONFLICT (role_name)
DO UPDATE SET
    role_description = EXCLUDED.role_description;


-- ============================================================
-- 3. USERS
-- BHID OWNS ALL IDENTITY INFORMATION
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    users_id BIGSERIAL PRIMARY KEY,

    bhid_sub TEXT UNIQUE NOT NULL,

    role_id INTEGER NOT NULL
        REFERENCES roles(role_id),

    app_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
        CHECK (
            app_status IN (
                'ACTIVE',
                'RESTRICTED',
                'BANNED',
                'DEACTIVATED'
            )
        ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    last_seen_at TIMESTAMPTZ
);


CREATE INDEX IF NOT EXISTS idx_users_bhid_sub
ON users (bhid_sub);

CREATE INDEX IF NOT EXISTS idx_users_app_status
ON users (app_status);


-- ============================================================
-- 4. USER PREFERENCES
-- APPLICATION-SPECIFIC PREFERENCES ONLY
-- ============================================================

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id BIGINT PRIMARY KEY
        REFERENCES users(users_id) ON DELETE CASCADE,

    theme VARCHAR(20) NOT NULL DEFAULT 'SYSTEM'
        CHECK (
            theme IN ('LIGHT', 'DARK', 'SYSTEM')
        ),

    language VARCHAR(20) NOT NULL DEFAULT 'en',

    timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',

    allow_direct_messages BOOLEAN NOT NULL DEFAULT TRUE,

    allow_mentions BOOLEAN NOT NULL DEFAULT TRUE,

    allow_notifications BOOLEAN NOT NULL DEFAULT TRUE,

    show_sensitive_media BOOLEAN NOT NULL DEFAULT FALSE,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- 5. TWEETS / POSTS
-- ============================================================

CREATE TABLE IF NOT EXISTS tweets (
    tweet_id BIGSERIAL PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    content TEXT,

    visibility VARCHAR(20) NOT NULL DEFAULT 'PUBLIC'
        CHECK (
            visibility IN (
                'PUBLIC',
                'FOLLOWERS',
                'COMMUNITY'
            )
        ),

    is_reply_to BIGINT
        REFERENCES tweets(tweet_id) ON DELETE RESTRICT,

    community_id BIGINT,

    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,

    is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,

    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,

    deleted_at TIMESTAMPTZ,

    edited_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CHECK (
        content IS NULL OR LENGTH(content) <= 25000
    ),

    CHECK (
        deleted_at IS NULL OR is_deleted = TRUE
    )
);


CREATE INDEX IF NOT EXISTS idx_tweets_user_time
ON tweets (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tweets_reply
ON tweets (is_reply_to, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tweets_feed
ON tweets (created_at DESC)
WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_tweets_visibility
ON tweets (visibility, created_at DESC)
WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_tweets_community
ON tweets (community_id, created_at DESC)
WHERE community_id IS NOT NULL;


-- ============================================================
-- 6. TWEET MEDIA
-- FILES ARE STORED IN AWS S3
-- ============================================================

CREATE TABLE IF NOT EXISTS tweet_media (
    media_id BIGSERIAL PRIMARY KEY,

    tweet_id BIGINT NOT NULL
        REFERENCES tweets(tweet_id) ON DELETE CASCADE,

    storage_key TEXT NOT NULL UNIQUE,

    media_url TEXT NOT NULL,

    media_type VARCHAR(30) NOT NULL
        CHECK (
            media_type IN (
                'IMAGE',
                'VIDEO',
                'GIF'
            )
        ),

    mime_type VARCHAR(100),

    file_size BIGINT,

    width INTEGER,

    height INTEGER,

    duration_seconds NUMERIC(10,2),

    alt_text TEXT,

    position INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CHECK (file_size IS NULL OR file_size >= 0),

    CHECK (width IS NULL OR width > 0),

    CHECK (height IS NULL OR height > 0)
);


CREATE INDEX IF NOT EXISTS idx_tweet_media_tweet
ON tweet_media (tweet_id, position);


-- ============================================================
-- 7. FOLLOWS
-- ============================================================

CREATE TABLE IF NOT EXISTS follows (
    follower_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    followee_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (follower_id, followee_id),

    CHECK (follower_id <> followee_id)
);


CREATE INDEX IF NOT EXISTS idx_follows_followee
ON follows (followee_id, created_at DESC);


-- ============================================================
-- 8. BLOCKED USERS
-- ============================================================

CREATE TABLE IF NOT EXISTS blocked_users (
    blocker_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    blocked_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (blocker_id, blocked_id),

    CHECK (blocker_id <> blocked_id)
);


CREATE INDEX IF NOT EXISTS idx_blocked_users_target
ON blocked_users (blocked_id);


-- ============================================================
-- 9. MUTED USERS
-- ============================================================

CREATE TABLE IF NOT EXISTS muted_users (
    muter_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    muted_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (muter_id, muted_id),

    CHECK (muter_id <> muted_id)
);


CREATE INDEX IF NOT EXISTS idx_muted_users_target
ON muted_users (muted_id);


-- ============================================================
-- 10. LIKES
-- ============================================================

CREATE TABLE IF NOT EXISTS likes (
    likes_id BIGSERIAL PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    tweet_id BIGINT NOT NULL
        REFERENCES tweets(tweet_id) ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (user_id, tweet_id)
);


CREATE INDEX IF NOT EXISTS idx_likes_tweet
ON likes (tweet_id, created_at DESC);


CREATE INDEX IF NOT EXISTS idx_likes_user
ON likes (user_id, created_at DESC);


-- ============================================================
-- 11. RETWEETS / QUOTE RETWEETS
-- ============================================================

CREATE TABLE IF NOT EXISTS retweets (
    retweet_id BIGSERIAL PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    original_tweet_id BIGINT NOT NULL
        REFERENCES tweets(tweet_id) ON DELETE CASCADE,

    quote_text TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (user_id, original_tweet_id)
);


CREATE INDEX IF NOT EXISTS idx_retweets_original
ON retweets (original_tweet_id, created_at DESC);


CREATE INDEX IF NOT EXISTS idx_retweets_user
ON retweets (user_id, created_at DESC);


-- ============================================================
-- 12. HASHTAGS
-- ============================================================

CREATE TABLE IF NOT EXISTS hashtags (
    hashtags_id BIGSERIAL PRIMARY KEY,

    tag VARCHAR(100) UNIQUE NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- Original post hashtags

CREATE TABLE IF NOT EXISTS tweet_hashtags (
    tweet_id BIGINT NOT NULL
        REFERENCES tweets(tweet_id) ON DELETE CASCADE,

    hashtag_id BIGINT NOT NULL
        REFERENCES hashtags(hashtags_id) ON DELETE CASCADE,

    PRIMARY KEY (tweet_id, hashtag_id)
);


-- Retweet hashtags

CREATE TABLE IF NOT EXISTS retweet_hashtags (
    retweet_id BIGINT NOT NULL
        REFERENCES retweets(retweet_id) ON DELETE CASCADE,

    hashtag_id BIGINT NOT NULL
        REFERENCES hashtags(hashtags_id) ON DELETE CASCADE,

    PRIMARY KEY (retweet_id, hashtag_id)
);


CREATE INDEX IF NOT EXISTS idx_tweet_hashtags_tag
ON tweet_hashtags (hashtag_id);

CREATE INDEX IF NOT EXISTS idx_retweet_hashtags_tag
ON retweet_hashtags (hashtag_id);


-- ============================================================
-- 13. TWEET MENTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS tweet_mentions (
    mention_id BIGSERIAL PRIMARY KEY,

    tweet_id BIGINT NOT NULL
        REFERENCES tweets(tweet_id) ON DELETE CASCADE,

    mentioned_user_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (tweet_id, mentioned_user_id)
);


CREATE INDEX IF NOT EXISTS idx_mentions_user
ON tweet_mentions (mentioned_user_id, created_at DESC);


-- ============================================================
-- 14. BOOKMARKS
-- ============================================================

CREATE TABLE IF NOT EXISTS bookmarks (
    user_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    tweet_id BIGINT NOT NULL
        REFERENCES tweets(tweet_id) ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, tweet_id)
);


CREATE INDEX IF NOT EXISTS idx_bookmarks_tweet
ON bookmarks (tweet_id);


-- ============================================================
-- 15. TWEET VIEWS
-- AUTHENTICATED AND ANONYMOUS VIEW DEDUPLICATION
-- ============================================================

CREATE TABLE IF NOT EXISTS tweet_views (
    view_id BIGSERIAL PRIMARY KEY,

    tweet_id BIGINT NOT NULL
        REFERENCES tweets(tweet_id) ON DELETE CASCADE,

    user_id BIGINT
        REFERENCES users(users_id) ON DELETE SET NULL,

    viewer_session_hash TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CHECK (
        user_id IS NOT NULL
        OR viewer_session_hash IS NOT NULL
    )
);


-- Authenticated visitors

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_user_tweet_view
ON tweet_views (tweet_id, user_id)
WHERE user_id IS NOT NULL;


-- Anonymous visitors

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_anonymous_tweet_view
ON tweet_views (tweet_id, viewer_session_hash)
WHERE viewer_session_hash IS NOT NULL;


CREATE INDEX IF NOT EXISTS idx_tweet_views_tweet
ON tweet_views (tweet_id, created_at DESC);


-- ============================================================
-- 16. NOTIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
    notifications_id BIGSERIAL PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    actor_id BIGINT
        REFERENCES users(users_id) ON DELETE SET NULL,

    type VARCHAR(50) NOT NULL,

    tweet_id BIGINT
        REFERENCES tweets(tweet_id) ON DELETE SET NULL,

    retweet_id BIGINT
        REFERENCES retweets(retweet_id) ON DELETE SET NULL,

    read BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE INDEX IF NOT EXISTS idx_notifications_user
ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
ON notifications (user_id, created_at DESC)
WHERE read = FALSE;


-- ============================================================
-- 17. NOTIFICATION PREFERENCES
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id BIGINT PRIMARY KEY
        REFERENCES users(users_id) ON DELETE CASCADE,

    likes BOOLEAN NOT NULL DEFAULT TRUE,

    replies BOOLEAN NOT NULL DEFAULT TRUE,

    reposts BOOLEAN NOT NULL DEFAULT TRUE,

    mentions BOOLEAN NOT NULL DEFAULT TRUE,

    follows BOOLEAN NOT NULL DEFAULT TRUE,

    messages BOOLEAN NOT NULL DEFAULT TRUE,

    system_notifications BOOLEAN NOT NULL DEFAULT TRUE,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- 18. TWEET REPORTS
-- ============================================================

CREATE TABLE IF NOT EXISTS tweet_reports (
    report_id BIGSERIAL PRIMARY KEY,

    reporter_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    tweet_id BIGINT NOT NULL
        REFERENCES tweets(tweet_id) ON DELETE CASCADE,

    reason VARCHAR(100) NOT NULL,

    details TEXT,

    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (
            status IN (
                'PENDING',
                'UNDER_REVIEW',
                'RESOLVED',
                'DISMISSED'
            )
        ),

    reviewed_by BIGINT
        REFERENCES users(users_id) ON DELETE SET NULL,

    reviewed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (reporter_id, tweet_id)
);


CREATE INDEX IF NOT EXISTS idx_tweet_reports_status
ON tweet_reports (status, created_at DESC);


-- ============================================================
-- 19. USER REPORTS
-- ============================================================

CREATE TABLE IF NOT EXISTS user_reports (
    report_id BIGSERIAL PRIMARY KEY,

    reporter_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    reported_user_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    reason VARCHAR(100) NOT NULL,

    details TEXT,

    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (
            status IN (
                'PENDING',
                'UNDER_REVIEW',
                'RESOLVED',
                'DISMISSED'
            )
        ),

    reviewed_by BIGINT
        REFERENCES users(users_id) ON DELETE SET NULL,

    reviewed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (reporter_id, reported_user_id),

    CHECK (reporter_id <> reported_user_id)
);


CREATE INDEX IF NOT EXISTS idx_user_reports_status
ON user_reports (status, created_at DESC);


-- ============================================================
-- 20. MODERATION ACTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS moderation_actions (
    action_id BIGSERIAL PRIMARY KEY,

    moderator_id BIGINT
        REFERENCES users(users_id) ON DELETE SET NULL,

    target_user_id BIGINT
        REFERENCES users(users_id) ON DELETE SET NULL,

    target_tweet_id BIGINT
        REFERENCES tweets(tweet_id) ON DELETE SET NULL,

    action_type VARCHAR(100) NOT NULL,

    reason TEXT,

    expires_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE INDEX IF NOT EXISTS idx_moderation_target_user
ON moderation_actions (target_user_id, created_at DESC);


-- ============================================================
-- 21. USER LISTS
-- X-STYLE CUSTOM USER LISTS
-- ============================================================

CREATE TABLE IF NOT EXISTS user_lists (
    list_id BIGSERIAL PRIMARY KEY,

    owner_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    name VARCHAR(100) NOT NULL,

    description TEXT,

    visibility VARCHAR(20) NOT NULL DEFAULT 'PRIVATE'
        CHECK (
            visibility IN ('PUBLIC', 'PRIVATE')
        ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (owner_id, name)
);


CREATE TABLE IF NOT EXISTS list_members (
    list_id BIGINT NOT NULL
        REFERENCES user_lists(list_id) ON DELETE CASCADE,

    user_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    added_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (list_id, user_id)
);


CREATE INDEX IF NOT EXISTS idx_list_members_user
ON list_members (user_id);


-- ============================================================
-- 22. POLLS
-- ============================================================

CREATE TABLE IF NOT EXISTS polls (
    poll_id BIGSERIAL PRIMARY KEY,

    tweet_id BIGINT UNIQUE NOT NULL
        REFERENCES tweets(tweet_id) ON DELETE CASCADE,

    expires_at TIMESTAMPTZ,

    allow_multiple_choices BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS poll_options (
    option_id BIGSERIAL PRIMARY KEY,

    poll_id BIGINT NOT NULL
        REFERENCES polls(poll_id) ON DELETE CASCADE,

    option_text VARCHAR(280) NOT NULL,

    position INTEGER NOT NULL DEFAULT 0,

    UNIQUE (poll_id, position)
);


CREATE TABLE IF NOT EXISTS poll_votes (
    vote_id BIGSERIAL PRIMARY KEY,

    poll_id BIGINT NOT NULL
        REFERENCES polls(poll_id) ON DELETE CASCADE,

    option_id BIGINT NOT NULL
        REFERENCES poll_options(option_id) ON DELETE CASCADE,

    user_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (poll_id, option_id, user_id)
);


CREATE INDEX IF NOT EXISTS idx_poll_votes_option
ON poll_votes (option_id);


CREATE INDEX IF NOT EXISTS idx_poll_votes_user
ON poll_votes (user_id);


-- ============================================================
-- 23. DIRECT MESSAGE CONVERSATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS conversations (
    conversation_id BIGSERIAL PRIMARY KEY,

    conversation_type VARCHAR(20) NOT NULL DEFAULT 'DIRECT'
        CHECK (
            conversation_type IN ('DIRECT', 'GROUP')
        ),

    created_by BIGINT
        REFERENCES users(users_id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS conversation_participants (
    conversation_id BIGINT NOT NULL
        REFERENCES conversations(conversation_id) ON DELETE CASCADE,

    user_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    last_read_at TIMESTAMPTZ,

    is_archived BOOLEAN NOT NULL DEFAULT FALSE,

    is_muted BOOLEAN NOT NULL DEFAULT FALSE,

    PRIMARY KEY (conversation_id, user_id)
);


CREATE INDEX IF NOT EXISTS idx_conversation_participants_user
ON conversation_participants (user_id);


-- ============================================================
-- 24. DIRECT MESSAGES
-- ============================================================

CREATE TABLE IF NOT EXISTS messages (
    message_id BIGSERIAL PRIMARY KEY,

    conversation_id BIGINT NOT NULL
        REFERENCES conversations(conversation_id) ON DELETE CASCADE,

    sender_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    content TEXT,

    reply_to_message_id BIGINT
        REFERENCES messages(message_id) ON DELETE SET NULL,

    is_edited BOOLEAN NOT NULL DEFAULT FALSE,

    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,

    deleted_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE INDEX IF NOT EXISTS idx_messages_conversation
ON messages (conversation_id, created_at DESC);


CREATE INDEX IF NOT EXISTS idx_messages_sender
ON messages (sender_id, created_at DESC);


-- ============================================================
-- 25. MESSAGE MEDIA
-- ============================================================

CREATE TABLE IF NOT EXISTS message_media (
    media_id BIGSERIAL PRIMARY KEY,

    message_id BIGINT NOT NULL
        REFERENCES messages(message_id) ON DELETE CASCADE,

    storage_key TEXT NOT NULL UNIQUE,

    media_url TEXT NOT NULL,

    media_type VARCHAR(30) NOT NULL
        CHECK (
            media_type IN (
                'IMAGE',
                'VIDEO',
                'GIF',
                'FILE',
                'AUDIO'
            )
        ),

    mime_type VARCHAR(100),

    file_size BIGINT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- 26. MESSAGE REACTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS message_reactions (
    reaction_id BIGSERIAL PRIMARY KEY,

    message_id BIGINT NOT NULL
        REFERENCES messages(message_id) ON DELETE CASCADE,

    user_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    emoji VARCHAR(30) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (message_id, user_id, emoji)
);


-- ============================================================
-- 27. COMMUNITIES
-- X-STYLE COMMUNITY FOUNDATION
-- ============================================================

CREATE TABLE IF NOT EXISTS communities (
    community_id BIGSERIAL PRIMARY KEY,

    owner_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    name VARCHAR(100) UNIQUE NOT NULL,

    description TEXT,

    visibility VARCHAR(20) NOT NULL DEFAULT 'PUBLIC'
        CHECK (
            visibility IN ('PUBLIC', 'PRIVATE')
        ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS community_members (
    community_id BIGINT NOT NULL
        REFERENCES communities(community_id) ON DELETE CASCADE,

    user_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    membership_role VARCHAR(20) NOT NULL DEFAULT 'MEMBER'
        CHECK (
            membership_role IN (
                'OWNER',
                'ADMIN',
                'MODERATOR',
                'MEMBER'
            )
        ),

    membership_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (
            membership_status IN (
                'ACTIVE',
                'PENDING',
                'BANNED'
            )
        ),

    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (community_id, user_id)
);


CREATE INDEX IF NOT EXISTS idx_community_members_user
ON community_members (user_id);


-- ============================================================
-- 28. LIVE SPACES
-- X-STYLE AUDIO SPACES FOUNDATION
-- ============================================================

CREATE TABLE IF NOT EXISTS spaces (
    space_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    host_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    title VARCHAR(200) NOT NULL,

    description TEXT,

    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED'
        CHECK (
            status IN (
                'SCHEDULED',
                'LIVE',
                'ENDED',
                'CANCELLED'
            )
        ),

    scheduled_at TIMESTAMPTZ,

    started_at TIMESTAMPTZ,

    ended_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS space_participants (
    space_id UUID NOT NULL
        REFERENCES spaces(space_id) ON DELETE CASCADE,

    user_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    participant_role VARCHAR(20) NOT NULL DEFAULT 'LISTENER'
        CHECK (
            participant_role IN (
                'HOST',
                'CO_HOST',
                'SPEAKER',
                'LISTENER'
            )
        ),

    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    left_at TIMESTAMPTZ,

    PRIMARY KEY (space_id, user_id)
);


-- ============================================================
-- 29. DRAFT POSTS
-- ============================================================

CREATE TABLE IF NOT EXISTS drafts (
    draft_id BIGSERIAL PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    content TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE INDEX IF NOT EXISTS idx_drafts_user
ON drafts (user_id, updated_at DESC);


-- ============================================================
-- 30. SCHEDULED POSTS
-- ============================================================

CREATE TABLE IF NOT EXISTS scheduled_posts (
    scheduled_post_id BIGSERIAL PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    content TEXT,

    scheduled_at TIMESTAMPTZ NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (
            status IN (
                'PENDING',
                'PUBLISHED',
                'CANCELLED',
                'FAILED'
            )
        ),

    published_tweet_id BIGINT
        REFERENCES tweets(tweet_id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE INDEX IF NOT EXISTS idx_scheduled_posts_pending
ON scheduled_posts (scheduled_at)
WHERE status = 'PENDING';


-- ============================================================
-- 31. HAVENSOCIAL APPLICATION SESSIONS
-- NOT BHID AUTHENTICATION SESSIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS app_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id BIGINT NOT NULL
        REFERENCES users(users_id) ON DELETE CASCADE,

    session_token_hash TEXT UNIQUE NOT NULL,

    expires_at TIMESTAMPTZ NOT NULL,

    revoked_at TIMESTAMPTZ,

    bhid_access_token_enc TEXT,

    bhid_access_token_expires_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    last_seen_at TIMESTAMPTZ
);

ALTER TABLE app_sessions
    ADD COLUMN IF NOT EXISTS bhid_access_token_enc TEXT,
    ADD COLUMN IF NOT EXISTS bhid_access_token_expires_at TIMESTAMPTZ;


CREATE INDEX IF NOT EXISTS idx_app_sessions_user
ON app_sessions (user_id);


CREATE INDEX IF NOT EXISTS idx_app_sessions_expiry
ON app_sessions (expires_at);


-- ============================================================
-- 32. AUDIT LOGS
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    logs_id BIGSERIAL PRIMARY KEY,

    actor_id BIGINT
        REFERENCES users(users_id) ON DELETE SET NULL,

    action_type VARCHAR(100) NOT NULL,

    target_type VARCHAR(100),

    target_id BIGINT,

    details JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
ON audit_logs (actor_id, created_at DESC);


CREATE INDEX IF NOT EXISTS idx_audit_logs_action
ON audit_logs (action_type);


-- ============================================================
-- 33. UPDATED_AT FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN

    NEW.updated_at = CURRENT_TIMESTAMP;

    RETURN NEW;

END;
$$ LANGUAGE plpgsql;


-- Tweets

DROP TRIGGER IF EXISTS trigger_tweets_updated_at ON tweets;

CREATE TRIGGER trigger_tweets_updated_at
BEFORE UPDATE ON tweets
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- User preferences

CREATE TRIGGER trigger_user_preferences_updated_at
BEFORE UPDATE ON user_preferences
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- Conversations

CREATE TRIGGER trigger_conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- Messages

CREATE TRIGGER trigger_messages_updated_at
BEFORE UPDATE ON messages
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- Communities

CREATE TRIGGER trigger_communities_updated_at
BEFORE UPDATE ON communities
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- User lists

CREATE TRIGGER trigger_user_lists_updated_at
BEFORE UPDATE ON user_lists
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- Drafts

CREATE TRIGGER trigger_drafts_updated_at
BEFORE UPDATE ON drafts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- Scheduled posts

CREATE TRIGGER trigger_scheduled_posts_updated_at
BEFORE UPDATE ON scheduled_posts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- 34. SOFT DELETE FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION scrub_deleted_tweet()
RETURNS TRIGGER AS $$
BEGIN

    IF NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE THEN

        NEW.deleted_at = COALESCE(
            NEW.deleted_at,
            CURRENT_TIMESTAMP
        );

        NEW.content = NULL;

    END IF;

    RETURN NEW;

END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER trigger_scrub_deleted_tweet
BEFORE UPDATE ON tweets
FOR EACH ROW
EXECUTE FUNCTION scrub_deleted_tweet();


-- ============================================================
-- 35. REPLY COUNT VIEW
-- COUNTS ARE CALCULATED, NOT DUPLICATED
-- ============================================================

CREATE OR REPLACE VIEW tweet_reply_counts AS
SELECT
    parent.tweet_id,

    COUNT(reply.tweet_id) AS reply_count

FROM tweets parent

LEFT JOIN tweets reply
    ON reply.is_reply_to = parent.tweet_id
    AND reply.is_deleted = FALSE

GROUP BY parent.tweet_id;


-- ============================================================
-- 36. LIKE COUNT VIEW
-- ============================================================

CREATE OR REPLACE VIEW tweet_like_counts AS
SELECT
    t.tweet_id,

    COUNT(l.likes_id) AS like_count

FROM tweets t

LEFT JOIN likes l
    ON l.tweet_id = t.tweet_id

GROUP BY t.tweet_id;


-- ============================================================
-- 37. RETWEET COUNT VIEW
-- ============================================================

CREATE OR REPLACE VIEW tweet_retweet_counts AS
SELECT
    t.tweet_id,

    COUNT(r.retweet_id) AS retweet_count

FROM tweets t

LEFT JOIN retweets r
    ON r.original_tweet_id = t.tweet_id

GROUP BY t.tweet_id;


-- ============================================================
-- 38. TWEET VIEW COUNT
-- ============================================================

CREATE OR REPLACE VIEW tweet_view_counts AS
SELECT
    t.tweet_id,

    COUNT(v.view_id) AS view_count

FROM tweets t

LEFT JOIN tweet_views v
    ON v.tweet_id = t.tweet_id

GROUP BY t.tweet_id;


-- ============================================================
-- 39. USER FOLLOWER COUNTS
-- ============================================================

CREATE OR REPLACE VIEW user_follow_counts AS
SELECT
    u.users_id,

    COUNT(DISTINCT f1.follower_id) AS follower_count,

    COUNT(DISTINCT f2.followee_id) AS following_count

FROM users u

LEFT JOIN follows f1
    ON f1.followee_id = u.users_id

LEFT JOIN follows f2
    ON f2.follower_id = u.users_id

GROUP BY u.users_id;


-- ============================================================
-- 40. USER POST COUNTS
-- ============================================================

CREATE OR REPLACE VIEW user_post_counts AS
SELECT
    u.users_id,

    COUNT(t.tweet_id) AS post_count

FROM users u

LEFT JOIN tweets t
    ON t.user_id = u.users_id
    AND t.is_deleted = FALSE

GROUP BY u.users_id;


-- ============================================================
-- 41. CLEANUP / MAINTENANCE INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_tweets_deleted
ON tweets (deleted_at)
WHERE is_deleted = TRUE;


CREATE INDEX IF NOT EXISTS idx_messages_deleted
ON messages (deleted_at)
WHERE is_deleted = TRUE;


-- ============================================================
-- 42. SCHEMA VERSION
-- ============================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(50) PRIMARY KEY,

    description TEXT,

    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


INSERT INTO schema_migrations (version, description)
VALUES (
    '3.0.0',
    'Initial HavenSocial production foundation with BHID identity integration'
)
ON CONFLICT (version) DO NOTHING;


-- ============================================================
-- COMMIT
-- ============================================================

COMMIT;

-- ============================================================
-- ALTERATIONS FOR TWEET VIEWS
-- ============================================================

BEGIN;

ALTER TABLE tweet_views
ADD COLUMN IF NOT EXISTS dwell_time_ms INTEGER
CHECK (
    dwell_time_ms IS NULL OR dwell_time_ms >= 0
);

ALTER TABLE tweet_views
ADD COLUMN IF NOT EXISTS qualification_status VARCHAR(20)
NOT NULL DEFAULT 'PENDING'
CHECK (
    qualification_status IN (
        'PENDING',
        'QUALIFIED',
        'REJECTED'
    )
);

ALTER TABLE tweet_views
ADD COLUMN IF NOT EXISTS qualification_reason TEXT;

ALTER TABLE tweet_views
ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMPTZ;

ALTER TABLE tweet_views
ADD COLUMN IF NOT EXISTS qualification_rule_version VARCHAR(30);

ALTER TABLE tweet_views
ADD COLUMN IF NOT EXISTS creator_tier_snapshot VARCHAR(30);

ALTER TABLE tweet_views
ADD COLUMN IF NOT EXISTS creator_tier_snapshot_at TIMESTAMPTZ;

COMMIT;

-- ============================================================
-- END OF HAVENSOCIAL DATABASE SETUP
-- ============================================================
```