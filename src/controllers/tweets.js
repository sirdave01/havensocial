// import the tweets model db handler

import { createTweetWithExtras } from '../models/tweetService.js';
import { getTweetById, getUserTweets, getHomeFeed, deleteTweet, updateTweet } from '../models/tweets.js';
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

        const result = await deleteTweet(tweetId, userId);

        if (!result) {
            return res.status(404).json({ message: "Tweet not found or unauthorized" });
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