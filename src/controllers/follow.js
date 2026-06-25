// importing the follows db from the models

import { followUser, unfollowUser, getFollowing, getFollowers } from '../models/follow.js';

export const followUserController = async (req, res) => {

    try {
        const followerId = req.session.user.users_id;
        const { followeeId } = req.body;

        const result = await followUser(followerId, followeeId);

        return res.json({
            success: true,
            ...result
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false });
    }
};

export const unfollowUserController = async (req, res) => {
    try {
        const followerId = req.session.user.users_id;
        const { followeeId } = req.body;

        const result = await unfollowUser(followerId, followeeId);

        return res.json({
            success: true,
            ...result
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false });
    }
};

export const getFollowingController = async (req, res) => {
    try {
        const userId = req.params.userId || req.session.user.users_id;
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
        const userId = req.params.userId || req.session.user.users_id;
        const { limit = 50 } = req.query;

        const followers = await getFollowers(userId, parseInt(limit));
        res.json(followers);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching followers" });
    }
};