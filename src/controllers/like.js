// importing the like functions from the like models

import { likeTweet, unlikeTweet } from '../models/like.js';

export const likeTweetController = async (req, res) => {
    try {
        const userId = req.user.users_id;
        const { tweetId } = req.body;

        if (!tweetId) {
            return res.status(400).json({ message: "tweetId is required" });
        }

        const result = await likeTweet(userId, tweetId);

        if (!result) {
            return res.status(400).json({ message: "Already liked" });
        }

        res.status(201).json({ message: "Tweet liked successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error liking tweet" });
    }
};

export const unlikeTweetController = async (req, res) => {
    try {
        const userId = req.user.users_id;
        const { tweetId } = req.body;

        const result = await unlikeTweet(userId, tweetId);

        if (!result) {
            return res.status(400).json({ message: "Like not found" });
        }

        res.json({ message: "Tweet unliked successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error unliking tweet" });
    }
};