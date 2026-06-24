// import the tweets model db handler

import { createTweetWithExtras } from '../models/tweetService.js';
import { getTweetById, getUserTweets, getHomeFeed, deleteTweet } from '../models/tweets.js';

export const createTweetController = async (req, res) => {
    try {
        const { content, mediaUrls, isReplyTo } = req.body;
        
        // FIXED: Use session instead of req.user
        if (!req.session?.user) {
            return res.status(401).json({ message: "Unauthorized - Please log in" });
        }
        
        const userId = req.session.user.users_id;

        if (!content || content.trim() === '') {
            return res.status(400).json({ message: "Content is required" });
        }

        const tweet = await createTweetWithExtras(userId, content, mediaUrls, isReplyTo);
        
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