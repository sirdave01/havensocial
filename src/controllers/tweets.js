// import the tweets model db handler
import { db } from "../models/db.js";
import { createTweetWithExtras } from '../models/tweetService.js';
import {
    getTweetById, getUserTweets, getHomeFeed,
    deleteTweet, updateTweet, getTweetWithReplies
} from '../models/tweets.js';
import { createNotification } from '../models/notification.js';
import { upload } from '../middleware/upload.js';

export const createTweetController = async (req, res) => {
    try {
        if (!req.session?.user) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const { content, isReplyTo } = req.body;
        const mediaFile = req.file; // from multer

        const userId = req.session.user.users_id;

        if (!content || content.trim() === '') {
            return res.status(400).json({ message: "Content is required" });
        }

        let mediaUrl = null;
        if (mediaFile) {
            mediaUrl = `/uploads/tweets/${mediaFile.filename}`;
        }

        const tweet = await createTweetWithExtras(userId, content, mediaUrl, isReplyTo);
        
        res.status(201).json({
            message: "Tweet created successfully",
            tweet
        });
    } catch (error) {
        console.error('Create tweet error:', error);
        res.status(500).json({ message: "Error creating tweet" });
    }
};

export const getTweetController = async (req, res) => {
    try {
        const { tweetId } = req.params;
        const tweet = await getTweetById(tweetId);

        if (!tweet) {
            return res.status(404).json({ message: "Tweet not found" });
        }

        res.json(tweet);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching tweet" });
    }
};

export const getUserTweetsController = async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 20, offset = 0 } = req.query;

        const tweets = await getUserTweets(userId, parseInt(limit), parseInt(offset));
        res.json(tweets);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching user tweets" });
    }
};

export const getHomeFeedController = async (req, res) => {
    try {
        if (!req.session?.user) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const userId = req.session.user.users_id;
        const { limit = 20, offset = 0 } = req.query;

        const feed = await getHomeFeed(userId, parseInt(limit), parseInt(offset));
        res.json(feed);
    } catch (error) {
        console.error('Home feed error:', error);
        res.status(500).json({ message: "Error fetching home feed" });
    }
};

