
import { body, validationResult } from 'express-validator';

import { getUserProfile, updateUserProfile } from '../models/users.js';

import { getUserTweets } from '../models/tweets.js';

import { getFollowing, getFollowers } from '../models/follow.js';

import { upload } from '../middleware/upload.js';

export const profileValidation = [

    body('fullName')
        .trim()
        .optional()
        .isLength({ max: 100 }).withMessage('Full name cannot exceed 100 characters'),

    body('displayName')
        .trim()
        .optional()
        .isLength({ max: 100 }).withMessage('Display name cannot exceed 100 characters'),

    body('bio')
        .trim()
        .optional()
        .isLength({ max: 500 }).withMessage('Bio cannot exceed 500 characters')
    
];

// Show Profile Page
export const showProfile = async (req, res) => {
  try {
    const username = req.params.username || req.session?.user?.username;

    if (!username) {
      return res.redirect('/login');
    }

    // ✅ ADD THIS
    const viewerId = req.session?.user?.users_id || null;

    // ✅ PASS viewerId
    const profile = await getUserProfile(username, viewerId);

    if (!profile) {
      return res.status(404).send("User not found");
    }

    const isOwner = req.session?.user?.users_id === profile.users_id;

    const userTweets = await getUserTweets(profile.users_id, 10, 0);

    res.render('profile', {
      title: `${profile.display_name || profile.username}'s Profile`,
      profile,
      userTweets,
      isOwner,
      user: req.session?.user || null,
      isLoggedIn: !!req.session?.user
    });

  } catch (error) {
    console.error('PROFILE LOAD ERROR:', error);
    res.status(500).send("Profile error");
  }
};

// Update Profile
export const updateProfile = async (req, res) => {

    if (!req.session.user) {

        return res.redirect('/login');

    }

    const errors = validationResult(req);

    if (!errors.isEmpty()) {

        errors.array().forEach(err => req.flash('error', err.msg));

        return res.redirect(`/profile/${req.session.user.username}`);

    }

    let profilePictureUrl = null;

    let removePhoto = req.body.removeProfilePicture === 'true';

    try {

        if (req.file) {

            profilePictureUrl = `/uploads/profile/${req.file.filename}`;

        } else if (removePhoto) {

            profilePictureUrl = null; // or default avatar path

        }

        const updatedUser = await updateUserProfile(

            req.session.user.users_id,

            req.body.fullName || null,

            req.body.displayName || null,

            req.body.bio || null,

            profilePictureUrl

        );

        req.flash('success', 'Profile updated successfully!');
        
        res.redirect(`/profile/${req.session.user.username}`);
        
    } catch (error) {
        
        console.error('Update profile error:', error);
        
        req.flash('error', `Failed to update profile: ${error.message}`);
        
        res.redirect(`/profile/${req.session.user.username}`);
        
    }

};

// ==================== FOLLOWERS PAGE ====================
export const showFollowers = async (req, res) => {
    try {
        const { username } = req.params;
        const viewerId = req.session?.user?.users_id || null;

        const profile = await getUserProfile(username, viewerId);
        if (!profile) {
            return res.status(404).send("User not found");
        }

        const followersList = await getFollowers(profile.users_id, 30, 0, viewerId);

        res.render('followers', {
            title: `Followers of @${username}`,
            profile,
            users: followersList,
            isOwner: req.session?.user?.users_id === profile.users_id,
            user: req.session?.user || null,
            isLoggedIn: !!req.session?.user,
            page: 'followers'
        });

    } catch (error) {
        console.error('Followers page error:', error);
        res.status(500).send("Server error");
    }
};

// ==================== FOLLOWING PAGE ====================
export const showFollowing = async (req, res) => {
    try {
        const { username } = req.params;
        const viewerId = req.session?.user?.users_id || null;

        const profile = await getUserProfile(username, viewerId);
        if (!profile) {
            return res.status(404).send("User not found");
        }

        const followingList = await getFollowing(profile.users_id, 30, 0, viewerId);

        res.render('following', {
            title: `Following by @${username}`,
            profile,
            users: followingList,
            isOwner: req.session?.user?.users_id === profile.users_id,
            user: req.session?.user || null,
            isLoggedIn: !!req.session?.user,
            page: 'following'
        });

    } catch (error) {
        console.error('Following page error:', error);
        res.status(500).send("Server error");
    }
};