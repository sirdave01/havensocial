
-- creating the roles table that'll outline authorization

CREATE TABLE IF NOT EXISTS roles(

role_id SERIAL PRIMARY KEY,
role_name VARCHAR(100) UNIQUE NOT NULL,
role_description TEXT,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- inserting into the roles table

INSERT INTO roles (role_name, role_description)
	VALUES ('admin', 'Administrative user with moderation privileges'),
('moderator', 'Content moderation privileges');

INSERT INTO roles (role_name, role_description)
	VALUES ('founder', 'Platform founder with full access including user management and dashboard'),
('user', 'Standard user with basic access');

-- verify the roles table and the contents are added

SELECT * FROM roles;


-- creating the users table now

CREATE TABLE IF NOT EXISTS users(

users_id BIGSERIAL PRIMARY KEY,

-- log in and identity
username VARCHAR(50) UNIQUE NOT NULL,
email VARCHAR(255) UNIQUE NOT NULL,
password_hash TEXT NOT NULL,

-- names
full_name VARCHAR(255) NOT NULL,
display_name VARCHAR(255) NOT NULL,

bio TEXT,
profile_picture_url TEXT,

verified BOOLEAN DEFAULT FALSE,
suspended BOOLEAN DEFAULT FALSE,
deleted_at TIMESTAMP,

-- counters (denormalized for speed)
follower_count INT DEFAULT 0,
following_count INT DEFAULT 0,
post_count INT DEFAULT 0,

role_id INT REFERENCES roles(role_id) DEFAULT 2

);

-- Make deleted_at nullable (allow NULL)
ALTER TABLE users 
ALTER COLUMN deleted_at DROP NOT NULL;

-- drop verified column
ALTER TABLE users 
DROP COLUMN verified;

--replace the verified column

ALTER TABLE users 
ADD COLUMN verified BOOLEAN GENERATED ALWAYS AS (
    CASE 
        WHEN role_id = 1 THEN TRUE 
        ELSE FALSE 
    END
) STORED;

-- Set a proper default (optional but recommended)
ALTER TABLE users 
ALTER COLUMN deleted_at SET DEFAULT NULL;

-- adding an updated_at column for the users table
ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- adding an updated_at column for the users table
ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- update the roles

UPDATE users SET role_id = (SELECT role_id FROM roles WHERE role_name = 'founder') WHERE email = 'd08178084956@gmail.com';


UPDATE users
SET profile_picture_url = NULL
WHERE profile_picture_url NOT LIKE '%/uploads/profile/%';

ALTER TABLE users
ALTER COLUMN bio DROP NOT NULL;

UPDATE users
SET bio = NULL
WHERE bio = '';

-- verify the users table and the contents are added

SELECT * FROM users;

-- creating the posting or tweeting table

CREATE TABLE IF NOT EXISTS tweets(

tweet_id BIGSERIAL PRIMARY KEY,
user_id BIGINT NOT NULL REFERENCES users(users_id) ON DELETE CASCADE,
content TEXT NOT NULL,
media_url TEXT[],
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
is_reply_to BIGINT REFERENCES tweets(tweet_id),

reply_count INT DEFAULT 0,
like_count INT DEFAULT 0,
retweet_count INT DEFAULT 0,
view_count INT DEFAULT 0

);

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'users';

-- verify the tweets table and the contents are added

ALTER TABLE tweets ADD COLUMN deleted_at TIMESTAMP NULL;

ALTER TABLE tweets ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE tweets ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP;

SELECT * FROM tweets;


-- creating likes table

CREATE TABLE IF NOT EXISTS likes (

likes_id BIGSERIAL PRIMARY KEY,
user_id BIGINT NOT NULL REFERENCES users(users_id) ON DELETE CASCADE,
tweet_id BIGINT NOT NULL REFERENCES tweets(tweet_id) ON DELETE CASCADE,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
UNIQUE(user_id, tweet_id)
);

-- verify the likes table and the contents are added

SELECT * FROM likes;


-- creating retweets table
CREATE TABLE IF NOT EXISTS retweets (

retweet_id BIGSERIAL PRIMARY KEY,
user_id BIGINT NOT NULL REFERENCES users(users_id) ON DELETE CASCADE,
original_tweet_id BIGINT NOT NULL REFERENCES tweets(tweet_id) ON DELETE CASCADE,
quote_text TEXT,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);

-- verify the retweets table and the contents are added

SELECT * FROM retweets;



-- creating hashtags table

CREATE TABLE IF NOT EXISTS hashtags (

hashtags_id BIGSERIAL PRIMARY KEY,
tag VARCHAR(100) UNIQUE NOT NULL

);

-- verify the hashtags table and the contents are added

SELECT * FROM hashtags;


-- create retweet_hashtags table

CREATE TABLE IF NOT EXISTS retweet_hashtags (

tweet_id BIGINT REFERENCES tweets(tweet_id) ON DELETE CASCADE,
hashtag_id BIGINT REFERENCES hashtags(hashtags_id) ON DELETE CASCADE,
PRIMARY KEY (tweet_id, hashtag_id)

);

-- verify the retweet_hashtags table and the contents are added

SELECT * FROM retweet_hashtags;


-- create notifications table

CREATE TABLE IF NOT EXISTS notifications (

notifications_id BIGSERIAL PRIMARY KEY,
user_id BIGINT NOT NULL REFERENCES users(users_id) ON DELETE CASCADE,
actor_id BIGINT NOT NULL REFERENCES users(users_id),
type VARCHAR(50) NOT NULL,
tweet_id BIGINT NOT NULL REFERENCES tweets(tweet_id),
read BOOLEAN DEFAULT FALSE,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);

-- verify the notifications table and the contents are added

SELECT * FROM notifications;

-- creating the tweet_views table for realtime alogrithm and not for fakes
CREATE TABLE IF NOT EXISTS tweet_views (
  view_id BIGSERIAL PRIMARY KEY,
  tweet_id BIGINT REFERENCES tweets(tweet_id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

SELECT * FROM tweet_views;

-- creating the bookmarks table like X

CREATE TABLE IF NOT EXISTS bookmarks (
  user_id BIGINT REFERENCES users(users_id),
  tweet_id BIGINT REFERENCES tweets(tweet_id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, tweet_id)
);

SELECT * FROM bookmarks;

-- =============================================
-- RECOMMENDED INDEXES (Performance)
-- =============================================

CREATE INDEX IF NOT EXISTS idx_tweets_user_time ON tweets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tweets_reply ON tweets(is_reply_to);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_likes_tweet ON likes(tweet_id);

-- =============================================
-- TRIGGERS FOR AUTO-UPDATING COUNTERS
-- =============================================

-- 1. Like Count Trigger
CREATE OR REPLACE FUNCTION update_like_count() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE tweets SET like_count = like_count + 1 
        WHERE tweet_id = NEW.tweet_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE tweets SET like_count = like_count - 1 
        WHERE tweet_id = OLD.tweet_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_like_count
AFTER INSERT OR DELETE ON likes
FOR EACH ROW EXECUTE FUNCTION update_like_count();


-- 2. Retweet Count Trigger
CREATE OR REPLACE FUNCTION update_retweet_count() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE tweets SET retweet_count = retweet_count + 1 
        WHERE tweet_id = NEW.original_tweet_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE tweets SET retweet_count = retweet_count - 1 
        WHERE tweet_id = OLD.original_tweet_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_retweet_count
AFTER INSERT OR DELETE ON retweets
FOR EACH ROW EXECUTE FUNCTION update_retweet_count();


-- 3. Reply Count Trigger
CREATE OR REPLACE FUNCTION update_reply_count() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.is_reply_to IS NOT NULL THEN
        UPDATE tweets SET reply_count = reply_count + 1 
        WHERE tweet_id = NEW.is_reply_to;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reply_count
AFTER INSERT ON tweets
FOR EACH ROW EXECUTE FUNCTION update_reply_count();


-- =============================================
-- USER COUNTER TRIGGERS
-- =============================================

-- 1. Post Count Trigger (when user creates a tweet)
CREATE OR REPLACE FUNCTION update_user_post_count() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE users 
        SET post_count = post_count + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE users_id = NEW.user_id;
        
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE users 
        SET post_count = GREATEST(post_count - 1, 0),
            updated_at = CURRENT_TIMESTAMP
        WHERE users_id = OLD.user_id;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_post_count
AFTER INSERT OR DELETE ON tweets
FOR EACH ROW EXECUTE FUNCTION update_user_post_count();


-- 2. Follow Counters Trigger
CREATE OR REPLACE FUNCTION update_follow_counters() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Increment followee's follower_count
        UPDATE users 
        SET follower_count = follower_count + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE users_id = NEW.followee_id;

        -- Increment follower's following_count
        UPDATE users 
        SET following_count = following_count + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE users_id = NEW.follower_id;

    ELSIF TG_OP = 'DELETE' THEN
        -- Decrement followee's follower_count
        UPDATE users 
        SET follower_count = GREATEST(follower_count - 1, 0),
            updated_at = CURRENT_TIMESTAMP
        WHERE users_id = OLD.followee_id;

        -- Decrement follower's following_count
        UPDATE users 
        SET following_count = GREATEST(following_count - 1, 0),
            updated_at = CURRENT_TIMESTAMP
        WHERE users_id = OLD.follower_id;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_follow_counters
AFTER INSERT OR DELETE ON follows
FOR EACH ROW EXECUTE FUNCTION update_follow_counters();

-- create audit_logs table

CREATE TABLE IF NOT EXISTS audit_logs (

logs_id BIGSERIAL PRIMARY KEY,
actor_id BIGINT REFERENCES users(users_id),
action_type VARCHAR(100) NOT NULL,
target_type VARCHAR(100),
target_id BIGINT,
details JSONB,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);

-- verify the audit_logs table and the contents are added

SELECT * FROM audit_logs;


-- creating the follows table

CREATE TABLE IF NOT EXISTS follows (

follower_id BIGINT NOT NULL REFERENCES users(users_id) ON DELETE CASCADE,
followee_id BIGINT NOT NULL REFERENCES users(users_id) ON DELETE CASCADE,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
PRIMARY KEY (follower_id, followee_id)

);

ALTER TABLE follows
ADD CONSTRAINT unique_follow_pair UNIQUE (follower_id, followee_id);

-- verify the follows table and the contents are added

SELECT * FROM follows;



