export const deleteTweetController = async (req, res) => {
    try {
        if (!req.session?.user) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const { tweetId } = req.params;
        const userId = req.session.user.users_id;

        // Fetch for reply handling
        const tweetInfo = await db.query(
            `SELECT is_reply_to FROM tweets WHERE tweet_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
            [tweetId, userId]
        );
        const isReplyTo = tweetInfo.rows[0]?.is_reply_to;

        const result = await deleteTweet(tweetId, userId);

        if (!result) {
            return res.status(404).json({ message: "Tweet not found or unauthorized" });
        }

        // Update user's tweet count
        await db.query(`
            UPDATE users 
            SET post_count = GREATEST(post_count - 1, 0) 
            WHERE users_id = $1
        `, [userId]);

        // If reply, update parent
        if (isReplyTo) {
            await db.query(`
                UPDATE tweets 
                SET reply_count = GREATEST(reply_count - 1, 0)
                WHERE tweet_id = $1
            `, [isReplyTo]);
        }

        res.json({ message: "Tweet deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting tweet" });
    }
};

// ===================== UPDATE TWEET =====================
export const updateTweetController = async (req, res) => {
    try {
        if (!req.session?.user) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const { tweetId } = req.params;
        const { content } = req.body;
        const userId = req.session.user.users_id;

        if (!content || content.trim() === '') {
            return res.status(400).json({ message: "Content is required" });
        }

        const updated = await updateTweet(tweetId, userId, content.trim());

        if (!updated) {
            return res.status(404).json({ message: "Tweet not found or not allowed" });
        }

        res.json({
            message: "Tweet updated successfully",
            tweet: updated
        });

    } catch (error) {
        console.error("Update tweet error:", error);
        res.status(500).json({ message: "Error updating tweet" });
    }
};

// ===================== REPLY TWEET =====================
export const replyTweetController = async (req, res) => {
    try {
        if (!req.session?.user) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const { content, isReplyTo } = req.body;
        const userId = req.session.user.users_id;

        if (!content || content.trim() === '') {
            return res.status(400).json({ message: "Reply content is required" });
        }

        if (!isReplyTo) {
            return res.status(400).json({ message: "Missing parent tweet" });
        }

        const tweet = await createTweetWithExtras(
            userId,
            content.trim(),
            null,
            isReplyTo
        );

        res.status(201).json({
            message: "Reply created successfully",
            tweet
        });

    } catch (error) {
        console.error("Reply error:", error);
        res.status(500).json({ message: "Error creating reply" });
    }
};

export const incrementViewController = async (req, res) => {
    try {
        const { tweetId } = req.params;
        const viewerId = req.session?.user?.users_id;

        if (!viewerId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const original = await db.query(
            `SELECT user_id FROM tweets WHERE tweet_id = $1 AND deleted_at IS NULL`,
            [tweetId]
        );

        if (!original.rows[0]) {
            return res.status(404).json({ message: 'Tweet not found' });
        }

        if (original.rows[0].user_id === viewerId) {
            return res.status(200).json({ ok: true, message: 'Owner views are not counted' });
        }

        const alreadyViewed = await db.query(
            `SELECT view_id FROM tweet_views WHERE tweet_id = $1 AND user_id = $2`,
            [tweetId, viewerId]
        );

        if (alreadyViewed.rowCount > 0) {
            return res.status(200).json({ ok: true, message: 'View already counted' });
        }

        await db.query(
            `INSERT INTO tweet_views (tweet_id, user_id) VALUES ($1, $2)`,
            [tweetId, viewerId]
        );

        await db.query(
            `UPDATE tweets 
             SET view_count = view_count + 1
             WHERE tweet_id = $1`,
            [tweetId]
        );

        res.json({ ok: true });

    } catch (err) {
        console.error("View error:", err);
        res.status(500).json({ message: "Failed to update views" });
    }
};

export const pinTweetController = async (req, res) => {
    try {
        const userId = req.session.user.users_id;
        const { tweetId } = req.body;

        const result = await db.query(
            `UPDATE tweets
             SET is_pinned = NOT is_pinned
             WHERE tweet_id = $1 AND user_id = $2
             RETURNING *`,
            [tweetId, userId]
        );

        if (!result.rows.length) {
            return res.status(403).json({ message: "Not allowed" });
        }

        res.json({ message: "Pin updated", tweet: result.rows[0] });

    } catch (err) {
        console.error("Pin error:", err);
        res.status(500).json({ message: "Pin failed" });
    }
};

export const retweetController = async (req, res) => {
    try {
        const userId = req.session.user.users_id;
        const { tweetId } = req.body;

        if (!tweetId) {
            return res.status(400).json({ message: "tweetId is required" });
        }

        const exists = await db.query(
            `SELECT 1 FROM retweets
             WHERE user_id = $1 AND original_tweet_id = $2`,
            [userId, tweetId]
        );

        if (exists.rows.length > 0) {
            return res.status(409).json({ message: "Already retweeted" });
        }

        const original = await db.query(
            `SELECT user_id FROM tweets WHERE tweet_id = $1 AND deleted_at IS NULL`,
            [tweetId]
        );

        if (!original.rows[0]) {
            return res.status(404).json({ message: "Tweet not found" });
        }

        await db.query(
            `INSERT INTO retweets (user_id, original_tweet_id)
             VALUES ($1, $2)`,
            [userId, tweetId]
        );

        await db.query(
            `UPDATE tweets
             SET retweet_count = retweet_count + 1
             WHERE tweet_id = $1`,
            [tweetId]
        );

        if (original.rows[0].user_id !== userId) {
            await createNotification(original.rows[0].user_id, userId, 'retweet', tweetId);
        }

        res.status(201).json({ message: "Retweeted successfully" });

    } catch (err) {
        console.error("Retweet error:", err);
        res.status(500).json({ message: "Retweet failed" });
    }
};

// ===================== SHARED TWEET DETAILS PAGE =====================

export const showTweetDetailPage = async (req, res) => {
    try {
        const { tweetId } = req.params;
        const user = req.session?.user;

        if (!user) return res.redirect('/login');

        const data = await getTweetWithReplies(tweetId, user.users_id);

        if (!data) {
            return res.status(404).render('errors/404', { 
                title: 'Tweet Not Found',
                message: 'This tweet may have been deleted or never existed.' 
            });
        }

        const { replies, ...tweet } = data;

        res.render('tweet', {
            title: `Post by @${tweet.username}`,
            tweet,
            replies,
            user,
            isLoggedIn: true
        });

    } catch (err) {
        console.error('Tweet detail error:', err);
        res.status(500).render('errors/500', { 
            title: 'Server Error',
            error: 'Could not load tweet'
        });
    }
};