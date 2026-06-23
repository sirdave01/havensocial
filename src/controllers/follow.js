// importing the follows db from the models

import { followUser, unfollowUser, getFollowing, getFollowers } from '../models/follow.js';

export const followUserController = async (req, res) => {
    try {
        const followerId = req.user.users_id;
        const { followeeId } = req.body;

        if (!followeeId) {
            return res.status(400).json({ message: "followeeId is required" });
        }

        const result = await followUser(followerId, followeeId);

        if (!result) {
            return res.status(400).json({ message: "Already following or invalid user" });
        }

        res.status(201).json({ message: "Followed successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error following user" });
    }
};

export const unfollowUserController = async (req, res) => {
    try {
        const followerId = req.user.users_id;
        const { followeeId } = req.body;

        const result = await unfollowUser(followerId, followeeId);

        if (!result) {
            return res.status(400).json({ message: "Not following this user" });
        }

        res.json({ message: "Unfollowed successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error unfollowing user" });
    }
};

export const getFollowingController = async (req, res) => {
    try {
        const userId = req.params.userId || req.user.users_id;
        const { limit = 50 } = req.query;

        const following = await getFollowing(userId, parseInt(limit));
        res.json(following);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching following" });
    }
};

export const getFollowersController = async (req, res) => {
    try {
        const userId = req.params.userId || req.user.users_id;
        const { limit = 50 } = req.query;

        const followers = await getFollowers(userId, parseInt(limit));
        res.json(followers);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching followers" });
    }
};