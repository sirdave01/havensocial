-- Fresh HavenSocial PostgreSQL schema. Apply this to a new Neon database.
-- BHID owns authentication; there is no local password or registration table.

CREATE TABLE IF NOT EXISTS roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(100) UNIQUE NOT NULL,
    role_description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roles (role_name, role_description)
VALUES
    ('founder', 'Platform founder with full access including user management and dashboard'),
    ('admin', 'Administrative user with moderation privileges'),
    ('moderator', 'Content moderation privileges'),
    ('user', 'Standard user with basic access')
ON CONFLICT (role_name) DO UPDATE
SET role_description = EXCLUDED.role_description;

CREATE TABLE IF NOT EXISTS users (
    users_id BIGSERIAL PRIMARY KEY,
    bhid_sub TEXT UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    full_name VARCHAR(255),
    display_name VARCHAR(255) NOT NULL,
    bio TEXT,
    profile_picture_url TEXT,
    bhid_picture_url TEXT,
    date_of_birth DATE,
    verification_level TEXT,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    suspended BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    follower_count INTEGER NOT NULL DEFAULT 0,
    following_count INTEGER NOT NULL DEFAULT 0,
    post_count INTEGER NOT NULL DEFAULT 0,
    role_id INTEGER NOT NULL REFERENCES roles(role_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tweets (
    tweet_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(users_id) ON DELETE CASCADE,
    content TEXT,
    media_url TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_reply_to BIGINT REFERENCES tweets(tweet_id),
    reply_count INTEGER NOT NULL DEFAULT 0,
    like_count INTEGER NOT NULL DEFAULT 0,
    retweet_count INTEGER NOT NULL DEFAULT 0,
    view_count INTEGER NOT NULL DEFAULT 0,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    edited_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS follows (
    follower_id BIGINT NOT NULL REFERENCES users(users_id) ON DELETE CASCADE,
    followee_id BIGINT NOT NULL REFERENCES users(users_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, followee_id),
    CONSTRAINT follows_no_self_follow CHECK (follower_id <> followee_id)
);

CREATE TABLE IF NOT EXISTS likes (
    likes_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(users_id) ON DELETE CASCADE,
    tweet_id BIGINT NOT NULL REFERENCES tweets(tweet_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, tweet_id)
);

CREATE TABLE IF NOT EXISTS retweets (
    retweet_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(users_id) ON DELETE CASCADE,
    original_tweet_id BIGINT NOT NULL REFERENCES tweets(tweet_id) ON DELETE CASCADE,
    quote_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, original_tweet_id)
);

CREATE TABLE IF NOT EXISTS hashtags (
    hashtags_id BIGSERIAL PRIMARY KEY,
    tag VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS retweet_hashtags (
    tweet_id BIGINT NOT NULL REFERENCES tweets(tweet_id) ON DELETE CASCADE,
    hashtag_id BIGINT NOT NULL REFERENCES hashtags(hashtags_id) ON DELETE CASCADE,
    PRIMARY KEY (tweet_id, hashtag_id)
);

CREATE TABLE IF NOT EXISTS notifications (
    notifications_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(users_id) ON DELETE CASCADE,
    actor_id BIGINT NOT NULL REFERENCES users(users_id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    tweet_id BIGINT REFERENCES tweets(tweet_id) ON DELETE CASCADE,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    logs_id BIGSERIAL PRIMARY KEY,
    actor_id BIGINT REFERENCES users(users_id) ON DELETE SET NULL,
    action_type VARCHAR(100) NOT NULL,
    target_type VARCHAR(100),
    target_id BIGINT,
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tweet_views (
    view_id BIGSERIAL PRIMARY KEY,
    tweet_id BIGINT NOT NULL REFERENCES tweets(tweet_id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tweet_id, user_id)
);

CREATE TABLE IF NOT EXISTS bookmarks (
    user_id BIGINT NOT NULL REFERENCES users(users_id) ON DELETE CASCADE,
    tweet_id BIGINT NOT NULL REFERENCES tweets(tweet_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, tweet_id)
);

CREATE INDEX IF NOT EXISTS idx_tweets_user_time ON tweets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tweets_reply ON tweets (is_reply_to);
CREATE INDEX IF NOT EXISTS idx_tweets_not_deleted ON tweets (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows (followee_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, read);
CREATE INDEX IF NOT EXISTS idx_likes_tweet ON likes (tweet_id);

CREATE OR REPLACE FUNCTION scrub_deleted_tweet()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS DISTINCT FROM NEW.deleted_at THEN
        NEW.content := NULL;
        NEW.media_url := NULL;
        NEW.is_deleted := TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_scrub_deleted_tweet ON tweets;
CREATE TRIGGER trigger_scrub_deleted_tweet
BEFORE UPDATE ON tweets
FOR EACH ROW EXECUTE FUNCTION scrub_deleted_tweet();

CREATE OR REPLACE FUNCTION update_like_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE tweets SET like_count = like_count + 1 WHERE tweet_id = NEW.tweet_id;
    ELSE
        UPDATE tweets SET like_count = GREATEST(like_count - 1, 0) WHERE tweet_id = OLD.tweet_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_like_count ON likes;
CREATE TRIGGER trigger_like_count
AFTER INSERT OR DELETE ON likes
FOR EACH ROW EXECUTE FUNCTION update_like_count();

CREATE OR REPLACE FUNCTION update_retweet_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE tweets SET retweet_count = retweet_count + 1 WHERE tweet_id = NEW.original_tweet_id;
    ELSE
        UPDATE tweets SET retweet_count = GREATEST(retweet_count - 1, 0)
        WHERE tweet_id = OLD.original_tweet_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_retweet_count ON retweets;
CREATE TRIGGER trigger_retweet_count
AFTER INSERT OR DELETE ON retweets
FOR EACH ROW EXECUTE FUNCTION update_retweet_count();

CREATE OR REPLACE FUNCTION update_reply_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.is_reply_to IS NOT NULL THEN
        UPDATE tweets SET reply_count = reply_count + 1 WHERE tweet_id = NEW.is_reply_to;
    ELSIF TG_OP = 'DELETE' AND OLD.is_reply_to IS NOT NULL THEN
        UPDATE tweets SET reply_count = GREATEST(reply_count - 1, 0) WHERE tweet_id = OLD.is_reply_to;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_reply_count ON tweets;
CREATE TRIGGER trigger_reply_count
AFTER INSERT OR DELETE ON tweets
FOR EACH ROW EXECUTE FUNCTION update_reply_count();

CREATE OR REPLACE FUNCTION update_user_post_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE users SET post_count = post_count + 1, updated_at = CURRENT_TIMESTAMP
        WHERE users_id = NEW.user_id;
    ELSE
        UPDATE users SET post_count = GREATEST(post_count - 1, 0), updated_at = CURRENT_TIMESTAMP
        WHERE users_id = OLD.user_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_post_count ON tweets;
CREATE TRIGGER trigger_user_post_count
AFTER INSERT OR DELETE ON tweets
FOR EACH ROW EXECUTE FUNCTION update_user_post_count();

CREATE OR REPLACE FUNCTION update_follow_counters()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE users SET follower_count = follower_count + 1, updated_at = CURRENT_TIMESTAMP
        WHERE users_id = NEW.followee_id;
        UPDATE users SET following_count = following_count + 1, updated_at = CURRENT_TIMESTAMP
        WHERE users_id = NEW.follower_id;
    ELSE
        UPDATE users SET follower_count = GREATEST(follower_count - 1, 0), updated_at = CURRENT_TIMESTAMP
        WHERE users_id = OLD.followee_id;
        UPDATE users SET following_count = GREATEST(following_count - 1, 0), updated_at = CURRENT_TIMESTAMP
        WHERE users_id = OLD.follower_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_follow_counters ON follows;
CREATE TRIGGER trigger_follow_counters
AFTER INSERT OR DELETE ON follows
FOR EACH ROW EXECUTE FUNCTION update_follow_counters();
